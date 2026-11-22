#!/usr/bin/env node
/* close-followup-browser-test · a close always completes; the next opening says what to check.
 *
 *   node tools/close-followup-browser-test.mjs
 *
 * browse, 21 Nov 2026 (restaurant, 2027 till): the day report shows close
 * attempts at 21:03, 21:04 and 21:06 refused, the fourth at 21:27 through;
 * on 19 Nov two attempts and no close at all. Each refusal came after the
 * report was saved, on the Z write (« Rapprochement Z non protégé · poste
 * conservé »), and the count sheet also held « Clôturer » until a reason was
 * picked for the gap. Owner, 22 Nov: let the close happen, warn the next day.
 *
 * On a paired (real) restaurant till, offline: count 100 MAD over, pick no
 * reason, let the Z write fail. The close must complete; after the reload the
 * opening shows the gap and the Z, and « Vu » clears it. */
/* close-open-tables-browser-test · a till close never wipes a table that still owes money.
 *
 *   node tools/close-open-tables-browser-test.mjs
 *
 * Production, 14 October: at a real restaurant, table 2 had four orders sent
 * to the kitchen (131 MAD), never cashed, and the register was closed that
 * evening. The close cleared the saved shift and the bill with it, the server
 * stopped returning those orders after six hours, and the next day table 2
 * looked seated and empty; the cashier reset it. 131 MAD of food left the
 * books with no payment and no void, and nobody was told.
 *
 * On the demo till, by real clicks: open a free table, send two dishes, open
 * « Fin de service », type the drawer and the card Z, press « Fermer la
 * caisse ». The close must stop, name the table and its amount, keep the
 * shift; then, with « Fermer quand même » ticked, go through. The service is
 * opened by doOpenService() (the opening screen is not under test). No code
 * is typed. */
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
const S = suite('close-followup', { browser });
const venue = { merchant: 'followup-resto', type: 'restaurant', name: 'Followup Resto', location: 'Tanger' };
const kitTap = (page, sel) => page.evaluate((q) => { const el = document.querySelector('k-sheet k-cash-count').shadowRoot.querySelector(q); if (!el) return false;
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true })); el.click(); return true; }, sel);
const sheetButton = (page, label) => page.evaluate((l) => { const sh = document.querySelector('k-sheet[open]'); if (!sh) return false;
  const all = [sh, ...sh.querySelectorAll('*')].flatMap((e) => [e, ...(e.shadowRoot ? e.shadowRoot.querySelectorAll('*') : [])]);
  const b = all.find((e) => e.tagName === 'BUTTON' && e.textContent.trim() === l); if (!b) return false; b.click(); return true; }, label);
