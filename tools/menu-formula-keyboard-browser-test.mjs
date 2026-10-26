#!/usr/bin/env node
/* menu-formula-keyboard-browser-test · a two-course formula built with the
 * keyboard alone, in a real Chromium on the demo dashboard (FR, 1280).
 *
 *   node tools/menu-formula-keyboard-browser-test.mjs
 *
 * Opening the editor is not the subject: the page is reached by its sidebar
 * link, then every action is a key press. What it holds:
 *   · the formula switch turns on with Space and the first course appears;
 *   · Tab walks a course in order: title, minimum, maximum, "Add a dish";
 *   · the dish picker opens with Enter, ArrowDown reaches a dish, Enter adds
 *     it and the focus comes back to "Add a dish" (it used to fall on <body>);
 *   · each impossible course says so in the course itself, and the message is
 *     the accessible description of the fields concerned (aria-describedby,
 *     read through Chromium's accessibility tree), with aria-invalid only on
 *     the field at fault: a titled course without a dish, a minimum above the
 *     maximum, three required out of one dish;
 *   · Save refuses an impossible course and takes the keyboard to it;
 *   · expanding a course and removing a dish keep the focus in the course;
 *   · Escape closes the picker back onto its button;
 *   · the saved dish holds exactly the two courses typed.
 * Before this suite the editor saved 3-out-of-1 courses silently, clamped a
 * minimum above the maximum, and the server dropped a titled course with no
 * dish. The demo store keeps everything in this browser: no network, no
 * merchant. The dish is named TEST KIWI. */
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
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

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
const S = suite('menu-formula-keyboard', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const M = '.kiwi-modal';
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'body';
  return [...a.attributes].filter((x) => /^data-/.test(x.name)).map((x) => `[${x.name}="${x.value}"]`).join('') || a.tagName;
});
const press = async (page, key, times = 1) => { for (let i = 0; i < times; i++) { await page.keyboard.press(key); await sleep(90); } };
/* What a screen reader announces with the focused field: Chromium computes it. */
async function description(page) {
  await page.evaluate(() => { document.querySelectorAll('[ax-probe]').forEach((e) => e.removeAttribute('ax-probe')); document.activeElement?.setAttribute('ax-probe', ''); });
  const cdp = await page.createCDPSession();
  try {
    const { root: r } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: r.nodeId, selector: '[ax-probe]' });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const n = nodes[0] || {};
    return { description: n.description?.value || '', invalid: (n.properties || []).find((p) => p.name === 'invalid')?.value?.value || 'false' };
  } finally { await cdp.detach(); await page.evaluate(() => document.querySelector('[ax-probe]')?.removeAttribute('ax-probe')); }
}
const stepError = (page, si) => page.$eval(`${M} [data-slot-err="${si}"]`, (e) => (e.hidden ? '' : e.textContent));
const attrs = (page, sel) => page.$eval(sel, (e) => ({ invalid: e.getAttribute('aria-invalid'), describedby: e.getAttribute('aria-describedby') || '' }));
async function setNumber(page, value) {
  /* End, then Backspace over the old digits: what a keyboard user does. */
  await page.keyboard.press('End');
  const len = await page.evaluate(() => String(document.activeElement.value || '').length);
  for (let i = 0; i < len; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type(String(value)); await sleep(150);
}
/* Tab until the focus reaches `target`, recording each stop. */
async function tabTo(page, target, max = 12, back = false) {
  const stops = [];
  for (let i = 0; i < max; i++) {
    if (back) { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); } else await page.keyboard.press('Tab');
    await sleep(80);
    const at = await active(page); stops.push(at);
    if (at.includes(target)) return stops;
  }
  throw new Error(`Tab never reached ${target}: ${stops.join(' → ')}`);
}

