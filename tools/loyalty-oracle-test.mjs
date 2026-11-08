#!/usr/bin/env node
/* loyalty-oracle-test · r21 loyalty#A1. tools/loyalty-properties-test.mjs compares
 * the server rule with its browser copy, so a defect shared by both would pass.
 * This table is written by hand, line by line, from what the product promises
 * (a piece counts for each unit, a weighed line for one stamp, a refund takes
 * back the stamps and points of what it returns and never more than were
 * given). It runs the server module and the generated browser copy against it.
 *   node tools/loyalty-oracle-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as server from '../functions/api/_rules-loyalty.js';

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync('assets/loyalty-rules.js', 'utf8').replace(/^export .*$/mg, ''), ctx);
let checks = 0;
const cafe = { model: 'product', product: { item: 'Café', ids: [] } };
const linked = { model: 'product', product: { item: 'Café', ids: ['p9'] } };

// [label, config, lines, stamps the customer must get]
const earning = [
  ['two pieces of coffee', cafe, [{ name: 'Café', qty: 2, unit: 'unit' }], 2],
  ['one weighed coffee line is one stamp, whatever its weight', cafe, [{ name: 'Café', qty: 1.5, unit: 'kg' }], 1],
  ['a mix: 3 pieces + one weighed line + a tea that does not count', cafe,
    [{ name: 'Café noir', qty: 3 }, { name: 'Café en grains', qty: 0.25, unit: 'kg' }, { name: 'Thé', qty: 4 }], 4],
  ['a fraction with no unit is weighed', cafe, [{ name: 'Café', qty: 0.5 }], 1],
  ['a fraction typed with pieces keeps its whole part', cafe, [{ name: 'Café', qty: 2.5, unit: 'pieces' }], 2],
  ['a renamed product keeps earning through its id', linked, [{ id: 'p9', name: 'Boisson du matin', qty: 2 }], 2],
  ['the same product also found by name is counted once per line', linked, [{ id: 'p9', name: 'Café noir', qty: 2 }], 2],
  ['zero and negative quantities earn nothing', cafe, [{ name: 'Café', qty: 0 }, { name: 'Café', qty: -3 }], 0],
  ['a different word that merely contains the letters earns nothing', cafe, [{ name: 'Cafetière', qty: 2 }], 0],
  ['no lines, no stamps', cafe, [], 0],
  ['visit card: one stamp for the visit', { model: 'visit' }, [], 1],
  ['automatic programme: nothing is stamped here', { model: 'product', auto: true, product: { item: 'Café' } }, [{ name: 'Café', qty: 1 }], 0],
];
// Reversal sequences: each step is [config sale state, amount, lines, client, expected].
const sale = { paid: 100, earned: 100, stamped: 4, unstamped: 0, refunded: 0, clawed: 0 };
const steps = [
  ['first refund returns 3 pieces: 3 stamps and 30 of 100 points go back', sale, 30, [{ name: 'Café noir', qty: 3 }], { points: 100, stamps: 10 }, { take: 30, claw: 30, unstamp: 3, pointsTake: 30, stampsTake: 3 }],
  ['second refund returns the weighed line: the last stamp, the remaining 70 points', { ...sale, refunded: 30, clawed: 30, unstamped: 3 }, 70, [{ name: 'Café en grains', qty: 0.25, unit: 'kg' }], { points: 100, stamps: 10 }, { take: 70, claw: 70, unstamp: 1, pointsTake: 70, stampsTake: 1 }],
  ['a refund after everything came back takes nothing', { ...sale, refunded: 100, clawed: 100, unstamped: 4 }, 50, [{ name: 'Café noir', qty: 3 }], { points: 100, stamps: 10 }, { take: 0, claw: 0, unstamp: 0, pointsTake: 0, stampsTake: 0 }],
  ['the customer already spent their points: only what they still hold is taken', sale, 30, [{ name: 'Café noir', qty: 3 }], { points: 10, stamps: 0 }, { take: 30, claw: 30, unstamp: 3, pointsTake: 10, stampsTake: 0 }],
  ['asking for more than was paid is capped at the amount paid', sale, 500, [{ name: 'Café noir', qty: 1 }], { points: 500, stamps: 9 }, { take: 100, claw: 100, unstamp: 1, pointsTake: 100, stampsTake: 1 }],
  ['a whole refund without lines gives back every stamp left', sale, 100, [], { points: 500, stamps: 9 }, { take: 100, claw: 100, unstamp: 4, pointsTake: 100, stampsTake: 4 }],
];
for (const [name, rules] of [['server', server], ['browser copy', ctx.KiwiLoyaltyRules]]) {
  for (const [label, cfg, lines, want] of earning) { assert.equal(rules.stampsFor(cfg, lines), want, `${name}: ${label}`); checks++; }
  for (const [label, s, amount, lines, client, want] of steps) {
    assert.deepEqual(JSON.parse(JSON.stringify(rules.refundFor(s, amount, cafe, lines, client))), want, `${name}: ${label}`); checks++;
  }
  // The whole sequence, end to end: refunding in two steps equals refunding at once.
  let state = { ...sale }, client = { points: 100, stamps: 10 };
  for (const [amount, lines] of [[30, [{ name: 'Café noir', qty: 3 }]], [70, [{ name: 'Café en grains', qty: 0.25, unit: 'kg' }]]]) {
    const r = rules.refundFor(state, amount, cafe, lines, client);
    state = { ...state, refunded: state.refunded + r.take, clawed: state.clawed + r.claw, unstamped: state.unstamped + r.unstamp };
    client = { points: client.points - r.pointsTake, stamps: client.stamps - r.stampsTake };
  }
  assert.deepEqual([state.refunded, state.clawed, state.unstamped, client.points, client.stamps], [100, 100, 4, 0, 6], `${name}: two-step reversal ends where one whole refund does`); checks++;
}
// The shared word rule: the accent-sensitive short word.
for (const [word, name, want] of [['Thé', 'Thé vert', true], ['Thé', 'The Burger', false], ['The', 'Thé vert', true], ['The', 'The Burger', true],
  ['Café', 'CAFE noir', true], ['cafe', 'Café', true], ['Café', 'Cafétéria', false], ['', 'Café', false]]) {
  assert.equal(server.wordMatcher(word).matches(name), want, `word « ${word} » on « ${name} »`); checks++;
}
console.log(`✓ loyalty-oracle-test · ${checks} hand-written expectations (server and browser copy)`);
