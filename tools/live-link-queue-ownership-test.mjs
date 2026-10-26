/* Garde du propriétaire de kiwiSaleQueue et du canal sale de l'outbox. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const ts = require('typescript');
const ROOT = path.resolve(import.meta.dirname, '..');
const OWNER = 'assets/live-link/queue-store.js', ENGINE = 'assets/offline-db.js';
function violations(file, text) {
  if (file === OWNER) return [];
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const bindings = new Map(), errors = [];
  function walk(node, visit) { visit(node); ts.forEachChild(node, child => walk(child, visit)); }
  walk(tree, node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) bindings.set(node.name.text, node.initializer);
  });
  function value(node, seen = new Set()) {
    if (!node) return '';
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node) && !seen.has(node.text)) return value(bindings.get(node.text), new Set([...seen, node.text]));
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return value(node.left, seen) + value(node.right, seen);
    return '';
  }
  const methods = new Set(['enqueue', 'claim', 'list', 'stats', 'reactivate', 'quarantineState', 'migrateLegacy']);
  walk(tree, node => {
    const prop = ts.isPropertyAccessExpression(node) ? node.name.text : ts.isElementAccessExpression(node) ? value(node.argumentExpression) : '';
    // Le moteur générique possède le store physique, jamais le choix du canal sale.
    if (prop === 'kiwiSaleQueue') errors.push(`${file}: propriété legacy hors propriétaire`);
    if (prop === 'outbox' && file !== ENGINE) errors.push(`${file}: accès direct au store outbox`);
    if (!ts.isCallExpression(node)) return;
    const expression = node.expression;
    const method = ts.isPropertyAccessExpression(expression) ? expression.name.text : ts.isElementAccessExpression(expression) ? value(expression.argumentExpression) : '';
    if (['getItem', 'setItem', 'removeItem'].includes(method) && value(node.arguments[0]) === 'kiwiSaleQueue') errors.push(`${file}: stockage legacy hors propriétaire`);
    if (methods.has(method) && node.arguments.some(arg => value(arg) === 'sale' || value(arg) === 'kiwiSaleQueue')) errors.push(`${file}: canal sale hors propriétaire`);
  });
  return errors;
}
const files = new Map();
function inventory(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const file = dir + '/' + entry.name;
    if (entry.isDirectory() && entry.name !== 'vendor') inventory(file);
    else if (entry.isFile() && file.endsWith('.js')) files.set(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
  }
}
inventory('assets');
for (const file of fs.readdirSync(ROOT).filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/\bsrc=|application\/(?:ld\+)?json/.test(m[1])).map(m => m[2]);
  files.set(file, scripts.join('\n'));
}
const cached = new Map();
const inspect = sources => [...sources].flatMap(([file, text]) => {
  let entry = cached.get(file);
  if (!entry || entry.text !== text) {
    entry = { text, errors: violations(file, text) }; cached.set(file, entry);
  }
  return entry.errors;
});
assert.deepEqual(inspect(files), []);
for (const stray of [
  "localStorage.setItem('kiwiSaleQueue', '[]');",
  "const key = 'kiwi' + 'SaleQueue'; localStorage['setItem'](key, '[]');",
  "const O = window.KiwiOffline, channel = 'sale'; O.enqueue(channel, merchant, body);",
  "window.KiwiOffline.list('sale', merchant);",
  "localStorage['kiwiSaleQueue'] = '[]';",
  "db.outbox.put({id: 'parasite'});",
]) {
  const mutated = new Map(files);
  mutated.set('assets/live-link.js', files.get('assets/live-link.js') + '\n' + stray);
  assert(inspect(mutated).some(error => error.startsWith('assets/live-link.js:')), stray);
  mutated.set('assets/live-link.js', files.get('assets/live-link.js'));
  assert.deepEqual(inspect(mutated), []);
}
// Chargement inerte et API publique réelle, sans ouvrir IndexedDB ni localStorage.
const window = {};
vm.runInNewContext(files.get(OWNER), { window });
assert.equal(typeof window.KiwiSaleQueueStore.create, 'function');
const queue = window.KiwiSaleQueueStore.create({});
for (const method of ['enqueue', 'peek', 'ack', 'migrateLegacy', 'count']) assert.equal(typeof queue[method], 'function', method);
for (const shell of ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html', 'tools/live-link-outbox-browser-test.html']) {
  const html = fs.readFileSync(path.join(ROOT, shell), 'utf8');
  assert(html.indexOf(OWNER) >= 0 && html.indexOf(OWNER) < html.indexOf('assets/live-link.js'), shell);
}
assert(new RegExp("'/" + OWNER.replace(/[.\/]/g, '\\$&') + "\\?v=\\d+'").test(fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8')), 'queue owner is precached under its stamp');
console.log('✓ propriétaire exclusif, fabrique inerte, API, shells et précache ; six mutations rouges puis vertes');
