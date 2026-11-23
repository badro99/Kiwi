#!/usr/bin/env node
/* Dépenses · la page, dans un vrai navigateur (Pasta Corner, 17 nov. 2026).
 *
 *   node tools/expenses-browser-test.mjs
 *
 * Deux scènes. La première est un banc : une page minimale qui charge le
 * module tel quel (assets/expenses/index.js) avec un Kiwi et un KiwiStore
 * réduits, ce dernier gardant chaque écriture dans window.__writes ; les routes
 * /api/expenses/summary, /api/expenses/receipt et /api/ai/expense-ocr sont
 * interceptées. Le banc juge ce que le patron voit et ce qui part au document
 * `expenses` (montants en centimes, pierre tombale). La seconde ouvre le vrai
 * tableau de bord (démo) et appelle Kiwi.handlers['nav-expenses'] : le module
 * se charge dans la coquille sans erreur et une boutique sans données montre
 * l'écran de premier usage, jamais des chiffres inventés.
 *
 * Français seulement (navigateur, règle du 26 oct. 2026). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const HARNESS = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/tokens.css">
<script>
(function () {
  var handlers = {};
  window.__writes = []; window.__toasts = [];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  window.Kiwi = {
    handlers: handlers,
    toast: function (msg, o) { window.__toasts.push(String(msg) + (o && o.desc ? ' ' + o.desc : '')); },
    appPage: function (key, o) {
      var host = document.getElementById('host'); host.innerHTML = '';
      var el = document.createElement('div'); el.className = 'dash-genpage';
      el.innerHTML = '<div class="genpage-head"><h1>' + esc(o.title) + '</h1><p>' + esc(o.subtitle || '') + '</p></div><div class="genpage-body">' + (o.body || '') + '</div>';
      host.appendChild(el); return { el: el };
    },
    modal: function (o) {
      var back = document.createElement('div'); back.className = 'kiwi-backdrop in';
      back.innerHTML = '<div class="kiwi-modal" role="dialog"><h3>' + esc(o.title) + '</h3><div class="kiwi-modal-body">' + (o.body || '') + '</div>' + (o.foot ? '<div class="kiwi-modal-foot">' + o.foot + '</div>' : '') + '</div>';
      document.body.appendChild(back);
      var close = function () { back.remove(); };
      back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-dismiss]')) close(); });
      return { el: back, close: close };
    },
  };
  var docs = {}, subs = [];
  window.KiwiStore = {
    slugFor: function () { return 'pasta-bench'; },
    currentVenue: function () { return 'v-pasta-bench'; },
    define: function (feature, opts) {
      docs[feature] = (opts.blank && opts.blank()) || {};
      return {
        get: function () { return docs[feature]; },
        set: function (d) { docs[feature] = d; window.__writes.push(JSON.parse(JSON.stringify(d))); subs.forEach(function (f) { f(); }); return d; },
        subscribe: function (f) { subs.push(f); return function () {}; },
        cloud: function () { return null; },
      };
    },
  };
  window.__poke = function () { subs.forEach(function (f) { f(); }); };
  window.KiwiI18n = { getLang: function () { return 'fr'; } };
  var made = URL.createObjectURL;
  window.__blobs = [];
  URL.createObjectURL = function (b) { window.__blobs.push(b); return made.call(URL, b); };
})();
</script>
<script src="/assets/material-icons.js"></script>
<script type="module" src="/assets/expenses/index.js"></script>
</head><body><div id="host"></div></body></html>`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/__expenses.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HARNESS); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const T = suite('expenses-browser', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Le mois du banc est celui d'aujourd'hui à Casablanca : le 1er en est
   toujours, quel que soit le jour où la suite tourne. */
const MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit' }).format(new Date());
const D1 = MONTH + '-01';
const ev = (id, cents, reason) => ({ id, occurred_ts: Date.parse(D1 + 'T12:00:00Z'), day: D1, movement_kind: 'out', movement_amount_cents: cents, movement_reason: reason, actor_id: 'm1' });

