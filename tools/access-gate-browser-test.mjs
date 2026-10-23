#!/usr/bin/env node
/* access-gate-browser-test · the sign-in pages on the 2027 tokens, light and
 * dark (design 2027 §21.1 stage 6), behind kiwiSkin2027:access, in Chromium.
 *
 *   node tools/access-gate-browser-test.mjs
 *
 * The gate is the real one: functions/_middleware.js answers a signed-out
 * request for /dashboard.html with it. The reset page is reset.html.
 * What it holds:
 *   · flag off: the gate loads no kit file and keeps its shipped card;
 *   · flag on: the card on surface-1 over the kit ground, the welcome in
 *     Title, fields 48 on surface-2, the primary a 56 capsule in the accent;
 *   · dark is the merchant's choice (kiwiDashTheme), as shipped: a dark system
 *     with the choice light keeps the gate light, the choice dark makes it
 *     dark;
 *   · the dark luminance check, on every capture (the gate light and dark,
 *     the reset page light and dark): a dark capture's ground is dark
 *     (relative luminance under 0.05) and a light one's is light (over 0.8),
 *     and every text the capture draws, and the primary's label on its fill,
 *     holds 4.5:1;
 *   · no page error. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { onRequest as middleware } from '../functions/_middleware.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* The gate, as the middleware answers a signed-out visit. */
const gate = await (await middleware({
  request: new Request('https://kiwi.test/dashboard.html?lang=en', { headers: { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' } }),
  env: { AUTH_SECRET: 'access-gate-test-secret-32-chars!!' },
  next: async () => new Response('open'),
})).text();
console.log('access-gate-browser-test');
check(/id="form-login"/.test(gate) && /kiwiSkin2027:access/.test(gate), 'the middleware answers a signed-out visit with the gate, which carries the access flag');

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname === '/gate') { rs.writeHead(200, { 'Content-Type': 'text/html' }); rs.end(gate); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });

async function open(url, { flag = true, theme = null, system = 'light' } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [], fetched = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.url().startsWith(base)) fetched.push(new URL(r.url()).pathname); });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: system }]);
  await page.evaluateOnNewDocument((on, th) => {
    if (on) localStorage.setItem('kiwiSkin2027:access', '1');
    if (th) localStorage.setItem('kiwiDashTheme', th);
  }, flag, theme);
  await page.setViewport({ width: 1024, height: 900 });
  await page.goto(base + url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 300));
  return { ctx, page, errors, fetched };
}

/* Colours as the browser computes them, then WCAG luminance and contrast. */
const capture = (page, sel) => page.evaluate((s) => {
  const parse = (c) => { const m = String(c).match(/[\d.]+/g) || []; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] == null ? 1 : +m[3] }; };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const texts = [...document.querySelectorAll(s.texts)].filter((el) => el.offsetParent && el.textContent.trim()).map((el) => ({ what: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''), fg: parse(getComputedStyle(el).color), bg: bgOf(el) }));
  const btn = document.querySelector(s.primary);
  return {
    ground: parse(getComputedStyle(document.body).backgroundColor),
    texts, primary: btn ? { fg: parse(getComputedStyle(btn).color), bg: bgOf(btn), h: btn.getBoundingClientRect().height, radius: getComputedStyle(btn).borderRadius } : null,
    card: s.card ? (() => { const c = document.querySelector(s.card); return c ? parse(getComputedStyle(c).backgroundColor) : null; })() : null,
    h1: (() => { const h = document.querySelector(s.h1); return h ? getComputedStyle(h).fontSize : null; })(),
    kbg: (() => { const p = document.createElement('i'); p.style.cssText = 'position:absolute;background-color:var(--k-bg)'; document.body.appendChild(p); const c = parse(getComputedStyle(p).backgroundColor); p.remove(); return c.a > 0 ? c : null; })(),
    input: (() => { const i = document.querySelector(s.input); return i && i.offsetParent ? { h: i.getBoundingClientRect().height, radius: getComputedStyle(i).borderRadius, bg: parse(getComputedStyle(i).backgroundColor) } : null; })(),
    k: (() => { const st = getComputedStyle(document.body); return { title: (() => { const p = document.createElement('i'); p.style.cssText = 'position:absolute;font-size:var(--k-fs-title)'; document.body.appendChild(p); const v = getComputedStyle(p).fontSize; p.remove(); return v; })(), theme: document.documentElement.getAttribute('data-theme') }; })(),
  };
}, sel);
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const GATE = { texts: '.vx-auth-card h1, .vx-auth-card .sub, .vx-auth-card label, .vx-auth-card .tab, .vx-auth-card .forgot', primary: '#form-login .go', card: '.vx-auth-card', h1: '.vx-auth-card h1', input: '#li-email' };
const RESET = { texts: '#view h1, #view p, #view a', primary: '#view k-button', card: 'main.card', h1: '#view h1', input: null };
const PRINTER = { texts: 'h1, .lede, .step, h2, .card p, .card li, .others, .foot, .os-tab, code', primary: '#dl-primary', card: '.card', h1: 'h1', input: null };
/* The luminance check, named for each capture. */
function luminanceCheck(name, v, dark) {
  const g = lum(v.ground);
  check(dark ? g < 0.05 : g > 0.8, `${name}: the ground is ${dark ? 'dark' : 'light'} (luminance ${g.toFixed(3)})`);
  if (v.kbg) check(Math.abs(lum(v.ground) - lum(v.kbg)) < 0.002, `${name}: the ground is the kit's (--k-bg)`);
  const worst = v.texts.map((x) => ({ what: x.what, r: ratio(x.fg, x.bg) })).sort((a, b) => a.r - b.r)[0];
  check(v.texts.length > 0 && worst.r >= 4.5, `${name}: every text holds 4.5:1 (lowest ${worst.r.toFixed(2)}, ${worst.what})`);
}