await S.run('formula by keyboard · fr · desktop', async (t) => {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
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

  t.step('open the demo dashboard and its Menu page');
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!(window.KiwiMenuStore && window.Kiwi && window.Kiwi.handlers && window.KiwiRestaurantMenuWorkspace), { timeout: 30000 });
  await page.evaluate(() => { if (!KiwiMenuStore.items().length) KiwiMenuStore.loadExample(); });
  await page.click('.sidebar [data-nav="menu"]');
  await page.waitForFunction(() => document.body.classList.contains('page-menu') && !!document.querySelector('[data-menu-root] .rmw-shell .rmw-row'), { timeout: 20000 });
  await sleep(600);

  t.step('New item, by keyboard');
  await page.focus('.rmw-bar .rmw-add');
  await press(page, 'Enter');
  await page.waitForSelector(`${M} [data-name]`, { visible: true });
  await page.focus(`${M} [data-name]`);
  await page.keyboard.type('TEST KIWI Menu midi');
  await page.focus(`${M} [data-is-formula]`);
  await press(page, 'Space');
  await page.waitForSelector(`${M} [data-slot-label="0"]`, { visible: true });
  check(await page.$eval(`${M} [data-is-formula]`, (e) => e.checked), 'Space turns the formula switch on and the first course appears');

  t.step('a titled course without a dish says so');
  await page.focus(`${M} [data-slot-label="0"]`);
  await page.keyboard.type('Entrée');
  await sleep(150);
  check(/au moins un plat/.test(await stepError(page, 0)), `a titled course with no dish shows its error (${await stepError(page, 0)})`);
  const order = await tabTo(page, '[data-rmw-picker-toggle="0"]');
  check(order.length === 3 && order[0].includes('[data-slot-min="0"]') && order[1].includes('[data-slot-max="0"]'), `Tab walks title, minimum, maximum, Add a dish (${order.join(' → ')})`);
  let ax = await description(page);
  check(/au moins un plat/.test(ax.description), `the message is the accessible description of Add a dish (« ${ax.description} »)`);

  t.step('the picker: Escape, then Enter, ArrowDown, Enter');
  await press(page, 'Enter');
  await page.waitForSelector(`${M} [data-rmw-picker-panel="0"]:not([hidden])`);
  await sleep(150);
  check((await active(page)).includes('[data-rmw-picker-search="0"]'), 'Enter opens the dish picker on its search field');
  await press(page, 'Escape');
  check(await page.$eval(`${M} [data-rmw-picker-panel="0"]`, (e) => e.hidden) && (await active(page)).includes('[data-rmw-picker-toggle="0"]'), 'Escape closes the picker back onto Add a dish');
  await press(page, 'Enter');
  await sleep(150);
  await press(page, 'ArrowDown');
  const first = await active(page);
  check(first.includes('[data-rmw-picker-item='), `ArrowDown moves from the search field to the first dish (${first})`);
  await press(page, 'ArrowDown');
  await press(page, 'ArrowUp');
  check((await active(page)) === first, 'ArrowDown then ArrowUp come back to the same dish');
  await press(page, 'Enter');
  await sleep(150);
  check((await active(page)).includes('[data-rmw-picker-toggle="0"]'), 'after adding a dish the focus is back on Add a dish, not on the page');
  check(await page.$$eval(`${M} [data-del-choice^="0-"]`, (e) => e.length) === 1 && (await stepError(page, 0)) === '', 'the course holds one dish and its error is gone');
  check(!(await attrs(page, `${M} [data-rmw-picker-toggle="0"]`)).describedby.includes('rmw-st-err-0'), 'the cleared message is no longer described on Add a dish');

  t.step('minimum and maximum, live');
  await tabTo(page, '[data-slot-min="0"]', 6, true);
  await setNumber(page, 3);
  check(/minimum \(3\) dépasse le maximum \(1\)/.test(await stepError(page, 0)), `a minimum above the maximum is said at once (${await stepError(page, 0)})`);
  ax = await description(page);
  check(ax.invalid === 'true' && /dépasse le maximum/.test(ax.description), 'the minimum field is invalid and described by that message');
  check((await attrs(page, `${M} [data-slot-max="0"]`)).invalid === 'true', 'the maximum is marked invalid too');
  await press(page, 'Tab');
  check((await active(page)).includes('[data-slot-max="0"]'), 'Tab goes on to the maximum');
  await setNumber(page, 3);
  check(/1 plat pour un minimum de 3/.test(await stepError(page, 0)), `three required out of one dish is said (${await stepError(page, 0)})`);
  ax = await description(page);
  check(ax.invalid === 'false' && /1 plat pour un minimum de 3/.test(ax.description), 'the maximum is no longer invalid but still describes the course problem');
  check((await attrs(page, `${M} [data-slot-min="0"]`)).invalid === 'true', 'only the minimum stays invalid');

  t.step('Save refuses the impossible course and takes the keyboard to it');
  const before = await page.evaluate(() => KiwiMenuStore.items().length);
  await page.focus(`${M} [data-save]`);
  await press(page, 'Enter');
  await sleep(300);
  check(await page.evaluate(() => KiwiMenuStore.items().length) === before && !!(await page.$(`${M} [data-save]`)), 'nothing is saved and the editor stays open');
  check((await active(page)).includes('[data-slot-min="0"]'), `the focus lands on the minimum at fault (${await active(page)})`);
  ax = await description(page);
  check(/1 plat pour un minimum de 3/.test(ax.description), 'and the focused field announces why');
  await setNumber(page, 1);
  const cleared = await attrs(page, `${M} [data-slot-min="0"]`);
  check((await stepError(page, 0)) === '' && cleared.invalid === null && !cleared.describedby.includes('rmw-st-err-0'), `lowering the minimum clears the message, aria-invalid and the description (${JSON.stringify([await stepError(page, 0), cleared, await page.$eval(`${M} [data-slot-min="0"]`, (e) => e.value)])})`);

  t.step('a second course');
  await page.focus(`${M} [data-add-slot]`);
  await press(page, 'Enter');
  await sleep(150);
  check((await active(page)).includes('[data-slot-label="1"]'), 'Add a course puts the focus on its title');
  await page.keyboard.type('Dessert');
  await sleep(120);
  check(/au moins un plat/.test(await stepError(page, 1)), 'the new titled course asks for a dish');
  await tabTo(page, '[data-rmw-picker-toggle="1"]');
  await press(page, 'Enter'); await sleep(150);
  await press(page, 'ArrowDown'); await press(page, 'ArrowDown');
  await press(page, 'Enter'); await sleep(150);
  check((await active(page)).includes('[data-rmw-picker-toggle="1"]') && (await stepError(page, 1)) === '', 'its dish is added by keyboard and the focus stays in the course');

  t.step('expand the first course and remove its dish');
  await page.focus(`${M} [data-slot-toggle="0"]`);
  await press(page, 'Enter'); await sleep(150);
  check((await active(page)).includes('[data-slot-toggle="0"]') && await page.$eval(`${M} [data-slot-toggle="0"]`, (e) => e.getAttribute('aria-expanded') === 'true'), 'Enter expands the first course and the focus stays on its button');
  await page.focus(`${M} [data-del-choice="0-0"]`);
  await press(page, 'Enter'); await sleep(150);
  check((await active(page)).includes('[data-rmw-picker-toggle="0"]'), `removing the only dish moves the focus to Add a dish (${await active(page)})`);
  check(/au moins un plat/.test(await stepError(page, 0)), 'and the course asks for a dish again');
  await press(page, 'Enter'); await sleep(150);
  await press(page, 'ArrowDown'); await press(page, 'Enter'); await sleep(150);

  t.step('save');
  await page.focus(`${M} [data-save]`);
  await press(page, 'Enter');
  await page.waitForSelector('.kiwi-backdrop', { hidden: true, timeout: 5000 }).catch(() => {});
  await sleep(300);
  const saved = await page.evaluate(() => { const x = KiwiMenuStore.items().find((i) => i.name === 'TEST KIWI Menu midi'); return x && x.formula ? x.formula.slots.map((s) => ({ label: s.label, min: s.min, max: s.max, n: s.choices.length })) : null; });
  check(JSON.stringify(saved) === JSON.stringify([{ label: 'Entrée', min: 1, max: 3, n: 1 }, { label: 'Dessert', min: 1, max: 1, n: 1 }]), `the saved formula holds the two courses typed (${JSON.stringify(saved)})`);
  check(errors.length === 0, `no page error ${errors.join(' | ')}`);
});

server.close();
if (!S.counts.failed && !S.counts.infra) console.log(`✓ menu-formula-keyboard-browser-test · ${checks} checks`);
await S.finish();
