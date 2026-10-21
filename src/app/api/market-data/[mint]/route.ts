import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Pair = {
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
};
type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
const RANGES = {
  "1H": { unit: "minute", aggregate: 1, limit: 60, seconds: 3600 },
  "6H": { unit: "minute", aggregate: 5, limit: 72, seconds: 21600 },
  "24H": { unit: "hour", aggregate: 1, limit: 24, seconds: 86400 },
  "7D": { unit: "hour", aggregate: 4, limit: 42, seconds: 604800 },
} as const;

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    cache: "force-cache",
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function getGeckoCandles(pairAddress: string, range: (typeof RANGES)[keyof typeof RANGES]): Promise<Candle[]> {
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(pairAddress)}/ohlcv/${range.unit}?aggregate=${range.aggregate}&limit=${range.limit}&currency=usd&token=base`;
  const json = await getJson<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(url);
  return (json.data?.attributes?.ohlcv_list ?? [])
    .map(([t,o,h,l,c,v]) => ({ t, o, h, l, c, v }))
    .reverse();
}

async function getBirdeyeCandles(mint: string, range: (typeof RANGES)[keyof typeof RANGES]): Promise<Candle[]> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return [];
  const now = Math.floor(Date.now() / 1000);
  const type = range.aggregate === 1 && range.unit === "minute" ? "1m"
    : range.unit === "minute" ? "5m"
    : range.aggregate === 1 ? "1H" : "4H";
  const url = `https://public-api.birdeye.so/defi/v3/ohlcv?address=${encodeURIComponent(mint)}&type=${type}&time_from=${now-range.seconds}&time_to=${now}`;
  const json = await getJson<{ data?: { items?: { unix_time: number; o: number; h: number; l: number; c: number; v_usd: number }[] } }>(url, { "X-API-KEY": key, "x-chain": "solana" });
  return (json.data?.items ?? []).map(x => ({ t:x.unix_time, o:x.o, h:x.h, l:x.l, c:x.c, v:x.v_usd }));
}

export async function GET(request: NextRequest, context: { params: Promise<{ mint: string }> }) {
  const { mint } = await context.params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
    return NextResponse.json({ error: "A valid Solana mint address is required." }, { status: 400 });
  }
  const rangeKey = request.nextUrl.searchParams.get("range") ?? "24H";
  if (!(rangeKey in RANGES)) return NextResponse.json({ error: "range must be 1H, 6H, 24H, or 7D." }, { status: 400 });
  const range = RANGES[rangeKey as keyof typeof RANGES];

  let pairs: Pair[] = [];
  try {
    pairs = await getJson<Pair[]>(`https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(mint)}`);
  } catch {
    // GeckoTerminal may still have candle data if DexScreener is unavailable.
  }
  const pair = pairs
    .filter(p => p.pairAddress && p.baseToken?.address?.toLowerCase() === mint.toLowerCase())
    .sort((a,b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0] ?? null;

  let candles: Candle[] = [];
  let source = pair ? "DexScreener + GeckoTerminal" : "No indexed pool";
  let warning: string | undefined;
  if (pair?.pairAddress) {
    try {
      candles = await getGeckoCandles(pair.pairAddress, range);
    } catch {
      warning = "GeckoTerminal candles are rate-limited or unavailable; trying the configured Birdeye fallback.";
    }
  }
  if (!candles.length) {
    try {
      candles = await getBirdeyeCandles(mint, range);
      if (candles.length) source = pair ? "DexScreener + Birdeye fallback" : "Birdeye fallback";
    } catch {
      warning = "Candle providers are temporarily unavailable. Market statistics may still be available.";
    }
  }

  const result = {
    source,
    pairAddress: pair?.pairAddress ?? null,
    priceUsd: pair?.priceUsd ? Number(pair.priceUsd) : null,
    marketCap: pair?.marketCap ?? pair?.fdv ?? null,
    liquidityUsd: pair?.liquidity?.usd ?? null,
    volume24h: pair?.volume?.h24 ?? null,
    change24h: pair?.priceChange?.h24 ?? null,
    buys24h: pair?.txns?.h24?.buys ?? null,
    sells24h: pair?.txns?.h24?.sells ?? null,
    candles,
    ...(warning ? { warning } : {}),
  };
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
