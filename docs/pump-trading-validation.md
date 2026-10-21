# Pump trading validation

This is a **simulation-only preflight**. It builds a real instruction from current mainnet account state and asks the configured RPC to simulate it. It does not request a wallet signature and does not broadcast a transaction.

## Required inputs

- A reliable Solana mainnet RPC URL in `SOLANA_RPC_URL`
- A real Pump.fun token mint address
- The public key of a funded test wallet (public key only; never provide a seed phrase or private key)

## Run

```powershell
$env:SOLANA_RPC_URL = "https://YOUR_MAINNET_RPC"
bun run test:pump-smoke -- <TOKEN_MINT> <TEST_WALLET_PUBLIC_KEY>
```

The script selects the bonding-curve path or the canonical PumpSwap pool path from on-chain curve state, builds a 0.01 SOL buy instruction with 5% slippage, and simulates it. It prints the program logs and compute units. If it fails, retain the full logs for diagnosis.

## What a pass proves

- The configured RPC can read the mint and Pump state.
- The installed SDK can build a trade instruction for the selected venue.
- The program simulation accepts that instruction against the current state.

## What a pass does not prove

- A wallet can sign and broadcast successfully.
- A transaction will confirm at a later blockhash.
- A real trade is profitable or will execute at the quoted price.
- The UI's quote preview is correct for graduated tokens.
- Token creation, metadata hosting, PQ identity registration, or fee settlement is complete.

Only after simulation passes should an authorized tester review the exact wallet transaction, fees, account changes and slippage limits, then explicitly approve a small live transaction. Never put a private key in environment variables for this smoke test.


## Live trading release gate

The UI and Jupiter order/execute routes require all of the following before they enable live transaction paths:

- `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`
- `NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING=true`
- `NEXT_PUBLIC_PUMP_TRADING_VERIFIED=true`

Both trading flags default to false in `.env.example`. Do not set the verification flag merely to make the button active. First record successful validation for supported bonding-curve and graduated PumpSwap mints, including the exact quote, transaction simulation, wallet signature, confirmation, post-trade balances, and sell path. The current smoke test proves simulation only and is not sufficient on its own to approve this flag.

When the gate is closed, the trade panel presents preview estimates only, disables submission, and does not write a simulated trade record from that panel.


## Release-gate status (2026-10-21)

**LIVE TRADING MUST REMAIN DISABLED.** This record does not claim that mainnet trading has passed validation.

Branch: `fix/launch-arena-readiness-gate`
Client readiness-gate commit: `aca908872ca44e1a44fb33c6c96576a38575a086`

The Launch Arena client now fails closed unless all of the following are true:
- `/api/marketplace/status` responds successfully with `realTransactionsEnabled: true`, `productionReady: true`, and `environment: "mainnet"`;
- `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`;
- `NEXT_PUBLIC_ENABLE_REAL_PUMP_TRADING=true`;
- `NEXT_PUBLIC_PUMP_TRADING_VERIFIED=true`.

The server readiness implementation currently hard-codes `isPumpFunAdapterReady() === false`. Therefore the status endpoint must not authorize live trading. This is intentional until transaction validation and the release gate are completed. Jupiter order/execute endpoints independently fail closed on server adapter readiness.

### Verified source findings

- [x] Pump SDK dependencies are declared: `@pump-fun/pump-sdk@4.1.0` and `@pump-fun/pump-swap-sdk@2.1.0`.
- [x] Direct client code builds bonding-curve and PumpSwap instructions and simulates before sending.
- [x] Client readiness mismatch corrected: public flags alone no longer enable live trades; server readiness is required.
- [x] Missing, error, or malformed readiness fails closed in the client.
- [x] Token creation UI explicitly identifies itself as preview-only; real creation, metadata upload, and fee settlement are not implemented.

### Outstanding validation / implementation

- [ ] Run repository typecheck, lint, and tests on this branch.
- [ ] Run the non-broadcast smoke test against a configured RPC and retain full logs.
- [ ] Test one known non-graduated mainnet mint and one graduated PumpSwap mint with simulation only; record mint addresses, RPC provider, UTC timestamp, account state, and logs.
- [ ] Verify buy and sell instruction composition, ATA setup, fee accounts, slippage bounds, wallet signing, confirmation, post-trade balances, and transaction-status reconciliation in a controlled authorized test.
- [ ] Verify timeout/unknown-signature handling prevents duplicate submissions and real transactions cannot create synthetic trade records.
- [ ] Implement and independently test token creation, metadata hosting, creator/platform fee accounting, and required fee-sweep flow before enabling launches.
- [ ] Recheck current official Pump docs and SDK account requirements before changing transaction builders.

No mainnet transaction has been signed or broadcast as part of this source review. No RPC simulation output, mint-specific test result, wallet-signing result, or post-trade balance evidence is available here. Vercel deployment success alone is not transaction validation.

### Release rule

Do not set `isPumpFunAdapterReady()` to true, do not set `NEXT_PUBLIC_PUMP_TRADING_VERIFIED=true`, and do not enable live creation until all applicable items above have reproducible evidence and remaining implementation gaps are closed.
