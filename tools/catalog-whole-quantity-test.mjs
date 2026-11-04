// Boutique catalogue: a fractional quantity is refused out loud, even before
// any language layer has loaded (gap r14 #65: it used to refuse silently).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('assets/boutique-catalog-parts.js', 'utf8');
const start = src.indexOf('window.__kiwiBoutiqueCatalogParts.wholeQuantity = function');
const end = src.indexOf('\n};\n', start) + 4;
assert.ok(start > 0 && end > start, 'wholeQuantity found');
const load = (extra) => {
  const said = [];
  const window = { __kiwiBoutiqueCatalogParts: {}, Kiwi: { toast: (m, o) => said.push([m, o && o.type]) }, ...extra };
  vm.runInNewContext(src.slice(start, end), { window });
  return { whole: window.__kiwiBoutiqueCatalogParts.wholeQuantity, said };
};
let n = 0;
{ const { whole, said } = load({}); assert.equal(whole(3), true); assert.equal(whole('2'), true); assert.equal(said.length, 0); n += 3; }
{ const { whole, said } = load({}); assert.equal(whole(1.5), false); assert.equal(said.length, 1, 'no language layer: still says why'); assert.match(said[0][0], /unités entières/); assert.equal(said[0][1], 'error'); n += 4; }
{ const T = { fr: { 'catalog.wholeUnits': 'FR' }, en: { 'catalog.wholeUnits': 'Whole units only' } };
  const { whole, said } = load({ KiwiI18n: { T, getLang: () => 'en' } }); assert.equal(whole(0.25), false); assert.equal(said[0][0], 'Whole units only'); n += 2; }
{ const { whole, said } = load({ KiwiCaisseLang: { tr: (s) => 'AR:' + s.length } }); assert.equal(whole(2.2), false); assert.match(said[0][0], /^AR:/); n += 2; }
console.log(`✓ catalog whole quantity · ${n} checks`);
