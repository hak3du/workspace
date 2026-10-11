import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toUser } from "@/app/api/bootstrap/route";
import type { SpaceDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export function toSpace(
  s: {
    id: string; slug: string; name: string; tagline: string; category: string; iconEmoji: string;
    gradient: string; visibility: string; memberCount: number; onlineCount: number; createdAt: Date;
    owner: Parameters<typeof toUser>[0];
  },
  extra?: { joined?: boolean; postCount?: number }
): SpaceDTO {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    tagline: s.tagline,
    category: s.category,
    iconEmoji: s.iconEmoji,
    gradient: s.gradient,
    visibility: s.visibility,
    memberCount: s.memberCount,
    onlineCount: s.onlineCount,
    createdAt: s.createdAt.toISOString(),
    owner: toUser(s.owner),
    joined: extra?.joined,
    postCount: extra?.postCount,
  };
}

// GET /api/spaces — all spaces, memberCount desc, with joined flag + postCount.
export async function GET() {
  try {
    const user = await getSessionUser();

    const [spaces, memberships] = await Promise.all([
      db.space.findMany({
        orderBy: { memberCount: "desc" },
        include: { owner: true, _count: { select: { posts: true } } },
      }),
      db.spaceMembership.findMany({ where: { userId: user.id }, select: { spaceId: true } }),
    ]);

    const joinedIds = new Set(memberships.map((m) => m.spaceId));

    const spacesDto: SpaceDTO[] = spaces.map((s) =>
      toSpace(s, { joined: joinedIds.has(s.id), postCount: s._count.posts })
    );

    return NextResponse.json({ spaces: spacesDto });
  } catch (err) {
    console.error("GET /api/spaces error", err);
    return NextResponse.json({ error: "Failed to load spaces" }, { status: 500 });
  }
}

const CATEGORIES = ["GAMING", "MUSIC", "AI", "CYBERSEC", "ART", "STARTUP", "EDU", "ARENA"] as const;
type Category = (typeof CATEGORIES)[number];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "space";
}

// POST /api/spaces — create a space (owner = session user) + OWNER membership.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    const payload = (await req.json().catch(() => null)) as null | {
      name?: unknown;
      tagline?: unknown;
      category?: unknown;
      iconEmoji?: unknown;
      gradient?: unknown;
      visibility?: unknown;
    };
    if (!payload) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (name.length < 3 || name.length > 40) {
      return NextResponse.json({ error: "Name must be 3–40 characters" }, { status: 400 });
    }

    const tagline = typeof payload.tagline === "string" ? payload.tagline.trim() : "";
    if (tagline.length > 120) {
      return NextResponse.json({ error: "Tagline must be at most 120 characters" }, { status: 400 });
    }

    const category = typeof payload.category === "string" ? (payload.category as Category) : "ARENA";
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: "category must be one of GAMING, MUSIC, AI, CYBERSEC, ART, STARTUP, EDU, ARENA" },
        { status: 400 }
      );
    }

    const iconEmoji =
      typeof payload.iconEmoji === "string" && payload.iconEmoji.trim() ? payload.iconEmoji.trim().slice(0, 8) : "🚀";
    const gradient =
      typeof payload.gradient === "string" && payload.gradient.trim()
        ? payload.gradient.trim()
        : "from-violet-600 to-cyan-500";
    const visibility = payload.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC";

    // Ensure a unique slug even when two spaces share a name.
    const base = slugify(name);
    let slug = base;
    for (let i = 0; i < 5; i++) {
      const clash = await db.space.findUnique({ where: { slug }, select: { id: true } });
      if (!clash) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const space = await db.space.create({
      data: {
        slug,
        name,
        tagline,
        category,
        iconEmoji,
        gradient,
        visibility,
        ownerId: user.id,
        memberCount: 1,
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
      include: { owner: true },
    });

    return NextResponse.json({ space: toSpace(space, { joined: true, postCount: 0 }) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/spaces error", err);
    return NextResponse.json({ error: "Failed to create space" }, { status: 500 });
  }
}
