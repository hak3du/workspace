"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  CreditCard,
  Copy,
  Fingerprint,
  Gem,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/store/app-store";
import { shortAddr, sol, timeAgo, usd, compact } from "@/lib/format";
import type { PortfolioDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const VIOLET = "#8b5cf6";
const CYAN = "#22d3ee";
const PINK = "#f472b6";
const GREEN = "#34d399";
const AMBER = "#fbbf24";
const PALETTE = [VIOLET, CYAN, PINK, GREEN, AMBER, "#f87171"];

export function PortfolioView() {
  const { wallet, connectWallet, navigate, user } = useApp();
  const { toast } = useToast();
  const [data, setData] = useState<PortfolioDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<PortfolioDTO>("/api/portfolio"));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, wallet.address]);

  const copyAddress = () => {
    if (data?.address) {
      navigator.clipboard.writeText(data.address).then(() => toast({ title: "Address copied" }));
    }
  };

  const holdings = data?.holdings ?? [];
  const totalValue = data?.totalValueUsd ?? 0;
  const pnl = data?.totalPnlUsd ?? 0;
  const pnlPct = totalValue > 0 ? pnl / Math.max(totalValue - pnl, 1) : 0;

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display-2">Portfolio &amp; card</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your holdings, activity and wallet security — all simulated, all yours.</p>
        </div>
        <Button variant="ghost" className="h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10" onClick={load} aria-label="Refresh portfolio">
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {!wallet.address && !loading && (
        <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
          <span className="glow-violet flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-primary">
            <Wallet className="h-7 w-7" />
          </span>
          <p className="text-lg font-semibold">Connect a wallet to see your portfolio</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Simulated connection — we never request seed phrases or private keys. Your holdings from the Launch Arena will show up here.
          </p>
          <Button onClick={() => connectWallet()} className="glow-violet mt-1 h-11 rounded-xl bg-primary px-6 font-semibold text-primary-foreground">
            <Wallet className="mr-2 h-4 w-4" /> Connect wallet
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* LEFT: wallet card + allocation */}
        <div className="space-y-6">
          {/* Gradient glass wallet card */}
          <div className="neon-border relative overflow-hidden rounded-3xl">
            <div className="glass-strong relative p-5">
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ background: "radial-gradient(400px 160px at 85% -20%, rgba(139,92,246,0.35), transparent 60%), radial-gradient(300px 140px at 0% 120%, rgba(34,211,238,0.22), transparent 60%)" }}
              />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <Badge className="border-0 bg-gradient-to-r from-primary to-cyan-400 px-3 py-1 text-white">Total balance</Badge>
                  <BadgeCheck className="h-5 w-5 text-cyan-400" aria-label="Verified simulated wallet" />
                </div>
                <div className="mt-4 font-mono text-4xl font-bold tracking-tight">
                  {loading ? <Skeleton className="h-10 w-48" /> : usd(totalValue + (data?.solBalance ?? 0) * (data?.solUsd ?? 0))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  ≈ {sol(data?.solBalance ?? 0, 3)} liquid · {holdings.length} positions
                </p>

                {wallet.address && (
                  <button onClick={copyAddress} className="mt-4 flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground transition hover:text-foreground" aria-label="Copy wallet address">
                    {shortAddr(wallet.address)} <Copy className="h-3 w-3" />
                  </button>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Cashback" value={`${((data?.cashbackRate ?? 0.015) * 100).toFixed(1)}%`} accent="text-emerald-400" />
                  <MiniStat label="Alerts" value={String(data?.securityAlerts ?? 0)} accent="text-cyan-300" />
                  <MiniStat label="Launch fees" value={`${(data?.launchFeesPaid ?? 0).toFixed(2)}`} accent="text-primary" />
                </div>
              </div>
            </div>
          </div>

          {/* Allocation donut */}
          <div className="glass rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold">Allocation</h3>
            {holdings.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No positions yet — trade on the Launch Arena.</p>
            ) : (
              <div className="flex items-center gap-5">
                <Donut holdings={holdings} />
                <ul className="min-w-0 flex-1 space-y-2">
                  {holdings.map((h, i) => (
                    <li key={h.id} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <span className="min-w-0 flex-1 truncate font-medium">{h.token.symbol}</span>
                      <span className="text-muted-foreground">{totalValue > 0 ? Math.round(((h.valueSol * (data?.solUsd ?? 0)) / totalValue) * 100) : 0}%</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white/20" />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">Liquid SOL</span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Security review */}
          <div className="glass rounded-2xl p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-cyan-400" /> Security review
            </h3>
            <ul className="space-y-2.5 text-xs">
              <SecRow icon={<Fingerprint className="h-3.5 w-3.5 text-emerald-400" />} text="2FA enabled (simulated)" ok />
              <SecRow icon={<BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />} text="Wallet ownership verified at connect" ok />
              <SecRow icon={<Ban className="h-3.5 w-3.5 text-emerald-400" />} text="No seed phrase / private key ever requested" ok />
              <SecRow icon={<ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />} text="Last change: limit set by you" />
            </ul>
            <p className="mt-3 text-[10px] text-muted-foreground/70">Security events are derived from actual platform actions.</p>
          </div>

          {/* Upgrade card */}
          <button
            onClick={() => toast({ title: "Metal card waitlist", description: "Physical cards are not available in this simulated build." })}
            className="card-hover relative w-full overflow-hidden rounded-3xl p-5 text-left"
            style={{ background: "linear-gradient(135deg, #d9f99d 0%, #a3e635 45%, #22d3ee 100%)" }}
          >
            <p className="text-lg font-extrabold text-emerald-950">Upgrade to metal card</p>
            <p className="mt-1 text-xs font-medium text-emerald-900/80">Urgent rewards to activate — join the waitlist.</p>
            <Gem className="absolute bottom-4 right-4 h-8 w-8 text-emerald-900/30" />
          </button>
        </div>

        {/* RIGHT: holdings + activity */}
        <div className="space-y-6">
          {/* PnL strip */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Portfolio value" value={loading ? "—" : usd(totalValue)} sub={holdings.length + " positions"} />
            <StatCard label="Unrealized P&L" value={loading ? "—" : usd(pnl)} sub={`${(pnlPct * 100).toFixed(1)}%`} accent={pnl >= 0 ? "text-emerald-400" : "text-rose-400"} />
            <StatCard label="Liquid SOL" value={loading ? "—" : sol(data?.solBalance ?? 0, 2)} sub={`@ ${usd(data?.solUsd ?? 0)}`} />
            <StatCard label="Creator role" value={user?.role ?? "EXPLORER"} sub={user?.displayName ?? ""} />
          </div>

          {/* Holdings */}
          <div className="glass rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Holdings</h3>
              <Button variant="ghost" size="sm" className="h-9 rounded-lg text-xs text-primary" onClick={() => navigate({ name: "launch" })}>
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Trade on Launch Arena
              </Button>
            </div>
            {loading ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
            ) : holdings.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No holdings yet. Buy your first token in the Launch Arena.</p>
            ) : (
              <div className="space-y-3">
                {holdings.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => navigate({ name: "token", id: h.token.id })}
                    className="flex w-full items-center gap-4 rounded-xl border border-transparent p-3 text-left transition hover:border-primary/30 hover:bg-white/5"
                  >
                    {h.token.imageUrl ? (
                       
                      <img src={h.token.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/70 to-cyan-500/70 text-xs font-bold text-white">
                        {h.token.symbol.slice(0, 4)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {h.token.name} <span className="text-muted-foreground">{h.token.symbol}</span>
                      </p>
                      <Progress value={h.token.progress} className="mt-1.5 h-1.5" />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {compact(h.amount)} tokens · avg {h.avgPrice.toFixed(8)} SOL
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{usd(h.valueSol * (data?.solUsd ?? 0), { compact: true })}</p>
                      <p className={cn("text-xs font-medium", h.pnlUsd >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {h.pnlUsd >= 0 ? "+" : ""}
                        {usd(h.pnlUsd, { compact: true })}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="glass rounded-2xl p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4 text-primary" /> Recent activity
            </h3>
            {loading ? (
              <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
            ) : (data?.recentTrades.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No trades yet.</p>
            ) : (
              <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
                {data?.recentTrades.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/5">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", t.side === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400")}>
                      {t.side === "BUY" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-semibold">{t.side === "BUY" ? "Bought" : "Sold"}</span> {t.tokenSymbol}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.solAmount.toFixed(3)} SOL · {compact(t.tokenAmount)} tokens · {timeAgo(t.createdAt)}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground/70">{t.txSig.slice(0, 6)}…</span>
                  </div>
                ))}
              </div>
            )}
            {loading && (
              <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading universe data…
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-2">
      <p className={cn("text-sm font-bold", accent)}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="glass card-hover rounded-2xl p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-lg font-bold", accent)}>{value}</p>
      <p className="text-[11px] text-muted-foreground/80">{sub}</p>
    </div>
  );
}

function SecRow({ icon, text, ok }: { icon: React.ReactNode; text: string; ok?: boolean }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">{icon}</span>
      <span className={cn(ok ? "text-foreground" : "text-muted-foreground")}>{text}</span>
    </li>
  );
}

function Donut({ holdings }: { holdings: PortfolioDTO["holdings"] }) {
  const total = holdings.reduce((a, h) => a + h.valueSol, 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;
  const segments = holdings
    .reduce<{ list: { id: string; color: string; dash: string; offset: number }[]; acc: number }>(
      (state, h, i) => {
        const frac = h.valueSol / total;
        return {
          list: [
            ...state.list,
            { id: h.id, color: PALETTE[i % PALETTE.length], dash: `${frac * C} ${C}`, offset: -state.acc * C },
          ],
          acc: state.acc + frac,
        };
      },
      { list: [], acc: 0 }
    ).list;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128" className="shrink-0" role="img" aria-label="Allocation donut chart">
      <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
      {segments.map((s) => (
        <circle
          key={s.id}
          cx="64"
          cy="64"
          r={R}
          fill="none"
          stroke={s.color}
          strokeWidth="14"
          strokeDasharray={s.dash}
          strokeDashoffset={s.offset}
          strokeLinecap="butt"
          transform="rotate(-90 64 64)"
        />
      ))}
      <circle cx="64" cy="64" r="36" fill="var(--card, #141420)" />
    </svg>
  );
}
