/* BTC Correlations build: turns the shared closed candles (repo mbzazad-max/market-data) into the saved scan the
   ORIGINAL page shows. It does this by running the original page itself (build/runpage.js): the page's own
   "Refresh from TradingView" asks for each coin's daily candles, gets them from Market-Data instead of TradingView,
   and saves its scan with its own code. All of the dashboard's logic stays in the page; this script only converts data:
     candles -> per page symbol, closed daily candles from the series in config/dashboard.json
                (Binance coins: binance/<SYMBOL>/1D from the laptop upload; USDT.D/USDC.D: stored daily history, then
                days made from 4H, a UTC day counting once its 20:00 candle has closed)
     answers -> the mcp-tv-get-ohlcv answer for the page's own request (its date_to/count/format)
   Closed candles only; anything a closed-candle series must never be (unclosed, out of order, a 50% jump) is refused,
   and that coin then fails in the page's refresh exactly as a failed TradingView call would: the page keeps its last
   good result for it and marks it "old". The page also refuses data whose newest candle is over 2 days old.
   usage: node build/build.js <market-data dir> <node_modules with jsdom> [--force]
   Writes public/snapshot.json (the page's scan/latest document) and public/freshness.json.
   If the inputs are unchanged since the last build (and not --force), nothing is rebuilt. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { runPage } = require('./runpage');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MD = path.resolve(args[0] || '../market-data'), NM = path.resolve(args[1] || 'node_modules');
const FORCE = process.argv.includes('--force');
const NOW = Math.floor(Date.now() / 1000), DAY = 86400, SEC = { '4H': 14400, '1D': 86400 };

const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cfg = rd(path.join(ROOT, 'config', 'dashboard.json'));
const manifest = rd(path.join(MD, 'manifest.json')).series || {};
const registry = fs.existsSync(path.join(MD, 'series.json')) ? (rd(path.join(MD, 'series.json')).series || {}) : {};
const prevSnap = fs.existsSync(path.join(PUB, 'snapshot.json')) ? rd(path.join(PUB, 'snapshot.json')) : { docs: {} };
const prevFresh = fs.existsSync(path.join(PUB, 'freshness.json')) ? rd(path.join(PUB, 'freshness.json')) : null;
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

function csvFile(id) { const [src, sym, tf] = id.split('/'); return path.join(MD, 'data', src, `${sym}_${tf}.csv`); }
function load(id) {                                   // [{t,o,h,l,c,v}] oldest first; market-data stores closed candles only
  const f = csvFile(id); if (!fs.existsSync(f)) return null;
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n'); lines.shift();
  return lines.map((ln) => { const p = ln.split(','); return { t: +p[0], o: +p[1], h: +p[2], l: +p[3], c: +p[4], v: +p[5] }; });
}
const after = (A, B) => { if (!A) return B; if (!B) return A; const lastT = A[A.length - 1].t; return A.concat(B.filter((r) => r.t > lastT)); };
function daysFrom4h(rows) {                           // a UTC day counts once its 20:00 candle (the day's last 4H) has closed
  if (!rows) return null;
  const by = new Map(); for (const r of rows) { const d = r.t - (r.t % DAY); (by.get(d) || by.set(d, []).get(d)).push(r); }
  const out = [];
  for (const [d, rs] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
    if (!rs.some((r) => r.t === d + 72000)) continue;
    out.push({ t: d, o: rs[0].o, h: Math.max(...rs.map((r) => r.h)), l: Math.min(...rs.map((r) => r.l)), c: rs.find((r) => r.t === d + 72000).c, v: rs.reduce((s, r) => s + (r.v || 0), 0) });
  }
  return out;
}
function check(rows) {                                // anything a closed daily series must never be
  if (!rows || !rows.length) throw new Error('no candles in Market-Data yet');
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Number.isFinite(r.t) || !Number.isFinite(r.c) || r.c <= 0) throw new Error('bad value at ' + iso(r.t));
    if (r.t % DAY !== 0) throw new Error('candle not on a day boundary at ' + iso(r.t));
    if (i && r.t <= rows[i - 1].t) throw new Error('candles out of order at ' + iso(r.t));
    if (r.t + DAY > NOW) throw new Error('candle not closed yet at ' + iso(r.t));
  }
  for (let i = Math.max(1, rows.length - 120); i < rows.length; i++)
    if (Math.abs(rows[i].c / rows[i - 1].c - 1) > 0.5) throw new Error('impossible jump at ' + iso(rows[i].t));
  return rows;
}
function build(s) { return check(s.then_days_from_4h ? after(load(s.series), daysFrom4h(load(s.then_days_from_4h))) : load(s.series)).slice(-200); }

// ---------- inputs and the skip check ----------
const used = new Set();
for (const s of Object.values(cfg.sources)) if (s) for (const k of ['series', 'then_days_from_4h']) if (s[k]) used.add(s[k]);
const inputs = [...used].sort().map((id) => [id, manifest[id] ? manifest[id].last_open + ':' + manifest[id].rows : 'missing']);
const PAGE_SHA = fs.readFileSync(path.join(ROOT, 'reference/PAGE_SHA256SUMS'), 'utf8').trim().split(/\s+/)[0];
const inputHash = crypto.createHash('sha256').update(JSON.stringify([inputs, cfg, PAGE_SHA])).digest('hex');
if (!FORCE && prevFresh && prevFresh.input_hash === inputHash) { console.log('No new closed candles since the last build; nothing rebuilt.'); process.exit(0); }

(async () => {
  const candles = {}, kept = [], dropped = [];
  for (const [sym, s] of Object.entries(cfg.sources)) {
    if (!s) { dropped.push(sym); continue; }
    try { candles[sym] = build(s); } catch (e) { candles[sym] = { error: String(e.message || e) }; }
  }
  const previous = (prevSnap.docs || {})['scan/latest'] || null;
  const { doc, banner, calls } = await runPage({ nodeModules: NM, candles, previous });
  for (const [sym, c] of Object.entries(candles)) if (c.error) kept.push({ id: sym, why: c.error });
  const series = [];
  for (const sid of [...used].sort()) {
    const r = load(sid), [src, sym, tf] = sid.split('/'), m = manifest[sid] || {};
    series.push({ id: sid, source: src, symbol: sym.replace(/^CRYPTOCAP_/, ''), tf, period_s: SEC[tf],
      last_open: r && r.length ? r[r.length - 1].t : null, last_close: r && r.length ? r[r.length - 1].t + SEC[tf] : null,
      fetched_at: m.fetched_at || null, rows: r ? r.length : 0, frozen: !!(registry[sid] && registry[sid].frozen) });
  }
  const fresh = { generated: iso(NOW), checked_at: NOW, input_hash: inputHash, series, readings: [], kept, dropped,
    page_calls: calls.length, last_result: (doc ? '' : 'The page saved nothing, so the last good scan is kept. ') + (banner || '') };
  fs.mkdirSync(PUB, { recursive: true });
  if (doc) fs.writeFileSync(path.join(PUB, 'snapshot.json'), JSON.stringify({ generated: doc.at, docs: { 'scan/latest': doc } }));
  fs.writeFileSync(path.join(PUB, 'freshness.json'), JSON.stringify(fresh, null, 1));
  console.log((doc ? `Saved the page's scan at ${doc.at}` : 'The page saved nothing; last good scan kept') + `. Page said: ${banner || '(nothing)'}`);
  if (doc) console.log(`  BTC ${doc.btc.price} (day ${doc.btc.day}); ${doc.coins.length} coins, ${doc.doms.length} dominance cards; missing: ${doc.failed.join(', ') || 'none'}`);
  for (const k of kept) console.log(`  NOT LOADED ${k.id}: ${k.why}`);
  if (dropped.length) console.log('  Left out on purpose: ' + dropped.join(', '));
  if (!doc) process.exitCode = 0;
})().catch((e) => { console.error('Build failed, last good data kept: ' + (e.stack || e)); process.exit(1); });
