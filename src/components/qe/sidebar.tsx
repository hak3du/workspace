"use client";

import {
  Compass,
  FlaskConical,
  Layers,
  Plus,
  Rocket,
  LayoutDashboard,
  Users,
  X,
} from "lucide-react";
import { useApp } from "@/store/app-store";
import { cn } from "@/lib/utils";
import type { ViewName } from "@/lib/types";

const NAV: { name: ViewName; label: string; icon: typeof Compass; hint?: string }[] = [
  { name: "discover", label: "Discover", icon: Compass, hint: "The media universe" },
  { name: "spaces", label: "Spaces", icon: Users, hint: "Community worlds" },
  { name: "studio", label: "Creator Studio", icon: Layers, hint: "Publish & analytics" },
  { name: "launch", label: "Launch Arena", icon: Rocket, hint: "Token launchpad" },
  { name: "labs", label: "Quantum Labs", icon: FlaskConical, hint: "AHE + developer" },
  { name: "portfolio", label: "Portfolio", icon: LayoutDashboard, hint: "Wallet & holdings" },
];

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { view, navigate } = useApp();

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-5 lg:justify-start">
        <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Navigate</p>
        <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 lg:hidden" onClick={onClose} aria-label="Close navigation">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3" aria-label="Primary">
        {NAV.map((item) => {
          const active = view.name === item.name || (item.name === "launch" && view.name === "token") || (item.name === "spaces" && view.name === "space");
          return (
            <button
              key={item.name}
              onClick={() => {
                navigate({ name: item.name });
                onClose();
              }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-primary/15 text-foreground shadow-[inset_0_0_0_1px_rgba(139,92,246,0.35)]"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5 transition", active ? "text-primary" : "text-muted-foreground group-hover:text-primary/80")} />
              <span className="flex-1 text-left">{item.label}</span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(139,92,246,0.9)]" />}
            </button>
          );
        })}
      </nav>

      <div className="p-3">
        <button
          onClick={() => {
            navigate({ name: "launch" });
            onClose();
          }}
          className="glass card-hover flex w-full items-center gap-3 rounded-xl p-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <Plus className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Launch something</span>
            <span className="block text-xs text-muted-foreground">Token launch in ~60s · 0.02 SOL fee</span>
          </span>
        </button>
        <p className="mt-3 px-2 text-[10px] leading-relaxed text-muted-foreground/70">
          Simulated environment. No real funds, no financial advice.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-white/5 bg-sidebar/40 backdrop-blur lg:block">
        {content}
      </aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <aside className="glass-strong absolute left-0 top-0 h-full w-72 border-r border-white/10">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
