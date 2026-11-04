#!/usr/bin/env node
/* returns-demo-handlers-test · les gestes de démonstration de la page Retours ne mentent pas
 * dans un vrai commerce.
 *
 * La page de retours (assets/pages-pro/boutique-promos-returns.js) garde des gestes de
 * démonstration qui annoncent un remboursement « en 1 à 3 jours », un bonus de 10 % ou un lien
 * WhatsApp envoyé. Dans un vrai commerce c'est assets/production-action-guard.js qui les retient.
 * Les deux vrais fichiers tournent dans un vm : en session réelle chaque geste de la page, sauf
 * une liste de lecture seule nommée ici, répond « action non connectée » sans ouvrir d'assistant
 * ni annoncer un succès ; en démonstration il garde son récit. Un geste ajouté demain à la
 * page sans être gardé fait échouer ce test. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const page = fs.readFileSync(new URL('../assets/pages-pro/boutique-promos-returns.js', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../assets/production-action-guard.js', import.meta.url), 'utf8');
// Read-only or genuinely backed by the store-credit API: they never promise an unmade payment.
const backed = new Set(['nav-returns', 'ret-detail', 'ret-policy-jump', 'ret-export', 'credit-adjust', 'credit-adjust-confirm', 'credit-cancel']);

function run(real) {
  const handlers = {}, toasts = [], modals = [];
  const window = {
    Kiwi: { handlers, toast: (t, o) => toasts.push({ t, o }), modal: (m) => { modals.push(m); return { el: { addEventListener() {} }, close() {} }; }, drawer() { return { el: { addEventListener() {} } }; } },
    KiwiEnv: { isReal: () => real }, KiwiI18n: { getLang: () => 'fr' }, addEventListener() {},
  };
  const document = { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {} } }), body: { appendChild() {} } };
  const ctx = { window, document, console, setTimeout() {}, setInterval() { return 0; }, clearInterval() {}, Intl, Date, localStorage: { getItem: () => null, setItem() {} } };
  vm.runInNewContext(page, ctx);
  vm.runInNewContext(guard, ctx);
  return { handlers, toasts, modals };
}

const real = run(true);
const demoKeys = Object.keys(real.handlers).filter((k) => !backed.has(k));
assert.ok(demoKeys.length >= 8, 'the page registers its demonstration gestures: ' + demoKeys.join(' '));
for (const key of demoKeys) {
  real.toasts.length = 0; real.modals.length = 0;
  const out = real.handlers[key]('R-1', 'R-1');
  assert.equal(out && out.reason, 'not-connected', key + ': a real store gets "not connected"');
  assert.equal(real.modals.length, 0, key + ': no refund wizard opens');
  assert.ok(real.toasts.every((t) => t.o.type === 'warning'), key + ': never a success');
  assert.ok(!real.toasts.some((t) => /1 à 3|10 ?%|WhatsApp envoyé/.test(t.t + ' ' + (t.o.desc || ''))), key + ': no promise of money, bonus or message');
}
const demo = run(false);
demo.handlers['ret-refund-credit']();
assert.equal(demo.toasts[0].o.type, 'success', 'the demo keeps its story');
demo.handlers['ret-approve']('R-1', 'R-1');
assert.equal(demo.modals.length, 1, 'and its refund channel wizard');

console.log('✓ returns demonstration gestures: every one answers "not connected" in a real store, the demo is unchanged');
