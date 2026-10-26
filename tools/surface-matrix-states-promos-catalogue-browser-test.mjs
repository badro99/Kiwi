#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
// Synthetic, offline dashboard edits only. No credentials or internal handlers.
import assert from 'node:assert/strict';
import { harness, dashboardWalker, sleep, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-states-promos-catalogue');
const dashboards = dashboardWalker(h);
const wait = { visible: true, timeout: 8000 };
async function click(page, selector) {
  await page.waitForSelector(selector, wait);
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }));
  // Sheets slide in on phones: click once the target has stopped moving.
  await page.waitForFunction((s) => {
    const r = document.querySelector(s).getBoundingClientRect(), at = r.top + ',' + r.left;
    const still = window.__matrixAt === at; window.__matrixAt = at; return still;
  }, { polling: 100, timeout: 5000 }, selector);
  await page.click(selector);
}
async function view(page, selector) {
  await page.waitForSelector(selector, { timeout: 8000 });
  const off = await page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return r.right <= 0 || r.left >= innerWidth;
  });
  if (off) {
    // Off screen behind the menu (phone, tablet): same entry as dashboardWalker,
    // the sidebar link clicked in script. Every later step is a real click.
    await page.evaluate((s) => document.querySelector(s).click(), selector);
  } else await click(page, selector);
}
async function type(page, selector, value) {
  await click(page, selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value);
  await page.keyboard.press('Tab');
}
async function check(t, page, region, state, locale, viewport) {
  const key = `matrix-state-${state}-${locale}-${viewport}`;
  const strict = { ...h, baseline: { ...h.baseline, [key]: {} } };
  await page.waitForSelector(region, wait);
  await page.$eval(region, (el) => el.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => Promise.race([document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 1000))]));
  await sleep(350);
  await verify(strict, t, { page, region }, key, locale);
}
async function promotions(t, page, locale, viewport) {
  t.step('open Promotions and create an offer');
  await view(page, '[data-nav="promos"]');
  await click(page, '[data-action="bpd-new"]');
  await type(page, '#bpd-name', 'TEST KIWI promotion');
  await click(page, '[data-prk="percent"]');
  await click(page, '[data-prv="20"]');
  await check(t, page, '.bpd-step:nth-child(1)', 'promo-offer', locale, viewport);
  t.step('choose all catalogue items in the second section');
  await click(page, '[data-prs="tout"]');
  await check(t, page, '.bpd-step:nth-child(2)', 'promo-items', locale, viewport);
  t.step('schedule seven days in the third section');
  await click(page, '[data-prw="7"]');
  assert.ok(await page.$eval('#bpd-to', (el) => !!el.value), 'duration populated');
  await check(t, page, '.bpd-step:nth-child(3)', 'promo-duration', locale, viewport);
  t.step('verify live preview responds to a discount change');
  const before = await page.$eval('.bpd-swap .next b', (el) => el.textContent);
  await click(page, '[data-prv="30"]');
  await page.waitForFunction((old) => document.querySelector('.bpd-swap .next b')?.textContent !== old, {}, before);
  assert.ok(await page.$eval('.bpd-preview-head b', (el) => Number(el.textContent) > 0));
  await check(t, page, '.bpd-preview', 'promo-preview', locale, viewport);
  t.step('enter zero discount and verify the validation message blocks launch');
  await type(page, '#bpd-value', '0');
  const error = { fr: 'Choisissez de combien vous baissez le prix', en: 'Choose how much to lower the price', ar: 'اختر قيمة تخفيض السعر' };
  assert.equal(await page.$eval('.bpd-problem', (el) => el.textContent.trim()), error[locale]);
  assert.ok(await page.$eval('#bpd-save', (el) => el.disabled));
  await check(t, page, '.bpd-compose-foot', 'promo-invalid', locale, viewport);
  await click(page, '[data-bpd-cancel]');
}
async function catalogue(t, page, locale, viewport) {
  t.step('open catalogue and submit an empty new product');
  await view(page, '[data-nav="inventory"]');
  await click(page, '[data-action="bqx-new"]');
  await check(t, page, '[data-bqx-pf]', 'product-new', locale, viewport);
  await click(page, '[data-action="bqx-new-save"]');
  await page.waitForSelector('[data-bqx-name][aria-invalid="true"]', wait);
  await page.waitForSelector('[data-bqx-pf-err="name"]:not([hidden])', wait);
  await check(t, page, '[data-bqx-pf]', 'product-invalid', locale, viewport);
  t.step('create a synthetic clothing product');
  await type(page, '[data-bqx-name]', 'TEST KIWI matrix garment');
  await type(page, '[data-bqx-price]', '180');
  await click(page, '[data-bqx-kind][value="taille"]');
  if (await page.$('[data-bqx-ab]')) await click(page, '[data-bqx-ab][value="outright"]');
  await click(page, '[data-action="bqx-new-save"]');
  await page.waitForSelector('[data-action="bqx-var-add"]', wait);
  for (const [index, size] of ['S', 'M'].entries()) {
    t.step('add colour and size variant ' + size);
    // The previous variant sheet animates out; type only into the one now open.
    await page.waitForFunction(() => !document.querySelector('[data-bqx-va]'), { timeout: 8000 });
    await click(page, '[data-action="bqx-var-add"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-bqx-va]').length === 1, { timeout: 8000 });
    const colours = await page.$$('[data-bqx-va-color] [data-kc-color]');
    assert.ok(colours.length >= 2, 'colour picker offers multiple colours');
    await colours[index].click();
    await type(page, '[data-bqx-vsize]', size);
    await click(page, '[data-bqx-vbc][value="none"]');
    await check(t, page, '[data-bqx-va]', 'product-variant-' + size, locale, viewport);
    await click(page, '[data-bqx-va-go]');
    await page.waitForFunction((n) => document.querySelectorAll('.bqx-vlist .bqx-vr').length === n, { timeout: 8000 }, index + 1)
      .catch(async (e) => { throw new Error(e.message + ' rows: ' + JSON.stringify(await page.$$eval('.bqx-vlist .bqx-vr', (els) => els.map((el) => el.textContent.trim())))); });
  }
  const rows = await page.$$eval('.bqx-vlist .bqx-vr', (els) => els.map((el) => el.textContent));
  assert.ok(rows.length === 2 && rows.some((r) => / S\b|^S\b|\bS /.test(r)) && rows.some((r) => / M\b|^M\b|\bM /.test(r)),
    'both sizes appear in the product sheet: ' + JSON.stringify(rows));
  const colours = await page.$$eval('.bqx-vlist .bqx-cbtn', (els) => els.map((el) => el.textContent.trim()));
  assert.equal(new Set(colours).size, 2, 'two distinct colours saved');
  await check(t, page, '.bqx-sheet', 'product-sizes-colours', locale, viewport);
  await page.keyboard.press('Escape');
}
try {
  for (const locale of forLocales(['fr', 'en', 'ar'])) {
    for (const viewport of ['phone', 'tablet']) {
      await h.S.run(`promos and catalogue · ${locale} · ${viewport}`, async (t) => {
        // coverage: surface=dashboard locale=fr viewport=phone
        // coverage: surface=dashboard locale=en viewport=phone
        // coverage: surface=dashboard locale=ar viewport=phone
        // coverage: surface=dashboard locale=fr viewport=tablet
        // coverage: surface=dashboard locale=en viewport=tablet
        // coverage: surface=dashboard locale=ar viewport=tablet
        // coverage: surface=dashboard-promotion-editor locale=fr viewport=phone
        // coverage: surface=dashboard-promotion-editor locale=fr viewport=tablet
        // coverage: surface=dashboard-promotion-editor locale=en viewport=phone
        // coverage: surface=dashboard-promotion-editor locale=en viewport=tablet
        // coverage: surface=dashboard-promotion-editor locale=ar viewport=phone
        // coverage: surface=dashboard-promotion-editor locale=ar viewport=tablet
        // coverage: surface=dashboard-product-editor locale=fr viewport=phone
        // coverage: surface=dashboard-product-editor locale=fr viewport=tablet
        // coverage: surface=dashboard-product-editor locale=en viewport=phone
        // coverage: surface=dashboard-product-editor locale=en viewport=tablet
        // coverage: surface=dashboard-product-editor locale=ar viewport=phone
        // coverage: surface=dashboard-product-editor locale=ar viewport=tablet
        const { page } = await dashboards.open(t, 'dashboard-transactions', locale, viewport);
        t.watch(page);
        t.step('switch to the demo Maison Mansour boutique');
        await view(page, '[data-action="venue-toggle"]');
        await view(page, '[data-action="venue-pick"][data-venue="maisonMansour"]');
        await page.waitForSelector('[data-nav="promos"]', { timeout: 8000 });
        await promotions(t, page, locale, viewport);
        await catalogue(t, page, locale, viewport);
      });
    }
  }
} finally {
  await h.close();
  await h.S.finish();
}
