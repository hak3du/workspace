"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  BookOpen,
  Crown,
  GraduationCap,
  Percent,
  Rocket,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { usd, compact } from "@/lib/format";
import { useApp } from "@/store/app-store";
import type { TokenDTO } from "@/lib/types";
import { CreateTokenDialog } from "@/components/launch/create-token-dialog";
import { TokenCard } from "@/components/launch/token-card";

type Tab = "terminal" | "following" | "created";
type Sort = "new" | "progress" | "mcap" | "trades";

const RULES = [
  {
    icon: Wallet,
    title: "Flat launch fee",
    text: "0.02 SOL to launch, itemized as a fee receipt — no hidden costs.",
  },
  {
    icon: Percent,
    title: "1% trade fee",
    text: "Fully disclosed on the simulated route. No hidden spread, no silent markup.",
  },
  {
    icon: TrendingUp,
    title: "Constant-product curve",
    text: "Price rises with demand against virtual reserves you can audit in real time.",
  },
  {
    icon: GraduationCap,
    title: "Graduation at 85 SOL",
    text: "Tokens that fill the curve migrate their liquidity to a pool (simulated).",
  },
] as const;

export function LaunchView() {
  const { toast } = useToast();
  const navigate = useApp((s) => s.navigate);

  const [tab, setTab] = useState<Tab>("terminal");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [tokens, setTokens] = useState<TokenDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Debounce search input (300ms).
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab, sort, limit: "24" });
      if (debounced.trim()) params.set("q", debounced.trim());
      const data = await api<{ tokens: TokenDTO[] }>(`/api/tokens?${params.toString()}`);
      setTokens(data.tokens);
    } catch {
      toast({
        title: "Failed to load tokens",
        description: "The arena feed hiccuped. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [tab, sort, debounced, toast]);

  useEffect(() => {
    void fetchTokens();
  }, [fetchTokens]);

  // Podium: top 3 by market cap, computed from the same fetch.
  const podium = useMemo(
    () => [...tokens].sort((a, b) => b.marketCapUsd - a.marketCapUsd).slice(0, 3),
    [tokens]
  );

  const handleCreated = (t: TokenDTO) => {
    void fetchTokens();
    navigate({ name: "token", id: t.id });
  };

  const scrollToRules = () => {
    document.getElementById("launch-rules")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-6">
      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-violet-900/60 via-black to-cyan-900/30 p-6 sm:p-10">
        <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-28 -left-10 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <Badge className="border-violet-400/40 bg-violet-500/20 text-violet-200">Launch Arena</Badge>
          <h1 className="display-2 mt-4">
            Create, Trade, and Dominate the <span className="text-gradient">Memecoin Universe!</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Launch your token in seconds. Transparent 0.02 SOL launch fee. 1% disclosed trade fee on the simulated route.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button className="glow-violet h-11" onClick={() => setCreateOpen(true)}>
              <Rocket className="size-4" />
              Create a Token
            </Button>
            <Button variant="outline" className="h-11" onClick={scrollToRules}>
              <BookOpen className="size-4" />
              Read the rules
            </Button>
          </div>
        </div>
      </section>

      {/* ---------- leaderboard strip ---------- */}
      {!loading && podium.length > 0 && (
        <section aria-label="Top tokens by market cap">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {podium.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate({ name: "token", id: t.id })}
                className={`glass card-hover flex items-center gap-3 rounded-2xl p-3 text-left ${i === 0 ? "neon-border" : ""}`}
                aria-label={`Rank ${i + 1}: ${t.name}`}
              >
                <span className={`flex min-w-8 items-center gap-1 text-lg font-black ${i === 0 ? "text-gradient" : "text-muted-foreground"}`}>
                  {i === 0 && <Crown className="size-4 text-amber-300" />}
                  #{i + 1}
                </span>
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10">
                  {t.imageUrl ? (
                    <Image src={t.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-600/80 to-cyan-500/80 text-[10px] font-black text-white/90">
                      {t.symbol.slice(0, 3)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{t.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{t.symbol}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold text-emerald-400">{usd(t.marketCapUsd, { compact: true })}</span>
                  <span className="block text-[10px] text-muted-foreground">{compact(t.tradeCount)} trades</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------- toolbar ---------- */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v === "following" ? "following" : v === "created" ? "created" : "terminal")}>
          <TabsList className="h-11 rounded-xl bg-white/5 p-1">
            <TabsTrigger value="terminal" className="rounded-lg px-4">Terminal</TabsTrigger>
            <TabsTrigger value="following" className="rounded-lg px-4">Following</TabsTrigger>
            <TabsTrigger value="created" className="rounded-lg px-4">Created</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <div className="relative flex-1 lg:w-64">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Token"
              aria-label="Search tokens by name or symbol"
              className="h-11 pl-9"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-11 w-36 rounded-xl" aria-label="Sort tokens">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Newest</SelectItem>
              <SelectItem value="progress">Hottest</SelectItem>
              <SelectItem value="mcap">Market Cap</SelectItem>
              <SelectItem value="trades">Most Trades</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ---------- token grid ---------- */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass overflow-hidden rounded-2xl">
              <Skeleton className="aspect-[4/3] w-full rounded-none" />
              <div className="space-y-2.5 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-1.5 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="glass space-y-3 rounded-2xl p-10 text-center">
          <Rocket className="mx-auto size-8 text-violet-400" />
          <h3 className="font-bold">{tab === "created" ? "You haven't launched anything yet" : "No tokens match your search"}</h3>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {tab === "created"
              ? "Your launches will appear here the moment they go live on the bonding curve."
              : "Try a different search, or be the one who fills the void."}
          </p>
          <Button className="glow-violet mx-auto h-11" onClick={() => setCreateOpen(true)}>
            <Rocket className="size-4" />
            Create a Token
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tokens.map((t) => (
            <TokenCard key={t.id} token={t} />
          ))}
        </div>
      )}

      {/* ---------- rules ---------- */}
      <section id="launch-rules" className="glass scroll-mt-24 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpen className="size-5 text-violet-400" aria-hidden="true" />
          <h2 className="text-lg font-bold">How launches work</h2>
          <Badge variant="outline" className="border-cyan-400/40 text-cyan-300">
            Simulated environment
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {RULES.map((r) => (
            <div key={r.title} className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                <r.icon className="size-4.5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">{r.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{r.text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          Everything on this page runs on a simulated devnet with fake SOL. No real funds are ever at risk — figures are for
          product demonstration only.
        </p>
      </section>

      <CreateTokenDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={handleCreated} />
    </div>
  );
}
