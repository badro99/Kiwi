#!/usr/bin/env node
/* print-recovery-view-browser-test · « Voir les tickets non imprimés » opens on the tickets, by real clicks.
 *
 *   node tools/print-recovery-view-browser-test.mjs
 *
 * Mabs Outfitters, 26 Nov 2026: the printer dropped off the shop network for
 * two hours, four receipts expired on the relay, the till's alert said
 * « Voir les tickets non imprimés (4) » with no text, and the button opened
 * the printer connection settings. The four tickets were only listed inside
 * the folded relay section, which the staff scrolled past.
 *
 * On a paired boutique till (APIs answered locally: two receipts expired on the
 * relay, everything else offline): four failed receipts raise the alert, it
 * names them, « Voir » opens the panel ON the list, the alert steps aside while
 * it is open, « Réimprimer » sends the reprint, and the alert then counts what
 * the list still holds and leaves once everything is out. */
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

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const S = suite('print-recovery-view', { browser });
const shop = { merchant: 'recovery-boutique', type: 'boutique', name: 'Recovery Boutique', location: 'Tanger' };
const now = Date.now();
let jobs = [
  { id: 'pj_aaaaaaaaaaaaaaa1', kind: 'other', status: 'expired', created_ts: now - 3 * 3600e3, error: 'EHOSTUNREACH' },
  { id: 'pj_aaaaaaaaaaaaaaa2', kind: 'other', status: 'expired', created_ts: now - 3600e3, error: 'EHOSTUNREACH' },
];
const reprinted = [];
const clickable = (page, sel) => page.waitForFunction((q) => { const b = document.querySelector(q); if (!b) return false; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
  const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!at && b.contains(at); }, { timeout: 15000, polling: 200 }, sel);
const alertText = (page) => page.evaluate(() => { const e = document.getElementById('caisse-print-recovery'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; });

try {
  await S.run('the alert opens on the unprinted tickets and leaves when they are out', async (t) => {
    const ctx = await browser.createBrowserContext(); t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    await page.setViewport({ width: 1180, height: 820 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(base)) return u.startsWith('data:') ? r.continue() : r.abort();
      const url = new URL(u);
      const json = (body) => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/print/jobs' && r.method() === 'GET') return json({ ok: true, jobs });
      if (url.pathname === '/api/print/jobs' && r.method() === 'POST') {
        const body = JSON.parse(r.postData() || '{}');
        if (body.action === 'reprint-expired') { reprinted.push(body.id); jobs = jobs.filter((j) => j.id !== body.id); return json({ ok: true, id: 'pj_new' + reprinted.length }); }
      }
      if (url.pathname === '/api/print/bridges') return json({ ok: true, online: true, bridges: [{ id: 'pb_1', name: 'samsung SM-T720', platform: 'android', online: true, last_seen_ts: now }] });
      if (url.pathname.startsWith('/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      return r.continue();
    });
    await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });

    t.step('a paired boutique till');
    await page.goto(base + '/kiwi-caisse.html?__blank', { waitUntil: 'domcontentloaded' });
    await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('kiwiPaired', '1'); localStorage.setItem('kiwiLiveMerchant', v.merchant);
      localStorage.setItem('kiwiPairedVenue', JSON.stringify(v)); }, shop);
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiPrinter && window.KiwiCaisseLang, { timeout: 30000 });
    await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
    await page.waitForSelector('#bqci-chips .ci-float-chip[data-float="500"]', { visible: true, timeout: 15000 });
    await page.click('#bqci-chips .ci-float-chip[data-float="500"]');
    await page.waitForFunction(() => !document.getElementById('bqci-btn').disabled, { timeout: 5000 });
    await page.click('#bqci-btn');
    await sleep(1500);

    t.step('four receipts fail to print');
    /* receipt.js announces each receipt's outcome as data (kiwi:receipt-print); four failures, as at Mabs. */
    await page.evaluate(() => ['r1', 'r2', 'r3', 'r4'].forEach((id) => window.dispatchEvent(new CustomEvent('kiwi:receipt-print', { detail: { ok: false, id } }))));
    await page.waitForSelector('#caisse-print-recovery [data-view]', { visible: true, timeout: 15000 });
    let text = await alertText(page);
    check(/Tickets non imprimés · 4/.test(text) && /Voir les tickets non imprimés \(4\)/.test(text), `the alert names what failed (« ${text} »)`);

    t.step('« Voir » opens the list');
    await clickable(page, '#caisse-print-recovery [data-view]');
    await page.click('#caisse-print-recovery [data-view]');
    await page.waitForSelector('#kpr-unprinted .kpr-relay-row button', { visible: true, timeout: 15000 });
    const panel = await page.evaluate(() => {
      const card = document.getElementById('kpr-card'), sec = document.getElementById('kpr-unprinted');
      const first = [...card.querySelectorAll('.kpr-bt')][0];
      return { first: first && first.id, rows: sec.querySelectorAll('.kpr-relay-row').length, text: sec.innerText.replace(/\s+/g, ' '), top: sec.getBoundingClientRect().top < window.innerHeight };
    });
    check(panel.first === 'kpr-unprinted' && panel.top, 'the panel opens on « Tickets non imprimés », first and on screen');
    check(panel.rows === 2 && /Non imprimé · Impression/.test(panel.text) && /Réimprimer/.test(panel.text), `it lists the two receipts the relay kept (« ${panel.text.slice(0, 160)} »)`);
    check(/allumée et sur le réseau/.test(panel.text), 'and says what to check before reprinting');
    check((await alertText(page)) === null, 'the alert steps aside while the panel is open');
    check((await page.$$eval('#kpr-relay-list .kpr-relay-row button', (b) => b.filter((x) => /Réimprimer/.test(x.textContent)).length)) === 0, 'the tickets are not listed twice (the relay section leaves them to the top list)');

    t.step('reprint one, close');
    await page.click('#kpr-unprinted .kpr-relay-row button');
    await page.waitForFunction(() => document.querySelectorAll('#kpr-unprinted .kpr-relay-row').length === 1, { timeout: 10000 });
    check(reprinted.length === 1 && /^pj_aaaaaaaaaaaaaaa[12]$/.test(reprinted[0]), `« Réimprimer » asks the relay for a fresh copy (${reprinted.join(', ')})`);
    await page.click('#kpr-close');
    await page.waitForSelector('#caisse-print-recovery [data-view]', { visible: true, timeout: 10000 });
    text = await alertText(page);
    check(/Voir les tickets non imprimés \(1\)/.test(text) && /Ticket non imprimé/.test(text), `after closing, the alert counts what the list still holds (« ${text} »)`);

    t.step('reprint the last one');
    await clickable(page, '#caisse-print-recovery [data-view]');
    await page.click('#caisse-print-recovery [data-view]');
    await page.waitForSelector('#kpr-unprinted .kpr-relay-row button', { visible: true, timeout: 15000 });
    await page.click('#kpr-unprinted .kpr-relay-row button');
    await page.waitForFunction(() => /tout est sorti/.test(document.getElementById('kpr-unprinted-t').textContent), { timeout: 10000 });
    check(reprinted.length === 2, 'the second receipt is reprinted');
    await page.click('#kpr-close');
    await sleep(500);
    check((await alertText(page)) === null, 'nothing left: the alert is gone');
  });
} finally { await S.finish(); await browser.close(); server.close(); }
console.log(`✓ print-recovery-view-browser · ${checks} checks`);
