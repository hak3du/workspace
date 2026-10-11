import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Phase 1 marketplace health contract.
 *
 * Counts come from the configured database. The integration flags remain
 * explicitly disconnected until wallet, Solana/Pump.fun, and AHE verification
 * adapters are implemented and independently tested.
 */
export async function GET() {
  try {
    const [tokenCount, tradeCount] = await Promise.all([
      db.token.count(),
      db.trade.count(),
    ]);

    return NextResponse.json({
      dataSource: "database",
      environment: "simulation",
      counts: { tokens: tokenCount, trades: tradeCount },
      integrations: {
        wallet: "not-connected",
        solana: "not-connected",
        pumpFun: "not-connected",
        aheVerification: "not-connected",
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
