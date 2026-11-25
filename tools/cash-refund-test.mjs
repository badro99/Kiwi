#!/usr/bin/env node
/* « Remboursement » d'une sortie de caisse (assets/caisse/cash-refund.js).
 *
 * 25 nov. 2026 : un patron prend 100 MAD au tiroir, puis les rend. On tapait
 * −100 puis +100 et la liste du service lisait deux mouvements sans lien. Le
 * remboursement entre au tiroir comme une entrée liée (`refundOf`), jamais plus
 * que ce qui reste à rendre, et la liste montre la sortie « Remboursée ». */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets/caisse/cash-refund.js'), 'utf8');
let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label); };
console.log('■ Remboursement d\'une sortie de caisse (tools/cash-refund-test.mjs)');

/* Un DOM minuscule : juste ce que le module lit et écrit. */
function el(id) {
  const e = { id, value: '', innerHTML: '', textContent: '', className: '', dataset: {}, style: {}, children: [], listeners: {},
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }, toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); } },
    insertAdjacentHTML(_, html) { e.inserted = (e.inserted || '') + html; },
    addEventListener(t, fn) { (e.listeners[t] = e.listeners[t] || []).push(fn); },
    querySelector() { return { textContent: '' }; } };
  return e;
}
const nodes = Object.fromEntries(['cm-type', 'cash-move-modal', 'cm-amount', 'cm-list', 'cm-rf-list'].map(id => [id, el(id)]));
const toasts = [], emitted = [];
const ctx = {
  window: {}, document: { getElementById: id => nodes[id] || null, querySelectorAll: () => [], head: { appendChild() {} }, createElement: () => ({}) },
  cashMovements: [
    { id: 'cm-a', time: new Date(2026, 10, 25, 14, 0), type: 'out', amount: 100, reason: 'Courses', actorName: 'Patron' },
    { id: 'cm-b', time: new Date(2026, 10, 25, 15, 0), type: 'out', amount: 0, reason: 'Ouverture sans vente' },
  ],
  carteLang: () => 'fr', fmtMAD: n => (Math.round(n * 100) / 100) + ' MAD', money: n => Math.round(n * 100) / 100,
  toast: m => toasts.push(m), requireTillOperator: (_, cb) => cb({ id: 'u1', name: 'Sara' }),
  cashActorId: () => 'u1', currentCashier: null, cashSessionId: () => 'shift-1', drawerExpected: () => 0,
  shiftOpenedAt: new Date(), emitCashSession: e => emitted.push(e), persistShift() {}, refreshOpenReconciliationModals() {},
  closeCashMove() {}, renderCmList() { nodes['cm-list'].innerHTML = 'BASE'; }, openCashMove() {},
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
ctx.openCashMove();   // monte le bouton et le gestionnaire
nodes['cm-type-refund'] = el('cm-type-refund');
const click = (target) => nodes['cash-move-modal'].listeners.click[0]({ target: { closest: s => target(s) }, stopPropagation() {} });
const btn = { refund: s => s === '[data-cm-refund]' ? {} : null, row: id => s => s === '[data-rf-id]' ? { dataset: { rfId: id } } : null, confirm: s => s === '#cm-confirm' ? {} : null };

ok('le troisième sens s\'appelle « Remboursement »', /data-cm-refund/.test(nodes['cm-type'].inserted || ''));
click(btn.refund);
ok('une seule sortie à rendre : elle est choisie et son montant proposé', nodes['cm-amount'].value === '100');
ok('l\'ouverture sans vente (0 MAD) n\'est pas remboursable', !/Ouverture sans vente/.test(nodes['cm-rf-list'].innerHTML));
nodes['cm-amount'].value = '150';
click(btn.confirm);
ok('jamais plus que la sortie', ctx.cashMovements.length === 2 && /Au plus/.test(toasts.at(-1)));
nodes['cm-amount'].value = '60';
click(btn.confirm);
const r = ctx.cashMovements.at(-1);
ok('le remboursement est une entrée liée à sa sortie', r.type === 'in' && r.amount === 60 && r.refundOf === 'cm-a' && r.reason === 'Remboursement · Courses');
ok('le serveur reçoit une entrée ordinaire', emitted.length === 1 && emitted[0].movementKind === 'in' && emitted[0].movementAmountCents === 6000);
ctx.renderCmList();
ok('partiel : la sortie montre ce qui a été rendu et ce qui reste', /Remboursée · 60 MAD/.test(nodes['cm-list'].innerHTML) && /− 40 MAD/.test(nodes['cm-list'].innerHTML));
ok('la contrepartie ne fait pas une deuxième ligne', !/Remboursement · Courses/.test(nodes['cm-list'].innerHTML));
click(btn.refund);
ok('il reste 40 à rendre', nodes['cm-amount'].value === '40' && /reste 40 MAD/.test(nodes['cm-rf-list'].innerHTML));
click(btn.confirm);
click(btn.refund);
ok('rendue en entier, la sortie quitte la liste à rembourser', /Aucune sortie/.test(nodes['cm-rf-list'].innerHTML));
/* Reprise du serveur après un plantage : l'entrée revient sans `refundOf`. */
ctx.cashMovements.splice(2);
ctx.cashMovements.push({ id: 'srv-1', time: new Date(), type: 'in', amount: 100, reason: 'Remboursement · Courses' });
ctx.renderCmList();
ok('une entrée reprise du serveur se rattache par son motif', /Remboursée</.test(nodes['cm-list'].innerHTML));
console.log(`\ncash-refund: ${passed} passed`);
