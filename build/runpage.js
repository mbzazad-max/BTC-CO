/* Runs the ORIGINAL BTC Correlations page (reference/index.original.html, unchanged) in jsdom and presses its own
   "Refresh from TradingView" button. The page's TradingView connector is answered from candles given by the caller
   (closed candles from Market-Data), in the exact answer shape mcp-tv-get-ohlcv uses, and the page's database is a
   one-document stand-in. Whatever the page saves with its own code (scan/latest) is returned unchanged.
   So every number on the dashboard (betas, correlations, vs BTC, comments, dominance signals) is worked out by the
   page itself; this file only feeds it data. Used by build/build.js and tests/parity.js.
   runPage({ nodeModules, candles: {symbol: [{t,o,h,l,c,v}] | {error}}, previous: doc|null }) -> { doc, banner, calls } */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

function answer(rows, args) {                     // what mcp-tv-get-ohlcv returns for these arguments
  let r = rows;
  const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
  if (args.date_from) r = r.filter((x) => day(x.t) >= args.date_from);
  if (args.date_to) r = r.filter((x) => day(x.t) <= args.date_to);
  if (args.count) r = r.slice(-args.count);
  if (args.format === 'rows') return { success: true, symbol: args.symbol, interval: args.interval, count: r.length, format: 'rows', bars: r.map((x) => ({ t: x.t, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v })) };
  return { success: true, symbol: args.symbol, interval: args.interval, count: r.length, format: 'columns',
    bars: { t: r.map((x) => x.t), o: r.map((x) => x.o), h: r.map((x) => x.h), l: r.map((x) => x.l), c: r.map((x) => x.c), v: r.map((x) => x.v) } };
}

async function runPage({ nodeModules, candles, previous, timeoutMs = 120000 }) {
  const { JSDOM } = require(path.join(nodeModules, 'jsdom'));
  const page = fs.readFileSync(path.join(ROOT, 'reference/index.original.html'), 'utf8');
  const m = page.match(/<script>([\s\S]*)<\/script>\s*$/);
  if (!m) throw new Error('could not find the page script');
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + page.slice(0, m.index) + '</body></html>',
    { url: 'https://btc-co.build/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const calls = [];
  let saved = null, current = previous ? JSON.parse(JSON.stringify(previous)) : null, listener = null;
  const db = { doc: (p) => ({
    onSnapshot: (next) => { if (p === 'scan/latest') { listener = next; setImmediate(() => next({ exists: !!current, data: () => JSON.parse(JSON.stringify(current)) })); } return () => {}; },
    get: async () => ({ exists: p === 'scan/latest' && !!current, data: () => JSON.parse(JSON.stringify(current)) }),
    set: async (d) => { if (p !== 'scan/latest') throw new Error('unexpected document ' + p); saved = JSON.parse(JSON.stringify(d)); current = saved; if (listener) listener({ exists: true, data: () => JSON.parse(JSON.stringify(current)) }); },
  }) };
  const mcp = { callTool: async (server, tool, args) => {
    calls.push({ server, tool, args: JSON.parse(JSON.stringify(args)) });
    if (tool !== 'mcp-tv-get-ohlcv') throw { code: 'tool_error', message: 'unexpected tool ' + tool };
    const src = candles[args.symbol];
    if (!src) throw { code: 'tool_error', message: args.symbol + ' is not loaded from Market-Data for this dashboard' };
    if (src.error) throw { code: 'tool_error', message: src.error };
    return { payload: answer(src, args) };
  } };
  const user = { isOwner: async () => true, canEdit: async () => true };
  w.claude = { use: async (k) => ({ db, mcp, user }[k] || null) };
  w.setTimeout = (f, ms, ...a) => setTimeout(f, 0, ...a);        // the page waits 1.5 s between calls; not needed here
  w.setInterval = () => 0;                                        // the page's once-a-minute status refresh
  w.eval(m[1]);
  const $ = (id) => w.document.getElementById(id);
  const until = async (fn, what) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > timeoutMs) throw new Error('timed out waiting for ' + what); await new Promise((r) => setTimeout(r, 20)); } };
  await until(() => $('refresh') && !$('refresh').hidden, 'the page to load');
  $('refresh').click();
  await until(() => $('progWrap').hidden && !$('refresh').disabled && calls.length, 'the page refresh to finish');
  const banner = $('banner').hidden ? '' : $('banner').textContent;
  w.close();
  return { doc: saved, banner, calls };
}
module.exports = { runPage, answer };
