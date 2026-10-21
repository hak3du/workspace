"use client";

import { useEffect, useMemo, useState } from "react";
import BN from "bn.js";
import { Loader2, Wallet } from "lucide-react";
import { PublicKey, Transaction, LAMPORTS_PER_SOL, type TransactionInstruction } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { post } from "@/lib/api";
import { solOut, spotPrice, tokensOut } from "@/lib/bonding";
import { compact, sol } from "@/lib/format";
import type { TokenDTO, TradeDTO } from "@/lib/types";
import { OnlinePumpSdk, PUMP_SDK, getBuyTokenAmountFromSolAmount, getBuyV3TokenAmountFromQuoteAmount, getBuySolAmountFromTokenAmount, getSellSolAmountFromTokenAmount } from "@pump-fun/pump-sdk";
import { OnlinePumpAmmSdk, PUMP_AMM_SDK, canonicalPumpPoolPda } from "@pump-fun/pump-swap-sdk";

const BUY_PRESETS = [0.1, 0.5, 1, 5];
const SELL_PRESETS = [25, 50, 75, 100];
// Public environment flags are necessary but not sufficient. The server readiness
// endpoint is authoritative; unavailable or malformed readiness always fails closed.
const TOKEN_DECIMALS_FALLBACK = 6;

type ReownSolanaProvider = {
  sendTransaction?: (
    transaction: Transaction,
    connection: import("@solana/web3.js").Connection,
    options?: { preflightCommitment?: "processed" | "confirmed" | "finalized" }
  ) => Promise<string>;
};
const PUMP_SLIPPAGE_PERCENT = 5;

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
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount({ namespace: "solana" });
  const { walletProvider } = useAppKitProvider<ReownSolanaProvider>("solana");
  const connected = Boolean(isConnected && address);
  const publicKey = useMemo(() => {
    try { return address ? new PublicKey(address) : null; } catch { return null; }
  }, [address]);
  const sendTransaction = walletProvider?.sendTransaction?.bind(walletProvider);
  const sdk = useMemo(() => new OnlinePumpSdk(connection), [connection]);
  const ammSdk = useMemo(() => new OnlinePumpAmmSdk(connection), [connection]);

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
  const [graduated, setGraduated] = useState(false);
  const [walletTokenRaw, setWalletTokenRaw] = useState("0");
  const [walletTokenDecimals, setWalletTokenDecimals] = useState(TOKEN_DECIMALS_FALLBACK);
  const [balanceRefresh, setBalanceRefresh] = useState(0);
  const [lastSignature, setLastSignature] = useState("");
  const [serverTradingReady, setServerTradingReady] = useState(false);
  const realPumpTradingEnabled =
    serverTradingReady &&
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" &&
    process.env.NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING === "true" &&
    process.env.NEXT_PUBLIC_PUMP_TRADING_VERIFIED === "true";

  useEffect(() => {
    let active = true;
    async function refreshTradingReadiness() {
      setServerTradingReady(false);
      try {
        const response = await fetch("/api/marketplace/status", {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const status = response.ok ? await response.json() as { realTransactionsEnabled?: unknown; productionReady?: unknown; environment?: unknown } : null;
        if (active) {
          setServerTradingReady(
            status?.realTransactionsEnabled === true &&
            status?.productionReady === true &&
            status?.environment === "mainnet"
          );
        }
      } catch {
        if (active) setServerTradingReady(false);
      }
    }
    void refreshTradingReadiness();
    return () => { active = false; };
  }, []);

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
        const mintSupply = await connection.getTokenSupply(mint, "confirmed");
        const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { mint });
        let raw = BigInt(0);
        let decimals = mintSupply.value.decimals;
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
      if (!realPumpTradingEnabled || !connected || !publicKey || !mint || side !== "BUY" || !Number.isFinite(amt) || amt < 0.01 || amt > 100) {
        setBuyQuote(null);
        setQuoteError(null);
        setQuoteLoading(false);
        return;
      }
      if (process.env.NEXT_PUBLIC_SOLANA_CLUSTER !== "mainnet-beta") {
        setBuyQuote(null);
        setQuoteError("Real Pump trading is blocked unless NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta.");
        setQuoteLoading(false);
        return;
      }
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const curve = await sdk.fetchBondingCurve(mint);
        if (curve.complete) {
          if (active) {
            setGraduated(true);
            setBuyQuote(null);
            setQuoteError(null);
          }
          return;
        }
        if (active) setGraduated(false);
        if (!curve.quoteMint.equals(PublicKey.default)) throw new Error("This first live trading slice supports SOL-quoted Pump bonding curves only.");
        const tokenProgram = await resolveBaseTokenProgram(mint);
        const [buyState, global, feeConfig] = await Promise.all([
          sdk.fetchBuyState(mint, publicKey, tokenProgram),
          sdk.fetchGlobal(),
          sdk.fetchFeeConfig(),
        ]);
        const quoteSolAmount = new BN(Math.round(amt * LAMPORTS_PER_SOL));
        const tokensOut = buyState.bondingCurve.isCashbackCoin
          ? getBuyTokenAmountFromSolAmount({
              global,
              feeConfig,
              mintSupply: buyState.bondingCurve.tokenTotalSupply,
              bondingCurve: buyState.bondingCurve,
              amount: quoteSolAmount,
              quoteMint: PublicKey.default,
            })
          : getBuyV3TokenAmountFromQuoteAmount({
              global,
              feeConfig,
              mintSupply: buyState.bondingCurve.tokenTotalSupply,
              bondingCurve: buyState.bondingCurve,
              amount: quoteSolAmount,
              curveBaseTokenBalance: buyState.curveBaseTokenBalance,
            });
        if (tokensOut.lte(new BN(0))) throw new Error("Pump SDK returned a zero-token quote.");
        const spot = Number(buyState.bondingCurve.virtualQuoteReserves.toString()) /
          Number(buyState.bondingCurve.virtualTokenReserves.toString());
        // Both prices are lamports per raw token unit, so their ratio is dimensionless.
        const effectivePrice = Number(quoteSolAmount.toString()) / Number(tokensOut.toString());
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
  }, [amt, connected, mint, publicKey, sdk, side, token.mint, realPumpTradingEnabled]);

  async function sendAndConfirm(instructions: TransactionInstruction[]) {
    if (!publicKey) throw new Error("Connect your Solana wallet first.");
    if (!sendTransaction) throw new Error("The connected Reown wallet does not expose transaction signing.");
    if (instructions.length === 0) throw new Error("Pump SDK returned no transaction instructions.");
    const latest = await connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction({
      feePayer: publicKey,
      recentBlockhash: latest.blockhash,
    }).add(...instructions);
    const simulation = await connection.simulateTransaction(transaction);
    if (simulation.value.err) {
      const logs = simulation.value.logs?.slice(-4).join(" | ");
      throw new Error("Pump transaction simulation failed; nothing was sent. " + JSON.stringify(simulation.value.err) + (logs ? " Logs: " + logs : ""));
    }
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
    if (process.env.NEXT_PUBLIC_SOLANA_CLUSTER !== "mainnet-beta") throw new Error("Live Pump trading is blocked unless NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta.");
    if (!connected || !publicKey || !mint) throw new Error("Connect a Solana wallet and use a valid token mint.");
    const curve = await sdk.fetchBondingCurve(mint);
    if (curve.complete) {
      const poolKey = canonicalPumpPoolPda(mint);
      const swapState = await ammSdk.swapSolanaState(poolKey, publicKey);
      if (side === "BUY") {
        if (!Number.isFinite(amt) || amt < 0.01 || amt > 100) throw new Error("Buy between 0.01 and 100 SOL.");
        const quoteAmount = new BN(Math.round(amt * LAMPORTS_PER_SOL));
        const instructions = await PUMP_AMM_SDK.buyQuoteInput(swapState, quoteAmount, PUMP_SLIPPAGE_PERCENT, { v2: true });
        return await sendAndConfirm(instructions);
      }
      if (realSellRaw <= BigInt(0)) throw new Error("No on-chain token balance available to sell.");
      const amountRaw = new BN(realSellRaw.toString());
      const instructions = await PUMP_AMM_SDK.sellBaseInput(swapState, amountRaw, PUMP_SLIPPAGE_PERCENT, { v2: true });
      return await sendAndConfirm(instructions);
    }
    setGraduated(false);
    if (!curve.quoteMint.equals(PublicKey.default)) {
      throw new Error("This first live trading slice supports SOL-quoted Pump bonding curves only.");
    }

    const tokenProgram = await resolveBaseTokenProgram(mint);

    if (side === "BUY") {
      if (!Number.isFinite(amt) || amt < 0.01 || amt > 100) throw new Error("Buy between 0.01 and 100 SOL.");
      const quoteSolAmount = new BN(Math.round(amt * LAMPORTS_PER_SOL));
      const [buyState, global, feeConfig] = await Promise.all([
        sdk.fetchBuyState(mint, publicKey, tokenProgram),
        sdk.fetchGlobal(),
        sdk.fetchFeeConfig(),
      ]);
      const tokenAmount = buyState.bondingCurve.isCashbackCoin
        ? getBuyTokenAmountFromSolAmount({
            global,
            feeConfig,
            mintSupply: buyState.bondingCurve.tokenTotalSupply,
            bondingCurve: buyState.bondingCurve,
            amount: quoteSolAmount,
            quoteMint: PublicKey.default,
          })
        : getBuyV3TokenAmountFromQuoteAmount({
            global,
            feeConfig,
            mintSupply: buyState.bondingCurve.tokenTotalSupply,
            bondingCurve: buyState.bondingCurve,
            amount: quoteSolAmount,
            curveBaseTokenBalance: buyState.curveBaseTokenBalance,
          });
      if (tokenAmount.lte(new BN(0))) {
        throw new Error("Pump SDK returned no expected token output; no transaction was sent.");
      }
      const instructions = buyState.bondingCurve.isCashbackCoin
        ? await PUMP_SDK.buyInstructions({
            global,
            bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
            bondingCurve: buyState.bondingCurve,
            associatedUserAccountInfo: buyState.associatedUserAccountInfo,
            mint,
            user: publicKey,
            amount: tokenAmount,
            solAmount: getBuySolAmountFromTokenAmount({
              global,
              feeConfig,
              mintSupply: buyState.bondingCurve.tokenTotalSupply,
              bondingCurve: buyState.bondingCurve,
              amount: tokenAmount,
              quoteMint: PublicKey.default,
            }),
            slippage: PUMP_SLIPPAGE_PERCENT,
            tokenProgram,
          })
        : await PUMP_SDK.buyExactQuoteInV3Instructions({
            bondingCurve: buyState.bondingCurve,
            associatedUserAccountInfo: buyState.associatedUserAccountInfo,
            mint,
            user: publicKey,
            quoteAmount: quoteSolAmount,
            amount: tokenAmount,
            slippage: PUMP_SLIPPAGE_PERCENT,
            quoteTokenProgram: buyState.quoteTokenProgram,
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
    const instructions = sellState.bondingCurve.isCashbackCoin
      ? await PUMP_SDK.sellInstructions({
          global,
          bondingCurveAccountInfo: sellState.bondingCurveAccountInfo,
          bondingCurve: sellState.bondingCurve,
          mint,
          user: publicKey,
          amount: amountRaw,
          solAmount: expectedSol,
          slippage: PUMP_SLIPPAGE_PERCENT,
          tokenProgram,
          mayhemMode: sellState.bondingCurve.isMayhemMode ?? false,
          cashback: true,
        })
      : await PUMP_SDK.sellV3Instructions({
          bondingCurve: sellState.bondingCurve,
          mint,
          user: publicKey,
          amount: amountRaw,
          quoteAmount: expectedSol,
          slippage: PUMP_SLIPPAGE_PERCENT,
          quoteTokenProgram: sellState.quoteTokenProgram,
          tokenProgram,
        });
    return await sendAndConfirm(instructions);
  }

  async function handleSubmit() {
    if (!connected || !publicKey) {
      toast({ title: "Connect your Solana wallet", description: "Connect a wallet through Reown AppKit before trading.", variant: "destructive" });
      return;
    }
    setPending(true);
    try {
      if (!realPumpTradingEnabled) {
        throw new Error("Live trading is disabled until the mainnet transaction flow has passed validation. No transaction was sent.");
      }
      const signature = await handleLiveTrade();
      setLastSignature(signature);
      toast({
        title: side === "BUY" ? "Buy confirmed on Solana" : "Sell confirmed on Solana",
        description: "Transaction confirmed. " + signature.slice(0, 8) + "…",
      });
      setAmount("");
      setBalanceRefresh((value) => value + 1);
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
          <p className="text-sm text-muted-foreground">Connect a Solana wallet through Reown AppKit to trade. Live trading remains disabled until mainnet transaction validation is explicitly approved.</p>
          <Button type="button" className="h-11 w-full" onClick={() => void open({ view: "Connect" })}>Connect wallet</Button>
        </div>
      </div>
    );
  }

  const liveBlocked = !realPumpTradingEnabled || !mint ||
    (side === "BUY" && (quoteLoading || (!graduated && (!buyQuote || Boolean(quoteError))))) ||
    (side === "SELL" && walletTokenAmount <= 0);

  return (
    <div className="glass rounded-2xl p-4">
      <div className={"mb-3 rounded-lg border p-3 text-xs " + (realPumpTradingEnabled ? "border-amber-400/30 bg-amber-400/5 text-amber-100" : "border-white/10 bg-white/[0.03] text-muted-foreground")}>
        {realPumpTradingEnabled
          ? (graduated
              ? "LIVE PumpSwap trading · graduated token · 5% slippage tolerance. Quote preview is unavailable here; inspect the wallet transaction before signing."
              : "LIVE Pump.fun trading · 5% slippage tolerance. SOL budget is the maximum input. Inspect the wallet transaction before signing.")
          : "TRADING DISABLED · preview estimates only. No trade is submitted until live transaction validation is explicitly approved."}
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
            <span className="text-xs text-muted-foreground">{realPumpTradingEnabled ? "Estimated tokens out" : "Preview estimate · not executable"}</span>
            <span className="font-semibold">{realPumpTradingEnabled ? (buyQuote ? compact(Number(buyQuote.tokensOut) / 10 ** walletTokenDecimals) + " " + token.symbol : "—") : (demoBuyOut > 0 ? compact(demoBuyOut) + " " + token.symbol : "—")}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{realPumpTradingEnabled ? "Effective price impact (fees included)" : "Indicative price impact · preview only"}</span>
            <span>{realPumpTradingEnabled ? (buyQuote ? "~" + buyQuote.impactPct.toFixed(2) + "%" : "—") : (demoBuyOut > 0 ? "~" + (((demoEffectiveSol / demoBuyOut / demoSpot) - 1) * 100).toFixed(2) + "%" : "—")}</span>
          </div>
        </TabsContent>

        <TabsContent value="SELL" className="space-y-4 pt-3">
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm">
            <span className="text-xs text-muted-foreground">{realPumpTradingEnabled ? "On-chain wallet balance" : "Preview holding · not on-chain"}</span>
            <span className="font-medium">{realPumpTradingEnabled ? compact(walletTokenAmount) + " " + token.symbol : (myHolding ? compact(myHolding.amount) + " " + token.symbol : "0 " + token.symbol)}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {SELL_PRESETS.map((value) => <Button key={value} type="button" variant="outline" className={percent === value ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : ""} onClick={() => setPercent(value)}>{value}%</Button>)}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm">
            <span className="text-xs text-muted-foreground">Selling</span>
            <span className="font-semibold">{realPumpTradingEnabled ? compact(Number(realSellRaw.toString()) / 10 ** walletTokenDecimals) + " " + token.symbol : compact(demoTokenIn) + " " + token.symbol}</span>
          </div>
          {!realPumpTradingEnabled && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Indicative SOL out · preview only</span><span>{demoSellReceive > 0 ? sol(demoSellReceive) : "—"}</span></div>}
        </TabsContent>
      </Tabs>

      <Button className={"mt-4 h-11 w-full " + (side === "BUY" ? "glow-violet" : "bg-red-500 text-white hover:bg-red-500/90")} onClick={handleSubmit} disabled={pending || liveBlocked || (side === "BUY" && (!(amt > 0) || amount === "")) || (realPumpTradingEnabled && side === "SELL" && realSellRaw <= BigInt(0))}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "Waiting for Solana confirmation…" : !realPumpTradingEnabled ? "Live trading disabled" : (side === "BUY" ? "Buy on Solana" : "Sell on Solana")}
      </Button>
      {lastSignature && <a className="mt-2 block break-all text-center text-xs text-violet-300 underline" href={"https://solscan.io/tx/" + encodeURIComponent(lastSignature)} target="_blank" rel="noreferrer">Inspect confirmed transaction on Solscan</a>}
      <p className="mt-2.5 text-center text-[11px] text-muted-foreground">{realPumpTradingEnabled ? "Network fees and Pump protocol fees apply. No transaction is sent unless you approve it in your wallet." : "Preview only · no transaction is submitted and no simulated trade is recorded."}</p>
    </div>
  );
}
