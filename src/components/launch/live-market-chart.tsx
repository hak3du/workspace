"use client";

import { useEffect, useMemo, useState } from "react";

type Range = "1H" | "6H" | "24H" | "7D";
type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
type Market = {
  source: string;
  pairAddress: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  change24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  candles: Candle[];
  warning?: string;
};

const RANGES: { label: Range; unit: "minute" | "hour" | "day"; aggregate: number; limit: number }[] = [
  { label: "1H", unit: "minute", aggregate: 1, limit: 60 },
  { label: "6H", unit: "minute", aggregate: 5, limit: 72 },
  { label: "24H", unit: "hour", aggregate: 1, limit: 24 },
  { label: "7D", unit: "hour", aggregate: 4, limit: 42 },
];
const fmt = (n: number | null | undefined, digits = 6) =>
  n == null || !Number.isFinite(n) ? "—" : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toLocaleString("en-US", { maximumFractionDigits: digits });
const usd = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: n >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: n >= 1 ? 2 : 6 }).format(n);

export function LiveMarketChart({ mint, symbol }: { mint: string; symbol: string }) {
  const [range, setRange] = useState<Range>("24H");
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      try {
        const res = await fetch(`/api/market-data/${encodeURIComponent(mint)}?range=${range}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Live market data is unavailable.");
        if (active) { setMarket(json as Market); setError(null); setLoading(false); }
      } catch (e) {
        if (active) { setError(e instanceof Error ? e.message : "Live market data is unavailable."); setLoading(false); }
      }
    };
    setLoading(true);
    void load();
    timer = setInterval(load, 30_000);
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [mint, range]);

  const geo = useMemo(() => {
    const candles = market?.candles ?? [];
    if (!candles.length) return null;
    const W = 1000, H = 300, PAD_T = 18, PAD_B = 32, VOL_H = 42;
    const low = Math.min(...candles.map(c => c.l));
    const high = Math.max(...candles.map(c => c.h));
    const spread = high - low || Math.max(Math.abs(high) * 0.02, 1e-9);
    const min = low - spread * 0.06, max = high + spread * 0.06;
    const t0 = candles[0].t, t1 = candles[candles.length - 1].t || t0 + 1;
    const x = (t: number) => 8 + ((t - t0) / Math.max(t1 - t0, 1)) * (W - 16);
    const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B - VOL_H);
    const path = candles.map((c, i) => `${i ? "L" : "M"}${x(c.t).toFixed(1)},${y(c.c).toFixed(1)}`).join(" ");
    const vmax = Math.max(...candles.map(c => c.v), 1);
    const barW = Math.max(2, Math.min(12, (W / candles.length) * 0.6));
    return { W, H, PAD_T, PAD_B, VOL_H, min, max, x, y, path, vmax, barW, candles, up: candles[candles.length - 1].c >= candles[0].o };
  }, [market]);

  const stats = [
    ["Market cap", usd(market?.marketCap)],
    ["Liquidity", usd(market?.liquidityUsd)],
    ["24h volume", usd(market?.volume24h)],
    ["24h change", market?.change24h == null ? "—" : `${market.change24h >= 0 ? "+" : ""}${market.change24h.toFixed(2)}%`],
    ["Buys / sells", market?.buys24h == null || market?.sells24h == null ? "—" : `${fmt(market.buys24h, 0)} / ${fmt(market.sells24h, 0)}`],
    ["Price (USD)", usd(market?.priceUsd)],
  ];

  return (
    <section className="glass rounded-2xl p-4 sm:p-6" aria-label={`${symbol} live market chart`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Live market chart</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">{market?.source ? `Market data: ${market.source}` : "External market data · refreshes every 30 seconds"}</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          {RANGES.map(r => <button key={r.label} type="button" onClick={() => { setHover(null); setRange(r.label); }} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${range === r.label ? "bg-violet-500/25 text-violet-200" : "text-muted-foreground hover:text-foreground"}`}>{r.label}</button>)}
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([label, value]) => <div key={label} className="rounded-xl border border-white/5 bg-white/[0.025] p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p></div>)}
      </div>
      {loading && !market ? <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading live candles…</div> : geo ? (
        <>
          <div className="relative h-64 w-full" onMouseLeave={() => setHover(null)} onMouseMove={e => { const rect = e.currentTarget.getBoundingClientRect(); const i = Math.max(0, Math.min(geo.candles.length - 1, Math.round(((e.clientX - rect.left) / rect.width) * (geo.candles.length - 1)))); setHover(i); }}>
            <svg viewBox={`0 0 ${geo.W} ${geo.H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label={`${symbol} OHLCV price chart`}>
              <defs><linearGradient id="ahe-market-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={geo.up ? "#34d399" : "#fb7185"} stopOpacity=".22" /><stop offset="100%" stopColor={geo.up ? "#34d399" : "#fb7185"} stopOpacity="0" /></linearGradient></defs>
              {[0,1,2,3].map(i => { const v = geo.min + (geo.max - geo.min) * i / 3; return <g key={i}><line x1="0" x2={geo.W} y1={geo.y(v)} y2={geo.y(v)} stroke="currentColor" opacity=".09" strokeDasharray="3 7" /><text x={geo.W - 5} y={geo.y(v) - 4} fill="currentColor" opacity=".55" textAnchor="end" fontSize="12">{fmt(v, 8)}</text></g>; })}
              {geo.candles.map((c,i) => { const h = c.v / geo.vmax * geo.VOL_H; return <rect key={c.t} x={geo.x(c.t) - geo.barW / 2} width={geo.barW} y={geo.H - geo.PAD_B - h} height={h} fill={c.c >= c.o ? "#34d399" : "#fb7185"} opacity={hover === i ? ".75" : ".3"} />; })}
              <path d={`${geo.path} L${geo.W},${geo.H - geo.PAD_B} L0,${geo.H - geo.PAD_B} Z`} fill="url(#ahe-market-fill)" />
              <path d={geo.path} fill="none" stroke={geo.up ? "#34d399" : "#fb7185"} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              {hover != null && <line x1={geo.x(geo.candles[hover].t)} x2={geo.x(geo.candles[hover].t)} y1="0" y2={geo.H - geo.PAD_B} stroke="currentColor" opacity=".45" strokeDasharray="3 4" />}
            </svg>
          </div>
          {hover != null && geo.candles[hover] && <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-xs sm:grid-cols-5"><span className="text-muted-foreground">{new Date(geo.candles[hover].t * 1000).toLocaleString()}</span><span>O <b>{fmt(geo.candles[hover].o, 8)}</b></span><span>H <b>{fmt(geo.candles[hover].h, 8)}</b></span><span>L <b>{fmt(geo.candles[hover].l, 8)}</b></span><span>C <b>{fmt(geo.candles[hover].c, 8)}</b></span></div>}
        </>
      ) : <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 text-center"><p className="text-sm text-muted-foreground">{error || "No external OHLCV data is available for this mint yet."}</p><p className="text-xs text-muted-foreground">New or simulated mints may not have an indexed public market pool.</p></div>}
      {market?.warning && <p className="mt-3 text-xs text-amber-200/80">{market.warning}</p>}
      <p className="mt-3 text-[10px] text-muted-foreground">Market data is supplied by third-party indexers and may lag on newly created pools. This chart does not imply live trading is enabled.</p>
    </section>
  );
}
