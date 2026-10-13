#!/usr/bin/env node
/* Kiwi · strings-lint.mjs · les règles de §9.6 (« String lints »), sur chaque
 * valeur des paquets assets/kit/strings/*.js en EN, FR et AR (et sur les trois
 * chaînes des pages invité, tools/strings-data/guest.json).
 *
 *   code            aucune phrase ne met un code personnel sur un appareil
 *   nnbsp           aucune valeur ne contient U+202F (aucun fichier livré n'a le glyphe, §6.1)
 *   fr-ponctuation  FR : ? ! ; : » précédés de U+00A0, « suivi de U+00A0
 *   facture-compte  AR : الفاتورة et حساب (§9.1 : l'addition, ou « حساب Kiwi »)
 *   actes           les phrases d'acte : {act} en tête, gérondif, article, glossaire
 *   entrées d'acte  chaque act.* a une ligne dans « Where each act starts » (§12)
 *   pin.offline     seulement là où aucune vérification hors ligne n'existe (§10.2)
 *   tiret           aucun tiret cadratin (U+2014) dans un texte visible
 *
 * Chaque règle a un contre-exemple intégré : elle doit échouer sur lui, sinon
 * c'est la règle qui est morte, pas la table qui est propre (« each fails on
 * revision 14's table »). Zéro dépendance. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, LANGS, readSpec, loadBundles, loadData, loadRuntime, flatten } from './strings-corpus.mjs';

const K = loadRuntime();
const bundles = loadBundles();
const spec = readSpec();
const specLines = spec.split('\n');

/* Les pages invité entrent dans les lints, pas dans les paquets. */
const guest = loadData('guest.json');
const flat = flatten(bundles, K);
for (const [key, e] of Object.entries(guest)) {
  for (const lang of LANGS) flat.push({ surface: 'guest', key, lang, value: e[lang], index: 0, text: e[lang] });
}

/* Une ligne par clé : { en: [textes], fr: […], ar: […] }, pour les règles qui comparent les langues. */
const byKey = new Map();
for (const f of flat) {
  const id = f.key;
  if (!byKey.has(id)) byKey.set(id, { en: [], fr: [], ar: [] });
  byKey.get(id)[f.lang].push(f.text);
}

/* ── Les règles : chacune est une fonction (flat, byKey) → liste de constats. ── */

const SENTENCE = /(?<=[.!?؟])\s+/u;

const CODE_TERM = {
  en: /\b(personal|staff|team) codes?\b/i,
  fr: /code personnel|codes personnels|code du personnel|code d'équipe|codes d'équipe/i,
  ar: /الرمز الشخصي|الرموز الشخصية|رموز الفريق/,
};
const CODE_VERB = {
  en: /\b(send|sends|sending|sent|load|loads|loading|loaded|download\w*|stored?|storing|save[sd]?|saving|keeps?|keeping|kept|holds?|holding|held|copy|copies|copying|copied)\b/i,
  fr: /(?<![\p{L}])(envoy|charg|télécharg|stock|enregistr|gard|conserv|copi)\p{L}*/iu,
  ar: /أرسل|يرسل|تحميل|يحمّل|تنزيل|خزّن|حفظ|يحفظ|يحتفظ/,
};
function ruleCode(rows) {
  const out = [];
  for (const f of rows) {
    for (const s of f.text.split(SENTENCE)) {
      if (CODE_TERM[f.lang].test(s) && CODE_VERB[f.lang].test(s)) out.push(`${f.key} (${f.lang}) : « ${s} »`);
    }
  }
  return out;
}

function ruleNnbsp(rows) {
  return rows.filter((f) => f.text.includes(' ')).map((f) => `${f.key} (${f.lang}) contient U+202F`);
}

function ruleDash(rows) {
  return rows.filter((f) => f.text.includes('\u2014')).map((f) => `${f.key} (${f.lang}) contient un tiret cadratin`);
}

/* FR : ? ! ; : » précédés de U+00A0 ; « suivi de U+00A0. Exemptions de la
 * spec : un chiffre avant « : » (une heure, 17:39) et « :// ». */
function ruleFrench(rows) {
  const out = [];
  for (const f of rows) {
    if (f.lang !== 'fr') continue;
    const s = f.text;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if ('?!;:»'.includes(c)) {
        if (c === ':' && (/[0-9]/.test(s[i - 1] || '') || s.slice(i, i + 3) === '://')) continue;
        if (s[i - 1] !== ' ') out.push(`${f.key} (fr) : « ${c} » sans U+00A0 avant, dans « ${s} »`);
      }
      if (c === '«' && s[i + 1] !== ' ') out.push(`${f.key} (fr) : « « » sans U+00A0 après, dans « ${s} »`);
    }
  }
  return out;
}

