# Live market charts and wallet integration

## Chart and market-data implementation

The token-detail page now renders `LiveMarketChart`, backed by the server route
`GET /api/market-data/:mint?range=1H|6H|24H|7D`.

Provider flow:
1. DexScreener token pairs are queried for the mint. The most liquid matching base-token pair is selected.
2. OHLCV candles are requested from GeckoTerminal for the selected Solana pool.
3. If GeckoTerminal fails or returns no candles, the route attempts Birdeye OHLCV when the server-only `BIRDEYE_API_KEY` is configured.
4. If a token has no indexed pool, the UI shows an explicit empty state; it does not fabricate candles.
5. The browser refreshes the endpoint every 30 seconds. Range controls select 1-hour, 6-hour, 24-hour, and 7-day windows.

The chart is custom SVG, with a price path, volume bars, range selector, hover crosshair and OHLC readout. Live market statistics include USD price, market cap/FDV fallback, liquidity, 24-hour volume/change and buy/sell counts.

## Wallet status

The existing AHE Launch Arena continues to use Solana Wallet Adapter with the Phantom adapter and the Wallet Adapter React UI. The wallet-adapter-react version in this repository includes Wallet Standard discovery; the deployed modal should be tested against the desired installed wallets. This change does **not** add Reown AppKit, and it does not claim Reown parity.

## Safety boundary

Live chart data does not make live trading available. The current marketplace status endpoint remains authoritative for transaction readiness. Simulated database tokens may not have public Solana mints or indexed pools; the live chart intentionally reports unavailable data for those tokens. No trade is sent or recorded by this chart route.

## Validation still required

- Verify DexScreener pair discovery against a known Pump.fun bonding-curve mint and a graduated PumpSwap mint.
- Verify GeckoTerminal OHLCV response and the optional Birdeye fallback using a configured API key.
- Run `bun run typecheck`, `bun run lint`, `bun test`, and the Vercel preview build.
- Confirm Wallet Standard wallet discovery in the actual deployed wallet modal.
