# AHE Market build and deployment error log

This is a living log. Record confirmed observations separately from hypotheses; do not mark a fix verified until a relevant check or deployed endpoint confirms it.

## Confirmed blockers

### ERR-001 — GitHub Actions billing lock
- **Observed:** Workflow run `38172401137` for the one-time Turso bootstrap was not started.
- **GitHub's message:** "The job was not started because your account is locked due to a billing issue."
- **Impact:** The job did not execute Bun installation, dependency resolution, schema generation, tests, or build. This is not a code/test failure.
- **Workaround:** Continue code changes through GitHub repository edits; do not depend on Actions to regenerate lockfiles or validate until runner access is restored.
- **Status:** Open.

### ERR-002 — Marketplace status API returns HTTP 503
- **Observed:** `GET /api/marketplace/status` returned `{"error":"Marketplace status is temporarily unavailable"}`.
- **Confirmed:** The route catches a database query failure or other exception and returns 503.
- **Not yet confirmed:** The precise runtime exception. Missing database configuration or unavailable SQLite storage is plausible, but the server log is required to identify the actual cause.
- **Impact:** Launch UI correctly remains locked when status cannot be established.
- **Workaround:** Add safe diagnostics to the endpoint and a separate health route.
- **Status:** Diagnostics added; requires deployment verification.

### ERR-003 — Turso environment variables do not yet connect Prisma
- **Observed:** Turso database `ahemarket` exists at a `libsql://` URL. Vercel environment settings were initially empty; user is configuring Turso variables.
- **Confirmed from current source:** `src/lib/db.ts` creates a plain PrismaClient and reads the SQLite Prisma datasource; it does not instantiate a Turso/libSQL adapter.
- **Impact:** Adding `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` alone cannot connect this app to Turso.
- **Required:** Add compatible Prisma 6 libSQL adapter dependencies, regenerate `bun.lock`, implement a schema/migration approach, then verify remote persistence.
- **Status:** Open; no real Turso connection claimed.

## Current safety boundaries
- Marketplace create/trade routes remain simulation-only.
- Real Solana/Pump.fun transactions remain disabled.
- Do not run the seed script against any live database; it may reset demo data.
- Do not use `prisma db push --accept-data-loss` against production.
- Do not put secrets in this log or source control.

## Verification ledger
- [ ] Install/resolve Prisma libSQL adapter and commit matching lockfile.
- [ ] Verify schema matches `prisma/schema.prisma`.
- [ ] Run unit tests, typecheck, lint, and production build.
- [ ] Configure Vercel Preview secrets.
- [ ] Verify `/api/health` and `/api/marketplace/status` on deployed preview.
- [ ] Create a simulated record, reload, and verify it persists in Turso.
- [ ] Keep real blockchain transaction gates closed until wallet signing, fee sharing, confirmation, and settlement are tested.


### ERR-004 — Concurrent demo-user initialization race (preventive fix)
- **Observed in source review:** `getSessionUser()` and `ensureUserByHandle()` previously performed a read-then-create sequence for unique user handles. Concurrent first requests could both observe no row, then one create could fail on the unique constraint.
- **Change:** Replaced both sequences with Prisma `upsert` operations. This makes initialization a single database operation and avoids the known read-then-create race on supported database providers.
- **Verification:** Source change committed as `94565b7`; automated tests and live concurrency verification have not run because GitHub Actions is billing-locked.
- **Status:** Code change committed; runtime verification pending.


### ERR-005 — Token API accepted ambiguous filters and unchecked image URLs (source review)
- **Observed:** The token feed treated unknown sort values as the progress sort and did not validate unknown tabs or cap search-query length. Token launch accepted any non-empty image URL string without checking URL syntax or protocol.
- **Change:** Commit `94edfc3` rejects unsupported sort/tab values, caps search input at 80 characters, and validates launch image URLs as valid HTTP(S) URLs with a 2,048-character limit.
- **Impact:** Invalid client input now receives HTTP 400 instead of being silently interpreted or stored. This validates URL format/protocol only; it does not guarantee that the remote image exists or is trustworthy.
- **Verification:** Source committed; automated tests and deployed endpoint checks remain blocked/pending because GitHub Actions is billing-locked.
- **Status:** Code change committed; runtime verification pending.


### ARCH-001 — Production-first mode policy
- **Decision:** AHE Market's default target is production. Simulation is an explicit opt-in for customer previews and must not be selected implicitly when deployment configuration is missing.
- **Change:** Commit `322814a` changes `getMarketMode()` to default to `mainnet` rather than `simulation`. This does **not** enable real transactions: the Pump.fun adapter remains hard-coded unavailable, so launch/trade mutations fail closed outside explicit simulation mode.
- **Required follow-up:** Configure production deployments deliberately; add an explicit demo-preview deployment setting, clear UI labels distinguishing demo from live state, and only enable real transactions after wallet signing, supported Pump.fun/Solana operations, fee accounting, confirmation and reconciliation are implemented and verified.
- **Verification:** Source committed; automated tests and deployed behavior not yet verified because GitHub Actions remains billing-locked.
- **Status:** Policy change committed; runtime verification pending.
