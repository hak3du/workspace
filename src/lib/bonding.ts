// Bonding curve math — constant-product virtual reserves (pump.fun style).
// Shared by API routes and client preview. Single source of truth.

export const VIRTUAL_SOL_INIT = 30; // virtual SOL reserves at launch
export const VIRTUAL_TOKEN_INIT = 1_000_000_000; // 1B virtual token reserves
export const MIGRATION_SOL = 85; // virtual SOL reserves at migration (graduation)
export const TOTAL_SUPPLY = 1_000_000_000;
export const LAUNCH_FEE_SOL = 0.02;
export const TRADE_FEE_BPS = 100; // 1% disclosed platform fee on the simulated route

export const K = VIRTUAL_SOL_INIT * VIRTUAL_TOKEN_INIT;

export interface CurveState {
  virtualSol: number;
  virtualToken: number;
}

/** Amount of tokens out for a given SOL input (BUY). */
export function tokensOut(state: CurveState, solIn: number): number {
  if (solIn <= 0) return 0;
  const newSol = state.virtualSol + solIn;
  const newToken = K / newSol;
  return state.virtualToken - newToken;
}

/** Amount of SOL out for a given token input (SELL). */
export function solOut(state: CurveState, tokenIn: number): number {
  if (tokenIn <= 0) return 0;
  const newToken = state.virtualToken + tokenIn;
  const newSol = K / newToken;
  return state.virtualSol - newSol;
}

/** Current spot price in SOL per token. */
export function spotPrice(state: CurveState): number {
  return state.virtualSol / state.virtualToken;
}

/** Bonding-curve progress toward migration, 0..100. */
export function curveProgress(state: CurveState): number {
  const p = ((state.virtualSol - VIRTUAL_SOL_INIT) / (MIGRATION_SOL - VIRTUAL_SOL_INIT)) * 100;
  return Math.max(0, Math.min(100, p));
}

/** Simulated (deterministic-ish) Solana-style base58 signature. */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function fakeTxSig(): string {
  let s = "";
  for (let i = 0; i < 64; i++) s += B58[Math.floor(Math.random() * B58.length)];
  return s;
}

export function fakeMint(): string {
  let s = "";
  for (let i = 0; i < 44; i++) s += B58[Math.floor(Math.random() * B58.length)];
  return s;
}

/** Simulated market maker: returns a small random trade to keep the board alive. */
export function botTrade(state: CurveState): { side: "BUY" | "SELL"; solAmount: number; tokenAmount: number } | null {
  const roll = Math.random();
  const label = ["0xGhost", "sniperbot7", "degen.eth", "moonrider", "quantumquant", "ape_vault", "solfrog"][Math.floor(Math.random() * 7)];
  if (roll < 0.62 || state.virtualSol <= VIRTUAL_SOL_INIT + 0.5) {
    const solIn = [0.05, 0.1, 0.2, 0.5, 1, 2][Math.floor(Math.random() * 6)];
    const out = tokensOut(state, solIn);
    if (out <= 0) return null;
    return { side: "BUY", solAmount: solIn, tokenAmount: out };
  }
  // SELL a small slice of circulating tokens
  const circulating = VIRTUAL_TOKEN_INIT - state.virtualToken;
  const tokenIn = circulating * (0.02 + Math.random() * 0.05);
  const got = solOut(state, tokenIn);
  if (got <= 0.01) return null;
  return { side: "SELL", solAmount: got, tokenAmount: tokenIn };
}

export const BOT_LABELS = ["0xGhost", "sniperbot7", "degen.eth", "moonrider", "quantumquant", "ape_vault", "solfrog", "nightly_ape", "curve walker"];
