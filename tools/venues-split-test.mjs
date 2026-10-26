/* Découpage venues : reconstruction exacte, fabriques inertes, dépendances et chargement. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import coreTestSource from './core-test-source.cjs';
const map = JSON.parse(fs.readFileSync('tools/fixtures/venues-split/split.json', 'utf8'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/venues-split/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
const core = fs.readFileSync(map.file, 'utf8');
assert.ok(core.split('\n').length < 2500, 'venues.js sous 2 500 lignes');
for (const file of map.parts) {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.split('\n').length < 3000, file + ' sous 3 000 lignes');
  const touched = [];
  const forbid = key => { touched.push(key); throw new Error('Enregistrement actif'); };
  const forbidden = new Proxy(function () {}, { get: (_, key) => forbid(key), set: (_, key) => forbid(key), apply: () => forbid('appel'), construct: () => forbid('construction') });
  const window = {};
  vm.runInNewContext(text, { window, document: forbidden, localStorage: forbidden, fetch: forbidden, navigator: forbidden, setTimeout: forbidden, setInterval: forbidden, XMLHttpRequest: forbidden, sessionStorage: forbidden, indexedDB: forbidden });
  assert.deepEqual(touched, [], file + ' : aucun accès DOM, stockage, réseau ou minuterie');
  for (const e of map.entries.filter(e => file.endsWith('/' + e.part + '.js'))) {
    assert.equal(typeof window.__kiwiVenueParts[e.tag], 'function');
    const declared = text.match(new RegExp('\\.' + e.tag + ' = function \\(__deps\\) \\{\\n    const \\{ ([^}]*?) \\} = __deps;'))[1];
    assert.equal(declared, e.deps.join(', '));
    assert.ok(core.includes('__kiwiVenueParts.' + e.tag + '.call(this, { ' + declared + ' })'));
    for (const dep of e.deps) assert.ok(!new RegExp('^  let ' + dep + '\\b', 'm').test(core), dep + ' ne copie pas une liaison mutable');
  }
}
assert.equal(coreTestSource.source(map.file), original, 'reconstruction octet pour octet');
// Le résolveur lexical vérifie les emprunts réels, pas seulement deux listes identiques.
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const host = ts.createCompilerHost({ allowJs: true, noLib: true });
const nativeSource = host.getSourceFile.bind(host);
host.getSourceFile = (file, ...args) => file === map.file
  ? ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS) : nativeSource(file, ...args);
const program = ts.createProgram([map.file], { allowJs: true, noLib: true }, host);
const ast = program.getSourceFile(map.file), checker = program.getTypeChecker();
let body;
function findBody(node) {
  if (ts.isArrowFunction(node) && !body) body = node.body;
  ts.forEachChild(node, findBody);
}
findBody(ast);
const bindings = new Map();
for (const stmt of body.statements) {
  const declarations = ts.isFunctionDeclaration(stmt) ? [stmt] : ts.isVariableStatement(stmt) ? stmt.declarationList.declarations : [];
  for (const decl of declarations) if (ts.isIdentifier(decl.name)) bindings.set(checker.getSymbolAtLocation(decl.name), { name: decl.name.text, stmt });
}
for (const e of map.entries) {
  const borrowed = new Set();
  function visit(node) {
    if (ts.isIdentifier(node)) {
      const binding = bindings.get(checker.getSymbolAtLocation(node));
      if (binding && !e.names.includes(binding.name)) borrowed.add(binding.name);
    }
    ts.forEachChild(node, visit);
  }
  for (const stmt of body.statements) if (stmt.getFullStart() >= e.start && stmt.end <= e.end) visit(stmt);
  assert.deepEqual([...borrowed].sort(), e.deps, e.tag + ' : emprunts lexicaux exacts');
}

// Exécution du vrai pont : identité, changements de portée, ventes et recettes.
function exercise(source) {
  const noop = () => {};
  const element = () => ({ classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: {}, dataset: {}, setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    querySelector: () => null, querySelectorAll: () => [], addEventListener: noop });
  const document = { readyState: 'loading', documentElement: element(), body: element(), head: element(),
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: element, addEventListener: noop };
  const memory = new Map();
  const localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
  const window = { document, localStorage, addEventListener: noop, dispatchEvent: noop,
    location: { search: '', hostname: 'localhost' }, matchMedia: () => ({ matches: false }) };
  vm.runInNewContext(source, { window, document, localStorage, setTimeout: noop, clearTimeout: noop,
    requestAnimationFrame: noop, CustomEvent: function () {}, location: window.location });
  const v = window.KiwiVenue;
  const snapshot = () => ({ id: v.getVenue(), type: v.getVenueType(), slug: v.slugOf(), menu: v.getMenuItems(), kpis: v.getKpiSpec(v.getVenueType()) });
  const states = [snapshot()];
  v.setVenue('maisonMansour'); states.push(snapshot());
  v.applyScopedVenue({ slug: 'commerce-synthetique', name: 'Commerce synthétique', type: 'restaurant' });
  window.KiwiSales.add('scoped', { ts: 1800000000000, amount: 12, method: 'cash', cursor: 1 });
  states.push(snapshot(), window.KiwiSales.list('scoped'), window.KiwiSales.totals('scoped'));
  v.applyScopedVenue({ slug: 'autre-commerce-synthetique', name: 'Autre commerce', type: 'boutique' });
  states.push(snapshot(), window.KiwiSales.list('scoped'));
  states.push(window.KiwiRecipes.listRecipes('cafeAtlas'), window.KiwiRecipes.recipeStats('cafeAtlas'));
  return JSON.parse(JSON.stringify({ states, memory: [...memory], api: Object.keys(v) }));
}
assert.deepEqual(exercise(coreTestSource.live(map.file)), exercise(original), 'pont réel équivalent avant/après, sans capture périmée');

function pages(dir = '.') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name.startsWith('.') || ['node_modules', 'graphify-out'].includes(e.name)) return [];
    const file = dir + '/' + e.name;
    return e.isDirectory() ? pages(file) : e.name.endsWith('.html') ? [file] : [];
  });
}
let count = 0;
for (const file of pages()) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m => m[1].split('?')[0]);
  const at = scripts.findIndex(s => /(?:^|\/)assets\/venues\.js$/.test(s));
  if (at < 0) continue;
  count++;
  for (const part of map.parts) assert.ok(scripts.some((s, i) => i < at && s.endsWith(part)), file + ' : ' + part + ' avant le noyau');
}
const sw = fs.readFileSync('kiwi-sw.js', 'utf8');
for (const part of map.parts) assert.ok(sw.includes("'/" + part + '?v='), part + ' précaché');
console.log(`PASS venues split : reconstruction exacte, fabriques inertes, dépendances, ${count} pages, précache et tailles`);
