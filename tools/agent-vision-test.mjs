// agent-vision-test — l'attachement photo et analyse visuelle de l'assistant :
// l'endpoint est fermé (session, quota, models @cf/), le client gère le drop/coller/resize,
// et le câblage HTML/SW porte le nouveau fichier avec estampille.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const vision = read('assets/agent-vision.js');
const fn = read('functions/api/ai/vision-inspect.js');
const quota = read('functions/api/ai/_quota.js');
const dashboard = read('dashboard.html');
const sw = read('kiwi-sw.js');

const controls = [
  // ── l'endpoint : fermé, borné, fail-soft ──────────────────────────────
  ['vision inspection requires a tenant session', fn.includes('tenantFor(request, env, b?.merchant)') && fn.includes("json({ ok: false, error: 'auth' }, 401)")],
  ['a missing AI binding is named, never a 500', fn.includes("json({ ok: false, error: 'unbound' }, 503)")],
  ['the daily quota uses visioninspect kind in _quota.js', fn.includes("quotaOk(env, who, 'visioninspect'") && /visioninspect:\s*\d+/.test(quota)],
  ['image input is size-bounded', fn.includes('MAX_IMAGE_DATAURL')],
  ['primary model is @cf/zai-org/glm-5.3-flash with @cf/google/gemma-4-26b-a4b-it vision fallback', fn.includes("'@cf/zai-org/glm-5.3-flash'") && fn.includes("'@cf/google/gemma-4-26b-a4b-it'")],
  ['the model call rides the shared AI gateway', fn.includes('runAiWithGateway')],
  ['output validator sanitizes docType, entities, and actions', fn.includes('validateVisionData') && fn.includes('safeDocType') && fn.includes('suggestedActions')],
  // ── le client : interface, interactions, ergonomie ───────────────────
  ['the attach button reaches both the hero box and the assistant drawer', vision.includes(".querySelectorAll('.fa-inputwrap')") && vision.includes(".querySelectorAll('.hai-input')")],
  ['client handles drag and drop with dragover highlighting', vision.includes('dragenter') && vision.includes('dragover') && vision.includes('kv-dragover')],
  ['client handles clipboard paste of images', vision.includes("input.addEventListener('paste'") && vision.includes('clipboardData')],
  ['client resizes oversized photos before upload', vision.includes('MAX_DIM') && vision.includes('canvas.toDataURL')],
  ['preview chip allows user to review and remove attachment before sending', vision.includes('kv-attach-chip') && vision.includes('kv-attach-del')],
  ['result renders interactive 1-click action buttons', vision.includes('data-kv-action') && vision.includes('handleActionResult')],
  ['drawer composer born after load is still wired', vision.includes('MutationObserver')],
  // ── la marque : icônes Material, couleurs des jetons (CLAUDE.md §4) ───
  ['no hand-drawn icon: no <path>, <polyline>, <circle> or 24-grid <svg> in the file', !/<path|<polyline|<circle|<line\b|viewBox="0 0 24 24"/.test(vision)],
  ['every icon comes from KiwiIcon.svg with a vendored Material Symbol', (() => {
    const names = [...vision.matchAll(/KiwiIcon\.svg\(\s*'([a-z0-9_]+)'|\bKI\.svg\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1] || m[2]);
    return names.length >= 4 && ['attach_file', 'progress_activity', 'check', 'close'].every((n) => names.includes(n))
      && names.every((n) => existsSync(new URL(`../assets/icons/material/${n}.svg`, import.meta.url)));
  })()],
  ['no hardcoded colour: no hex literal, every brand tint is a color-mix of a token', !/#[0-9A-Fa-f]{3,8}\b/.test(vision) && !/rgba\(\s*(?!0\s*,\s*0\s*,\s*0\s*,)/.test(vision)],
  ['every var(--x) the file paints with is a token tokens.css (or the agent skin) defines', (() => {
    const defined = new Set([...(read('assets/tokens.css') + read('assets/agent-skin.css')).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = [...new Set([...vision.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];
    return used.length > 5 && used.every((v) => defined.has(v));
  })()],
  // ── le câblage : la coquille et le HTML s'accordent ───────────────────
  ['dashboard loads the vision layer with a stamp', /assets\/agent-vision\.js\?v=\d+/.test(dashboard)],
  ['the offline shell precaches the same stamped URL', (() => {
    const m = dashboard.match(/assets\/agent-vision\.js\?v=(\d+)/);
    return !!m && sw.includes(`'/assets/agent-vision.js?v=${m[1]}'`);
  })()],
];

for (const [name, ok] of controls) assert.equal(ok, true, name);

// La confiance : 0 reste 0, hors bornes se ramène à 0..1, absente ou illisible
// est INCONNUE (null) : plus de 0,9 inventé que l'écran afficherait comme une mesure.
const { validateVisionData } = await import('../functions/api/ai/vision-inspect.js');
const conf = (v) => validateVisionData(v === undefined ? {} : { confidence: v }).confidence;
for (const [input, expected] of [[0, 0], ['0', 0], [0.4, 0.4], [1, 1], [7, 1], [-2, 0],
  [undefined, null], [null, null], ['', null], ['abc', null], [NaN, null], [Infinity, null], [true, null]]) {
  assert.equal(conf(input), expected, `confidence ${JSON.stringify(input)} -> ${expected}`);
}

// ── Lecture illisible : « à vérifier », jamais un succès à 0,8 ───────────────
// Le modèle est simulé (env.AI.run) : aucun appel réel, règle du coût zéro.
const { inspectImage, interpretVisionOutput } = await import('../functions/api/ai/vision-inspect.js');
const stubAI = (reply) => ({ AI: { run: async () => reply } });
const IMG = 'data:image/jpeg;base64,AAAA';
for (const [label, reply] of [
  ['free prose', { response: 'Je vois une facture mais je ne peux pas la structurer.' }],
  ['broken JSON', { choices: [{ message: { content: '{"docType": "invoice", "confidence": 0.97, ' } }] }],
  ['empty reply', { response: '' }],
  ['JSON array', { response: '[1, 2, 3]' }],
]) {
  const out = await inspectImage(stubAI(reply), IMG, '');
  assert.equal(out.status, 'review-needed', `${label}: status review-needed`);
  assert.equal(out.data.reviewNeeded, true, `${label}: data.reviewNeeded`);
  assert.equal(out.data.confidence, null, `${label}: no invented confidence`);
  assert.deepEqual(out.data.suggestedActions, [], `${label}: no 1-click action on an unread document`);
  assert.ok(!/succès|success/i.test(out.data.summary), `${label}: no generic success message`);
}
{
  const good = await inspectImage(stubAI({ response: 'Voici : {"docType":"invoice","confidence":0.42,"title":"Facture","entities":{"totalMad":120}}' }), IMG, '');
  assert.equal(good.status, 'parsed');
  assert.equal(good.data.reviewNeeded, undefined);
  assert.equal(good.data.confidence, 0.42);
  assert.equal(good.data.entities.totalMad, 120);
  assert.equal(interpretVisionOutput(undefined).status, 'review-needed');
  // JSON lisible mais sans confiance : lu, affiché neutre, aucune fiabilité inventée.
  const noConf = await inspectImage(stubAI({ response: '{"docType":"expense_receipt","title":"Reçu","entities":{"totalMad":35}}' }), IMG, '');
  assert.equal(noConf.status, 'parsed');
  assert.equal(noConf.data.confidence, null, 'valid JSON without confidence: unknown, not 0.9');
}

// ── Le client : « fait » seulement après le travail réel ─────────────────────
// Le vrai fichier assets/agent-vision.js tourne dans un vm avec un DOM minimal.
function fakeEl(tag) {
  const attrs = new Map();
  const cls = new Set();
  const el = {
    tagName: String(tag || 'div').toUpperCase(), children: [], parent: null, disabled: false,
    _html: '', textContent: '', style: {},
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.textContent = this._html.replace(/<[^>]*>/g, '').trim(); },
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    get className() { return [...cls].join(' '); },
    set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    setAttribute: (k, v) => attrs.set(k, String(v)), getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    removeAttribute: (k) => attrs.delete(k),
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); },
    querySelector(sel) { const k = sel.replace(/^\./, ''); return this.children.find((c) => c.classList.contains(k)) || null; },
    querySelectorAll: () => [], addEventListener() {},
    closest(sel) { const k = sel.replace(/^\./, ''); let n = this.parent; while (n) { if (n.classList.contains(k)) return n; n = n.parent; } return null; },
  };
  return el;
}
const toasts = [];
const doc = fakeEl('html');
Object.assign(doc, { readyState: 'complete', head: fakeEl('head'), body: fakeEl('body'), documentElement: fakeEl('html'),
  createElement: fakeEl, addEventListener() {}, querySelector: () => null });
const win = { document: doc, Kiwi: { toast: (m) => toasts.push(m), handlers: {} }, KiwiLang: { get: () => 'fr' } };
win.window = win;
const sandbox = vm.createContext({ window: win, document: doc, MutationObserver: class { observe() {} }, Promise, console, setTimeout });
vm.runInContext(read('assets/agent-vision.js'), sandbox, { filename: 'agent-vision.js' });
const KV = win.KiwiVision;
assert.equal(typeof KV.runAction, 'function', 'KiwiVision.runAction exposed');
const tick = () => new Promise((r) => setImmediate(r));
function actionButton(label) {
  const box = fakeEl('div'); box.className = 'kv-card-actions';
  const btn = fakeEl('button'); btn.className = 'kv-act-btn'; btn.innerHTML = label;
  box.appendChild(btn);
  return { box, btn };
}
const status = (box) => box.querySelector('.kv-act-status')?.textContent || '';

// 1. Handler asynchrone réel : pas « fait » tant qu'il n'a pas fini ; la réception est bien écrite.
{
  const ledger = [];
  let release;
  win.Kiwi.handlers['stock-scan-invoice'] = (data) => new Promise((r) => { release = () => { ledger.push({ supplier: data.supplier, totalMad: data.totalMad }); r(); }; });
  const { btn } = actionButton('Enregistrer la réception en stock');
  const p = KV.runAction(btn, 'stock-receive', { supplier: 'Centrale', totalMad: 1450 });
  await tick();
  assert.equal(btn.classList.contains('done'), false, 'pending handler: not done yet');
  assert.equal(btn.textContent, 'Enregistrer la réception en stock', 'pending: label kept, no success wording');
  assert.equal(btn.disabled, true, 'pending: no double click');
  release();
  assert.equal(await p, true);
  assert.equal(btn.classList.contains('done'), true, 'resolved handler: done');
  assert.deepEqual(ledger, [{ supplier: 'Centrale', totalMad: 1450 }], 'downstream mutation happened with the read entities');
  // Un second clic ne rejoue pas l'écriture.
  assert.equal(await KV.runAction(btn, 'stock-receive', { supplier: 'Centrale', totalMad: 1450 }), false);
  assert.equal(ledger.length, 1, 'no double write on a done button');
}
// 2. Handler qui rejette : échec traduit, bouton réessayable, puis succès au second essai.
{
  const ledger = [];
  let fail = true;
  win.Kiwi.handlers['stock-scan-invoice'] = async (data) => { if (fail) throw new Error('D1 down'); ledger.push(data.totalMad); };
  const { box, btn } = actionButton('Enregistrer la réception en stock');
  toasts.length = 0;
  assert.equal(await KV.runAction(btn, 'stock-receive', { totalMad: 80 }), false);
  assert.equal(btn.classList.contains('done'), false, 'rejected: not done');
  assert.equal(btn.classList.contains('failed'), true, 'rejected: failure state');
  assert.equal(btn.disabled, false, 'rejected: still clickable (retry)');
  assert.equal(btn.textContent, 'Enregistrer la réception en stock', 'rejected: original label back');
  assert.match(status(box), /n’a pas abouti/, 'rejected: translated failure line');
  assert.ok(toasts.every((m) => !/succès|enregistrée|ajoutée|mis à jour/i.test(m)), 'rejected: no success toast');
  fail = false;
  assert.equal(await KV.runAction(btn, 'stock-receive', { totalMad: 80 }), true, 'retry succeeds');
  assert.deepEqual(ledger, [80]);
  assert.equal(btn.classList.contains('failed'), false);
  assert.equal(status(box), '', 'failure line cleared after success');
}
// 3. Handler qui lève de façon synchrone : même échec.
{
  win.Kiwi.handlers['stock-scan-invoice'] = () => { throw new Error('boom'); };
  const { btn } = actionButton('Recevoir');
  assert.equal(await KV.runAction(btn, 'stock-receive', {}), false);
  assert.equal(btn.classList.contains('done'), false, 'thrown: not done');
  assert.equal(btn.disabled, false, 'thrown: retryable');
}
// 4. Handler absent (dépenses, carte, salle, type inconnu) : « indisponible », jamais « ajoutée ».
for (const type of ['expense-add', 'menu-import', 'floorplan-apply', 'generic-action']) {
  toasts.length = 0;
  const { box, btn } = actionButton('Agir');
  assert.equal(await KV.runAction(btn, type, { totalMad: 99, items: [{ name: 'x' }] }), false, `${type}: reports failure`);
  assert.equal(btn.classList.contains('done'), false, `${type}: not done`);
  assert.equal(btn.disabled, false, `${type}: retryable`);
  assert.match(status(box), /pas disponible/, `${type}: translated unavailable line`);
  assert.ok(toasts.length && toasts.every((m) => !/succès|ajoutée|mis à jour|exécutée|enregistrée/i.test(m)), `${type}: no success toast`);
}
// 5. Les trois langues portent les nouveaux libellés.
for (const lang of ['en', 'ar']) {
  win.KiwiLang.get = () => lang;
  const { box, btn } = actionButton('Act');
  await KV.runAction(btn, 'expense-add', {});
  assert.ok(status(box) && !/pas disponible/.test(status(box)), `${lang}: unavailable line translated`);
}
win.KiwiLang.get = () => 'fr';
// 6. Rendu : une lecture « à vérifier » ne montre ni fiabilité ni bouton ; une confiance 0 reste 0 %.
{
  const thread = fakeEl('div');
  const rv = KV.renderResult({ reviewNeeded: true, confidence: null, summary: '<b>texte</b>', suggestedActions: [] }, thread, () => {});
  assert.match(rv.innerHTML, /À vérifier/);
  assert.ok(!/Fiabilité/.test(rv.innerHTML), 'review card: no confidence shown');
  assert.ok(!/data-kv-action/.test(rv.innerHTML), 'review card: no action button');
  assert.ok(rv.innerHTML.includes('&lt;b&gt;texte&lt;/b&gt;'), 'review card: raw model text escaped');
  const zero = KV.renderResult({ docType: 'invoice', confidence: 0, entities: {}, suggestedActions: [] }, thread, () => {});
  assert.match(zero.innerHTML, /Fiabilité 0 %/, 'confidence 0 shows 0 %, not 90 %');
  const none = KV.renderResult({ docType: 'general_document', entities: {}, suggestedActions: [] }, thread, () => {});
  assert.ok(!/Fiabilité/.test(none.innerHTML), 'absent confidence is not invented on screen');
}

console.log(`agent-vision-test: ${controls.length} controls + confidence cases + review-needed + action outcomes passed`);
