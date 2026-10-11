# Quantum Launchpad V2.5 — Build Worklog

Project: Next.js 16 single-page app (only `/` route) implementing the QUANTUM LAUNCHPAD V2.5 spec:
- Discover (media universe feed), Creator Studio, Spaces/Arenas, Launch Arena (Solana-style launchpad with bonding-curve trading), Quantum Labs (AHE crypto service + developer console), Portfolio/Wallet, AI Guide, global search, notifications.

Visual identity: obsidian/graphite dark UI, electric violet + cool cyan accents, glass surfaces, big media.

Architecture rules:
- Single route `src/app/page.tsx` — client-side view switching via zustand store.
- Backend via Next.js API routes (`src/app/api/**`), Prisma + SQLite (`db/custom.db`).
- Session user = demo user "@nova" (no real auth in this build).
- z-ai-web-dev-sdk (LLM) used ONLY in backend (/api/chat AI Guide).

Shared contracts (already written, agents must use them):
- `src/lib/types.ts` — DTO types
- `src/lib/format.ts` — formatters (usd, sol, compact, timeAgo)
- `src/lib/bonding.ts` — bonding curve math (shared constants MIGRATION_SOL=85, VIRTUAL_SOL=30, VIRTUAL_TOKEN=1e9)
- `src/lib/session.ts` — `getSessionUser()` server helper (demo user)
- `src/lib/ahe.ts` — real AES-256-GCM + HKDF-SHA256 implementation (server-only)
- `src/store/app-store.ts` — zustand: view navigation, wallet, session, panels
- `src/components/qe/*` — app shell components

---
Task ID: 2-c
Agent: full-stack-developer

Task: Build the Quantum Labs module (AHE crypto service console + developer platform) — 7 API routes (`/api/ahe/keys`, `/api/ahe/keys/[id]`, `/api/ahe/encrypt`, `/api/ahe/decrypt`, `/api/ahe/selftest`, `/api/ahe/usage`, `/api/verification`) and 7 client components under `src/components/labs/` (LabsView, AheConsole, ApiKeysCard, UsageCard, SelftestCard, VerificationPanel, PlansCard).

Work log:
- API: all routes force-dynamic, session-scoped via getSessionUser(), try/catch, Next 16 `params: Promise<{id}>`.
  - keys GET: own keys, non-revoked first, mapped to ApiKeyDTO (keyHash/fullKeyOnce never exposed). keys POST: label 2–40, env default SANDBOX, plan default FREE; quota FREE 1000 / PRO 50000 / ENTERPRISE 1e6; stores sha256 keyHash + prefix + fullKeyOnce; 201 { key, fullKey } — fullKey returned exactly once.
  - keys/[id] DELETE: soft revoke (revoked=true), ownership enforced, { ok: true }.
  - encrypt: plaintext 1–8000; key by keyId OR fullKey (sha256 hashKey lookup — powers the docs curl example) OR first active key; 429 "Quota exceeded for this key" at used>=quota; logs ApiUsageEvent /v1/encrypt OK, increments used + lastUsedAt; returns { envelope, ciphertextBytes, latencyMs }.
  - decrypt: ownership guard on envelope.kid before crypto (403 "Key not found or not yours"); success logs OK + increments; AheError logs ERROR /v1/decrypt and returns 422 { error, code } (AHE_AUTH_FAILED | AHE_MALFORMED_ENVELOPE | AHE_UNSUPPORTED_VERSION | AHE_UNSUPPORTED_ALG | AHE_KEY_UNAVAILABLE); returns { plaintext, latencyMs }.
  - selftest GET|POST: { results, allPassed, version, alg, kdf } via aheSelfTest() on a scratch kid (no metering).
  - usage GET: { totals{calls,errors,avgLatencyMs}, events(40 latest), perKey[{keyId,label,used,quota}] }.
  - verification GET: latest VerificationCheck per name for projectId → { checks: VerificationCheckDTO[] }; 400 without projectId.
