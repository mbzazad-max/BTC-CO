/* Parity: the ORIGINAL page's own Refresh, run in jsdom and answered with the same Market-Data candles read here by a
   separate, plain loader (not build.js's), against what build.js saved in public/snapshot.json.
   Compared: BTC price and day, every coin row (price, betas, correlations, vs BTC, comments, ratings), every dominance
   card, the saved closes, and which inputs are missing. Coins that build.js kept from an older build ("old") are skipped.
   usage: node tests/parity.js <market-data dir> <node_modules with jsdom>   (exit 1 on any difference) */
'use strict';
const fs = require('fs'), path = require('path');
const { runPage } = require('../build/runpage');
const ROOT = path.resolve(__dirname, '..');
const MD = path.resolve(process.argv[2] || '../market-data'), NM = path.resolve(process.argv[3] || 'node_modules');
const NOW = Math.floor(Date.now() / 1000);

// plain loader: one CSV per series, closed candles only
const csv = (src, file) => { const f = path.join(MD, 'data', src, file); if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, 'utf8').trim().split('\n').slice(1).map((l) => l.split(',').map(Number)).map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })).filter((r) => r.t + 86400 <= NOW); };
function dominance(sym) {                         // stored daily history, then each later UTC day's 20:00 4H close
  const d = csv('tv', `CRYPTOCAP_${sym}_1D.csv`) || [], h = csv('tv', `CRYPTOCAP_${sym}_4H.csv`) || [];
  const last = d.length ? d[d.length - 1].t : -1, out = d.slice();
  for (const r of h) if (new Date(r.t * 1000).getUTCHours() === 20) { const day = r.t - 72000; if (day > last) out.push({ t: day, c: r.c, o: r.c, h: r.c, l: r.c, v: 0 }); }
  return out;
}
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/dashboard.json'), 'utf8')).sources;
const candles = {};
for (const [sym, s] of Object.entries(cfg)) {
  if (!s) continue;
  const rows = sym.startsWith('CRYPTOCAP:') ? dominance(sym.split(':')[1]) : csv('binance', sym.split(':')[1] + '_1D.csv');
  if (rows && rows.length) candles[sym] = rows.slice(-200);
}
const built = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/snapshot.json'), 'utf8')).docs['scan/latest'];

(async () => {
  const { doc } = await runPage({ nodeModules: NM, candles, previous: null });
  const diffs = [];
  const same = (what, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(what + ': ' + JSON.stringify(a).slice(0, 200) + ' vs ' + JSON.stringify(b).slice(0, 200)); };
  same('btc', doc.btc, built.btc);
  const fresh = built.coins.filter((r) => !r.stale_at);
  for (const r of fresh) same('coin ' + r.coin, doc.coins.find((x) => x.id === r.id), r);
  same('coins loaded', doc.coins.map((r) => r.id).filter((id) => fresh.some((r) => r.id === id)), fresh.map((r) => r.id));
  for (const d of built.doms.filter((x) => !x.stale_at)) same('dominance ' + d.id, doc.doms.find((x) => x.id === d.id), d);
  for (const id of Object.keys(doc.closes)) if (fresh.some((r) => r.id === id) || ['btc', 'usdtd', 'usdcd'].includes(id)) same('closes ' + id, doc.closes[id], built.closes[id]);
  same('missing', doc.failed, built.failed);
  const n = fresh.length + built.doms.length + 2;
  if (diffs.length) { console.error(`PARITY FAILED: ${diffs.length} difference(s)\n  ` + diffs.join('\n  ')); process.exit(1); }
  console.log(`Parity OK: ${fresh.length} coins, ${built.doms.length} dominance card(s), BTC and missing list identical (${n} checks); BTC ${doc.btc.price} on ${doc.btc.day}.`);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
