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
async function till(tr, { flag, lang }) {
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
  await page.evaluateOnNewDocument((on, lg) => {
    if (on) localStorage.setItem('kiwiSkin2027:till', '1');
    if (lg) localStorage.setItem('kiwiCaisseLang', lg);
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag, lang || '');
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  /* Takeaway: on the kit's rail with the flag on (the shipped sidebar is
     hidden then), on the shipped mode pill with it off. */
  if (flag) {
    await page.waitForFunction(() => { const r = document.querySelector('k-rail'); return r && r.shadowRoot.querySelector('[data-id="takeaway"]'); }, { timeout: 20000 });
    await page.evaluate(() => document.querySelector('k-rail').shadowRoot.querySelector('[data-id="takeaway"]').click());
  } else await page.click('.mode-pill[data-mode="vrap"]');
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

  /* 23 octobre : le ⋯ de l'addition émettait k.bill.overflow et personne ne
     l'écoutait. Il n'apparaît plus que s'il a quelque chose à offrir, et ce
     qu'il offre passe par le contrôle livré (ici, vider : le code d'abord). */
  await S.run('flag on · the bill\'s ⋯ opens its menu, or is not there', async (tr) => {
    const { page, errors } = await till(tr, { flag: true });
    const hasMore = () => page.evaluate(() => !!document.querySelector('k-bill').shadowRoot.querySelector('#mo'));
    check(!(await hasMore()), 'an empty takeaway bill has no ⋯ (nothing to offer)');
    const plain = (await tiles(page)).find((t) => !t.opts && !t.out);
    await tapTile(page, plain.id);
    await sleep(300);
    check(await hasMore(), 'with a line, the ⋯ is there');
    await page.evaluate(() => document.querySelector('k-bill').shadowRoot.querySelector('#mo').click());
    await sleep(400);
    const rows = await page.evaluate(() => { const p = [...document.querySelectorAll('k-popover')].find((x) => x.hasAttribute('open')); return p ? [...p.querySelectorAll('k-button')].map((b) => b.getAttribute('data-row')) : null; });
    check(rows && rows.length === 1 && rows[0] === 'clear', 'the ⋯ opens a menu with Clear the bill (' + JSON.stringify(rows) + ')');
    const opened = page.evaluate(() => new Promise((res) => { document.addEventListener('kiwi:approval-open', (e) => res(e.detail && e.detail.act), { once: true }); setTimeout(() => res(null), 3000); }));
    await page.evaluate(() => { const p = [...document.querySelectorAll('k-popover')].find((x) => x.hasAttribute('open')); const b = p.querySelector('k-button[data-row="clear"]'); b.dispatchEvent(new CustomEvent('kiwi:action', { bubbles: true, composed: true, detail: { action: 'k.button.press' } })); });
    check(await opened === 'clear_order', 'Clear asks for a code first, through the shipped guard');
    check(await page.evaluate(() => cart.length === 1), 'and nothing is cleared before the code');
    check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
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

  await S.run('flag on · the rail and More', async (tr) => {
    const { page, errors } = await till(tr, { flag: true });
    const railIds = await page.evaluate(() => [...document.querySelector('k-rail').shadowRoot.querySelectorAll('[data-id]')].map((b) => b.getAttribute('data-id')));
    check(await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).display === 'none'), 'the shipped sidebar is hidden');
    check(railIds.join() === 'floor,takeaway,waiting,kitchen,clients,more', `the rail: ${railIds.join(', ')}`);
    check(await page.evaluate(() => mode === 'vrap' && document.querySelector('k-rail').getAttribute('value') === 'takeaway'), 'Takeaway on the rail is the takeaway mode, and the rail says so');
    await page.evaluate(() => document.querySelector('k-rail').shadowRoot.querySelector('[data-id="floor"]').click());
    await sleep(300);
    check(await page.evaluate(() => mode === 'salle' && document.querySelector('k-rail').getAttribute('value') === 'floor'), 'Floor switches to the floor plan');
    /* Plus déplie la barre latérale livrée (propriétaire, 2026-10-16) : à
       partir de 1000 de large, Plus ne tire plus de feuille, il sort le
       panneau noir à côté du rail et devient Moins ; on le referme par Moins
       ou par un toucher ailleurs, que le voile prend. */
    const railMore = () => page.evaluate(() => {
      const it = document.querySelector('k-rail').shadowRoot.querySelector('[data-id="more"]');
      return { label: it.textContent.trim(), open: document.documentElement.hasAttribute('data-k-till-more') };
    });
    const panel = () => page.evaluate(() => {
      const sb = document.querySelector('.sidebar'), cs = getComputedStyle(sb), b = sb.getBoundingClientRect();
      const rail = document.getElementById('kit-rail').getBoundingClientRect();
      const scrim = document.getElementById('kit-more-scrim');
      const nav = document.querySelector('.sidebar > k-sidebar');
      const pills = document.querySelector('.sidebar > .mode-selector');
      return { display: cs.display, x: Math.round(b.x), width: Math.round(b.width), height: Math.round(b.height),
        railWidth: Math.round(rail.width), railShown: getComputedStyle(document.querySelector('#kit-rail > k-rail')).visibility,
        scrim: scrim ? getComputedStyle(scrim).pointerEvents : null,
        navIds: nav && getComputedStyle(nav).display !== 'none'
          ? [...nav.shadowRoot.querySelectorAll('[data-id]')].map((b2) => b2.getAttribute('data-id')) : null,
        navValue: nav ? nav.getAttribute('value') : null,
        pillsShown: pills ? getComputedStyle(pills).visibility : null };
    });
    check((await railMore()).label === 'Plus' && (await panel()).display === 'none', 'before Plus, the rail says Plus and the shipped sidebar is away');
    await page.evaluate(() => document.querySelector('k-rail').shadowRoot.querySelector('[data-id="more"]').click());
    await sleep(700);
    const out = await panel();
    check(out.display === 'flex' && out.width === 260 && out.x === 0 && out.height === 1024 && out.railWidth === 88,
      `Plus puts the shipped sidebar in the rail's own place, 260 wide (${JSON.stringify(out)})`);
    check(out.railShown === 'hidden', 'the rail steps back under it, its 88 still in the layout so nothing reflows');
    check(out.navIds && out.navIds.join() === 'floor,takeaway,waiting,kitchen,clients,more' && out.navValue === 'floor',
      `the panel's head carries the same destinations as the rail (${out.navIds && out.navIds.join(', ')})`);
    check(out.pillsShown === 'hidden', "and the shipped mode pills, which repeat three of them, are not drawn twice");
    check(out.scrim === 'auto', 'the scrim takes the taps meant for elsewhere');
    const moinsOut = await railMore();
    check(moinsOut.label === 'Moins' && moinsOut.open, 'and the same rail item now reads Moins');
    check(await page.evaluate(() => document.querySelector('k-rail').getAttribute('value') === 'floor'),
      'the lens stays on the destination, so Moins can be tapped again (Plus is not one)');
    /* Le panneau EST la barre livrée : ses contrôles sont ceux de la page. */
    check(await page.evaluate(() => {
      const el = document.querySelector('.sidebar [data-action="cash-move"]');
      if (!el) return false;
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2));
      return b.width > 0 && b.height > 0 && !!hit && el.contains(hit);
    }), 'a shipped control inside it (Cash in or out) is on screen and takes the tap');
    check(await page.evaluate(() => {
      const nav = document.querySelector('.sidebar > k-sidebar');
      return nav.shadowRoot.querySelector('[data-id="more"]').textContent.trim() === 'Moins';
    }), 'the last of them reads Moins');
    await page.evaluate(() => document.querySelector('.sidebar > k-sidebar').shadowRoot.querySelector('[data-id="more"]').click());
    await sleep(700);
    check((await panel()).display === 'none' && (await railMore()).label === 'Plus', 'Moins puts it away again and the rail comes back');
    await page.evaluate(() => document.querySelector('k-rail').shadowRoot.querySelector('[data-id="more"]').click());
    await sleep(700);
    await page.evaluate(() => document.getElementById('kit-more-scrim').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await sleep(700);
    check((await panel()).display === 'none' && !(await railMore()).open, 'a tap anywhere else puts it away too');
    /* Sous 1000, pas la place d'un panneau de 260 à côté du rail : Plus garde
       la feuille, la route du téléphone (§18.3). */
    await page.setViewport({ width: 834, height: 1024 });
    await sleep(400);
    await page.evaluate(() => document.querySelector('k-rail').shadowRoot.querySelector('[data-id="more"]').click());
    await sleep(400);
    const more = await page.evaluate(() => {
      const sheet = [...document.querySelectorAll('k-sheet')].find((s) => s.hasAttribute('open') && s.querySelector('k-list'));
      if (!sheet) return null;
      return { lists: sheet.querySelectorAll('k-list').length,
        rows: [...sheet.querySelectorAll('k-list')].flatMap((l) => (l.rows || []).map((r) => r.id)) };
    });
    check(more && more.lists === 3, `More opens in three sections (${more && more.lists})`);
    check(more && ['open_drawer', 'cash_in_out', 'cancel_sale', 'refund', 'close', 'stock', 'reload'].every((id) => more.rows.includes(id)),
      `and holds the old sidebar's acts (${more && more.rows.join(', ')})`);
    const fired = await page.evaluate(() => new Promise((resolve) => {
      const el = document.querySelector('[data-action="cash-move"]');
      el.addEventListener('click', () => resolve(true), { once: true });
      const sheet = [...document.querySelectorAll('k-sheet')].find((s) => s.hasAttribute('open') && s.querySelector('k-list'));
      const list = [...sheet.querySelectorAll('k-list')].find((l) => (l.rows || []).some((r) => r.id === 'cash_in_out'));
      const row = list.shadowRoot.querySelector('[data-id="cash_in_out"] [data-row]') || list.shadowRoot.querySelector('[data-id="cash_in_out"][data-row]');
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      row.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
      row.click();
      setTimeout(() => resolve(false), 1500);
    }));
    check(fired, 'a More row fires its shipped control (Cash in or out)');
    /* 24 octobre : fermée par Échap, la feuille laissait la lentille du rail
       sur Plus. Plus n'est pas une destination. */
    await page.evaluate(() => [...document.querySelectorAll('k-sheet[open]')].forEach((s) => s.removeAttribute('open')));
    await page.evaluate(() => document.querySelector('k-rail').shadowRoot.querySelector('[data-id="more"]').click());
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(400);
    const cur = await page.evaluate(() => {
      const it = document.querySelector('k-rail').shadowRoot.querySelector('[aria-current="page"]');
      return { id: it && it.getAttribute('data-id'), open: !!document.querySelector('k-sheet[open] k-list') };
    });
    check(!cur.open && cur.id && cur.id !== 'more', `closed by Escape, More gives the lens back to the mode (${cur.id})`);
    check(errors.length === 0, 'rail: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  /* L'en-tête de l'addition restait en français sur la caisse arabe : le
     volet livré se traduit après que le kit l'a lu (propriétaire, 2026-10-24).
     Et le total n'y est pas répété : l'addition le montre en bas. */
  await S.run('flag on · Arabic: the bill header is in Arabic, without the total again', async (tr) => {
    const { page, errors } = await till(tr, { flag: true, lang: 'ar' });
    const plain = (await tiles(page)).find((t) => !t.opts && !t.out);
    await tapTile(page, plain.id);
    await sleep(300);
    const head = await page.evaluate(() => ({ title: document.querySelector('k-bill').bill.title, meta: document.querySelector('k-bill').bill.meta }));
    check(head.title && !/[A-Za-zÀ-ÿ]{3,}/.test(head.title), `the bill's title is translated (${head.title})`);
    check(!/MAD/.test(head.meta), `the header does not repeat the total (${head.meta})`);
    check(errors.length === 0, 'arabic header: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

  /* Cuisine s'ouvre à côté du rail, comme Salle, À emporter et Attente
     (propriétaire, 2026-10-22) : elle couvrait toute la fenêtre, rail compris. */
  await S.run('flag on · Cuisine opens beside the rail, like the other pages', async (tr) => {
    const { page, errors } = await till(tr, { flag: true });
    const tapRail = (id) => page.evaluate((i) => document.querySelector('k-rail').shadowRoot.querySelector(`[data-id="${i}"]`).click(), id);
    const view = () => page.evaluate(() => {
      const kds = document.getElementById('kds-screen');
      const k = kds.getBoundingClientRect();
      const rail = document.getElementById('kit-rail').getBoundingClientRect();
      const kitchenItem = document.querySelector('k-rail').shadowRoot.querySelector('[data-id="kitchen"]').getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(kitchenItem.x + kitchenItem.width / 2), Math.round(kitchenItem.y + kitchenItem.height / 2));
      return { open: kds.classList.contains('is-open'), x: Math.round(k.x), right: Math.round(k.right), width: innerWidth,
        railRight: Math.round(rail.right), railTakesTap: !!hit && !!hit.closest('#kit-rail'),
        value: document.querySelector('k-rail').getAttribute('value'),
        closeShown: getComputedStyle(document.getElementById('kds-close-btn')).display !== 'none',
        modal: kds.getAttribute('aria-modal'), role: kds.getAttribute('role') };
    });
    /* Mid-payment, Cuisine left the payment floating over the kitchen while
       the rail said Cuisine (owner, 2026-10-24): another page leaves it, the
       bill stays. */
    const plain = (await tiles(page)).find((t) => !t.opts && !t.out);
    await tapTile(page, plain.id);
    await sleep(200);
    await page.evaluate(() => document.querySelector('k-bill').shadowRoot.querySelector('[data-w="pay"]').click());
    await sleep(450);
    check(await page.evaluate(() => window.KiwiTillFrame.paying()), 'set-up: the payment is out');
    await tapRail('kitchen');
    await sleep(400);
    check(await page.evaluate(() => !window.KiwiTillFrame.paying() && cart.length === 1),
      'Cuisine during a payment leaves the payment and keeps the bill');
    const v = await view();
    check(v.open && v.value === 'kitchen', `Cuisine on the rail opens the kitchen, and the rail says so (${v.value})`);
    check(v.x === v.railRight && v.right === v.width, `the kitchen fills the page beside the rail, not the window (${v.x}..${v.right}, rail ends at ${v.railRight})`);
    check(v.railTakesTap, 'the rail stays on screen and takes the tap');
    check(!v.closeShown, 'no Fermer in its header: the rail is the way out, as on the other pages');
    check(v.modal === null && v.role === 'region', `the kitchen is a page, not a modal window (role ${v.role}, aria-modal ${v.modal})`);
    await tapRail('more');
    await sleep(700);
    check(await page.evaluate(() => {
      const el = document.querySelector('.sidebar [data-action="cash-move"]');
      if (!el) return false;
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2));
      return b.width > 0 && !!hit && el.contains(hit);
    }), 'Plus still opens its panel over the kitchen');
    await page.evaluate(() => document.getElementById('kit-more-scrim').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await sleep(700);
    await tapRail('floor');
    await sleep(400);
    const back = await view();
    check(!back.open && back.value === 'floor' && await page.evaluate(() => mode === 'salle'), 'Salle on the rail leaves the kitchen for the floor plan');

    /* An iPad in portrait is not a phone: Cuisine and Clients covered the
       rail there, grew a close button, and the bill's bar sat over their
       foot (owner, 2026-10-24). */
    await page.setViewport({ width: 820, height: 1180 });
    await sleep(500);
    await tapRail('takeaway');
    await sleep(400);
    await tapRail('kitchen');
    await sleep(500);
    const port = await view();
    const sheetShown = () => page.evaluate(() => { const r = document.querySelector('.rightpanel'); return !!r && getComputedStyle(r).display !== 'none' && r.getBoundingClientRect().height > 0; });
    check(port.open && port.x === port.railRight && !port.closeShown, `iPad portrait: the kitchen opens beside the rail, without Fermer (${port.x}, rail ends at ${port.railRight})`);
    check(!(await sheetShown()), 'iPad portrait: no bill bar over the kitchen');
    await tapRail('clients');
    await sleep(700);
    const book = await page.evaluate(() => { const r = document.getElementById('kcb-root'); const b = document.getElementById('kcb-back'); return { left: Math.round(r.getBoundingClientRect().left), back: getComputedStyle(b).display }; });
    check(book.left === port.railRight && book.back === 'none', `iPad portrait: the customer book opens beside the rail, without a cross (${book.left}, ${book.back})`);
    check(!(await sheetShown()), 'iPad portrait: no bill bar under the customer book');
    await tapRail('takeaway');
    await sleep(600);
    check(await sheetShown(), 'iPad portrait: back on À emporter, the bill bar is back');
    check(errors.length === 0, 'kitchen beside the rail: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });
  /* Le carnet clients sur le rail, et plus de pastille « Clients » posée sur
     l'écran (propriétaire, 2026-10-23). */
  await S.run('flag on · Clients is on the rail, never a floating tag', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = tr.watch(await ctx.newPage());
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
    await page.waitForFunction(() => typeof doOpenService === 'function' && window.KiwiClientsBook && document.documentElement.hasAttribute('data-k-till'), { timeout: 30000 });
    /* The chip's other conditions met: a paired till with a client book. */
    await page.evaluate(() => {
      if (window.KiwiCaissePairing) window.KiwiCaissePairing.isPaired = () => true;
      window.KiwiClients.bookId = () => 'test-book';
    });
    const chip = () => page.evaluate(() => { KiwiClientsBook.ensureChip(); return !!document.getElementById('kcb-chip'); });
    /* Without the kit's rail and with no host on screen, only the rule under test is left. */
    const bare = (on) => page.evaluate((o) => {
      const h = document.documentElement;
      if (o) { h.removeAttribute('data-k-till'); const s = document.createElement('style'); s.id = 't-bare'; s.textContent = '.sidebar,.act-selector,nav[class$="-nav"]{display:none!important}'; document.head.appendChild(s); }
      else { h.setAttribute('data-k-till', ''); document.getElementById('t-bare')?.remove(); }
    }, on);
    await page.evaluate(() => doOpenService());
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
    await sleep(400);
    check(!(await chip()), 'unlocked, the 2027 till draws no floating tag: the rail carries Clients');
    await bare(true);
    check(await chip(), 'a layout with no rail still gets the tag (the fallback stays)');
    await bare(false);
    await chip();
    const tapRail = (id) => page.evaluate((i) => document.querySelector('k-rail').shadowRoot.querySelector(`[data-id="${i}"]`).click(), id);
    const view = () => page.evaluate(() => {
      const root = document.getElementById('kcb-root');
      const open = !!root && root.style.display !== 'none';
      const r = open ? root.getBoundingClientRect() : null;
      const item = document.querySelector('k-rail').shadowRoot.querySelector('[data-id="clients"]');
      return { open, item: !!item, label: item ? item.textContent.trim() : '', x: r ? Math.round(r.x) : -1,
        railRight: Math.round(document.getElementById('kit-rail').getBoundingClientRect().right),
        value: document.querySelector('k-rail').getAttribute('value') };
    });
    let v = await view();
    check(v.item && /Clients/.test(v.label), `the rail has a Clients entry (${v.label})`);
    await tapRail('clients');
    await sleep(400);
    v = await view();
    check(v.open && v.value === 'clients', `Clients on the rail opens the client book, and the rail says so (${v.value})`);
    check(Math.abs(v.x - v.railRight) <= 1, `the book opens beside the rail (${v.x}, rail ends at ${v.railRight})`);
    await tapRail('floor');
    await sleep(400);
    v = await view();
    check(!v.open && v.value === 'floor', 'Salle on the rail leaves the book for the floor plan');
    await tapRail('clients');
    await sleep(400);
    await page.evaluate(() => document.getElementById('kcb-back').click());
    await sleep(300);
    v = await view();
    check(!v.open && v.value !== 'clients', `closing the book by its own button gives the rail back its page (${v.value})`);
    check(errors.length === 0, 'clients on the rail: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  });

} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ till-frame-browser-test · ${checks} checks`);
await S.finish();
