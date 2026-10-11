import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toUser } from "@/app/api/bootstrap/route";
import type { SpaceMessageDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

function toSpaceMessage(m: {
  id: string;
  body: string;
  createdAt: Date;
  user: Parameters<typeof toUser>[0];
}): SpaceMessageDTO {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    author: toUser(m.user),
  };
}

// GET /api/spaces/[id]/messages?after=ISO — messages (asc), optionally only ones
// newer than `after` (for 4s polling).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const space = await db.space.findFirst({ where: { OR: [{ id }, { slug: id }] }, select: { id: true } });
    if (!space) return NextResponse.json({ error: "Space not found" }, { status: 404 });

    const afterRaw = req.nextUrl.searchParams.get("after");
    let createdFilter: { gt: Date } | undefined;
    if (afterRaw) {
      const d = new Date(afterRaw);
      if (!Number.isNaN(d.getTime())) createdFilter = { gt: d };
    }

    const messages = await db.spaceMessage.findMany({
      where: { spaceId: space.id, ...(createdFilter ? { createdAt: createdFilter } : {}) },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { user: true },
    });

    return NextResponse.json({ messages: messages.map(toSpaceMessage) });
  } catch (err) {
    console.error("GET /api/spaces/[id]/messages error", err);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

// POST /api/spaces/[id]/messages — post to the space wall-chat (membership not required).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();

    const space = await db.space.findFirst({ where: { OR: [{ id }, { slug: id }] }, select: { id: true } });
    if (!space) return NextResponse.json({ error: "Space not found" }, { status: 404 });

    const payload = (await req.json().catch(() => null)) as null | { body?: unknown };
    const text = typeof payload?.body === "string" ? payload.body.trim() : "";
    if (text.length < 1 || text.length > 400) {
      return NextResponse.json({ error: "Message must be 1–400 characters" }, { status: 400 });
    }

    const created = await db.spaceMessage.create({
      data: { spaceId: space.id, userId: user.id, body: text },
      include: { user: true },
    });

    return NextResponse.json({ message: toSpaceMessage(created) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/spaces/[id]/messages error", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
