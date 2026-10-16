# Authentication and database release gates

## Authentication implemented in this branch

- GitHub OAuth is the only sign-in provider. AHE Market must never collect GitHub passwords, Solana seed phrases, or private keys.
- The provider's immutable numeric account ID is mapped to a stable local handle (`@github_<id>`); the public login name is display text only.
- NextAuth uses signed JWT sessions with a seven-day maximum age.
- OAuth credentials are server-side environment variables. Do not use `NEXT_PUBLIC_` prefixes for secrets.
- Existing API handlers that call `getSessionUser()` must translate an unauthenticated result into HTTP 401. Do not silently fall back to the shared demo account.
- GitHub OAuth does not establish control of a Solana wallet. Wallet ownership requires a separate, nonce-based signed-message challenge.

## Required environment

- `NEXTAUTH_URL`: canonical application URL.
- `NEXTAUTH_SECRET`: cryptographically random secret of at least 32 bytes.
- `GITHUB_ID` and `GITHUB_SECRET`: OAuth application credentials.

## Database status

The current Prisma schema uses SQLite. This is suitable for local development only and is not a production persistence solution for serverless deployments. Do not mark the marketplace production-ready until the selected hosted database adapter is installed, migrations are checked in, and create/read/update/delete plus concurrent-write tests pass against the deployed database.

## Trading, settlement, and PQC

Authentication does not enable live trading. Live transaction flags remain off until buy/sell transaction paths have been validated. Creator fees must be calculated from confirmed on-chain transactions and reconciled against protocol/platform fee destinations; UI estimates are not accounting records. PQC launch attestation remains a separate feature and must bind a verified wallet, mint, canonical metadata digest, and a one-time signing leaf whose reuse is prevented by persistent state.


## PQC identity / launch attestation API added in this branch

1. `POST /api/provenance/identity` registers the signed-in user's identity only after verifying an Ed25519 signature over the canonical `registrationStatement`. The supplied PQ address is re-derived from the root and public seed; the server never receives secret seeds.
2. `POST /api/provenance/identity/reserve` checks the mint account through `SOLANA_RPC_URL`, requires an SPL Token or Token-2022 program owner, and reserves a never-reused leaf for canonical metadata. Unique database constraints prevent leaf, digest, or mint reuse.
3. `POST /api/provenance/identity/attest` verifies the WOTS/Merkle signature against the registered root and stored metadata digest, then conditionally marks the leaf SIGNED. Conditional update prevents concurrent signatures from consuming the same leaf twice.
4. `POST /api/provenance/identity/anchor` verifies a confirmed Solana transaction containing the exact Memo Program payload `pqc.market:v1:launch:<mint>:<digest>:<leaf>`, signed by the registered wallet, and marks the leaf ANCHORED.

The client must build and wallet-sign that memo transaction; the server does not custody wallet keys. The anchor proves that the wallet anchored a digest, not that the mint's on-chain creator field or off-chain image host independently matches the attested metadata. Those checks remain a separate launch-validation gate.

## Migration and runtime warning

Apply `prisma/migrations/20261016000100_pqc_identity_fee_ledger/migration.sql` only after backing up the target database and confirming it is SQLite. The migration is not a substitute for a serverless-safe production database adapter. Until Turso/libSQL or another hosted database is configured and tested, the identity/leaf/fee-ledger routes must not be treated as production-ready.
