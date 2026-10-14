# AHE Market production rollout

## Current state

The repository's Launch Arena uses local virtual reserves, generated mint strings,
generated transaction signatures, and simulated fee receipts. These are demo
mechanics, not Solana transactions. The runtime guard added with this document
keeps those mechanics available only when `AHE_MARKET_MODE=simulation`.

Setting `AHE_MARKET_MODE=devnet` or `mainnet` does **not** connect Pump.fun or
enable real transactions. The API must fail closed until the real adapter is
implemented and reviewed.

## Required environment

The current application does not yet connect Prisma to Turso. `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are not sufficient by themselves; the libSQL adapter, compatible dependency lockfile, and migration path remain to be implemented and verified. Do not treat the existing SQLite URL as durable hosted storage.


- `AHE_MARKET_MODE=simulation|devnet|mainnet` (defaults to `mainnet`; set `simulation` only for an explicitly labelled demo)
- `SOLANA_RPC_URL` (server-side RPC endpoint; never expose private credentials)
- `NEXT_PUBLIC_SOLANA_CLUSTER=devnet|mainnet-beta` (only when the wallet UI is wired)
- A production database URL after migrating Prisma from SQLite to PostgreSQL

Never store creator or platform wallet private keys in Prisma, browser storage,
source control, or application environment variables on a shared/untrusted
runtime. Prefer wallet-signed transactions and a managed signer only where
strictly necessary.

## Fee-sharing contract

AHE's agreed commercial model is a disclosed split of eligible Pump.fun creator
fees: creator proceeds go to the creator's wallet and AHE's configured share
goes to AHE's published platform wallet. This is **not** an additional hidden
marketplace trading fee.

Before a creator signs any fee-sharing transaction, the UI must disclose:
- each recipient's wallet address and percentage;
- the creator's share and AHE's share;
- that the on-chain shareholder list is finalized by Pump.fun's
  `update_fee_shares_v2` flow and should be treated as irreversible;
- which fee sources are included and any distribution/sweep costs.

No default percentage is hard-coded. The parties must choose the actual AHE
share and publish the fee schedule before mainnet launch. Percentages are
represented as basis points and must total exactly 10,000.

The current `validateFeeShares` helper performs structural validation only.
Its base58 check is a format check, not proof that an address decodes to a valid
32-byte Solana public key. Validate public keys with the Solana SDK in the
transaction adapter before building or signing any transaction.

## Implementation gates

1. **Adapter:** add and pin the official Pump.fun/Solana SDK versions; implement
   create-coin and creator-fee-sharing instructions. Do not invent transaction
   formats or use generated signatures.
2. **Wallet:** integrate a supported Solana wallet adapter; use wallet signatures
   for creator-authorized transactions. Verify wallet ownership server-side via
   signed nonce challenges, not a client-supplied address alone.
3. **State:** replace SQLite with PostgreSQL and add migration files. Store
   transaction intent, signature, network, mint, confirmation state, fee-share
   config/version, and reconciliation events with idempotency constraints.
4. **Launch flow:** build metadata upload, review, transaction preview, explicit
   fee disclosure/consent, wallet signing, RPC submission, confirmation polling,
   and recoverable failure states.
5. **Fee reconciliation:** use confirmed on-chain account/instruction data as the
   source of truth; reconcile creator-vault balances, AMM sweeps where applicable,
   distributions, recipient amounts, and transaction fees. Never mark a fee
   CONFIRMED based only on a submitted transaction.
6. **Security and release:** add automated tests, devnet end-to-end tests, rate
   limits, request validation, monitoring, key/secret scanning, and independent
   review. Enable mainnet only after the complete flow passes.

## Deployment safety

Do not use `prisma db push --accept-data-loss` against production. Use reviewed
Prisma migrations and a tested backup/restore plan. Audit the repository history
for any committed `.env` credentials; rotate exposed secrets even if the file is
later deleted or ignored.
