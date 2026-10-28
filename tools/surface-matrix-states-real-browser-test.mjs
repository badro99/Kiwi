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
  await page.$eval(selector, el => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.click(selector);
}
async function check(t, cell, state, locale, viewport) {
  const key = `matrix-state-real-${state}-${locale}-${viewport}`;
  const strict = { ...h, baseline: { ...h.baseline, [key]: {} } };
  await cell.page.waitForSelector(cell.region, { visible: true, timeout: 15000 });
  await cell.page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1000))]));
  await sleep(350);
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
  await sleep(600);
}
/* The real dashboard opens on its owner lock. As in till-pin-browser-test,
   the stubbed server knows one value made up for this run only; it is never
   printed, logged or stored, and the pad is driven by real clicks. */
const OWNER = String(randomInt(1000, 10000));
async function unlock(page) {
  // The shipped owner lock: four cells over one numeric field, typed on the keyboard.
  await page.waitForSelector('[data-kiwi-lock] [data-kiwi-pin-input]', { timeout: 30000 });
  await sleep(600);
  await page.focus('[data-kiwi-lock] [data-kiwi-pin-input]');
  for (const d of OWNER) { await page.keyboard.press(d); await sleep(60); }
  await page.waitForFunction(() => { const l = document.querySelector('[data-kiwi-lock]'); return !l || l.classList.contains('is-unlocking') || getComputedStyle(l).display === 'none' || l.hidden; }, { timeout: 15000 });
  await sleep(2600); // the greeting that follows an unlock
}
const sessions = {
  async open(t, state, locale, viewport) {
    let refusals = 0, foodReads = 0, reviews = 0;
    let purchase = null, receiptAttempts = 0;
    const count = { id: 'matrix-count', engine: state === 'count-boutique' ? 'boutique' : 'ledger', status: 'submitted', submittedAt: Date.now(),
      storeName: 'Matrix Kitchen', employeeName: 'TEST KIWI', totalLines: 1, totalDiff: -2,
      totalVarianceCostMAD: -20, absVarianceCostMAD: 20,
      lines: [{ itemId: 'matrix-flour', productName: 'TEST KIWI farine', systemQty: 10,
        countedQty: 8, diff: -2, unitCost: 10, varianceCost: -20, unit: 'kg' }] };
    const routes = {
      'GET /api/me': { authenticated: true, onboarded: true, name: 'Mira Test', business: 'Matrix Kitchen', type: 'restaurant',
        stores: [{ merchant, name: 'Matrix Kitchen', type: 'restaurant' }] },
      'GET /api/config': { name: 'Matrix Kitchen', type: 'restaurant', plan: 'pro', planExplicit: true,
        features: { simple_food_cost: true, crm: true, loyalty: true }, pins: [{ name: 'Mira Test', role: 'owner' }] },
      'POST /api/pin/verify': (req) => {
        let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
        return body.pin === OWNER ? { status: 200, body: { ok: true, staff: { id: 'st_owner', name: 'Mira Test', role: 'owner' }, merchant } } : { status: 401, body: { error: 'bad-pin' } };
      },
      'GET /api/foodcost': () => state === 'error' && ++foodReads === 1
        ? { status: 500, body: { error: 'synthetic-unavailable' } }
        : { status: 200, body: { enabled: true, canEdit: true, sheets: [] } },
      'GET /api/operations': (req) => {
        const view = new URL(req.url()).searchParams.get('view');
        return { status: 200, body: view === 'whoami' ? { merchant, kind: 'owner', role: 'owner' } : { orders: purchase ? [purchase] : [] } };
      },
      'POST /api/operations': (req) => {
        const cmd = JSON.parse(req.postData());
        if (cmd.domain !== 'procurement') return { status: 200, body: { ok: true, command: { status: 'completed', result: {} } } };
        const input = cmd.payload;
        let result;
        if (cmd.action === 'create-po') {
          assert.equal(input.lines[0].qty, 2); assert.equal(input.lines[0].unitPrice, 40);
          purchase = { number: 'BC-MATRIX', status: 'draft', supplier: input.supplier, totalCents: 8000,
            lines: input.lines.map(l => ({ ...l, receivedQty: 0, returnedQty: 0 })) };
          result = { ...purchase, lines: 1, units: 2 };
        } else if (cmd.action === 'submit-po') {
          assert.equal(input.po, purchase.number); assert.equal(cmd.confirmed, true);
          purchase.status = 'submitted'; result = purchase;
        } else if (cmd.action === 'receive-po') {
          receiptAttempts++;
          assert.deepEqual(input.lines, [{ sku: 'matrix-flour', qty: 2 }]);
          if (receiptAttempts === 1) return { status: 409, body: { error: 'receipt-conflict' } };
          purchase.lines[0].receivedQty = 2; purchase.status = 'received'; result = purchase;
        } else throw new Error('unexpected purchase command');
        return { status: 200, body: { ok: true, command: { status: cmd.action === 'create-po' ? 'draft' : 'completed', result } } };
      },
      'GET /api/inventory/counts': { counts: [count] },
      'POST /api/inventory/counts': (req) => {
        const body = JSON.parse(req.postData());
        assert.equal(body.id, count.id);
        assert.equal(body.decision, 'approved');
        reviews++;
        if (reviews === 1) return { status: 409, body: { error: 'catalog-conflict' } };
        count.status = 'applied'; count.reviewDecision = 'approved';
        return { status: 200, body: { success: true, count } };
      },
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
    t.defer(() => ctx.close());
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
      const row = await page.waitForSelector('tr[data-cd-id="matrix-client"]', { visible: true, timeout: 15000 });
      await row.click();
      const region = '[data-i18n="clients.rewardRefused"]';
      const refusal = await page.waitForSelector(region, { visible: true, timeout: 15000 });
      await refusal.scrollIntoView();
      await visibleText(page, region, words[locale].refused);
      assert.ok(refusals > 0, 'server refusal must actually have been requested');
      return { page, region };
    }
    if (state.startsWith('count')) {
      t.step('review the frozen count, refuse a stale approval, then approve');
      await page.evaluate(() => document.querySelector('[data-nav="stock"]').click());
      await click(page, '[data-action="stock-tab"][data-tab="items"]');
      await click(page, '[data-action="stock-subview"][data-subview="counts"]');
      await click(page, '[data-action="stock-count-detail"][data-count-id="matrix-count"]');
      const region = '.kiwi-backdrop .kiwi-modal';
      assert.match(await page.$eval(region, el => el.textContent), /TEST KIWI farine/);
      const cells = await page.$$eval(region + ' tbody tr td', els => els.map(el => el.textContent.trim()));
      assert.match(cells[1], /10/); assert.match(cells[2], /8/);
      assert.match(cells[3], /-2/); assert.match(cells[4], /20/);
      await click(page, '#st-cnt-approve-btn');
      await page.waitForFunction(() => !document.getElementById('st-cnt-approve-btn')?.disabled);
      assert.equal(reviews, 1);
      assert.equal(count.status, 'submitted', 'conflict leaves the count pending');
      assert.ok(await page.$('#st-cnt-approve-btn'), 'conflict keeps the review open');
      await click(page, '#st-cnt-approve-btn');
      await page.waitForSelector('#st-cnt-approve-btn', { hidden: true });
      assert.equal(reviews, 2); assert.equal(count.status, 'applied');
      await click(page, '[data-action="stock-count-detail"][data-count-id="matrix-count"]');
      assert.equal(await page.$('#st-cnt-approve-btn'), null, 'applied count cannot be approved again');
      await page.keyboard.press('Escape');
      await purchaseJourney(t, page);
      assert.equal(receiptAttempts, 2);
      assert.equal(purchase.status, 'received');
      assert.equal(purchase.lines[0].receivedQty, 2);
      return { page, region: '[data-po-card="BC-MATRIX"]' };
    }
    t.step('open menu analysis and Simple cost through the navigation');
    await nav(page, '[data-nav="finance"]');
    await click(page, '[data-fin-tab="cost"]');
    if (state === 'editor') {
      await visibleText(page, '[data-sfc-state="empty"]', words[locale].empty);
      await click(page, '[data-sfc="new"]');
      await visibleText(page, '[data-sfc-root] label', words[locale].editor);
      await click(page, '[data-sfc-field="sheet.name"]');
      await page.keyboard.press('Backspace');
      await page.type('[data-sfc-field="sheet.name"]', 'Matrix soup');
      assert.ok(await page.$eval('[data-sfc-field="sheet.name"]', (el) => !el.disabled && el.value.includes('Matrix soup')));
      return { page, region: '[data-sfc-root]' };
    }
    const region = `[data-sfc-state="${state}"]`;
    await visibleText(page, region, words[locale][state]);
    return { page, region };
  },
};

