#!/usr/bin/env node
/* menu-options-keyboard-browser-test · an option group (« Cuisson ») built and
 * corrected with the keyboard alone, in a real Chromium on the demo dashboard
 * (FR, 1280). Thirteenth blind rating, menu#2: the menu suites proved the
 * option model, not the hands that edit it.
 *
 *   node tools/menu-options-keyboard-browser-test.mjs
 *
 * What it holds, every action a key press on the real Menu page:
 *   · « Nouveau groupe » opens with Enter, the name field takes the focus;
 *   · Save with no name refuses, puts the focus back on the name, aria-invalid;
 *   · the two rules are radio groups: an arrow key picks « Plusieurs » and
 *     « Obligatoire », and the rule sentence follows;
 *   · « Ajouter un choix » with Enter adds a row and focuses its name;
 *   · the mark picker opens with Enter, Escape closes it back onto its button
 *     and leaves the editor open, Enter on a mark sets it and returns there;
 *   · deleting a choice keeps the focus in the list (it fell on <body>);
 *   · a priced choice without a name stops Save and takes the focus;
 *   · the saved group holds exactly what was typed.
 * The demo store keeps everything in this browser: no network, no merchant.
 * The group is named TEST KIWI. */
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

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('menu-options-keyboard', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const M = '.rmw-og-modal';
/* The focused element, described by its data-* attributes and, inside the
   choice list, by the position of its row. */
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'body';
  const row = a.closest('[data-choice]');
  const at = row ? '@' + [...row.parentElement.children].indexOf(row) : '';
  const name = a.getAttribute('name') ? `[name="${a.name}"][value="${a.value}"]` : '';
  return ([...a.attributes].filter((x) => /^data-/.test(x.name)).map((x) => `[${x.name}]`).join('') || a.tagName) + name + at;
});
/* `at` matches `target` when it carries each [attr] of it and the same @row. */
const is = (at, target) => { const row = (target.match(/@\d+$/) || [''])[0], parts = target.replace(/@\d+$/, '').match(/\[[^\]]+\]|^[A-Z]+/g) || []; return parts.every((p) => at.includes(p)) && (!row || at.endsWith(row)); };
const press = async (page, key, times = 1) => { for (let i = 0; i < times; i++) { await page.keyboard.press(key); await sleep(90); } };
async function tabTo(page, target, max = 30, back = false) {
  const stops = [];
  for (let i = 0; i < max; i++) {
    if (back) { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); } else await page.keyboard.press('Tab');
    await sleep(60);
    const at = await active(page); stops.push(at);
    if (is(at, target)) return stops;
  }
  throw new Error(`Tab never reached ${target}: ${stops.join(' → ')}`);
}
const rows = (page) => page.$$eval(`${M} [data-choice]`, (rs) => rs.map((r) => ({ name: r.querySelector('[data-choice-name]').value, price: r.querySelector('[data-choice-price]').value, mark: r.querySelector('[data-emoji-btn]').dataset.value })));

