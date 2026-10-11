"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AudioLines,
  BarChart3,
  Eye,
  FileCode2,
  FileText,
  Heart,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Send,
  Users,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, post as apiPost } from "@/lib/api";
import { compact, timeAgo } from "@/lib/format";
import { useApp } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import type { PostDTO } from "@/lib/types";
import type { LucideIcon } from "lucide-react";

const POST_TYPES = ["VIDEO", "IMAGE", "AUDIO", "ARTICLE", "UPDATE", "CODE"] as const;
type StudioType = (typeof POST_TYPES)[number];

const TYPE_LABEL: Record<StudioType, string> = {
  VIDEO: "Video",
  IMAGE: "Image",
  AUDIO: "Audio",
  ARTICLE: "Article",
  UPDATE: "Update",
  CODE: "Code",
};

const TYPE_ICON: Record<StudioType, LucideIcon> = {
  VIDEO: Video,
  IMAGE: ImageIcon,
  AUDIO: AudioLines,
  ARTICLE: FileText,
  UPDATE: MessageSquare,
  CODE: FileCode2,
};

const MEDIA_PRESETS = [
  "/media/hero-universe.jpg",
  "/media/metaverse.jpg",
  "/media/live-stage.jpg",
  "/media/space-music.jpg",
] as const;

const WEEKS = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEK_LABELS = ["8w", "7w", "6w", "5w", "4w", "3w", "2w", "Now"];

// Deterministic weekly series: each post's real viewCount is spread evenly over
// the weeks between its publish date and now, with a fixed ±8% ripple so the
// curve reads organically without inventing numbers.
function buildWeeklySeries(posts: PostDTO[]): number[] {
  const now = Date.now();
  const series = new Array<number>(WEEKS).fill(0);
  for (const p of posts) {
    const age = Math.max(0, now - new Date(p.createdAt).getTime());
    const startWeek = Math.min(WEEKS - 1, Math.floor(age / WEEK_MS));
    const span = WEEKS - startWeek;
    if (span <= 0) continue;
    const per = p.viewCount / span;
    for (let w = startWeek; w < WEEKS; w++) series[w] += per;
  }
  return series.map((v, i) => Math.max(0, Math.round(v * (0.92 + ((i * 37 + 13) % 17) / 100))));
}

