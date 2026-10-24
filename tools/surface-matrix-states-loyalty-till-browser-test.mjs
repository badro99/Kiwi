#!/usr/bin/env node
// Paired REAL restaurant, synthetic server only; public customer-book clicks.
import assert from 'node:assert/strict';
import { harness, realPage, sleep, verify } from './surface-matrix-lib.mjs';
const h = await harness('surface-matrix-states-loyalty-till');
const merchant = 'matrix-real';
const queueKey = 'kiwi:clients-redemptions:v1:' + merchant;
const words = {
  fr: ['Récompense refusée', 'La carte est conservée.', 'Carte réinitialisée.', 'Carte réinitialisée. Confirmation au retour du réseau.'],
  en: ['Reward refused', 'The card is unchanged.', 'Card reset.', 'Card reset. Confirmed when back online.'],
  ar: ['تم رفض المكافأة', 'تم الاحتفاظ بالبطاقة.', 'تمت إعادة البطاقة.', 'تمت إعادة تعيين البطاقة. يتم التأكيد عند عودة الاتصال.'],
};
// A locator click waits until the control is visible, enabled and no longer
// moving, so a panel that is still sliding in is not hit mid-transition.
async function click(page, selector) {
  await page.locator(selector).setTimeout(20000).click();
}
async function message(page, text) {
  await page.waitForFunction((txt) => [...document.querySelectorAll('#toast-stack .toast')].some((el) => {
    const r = el.getBoundingClientRect();
    return el.textContent.includes(txt) && r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0;
  }), { timeout: 10000 }, text);
}
async function check(t, page, state, locale, viewport) {
  const key = `matrix-state-loyalty-till-${state}-${locale}-${viewport}`;
  await sleep(150);
  await verify({ ...h, baseline: { ...h.baseline, [key]: {} } }, t,
    { page, region: '#kcb-sheet' }, key, locale);
}
async function open(t, locale, viewport) {
  let mode = 'refused';
  const attempts = [];
  const clients = ['recovery', 'offline'].map((id) => ({ id, name: 'Nora ' + id, points: 100, stamps: 10, updated_ts: 1 }));
  const program = { model: 'visit', visit: { target: 10, reward: 'Café' }, amount: { threshold: 100 }, product: { target: 10 } };
  const routes = {
    'GET /api/me': { authenticated: true, onboarded: true, stores: [{ merchant, name: 'Matrix Kitchen', type: 'restaurant' }] },
    'GET /api/config': { name: 'Matrix Kitchen', type: 'restaurant', pins: [], features: { loyalty: true, crm: true } },
    'GET /api/pair/state': { ok: true, paired: true, merchant },
    'GET /api/menu': { categories: [], items: [] },
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
  t.step('open native Clients entry and redeem the ready customer');
  // On a phone the till's side menu is folded behind its menu button.
  if (viewport === 'phone') await click(page, '.kw-hamburger[data-action="toggle-nav"]');
  await click(page, '.rail-links [data-kcb-navitem]');
  await click(page, '.kcb-row[data-id="recovery"]');
  await click(page, '#kcb-redeem');
  await message(page, words[locale][0]); await message(page, words[locale][1]);
  assert.equal(await page.evaluate(() => window.KiwiClients.get('recovery').stamps), 10);
  assert.equal(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]').length, queueKey), 0);
  assert.equal(attempts.length, 1);
  assert.ok(await page.$('#kcb-redeem'), 'refusal keeps reward available');
  await check(t, page, 'refused', locale, viewport);
  t.step('server recovers; retry through the same redeem button');
  mode = 'accepted';
  await click(page, '#kcb-redeem');
  await message(page, words[locale][2]);
  assert.equal(await page.evaluate(() => window.KiwiClients.get('recovery').stamps), 0);
  assert.equal(await page.$('#kcb-redeem'), null);
  assert.equal(attempts.length, 2);
  assert.equal(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]').length, queueKey), 0);
  await check(t, page, 'recovered', locale, viewport);
  t.step('abort redemption transport for a second ready customer');
  await click(page, '#kcb-d-back');
  await click(page, '.kcb-row[data-id="offline"]');
  mode = 'offline';
  await click(page, '#kcb-redeem');
  await message(page, words[locale][3]);
  assert.equal(await page.evaluate(() => window.KiwiClients.get('offline').stamps), 0);
  assert.equal(await page.$('#kcb-redeem'), null);
  const queued = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), queueKey);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].clientId, 'offline');
  assert.equal(queued[0].ref, attempts.at(-1).ref);
  assert.equal(queued[0].stamps, 10);
  await check(t, page, 'offline', locale, viewport);
  // Reopen the customer to prove a rerender cannot offer/queue it again.
  await click(page, '#kcb-d-back'); await click(page, '.kcb-row[data-id="offline"]');
  assert.equal(await page.$('#kcb-redeem'), null);
  assert.equal(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]').length, queueKey), 1);
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
