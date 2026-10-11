import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { botTrade, BOT_LABELS, fakeTxSig } from "@/lib/bonding";
import type { ActivityDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// Live activity ticker. Occasionally executes one simulated market-maker trade
// so the board feels alive (clearly labeled isBot / simulated in UI).
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 16), 50);

    if (Math.random() < 0.4) {
      const tokens = await db.token.findMany({ where: { status: "BONDING" }, orderBy: { lastTradeAt: "desc" }, take: 6 });
      const t = tokens[Math.floor(Math.random() * tokens.length)];
      if (t) {
        const bt = botTrade({ virtualSol: t.virtualSol, virtualToken: t.virtualToken });
        if (bt) {
          const newSol = t.virtualSol + (bt.side === "BUY" ? bt.solAmount : -bt.tokenAmount === 0 ? 0 : 0);
          void newSol;
          const virtualSol = bt.side === "BUY" ? t.virtualSol + bt.solAmount : t.virtualSol - bt.solAmount;
          const virtualToken = bt.side === "BUY" ? t.virtualToken - bt.tokenAmount : t.virtualToken + bt.tokenAmount;
          if (virtualSol > 30 && virtualToken > 0) {
            await db.token.update({ where: { id: t.id }, data: { virtualSol, virtualToken, lastTradeAt: new Date(), tradeCount: { increment: 1 } } });
            await db.trade.create({
              data: {
                tokenId: t.id, side: bt.side, solAmount: bt.solAmount, tokenAmount: bt.tokenAmount,
                priceAfter: virtualSol / virtualToken, traderLabel: BOT_LABELS[Math.floor(Math.random() * BOT_LABELS.length)],
                isBot: true, txSig: fakeTxSig(),
              },
            });
            await db.activityEvent.create({
              data: {
                kind: "TRADE",
                title: `${pick(BOT_LABELS)} ${bt.side === "BUY" ? "bought" : "sold"} ${bt.solAmount.toFixed(2)} SOL of ${t.symbol}`,
                meta: JSON.stringify({ symbol: t.symbol, side: bt.side }),
                tokenId: t.id,
              },
            });
          }
        }
      }
    }

    const events = await db.activityEvent.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    const ticker: ActivityDTO[] = events.map((a) => ({
      id: a.id, kind: a.kind, title: a.title, meta: JSON.parse(a.meta || "{}"), tokenId: a.tokenId, createdAt: a.createdAt.toISOString(),
    }));
    return NextResponse.json({ ticker });
  } catch (err) {
    console.error("activity error", err);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
