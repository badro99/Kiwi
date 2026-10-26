#!/usr/bin/env node
/* dash-onboarding-browser-test · the onboarding after the account on the kit
 * (design 2027 §18.8, steps 2 to 5 and End; stage 6), behind
 * kiwiSkin2027:dashboard, in Chromium, on dashboard.html?onboarding=1.
 *
 *   node tools/dash-onboarding-browser-test.mjs
 *
 * What it holds:
 *   · flag off: the shipped wizard draws, no kit page;
 *   · step 2 of 5, the type: six tiles, nothing selected, Continue disabled
 *     until a choice; Show other types is a searchable list of every trade;
 *   · step 3, the goals (chips, any number) and the daily goal: a value the
 *     shipped check refuses says ob.err.goal under the field;
 *   · step 4, the personal code on the PIN pad, twice: a demo code is refused,
 *     a mismatch says ob.code_mismatch and starts again;
 *   · Back keeps every answer;
 *   · step 5, this device: Start using Kiwi waits for a choice; the kitchen
 *     and team choices show their warnings;
 *   · Start using Kiwi runs the shipped finish(): the store is created with
 *     the type, the goals, the daily goal and the owner's code, and the
 *     dashboard opens (kiwiOnboarded);
 *   · a team device signs the owner out of this device, then opens the team
 *     sign-in;
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
  if (u.pathname === '/auth/logout') { rs.writeHead(303, { Location: '/' }); rs.end(); return; }
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

async function open(flag = true) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((on) => {
    if (on) localStorage.setItem('kiwiSkin2027:dashboard', '1');
    localStorage.setItem('kiwiLang', 'en');
    /* Record the store the wizard creates; the real createVenue still runs. */
    window.__created = [];
    let kv;
    Object.defineProperty(window, 'KiwiVenue', {
      configurable: true,
      get() { return kv; },
      set(v) {
        kv = v;
        if (v && v.createVenue && !v.__spied) {
          const orig = v.createVenue.bind(v);
          v.createVenue = async (o) => { window.__created.push(JSON.parse(JSON.stringify(o))); try { return await orig(o); } catch (_) { return null; } };
          v.__spied = true;
        }
      },
    });
  }, flag);
  await page.setViewport({ width: 430, height: 900 });
  // coverage: surface=onboarding locale=en viewport=phone
  await page.goto(base + '/dashboard.html?onboarding=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(document.getElementById('kit-onboarding') || document.querySelector('.kob-root')), { timeout: 20000 });
  // Kit starts after signup; this local offline harness supplies its answers.
  if (flag) await page.evaluate(() => window.KiwiOnboarding.kit.update({ ownerName: 'Test', bizName: 'Test Shop' }));
  await sleep(500);
  return { ctx, page, errors, requests };
}
const read = (page) => page.evaluate(() => {
  const ob = document.getElementById('kit-onboarding');
  if (!ob) return null;
  const btn = ob.querySelector('[data-do="next"]');
  const body = ob.querySelector('.k-ob__body');
  return {
    step: ob.querySelector('.k-ob__step').textContent, which: body.getAttribute('data-step'),
    tiles: [...ob.querySelectorAll('[data-kind]')].map((b) => ({ id: b.dataset.kind, on: b.getAttribute('aria-pressed') === 'true' })),
    next: btn ? { disabled: btn.hasAttribute('disabled'), label: btn.getAttribute('label'), loading: btn.hasAttribute('loading') } : null,
    list: (ob.querySelector('[data-l="kinds"]') || {}).rows || null,
    goalError: (ob.querySelector('[data-f="goal"]') || { getAttribute: () => '' }).getAttribute('error') || '',
    warn: (ob.querySelector('[data-warn]') || {}).textContent || '',
    banner: (ob.querySelector('k-banner') || { getAttribute: () => '' }).getAttribute('message') || '',
  };
});
const next = (page) => page.evaluate(() => document.querySelector('#kit-onboarding [data-do="next"]').shadowRoot.querySelector('button').click());
const pad = async (page, code) => {
  for (const d of code) {
    await page.evaluate((k) => {
      const b = document.querySelector('#kit-onboarding k-pin-pad').shadowRoot.querySelector('[data-key="' + k + '"]');
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
      b.click();
    }, d);
    await sleep(60);
  }
  await sleep(500);
};
const padText = (page) => page.evaluate(() => document.querySelector('#kit-onboarding k-pin-pad').shadowRoot.textContent);

