#!/usr/bin/env node
// Uses browser-trace through the shared harness (Chromium; run serially).
// Synthetic real sessions only; no credentials, internal handlers or render calls.
// Loyalty starts with a durable pending redemption, as after an offline sale.
// The application sync loop must obtain and persist the server refusal itself.
import assert from 'node:assert/strict';
import { LOCALES } from './test-locales.mjs';
import { randomInt } from 'node:crypto';
import { harness, realPage, sleep, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-states-real');
// A store renamed after signup: its merchant id no longer slugifies from its
// name. Live Link used to pin the name's slug and the dashboard then listened
// to another feed and lost its config (fixed 24 October); keep them different.
const merchant = 'matrix-real';
const words = {
  fr: { empty: 'Aucune fiche pour l’instant', error: 'Les fiches n’ont pas pu être lues. Rien n’a été modifié.', refused: 'Récompense refusée par le serveur', editor: 'Nom de la fiche' },
  en: { empty: 'No sheets yet', error: 'The sheets could not be read. Nothing was changed.', refused: 'Reward refused by the server', editor: 'Sheet name' },
  ar: { empty: 'لا توجد بطاقات بعد', error: 'تعذرت قراءة البطاقات. لم يتغير شيء.', refused: 'رفض الخادم المكافأة', editor: 'اسم البطاقة' },
};
async function click(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  await page.click(selector);
}
async function check(t, cell, state, locale, viewport) {
  const key = `matrix-state-real-${state}-${locale}-${viewport}`;
  const strict = { ...h, baseline: { ...h.baseline, [key]: {} } };
  await cell.page.waitForSelector(cell.region, { visible: true, timeout: 15000 });
  await cell.page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter((a) =>
      a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)
    ).map((a) => a.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await verify(strict, t, cell, key, locale);
}
async function visibleText(page, selector, text) {
  await page.waitForFunction((s, txt) => [...document.querySelectorAll(s)].some((el) => {
    const r = el.getBoundingClientRect(), c = getComputedStyle(el);
    return el.textContent.includes(txt) && r.width > 0 && r.height > 0 &&
      r.bottom > 0 && r.top < innerHeight && c.visibility !== 'hidden' && Number(c.opacity) > 0;
  }), { timeout: 15000 }, selector, text);
}
async function nav(page, selector) {
  await page.waitForSelector(selector, { timeout: 15000 });
  const id = selector.includes('clients-directory') ? 'act:clients-directory' : 'finance';
  const kitSelector = `#kit-side >>> [data-id="${id}"]`;
  const kit = await page.$(kitSelector);
  const box = kit && await kit.boundingBox();
  if (box && box.x >= 0 && box.x < (await page.viewport()).width) {
    await kit.click();
    return;
  }
  // Off screen behind the menu (phone): same entry as dashboardWalker, the
  // sidebar link clicked in script. Every later step is a real click.
  await page.evaluate((sel) => document.querySelector(sel).click(), selector);
}
/* The real dashboard opens on its owner lock. As in dash-pin-browser-test,
   the stubbed server knows one value made up for this run only; it is never
   printed, logged or stored, and the pad is driven by real clicks. */
const OWNER = String(randomInt(1000, 10000));
async function unlock(page) {
  await page.waitForFunction(() => { const p = document.querySelector('[data-kiwi-lock] k-pin-pad'); return p && p.shadowRoot && p.shadowRoot.querySelector('[data-key="1"]'); }, { timeout: 30000 });
  for (const d of OWNER) {
    const key = await page.evaluateHandle((x) => document.querySelector('[data-kiwi-lock] k-pin-pad').shadowRoot.querySelector('[data-key="' + x + '"]'), d);
    const box = await key.asElement().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(40);
  }
  await page.waitForFunction(() => { const l = document.querySelector('[data-kiwi-lock]'); return !l || l.classList.contains('is-unlocking') || getComputedStyle(l).display === 'none' || l.hidden; }, { timeout: 15000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('kiwi-gate-up'), { timeout: 15000 });
}
async function edit(page, locale) {
  await click(page, '[data-sfc="new"]');
  await visibleText(page, '[data-sfc-root] label', words[locale].editor);
  await click(page, '[data-sfc-field="sheet.name"]');
  await page.keyboard.press('Backspace');
  await page.type('[data-sfc-field="sheet.name"]', 'Matrix soup');
  assert.ok(await page.$eval('[data-sfc-field="sheet.name"]', (el) => !el.disabled && el.value.includes('Matrix soup')));
}
const emptySessions = new Map();
const sessions = {
  async open(t, state, locale, viewport) {
    const key = locale + '|' + viewport;
    if (state === 'editor' && emptySessions.has(key)) {
      const cell = emptySessions.get(key);
      t.watch(cell.page);
      t.step('reprendre la liste vide authentifiée, puis ouvrir son éditeur');
      await visibleText(cell.page, '[data-sfc-state="empty"]', words[locale].empty);
      await edit(cell.page, locale);
      return { page: cell.page, region: '[data-sfc-root]' };
    }
    let refusals = 0;
    const routes = {
      'GET /api/me': { authenticated: true, onboarded: true, name: 'Mira Test', business: 'Matrix Kitchen', type: 'restaurant',
        stores: [{ merchant, name: 'Matrix Kitchen', type: 'restaurant' }] },
      'GET /api/config': { name: 'Matrix Kitchen', type: 'restaurant', plan: 'pro', planExplicit: true,
        features: { simple_food_cost: true, crm: true, loyalty: true }, pins: [{ name: 'Mira Test', role: 'owner' }] },
      'POST /api/pin/verify': (req) => {
        let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
        return body.pin === OWNER ? { status: 200, body: { ok: true, staff: { id: 'st_owner', name: 'Mira Test', role: 'owner' }, merchant } } : { status: 401, body: { error: 'bad-pin' } };
      },
      'GET /api/foodcost': () => state === 'error'
        ? { status: 500, body: { error: 'synthetic-unavailable' } }
        : { status: 200, body: { enabled: true, canEdit: true, sheets: [] } },
      'GET /api/clients': { clients: [{ id: 'matrix-client', name: 'Nora Test', points: 0, stamps: 0, updated_ts: 1 }], cursor: 1, more: false },
      'POST /api/clients': (req) => {
        const data = JSON.parse(req.postData() || '{}');
        assert.equal(data.merchant, merchant);
        assert.ok(data.redemption, 'this fixture only accepts a redemption');
        refusals++;
        return { status: 409, body: { error: 'reward-not-ready' } };
      },
    };
    const storage = state === 'loyalty-refused' ? {
      ['kiwi:clients-redemptions:v1:' + merchant]: JSON.stringify([{ ref: 'matrix-redemption', clientId: 'matrix-client', points: 100, stamps: 0, created: 1 }]),
    } : {};
    const { ctx, page } = await realPage(h, locale, viewport, routes, storage);
    // Les listes vides restent ouvertes pour le scénario éditeur ; h.close ferme tout.
    if (state !== 'empty') t.defer(() => ctx.close());
    t.watch(page);
    t.step('load a synthetic authenticated restaurant with demos disabled');
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    t.step('open the owner lock with the code this run made up');
    await unlock(page);
    await page.waitForFunction(() => window.KiwiMe && window.KiwiConfig?.features?.simple_food_cost === true &&
      window.KiwiVenue?.getCurrentVenueData?.()?.slug === 'matrix-real');
    if (state === 'loyalty-refused') {
      t.step('open Clients and the customer whose pending redemption was refused');
      // The queued redemption goes to the server on its own; wait (observing
      // only) until its refusal is recorded, then open the customer.
      await page.waitForFunction(() => window.KiwiClients?.refusedRedemptions?.().some((e) => e.clientId === 'matrix-client'), { timeout: 20000 });
      await nav(page, '[data-action="clients-directory"]');
      const row = await page.waitForSelector('#kit-customers .k-dc__rows >>> li[data-id="matrix-client"] button', { visible: true, timeout: 15000 });
      await row.click();
      const region = '[data-i18n="clients.rewardRefused"]';
      const refusal = await page.waitForSelector(region, { visible: true, timeout: 15000 });
      await refusal.scrollIntoView();
      await visibleText(page, region, words[locale].refused);
      assert.ok(refusals > 0, 'server refusal must actually have been requested');
      return { page, region };
    }
    t.step('open menu analysis and Simple cost through the navigation');
    await nav(page, '[data-nav="finance"]');
    await click(page, '[data-fin-tab="cost"]');
    if (state === 'editor') {
      await visibleText(page, '[data-sfc-state="empty"]', words[locale].empty);
      await edit(page, locale);
      return { page, region: '[data-sfc-root]' };
    }
    const region = `[data-sfc-state="${state}"]`;
    await visibleText(page, region, words[locale][state]);
    if (state === 'empty') emptySessions.set(key, { ctx, page });
    return { page, region };
  },
};

try {
  // Store-credit issue is deliberately skipped: issueAvoir awaits avoirApproval,
  // which always opens requireManager's credential pad before POST store-credits.
  // This task forbids codes. No application bypass or invented approval is used.
  if (LOCALES.includes('fr')) await h.S.run('loyalty-refused · fr · phone', async (t) => {
    // coverage: surface=dashboard locale=fr viewport=phone
    const cell = await sessions.open(t, 'loyalty-refused', 'fr', 'phone');
    await check(t, cell, 'loyalty-refused', 'fr', 'phone');
  });
  if (LOCALES.includes('fr')) await h.S.run('loyalty-refused · fr · tablet', async (t) => {
    // coverage: surface=dashboard locale=fr viewport=tablet
    const cell = await sessions.open(t, 'loyalty-refused', 'fr', 'tablet');
    await check(t, cell, 'loyalty-refused', 'fr', 'tablet');
  });
  if (LOCALES.includes('en')) await h.S.run('loyalty-refused · en · phone', async (t) => {
    // coverage: surface=dashboard locale=en viewport=phone
    const cell = await sessions.open(t, 'loyalty-refused', 'en', 'phone');
    await check(t, cell, 'loyalty-refused', 'en', 'phone');
  });
  if (LOCALES.includes('en')) await h.S.run('loyalty-refused · en · tablet', async (t) => {
    // coverage: surface=dashboard locale=en viewport=tablet
    const cell = await sessions.open(t, 'loyalty-refused', 'en', 'tablet');
    await check(t, cell, 'loyalty-refused', 'en', 'tablet');
  });
  if (LOCALES.includes('ar')) await h.S.run('loyalty-refused · ar · phone', async (t) => {
    // coverage: surface=dashboard locale=ar viewport=phone
    const cell = await sessions.open(t, 'loyalty-refused', 'ar', 'phone');
    await check(t, cell, 'loyalty-refused', 'ar', 'phone');
  });
  if (LOCALES.includes('ar')) await h.S.run('loyalty-refused · ar · tablet', async (t) => {
    // coverage: surface=dashboard locale=ar viewport=tablet
    const cell = await sessions.open(t, 'loyalty-refused', 'ar', 'tablet');
    await check(t, cell, 'loyalty-refused', 'ar', 'tablet');
  });
  if (LOCALES.includes('fr')) await h.S.run('empty · fr · phone', async (t) => {
    // coverage: surface=dashboard-finance locale=fr viewport=phone
    const cell = await sessions.open(t, 'empty', 'fr', 'phone');
    await check(t, cell, 'empty', 'fr', 'phone');
  });
  if (LOCALES.includes('fr')) await h.S.run('empty · fr · tablet', async (t) => {
    // coverage: surface=dashboard-finance locale=fr viewport=tablet
    const cell = await sessions.open(t, 'empty', 'fr', 'tablet');
    await check(t, cell, 'empty', 'fr', 'tablet');
  });
  if (LOCALES.includes('en')) await h.S.run('empty · en · phone', async (t) => {
    // coverage: surface=dashboard-finance locale=en viewport=phone
    const cell = await sessions.open(t, 'empty', 'en', 'phone');
    await check(t, cell, 'empty', 'en', 'phone');
  });
  if (LOCALES.includes('en')) await h.S.run('empty · en · tablet', async (t) => {
    // coverage: surface=dashboard-finance locale=en viewport=tablet
    const cell = await sessions.open(t, 'empty', 'en', 'tablet');
    await check(t, cell, 'empty', 'en', 'tablet');
  });
  if (LOCALES.includes('ar')) await h.S.run('empty · ar · phone', async (t) => {
    // coverage: surface=dashboard-finance locale=ar viewport=phone
    const cell = await sessions.open(t, 'empty', 'ar', 'phone');
    await check(t, cell, 'empty', 'ar', 'phone');
  });
  if (LOCALES.includes('ar')) await h.S.run('empty · ar · tablet', async (t) => {
    // coverage: surface=dashboard-finance locale=ar viewport=tablet
    const cell = await sessions.open(t, 'empty', 'ar', 'tablet');
    await check(t, cell, 'empty', 'ar', 'tablet');
  });
  if (LOCALES.includes('fr')) await h.S.run('error · fr · phone', async (t) => {
    // coverage: surface=dashboard-finance locale=fr viewport=phone
    const cell = await sessions.open(t, 'error', 'fr', 'phone');
    await check(t, cell, 'error', 'fr', 'phone');
  });
  if (LOCALES.includes('fr')) await h.S.run('error · fr · tablet', async (t) => {
    // coverage: surface=dashboard-finance locale=fr viewport=tablet
    const cell = await sessions.open(t, 'error', 'fr', 'tablet');
    await check(t, cell, 'error', 'fr', 'tablet');
  });
  if (LOCALES.includes('en')) await h.S.run('error · en · phone', async (t) => {
    // coverage: surface=dashboard-finance locale=en viewport=phone
    const cell = await sessions.open(t, 'error', 'en', 'phone');
    await check(t, cell, 'error', 'en', 'phone');
  });
  if (LOCALES.includes('en')) await h.S.run('error · en · tablet', async (t) => {
    // coverage: surface=dashboard-finance locale=en viewport=tablet
    const cell = await sessions.open(t, 'error', 'en', 'tablet');
    await check(t, cell, 'error', 'en', 'tablet');
  });
  if (LOCALES.includes('ar')) await h.S.run('error · ar · phone', async (t) => {
    // coverage: surface=dashboard-finance locale=ar viewport=phone
    const cell = await sessions.open(t, 'error', 'ar', 'phone');
    await check(t, cell, 'error', 'ar', 'phone');
  });
  if (LOCALES.includes('ar')) await h.S.run('error · ar · tablet', async (t) => {
    // coverage: surface=dashboard-finance locale=ar viewport=tablet
    const cell = await sessions.open(t, 'error', 'ar', 'tablet');
    await check(t, cell, 'error', 'ar', 'tablet');
  });
  if (LOCALES.includes('fr')) await h.S.run('editor · fr · phone', async (t) => {
    // coverage: surface=dashboard-finance locale=fr viewport=phone
    const cell = await sessions.open(t, 'editor', 'fr', 'phone');
    await check(t, cell, 'editor', 'fr', 'phone');
  });
  if (LOCALES.includes('fr')) await h.S.run('editor · fr · tablet', async (t) => {
    // coverage: surface=dashboard-finance locale=fr viewport=tablet
    const cell = await sessions.open(t, 'editor', 'fr', 'tablet');
    await check(t, cell, 'editor', 'fr', 'tablet');
  });
  if (LOCALES.includes('en')) await h.S.run('editor · en · phone', async (t) => {
    // coverage: surface=dashboard-finance locale=en viewport=phone
    const cell = await sessions.open(t, 'editor', 'en', 'phone');
    await check(t, cell, 'editor', 'en', 'phone');
  });
  if (LOCALES.includes('en')) await h.S.run('editor · en · tablet', async (t) => {
    // coverage: surface=dashboard-finance locale=en viewport=tablet
    const cell = await sessions.open(t, 'editor', 'en', 'tablet');
    await check(t, cell, 'editor', 'en', 'tablet');
  });
  if (LOCALES.includes('ar')) await h.S.run('editor · ar · phone', async (t) => {
    // coverage: surface=dashboard-finance locale=ar viewport=phone
    const cell = await sessions.open(t, 'editor', 'ar', 'phone');
    await check(t, cell, 'editor', 'ar', 'phone');
  });
  if (LOCALES.includes('ar')) await h.S.run('editor · ar · tablet', async (t) => {
    // coverage: surface=dashboard-finance locale=ar viewport=tablet
    const cell = await sessions.open(t, 'editor', 'ar', 'tablet');
    await check(t, cell, 'editor', 'ar', 'tablet');
  });
} finally {
  await h.close();
  await h.S.finish();
}
