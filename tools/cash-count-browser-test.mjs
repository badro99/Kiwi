#!/usr/bin/env node
/* cash-count-browser-test · closing the till on the kit (stage 4 (7), §18.9),
 * behind kiwiSkin2027:till, on the demo till in a real Chromium.
 *
 *   node tools/cash-count-browser-test.mjs
 *
 * What it holds:
 *   · <k-cash-count> alone: within the tolerance no reason is asked; beyond
 *     it the four reason chips show and Close waits for one;
 *   · on the till, Close the till opens the kit's count sheet and the shipped
 *     sheet stays shut; the sheet's Expected is the shipped drawerExpected();
 *   · counted beyond tolerance: a reason, then the card step beside Kiwi's
 *     card total, then the shipped closeRegister(): the shift is closed and
 *     the close event carries countedCents, the gap and gapReason; the card
 *     total typed reaches the shipped card field;
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

console.log('cash-count-browser-test');
try {
  const page = await browser.newPage();
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
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof doOpenService === 'function' && !!window.KiwiTillFrame, { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await sleep(300);

  const tap = (sel, host) => page.evaluate((s, h) => {
    const R = (h ? document.querySelector(h) : document.querySelector('k-sheet k-cash-count')).shadowRoot;
    const el = R.querySelector(s);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
    el.click();
    return true;
  }, sel, host || null);

  /* The component alone: tolerance. */
  const alone = await page.evaluate(() => {
    const el = document.createElement('k-cash-count');
    el.setAttribute('mode', 'close');
    el.setAttribute('tolerance', '20');
    document.body.appendChild(el);
    el.count = { opening: 500, cashSales: 1000, cashTips: 0, cashIn: 0, cashOut: 0 };
    el.__any = true; el.__total = 1510; el.render();
    const within = { reasons: !!el.shadowRoot.querySelector('[data-reasons]'), disabled: el.shadowRoot.querySelector('[data-w="commit"]').disabled };
    el.__total = 1475; el.render();
    const beyond = { reasons: el.shadowRoot.querySelectorAll('[data-reasons] [data-chip]').length, disabled: el.shadowRoot.querySelector('[data-w="commit"]').disabled };
    el.remove();
    return { within, beyond };
  });
  check(!alone.within.reasons && !alone.within.disabled, 'within the tolerance (+10.00 of ±20): no reason asked, Close ready');
  check(alone.beyond.reasons === 4 && alone.beyond.disabled, 'beyond it (−25.00): four reason chips, and Close waits for one');

  /* A cash sale, then Close the till. */
  await page.evaluate(() => { document.querySelector('.mode-pill[data-mode="vrap"]').click(); });
  await sleep(200);
  await page.evaluate(async () => {
    const b = document.querySelector('#vrap-new-order'); if (b) b.click();
    const plain = menuItems.find((m) => !m.formula && !itemOptGroups(m).length);
    addToCart(plain.id); addToCart(plain.id);
    await finalizeTender('cash');
  });
  await sleep(400);
  await page.evaluate(() => {
    window.__cash = [];
    if (window.KiwiCashSessions) window.KiwiCashSessions.emit = (ev) => { window.__cash.push(ev); return true; };
    window.__paid = [];
    window.KiwiHaptics = window.KiwiHaptics || {};
    window.KiwiHaptics.play = (cls, gid, _p, meta) => { if (cls === 'Paid') window.__paid.push(meta && meta.trigger); return null; };
    openCloture();
  });
  await sleep(500);
  check(await page.evaluate(() => { const s = document.querySelector('k-sheet[size="count"]'); return !!s && s.hasAttribute('open') && !!s.querySelector('k-cash-count'); }),
    'Close the till opens the kit\'s count sheet');
  check(await page.evaluate(() => !document.querySelector('#cloture-modal').classList.contains('is-open')), 'and the shipped close sheet stays shut');
  const exp = await page.evaluate(() => ({ kit: document.querySelector('k-sheet k-cash-count').expected(), shipped: drawerExpected() }));
  check(Math.abs(exp.kit - exp.shipped) < 0.005, `the sheet's Expected is the shipped drawerExpected() (${exp.kit} = ${exp.shipped})`);

  /* Count one 200 note: far below expected, beyond tolerance. */
  await tap('[data-denom="200"]');
  await sleep(150);
  await tap('[data-kp-key="1"]');
  await sleep(200);
  const state = await page.evaluate(() => { const c = document.querySelector('k-sheet k-cash-count'); return { counted: c.counted(), diff: c.diff(), reasons: !!c.shadowRoot.querySelector('[data-reasons]'), disabled: c.shadowRoot.querySelector('[data-w="commit"]').disabled }; });
  check(state.counted === 200 && state.reasons && state.disabled, `counted 200.00 against ${exp.kit}: the reason is asked and Close waits`);
  await tap('[data-reasons] [data-chip="counting"]');
  await sleep(150);
  check(await page.evaluate(() => !document.querySelector('k-sheet k-cash-count').shadowRoot.querySelector('[data-w="commit"]').disabled), 'a reason chosen: Close is ready');
  await tap('[data-w="commit"]');
  await sleep(250);
  const card = await page.evaluate(() => { const c = document.querySelector('k-sheet k-cash-count'); return { stage: c.__stage, text: c.shadowRoot.textContent, kiwi: clotureCardExpected, disabled: c.shadowRoot.querySelector('[data-w="commit"]').disabled }; });
  check(card.stage === 'card' && card.disabled, 'Close leads to the card step first, which waits for the terminal\'s total');
  await tap('[data-kp-key="0"]');
  await sleep(150);
  await tap('[data-w="commit"]');
  await page.waitForFunction(() => registerClosed === true, { timeout: 30000 });
  const ev = await page.evaluate(() => window.__cash.filter((e) => e.eventType === 'close').pop());
  check(!!ev && ev.countedCents === 20000 && ev.gapReason === 'counting' && ev.gapCents === ev.countedCents - ev.expectedCents,
    `the shipped close ran; its event carries the count and the reason (${JSON.stringify(ev && { countedCents: ev.countedCents, gapCents: ev.gapCents, gapReason: ev.gapReason })})`);
  check(await page.evaluate(() => document.querySelector('#clo-card-z').value === '0'), 'the terminal\'s card total reached the shipped card field');
  const paid = await page.evaluate(() => window.__paid.slice());
  check(paid.length === 1, `one Paid, on the frame the close is committed (${JSON.stringify(paid)})`);
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ cash-count-browser-test · ${checks} checks`);
