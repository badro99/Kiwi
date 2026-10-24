#!/usr/bin/env node
// Browser-trace state coverage complements keyboard-floor-booking-browser-test.mjs; no repeated tab walks.
// Public shareModal links to /booking?merchant=… (static harness uses booking.html).
// Fixtures follow publicConfig/onRequestPost in functions/api/booking.js; all APIs are isolated.
import assert from 'node:assert/strict';
import { harness, demoPage, dashboardWalker, sleep } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-states-booking-floor');
const nav = dashboardWalker(h);
const wait = { visible: true, timeout: 10000 };
const copy = {
  fr: { deposit: 'Acompte', payment: 'Aucun paiement n’est encaissé en ligne. Convenez du règlement de l’acompte avec l’établissement.', taken: 'Ce créneau vient d’être réservé. Choisissez-en un autre.', success: 'Votre réservation est confirmée', invalid: 'Vérifiez les champs obligatoires.' },
  en: { deposit: 'Deposit', payment: 'No payment is collected online. Arrange any deposit with the venue.', taken: 'That slot was just taken. Choose another.', success: 'Your booking is confirmed', invalid: 'Check the required fields.' },
  ar: { deposit: 'العربون', payment: 'لا يتم تحصيل أي دفعة عبر الإنترنت. اتفق مع المؤسسة على دفع العربون.', taken: 'تم حجز هذا الموعد للتو. اختر موعداً آخر.', success: 'تم تأكيد حجزك', invalid: 'تحقق من الحقول المطلوبة.' },
};
async function tap(page, selector) {
  await page.waitForSelector(selector, wait);
  await page.$eval(selector, e => e.scrollIntoView({ block: 'center', inline: 'center' }));
  const box = await page.$eval(selector, e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.touchscreen.tap(box.x, box.y);
}
async function state(t, page, selector, locale, label) {
  t.step(label);
  await page.waitForSelector(selector, wait);
  await page.$eval(selector, e => e.scrollIntoView({ block: 'center' }));
  const s = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, width: document.documentElement.scrollWidth, viewport: innerWidth, touch: navigator.maxTouchPoints }));
  assert.equal(s.lang, locale);
  assert.equal(s.dir, locale === 'ar' ? 'rtl' : 'ltr');
  assert.ok(s.touch > 0, 'real touch viewport required');
  assert.ok(s.width <= s.viewport + 1, JSON.stringify(s));
}
async function publicBooking(t, locale, viewport) {
  const { ctx, page } = await demoPage(h, locale, viewport, { kiwiBookingLang: locale });
  t.defer(() => ctx.close()); t.watch(page);
  let posts = [], rejectSlot = true;
  page.removeAllListeners('request');
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.origin === h.base && u.pathname === '/api/booking') {
      let status = 200, body;
      if (r.method() === 'GET') {
        const date = u.searchParams.get('date');
        body = { ok: true, merchant: 'matrix-demo', name: 'Matrix venue', tz: 'Africa/Casablanca', hoursSet: true,
          settings: { confirmation: 'instant', cancellationHours: 12, windowDays: 60 },
          services: [{ id: 's1', name: 'Table', duration: 60, price: 200, deposit: 50, capacity: 1, maxParty: 4 }],
          slots: date ? [{ startAt: Date.parse(date + 'T10:00:00Z') }, { startAt: Date.parse(date + 'T11:00:00Z') }] : [] };
      } else {
        assert.equal(r.method(), 'POST');
        const input = JSON.parse(r.postData()); posts.push(input);
        if (rejectSlot) { status = 409; body = { error: 'slot-unavailable' }; }
        else body = { ok: true, id: 'bk-matrix', code: 'R-MATRIX01', status: 'confirmed', startAt: input.startAt, manageToken: '0123456789abcdef0123456789abcdef', manageUrl: h.base + '/booking?merchant=matrix-demo&manage=0123456789abcdef0123456789abcdef', confirmationSent: false };
      }
      return r.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.origin === h.base || u.protocol === 'data:' ? r.continue() : r.abort();
  });
  // coverage: surface=booking locale=fr viewport=phone
  // coverage: surface=booking locale=fr viewport=tablet
  // coverage: surface=booking locale=en viewport=phone
  // coverage: surface=booking locale=en viewport=tablet
  // coverage: surface=booking locale=ar viewport=phone
  // coverage: surface=booking locale=ar viewport=tablet
  await page.goto(h.base + '/booking.html?merchant=matrix-demo', { waitUntil: 'load' });
  await tap(page, '[data-service]');
  await page.waitForSelector('[data-slot]', wait);
  await state(t, page, '.bk-date-row', locale, 'booking: available calendar/date state');
  assert.equal(await page.$$eval('[data-date]', es => es.length), 14);
  t.notice('UNREACHABLE booking month view: public booking implements a 14-day date strip, no month-view control.');
  await tap(page, '[data-slot]');
  await state(t, page, '[data-form]', locale, 'booking: chosen slot and deposit before confirmation');
  assert.equal(await page.$eval('[data-deposit] span', e => e.textContent), copy[locale].deposit);
  const amount = await page.evaluate(l => Number(50).toLocaleString(l === 'ar' ? 'ar-MA' : 'fr-FR') + ' MAD', locale);
  assert.equal(await page.$eval('[data-deposit] strong', e => e.textContent), amount);
  assert.equal(await page.$eval('[data-payment-note]', e => e.textContent), copy[locale].payment);
  assert.equal(await page.$('input[autocomplete="cc-number"],iframe'), null, 'booking does not collect payment credentials');
  await page.type('[name=name]', 'Matrix Guest');
  await page.type('[name=email]', 'guest@example.test');
  await tap(page, '[data-form] [type=submit]');
  await page.waitForFunction(text => document.querySelector('[data-error]')?.textContent === text, {}, copy[locale].taken);
  await state(t, page, '[data-error]', locale, 'booking: slot became unavailable');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].serviceId, 's1');
  assert.equal(posts[0].customer.email, 'guest@example.test');
  await page.waitForSelector('[data-slot]', wait);
  rejectSlot = false;
  await tap(page, '[data-slot]');
  await page.type('[name=name]', 'Matrix Guest');
  await page.type('[name=email]', 'guest@example.test');
  await tap(page, '[data-form] [type=submit]');
  await state(t, page, '.bk-success', locale, 'booking: confirmed reservation');
  assert.equal(await page.$eval('.bk-success h2', e => e.textContent), copy[locale].success);
  assert.equal(await page.$eval('.bk-code strong', e => e.textContent), 'R-MATRIX01');
  assert.equal(posts.length, 2);
  assert.ok(posts.every(p => !('payment' in p) && !('paid' in p)), 'POST reserves a slot, never claims payment');
}
async function staffBooking(t, locale, viewport) {
  // coverage: surface=dashboard-reservations locale=fr viewport=phone
  // coverage: surface=dashboard-reservations locale=fr viewport=tablet
  // coverage: surface=dashboard-reservations locale=en viewport=phone
  // coverage: surface=dashboard-reservations locale=en viewport=tablet
  // coverage: surface=dashboard-reservations locale=ar viewport=phone
  // coverage: surface=dashboard-reservations locale=ar viewport=tablet
  const { page } = await nav.open(t, 'dashboard-reservations', locale, viewport);
  await state(t, page, '.kr-empty', locale, 'dashboard-reservations: unconfigured diary');
  // A fresh demo has no services/resources. Configure it through the shipped UI.
  await tap(page, '.kr-empty [data-kr-setup]');
  await tap(page, '[data-kr-add-service]');
  await page.type('[data-service-row] [name=name]', 'Matrix service');
  await tap(page, '[data-kr-add-resource]');
  await page.type('[data-resource-row] [name=name]', 'Matrix resource');
  await page.waitForSelector('[data-service-row] [name=serviceCapacity]', wait);
  await page.$eval('[data-service-row] [name=serviceCapacity]', e => e.value='3');
  await tap(page, '[data-kr-settings] [type=submit]');
  await state(t, page, '.kr-list', locale, 'dashboard-reservations: configured empty list');
  assert.equal(await page.evaluate(() => window.KiwiReservations.get().services[0].capacity),3);
  const before = await page.evaluate(() => window.KiwiReservations.get().bookings.length);
  await tap(page, '[data-kr-new]');
  await state(t, page, '[data-kr-form]', locale, 'dashboard-reservations: new staff booking');
  await page.type('[data-kr-form] [name=name]', '   ');
  // Whitespace passes native required, but fails the application's trimmed-name validation.
  await tap(page, '[data-kr-form] [type=submit]');
  await page.waitForFunction(() => !!document.querySelector('[data-kr-error]')?.textContent);
  assert.equal(await page.$eval('[data-kr-error]', e => e.textContent), copy[locale].invalid);
  await state(t, page, '[data-kr-error]', locale, 'dashboard-reservations: validation error');
  assert.equal(await page.evaluate(() => window.KiwiReservations.get().bookings.length), before);
  await tap(page, '[data-kr-close]');
}
async function floor(t, locale, viewport) {
  // coverage: surface=dashboard-tables locale=fr viewport=phone
  // coverage: surface=dashboard-tables locale=fr viewport=tablet
  // coverage: surface=dashboard-tables locale=en viewport=phone
  // coverage: surface=dashboard-tables locale=en viewport=tablet
  // coverage: surface=dashboard-tables locale=ar viewport=phone
  // coverage: surface=dashboard-tables locale=ar viewport=tablet
  let { page, region } = await nav.open(t, 'dashboard-tables', locale, viewport);
  await state(t, page, region, locale, 'dashboard-tables: touch surface');
  if (viewport === 'phone') {
    assert.equal(await page.$('[data-pds-mode="layout"]'), null);
    await tap(page, '[data-pdsp-srv]');
    await page.waitForSelector('[data-pdsp-t]', wait);
    assert.ok(await page.$('[data-pdsp-t]'));
    t.notice('UNREACHABLE phone floor edit/add/nudge/RTL geometry: <=640px intentionally opens table assignment, no editor. No tablet-width override or synthetic add claimed.');
    return;
  }
  await tap(page, '[data-pds-mode="layout"]');
  const old = await page.$$eval('[data-pds-table]', es => es.map(e => e.dataset.pdsTable));
  t.step('dashboard-tables: add a table through a touchscreen palette tap');
  await tap(page, '[data-pds-action="add-shape"]');
  await page.waitForFunction(ids => [...document.querySelectorAll('[data-pds-table]')].some(e => !ids.includes(e.dataset.pdsTable)), {}, old);
  const id = await page.$$eval('[data-pds-table]', (es, ids) => es.find(e => !ids.includes(e.dataset.pdsTable)).dataset.pdsTable, old);
  assert.equal(await page.$$eval('[data-pds-table]', es => es.length), old.length + 1);
  await page.waitForSelector('[data-pds-field="x"]', wait);
  // Numeric geometry controls use physical coordinates even in RTL.
  const position = async () => page.$eval(`[data-pds-table="${id}"]`, e => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), width: e.parentElement.clientWidth, physicalRight: e.getBoundingClientRect().left > e.parentElement.getBoundingClientRect().left + e.parentElement.getBoundingClientRect().width / 2 }));
  const start = await position();
  await page.focus(`[data-pds-table="${id}"]`);
  await page.keyboard.press('ArrowRight');
  await sleep(650);
  const moved = await position();
  assert.ok(moved.x > start.x, `ArrowRight must move physically right in ${locale}: ${JSON.stringify({ start, moved })}`);
  assert.equal(moved.y, start.y);
  // Place on the right with the exposed geometry field, then prove reload persistence.
  const target = Math.round(moved.width * .72);
  await page.focus('[data-pds-field="x"]');
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace'); await page.type('[data-pds-field="x"]', String(target));
  await page.keyboard.press('Tab'); await sleep(750);
  const placed = await position();
  assert.ok(placed.x > placed.width / 2 && placed.physicalRight, JSON.stringify(placed));
  await page.reload({ waitUntil: 'load' }); await sleep(1200);
  ({ page } = await nav.open(t, 'dashboard-tables', locale, viewport));
  const restored = await position();
  assert.equal(restored.x, placed.x, 'physical X survives reload, including Arabic');
  assert.equal(restored.y, placed.y);
  assert.ok(restored.x > restored.width / 2 && restored.physicalRight, 'table remains physically on the right');
}
try {
  for (const locale of ['fr', 'en', 'ar']) for (const viewport of ['phone', 'tablet']) {
    await h.S.run(`booking · ${locale} · ${viewport}`, t => publicBooking(t, locale, viewport));
    await h.S.run(`dashboard-reservations · ${locale} · ${viewport}`, t => staffBooking(t, locale, viewport));
    await h.S.run(`dashboard-tables · ${locale} · ${viewport}`, t => floor(t, locale, viewport));
  }
} finally { await h.close(); await h.S.finish(); }
