#!/usr/bin/env node
// Puppeteer browser suite via surface-matrix-lib. Synthetic REAL hotel only
// (merchant matrix-real, an in-memory SQLite, never a merchant's books).
// The department request flow runs against the shipping handlers themselves:
// /api/inventory/internal-requests and /api/inventory/department-catalogue are
// answered by functions/api/inventory/*.js over the hotel-request fixture, so
// the reservation, the substitution and the custody transfer are the server's
// own rules, read back from its ledger after each step.
import assert from 'node:assert/strict';
import { LOCALES } from './test-locales.mjs';
import { randomInt } from 'node:crypto';
import { harness, realPage, sleep, verify } from './surface-matrix-lib.mjs';
import { createHotelRequestHarness } from './fixtures/hotel-request-db.mjs';
import { onRequestGet as requestsGet, onRequestPost as requestsPost } from '../functions/api/inventory/internal-requests.js';
import { onRequestGet as departmentGet } from '../functions/api/inventory/department-catalogue.js';
const h = await harness('surface-matrix-states-economat');
const merchant = 'matrix-real';
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
  await sleep(2600); // the greeting that follows an unlock
}

const registry = { units: [
  { id:'u-economat', name:'Matrix storeroom', kind:'economat', storeType:'economat', locationId:'loc-economat', active:true },
  { id:'u-housekeeping', name:'Matrix housekeeping', kind:'department', storeType:'', locationId:'loc-housekeeping', active:true },
], terminalUnits:[] };
const item = (itemId, name) => ({ itemId, name, baseUnit:'unite', purchaseUnit:'carton', purchaseToBase:20, issueUnit:'unite', issueToBase:1, consumptionUnit:'unite', consumptionToBase:1, active:true });
const catalogue = { items:[item('matrix-towels', 'Matrix bath towels'), item('matrix-linen', 'Matrix sheets 160'), item('matrix-linen-king', 'Matrix sheets 180')] };
// Housekeeping may ask for towels and 160 sheets; the 180 sheets are the
// storeroom's own decision when it substitutes.
const housekeeping = { unitId:'u-housekeeping', items:['matrix-towels', 'matrix-linen'].map((itemId) => ({
  itemId, visibility:'visible', active:true, countingUnit:'unite', packaging:{ unit:'unite', quantity:1 }, countingFrequency:'daily', recipeUse:false,
})) };
const fixture = {
  merchant, units:registry, catalogue, departments:{ 'u-housekeeping': housekeeping }, members:[],
  seed(add) {
    add('matrix-available', 'matrix-towels', 'loc-economat', 24000, 3500, 10);
    add('matrix-opening', 'matrix-linen', 'loc-economat', 4000, 9000, 11);
    add('matrix-depleted', 'matrix-linen', 'loc-economat', -4000, null, 12);
    add('matrix-king', 'matrix-linen-king', 'loc-economat', 10000, 9500, 13);
  },
};
const labels = {
  fr: { title:'Économat', shortage:'Rupture', receipt:'Réceptionner une livraison', requests:'Demandes des services', insufficient:'Stock insuffisant', received:'Reçue', custody:'Au service', confirmEvent:'Réception confirmée' },
  en: { title:'Central storeroom', shortage:'Out of stock', receipt:'Receive a delivery', requests:'Department requests', insufficient:'Not enough stock', received:'Received', custody:'With the department', confirmEvent:'Receipt confirmed' },
  ar: { title:'المخزن المركزي', shortage:'نفد', receipt:'استلام توريد', requests:'طلبات الأقسام', insufficient:'المخزون غير كافٍ', received:'مستلم', custody:'لدى القسم', confirmEvent:'أُكّد الاستلام' },
};
/* A Puppeteer request answered by a shipping Pages Function, as the owner. */
async function viaFunction(db, handler, req) {
  const url = new URL(req.url());
  const init = { method:req.method(), headers:{ cookie:db.ownerCookie, 'content-type':'application/json' } };
  if (req.method() === 'POST') init.body = req.postData() || '{}';
  const response = await handler({ request:new Request('https://kiwi.test' + url.pathname + url.search, init), env:db.env });
  return { status:response.status, body:await response.json() };
}
async function open(t, locale, viewport) {
  const db = await createHotelRequestHarness(fixture);
  const routes = {
    'GET /api/me': { authenticated:true, onboarded:true, name:'Matrix Owner', business:'Matrix Hotel', type:'hotel', stores:[{ merchant, name:'Matrix Hotel', type:'hotel' }] },
    'GET /api/config': { name:'Matrix Hotel', type:'hotel', plan:'pro', planExplicit:true, pins:[{ name:'Matrix Owner', role:'owner' }] },
    'POST /api/pin/verify': (req) => JSON.parse(req.postData() || '{}').pin === OWNER
      ? { status:200, body:{ ok:true, staff:{ id:'matrix-owner', name:'Matrix Owner', role:'owner' }, merchant } }
      : { status:401, body:{ error:'bad-pin' } },
    'GET /api/store': (req) => {
      const feature = new URL(req.url()).searchParams.get('feature');
      const data = feature === 'hotel-units' ? registry : feature === 'economat-catalogue' ? catalogue : null;
      return { status:200, body:{ ok:true, merchant, feature, rev:1, data } };
    },
    'GET /api/inventory/internal-requests': (req) => viaFunction(db, requestsGet, req),
    'POST /api/inventory/internal-requests': (req) => viaFunction(db, requestsPost, req),
    'GET /api/inventory/department-catalogue': (req) => viaFunction(db, departmentGet, req),
    // Same read shape as inventory/movements.js: a positive opening receipt
    // and its depletion keep the zero balance visible in the ledger snapshot.
    'GET /api/inventory/movements': { movements:[
      { id:'matrix-available', itemId:'matrix-towels', locationId:'loc-economat', qty:24, reason:'receipt', cursor:1 },
      { id:'matrix-opening', itemId:'matrix-linen', locationId:'loc-economat', qty:4, reason:'receipt', cursor:2 },
      { id:'matrix-depleted', itemId:'matrix-linen', locationId:'loc-economat', qty:-4, reason:'manual', cursor:3 },
      { id:'matrix-king', itemId:'matrix-linen-king', locationId:'loc-economat', qty:10, reason:'receipt', cursor:4 },
    ], cursor:4, more:false, scope:{ unitId:'u-economat', locationId:'loc-economat', economatLocationId:'loc-economat' } },
  };
  const { ctx, page } = await realPage(h, locale, viewport, routes);
  t.defer(() => ctx.close()); t.watch(page);
  t.step('load synthetic REAL hotel and unlock its owner lock');
  await page.goto(h.base + '/dashboard.html', { waitUntil:'load', timeout:60000 });
  await unlock(page);
  await page.waitForFunction(() => window.KiwiVenue?.getCurrentVenueData?.()?.type === 'hotel' && window.KiwiEnv?.isReal?.(), { timeout:30000 });
  t.step('enter economat through hotel navigation');
  await page.waitForSelector('[data-nav="economat"], [data-action="nav-economat"]', { timeout:20000 });
  // Same path as the shared nav helper: on a phone or tablet the sidebar
  // link is folded away, so it is activated rather than hit-tested.
  await page.evaluate(() => document.querySelector('[data-nav="economat"], [data-action="nav-economat"]').click());
  await page.waitForSelector('.hx-eco', { visible:true, timeout:20000 });
  await page.waitForFunction(() => document.querySelector('.hx-eco-row')?.textContent.includes('matrix-linen'), { timeout:20000 });
  assert.ok(await page.$eval('.hx-eco', (el, text) => el.textContent.includes(text), labels[locale].title));
  return { page, region:'.hx-eco', db };
}
async function check(t, cell, state, locale, viewport) {
  const key = `matrix-economat-${state}-${locale}-${viewport}`;
  await sleep(500);
  await verify({ ...h, baseline:{ ...h.baseline, [key]:{} } }, t, cell, key, locale);
}

