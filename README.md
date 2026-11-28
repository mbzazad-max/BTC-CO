# BTC Correlations

The Claude artifact "BTC Correlations" (https://claude.ai/artifact/2GvooDNYMeXNcqBVzfFqH5), rebuilt on GitHub and shown
on Cloudflare. Claude only loads data; the original page does all the logic. Estimates from past behaviour, not
financial advice.

- **Address**: none of its own (`workers_dev: false`). It opens at https://dashboards.mbzazad.workers.dev/btc-co/
  behind the home site's owner-only login. Refresh controls are at `/api/btc-co/`, always behind the login.
- **Page**: `public/index.html` is the artifact page (version 1794643682, 14 Nov 2026), byte-identical, plus two script
  tags: `shim.js` (feeds the page's own database from `snapshot.json`, read-only) and `cloud.js` (Refresh button,
  freshness strip, and one style rule that lets the page's long status pill wrap at phone width). The original is
  `reference/index.original.html`; every run checks it against `reference/PAGE_SHA256SUMS` (`node tools/check_page.js`).
- **Data** (all from `mbzazad-max/market-data`, closed daily candles only; map in `config/dashboard.json`):

  | Page input | Market-Data series |
  |---|---|
  | BTC and 29 coins (`BINANCE:<COIN>USDT`, 1D) | `binance/<COIN>USDT/1D` (laptop UPLOAD.bat) |
  | USDT.D, USDC.D (1D) | `tv/CRYPTOCAP_USDT.D/1D`, `tv/CRYPTOCAP_USDC.D/1D` (frozen history, TradingView answer of 13 Nov 2026), then days made from the 4H series of the daily 11:30 TradingView task (a UTC day counts once its 20:00 candle has closed) |
  | USDT.D-only card (added 28 Nov 2026) | no new series: `build/usdt_card.js` runs the page's own dominance code (its `domRow`, taken from the original page as written) on the same saved USDT.D and BTC closes, and adds a second card "USDT.D (Tether only)" next to USDT.D + USDC.D. The page renders it with its own card code; the page file is unchanged. Same "old" rule as the page. `tests/parity.js` checks it against the page's own USDT.D + USDC.D card run with USDC.D held near zero. |
  | VVV (Bybit), STABLE.C.D | left out (owner's choice, 16 Nov 2026): those two cards don't appear |

  AVAX, RENDER, ARB, FET, RAY and WIF were added to Market-Data on 16 Nov 2026 as daily series for the laptop uploader.
  They appear once the Binance download on the laptop includes `SPOT/HTF/<COIN>USDT_D.xlsx` and UPLOAD.bat has run.
- **Build**: `build/build.js` runs the ORIGINAL page in jsdom (`build/runpage.js`) and presses its own "Refresh from
  TradingView"; each TradingView request is answered from Market-Data in the exact mcp-tv-get-ohlcv answer shape, and
  whatever the page saves (`scan/latest`) becomes `public/snapshot.json`. So every beta, correlation, "vs BTC", comment
  and dominance signal is the page's own calculation. Intended difference from claude.ai: closed candles only (the
  artifact's TradingView answer included the day still forming). A coin with no data, or with data over 2 days old, fails
  in the page's own refresh: it keeps its previous result marked "old" (the page's own rule). If no input changed,
  nothing is rebuilt. `public/freshness.json` lists every input and how current it is.
- **Runs** (`.github/workflows/build.yml`): when Market-Data imports new candles for a series it uses (dispatch), daily
  at 01:20 UTC as a safety net, from the Refresh button, and on a push to main.
  Steps: checksum check, secret check, checkout market-data with MARKET_DATA_TOKEN, build, commit, deploy.

**Tests** (jsdom 24 in some folder; Playwright with Chromium for the render test):
- `node tests/parity.js <market-data> <node_modules>`: the ORIGINAL page's own Refresh in jsdom, answered from the same
  Market-Data candles through a separate plain loader, vs build.js. 16 Nov 2026: BTC, all 23 coins, the USDT.D + USDC.D
  card, the saved closes and the missing list identical.
- `node tests/render.js`: the page in Chromium at desktop and phone width with each window (15/30/45/90 days): no
  errors, no undefined/NaN, every card and table row filled, nothing past a card's border, no sideways scroll.
- Data check, 16 Nov 2026, against TradingView: BTCUSDT and SOLUSDT daily closes identical; USDT.D days made from 4H
  within 0.01% of TradingView's daily closes.

**Secrets** (repo Settings → Secrets and variables → Actions → Repository secrets): `MARKET_DATA_TOKEN` (token A,
"coin-zones automation"; it also becomes the Worker's GITHUB_TOKEN for the Refresh button), `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID` (32 characters).
