#!/usr/bin/env node
/* tools/app-interaction-test.mjs — the native setup shell, driven for real.
 *
 * Wired in tools/check.js (an unnamed test guards nothing). Unlike the
 * source-text guards in app-bundle-test.mjs, every control here executes the
 * built bundle in a real Chromium: clicks happen, network is stubbed, and
 * assertions read the live DOM (visibility, attributes, computed style,
 * bounding boxes, navigation). Static fixtures only — no backend, no network,
 * no randomness.
 *
 * Needs: the `puppeteer-core` devDependency (app/package.json) and a Chromium
 * binary (KIWI_CHROMIUM_BIN, or the usual install paths). When either is
 * missing the suite SKIPS green with an explicit ○ line instead of failing —
 * a missing browser is an environment gap, not a product regression.
 *
 * Matrix (one browser, fresh context per page):
 *  · boot: slow / hanging / rejecting / missing secure storage, stored-role
 *    redirect — the launch void can never return;
 *  · full guided flow (fr/iPhone): login busy recovery → role aria-pressed →
 *    connect select+pair (button hides when bound) → printer scan+test
 *    (messages inside the card) → ready → finish navigates;
 *  · fast flows (fr/320, fr/iPad portrait+landscape): overflow + layout
 *    invariants on every step;
 *  · locales (en+iPhone smoke, ar+iPhone compact single-store flow):
 *    lang/dir, translated platform label, LTR paper widths in Arabic;
 *  · touch: every visible .link control measures ≥ 44px;
 *  · reduced motion: transitions collapse, boot ring freezes.
 *
 * Key stills land in KIWI_SHOTS_DIR (default: a fresh tmpdir, printed at the
 * end) for human inspection — the verdict never rests on them alone.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from './build-app-www.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let failures = 0;
let controls = 0;
const ok = (m) => { controls++; console.log(`  ✓ ${m}`); };
const bad = (m) => { failures++; console.log(`  ✗ ${m}`); };

console.log('app-interaction-test');

function findChromium() {
  const env = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN || '';
  if (env) {
    try { if (fs.existsSync(env)) return env; } catch (_) {}
  }
  const cands = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch (_) {} }
  return '';
}

async function loadPuppeteer() {
  try {
    const req = createRequire(path.join(ROOT, 'app', 'package.json'));
    const mod = await import(req.resolve('puppeteer-core'));
    return mod.default || mod;
  } catch (_) { return null; }
}

const bin = findChromium();
const puppeteer = bin ? await loadPuppeteer() : null;
if (!bin || !puppeteer) {
  const reason = !bin ? 'no Chromium binary (set KIWI_CHROMIUM_BIN)' : 'puppeteer-core not installed (npm --prefix app install)';
  if (process.env.CI) {
    console.error(`  ✗ ${reason} — CI must execute the browser assertions`);
    process.exit(1);
  }
  console.log(`  ○ skip: ${reason} — browser assertions not executed`);
  process.exit(0);
}

/* ── deterministic bundle + local server ─────────────────────────────── */
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-app-interact-'));
const shotsDir = process.env.KIWI_SHOTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-app-shots-'));
fs.mkdirSync(shotsDir, { recursive: true });
let outDir = '';
try {
  const res = build({ out: path.join(work, 'www'), quiet: true });
  if (!res || (res.errors && res.errors.length)) throw new Error((res && res.errors.join(' ; ')) || 'build failed');
  outDir = res.out;
} catch (e) {
  bad(`bundle build failed: ${e.message}`);
  console.log(`\napp-interaction-test : ${failures} échec(s)`);
  process.exit(1);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const file = path.join(outDir, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!file.startsWith(outDir)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  } catch (_) { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ── fixtures ────────────────────────────────────────────────────────── */
const ME_MULTI = { authenticated: true, business: 'Café Atlas', stores: [
  { merchant: 'cafe-atlas', name: 'Café Atlas', type: 'café' },
  { merchant: 'atlas-rooftop', name: 'Atlas Rooftop', type: 'restaurant' },
  { merchant: 'atlas-kiosque', name: 'Kiosque Atlas', type: 'kiosque' },
] };
const ME_SINGLE = { authenticated: true, business: 'Solo Shop', stores: [{ merchant: 'solo', name: 'Solo Shop', type: 'boutique' }] };
const LOCALES = { fr: ['fr-FR', 'fr'], en: ['en-US', 'en'], ar: ['ar-MA', 'ar'] };
const VP = {
  iphone: { w: 390, h: 844, label: 'iPhone 390×844' },
  small320: { w: 320, h: 568, label: '320×568' },
  ipadPortrait: { w: 820, h: 1180, label: 'iPad portrait' },
  ipadLandscape: { w: 1180, h: 820, label: 'iPad landscape' },
};
const CORS = { 'Access-Control-Allow-Credentials': 'true' };

/* The native bridge, stubbed as a real function (never a source string:
 * string pageFunctions evaluate in expression position on some puppeteer
 * builds, where a trailing semicolon throws — functions run identically
 * everywhere). `secure` selects the secureGet behavior for the case. */
function applyPluginStub(pluginCfg) {
  function later(value, ms) {
    return new Promise(function (res) { setTimeout(function () { res(value); }, ms); });
  }
  var secure = typeof pluginCfg === 'string' ? pluginCfg : (pluginCfg && pluginCfg.secure);
  var scanMode = pluginCfg && typeof pluginCfg === 'object' ? pluginCfg.scan : null;
  var appInfo = pluginCfg && typeof pluginCfg === 'object' ? pluginCfg.appInfo : null;

  var plugins = {
    KiwiPrinterSocket: {
      probe: function () { return Promise.resolve({ ok: true }); },
      send: function () { return Promise.resolve({ ok: true }); },
      scan: function () {
        if (scanMode === 'empty') return Promise.resolve({ ok: true, hosts: [] });
        if (scanMode === 'reject') return Promise.reject(new Error('local network permission denied'));
        return Promise.resolve({ ok: true, hosts: [{ host: '192.168.1.50' }, { host: '192.168.1.51' }] });
      },
      secureSet: function () { return Promise.resolve({}); },
      secureGet: function () {
        if (secure === 'value') return Promise.resolve({ value: 'caisse' });
        if (secure === 'reject') return Promise.reject(new Error('denied'));
        if (secure === 'hang') return new Promise(function () {});
        if (secure === 'slow') return later({ value: '' }, 800);
        return Promise.resolve({ value: '' });
      },
    },
  };
  if (scanMode === 'unavailable') {
    delete plugins.KiwiPrinterSocket.scan;
  }
  if (appInfo !== false) {
    plugins.App = {
      getInfo: function () {
        if (appInfo && typeof appInfo === 'object') return Promise.resolve(appInfo);
        return Promise.resolve({ version: '1.0.0', build: '42' });
      }
    };
  }
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    getPlatform: function () { return (pluginCfg && pluginCfg.platform) || 'ios'; },
    Plugins: plugins,
  };
}

const browser = await puppeteer.launch({ executablePath: bin, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function openShell({ locale = 'fr', viewport = 'iphone', me = 'login', plugin = null, login = null } = {}) {
  const vp = VP[viewport];
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.evaluateOnNewDocument((tags) => {
    Object.defineProperty(navigator, 'language', { get: () => tags[0], configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => tags, configurable: true });
  }, LOCALES[locale]);
  if (plugin) await page.evaluateOnNewDocument(applyPluginStub, plugin);
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: vp.w > 800 ? 1 : 2, isMobile: vp.w < 800, hasTouch: true });
  await page.setRequestInterception(true);
  let pairMerchant = 'cafe-atlas', pairName = 'Café Atlas';
  page.on('request', (req) => {
    const u = req.url();
    const cors = { ...CORS, 'Access-Control-Allow-Origin': BASE };
    if (req.method() === 'OPTIONS') {
      return req.respond({ status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, accept' }, body: '' });
    }
    if (u.includes('/api/error')) return req.respond({ status: 200, body: '{}' });
    if (u.includes('/api/me')) {
      if (me === 'abort') return req.abort();
      if (me === 'login') return req.respond({ status: 401, headers: cors, body: '{}' });
      const body = me === 'single' ? ME_SINGLE : ME_MULTI;
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (u.includes('/auth/login')) {
      if (login === 'abort' || (login && login.abort)) return req.abort();
      if (login && login.delayMs) {
        return new Promise((res) => setTimeout(() => res(req.respond({ status: login.status || 401, headers: cors, contentType: 'application/json', body: JSON.stringify(login.body || { error: 'bad-creds' }) })), login.delayMs));
      }
      if (login && (login.status || login.body)) {
        return req.respond({ status: login.status || 200, headers: cors, contentType: 'application/json', body: JSON.stringify(login.body || { ok: true }) });
      }
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (u.includes('/auth/logout')) return req.respond({ status: 200, headers: cors, body: '{}' });
    if (u.includes('/api/pair/create')) {
      try { const b = JSON.parse(req.postData() || '{}'); pairMerchant = b.merchant || pairMerchant; pairName = b.name || pairName; } catch (_) {}
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"ok":true,"code":"PAIR-TEST-1"}' });
    }
    if (u.includes('/api/pair/redeem')) {
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ ok: true, merchant: pairMerchant, name: pairName, type: 'café', venueId: 'v1' }) });
    }
    if (u.startsWith(BASE + '/')) return req.continue();
    return req.abort();
  });
  page.closeCtx = () => ctx.close();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  return page;
}

