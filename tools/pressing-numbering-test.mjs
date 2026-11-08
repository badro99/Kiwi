#!/usr/bin/env node
/* pressing-numbering-test · the ticket-numbering rules left pressing-ops.js for
 * assets/pressing-numbering.js (note 13 pressing#1). The move changes nothing:
 * the snapshot owner keeps no copy of its own, it merges through the rules it
 * is handed, and those rules give the same tickets as before the move. The
 * till's twin is compared with them in tools/pressing-money-properties-test.mjs.
 *   node tools/pressing-numbering-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import pressingSource from './pressing-test-source.cjs';
import { declaration } from './js-declarations.cjs';
const scan = (source, name) => { const m = new RegExp('(?:^|\\n)\\s*(?:function ' + name + '\\s*\\(|(?:const|let|var) ' + name + '\\s*=)').exec(source); if (!m) throw Error(name); return declaration(source.slice(m.index).trimStart(), name); };

const opsSource = fs.readFileSync('assets/pressing-ops.js', 'utf8');
const context = vm.createContext({ window: { addEventListener() {} } });
vm.runInContext(opsSource, context);
const ops = context.window.KiwiPressingOps;
let model;
const configure = ops.configureNumbering;
ops.configureNumbering = (value) => { model = value; configure(value); };
vm.runInContext(fs.readFileSync('assets/pressing-numbering.js', 'utf8'), context);
let n = 0; const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log('  ✓ ' + msg); };

ok(!/function (?:tillHash|renumberedOrder|mergeOrders|mergeTills)\b/.test(opsSource), 'pressing-ops.js carries no numbering rule of its own');
ok(model && ['renumberedOrder', 'mergeOrders', 'mergeTills'].every((k) => typeof model[k] === 'function') && Object.isFrozen(model), 'the numbering module hands its three rules to the snapshot owner, frozen');

const merge = (a, b) => ops.mergeDocuments({ orders: a }, { orders: b }).orders;
const order = (at, extra = {}) => ({ id: '0042', droppedAt: at, updatedAt: 1, pieces: [{ pid: '0042-1', status: 'recu' }], ...extra });
const plain = (x) => JSON.parse(JSON.stringify(x));
const active = order(2000), other = order(1000);
const merged = merge([active], [other]);
ok(JSON.stringify(plain(merged).map((o) => o.id)) === '["0042","0042-R4"]', 'two tickets under one number: the server copy keeps it, the other becomes 0042-R4 (same as before the move)');
ok(plain(merged)[1].pieces[0].pid === '0042-R4-1' && plain(merged)[1].renumberedFrom === '0042', 'the renumbered ticket takes its garment labels and remembers its old number');
ok(JSON.stringify(plain(merge([{ ...active, updatedAt: 2, rack: 'A' }], [active]))) === JSON.stringify([{ ...active, updatedAt: 2, rack: 'A' }]), 'the same ticket twice keeps the newer copy');
ok(JSON.stringify(plain(merge([active], merged))) === JSON.stringify(plain(merged)), 'merging again changes nothing');
ok(JSON.stringify(plain(merge([other], [active]))) === JSON.stringify(plain(merge([other], [active]))), 'the renumbering is deterministic');

const tills = model.mergeTills({ dabcdefg1: { letter: 'A', at: 5 }, dabcdefg2: { letter: 'A', at: 9 }, bad: { letter: 'B' } }, { dabcdefg3: { letter: 'B', at: 1 } });
ok(JSON.stringify(tills) === JSON.stringify({ dabcdefg3: { letter: 'B', at: 1 }, dabcdefg1: { letter: 'A', at: 5 } }), 'till letters: the server copy wins, a letter keeps its first till, malformed keys are dropped');

/* r21 pressing#B0 · which ticket keeps the original number must not depend on
   which copy meets the other. Two legacy tickets "0042", every order and every
   mix of known/unknown drop time, merged both ways. */
