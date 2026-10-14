"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import BN from "bn.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { post } from "@/lib/api";
import { solOut, spotPrice, tokensOut } from "@/lib/bonding";
import { compact, priceLabel, sol } from "@/lib/format";
import type { TokenDTO, TradeDTO } from "@/lib/types";

const BUY_PRESETS = [0.1, 0.5, 1, 5];
const SELL_PRESETS = [25, 50, 75, 100];
const REAL_PUMP_TRADING_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING === "true";
const TOKEN_DECIMALS = 6;

interface TradeResponse {
  trade: TradeDTO;
  token: TokenDTO;
  holding: { amount: number; avgPrice: number };
  feeSol: number;
  botTrade?: TradeDTO;
}

interface OnChainQuote {
  outputAmount: number;
  feesSol: number;
  priceImpactPct: number | null;
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
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const sdk = useMemo(() => new OnlinePumpSdk(connection), [connection]);

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState(50);
  const [pending, setPending] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [onChainQuote, setOnChainQuote] = useState<OnChainQuote | null>(null);
  const [walletTokenBalance, setWalletTokenBalance] = useState("0");
  const [quoteRefresh, setQuoteRefresh] = useState(0);

  const state = { virtualSol: token.virtualSol, virtualToken: token.virtualToken };
  const spot = spotPrice(state);
  const amt = Number(amount);

  // These previews belong only to the explicitly labelled demo path.
  const effectiveSol = amt > 0 && Number.isFinite(amt) ? amt * 0.99 : 0;
  const demoBuyOut = effectiveSol > 0 ? tokensOut(state, effectiveSol) : 0;
  const demoImpactPct = demoBuyOut > 0 ? ((effectiveSol / demoBuyOut / spot - 1) * 100) : null;
  const demoTokenIn = myHolding && myHolding.amount > 0 ? (myHolding.amount * percent) / 100 : 0;
  const demoSellGross = demoTokenIn > 0 ? solOut(state, demoTokenIn) : 0;
  const demoSellReceive = demoSellGross * 0.99;

  useEffect(() => {
    let active = true;

    async function loadOnChainQuote() {
      if (!REAL_PUMP_TRADING_ENABLED || !connected || !publicKey) {
        setOnChainQuote(null);
        setQuoteError(null);
        setWalletTokenBalance("0");
        setQuoteLoading(false);
        return;
      }

      if (side === "BUY" && (!Number.isFinite(amt) || amt < 0.01 || amt > 100)) {
        setOnChainQuote(null);
        setQuoteError(null);
        setQuoteLoading(false);
        return;
      }

      setQuoteLoading(true);
      setQuoteError(null);

      try {
        const mint = new PublicKey(token.mint);
        const bondingCurve = await sdk.fetchBondingCurve(mint);
        const graduated = bondingCurve.complete;
        let quote: OnChainQuote;

        if (side === "BUY") {
          const solAmount = new BN(Math.round(amt * LAMPORTS_PER_SOL));
          const result = graduated
            ? await sdk.ammQuoteBuy({ mint, user: publicKey, quoteAmountIn: solAmount })
            : await sdk.quoteBuy({ mint, user: publicKey, solAmount });

          quote = {
            outputAmount: Number(result.tokensOut.toString()) / (10 ** TOKEN_DECIMALS),
            feesSol: Number(result.feesLamports.toString()) / LAMPORTS_PER_SOL,
            priceImpactPct: "priceImpactBps" in result
              ? result.priceImpactBps / 100
              : null,
          };
        } else {
          const balance = await sdk.getTokenBalance(mint, publicKey);
          if (!active) return;
          setWalletTokenBalance(balance.toString());

          const tokenAmount = balance.muln(percent).divn(100);
          if (tokenAmount.isZero()) {
            setOnChainQuote(null);
            setQuoteError("This wallet has no balance for this token on the selected network.");
            return;
          }

          const result = graduated
            ? await sdk.ammQuoteSell({ mint, user: publicKey, baseAmountIn: tokenAmount })
            : await sdk.quoteSell({ mint, user: publicKey, amount: tokenAmount });

          if ("willOverflow" in result && result.willOverflow) {
            throw new Error("This sell amount exceeds the protocol's safe single-transaction limit.");
          }

          quote = {
            outputAmount: Number(result.solOut.toString()) / LAMPORTS_PER_SOL,
            feesSol: Number(result.feesLamports.toString()) / LAMPORTS_PER_SOL,
            priceImpactPct: "priceImpactBps" in result
              ? result.priceImpactBps / 100
              : null,
          };
        }

        if (active) setOnChainQuote(quote);
      } catch {
        if (active) {
          setOnChainQuote(null);
          setQuoteError(
            "A live Pump.fun quote is unavailable for this listing on the selected network. This may be a demo mint or an unsupported asset."
          );
        }
      } finally {
        if (active) setQuoteLoading(false);
      }
    }

    void loadOnChainQuote();
    return () => {
      active = false;
    };
  }, [
    amt,
    connected,
    percent,
    publicKey,
    quoteRefresh,
    sdk,
    side,
    token.mint,
  ]);

