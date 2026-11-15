# BTC Correlations on GitHub + Cloudflare: pipeline notes

Moved 16 Nov 2026 (Sydney) with "Move a Dashboard to Cloudflare - Template" Part B.

## Choices (owner, 16 Nov 2026)
- Original: the BTC Correlations artifact (https://claude.ai/artifact/2GvooDNYMeXNcqBVzfFqH5, version 1794643682).
  The template's "Original dashboard" link pointed at Stablecoin RSI by mistake; confirmed with the owner.
- Address: /btc-co/ on https://dashboards.mbzazad.workers.dev, owner-only.
- AVAX, RENDER, ARB, FET, RAY, WIF: added to Market-Data as Binance 1D series for the laptop uploader (not TradingView).
- VVV (Bybit) and STABLE.C.D: left out. No new TradingView series; the daily 11:30 task is unchanged.

## Data map
See README.md and config/dashboard.json. 24 coins + BTC from binance/<COIN>USDT/1D; USDT.D/USDC.D from the frozen
1D history then days from the 4H series. The build runs the original page's own Refresh in jsdom, answered from
Market-Data, so all numbers are the page's.

## Go-live log (16 Nov 2026, Sydney)
1. Market-Data main fast-forwarded to branch btc-co (8fcbc13): series.json +6 series, dashboards.json +btc-co.
   No import ran (nothing in incoming/).
2. BTC-CO main fast-forwarded to build (c5cb631): build run succeeded, Worker "btc-co" created (Cloudflare workers_list).
3. dashboards main fast-forwarded to btc-co (ad6de33): home site deploy succeeded.
4. Dispatch check: a real TradingView load of USDT.D/USDC.D 4H (Market-Data a098725, 3 new candles each, 0 errors)
   made BTC-CO rebuild and deploy by itself within about a minute (commit 1aee378).
5. Built-in browser: /btc-co/ shows the dashboard (23 coin cards, USDT.D + USDC.D card). /api/btc-co/ asks for the
   Cloudflare Access sign-in, as do / and /stablecoin-rsi/. BUT /btc-co/ itself opened WITHOUT a sign-in, as do
   /btc-eth/ and /fib-extension/: an Access rule outside the repos lets these paths through (see Lessons).

## Secrets
MARKET_DATA_TOKEN (token A, BTC-CO added to its repository access), CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.

## Lessons
- Shallow clones: a depth-1 fetch of a branch makes git forget that branch's parent, and the push to main is then
  refused as non-fast-forward. Fetch main and the branch with --depth=5 before pushing branch:main.
- GitHub's merge API is blocked from the workspace; fast-forward pushes (branch:main) work.
- "Owner-only needs nothing" did not hold here: the owner-only lock depends on the Cloudflare Access applications,
  and a path-level Bypass elsewhere can open a new slug too. Always open the new /<slug>/ without a session after go-live.
- The page's long status pill overflows at phone width; cloud.js lets it wrap (the page itself stays unchanged).
