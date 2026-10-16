"use client";

import { useEffect, useState } from "react";
import { Compass, LayoutDashboard, FlaskConical, Menu, Rocket, Users } from "lucide-react";
import { useApp } from "@/store/app-store";
import { TopBar } from "@/components/qe/top-bar";
import { Sidebar } from "@/components/qe/sidebar";
import { Ticker } from "@/components/qe/ticker";
import { ContextPanel } from "@/components/qe/context-panel";
import { AiGuide } from "@/components/qe/ai-guide";
import { Footer } from "@/components/qe/footer";
import { TradeDiscoverView } from "@/components/market/trade-discover-view";
import { SpacesView } from "@/components/spaces/spaces-view";
import { SpaceDetail } from "@/components/spaces/space-detail";
import { StudioView } from "@/components/studio/studio-view";
import { LaunchView } from "@/components/launch/launch-view";
import { TokenDetail } from "@/components/launch/token-detail";
import { LabsView } from "@/components/labs/labs-view";
import { PortfolioView } from "@/components/portfolio/portfolio-view";
import { cn } from "@/lib/utils";
import type { ViewName } from "@/lib/types";

export default function Home() {
  const { view, navigate, hydrate } = useApp();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <Ticker onNavigateToken={(id) => navigate({ name: "token", id })} />

      <div className="flex flex-1">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

        <main className="min-w-0 flex-1 px-4 pb-10 pt-6 sm:px-6" id="main">
          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="glass mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <ViewSwitch view={view} />
        </main>

        <ContextPanel />
      </div>

      <AiGuide />
      <Footer />
      <MobileBottomNav />
    </div>
  );
}

function ViewSwitch({ view }: { view: { name: ViewName; id?: string } }) {
  switch (view.name) {
    case "discover":
      return <TradeDiscoverView />;
    case "spaces":
      return <SpacesView />;
    case "space":
      return <SpaceDetail spaceId={view.id ?? ""} />;
    case "studio":
      return <StudioView />;
    case "launch":
      return <LaunchView />;
    case "token":
      return <TokenDetail tokenId={view.id ?? ""} />;
    case "labs":
      return <LabsView />;
    case "portfolio":
      return <PortfolioView />;
    default:
      return <TradeDiscoverView />;
  }
}

function MobileBottomNav() {
  const { view, navigate } = useApp();
  const items: { name: ViewName; label: string; icon: typeof Compass }[] = [
    { name: "discover", label: "Discover", icon: Compass },
    { name: "spaces", label: "Spaces", icon: Users },
    { name: "launch", label: "Launch", icon: Rocket },
    { name: "labs", label: "Labs", icon: FlaskConical },
    { name: "portfolio", label: "Wallet", icon: LayoutDashboard },
  ];
  return (
    <nav
      className="glass-strong fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-white/10 pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Mobile navigation"
    >
      {items.map((item) => {
        const active = view.name === item.name;
        return (
          <button
            key={item.name}
            onClick={() => navigate({ name: item.name })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <item.icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_rgba(139,92,246,0.8)]")} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
