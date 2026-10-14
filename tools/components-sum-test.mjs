#!/usr/bin/env node
/* components-sum-test · every total shows the parts that sum to it (stage 4,
 * §2 rule 2 "totals that show their parts", §10.26, §10.30, §18.9, §21.1
 * row 4), with the tip ledger cases.
 *
 *   node tools/components-sum-test.mjs
 *
 * What it holds, on the real kit components in a real Chromium (the demo
 * till, behind kiwiSkin2027:till) and on the real ledger in Node:
 *   · <k-bill>: [data-k-total] equals the sum of its [data-k-part] (the line
 *     prices, the discount), with and without a discount;
 *   · <k-pay>: the key figure is base + tip, and the breakdown is a part,
 *     present with a tip and absent without one;
 *   · <k-split>: the shares sum exactly to the total, no two equal shares
 *     more than a cent apart (230 ÷ 3 = 76.67, 76.67, 76.66), and by item
 *     a discount comes off pro rata (195 and 35 with −23: 175.50, 31.50);
 *   · <k-cash-count>: Expected ([data-k-total]) is opening + cash sales +
 *     cash tips + in − out, the sum of its parts; cash tips are a term;
 *     cash refunds are a sub-line, never a term (cash sales are already
 *     net of them); Counted is read against Expected, not added into it;
 *   · the ledger: tips stay outside revenue (KiwiLedger revenue is the sum
 *     of amounts; tips are their own figure). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

console.log('components-sum-test');

/* ── The ledger, in Node: tips outside revenue ─────────────────────────── */
{
  const Ledger = require(path.join(root, 'assets/kit/ledger.js'));
  const F = await import('./fixtures/ledger-fixtures.mjs');
  const defaults = await F.serverDefaults();
  const day = '2026-10-14', zone = 'Africa/Casablanca';
  const at = (hhmm) => F.wall(day, hhmm, zone);
  const sales = [
    { ts: at('12:00'), amount: 230, tip: 23, method: 'cash' },
    { ts: at('13:00'), amount: 120, tipCents: 1550, method: 'card' },
    { ts: at('14:00'), amount: 45, method: 'cash' },
  ];
  const L = Ledger.create({ sales: () => sales, refunds: () => [], config: () => ({ businessCutoff: 5, timezone: zone }),
    resolve: F.resolverFor(defaults), zReports: () => [], now: () => at('23:00'), source: 'fixture' });
  check(L.get('revenue', { day }).value === 395, `the ledger's revenue is the sum of amounts, tips outside it (${L.get('revenue', { day }).value})`);
  check(L.get('tips', { day }).value === 38.5, `tips are their own figure (${L.get('tips', { day }).value})`);
}

