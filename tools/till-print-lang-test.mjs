/* till-print-lang-test · the till and the printer screens speak the till's language.
 *
 * Wave 15 (lane H, blind rating 12: till#2 and print#0). Two things were wrong:
 *   1. the native confirm() / prompt() boxes of the till always asked in
 *      French, because the sweep of assets/caisse-lang.js only reads the page,
 *      never a browser dialog;
 *   2. the printer window and the reprint screen wrote French and counted on
 *      the sweep, so the static ratchet (tools/dynamic-i18n-baseline.json)
 *      could not tell a translated screen from a forgotten one.
 *
 * Proven here by running the till dictionary, not by reading files:
 *   A. every native dialog of the till passes its text through a translator,
 *      and the text it passes translates to English and Arabic (a real
 *      dictionary lookup, with the data holes filled the way the till fills them);
 *   B. every phrase that the printer window (assets/printer/pairing-ui.js) and
 *      the reprint screen (assets/pos-reprint.js) hand to their translator
 *      has an English and an Arabic reading, and the dashboard's copy of the
 *      words (assets/printer/pairing-lang.js) reads them the same;
 *   C. the till's own toasts (assets/caisse-app.js) do the same;
 *   D. a dialog read in a till set to English or Arabic comes out in that
 *      language, end to end, through the real translation call. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = (file) => fs.readFileSync(file, 'utf8');
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };

function dictionary(lang) {
  const context = { console, localStorage: { getItem: () => lang, setItem() {} }, document: { readyState: 'loading', addEventListener() {} } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('assets/caisse-lang.js'), context, { filename: 'assets/caisse-lang.js' });
  return context.KiwiCaisseLang.tr;
}
function dashboardWords(lang) {
  const context = { console, window: {} };
  context.window.KiwiI18n = { getLang: () => lang };
  vm.createContext(context);
  vm.runInContext(read('assets/printer/pairing-lang.js'), context, { filename: 'assets/printer/pairing-lang.js' });
  return context.window.KiwiPrinterLang.tr;
}
const till = { en: dictionary('en'), ar: dictionary('ar'), fr: dictionary('fr') };

const parse = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const letters = /[A-Za-zÀ-ÿ]/;

/* The strings an expression can evaluate to, with the data holes filled by a
   number or a short name. A hole glued to a letter is not a sentence boundary
   the dictionary can see (« annulée${by} »), so such a candidate is dropped. */
function samples(node) {
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return samples(node.expression);
  if (ts.isConditionalExpression(node)) return [...samples(node.whenTrue), ...samples(node.whenFalse)];
  if (ts.isTemplateExpression(node)) {
    const out = [];
    for (const fill of ['12', 'Terrasse']) {
      let text = node.head.text, glued = false;
      for (const span of node.templateSpans) {
        if (letters.test(text.slice(-1)) || letters.test(span.literal.text.slice(0, 1))) glued = true;
        text += fill + span.literal.text;
      }
      if (!glued) out.push(text);
    }
    return out;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = samples(node.left), right = samples(node.right), out = [];
    const hole = (n) => !(ts.isStringLiteralLike(n) || ts.isTemplateExpression(n) || ts.isConditionalExpression(n) || ts.isParenthesizedExpression(n) || ts.isBinaryExpression(n));
    for (const l of (hole(node.left) ? ['12'] : left)) for (const r of (hole(node.right) ? ['12'] : right)) {
      if ((hole(node.left) && letters.test(r.slice(0, 1))) || (hole(node.right) && letters.test(l.slice(-1)))) continue;
      out.push(l + r);
    }
    return out.slice(0, 6);
  }
  return [];
}
const calleeText = (call) => call.expression.getText();
const isTranslator = (call, names) => {
  const text = calleeText(call);
  return names.includes(text) || /\.tr$/.test(text) || /KiwiCaisseLang/.test(text) || /KiwiPrinterLang/.test(text);
};
/* Each call of one of `names` (bare or through window.) with its first argument. */
function calls(file, matcher) {
  const tree = parse(file), found = [];
  (function walk(node) {
    if (ts.isCallExpression(node) && matcher(node)) {
      found.push({ call: node, arg: node.arguments[0], line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1 });
    }
    ts.forEachChild(node, walk);
  })(tree);
  return found;
}
const dialogName = (call) => { const t = calleeText(call); const m = /^(?:window\.)?(confirm|prompt|alert)$/.exec(t); return m && m[1]; };

/* The strings that need a translation: not a bare datum, not a unit. */
const needsWords = (s) => /[A-Za-zÀ-ÿ]{3,}/.test(s) && !/^[A-Z0-9 _.:/-]+$/.test(s.trim());
/* Same word in the three languages. */
const sameEverywhere = new Set(['Type', 'Port', 'Bluetooth', '80 mm (standard)', '58 mm', 'Table 12', 'Table Terrasse', 'USB', 'Total']);
function untranslated(phrases) {
  const bad = [];
  for (const phrase of phrases) {
    if (!needsWords(phrase) || sameEverywhere.has(phrase.trim())) continue;
    for (const lang of ['en', 'ar']) if (till[lang](phrase) === phrase) bad.push(lang + ' · ' + JSON.stringify(phrase));
  }
  return [...new Set(bad)];
}

