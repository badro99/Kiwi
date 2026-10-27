#!/usr/bin/env node
/* Concatenation split of the till kitchen (assets/caisse-kitchen.js) by concern.
 * The page still loads assets/caisse-kitchen.js, the exact concatenation of its parts, so
 * no page and no stamp moves; a change is made in the part that owns the
 * concern, then the file is rebuilt (cat, recorded in the fixture).
 * The file is a classic script of top-level function declarations only, so
 * each part must be one too. The proof: byte equality, every part parses on
 * its own, each part declares exactly the functions recorded for it (moving a
 * function between concerns is a reviewed change of
 * tools/fixtures/caisse-kitchen/split.json), and no name is declared twice. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = (f) => fs.readFileSync(f, 'utf8');
const map = JSON.parse(read('tools/fixtures/caisse-kitchen/split.json'));

function declared(text, file) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  return ast.statements.map((s) => {
    assert.ok(ts.isFunctionDeclaration(s) && s.name, file + ' : seulement des déclarations de fonction au premier niveau');
    return s.name.text;
  });
}

const [bundle] = map.bundles;
assert.equal(map.bundles.length, 1);
const parts = bundle.parts.map((p) => read(p.file));
assert.equal(read(bundle.file), parts.join(''), bundle.file + ' = concaténation exacte de ses parties ; la refaire : cat '
  + bundle.parts.map((p) => p.file).join(' ') + ' > ' + bundle.file);
new vm.Script(read(bundle.file), { filename: bundle.file });
const all = new Set();
bundle.parts.forEach((p, k) => {
  new vm.Script(parts[k], { filename: p.file });
  const names = declared(parts[k], p.file);
  assert.deepEqual(names, p.declares, p.file + ' : déclarations du domaine « ' + p.concern + ' »');
  for (const n of names) { assert.ok(!all.has(n), n + ' déclaré dans deux parties'); all.add(n); }
});
assert.deepEqual([...all].sort(), declared(read(bundle.file), bundle.file).sort(), 'chaque fonction du fichier livré appartient à une partie');
const at = bundle.sha256AtSplit === createHash('sha256').update(read(bundle.file)).digest('hex');
console.log('✓ caisse-kitchen-split-test : cuisine de la caisse découpée en neuf domaines, fichier livré identique à ses parties' + (at ? ', octets du découpage' : ''));
