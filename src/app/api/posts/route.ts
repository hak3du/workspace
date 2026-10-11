import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toPost } from "@/app/api/bootstrap/route";
import type { PostDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS = ["foryou", "following", "video", "image", "audio", "article", "live"] as const;
type Tab = (typeof TABS)[number];

const TAB_TYPE: Partial<Record<Tab, string>> = {
  video: "VIDEO",
  image: "IMAGE",
  audio: "AUDIO",
  article: "ARTICLE",
};

// GET /api/posts — feed with tab / space / search filters.
// "following" is a documented approximation: authors who share a SpaceMembership
// with the session user, plus the seeded flagship creators @dylanhodges / @miraquant.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const tabRaw = (sp.get("tab") ?? "foryou") as Tab;
    const tab: Tab = TABS.includes(tabRaw) ? tabRaw : "foryou";
    const spaceId = sp.get("spaceId") || undefined;
    const q = (sp.get("q") ?? "").trim();
    const limitRaw = Number(sp.get("limit") ?? 24);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50) : 24;

    const user = await getSessionUser();

    const where: Prisma.PostWhereInput = {};
    if (spaceId) where.spaceId = spaceId;
    if (q) where.OR = [{ title: { contains: q } }, { body: { contains: q } }];
    if (TAB_TYPE[tab]) where.type = TAB_TYPE[tab];
    if (tab === "live") where.isLive = true;

    if (tab === "following") {
      const myMemberships = await db.spaceMembership.findMany({
        where: { userId: user.id },
        select: { spaceId: true },
      });
      const coMembers = await db.spaceMembership.findMany({
        where: { spaceId: { in: myMemberships.map((m) => m.spaceId) } },
        select: { userId: true },
      });
      const authorIds = new Set(coMembers.map((m) => m.userId));
      const seeds = await db.user.findMany({
        where: { handle: { in: ["@dylanhodges", "@miraquant"] } },
        select: { id: true },
      });
      for (const s of seeds) authorIds.add(s.id);
      where.authorId = { in: Array.from(authorIds) };
    }

    const posts = await db.post.findMany({
      where,
      orderBy: [{ isLive: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: { author: true, space: { select: { id: true, name: true, slug: true } } },
    });

    const ids = posts.map((p) => p.id);
    const reactions = ids.length
      ? await db.reaction.findMany({
          where: { userId: user.id, postId: { in: ids }, kind: { in: ["LIKE", "SAVE"] } },
        })
      : [];
    const likedIds = new Set(reactions.filter((r) => r.kind === "LIKE").map((r) => r.postId));
    const savedIds = new Set(reactions.filter((r) => r.kind === "SAVE").map((r) => r.postId));

    const postsDto: PostDTO[] = posts.map((p) =>
      toPost(p, { liked: likedIds.has(p.id), saved: savedIds.has(p.id) })
    );

    return NextResponse.json({ posts: postsDto });
  } catch (err) {
    console.error("GET /api/posts error", err);
    return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
  }
}

const POST_TYPES = ["VIDEO", "IMAGE", "ARTICLE", "AUDIO", "UPDATE", "CODE"] as const;
type PostType = (typeof POST_TYPES)[number];

// POST /api/posts — publish a new post (session user as author).
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const payload = (await req.json().catch(() => null)) as null | {
      type?: string;
      title?: string;
      body?: string;
      mediaUrl?: string;
      thumbUrl?: string;
      durationLabel?: string;
      tags?: unknown;
      spaceId?: string;
    };

    if (!payload) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const type = payload.type as PostType | undefined;
    if (!type || !POST_TYPES.includes(type)) {
      return NextResponse.json({ error: "type must be one of VIDEO, IMAGE, ARTICLE, AUDIO, UPDATE, CODE" }, { status: 400 });
    }

    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (title.length < 3 || title.length > 120) {
      return NextResponse.json({ error: "Title must be 3–120 characters" }, { status: 400 });
    }

    const body = typeof payload.body === "string" ? payload.body : "";
    if (body.length > 2000) {
      return NextResponse.json({ error: "Body must be at most 2000 characters" }, { status: 400 });
    }

    const mediaUrl =
      typeof payload.mediaUrl === "string" && payload.mediaUrl.trim() ? payload.mediaUrl.trim() : null;
    const thumbUrl =
      typeof payload.thumbUrl === "string" && payload.thumbUrl.trim() ? payload.thumbUrl.trim() : null;
    const durationLabel =
      typeof payload.durationLabel === "string" && payload.durationLabel.trim()
        ? payload.durationLabel.trim().slice(0, 16)
        : null;

    const tags = Array.isArray(payload.tags)
      ? payload.tags
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 5)
      : [];

    let spaceId: string | null = null;
    if (payload.spaceId) {
      const space = await db.space.findUnique({ where: { id: payload.spaceId }, select: { id: true } });
      if (!space) return NextResponse.json({ error: "Space not found" }, { status: 400 });
      spaceId = space.id;
    }

    const created = await db.post.create({
      data: {
        authorId: user.id,
        spaceId,
        type,
        title,
        body,
        mediaUrl,
        thumbUrl,
        durationLabel,
        tags: JSON.stringify(tags),
      },
      include: { author: true, space: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json({ post: toPost(created) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/posts error", err);
    return NextResponse.json({ error: "Failed to publish post" }, { status: 500 });
  }
}
