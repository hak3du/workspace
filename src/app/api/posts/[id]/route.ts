import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toPost, toUser } from "@/app/api/bootstrap/route";
import type { CommentDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/posts/[id] — post detail with liked/saved flags + latest 50 comments (asc).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();

    const post = await db.post.findUnique({
      where: { id },
      include: { author: true, space: { select: { id: true, name: true, slug: true } } },
    });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const [rawComments, reactions] = await Promise.all([
      db.comment.findMany({
        where: { postId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { author: true },
      }),
      db.reaction.findMany({
        where: { userId: user.id, postId: id, kind: { in: ["LIKE", "SAVE"] } },
      }),
    ]);

    const comments: CommentDTO[] = rawComments
      .reverse()
      .map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        author: toUser(c.author),
      }));

    return NextResponse.json({
      post: toPost(post, {
        liked: reactions.some((r) => r.kind === "LIKE"),
        saved: reactions.some((r) => r.kind === "SAVE"),
      }),
      comments,
    });
  } catch (err) {
    console.error("GET /api/posts/[id] error", err);
    return NextResponse.json({ error: "Failed to load post" }, { status: 500 });
  }
}
