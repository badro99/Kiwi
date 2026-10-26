#!/usr/bin/env node
// Design 2027 sweep: one pass over every 2027 screen, with the shipped design
// next to it, on phone, iPad and desktop, light and dark, French and Arabic.
//
//   node tools/sweep-2027.mjs                 everything
//   node tools/sweep-2027.mjs --only till,kds  some surfaces
//   node tools/sweep-2027.mjs --quick         phone + desktop, light, French
//
// Writes .kiwi/sweep-2027/<run>/ : a screenshot per screen, issues.json (every
// finding, grouped), report.html (the list, worst first, with pictures).
// A report tool, not a test: it never fails the gate and check.js does not
// name it. Demo data and local fixtures only; no merchant, no staff code.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { pinTradingHour } from './demo-clock.mjs';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const QUICK = argv.includes('--quick');
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const JOBS = Number(arg('--jobs') || process.env.KIWI_SWEEP_JOBS || 3);

/* ── Screens ──────────────────────────────────────────────────────────────── */
const VP = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
  phoneL: { width: 844, height: 390, isMobile: true, hasTouch: true },
  ipad: { width: 820, height: 1180, isMobile: true, hasTouch: true },
  ipadL: { width: 1180, height: 820, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
};

/* ── Fixtures: the guest menu and the kitchen queue ───────────────────────── */
const MENU = {
  name: 'TEST KIWI Restaurant de la Corniche', type: 'restaurant', orderpro: true, menuLangs: false, menuNutrition: false, zone: '', shop: null,
  menu: {
    cats: [{ id: 'plats', name: 'Plats' }, { id: 'boissons', name: 'Boissons' }],
    opts: [{ id: 'taille', name: 'Taille', kind: 'one', required: true, choices: [{ id: 's', name: 'Petite', price: 0 }, { id: 'l', name: 'Grande', price: 30 }] }],
    items: [
      { id: 'long', catId: 'plats', name: 'Tajine de poulet aux citrons confits, olives violettes et frites maison', desc: 'Mijoté quatre heures', price: 125.5, opts: ['taille'], avail: true, tag: 'new' },
      { id: 'short', catId: 'plats', name: 'Harira', desc: '', price: 25, opts: [], avail: true },
      { id: 'couscous', catId: 'plats', name: 'Couscous royal', desc: 'Sept légumes', price: 95, opts: [], avail: true },
      { id: 'the', catId: 'boissons', name: 'Thé à la menthe', desc: '', price: 15, opts: [], avail: true },
      { id: 'jus', catId: 'boissons', name: "Jus d'orange pressé", desc: '', price: 20, opts: [], avail: false },
    ],
  },
};
const ORDER_API = { '/api/menu': MENU, '/api/order/session': { ok: true, session: 'ses-sweep', mode: 'table', table: '12', status: 'open' } };

const KDS_MERCHANT = 'sweep-2027-bistro';
const AUTH_SECRET = 'sweep-2027-secret-0123456789';
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
  async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
};
const kdsEnv = { DB, AUTH_SECRET };
sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)')
  .run(KDS_MERCHANT, JSON.stringify({ orderpro: true }), 'TEST KIWI Bistro', Date.now());
const kdsCookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, KDS_MERCHANT)}`;
let seq = 100;
const line = (name, extra = {}) => ({ id: 'it-' + name.toLowerCase().replace(/\W+/g, '-'), name, qty: 1, unitPrice: 50, station: '', ...extra });
function addOrder(id, { mode = 'table', table = null, ageMin, lines, status = 'accepted' }) {
  const t = Date.now() - ageMin * 60000;
  sql.prepare(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts, channel)
               VALUES (?, ?, ?, ?, ?, 100, ?, ?, ?, ?, 'caisse')`).run(id, KDS_MERCHANT, ++seq, mode, table, JSON.stringify(lines), status, t, t);
}
addOrder('ord-sw-1', { table: '5', ageMin: 2, lines: [line('Tajine kefta', { note: 'Sans piment', visuals: [{ name: 'sans oignon' }] }), line('Thé à la menthe', { qty: 3 })] });
addOrder('ord-sw-2', { table: '12', ageMin: 14, lines: [line('Couscous royal sept légumes et merguez maison'), line('Harira', { qty: 2 }), line('Pastilla au poulet')] });
addOrder('ord-sw-3', { mode: 'takeout', ageMin: 6, lines: [line('Msemen'), line('Jus d\'orange pressé')] });
addOrder('ord-sw-4', { table: '3', ageMin: 22, lines: [line('Brochettes de poulet'), line('Salade marocaine')], status: 'preparing' });
addOrder('ord-sw-6', { table: '14', ageMin: 9, lines: [line('Pastilla aux fruits de mer', { qty: 2, note: 'Allergie crustacés : vérifier' }), line('Thé', { station: 'bar' })], status: 'preparing' });
addOrder('ord-sw-5', { table: '8', ageMin: 31, lines: [line('Tanjia marrakchia')], status: 'ready' });

