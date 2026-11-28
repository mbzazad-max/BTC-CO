/* USDT.D card under "Stablecoin dominance" (owner's request, 28 Nov 2026).
   The original page shows one card, USDT.D + USDC.D. This adds a second card for USDT.D on its own, worked out by the
   ORIGINAL page's own dominance code: its analysis functions (stats, returns, windows, domRow) are taken from
   reference/index.original.html as written and run on the same saved closes the page used (doc.closes.usdtd and
   doc.closes.btc), with the same day matching as the page's USDT.D + USDC.D card. The page file stays unchanged; it
   renders every entry of doc.doms with its own card code, so the new card looks exactly like the existing one.
   Same "old" rule as the page: if USDT.D failed to load, the card keeps its previous values and is marked old.
   addUsdtCard(doc, previous, failedIds) -> doc (doms gets { id: 'usdt', name: 'USDT.D (Tether only)', ... }) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ID = 'usdt', NAME = 'USDT.D (Tether only)';

let pageFns = null;
function pageAnalysis() {                         // the page's own functions, exactly as written in the original page
  if (pageFns) return pageFns;
  const page = fs.readFileSync(path.join(ROOT, 'reference/index.original.html'), 'utf8');
  const a = page.indexOf('  /* ---------- analysis ---------- */'), b = page.indexOf('  function coinRow(');
  const c = page.indexOf('  function domRow('), d = page.indexOf('  function analyzeAll(');
  const w = page.match(/const GAP_MS = 1500, WINS = (\[[^\]]+\]);/);
  if (a < 0 || b < a || c < b || d < c || !w) throw new Error('could not find the page\'s dominance code');
  const src = 'const WINS = ' + w[1] + ';\n' + page.slice(a, b) + page.slice(c, d) + '\nreturn { domRow };';
  pageFns = new Function(src)();
  return pageFns;
}

function usdtRow(closes) {
  if (!closes || !closes.usdtd || !closes.btc) return null;
  const btcBy = new Map(closes.btc.map((x) => [x[0], x[1]]));
  const pts = closes.usdtd.filter((x) => btcBy.has(x[0])).map((x) => ({ btc: btcBy.get(x[0]), v: x[1] }));
  return pageAnalysis().domRow(ID, NAME, pts);
}

function addUsdtCard(doc, previous, failedIds) {
  if (!doc) return doc;
  doc.doms = (doc.doms || []).filter((d) => d.id !== ID);
  let row = usdtRow(doc.closes);
  if (row && failedIds && failedIds.includes('usdtd')) {
    const prev = ((previous && previous.doms) || []).find((d) => d.id === ID);
    row.stale_at = (prev && prev.stale_at) || (previous && previous.at) || doc.at;
  }
  if (!row) return doc;
  const at = doc.doms.findIndex((d) => d.id === 'usdt_usdc');
  doc.doms.splice(at < 0 ? doc.doms.length : at + 1, 0, row);
  return doc;
}
module.exports = { addUsdtCard, usdtRow, ID, NAME };
