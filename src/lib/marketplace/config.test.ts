import { afterEach, describe, expect, test } from "bun:test";
import { getMarketMode, getMarketplaceReadiness, isSimulationMode } from "./config";

const originalMode = process.env.AHE_MARKET_MODE;
const originalRpc = process.env.SOLANA_RPC_URL;

afterEach(() => {
  if (originalMode === undefined) delete process.env.AHE_MARKET_MODE;
  else process.env.AHE_MARKET_MODE = originalMode;
  if (originalRpc === undefined) delete process.env.SOLANA_RPC_URL;
  else process.env.SOLANA_RPC_URL = originalRpc;
});

describe("AHE Market runtime guard", () => {
  test("defaults to simulation", () => {
    delete process.env.AHE_MARKET_MODE;
    expect(getMarketMode()).toBe("simulation");
    expect(isSimulationMode()).toBe(true);
  });

  test("does not enable real transactions in devnet or mainnet mode", () => {
    for (const mode of ["devnet", "mainnet"]) {
      process.env.AHE_MARKET_MODE = mode;
      const readiness = getMarketplaceReadiness();
      expect(readiness.launchesEnabled).toBe(false);
      expect(readiness.realTransactionsEnabled).toBe(false);
      expect(readiness.productionReady).toBe(false);
      expect(readiness.integrations.pumpFun).toBe("not-implemented");
    }
  });

  test("fails closed for an unknown mode", () => {
    process.env.AHE_MARKET_MODE = "production-ish";
    const readiness = getMarketplaceReadiness();
    expect(readiness.mode).toBe("invalid");
    expect(readiness.launchesEnabled).toBe(false);
    expect(readiness.realTransactionsEnabled).toBe(false);
  });

  test("reports RPC configuration without claiming the Pump.fun adapter exists", () => {
    process.env.AHE_MARKET_MODE = "devnet";
    process.env.SOLANA_RPC_URL = "https://example.invalid";
    const readiness = getMarketplaceReadiness();
    expect(readiness.integrations.solanaRpc).toBe("configured");
    expect(readiness.integrations.pumpFun).toBe("not-implemented");
  });
  test("normalizes mode casing and keeps simulated transactions explicitly simulated", () => {
    process.env.AHE_MARKET_MODE = "SIMULATION";
    const readiness = getMarketplaceReadiness();
    expect(readiness.mode).toBe("simulation");
    expect(readiness.launchesEnabled).toBe(true);
    expect(readiness.realTransactionsEnabled).toBe(false);
    expect(readiness.productionReady).toBe(false);
  });

  test("does not infer RPC connectivity when no RPC URL is configured", () => {
    process.env.AHE_MARKET_MODE = "devnet";
    delete process.env.SOLANA_RPC_URL;
    expect(getMarketplaceReadiness().integrations.solanaRpc).toBe("not-configured");
  });

});