const noOverflow = (page, label) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  .then((v) => (v ? ok(`no horizontal overflow — ${label}`) : bad(`horizontal overflow — ${label}`)));
const shot = (page, name) => page.screenshot({ path: path.join(shotsDir, `${name}.png`) });

async function waitShell(page) {
  await page.waitForFunction(() => !document.querySelector('#shell').hidden, { timeout: 9000 });
}
async function settleAccount(page) {
  await page.waitForFunction(
    () => !document.querySelector('#acct-state').hidden || !document.querySelector('#login').hidden || !document.querySelector('#acct-unknown').hidden,
    { timeout: 9000 },
  );
}
async function toRole(page) {
  await settleAccount(page);
  await page.click('#account-next');
  await page.waitForFunction(() => !document.querySelector('#step-role').hidden, { timeout: 8000 });
}
async function fromRole(page, role = 'caisse') {
  await page.click(`.tile[data-role="${role}"]`);
  await page.click('#role-next');
  await page.waitForFunction(() => !document.querySelector('#step-connect').hidden, { timeout: 8000 });
}

/* ── 1 · boot: the launch void can never return ───────────────────────── */
{
  // slow bridge: boot paints first, shell follows, boot is removed
  let p = await openShell({ plugin: 'slow' });
  await new Promise((r) => setTimeout(r, 250));
  const early = await p.evaluate(() => {
    const boot = document.querySelector('#boot');
    const shell = document.querySelector('#shell');
    if (!boot) return 'no-boot';
    const r = boot.getBoundingClientRect();
    return r.width > 0 && shell.hidden ? 'boot-visible' : 'boot-broken';
  });
  early === 'boot-visible' ? ok('boot stage paints before secure storage resolves (shell still hidden)') : bad(`boot stage wrong at 250ms: ${early}`);
  await shot(p, 'boot-slow-bridge');
  await waitShell(p);
  (await p.evaluate(() => !!document.querySelector('#boot'))) ? bad('boot node lingers after shell shows') : ok('boot node removed once the shell shows');
  await p.closeCtx();
}
{
  // hanging bridge: bounded lookup still opens the shell
  let p = await openShell({ plugin: 'hang' });
  const t0 = Date.now();
  await waitShell(p);
  const ms = Date.now() - t0;
  ms < 6000 ? ok(`hanging secure storage falls back to local shell (${ms}ms, bounded)`) : bad(`hanging bridge stalled the shell (${ms}ms)`);
  (await p.evaluate(() => !!document.querySelector('#boot'))) ? bad('boot node lingers after fallback') : ok('boot node removed on fallback path');
  await p.closeCtx();
}
{
  // rejecting bridge: local fallback
  let p = await openShell({ plugin: 'reject' });
  await waitShell(p);
  (await p.evaluate(() => !document.querySelector('#step-account').hidden)) ? ok('rejecting secure storage falls back to setup') : bad('rejecting bridge broke setup');
  await p.closeCtx();
}
{
  // stored role resolves: automatic navigation preserved
  let p = await openShell({ plugin: 'value' });
  await p.waitForFunction(() => location.href.includes('kiwi-caisse.html'), { timeout: 8000 })
    .then(() => ok('stored role still auto-opens its surface'))
    .catch(() => bad('stored role did not auto-open its surface'));
  await p.closeCtx();
}
{
  // no plugin at all, locally remembered role: same redirect, no bridge needed
  let p = await openShell({});
  await p.evaluate(() => { try { localStorage.setItem('kiwiAppRole', 'cuisine'); } catch (_) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => location.href.includes('kiwi-cuisine.html'), { timeout: 8000 })
    .then(() => ok('locally remembered role redirects without any plugin'))
    .catch(() => bad('local role did not redirect without plugin'));
  await p.closeCtx();
}

/* ── 2 · login busy → recovery (signed-out page) ───────────────────────── */
{
  const p = await openShell({ me: 'login', login: { delayMs: 1200, status: 401, body: { error: 'bad-creds' } } });
  await settleAccount(p);
  await shot(p, 'flow-01-account');
  await noOverflow(p, 'fr/iPhone account');

  // Label associations (for/id)
  const labelForEmail = await p.evaluate(() => {
    const l = document.querySelector('label[for="login-email"]');
    const input = document.querySelector('#login-email');
    return !!(l && input && l.contains(input));
  });
  const labelForPass = await p.evaluate(() => {
    const l = document.querySelector('label[for="login-password"]');
    const input = document.querySelector('#login-password');
    return !!(l && input);
  });
  labelForEmail && labelForPass
    ? ok('login form fields have explicit for/id label associations')
    : bad('missing login for/id associations');

  // Signed-out CTA promotion/demotion: Continuer is hidden, manual-mode is visible
  const signedOutCta = await p.evaluate(() => {
    const next = document.querySelector('#account-next');
    const manual = document.querySelector('#manual-mode');
    return {
      nextHidden: next ? next.hidden : false,
      nextHasCta: next ? next.classList.contains('cta') : false,
      manualVisible: manual ? !manual.hidden : false,
    };
  });
  signedOutCta.nextHidden && !signedOutCta.nextHasCta && signedOutCta.manualVisible
    ? ok('signed-out Continuer is hidden and manual role is the explicit unauthenticated route')
    : bad(`signed-out CTA state wrong: ${JSON.stringify(signedOutCta)}`);

  await p.type('#login input[name="email"]', 'owner@cafeatlas.ma');
  await p.type('#login input[name="password"]', 'wrongpassword1');
  const passwordBefore = await p.evaluate(() => ({ type: document.querySelector('#login-password').type, label: document.querySelector('#password-toggle').ariaLabel }));
  passwordBefore.type === 'password' && /Afficher/.test(passwordBefore.label)
    ? ok('password starts concealed and the toggle is labelled in French')
    : bad(`password toggle initial state wrong: ${JSON.stringify(passwordBefore)}`);
  await p.click('#password-toggle');
  const passwordShown = await p.evaluate(() => ({ type: document.querySelector('#login-password').type, value: document.querySelector('#login-password').value, pressed: document.querySelector('#password-toggle').getAttribute('aria-pressed'), label: document.querySelector('#password-toggle').ariaLabel }));
  passwordShown.type === 'text' && passwordShown.value === 'wrongpassword1' && passwordShown.pressed === 'true' && /Masquer/.test(passwordShown.label)
    ? ok('password visibility toggle reveals without clearing and announces its next action')
    : bad(`password reveal state wrong: ${JSON.stringify(passwordShown)}`);
  await p.click('#password-toggle');
  (await p.evaluate(() => document.querySelector('#login-password').type === 'password' && document.querySelector('#password-toggle').getAttribute('aria-pressed') === 'false'))
    ? ok('password visibility toggle conceals again')
    : bad('password did not return to its concealed state');
  await p.click('#login-btn');
  await new Promise((r) => setTimeout(r, 500));
  const busy = await p.evaluate(() => ({ dis: document.querySelector('#login-btn').disabled, label: document.querySelector('#login-btn').textContent }));
  busy.dis && busy.label !== 'Se connecter' ? ok(`login shows a busy state while auth is pending («${busy.label}»)`) : bad('login button shows no busy state');
  await p.waitForFunction(() => !document.querySelector('#login-err').hidden, { timeout: 8000 });
  const recovered = await p.evaluate(() => ({ dis: document.querySelector('#login-btn').disabled, label: document.querySelector('#login-btn').textContent, err: document.querySelector('#login-err').textContent }));
  !recovered.dis && recovered.label === 'Se connecter' && recovered.err.length > 0
    ? ok('login recovers after failure (button restored, error announced)')
    : bad('login did not recover after failure');

  const errAria = await p.evaluate(() => {
    const email = document.querySelector('#login-email');
    const pass = document.querySelector('#login-password');
    const active = document.activeElement;
    return {
      emailInvalid: email.getAttribute('aria-invalid'),
      emailDescribedBy: email.getAttribute('aria-describedby'),
      passInvalid: pass.getAttribute('aria-invalid'),
      passDescribedBy: pass.getAttribute('aria-describedby'),
      passFocused: active === pass,
    };
  });
  errAria.emailInvalid === 'true' && errAria.emailDescribedBy === 'login-err' &&
  errAria.passInvalid === 'true' && errAria.passDescribedBy === 'login-err' && errAria.passFocused
    ? ok('login failure sets aria-invalid/describedby on inputs and retains focus on password field')
    : bad(`login failure accessibility state wrong: ${JSON.stringify(errAria)}`);

  // Typing into email clears only email invalidity, leaving password invalid
  await p.type('#login-email', 'x');
  const emailClearedOnly = await p.evaluate(() => {
    const email = document.querySelector('#login-email');
    const pass = document.querySelector('#login-password');
    const err = document.querySelector('#login-err');
    return {
      emailInvalid: email.hasAttribute('aria-invalid'),
      emailDescribedBy: email.hasAttribute('aria-describedby'),
      passInvalid: pass.getAttribute('aria-invalid'),
      passDescribedBy: pass.getAttribute('aria-describedby'),
      errStillShown: !err.hidden && err.textContent.length > 0,
    };
  });
  !emailClearedOnly.emailInvalid && !emailClearedOnly.emailDescribedBy &&
  emailClearedOnly.passInvalid === 'true' && emailClearedOnly.passDescribedBy === 'login-err' &&
  emailClearedOnly.errStillShown
    ? ok('editing marked email clears only its own aria-invalid/describedby; password stays invalid and alert remains visible')
    : bad(`per-field clearing state wrong: ${JSON.stringify(emailClearedOnly)}`);

  // typing into password clears password invalidity
  await p.type('#login-password', 'x');
  const passCleared = await p.evaluate(() => {
    const pass = document.querySelector('#login-password');
    return !pass.hasAttribute('aria-invalid') && !pass.hasAttribute('aria-describedby');
  });
  passCleared ? ok('typing into invalid password input clears its aria-invalid and aria-describedby') : bad('typing did not clear password aria-invalid');

  await shot(p, 'flow-02-login-error');
  await p.closeCtx();
}

{
  // Operational errors (network, 429, not-configured, unknown): no aria-invalid, alert announced, focus on loginBtn
  const cases = [
    { label: 'network failure', login: 'abort', match: /Réseau injoignable|Network unavailable/ },
    { label: 'HTTP 429 rate limit', login: { status: 429, body: { error: 'too-many' } }, match: /Trop de tentatives|Too many attempts/ },
    { label: 'server configuration error', login: { status: 503, body: { error: 'not-configured' } }, match: /momentanément indisponible|temporarily unavailable/ },
    { label: 'unknown operational error', login: { status: 500, body: {} }, match: /Une erreur est survenue|Something went wrong/ },
  ];
  for (const c of cases) {
    const pOp = await openShell({ me: 'login', login: c.login });
    await settleAccount(pOp);
    await pOp.type('#login input[name="email"]', 'owner@cafeatlas.ma');
    await pOp.type('#login input[name="password"]', 'password12345');
    await pOp.click('#login-btn');
    await pOp.waitForFunction(() => !document.querySelector('#login-err').hidden, { timeout: 8000 });
    const opState = await pOp.evaluate(() => {
      const email = document.querySelector('#login-email');
      const pass = document.querySelector('#login-password');
      const err = document.querySelector('#login-err');
      const btn = document.querySelector('#login-btn');
      return {
        emailInvalid: email.hasAttribute('aria-invalid'),
        passInvalid: pass.hasAttribute('aria-invalid'),
        errText: err ? err.textContent : '',
        btnDisabled: btn.disabled,
        btnFocused: document.activeElement === btn,
      };
    });
    !opState.emailInvalid && !opState.passInvalid && c.match.test(opState.errText) && !opState.btnDisabled && opState.btnFocused
      ? ok(`operational failure (${c.label}) announces alert, avoids marking credentials invalid, and focuses enabled submit button`)
      : bad(`operational failure (${c.label}) state wrong: ${JSON.stringify(opState)}`);
    await pOp.closeCtx();
  }
}

{
  // offline / server unreachable: #account-next is hidden, #manual-mode is visible
  const p = await openShell({ me: 'abort' });
  await settleAccount(p);
  const offlineCta = await p.evaluate(() => {
    const next = document.querySelector('#account-next');
    const unknown = document.querySelector('#acct-unknown');
    const manual = document.querySelector('#manual-mode');
    return {
      unknownShown: unknown ? !unknown.hidden : false,
      nextHidden: next ? next.hidden : false,
      manualVisible: manual ? !manual.hidden : false,
    };
  });
  offlineCta.unknownShown && offlineCta.nextHidden && offlineCta.manualVisible
    ? ok('offline state displays server offline notice, hides Continuer, and keeps manual role route')
    : bad(`offline CTA state wrong: ${JSON.stringify(offlineCta)}`);
  await p.closeCtx();
}
/* ── 3 · full guided flow, fr/iPhone (connected account) ────────────────── */
{
  const p = await openShell({ me: 'multi' });
  await settleAccount(p);
  const linkH = async (sel) => p.evaluate((s) => document.querySelector(s).getBoundingClientRect().height, sel);
  const logoutH = await linkH('#logout'), manualH = await linkH('#manual-mode');
  logoutH >= 44 && manualH >= 44
    ? ok(`account links measure ${Math.round(logoutH)}/${Math.round(manualH)}px (logout/manual, fr)`)
    : bad(`account link under 44px: logout=${Math.round(logoutH)} manual=${Math.round(manualH)}`);

  // Authenticated state promotes Continuer to primary CTA and unhides it
  const authCta = await p.evaluate(() => {
    const next = document.querySelector('#account-next');
    return {
      hidden: next ? next.hidden : true,
      hasCta: next ? next.classList.contains('cta') : false,
      hasSecondary: next ? next.classList.contains('secondary') : true,
    };
  });
  !authCta.hidden && authCta.hasCta && !authCta.hasSecondary
    ? ok('authenticated state promotes Continuer to primary CTA and unhides it')
    : bad(`authenticated CTA state wrong: ${JSON.stringify(authCta)}`);
  await toRole(p);

  // Disabled CTA presentation: solid tokens, default cursor, no low opacity
  const disabledCta = await p.evaluate(() => {
    const btn = document.querySelector('#role-next');
    const cs = window.getComputedStyle(btn);
    return {
      disabled: btn.disabled,
      opacity: cs.opacity,
      cursor: cs.cursor,
      bg: cs.backgroundColor,
      color: cs.color,
    };
  });
  disabledCta.disabled && disabledCta.opacity === '1' && disabledCta.cursor === 'default' &&
  /rgb\(236,\s*232,\s*223\)/.test(disabledCta.bg) && /rgb\(93,\s*107,\s*99\)/.test(disabledCta.color)
    ? ok('disabled CTA styles cleanly without low opacity alone (solid neutral tokens --n-100/--n-500, default cursor, opacity:1)')
    : bad(`disabled CTA styling wrong: ${JSON.stringify(disabledCta)}`);

  const pressed0 = await p.evaluate(() => [...document.querySelectorAll('.tile[data-role]')].map((t) => t.getAttribute('aria-pressed')));
  pressed0.every((v) => v === 'false') ? ok('role tiles announce unpressed before any choice') : bad('role tiles lack initial aria-pressed');
  await shot(p, 'flow-03-role');
  await noOverflow(p, 'fr/iPhone role');
  await p.click('.tile[data-role="caisse"]');
  const pressed1 = await p.evaluate(() => [...document.querySelectorAll('.tile[data-role]')].map((t) => t.getAttribute('data-role') + ':' + t.getAttribute('aria-pressed')));
  pressed1.includes('caisse:true') && pressed1.filter((s) => s.endsWith(':true')).length === 1
    ? ok('selecting a role flips exactly one aria-pressed to true')
    : bad(`aria-pressed transition wrong: ${pressed1.join(',')}`);
  await p.click('#role-next');
  await p.waitForFunction(() => !document.querySelector('#step-connect').hidden, { timeout: 8000 });
  const n = await p.evaluate(() => document.querySelectorAll('.store-choice').length);
  n === 3 ? ok('three account stores render as choices') : bad(`expected 3 store choices, saw ${n}`);
  await shot(p, 'flow-04-connect');
  await noOverflow(p, 'fr/iPhone connect');
  await p.evaluate(() => document.querySelectorAll('.store-choice')[1].click());
  await p.click('#pair-btn');
  await p.waitForFunction(() => document.querySelector('#pair-status').classList.contains('ok'), { timeout: 8000 });
  const bound = await p.evaluate(() => ({
    hidden: document.querySelector('#pair-btn').hidden,
    check: !!document.querySelector('.store-choice.selected'),
    next: !document.querySelector('#connect-next').disabled,
    status: document.querySelector('#pair-status').textContent,
  }));
  bound.hidden && bound.check && bound.next && /Atlas Rooftop/.test(bound.status)
    ? ok('pairing binds the selected store, hides the pair button, unlocks Continuer')
    : bad(`pairing left an inconsistent state: ${JSON.stringify(bound)}`);
  await shot(p, 'flow-05-paired');
  // changing the selection re-arms pairing (binding stays mandatory)
  await p.evaluate(() => document.querySelectorAll('.store-choice')[0].click());
  const rearmed = await p.evaluate(() => ({ hidden: document.querySelector('#pair-btn').hidden, next: !document.querySelector('#connect-next').disabled }));
  !rearmed.hidden && !rearmed.next ? ok('changing store re-arms pairing and re-locks Continuer') : bad('changing store did not re-arm pairing');
  await p.evaluate(() => document.querySelectorAll('.store-choice')[1].click());
  const boundAgain = await p.evaluate(() => ({ hidden: document.querySelector('#pair-btn').hidden, next: !document.querySelector('#connect-next').disabled }));
  boundAgain.hidden && boundAgain.next
    ? ok('reselecting the bound store needs no second pairing (button stays hidden, Continuer open)')
    : bad(`reselecting bound store inconsistent: ${JSON.stringify(boundAgain)}`);
  await p.click('#connect-next');
  await p.waitForFunction(() => !document.querySelector('#step-printer').hidden, { timeout: 8000 });
  await noOverflow(p, 'fr/iPhone printer');
  await shot(p, 'flow-06-printer');
  await p.closeCtx();
}

{
  // logging out demotes and hides Continuer CTA
  const p = await openShell({ me: 'multi' });
  await settleAccount(p);
  await p.click('#logout');
  await p.waitForFunction(() => !document.querySelector('#login').hidden, { timeout: 8000 });
  const postLogout = await p.evaluate(() => {
    const next = document.querySelector('#account-next');
    return {
      nextHidden: next ? next.hidden : false,
      nextHasCta: next ? next.classList.contains('cta') : false,
    };
  });
  postLogout.nextHidden && !postLogout.nextHasCta
    ? ok('logging out demotes and hides Continuer CTA')
    : bad(`post-logout CTA state wrong: ${JSON.stringify(postLogout)}`);
  await p.closeCtx();
}

{
  // printer pipeline with stubbed native plugin: scan → fill → test → save
  const p = await openShell({ me: 'multi', plugin: 'empty' });
  await toRole(p);
  await fromRole(p, 'caisse');
  await p.evaluate(() => document.querySelectorAll('.store-choice')[0].click());
  await p.click('#pair-btn');
  await p.waitForFunction(() => document.querySelector('#connect-next').disabled === false, { timeout: 8000 });
  await p.click('#connect-next');
  await p.waitForFunction(() => !document.querySelector('#step-printer').hidden, { timeout: 8000 });

  // Printer labels and dir="ltr"
  const prLabels = await p.evaluate(() => {
    const ip = document.querySelector('#printer-ip');
    const port = document.querySelector('#printer-port');
    const paper = document.querySelector('#printer-paper');
    return {
      ipLabel: !!document.querySelector('label[for="printer-ip"]'),
      portLabel: !!document.querySelector('label[for="printer-port"]'),
      paperLabel: !!document.querySelector('label[for="printer-paper"]'),
      ipDir: ip ? ip.getAttribute('dir') : '',
      portDir: port ? port.getAttribute('dir') : '',
    };
  });
  prLabels.ipLabel && prLabels.portLabel && prLabels.paperLabel && prLabels.ipDir === 'ltr' && prLabels.portDir === 'ltr'
    ? ok('printer form has explicit for/id labels and dir="ltr" on IP/port inputs')
    : bad(`printer label or dir attributes wrong: ${JSON.stringify(prLabels)}`);

  // Invalid printer submission sets aria-invalid, status.bad, and focuses invalid field
  await p.evaluate(() => { document.querySelector('#printer-ip').value = ''; });
  await p.click('#printer-test');
  const prInvalid = await p.evaluate(() => {
    const ip = document.querySelector('#printer-ip');
    const status = document.querySelector('#printer-status');
    return {
      ipInvalid: ip.getAttribute('aria-invalid'),
      ipDescribedBy: ip.getAttribute('aria-describedby'),
      statusBad: status.classList.contains('bad'),
      ipFocused: document.activeElement === ip,
    };
  });
  prInvalid.ipInvalid === 'true' && prInvalid.ipDescribedBy === 'printer-status' && prInvalid.statusBad && prInvalid.ipFocused
    ? ok('empty printer IP triggers aria-invalid, non-destructive status bad class, and focuses IP input')
    : bad(`printer validation state wrong: ${JSON.stringify(prInvalid)}`);

  await p.click('#printer-scan');
  await p.waitForFunction(() => document.querySelectorAll('.printer-choice').length === 2, { timeout: 8000 });
  ok('network scan lists the two discovered printers');

  const scanChoices = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.printer-choice')];
    const scanBtn = document.querySelector('#printer-scan');
    const active = document.activeElement;
    return {
      count: btns.length,
      allLtr: btns.every((b) => b.getAttribute('dir') === 'ltr'),
      firstFocused: active === btns[0],
      scanEnabled: !scanBtn.disabled,
      scanIdleLabel: scanBtn.textContent,
    };
  });
  scanChoices.count === 2 && scanChoices.allLtr && scanChoices.firstFocused &&
  scanChoices.scanEnabled && /Rechercher|Search|البحث/.test(scanChoices.scanIdleLabel)
    ? ok('printer scan results carry dir="ltr", button re-enables to idle, and focus lands on first result')
    : bad(`scan results accessibility wrong: ${JSON.stringify(scanChoices)}`);

  await p.evaluate(() => document.querySelectorAll('.printer-choice')[0].click());
  const filled = await p.evaluate(() => document.querySelector('#printer-ip').value);
  filled === '192.168.1.50' ? ok('choosing a discovery result fills the IP field') : bad(`IP field holds «${filled}»`);
  const inCard = await p.evaluate(() => {
    const form = document.querySelector('#printer-form');
    return form.contains(document.querySelector('#scan-results')) && form.contains(document.querySelector('#printer-status'));
  });
  inCard ? ok('scan results and printer status live inside the printer card') : bad('printer messages escaped the card');
  await p.click('#printer-test');
  await p.waitForFunction(() => !document.querySelector('#printer-next').disabled, { timeout: 8000 });
  const st = await p.evaluate(() => document.querySelector('#printer-status').textContent);
  /enregistr|saved|حُفظ/.test(st) ? ok('test slip succeeds and the printer is saved') : bad(`unexpected printer status: «${st}»`);

  const prSuccess = await p.evaluate(() => {
    const next = document.querySelector('#printer-next');
    return document.activeElement === next;
  });
  prSuccess
    ? ok('printer test success advances keyboard focus to Continuer button')
    : bad('printer test success did not focus Continuer');

  await shot(p, 'flow-07-printer-ok');
  await p.click('#printer-next');
  await p.waitForFunction(() => !document.querySelector('#step-ready').hidden, { timeout: 8000 });
  const ready = await p.evaluate(() => document.querySelector('#ready-list').innerText.replace(/\n/g, ' | '));
  // sanitize ✓ out of the echoed values so the gate's ✓-counter stays 1:1 with controls
  const readyShown = ready.replace(/✓/g, '[ok]');
  /Caisse/.test(ready) && /Atlas/.test(ready) ? ok(`ready checklist reflects role, store, printer (${readyShown.slice(0, 90)}…)`) : bad(`ready checklist wrong: ${readyShown}`);
  await noOverflow(p, 'fr/iPhone ready');
  await shot(p, 'flow-08-ready');
  await p.click('#finish');
  await p.waitForFunction(() => location.href.includes('kiwi-caisse.html'), { timeout: 8000 })
    .then(() => ok('Ouvrir Kiwi opens the chosen role surface'))
    .catch(() => bad('finish did not navigate to the role surface'));
  await p.closeCtx();
}

