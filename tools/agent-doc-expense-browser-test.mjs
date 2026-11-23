#!/usr/bin/env node
/* L'assistant · une facture fournisseur va aux dépenses, dans un vrai navigateur.
 *
 *   node tools/agent-doc-expense-browser-test.mjs
 *
 * Propriétaire, 23 nov. 2026 (Pasta Corner, facture Leader Formaggi FA26/11-00117) :
 * la carte « Facture fournisseur » n'offrait que le stock, et « add to expenses »
 * tapé ensuite répondait une généralité sur les charges fixes. Le banc charge
 * les vrais assets/agent-voice.js, assets/agent-doc-followup.js et
 * assets/expenses/index.js avec un Kiwi et un KiwiStore réduits (chaque écriture
 * gardée dans window.__writes). /api/ai/vision-inspect rend ce que le VRAI
 * validateur du serveur fait d'une réponse de modèle qui ne propose que le stock.
 *
 * Français seulement (navigateur, règle du 26 oct. 2026). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { validateVisionData } from '../functions/api/ai/vision-inspect.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

/* Le jour de la facture : le 1er du mois de Casablanca, jamais dans le futur. */
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit' }).format(new Date()) + '-01';
const MODEL = {
  docType: 'invoice', categoryLabel: 'Facture fournisseur', title: 'Facture LEADER Formaggi · 5 193,84 MAD', confidence: 0.98,
  summary: 'Facture du fournisseur LEADER Formaggi.',
  entities: { supplier: 'LEADER Formaggi', date: DAY, invoiceNumber: 'FA26/11-00117', totalMad: 5193.84, taxMad: 865.64,
    category: 'alimentation', paymentMethod: 'non_specifie',
    items: [{ name: 'PARMESAN L.S.M 1/32', qty: 22.77, unitPrice: 139, total: 3165.03 }, { name: 'MASCARPONE VIRGILIO 250GR', qty: 36, unitPrice: 28.5, total: 1026 }, { name: 'RICOTTA', qty: 2.365, unitPrice: 58, total: 137.17 }] },
  suggestedActions: [{ id: 'a1', type: 'stock-receive', label: 'Ajouter les articles au stock', primary: true }],
};
const READING = validateVisionData(MODEL, 'fr');
assert.ok(!READING.reviewNeeded, 'the bench invoice is a clean reading: ' + JSON.stringify(READING.reviewReasons));

