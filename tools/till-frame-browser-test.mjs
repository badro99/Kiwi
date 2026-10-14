#!/usr/bin/env node
/* till-frame-browser-test · the till's menu and bill on the kit (stage 4 (1),
 * §10.23, §10.24, §18.3), behind kiwiSkin2027:till, on the demo till (not
 * paired, every /api call refused), in a real Chromium, with real taps inside
 * the components.
 *
 *   node tools/till-frame-browser-test.mjs
 *
 * What it holds:
 *   · flag off: till-frame.js is never fetched, no <k-menu-grid> or <k-bill>
 *     exists, and the shipped grid is the one on screen;
 *   · flag on, takeaway builder: the shipped grid and panel are hidden, the
 *     kit grid draws one tile per dish in view, the empty bill says so;
 *   · a tap on a plain tile adds it to the shipped cart; the bill draws the
 *     line, its price and the total the shipped till computes (currentTotal);
 *   · a second tap moves the tile's badge to 2 in place (the same node: the
 *     grid is not rebuilt under the finger);
 *   · the line's stepper takes it back to 1, then off the bill;
 *   · a tile with options opens the shipped options sheet;
 *   · Take payment pushes <k-pay> inside the pane; a 10 % tip from the
 *     popover; cash Exact, card and other are recorded by the shipped
 *     tender (finalizeTender) as cash, card and wallet, with base and tip;
 *     while paying the menu takes no tap; Back gives the bill back;
 *   · no page error anywhere. */
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
const S = suite('till-frame', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* The demo till, unlocked, in the takeaway builder. */
async function till(tr, { flag }) {
  const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  const errors = [], fetched = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1024 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/assets/kit/')) fetched.push(new URL(u).pathname);
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on) => {
    if (on) localStorage.setItem('kiwiSkin2027:till', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag);
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await page.click('.mode-pill[data-mode="vrap"]');
  await sleep(200);
  await page.evaluate(() => { const b = document.querySelector('#vrap-new-order'); if (b) b.click(); });
  await page.waitForFunction(() => menuItems.length > 0 && !document.querySelector('#vrap-builder').hidden, { timeout: 20000 });
  await sleep(300);
  return { page, errors, fetched };
}

/* Inside the kit's shadow roots. */
const tiles = (page) => page.evaluate(() => {
  const g = document.querySelector('k-menu-grid');
  return g ? [...g.shadowRoot.querySelectorAll('[data-item]')].map((b) => ({ id: b.getAttribute('data-item'), opts: b.hasAttribute('data-opts'), out: b.getAttribute('aria-disabled') === 'true', q: (b.querySelector('.q') || {}).textContent || '' })) : [];
});
const tapTile = (page, id) => page.evaluate((i) => {
  const b = document.querySelector('k-menu-grid').shadowRoot.querySelector(`[data-item="${CSS.escape(i)}"]`);
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
  b.click();
}, id);
const billView = (page) => page.evaluate(() => {
  const b = document.querySelector('k-bill');
  if (!b) return null;
  const R = b.shadowRoot;
  return {
    lines: [...R.querySelectorAll('[data-line]')].map((l) => ({ id: l.getAttribute('data-line'), text: l.textContent.replace(/\s+/g, ' ').trim() })),
    total: (R.querySelector('[data-k-total]') || {}).textContent || '',
    empty: !!R.querySelector('.em'),
  };
});
const amount = (s) => Number(String(s).replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.'));

try {
  await S.run('flag off · the shipped grid, and no kit file for the menu', async (tr) => {
    const { page, errors, fetched } = await till(tr, { flag: false });
    check(!fetched.some((p) => /till-frame\.js|kit\/till\.js/.test(p)), 'flag off: till-frame.js and till.js are never fetched');
    check(await page.evaluate(() => !document.querySelector('k-menu-grid') && !document.querySelector('k-bill')), 'flag off: no <k-menu-grid> and no <k-bill>');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('#menu-grid')).display !== 'none' && document.querySelectorAll('#menu-grid .menu-item').length > 0), 'flag off: the shipped grid is on screen with its dishes');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('flag on · menu and bill on the kit, every tap through the shipped till', async (tr) => {
    const { page, errors } = await till(tr, { flag: true });
    check(await page.evaluate(() => document.documentElement.hasAttribute('data-k-till')), 'flag on: the frame is mounted (html[data-k-till])');
    check(await page.evaluate(() => ['#menu-grid', '#rp-empty', '#rp-active'].every((s) => getComputedStyle(document.querySelector(s)).display === 'none')), 'flag on: the shipped grid and panel are hidden');
    const list = await tiles(page);
    const inView = await page.evaluate(() => menuItems.filter((m) => activeCat === 'all' || m.cat === activeCat).length + (carteState.soldOut || []).filter((m) => activeCat === 'all' || m.cat === activeCat).length);
    check(list.length > 0 && list.length === inView, `flag on: one kit tile per dish in view (${list.length})`);
    const v0 = await billView(page);
    check(v0 && v0.empty && v0.lines.length === 0, 'flag on: the empty bill says so');

    const plain = list.find((t) => !t.opts && !t.out);
    assert.ok(plain, 'the demo menu has a dish without options');
    await tapTile(page, plain.id);
    await sleep(250);
    const cart1 = await page.evaluate(() => cart.map((l) => ({ id: String(l.id), qty: l.qty, uid: l.uid })));
    check(cart1.length === 1 && cart1[0].id === plain.id && cart1[0].qty === 1, 'a tap on a plain tile adds it to the shipped cart');
    const v1 = await billView(page);
    const due1 = await page.evaluate(() => currentTotal());
    check(v1.lines.length === 1 && v1.lines[0].id === cart1[0].uid, 'the bill draws the line');
    check(Math.abs(amount(v1.total) - due1) < 0.005, `the bill's total is the shipped till's (${v1.total} = ${due1})`);

    const nodeBefore = await page.evaluateHandle((i) => document.querySelector('k-menu-grid').shadowRoot.querySelector(`[data-item="${CSS.escape(i)}"]`), plain.id);
    await tapTile(page, plain.id);
    await sleep(250);
    const same = await page.evaluate((n, i) => n === document.querySelector('k-menu-grid').shadowRoot.querySelector(`[data-item="${CSS.escape(i)}"]`), nodeBefore, plain.id);
    const badge = (await tiles(page)).find((t) => t.id === plain.id).q;
    check(same && badge === '2', 'a second tap moves the badge to 2 on the same tile node');
    check(await page.evaluate(() => cart.length === 1 && cart[0].qty === 2), 'the shipped cart counts 2');

    /* Open the line, then its stepper's minus, twice. */
    const minus = async () => page.evaluate(() => {
      const R = document.querySelector('k-bill').shadowRoot;
      const ln = R.querySelector('[data-line]');
      if (ln.getAttribute('aria-expanded') !== 'true') ln.click();
      return true;
    }).then(() => sleep(150)).then(() => page.evaluate(() => {
      const R = document.querySelector('k-bill').shadowRoot;
      const btns = [...R.querySelectorAll('.ex button')];
      const dec = btns.find((b) => /moins|minus|decrease|−|-/i.test((b.getAttribute('aria-label') || '') + b.textContent)) || btns[0];
      dec.click();
    }));
    await minus();
    await sleep(250);
    check(await page.evaluate(() => cart.length === 1 && cart[0].qty === 1), 'the line\'s stepper takes it back to 1');
    await minus();
    await sleep(250);
    check(await page.evaluate(() => cart.length === 0), 'and then off the cart');
    const v2 = await billView(page);
    check(v2.empty && v2.lines.length === 0, 'and the bill is empty again');

    const withOpts = (await tiles(page)).find((t) => t.opts && !t.out);
    if (withOpts) {
      await tapTile(page, withOpts.id);
      await sleep(300);
      check(await page.evaluate(() => !!document.querySelector('[data-opt-ok]') || !!document.querySelector('.clo-btn')), 'a tile with options opens the shipped options sheet');
      await page.evaluate(() => { const c = document.querySelector('[data-opt-cancel]'); if (c) c.click(); });
      await sleep(200);
    }

    check(errors.length === 0, 'flag on: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('flag on · payment inside the pane, recorded by the shipped tender', async (tr) => {
    const { page, errors } = await till(tr, { flag: true });
    const tap = (sel) => page.evaluate((s) => {
      const el = document.querySelector('k-pay').shadowRoot.querySelector(s);
      if (!el) return false;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
      el.click();
      return true;
    }, sel);
    const plain = (await tiles(page)).find((t) => !t.opts && !t.out);
    const charge = async () => {
      await tapTile(page, plain.id);
      await sleep(200);
      await page.evaluate(() => document.querySelector('k-bill').shadowRoot.querySelector('[data-w="pay"]').click());
      await sleep(450);
    };

    await charge();
    check(await page.evaluate(() => { const p = document.querySelector('k-pay'), b = document.querySelector('k-bill'); return !p.hidden && b.hidden && !document.querySelector('#cash-modal').classList.contains('is-open'); }),
      'Take payment pushes <k-pay> over the bill, and the shipped cash window stays shut');
    const due = await page.evaluate(() => currentTotal());
    check(await page.evaluate((d) => document.querySelector('k-pay').pay.due === d, due), `the pay pane's due is the shipped till's (${due})`);
    await tapTile(page, plain.id);
    await sleep(200);
    check(await page.evaluate(() => cart.length === 1 && cart[0].qty === 1), 'while paying, the menu takes no tap');

    /* Tip 10 % through the popover. */
    await tap('[data-tip]');
    await sleep(300);
    const picked = await page.evaluate(() => {
      const list = [...document.querySelectorAll('k-popover')].map((p) => p.querySelector('k-list')).find(Boolean);
      const row = list && (list.shadowRoot.querySelector('[data-id="10"] [data-row]') || list.shadowRoot.querySelector('[data-id="10"][data-row]'));
      if (!row) return false;
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      row.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
      row.click();
      return true;
    });
    await sleep(250);
    const tip = Math.round(due * 10) / 100;
    check(picked && await page.evaluate(() => payTipPct() === 10), 'the tip popover\'s 10 % reaches the shipped tip state');
    check(await page.evaluate((v) => Math.abs(document.querySelector('k-pay').owed() - v) < 0.005, due + tip), `the key figure is base + tip (${due} + ${tip})`);

    /* Cash, Exact, Confirm. */
    await tap('[data-method="cash"]');
    await sleep(200);
    await tap('[data-chip]');
    await sleep(200);
    await tap('[data-w="confirm"]');
    await sleep(600);
    const s1 = await page.evaluate(() => { const e = lastSaleEntry(); return e && { amount: e.amount, method: e.method, tip: e.tip }; });
    check(s1 && s1.method === 'cash' && Math.abs(s1.amount - due) < 0.005 && Math.abs(s1.tip - tip) < 0.005, `the cash sale is recorded: ${JSON.stringify(s1)}`);
    check(await page.evaluate(() => cart.length === 0), 'the takeaway cart is settled');
    check(await page.evaluate(() => document.querySelector('k-pay').getAttribute('state') === 'paid'), 'the pane shows the paid moment');
    await sleep(1400);
    check(await page.evaluate(() => document.querySelector('k-pay').hidden && !document.querySelector('k-bill').hidden), 'and goes back to the bill');

    /* Card: record only. Other: the wallet method. */
    for (const [kind, method] of [['card', 'card'], ['other', 'wallet']]) {
      await charge();
      const before = await page.evaluate(() => journal.length);
      await tap(`[data-method="${kind}"]`);
      await sleep(200);
      await tap('[data-w="confirm"]');
      await sleep(600);
      const s = await page.evaluate(() => { const e = lastSaleEntry(); return e && { amount: e.amount, method: e.method, tip: e.tip }; });
      const after = await page.evaluate(() => journal.length);
      check(s && s.method === method && after === before + 1, `${kind} is recorded once as ${method} (${JSON.stringify(s)})`);
      await sleep(1400);
    }

    /* Back gives the bill back untouched. */
    await charge();
    await tap('[data-method="card"]');
    await sleep(200);
    await tap('[data-w="back"]');
    await sleep(300);
    check(await page.evaluate(() => document.querySelector('k-pay').pay.method == null), 'Back from a method returns to the method list');
    check(await page.evaluate(() => !document.querySelector('k-pay').hidden), 'and the pane stays out');
    await tap('[data-w="leave"]');
    await sleep(300);
    check(await page.evaluate(() => document.querySelector('k-pay').hidden && !document.querySelector('k-bill').hidden), 'the header Back leaves the payment for the bill');
    check(await page.evaluate(() => cart.length === 1), 'and the bill is still there to pay');
    check(errors.length === 0, 'payment: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  await S.run('flag on · split and discount inside the pane, through the shipped flows', async (tr) => {
    const { page, errors } = await till(tr, { flag: true });
    const tapIn = (host, sel) => page.evaluate((h, s) => {
      const el = document.querySelector(h).shadowRoot.querySelector(s);
      if (!el) return false;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
      el.click();
      return true;
    }, host, sel);
    const shown = (tag) => page.evaluate((t) => { const el = document.querySelector(t); return !!el && !el.hidden; }, tag);
    const plain = (await tiles(page)).find((t) => !t.opts && !t.out);
    await tapTile(page, plain.id); await sleep(150);
    await tapTile(page, plain.id); await sleep(150);
    await tapTile(page, plain.id); await sleep(250);
    const total = await page.evaluate(() => currentTotal());

    /* Split equally in two: 3 × the dish does not divide evenly in cents
       only when it is odd; whatever it is, the shares sum to the total. */
    await tapIn('k-bill', '[data-w="split"]');
    await sleep(400);
    check(await shown('k-split') && !(await shown('k-bill')) && !(await page.evaluate(() => document.querySelector('#split-modal').classList.contains('is-open'))),
      'Split pushes <k-split> over the bill; the shipped split window stays shut');
    const shares = await page.evaluate(() => document.querySelector('k-split').shares());
    check(shares.length === 2 && shares.reduce((a, b) => a + b, 0) === Math.round(total * 100) && Math.abs(shares[0] - shares[1]) <= 1,
      `two equal shares sum to the total to the cent (${shares.join(' + ')} = ${Math.round(total * 100)})`);
    const before = await page.evaluate(() => journal.length);

    await tapIn('k-split', '[data-w="pay"]');
    await sleep(450);
    check(await shown('k-pay') && !(await shown('k-split')), 'Charge share 1 opens the payment pane');
    check(await page.evaluate((s) => Math.abs(document.querySelector('k-pay').pay.due - s / 100) < 0.005, shares[0]), 'for share 1\'s amount');
    await tapIn('k-pay', '[data-method="cash"]'); await sleep(150);
    await tapIn('k-pay', '[data-chip]'); await sleep(150);
    await tapIn('k-pay', '[data-w="confirm"]'); await sleep(1700);
    check(await shown('k-split') && await page.evaluate(() => JSON.stringify(document.querySelector('k-split').paidShares) === '[1]'),
      'share 1 paid, the split comes back with share 1 marked');

    await tapIn('k-split', '[data-w="pay"]');
    await sleep(450);
    check(await page.evaluate((s) => Math.abs(document.querySelector('k-pay').pay.due - s / 100) < 0.005, shares[1]), 'the next share is share 2, for its amount');
    await tapIn('k-pay', '[data-method="card"]'); await sleep(150);
    await tapIn('k-pay', '[data-w="confirm"]'); await sleep(1700);
    const recs = await page.evaluate((b) => journal.slice(0).filter((e, i, a) => true).length - b, before);
    const sales = await page.evaluate(() => journal.slice(-2).map((e) => ({ amount: e.amount, method: e.method })));
    check(recs >= 2 && sales.map((s) => s.method).sort().join() === 'card,cash' &&
      Math.round((sales[0].amount + sales[1].amount) * 100) === Math.round(total * 100),
      `two sales, cash and card, summing to the total (${JSON.stringify(sales)})`);
    check(!(await shown('k-split')) && await shown('k-bill') && await page.evaluate(() => cart.length === 0), 'every share paid: the bill is settled and back');

    /* Discount 10 %, commercial, approved on the kit's manager pad. */
    await tapTile(page, plain.id); await sleep(150);
    await tapTile(page, plain.id); await sleep(250);
    const gross = await page.evaluate(() => currentTotal());
    await tapIn('k-bill', '[data-w="discount"]');
    await sleep(400);
    check(await shown('k-discount') && !(await shown('k-bill')), 'Discount pushes <k-discount> over the bill');
    await tapIn('k-discount', '[data-chip="10"]'); await sleep(150);
    check(await page.evaluate(() => document.querySelector('k-discount').shadowRoot.querySelector('[data-w="apply"]').disabled === true ||
      document.querySelector('k-discount').shadowRoot.querySelector('[data-w="apply"]').getAttribute('aria-disabled') === 'true'), 'Apply waits for a reason');
    await tapIn('k-discount', '[data-reasons] [data-chip="commercial"]'); await sleep(150);
    await tapIn('k-discount', '[data-w="apply"]'); await sleep(500);
    const padOpen = await page.evaluate(() => !!document.querySelector('k-pin-pad'));
    check(padOpen, 'Apply asks for the manager\'s code on the kit pad');
    for (const k of ['1', '2', '3', '4']) {
      await page.evaluate((key) => {
        const pad = [...document.querySelectorAll('k-pin-pad')].pop();
        const b = pad && pad.shadowRoot.querySelector(`[data-key="${key}"]`);
        if (!b) return;
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
        b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
        b.click();
      }, k);
      await sleep(120);
    }
    await sleep(1200);
    const disc = await page.evaluate(() => vrapDiscount && { kind: vrapDiscount.kind, value: vrapDiscount.value, amount: vrapDiscount.amount, reason: vrapDiscount.reason });
    check(disc && disc.kind === 'pct' && disc.value === 10 && Math.abs(disc.amount - Math.round(gross * 10) / 100) < 0.005 && disc.reason === 'Geste commercial',
      `the approved discount is the shipped one: ${JSON.stringify(disc)}`);
    const v = await billView(page);
    check(Math.abs(amount(v.total) - (gross - disc.amount)) < 0.005 && await page.evaluate(() => !!document.querySelector('k-bill').shadowRoot.querySelector('[data-k-part]')),
      `the bill shows the discount line and the net total (${v.total})`);
    check(errors.length === 0, 'split and discount: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ till-frame-browser-test · ${checks} checks`);
await S.finish();
