import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/posts/[id]/save — toggle the session user's SAVE reaction (bookmark)
// and keep Post.saveCount in sync (+1/−1, clamped at 0).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();

    const post = await db.post.findUnique({ where: { id }, select: { id: true, saveCount: true } });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const existing = await db.reaction.findUnique({
      where: { postId_userId_kind: { postId: id, userId: user.id, kind: "SAVE" } },
    });

    let saved: boolean;
    let saveCount: number;

    if (existing) {
      await db.reaction.delete({ where: { id: existing.id } });
      saveCount = Math.max(0, post.saveCount - 1);
      saved = false;
    } else {
      await db.reaction.create({ data: { postId: id, userId: user.id, kind: "SAVE" } });
      saveCount = post.saveCount + 1;
      saved = true;
    }

    await db.post.update({ where: { id }, data: { saveCount } });

    return NextResponse.json({ saved, saveCount });
  } catch (err) {
    console.error("POST /api/posts/[id]/save error", err);
    return NextResponse.json({ error: "Failed to toggle save" }, { status: 500 });
  }
}
