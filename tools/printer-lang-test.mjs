/* printer-lang-test · the printer setup window speaks the dashboard's language.
 *
 * The dashboard opens assets/printer/pairing-ui.js but does not load the till
 * dictionary (assets/caisse-lang.js), so English and Arabic owners read French
 * (wave 11, print#0). assets/printer/pairing-lang.js carries the window's
 * phrases, copied from the till dictionary. Proven here:
 *   1. the copy is current (tools/build-printer-lang.mjs --check);
 *   2. every phrase of the window that the till translates, the dashboard
 *      translates identically, in English and Arabic;
 *   3. text and accessible names of a painted window are translated, merchant
 *      data and data-nolang are left alone, French stays French;
 *   4. printer-bridge.js loads the words with the window where caisse-lang is
 *      absent, translates the opened window and its say() questions, and never
 *      loads them on the till. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { render, tillDictionary, TARGET } from './build-printer-lang.mjs';
import printerTestSource from './printer-test-source.cjs';

const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = (file) => fs.readFileSync(file, 'utf8');
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };

// 1 · the generated block is current.
ok(render() === read(TARGET), TARGET + ' is stale: run node tools/build-printer-lang.mjs');

function words(lang) {
  const context = { console, window: {} };
  context.window.KiwiI18n = { getLang: () => lang };
  vm.createContext(context);
  vm.runInContext(read(TARGET), context, { filename: TARGET });
  return context.window.KiwiPrinterLang;
}

// 2 · parity with the till on every phrase the window can paint.
const ui = read('assets/printer/pairing-ui.js');
const literals = [];
(function walk(n) {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) literals.push(n.text);
  ts.forEachChild(n, walk);
})(ts.createSourceFile('pairing-ui.js', ui, ts.ScriptTarget.Latest, true));
const phrases = new Set();
for (const s of literals) {
  for (const m of s.matchAll(/(?:aria-label|placeholder|title)="([^"]*)"/g)) phrases.add(m[1].trim());
  for (const t of s.replace(/<[^>]*>/g, '\u0000').split('\u0000')) {
    const text = t.trim();
    if (/[A-Za-zÀ-ÿ]{3,}/.test(text) && !/[{};=#]/.test(text)) phrases.add(text);
  }
}
let translated = 0;
for (const lang of ['en', 'ar']) {
  const till = tillDictionary(lang), dash = words(lang);
  const context = { console, localStorage: { getItem: () => lang, setItem() {} }, document: { readyState: 'loading', addEventListener() {} } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('assets/caisse-lang.js'), context);
  const tillTr = context.KiwiCaisseLang.tr;
  assert.ok(Object.keys(till).length > 1000);
  for (const phrase of phrases) {
    const expected = tillTr(phrase);
    if (expected === phrase) continue;
    translated++;
    assert.equal(dash.tr(phrase), expected, lang + ': « ' + phrase + ' »');
  }
}
ok(translated > 250, 'the window has its words in both languages (' + translated + ')');
for (const [lang, fr, out] of [
  ['en', 'Connecter une imprimante', 'Connect a printer'],
  ['ar', 'Fermer', 'إغلاق'],
  ['en', 'Impression incertaine', 'Print not confirmed'],
  ['en', 'Ticket test envoyé (Bar)', 'Test receipt sent (Bar)'],
  ['en', '2 ponts en ligne', '2 bridges online'],
  ['fr', 'Connecter une imprimante', 'Connecter une imprimante'],
]) ok(words(lang).tr(fr) === out, lang + ' ' + fr + ' → ' + words(lang).tr(fr));

// 3 · a painted window: text nodes and accessible names, data left alone.
class Text { constructor(v) { this.nodeType = 3; this.nodeValue = v; this.nextSibling = null; } }
class El {
  constructor(tag, attrs = {}, kids = []) {
    this.nodeType = 1; this.tagName = tag; this.attrs = { ...attrs }; this.nextSibling = null; this.isConnected = true;
    this.firstChild = kids[0] || null;
    kids.forEach((k, i) => { k.nextSibling = kids[i + 1] || null; });
  }
  hasAttribute(a) { return a in this.attrs; }
  getAttribute(a) { return this.attrs[a]; }
  setAttribute(a, v) { this.attrs[a] = String(v); }
}
function paint() {
  const title = new Text('Connecter une imprimante'), name = new Text('Star TSP'), status = new Text('  Aucun pont associé à ce commerce.  ');
  const close = new El('BUTTON', { 'aria-label': 'Fermer' }, [new Text('×')]);
  const data = new El('B', { 'data-nolang': '' }, [new Text('Fermer')]);
  const style = new El('STYLE', {}, [new Text('Fermer')]);
  const root = new El('DIV', { 'aria-label': 'Connecter une imprimante' }, [close, new El('H2', {}, [title]), new El('P', {}, [name]), new El('SPAN', {}, [status]), data, style]);
  return { root, title, name, status, close, data, style };
}
for (const [lang, expectTitle, expectClose] of [['en', 'Connect a printer', 'Close'], ['ar', 'ربط طابعة', 'إغلاق']]) {
  const w = paint(), L = words(lang);
  L.apply(w.root);
  ok(w.title.nodeValue === expectTitle, lang + ' heading');
  ok(w.close.getAttribute('aria-label') === expectClose && w.root.getAttribute('aria-label') === expectTitle, lang + ' accessible names');
  ok(/^ {2}\S[\s\S]*\S {2}$/.test(w.status.nodeValue) && w.status.nodeValue.trim() !== 'Aucun pont associé à ce commerce.', lang + ' status keeps its spacing, translated');
  ok(w.name.nodeValue === 'Star TSP', lang + ' printer name untouched');
  ok(w.data.firstChild.nodeValue === 'Fermer' && w.style.firstChild.nodeValue === 'Fermer', lang + ' data-nolang and style untouched');
  L.apply(w.root, 'fr');
  ok(w.title.nodeValue === 'Connecter une imprimante' && w.close.getAttribute('aria-label') === 'Fermer', lang + ' back to French');
}

// 4 · printer-bridge.js loads the words with the window, only off the till.
const core = printerTestSource();
function realm({ till = false, lang = 'en' } = {}) {
  const scripts = [], nodes = new Map();
  const element = (tag) => ({ tag, style: {}, isConnected: true, setAttribute() {}, addEventListener() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
  const storage = new Map();
  const context = vm.createContext({ console, Promise, Uint8Array, AbortController,
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    navigator: {}, document: { createElement: element, getElementById: (id) => nodes.get(id) || null,
      head: { appendChild: (el) => { if (el.tag === 'script') scripts.push(el); } }, body: { appendChild() {} }, addEventListener() {} },
    setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, dispatchEvent() {}, CustomEvent: class {},
    fetch: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) }),
    Kiwi: { toast() {} }, KiwiI18n: { getLang: () => lang },
  });
  context.window = context;
  if (till) context.KiwiCaisseLang = { tr: (s) => 'till:' + s };
  vm.runInContext(core, context);
  return { context, scripts, nodes };
}
{
  const r = realm();
  const opening = r.context.KiwiPrinter.openSetup({ kind: 'receipt' });
  const srcs = r.scripts.map((s) => s.src);
  ok(srcs.some((s) => /^\/assets\/printer\/pairing-ui\.js\?v=\d+$/.test(s)) && srcs.some((s) => /^\/assets\/printer\/pairing-lang\.js\?v=\d+$/.test(s)), 'dashboard loads window and words: ' + srcs.join(', '));
  const painted = paint();
  let say;
  r.context.KiwiPrinter.__core.install({ openSetup() { r.nodes.set('kpr-ov', painted.root); say = r.context.KiwiPrinter.__core.say; } });
  vm.runInContext(read(TARGET), r.context);
  r.scripts.forEach((s) => s.onload());
  await opening;
  ok(painted.title.nodeValue === 'Connect a printer', 'opened window translated');
  ok(say('Annuler') === 'Cancel', 'say() questions translated on the dashboard');
  const again = r.context.KiwiPrinter.openSetup({ kind: 'label' });
  ok(again === undefined && r.scripts.length === 2, 'warm opening stays synchronous, no new script');
}
{
  const r = realm({ till: true });
  r.context.KiwiPrinter.openSetup({});
  ok(r.scripts.length === 1 && !r.scripts[0].src.includes('pairing-lang'), 'the till keeps its own dictionary');
  ok(r.context.KiwiPrinter.__core.say('Annuler') === 'till:Annuler', 'till say() unchanged');
}
{
  const r = realm();
  const opening = r.context.KiwiPrinter.openSetup({});
  const opened = [];
  r.context.KiwiPrinter.__core.install({ openSetup() { opened.push(1); } });
  r.scripts.find((s) => s.src.includes('pairing-ui')).onload();
  r.scripts.find((s) => s.src.includes('pairing-lang')).onerror();
  await opening;
  ok(opened.length === 1, 'missing words leave the window open, in French');
}
console.log(`✓ printer-lang-test · ${checks} checks, ${translated} window phrases match the till in EN and AR`);
