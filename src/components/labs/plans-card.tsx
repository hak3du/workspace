"use client";

// Quantum Labs — plan tiers (static, per product spec §18).
// Honesty footnotes: pricing is provisional and plan enforcement here is
// simulated — paid features must be enforced by the backend.
import { useState } from "react";
import { Layers, Compass, Megaphone, Terminal, Building2, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";

interface PlanDef {
  name: string;
  price: string;
  blurb: string;
  features: string[];
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  isDeveloper?: boolean;
}

const PLANS: PlanDef[] = [
  {
    name: "Explorer",
    price: "Free",
    blurb: "Get oriented in the Quantum universe.",
    features: ["Browse the media universe", "Join public Spaces", "Explore launches & tokens", "Simulated wallet"],
    icon: Compass,
  },
  {
    name: "Creator",
    price: "$12/mo (proposed)",
    blurb: "Audience tools for publishing at scale.",
    features: ["Advanced publishing tools", "Audience analytics", "Custom Spaces", "Priority studio features"],
    icon: Megaphone,
  },
  {
    name: "Developer",
    price: "$29/mo (proposed)",
    blurb: "Build on AHE and the Launchpad APIs.",
    features: ["AHE API usage & quotas", "Sandbox tools", "SDK access", "Usage analytics"],
    icon: Terminal,
    isDeveloper: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    blurb: "For teams with real obligations.",
    features: ["Negotiated limits", "Organization controls", "SLAs", "Direct support channel"],
    icon: Building2,
  },
];

export function PlansCard() {
  const { toast } = useToast();
  const role = useApp((s) => s.user?.role);
  const [hovered, setHovered] = useState<string | null>(null);

  function choose(plan: string) {
    toast({
      title: "Plan checkout is disabled in this build",
      description: `${plan} — pricing is provisional until service costs and obligations are assessed (spec §18).`,
    });
  }

  return (
    <Card className="glass card-hover">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-primary" aria-hidden />
          <CardTitle className="text-lg">Plans</CardTitle>
        </div>
        <CardDescription>
          Tier definitions follow spec §18. Exact pricing is set only after service costs and obligations are assessed
          (spec §18).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => {
            const isDev = p.isDeveloper === true;
            const isCurrentRole = isDev && role === "DEVELOPER";
            const Icon = p.icon;
            return (
              <div
                key={p.name}
                onMouseEnter={() => setHovered(p.name)}
                onMouseLeave={() => setHovered(null)}
                className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                  isDev
                    ? "neon-border border-primary/40 bg-primary/5"
                    : "border-white/8 bg-black/20 hover:border-white/15"
                } ${hovered === p.name ? "-translate-y-1" : ""}`}
              >
                {isCurrentRole ? (
                  <Badge className="absolute right-4 top-4 border-cyan-400/50 bg-cyan-400/10 text-cyan-300" variant="outline">
                    Current role
                  </Badge>
                ) : isDev ? (
                  <Badge className="absolute right-4 top-4" variant="default">
                    Popular
                  </Badge>
                ) : null}

                <Icon className="size-5 text-cyan-300" aria-hidden />
                <h3 className="mt-3 font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-gradient font-medium">{p.price}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.blurb}</p>

                <ul className="mt-4 space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  size="sm"
                  variant={isDev ? "default" : "secondary"}
                  className="mt-5 w-full"
                  onClick={() => choose(p.name)}
                >
                  {isCurrentRole ? "Manage plan" : `Choose ${p.name}`}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Paid features must be enforced by the backend — plan enforcement here is simulated. Checkout is disabled in
          this build.
        </p>
      </CardContent>
    </Card>
  );
}
