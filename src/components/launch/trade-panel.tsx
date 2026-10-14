"use client";

import { useEffect, useMemo, useState } from "react";
import BN from "bn.js";
import { Loader2, Wallet } from "lucide-react";
import { PublicKey, Transaction, LAMPORTS_PER_SOL, type TransactionInstruction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { post } from "@/lib/api";
import { solOut, spotPrice, tokensOut } from "@/lib/bonding";
import { compact, sol } from "@/lib/format";
import type { TokenDTO, TradeDTO } from "@/lib/types";
import { OnlinePumpSdk, PUMP_SDK, getBuyTokenAmountFromSolAmount, getBuySolAmountFromTokenAmount, getSellSolAmountFromTokenAmount } from "@pump-fun/pump-sdk";

const BUY_PRESETS = [0.1, 0.5, 1, 5];
const SELL_PRESETS = [25, 50, 75, 100];
const REAL_PUMP_TRADING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING === "true";
const TOKEN_DECIMALS_FALLBACK = 6;

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
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const sdk = useMemo(() => new OnlinePumpSdk(connection), [connection]);

  async function resolveBaseTokenProgram(tokenMint: PublicKey): Promise<PublicKey> {
    const mintAccount = await connection.getAccountInfo(tokenMint, "confirmed");
    if (!mintAccount) {
      throw new Error("Token mint account was not found on the selected Solana network.");
    }
    const owner = mintAccount.owner.toBase58();
    if (
      owner !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
      owner !== "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    ) {
      throw new Error("Mint is not owned by the SPL Token or Token-2022 program.");
    }
    return mintAccount.owner;
  }

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState(50);
  const [pending, setPending] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [buyQuote, setBuyQuote] = useState<{ tokensOut: string; impactPct: number } | null>(null);
  const [walletTokenRaw, setWalletTokenRaw] = useState("0");
  const [walletTokenDecimals, setWalletTokenDecimals] = useState(TOKEN_DECIMALS_FALLBACK);
  const [balanceRefresh, setBalanceRefresh] = useState(0);
  const [lastSignature, setLastSignature] = useState("");

  const mint = useMemo(() => {
    try { return new PublicKey(token.mint); } catch { return null; }
  }, [token.mint]);
  const amt = Number(amount);
  const demoState = { virtualSol: token.virtualSol, virtualToken: token.virtualToken };
  const demoSpot = spotPrice(demoState);
  const demoEffectiveSol = amt > 0 && Number.isFinite(amt) ? amt * 0.99 : 0;
  const demoBuyOut = demoEffectiveSol > 0 ? tokensOut(demoState, demoEffectiveSol) : 0;
  const demoTokenIn = myHolding && myHolding.amount > 0 ? (myHolding.amount * percent) / 100 : 0;
  const demoSellReceive = (demoTokenIn > 0 ? solOut(demoState, demoTokenIn) : 0) * 0.99;
  const walletTokenAmount = Number(walletTokenRaw) / (10 ** walletTokenDecimals);
  const realSellRaw = (BigInt(walletTokenRaw || "0") * BigInt(percent)) / BigInt(100);

  useEffect(() => {
    let active = true;
    async function refreshWalletTokenBalance() {
      if (!connected || !publicKey || !mint) {
        setWalletTokenRaw("0");
        setWalletTokenDecimals(TOKEN_DECIMALS_FALLBACK);
        return;
      }
      try {
        const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { mint });
        let raw = BigInt(0);
        let decimals = TOKEN_DECIMALS_FALLBACK;
        for (const account of accounts.value) {
          const info = account.account.data.parsed.info;
          raw += BigInt(info.tokenAmount.amount as string);
          decimals = Number(info.tokenAmount.decimals);
        }
        if (active) {
          setWalletTokenRaw(raw.toString());
          setWalletTokenDecimals(decimals);
        }
      } catch {
        if (active) setWalletTokenRaw("0");
      }
    }
    void refreshWalletTokenBalance();
    return () => { active = false; };
  }, [connection, connected, publicKey, mint, token.mint, balanceRefresh]);

  useEffect(() => {
    let active = true;
    async function refreshBuyQuote() {
      if (!REAL_PUMP_TRADING_ENABLED || !connected || !publicKey || !mint || side !== "BUY" || !Number.isFinite(amt) || amt < 0.01 || amt > 100) {
        setBuyQuote(null);
        setQuoteError(null);
        setQuoteLoading(false);
        return;
      }
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const curve = await sdk.fetchBondingCurve(mint);
        if (curve.complete) throw new Error("This token has graduated. AMM routing is not enabled in this first trading slice.");
        if (!curve.quoteMint.equals(PublicKey.default)) throw new Error("This first live trading slice supports SOL-quoted Pump bonding curves only.");
        const tokenProgram = await resolveBaseTokenProgram(mint);
        const [buyState, global, feeConfig] = await Promise.all([
          sdk.fetchBuyState(mint, publicKey, tokenProgram),
          sdk.fetchGlobal(),
          sdk.fetchFeeConfig(),
        ]);
        const solAmount = new BN(Math.round(amt * LAMPORTS_PER_SOL));
        const tokensOut = getBuyTokenAmountFromSolAmount({
          global,
          feeConfig,
          mintSupply: buyState.bondingCurve.tokenTotalSupply,
          bondingCurve: buyState.bondingCurve,
          amount: solAmount,
          quoteMint: PublicKey.default,
        });
        if (tokensOut.lte(new BN(0))) throw new Error("Pump SDK returned a zero-token quote.");
        const spot = Number(buyState.bondingCurve.virtualQuoteReserves.toString()) /
          Number(buyState.bondingCurve.virtualTokenReserves.toString());
        // Both prices are lamports per raw token unit, so their ratio is dimensionless.
        const effectivePrice = Number(solAmount.toString()) / Number(tokensOut.toString());
        if (active) {
          setBuyQuote({
            tokensOut: tokensOut.toString(),
            impactPct: Number.isFinite(effectivePrice) && spot > 0 ? Math.max(0, ((effectivePrice / spot) - 1) * 100) : 0,
          });
        }
      } catch (error) {
        if (active) {
          setBuyQuote(null);
          setQuoteError(error instanceof Error ? error.message : "Live quote unavailable for this mint/network.");
        }
      } finally {
        if (active) setQuoteLoading(false);
      }
    }
    void refreshBuyQuote();
    return () => { active = false; };
  }, [amt, connected, mint, publicKey, sdk, side, token.mint]);

  async function sendAndConfirm(instructions: TransactionInstruction[]) {
    if (!publicKey) throw new Error("Connect your Solana wallet first.");
    if (instructions.length === 0) throw new Error("Pump SDK returned no transaction instructions.");
    const latest = await connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction({
      feePayer: publicKey,
      recentBlockhash: latest.blockhash,
    }).add(...instructions);
    const signature = await sendTransaction(transaction, connection, { preflightCommitment: "confirmed" });
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }, "confirmed");
    if (confirmation.value.err) throw new Error("Solana rejected the transaction. Signature: " + signature);
    return signature;
  }

  async function handleLiveTrade() {
    if (!connected || !publicKey || !mint) throw new Error("Connect a Solana wallet and use a valid token mint.");
    const curve = await sdk.fetchBondingCurve(mint);
    if (curve.complete) {
      throw new Error("This token has graduated. Graduated PumpAMM routing is the next integration; this first live path supports bonding-curve tokens only.");
    }
    if (!curve.quoteMint.equals(PublicKey.default)) {
      throw new Error("This first live trading slice supports SOL-quoted Pump bonding curves only.");
    }

    const tokenProgram = await resolveBaseTokenProgram(mint);

    if (side === "BUY") {
      if (!Number.isFinite(amt) || amt < 0.01 || amt > 100) throw new Error("Buy between 0.01 and 100 SOL.");
      const solAmount = new BN(Math.round(amt * LAMPORTS_PER_SOL));
      const [buyState, global, feeConfig] = await Promise.all([
        sdk.fetchBuyState(mint, publicKey, tokenProgram),
        sdk.fetchGlobal(),
        sdk.fetchFeeConfig(),
      ]);
      const tokenAmount = getBuyTokenAmountFromSolAmount({
        global,
        feeConfig,
        mintSupply: buyState.bondingCurve.tokenTotalSupply,
        bondingCurve: buyState.bondingCurve,
        amount: solAmount,
        quoteMint: PublicKey.default,
      });
      if (tokenAmount.lte(new BN(0))) {
        throw new Error("Pump SDK returned no expected token output; no transaction was sent.");
      }
      // Convert the requested SOL budget into the precise curve cost for this token amount.
      // This avoids treating the input budget as the exact execution cost after curve rounding.
      const maxCost = getBuySolAmountFromTokenAmount({
        global,
        feeConfig,
        mintSupply: buyState.bondingCurve.tokenTotalSupply,
        bondingCurve: buyState.bondingCurve,
        amount: tokenAmount,
        quoteMint: PublicKey.default,
      });
      if (maxCost.lte(new BN(0)) || maxCost.gt(solAmount)) {
        throw new Error("Pump SDK returned an invalid buy cost; no transaction was sent.");
      }
      const instructions = await PUMP_SDK.buyInstructions({
        global,
        bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
        bondingCurve: buyState.bondingCurve,
        associatedUserAccountInfo: buyState.associatedUserAccountInfo,
        mint,
        user: publicKey,
        amount: tokenAmount,
        solAmount: maxCost,
        slippage: 5,
        tokenProgram,
      });
      return await sendAndConfirm(instructions);
    }

    if (realSellRaw <= BigInt(0)) throw new Error("No on-chain token balance available to sell.");
    const amountRaw = new BN(realSellRaw.toString());
    const sellState = await sdk.fetchSellState(mint, publicKey, tokenProgram);
    const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig()]);
    const expectedSol = getSellSolAmountFromTokenAmount({
      global,
      feeConfig,
      mintSupply: sellState.bondingCurve.tokenTotalSupply,
      bondingCurve: sellState.bondingCurve,
      amount: amountRaw,
    });
    if (expectedSol.lte(new BN(0))) throw new Error("Pump SDK returned no expected SOL output; no transaction was sent.");
    const instructions = await PUMP_SDK.sellInstructions({
      global,
      bondingCurveAccountInfo: sellState.bondingCurveAccountInfo,
      bondingCurve: sellState.bondingCurve,
      mint,
      user: publicKey,
      amount: amountRaw,
      solAmount: expectedSol,
      slippage: 5,
      tokenProgram,
      mayhemMode: sellState.bondingCurve.isMayhemMode ?? false,
      cashback: sellState.bondingCurve.isCashbackCoin ?? false,
    });
    return await sendAndConfirm(instructions);
  }

  async function handleSubmit() {
    if (!connected || !publicKey) {
      toast({ title: "Connect your Solana wallet", description: "Connect Phantom before trading.", variant: "destructive" });
      return;
    }
    setPending(true);
    try {
      if (REAL_PUMP_TRADING_ENABLED) {
        const signature = await handleLiveTrade();
        setLastSignature(signature);
        toast({
          title: side === "BUY" ? "Buy confirmed on Solana" : "Sell confirmed on Solana",
          description: "Transaction confirmed. " + signature.slice(0, 8) + "…",
        });
        setAmount("");
        setBalanceRefresh((value) => value + 1);
        onTraded();
        return;
      }

      if (side === "BUY" && (!Number.isFinite(amt) || amt < 0.01 || amt > 100)) {
        throw new Error("Buy between 0.01 and 100 SOL.");
      }
      if (side === "SELL" && (!myHolding || myHolding.amount <= 0)) throw new Error("No demo tokens to sell.");
      const body = side === "BUY" ? { side, solAmount: amt } : { side, percent };
      const result = await post<TradeResponse>("/api/tokens/" + token.id + "/trade", body);
      toast({
        title: side === "BUY" ? "Demo buy recorded" : "Demo sell recorded",
        description: "Simulation only — no SOL or tokens moved. Demo amount: " + compact(result.trade.tokenAmount) + " " + token.symbol + ".",
      });
      if (side === "BUY") setAmount("");
      onTraded();
    } catch (error) {
      toast({
        title: side === "BUY" ? "Buy failed" : "Sell failed",
        description: error instanceof Error ? error.message : "The trade was not completed.",
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
          <p className="text-sm text-muted-foreground">Connect Phantom to trade. Live trading is available only when explicitly enabled and the token is on the selected Solana network.</p>
          <WalletMultiButton className="!h-11 !w-full !justify-center !rounded-lg" />
        </div>
      </div>
    );
  }

  const liveBlocked = REAL_PUMP_TRADING_ENABLED && (
    !mint || (side === "BUY" && (quoteLoading || !buyQuote || Boolean(quoteError))) ||
    (side === "SELL" && walletTokenAmount <= 0)
  );

  return (
    <div className="glass rounded-2xl p-4">
      <div className={"mb-3 rounded-lg border p-3 text-xs " + (REAL_PUMP_TRADING_ENABLED ? "border-amber-400/30 bg-amber-400/5 text-amber-100" : "border-white/10 bg-white/[0.03] text-muted-foreground")}>
        {REAL_PUMP_TRADING_ENABLED
          ? "LIVE Pump.fun trading · 5% slippage cap · inspect the wallet transaction before signing. Bonding-curve tokens only in this slice."
          : "DEMO ONLY · simulated buys and sells · no SOL or tokens move."}
        {quoteLoading ? " Fetching live quote…" : quoteError ? " " + quoteError : ""}
      </div>

      <Tabs value={side} onValueChange={(value) => setSide(value === "SELL" ? "SELL" : "BUY")}>
        <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-white/5 p-1">
          <TabsTrigger value="BUY" className="rounded-lg data-[state=active]:bg-violet-600/25 data-[state=active]:text-violet-200">Buy</TabsTrigger>
          <TabsTrigger value="SELL" className="rounded-lg data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300">Sell</TabsTrigger>
        </TabsList>

        <TabsContent value="BUY" className="space-y-4 pt-3">
          <div className="grid grid-cols-4 gap-2">
            {BUY_PRESETS.map((value) => <Button key={value} type="button" variant="outline" onClick={() => setAmount(String(value))}>{value} SOL</Button>)}
          </div>
          <Input type="number" inputMode="decimal" min={0.01} max={100} step={0.01} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount in SOL (0.01–100)" aria-label="Amount in SOL to buy" />
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm">
            <span className="text-xs text-muted-foreground">Estimated tokens out</span>
            <span className="font-semibold">{REAL_PUMP_TRADING_ENABLED ? (buyQuote ? compact(Number(buyQuote.tokensOut) / 10 ** TOKEN_DECIMALS_FALLBACK) + " " + token.symbol : "—") : (demoBuyOut > 0 ? compact(demoBuyOut) + " " + token.symbol : "—")}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Price impact</span>
            <span>{REAL_PUMP_TRADING_ENABLED ? (buyQuote ? "~" + buyQuote.impactPct.toFixed(2) + "%" : "—") : (demoBuyOut > 0 ? "~" + (((demoEffectiveSol / demoBuyOut / demoSpot) - 1) * 100).toFixed(2) + "%" : "—")}</span>
          </div>
        </TabsContent>

        <TabsContent value="SELL" className="space-y-4 pt-3">
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm">
            <span className="text-xs text-muted-foreground">{REAL_PUMP_TRADING_ENABLED ? "On-chain wallet balance" : "Demo holding"}</span>
            <span className="font-medium">{REAL_PUMP_TRADING_ENABLED ? compact(walletTokenAmount) + " " + token.symbol : (myHolding ? compact(myHolding.amount) + " " + token.symbol : "0 " + token.symbol)}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {SELL_PRESETS.map((value) => <Button key={value} type="button" variant="outline" className={percent === value ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : ""} onClick={() => setPercent(value)}>{value}%</Button>)}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm">
            <span className="text-xs text-muted-foreground">Selling</span>
            <span className="font-semibold">{REAL_PUMP_TRADING_ENABLED ? compact(Number(realSellRaw.toString()) / 10 ** walletTokenDecimals) + " " + token.symbol : compact(demoTokenIn) + " " + token.symbol}</span>
          </div>
          {!REAL_PUMP_TRADING_ENABLED && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Estimated SOL out</span><span>{demoSellReceive > 0 ? sol(demoSellReceive) : "—"}</span></div>}
        </TabsContent>
      </Tabs>

      <Button className={"mt-4 h-11 w-full " + (side === "BUY" ? "glow-violet" : "bg-red-500 text-white hover:bg-red-500/90")} onClick={handleSubmit} disabled={pending || (side === "BUY" && (!(amt > 0) || amount === "")) || (REAL_PUMP_TRADING_ENABLED && (liveBlocked || (side === "SELL" && realSellRaw <= BigInt(0))))}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? (REAL_PUMP_TRADING_ENABLED ? "Waiting for Solana confirmation…" : "Recording demo…") : REAL_PUMP_TRADING_ENABLED ? (side === "BUY" ? "Buy on Solana" : "Sell on Solana") : (side === "BUY" ? "Record demo buy" : "Record demo sell")}
      </Button>
      {lastSignature && <a className="mt-2 block break-all text-center text-xs text-violet-300 underline" href={"https://solscan.io/tx/" + encodeURIComponent(lastSignature)} target="_blank" rel="noreferrer">Inspect confirmed transaction on Solscan</a>}
      <p className="mt-2.5 text-center text-[11px] text-muted-foreground">{REAL_PUMP_TRADING_ENABLED ? "Network fees and Pump protocol fees apply. No transaction is sent unless you approve it in your wallet." : "DEMO ONLY · no funds move"}</p>
    </div>
  );
}
