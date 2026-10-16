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
