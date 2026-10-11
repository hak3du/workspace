"use client";

import { cn } from "@/lib/utils";

// Emoji-based avatar used across the universe (DB stores emoji + color).
export function EmojiAvatar({
  emoji,
  color,
  size = 36,
  className,
  ring,
}: {
  emoji: string;
  color: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full select-none",
        ring && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: `radial-gradient(120% 120% at 20% 15%, ${color}cc, ${color}55 60%, #0b0b12 130%)`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.14), 0 4px 14px ${color}44`,
      }}
    >
      {emoji}
    </span>
  );
}
