import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toUser } from "@/app/api/bootstrap/route";
import type { CommentDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST /api/posts/[id]/comments — create a comment (1–500 chars) and bump commentCount.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();

    const payload = (await req.json().catch(() => null)) as null | { body?: unknown };
    const text = typeof payload?.body === "string" ? payload.body.trim() : "";
    if (text.length < 1 || text.length > 500) {
      return NextResponse.json({ error: "Comment must be 1–500 characters" }, { status: 400 });
    }

    const post = await db.post.findUnique({ where: { id }, select: { id: true, commentCount: true } });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const commentCount = post.commentCount + 1;
    const [, created] = await db.$transaction([
      db.post.update({ where: { id }, data: { commentCount } }),
      db.comment.create({
        data: { postId: id, authorId: user.id, body: text },
        include: { author: true },
      }),
    ]);

    const comment: CommentDTO = {
      id: created.id,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      author: toUser(created.author),
    };

    return NextResponse.json({ comment, commentCount }, { status: 201 });
  } catch (err) {
    console.error("POST /api/posts/[id]/comments error", err);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