  async function handleSubmit() {
    if (!connected || !publicKey) {
      toast({
        title: "Connect your Solana wallet",
        description: "Connect Phantom before proceeding.",
        variant: "destructive",
      });
      return;
    }

    if (side === "BUY" && (!(amt >= 0.01) || !(amt <= 100))) {
      toast({ title: "Invalid amount", description: "Buy between 0.01 and 100 SOL.", variant: "destructive" });
      return;
    }

    if (REAL_PUMP_TRADING_ENABLED) {
      if (!onChainQuote || quoteLoading || quoteError) {
        toast({
          title: "Live quote unavailable",
          description: quoteError ?? "Wait for a valid on-chain quote before signing.",
          variant: "destructive",
        });
        return;
      }

      let submittedSignature: string | null = null;
      setPending(true);
      try {
        const mint = new PublicKey(token.mint);
        const instructions = side === "BUY"
          ? await sdk.routedBuyInstructions({
              mint,
              user: publicKey,
              quoteAmountIn: new BN(Math.round(amt * LAMPORTS_PER_SOL)),
              slippage: 1,
            })
          : await sdk.routedSellInstructions({
              mint,
              user: publicKey,
              baseAmountIn: new BN(walletTokenBalance).muln(percent).divn(100),
              slippage: 1,
            });

        if (!instructions.length) {
          throw new Error("The protocol did not produce a transaction for this asset.");
        }

        const latest = await connection.getLatestBlockhash("confirmed");
        const transaction = new VersionedTransaction(
          new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: latest.blockhash,
            instructions,
          }).compileToV0Message()
        );

        submittedSignature = await sendTransaction(transaction, connection, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });

        const confirmation = await connection.confirmTransaction(
          { signature: submittedSignature, ...latest },
          "confirmed"
        );

        if (confirmation.value.err) {
          throw new Error("The network reported a failed transaction.");
        }

        const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "devnet"
          ? "?cluster=devnet"
          : process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "testnet"
            ? "?cluster=testnet"
            : "";
        const explorerUrl = "https://explorer.solana.com/tx/" + submittedSignature + cluster;

        toast({
          title: side === "BUY" ? "Buy confirmed on Solana" : "Sell confirmed on Solana",
          description: "Signature: " + submittedSignature + ". Explorer: " + explorerUrl,
        });