/* ── The components, in a browser ──────────────────────────────────────── */
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1024 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('kiwiSkin2027:till', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  });
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof doOpenService === 'function' && !!window.KiwiTillFrame, { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await page.evaluate(() => { document.querySelector('.mode-pill[data-mode="vrap"]').click(); });
  await sleep(200);
  await page.evaluate(() => { const b = document.querySelector('#vrap-new-order'); if (b) b.click(); });
  await page.waitForFunction(() => menuItems.length > 1 && document.querySelector('k-bill'), { timeout: 20000 });

  /* The money parser and the rule, inside the page. */
  await page.evaluate(() => {
    window.__num = (el) => {
      const txt = String(el.textContent || '').replace(/[⁦-⁩]/g, '');
      const all = [...txt.matchAll(/([+−-])?\s*(\d[\d   ]*(?:[.,]\d{1,2})?)/g)];
      if (!all.length) return NaN;
      const m = all[all.length - 1];
      const v = Number(m[2].replace(/[   ]/g, '').replace(',', '.'));
      return (m[1] === '−' || m[1] === '-') ? -v : v;
    };
    window.__rule = (host) => {
      const R = host.shadowRoot;
      const total = R.querySelector('[data-k-total]');
      const parts = [...R.querySelectorAll('[data-k-part]')].map(window.__num);
      return { total: total ? window.__num(total) : NaN, parts, sum: Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100 };
    };
  });

  /* k-bill, two dishes, then a 10 % discount. */
  await page.evaluate(() => {
    const plain = menuItems.filter((m) => !m.formula && !itemOptGroups(m).length);
    addToCart(plain[0].id); addToCart(plain[0].id); addToCart(plain[1].id);
  });
  await sleep(300);
  let r = await page.evaluate(() => window.__rule(document.querySelector('k-bill')));
  check(r.parts.length === 2 && r.sum === r.total, `<k-bill>: total ${r.total} = its parts ${r.parts.join(' + ')}`);
  await page.evaluate(() => {
    const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
    vrapDiscount = { kind: 'pct', value: 10, amount: money(gross * 0.1), reason: 'Geste commercial', actorId: 'staff:test', accounted: false };
    renderCart();
  });
  await sleep(300);
  r = await page.evaluate(() => window.__rule(document.querySelector('k-bill')));
  check(r.parts.length === 3 && r.parts[2] < 0 && r.sum === r.total, `<k-bill> with a discount: total ${r.total} = ${r.parts.join(' + ')}`);

  /* k-pay: key figure = base + tip. */
  const pay = await page.evaluate(() => {
    const el = document.createElement('k-pay');
    document.body.appendChild(el);
    el.pay = { bill: 'TEST KIWI', due: 47.5, method: null, tipPct: 5 };
    const R = el.shadowRoot;
    const out = { key: window.__num(R.querySelector('[data-key-figure]')), parts: R.querySelectorAll('[data-k-part]').length, tip: el.tip() };
    el.pay = { bill: 'TEST KIWI', due: 47.5, method: null, tipPct: 0 };
    out.keyNoTip = window.__num(R.querySelector('[data-key-figure]'));
    out.partsNoTip = R.querySelectorAll('[data-k-part]').length;
    el.remove();
    return out;
  });
  check(pay.tip === 2.38 && pay.key === 49.88, `<k-pay>: key figure = base + tip (47.50 + ${pay.tip} = ${pay.key}), the tip rounded to the cent`);
  check(pay.parts === 1 && pay.partsNoTip === 0 && pay.keyNoTip === 47.5, '<k-pay>: the breakdown is a part with a tip, absent without one');

  /* k-split. */
  const split = await page.evaluate(() => {
    const el = document.createElement('k-split');
    document.body.appendChild(el);
    el.bill = { total: 230, lines: [{ id: 'a', name: 'A', amount: 195 }, { id: 'b', name: 'B', amount: 35 }] };
    el.__n = 3;
    const equal = el.shares();
    el.bill = { total: 207, lines: [{ id: 'a', name: 'A', amount: 195 }, { id: 'b', name: 'B', amount: 35 }] };
    el.__n = 2; el.__mode = 'item'; el.__assign = { a: 1, b: 2 };
    const byItem = el.shares();
    el.remove();
    return { equal, byItem };
  });
  check(split.equal.join() === '7667,7667,7666', `<k-split> equally: 230 ÷ 3 = ${split.equal.map((c) => c / 100).join(', ')}`);
  check(split.byItem.join() === '17550,3150' && split.byItem[0] + split.byItem[1] === 20700, `<k-split> by item, 195 and 35 with −23: ${split.byItem.map((c) => c / 100).join(', ')}`);

  /* k-cash-count. */
  const count = await page.evaluate(() => {
    const el = document.createElement('k-cash-count');
    document.body.appendChild(el);
    el.count = { opening: 200, cashSales: 1000, refundsCash: 50, cashTips: 60, cashIn: 20, cashOut: 30, lastFloat: 200 };
    el.__any = true;
    if (typeof el.render === 'function') el.render();
    const rule = window.__rule(el);
    const R = el.shadowRoot;
    const sub = R.querySelector('.sub');
    const out = { rule, expected: el.expected(), subIsPart: !!(sub && sub.hasAttribute('data-k-part')), subShown: !!sub,
      tipsPart: [...R.querySelectorAll('[data-k-part]')].some((p) => p.textContent.indexOf('60') >= 0) };
    el.remove();
    return out;
  });
  check(count.expected === 1250 && count.rule.total === 1250 && count.rule.sum === 1250,
    `<k-cash-count>: Expected 1250 = opening + cash sales + cash tips + in − out = ${count.rule.parts.join(' + ')}`);
  check(count.tipsPart, '<k-cash-count>: cash tips are a term of expected cash');
  check(count.subShown && !count.subIsPart, '<k-cash-count>: cash refunds are a sub-line, never a term');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ components-sum-test · ${checks} checks`);
