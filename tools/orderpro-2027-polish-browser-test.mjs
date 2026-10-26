#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
/* ═══════════════════════════════════════════════════════════════════════════
 * orderpro-2027-polish-browser-test · the details of the guest app in the
 * 2027 skin (assets/kit/ordering.css, polish pass of 2026-10-24), on the
 * phones guests open it on, in FR, EN and AR, plus the iPad pane.
 *
 * Holds what the pass fixed, so it cannot quietly come back:
 *   · figures in the Latin face (no mono: Arabic set in it fell apart, "د ر هـ");
 *   · every tap target a finger can hit, 44 at least (chips, the add button,
 *     the cart stepper, measured with elementFromPoint, so hit slop counts);
 *   · dish names start where the reader starts (they were set left in Arabic);
 *   · cards in a row end on one line; a long name never squeezes the cart row;
 *   · the toast hides the globe instead of letting it peek out;
 *   · the options sheet has a close button; on the iPad it is a centred form;
 *   · the table screen's back button clears the store's name, and its keypad
 *     keeps 1 2 3 in Arabic; the takeaway number stays one line;
 *   · the formula tag is translated (it was "FORMULE" in every language).
 *
 * Static files, /api/* answered from fixtures in this file; the demo store
 * (?s=demo) needs no server at all.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const LONG = 'Tajine de poulet aux citrons confits, olives violettes et frites maison';
const WORD = 'Supercalifragilisticexpialidocious-Cabernet-Sauvignon';
const MENU = {
  name: 'Le Restaurant Panoramique de la Corniche', type: 'restaurant', orderpro: true, menuLangs: false, menuNutrition: false, zone: '',
  shop: null,
  menu: {
    cats: [{ id: 'plats', name: 'Plats' }, { id: 'vins', name: 'Vins' }],
    opts: [{ id: 'taille', name: 'Taille', kind: 'one', required: true, choices: [{ id: 's', name: 'Petite', price: 0 }, { id: 'l', name: 'Grande', price: 30 }] }],
    items: [
      { id: 'long', catId: 'plats', name: LONG, desc: 'Mijoté quatre heures', price: 1250.5, opts: ['taille'], avail: true, tag: 'new' },
      { id: 'short', catId: 'plats', name: 'Harira', desc: '', price: 25, opts: [], avail: true },
      { id: 'word', catId: 'vins', name: WORD, desc: '75 cl', price: 99999, opts: [], avail: true },
      { id: 'formula', catId: 'plats', name: 'Menu midi', desc: '', price: 85, opts: [], avail: true,
        formula: { slots: [{ id: 's1', label: 'Entrée', min: 1, max: 1, choices: [{ itemId: 'short' }] }] } },
    ],
  },
};
const API = {
  '/api/menu': MENU,
  '/api/order/session': { ok: true, session: 'ses-polish', mode: 'table', table: '12', status: 'open' },
};

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const body = API[url.pathname];
    res.writeHead(body ? 200 : 503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(body || {}));
  }
  const file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const S = suite('orderpro-2027-polish-browser-test', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (ok, msg) => { if (!ok) throw new Error(msg); checks++; console.log('  ✓ ' + msg); };

async function open(tr, ctx, query, { width = 375, height = 667, lang = 'fr' } = {}) {
  const page = tr.watch(await ctx.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e.message).slice(0, 200)));
  await page.setViewport({ width, height, isMobile: width < 768, hasTouch: true });
  await page.evaluateOnNewDocument((l) => {
    try { localStorage.setItem('kiwiSkin2027:ordering', '1'); localStorage.setItem('orderProLang', l); } catch (_) {}
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, lang);
  await page.goto(`${base}/OrderPro.html?${query}`, { waitUntil: 'load' });
  return page;
}
const menuReady = (page, card) => page.waitForSelector(`#screen-menu.is-active [data-card="${card}"]`, { timeout: 15000 });

/* The target under a finger: true when every point of a 44 × 44 square
   centred on the element lands on it (or inside it). */
const HIT = `(sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }).map((e) => {
  const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const pts = [[cx, cy - 21], [cx, cy + 21], [cx - 21, cy], [cx + 21, cy]];
  const miss = pts.map(([x, y]) => { const h = document.elementFromPoint(x, y); return h && (h === e || e.contains(h)) ? '' : Math.round(x - cx) + ',' + Math.round(y - cy) + ':' + (h ? h.className || h.tagName : 'none'); }).filter(Boolean);
  return { name: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24) + (miss.length ? ' [' + miss.join(' ') + ']' : ''), ok: !miss.length };
})`;

