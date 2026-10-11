"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  Crown,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  Shield,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmojiAvatar } from "@/components/discover/media-card";
import { MediaCard } from "@/components/discover/media-card";
import { PostDialog } from "@/components/discover/post-dialog";
import { api, post as apiPost } from "@/lib/api";
import { compact, timeAgo } from "@/lib/format";
import { useApp } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import type { PostDTO, SpaceEventDTO, SpaceMessageDTO, SpaceDTO, UserDTO } from "@/lib/types";
import type { SpaceDetailResponse } from "@/app/api/spaces/[id]/route";

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EventRow({ event }: { event: SpaceEventDTO }) {
  return (
    <li className="flex items-start gap-3 rounded-xl glass p-3">
      <span className="rounded-lg bg-primary/15 p-2 text-primary">
        <Calendar className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{event.title}</p>
        <p className="text-xs text-muted-foreground">{formatEventDate(event.startsAt)}</p>
      </div>
      <Badge variant="secondary" className="shrink-0 rounded-full text-[10px]">
        {event.kind}
      </Badge>
    </li>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "OWNER")
    return (
      <Badge className="gap-1 border-transparent bg-primary text-primary-foreground">
        <Crown className="size-3" aria-hidden="true" />
        Owner
      </Badge>
    );
  if (role === "MOD")
    return (
      <Badge className="gap-1 border-transparent bg-cyan-500/20 text-cyan-300">
        <Shield className="size-3" aria-hidden="true" />
        Mod
      </Badge>
    );
  return <Badge variant="secondary">Member</Badge>;
}

