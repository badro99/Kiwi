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
console.log(`\n✓ pressing-numbering-test · ${n} checks`);
