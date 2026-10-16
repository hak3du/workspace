import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";
import { PublicKey } from "@solana/web3.js";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in before linking a wallet." }, { status: 401 });
  }
  if (!process.env.NEXTAUTH_URL) {
    return NextResponse.json({ error: "NEXTAUTH_URL must be configured before wallet verification." }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).address !== "string") {
    return NextResponse.json({ error: "A wallet address is required." }, { status: 400 });
  }

  const address = (body as { address: string }).address;
  try {
    const key = new PublicKey(address);
    if (key.toBase58() !== address) throw new Error("Non-canonical address");
  } catch {
    return NextResponse.json({ error: "Wallet address must be a canonical Solana public key." }, { status: 400 });
  }

  const existing = await db.wallet.findUnique({ where: { address } });
  if (existing && existing.userId !== session.user.id) {
    return NextResponse.json({ error: "This wallet is already linked to another account." }, { status: 409 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
  const nonce = randomBytes(32).toString("base64url");
  const origin = new URL(process.env.NEXTAUTH_URL).origin;
  const message = [
    "AHE Market — Solana Wallet Verification v1",
    "",
    "Sign this message to prove control of this wallet. This is not a transaction and costs no SOL.",
    "Never sign this message on a different website.",
    "",
    `Wallet: ${address}`,
    `Account: ${session.user.id}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt.toISOString()}`,
    `Origin: ${origin}`,
  ].join("\n");

  try {
    await db.walletChallenge.deleteMany({ where: { userId: session.user.id, expiresAt: { lt: now } } });
    await db.walletChallenge.create({
      data: { userId: session.user.id, address, nonce, message, expiresAt },
    });
    return NextResponse.json({ address, nonce, message, expiresAt: expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not persist wallet challenge. Verify database availability and migrations." }, { status: 503 });
  }
}