async function purchaseJourney(t, page) {
  t.step('create an 80 MAD purchase order, submit it and recover a failed receipt');
  await click(page, '[data-action="stock-tab"][data-tab="orders"]');
  await click(page, '[data-action="supplier-new-po"]');
  for (const [selector, value] of [
    ['[data-po-supplier]', 'TEST KIWI fournisseur'], ['[data-pl-sku]', 'matrix-flour'],
    ['[data-pl-label]', 'TEST KIWI farine'], ['[data-pl-unit]', 'kg'],
    ['[data-pl-qty]', '2'], ['[data-pl-price]', '40'],
  ]) await page.locator(selector).fill(value);
  assert.match(await page.$eval('[data-po-total]', el => el.textContent), /80/);
  await click(page, '[data-po-create]');
  await page.waitForFunction(() => document.querySelector('[data-po-out]')?.textContent.includes('BC-MATRIX'));
  assert.match(await page.$eval('[data-po-out]', el => el.textContent), /80/);
  await click(page, '[data-po-tab="orders"]');
  await click(page, '[data-po-card="BC-MATRIX"] [data-acct-confirm]');
  await click(page, '[data-po-run="submit-po"]');
  await page.waitForSelector('[data-po-run="receive-po"]', { visible: true });
  await page.locator('[data-po-qty="matrix-flour"]').fill('2');
  await click(page, '[data-po-run="receive-po"]');
  await page.waitForFunction(() => document.querySelector('[data-po-out-card]')?.textContent.trim());
  assert.equal(await page.$eval('[data-po-qty="matrix-flour"]', el => el.value), '2', 'failed receipt retains entered quantity');
  await click(page, '[data-po-run="receive-po"]');
  await page.waitForSelector('[data-po-run="receive-po"]', { hidden: true });
  const row = await page.$$eval('[data-po-card="BC-MATRIX"] tbody td', els => els.map(el => el.textContent.trim()));
  assert.deepEqual(row.slice(2), ['2', '2', '0', '0'], 'ordered 2, received 2, returned 0, remaining 0');
}