/* Une vraie image PNG 8 × 8, pour le sélecteur de fichier. */
function png() {
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(8 * (1 + 24), 0x80); for (let y = 0; y < 8; y++) raw[y * 25] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG_FILE = path.join(T.resultsDir, 'ticket.png');
fs.mkdirSync(T.resultsDir, { recursive: true });
fs.writeFileSync(PNG_FILE, png());

async function bench(t, { cashOuts = [], salesDays = [], ocr = null, summaryDelay = 0, staff = [] } = {}) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.calls = [];
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) {
      page.calls.push({ url: u, method: r.method(), body: r.postData() || '' });
      if (u.includes('/api/expenses/summary')) return void setTimeout(() => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, month: MONTH, zone: 'Africa/Casablanca', cutoff: 5, salesDays, cashOuts, staff }) }), summaryDelay);
      if (u.includes('/api/ai/expense-ocr')) return ocr ? r.respond(ocr) : r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      if (u.includes('/api/expenses/receipt')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"key":"private/expenses/pasta-bench/x.jpg"}' });
      return r.respond({ status: 404, contentType: 'application/json', body: '{}' });
    }
    return u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:') ? r.continue() : r.abort();
  });
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/__expenses.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.Kiwi.handlers['nav-expenses']), { timeout: 15000 });
  await page.evaluate(() => window.Kiwi.handlers['nav-expenses']());
  await page.waitForSelector('.xp', { timeout: 15000 });
  await sleep(300);
  return page;
}
const cents = (page, sel) => page.$eval(sel, (el) => Number(el.getAttribute('data-cents')));
const rows = (page) => page.$$eval('.xp-row', (els) => els.map((el) => ({ id: el.dataset.id, cents: Number(el.dataset.cents), source: el.dataset.source, text: el.textContent.replace(/\s+/g, ' ').trim() })));
const act = async (page, name) => { await page.click(`[data-xp-act="${name}"]`); await sleep(250); };
async function fillAmount(page, value) {
  await page.$eval('.xp-sheet [name="amount"]', (el) => { el.value = ''; });
  await page.type('.xp-sheet [name="amount"]', String(value));
}
const lastWrite = (page) => page.evaluate(() => window.__writes[window.__writes.length - 1]);

await T.run('opensWithHistory · les retraits de caisse arrivent classés, le dépôt en banque reste dehors', async (t) => {
  const page = await bench(t, {
    cashOuts: [ev('c1', 12000, 'Légumes marché'), ev('c2', 4500, 'Bouteilles gaz'), ev('c3', 300000, 'Dépôt banque')],
    salesDays: [{ day: D1, salesCents: 500000 }],
  });
  const r = await rows(page);
  assert.equal(r.length, 2, 'two till rows, the bank deposit is not an expense: ' + JSON.stringify(r));
  assert.ok(r.every((x) => x.source === 'till'), 'till rows carry their source');
  assert.ok(r.every((x) => /Caisse/.test(x.text) && /catégorie devinée/.test(x.text)), 'badge and guessed label: ' + r.map((x) => x.text).join(' | '));
  assert.equal(await cents(page, '[data-xp="out"]'), 16500);
  assert.equal(await cents(page, '[data-xp="in"]'), 500000);
  assert.equal(await cents(page, '[data-xp="left"]'), 483500);
  const text = await page.$eval('.xp', (el) => el.textContent);
  assert.match(text, /banque/i, 'the deposit is named, as not counted');
  assert.equal(page.calls.filter((c) => c.url.includes('/api/expenses/summary') && c.url.includes('merchant=pasta-bench') && c.url.includes('month=' + MONTH)).length >= 1, true);
  assert.deepEqual(page.errors, []);
});

await T.run('addEditDelete · ajouter, corriger, supprimer, avec le document en centimes', async (t) => {
  const page = await bench(t);
  await act(page, 'add');
  await page.waitForSelector('.xp-sheet');
  const shown = (sel) => page.$eval(sel, (el) => !!el.getClientRects().length);
  assert.equal(await shown('.xp-sheet [data-xp-scan-note]'), false, 'no « reading » note on a plain add');
  assert.equal(await shown('.xp-sheet [data-xp-photo]'), false, 'no photo line without a photo');
  await fillAmount(page, '250');
  await page.type('.xp-sheet [name="supplier"]', 'Boucherie Atlas');
  await page.click('.xp-sheet [data-cat="meat"]');
  await page.click('.xp-sheet [data-method="cash"]');
  await act(page, 'save');
  let w = await lastWrite(page);
  const added = w.list.find((x) => !x.deleted);
  assert.equal(added.amountCents, 25000);
  assert.equal(added.category, 'meat');
  assert.equal(added.supplier, 'Boucherie Atlas');
  assert.equal(added.method, 'cash');
  assert.equal(await cents(page, '[data-xp="out"]'), 25000);
  let r = await rows(page);
  assert.equal(r.length, 1);
  assert.match(r[0].text, /Boucherie Atlas/);

  await page.click(`.xp-row[data-id="${added.id}"]`);
  await page.waitForSelector('.xp-sheet');
  await fillAmount(page, '300');
  await act(page, 'save');
  w = await lastWrite(page);
  assert.equal(w.list.find((x) => x.id === added.id).amountCents, 30000);
  assert.equal(await cents(page, '[data-xp="out"]'), 30000);

  await page.click(`.xp-row[data-id="${added.id}"]`);
  await page.waitForSelector('.xp-sheet');
  assert.equal(await shown('.xp-sheet .xp-confirm'), false, 'the confirmation waits for the first tap');
  await act(page, 'delete');
  assert.equal(await shown('.xp-sheet .xp-confirm'), true);
  assert.equal((await rows(page)).length, 1, 'one tap is not enough to delete');
  await act(page, 'delete-confirm');
  w = await lastWrite(page);
  const tomb = w.list.find((x) => x.id === added.id);
  assert.equal(tomb.deleted, true, 'a tombstone, not a removal');
  assert.ok(tomb.updatedAt > 0);
  assert.equal((await rows(page)).length, 0);
  assert.deepEqual(page.errors, []);
});

