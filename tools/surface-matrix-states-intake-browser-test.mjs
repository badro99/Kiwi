#!/usr/bin/env node
// Synthetic photo intake through public dashboard UI. No model or hosted data.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { harness, demoPage, sleep, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-states-intake');
const wait = { visible: true, timeout: 10000 };
const temp = await mkdtemp(path.join(os.tmpdir(), 'kiwi-intake-'));
const image = path.join(temp, 'synthetic.png');
// One synthetic pixel, generated into a disposable directory on every run.
await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=', 'base64'));

async function click(page, selector) {
  await page.waitForSelector(selector, wait);
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }));
  await page.click(selector);
}

async function view(page) {
  const selector = '[data-nav="stock"]';
  await page.waitForSelector(selector, { timeout: 30000 });
  const off = await page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return r.right <= 0 || r.left >= innerWidth || !!el.closest('[inert]');
  });
  if (off) {
    // Off screen behind the menu (phone, tablet): same entry as dashboardWalker,
    // the sidebar link clicked in script. Every later step is a real click.
    await page.evaluate((s) => document.querySelector(s).click(), selector);
  } else await click(page, selector);
  await page.waitForSelector('.dash-stock', wait);
}

async function check(t, cell, state, locale, viewport) {
  const key = `matrix-state-intake-${state}-${locale}-${viewport}`;
  const strict = { ...h, baseline: { ...h.baseline, [key]: {} } };
  await cell.page.waitForSelector(cell.region, wait);
  await cell.page.evaluate(() => Promise.race([document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 1000))]));
  await sleep(350);
  await verify(strict, t, cell, key, locale);
}

const intake = {
  async open(t, locale, viewport) {
    const { ctx, page } = await demoPage(h, locale, viewport);
    t.defer(() => ctx.close());
    t.watch(page);
    let modelRequests = 0;
    // demoPage already responds offline to every API request and aborts every
    // external origin. Even a regression cannot reach a paid model.
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/ai/')) modelRequests++;
    });
    t.step('load demo dashboard and enter the demo using its visible button');
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    await sleep(1500);
    const explore = await page.evaluateHandle(() => [...document.querySelectorAll('button,a')]
      .find((el) => /Explorer la d|Explore the d|استكشف/.test(el.textContent)) || null);
    if (explore.asElement()) await explore.asElement().click();
    await explore.dispose();
    await page.keyboard.press('Escape');
    t.step('open stock through the sidebar, opening the phone menu first');
    await view(page);
    t.step('open stock tools and photo/document intake');
    await click(page, '[data-action="stock-workspace-actions"]');
    await click(page, '[data-catalog-stock="stock-scan-invoice"]');
    await page.waitForSelector('[data-stock-pick-file]', wait);
    await page.waitForSelector('[data-stock-pick-cam]', wait);
    return { page, region: '.kiwi-backdrop .kiwi-modal', modelRequests: () => modelRequests };
  },
};

async function review(t, cell, locale, viewport) {
  await check(t, cell, 'upload', locale, viewport);
  t.step('choose a synthetic PNG through the file picker');
  const chooser = cell.page.waitForFileChooser();
  await click(cell.page, '[data-stock-pick-file]');
  await chooser;
  const input = await cell.page.$('[data-stock-file-input]');
  await input.uploadFile(image);
  await input.dispose();
  await cell.page.waitForSelector('[data-stock-receive-rows]', wait);
  await cell.page.waitForSelector('[data-stock-scan-confirm]', wait);
  assert.equal(await cell.page.$$eval('[data-stock-receive-row]', (rows) => rows.length), 3,
    'photo fallback must expose three editable manual lines');
  t.notice('UNREACHABLE extracted image lines: intake.js sends photos directly to manual receipt review; image extraction is not implemented. No extracted-line coverage claimed.');
  await check(t, cell, 'manual-review', locale, viewport);
  t.step('correct the first line quantity using typing and verify the editable value');
  const qty = '[data-stock-receive-qty]';
  await click(cell.page, qty);
  await cell.page.keyboard.press('Home');
  await cell.page.type(qty, '2');
  await cell.page.keyboard.press('Tab');
  assert.equal(await cell.page.$eval(qty, (el) => el.value), '2');
  assert.equal(cell.modelRequests(), 0, 'photo intake must never request a network model');
  await check(t, cell, 'corrected-review', locale, viewport);
  await cell.page.keyboard.press('Escape');
}

try {
  await h.S.run('photo intake · fr · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=fr viewport=phone
    const cell = await intake.open(t, 'fr', 'phone');
    await review(t, cell, 'fr', 'phone');
  });
  await h.S.run('photo intake · fr · tablet', async (t) => {
    // coverage: surface=dashboard-stock locale=fr viewport=tablet
    const cell = await intake.open(t, 'fr', 'tablet');
    await review(t, cell, 'fr', 'tablet');
  });
  await h.S.run('photo intake · en · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=en viewport=phone
    const cell = await intake.open(t, 'en', 'phone');
    await review(t, cell, 'en', 'phone');
  });
  await h.S.run('photo intake · en · tablet', async (t) => {
    // coverage: surface=dashboard-stock locale=en viewport=tablet
    const cell = await intake.open(t, 'en', 'tablet');
    await review(t, cell, 'en', 'tablet');
  });
  await h.S.run('photo intake · ar · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=ar viewport=phone
    const cell = await intake.open(t, 'ar', 'phone');
    await review(t, cell, 'ar', 'phone');
  });
  await h.S.run('photo intake · ar · tablet', async (t) => {
    // coverage: surface=dashboard-stock locale=ar viewport=tablet
    const cell = await intake.open(t, 'ar', 'tablet');
    await review(t, cell, 'ar', 'tablet');
  });
} finally {
  await rm(temp, { recursive: true, force: true });
  await h.close();
  await h.S.finish();
}
