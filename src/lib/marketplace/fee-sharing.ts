/**
 * Validation primitives for Pump.fun creator-fee sharing.
 *
 * Pump.fun's on-chain update_fee_shares_v2 instruction finalizes the
 * shareholder list. Validate and display the exact split before any future
 * transaction is built; never silently choose a platform percentage.
 */

export const FEE_SHARING_TOTAL_BPS = 10_000;
export const MAX_FEE_SHAREHOLDERS = 10;
export const MIN_FEE_SHAREHOLDERS = 1;

export interface FeeShareInput {
  address: string;
  shareBps: number;
  label?: string;
}

export interface FeeShareValidation {
  valid: boolean;
  errors: string[];
  totalBps: number;
  shares: Array<FeeShareInput & { percentage: number }>;
}

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function validateFeeShares(input: unknown): FeeShareValidation {
  const errors: string[] = [];
  if (!Array.isArray(input)) {
    return { valid: false, errors: ["shares must be an array"], totalBps: 0, shares: [] };
  }

  if (input.length < MIN_FEE_SHAREHOLDERS || input.length > MAX_FEE_SHAREHOLDERS) {
    errors.push(`shares must contain between ${MIN_FEE_SHAREHOLDERS} and ${MAX_FEE_SHAREHOLDERS} recipients`);
  }

  const seen = new Set<string>();
  let totalBps = 0;
  const shares: Array<FeeShareInput & { percentage: number }> = [];

  input.forEach((item: unknown, index: number) => {
    if (!item || typeof item !== "object") {
      errors.push(`shares[${index}] must be an object`);
      return;
    }

    const candidate = item as Record<string, unknown>;
    const address = typeof candidate.address === "string" ? candidate.address.trim() : "";
    const shareBps = candidate.shareBps;
    const label = typeof candidate.label === "string" ? candidate.label.trim().slice(0, 80) : undefined;

    if (!BASE58_ADDRESS.test(address)) {
      errors.push(`shares[${index}].address must look like a Solana base58 public key`);
    }
    if (seen.has(address)) errors.push(`shares[${index}].address is duplicated`);
    if (address) seen.add(address);

    if (!Number.isInteger(shareBps) || (shareBps as number) <= 0 || (shareBps as number) > FEE_SHARING_TOTAL_BPS) {
      errors.push(`shares[${index}].shareBps must be an integer from 1 to 10000`);
    } else {
      totalBps += shareBps as number;
      shares.push({ address, shareBps: shareBps as number, percentage: (shareBps as number) / 100, ...(label ? { label } : {}) });
    }
  });

  if (totalBps !== FEE_SHARING_TOTAL_BPS) {
    errors.push(`recipient shares must total 10000 basis points; received ${totalBps}`);
  }

  return { valid: errors.length === 0, errors, totalBps, shares };
}
