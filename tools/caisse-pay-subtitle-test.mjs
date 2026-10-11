#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * LE SOUS-TITRE DES FENÊTRES DE PAIEMENT
 *
 * Écrit en dur « Table … · N couverts », dont seul le chiffre changeait :
 * une vente à emporter s'affichait « Table À emporter · 1 art. couverts »,
 * une part de note « Table Part 2 · T7 couverts ». Mesuré le 2026-10-11 sur
 * le stack local. Ce fichier exécute les vrais payMeta / readPayMeta de
 * kiwi-caisse.html sur un faux DOM et tient les trois appels.
 *
 *   node tools/caisse-pay-subtitle-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

function grab(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' found');
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* Deux fenêtres (carte, espèces), chacune avec ses quatre emplacements. */
function dom() {
  const make = () => ({
    '.pay-table-prefix': { textContent: 'Table ', hidden: false },
    '[data-bind="table"]': { textContent: 'T2', hidden: false },
    '[data-bind="covers"]': { textContent: '2', hidden: false },
    '[data-bind="covers-unit"]': { textContent: 'couverts', hidden: false },
  });
  const modals = [make(), make()];
  const text = (m) => [
    m['.pay-table-prefix'].hidden ? '' : m['.pay-table-prefix'].textContent,
    m['[data-bind="table"]'].textContent, ' · ', m['[data-bind="covers"]'].textContent,
    m['[data-bind="covers-unit"]'].hidden ? '' : ' ' + m['[data-bind="covers-unit"]'].textContent,
  ].join('').replace(/ · $/, '');
  const ctx = vm.createContext({
    $$: (sel) => modals.map((m) => m[sel]),
    document: { querySelector: (sel) => modals[0][sel] },
  });
  vm.runInContext(grab('payMeta') + '\n' + grab('readPayMeta') + '\nthis.payMeta = payMeta; this.readPayMeta = readPayMeta;', ctx);
  return { ctx, read: () => modals.map(text) };
}

ok('à emporter : « À emporter · 1 article », sans « Table », sans « couverts »', () => {
  const d = dom();
  d.ctx.payMeta({ prefix: false, table: 'À emporter', covers: 1, unit: 'article' });
  assert.deepEqual(d.read(), ['À emporter · 1 article', 'À emporter · 1 article']);
});
ok('une table : « Table T4 · 3 couverts »', () => {
  const d = dom();
  d.ctx.payMeta({ prefix: true, table: 'T4', covers: 3, unit: 'couverts' });
  assert.equal(d.read()[0], 'Table T4 · 3 couverts');
});
ok('une part de note puis retour : l’étiquette d’origine revient entière', () => {
  const d = dom();
  d.ctx.payMeta({ prefix: true, table: 'T7', covers: 2, unit: 'couverts' });
  const saved = d.ctx.readPayMeta();
  d.ctx.payMeta({ prefix: false, table: 'Part 2', covers: 'T7', unit: '' });
  assert.equal(d.read()[0], 'Part 2 · T7');
  d.ctx.payMeta(saved);
  assert.equal(d.read()[0], 'Table T7 · 2 couverts');
});
ok('les trois appels passent par payMeta, et le libellé « art. » a disparu', () => {
  assert.equal((SRC.match(/<span data-bind="covers">2<\/span> <span data-bind="covers-unit">couverts<\/span>/g) || []).length, 2);
  assert.ok(/payMeta\(\{ prefix: true, table: id, covers: t\.covers, unit:/.test(SRC), 'table path');
  assert.ok(/payMeta\(\{ prefix: false, table: 'À emporter'/.test(SRC), 'takeaway path');
  assert.ok(/payMeta\(\{ prefix: false, table, covers, unit: '' \}\)/.test(SRC), 'split path');
  assert.ok(!/\$\{itemCount\} art\.`/.test(SRC), '"N art." gone');
});

console.log(`\ncaisse-pay-subtitle: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
