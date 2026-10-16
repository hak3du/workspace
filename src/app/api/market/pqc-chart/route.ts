import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_RANGES = new Set(["1H", "1D", "1W", "1M"]);
const VALID_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const GECKO_RANGES: Record<string, { unit: "minute" | "hour"; aggregate: number; limit: number }> = {
  "1H": { unit: "minute", aggregate: 1, limit: 60 },
  "1D": { unit: "minute", aggregate: 15, limit: 96 },
  "1W": { unit: "hour", aggregate: 1, limit: 168 },
  "1M": { unit: "hour", aggregate: 4, limit: 180 },
};

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

// Match PQC Market: cache successful GeckoTerminal series and retain last-good candles
// so provider throttling does not turn an already-rendered chart into an empty graph.
const geckoCandleCache = new Map<string, { expiresAt: number; candles: Candle[]; pairAddress: string; tokenSide: "base" | "quote" }>();
const geckoLastGood = new Map<string, { candles: Candle[]; pairAddress: string; tokenSide: "base" | "quote" }>();

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asTimestamp(value: unknown): number | null {
  if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }
  const numeric = asNumber(value);
  if (numeric === null || numeric <= 0) return null;
  return Math.floor(numeric > 1_000_000_000_000 ? numeric / 1000 : numeric);
}

function normalizeCandle(value: unknown): Candle | null {
  let t: unknown, o: unknown, h: unknown, l: unknown, c: unknown, v: unknown;
  if (Array.isArray(value)) {
    [t, o, h, l, c, v] = value;
  } else if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    t = item.t ?? item.time ?? item.timestamp ?? item.ts ?? item.openTime ?? item.bucket;
    c = item.c ?? item.close ?? item.price ?? item.closePrice;
    o = item.o ?? item.open ?? c;
    h = item.h ?? item.high ?? c;
    l = item.l ?? item.low ?? c;
    v = item.v ?? item.volume ?? item.volumeUsd ?? 0;
  } else {
    return null;
  }
  const timestamp = asTimestamp(t);
  const open = asNumber(o), high = asNumber(h), low = asNumber(l), close = asNumber(c);
  const volume = asNumber(v) ?? 0;
  if (timestamp === null || open === null || high === null || low === null || close === null ||
      open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0 ||
      high < Math.max(open, close, low) || low > Math.min(open, close, high)) return null;
  return { t: timestamp, o: open, h: high, l: low, c: close, v: volume };
}

function extractCandles(payload: Record<string, unknown>): Candle[] {
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : null;
  const candidates = [
    payload.candles, payload.ohlcv, payload.chart,
    data?.candles, data?.ohlcv, data?.chart,
    Array.isArray(payload.data) ? payload.data : null,
  ];
  const source = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!source) return [];
  return source.map(normalizeCandle).filter((item): item is Candle => item !== null).sort((a, b) => a.t - b.t);
}

/**
 * Mirrors PQC Market's chart-source strategy: try its own token API first;
 * if it has no candles, use the token's deepest DexScreener pair with
 * GeckoTerminal OHLCV. This also supports valid Solana tokens that have a
 * market pair but are not present in PQC's own launch database.
 */
