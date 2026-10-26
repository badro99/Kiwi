// Preuve figée et frontières de propriété des modules privés du relais.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import source from './order-queue-test-source.cjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const maps = JSON.parse(fs.readFileSync('tools/fixtures/order-queue/split.json', 'utf8'));
for (const map of maps) {
  const original = gunzipSync(fs.readFileSync('tools/fixtures/order-queue/' + map.fixture)).toString('utf8');
  assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
  assert.equal(source(map.file), original, map.file + ' : reconstruction exacte');
  const expected = [...original.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map(m => m[1]).sort();
  assert.deepEqual(Object.keys(await import('../' + map.file)).sort(), expected, 'exports conservés');
  for (const part of map.segments) {
    assert.match(part.file.split('/').at(-1), /^_/);
    const text = fs.readFileSync(part.file, 'utf8');
    assert.equal(text.slice(part.header.length, part.footer ? -part.footer.length : undefined), original.slice(part.start, part.end), part.file + ' : corps inchangé');
    assert.deepEqual(text.match(/^import .*?;$/gm) || [], part.imports, 'dépendances nommées du contrat');
    const ast = ts.createSourceFile(part.file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(n) {
      // Aucun import dynamique, require, accès au système de fichiers ou échappatoire globale.
      if (ts.isCallExpression(n)) assert.ok(!['import', 'require', 'eval', 'Function'].includes(n.expression.getText(ast)), 'accès hors contrat');
      if (ts.isImportDeclaration(n)) assert.ok(!n.importClause || !n.importClause.namedBindings || ts.isNamedImports(n.importClause.namedBindings), 'imports nommés uniquement');
      if (ts.isPropertyAccessExpression(n) && n.expression.getText(ast) === 'globalThis') assert.equal(n.name.text, 'KiwiMenuPromos', 'aucun état global cuisine');
      ts.forEachChild(n, visit);
    }
    visit(ast);
    assert.deepEqual([...new Set([...text.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+([a-z_][a-z_0-9]*)/gi)].map(m => m[1].toLowerCase()))].sort(), part.tables, 'tables possédées ou lues explicitement');
    const exported = Object.keys(await import('../' + part.file)).sort();
    assert.deepEqual(exported, part.exports.flatMap(names => names.split(', ')).sort(), 'exports privés limités au contrat');
    assert.ok(!exported.some(key => key.startsWith('onRequest')), 'aucune route privée');
  }
}
// Une référence libre oubliée dans un catch silencieux ferait disparaître des lignes.
const files = maps.flatMap(map => map.segments.map(part => part.file));
const program = ts.createProgram(files, { allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, types: [] });
const missing = program.getSemanticDiagnostics().filter(d => d.code === 2304 && files.includes(d.file?.fileName));
assert.deepEqual(missing.map(d => d.file.fileName + ': ' + ts.flattenDiagnosticMessageText(d.messageText, ' ')), [], 'toutes les dépendances sont explicites');
console.log('✓ queue : reconstruction octet par octet, corps, exports et propriété des états conservés');
