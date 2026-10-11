"use client";

// Quantum Labs — usage analytics: totals, latency bar chart (pure SVG,
// latest 24 events) and a recent-events feed.
import { useCallback, useEffect, useState } from "react";
import { Gauge, RefreshCw, Activity, AlertCircle, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { timeAgo, compact } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

interface UsageEvent {
  id: string;
  endpoint: string;
  status: "OK" | "ERROR";
  latencyMs: number;
  createdAt: string;
}

interface UsageResponse {
  totals: { calls: number; errors: number; avgLatencyMs: number };
  events: UsageEvent[];
  perKey: { keyId: string; label: string; used: number; quota: number }[];
}

const CHART_W = 600;
const CHART_H = 160;
const CHART_PAD_BOTTOM = 18;
const CHART_TOP = 10;

export function UsageCard() {
  const { toast } = useToast();
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api<UsageResponse>("/api/ahe/usage");
      setData(res);
    } catch (err) {
      toast({ title: "Could not load usage", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener("ahe:keys-changed", onChange);
    return () => window.removeEventListener("ahe:keys-changed", onChange);
  }, [load]);

  // Latest 24 events, drawn oldest → newest (time order on x).
  const chartEvents = data ? [...data.events].slice(0, 24).reverse() : [];
  const maxLatency = Math.max(1, ...chartEvents.map((e) => Math.max(e.latencyMs, 1)));
  const slot = chartEvents.length > 0 ? CHART_W / chartEvents.length : CHART_W;
  const barW = Math.max(4, Math.min(22, slot - 6));

  return (
    <Card className="glass card-hover">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gauge className="size-5 text-cyan-300" aria-hidden />
            <CardTitle className="text-lg">Usage</CardTitle>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void load()} className="gap-1.5 text-muted-foreground">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden /> Refresh
          </Button>
        </div>
        <CardDescription>Call volume, errors and latency across all of your AHE keys.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data ? (
          <>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-[160px] w-full" />
          </>
        ) : (
          <>
            {/* Totals chips */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Activity className="size-3.5 text-violet-300" aria-hidden />
                <span className="font-mono text-xs">{data ? compact(data.totals.calls) : 0}</span>
                <span className="text-xs text-muted-foreground">calls</span>
              </Badge>
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <AlertCircle className={`size-3.5 ${data && data.totals.errors > 0 ? "text-red-400" : "text-emerald-400"}`} aria-hidden />
                <span className="font-mono text-xs">{data ? compact(data.totals.errors) : 0}</span>
                <span className="text-xs text-muted-foreground">errors</span>
              </Badge>
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Zap className="size-3.5 text-cyan-300" aria-hidden />
                <span className="font-mono text-xs">{data ? data.totals.avgLatencyMs : 0} ms</span>
                <span className="text-xs text-muted-foreground">avg latency</span>
              </Badge>
            </div>

            {/* Latency chart — pure SVG, no deps */}
            <div className="rounded-xl border border-white/5 bg-black/20 p-3">
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="h-[160px] w-full"
                role="img"
                aria-label="Latency of the latest 24 AHE calls, oldest to newest"
              >
                <title>AHE latency — latest 24 calls</title>
                {/* baseline */}
                <line
                  x1={0}
                  x2={CHART_W}
                  y1={CHART_H - CHART_PAD_BOTTOM}
                  y2={CHART_H - CHART_PAD_BOTTOM}
                  stroke="currentColor"
                  strokeOpacity={0.15}
                />
                {chartEvents.map((e, i) => {
                  const h = Math.max(2, Math.round((e.latencyMs / maxLatency) * (CHART_H - CHART_PAD_BOTTOM - CHART_TOP)));
                  const x = i * slot + (slot - barW) / 2;
                  const y = CHART_H - CHART_PAD_BOTTOM - h;
                  return (
                    <rect
                      key={e.id}
                      x={x}
                      y={y}
                      width={barW}
                      height={h}
                      rx={2}
                      className={e.status === "OK" ? "fill-emerald-400" : "fill-red-400"}
                      opacity={0.9}
                    >
                      <title>{`${e.endpoint} · ${e.status} · ${e.latencyMs} ms · ${timeAgo(e.createdAt)}`}</title>
                    </rect>
                  );
                })}
                {chartEvents.length === 0 && (
                  <text x={CHART_W / 2} y={CHART_H / 2} textAnchor="middle" className="fill-current text-xs opacity-50">
                    No calls yet — run an encryption in the console
                  </text>
                )}
              </svg>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>oldest</span>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="inline-block size-2 rounded-sm bg-emerald-400" /> OK
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block size-2 rounded-sm bg-red-400" /> ERROR
                  </span>
                </span>
                <span>latest</span>
              </div>
            </div>

            {/* Event feed */}
            <ScrollArea className="max-h-56 pr-2">
              <div className="space-y-1.5">
                {(data?.events ?? []).map((e) => (
                  <div key={e.id} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${e.status === "OK" ? "bg-emerald-400" : "bg-red-400"}`}
                      aria-hidden
                    />
                    <span className="font-mono text-xs">{e.endpoint}</span>
                    <span className={`text-[11px] ${e.status === "OK" ? "text-emerald-400/80" : "text-red-400"}`}>{e.status}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">{e.latencyMs} ms</span>
                    <span className="w-20 text-right text-[11px] text-muted-foreground">{timeAgo(e.createdAt)}</span>
                  </div>
                ))}
                {data && data.events.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No usage events recorded yet.</p>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
