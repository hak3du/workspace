"use client";

import { Sparkles, ShieldCheck, Rocket, Github } from "lucide-react";
import { useApp } from "@/store/app-store";

// Footer — sticks to the bottom on short pages (parent uses min-h-screen flex-col + mt-auto).
export function Footer() {
  const { navigate } = useApp();
  return (
    <footer className="mt-auto border-t border-white/5 bg-black/30 pb-24 lg:pb-[max(env(safe-area-inset-bottom),0px)]">
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-cyan-400 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-base font-extrabold tracking-tight">
                QUANTUM<span className="text-gradient"> LAUNCHPAD</span>
              </span>
            </div>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
              A media-first digital universe: discover content, build communities, launch digital assets, and explore
              cryptographic technology — one coherent product.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
              Simulated environment · no real funds · not financial advice
            </div>
          </div>

          <FooterCol
            title="Experience"
            links={[
              { label: "Discover", onClick: () => navigate({ name: "discover" }) },
              { label: "Spaces", onClick: () => navigate({ name: "spaces" }) },
              { label: "Creator Studio", onClick: () => navigate({ name: "studio" }) },
              { label: "Portfolio", onClick: () => navigate({ name: "portfolio" }) },
            ]}
          />
          <FooterCol
            title="Platform"
            links={[
              { label: "Launch Arena", onClick: () => navigate({ name: "launch" }) },
              { label: "Quantum Labs", onClick: () => navigate({ name: "labs" }) },
              { label: "Quantum Guide (AI)", onClick: () => useApp.getState().setAiOpen(true) },
            ]}
          />
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/80">V2.5</p>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Rocket className="h-3.5 w-3.5 text-primary" /> Five products, one universe
              </li>
              <li className="flex items-center gap-2">
                <Github className="h-3.5 w-3.5 text-muted-foreground" /> AHE-1 · A256GCM · HKDF-SHA256
              </li>
              <li>ML-KEM integration: planned stage</li>
              <li>© 2026 Quantum Launchpad</li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; onClick: () => void }[] }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/80">{title}</p>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <button onClick={l.onClick} className="text-xs text-muted-foreground transition hover:text-foreground">
              {l.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
