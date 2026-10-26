#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
// Session-free apps in a real Chromium demo session: waiter, kitchen, OrderPro,
// booking, printer settings, the landing at tablet width, onboarding, tickets.
// Fixtures mirror booking-lens, kds-cards, a11y and access-gate browser tests.
import { randomInt } from 'node:crypto';
import { harness, demoPage, verify } from './surface-matrix-lib.mjs';
import { tradingHourMs } from './demo-clock.mjs';
import { secretFromEnv, fillSecret } from './browser-trace.mjs';
import { TICKET_TAXONOMY } from '../functions/api/tickets/_taxonomy.js';

const h = await harness('surface-matrix-apps');
// Generated demo-only values, registered for trace redaction before any typing.
// Never accept a merchant's real credential through the environment here.
const secrets = [];
for (const [name, digits] of [['login', 4], ['attendance', 6]]) {
  const env = 'KIWI_MATRIX_GENERATED_' + name.toUpperCase();
  const previous = process.env[env];
  process.env[env] = String(randomInt(10 ** (digits - 1), 10 ** digits));
  secrets.push(secretFromEnv('matrix-demo-' + name, env));
  if (previous === undefined) delete process.env[env]; else process.env[env] = previous;
}

async function open(t, surface, locale, viewport) {
  const pinnedAt = Date.now(); // demoPage pins the page clock to 15:00 from here
  const { ctx, page } = await demoPage(h, locale, viewport, {
    'kiwi-employee-language:demo': locale,
    kiwiCuisineLang: locale, orderProLang: locale, kiwiBookingLang: locale,
    ...(surface === 'kitchen' ? { kiwiLiveMerchant: 'matrix-demo-bistro', kiwiPaired: '1' } : {}),
    ...(surface === 'printer' ? { 'kiwiSkin2027:access': '1' } : {}),
  });
  t.watch(page);
  t.defer(() => ctx.close());
  // Replace the harness's offline responder, keeping its network boundary.
  page.removeAllListeners('request');
  page.on('request', (r) => {
    const u = new URL(r.url());
    const reply = (body) => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.origin === h.base && u.pathname === '/api/booking') {
      const date = u.searchParams.get('date');
      return reply({ name: 'Hammam Test', tz: 'Africa/Casablanca', hoursSet: true,
        services: [{ id: 's1', name: 'Hammam', duration: 60, price: 200 }],
        ...(date ? { slots: [{ startAt: Date.parse(date + 'T10:00:00Z') }] } : {}) });
    }
    if (u.origin === h.base && u.pathname === '/api/order/queue') {
      // The page clock is pinned to 15:00 (demo-clock.mjs): stamp the order on
      // that clock, or after midnight it reads as 12 hours old and is dropped.
      const pageNow = tradingHourMs() + (Date.now() - pinnedAt);
      return reply({ ok: true, now: pageNow, ordersAvailable: true, orders: [{
        id: 'matrix-demo-order', number: 101, mode: 'table', table_no: '5',
        status: 'accepted', channel: 'caisse', total: 50,
        created_ts: pageNow - 120000, updated_ts: pageNow,
        lines: [{ id: 'matrix-demo-dish', name: 'Harira', qty: 1, unitPrice: 50, station: '' }],
      }] });
    }
    // Middleware explicitly permits the tickets shell and GET /api/tickets
    // without a session. Use the API's real taxonomy and an empty demo board.
    if (u.origin === h.base && u.pathname === '/api/tickets') {
      return reply({ tickets: [], taxonomy: TICKET_TAXONOMY });
    }
    if (u.origin === h.base && u.pathname.startsWith('/api/')) {
      return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    }
    return r.url().startsWith(h.base + '/') || r.url().startsWith('data:') ? r.continue() : r.abort();
  });
  const paths = { waiter: '/kiwi-serveur.html?demo=1', kitchen: '/kiwi-cuisine.html',
    orderpro: '/OrderPro.html?s=demo', booking: '/booking.html?merchant=hammam-test',
    printer: '/printer.html', landing: '/' + locale + '/index.html',
    onboarding: '/dashboard.html?onboarding=1', 'shell-tickets': '/tickets.html' };
  const regions = { waiter: '#screen-main', kitchen: '#screen', orderpro: '#screen-menu',
    booking: '#booking-app', printer: 'main.wrap', landing: 'main',
    onboarding: '#kit-onboarding', 'shell-tickets': 'main.workspace' };
  t.step('open ' + surface + ' through its demo or public entry');
  // The public onboarding query must override demoPage's default skip marker.
  if (surface === 'onboarding') await page.evaluateOnNewDocument(() => localStorage.removeItem('kiwiSkipOnboard'));
  await page.goto(h.base + paths[surface], { waitUntil: 'load', timeout: 30000 });
  if (surface === 'waiter') {
    await page.waitForSelector('#screen-pin.is-active #pin-keypad', { visible: true, timeout: 10000 });
    await fillSecret(page, '#pin-keypad', secrets[0]);
    await page.waitForSelector('#screen-clockin.is-active #attendance-code', { visible: true, timeout: 5000 });
    await fillSecret(page, '#attendance-code', secrets[1]);
    await page.waitForFunction(() => !document.querySelector('#ci-button').disabled, { timeout: 5000 });
    await page.click('#ci-button');
    await page.waitForSelector('#screen-main.is-active:not(.is-pre-hidden)', { visible: true, timeout: 8000 });
  } else if (surface === 'orderpro') {
    await page.waitForSelector('#screen-mode.is-active', { visible: true, timeout: 10000 });
    await page.click('.mode-card[data-mode="takeout"]');
    await page.waitForSelector('#screen-menu.is-active [data-add="cappuccino"]', { visible: true, timeout: 8000 });
    // The menu screen slides in; judge it once it has settled.
    await page.waitForFunction(() => { const e = document.getElementById('screen-menu'), r = e.getBoundingClientRect(), c = getComputedStyle(e);
      return Math.abs(r.left) < 1 && Number(c.opacity) === 1; }, { timeout: 5000 });
  } else if (surface === 'booking') {
    await page.waitForSelector('.bk-choice', { visible: true, timeout: 8000 });
  } else if (surface === 'kitchen') {
    await page.waitForSelector('[data-tk="matrix-demo-order"]', { visible: true, timeout: 10000 });
  } else if (surface === 'shell-tickets') {
    await page.waitForFunction(() => document.querySelector('#kindFilters button'), { timeout: 8000 });
  }
  const region = regions[surface];
  await page.waitForSelector(region, { visible: true, timeout: 10000 });
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))]));
  return { page, region };
}

