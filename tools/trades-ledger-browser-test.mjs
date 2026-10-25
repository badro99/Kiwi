#!/usr/bin/env node
/* Kiwi · trades-ledger-browser-test — the twelve specialist tills, rung for real.
 *   node tools/trades-ledger-browser-test.mjs                 (food trades)
 *   node tools/trades-ledger-retail-browser-test.mjs          (retail trades)
 *   node tools/trades-ledger-care-browser-test.mjs            (care trades)
 *   KIWI_TRADES_ONLY=pizzeria,spa node tools/trades-ledger-browser-test.mjs
 *
 * Twelve métier tills (assets/pos-<trade>.js) have never served a real store.
 * Nobody had proven that a sale rung on one of them reaches the server and the
 * owner's dashboard to the centime. This suite does, on the real product, the
 * same way tools/sync-ledger-browser-test.mjs does for the restaurant and the
 * boutique:
 *
 *   tools/kiwi-local-stack.mjs (every Pages Function + a D1 shim over sqlite,
 *   a fresh database per run) · one merchant per trade created through the
 *   real signup and onboarding wizard (the trade picked by its card) · a small
 *   catalogue with centimes given the way the merchant gives it (the carte
 *   published on /api/menu for food, the shared boutique catalogue for retail,
 *   the `workspaces` document for care) · a till paired through the
 *   dashboard's own hand-off and unlocked with the owner's code · sales rung
 *   by real taps, cash and card.
 *
 * Then, to the centime: the D1 sales rows (amount_cents, method), the
 * dashboard Home revenue and order count, and the Transactions list.
 *
 * Three halves (KIWI_TRADES_PART = food | retail | care), so each stays well
 * inside check.js's five minutes per suite. Synthetic data only: a temp
 * database, `TEST KIWI …` merchants, staff codes random per run and never
 * printed (browser-trace secret handles). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { suite, secret, InfraError } from './browser-trace.mjs';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(ROOT, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ trades-ledger not run: puppeteer-core unavailable (not counted as passed)'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ trades-ledger not run: Chromium unavailable (not counted as passed)'); process.exit(process.env.CI ? 1 : 0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VERBOSE = !!process.env.KIWI_SYNC_VERBOSE;
const log = (...a) => { if (VERBOSE) console.log('   ·', ...a); };
const PART = ['retail', 'care'].includes(process.env.KIWI_TRADES_PART) ? process.env.KIWI_TRADES_PART : 'food';
const ONLY = (process.env.KIWI_TRADES_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);

/* ── the local stack (as in sync-ledger-browser-test.mjs) ─────────────── */
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function startStack() {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-trades-ledger-'));
  const dbFile = path.join(dir, 'd1.sqlite');
  const child = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'tools/kiwi-local-stack.mjs'), '--reset'], {
    cwd: ROOT, env: { ...process.env, KIWI_STACK_PORT: String(port), KIWI_STACK_DB: dbFile }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const errors = [];
  child.stderr.on('data', (d) => { const s = String(d); errors.push(s); if (VERBOSE) process.stderr.write('[stack] ' + s); });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new InfraError('local stack did not start in 30 s')), 30000);
    child.stdout.on('data', (d) => { if (/Kiwi local stack/.test(String(d))) { clearTimeout(t); resolve(); } });
    child.on('exit', (code) => { clearTimeout(t); reject(new InfraError('local stack exited ' + code + ': ' + errors.join('').slice(-400))); });
  });
  const db = new DatabaseSync(dbFile, { timeout: 10000 });
  return {
    base: `http://localhost:${port}`, db, errors,
    stop() { try { db.close(); } catch (_) {} child.kill('SIGTERM'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} },
  };
}

/* ── the trades ───────────────────────────────────────────────────────── */
/* `type` is the onboarding card (assets/trades.js), `base` its parent type,
 * `vertical` the till module the paired tablet opens (assets/caisse-pairing.js
 * routeFor: bakery → boulangerie, sport → gym). Prices carry centimes so a
 * rounding to the dirham shows. */
