import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PqcLaunch = {
  mint?: string;
  name?: string;
  symbol?: string;
  description?: string | null;
  image_url?: string | null;
  created_at?: string | null;
  launched_at?: string | null;
};

type PqcMarketStats = {
  marketCap?: number | null;
  curve?: { complete?: boolean | null } | null;
};

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  const upstreamUrl = new URL("https://pqc.market/api/launches");
  upstreamUrl.searchParams.set("offset", "0");
  if (query) upstreamUrl.searchParams.set("q", query);

  try {
    const response = await fetch(upstreamUrl.toString(), {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => ({})) as { launches?: PqcLaunch[]; error?: string };
    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error || "PQC Market listings are temporarily unavailable.", coins: [], query, source: "pqc.market" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const launches = Array.isArray(payload.launches) ? payload.launches : [];
    const mints = launches
      .map((coin) => coin.mint || "")
      .filter((mint) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))
      .slice(0, 48);

    let stats: Record<string, PqcMarketStats> = {};
    if (mints.length) {
      try {
        const marketResponse = await fetch(
          "https://pqc.market/api/market?mints=" + encodeURIComponent(mints.join(",")),
          { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) },
        );
        if (marketResponse.ok) {
          const marketPayload = await marketResponse.json() as { tokens?: Record<string, PqcMarketStats> };
          stats = marketPayload.tokens || {};
        }
      } catch {
        // Listing remains useful when the optional live market snapshot is busy.
      }
    }

    const coins = launches
      .filter((coin): coin is PqcLaunch & { mint: string } => Boolean(coin.mint && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(coin.mint)))
      .slice(0, 48)
      .map((coin) => ({
        mint: coin.mint,
        name: coin.name || "Unnamed token",
        symbol: coin.symbol || "TOKEN",
        description: coin.description || "",
        imageUrl: coin.image_url || null,
        marketCapUsd: stats[coin.mint]?.marketCap ?? null,
        createdAt: coin.launched_at || coin.created_at
          ? Math.floor(new Date(coin.launched_at || coin.created_at || "").getTime())
          : null,
        complete: Boolean(stats[coin.mint]?.curve?.complete),
        graduated: Boolean(stats[coin.mint]?.curve?.complete),
        source: "PQC Market",
      }));

    return NextResponse.json(
      { coins, query, source: "pqc.market", fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error && error.name === "TimeoutError"
          ? "PQC Market discovery timed out. Retry shortly."
          : "Could not connect to the PQC Market discovery service.",
        coins: [],
        query,
        source: "pqc.market",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
