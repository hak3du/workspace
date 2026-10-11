# Task ID: 2-c — Quantum Labs (AHE crypto service console + developer platform)

**Agent:** full-stack-developer
**Date:** 2026-10-11
**Scope kept:** only `src/app/api/ahe/**`, `src/app/api/verification/route.ts`, `src/components/labs/**`, plus worklog/agent-ctx records. No changes to `page.tsx`, `layout.tsx`, shared libs, or other modules.

## Work log

1. Read `worklog.md`, shared contracts (`types.ts`, `ahe.ts`, `api.ts`, `db.ts`, `session.ts`, `format.ts`, `app-store.ts`), Prisma schema, seed (seeded sandbox key for @nova confirmed), `globals.css` utilities, and lucide-react 0.525 icon availability (verified all needed icons are exported, including `CheckCircle2`/`XCircle`/`Unlock` aliases).
2. Ran the mandatory fullstack init script (dev server restarted in background by `.zscripts/dev.sh`).
3. Wrote 7 API route files (all `force-dynamic`, `NextRequest`/`NextResponse`, try/catch, `getSessionUser()`; Next 16 `params: Promise<{id}>`):
   - `GET /api/ahe/keys` — user's keys, non-revoked first (`orderBy revoked asc, createdAt desc`), mapped to `ApiKeyDTO`; never exposes `keyHash`/`fullKeyOnce`.
   - `POST /api/ahe/keys` — validates label 2–40, environment (default SANDBOX), plan (default FREE); quota by plan FREE 1000 / PRO 50000 / ENTERPRISE 1,000,000; `generateApiKey()` → stores `keyHash` + `prefix` + `fullKeyOnce`; returns **201** `{ key: ApiKeyDTO, fullKey }` (fullKey shown exactly once by UI).
   - `DELETE /api/ahe/keys/[id]` — soft revoke `revoked=true`, ownership enforced (404 when not found/not yours), returns `{ ok: true }`.
   - `POST /api/ahe/encrypt` — plaintext 1–8000; key resolution: `keyId` (own + non-revoked) → `fullKey` (sha256 `hashKey` lookup, own + non-revoked — makes the docs curl example work) → fallback first active key; 429 `{error:"Quota exceeded for this key"}` when `used >= quota`; calls `aheEncrypt`, logs `ApiUsageEvent{endpoint:"/v1/encrypt",status:"OK",latencyMs}`, increments `used`, sets `lastUsedAt`; returns `{ envelope, ciphertextBytes, latencyMs }`.
   - `POST /api/ahe/decrypt` — ownership guard on `envelope.kid` before crypto (403 `{error:"Key not found or not yours"}`); success logs OK + increments; `AheError` logs ERROR (`endpoint:"/v1/decrypt"`) and returns **422** `{ error, code }` with stable codes (`AHE_AUTH_FAILED`, `AHE_MALFORMED_ENVELOPE`, `AHE_UNSUPPORTED_VERSION`, `AHE_UNSUPPORTED_ALG`, `AHE_KEY_UNAVAILABLE`); returns `{ plaintext, latencyMs }`.
   - `GET|POST /api/ahe/selftest` — `{ results: SelfTestResult[], allPassed, version: AHE_VERSION, alg, kdf }` (no metering).
   - `GET /api/ahe/usage` — `{ totals:{calls,errors,avgLatencyMs}, events[40 latest], perKey:[{keyId,label,used,quota}] }`.
   - `GET /api/verification?projectId=…` — latest check per name → `{ checks: VerificationCheckDTO[] }`; 400 when projectId missing.
