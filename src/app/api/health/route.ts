import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Deployment health check. It deliberately distinguishes application execution
 * from database connectivity and does not expose connection strings or errors.
 */
export async function GET() {
  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL);
  const tursoConfigured = Boolean(
    process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN
  );
  const checkedAt = new Date().toISOString();

  // Turso variables alone are not enough: db.ts still constructs a plain
  // PrismaClient and the schema still targets SQLite. Report that mismatch
  // explicitly rather than implying the remote database is connected.
  if (!databaseUrlConfigured && tursoConfigured) {
    return NextResponse.json(
      {
        status: "degraded",
        application: "ok",
        database: "adapter-not-configured",
        databaseProvider: "turso-env-present-prisma-adapter-missing",
        checkedAt,
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  if (!databaseUrlConfigured) {
    return NextResponse.json(
      {
        status: "degraded",
        application: "ok",
        database: "not-configured",
        databaseProvider: "prisma-sqlite",
        checkedAt,
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: "ok",
        application: "ok",
        database: "reachable",
        databaseProvider: tursoConfigured
          ? "prisma-configured-turso-not-confirmed"
          : "prisma-configured",
        checkedAt,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error("health database check failed", { errorId, error });
    return NextResponse.json(
      {
        status: "degraded",
        application: "ok",
        database: "unreachable",
        databaseProvider: "prisma-configured",
        errorId,
        checkedAt,
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
