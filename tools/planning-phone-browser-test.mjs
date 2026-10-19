#!/usr/bin/env node
/* planning-phone-browser-test · the dashboard's staff Planning on a phone, in a
 * real Chromium at 390 × 844 (mobile, touch), on the demo store, and the same
 * page at 1280 wide.
 *
 *   node tools/planning-phone-browser-test.mjs
 *
 * What it holds:
 *   · phone: the page never scrolls sideways; the week table is not drawn,
 *     the day view is: seven day pills (each a 44 px target, the liquid lens
 *     under the chosen one), then one full-width row per person for that day,
 *     with name, role and hours, each a 44 px target;
 *   · a real tap on another day shows that day, and every person on the team
 *     is listed with what the schedule says for that day;
 *   · a swipe on the list moves to the next day;
 *   · adding a shift by real taps (row → start, end → Save) writes it to the
 *     schedule, repaints the row and the day summary, and the editor's own
 *     controls are 44 px targets; tapping the row again edits it, and "Day off"
 *     turns it into a rest day;
 *   · 1280 wide: the week table is drawn as before (seven day columns, every
 *     cell a button, inside its card, nothing scrolls sideways), the day view
 *     is not, and a click on a cell still edits the shift;
 *   · no page error. */
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
/* fr-FR: the time fields take 24-hour digits, as a Moroccan merchant types them. */
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--lang=fr-FR', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('planning-phone', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* The demo store as a returning visitor sees it, opened on Planning. */
async function open(tr, ctx, { width = 390, height = 844 } = {}) {
  const page = tr.watch(await ctx.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  const phone = width < 900;
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('kiwiSkipOnboard', '1'); localStorage.setItem('kiwiLang', 'fr'); } catch (_) {}
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  });
  page.setDefaultNavigationTimeout(60000);
  tr.step(`open the demo dashboard at ${width} × ${height}`);
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 30000 });
  tr.step('go to Planning');
  /* The sidebar's own link, as the menu opens it (the page checks that its
     link is the active one). */
  await page.waitForFunction(() => !!window.__kiwiTeamV2 && !!document.querySelector('.sidebar nav a[data-nav="payroll"]'), { timeout: 30000 });
  await page.evaluate(() => document.querySelector('.sidebar nav a[data-nav="payroll"]').click());
  await page.waitForFunction(() => !!document.querySelector('.dash-genpage .dash-equipe .kt-plan-table tbody tr'), { timeout: 30000 });
  await sleep(600);
  return page;
}

/* The page scrolls smoothly: bring the element into view, then wait until
   it stops moving before aiming at it. */
async function settle(handle) {
  await handle.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  let last = null;
  for (let i = 0; i < 40; i++) {
    await sleep(60);
    const b = await handle.boundingBox();
    if (b && last && Math.abs(b.y - last.y) < 0.5 && Math.abs(b.x - last.x) < 0.5) return b;
    last = b;
  }
  assert.ok(last, 'element is on screen');
  return last;
}
async function tapEl(page, handle) {
  const b = await settle(handle);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
async function clickEl(page, handle) {
  const b = await settle(handle);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
async function swipe(page, x, y, dx) {
  const c = await page.createCDPSession();
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 10, y }] }); await sleep(16); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.detach();
  await sleep(300);
}
/* Enter a time. On desktop a person types the digits into the field's hour and
   minute (Chrome draws it in the browser's locale, so a 12-hour locale takes a
   12-hour dial and AM/PM). On an emulated phone the field is the native wheel,
   which has nothing to type into: the wheel's "Done" writes the value and fires
   input + change, so that is what is done here (how = 'wheel'). */
async function typeTime(page, sel, hhmm, how) {
  const el = await page.$(sel);
  assert.ok(el, sel + ' exists');
  const b = await settle(el);
  if (how === 'wheel') {
    await el.evaluate((i, v) => {
      i.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v);
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }, hhmm);
  } else {
    await page.mouse.click(b.x + 12, b.y + b.height / 2);
    const h12 = await page.evaluate(() => /h1[12]/.test(new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions().hourCycle || ''));
    const [h, m] = hhmm.split(':').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    await page.keyboard.type(h12 ? pad(h % 12 || 12) + pad(m) + (h < 12 ? 'A' : 'P') : pad(h) + pad(m));
  }
  await sleep(80);
  const got = await el.evaluate((i) => i.value);
  assert.equal(got, hhmm, `the time field reads what was entered (${got})`);
}