{
  // Printer scan focus recovery: empty results, native rejection, and unavailable plugin
  // 1. Empty results: zero printers found
  {
    const p = await openShell({ me: 'multi', plugin: { scan: 'empty' } });
    await toRole(p);
    await fromRole(p, 'caisse');
    await p.evaluate(() => document.querySelectorAll('.store-choice')[0].click());
    await p.click('#pair-btn');
    await p.waitForFunction(() => document.querySelector('#connect-next').disabled === false, { timeout: 8000 });
    await p.click('#connect-next');
    await p.waitForFunction(() => !document.querySelector('#step-printer').hidden, { timeout: 8000 });

    await p.click('#printer-scan');
    await p.waitForFunction(() => /Aucune imprimante trouvée|No printer found|لم يتم العثور/.test(document.querySelector('#scan-results').textContent), { timeout: 8000 });
    const emptyRecovery = await p.evaluate(() => {
      const btn = document.querySelector('#printer-scan');
      return {
        disabled: btn.disabled,
        label: btn.textContent,
        focused: document.activeElement === btn,
      };
    });
    !emptyRecovery.disabled && /Rechercher|Search|البحث/.test(emptyRecovery.label) && emptyRecovery.focused
      ? ok('empty printer scan re-enables button, restores idle label, and returns focus to scan button')
      : bad(`empty scan recovery wrong: ${JSON.stringify(emptyRecovery)}`);
    await p.closeCtx();
  }

  // 2. Scan rejection: native scan rejection/error
  {
    const p = await openShell({ me: 'multi', plugin: { scan: 'reject' } });
    await toRole(p);
    await fromRole(p, 'caisse');
    await p.evaluate(() => document.querySelectorAll('.store-choice')[0].click());
    await p.click('#pair-btn');
    await p.waitForFunction(() => document.querySelector('#connect-next').disabled === false, { timeout: 8000 });
    await p.click('#connect-next');
    await p.waitForFunction(() => !document.querySelector('#step-printer').hidden, { timeout: 8000 });

    await p.click('#printer-scan');
    await p.waitForFunction(() => document.querySelector('#scan-results').textContent.length > 0, { timeout: 8000 });
    const rejectRecovery = await p.evaluate(() => {
      const btn = document.querySelector('#printer-scan');
      return {
        disabled: btn.disabled,
        label: btn.textContent,
        focused: document.activeElement === btn,
      };
    });
    !rejectRecovery.disabled && /Rechercher|Search|البحث/.test(rejectRecovery.label) && rejectRecovery.focused
      ? ok('rejected printer scan re-enables button, restores idle label, and returns focus to scan button')
      : bad(`rejected scan recovery wrong: ${JSON.stringify(rejectRecovery)}`);
    await p.closeCtx();
  }

  // 3. Unavailable plugin: scan plugin missing
  {
    const p = await openShell({ me: 'multi', plugin: { scan: 'unavailable' } });
    await toRole(p);
    await fromRole(p, 'caisse');
    await p.evaluate(() => document.querySelectorAll('.store-choice')[0].click());
    await p.click('#pair-btn');
    await p.waitForFunction(() => document.querySelector('#connect-next').disabled === false, { timeout: 8000 });
    await p.click('#connect-next');
    await p.waitForFunction(() => !document.querySelector('#step-printer').hidden, { timeout: 8000 });

    await p.click('#printer-scan');
    await p.waitForFunction(() => /disponible dans l’app|available in the Kiwi Pro app|متاح داخل تطبيق/.test(document.querySelector('#scan-results').textContent), { timeout: 8000 });
    const unavailRecovery = await p.evaluate(() => {
      const btn = document.querySelector('#printer-scan');
      return {
        disabled: btn.disabled,
        label: btn.textContent,
        focused: document.activeElement === btn,
      };
    });
    !unavailRecovery.disabled && /Rechercher|Search|البحث/.test(unavailRecovery.label) && unavailRecovery.focused
      ? ok('unavailable native scan plugin re-enables button, restores idle label, and returns focus to scan button')
      : bad(`unavailable scan recovery wrong: ${JSON.stringify(unavailRecovery)}`);
    await p.closeCtx();
  }
}

