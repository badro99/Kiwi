#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
// Boutique state visits, demo only. No render helpers or merchant credentials.
// Deliberately unreachable in the shipped till:
// - product-editor: inventory.js openNewProduct/openEditProduct immediately
//   return after catalogDashboardOnly(); the inventory has no creation/edit CTA.
//   Size/colour variants in the selling sheet are NOT a product editor.
// - promo-editor: mount() has neither a promotions nav item nor its panel.
//   The old composer in inventory.js therefore has no real clickable entry.
// dashboardWalker/demoPage are available in the shared harness, but opening a
// dashboard editor would not prove either requested boutique-till state.
// - refused credit: issueAvoir() bypasses the register in IS_DEMO, so the
//   refusal cannot be produced without replacing application behavior.
// New states have no measured allowance: zero serious axe violations each.
import assert from 'node:assert/strict';
import { harness, openTill, sleep, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-states-boutique');
const tills = { open: (t, locale, viewport) => openTill(h, t, 'caisse-boutique', locale, viewport) };
const wait = { visible: true, timeout: 5000 };

async function click(page, selector) {
  await page.waitForSelector(selector, wait);
  // Puppeteer scrolls the actual control into view, including on touch layouts.
  await page.click(selector);
}

/* The view buttons live in the side menu; on a phone it sits off screen
   behind the Menu burger, so open it the way a person does first. */
async function view(page, name) {
  const sel = `[data-bq-view="${name}"]`;
  await page.waitForSelector(sel, { timeout: 5000 });
  const off = await page.$eval(sel, (el) => el.getBoundingClientRect().right <= 0 || el.getBoundingClientRect().left >= innerWidth);
  if (off) {
    await click(page, '#pos-boutique .vx-burger');
    await page.waitForFunction((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }, { timeout: 5000 }, sel);
    await sleep(350);
  }
  await click(page, sel);
}

async function returns(page, t, check) {
  t.step('select a seeded past sale and a return reason');
  await view(page, 'echanges');
  await click(page, '[data-bq-pick="1207:0"]');
  await click(page, '[data-bq-motif="Taille"]');
  await page.waitForSelector('[data-bq-do-avoir]', wait);
  await sleep(350);
  await check('[data-bq-panel="echanges"].is-on');

  t.step('start an exchange and open the replacement variant sheet');
  await click(page, '[data-bq-do-exch]');
  await page.waitForSelector('#bq-exch-cancel', wait);
  // Demo cards carry catalogue ids (prod_N); pick the sized caftan by its name.
  const card = await page.waitForFunction(() => [...document.querySelectorAll('[data-bq-item]:not(.is-out)')]
    .find((b) => /Caftan Coton/.test(b.textContent))?.getAttribute('data-bq-item'), { timeout: 5000 });
  await click(page, `[data-bq-item="${await card.jsonValue()}"]`);
  await page.waitForSelector('#bq-sheet-veil.is-open #bq-size-seg', wait);
  await page.waitForSelector('#bq-sheet-veil.is-open #bq-sheet-add', wait);
  await sleep(400);
  assert.ok(await page.$eval('#bq-sheet-add', (el) => !el.disabled), 'replacement can be selected');
  await check('#bq-sheet-veil.is-open .bq-sheet');
}

async function countReview(page, t, check) {
  let attempts = 0, submitted;
  page.removeAllListeners('request');
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname === '/api/inventory/counts' && req.method() === 'POST') {
      attempts++; submitted = JSON.parse(req.postData());
      return req.respond({ status: attempts === 1 ? 503 : 200, contentType: 'application/json',
        body: JSON.stringify(attempts === 1 ? { error: 'offline' } : { success: true, count: { id: 'matrix-boutique-count', status: 'submitted' } }) });
    }
    if (url.pathname.startsWith('/api/')) return req.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return url.origin === new URL(page.url()).origin || url.protocol === 'data:' ? req.continue() : req.abort();
  });
  t.step('count one demo variant, then review before transmission');
  await view(page, 'inventaire');
  await click(page, '#bqi-count');
  await click(page, '#sk-modal [data-cnt-step][data-step="1"]');
  await page.waitForFunction(() => {
    const b = document.getElementById('pos-cnt-review-btn');
    return b && !b.disabled;
  }, { timeout: 5000 });
  await click(page, '#pos-cnt-review-btn');
  await page.waitForSelector('#sk-modal.is-open #pos-cnt-submit-btn', wait);
  await page.waitForSelector('#sk-modal [data-cnt-note]', wait);
  await sleep(400);
  await check('#sk-modal.is-open #sk-modal-box');
  t.step('failed transmission keeps the frozen review, retry records a pending count');
  await click(page, '#pos-cnt-submit-btn');
  await page.waitForFunction(() => document.querySelector('#sk-modal')?.textContent.includes('Envoi impossible'));
  assert.equal(attempts, 1);
  assert.equal(submitted.lines.length, 1);
  assert.equal(submitted.lines[0].countedQty, 1);
  const frozen = JSON.stringify(submitted.lines);
  await click(page, '#pos-cnt-submit-btn');
  await page.waitForSelector('#pos-cnt-finish-btn', wait);
  assert.equal(attempts, 2);
  assert.equal(JSON.stringify(submitted.lines), frozen, 'retry preserves the reviewed quantities');
  assert.match(await page.$eval('#sk-modal', el => el.textContent), /matrix-boutique-count/);
}