        if (side === "BUY") setAmount("");
        setQuoteRefresh((value) => value + 1);
      } catch (err) {
        const message = err instanceof Error ? err.message : "The transaction could not be completed.";
        toast({
          title: submittedSignature ? "Transaction status needs checking" : "On-chain trade failed",
          description: submittedSignature
            ? message + " Check the signature before retrying: " + submittedSignature
            : message + " No successful on-chain confirmation was received.",
          variant: "destructive",
        });
      } finally {
        setPending(false);
      }
      return;
    }

    if (side === "SELL" && (!myHolding || myHolding.amount <= 0)) {
      toast({ title: "Nothing to sell", description: "You don't hold this demo token yet.", variant: "destructive" });
      return;
    }

    setPending(true);
    try {
      const body = side === "BUY" ? { side, solAmount: amt } : { side, percent };
      const d = await post<TradeResponse>("/api/tokens/" + token.id + "/trade", body);
      toast({
        title: side === "BUY" ? "Demo buy recorded" : "Demo sell recorded",
        description: "Simulation only — no SOL or tokens moved. Demo amount: " +
          compact(d.trade.tokenAmount) + " " + token.symbol + ".",
      });
      if (side === "BUY") setAmount("");
      onTraded();
    } catch (err) {
      toast({
        title: "Demo trade failed",
        description: err instanceof Error ? err.message : "The simulation rejected the trade.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  const sellBalance = Number(walletTokenBalance) / (10 ** TOKEN_DECIMALS);
  const displayedBuyOut = REAL_PUMP_TRADING_ENABLED ? onChainQuote?.outputAmount : demoBuyOut;
  const displayedSellReceive = REAL_PUMP_TRADING_ENABLED ? onChainQuote?.outputAmount : demoSellReceive;
  const displayedTokenIn = REAL_PUMP_TRADING_ENABLED
    ? sellBalance * percent / 100
    : demoTokenIn;
  const displayedImpact = REAL_PUMP_TRADING_ENABLED
    ? onChainQuote?.priceImpactPct ?? null
    : demoImpactPct;

  if (!connected) {
    return (
      <div className="glass rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Trade {token.symbol}
        </h3>
        <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center">
          <Wallet className="mx-auto size-6 text-violet-300" />
          <p className="text-sm text-muted-foreground">
            Connect Phantom to {REAL_PUMP_TRADING_ENABLED
              ? "request a live quote and sign a real Pump.fun transaction."
              : "try the clearly labelled demo. No real funds move in demo mode."}
          </p>
          <WalletMultiButton className="!h-11 !w-full !justify-center !rounded-lg" />
        </div>
      </div>
    );
  }

  const realTradeUnavailable = REAL_PUMP_TRADING_ENABLED &&
    (quoteLoading || !onChainQuote || Boolean(quoteError));

  return (
    <div className="glass rounded-2xl p-4">
      {REAL_PUMP_TRADING_ENABLED ? (
        <div className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">
          Live on-chain trading is enabled. Verify the token mint, quote, slippage, and wallet transaction before signing.
          {quoteLoading ? " Fetching a live quote…" : quoteError ? " " + quoteError : ""}
        </div>
      ) : (
        <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-muted-foreground">
          Demo mode only. Buy/sell previews and fills are simulated; no SOL or tokens move.
        </div>
      )}

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
                className={"h-11 flex-1 " + (amount === String(v) ? "border-violet-400/60 bg-violet-500/15 text-violet-200" : "")}
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
              <span className="text-xs text-muted-foreground">You receive (estimated)</span>
              <span className="font-semibold">
                {displayedBuyOut && displayedBuyOut > 0 ? compact(displayedBuyOut) + " " + token.symbol : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Price impact</span>
              <span>{displayedImpact !== null ? "~" + displayedImpact.toFixed(2) + "%" : "—"}</span>
            </div>
            {REAL_PUMP_TRADING_ENABLED && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Protocol/creator fees (quote)</span>
                <span>{onChainQuote ? sol(onChainQuote.feesSol) : "—"}</span>
              </div>
            )}
            {!REAL_PUMP_TRADING_ENABLED && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Demo spot price</span>
                <span className="font-mono">{priceLabel(spot)} SOL</span>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="SELL" className="space-y-4 pt-1">
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
            <span className="text-muted-foreground">Wallet token balance</span>
            {REAL_PUMP_TRADING_ENABLED ? (
              <span className="font-medium">
                {compact(sellBalance)} {token.symbol}
              </span>
            ) : myHolding && myHolding.amount > 0 ? (
              <span className="font-medium">
                {compact(myHolding.amount)} {token.symbol} · avg {priceLabel(myHolding.avgPrice)} SOL
              </span>
            ) : (
              <span className="text-muted-foreground">No demo tokens yet</span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {SELL_PRESETS.map((p) => (
              <Button
                key={p}
                type="button"
                variant="outline"
                className={"h-11 flex-1 " + (percent === p ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "")}
                onClick={() => setPercent(p)}
              >
                {p}%
              </Button>
            ))}
          </div>
          <div className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">You receive (estimated)</span>
              <span className="font-semibold">
                {displayedSellReceive && displayedSellReceive > 0 ? sol(displayedSellReceive) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Selling</span>
              <span>{displayedTokenIn > 0 ? compact(displayedTokenIn) + " " + token.symbol : "—"}</span>
            </div>
            {REAL_PUMP_TRADING_ENABLED && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Protocol/creator fees (quote)</span>
                <span>{onChainQuote ? sol(onChainQuote.feesSol) : "—"}</span>
              </div>
            )}
            {!REAL_PUMP_TRADING_ENABLED && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Demo spot price</span>
                <span className="font-mono">{priceLabel(spot)} SOL</span>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Button
        className={"mt-4 h-11 w-full " + (side === "BUY" ? "glow-violet" : "bg-red-500 text-white hover:bg-red-500/90")}
        onClick={handleSubmit}
        disabled={
          pending ||
          (side === "BUY" && (!(amt > 0) || amount === "")) ||
          (REAL_PUMP_TRADING_ENABLED && (realTradeUnavailable || (side === "SELL" && sellBalance <= 0)))
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending
          ? REAL_PUMP_TRADING_ENABLED ? "Waiting for Solana confirmation…" : "Recording demo…"
          : REAL_PUMP_TRADING_ENABLED
            ? side === "BUY" ? "Buy on Solana" : "Sell on Solana"
            : side === "BUY" ? "Record demo buy" : "Record demo sell"}
      </Button>
      <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
        {REAL_PUMP_TRADING_ENABLED
          ? "Live Pump protocol fees and network fees apply. No additional AHE fee is charged by this component."
          : "DEMO ONLY · 1% simulated fee · no funds move"}
      </p>
    </div>
  );
}
