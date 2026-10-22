#!/usr/bin/env node
/* Tickets #0149 + #0150 · Menu & modifiers tab bar and phone panels, measured.
 *
 * #0149: tapping a tab rebuilt the whole page and the bar jumped back to the
 * first tab. #0150: desktop-wide panels bled past the phone viewport.
 *
 * These checks used to read CSS and source patterns (a scrollLeft snapshot, a
 * media query, a minmax total). A pattern can be present and still lose to the
 * cascade, so every check is now a measurement in a real Chromium on the demo
 * dashboard, in English and in Arabic, on a phone (390) and a tablet (820),
 * with a modifier group whose name and choices are long:
 *   · the page never scrolls sideways;
 *   · the tab bar: on a tablet the open tab stays inside its strip after a
 *     tap and a re-render (the strip keeps its scroll), on a phone the tab
 *     picker sits on screen; the strips are lensed by liquid-lens.js;
 *   · the modifier cards, the option group editor and the item editor hold
 *     their long names: nothing runs past its card, sheet or screen, and no
 *     name is cut;
 *   · Analyse du menu: the performance table scrolls inside its wrapper, the
 *     matrix stacks under 1 100 px, keeps only its top labels and a short plot
 *     on a phone, its quadrant cards go single column under 480 px, and the
 *     peak-hours bars fit 390 and 360 px.
 * The demo store lives in this browser: no network, no merchant. Test sales
 * are labelled TEST KIWI; the recipe cost the matrix needs is a stub on this
 * page only.
 *
 *   node tools/menu-phone-test.mjs
 */
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

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('menu-phone', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* A long modifier group per language: the names a real carte carries. */
const LONG = {
  en: {
    group: 'Choose the side dish for the slow-cooked lamb tagine with preserved lemon and olives',
    choices: [['Extra-large portion of hand-cut rosemary potatoes with smoked paprika aioli', 12], ['Seasonal grilled vegetables with argan oil, cumin and fresh coriander', 8], ['Saffron couscous', 0]],
  },
  ar: {
    group: 'اختر الطبق الجانبي لطاجين لحم الغنم المطهو ببطء مع الحامض المصبّر والزيتون',
    choices: [['حصة كبيرة جدا من البطاطس المقطعة يدويا بإكليل الجبل وصلصة الفلفل الأحمر المدخن', 12], ['خضر موسمية مشوية بزيت الأركان والكمون والقزبر الطري', 8], ['كسكس بالزعفران', 0]],
  },
};

async function open(t, lang, width) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  const phone = width < 768;
  await page.setViewport({ width, height: phone ? 844 : 1180, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((l) => {
    try { localStorage.setItem('kiwiSkipOnboard', '1'); localStorage.setItem('kiwiLang', l); } catch (_) {}
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, lang);
  page.setDefaultNavigationTimeout(60000);
  t.step(`open the demo dashboard in ${lang} at ${width}`);
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!(window.KiwiMenuStore && window.Kiwi && window.Kiwi.handlers && window.KiwiRestaurantMenuWorkspace && window.KiwiFinance && window.KiwiSales), { timeout: 30000 });
  t.step('seed the example carte, a long modifier group and TEST KIWI sales');
  const gid = await page.evaluate((L) => {
    if (!KiwiMenuStore.items().length) KiwiMenuStore.loadExample();
    KiwiMenuStore.addOptGroup(L.group);
    const g = KiwiMenuStore.optionGroups().find((x) => x.name === L.group);
    L.choices.forEach(([n, p]) => KiwiMenuStore.addOptChoice(g.id, n, p, ''));
    KiwiMenuStore.updateOptGroup(g.id, { kind: 'many', required: true });
    const items = KiwiMenuStore.items();
    items.slice(0, 2).forEach((it) => KiwiMenuStore.setItemOpts(it.id, [...(it.opts || []), g.id]));
    /* Le coût de recette que la matrice exige, sur cette page seulement. */
    const R = window.KiwiRestaurantRecipes || {};
    window.KiwiRestaurantRecipes = Object.assign(Object.create(R), {
      get: () => ({ test: 1 }),
      metrics: (it) => ({ costComplete: true, theoreticalCost: +(it.price * (0.2 + (String(it.name).length % 5) / 10)).toFixed(2), actualCost: null }),
    });
    const now = Date.now();
    KiwiSales.addMany(null, items.slice(0, 10).map((x, i) => ({ ts: now - 3600000 * (i % 5) - 60000, amount: x.price * (1 + i % 4), label: 'TEST KIWI', lines: [{ itemId: x.id, name: x.name, qty: 1 + i % 4, total: x.price * (1 + i % 4) }] })));
    return g.id;
  }, LONG[lang]);
  t.step('open Menu from the sidebar');
  /* Sous la largeur du bureau, la barre latérale est un tiroir derrière le
     bouton menu (téléphone comme tablette). */
  if (await page.$eval('.kw-hamburger', (e) => !!e.offsetWidth).catch(() => false)) await tap(page, '.kw-hamburger');
  await tap(page, '.sidebar [data-nav="menu"]');
  await page.waitForFunction(() => document.body.classList.contains('page-menu') && !!document.querySelector('[data-menu-root] .rmw-shell .rmw-row'), { timeout: 20000 });
  await sleep(600);
  return { page, gid };
}

/* A real tap: scroll the control to the middle, make sure nothing sits on top
   of it, then click its centre. */
async function tap(page, sel) {
  await page.waitForSelector(sel, { visible: true, timeout: 10000 });
  await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await sleep(150);
  const hit = await page.$eval(sel, (e) => {
    const r = e.getBoundingClientRect(), p = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: p === e || e.contains(p), x: r.left + r.width / 2, y: r.top + r.height / 2, on: p && (p.className || p.tagName).toString().slice(0, 60) };
  });
  assert.ok(hit.ok, `tap ${sel} lands on it, not on ${hit.on}`);
  await page.mouse.click(hit.x, hit.y);
  await sleep(300);
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const closeSheet = async (page) => {
  const b = await page.$('.kiwi-backdrop .kiwi-modal-close');
  if (b) { await b.click(); await page.waitForSelector('.kiwi-backdrop', { hidden: true, timeout: 5000 }).catch(() => {}); await sleep(300); }
  else { await page.keyboard.press('Escape'); await sleep(400); }
};

/* What runs past a box, measured. Elements inside a sideways scroller that
   itself sits in the box scroll on purpose and are left out; invisible and
   zero-size nodes too. A text node cut short (scrollWidth past its box) counts
   as clipped. Returns short descriptions. */
async function spill(page, boxSel, opts = {}) {
  return page.evaluate((boxSel, opts) => {
    const box = boxSel === 'viewport' ? null : document.querySelector(boxSel);
    if (boxSel !== 'viewport' && !box) return ['(no ' + boxSel + ')'];
    const B = box ? box.getBoundingClientRect() : { left: 0, right: document.documentElement.clientWidth };
    const root = box || document.querySelector(opts.root || 'body');
    const out = [];
    const scrollerOf = (el) => { for (let p = el.parentElement; p && p !== root; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') return p; } return null; };
    const name = (e) => (e.tagName.toLowerCase() + (e.className && e.className.toString ? '.' + e.className.toString().trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 48);
    for (const e of root.querySelectorAll('*')) {
      if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (scrollerOf(e)) continue;
      if (opts.skip && e.closest(opts.skip)) continue;
      if (r.left < B.left - 1 || r.right > B.right + 1) out.push(`${name(e)} [${Math.round(r.left)}–${Math.round(r.right)} in ${Math.round(B.left)}–${Math.round(B.right)}]`);
      else if (opts.text && e.matches(opts.text) && e.scrollWidth > e.clientWidth + 1) out.push(`${name(e)} cut (${e.scrollWidth} > ${e.clientWidth})`);
    }
    return out;
  }, boxSel, opts);
}
const said = (list) => (list.length ? ' · ' + list.slice(0, 4).join(' · ') : '');

for (const lang of ['en', 'ar']) {
  for (const width of [390, 820]) {
    const phone = width < 768;
    const tag = `${lang} ${width}`;
    await S.run(`menu phone/tablet layout ${tag}`, async (t) => {
      const { page, gid } = await open(t, lang, width);
      check(await page.evaluate((l) => document.documentElement.dir === (l === 'ar' ? 'rtl' : 'ltr'), lang), `${tag}: the page reads ${lang === 'ar' ? 'right to left' : 'left to right'}`);
      check(await noSideScroll(page), `${tag}: no horizontal scroll on Menu`);

      t.step('the tab bar');
      const bar = await page.evaluate(() => {
        const pick = document.querySelector('[data-menu-root] .rmw-tabpick');
        const strip = document.querySelector('[data-menu-root] .mi-filters .mi-pill-row');
        const vis = (e) => !!(e && e.offsetWidth && getComputedStyle(e).visibility !== 'hidden');
        return { pick: vis(pick), strip: vis(strip) };
      });
      if (bar.strip && !bar.pick) {
        /* #0149 · the last tab, tapped: it stays in view, inside its strip, after
           the re-render it causes and after another one. */
        const last = await page.$$eval('[data-menu-root] .mi-filters [data-action="rmw-tab"]', (bs) => bs[bs.length - 1].dataset.tab);
        await page.$eval(`[data-menu-root] .mi-filters [data-tab="${last}"]`, (e) => e.click());
        await sleep(500);
        const inView = () => page.evaluate((id) => {
          const row = document.querySelector('[data-menu-root] .mi-filters .mi-pill-row'), on = row && row.querySelector('.mi-pill.on');
          if (!on) return { ok: false, why: 'no open tab' };
          const R = row.getBoundingClientRect(), P = on.getBoundingClientRect();
          const lens = row.querySelector('.kw-lens');
          return { ok: on.dataset.tab === id && P.left >= R.left - 1 && P.right <= R.right + 1, scroll: row.scrollLeft, lensed: row.hasAttribute('data-kw-lens') && !!lens, why: `${Math.round(P.left)}–${Math.round(P.right)} in ${Math.round(R.left)}–${Math.round(R.right)}` };
        }, last);
        let v = await inView();
        check(v.ok, `${tag}: the last tab, tapped, sits inside its strip (${v.why})`);
        check(v.lensed, `${tag}: the tab strip is lensed by liquid-lens.js`);
        const before = v.scroll;
        await page.evaluate(() => window.KiwiRestaurantMenuWorkspace.render());
        await sleep(400);
        v = await inView();
        check(v.ok && Math.abs(v.scroll - before) <= 1, `${tag}: after a re-render the strip keeps its scroll (${before} → ${v.scroll}) and the open tab`);
        await page.$eval('[data-menu-root] .mi-filters [data-tab="menu"]', (e) => e.click());
      } else {
        check(bar.pick, `${tag}: a phone gets the tab picker, not a strip`);
        check((await spill(page, 'viewport', { root: '[data-menu-root] .mi-filters' })).length === 0, `${tag}: the tab picker sits on screen`);
      }
      await page.waitForSelector('.rmw-shell .rmw-row', { visible: true });
      await sleep(300);

      t.step('the sections row');
      const cats = await page.evaluate(() => {
        const row = document.querySelector('.rmw-cats'), R = row.getBoundingClientRect();
        return { lensed: row.hasAttribute('data-kw-lens') && !!row.querySelector('.kw-lens'), inside: R.left >= -1 && R.right <= document.documentElement.clientWidth + 1 };
      });
      check(cats.lensed && cats.inside, `${tag}: the sections row is lensed and stays on screen, scrolling inside itself`);

      t.step('the long modifier group card');
      await page.$eval(`.mi-group-card [data-action="rmw-group-edit"][data-arg="${gid}"]`, (e) => e.closest('.mi-group-card').setAttribute('data-test-card', ''));
      await page.$eval('[data-test-card]', (e) => e.scrollIntoView({ block: 'center' }));
      const card = await spill(page, '[data-test-card]', { text: '.mi-group-card-name, .mi-group-opt-pill, .mi-group-card-pill, .btn-slim' });
      check(card.length === 0, `${tag}: the long modifier card holds its name and choices, nothing cut or past its edge${said(card)}`);
      const cardOnScreen = await spill(page, 'viewport', { root: '.mi-groups-grid' });
      check(cardOnScreen.length === 0, `${tag}: the modifier cards stay on screen${said(cardOnScreen)}`);
      check(await noSideScroll(page), `${tag}: no horizontal scroll with the long modifiers`);

      t.step('the option group editor');
      await tap(page, `[data-test-card] [data-action="rmw-group-edit"]`);
      await page.waitForSelector('.kiwi-modal .rmw-og', { visible: true });
      await sleep(500);
      const ogScreen = await spill(page, 'viewport', { root: '.kiwi-backdrop' });
      check(ogScreen.length === 0, `${tag}: the option group editor stays on screen${said(ogScreen)}`);
      const og = await spill(page, '.kiwi-modal', { text: '.rmw-og-segi span, .rmw-og-cols span, label > span, .kb, button' });
      check(og.length === 0, `${tag}: inside the option group editor nothing runs past the sheet or is cut${said(og)}`);
      const rows = await page.$$eval('.kiwi-modal .rmw-og-row', (rs) => rs.map((r) => { const R = r.getBoundingClientRect(), n = r.querySelector('[data-choice-name]').getBoundingClientRect(); return { inRow: n.left >= R.left - 1 && n.right <= R.right + 1, w: Math.round(n.width) }; }));
      check(rows.length >= 3 && rows.every((r) => r.inRow && r.w >= 120), `${tag}: each long choice keeps a name field of at least 120 px inside its row (${rows.map((r) => r.w).join(', ')})`);
      await closeSheet(page);

      t.step('the item editor with the long modifiers');
      const first = await page.evaluate((g) => KiwiMenuStore.items().find((x) => (x.opts || []).includes(g)).id, gid);
      await tap(page, `.rmw-row[data-rmw-row="${first}"] .rmw-row-main`);
      await page.waitForSelector('.kiwi-modal [data-price]', { visible: true });
      await sleep(500);
      const itScreen = await spill(page, 'viewport', { root: '.kiwi-backdrop' });
      check(itScreen.length === 0, `${tag}: the item editor stays on screen${said(itScreen)}`);
      const it = await spill(page, '.kiwi-modal');
      check(it.length === 0, `${tag}: inside the item editor nothing runs past the sheet${said(it)}`);
      await closeSheet(page);
      check(await noSideScroll(page), `${tag}: no horizontal scroll after both editors`);

      t.step('Analyse du menu · performance');
      await page.evaluate(() => window.KiwiFinance.open('performance'));
      await page.waitForSelector('.rmw-performance .mi-list-wrap', { visible: true, timeout: 15000 });
      await sleep(600);
      check(await noSideScroll(page), `${tag}: no horizontal scroll on the performance tab`);
      const wrap = await page.evaluate(() => {
        const w = document.querySelector('.rmw-performance .mi-list-wrap'), R = w.getBoundingClientRect(), tb = w.querySelector('table');
        return { inside: R.left >= -1 && R.right <= document.documentElement.clientWidth + 1, wider: tb.scrollWidth > w.clientWidth + 1, scrolls: ['auto', 'scroll'].includes(getComputedStyle(w).overflowX), sw: tb.scrollWidth, cw: w.clientWidth };
      });
      check(wrap.inside && (!wrap.wider || wrap.scrolls), `${tag}: the performance table stays in its wrapper on screen and scrolls inside it (${wrap.sw} in ${wrap.cw})`);
      const mx = await page.evaluate(() => {
        const body = document.querySelector('.rmw-mx-body');
        if (!body) return null;
        const kids = [...body.children].filter((e) => e.offsetWidth).map((e) => e.getBoundingClientRect());
        const plot = document.querySelector('.rmw-mx-plot').getBoundingClientRect();
        const labs = [...document.querySelectorAll('.rmw-mx-lab')].filter((e) => e.offsetWidth);
        const quads = [...document.querySelectorAll('.rmw-mx-quads > *')].filter((e) => e.offsetWidth).map((e) => Math.round(e.getBoundingClientRect().left));
        return { stacked: kids.length >= 2 && kids[1].top >= kids[0].bottom - 1, plotH: Math.round(plot.height), loose: labs.filter((e) => !e.classList.contains('keep')).length, labs: labs.length, quadCols: new Set(quads).size };
      });
      check(!!mx, `${tag}: the menu matrix renders with costed sales`);
      check(mx.stacked, `${tag}: under 1 100 px the matrix and its quadrant panel stack`);
      if (phone) {
        check(mx.plotH <= 300 && mx.loose === 0, `${tag}: on a phone the plot is short (${mx.plotH} px) and only the top names are labelled (${mx.labs})`);
      }
      const mxSpill = await spill(page, 'viewport', { root: '.rmw-mx' });
      check(mxSpill.length === 0, `${tag}: nothing in the matrix runs past the screen${said(mxSpill)}`);
      if (phone) {
        await page.setViewport({ width: 470, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        await sleep(500);
        const cols = await page.evaluate(() => new Set([...document.querySelectorAll('.rmw-mx-quads > *')].filter((e) => e.offsetWidth).map((e) => Math.round(e.getBoundingClientRect().left))).size);
        check(cols === 1, `${lang} 470: under 480 px the quadrant cards go single column (${cols} column)`);
        await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        await sleep(300);
      }

      t.step('Analyse du menu · peak hours');
      await page.evaluate(() => window.KiwiFinance.open('hours'));
      await page.waitForSelector('.rmw-hours-row', { visible: true, timeout: 15000 });
      await sleep(500);
      for (const w of phone ? [width, 360] : [width]) {
        if (w !== width) { await page.setViewport({ width: w, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); await sleep(500); }
        const hrs = await page.evaluate(() => [...document.querySelectorAll('.rmw-hours-row')].map((r) => { const R = r.getBoundingClientRect(); return { inside: R.left >= -1 && R.right <= document.documentElement.clientWidth + 1, fits: r.scrollWidth <= r.clientWidth + 1 }; }));
        check(hrs.length > 0 && hrs.every((r) => r.inside && r.fits), `${lang} ${w}: every peak-hours bar fits the screen (${hrs.length} rows)`);
        check(await noSideScroll(page), `${lang} ${w}: no horizontal scroll on the peak-hours tab`);
      }
      check(page.errors.length === 0, `${tag}: no page error ${page.errors.join(' | ')}`);
    });
  }
}

server.close();
if (!S.counts.failed && !S.counts.infra) console.log(`\n✓ menu-phone-test · ${checks} measured checks`);
await S.finish();
