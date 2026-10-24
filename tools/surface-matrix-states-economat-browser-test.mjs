#!/usr/bin/env node
// Puppeteer browser suite via surface-matrix-lib. Synthetic REAL hotel only. The shipping economat has no department request
// client: report those steps UNREACHABLE rather than fabricate UI or custody.
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { harness, realPage, sleep, verify } from './surface-matrix-lib.mjs';
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
const labels = {
  fr: { title:'Économat', shortage:'Rupture', receipt:'Réceptionner une livraison' },
  en: { title:'Central storeroom', shortage:'Out of stock', receipt:'Receive a delivery' },
  ar: { title:'المخزن المركزي', shortage:'نفد', receipt:'استلام توريد' },
};
async function open(t, locale, viewport) {
  const routes = {
    'GET /api/me': { authenticated:true, onboarded:true, name:'Matrix Owner', business:'Matrix Hotel', type:'hotel', stores:[{ merchant, name:'Matrix Hotel', type:'hotel' }] },
    'GET /api/config': { name:'Matrix Hotel', type:'hotel', plan:'pro', planExplicit:true, pins:[{ name:'Matrix Owner', role:'owner' }] },
    'POST /api/pin/verify': (req) => JSON.parse(req.postData() || '{}').pin === OWNER
      ? { status:200, body:{ ok:true, staff:{ id:'matrix-owner', name:'Matrix Owner', role:'owner' }, merchant } }
      : { status:401, body:{ error:'bad-pin' } },
    'GET /api/store': (req) => {
      const feature = new URL(req.url()).searchParams.get('feature');
      return { status:200, body:{ ok:true, merchant, feature, rev:1, data:feature === 'hotel-units' ? registry : null } };
    },
    // Same read shape as inventory/movements.js: a positive opening receipt
    // and its depletion keep the zero balance visible in the ledger snapshot.
    'GET /api/inventory/movements': { movements:[
      { id:'matrix-available', itemId:'matrix-towels', locationId:'loc-economat', qty:24, reason:'receipt', cursor:1 },
      { id:'matrix-opening', itemId:'matrix-linen', locationId:'loc-economat', qty:4, reason:'receipt', cursor:2 },
      { id:'matrix-depleted', itemId:'matrix-linen', locationId:'loc-economat', qty:-4, reason:'manual', cursor:3 },
    ], cursor:3, more:false, scope:{ unitId:'u-economat', locationId:'loc-economat', economatLocationId:'loc-economat' } },
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
  return { page, region:'.hx-eco' };
}
async function check(t, cell, state, locale, viewport) {
  const key = `matrix-economat-${state}-${locale}-${viewport}`;
  await sleep(500);
  await verify({ ...h, baseline:{ ...h.baseline, [key]:{} } }, t, cell, key, locale);
}
try {
  await h.S.run('economat · fr · phone', async (t) => {
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
    for (const step of ['department request', 'storekeeper preparation', 'handover', 'custody recorded']) {
      t.notice('UNREACHABLE · fr · phone · ' + step + ': assets/hotel-economat.js only exposes stock, sync and supplier receipt; no shipping browser client calls /api/inventory/internal-requests. Backend transitions exist in functions/api/inventory/internal-requests.js, but a route stub cannot supply missing UI.');
    }
  });
  await h.S.run('economat · fr · tablet', async (t) => {
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
    for (const step of ['department request', 'storekeeper preparation', 'handover', 'custody recorded']) {
      t.notice('UNREACHABLE · fr · tablet · ' + step + ': assets/hotel-economat.js only exposes stock, sync and supplier receipt; no shipping browser client calls /api/inventory/internal-requests. Backend transitions exist in functions/api/inventory/internal-requests.js, but a route stub cannot supply missing UI.');
    }
  });
  await h.S.run('economat · en · phone', async (t) => {
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
    for (const step of ['department request', 'storekeeper preparation', 'handover', 'custody recorded']) {
      t.notice('UNREACHABLE · en · phone · ' + step + ': assets/hotel-economat.js only exposes stock, sync and supplier receipt; no shipping browser client calls /api/inventory/internal-requests. Backend transitions exist in functions/api/inventory/internal-requests.js, but a route stub cannot supply missing UI.');
    }
  });
  await h.S.run('economat · en · tablet', async (t) => {
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
    for (const step of ['department request', 'storekeeper preparation', 'handover', 'custody recorded']) {
      t.notice('UNREACHABLE · en · tablet · ' + step + ': assets/hotel-economat.js only exposes stock, sync and supplier receipt; no shipping browser client calls /api/inventory/internal-requests. Backend transitions exist in functions/api/inventory/internal-requests.js, but a route stub cannot supply missing UI.');
    }
  });
  await h.S.run('economat · ar · phone', async (t) => {
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
    for (const step of ['department request', 'storekeeper preparation', 'handover', 'custody recorded']) {
      t.notice('UNREACHABLE · ar · phone · ' + step + ': assets/hotel-economat.js only exposes stock, sync and supplier receipt; no shipping browser client calls /api/inventory/internal-requests. Backend transitions exist in functions/api/inventory/internal-requests.js, but a route stub cannot supply missing UI.');
    }
  });
  await h.S.run('economat · ar · tablet', async (t) => {
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
    for (const step of ['department request', 'storekeeper preparation', 'handover', 'custody recorded']) {
      t.notice('UNREACHABLE · ar · tablet · ' + step + ': assets/hotel-economat.js only exposes stock, sync and supplier receipt; no shipping browser client calls /api/inventory/internal-requests. Backend transitions exist in functions/api/inventory/internal-requests.js, but a route stub cannot supply missing UI.');
    }
  });
} finally { await h.close(); await h.S.finish(); }
