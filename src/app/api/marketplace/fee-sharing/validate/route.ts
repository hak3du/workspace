import { NextRequest, NextResponse } from "next/server";
import { validateFeeShares } from "@/lib/marketplace/fee-sharing";

export const dynamic = "force-dynamic";

/**
 * Preflight validator only. This endpoint does not create or update an on-chain
 * Pump.fun sharing configuration and does not move funds.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("shares" in body)) {
    return NextResponse.json(
      { error: "Request body must contain a shares array" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = validateFeeShares((body as { shares: unknown }).shares);
  return NextResponse.json({
    ...result,
    onChainConfigured: false,
    note: "Validation only. No transaction was built, signed, submitted, or confirmed.",
  }, {
    status: result.valid ? 200 : 422,
    headers: { "Cache-Control": "no-store" },
  });
}
