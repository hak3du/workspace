"use client";

// Quantum Labs — AHE v1 self-test suite card.
// Runs the real suite server-side (roundtrip, nonces, tamper, wrong key,
// version guard, key-material secrecy) against a scratch kid.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, FlaskConical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { post } from "@/lib/api";

// Structural mirror of the server's SelfTestResult — kept local so the client
// bundle never pulls in the server-only crypto module.
interface SelfTestRow {
  name: string;
  status: "PASS" | "FAIL";
  detail: string;
}

interface SelftestResponse {
  results: SelfTestRow[];
  allPassed: boolean;
  version: string;
  alg: string;
  kdf: string;
}

export function SelftestCard() {
  const [data, setData] = useState<SelftestResponse | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const res = await post<SelftestResponse>("/api/ahe/selftest");
      setData(res);
    } catch {
      // Card keeps last good state; a chip shows the failure below.
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const passed = data ? data.results.filter((r) => r.status === "PASS").length : 0;
  const failed = data ? data.results.length - passed : 0;

  return (
    <Card className="glass card-hover">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-5 text-cyan-300" aria-hidden />
            <CardTitle className="text-lg">AHE self-test</CardTitle>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void run()} disabled={running} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${running ? "animate-spin" : ""}`} aria-hidden />
            Run test suite
          </Button>
        </div>
        <CardDescription>
          Live verification of the running AHE v1 implementation — every run generates fresh keys and ciphertexts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {data ? (
            <>
              <Badge
                variant="outline"
                className={
                  data.allPassed
                    ? "border-cyan-400/50 text-cyan-300 glow-cyan"
                    : "border-red-400/50 text-red-400"
                }
              >
                {data.allPassed ? `${passed}/${data.results.length} PASS` : `${failed} FAILED`}
              </Badge>
              <Badge variant="outline" className="font-mono text-[11px]">{data.version}</Badge>
              <Badge variant="outline" className="font-mono text-[11px]">{data.alg}</Badge>
              <Badge variant="outline" className="font-mono text-[11px]">{data.kdf}</Badge>
            </>
          ) : (
            <>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </>
          )}
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {!data &&
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          {data?.results.map((r) => (
            <div
              key={r.name}
              className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-black/20 px-3 py-2.5"
            >
              {r.status === "PASS" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.detail}</p>
              </div>
              <span className="sr-only">{r.status}</span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Master key material is never exposed — the suite only asserts envelope structure and authentication
          behavior.
        </p>
      </CardContent>
    </Card>
  );
}
