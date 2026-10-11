"use client";

// Quantum Labs — API key management card.
// Full secrets are shown exactly once at creation; lists only ever carry the
// public prefix. Revocation is a soft delete (usage history stays intact).
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Copy, Ban, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, post, del } from "@/lib/api";
import type { ApiKeyDTO } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

const PLANS = [
  { value: "FREE", label: "Free · 1,000 calls" },
  { value: "PRO", label: "Pro · 50,000 calls" },
  { value: "ENTERPRISE", label: "Enterprise · 1,000,000 calls" },
] as const;

export function ApiKeysCard() {
  const { toast } = useToast();

  const [keys, setKeys] = useState<ApiKeyDTO[]>([]);
  const [loading, setLoading] = useState(true);

  // create dialog state
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [environment, setEnvironment] = useState<"SANDBOX" | "PRODUCTION">("SANDBOX");
  const [plan, setPlan] = useState<"FREE" | "PRO" | "ENTERPRISE">("FREE");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyDTO | null>(null);
  const [createdFullKey, setCreatedFullKey] = useState<string | null>(null);

  // two-step revoke ("Sure?") state
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ keys: ApiKeyDTO[] }>("/api/ahe/keys");
      setKeys(data.keys);
    } catch (err) {
      toast({ title: "Could not load API keys", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function broadcastKeysChanged() {
    window.dispatchEvent(new CustomEvent("ahe:keys-changed"));
  }

  async function createKey() {
    setCreating(true);
    try {
      const data = await post<{ key: ApiKeyDTO; fullKey: string }>("/api/ahe/keys", { label, environment, plan });
      setCreatedKey(data.key);
      setCreatedFullKey(data.fullKey);
      setLabel("");
      broadcastKeysChanged();
    } catch (err) {
      toast({ title: "Could not create key", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (confirmingId !== id) {
      setConfirmingId(id);
      window.setTimeout(() => setConfirmingId((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    setConfirmingId(null);
    try {
      await del(`/api/ahe/keys/${id}`);
      toast({ title: "Key revoked", description: "Envelopes encrypted under it can no longer be opened." });
      void load();
      broadcastKeysChanged();
    } catch (err) {
      toast({ title: "Revoke failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  async function copyFullKey() {
    if (!createdFullKey) return;
    try {
      await navigator.clipboard.writeText(createdFullKey);
      toast({ title: "Secret copied — store it somewhere safe" });
    } catch {
      toast({ title: "Clipboard unavailable — select and copy manually", variant: "destructive" });
    }
  }

  function resetDialog() {
    setOpen(false);
    setCreatedKey(null);
    setCreatedFullKey(null);
    setEnvironment("SANDBOX");
    setPlan("FREE");
    void load();
  }

  return (
    <Card className="glass card-hover">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" aria-hidden />
            <CardTitle className="text-lg">API keys</CardTitle>
          </div>
          <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetDialog())}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 glow-violet">
                <Plus className="size-3.5" aria-hidden /> New key
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-strong sm:max-w-md">
              {createdKey && createdFullKey ? (
                // ---- SUCCESS STATE: shown-once secret ----
                <div className="space-y-4">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <CheckCircle2 className="size-5 text-emerald-400" aria-hidden /> Key created
                    </DialogTitle>
                    <DialogDescription>
                      {createdKey.label} · {createdKey.environment} · {createdKey.plan}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
                    <p className="text-xs text-amber-200">
                      Copy now — this secret is shown only once. You won&apos;t see this again.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-black/50 px-3 py-2.5 font-mono text-xs text-cyan-100">
                      {createdFullKey}
                    </code>
                    <Button size="sm" onClick={() => void copyFullKey()} className="gap-1.5 shrink-0">
                      <Copy className="size-3.5" aria-hidden /> Copy
                    </Button>
                  </div>
                  <DialogFooter>
                    <Button onClick={resetDialog}>Done — refresh list</Button>
                  </DialogFooter>
                </div>
              ) : (
                // ---- CREATE FORM ----
                <div className="space-y-4">
                  <DialogHeader>
                    <DialogTitle>Create API key</DialogTitle>
                    <DialogDescription>
                      Keys are hashed with SHA-256 before storage — the full secret is returned once, at creation.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-1.5">
                    <Label htmlFor="key-label">Label</Label>
                    <Input
                      id="key-label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. Production backend"
                      maxLength={40}
                    />
                    {label.trim().length > 0 && label.trim().length < 2 && (
                      <p className="text-xs text-muted-foreground">Minimum 2 characters.</p>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Environment</Label>
                      <Select value={environment} onValueChange={(v) => setEnvironment(v as "SANDBOX" | "PRODUCTION")}>
                        <SelectTrigger aria-label="Environment">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SANDBOX">SANDBOX</SelectItem>
                          <SelectItem value="PRODUCTION">PRODUCTION</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Plan</Label>
                      <Select value={plan} onValueChange={(v) => setPlan(v as "FREE" | "PRO" | "ENTERPRISE")}>
                        <SelectTrigger aria-label="Plan">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLANS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={resetDialog}>
                      Cancel
                    </Button>
                    <Button onClick={() => void createKey()} disabled={creating || label.trim().length < 2} className="gap-1.5">
                      <Plus className="size-4" aria-hidden /> {creating ? "Creating…" : "Create key"}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription>
          Keys sign your AHE calls. Revoking a key stops decryption of new envelopes but keeps the audit trail.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : keys.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No API keys yet — create one to start encrypting.
          </p>
        ) : (
          <ScrollArea className="max-h-72 pr-2">
            <div className="space-y-2">
              {keys.map((k) => {
                const pct = Math.min(100, Math.round((k.used / Math.max(1, k.quota)) * 100));
                return (
                  <div
                    key={k.id}
                    className="rounded-xl border border-white/5 bg-black/20 p-3 transition-colors hover:border-white/10"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-cyan-200">{k.prefix}…</span>
                      <span className="truncate text-sm font-medium">{k.label}</span>
                      <Badge
                        variant="outline"
                        className={
                          k.environment === "PRODUCTION"
                            ? "border-primary/50 text-violet-300"
                            : "border-cyan-400/50 text-cyan-300"
                        }
                      >
                        {k.environment}
                      </Badge>
                      <Badge variant="secondary" className="text-[11px]">{k.plan}</Badge>
                      <div className="ml-auto flex items-center gap-2">
                        <span className={`text-[11px] ${k.revoked ? "text-muted-foreground" : "text-emerald-400"}`}>
                          {k.revoked ? "Revoked" : "Active"}
                        </span>
                        {!k.revoked && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-7 gap-1 px-2 text-xs ${
                              confirmingId === k.id ? "text-destructive hover:text-destructive" : "text-muted-foreground"
                            }`}
                            onClick={() => void revoke(k.id)}
                            aria-label={confirmingId === k.id ? "Confirm revoke" : `Revoke ${k.label}`}
                          >
                            <Ban className="size-3.5" aria-hidden />
                            {confirmingId === k.id ? "Sure?" : "Revoke"}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={pct} className="h-1 flex-1" aria-label={`Usage ${pct}%`} />
                      <span className="w-24 text-right font-mono text-[11px] text-muted-foreground">
                        {k.used.toLocaleString()}/{k.quota.toLocaleString()}
                      </span>
                      <span className="w-20 text-right text-[11px] text-muted-foreground">
                        {k.lastUsedAt ? timeAgo(k.lastUsedAt) : "never used"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