async function fill(page, field, value) {
  const selector = `[data-sfc-field="${field}"]`;
  await page.locator(selector).fill(value);
  assert.equal(await page.$eval(selector, el => el.value), value, 'input value ' + field);
}
async function calculator(t, page) {
  t.step('calculate 250 g from a 40 MAD kilogram, divided into two portions');
  await fill(page, 'sheet.portions', '2');
  await click(page, '[data-sfc="add-food"]');
  await fill(page, 'name', 'TEST KIWI farine');
  await fill(page, 'packPrice', '40');
  await fill(page, 'useQty', '250');
  const amounts = () => page.$$eval('[data-sfc-summary] > div b', els => els.map(el => Number(el.textContent.replace(/[^0-9.,-]/g, '').replace(',', '.'))));
  assert.deepEqual((await amounts()).slice(0, 4), [10, 0, 10, 5], 'batch 10 MAD, portion 5 MAD');
  t.step('zero pack size makes the cost unknown, then correction restores it');
  await fill(page, 'packQty', '0');
  assert.equal(await page.$eval('[data-sfc-summary]', el => el.dataset.sfcStatus), 'incomplete');
  assert.ok(await page.$('[data-sfc-linecost="0"] .sfc-unknown'));
  await fill(page, 'packQty', '1');
  assert.equal((await amounts())[3], 5, 'corrected portion cost');
}

