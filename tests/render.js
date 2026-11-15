/* Render: the Cloudflare page in a real browser (Playwright Chromium), served from public/ as the Worker serves it.
   Desktop and phone width: no script errors, no "undefined"/"NaN", coin cards and the table filled, no card content past
   its border, no sideways page scroll; also once with each estimate window (15/30/45/90 days). Screenshots go to tests/out/.
   usage: node tests/render.js   (needs the playwright package with Chromium) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const PUB = path.resolve(__dirname, '../public'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/btc-co\//, '/');
  if (p.startsWith('/api/')) { res.writeHead(404); return res.end('{}'); }
  if (p === '/') p = '/index.html';
  const f = path.join(PUB, p);
  if (!f.startsWith(PUB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/btc-co/`;
  const snap = JSON.parse(fs.readFileSync(path.join(PUB, 'snapshot.json'), 'utf8')).docs['scan/latest'];
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(); let bad = 0;
  for (const [w, name] of [[1300, 'desktop'], [400, 'phone']]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(url); await p.waitForFunction(() => document.querySelectorAll('#main .grid .coin').length > 0, null, { timeout: 20000 });
    for (const win of ['90', '45', '30', '15']) {
      await p.selectOption('#win', win); await p.waitForTimeout(150);
      const r = await p.evaluate(() => ({
        nan: /undefined|NaN/.test(document.body.innerText),
        coins: document.querySelectorAll('#main .grid .coin').length, doms: document.querySelectorAll('#main .two .coin').length,
        rows: document.querySelectorAll('#main tbody tr').length, status: document.getElementById('scanAt').textContent,
        over: [...document.querySelectorAll('.coin *')].filter((e) => { const c = e.closest('.coin').getBoundingClientRect(), x = e.getBoundingClientRect(); return x.width > 0 && x.right > c.right + 1; }).length,
        hscroll: document.documentElement.scrollWidth > innerWidth }));
      const ok = !r.nan && !r.over && !r.hscroll && r.coins === snap.coins.length && r.rows === snap.coins.length && r.doms === snap.doms.length;
      if (!ok) bad++;
      console.log(`${name.padEnd(7)} ${win}d: ${r.coins} coin cards, ${r.doms} dominance, ${r.rows} table rows, ${r.nan ? 'undefined/NaN shown' : 'values ok'}, ${r.over} overflowing, ${r.hscroll ? 'scrolls sideways' : 'fits'}${ok ? '' : '  <-- PROBLEM'}`);
      if (win === '90') { console.log(`        status: ${r.status}`); await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); }
    }
    if (errs.length) { bad++; console.log(name + ' script errors: ' + errs.join(' | ')); }
    await p.close();
  }
  await b.close(); server.close();
  console.log(bad ? `${bad} problem(s).` : 'Render OK.');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
