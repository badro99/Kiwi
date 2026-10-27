#!/usr/bin/env node
/* team-pin-browser-test · the team app's sign-in and clock-in on the kit's pad
 * (stage 3a, §18.10, §10.2's team and clock rows), behind kiwiSkin2027:team,
 * in a real Chromium, with real clicks on the pad's keys.
 *
 *   node tools/team-pin-browser-test.mjs
 *
 * /api/employee is intercepted and knows fabricated test values only (an
 * e-mail at example.com, a personal code and an attendance code made up for
 * this suite). No account, store or real service is touched.
 *
 * What it holds:
 *   · flag off: no kit file is fetched and the shipped form stays;
 *   · flag on, step 1: the e-mail alone, no pad; an address that is not one
 *     opens nothing; a valid one opens the pad, which names it;
 *   · step 2: "Change e-mail" goes back with the address kept; a wrong code
 *     says team.bad politely and keeps the keys; the right one loads the
 *     session and opens the clock-in pad, six digits;
 *   · clock-in: a wrong code says clock.invalid; the right one opens the
 *     service (the main screen);
 *   · clock-out: the pad asks again, and the right code closes the shift and
 *     returns to the sign-in, step 1. */
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

const EMAIL = 'sara.test@example.com';
const TEAM = '5193';       // this suite's personal code
const ATT = '602417';      // this suite's attendance code

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
const S = suite('team-pin', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(tr, ctx, { flag = true } = {}) {
  const st = { session: false, open: null, posts: [] };
  const page = tr.watch(await ctx.newPage());
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  const kitFetched = [];
  const payload = () => ({ ok: true, merchant: 'team-test', employee: { id: 'e_sara', name: 'Sara Test', firstName: 'Sara', initials: 'ST', role: 'serveur' },
    store: { type: 'restaurant', timezone: 'Africa/Casablanca', name: 'Team Test' }, attendance: { open: st.open }, colleagues: [], messages: [] });
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.origin !== base) return req.continue();
    if (/^\/assets\/kit\/(core|pin|pin-flow|team-pin)\.js$/.test(u.pathname)) kitFetched.push(u.pathname);
    if (u.pathname === '/kiwi-sw.js') return req.respond(json(404, {}));
    if (u.pathname === '/api/employee') {
      if (req.method() === 'GET') return req.respond(st.session ? json(200, payload()) : json(401, { error: 'employee-session-required' }));
      let b = {};
      try { b = JSON.parse(req.postData() || '{}'); } catch (_) {}
      st.posts.push(b.action);
      if (b.action === 'login') {
        if (b.email === EMAIL && b.pin === TEAM) { st.session = true; return req.respond(json(200, { ok: true })); }
        return req.respond(json(401, { error: 'bad-employee-code' }));
      }
      if (!st.session) return req.respond(json(401, { error: 'employee-session-required' }));
      if ((b.action === 'clock-in' || b.action === 'clock-out') && st.offline) return req.abort('internetdisconnected');
      if (b.action === 'clock-in' || b.action === 'clock-out') {
        if (b.attendanceCode !== ATT) return req.respond(json(403, { error: 'attendance-code-invalid' }));
        if (b.action === 'clock-in') { st.open = { inTs: Date.now() }; return req.respond(json(200, Object.assign(payload(), { entry: st.open }))); }
        st.open = null; return req.respond(json(200, payload()));
      }
      if (b.action === 'logout') { st.session = false; return req.respond(json(200, { ok: true })); }
      return req.respond(json(200, { ok: true }));
    }
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/')) return req.respond(json(404, {}));
    return req.continue();
  });
  page.on('dialog', async (d) => { await d.dismiss(); });
  await page.evaluateOnNewDocument((f) => {
    try {
      localStorage.setItem('kiwiLang', 'en');
      if (f) localStorage.setItem('kiwiSkin2027:team', '1'); else localStorage.removeItem('kiwiSkin2027:team');
    } catch (_) {}
  }, flag);
  page.setDefaultNavigationTimeout(60000);
  // coverage: surface=team-entry locale=en viewport=phone
  await page.goto(`${base}/kiwi-serveur.html?merchant=team-test`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#screen-pin', { timeout: 30000 });
  if (flag) await page.waitForSelector('.k-team-signin', { timeout: 30000 });
  await sleep(300);
  page.kitFetched = kitFetched;
  page.st = st;
  return page;
}

