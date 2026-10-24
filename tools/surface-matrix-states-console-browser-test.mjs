#!/usr/bin/env node
// FR only: EN/AR remain an owner decision. Every record and response is synthetic.
import assert from 'node:assert/strict';
import { harness, realPage, verify, sleep } from './surface-matrix-lib.mjs';
const h = await harness('surface-matrix-states-console');
async function focus(page, selector) {
  assert.ok(await page.evaluate(s => {
    const e = document.activeElement, r = e.getBoundingClientRect(), c = getComputedStyle(e);
    return e.matches(s) && r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && e.matches(':focus-visible') && ((c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== 'none');
  }, selector), `visible focus on ${selector}`);
}
async function seek(page, selector, backwards = false) {
  for (let i = 0; i < 180; i++) {
    if (await page.evaluate(s => document.activeElement?.matches(s), selector)) { await focus(page, selector); return; }
    if (backwards) await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    if (backwards) await page.keyboard.up('Shift');
    assert.ok(await page.evaluate(() => !document.querySelector('dialog[open]') || document.activeElement === document.body || !!document.activeElement.closest('dialog[open]')), 'Tab must not reach background controls while the modal is open');
  }
  throw new Error('Keyboard cannot reach ' + selector);
}
try {
  for (const viewport of ['phone', 'tablet', 'desktop']) await h.S.run(`console · fr · ${viewport}`, async t => {
    const merchant = 'matrix-console-synthetic';
    const task = { id: 'matrix-followup', merchant, version: 1, title: 'Rappeler le commerce fictif', detail: 'Vérification synthétique', status: 'open', priority: 2 };
    const notes = [], patches = []; let reject = false;
    const sources = Object.fromEntries(['tasks','notes','events','activity','board','errors','print','bridges','quarantine','support','integrations','caisseSync','shopify','shopifyLink','receivables','unpaidTables','zChecks','conflicts','tenantGuard','discountPolicy'].map(k => [k, { available: true, rows: [] }]));
    sources.tasks.rows = [task]; sources.notes.rows = notes;
    const routes = {
      'GET /api/me': { authenticated: true, operator: true },
      'GET /api/admin/clients': { now: Date.now(), senior: true, clients: [{ merchant, business: 'Commerce Matrice Fictif', email: 'matrix@example.test', owner: 'matrix@example.test', type: 'retail', city: 'Ville test', demo: false, status: 'active', store_status: 'active', today_amount: 0, today_count: 0 }] },
      'GET /api/admin/operators': { operators: [] },
      'GET /api/admin/overview': {},
      'GET /api/admin/workspace': req => ({ body: { now: Date.now(), merchant: new URL(req.url()).searchParams.get('merchant') || '', sources } }),
      'PATCH /api/admin/tasks': req => { const data = JSON.parse(req.postData()); patches.push(data); if (reject) return { status: 503, body: { error: 'task-storage-unavailable' } }; Object.assign(task, data, { version: task.version + 1 }); return { body: { task } }; },
      'POST /api/admin/notes': req => { const data = JSON.parse(req.postData()); notes.push({ ...data, actor: 'Opérateur fictif', ts: Date.now() }); return { body: { ok: true } }; },
    };
    const { page, ctx } = await realPage(h, 'fr', viewport, routes); t.defer(() => ctx.close()); t.watch(page);
    const keyboard = viewport !== 'phone';
    const act = async (s, key = 'Enter') => { await page.waitForSelector(s, { visible: true }); if (keyboard) { await seek(page, s); await page.keyboard.press(key); } else await page.click(s); await sleep(180); };
    // A keyboard user lands at the start of a filled field and presses End before adding to it.
    const fill = async (s, value) => { if (keyboard) { await seek(page, s); await page.keyboard.press('End'); } else await page.click(s); await page.keyboard.type(value); };
    const check = async state => { const key = `matrix-console-${state}-${viewport}`; await verify({ ...h, baseline: { ...h.baseline, [key]: {} } }, t, { page, region: 'main' }, key, 'fr'); };
    // coverage: surface=console locale=fr viewport=phone
    // coverage: surface=console locale=fr viewport=tablet
    // coverage: surface=console locale=fr viewport=desktop
    await page.goto(h.base + '/kiwi-admin.html', { waitUntil: 'load' });
    const trigger = '[data-op="task"][data-value="matrix-followup"]';
    t.step('Ouvrir le suivi de la journée, changer son état et enregistrer');
    await act(trigger); await page.waitForSelector('dialog[open]');
    if (keyboard) {
      await seek(page, 'dialog [name="assignee"]');
      // Native dialogs may visit browser chrome (activeElement becomes body)
      // at the tab boundary before returning to the modal's other end.
      await seek(page, 'dialog [type="submit"]', true);
      await seek(page, 'dialog [name="assignee"]');
    }
    // Type-ahead picks « En cours » on a closed select on every platform; an
    // arrow key opens the macOS popup instead and Enter would submit unchanged.
    if (keyboard) { await seek(page, 'dialog [name="status"]'); await page.keyboard.type('En'); }
    else { await page.click('dialog [name="status"]'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); }
    await fill('dialog [name="outcome"]', 'Contact fictif vérifié');
    await act('dialog [type="submit"]'); await page.waitForSelector('dialog', { hidden: true });
    await page.waitForFunction(() => document.querySelector('.op-task-meta')?.textContent.includes('En cours'));
    assert.equal(patches[0].status, 'in_progress'); assert.equal(patches[0].outcome, 'Contact fictif vérifié');
    if (keyboard) await focus(page, trigger);
    await check('queue');
    t.step('Refus serveur : erreur visible et saisie conservée, puis Échap');
    reject = true; await act(trigger);
    await fill('dialog [name="outcome"]', ' · brouillon conservé');
    await act('dialog [type="submit"]');
    await page.waitForFunction(() => document.querySelector('dialog .op-error')?.textContent.includes('Stockage indisponible'));
    assert.equal(await page.$eval('dialog [name="outcome"]', e => e.value), 'Contact fictif vérifié · brouillon conservé');
    assert.equal(await page.$eval('dialog [name="status"]', e => e.value), 'in_progress');
    await check('refusal');
    if (keyboard) await page.keyboard.press('Escape'); else await page.click('dialog [data-cancel]');
    await page.waitForSelector('dialog', { hidden: true });
    if (keyboard) await focus(page, trigger);
    await act(trigger); await act('dialog [data-cancel]', 'Space');
    if (keyboard) await focus(page, trigger);
    t.step('Chercher le commerce fictif et parcourir les onglets du dossier');
    await act(keyboard ? '#op-search-shortcut' : '.op-navigation a[href="#clients"]');
    // The shortcut moves focus to the search field a frame after the list renders.
    const landsOn = s => page.waitForFunction(q => document.activeElement?.matches(q), { timeout: 3000 }, s);
    if (keyboard) await landsOn('#cli-q');
    await fill('#cli-q', 'Commerce Matrice');
    await act('.crm-manage');
    await page.waitForSelector('[data-note]', { visible: true });
    for (const tab of ['tasks', 'diagnostics', 'summary']) { await act(`[data-op="dossier-tab"][data-value="${tab}"]`, 'Space'); if (keyboard) await focus(page, `[data-op="dossier-tab"][data-value="${tab}"]`); }
    await fill('[data-note] textarea', 'Note synthétique de suivi');
    await act('[data-note] [type="submit"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.op-timeline-item')].some(e => e.textContent.includes('Note synthétique')));
    assert.equal(notes[0].body, 'Note synthétique de suivi');
    await check('dossier');
    if (keyboard) await seek(page, '#manage-close', true);
    await act('#manage-close');
    if (keyboard) { await landsOn('#cli-q'); await focus(page, '#cli-q'); }
  });
} finally { await h.close(); await h.S.finish(); }
