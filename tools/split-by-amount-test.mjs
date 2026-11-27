/* « Par montant » (caisse/split-tender.js) : le caissier tape ce que paie
   chaque convive, la dernière part prend le reste au centime. Client du
   27 nov. 2026 : « la division, on ne peut pas saisir le montant ». */
import caisseTestSource from './caisse-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = caisseTestSource(fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8'));
function fn(name) {
  const start = source.indexOf('    function ' + name + '(');
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n    function ', start + 1);
  return source.slice(start, end);
}
let checks = 0;
const check = (label, f) => { f(); checks++; console.log('✓ ' + label); };
const money = v => Math.round(Number(v) * 100) / 100;
function harness(amountParts, overrides = {}) {
  const elements = new Map();
  const state = {
    splitMode: 'montant', total: 400, numParts: 2, numConvives: 2, tableId: null, isVrap: true,
    activeConvive: 1, flow: null, amountParts,
    itemTotals: { 'Tajine kefta': { totalQty: 1, unitPrice: 180, itemId: 'kefta' }, 'Couscous royal': { totalQty: 1, unitPrice: 220, itemId: 'royal' } },
    perConvive: {}, ...overrides,
  };
  const calls = { toast: [], render: 0 };
  const context = vm.createContext({
    window: { crypto: { randomUUID: () => 'fixture-split-flow' } },
    tables: {}, tableOrders: {}, splitState: state, money,
    minor: v => Math.round(v * 100), major: v => v / 100,
    effectiveTipPct: () => overrides.tipPct || 0, phoneSessionOf: () => '',
    activeSaleDiscount: () => null, recordSale: () => null, markPaid() {}, selectedId: null,
    lineCat: () => 'meal', toast: s => calls.toast.push(s), fmtMADcents: v => v.toFixed(2) + ' MAD',
    $: id => { if (!elements.has(id)) elements.set(id, { hidden: false, disabled: false, textContent: '', title: '' }); return elements.get(id); },
    renderSplitFlow: () => calls.render++, lucide: { createIcons() {} },
  });
  for (const name of ['splitAmountTr', 'splitAmountCents', 'splitAmountAllocation', 'updateSplitAmountSummary', 'shareMoney', 'shareWeighted', 'launchSplitFlow']) {
    vm.runInContext(caisseTestSource.withSettlement(fn(name)), context);
  }
  return { context, state, calls, elements };
}

check('typed amounts are read as dirhams, with a comma or spaces, and refused when unreadable', () => {
  const { context } = harness(['']);
  assert.equal(context.splitAmountCents('150'), 15000);
  assert.equal(context.splitAmountCents('100,50'), 10050);
  assert.equal(context.splitAmountCents('1 200'), 120000);
  for (const bad of ['', '  ', 'abc', '-5', '1,234', '12.345']) assert.equal(context.splitAmountCents(bad), null, bad);
});
check('the last share is the rest of the bill, to the centime', () => {
  const h = harness(['150', '100,50']);
  const a = h.context.splitAmountAllocation();
  assert.equal(a.ok, true);
  assert.deepEqual(Array.from(a.cents), [15000, 10050, 14950]);
  h.context.updateSplitAmountSummary();
  assert.equal(h.elements.get('#split-launch').disabled, false);
  assert.equal(h.elements.get('#split-amount-rest').textContent, '149.50 MAD');
});
check('an empty, zero or too-large amount blocks the split and says why', () => {
  for (const parts of [[''], ['0'], ['150', ''], ['400'], ['300', '150']]) {
    const h = harness(parts);
    h.context.updateSplitAmountSummary();
    assert.equal(h.elements.get('#split-launch').disabled, true, parts.join('+'));
    h.context.launchSplitFlow();
    assert.equal(h.state.flow, null, parts.join('+'));
    assert.equal(h.calls.toast.length, 1);
  }
});
check('launch builds one share per amount, and every dish is shared out exactly once', () => {
  const h = harness(['150', '100,50']);
  h.context.launchSplitFlow();
  const parts = h.state.flow.parts;
  assert.deepEqual(Array.from(parts, p => p.amount), [150, 100.5, 149.5]);
  assert.ok(parts.every(p => p.tip === 0 && p.base === p.amount && !p.paid));
  for (const id of ['kefta', 'royal']) {
    const lines = parts.map(p => p.lines.find(l => l.itemId === id));
    const full = id === 'kefta' ? 180 : 220;
    assert.equal(Math.round(lines.reduce((s, l) => s + l.total * 100, 0)), full * 100, id + ' total');
    /* recordSale() books qty / shareDen: the three fractions make one dish. */
    const qty = lines.reduce((s, l) => s + Math.round(l.qty / l.shareDen * 1000) / 1000, 0);
    assert.ok(Math.abs(qty - 1) <= 0.002, id + ' quantity ' + qty);
    assert.ok(lines.every(l => l.shareDen > 1));
  }
  assert.equal(h.calls.render, 1);
});
check('a tip picked earlier in « parts égales » does not leak into typed amounts', () => {
  const h = harness(['150'], { tipPct: 10 });
  h.context.launchSplitFlow();
  assert.deepEqual(Array.from(h.state.flow.parts, p => p.amount), [150, 250]);
});
console.log(`\n${checks} checks passed · split-by-amount-test`);