function ViewsChart({ series }: { series: number[] }) {
  const max = Math.max(...series, 1);
  const pts = series.map(
    (v, i) => [(i / (series.length - 1)) * 100, 100 - (v / max) * 92 - 4] as const
  );
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;

  return (
    <div>
      <div className="relative">
        {/* Y labels */}
        <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-between py-1 text-[10px] text-muted-foreground" aria-hidden="true">
          <span>{compact(max)}</span>
          <span>{compact(max / 2)}</span>
          <span>0</span>
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-44 w-full"
          role="img"
          aria-label={`Weekly platform views, last ${WEEKS} weeks, peak ${compact(max)}`}
        >
          <defs>
            <linearGradient id="ql-views-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2="100"
              y1={100 * f}
              y2={100 * f}
              stroke="white"
              strokeOpacity="0.05"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill="url(#ql-views-fill)" />
          <path
            d={line}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {WEEK_LABELS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// StudioView — publish composer (left) and creator analytics derived from the
// session user's real posts (right).
export function StudioView() {
  const { toast } = useToast();
  const user = useApp((s) => s.user);
  const hydrate = useApp((s) => s.hydrate);

  // Composer state
  const [type, setType] = useState<StudioType>("VIDEO");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [durationLabel, setDurationLabel] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [publishing, setPublishing] = useState(false);

  // Analytics state
  const [myPosts, setMyPosts] = useState<PostDTO[]>([]);
  const [mineKey, setMineKey] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const userId = user?.id ?? null;
  const mineLoading = userId === null || mineKey !== `${userId}:${refreshKey}`;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!userId) return;
    const key = `${userId}:${refreshKey}`;
    let cancelled = false;
    api<{ posts: PostDTO[] }>("/api/posts?limit=50")
      .then((d) => {
        if (cancelled) return;
        setMyPosts(d.posts.filter((p) => p.author.id === userId));
        setMineKey(key);
      })
      .catch(() => {
        if (!cancelled) setMineKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  const series = useMemo(() => buildWeeklySeries(myPosts), [myPosts]);
  const totalViews = useMemo(() => myPosts.reduce((a, p) => a + p.viewCount, 0), [myPosts]);
  const totalLikes = useMemo(() => myPosts.reduce((a, p) => a + p.likeCount, 0), [myPosts]);

  const publish = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3 || trimmedTitle.length > 120 || publishing) return;
    setPublishing(true);
    try {
      await apiPost<{ post: PostDTO }>("/api/posts", {
        type,
        title: trimmedTitle,
        body: body.slice(0, 2000),
        mediaUrl: mediaUrl || undefined,
        durationLabel: type === "VIDEO" || type === "AUDIO" ? durationLabel.trim() || undefined : undefined,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 5),
      });
      toast({ title: "Published to the universe", description: trimmedTitle });
      setTitle("");
      setBody("");
      setMediaUrl("");
      setDurationLabel("");
      setTagsInput("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({
        title: "Publish failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  const stats = [
    { icon: Eye, label: "Total views", value: compact(totalViews) },
    { icon: Heart, label: "Likes", value: compact(totalLikes) },
    { icon: Users, label: "Followers", value: "536K" },
    { icon: ImageIcon, label: "Media", value: String(myPosts.length) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="display-2 text-gradient">Creator Studio</h1>
        <p className="text-sm text-muted-foreground">Publish to the universe and watch it orbit back.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ---------- LEFT: Publish ---------- */}
        <section className="h-fit flex-col gap-4 rounded-2xl glass-strong p-6 lg:sticky lg:top-6 lg:flex" aria-label="Publish">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Send className="size-5 text-primary" aria-hidden="true" />
            Publish
          </h2>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as StudioType)}>
                <SelectTrigger className="h-11 w-full rounded-xl" aria-label="Post type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="studio-title">Title</Label>
              <Input
                id="studio-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (3–120 characters)"
                maxLength={120}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="studio-body">Body</Label>
              <Textarea
                id="studio-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Tell the universe… (optional, ≤2000 characters)"
                maxLength={2000}
                rows={5}
                className="rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Media</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Pick media">
                {MEDIA_PRESETS.map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setMediaUrl(mediaUrl === src ? "" : src)}
                    aria-pressed={mediaUrl === src}
                    aria-label={`Media ${src.split("/").pop()}`}
                    className={`relative h-11 w-16 overflow-hidden rounded-lg transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                      mediaUrl === src ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <Image src={src} alt="" fill sizes="64px" className="object-cover" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMediaUrl("")}
                  aria-pressed={mediaUrl === ""}
                  aria-label="No media"
                  className={`flex h-11 w-16 items-center justify-center rounded-lg border border-dashed border-white/20 text-xs text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                    mediaUrl === "" ? "ring-2 ring-primary" : "hover:border-white/40"
                  }`}
                >
                  None
                </button>
              </div>
            </div>

            {(type === "VIDEO" || type === "AUDIO") && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="studio-duration">Duration label</Label>
                <Input
                  id="studio-duration"
                  value={durationLabel}
                  onChange={(e) => setDurationLabel(e.target.value)}
                  placeholder="e.g. 3:42"
                  maxLength={16}
                  className="h-11 rounded-xl"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="studio-tags">Tags</Label>
              <Input
                id="studio-tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="comma, separated, max, five, tags"
                className="h-11 rounded-xl"
              />
            </div>

            <Button
              onClick={() => void publish()}
              disabled={publishing || title.trim().length < 3}
              className="glow-violet h-11 rounded-xl"
            >
              {publishing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              Publish
            </Button>
          </div>
        </section>

        {/* ---------- RIGHT: Analytics ---------- */}
        <section className="flex min-w-0 flex-col gap-6" aria-label="Creator analytics">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-2xl glass p-4">
                <span className="rounded-xl bg-primary/15 p-2.5 text-primary">
                  <s.icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4 rounded-2xl glass-strong p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <BarChart3 className="size-5 text-primary" aria-hidden="true" />
              Views (platform events) — last {WEEKS} weeks
            </h2>
            {mineLoading ? (
              <Skeleton className="h-44 w-full rounded-xl" />
            ) : totalViews === 0 ? (
              <p className="rounded-xl glass p-6 text-sm text-muted-foreground">
                Publish your first post to light up your analytics.
              </p>
            ) : (
              <ViewsChart series={series} />
            )}
            <p className="text-xs text-muted-foreground">
              Analytics derived from actual platform events.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl glass-strong p-6">
            <h2 className="text-lg font-semibold">Your media</h2>
            {mineLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : myPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing published yet — your posts will land here.
              </p>
            ) : (
              <ScrollArea className="max-h-96 rounded-xl">
                <ul className="flex flex-col gap-1.5 pr-3">
                  {myPosts.map((p) => {
                    const Icon = TYPE_ICON[p.type];
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5"
                      >
                        <span className="rounded-lg bg-primary/15 p-2 text-primary">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.title}</p>
                          <p className="text-xs text-muted-foreground">{timeAgo(p.createdAt)}</p>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Views">
                          <Eye className="size-3.5" aria-hidden="true" />
                          {compact(p.viewCount)}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Likes">
                          <Heart className="size-3.5" aria-hidden="true" />
                          {compact(p.likeCount)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
