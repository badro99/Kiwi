#!/usr/bin/env node
// Un lot « Lancer » non confirmé laissé sur la tablette par un autre serveur, ou trop ancien pour être rejoué,
// est annoncé une fois avec ses tables ; rien n'est rejoué ni effacé. Le vrai code, exécuté dans vm.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const support = fs.readFileSync(new URL('../assets/serveur/payment-support.js', import.meta.url), 'utf8');
const marker = 'function svOrphanBatches()';
const code = support.slice(support.indexOf(marker), support.indexOf('\n}\n', support.indexOf('function svAnnounceOrphans()')) + 3);
function sandbox() {
  const map = new Map();
  const localStorage = {
    get length() { return map.size; }, key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k),
  };
  const s = { localStorage, JSON, Date, Number, String, Array, Set, console, SV_DRAFT_TTL: 12 * 3600000,
    liveEmployeeState: { merchant: 'santos', staffId: 'emp-7' }, currentUser: 'yasmine', svSlug: () => 'santos',
    toasts: [], toast(message) { s.toasts.push(message); }, employeePick: (fr) => fr };
  vm.createContext(s);
  vm.runInContext(code, s, { filename: 'serveur-orphans.js' });
  return s;
}
const s = sandbox();
const batch = (ref, createdAt) => JSON.stringify({ ref, createdAt, lines: [{ uid: 'l', id: 'm-1', qty: 1 }] });
s.localStorage.setItem('kiwi:service-pending-v1:santos:emp-7:4', batch('mine-fresh', Date.now() - 60000));
s.localStorage.setItem('kiwi:service-pending-v1:santos:emp-7:5', batch('mine-stale', Date.now() - 13 * 3600000));
s.localStorage.setItem('kiwi:service-pending-v1:santos:emp-3:9', batch('left-by-karim', Date.now() - 3600000));
s.localStorage.setItem('kiwi:service-pending-v1:autre:emp-3:2', batch('other-merchant', Date.now()));
assert.equal(JSON.stringify(s.svOrphanBatches().map((o) => o.ref).sort()), JSON.stringify(['left-by-karim', 'mine-stale']),
  'le lot d un autre serveur et le lot trop ancien sont repérés ; le lot récent de cet opérateur et celui d un autre commerce non');
assert.equal(s.svAnnounceOrphans(), 2);
assert.equal(s.toasts.length, 1, 'annoncés une fois');
assert.ok(s.toasts[0].includes('9') && s.toasts[0].includes('5'), 'avec leurs tables');
assert.equal(s.svAnnounceOrphans(), 0, 'sans répéter l annonce');
assert.equal(s.toasts.length, 1);
assert.notEqual(s.localStorage.getItem('kiwi:service-pending-v1:santos:emp-3:9'), null, 'rien n est rejoué ni effacé');
console.log('✓ serveur-orphan-batches : lots laissés repérés, annoncés une fois, jamais rejoués');
