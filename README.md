# Quantum Launchpad V2.5 — Application Workspace

<p>
  <a href="https://github.com/hak3du/workspace"><img src="https://img.shields.io/badge/STATUS-Active_Prototype-0b8f87?style=for-the-badge" alt="Active prototype"></a>
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Prisma-SQLite-2d3748?style=flat-square" alt="Prisma and SQLite">
</p>

Quantum Launchpad is a media-first product prototype that brings discovery, creator/community spaces, a launch arena, portfolio views, and Quantum Labs into one Next.js application.

## What this repository demonstrates

- **Application architecture:** Next.js App Router, React, TypeScript, Zustand state, and modular UI areas.
- **Product workflows:** Discover, Spaces, Studio, Launch, Labs, Portfolio, token detail, and shared navigation.
- **Data layer:** Prisma with a SQLite datasource for local development.
- **Interface engineering:** Tailwind CSS, Radix/shadcn-style components, and Lucide icons.

## Project maturity

**This repository is an active prototype, not a verified production trading platform.** The schema includes simulated wallet/provider defaults. Do not describe wallet flows, trades, fee settlement, authentication, or mainnet execution as production-ready unless each has been independently exercised end-to-end with real infrastructure and transaction evidence.

The presence of UI flows or SDK dependencies is not proof of a live transaction. Any mainnet trading path must remain fail-closed until wallet signing, supported transaction routes, persistent production storage, fee accounting, settlement, and failure handling are verified.

## Local development

Requirements: a compatible Node.js runtime or Bun, Git, and the repository dependencies.

```powershell
git clone https://github.com/hak3du/workspace.git
cd workspace
bun install
Copy-Item .env.example .env
bunx prisma generate
bunx next dev -p 3000
```

Open `http://localhost:3000`.

The checked-in `.env.example` is a local SQLite configuration template. Replace it only with an appropriate local value; never commit real credentials or production connection strings.

## Useful commands

```powershell
bunx next dev -p 3000
bunx prisma generate
bun run lint
```

Review `package.json` before using its `build` or database scripts on Windows: the current scripts include Unix shell utilities, and `db:push` uses `--accept-data-loss`. Do **not** run data-loss-accepting database commands against a database containing data you need.

## Production-readiness checklist

- [ ] Replace demo/simulated wallet and identity paths with tested real authorization.
- [ ] Select and verify production-persistent storage; validate migrations and backup/restore.
- [ ] Prove every enabled transaction path on a devnet/test environment before mainnet.
- [ ] Keep live trading disabled until signing, settlement, fee accounting, and failure paths pass.
- [ ] Add automated tests for authentication, authorization, API validation, and critical user flows.
- [ ] Run a clean production build and deployment smoke test in the target environment.
- [ ] Verify secrets handling, logging, rate limits, dependency updates, and error responses.

## Related work

- [Engineering portfolio](https://github.com/hak3du/portfolio)
- [Zero Trust Policy-as-Code](https://github.com/hak3du/zero-trust-policy-as-code)
- [AHE SDK](https://github.com/hak3du/AHE_SDK)

## Evidence policy

Record exact commands and observed results. Label each capability as prototype, locally tested, externally integrated, or production-verified. Avoid upgrading maturity claims without reproducible evidence.
