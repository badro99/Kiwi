#!/usr/bin/env node
/* Kiwi · briefing-settings-sameclock-test.mjs · briefing#2.
 *
 * Settings edits are merged between devices field by field with a Lamport
 * clock (assets/briefing.js setSettings, assets/briefing-persistence.js
 * mergeDocs). Two edits of one field inside the same millisecond are the case
 * a wall clock cannot order. This goes through the real controller, the way a
 * merchant does it (the `change` listener on a threshold input, then a reset
 * button click), with the clock frozen, and reads what the persistence layer
 * actually stored and what a freshly booted device reads back:
 *
 *   · same-millisecond edits of one field keep the LAST value, in the live
 *     document, in localStorage and after a reboot;
 *   · each edit's field clock is strictly after the one it replaces;
 *   · two devices editing the same field in the same millisecond converge on
 *     one value whichever way their documents are merged, and the merged
 *     clocks survive a second round without dropping to the old value;
 *   · a field never edited on one device does not erase another device's edit.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import briefingSource from './briefing-test-source.cjs';

const T0 = Date.parse('2026-10-26T10:00:00Z');
const src = briefingSource();

function device(memory) {
  const handlers = {};
  const localStorage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
  const els = {};
  const document = { readyState: 'loading', documentElement: { lang: 'en' }, addEventListener(t, fn) { (handlers[t] ||= []).push(fn); },
    querySelector: () => null, getElementById: (id) => els[id] || null, createElement: () => ({ setAttribute() {} }) };
  const window = { KiwiEnv: { isReal: () => true }, KiwiAgentTier: () => 'owner', KiwiCloudDoc: { currentSlug: () => 'fixture' }, addEventListener() {} };
  class Frozen extends Date { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } }
  vm.runInNewContext(src, { window, document, localStorage, console: { ...console, warn() {} }, Date: Frozen, setTimeout, clearTimeout });
  const B = window.KiwiBriefing, T = B._test;
  const type = (key, value) => {            /* what the merchant does: type in a threshold field, leave it */
    const attrs = { 'data-briefing-limit': key };
    const input = { value: String(value), getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; }, closest: () => null };
    (handlers.change || []).forEach((fn) => fn({ target: input }));
    return attrs['aria-invalid'] === 'false';
  };
  const reset = (index) => {
    const btn = { disabled: false, getAttribute: () => String(index) };
    const target = { closest: (sel) => (/data-briefing-reset/.test(sel) ? btn : null) };
    (handlers.click || []).forEach((fn) => fn({ target }));
  };
  const stored = () => JSON.parse(memory.get([...memory.keys()].find((k) => /briefing/i.test(k) && !/cloud-save/.test(k))) || 'null');
  return { B, T, type, reset, stored, window };
}

console.log('■ Réglages du briefing : deux modifications dans la même milliseconde');

/* 1 · one device, one field, three edits in the same millisecond */
{
  const mem = new Map(), d = device(mem);
  assert.ok(d.type('stockFactor', 2), 'first edit accepted by the real change handler');
  const c1 = d.stored().settingsFieldsAt.stockFactor;
  assert.ok(d.type('stockFactor', 3));
  const c2 = d.stored().settingsFieldsAt.stockFactor;
  assert.ok(d.type('stockFactor', 4));
  const c3 = d.stored().settingsFieldsAt.stockFactor;
  assert.ok(c1 < c2 && c2 < c3, 'each same-millisecond edit lands strictly after the one it replaces: ' + [c1, c2, c3]);
  assert.equal(d.B.settings().stockFactor, 4, 'live document keeps the last edit');
  assert.equal(d.stored().settings.stockFactor, 4, 'localStorage keeps the last edit');
  const reboot = device(mem);
  assert.equal(reboot.B.settings().stockFactor, 4, 'a freshly booted device reads the last edit back');
  /* its own merge with the stored copy of itself changes nothing */
  const self = reboot.T.mergeDocs(reboot.stored(), reboot.stored());
  assert.equal(self.settings.stockFactor, 4);
  /* a reset in the same millisecond is also "after" and wins over the typed value */
  reboot.reset(1);
  assert.notEqual(reboot.B.settings().stockFactor, 4, 'reset of the stock rule applies after the typed edit');
  assert.ok(reboot.stored().settingsFieldsAt.stockFactor > c3, 'the reset clock is past the last typed edit');
  assert.equal(device(mem).B.settings().stockFactor, reboot.B.settings().stockFactor, 'and the reset survives a reboot');
}

/* 2 · two devices, same field, same millisecond: one winner, both merge orders */
{
  const a = device(new Map()), b = device(new Map());
  a.type('stockFactor', 2); b.type('stockFactor', 3);
  const da = a.stored(), db = b.stored();
  assert.equal(da.settingsFieldsAt.stockFactor, db.settingsFieldsAt.stockFactor, 'the two devices really did tie on the clock');
  const ab = a.T.mergeDocs(da, db), ba = b.T.mergeDocs(db, da);
  assert.equal(ab.settings.stockFactor, ba.settings.stockFactor, 'the tie resolves to the same value whichever side merges first');
  assert.ok([2, 3].includes(ab.settings.stockFactor));
  /* a second round, with a third edit on one side, cannot resurrect the loser */
  const winner = ab.settings.stockFactor, loser = winner === 2 ? 3 : 2;
  const again = a.T.mergeDocs(ab, da.settings.stockFactor === loser ? da : db);
  assert.equal(again.settings.stockFactor, winner, 'merging the loser again does not flip the winner');
  a.T.write(ab);
  a.type('stockFactor', 5);
  const next = a.T.mergeDocs(a.stored(), db);
  assert.equal(next.settings.stockFactor, 5, 'an edit after the tie beats both tied values');
}

/* 3 · a field one device never touched does not erase the other device's edit */
{
  const a = device(new Map()), b = device(new Map());
  a.type('stockFactor', 2);
  b.type('weatherEffect', 15);
  const m = a.T.mergeDocs(a.stored(), b.stored());
  assert.equal(m.settings.stockFactor, 2);
  assert.equal(m.settings.weatherEffect, 15);
  const m2 = b.T.mergeDocs(b.stored(), a.stored());
  assert.equal(JSON.stringify(m2.settings), JSON.stringify(m.settings), 'disjoint edits merge to the same document in either order');
}
console.log('  ✓ briefing : les modifications de réglages de la même milliseconde gardent la dernière, de la saisie au stockage et au redémarrage, et convergent entre appareils');
