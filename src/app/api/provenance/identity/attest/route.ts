import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";
import { launchDigest } from "@/lib/pq/messages";
import { verify, type PqPublicKey, type PqSignature } from "@/lib/pq/xmss";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isHex32(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, error: "Sign in before submitting a launch attestation." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ valid: false, error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!isRecord(body) || typeof body.mint !== "string" || !isRecord(body.signature)) {
    return NextResponse.json({ valid: false, error: "mint and signature are required." }, { status: 400 });
  }

  const signature = body.signature;
  if (!Number.isInteger(signature.leaf) || typeof signature.wots !== "string" ||
      signature.wots.length !== 67 * 32 * 2 || !/^(?:[0-9a-f]{2})+$/i.test(signature.wots) ||
      !Array.isArray(signature.auth) || signature.auth.length !== 8 || !signature.auth.every(isHex32)) {
    return NextResponse.json({ valid: false, error: "Malformed WOTS/XMSS signature." }, { status: 400 });
  }

  try {
    const identity = await db.pqIdentity.findUnique({ where: { userId: session.user.id } });
    if (!identity || identity.status !== "ACTIVE") {
      return NextResponse.json({ valid: false, error: "No active PQ identity is registered for this account." }, { status: 409 });
    }
    const reservation = await db.pqLeafUse.findUnique({ where: { mint: body.mint } });
    if (!reservation || reservation.identityId !== identity.id) {
      return NextResponse.json({ valid: false, error: "No reservation for this mint belongs to your PQ identity." }, { status: 404 });
    }
    if (signature.leaf !== reservation.leaf) {
      return NextResponse.json({ valid: false, error: "Signature leaf does not match the reserved one-time leaf." }, { status: 422 });
    }

    let canonicalFields: { mint: string; creator: string; name: string; symbol: string; image: string };
    try {
      canonicalFields = JSON.parse(reservation.canonicalJson);
    } catch {
      return NextResponse.json({ valid: false, error: "Stored canonical metadata is corrupt; the leaf cannot be safely reused." }, { status: 500 });
    }
    const digest = launchDigest({ ...canonicalFields, leaf: reservation.leaf });
    const digestHex = Buffer.from(digest).toString("hex");
    if (digestHex !== reservation.messageDigest) {
      return NextResponse.json({ valid: false, error: "Stored metadata digest does not match this reservation." }, { status: 500 });
    }

    const pqSignature = signature as unknown as PqSignature;
    const publicKey: PqPublicKey = { root: identity.root, pubSeed: identity.pubSeed, height: identity.height };
    const trace = verify(digest, pqSignature, publicKey);
    if (!trace.valid) {
      return NextResponse.json({ valid: false, error: "PQC signature did not verify against the registered identity root.", trace }, { status: 422 });
    }

    const signatureJson = JSON.stringify({ leaf: pqSignature.leaf, wots: pqSignature.wots, auth: pqSignature.auth });
    if (reservation.status === "SIGNED" || reservation.status === "ANCHORED") {
      if (reservation.signatureJson === signatureJson) {
        return NextResponse.json({ valid: true, idempotent: true, status: reservation.status, mint: reservation.mint, leaf: reservation.leaf, digest: digestHex });
      }
      return NextResponse.json({ valid: false, error: "This one-time leaf already has a different accepted signature. Never sign again with this leaf." }, { status: 409 });
    }

    // Conditional update makes signature acceptance single-writer under concurrency.
    const accepted = await db.pqLeafUse.updateMany({
      where: { id: reservation.id, status: "RESERVED", signatureJson: null },
      data: { status: "SIGNED", signatureJson, signedAt: new Date() },
    });
    if (accepted.count !== 1) {
      const latest = await db.pqLeafUse.findUnique({ where: { id: reservation.id } });
      if (latest?.signatureJson === signatureJson && (latest.status === "SIGNED" || latest.status === "ANCHORED")) {
        return NextResponse.json({ valid: true, idempotent: true, status: latest.status, mint: latest.mint, leaf: latest.leaf, digest: digestHex });
      }
      return NextResponse.json({ valid: false, error: "Another signature already consumed this one-time leaf. Never sign again with it." }, { status: 409 });
    }
    return NextResponse.json({
      valid: true,
      status: "SIGNED",
      mint: reservation.mint,
      leaf: reservation.leaf,
      digest: digestHex,
      scheme: "WOTS(w=16,SHA-256)+Merkle",
      anchoredOnChain: false,
      assurance: "The registered PQ identity signed the reserved metadata digest. This endpoint does not prove creator ownership of the Solana mint or on-chain anchoring.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ valid: false, error: "Could not verify or persist the attestation. Confirm the PQ identity migration is applied." }, { status: 503 });
  }
}
