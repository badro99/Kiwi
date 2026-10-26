#!/usr/bin/env node
// Real localized followup administration, synthetic network only.
import assert from 'node:assert/strict';
import { harness, realPage, verify } from './surface-matrix-lib.mjs';
const h = await harness('operator-followups');
async function tabTo(page, selector) {
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(s => document.activeElement?.matches(s), selector)) return;
    await page.keyboard.press('Tab');
  }
  assert.fail('Keyboard cannot reach ' + selector);
}
try {
  for (const locale of ['fr', 'en', 'ar']) for (const viewport of ['phone', 'tablet', 'desktop']) await h.S.run(`${locale} · ${viewport}`, async t => {
    const merchant = 'synthetic-followups';
    const task = { id: 'task-synthetic', merchant, title: 'Synthetic next step', version: 1, status: 'open', outcome: '' };
    const patches = [], notes = []; let refuse = true, noteRefusal = true;
    const routes = {
      'GET /api/admin/clients': { clients: [{ merchant, business: 'Synthetic merchant' }] },
      'GET /api/admin/workspace': () => ({ body: { merchant, sources: { tasks: { available: true, rows: [task] }, notes: { available: true, rows: notes } } } }),
      'PATCH /api/admin/tasks': req => {
        const data = JSON.parse(req.postData()); patches.push(data);
        if (refuse) return { status: 409, body: { error: 'version-conflict' } };
        assert.equal(data.version, task.version); Object.assign(task, data, { version: task.version + 1 }); return { body: { task } };
      },
      'POST /api/admin/notes': req => {
        const data = JSON.parse(req.postData());
        if (!notes.some(n => n.id === data.id)) notes.push({ ...data, actor: 'Synthetic operator' });
        if (noteRefusal) { noteRefusal = false; return { status: 503, body: { error: 'notes-storage-unavailable' } }; }
        assert.equal(data.id, notes[0].id); return { body: { ok: true } };
      },
    };
    const { page, ctx } = await realPage(h, locale, viewport, routes); t.defer(() => ctx.close()); t.watch(page);
    // coverage: surface=console locale=fr viewport=phone
    // coverage: surface=console locale=fr viewport=tablet
    // coverage: surface=console locale=fr viewport=desktop
    // coverage: surface=console locale=en viewport=phone
    // coverage: surface=console locale=en viewport=tablet
    // coverage: surface=console locale=en viewport=desktop
    // coverage: surface=console locale=ar viewport=phone
    // coverage: surface=console locale=ar viewport=tablet
    // coverage: surface=console locale=ar viewport=desktop
    await page.goto(h.base + '/kiwi-admin-followups.html?lang=' + locale, { waitUntil: 'load' });
    await page.waitForSelector('[data-task]');
    assert.equal(await page.$eval('h1', e => e.textContent), { fr: 'Suivis et notes', en: 'Followups and notes', ar: 'المتابعات والملاحظات' }[locale]);
    await tabTo(page, '[data-task]'); await page.keyboard.press('Enter');
    await page.waitForSelector('#task-editor:not([hidden])');
    assert.equal(await page.$eval('#save-task', e => e.textContent), { fr: 'Enregistrer', en: 'Save', ar: 'حفظ' }[locale]);
    await page.select('#task-status', 'resolved');
    await tabTo(page, '#task-outcome'); await page.keyboard.type('Synthetic resolution');
    await tabTo(page, '#save-task'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#task-error').textContent.length > 0);
    assert.equal(await page.$eval('#task-outcome', e => e.value), 'Synthetic resolution');
    assert.equal(task.status, 'open');
    const key = `operator-followups-${locale}-${viewport}`;
    await verify({ ...h, baseline: { ...h.baseline, [key]: {} } }, t, { page, region: 'main' }, key, locale);
    refuse = false;
    await tabTo(page, '#reload-task'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#reload-task').disabled);
    assert.equal(await page.$eval('#task-outcome', e => e.value), 'Synthetic resolution');
    await tabTo(page, '#save-task'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#task-editor').hidden);
    assert.equal(task.status, 'resolved'); assert.equal(patches.length, 2);
    await tabTo(page, '#note-body'); await page.keyboard.type('Synthetic internal note');
    await tabTo(page, '#save-note'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#note-error').textContent.length > 0);
    assert.equal(await page.$eval('#note-body', e => e.value), 'Synthetic internal note');
    await tabTo(page, '#save-note'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#notes').textContent.includes('Synthetic internal note'));
    assert.equal(notes.length, 1);
    assert.equal(notes[0].body, 'Synthetic internal note'); assert.equal(notes[0].merchant, merchant); assert.ok(notes[0].id);
    await verify({ ...h, baseline: { ...h.baseline, [key]: {} } }, t, { page, region: 'main' }, key, locale);
  });
} finally { await h.close(); await h.S.finish(); }