/* ── 4 · viewport sweeps (fr): overflow + layout invariants per step ───── */
for (const viewport of ['small320', 'ipadPortrait', 'ipadLandscape']) {
  const p = await openShell({ viewport, me: 'multi' });
  await toRole(p);
  await noOverflow(p, `fr/${viewport} role`);
  await fromRole(p, 'caisse');
  await noOverflow(p, `fr/${viewport} connect`);
  await p.evaluate(() => document.querySelectorAll('.store-choice')[0].click());
  await p.click('#pair-btn');
  await p.waitForFunction(() => document.querySelector('#connect-next').disabled === false, { timeout: 8000 });
  await p.click('#connect-next');
  await p.waitForFunction(() => !document.querySelector('#step-printer').hidden, { timeout: 8000 });
  await noOverflow(p, `fr/${viewport} printer`);
  if (viewport === 'ipadPortrait') {
    const top = await p.evaluate(() => document.querySelector('#step-printer').getBoundingClientRect().top);
    top < 400 ? ok(`iPad step top-anchored (top=${Math.round(top)}px, no mid-screen float)`) : bad(`iPad step floats mid-screen (top=${Math.round(top)}px)`);
    await shot(p, 'layout-ipad-portrait');
  }
  if (viewport === 'small320') await shot(p, 'layout-320-printer');
  await p.closeCtx();
}

