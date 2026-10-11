"use client";

// Quantum project verification panel — self-contained, used on token pages
// (and exported from Quantum Labs for reuse). Fetches latest checks per name.
// Honesty rule: an unavailable check is not a passed check; attestations
// verify metadata signing — not project honesty or contract safety.
import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { VerificationCheckDTO } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

const STATUS_STYLE: Record<
  VerificationCheckDTO["status"],
  { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; cls: string; label: string }
> = {
  PASS: { icon: CheckCircle2, cls: "text-emerald-400", label: "Passed" },
  WARN: { icon: AlertTriangle, cls: "text-amber-400", label: "Warning" },
  FAIL: { icon: XCircle, cls: "text-red-400", label: "Failed" },
  UNAVAILABLE: { icon: MinusCircle, cls: "text-muted-foreground", label: "Unavailable" },
};

export function VerificationPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [checks, setChecks] = useState<VerificationCheckDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ checks: VerificationCheckDTO[] }>(
        `/api/verification?projectId=${encodeURIComponent(projectId)}`
      );
      setChecks(data.checks);
    } catch (err) {
      toast({ title: "Could not load verification checks", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="glass card-hover">
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-cyan-300" aria-hidden />
            <CardTitle className="text-lg">Quantum project verification</CardTitle>
          </span>
          <span className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={(e) => {
                e.stopPropagation();
                void load();
              }}
              aria-label="Refresh verification checks"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          {loading && !checks &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}

          {checks && checks.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No verification checks recorded for this project yet.
            </p>
          )}

          {checks?.map((c) => {
            const s = STATUS_STYLE[c.status] ?? STATUS_STYLE.UNAVAILABLE;
            const Icon = s.icon;
            return (
              <div key={c.id} className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-black/20 p-3">
                <Icon className={`mt-0.5 size-4 shrink-0 ${s.cls}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-medium">{c.name}</p>
                    <span className={`text-[10px] font-medium uppercase tracking-wide ${s.cls}`}>{s.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {c.source} · {timeAgo(c.checkedAt)}
                  </p>
                </div>
              </div>
            );
          })}

          <p className="pt-1 text-[11px] text-muted-foreground">
            An unavailable check is not a passed check. Attestations verify metadata signing — not project honesty or
            contract safety.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
