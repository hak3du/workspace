"use client";

import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { post } from "@/lib/api";
import { solOut, spotPrice, tokensOut } from "@/lib/bonding";
import { compact, priceLabel, sol } from "@/lib/format";
import { useApp } from "@/store/app-store";
import type { TokenDTO, TradeDTO } from "@/lib/types";

const BUY_PRESETS = [0.1, 0.5, 1, 5];
const SELL_PRESETS = [25, 50, 75, 100];

interface TradeResponse {
  trade: TradeDTO;
  token: TokenDTO;
  holding: { amount: number; avgPrice: number };
  feeSol: number;
  botTrade?: TradeDTO;
}

export function TradePanel({
  token,
  myHolding,
  onTraded,
}: {
  token: TokenDTO;
  myHolding?: { amount: number; avgPrice: number } | null;
  onTraded: () => void;
}) {
  const { toast } = useToast();
  const wallet = useApp((s) => s.wallet);
  const connectWallet = useApp((s) => s.connectWallet);
  const connected = Boolean(wallet.address);

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState(50);
  const [pending, setPending] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const state = { virtualSol: token.virtualSol, virtualToken: token.virtualToken };
  const spot = spotPrice(state);
  const amt = Number(amount);

  // BUY preview: 1% fee is taken before the curve input.
  const effectiveSol = amt > 0 && Number.isFinite(amt) ? amt * 0.99 : 0;
  const buyOut = effectiveSol > 0 ? tokensOut(state, effectiveSol) : 0;
  const impactPct = buyOut > 0 ? ((effectiveSol / buyOut / spot - 1) * 100) : null;

  // SELL preview: curve payout minus the 1% platform fee.
  const tokenIn = myHolding && myHolding.amount > 0 ? (myHolding.amount * percent) / 100 : 0;
  const sellGross = tokenIn > 0 ? solOut(state, tokenIn) : 0;
  const sellReceive = sellGross * 0.99;

  async function handleConnect() {
    setConnecting(true);
    try {
      await connectWallet();
    } finally {
      setConnecting(false);
    }
  }

  async function handleSubmit() {
    if (side === "BUY" && (!(amt >= 0.01) || !(amt <= 100))) {
      toast({ title: "Invalid amount", description: "Buy between 0.01 and 100 SOL.", variant: "destructive" });
      return;
    }
    if (side === "SELL" && (!myHolding || myHolding.amount <= 0)) {
      toast({ title: "Nothing to sell", description: "You don't hold this token yet.", variant: "destructive" });
      return;
    }
    setPending(true);
    try {
      const body = side === "BUY" ? { side, solAmount: amt } : { side, percent };
      const d = await post<TradeResponse>(`/api/tokens/${token.id}/trade`, body);
      toast({
        title: side === "BUY" ? "Buy filled" : "Sell filled",
        description:
          side === "BUY"
            ? `Bought ${compact(d.trade.tokenAmount)} ${token.symbol} for ${sol(d.trade.solAmount)}.`
            : `Sold ${compact(d.trade.tokenAmount)} ${token.symbol} for ${sol(d.trade.solAmount * 0.99)}.`,
      });
      if (side === "BUY") setAmount("");
      onTraded();
    } catch (err) {
      toast({
        title: "Trade failed",
        description: err instanceof Error ? err.message : "The simulated route rejected the trade.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  if (!connected) {
    return (
      <div className="glass rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Trade {token.symbol}</h3>
        <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center">
          <Wallet className="mx-auto size-6 text-violet-300" />
          <p className="text-sm text-muted-foreground">Connect a simulated wallet to buy or sell {token.symbol}.</p>
          <Button className="glow-violet h-11 w-full" onClick={handleConnect} disabled={connecting}>
            {connecting ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
            {connecting ? "Connecting…" : "Connect wallet"}
          </Button>
          <p className="text-[11px] text-muted-foreground">Simulated wallet — no real funds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-4">
      <Tabs value={side} onValueChange={(v) => setSide(v === "SELL" ? "SELL" : "BUY")}>
        <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-white/5 p-1">
          <TabsTrigger
            value="BUY"
            className="rounded-lg data-[state=active]:bg-violet-600/25 data-[state=active]:text-violet-200 data-[state=active]:shadow-none"
          >
            Buy
          </TabsTrigger>
          <TabsTrigger
            value="SELL"
            className="rounded-lg data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300 data-[state=active]:shadow-none"
          >
            Sell
          </TabsTrigger>
        </TabsList>

        <TabsContent value="BUY" className="space-y-4 pt-1">
          <div className="grid grid-cols-4 gap-2">
            {BUY_PRESETS.map((v) => (
              <Button
                key={v}
                type="button"
                variant="outline"
                className={`h-11 flex-1 ${amount === String(v) ? "border-violet-400/60 bg-violet-500/15 text-violet-200" : ""}`}
                onClick={() => setAmount(String(v))}
              >
                {v}
              </Button>
            ))}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            min={0.01}
            max={100}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Custom amount (0.01 - 100 SOL)"
            aria-label="Amount in SOL to buy"
            className="h-11"
          />
          <div className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">You receive (est.)</span>
              <span className="font-semibold">{buyOut > 0 ? `${compact(buyOut)} ${token.symbol}` : "—"}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Price impact</span>
              <span>{impactPct !== null ? `~${impactPct.toFixed(2)}%` : "—"}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Spot price</span>
              <span className="font-mono">{priceLabel(spot)} SOL</span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="SELL" className="space-y-4 pt-1">
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
            <span className="text-muted-foreground">Your holding</span>
            {myHolding && myHolding.amount > 0 ? (
              <span className="font-medium">
                {compact(myHolding.amount)} {token.symbol} · avg {priceLabel(myHolding.avgPrice)} SOL
              </span>
            ) : (
              <span className="text-muted-foreground">No tokens yet</span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {SELL_PRESETS.map((p) => (
              <Button
                key={p}
                type="button"
                variant="outline"
                className={`h-11 flex-1 ${percent === p ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : ""}`}
                onClick={() => setPercent(p)}
              >
                {p}%
              </Button>
            ))}
          </div>
          <div className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">You receive (est.)</span>
              <span className="font-semibold">{sellReceive > 0 ? sol(sellReceive) : "—"}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Selling</span>
              <span>{tokenIn > 0 ? `${compact(tokenIn)} ${token.symbol}` : "—"}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Spot price</span>
              <span className="font-mono">{priceLabel(spot)} SOL</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Button
        className={`mt-4 h-11 w-full ${side === "BUY" ? "glow-violet" : "bg-red-500 text-white hover:bg-red-500/90"}`}
        onClick={handleSubmit}
        disabled={pending || (side === "BUY" && (!(amt > 0) || amount === ""))}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "Filling…" : side === "BUY" ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
      </Button>
      <p className="mt-2.5 text-center text-[11px] text-muted-foreground">1% trade fee · simulated devnet route</p>
    </div>
  );
}
