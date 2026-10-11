"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { usd, compact, timeAgo, pct } from "@/lib/format";
import { useApp } from "@/store/app-store";
import type { TokenDTO } from "@/lib/types";

export function TokenCard({ token }: { token: TokenDTO }) {
  const navigate = useApp((s) => s.navigate);
  const open = () => navigate({ name: "token", id: token.id });

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${token.name} (${token.symbol}) — market cap ${usd(token.marketCapUsd, { compact: true })}, curve ${Math.round(token.progress)}%`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="glass card-hover group cursor-pointer gap-0 overflow-hidden rounded-2xl py-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {token.imageUrl ? (
          <Image
            src={token.imageUrl}
            alt={`${token.name} cover art`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-violet-600/80 to-cyan-500/80">
            <span className="text-4xl font-black tracking-tight text-white/90 drop-shadow-lg">{token.symbol}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 to-transparent" />
        {token.status === "MIGRATED" ? (
          <Badge className="absolute top-3 left-3 border-cyan-400/40 bg-cyan-500/20 text-cyan-200 backdrop-blur">
            Graduated 🎓
          </Badge>
        ) : (
          <Badge className="absolute top-3 left-3 border-violet-400/40 bg-violet-500/25 text-violet-100 backdrop-blur">
            {Math.round(token.progress)}%
          </Badge>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-bold leading-tight">{token.name}</h3>
            <p className="mt-0.5 text-xs font-semibold tracking-wide text-violet-300">{token.symbol}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Created by <span className="font-medium text-foreground/80">{token.creator.displayName}</span>
        </p>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Marketcap</span>
          <span className="font-semibold text-emerald-400">{usd(token.marketCapUsd, { compact: true })}</span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Bonding curve</span>
            <span className="font-medium text-foreground/80">{pct(token.progress / 100)}</span>
          </div>
          <Progress
            value={token.progress}
            className="h-1.5 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-violet-500 [&_[data-slot=progress-indicator]]:to-cyan-400"
            aria-label={`Bonding curve progress ${Math.round(token.progress)}%`}
          />
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-2.5 text-[11px] text-muted-foreground">
          <span>{compact(token.tradeCount)} trades</span>
          <span>{timeAgo(token.lastTradeAt)}</span>
        </div>
      </div>
    </Card>
  );
}
