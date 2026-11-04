// Addition divisée (r19) : toute la note d'origine est gardée, au-delà de 40
// lignes aussi, sinon un reçu de part rouvert après rechargement est tronqué.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
const src = fs.readFileSync('assets/caisse/held-sales.js', 'utf8');
const lines = Array.from({ length: 63 }, (_, i) => ({ name: 'Plat ' + i, qty: 1, total: 10 }));
const tableSplits = new Map(), vrapSplits = new Map();
const ctx = {
  tableSplits, vrapSplits, mode: 'table', tables: {}, cart: [], vrapEditingNum: null,
  splitState: { flow: { parts: [{ amount: 10, lines: [] }], id: 'f1', session: 's' }, splitMode: 'egal', total: 630, sourceLines: lines, tableId: 'T1', isVrap: false, sourceLabel: 'Table 1' },
  splitPaidCount: () => 0, persistShift() {}, vrapSplitKey: (n) => 'n' + n, currentVrapSplit: () => null,
  liveTableSplit: (id) => tableSplits.get(id) || null, generateOrder: () => lines.slice(0, 5), lineLabel: (c) => c.name,
  Array, Object, String, Number,
};
const fns = ['saveSplitFlow', 'loadSplitFlow'].map((n) => split.declaration(src, n)).join('\n');
vm.runInNewContext(fns + ';this.save=saveSplitFlow;this.load=loadSplitFlow;', ctx);
ctx.save();
assert.equal(tableSplits.get('T1').sourceLines.length, 63, 'the saved copy keeps every bill line');
ctx.splitState.sourceLines = [];
assert.equal(ctx.load('T1'), true);
assert.equal(ctx.splitState.sourceLines.length, 63, 'after a reload the split restores the whole bill, not the first 40 lines');
console.log('✓ held split keeps the whole source bill');