try {
  for (const locale of forLocales(['fr', 'en', 'ar'])) {
    await h.S.run(`waiter · ${locale} · desktop`, async (t) => {
      // coverage: surface=waiter locale=fr viewport=desktop
      // coverage: surface=waiter locale=en viewport=desktop
      // coverage: surface=waiter locale=ar viewport=desktop
      const cell = await open(t, 'waiter', locale, 'desktop');
      await verify(h, t, cell, `matrix-waiter-${locale}-desktop`, locale);
    });
    await h.S.run(`waiter · ${locale} · tablet`, async (t) => {
      // coverage: surface=waiter locale=fr viewport=tablet
      // coverage: surface=waiter locale=en viewport=tablet
      // coverage: surface=waiter locale=ar viewport=tablet
      const cell = await open(t, 'waiter', locale, 'tablet');
      await verify(h, t, cell, `matrix-waiter-${locale}-tablet`, locale);
    });
    await h.S.run(`waiter · ${locale} · phone`, async (t) => {
      // coverage: surface=waiter locale=fr viewport=phone
      // coverage: surface=waiter locale=en viewport=phone
      // coverage: surface=waiter locale=ar viewport=phone
      const cell = await open(t, 'waiter', locale, 'phone');
      await verify(h, t, cell, `matrix-waiter-${locale}-phone`, locale);
    });
  }
  for (const locale of forLocales(['fr', 'en', 'ar'])) {
    await h.S.run(`kitchen · ${locale} · desktop`, async (t) => {
      // coverage: surface=kitchen locale=fr viewport=desktop
      // coverage: surface=kitchen locale=en viewport=desktop
      // coverage: surface=kitchen locale=ar viewport=desktop
      const cell = await open(t, 'kitchen', locale, 'desktop');
      await verify(h, t, cell, `matrix-kitchen-${locale}-desktop`, locale);
    });
    await h.S.run(`kitchen · ${locale} · tablet`, async (t) => {
      // coverage: surface=kitchen locale=fr viewport=tablet
      // coverage: surface=kitchen locale=en viewport=tablet
      // coverage: surface=kitchen locale=ar viewport=tablet
      const cell = await open(t, 'kitchen', locale, 'tablet');
      await verify(h, t, cell, `matrix-kitchen-${locale}-tablet`, locale);
    });
    await h.S.run(`kitchen · ${locale} · phone`, async (t) => {
      // coverage: surface=kitchen locale=fr viewport=phone
      // coverage: surface=kitchen locale=en viewport=phone
      // coverage: surface=kitchen locale=ar viewport=phone
      const cell = await open(t, 'kitchen', locale, 'phone');
      await verify(h, t, cell, `matrix-kitchen-${locale}-phone`, locale);
    });
  }
  for (const locale of forLocales(['fr', 'en', 'ar'])) {
    await h.S.run(`orderpro · ${locale} · desktop`, async (t) => {
      // coverage: surface=orderpro locale=fr viewport=desktop
      // coverage: surface=orderpro locale=en viewport=desktop
      // coverage: surface=orderpro locale=ar viewport=desktop
      const cell = await open(t, 'orderpro', locale, 'desktop');
      await verify(h, t, cell, `matrix-orderpro-${locale}-desktop`, locale);
    });
    await h.S.run(`orderpro · ${locale} · tablet`, async (t) => {
      // coverage: surface=orderpro locale=fr viewport=tablet
      // coverage: surface=orderpro locale=en viewport=tablet
      // coverage: surface=orderpro locale=ar viewport=tablet
      const cell = await open(t, 'orderpro', locale, 'tablet');
      await verify(h, t, cell, `matrix-orderpro-${locale}-tablet`, locale);
    });
    await h.S.run(`orderpro · ${locale} · phone`, async (t) => {
      // coverage: surface=orderpro locale=fr viewport=phone
      // coverage: surface=orderpro locale=en viewport=phone
      // coverage: surface=orderpro locale=ar viewport=phone
      const cell = await open(t, 'orderpro', locale, 'phone');
      await verify(h, t, cell, `matrix-orderpro-${locale}-phone`, locale);
    });
  }
  for (const locale of forLocales(['fr', 'en', 'ar'])) {
    await h.S.run(`booking · ${locale} · desktop`, async (t) => {
      // coverage: surface=booking locale=fr viewport=desktop
      // coverage: surface=booking locale=en viewport=desktop
      // coverage: surface=booking locale=ar viewport=desktop
      const cell = await open(t, 'booking', locale, 'desktop');
      await verify(h, t, cell, `matrix-booking-${locale}-desktop`, locale);
    });
    await h.S.run(`booking · ${locale} · tablet`, async (t) => {
      // coverage: surface=booking locale=fr viewport=tablet
      // coverage: surface=booking locale=en viewport=tablet
      // coverage: surface=booking locale=ar viewport=tablet
      const cell = await open(t, 'booking', locale, 'tablet');
      await verify(h, t, cell, `matrix-booking-${locale}-tablet`, locale);
    });
    await h.S.run(`booking · ${locale} · phone`, async (t) => {
      // coverage: surface=booking locale=fr viewport=phone
      // coverage: surface=booking locale=en viewport=phone
      // coverage: surface=booking locale=ar viewport=phone
      const cell = await open(t, 'booking', locale, 'phone');
      await verify(h, t, cell, `matrix-booking-${locale}-phone`, locale);
    });
  }
  for (const locale of forLocales(['fr', 'en', 'ar'])) {
    await h.S.run(`printer · ${locale} · desktop`, async (t) => {
      // coverage: surface=printer locale=fr viewport=desktop
      // coverage: surface=printer locale=en viewport=desktop
      // coverage: surface=printer locale=ar viewport=desktop
      const cell = await open(t, 'printer', locale, 'desktop');
      await verify(h, t, cell, `matrix-printer-${locale}-desktop`, locale);
    });
    await h.S.run(`printer · ${locale} · tablet`, async (t) => {
      // coverage: surface=printer locale=fr viewport=tablet
      // coverage: surface=printer locale=en viewport=tablet
      // coverage: surface=printer locale=ar viewport=tablet
      const cell = await open(t, 'printer', locale, 'tablet');
      await verify(h, t, cell, `matrix-printer-${locale}-tablet`, locale);
    });
    await h.S.run(`printer · ${locale} · phone`, async (t) => {
      // coverage: surface=printer locale=fr viewport=phone
      // coverage: surface=printer locale=en viewport=phone
      // coverage: surface=printer locale=ar viewport=phone
      const cell = await open(t, 'printer', locale, 'phone');
      await verify(h, t, cell, `matrix-printer-${locale}-phone`, locale);
    });
  }
  // Every published landing locale at tablet width, the size no other suite opens.
  for (const locale of forLocales(['fr', 'en', 'ar', 'es', 'de', 'it', 'nl'])) {
    await h.S.run(`landing · ${locale} · tablet`, async (t) => {
      // coverage: surface=landing locale=fr viewport=tablet
      // coverage: surface=landing locale=en viewport=tablet
      // coverage: surface=landing locale=ar viewport=tablet
      // coverage: surface=landing locale=es viewport=tablet
      // coverage: surface=landing locale=de viewport=tablet
      // coverage: surface=landing locale=it viewport=tablet
      // coverage: surface=landing locale=nl viewport=tablet
      const cell = await open(t, 'landing', locale, 'tablet');
      await verify(h, t, cell, `matrix-landing-${locale}-tablet`, locale);
    });
  }
  for (const locale of forLocales(['en', 'ar'])) {
    await h.S.run(`onboarding · ${locale} · desktop`, async (t) => {
      // coverage: surface=onboarding locale=en viewport=desktop
      // coverage: surface=onboarding locale=ar viewport=desktop
      const cell = await open(t, 'onboarding', locale, 'desktop');
      await verify(h, t, cell, `matrix-onboarding-${locale}-desktop`, locale);
    });
  }
  for (const locale of forLocales(['fr'])) {
    await h.S.run(`shell-tickets · ${locale} · desktop`, async (t) => {
      // coverage: surface=shell-tickets locale=fr viewport=desktop
      const cell = await open(t, 'shell-tickets', locale, 'desktop');
      await verify(h, t, cell, `matrix-shell-tickets-${locale}-desktop`, locale);
    });
    await h.S.run(`shell-tickets · ${locale} · tablet`, async (t) => {
      // coverage: surface=shell-tickets locale=fr viewport=tablet
      const cell = await open(t, 'shell-tickets', locale, 'tablet');
      await verify(h, t, cell, `matrix-shell-tickets-${locale}-tablet`, locale);
    });
    await h.S.run(`shell-tickets · ${locale} · phone`, async (t) => {
      // coverage: surface=shell-tickets locale=fr viewport=phone
      const cell = await open(t, 'shell-tickets', locale, 'phone');
      await verify(h, t, cell, `matrix-shell-tickets-${locale}-phone`, locale);
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