const FOOD = (cats, items, opts) => ({ kind: 'menu', cats, items, opts: opts || [] });
const RETAIL = (items) => ({ kind: 'catalog', items });
const CARE = (board, items) => ({ kind: 'workspaces', board, items });
const TRADES = [
  { vertical: 'pizzeria', type: 'pizzeria', base: 'restaurant', part: 'food',
    catalogue: FOOD([{ id: 'pc1', name: 'Pizzas' }, { id: 'pc2', name: 'Boissons' }], [
      { id: 'pz1', name: 'TEST Margherita', price: 62.5, catId: 'pc1', opts: ['pzg'] },
      { id: 'pz2', name: 'TEST Soda citron', price: 12.25, catId: 'pc2' },
    ], [{ id: 'pzg', name: 'Taille', kind: 'one', required: true, choices: [{ id: 'pzm', name: 'Moyenne', price: 0 }, { id: 'pzl', name: 'Grande', price: 15.25 }] }]),
    sales: [{ items: ['TEST Margherita', 'TEST Soda citron'], tender: 'cash', cents: 6250 + 1225 },
      { items: ['TEST Soda citron'], tender: 'card', cents: 1225 }] },
  { vertical: 'boulangerie', type: 'bakery', base: 'restaurant', part: 'food',
    catalogue: FOOD([{ id: 'bc1', name: 'Viennoiseries' }], [
      { id: 'bl1', name: 'TEST Croissant', price: 3.75, catId: 'bc1' },
      { id: 'bl2', name: 'TEST Tarte citron', price: 27.4, catId: 'bc1' },
    ]),
    sales: [{ items: ['TEST Croissant', 'TEST Croissant', 'TEST Tarte citron'], tender: 'cash', cents: 375 * 2 + 2740 },
      { items: ['TEST Tarte citron'], tender: 'card', cents: 2740 }] },
  { vertical: 'fastfood', type: 'fastfood', base: 'restaurant', part: 'food',
    catalogue: FOOD([{ id: 'fc1', name: 'Burgers' }], [
      { id: 'ff1', name: 'TEST Burger poulet', price: 45.5, catId: 'fc1' },
      { id: 'ff2', name: 'TEST Frites', price: 14.25, catId: 'fc1' },
    ]),
    sales: [{ items: ['TEST Burger poulet', 'TEST Frites'], tender: 'cash', cents: 4550 + 1425 },
      { items: ['TEST Frites'], tender: 'card', cents: 1425 }] },
  { vertical: 'foodtruck', type: 'foodtruck', base: 'restaurant', part: 'food',
    catalogue: FOOD([{ id: 'tc1', name: 'Street food' }], [
      { id: 'ft1', name: 'TEST Tacos kefta', price: 38.5, catId: 'tc1' },
      { id: 'ft2', name: 'TEST Jus orange', price: 9.75, catId: 'tc1' },
    ]),
    sales: [{ items: ['TEST Tacos kefta', 'TEST Jus orange'], tender: 'cash', cents: 3850 + 975 },
      { items: ['TEST Jus orange'], tender: 'card', cents: 975 }] },
  { vertical: 'traiteur', type: 'traiteur', base: 'restaurant', part: 'food',
    catalogue: FOOD([{ id: 'rc1', name: 'Plats' }], [
      { id: 'tr1', name: 'TEST Pastilla volaille', price: 18.75, catId: 'rc1' },
    ]),
    /* A caterer takes no counter sale: a quote becomes an event, and the money
     * comes in as deposits (pos-traiteur.js). 18,75 × 100 guests = 1 875 MAD;
     * the first deposit is 30 % (562,50), rounded to the dirham by design. */
    sales: [{ deposit: true, items: ['TEST Pastilla volaille'], tender: 'cash', cents: Math.round(1875 * 30 / 100) * 100 }] },

  { vertical: 'epicerie', type: 'epicerie', base: 'boutique', part: 'retail',
    catalogue: RETAIL([{ name: 'TEST Huile olive 1L', price: 64.9 }, { name: 'TEST Lait 1L', price: 7.25 }]),
    sales: [{ items: ['TEST Huile olive 1L', 'TEST Lait 1L'], tender: 'cash', cents: 6490 + 725 },
      { items: ['TEST Lait 1L'], tender: 'card', cents: 725 }] },
  { vertical: 'pharmacie', type: 'pharmacie', base: 'boutique', part: 'retail',
    catalogue: RETAIL([{ name: 'TEST Doliprane 1g', price: 19.6 }, { name: 'TEST Sirop toux', price: 42.35 }]),
    sales: [{ items: ['TEST Doliprane 1g', 'TEST Sirop toux'], tender: 'cash', cents: 1960 + 4235 },
      { items: ['TEST Doliprane 1g'], tender: 'card', cents: 1960 }] },
  { vertical: 'librairie', type: 'librairie', base: 'boutique', part: 'retail',
    catalogue: RETAIL([{ name: 'TEST Cahier 96p', price: 12.5 }, { name: 'TEST Roman poche', price: 79.95 }]),
    sales: [{ items: ['TEST Cahier 96p', 'TEST Roman poche'], tender: 'cash', cents: 1250 + 7995 },
      { items: ['TEST Cahier 96p'], tender: 'card', cents: 1250 }] },
  { vertical: 'fleuriste', type: 'fleuriste', base: 'boutique', part: 'retail',
    catalogue: RETAIL([{ name: 'TEST Rose rouge', price: 8.5 }, { name: 'TEST Tulipe', price: 6.25 }]),
    sales: [{ items: ['TEST Rose rouge', 'TEST Tulipe'], tender: 'cash', cents: 850 + 625 },
      { items: ['TEST Tulipe'], tender: 'card', cents: 625 }] },

  { vertical: 'coiffure', type: 'coiffure', base: 'spa', part: 'care',
    catalogue: CARE('services', [{ title: 'TEST Coupe brushing', price: 120.5, durationMinutes: 45, category: 'Coupe' }]),
    sales: [{ items: ['TEST Coupe brushing'], tender: 'cash', cents: 12050 },
      { items: ['TEST Coupe brushing'], tender: 'card', cents: 12050 }] },
  { vertical: 'spa', type: 'spa', base: 'spa', part: 'care',
    catalogue: CARE('services', [{ title: 'TEST Hammam gommage', price: 180.75, durationMinutes: 60, category: 'Hammam' }]),
    sales: [{ items: ['TEST Hammam gommage'], tender: 'cash', cents: 18075 },
      { items: ['TEST Hammam gommage'], tender: 'card', cents: 18075 }] },
  { vertical: 'gym', type: 'sport', base: 'spa', part: 'care',
    catalogue: CARE('shop', [{ title: 'TEST Pass journée', price: 49.5, kind: 'pass', persons: 1 }]),
    sales: [{ items: ['TEST Pass journée'], tender: 'cash', cents: 4950 },
      { items: ['TEST Pass journée'], tender: 'card', cents: 4950 }] },
];