/* ── 4b · tablet breakpoints & grid split (760 / 761 / 1040 / 1041px) ──── */
{
  const p = await openShell({ me: 'multi' });
  await settleAccount(p);

  // 760px: mobile stacked layout
  await p.setViewport({ width: 760, height: 900 });
  const bp760 = await p.evaluate(() => {
    const shell = document.querySelector('.shell');
    const cs = window.getComputedStyle(shell);
    const media = window.matchMedia('(max-width: 760px)').matches;
    return { display: cs.display, media };
  });
  bp760.media && bp760.display === 'block'
    ? ok('760px breakpoint applies mobile stacked layout (display: block)')
    : bad(`760px layout unexpected: ${JSON.stringify(bp760)}`);

  // 761px: tablet 32%/68% rule activates
  await p.setViewport({ width: 761, height: 900 });
  const bp761 = await p.evaluate(() => {
    const brand = document.querySelector('.brand-panel');
    const flow = document.querySelector('.flow-panel');
    const media = window.matchMedia('(min-width: 761px) and (max-width: 1040px)').matches;
    return { media, brandW: brand.offsetWidth, flowW: flow.offsetWidth };
  });
  bp761.media && bp761.brandW >= 260
    ? ok(`761px breakpoint activates tablet layout (brand clamped to min 260px, ${bp761.brandW}px / ${bp761.flowW}px)`)
    : bad(`761px layout unexpected: ${JSON.stringify(bp761)}`);

  // 900px: tablet 32%/68% split
  await p.setViewport({ width: 900, height: 900 });
  const bp900 = await p.evaluate(() => {
    const brand = document.querySelector('.brand-panel');
    const flow = document.querySelector('.flow-panel');
    const ratio = brand.offsetWidth / (brand.offsetWidth + flow.offsetWidth);
    return { ratio, brandW: brand.offsetWidth, flowW: flow.offsetWidth };
  });
  bp900.ratio >= 0.31 && bp900.ratio <= 0.33
    ? ok(`tablet viewport renders 32%/68% split (${Math.round(bp900.ratio * 100)}% / ${Math.round((1 - bp900.ratio) * 100)}%)`)
    : bad(`tablet split unexpected: ${JSON.stringify(bp900)}`);

  // 1040px: tablet upper boundary preserves 32%/68% split
  await p.setViewport({ width: 1040, height: 900 });
  const bp1040 = await p.evaluate(() => {
    const brand = document.querySelector('.brand-panel');
    const flow = document.querySelector('.flow-panel');
    const media = window.matchMedia('(min-width: 761px) and (max-width: 1040px)').matches;
    const ratio = brand.offsetWidth / (brand.offsetWidth + flow.offsetWidth);
    return { media, ratio, brandW: brand.offsetWidth, flowW: flow.offsetWidth };
  });
  bp1040.media && bp1040.ratio >= 0.31 && bp1040.ratio <= 0.33
    ? ok(`1040px upper boundary preserves 32%/68% split (${Math.round(bp1040.ratio * 100)}% / ${Math.round((1 - bp1040.ratio) * 100)}%)`)
    : bad(`1040px layout unexpected: ${JSON.stringify(bp1040)}`);

  // 1041px: wide desktop layout switches to 38%/62% split
  await p.setViewport({ width: 1041, height: 900 });
  const bp1041 = await p.evaluate(() => {
    const brand = document.querySelector('.brand-panel');
    const flow = document.querySelector('.flow-panel');
    const mediaTablet = window.matchMedia('(min-width: 761px) and (max-width: 1040px)').matches;
    const ratio = brand.offsetWidth / (brand.offsetWidth + flow.offsetWidth);
    return { mediaTablet, ratio, brandW: brand.offsetWidth, flowW: flow.offsetWidth };
  });
  !bp1041.mediaTablet && bp1041.ratio >= 0.37 && bp1041.ratio <= 0.39
    ? ok(`1041px desktop layout switches to 38%/62% split (${Math.round(bp1041.ratio * 100)}% / ${Math.round((1 - bp1041.ratio) * 100)}%)`)
    : bad(`1041px layout unexpected: ${JSON.stringify(bp1041)}`);

  await p.closeCtx();
}

