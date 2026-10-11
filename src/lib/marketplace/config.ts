/**
 * AHE Market deployment mode and integration readiness.
 *
 * Important: selecting "devnet" or "mainnet" does not enable trading. The
 * Pump.fun transaction adapter is deliberately marked unavailable until a
 * real SDK-backed implementation is merged and tested. This prevents the
 * existing simulated mint/signature code from being used as a real launch.
 */

export type MarketMode = "simulation" | "devnet" | "mainnet" | "invalid";

const VALID_MODES: readonly MarketMode[] = ["simulation", "devnet", "mainnet"];

export function getMarketMode(): MarketMode {
  const configured = process.env.AHE_MARKET_MODE;
  if (!configured) return "simulation";
  const value = configured.toLowerCase();
  return VALID_MODES.includes(value as Exclude<MarketMode, "invalid">)
    ? (value as Exclude<MarketMode, "invalid">)
    : "invalid";
}

/** True only for the legacy, explicitly simulated marketplace. */
export function isSimulationMode(): boolean {
  return getMarketMode() === "simulation";
}

/**
 * This stays false until a production-quality Pump.fun/Solana adapter exists.
 * Do not replace with an environment flag: configuration alone must never
 * assert that unimplemented transaction code is ready.
 */
export function isPumpFunAdapterReady(): boolean {
  return false;
}

export function getMarketplaceReadiness() {
  const mode = getMarketMode();
  const adapterReady = isPumpFunAdapterReady();

  return {
    mode,
    launchesEnabled: mode === "simulation" || adapterReady,
    realTransactionsEnabled: mode !== "simulation" && adapterReady,
    productionReady: mode === "mainnet" && adapterReady,
    integrations: {
      wallet: "not-connected" as const,
      solanaRpc: process.env.SOLANA_RPC_URL ? "configured" as const : "not-configured" as const,
      pumpFun: adapterReady ? "connected" as const : "not-implemented" as const,
      creatorFeeSharing: adapterReady ? "available" as const : "not-implemented" as const,
      aheVerification: "not-connected" as const,
    },
  };
}