const sheet = '.kiwi-modal:has([data-req-sheet])';
async function act(page, expected) {
  await page.waitForFunction((want) => document.querySelector('[data-req-sheet]')?.getAttribute('data-req-act') === want, { timeout:20000 }, expected);
}
async function press(page) {
  await page.waitForSelector(sheet + ' [data-action="eco-req-act"]:not([disabled])', { visible:true, timeout:20000 });
  await page.click(sheet + ' [data-action="eco-req-act"]');
}
/* Department request → storeroom review (a refused reservation, then a
   substitution that reserves) → the department accepts → handover → receipt.
   Every step is a real click on the shipping screen; every claim about stock
   is read back from the server's own ledger. */
async function requestFlow(t, cell, locale, viewport) {
  const { page, db } = cell, L = labels[locale];
  const balance = (itemId, location) => db.balance(itemId, location);
  const holds = () => db.rows('SELECT item_id, qty_milli FROM inventory_request_reservations WHERE merchant = ? ORDER BY item_id', merchant).map((row) => ({ ...row }));
  t.step('close the receipt form and find the department requests');
  await page.click('.kiwi-modal [data-dismiss]');
  await page.waitForFunction(() => !document.querySelector('.kiwi-backdrop.in'), { timeout:10000 });
  await page.waitForSelector('[data-eco-requests] [data-action="eco-req-new"]:not([disabled])', { visible:true, timeout:20000 });
  assert.ok(await page.$eval('[data-eco-requests]', (el, text) => el.textContent.includes(text), L.requests));
  // The card sits under the stock list: scroll to it the way a person does.
  await page.$eval('[data-eco-requests]', (el) => el.scrollIntoView({ block:'start' }));
  await check(t, { page, region:'[data-eco-requests]' }, 'requests-empty', locale, viewport);

  t.step('housekeeping asks for 6 towels and 2 sheets 160');
  await page.click('[data-action="eco-req-new"]');
  await page.waitForSelector('[data-pick="1"] [data-pick-qty]', { visible:true, timeout:20000 });
  await page.type('[data-pick="0"] [data-pick-qty]', '6');
  await page.type('[data-pick="1"] [data-pick-qty]', '2');
  await check(t, { page, region:'.kiwi-modal' }, 'request-new', locale, viewport);
  await page.click('[data-action="eco-req-send"]');
  await act(page, 'review');
  const id = await page.$eval('[data-req-sheet]', (el) => el.getAttribute('data-req-sheet'));
  assert.equal(db.one('SELECT state FROM hotel_internal_requests WHERE merchant = ? AND id = ?', merchant, id).state, 'open');
  assert.deepEqual(holds(), [], 'a submitted request reserves nothing yet');

  t.step('storeroom approves as asked: the sheets 160 are out, nothing is reserved');
  await press(page);
  await page.waitForFunction((text) => [...document.querySelectorAll('.kiwi-toast')].some((n) => n.textContent.includes(text)), { timeout:15000 }, L.insufficient);
  assert.deepEqual(holds(), [], 'a refused reservation leaves no hold behind');
  await act(page, 'review');

  t.step('storeroom substitutes sheets 180 for the missing 160 and reserves');
  const line = sheet + ' .hx-req-review[data-line="1"]';
  await page.select(line + ' [data-rv-res]', 'substituted');
  await page.waitForSelector(line + ' [data-rv-subst]:not([hidden])', { visible:true });
  await page.select(line + ' [data-rv-item]', 'matrix-linen-king');
  await page.type(line + ' [data-rv-reason]', 'Matrix 160 out');
  await check(t, { page, region:sheet }, 'review', locale, viewport);
  await press(page);
  await act(page, 'accept');
  assert.deepEqual(holds(), [{ item_id:'matrix-linen-king', qty_milli:2000 }, { item_id:'matrix-towels', qty_milli:6000 }]);

  t.step('housekeeping accepts the proposed change');
  await check(t, { page, region:sheet }, 'changes-proposed', locale, viewport);
  await press(page);
  await act(page, 'prepare');

  t.step('storeroom prepares and hands over by delivery');
  await page.click(sheet + ' input[name="hx-req-method"][value="delivery"]');
  await check(t, { page, region:sheet }, 'handover', locale, viewport);
  await press(page);
  await act(page, 'confirm');
  const handed = db.one('SELECT fulfilment_method, delivery_started_ts FROM hotel_internal_requests WHERE merchant = ? AND id = ?', merchant, id);
  assert.equal(handed.fulfilment_method, 'delivery');
  assert.ok(Number(handed.delivery_started_ts) > 0);
  assert.deepEqual(holds(), [{ item_id:'matrix-linen-king', qty_milli:2000 }, { item_id:'matrix-towels', qty_milli:6000 }], 'handed-over stock stays reserved until receipt');
  assert.equal(balance('matrix-towels', 'loc-housekeeping'), 0, 'custody stays with the storeroom until receipt');

  t.step('housekeeping counts what arrived and confirms receipt');
  await check(t, { page, region:sheet }, 'receipt-confirm', locale, viewport);
  await press(page);
  // Closed: the only step left is reporting a discrepancy.
  await act(page, 'dispute');
  await page.waitForFunction((text) => document.querySelector('[data-req-sheet] .hx-req-trail[open]')?.textContent.includes(text), { timeout:20000 }, L.confirmEvent);
  assert.ok(await page.$eval('[data-req-sheet]', (el, text) => el.textContent.includes(text), L.custody));

  t.step('custody recorded: the ledger moved the goods and released the holds');
  assert.equal(balance('matrix-towels', 'loc-housekeeping'), 6);
  assert.equal(balance('matrix-linen-king', 'loc-housekeeping'), 2);
  assert.equal(balance('matrix-towels', 'loc-economat'), 18);
  assert.equal(balance('matrix-linen-king', 'loc-economat'), 8);
  assert.equal(balance('matrix-linen', 'loc-housekeeping'), 0, 'the substituted item never moved');
  assert.deepEqual(holds(), []);
  assert.deepEqual(db.rows('SELECT event FROM hotel_internal_request_events WHERE merchant = ? AND request_id = ? ORDER BY revision', merchant, id).map((r) => r.event),
    ['created', 'submit', 'review', 'accept', 'prepare', 'confirm']);
  await check(t, { page, region:sheet }, 'custody', locale, viewport);

  t.step('the list shows the request as received');
  await page.click(sheet + ' [data-dismiss]');
  await page.waitForFunction((rid, text) => document.querySelector('[data-req="' + rid + '"]')?.textContent.includes(text), { timeout:15000 }, id, L.received);
  t.step('a refresh after closing the sheet keeps it closed');
  await page.click('[data-eco-requests] [data-action="eco-req-refresh"]');
  await page.waitForSelector('[data-eco-requests] [data-action="eco-req-refresh"]:not([disabled])', { timeout:15000 });
  await sleep(400);
  assert.equal(await page.$('.kiwi-backdrop.in'), null, 'the closed request sheet came back after a refresh');
}
try {
  if (LOCALES.includes('fr')) await h.S.run('economat · fr · phone', async (t) => {
    // coverage: surface=caisse-hotel locale=fr viewport=phone
    const cell = await open(t, 'fr', 'phone');
    await check(t, cell, 'stock', 'fr', 'phone');
    t.step('observe a real zero-balance shortage');
    assert.ok(await cell.page.$eval('.hx-eco-row', (el, text) => el.textContent.includes(text), labels['fr'].shortage));
    await check(t, cell, 'shortage', 'fr', 'phone');
    t.step('open the shipping supplier receipt form');
    await cell.page.click('[data-action="eco-receive"]');
    await cell.page.waitForSelector('#eco-item', { visible:true });
    await check(t, { page:cell.page, region:'.kiwi-modal' }, 'receipt', 'fr', 'phone');
    await requestFlow(t, cell, 'fr', 'phone');
  });
  if (LOCALES.includes('fr')) await h.S.run('economat · fr · tablet', async (t) => {
    // coverage: surface=caisse-hotel locale=fr viewport=tablet
    const cell = await open(t, 'fr', 'tablet');
    await check(t, cell, 'stock', 'fr', 'tablet');
    t.step('observe a real zero-balance shortage');
    assert.ok(await cell.page.$eval('.hx-eco-row', (el, text) => el.textContent.includes(text), labels['fr'].shortage));
    await check(t, cell, 'shortage', 'fr', 'tablet');
    t.step('open the shipping supplier receipt form');
    await cell.page.click('[data-action="eco-receive"]');
    await cell.page.waitForSelector('#eco-item', { visible:true });
    await check(t, { page:cell.page, region:'.kiwi-modal' }, 'receipt', 'fr', 'tablet');
    await requestFlow(t, cell, 'fr', 'tablet');
  });
  if (LOCALES.includes('en')) await h.S.run('economat · en · phone', async (t) => {
    // coverage: surface=caisse-hotel locale=en viewport=phone
    const cell = await open(t, 'en', 'phone');
    await check(t, cell, 'stock', 'en', 'phone');
    t.step('observe a real zero-balance shortage');
    assert.ok(await cell.page.$eval('.hx-eco-row', (el, text) => el.textContent.includes(text), labels['en'].shortage));
    await check(t, cell, 'shortage', 'en', 'phone');
    t.step('open the shipping supplier receipt form');
    await cell.page.click('[data-action="eco-receive"]');
    await cell.page.waitForSelector('#eco-item', { visible:true });
    await check(t, { page:cell.page, region:'.kiwi-modal' }, 'receipt', 'en', 'phone');
    await requestFlow(t, cell, 'en', 'phone');
  });
  if (LOCALES.includes('en')) await h.S.run('economat · en · tablet', async (t) => {
    // coverage: surface=caisse-hotel locale=en viewport=tablet
    const cell = await open(t, 'en', 'tablet');
    await check(t, cell, 'stock', 'en', 'tablet');
    t.step('observe a real zero-balance shortage');
    assert.ok(await cell.page.$eval('.hx-eco-row', (el, text) => el.textContent.includes(text), labels['en'].shortage));
    await check(t, cell, 'shortage', 'en', 'tablet');
    t.step('open the shipping supplier receipt form');
    await cell.page.click('[data-action="eco-receive"]');
    await cell.page.waitForSelector('#eco-item', { visible:true });
    await check(t, { page:cell.page, region:'.kiwi-modal' }, 'receipt', 'en', 'tablet');
    await requestFlow(t, cell, 'en', 'tablet');
  });
  if (LOCALES.includes('ar')) await h.S.run('economat · ar · phone', async (t) => {
    // coverage: surface=caisse-hotel locale=ar viewport=phone
    const cell = await open(t, 'ar', 'phone');
    await check(t, cell, 'stock', 'ar', 'phone');
    t.step('observe a real zero-balance shortage');
    assert.ok(await cell.page.$eval('.hx-eco-row', (el, text) => el.textContent.includes(text), labels['ar'].shortage));
    await check(t, cell, 'shortage', 'ar', 'phone');
    t.step('open the shipping supplier receipt form');
    await cell.page.click('[data-action="eco-receive"]');
    await cell.page.waitForSelector('#eco-item', { visible:true });
    await check(t, { page:cell.page, region:'.kiwi-modal' }, 'receipt', 'ar', 'phone');
    await requestFlow(t, cell, 'ar', 'phone');
  });
  if (LOCALES.includes('ar')) await h.S.run('economat · ar · tablet', async (t) => {
    // coverage: surface=caisse-hotel locale=ar viewport=tablet
    const cell = await open(t, 'ar', 'tablet');
    await check(t, cell, 'stock', 'ar', 'tablet');
    t.step('observe a real zero-balance shortage');
    assert.ok(await cell.page.$eval('.hx-eco-row', (el, text) => el.textContent.includes(text), labels['ar'].shortage));
    await check(t, cell, 'shortage', 'ar', 'tablet');
    t.step('open the shipping supplier receipt form');
    await cell.page.click('[data-action="eco-receive"]');
    await cell.page.waitForSelector('#eco-item', { visible:true });
    await check(t, { page:cell.page, region:'.kiwi-modal' }, 'receipt', 'ar', 'tablet');
    await requestFlow(t, cell, 'ar', 'tablet');
  });
} finally { await h.close(); await h.S.finish(); }
