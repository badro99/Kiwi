#!/usr/bin/env node
/* « Souvent avec… » sur une vraie caisse boutique appairée, au vrai clic.
 *
 * Le catalogue est fabriqué par le vrai assets/boutique-catalog.js (son
 * socle de démonstration, généré dans une page vierge), rangé dans la table
 * `catalogs` d'une base SQLite bâtie depuis schema.sql, puis servi à la caisse
 * par le VRAI gestionnaire /api/catalog. /api/pairs est le vrai aussi. Les
 * tickets du commerce associent la broche au foulard. Sur le ticket :
 *   · un foulard appelle la broche, avec la part réelle des tickets ;
 *   · « + » ouvre la fiche de la broche, comme un toucher dans la grille, et
 *     « Ajouter au ticket » la pose ; la suggestion passe à la suivante ;
 *   · « × » l'écarte de ce ticket ; vider le ticket repart de zéro ;
 *   · en anglais, la même suggestion dans la langue de la caisse.
 * Aucun code saisi. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as catalogApi from '../functions/api/catalog.js';
import * as pairsApi from '../functions/api/pairs.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const MERCHANT = 'pairs-boutique-test';
const AUTH_SECRET = 'pairs-boutique-secret';
const sql = new DatabaseSync(':memory:');
for (const stmt of fs.readFileSync(path.join(root, 'schema.sql'), 'utf8').replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) sql.exec(stmt);
const DB = {
  prepare(query) {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = sql.prepare(query).get(...args); return Promise.resolve(r === undefined ? null : r); },
      all() { return Promise.resolve({ results: sql.prepare(query).all(...args) }); },
      run() { const r = sql.prepare(query).run(...args); return Promise.resolve({ success: true, meta: { changes: r.changes } }); },
    };
    return st;
  },
  async batch(statements) { const out = []; for (const s of statements) out.push(await s.run()); return out; },
};
const env = { DB, AUTH_SECRET };
const now = Date.now();
sql.prepare("INSERT INTO merchant_config (merchant, features, name, type, updated_ts) VALUES (?, '{}', ?, 'boutique', ?)")
  .run(MERCHANT, 'Pairs Boutique', now);
const cookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/__blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset="utf-8"><title>blank</title>'); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const ID = {};
/* Le catalogue, tel que le vrai module l'écrit : son socle de démonstration,
   rangé ensuite sous le commerce de test. */
{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.goto(base + '/__blank');
  for (const f of ['assets/barcode.js', 'assets/color-palette.js', 'assets/boutique-catalog.js']) await page.addScriptTag({ url: '/' + f });
  const doc = await page.evaluate(() => { window.KiwiBoutiqueCatalog.use('maisonMansour'); return localStorage.getItem('kiwiBoutiqueCatalog:v1:maisonMansour'); });
  assert.ok(doc && JSON.parse(doc).products.length > 5, 'the catalogue module wrote its seed');
  sql.prepare('INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, 1, ?)').run(MERCHANT, doc, now);
  /* Un vrai magasin range ses articles sous leurs identifiants de base
     (prod_N) : ce sont eux que les tickets envoient (itemId). */
  const byName = (n) => { const p = JSON.parse(doc).products.find((x) => x.name === n); assert.ok(p, n); return p.id; };
  Object.assign(ID, { foulard: byName('Foulard soie'), broche: byName('Broche perles'), pochette: byName('Pochette sequins'), enfant: byName('Babouche enfant') });
  await ctx.close();
}
let seq = 0;
const L = (i, n) => ({ i, n, q: 1, t: 200 });
const sale = (lines) => { seq++; sql.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines) VALUES (?, ?, 400, 40000, 'card', 'Vente', ?, ?, ?)`)
  .run(`pq-${seq}`, MERCHANT, `B${seq}`, now - seq * 3600e3, JSON.stringify(lines)); };
// Foulard : 14 tickets, 12 avec la broche (86 %). Broche + pochette : 6 fois.
for (let k = 0; k < 12; k++) sale([L(ID.foulard, 'Foulard soie TU'), L(ID.broche, 'Broche perles TU')]);
for (let k = 0; k < 6; k++) sale([L(ID.broche, 'Broche perles TU'), L(ID.pochette, 'Pochette sequins TU')]);
for (let k = 0; k < 2; k++) sale([L(ID.foulard, 'Foulard soie TU'), L(ID.enfant, 'Babouche enfant 26')]);

const HANDLERS = { 'GET /api/catalog': catalogApi.onRequestGet, 'POST /api/catalog': catalogApi.onRequestPost, 'GET /api/pairs': pairsApi.onRequestGet };
let pairsStatus = [];
async function route(r) {
  const u = r.url();
  if (!u.startsWith(base + '/api/')) return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  const url = new URL(u);
  const handler = HANDLERS[r.method() + ' ' + url.pathname];
  if (!handler) return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
  const post = r.method() === 'POST';
  const request = new Request(url.toString().replace(base, 'https://kiwi-os.com'), {
    method: r.method(), body: post ? r.postData() : undefined,
    headers: Object.assign({ Cookie: cookie, Origin: 'https://kiwi-os.com' }, post ? { 'Content-Type': 'application/json' } : {}),
  });
  try {
    const res = await handler({ request, env, waitUntil() {} });
    if (url.pathname === '/api/pairs') pairsStatus.push(res.status);
    r.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
  } catch (e) { r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) }); }
}

async function openTill(lang) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => { route(r); });
  await page.evaluateOnNewDocument((m, l) => {
    localStorage.setItem('kiwiPaired', '1');
    localStorage.setItem('kiwiLiveMerchant', m);
    localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: m, type: 'boutique', name: 'Pairs Boutique', location: 'Casablanca' }));
    localStorage.setItem('kiwiCaisseLang', l);
  }, MERCHANT, lang);
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__kiwiCaisseBootedAsDemo === false, { timeout: 20000 });
  // La boutique a son propre écran d'ouverture (pos-boutique.js, #bq-clockin).
  await page.waitForSelector('#bqci-chips .ci-float-chip[data-float="300"]', { visible: true, timeout: 30000 });
  for (let k = 0; k < 20; k++) {
    await sleep(600); // l'écran d'ouverture arrive en fondu
    await page.click('#bqci-chips .ci-float-chip[data-float="300"]').catch(() => {});
    if (await page.evaluate(() => !document.getElementById('bqci-btn').disabled)) break;
  }
  await page.click('#bqci-btn');
  await page.waitForSelector(`[data-bq-item="${ID.foulard}"]`, { visible: true, timeout: 20000 });
  await page.waitForFunction(() => window.KiwiPairs && Object.keys(KiwiPairs._state().pairs || {}).length > 0, { timeout: 15000 });
  return { ctx, page, errors };
}
const pairRow = (page) => page.evaluate(() => {
  const r = document.querySelector('#bq-tk-lines .bq-pair');
  if (!r || !r.offsetParent) return null;
  /* En arabe, caisse-lang isole les nombres (U+2066…U+2069) : voulu, on lit le texte sans. */
  const plain = (el) => el.textContent.replace(/[\u2066-\u2069]/g, '');
  return { txt: plain(r.querySelector('.rp-pair-txt')), why: plain(r.querySelector('.rp-pair-why')),
    add: r.querySelector('[data-bq-pair-add]').dataset.bqPairAdd, addLabel: r.querySelector('[data-bq-pair-add]').getAttribute('aria-label') };
});
const ticket = (page) => page.evaluate(() => [...document.querySelectorAll('#bq-tk-lines .bq-line-name')].map((n) => n.textContent).join(', '));
const sheetOpen = (page) => page.evaluate(() => document.querySelector('#bq-sheet-veil')?.classList.contains('is-open'));
async function addFromGrid(page, pid) {
  /* Les tuiles entrent en cascade ; un toucher pendant l'entrée peut ne
     rien ouvrir. On retouche jusqu'à ce que la fiche s'ouvre. */
  for (let k = 0; k < 10 && !(await sheetOpen(page)); k++) {
    await page.click(`[data-bq-item="${pid}"]`);
    await sleep(400);
  }
  await page.waitForSelector('#bq-sheet-add:not([disabled])', { visible: true, timeout: 5000 });
  await sleep(250);
  await page.click('#bq-sheet-add');
  await page.waitForFunction(() => !document.querySelector('#bq-sheet-veil')?.classList.contains('is-open'), { timeout: 5000 });
  await sleep(200);
}

try {
  console.log('■ A paired boutique till, French');
  {
    const { ctx, page, errors } = await openTill('fr');
    check(true, 'the till boots as a real, paired boutique with its catalogue from the real /api/catalog');
    check(pairsStatus.length > 0 && pairsStatus.every((s) => s === 200), 'the real /api/pairs answers 200 to the paired till');
    check(await pairRow(page) === null, 'an empty ticket shows no suggestion');
    await addFromGrid(page, ID.foulard);
    let c = await pairRow(page);
    check(c && c.add === ID.broche && /Souvent avec Foulard soie · Broche perles/.test(c.txt), `a scarf calls the brooch (${c && c.txt})`);
    check(c && /^86 % des tickets avec Foulard soie · 28 derniers jours$/.test(c.why), `with the real share of tickets (${c && c.why})`);
    if (process.env.KIWI_PAIRS_SHOT) await page.screenshot({ path: process.env.KIWI_PAIRS_SHOT });
    await page.click('#bq-tk-lines [data-bq-pair-add]');
    await page.waitForSelector('#bq-sheet-add:not([disabled])', { visible: true, timeout: 5000 });
    const sheetTitle = await page.$eval('#bq-sheetm h3', (h) => h.textContent);
    check(sheetTitle === 'Broche perles', `« + » opens the brooch's sheet, like a tap in the grid (${sheetTitle})`);
    await sleep(250);
    await page.click('#bq-sheet-add');
    await page.waitForFunction(() => document.querySelectorAll('#bq-tk-lines .bq-line').length === 2, { timeout: 5000 });
    check(await ticket(page) === 'Foulard soie, Broche perles', `« Ajouter au ticket » puts it on the ticket (${await ticket(page)})`);
    c = await pairRow(page);
    check(c && c.add === ID.pochette, `then the brooch calls the sequin clutch (${c && c.txt})`);
    await page.click('#bq-tk-lines [data-bq-pair-dismiss]');
    await sleep(150);
    check(await pairRow(page) === null, '« × » sets it aside for this ticket, nothing else to suggest');
    check(await ticket(page) === 'Foulard soie, Broche perles', 'dismissing adds nothing');
    await page.click('#bq-tk-reset');
    await sleep(200);
    await addFromGrid(page, ID.foulard);
    await addFromGrid(page, ID.broche);
    c = await pairRow(page);
    check(c && c.add === ID.pochette, 'an emptied ticket starts over: what was set aside comes back on the next ticket');
    check(errors.length === 0, 'no script error on the till' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  for (const [lang, txt, why, add] of [
    ['en', /^Often with Foulard soie · Broche perles$/, /^86% of tickets with Foulard soie · last 28 days$/, 'Add Broche perles'],
    ['ar', /^غالباً مع Foulard soie · Broche perles$/, /^86% من التذاكر مع Foulard soie · آخر 28 يوماً$/, 'أضف Broche perles'],
  ]) {
    console.log(`■ The same suggestion in ${lang.toUpperCase()}`);
    const { ctx, page, errors } = await openTill(lang);
    await addFromGrid(page, ID.foulard);
    const c = await pairRow(page);
    check(c && txt.test(c.txt) && why.test(c.why) && c.addLabel === add,
      `in the till's language, names as the merchant wrote them (${c && c.txt} / ${c && c.why})`);
    if (process.env.KIWI_PAIRS_SHOT) await page.screenshot({ path: process.env.KIWI_PAIRS_SHOT.replace(/\.png$/, '-' + lang + '.png') });
    check(errors.length === 0, 'no script error' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  console.log(`\npairs-boutique-browser-test: ${checks} checks passed`);
} finally {
  await browser.close();
  server.close();
}
