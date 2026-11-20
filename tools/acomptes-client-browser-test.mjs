#!/usr/bin/env node
/* Acomptes par cliente (La Maison en Vogue, 20 nov. 2026) : au toucher (iPad).
 *   node tools/acomptes-client-browser-test.mjs
 *
 * L'écran listait les notes une par une. Il liste les clientes, avec ce que
 * chacune doit et combien de notes ; on ouvre une cliente, ses notes sont là,
 * la plus ancienne d'abord. On coche celles qu'elle règle, ou on tape ce
 * qu'elle donne : le montant couvre d'abord les plus anciennes, jamais plus
 * que ce qu'elle doit. Le bouton passe à la caisse les notes et le montant. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((rq, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(rq.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--lang=fr-FR', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('acomptes-client', { browser });
const IPAD = { width: 1024, height: 768, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
const DAY = 864e5, now = Date.now();
const NOTES = [
  { id: 'n2', customerId: 'c1', ticketRef: 'M-0012', totalCents: 80000, paidCents: 20000, pendingCents: 0, receiptIds: [], createdTs: now - 6 * DAY },
  { id: 'n1', customerId: 'c1', ticketRef: 'M-0007', totalCents: 150000, paidCents: 50000, pendingCents: 0, receiptIds: [], createdTs: now - 20 * DAY },
  { id: 'n3', customerId: 'c2', ticketRef: 'M-0020', totalCents: 45000, paidCents: 15000, pendingCents: 0, receiptIds: [], createdTs: now - 3 * DAY },
];

await S.run('une cliente, toutes ses notes, un montant qui couvre les plus anciennes', async (t) => {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport(IPAD);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/retail-balances')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ balances: NOTES }) });
    return u.startsWith(base) ? r.continue() : r.abort();
  });
  await page.goto(base + '/assets/tokens.css');
  await page.setContent('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/retail-balances.css"><div id="h"></div><script charset="utf-8" src="/assets/retail-balances.js"></script>');
  await page.waitForFunction(() => window.KiwiRetailBalances);
  await page.evaluate(() => {
    window.__settled = [];
    const names = { c1: 'Lalla Kenza Alami', c2: 'Mme Ghita Benjelloun' };
    return window.KiwiRetailBalances.render(document.getElementById('h'), { merchant: 'test-shop', prefix: 'mz',
      customerName: (id) => names[id], onSelect: () => window.__settled.push('single'),
      onSettle: (sel) => window.__settled.push({ customerId: sel.customerId, ids: sel.rows.map((r) => r.id), cents: sel.amountCents }) });
  });
  await page.waitForSelector('.krb-card');

  t.step('the list shows clients, not notes');
  const cards = await page.$$eval('.krb-card', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  assert.equal(cards.length, 2, `one card per client (${cards.join(' / ')})`);
  assert.match(cards[0], /Lalla Kenza Alami.*2 notes ouvertes.*Reste 1600\.00 MAD/, 'the client who owes most comes first, with her total and her count');
  assert.match(cards[1], /Mme Ghita Benjelloun.*1 note ouverte.*Reste 300\.00 MAD/);

  t.step('search finds a client by a ticket number');
  await page.type('.krb-search input', 'M-0020');
  assert.equal(await page.$$eval('.krb-card', (els) => els.length), 1);
  await page.$eval('.krb-search input', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });

  t.step('open Kenza: her notes, oldest first, all ticked');
  await page.tap('.krb-card');
  await page.waitForSelector('.krb-note');
  const notes = await page.$$eval('.krb-note', (els) => els.map((e) => ({ text: e.innerText.replace(/\s+/g, ' '), on: e.querySelector('input').checked })));
  assert.deepEqual(notes.map((n) => n.text.match(/M-\d+/)[0]), ['M-0007', 'M-0012'], 'oldest note first');
  assert.ok(notes.every((n) => n.on), 'every note starts ticked');
  assert.equal(await page.$eval('.krb-go', (b) => b.textContent), 'Encaisser 1600.00 MAD');
  assert.equal(await page.$eval('.kiwi-retail-balances > .krb-search', (e) => getComputedStyle(e).display), 'none', 'the client search steps aside');

  t.step('she hands over 1 200 MAD: the oldest note is settled, the next one gets the rest');
  await page.$eval('.krb-pay input', (e) => { e.value = ''; });
  await page.type('.krb-pay input', '1200');
  const covers = await page.$$eval('.krb-note-cover', (els) => els.map((e) => e.textContent));
  assert.deepEqual(covers, ['Soldée', 'Couvre 200.00 MAD']);
  await page.tap('.krb-go');
  let settled = await page.evaluate(() => window.__settled);
  assert.deepEqual(settled.at(-1), { customerId: 'c1', ids: ['n1', 'n2'], cents: 120000 }, 'the till gets both notes and the amount');

  t.step('untick the oldest: only the newer note, for what it owes');
  await (await page.$('.krb-note input')).tap();
  assert.equal(await page.$eval('.krb-go', (b) => b.textContent), 'Encaisser 600.00 MAD');
  await page.tap('.krb-go');
  settled = await page.evaluate(() => window.__settled);
  assert.deepEqual(settled.at(-1), { customerId: 'c1', ids: ['n2'], cents: 60000 });

  t.step('more than she owes is brought back to what she owes');
  await page.$eval('.krb-pay input', (e) => { e.value = ''; });
  await page.type('.krb-pay input', '5000');
  assert.equal(await page.$eval('.krb-hint', (e) => e.textContent), 'Elle ne doit que 1600.00 MAD');
  assert.equal(await page.$eval('.krb-go', (b) => b.textContent), 'Encaisser 1600.00 MAD');

  t.step('back to every client');
  await page.tap('.krb-back');
  assert.equal(await page.$$eval('.krb-card', (els) => els.length), 2);
});

await S.finish();
await browser.close();
server.close();