try {
  for (const locale of LOCALES) for (const viewport of ['tablet', 'desktop']) for (const engine of ['ledger', 'boutique']) {
    await h.S.run(`count approval conflict · ${engine} · ${locale} · ${viewport}`, async (t) => {
      // coverage: surface=dashboard-count-review locale=fr viewport=tablet
      // coverage: surface=dashboard-count-review locale=fr viewport=desktop
      // coverage: surface=dashboard-count-review locale=en viewport=tablet
      // coverage: surface=dashboard-count-review locale=en viewport=desktop
      // coverage: surface=dashboard-count-review locale=ar viewport=tablet
      // coverage: surface=dashboard-count-review locale=ar viewport=desktop
      // coverage: surface=dashboard-stock locale=fr viewport=tablet
      // coverage: surface=dashboard-stock locale=fr viewport=desktop
      // coverage: surface=dashboard-stock locale=en viewport=tablet
      // coverage: surface=dashboard-stock locale=en viewport=desktop
      // coverage: surface=dashboard-stock locale=ar viewport=tablet
      // coverage: surface=dashboard-stock locale=ar viewport=desktop
      const cell = await sessions.open(t, engine === 'boutique' ? 'count-boutique' : 'count', locale, viewport);
      await check(t, cell, 'count', locale, viewport);
    });
  }
  for (const locale of LOCALES) for (const viewport of ['phone', 'tablet']) {
    for (const state of ['empty', 'error', 'editor', 'loyalty-refused']) {
      await h.S.run(`${state} · ${locale} · ${viewport}`, async (t) => {
        // coverage: surface=dashboard-finance locale=fr viewport=phone
        // coverage: surface=dashboard-finance locale=fr viewport=tablet
        // coverage: surface=dashboard-finance locale=en viewport=phone
        // coverage: surface=dashboard-finance locale=en viewport=tablet
        // coverage: surface=dashboard-finance locale=ar viewport=phone
        // coverage: surface=dashboard-finance locale=ar viewport=tablet
        // coverage: surface=dashboard locale=fr viewport=phone
        // coverage: surface=dashboard locale=fr viewport=tablet
        // coverage: surface=dashboard locale=en viewport=phone
        // coverage: surface=dashboard locale=en viewport=tablet
        // coverage: surface=dashboard locale=ar viewport=phone
        // coverage: surface=dashboard locale=ar viewport=tablet
        // coverage: surface=dashboard-analysis locale=fr viewport=phone
        // coverage: surface=dashboard-analysis locale=fr viewport=tablet
        // coverage: surface=dashboard-analysis locale=en viewport=phone
        // coverage: surface=dashboard-analysis locale=en viewport=tablet
        // coverage: surface=dashboard-analysis locale=ar viewport=phone
        // coverage: surface=dashboard-analysis locale=ar viewport=tablet
        const cell = await sessions.open(t, state, locale, viewport);
        await check(t, cell, state, locale, viewport);
        if (state === 'error') {
          t.step('retry the failed read and recover the empty list');
          await click(cell.page, '[data-sfc="retry"]');
          await visibleText(cell.page, '[data-sfc-state="empty"]', words[locale].empty);
        }
        if (state === 'editor') await calculator(t, cell.page);
      });
    }
  }
} finally {
  await h.close();
  await h.S.finish();
}