await S.run('option group by keyboard · fr · desktop', async (t) => {
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
  await page.waitForFunction(() => document.body.classList.contains('page-menu') && !!document.querySelector('[data-action="rmw-group-add"]'), { timeout: 20000 });
  await sleep(600);
  const before = await page.evaluate(() => (KiwiMenuStore.optionGroups() || []).length);

  t.step('New group with Enter; Save refuses an empty name');
  await page.focus('[data-action="rmw-group-add"]');
  await press(page, 'Enter');
  await page.waitForSelector(`${M} [data-name]`, { visible: true });
  await sleep(200);
  check(is(await active(page), '[data-name]'), 'Enter opens the editor with the focus on the name');
  await tabTo(page, '[data-save]');
  await press(page, 'Enter');
  check(is(await active(page), '[data-name]'), 'Save with no name brings the focus back to it');
  check(await page.$eval(`${M} [data-name]`, (e) => e.getAttribute('aria-invalid') === 'true'), 'the empty name is marked invalid');
  await page.keyboard.type('TEST KIWI Cuisson');

  t.step('the rules are radio groups driven by the arrow keys');
  const ruleBefore = await page.$eval(`${M} [data-og-rule]`, (e) => e.textContent);
  await tabTo(page, '[name="rmw-og-kind"]');
  await press(page, 'ArrowRight');
  check(is(await active(page), '[value="many"]'), `ArrowRight picks « Plusieurs » (${await active(page)})`);
  await tabTo(page, '[name="rmw-og-req"]');
  await press(page, 'ArrowRight');
  check(is(await active(page), '[value="1"]'), 'ArrowRight picks « Obligatoire »');
  const ruleAfter = await page.$eval(`${M} [data-og-rule]`, (e) => e.textContent);
  check(ruleAfter && ruleAfter !== ruleBefore, `the rule sentence follows the choice (« ${ruleAfter} »)`);

  t.step('three choices typed, a mark set by keyboard');
  await tabTo(page, '[data-choice-name]@0');
  await page.keyboard.type('Saignant');
  await press(page, 'Tab');
  check(is(await active(page), '[data-choice-price]@0'), 'Tab goes from a choice name to its supplement');
  await page.keyboard.type('12.5');
  for (const name of ['Bleu', 'À point']) {
    await tabTo(page, '[data-choice-add]');
    await press(page, 'Enter');
    check(/\[data-choice-name\].*@\d$/.test(await active(page)), `« Ajouter un choix » adds a row and focuses its name (${await active(page)})`);
    await page.keyboard.type(name);
  }
  await tabTo(page, '[data-emoji-btn]@2', 6, true);
  await press(page, 'Enter');
  await page.waitForSelector('.rmw-emoji-pop');
  check(await page.evaluate(() => document.querySelector('.rmw-emoji-pop').contains(document.activeElement)), 'Enter opens the mark picker with the focus inside it');
  await press(page, 'Escape');
  check(!(await page.$('.rmw-emoji-pop')) && !!(await page.$(`${M} [data-name]`)), 'Escape closes the picker and leaves the editor open');
  check(is(await active(page), '[data-emoji-btn]@2'), 'Escape returns to the mark button');
  await press(page, 'Enter');
  await page.waitForSelector('.rmw-emoji-pop');
  await press(page, 'Tab');
  await press(page, 'Enter');
  check(is(await active(page), '[data-emoji-btn]@2'), 'picking a mark returns to its button');
  const mark = (await rows(page))[2].mark;
  check(!!mark, 'the third choice carries the mark picked');

  t.step('deleting a choice keeps the focus in the list');
  await tabTo(page, '[data-choice-del]@1', 12, true);
  await press(page, 'Enter');
  const afterDelete = await active(page);
  check(afterDelete !== 'body' && /@\d$/.test(afterDelete), `the focus stays in the choice list (${afterDelete})`);
  check(JSON.stringify((await rows(page)).map((r) => r.name)) === JSON.stringify(['Saignant', 'À point']), 'the « Bleu » row is gone, the others kept');

  t.step('a priced choice without a name stops Save');
  await tabTo(page, '[data-choice-add]');
  await press(page, 'Enter');
  await press(page, 'Tab');
  await page.keyboard.type('5');
  await tabTo(page, '[data-save]');
  await press(page, 'Enter');
  check(is(await active(page), '[data-choice-name]@2'), 'Save takes the focus to the unnamed priced choice');
  check(await page.$eval(`${M} [data-choice]:nth-child(3) [data-choice-name]`, (e) => e.getAttribute('aria-invalid') === 'true'), 'that choice is marked invalid');
  await press(page, 'Tab');
  await tabTo(page, '[data-choice-del]@2');
  await press(page, 'Enter');
  check((await active(page)) !== 'body', 'removing the last row keeps the focus in the list');

  t.step('save');
  await tabTo(page, '[data-save]');
  await press(page, 'Enter');
  await page.waitForFunction(() => !document.querySelector('.rmw-og-modal [data-name]'), { timeout: 5000 });
  const saved = await page.evaluate(() => { const g = (KiwiMenuStore.optionGroups() || []).find((x) => x.name === 'TEST KIWI Cuisson'); return g && { kind: g.kind, required: g.required, choices: g.choices.map((c) => [c.name, c.price, !!c.emoji]) }; });
  check(await page.evaluate(() => (KiwiMenuStore.optionGroups() || []).length) === before + 1, 'one group was added');
  check(JSON.stringify(saved) === JSON.stringify({ kind: 'many', required: true, choices: [['Saignant', 12.5, false], ['À point', 0, true]] }), `the saved group holds what was typed (${JSON.stringify(saved)})`);
  check(errors.length === 0, `no page error ${errors.join(' | ')}`);
});

server.close();
if (!S.counts.failed && !S.counts.infra) console.log(`✓ menu-options-keyboard-browser-test · ${checks} checks`);
await S.finish();
