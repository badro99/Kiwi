#!/usr/bin/env node
/* attendance-browser-test · the till's attendance code on the kit (stage 4,
 * §10.34), behind kiwiSkin2027:till, on the demo till in a real Chromium;
 * /api/team/live answered by the test.
 *
 *   node tools/attendance-browser-test.mjs
 *
 * What it holds:
 *   · opening the code asks current-attendance-code, never
 *     generate-attendance-code, and the shipped modal stays shut;
 *   · the code shows grouped "123 456" with its change time;
 *   · at the SERVER's expiresTs − 60 s the till asks again, and the new code
 *     replaces the old in place;
 *   · while open it asks every 10 s;
 *   · Replace asks first (the confirm sheet), then calls
 *     generate-attendance-code, and shows the replacement;
 *   · closed, it stops asking; no page error. */
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
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* The server's answers, in order: a code that expires in 61.5 s (so the
   renewal is due 1.5 s later), then a fresh one, then the replacement. */
const asked = [];
let serial = 0;
function answer(action) {
  const now = Date.now();
  if (action === 'generate-attendance-code') return { ok: true, code: '777888', createdTs: now, expiresTs: now + 300000 };
  serial += 1;
  if (serial === 1) return { ok: true, code: '123456', createdTs: now - 238500, expiresTs: now + 61500, now, reused: true };
  return { ok: true, code: '654321', createdTs: now, expiresTs: now + 300000, now, reused: false };
}

console.log('attendance-browser-test');
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1024 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/team/live') && r.method() === 'POST') {
      let body = {}; try { body = JSON.parse(r.postData() || '{}'); } catch (_) {}
      asked.push(body.action);
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(answer(body.action)) });
    }
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('kiwiSkin2027:till', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  });
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof doOpenService === 'function' && !!window.KiwiTillAttendance && document.documentElement.hasAttribute('data-k-till'), { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await sleep(300);
  const view = () => page.evaluate(() => {
    const d = document.querySelector('k-code-display');
    return d && { state: d.getAttribute('state'), code: d.getAttribute('code'), time: d.getAttribute('time'),
      shown: (d.shadowRoot.querySelector('.code') || {}).textContent || '' };
  });

  await page.evaluate(() => openAttendanceCode());
  await sleep(500);
  let v = await view();
  check(asked[0] === 'current-attendance-code' && !asked.includes('generate-attendance-code'), 'opening asks current-attendance-code, never generate');
  check(await page.evaluate(() => !document.querySelector('#attendance-code-modal').classList.contains('is-open')), 'the shipped attendance modal stays shut');
  check(v && v.state === 'shown' && v.code === '123456' && v.shown.replace(/\s/g, ' ').trim() === '123 456' && /^\d{2}:\d{2}$/.test(v.time),
    `the code shows grouped with its change time (${v && v.shown.trim()}, ${v && v.time})`);

  await sleep(2000);
  v = await view();
  check(asked.length >= 2 && asked[1] === 'current-attendance-code' && v.code === '654321', `at the server's expiresTs − 60 s the till asks again and the new code replaces it (${v.code})`);

  const before = asked.length;
  await sleep(10500);
  check(asked.length > before && asked.slice(before).every((a) => a === 'current-attendance-code'), `while open it asks every 10 s (${asked.length - before} more)`);

  await page.evaluate(() => { const b = document.querySelector('k-code-display').shadowRoot.querySelector('[data-w="replace"]'); b.click(); });
  await sleep(400);
  check(await page.evaluate(() => [...document.querySelectorAll('k-sheet[confirm]')].some((s) => s.hasAttribute('open'))) && !asked.includes('generate-attendance-code'),
    'Replace asks first: the confirm sheet, nothing replaced yet');
  await page.evaluate(() => {
    const yes = [...document.querySelectorAll('k-sheet[confirm] k-button[data-yes]')].pop();
    yes.shadowRoot.querySelector('button').click();
  });
  await sleep(500);
  v = await view();
  check(asked.includes('generate-attendance-code') && v.code === '777888', `confirmed, it calls generate-attendance-code and shows the replacement (${v.code})`);

  await page.evaluate(() => window.KiwiTillAttendance.close());
  const closedAt = asked.length;
  await sleep(10500);
  check(asked.length === closedAt, 'closed, it stops asking');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ attendance-browser-test · ${checks} checks`);