// SpaceDetail — banner, join flow and the Overview / Wall / Chat / Members /
// Events tabs. Chat polls every 4s for new messages.
export function SpaceDetail({ spaceId }: { spaceId: string }) {
  const back = useApp((s) => s.back);
  const { toast } = useToast();

  const [detail, setDetail] = useState<SpaceDetailResponse | null>(null);
  const [loadState, setLoadState] = useState<{ id: string; ok: boolean } | null>(null);
  const loading = loadState?.id !== spaceId;
  const failed = loadState !== null && loadState.id === spaceId && !loadState.ok;

  const [joinPending, setJoinPending] = useState(false);

  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [wallText, setWallText] = useState("");
  const [wallPending, setWallPending] = useState(false);

  const [messages, setMessages] = useState<SpaceMessageDTO[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const messagesRef = useRef<SpaceMessageDTO[]>([]);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);

  const [selected, setSelected] = useState<PostDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<SpaceDetailResponse>(`/api/spaces/${spaceId}`)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setPosts(d.posts);
        setMessages(d.messages);
        setLoadState({ id: spaceId, ok: true });
      })
      .catch(() => {
        if (!cancelled) setLoadState({ id: spaceId, ok: false });
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Chat polling — every 4s fetch messages newer than the last one we have.
  useEffect(() => {
    if (!detail) return;
    const interval = setInterval(() => {
      const last = messagesRef.current[messagesRef.current.length - 1];
      const after = last ? `?after=${encodeURIComponent(last.createdAt)}` : "";
      api<{ messages: SpaceMessageDTO[] }>(`/api/spaces/${spaceId}/messages${after}`)
        .then((r) => {
          if (r.messages.length === 0) return;
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = r.messages.filter((m) => !seen.has(m.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(interval);
  }, [detail, spaceId]);

  // Auto-scroll chat to the bottom when messages change.
  useEffect(() => {
    const vp = chatViewportRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
    if (vp) vp.scrollTop = vp.scrollHeight;
  }, [messages.length]);

  const openPost = useCallback((p: PostDTO) => {
    setSelected(p);
    setDialogOpen(true);
  }, []);

  const toggleJoin = async () => {
    if (!detail || joinPending || detail.space.myRole === "OWNER") return;
    const was = !!detail.space.joined;
    const prevCount = detail.space.memberCount;
    setDetail({
      ...detail,
      space: { ...detail.space, joined: !was, memberCount: Math.max(0, prevCount + (was ? -1 : 1)) },
    });
    setJoinPending(true);
    try {
      const r = await apiPost<{ joined: boolean; memberCount: number }>(
        `/api/spaces/${detail.space.id}/join`
      );
      setDetail((d) =>
        d && d.space.id === detail.space.id
          ? { ...d, space: { ...d.space, joined: r.joined, memberCount: r.memberCount } }
          : d
      );
    } catch {
      setDetail((d) =>
        d && d.space.id === detail.space.id
          ? { ...d, space: { ...d.space, joined: was, memberCount: prevCount } }
          : d
      );
      toast({ title: "Could not update membership", variant: "destructive" });
    } finally {
      setJoinPending(false);
    }
  };

  const submitWall = async () => {
    const text = wallText.trim();
    if (!text || wallPending || !detail) return;
    const lines = text.split("\n");
    const title = (lines[0] || "Update").slice(0, 120);
    const body = lines.slice(1).join("\n").slice(0, 2000);
    setWallPending(true);
    try {
      const r = await apiPost<{ post: PostDTO }>("/api/posts", {
        type: "UPDATE",
        title,
        body,
        spaceId: detail.space.id,
      });
      setPosts((prev) => [r.post, ...prev]);
      setWallText("");
      toast({ title: "Posted to the wall", description: title });
    } catch (e) {
      toast({
        title: "Could not post",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setWallPending(false);
    }
  };

  const sendChat = async () => {
    const text = chatText.trim();
    if (!text || chatPending || !detail) return;
    setChatPending(true);
    try {
      const r = await apiPost<{ message: SpaceMessageDTO }>(`/api/spaces/${detail.space.id}/messages`, {
        body: text,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === r.message.id) ? prev : [...prev, r.message]
      );
      setChatText("");
    } catch (e) {
      toast({
        title: "Message failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setChatPending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (failed || !detail || !detail.space || detail.space.id !== spaceId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl glass p-12 text-center">
        <p className="font-medium">Space not found</p>
        <Button variant="outline" onClick={back} className="h-11 rounded-xl">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Go back
        </Button>
      </div>
    );
  }

  const space: SpaceDTO & { joined?: boolean; myRole?: string | null } = detail.space;
  const joined = !!space.joined;
  const isOwner = space.myRole === "OWNER";

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" onClick={back} className="h-9 w-fit rounded-xl pl-2 text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back
      </Button>

      {/* Banner */}
      <section className={`relative flex h-40 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br ${space.gradient}`}>
        <span className="text-6xl drop-shadow-xl sm:text-7xl" aria-hidden="true">
          {space.iconEmoji}
        </span>
        {space.visibility === "PRIVATE" && (
          <Badge className="absolute right-4 top-4 border-white/20 bg-black/50 text-white backdrop-blur">
            Private
          </Badge>
        )}
      </section>

      {/* Header */}
      <section className="flex flex-col gap-4 rounded-2xl glass-strong p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="display-2">{space.name}</h1>
            <p className="text-sm text-muted-foreground">{space.tagline || "No tagline yet."}</p>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <EmojiAvatar emoji={space.owner.avatarEmoji} color={space.owner.avatarColor} size={22} />
              <span>{space.owner.displayName}</span>
              <span>·</span>
              <span className="font-mono text-xs">{space.category}</span>
            </div>
          </div>
          <Button
            onClick={() => void toggleJoin()}
            disabled={joinPending || isOwner}
            aria-pressed={joined}
            className={`h-11 min-w-32 rounded-xl ${joined ? "" : "glow-violet"}`}
            variant={joined ? "outline" : "default"}
          >
            {joinPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : joined ? (
              <Check className="size-4" aria-hidden="true" />
            ) : null}
            {isOwner ? "Owner" : joined ? "Joined ✓" : "Join"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/5 pt-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4" aria-hidden="true" />
            {compact(space.memberCount)} members
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
            {compact(space.onlineCount)} online
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="size-4" aria-hidden="true" />
            {compact(space.postCount ?? 0)} posts
          </span>
        </div>
      </section>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="wall">Wall</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>
        </div>

        {/* Overview */}
        <TabsContent value="overview" className="mt-5 flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Pinned posts</h2>
            {posts.length === 0 ? (
              <p className="rounded-2xl glass p-6 text-sm text-muted-foreground">
                No posts in this space yet — say hi on the Wall.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((p) => (
                  <MediaCard key={p.id} post={p} onOpen={openPost} />
                ))}
              </div>
            )}
          </section>

          {detail.events.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Upcoming events</h2>
              <ul className="flex flex-col gap-2">
                {detail.events.slice(0, 3).map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            </section>
          )}
        </TabsContent>

        {/* Wall */}
        <TabsContent value="wall" className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-2xl glass p-4">
            <Textarea
              value={wallText}
              onChange={(e) => setWallText(e.target.value)}
              placeholder="Share an update with the space… (first line becomes the title)"
              maxLength={1200}
              rows={4}
              className="rounded-xl"
              aria-label="Write a wall post"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Posted as UPDATE · {1200 - wallText.length} characters left
              </span>
              <Button
                onClick={() => void submitWall()}
                disabled={!wallText.trim() || wallPending}
                className="glow-violet h-11 rounded-xl"
              >
                {wallPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
                Post to wall
              </Button>
            </div>
          </div>

          {posts.length === 0 ? (
            <p className="rounded-2xl glass p-6 text-sm text-muted-foreground">The wall is empty.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {posts
                .filter((p) => p.type === "UPDATE")
                .map((p) => (
                  <li key={p.id} className="rounded-2xl glass p-4">
                    <button
                      type="button"
                      onClick={() => openPost(p)}
                      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 rounded-xl"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <EmojiAvatar emoji={p.author.avatarEmoji} color={p.author.avatarColor} size={24} />
                        <span className="font-medium">{p.author.displayName}</span>
                        <span className="text-muted-foreground">· {timeAgo(p.createdAt)}</span>
                      </span>
                      <span className="mt-2 block font-medium">{p.title}</span>
                      {p.body && (
                        <span className="mt-1 block whitespace-pre-line text-sm text-muted-foreground">
                          {p.body}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </TabsContent>

        {/* Chat */}
        <TabsContent value="chat" className="mt-5 flex flex-col gap-3">
          <div ref={chatViewportRef}>
            <ScrollArea className="h-96 rounded-2xl glass p-4">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No messages yet — say something to the space.
                </p>
              ) : (
                <ul className="flex flex-col gap-3 pr-3">
                  {messages.map((m) => (
                    <li key={m.id} className="flex items-start gap-2.5">
                      <EmojiAvatar emoji={m.author.avatarEmoji} color={m.author.avatarColor} size={26} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-medium">{m.author.displayName}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {new Date(m.createdAt).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-sm break-words text-foreground/90">{m.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>

          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat();
            }}
          >
            <Input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Message the space…"
              maxLength={400}
              className="h-11 flex-1 rounded-xl"
              aria-label="Chat message"
            />
            <Button type="submit" disabled={!chatText.trim() || chatPending} className="glow-violet h-11 rounded-xl">
              {chatPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <MessageSquare className="size-4" aria-hidden="true" />
              )}
              <span className="sr-only sm:not-sr-only">Send</span>
            </Button>
          </form>
        </TabsContent>

        {/* Members */}
        <TabsContent value="members" className="mt-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {detail.members.map((u: UserDTO & { role: string }) => (
              <div key={u.id} className="flex items-center gap-3 rounded-2xl glass p-4">
                <EmojiAvatar emoji={u.avatarEmoji} color={u.avatarColor} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.handle}</p>
                </div>
                <RoleBadge role={u.role} />
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Events */}
        <TabsContent value="events" className="mt-5">
          {detail.events.length === 0 ? (
            <p className="rounded-2xl glass p-6 text-sm text-muted-foreground">
              No events scheduled — check back soon.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.events.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <PostDialog post={selected} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