await T.run('completeCashOut · compléter un retrait le remplace, sans le compter deux fois', async (t) => {
  const page = await bench(t, { cashOuts: [ev('c9', 8000, 'achat')] });
  assert.equal(await cents(page, '[data-xp="out"]'), 8000);
  await page.click('.xp-row[data-id="cash:c9"]');
  await page.waitForSelector('.xp-sheet');
  assert.equal(await page.$eval('.xp-sheet [name="amount"]', (el) => el.value.replace(',', '.')), '80');
  await page.click('.xp-sheet [data-cat="produce"]');
  await page.type('.xp-sheet [name="supplier"]', 'Souk Lakhdar');
  await act(page, 'save');
  const w = await lastWrite(page);
  const live = w.list.filter((x) => !x.deleted);
  assert.equal(live.length, 1);
  assert.equal(live[0].cashEventId, 'c9');
  assert.equal(live[0].id, 'xpc_c9', 'the completion id comes from the till movement, so two devices write one row');
  assert.equal(live[0].category, 'produce');
  assert.equal(live[0].source, 'till');
  assert.equal(live[0].amountCents, 8000);
  const r = await rows(page);
  assert.equal(r.length, 1, 'the raw till row is gone');
  assert.equal(r[0].id, live[0].id);
  assert.equal(await cents(page, '[data-xp="out"]'), 8000, 'Out unchanged');
  await page.click(`.xp-row[data-id="${live[0].id}"]`);
  await page.waitForSelector('.xp-sheet');
  assert.equal(await page.$eval('.xp-sheet [name="amount"]', (el) => el.readOnly), true, 'a till amount stays what the drawer says');
  assert.equal(await page.$eval('.xp-sheet [name="date"]', (el) => el.readOnly), true);
  await act(page, 'save');
  assert.equal((await lastWrite(page)).list.find((x) => x.id === 'xpc_c9').amountCents, 8000);
  assert.deepEqual(page.errors, []);
});

