#!/usr/bin/env node
/* online-inbox-test · the online orders' home in the Takeaway tab (stage 4
 * (12), §18.3), behind kiwiSkin2027:till, on the demo till in a real
 * Chromium. orderpro-inbox.js stays the data source: its poll is fed through a
 * stubbed KiwiKitchenRelay.pullAll, and POST /api/order/queue is answered by
 * the test (status and delay per case).
 *
 *   node tools/online-inbox-test.mjs
 *
 * What it holds:
 *   · flag off: the floating chip as shipped, till-online.js never fetched;
 *   · flag on: no chip, the section at the top of the Takeaway tab, empty and
 *     hidden with no orders; then online.section and the groups to_accept,
 *     in_kitchen, ready (each drawn only when it holds orders);
 *   · the rail's Takeaway badge counts the orders to accept, aria-label
 *     till.nav.takeaway_a11y;
 *   · arrival: online.arrived {n} toast, no haptic, no French toast;
 *   · Accept: POST with no outbox, the button busy until the answer, Commit
 *     (trigger server-ack) only when the ok lands within 600 ms;
 *   · a failure leaves the card unchanged with online.not_confirmed, a 403
 *     with online.refused_pairing;
 *   · Reject asks for the till approval: closed, nothing sent and nothing
 *     said; approved, the order leaves the section;
 *   · Take payment and Print go through the till's own bridge. */
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

/* What POST /api/order/queue answers, set per case. */
let answer = { status: 200, delay: 0, body: { ok: true } };
const posts = [];

