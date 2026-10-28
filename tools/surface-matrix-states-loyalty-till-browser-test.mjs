#!/usr/bin/env node
// Paired REAL restaurant, synthetic server only; public card and till payment taps.
import assert from 'node:assert/strict';
import { harness, realPage, sleep, verify } from './surface-matrix-lib.mjs';
const h = await harness('surface-matrix-states-loyalty-till');
const merchant = 'matrix-real';
const queueKey = 'kiwi:clients-redemptions:v1:' + merchant;
// A locator click waits until the control is visible, enabled and no longer
// moving, so a panel that is still sliding in is not hit mid-transition.
async function click(page, selector) {
  const target = page.locator(selector).setTimeout(20000);
  await target.wait();
  // A drawer still sliding away covers the control without moving it.
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel); if (!el) return false;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (el === hit || el.contains(hit));
  }, { timeout: 20000 }, selector).catch(async (e) => {
    const on = await page.evaluate((sel) => { const el = document.querySelector(sel), r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit ? hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') + '.' + String(hit.className).split(' ')[0] : 'nothing'; }, selector).catch(() => '?');
    e.message = `${selector} stays covered by ${on} · ${e.message}`; throw e;
  });
  await target.click();
}
// Phone: the side menu stays open over the till until the dimmed area beside
// it is tapped, like a person closing it.
async function closeNav(page) {
  if (!(await page.evaluate(() => document.body.classList.contains('nav-open')))) return;
  const at = await page.evaluate(() => {
    const scrim = document.querySelector('.kw-scrim'), y = innerHeight / 2;
    for (let x = innerWidth - 8; x > 8; x -= 8) if (document.elementFromPoint(x, y) === scrim) return { x, y };
    for (let x = 8; x < innerWidth - 8; x += 8) if (document.elementFromPoint(x, y) === scrim) return { x, y };
    return null;
  });
  assert.ok(at, 'the dimmed area beside the phone menu can be tapped');
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => !document.body.classList.contains('nav-open'));
}
/* The till screens carry three accessibility defects that predate the counter
   reward and sit outside it: the menu cards and the client chip nest a control
   inside a button, and the French « Détails » button is named otherwise. They
   are pinned here so they can only go down; fixing them lowers these numbers. */