const stack = await startStack();
const base = stack.base;
const browser = await puppeteer.launch({
  executablePath: bin, headless: true,
  args: ['--no-sandbox', '--lang=fr-FR', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'],
}).catch((e) => { stack.stop(); throw new InfraError('Chromium did not launch: ' + e.message); });
const S = suite(PART === 'food' ? 'trades-ledger' : 'trades-ledger-' + PART, { browser });
process.on('exit', () => { try { stack.stop(); } catch (_) {} });

/* ── one merchant: account, store, codes ──────────────────────────────── */
const digits = () => String(crypto.randomInt(1000, 9999));
function merchant(tr) {
  const raw = digits();
  const label = tr.vertical;
  return {
    label, type: tr.type, base: tr.base,
    email: `${label}.${crypto.randomBytes(3).toString('hex')}@trades.test`,
    password: 'local-' + crypto.randomBytes(9).toString('base64url'),
    business: `TEST KIWI ${label[0].toUpperCase() + label.slice(1)} Ledger`,
    pin: secret(label + '-owner-code', raw),
    _pin: raw,                      // typed on keypads only, never logged
    slug: '',
  };
}

async function preparePage(t, page, viewport = { width: 1180, height: 820 }) {
  t.watch(page);
  await page.setViewport(viewport);
  await page.setBypassServiceWorker(true);
  await page.emulateTimezone('Africa/Casablanca');
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  if (VERBOSE) page.on('pageerror', (e) => log('pageerror', String(e && e.stack || e).split('\n').slice(0, 4).join(' / ')));
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('kiwiDemos', '0'); localStorage.setItem('kiwiLang', 'fr'); } catch (_) {}
    try { window.print = () => {}; } catch (_) {}
    /* The caterer's quote leaves through WhatsApp (window.open wa.me): no tab. */
    try { window.open = () => null; } catch (_) {}
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  });
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(60000);
  return page;
}
async function api(page, method, url, body) {
  return page.evaluate(async (m, u, b) => {
    const r = await fetch(u, { method: m, credentials: 'same-origin', headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, body: j };
  }, method, url, body || null);
}
async function signIn(page, m) {
  // coverage: surface=dashboard locale=fr viewport=desktop
  if (!/^http/.test(page.url())) await page.goto(base + '/dashboard.html', { waitUntil: 'domcontentloaded' });
  const r = await api(page, 'POST', '/auth/login', { email: m.email, password: m.password });
  if (r.status !== 200) throw new Error(`sign-in ${m.label}: ${r.status} ${JSON.stringify(r.body)}`);
}
async function clickSel(page, sel, opts = {}) {
  for (let i = 0; ; i++) {
    const el = await page.waitForSelector(sel, { visible: true, timeout: opts.timeout || 20000 });
    try { await el.click(); return; } catch (e) {
      if (i >= 4 || !/detached|not clickable|not an Element|no longer|Node is either/i.test(e.message)) throw e;
      await sleep(300);
    }
  }
}
async function typeDigits(page, keySel, value) {
  for (const d of value) { await clickSel(page, keySel.replace('%', d)); await sleep(90); }
}
async function clickText(page, scope, re) {
  for (let i = 0; i < 8; i++) {
    if (await markText(page, scope, re)) {
      const el = await page.$('[data-sl-tap]');
      try { if (el && await el.isVisible()) { await el.click(); return; } } catch (_) {}
    }
    await sleep(600);
  }
  throw new Error('nothing to click matching ' + re + ' in ' + scope);
}
async function markText(page, scope, re) {
  return page.evaluate((s, src) => {
    const rx = new RegExp(src);
    const el = [...document.querySelectorAll(s)].find((x) => x.offsetWidth && rx.test(x.textContent.replace(/\s+/g, ' ').trim()));
    document.querySelectorAll('[data-sl-tap]').forEach((x) => x.removeAttribute('data-sl-tap'));
    if (el) el.setAttribute('data-sl-tap', '1');
    return !!el;
  }, scope, re.source);
}
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function until(page, fn, arg, timeout = 20000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try { last = await page.evaluate(fn, arg); if (last && last.ok) return last; } catch (_) {}
    await sleep(500);
  }
  return last || { ok: false };
}

/* Signup, the real onboarding wizard with the trade's own card (a trade that
 * is not on the first row sits behind « Voir plus de types »), then the
 * operator's activation (the store is born `pending`; tools/kiwi-local-stack.mjs
 * --seed does the same). */
async function createMerchant(t, ctx, m) {
  const page = await preparePage(t, await ctx.newPage());
  t.step(`${m.label}: sign up`);
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'domcontentloaded' });
  const r = await api(page, 'POST', '/auth/signup', { email: m.email, password: m.password, name: 'Test ' + m.label, business: m.business });
  if (r.status !== 200) throw new Error(`signup ${m.label}: ${r.status} ${JSON.stringify(r.body)}`);
  t.step(`${m.label}: onboarding wizard, card « ${m.type} »`);
  // coverage: surface=onboarding locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'domcontentloaded' });
  await clickSel(page, '.kob-btn.primary[data-go="next"]');                 // Commencer
  await page.waitForSelector('[data-type]', { visible: true });
  const shown = await page.$eval(`[data-type="${m.type}"]`, (e) => !!e.offsetWidth).catch(() => false);
  if (!shown) await clickSel(page, '[data-more]');
  await clickSel(page, `[data-type="${m.type}"]`);
  await clickSel(page, '.kob-btn.primary[data-go="next"]');                 // business
  await sleep(250); await clickSel(page, '.kob-btn.primary[data-go="next"]'); // how many stores
  await sleep(250); await clickSel(page, '.kob-btn.primary[data-go="next"]'); // team size
  await sleep(250); await clickSel(page, '.kob-btn.primary[data-go="next"]'); // priorities
  await sleep(250);
  const pin = await page.waitForSelector('[data-pin-code="0"]', { visible: true });
  await pin.click(); await pin.type(m._pin);
  await clickSel(page, '.kob-btn.primary[data-go="next"]');                 // Presque fini
  await clickSel(page, '[data-finish]');
  await page.waitForFunction(() => !!localStorage.getItem('kiwiLiveMerchant') && localStorage.getItem('kiwiOnboarded') === '1', { timeout: 30000 });
  m.slug = await page.evaluate(() => localStorage.getItem('kiwiLiveMerchant'));
  await page.waitForFunction(async (slug) => {
    const r = await fetch('/api/config?merchant=' + encodeURIComponent(slug), { credentials: 'same-origin' });
    return r.ok;
  }, { timeout: 15000 }, m.slug);
  const n = stack.db.prepare("UPDATE merchant_config SET status = 'active', plan = 'pro' WHERE merchant = ?").run(m.slug).changes;
  if (!n) throw new Error(`${m.label}: store ${m.slug} was not created`);
  log(m.label, 'store', m.slug);
  return page;
}

