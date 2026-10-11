import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/tokens/[id]/boost — send a visibility boost (simulated, free).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getSessionUser();

    const token = await db.token.findUnique({ where: { id } });
    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });

    await db.$transaction([
      db.activityEvent.create({
        data: {
          kind: "MILESTONE",
          title: `${token.symbol} got boosted 🚀 by you`,
          meta: JSON.stringify({ symbol: token.symbol, by: user.handle }),
          tokenId: token.id,
        },
      }),
      db.notification.create({
        data: {
          userId: user.id,
          kind: "LAUNCH",
          title: "Boost sent",
          body: `You boosted ${token.name}. More visibility on the board.`,
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("token boost error", err);
    return NextResponse.json({ error: "Failed to send boost" }, { status: 500 });
  }
}
