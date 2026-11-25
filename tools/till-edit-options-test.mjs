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
const line = frame.slice(frame.indexOf('function tillKitLine('), frame.indexOf('const tillKitDiscount'));
ok(/editOptions: !sent && tillKitCanEditOptions\(l\)/.test(line), 'an unsent line with option groups is marked editable, a sent one never');
const act = frame.slice(frame.indexOf('function tillKitAct('), frame.indexOf('function tillKitPaint('));
ok(/case 'edit-options':/.test(act), 'the till handles the edit-options gesture');
ok(/openOptSheet\(item, groups, [\s\S]{0,700}patchLine\(line,[\s\S]{0,300}, line\.opts\)/.test(act),
  'editing reopens the sheet on the line\'s choices and patches that same line');

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