await T.run('scanFallback · ticket illisible ou quota atteint : le formulaire s’ouvre vide, sinon prérempli à vérifier', async (t) => {
  const page = await bench(t, { ocr: { status: 429, contentType: 'application/json', body: '{"error":"daily-quota-exceeded"}' } });
  const input = await page.$('input[type="file"][data-xp-file]');
  await input.uploadFile(PNG_FILE);
  await page.waitForSelector('.xp-sheet', { timeout: 10000 });
  assert.equal(await page.$eval('.xp-sheet [name="amount"]', (el) => el.value), '');
  assert.ok(await page.$('.xp-sheet .xp-note'), 'a plain message says why');
  const ocrCall = page.calls.find((c) => c.url.includes('/api/ai/expense-ocr'));
  assert.ok(ocrCall, 'the photo was sent for reading');
  const sent = JSON.parse(ocrCall.body);
  assert.equal(sent.merchant, 'pasta-bench');
  assert.match(sent.image, /^data:image\/jpeg;base64,/);

  const ctx2 = await bench(t, { ocr: { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { supplier: 'Marjane', date: D1, amount: 412.5, category: 'alimentation', items: [], notes: '', ice: '' } }) } });
  const input2 = await ctx2.$('input[type="file"][data-xp-file]');
  await input2.uploadFile(PNG_FILE);
  await ctx2.waitForSelector('.xp-sheet', { timeout: 10000 });
  await ctx2.waitForFunction(() => document.querySelector('.xp-sheet [name="amount"]').value !== '', { timeout: 10000 });
  assert.equal((await ctx2.$eval('.xp-sheet [name="amount"]', (el) => el.value)).replace(',', '.'), '412.5');
  assert.equal(await ctx2.$eval('.xp-sheet [name="supplier"]', (el) => el.value), 'Marjane');
  assert.equal(await ctx2.$eval('.xp-sheet [data-cat="grocery"]', (el) => el.getAttribute('aria-pressed')), 'true');
  assert.match(await ctx2.$eval('.xp-sheet', (el) => el.textContent), /lu sur le ticket, à vérifier/);
  await act(ctx2, 'save');
  const w = await lastWrite(ctx2);
  const saved = w.list.find((x) => !x.deleted);
  assert.equal(saved.amountCents, 41250);
  assert.equal(saved.source, 'scan');
  await sleep(400);
  assert.ok(ctx2.calls.some((c) => c.url.includes('/api/expenses/receipt') && c.method === 'POST' && c.url.includes('id=' + saved.id)), 'the photo is kept with the expense');
  await ctx2.waitForFunction(() => window.__writes.some((w) => w.list.some((x) => x.receiptKey)), { timeout: 5000 });
  await ctx2.click(`.xp-row[data-id="${saved.id}"]`);
  await ctx2.waitForSelector('.xp-sheet');
  await act(ctx2, 'delete');
  await act(ctx2, 'delete-confirm');
  await sleep(300);
  assert.ok(ctx2.calls.some((c) => c.url.includes('/api/expenses/receipt') && c.method === 'DELETE' && c.url.includes('id=' + saved.id)), 'the photo goes with the expense');
  assert.deepEqual([...page.errors, ...ctx2.errors], []);
});

await T.run('filters · catégorie, recherche et export CSV', async (t) => {
  const page = await bench(t, { cashOuts: [ev('f1', 12000, 'Légumes'), ev('f2', 9000, 'viande hachée'), ev('f3', 2500, 'Taxi livraison')] });
  assert.equal((await rows(page)).length, 3);
  await page.click('[data-xp-filter="meat"]');
  await sleep(200);
  let r = await rows(page);
  assert.equal(r.length, 1);
  assert.match(r[0].text, /viande/);
  await page.click('[data-xp-filter="meat"]');
  await sleep(200);
  assert.equal((await rows(page)).length, 3, 'tapping the chip again clears it');
  await page.type('[data-xp-search]', 'taxi');
  await sleep(300);
  r = await rows(page);
  assert.equal(r.length, 1);
  assert.match(r[0].text, /Taxi/);
  await page.evaluate(() => window.__poke());
  await sleep(200);
  const focus = await page.evaluate(() => { const el = document.activeElement; return { search: !!(el && el.matches('[data-xp-search]')), value: el && el.value, caret: el && el.selectionStart }; });
  assert.deepEqual(focus, { search: true, value: 'taxi', caret: 4 }, 'typing is not interrupted by a refresh');
  assert.equal((await rows(page)).length, 1, 'the filter survives the refresh');
  await act(page, 'csv');
  const csv = await page.evaluate(async () => window.__blobs.length ? await window.__blobs[window.__blobs.length - 1].text() : '');
  assert.equal(csv.split('\n')[0], 'date,category,supplier,method,amount,vat,source,receipt,note,id');
  assert.equal(csv.split('\n').length, 4, 'the export carries the whole month, not the filtered view');
  assert.deepEqual(page.errors, []);
});

await T.run('emptyMonth · rien encore : l’écran de premier usage, aucun chiffre', async (t) => {
  const page = await bench(t);
  assert.ok(await page.$('.xp-empty'), 'first-use screen');
  assert.ok(await page.$('.xp-empty [data-xp-act="add"]'));
  assert.ok(await page.$('.xp-empty [data-xp-act="scan"]'));
  assert.equal(await page.$('[data-xp="out"]'), null, 'no hero figures');
  assert.deepEqual(page.errors, []);
});

await T.run('noEmDash · aucun tiret cadratin dans la page ni dans la fiche', async (t) => {
  const page = await bench(t, { cashOuts: [ev('e1', 5000, 'Légumes'), ev('e2', 70000, 'Versement banque')], salesDays: [{ day: D1, salesCents: 90000 }] });
  await act(page, 'add');
  await page.waitForSelector('.xp-sheet');
  const text = await page.evaluate(() => document.body.innerText);
  assert.ok(!text.includes('—'), 'em dash found: ' + text.slice(Math.max(0, text.indexOf('—') - 40), text.indexOf('—') + 40));
  const italics = await page.evaluate(() => [...document.querySelectorAll('.xp *, .xp-sheet *')].filter((el) => getComputedStyle(el).fontStyle === 'italic').length);
  assert.equal(italics, 0, 'type is roman');
});

