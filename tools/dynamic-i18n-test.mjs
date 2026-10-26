#!/usr/bin/env node
/* Garde statique des écritures visibles. Les mutations DOM différées ne sont
 * pas une traduction explicite. KIWI_UPDATE_I18N_BASELINE=1 abaisse les pins.
 * Périmètre : JS propriétaire assets/** et scripts intégrés des HTML racine.
 * Limite : pas de propagation interprocédurale ni de résolution de propriétés
 * métier. Les alias scalaires locaux sont suivis, sans exécuter le produit. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, 'tools/dynamic-i18n-baseline.json');
const translated = /^(?:t|tr|dt|translate|translateCore|i18n|L|text|formatMessage)$/;
const visibleKeys = /^(?:title|desc|description|message|body|content|html|label|text|confirmText|cancelText|placeholder)$/;
const prop = n => ts.isPropertyAccessExpression(n) ? n.name.text : ts.isElementAccessExpression(n) && ts.isStringLiteral(n.argumentExpression) ? n.argumentExpression.text : '';
const name = n => ts.isIdentifier(n) ? n.text : prop(n);
function words(s, html) {
  if (html) s = s.replace(/<(style|script|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, tag => [...tag.matchAll(/(?:title|aria-label|placeholder)\s*=\s*["']([^"']*)["']/gi)].map(m => m[1]).join(' '));
  return /[A-Za-zÀ-ÿ]{2,}/.test(s.replace(/&[a-z]+;|&#\d+;/gi, ''));
}
export function scan(source, filename = 'fixture.js') {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const bindings = new Map();
  function index(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const list = bindings.get(n.name.text) || []; list.push(n.initializer); bindings.set(n.name.text, list);
    }
    ts.forEachChild(n, index);
  }
  index(tree);
  function raw(n, html, seen = new Set()) {
    if (!n) return false;
    if (ts.isStringLiteralLike(n)) return words(n.text, html);
    if (ts.isTemplateExpression(n)) return words(n.head.text, html) || n.templateSpans.some(s => words(s.literal.text, html) || raw(s.expression, html, seen));
    if (ts.isIdentifier(n)) {
      if (seen.has(n.text)) return false;
      const next = new Set(seen).add(n.text);
      // Un nom ambigu entre plusieurs portées ne permet pas de conclure.
      const values = bindings.get(n.text);
      return values?.length === 1 ? raw(values[0], html, next) : false;
    }
    if (ts.isCallExpression(n)) {
      if (translated.test(name(n.expression)) || /^(?:KiwiStrings|KiwiCaisseLang|KiwiServeurLang)\./.test(n.expression.getText(tree))) return false;
      return n.arguments.some(a => raw(a, html, seen));
    }
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isFunctionLike(n)) return false;
    if (ts.isObjectLiteralExpression(n)) return n.properties.some(p => ts.isPropertyAssignment(p) && visibleKeys.test(name(p.name) || p.name.text) && raw(p.initializer, html, seen));
    let found = false;
    ts.forEachChild(n, child => { if (raw(child, html, seen)) found = true; });
    return found;
  }
  const hits = [];
  function visit(n) {
    let args = [], html = false;
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken].includes(n.operatorToken.kind) && /^(textContent|innerText|innerHTML|title|placeholder)$/.test(prop(n.left))) {
      // Les feuilles de style ne sont pas des libellés.
      if (!/(?:style|css)/i.test(n.left.expression.getText(tree))) args = [n.right];
      html = prop(n.left) === 'innerHTML';
    }
    if (ts.isCallExpression(n)) {
      const method = name(n.expression);
      if (method === 'setAttribute' && ts.isStringLiteralLike(n.arguments[0] || {}) && /^(title|aria-label|placeholder)$/.test(n.arguments[0].text)) args = [n.arguments[1]];
      else if (method === 'insertAdjacentHTML') { args = [n.arguments[1]]; html = true; }
      else if (/^(?:toast|modal|drawer|alert|confirm|showToast|showModal|openModal)$/.test(method)) { args = [...n.arguments]; html = true; }
    }
    if (args.some(a => raw(a, html))) hits.push(tree.getLineAndCharacterOfPosition(n.getStart(tree)).line + 1);
    ts.forEachChild(n, visit);
  }
  visit(tree); return hits;
}
// Cas de non-régression : attributs, gabarits, alias et mélange traduit/brut.
for (const code of ["x.textContent='Bonjour'", "x.innerText = `Hello ${n}`", "x.innerHTML='<b>Bonjour</b>'", "x.insertAdjacentHTML('beforeend','<p>Hello</p>')", "x.setAttribute('aria-label','Fermer')", "toast('Erreur', {desc:'Réessayez'})", "modal({title:'Bonjour'})", "const message='Bonjour'; x.textContent=message", "x.textContent=t('clé')+' non traduit'"]) assert.equal(scan(code).length, 1, code);
for (const code of ["x.textContent=t('Bonjour')", "x.innerHTML='<div class=\"hello\"></div>'", "x.setAttribute('class','hello')", "toast(T.saved,{type:'success'})", "style.textContent='body { color: red }'", "// x.textContent='Bonjour'", "x.textContent='١٢٣'"]) assert.equal(scan(code).length, 0, code);
function walk(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) return /^(vendor|node_modules)$/.test(e.name) ? [] : walk(rel);
    return /\.js$/.test(rel) && !/(?:\.min\.js| 2\.)/.test(rel) ? [rel] : [];
  });
}
const files = [...walk('assets'), ...fs.readdirSync(ROOT).filter(f => /\.html$/.test(f) && !/ 2\./.test(f))].sort();
const counts = {}, locations = {};
for (const file of files) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const scripts = file.endsWith('.html') ? [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]) : [src];
  locations[file] = scripts.flatMap(s => scan(s, file));
  counts[file] = locations[file].length;
}
const baseline = JSON.parse(fs.readFileSync(BASE, 'utf8'));
const errors = [];
for (const [file, count] of Object.entries(counts)) {
  if (count > (baseline.files[file] ?? 0)) errors.push(`${file}: ${count} > ${baseline.files[file] ?? 0}, lignes ${locations[file].join(', ')}`);
}
if (process.env.KIWI_UPDATE_I18N_BASELINE === '1' && !errors.length) {
  baseline.files = Object.fromEntries(Object.entries(counts).filter(([, n]) => n));
  fs.writeFileSync(BASE, JSON.stringify(baseline, null, 2) + '\n');
}
if (process.env.KIWI_I18N_REPORT === '1') console.log(JSON.stringify(counts, null, 2));
console.log(`${errors.length ? '✗' : '✓'} i18n dynamique : ${files.length} fichiers, ${Object.values(counts).reduce((a,b)=>a+b,0)} écritures héritées, ${errors.length} régressions`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
