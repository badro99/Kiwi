#!/usr/bin/env node
/* B28 · A guest cancelled an online booking (H-5EA20815, 9 Nov 2026): reception, which had
 * touched nothing, got « Modifications simultanées… l'autre est gardée pour vérification ».
 * stamp() records a register for every field of the device's copy, edited or not, and merge()
 * filed a conflict whenever two registers differed, so a server-side change (guest cancel,
 * /api/hotel/stays) against a field the device only OBSERVED looked like a lost edit.
 * Runs the real assets/field-merge.js: an observed field changed by the server merges
 * silently; a field this device really edited still files the conflict. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { JSON, Object, Array, Set, Map, Number, String, Date, Math };
vm.runInNewContext(fs.readFileSync(new URL('../assets/field-merge.js', import.meta.url), 'utf8'), ctx);
const M = ctx.KiwiFieldMerge;
const clone = (x) => JSON.parse(JSON.stringify(x));
const T0 = 1794252074667, T1 = 1794252133994;

const booking = { id: 'bk-512319d0', code: 'H-5EA20815', source: 'public', status: 'confirmed', updatedAt: T0, customer: { name: 'TEST KIWI' } };
const base = { settings: { published: true, updatedAt: T0 - 5000 }, bookings: [booking] };

// The front desk saves an unrelated setting: its copy now carries registers for every field.
const desk = M.stamp({ ...clone(base), settings: { published: true, note: 'x', updatedAt: T0 + 10 } }, clone(base), T0 + 10);
// Meanwhile the guest cancels online: the server changes the booking, its journal untouched.
const server = clone(desk);
server.bookings[0] = { ...server.bookings[0], status: 'cancelled', updatedAt: T1 };
server.fieldEdits = clone(base.fieldEdits || { fields: [], conflicts: [] });

for (const [label, out] of [['desk ← server', M.merge(desk, server)], ['server ← desk', M.merge(server, desk)]]) {
  assert.equal(out.bookings[0].status, 'cancelled', label + ': the cancellation wins');
  assert.equal(out.settings.note, 'x', label + ': the desk setting is kept');
  assert.equal(out.fieldEdits.conflicts.length, 0, label + ': nothing the desk edited was lost: no warning');
}

// The desk really edits the status (checks the guest in) while the server cancels: that IS a conflict.
const edited = M.stamp({ ...clone(desk), bookings: [{ ...desk.bookings[0], status: 'checked_in', updatedAt: T0 + 20 }] }, clone(desk), T0 + 20);
const both = M.merge(edited, server);
assert.ok(both.fieldEdits.conflicts.some((c) => JSON.parse(c.field).includes('status')), 'a real edit of the status still files its conflict');

// The packed journal stays readable: an edited register keeps its mark through a round trip.
const again = M.merge(M.merge(edited, server), server);
assert.equal(again.fieldEdits.conflicts.length, both.fieldEdits.conflicts.length, 'the edit mark survives the packed journal: no new conflict on re-merge');

console.log('✓ field-merge-observed: a server-side change to a field this device only observed merges silently; a real concurrent edit is still journaled');