async function geckoFallback(mint: string, range: string): Promise<{ candles: Candle[]; pairAddress: string; tokenSide: "base" | "quote" }> {
  const cacheKey = mint + ":" + range;
  const cached = geckoCandleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { candles: cached.candles, pairAddress: cached.pairAddress, tokenSide: cached.tokenSide };
  }
  const lastGood = geckoLastGood.get(cacheKey);
  // PQC Market resolves the actual GeckoTerminal pool and charts that pool.
  // Do the same here: a DexScreener pairAddress is not guaranteed to be a
  // GeckoTerminal pool address, which caused valid tokens to return blank charts.
  type GeckoPool = {
    id?: string;
    attributes?: {
      address?: string;
      reserve_in_usd?: string | number;
      base_token_address?: string;
      quote_token_address?: string;
    };
  };

  let poolAddress = "";
  let tokenSide: "base" | "quote" = "base";
  try {
    const poolsResponse = await fetch(
      "https://api.geckoterminal.com/api/v2/networks/solana/tokens/" +
        encodeURIComponent(mint) + "/pools?page=1",
      { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) },
    );
    if (poolsResponse.ok) {
      const payload = await poolsResponse.json() as { data?: GeckoPool[] };
      const candidates = (payload.data || [])
        .filter((pool) => {
          const base = pool.attributes?.base_token_address?.toLowerCase();
          const quote = pool.attributes?.quote_token_address?.toLowerCase();
          return Boolean(pool.attributes?.address || pool.id) &&
            (base === mint.toLowerCase() || quote === mint.toLowerCase());
        })
        .sort((a, b) =>
          Number(b.attributes?.reserve_in_usd || 0) - Number(a.attributes?.reserve_in_usd || 0),
        );
      const pool = candidates[0];
      if (pool) {
        poolAddress = pool.attributes?.address || pool.id?.replace(/^solana_/, "") || "";
        tokenSide = pool.attributes?.base_token_address?.toLowerCase() === mint.toLowerCase() ? "base" : "quote";
      }
    }
  } catch {
    // Continue to the market-pair lookup; a provider outage should not abort chart recovery.
  }

  // Never treat a DexScreener pair address as a GeckoTerminal pool ID.
  // Those identifiers are not guaranteed to match. If GeckoTerminal cannot
  // resolve a pool, let the caller try Birdeye instead of requesting candles
  // from an unverified address.
  if (!poolAddress) {
    if (lastGood) return lastGood;
    return { candles: [], pairAddress: "", tokenSide: "base" };
  }

  const tf = GECKO_RANGES[range];
  const url = "https://api.geckoterminal.com/api/v2/networks/solana/pools/" +
    encodeURIComponent(poolAddress) + "/ohlcv/" + tf.unit +
    "?aggregate=" + tf.aggregate + "&limit=" + tf.limit + "&currency=usd&token=" + tokenSide;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("GeckoTerminal OHLCV request failed (" + response.status + ").");
  const payload = await response.json() as { data?: { attributes?: { ohlcv_list?: number[][] } } };
  const candles = (payload.data?.attributes?.ohlcv_list || [])
    .map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }))
    .filter((item) => [item.t, item.o, item.h, item.l, item.c, item.v].every(Number.isFinite))
    .reverse();
  if (candles.length) {
    const result = { candles, pairAddress: poolAddress, tokenSide };
    geckoLastGood.set(cacheKey, result);
    geckoCandleCache.set(cacheKey, { ...result, expiresAt: Date.now() + 60_000 });
    if (geckoLastGood.size > 2_000) geckoLastGood.delete(geckoLastGood.keys().next().value!);
    if (geckoCandleCache.size > 2_000) geckoCandleCache.delete(geckoCandleCache.keys().next().value!);
    return result;
  }
  if (lastGood) return lastGood;
  return { candles: [], pairAddress: poolAddress, tokenSide };
}

type BirdeyeCandle = { unix_time: number; o: number; h: number; l: number; c: number; v_usd: number };
const birdeyeCache = new Map<string, { expiresAt: number; candles: Candle[] }>();

/**
 * Final candle fallback, matching PQC Market's own implementation:
 * Birdeye /defi/v3/ohlcv queried by mint address (not pool address).
 * This covers tokens whose pools are not indexed by GeckoTerminal.
 */