/* Facture et compte (§9.1, P8). */
function ruleBillAccount(_rows, keys) {
  const out = [];
  for (const [key, v] of keys) {
    const en = v.en.join(' ');
    const enBill = /\bbills?\b/i.test(en);
    const enInvoice = /\binvoices?\b/i.test(en);
    for (const s of v.ar) {
      if (s.includes('الفاتورة') && !enInvoice) out.push(`${key} (ar) : « الفاتورة » (l'addition est الحساب) dans « ${s} »`);
      for (let at = s.indexOf('حساب'); at >= 0; at = s.indexOf('حساب', at + 1)) {
        if (s.slice(at + 4, at + 9) !== ' Kiwi' && !enBill) out.push(`${key} (ar) : « حساب » sans « Kiwi », et l'EN ne dit pas bill, dans « ${s} »`);
      }
    }
    if (/\baccounts?\b/i.test(en)) {
      if (!v.ar.some((s) => s.includes('حساب Kiwi'))) out.push(`${key} : l'EN dit account, l'AR n'a pas « حساب Kiwi »`);
      if (!v.fr.some((s) => /compte/i.test(s))) out.push(`${key} : l'EN dit account, le FR n'a pas « compte »`);
    }
  }
  return out;
}

/* Phrases d'acte (révision 18, M5) + les deux lignes de clôture du glossaire. */
const ACT_GLOSSARY = { 'act.close_till': 'إغلاق الصندوق', 'act.cancel_table': 'إلغاء الطاولة', 'act.cancel_sale': 'إلغاء البيع', 'act.refund': 'استرداد', 'act.shift_change': 'تبديل الوردية' };
function ruleActs(rows, keys, entries, glossary) {
  const out = [];
  for (const f of rows) {
    if (!f.text.includes('{act}')) continue;
    if (f.lang === 'ar') { if (!f.text.includes('يتطلب {act}')) out.push(`${f.key} (ar) : {act} pas directement après « يتطلب »`); }
    else if (!f.text.startsWith('{act}')) out.push(`${f.key} (${f.lang}) : ne commence pas par {act}`);
  }
  for (const [key, v] of keys) {
    if (!key.startsWith('act.')) continue;
    for (const s of v.en) if (!(/^[A-Z]/.test(s) && (/^[A-Za-z]+ing\b/.test(s) || /^(The|A) /.test(s)))) out.push(`${key} (en) : doit commencer par une majuscule et un gérondif, « The » ou « A » : « ${s} »`);
    for (const s of v.fr) if (!/^(Le |La |L'|Un |Une )/.test(s)) out.push(`${key} (fr) : doit commencer par Le, La, L', Un ou Une : « ${s} »`);
    for (const s of v.ar) {
      for (const button of entries[key] || []) {
        for (const b of (keys.get(button) || { ar: [] }).ar) if (b && s.startsWith(b) && !(ACT_GLOSSARY[key] && b.startsWith(ACT_GLOSSARY[key]))) out.push(`${key} (ar) : commence par l'AR du bouton ${button} (un impératif) : « ${s} »`);
      }
      if (ACT_GLOSSARY[key] && !s.startsWith(ACT_GLOSSARY[key])) out.push(`${key} (ar) : doit commencer par « ${ACT_GLOSSARY[key]} » (glossaire) : « ${s} »`);
    }
  }
  for (const [act, button] of [['act.close_till', 'count.close']]) {
    for (const [name, key] of [['act', act], ['button', button]]) {
      const g = glossary[key];
      const v = keys.get(key);
      if (!g) { out.push(`le glossaire (§9.1) n'a pas de ligne pour ${key}`); continue; }
      for (const lang of LANGS) if (v && !v[lang].includes(g[lang])) out.push(`glossaire ${name} : ${key} (${lang}) vaut « ${v[lang]} », le glossaire dit « ${g[lang]} »`);
    }
  }
  return out;
}

/* Les lignes du glossaire §9.1 qui nomment act.close_till et count.close. */
function readGlossary() {
  const out = {};
  for (const line of specLines) {
    const m = /^\| .*`(act\.close_till|count\.close)`.*\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/.exec(line);
    if (m && !out[m[1]] && !line.includes('Key')) out[m[1]] = { en: m[2].trim(), fr: m[3].trim(), ar: m[4].trim() };
  }
  return out;
}

/* Chaque act.* a une ligne dans « Where each act starts » (§12) et un bouton qui existe. */
function readActTable() {
  const start = specLines.findIndex((l) => /^\*\*Where each act starts/.test(l));
  const acts = new Set();
  if (start < 0) return null;
  for (let i = start + 1; i < specLines.length && !/^\*\*Every shipped entry point/.test(specLines[i]); i++) {
    if (!specLines[i].startsWith('| `act.')) continue;
    for (const m of specLines[i].split(' | ')[0].matchAll(/`(act\.[a-z_.]+)`/g)) acts.add(m[1]);
  }
  return acts;
}
function ruleEntries(keys, entries, table) {
  const out = [];
  const actKeys = [...keys.keys()].filter((k) => k.startsWith('act.'));
  for (const k of actKeys) {
    if (!entries[k] || !entries[k].length) out.push(`${k} n'a aucune entrée dans tools/strings-data/act-entries.json`);
    for (const b of entries[k] || []) if (!keys.has(b)) out.push(`${k} : l'entrée ${b} n'est pas une clé des paquets`);
    if (table && !table.has(k)) out.push(`${k} n'a pas de ligne dans « Where each act starts » (§12)`);
  }
  for (const k of Object.keys(entries)) if (!keys.has(k)) out.push(`act-entries.json nomme ${k}, qui n'est pas une clé`);
  if (table) for (const k of table) if (!keys.has(k)) out.push(`« Where each act starts » nomme ${k}, qui n'est pas une clé`);
  return out;
}

