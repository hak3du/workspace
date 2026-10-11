"use client";

// Quantum Labs — module shell: AHE crypto service console + developer platform.
// Honest positioning: AHE v1 = HKDF-SHA256 + AES-256-GCM over versioned
// envelopes. The envelope is the integration point for a future ML-KEM
// post-quantum stage; v1 does NOT claim post-quantum security.
import { FlaskConical, KeyRound, ShieldCheck, Gauge, Layers, Cpu, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AheConsole } from "@/components/labs/ahe-console";
import { ApiKeysCard } from "@/components/labs/api-keys-card";
import { UsageCard } from "@/components/labs/usage-card";
import { SelftestCard } from "@/components/labs/selftest-card";
import { PlansCard } from "@/components/labs/plans-card";

function SectionHeading({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
        <Icon className="size-4 text-primary" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {hint && <span className="hidden text-xs text-muted-foreground sm:inline">— {hint}</span>}
    </div>
  );
}

export function LabsView() {
  return (
    <div className="space-y-10" aria-label="Quantum Labs">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden rounded-3xl glass-strong neon-border p-6 sm:p-10">
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-cyan-400/10 blur-3xl"
          aria-hidden
        />
        <div className="relative space-y-4">
          <Badge variant="outline" className="gap-1.5 border-cyan-400/40 px-3 py-1 text-[11px] tracking-[0.18em] text-cyan-300">
            <FlaskConical className="size-3.5" aria-hidden /> QUANTUM LABS
          </Badge>
          <h1 className="display-2 max-w-3xl">
            Adaptive Hashing Encryption, <span className="text-gradient">developer platform</span> &amp; verification
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            AHE v1 combines HKDF-SHA256 key derivation with AES-256-GCM authenticated encryption over versioned
            envelopes. The envelope format is the integration point for a future ML-KEM post-quantum key-establishment
            stage. v1 does not claim post-quantum security.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 font-mono text-[11px]">
              <Cpu className="size-3 text-violet-300" aria-hidden /> AHE-1 · A256GCM · HKDF-SHA256
            </Badge>
            <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
              post-quantum roadmap: ML-KEM integration point (planned stage)
            </Badge>
            <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
              master secrets never leave the server
            </Badge>
          </div>
        </div>
      </section>

      {/* ---------- Console + self-test ---------- */}
      <section aria-label="AHE console and self-test">
        <SectionHeading icon={FlaskConical} title="AHE service console" hint="encrypt · decrypt · verify the implementation" />
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <AheConsole />
          </div>
          <SelftestCard />
        </div>
      </section>

      {/* ---------- Keys + usage ---------- */}
      <section aria-label="API keys and usage">
        <SectionHeading icon={KeyRound} title="Developer platform" hint="keys · quotas · analytics" />
        <div className="grid gap-6 lg:grid-cols-2">
          <ApiKeysCard />
          <UsageCard />
        </div>
      </section>

      {/* ---------- Plans ---------- */}
      <section aria-label="Plans">
        <SectionHeading icon={Layers} title="Plans & limits" hint="spec §18 — provisional pricing" />
        <PlansCard />
      </section>

      {/* ---------- Verification (also embedded on token pages) ---------- */}
      <section aria-label="Verification docs note" className="flex items-start gap-2.5 rounded-2xl border border-white/5 bg-black/20 p-4 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cyan-300" aria-hidden />
        <p>
          Project verification checks render inside every token page&apos;s verification tab (see{" "}
          <code className="font-mono text-[11px] text-cyan-200">VerificationPanel</code>) and are exposed via{" "}
          <code className="font-mono text-[11px] text-cyan-200">GET /api/verification?projectId=…</code> for programmatic
          access.
          <BookOpen className="ml-1 inline size-3" aria-hidden />
        </p>
        <Gauge className="ml-auto hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
      </section>

      {/* VerificationPanel is self-contained (projectId prop) and rendered by the
          token pages' verification tab — imported directly from this module. */}
    </div>
  );
}