/* ── 5 · locales & metadata ────────────────────────────────────────────── */
{
  const p = await openShell({ locale: 'en', me: 'login' });
  await settleAccount(p);
  const plat = await p.evaluate(() => document.querySelector('.shell-foot').textContent);
  const loginLabel = await p.evaluate(() => document.querySelector('#login-btn').textContent);
  const manualEn = await p.evaluate(() => document.querySelector('#manual-mode').getBoundingClientRect().height);
  /browser/.test(plat) && !/navigateur/.test(plat) && loginLabel === 'Sign in' && manualEn >= 44
    ? ok(`platform label and login read Browser / Sign in in English (manual link ${Math.round(manualEn)}px)`)
    : bad(`EN strings off: footer «${plat.trim()}», login «${loginLabel}», manual ${Math.round(manualEn)}px`);

  const footerA11y = await p.evaluate(() => {
    const bundle = document.querySelector('#bundle');
    const foot = document.querySelector('.shell-foot');
    const bdi = bundle ? bundle.querySelector('bdi') : null;
    const title = bundle ? bundle.getAttribute('title') : '';
    const aria = bundle ? bundle.getAttribute('aria-label') : '';
    const cs = foot ? window.getComputedStyle(foot) : null;
    return {
      text: bundle ? bundle.textContent : '',
      bdiDir: bdi ? bdi.getAttribute('dir') : '',
      hasTitle: !!(title && title.length > 0),
      hasAria: !!(aria && aria.length > 0),
      fontSize: cs ? cs.fontSize : '',
      opacity: cs ? cs.opacity : '',
    };
  });
  /^[a-f0-9]{7}$/.test(footerA11y.text) && footerA11y.bdiDir === 'ltr' && footerA11y.hasTitle && footerA11y.hasAria &&
  footerA11y.fontSize === '11px' && footerA11y.opacity === '1'
    ? ok(`browser footer build label derived from bundle metadata («${footerA11y.text}») with accessible title/aria-label and 11px opaque contrast`)
    : bad(`footer version formatting wrong: ${JSON.stringify(footerA11y)}`);

  await p.closeCtx();
}

{
  // Native metadata truthfulness across FR, EN, and AR
  const expectations = {
    fr: { text: 'v1.2.0 (89)', aria: 'Version 1.2.0, build 89', titlePrefix: 'Lot : ' },
    en: { text: 'v1.2.0 (89)', aria: 'Version 1.2.0, build 89', titlePrefix: 'Bundle: ' },
    ar: { text: 'v1.2.0 (89)', aria: 'الإصدار 1.2.0، البنية 89', titlePrefix: 'الحزمة: ' },
  };
  for (const [lang, exp] of Object.entries(expectations)) {
    const pNat = await openShell({
      locale: lang,
      plugin: { appInfo: { version: '1.2.0', build: '89' } },
    });
    await settleAccount(pNat);
    const meta = await pNat.evaluate(() => {
      const bundle = document.querySelector('#bundle');
      const bdi = bundle ? bundle.querySelector('bdi') : null;
      return {
        text: bundle ? bundle.textContent : '',
        bdiDir: bdi ? bdi.getAttribute('dir') : '',
        aria: bundle ? bundle.getAttribute('aria-label') : '',
        title: bundle ? bundle.getAttribute('title') : '',
      };
    });
    meta.text === exp.text && meta.bdiDir === 'ltr' && meta.aria === exp.aria && meta.title.startsWith(exp.titlePrefix)
      ? ok(`native version metadata localized in ${lang.toUpperCase()} («${meta.text}», aria: «${meta.aria}», dir="${meta.bdiDir}")`)
      : bad(`native version metadata wrong for ${lang}: ${JSON.stringify(meta)}`);
    if (lang === 'ar') await shot(pNat, 'locale-ar-bundle-ltr');
    await pNat.closeCtx();
  }
}
{
  // compact single-store Arabic flow: auto-select, pair, badge side, paper order
  const p = await openShell({ locale: 'ar', me: 'single' });
  await settleAccount(p);
  const doc = await p.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
  doc.lang === 'ar' && doc.dir === 'rtl' ? ok('Arabic renders lang=ar dir=rtl') : bad(`Arabic document is ${doc.lang}/${doc.dir}`);
  const arLinks = await p.evaluate(() => ({
    logout: document.querySelector('#logout').getBoundingClientRect().height,
    manual: document.querySelector('#manual-mode').getBoundingClientRect().height,
  }));
  arLinks.logout >= 44 && arLinks.manual >= 44
    ? ok(`Arabic account links measure ${Math.round(arLinks.logout)}/${Math.round(arLinks.manual)}px`)
    : bad(`Arabic link under 44px: ${JSON.stringify(arLinks)}`);
  await toRole(p);
  await fromRole(p, 'caisse');
  const auto = await p.evaluate(() => document.querySelector('.store-choice.selected .store-copy strong').textContent);
  auto === 'Solo Shop' ? ok('single store auto-selects before pairing') : bad(`single store not preselected («${auto}»)`);
  await p.click('#pair-btn');
  await p.waitForFunction(() => document.querySelector('#connect-next').disabled === false, { timeout: 8000 });
  const badgeSide = await p.evaluate(() => {
    // inset-inline-end resolves to physical left in RTL: the check disc must
    // sit at the inline end, mirroring LTR — same component, both directions
    const cs = window.getComputedStyle(document.querySelector('.store-choice.selected'), '::after');
    return { content: cs.content, left: cs.left, right: cs.right };
  });
  /✓/.test(badgeSide.content) && badgeSide.left === '8px'
    ? ok('selected store carries its check disc at the RTL inline end')
    : bad(`check disc misplaced in Arabic: ${JSON.stringify(badgeSide)}`);
  await p.click('#connect-next');
  await p.waitForFunction(() => !document.querySelector('#step-printer').hidden, { timeout: 8000 });
  const paperDir = await p.evaluate(() => getComputedStyle(document.querySelector('#printer-paper option')).direction);
  const paperText = await p.evaluate(() => document.querySelector('#printer-paper option').textContent);
  paperDir === 'ltr' && paperText === '80 mm' ? ok('paper widths keep logical order in Arabic (80 mm)') : bad(`paper option renders «${paperText}» (${paperDir})`);
  await noOverflow(p, 'ar/iPhone printer');
  await shot(p, 'locale-ar-printer');
  await p.closeCtx();
}

