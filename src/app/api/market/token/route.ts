import { NextRequest, NextResponse } from "next/server";
import { PublicKey, clusterApiUrl, type Cluster } from "@solana/web3.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

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
            pair.baseToken?.address?.toLowerCase() === mint.toLowerCase()
          )
          .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      }
    } catch {
      // A valid on-chain mint can exist without a current Dexscreener listing.
    }

    // Dexscreener's priceUsd/priceNative fields describe the pair's base token.
    // Only use pairs where the requested mint is the base token to avoid showing
    // the quote asset's price as though it belonged to the requested mint.
    const pair = pairs[0];
    const tokenInfo = pair?.baseToken;

    return NextResponse.json({
      mint,
      network: cluster,
      verifiedOnChain: true,
      tokenProgram: account.owner,
      name: tokenInfo?.name || null,
      symbol: tokenInfo?.symbol || null,
      priceUsd: pair?.priceUsd ? Number(pair.priceUsd) : null,
      priceSol: pair?.priceNative ? Number(pair.priceNative) : null,
      marketCapUsd: pair?.marketCap ?? pair?.fdv ?? null,
      liquidityUsd: pair?.liquidity?.usd ?? null,
      volume24hUsd: pair?.volume?.h24 ?? null,
      change24hPct: pair?.priceChange?.h24 ?? null,
      pairAddress: pair?.pairAddress || null,
      pairUrl: pair?.url || null,
      chartUrl: pair?.pairAddress
        ? "https://dexscreener.com/solana/" + encodeURIComponent(pair.pairAddress) + "?embed=1&theme=dark&trades=0&info=0"
        : null,
      marketDataAvailable: Boolean(pair),
      message: pair
        ? null
        : "Mint verified on-chain, but no indexed Solana market pair was found. Price, liquidity and chart are unavailable from Dexscreener for this mint.",
      fetchedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify this mint on Solana.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
