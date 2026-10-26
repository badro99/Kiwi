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


const documentFile = path.join(temp, 'synthetic.pdf');
// A local, text-only supplier document. The extraction route below is a fixture.
const stream = 'BT /F1 12 Tf 40 100 Td (TEST KIWI supplier invoice) Tj ET';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += (i + 1) + ' 0 obj\n' + body + '\nendobj\n'; });
const xref = Buffer.byteLength(pdf);
pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
await writeFile(documentFile, pdf);

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
  async open(t, locale, viewport, assistant = false) {
    const { ctx, page } = await demoPage(h, locale, viewport, {}, {
      'POST /api/ai/invoice': { ok: true, supplier: {name:'TEST KIWI'}, lines: [{name:'TEST KIWI',qty:1,unitCost:1}] },
    });
    await page.evaluateOnNewDocument(() => performance.setResourceTimingBufferSize(4000));
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
    const ownerCounts = () => page.evaluate(() => {
      const counts = { 'catalog-import': 0, finance: 0, conformite: 0, 'operations-ui': 0 };
      for (const script of document.scripts) {
        const match = script.src.match(/\/assets\/(catalog-import|finance|conformite|operations-ui)\.js\?/);
        if (match) counts[match[1]]++;
      }
      return counts;
    });
    assert.deepEqual(await ownerCounts(), { 'catalog-import': 0, finance: 1, conformite: 1, 'operations-ui': 1 },
      'synchronous drawer providers are eager; the optional importer waits for first use');
    if (assistant) {
      t.step('open the assistant and render a synthetic invoice inspection without a model');
      await page.evaluate(() => window.KiwiAgent.open());
      await page.waitForSelector('[data-fa-thread]', wait);
      await page.evaluate(() => window.KiwiVision.renderResult({
        docType:'invoice', confidence:1, title:'TEST KIWI', summary:'Synthetic local fixture',
        entities:{supplier:'TEST KIWI'},
        suggestedActions:[{type:'stock-receive',label:'TEST KIWI',primary:true}],
      }, document.querySelector('[data-fa-thread]'), () => {}));
      t.step('hand off the inspected document to the same stock receipt workflow');
      await click(page, '[data-kv-action="stock-receive"]');
    } else {
      t.step('open stock through the sidebar, opening the phone menu first');
      await view(page);
    }
    await page.evaluate(() => window.KiwiDashboardLoader.load('workspace'));
    await sleep(700);
    assert.deepEqual(await ownerCounts(), { 'catalog-import': 1, finance: 1, conformite: 1, 'operations-ui': 1 },
      'first use loads the importer once and never executes eager providers again');
    if (!assistant) {
      t.step('open stock tools and photo/document intake');
      await click(page, '[data-action="stock-workspace-actions"]');
      await click(page, '[data-catalog-stock="stock-scan-invoice"]');
    }
    await page.waitForSelector('[data-stock-pick-file]', wait);
    await page.waitForSelector('[data-stock-pick-cam]', wait);
    return { page, region: '.kiwi-backdrop .kiwi-modal', modelRequests: () => modelRequests };
  },
};

async function review(t, cell, locale, viewport, document = false) {
  await check(t, cell, 'upload', locale, viewport);
  t.step(document ? 'choose a synthetic text PDF through the file picker' : 'choose a synthetic PNG through the file picker');
  const chooser = cell.page.waitForFileChooser();
  await click(cell.page, '[data-stock-pick-file]');
  await chooser;
  const input = await cell.page.$('[data-stock-file-input]');
  await input.uploadFile(document ? documentFile : image);
  await input.dispose();
  await cell.page.waitForSelector('[data-stock-receive-rows]', wait);
  await cell.page.waitForSelector('[data-stock-scan-confirm]', wait);
  assert.equal(await cell.page.$$eval('[data-stock-receive-row]', (rows) => rows.length), document ? 1 : 3,
    'the shared review exposes extracted document lines or three manual photo lines');
  if (!document) t.notice('Photo intake deliberately uses manual review, no image extraction is claimed.');
  await check(t, cell, 'manual-review', locale, viewport);
  t.step('correct the first line quantity using typing and verify the editable value');
  const qty = '[data-stock-receive-qty]';
  await click(cell.page, qty);
  await cell.page.click(qty, {clickCount:3});
  await cell.page.keyboard.press('Backspace');
  await cell.page.type(qty, '2');
  await cell.page.keyboard.press('Tab');
  assert.equal(await cell.page.$eval(qty, (el) => el.value), '2');
  assert.equal(cell.modelRequests(), document ? 1 : 0, 'only the document fixture route may be requested');
  await check(t, cell, 'corrected-review', locale, viewport);
  t.step('select a stock item, name the supplier and save the reviewed receipt');
  const itemId = await cell.page.$eval('[data-stock-receive-item]', el => [...el.options].find(o => o.value).value);
  const before = await cell.page.evaluate(id => window.KiwiRestaurantStock.rows().find(r => r.id === id).currentStock, itemId);
  await cell.page.select('[data-stock-receive-item]', itemId);
  await cell.page.type('[data-stock-receive-supplier]', ' TEST KIWI');
  await click(cell.page, '[data-stock-scan-confirm]');
  await cell.page.waitForSelector('[data-stock-receive-rows]', {hidden:true,timeout:10000});
  const after = await cell.page.evaluate(id => window.KiwiRestaurantStock.rows().find(r => r.id === id).currentStock, itemId);
  assert.equal(after, before + 2, 'one confirmed receipt adds exactly the corrected quantity');
}

