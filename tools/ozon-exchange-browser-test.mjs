#!/usr/bin/env node
/* « Échange » in the boutique till's Livraisons page, in a real browser.
 *
 *   node tools/ozon-exchange-browser-test.mjs
 *
 * Santos, 2 Nov 2026: the customer paid the courier, then wants another size.
 * The real livraisons.js and exchange.js modules run in Chromium against a
 * page that answers /api/receivables, /api/ozon/parcels and /api/ozon/exchange
 * locally; every step is a real click. Held here:
 *   · a confirmed (paid) order offers « Échange »; the same size and colour is
 *     not offered back, a sold-out variant cannot be picked;
 *   · a size swap shows what the courier collects (the delivery fee only),
 *     and the fee can be switched off;
 *   · « Autre article » finds another item and prices the difference;
 *   · sending takes two gestures, posts ONE exchange (a third tap while it
 *     runs sends nothing), moves stock once (new piece out, old piece in) and
 *     says the Ozon tracking number;
 *   · the order then shows the swap and its parcel. */
import { suite } from './browser-trace.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

/* A paid Ozon order: one dress M bought at 405 MAD. */
const order = () => ({
  saleId: 'dlv-a', ref: 'T-0042', label: 'Robe M', ts: Date.now() - 2 * 86400e3, owedCents: 40500, returnedCents: 0, dueCents: 0,
  collections: [], collected: { method: 'transfer', amountCents: 40500, ts: Date.now() - 3600e3, auto: false }, returned: null,
  customer: { name: 'Cliente Test', phone: '0611223344', city: 'Agadir', address: '1 rue Test', note: '' },
  lines: [{ i: 0, name: 'Robe M', qty: 1, totalCents: 40500, variant: 'p-robe:M:noir', returnedQty: 0, exchangedQty: state.sent ? 1 : 0 }],
  exchanges: state.sent ? [{ id: state.sent.id, ts: Date.now(), by: 'Resp Test', swaps: [{ i: 0, q: 1, from: 'Robe M', to: 'Robe S' }], diffCents: 0, creditCents: 0, codCents: 5000 }] : [],
});
const state = { posts: [], sent: null, slow: false };
const harness = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Livraisons</title></head><body>
<div id="pos-boutique"><section data-bq-panel="livraisons" class="is-on"></section></div>
<script>
  window.__toasts = []; window.__moves = [];
  window.requireManager = (title, cb) => cb({ id: 'm1', name: 'Resp Test' });
  window.KiwiBoutiqueCatalog = { colorFamily: (v) => v.colorId };
  const stock = { 'p-robe|S|noir': 2, 'p-robe|M|noir': 1, 'p-robe|M|gris': 0, 'p-chem|L|blanc': 3 };
  window.__P = {
    'p-robe': { id: 'p-robe', name: 'Robe', price: 450, _variants: [{ size: 'S', colorId: 'noir' }, { size: 'M', colorId: 'noir' }, { size: 'M', colorId: 'gris' }] },
    'p-chem': { id: 'p-chem', name: 'Chemise', price: 600, _variants: [{ size: 'L', colorId: 'blanc' }] },
  };
</script>
<script type="module">
  import { bqLivraisons } from '/assets/pos-boutique/livraisons.js';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const d = { esc, icons: () => {}, fmtMAD: (n) => Math.round(n) + ' MAD', slug: () => 'santos-test', demo: false,
    toast: (msg, ms, kind, detail) => window.__toasts.push({ msg, kind, detail: detail || '' }),
    persistStock: (pid, size, color, delta, ref, why) => { window.__moves.push([pid, size, color, delta, why]); return true; },
    products: () => window.__P, variantStock: (pid, size, color) => ({ 'p-robe|S|noir': 2, 'p-robe|M|noir': 1, 'p-robe|M|gris': 0, 'p-chem|L|blanc': 3 })[pid + '|' + size + '|' + color] || 0,
    colorLabel: (c) => ({ noir: 'Noir', gris: 'Gris', blanc: 'Blanc' })[c] || c };
  window.__d = d;
  bqLivraisons(document.querySelector('[data-bq-panel="livraisons"]'), d);
