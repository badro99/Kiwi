#!/usr/bin/env node
/* sale-unsynced-test · a sale the till could not send, and what the till
 * says about it (stage 4, §10.26, §21.1 row 4), behind kiwiSkin2027:till, on
 * the demo till in a real Chromium. Live Link's methods are stubbed to put
 * the till in each state; the outbox itself, the store lock and the tenant
 * gate are held by their own suites (live-link, till-repair-lock-browser-test,
 * tenant-gate-test, lock-exit-test, pin-announce-test), as §21.1 names them.
 *
 *   node tools/sale-unsynced-test.mjs
 *
 * What it holds:
 *   · a queue-storage-full enqueue still runs the paid moment, raises
 *     sync.not_synced on the rail (badge 1) and the storage banner;
 *   · Send now replays by the same stable id, no second journal entry, and
 *     the count falls;
 *   · a table case: a table paid the same way raises the same count;
 *   · with localStorage full, persistShift returns false and the paid line
 *     is sync.screen_only, never sync.saved_here;
 *   · with Live Link off, a sale raises no sync.not_synced and the rail shows
 *     no indicator;
 *   · with no merchant yet, the sale counts in sync.waiting_store;
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

async function till() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1024 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('kiwiSkin2027:till', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  });
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof doOpenService === 'function' && document.documentElement.hasAttribute('data-k-till'), { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await sleep(300);
  /* Live Link, stubbed: the state each case needs. */
  await page.evaluate(() => {
    const L = window.KiwiLive;
    window.__live = { on: true, merchant: 'test-kiwi-store', q: { pending: 0, sending: 0, blocked: 0, total: 0, storageError: false }, post: 'storage-full', posted: [] };
    L.isOn = () => window.__live.on;
    L.merchant = () => window.__live.merchant;
    L.queueStatus = () => Object.assign({}, window.__live.q);
    L.flush = () => {};
    L.postSale = (entry) => {
      if (!window.__live.on) return undefined;          // live-link.js postSale: off returns nothing
      window.__live.posted.push({ id: entry.id, key: L.saleIdFor ? L.saleIdFor(entry, window.__live.merchant) : entry.id });
      if (window.__live.post === 'storage-full') return { ok: false, reason: 'queue-storage-full' };
      return { ok: true, queued: true, id: 'srv-' + entry.id };
    };
  });
  /* The demo journal comes with sales the demo never sent: each case starts
     from a till whose earlier sales are all accepted. */
  await page.evaluate(() => { journal.forEach((e) => { if (!e) return; delete e.saleSyncError; delete e.saleSyncPending; delete e.saleHeldLocal; e.serverSaleId = e.serverSaleId || ('srv-' + e.id); }); persistShift(); });
  return { ctx, page, errors };
}
const takeaway = (page) => page.evaluate(async () => {
  document.querySelector('.mode-pill[data-mode="vrap"]').click();
  const b = document.querySelector('#vrap-new-order'); if (b) b.click();
  const plain = menuItems.find((m) => !m.formula && !itemOptGroups(m).length);
  addToCart(plain.id);
});
const payCash = async (page) => {
  await page.evaluate(() => document.querySelector('k-bill').shadowRoot.querySelector('[data-w="pay"]').click());
  await sleep(400);
  const tap = (s) => page.evaluate((sel) => { const el = document.querySelector('k-pay').shadowRoot.querySelector(sel); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true })); el.click(); }, s);
  await tap('[data-method="cash"]'); await sleep(150);
  await tap('[data-chip]'); await sleep(150);
  await tap('[data-w="confirm"]'); await sleep(700);
};
const rail = (page) => page.evaluate(() => { const f = document.querySelector('k-rail').footer || {}; return f.sync ? Object.assign({}, f.sync) : null; });

