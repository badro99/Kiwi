import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = f => fs.readFileSync(f, 'utf8');
const moves = [], warnings = [], modals = [];
let doc;
const window = {
  KiwiStore: { define: (_name, options) => { doc = options.blank(); return { get: () => doc, update: fn => { doc = fn(doc); } }; } },
  KiwiInventory: { add: m => moves.push(m), sync: async () => {}, snapshot: () => ({}), locationId: () => 'central' },
  Kiwi: { handlers: {}, appPage() {}, modal: options => { modals.push(options); return { close() {} }; }, toast: (text, options) => { if (options.type === 'warning') warnings.push(text); } },
};
const fields = { 'eco-item': 'donated', 'eco-qty': '2', 'eco-cost': '0' };
const document = { addEventListener() {}, querySelector: () => null, getElementById: id => ({ value: fields[id] || '', focus() {} }) };
const realm = { window, document, setTimeout() {} };
vm.runInNewContext(read('assets/procurement.js'), realm);
vm.runInNewContext(read('assets/hotel-economat.js'), realm);
window.Kiwi.handlers['eco-receive']();
assert.match(modals[0].body, /id="eco-cost"[^>]*min="0"/);
await window.Kiwi.handlers['eco-receive-save']();
assert.equal(moves.length, 1);
assert.equal(moves[0].unitCost, 0, 'free stock has a known zero cost');
assert.equal(moves[0].qty, 2);
assert.equal(doc.receipts[0].lines[0].unitCost, 0);
for (const bad of ['', ' ', '-0.01', 'NaN', 'Infinity']) {
  fields['eco-cost'] = bad;
  await window.Kiwi.handlers['eco-receive-save']();
  assert.equal(moves.length, 1, 'invalid cost rejected: ' + bad);
}
assert.equal(warnings.length, 5);
fields['eco-cost'] = '12.34';
await window.Kiwi.handlers['eco-receive-save']();
assert.equal(moves[1].unitCost * 100, 1234, 'paid receipts keep exact centimes');
console.log('PASS zero receipt: real UI and procurement preserve explicit zero; blank, negative and nonfinite costs rejected; paid centimes preserved');
