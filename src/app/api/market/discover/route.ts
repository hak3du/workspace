import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PumpCoin = {
  mint?: string;
  address?: string;
  name?: string;
  symbol?: string;
  description?: string;
  image_uri?: string;
  imageUri?: string;
  usd_market_cap?: number;
  market_cap?: number;
  marketCap?: number;
  virtual_sol_reserves?: number;
  complete?: boolean;
  created_timestamp?: number;
  raydium_pool?: string | null;
};

function normalize(payload: unknown): PumpCoin[] {
  if (Array.isArray(payload)) return payload as PumpCoin[];
  if (!payload || typeof payload !== "object") return [];
  const value = payload as { coins?: unknown; data?: unknown; results?: unknown };
  for (const candidate of [value.coins, value.data, value.results]) {
    if (Array.isArray(candidate)) return candidate as PumpCoin[];
  }
  return [];
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  const limit = query ? 30 : 24;
  const params = new URLSearchParams({
    offset: "0",
    limit: String(limit),
    sort: query ? "market_cap" : "created_timestamp",
    order: "DESC",
    includeNsfw: "false",
    searchTerm: query,
    creator: "",
    complete: "false",
    meta: "",
    type: "fuzzy",
  });

  const endpoints = query
    ? ["https://frontend-api-v3.pump.fun/coins/search?" + params.toString()]
    : [
        "https://frontend-api-v3.pump.fun/coins/featured/1h?limit=24&offset=0&includeNsfw=false",
        "https://frontend-api-v3.pump.fun/coins/latest",
        "https://frontend-api-v3.pump.fun/coins?" + params.toString(),
      ];

  let lastStatus = 502;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        lastStatus = response.status;
        continue;
      }
      const coins = normalize(await response.json())
        .map((coin) => ({
          mint: coin.mint || coin.address || "",
          name: coin.name || "Unnamed token",
          symbol: coin.symbol || "TOKEN",
          description: coin.description || "",
          imageUrl: coin.image_uri || coin.imageUri || null,
          marketCapUsd: Number.isFinite(coin.usd_market_cap)
            ? coin.usd_market_cap
            : Number.isFinite(coin.market_cap)
              ? coin.market_cap
              : Number.isFinite(coin.marketCap)
                ? coin.marketCap
                : null,
          createdAt: coin.created_timestamp ?? null,
          complete: coin.complete ?? false,
          graduated: Boolean(coin.complete || coin.raydium_pool),
          source: "Pump.fun",
        }))
        .filter((coin) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(coin.mint))
        .slice(0, limit);

      if (coins.length || query) {
        return NextResponse.json(
          { coins, query, source: "Pump.fun", fetchedAt: new Date().toISOString() },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    } catch {
      // Try the next public listing endpoint if this one is unavailable.
    }
  }

  return NextResponse.json(
    {
      error: query
        ? "Pump.fun search is temporarily unavailable. Try the full mint address in Load token."
        : "Pump.fun discovery is temporarily unavailable. You can still load a token by mint address.",
      upstreamStatus: lastStatus,
      coins: [],
      query,
    },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}