/* ── Server and browser ───────────────────────────────────────────────────── */
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((rq, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(rq.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const req = createRequire(path.join(root, 'app/package.json'));
const puppeteer = req('puppeteer-core');
const axeSource = fs.readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium'].find(fs.existsSync);
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });

const RUN = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join(root, '.kiwi/sweep-2027', RUN);
fs.mkdirSync(OUT, { recursive: true });

async function kdsRoute(r) {
  const url = new URL(r.url());
  if (url.pathname === '/api/menu') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'TEST KIWI', menu: { stations: [{ id: 'bar', name: 'Bar' }, { id: 'cuisine', name: 'Cuisine' }] } }) });
  if (url.pathname !== '/api/order/queue') return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
  // Read only: the sweep looks, it does not bump tickets.
  const request = new Request(url.toString(), { method: 'GET', headers: { Cookie: kdsCookie } });
  const res = await queue.onRequestGet({ request, env: kdsEnv, waitUntil() {} });
  return r.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
}

/* One page: fresh context, pinned clock, theme, language, skin flag. */
async function openPage(cell, storage, api) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push('page error: ' + String(e.message).split('\n')[0].slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) page.problems.push('console: ' + m.text().slice(0, 200)); });
  // The kitchen reads ticket ages against the real clock, like its server.
  if (api !== 'kds') await pinTradingHour(page);
  await page.setViewport({ ...VP[cell.vp], deviceScaleFactor: 1 });
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: cell.theme }]);
  await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = r.url();
    if (!u.startsWith(base)) return u.startsWith('data:') ? r.continue() : r.abort();
    const p = new URL(u).pathname;
    if (p === '/kiwi-sw.js') return r.respond({ status: 404, contentType: 'text/javascript', body: '' });
    if (p.startsWith('/api/') || p.startsWith('/auth/')) {
      if (api === 'kds') return kdsRoute(r);
      if (api === 'order' && ORDER_API[p]) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ORDER_API[p]) });
      return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    }
    return r.continue();
  });
  await page.evaluateOnNewDocument((lang, theme, extra) => {
    for (const k of ['kiwiLang', 'kiwiCaisseLang', 'kiwiCuisineLang', 'orderProLang', 'kiwi-employee-language:demo', 'kiwi-employee-language:team-test']) localStorage.setItem(k, lang);
    localStorage.setItem('kiwiTheme', theme);
    localStorage.setItem('kiwiDashTheme', theme);
    localStorage.setItem('kiwiSkipOnboard', '1');
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, cell.locale, cell.theme, storage);
  return { ctx, page };
}

/* Clicks [data-id=id] in whichever kit nav (rail, tab bar, sidebar) shows it. */
const kitNav = (page, id) => page.evaluate((id) => {
  const hosts = [...document.querySelectorAll('*')].filter((e) => e.shadowRoot && /^K-/.test(e.tagName));
  for (const h of hosts) {
    const b = [...h.shadowRoot.querySelectorAll(`[data-id="${id}"]`)].find((x) => x.getClientRects().length);
    if (b) { b.click(); return true; }
  }
  return false;
}, id);
const clickSel = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel);