async function birdeyeFallback(mint: string, range: string): Promise<Candle[]> {
  const cached = birdeyeCache.get(mint + ":" + range);
  if (cached && cached.expiresAt > Date.now()) return cached.candles;

  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) throw new Error("Birdeye fallback is not configured (BIRDEYE_API_KEY missing).");

  const config: Record<string, { type: "1m" | "15m" | "1H" | "4H"; seconds: number }> = {
    "1H": { type: "1m", seconds: 3_600 },
    "1D": { type: "15m", seconds: 86_400 },
    "1W": { type: "1H", seconds: 7 * 86_400 },
    "1M": { type: "4H", seconds: 30 * 86_400 },
  };
  const { type, seconds } = config[range];
  const to = Math.floor(Date.now() / 1000);
  const url = new URL("https://public-api.birdeye.so/defi/v3/ohlcv");
  url.searchParams.set("address", mint);
  url.searchParams.set("type", type);
  url.searchParams.set("time_from", String(to - seconds));
  url.searchParams.set("time_to", String(to));

  const response = await fetch(url.toString(), {
    headers: { "X-API-KEY": apiKey, "x-chain": "solana", accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Birdeye OHLCV request failed (" + response.status + ").");
  const payload = await response.json() as {
    success?: boolean;
    data?: { items?: BirdeyeCandle[] };
  };
  if (!payload.success || !Array.isArray(payload.data?.items)) {
    throw new Error("Birdeye returned no usable OHLCV payload.");
  }

  const candles = payload.data.items.map((item): Candle | null => {
    const candle = normalizeCandle([item.unix_time, item.o, item.h, item.l, item.c, item.v_usd]);
    return candle && [candle.t, candle.o, candle.h, candle.l, candle.c, candle.v].every(Number.isFinite)
      ? candle
      : null;
  }).filter((item): item is Candle => item !== null).sort((a, b) => a.t - b.t);

  if (!candles.length) throw new Error("Birdeye has no candle history for this mint and timeframe.");
  birdeyeCache.set(mint + ":" + range, { expiresAt: Date.now() + 60_000, candles });
  if (birdeyeCache.size > 500) {
    const oldest = birdeyeCache.keys().next().value;
    if (oldest) birdeyeCache.delete(oldest);
  }
  return candles;
}

export async function GET(request: NextRequest) {
  const mint = (request.nextUrl.searchParams.get("mint") || "").trim();
  const range = (request.nextUrl.searchParams.get("range") || "1D").toUpperCase();
  if (!VALID_MINT.test(mint)) {
    return NextResponse.json({ error: "A valid Solana mint address is required.", candles: [], candlesOk: false }, { status: 400 });
  }
  if (!VALID_RANGES.has(range)) {
    return NextResponse.json({ error: "Unsupported chart range.", candles: [], candlesOk: false }, { status: 400 });
  }

  let pqcError: string | null = null;
  try {
    const upstream = await fetch(
      "https://pqc.market/api/token/" + encodeURIComponent(mint) + "?range=" + encodeURIComponent(range),
      { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    if (upstream.ok) {
      const candles = extractCandles(payload);
      if (candles.length) {
        return NextResponse.json({
          candles, candlesOk: true, overview: payload.overview ?? null,
          launch: payload.launch ?? null, source: "pqc.market",
          fetchedAt: new Date().toISOString(), candleCount: candles.length, warning: null,
        }, { headers: { "Cache-Control": "no-store, max-age=0" } });
      }
      pqcError = "PQC Market returned no recognized candles.";
    } else {
      pqcError = typeof payload.error === "string" ? payload.error : "PQC Market returned HTTP " + upstream.status + ".";
    }
  } catch (error) {
    pqcError = error instanceof Error ? error.message : "PQC Market request failed.";
  }

  let geckoError: string | null = null;
  try {
    const fallback = await geckoFallback(mint, range);
    const candles = fallback.candles;
    if (candles.length) {
      return NextResponse.json({
        candles, candlesOk: true, source: "geckoterminal",
        pairAddress: fallback.pairAddress, tokenSide: fallback.tokenSide,
        fetchedAt: new Date().toISOString(), candleCount: candles.length,
        warning: "PQC Market candles were unavailable; showing GeckoTerminal OHLCV for the deepest indexed Solana pair. The selected pool token side is " + fallback.tokenSide + ".",
      }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    geckoError = "GeckoTerminal returned no candles for this mint and timeframe.";
  } catch (error) {
    geckoError = error instanceof Error ? error.message : "GeckoTerminal fallback failed.";
  }

  try {
    const candles = await birdeyeFallback(mint, range);
    return NextResponse.json({
      candles, candlesOk: true, source: "birdeye",
      fetchedAt: new Date().toISOString(), candleCount: candles.length,
      warning: "PQC Market and GeckoTerminal candles were unavailable; showing Birdeye OHLCV fetched by token mint.",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const birdeyeError = error instanceof Error ? error.message : "Birdeye fallback failed.";
    return NextResponse.json({
      error: "PQC Market, GeckoTerminal, and Birdeye could not provide chart history for this mint and timeframe.",
      upstreamError: pqcError, geckoError, birdeyeError,
      candles: [], candlesOk: false, source: "none", candleCount: 0,
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
