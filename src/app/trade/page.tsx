"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ChartNoAxesCombined, CircleAlert, Loader2, Search, ShieldCheck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TradePanel } from "@/components/launch/trade-panel";
import type { TokenDTO } from "@/lib/types";

const LIVE_TRADING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING === "true";

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

export default function TradePage() {
  const [mintInput, setMintInput] = useState("");
  const [symbolInput, setSymbolInput] = useState("");
  const [marketToken, setMarketToken] = useState<MarketToken | null>(null);
  const [token, setToken] = useState<TokenDTO | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function openMint() {
    const mint = mintInput.trim();
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
      setError(loadError instanceof Error ? loadError.message : "Unable to load this token.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">AHE Market · Solana</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Trade a Pump.fun token</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Load a mint to verify it on the selected Solana network and retrieve market data when an indexed trading pair is available.
        </p>
      </div>

      <section className="glass mb-6 rounded-2xl p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Pump.fun explorer</p>
            <h2 className="mt-1 text-xl font-semibold">Discoverables</h2>
            <p className="mt-1 text-sm text-muted-foreground">Browse live Pump.fun listings or search by name and ticker. Select a coin to load its mint into the market verifier.</p>
          </div>
          <form className="flex w-full gap-2 sm:max-w-md" onSubmit={(event) => { event.preventDefault(); void loadDiscoverables(discoverSearch); }}>
            <Input value={discoverSearch} onChange={(event) => setDiscoverSearch(event.target.value)} placeholder="Search coins or symbols…" aria-label="Search Pump.fun coins" />
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
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading Pump.fun listings…</div>
        ) : discoverables.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {discoverables.map((coin) => (
              <button
                key={coin.mint}
                type="button"
                onClick={() => { setMintInput(coin.mint); void openMint(coin.mint); }}
                className="group min-w-0 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-violet-400/50 hover:bg-violet-400/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <div className="flex items-start gap-3">
                  {coin.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coin.imageUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-full bg-white/5 object-cover" />
                  ) : (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-violet-400/10 text-lg font-semibold text-violet-200">◎</div>
                  )}
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Source: Pump.fun listings. Market cap is shown only when supplied by the source.</span>
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
        <div className="space-y-6">
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

          <section className="glass overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2"><ChartNoAxesCombined className="size-5 text-violet-300" /><h2 className="font-semibold">Price chart</h2></div>
              {marketToken.pairUrl && <a className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200" href={marketToken.pairUrl} target="_blank" rel="noreferrer">Open market <ArrowUpRight className="size-3.5" /></a>}
            </div>
            {marketToken.chartUrl ? (
              <iframe
                title={"Dexscreener chart for " + (marketToken.symbol || marketToken.mint)}
                src={marketToken.chartUrl}
                className="h-[420px] w-full border-0 sm:h-[520px]"
                loading="lazy"
                referrerPolicy="no-referrer"
                allow="clipboard-write"
              />
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
                <CircleAlert className="mb-3 size-7 text-amber-300" />
                <h3 className="font-semibold">No indexed chart available</h3>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">{marketToken.message || "A market pair was not returned for this mint, so a chart cannot be displayed yet."}</p>
              </div>
            )}
          </section>

          {!LIVE_TRADING_ENABLED ? (
            <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
              <h2 className="font-semibold text-amber-100">Live trading is disabled</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Market lookup and charting are separate from trading. Keep live trading disabled until the Pump.fun quote and transaction path has been verified. Do not enable the flag just to make the trade panel appear.
              </p>
            </section>
          ) : marketToken.marketDataAvailable ? (
            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="glass rounded-2xl p-5">
                <div className="flex items-center gap-2"><TrendingUp className="size-5 text-violet-300" /><h2 className="text-lg font-semibold">Trading</h2></div>
                <p className="mt-2 text-sm text-muted-foreground">Review the token's on-chain bonding-curve status and wallet transaction before approving. A market pair alone does not guarantee Pump bonding-curve support.</p>
              </div>
              <TradePanel token={token} myHolding={null} onTraded={() => {}} />
            </section>
          ) : (
            <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm text-muted-foreground">
              Trading controls remain unavailable because no indexed market pair was found. This avoids presenting placeholder values as a live quote.
            </section>
          )}
          <p className="text-xs text-muted-foreground">Market data source: Dexscreener. Last checked {new Date(marketToken.fetchedAt).toLocaleString()}.</p>
        </div>
      )}
    </main>
  );
}