/* ── Surfaces: how to open each one and the states to walk ─────────────────── */
const SURFACES = {
  till: {
    vps: ['phone', 'phoneL', 'ipad', 'ipadL', 'desktop'],
    flag: 'kiwiSkin2027:till',
    async open(page) {
      await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
      await page.evaluate(() => doOpenService());
      await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
      await sleep(900);
    },
    states: {
      floor: async (page, on) => { on ? await kitNav(page, 'floor') : await clickSel(page, '.mode-pill[data-mode="salle"]'); },
      waiting: async (page, on) => { on ? await kitNav(page, 'waiting') : await clickSel(page, '.mode-pill[data-mode="waitlist"]'); },
      kitchen: async (page, on) => { on ? await kitNav(page, 'kitchen') : await clickSel(page, '#open-kds'); },
      clients: async (page, on) => {
        if (!on) await page.evaluate(() => { if (typeof closeKds === 'function') closeKds(); });
        on ? await kitNav(page, 'clients') : await clickSel(page, '.rail-links [data-kcb-navitem]');
      },
      more: async (page, on) => {
        if (!on) return 'skip';
        await kitNav(page, 'floor'); await sleep(300);
        if (!(await kitNav(page, 'more'))) throw new Error('no Plus entry');
      },
      order: async (page, on) => {
        await page.keyboard.press('Escape');
        if (on) { await kitNav(page, 'floor'); await sleep(200); await kitNav(page, 'takeaway'); }
        else { await page.evaluate(() => { if (window.KiwiClientsBook) window.KiwiClientsBook.close(); }); await clickSel(page, '.mode-pill[data-mode="vrap"]'); }
        await sleep(300);
        await clickSel(page, '#vrap-new-order');
        await page.waitForFunction(() => typeof menuItems !== 'undefined' && menuItems.length > 0, { timeout: 15000 });
        await sleep(400);
        await page.evaluate((on) => {
          if (on) {
            const g = document.querySelector('k-menu-grid');
            const tiles = g ? [...g.shadowRoot.querySelectorAll('[data-item]:not([data-opts]):not([aria-disabled="true"])')].slice(0, 3) : [];
            for (const b of tiles) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true })); b.click(); }
          } else [...document.querySelectorAll('#menu-grid .menu-item')].slice(0, 3).forEach((b) => b.click());
        }, on);
      },
      pay: async (page, on) => {
        if (on) {
          // On a phone the bill sits behind its peek bar.
          await page.evaluate(() => { const p = document.getElementById('rp-peek'); if (p && p.getClientRects().length) p.click(); });
          await sleep(400);
          const ok = await page.evaluate(() => { const b = document.querySelector('k-bill'); const w = b && b.shadowRoot.querySelector('[data-w="pay"]'); if (w) w.click(); return !!w; });
          if (!ok) throw new Error('no Take payment button');
        } else if (!(await clickSel(page, '#pay-charge'))) throw new Error('no pay button');
      },
    },
  },
  dashboard: {
    vps: ['phone', 'phoneL', 'ipad', 'ipadL', 'desktop'],
    flag: 'kiwiSkin2027:dashboard',
    async open(page) {
      await page.goto(base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
      await sleep(1500);
      await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d|استكشف/.test(x.textContent)); if (b) b.click(); });
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-nav="transactions"]', { timeout: 30000 });
      await sleep(1200);
    },
    // Filled at run time from the sidebar, in its order.
    states: null,
  },
  kds: {
    vps: ['ipad', 'ipadL', 'desktop'],
    flag: 'kiwiSkin2027:kds',
    api: 'kds',
    storage: { kiwiLiveMerchant: KDS_MERCHANT, kiwiPaired: '1' },
    async open(page) { await page.goto(base + '/kiwi-cuisine.html', { waitUntil: 'load', timeout: 60000 }); await sleep(3500); },
    states: { board: async () => {} },
  },
  team: {
    vps: ['phone', 'phoneL', 'ipad'],
    flag: 'kiwiSkin2027:team',
    async open(page) {
      await page.goto(base + '/kiwi-serveur.html', { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => typeof showScreen === 'function' && typeof renderAll === 'function', { timeout: 20000 });
      await page.evaluate(() => { showScreen('screen-main'); setTab('tables'); renderAll(); document.getElementById('screen-main').classList.remove('is-pre-hidden'); });
      await sleep(600);
    },
    states: {
      tables: async () => {},
      table: async (page) => { await page.evaluate(() => openTableDetail('T1')); },
      menu: async (page) => { await page.evaluate(() => { const b = document.querySelector('#td-footer [data-action="take-order"]'); if (!b) throw new Error('no take-order'); b.click(); }); },
      signin: async (page) => {
        await page.goto(base + '/kiwi-serveur.html?merchant=team-test', { waitUntil: 'load', timeout: 60000 });
        await sleep(2500);
      },
    },
  },
  ordering: {
    vps: ['phone', 'phoneL', 'ipad', 'desktop'],
    flag: 'kiwiSkin2027:ordering',
    api: 'order',
    async open(page) {
      await page.goto(base + '/OrderPro.html?s=sweep&t=12', { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('#screen-menu.is-active [data-card="short"]', { timeout: 15000 });
      // The welcome greeting covers the menu for its first seconds.
      await sleep(4000);
    },
    states: {
      menu: async () => {},
      item: async (page) => { await clickSel(page, '[data-card="long"]'); },
      cart: async (page) => {
        await page.evaluate(() => { const x = document.querySelector('#custom-sheet .sheet-x'); if (x && x.getClientRects().length) x.click(); });
        await sleep(300);
        await page.evaluate(() => { for (const id of ['short', 'couscous', 'the']) { const b = document.querySelector(`[data-add="${id}"]`); if (b) b.click(); } });
        await sleep(300);
        await clickSel(page, '#cart-pill');
      },
    },
  },
  access: {
    vps: ['phone', 'ipad', 'desktop'],
    flag: 'kiwiSkin2027:access',
    async open() {},
    states: {
      reset: async (page) => { await page.goto(base + '/reset.html', { waitUntil: 'load', timeout: 60000 }); await sleep(800); },
      printer: async (page) => { await page.goto(base + '/printer.html', { waitUntil: 'load', timeout: 60000 }); await sleep(800); },
    },
  },
};

/* ── The in-page audit ─────────────────────────────────────────────────────── */
// Walks the composed tree (open shadow roots included) and reports what a
// person would see go wrong: things off the screen, text cut or colliding,
// buttons covered or too small, untranslated words, bright panels in dark mode.
function audit({ touch, locale, theme }) {
  const vw = innerWidth, vh = innerHeight;
  const all = [];
  (function walk(n) { for (const el of n.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } })(document);
  const up = (el) => el.parentElement || (el.parentNode && el.parentNode.host) || null;
  const within = (inner, outer) => { for (let e = inner; e; e = up(e)) if (e === outer) return true; return false; };
  const sig = (el) => {
    const parts = [];
    for (let e = el, i = 0; e && i < 4; e = up(e), i++) {
      let s = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(s + '#' + e.id); break; }
      const c = [...e.classList].filter((x) => !/^is-|^has-|active|open|^k-anim/.test(x)).slice(0, 2);
      if (c.length) s += '.' + c.join('.');
      const d = e.getAttribute('data-id') || e.getAttribute('data-w') || e.getAttribute('data-action');
      if (d) s += `[${d}]`;
      parts.unshift(s);
      if (e.parentNode instanceof ShadowRoot) { parts.unshift(e.parentNode.host.tagName.toLowerCase() + '::'); break; }
    }
    return parts.join(' > ');
  };
  const deepAt = (x, y) => { let e = document.elementFromPoint(x, y); while (e && e.shadowRoot) { const i = e.shadowRoot.elementFromPoint(x, y); if (!i || i === e) break; e = i; } return e; };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    for (let e = el; e; e = up(e)) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return null;
      if (e.hasAttribute('inert') || e.getAttribute('aria-hidden') === 'true') return null;
    }
    return r;
  };
  const scrollerX = (el) => { for (let e = up(el); e; e = up(e)) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return e; } return null; };
  const clipper = (el) => { for (let e = up(el); e; e = up(e)) { const o = getComputedStyle(e).overflowX; if (o === 'hidden' || o === 'clip') return e; } return null; };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  // A sheet, dialog or toast on top is meant to cover the page under it.
  const OVER = /sheet|modal|drawer|dialog|backdrop|overlay|scrim|toast|popover|k-more/i;
  const layers = all.filter((e) => (e.matches('[aria-modal="true"],dialog[open],[role="dialog"],[role="alertdialog"]') || (OVER.test(e.id + ' ' + e.className + ' ' + e.tagName) && ['fixed', 'absolute'].includes(getComputedStyle(e).position))) && shown(e));
  const transient = (el) => { for (let e = el; e; e = up(e)) if (/toast/i.test(e.id + ' ' + e.className) || e.matches('[role="status"],[aria-live]')) return true; return false; };
  const underLayer = (el) => layers.length > 0 && !layers.some((l) => within(el, l));
  const onTop = (el, r) => { const h = deepAt(r.left + r.width / 2, r.top + r.height / 2); return h && (within(h, el) || within(el, h)); };
  const out = [];
  const add = (kind, el, detail, sev) => out.push({ kind, sev, sig: sig(el), text: (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60), detail });
  const INTERACTIVE = 'button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=menuitem],[role=switch],[role=checkbox],[tabindex="0"]';

  const doc = document.documentElement;
  if (doc.scrollWidth > vw + 1) out.push({ kind: 'page-scrolls-sideways', sev: 3, sig: 'html', text: '', detail: `${doc.scrollWidth}px wide on a ${vw}px screen` });

  // A page that stays light in dark mode is one finding, not one per panel.
  const bodyBg = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/.exec(getComputedStyle(document.body).backgroundColor);
  const pageLight = !!bodyBg && (0.2126 * bodyBg[1] + 0.7152 * bodyBg[2] + 0.0722 * bodyBg[3]) / 255 > 0.75;
  if (theme === 'dark' && pageLight) out.push({ kind: 'page-stays-light-in-dark', sev: 1, sig: 'body', text: '', detail: getComputedStyle(document.body).backgroundColor });
  const texts = [];
  for (const el of all) {
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'svg' || el.closest('svg')) continue;
    const r = shown(el);
    if (!r) continue;
    const s = getComputedStyle(el);
    const t = ownText(el);
    const isInter = el.matches(INTERACTIVE);
    // Off the screen: partly past the left or right edge, not inside a sideways scroller.
    if ((isInter || t) && r.right > 0 && r.left < vw && (r.left < -1 || r.right > vw + 1) && !scrollerX(el)) {
      const c = clipper(el);
      const cr = c && c.getBoundingClientRect();
      if (!c || cr.left < -1 || cr.right > vw + 1) add('off-screen', el, `${Math.round(r.left)}..${Math.round(r.right)} on a ${vw}px screen`, isInter ? 3 : 2);
    }
    // Screen-reader-only text (1px boxes, clipped) is meant to be invisible.
    const srOnly = r.width <= 2 || r.height <= 2 || (s.clip && s.clip !== 'auto') || (s.clipPath && s.clipPath.startsWith('inset(50%'));
    if (t && t.length > 1 && !srOnly) {
      // Cut text: wider than its box with the overflow hidden, or an ellipsis.
      if (s.display !== 'inline' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
        const ell = s.textOverflow === 'ellipsis';
        if (s.overflowX === 'visible') add('text-spills-out', el, `${el.scrollWidth}px of text in a ${el.clientWidth}px box`, 2);
        else add(ell ? 'text-truncated' : 'text-cut', el, `${el.scrollWidth}px of text in a ${el.clientWidth}px box`, ell ? 1 : 2);
      }
      if (s.display !== 'inline' && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 3 && s.overflowY !== 'visible' && s.overflowY !== 'auto' && s.overflowY !== 'scroll')
        add('text-cut-vertically', el, `${el.scrollHeight}px tall text in a ${el.clientHeight}px box`, 2);
      if (s.fontStyle === 'italic') add('italic-text', el, 'brand rule: type is roman', 1);
      const data = /\b(nm|n|dish-name|label|k-pnav__vn|tc-name)\b/.test(typeof el.className === 'string' ? el.className : '');
      if (locale === 'ar' && !data && !el.closest('[translate="no"],[lang]:not([lang^="ar"])')) {
        if (/[A-Za-zÀ-ÿ]{3,}/.test(t) && (/[éèêàçùâîôû]/i.test(t) || /\b(le|la|les|des|du|de|et|pour|avec|sur|une|un|au|aux|vos|votre|nouvelle?|commande|payer|annuler|valider|retour|fermer|ajouter|aucun|aucune|tout|toutes?)\b/i.test(t)))
          add('french-in-arabic', el, t.slice(0, 80), 2);
      }
      texts.push({ el, r });
    }
    if (isInter) {
      // Covered: the centre of a fully visible control lands on something else that is not a big overlay.
      if (r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh && !underLayer(el)) {
        const hit = deepAt(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && !within(hit, el) && !within(el, hit)) {
          const hr = hit.getBoundingClientRect();
          // A floating bar is fine over content the person can still scroll out from under it.
          const sc = (() => { for (let e = up(el); e; e = up(e)) { const o = getComputedStyle(e).overflowY; if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 1) return e; } return document.scrollingElement; })();
          const left = sc.scrollHeight - sc.clientHeight - sc.scrollTop;
          const scrollsOut = hr.top > r.top && left >= r.bottom - hr.top + 4;
          if (hr.width * hr.height < vw * vh * 0.5 && !scrollsOut) add('control-covered', el, 'covered by ' + sig(hit), 3);
        }
      }
      if (touch && !el.matches('input[type=checkbox],input[type=radio]')) {
        const m = Math.min(r.width, r.height);
        if (m < 44 && !(tag === 'A' && s.display === 'inline')) add('small-tap-target', el, `${Math.round(r.width)}×${Math.round(r.height)}px`, m < 32 ? 2 : 1);
      }
      if (!t && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.getAttribute('title') && !(el.innerText || '').trim() && !el.querySelector('img[alt]:not([alt=""])'))
        add('control-without-name', el, 'no text and no aria-label', 2);
    }
    if (tag === 'IMG' && el.complete && el.naturalWidth === 0) add('broken-image', el, el.getAttribute('src') || '', 2);
    // Panels: bright in dark mode, pure white in light mode.
    if (r.width * r.height > vw * vh * 0.06) {
      const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(s.backgroundColor);
      if (m && (m[4] === undefined || Number(m[4]) > 0.8)) {
        const L = (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
        if (theme === 'dark' && L > 0.75 && !pageLight) add('bright-panel-in-dark', el, s.backgroundColor, 3);
        if (theme === 'light' && m[1] === '255' && m[2] === '255' && m[3] === '255') add('pure-white-panel', el, 'brand rule: --paper, never #fff', 1);
      }
    }
  }
  // Text on text: two pieces of text drawn over each other.
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w < 4 || h < 4 || w * h < 40) continue;
    if (w * h < 0.2 * Math.min(a.r.width * a.r.height, b.r.width * b.r.height)) continue;
    if (within(a.el, b.el) || within(b.el, a.el)) continue;
    if (transient(a.el) || transient(b.el) || !onTop(a.el, a.r) || !onTop(b.el, b.r)) continue;
    const x = Math.max(a.r.left, b.r.left) + w / 2, y = Math.max(a.r.top, b.r.top) + h / 2;
    if (x < 0 || y < 0 || x > vw || y > vh) continue;
    const hit = deepAt(x, y);
    if (hit && (within(hit, a.el) || within(hit, b.el) || within(a.el, hit) || within(b.el, hit))) add('text-overlaps-text', a.el, 'over ' + sig(b.el) + ' "' + ownText(b.el).slice(0, 30) + '"', 3);
  }
  // Page colour, so a dark run that did not turn dark shows up.
  const bg = getComputedStyle(document.body).backgroundColor;
  return { issues: out, bg, dir: doc.dir, lang: doc.lang };
}

