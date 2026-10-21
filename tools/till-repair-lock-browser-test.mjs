#!/usr/bin/env node
/* Une caisse dépairée ou réappairée à un autre commerce EN PLEIN SERVICE,
 * dans un vrai navigateur.
 *
 * Deux commerces inventés, qui n'existent que dans ce test : « Bistro Alpha »
 * (A) et « Bistro Beta » (B). Les codes d'appairage sont des réponses simulées
 * de /api/pair/redeem ; aucun vrai commerce, aucun vrai code.
 *
 * La caisse s'ouvre chez A, ouvre une table (un plat témoin), encaisse une
 * vente que /api/sale refuse (503 : elle reste à synchroniser). Puis :
 *   1 · dépairée en plein service, page ouverte : un écran plein la verrouille,
 *       rien ne part, et son unique action la ramène chez A, service intact ;
 *   2 · le pavé « réappairer » reçoit le code de B : la page redémarre
 *       (pos-dispatch), B s'ouvre vide, et réappairer à A rend le service mis
 *       de côté, après rechargement ;
 *   3 · dépairée, puis un passage d'appairage pose B : même exigence.
 * Chaque requête qui quitte la page est enregistrée. Le test exige qu'une fois
 * la caisse posée chez B, aucune ne porte une donnée de A (son slug, son nom,
 * la vente, le plat), que la vente de A en file ne parte pas chez B, et que le
 * personnel de B ne voie aucune addition de A. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as menuApi from '../functions/api/menu.js';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const A = { merchant: 'lock-test-alpha', name: 'Bistro Alpha', type: 'restaurant', location: 'Casablanca' };
const B = { merchant: 'lock-test-beta', name: 'Bistro Beta', type: 'restaurant', location: 'Rabat' };
const CODE = { '111111': B, '222222': A };   // réponses simulées, pas de vrais codes
const DISH = 'Tajine témoin';
const SALE_LABEL = 'Vente témoin';
const AUTH_SECRET = 'till-lock-browser-secret';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const DB = {
  prepare(query) {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = sql.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: sql.prepare(query).all(...args) }; },
      run() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  },
  async batch(statements) { const out = []; for (const s of statements) out.push(await s.run()); return out; },
};
const env = { DB, AUTH_SECRET };
const now = Date.now();
for (const v of [A, B]) {
  sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)').run(v.merchant, '{}', v.name, now);
  const menu = { cats: [{ id: 'cat_p', name: 'Plats' }], items: [
    { id: 'it_tajine', name: v === A ? DISH : 'Couscous', price: 137, catId: 'cat_p', avail: true },
    { id: 'it_the', name: 'Thé', price: 12, catId: 'cat_p', avail: true },
  ] };
  sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)').run(v.merchant, v.name, 'restaurant', JSON.stringify(menu), now);
}
const cookies = {};
for (const v of [A, B]) cookies[v.merchant] = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, v.merchant)}`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const S = suite('till-repair-lock', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { if (!yes) throw new Error(msg); checks++; console.log('  ✓ ' + msg); };

/* Le réseau, tel que la page le voit. `phase` dit à quel commerce la caisse
   est en train d'être appairée au moment où la requête part. */
let phase = 'A';
const log = [];
async function route(r) {
  const u = r.url();
  if (!u.startsWith(base + '/api/')) return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  const url = new URL(u);
  log.push({ phase, method: r.method(), path: url.pathname, url: u, body: r.postData() || '' });
  const json = (status, body) => r.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname === '/api/pair/redeem' && r.method() === 'POST') {
    let code = '';
    try { code = JSON.parse(r.postData() || '{}').code; } catch (_) {}
    const v = CODE[code];
    return v ? json(200, { ok: true, ...v }) : json(422, { ok: false, error: 'invalid' });
  }
  if (url.pathname === '/api/pair/state') return json(200, { ok: true, paired: true });
  if (url.pathname === '/api/sale') return json(503, { ok: false, error: 'unavailable' });   // la vente reste à synchroniser
  if (url.pathname === '/api/menu' && r.method() === 'GET') {
    const m = url.searchParams.get('merchant') || A.merchant;
    const request = new Request(url.toString().replace(base, 'https://kiwi-os.com'), { headers: { Cookie: cookies[m] || cookies[A.merchant] } });
    try {
      const res = await menuApi.onRequestGet({ request, env, waitUntil() {} });
      return r.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
    } catch (e) { return json(500, { error: String(e && e.message) }); }
  }
  return json(404, { error: 'not-found' });
}

