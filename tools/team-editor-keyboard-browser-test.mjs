#!/usr/bin/env node
/* Équipe · la fiche d'un membre se crée et se corrige au clavier seul, et
 * chaque erreur est rattachée à son champ.
 *
 * team-member-editor-test.mjs lit le gabarit et appelle edError() ; il ne dit
 * pas ce qu'un utilisateur au clavier ou d'un lecteur d'écran rencontre. Ici,
 * dans le vrai dashboard (Chromium, roster intercepté, codes fabriqués pour la
 * suite et jamais affichés), sans un clic :
 *  1 · Entrée sur « Ajouter un membre » ouvre la fiche, le focus y entre ;
 *  2 · Tab et Maj+Tab restent dans la fiche et atteignent le bouton
 *      d'enregistrement ;
 *  3 · enregistrer une fiche incomplète envoie le focus au premier champ en
 *      erreur, marqué aria-invalid, et le message est la DESCRIPTION
 *      accessible du champ (aria-describedby), lue par le lecteur d'écran ;
 *  4 · corriger le champ efface l'erreur et sa description ;
 *  5 · le poste se choisit au clavier, la fiche s'enregistre, le membre est
 *      au roster et le focus revient sur le bouton qui a ouvert la fiche ;
 *  6 · Échap ferme une fiche en modification et rend le focus.
 */
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { harness, realPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('team-editor-keyboard');
const S = h.S;
const merchant = 'matrix-real';
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
/* Codes fabriqués pour cette suite, jamais de vrais codes, jamais affichés. */
const member = (id, first, code) => ({ id, firstName: first, lastName: 'Test', function: 'Cashier', department: 'Caisse', venueSlug: merchant, pinCode: code, password: code });
const ROSTER = [member('m1', 'Sara', '4821'), member('m2', 'Omar', '7390')];
/* Code de propriétaire synthétique, éphémère, saisi sur le pavé, jamais affiché. */
const OWNER = String(randomInt(1000, 10000));

async function unlock(page) {
  await page.waitForFunction(() => { const p = document.querySelector('[data-kiwi-lock] k-pin-pad'); return p && p.shadowRoot && p.shadowRoot.querySelector('[data-key="1"]'); }, { timeout: 30000 });
  for (const d of OWNER) {
    const key = await page.evaluateHandle((x) => document.querySelector('[data-kiwi-lock] k-pin-pad').shadowRoot.querySelector('[data-key="' + x + '"]'), d);
    const box = await key.asElement().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(40);
  }
  await page.waitForFunction(() => { const l = document.querySelector('[data-kiwi-lock]'); return !l || l.classList.contains('is-unlocking') || getComputedStyle(l).display === 'none' || l.hidden; }, { timeout: 15000 });
  await sleep(2600);
}

async function open(t) {
  let doc = { members: ROSTER.map((m) => ({ ...m })), removed: [], hours: {}, shifts: {}, planning: {}, locks: {} }, rev = 5;
  const routes = {
    'GET /api/me': { authenticated: true, onboarded: true, name: 'TEST KIWI', business: 'Matrix Boutique', type: 'boutique', stores: [{ merchant, name: 'Matrix Boutique', type: 'boutique' }] },
    'GET /api/config': { name: 'Matrix Boutique', type: 'boutique', plan: 'pro', planExplicit: true, features: {}, pins: [{ name: 'TEST KIWI', role: 'owner' }] },
    'POST /api/pin/verify': (req) => ({ status: JSON.parse(req.postData()).pin === OWNER ? 200 : 401, body: { ok: true, staff: { id: 'st_owner', name: 'TEST KIWI', role: 'owner' }, merchant } }),
    'GET /api/store': (req) => new URL(req.url()).searchParams.get('feature') === 'team' ? { body: { rev, data: doc } } : { body: { rev: 0, data: null } },
    'POST /api/store': (req) => { try { const body = JSON.parse(req.postData() || '{}'); if (body.feature === 'team' && body.data) { doc = body.data; rev += 1; } } catch (_) {} return { body: { ok: true, rev } }; },
    'POST /api/config': { ok: true, pins: [] },
  };
  const { ctx, page } = await realPage(h, 'fr', 'desktop', routes);
  t.defer(() => ctx.close()); t.watch(page);
  page.on('dialog', async (d) => { await d.dismiss(); });
  // coverage: surface=dashboard-team-editor locale=fr viewport=desktop
  await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
  await unlock(page);
  await page.waitForFunction(() => !!window.__kiwiTeamV2 && !!window.Kiwi?.handlers?.['nav-equipe'], { timeout: 30000 });
  /* La navigation jusqu'à la page Équipe n'est pas l'objet : on l'ouvre, puis
     tout le reste se fait au clavier. */
  await page.evaluate(() => window.Kiwi.handlers['nav-equipe']());
  await page.waitForSelector('[data-action="kt-add-member"]', { visible: true, timeout: 20000 });
  await sleep(400);
  return page;
}

/* L'élément actif, décrit sans valeur saisie (un code n'est jamais lu). */
const active = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'body' };
  const modal = el.closest('.kt-ed-modal');
  return { tag: el.tagName.toLowerCase(), name: el.getAttribute('name') || '', action: el.getAttribute('data-action') || '', inModal: !!modal, visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) };
});
/* Nom et description accessibles, tels que Chromium les calcule pour un lecteur d'écran. */
async function axOf(page, selector) {
  const cdp = await page.createCDPSession();
  try {
    const { root: r } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: r.nodeId, selector });
    if (!nodeId) return null;
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const n = nodes[0] || {};
    return { name: n.name?.value || '', description: n.description?.value || '', invalid: (n.properties || []).find((p) => p.name === 'invalid')?.value?.value || 'false' };
  } finally { await cdp.detach(); }
}
const modalOpen = (page) => page.evaluate(() => !!document.querySelector('.kt-ed-modal [data-kt-form]'));
async function tabTo(page, want, { shift = false, max = 80 } = {}) {
  const path_ = [];
  for (let i = 0; i < max; i++) {
    if (shift) await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    if (shift) await page.keyboard.up('Shift');
    const a = await active(page);
    path_.push(a);
    if (want(a)) return path_;
  }
  return null;
}

