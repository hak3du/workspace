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

### ARCH-002 — Explicit contracts for production integrations
- **Change:** Commit `ee7cf98` adds `src/lib/marketplace/adapters/types.ts` with typed boundaries for wallet signing, Solana transaction submission/status reconciliation, Pump.fun launches, fee settlement, and AHE verification.
- **Safety properties:** The contracts distinguish transaction lifecycle states, use operation IDs for idempotency/reconciliation, represent fee amounts as integer lamports, and keep wallet identity separate from secret key material. AHE verification accepts an opaque proof reference rather than trusting a client-supplied boolean.
- **Limitations:** These are interfaces only; no provider is connected and no real transaction can be submitted through them. `unknown[]` instructions are an integration seam, not a validation guarantee. Concrete implementations must validate instructions, signer sets, cluster, amounts, addresses, and replay/idempotency behavior.
- **Verification:** File committed. Typecheck/build and integration tests have not run because GitHub Actions remains blocked by the account billing lock.
- **Status:** Contract layer added; implementations and verification pending.

### SEC-001 — Production build previously ignored TypeScript errors
- **Observed:** `next.config.ts` set `typescript.ignoreBuildErrors: true`, allowing a production build to proceed without Next.js enforcing its TypeScript check.
- **Change:** Commit `60b9cfa` removes this override. Production builds should now fail rather than silently bypass the framework's TypeScript validation.
- **Impact / caveat:** Existing type errors, if any, may now block deployment and must be fixed explicitly. No build has run yet, so the repository's current typecheck status is unknown.
- **Status:** Guardrail committed; build verification pending.

### SEC-002 — Database push script accepted data loss
- **Observed:** The `db:push` package script included `--accept-data-loss`, suppressing Prisma's normal protection against schema changes that could lose data.
- **Change:** Commit `b767b6d` removes that flag. The script now runs `prisma db push` and can stop for review when Prisma detects a destructive change.
- **Caveat:** This is a safer default, not a production migration strategy. Use reviewed migrations for production and never point a destructive schema operation at a live database without backup and review.
- **Status:** Script guardrail committed; behavior not runtime-tested.

### ERR-006 — Health endpoint could not distinguish Turso secrets from an active adapter
- **Observed:** The health endpoint previously checked only whether `DATABASE_URL` existed. If the user configured `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` without `DATABASE_URL`, the response reported only a generic missing database configuration.
- **Change:** Commit `7d0cfbc` reports `adapter-not-configured` when Turso environment variables exist but the app has no `DATABASE_URL`; when a database URL is present, the endpoint reports reachability only after `SELECT 1` succeeds. The response never returns secrets.
- **Important limitation:** This is diagnostic clarity, not a Turso integration. The Prisma client and schema have not yet been switched to a libSQL adapter; environment variables alone still do not establish a Turso connection.
- **Verification:** Source change committed. Typecheck, tests, and deployed endpoint checks have not run; GitHub Actions is still billing-locked.
- **Status:** Code change committed; runtime verification pending.

### ERR-007 — Vercel deployment reported an error; root cause not yet established
- **Observed:** The Vercel GitHub integration posted a deployment status of `Error` for the `workspace` project, linking to deployment `3teConc2AfpozAwLtWBdN9Y2pXKN`.
- **Not yet confirmed:** The exact failing build step or runtime exception. The status notification does not include the deployment logs, so it is not safe to attribute the failure to TypeScript, Prisma, environment variables, or another cause.
- **Change:** Commits `0e67075` and `4985c2f` correct conflicting configuration documentation: the environment template now reflects the production-first default and explicitly states that Turso credentials do not connect the current Prisma client; the rollout guide no longer says simulation is the default.
- **Required next step:** Open the linked Vercel deployment and inspect the Build Logs to identify the first actual error; fix that error before attempting to validate database persistence.
- **Verification:** Source/documentation changes committed. Deployment logs and a successful redeploy have not been verified.
- **Status:** Open; root cause unknown.


### ERR-008 — Successful Vercel build does not validate TypeScript or the feature branch
- **Observed:** User-provided Vercel log for a deployment of `main` at commit `fb6f9d9` shows dependency installation completed, Next.js compilation succeeded, all listed routes were generated, and deployment completed successfully.
- **Correction to ERR-007:** This is evidence of a successful deployment for that specific main-branch commit; the earlier deployment error was not reproduced in the supplied log. Do not assume the earlier error's root cause is identified.
- **Validation caveat:** The build output explicitly says `Skipping validation of types`. Therefore, the successful build does not establish TypeScript correctness. It also does not establish database connectivity, Turso persistence, authentication correctness, AHE endpoint behavior, or live marketplace readiness.
- **Branch caveat:** The deployed commit is `fb6f9d9` on `main`, while PR #2 head is `08d546e` on `feat/ahe-market-production-foundation`. The supplied log does not prove that the PR branch changes are deployed.
- **Next verification:** Confirm the deployment's Git commit and branch in Vercel; restore/run an explicit TypeScript check (for example `bun run typecheck` if configured) and test deployed health/status endpoints. Turso integration and real transaction gates remain open.
- **Status:** Successful deployment observed for the logged main commit; feature branch and runtime behavior unverified.

### ERR-009 — Latest pull-request preview deployment still reports Error
- **Observed:** Vercel's GitHub integration posted a newer Error deployment for PR #2, linked to deployment `EX8bvrBE4eHk2f6KVCjyF7cFuW5G` at approximately 2026-10-11 21:06 UTC. The preview URL is not exposed in the comment.
- **Separate from:** The user-provided log confirms a successful deployment of `main` at commit `fb6f9d9`; it does not establish that the PR branch preview succeeded.
- **Not yet confirmed:** The preview's actual failing step. Vercel's deployment page is not accessible through the available read interface, so do not infer that the cause is TypeScript, environment variables, or Prisma.
- **Required next step:** Inspect Build Logs for deployment `EX8bvrBE4eHk2f6KVCjyF7cFuW5G` and capture the first actionable error.
- **Status:** Open; build root cause unknown.

### ERR-010 — CI job failed before any steps were reported
- **Observed:** GitHub Actions run `38174926403` for commit `2d752b9` completed as failure approximately two seconds after starting. GitHub reports runner ID `0` and an empty steps list; downloadable logs were unavailable.
- **Not yet confirmed:** The precise failure reason for this run. It resembles the previously recorded Actions billing-lock failure (ERR-001), but this run's error message was not retrievable, so the billing lock is not asserted as confirmed cause.
- **Impact:** No typecheck, tests, lint, or build result can be inferred from this run.
- **Status:** Open; runner-level failure details unavailable.