await T.run('loading · pendant la lecture de la caisse, pas de zéros présentés comme des chiffres', async (t) => {
  const page = await bench(t, { cashOuts: [ev('l1', 6000, 'Légumes')], salesDays: [{ day: D1, salesCents: 40000 }], summaryDelay: 2500 });
  assert.ok(await page.$('.xp-loading'), 'a loading state while the till is read');
  assert.equal(await page.$('[data-xp="out"]'), null, 'no hero figures before the numbers exist');
  assert.equal(await page.$('.xp-empty'), null, 'not the first-use screen either');
  await page.waitForSelector('[data-xp="out"]', { timeout: 10000 });
  assert.equal(await cents(page, '[data-xp="out"]'), 6000);
  assert.deepEqual(page.errors, []);
});

await T.run('ownerOnly · le module chargé garde la règle du patron', async (t) => {
  const page = await bench(t);
  await page.evaluate(() => { window.__kiwiRole = 'manager'; document.getElementById('host').innerHTML = ''; window.__toasts.length = 0; window.Kiwi.handlers['nav-expenses'](); });
  await sleep(300);
  assert.equal(await page.$('.xp'), null, 'a manager does not get the page');
  assert.ok((await page.evaluate(() => window.__toasts.join(' '))).length > 0, 'a plain message says why');
  assert.deepEqual(page.errors, []);
});

await T.run('dashboard · le module se charge dans la vraie coquille et montre le premier usage sans données', async (t) => {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('kiwiSkipOnboard', '1'); localStorage.setItem('kiwiLang', 'fr'); } catch (_) {}
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  });
  page.setDefaultNavigationTimeout(60000);
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['nav-expenses']), { timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.Kiwi.handlers['nav-expenses']());
  await page.waitForSelector('.dash-genpage .xp', { timeout: 15000 });
  assert.ok(await page.$('.dash-genpage .xp-empty'), 'a store without expenses gets the first-use screen');
  assert.equal(await page.$('.dash-genpage [data-xp="out"]'), null);
  assert.deepEqual(errors.filter((m) => /expenses/i.test(m)), []);
});

/* Pasta Corner, 23 nov. 2026 : une sortie classée à la caisse (movement_category)
   compte telle quelle ; ce que le motif a permis de deviner se garde d'un geste ;
   « Divers » reste à compléter à la main. */
await T.run('tillCategory · classée à la caisse, gardée d’un geste, Divers reste à compléter', async (t) => {
  const picked = { ...ev('p1', 16200, 'Khadar'), movement_category: 'produce' };
  const page = await bench(t, { cashOuts: [picked, ev('g1', 55400, 'Gezar'), ev('g2', 20000, 'Saad'), ev('g3', 44880, 'Zambu')], staff: ['saad'] });
  const r = await rows(page);
  const row = (id) => r.find((x) => x.id === 'cash:' + id);
  assert.ok(row('p1') && !/catégorie devinée/.test(row('p1').text), 'picked at the till, not a guess: ' + JSON.stringify(row('p1')));
  assert.ok(/catégorie devinée/.test(row('g1').text));
  const callout = await page.$eval('.xp-callout', (el) => el.textContent.replace(/\s+/g, ' '));
  assert.match(callout, /3 retraits de caisse à compléter/);
  assert.match(callout, /Garder les 2 catégories devinées/, 'Gezar (meat) and Saad (staff); Zambu stays Divers');
  await act(page, 'accept-guesses');
  const w = await lastWrite(page);
  assert.deepEqual(w.list.filter((x) => !x.deleted).map((x) => [x.id, x.category, x.amountCents, x.source, x.cashEventId]).sort(),
    [['xpc_g1', 'meat', 55400, 'till', 'g1'], ['xpc_g2', 'staff', 20000, 'till', 'g2']]);
  assert.equal(await cents(page, '[data-xp="out"]'), 16200 + 55400 + 20000 + 44880, 'kept rows replace their till rows, nothing counted twice');
  assert.match(await page.$eval('.xp-callout', (el) => el.textContent.replace(/\s+/g, ' ')), /1 retrait de caisse à compléter/);
  assert.equal(await page.$('[data-xp-act="accept-guesses"]'), null, 'Divers is never kept blindly');
  assert.deepEqual(page.errors, []);
});

await T.finish();