await S.run('fiche d\'un membre · création et correction au clavier seul', async (t) => {
  const page = await open(t);

  t.step('Entrée sur « Ajouter un membre »');
  await page.focus('[data-action="kt-add-member"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.kt-ed-modal [data-kt-form]', { visible: true, timeout: 10000 });
  await sleep(350);
  let a = await active(page);
  check(a.inModal, 'Entrée ouvre la fiche et le focus y entre');

  t.step('Tab et Maj+Tab restent dans la fiche');
  const forward = await tabTo(page, (x) => x.action === 'kt-submit-member');
  check(!!forward, 'Tab atteint le bouton d\'enregistrement');
  check(forward.every((x) => x.inModal && x.visible), 'chaque arrêt de Tab est visible et dans la fiche');
  const wrap = await tabTo(page, (x) => x.name === 'firstName', { max: 120 });
  check(!!wrap && wrap.every((x) => x.inModal), 'Tab boucle dans la fiche jusqu\'au prénom, sans en sortir');
  const back = await tabTo(page, (x) => x.action === 'kt-submit-member', { shift: true, max: 120 });
  check(!!back && back.every((x) => x.inModal), 'Maj+Tab reste dans la fiche');

  t.step('fiche incomplète enregistrée');
  await page.focus('.kt-ed-modal [name="firstName"]');
  await page.keyboard.type('Nadia');
  await tabTo(page, (x) => x.action === 'kt-submit-member');
  await page.keyboard.press('Enter');
  await sleep(500);
  check(await modalOpen(page), 'une fiche incomplète ne se ferme pas');
  a = await active(page);
  check(a.inModal && a.name === 'lastName', `le focus va au premier champ en erreur (${a.name || a.tag})`);
  let ax = await axOf(page, '.kt-ed-modal [name="lastName"]');
  const errText = await page.$eval('.kt-ed-modal [data-err-for="lastName"]', (e) => (e.hidden ? '' : e.textContent.trim()));
  check(!!errText, 'le message d\'erreur du nom est affiché');
  check(ax.invalid !== 'false', 'le nom est annoncé invalide');
  check(ax.description.includes(errText), `le message est la description accessible du champ (« ${ax.description} »)`);
  check(!ax.name.includes(errText), 'le message ne s\'ajoute pas au nom du champ');

  t.step('correction du nom');
  await page.keyboard.type('Test');
  await sleep(200);
  ax = await axOf(page, '.kt-ed-modal [name="lastName"]');
  check(ax.invalid === 'false' && !ax.description.includes(errText), 'corriger le nom efface l\'erreur et sa description');

  t.step('poste choisi au clavier');
  const fnErr = await page.$eval('.kt-ed-modal [data-err-for="function"]', (e) => (e.hidden ? '' : e.textContent.trim()));
  check(!!fnErr, 'le poste manquant est signalé');
  const fnAx = await axOf(page, '.kt-ed-modal [data-f="function"] .kiwi-select-trigger, .kt-ed-modal [name="function"]');
  check(fnAx && fnAx.description.includes(fnErr), `l'erreur du poste est la description de son contrôle (« ${fnAx && fnAx.description} »)`);
  await page.evaluate(() => {
    const trig = document.querySelector('.kt-ed-modal [data-f="function"] .kiwi-select-trigger') || document.querySelector('.kt-ed-modal [name="function"]');
    trig.focus();
  });
  await page.keyboard.press('ArrowDown');
  await sleep(250);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(300);
  const fnVal = await page.$eval('.kt-ed-modal [name="function"]', (e) => e.value);
  check(!!fnVal, 'un poste est choisi au clavier');

  t.step('e-mail manquant');
  await tabTo(page, (x) => x.action === 'kt-submit-member');
  await page.keyboard.press('Enter');
  await sleep(600);
  a = await active(page);
  check(a.inModal && a.name === 'email', `l'enregistrement suivant envoie le focus à l'e-mail manquant (${a.name || a.tag})`);
  const mailAx = await axOf(page, '.kt-ed-modal [name="email"]');
  check(mailAx.invalid !== 'false' && mailAx.description.length > 0, `l'erreur de l'e-mail est sa description (« ${mailAx.description} »)`);
  await page.keyboard.type('nadia.test@example.test');

  t.step('enregistrement');
  await tabTo(page, (x) => x.action === 'kt-submit-member');
  await page.keyboard.press('Enter');
  await sleep(600);
  const stillInvalid = await page.evaluate(() => [...document.querySelectorAll('.kt-ed-modal [data-err-for]')].filter((e) => !e.hidden).map((e) => e.getAttribute('data-err-for') + ': ' + e.textContent.trim()));
  check(!stillInvalid.length, `aucune erreur restante (${stillInvalid.join(' ; ')})`);
  await page.waitForFunction(() => !document.querySelector('.kt-ed-modal [data-kt-form]'), { timeout: 8000 });
  await sleep(500);
  const listed = await page.evaluate(() => Object.values(window.__kiwiTeamV2.byVenue || {}).flat().some((m) => m && m.firstName === 'Nadia' && m.lastName === 'Test'));
  check(listed, 'Nadia Test est au roster');
  a = await active(page);
  const onNew = await page.evaluate(() => { const el = document.activeElement; const id = el && el.getAttribute('data-arg'); return !!id && Object.values(window.__kiwiTeamV2.byVenue || {}).flat().some((m) => m && m.id === id && m.firstName === 'Nadia'); });
  check(onNew || a.action === 'kt-add-member', `le focus ne se perd pas : il va sur le membre enregistré (${a.action || a.tag})`);
});

await S.run('fiche d\'un membre · Échap ferme une modification et rend le focus', async (t) => {
  const page = await open(t);
  const opener = await page.$('[data-action="kt-edit-member"]');
  if (!opener) {
    await page.evaluate(() => window.Kiwi.handlers['kt-edit-member'](null, 'm1'));
  } else {
    await opener.focus();
    await page.keyboard.press('Enter');
  }
  await page.waitForSelector('.kt-ed-modal [data-kt-form]', { visible: true, timeout: 10000 });
  await sleep(300);
  check((await active(page)).inModal, 'la fiche en modification reçoit le focus');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.kt-ed-modal [data-kt-form]'), { timeout: 5000 });
  await sleep(200);
  const a = await active(page);
  check(a.tag !== 'body', `Échap ferme la fiche et le focus ne se perd pas (${a.action || a.tag})`);
});

await h.close();
await S.finish();
