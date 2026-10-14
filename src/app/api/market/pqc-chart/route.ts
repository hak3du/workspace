import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_RANGES = new Set(["1H", "1D", "1W", "1M"]);
const VALID_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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
    const payload = await upstream.json().catch(() => ({})) as {
      error?: string;
      candles?: unknown[];
      candlesOk?: boolean;
      overview?: unknown;
      launch?: unknown;
    };

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: payload.error || (upstream.status === 404
            ? "This mint is not listed by PQC Market, so its live PQC Market chart is unavailable."
            : "PQC Market could not return chart data."),
          candles: [],
          candlesOk: false,
          source: "pqc.market",
        },
        { status: upstream.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        candles: payload.candles ?? [],
        candlesOk: payload.candlesOk ?? false,
        overview: payload.overview ?? null,
        launch: payload.launch ?? null,
        source: "pqc.market",
        fetchedAt: new Date().toISOString(),
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
