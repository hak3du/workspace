import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Connection, PublicKey } from "@solana/web3.js";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validSignature(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(value);
}

/**
 * Records confirmed payout evidence only. It never initiates transfers and
 * never guesses a creator/platform fee split. A configured Pump program and an
 * anchored creator attestation are required, and all amounts are exact lamports.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in with an authorized operator account." }, { status: 401 });
  }
  const operator = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (operator?.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an authorized marketplace operator may reconcile fee evidence." }, { status: 403 });
  }
  if (!process.env.SOLANA_RPC_URL || !process.env.AHE_PLATFORM_FEE_WALLET || !process.env.AHE_SUPPORTED_FEE_PROGRAM_IDS) {
    return NextResponse.json({
      error: "Configure SOLANA_RPC_URL, AHE_PLATFORM_FEE_WALLET, and verified AHE_SUPPORTED_FEE_PROGRAM_IDS before reconciling payouts.",
    }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!isRecord(body) || typeof body.mint !== "string" || typeof body.transactionSignature !== "string" ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.mint) || !validSignature(body.transactionSignature)) {
    return NextResponse.json({ error: "A canonical Solana mint and transaction signature are required." }, { status: 400 });
  }

  let platformWallet: PublicKey;
  let supportedPrograms: string[];
  try {
    platformWallet = new PublicKey(process.env.AHE_PLATFORM_FEE_WALLET);
    supportedPrograms = process.env.AHE_SUPPORTED_FEE_PROGRAM_IDS.split(",").map((value) => new PublicKey(value.trim()).toBase58());
    if (!supportedPrograms.length) throw new Error("No supported programs");
  } catch {
    return NextResponse.json({ error: "Platform wallet or supported Pump program configuration is invalid." }, { status: 503 });
  }

  try {
    const prior = await db.creatorFeeSettlement.findUnique({ where: { txSignature: body.transactionSignature } });
    if (prior) {
      if (prior.tokenMint !== body.mint) {
        return NextResponse.json({ error: "This transaction signature is already recorded against a different mint." }, { status: 409 });
      }
      return NextResponse.json({ observed: true, idempotent: true, settlement: prior });
    }

    const attestation = await db.pqLeafUse.findUnique({
      where: { mint: body.mint },
      include: { identity: true },
    });
    if (!attestation || attestation.status !== "ANCHORED" || !attestation.identity) {
      return NextResponse.json({ error: "An anchored PQ launch attestation is required before attributing creator payouts." }, { status: 409 });
    }
    const creatorWallet = new PublicKey(attestation.identity.walletAddress);
    if (creatorWallet.equals(platformWallet)) {
      return NextResponse.json({ error: "Creator and platform fee destinations must be different wallets." }, { status: 409 });
    }

    const connection = new Connection(process.env.SOLANA_RPC_URL, "finalized");
    const tx = await connection.getParsedTransaction(body.transactionSignature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || !tx.meta || tx.meta.err) {
      return NextResponse.json({ error: "Transaction is not successfully finalized on Solana." }, { status: 422 });
    }

    const keys = tx.transaction.message.accountKeys;
    const addresses = keys.map((key) => key.pubkey.toBase58());
    if (!addresses.includes(body.mint)) {
      return NextResponse.json({ error: "Transaction does not reference the attested token mint." }, { status: 422 });
    }
    if (!addresses.some((address) => supportedPrograms.includes(address))) {
      return NextResponse.json({ error: "Transaction does not reference a configured, verified Pump fee program." }, { status: 422 });
    }

    const creatorIndex = addresses.indexOf(creatorWallet.toBase58());
    const platformIndex = addresses.indexOf(platformWallet.toBase58());
    if (creatorIndex < 0 || platformIndex < 0) {
      return NextResponse.json({ error: "Transaction must include both the attested creator and configured platform destination." }, { status: 422 });
    }

    const pre = tx.meta.preBalances;
    const post = tx.meta.postBalances;
    const creatorDelta = post[creatorIndex] - pre[creatorIndex];
    const platformDelta = post[platformIndex] - pre[platformIndex];
    const total = creatorDelta + platformDelta;
    if (![creatorDelta, platformDelta, total].every(Number.isSafeInteger) ||
        creatorDelta <= 0 || platformDelta <= 0 || total <= 0) {
      return NextResponse.json({ error: "Transaction does not show positive, safely measurable SOL balance deltas for both destinations." }, { status: 422 });
    }

    const settlement = await db.creatorFeeSettlement.create({
      data: {
        txSignature: body.transactionSignature,
        tokenMint: body.mint,
        creatorWallet: creatorWallet.toBase58(),
        platformWallet: platformWallet.toBase58(),
        totalObservedLamports: BigInt(total),
        creatorLamports: BigInt(creatorDelta),
        platformLamports: BigInt(platformDelta),
        status: "OBSERVED",
        slot: BigInt(tx.slot),
        blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
      },
    });

    return NextResponse.json({
      observed: true,
      settlement,
      note: "Amounts are observed net wallet balance increases in a finalized transaction. This is evidence for manual reconciliation, not proof by itself that every lamport originated from Pump creator fees, and it does not initiate settlement.",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not reconcile payout evidence. Check database migration, RPC response, and operator configuration." }, { status: 503 });
  }
}
