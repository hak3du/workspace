"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { ArrowDownUp, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const ENABLED = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" && process.env.NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING !== "false";
const SLIPPAGE_BPS = 100;

type Order = {
  transaction: string;
  requestId: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold?: string;
  priceImpact?: string | number;
  priceImpactPct?: string | number;
  signatureFee?: string | number;
  prioritizationFeeLamports?: string | number;
  routePlan?: unknown[];
  createdAt?: string;
  error?: string;
};

function formatRaw(raw: string | number | undefined, decimals: number, max = 6) {
  if (raw === undefined || raw === null || !Number.isFinite(Number(raw))) return "—";
  const value = Number(raw) / 10 ** decimals;
  return value.toLocaleString("en-US", { maximumFractionDigits: max });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function LiveSwapPanel({ mint, symbol, network }: { mint: string; symbol: string; network: string }) {
  const { connection } = useConnection();
  const { connected, publicKey, signTransaction } = useWallet();
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("0.05");
  const [percent, setPercent] = useState(100);
  const [decimals, setDecimals] = useState<number | null>(null);
  const [tokenBalanceRaw, setTokenBalanceRaw] = useState("0");
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [quoteRefreshNonce, setQuoteRefreshNonce] = useState(0);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastSignature, setLastSignature] = useState("");

  const parsedMint = useMemo(() => {
    try { return new PublicKey(mint); } catch { return null; }
  }, [mint]);
  const sellRaw = useMemo(() => {
    try { return ((BigInt(tokenBalanceRaw) * BigInt(percent)) / 100n).toString(); } catch { return "0"; }
  }, [tokenBalanceRaw, percent]);
  const rawAmount = useMemo(() => {
    if (side === "SELL") return sellRaw;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > 100) return "";
    try { return BigInt(Math.round(value * 1_000_000_000)).toString(); } catch { return ""; }
  }, [side, amount, sellRaw]);

  useEffect(() => {
    let active = true;
    async function refreshBalances() {
      if (!connected || !publicKey || !parsedMint) {
        setTokenBalanceRaw("0");
        setDecimals(null);
        setSolBalance(null);
        return;
      }
      try {
        const [tokenAccount, tokenAccounts, lamports] = await Promise.all([
          connection.getParsedAccountInfo(parsedMint, "confirmed"),
          connection.getParsedTokenAccountsByOwner(publicKey, { mint: parsedMint }, "confirmed"),
          connection.getBalance(publicKey, "confirmed"),
        ]);
        const data = tokenAccount.value?.data;
        const parsed = data && !Array.isArray(data) && "parsed" in data ? data.parsed : null;
        const mintDecimals = parsed && typeof parsed === "object"
          ? Number((parsed as { info?: { decimals?: unknown } }).info?.decimals)
          : NaN;
        let raw = 0n;
        let accountDecimals = Number.isInteger(mintDecimals) ? mintDecimals : null;
        for (const item of tokenAccounts.value) {
          const info = item.account.data.parsed.info;
          raw += BigInt(info.tokenAmount.amount as string);
          accountDecimals = Number(info.tokenAmount.decimals);
        }
        if (active) {
          setTokenBalanceRaw(raw.toString());
          setDecimals(accountDecimals);
          setSolBalance(lamports / 1_000_000_000);
        }
      } catch {
        if (active) {
          setTokenBalanceRaw("0");
          setDecimals(null);
          setSolBalance(null);
        }
      }
    }
    void refreshBalances();
    return () => { active = false; };
  }, [connection, connected, publicKey, parsedMint]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setOrder(null);
      setError("");
      setQuoteLoading(false);
      if (!ENABLED || !connected || !publicKey || !parsedMint || decimals === null || !rawAmount || rawAmount === "0") return;
      if (network !== "mainnet-beta") {
        setError("Real swaps require NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta in this deployment.");
        return;
      }
      if (side === "BUY" && Number(amount) < 0.01) return;
      setQuoteLoading(true);
      const inputMint = side === "BUY" ? WSOL_MINT : mint;
      const outputMint = side === "BUY" ? mint : WSOL_MINT;
      try {
        const url = new URL("/api/market/swap/order", window.location.origin);
        url.searchParams.set("inputMint", inputMint);
        url.searchParams.set("outputMint", outputMint);
        url.searchParams.set("amount", rawAmount);
        url.searchParams.set("taker", publicKey.toBase58());
        url.searchParams.set("slippageBps", String(SLIPPAGE_BPS));
        const response = await fetch(url.toString(), { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as Order;
        if (!response.ok) throw new Error(payload.error || "A live Jupiter quote is unavailable.");
        if (active) setOrder(payload);
      } catch (e) {
        if (active && !(e instanceof DOMException && e.name === "AbortError")) {
          setError(e instanceof Error ? e.message : "Could not retrieve a live quote.");
        }
      } finally {
        if (active) setQuoteLoading(false);
      }
    }, 700);
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [amount, connected, decimals, mint, network, parsedMint, publicKey, rawAmount, side, quoteRefreshNonce]);

  useEffect(() => {
    if (!order || !connected || pending) return;
    const timer = setTimeout(() => setQuoteRefreshNonce((value) => value + 1), 12_000);
    return () => clearTimeout(timer);
  }, [order, connected, pending]);

  async function execute() {
    if (!ENABLED) throw new Error("Real swaps are disabled. Enable NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING in the Production environment.");
    if (!connected || !publicKey || !signTransaction) throw new Error("Connect a wallet that supports transaction signing.");
    if (!parsedMint || !order?.transaction || !order.requestId) throw new Error("No valid live order is available. Wait for a fresh quote.");
    if (network !== "mainnet-beta") throw new Error("Real swaps are blocked unless the app is configured for mainnet-beta.");
    if (order.createdAt && Date.now() - new Date(order.createdAt).getTime() > 20_000) {
      throw new Error("This order is stale. Wait for a fresh quote before signing.");
    }
    if (side === "BUY" && solBalance !== null && Number(amount) + 0.01 > solBalance) {
      throw new Error("Insufficient SOL for the order and estimated network fees.");
    }

    setPending(true);
    setError("");
    setNotice("Preparing wallet transaction…");
    setLastSignature("");
    try {
      const transaction = VersionedTransaction.deserialize(base64ToBytes(order.transaction));
      const simulation = await connection.simulateTransaction(transaction, { sigVerify: false, commitment: "confirmed" });
      if (simulation.value.err) {
        const logs = simulation.value.logs?.slice(-4).join(" | ");
        throw new Error("Swap simulation failed; nothing was signed. " + JSON.stringify(simulation.value.err) + (logs ? " Logs: " + logs : ""));
      }
      const messageKeys = "staticAccountKeys" in transaction.message
        ? transaction.message.staticAccountKeys
        : transaction.message.accountKeys;
      const signerCount = transaction.message.header.numRequiredSignatures;
      const signerKeys = messageKeys.slice(0, signerCount);
      if (!messageKeys[0]?.equals(publicKey) || !signerKeys.some((key) => key.equals(publicKey))) {
        throw new Error("The routed transaction does not identify your connected wallet as its fee payer and signer. Nothing was signed.");
      }
      const signed = await signTransaction(transaction);
      const signedTransaction = bytesToBase64(signed.serialize());
      setNotice("Submitting signed swap to Jupiter for execution and confirmation…");
      const response = await fetch("/api/market/swap/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedTransaction, requestId: order.requestId }),
      });
      const result = await response.json() as { status?: string; signature?: string; error?: string; errorCode?: string; executionUnknown?: boolean };
      if (!response.ok) {
        if (result.signature) setLastSignature(result.signature);
        if (result.executionUnknown) {
          throw new Error("Jupiter execution timed out and the outcome is unknown. Check your wallet activity and transaction history before attempting another swap.");
        }
        throw new Error(result.error || "Swap execution failed. Check the signature before retrying.");
      }
      if (result.signature) setLastSignature(result.signature);
      if (result.status !== "Success" || !result.signature) {
        throw new Error(result.error || "Jupiter did not report a confirmed successful swap. Check transaction status before retrying.");
      }
      setNotice("Swap confirmed. Signature: " + result.signature);
      setOrder(null);
      setAmount("0.05");
      const [tokenAccounts, lamports] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(publicKey, { mint: parsedMint }, "confirmed"),
        connection.getBalance(publicKey, "confirmed"),
      ]);
      let raw = 0n;
      for (const item of tokenAccounts.value) raw += BigInt(item.account.data.parsed.info.tokenAmount.amount as string);
      setTokenBalanceRaw(raw.toString());
      setSolBalance(lamports / 1_000_000_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Swap failed.");
      setNotice("");
    } finally {
      setPending(false);
    }
  }

  if (!ENABLED) {
    return <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-100">
      Real swaps are disabled for this deployment. Configure <code>NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta</code> and ensure <code>NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING</code> is not set to <code>false</code>.
    </div>;
  }
  if (!connected) {
    return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-center">
      <Wallet className="mx-auto mb-3 size-6 text-violet-300" />
      <p className="mb-3 text-sm text-muted-foreground">Connect your Solana wallet to request a live swap quote.</p>
      <WalletMultiButton className="!h-11 !w-full !justify-center !rounded-lg" />
    </div>;
  }

  const outputDecimals = side === "BUY" ? (decimals ?? 0) : 9;
  const outputEstimate = order ? formatRaw(order.outAmount, outputDecimals, outputDecimals > 6 ? 9 : 6) : "—";
  const impact = Number(order?.priceImpact ?? order?.priceImpactPct);
  const impactText = Number.isFinite(impact) ? (impact * 100).toFixed(2) + "%" : "—";

  return (
    <section className="rounded-xl border border-violet-400/20 bg-violet-400/[0.035] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div><h3 className="font-semibold">Live swap</h3><p className="text-xs text-muted-foreground">Jupiter route · wallet-signed · 1.00% slippage limit</p></div>
        <span className="rounded-full border border-emerald-400/30 px-2 py-1 text-[10px] text-emerald-200">MAINNET ONLY</span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button type="button" variant={side === "BUY" ? "default" : "outline"} onClick={() => { setSide("BUY"); setError(""); setNotice(""); }}>Buy</Button>
        <Button type="button" variant={side === "SELL" ? "default" : "outline"} onClick={() => { setSide("SELL"); setError(""); setNotice(""); }}>Sell</Button>
      </div>
      {side === "BUY" ? (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="live-buy-sol">Spend (SOL)</label>
          <Input id="live-buy-sol" type="number" min="0.01" max="100" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          <div className="flex justify-between text-xs text-muted-foreground"><span>Wallet balance</span><span>{solBalance === null ? "—" : solBalance.toFixed(4) + " SOL"}</span></div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Wallet token balance</span><span>{decimals === null ? "—" : formatRaw(tokenBalanceRaw, decimals) + " " + symbol}</span></div>
          <div className="grid grid-cols-4 gap-2">
            {[25, 50, 75, 100].map(v => <Button key={v} type="button" size="sm" variant={percent === v ? "default" : "outline"} onClick={() => setPercent(v)}>{v}%</Button>)}
          </div>
          <p className="text-xs text-muted-foreground">Selling {decimals === null ? "—" : formatRaw(sellRaw, decimals) + " " + symbol}</p>
        </div>
      )}
      <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3">
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">Estimated receive</span><span className="font-semibold tabular-nums">{outputEstimate} {side === "BUY" ? symbol : "SOL"}</span></div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Minimum receive</span><span className="font-medium">{order ? formatRaw(order.otherAmountThreshold, outputDecimals, outputDecimals > 6 ? 9 : 6) + " " + (side === "BUY" ? symbol : "SOL") : "—"}</span></div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Price impact</span><span>{impactText}</span></div>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><ArrowDownUp className="size-3" /> Route and final minimum output are set by the live quote.</div>
      </div>
      {quoteLoading && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Refreshing live order…</p>}
      {error && <p role="alert" className="mt-3 break-words text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-3 break-words text-sm text-emerald-200">{notice}</p>}
      {lastSignature && <a className="mt-2 inline-block break-all text-xs text-violet-300 underline" href={"https://solscan.io/tx/" + encodeURIComponent(lastSignature)} target="_blank" rel="noreferrer">Inspect transaction on Solscan</a>}
      <Button className="mt-4 w-full" onClick={() => void execute().catch(e => setError(e instanceof Error ? e.message : "Swap failed."))} disabled={pending || quoteLoading || !order || !rawAmount || rawAmount === "0" || (side === "SELL" && sellRaw === "0")}>
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {pending ? "Waiting for swap confirmation…" : side === "BUY" ? "Review & buy with wallet" : "Review & sell with wallet"}
      </Button>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">Only sign the transaction if the wallet details match your intended swap. Never retry an uncertain submission until checking the signature.</p>
    </section>
  );
}