try {
  console.log('! Unreachable in boutique till: product-editor, promo-editor and refused demo credit; see source comments.');
  for (const locale of forLocales(['fr', 'en', 'ar'])) {
    for (const state of ['returns', 'count-review']) {
      for (const viewport of ['phone', 'tablet']) {
        await h.S.run(`${state} · ${locale} · ${viewport}`, async (t) => {
          // Both viewport branches below have literal, scanner-readable claims.
          let cell;
          if (viewport === 'phone') {
            // coverage: surface=caisse-boutique locale=fr viewport=phone
            // coverage: surface=caisse-boutique locale=en viewport=phone
            // coverage: surface=caisse-boutique locale=ar viewport=phone
            // coverage: surface=boutique-exchange locale=fr viewport=phone
            // coverage: surface=boutique-exchange locale=en viewport=phone
            // coverage: surface=boutique-exchange locale=ar viewport=phone
            // coverage: surface=boutique-count-review locale=fr viewport=phone
            // coverage: surface=boutique-count-review locale=en viewport=phone
            // coverage: surface=boutique-count-review locale=ar viewport=phone
            cell = await tills.open(t, locale, 'phone');
          } else {
            // coverage: surface=caisse-boutique locale=fr viewport=tablet
            // coverage: surface=caisse-boutique locale=en viewport=tablet
            // coverage: surface=caisse-boutique locale=ar viewport=tablet
            // coverage: surface=boutique-exchange locale=fr viewport=tablet
            // coverage: surface=boutique-exchange locale=en viewport=tablet
            // coverage: surface=boutique-exchange locale=ar viewport=tablet
            // coverage: surface=boutique-count-review locale=fr viewport=tablet
            // coverage: surface=boutique-count-review locale=en viewport=tablet
            // coverage: surface=boutique-count-review locale=ar viewport=tablet
            cell = await tills.open(t, locale, 'tablet');
          }
          const { page } = cell;
          const key = `matrix-state-${state}-${locale}-${viewport}`;
          const strict = { ...h, baseline: { ...h.baseline, [key]: h.baseline[key] || {} } };
          const check = (region) => verify(strict, t, { page, region }, key, locale);
          await (state === 'returns' ? returns : countReview)(page, t, check);
        });
      }
    }
  }
} finally {
  await h.close();
  await h.S.finish();
}
