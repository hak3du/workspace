import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMarketplaceReadiness } from "@/lib/marketplace/config";

export const dynamic = "force-dynamic";

/**
 * Operational status reports actual DB availability and implemented capability.
 * Mainnet readiness stays false until wallet and Pump.fun transaction flows exist.
 */
export async function GET() {
  const readiness = getMarketplaceReadiness();
  const databaseConfiguration = {
    prismaUrlConfigured: Boolean(process.env.DATABASE_URL),
    tursoVariablesPresent: Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN),
    tursoAdapterImplemented: false,
  };

  try {
    const [tokenCount, tradeCount] = await Promise.all([
      db.token.count(),
      db.trade.count(),
    ]);

    return NextResponse.json({
      status: "ok",
      dataSource: "prisma-database",
      databaseConfiguration,
      environment: readiness.mode,
      launchesEnabled: readiness.launchesEnabled,
      realTransactionsEnabled: readiness.realTransactionsEnabled,
      productionReady: readiness.productionReady,
      counts: { tokens: tokenCount, trades: tradeCount },
      integrations: {
        ...readiness.integrations,
        solana: readiness.integrations.solanaRpc,
      },
      checkedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const errorId = crypto.randomUUID();
    console.error("marketplace status error", { errorId, err });
    return NextResponse.json({
      status: "unavailable",
      error: "Marketplace status is temporarily unavailable",
      code: "MARKETPLACE_STATUS_UNAVAILABLE",
      errorId,
      databaseConfiguration,
      environment: readiness.mode,
      launchesEnabled: false,
      realTransactionsEnabled: false,
      productionReady: false,
      checkedAt: new Date().toISOString(),
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
