#!/usr/bin/env node
/* dash-pin-browser-test · the dashboard lock on the kit's pad (stage 3a, §10.2's
 * dashboard rows), behind kiwiSkin2027:dashboard, in a real Chromium, with real
 * clicks on the pad's keys.
 *
 *   node tools/dash-pin-browser-test.mjs
 *
 * The "server" intercepts /api/pin/verify and knows fabricated test values
 * only (never a real code), answering as functions/api/pin/verify.js does. No
 * account, store or real service is touched.
 *
 * What it holds:
 *   · flag off: no kit file is fetched and the shipped cells stay;
 *   · flag on: the pad replaces the cells; online the server is asked first;
 *     a proven owner code opens the lock and writes one salted row, never the
 *     code; a 401 bad-pin refuses with pin.wrong (polite, keys enabled) and
 *     erases the matching row; a staff-tier 200 refuses; configured:false
 *     opens unmatched and writes no row; a dead session says pin.signed_out
 *     (assertive) and keeps the row; a 429 says pin.paused.self with the
 *     minutes and the keys enabled;
 *   · the server cannot answer: a proven row opens, an unknown code gets
 *     pin.dashboard.offline_unknown offline;
 *   · no code above the staff tier: the help line is pin.dashboard.no_owner_code
 *     and the first key brings the usual line back;
 *   · a demo surface with nobody configured opens on any code. */
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