const state = (page) => page.evaluate(() => {
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right }; };
  const host = document.querySelector('.dash-genpage .dash-equipe');
  const panel = host.querySelector('.kt-pd-panel:not([hidden])');
  return {
    vw: window.innerWidth,
    sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    table: shown(host.querySelector('.kt-plan-wrap')),
    dayView: shown(host.querySelector('.kt-pd')),
    lens: host.querySelector('.kt-pd-days')?.getAttribute('data-kw-lens') || '',
    pills: [...host.querySelectorAll('.kt-pd-pill')].map((b) => ({ day: b.getAttribute('data-arg'), on: b.classList.contains('on'), sel: b.getAttribute('aria-selected'), ...r(b) })),
    day: panel?.getAttribute('data-kt-dpanel') || '',
    panels: host.querySelectorAll('.kt-pd-panel:not([hidden])').length,
    sum: panel?.querySelector('.kt-pd-sum')?.textContent.trim() || '',
    rows: panel ? [...panel.querySelectorAll('.kt-pd-row')].map((b) => ({
      mid: b.getAttribute('data-mid'), name: b.querySelector('.kt-pd-who b').textContent.trim(),
      role: b.querySelector('.kt-pd-who small').textContent.trim(), when: b.querySelector('.kt-pd-when').textContent.replace(/\s+/g, ' ').trim(),
      shown: shown(b), ...r(b),
    })) : [],
  };
});
/* What the schedule says, read the way the page reads it. */
const schedule = (page) => page.evaluate(() => {
  const root = window.__kiwiTeamV2;
  const host = document.querySelector('.dash-genpage .dash-equipe');
  const mids = [...new Set([...host.querySelectorAll('.kt-plan-table [data-kt-cell]')].map((td) => td.getAttribute('data-kt-cell').split('|')[0]))];
  const key = Object.keys(root.shiftsByVenue || {}).find((k) => mids.some((id) => root.shiftsByVenue[k] && root.shiftsByVenue[k][id])) || '';
  return { mids, shifts: (root.shiftsByVenue || {})[key] || {} };
});
const expectWhen = (cur) => {
  if (!cur) return 'Ajouter';
  if (typeof cur === 'string') return null;            // legacy code: not checked by text
  if (cur.off) return 'Repos';
  return `${cur.start} – ${cur.end}`;
};

