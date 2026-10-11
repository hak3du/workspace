"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { BadgeCheck, Compass, Eye, Play, Radio, Rocket, Sparkles, Users, Volume2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmojiAvatar, LiveBadge } from "@/components/discover/media-card";
import { MediaCard } from "@/components/discover/media-card";
import { PostDialog } from "@/components/discover/post-dialog";
import { api } from "@/lib/api";
import { compact, usd } from "@/lib/format";
import { useApp } from "@/store/app-store";
import type { BootstrapDTO, PostDTO } from "@/lib/types";

const TABS = [
  { id: "foryou", label: "For You" },
  { id: "following", label: "Following" },
  { id: "video", label: "Video" },
  { id: "image", label: "Images" },
  { id: "audio", label: "Audio" },
  { id: "article", label: "Articles" },
  { id: "live", label: "Live" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_HEADINGS: Record<TabId, string> = {
  foryou: "Latest from the universe",
  following: "From creators you follow",
  video: "Videos",
  image: "Images",
  audio: "Audio & sound",
  article: "Articles & essays",
  live: "Live right now",
};

// DiscoverView — the media universe landing: featured hero, live rail,
// trending grid and tabbed feed, backed by /api/bootstrap + /api/posts.
export function DiscoverView() {
  const navigate = useApp((s) => s.navigate);

  const [boot, setBoot] = useState<BootstrapDTO | null>(null);
  const [tab, setTab] = useState<TabId>("foryou");
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [postsForTab, setPostsForTab] = useState<TabId | null>(null);
  const postsLoading = postsForTab !== tab;

  const [selected, setSelected] = useState<PostDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openPost = useCallback((p: PostDTO) => {
    setSelected(p);
    setDialogOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<BootstrapDTO>("/api/bootstrap")
      .then((d) => {
        if (!cancelled) setBoot(d);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ posts: PostDTO[] }>(`/api/posts?tab=${tab}&limit=24`)
      .then((d) => {
        if (!cancelled) {
          setPosts(d.posts);
          setPostsForTab(tab);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPosts([]);
          setPostsForTab(tab);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const featured = boot?.featured ?? null;
  const stats = boot?.stats;

  return (
    <div className="flex flex-col gap-8">
      {/* ---------- HERO ---------- */}
      {boot === null ? (
        <Skeleton className="min-h-[380px] w-full rounded-3xl" />
      ) : (
        <section
          className="relative min-h-[380px] w-full overflow-hidden rounded-3xl"
          aria-label="Featured media"
        >
          {featured?.mediaUrl ? (
            <Image
              src={featured.mediaUrl}
              alt={featured.title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-violet-700/50 via-fuchsia-700/30 to-cyan-600/30" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-6 sm:p-10">
            <Badge className="glow-violet w-fit border-transparent bg-violet-600 tracking-[0.2em]">
              FEATURED
            </Badge>
            <h1 className="display-1 max-w-3xl text-white">
              {featured ? featured.title : "The Quantum Universe awaits"}
            </h1>
            {featured?.body && (
              <p className="line-clamp-2 max-w-2xl text-sm text-white/70 sm:text-base">{featured.body}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/80">
              {featured && (
                <>
                  <span className="inline-flex items-center gap-2">
                    <EmojiAvatar emoji={featured.author.avatarEmoji} color={featured.author.avatarColor} size={26} />
                    <span className="font-medium text-white">{featured.author.displayName}</span>
                    {featured.author.verified && (
                      <BadgeCheck className="size-4 text-cyan-400" aria-label="Verified creator" />
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Eye className="size-4" aria-hidden="true" />
                    {compact(featured.viewCount)} views
                  </span>
                  {featured.durationLabel && (
                    <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs">
                      {featured.durationLabel}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => featured && openPost(featured)}
                disabled={!featured}
                className="glow-violet h-11 rounded-xl px-6"
              >
                <Play className="size-4 fill-current" aria-hidden="true" />
                Play
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate({ name: "spaces" })}
                className="h-11 rounded-xl border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
              >
                <Compass className="size-4" aria-hidden="true" />
                Explore Spaces
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ---------- STAT STRIP ---------- */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Universe stats">
        {[
          { icon: Users, label: "Creators", value: stats ? compact(stats.creators) : "—" },
          { icon: Sparkles, label: "Media", value: stats ? compact(stats.media) : "—" },
          { icon: Rocket, label: "Launches", value: stats ? compact(stats.launches) : "—" },
          { icon: Wallet, label: "Volume", value: stats ? usd(stats.volumeUsd, { compact: true }) : "—" },
        ].map((s) => (
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
      </section>

      {/* ---------- TABS ---------- */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="px-3 sm:px-4">
                {t.id === "live" && <span className="live-dot size-1.5 rounded-full bg-red-500" aria-hidden="true" />}
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ---------- LIVE RAIL (For You) ---------- */}
        {tab === "foryou" && (
          <section className="mt-5" aria-label="Live now">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <span className="live-dot inline-block size-2 rounded-full bg-red-500" aria-hidden="true" />
              Live and happening now
            </h2>
            {boot === null ? (
              <div className="flex gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-video w-64 shrink-0 rounded-xl" />
                ))}
              </div>
            ) : (boot.live?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing streaming right now.</p>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-1 no-scrollbar">
                {boot!.live.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openPost(p)}
                    className="card-hover group relative aspect-video w-64 shrink-0 cursor-pointer overflow-hidden rounded-xl glass text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    aria-label={`Watch live: ${p.title}`}
                  >
                    {p.thumbUrl || p.mediaUrl ? (
                      <Image
                        src={(p.thumbUrl || p.mediaUrl)!}
                        alt=""
                        fill
                        sizes="256px"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="absolute inset-0 bg-gradient-to-br from-fuchsia-600/70 to-violet-800/80" />
                    )}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                    <LiveBadge className="absolute left-2.5 top-2.5" />
                    <span className="absolute inset-x-2.5 bottom-2.5 flex flex-col gap-1">
                      <span className="line-clamp-1 text-sm font-semibold text-white">{p.title}</span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-white/70">
                        <Eye className="size-3.5" aria-hidden="true" />
                        {compact(p.viewCount)} watching
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---------- TRENDING (For You) ---------- */}
        {tab === "foryou" && boot !== null && (boot.trending?.length ?? 0) > 0 && (
          <section className="mt-7" aria-label="Trending in the universe">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Radio className="size-5 text-primary" aria-hidden="true" />
              Trending in the universe
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {boot.trending.map((p) => (
                <MediaCard key={`trend-${p.id}`} post={p} onOpen={openPost} />
              ))}
            </div>
          </section>
        )}

        {/* ---------- FEED ---------- */}
        <section className="mt-7" aria-label={TAB_HEADINGS[tab]}>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Volume2 className="size-5 text-primary" aria-hidden="true" />
            {TAB_HEADINGS[tab]}
          </h2>

          {postsLoading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl glass">
                  <Skeleton className="aspect-video w-full rounded-none" />
                  <div className="flex flex-col gap-2 p-4">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl glass p-10 text-center">
              <Sparkles className="size-8 text-primary" aria-hidden="true" />
              <p className="font-medium">Nothing here yet</p>
              <p className="text-sm text-muted-foreground">
                {tab === "following"
                  ? "Join some Spaces to build your following feed."
                  : "Be the first to publish in this channel — head to the Studio."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {posts.map((p) => (
                <MediaCard key={p.id} post={p} onOpen={openPost} />
              ))}
            </div>
          )}
        </section>
      </Tabs>

      <PostDialog post={selected} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