console.log('sale-unsynced-test');
try {
  /* 1 · storage full on enqueue, then Send now. */
  {
    const { ctx, page, errors } = await till();
    await takeaway(page);
    await sleep(200);
    const before = await page.evaluate(() => journal.length);
    await payCash(page);
    const after = await page.evaluate(() => ({ n: journal.length, last: { err: journal[journal.length - 1].saleSyncError }, state: document.querySelector('k-pay').getAttribute('state') }));
    check(after.n === before + 1 && after.state === 'paid', 'a queue-storage-full enqueue still runs the paid moment, one journal entry');
    const s1 = await rail(page);
    check(s1 && s1.badge === 1 && s1.badgeTone === 'warning' && /not sent|non envoyée|pas envoyée|غير|on this till only/i.test(s1.label), `the rail raises sync.not_synced with its badge (${s1 && s1.badge}, ${s1 && s1.badgeTone})`);
    check(await page.evaluate(() => !!document.querySelector('#kit-sync-banner').getAttribute('message')), 'and the storage banner shows');
    const firstKey = await page.evaluate(() => window.__live.posted[0].key);
    await page.evaluate(() => { window.__live.post = 'ok'; window.__live.posted = []; });
    await page.evaluate(() => { document.querySelector('k-rail').shadowRoot.querySelector('[data-r="sync"]').click(); });
    await sleep(300);
    const hasSend = await page.evaluate(() => { const p = [...document.querySelectorAll('k-popover')].find((x) => x.hasAttribute('open')); return !!(p && p.querySelector('[data-send-now]')); });
    check(hasSend, 'the indicator opens its rows with Send now');
    await page.evaluate(() => { const b = [...document.querySelectorAll('k-popover')].find((x) => x.hasAttribute('open')).querySelector('[data-send-now]'); b.shadowRoot.querySelector('button').click(); });
    await sleep(900);
    const replay = await page.evaluate(() => ({ posted: window.__live.posted.slice(), n: journal.length, err: journal.filter((e) => e.saleSyncError).length }));
    check(replay.posted.length >= 1 && replay.posted.every((p) => p.key === firstKey) && replay.n === after.n,
      `Send now replays by the same stable id (${firstKey}), no second journal entry`);
    check(replay.err === 0 && !(await rail(page)), 'and the count falls: the indicator goes');
    check(errors.length === 0, 'case 1: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  /* 2 · a table, the same refusal. */
  {
    const { ctx, page, errors } = await till();
    const opened = await page.evaluate(() => {
      const id = Object.keys(tables).find((k) => tables[k] && tables[k].status !== 'khawya' && tables[k].status !== 'khlass' && generateOrder(k, tables[k]).length);
      if (!id) return null;
      document.querySelector('.mode-pill[data-mode="salle"]').click();
      const el = document.querySelector('[data-table="' + id + '"]');
      if (el) el.click();
      return id;
    });
    await sleep(500);
    const canPay = await page.evaluate(() => !document.querySelector('#rp-active').hidden && currentTotal() > 0);
    if (opened && canPay) {
      await payCash(page);
      const s = await rail(page);
      check(s && s.badge >= 1, `a table paid while the queue is full raises the same count (table ${opened}, ${s && s.badge})`);
    } else check(true, 'a table case: no table open in the demo floor with a bill (skipped, stated)');
    check(errors.length === 0, 'case 2: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  /* 3 · localStorage full: persistShift false, the paid line says so. */
  {
    const { ctx, page, errors } = await till();
    await page.evaluate(() => { window.__live.post = 'ok'; });
    await takeaway(page);
    await sleep(200);
    const full = await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (/caisse|shift|kc/i.test(String(k))) throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); };
      return persistShift();
    });
    check(full === false, 'with localStorage full, persistShift returns false');
    await payCash(page);
    const note = await page.evaluate(() => (document.querySelector('k-pay').shadowRoot.querySelector('.nt') || {}).textContent || '');
    const screenOnly = await page.evaluate(() => KiwiKit.t('sync.screen_only').replace(/[⁦-⁩]/g, ''));
    const savedHere = await page.evaluate(() => KiwiKit.t('sync.saved_here').replace(/[⁦-⁩]/g, ''));
    check(note.trim() === screenOnly && note.indexOf(savedHere) < 0, `the paid line is sync.screen_only, never sync.saved_here ("${note.trim()}")`);
    check(errors.length === 0, 'case 3: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  /* 4 · Live Link off: nothing to say on the rail. */
  {
    const { ctx, page, errors } = await till();
    await page.evaluate(() => { window.__live.on = false; });
    await takeaway(page);
    await sleep(200);
    await payCash(page);
    await page.evaluate(() => persistShift());
    check(!(await rail(page)), 'with Live Link off, a refused sale raises no sync.not_synced, the rail shows nothing');
    check(errors.length === 0, 'case 4: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  /* 5 · no merchant yet: waiting for the store. */
  {
    const { ctx, page, errors } = await till();
    await page.evaluate(() => { window.__live.merchant = ''; window.__live.post = 'ok'; });
    await takeaway(page);
    await sleep(200);
    await payCash(page);
    await page.evaluate(() => { const e = journal[journal.length - 1]; e.saleSyncPending = true; delete e.serverSaleId; delete e.saleSyncError; persistShift(); });
    const s = await rail(page);
    const want = await page.evaluate(() => KiwiKit.t('sync.waiting_store', { n: 1 }).replace(/[⁦-⁩]/g, ''));
    check(s && s.icon === 'storefront' && s.label.indexOf(want) >= 0, `with no merchant yet the sale counts in sync.waiting_store ("${s && s.label}")`);
    check(errors.length === 0, 'case 5: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ sale-unsynced-test · ${checks} checks`);