4. Wrote 7 client components (all `"use client"`, obsidian glass styling, shadcn primitives, `@/lib/api` helpers, `useToast`):
   - `labs-view.tsx` — `LabsView()`: hero band (`glass-strong neon-border rounded-3xl`), honest AHE v1 copy + chips (`AHE-1 · A256GCM · HKDF-SHA256`, ML-KEM *planned stage* roadmap chip), icon section headings (FlaskConical/KeyRound/Layers/ShieldCheck), grid: AheConsole (xl:col-span-2) + SelftestCard → ApiKeysCard + UsageCard → PlansCard. VerificationPanel documented in a note (self-contained, rendered by token pages).
   - `ahe-console.tsx` — `AheConsole()`: key Select (env badge + used/quota), plaintext Textarea (default sample, ≤8000), violet Encrypt button → envelope JSON box + latency/bytes chips; cyan Decrypt button with editable envelope Textarea → plaintext box + latency; destructive Alert shows `code` + message on failure; "Load tampered sample" flips one `ct` char; Clear; Copy buttons. Uses a local `postWithCode` to surface structured 422 codes.
   - `api-keys-card.tsx` — `ApiKeysCard()`: ScrollArea (max-h-72) rows: prefix mono, label, env badge (SANDBOX cyan / PRODUCTION violet), plan, Progress `used/quota`, `timeAgo(lastUsedAt)`, Active/Revoked, two-step revoke ("Sure?" with 3s timeout). New-key Dialog: label/env/plan → success state shows fullKey once with Copy + AlertTriangle "Copy now — this secret is shown only once. You won't see this again." Broadcasts `ahe:keys-changed` window event.
   - `usage-card.tsx` — `UsageCard()`: totals chips (calls/errors/avg latency), dependency-free SVG bar chart (viewBox 600×160, latest 24 events, height=latency scaled, emerald OK / red ERROR, `<title>` hover tooltips, time order old→new), ScrollArea (max-h-56) event feed. Listens for `ahe:keys-changed`.
   - `selftest-card.tsx` — `SelftestCard()`: runs `POST /api/ahe/selftest` on mount + manual "Run test suite"; rows with CheckCircle2/XCircle + name + detail; header chip `${passed}/${total} PASS` cyan or `${failed} FAILED` red; version/alg/kdf chips. Structural local type mirror — no server-module import in client bundle.
   - `plans-card.tsx` — `PlansCard()`: 4 tiers per spec §18 (Explorer Free / Creator $12 / Developer $29 / Enterprise Custom), Developer highlighted with neon-border + "Popular" badge or "Current role" when `useApp().user?.role==="DEVELOPER"`; buttons toast "Plan checkout is disabled in this build"; footnotes: backend-enforced payments + spec §18 pricing note.
   - `verification-panel.tsx` — `VerificationPanel({ projectId })`: fetch on mount + refresh; collapsible (ChevronDown rotate); status icons PASS/WARN/FAIL/UNAVAILABLE (green/amber/red/gray); name/detail/source/timeAgo; honesty footer: "An unavailable check is not a passed check. Attestations verify metadata signing — not project honesty or contract safety."

## Verification (evidence)

- `bun x tsc --noEmit` filtered `labs|ahe|verification` → **0 errors** (one real fix during dev: explicit Prisma type for the encrypt key resolver).
- `bun run lint` filtered `labs|ahe|verification` → **0 problems**.
- Live curl smoke tests against dev server:
  - `POST /api/ahe/selftest` → all 6 checks PASS.
  - `GET /api/ahe/keys` → seeded `ahe_sandbox_hDHR` sandbox key mapped to DTO (no keyHash).
  - `POST /api/ahe/encrypt` (by keyId and by fullKey) → v1 envelope `{v,alg,kdf,kid,iv,ct,tag}` + `ciphertextBytes` + `latencyMs`.
  - `POST /api/ahe/decrypt` → roundtrip plaintext OK; tampered `ct` → 422 `AHE_AUTH_FAILED` + ERROR usage event logged.
  - `POST /api/ahe/keys` → 201 `{key, fullKey}` (PRO → quota 50000); `DELETE` → `{ok:true}`.
  - `GET /api/ahe/usage` → totals + events + perKey. `GET /api/verification?projectId=…` → checks list.
- `dev.log` clean for these routes.

## Stage summary

Quantum Labs module (task 2-c) is complete and wired end-to-end: honest AHE v1 service console (HKDF-SHA256 + AES-256-GCM, versioned envelopes, tamper demo, quota + metering), API key lifecycle (hashed storage, shown-once secret, soft revoke), usage analytics with dependency-free SVG chart, self-test suite, spec §18 plans with honesty footnotes, and a reusable verification panel. Cross-module contract ready: token pages import `{ VerificationPanel }` from `@/components/labs/verification-panel` with a `projectId` (tokenId). No claims of achieved post-quantum security anywhere in UI copy.
