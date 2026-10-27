#!/usr/bin/env node
/* till-phone-tabs-browser-test · the phone form of the 2027 till (§10.20,
 * §13.2, §13.3): below 768 wide the kit's tab capsule takes the 88 px rail's
 * place, painted from the same items and routed through the same
 * rail.select, behind kiwiSkin2027:till, on the demo till (not paired, every
 * /api call refused), in a real Chromium, with real touches at the points the
 * cashier would touch.
 *
 *   node tools/till-phone-tabs-browser-test.mjs
 *
 * What it holds:
 *   · 390 × 844, FR: no rail on screen and no hamburger; the capsule floats at
 *     the bottom with the grid's side margin, one item per rail item, each at
 *     least 44 × 44 and the top element at its own centre; the menu takes the
 *     full width in two columns;
 *   · every tab reaches its page, and the bar's lens follows: Takeaway, Waiting,
 *     Kitchen (the capsule over the kitchen), Customers (the book ends above
 *     the capsule), Floor; More opens the More sheet and the lens stays on the
 *     page;
 *   · the bill bar rests 8 above the capsule and takes the touch; it opens the
 *     bill sheet over the capsule; Take payment draws the payment inside the
 *     sheet, not on a blank layer; Back, then the bar again closes the sheet;
 *   · six labels do not fit 358 in FR: every item is icon only at once, its
 *     label kept for screen readers, and a 500 ms still press shows the label
 *     HUD without navigating;
 *   · the sync state on a phone: a dot on More, its words in More's name, a
 *     row at the top of More that opens the indicator's popover;
 *   · 390 × 844, AR, dark: the capsule is mirrored (Floor at the right), on the
 *     dark chrome;
 *   · 1180 × 820: nothing changes: the 88 rail, no capsule, no data-k-tabs; and
 *     a phone window widened to 1180 gets its rail back;
 *   · no page error anywhere. */
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
const S = suite('till-phone-tabs', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* The demo till, unlocked, at a given size, language and theme. */
async function open(tr, { width, height, lang = 'fr', theme = 'light' }) {
  const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const phone = width < 768;
  await page.setViewport({ width, height, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((l, th) => {
    localStorage.setItem('kiwiSkin2027:till', '1');
    localStorage.setItem('kiwiCaisseLang', l);
    localStorage.setItem('kiwiCaisseTheme', th);
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, lang, theme);
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await page.waitForFunction(() => { const r = document.querySelector('k-rail'); return r && r.shadowRoot && r.shadowRoot.querySelector('[data-id="floor"]'); }, { timeout: 20000 });
  await sleep(400);
  return { page, errors, phone };
}

/* Where a tab item is, and what the page has at its centre. */
const tabAt = (page, id) => page.evaluate((i) => {
  const bar = document.querySelector('k-tabbar');
  const it = bar && bar.shadowRoot.querySelector(`.it[data-id="${i}"]`);
  if (!it) return null;
  const r = it.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  let hit = document.elementFromPoint(x, y);
  while (hit && hit.shadowRoot && hit.shadowRoot.elementFromPoint) { const inner = hit.shadowRoot.elementFromPoint(x, y); if (!inner || inner === hit) break; hit = inner; }
  return { x, y, w: r.width, h: r.height, top: !!(hit && hit.closest && hit.closest('.it') === it) };
}, id);
/* A real touch (phone) or click at the item's centre. */
async function tapTab(page, id, phone = true) {
  const p = await tabAt(page, id);
  assert.ok(p, `tab ${id} exists`);
  if (phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  await sleep(450);
}
const state = (page) => page.evaluate(() => {
  const bar = document.querySelector('k-tabbar');
  const kcb = document.getElementById('kcb-root');
  const kds = document.getElementById('kds-screen');
  return {
    value: bar ? bar.getAttribute('value') : null,
    mode: typeof mode !== 'undefined' ? mode : null,
    kds: !!(kds && kds.classList.contains('is-open')),
    clients: !!(kcb && kcb.style.display !== 'none'),
    kcbBottom: kcb ? Math.round(kcb.getBoundingClientRect().bottom) : null,
    capTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
    sheet: !!document.querySelector('k-sheet[open]'),
  };
});
const amount = (s) => Number(String(s).replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.'));

try {
  await S.run('390 × 844 · the capsule replaces the rail', async (tr) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=phone
    const { page, errors } = await open(tr, { width: 390, height: 844 });
    const g = await page.evaluate(() => {
      const rail = document.getElementById('kit-rail');
      const rr = rail ? rail.getBoundingClientRect() : null;
      const bar = document.querySelector('k-tabbar');
      const br = bar ? bar.getBoundingClientRect() : null;
      const items = bar ? [...bar.shadowRoot.querySelectorAll('.it')].map((a) => a.getAttribute('data-id')) : [];
      const railItems = (window.KiwiTillFrame.rail().items || []).map((it) => it.id);
      const ham = document.querySelector('.kw-hamburger');
      return {
        tabs: document.documentElement.hasAttribute('data-k-tabs'),
        railShown: !!(rr && rr.width > 0 && getComputedStyle(rail).display !== 'none'),
        bar: br && { left: br.left, right: br.right, bottom: br.bottom, height: br.height },
        items, railItems,
        ham: ham ? getComputedStyle(ham).display : 'none',
        vw: innerWidth, vh: innerHeight,
      };
    });
    check(g.tabs, 'the till marks the phone form (html[data-k-tabs])');
    check(!g.railShown, 'the 88 px rail is not on screen');
    check(g.ham === 'none', 'no hamburger: More replaces the shipped drawer');
    check(!!g.bar && Math.round(g.bar.left) === 16 && Math.round(g.vw - g.bar.right) === 16, `the capsule keeps the grid's side margin, 16 at 390 (${g.bar && Math.round(g.bar.left)} / ${g.bar && Math.round(g.vw - g.bar.right)})`);
    check(!!g.bar && Math.round(g.vh - g.bar.bottom) === 8 && Math.round(g.bar.height) >= 62, `the capsule sits 8 above the bottom, 62 tall (${g.bar && Math.round(g.vh - g.bar.bottom)}, ${g.bar && Math.round(g.bar.height)})`);
    check(g.items.join() === g.railItems.join() && g.items.includes('more'), `the capsule carries the rail's items, in order (${g.items.join(', ')})`);
    for (const id of g.items) {
      const p = await tabAt(page, id);
      check(p && p.w >= 44 && p.h >= 44 && p.top, `${id}: a ${Math.round(p.w)} × ${Math.round(p.h)} target, and nothing covers it`);
    }
    /* Takeaway, then the menu: full width, two columns. */
    await tapTab(page, 'takeaway');
    await page.evaluate(() => { const b = document.querySelector('#vrap-new-order'); if (b) b.click(); });
    await page.waitForFunction(() => menuItems.length > 0 && !document.querySelector('#vrap-builder').hidden, { timeout: 20000 });
    await sleep(300);
    const cols = await page.evaluate(() => {
      const xs = new Set([...document.querySelector('k-menu-grid').shadowRoot.querySelectorAll('[data-item]')].slice(0, 6).map((b) => Math.round(b.getBoundingClientRect().left)));
      return xs.size;
    });
    check(cols === 2, `the menu takes the full width in two columns (${cols})`);
    check(errors.length === 0, 'capsule: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('390 × 844 · every tab reaches its page', async (tr) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=phone
    const { page, errors } = await open(tr, { width: 390, height: 844 });
    let s = await state(page);
    const pageOf = { salle: 'floor', vrap: 'takeaway', waitlist: 'waiting' };
    check(s.value === pageOf[s.mode], `the capsule's lens is on the page the till opened on (${s.value}, ${s.mode})`);
    await tapTab(page, 'floor');
    s = await state(page);
    check(s.value === 'floor' && s.mode === 'salle', `Floor: the floor plan (${s.value}, ${s.mode})`);
    await tapTab(page, 'takeaway');
    s = await state(page);
    check(s.value === 'takeaway' && s.mode === 'vrap', `Takeaway: the takeaway page (${s.value}, ${s.mode})`);
    await tapTab(page, 'waiting');
    s = await state(page);
    check(s.value === 'waiting' && s.mode === 'waitlist', `Waiting: the waiting list (${s.value}, ${s.mode})`);
    await tapTab(page, 'kitchen');
    s = await state(page);
    check(s.value === 'kitchen' && s.kds, `Kitchen: the kitchen screen (${s.value}, ${s.kds})`);
    const over = await tabAt(page, 'floor');
    check(over && over.top, 'the capsule stays over the kitchen, so the cashier can leave it');
    await tapTab(page, 'clients');
    s = await state(page);
    check(s.value === 'clients' && s.clients && !s.kds, `Customers: the client book, the kitchen closed (${s.value}, ${s.clients}, ${s.kds})`);
    check(s.kcbBottom <= s.capTop - 8, `the book ends above the capsule (${s.kcbBottom} ≤ ${s.capTop} − 8)`);
    const out = await tabAt(page, 'floor');
    check(out && out.top, 'Floor is still reachable from the client book');
    await tapTab(page, 'floor');
    s = await state(page);
    check(s.value === 'floor' && s.mode === 'salle' && !s.clients && !s.kds, `Floor: the floor plan, the book closed (${s.value}, ${s.mode}, ${s.clients})`);
    await tapTab(page, 'more');
    s = await state(page);
    const heading = await page.evaluate(() => { const sh = document.querySelector('k-sheet[open]'); return sh ? sh.getAttribute('heading') : ''; });
    check(s.sheet && heading === 'Plus', `More opens the More sheet (${heading})`);
    check(s.value === 'floor', `More is not a destination: the lens stays on Floor (${s.value})`);
    await page.evaluate(() => document.querySelector('k-sheet[open]').removeAttribute('open'));
    check(errors.length === 0, 'tabs: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('390 × 844 · the bill bar above the capsule', async (tr) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=phone
    const { page, errors } = await open(tr, { width: 390, height: 844 });
    await tapTab(page, 'takeaway');
    await page.evaluate(() => { const b = document.querySelector('#vrap-new-order'); if (b) b.click(); });
    await page.waitForFunction(() => menuItems.length > 0 && !document.querySelector('#vrap-builder').hidden, { timeout: 20000 });
    await sleep(300);
    /* A real touch on the first plain tile. */
    const tile = await page.evaluate(() => {
      const b = [...document.querySelector('k-menu-grid').shadowRoot.querySelectorAll('[data-item]')].find((x) => !x.hasAttribute('data-opts') && x.getAttribute('aria-disabled') !== 'true');
      const r = b.getBoundingClientRect();
      return { id: b.getAttribute('data-item'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.tap(tile.x, tile.y);
    await sleep(500);
    const bar = await page.evaluate(() => {
      const p = document.getElementById('rp-peek').getBoundingClientRect();
      const cap = document.querySelector('k-tabbar').getBoundingClientRect();
      const hit = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
      return { bottom: p.bottom, top: p.top, capTop: cap.top, onTop: !!(hit && hit.closest && hit.closest('#rp-peek')), text: document.getElementById('rp-peek-total').textContent, total: currentTotal() };
    });
    check(bar.onTop, 'the bill bar is on top at its centre');
    check(Math.round(bar.capTop - bar.bottom) === 8, `the bill bar rests 8 above the capsule (${Math.round(bar.capTop - bar.bottom)})`);
    check(bar.total > 0 && amount(bar.text) === bar.total, `the bill bar carries the till's total (${bar.text})`);
    const peek = await page.evaluate(() => { const r = document.getElementById('rp-peek').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(peek.x, peek.y);
    await sleep(600);
    const opened = await page.evaluate(() => {
      const cap = document.querySelector('k-tabbar').getBoundingClientRect();
      const hit = document.elementFromPoint(cap.left + cap.width / 2, cap.top + cap.height / 2);
      const b = document.querySelector('k-bill');
      return { open: document.body.classList.contains('ticket-open'), covers: !!(hit && hit.closest && hit.closest('.rightpanel')), bill: !!b && b.getBoundingClientRect().height > 100 };
    });
    check(opened.open && opened.bill, 'the bill bar opens the bill sheet');
    check(opened.covers, 'the open sheet comes over the capsule');
    await page.evaluate(() => document.querySelector('k-bill').shadowRoot.querySelector('[data-w="pay"]').click());
    await sleep(600);
    const pay = await page.evaluate(() => {
      const p = document.querySelector('k-pay');
      const r = p ? p.getBoundingClientRect() : null;
      return { inSheet: !!(p && !p.hidden && p.closest('#kit-bill')), w: r ? Math.round(r.width) : 0, layer: !!document.documentElement.getAttribute('data-k-pay'), methods: p ? p.shadowRoot.querySelectorAll('[data-m],[data-method]').length : 0 };
    });
    check(pay.inSheet && !pay.layer, `Take payment draws the payment inside the sheet, not on a layer (${pay.inSheet}, ${pay.layer})`);
    check(pay.w >= 380, `the payment takes the sheet's width (${pay.w})`);
    await page.evaluate(() => window.KiwiTillFrame.closePay());
    await sleep(300);
    const p2 = await page.evaluate(() => { const r = document.getElementById('rp-peek').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(p2.x, p2.y);
    await sleep(600);
    const closed = await page.evaluate(() => !document.body.classList.contains('ticket-open'));
    check(closed, 'the bar closes the sheet again');
    const back = await tabAt(page, 'floor');
    check(back && back.top, 'with the sheet closed, the capsule takes the touch again');
    check(errors.length === 0, 'bill bar: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('390 × 844 · icon only when the labels do not fit, and the label HUD', async (tr) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=phone
    const { page, errors } = await open(tr, { width: 390, height: 844 });
    const f = await page.evaluate(() => {
      const bar = document.querySelector('k-tabbar');
      const lbs = [...bar.shadowRoot.querySelectorAll('.it .lb')];
      return { icons: bar.hasAttribute('data-icons'), names: [...bar.shadowRoot.querySelectorAll('.it')].map((a) => (a.getAttribute('aria-label') || a.textContent.trim()).replace(/[\u2066-\u2069]/g, '')), hidden: lbs.every((l) => l.getBoundingClientRect().width <= 1) };
    });
    check(f.icons && f.hidden, 'six FR labels do not fit 358: every item is icon only, at once');
    check(f.names.includes('Salle') && f.names.includes('Plus') && f.names.some((n) => /^Cuisine/.test(n)), `the labels stay for screen readers (${f.names.join(' | ')})`);
    const was = (await state(page)).value;
    const p = await tabAt(page, 'waiting');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await sleep(650);
    const hud = await page.evaluate(() => { const h = document.querySelector('k-tabbar').shadowRoot.querySelector('.hud'); return { shown: h.hasAttribute('data-shown'), text: h.textContent.trim() }; });
    await page.mouse.up();
    await sleep(300);
    check(hud.shown && hud.text === 'En attente', `a 500 ms still press shows the label HUD (${hud.text})`);
    const s = await state(page);
    check(s.value === was && s.mode !== 'waitlist', `the press that showed the HUD does not navigate (${s.value})`);
    const gone = await page.evaluate(() => !document.querySelector('k-tabbar').shadowRoot.querySelector('.hud').hasAttribute('data-shown'));
    check(gone, 'the HUD goes with the finger');
    check(errors.length === 0, 'fit: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('390 × 844 · the sync state is a dot on More and a row in it', async (tr) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=phone
    const { page, errors } = await open(tr, { width: 390, height: 844 });
    const before = await page.evaluate(() => !!document.querySelector('k-tabbar').shadowRoot.querySelector('[data-dot]'));
    check(!before, 'nothing to say: no dot on More');
    /* Two sales the server refused for good (row 3, §10.26). */
    await page.evaluate(() => {
      const L = window.KiwiLive;
      L.queueStatus = () => ({ blocked: 2, total: 2 });
      tillKitSync();
    });
    await sleep(200);
    const dot = await page.evaluate(() => {
      const more = document.querySelector('k-tabbar').shadowRoot.querySelector('.it[data-id="more"]');
      const d = more.querySelector('[data-dot]');
      return { dot: !!d, tone: d ? d.className : '', name: more.getAttribute('aria-label') || '' };
    });
    check(dot.dot && /dt--danger/.test(dot.tone), `a danger dot on More (${dot.tone})`);
    check(/^Plus, /.test(dot.name) && dot.name.length > 6, `More's name carries the state (${dot.name})`);
    await tapTab(page, 'more');
    const row = await page.evaluate(() => {
      const sh = document.querySelector('k-sheet[open]');
      const first = sh && sh.querySelector('k-list');
      const li = first && first.shadowRoot.querySelector('li');
      return { id: li ? li.getAttribute('data-id') : '', text: li ? li.textContent.trim() : '' };
    });
    check(row.id === 'sync', `the first row of More is the sync row (${row.text})`);
    await page.evaluate(() => document.querySelector('k-sheet[open] k-list').shadowRoot.querySelector('li[data-id="sync"] button').click());
    await sleep(400);
    const pop = await page.evaluate(() => { const p = document.querySelector('k-popover[open]'); return p ? p.textContent.trim() : ''; });
    check(pop.length > 0, `the row opens the indicator's detail (${pop.slice(0, 40)})`);
    check(errors.length === 0, 'sync: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('390 × 844 · AR, dark: the capsule mirrored', async (tr) => {
    // coverage: surface=caisse-restaurant locale=ar viewport=phone
    const { page, errors } = await open(tr, { width: 390, height: 844, lang: 'ar', theme: 'dark' });
    const m = await page.evaluate(() => {
      const bar = document.querySelector('k-tabbar');
      const x = (id) => bar.shadowRoot.querySelector(`.it[data-id="${id}"]`).getBoundingClientRect().left;
      const bg = getComputedStyle(bar.shadowRoot.querySelector('.cap')).backgroundColor;
      const rgb = (bg.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      return { dir: getComputedStyle(document.documentElement).direction, floor: x('floor'), more: x('more'), lum: rgb.length ? (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255 : 1, floorName: bar.shadowRoot.querySelector('.it[data-id="floor"]').textContent.trim() };
    });
    check(m.dir === 'rtl' && m.floor > m.more, `RTL: Floor at the right, More at the left (${Math.round(m.floor)} > ${Math.round(m.more)})`);
    check(m.floorName === 'الصالة', `the capsule speaks the till's Arabic (${m.floorName})`);
    check(m.lum < 0.4, `the capsule is on the dark chrome (luminance ${m.lum.toFixed(2)})`);
    await tapTab(page, 'takeaway');
    const s = await state(page);
    check(s.value === 'takeaway' && s.mode === 'vrap', 'AR: Takeaway still reaches its page');
    check(errors.length === 0, 'AR: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('2027 short frame and portrait sheet clearance', async (tr) => {
    for (const lang of ['fr', 'ar']) {
      const { page } = await open(tr, { width: 844, height: 390, lang });
      const compact = await page.evaluate(() => {
        const bar = document.querySelector('k-tabbar');
        const r = bar.getBoundingClientRect();
        return { height: r.height, hits: [...bar.shadowRoot.querySelectorAll('.it')].every((b) => b.getBoundingClientRect().height >= 44) };
      });
      check(compact.height <= 52 && compact.hits, lang + ': compact capsule keeps 44px touch targets');
      await tapTab(page, 'clients', false);
      const tools = await page.evaluate(() => {
        const search = document.querySelector('#kcb-root .kcb-search');
        const r = search.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.bottom <= document.querySelector('k-tabbar').getBoundingClientRect().top && hit === search;
      });
      check(tools, lang + ': customer search is immediately visible and usable in landscape');
      await page.setViewport({ width: 820, height: 1180, isMobile: false, hasTouch: false });
      await sleep(400);
      await page.evaluate(() => document.querySelector('k-rail').shadowRoot.querySelector('[data-id="takeaway"]').click());
      await sleep(400);
      const beside = await page.evaluate(() => {
        const rail = document.querySelector('#kit-rail').getBoundingClientRect();
        const sheet = document.querySelector('.rightpanel').getBoundingClientRect();
        return sheet.left >= rail.right || sheet.right <= rail.left;
      });
      check(beside, lang + ': portrait bill sheet clears the entire rail');
      await page.evaluate(() => {
        document.querySelector('#rp-peek').click();
        window.KiwiTillFrame.openPay({ due: 100, bill: 'TEST', method: null });
      });
      await sleep(400);
      const pay = await page.evaluate(() => {
        const rail = document.querySelector('#kit-rail').getBoundingClientRect();
        const pane = document.querySelector('k-pay').getBoundingClientRect();
        return (pane.left >= rail.right || pane.right <= rail.left) && getComputedStyle(document.querySelector('#rp-peek')).display === 'none';
      });
      check(pay, lang + ': payment clears the rail and has no peek over its controls');
    }
  });

  await S.run('1180 × 820 · nothing changes on the iPad', async (tr) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=tablet
    const { page, errors } = await open(tr, { width: 1180, height: 820 });
    const t = await page.evaluate(() => {
      const rail = document.getElementById('kit-rail');
      const bar = document.getElementById('kit-tabbar');
      return {
        tabs: document.documentElement.hasAttribute('data-k-tabs'),
        rail: Math.round(rail.getBoundingClientRect().width),
        bar: bar ? getComputedStyle(bar).display : 'none',
        peek: getComputedStyle(document.getElementById('rp-peek')).display,
        capsule: window.KiwiTillFrame.capsule(),
      };
    });
    check(!t.tabs && !t.capsule, 'no phone form at 1180');
    check(t.rail === 88, `the rail is 88 wide (${t.rail})`);
    check(t.bar === 'none', 'the capsule is not drawn');
    check(t.peek === 'none', 'no bill bar: the bill is a pane');
    await page.evaluate(() => document.querySelector('k-rail').shadowRoot.querySelector('[data-id="takeaway"]').click());
    await sleep(300);
    const s = await page.evaluate(() => ({ mode, value: document.querySelector('k-rail').getAttribute('value') }));
    check(s.mode === 'vrap' && s.value === 'takeaway', 'the rail still routes Takeaway');
    check(errors.length === 0, 'iPad: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('a phone window widened to 1180 gets its rail back', async (tr) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=tablet
    const { page, errors } = await open(tr, { width: 390, height: 844 });
    await page.setViewport({ width: 1180, height: 820, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
    await sleep(500);
    const t = await page.evaluate(() => ({
      tabs: document.documentElement.hasAttribute('data-k-tabs'),
      rail: Math.round(document.getElementById('kit-rail').getBoundingClientRect().width),
      bar: getComputedStyle(document.getElementById('kit-tabbar')).display,
    }));
    check(!t.tabs && t.rail === 88 && t.bar === 'none', `widened: the rail is back and the capsule gone (${t.rail}, ${t.bar})`);
    check(errors.length === 0, 'resize: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ till-phone-tabs-browser-test · ${checks} checks`);
await S.finish();