/* ── 6 · touch targets: every visible .link ≥ 44px ─────────────────────── */
{
  const p = await openShell({ me: 'multi' });
  await settleAccount(p);
  const manual = await p.evaluate(() => document.querySelector('#manual-mode').getBoundingClientRect().height);
  manual >= 44 ? ok(`manual-mode link measures ${Math.round(manual)}px`) : bad(`manual-mode link is ${Math.round(manual)}px (< 44)`);
  await toRole(p);
  await fromRole(p, 'caisse');
  await p.evaluate(() => document.querySelectorAll('.store-choice')[0].click());
  await p.click('#pair-btn');
  await p.waitForFunction(() => document.querySelector('#connect-next').disabled === false, { timeout: 8000 });
  await p.click('#connect-next');
  await p.waitForFunction(() => !document.querySelector('#step-printer').hidden, { timeout: 8000 });
  const skip = await p.evaluate(() => document.querySelector('#printer-skip').getBoundingClientRect().height);
  skip >= 44 ? ok(`printer-skip link measures ${Math.round(skip)}px`) : bad(`printer-skip link is ${Math.round(skip)}px (< 44)`);
  await p.closeCtx();
}

/* ── 7 · reduced motion freezes ────────────────────────────────────────── */
{
  const p = await openShell({ plugin: 'slow' });
  const sess = await p.createCDPSession();
  await sess.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await new Promise((r) => setTimeout(r, 300));
  const frozen = await p.evaluate(() => {
    const ring = document.querySelector('.boot-ring');
    if (!ring) return 'no-boot';
    const d = parseFloat(getComputedStyle(ring).animationDuration) || 0;
    return d < 0.01 ? 'frozen' : `animating:${d}s`;
  });
  frozen === 'frozen' ? ok('boot ring freezes under reduced motion') : bad(`boot ring state under reduced motion: ${frozen}`);
  await waitShell(p);
  const tileDur = await p.evaluate(() => {
    const t = document.querySelector('.tile');
    return t ? parseFloat(getComputedStyle(t).transitionDuration) || 0 : -1;
  });
  tileDur >= 0 && tileDur < 0.01 ? ok('interactive transitions collapse under reduced motion') : bad(`tile transition is ${tileDur}s under reduced motion`);
  await shot(p, 'motion-reduced');
  await p.closeCtx();
}

/* ── 8 · keyboard traversal, activation, and focus management ───────────── */
{
  const p = await openShell({ me: 'login' });
  await settleAccount(p);

  // 1. Initial focus initiation on login-email
  await p.keyboard.press('Tab');
  let activeId = await p.evaluate(() => document.activeElement ? document.activeElement.id : '');
  activeId === 'login-email' ? ok('keyboard focus initiates on login-email') : bad(`initial focus on ${activeId}`);

  // 2. Focus visibility on input (wait 200ms for 150ms CSS transition to settle)
  await new Promise((r) => setTimeout(r, 200));
  const emailFocusStyle = await p.evaluate(() => {
    const cs = window.getComputedStyle(document.querySelector('#login-email'));
    return { outline: cs.outlineStyle, shadow: cs.boxShadow, borderColor: cs.borderColor };
  });
  emailFocusStyle.shadow.includes('rgba(11, 110, 79') || emailFocusStyle.outline !== 'none' || emailFocusStyle.borderColor === 'rgb(11, 110, 79)'
    ? ok('email input displays visible focus indicator')
    : bad(`email input missing focus ring: ${JSON.stringify(emailFocusStyle)}`);

  // 3. Tab forward to password
  await p.keyboard.press('Tab');
  activeId = await p.evaluate(() => document.activeElement.id);
  activeId === 'login-password' ? ok('Tab moves focus to password input') : bad(`Tab landed on ${activeId} instead of login-password`);

  // 4. Tab forward to password toggle button
  await p.keyboard.press('Tab');
  activeId = await p.evaluate(() => document.activeElement.id);
  activeId === 'password-toggle' ? ok('Tab moves focus to password toggle button') : bad(`Tab landed on ${activeId} instead of password-toggle`);

  // 5. Focus visibility on toggle button
  const toggleFocus = await p.evaluate(() => {
    const cs = window.getComputedStyle(document.querySelector('#password-toggle'));
    return { outline: cs.outlineStyle, outlineColor: cs.outlineColor };
  });
  toggleFocus.outline !== 'none'
    ? ok('password toggle button displays visible focus indicator')
    : bad(`password toggle missing focus ring: ${JSON.stringify(toggleFocus)}`);

  // 6. Space activation on password toggle
  await p.keyboard.press('Space');
  let pwdState = await p.evaluate(() => ({
    type: document.querySelector('#login-password').type,
    pressed: document.querySelector('#password-toggle').getAttribute('aria-pressed'),
  }));
  pwdState.type === 'text' && pwdState.pressed === 'true'
    ? ok('Space key activates password toggle (reveals password)')
    : bad(`Space activation failed on password toggle: ${JSON.stringify(pwdState)}`);

  // 7. Enter activation on password toggle
  await p.keyboard.press('Enter');
  pwdState = await p.evaluate(() => ({
    type: document.querySelector('#login-password').type,
    pressed: document.querySelector('#password-toggle').getAttribute('aria-pressed'),
  }));
  pwdState.type === 'password' && pwdState.pressed === 'false'
    ? ok('Enter key toggles password back to concealed state')
    : bad(`Enter activation failed on password toggle: ${JSON.stringify(pwdState)}`);

  // 8. Tab forward to login submit button
  await p.keyboard.press('Tab');
  activeId = await p.evaluate(() => document.activeElement.id);
  activeId === 'login-btn' ? ok('Tab moves focus to login submit button') : bad(`Tab landed on ${activeId} instead of login-btn`);

  // 9. Tab forward to manual-mode link
  await p.keyboard.press('Tab');
  activeId = await p.evaluate(() => document.activeElement.id);
  activeId === 'manual-mode' ? ok('Tab moves focus to manual-mode button') : bad(`Tab landed on ${activeId} instead of manual-mode`);

  // 10. Shift+Tab backward sequence verification
  const backwardSequence = ['login-btn', 'password-toggle', 'login-password', 'login-email'];
  let backwardOk = true;
  for (const expectedId of backwardSequence) {
    await p.keyboard.down('Shift');
    await p.keyboard.press('Tab');
    await p.keyboard.up('Shift');
    const current = await p.evaluate(() => document.activeElement.id);
    if (current !== expectedId) {
      backwardOk = false;
      bad(`Shift+Tab backward expected ${expectedId}, landed on ${current}`);
      break;
    }
  }
  if (backwardOk) {
    ok('Shift+Tab moves backward logically: manual-mode → login-btn → password-toggle → login-password → login-email');
  }

  // 11. Enter activation on manual-mode button: triggers step transition
  await p.focus('#manual-mode');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => !document.querySelector('#step-role').hidden, { timeout: 8000 });

  // 12. Modal/step transition focus transfer: heading h1 receives programmatic focus
  const headingFocus = await p.evaluate(() => {
    const h1 = document.querySelector('#step-role h1');
    return {
      isH1: document.activeElement === h1,
      tag: document.activeElement ? document.activeElement.tagName : '',
      tabIndex: h1 ? h1.getAttribute('tabindex') : null,
      text: h1 ? h1.textContent : '',
    };
  });
  headingFocus.isH1 && headingFocus.tabIndex === '-1'
    ? ok(`step transition moves focus to h1 heading («${headingFocus.text}», tabindex="-1")`)
    : bad(`step transition heading focus failed: ${JSON.stringify(headingFocus)}`);

  // 13. Absence of keyboard trap: Tab advances from heading to first role tile
  await p.keyboard.press('Tab');
  const roleFocused = await p.evaluate(() => document.activeElement ? document.activeElement.getAttribute('data-role') : null);
  roleFocused === 'caisse'
    ? ok('Tab from heading advances to first role tile without keyboard trap')
    : bad(`Tab from heading landed on ${roleFocused}`);

  await p.closeCtx();
}