async function openTill(flag) {
  const page = await browser.newPage();
  const errors = [];
  const fetched = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1024 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base)) fetched.push(new URL(u).pathname);
    if (u.startsWith(base + '/api/order/queue') && r.method() === 'POST') {
      let body = {}; try { body = JSON.parse(r.postData() || '{}'); } catch (_) {}
      posts.push(body);
      const a = answer;
      setTimeout(() => r.respond({ status: a.status, contentType: 'application/json', body: JSON.stringify(a.body) }).catch(() => {}), a.delay);
      return;
    }
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on) => {
    if (on) localStorage.setItem('kiwiSkin2027:till', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag);
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof doOpenService === 'function' && !!window.KiwiOrderInbox && !!window.KiwiCaisseKitchen, { timeout: 30000 });
  if (flag) await page.waitForFunction(() => document.documentElement.hasAttribute('data-k-till'), { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await sleep(300);
  /* Order Pro on, a paired till, the poll fed by the test. */
  await page.evaluate(() => {
    window.KiwiConfig = window.KiwiConfig || {};
    window.KiwiConfig.features = Object.assign({}, window.KiwiConfig.features, { orderpro: true });
    window.KiwiCaissePairing = Object.assign(window.KiwiCaissePairing || {}, { isPaired: () => true });
    window.__feed = { ok: true, now: Date.now(), orders: [], sessions: [], closedSessions: [], expired: [] };
    window.KiwiKitchenRelay = Object.assign(window.KiwiKitchenRelay || {}, {
      merchant: () => 'test-kiwi-store',
      pullAll: () => Promise.resolve(JSON.parse(JSON.stringify(window.__feed))),
    });
    window.__bridge = { checkout: [], print: [] };
    const Kk = window.KiwiCaisseKitchen;
    Kk.checkoutOrder = (id) => { window.__bridge.checkout.push(id); };
    Kk.printOrder = (id) => { window.__bridge.print.push(id); };
    Kk.confirmAccepted = () => {};
    Kk.ingest = () => {};
  });
  return { page, errors, fetched };
}

const order = (id, number, status, extra) => Object.assign({
  id, number, status, mode: 'takeout', channel: 'kiwi', created_ts: Date.now() - 3 * 60000, total: 64.5, paid: false,
  lines: [{ name: 'TEST KIWI · Café', qty: 2 }], customer: { name: 'TEST KIWI' },
}, extra || {});

console.log('online-inbox-test');
try {
  /* Flag off: the shipped chip, no kit module. */
  {
    const { page, errors, fetched } = await openTill(false);
    await page.evaluate(() => { window.__feed.orders = [{ id: 'o-off', number: 7, status: 'pending', mode: 'takeout', channel: 'kiwi', created_ts: Date.now(), total: 20, lines: [] }]; return window.KiwiOrderInbox.refresh(); });
    await sleep(200);
    const off = await page.evaluate(() => ({ chip: !!document.getElementById('kop-chip'), section: !!document.getElementById('kit-online') }));
    check(off.chip && !off.section, 'flag off: the floating chip as shipped, no Takeaway section');
    check(!fetched.some((p) => /till-online\.js/.test(p)), 'flag off: till-online.js is never fetched');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await page.close();
  }

  const { page, errors } = await openTill(true);
  const t = (k, a) => page.evaluate((key, args) => KiwiKit.t(key, args).replace(/[⁦-⁩]/g, ''), k, a || {});
  await page.evaluate(() => {
    window.__toasts = [];
    const show = window.KiwiToast.show.bind(window.KiwiToast);
    window.KiwiToast.show = (o) => { window.__toasts.push(o.message); return show(o); };
    window.__haptics = [];
    window.KiwiHaptics = window.KiwiHaptics || {};
    window.KiwiHaptics.play = (cls, gid, _p, meta) => { if (cls === 'Commit') window.__haptics.push([cls, meta && meta.trigger]); return null; };
    window.__french = [];
    const stack = document.getElementById('toast-stack');
    /* Only the toasts ADDED from now on: the till's own "Service restauré" toast
     * (kiwi-caisse.html, 500 ms after the shift reopens) is not the inbox's, and
     * rereading the whole stack on each mutation made it count as one. */
    if (stack) new MutationObserver((muts) => { muts.forEach((m) => m.addedNodes.forEach((el) => { if (el.classList && el.classList.contains('toast') && !/^Service restauré/.test(el.textContent)) window.__french.push(el.textContent); })); }).observe(stack, { childList: true });
  });

  /* Empty: the section exists and is hidden; no chip. */
  await page.evaluate(() => window.KiwiOrderInbox.refresh());
  await sleep(150);
  let s = await page.evaluate(() => ({ chip: !!document.getElementById('kop-chip'), box: !!document.getElementById('kit-online'), hidden: document.getElementById('kit-online') && document.getElementById('kit-online').hidden, top: document.querySelector('#vrap-board').firstElementChild && document.querySelector('#vrap-board').firstElementChild.id }));
  check(!s.chip, 'flag on: no floating chip');
  check(s.box && s.hidden && s.top === 'kit-online', 'flag on: the section is the first thing on the Takeaway board, hidden with no orders');

  /* Two arrive to accept, one in the kitchen, one ready. */
  await page.evaluate((list) => { window.__feed.orders = list; return window.KiwiOrderInbox.refresh(); }, [
    order('o-1', 11, 'pending'),
    order('o-2', 12, 'pending', { mode: 'table', table: 4, total: 120 }),
    order('o-3', 13, 'accepted'),
    order('o-4', 14, 'ready', { paid: true }),
  ]);
  await sleep(300);
  s = await page.evaluate(() => {
    const box = document.getElementById('kit-online');
    return {
      hidden: box.hidden,
      head: box.querySelector('.k-on__hd') && box.querySelector('.k-on__hd').textContent,
      groups: [...box.querySelectorAll('.k-on__gh')].map((e) => e.textContent),
      cards: [...box.querySelectorAll('.k-oc')].map((c) => ({ id: c.dataset.order, acts: [...c.querySelectorAll('.k-oc__ac k-button')].map((b) => b.dataset.a) })),
      table: !!box.querySelector('.k-oc[data-order="o-2"] button[data-a="table"]'),
    };
  });
  check(!s.hidden && s.head === await t('online.section'), 'the section is headed online.section once there are orders');
  check(JSON.stringify(s.groups) === JSON.stringify([await t('online.to_accept', { n: 2 }), await t('online.in_kitchen', { n: 1 }), await t('online.ready', { n: 1 })]),
    'groups in order: to_accept · 2, in_kitchen · 1, ready · 1');
  const acts = Object.fromEntries(s.cards.map((c) => [c.id, c.acts.join(',')]));
  check(acts['o-1'] === 'reject,accept,pay' && acts['o-3'] === 'cancel,ready,pay' && acts['o-4'] === 'cancel,served',
    `card actions by group (pending: ${acts['o-1']} · accepted: ${acts['o-3']} · ready, paid: ${acts['o-4']})`);
  check(s.table, 'a table order\'s place is a button to its table');

  const rail = await page.evaluate(() => {
    const it = document.querySelector('k-rail').shadowRoot.querySelector('[data-id="takeaway"]');
    return { badge: it && it.querySelector('.bdw') ? it.querySelector('.bdw').textContent.trim() : '', label: it && it.getAttribute('aria-label') };
  });
  check(rail.badge === '2' && rail.label === await t('till.nav.takeaway_a11y', { n: 2 }), `the rail's Takeaway badge counts the orders to accept (${rail.badge}, "${rail.label}")`);

  let w = await page.evaluate(() => ({ toasts: window.__toasts.slice(), haptics: window.__haptics.slice(), french: window.__french.slice() }));
  const arrived = await t('online.arrived', { n: 2 });
  check(w.toasts.length === 1 && w.toasts[0].startsWith(arrived), `arrival: the online.arrived toast, n = 2 ("${w.toasts[0]}")`);
  check(w.haptics.length === 0 && w.french.length === 0, 'arrival: no haptic, and no French toast from the shipped inbox');

  const press = (id, a) => page.evaluate((oid, act) => {
    const b = document.querySelector('#kit-online .k-oc[data-order="' + oid + '"] k-button[data-a="' + act + '"]');
    b.shadowRoot.querySelector('button').click();
  }, id, a);
  const reset = () => page.evaluate(() => { window.__toasts.length = 0; window.__haptics.length = 0; window.__french.length = 0; });

  /* Accept, answered at once: POST, busy meanwhile, Commit on the ok. */
  await reset(); posts.length = 0;
  answer = { status: 200, delay: 250, body: { ok: true, status: 'accepted' } };
  await press('o-1', 'accept');
  await sleep(80);
  const busy = await page.evaluate(() => {
    const c = document.querySelector('#kit-online .k-oc[data-order="o-1"]');
    return { loading: c.querySelector('k-button[data-a="accept"]').hasAttribute('loading'), off: c.querySelector('k-button[data-a="reject"]').hasAttribute('disabled') };
  });
  check(busy.loading && busy.off, 'Accept: the button stays busy, and the card\'s others wait, until the answer');
  await sleep(500);
  w = await page.evaluate(() => ({ haptics: window.__haptics.slice(), group: (() => { const c = document.querySelector('#kit-online .k-oc[data-order="o-1"]'); return c && c.closest('.k-on__gp').querySelector('.k-on__gh').textContent; })() }));
  check(posts.length === 1 && posts[0].id === 'o-1' && posts[0].status === 'accepted', 'Accept: one POST /api/order/queue, status accepted');
  check(w.haptics.length === 1 && w.haptics[0][0] === 'Commit' && w.haptics[0][1] === 'server-ack', 'Accept: Commit, trigger server-ack, on an ok within 600 ms');
  check(w.group === await t('online.in_kitchen', { n: 2 }), 'Accept: the card moves to in_kitchen');

  /* Accept, ok after 600 ms: no Commit. */
  await reset(); posts.length = 0;
  answer = { status: 200, delay: 800, body: { ok: true, status: 'accepted' } };
  await press('o-2', 'accept');
  await sleep(1200);
  w = await page.evaluate(() => ({ haptics: window.__haptics.slice() }));
  check(posts.length === 1, 'a late Accept still posts once');
  check(w.haptics.length === 0, 'Accept: an ok after 600 ms plays no Commit');

  /* Failures: the card unchanged, the kit says so, the French toast does not. */
  await page.evaluate((list) => { window.__feed.orders = list; return window.KiwiOrderInbox.refresh(); }, [order('o-5', 15, 'pending')]);
  await sleep(200);
  await reset();
  answer = { status: 500, delay: 0, body: { error: 'boom' } };
  await press('o-5', 'accept');
  await sleep(400);
  w = await page.evaluate(() => ({ toasts: window.__toasts.slice(), french: window.__french.slice(), haptics: window.__haptics.slice(), still: (() => { const c = document.querySelector('#kit-online .k-oc[data-order="o-5"]'); return !!c && c.querySelector('k-button[data-a="accept"]') && !c.querySelector('k-button[data-a="accept"]').hasAttribute('loading'); })() }));
  check(w.still, 'a failed Accept leaves the card as it was, ready to try again');
  check(w.toasts.includes(await t('online.not_confirmed')) && w.french.length === 0 && w.haptics.length === 0, 'a failure says online.not_confirmed, once, in the till\'s language, no haptic');
  await reset();
  answer = { status: 403, delay: 0, body: { error: 'not-paired' } };
  await press('o-5', 'accept');
  await sleep(400);
  w = await page.evaluate(() => ({ toasts: window.__toasts.slice() }));
  check(w.toasts.includes(await t('online.refused_pairing')), 'a 403 says online.refused_pairing');

  /* Reject: the till approval first. */
  await reset(); posts.length = 0;
  answer = { status: 200, delay: 0, body: { ok: true, status: 'rejected' } };
  await page.evaluate(() => { window.__approve = 'cancel'; window.__asked = 0; window.KiwiAuthorizeTillAction = (label, ok, opts) => { window.__asked++; if (window.__approve === 'yes') ok({ actorProof: 'proof' }); else opts.onCancel(); }; });
  await press('o-5', 'reject');
  await sleep(300);
  w = await page.evaluate(() => ({ asked: window.__asked, toasts: window.__toasts.slice(), here: !!document.querySelector('#kit-online .k-oc[data-order="o-5"]') }));
  check(w.asked === 1 && posts.length === 0 && w.here && w.toasts.length === 0, 'Reject asks for the till approval; closed, nothing is sent, nothing said, the card stays');
  await page.evaluate(() => { window.__approve = 'yes'; window.__feed.orders = []; });
  await press('o-5', 'reject');
  await sleep(400);
  w = await page.evaluate(() => ({ here: !!document.querySelector('#kit-online .k-oc[data-order="o-5"]') }));
  check(posts.length === 1 && posts[0].status === 'rejected' && posts[0].actorProof === 'proof' && !w.here, 'approved, Reject posts rejected with the proof and the order leaves the section');

  /* Take payment and Print, through the till's bridge. */
  await page.evaluate((list) => { window.__feed.orders = list; return window.KiwiOrderInbox.refresh(); }, [order('o-6', 16, 'accepted')]);
  await sleep(200);
  await press('o-6', 'pay');
  await press('o-6', 'print');
  await sleep(100);
  w = await page.evaluate(() => window.__bridge);
  check(w.checkout.includes('o-6') && w.print.includes('o-6'), 'Take payment and Print go through the till\'s own bridge (checkoutOrder, printOrder)');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ online-inbox-test · ${checks} checks`);
