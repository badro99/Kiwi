#!/usr/bin/env node
// Operations states reached through public demo UI only. Run serially.
// Source limits: no demo hotel ships (dashboard.html); simple-food-cost's
// available() rejects demo mode; the local operator console currently is FR.
// Economat has no demo entry (no hotel demo venue, and hotel-economat.js only
// receives stock), so it claims no cell here.
import assert from 'node:assert/strict';
import { harness, demoPage, dashboardWalker, sleep, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-states-ops');
const dashboards = dashboardWalker(h);
const locales = ['fr', 'en', 'ar'];

async function settled(page, region) {
  await page.waitForSelector(region, { visible: true, timeout: 8000 });
  await page.evaluate(() => Promise.race([document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 1000))]));
  await sleep(350);
}

async function check(t, cell, state, locale, viewport) {
  const key = `matrix-state-${state}-${locale}-${viewport}`;
  // New states have no measured allowances. Enforce zero serious violations
  // without editing the shared baseline or borrowing another surface's budget.
  const strict = { ...h, baseline: { ...h.baseline, [key]: h.baseline[key] || {} } };
  await settled(cell.page, cell.region);
  await verify(strict, t, cell, key, locale);
}

async function click(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 8000 });
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }));
  await page.click(selector);
}

async function open(t, surface, locale, viewport) {
  if (surface === 'loyalty-setup' || surface === 'foodcost' || surface === 'economat') {
    const cell = await dashboards.open(t, 'dashboard-finance', locale, viewport);
    const { page } = cell;
    if (surface === 'loyalty-setup') {
      t.step('open Clients from the sidebar, then More, then the loyalty programme');
      // Same entry as dashboardWalker: the sidebar link, which sits off screen
      // behind the menu on tablet and phone. Every later step is a real click,
      // through the kit Customers page (Design 2027 is on in the demo).
      await page.evaluate(() => document.querySelector('[data-action="clients-directory"]').click());
      await click(page, 'k-button[data-do="more"]');
      await page.waitForSelector('k-popover[open]', { timeout: 5000 });
      const item = await page.waitForSelector('k-list[data-do="more"] >>> li[data-id="loyalty"] button', { visible: true, timeout: 5000 });
      await item.click();
      await click(page, '[data-mopt="visit"]');
      await page.waitForSelector('[data-mgroup="visit"]:not([hidden]) [data-loy="visit.reward"]', { visible: true, timeout: 5000 });
      return { page, region: '.kiwi-backdrop .kiwi-modal' };
    }
    if (surface === 'economat') {
      // Do not manufacture a hotel by changing KiwiVenue or invoking handlers.
      await click(page, '[data-action="venue-toggle"]');
      await settled(page, '[data-venue-dropdown].open');
      assert.equal(await page.$('[data-nav="economat"]'), null,
        'A demo hotel entry now exists: implement its request/handover walk');
      t.notice('UNREACHABLE economat: no hotel demo venue ships; hotel-economat.js offers receiving, not request/handover controls. No economat verification claimed.');
      await page.keyboard.press('Escape');
      return null;
    }
    await settled(page, '[data-fin-tab-open="overview"]');
    return { page, region: '[data-fin-tab-open="overview"]' };
  }
  const merchant = 'matrix-ops-employee';
  const { ctx, page } = await demoPage(h, locale, viewport, {
    ['kiwi-employee-language:' + merchant]: locale, kiwiTheme: 'light',
  });
  t.defer(() => ctx.close());
  t.watch(page);
  if (surface === 'employee') {
    // Same server-authoritative synthetic session shape as the employee a11y
    // audit. No staff login or attendance code is entered or persisted.
    page.removeAllListeners('request');
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.origin === h.base && u.pathname === '/api/employee' && r.method() === 'GET') {
        return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true, merchant,
          employee: { id: 'matrix-employee', name: 'Salma Test', firstName: 'Salma', initials: 'ST', role: 'serveur' },
          store: { type: 'restaurant', timezone: 'Africa/Casablanca', name: 'Matrix Demo' },
          attendance: { open: null }, colleagues: [], messages: [], schedule: {},
          planning: { requests: [], openShifts: [], swapRequests: [], notices: [] },
        }) });
      }
      if (u.origin === h.base && u.pathname.startsWith('/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      return r.url().startsWith(h.base + '/') || r.url().startsWith('data:') ? r.continue() : r.abort();
    });
    await page.goto(h.base + '/kiwi-serveur.html?merchant=' + merchant, { waitUntil: 'load', timeout: 20000 });
    await settled(page, '#screen-clockin.is-active');
    return { page, region: '#screen-clockin.is-active' };
  }
  // Localhost + offline API is the console's supported seedMock demo entry.
  await page.goto(h.base + '/kiwi-admin.html', { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Supprimer'), { timeout: 10000 });
  return { page, region: 'main' };
}

async function keyboardPass(t, page) {
  t.step('Tab through the first 15 stops: visible named elements and focus rings');
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  const seen = new Set();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
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
    assert.ok(focus?.visible && focus.name && focus.ring, `Tab ${i + 1}: visible, named focus with a painted ring required`);
    seen.add(focus.key);
  }
  assert.equal(seen.size, 15, 'first 15 focus stops must not cycle');
}

