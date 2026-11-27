#!/usr/bin/env node
/* wallet-till-browser-test · the Wallet card at a real paired restaurant till
 * (assets/wallet-till.js), synthetic server only.
 *
 *   node tools/wallet-till-browser-test.mjs
 *
 * What this holds, with real key bursts and real clicks:
 *   · a scanner burst « KIWI-C:<id> » on an open takeaway note puts that client
 *     on the note, and the menu never sees it as a search or an article;
 *   · the same card read by a scanner set to a US keyboard (« KIZI-CM… », the
 *     A of the id typed as Q) finds the same kind of client;
 *   · with the card turned on for the shop, a wallet button sits beside the
 *     client on the note; it asks /api/wallet/till-token for THIS client and
 *     shows the QR the customer scans; Escape closes it. */
import assert from 'node:assert/strict';
import { harness, realPage } from './surface-matrix-lib.mjs';

const h = await harness('wallet-till');
const merchant = 'matrix-real';

async function click(page, selector) {
  const target = page.locator(selector).setTimeout(20000);
  await target.wait();
  await target.click();
}
const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getBoundingClientRect().width > 0; }, sel);

try {
  await h.S.run('wallet card at the restaurant till · fr · tablet', async (t) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=tablet
    const tokens = [];
    const clients = [{ id: 'recovery', name: 'Nora Recovery', stamps: 3, updated_ts: 1 }, { id: 'accepted', name: 'Sami Accepted', stamps: 7, updated_ts: 1 }];
    const program = { model: 'visit', visit: { target: 10, reward: 'Café' } };
    const routes = {
      'GET /api/me': { authenticated: true, onboarded: true, stores: [{ merchant, name: 'Matrix Kitchen', type: 'restaurant' }] },
      'GET /api/config': { name: 'Matrix Kitchen', type: 'restaurant', pins: [], features: { loyalty: true, crm: true } },
      'GET /api/pair/state': { ok: true, paired: true, merchant },
      'GET /api/menu': { menu: { cats: [{ id: 'drinks', name: 'Boissons' }], items: [{ id: 'cafe', name: 'Café', price: 20, catId: 'drinks', avail: true }] } },
      'GET /api/feed': { events: [], sales: [] },
      'GET /api/team/live': { members: [] },
      'GET /api/clients': { clients, cursor: 1, more: false },
      'GET /api/store': (req) => ({ status: 200, body: { ok: true, data: new URL(req.url()).searchParams.get('feature') === 'fidelity' ? program : null } }),
      'POST /api/clients': { ok: true },
      'GET /api/wallet/enroll': { merchant: { slug: merchant, name: 'Matrix Kitchen' }, program: { model: 'visit', target: 10 } },
      'POST /api/wallet/till-token': (req) => { tokens.push(JSON.parse(req.postData())); return { status: 200, body: { ok: true, url: h.base + '/carte/' + merchant + '?t=abcdefghijklmnop', expiresIn: 600 } }; },
    };
    const { ctx, page } = await realPage(h, 'fr', 'tablet', routes, {
      kiwiPaired: '1', kiwiPairedVenue: JSON.stringify({ merchant, venueId: merchant, name: 'Matrix Kitchen', type: 'restaurant' }),
      ['kiwi:fidelity:v1:' + merchant]: JSON.stringify(program),
    });
    t.defer(() => ctx.close()); t.watch(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    t.step('boot the paired till and open a takeaway note');
    await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => {
      const screen = document.querySelector('#clockin-screen'), pin = document.querySelector('#pin-screen');
      return screen?.classList.contains('is-visible') && (!pin || getComputedStyle(pin).display === 'none') &&
        screen.getAnimations().every((a) => a.playState === 'finished');
    }, { timeout: 10000 });
    await click(page, '.ci-float-chip[data-float="300"]');
    await page.waitForFunction(() => !document.querySelector('#clockin-btn').disabled);
    await click(page, '#clockin-btn');
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('.kiwi-greet.is-visible'));
    await page.waitForFunction(() => window.KiwiClients?.get('recovery') && window.KiwiWalletTill);
    await click(page, '.mode-pill[data-mode="vrap"]');
    await page.waitForFunction(() => ['#vrap-new-order', '.menu-item[data-menu-id="cafe"]'].some((s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect().width > 0; }));
    if (await shown(page, '#vrap-new-order')) await click(page, '#vrap-new-order');
    await click(page, '.menu-item[data-menu-id="cafe"]');
    assert.equal(await page.evaluate(() => window.KiwiCaisseSaleClient.current()), null);

    t.step('a scanner burst puts the card holder on the note');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.type('KIWI-C:recovery');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.KiwiCaisseSaleClient.current() === 'recovery');
    assert.match(await page.$eval('#rp-client-label', (e) => e.textContent), /Nora Recovery/);

    t.step('the same kind of card from a US-keyboard scanner');
    /* US-mode scanner on a French layout: the Minus key, Z for W, M for « : », Q for A. */
    await page.keyboard.type('KIZI'); await page.keyboard.press('Minus'); await page.keyboard.type('CMqccepted');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.KiwiCaisseSaleClient.current() === 'accepted');
    assert.match(await page.$eval('#rp-client-label', (e) => e.textContent), /Sami Accepted/);

    t.step('the wallet button beside the client shows the till QR for this client');
    await page.waitForSelector('#rp-client .kw-wt-chip', { visible: true });
    await click(page, '#rp-client .kw-wt-chip');
    await page.waitForSelector('.kw-wt-sheet .kw-wt-qr svg', { visible: true });
    assert.deepEqual(tokens, [{ merchant, clientId: 'accepted' }]);
    assert.match(await page.$eval('.kw-wt-sheet h2', (e) => e.textContent), /Sami Accepted/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.kw-wt-veil'));
    assert.deepEqual(errors, [], 'no page error');
  });
} finally { await h.close(); await h.S.finish(); }
