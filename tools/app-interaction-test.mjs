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
function applyPluginStub(secure) {
  function later(value, ms) {
    return new Promise(function (res) { setTimeout(function () { res(value); }, ms); });
  }
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    getPlatform: function () { return 'ios'; },
    Plugins: {
      KiwiPrinterSocket: {
        probe: function () { return Promise.resolve({ ok: true }); },
        send: function () { return Promise.resolve({ ok: true }); },
        scan: function () {
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
    },
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
      if (login && login.delayMs) {
        return new Promise((res) => setTimeout(() => res(req.respond({ status: login.status || 401, headers: cors, contentType: 'application/json', body: JSON.stringify(login.body || { error: 'bad-creds' }) })), login.delayMs));
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
  await shot(p, 'flow-02-login-error');
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
  await toRole(p);
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
  // printer pipeline with stubbed native plugin: scan → fill → test → save
  const p = await openShell({ me: 'multi', plugin: 'empty' });
  await toRole(p);
  await fromRole(p, 'caisse');
  await p.evaluate(() => document.querySelectorAll('.store-choice')[0].click());
  await p.click('#pair-btn');
  await p.waitForFunction(() => document.querySelector('#connect-next').disabled === false, { timeout: 8000 });
  await p.click('#connect-next');
  await p.waitForFunction(() => !document.querySelector('#step-printer').hidden, { timeout: 8000 });
  await p.click('#printer-scan');
  await p.waitForFunction(() => document.querySelectorAll('.printer-choice').length === 2, { timeout: 8000 });
  ok('network scan lists the two discovered printers');
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

/* ── 5 · locales ───────────────────────────────────────────────────────── */
{
  const p = await openShell({ locale: 'en', me: 'login' });
  await settleAccount(p);
  const plat = await p.evaluate(() => document.querySelector('.shell-foot').textContent);
  const loginLabel = await p.evaluate(() => document.querySelector('#login-btn').textContent);
  const manualEn = await p.evaluate(() => document.querySelector('#manual-mode').getBoundingClientRect().height);
  /browser/.test(plat) && !/navigateur/.test(plat) && loginLabel === 'Sign in' && manualEn >= 44
    ? ok(`platform label and login read Browser / Sign in in English (manual link ${Math.round(manualEn)}px)`)
    : bad(`EN strings off: footer «${plat.trim()}», login «${loginLabel}», manual ${Math.round(manualEn)}px`);
  await p.closeCtx();
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

await browser.close();
server.close();
fs.rmSync(work, { recursive: true, force: true });
console.log(`shots → ${shotsDir}`);
console.log(failures ? `\napp-interaction-test : ${failures} échec(s), ${controls} contrôles` : `\napp-interaction-test : ${controls} contrôles, tout passe`);
process.exit(failures ? 1 : 0);