const CODE = '7391';     // this suite's owner value
const OTHER = '2580';
const STAFF = '4826';    // a cashier's value: proven, but not a dashboard code
const ACCOUNT = 'dash-pin-test@example.com';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('dash-pin', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

let verifyMode = 'normal';   // normal | refuse-all | refuse-unconfigured | down | expired-html | busy
let roster = [{ name: 'Amira', role: 'owner' }];
const asked = [];
const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(tr, ctx, { flag = true, demos = false, onboarded = true } = {}) {
  const page = tr.watch(await ctx.newPage());
  await page.setViewport({ width: 1180, height: 900 });
  await page.setRequestInterception(true);
  const kitFetched = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.origin !== base) return req.continue();
    if (/^\/assets\/kit\/(core|pin|pin-flow|dash-pin)\.js$/.test(u.pathname)) kitFetched.push(u.pathname);
    if (u.pathname === '/kiwi-sw.js') return req.respond(json(404, {}));
    if (u.pathname === '/api/pin/verify') {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
      asked.push(Boolean(body.pin));
      if (verifyMode === 'down') return req.abort('failed');
      if (verifyMode === 'expired-html') return req.respond({ status: 401, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Kiwi</title>' });
      if (verifyMode === 'busy') return req.respond(json(429, { error: 'rate-limited', retry_after: 240 }));
      if (verifyMode === 'normal' && body.pin === CODE) return req.respond(json(200, { ok: true, staff: { id: 'st_owner', name: 'Amira', role: 'owner' }, merchant: 'dash-pin-test' }));
      if (verifyMode === 'normal' && body.pin === STAFF) return req.respond(json(200, { ok: true, staff: { id: 'st_cash', name: 'Sara', role: 'caisse' }, merchant: 'dash-pin-test' }));
      if (verifyMode === 'refuse-unconfigured') return req.respond(json(401, { error: 'bad-pin', configured: false }));
      return req.respond(json(401, { error: 'bad-pin' }));
    }
    if (u.pathname === '/api/config') return req.respond(json(200, { pins: roster }));
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/')) return req.respond(json(404, {}));
    return req.continue();
  });
  page.on('dialog', async (d) => { await d.dismiss(); });
  await page.evaluateOnNewDocument((account, f, d, ob) => {
    try {
      localStorage.setItem('kiwiAccountKey', account);
      if (!d) localStorage.setItem('kiwiDemos', '0');
      if (ob) localStorage.setItem('kiwiOnboarded', '1');
      localStorage.setItem('kiwiLang', 'en');
      if (f) localStorage.setItem('kiwiSkin2027:dashboard', '1');
      else localStorage.removeItem('kiwiSkin2027:dashboard');
    } catch (_) {}
  }, ACCOUNT, flag, demos, onboarded);
  page.setDefaultNavigationTimeout(60000);
  await page.goto(`${base}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-kiwi-pin-input]', { timeout: 30000 });
  if (flag) await page.waitForFunction(() => { const p = document.querySelector('[data-kiwi-lock] k-pin-pad'); return p && p.shadowRoot && p.shadowRoot.querySelector('[data-key="1"]'); }, { timeout: 30000 });
  await page.waitForFunction(() => !!window.KiwiDashPinVault && window.KiwiConfig && window.KiwiConfig.accountPinsReady !== false, { timeout: 30000 });
  page.kitFetched = kitFetched;
  return page;
}

async function key(page, k) {
  const h = await page.evaluateHandle((x) => document.querySelector('[data-kiwi-lock] k-pin-pad').shadowRoot.querySelector('[data-key="' + x + '"]'), String(k));
  const box = await h.asElement().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function typeCode(page, code) { for (const d of code) { await key(page, d); await sleep(30); } }
const opened = (page) => page.evaluate(() => {
  const l = document.querySelector('[data-kiwi-lock]');
  return !l || l.classList.contains('is-unlocking') || !!document.querySelector('[data-kiwi-greet].is-visible');
});
const regions = (page) => page.evaluate(() => {
  const r = document.querySelector('[data-kiwi-lock] k-pin-pad').shadowRoot;
  return { pol: r.querySelector('.pol').textContent, ass: r.querySelector('.ass').textContent, sub: r.querySelector('#sub').textContent,
    keys: r.querySelector('[data-key="5"]').getAttribute('aria-disabled') === 'true' ? 'true' : 'false' };
});
const tr$ = (page, k, a) => page.evaluate((key, args) => String(KiwiStrings.t(key, args || {})).replace(/[⁦-⁩]/g, ''), k, a);
async function outcome(page, within = 6000) {
  const until = Date.now() + within;
  while (Date.now() < until) {
    if (await opened(page)) return 'opened';
    const r = await regions(page);
    if (r.pol || r.ass) return 'refused';
    await sleep(80);
  }
  return 'none';
}
const vaultCount = (page) => page.evaluate(() => window.KiwiDashPinVault.count());
const noPlaintext = async (page, msg) => {
  const dump = await page.evaluate(() => Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\n'));
  check(!dump.includes(CODE_) && !/"(code|pin|pinCode|password)"\s*:/.test(dump), msg);
};
const CODE_ = `"${CODE}"`;

async function prove(tr, ctx) {
  verifyMode = 'normal';
  const first = await open(tr, ctx);
  await typeCode(first, CODE);
  assert.equal(await outcome(first), 'opened');
  await first.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
  await first.close();
}

try {
  await S.run('flag off · the shipped cells, no kit file fetched', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, { flag: false });
    await sleep(400);
    check(await page.evaluate(() => !document.querySelector('k-pin-pad') && !window.KiwiDashPin && !document.documentElement.hasAttribute('data-skin-2027')), 'no pad, no adapter, no skin mark');
    check(page.kitFetched.length === 0, 'no kit script was fetched (' + page.kitFetched.join(', ') + ')');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('[data-kiwi-pin]')).display !== 'none'), 'the four shipped cells still show');
  });

  await S.run('flag on · online, the server first', async (tr) => {
    verifyMode = 'normal';
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx);
    check(await page.evaluate(() => document.documentElement.getAttribute('data-skin-2027') === 'dashboard'), 'the page carries the dashboard skin mark');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('[data-kiwi-pin]')).display === 'none' && getComputedStyle(document.querySelector('.kiwi-lock-help')).display === 'none'), 'the pad replaces the cells and the help line');
    check(await page.evaluate(() => document.querySelector('[data-kiwi-lock] k-pin-pad').getAttribute('length') === '4'), 'a four-digit pad');
    const before = asked.length;
    await typeCode(page, CODE);
    check(await outcome(page) === 'opened', 'a proven owner code opens the lock');
    check(asked.length === before + 1, 'after one request to the server');
    await page.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
    check(true, 'one salted row was written');
    check(await page.evaluate(() => window.__kiwiRole === 'owner'), 'with the owner tier');
    await noPlaintext(page, 'and no code in localStorage');

    tr.step('a wrong code');
    const p2 = await open(tr, ctx);
    await typeCode(p2, OTHER);
    check(await outcome(p2) === 'refused', 'a code the server refuses keeps the lock');
    let r = await regions(p2);
    check(r.pol === await tr$(p2, 'pin.wrong') && !r.ass, `pin.wrong, politely (${r.pol})`);
    await sleep(900);
    r = await regions(p2);
    check(r.keys === 'false', 'the keys stay enabled');
    check(await vaultCount(p2) === 1, 'a stranger\'s wrong code erases nothing');

    tr.step('a cashier\'s code: proven, not a dashboard code');
    const p3 = await open(tr, ctx);
    await typeCode(p3, STAFF);
    check(await outcome(p3) === 'refused' && (await regions(p3)).pol === await tr$(p3, 'pin.wrong'), 'a staff-tier 200 is refused with pin.wrong');
    check(await vaultCount(p3) === 1, 'and writes no row');
  });

  await S.run('flag on · a no is final, a dead session is not a no, a 429 waits', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    await prove(tr, ctx);
    verifyMode = 'expired-html';
    const p1 = await open(tr, ctx);
    await typeCode(p1, CODE);
    check(await outcome(p1) === 'refused', 'a dead session keeps the lock');
    let r = await regions(p1);
    check(r.ass === await tr$(p1, 'pin.signed_out') && !r.pol, `pin.signed_out, assertively (${r.ass})`);
    check(await p1.evaluate(() => { const a = document.querySelector('[data-kiwi-lock] k-pin-pad').shadowRoot.querySelector('[data-act]'); return a && !a.hidden; }), 'with a Sign in button');
    check(await vaultCount(p1) === 1, 'and the row stays');

    verifyMode = 'busy';
    const p2 = await open(tr, ctx);
    await typeCode(p2, CODE);
    check(await outcome(p2) === 'refused', 'a 429 keeps the lock');
    r = await regions(p2);
    check(r.ass === await tr$(p2, 'pin.paused.self', { minutes: 4 }), `pin.paused.self with the minutes (${r.ass})`);
    await sleep(900);
    check((await regions(p2)).keys === 'false', 'the keys stay enabled (§10.2: the dashboard\'s pause)');

    verifyMode = 'refuse-all';
    const p3 = await open(tr, ctx);
    await typeCode(p3, CODE);
    check(await outcome(p3) === 'refused', 'online, the server\'s no is final whatever this browser holds');
    await p3.waitForFunction(() => window.KiwiDashPinVault.count() === 0, { timeout: 5000 });
    check(true, 'and it erases the row that matched');
    verifyMode = 'normal';
  });

  await S.run('flag on · configured:false opens, unmatched', async (tr) => {
    verifyMode = 'refuse-unconfigured';
    roster = [];
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx);
    await typeCode(page, OTHER);
    check(await outcome(page) === 'opened', 'the server says this account has no code: the lock opens');
    check(await vaultCount(page) === 0, 'and writes no row');
    roster = [{ name: 'Amira', role: 'owner' }];
    verifyMode = 'normal';
  });

  await S.run('flag on · the server cannot answer: the rows decide', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    await prove(tr, ctx);
    verifyMode = 'down';
    const p1 = await open(tr, ctx);
    await typeCode(p1, CODE);
    check(await outcome(p1) === 'opened', 'the server is silent: the proven row opens the code');
    const p2 = await open(tr, ctx);
    await p2.setOfflineMode(true);
    const before = asked.length;
    await typeCode(p2, OTHER);
    check(await outcome(p2) === 'refused', 'offline, an unknown code is refused');
    check(asked.length === before, 'without trying the network');
    const r = await regions(p2);
    check(r.pol === await tr$(p2, 'pin.dashboard.offline_unknown'), `pin.dashboard.offline_unknown (${r.pol})`);
    await sleep(900);
    check((await regions(p2)).keys === 'false', 'keys enabled: the next code is the retry');
    await p2.setOfflineMode(false);
    verifyMode = 'normal';
  });

  await S.run('flag on · no code above the staff tier', async (tr) => {
    roster = [{ name: 'Sara', role: 'caisse' }];
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx);
    const want = await tr$(page, 'pin.dashboard.no_owner_code');
    await page.waitForFunction((w) => document.querySelector('[data-kiwi-lock] k-pin-pad').shadowRoot.querySelector('#sub').textContent === w, { timeout: 5000 }, want);
    check(true, 'the help line says no owner code is set up');
    check((await regions(page)).keys === 'false', 'with the keys enabled');
    await key(page, '1');
    check((await regions(page)).sub === await tr$(page, 'pin.sub.personal'), 'the first key brings the usual line back');
    roster = [{ name: 'Amira', role: 'owner' }];
  });

  await S.run('flag on · a demo surface with nobody configured opens', async (tr) => {
    roster = [];
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, { demos: true });
    const before = asked.length;
    await typeCode(page, OTHER);
    check(await outcome(page) === 'opened', 'any code opens the demo, as shipped');
    check(asked.length === before, 'with nobody to ask, nothing is sent');
    roster = [{ name: 'Amira', role: 'owner' }];
  });
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log(`✓ dash-pin-browser-test · ${checks} checks`);
await S.finish();