const tillKnown = (locale) => ({ 'nested-interactive': 3, ...(locale === 'fr' ? { 'label-content-name-mismatch': 1 } : {}) });
async function check(t, page, state, locale, viewport) {
  const key = `matrix-state-loyalty-till-${state}-${locale}-${viewport}`;
  await sleep(150);
  await verify({ ...h, baseline: { ...h.baseline, [key]: state === 'card' ? {} : tillKnown(locale) } }, t,
    { page, region: state === 'card' ? '#kcb-sheet' : 'body' }, key, locale);
}
async function open(t, locale, viewport) {
  let mode = 'refused';
  const attempts = [];
  const sales = [];
  const clients = ['recovery', 'accepted', 'offline'].map((id) => ({ id, name: 'Nora ' + id, points: 100, stamps: 10, updated_ts: 1 }));
  // A full Croissant card gives one Croissant: the note carries one, plus a coffee.
  const program = { model: 'product', visit: { target: 10, reward: 'Café' }, amount: { threshold: 100 }, product: { target: 10, item: 'Croissant', reward: '1 offert' } };
  const routes = {
    'GET /api/me': { authenticated: true, onboarded: true, stores: [{ merchant, name: 'Matrix Kitchen', type: 'restaurant' }] },
    'GET /api/config': { name: 'Matrix Kitchen', type: 'restaurant', pins: [], features: { loyalty: true, crm: true } },
    'GET /api/pair/state': { ok: true, paired: true, merchant },
    // The public carte, in the shape the till reads (assets/caisse/catalogue.js).
    'GET /api/menu': { menu: { cats: [{ id: 'drinks', name: 'Boissons' }], items: [{ id: 'cafe', name: 'Café', price: 20, catId: 'drinks', avail: true },
      { id: 'croissant', name: 'Croissant', price: 20, catId: 'drinks', avail: true }] } },
    'POST /api/sale': (req) => { sales.push(JSON.parse(req.postData())); return { status: 200, body: { ok: true } }; },
    'GET /api/feed': { events: [], sales: [] },
    'GET /api/team/live': { members: [] },
    'GET /api/clients': { clients, cursor: 1, more: false },
    'GET /api/store': (req) => ({ status: 200, body: { ok: true, data:
      new URL(req.url()).searchParams.get('feature') === 'fidelity' ? program : null } }),
    'POST /api/clients': (req) => {
      const body = JSON.parse(req.postData() || '{}');
      assert.equal(body.merchant, merchant);
      if (!body.redemption) return { status: 200, body: { ok: true } };
      attempts.push({ ...body.redemption, mode });
      if (mode === 'offline') return { abort: 'internetdisconnected' };
      return mode === 'refused' ? { status: viewport === 'phone' ? 409 : 422, body: { error: 'reward-not-ready' } }
        : { status: 200, body: { ok: true } };
    },
  };
  const { ctx, page } = await realPage(h, locale, viewport, routes, {
    kiwiPaired: '1', kiwiPairedVenue: JSON.stringify({ merchant, venueId: merchant, name: 'Matrix Kitchen', type: 'restaurant' }),
    ['kiwi:fidelity:v1:' + merchant]: JSON.stringify(program),
  });
  t.defer(() => ctx.close()); t.watch(page);
  t.step('boot a paired REAL restaurant with no staff gate configured');
  await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  // Paired boot uses the normal restaurant opening-float screen.
  // Geometry alone considers the transparent clock-in screen visible while
  // the PIN screen still owns pointer events during the boot cross-fade.
  await page.waitForFunction(() => {
    const screen = document.querySelector('#clockin-screen');
    const pin = document.querySelector('#pin-screen');
    return screen?.classList.contains('is-visible') &&
      (!pin || getComputedStyle(pin).display === 'none') &&
      screen.getAnimations().every((animation) => animation.playState === 'finished');
  }, { timeout: 10000 });
  await click(page, '.ci-float-chip[data-float="300"]');
  await page.waitForFunction(() => !document.querySelector('#clockin-btn').disabled);
  await click(page, '#clockin-btn');
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.kiwi-greet.is-visible'));
  await page.waitForFunction(() => window.KiwiClients?.get('recovery')?.stamps === 10);
  assert.equal(await page.evaluate(() => window.KiwiEnv.isReal()), true);
  t.step('the restaurant client card directs rewards to the ticket');
  if (viewport === 'phone') await click(page, '.kw-hamburger[data-action="toggle-nav"]');
  await click(page, '.rail-links [data-kcb-navitem]');
  await click(page, '.kcb-row[data-id="recovery"]');
  assert.equal(await page.$('#kcb-redeem'), null);
  assert.equal(await page.$eval('.kcb-reward-where span', el => el.textContent),
    await page.evaluate(() => window.KiwiCaisseLang.tr('À donner sur le ticket, au paiement')));
  await check(t, page, 'card', locale, viewport);
  await click(page, '#kcb-d-close');
  // Phone: the book covers the till and has its own close; tablet: it is a
  // rail with none. The phone menu stays open: Takeaway is in it.
  if (await page.$eval('#kcb-back', (el) => el.getClientRects().length > 0)) await click(page, '#kcb-back');

  const stamps = id => page.evaluate(id => window.KiwiClients.get(id).stamps, id);
  const queue = () => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), queueKey);
  const ledger = () => page.evaluate(() => journal.map(s => ({ id: s.id, amount: s.amount, discountAmountCents: s.discountAmountCents })));
  async function note(id) {
    // The pill itself: the till's main frame also carries data-mode.
    // Phone: Takeaway lives in the side menu, which the last sale closed.
    if (await page.$eval('.kw-hamburger', (el) => el.getBoundingClientRect().width > 0)
      && !(await page.evaluate(() => document.body.classList.contains('nav-open')))) await click(page, '.kw-hamburger[data-action="toggle-nav"]');
    await click(page, '.mode-pill[data-mode="vrap"]');
    await closeNav(page);
    // Phone: the last bill is still pulled up over the menu; its bar folds it.
    if (await page.evaluate(() => document.body.classList.contains('ticket-open'))) {
      await click(page, '#rp-peek');
      await page.waitForFunction(() => !document.body.classList.contains('ticket-open'));
    }
    // An empty takeaway opens straight on a new note; after a sale the board
    // comes first and « Nouvelle commande » opens the next one.
    const shown = (sel) => { const e = document.querySelector(sel); return !!e && e.getBoundingClientRect().width > 0; };
    await page.waitForFunction((f) => new Function('sel', 'return (' + f + ')(sel)')('#vrap-new-order') || new Function('sel', 'return (' + f + ')(sel)')('.menu-item[data-menu-id="cafe"]'), {}, shown.toString());
    if (await page.evaluate((f) => new Function('sel', 'return (' + f + ')(sel)')('#vrap-new-order'), shown.toString())) await click(page, '#vrap-new-order');
    await click(page, '.menu-item[data-menu-id="cafe"]');
    await click(page, '.menu-item[data-menu-id="croissant"]');
    // Phone: the bill sits behind its peek bar.
    if (await page.$eval('#rp-peek', (el) => el.getBoundingClientRect().width > 0)) {
      await click(page, '#rp-peek');
      await page.waitForFunction(() => document.body.classList.contains('ticket-open'));
    }
    await click(page, '#rp-client');
    await click(page, `[data-cl-pick="${id}"]`);
    assert.match(await page.$eval('#rp-client-label', el => el.textContent), new RegExp('Nora ' + id));
    // Arabic isolates the digits (U+2066…2069); the words are what is checked.
    assert.equal(await page.$eval('#rp-reward-label', el => el.textContent.replace(/[\u2066-\u2069]/g, '')),
      await page.evaluate(() => window.KiwiCaisseLang.tr('Récompense prête') + ' · 1 offert'));
    assert.equal(await page.evaluate(() => currentTotal()), 40);
    await click(page, '#rp-reward');
    assert.equal(await page.$eval('#rp-reward', el => el.getAttribute('aria-pressed')), 'true');
    assert.deepEqual(await page.evaluate(() => ({ amount: vrapDiscount.amount, reason: vrapDiscount.reason, clientId: vrapDiscount.reward.clientId })),
      { amount: 20, reason: 'Fidélité client', clientId: id });
    assert.equal(await page.evaluate(() => currentTotal()), 20);
    assert.equal(await stamps(id), 10, 'applying a reward does not burn it');
    await check(t, page, 'applied-' + id, locale, viewport);
    await click(page, '#pay-charge');
    await page.waitForFunction(() => !document.querySelector('#cash-confirm').disabled);
    await click(page, '#cash-confirm');
  }
  t.step('cash refusal removes discount and asks for full-price confirmation');
  await note('recovery');
  await page.waitForFunction(() => !window.KiwiSaleReward.active());
  const warning = await page.evaluate(() => window.KiwiCaisseLang.tr('Récompense indisponible. Confirmez le paiement au plein tarif.'));
  await page.waitForFunction(txt => document.body.innerText.includes(txt), {}, warning);
  assert.equal(await page.evaluate(() => currentTotal()), 40);
  assert.equal(await page.evaluate(() => vrapDiscount), null);
  assert.equal(await stamps('recovery'), 10);
  assert.equal((await queue()).length, 0);
  assert.equal(attempts.length, 1);
  assert.equal(sales.length, 0);
  assert.equal((await ledger()).length, 0, 'refused reward must stop the sale');
  await page.waitForSelector('#cash-modal.is-open', { visible: true });
  await check(t, page, 'refused', locale, viewport);
  await click(page, '#cash-confirm');
  await page.waitForFunction(() => journal.length === 1);
  assert.equal((await ledger())[0].amount, 40, 'cashier explicitly confirms full price');
  // The synthetic server's list wins over the till's copy within a second, so
  // counts are compared with the full card, not to the unit.
  assert.ok(await stamps('recovery') >= 10, 'a refused reward burns nothing');
  assert.equal(attempts.length, 1);
  await page.waitForFunction(() => !document.querySelector('#cash-modal').classList.contains('is-open'));

  t.step('server recovers; a new ready note is paid with one redemption');
  mode = 'accepted';
  await note('accepted');
  await page.waitForFunction(() => journal.length === 2);
  await page.waitForFunction(() => journal.length === 2 && window.KiwiClients.get('accepted').stamps < 10);
  await page.waitForFunction(() => !document.querySelector('#cash-modal').classList.contains('is-open'));
  assert.equal((await ledger())[1].amount, 20);
  assert.equal((await ledger())[1].discountAmountCents, 2000);
  assert.equal(attempts.filter(a => a.mode === 'accepted').length, 1);
  assert.equal((await queue()).length, 0);
  await check(t, page, 'recovered', locale, viewport);
  await page.waitForFunction(() => !document.querySelector('#cash-modal').classList.contains('is-open'));

  t.step('offline cash still records the discounted sale and queues the same reward reference');
  mode = 'offline';
  await note('offline');
  await page.waitForFunction(() => journal.length === 3 && window.KiwiClients.get('offline').stamps < 10);
  assert.equal((await ledger())[2].amount, 20);
  assert.equal((await ledger())[2].discountAmountCents, 2000);
  const queued = await queue();
  assert.equal(queued.length, 1);
  assert.equal(queued[0].clientId, 'offline');
  assert.equal(queued[0].ref, attempts.find(a => a.mode === 'offline').ref);
  assert.equal(queued[0].stamps, 10);
  await check(t, page, 'offline', locale, viewport);
  await page.waitForFunction(() => !document.querySelector('#cash-modal').classList.contains('is-open'));
  assert.ok(await stamps('accepted') < 10, 'the accepted card is burned');
  assert.ok(await stamps('offline') < 10, 'the offline card is burned');
  assert.equal((await queue()).length, 1);

}
try {
  await h.S.run('loyalty recovery and offline · fr · phone', async (t) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=phone
    await open(t, 'fr', 'phone');
  });
  await h.S.run('loyalty recovery and offline · fr · tablet', async (t) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=tablet
    await open(t, 'fr', 'tablet');
  });
  await h.S.run('loyalty recovery and offline · en · phone', async (t) => {
    // coverage: surface=caisse-restaurant locale=en viewport=phone
    await open(t, 'en', 'phone');
  });
  await h.S.run('loyalty recovery and offline · en · tablet', async (t) => {
    // coverage: surface=caisse-restaurant locale=en viewport=tablet
    await open(t, 'en', 'tablet');
  });
  await h.S.run('loyalty recovery and offline · ar · phone', async (t) => {
    // coverage: surface=caisse-restaurant locale=ar viewport=phone
    await open(t, 'ar', 'phone');
  });
  await h.S.run('loyalty recovery and offline · ar · tablet', async (t) => {
    // coverage: surface=caisse-restaurant locale=ar viewport=tablet
    await open(t, 'ar', 'tablet');
  });
} finally { await h.close(); await h.S.finish(); }