const T = (page, k, a) => page.evaluate((key, args) => String(KiwiStrings.t(key, args || {})).replace(/[⁦-⁩]/g, ''), k, a);
async function key(page, sel, k) {
  const h = await page.evaluateHandle((s, x) => document.querySelector(s).shadowRoot.querySelector('[data-key="' + x + '"]'), sel, String(k));
  const box = await h.asElement().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function type(page, sel, code) { for (const d of code) { await key(page, sel, d); await sleep(30); } }
const regions = (page, sel) => page.evaluate((s) => {
  const r = document.querySelector(s).shadowRoot;
  return { pol: r.querySelector('.pol').textContent, ass: r.querySelector('.ass').textContent, id: r.querySelector('#id').textContent,
    ti: r.querySelector('#ti').textContent, keys: r.querySelector('[data-key="5"]').getAttribute('aria-disabled') === 'true' ? 'true' : 'false' };
}, sel);
const SIGN = '.k-team-signin k-pin-pad';
const CLOCK = '.k-team-clock k-pin-pad';
const active = (page) => page.evaluate(() => (document.querySelector('.screen.is-active') || {}).id || '');
async function waitText(page, sel, region, want, ms = 6000) {
  await page.waitForFunction((s, r, w) => { const x = document.querySelector(s); return x && x.shadowRoot.querySelector('.' + r).textContent === w; }, { timeout: ms }, sel, region, want);
  return true;
}

try {
  await S.run('flag off · the shipped form, no kit file fetched', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=team-entry locale=en viewport=phone
    const page = await open(tr, ctx, { flag: false });
    check(await page.evaluate(() => !document.querySelector('k-pin-pad') && !window.KiwiTeamPin), 'no pad, no adapter');
    check(page.kitFetched.length === 0, 'no kit script was fetched');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('#employee-login')).display !== 'none'), 'the shipped sign-in form still shows');
  });

  await S.run('flag on · sign-in in two steps, then clock in and out', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=team-entry locale=en viewport=phone
    const page = await open(tr, ctx);
    check(await page.evaluate(() => getComputedStyle(document.querySelector('#employee-login')).display === 'none'), 'the shipped form gives way to the kit');
    check(await page.evaluate(() => !document.querySelector('.k-team-signin k-pin-pad')), 'step 1 has no pad');
    check(await page.evaluate(() => { const i = document.querySelector('#k-team-email'); return i.type === 'email' && i.getAttribute('autocomplete') === 'username'; }), 'a native e-mail field the password manager can fill');

    tr.step('an address that is not one');
    await page.click('#k-team-email');
    await page.keyboard.type('sara', { delay: 10 });
    await page.keyboard.press('Enter');
    await sleep(200);
    check(await page.evaluate(() => !document.querySelector('.k-team-signin k-pin-pad') && document.querySelector('.k-team-next').getAttribute('aria-disabled') === 'true'), 'opens nothing, and Next says why it is off');

    tr.step('a valid address');
    await page.keyboard.type('.test@example.com', { delay: 5 });
    await page.click('.k-team-next');
    await page.waitForSelector(SIGN, { timeout: 5000 });
    let r = await regions(page, SIGN);
    check(r.id === EMAIL && r.ti === await T(page, 'pin.title'), `the pad names the address (${r.id})`);

    tr.step('change the e-mail');
    await page.evaluate((s) => document.querySelector(s).shadowRoot.querySelector('[data-extra]').click(), SIGN);
    await sleep(150);
    check(await page.evaluate((e) => !document.querySelector('.k-team-signin k-pin-pad') && document.querySelector('#k-team-email').value === e, EMAIL), '"Change e-mail" goes back, the address kept');
    await page.click('.k-team-next');
    await page.waitForSelector(SIGN, { timeout: 5000 });

    tr.step('a wrong code');
    await type(page, SIGN, '0000');
    check(await waitText(page, SIGN, 'pol', await T(page, 'team.bad')), 'team.bad, politely');
    await sleep(900);
    check((await regions(page, SIGN)).keys === 'false', 'the keys stay enabled');

    tr.step('the right code');
    /* 2027 is a skin (owner, 2026-10-27): the pad signs in through the shipped
       form's KiwiEmployeeLive.login, which hands the phone's offline punches
       to whoever signs in, never a request of its own. */
    await page.evaluate(() => { const L = window.KiwiEmployeeLive, real = L.login; window.__logins = 0; L.login = function () { window.__logins++; return real.apply(this, arguments); }; });
    await type(page, SIGN, TEAM);
    await page.waitForFunction(() => (document.querySelector('.screen.is-active') || {}).id === 'screen-clockin', { timeout: 8000 });
    check(true, 'the session opens on the clock-in screen');
    check(await page.evaluate(() => window.__logins) === 1, 'through the shipped KiwiEmployeeLive.login, once');
    await page.waitForSelector(CLOCK, { timeout: 5000 });
    check(await page.evaluate((s) => document.querySelector(s).getAttribute('length') === '6', CLOCK), 'with a six-digit pad');
    r = await regions(page, CLOCK);
    check(r.ti === await T(page, 'clock.code.title') && r.id === await T(page, 'clock.in'), `titled ${r.ti} · ${r.id}`);
    check(await page.evaluate(() => getComputedStyle(document.querySelector('#attendance-code')).display === 'none' || getComputedStyle(document.querySelector('.nfc-zone')).display === 'none'), 'the shipped code field gives way');

    tr.step('a wrong attendance code');
    await type(page, CLOCK, '111111');
    check(await waitText(page, CLOCK, 'pol', await T(page, 'clock.invalid')), 'clock.invalid, politely');
    await sleep(900);

    tr.step('the right attendance code');
    await type(page, CLOCK, ATT);
    await page.waitForFunction(() => (document.querySelector('.screen.is-active') || {}).id === 'screen-main', { timeout: 10000 });
    check(true, 'the shift opens: the main screen');
    check(page.st.open && page.st.posts.filter((a) => a === 'clock-in').length === 2, 'after two clock-in requests, the second recorded');

    tr.step('clock out');
    await sleep(4500);
    /* The button opens the end-of-shift card; its own button clocks out. */
    await page.evaluate(() => document.querySelector('#profil-clockout').click());
    await page.waitForFunction(() => { const v = document.getElementById('kg-shiftcard'); return v && v.classList.contains('is-open'); }, { timeout: 5000 });
    await page.evaluate(() => document.getElementById('kg-sc-clockout').click());
    await page.waitForSelector(CLOCK, { timeout: 5000 });
    await page.waitForFunction(() => (document.querySelector('.screen.is-active') || {}).id === 'screen-clockin', { timeout: 5000 });
    r = await regions(page, CLOCK);
    check(r.id === await T(page, 'clock.out'), `the pad asks to clock out (${r.id})`);
    await type(page, CLOCK, ATT);
    await page.waitForFunction(() => (document.querySelector('.screen.is-active') || {}).id === 'screen-pin', { timeout: 8000 });
    check(!page.st.open && !page.st.session, 'the shift is closed and the session signed out');
    check(await page.evaluate(() => !document.querySelector('.k-team-signin k-pin-pad') && !document.querySelector('.k-team-step').hidden), 'back to the sign-in, step 1');
  });

  /* 2027 is a skin (owner, 2026-10-27): the pad hands the punch to the same
     KiwiEmployeeLive call as the shipped button, so a clock-in typed without
     a connection is kept on the phone and sent when the network is back. */
  await S.run('flag on · a clock-in without a connection is kept and sent later', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    // coverage: surface=team-entry locale=en viewport=phone
    const page = await open(tr, ctx);
    await page.click('#k-team-email');
    await page.keyboard.type(EMAIL, { delay: 5 });
    await page.click('.k-team-next');
    await page.waitForSelector(SIGN, { timeout: 5000 });
    await type(page, SIGN, TEAM);
    await page.waitForSelector(CLOCK, { timeout: 8000 });

    tr.step('the right code, network down');
    page.st.offline = true;
    await type(page, CLOCK, ATT);
    await page.waitForFunction(() => (document.querySelector('.screen.is-active') || {}).id === 'screen-main', { timeout: 10000 });
    check(true, 'the shift opens on the phone, as with the shipped button');
    check(!page.st.open, 'the server has not recorded it yet');
    check(await page.evaluate(() => window.KiwiEmployeeLive.pendingPunches() === 1), 'one punch waits in the shipped queue');

    tr.step('the network comes back');
    page.st.offline = false;
    await page.evaluate(() => window.KiwiEmployeeLive.flushPunches());
    await page.waitForFunction(() => window.KiwiEmployeeLive.pendingPunches() === 0, { timeout: 8000 });
    check(!!page.st.open, 'the kept clock-in reached the server');
    check(page.st.posts.filter((a) => a === 'clock-in').length >= 2, 'by a second send of the same punch');
  });
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log(`✓ team-pin-browser-test · ${checks} checks`);
await S.finish();
