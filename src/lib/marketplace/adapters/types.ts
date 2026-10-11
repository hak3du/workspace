/**
 * Contracts for real marketplace integrations.
 *
 * These are interfaces only. They intentionally do not submit transactions,
 * sign with private keys, or mark the marketplace production-ready. Implementors
 * must be backed by supported SDKs and covered by integration tests before the
 * readiness gate in config.ts can change.
 */

export type SolanaCluster = "devnet" | "mainnet-beta";
export type TransactionLifecycle =
  | "prepared"
  | "submitted"
  | "confirmed"
  | "finalized"
  | "failed"
  | "unknown";

export interface WalletIdentity {
  /** Public address only. Never put secret keys or seed phrases in this type. */
  address: string;
  chain: "solana";
}

export interface SignedTransaction {
  /** Serialized signed transaction bytes, encoded as base64 for transport. */
  serializedBase64: string;
  /** Expected signer public keys, used for validation before submission. */
  signerAddresses: string[];
}

export interface TransactionReceipt {
  signature: string;
  cluster: SolanaCluster;
  lifecycle: TransactionLifecycle;
  slot?: number;
  blockTime?: number;
  errorCode?: string;
}

export interface TransactionRequest {
  /** Unique application operation ID used for idempotency and reconciliation. */
  operationId: string;
  /** Unsigned transaction prepared by a trusted program/SDK adapter. */
  serializedBase64: string;
  /** Public keys that must sign this operation. */
  requiredSignerAddresses: string[];
}

export interface WalletSigningAdapter {
  getConnectedWallet(): Promise<WalletIdentity | null>;
  signTransaction(request: TransactionRequest): Promise<SignedTransaction>;
}

export interface SolanaTransactionAdapter {
  readonly cluster: SolanaCluster;
  prepareTransaction(input: {
    operationId: string;
    instructions: unknown[];
    feePayer: string;
  }): Promise<TransactionRequest>;
  submitSignedTransaction(transaction: SignedTransaction): Promise<TransactionReceipt>;
  getTransactionStatus(signature: string): Promise<TransactionReceipt>;
}

export interface LaunchRequest {
  operationId: string;
  creatorAddress: string;
  name: string;
  symbol: string;
  description: string;
  imageUri?: string;
}

export interface LaunchResult {
  operationId: string;
  mintAddress: string;
  signature: string;
  lifecycle: TransactionLifecycle;
  cluster: SolanaCluster;
}

export interface PumpFunLaunchAdapter {
  createLaunch(request: LaunchRequest): Promise<LaunchResult>;
  getLaunchStatus(operationId: string): Promise<LaunchResult | null>;
}

export interface FeeAllocation {
  recipientAddress: string;
  /** Integer lamports; floating-point SOL values are not accepted for settlement. */
  lamports: bigint;
  purpose: "protocol" | "creator" | "referrer";
}

export interface FeeSettlementRequest {
  operationId: string;
  sourceSignature: string;
  allocations: FeeAllocation[];
}

export interface FeeSettlementResult {
  operationId: string;
  settlementSignature: string;
  lifecycle: TransactionLifecycle;
}

export interface FeeSettlementAdapter {
  /** Must be idempotent by operationId and reconcile against confirmed chain data. */
  settle(request: FeeSettlementRequest): Promise<FeeSettlementResult>;
  getSettlement(operationId: string): Promise<FeeSettlementResult | null>;
}

export interface AheVerificationRequest {
  operationId: string;
  walletAddress: string;
  /** Opaque proof/reference produced by the AHE service; never trust client booleans. */
  proofReference: string;
}

export interface AheVerificationResult {
  verified: boolean;
  verificationId: string;
  checkedAt: string;
  policyVersion: string;
  reasonCode?: string;
}

export interface AheVerificationAdapter {
  verify(request: AheVerificationRequest): Promise<AheVerificationResult>;
}