try {
  await S.run('phone 390 × 844 · one day at a time', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx);
    let s = await state(page);
    check(s.sw <= s.vw, `nothing scrolls sideways (${s.sw} ≤ ${s.vw})`);
    check(!s.table && s.dayView, 'the week table is not drawn, the day view is');
    check(s.pills.length === 7 && s.pills.filter((p) => p.on).length === 1 && s.panels === 1, `seven day pills, one chosen, one day shown (${s.pills.length})`);
    check(s.pills.every((p) => p.h >= 44 && p.w >= 44 && p.r <= s.vw), `every day pill is a 44 px target inside the screen (${s.pills.map((p) => Math.round(p.w) + '×' + Math.round(p.h)).join(' ')})`);
    check(s.lens === 'surface', 'the liquid lens sits under the day pills');

    tr.step('tap another day');
    const target = s.pills.find((p) => !p.on && p.day !== s.day);
    await tapEl(page, await page.$(`.kt-pd-pill[data-arg="${target.day}"]`));
    await sleep(400);
    s = await state(page);
    check(s.day === target.day && s.pills.find((p) => p.day === target.day).sel === 'true' && s.panels === 1, `the tapped day becomes the day shown (${target.day})`);
    const sch = await schedule(page);
    check(sch.mids.length > 0 && s.rows.length === sch.mids.length, `every person on the team is listed for that day (${s.rows.length}/${sch.mids.length})`);
    check(s.rows.every((r) => r.shown && r.h >= 44 && r.x >= 0 && r.r <= s.vw + 0.5), 'each row is visible, full width inside the screen, a 44 px target');
    check(s.rows.every((r) => r.name && r.role), 'each row names the person and their role');
    const mismatch = s.rows.filter((r) => { const want = expectWhen((sch.shifts[r.mid] || {})[target.day]); return want !== null && !r.when.startsWith(want); });
    check(mismatch.length === 0, 'each row shows that day\'s hours from the schedule' + (mismatch.length ? ' · ' + JSON.stringify(mismatch.slice(0, 2)) : ''));
    const gap = await page.evaluate(() => { const d = document.querySelector('.kt-pd-days').getBoundingClientRect(); const h = document.querySelector('.kt-pd-panel:not([hidden]) .kt-pd-head').getBoundingClientRect(); return h.top - d.bottom; });
    check(gap >= 0 && gap < 40, `the day's heading sits right under the pills (${Math.round(gap)} px)`);
    const wide = s.rows[0];
    check(wide.w >= s.vw * 0.75, `a row spans the card (${Math.round(wide.w)} of ${s.vw})`);

    if (process.env.KIWI_PLANNING_SHOT) { await sleep(1500); await page.screenshot({ path: process.env.KIWI_PLANNING_SHOT }); }
    tr.step('swipe left on the list');
    const before = s.day;
    const order = s.pills.map((p) => p.day);
    const idx = order.indexOf(before);
    const dx = idx < order.length - 1 ? -160 : 160;
    await swipe(page, s.vw / 2, s.rows[0].y + s.rows[0].h / 2, dx);
    s = await state(page);
    check(s.day === order[idx + (dx < 0 ? 1 : -1)], `a swipe moves to the neighbouring day (${before} → ${s.day})`);

    tr.step('add a shift by taps');
    let free = s.rows.find((r) => r.when === 'Ajouter');
    if (!free) {
      /* Every row is planned: clear the first one through the editor, by taps. */
      await tapEl(page, await page.$(`.kt-pd-panel:not([hidden]) .kt-pd-row[data-mid="${s.rows[0].mid}"]`));
      await page.waitForSelector('.kt-shpop [data-sh-clear]');
      await tapEl(page, await page.$('.kt-shpop [data-sh-clear]'));
      await sleep(300);
      s = await state(page);
      free = s.rows.find((r) => r.when === 'Ajouter');
    }
    check(!!free, 'a row with no shift offers "Ajouter"');
    const day = s.day;
    const sumBefore = s.sum;
    await tapEl(page, await page.$(`.kt-pd-panel:not([hidden]) .kt-pd-row[data-mid="${free.mid}"]`));
    await page.waitForSelector('.kt-shpop [data-sh-start]');
    const pop = await page.evaluate(() => {
      const el = document.querySelector('.kt-shpop');
      const b = el.getBoundingClientRect();
      return { l: b.left, r: b.right, head: el.querySelector('.kt-shpop-head b').textContent.trim(),
        targets: [...el.querySelectorAll('input[type=time], .kt-shpop-b')].map((x) => Math.round(x.getBoundingClientRect().height)) };
    });
    check(pop.head === free.name, `the editor opens for that person (${pop.head})`);
    check(pop.l >= 0 && pop.r <= s.vw, 'the editor fits on the screen');
    check(pop.targets.every((h) => h >= 44), `its fields and buttons are 44 px targets (${pop.targets.join(', ')})`);
    await typeTime(page, '.kt-shpop [data-sh-start]', '09:30', 'wheel');
    await typeTime(page, '.kt-shpop [data-sh-end]', '17:00', 'wheel');
    await tapEl(page, await page.$('.kt-shpop [data-sh-save]'));
    await sleep(400);
    s = await state(page);
    let row = s.rows.find((r) => r.mid === free.mid);
    let saved = (await schedule(page)).shifts[free.mid]?.[day];
    check(!!saved && saved.start === '09:30' && saved.end === '17:00', `the shift is written to the schedule (${JSON.stringify(saved)})`);
    check(row.when.startsWith('09:30 – 17:00') && row.when.includes('7 h 30'), `the row shows it at once (${row.when})`);
    check(s.sum !== sumBefore && /en service/.test(s.sum), `the day summary counts it (${sumBefore} → ${s.sum})`);
    check(s.day === day && !(await page.$('.kt-shpop')), 'the editor closes and the same day stays on screen');
    const cell = await page.evaluate((k) => {
      const td = [...document.querySelectorAll('.kt-plan-table [data-kt-cell]')].find((x) => x.getAttribute('data-kt-cell') === k);
      return td ? td.textContent.replace(/\s+/g, ' ').trim() : '';
    }, `${free.mid}|${day}`);
    check(cell.includes('09:30') && cell.includes('17:00'), 'the week table behind it agrees');

    tr.step('edit the same shift');
    await tapEl(page, await page.$(`.kt-pd-panel:not([hidden]) .kt-pd-row[data-mid="${free.mid}"]`));
    await page.waitForSelector('.kt-shpop [data-sh-end]');
    const shown = await page.$eval('.kt-shpop [data-sh-start]', (i) => i.value);
    check(shown === '09:30', `the editor opens on the saved hours (${shown})`);
    await typeTime(page, '.kt-shpop [data-sh-end]', '18:15', 'wheel');
    await tapEl(page, await page.$('.kt-shpop [data-sh-save]'));
    await sleep(400);
    s = await state(page);
    row = s.rows.find((r) => r.mid === free.mid);
    saved = (await schedule(page)).shifts[free.mid]?.[day];
    check(saved?.end === '18:15' && row.when.startsWith('09:30 – 18:15'), `the edit lands in the schedule and the row (${row.when})`);

    tr.step('make it a day off');
    await tapEl(page, await page.$(`.kt-pd-panel:not([hidden]) .kt-pd-row[data-mid="${free.mid}"]`));
    await page.waitForSelector('.kt-shpop [data-sh-rest]');
    await tapEl(page, await page.$('.kt-shpop [data-sh-rest]'));
    await sleep(400);
    s = await state(page);
    row = s.rows.find((r) => r.mid === free.mid);
    saved = (await schedule(page)).shifts[free.mid]?.[day];
    check(saved?.off === true && row.when === 'Repos', 'Day off turns the row into a rest day');
    s = await state(page);
    check(s.sw <= s.vw, `still nothing scrolls sideways (${s.sw} ≤ ${s.vw})`);
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ' · ' + page.errors.join(' | ') : ''));
  });

  await S.run('desktop 1280 · the week table as before', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, { width: 1280, height: 900 });
    const d = await page.evaluate(() => {
      const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
      const host = document.querySelector('.dash-genpage .dash-equipe');
      const wrap = host.querySelector('.kt-plan-wrap');
      const table = host.querySelector('.kt-plan-table');
      const wb = wrap.getBoundingClientRect(), tb = table.getBoundingClientRect();
      const cells = [...table.querySelectorAll('tbody .kt-plan-cell .kt-sh')];
      return {
        vw: window.innerWidth, sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        table: shown(wrap), dayView: shown(host.querySelector('.kt-pd')),
        heads: table.querySelectorAll('thead .kt-day-head').length,
        rows: table.querySelectorAll('tbody tr').length,
        cells: cells.length, cellsShown: cells.filter(shown).length,
        layout: getComputedStyle(table).tableLayout, overflow: getComputedStyle(wrap).overflowX,
        fits: tb.width <= wb.width + 0.5 && tb.left >= wb.left - 0.5, wide: Math.round(tb.width),
      };
    });
    check(d.table && !d.dayView, 'the week table is drawn, the day view is not');
    check(d.heads === 7 && d.rows > 0 && d.cells === d.rows * 7 && d.cellsShown === d.cells, `seven day columns, one button per person and day (${d.rows} × ${d.heads})`);
    check(d.layout === 'fixed' && d.overflow === 'hidden' && d.fits, `the table keeps its fixed layout inside its card (${d.wide} px)`);
    check(d.sw <= d.vw, `nothing scrolls sideways (${d.sw} ≤ ${d.vw})`);

    tr.step('edit a cell by click');
    const sch = await schedule(page);
    const k = await page.$eval('.kt-plan-table tbody .kt-plan-cell', (td) => td.getAttribute('data-kt-cell'));
    const [mid, day] = k.split('|');
    await clickEl(page, await page.$(`.kt-plan-table [data-kt-cell="${k}"] .kt-sh`));
    await page.waitForSelector('.kt-shpop [data-sh-start]');
    await typeTime(page, '.kt-shpop [data-sh-start]', '10:00', 'click');
    await typeTime(page, '.kt-shpop [data-sh-end]', '16:45', 'click');
    await clickEl(page, await page.$('.kt-shpop [data-sh-save]'));
    await sleep(400);
    const saved = (await schedule(page)).shifts[mid]?.[day];
    const cell = await page.$eval(`.kt-plan-table [data-kt-cell="${k}"]`, (td) => td.textContent.replace(/\s+/g, ' ').trim());
    check(saved?.start === '10:00' && saved?.end === '16:45' && cell.includes('10:00') && cell.includes('16:45'), `a click on a cell still edits the shift (${JSON.stringify((sch.shifts[mid] || {})[day] || null)} → ${cell})`);
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ' · ' + page.errors.join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ planning-phone-browser-test · ${checks} checks`);
await S.finish();