const plainIds = (rows) => plain(rows).map((o) => o.id + '@' + o.droppedAt + ':' + (o.pieces || []).map((p) => p.pid).join('|')).sort().join(',');
let seed = 20261108; const rnd = (k) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % k; };
let both = 0;
for (let i = 0; i < 200; i++) {
  const mk = (tag) => order(rnd(4) === 0 ? undefined : 1000 + rnd(5) * 500, { updatedAt: 1 + rnd(3), rack: tag });
  const left = [mk('L'), ...(rnd(2) ? [mk('L2')] : [])], right = [mk('R'), ...(rnd(2) ? [mk('R2')] : [])];
  assert.equal(plainIds(model.mergeOrders(left, right)), plainIds(model.mergeOrders(right, left)), 'order-independent #' + i);
  both++;
}
ok(both === 200, 'two copies merge to the same tickets and garment labels whichever one is "mine" (200 mixed cases, with and without drop times)');
const early = order(1000, { rack: 'E' }), late = order(2000, { rack: 'L' });
const sorted = plain(model.mergeOrders([late], [early]));
ok(sorted.find((o) => o.id === '0042').droppedAt === 1000 && plain(model.mergeOrders([early], [late])).find((o) => o.id === '0042').droppedAt === 1000, 'unanchored, the ticket dropped first keeps 0042 in both directions');
ok(plain(model.mergeOrders([early], [late], { anchored: true })).find((o) => o.id === '0042').droppedAt === 2000, 'against the server copy a number the server already holds is kept (store.js answers 409 otherwise)');

/* r21 pressing#B1 · the till carries no numbering rule of its own: it runs the
   model it is handed. A marker model proves custody.js delegates (before the
   change it kept its own twin and ignored the model). */
{
  const src = pressingSource.readFileSync('assets/pressing-caisse.js', 'utf8');
  const names = ['numberingRules', 'tillHash', 'orderIdentity', 'renumberedOrder', 'mergeTills'];
  const calls = [];
  const marker = { tillHash: (t) => { calls.push('tillHash'); return 'zz' + t; }, orderIdentity: () => { calls.push('orderIdentity'); return 7; },
    renumberedOrder: (o) => { calls.push('renumberedOrder'); return { ...o, id: 'MARK' }; }, mergeTills: () => { calls.push('mergeTills'); return { dmarker0001: { letter: 'Z', at: 1 } }; } };
  const till = vm.createContext({ window: { KiwiPressingOps: { numbering: () => marker } } });
  vm.runInContext(names.map((n) => scan(src, n)).join('\n') + '\nObject.assign(globalThis,{' + names.join(',') + '});', till);
  ok(till.tillHash('a') === 'zza' && till.orderIdentity({}) === 7 && till.renumberedOrder({ id: '1' }).id === 'MARK' && till.mergeTills({}, {}).dmarker0001.letter === 'Z', 'the till reads hash, identity, renumbering and till letters from the shared model');
  const seen = [];
  marker.mergeOrders = (a, b, options) => { seen.push(options); return [{ id: 'X', updatedAt: 1 }]; };
  const more = ['effectiveStatus', 'orderStatus', 'isLiveOrder', 'isTicketNo', 'normalizeOrderNo', 'publicOrderNo', 'mergePressingDocuments'];
  const till2 = vm.createContext({ window: { KiwiPressingOps: { numbering: () => marker } } });
  vm.runInContext(names.concat(more).map((n) => scan(src, n)).join('\n') + '\nObject.assign(globalThis,{mergePressingDocuments});', till2);
  const doc = till2.mergePressingDocuments({ orders: [order(1)] }, { orders: [order(2)] });
  ok(seen.length === 1 && seen[0].anchored === true && typeof seen[0].reconcile === 'function' && doc.orders.length === 1 && doc.orders[0].id === 'X', 'the till merges tickets through the shared mergeOrders, anchored on the server copy, with its own reconcile');
}

console.log(`\n✓ pressing-numbering-test · ${n} checks`);