- Components (obsidian glass, violet+cyan accents, shadcn primitives, @/lib/api, useToast):
  - LabsView: glass-strong neon-border hero with honest AHE v1 copy ("v1 does not claim post-quantum security", "ML-KEM integration point (planned stage)"), chips `AHE-1 · A256GCM · HKDF-SHA256`, icon section headings; grids: AheConsole (xl:span-2)+SelftestCard → ApiKeysCard+UsageCard → PlansCard.
  - AheConsole: key Select (env badge, used/quota), plaintext Textarea (sample default, ≤8000), violet ENCRYPT → envelope JSON box + latency/bytes chips; cyan DECRYPT from editable envelope Textarea → plaintext box + latency; destructive Alert with code+message on failure; "Load tampered sample" flips one ct char (GCM auth demo); Clear + Copy buttons.
  - ApiKeysCard: ScrollArea max-h-72 (prefix mono, label, env badge, plan, Progress used/quota, timeAgo lastUsed, Active/Revoked), two-step revoke ("Sure?" 3s timeout); New-key Dialog with shown-once fullKey success state + copy + AlertTriangle warning; broadcasts `ahe:keys-changed` (console/usage refresh via listener).
  - UsageCard: totals chips, pure-SVG latency bar chart (600×160, latest 24 events, emerald OK / red ERROR, <title> hover), ScrollArea max-h-56 event feed.
  - SelftestCard: runs suite on mount + manual run; PASS/FAIL rows with CheckCircle2/XCircle + detail; chip `${passed}/${total} PASS` cyan or failures red; version/alg/kdf chips.
  - PlansCard: spec §18 tiers (Explorer Free / Creator $12 proposed / Developer $29 proposed / Enterprise Custom), Developer neon-highlighted ("Popular", or "Current role" for DEVELOPER session role), checkout toast disabled, honesty footnotes (backend-enforced payments, §18 pricing note).
  - VerificationPanel({ projectId }): collapsible card, refresh, status icons PASS/WARN/FAIL/UNAVAILABLE, source+timeAgo, honesty footer ("An unavailable check is not a passed check…"). Self-contained for token pages to embed.
- Sanity: `tsc --noEmit` and `eslint` filtered to labs/ahe/verification → clean. Live smoke tests: selftest 6/6 PASS; encrypt (keyId + fullKey paths) → v1 envelope; decrypt roundtrip OK; tampered ct → 422 AHE_AUTH_FAILED with ERROR event logged; key create 201 (PRO quota 50000) → revoke {ok:true}; usage + verification responses correct. dev.log clean.

Stage summary: Quantum Labs (2-c) complete — honest AHE v1 service console (HKDF-SHA256 + AES-256-GCM, versioned envelopes, tamper detection, quotas + metering), API key lifecycle with shown-once secrets, usage analytics with dependency-free SVG chart, self-test suite, spec §18 plans, reusable verification panel. Cross-module contract: token pages import `{ VerificationPanel }` from `@/components/labs/verification-panel` with `projectId` = tokenId. UI copy never claims achieved post-quantum security; master secrets never leave the server or appear in any response.

---
---
Task ID: 2-a
Agent: full-stack-developer

Task: Build the Launch Arena module — 4 API routes under `/api/tokens/**` (list+create, detail, trade, boost) and 6 client components under `src/components/launch/` (LaunchView, TokenCard, CreateTokenDialog, TokenDetail, PriceChart, TradePanel), plus 4 generated preset cover images in `public/media/`.

Work log:
- Ran the mandatory fullstack init script; read shared contracts (types/format/bonding/api/db/session/app-store), bootstrap converters, Prisma schema, shadcn primitives, and agent-ctx/2-c record for cross-module context.
- Generated preset meme covers via z-ai image CLI (1152x864, card aspect) → converted PNG→JPEG (ffmpeg) into `public/media/`: token-quantum-cat.jpg, token-space-doge.jpg, token-neon-ape.jpg, token-wizard.jpg.
- API (all force-dynamic, getSessionUser, try/catch, Next 16 async params):
  - `GET /api/tokens` — q (name/symbol contains), sort new|progress|mcap|trades (progress+mcap → virtualSol desc; monotonic on constant-product curve), tab terminal|following(placeholder)|created, limit 1..96 default 24; holders via `holding.groupBy` per tokenId; local toTokenDTO mirrors bootstrap (spotPrice, marketCapUsd, curveProgress).
  - `POST /api/tokens` — validates name 2-32 / symbol ^[A-Z0-9]{2,10}$ (server uppercases) / description ≤280; transactional Token(mint=fakeMint) + FeeRecord{ref launch:<uuid>, LAUNCH_FEE, 0.02 quoted/settled, CONFIRMED, txSig, settledAt} + ActivityEvent LAUNCH "{SYM} launched on the Arena" + Notification "Launch confirmed … Fee 0.02 SOL settled"; 201 {token}.
  - `GET /api/tokens/[id]` — token+holders, 40 latest trades desc → TradeDTO, myHolding (compound tokenId_userId), checks deduped latest-per-name, creator; 404 when missing.
  - `POST /api/tokens/[id]/trade` — BUY: solAmount [0.01..100], 1% fee (effectiveSol=×0.99 into curve), tokensOut, weighted-avg holding upsert; SELL: percent [1..100], 400 "No tokens to sell" when empty, tokenIn=amount·pct/100, solOut→reserves−solGross, trader receives solGross·0.99, feeSol in response, avgPrice unchanged, holding deleted <0.000001; 35% bot fill via botTrade()/BOT_LABELS (bot Trade row isBot + TRADE activity, reserves updated); graduation progress≥100 && BONDING → MIGRATED + GRADUATE activity "{SYM} graduated to the liquidity pool 🎓" + notification; TRADE activity "you bought/sold X SOL of SYM"; returns {trade, token(updated), holding, feeSol, botTrade?}.
  - `POST /api/tokens/[id]/boost` — MILESTONE activity "{SYM} got boosted 🚀 by you" + "Boost sent" notification → {ok:true}.