console.log('dash-onboarding-browser-test');
try {
  {
    // coverage: surface=onboarding locale=en viewport=phone
    const { ctx, page, errors } = await open(false);
    const v = await page.evaluate(() => ({ kit: !!document.getElementById('kit-onboarding'), shipped: !!document.querySelector('.kob-root') }));
    check(!v.kit && v.shipped, 'flag off: the shipped wizard draws, no kit page');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  {
  // coverage: surface=onboarding locale=en viewport=phone
  const { ctx, page } = await open();
  await page.evaluate(() => {
    window.__storageSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'kiwiOnboardingDraft:v1') throw new DOMException('full', 'QuotaExceededError');
      return window.__storageSet.call(this, k, v);
    };
    document.querySelector('#kit-onboarding [data-kind]').click();
  });
  check(await page.$eval('#kit-onboarding [data-draft-warning]', e => !e.hidden && e.textContent.startsWith('Draft not saved on this device')), 'storage refusal shows the non-blocking translated warning');
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__storageSet;
    document.querySelector('#kit-onboarding [data-kind]').click();
  });
  check(await page.$eval('#kit-onboarding [data-draft-warning]', e => e.hidden && !e.textContent), 'next successful save clears the warning');
  await ctx.close();
  }
  // coverage: surface=onboarding locale=en viewport=phone
  const { ctx, page, errors } = await open();
  let v = await read(page);
  check(v && v.step === 'Step 2 of 5' && v.which === 'kind', `the kit page opens at step 2 of 5, the type (${v && v.step})`);
  check(v.tiles.length === 6 && v.tiles.every((x) => !x.on) && v.next.disabled, 'six tiles, nothing selected, Continue disabled');
  await page.evaluate(() => document.querySelector('#kit-onboarding [data-others]').click());
  await sleep(200);
  await page.evaluate(() => { const i = document.querySelector('#kit-onboarding [data-f="kind-q"]').shadowRoot.querySelector('input'); i.value = 'pharm'; i.dispatchEvent(new Event('input', { bubbles: true, composed: true })); });
  await sleep(200);
  v = await read(page);
  check(v.list && v.list.length >= 1 && v.list.every((r) => /pharm/i.test(r.title)), `Show other types: a searchable list of every trade (${v.list.map((r) => r.title).join(', ')})`);
  const pick = v.list[0].id;
  await page.evaluate((id) => document.querySelector('#kit-onboarding [data-l="kinds"]').shadowRoot.querySelector('[data-id="' + id + '"] [data-row]').click(), pick);
  await sleep(200);
  v = await read(page);
  check(!v.next.disabled && v.list.find((r) => r.id === pick).selected, `a choice from the list enables Continue (${pick})`);
  await page.evaluate(() => document.querySelector('#kit-onboarding [data-kind]').click());
  await sleep(100);
  v = await read(page);
  const kind = v.tiles[0].id;
  check(v.tiles[0].on && v.tiles.filter((x) => x.on).length === 1, `a tile is one choice among them (${kind})`);
  await next(page);
  await sleep(300);

  v = await read(page);
  check(v.step === 'Step 3 of 5' && v.which === 'goals', 'step 3, the goals');
  await page.evaluate(() => {
    const chips = document.querySelector('#kit-onboarding k-chips').shadowRoot;
    ['sales', 'stock'].forEach((g) => {
      const b = chips.querySelector('[data-chip="' + g + '"]');
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
      b.click();
    });
  });
  await page.evaluate(() => { const i = document.querySelector('#kit-onboarding [data-f="goal"]').shadowRoot.querySelector('input'); i.value = '12.345'; i.dispatchEvent(new Event('input', { bubbles: true, composed: true })); });
  await next(page);
  await sleep(200);
  v = await read(page);
  check(v.which === 'goals' && /at most two decimal places/.test(v.goalError), `a daily goal the shipped check refuses: ob.err.goal under the field (${v.goalError})`);
  await page.evaluate(() => { const i = document.querySelector('#kit-onboarding [data-f="goal"]').shadowRoot.querySelector('input'); i.value = '5000'; i.dispatchEvent(new Event('input', { bubbles: true, composed: true })); });
  await next(page);
  await sleep(300);

  v = await read(page);
  check(v.step === 'Step 4 of 5' && v.which === 'code', 'step 4, the personal code on the PIN pad');
  await pad(page, '0000');
  check(/reserved for the demo/.test(await padText(page)), 'a demo code is refused');
  await pad(page, '2468');
  check(/Enter it again to confirm/.test(await padText(page)), 'then ob.code_again');
  await pad(page, '1357');
  check(/don't match/.test(await padText(page)) && /Your personal code/.test(await padText(page)), 'a mismatch says ob.code_mismatch and starts again');
  await pad(page, '2468');
  await pad(page, '2468');
  v = await read(page);
  check(v.step === 'Step 5 of 5' && v.which === 'device', 'the same code twice: step 5, this device');

  await page.evaluate(() => document.querySelector('#kit-onboarding [data-back]').click());
  await sleep(200);
  await page.evaluate(() => document.querySelector('#kit-onboarding [data-back]').click());
  await sleep(200);
  v = await read(page);
  const kept = await page.evaluate(() => ({ chips: document.querySelector('#kit-onboarding k-chips').getAttribute('value'), goal: document.querySelector('#kit-onboarding [data-f="goal"]').value, type: window.KiwiOnboarding.kit.state.typeId }));
  check(v.which === 'goals' && kept.chips === 'sales,stock' && kept.goal === '5000' && kept.type === kind, 'Back keeps every answer');
  await next(page); await sleep(300);
  await pad(page, '2468'); await pad(page, '2468');

  v = await read(page);
  check(v.which === 'device' && v.next.disabled && v.next.label === 'Start using Kiwi', 'Start using Kiwi waits for a choice');
  const choose = (id) => page.evaluate((d) => document.querySelector('#kit-onboarding [data-l="device"]').shadowRoot.querySelector('[data-id="' + d + '"] [data-row]').click(), id);
  await choose('kds'); await sleep(100);
  check(/kitchen screen/.test((await read(page)).warn), 'the kitchen choice shows ob.kds_warning');
  await choose('team'); await sleep(100);
  check(/Each person signs in/.test((await read(page)).warn), 'the team choice shows ob.team_warning');
  await choose('dashboard'); await sleep(100);
  v = await read(page);
  check(!v.next.disabled && v.warn === '', 'the dashboard: no warning, Start enabled');
  await next(page);
  await page.waitForFunction(() => !document.getElementById('kit-onboarding'), { timeout: 10000 }).catch(() => {});
  await sleep(500);
  const done = await page.evaluate(() => ({ gone: !document.getElementById('kit-onboarding'), created: window.__created.slice(), onboarded: localStorage.getItem('kiwiOnboarded') }));
  const c = done.created[0] || {};
  check(done.created.length === 1 && c.subtype === kind && c.goal === 5000 && JSON.stringify(c.profile.goals) === '["sales","stock"]' && c.pins.length === 1 && c.pins[0].role === 'owner' && c.pins[0].code === '2468',
    `Start using Kiwi runs the shipped finish(): the store, its type, goals, daily goal and the owner's code (${c.subtype}, ${c.goal})`);
  check(done.gone && done.onboarded === '1', 'then the dashboard opens (kiwiOnboarded)');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();

  /* A team device: sign out, then the team sign-in. */
  {
    // coverage: surface=onboarding locale=en viewport=phone
    const o = await open();
    await o.page.evaluate(() => document.querySelector('#kit-onboarding [data-kind]').click());
    await next(o.page); await sleep(300);
    await next(o.page); await sleep(300);
    await pad(o.page, '2468'); await pad(o.page, '2468');
    await o.page.evaluate(() => document.querySelector('#kit-onboarding [data-l="device"]').shadowRoot.querySelector('[data-id="team"] [data-row]').click());
    await sleep(100);
    await Promise.all([o.page.waitForNavigation({ timeout: 10000 }).catch(() => {}), next(o.page)]);
    await sleep(500);
    const at = new URL(o.page.url()).pathname;
    check(o.requests.includes('/auth/logout') && at === '/kiwi-serveur.html', `a team device signs the owner out, then opens the team sign-in (${at})`);
    await o.ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-onboarding-browser-test · ${checks} checks`);
