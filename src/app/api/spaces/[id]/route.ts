import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toPost, toUser } from "@/app/api/bootstrap/route";
import { toSpace } from "../route";
import type { PostDTO, SpaceDTO, SpaceEventDTO, SpaceMessageDTO, UserDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface SpaceDetailResponse {
  space: SpaceDTO & { joined: boolean; myRole: string | null };
  posts: PostDTO[];
  members: (UserDTO & { role: string })[];
  events: SpaceEventDTO[];
  messages: SpaceMessageDTO[];
}

// GET /api/spaces/[id] — full space detail: posts, members, events, messages,
// plus the session user's joined flag and membership role.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();

    const space = await db.space.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: { owner: true },
    });
    if (!space) return NextResponse.json({ error: "Space not found" }, { status: 404 });

    const [postsRaw, membersRaw, eventsRaw, messagesRaw, myMembership, postCount] = await Promise.all([
      db.post.findMany({
        where: { spaceId: space.id },
        orderBy: [{ isLive: "desc" }, { createdAt: "desc" }],
        take: 12,
        include: { author: true, space: { select: { id: true, name: true, slug: true } } },
      }),
      db.spaceMembership.findMany({
        where: { spaceId: space.id },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { user: true },
      }),
      db.spaceEvent.findMany({ where: { spaceId: space.id }, orderBy: { startsAt: "asc" } }),
      db.spaceMessage.findMany({
        where: { spaceId: space.id },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { user: true },
      }),
      db.spaceMembership.findUnique({
        where: { spaceId_userId: { spaceId: space.id, userId: user.id } },
        select: { role: true },
      }),
      db.post.count({ where: { spaceId: space.id } }),
    ]);

    const ids = postsRaw.map((p) => p.id);
    const reactions = ids.length
      ? await db.reaction.findMany({
          where: { userId: user.id, postId: { in: ids }, kind: { in: ["LIKE", "SAVE"] } },
        })
      : [];
    const likedIds = new Set(reactions.filter((r) => r.kind === "LIKE").map((r) => r.postId));
    const savedIds = new Set(reactions.filter((r) => r.kind === "SAVE").map((r) => r.postId));

    const response: SpaceDetailResponse = {
      space: {
        ...toSpace(space, { postCount }),
        joined: !!myMembership,
        myRole: myMembership?.role ?? null,
      },
      posts: postsRaw.map((p) => toPost(p, { liked: likedIds.has(p.id), saved: savedIds.has(p.id) })),
      members: membersRaw.map((m) => ({ ...toUser(m.user), role: m.role })),
      events: eventsRaw.map((e) => ({
        id: e.id,
        title: e.title,
        kind: e.kind,
        startsAt: e.startsAt.toISOString(),
      })),
      messages: messagesRaw
        .reverse()
        .map((m) => ({
          id: m.id,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          author: toUser(m.user),
        })),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /api/spaces/[id] error", err);
    return NextResponse.json({ error: "Failed to load space" }, { status: 500 });
  }
}
