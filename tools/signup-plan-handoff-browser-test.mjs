#!/usr/bin/env node
/* signup-plan-handoff-browser-test · landing#B2.
 *
 * The landing's "annual / monthly" switch puts the period on the signup link
 * (?plan=pro&period=annual; tools/landing-pricing-hydrated-test.mjs holds the
 * links). The account gate (functions/_middleware.js) must keep both through a
 * refused attempt, a reload and a trip between the Log in and Sign up tabs, so
 * the request recorded for the operator is the one the visitor chose.
 * Real Chromium, the real gate, the POST body read off the wire.
 *
 *   node tools/signup-plan-handoff-browser-test.mjs
 */
import { suite } from './browser-trace.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { onRequest as middleware } from '../functions/_middleware.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gate = async () => (await middleware({
  request: new Request('https://kiwi.test/dashboard.html?lang=fr', { headers: { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' } }),
  env: { AUTH_SECRET: 'signup-handoff-test-secret-32chars!' },
  next: async () => new Response('open'),
})).text();
const html = await gate();

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const posted = [];
let refuse = 0;
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname === '/auth/signup' && rq.method === 'POST') {
    let body = ''; rq.on('data', (c) => { body += c; });
    rq.on('end', () => {
      posted.push(JSON.parse(body));
      if (refuse > 0) { refuse--; rs.writeHead(503, { 'Content-Type': 'application/json' }); rs.end('{"error":"unavailable"}'); return; }
      rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end('{"ok":true}');
    });
    return;
  }
  if (u.pathname === '/gate') { rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); rs.end(html); return; }
  if (u.pathname === '/dashboard') { rs.writeHead(200, { 'Content-Type': 'text/html' }); rs.end('<!doctype html><title>dashboard</title>'); return; }
  const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((resolve) => {
  server.once('error', () => { console.error('Browser test server unavailable in this environment'); process.exit(3); });
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const tests = suite('signup-plan-handoff', { browser });

for (const [plan, period] of [['pro', 'annual'], ['plus', 'monthly']]) {
  await tests.run(`${plan} ${period} · the chosen plan and period reach the server after a refusal, a reload and a tab trip`, async (t) => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    posted.length = 0;
    const fill = async () => {
      await page.$eval('#su-name', (el) => { el.value = ''; }); await page.type('#su-name', 'Salma');
      await page.$eval('#su-biz', (el) => { el.value = ''; }); await page.type('#su-biz', 'Boutique Salma');
      await page.$eval('#su-email', (el) => { el.value = ''; }); await page.type('#su-email', 'salma@example.test');
      await page.$eval('#su-pass', (el) => { el.value = ''; }); await page.type('#su-pass', 'unlongmotdepasse-2026');
    };
    t.step('arrive from the landing: the sign-up tab opens by itself');
    await page.goto(`${base}/gate?plan=${plan}&period=${period}`, { waitUntil: 'load' });
    assert.equal(await page.$eval('#form-signup', (el) => getComputedStyle(el).display !== 'none'), true, 'sign-up is the visible form');

    t.step('the server refuses once: the visitor sees it');
    refuse = 1;
    await fill(); await page.click('#form-signup .go');
    await page.waitForFunction(() => document.getElementById('su-err').textContent.trim() !== '');

    t.step('reload, then a trip to Log in and back, then submit again');
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('#form-signup', (el) => getComputedStyle(el).display !== 'none'), true, 'the reload reopens sign-up');
    await page.click('#tab-login'); await page.click('#tab-signup');
    await fill(); await page.click('#form-signup .go');
    await page.waitForFunction(() => location.pathname === '/dashboard');

    assert.equal(posted.length, 2, 'both attempts reached the server');
    for (const body of posted) assert.deepEqual({ plan: body.plan, period: body.period }, { plan, period }, 'every attempt carries the visitor\'s choice');
    assert.deepEqual(errors, [], 'no page error');
  });
}

server.close();
await tests.finish();
