#!/usr/bin/env node
/* Till pairing and staff identity (assets/caisse-pairing.js) is split by concern (tenth blind rating, pairing#2): terminal and offline code cache · pairing state and routing · pairing transport · pairing pad · staff identity and code gate · till proof and boot · code verification · public API. A change to who may use the till now names the part it touches.
 * The page still loads assets/caisse-pairing.js, the exact concatenation of its parts, so
 * no page and no stamp moves; a change is made in the part that owns the
 * concern, then the bundle is rebuilt (cat, recorded in the fixture).
 * The proof: byte equality, every part parses inside the bundle's closure,
 * each part declares exactly the names recorded for it (moving a function
 * between concerns is a reviewed change of tools/fixtures/caisse-pairing/split.json),
 * and no name is declared in two parts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = (f) => fs.readFileSync(f, 'utf8');
const map = JSON.parse(read('tools/fixtures/caisse-pairing/split.json'));

function declared(text) {
  const ast = ts.createSourceFile('part.js', text, ts.ScriptTarget.Latest, true);
  let body = null;
  ts.forEachChild(ast, function visit(n) { if (!body && (ts.isFunctionExpression(n) || ts.isArrowFunction(n)) && n.body && n.body.statements) body = n.body; else if (!body) ts.forEachChild(n, visit); });
  const names = [];
  for (const s of body.statements) {
    if (ts.isFunctionDeclaration(s)) names.push(s.name.text);
    else if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) names.push(d.name.getText(ast));
    else if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && /^window\.\w+$/.test(s.expression.left.getText(ast))) names.push(s.expression.left.getText(ast));
  }
  return names;
}

const [bundle] = map.bundles;
assert.equal(map.bundles.length, 1);
const parts = bundle.parts.map((p) => read(p.file));
assert.equal(read(bundle.file), parts.join(''), bundle.file + ' = concaténation exacte de ses parties ; la refaire : cat '
  + bundle.parts.map((p) => p.file).join(' ') + ' > ' + bundle.file);
new vm.Script(read(bundle.file), { filename: bundle.file });
const all = new Set(), byPart = {};
bundle.parts.forEach((p, k) => {
  const open = k === 0 ? '' : '(function () {\n', close = k === parts.length - 1 ? '' : '\n})();';
  const wrapped = open + parts[k] + close;
  new vm.Script(wrapped, { filename: p.file });
  const names = declared(wrapped);
  assert.deepEqual(names, p.declares, p.file + ' : déclarations du domaine « ' + p.concern + ' »');
  for (const n of names) { assert.ok(!all.has(n), n + ' déclaré dans deux parties'); all.add(n); }
  byPart[p.file.split('/').pop()] = new Set(names);
});
for (const [part, names] of Object.entries({"head.js":[],"offline-codes.js":["terminalId","pinDigest","rememberOfflinePin","verifyOfflinePin"],"pairing-state.js":["isPaired","pairedVenue","takeHandoff","bootVertical"],"pairing-transport.js":["applyPairing","redeem","unpair"],"pairing-pad.js":["renderPairPad","showPad","submit"],"staff-gate.js":["setStaff","pinsFor","showPinPad","submitPin"],"boot.js":["ensureTillProof","boot"],"verify.js":["verifyCode","verifyReply","noteApproval"],"api.js":["window.KiwiCaissePairing"]})) for (const n of names) assert.ok(byPart[part].has(n), `${part} owns ${n}`);
const at = bundle.sha256AtSplit === createHash('sha256').update(read(bundle.file)).digest('hex');
console.log('✓ caisse-pairing-split-test : terminal et cache des codes, état d’appairage, transport, pavé, identité du personnel, preuve et démarrage, vérification et API découpés par domaine, fichier livré identique à ses parties' + (at ? ', octets du découpage' : ''));
