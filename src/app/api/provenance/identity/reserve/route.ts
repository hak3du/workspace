import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Connection, PublicKey } from "@solana/web3.js";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";
import { launchDigest } from "@/lib/pq/messages";

export const dynamic = "force-dynamic";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Atomically reserves a never-before-used WOTS/XMSS leaf for a real SPL mint.
 * The unique (identityId, leaf), mint, and digest constraints are the final
 * concurrency/replay guard. Reserved leaves are burned if the client abandons
 * the launch; they must never be reassigned.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in before reserving an attestation leaf." }, { status: 401 });
  }
  if (!process.env.SOLANA_RPC_URL) {
    return NextResponse.json({ error: "SOLANA_RPC_URL is required to verify a real mint before reserving a leaf." }, { status: 503 });
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

  const mint = body.mint;
  const name = body.name;
  const symbol = body.symbol;
  const image = body.image;
  if (typeof mint !== "string" || !MINT_RE.test(mint) ||
      typeof name !== "string" || !name.trim() || name.length > 128 ||
      typeof symbol !== "string" || !symbol.trim() || symbol.length > 32 ||
      typeof image !== "string" || image.length > 2048) {
    return NextResponse.json({ error: "Mint, name, symbol, or image is invalid." }, { status: 400 });
  }
  try {
    const imageUrl = new URL(image);
    if (imageUrl.protocol !== "https:") throw new Error("HTTPS required");
  } catch {
    return NextResponse.json({ error: "Image metadata must use a valid HTTPS URL." }, { status: 400 });
  }

  let mintKey: PublicKey;
  try {
    mintKey = new PublicKey(mint);
    if (mintKey.toBase58() !== mint) throw new Error("Non-canonical mint");
  } catch {
    return NextResponse.json({ error: "Mint must be a canonical Solana public key." }, { status: 400 });
  }

  let accountInfo;
  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
    accountInfo = await connection.getAccountInfo(mintKey, "confirmed");
  } catch {
    return NextResponse.json({ error: "Could not verify the mint against Solana RPC." }, { status: 502 });
  }
  if (!accountInfo || ![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(accountInfo.owner.toBase58())) {
    return NextResponse.json({ error: "The supplied address is not an existing SPL Token or Token-2022 mint account." }, { status: 422 });
  }

  try {
    const identity = await db.pqIdentity.findUnique({
      where: { userId: session.user.id },
      include: { leaves: { select: { leaf: true } } },
    });
    if (!identity || identity.status !== "ACTIVE") {
      return NextResponse.json({ error: "Register an active wallet-bound PQ identity first." }, { status: 409 });
    }
    const used = new Set(identity.leaves.map((entry) => entry.leaf));
    let leaf = -1;
    for (let candidate = 0; candidate < 1 << identity.height; candidate++) {
      if (!used.has(candidate)) { leaf = candidate; break; }
    }
    if (leaf < 0) {
      return NextResponse.json({ error: "This PQ identity has exhausted its one-time signing leaves. Rotate the identity through a reviewed recovery flow." }, { status: 409 });
    }

    const digest = launchDigest({
      mint,
      creator: identity.walletAddress,
      name: name.trim(),
      symbol: symbol.trim(),
      image,
      leaf,
    });
    const messageDigest = Buffer.from(digest).toString("hex");
    const reservation = await db.pqLeafUse.create({
      data: {
        identityId: identity.id,
        leaf,
        messageDigest,
        mint,
        status: "RESERVED",
      },
    });
    return NextResponse.json({
      reserved: true,
      reservationId: reservation.id,
      mint,
      leaf,
      messageDigest,
      publicKey: { root: identity.root, pubSeed: identity.pubSeed, height: identity.height },
      creator: identity.walletAddress,
      canonicalFields: { mint, creator: identity.walletAddress, name: name.trim(), symbol: symbol.trim(), image },
      note: "This leaf is permanently consumed by reservation. Never reuse it, including after client failure.",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      error: "Could not reserve a one-time leaf. A concurrent reservation may have won; retry with the same mint only after checking whether a reservation already exists.",
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
}
