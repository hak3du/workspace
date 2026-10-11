import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMarketplaceReadiness } from "@/lib/marketplace/config";

export const dynamic = "force-dynamic";

/**
 * Operational status. This endpoint reports configured/implemented capability,
 * not just environment variables. Mainnet readiness stays false until the
 * actual wallet and Pump.fun transaction adapter has been implemented.
 */
export async function GET() {
  try {
    const [tokenCount, tradeCount] = await Promise.all([
      db.token.count(),
      db.trade.count(),
    ]);
    const readiness = getMarketplaceReadiness();

    return NextResponse.json({
      dataSource: "database",
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
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("marketplace status error", err);
    return NextResponse.json(
      { error: "Marketplace status is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
