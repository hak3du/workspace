import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl, type Cluster } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

function finitePositiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteNonNegativeNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  priceNative?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number; base?: number; quote?: number };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number; m5?: number };
  pairCreatedAt?: number;
};

async function rpcAccountInfo(mint: string, endpoint: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "ahe-market-token-check",
      method: "getAccountInfo",
      params: [mint, { encoding: "base64", commitment: "confirmed" }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Solana RPC request failed.");
  const payload = await response.json() as {
    result?: { value?: { owner?: string; executable?: boolean } | null };
    error?: { message?: string };
  };
  if (payload.error) throw new Error(payload.error.message || "Solana RPC error.");
  return payload.result?.value ?? null;
}

export async function GET(request: NextRequest) {
  const mintValue = request.nextUrl.searchParams.get("mint")?.trim();
  if (!mintValue) {
    return NextResponse.json({ error: "Provide a token mint address." }, { status: 400 });
  }

  let mint: string;
  try {
    mint = new PublicKey(mintValue).toBase58();
  } catch {
    return NextResponse.json({ error: "That is not a valid Solana mint address." }, { status: 400 });
  }

  const configured = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  const cluster: Cluster =
    configured === "mainnet-beta" ? "mainnet-beta" :
    configured === "testnet" ? "testnet" : "devnet";
  const rpcEndpoint = process.env.SOLANA_RPC_URL || clusterApiUrl(cluster);

  try {
    const account = await rpcAccountInfo(mint, rpcEndpoint);
    if (!account) {
      return NextResponse.json({ error: "No mint account exists for this address on the app's selected Solana network." }, { status: 404 });
    }
    if (account.executable || ![SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(account.owner || "")) {
      return NextResponse.json({ error: "This account is not a standard SPL Token or Token-2022 mint." }, { status: 422 });
    }

    let pumpCurveAvailable = false;
    let pumpCurveComplete: boolean | null = null;
    let pumpSolQuoted: boolean | null = null;
    let pumpQuoteMint: string | null = null;
    try {
      const pumpSdk = new OnlinePumpSdk(new Connection(rpcEndpoint, "confirmed"));
      const curve = await pumpSdk.fetchBondingCurve(new PublicKey(mint));
      pumpCurveAvailable = true;
      pumpCurveComplete = Boolean(curve.complete);
      pumpQuoteMint = curve.quoteMint.toBase58();
      pumpSolQuoted = curve.quoteMint.equals(PublicKey.default) ||
        curve.quoteMint.toBase58() === "So11111111111111111111111111111111111111112";
    } catch {
      // Not every SPL mint has a Pump bonding curve; Jupiter may still route it.
    }

    let pairs: DexPair[] = [];
    try {
      const marketResponse = await fetch(
        "https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(mint),
        { cache: "no-store", signal: AbortSignal.timeout(10_000) },
      );
      if (marketResponse.ok) {
        const marketPayload = await marketResponse.json() as { pairs?: DexPair[] | null };
        pairs = (marketPayload.pairs || [])
          .filter((pair) =>
            pair.chainId === "solana" &&
            Boolean(pair.pairAddress) &&
            (pair.baseToken?.address?.toLowerCase() === mint.toLowerCase() ||
           pair.quoteToken?.address?.toLowerCase() === mint.toLowerCase())
          )
          .sort((a, b) => {
            const aIsBase = a.baseToken?.address?.toLowerCase() === mint.toLowerCase();
            const bIsBase = b.baseToken?.address?.toLowerCase() === mint.toLowerCase();
            if (aIsBase !== bIsBase) return aIsBase ? -1 : 1;
            return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
          });
      }
    } catch {
      // A valid on-chain mint can exist without a current Dexscreener listing.
    }

    const pair = pairs[0];
    const isBaseToken = pair?.baseToken?.address?.toLowerCase() === mint.toLowerCase();
    const tokenInfo = isBaseToken ? pair?.baseToken : pair?.quoteToken;
    const basePriceUsd = finitePositiveNumber(pair?.priceUsd);
    const basePriceSol = finitePositiveNumber(pair?.priceNative);
    const isWrappedSolQuote = pair?.quoteToken?.address === "So11111111111111111111111111111111111111112";
    // DexScreener price fields describe the base token. Only derive a quote-side
    // price when the quote asset is wrapped SOL and both base prices are valid.
    const derivedQuotePriceUsd = isWrappedSolQuote && basePriceUsd !== null && basePriceSol !== null
      ? basePriceUsd / basePriceSol
      : null;
    const priceUsd = isBaseToken ? basePriceUsd : derivedQuotePriceUsd;
    const priceSol = isBaseToken ? basePriceSol : isWrappedSolQuote ? 1 : null;

    return NextResponse.json({
      mint,
      network: cluster,
      verifiedOnChain: true,
      tokenProgram: account.owner,
      pumpCurveAvailable,
      pumpCurveComplete,
      pumpSolQuoted,
      pumpQuoteMint,
      name: tokenInfo?.name || null,
      symbol: tokenInfo?.symbol || null,
      priceUsd: finitePositiveNumber(priceUsd),
      priceSol: finitePositiveNumber(priceSol),
      marketCapUsd: isBaseToken
        ? finitePositiveNumber(pair?.marketCap) ?? finitePositiveNumber(pair?.fdv)
        : null,
      liquidityUsd: finiteNonNegativeNumber(pair?.liquidity?.usd),
      volume24hUsd: finiteNonNegativeNumber(pair?.volume?.h24),
      change24hPct: isBaseToken ? finiteNumber(pair?.priceChange?.h24) : null,
      pairAddress: pair?.pairAddress || null,
      pairUrl: pair?.url || null,
      chartUrl: pair?.pairAddress && isBaseToken
        ? "https://dexscreener.com/solana/" + encodeURIComponent(pair.pairAddress) + "?embed=1&theme=dark&trades=0&info=0"
        : null,
      marketDataAvailable: finitePositiveNumber(priceUsd) !== null,
      message: !pair
        ? "Mint verified on-chain, but no indexed Solana market pair was found. Price, liquidity and chart are unavailable from indexed providers."
        : finitePositiveNumber(priceUsd) === null
          ? "A market pair was found, but a reliable price could not be derived for this token."
          : null,
      fetchedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify this mint on Solana.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