- Components (all "use client", obsidian glass + violet/cyan, shadcn, @/lib/api, useToast, next/image fill+sizes):
  - `launch-view.tsx` LaunchView — hero (gradient + radial glows, display-2 headline, exact fee copy, glow-violet Create CTA, Read-the-rules scroll), debounced 300ms search + Terminal/Following/Created Tabs + sort Select, responsive grid 1/2/3/4, skeletons, empty state, #1/#2/#3 market-cap podium from same fetch (#1 neon-border+Crown), rules card (0.02 launch fee / 1% trade fee / constant-product / 85 SOL graduation, "Simulated environment" badge + honesty footer).
  - `token-card.tsx` TokenCard — aspect-[4/3] cover (Image or symbol-gradient), Graduated 🎓 / progress% badge, marketcap emerald, violet→cyan Progress + pct, trades + timeAgo; clickable + keyboard accessible (role=button, Enter/Space).
  - `create-token-dialog.tsx` CreateTokenDialog — name/symbol auto-uppercase/description 280 counter, 4 preset image radio chips + None (checkmark ring), 0.02 SOL fee note, POST → "Launch confirmed" toast → onCreated; pending Loader2; error toast.
  - `token-detail.tsx` TokenDetail — back(), lg:grid-cols-[1fr_360px]; header (88px cover, badges, mono mint + copy toast, emoji-avatar creator, Boost), stats (price/mcap/trades/holders), description, PriceChart, trades ScrollArea max-h-80 (side arrows, bot badge, txSig → "Simulated signature" toast); right: TradePanel, bonding-curve card (reserves + "Graduates at 85 SOL. Simulated."), collapsible verification panel (PASS/WARN/FAIL/UNAVAILABLE icons) from detail response checks; skeleton + error states.
  - `price-chart.tsx` PriceChart — dependency-free SVG candlesticks, viewBox 600x240, ≤14 candles from latest 40 trades (O/C/H/L of priceAfter), .up/.down oklch green/red, wicks+bodies, white/5 grid, priceLabel y-ticks, timeAgo x-labels, per-candle <title> tooltip; <2 trades → empty state. No chart deps.
  - `trade-panel.tsx` TradePanel — BUY/SELL tabs (violet/red active), chips + custom input, client-side tokensOut/solOut estimates incl. price impact and 0.99 factor, holding row (amount + avg), simulated-wallet gate (connectWallet, "Simulated wallet — no real funds"), POST → toast "Bought/Sold X SYM for Y SOL" → onTraded(), "1% trade fee · simulated devnet route" line, h-11 touch targets.
- Verification: tsc --noEmit filtered launch|api/tokens → 0 errors; bun run lint filtered → 0 problems; live curl smoke tests — create/detail/BUY/SELL/boost/400 validation cases/q+sort+tab params all correct; DB confirmed FeeRecord + ActivityEvents + Notifications; trade-response bug caught by smoke tests (TokenDTO built from stale pre-trade row) and fixed; smoke-test token + side-effect rows cleaned up; dev.log clean.

Stage summary:
Launch Arena (task 2-a) is complete end-to-end on its contract: media-first grid with search/sort/tabs + podium, honest launch flow with itemized 0.02 SOL fee receipt, constant-product trading with disclosed 1% fees and weighted-average cost basis, 35% simulated market-maker fills, 85 SOL graduation → MIGRATED (activity + notification), dependency-free SVG candlestick chart, boost flow, simulated-wallet gating. Shared TokenDTO/TradeDTO/VerificationCheckDTO contracts respected, no new dependencies. Shell wiring note: render <LaunchView /> for view "launch", <TokenDetail tokenId={view.id} /> for view "token".
---
Task ID: 2-b
Agent: full-stack-developer (completed by orchestrator — agent hit report deadline after finishing all files)

