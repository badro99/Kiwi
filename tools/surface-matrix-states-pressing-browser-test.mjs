#!/usr/bin/env node
// Synthetic demo intake (dépôt), tag preview and pickup. Never print or pay.
import assert from 'node:assert/strict';
import { harness, openTill, sleep, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-states-pressing');
const tills = { open: (t, locale, viewport) => openTill(h, t, 'caisse-pressing', locale, viewport) };
const wait = { visible: true, timeout: 8000 };

async function click(page, selector) {
  await page.waitForSelector(selector, wait);
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }));
  await page.click(selector);
}

async function view(page, name) {
  const selector = `[data-px-view="${name}"]`;
  await page.waitForSelector(selector, { timeout: 8000 });
  const off = await page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return r.right <= 0 || r.left >= innerWidth;
  });
  if (off) {
    await click(page, '#pos-pressing .vx-burger');
    await page.waitForFunction((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth;
    }, { timeout: 8000 }, selector);
    await sleep(350);
  }
  await click(page, selector);
  await page.waitForSelector(`[data-px-panel="${name}"].is-on`, wait);
}

async function check(t, page, region, state, locale, viewport) {
  const key = `matrix-state-pressing-${state}-${locale}-${viewport}`;
  // Strict empty allowance for every new state, independent of shared budgets.
  const strict = { ...h, baseline: { ...h.baseline, [key]: {} } };
  await page.waitForSelector(region, wait);
  await page.evaluate(() => Promise.race([document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 1000))]));
  await sleep(350);
  await verify(strict, t, { page, region }, key, locale);
}

async function intake(t, page, locale, viewport) {
  t.step('configure a demo garment and add it to the intake ticket');
  await click(page, '[data-px-item="chemise"]');
  await page.waitForSelector('#px-sheet-veil.is-open #px-sheet-add', wait);
  await check(t, page, '#px-sheet-veil.is-open #px-sheet', 'garment', locale, viewport);
  await click(page, '#px-sheet-add');
  // On a phone the running ticket is a collapsed sheet with a real peek CTA.
  if (viewport === 'phone') await click(page, '#pos-pressing .vx-peek');
  await page.waitForSelector('#px-ticket .px-line', wait);
  assert.equal(await page.$$eval('#px-ticket .px-line', (els) => els.length), 1);

  t.step('validate intake to enter the customer then ready-date chain');
  await click(page, '#px-validate');
  await page.waitForSelector('#px-client-veil.is-open #px-cl-q', wait);
  await check(t, page, '#px-client-veil.is-open #px-clientm', 'customer', locale, viewport);
  // Search the shipped synthetic customer roster, then choose a real result.
  const name = await page.$eval('[data-px-cl] .px-cl-name', (el) => el.textContent.trim());
  await click(page, '#px-cl-q');
  await page.type('#px-cl-q', name);
  await page.waitForSelector('[data-px-cl]', wait);
  await click(page, '[data-px-cl]');
  await page.waitForSelector('#px-date-veil.is-open [data-px-d]', wait);
  await check(t, page, '#px-date-veil.is-open .modal', 'ready-date', locale, viewport);
  await click(page, '#px-date-veil.is-open [data-px-d="0"]');

  t.step('inspect both ticket copies and the garment tag without printing');
  await page.waitForSelector('#px-tags-veil.is-open #px-tags-print', wait);
  assert.equal(await page.$$eval('#px-tagsm .px-receipt', (els) => els.length), 2,
    'customer ticket and workshop duplicate are present');
  await click(page, '#px-tagsm .px-receipts-preview');
  await check(t, page, '#px-tagsm .px-receipts-preview', 'ticket-preview', locale, viewport);
  await page.$eval('#px-tagsm .px-tag', (el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForSelector('#px-tagsm .px-tag .px-tag-id', wait);
  assert.equal(await page.$$eval('#px-tagsm .px-tag', (els) => els.length), 1,
    'one physical garment has one tag');
  const tag = await page.$eval('#px-tagsm .px-tag', (el) => ({
    customer: el.querySelector('.px-tag-client').textContent.trim(),
    item: el.querySelector('.px-tag-item').textContent.trim(),
    // Arabic wraps numbers in direction isolates (U+2066..2069); the id is what is inside.
    id: el.querySelector('.px-tag-id').textContent.replace(/[\u2066-\u2069\u200e\u200f]/g, '').trim(),
  }));
  assert.ok(tag.customer && tag.item && /^\d{4}(?:-[A-Z]+)?-1$/.test(tag.id),
    'tag shows customer, garment/service and per-piece identifier');
  await check(t, page, '#px-tagsm .px-tag', 'garment-tag', locale, viewport);
}

async function pickup(t, page, locale, viewport) {
  t.step('open pickup through the menu and find a seeded ready order');
  await view(page, 'retrait');
  // With an empty query this queue contains only orders already ready.
  await page.waitForSelector('[data-px-rt-pay="1037"]', wait);
  await click(page, '#px-rt-q');
  await page.type('#px-rt-q', '1037');
  await page.waitForSelector('[data-px-rt-pay="1037"]', wait);
  assert.equal(await page.$$eval('.px-rt-card', (els) => els.length), 1,
    'ticket search isolates the ready demo order');
  assert.ok(await page.$eval('[data-px-rt-give="1037"]', (el) => el.disabled),
    'hand-over requires the remaining balance');
  await check(t, page, '[data-px-panel="retrait"].is-on', 'pickup-search', locale, viewport);
  t.step('open settlement before paying or handing over the garments');
  await click(page, '[data-px-rt-pay="1037"]');
  await page.waitForSelector('#px-pay-veil.is-open [data-px-method="especes"]', wait);
  assert.match(await page.$eval('#px-paym .modal-subtle', (el) => el.textContent), /1037/);
  assert.ok(await page.$eval('#px-paym .modal-amount', (el) => /[1-9]/.test(el.textContent)),
    'settlement shows an outstanding amount');
  await check(t, page, '#px-pay-veil.is-open #px-paym', 'pickup-settle', locale, viewport);
}

try {
  for (const locale of ['fr', 'en', 'ar']) {
    for (const viewport of ['phone', 'tablet']) {
      for (const state of ['intake', 'pickup']) {
        await h.S.run(`${state} · ${locale} · ${viewport}`, async (t) => {
          // coverage: surface=caisse-pressing locale=fr viewport=phone
          // coverage: surface=caisse-pressing locale=en viewport=phone
          // coverage: surface=caisse-pressing locale=ar viewport=phone
          // coverage: surface=caisse-pressing locale=fr viewport=tablet
          // coverage: surface=caisse-pressing locale=en viewport=tablet
          // coverage: surface=caisse-pressing locale=ar viewport=tablet
          const { page } = await tills.open(t, locale, viewport);
          t.watch(page);
          await (state === 'intake' ? intake : pickup)(t, page, locale, viewport);
        });
      }
    }
  }
} finally {
  await h.close();
  await h.S.finish();
}
