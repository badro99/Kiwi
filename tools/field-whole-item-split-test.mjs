import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
function fn(name, text = source) {
  const start = text.indexOf('    function ' + name + '(');
  assert.ok(start >= 0, name);
  const end = text.indexOf('\n    function ', start + 1);
  return text.slice(start, end);
}
let checks = 0;
const check = (label, f) => { f(); checks++; console.log('✓ ' + label); };
const money = v => Math.round(Number(v) * 100) / 100;
function harness(overrides = {}) {
  const elements = new Map();
  const state = {
    splitMode: 'article', total: 90, numParts: 2, numConvives: 2, tableId: 'T7',
    activeConvive: 1, flow: null,
    itemTotals: { Pasta: { totalQty: 1, unitPrice: 60, itemId: 'pasta' }, Water: { totalQty: 2, unitPrice: 15, itemId: 'water' } },
    perConvive: {}, ...overrides,
  };
  const calls = { toast: [], render: 0 };
  const context = vm.createContext({
    splitState: state, money, minor: v => Math.round(v * 100), major: v => v / 100,
    effectiveTipPct: () => overrides.tipPct || 0, phoneSessionOf: () => 'existing-visit',
    lineCat: () => 'meal', toast: s => calls.toast.push(s),
    $: id => { if (!elements.has(id)) elements.set(id, { hidden: false, disabled: false, textContent: '', title: '' }); return elements.get(id); },
    renderSplitFlow: () => calls.render++, lucide: { createIcons() {} },
    renderConvivesChips() {}, renderConvivesTabs() {}, renderPool() {}, renderConviveCart() {},
  });
  for (const name of ['remainingQty', 'assignUnit', 'unassignUnit', 'splitArticleAllocation', 'renderArticleMode', 'shareMoney', 'shareWeighted', 'launchSplitFlow']) vm.runInContext(fn(name), context);
  return { context, state, calls, elements };
}
check('Unassigned items block actual payment-flow creation, no implicit fractions', () => {
  const h = harness({ perConvive: { 1: { Water: 1 }, 2: { Water: 1 } } });
  h.context.launchSplitFlow();
  assert.equal(h.state.flow, null); assert.equal(h.calls.render, 0);
  assert.match(h.calls.toast[0], /1 article à attribuer/);
  h.context.renderArticleMode(); assert.equal(h.elements.get('#split-launch').disabled, true);
});
check('Whole-item assignment enables payment and preserves exact quantities/prices', () => {
  const h = harness({ perConvive: { 1: { Water: 1 }, 2: { Water: 1 } } });
  h.context.assignUnit('Pasta'); h.context.renderArticleMode();
  assert.equal(h.elements.get('#split-launch').disabled, false);
  h.context.launchSplitFlow();
  assert.deepEqual(Array.from(h.state.flow.parts, p => p.amount), [75, 15]);
  const lines = h.state.flow.parts.flatMap(p => p.lines);
  assert.equal(lines.filter(l => l.itemId === 'pasta').length, 1);
  assert.equal(lines.find(l => l.itemId === 'pasta').price, 60);
  assert.ok(lines.every(l => Number.isInteger(l.qty) && !l.name.includes('1/')));
});
for (const [label, cart] of Object.entries({ fractional: { 1: { Pasta: .5, Water: 1 }, 2: { Pasta: .5, Water: 1 } }, overassigned: { 1: { Pasta: 2, Water: 2 } }, unknown: { 1: { Pasta: 1, Water: 2, Unknown: 1 } }, negative: { 1: { Pasta: -1, Water: 2 } }, hiddenDiner: { 3: { Pasta: 1, Water: 2 } } })) {
  check(label + ' allocations fail closed', () => { const h = harness({ perConvive: cart }); h.context.launchSplitFlow(); assert.equal(h.state.flow, null); });
}
check('Removing or changing a diner allocation requires reassignment', () => {
  const h = harness({ perConvive: { 1: { Pasta: 1, Water: 1 }, 2: { Water: 1 } } });
  h.context.unassignUnit('Pasta'); h.context.launchSplitFlow(); assert.equal(h.state.flow, null);
});
check('Discount and tips conserve centimes without dividing item quantities', () => {
  const h = harness({ total: 80.01, tipPct: 10, perConvive: { 1: { Pasta: 1, Water: 1 }, 2: { Water: 1 } } });
  h.context.launchSplitFlow();
  assert.equal(h.state.flow.parts.reduce((s,p) => s + Math.round(p.base*100), 0), 8001);
  assert.equal(h.state.flow.parts.reduce((s,p) => s + Math.round(p.tip*100), 0), 800);
  assert.ok(h.state.flow.parts.flatMap(p => p.lines).every(l => Number.isInteger(l.qty)));
});
check('Explicit equal splitting remains available', () => {
  const h = harness({ splitMode: 'egal', total: 90.01, numParts: 3 }); h.context.launchSplitFlow();
  assert.deepEqual(Array.from(h.state.flow.parts, p => p.amount), [30.01,30,30]);
});
check('Zero-value and sub-centime equal splits cannot enter payment flow', () => {
  for (const total of [0, 0.01]) {
    const h = harness({ splitMode: 'egal', total, numParts: 2 });
    h.context.launchSplitFlow();
    assert.equal(h.state.flow, null);
    assert.equal(h.calls.render, 0);
    assert.ok(h.calls.toast.length > 0);
  }
});
check('Employee split also blocks unassigned dishes and preserves whole-item payment', () => {
  const employee = fs.readFileSync(new URL('../kiwi-serveur.html', import.meta.url), 'utf8');
  const h = harness({ perConvive: { 1: { Water: 1 }, 2: { Water: 1 } } });
  for (const name of ['splitArticleAllocation', 'renderArticleMode', 'launchSplitFlow']) vm.runInContext(fn(name, employee), h.context);
  h.context.renderArticleMode(); assert.equal(h.elements.get('#split-launch').disabled, true);
  h.context.launchSplitFlow(); assert.equal(h.state.flow, null);
  h.context.assignUnit('Pasta'); h.context.renderArticleMode(); assert.equal(h.elements.get('#split-launch').disabled, false);
  h.context.launchSplitFlow(); assert.deepEqual(Array.from(h.state.flow.parts, p => p.amount), [75,15]);
  assert.ok(h.state.flow.parts.flatMap(p => p.lines).every(l => Number.isInteger(l.qty) && !l.name.includes('1/')));
});
console.log(`Whole-item split: ${checks} production-function checks passed.`);
