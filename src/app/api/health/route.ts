import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Deployment health check. It deliberately distinguishes application execution
 * from database connectivity and does not expose connection strings or errors.
 */
export async function GET() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const checkedAt = new Date().toISOString();

  if (!databaseConfigured) {
    return NextResponse.json({
      status: "degraded",
      application: "ok",
      database: "not-configured",
      databaseProvider: "prisma-sqlite",
      checkedAt,
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      application: "ok",
      database: "reachable",
      databaseProvider: "prisma-configured",
      checkedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error("health database check failed", { errorId, error });
    return NextResponse.json({
      status: "degraded",
      application: "ok",
      database: "unreachable",
      databaseProvider: "prisma-configured",
      errorId,
      checkedAt,
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
