import { NextRequest, NextResponse } from "next/server";
import { launchDigest } from "@/lib/pq/messages";
import { verify, type PqPublicKey, type PqSignature } from "@/lib/pq/xmss";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHex32(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

/**
 * Verifies a PQC Market-compatible WOTS/XMSS launch attestation.
 * This endpoint verifies public evidence only; it does not create identities,
 * allocate one-time leaves, sign launches, or claim that a token is PQ-secured.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ valid: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isRecord(body) || !isRecord(body.signature) || !isRecord(body.publicKey)) {
    return NextResponse.json({ valid: false, error: "signature and publicKey objects are required." }, { status: 400 });
  }

  const { mint, creator, name, symbol, image } = body;
  const signature = body.signature;
  const publicKey = body.publicKey;

  if (![mint, creator, name, symbol, image].every((v) => typeof v === "string" && v.length > 0 && v.length <= 2048)) {
    return NextResponse.json({ valid: false, error: "mint, creator, name, symbol, and image must be non-empty strings within size limits." }, { status: 400 });
  }
  if (!Number.isInteger(signature.leaf) || (signature.leaf as number) < 0 || (signature.leaf as number) > 255) {
    return NextResponse.json({ valid: false, error: "signature.leaf must be an integer from 0 to 255." }, { status: 400 });
  }
  if (typeof signature.wots !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(signature.wots) || signature.wots.length > 5000 ||
      !Array.isArray(signature.auth) || signature.auth.length !== 8 || !signature.auth.every(isHex32) ||
      !isHex32(publicKey.root) || !isHex32(publicKey.pubSeed) || publicKey.height !== 8) {
    return NextResponse.json({ valid: false, error: "Malformed WOTS/XMSS signature or public key." }, { status: 400 });
  }

  try {
    const digest = launchDigest({
      mint: mint as string,
      creator: creator as string,
      name: name as string,
      symbol: symbol as string,
      image: image as string,
      leaf: signature.leaf as number,
    });
    const trace = verify(digest, signature as unknown as PqSignature, publicKey as unknown as PqPublicKey);
    return NextResponse.json({
      valid: trace.valid === true,
      scheme: "WOTS(w=16,SHA-256)+Merkle",
      digest: Buffer.from(digest).toString("hex"),
      trace,
      assurance: "Launch provenance only; this does not make ordinary Solana funds quantum-resistant.",
    }, { status: trace.valid === true ? 200 : 422 });
  } catch {
    return NextResponse.json({ valid: false, error: "Attestation verification failed." }, { status: 422 });
  }
}
