// Caisse restaurant · « Article libre » (Montant libre).
// Browse (25 Nov 2026): an item that is not on the menu must say what it is
// and reach the kitchen AND the bar. The till cannot know which station makes
// an unlisted item, so the line goes to every prep station, and the pad will
// not add it without a comment, which is what the cooks read on the ticket.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const kitchen = read('assets/caisse-kitchen.js');
const catalogue = read('assets/caisse/catalogue.js');
const app = read('assets/caisse-app.js');
const html = read('kiwi-caisse.html');
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; console.log(`  ✓ ${message}`); };

/* Station routing, on the real floor function (table orders). */
const fs0 = kitchen.indexOf('    function kitchenItemsFromLines(');
const fs1 = kitchen.indexOf('    function relayLinesFromCaisse(');
assert.ok(fs0 > 0 && fs1 > fs0, 'kitchenItemsFromLines found in assets/caisse-kitchen.js');
const ctx = vm.createContext({
  kdsStations: () => [{ id: 'cuisine' }, { id: 'bar' }],
  kdsStationFor: (m) => (m && m.station) || 'cuisine',
  menuLineFind: (pred) => [{ id: 'cafe', station: 'bar' }, { id: 'tajine' }].find(pred),
  optVisuals: () => [], kitchenNote: (l) => l.note || '',
});
vm.runInContext(`${kitchen.slice(fs0, fs1)}\nthis.f = kitchenItemsFromLines;`, ctx);
const st = (line) => JSON.stringify(ctx.f([line])[0].stations);
ok(st({ id: 'libre', name: 'Article libre', qty: 1, price: 40, note: 'Gâteau' }) === '["cuisine","bar"]', 'an « Article libre » line goes to every station (kitchen and bar)');
ok(st({ id: 'cafe', name: 'Café', qty: 1, price: 15 }) === '["bar"]' && st({ id: 'tajine', name: 'Tajine', qty: 1, price: 60 }) === '["cuisine"]', 'a menu item keeps its own single station');
ok(ctx.f([{ id: 'libre', name: 'Article libre', qty: 1, price: 40, note: 'Gâteau' }])[0].note === 'Gâteau', 'the comment travels on the kitchen line');
const vrap = kitchen.slice(kitchen.indexOf('function vrapCartItems('), kitchen.indexOf('function saveVrapBillItems('));
ok(/stations: orig \? orig\.stations : c\.id === 'libre' \? kdsStations\(\)\.map\(s => s\.id\) : \[kdsStationFor\(m\)\]/.test(vrap), 'takeaway orders send an « Article libre » to every station too');

/* The comment is required, on the real addOpenLine. */
const s = catalogue.indexOf('    function addOpenLine(');
const e = catalogue.indexOf('\n    }\n', s) + 7;
const added = [];
const c2 = vm.createContext({
  money: (n) => Math.round(+n * 100) / 100, nativeHapticLight() {}, mode: 'vrap', selectedId: null, cart: [],
  currentOrder: () => ({ append: (list, line) => added.push(line) }), newLineUid: () => 'u1',
  renderCart() {}, toast() {}, fmtMAD: (n) => `${n} MAD`,
});
vm.runInContext(`${catalogue.slice(s, e)}\nthis.add = addOpenLine;`, c2);
c2.add(40, '   ');
ok(added.length === 0, 'no line is added without a comment');
c2.add(40, ' Gâteau anniversaire ');
ok(added.length === 1 && added[0].note === 'Gâteau anniversaire' && added[0].id === 'libre', 'the comment becomes the line note the kitchen prints');

ok(/<input[^>]*id="mlibre-note"[^>]*required/.test(html), 'the Montant libre pad has a required comment field');
const pad = app.slice(app.indexOf("const mlAdd = $('#mlibre-add');"), app.indexOf('kiwiSkin2027:till · le menu'));
ok(/mlAdd\.disabled = !\(val\(\) > 0 && note\(\)\)/.test(pad), '« Ajouter » stays disabled until there is an amount and a comment');
ok(/addOpenLine\(val\(\), note\(\)\)/.test(pad), 'the pad passes the comment to the line');

console.log(`\n✓ ${checks} till free line controls passed`);
