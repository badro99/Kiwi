/* Cross-system dictionary completeness. Parse literals without booting any UI. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const locales = ['fr', 'en', 'ar'];
const name = p => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
export function audit(source, file) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const errors = []; let dictionaries = 0;
  function visit(n) {
    if (ts.isObjectLiteralExpression(n)) {
      const props = new Map(n.properties.filter(ts.isPropertyAssignment).map(p => [name(p), p.initializer]));
      const langs = locales.filter(l => props.has(l));
      // Locale maps, including French implicit in phrase keys (caisse/hotel).
      if (langs.length >= 2 && (langs.includes('fr') || langs.includes('en'))) {
        const maps = langs.filter(l => ts.isObjectLiteralExpression(props.get(l)));
        if (maps.length === langs.length) {
          dictionaries++;
          const keys = new Set(maps.flatMap(l => props.get(l).properties.map(name).filter(Boolean)));
          const reference = props.has('fr') ? props.get('fr').properties : [...keys].map(k => ({ name: { text: k } }));
          for (const k of (props.has('fr') ? reference.map(name).filter(Boolean) : keys)) {
            for (const l of ['en', 'ar']) {
              const entries = props.has(l) ? props.get(l).properties : [];
              const target = entries.find(p => name(p) === k);
              if (!target) errors.push(`${file}:${tree.getLineAndCharacterOfPosition(n.pos).line + 1} ${l} missing ${k}`);
              const original = props.has('fr') ? reference.find(p => name(p) === k)?.initializer : null;
              if (target && original && ts.isStringLiteralLike(original) && original.text &&
                  (!target.initializer || target.initializer.kind === ts.SyntaxKind.NullKeyword ||
                   ts.isStringLiteralLike(target.initializer) && !target.initializer.text)) {
                errors.push(`${file} ${l} empty ${k}`);
              }
            }
          }
        } else if (langs.every(l => ts.isStringLiteralLike(props.get(l)) || ts.isArrayLiteralExpression(props.get(l)))) {
          dictionaries++;
          for (const l of ['en', 'ar']) if (!props.has(l)) errors.push(`${file}:${tree.getLineAndCharacterOfPosition(n.pos).line + 1} missing ${l}`);
        }
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(tree);
  return { errors, dictionaries };
}
function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
    const f = `${dir}/${e.name}`;
    return e.isDirectory() ? (e.name === 'vendor' || e.name === 'icons' ? [] : files(f)) : /\.js$/.test(e.name) ? [f] : [];
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Regression probes: a missing translation must fail in every supported shape.
  for (const s of ["const T={fr:{x:'bonjour'},en:{x:'hello'},ar:{}}", "const T={fr:{x:'bonjour'},ar:{x:'مرحبا'}}", "const T={en:{Bonjour:'Hello'},ar:{}}", "const T={'Bonjour':{en:'Hello',fr:'Bonjour'}}"]) {
    assert.ok(audit(s, 'probe.js').errors.length, 'missing translation detected');
  }
  assert.equal(audit("const T={fr:{x:''},en:{x:''},ar:{x:''}}", 'probe.js').errors.length, 0, 'intentional empty copy is present');
  const results = files('assets').map(f => audit(fs.readFileSync(path.join(root, f), 'utf8'), f));
  const errors = results.flatMap(r => r.errors);
  console.log(`${results.reduce((n, r) => n + r.dictionaries, 0)} locale dictionaries checked across assets`);
  for (const e of errors) console.error(e);
  if (errors.length) process.exitCode = 1;
}
