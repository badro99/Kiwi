/* Preuve de déplacement strict : corps, noms globaux et ordre de chargement. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import source from './serveur-source.cjs';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = file => fs.readFileSync(file, 'utf8');
const map = JSON.parse(read('tools/fixtures/serveur/split.json'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/serveur/original.js.gz')).toString();
const hash = text => createHash('sha256').update(text).digest('hex');
assert.equal(hash(original), map.sha256);
assert.equal(source(), original, 'reconstruction exacte depuis les sources livrées');
let expectedCore = original;
for (const m of [...map.moved].reverse()) expectedCore = expectedCore.slice(0, m.start) + expectedCore.slice(m.end);
const core = read('assets/serveur-app.js');
assert.equal(core, expectedCore, 'seules les déclarations déplacées quittent le noyau');
assert.ok(core.split('\n').length < 4000);
for (const file of map.parts) {
  let expected = '';
  for (const m of map.moved.filter(m => m.file === file)) {
    const body = original.slice(m.start, m.end);
    assert.equal(hash(body), m.sha256, m.name);
    assert.ok(!core.includes(body), m.name + ' absent du noyau');
    expected += body + '\n\n';
  }
  assert.equal(read(file), expected, file + ' : octets inchangés');
  new vm.Script(read(file), { filename: file });
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  assert.ok(ast.statements.every(n => ts.isFunctionDeclaration(n)), 'aucun état ni effet de bord déplacé');
}
function names(text) {
  const ast = ts.createSourceFile('source.js', text, ts.ScriptTarget.Latest, true);
  const result = [];
  function binding(n) { if (ts.isIdentifier(n)) result.push(n.text); else for (const e of n.elements) if (e.name) binding(e.name); }
  for (const n of ast.statements) {
    if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) binding(n.name);
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) binding(d.name);
  }
  return result.sort();
}
const runtime = [...map.parts.map(read), core].join('\n');
new vm.Script(runtime); // Parse together: lexical redeclarations are errors.
assert.deepEqual(names(runtime), names(original), 'mêmes déclarations globales, doublons compris');
// Duplicate function declarations must preserve their last-definition-wins order.
function functionBodies(text) {
  const ast = ts.createSourceFile('source.js', text, ts.ScriptTarget.Latest, true);
  const result = new Map();
  for (const n of ast.statements.filter(ts.isFunctionDeclaration)) {
    const bodies = result.get(n.name.text) || [];
    bodies.push(text.slice(n.getStart(ast), n.end));
    result.set(n.name.text, bodies);
  }
  return result;
}
const beforeBodies = functionBodies(original), afterBodies = functionBodies(runtime);
for (const [name, bodies] of beforeBodies) {
  if (bodies.length > 1) assert.deepEqual(afterBodies.get(name), bodies, name + ' : priorité des doublons conservée');
}
const html = read('kiwi-serveur.html');
const tags = html.match(/<script\b[^>]*\bsrc=[^>]*><\/script>/g);
const at = tags.findIndex(tag => tag.includes('assets/serveur-app.js?'));
assert.deepEqual(tags.slice(at - map.parts.length, at).map(tag => tag.match(/src="([^"]+)"/)[1]), map.parts.map(file => file + '?v=' + JSON.parse(read('tools/asset-stamps.json'))[file].v));
for (const tag of tags.slice(at - map.parts.length, at + 1)) assert.ok(!/\b(?:async|defer|type)\s*(?:=|>)/.test(tag), 'scripts classiques synchrones');
assert.equal(tags.length, 27, 'une balise ajoutée');
console.log(`✓ serveur-split-test : ${map.moved.length} fonctions identiques, reconstruction, noms et ordre classiques conservés`);
