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
