import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { verify as verifyEd25519 } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";
import { aheIdentityRegistrationMessage } from "@/lib/pq/messages";
import { pqAddress as derivePqAddress, type PqPublicKey } from "@/lib/pq/xmss";

export const dynamic = "force-dynamic";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const HEX_32 = /^[0-9a-f]{64}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Registers a wallet-bound PQ identity. The wallet signs the exact canonical
 * registration statement; no wallet private key or PQ secret seed reaches server.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in before registering a PQ identity." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }

  const wallet = body.walletAddress;
  const root = body.root;
  const pubSeed = body.pubSeed;
  const height = body.height;
  const suppliedPqAddress = body.pqAddress;
  const signatureBase64 = body.walletSignature;

  if (typeof wallet !== "string" || typeof root !== "string" || !HEX_32.test(root) ||
      typeof pubSeed !== "string" || !HEX_32.test(pubSeed) || height !== 8 ||
      typeof suppliedPqAddress !== "string" || suppliedPqAddress.length > 64 ||
      typeof signatureBase64 !== "string" || signatureBase64.length > 256) {
    return NextResponse.json({ error: "Invalid wallet, PQ public key, tree height, or wallet signature." }, { status: 400 });
  }

  let walletKey: PublicKey;
  try {
    walletKey = new PublicKey(wallet);
    if (walletKey.toBase58() !== wallet) throw new Error("Non-canonical wallet address");
  } catch {
    return NextResponse.json({ error: "walletAddress must be a canonical Solana public key." }, { status: 400 });
  }

  const publicKey: PqPublicKey = { root: root.toLowerCase(), pubSeed: pubSeed.toLowerCase(), height: 8 };
  const expectedPqAddress = derivePqAddress(publicKey);
  if (suppliedPqAddress !== expectedPqAddress) {
    return NextResponse.json({ error: "pqAddress does not match the supplied public key." }, { status: 400 });
  }

  const message = aheIdentityRegistrationMessage({
    accountId: session.user.id,
    wallet: walletKey.toBase58(),
    pqAddress: expectedPqAddress,
    root: publicKey.root,
    pubSeed: publicKey.pubSeed,
    height: 8,
  });

  let signature: Buffer;
  try {
    signature = Buffer.from(signatureBase64, "base64");
    if (signature.length !== 64 || signature.toString("base64") !== signatureBase64) {
      throw new Error("Invalid Ed25519 signature encoding");
    }
  } catch {
    return NextResponse.json({ error: "walletSignature must be a 64-byte base64 Ed25519 signature." }, { status: 400 });
  }

  const spki = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(walletKey.toBytes())]);
  let validWalletSignature = false;
  try {
    validWalletSignature = verifyEd25519(
      null,
      Buffer.from(message, "utf8"),
      { key: spki, format: "der", type: "spki" },
      signature,
    );
  } catch {
    validWalletSignature = false;
  }
  if (!validWalletSignature) {
    return NextResponse.json({ error: "Wallet signature did not authenticate the canonical registration statement." }, { status: 422 });
  }

  try {
    const existing = await db.pqIdentity.findUnique({ where: { userId: session.user.id } });
    if (existing) {
      const sameIdentity = existing.walletAddress === walletKey.toBase58() &&
        existing.pqAddress === expectedPqAddress &&
        existing.root === publicKey.root &&
        existing.pubSeed === publicKey.pubSeed;
      if (!sameIdentity) {
        return NextResponse.json({ error: "This account already has a different PQ identity. Use a separately reviewed key-rotation flow." }, { status: 409 });
      }
      return NextResponse.json({ registered: true, identity: existing, idempotent: true });
    }

    const identity = await db.pqIdentity.create({
      data: {
        userId: session.user.id,
        walletAddress: walletKey.toBase58(),
        pqAddress: expectedPqAddress,
        root: publicKey.root,
        pubSeed: publicKey.pubSeed,
        height: 8,
        scheme: "WOTS(w=16,SHA-256)+Merkle",
        status: "ACTIVE",
      },
    });
    return NextResponse.json({ registered: true, identity }, { status: 201 });
  } catch {
    return NextResponse.json({
      error: "Could not persist the PQ identity. Ensure the database migration for PqIdentity has been applied.",
    }, { status: 503 });
  }
}
