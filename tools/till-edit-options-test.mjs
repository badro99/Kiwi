// Caisse 2027 · « Modifier les options » sur une ligne pas encore envoyée.
// Jon's Burgers (25 Nov 2026): the button sat on every unsent line of the bill
// and did nothing, because the till never handled its gesture. It now opens the
// options sheet with the line's current choices, and confirming rewrites that
// line in place. The button only shows where there is something to edit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const kit = read('assets/kit/till.js');
const frame = read('assets/caisse/till-frame.js');
const catalogue = read('assets/caisse/catalogue.js');
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; console.log(`  ✓ ${message}`); };

ok(/\(b\.plain \|\| !l\.editOptions \? '' : C\.button\.render\(\{ label: t\('bill\.edit_options'\)/.test(kit),
  'the bill shows « Modifier les options » only on a line the till marks editable');
// Behaviour: the real tillKitLine / tillKitCanEditOptions, on a menu where only the tacos has options.
const lineSrc = frame.slice(frame.indexOf('    function tillKitLine('), frame.indexOf('    const tillKitDiscount'));
const menu = [{ id: 'tacos', name: 'Tacos Double', price: 55, groups: ['sauce'] }, { id: 'coca', name: 'Coca', price: 12 }];
const fctx = vm.createContext({ menuItems: menu, itemOptGroups: (it) => it.groups || [], optText: (o) => o.map((x) => x.c).join(', '), lineName: (l) => l.name });
vm.runInContext(`${lineSrc}\nthis.line = tillKitLine; this.can = tillKitCanEditOptions;`, fctx);
ok(fctx.line({ id: 'tacos', name: 'Tacos Double', qty: 1, price: 55 }, 0).editOptions === true
  && fctx.line({ id: 'tacos', name: 'Tacos Double', qty: 1, price: 55, sent: true }, 0).editOptions === false
  && fctx.line({ id: 'coca', name: 'Coca', qty: 1, price: 12 }, 1).editOptions === false
  && fctx.line({ id: 'tacos', kind: 'formula', name: 'Menu', qty: 1, price: 70 }, 2).editOptions === false,
'an unsent line with option groups is marked editable; a sent line, a plain dish or a formula never');
// Behaviour: the real « edit-options » case of tillKitAct, with the sheet and the order stubbed.
const caseStart = frame.indexOf("        case 'edit-options': {");
const caseEnd = frame.indexOf('}, line.opts);', caseStart);
assert.ok(caseStart > 0 && caseEnd > caseStart, 'edit-options case found');
const caseSrc = frame.slice(caseStart, frame.indexOf('}', frame.indexOf('return;', caseEnd)) + 1);
const sheet = [], patched = [];
const actx = vm.createContext({ menuItems: menu, itemOptGroups: (it) => it.groups || [], mode: 'vrap', selectedId: null,
  openOptSheet: (item, groups, done, preset) => sheet.push({ item, groups, done, preset }),
  promoPrice: (_item, price) => ({ price }), optSig: (c) => c.map((x) => x.c).join('|'),
  currentOrder: () => ({ patchLine: (line, patch, drop) => patched.push({ line, patch, drop }) }), renderCart() {}, renderMenu() {}, renderOrderPanel() {} });
vm.runInContext(`${lineSrc}\nthis.act = function (line) { switch ('edit-options') {\n${caseSrc}\n} };`, actx);
actx.act({ id: 'tacos', qty: 1, price: 55, sent: true, opts: [] });
actx.act({ id: 'coca', qty: 1, price: 12 });
ok(sheet.length === 0, 'the till ignores the gesture on a sent line or a dish without options');
const tacos = { uid: 'u1', id: 'tacos', qty: 1, price: 55, opts: [{ g: 'sauce', c: 'biggy', p: 0 }] };
actx.act(tacos);
ok(sheet.length === 1 && sheet[0].item.id === 'tacos' && sheet[0].preset === tacos.opts, 'editing reopens the sheet on the line\'s own choices');
sheet[0].done(sheet[0].item, [{ g: 'sauce', c: 'andalouse', p: 5 }]);
ok(patched.length === 1 && patched[0].line === tacos && patched[0].patch.price === 60 && patched[0].patch.optSig === 'andalouse',
  'confirming patches that same line with the new choices and price, never a new line');

// Behaviour: the real openOptSheet, preset with the line's choices.
const start = catalogue.indexOf('    function closeOptSheet()');
const end = catalogue.indexOf('    function standaloneMenuItem(');
assert.ok(start > 0 && end > start, 'options sheet source found');
const el = () => ({ className: '', classList: { add() {}, remove() {} }, setAttribute() {}, querySelector: () => null, innerHTML: '', onclick: null });
const ctx = vm.createContext({
  document: { createElement: el, body: { appendChild() {} } },
  kdsEsc: (s) => String(s), fmtMAD: (n) => `${n} MAD`, pushCartLine: () => {}, globalThis: {},
});
vm.runInContext(`let optVeil = null;\n${catalogue.slice(start, end)}\nthis.open = openOptSheet; this.veil = () => optVeil;`, ctx);
const groups = [
  { id: 'sauce', name: 'Sauce', required: true, choices: [{ id: 'andalouse', name: 'Andalouse' }, { id: 'biggy', name: 'Biggy' }] },
  { id: 'viande', name: 'Choix de viande', required: true, choices: [{ id: 'poulet', name: 'Poulet' }, { id: 'tenders', name: 'Chicken Tenders' }] },
];
let got = null;
ctx.open({ name: 'Tacos Double', price: 55 }, groups, (_i, chosen) => { got = chosen; }, [{ g: 'sauce', c: 'biggy' }, { g: 'viande', c: 'poulet' }]);
const html = ctx.veil().innerHTML;
ok(/class="opt-c on"\s*data-og="sauce" data-oc="biggy"/.test(html) && /class="opt-c on"\s*data-og="viande" data-oc="poulet"/.test(html),
  'the sheet opens with the line\'s current choices selected');
ok(/Valider · 55 MAD/.test(html) && !/data-opt-ok disabled/.test(html), 'editing confirms with « Valider », not « Ajouter », and is not blocked');
ctx.veil().onclick({ target: { closest: (sel) => (sel === '[data-opt-ok]' ? {} : null) } });
ok(Array.isArray(got) && got.map((o) => o.c).join('|') === 'biggy|poulet', 'confirming without a change returns the same choices');

console.log(`\n✓ ${checks} till edit-options controls passed`);
