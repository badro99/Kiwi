#!/usr/bin/env node
// Rendered evidence is annotated only after a successful browser run.
// Rendered synthetic operator board, attachments and retest on touch screens.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { harness, realPage, verify } from './surface-matrix-lib.mjs';
import { TICKET_TAXONOMY } from '../functions/api/tickets/_taxonomy.js';
let h;
try { h = await harness('tickets-workflow'); }
catch (error) { console.error('Browser launch unavailable: ' + error.message.split('\n')[0]); process.exit(3); }
const dir = await mkdtemp(path.join(os.tmpdir(), 'kiwi-ticket-workflow-'));
const file = path.join(dir, 'synthetic.png');
await writeFile(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=', 'base64'));
try {
  for (const locale of ['fr','en','ar']) for (const viewport of ['phone','tablet']) await h.S.run(`${locale} · ${viewport} · attachment and retest`, async t => {
    const row = { id: 1, number: '#1', body: 'Synthetic report', status: 'testing', createdAt: Date.now(), updatedAt: Date.now(), kind: 'bug', area: 'sync', images: [], followups: [] };
    const actions = [];
    const routes = {
      'GET /api/tickets': () => ({ body: { tickets: [row], taxonomy: TICKET_TAXONOMY } }),
      'PATCH /api/tickets/1': async req => {
        if (req.headers()['content-type'].includes('multipart')) {
          const body = req.postData() || await req.fetchPostData() || '';
          assert.ok(body.includes('Synthetic retest failed')); assert.ok(body.includes('synthetic.png'));
          actions.push('failed'); row.status = 'problem'; row.followups.push({ id: 'followup', body: 'Synthetic retest failed', createdAt: Date.now(), images: [] });
        } else { const { action } = JSON.parse(req.postData()); actions.push(action); row.status = action === 'fixed' ? 'testing' : 'done'; }
        return { body: { ok: true, status: row.status, id: 1 } };
      },
    };
    const { page, ctx } = await realPage(h, locale, viewport, routes); t.defer(() => ctx.close()); t.watch(page);
    t.step('Open the localized board and submit an attachment with a failed retest');
    // coverage: surface=shell-tickets locale=fr viewport=phone
    // coverage: surface=shell-tickets locale=fr viewport=tablet
    // coverage: surface=shell-tickets locale=en viewport=phone
    // coverage: surface=shell-tickets locale=en viewport=tablet
    // coverage: surface=shell-tickets locale=ar viewport=phone
    // coverage: surface=shell-tickets locale=ar viewport=tablet
    await page.goto(h.base + '/tickets.html?lang=' + locale, { waitUntil: 'load' });
    const tab = async status => { if (viewport === 'phone') await page.click(`[data-status="${status}"]`); };
    await page.waitForSelector('[data-action="test-failed"]'); await tab('testing');
    await page.click('[data-action="test-failed"]'); await page.waitForSelector('#followupComposer[open]');
    await page.type('#followupBody', 'Synthetic retest failed');
    await (await page.$('#followupImages')).uploadFile(file);
    await page.waitForSelector('#followupSelectedImages img');
    const key = `tickets-followup-${locale}-${viewport}`;
    await verify({ ...h, baseline: { ...h.baseline, [key]: {} } }, t, { page, region: '#followupComposer' }, key, locale);
    await page.click('#publishFollowup'); await page.waitForSelector('#followupComposer', { hidden: true });
    await tab('problem'); await page.waitForSelector('[data-action="fixed"]'); await page.click('[data-action="fixed"]');
    await page.waitForSelector('[data-action="tested"]'); await tab('testing'); await page.click('[data-action="tested"]');
    await page.waitForFunction(() => document.querySelector('#countDone')?.textContent === '1');
    assert.deepEqual(actions, ['failed','fixed','tested']);
    assert.equal(row.followups.length, 1);
  });
} finally { await rm(dir, { recursive: true, force: true }); await h.close(); await h.S.finish(); }
