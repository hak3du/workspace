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
      open < 0 || high < 0 || low < 0 || close < 0 || volume < 0) return null;
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
/**
 * Optional authenticated OHLCV fallback matching PQC Market's Birdeye data stack.
 * Keep the API key server-side; without it the public GeckoTerminal fallback remains available.
 */
async function birdeyeFallback(mint: string, range: string): Promise<Candle[]> {
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return [];

  const settings: Record<string, { type: string; seconds: number }> = {
    "1H": { type: "1m", seconds: 60 * 60 },
    "1D": { type: "15m", seconds: 24 * 60 * 60 },
    "1W": { type: "1H", seconds: 7 * 24 * 60 * 60 },
    "1M": { type: "4H", seconds: 30 * 24 * 60 * 60 },
  };
  const timeframe = settings[range];
  const now = Math.floor(Date.now() / 1000);
  const url = new URL("https://public-api.birdeye.so/defi/v3/ohlcv");
  url.searchParams.set("address", mint);
  url.searchParams.set("type", timeframe.type);
  url.searchParams.set("currency", "usd");
  url.searchParams.set("time_from", String(now - timeframe.seconds));
  url.searchParams.set("time_to", String(now));
  url.searchParams.set("mode", "range");

  const response = await fetch(url.toString(), {
    headers: { accept: "application/json", "X-API-KEY": apiKey, "x-chain": "solana" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Birdeye OHLCV request failed (" + response.status + ").");
  const payload = await response.json() as { data?: { items?: Array<Record<string, unknown>> } };
  return (payload.data?.items || [])
    .map((item) => normalizeCandle({
      t: item.unix_time ?? item.unixTime,
      o: item.o,
      h: item.h,
      l: item.l,
      c: item.c,
      v: item.v_usd ?? item.v ?? 0,
    }))
    .filter((item): item is Candle => item !== null)
    .sort((a, b) => a.t - b.t);
}

async function geckoFallback(mint: string, range: string): Promise<Candle[]> {
  const dexResponse = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(mint), {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!dexResponse.ok) throw new Error("DexScreener pair lookup failed.");
  const dexPayload = await dexResponse.json() as {
    pairs?: Array<{ chainId?: string; pairAddress?: string; baseToken?: { address?: string }; liquidity?: { usd?: number } }>;
  };
  const pair = (dexPayload.pairs || [])
    .filter((item) => item.chainId === "solana" && item.pairAddress && item.baseToken?.address?.toLowerCase() === mint.toLowerCase())
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  if (!pair?.pairAddress) return [];

  const tf = GECKO_RANGES[range];
  const url = "https://api.geckoterminal.com/api/v2/networks/solana/pools/" +
    encodeURIComponent(pair.pairAddress) + "/ohlcv/" + tf.unit +
    "?aggregate=" + tf.aggregate + "&limit=" + tf.limit + "&currency=usd&token=base";
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("GeckoTerminal OHLCV request failed (" + response.status + ").");
  const payload = await response.json() as { data?: { attributes?: { ohlcv_list?: number[][] } } };
  // GeckoTerminal returns newest first; the chart consumes oldest first.
  return (payload.data?.attributes?.ohlcv_list || [])
    .map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }))
    .filter((item) => [item.t, item.o, item.h, item.l, item.c, item.v].every(Number.isFinite))
    .reverse();
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

  let birdeyeError: string | null = null;
  try {
    const candles = await birdeyeFallback(mint, range);
    if (candles.length) {
      return NextResponse.json({
        candles, candlesOk: true, source: "birdeye",
        fetchedAt: new Date().toISOString(), candleCount: candles.length,
        warning: "PQC Market candles were unavailable; showing Birdeye OHLCV.",
      }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
  } catch (error) {
    birdeyeError = error instanceof Error ? error.message : "Birdeye OHLCV request failed.";
  }

  try {
    const candles = await geckoFallback(mint, range);
    if (candles.length) {
      return NextResponse.json({
        candles, candlesOk: true, source: "geckoterminal",
        fetchedAt: new Date().toISOString(), candleCount: candles.length,
        warning: "PQC Market" + (birdeyeError ? " and Birdeye" : "") + " candles were unavailable; showing GeckoTerminal OHLCV for the deepest indexed DexScreener pair.",
      }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    return NextResponse.json({
      error: "PQC Market, Birdeye, and GeckoTerminal returned no candles for this mint and timeframe.",
      upstreamError: pqcError, birdeyeError, candles: [], candlesOk: false, source: "none", candleCount: 0,
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      error: "PQC Market, Birdeye, and GeckoTerminal could not provide chart history.",
      upstreamError: pqcError, birdeyeError,
      fallbackError: error instanceof Error ? error.message : "Chart fallback failed.",
      candles: [], candlesOk: false, source: "none",
    }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
