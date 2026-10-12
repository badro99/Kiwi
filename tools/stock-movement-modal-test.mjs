#!/usr/bin/env node
/* Stock · « Nouveau mouvement de stock » asks what the gesture needs, shows
 * what it will leave, and refuses in words.
 *
 * 2026-10-12. The dashboard modal stacked seven bare fields, glued a text arrow
 * to each motive, asked for a supplier on a breakage, never showed the stock
 * the movement would leave, and answered a refusal with the server's code
 * (« Mouvement impossible : non-autorise »). French under every language.
 *   node tools/stock-movement-modal-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');
const mov = readFileSync(path.join(ROOT, 'assets/maison-stock-movements.js'), 'utf8');
const lens = readFileSync(path.join(ROOT, 'assets/liquid-lens.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
const between = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? '' : s.slice(i, s.indexOf(b, i + a.length)); };
const modal = between(src, 'function _mzManualModal(preset) {', "handlers['mz-new'] = ");
let dict = null;
try { dict = new Function(`${between(src, 'const _MZ_MV = {', '\nfunction _mzMvT()')}; return _MZ_MV;`)(); } catch (_) { /* reported below */ }
const manualIds = [...mov.matchAll(/\{ id: '([^']+)',[^}]*manual: true/g)].map((m) => m[1]);

console.log('the gesture');
ok('the direction comes first, and only its motives are offered', () => {
  assert.match(modal, /const list = manual\.filter\(\(x\) => \(x\.dir > 0\) === \(d > 0\)\);/);
  assert.ok(!/↑ Entrée|↓ Sortie/.test(modal), 'no text arrow glued to a motive');
});
ok('the supplier is asked only for a motive that has one, and only then sent', () => {
  assert.match(modal, /if \(w\) w\.hidden = !\(x && x\.supplier\);/);
  assert.match(modal, /supplier: x\.supplier \? q\('supplier'\)\.value\.trim\(\) : '',/);
});
ok('the stock the movement will leave is shown, and a shortage is said before saving', () => {
  assert.match(modal, /out\.textContent = fill\(t\.after, \{ before, after: before \+ dir\(\) \* n \}\);/);
  const save = modal.slice(modal.indexOf("q('save').addEventListener"));
  assert.ok(save.indexOf('x.dir < 0 && n > Math.max(0, +v.stock || 0)') < save.indexOf('M.record('), 'shortage checked first');
});
ok('a refusal is written in words, under the field it concerns, never as a code', () => {
  assert.ok(!modal.includes("'Mouvement impossible : ' + res.reason"));
  for (const r of ['stock-insuffisant', 'quantite', 'type', 'variante-introuvable', 'non-autorise']) {
    assert.ok(modal.includes(`'${r}'`), `handles ${r}`);
  }
  assert.match(modal, /msg\.textContent = res\.reason === 'non-autorise' \? t\.denied : t\.failed;/);
});
ok('a product without variant says so instead of offering an empty list', () => {
  assert.match(modal, /root\.querySelector\('\[data-mzm-novar\]'\)\.hidden = !!vs\.length;/);
  assert.match(modal, /q\('save'\)\.disabled = !vs\.length;/);
});
ok('the gesture itself is unchanged: KiwiMaisonStock.record, from the dashboard', () => {
  assert.match(modal, /const res = M\.record\(\{/);
  assert.match(modal, /source: 'dashboard',/);
});
ok('the in/out switch rides the liquid lens', () => {
  assert.match(lens, /\{ sel: '\.mz-mv-seg', item: '\.mz-mv-segi', skin: 'surface',/);
  assert.match(lens, /\.mz-mv-seg\[data-kw-lens\] \.mz-mv-segi\.on span\{background:transparent;box-shadow:none;\}/);
});

console.log('three languages');
ok('FR, EN and AR carry the same keys and name every manual motive', () => {
  assert.ok(dict && dict.fr, 'the modal has its FR/EN/AR strings');
  const keys = (o) => Object.keys(o).sort().join(',');
  assert.equal(keys(dict.en), keys(dict.fr));
  assert.equal(keys(dict.ar), keys(dict.fr));
  assert.ok(manualIds.length >= 8, `manual motives found: ${manualIds.length}`);
  for (const l of ['fr', 'en', 'ar']) for (const id of manualIds) assert.ok(dict[l].types[id], `${l} names ${id}`);
  assert.ok(!JSON.stringify(dict).includes('\u2014'), 'no U+2014');
});

console.log(`\nstock-movement-modal: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
