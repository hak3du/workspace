import { NextRequest, NextResponse } from "next/server";
import { marketProxyRateLimit } from "@/lib/server/market-proxy-rate-limit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isPumpFunAdapterReady } from "@/lib/marketplace/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  if (!isPumpFunAdapterReady() ||
      process.env.NEXT_PUBLIC_SOLANA_CLUSTER !== "mainnet-beta" ||
      process.env.NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING !== "true" ||
      process.env.NEXT_PUBLIC_PUMP_TRADING_VERIFIED !== "true") {
    return NextResponse.json({ error: "Live trading is disabled for this deployment." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in before submitting a swap transaction." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const rate = marketProxyRateLimit(request, "jupiter-execute", 10);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many swap executions requested. Check prior signatures before retrying." }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds), "Cache-Control": "no-store" },
    });
  }
  let body: { signedTransaction?: unknown; requestId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const signedTransaction = body.signedTransaction;
  const requestId = body.requestId;
  if (typeof signedTransaction !== "string" || signedTransaction.length < 80 ||
      signedTransaction.length > 200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(signedTransaction)) {
    return NextResponse.json({ error: "A valid signed transaction in base64 is required." }, { status: 400 });
  }
  if (typeof requestId !== "string" || requestId.length < 8 || requestId.length > 256 || !/^[\x20-\x7E]+$/.test(requestId)) {
    return NextResponse.json({ error: "A valid Jupiter request ID is required." }, { status: 400 });
  }

  const apiKey = process.env.JUPITER_API_KEY;
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  try {
    const upstream = await fetch("https://api.jup.ag/swap/v2/execute", {
      method: "POST",
      headers,
      body: JSON.stringify({ signedTransaction, requestId }),
      cache: "no-store",
      signal: AbortSignal.timeout(35_000),
    });
    const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    if (!upstream.ok) {
      const message = typeof payload.error === "string" ? payload.error :
        typeof payload.message === "string" ? payload.message : "Jupiter could not execute this signed transaction.";
      return NextResponse.json({ error: message, source: "Jupiter", details: payload }, { status: upstream.status === 429 ? 429 : 502, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ...payload, source: "Jupiter", receivedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error && error.name === "TimeoutError"
        ? "Jupiter execution timed out. Check the transaction signature before retrying to avoid submitting twice."
        : "Could not reach Jupiter execution service. Check transaction status before retrying.",
      source: "Jupiter",
      executionUnknown: true,
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
