import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import type { NotificationDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    const rows = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const notifications: NotificationDTO[] = rows.map((n) => ({
      id: n.id, kind: n.kind, title: n.title, body: n.body, read: n.read, createdAt: n.createdAt.toISOString(),
    }));
    return NextResponse.json({ notifications, unread: notifications.filter((n) => !n.read).length });
  } catch (err) {
    console.error("notifications error", err);
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = await req.json().catch(() => ({}));
    const id = (body as { id?: string }).id;
    if (id) {
      await db.notification.updateMany({ where: { id, userId: user.id }, data: { read: true } });
    } else {
      await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notifications patch error", err);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
