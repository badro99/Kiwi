#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
/* ═══════════════════════════════════════════════════════════════════════════
 * MENU & MODIFICATEURS · CE QUE LA CARTE ET LA CAISSE AFFIRMENT
 *
 * Mesuré le 2026-10-11 sur le stack local (une section, un article à 14,50,
 * un groupe « Lait » à +3, vendu une fois à la caisse) :
 *
 * 1. Le seul article marqué 86, la caisse affichait « Carte pas encore
 *    composée · Ajoutez vos catégories et vos plats » : elle renvoyait le
 *    caissier recomposer une carte qui existe.
 * 2. « 1 catégories · 1 articles » à la caisse, « 1 articles », « 1 tickets »,
 *    « 0 remboursements », « 1 articles vendus » au tableau de bord.
 * 3. « 14,5 MAD » au tableau de bord, « 14,50 MAD » à la caisse.
 * 4. Une section créée, la carte vide disait encore « Créez une section ».
 * 5. Le bouton qui ouvre l'éditeur complet d'un groupe d'options disait
 *    « Renommer » : personne ne cherche là le prix d'un supplément.
 *
 *   node tools/menu-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RMW = readFileSync(path.join(ROOT, 'assets/restaurant-menu-workspace.js'), 'utf8');
const CAISSE = caisseTestSource(readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8'));
const I18N = readFileSync(path.join(ROOT, 'assets/i18n.js'), 'utf8');

function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
function line(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  return src.slice(i, src.indexOf('\n', i));
}

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* The till's empty state, run against its real carteState. */
function tillEmpty(formulaItems) {
  const ctx = vm.createContext({ carteState: { formulaItems } });
  vm.runInContext(grab(CAISSE, 'function unavailableMenuCount(') + '\n' + grab(CAISSE, 'function emptyMenuHTML(') + '\nthis.html = emptyMenuHTML();', ctx);
  return ctx.html;
}
ok('carte dont l’unique article est 86 : la caisse dit « indisponible », pas « pas encore composée »', () => {
  const html = tillEmpty([{ id: 'it_2', name: 'Café crème', avail: false }]);
  assert.match(html, /Le seul article de la carte est indisponible/);
  assert.ok(!/pas encore composée/.test(html));
  assert.match(tillEmpty([{ avail: false }, { avail: false }, { avail: false }]), /Les 3 articles de la carte sont indisponibles/);
});
ok('une carte vraiment vide reste « pas encore composée »; un article de formule ou archivé ne compte pas', () => {
  assert.match(tillEmpty([]), /Carte pas encore composée/);
  assert.match(tillEmpty([{ avail: false, formulaOnly: true }, { avail: false, archived: true }]), /Carte pas encore composée/);
});
ok('la caisse accorde « catégorie » et « article » (0 et 1 au singulier)', () => {
  assert.match(CAISSE, /\$\{menuItems\.length > 1 \? 'articles' : 'article'\}/);
  assert.match(CAISSE, /\$\{cats\.length - 1 > 1 \? 'catégories' : 'catégorie'\}/);
  assert.match(CAISSE, /<span id="vrap-cat-count"><\/span>/, 'no "7 catégories" placeholder before the menu renders');
  assert.match(CAISSE, /<span id="vrap-item-count"><\/span>/);
});

/* The dashboard's money and count helpers. */
const KN = { format: (v, o) => new Intl.NumberFormat('fr-FR', o).format(v) };
const dashCtx = vm.createContext({ window: { KiwiNumber: KN }, document: { documentElement: { lang: 'fr' } }, Intl, Number, Math });
vm.runInContext(line(RMW, '  const cash=(n)=>') + '\nthis.cash = cash;', dashCtx);
const nb = (s) => s.replace(/[  ]/g, ' ');
ok('« 14,50 MAD » et « 16 MAD », comme à la caisse', () => {
  assert.equal(nb(dashCtx.cash(14.5)), '14,50 MAD');
  assert.equal(nb(dashCtx.cash(16)), '16 MAD');
  assert.equal(nb(dashCtx.cash(3.256)), '3,26 MAD');
});

const UI_I18N = {
  fr: { ledgerTickets: '{n} tickets', ledgerTickets1: '{n} ticket', ledgerRefundCount: '{n} remboursements', ledgerRefundCount1: '{n} remboursement', plain: '{n} x' },
  en: { ledgerTickets: '{n} tickets', ledgerTickets1: '{n} ticket' },
};
function uiIn(lang) {
  const ctx = vm.createContext({ UI_I18N, lang: () => lang, Object, Math, RegExp });
  vm.runInContext(grab(RMW, 'function ui(key, params)') + '\nthis.ui = ui;', ctx);
  return ctx.ui;
}
ok('« 1 ticket », « 0 remboursement », « 2 tickets »; en anglais « 0 tickets »', () => {
  const fr = uiIn('fr'), en = uiIn('en');
  assert.equal(fr('ledgerTickets', { n: 1 }), '1 ticket');
  assert.equal(fr('ledgerRefundCount', { n: 0 }), '0 remboursement');
  assert.equal(fr('ledgerTickets', { n: 2 }), '2 tickets');
  assert.equal(en('ledgerTickets', { n: 1 }), '1 ticket');
  assert.equal(en('ledgerTickets', { n: 0 }), '0 tickets');
  assert.equal(fr('plain', { n: 1 }), '1 x', 'no singular key: unchanged');
});
ok('« Tous · 1 article », « 1 article vendu », compteur de recherche au singulier', () => {
  assert.ok(RMW.includes("${esc(countLabel(list.length))}</small>"), 'the list head counts through countLabel');
  assert.ok(RMW.includes("catalogLabel(searching?'result':'item',searching?'résultat':'article')"));
  assert.ok(RMW.includes("?'itemSold':'itemsSold'"));
  assert.ok(/itemSold: 'article vendu'/.test(RMW));
  for (const k of ["'catalog.item'", "'catalog.result'"]) assert.equal((I18N.match(new RegExp(k, 'g')) || []).length, 2, k + ' in EN and AR');
});
ok('une section existe : la carte vide propose d’ajouter un article', () => {
  assert.ok(RMW.includes("ui((d.cats||[]).length?'emptyItemsDesc':'emptyMenuDesc')"));
  assert.ok(RMW.includes('data-action="rmw-item-add">${esc(ui(\'addFirstItemBtn\'))}'));
  assert.ok(/emptyItemsDesc: 'Vos sections sont prêtes\./.test(RMW));
});
ok('le bouton de l’éditeur de groupe dit « Modifier les choix »', () => {
  assert.ok(RMW.includes('data-action="rmw-group-edit" data-arg="${g.id}">${ic(\'edit\')} ${esc(ui(\'editGroup\'))}'));
  assert.ok(/editGroup: 'Modifier les choix'/.test(RMW) && /editGroup: 'Edit choices'/.test(RMW));
});

console.log(`\nmenu-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
