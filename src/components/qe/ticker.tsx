"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { api } from "@/lib/api";
import type { ActivityDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

// Live activity marquee — polls /api/activity which occasionally executes a
// simulated market-maker trade so the universe feels alive.
export function Ticker({ onNavigateToken }: { onNavigateToken?: (tokenId: string) => void }) {
  const [ticker, setTicker] = useState<ActivityDTO[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await api<{ ticker: ActivityDTO[] }>("/api/activity?limit=14");
        if (alive) setTicker(d.ticker);
      } catch {
        /* silent */
      }
    };
    load();
    const t = setInterval(load, 12000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (ticker.length === 0) {
    return (
      <div className="flex h-9 items-center gap-2 border-b border-white/5 bg-black/30 px-4 text-xs text-muted-foreground">
        <Radio className="h-3.5 w-3.5 animate-pulse text-primary" />
        <span>Connecting to the universe…</span>
      </div>
    );
  }

  const items = [...ticker, ...ticker]; // duplicate for seamless -50% loop

  return (
    <div className="relative flex h-9 items-center overflow-hidden border-b border-white/5 bg-black/30" aria-label="Live activity">
      <div className="z-10 flex h-full shrink-0 items-center gap-1.5 border-r border-white/10 bg-background/80 px-3 text-[11px] font-semibold uppercase tracking-wider text-destructive">
        <span className="live-dot h-2 w-2 rounded-full bg-destructive" />
        Live
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="animate-ticker flex w-max items-center whitespace-nowrap">
          {items.map((a, i) => (
            <button
              key={a.id + i}
              onClick={() => a.tokenId && onNavigateToken?.(a.tokenId)}
              className={cn(
                "flex items-center gap-2 px-4 text-xs text-muted-foreground transition hover:text-foreground",
                a.tokenId && "cursor-pointer"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  a.kind === "TRADE" && (a.title.includes("bought") ? "bg-emerald-400" : "bg-rose-400"),
                  a.kind === "LAUNCH" && "bg-primary",
                  a.kind === "GRADUATE" && "bg-cyan-400",
                  a.kind === "FOLLOW" && "bg-pink-400",
                  a.kind === "JOIN" && "bg-amber-400",
                  a.kind === "MILESTONE" && "bg-cyan-300"
                )}
              />
              <span className={cn(a.kind === "GRADUATE" && "text-cyan-300")}>{a.title}</span>
              <span className="text-white/15">|</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
