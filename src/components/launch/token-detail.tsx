"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Copy,
  Check,
  MinusCircle,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api, post } from "@/lib/api";
import { compact, pct, priceLabel, shortAddr, timeAgo, usd } from "@/lib/format";
import { useApp } from "@/store/app-store";
import type { TokenDTO, TradeDTO, UserDTO, VerificationCheckDTO } from "@/lib/types";
import { LiveMarketChart } from "@/components/launch/live-market-chart";
import { TradePanel } from "@/components/launch/trade-panel";

interface DetailResponse {
  token: TokenDTO;
  trades: TradeDTO[];
  myHolding: { amount: number; avgPrice: number } | null;
  checks: VerificationCheckDTO[];
  creator: UserDTO;
}

function CheckStatusIcon({ status }: { status: VerificationCheckDTO["status"] }) {
  switch (status) {
    case "PASS":
      return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-label="PASS" />;
    case "WARN":
      return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-label="WARN" />;
    case "FAIL":
      return <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" aria-label="FAIL" />;
    default:
      return <MinusCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="UNAVAILABLE" />;
  }
}

export function TokenDetail({ tokenId }: { tokenId: string }) {
  const { toast } = useToast();
  const back = useApp((s) => s.back);

  const [token, setToken] = useState<TokenDTO | null>(null);
  const [trades, setTrades] = useState<TradeDTO[]>([]);
  const [myHolding, setMyHolding] = useState<{ amount: number; avgPrice: number } | null>(null);
  const [checks, setChecks] = useState<VerificationCheckDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boosting, setBoosting] = useState(false);
  const [checksOpen, setChecksOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<DetailResponse>(`/api/tokens/${tokenId}`);
      setToken(d.token);
      setTrades(d.trades);
      setMyHolding(d.myHolding);
      setChecks(d.checks);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load token");
    } finally {
      setLoading(false);
    }
  }, [tokenId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleBoost() {
    if (!token || boosting) return;
    setBoosting(true);
    try {
      await post(`/api/tokens/${token.id}/boost`);
      toast({ title: "Boost sent", description: `You boosted ${token.name}. More visibility on the board.` });
    } catch (err) {
      toast({
        title: "Boost failed",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBoosting(false);
    }
  }

  function handleCopyMint() {
    if (!token) return;
    Promise.resolve(navigator.clipboard?.writeText(token.mint))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
        toast({ title: "Mint address copied", description: `${shortAddr(token.mint)} — simulated mint` });
      })
      .catch(() => toast({ title: "Copy failed", description: "Clipboard unavailable in this context.", variant: "destructive" }));
  }

  function handleTxClick() {
    toast({ title: "Simulated signature — devnet explorer disabled in sandbox" });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-11 w-40 rounded-xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="glass space-y-4 rounded-2xl p-8 text-center">
        <p className="text-sm text-muted-foreground">{error ?? "Token not found."}</p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" className="h-11" onClick={() => void load()}>
            Retry
          </Button>
          <Button variant="ghost" className="h-11" onClick={back}>
            Back to Arena
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={back} className="-ml-3 h-11 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to Arena
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* ---- left column ---- */}
        <div className="min-w-0 space-y-6">
          {/* header */}
          <div className="glass rounded-2xl p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-2xl border border-white/10">
                {token.imageUrl ? (
                  <Image src={token.imageUrl} alt={`${token.name} cover art`} fill sizes="88px" className="object-cover" priority />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-600/80 to-cyan-500/80">
                    <span className="text-xl font-black text-white/90">{token.symbol}</span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold leading-tight">{token.name}</h1>
                  <Badge variant="outline" className="border-violet-400/40 text-violet-300">
                    {token.symbol}
                  </Badge>
                  {token.status === "MIGRATED" ? (
                    <Badge className="border-cyan-400/40 bg-cyan-500/20 text-cyan-200">Graduated 🎓</Badge>
                  ) : (
                    <Badge className="border-violet-400/40 bg-violet-500/20 text-violet-200">Bonding</Badge>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{token.mint}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={handleCopyMint}
                    aria-label="Copy mint address"
                  >
                    {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
                    style={{ backgroundColor: token.creator.avatarColor }}
                    aria-hidden="true"
                  >
                    {token.creator.avatarEmoji}
                  </span>
                  <span className="text-sm">
                    by <span className="font-medium">{token.creator.displayName}</span>
                    <span className="ml-1 text-xs text-muted-foreground">{token.creator.handle}</span>
                  </span>
                </div>
              </div>

              <Button variant="outline" className="h-11 shrink-0 border-violet-400/40 text-violet-200 hover:bg-violet-500/15" onClick={handleBoost} disabled={boosting}>
                <Zap className="size-4" />
                {boosting ? "Boosting…" : "Boost"}
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/5 pt-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Price</p>
                <p className="text-gradient text-lg font-bold">
                  {priceLabel(token.priceSol)} <span className="text-sm">SOL</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Market cap</p>
                <p className="text-lg font-bold">{usd(token.marketCapUsd, { compact: true })}</p>
              </div>
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Trades</p>
                <p className="text-lg font-bold">{compact(token.tradeCount)}</p>
              </div>
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Holders</p>
                <p className="text-lg font-bold">{token.holders ?? 0}</p>
              </div>
            </div>
          </div>

          {token.description && (
            <div className="glass rounded-2xl p-4 sm:p-6">
              <p className="text-sm leading-relaxed text-muted-foreground">{token.description}</p>
            </div>
          )}

          {/* External OHLCV market data; simulation trades remain in their own activity table. */}
          <LiveMarketChart mint={token.mint} symbol={token.symbol} />

          {/* trades */}
          <div className="glass rounded-2xl p-4 sm:p-6">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Recent trades</h2>
            {trades.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No trades yet — be the first.</p>
            ) : (
              <ScrollArea className="max-h-80">
                <div>
                  {trades.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 border-b border-white/5 py-3 last:border-b-0">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          t.side === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                        }`}
                        aria-hidden="true"
                      >
                        {t.side === "BUY" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">
                          {t.traderLabel}
                          {t.isBot && (
                            <Badge variant="outline" className="border-white/10 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                              bot
                            </Badge>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {timeAgo(t.createdAt)} · @ {priceLabel(t.priceAfter)} SOL
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-semibold ${t.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                          {t.solAmount < 1 ? t.solAmount.toFixed(3) : t.solAmount.toFixed(2)} SOL
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {compact(t.tokenAmount)} {token.symbol}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleTxClick}
                        className="hidden shrink-0 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground sm:block"
                        aria-label="View transaction signature"
                      >
                        {shortAddr(t.txSig)}
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* ---- right column ---- */}
        <div className="space-y-6">
          <TradePanel token={token} myHolding={myHolding} onTraded={() => void load()} />

          <div className="glass space-y-3 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Bonding curve</h3>
              <Badge variant="outline" className="border-violet-400/40 text-violet-300">
                {pct(token.progress / 100)}
              </Badge>
            </div>
            <Progress
              value={token.progress}
              className="h-2 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-violet-500 [&_[data-slot=progress-indicator]]:to-cyan-400"
              aria-label={`Bonding curve progress ${Math.round(token.progress)}%`}
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/[0.03] p-2.5">
                <p className="text-muted-foreground">Virtual SOL</p>
                <p className="font-mono font-semibold">{token.virtualSol.toFixed(2)}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-2.5">
                <p className="text-muted-foreground">Virtual tokens</p>
                <p className="font-mono font-semibold">{compact(token.virtualToken)}</p>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Constant-product virtual reserves. Graduates at 85 SOL. Simulated.
            </p>
          </div>

          <div className="glass rounded-2xl p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between"
              onClick={() => setChecksOpen((o) => !o)}
              aria-expanded={checksOpen}
            >
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Verification</h3>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${checksOpen ? "" : "-rotate-90"}`} />
            </button>
            {checksOpen && (
              <ul className="mt-3 space-y-3">
                {checks.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <CheckStatusIcon status={c.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.detail}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                        {c.source} · {timeAgo(c.checkedAt)}
                      </p>
                    </div>
                  </li>
                ))}
                {checks.length === 0 && <li className="text-xs text-muted-foreground">No verification checks recorded yet.</li>}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
