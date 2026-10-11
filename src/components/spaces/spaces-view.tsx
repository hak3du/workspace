"use client";

import { useEffect, useState } from "react";
import { Globe, Loader2, Lock, Plus, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SpaceCard } from "@/components/spaces/space-card";
import { api, post as apiPost } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { SpaceDTO } from "@/lib/types";

const CATEGORIES = ["GAMING", "MUSIC", "AI", "CYBERSEC", "ART", "STARTUP", "EDU", "ARENA"] as const;

// Literal gradient presets so Tailwind's scanner sees every class we may apply.
const GRADIENTS = [
  "from-violet-600 to-cyan-500",
  "from-fuchsia-600 to-violet-600",
  "from-cyan-500 to-emerald-500",
  "from-amber-500 to-rose-500",
  "from-pink-500 to-violet-500",
] as const;

const EMOJIS = ["🚀", "🎮", "🎧", "🎨", "🔐", "🛠️", "🧪", "🌱"] as const;

// SpacesView — directory of Spaces with category filters and a create dialog.
export function SpacesView() {
  const { toast } = useToast();

  const [spaces, setSpaces] = useState<SpaceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState<string>("ARENA");
  const [emoji, setEmoji] = useState<string>("🚀");
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ spaces: SpaceDTO[] }>("/api/spaces")
      .then((d) => {
        if (!cancelled) setSpaces(d.spaces);
      })
      .catch(() => {
        if (!cancelled)
          toast({ title: "Could not load spaces", variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const categoriesPresent = Array.from(new Set(spaces.map((s) => s.category)));
  const visible = filter === "All" ? spaces : spaces.filter((s) => s.category === filter);

  const createSpace = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 40) {
      toast({ title: "Name must be 3–40 characters", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const r = await apiPost<{ space: SpaceDTO }>("/api/spaces", {
        name: trimmedName,
        tagline: tagline.trim(),
        category,
        iconEmoji: emoji,
        gradient: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)],
        visibility: isPrivate ? "PRIVATE" : "PUBLIC",
      });
      setSpaces((prev) => [r.space, ...prev]);
      setCreateOpen(false);
      setName("");
      setTagline("");
      setCategory("ARENA");
      setEmoji("🚀");
      setIsPrivate(false);
      toast({ title: "Space created", description: `${r.space.name} is live in the universe.` });
    } catch (e) {
      toast({
        title: "Could not create space",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="display-2 text-gradient">Spaces</h1>
          <p className="text-sm text-muted-foreground">
            Customizable digital worlds — Arenas for every culture.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="glow-violet h-11 rounded-xl px-5">
          <Plus className="size-4" aria-hidden="true" />
          Create Space
        </Button>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter spaces by category">
        {["All", ...categoriesPresent].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            aria-pressed={filter === c}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
              filter === c ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl glass">
              <Skeleton className="h-28 w-full rounded-none" />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl glass p-10 text-center">
          <Users className="size-8 text-primary" aria-hidden="true" />
          <p className="font-medium">No spaces here yet</p>
          <p className="text-sm text-muted-foreground">Create the first Space for this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <SpaceCard key={s.id} space={s} />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
              Create a Space
            </DialogTitle>
            <DialogDescription>
              Spin up a customizable world for your community.
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void createSpace();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="space-name">Name</Label>
              <Input
                id="space-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="3–40 characters"
                maxLength={40}
                className="h-11 rounded-xl"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="space-tagline">Tagline</Label>
              <Input
                id="space-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="One line about your world (optional)"
                maxLength={120}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v)}>
                <SelectTrigger className="h-11 w-full rounded-xl" aria-label="Category">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Choose an icon">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    aria-pressed={emoji === e}
                    aria-label={`Icon ${e}`}
                    className={`flex size-11 items-center justify-center rounded-xl text-2xl transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                      emoji === e ? "glass-strong ring-2 ring-primary" : "glass hover:ring-1 hover:ring-primary/50"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl glass p-3">
              <div className="flex items-center gap-2 text-sm">
                {isPrivate ? (
                  <Lock className="size-4 text-primary" aria-hidden="true" />
                ) : (
                  <Globe className="size-4 text-cyan-400" aria-hidden="true" />
                )}
                <span>{isPrivate ? "Private — invite only" : "Public — open to everyone"}</span>
              </div>
              <Switch
                checked={isPrivate}
                onCheckedChange={setIsPrivate}
                aria-label="Toggle private visibility"
              />
            </div>

            <Button type="submit" disabled={creating || name.trim().length < 3} className="glow-violet h-11 rounded-xl">
              {creating && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Create Space
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