try {
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · fr · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · fr · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=fr viewport=phone
    // coverage: surface=dashboard-intake-photo locale=fr viewport=phone
    const cell = await intake.open(t, 'fr', 'phone');
    await review(t, cell, 'fr', 'phone', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · fr · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · fr · tablet', async (t) => {
    // coverage: surface=dashboard-stock locale=fr viewport=tablet
    // coverage: surface=dashboard-intake-photo locale=fr viewport=tablet
    const cell = await intake.open(t, 'fr', 'tablet');
    await review(t, cell, 'fr', 'tablet', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · en · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · en · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=en viewport=phone
    // coverage: surface=dashboard-intake-photo locale=en viewport=phone
    const cell = await intake.open(t, 'en', 'phone');
    await review(t, cell, 'en', 'phone', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · en · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · en · tablet', async (t) => {
    // coverage: surface=dashboard-stock locale=en viewport=tablet
    // coverage: surface=dashboard-intake-photo locale=en viewport=tablet
    const cell = await intake.open(t, 'en', 'tablet');
    await review(t, cell, 'en', 'tablet', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · ar · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · ar · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=ar viewport=phone
    // coverage: surface=dashboard-intake-photo locale=ar viewport=phone
    const cell = await intake.open(t, 'ar', 'phone');
    await review(t, cell, 'ar', 'phone', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · ar · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · ar · tablet', async (t) => {
    // coverage: surface=dashboard-stock locale=ar viewport=tablet
    // coverage: surface=dashboard-intake-photo locale=ar viewport=tablet
    const cell = await intake.open(t, 'ar', 'tablet');
    await review(t, cell, 'ar', 'tablet', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · fr · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · fr · phone', async (t) => {
    // coverage: surface=dashboard-intake-document locale=fr viewport=phone
    const cell = await intake.open(t, 'fr', 'phone');
    await review(t, cell, 'fr', 'phone', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · fr · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · fr · tablet', async (t) => {
    // coverage: surface=dashboard-intake-document locale=fr viewport=tablet
    const cell = await intake.open(t, 'fr', 'tablet');
    await review(t, cell, 'fr', 'tablet', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · en · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · en · phone', async (t) => {
    // coverage: surface=dashboard-intake-document locale=en viewport=phone
    const cell = await intake.open(t, 'en', 'phone');
    await review(t, cell, 'en', 'phone', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · en · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · en · tablet', async (t) => {
    // coverage: surface=dashboard-intake-document locale=en viewport=tablet
    const cell = await intake.open(t, 'en', 'tablet');
    await review(t, cell, 'en', 'tablet', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · ar · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · ar · phone', async (t) => {
    // coverage: surface=dashboard-intake-document locale=ar viewport=phone
    const cell = await intake.open(t, 'ar', 'phone');
    await review(t, cell, 'ar', 'phone', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · ar · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · ar · tablet', async (t) => {
    // coverage: surface=dashboard-intake-document locale=ar viewport=tablet
    const cell = await intake.open(t, 'ar', 'tablet');
    await review(t, cell, 'ar', 'tablet', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · fr · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · fr · phone', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=fr viewport=phone
    const cell = await intake.open(t, 'fr', 'phone', true);
    await review(t, cell, 'fr', 'phone');
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · fr · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · fr · tablet', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=fr viewport=tablet
    const cell = await intake.open(t, 'fr', 'tablet', true);
    await review(t, cell, 'fr', 'tablet');
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · en · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · en · phone', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=en viewport=phone
    const cell = await intake.open(t, 'en', 'phone', true);
    await review(t, cell, 'en', 'phone');
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · en · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · en · tablet', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=en viewport=tablet
    const cell = await intake.open(t, 'en', 'tablet', true);
    await review(t, cell, 'en', 'tablet');
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · ar · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · ar · phone', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=ar viewport=phone
    const cell = await intake.open(t, 'ar', 'phone', true);
    await review(t, cell, 'ar', 'phone');
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · ar · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · ar · tablet', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=ar viewport=tablet
    const cell = await intake.open(t, 'ar', 'tablet', true);
    await review(t, cell, 'ar', 'tablet');
  });
} finally {
  await rm(temp, { recursive: true, force: true });
  await h.close();
  await h.S.finish();
}
