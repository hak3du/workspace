/**
 * AHE Market deployment mode and integration readiness.
 *
 * Production is the default product target. Simulation is opt-in and must be
 * explicitly selected for a customer demo; it is never an implicit fallback.
 * Selecting "devnet" or "mainnet" does not enable real trading. The Pump.fun
 * transaction adapter stays unavailable until a real SDK-backed implementation
 * is merged and tested, so synthetic signatures cannot masquerade as live trades.
 */

export type MarketMode = "simulation" | "devnet" | "mainnet" | "invalid";

const VALID_MODES: readonly MarketMode[] = ["simulation", "devnet", "mainnet"];

export function getMarketMode(): MarketMode {
  const configured = process.env.AHE_MARKET_MODE;
  // Fail closed toward the intended production target; never silently start a
  // live product in demo mode just because an environment variable is missing.
  if (!configured) return "mainnet";
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
