import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { curveProgress, spotPrice, TOTAL_SUPPLY } from "@/lib/bonding";
import { SOL_USD } from "@/lib/format";
import type { TokenDTO, TradeDTO, UserDTO, VerificationCheckDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

function toUserDTO(u: { id: string; handle: string; displayName: string; avatarEmoji: string; avatarColor: string; verified: boolean; followers: number }): UserDTO {
  return { id: u.id, handle: u.handle, displayName: u.displayName, avatarEmoji: u.avatarEmoji, avatarColor: u.avatarColor, verified: u.verified, followers: u.followers };
}

function toTokenDTO(
  t: {
    id: string; name: string; symbol: string; description: string; imageUrl: string | null; mint: string;
    status: string; virtualSol: number; virtualToken: number; tradeCount: number; createdAt: Date; lastTradeAt: Date;
    creator: Parameters<typeof toUserDTO>[0];
  },
  extra?: { holders?: number }
): TokenDTO {
  // Spot price / market cap / progress math mirrors src/app/api/bootstrap/route.ts.
  const priceSol = spotPrice(t);
  return {
    id: t.id,
    name: t.name,
    symbol: t.symbol,
    description: t.description,
    imageUrl: t.imageUrl,
    mint: t.mint,
    status: t.status as TokenDTO["status"],
    priceSol,
    marketCapUsd: priceSol * TOTAL_SUPPLY * SOL_USD,
    progress: curveProgress(t),
    creator: toUserDTO(t.creator),
    tradeCount: t.tradeCount,
    virtualSol: t.virtualSol,
    virtualToken: t.virtualToken,
    createdAt: t.createdAt.toISOString(),
    lastTradeAt: t.lastTradeAt.toISOString(),
    holders: extra?.holders,
  };
}

function toTradeDTO(t: {
  id: string; side: string; solAmount: number; tokenAmount: number; priceAfter: number;
  traderLabel: string; isBot: boolean; txSig: string; createdAt: Date;
}): TradeDTO {
  return {
    id: t.id,
    side: t.side as TradeDTO["side"],
    solAmount: t.solAmount,
    tokenAmount: t.tokenAmount,
    priceAfter: t.priceAfter,
    traderLabel: t.traderLabel,
    isBot: t.isBot,
    txSig: t.txSig,
    createdAt: t.createdAt.toISOString(),
  };
}

// GET /api/tokens/[id] — full token detail for the Launch Arena detail view.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getSessionUser();

    const token = await db.token.findUnique({ where: { id }, include: { creator: true } });
    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });

    const [tradesRaw, holding, checksRaw, holderGroups] = await Promise.all([
      db.trade.findMany({ where: { tokenId: id }, orderBy: { createdAt: "desc" }, take: 40 }),
      db.holding.findUnique({ where: { tokenId_userId: { tokenId: id, userId: user.id } } }),
      db.verificationCheck.findMany({ where: { projectId: id }, orderBy: { checkedAt: "desc" } }),
      db.holding.groupBy({ by: ["tokenId"], _count: { userId: true }, where: { tokenId: id } }),
    ]);

    // Latest check per check-name.
    const seen = new Set<string>();
    const checks: VerificationCheckDTO[] = [];
    for (const c of checksRaw) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      checks.push({
        id: c.id,
        name: c.name,
        status: c.status as VerificationCheckDTO["status"],
        detail: c.detail,
        source: c.source,
        checkedAt: c.checkedAt.toISOString(),
      });
    }

    const trades: TradeDTO[] = tradesRaw.map(toTradeDTO);

    return NextResponse.json({
      token: toTokenDTO(token, { holders: holderGroups[0]?._count.userId ?? 0 }),
      trades,
      myHolding: holding ? { amount: holding.amount, avgPrice: holding.avgPrice } : null,
      checks,
      creator: toUserDTO(token.creator),
    });
  } catch (err) {
    console.error("token detail error", err);
    return NextResponse.json({ error: "Failed to load token" }, { status: 500 });
  }
}
