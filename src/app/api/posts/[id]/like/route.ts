import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/posts/[id]/like — toggle the session user's LIKE reaction and keep
// Post.likeCount in sync (+1 on join, −1 on leave, clamped at 0).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();

    const post = await db.post.findUnique({ where: { id }, select: { id: true, likeCount: true } });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const existing = await db.reaction.findUnique({
      where: { postId_userId_kind: { postId: id, userId: user.id, kind: "LIKE" } },
    });

    let liked: boolean;
    let likeCount: number;

    if (existing) {
      await db.reaction.delete({ where: { id: existing.id } });
      likeCount = Math.max(0, post.likeCount - 1);
      liked = false;
    } else {
      await db.reaction.create({ data: { postId: id, userId: user.id, kind: "LIKE" } });
      likeCount = post.likeCount + 1;
      liked = true;
    }

    await db.post.update({ where: { id }, data: { likeCount } });

    return NextResponse.json({ liked, likeCount });
  } catch (err) {
    console.error("POST /api/posts/[id]/like error", err);
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 });
  }
}
