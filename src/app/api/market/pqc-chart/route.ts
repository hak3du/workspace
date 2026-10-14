import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_RANGES = new Set(["1H", "1D", "1W", "1M"]);
const VALID_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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
  const open = asNumber(o);
  const high = asNumber(h);
  const low = asNumber(l);
  const close = asNumber(c);
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
    payload.candles,
    payload.ohlcv,
    payload.chart,
    data?.candles,
    data?.ohlcv,
    data?.chart,
    Array.isArray(payload.data) ? payload.data : null,
  ];
  const source = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!source) return [];
  return source.map(normalizeCandle).filter((item): item is Candle => item !== null).sort((a, b) => a.t - b.t);
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

  try {
    const upstream = await fetch(
      "https://pqc.market/api/token/" + encodeURIComponent(mint) + "?range=" + encodeURIComponent(range),
      {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;

    if (!upstream.ok) {
      const error = typeof payload.error === "string" ? payload.error :
        upstream.status === 404
          ? "PQC Market has no token record for this mint."
          : "PQC Market could not return chart data.";
      return NextResponse.json(
        { error, candles: [], candlesOk: false, source: "pqc.market", upstreamStatus: upstream.status },
        { status: upstream.status === 404 ? 404 : 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const candles = extractCandles(payload);
    const upstreamCandlesOk = payload.candlesOk === true;
    return NextResponse.json(
      {
        candles,
        candlesOk: candles.length > 0 || upstreamCandlesOk,
        overview: payload.overview ?? null,
        launch: payload.launch ?? null,
        source: "pqc.market",
        fetchedAt: new Date().toISOString(),
        candleCount: candles.length,
        warning: candles.length ? null : "PQC Market returned no recognized candle points for this mint and timeframe.",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error && error.name === "TimeoutError"
          ? "PQC Market chart request timed out. Retry shortly."
          : "Could not connect to the PQC Market chart service.",
        candles: [],
        candlesOk: false,
        source: "pqc.market",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
