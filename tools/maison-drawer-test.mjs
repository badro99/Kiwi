#!/usr/bin/env node
/* Caisse maison · le tiroir-caisse (assets/pos-maison/drawer.js).
 *
 * La Maison en Vogue rendait la monnaie tiroir fermé (20 nov. 2026) : la
 * caisse maison n'envoyait jamais l'impulsion d'ouverture, ni après des
 * espèces, ni par un bouton. Ce test tient les deux gestes sur le vrai module,
 * et l'impulsion elle-même sur le vrai constructeur ESC/POS (broches 2 et 5). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); passed++; };

/* L'impulsion : ESC p sur la broche 2 puis sur la broche 5. */
const ctx = { window: {}, TextEncoder, Uint8Array, Array, Math, String, Number, Object, console };
ctx.window.window = ctx.window; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/escpos.js'), 'utf8'), ctx, { filename: 'assets/escpos.js' });
const bytes = Array.from(ctx.window.KiwiEscPos.builder().drawer().bytes());
eq(bytes, [0x1b, 0x70, 0x00, 0x19, 0xfa, 0x1b, 0x70, 0x01, 0x19, 0xfa], 'the kick pulses pin 2 then pin 5, so a drawer on either wire opens');

const { mzKickForCash, mzOpenDrawerNoSale } = await import('../assets/pos-maison/drawer.js');
const setup = ({ hw = 'ok', gate = 'approve', off = false } = {}) => {
  const kicks = [], toasts = [], records = [], acts = [];
  globalThis.window = {
    KiwiHardware: hw ? { openDrawer: () => { kicks.push(1); return Promise.resolve(hw === 'ok' ? { ok: true } : { ok: false, reason: 'drawer-failed' }); } } : undefined,
    KiwiConfig: { off: (k) => off && (k === 'open-drawer' || k === 'openDrawer') },
    KiwiAuthAct: (a) => acts.push(a.kind),
  };
  if (gate === 'approve') window.requireManager = (label, go) => go({ id: 'u-1', name: 'Imane' });
  else if (gate === 'refuse') window.requireManager = () => {};
  return { kicks, toasts, records, acts, toast: (m) => toasts.push(m) };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

/* Après un encaissement. */
let w = setup();
await mzKickForCash([{ m: 'carte', amount: 300 }, { m: 'espèces', amount: 150 }], w.toast);
eq(w.kicks.length, 1, 'a payment with cash in it opens the drawer once');
w = setup();
await mzKickForCash([{ m: 'carte', amount: 450 }], w.toast);
await mzKickForCash([{ m: 'avoir', amount: 80, code: 'AV-1' }, { m: 'livraison', amount: 370 }], w.toast);
eq(w.kicks.length, 0, 'card, credit note or delivery alone never open the drawer');
w = setup({ hw: 'fail' });
await mzKickForCash([{ m: 'espèces', amount: 20 }], w.toast);
eq(w.toasts, ["Tiroir injoignable · vérifiez l'imprimante du comptoir"], 'a drawer that does not answer is said, so the cashier checks the printer');

/* « Ouvrir le tiroir » sans vente. */
w = setup();
mzOpenDrawerNoSale({ real: () => true, record: (m) => w.records.push(m), toast: w.toast }); await tick();
eq([w.acts, w.kicks.length, w.records], [['open_drawer'], 1, [{ movementKind: 'no-sale', movementAmountCents: 0, movementReason: 'Ouverture sans vente' }]],
  'a real store opens it after the manager code, logs the act and leaves a zero-amount movement');
w = setup({ gate: 'refuse' });
mzOpenDrawerNoSale({ real: () => true, record: (m) => w.records.push(m), toast: w.toast }); await tick();
eq([w.kicks.length, w.records.length], [0, 0], 'no manager code, no opening and no trace');
w = setup({ gate: 'missing' });
eq(mzOpenDrawerNoSale({ real: () => true, record: (m) => w.records.push(m), toast: w.toast }), false, 'a real store without the code gate refuses');
eq([w.kicks.length, w.toasts], [0, ['Code manager ou propriétaire requis']], 'and says why');
w = setup({ gate: 'missing' });
mzOpenDrawerNoSale({ real: () => false, record: (m) => w.records.push(m), toast: w.toast }); await tick();
eq(w.kicks.length, 1, 'the demo till opens without a code');
w = setup({ off: true });
mzOpenDrawerNoSale({ real: () => true, record: (m) => w.records.push(m), toast: w.toast }); await tick();
eq([w.kicks.length, w.toasts], [0, ['Ouverture manuelle du tiroir désactivée pour cet établissement']], 'the operator switch keeps the manual opening off');
delete globalThis.window;

console.log(`✓ maison drawer · ${passed} checks`);
