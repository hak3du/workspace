import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { botTrade, curveProgress, fakeTxSig, solOut, spotPrice, tokensOut, BOT_LABELS, TOTAL_SUPPLY } from "@/lib/bonding";
import { SOL_USD } from "@/lib/format";
import type { TokenDTO, TradeDTO, UserDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

function toUserDTO(u: { id: string; handle: string; displayName: string; avatarEmoji: string; avatarColor: string; verified: boolean; followers: number }): UserDTO {
  return { id: u.id, handle: u.handle, displayName: u.displayName, avatarEmoji: u.avatarEmoji, avatarColor: u.avatarColor, verified: u.verified, followers: u.followers };
}

function toTokenDTO(
  t: {
    id: string; name: string; symbol: string; description: string; imageUrl: string | null; mint: string;
    status: string; virtualSol: number; virtualToken: number; tradeCount: number; createdAt: Date; lastTradeAt: Date;
    creator: Parameters<typeof toUserDTO>[0];
  }
): TokenDTO {
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

function solLabel(n: number): string {
  return n >= 1 ? n.toFixed(2) : n.toFixed(3);
}

// POST /api/tokens/[id]/trade — body { side: "BUY"|"SELL", solAmount?, percent? }
//
// Fee model (simulated, fully disclosed to the user):
// - BUY: trader pays solAmount; 1% platform fee; the remaining 99% (effectiveSol)
//   enters the virtual curve.
// - SELL: curve pays out solGross for tokenIn; trader receives solGross * 0.99;
//   the 1% (feeSol) is platform revenue. Virtual reserves always move by the full
//   curve amounts (effectiveSol in / solGross out) so the constant-product
//   invariant keeps holding.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getSessionUser();
    const body = (await req.json().catch(() => null)) as { side?: unknown; solAmount?: unknown; percent?: unknown } | null;

    if (!body || (body.side !== "BUY" && body.side !== "SELL")) {
      return NextResponse.json({ error: "side must be BUY or SELL" }, { status: 400 });
    }
    const side: "BUY" | "SELL" = body.side;

    type TxResult =
      | { kind: "not_found" }
      | { kind: "bad_request"; message: string }
      | {
          kind: "ok";
          trade: TradeDTO;
          botTrade?: TradeDTO;
          feeSol: number;
          holding: { amount: number; avgPrice: number };
          token: TokenDTO;
        };

    const result: TxResult = await db.$transaction(async (tx): Promise<TxResult> => {
      const token = await tx.token.findUnique({ where: { id }, include: { creator: true } });
      if (!token) return { kind: "not_found" };

      const state = { virtualSol: token.virtualSol, virtualToken: token.virtualToken };
      const now = new Date();

      let tradeDTO: TradeDTO;
      let feeSol: number;
      let holdingResult: { amount: number; avgPrice: number };
      let newVirtualSol: number;
      let newVirtualToken: number;

      if (side === "BUY") {
        const raw = typeof body.solAmount === "number"
          ? body.solAmount
          : typeof body.solAmount === "string" && body.solAmount.trim() !== "" ? Number(body.solAmount) : NaN;
        if (!Number.isFinite(raw) || raw < 0.01 || raw > 100) {
          return { kind: "bad_request", message: "solAmount must be between 0.01 and 100 SOL" };
        }
        const effectiveSol = raw * 0.99; // 1% platform fee
        const tokenOut = tokensOut(state, effectiveSol);
        if (!(tokenOut > 0)) return { kind: "bad_request", message: "Trade too small to fill" };

        newVirtualSol = state.virtualSol + effectiveSol;
        newVirtualToken = state.virtualToken - tokenOut;
        const priceAfter = spotPrice({ virtualSol: newVirtualSol, virtualToken: newVirtualToken });
        feeSol = raw * 0.01;

        const created = await tx.trade.create({
          data: {
            tokenId: id,
            userId: user.id,
            side: "BUY",
            solAmount: raw,
            tokenAmount: tokenOut,
            priceAfter,
            traderLabel: "you",
            isBot: false,
            txSig: fakeTxSig(),
          },
        });
        tradeDTO = toTradeDTO(created);

        // Upsert holding with weighted average cost basis.
        const existing = await tx.holding.findUnique({ where: { tokenId_userId: { tokenId: id, userId: user.id } } });
        const fillPrice = effectiveSol / tokenOut;
        if (existing) {
          const amount = existing.amount + tokenOut;
          const avgPrice = (existing.amount * existing.avgPrice + tokenOut * fillPrice) / amount;
          await tx.holding.update({ where: { id: existing.id }, data: { amount, avgPrice } });
          holdingResult = { amount, avgPrice };
        } else {
          await tx.holding.create({ data: { tokenId: id, userId: user.id, amount: tokenOut, avgPrice: fillPrice } });
          holdingResult = { amount: tokenOut, avgPrice: fillPrice };
        }
      } else {
        const percent = typeof body.percent === "number"
          ? body.percent
          : typeof body.percent === "string" && body.percent.trim() !== "" ? Number(body.percent) : NaN;
        if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
          return { kind: "bad_request", message: "percent must be between 1 and 100" };
        }
        const holding = await tx.holding.findUnique({ where: { tokenId_userId: { tokenId: id, userId: user.id } } });
        if (!holding || holding.amount <= 0) {
          return { kind: "bad_request", message: "No tokens to sell" };
        }
        const tokenIn = (holding.amount * percent) / 100;
        const solGross = solOut(state, tokenIn);
        if (!(solGross > 0)) return { kind: "bad_request", message: "Trade too small to fill" };

        newVirtualSol = state.virtualSol - solGross;
        newVirtualToken = state.virtualToken + tokenIn;
        const priceAfter = spotPrice({ virtualSol: newVirtualSol, virtualToken: newVirtualToken });
        feeSol = solGross * 0.01; // platform keeps 1% of the curve payout

        const created = await tx.trade.create({
          data: {
            tokenId: id,
            userId: user.id,
            side: "SELL",
            solAmount: solGross,
            tokenAmount: tokenIn,
            priceAfter,
            traderLabel: "you",
            isBot: false,
            txSig: fakeTxSig(),
          },
        });
        tradeDTO = toTradeDTO(created);

        const remaining = holding.amount - tokenIn;
        if (remaining < 0.000001) {
          await tx.holding.delete({ where: { id: holding.id } });
          holdingResult = { amount: 0, avgPrice: holding.avgPrice };
        } else {
          await tx.holding.update({ where: { id: holding.id }, data: { amount: remaining } });
          holdingResult = { amount: remaining, avgPrice: holding.avgPrice };
        }
      }

      // 35% chance a simulated market-maker takes the other side right after you,
      // so the market feels alive.
      let botDTO: TradeDTO | undefined;
      let botCount = 0;
      if (Math.random() < 0.35) {
        const bot = botTrade({ virtualSol: newVirtualSol, virtualToken: newVirtualToken });
        if (bot) {
          const botAfter = {
            virtualSol: bot.side === "BUY" ? newVirtualSol + bot.solAmount : newVirtualSol - bot.solAmount,
            virtualToken: bot.side === "BUY" ? newVirtualToken - bot.tokenAmount : newVirtualToken + bot.tokenAmount,
          };
          const label = BOT_LABELS[Math.floor(Math.random() * BOT_LABELS.length)];
          const botRow = await tx.trade.create({
            data: {
              tokenId: id,
              userId: null,
              side: bot.side,
              solAmount: bot.solAmount,
              tokenAmount: bot.tokenAmount,
              priceAfter: spotPrice(botAfter),
              traderLabel: label,
              isBot: true,
              txSig: fakeTxSig(),
            },
          });
          botDTO = toTradeDTO(botRow);
          botCount = 1;
          newVirtualSol = botAfter.virtualSol;
          newVirtualToken = botAfter.virtualToken;
          await tx.activityEvent.create({
            data: {
              kind: "TRADE",
              title: `${label} ${bot.side === "BUY" ? "bought" : "sold"} ${solLabel(bot.solAmount)} SOL of ${token.symbol}`,
              meta: JSON.stringify({ symbol: token.symbol, bot: true }),
              tokenId: id,
            },
          });
        }
      }

      // Graduation: curve fully filled → migrate liquidity (simulated).
      let status = token.status;
      const progress = curveProgress({ virtualSol: newVirtualSol, virtualToken: newVirtualToken });
      if (progress >= 100 && token.status === "BONDING") {
        status = "MIGRATED";
        await tx.activityEvent.create({
          data: {
            kind: "GRADUATE",
            title: `${token.symbol} graduated to the liquidity pool 🎓`,
            meta: JSON.stringify({ symbol: token.symbol }),
            tokenId: id,
          },
        });
        await tx.notification.create({
          data: {
            userId: user.id,
            kind: "LAUNCH",
            title: "Graduation complete",
            body: `${token.name} (${token.symbol}) reached 85 SOL of virtual reserves and migrated to the liquidity pool. Simulated.`,
          },
        });
      }

      await tx.activityEvent.create({
        data: {
          kind: "TRADE",
          title: `you ${side === "BUY" ? "bought" : "sold"} ${solLabel(tradeDTO.solAmount)} SOL of ${token.symbol}`,
          meta: JSON.stringify({ symbol: token.symbol, side }),
          tokenId: id,
        },
      });

      const updated = await tx.token.update({
        where: { id },
        data: {
          virtualSol: newVirtualSol,
          virtualToken: newVirtualToken,
          status,
          tradeCount: { increment: 1 + botCount },
          lastTradeAt: now,
        },
      });

      return {
        kind: "ok",
        trade: tradeDTO,
        botTrade: botDTO,
        feeSol,
        holding: holdingResult,
        token: toTokenDTO({
          ...token,
          virtualSol: newVirtualSol,
          virtualToken: newVirtualToken,
          status,
          tradeCount: updated.tradeCount,
          lastTradeAt: now,
        }),
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if (result.kind === "bad_request") {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      trade: result.trade,
      token: result.token,
      holding: result.holding,
      feeSol: result.feeSol,
      botTrade: result.botTrade, // undefined when no bot trade happened
    });
  } catch (err) {
    console.error("token trade error", err);
    return NextResponse.json({ error: "Failed to execute trade" }, { status: 500 });
  }
}
