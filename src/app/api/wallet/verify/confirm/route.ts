import { NextRequest, NextResponse } from "next/server";
import { verify as verifyEd25519 } from "node:crypto";
import { getServerSession } from "next-auth";
import { PublicKey } from "@solana/web3.js";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ verified: false, error: "Sign in before linking a wallet." }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ verified: false, error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ verified: false, error: "A JSON object is required." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const address = input.address;
  const nonce = input.nonce;
  const signatureBase64 = input.signature;
  const provider = input.provider === "Solflare" ? "Solflare" : "Phantom";
  if (typeof address !== "string" || typeof nonce !== "string" || nonce.length > 128 ||
      typeof signatureBase64 !== "string" || signatureBase64.length > 256) {
    return NextResponse.json({ verified: false, error: "Address, nonce, and base64 signature are required." }, { status: 400 });
  }

  let walletKey: PublicKey;
  let signature: Buffer;
  try {
    walletKey = new PublicKey(address);
    if (walletKey.toBase58() !== address) throw new Error("Non-canonical wallet");
    signature = Buffer.from(signatureBase64, "base64");
    if (signature.length !== 64 || signature.toString("base64") !== signatureBase64) throw new Error("Invalid signature encoding");
  } catch {
    return NextResponse.json({ verified: false, error: "Invalid wallet address or 64-byte base64 signature." }, { status: 400 });
  }

  const now = new Date();
  const challenge = await db.walletChallenge.findFirst({
    where: { userId: session.user.id, address, nonce, usedAt: null, expiresAt: { gt: now } },
  });
  if (!challenge) {
    return NextResponse.json({ verified: false, error: "Wallet challenge is missing, expired, or already used. Request a new challenge." }, { status: 409 });
  }

  let valid = false;
  try {
    valid = verifyEd25519(
      null,
      Buffer.from(challenge.message, "utf8"),
      { key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(walletKey.toBytes())]), format: "der", type: "spki" },
      signature,
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ verified: false, error: "Signature does not prove control of the requested wallet." }, { status: 422 });
  }

  try {
    const wallet = await db.$transaction(async (tx) => {
      const existing = await tx.wallet.findUnique({ where: { address } });
      if (existing && existing.userId !== session.user.id) throw new Error("WALLET_ALREADY_LINKED");
      const consumed = await tx.walletChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new Error("CHALLENGE_ALREADY_USED");
      return tx.wallet.upsert({
        where: { address },
        update: { provider, verified: true },
        create: { userId: session.user.id, address, provider, verified: true },
      });
    });
    return NextResponse.json({
      verified: true,
      wallet: { address: wallet.address, provider: wallet.provider, verified: wallet.verified },
      message: "Wallet ownership verified by an expiring, single-use Ed25519 signature challenge.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "WALLET_ALREADY_LINKED") {
      return NextResponse.json({ verified: false, error: "This wallet is already linked to another account." }, { status: 409 });
    }
    if (message === "CHALLENGE_ALREADY_USED") {
      return NextResponse.json({ verified: false, error: "This challenge has already been consumed. Request a new challenge." }, { status: 409 });
    }
    return NextResponse.json({ verified: false, error: "Could not persist verified wallet state. Check database availability and migrations." }, { status: 503 });
  }
}
