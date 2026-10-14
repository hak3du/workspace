"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ChartNoAxesCombined, CircleAlert, Loader2, Search, ShieldCheck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LiveSwapPanel } from "@/components/market/live-swap-panel";
import type { TokenDTO } from "@/lib/types";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";


type DiscoverableCoin = {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;
  marketCapUsd: number | null;
  createdAt: number | null;
  complete: boolean;
  graduated: boolean;
  source: string;
};

type PQCCandle = { t: number; o: number; h: number; l: number; c: number; v: number };
type PQCChartPayload = {
  candles?: PQCCandle[];
  candlesOk?: boolean;
  error?: string;
  fetchedAt?: string;
  source?: string;
};

type MarketToken = {
  mint: string;
  network: string;
  verifiedOnChain: boolean;
  tokenProgram: string;
  name: string | null;
  symbol: string | null;
  priceUsd: number | null;
  priceSol: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
  pairAddress: string | null;
  pairUrl: string | null;
  chartUrl: string | null;
  marketDataAvailable: boolean;
  message: string | null;
  fetchedAt: string;
};

function money(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000_000) return "$" + (value / 1_000_000_000).toFixed(2) + "B";
  if (value >= 1_000_000) return "$" + (value / 1_000_000).toFixed(2) + "M";
  if (value >= 1_000) return "$" + (value / 1_000).toFixed(2) + "K";
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function price(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 10 });
}

function usableImageUrl(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("ipfs://")) return "https://pump.mypinata.cloud/ipfs/" + trimmed.slice("ipfs://".length).replace(/^ipfs\//, "");
  if (trimmed.startsWith("https://ipfs.io/ipfs/")) return trimmed.replace("https://ipfs.io/ipfs/", "https://pump.mypinata.cloud/ipfs/");
  if (trimmed.startsWith("http://")) return "https://" + trimmed.slice("http://".length);
  return /^https:\/\//i.test(trimmed) ? trimmed : null;
}

