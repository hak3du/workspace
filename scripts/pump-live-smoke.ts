import BN from "bn.js";
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  OnlinePumpSdk,
  PUMP_SDK,
  getBuyTokenAmountFromSolAmount,
  getBuyV3TokenAmountFromQuoteAmount,
  getBuySolAmountFromTokenAmount,
} from "@pump-fun/pump-sdk";
import {
  OnlinePumpAmmSdk,
  PUMP_AMM_SDK,
  canonicalPumpPoolPda,
} from "@pump-fun/pump-swap-sdk";

const rpcUrl = process.env.SOLANA_RPC_URL;
const mintArg = process.argv[2];
const walletArg = process.argv[3];

if (!rpcUrl || !mintArg || !walletArg) {
  console.error("Usage: SOLANA_RPC_URL=<mainnet RPC> bun run scripts/pump-live-smoke.ts <mint> <wallet-public-key>");
  process.exit(2);
}

const connection = new Connection(rpcUrl, "confirmed");
const mint = new PublicKey(mintArg);
const user = new PublicKey(walletArg);
const budget = new BN(Math.round(0.01 * LAMPORTS_PER_SOL));
const slippage = 5;

async function main() {
  const mintInfo = await connection.getAccountInfo(mint, "confirmed");
  if (!mintInfo) throw new Error("Mint account does not exist on the configured RPC.");
  const owner = mintInfo.owner.toBase58();
  if (owner !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
      owner !== "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") {
    throw new Error("Mint owner is not SPL Token or Token-2022.");
  }

  const pump = new OnlinePumpSdk(connection);
  const curve = await pump.fetchBondingCurve(mint);
  let instructions;

  if (curve.complete) {
    const amm = new OnlinePumpAmmSdk(connection);
    const pool = canonicalPumpPoolPda(mint);
    const state = await amm.swapSolanaState(pool, user);
    instructions = await PUMP_AMM_SDK.buyQuoteInput(state, budget, slippage, { v2: true });
    console.log("Route: graduated PumpSwap pool", pool.toBase58());
  } else {
    if (!curve.quoteMint.equals(PublicKey.default)) {
      throw new Error("Smoke test currently supports SOL-quoted bonding curves and SOL-quoted graduated pools only.");
    }
    const tokenProgram = mintInfo.owner;
    const [state, global, feeConfig] = await Promise.all([
      pump.fetchBuyState(mint, user, tokenProgram),
      pump.fetchGlobal(),
      pump.fetchFeeConfig(),
    ]);
    const tokensOut = state.bondingCurve.isCashbackCoin
      ? getBuyTokenAmountFromSolAmount({
          global,
          feeConfig,
          mintSupply: state.bondingCurve.tokenTotalSupply,
          bondingCurve: state.bondingCurve,
          amount: budget,
          quoteMint: PublicKey.default,
        })
      : getBuyV3TokenAmountFromQuoteAmount({
          global,
          feeConfig,
          mintSupply: state.bondingCurve.tokenTotalSupply,
          bondingCurve: state.bondingCurve,
          amount: budget,
          curveBaseTokenBalance: state.curveBaseTokenBalance,
        });
    if (tokensOut.lte(new BN(0))) throw new Error("SDK returned a zero-token quote.");

    instructions = state.bondingCurve.isCashbackCoin
      ? await PUMP_SDK.buyInstructions({
          global,
          bondingCurveAccountInfo: state.bondingCurveAccountInfo,
          bondingCurve: state.bondingCurve,
          associatedUserAccountInfo: state.associatedUserAccountInfo,
          mint,
          user,
          amount: tokensOut,
          solAmount: getBuySolAmountFromTokenAmount({
            global,
            feeConfig,
            mintSupply: state.bondingCurve.tokenTotalSupply,
            bondingCurve: state.bondingCurve,
            amount: tokensOut,
            quoteMint: PublicKey.default,
          }),
          slippage,
          tokenProgram,
        })
      : await PUMP_SDK.buyExactQuoteInV3Instructions({
          bondingCurve: state.bondingCurve,
          associatedUserAccountInfo: state.associatedUserAccountInfo,
          mint,
          user,
          quoteAmount: budget,
          amount: tokensOut,
          slippage,
          quoteTokenProgram: state.quoteTokenProgram,
          tokenProgram,
        });
    console.log("Route: Pump bonding curve", "cashback legacy path:", Boolean(state.bondingCurve.isCashbackCoin));
    console.log("Quoted token output (raw units):", tokensOut.toString());
  }

  const latest = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: user,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  const simulation = await connection.simulateTransaction(transaction, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
  });
  if (simulation.value.err) {
    console.error("SIMULATION FAILED:", JSON.stringify(simulation.value.err));
    console.error((simulation.value.logs || []).slice(-12).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("SIMULATION PASSED — transaction was NOT signed or broadcast.");
  console.log("Compute units:", simulation.value.unitsConsumed ?? "not reported");
  console.log("Logs:", (simulation.value.logs || []).slice(-8).join("\n"));
}

main().catch((error) => {
  console.error("SMOKE TEST FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
