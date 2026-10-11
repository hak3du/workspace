"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AudioLines, Bookmark, Heart, Link2, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmojiAvatar, LiveBadge } from "@/components/discover/media-card";
import { api, post as apiPost } from "@/lib/api";
import { compact, timeAgo } from "@/lib/format";
import { useApp } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import type { CommentDTO, PostDTO } from "@/lib/types";

interface PostDetailResponse {
  post: PostDTO;
  comments: CommentDTO[];
}

// PostDialog — full post reader: media hero, body, like/save/share actions and
// a comment thread with optimistic updates. Feed data renders instantly while
// the detailed fetch refines counts and comments.
export function PostDialog({
  post,
  open,
  onOpenChange,
}: {
  post: PostDTO | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const user = useApp((s) => s.user);

  const [detail, setDetail] = useState<PostDTO | null>(null);
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [savePending, setSavePending] = useState(false);

  const loading = open && loadedId !== (post?.id ?? null);
  const shown = detail && loadedId !== null && detail.id === post?.id ? detail : post;

  useEffect(() => {
    if (!open || !post) return;
    let cancelled = false;
    api<PostDetailResponse>(`/api/posts/${post.id}`)
      .then((d) => {
        if (cancelled) return;
        setDetail(d.post);
        setComments(d.comments);
        setLoadedId(d.post.id);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadedId(post.id); // fall back to the feed summary already rendered
        toast({ title: "Could not load comments", variant: "destructive" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, post, toast]);

  if (!post) return null;

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setLoadedId(null);
      setComments([]);
      setCommentText("");
    }
    onOpenChange(o);
  };

  const toggleLike = async () => {
    if (!shown || likePending || loading) return;
    const wasLiked = !!shown.liked;
    setDetail({
      ...shown,
      liked: !wasLiked,
      likeCount: Math.max(0, shown.likeCount + (wasLiked ? -1 : 1)),
    });
    setLoadedId(shown.id);
    setLikePending(true);
    try {
      const r = await apiPost<{ liked: boolean; likeCount: number }>(`/api/posts/${shown.id}/like`);
      setDetail((d) => (d && d.id === shown.id ? { ...d, liked: r.liked, likeCount: r.likeCount } : d));
    } catch {
      setDetail((d) =>
        d && d.id === shown.id
          ? { ...d, liked: wasLiked, likeCount: Math.max(0, d.likeCount + (wasLiked ? 1 : -1)) }
          : d
      );
      toast({ title: "Could not update like", variant: "destructive" });
    } finally {
      setLikePending(false);
    }
  };

  const toggleSave = async () => {
    if (!shown || savePending || loading) return;
    const wasSaved = !!shown.saved;
    setDetail({
      ...shown,
      saved: !wasSaved,
      saveCount: Math.max(0, shown.saveCount + (wasSaved ? -1 : 1)),
    });
    setLoadedId(shown.id);
    setSavePending(true);
    try {
      const r = await apiPost<{ saved: boolean; saveCount: number }>(`/api/posts/${shown.id}/save`);
      setDetail((d) => (d && d.id === shown.id ? { ...d, saved: r.saved, saveCount: r.saveCount } : d));
    } catch {
      setDetail((d) =>
        d && d.id === shown.id
          ? { ...d, saved: wasSaved, saveCount: Math.max(0, d.saveCount + (wasSaved ? 1 : -1)) }
          : d
      );
      toast({ title: "Could not update save", variant: "destructive" });
    } finally {
      setSavePending(false);
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/`);
      toast({ title: "Link copied", description: "Post link is on your clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  };

  const submitComment = async () => {
    const text = commentText.trim();
    if (!shown || !text || sending) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: CommentDTO = {
      id: tempId,
      body: text,
      createdAt: new Date().toISOString(),
      author: {
        id: user?.id ?? "you",
        handle: user?.handle ?? "@you",
        displayName: user?.displayName ?? "You",
        avatarEmoji: user?.avatarEmoji ?? "🛸",
        avatarColor: user?.avatarColor ?? "#8b5cf6",
        verified: user?.verified ?? false,
        followers: user?.followers ?? 0,
      },
    };
    setComments((c) => [...c, optimistic]);
    setCommentText("");
    setSending(true);
    try {
      const r = await apiPost<{ comment: CommentDTO; commentCount: number }>(
        `/api/posts/${shown.id}/comments`,
        { body: text }
      );
      setComments((c) => c.map((x) => (x.id === tempId ? r.comment : x)));
      setDetail((d) => (d && d.id === shown.id ? { ...d, commentCount: r.commentCount } : d));
    } catch (e) {
      setComments((c) => c.filter((x) => x.id !== tempId));
      setCommentText(text);
      toast({
        title: "Comment failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const isAudio = shown?.type === "AUDIO";
  const showImageHero = !!shown?.mediaUrl && (shown.type === "VIDEO" || shown.type === "IMAGE");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass-strong max-h-[92vh] overflow-hidden p-0 sm:max-w-3xl">
        <div className="max-h-[calc(92vh-2px)] overflow-y-auto">
          {shown?.isLive && (
            <div className="flex items-center gap-2 bg-gradient-to-r from-red-700 via-red-600 to-rose-500 px-5 py-2.5 text-sm font-medium text-white">
              <LiveBadge className="border-transparent bg-black/30" />
              <span>Streaming now — {compact(shown.viewCount)} watching</span>
            </div>
          )}

          {showImageHero && shown?.mediaUrl ? (
            <div className="relative aspect-video w-full overflow-hidden bg-black">
              <Image
                src={shown.mediaUrl}
                alt={shown.title}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
                priority
              />
              {shown.durationLabel && (
                <span className="absolute bottom-3 right-3 rounded-md bg-black/70 px-2 py-0.5 font-mono text-xs text-white">
                  {shown.durationLabel}
                </span>
              )}
            </div>
          ) : isAudio && shown ? (
            <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden bg-gradient-to-br from-fuchsia-600/70 to-violet-800/80">
              <AudioLines className="size-20 text-white/90" aria-hidden="true" />
              {shown.durationLabel && (
                <span className="rounded-md bg-black/40 px-2 py-0.5 font-mono text-xs text-white">
                  {shown.durationLabel}
                </span>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 p-5 sm:p-6">
            {shown ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-full font-mono text-[11px]">
                    {shown.type}
                  </Badge>
                  {shown.space && (
                    <Badge variant="outline" className="rounded-full text-[11px] text-muted-foreground">
                      {shown.space.name}
                    </Badge>
                  )}
                </div>

                <DialogTitle asChild>
                  <h2 className="display-2">{shown.title}</h2>
                </DialogTitle>

                <div className="flex items-center gap-2.5 text-sm">
                  <EmojiAvatar emoji={shown.author.avatarEmoji} color={shown.author.avatarColor} size={30} />
                  <div className="flex flex-col leading-tight">
                    <span className="font-medium">{shown.author.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      {shown.author.handle} · {timeAgo(shown.createdAt)}
                    </span>
                  </div>
                </div>

                {shown.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {shown.tags.map((t) => (
                      <span key={t} className="rounded-full glass px-2 py-0.5 text-xs text-muted-foreground">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                {shown.body && (
                  <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
                    {shown.body}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 border-y border-white/5 py-3">
                  <Button
                    variant="outline"
                    onClick={() => void toggleLike()}
                    disabled={likePending || loading}
                    className={`h-10 rounded-xl ${shown.liked ? "border-red-500/50 bg-red-500/10 text-red-400 hover:text-red-300" : ""}`}
                    aria-pressed={shown.liked}
                  >
                    {likePending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Heart className={`size-4 ${shown.liked ? "fill-current" : ""}`} aria-hidden="true" />
                    )}
                    {compact(shown.likeCount)}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void toggleSave()}
                    disabled={savePending || loading}
                    className={`h-10 rounded-xl ${shown.saved ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300" : ""}`}
                    aria-pressed={shown.saved}
                  >
                    {savePending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Bookmark className={`size-4 ${shown.saved ? "fill-current" : ""}`} aria-hidden="true" />
                    )}
                    {compact(shown.saveCount)}
                  </Button>
                  <Button variant="outline" onClick={() => void share()} className="h-10 rounded-xl">
                    <Link2 className="size-4" aria-hidden="true" />
                    Share
                  </Button>
                  <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    {compact(shown.viewCount)} views · {compact(shown.commentCount)} comments
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    Comments
                  </h3>

                  {loading ? (
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-12 w-full rounded-xl" />
                      <Skeleton className="h-12 w-4/5 rounded-xl" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No comments yet — start the conversation.</p>
                  ) : (
                    <ScrollArea className="max-h-72 rounded-xl">
                      <ul className="flex flex-col gap-3 pr-3">
                        {comments.map((c) => (
                          <li key={c.id} className="flex items-start gap-2.5">
                            <EmojiAvatar emoji={c.author.avatarEmoji} color={c.author.avatarColor} size={26} />
                            <div className="min-w-0 flex-1 rounded-xl glass px-3 py-2">
                              <div className="flex items-baseline gap-2">
                                <span className="truncate text-sm font-medium">{c.author.displayName}</span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {timeAgo(c.createdAt)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-sm break-words text-foreground/90">{c.body}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  )}

                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitComment();
                    }}
                  >
                    <Input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add a comment…"
                      maxLength={500}
                      className="h-11 flex-1 rounded-xl"
                      aria-label="Write a comment"
                    />
                    <Button
                      type="submit"
                      className="h-11 rounded-xl glow-violet"
                      disabled={!commentText.trim() || sending || loading}
                    >
                      {sending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Send className="size-4" aria-hidden="true" />
                      )}
                      <span className="sr-only sm:not-sr-only">Send</span>
                    </Button>
                  </form>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
