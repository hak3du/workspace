"use client";

import Image from "next/image";
import { AudioLines, Bookmark, Eye, FileCode2, Heart, MessageCircle, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { compact, timeAgo } from "@/lib/format";
import type { PostDTO } from "@/lib/types";

export function LiveBadge({ className = "" }: { className?: string }) {
  return (
    <Badge className={`gap-1.5 border-transparent bg-red-600 text-white ${className}`}>
      <span className="live-dot inline-block size-1.5 rounded-full bg-white" />
      LIVE
    </Badge>
  );
}

export function EmojiAvatar({
  emoji,
  color,
  size = 24,
}: {
  emoji: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.55, backgroundColor: `${color}33` }}
    >
      {emoji}
    </span>
  );
}

// MediaCard — type-aware feed card. VIDEO/IMAGE show a thumbnail hero, AUDIO a
// gradient waveform tile, ARTICLE a gradient strip, CODE a terminal-style header.
export function MediaCard({ post, onOpen }: { post: PostDTO; onOpen: (p: PostDTO) => void }) {
  const isMedia = post.type === "VIDEO" || post.type === "IMAGE";
  const isAudio = post.type === "AUDIO";
  const isCode = post.type === "CODE";
  const isArticle = post.type === "ARTICLE";
  const src = post.thumbUrl || post.mediaUrl || null;

  const open = () => onOpen(post);
  const keyOpen = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={post.title}
      onClick={open}
      onKeyDown={keyOpen}
      className="card-hover group flex cursor-pointer flex-col overflow-hidden rounded-2xl glass text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      {isMedia && src ? (
        <div className="relative aspect-video w-full overflow-hidden bg-black/40">
          <Image
            src={src}
            alt={post.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          {post.isLive && <LiveBadge className="absolute left-3 top-3" />}
          {post.durationLabel && (
            <span className="absolute bottom-3 right-3 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
              {post.durationLabel}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="glow-violet rounded-full bg-primary p-3">
              <Play className="size-5 fill-current text-white" />
            </span>
          </span>
        </div>
      ) : isAudio ? (
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-gradient-to-br from-fuchsia-600/70 to-violet-800/80">
          <AudioLines className="size-14 text-white/90" aria-hidden="true" />
          {post.isLive && <LiveBadge className="absolute left-3 top-3" />}
          {post.durationLabel && (
            <span className="absolute bottom-3 right-3 rounded-md bg-black/50 px-1.5 py-0.5 font-mono text-[11px] text-white">
              {post.durationLabel}
            </span>
          )}
        </div>
      ) : isCode ? (
        <div className="flex items-center gap-2 border-b border-white/10 bg-black/50 px-4 py-3 font-mono text-xs text-cyan-300">
          <FileCode2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{post.tags[0] ? `${post.tags[0].replace(/\s+/g, "-")}.ts` : "snippet.ts"}</span>
          <span className="ml-auto shrink-0 text-muted-foreground">{"// code"}</span>
        </div>
      ) : (
        <div
          className={`h-1.5 w-full bg-gradient-to-r ${
            isArticle ? "from-violet-500 via-fuchsia-500 to-cyan-400" : "from-violet-600/70 to-cyan-500/70"
          }`}
          aria-hidden="true"
        />
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug">{post.title}</h3>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <EmojiAvatar emoji={post.author.avatarEmoji} color={post.author.avatarColor} size={22} />
          <span className="truncate font-medium text-foreground/90">{post.author.displayName}</span>
          <span className="shrink-0">· {timeAgo(post.createdAt)}</span>
        </div>

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full glass px-2 py-0.5 text-xs text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center gap-3.5 border-t border-white/5 pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1" title="Views">
            <Eye className="size-3.5" aria-hidden="true" />
            {compact(post.viewCount)}
          </span>
          <span className="inline-flex items-center gap-1" title="Likes">
            <Heart className="size-3.5" aria-hidden="true" />
            {compact(post.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1" title="Comments">
            <MessageCircle className="size-3.5" aria-hidden="true" />
            {compact(post.commentCount)}
          </span>
          <span className="ml-auto inline-flex items-center gap-1" title="Saves">
            <Bookmark className="size-3.5" aria-hidden="true" />
            {compact(post.saveCount)}
          </span>
        </div>
      </div>
    </article>
  );
}