async function axe(page) {
  if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
    return res.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => ({
      kind: 'axe:' + v.id, sev: v.impact === 'critical' ? 3 : 2,
      sig: v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ').slice(0, 160), text: '',
      detail: `${v.nodes.length} node(s). ` + (v.nodes[0] && v.nodes[0].any && v.nodes[0].any[0] && v.nodes[0].any[0].data && v.nodes[0].any[0].data.fgColor
        ? `${v.nodes[0].any[0].data.fgColor} on ${v.nodes[0].any[0].data.bgColor}, ${v.nodes[0].any[0].data.contrastRatio}:1` : v.help),
    }));
  }).catch((e) => [{ kind: 'axe-failed', sev: 1, sig: '', text: '', detail: String(e.message).slice(0, 120) }]);
}

/* ── Cells ─────────────────────────────────────────────────────────────────── */
const cells = [];
for (const [surface, S] of Object.entries(SURFACES)) {
  if (ONLY && !ONLY.has(surface)) continue;
  for (const vp of S.vps) {
    if (QUICK && !['phone', 'desktop', 'ipadL'].includes(vp)) continue;
    for (const theme of QUICK ? ['light'] : ['light', 'dark'])
      for (const locale of QUICK ? ['fr'] : ['fr', 'ar'])
        for (const skin of theme === 'dark' ? ['on'] : ['on', 'off']) cells.push({ surface, vp, theme, locale, skin });
  }
}
const shots = [];
let done = 0;
async function runCell(cell) {
  const S = SURFACES[cell.surface];
  const on = cell.skin === 'on';
  const storage = { ...(S.storage || {}), [S.flag]: on ? '1' : '0' };
  const { ctx, page } = await openPage(cell, storage, S.api);
  try {
    try { await S.open(page); } catch (e) { shots.push({ ...cell, state: 'open', failed: 'could not open: ' + String(e.message).split('\n')[0].slice(0, 160), issues: [] }); return; }
    let states = S.states;
    if (!states) {
      const navs = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-nav]')].map((a) => a.dataset.nav))].filter(Boolean));
      states = { accueil: async () => {} };
      for (const id of navs.filter((n) => n !== 'accueil').slice(0, 13)) states[id] = async (pg) => {
        await pg.keyboard.press('Escape');
        await pg.evaluate(() => document.querySelectorAll('.kiwi-backdrop .kiwi-modal-close').forEach((b) => b.click()));
        await sleep(200);
        await pg.evaluate((n) => document.querySelector(`[data-nav="${n}"]`).click(), id);
        await pg.waitForFunction((n) => window.Kiwi && window.Kiwi.activePage === n, { timeout: 8000 }, id).catch(() => {});
      };
    }
    for (const [state, go] of Object.entries(states)) {
      const shot = { ...cell, state, issues: [] };
      page.problems.length = 0;
      try {
        const r = await go(page, on);
        if (r === 'skip') continue;
        await sleep(900);
      } catch (e) { shot.failed = String(e.message).split('\n')[0].slice(0, 160); }
      const file = `${cell.surface}/${state}/${cell.vp}-${cell.theme}-${cell.locale}-${cell.skin}.jpg`;
      fs.mkdirSync(path.join(OUT, path.dirname(file)), { recursive: true });
      await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 55 }).catch(() => {});
      shot.file = file;
      const a = await page.evaluate(audit, { touch: VP[cell.vp].hasTouch, locale: cell.locale, theme: cell.theme }).catch((e) => ({ issues: [{ kind: 'audit-failed', sev: 1, sig: '', text: '', detail: String(e.message).slice(0, 120) }] }));
      shot.bg = a.bg; shot.dir = a.dir; shot.lang = a.lang;
      shot.issues = a.issues.concat(await axe(page));
      if (cell.locale === 'ar' && a.dir !== 'rtl') shot.issues.push({ kind: 'not-right-to-left', sev: 3, sig: 'html', text: '', detail: `dir=${a.dir}` });
      for (const p of page.problems) shot.issues.push({ kind: 'script-error', sev: 2, sig: '', text: '', detail: p });
      shots.push(shot);
    }
  } finally {
    await ctx.close().catch(() => {});
    done++;
    if (done % 10 === 0 || done === cells.length) console.log(`  ${done}/${cells.length} pages`);
  }
}
console.log(`sweep-2027: ${cells.length} pages, ${JOBS} at a time → ${path.relative(root, OUT)}`);
const t0 = Date.now();
const queueCells = cells.slice();
await Promise.all(Array.from({ length: JOBS }, async () => { while (queueCells.length) await runCell(queueCells.shift()); }));
await browser.close();
server.close();

