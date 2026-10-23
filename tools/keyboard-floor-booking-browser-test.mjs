#!/usr/bin/env node
// Keyboard-only interactions after entry, isolated offline demo data, no submissions.
import assert from 'node:assert/strict';
import { harness, dashboardWalker, demoPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('keyboard-floor-booking');
const nav = dashboardWalker(h);

// Focus inspection copied from the states-ops keyboardPass, applied after every key.
async function keyboardPass(page, key) {
  // Puppeteer has no chord names: hold Shift for Shift+Tab.
  if (key === 'Shift+Tab') { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); }
  else await page.keyboard.press(key);
  await sleep(60);
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect(), c = getComputedStyle(el);
      const labelled = (el.getAttribute('aria-labelledby') || '').split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
      const name = labelled || el.getAttribute('aria-label') ||
        [...(el.labels || [])].map((l) => l.textContent).join(' ') || el.textContent || el.getAttribute('title') || '';
      const paint = (s) => s && s !== 'none' && !/rgba\([^)]*,\s*0\)/.test(s) && s !== 'transparent';
      const ring = (s) => (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && paint(s.outlineColor)) || paint(s.boxShadow);
      const pseudo = ['::before', '::after'].some((p) => {
        const s = getComputedStyle(el, p);
        return s.content !== 'none' && s.content !== 'normal' && ring(s);
      });
      return { name: name.trim(), visible: r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.bottom > 0 && r.top < innerHeight && c.visibility !== 'hidden' && Number(c.opacity) > 0 && !el.closest('[inert],[aria-hidden="true"]'),
        ring: el.matches(':focus-visible') && (ring(c) || pseudo),
        key: el.tagName + '|' + el.id + '|' + [...document.querySelectorAll('*')].indexOf(el) };
    });
    assert.ok(focus?.visible && focus.name && focus.ring, `Visible, named focus with a painted ring required: ${JSON.stringify(focus)}`);
}
async function at(page, selector) {
  return page.evaluate(s => document.activeElement?.matches(s), selector);
}
async function reach(t, page, selector, key = 'Tab') {
  t.step('keyboard reach ' + selector);
  if (await at(page, selector)) return;
  for (let i = 0; i < 400; i++) {
    await keyboardPass(page, key);
    if (await at(page, selector)) return;
  }
  assert.fail('Keyboard could not reach ' + selector);
}

try {
  for (const locale of ['fr', 'ar']) {
    await h.S.run(`floor keyboard · ${locale} · desktop`, async t => {
      const { page } = await nav.open(t, 'dashboard-tables', locale, 'desktop');
      t.watch(page);
      await reach(t, page, '[data-pds-table]');
      const id = await page.evaluate(() => document.activeElement.dataset.pdsTable);
      t.step('Enter opens the inline table inspector and moves focus in');
      await keyboardPass(page, 'Enter');
      assert.ok(await at(page, '[data-pds-inspector] button'));
      assert.equal(await page.$eval('[data-pds-inspect-id]', e => e.dataset.pdsInspectId), id);
      t.step('Escape closes the inspector and returns focus to its table');
      await keyboardPass(page, 'Escape');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.pdsTable), id);
      assert.equal(await page.$('[data-pds-inspect-id]'), null);
      await keyboardPass(page, 'Shift+Tab');
      await reach(t, page, `[data-pds-table="${id}"]`);
      t.step('Space also opens the table, Escape restores focus');
      await keyboardPass(page, 'Space');
      assert.ok(await at(page, '[data-pds-inspector] button'));
      await keyboardPass(page, 'Escape');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.pdsTable), id);
    });
    await h.S.run(`booking keyboard · ${locale} · desktop`, async t => {
      const { ctx, page } = await demoPage(h, locale, 'desktop', { kiwiBookingLang: locale });
      t.watch(page); t.defer(() => ctx.close());
      page.removeAllListeners('request');
      page.on('request', r => {
        const u = new URL(r.url());
        if (u.origin === h.base && u.pathname === '/api/booking') {
          assert.equal(r.method(), 'GET', 'booking must never be submitted');
          const date = u.searchParams.get('date');
          return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
            name: 'Keyboard Demo', tz: 'Africa/Casablanca', hoursSet: true,
            services: [{ id: 's1', name: 'Hammam', duration: 60, price: 200, maxParty: 4 }],
            ...(date ? { slots: [10, 11, 12, 13, 14].map(hour => ({ startAt: Date.parse(date + 'T' + hour + ':00:00Z') })) } : {}),
          }) });
        }
        if (u.origin === h.base && u.pathname.startsWith('/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
        return r.url().startsWith(h.base + '/') || r.url().startsWith('data:') ? r.continue() : r.abort();
      });
      t.step('open public booking in an isolated demo context');
      await page.goto(h.base + '/booking.html?merchant=keyboard-demo', { waitUntil: 'load', timeout: 30000 });
      await page.waitForSelector('[data-service]', { visible: true });
      await reach(t, page, '[data-service]');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-slot]', { visible: true });
      await reach(t, page, '[data-date]');
      t.step('arrow to a date, select with Space, preserve focus after availability loads');
      const before = await page.evaluate(() => document.activeElement.dataset.date);
      await keyboardPass(page, locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
      const date = await page.evaluate(() => document.activeElement.dataset.date);
      assert.notEqual(date, before);
      await keyboardPass(page, 'Space');
      await page.waitForFunction(d => document.querySelector('[data-date="' + d + '"][aria-pressed="true"]') && document.querySelector('[data-slot]') && !document.querySelector('[data-stale]'), {}, date);
      await sleep(100);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.date), date);
      await reach(t, page, '[data-slot]');
      const firstSlot = await page.evaluate(() => document.activeElement.dataset.slot);
      await keyboardPass(page, 'ArrowDown');
      assert.notEqual(await page.evaluate(() => document.activeElement.dataset.slot), firstSlot);
      t.step('Enter selects the slot and moves focus into details');
      await keyboardPass(page, 'Enter');
      assert.ok(await at(page, 'input[name="name"]'));
      await keyboardPass(page, 'Shift+Tab');
      await reach(t, page, '[data-form] button[type="submit"]');
      assert.ok(await at(page, '[data-form] button[type="submit"]'));
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
