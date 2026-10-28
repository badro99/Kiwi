#!/usr/bin/env node
// Agent attachment review is distinct from stock intake's editable receipt.
// All API/external traffic is intercepted; no model can be reached.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { harness, demoPage, sleep, verify } from './surface-matrix-lib.mjs';
const h = await harness('surface-matrix-states-agent-doc');
const temp = await mkdtemp(path.join(os.tmpdir(), 'kiwi-agent-doc-'));
const png = path.join(temp, 'synthetic.png');
const pdf = path.join(temp, 'synthetic.pdf');
await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=', 'base64'));
// A small valid synthetic PDF; the UI reads it as a data URL without a parser.
const pdfParts = ['%PDF-1.4\n'];
const offsets = [0];
for (const object of [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>',
]) {
  offsets.push(Buffer.byteLength(pdfParts.join('')));
  pdfParts.push(`${offsets.length - 1} 0 obj\n${object}\nendobj\n`);
}
const xref = Buffer.byteLength(pdfParts.join(''));
pdfParts.push('xref\n0 4\n0000000000 65535 f \n' + offsets.slice(1).map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
await writeFile(pdf, pdfParts.join(''));
const words = {
  fr: ['À vérifier', 'Lecture incertaine', 'Kiwi n’a pas pu lire ce document de façon fiable. Rien n’a été enregistré : vérifiez-le à la main.'],
  en: ['Needs review', 'Uncertain reading', 'Kiwi could not read this document reliably. Nothing was recorded: check it by hand.'],
  ar: ['للمراجعة', 'قراءة غير مؤكدة', 'لم يتمكن Kiwi من قراءة هذا المستند بشكل موثوق. لم يُسجَّل أي شيء: تحقق منه يدوياً.'],
};
async function click(page, selector) {
  const el = await page.waitForSelector(selector, { visible: true, timeout: 20000 });
  await el.scrollIntoView(); await el.click();
}
async function check(t, page, state, locale, viewport) {
  const key = `matrix-state-agent-doc-${state}-${locale}-${viewport}`;
  await sleep(200);
  await verify({ ...h, baseline: { ...h.baseline, [key]: {} } }, t,
    { page, region: '.fa-drawer' }, key, locale);
}
async function open(t, locale, viewport) {
  let stubbed = 0, modelRequests = 0;
  const seen = [];
  const raw = '<img src=x onerror="window.matrixInjected=true"> Synthetic unreadable document';
  const { ctx, page } = await demoPage(h, locale, viewport, {}, {
    'POST /api/ai/vision-inspect': (req) => {
      const body = JSON.parse(req.postData() || '{}');
      seen.push(body);
      stubbed++;
      return { status: 200, body: { ok: true, data: { reviewNeeded: true, summary: raw } } };
    },
  });
  t.defer(() => ctx.close()); t.watch(page);
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.startsWith('/api/ai/')) modelRequests++;
  });
  t.step('open the demo dashboard and its assistant through navigation');
  await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(1500);
  const explore = await page.evaluateHandle(() => [...document.querySelectorAll('button,a')]
    .find((el) => /Explorer la d|Explore the d|استكشف/.test(el.textContent)) || null);
  if (explore.asElement()) await explore.asElement().click();
  await explore.dispose(); await page.keyboard.press('Escape');
  // A phone reaches the assistant from the bottom tab bar; wider screens from the header button.
  const selector = viewport === 'phone' ? '.kw-tab[data-kw-tab="ai"]' : '[data-action="open-assistant"]';
  await page.waitForSelector(selector);
  await click(page, selector);
  await page.waitForSelector('.fa-drawer .kv-attach', { visible: true });
  for (const [kind, file, mime] of [['photo', png, 'image/jpeg'], ['document', pdf, 'application/pdf']]) {
    t.step('attach synthetic ' + kind + ' through the public file picker');
    const choosing = page.waitForFileChooser();
    await click(page, '.fa-drawer .kv-attach');
    const chooser = await choosing;
    await chooser.accept([file]);
    await page.waitForSelector('.fa-drawer .kv-attach-preview', { visible: true });
    assert.ok(await page.$eval('.fa-drawer .kv-attach-preview', (el, name) => el.textContent.includes(name), path.basename(file)));
    await check(t, page, kind + '-preview', locale, viewport);
    await page.type('.fa-drawer [data-fa-input]', 'Synthetic review');
    const expected = stubbed + 1;
    await click(page, '.fa-drawer [data-fa-send]');
    await page.waitForFunction((n) => document.querySelectorAll('.kv-msg-review').length === n,
      { timeout: 15000 }, expected);
    const cards = await page.$$('.kv-msg-review');
    const card = cards.at(-1);
    await card.scrollIntoView();
    const text = await card.evaluate((el) => el.textContent);
    for (const word of words[locale]) assert.ok(text.includes(word), 'translated review: ' + word);
    assert.ok(text.includes(raw), 'model text is shown literally');
    assert.equal(await card.$$eval('button, input, textarea, [data-kv-action]', (els) => els.length), 0,
      'uncertain reading exposes no apply action or editable line UI');
    assert.equal(await page.evaluate(() => !!window.matrixInjected), false);
    assert.equal(await page.$('.fa-drawer .kv-attach-preview'), null);
    assert.ok(seen.at(-1).image.startsWith('data:' + mime));
    assert.equal(seen.at(-1).filename, path.basename(file));
    assert.equal(seen.at(-1).prompt, 'Synthetic review');
    await check(t, page, kind + '-review', locale, viewport);
  }
  assert.equal(stubbed, 2, 'both file types must reach the stub');
  assert.equal(modelRequests - stubbed, 0, 'zero real/unhandled model requests');
  t.notice('UNREACHABLE editable extracted-line review in agent-voice: reviewNeeded renders a read-only warning with no edit/apply control. Photo/PDF attachment and translated review UI are covered.');
}
try {
  await h.S.run('agent photo/document review · fr · phone', async (t) => {
    // coverage: surface=dashboard locale=fr viewport=phone
    await open(t, 'fr', 'phone');
  });
  await h.S.run('agent photo/document review · fr · tablet', async (t) => {
    // coverage: surface=dashboard locale=fr viewport=tablet
    await open(t, 'fr', 'tablet');
  });
  await h.S.run('agent photo/document review · en · phone', async (t) => {
    // coverage: surface=dashboard locale=en viewport=phone
    await open(t, 'en', 'phone');
  });
  await h.S.run('agent photo/document review · en · tablet', async (t) => {
    // coverage: surface=dashboard locale=en viewport=tablet
    await open(t, 'en', 'tablet');
  });
  await h.S.run('agent photo/document review · ar · phone', async (t) => {
    // coverage: surface=dashboard locale=ar viewport=phone
    await open(t, 'ar', 'phone');
  });
  await h.S.run('agent photo/document review · ar · tablet', async (t) => {
    // coverage: surface=dashboard locale=ar viewport=tablet
    await open(t, 'ar', 'tablet');
  });
} finally { await rm(temp, { recursive: true, force: true }); await h.close(); await h.S.finish(); }