/* ── Group: one finding per surface + kind + element, with where it shows ──── */
const groups = new Map();
for (const s of shots) {
  if (s.failed) {
    const k = `${s.surface}|step-failed|${s.state}`;
    if (!groups.has(k)) groups.set(k, { surface: s.surface, kind: 'step-failed', sig: s.state, sev: 3, text: '', detail: s.failed, on: [], off: [] });
    groups.get(k)[s.skin].push({ state: s.state, vp: s.vp, theme: s.theme, locale: s.locale, file: s.file });
  }
  for (const i of s.issues) {
    const k = `${s.surface}|${i.kind}|${i.sig}`;
    if (!groups.has(k)) groups.set(k, { surface: s.surface, kind: i.kind, sig: i.sig, sev: i.sev, text: i.text, detail: i.detail, on: [], off: [] });
    const g = groups.get(k);
    g.sev = Math.max(g.sev, i.sev);
    g[s.skin].push({ state: s.state, vp: s.vp, theme: s.theme, locale: s.locale, file: s.file, detail: i.detail });
  }
}
// A finding that only shows with 2027 off is the shipped design's, not ours.
const list = [...groups.values()].filter((g) => g.on.length).map((g) => ({ ...g, alsoShipped: g.off.length > 0 }))
  .sort((a, b) => b.sev - a.sev || Number(a.alsoShipped) - Number(b.alsoShipped) || b.on.length - a.on.length);
