#!/usr/bin/env node
/* console-dossier-keyboard-browser-test · a long operator dossier walked with
 * the keyboard alone, and read the way a screen reader reads it (Chromium's
 * accessibility tree), on the real kiwi-admin.html (FR, desktop).
 *
 *   node tools/console-dossier-keyboard-browser-test.mjs
 *
 * The dossier is synthetic and long: 25 follow-ups, 30 notes, one merchant
 * among three. Network answers are synthetic; nothing reaches a server.
 * What it holds:
 *   · opening a dossier from the day's list puts the focus on the dossier's
 *     name, not on the hidden button that opened it;
 *   · the section tabs and the follow-up filters keep the focus on the button
 *     pressed after the panel is rebuilt, with aria-pressed telling which;
 *   · in a list of 25 "Mettre à jour" buttons each one is described by the
 *     title of its follow-up;
 *   · the follow-up dialog: Escape closes it back onto its button; resolving
 *     without an outcome is refused with the focus on the outcome field,
 *     marked invalid and described by the reason; once saved, the focus goes
 *     to the next follow-up rather than to the top of the page;
 *   · the note form is described by its privacy warning; a refused save says
 *     why on the field and keeps the text; a saved note leaves the focus in
 *     the form, ready for the next one. */
import assert from 'node:assert/strict';
import { harness, realPage } from './surface-matrix-lib.mjs';

const h = await harness('console-dossier-keyboard');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function focused(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return { tag: 'body', visible: false };
    const r = a.getBoundingClientRect();
    return { tag: a.tagName, op: a.dataset.op || '', value: a.dataset.value || '', id: a.id || '', name: a.name || '', visible: !!(r.width || r.height) && !a.closest('[hidden]') };
  });
}
async function tabTo(page, selector, max = 120, back = false) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches(s), selector)) return;
    if (back) { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); } else await page.keyboard.press('Tab');
  }
  assert.fail('Keyboard cannot reach ' + selector);
}
/* Name, description and invalid state of the focused element, as Chromium computes them. */
async function ax(page) {
  await page.evaluate(() => { document.querySelectorAll('[ax-probe]').forEach((e) => e.removeAttribute('ax-probe')); document.activeElement?.setAttribute('ax-probe', ''); });
  const cdp = await page.createCDPSession();
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[ax-probe]' });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const n = nodes[0] || {};
    return { name: n.name?.value || '', description: n.description?.value || '', invalid: (n.properties || []).find((p) => p.name === 'invalid')?.value?.value || 'false' };
  } finally { await cdp.detach(); await page.evaluate(() => document.querySelector('[ax-probe]')?.removeAttribute('ax-probe')); }
}