const HARNESS = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/tokens.css">
<script>
(function () {
  var handlers = { 'stock-scan-invoice': function () {} };
  window.__writes = []; window.__toasts = [];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  window.Kiwi = {
    handlers: handlers,
    toast: function (msg) { window.__toasts.push(String(msg)); },
    modal: function (o) {
      var back = document.createElement('div'); back.className = 'kiwi-backdrop in';
      back.innerHTML = '<div class="kiwi-modal" role="dialog"><h3>' + esc(o.title) + '</h3><div class="kiwi-modal-body">' + (o.body || '') + '</div></div>';
      document.body.appendChild(back);
      var close = function () { back.remove(); };
      back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-dismiss]')) close(); });
      return { el: back, close: close };
    },
  };
  var docs = {};
  window.KiwiStore = {
    slugFor: function () { return 'pasta-bench'; },
    define: function (feature, opts) {
      docs[feature] = (opts.blank && opts.blank()) || {};
      return {
        get: function () { return docs[feature]; },
        set: function (d) { docs[feature] = d; window.__writes.push(JSON.parse(JSON.stringify(d))); return d; },
        subscribe: function () { return function () {}; },
      };
    },
  };
  window.KiwiI18n = { getLang: function () { return 'fr'; } };
  window.KiwiLang = { get: function () { return 'fr'; } };
})();
</script>
<script src="/assets/material-icons.js"></script>
<script src="/assets/agent-voice.js" defer></script>
<script src="/assets/agent-doc-followup.js" defer></script>
<script type="module" src="/assets/expenses/index.js"></script>
</head><body>
<div class="fa-thread"><div data-fa-thread></div></div>
<div class="fa-composer"><div class="fa-inputwrap"><input data-fa-input type="text"><button type="button" data-fa-send>Envoyer</button></div></div>
</body></html>`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/__doc.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HARNESS); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const T = suite('agent-doc-expense', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bench(t) {
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
      page.calls.push({ url: u, method: r.method(), type: r.headers()['content-type'] || '' });
      if (u.includes('/api/ai/vision-inspect')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: READING }) });
      if (u.includes('/api/expenses/receipt')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"key":"private/expenses/pasta-bench/x.jpg"}' });
      return r.respond({ status: 404, contentType: 'application/json', body: '{}' });
    }
    return u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:') ? r.continue() : r.abort();
  });
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/__doc.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.Kiwi.handlers['expense-from-doc'] && window.KiwiVision && document.querySelector('.kv-attach')), { timeout: 15000 });
  return page;
}
/* Le trombone puis Envoyer, avec une vraie photo JPEG. */
async function readInvoice(page) {
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 8, 8);
    window.KiwiVision.setAttachment(document.querySelector('.fa-inputwrap'), c.toDataURL('image/jpeg', 0.8), 'facture.jpg', 'image');
  });
  const n = await page.$$eval('.kv-msg-result', (els) => els.length);
  await page.click('[data-fa-send]');
  await page.waitForFunction((n) => document.querySelectorAll('.kv-msg-result').length > n, { timeout: 15000 }, n);
}
const buttons = (page) => page.evaluate(() => { const c = [...document.querySelectorAll('.kv-msg-result')].pop(); return [...c.querySelectorAll('[data-kv-action]')].map((b) => ({ type: b.dataset.kvAction, text: b.textContent.trim(), done: b.classList.contains('done'), disabled: b.disabled })); });
const type = async (page, text) => { await page.click('[data-fa-input]'); await page.type('[data-fa-input]', text); await page.keyboard.press('Enter'); await sleep(250); };
const bubbles = (page) => page.$$eval('[data-fa-thread] .fa-msg', (els) => els.map((m) => (m.classList.contains('user') ? 'user: ' : 'agent: ') + m.textContent.replace(/\s+/g, ' ').trim()));

await T.run('invoiceCard · une facture fournisseur offre le stock ET les dépenses', async (t) => {
  const page = await bench(t);
  await readInvoice(page);
  const b = await buttons(page);
  assert.deepEqual(b.map((x) => x.type), ['stock-receive', 'expense-add'], JSON.stringify(b));
  assert.equal(b[1].text, 'Ajouter aux dépenses');
  assert.deepEqual(page.errors, []);
});

await T.run('prefilledSheet · « Ajouter aux dépenses » ouvre la fiche remplie, à vérifier ; fermer sans enregistrer rend le bouton', async (t) => {
  const page = await bench(t);
  await readInvoice(page);
  await page.click('[data-kv-action="expense-add"]');
  await page.waitForSelector('.xp-sheet', { timeout: 15000 });
  const f = await page.$eval('.xp-sheet', (form) => ({
    amount: form.elements.amount.value, supplier: form.elements.supplier.value, date: form.elements.date.value, note: form.elements.note.value,
    verify: [...form.querySelectorAll('.xp-verify')].map((el) => el.name).sort(),
    cat: (form.querySelector('[data-cat][aria-pressed="true"]') || {}).dataset?.cat || '',
    photo: !form.querySelector('[data-xp-photo]').hidden,
  }));
  assert.deepEqual(f, { amount: '5193,84', supplier: 'LEADER Formaggi', date: DAY, note: 'Facture FA26/11-00117', verify: ['amount', 'date', 'supplier'], cat: 'grocery', photo: true });
  assert.equal(await page.$eval('.kv-msg-result [data-kv-action="expense-add"]', (b) => b.getAttribute('aria-busy')), 'true', 'the button waits while the sheet is open');
  await page.click('.xp-sheet [data-dismiss]');
  await sleep(300);
  const b = (await buttons(page)).find((x) => x.type === 'expense-add');
  assert.deepEqual(b, { type: 'expense-add', text: 'Ajouter aux dépenses', done: false, disabled: false }, 'closed without saving: clickable again');
  assert.equal(await page.$('.kv-act-status'), null, 'no failure line for a sheet the owner closed');
  assert.deepEqual(await page.evaluate(() => window.__writes.length), 0, 'nothing written');
  assert.deepEqual(page.errors, []);
});

await T.run('typedFollowUp · « add to expenses » tapé sous la carte, enregistré une fois, jamais deux', async (t) => {
  const page = await bench(t);
  await readInvoice(page);
  await type(page, 'add to expenses');
  await page.waitForSelector('.xp-sheet', { timeout: 15000 });
  assert.equal(await page.$eval('[data-fa-input]', (el) => el.value), '', 'the composer is cleared');
  assert.match((await bubbles(page)).pop(), /^user: add to expenses$/);
  await page.click('.xp-sheet [data-xp-act="save"]');
  await sleep(400);
  const w = await page.evaluate(() => window.__writes[window.__writes.length - 1]);
  const row = w.list.find((x) => !x.deleted);
  assert.equal(row.amountCents, 519384);
  assert.equal(row.vatCents, 86564);
  assert.equal(row.supplier, 'LEADER Formaggi');
  assert.equal(row.date, DAY);
  assert.equal(row.category, 'grocery');
  assert.equal(row.source, 'scan');
  assert.equal(row.note, 'Facture FA26/11-00117');
  await page.waitForFunction(() => window.__writes.some((d) => d.list.some((x) => x.receiptKey)), { timeout: 5000 });
  assert.ok(page.calls.some((c) => c.url.includes('/api/expenses/receipt') && c.method === 'POST' && /image\/jpeg/.test(c.type)), 'the invoice photo is kept as the receipt');
  const b = (await buttons(page)).find((x) => x.type === 'expense-add');
  assert.equal(b.done, true);
  assert.match(b.text, /Ajoutée aux dépenses/);

  await type(page, 'ajoute aux dépenses');
  assert.equal(await page.$('.xp-sheet'), null, 'no second sheet');
  assert.match((await bubbles(page)).pop(), /^agent: Ajoutée aux dépenses$/);
  assert.equal(await page.evaluate(() => window.__writes.length), 2, 'one save and its receipt key, nothing more');

  /* La même facture relue : elle s'ouvre, elle ne s'ajoute pas une seconde fois. */
  await readInvoice(page);
  await page.evaluate(() => [...document.querySelectorAll('.kv-msg-result')].pop().querySelector('[data-kv-action="expense-add"]').click());
  await page.waitForSelector('.xp-sheet', { timeout: 15000 });
  assert.ok((await page.evaluate(() => window.__toasts)).includes('Cette facture est déjà dans vos dépenses.'));
  assert.ok(await page.$('.xp-sheet [data-xp-act="delete"]'), 'the saved expense opens for editing');
  assert.deepEqual(page.errors, []);
});

await T.run('noCard · sans facture jointe, la demande dit quoi joindre ; une question reste à l’assistant', async (t) => {
  const page = await bench(t);
  await type(page, 'add to expenses');
  assert.equal(await page.$('.xp-sheet'), null);
  assert.match((await bubbles(page)).pop(), /^agent: Joignez d’abord la facture ou le ticket/);
  const before = (await bubbles(page)).length;
  await type(page, 'quelles sont mes dépenses ?');
  assert.equal((await bubbles(page)).length, before, 'a question is not taken by the follow-up');
  assert.deepEqual(page.errors, []);
});

await T.finish();