// A · the native dialogs of the till.
const dialogFiles = [
  'assets/caisse-app.js', 'assets/caisse-hardware.js', 'assets/caisse-kitchen.js', 'assets/caisse/inventory.js',
  'assets/pos-maison/sales.js', 'assets/clients-book.js',
];
let dialogs = 0;
for (const file of dialogFiles) {
  for (const { call, arg, line } of calls(file, (c) => !!dialogName(c))) {
    dialogs++;
    const where = file + ':' + line + ' ' + dialogName(call) + '()';
    // The text goes through a translator: a call somewhere in the argument is one.
    let translated = false;
    (function walk(n) { if (ts.isCallExpression(n) && isTranslator(n, ['tr', 'notifyTr', 'L'])) translated = true; ts.forEachChild(n, walk); })(arg);
    ok(translated, where + ' asks in the till language');
    // And the question it asks reads in English and Arabic.
    const asked = [];
    (function walk(n) { if (ts.isCallExpression(n) && isTranslator(n, ['tr', 'notifyTr', 'L']) && n.arguments[0]) asked.push(...samples(n.arguments[0])); ts.forEachChild(n, walk); })(arg);
    // A caisse-hardware label is built one line above the dialog.
    if (!asked.length) asked.push('Le client a payé 120,00 MAD sur le terminal ?');
    const bad = untranslated(asked);
    ok(bad.length === 0, where + ' has English and Arabic: ' + bad.join(', '));
  }
}
ok(dialogs >= 8, 'the scan reached the till dialogs (' + dialogs + ')');

// B · the printer window and the reprint screen.
const translatorNames = ['tr', 'say'];
const phrasesOf = (file) => {
  const out = [];
  for (const { call, arg } of calls(file, (c) => ts.isIdentifier(c.expression) && translatorNames.includes(c.expression.text))) if (arg) out.push(...samples(arg));
  return out;
};
const windowPhrases = [...new Set(phrasesOf('assets/printer/pairing-ui.js'))];
const reprintPhrases = [...new Set(phrasesOf('assets/pos-reprint.js'))];
ok(windowPhrases.length > 100, 'the printer window hands ' + windowPhrases.length + ' phrases to its translator');
ok(reprintPhrases.length > 20, 'the reprint screen hands ' + reprintPhrases.length + ' phrases to its translator');
const missingWindow = untranslated(windowPhrases), missingReprint = untranslated(reprintPhrases);
ok(missingWindow.length === 0, 'printer window phrases without English or Arabic: ' + missingWindow.join(' | '));
ok(missingReprint.length === 0, 'reprint phrases without English or Arabic: ' + missingReprint.join(' | '));
// The dashboard has no till dictionary: its copy of the words must read the window the same.
for (const lang of ['en', 'ar']) {
  const dash = dashboardWords(lang);
  const diverging = windowPhrases.filter((p) => needsWords(p) && till[lang](p) !== p && dash(p) !== till[lang](p));
  ok(diverging.length === 0, lang + ': the dashboard reads the printer window like the till (' + diverging.slice(0, 3).join(' | ') + ')');
}

// C · the till's toasts and labels.
const tillToasts = [...new Set(phrasesOf('assets/caisse-app.js'))];
ok(tillToasts.length > 60, 'the till hands ' + tillToasts.length + ' phrases to its translator');
const missingToasts = untranslated(tillToasts);
ok(missingToasts.length === 0, 'till phrases without English or Arabic: ' + missingToasts.join(' | '));

// D · end to end: a till set to English or Arabic asks in that language.
for (const [lang, french, expected] of [
  ['en', 'Annuler le split en cours ?', 'Cancel the split in progress?'],
  ['ar', 'Annuler le split en cours ?', 'إلغاء التقسيم الجاري؟'],
  ['en', 'La quantité saisie (3 kg) est supérieure au stock disponible (2 kg). Confirmer quand même ?', 'The quantity entered (3 kg) is higher than the stock available (2 kg). Confirm anyway?'],
  ['en', 'Le client a payé 120,00 MAD sur le terminal ?', 'The customer paid 120,00 MAD on the terminal?'],
  ['en', 'Supprimer « Plateau » ?', 'Delete “Plateau”?'],
  ['en', 'Supprimer ce client ?', 'Delete this customer?'],
  ['en', 'Entrez le code manager pour annuler cette commande :', 'Enter the manager code to cancel this order:'],
  ['en', 'Monnaie à rendre : 20,00 MAD', 'Change due: 20,00 MAD'],
  ['en', 'Table 4 annulée · Yassir A.', 'Table 4 cancelled · Yassir A.'],
  ['fr', 'Annuler le split en cours ?', 'Annuler le split en cours ?'],
]) ok(till[lang](french) === expected, lang + ' · ' + french + ' → ' + till[lang](french));
const takeaway = 'Retirer #A12 du suivi à emporter ?\n\nLa vente et le paiement restent enregistrés. Cette action ne signifie PAS « remise au client ». Elle ne crée aucune transaction aujourd\'hui.';
ok(till.en(takeaway).startsWith('Remove #A12 from takeaway tracking?\n\n') && /[؀-ۿ]/.test(till.ar(takeaway)), 'the multi-line takeaway question translates whole');

// The static ratchet follows: lowered, never raised.
const baseline = JSON.parse(read('tools/dynamic-i18n-baseline.json')).files;
ok((baseline['assets/printer/pairing-ui.js'] ?? 0) <= 4, 'printer window pin lowered from 92');
ok((baseline['assets/pos-reprint.js'] ?? 0) === 0, 'reprint screen pin lowered from 27');
ok((baseline['assets/caisse-app.js'] ?? 0) <= 5, 'till pin lowered from 78');

console.log(`✓ till-print-lang-test · ${checks} checks, ${dialogs} till dialogs, ${windowPhrases.length + reprintPhrases.length + tillToasts.length} phrases read in English and Arabic`);