try {
  await S.run('phone FR · figures, targets, card rows, toast, options sheet', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=orderpro locale=fr viewport=phone
    const page = await open(tr, ctx, 's=demo&t=4');
    await menuReady(page, 'espresso');
    await sleep(2600);
    const font = await page.$eval('.dish-price', (e) => getComputedStyle(e).fontFamily);
    check(!/JetBrains|monospace/i.test(font), `prices in the Latin face, not mono (${font.split(',')[0]})`);
    for (const sel of ['.menu-tab', '.service-pill', '.dish-add']) {
      const hits = await page.evaluate(`(${HIT})(${JSON.stringify(sel)})`);
      const bad = hits.filter((h) => !h.ok);
      check(hits.length > 0 && !bad.length, `${sel}: a 44 target under the finger (${hits.length} measured${bad.length ? ', short: ' + bad.map((b) => b.name).join(', ') : ''})`);
    }
    const rows = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#menu-list .dish-card')].slice(0, 6).map((c) => ({ top: Math.round(c.getBoundingClientRect().top), price: Math.round(c.querySelector('.dish-price').getBoundingClientRect().top) }));
      const byRow = {}; cards.forEach((c) => { (byRow[c.top] = byRow[c.top] || []).push(c.price); });
      return Object.values(byRow).filter((r) => r.length > 1).map((r) => Math.max(...r) - Math.min(...r));
    });
    check(rows.length > 0 && rows.every((d) => d <= 1), `cards in a row put their prices on one line (offsets ${rows.join(', ')})`);

    await page.evaluate(() => document.querySelector('[data-add="sparkling"]').scrollIntoView({ block: 'center' }));
    await sleep(300);
    await page.click('[data-add="sparkling"]');
    await page.waitForSelector('.toast.is-visible', { timeout: 3000 });
    await sleep(350);
    const globe = await page.$eval('.lang-picker', (e) => getComputedStyle(e).opacity);
    check(globe === '0', `the toast takes the top: the globe steps away while it shows (opacity ${globe})`);

    await page.evaluate(() => document.querySelector('[data-card="sandwich-thon"]').click());
    await page.waitForSelector('#custom-sheet.is-open', { timeout: 3000 });
    await sleep(500);
    const x = await page.$eval('#custom-sheet .sheet-x', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, label: e.getAttribute('aria-label') }; });
    check(x.w >= 44 && x.h >= 44 && x.label === 'Fermer', `the options sheet has a close button, 44, named (${JSON.stringify(x)})`);
    const chips = await page.$$eval('#custom-options .option-chip', (els) => els.map((e) => e.getBoundingClientRect().height));
    check(chips.length > 0 && chips.every((h) => h >= 44), `option chips are 44 tall (${Math.min(...chips)})`);
    await page.click('#custom-sheet .sheet-x');
    await page.waitForFunction(() => !document.querySelector('#custom-sheet.is-open'), { timeout: 3000 });
    check(true, 'the close button closes it');
    check(!page.errors.length, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('phone AR · names start at the right, the cart never squeezes a name', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=orderpro locale=ar viewport=phone
    const page = await open(tr, ctx, 's=polish&t=12', { width: 390, height: 844, lang: 'ar' });
    await menuReady(page, 'short');
    await sleep(800);
    const card = await page.$eval('[data-card="short"]', (c) => {
      const n = c.querySelector('.dish-name'), m = c.querySelector('.dish-meta');
      const range = document.createRange(); range.selectNodeContents(n); const t = range.getBoundingClientRect(); const mr = m.getBoundingClientRect();
      return { dir: document.documentElement.dir, align: getComputedStyle(n).textAlign, gapRight: Math.round(mr.right - t.right), gapLeft: Math.round(t.left - mr.left), font: getComputedStyle(c.querySelector('.dish-price')).fontFamily };
    });
    check(card.dir === 'rtl' && card.gapRight < card.gapLeft, `a dish name starts at the right in Arabic (${JSON.stringify(card)})`);
    check(!/JetBrains|monospace/i.test(card.font), 'the price in Arabic is in the Latin and Arabic faces, not mono');
    const tag = await page.$eval('[data-card="formula"] .dish-meta .dish-tag', (e) => ({ text: e.textContent.trim(), pos: getComputedStyle(e).position }));
    check(tag.text === 'منيو كامل' && tag.pos === 'static', `the formula tag is translated and sits in the card (${JSON.stringify(tag)})`);

    await page.click('[data-add="word"]');
    await sleep(400);
    await page.evaluate(() => document.querySelector('[data-card="long"]').click());
    await page.waitForSelector('#custom-sheet.is-open', { timeout: 3000 });
    await sleep(400);
    await page.evaluate(() => document.querySelector('#custom-options .option-chip').click());
    await page.click('#custom-add-btn');
    await sleep(500);
    await page.evaluate(() => document.getElementById('cart-pill').click());
    await page.waitForSelector('#cart-sheet.is-open', { timeout: 3000 });
    await sleep(600);
    const rows = await page.$$eval('#cart-items .cart-row', (els) => els.map((row) => {
      const l = row.querySelector('.label').getBoundingClientRect();
      const q = row.querySelector('.qty').getBoundingClientRect();
      const p = row.querySelector('.row-price').getBoundingClientRect();
      const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return { w: Math.round(l.width), rowW: Math.round(row.getBoundingClientRect().width), clash: overlap(l, q) || overlap(l, p) || overlap(q, p) };
    }));
    check(rows.length === 2 && rows.every((r) => !r.clash && r.w >= r.rowW * 0.6), `each cart line gives its name the row and nothing overlaps (${JSON.stringify(rows)})`);
    const steps = await page.evaluate(`(${HIT})('#cart-items .qty button')`);
    check(steps.length === 4 && steps.every((s) => s.ok), 'the cart stepper: a 44 target under the finger' + (steps.every((s) => s.ok) ? '' : ' ' + JSON.stringify(steps)));
    check(!page.errors.length, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('phone · table number, takeaway number', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    for (const lang of forLocales(['fr', 'ar'])) {
      // coverage: surface=orderpro locale=fr viewport=phone
      // coverage: surface=orderpro locale=ar viewport=phone
      const page = await open(tr, ctx, 's=demo', { lang });
      await page.waitForSelector('#screen-mode.is-active', { timeout: 15000 });
      await sleep(2600);
      await page.click('[data-mode="table"]');
      await page.waitForSelector('#screen-table.is-active', { timeout: 3000 });
      await sleep(700);
      const t = await page.evaluate(() => {
        const s = document.getElementById('screen-table');
        const b = s.querySelector('.back-affordance').getBoundingClientRect();
        const m = s.querySelector('.brand-mark').getBoundingClientRect();
        const g = document.querySelector('.lang-picker').getBoundingClientRect();
        const clash = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
        const keys = ['1', '3'].map((k) => s.querySelector(`[data-key="${k}"]`).getBoundingClientRect().left);
        return { brand: clash(b, m), globe: clash(b, g), oneLeftOfThree: keys[0] < keys[1] };
      });
      check(!t.brand && !t.globe && t.oneLeftOfThree, `${lang}: the back button clears the name and the globe, the keypad reads 1 2 3 (${JSON.stringify(t)})`);
      check(!page.errors.length, `${lang}: no page error` + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    }
    // coverage: surface=orderpro locale=fr viewport=phone
    const page = await open(tr, ctx, 's=demo');
    await page.waitForSelector('#screen-mode.is-active', { timeout: 15000 });
    await sleep(2600);
    await page.click('[data-mode="takeout"]');
    await menuReady(page, 'sparkling');
    await sleep(700);
    await page.evaluate(() => { document.querySelector('[data-add="sparkling"]').click(); document.getElementById('cart-pill').click(); });
    await sleep(700);
    await page.evaluate(() => document.getElementById('send-btn').click());
    await page.waitForSelector('#screen-cashier.is-active', { timeout: 5000 });
    await sleep(700);
    const n = await page.$eval('.cashier-number', (e) => ({ h: e.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(e).fontSize), w: e.scrollWidth, cw: e.parentElement.clientWidth, text: e.textContent }));
    check(n.h < n.fs * 1.5 && n.w <= n.cw, `the takeaway number stays one line inside the screen (${JSON.stringify(n)})`);
    check(!page.errors.length, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('iPad · the options sheet is a centred form, the toast stays over the menu', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=orderpro locale=en viewport=tablet
    const page = await open(tr, ctx, 's=polish&t=12', { width: 820, height: 1180, lang: 'en' });
    await menuReady(page, 'short');
    await sleep(800);
    const tag = await page.$eval('[data-card="formula"] .dish-meta .dish-tag', (e) => e.textContent.trim());
    check(tag === 'Set menu', `the formula tag in English (${tag})`);
    await page.click('[data-add="short"]');
    await page.waitForSelector('.toast.is-visible', { timeout: 3000 });
    await sleep(350);
    const toast = await page.evaluate(() => { const t = document.querySelector('.toast').getBoundingClientRect(); const p = document.querySelector('#cart-sheet .cart-sheet-panel').getBoundingClientRect(); return { right: Math.round(t.right), pane: Math.round(p.left) }; });
    check(toast.right <= toast.pane, `the toast ends before the cart pane (${JSON.stringify(toast)})`);
    await page.evaluate(() => document.querySelector('[data-card="long"]').click());
    await page.waitForSelector('#custom-sheet.is-open', { timeout: 3000 });
    await sleep(700);
    const box = await page.$eval('#custom-sheet .custom-sheet-panel', (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), l: Math.round(r.left), r: Math.round(innerWidth - r.right), t: Math.round(r.top), b: Math.round(innerHeight - r.bottom), radius: getComputedStyle(e).borderBottomLeftRadius }; });
    check(box.w <= 540 && Math.abs(box.l - box.r) <= 2 && box.b > 24 && Math.abs(box.t - box.b) <= 2 && box.radius === '28px', `a form sheet of 540 at most, centred, every corner 28 (${JSON.stringify(box)})`);
    check(!page.errors.length, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });
} finally {
  server.close();
}
console.log(`✓ orderpro-2027-polish-browser-test · ${checks} checks`);
await S.finish();