try {
  await S.run('a gap and a failed Z: the close completes, the next opening warns', async (t) => {
    const ctx = await browser.createBrowserContext(); t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    await page.setViewport({ width: 1180, height: 820 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(base)) return u.startsWith('data:') ? r.continue() : r.abort();
      if (new URL(u).pathname.startsWith('/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      return r.continue();
    });
    await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
    t.step('a paired restaurant till on the 2027 skin, service open');
    // coverage: surface=caisse-entry locale=fr viewport=desktop
    await page.goto(base + '/kiwi-caisse.html?__blank', { waitUntil: 'domcontentloaded' });
    await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('kiwiPaired', '1'); localStorage.setItem('kiwiLiveMerchant', v.merchant);
      localStorage.setItem('kiwiPairedVenue', JSON.stringify(v)); localStorage.setItem('kiwiSkin2027:till', '1'); }, venue);
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof doOpenService === 'function' && window.KiwiCloseFollowUp, { timeout: 30000 });
    await sleep(1200);
    await page.evaluate(() => { window.KiwiTillPin = { approve: (o) => o.onApprove({ id: 'followup', name: 'Mohammed', role: 'manager' }) }; doOpenService(); });
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 30000 });
    await sleep(1200);
    check(await page.evaluate(() => storeIsReal()), 'the till counts as a real store');
    await page.evaluate(() => { window.KiwiZReconciliation.queueClose = () => Promise.resolve({ ok: false, reason: 'z-journal-mismatch' }); });

    t.step('count 100 MAD over, no reason, the Z write fails');
    await page.evaluate(() => openCloture());
    await page.waitForFunction(() => { const c = document.querySelector('k-sheet[open] k-cash-count'); return c && c.shadowRoot && c.shadowRoot.querySelector('[data-denom="100"]'); }, { timeout: 15000 });
    await kitTap(page, '[data-denom="100"]'); await kitTap(page, '[data-kp-key="1"]'); await sleep(200);
    const ready = await page.evaluate(() => { const r = document.querySelector('k-sheet k-cash-count').shadowRoot;
      return { reasons: !!r.querySelector('[data-reasons]'), disabled: r.querySelector('[data-w="commit"]').disabled }; });
    check(ready.reasons && !ready.disabled, 'a reason is offered and « Clôturer » does not wait for it');
    await kitTap(page, '[data-w="commit"]'); await sleep(300);
    await kitTap(page, '[data-kp-key="0"]'); await sleep(150);
    await kitTap(page, '[data-w="commit"]');
    await page.waitForFunction(() => typeof registerClosed !== 'undefined' && registerClosed === true, { timeout: 30000 });
    check(true, 'the close completes although the Z could not be written');
    const kept = await page.evaluate((m) => window.KiwiCloseFollowUp.pending(m), venue.merchant);
    check(kept.length === 1 && kept[0].gapCents === 10000 && kept[0].zIssue === 'unprotected' && !kept[0].reason,
      `the gap and the Z wait for the next opening (${JSON.stringify(kept)})`);

    t.step('Terminé, the till reloads, the next opening warns');
    await page.waitForFunction(() => !!document.querySelector('k-sheet[open]'), { timeout: 15000 });
    const done = await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => null), sheetButton(page, 'Terminé')]);
    check(done[1], 'the Z report offers « Terminé »');
    await page.waitForFunction(() => typeof doOpenService === 'function' && window.KiwiCloseFollowUp, { timeout: 30000 });
    await sleep(1200);
    await page.evaluate(() => { window.KiwiTillPin = { approve: (o) => o.onApprove({ id: 'followup', name: 'Mohammed', role: 'manager' }) }; });
    await page.waitForSelector('#kiwi-close-followup', { timeout: 30000 });
    const card = await page.$eval('#kiwi-close-followup', (e) => e.innerText.replace(/\s+/g, ' '));
    check(/Dernière clôture à vérifier/.test(card) && /100,00 MAD de trop/.test(card) && /Aucun motif donné/.test(card) && /rapprochement Z/.test(card),
      `the opening names the gap, the missing reason and the Z (« ${card} »)`);
    await page.click('#kiwi-close-followup button');
    check(!(await page.$('#kiwi-close-followup')) && (await page.evaluate((m) => window.KiwiCloseFollowUp.pending(m).length, venue.merchant)) === 0, '« Vu » clears it');
  });
  await S.run('boutique: a close with a gap leaves its note for the next opening', async (t) => {
    const ctx = await browser.createBrowserContext(); t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    await page.setViewport({ width: 1180, height: 820 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(base)) return u.startsWith('data:') ? r.continue() : r.abort();
      if (new URL(u).pathname.startsWith('/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      return r.continue();
    });
    await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
    const shop = { merchant: 'followup-boutique', type: 'boutique', name: 'Followup Boutique', location: 'Tanger' };
    const unlock = async () => {
      await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiCloseFollowUp, { timeout: 30000 });
      await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
      await sleep(2500);
    };
    t.step('a paired boutique till');
    await page.goto(base + '/kiwi-caisse.html?__blank', { waitUntil: 'domcontentloaded' });
    await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('kiwiPaired', '1'); localStorage.setItem('kiwiLiveMerchant', v.merchant);
      localStorage.setItem('kiwiPairedVenue', JSON.stringify(v)); }, shop);
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await unlock();
    /* The opening screen asks for the float first: a chip, then « Ouvrir ». */
    await page.waitForSelector('#bqci-chips .ci-float-chip:not([data-float="custom"])', { visible: true, timeout: 15000 });
    await page.click('#bqci-chips .ci-float-chip:not([data-float="custom"])');
    await page.waitForFunction(() => !document.getElementById('bqci-btn').disabled, { timeout: 5000 });
    await page.click('#bqci-btn');
    await sleep(1500);
    t.step('close with far more cash than expected');
    await page.evaluate(() => document.getElementById('bq-close-day').click());
    await page.waitForSelector('#bq-cloture.is-open #bqclo-count', { timeout: 15000 });
    /* Far above anything the drawer could expect: an obvious overage. */
    await page.$eval('#bqclo-count', (e) => { e.value = '99990'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#bqclo-close');
    await page.waitForSelector('#bq-zsheet.is-open', { timeout: 15000 });
    const kept = await page.evaluate((m) => window.KiwiCloseFollowUp.pending(m), shop.merchant);
    check(kept.length === 1 && Math.abs(kept[0].gapCents) >= 10000, `the boutique gap waits for the next opening (${JSON.stringify(kept.map((k) => k.gapCents))})`);
    t.step('the next opening warns');
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => null), page.click('#bqzs-skip')]);
    await unlock();
    await page.waitForSelector('#kiwi-close-followup', { timeout: 20000 });
    const card = await page.$eval('#kiwi-close-followup', (e) => e.innerText.replace(/\s+/g, ' '));
    check(/de trop dans la caisse/.test(card), `the boutique opening names the gap (« ${card} »)`);
  });
} finally { await S.finish(); await browser.close(); server.close(); }
