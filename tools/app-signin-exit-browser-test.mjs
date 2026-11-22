#!/usr/bin/env node
/* app-signin-exit-browser-test · in Kiwi Pro, « J'ai déjà un compte » reaches the sign-in.
 *
 *   node tools/app-signin-exit-browser-test.mjs
 *
 * 22 Nov 2026, a new tester on the iPhone app: the device remembered the
 * « tableau de bord » role but had no session, so the dashboard opened the
 * setup questions. He tapped « I already have an account »: the link logs out
 * and goes to « /dashboard ». In the app there is no server behind that path:
 * Capacitor serves any path without an extension as index.html, the launcher
 * read the remembered role and sent him straight back to dashboard.html,
 * signed out. White screen, then the same questions again. He could never
 * reach the sign-in.
 *
 * On the real app bundle (tools/build-app-www.mjs), served with Capacitor's
 * routing rule, the Capacitor bridge stubbed as in native-owner-home, every
 * call to kiwi-os.com answered 401 here (nothing leaves the machine): the
 * link must land on the launcher's sign-in step (index.html?setup=1) with the
 * remembered role forgotten, and the website keeps its own path. No code is
 * typed. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { build } from './build-app-www.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-signin-exit-'));
const out = build({ out: path.join(work, 'www'), quiet: true }).out;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const hits = [];
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (p.startsWith('/api/') || p.startsWith('/auth/')) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"error":"unauthenticated"}'); return; }
  /* CapacitorRouter: a path without an extension is a SPA route → index.html. */
  if (!path.extname(p)) { hits.push(p); p = '/index.html'; }
  const file = path.resolve(out, '.' + p);
  if (!file.startsWith(out + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const S = suite('app-signin-exit', { browser });

function nativeStub() {
  if (!sessionStorage.getItem('stubbed')) { localStorage.setItem('kiwiAppRole', 'dashboard'); sessionStorage.setItem('stubbed', '1'); }
  localStorage.setItem('kiwiNativeLocale', 'en');
  const noop = () => Promise.resolve({});
  const plug = new Proxy({}, { get: (t, k) => (k === 'addListener' ? () => ({ remove() {} }) : noop) });
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: new Proxy({}, { get: () => plug }) };
  window.webkit = { messageHandlers: { kiwiShell: { postMessage(v) { window.__host = v; } } } };
}

async function phone(t, native) {
  const ctx = await browser.createBrowserContext(); t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width: 402, height: 874, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base) || u.startsWith('data:')) return r.continue();
    /* api-base.js sends /api/ and /auth/ to kiwi-os.com in the app: answer here. */
    if (/^https:\/\/kiwi-os\.com\/(api|auth)\//.test(u)) {
      return r.respond({ status: 401, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true' }, body: '{"error":"unauthenticated"}' });
    }
    return r.abort();
  });
  if (native) await page.evaluateOnNewDocument(nativeStub);
  return page;
}

async function toSignin(page) {
  await page.waitForSelector('.kob-root [data-signin]', { visible: true, timeout: 30000 });
  await sleep(600);
  await page.click('.kob-root [data-signin]');
  await sleep(5000);
}

try {
  await S.run('app: « I already have an account » opens the sign-in, not the dashboard again', async (t) => {
    const page = await phone(t, true);
    t.step('a device that remembers the dashboard role, signed out');
    await page.goto(base + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => /dashboard\.html$/.test(location.pathname), { timeout: 15000 });
    t.step('the setup questions open; tap « I already have an account »');
    await toSignin(page);
    const at = await page.evaluate(() => ({ path: location.pathname, search: location.search, role: localStorage.getItem('kiwiAppRole'), wizard: !!document.querySelector('.kob-root:not(.kob-out)') }));
    check(/index\.html$/.test(at.path) && /setup=1/.test(at.search), `the launcher's sign-in step opens (${at.path}${at.search})`);
    check(!at.wizard, 'the setup questions do not come back');
    check(!at.role, 'the remembered dashboard role is forgotten, so a relaunch asks to sign in too');
    check(!hits.includes('/dashboard'), 'no jump through « /dashboard », a path the app cannot serve');
  });

  await S.run('website: the link still goes to the account gate', async (t) => {
    const page = await phone(t, false);
    await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
    hits.length = 0;
    await toSignin(page);
    check(hits.includes('/dashboard'), 'the browser goes to « /dashboard », where the server shows the sign-in');
  });
} finally { await S.finish(); await browser.close(); server.close(); fs.rmSync(work, { recursive: true, force: true }); }
console.log(`app-signin-exit: ${checks} checks`);
