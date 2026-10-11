// Quantum Labs — usage analytics for the session user's AHE keys.
// Totals over all events; latest 40 events; per-key quota burn-down.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    const keys = await db.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, used: true, quota: true },
    });
    const keyIds = keys.map((k) => k.id);

    const where = keyIds.length > 0 ? { keyId: { in: keyIds } } : { keyId: { in: ["__none__"] } };

    const [callsAgg, errCount, events] = await Promise.all([
      db.apiUsageEvent.aggregate({
        where,
        _count: { _all: true },
        _avg: { latencyMs: true },
      }),
      db.apiUsageEvent.count({ where: { ...where, status: "ERROR" } }),
      db.apiUsageEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, endpoint: true, status: true, latencyMs: true, createdAt: true },
      }),
    ]);

    return NextResponse.json({
      totals: {
        calls: callsAgg._count._all,
        errors: errCount,
        avgLatencyMs: Math.round(callsAgg._avg.latencyMs ?? 0),
      },
      events: events.map((e) => ({
        id: e.id,
        endpoint: e.endpoint,
        status: e.status as "OK" | "ERROR",
        latencyMs: e.latencyMs,
        createdAt: e.createdAt.toISOString(),
      })),
      perKey: keys.map((k) => ({ keyId: k.id, label: k.label, used: k.used, quota: k.quota })),
    });
  } catch (err) {
    console.error("ahe/usage error", err);
    return NextResponse.json({ error: "Failed to load usage" }, { status: 500 });
  }
}