try {
  await h.S.run('long dossier by keyboard · fr · desktop', async (t) => {
    const now = Date.now(), merchant = 'synthetic-dossier';
    const clients = [
      { merchant, business: 'Synthetic dossier', type: 'restaurant', city: 'Casablanca', owner_name: 'TEST KIWI', email: 'owner@example.test', last_ts: now - 3600000, today_amount: 1200 },
      { merchant: 'synthetic-two', business: 'Synthetic two', type: 'boutique', city: 'Rabat', last_ts: now - 7200000, today_amount: 300 },
      { merchant: 'synthetic-three', business: 'Synthetic three', type: 'cafe', city: 'Fès', last_ts: now - 9000000, today_amount: 100 },
    ];
    const pad = (i) => String(i).padStart(2, '0');
    const tasks = Array.from({ length: 25 }, (_, i) => ({ id: 'task-' + pad(i + 1), merchant, title: 'Synthetic follow-up ' + pad(i + 1), detail: 'Synthetic context ' + pad(i + 1), version: 1, status: i < 3 ? 'resolved' : 'open', outcome: i < 3 ? 'Synthetic done' : '', priority: (i % 4) + 1, assignee: i % 3 ? 'op-1' : '', due_ts: now + 86400000 * (i + 1), created_ts: now - 86400000, updated_ts: now - i * 60000 }));
    const notes = Array.from({ length: 30 }, (_, i) => ({ id: 'note-' + pad(i + 1), merchant, body: 'Synthetic note ' + pad(i + 1), actor: 'Synthetic operator', ts: now - (i + 1) * 3600000 }));
    const patches = [], posted = []; let noteRefusal = true;
    const routes = {
      'GET /api/admin/clients': { clients, now, senior: true, mail: false },
      'GET /api/admin/operators': { operators: [{ id: 'op-1', label: 'Synthetic operator' }] },
      'GET /api/admin/workspace': (req) => {
        const m = new URL(req.url()).searchParams.get('merchant') || '';
        const pick = (rows) => rows.filter((r) => !m || r.merchant === m);
        return { body: { now: Date.now(), merchant: m, sources: { tasks: { available: true, rows: pick(tasks) }, notes: { available: true, rows: pick(notes) }, events: { available: true, rows: [] } } } };
      },
      'PATCH /api/admin/tasks': (req) => {
        const data = JSON.parse(req.postData()); patches.push(data);
        if (data.status === 'resolved' && !String(data.outcome || '').trim()) return { status: 400, body: { error: 'outcome-required' } };
        const task = tasks.find((x) => x.id === data.id); Object.assign(task, data, { version: task.version + 1, updated_ts: Date.now() });
        return { body: { task } };
      },
      'POST /api/admin/notes': (req) => {
        const data = JSON.parse(req.postData()); posted.push(data);
        if (noteRefusal) { noteRefusal = false; return { status: 503, body: { error: 'notes-storage-unavailable' } }; }
        if (!notes.some((n) => n.id === data.id)) notes.unshift({ ...data, actor: 'Synthetic operator', ts: Date.now() });
        return { body: { ok: true } };
      },
    };
    const { page, ctx } = await realPage(h, 'fr', 'desktop', routes);
    t.defer(() => ctx.close()); t.watch(page);
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    // coverage: surface=console locale=fr viewport=desktop
    await page.goto(h.base + '/kiwi-admin.html#today', { waitUntil: 'load' });
    const opener = `#op-workspace [data-op="merchant"][data-value="${merchant}"]`;
    await page.waitForSelector(opener, { visible: true, timeout: 30000 });

    t.step('open the dossier from the day list');
    await page.focus(opener);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#op-dossier-tabs [data-op="dossier-tab"]', { visible: true });
    await sleep(400);
    let f = await focused(page), a = await ax(page);
    check(f.visible && /Synthetic dossier/.test(a.name), `the focus lands on the dossier's name (${f.tag}#${f.id} « ${a.name} »), not on the hidden list`);

    t.step('section tabs and filters keep the focus');
    await tabTo(page, '#op-dossier-tabs [data-value="tasks"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#op-dossier-summary [data-op="filter"]', { visible: true });
    await sleep(300);
    f = await focused(page);
    check(f.op === 'dossier-tab' && f.value === 'tasks' && await page.$eval('#op-dossier-tabs [data-value="tasks"]', (e) => e.getAttribute('aria-pressed') === 'true'), 'Enter opens Suivis and the focus stays on its pressed tab');
    await tabTo(page, '#op-dossier-summary [data-op="filter"][data-value="resolved"]');
    await page.keyboard.press('Enter');
    await sleep(300);
    f = await focused(page);
    check(f.op === 'filter' && f.value === 'resolved' && f.visible, `the Résolus filter keeps the focus after the list is rebuilt (${f.tag} ${f.op}=${f.value})`);
    check(await page.$eval('#op-dossier-summary [data-op="filter"][data-value="resolved"]', (e) => e.getAttribute('aria-pressed') === 'true') && await page.$$eval('#op-dossier-summary [data-op="task"]', (e) => e.length) === 3, 'it is pressed and shows the three resolved follow-ups');
    await tabTo(page, '#op-dossier-summary [data-op="filter"][data-value="all"]', 12, true);
    await page.keyboard.press('Enter');
    await sleep(300);
    check((await focused(page)).value === 'all', 'back to À faire, still on the pressed filter');

    t.step('25 identical buttons, each described by its follow-up');
    await tabTo(page, '#op-dossier-summary [data-op="task"][data-value="task-07"]');
    a = await ax(page);
    check(a.name === 'Mettre à jour' && /Synthetic follow-up 07/.test(a.description), `the button reads « ${a.name} » described by « ${a.description} »`);

    t.step('the follow-up dialog');
    const order = await page.$$eval('#op-dossier-summary [data-op="task"]', (e) => e.map((b) => b.dataset.value));
    const after07 = order[order.indexOf('task-07') + 1];
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.op-dialog[open]');
    await sleep(150);
    check(await page.evaluate(() => document.querySelector('dialog.op-dialog[open]').contains(document.activeElement)), 'Enter opens the dialog with the focus inside it');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.op-dialog', { hidden: true }).catch(() => {});
    await sleep(200);
    f = await focused(page);
    check(f.op === 'task' && f.value === 'task-07', 'Escape closes it back onto its button');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.op-dialog[open]');
    await page.select('dialog.op-dialog select[name="status"]', 'resolved');
    await tabTo(page, 'dialog.op-dialog button[type="submit"]', 20);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (document.querySelector('dialog.op-dialog .op-error')?.textContent || '').length > 0);
    await sleep(150);
    f = await focused(page); a = await ax(page);
    check(f.name === 'outcome' && a.invalid === 'true' && /résultat est requis/i.test(a.description), `resolving without an outcome puts the focus on it, invalid and described (« ${a.description} »)`);
    await page.keyboard.type('Synthetic outcome by keyboard');
    a = await ax(page);
    check(a.invalid === 'false', 'typing an outcome clears its invalid state');
    await tabTo(page, 'dialog.op-dialog button[type="submit"]', 20);
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.op-dialog', { hidden: true, timeout: 5000 }).catch(() => {});
    await sleep(600);
    check(tasks.find((x) => x.id === 'task-07').status === 'resolved' && patches.at(-1).outcome === 'Synthetic outcome by keyboard', 'the follow-up is resolved with the outcome typed');
    f = await focused(page);
    check(f.op === 'task' && f.value === after07 && f.visible, `the focus moves to the follow-up that came next (${f.op}=${f.value}, expected ${after07}), not to the top of the page`);

    t.step('the note form');
    await tabTo(page, '#op-dossier-tabs [data-value="summary"]', 200, true);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#op-dossier-summary form[data-note] textarea', { visible: true });
    await sleep(300);
    check(await page.$$eval('#op-dossier-summary .op-timeline-item', (e) => e.length) >= 30, 'the relation log carries the long history');
    await tabTo(page, '#op-dossier-summary form[data-note] textarea[name="body"]');
    a = await ax(page);
    check(/Ne pas ajouter de PIN/.test(a.description), `the note field is described by its privacy warning (« ${a.description} »)`);
    await page.keyboard.type('Synthetic keyboard note');
    await tabTo(page, '#op-dossier-summary form[data-note] button[type="submit"]', 6);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (document.querySelector('#op-dossier-summary form[data-note] .op-error')?.textContent || '').length > 0);
    await sleep(150);
    f = await focused(page); a = await ax(page);
    check(f.name === 'body' && /indisponible|réessayez|notes/i.test(a.description) && await page.$eval('#op-dossier-summary form[data-note] textarea', (e) => e.value) === 'Synthetic keyboard note', `a refused note keeps its text, focus on the field described by the reason (« ${a.description} »)`);
    await tabTo(page, '#op-dossier-summary form[data-note] button[type="submit"]', 6);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#op-dossier-summary')?.textContent.includes('Synthetic keyboard note') && !document.querySelector('#op-dossier-summary form[data-note] textarea').value, { timeout: 5000 });
    await sleep(300);
    f = await focused(page);
    check(f.name === 'body' && f.visible && posted.length === 2 && posted[0].id === posted[1].id, 'the saved note (same id on retry) leaves the focus in the empty note field');
    check(errors.length === 0, `no page error ${errors.join(' | ')}`);
  });
} finally { await h.close(); }
if (!h.S.counts.failed && !h.S.counts.infra) console.log(`✓ console-dossier-keyboard-browser-test · ${checks} checks`);
await h.S.finish();
