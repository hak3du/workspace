import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ anchored: false, error: "Sign in before verifying an on-chain anchor." }, { status: 401 });
  }
  if (!process.env.SOLANA_RPC_URL) {
    return NextResponse.json({ anchored: false, error: "SOLANA_RPC_URL is required to verify an on-chain anchor." }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ anchored: false, error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ anchored: false, error: "A JSON object is required." }, { status: 400 });
  }
  const { mint, transactionSignature } = body as Record<string, unknown>;
  if (typeof mint !== "string" || typeof transactionSignature !== "string" ||
      transactionSignature.length < 80 || transactionSignature.length > 100) {
    return NextResponse.json({ anchored: false, error: "Mint and transactionSignature are required." }, { status: 400 });
  }

  try {
    const identity = await db.pqIdentity.findUnique({ where: { userId: session.user.id } });
    if (!identity || identity.status !== "ACTIVE") {
      return NextResponse.json({ anchored: false, error: "No active PQ identity is registered for this account." }, { status: 409 });
    }
    const reservation = await db.pqLeafUse.findUnique({ where: { mint } });
    if (!reservation || reservation.identityId !== identity.id || reservation.status !== "SIGNED") {
      return NextResponse.json({ anchored: false, error: "A verified signed attestation is required before anchoring." }, { status: 409 });
    }

    const expectedMemo = `pqc.market:v1:launch:${reservation.mint}:${reservation.messageDigest}:${reservation.leaf}`;
    const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
    const tx = await connection.getTransaction(transactionSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err) {
      return NextResponse.json({ anchored: false, error: "Anchor transaction is missing or failed on Solana." }, { status: 422 });
    }

    const message = tx.transaction.message;
    const accountKeys = message.accountKeys.map((key) => key.toBase58());
    if (!accountKeys.includes(identity.walletAddress)) {
      return NextResponse.json({ anchored: false, error: "Anchor transaction was not signed by the registered wallet." }, { status: 422 });
    }

    const memoFound = message.instructions.some((instruction) => {
      const programId = accountKeys[instruction.programIdIndex];
      if (programId !== MEMO_PROGRAM) return false;
      try {
        return Buffer.from(bs58.decode(instruction.data)).toString("utf8") === expectedMemo;
      } catch {
        return false;
      }
    });
    if (!memoFound) {
      return NextResponse.json({ anchored: false, error: "Confirmed transaction does not contain the exact expected PQC launch memo." }, { status: 422 });
    }

    const changed = await db.pqLeafUse.updateMany({
      where: { id: reservation.id, status: "SIGNED" },
      data: { status: "ANCHORED", anchoredAt: new Date() },
    });
    if (changed.count !== 1) {
      const latest = await db.pqLeafUse.findUnique({ where: { id: reservation.id } });
      if (latest?.status !== "ANCHORED") {
        return NextResponse.json({ anchored: false, error: "Reservation state changed during anchor verification." }, { status: 409 });
      }
    }

    return NextResponse.json({
      anchored: true,
      mint,
      leaf: reservation.leaf,
      digest: reservation.messageDigest,
      transactionSignature,
      slot: tx.slot,
      blockTime: tx.blockTime,
      commitment: "confirmed",
      note: "The memo proves that the registered wallet anchored this digest in a confirmed Solana transaction. It does not prove that the metadata matches a token's on-chain creator field.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ anchored: false, error: "Could not verify or persist the anchor. Check RPC availability and apply the PQ identity migration." }, { status: 503 });
  }
}
