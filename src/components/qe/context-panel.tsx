"use client";

import { useEffect, useState } from "react";
import { Flame, PanelRightClose, Radio, Rocket, TrendingUp, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { BootstrapDTO, TokenDTO } from "@/lib/types";
import { compact, timeAgo, usd } from "@/lib/format";
import { useApp } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmojiAvatar } from "./avatar";

// Right context panel — recommendations, live activity, launch status.
export function ContextPanel() {
  const { contextOpen, toggleContext, navigate } = useApp();
  const [boot, setBoot] = useState<BootstrapDTO | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const load = () => api<BootstrapDTO>("/api/bootstrap").then(setBoot).catch(() => undefined);
    load();
    const t = setInterval(load, 25000);
    const tick = setInterval(() => setNow((n) => n + 1), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  }, []);

  if (!contextOpen) {
    return (
      <div className="sticky top-16 hidden h-fit w-12 shrink-0 justify-center pt-4 xl:flex">
        <Button variant="ghost" size="icon" onClick={toggleContext} aria-label="Open context panel" className="h-11 w-11 rounded-xl text-muted-foreground">
          <Rocket className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-80 shrink-0 overflow-y-auto border-l border-white/5 px-4 py-5 xl:block" aria-label="Context panel">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Happening now</p>
        <Button variant="ghost" size="icon" onClick={toggleContext} aria-label="Collapse context panel" className="h-8 w-8 rounded-lg text-muted-foreground">
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Live now */}
      {boot?.live && boot.live.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4 text-destructive" /> Live now
          </h3>
          <div className="space-y-2">
            {boot.live.map((p) => (
              <button key={p.id} onClick={() => navigate({ name: "discover" })} className="glass card-hover flex w-full items-center gap-3 rounded-xl p-2.5 text-left">
                <span className="relative">
                  <EmojiAvatar emoji={p.author.avatarEmoji} color={p.author.avatarColor} size={36} />
                  <span className="live-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{p.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {p.author.displayName} · {(p.viewCount / 1000).toFixed(1)}K watching
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Top launches */}
      {boot?.topTokens && boot.topTokens.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" /> Top launches
          </h3>
          <div className="glass rounded-2xl p-1.5">
            {boot.topTokens.slice(0, 5).map((t, i) => (
              <button
                key={t.id}
                onClick={() => navigate({ name: "token", id: t.id })}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/5"
              >
                <span className="w-4 text-xs font-bold text-muted-foreground">{i + 1}</span>
                {t.imageUrl ? (
                   
                  <img src={t.imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/70 to-cyan-500/70 text-[10px] font-bold text-white">
                    {t.symbol.slice(0, 3)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{t.symbol}</span>
                  <Progress value={t.progress} className="mt-1 h-1" />
                </span>
                <span className="text-right">
                  <span className="block text-xs font-semibold text-emerald-400">{usd(t.marketCapUsd, { compact: true })}</span>
                  <span className={cn("block text-[10px]", t.status === "MIGRATED" ? "text-cyan-400" : "text-muted-foreground")}>
                    {t.status === "MIGRATED" ? "graduated" : `${Math.round(t.progress)}%`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Spaces */}
      {boot?.topSpaces && boot.topSpaces.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-cyan-400" /> Active Spaces
          </h3>
          <div className="space-y-1.5">
            {boot.topSpaces.slice(0, 4).map((s) => (
              <button key={s.id} onClick={() => navigate({ name: "space", id: s.id })} className="glass card-hover flex w-full items-center gap-3 rounded-xl p-2.5 text-left">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-lg", s.gradient)}>{s.iconEmoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{s.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{compact(s.memberCount)} members</span>
                </span>
                {s.onlineCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {compact(s.onlineCount)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Platform stats */}
      {boot?.stats && (
        <section className="glass rounded-2xl p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Flame className="h-4 w-4 text-amber-400" /> Universe stats
          </h3>
          <div className="grid grid-cols-2 gap-3 text-center">
            <Stat label="Creators" value={compact(boot.stats.creators + 631_000)} />
            <Stat label="Media" value={compact(boot.stats.media + 1_240_000)} />
            <Stat label="Spaces" value={compact(boot.stats.spaces + 8_940)} />
            <Stat label="Launch volume" value={usd(boot.stats.volumeUsd + 4_260_000, { compact: true })} />
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/70">
            Simulated demo data for this environment.
          </p>
        </section>
      )}

      <p className="mt-6 px-1 text-center text-[10px] text-muted-foreground/60" suppressHydrationWarning>
        Panel refreshed {now % 2 === 0 ? "moments ago" : "just now"} · {timeAgo(new Date())}
      </p>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-2.5">
      <p className="text-sm font-bold text-foreground">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

export type { TokenDTO };