export function TradeDiscoverView() {
  const [mintInput, setMintInput] = useState("");
  const [symbolInput, setSymbolInput] = useState("");
  const [marketToken, setMarketToken] = useState<MarketToken | null>(null);
  const [token, setToken] = useState<TokenDTO | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");
  const [discoverables, setDiscoverables] = useState<DiscoverableCoin[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState("");
  const [selectedMint, setSelectedMint] = useState("");
  const [selectionStatus, setSelectionStatus] = useState("");
  const [chartRange, setChartRange] = useState<"1H" | "1D" | "1W" | "1M">("1D");
  const [chartCandles, setChartCandles] = useState<PQCCandle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState("");
  const [chartUpdatedAt, setChartUpdatedAt] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(false);

  async function loadDiscoverables(query = "") {
    setDiscoverLoading(true);
    setDiscoverError("");
    try {
      const response = await fetch("/api/market/discover" + (query.trim() ? "?q=" + encodeURIComponent(query.trim()) : ""), { cache: "no-store" });
      const payload = await response.json() as { coins?: DiscoverableCoin[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load PQC Market discoverables.");
      setDiscoverables(payload.coins || []);
    } catch (loadError) {
      setDiscoverables([]);
      setDiscoverError(loadError instanceof Error ? loadError.message : "Unable to load Pump.fun discoverables.");
    } finally {
      setDiscoverLoading(false);
    }
  }

  useEffect(() => {
    void loadDiscoverables();
    // The initial listing request should run once when the trade page mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (marketToken) {
      setSelectionStatus("Token loaded. Open the chart from the coin card to inspect live price data.");
    }
  }, [marketToken]);

  useEffect(() => {
    const mint = marketToken?.mint;
    if (!mint) {
      setChartCandles([]);
      setChartError("");
      setChartUpdatedAt(null);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const loadChart = async () => {
      if (inFlight) return;
      inFlight = true;
      if (!chartCandles.length) setChartLoading(true);
      try {
        const response = await fetch(
          "/api/market/pqc-chart?mint=" + encodeURIComponent(mint) + "&range=" + chartRange,
          { cache: "no-store" },
        );
        const payload = await response.json() as PQCChartPayload;
        if (!response.ok) throw new Error(payload.error || "PQC Market could not return this chart.");
        if (cancelled) return;
        const nextCandles = Array.isArray(payload.candles)
          ? payload.candles.filter((item) =>
              Number.isFinite(item.t) && Number.isFinite(item.o) && Number.isFinite(item.h) &&
              Number.isFinite(item.l) && Number.isFinite(item.c) && Number.isFinite(item.v))
          : [];
        setChartCandles(nextCandles);
        setChartUpdatedAt(payload.fetchedAt || new Date().toISOString());
        setChartError(!payload.candlesOk && !nextCandles.length
          ? "PQC Market is temporarily unable to fetch candles for this mint. The chart will retry automatically."
          : "");
      } catch (chartLoadError) {
        if (!cancelled) setChartError(chartLoadError instanceof Error ? chartLoadError.message : "Unable to load the PQC Market chart.");
      } finally {
        inFlight = false;
        if (!cancelled) setChartLoading(false);
      }
    };

    setChartCandles([]);
    setChartError("");
    void loadChart();
    const interval = setInterval(() => void loadChart(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // chart refresh is scoped to the selected mint and selected timeframe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketToken?.mint, chartRange]);

  async function openMint(mintOverride?: string) {
    const mint = (mintOverride ?? mintInput).trim();
    if (!mint) {
      setError("Paste a real Solana token mint address.");
      return;
    }

    setLoading(true);
    setError("");
    setMarketToken(null);
    setToken(null);

    try {
      const response = await fetch("/api/market/token?mint=" + encodeURIComponent(mint), { cache: "no-store" });
      const payload = await response.json() as MarketToken & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load this token.");
      setMarketToken(payload);

      const symbol = (payload.symbol || symbolInput.trim() || "TOKEN").toUpperCase().slice(0, 12);
      setToken({
        id: "external-" + payload.mint,
        name: payload.name || "Verified Solana token",
        symbol,
        description: "Mint verified on-chain. Market metrics are supplied by Dexscreener when an indexed pair is available.",
        imageUrl: null,
        mint: payload.mint,
        status: "BONDING",
        priceSol: payload.priceSol ?? 0,
        marketCapUsd: payload.marketCapUsd ?? 0,
        progress: 0,
        creator: {
          id: "external",
          handle: "@onchain",
          displayName: "On-chain token",
          avatarEmoji: "◎",
          avatarColor: "#8b5cf6",
          verified: false,
          followers: 0,
        },
        tradeCount: 0,
        virtualSol: 30,
        virtualToken: 1_000_000_000,
        createdAt: payload.fetchedAt,
        lastTradeAt: payload.fetchedAt,
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load this token.";
      setError(message);
      if (mintOverride) setSelectionStatus("Could not load this coin: " + message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">AHE Market · Solana</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Discover & trade PQC Market tokens</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Load a mint to verify it on the selected Solana network and retrieve market data when an indexed trading pair is available.
        </p>
      </div>

      <section className="glass mb-6 rounded-2xl p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">PQC Market explorer</p>
            <h2 className="mt-1 text-xl font-semibold">Discoverables</h2>
            <p className="mt-1 text-sm text-muted-foreground">Browse live listings from the PQC Market server. Search by name or ticker, then select a coin to load its live chart and market verification.</p>
          </div>
          <form className="flex w-full gap-2 sm:max-w-md" onSubmit={(event) => { event.preventDefault(); void loadDiscoverables(discoverSearch); }}>
            <Input value={discoverSearch} onChange={(event) => setDiscoverSearch(event.target.value)} placeholder="Search PQC Market coins…" aria-label="Search PQC Market coins" />
            <Button type="submit" variant="secondary" disabled={discoverLoading}>
              {discoverLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              <span className="sr-only">Search discoverables</span>
            </Button>
          </form>
        </div>

        {discoverError && (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-100">
            {discoverError}
            <button type="button" className="ml-2 underline underline-offset-4" onClick={() => void loadDiscoverables(discoverSearch)}>Retry</button>
          </div>
        )}

        {discoverLoading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading PQC Market listings…</div>
        ) : discoverables.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {discoverables.map((coin) => (
              <button
                key={coin.mint}
                type="button"
                onClick={() => {
                  setMintInput(coin.mint);
                  setSelectedMint(coin.mint);
                  setSelectionStatus("Loading " + coin.name + " (" + coin.symbol + ")…");
                  setChartOpen(true);
                  setChartCandles([]);
                  setChartError("");
                  setError("");
                  void openMint(coin.mint).then(() => {
                    // openMint owns the verified result/error state; this message keeps the click visibly acknowledged.
                  });
                }}
                className="group min-w-0 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-violet-400/50 hover:bg-violet-400/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <div className="flex items-start gap-3">
                  <div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-violet-400/10">
                    <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-violet-200">◎</div>
                    {usableImageUrl(coin.imageUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={usableImageUrl(coin.imageUrl) ?? undefined}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                        className="relative size-11 rounded-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold group-hover:text-violet-200">{coin.name}</h3>
                      {coin.graduated && <span className="shrink-0 rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] text-cyan-200">Graduated</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">${coin.symbol}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Market cap</p>
                    <p className="mt-1 font-semibold tabular-nums">{money(coin.marketCapUsd)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-violet-300">Load token <ArrowUpRight className="size-3.5" /></span>
                </div>
                <p className="mt-3 truncate font-mono text-[10px] text-muted-foreground">{coin.mint}</p>
              </button>
            ))}
          </div>
        ) : !discoverError ? (
          <div className="mt-5 rounded-xl border border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
            No listings matched this search. Try a different name or symbol, or paste a mint address below.
          </div>
        ) : null}
        {selectionStatus && (
          <div aria-live="polite" className="mt-4 rounded-xl border border-violet-400/30 bg-violet-400/5 px-4 py-3 text-sm text-violet-100">
            {selectionStatus}
            {selectedMint && <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">{selectedMint}</span>}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Source: PQC Market live listings and market snapshot. Charts are fetched separately from the PQC Market server.</span>
          <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => { setDiscoverSearch(""); void loadDiscoverables(""); }}>Latest discoverables</button>
        </div>
      </section>

      <section className="glass mb-6 rounded-2xl p-5">
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]" onSubmit={(event) => { event.preventDefault(); void openMint(); }}>
          <Input value={mintInput} onChange={(event) => setMintInput(event.target.value)} placeholder="Solana token mint address" aria-label="Solana token mint" />
          <Input value={symbolInput} onChange={(event) => setSymbolInput(event.target.value)} placeholder="Symbol (optional)" aria-label="Token symbol (optional)" maxLength={12} />
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
            {loading ? "Loading…" : "Load token"}
          </Button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Mint ownership is checked against Solana RPC. Price and liquidity data are provided by Dexscreener and may be unavailable for unindexed tokens.
        </p>
      </section>

      {marketToken && token && (
        <div id="market-token-results" className="space-y-6 scroll-mt-6">
          <section className="glass rounded-2xl p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-200"><ShieldCheck className="size-3.5" /> Mint verified on-chain</span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-muted-foreground">{marketToken.network}</span>
                  {marketToken.marketDataAvailable && <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">Market data available</span>}
                </div>
                <h2 className="text-2xl font-bold">{marketToken.name || "Verified Solana token"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{marketToken.symbol || symbolInput || "Token"} · <span className="break-all font-mono text-xs">{marketToken.mint}</span></p>
                <a className="mt-3 inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200" href={"https://solscan.io/token/" + encodeURIComponent(marketToken.mint)} target="_blank" rel="noreferrer">
                  Inspect on Solscan <ArrowUpRight className="size-4" />
                </a>
              </div>
              <div className="sm:text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Token price</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{price(marketToken.priceUsd)}</p>
                {marketToken.change24hPct !== null && (
                  <p className={"mt-1 text-sm " + (marketToken.change24hPct >= 0 ? "text-emerald-300" : "text-red-300")}>
                    {marketToken.change24hPct >= 0 ? "+" : ""}{marketToken.change24hPct.toFixed(2)}% (24h)
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "Market cap / FDV", value: money(marketToken.marketCapUsd) },
                { label: "Liquidity", value: money(marketToken.liquidityUsd) },
                { label: "24h volume", value: money(marketToken.volume24hUsd) },
                { label: "Price in SOL", value: marketToken.priceSol === null ? "—" : marketToken.priceSol.toLocaleString("en-US", { maximumFractionDigits: 10 }) + " SOL" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>
          </section>



          <p className="text-xs text-muted-foreground">Market data source: Dexscreener. Last checked {new Date(marketToken.fetchedAt).toLocaleString()}.</p>
        </div>
      )}

      <Dialog open={chartOpen} onOpenChange={setChartOpen}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-5xl max-h-[92vh] overflow-y-auto border-white/10 bg-[#0d0b14] p-0 text-foreground sm:rounded-2xl">
          <div className="border-b border-white/10 px-5 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ChartNoAxesCombined className="size-5 text-violet-300" />
              {marketToken?.name || discoverables.find((coin) => coin.mint === selectedMint)?.name || "Token"} live chart
            </DialogTitle>
            <DialogDescription className="mt-1 break-all text-xs text-muted-foreground">
              Live price candles fetched from PQC Market. This chart opens in the coin view, not below the Discoverables list.
            </DialogDescription>
          </div>
          <div className="p-3 sm:p-5">
            {!marketToken && error ? (
              <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-200">
                {error}
                <button type="button" className="ml-2 underline underline-offset-4" onClick={() => void openMint(selectedMint)}>Retry</button>
              </div>
            ) : !marketToken ? (
              <div className="flex h-[320px] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Verifying token and loading PQC Market chart…
              </div>
            ) : (
              <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2"><ChartNoAxesCombined className="size-5 text-violet-300" /><h2 className="font-semibold">Live PQC Market price chart</h2></div>
                <div className="flex items-center gap-1 rounded-lg border border-white/10 p-1" aria-label="Chart timeframe">
                {(["1H", "1D", "1W", "1M"] as const).map((range) => (
                <button
                key={range}
                type="button"
                onClick={() => setChartRange(range)}
                aria-pressed={chartRange === range}
                className={"rounded-md px-2.5 py-1 text-xs transition " + (chartRange === range ? "bg-violet-400/20 text-violet-100" : "text-muted-foreground hover:text-foreground")}
                >
                {range}
                </button>
                ))}
                </div>
                </div>
                <div className="px-4 pb-4 pt-3">
                {chartError && (
                <div role="status" className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-100">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{chartError}</span>
                </div>
                )}
                {chartLoading && !chartCandles.length ? (
                <div className="flex h-[360px] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Fetching live candles from PQC Market…
                </div>
                ) : chartCandles.length ? (
                <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartCandles} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                <defs>
                <linearGradient id="pqcPriceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.34} />
                <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.01} />
                </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                dataKey="t"
                tickFormatter={(value) => new Date(Number(value) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                stroke="rgba(255,255,255,0.35)"
                tick={{ fontSize: 11 }}
                minTickGap={28}
                />
                <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(value) => "$" + Number(value).toPrecision(3)}
                stroke="rgba(255,255,255,0.35)"
                tick={{ fontSize: 11 }}
                width={76}
                />
                <Tooltip
                labelFormatter={(value) => new Date(Number(value) * 1000).toLocaleString()}
                formatter={(value) => ["$" + Number(value).toPrecision(8), "Price"]}
                contentStyle={{ background: "#111018", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="c" name="Price" stroke="#a78bfa" strokeWidth={2} fill="url(#pqcPriceFill)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
                </ResponsiveContainer>
                </div>
                ) : marketToken.chartUrl ? (
                <div className="space-y-2">
                  <div className="flex h-[360px] w-full overflow-hidden rounded-lg border border-white/10 bg-black">
                    <iframe
                      title={marketToken.name ? marketToken.name + " market chart fallback" : "Market chart fallback"}
                      src={marketToken.chartUrl}
                      className="h-full w-full border-0"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      allow="fullscreen"
                    />
                  </div>
                  <p className="text-center text-[11px] text-muted-foreground">PQC Market candles are unavailable for this pair/timeframe. Showing the indexed market chart fallback; this is not the PQC Market candle feed.</p>
                </div>
                ) : !chartError ? (
                <div className="flex h-[360px] flex-col items-center justify-center text-center">
                <CircleAlert className="mb-3 size-7 text-muted-foreground" />
                <h3 className="font-semibold">No candles returned</h3>
                <p className="mt-2 max-w-lg text-sm text-muted-foreground">PQC Market has no candle data for this mint and timeframe yet.</p>
                </div>
                ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">Waiting for the next PQC Market refresh…</div>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Live source: pqc.market · refreshes every 30 seconds</span>
                <span>{chartUpdatedAt ? "Updated " + new Date(chartUpdatedAt).toLocaleTimeString() : "Waiting for first data point"}</span>
                </div>
                {marketToken.pairUrl && <a className="mt-2 inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200" href={marketToken.pairUrl} target="_blank" rel="noreferrer">Open market pair <ArrowUpRight className="size-3.5" /></a>}
                </div>
              </section>
            )}
          </div>
          {marketToken && (
            <div className="border-t border-white/10 p-3 sm:p-5">
              <LiveSwapPanel mint={marketToken.mint} symbol={marketToken.symbol || "TOKEN"} network={marketToken.network} />
            </div>
          )}
        </DialogContent>
      </Dialog>

    </main>
  );
}
