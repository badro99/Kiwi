/* Séquences aléatoires contre le vrai propriétaire, oracle indépendant en centimes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const fc = createRequire(new URL('../app/package.json', import.meta.url))('fast-check');
const context = vm.createContext({});
const { declaration } = createRequire(import.meta.url)('./js-declarations.cjs');
vm.runInContext(declaration(fs.readFileSync('assets/caisse/catalogue.js', 'utf8'), 'createCurrentOrder'), context);
vm.runInContext(fs.readFileSync('assets/caisse/table-settlement.js', 'utf8'), context);
const plain = x => JSON.parse(JSON.stringify(x));
const actions = fc.array(fc.record({ kind: fc.constantFrom('open', 'pay', 'split', 'settle', 'reopen', 'transfer', 'merge'),
  table: fc.integer({ min: 0, max: 3 }), other: fc.integer({ min: 0, max: 3 }), amount: fc.integer({ min: 0, max: 100000 }),
  retry: fc.boolean(), reload: fc.boolean() }), { minLength: 50, maxLength: 150 });
const runs = Number(process.env.KIWI_PROPERTY_RUNS) || 300;
let steps = 0;
fc.assert(fc.property(actions, sequence => {
  let tables = Object.fromEntries([0, 1, 2, 3].map(id => [id, { status: 'khawya' }]));
  let lines = {}, api = context.createTableSettlement(tables, lines, null, context.createCurrentOrder({ tables: lines }));
  const model = [0, 1, 2, 3].map(() => ({ total: 0, entries: [], lines: [], allocations: [] }));
  const due = m => m.total - m.entries.reduce((sum, e) => sum + (e.kind === 'refund' ? -e.amountCents : e.amountCents), 0);
  sequence.forEach((action, index) => {
    const { kind, table, other, amount } = action, m = model[table], n = model[other], id = 'op:' + index;
    let call;
    if (kind === 'open' && due(m) === 0) {
      const line = { id, amountCents: amount };
      call = () => api.open(table, { id, totalCents: amount, session: id, lines: [line] });
      Object.assign(m, { total: amount, entries: [], lines: [line], allocations: [] });
    } else if (kind === 'pay' && due(m) >= 0) {
      const value = Math.min(amount, due(m));
      call = () => api.addPayment(table, { id, amountCents: value });
      m.entries.push({ id, kind: 'payment', amountCents: value });
    } else if (kind === 'split' && due(m) >= 0) {
      const first = Math.min(due(m), amount), parts = [first, due(m) - first];
      call = () => api.allocateSplit(table, { id, parts });
      m.allocations = parts;
    } else if (kind === 'settle' && due(m) === 0) {
      call = () => api.settle(table);
    } else if (kind === 'reopen') {
      const payment = m.entries.find(e => e.kind === 'payment' && !m.entries.some(r => r.paymentId === e.id));
      if (payment) {
        call = () => api.reopen(table, { id, paymentId: payment.id, session: id });
        m.entries.push({ id, kind: 'refund', paymentId: payment.id, amountCents: payment.amountCents });
      }
    } else if ((kind === 'transfer' || kind === 'merge') && table !== other && (kind === 'merge' || due(n) === 0)) {
      call = () => api[kind](table, other, { id });
      const merge = kind === 'merge';
      n.total = m.total + (merge ? n.total : 0);
      n.entries = (merge ? n.entries : []).concat(m.entries);
      n.lines = (merge ? n.lines : []).concat(m.lines);
      n.allocations = merge ? [] : m.allocations;
      Object.assign(m, { total: 0, entries: [], lines: [], allocations: [] });
    }
    if (call) {
      call();
      const before = JSON.stringify(tables);
      if (action.retry) { call(); assert.equal(JSON.stringify(tables), before, 'Tentative répétée sans mutation'); }
    }
    if (action.reload) { tables = plain(tables); lines = plain(lines); api = context.createTableSettlement(tables, lines, null, context.createCurrentOrder({ tables: lines })); }
    model.forEach((expected, key) => {
      const actual = api.snapshot(key).settlement;
      if (!actual) { assert.equal(expected.total, 0); return; }
      assert.equal(actual.totalCents, expected.total);
      assert.equal(api.balance(key), due(expected));
      assert.deepEqual(plain(actual.lines), expected.lines);
      assert.deepEqual(plain(actual.allocations), expected.allocations);
      assert.deepEqual(plain(actual.entries).map(({ id, kind, amountCents, paymentId }) => ({ id, kind, amountCents, ...(paymentId ? { paymentId } : {}) })), expected.entries);
      assert.ok(Number.isSafeInteger(api.balance(key)) && api.balance(key) >= 0);
      const snap = api.snapshot(key); snap.settlement.entries.push({ amountCents: 999 });
      assert.equal(api.balance(key), due(expected), 'Instantané sans accès au journal privé');
    });
    const trail = a => a ? (a.entries || []).concat((a.history || []).flatMap(trail)) : [];
    const ids = Object.keys(tables).flatMap(key => trail(api.snapshot(key).settlement).map(e => e.id));
    assert.equal(new Set(ids).size, ids.length, 'Journal historique sans entrée dupliquée');
    const all = model.flatMap(m => m.entries.map(e => e.id));
    assert.equal(new Set(all).size, all.length, 'Chaque paiement et remboursement rattaché une fois');
    steps++;
  });
}), { seed: 20261026, numRuns: runs });
// Lignes réelles déplacées une fois, y compris après restauration et nouvelle tentative.
const t = { a: { status: 'ka-yaklo' }, b: { status: 'khawya' } }, l = { a: [{ uid: 'article' }] };
let api = context.createTableSettlement(t, l, null, context.createCurrentOrder({ tables: l }));
api.open('a', { id: 'open', totalCents: 17, lines: l.a });
api.addPayment('a', { id: 'pay', amountCents: 5 });
api.transfer('a', 'b', { id: 'move' });
api = context.createTableSettlement(plain(t), l, null, context.createCurrentOrder({ tables: l }));
api.transfer('a', 'b', { id: 'move' });
assert.equal(l.b.length, 1); assert.equal(l.a, undefined); assert.equal(api.balance('b'), 12);
// r21 tables#A2 · rechargement COMPLET (tables ET lignes repassent par leur sérialisation de stockage, comme
// localStorage) après un paiement partiel, entre le transfert et son accusé perdu : solde affiché et propriétaire
// de la commande doivent rester ceux de la table d'arrivée, et rejouer le transfert ne déplace rien de plus.
{
  const store = (obj) => JSON.stringify(obj), restore = (raw) => JSON.parse(raw);
  const T0 = { a: { status: 'ka-yaklo' }, b: { status: 'khawya' } }, L0 = { a: [{ uid: 'tajine', qty: 2 }, { uid: 'the', qty: 1 }] };
  let api0 = context.createTableSettlement(T0, L0, null, context.createCurrentOrder({ tables: L0 }));
  api0.open('a', { id: 'open-r21', totalCents: 21000, session: 's-r21', lines: L0.a });
  api0.addPayment('a', { id: 'pay-r21', amountCents: 8000 });
  assert.equal(api0.balance('a'), 13000);
  api0.transfer('a', 'b', { id: 'move-r21' });                    // la réponse se perd ici : l'appareil recharge
  let T1 = restore(store(T0)), L1 = restore(store(L0));
  let api1 = context.createTableSettlement(T1, L1, null, context.createCurrentOrder({ tables: L1 }));
  assert.equal(api1.balance('b'), 13000, 'solde affiché de la table d\'arrivée après rechargement');
  assert.equal(api1.balance('a'), 0, 'la table de départ ne garde aucun solde');
  assert.deepEqual(plain(L1.b).map((x) => x.uid), ['tajine', 'the'], 'la commande appartient à la table d\'arrivée');
  assert.equal(L1.a, undefined, 'plus aucune ligne sur la table de départ');
  api1.transfer('a', 'b', { id: 'move-r21' });                    // le serveur rejoue : aucune mutation
  assert.equal(store(T1), store(restore(store(T1))));
  assert.equal(L1.b.length, 2, 'rejouer le transfert ne duplique aucune ligne'); assert.equal(api1.balance('b'), 13000);
  const T2 = restore(store(T1)), L2 = restore(store(L1));        // second rechargement, puis paiement du reste
  const api2 = context.createTableSettlement(T2, L2, null, context.createCurrentOrder({ tables: L2 }));
  api2.addPayment('b', { id: 'pay-rest-r21', amountCents: 13000 });
  assert.equal(api2.balance('b'), 0); api2.settle('b');
  const trail = (a) => a ? (a.entries || []).concat((a.history || []).flatMap(trail)) : [];
  assert.deepEqual(plain(trail(api2.snapshot('b').settlement).map((e) => e.amountCents).sort((x, y) => x - y)), [8000, 13000], 'les deux paiements, une fois chacun');
}
// Reprise sur une autre table après réutilisation de la table d'origine.
api.addPayment('b', { id: 'pay-rest', amountCents: 12 }); api.settle('b');
api.open('b', { id: 'next-visit', totalCents: 99, lines: [{ uid: 'new-party' }] });
api.reopen('a', { id: 'refund-old', paymentId: 'pay-rest', session: 'reopened' });
assert.equal(api.balance('a'), 12); assert.equal(api.balance('b'), 99);
assert.equal(api.snapshot('a').settlement.entries.length, 3);
const before = JSON.stringify(api.snapshot('a'));
assert.throws(() => api.reopen('a', { id: 'double-refund', paymentId: 'pay-rest' }));
assert.equal(JSON.stringify(api.snapshot('a')), before);
assert.throws(() => api.addPayment('a', { id: 'overpay', amountCents: 13 }));
assert.throws(() => api.addPayment('a', { id: 'fraction', amountCents: 0.1 }));
assert.throws(() => api.settle('a'));
assert.throws(() => api.open('a', { id: 'erase-balance', totalCents: 0 }));
assert.throws(() => api.addPayment('a', { id: 'bad-tip', amountCents: 1, tipCents: -1 }));
api.addPayment('a', { id: 'bad-tip', amountCents: 1 });
assert.equal(api.balance('a'), 11);
console.log(`PASS règlement : ${runs} séquences, ${steps} étapes, centimes, remboursements, instantanés et reprises`);
