/* The client store and the till's client book are split by concern. Each
 * shipped bundle (assets/clients-store.js, assets/clients-book.js, the files the
 * pages load) stays the exact concatenation of its parts, so the pages and their
 * stamps do not move; a change is made in the part that owns the concern.
 *   store: profile · loyalty · sync · api      book: base · credit · profiles · entry
 * The proof: byte equality, every part parses inside the bundle's closure, each
 * part declares exactly the names recorded for it (moving a function to another
 * concern is a reviewed change of tools/fixtures/clients-split/split.json), and
 * the loyalty part carries the shared KiwiLoyaltyRules copy. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = (f) => fs.readFileSync(f, 'utf8');
const map = JSON.parse(read('tools/fixtures/clients-split/split.json'));

function declared(text) {
  const ast = ts.createSourceFile('part.js', text, ts.ScriptTarget.Latest, true);
  let body = null;
  ts.forEachChild(ast, function visit(n) { if (!body && ts.isFunctionExpression(n)) body = n.body; else if (!body) ts.forEachChild(n, visit); });
  const names = [];
  for (const s of body.statements) {
    if (ts.isFunctionDeclaration(s)) names.push(s.name.text);
    else if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) names.push(d.name.getText(ast));
    else if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && /^window\.\w+$/.test(s.expression.left.getText(ast))) names.push(s.expression.left.getText(ast));
  }
  return names;
}

for (const bundle of map.bundles) {
  const parts = bundle.parts.map((p) => read(p.file));
  assert.equal(read(bundle.file), parts.join(''), bundle.file + ' = concaténation exacte de ses parties ; la refaire : cat '
    + bundle.parts.map((p) => p.file).join(' ') + ' > ' + bundle.file);
  new vm.Script(read(bundle.file), { filename: bundle.file });
  const all = new Set();
  bundle.parts.forEach((p, k) => {
    const open = k === 0 ? '' : '(function () {\n', close = k === parts.length - 1 ? '' : '\n})();';
    const wrapped = open + parts[k] + close;
    new vm.Script(wrapped, { filename: p.file });
    const names = declared(wrapped);
    assert.deepEqual(names, p.declares, p.file + ' : déclarations du domaine « ' + p.concern + ' »');
    for (const n of names) { assert.ok(!all.has(n), n + ' déclaré dans deux parties'); all.add(n); }
  });
}
const store = Object.fromEntries(map.bundles[0].parts.map((p) => [p.file.split('/').pop(), p.declares]));
for (const n of ['bookId', 'readBook', 'writeBook', 'config', 'setConfig', 'upsert', 'list', 'get', 'findByPhone']) assert.ok(store['profile.js'].includes(n), 'profil : ' + n);
for (const n of ['KiwiLoyaltyRules', 'recordPurchase', 'recordRefund', 'redeem', 'segment', 'progress']) assert.ok(store['loyalty.js'].includes(n), 'fidélité : ' + n);
for (const n of ['pushClient', 'flushOutbox', 'purchasePush', 'redemptionPush', 'mergeServer', 'pull', 'startSync']) assert.ok(store['sync.js'].includes(n), 'synchronisation : ' + n);
assert.ok(store['api.js'].includes('window.KiwiClients'), 'surface publique dans api.js');
const book = Object.fromEntries(map.bundles[1].parts.map((p) => [p.file.split('/').pop(), p.declares]));
for (const n of ['creditMerchant', 'localCreditView', 'loadClientCredits']) assert.ok(book['credit.js'].includes(n), 'avoirs : ' + n);
for (const n of ['renderList', 'openForm', 'openDetail']) assert.ok(book['profiles.js'].includes(n), 'fiches : ' + n);
assert.ok(book['entry.js'].includes('window.KiwiClientsBook'), 'entrée caisse dans entry.js');
// The shared loyalty rules live in the loyalty part, kept in step by build-shared-rules.
const block = (t) => t.slice(t.indexOf('/* GENERATED SHARED KiwiLoyaltyRules BEGIN */'), t.indexOf('/* GENERATED SHARED KiwiLoyaltyRules END */'));
assert.ok(block(read('assets/clients-store/loyalty.js')).length > 100, 'copie partagée dans loyalty.js');
assert.ok(JSON.parse(read('tools/shared-rules.json')).rules.find((r) => r.name === 'KiwiLoyaltyRules').targets.includes('assets/clients-store/loyalty.js'),
  'build-shared-rules écrit aussi la partie fidélité');
const at = map.bundles.map((b) => b.sha256AtSplit === createHash('sha256').update(read(b.file)).digest('hex'));
console.log('✓ clients-split-test : magasin (profil, fidélité, synchronisation, surface) et carnet (base, avoirs, fiches, entrée) découpés par domaine, paquets identiques à leurs parties'
  + (at.every(Boolean) ? ', octets du découpage' : ''));
