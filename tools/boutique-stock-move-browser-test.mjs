#!/usr/bin/env node
/* boutique-stock-move-browser-test · « Mouvements de stock » : consulter OU faire, by real clicks.
 *
 *   node tools/boutique-stock-move-browser-test.mjs
 *
 * 26 Nov 2026: the inventory button « Mouvements de stock » only opened the
 * history. The owner wants a choice: see the history, or record a movement now
 * (delivery, damage, loss…, or a transfer to another shop). assets/pos-boutique/
 * stock-move.js is that screen.
 *
 * On a paired (real) boutique till, APIs mocked:
 *   A · the button opens the choice; « Historique » opens the history, which
 *       has « Retour » and « Nouveau mouvement »;
 *   B · Entrée › Réception fournisseur, two sizes found by search, one of them
 *       raised to 3: ONE manager code covers both lines (movementIds has both
 *       ids), ONE POST carries both rows with the approval, and the stock moves;
 *   C · Sortie › Article abîmé by barcode: + stops at the stock; a refused code
 *       puts the stock back; an approved one takes it out;
 *   D · Transfert: « Vers un autre lieu » needs the place before it saves; a
 *       linked shop hands over to the tracked transfer, already addressed. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const S = suite('boutique-stock-move', { browser });
const shop = { merchant: 'stockmove-casa', type: 'boutique', name: 'Stockmove Casa', location: 'Casablanca' };
const sister = { merchant: 'stockmove-rabat', name: 'Stockmove Rabat' };
const NAME = 'TEST KIWI Chemise lin';
const clickable = (page, sel) => page.waitForFunction((q) => { const b = document.querySelector(q); if (!b) return false; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
  const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!at && b.contains(at); }, { timeout: 15000, polling: 200 }, sel);
const click = async (page, sel) => { await clickable(page, sel); await page.click(sel); await sleep(250); };
const text = (page, sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' '));
const stock = (page) => page.evaluate((nm) => { const cat = window.KiwiBoutiqueCatalog; const p = cat.listProducts({ q: nm }).find((x) => x.name === nm);
  return cat.listVariants(p.id).map((v) => v.size + ':' + v.stock).join(' '); }, NAME);

try {
  await S.run('the stock movement button: history or a new movement', async (t) => {
    const ctx = await browser.createBrowserContext(); t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    await page.setViewport({ width: 1180, height: 860 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    const posts = [];
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(base)) return u.startsWith('data:') ? r.continue() : r.abort();
      const p = new URL(u).pathname;
      if (p === '/api/inventory/movements' && r.method() === 'POST') {
        const body = JSON.parse(r.postData() || '{}');
        posts.push(body);
        /* Like the server: a till may not post a discretionary reason without a manager's proof. */
        if (!body.approval && (body.movements || []).some((m) => !/^sale/.test(m.reason))) return r.respond({ status: 403, contentType: 'application/json', body: '{"error":"reason-forbidden"}' });
        return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, merchant: shop.merchant, accepted: (body.movements || []).map((m, i) => ({ id: m.id, cursor: 100 + i })) }) });
      }
      if (p === '/api/stock-transfers' && r.method() === 'GET') {
        return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, self: { merchant: shop.merchant, name: shop.name }, shops: [sister], incoming: [], outgoing: [] }) });
      }
      if (p.startsWith('/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      return r.continue();
    });
    await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });

    t.step('a paired boutique till, shift opened, a shirt in S 2 and M 1');
    await page.goto(base + '/kiwi-caisse.html?__blank', { waitUntil: 'domcontentloaded' });
    await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('kiwiPaired', '1'); localStorage.setItem('kiwiLiveMerchant', v.merchant);
      localStorage.setItem('kiwiPairedVenue', JSON.stringify(v)); }, shop);
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 30000 });
    await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
    await page.waitForSelector('#bqci-chips .ci-float-chip[data-float="500"]', { visible: true, timeout: 15000 });
    await page.click('#bqci-chips .ci-float-chip[data-float="500"]');
    await page.waitForFunction(() => !document.getElementById('bqci-btn').disabled, { timeout: 5000 });
    await page.click('#bqci-btn');
    await page.waitForSelector('#bq-transfers', { timeout: 15000 });   // the sister shop was read
    const ids = await page.evaluate((nm) => {
      const cat = window.KiwiBoutiqueCatalog;
      const p = cat.addProduct({ name: nm, price: 300 });
      const s = cat.addVariant({ productId: p.id, size: 'S', colorId: 'blanc', colorLabel: 'Blanc', stock: 2 });
      const m = cat.addVariant({ productId: p.id, size: 'M', colorId: 'blanc', colorLabel: 'Blanc', stock: 1 });
      cat.attachBarcode(m.id, '2400000012348');
      return { s: s.id, m: m.id };
    }, NAME);
    check(await stock(page) === 'S:2 M:1', 'setup · S 2 and M 1 in stock');
    await page.evaluate(async () => {
      const u = performance.getEntriesByType('resource').map((e) => e.name).find((x) => /\/assets\/pos-boutique\.js\?/.test(x));
      window.KiwiConfig = window.KiwiConfig || {};
      window.KiwiConfig.features = { ...(window.KiwiConfig.features || {}), caisseInventoryAdmin: true };
      const m = await import(u); m.switchView('inventaire');
    });
    await page.waitForSelector('#bqi-moves', { visible: true, timeout: 10000 });
    /* The manager pad: an approving stub that records what it was asked. */
    await page.evaluate(() => {
      window.__asked = []; window.__refuse = false;
      window.requireManager = (label, go, opts) => { window.__asked.push({ label, ids: (opts && opts.movementIds) || [] }); if (!window.__refuse) go({ id: 'mgr-1', name: 'Responsable' }); };
      window.KiwiCaissePairing.lastManager = () => ({ id: 'mgr-1', name: 'Responsable', approval: 'proof-test' });
    });

    t.step('A · the choice, and the history');
    await click(page, '#bqi-moves');
    await page.waitForSelector('[data-bsm-new]', { visible: true, timeout: 8000 });
    const choice = await text(page, '#bq-invmm');
    check(/Nouveau mouvement/.test(choice) && /Historique/.test(choice) && /Réception, casse, perte, transfert/.test(choice), 'the button opens the choice: « Nouveau mouvement » or « Historique »');
    await click(page, '[data-bsm-history]');
    await page.waitForSelector('#bqm-kpis', { visible: true, timeout: 8000 });
    check(!!(await page.$('[data-bqm-back]')) && !!(await page.$('[data-bqm-new]')), 'the history has « Retour » and « Nouveau mouvement »');
    await click(page, '[data-bqm-back]');
    await page.waitForSelector('[data-bsm-new]', { visible: true, timeout: 8000 });
    check(true, '« Retour » comes back to the choice');

    t.step('B · Entrée › Réception fournisseur, two sizes, one code');
    await click(page, '[data-bsm-new]');
    await page.waitForSelector('[data-bsm-form] #bsm-q', { visible: true, timeout: 8000 });
    const pressed = await page.$eval('[data-bsm-type][aria-pressed="true"]', (b) => b.textContent.trim());
    check(pressed === 'Réception fournisseur', `Entrée starts on « Réception fournisseur » (${pressed})`);
    check(await page.$eval('#bsm-save', (b) => b.disabled), 'nothing to save before an item is added');
    await page.type('#bsm-q', 'chemise lin');
    await page.waitForSelector(`[data-bsm-add="${ids.s}"]`, { visible: true, timeout: 5000 });
    check((await page.$$('[data-bsm-add]')).length === 2, 'the search finds both sizes of the shirt');
    await click(page, `[data-bsm-add="${ids.s}"]`);
    await page.type('#bsm-q', 'chemise lin');
    await page.waitForSelector(`[data-bsm-add="${ids.m}"]`, { visible: true, timeout: 5000 });
    await click(page, `[data-bsm-add="${ids.m}"]`);
    await click(page, `[data-bsm-line="${ids.s}"] [data-bsm-inc]`);
    await click(page, `[data-bsm-line="${ids.s}"] [data-bsm-inc]`);
    const sum = await text(page, '#bsm-sum');
    check(/2 article\(s\) · 4 pièce\(s\)/.test(sum), `the footer counts the lines (${sum})`);
    const after = await page.$eval(`[data-bsm-line="${ids.s}"] .bsm-after`, (e) => e.textContent.replace(/\s+/g, ' ').trim());
    check(/5$/.test(after), `S shows its stock after the movement: 2 + 3 = 5 (${after})`);
    await page.type('#bsm-sup', 'Atelier Fès');
    await page.type('#bsm-ref', 'BL-118');
    await click(page, '#bsm-save');
    await page.waitForSelector('#bqm-kpis', { visible: true, timeout: 8000 });
    check(await stock(page) === 'S:5 M:2', `saved: S 2 → 5 and M 1 → 2 (${await stock(page)})`);
    const asked = await page.evaluate(() => window.__asked);
    check(asked.length === 1 && asked[0].ids.length === 2, `one manager code for the two lines (${JSON.stringify(asked)})`);
    const approved = posts.filter((x) => x.approval);
    check(approved.length === 1 && approved[0].movements.length === 2 && approved[0].approval === 'proof-test'
      && approved[0].movements.every((m) => (m.meta || {}).type === 'reception') && asked[0].ids.slice().sort().join() === approved[0].movements.map((m) => m.id).sort().join(),
      'one approved POST carries both rows, the proof, and exactly the ids the code covered');
    check(approved[0].movements.every((m) => (m.meta || {}).supplier === 'Atelier Fès' && m.refId === 'BL-118'), 'the supplier and the reference travel with each row');
    await sleep(1500);   // the background queue's own try (no code, refused) lands after the approved send
    await click(page, '[data-bqm-back]'); await click(page, '[data-bsm-history]');
    await page.waitForSelector('#bqm-res', { visible: true, timeout: 8000 });
    const hist = await text(page, '#bqm-res');
    check(/Réception fournisseur/.test(hist) && /BL-118/.test(hist), 'the history shows the reception, even after the queue\'s refused replay');
    const marks = await page.evaluate((ids) => window.KiwiMaisonStock.all('boutique').filter((m) => ids.includes(m.id)).map((m) => [m.refused, m.pending]), asked[0].ids);
    check(marks.length === 2 && marks.every(([refused, pending]) => !refused && !pending), `both rows stay accepted on this till (${JSON.stringify(marks)})`);

    t.step('C · Sortie › Article abîmé, by barcode');
    await click(page, '[data-bqm-new]');
    await page.waitForSelector('[data-bsm-form]', { visible: true, timeout: 8000 });
    await click(page, '[data-bsm-kind="out"]');
    await click(page, '[data-bsm-type="casse"]');
    await page.type('#bsm-q', '2400000012348');
    await page.keyboard.press('Enter');
    await page.waitForSelector(`[data-bsm-line="${ids.m}"]`, { visible: true, timeout: 5000 });
    await sleep(300);
    check(!(await page.$('[data-bsm-add]')) && (await page.$eval('#bsm-q', (i) => i.value)) === '', 'the scanned label lands as a line and the search clears');
    await click(page, `[data-bsm-line="${ids.m}"] [data-bsm-inc]`);
    await click(page, `[data-bsm-line="${ids.m}"] [data-bsm-inc]`);
    const q = await page.$eval(`[data-bsm-line="${ids.m}"] input`, (i) => i.value);
    check(q === '2', `+ stops at the stock on a way out (M has 2, the box says ${q})`);
    await page.evaluate(() => { window.__refuse = true; });
    await click(page, '#bsm-save');
    await sleep(1200);
    check(await stock(page) === 'S:5 M:2', `a refused code puts the stock back (${await stock(page)})`);
    const toast = await page.evaluate(() => [...document.querySelectorAll('.bq-toast, .toast, [role="status"]')].map((e) => e.textContent).join(' | '));
    check(/code responsable/.test(toast), 'and says the manager code was not confirmed');
    await page.evaluate(() => { window.__refuse = false; });
    await click(page, '#bsm-save');
    await page.waitForSelector('#bqm-kpis', { visible: true, timeout: 8000 });
    check(await stock(page) === 'S:5 M:0', `an approved code takes the 2 damaged pieces out (${await stock(page)})`);

    t.step('D · Transfert');
    await click(page, '[data-bqm-new]');
    await page.waitForSelector('[data-bsm-form]', { visible: true, timeout: 8000 });
    await click(page, '[data-bsm-kind="move"]');
    const dest = await text(page, '#bsm-why');
    check(new RegExp(sister.name).test(dest) && /Envoi suivi/.test(dest), 'Transfert lists the linked shop, as a tracked shipment');
    await click(page, '[data-bsm-type="transfert-out"]');
    await page.type('#bsm-q', 'chemise lin');
    await page.waitForSelector(`[data-bsm-add="${ids.s}"]`, { visible: true, timeout: 5000 });
    await click(page, `[data-bsm-add="${ids.s}"]`);
    check(await page.$eval('#bsm-save', (b) => b.disabled), '« Vers un autre lieu » does not save without the place');
    await page.type('#bsm-place', 'Dépôt Derb Omar');
    check(!(await page.$eval('#bsm-save', (b) => b.disabled)), 'with the place, it can save');
    await click(page, '[data-bsm-kind="move"]');   // same tab: nothing changes
    await click(page, `[data-bsm-shop="${sister.merchant}"]`);
    await page.waitForFunction(() => { const v = document.querySelector('.bq-tr-veil'); return v && !v.hidden; }, { timeout: 8000, polling: 200 });
    const tv = await text(page, '.bq-tr-veil');
    check(new RegExp('Transfert vers ' + sister.name, 'i').test(tv), `the linked shop opens the tracked transfer, already addressed (« ${tv.slice(0, 60)} »)`);
    check(!(await page.evaluate(() => document.getElementById('bq-inv-veil').classList.contains('is-open'))), 'the inventory window steps aside');
    check(await stock(page) === 'S:5 M:0', 'nothing moved before the transfer is sent');
  });
} finally { await S.finish(); await browser.close(); server.close(); }
console.log(`✓ boutique-stock-move-browser · ${checks} checks`);
