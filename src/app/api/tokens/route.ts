import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { curveProgress, fakeMint, fakeTxSig, spotPrice, LAUNCH_FEE_SOL, TOTAL_SUPPLY } from "@/lib/bonding";
import { isSimulationMode } from "@/lib/marketplace/config";
import { SOL_USD } from "@/lib/format";
import type { TokenDTO, UserDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// Mirrors bootstrap's toToken — kept local so route files stay self-contained.
function toUserDTO(u: { id: string; handle: string; displayName: string; avatarEmoji: string; avatarColor: string; verified: boolean; followers: number }): UserDTO {
  return { id: u.id, handle: u.handle, displayName: u.displayName, avatarEmoji: u.avatarEmoji, avatarColor: u.avatarColor, verified: u.verified, followers: u.followers };
}

export function toTokenDTO(
  t: {
    id: string; name: string; symbol: string; description: string; imageUrl: string | null; mint: string;
    status: string; virtualSol: number; virtualToken: number; tradeCount: number; createdAt: Date; lastTradeAt: Date;
    creator: Parameters<typeof toUserDTO>[0];
  },
  extra?: { holders?: number }
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
    holders: extra?.holders,
  };
}

// GET /api/tokens?q=&sort=new|progress|mcap|trades&tab=terminal|following|created&limit=
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") || "").trim();
    const sortRaw = sp.get("sort") || "new";
    const tabRaw = sp.get("tab") || "terminal";
    const limitRaw = parseInt(sp.get("limit") || "24", 10);

    // Reject unsupported filters rather than silently returning a misleading feed.
    if (q.length > 80) {
      return NextResponse.json({ error: "Search query must be 80 characters or fewer" }, { status: 400 });
    }
    const allowedSorts = ["new", "progress", "mcap", "trades"] as const;
    if (!allowedSorts.includes(sortRaw as typeof allowedSorts[number])) {
      return NextResponse.json({ error: "sort must be new, progress, mcap, or trades" }, { status: 400 });
    }
    if (!["terminal", "following", "created"].includes(tabRaw)) {
      return NextResponse.json({ error: "tab must be terminal, following, or created" }, { status: 400 });
    }
    const sort = sortRaw;
    const tab = tabRaw;
    const limit = Math.max(1, Math.min(Number.isNaN(limitRaw) ? 24 : limitRaw, 96));

    // Never label the global feed as "Following". Until follow relationships are
    // implemented, return an honest empty result for that tab.
    if (tab === "following") {
      return NextResponse.json({
        tokens: [],
        message: "Following feed is not available yet",
      });
    }

    const where: Record<string, unknown> = {};
    if (tab === "created") where.creatorId = user.id;
    if (q) {
      where.OR = [{ name: { contains: q } }, { symbol: { contains: q } }];
    }

    // virtualSol is monotonic with curve progress, spot price and market cap on a
    // constant-product curve (virtualToken === K / virtualSol), so a single column sort covers it.
    const orderBy =
      sort === "trades" ? { tradeCount: "desc" as const }
      : sort === "new" ? { createdAt: "desc" as const }
      : { virtualSol: "desc" as const }; // "progress" | "mcap"

    const [tokensRaw, holderGroups] = await Promise.all([
      db.token.findMany({ where, orderBy, take: limit, include: { creator: true } }),
      db.holding.groupBy({ by: ["tokenId"], _count: { userId: true } }),
    ]);

    const holderMap = new Map<string, number>();
    for (const g of holderGroups) holderMap.set(g.tokenId, g._count.userId);

    const tokens: TokenDTO[] = tokensRaw.map((t) => toTokenDTO(t, { holders: holderMap.get(t.id) ?? 0 }));
    return NextResponse.json({ tokens });
  } catch (err) {
    console.error("tokens list error", err);
    return NextResponse.json({ error: "Failed to load tokens" }, { status: 500 });
  }
}

// POST /api/tokens — launch a new token on the bonding curve.
export async function POST(req: NextRequest) {
  // The legacy implementation below creates synthetic mints/signatures and must
  // never run in devnet/mainnet mode. Fail closed until a real adapter is merged.
  if (!isSimulationMode()) {
    return NextResponse.json(
      {
        error: "Real token launches are not enabled yet. No Solana transaction was submitted.",
        code: "PUMPFUN_ADAPTER_NOT_IMPLEMENTED",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const user = await getSessionUser();
    const body = (await req.json().catch(() => null)) as
      | { name?: unknown; symbol?: unknown; description?: unknown; imageUrl?: unknown }
      | null;

    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const imageUrlRaw = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    let imageUrl: string | null = null;
    if (imageUrlRaw) {
      if (imageUrlRaw.length > 2048) {
        return NextResponse.json({ error: "Image URL must be 2048 characters or fewer" }, { status: 400 });
      }
      try {
        const parsedImageUrl = new URL(imageUrlRaw);
        if (parsedImageUrl.protocol !== "https:" && parsedImageUrl.protocol !== "http:") {
          return NextResponse.json({ error: "Image URL must use HTTP or HTTPS" }, { status: 400 });
        }
        imageUrl = parsedImageUrl.toString();
      } catch {
        return NextResponse.json({ error: "Image URL must be a valid HTTP or HTTPS URL" }, { status: 400 });
      }
    }

    if (name.length < 2 || name.length > 32) {
      return NextResponse.json({ error: "Name must be 2-32 characters" }, { status: 400 });
    }
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
      return NextResponse.json({ error: "Symbol must be 2-10 uppercase letters or digits" }, { status: 400 });
    }
    if (description.length > 280) {
      return NextResponse.json({ error: "Description must be 280 characters or fewer" }, { status: 400 });
    }

    const token = await db.$transaction(async (tx) => {
      const created = await tx.token.create({
        data: {
          name,
          symbol,
          description,
          imageUrl,
          mint: fakeMint(),
          creatorId: user.id,
        },
        include: { creator: true },
      });

      // Itemized launch fee receipt (simulated settlement).
      await tx.feeRecord.create({
        data: {
          ref: `launch:${crypto.randomUUID()}`,
          tokenId: created.id,
          kind: "LAUNCH_FEE",
          quotedSol: LAUNCH_FEE_SOL,
          settledSol: LAUNCH_FEE_SOL,
          status: "CONFIRMED",
          txSig: fakeTxSig(),
          settledAt: new Date(),
        },
      });

      await tx.activityEvent.create({
        data: {
          kind: "LAUNCH",
          title: `${symbol} launched on the Arena`,
          meta: JSON.stringify({ symbol }),
          tokenId: created.id,
        },
      });

      await tx.notification.create({
        data: {
          userId: user.id,
          kind: "LAUNCH",
          title: "Launch confirmed",
          body: `${name} (${symbol}) is live on the bonding curve. Fee 0.02 SOL settled.`,
        },
      });

      return created;
    });

    return NextResponse.json({ token: toTokenDTO(token) }, { status: 201 });
  } catch (err) {
    console.error("token create error", err);
    return NextResponse.json({ error: "Failed to launch token" }, { status: 500 });
  }
}