try {
  {
    const { ctx, page, fetched, errors } = await open('/gate', { flag: false });
    const v = await capture(page, GATE);
    check(!fetched.some((p) => p.startsWith('/assets/kit/')) && v.primary.radius !== '999px', 'flag off: the gate loads no kit file and keeps its shipped card');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  for (const [name, opts, dark] of [
    ['gate, light', {}, false],
    ['gate, dark system and a light choice', { system: 'dark' }, false],
    ['gate, dark choice', { theme: 'dark' }, true],
  ]) {
    const { ctx, page, errors } = await open('/gate', opts);
    const v = await capture(page, GATE);
    if (!opts.system && !opts.theme) {
      check(v.h1 === v.k.title && v.input.h >= 48 && v.input.radius === '12px' && v.primary.h >= 56 && v.primary.radius === '999px',
        `flag on: the welcome in Title (${v.h1}), fields 48 on surface-2, the primary a 56 capsule`);
    }
    if (opts.system) check(v.k.theme === 'light', 'a dark system does not turn the gate dark: dark is the merchant\'s choice');
    luminanceCheck(name, v, dark);
    check(ratio(v.primary.fg, v.primary.bg) >= 4.5, `${name}: the primary's label holds 4.5:1 on its fill (${ratio(v.primary.fg, v.primary.bg).toFixed(2)})`);
    check(errors.length === 0, `${name}: no page error` + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  for (const [name, system, dark] of [['reset page, light', 'light', false], ['reset page, dark', 'dark', true]]) {
    // coverage: surface=shell-reset locale=en viewport=tablet
    const { ctx, page, errors } = await open('/reset.html?lang=en', { system });
    await page.waitForFunction(() => !!document.querySelector('#view k-button'), { timeout: 10000 });
    const v = await capture(page, RESET);
    luminanceCheck(name, v, dark);
    const inner = await page.evaluate(() => { const b = document.querySelector('#view k-button').shadowRoot.querySelector('button'); const cs = getComputedStyle(b); return { fg: cs.color, bg: cs.backgroundColor }; });
    const p = (c) => { const m = String(c).match(/[\d.]+/g); return { r: +m[0], g: +m[1], b: +m[2] }; };
    check(ratio(p(inner.fg), p(inner.bg)) >= 4.5, `${name}: the primary's label holds 4.5:1 on its fill (${ratio(p(inner.fg), p(inner.bg)).toFixed(2)})`);
    check(errors.length === 0, `${name}: no page error` + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  {
    // coverage: surface=printer locale=fr viewport=tablet
    const { ctx, page, fetched } = await open('/printer.html', { flag: false });
    check(!fetched.some((p) => p.startsWith('/assets/kit/')), 'printer page, flag off: no kit file');
    await ctx.close();
  }
  for (const [name, system, dark] of [['printer page, light', 'light', false], ['printer page, dark', 'dark', true]]) {
    // coverage: surface=printer locale=fr viewport=tablet
    const { ctx, page, errors } = await open('/printer.html', { system });
    const v = await capture(page, PRINTER);
    luminanceCheck(name, v, dark);
    check(ratio(v.primary.fg, v.primary.bg) >= 4.5 && v.primary.h >= 56 && v.primary.radius === '999px', `${name}: the download is a 56 capsule whose label holds 4.5:1 (${ratio(v.primary.fg, v.primary.bg).toFixed(2)})`);
    const logo = await page.evaluate(() => getComputedStyle(document.querySelector('.brand img')).content);
    check(dark ? /kiwi-newlogo-inverse\.svg/.test(logo) : !/inverse/.test(logo), `${name}: the ${dark ? 'inverse' : 'usual'} wordmark`);
    check(errors.length === 0, `${name}: no page error` + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ access-gate-browser-test · ${checks} checks`);
