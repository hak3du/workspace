import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/spaces/[id]/join — toggle membership; keeps memberCount in sync and
// emits a JOIN activity event when joining.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();

    const space = await db.space.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true, name: true, memberCount: true },
    });
    if (!space) return NextResponse.json({ error: "Space not found" }, { status: 404 });

    const existing = await db.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId: space.id, userId: user.id } },
    });

    let joined: boolean;
    let memberCount: number;

    if (existing) {
      if (existing.role === "OWNER") {
        return NextResponse.json({ error: "Owner cannot leave their own space" }, { status: 400 });
      }
      await db.spaceMembership.delete({ where: { id: existing.id } });
      memberCount = Math.max(0, space.memberCount - 1);
      joined = false;
    } else {
      await db.spaceMembership.create({
        data: { spaceId: space.id, userId: user.id, role: "MEMBER" },
      });
      memberCount = space.memberCount + 1;
      joined = true;
      await db.activityEvent.create({
        data: {
          kind: "JOIN",
          title: `${user.displayName} joined ${space.name}`,
          meta: JSON.stringify({ spaceId: space.id, userId: user.id }),
        },
      });
    }

    await db.space.update({ where: { id: space.id }, data: { memberCount } });

    return NextResponse.json({ joined, memberCount });
  } catch (err) {
    console.error("POST /api/spaces/[id]/join error", err);
    return NextResponse.json({ error: "Failed to toggle membership" }, { status: 500 });
  }
}
