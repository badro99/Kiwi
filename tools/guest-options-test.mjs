#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * COMMANDE PAR QR · LES OPTIONS NE SE CHOISISSENT PAS TOUTES SEULES
 *
 * OrderPro.html est l'appli invité (depuis l'étape 3c, kiwi-order.html, l'ancien
 * fork de démo, redirige vers elle et la démo vit dans assets/orderpro-demo.js).
 * Audit design 2026-10 :
 *
 *  1. « Sucré » était présélectionné sur un espresso, puis describeOptions
 *     sautait tout choix égal au défaut (`if (sel === opt.default) continue`) :
 *     le panier affichait « Espresso », le ticket aussi, et le client recevait
 *     un sucre qu'il n'avait jamais lu.
 *  2. Un groupe obligatoire d'un vrai établissement présélectionnait son
 *     premier choix, donc le contrôle « obligatoire » ne se déclenchait jamais.
 *  3. cafe-atlas-qr.html (l'affiche) promettait un paiement intégré (carte,
 *     Apple Pay, wallet Kiwi) que le parcours ne propose pas : on paie au
 *     comptoir ou à table.
 *
 * Règle : rien n'est présélectionné ; tout choix fait est écrit au panier et
 * dans le texte envoyé à la caisse ; un groupe obligatoire vide désactive
 * « Ajouter » (attribut disabled réel).
 *
 *   node tools/guest-options-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' introuvable');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

const FORKS = [
  { file: 'OrderPro.html', gate: 'unansweredRequiredOption' },
];

/* Une carte d'espresso comme la démo la publiait : « Sucré » était le défaut. */
const sugar = {
  key: 'sucre', type: 'single', default: 'normal',
  choices: [{ id: 'normal', label: 'Sucré' }, { id: 'sans', label: 'Sans sucre' }],
};
const bread = {
  key: 'pain', type: 'single', required: true,
  choices: [{ id: 'campagne', label: 'Pain de campagne' }, { id: 'wrap', label: 'En wrap' }],
};
const extras = {
  key: 'extras', type: 'multi', required: true,
  choices: [{ id: 'beurre', label: 'Beurre' }, { id: 'miel', label: 'Miel' }],
};
const ITEMS = {
  espresso: { id: 'espresso', price: 12, options: [sugar] },
  sandwich: { id: 'sandwich', price: 30, options: [bread, extras] },
};
const LABELS = { normal: 'Sucré', sans: 'Sans sucre', campagne: 'Pain de campagne', wrap: 'En wrap', beurre: 'Beurre', miel: 'Miel' };

