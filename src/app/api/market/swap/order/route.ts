import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { marketProxyRateLimit } from "@/lib/server/market-proxy-rate-limit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";
import { isPumpFunAdapterReady } from "@/lib/marketplace/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_AMOUNT = /^[1-9][0-9]{0,39}$/;

export async function GET(request: NextRequest) {
  if (!isPumpFunAdapterReady() ||
      process.env.NEXT_PUBLIC_SOLANA_CLUSTER !== "mainnet-beta" ||
      process.env.NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING !== "true" ||
      process.env.NEXT_PUBLIC_PUMP_TRADING_VERIFIED !== "true") {
    return NextResponse.json({ error: "Live trading is disabled for this deployment." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in before requesting a swap order." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const rate = marketProxyRateLimit(request, "jupiter-order", 30);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many swap quotes requested. Wait briefly and retry." }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds), "Cache-Control": "no-store" },
    });
  }
  const inputMint = request.nextUrl.searchParams.get("inputMint") || "";
  const outputMint = request.nextUrl.searchParams.get("outputMint") || "";
  const amount = request.nextUrl.searchParams.get("amount") || "";
  const taker = request.nextUrl.searchParams.get("taker") || "";
  const slippageBps = Number(request.nextUrl.searchParams.get("slippageBps") || "100");

  try {
    new PublicKey(inputMint);
    new PublicKey(outputMint);
    new PublicKey(taker);
  } catch {
    return NextResponse.json({ error: "Invalid input mint, output mint, or wallet address." }, { status: 400 });
  }
  const ownedWallet = await db.wallet.findFirst({
    where: { address: taker, userId: session.user.id, verified: true, provider: { in: ["Phantom", "Solflare"] } },
    select: { id: true },
  }).catch(() => null);
  if (!ownedWallet) {
    return NextResponse.json({ error: "The taker wallet must be linked to your account and verified before requesting a swap." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (inputMint === outputMint) {
    return NextResponse.json({ error: "Input and output token must be different." }, { status: 400 });
  }
  if (!VALID_AMOUNT.test(amount)) {
    return NextResponse.json({ error: "Amount must be a positive integer in raw token units." }, { status: 400 });
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 10 || slippageBps > 300) {
    return NextResponse.json({ error: "Slippage must be between 0.10% and 3.00%." }, { status: 400 });
  }

  const apiKey = process.env.JUPITER_API_KEY;
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const url = new URL("https://api.jup.ag/swap/v2/order");
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount);
  url.searchParams.set("taker", taker);
  url.searchParams.set("slippageBps", String(slippageBps));

  try {
    const upstream = await fetch(url.toString(), {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    if (!upstream.ok) {
      const message = typeof payload.error === "string" ? payload.error :
        typeof payload.message === "string" ? payload.message : "Jupiter could not find a viable swap route.";
      return NextResponse.json({ error: message, source: "Jupiter" }, { status: upstream.status === 429 ? 429 : 502, headers: { "Cache-Control": "no-store" } });
    }
    if (typeof payload.transaction !== "string" || typeof payload.requestId !== "string" ||
        typeof payload.inAmount !== "string" || typeof payload.outAmount !== "string") {
      return NextResponse.json({ error: "Jupiter returned an incomplete order. No transaction was created.", source: "Jupiter" }, { status: 502 });
    }
    return NextResponse.json({ ...payload, source: "Jupiter", createdAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "Jupiter order request timed out. Retry before signing."
      : "Could not connect to Jupiter swap routing.";
    return NextResponse.json({ error: message, source: "Jupiter" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