Task: Discover feed + Spaces + Creator Studio modules and their APIs.

Work Log:
- All 16 scoped files were created by the agent before timeout: /api/posts (GET list w/ tabs+q+spaceId w/ liked/saved flags, POST create), /api/posts/[id] (GET detail+comments), like/save toggles, comments, /api/spaces (GET+POST), /api/spaces/[id] (detail w/ posts/members/events/messages/joined/myRole), join toggle, messages (GET ?after polling + POST).
- Components: DiscoverView (bootstrap hero + tabs + live rail + trending grid + stat strip), MediaCard (type-aware chrome), PostDialog (media hero, like/save/share, comments composer), SpacesView (filter chips + create dialog), SpaceCard, SpaceDetail (banner, Overview/Wall/Chat(polling)/Members/Events tabs), StudioView (composer + analytics SVG chart + media table).
- Orchestrator verified: all files end correctly, `bun x tsc --noEmit` shows zero errors in src/, every route/component matches the shared contract.

Stage Summary:
- Discover/Spaces/Studio complete on contract. Views: DiscoverView, SpacesView, SpaceDetail({spaceId}), StudioView. APIs verified compiling.
---
Task ID: 4-8 (orchestrator)
Agent: Z.ai Code (main)

Task: Remaining APIs (activity/notifications/search/wallet/portfolio/chat), app shell, Portfolio view, AI Guide, integration into page.tsx, and end-to-end browser verification.

Work Log:
- Built /api/activity (ticker + 40% chance simulated market-maker fill), /api/notifications (GET + PATCH mark-read), /api/search (grouped: tokens/posts/spaces/creators/docs), /api/wallet/connect (simulated association + notification + activity), /api/portfolio (holdings w/ live PnL, trades, fees), /api/chat (Quantum Guide via z-ai-web-dev-sdk with strict safety-boundary system prompt).
- Built app shell: top-bar (search ⌘K, notifications popover, simulated wallet connect/disconnect, profile), sidebar (desktop + mobile drawer), live ticker (12s polling), context panel (live now / top launches / spaces / stats, collapsible), AI Guide dialog, sticky footer with safe-area padding, mobile bottom nav.
- Built PortfolioView: gradient glass wallet card, allocation donut (pure SVG), holdings w/ PnL, recent activity, security review, "metal card" upsell, stat cards.
- Integrated all views into src/app/page.tsx view switch: discover/space/studio/launch/token/labs/portfolio.
- Design system in globals.css: obsidian + violet/cyan identity, glass/neon utilities, ticker marquee, live pulse, scrollbars.
- Media: generated space-cyber.jpg via z-ai CLI (other 8 assets generated during 2-a/2-b).
- Fixed lint errors: Skeleton-in-<p> invalid nesting (portfolio), effect setState pattern (top-bar), render-phase mutation (donut). Cleaned prisma query log noise.
- Agent Browser verification (1440x900 + 390x844): Discover hero/tabs/live rail ✅, post dialog like/save/comment ✅, Spaces grid/detail/join/chat ✅, Studio publish ✅, Launch Arena grid/podium ✅, token detail (chart, curve, verification) ✅, BUY 1 SOL SDOGE executed (price 1.54e-7→1.63e-7, curve 68.9%→72.5%, toast + ticker) ✅, Create Token QDUCK (fee receipt toast, detail page) ✅, Labs AHE encrypt (5ms/86B)→decrypt (2ms) ✅, tamper → AHE_AUTH_FAILED ✅, selftest 6/6 PASS ✅, usage metering 139→141 ✅, Portfolio (balance/PnL/donut/activity) ✅, AI Guide LLM reply w/ honest PQ copy ✅, global search grouped results ✅, notifications panel ✅, mobile bottom nav + footer push ✅. dev.log clean, lint clean.

Stage Summary:
- Quantum Launchpad V2.5 is complete and browser-verified end-to-end on the single / route. All five product pillars live: Discover, Studio, Spaces, Launch Arena, Quantum Labs + Portfolio/Wallet + AI Guide. Simulated environment honestly labeled everywhere; AHE v1 does not claim PQ security; ML-KEM marked as planned stage.