for (const { file, gate } of FORKS) {
  const HTML = read(file);
  console.log(`\n${file}`);

  const ctx = vm.createContext({ Array, Object, Math, Number, String });
  const button = { disabled: false, attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } };
  Object.assign(ctx, { __button: button, __items: ITEMS, __labels: LABELS });
  vm.runInContext([
    'var customizerItem = null, customizerSelections = {};',
    'var document = { getElementById: (id) => id === "custom-add-btn" ? __button : null };',
    'function itemOf(id) { return __items[id] || null; }',
    'function choiceLabel(k, id) { return __labels[id] || id; }',
    'function t(k) { return k; }',
    grab(HTML, 'function describeOptions('),
    grab(HTML, 'function initialCustomizerSelections('),
    grab(HTML, `function ${gate}(`),
    grab(HTML, 'function syncCustomizerGate('),
    `this.describe = describeOptions; this.init = initialCustomizerSelections; this.gate = ${gate};`,
    'this.sync = (item, sel) => { customizerItem = item; customizerSelections = sel; syncCustomizerGate(); };',
  ].join('\n'), ctx);

  ok('un choix égal au défaut de la carte est écrit au panier (plus de « Espresso » muet)', () => {
    assert.equal(ctx.describe({ id: 'espresso', options: { sucre: 'normal' } }), 'Sucré');
    assert.equal(ctx.describe({ id: 'espresso', options: { sucre: 'sans' } }), 'Sans sucre');
  });
  ok('un groupe laissé vide n\'écrit rien (ce n\'est pas un choix)', () => {
    assert.equal(ctx.describe({ id: 'espresso', options: { sucre: '' } }), '');
    assert.equal(ctx.describe({ id: 'espresso', options: {} }), '');
  });
  ok('plusieurs groupes : chaque choix fait est listé, dans l\'ordre de la carte', () => {
    assert.equal(ctx.describe({ id: 'sandwich', options: { pain: 'wrap', extras: ['beurre', 'miel'] } }), 'En wrap · beurre, miel');
  });
  ok('rien n\'est présélectionné, ni défaut de la carte ni premier choix d\'un groupe obligatoire', () => {
    const s = ctx.init([sugar, bread, extras]);
    assert.equal(s.sucre, '');
    assert.equal(s.pain, '');
    assert.deepEqual(Array.from(s.extras), []);
  });
  ok('un groupe obligatoire vide est signalé, un facultatif vide ne l\'est pas', () => {
    assert.equal(ctx.gate(ITEMS.espresso, { sucre: '' }), null);
    const miss = ctx.gate(ITEMS.sandwich, { pain: '', extras: [] });
    assert.equal(miss && miss.key, 'pain');
    assert.equal(ctx.gate(ITEMS.sandwich, { pain: 'wrap', extras: [] }).key, 'extras');
    assert.equal(ctx.gate(ITEMS.sandwich, { pain: 'wrap', extras: ['miel'] }), null);
  });
  ok('« Ajouter » est réellement disabled tant qu\'un groupe obligatoire est vide', () => {
    ctx.sync(ITEMS.sandwich, { pain: '', extras: [] });
    assert.equal(button.disabled, true);
    assert.equal(button.attrs['aria-disabled'], 'true');
    ctx.sync(ITEMS.sandwich, { pain: 'wrap', extras: ['miel'] });
    assert.equal(button.disabled, false);
    assert.equal(button.attrs['aria-disabled'], 'false');
    ctx.sync(ITEMS.espresso, { sucre: '' });
    assert.equal(button.disabled, false, 'tout facultatif : Ajouter reste actif');
  });
  ok('le source ne saute plus les défauts et ne présélectionne plus rien', () => {
    assert.ok(!/skip defaults/.test(HTML), 'plus de « skip defaults »');
    assert.ok(!/sel === opt\.default/.test(HTML), 'plus de comparaison au défaut');
    assert.ok(!/opt\.default \|\|/.test(HTML), 'plus de présélection par défaut');
    assert.match(HTML, /\.custom-add-btn:disabled/, 'style désactivé présent');
  });
}

ok('démo : aucune option de la carte locale ne porte de `default:` ; le pain du sandwich est obligatoire', () => {
  const src = read('assets/orderpro-demo.js');
  const block = src.slice(src.indexOf('var opts = ['), src.indexOf('function item('));
  assert.ok(block.length > 100 && !/\bdefault\s*:/.test(block), 'options démo sans default');
  assert.match(block, /group\('pain', 'Pain', 'one', \[[^\n]*\], true\)/);
});

/* ── L'affiche ne promet que ce que le parcours fait ─────────────────────── */
const POSTER = read('cafe-atlas-qr.html').replace(/-apple-system/g, '');
ok('affiche : pas de paiement intégré, Apple Pay, wallet Kiwi, ni voix de pitch « Gen Z » (page entière, 3 langues)', () => {
  for (const banned of [/Apple/i, /wallet/i, /Gen Z/i, /Paiement intégré/i, /Integrated payment/i, /payez/i, /Paiement confirmé/i, /4[–-]6 min/]) {
    assert.ok(!banned.test(POSTER), 'affiche : ' + banned);
  }
  assert.ok(!/data-lucide="apple"/.test(POSTER), 'plus de bouton Apple Pay dans la maquette');
});
ok('affiche : dit où l\'on paie (à la table ou à la caisse) en FR, EN et AR, comme le parcours', () => {
  assert.match(POSTER, /Il règle à sa table, ou à la caisse/);
  assert.match(POSTER, /They pay at their table, or at the counter/);
  assert.match(POSTER, /فطاولتو، ولا فالكيسة/);
});
ok('affiche : un sélecteur FR / EN / AR existe et l\'arabe passe en dir="rtl"', () => {
  assert.match(POSTER, /id="lang-switch"/);
  for (const l of ['fr', 'en', 'ar']) assert.match(POSTER, new RegExp(`data-lang="${l}"`));
  assert.match(POSTER, /setAttribute\('dir', rtl \? 'rtl' : 'ltr'\)/);
});
ok('affiche : la maquette reprend les phrases réelles de la page de commande', () => {
  const order = read('OrderPro.html');
  assert.match(order, /send_table: "Envoyer en cuisine"/);
  assert.match(POSTER, /send_btn: 'Envoyer en cuisine'/);
  assert.match(order, /cart_note_table: "Paiement à la table après votre dernière commande\."/);
  assert.match(POSTER, /cart_note: 'Paiement à la table après votre dernière commande\.'/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
