"use client";

import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TradePanel } from "@/components/launch/trade-panel";
import type { TokenDTO } from "@/lib/types";

const LIVE_TRADING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING === "true";

export default function TradePage() {
  const [mintInput, setMintInput] = useState("");
  const [symbolInput, setSymbolInput] = useState("");
  const [token, setToken] = useState<TokenDTO | null>(null);
  const [error, setError] = useState("");

  function openMint() {
    const mint = mintInput.trim();
    if (!mint) {
      setError("Paste a real Pump.fun token mint address.");
      return;
    }
    setError("");
    setToken({
      id: "external-" + mint,
      name: "External Pump.fun token",
      symbol: (symbolInput.trim() || "TOKEN").toUpperCase().slice(0, 12),
      description: "On-chain Pump.fun token supplied by the trader.",
      imageUrl: null,
      mint,
      status: "BONDING",
      priceSol: 0,
      marketCapUsd: 0,
      progress: 0,
      creator: {
        id: "external",
        handle: "@onchain",
        displayName: "On-chain token",
        avatarEmoji: "◎",
        avatarColor: "#8b5cf6",
        verified: false,
        followers: 0,
      },
      tradeCount: 0,
      virtualSol: 30,
      virtualToken: 1_000_000_000,
      createdAt: new Date(0).toISOString(),
      lastTradeAt: new Date(0).toISOString(),
    });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">AHE Market · Solana</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Trade a Pump.fun token</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Paste the token mint from Pump.fun or Solscan. This bypasses the demo listings, whose mint addresses are synthetic.
        </p>
      </div>

      <section className="glass mb-6 rounded-2xl p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
          <Input value={mintInput} onChange={(event) => setMintInput(event.target.value)} placeholder="Solana token mint address" aria-label="Pump.fun token mint" />
          <Input value={symbolInput} onChange={(event) => setSymbolInput(event.target.value)} placeholder="Symbol (optional)" aria-label="Token symbol" maxLength={12} />
          <Button onClick={openMint}><Search className="mr-2 size-4" /> Load token</Button>
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Only trade a mint you have independently verified. Your wallet shows the final transaction before you approve it.
        </p>
      </section>

      {!LIVE_TRADING_ENABLED ? (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
          <h2 className="font-semibold text-amber-100">Live trading is currently disabled</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set <code>NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING=true</code> in the Vercel environment and set <code>NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta</code> for real Pump.fun mainnet tokens. Redeploy after changing either variable. The app remains in demo mode until the feature flag is enabled.
          </p>
        </section>
      ) : token ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="glass rounded-2xl p-5">
            <h2 className="text-xl font-semibold">{token.symbol}</h2>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{token.mint}</p>
            <a className="mt-4 inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200" href={"https://pump.fun/coin/" + encodeURIComponent(token.mint)} target="_blank" rel="noreferrer">
              View on Pump.fun <ArrowUpRight className="size-4" />
            </a>
          </div>
          <TradePanel token={token} myHolding={null} onTraded={() => {}} />
        </section>
      ) : (
        <section className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Enter a mint address to load the live trade panel.
        </section>
      )}
    </main>
  );
}
