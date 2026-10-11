"use client";

import { BadgeCheck, FileText, Lock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { compact } from "@/lib/format";
import { useApp } from "@/store/app-store";
import type { SpaceDTO } from "@/lib/types";

// SpaceCard — gradient-banner card for the Spaces grid. Click navigates to the
// space detail view.
export function SpaceCard({ space }: { space: SpaceDTO }) {
  const navigate = useApp((s) => s.navigate);

  const open = () => navigate({ name: "space", id: space.id });
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
      aria-label={`Open space ${space.name}`}
      onClick={open}
      onKeyDown={keyOpen}
      className="card-hover flex cursor-pointer flex-col overflow-hidden rounded-2xl glass text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <div className={`relative flex h-28 items-center justify-center bg-gradient-to-br ${space.gradient}`}>
        <span className="text-5xl drop-shadow-lg" aria-hidden="true">
          {space.iconEmoji}
        </span>
        {space.visibility === "PRIVATE" && (
          <Badge className="absolute right-3 top-3 gap-1 border-white/20 bg-black/50 text-white backdrop-blur">
            <Lock className="size-3" aria-hidden="true" />
            Private
          </Badge>
        )}
        {space.joined && (
          <Badge className="absolute left-3 top-3 border-transparent bg-black/50 text-emerald-300 backdrop-blur">
            Joined
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold">{space.name}</h3>
        <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
          {space.tagline || "No tagline yet."}
        </p>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="inline-flex size-5 items-center justify-center rounded-full text-[11px] ring-1 ring-white/10"
            style={{ backgroundColor: `${space.owner.avatarColor}33` }}
          >
            {space.owner.avatarEmoji}
          </span>
          <span className="truncate">{space.owner.displayName}</span>
          {space.owner.verified && <BadgeCheck className="size-3.5 shrink-0 text-cyan-400" aria-label="Verified" />}
          <span className="ml-auto rounded-full glass px-2 py-0.5 font-mono text-[10px]">{space.category}</span>
        </div>

        <div className="mt-auto flex items-center gap-4 border-t border-white/5 pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1" title="Members">
            <Users className="size-3.5" aria-hidden="true" />
            {compact(space.memberCount)}
          </span>
          {typeof space.postCount === "number" && (
            <span className="inline-flex items-center gap-1" title="Posts">
              <FileText className="size-3.5" aria-hidden="true" />
              {compact(space.postCount)}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5" title="Online now">
            <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            {compact(space.onlineCount)} online
          </span>
        </div>
      </div>
    </article>
  );
}
