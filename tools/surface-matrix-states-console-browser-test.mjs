#!/usr/bin/env node
// FR only: EN/AR remain an owner decision. Every record and response is synthetic.
import assert from 'node:assert/strict';
import { randomInt, randomBytes } from 'node:crypto';
import { secret, fillSecret } from './browser-trace.mjs';
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
    if (await page.evaluate(s => document.activeElement === document.querySelector(s), selector)) { await focus(page, selector); return; }
    if (backwards) await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    if (backwards) await page.keyboard.up('Shift');
    assert.ok(await page.evaluate(() => !document.querySelector('dialog[open]') || document.activeElement === document.body || !!document.activeElement.closest('dialog[open]')), 'Tab must not reach background controls while the modal is open');
  }
  throw new Error('Keyboard cannot reach ' + selector);
}
try {
  for (const viewport of (process.env.KIWI_CONSOLE_CONFLICT_FAULT ? ['phone'] : ['phone', 'tablet', 'desktop'])) await h.S.run(`console · fr · ${viewport}`, async t => {
    const merchant = 'matrix-console-synthetic';
    const task = { id: 'matrix-followup', merchant, version: 1, title: 'Rappeler le commerce fictif', detail: 'Vérification synthétique', status: 'open', priority: 2 };
    const notes = [], patches = []; let reject = false, refuseLegacy = true, legacyWrites = 0, resetWrites = 0;
    const staffValue=String(randomInt(1000,10000)), operatorValue=randomBytes(12).toString('hex');
    const staffSecret=secret('console-synthetic-staff',staffValue), operatorSecret=secret('console-synthetic-operator',operatorValue);
    const sale={id:'synthetic-sale',ref:'TEST KIWI',ts:Date.now(),amount:12.5,method:'cash',label:'TEST KIWI synthétique'};
    const account={id:'synthetic-account',login:'matrix@example.test',business:'Commerce fictif'};
    const config = { features: {}, revision: 1, city: 'Ville test', subscriptionKind: 'paid', subscriptionStart: '2026-10-01', subscriptionEnd: '2026-11-01' };
    const sources = Object.fromEntries(['tasks','notes','events','activity','board','errors','print','bridges','quarantine','support','integrations','caisseSync','shopify','shopifyLink','receivables','unpaidTables','zChecks','conflicts','tenantGuard','discountPolicy'].map(k => [k, { available: true, rows: [] }]));
    sources.tasks.rows = [task]; sources.notes.rows = notes;
    const routes = {
      'GET /api/me': { authenticated: true, operator: true },
      'GET /api/admin/clients': { now: Date.now(), senior: true, clients: [{ merchant, business: 'Commerce Matrice Fictif', email: 'matrix@example.test', owner: 'matrix@example.test', type: 'retail', city: 'Ville test', demo: false, status: 'active', store_status: 'active', today_amount: 0, today_count: 0 }] },
      'GET /api/admin/operators': { operators: [] },
      'GET /api/admin/config': () => ({ body: config }),
      'GET /api/admin/pins': { pins: [] },
      'GET /api/admin/account': () => ({body:{account,stores:[],team:[]}}),
      'PUT /api/admin/account': req=> {if(refuseLegacy)return {status:409,body:{error:'email-taken'}}; const data=JSON.parse(req.postData());account[data.field]=data.email;return {body:{ok:true,next:data.email}};},
      'GET /api/admin/sales': req=>({body:new URL(req.url()).searchParams.has('impact')?{totals:{amount:12.5,count:1,basket:12.5},reasons:{autre:'Autre'}}:{sales:[sale]}}),
      'POST /api/admin/sales': ()=> {if(refuseLegacy)return {status:409,body:{error:'conflict'}};sale.void_ts=Date.now();return {body:{ok:true}};},
      'PATCH /api/admin/config': req=>{if(refuseLegacy)return {status:409,body:{error:'version-conflict'}};const d=JSON.parse(req.postData());config.features[d.feature]=d.enabled;return {body:{ok:true}};},
      'DELETE /api/admin/clients': ()=>({status:409,body:{error:'conflict'}}),
      'POST /api/admin/reset': ()=> { if(refuseLegacy)return {status:503,body:{error:'send-failed'}};resetWrites++;return {body:{ok:true}}; },
      'POST /api/admin/operators': ()=>refuseLegacy?{status:409,body:{error:'conflict'}}:{body:{ok:true}},
      'GET /api/admin/reset': { canSend: true },
      'PUT /api/admin/config': req => { if (refuseLegacy) return { status: 409, body: { error: 'version-conflict' } }; Object.assign(config, JSON.parse(req.postData())); legacyWrites++; return { body: { ok: true } }; },
      'POST /api/admin/pins': () => refuseLegacy ? { status: 409, body: { error: 'pin-exists' } } : { body: { ok: true } },

      'GET /api/admin/overview': {},
      'GET /api/admin/workspace': req => ({ body: { now: Date.now(), merchant: new URL(req.url()).searchParams.get('merchant') || '', sources } }),
      'PATCH /api/admin/tasks': req => { const data = JSON.parse(req.postData()); patches.push(data); if (reject) return { status: 503, body: { error: 'task-storage-unavailable' } }; Object.assign(task, data, { version: task.version + 1 }); return { body: { task } }; },
      'POST /api/admin/notes': req => { const data = JSON.parse(req.postData()); notes.push({ ...data, actor: 'Opérateur fictif', ts: Date.now() }); return { body: { ok: true } }; },
    };
    const { page, ctx } = await realPage(h, 'fr', viewport, routes); t.defer(() => ctx.close()); t.watch(page);
    const keyboard = viewport !== 'phone';
    const act = async (s, key = 'Enter') => { await page.waitForSelector(s, { visible: true }); if (keyboard) { await seek(page, s); await page.keyboard.press(key); } else { await page.$eval(s,e=>e.scrollIntoView({behavior:'instant',block:'center'}));await page.click(s); } await sleep(180); };
    // A keyboard user lands at the start of a filled field and presses End before adding to it.
    const fill = async (s, value) => { if (keyboard) { await seek(page, s); await page.keyboard.press('End'); } else { await page.$eval(s,e=>e.scrollIntoView({behavior:'instant',block:'center'}));await page.click(s); } await page.keyboard.type(value); };
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
    if(process.env.KIWI_CONSOLE_CONFLICT_FAULT)await page.evaluate(()=>{const original=KiwiAdminI18n.text;KiwiAdminI18n.text=value=>value.startsWith('Conflit serveur.')?'':original(value);});
    for (const tab of ['tasks', 'diagnostics', 'summary']) { await act(`[data-op="dossier-tab"][data-value="${tab}"]`, 'Space'); if (keyboard) await focus(page, `[data-op="dossier-tab"][data-value="${tab}"]`); }
    await fill('[data-note] textarea', 'Note synthétique de suivi');
    await act('[data-note] [type="submit"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.op-timeline-item')].some(e => e.textContent.includes('Note synthétique')));
    assert.equal(notes[0].body, 'Note synthétique de suivi');
    await check('dossier');
    t.step('Codes du personnel : Entrée, doublon refusé et reprise sans perdre la saisie');
    await act('[data-op="dossier-tab"][data-value="configuration"]');
    await fill('#pin-name','Personnel fictif');
    await fillSecret(page,'#pin-new',staffSecret);
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#pin-err').textContent.length>0);
    assert.ok(await page.$eval('#pin-new',(e,v)=>e.value===v,staffValue),'saisie sensible conservée');
    assert.equal(await page.$eval('#pin-name',e=>e.value),'Personnel fictif');
    refuseLegacy=false; await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#pin-new').value==='');
    refuseLegacy=true;
    t.step('Adresse du compte : Entrée, adresse déjà prise, correction et Échap');
    await act('[data-op="dossier-tab"][data-value="account"]');
    t.step('Réinitialisation : refus visible puis reprise au clavier');
    const reset='#acct-body .rst button';
    await act(reset);
    await page.waitForFunction(()=>document.querySelector('#acct-err').textContent.length>0);
    assert.equal(resetWrites,0);refuseLegacy=false;await act(reset);
    await page.waitForFunction(()=>!document.querySelector('#acct-err').textContent);
    assert.equal(resetWrites,1);refuseLegacy=true;
    await act('#acct-body .mailrow .mini');
    await page.click('#mail-editor input[type=email]',{clickCount:3});await page.keyboard.type('updated@example.test');
    await fill('#mail-editor input:not([type])','Correction synthétique');
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#mail-editor .err').textContent.length>0);
    assert.equal(account.login,'matrix@example.test');
    assert.equal(await page.$eval('#mail-editor input[type=email]',e=>e.value),'updated@example.test');
    refuseLegacy=false;await page.keyboard.press('Enter');
    await page.waitForSelector('#mail-editor',{hidden:true});assert.equal(account.login,'updated@example.test');
    await act('#acct-body .mailrow .mini');await page.keyboard.press('Escape');
    await page.waitForSelector('#mail-editor',{hidden:true});
    refuseLegacy=true;
    t.step('Fiche commerciale : Entrée, conflit, saisie conservée et reprise');
    await act('[data-op="dossier-tab"][data-value="commercial"]');
    await fill('#biz-city', ' brouillon');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#biz-err').textContent.length > 0);
    assert.equal(legacyWrites, 0);
    assert.equal(await page.$eval('#biz-city', e => e.value), 'Ville test brouillon');
    assert.match(await page.$eval('#biz-err', e => e.textContent), /Conflit serveur/);
    assert.equal(await page.$eval('#biz-err', e => e.getAttribute('role')), 'alert');
    refuseLegacy = false;
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#biz-city').value === 'Ville test brouillon' && !document.querySelector('#biz-err').textContent);
    await sleep(300); assert.equal(legacyWrites, 1);
    t.step('Configuration : activité et module refusés puis confirmés');
    refuseLegacy=true;await act('[data-op="dossier-tab"][data-value="configuration"]');
    await page.select('#type-row select','boutique');
    await page.waitForFunction(()=>document.querySelector('#type-row .err').textContent.length>0);
    assert.equal(await page.$eval('#type-row select',e=>e.value),'boutique');
    refuseLegacy=false;await act('#type-row .mini');
    await page.waitForFunction(()=>!document.querySelector('#type-row .err').textContent&&!document.querySelector('#type-row .mini').disabled);
    refuseLegacy=true;const sw='#feat-list [role=switch]';
    const checked=await page.$eval(sw,e=>e.getAttribute('aria-checked'));
    await act(sw,'Space');
    await page.waitForFunction(()=>document.querySelector('#feat-list [role=alert]')?.textContent.length>0);
    assert.equal(await page.$eval(sw,e=>e.getAttribute('aria-checked')),checked);
    refuseLegacy=false;await act(sw,'Space');
    await page.waitForFunction((before)=>document.querySelector('#feat-list [role=switch]').getAttribute('aria-checked')!==before,{},checked);
    t.step('Correction de vente : Entrée, refus, motif conservé et reprise');
    await act('[data-op="dossier-tab"][data-value="sales"]');
    await act('#ts-list input[type=checkbox]','Space');await act('#ts-bar .mini.warn');await sleep(450);
    await page.select('#ts-impact select','autre');await fill('#ts-impact input','Justification synthétique');
    refuseLegacy=true;await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#ts-impact .err').textContent.length>0);
    assert.ok(!sale.void_ts);assert.equal(await page.$eval('#ts-impact input',e=>e.value),'Justification synthétique');
    refuseLegacy=false;await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('#ts-impact .imp'));assert.ok(sale.void_ts);
    if (keyboard) await seek(page, '#manage-close', true);
    await act('#manage-close');
    if (keyboard) { await landsOn('#cli-q'); await focus(page, '#cli-q'); }
    t.step('Opérateur : refus, code conservé et reprise');
    await act('[data-op-route="operators"]');
    await fill('#op-label','Opérateur fictif');await fillSecret(page,'#op-code',operatorSecret);
    refuseLegacy=true;await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#op-err').textContent.length>0);
    assert.ok(await page.$eval('#op-code',(e,v)=>e.value===v,operatorValue),'code opérateur conservé après refus');
    refuseLegacy=false;await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#op-code').value==='');
    await act('.op-navigation a[href="#clients"]');
    t.step('Suppression : confirmation au clavier, refus visible, Échap et focus rendu');
    await act('.action-menu summary');await act('.action-menu .danger');
    await page.waitForSelector('.md-card input',{visible:true});
    await page.keyboard.type(merchant);await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('.md-card .err').textContent.length>0);
    assert.equal(await page.$eval('.md-card input',e=>e.value),merchant);
    await page.keyboard.press('Escape');await page.waitForSelector('.md-card',{hidden:true});

  });
} finally { await h.close(); await h.S.finish(); }