</script></body></html>`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  const json = (status, body) => { rs.writeHead(status, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(body)); };
  if (u.pathname === '/livraisons.html') { rs.writeHead(200, { 'Content-Type': 'text/html' }); rs.end(harness); return; }
  if (u.pathname === '/api/receivables') return json(200, { confirmDays: 15, open: [], collected: [order()], returned: [] });
  if (u.pathname === '/api/ozon/parcels') {
    const parcels = [{ tracking: 'OZE000001', saleId: 'dlv-a', receiver: 'Cliente Test', phone: '0611223344', city: 'Agadir', address: '1 rue Test', priceCents: 45500, fees: {}, status: 'paid', statusLabel: 'Payé', statusTs: Date.now(), blRef: '' }];
    if (state.sent) parcels.push({ tracking: 'OZX000001', saleId: state.sent.id, receiver: 'Cliente Test', phone: '0611223344', city: 'Agadir', address: '1 rue Test', priceCents: 5000, fees: {}, status: 'pending', statusLabel: '', statusTs: Date.now(), blRef: '' });
    return json(200, { connected: true, parcels });
  }
  if (u.pathname === '/api/ozon/exchange' && rq.method === 'POST') {
    let raw = '';
    rq.on('data', (c) => { raw += c; });
    rq.on('end', () => {
      const body = JSON.parse(raw || '{}');
      state.posts.push(body);
      const reply = () => {
        const already = !!state.sent && state.sent.id === body.id;
        state.sent = { id: body.id };
        json(200, { ok: true, already, exchange: { id: body.id, saleId: body.saleId, codCents: body.feeOnCustomer ? 5000 : 0, diffCents: 0, creditCents: 0 }, parcel: { tracking: 'OZX000001' } });
      };
      setTimeout(reply, state.slow ? 900 : 30);
    });
    return;
  }
  if (u.pathname.startsWith('/api/')) return json(404, { error: 'none' });
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((resolve) => {
  server.once('error', () => { console.error('Browser test server unavailable in this environment'); process.exit(3); });
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const tests = suite('ozon-exchange-browser', { browser });

const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim());
async function open(t, width = 1180) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width, height: 900 });
  await page.goto(base + '/livraisons.html', { waitUntil: 'load' });
  await page.waitForSelector('[data-bqd-tab="collected"]');
  await page.click('[data-bqd-tab="collected"]');
  await page.waitForSelector('[data-bqx-open="dlv-a"]', { visible: true });
  return page;
}

await tests.run('a paid order: swap M for S, the courier collects the delivery fee only, one exchange, stock moved once', async (t) => {
  state.sent = null; state.posts = []; state.slow = true;
  const page = await open(t);
  t.step('open the exchange');
  await page.click('[data-bqx-open="dlv-a"]');
  await page.waitForSelector('[data-bqx-pick="0"]', { visible: true });
  await page.click('[data-bqx-pick="0"]');
  await page.waitForSelector('[data-bqx-var="0"]', { visible: true });
  const chips = await page.$$eval('[data-bqx-var="0"]', (bs) => bs.map((b) => [b.dataset.size, b.dataset.color, b.disabled]));
  assert.deepEqual(chips, [['S', 'noir', false], ['M', 'gris', true]], 'the same size and colour is not offered back; sold out is disabled');
  assert.ok(await page.$eval('[data-bqx-send]', (b) => b.disabled), 'nothing to send before a size is chosen');
  t.step('choose S');
  await page.click('[data-bqx-var="0"][data-size="S"]');
  await page.waitForSelector('.bqx-cod');
  assert.match(await text(page, '.bqx-cod'), /50 MAD/, 'the 405 already paid is not collected again');
  t.step('switch the fee off and on');
  await page.click('[data-bqx-fee]');
  await page.waitForFunction(() => /0 MAD/.test(document.querySelector('.bqx-cod b').textContent));
  await page.click('[data-bqx-fee]');
  await page.waitForFunction(() => /50 MAD/.test(document.querySelector('.bqx-cod b').textContent));
  t.step('send: two gestures, a third tap while it runs sends nothing');
  await page.click('[data-bqx-send]');
  assert.match(await text(page, '[data-bqx-send]'), /Confirmer/);
  assert.equal(state.posts.length, 0, 'the first tap only shows what the courier collects');
  await page.click('[data-bqx-send]');
  await page.waitForFunction(() => document.querySelector('[data-bqx-send]')?.disabled === true);
  await page.$eval('[data-bqx-send]', (b) => b.click());
  await page.waitForFunction(() => window.__toasts.some((x) => /Échange envoyé/.test(x.msg)), { timeout: 8000 });
  assert.equal(state.posts.length, 1, 'one exchange posted');
  const post = state.posts[0];
  assert.match(post.id, /^xch-/);
  assert.deepEqual(post.swaps, [{ i: 0, q: 1, pid: 'p-robe', size: 'S', color: 'noir' }]);
  assert.equal(post.feeOnCustomer, true); assert.equal(post.saleId, 'dlv-a'); assert.equal(post.by.name, 'Resp Test');
  assert.deepEqual(await page.evaluate(() => window.__moves), [['p-robe', 'S', 'noir', -1, 'vente'], ['p-robe', 'M', 'noir', 1, 'retour']]);
  const toast = await page.evaluate(() => window.__toasts.find((x) => /Échange envoyé/.test(x.msg)));
  assert.match(toast.msg, /OZX000001/); assert.match(toast.detail, /50 MAD/);
  t.step('the order shows its swap and parcel');
  await page.waitForFunction(() => /Robe M → Robe S/.test(document.body.textContent), { timeout: 8000 });
  assert.equal(await page.$('[data-bqx-open="dlv-a"]'), null, 'the only piece is swapped: nothing left to exchange');
  state.slow = false;
});

await tests.run('another item: the search finds it and the courier collects the difference', async (t) => {
  state.sent = null; state.posts = [];
  const page = await open(t, 390);
  await page.click('[data-bqx-open="dlv-a"]');
  await page.waitForSelector('[data-bqx-pick="0"]', { visible: true });
  await page.click('[data-bqx-pick="0"]');
  await page.waitForSelector('[data-bqx-other="0"]', { visible: true });
  await page.click('[data-bqx-other="0"]');
  await page.waitForSelector('[data-bqx-q-in]', { visible: true });
  await page.type('[data-bqx-q-in]', 'chem');
  await page.waitForSelector('[data-bqx-prod="p-chem"]', { visible: true });
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-bqx-q-in]')), true, 'the search keeps the cursor while typing');
  await page.click('[data-bqx-prod="p-chem"]');
  await page.waitForSelector('[data-bqx-var="0"][data-size="L"]', { visible: true });
  await page.click('[data-bqx-var="0"][data-size="L"]');
  await page.waitForSelector('.bqx-cod');
  assert.match(await text(page, '.bqx-cod'), /245 MAD/, '600 − 405 + 50 delivery');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, 'no sideways scroll on a phone: ' + overflow);
  await page.click('[data-bqx-cancel]');
  await page.waitForSelector('[data-bqx-open="dlv-a"]', { visible: true });
  assert.equal(state.posts.length, 0);
});

server.close();
await tests.finish();