async function zoomPass(t, cell) {
  t.step('clocking screen at 200 percent CSS zoom, including clipped controls');
  await cell.page.evaluate(() => { document.querySelector('#screen-clockin').style.zoom = '2'; });
  await settled(cell.page, cell.region);
  const clipped = await cell.page.evaluate(() => [...document.querySelectorAll('#screen-clockin button,#screen-clockin input,#screen-clockin a,#screen-clockin label')]
    .filter((el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
      if (r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1) return true;
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (['hidden', 'clip'].includes(getComputedStyle(p).overflowX)) { const pr = p.getBoundingClientRect(); if (r.left < pr.left - 1 || r.right > pr.right + 1) return true; }
      }
      return false;
    }).length);
  assert.equal(clipped, 0, '200 percent clocking controls must not be clipped sideways');
}

try {
  for (const locale of locales) {
    for (const viewport of ['phone', 'tablet']) {
      await h.S.run(`loyalty-setup · ${locale} · ${viewport}`, async (t) => {
        // coverage: surface=dashboard locale=fr viewport=phone
        // coverage: surface=dashboard locale=en viewport=phone
        // coverage: surface=dashboard locale=ar viewport=phone
        // coverage: surface=dashboard locale=fr viewport=tablet
        // coverage: surface=dashboard locale=en viewport=tablet
        // coverage: surface=dashboard locale=ar viewport=tablet
        const cell = await open(t, 'loyalty-setup', locale, viewport);
        if (!cell) return;
        await check(t, cell, 'loyalty-setup', locale, viewport);
        t.notice('UNREACHABLE refused redemption: demo purchases are local; the refusal requires a real-mode server redemption response.');
        await cell.page.keyboard.press('Escape');
      });
    }
  }
  for (const locale of locales) {
    for (const viewport of ['phone', 'tablet']) {
      await h.S.run(`foodcost · ${locale} · ${viewport}`, async (t) => {
        // coverage: surface=dashboard-finance locale=fr viewport=phone
        // coverage: surface=dashboard-finance locale=en viewport=phone
        // coverage: surface=dashboard-finance locale=ar viewport=phone
        // coverage: surface=dashboard-finance locale=fr viewport=tablet
        // coverage: surface=dashboard-finance locale=en viewport=tablet
        // coverage: surface=dashboard-finance locale=ar viewport=tablet
        // coverage: surface=dashboard-analysis locale=fr viewport=phone
        // coverage: surface=dashboard-analysis locale=fr viewport=tablet
        // coverage: surface=dashboard-analysis locale=en viewport=phone
        // coverage: surface=dashboard-analysis locale=en viewport=tablet
        // coverage: surface=dashboard-analysis locale=ar viewport=phone
        // coverage: surface=dashboard-analysis locale=ar viewport=tablet
        const cell = await open(t, 'foodcost', locale, viewport);
        if (!cell) return;
        await check(t, cell, 'foodcost', locale, viewport);
        const { page } = cell;
        if (await page.$('[data-fin-tab="cost"]')) {
          await click(page, '[data-fin-tab="cost"]');
          await page.waitForSelector('[data-sfc-state="empty"],[data-sfc-state="error"],[data-sfc="open"]', { visible: true, timeout: 8000 });
          await check(t, { page, region: '[data-sfc-root]' }, 'foodcost-list', locale, viewport);
          if (await page.$('[data-sfc="open"]')) {
            await click(page, '[data-sfc="open"]');
            await page.waitForSelector('[data-sfc-field="sheet.name"]', { visible: true, timeout: 5000 });
            await check(t, { page, region: '[data-sfc-root]' }, 'foodcost-editor', locale, viewport);
          }
        } else {
          t.notice('UNREACHABLE Coût simple editor/empty/error: available() rejects demo mode; no render function or real-mode override used. Menu analysis verified.');
        }
        await click(page, '[data-fin-tab="performance"]');
        await check(t, { page, region: '[data-fin-tab-open="performance"]' }, 'foodcost-analysis', locale, viewport);
      });
    }
  }
  for (const locale of locales) {
    for (const viewport of ['desktop', 'tablet']) {
      await h.S.run(`employee · ${locale} · ${viewport}`, async (t) => {
        // coverage: surface=employee locale=fr viewport=desktop
        // coverage: surface=employee locale=en viewport=desktop
        // coverage: surface=employee locale=ar viewport=desktop
        // coverage: surface=employee locale=fr viewport=tablet
        // coverage: surface=employee locale=en viewport=tablet
        // coverage: surface=employee locale=ar viewport=tablet
        const cell = await open(t, 'employee', locale, viewport);
        await check(t, cell, 'employee', locale, viewport);
      });
    }
  }
  await h.S.run('employee · fr · phone · 200 percent', async (t) => {
    // coverage: surface=employee locale=fr viewport=phone
    const cell = await open(t, 'employee', 'fr', 'phone');
    await zoomPass(t, cell);
    await check(t, cell, 'employee-zoom200', 'fr', 'phone');
  });
  // The support console is French only today (owner question in the morning
  // report). EN/AR cells stay uncovered until it is localised.
  await h.S.run('console · fr · phone', async (t) => {
    // coverage: surface=console locale=fr viewport=phone
    const cell = await open(t, 'console', 'fr', 'phone');
    await keyboardPass(t, cell.page);
    await check(t, cell, 'console', 'fr', 'phone');
  });
} finally {
  await h.close();
  await h.S.finish();
}
