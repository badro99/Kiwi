#!/usr/bin/env node
/* team-split-browser-test · the team app's split view (design 2027 §12, §13.4,
 * stage 6), behind kiwiSkin2027:team, on the demo floor in Chromium.
 *
 *   node tools/team-split-browser-test.mjs
 *
 * What it holds:
 *   · flag off, iPad width: the shipped phone frame and tab capsule;
 *   · flag on, iPad width: no drawn phone, the app fills the window; the tabs
 *     are an 88 rail at the leading edge, still switching the tabs;
 *   · an open table sits beside the tables list (360): both visible, the list
 *     tappable (not inert, not aria-hidden), the open table its selected row;
 *   · another table, from the list: the first one's lock is released (the
 *     shipped Back), the second opens; the same table again changes nothing;
 *   · Back closes the detail and the list takes the width again;
 *   · Arabic: the rail and the list at the right, the detail at the left;
 *   · a phone width keeps the shipped stack (the detail covers the list);
 *   · no page error. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname.startsWith('/api/')) { rs.writeHead(503, { 'Content-Type': 'application/json' }); rs.end('{"error":"offline"}'); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* The demo floor, on the main screen (as after a clock-in). */
async function open({ flag = true, width = 1180, height = 820, lang = '' } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [], locks = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((on, l) => {
    if (on) localStorage.setItem('kiwiSkin2027:team', '1');
    if (l) { document.documentElement.setAttribute('dir', 'rtl'); }
  }, flag, lang);
  await page.setViewport({ width, height });
  // coverage: surface=team-entry locale=fr viewport=desktop
  // coverage: surface=team-entry locale=fr viewport=phone
  await page.goto(base + '/kiwi-serveur.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof showScreen === 'function' && typeof renderAll === 'function', { timeout: 20000 });
  await page.evaluate((l) => {
    if (l) document.documentElement.setAttribute('dir', 'rtl');
    /* Record every lock the page takes and gives back. */
    window.__locks = [];
    const orig = window.setTableLock;
    if (typeof orig === 'function') window.setTableLock = function (id, op) { window.__locks.push(op + ':' + id); return orig.apply(this, arguments); };
    showScreen('screen-main'); setTab('tables'); renderAll();
    document.getElementById('screen-main').classList.remove('is-pre-hidden');
  }, lang);
  await sleep(500);
  return { ctx, page, errors };
}
const geo = (page) => page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
  const main = document.getElementById('screen-main'), tbl = document.getElementById('screen-table');
  const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  return {
    vw: innerWidth, app: r(document.querySelector('.app')), rail: r(document.querySelector('#screen-main .bottom-tabs')),
    main: r(main), table: r(tbl), mainVis: vis(main), tableVis: vis(tbl) && tbl.classList.contains('is-active'),
    mainInert: main.inert, mainHidden: main.getAttribute('aria-hidden'),
    split: document.documentElement.getAttribute('data-k-split'),
    sel: [...document.querySelectorAll('#screen-main .table-card[data-k-sel]')].map((c) => c.dataset.table),
    active: typeof activeTableId !== 'undefined' ? activeTableId : null,
    locks: (window.__locks || []).slice(),
    capsuleRadius: getComputedStyle(document.querySelector('.bt-capsule')).flexDirection,
  };
});
const busy = (page) => page.evaluate(() => [...document.querySelectorAll('#screen-main .table-card')].filter((c) => !/khawya|khlass/.test(c.dataset.status)).map((c) => c.dataset.table));
const tapCard = (page, id) => page.evaluate((t) => document.querySelector('#screen-main .table-card[data-table="' + t + '"]').click(), id);

console.log('team-split-browser-test');
try {
  {
    // coverage: surface=team-entry locale=fr viewport=desktop
    // coverage: surface=waiter locale=fr viewport=desktop
    const { ctx, page, errors } = await open({ flag: false });
    const g = await geo(page);
    check(g.app.w <= 440 && g.capsuleRadius === 'row', `flag off: the shipped phone frame (${g.app.w} wide) and tab capsule`);
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  // coverage: surface=team-entry locale=fr viewport=desktop
  // coverage: surface=waiter locale=fr viewport=desktop
  const { ctx, page, errors } = await open();
  let g = await geo(page);
  check(g.app.w === g.vw && g.app.l === 0, `flag on: no drawn phone, the app fills the window (${g.app.w})`);
  check(g.rail.w === 88 && g.rail.l === 0 && g.capsuleRadius === 'column', 'the tabs are an 88 rail at the leading edge');
  await page.evaluate(() => document.querySelector('.bt-btn[data-tab="menu"]').click());
  await sleep(300);
  const tab = await page.evaluate(() => ({ menu: !document.querySelector('.tab-menu').hidden, pressed: document.querySelector('.bt-btn[data-tab="menu"]').getAttribute('aria-pressed') }));
  check(tab.menu && tab.pressed === 'true', 'the rail still switches the tabs (Menu)');
  await page.evaluate(() => document.querySelector('.bt-btn[data-tab="tables"]').click());
  await sleep(300);

  const [a, b] = await busy(page);
  await tapCard(page, a);
  await sleep(600);
  g = await geo(page);
  check(g.split === 'open' && g.mainVis && g.tableVis && g.main.w === 448 && g.table.l === 448 && g.table.r === g.vw,
    `an open table sits beside the list: rail 88 and list 360 (${g.main.w}), the detail from ${g.table.l} to ${g.table.r}`);
  check(g.mainInert === false && g.mainHidden === 'false', 'the list stays tappable and announced beside the detail');
  check(g.sel.join() === a && g.active === a, `the open table is the list's selected row (${g.sel.join()})`);

  await page.evaluate(() => { window.__locks = []; });
  await tapCard(page, a);
  await sleep(300);
  g = await geo(page);
  check(g.active === a && g.locks.length === 0, 'the same table again changes nothing, its lock stays');

  await tapCard(page, b);
  await sleep(600);
  g = await geo(page);
  check(g.active === b && g.split === 'open' && g.sel.join() === b && g.locks.join() === `release:${a},acquire:${b}`,
    `another table from the list: ${a}'s lock released, ${b} opens beside the list (${g.locks.join(', ')})`);

  await page.evaluate(() => document.getElementById('td-back').click());
  await sleep(500);
  g = await geo(page);
  check(g.split === null && g.mainVis && !g.tableVis && g.main.w === g.vw && g.sel.length === 0, 'Back closes the detail and the list takes the width again');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();

  {
    // coverage: surface=team-entry locale=fr viewport=desktop
    // coverage: surface=waiter locale=fr viewport=desktop
    const o = await open({ lang: 'ar' });
    const [t] = await busy(o.page);
    await tapCard(o.page, t);
    await sleep(600);
    const v = await geo(o.page);
    check(v.rail.r === v.vw && v.main.r === v.vw && v.main.w === 448 && v.table.l === 0 && v.table.r === v.vw - 448, 'Arabic: the rail and the list at the right, the detail at the left');
    await o.ctx.close();
  }
  {
    // coverage: surface=team-entry locale=fr viewport=phone
    // coverage: surface=waiter locale=fr viewport=phone
    const o = await open({ width: 390, height: 844 });
    const [t] = await busy(o.page);
    await tapCard(o.page, t);
    await sleep(600);
    const v = await geo(o.page);
    check(v.split === null && v.tableVis && !v.mainVis && v.capsuleRadius === 'row', 'a phone keeps the shipped stack: the detail covers the list, the tabs at the bottom');
    await o.ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ team-split-browser-test · ${checks} checks`);
