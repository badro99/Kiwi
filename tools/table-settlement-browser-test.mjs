/* Vraie caisse locale, visite synthétique : transfert partiellement payé et reprise. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';
import { LOCALES } from './test-locales.mjs';
const root = path.resolve(import.meta.dirname, '..');
const puppeteer = createRequire(new URL('../app/package.json', import.meta.url))('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium requis');
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, body) => { res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(error ? '' : body); });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const S = suite('table-settlement', { browser });
try {
  for (const locale of LOCALES) await S.run(locale + '-transfert-reprise', async t => {
    const context = await browser.createBrowserContext(); t.defer(() => context.close());
    const page = t.watch(await context.newPage());
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (r.url().startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      return r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort();
    });
    await page.evaluateOnNewDocument(lang => {
      localStorage.setItem('kiwiLang', lang);
      try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}) }); } catch (_) {}
    }, locale);
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof doOpenService === 'function');
    await page.evaluate(() => { doOpenService(); });
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'));
    await page.evaluate(() => {
      setMode('salle');
      const lines = [{ uid: 'test-line', id: 'test-line', name: 'TEST KIWI', qty: 1, price: 60, sent: true }];
      tableOrders.T8 = lines;
      tableSettlement().open('T8', { id: 'test-open', session: 'test-visit', totalCents: 6000, lines });
      tableSettlement().addPayment('T8', { id: 'test-payment-1', amountCents: 2000, method: 'cash' });
      tableSplits.set('T8', { id: 'test-split', session: 'test-visit', total: 60, paidCount: 1, mode: 'egal',
        parts: [{ amount: 20, base: 20, paid: true, saleId: 'test-payment-1' }, { amount: 40, base: 40, paid: false }] });
      journal.push({ id: 'test-payment-1', table: 'T8', session: 'test-visit', amount: 20, method: 'cash', split: { flowId: 'test-split', index: 0 } });
      openTable('T8');
    });
    t.step('déplacer la table depuis les commandes livrées');
    await page.click('#rp-transfer-table');
    await page.waitForSelector('#caisse-transfer-modal.is-open');
    await page.click('[data-ctrf-to="T12"]');
    await page.click('#ctrf-confirm');
    await page.waitForFunction(() => tables.T8.status === 'khawya' && selectedId === 'T12');
    const moved = await page.evaluate(() => {
      const api = tableSettlement(), snap = api.snapshot('T12'), before = JSON.stringify(snap);
      api.transfer('T8', 'T12', { id: snap.settlement.operations.at(-1) });
      return { due: api.balance('T12'), lines: tableOrders.T12.length, sourceLines: (tableOrders.T8 || []).length,
        payments: snap.settlement.entries.length, same: JSON.stringify(api.snapshot('T12')) === before,
        splitPaid: tableSplits.get('T12').paidCount };
    });
    assert.deepEqual(moved, { due: 4000, lines: 1, sourceLines: 0, payments: 1, same: true, splitPaid: 1 });
    t.step('solder puis appliquer la reprise autorisée sans nouvelle commande cuisine');
    const reopened = await page.evaluate(() => {
      const api = tableSettlement();
      api.addPayment('T12', { id: 'test-payment-2', amountCents: 4000, method: 'cash' });
      journal.push({ id: 'test-payment-2', table: 'T12', session: 'test-visit', amount: 40, method: 'cash', split: { flowId: 'test-split', index: 1 } });
      markPaid('T12');
      const count = kdsOrders.length;
      const receipt = { saleId: 'test-payment-2', total: 40, reopenSnapshot: { table: 'T12', covers: 2, orderNo: 'test',
        lines: [{ name: 'TEST KIWI', qty: 1, total: 60 }], split: { id: 'test-split', total: 60,
          parts: [{ amount: 20, base: 20 }, { amount: 40, base: 40 }] } } };
      const result = { table: 'T12', sessionId: 'test-reopen' };
      const ok = KiwiRestaurantReopen.apply(result, receipt), before = JSON.stringify(api.snapshot('T12'));
      KiwiRestaurantReopen.apply(result, receipt);
      return { ok, due: api.balance('T12'), trail: api.snapshot('T12').settlement.entries.map(e => e.kind),
        same: before === JSON.stringify(api.snapshot('T12')), kitchenSame: kdsOrders.length === count,
        paid: tableSplits.get('T12').parts.map(p => p.paid) };
    });
    assert.deepEqual(reopened, { ok: true, due: 4000, trail: ['payment', 'payment', 'refund'], same: true, kitchenSame: true, paid: [true, false] });
    console.log(`PASS ${locale} : transfert réel, solde conservé, reprise et tentatives répétées`);
  });
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