/* pin.offline : seulement les deux usages sans vérification hors ligne. */
function rulePinOffline() {
  const out = [];
  const s = specLines.findIndex((l) => /^## 10\. /.test(l));
  const e = specLines.findIndex((l) => /^## 19\. /.test(l));
  let seen = 0;
  for (let i = s; i < e; i++) {
    const l = specLines[i];
    if (!l.startsWith('|') || !/`pin\.offline`/.test(l)) continue;
    seen++;
    if (!/Team sign-in/.test(l)) out.push(`§10 à §18, ligne ${i + 1} : pin.offline hors de « Team sign-in, clock-in »`);
  }
  if (!seen) out.push('aucune ligne de §10 ne nomme pin.offline : la règle ne lit rien');
  return out;
}

/* ── Exécution ─────────────────────────────────────────────────────────── */

const entries = loadData('act-entries.json');
const glossary = readGlossary();
const actTable = readActTable();
let failures = 0;
const report = (name, found) => {
  if (!found.length) { console.log(`  ✓ ${name}`); return; }
  failures += found.length;
  console.log(`  ✗ ${name} : ${found.length} constat(s)`);
  found.slice(0, 12).forEach((l) => console.log('      ' + l));
};

console.log(`strings-lint · ${byKey.size} clés, ${flat.length} textes (EN, FR, AR)`);
report('aucun code personnel ne voyage vers la caisse', ruleCode(flat));
report('aucune espace fine insécable (U+202F)', ruleNnbsp(flat));
report('aucun tiret cadratin dans un texte visible', ruleDash(flat));
report('ponctuation haute française (U+00A0)', ruleFrench(flat));
report('addition et compte (الفاتورة, حساب Kiwi)', ruleBillAccount(flat, byKey));
report('phrases d\'acte ({act}, gérondif, article, glossaire)', ruleActs(flat, byKey, entries, glossary));
report('chaque acte a une entrée', ruleEntries(byKey, entries, actTable));
report('pin.offline : usages sans vérification hors ligne', rulePinOffline());

/* Contre-exemples : chaque règle doit s'allumer sur une valeur fautive. */
const fake = (key, lang, text) => ({ surface: 'x', key, lang, value: text, index: 0, text });
const fakeKeys = (o) => new Map(Object.entries(o));
const neg = [
  ['code', () => ruleCode([fake('t', 'en', 'Your personal code is saved on the till.'), fake('t', 'fr', 'Le code personnel est enregistré.'), fake('t', 'ar', 'يتم حفظ الرمز الشخصي.')]).length === 3],
  ['nnbsp', () => ruleNnbsp([fake('t', 'fr', '19 174')]).length === 1],
  ['tiret', () => ruleDash([fake('t', 'en', 'a \u2014 b')]).length === 1],
  ['fr', () => ruleFrench([fake('t', 'fr', 'Vraiment ? Oui : non « x »'), fake('t', 'fr', 'Vraiment ? 17:39')]).length === 4],
  ['facture', () => ruleBillAccount(null, fakeKeys({ a: { en: ['Check'], fr: [''], ar: ['افتح الفاتورة'] }, b: { en: ['Check'], fr: [''], ar: ['حساب جديد'] }, c: { en: ['Your account'], fr: ['votre profil'], ar: ['حسابك'] } })).length >= 4],
  ['actes', () => ruleActs([fake('pin.x', 'en', 'Needs {act}'), fake('pin.x', 'ar', 'يلزم {act}')], fakeKeys({ 'act.refund': { en: ['Refund'], fr: ['Remboursement'], ar: ['أعد المبلغ'] } }), {}, { 'act.close_till': { en: 'a', fr: 'b', ar: 'c' }, 'count.close': { en: 'a', fr: 'b', ar: 'c' } }).length >= 5],
  ['entrées', () => ruleEntries(fakeKeys({ 'act.new': {} }), {}, new Set()).length === 2],
];
for (const [name, fn] of neg) {
  if (fn()) console.log(`  ✓ contre-exemple « ${name} » : la règle s'allume`);
  else { failures++; console.log(`  ✗ contre-exemple « ${name} » : la règle ne voit pas la faute`); }
}

if (failures) { console.log(`\n✗ ${failures} constat(s)`); process.exit(1); }
console.log('\n✓ strings-lint propre');
