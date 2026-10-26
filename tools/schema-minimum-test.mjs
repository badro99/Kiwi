#!/usr/bin/env node
// Contrat vérifié hors requête : migrations locales, SQL littéral et absence de replis.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT, MIGRATIONS_DIR, listMigrations, freshDb } from './d1-migrations.mjs';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const files = readdirSync(join(ROOT, 'functions'), { recursive: true }).filter(f => f.endsWith('.js')).sort();
const db = freshDb();
const versionSource = readFileSync(join(ROOT, 'functions/_schema-version.js'), 'utf8');
const minimum = Number(/MINIMUM_SCHEMA_VERSION\s*=\s*(\d+)/.exec(versionSource)?.[1]);
assert.equal(minimum, 16, 'Le minimum de production est 0016 (d1_migrations lu en production le 26 octobre 2026).');
const migrations = listMigrations().filter(f => Number(f.slice(0, 4)) <= minimum);
assert.equal(Number(migrations.at(-1).slice(0, 4)), minimum);
for (const file of migrations) db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
let checked = 0, dynamic = 0;
/* Diagnostics are keyed by file and message, without the line, so moving code
   does not churn the pin. Today's fallbacks are pinned in
   tools/schema-fallback-baseline.json: any new one, or a query that stops
   preparing against migration 0016, fails the gate. The pin only goes down
   (KIWI_UPDATE_SCHEMA_BASELINE=1 after a fallback is removed). */
const found = new Map();
const fail = message => { const key = message.replace(/:\d+ : /, ' : '); found.set(key, (found.get(key) || 0) + 1); };
const forbidden = /\b(?:CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS|ALTER\s+TABLE|PRAGMA\s+table_info|pragma_table_info)\b|no such (?:table|column)|has no column named/i;
for (const file of files) {
  const source = readFileSync(join(ROOT, 'functions', file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const constants = new Map();
  function collect(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) constants.set(n.name.text, n.initializer);
    ts.forEachChild(n, collect);
  }
  collect(ast);
  function value(n, seen = new Set()) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isNumericLiteral(n)) return n.text;
    if (ts.isIdentifier(n) && constants.has(n.text) && !seen.has(n.text)) return value(constants.get(n.text), new Set([...seen, n.text]));
    if (ts.isParenthesizedExpression(n)) return value(n.expression, seen);
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const a = value(n.left, seen), b = value(n.right, seen); return a === null || b === null ? null : a + b;
    }
    return null;
  }
  function visit(n) {
    // On examine les jetons, pas les commentaires historiques.
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n) || n.kind === ts.SyntaxKind.RegularExpressionLiteral)) {
      const text = n.getText(ast);
      // Le catalogue de l'export administratif décrit les tables réellement présentes.
      if (forbidden.test(text) && !(file === 'api/admin/clients.js' && /pragma_table_info/.test(text))) {
        fail(`${file}:${ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1} : repli de schéma`);
      }
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'prepare' && n.arguments.length) {
      const sql = value(n.arguments[0]);
      if (sql === null) dynamic++;
      else if (/^\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)) {
        try { db.prepare(sql); checked++; }
        catch (error) {
          // Une fonction D1 n'est pas une dépendance de schéma.
          if (!/no such function|wrong number of arguments to function/i.test(error.message)) fail(`${file}:${ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1} : ${error.message}`);
        }
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
}
// Témoins négatifs : une table et une colonne absentes ne peuvent passer.
assert.throws(() => db.prepare('SELECT absent FROM sales'), /no such column/);
assert.throws(() => db.prepare('SELECT * FROM schema_minimum_absent'), /no such table/);
db.close();
const BASELINE = join(ROOT, 'tools/schema-fallback-baseline.json');
let pinned = {};
try { pinned = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch (_) { pinned = null; }
if (process.env.KIWI_UPDATE_SCHEMA_BASELINE === '1') {
  const next = {};
  for (const [key, count] of found) {
    const cap = pinned ? (pinned[key] || 0) : count;   // never raise, never add
    if (Math.min(count, cap) > 0) next[key] = Math.min(count, cap);
  }
  writeFileSync(BASELINE, JSON.stringify(Object.fromEntries(Object.entries(next).sort()), null, 2) + '\n');
  pinned = next;
}
assert.ok(pinned, 'tools/schema-fallback-baseline.json is missing');
let fresh = 0, total = 0, lower = 0;
for (const [key, count] of found) {
  total += count;
  const cap = pinned[key] || 0;
  if (count > cap) { fresh += count - cap; console.error(`✗ ${key} (${count}, pinned ${cap})`); }
}
for (const [key, cap] of Object.entries(pinned)) if ((found.get(key) || 0) < cap) lower++;
if (lower) console.log(`! ${lower} pinned schema diagnostic(s) went away: lower the pin with KIWI_UPDATE_SCHEMA_BASELINE=1`);
console.log(`${checked} requêtes SQL vérifiées au minimum ${minimum}, ${dynamic} expressions dynamiques à couvrir, ${total} diagnostic(s) connus et épinglés, ${fresh} nouveau(x).`);
process.exitCode = fresh ? 1 : 0;