/* Ce qui identifie A dans une requête. Les identifiants de la vente sont
   ajoutés dès qu'elle existe. */
const aMarks = [A.merchant, A.name, DISH, SALE_LABEL];
const carriesA = (e) => aMarks.some((m) => m && (e.url.includes(encodeURIComponent(m)) || e.url.includes(m) || e.body.includes(m)));
const since = (n) => log.slice(n);
/* Une requête de A partie AVANT que l'appairage à B soit posé est du trafic
   de A, avec la preuve de A : la page ne savait pas encore. La bascule est
   posée quand la caisse confirme sa preuve auprès du serveur
   (/api/pair/recover, juste après applyPairing) ; c'est de là qu'on compte. */
const committedAt = (from) => {
  const r = log.findIndex((e, i) => i >= from && e.path === '/api/pair/redeem');
  if (r < 0) return from;
  const c = log.findIndex((e, i) => i > r && e.path === '/api/pair/recover');
  return c < 0 ? r : c;
};

async function openA(page) {
  await page.waitForFunction(() => window.__kiwiCaisseBootedAsDemo === false, { timeout: 20000 });
  await page.waitForSelector('.ci-float-chip[data-float="300"]', { visible: true, timeout: 15000 });
  await sleep(600);
  for (let i = 0; i < 6; i++) {
    await page.click('.ci-float-chip[data-float="300"]').catch(() => {});
    if (await page.evaluate(() => !document.getElementById('clockin-btn').disabled)) break;
    await sleep(300);
  }
  await page.click('#clockin-btn');
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await sleep(800);
}
async function typeCode(page, code) {
  await page.waitForSelector('#cp-screen [data-cp="1"]', { visible: true, timeout: 5000 });
  for (const d of code) { await page.click(`#cp-screen [data-cp="${d}"]`); await sleep(60); }
}
const lockState = (page) => page.evaluate(() => {
  const el = document.getElementById('tt-lock');
  if (!el || el.hidden || !el.isConnected) return null;
  const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  const others = Array.from(document.body.children).filter((c) => c !== el && c.id !== 'cp-screen' && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE');
  return {
    text: el.innerText,
    dir: el.getAttribute('dir'),
    icon: !!el.querySelector('svg[data-material-symbol="lock"]'),
    drawnPaths: Array.from(el.querySelectorAll('svg')).filter((s) => !s.hasAttribute('data-material-symbol')).length,
    covers: !!(hit && el.contains(hit)),
    inert: others.length > 0 && others.every((c) => c.inert),
  };
});
const serviceState = (page) => page.evaluate((dish) => ({
  open: !!shiftOpenedAt,
  owner: typeof shiftMerchant === 'string' ? shiftMerchant : '',
  sale: journal.filter((e) => e.label === 'Vente témoin').map((e) => ({ id: e.id, ref: e.ref, merchant: e.merchant || '' }))[0] || null,
  tableWithDish: Object.keys(tableOrders).find((id) => (tableOrders[id] || []).some((l) => l.name === dish)) || '',
}), DISH);

await S.run('re-pair mid-service: lock, no leak, pair back restores', async (t) => {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => { route(r); });
  /* Ce que la page ÉMET, horodaté, sous le filet de assets/till-tenant.js
     (posé avant lui, donc au plus près du réseau) : une requête partie juste
     avant la bascule et arrivée juste après ne se confond pas avec une fuite. */
  await page.evaluateOnNewDocument(() => {
    const out = window.__issued = [];
    const push = (url) => { try { out.push({ t: Date.now(), url: String(url && url.url ? url.url : url) }); } catch (_) {} };
    const f = window.fetch;
    window.fetch = function (input) { push(input); return f.apply(this, arguments); };
    const o = XMLHttpRequest.prototype.open, sd = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, url) { this.__u = url; return o.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () { push(this.__u); return sd.apply(this, arguments); };
    if (navigator.sendBeacon) { const b = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (url) { push(url); return b.apply(null, arguments); }; }
  });
  await page.evaluateOnNewDocument((v) => {
    if (sessionStorage.getItem('lock-test-seeded')) return;   // un rechargement garde l'état de la page
    sessionStorage.setItem('lock-test-seeded', '1');
    localStorage.setItem('kiwiDemos', '0');                     // la caisse se comporte comme hébergée
    localStorage.setItem('kiwiPaired', '1');
    localStorage.setItem('kiwiLiveMerchant', v.a.merchant);
    localStorage.setItem('kiwiPairedVenue', JSON.stringify(v.a));
    /* Le plan de salle de chaque commerce, comme le miroir du concepteur du
       tableau de bord le pose dans ce navigateur. */
    const plan = (zone, nums) => JSON.stringify({ zones: [{ id: 'z1', name: zone }],
      tables: nums.map((num) => ({ id: num.toLowerCase(), num, zone: 'z1', seats: 4, status: 'free' })), elements: [] });
    localStorage.setItem('kiwiPlanDeSalle:slug:' + v.a.merchant, plan('Salle', ['A1', 'A2']));
    localStorage.setItem('kiwiPlanDeSalle:slug:' + v.b.merchant, plan('Salle', ['B1', 'B2']));
  }, { a: A, b: B });

  t.step('open the service at A, a table, an unsynced sale');
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await openA(page);
  const tableId = await page.evaluate(() => Object.keys(tables)[0] || '');
  check(!!tableId, `the till has a floor to seat (table ${tableId})`);
  await page.waitForFunction(() => Array.isArray(menuItems) && menuItems.some((m) => m.id === 'it_tajine'), { timeout: 15000 });
  await page.evaluate((id) => { openTable(id); addToTableOrder(id, 'it_tajine'); }, tableId);
  await page.evaluate((label, dish) => recordSale(137, 'cash', label, 0, [{ id: 'it_tajine', name: dish, qty: 1, price: 137, total: 137 }], null), SALE_LABEL, DISH);
  await sleep(1500);
  let st = await serviceState(page);
  check(st.open && st.owner === A.merchant, 'the service is open at A');
  check(!!st.tableWithDish, `table ${st.tableWithDish} carries ${DISH}`);
  check(st.sale && st.sale.merchant === A.merchant, 'the sale records, on its journal line, the store it was rung at');
  aMarks.push(st.sale.id, st.sale.ref);
  check(log.some((e) => e.path === '/api/sale'), 'the sale tried /api/sale and was refused (it stays unsynced)');

  const quarantined = () => page.evaluate((a) => !!localStorage.getItem('kiwiQuarantine:shift:' + a), A.merchant);
  const noApi = async (t0, what) => {
    const out = await page.evaluate((t) => window.__issued.filter((e) => e.t >= t && /\/api\//.test(e.url) && !/\/api\/pair\//.test(e.url)).map((e) => e.url), t0);
    check(out.length === 0, `${what}: no /api request leaves the page (${out.join(', ') || 'none'})`);
  };
  const noA = (from, what) => {
    const out = since(committedAt(from)).filter((e) => e.path !== '/api/pair/redeem').filter(carriesA);
    check(out.length === 0, `${what}: nothing sent carries A’s data (${out.map((e) => e.method + ' ' + e.path).join(', ') || 'clean'})`);
  };
  /* Une bascule de commerce redémarre la page, parfois deux fois de suite
     (pos-dispatch, puis la reprise du service mis de côté) : on attend l'état
     voulu en traversant les navigations. */
  async function settle(fn, arg, ms = 30000) {
    const end = Date.now() + ms;
    for (;;) {
      try { if (await page.evaluate(fn, arg)) return; } catch (_) {}
      if (Date.now() > end) throw new Error('timed out waiting for the page to settle');
      await sleep(250);
    }
  }
  const fire = (code) => page.evaluate((c) => { setTimeout(() => KiwiCaissePairing.redeem(c), 0); }, code);
  const waitLock = () => page.waitForFunction(() => { const el = document.getElementById('tt-lock'); return el && !el.hidden; }, { timeout: 5000 });
  /* Une caisse appairée chez B après la bascule : rien de A en mémoire, à
     l'écran ni sur le réseau, et la vente de A en file ne part pas. */
  async function assertCleanAtB(from, what) {
    await page.waitForFunction(() => window.__kiwiCaisseBootedAsDemo === false, { timeout: 20000 });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('kiwiPairedVenue') || '{}').merchant === 'lock-test-beta', { timeout: 8000 });
    await sleep(12000);   // autosave (5 s), salle (4 s), relecture des ventes : tout a eu le temps de partir
    const s = await serviceState(page);
    check(!s.open && !s.sale && !s.tableWithDish, `${what}: none of A’s service is in B’s till`);
    check(!(await page.evaluate(() => document.body.innerText)).includes(DISH), `${what}: B’s staff see none of A’s bills`);
    noA(from, what);
    const sold = since(committedAt(from)).filter((e) => e.path === '/api/sale');
    check(!sold.some(carriesA), `${what}: A’s queued sale does not leave under B (${sold.length} sale request(s) after the switch, none of A)`);
    check(await quarantined(), `${what}: A’s service stays set aside on the device`);
  }

  /* ── 1 · dépairer en plein service, page ouverte ───────────────────────── */
  t.step('unpair mid-service, no reload');
  let mark = log.length;
  phase = 'none';
  const unpairedAt = await page.evaluate(() => { const t = Date.now(); KiwiCaissePairing.unpair(); return t; });
  await waitLock();
  check(await quarantined(), 'A’s service was set aside before the purge');
  await sleep(12000);
  let lock = await lockState(page);
  check(lock && lock.covers, 'a full-screen lock covers the till, above the pairing pad');
  check(lock.inert, 'everything under it is inert: no PIN pad, no floor, no bill can be reached');
  check(lock.icon && lock.drawnPaths === 0, 'its icons are Material Symbols, nothing hand-drawn');
  check(/Caisse verrouillée/.test(lock.text) && /Réappairer à Bistro Alpha/.test(lock.text), 'it explains, in French, and names the store to pair back to');
  check(!lock.text.includes('—'), 'no em dash in its copy');
  check(!lock.text.includes(DISH) && !lock.text.includes(SALE_LABEL), 'it shows none of A’s bills');
  await noApi(unpairedAt, 'locked');
  noA(mark, 'locked');
  const held = await page.evaluate(() => KiwiTillTenant.blocked());
  t.notice('calls held back while locked: ' + (held.length ? Array.from(new Set(held)).join(', ') : 'none'));

  t.step('the lock speaks English and Arabic');
  await page.evaluate(() => KiwiCaisseLang.set('en'));
  await sleep(900);
  lock = await lockState(page);
  check(/Till locked/.test(lock.text) && /Pair back to Bistro Alpha/.test(lock.text) && !lock.text.includes('—'), 'English copy');
  await page.evaluate(() => KiwiCaisseLang.set('ar'));
  await sleep(900);
  lock = await lockState(page);
  check(/الصندوق مقفل/.test(lock.text) && lock.dir === 'rtl' && !lock.text.includes('—'), 'Arabic copy, right to left');
  await page.evaluate(() => KiwiCaisseLang.set('fr'));
  await sleep(900);

  t.step('pair back to A from the lock, no reload');
  await page.click('#tt-lock [data-tt-relink]');
  await page.waitForSelector('#cp-screen', { visible: true, timeout: 5000 });
  check((await page.$eval('#cp-screen', (n) => n.innerText)).includes(A.name), 'its single action opens the pad, naming the original store');
  const loads = t.loads(page).length;
  mark = log.length;
  phase = 'A';
  await typeCode(page, '222222');
  await page.waitForFunction(() => !document.getElementById('tt-lock'), { timeout: 5000 });
  await sleep(7000);
  check(t.loads(page).length === loads, 'pairing back to the same store keeps the page');
  st = await serviceState(page);
  check(st.open && st.owner === A.merchant && st.sale && st.tableWithDish, 'back at A, the service is whole: the table and the unsynced sale');
  check(!(await quarantined()), 'the set-aside copy is dropped once the service is home again');
  let sales = since(mark).filter((e) => e.path === '/api/sale');
  check(sales.length > 0 && sales.every((e) => e.body.includes(A.merchant) && !e.body.includes(B.merchant)), 'the sale goes back out, to A only');

  /* ── 2 · le pavé « réappairer » reçoit le code de B ────────────────────── */
  t.step('the re-pair pad gets B’s code mid-service');
  await page.evaluate(() => KiwiCaissePairing.repairWithCode());
  mark = log.length;
  phase = 'B';
  const nav = page.waitForNavigation({ waitUntil: 'load', timeout: 20000 });
  await typeCode(page, '111111');
  await nav;
  check(true, 'switching store restarts the page (pos-dispatch), so A’s service cannot keep running under B');
  await assertCleanAtB(mark, 'switched to B');
  check(!(await lockState(page)), 'B’s till starts empty, nothing to lock');

  t.step('pair back to A after the switch');
  mark = log.length;
  phase = 'A';
  await fire('222222');
  await settle(() => window.__kiwiCaisseBootedAsDemo === false && typeof shiftOpenedAt !== 'undefined' && !!shiftOpenedAt
    && JSON.parse(localStorage.getItem('kiwiPairedVenue') || '{}').merchant === 'lock-test-alpha');
  await sleep(7000);
  st = await serviceState(page);
  check(st.open && st.owner === A.merchant && st.sale && st.tableWithDish, 'paired back to A: the set-aside service comes back, table and sale');
  check(!(await quarantined()), 'and the set-aside copy is consumed');
  sales = since(mark).filter((e) => e.path === '/api/sale');
  check(sales.length > 0 && sales.every((e) => e.body.includes(A.merchant)), 'its sale goes out to A');

  /* ── 3 · dépairer, puis le passage d'appairage pose B ──────────────────── */
  t.step('unpair, then a hand-off pairs B');
  mark = log.length;
  phase = 'B';
  const unpairedAgain = await page.evaluate(() => { const t = Date.now(); KiwiCaissePairing.unpair(); return t; });
  await waitLock();
  await sleep(6000);
  await noApi(unpairedAgain, 'unpaired, locked');
  await fire('111111');
  await settle(() => window.__kiwiCaisseBootedAsDemo === false
    && JSON.parse(localStorage.getItem('kiwiPairedVenue') || '{}').merchant === 'lock-test-beta');
  await assertCleanAtB(mark, 'unpaired then paired to B');

  /* Tout ce qui est parti une fois la caisse posée chez B, sur l'ensemble du
     parcours : après un /api/pair/redeem vers B ET la confirmation qui le
     suit. */
  const reachedB = log.filter((e, i) => {
    if (e.phase !== 'B' || e.path.startsWith('/api/pair/')) return false;
    let r = -1;
    for (let k = i; k >= 0; k--) if (log[k].path === '/api/pair/redeem') { r = k; break; }
    if (r < 0 || log[r].phase !== 'B') return false;
    for (let k = r + 1; k <= i; k++) if (log[k].path === '/api/pair/recover') return true;
    return false;
  });
  check(reachedB.length > 0 && !reachedB.some(carriesA), `over the whole run, ${reachedB.length} requests reached B and none carried A’s data`);

  check(errors.length === 0, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\ntill-repair-lock-browser-test: ${checks} checks passed`);
});

await new Promise((r) => server.close(r));
await S.finish();