/* The counter tablet opens its till the way the dashboard's « Ouvrir la caisse
 * sur cet appareil » does (assets/caisse-link.js handOff): the store, its base
 * type and its trade (the onboarding card, which routes the till to its métier
 * module) in kiwiPairHandoff, then kiwi-caisse.html?pair=1. */
async function pairTill(t, page, m, vertical) {
  t.step(`pair the tablet to ${m.label}`);
  await signIn(page, m);
  const biz = await page.evaluate(() => ({ type: localStorage.getItem('kiwiBizType') || '' }));
  log(m.label, 'tablet kiwiBizType', biz.type || '(none)');
  await page.evaluate((h) => localStorage.setItem('kiwiPairHandoff', JSON.stringify({ ...h, ts: Date.now() })),
    { merchant: m.slug, type: m.base, name: m.business, subtype: m.type, location: '' });
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  await page.goto(base + '/kiwi-caisse.html?pair=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((slug) => {
    try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null')?.merchant === slug; } catch (_) { return false; }
  }, { timeout: 30000 }, m.slug);
  await unlockTill(t, page, m, vertical);
}
async function unlockTill(t, page, m, vertical) {
  t.step(`${m.label}: staff code on the till`);
  for (let attempt = 0; ; attempt++) {
    await page.waitForSelector('[data-cpp="1"]', { visible: true, timeout: 45000 });
    await sleep(1500);
    try { await typeDigits(page, '[data-cpp="%"]', m._pin); break; } catch (e) {
      if (attempt >= 1) throw e;
      t.step(`${m.label}: keypad redrawn, code again`);
    }
  }
  const next = await until(page, (v) => {
    const float = [...document.querySelectorAll('button')].some((b) => b.offsetWidth && /^300 MAD$/.test(b.textContent.trim()));
    const on = !!document.querySelector(`#pos-${v}.is-on`);
    return { ok: float || on, float, on };
  }, vertical, 30000);
  /* The restaurant's float card can flash while the métier module loads: give
   * the module a moment before treating the float as the till's question. */
  if (next.float && !next.on) {
    const later = await until(page, (v) => ({ ok: !!document.querySelector(`#pos-${v}.is-on`) }), vertical, 4000);
    if (later.ok) next.on = true;
  }
  if (next.float && !next.on) {
    t.step(`${m.label}: opening float`);
    const openEnabled = () => page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.offsetWidth && /^Ouvrir la caisse$/.test(b.textContent.trim()) && !b.disabled));
    const moduleOn = () => page.$(`#pos-${vertical}.is-on`).then((x) => !!x);
    for (let i = 0; i < 8 && !(await openEnabled()) && !(await moduleOn()); i++) {
      try { await clickText(page, 'button', /^300 MAD$/); } catch (_) {}
      await sleep(700);
    }
    /* A métier till may open itself while the float card is still fading. */
    try { await clickText(page, 'button, [role=button], .clockin-btn', /^Ouvrir la caisse$/); }
    catch (e) { if (!(await page.$(`#pos-${vertical}.is-on`))) throw e; }
    const open = await until(page, () => ({ ok: !([...document.querySelectorAll('button')].some((b) => b.offsetWidth && /^300 MAD$/.test(b.textContent.trim()))) }), null, 20000);
    if (!open.ok) {
      const pv = await page.evaluate(() => localStorage.getItem('kiwiPairedVenue'));
      throw new Error(`${m.label}: the till never opened after the float (paired venue ${pv})`);
    }
  }
  const on = await until(page, (v) => ({ ok: !!document.querySelector(`#pos-${v}.is-on`), body: document.body.className }), vertical, 30000);
  if (!on.ok) throw new Error(`${m.label}: the paired till did not open the ${vertical} module (body: ${on.body})`);
  await sleep(2500);    // the greeting veil
}

/* ── money ────────────────────────────────────────────────────────────── */
function cents(text) {
  if (text == null) return NaN;
  const t = String(text).replace(/[    ]/g, '').replace(/MAD|DH|DHS/gi, '').replace(/[−–]/g, '-');
  const m = /(-?)(\d+)(?:,(\d{1,2}))?/.exec(t);
  if (!m) return NaN;
  const dec = (m[3] || '').padEnd(2, '0');
  return (m[1] ? -1 : 1) * (Number(m[2]) * 100 + Number(dec || 0));
}
const mad = (c) => (c / 100).toFixed(2).replace('.', ',');
/* « 1 234,50 » as the dashboard prints it, whole dirhams without « ,00 ». */
const madVariants = (c) => {
  const whole = Math.trunc(Math.abs(c) / 100), dec = Math.abs(c) % 100;
  const w = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? [`${w},${String(dec).padStart(2, '0')} MAD`] : [`${w} MAD`, `${w},00 MAD`];
};
function after(text, label, nth = 0) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  let seen = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (label instanceof RegExp ? label.test(lines[i]) : lines[i].toLowerCase() === label.toLowerCase()) {
      if (seen++ === nth) return lines[i + 1];
    }
  }
  return null;
}