/* ── 9 · browser zoom reflow (WCAG 1.4.10: 200% & 400% zoom) ───────────── */
for (const locale of ['fr', 'en', 'ar']) {
  const p = await openShell({ locale, viewport: 'ipadLandscape', me: 'single' });
  await settleAccount(p);
  await toRole(p);
  await fromRole(p, 'caisse');

  // Test at 200% zoom
  await p.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await new Promise((r) => setTimeout(r, 150));
  let reflow200 = await p.evaluate(() => {
    return {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      noHOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    };
  });
  reflow200.noHOverflow
    ? ok(`no horizontal overflow under literal 200% browser zoom (${locale.toUpperCase()})`)
    : bad(`200% zoom overflow in ${locale}: ${JSON.stringify(reflow200)}`);

  // Test at 400% zoom (WCAG 1.4.10 AA requirement: equivalent to 320 CSS px width)
  await p.evaluate(() => { document.documentElement.style.zoom = '4'; });
  await new Promise((r) => setTimeout(r, 150));
  let reflow400 = await p.evaluate(() => {
    const pairBtn = document.querySelector('#pair-btn');
    const b = pairBtn ? pairBtn.getBoundingClientRect() : null;
    return {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      noHOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      btnRendered: Boolean(b && b.width > 0 && b.height > 0),
    };
  });
  reflow400.noHOverflow && reflow400.btnRendered
    ? ok(`no horizontal overflow under literal 400% browser zoom (${locale.toUpperCase()}) with visible CTA`)
    : bad(`400% zoom reflow failed in ${locale}: ${JSON.stringify(reflow400)}`);

  if (locale === 'ar') await shot(p, 'reflow-400-ar-connect');
  await p.closeCtx();
}

/* ── 10 · text scaling 200% without clipping or overlap (WCAG 1.4.4) ────── */
for (const locale of ['fr', 'en', 'ar']) {
  const p = await openShell({ locale, viewport: 'iphone', me: 'multi' });
  await settleAccount(p);
  await toRole(p);

  // Enlarge font-size by 200%
  await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await new Promise((r) => setTimeout(r, 150));

  const roleInspection = await p.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.tile')).map((t) => {
      const name = t.querySelector('.tile-name');
      const sub = t.querySelector('.tile-sub');
      return {
        role: t.getAttribute('data-role'),
        nameText: name ? name.textContent : '',
        nameScrollH: name ? name.scrollHeight : 0,
        nameClientH: name ? name.clientHeight : 0,
        nameScrollW: name ? name.scrollWidth : 0,
        nameClientW: name ? name.clientWidth : 0,
        nameClippedV: name ? name.scrollHeight > name.clientHeight + 1 : false,
        nameClippedH: name ? name.scrollWidth > name.clientWidth + 1 : false,
        subVisible: sub ? sub.offsetHeight > 0 : false,
      };
    });
    const anyClipped = tiles.some((t) => t.nameClippedV || t.nameClippedH);
    const noHScroll = document.documentElement.scrollWidth <= window.innerWidth + 1;
    return { tiles, anyClipped, noHScroll };
  });

  !roleInspection.anyClipped && roleInspection.noHScroll
    ? ok(`200% text size: role tile typography unclipped across all 4 cards (${locale.toUpperCase()})`)
    : bad(`200% text size clipped in ${locale}: ${JSON.stringify(roleInspection)}`);

  // Advance to connect step under 200% font size
  await fromRole(p, 'caisse');
  const storeInspection = await p.evaluate(() => {
    const choices = Array.from(document.querySelectorAll('.store-choice'));
    let overlapping = false;
    for (let i = 0; i < choices.length; i++) {
      const r1 = choices[i].getBoundingClientRect();
      for (let j = i + 1; j < choices.length; j++) {
        const r2 = choices[j].getBoundingClientRect();
        const overlap = !(r1.right <= r2.left || r1.left >= r2.right || r1.bottom <= r2.top || r1.top >= r2.bottom);
        if (overlap) overlapping = true;
      }
    }
    const noHScroll = document.documentElement.scrollWidth <= window.innerWidth + 1;
    return { storeCount: choices.length, overlapping, noHScroll };
  });

  storeInspection.storeCount >= 3 && !storeInspection.overlapping && storeInspection.noHScroll
    ? ok(`200% text size: store cards expand vertically without overlap (${locale.toUpperCase()})`)
    : bad(`200% text size store cards failed in ${locale}: ${JSON.stringify(storeInspection)}`);

  if (locale === 'ar') await shot(p, 'text-scale-200-ar-role');
  await p.closeCtx();
}

/* ── 11 · regression test: Arabic typography line-height defect ────────── */
{
  const p = await openShell({ locale: 'ar', viewport: 'iphone', me: 'single' });
  await settleAccount(p);
  await toRole(p);
  await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const check = await p.evaluate(() => {
    const tile = document.querySelector('.tile[data-role="caisse"] .tile-name');
    const withFix = { scrollH: tile.scrollHeight, clientH: tile.clientHeight, clipped: tile.scrollHeight > tile.clientHeight };
    tile.style.lineHeight = '1.08';
    const broken = { scrollH: tile.scrollHeight, clientH: tile.clientHeight, clipped: tile.scrollHeight > tile.clientHeight };
    tile.style.lineHeight = '';
    return { withFix, broken };
  });
  check.broken.clipped && !check.withFix.clipped
    ? ok(`regression test: Arabic tile-name clips under unpatched line-height 1.08 (${check.broken.scrollH}px > ${check.broken.clientH}px) and passes with 1.35 fix (${check.withFix.scrollH}px ≤ ${check.withFix.clientH}px)`)
    : bad(`Arabic line-height regression check unexpected: ${JSON.stringify(check)}`);
  await p.closeCtx();
}

await browser.close();
server.close();
fs.rmSync(work, { recursive: true, force: true });
console.log(`shots → ${shotsDir}`);
console.log(failures ? `\napp-interaction-test : ${failures} échec(s), ${controls} contrôles` : `\napp-interaction-test : ${controls} contrôles, tout passe`);
process.exit(failures ? 1 : 0);
