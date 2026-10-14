#!/usr/bin/env node
/* dash-ai-browser-test · the start of a Kiwi AI conversation on the kit
 * (stage 5 (7), §18.6), behind kiwiSkin2027:dashboard, on the demo store in a
 * real Chromium.
 *
 *   node tools/dash-ai-browser-test.mjs
 *
 * What it holds:
 *   · flag off: dash-ai.js is never fetched, no #kit-ai, the shipped hero;
 *   · flag on: #kit-ai sits inside the shipped hero, whose content is not
 *     drawn; ai.intro names the business;
 *   · the Today card reads today from the ledger: amount, orders, its
 *     direction against yesterday at the same time, its source chip;
 *   · the rows are the trade questions, then the questions of the hero;
 *   · a row asks through the shipped conversation, and the start gives way;
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
const norm = (s) => String(s || '').replace(/[\s  ]+/g, ' ').trim();

/* The demo store, as a first visit sees it (Explore the demo, then Escape),
   then Kiwi AI. */
async function openAI(flag) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [], fetched = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1000 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base)) fetched.push(new URL(u).pathname);
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on) => {
    if (on) localStorage.setItem('kiwiSkin2027:dashboard', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag);
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d/.test(x.textContent)); if (b) b.click(); });
  await sleep(1200);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!window.KiwiAgent && !!window.KiwiDemoClock && !!window.KiwiDemoClock.getSimState(), { timeout: 20000 });
  await page.evaluate(() => window.KiwiAgent.open());
  await page.waitForFunction(() => !!document.querySelector('[data-fa-hero]'), { timeout: 20000 });
  await sleep(500);
  return { ctx, page, errors, fetched };
}

const tap = (page, js) => page.evaluate((src) => {
  const el = (0, eval)(src);
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
  el.click();
}, js);

console.log('dash-ai-browser-test');
try {
  {
    const { ctx, page, errors, fetched } = await openAI(false);
    const off = await page.evaluate(() => ({ kit: !!document.getElementById('kit-ai'), cards: !!document.querySelector('[data-fa-hero] .fa-hero-cards').offsetParent }));
    check(!fetched.some((p) => /dash-ai\.js/.test(p)) && !off.kit && off.cards, 'flag off: dash-ai.js is never fetched, no #kit-ai, the shipped hero is drawn');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  const { ctx, page, errors } = await openAI(true);
  const v = await page.evaluate(() => {
    const ka = document.getElementById('kit-ai');
    const hero = document.querySelector('[data-fa-hero]');
    const m = window.KiwiAgentHome.model();
    const dr = window.KiwiDayReport;
    const today = window.KiwiDemoClock.getDaySales(dr.today());
    return {
      inside: !!ka && ka.parentNode === hero,
      shipped: [...hero.children].filter((c) => c !== ka).every((c) => !c.offsetParent),
      intro: ka.querySelector('.k-ai__intro').textContent, business: m.business,
      card: (ka.querySelector('[data-today]') || {}).textContent || '',
      pace: m.pace, ledger: { n: today.length, total: today.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100 },
      fmtTotal: window.KiwiFormat.money(m.pace ? m.pace.total : 0, 0), fmtN: String(today.length),
      rows: ka.querySelector('k-list').rows.map((r) => r.title),
      follows: [...hero.querySelectorAll('.fa-hero-cards [data-fa-follow]')].map((b) => b.getAttribute('data-fa-follow')),
    };
  });
  check(v.inside && v.shipped, 'flag on: #kit-ai sits inside the shipped hero, whose own content is not drawn');
  check(v.business && norm(v.intro).indexOf(norm(v.business)) >= 0, `ai.intro names the business (${norm(v.intro)})`);
  check(v.pace && v.pace.count === v.ledger.n && Math.abs(v.pace.total - v.ledger.total) < 0.005, `the Today card reads today's ledger (${v.ledger.n} orders, ${v.ledger.total})`);
  const dir = v.pace.total > v.pace.priorTotal ? /de plus/ : v.pace.total < v.pace.priorTotal ? /de moins/ : /comme hier/;
  check(norm(v.card).indexOf(norm(v.fmtTotal)) >= 0 && norm(v.card).indexOf(' ' + v.fmtN + ' commande') >= 0 && dir.test(v.card) && /Ventes · aujourd'hui/.test(v.card),
    `with its amount, its orders, its direction against yesterday and its source (${norm(v.card)})`);
  check(v.rows.length === 3 + v.follows.length && norm(v.rows[0]) === 'Quel plat retirer de ma carte ?' && v.follows.every((q, i) => v.rows[3 + i] === q),
    `the rows: the trade's three questions, then the hero's (${v.rows.join(' | ')})`);

  /* A row asks through the shipped conversation. */
  const q = v.rows[3];
  await tap(page, `document.querySelector('#kit-ai k-list').shadowRoot.querySelectorAll('[data-row]')[3]`);
  await sleep(800);
  const after = await page.evaluate(() => ({ hero: !!document.querySelector('[data-fa-hero]'), kit: !!document.getElementById('kit-ai'), thread: document.querySelector('[data-fa-thread]').textContent }));
  check(!after.hero && !after.kit && after.thread.indexOf(q) >= 0, `a row asks its question, and the start gives way to the conversation (${q})`);
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-ai-browser-test · ${checks} checks`);