/* ── the dashboard ────────────────────────────────────────────────────── */
async function openDashboard(t, page, m) {
  t.step(`${m.label}: dashboard`);
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-kiwi-pin-input]', { timeout: 30000 });
  await sleep(800);
  await page.evaluate(() => document.querySelector('[data-kiwi-pin-input]').focus());
  for (const d of m._pin) { await page.keyboard.press(d); await sleep(120); }
  await page.waitForFunction(() => !document.querySelector('[data-kiwi-lock]') || document.querySelector('[data-kiwi-lock]').classList.contains('is-unlocking') || getComputedStyle(document.querySelector('[data-kiwi-lock]')).display === 'none', { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('[data-kpi="tx"]', { visible: true, timeout: 30000 });
  await sleep(1500);
}
async function dashNav(page, nav) {
  await clickSel(page, `[data-nav="${nav}"]`);
  await sleep(1800);
}
async function dashHome(page, expectTx) {
  await dashNav(page, 'accueil');
  const read = () => page.evaluate(() => {
    const v = (sel) => { const e = document.querySelector(sel); return e ? e.textContent : null; };
    return {
      tx: v('[data-kpi="tx"] [data-kpi-val]'), basket: v('[data-kpi="panier"] [data-kpi-val]'),
      net: v('[data-kpi="revenue"] [data-kpi-val]'), hero: v('[data-rev-hero-val]'),
      mix: v('[data-mix-center-amt]'),
    };
  });
  const t0 = Date.now();
  let a = await read(), b;
  while (Date.now() - t0 < 25000) {
    await sleep(1200);
    b = await read();
    if (JSON.stringify(a) === JSON.stringify(b) && (expectTx == null || Number(String(b.tx).replace(/\D/g, '')) === expectTx)) break;
    a = b;
  }
  b = b || a;
  return { raw: b, tx: Number(String(b.tx).replace(/\D/g, '')), basket: cents(b.basket), net: cents(b.net), hero: cents(b.hero), mix: cents(b.mix) };
}
async function dashTransactions(page, expectTx) {
  let out;
  for (let i = 0; i < 4; i++) {
    await dashNav(page, 'transactions');
    const text = await page.$eval('main', (e) => e.innerText);
    const m = /(\d+)\s+VENTES?\s+·/i.exec(text);
    out = { text, count: m ? Number(m[1]) : NaN, gross: cents(after(text, 'Encaissements')), net: cents(after(text, 'Net encaissé')) };
    if (out.count === expectTx) break;
    await sleep(2500);
  }
  return out;
}

/* ── checks ───────────────────────────────────────────────────────────── */
function checker() {
  const findings = [];
  const check = (ok, msg, detail) => {
    if (ok) { console.log('  ✓ ' + msg); return true; }
    findings.push(msg + (detail ? ' · ' + detail : ''));
    console.log('  ✗ ' + msg + (detail ? ' · ' + detail : ''));
    return false;
  };
  const eqCents = (actual, expected, msg) => check(actual === expected, `${msg} = ${mad(expected)} MAD`, `reads ${Number.isNaN(actual) ? 'nothing' : mad(actual) + ' MAD'}`);
  return { findings, check, eqCents };
}

/* ── the catalogue, given as the merchant gives it ────────────────────── */
async function seedCatalogue(t, owner, m, tr) {
  const c = tr.catalogue;
  t.step(`${m.label}: catalogue (${c.kind})`);
  if (c.kind === 'menu') {
    /* What « Menu » publishes (assets/menu-catalog.js): the carte on /api/menu,
     * under the venue's base type. The métier till reads it back through
     * KiwiVerticalCarte (assets/vertical-state.js). */
    const data = { cats: c.cats, items: c.items, opts: c.opts };
    const pub = await api(owner, 'POST', '/api/menu', { merchant: m.slug, name: m.business, type: m.base, data });
    if (pub.status !== 200) throw new Error(`menu publish ${m.label}: ${pub.status} ${JSON.stringify(pub.body)}`);
    return;
  }
  if (c.kind === 'catalog') {
    /* The retail trades sell from the shared boutique catalogue, the one the
     * dashboard's Stock page fills (assets/stock.js retailCatalog: addProduct,
     * then a « sans couleur / TU » variant) and mirrors to /api/catalog. */
    await owner.waitForFunction(() => !!(window.KiwiBoutiqueCatalog && typeof window.KiwiBoutiqueVenueKey === 'function'), { timeout: 30000 });
    const key = await owner.evaluate((slug, items) => {
      const C = window.KiwiBoutiqueCatalog;
      const k = window.KiwiBoutiqueVenueKey() || slug;
      if (C.currentVenue() !== k) C.use(k);
      const cat = C.addCategory('TEST Rayon');
      const catId = cat && (cat.id || cat);
      items.forEach((it) => {
        const p = C.addProduct({ name: it.name, priceMAD: it.price, categoryId: catId });
        C.addVariant({ productId: p.id, colorId: 'sans-couleur', colorLabel: 'Sans couleur', colorHex: '#A0A0A0', size: 'TU', stock: 40 });
      });
      try { C.sync && C.sync(); } catch (_) {}
      return k;
    }, m.slug, c.items);
    if (key !== m.slug) throw new Error(`${m.label}: the dashboard's catalogue key is ${key}, not the store ${m.slug}`);
    const t0 = Date.now();
    let have = 0;
    while (Date.now() - t0 < 25000) {
      const r = await api(owner, 'GET', '/api/catalog?merchant=' + encodeURIComponent(m.slug));
      have = ((r.body && (r.body.data || r.body.catalog || r.body).products) || []).filter((p) => /^TEST /.test(p.name || '')).length;
      if (have >= c.items.length) break;
      await sleep(1000);
    }
    if (have < c.items.length) throw new Error(`${m.label}: the catalogue never reached /api/catalog (${have}/${c.items.length} products)`);
    return;
  }
  /* Care: « Prestations », « Soins », « Abonnements / Comptoir » are boards of
   * the `workspaces` document (functions/api/store.js), the same the dashboard
   * workspace and the till's own editor write (assets/pos-workspaces.js). A row
   * sells when its status is « Actif » (1). */
  const cur = await api(owner, 'GET', '/api/store?feature=workspaces&merchant=' + encodeURIComponent(m.slug));
  if (cur.status !== 200) throw new Error(`workspaces read ${m.label}: ${cur.status} ${JSON.stringify(cur.body)}`);
  const doc = (cur.body && cur.body.data && cur.body.data.records) ? cur.body.data : { trade: m.type, records: {} };
  doc.trade = doc.trade || m.type;
  const now = Date.now();
  doc.records[c.board] = (doc.records[c.board] || []).concat(c.items.map((it, i) => ({
    id: `tw-test-${m.label}-${i}`, title: it.title, status: 1, createdAt: now + i, updatedAt: now + i, deletedAt: 0,
    values: { active: 'yes', ...it },
  })));
  const w = await api(owner, 'POST', '/api/store', { feature: 'workspaces', merchant: m.slug, baseRev: (cur.body && cur.body.rev) || 0, data: doc });
  if (w.status !== 200) throw new Error(`workspaces write ${m.label}: ${w.status} ${JSON.stringify(w.body)}`);
}

/* ── card: the reader-less till asks the cashier to confirm the terminal ─ */
async function cardConfirm(page) {
  await clickSel(page, 'button[data-card-confirm="1"]', { timeout: 15000 });
}
/* The till's own day ledger (assets/pos-sale.js), read only to wait on. */
async function tillCount(page, vertical) {
  return page.evaluate((v) => { try { return window.KiwiPosSale.totals(v).count || 0; } catch (_) { return -1; } }, vertical);
}
async function waitTillCount(page, vertical, n, what) {
  const r = await until(page, (a) => {
    let c = -1; try { c = window.KiwiPosSale.totals(a.v).count || 0; } catch (_) {}
    return { ok: c >= a.n, c };
  }, { v: vertical, n }, 20000);
  if (!r.ok) throw new Error(`${what}: the till did not book the sale (its day shows ${r.c} sale(s), ${n} expected)`);
}
async function tapItems(page, scope, names) {
  for (const name of names) { await clickText(page, scope, new RegExp(reEsc(name))); await sleep(450); }
}
async function waitTiles(page, scope, names, label) {
  const r = await until(page, (a) => {
    const txt = [...document.querySelectorAll(a.scope)].filter((e) => e.offsetWidth).map((e) => e.textContent).join('|');
    return { ok: a.names.every((n) => txt.includes(n)), txt: txt.slice(0, 300) };
  }, { scope, names }, 30000);
  if (!r.ok) throw new Error(`${label}: the catalogue never reached the till (tiles: ${r.txt || 'none'})`);
}

/* ── each till, rung by taps ──────────────────────────────────────────── */
const RING = {
  async pizzeria(page, sale) {
    await clickSel(page, '[data-pz-mode="emporter"]'); await sleep(300);
    for (const name of sale.items) {
      await clickText(page, '[data-pz-pizza], [data-pz-drink]', new RegExp(reEsc(name)));
      await sleep(500);
      const sheet = await page.$('#pz-sheet-veil.is-open');
      if (sheet) { await clickSel(page, '#pz-sheet-add'); await sleep(400); }
      const vc = await page.$('.vc-veil');
      if (vc && await vc.isVisible()) { await clickSel(page, '[data-vc-ok]'); await sleep(400); }
    }
    await clickSel(page, '#pz-validate'); await sleep(700);
    if (sale.tender === 'cash') { await clickSel(page, '#pz-paym [data-m="especes"]'); await sleep(500); await clickSel(page, '#pz-cash-ok'); }
    else { await clickSel(page, '#pz-paym [data-m="carte"]'); await cardConfirm(page); }
  },
  async boulangerie(page, sale) {
    await tapItems(page, '[data-bl-prod]', sale.items);
    if (sale.tender === 'cash') { await clickSel(page, '#bl-pay-cash'); await sleep(500); await clickSel(page, '[data-bl-exact]'); await clickSel(page, '#bl-cash-ok'); }
    else { await clickSel(page, '#bl-pay-card'); await cardConfirm(page); }
  },
  async fastfood(page, sale) {
    await tapItems(page, '[data-ff-item]', sale.items);
    await clickSel(page, '#ff-validate'); await sleep(600);
    if (sale.tender === 'cash') {
      await clickSel(page, '[data-ff-m="especes"]'); await sleep(500);
      await clickText(page, '[data-ff-bill]', /Exact/i); await clickSel(page, '#ff-cash-ok');
    } else { await clickSel(page, '[data-ff-m="carte"]'); await cardConfirm(page); }
  },
  async foodtruck(page, sale) {
    await tapItems(page, '[data-ft-item]', sale.items);
    if (sale.tender === 'cash') { await clickSel(page, '#ft-pay-cash'); await sleep(500); await clickSel(page, '#ft-cash-ok'); }
    else { await clickSel(page, '#ft-pay-card'); await cardConfirm(page); }
  },
  async epicerie(page, sale) {
    await tapItems(page, '[data-ep-item]', sale.items);
    await clickSel(page, '#ep-pay'); await sleep(500);
    if (sale.tender === 'cash') { await clickSel(page, '[data-ep-m="especes"]'); await sleep(400); await clickSel(page, '#ep-cash-ok'); }
    else { await clickSel(page, '[data-ep-m="carte"]'); await cardConfirm(page); }
  },
  async pharmacie(page, sale) {
    for (const name of sale.items) {
      await clickText(page, '[data-ph-item]', new RegExp(reEsc(name))); await sleep(400);
      await clickSel(page, '#ph-sheet-add'); await sleep(400);
    }
    await clickSel(page, '#ph-validate'); await sleep(600);
    await clickSel(page, '#ph-rc-pay'); await sleep(500);
    if (sale.tender === 'cash') { await clickSel(page, '[data-ph-m="especes"]'); await sleep(400); await clickSel(page, '#ph-cash-ok'); }
    else { await clickSel(page, '[data-ph-m="carte"]'); await cardConfirm(page); }
  },
  async librairie(page, sale) {
    for (const name of sale.items) {
      await clickText(page, '[data-lb-item]', new RegExp(reEsc(name))); await sleep(400);
      await clickSel(page, '#lb-sheet-add'); await sleep(400);
    }
    await clickSel(page, '#lb-validate'); await sleep(600);
    await clickSel(page, '#lb-rec-pay'); await sleep(500);
    if (sale.tender === 'cash') { await clickSel(page, '#lb-paym [data-m="especes"]'); await sleep(400); await clickSel(page, '#lb-cash-ok'); }
    else { await clickSel(page, '#lb-paym [data-m="carte"]'); await cardConfirm(page); }
  },
  async fleuriste(page, sale) {
    for (const name of sale.items) {
      await clickText(page, '[data-fl-stem]', new RegExp(reEsc(name))); await sleep(400);
      await clickSel(page, '#fl-sheet-set'); await sleep(400);
    }
    await clickSel(page, '#fl-validate'); await sleep(600);
    const guest = await page.$('#fl-cl-guest');
    if (guest && await guest.isVisible()) { await guest.click(); await sleep(500); await clickSel(page, '#fl-validate'); await sleep(600); }
    await clickSel(page, '#fl-recap-pay'); await sleep(500);
    await clickSel(page, '[data-fl-paymode="now"]'); await sleep(500);
    if (sale.tender === 'cash') { await clickSel(page, '[data-m="especes"]'); await sleep(400); await clickSel(page, '#fl-cash-ok'); }
    else { await clickSel(page, '[data-m="carte"]'); await cardConfirm(page); }
  },
  async coiffure(page, sale) {
    await clickSel(page, '[data-cf-view="presta"]'); await sleep(500);
    for (const name of sale.items) {
      await clickText(page, '[data-cf-item]', new RegExp(reEsc(name))); await sleep(500);
      await clickSel(page, '#cf-sheet-add'); await sleep(400);
    }
    await clickSel(page, '#cf-tk-client'); await sleep(500);
    await clickSel(page, '#cf-cl-guest'); await sleep(500);
    await clickSel(page, '#cf-validate'); await sleep(900);
    /* The client walks through the salon: waiting, basin, chair, then pay. */
    for (let i = 0; i < 4; i++) {
      const pay = await page.$('[data-cf-method="especes"]');
      if (pay && await pay.isVisible()) break;
      const ids = await page.$$eval('[data-cf-pass]', (els) => els.filter((e) => e.offsetWidth).map((e) => e.getAttribute('data-cf-pass')));
      if (!ids.length) break;
      await clickSel(page, `[data-cf-pass="${ids[ids.length - 1]}"]`); await sleep(700);
    }
    if (sale.tender === 'cash') { await clickSel(page, '[data-cf-method="especes"]'); await sleep(400); await clickSel(page, '#cf-cash-ok'); }
    else { await clickSel(page, '[data-cf-method="carte"]'); await cardConfirm(page); }
  },
  async spa(page, sale) {
    await clickSel(page, '[data-sp-view="encaisser"]'); await sleep(500);
    for (const name of sale.items) {
      await clickText(page, '[data-sp-svc]', new RegExp(reEsc(name))); await sleep(500);
      await clickSel(page, '#sp-svc-add'); await sleep(400);
    }
    await clickSel(page, '#sp-validate'); await sleep(600);
    if (sale.tender === 'cash') { await clickSel(page, '[data-sp-m="especes"]'); await sleep(400); await clickSel(page, '#sp-cash-ok'); }
    else { await clickSel(page, '[data-sp-m="carte"]'); await cardConfirm(page); }
  },
  async gym(page, sale) {
    await clickSel(page, '#gy-ci-pass'); await sleep(600);
    await clickText(page, '[data-gy-pass]', new RegExp(reEsc(sale.items[0]))); await sleep(600);
    if (sale.tender === 'cash') { await clickSel(page, '[data-m="especes"]'); await sleep(400); await clickSel(page, '#gy-cash-ok'); }
    else { await clickSel(page, '[data-m="carte"]'); await cardConfirm(page); }
  },
};
/* Where each till shows the catalogue, to wait for it before the first tap. */
const TILES = {
  pizzeria: '[data-pz-pizza], [data-pz-drink]', boulangerie: '[data-bl-prod]', fastfood: '[data-ff-item]',
  foodtruck: '[data-ft-item]', traiteur: '[data-tr-dish]', epicerie: '[data-ep-item]', pharmacie: '[data-ph-item]',
  librairie: '[data-lb-item]', fleuriste: '[data-fl-stem]', coiffure: '[data-cf-item]', spa: '[data-sp-svc]', gym: '[data-gy-pass]',
};
const BEFORE_TILES = {
  coiffure: (p) => clickSel(p, '[data-cf-view="presta"]'),
  spa: (p) => clickSel(p, '[data-sp-view="encaisser"]'),
  traiteur: (p) => clickSel(p, '[data-tr-view="devis"]'),
  gym: (p) => clickSel(p, '#gy-ci-pass'),
};
const AFTER_TILES = {
  gym: async (p) => { await p.keyboard.press('Escape'); await sleep(400); const x = await p.$('.modal-veil.is-open [data-close], .modal-veil.is-open .modal-x'); if (x) { try { await x.click(); } catch (_) {} } await sleep(400); },
};

/* The caterer: quote → event → deposit (pos-traiteur.js). Taps only. */
RING.traiteurDeposit = async function (t, page, sale, m) {
  t.step(`${m.label}: quote for ${sale.items.join(', ')}`);
  await clickSel(page, '[data-tr-view="devis"]'); await sleep(500);
  for (const name of sale.items) {
    await clickText(page, '[data-tr-dish]', new RegExp(reEsc(name))); await sleep(500);
    const vc = await page.$('.vc-veil');
    if (vc && await vc.isVisible()) { await clickSel(page, '[data-vc-ok]'); await sleep(400); }
  }
  const client = await page.waitForSelector('#tr-q-client', { visible: true });
  await client.click({ clickCount: 3 }); await client.type('TEST KIWI Client');
  /* The quote is a column beside the dishes, not a 330 px box under them, and
   * the till's background repaint (every 30 s, on wake, after a payment)
   * leaves the field being typed in alone: it used to rebuild the whole form. */
  const held = await page.evaluate(() => {
    const q = document.querySelector('.tr-quote').getBoundingClientRect();
    const b = document.querySelector('.tr-build').getBoundingClientRect();
    const field = document.querySelector('#tr-q-client');
    field.focus();
    window.KiwiPosDispatch.repaint();
    const after = document.querySelector('#tr-q-client');
    return { beside: q.left >= b.right - 1 && q.height > 600, same: after === field, focused: document.activeElement === field, value: after.value,
      q: [Math.round(q.left), Math.round(q.width), Math.round(q.height)], b: Math.round(b.right) };
  });
  if (!held.beside) throw new Error(`${m.label}: the quote is not a column beside the dishes (${JSON.stringify(held)})`);
  if (!held.same || !held.focused || held.value !== 'TEST KIWI Client') throw new Error(`${m.label}: a repaint rebuilt the quote form under the cursor (${JSON.stringify(held)})`);
  const phone = await page.waitForSelector('#tr-q-phone', { visible: true });
  await phone.click({ clickCount: 3 }); await phone.type('0611223344');
  await clickSel(page, '#tr-q-send'); await sleep(700);
  await clickSel(page, '#tr-wa-send'); await sleep(900);
  t.step(`${m.label}: the event, confirmed, then its first deposit`);
  await clickSel(page, '[data-tr-view="events"]').catch(() => {});
  await sleep(600);
  await clickSel(page, '[data-tr-ev]'); await sleep(600);
  await clickSel(page, '#tr-dt-confirm'); await sleep(700);
  await clickSel(page, '#tr-dt-pay'); await sleep(600);
  if (sale.tender === 'cash') { await clickSel(page, '[data-tr-m="especes"]'); await sleep(400); await clickSel(page, '#tr-cash-ok'); }
  else { await clickSel(page, '[data-tr-m="carte"]'); await cardConfirm(page); }
};

/* ── the run ──────────────────────────────────────────────────────────── */
const MINE = TRADES.filter((tr) => (ONLY.length ? ONLY.includes(tr.vertical) : tr.part === PART));
for (const tr of MINE) {
  await S.run(`${tr.vertical} · signup, catalogue, a sale by taps, the server and the dashboard`, async (t) => {
    const { findings, check, eqCents } = checker();
    const m = merchant(tr);
    const ownerCtx = await browser.createBrowserContext();
    const tabletCtx = await browser.createBrowserContext();
    t.defer(() => ownerCtx.close());
    t.defer(() => tabletCtx.close());
    const owner = await createMerchant(t, ownerCtx, m);
    await seedCatalogue(t, owner, m, tr);

    const till = await preparePage(t, await tabletCtx.newPage());
    await pairTill(t, till, m, tr.vertical);
    t.step(`${m.label}: the catalogue on the till`);
    if (BEFORE_TILES[tr.vertical]) { await BEFORE_TILES[tr.vertical](till); await sleep(600); }
    const names = [...new Set(tr.sales.flatMap((s) => s.items))];
    await waitTiles(till, TILES[tr.vertical], names, m.label);
    if (AFTER_TILES[tr.vertical]) await AFTER_TILES[tr.vertical](till);

    const rung = [];
    for (const sale of tr.sales) {
      t.step(`${m.label}: ${sale.items.join(' + ')} · ${sale.tender}`);
      const n0 = await tillCount(till, tr.vertical);
      if (sale.deposit) { await RING.traiteurDeposit(t, till, sale, m); }
      else await RING[tr.vertical](till, sale);
      await waitTillCount(till, tr.vertical, n0 + 1, `${m.label} ${sale.tender}`);
      rung.push(sale);
      await sleep(600);
    }

    /* The server: every rung sale, its centimes and its tender. */
    t.step(`${m.label}: the server ledger`);
    const wantRows = rung.map((s) => ({ cents: s.cents, method: s.tender })).sort((a, b) => a.cents - b.cents || a.method.localeCompare(b.method));
    let rows = [];
    for (let i = 0; i < 30; i++) {
      rows = stack.db.prepare('SELECT amount_cents, amount, method FROM sales WHERE merchant = ? AND void_ts IS NULL').all(m.slug);
      if (rows.length >= wantRows.length) break;
      await sleep(1000);
    }
    const got = rows.map((r) => ({ cents: r.amount_cents == null ? Number(r.amount) * 100 : Number(r.amount_cents), method: r.method }))
      .sort((a, b) => a.cents - b.cents || a.method.localeCompare(b.method));
    check(JSON.stringify(got) === JSON.stringify(wantRows),
      `server · ${wantRows.length} sale row(s): ${wantRows.map((r) => `${mad(r.cents)} ${r.method}`).join(', ')}`,
      `D1 has ${got.length ? got.map((r) => `${mad(r.cents)} ${r.method}`).join(', ') : 'nothing'}`);
    const net = wantRows.reduce((s, r) => s + r.cents, 0);

    /* The till's own day, as the dashboard should read it too. */
    const day = await till.evaluate((v) => { try { return window.KiwiPosSale.totals(v); } catch (_) { return null; } }, tr.vertical);
    eqCents(day ? Math.round(day.total * 100) : NaN, net, `till · its day total`);

    /* The owner's dashboard: Home and Transactions. */
    await openDashboard(t, owner, m);
    const home = await dashHome(owner, wantRows.length);
    check(home.tx === wantRows.length, `dashboard home · ${wantRows.length} transaction(s) today`, `reads ${home.raw.tx}`);
    eqCents(home.net, net, 'dashboard home · revenue (KPI)');
    eqCents(home.hero, net, 'dashboard home · revenue hero');
    const tx = await dashTransactions(owner, wantRows.length);
    check(tx.count === wantRows.length, `dashboard transactions · ${wantRows.length} sale(s) listed`, `reads ${Number.isNaN(tx.count) ? 'no count' : tx.count}`);
    eqCents(tx.net, net, 'dashboard transactions · net collected');
    log('transactions page:', tx.text.replace(/\n+/g, ' | ').slice(0, 1600));
    for (const r of wantRows) {
      const flat = tx.text.replace(/[   ]/g, ' ');
      check(madVariants(r.cents).some((v) => new RegExp('(^|[^\\d,])' + reEsc(v)).test(flat)), `dashboard transactions · the ${mad(r.cents)} MAD ${r.method} sale is listed`);
    }
    if (findings.length) throw new Error(findings.length + ' mismatch(es): ' + findings.join(' | '));
  });
}

await S.finish();
