import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { spotPrice, curveProgress, TOTAL_SUPPLY } from "@/lib/bonding";
import { SOL_USD } from "@/lib/format";
import type { HoldingDTO, PortfolioDTO, TokenDTO, TradeDTO, UserDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// Simulated platform wallet: base SOL balance + curve holdings + trade history.
const BASE_SOL_BALANCE = 12.4608;

function toTokenDTO(t: {
  id: string; name: string; symbol: string; description: string; imageUrl: string | null; mint: string;
  status: string; virtualSol: number; virtualToken: number; tradeCount: number; createdAt: Date; lastTradeAt: Date;
  creator: { id: string; handle: string; displayName: string; avatarEmoji: string; avatarColor: string; verified: boolean; followers: number };
}): TokenDTO {
  const priceSol = spotPrice(t);
  return {
    id: t.id, name: t.name, symbol: t.symbol, description: t.description, imageUrl: t.imageUrl, mint: t.mint,
    status: t.status as TokenDTO["status"], priceSol, marketCapUsd: priceSol * TOTAL_SUPPLY * SOL_USD,
    progress: curveProgress(t),
    creator: { ...t.creator } as UserDTO,
    tradeCount: t.tradeCount, virtualSol: t.virtualSol, virtualToken: t.virtualToken,
    createdAt: t.createdAt.toISOString(), lastTradeAt: t.lastTradeAt.toISOString(),
  };
}

export async function GET() {
  try {
    const user = await getSessionUser();

    const holdingsRaw = await db.holding.findMany({
      where: { userId: user.id, amount: { gt: 0.000001 } },
      include: { token: { include: { creator: true } } },
    });

    const holdings: HoldingDTO[] = holdingsRaw.map((h) => {
      const token = toTokenDTO(h.token);
      const valueSol = h.amount * token.priceSol;
      const costUsd = h.amount * h.avgPrice * SOL_USD;
      const pnlUsd = valueSol * SOL_USD - costUsd;
      return { id: h.id, token, amount: h.amount, avgPrice: h.avgPrice, valueSol, pnlUsd };
    });

    const tradesRaw = await db.trade.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { token: { select: { name: true, symbol: true, imageUrl: true } } },
    });

    const recentTrades = tradesRaw.map((t) => {
      const dto: TradeDTO = {
        id: t.id, side: t.side as TradeDTO["side"], solAmount: t.solAmount, tokenAmount: t.tokenAmount,
        priceAfter: t.priceAfter, traderLabel: t.traderLabel, isBot: t.isBot, txSig: t.txSig, createdAt: t.createdAt.toISOString(),
      };
      return { ...dto, tokenName: t.token.name, tokenSymbol: t.token.symbol, tokenImage: t.token.imageUrl };
    });

    const fees = await db.feeRecord.aggregate({ _sum: { settledSol: true } });

    const totalValueUsd = holdings.reduce((a, h) => a + h.valueSol * SOL_USD, 0);
    const totalPnlUsd = holdings.reduce((a, h) => a + h.pnlUsd, 0);

    const wallet = await db.wallet.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

    const dto: PortfolioDTO = {
      address: wallet?.address ?? null,
      provider: wallet?.provider ?? null,
      solBalance: BASE_SOL_BALANCE,
      solUsd: SOL_USD,
      holdings,
      recentTrades,
      totalValueUsd,
      totalPnlUsd,
      cashbackRate: 0.015,
      securityAlerts: 0,
      launchFeesPaid: fees._sum.settledSol ?? 0,
    };
    return NextResponse.json(dto);
  } catch (err) {
    console.error("portfolio error", err);
    return NextResponse.json({ error: "Failed to load portfolio" }, { status: 500 });
  }
}
