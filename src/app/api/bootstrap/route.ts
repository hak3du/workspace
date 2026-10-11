import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { spotPrice, curveProgress, TOTAL_SUPPLY } from "@/lib/bonding";
import { SOL_USD } from "@/lib/format";
import type { ActivityDTO, PostDTO, SessionUser, SpaceDTO, TokenDTO, UserDTO, BootstrapDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export function toUser(u: { id: string; handle: string; displayName: string; avatarEmoji: string; avatarColor: string; verified: boolean; followers: number }): UserDTO {
  return { id: u.id, handle: u.handle, displayName: u.displayName, avatarEmoji: u.avatarEmoji, avatarColor: u.avatarColor, verified: u.verified, followers: u.followers };
}

export function toPost(p: {
  id: string; type: string; title: string; body: string; mediaUrl: string | null; thumbUrl: string | null;
  durationLabel: string | null; tags: string; viewCount: number; likeCount: number; commentCount: number;
  saveCount: number; isLive: boolean; createdAt: Date;
  author: Parameters<typeof toUser>[0];
  space?: { id: string; name: string; slug: string } | null;
}, extra?: { liked?: boolean; saved?: boolean }): PostDTO {
  return {
    id: p.id,
    type: p.type as PostDTO["type"],
    title: p.title,
    body: p.body,
    mediaUrl: p.mediaUrl,
    thumbUrl: p.thumbUrl,
    durationLabel: p.durationLabel,
    tags: JSON.parse(p.tags || "[]"),
    viewCount: p.viewCount,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    saveCount: p.saveCount,
    isLive: p.isLive,
    createdAt: p.createdAt.toISOString(),
    author: toUser(p.author),
    space: p.space ?? null,
    liked: extra?.liked,
    saved: extra?.saved,
  };
}

export function toToken(t: {
  id: string; name: string; symbol: string; description: string; imageUrl: string | null; mint: string;
  status: string; virtualSol: number; virtualToken: number; tradeCount: number; createdAt: Date; lastTradeAt: Date;
  creator: Parameters<typeof toUser>[0];
}, extra?: { holders?: number }): TokenDTO {
  const priceSol = spotPrice(t);
  return {
    id: t.id,
    name: t.name,
    symbol: t.symbol,
    description: t.description,
    imageUrl: t.imageUrl,
    mint: t.mint,
    status: t.status as TokenDTO["status"],
    priceSol,
    marketCapUsd: priceSol * TOTAL_SUPPLY * SOL_USD,
    progress: curveProgress(t),
    creator: toUser(t.creator),
    tradeCount: t.tradeCount,
    virtualSol: t.virtualSol,
    virtualToken: t.virtualToken,
    createdAt: t.createdAt.toISOString(),
    lastTradeAt: t.lastTradeAt.toISOString(),
    holders: extra?.holders,
  };
}

export async function GET() {
  try {
    const user = await getSessionUser();

    const [featuredRaw, trendingRaw, liveRaw, tokensRaw, spacesRaw, activities, creators, mediaCount, spaceCount, launchCount, tradesAgg] =
      await Promise.all([
        db.post.findFirst({
          where: { tags: { contains: "featured" } },
          orderBy: { createdAt: "desc" },
          include: { author: true },
        }),
        db.post.findMany({ where: { isLive: false }, orderBy: { likeCount: "desc" }, take: 8, include: { author: true, space: { select: { id: true, name: true, slug: true } } } }),
        db.post.findMany({ where: { isLive: true }, orderBy: { viewCount: "desc" }, take: 4, include: { author: true } }),
        db.token.findMany({ orderBy: { virtualSol: "desc" }, take: 5, include: { creator: true } }),
        db.space.findMany({ orderBy: { memberCount: "desc" }, take: 6, include: { owner: true } }),
        db.activityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 14 }),
        db.user.count(),
        db.post.count(),
        db.space.count(),
        db.token.count(),
        db.trade.aggregate({ _sum: { solAmount: true } }),
      ]);

    const featuredBase = featuredRaw ? toPost({ ...featuredRaw, space: null }) : null;

    const myReactions = await db.reaction.findMany({ where: { userId: user.id, postId: featuredRaw?.id ?? "none" } });
    const featured = featuredBase
      ? { ...featuredBase, liked: myReactions.some((r) => r.kind === "LIKE"), saved: myReactions.some((r) => r.kind === "SAVE") }
      : null;

    const ticker: ActivityDTO[] = activities.map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      meta: JSON.parse(a.meta || "{}"),
      tokenId: a.tokenId,
      createdAt: a.createdAt.toISOString(),
    }));

    const dto: BootstrapDTO = {
      user: toUser(user) as SessionUser,
      featured,
      trending: trendingRaw.map((p) => toPost(p)),
      live: liveRaw.map((p) => toPost(p)),
      topTokens: tokensRaw.map((t) => toToken(t)),
      topSpaces: spacesRaw.map((s) => ({
        id: s.id, slug: s.slug, name: s.name, tagline: s.tagline, category: s.category, iconEmoji: s.iconEmoji,
        gradient: s.gradient, visibility: s.visibility, memberCount: s.memberCount, onlineCount: s.onlineCount,
        createdAt: s.createdAt.toISOString(), owner: toUser(s.owner),
      })) as SpaceDTO[],
      ticker,
      stats: {
        creators: creators,
        media: mediaCount,
        spaces: spaceCount,
        launches: launchCount,
        volumeUsd: (tradesAgg._sum.solAmount ?? 0) * SOL_USD,
      },
    };

    return NextResponse.json(dto);
  } catch (err) {
    console.error("bootstrap error", err);
    return NextResponse.json({ error: "Failed to load universe" }, { status: 500 });
  }
}
