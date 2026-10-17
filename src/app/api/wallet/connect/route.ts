import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Legacy association endpoint. Client-supplied addresses and provider labels
// are not proof of wallet ownership. Only /api/wallet/verify/confirm may set
// verified=true after validating a single-use Ed25519 challenge signature.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = await req.json().catch(() => ({}));
    const input = body as { address?: unknown; provider?: unknown };
    const address = typeof input.address === "string" ? input.address : "";
    const requestedProvider = typeof input.provider === "string" ? input.provider : "";
    const provider = ["Phantom", "Solflare"].includes(requestedProvider)
      ? requestedProvider
      : "Unverified";

    try {
      const key = new PublicKey(address);
      if (key.toBase58() !== address) throw new Error("Non-canonical address");
    } catch {
      return NextResponse.json({ error: "A canonical Solana wallet address is required." }, { status: 400 });
    }

    const existing = await db.wallet.findUnique({ where: { address } });
    if (existing && existing.userId !== user.id) {
      return NextResponse.json({ error: "This wallet is already linked to another account." }, { status: 409 });
    }

    const wallet = existing
      ? await db.wallet.update({
          where: { address },
          // Never elevate or overwrite verified ownership in this legacy path.
          data: { provider },
        })
      : await db.wallet.create({
          data: { userId: user.id, address, provider, verified: false },
        });

    return NextResponse.json({
      ok: true,
      address: wallet.address,
      provider: wallet.provider,
      verified: wallet.verified,
      requiresSignatureVerification: !wallet.verified,
      message: wallet.verified
        ? "Wallet is already verified."
        : "Wallet associated but not verified. Complete the signed wallet challenge before using it for trading.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("wallet connect error", err);
    return NextResponse.json({ error: "Wallet association failed" }, { status: 500 });
  }
}