fs.writeFileSync(path.join(OUT, 'issues.json'), JSON.stringify({ run: RUN, pages: cells.length, shots: shots.length, findings: list }, null, 1));
fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(shots, null, 1));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEV = { 3: 'High', 2: 'Medium', 1: 'Low' };
const where = (arr) => { const m = new Map(); for (const w of arr) { const k = w.state; m.set(k, (m.get(k) || new Set()).add(`${w.vp} ${w.theme} ${w.locale}`)); } return [...m].map(([s, set]) => `<b>${esc(s)}</b>: ${esc([...set].slice(0, 6).join(', '))}${set.size > 6 ? ` +${set.size - 6}` : ''}`).join('<br>'); };
const counts = {};
for (const g of list) counts[g.kind] = (counts[g.kind] || 0) + 1;
const html = `<!doctype html><meta charset="utf-8"><title>Sweep 2027 · ${RUN}</title>
<style>body{font:14px/1.45 -apple-system,system-ui,sans-serif;margin:24px;background:#F7F5F0;color:#0A0F0D}h1{font-weight:600}
table{border-collapse:collapse;width:100%}td,th{border-top:1px solid #ddd;padding:8px;vertical-align:top;text-align:left}
.s3{color:#a01818;font-weight:600}.s2{color:#8a5a00}.s1{color:#555}.pre{color:#777;font-size:12px}img{width:220px;border:1px solid #ccc;margin:2px}
code{font:12px ui-monospace,monospace;word-break:break-all}</style>
<h1>Design 2027 sweep</h1>
<p>${cells.length} pages, ${shots.length} screens, ${list.length} findings on 2027 (${list.filter((g) => !g.alsoShipped).length} only on 2027), ${Math.round((Date.now() - t0) / 60000)} min.</p>
<p>${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}</p>
<table><tr><th>Severity</th><th>Surface</th><th>Finding</th><th>Where (2027 on)</th><th>Picture</th></tr>
${list.map((g) => `<tr><td class="s${g.sev}">${SEV[g.sev]}${g.alsoShipped ? '<div class="pre">also in shipped design</div>' : ''}</td><td>${esc(g.surface)}</td>
<td><b>${esc(g.kind)}</b><br><code>${esc(g.sig)}</code><br>${esc(g.text)}<br><span class="pre">${esc(g.detail)}</span></td>
<td>${where(g.on)}</td><td>${g.on[0] && g.on[0].file ? `<a href="${esc(g.on[0].file)}"><img loading="lazy" src="${esc(g.on[0].file)}"></a>` : ''}</td></tr>`).join('\n')}
</table>`;
fs.writeFileSync(path.join(OUT, 'report.html'), html);
console.log(`sweep-2027: ${list.length} findings (${list.filter((g) => g.sev === 3).length} high) → ${path.relative(root, path.join(OUT, 'report.html'))}`);
process.exit(0);
