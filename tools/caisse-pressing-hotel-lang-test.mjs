#!/usr/bin/env node
// Source coverage for the specialist tills. No browser or network required.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const __dirname = require('path').dirname(require('url').fileURLToPath(import.meta.url));
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── le moteur, chargé tel quel ─────────────────────────────────────────── */
const store = new Map();
const el = () => ({
  style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute() {}, getAttribute: () => null, hasAttribute: () => false,
  appendChild() {}, insertBefore() {}, addEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
});
const document = {
  readyState: 'complete', documentElement: el(), body: el(), head: el(),
  createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }),
};
const window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } };
vm.runInNewContext(read('assets/caisse-lang.js'), {
  window, document, localStorage: window.localStorage,
  MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
  NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 }, WeakMap, setTimeout: () => 0,
}, { filename: 'caisse-lang.js' });
const L = window.KiwiCaisseLang;
let active = 'pressing';
window.KiwiPosDispatch = { current: () => active };
let EN, AR;
function dictionaries(id) { active = id; L.set('en'); EN = { ...L.dict() }; L.set('ar'); AR = { ...L.dict() }; }
dictionaries('pressing');
const tr = (lang, s) => { L.set(lang); const r = L.tr(s); L.set('fr'); return r; };

function jsStrings(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  function readQuoted(q) {
    let s = '';
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') { const c = src[i + 1]; s += c === 'n' ? '\n' : c; i += 2; continue; }
      s += src[i++];
    }
    i++;
    return s;
  }
  function readTemplate() {
    const parts = [];
    let s = '';
    i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        parts.push(s); s = '';
        i += 2;
        let depth = 1;
        while (i < n && depth) {
          const c = src[i];
          if (c === '\'' || c === '"') { out.push(readQuoted(c)); continue; }
          if (c === '`') { readTemplate().forEach((p) => out.push(p)); continue; }
          if (c === '{') depth++;
          else if (c === '}') depth--;
          i++;
        }
        continue;
      }
      s += src[i++];
    }
    i++;
    parts.push(s);
    return parts;
  }
  /* Une expression régulière (`/[&<>"']/g`) porte des guillemets qui ne
     commencent aucune chaîne. Un « / » ouvre une regex quand il suit un
     opérateur ou une ouverture, pas quand il suit une valeur (une division). */
  function regexStarts() {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (j < 0) return true;
    if (/[(,=:[!&|?{};+\-*%<>~^]/.test(src[j])) return true;
    return /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, j - 6), j + 1));
  }
  function skipRegex() {
    let inClass = false;
    i++;
    while (i < n && src[i] !== '\n') {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { i++; break; }
      i++;
    }
    while (i < n && /[a-z]/.test(src[i])) i++;      // drapeaux
  }
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && regexStarts()) { skipRegex(); continue; }
    if (c === '\'' || c === '"') { out.push(readQuoted(c)); continue; }
    if (c === '`') { readTemplate().forEach((p) => out.push(p)); continue; }
    i++;
  }
  return out;
}

/* Ce qu'un humain lit dans une chaîne : le texte entre les balises, et les
   attributs qui se lisent (aria-label, placeholder, title). */
function visibleText(lit) {
  const bits = [];
  lit.replace(/(?:aria-label|placeholder|title)="([^"]*)"/g, (_, v) => { bits.push(v); return ''; });
  let s = lit.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
  const gt = s.indexOf('>'), lt = s.indexOf('<');
  if (gt >= 0 && (lt < 0 || gt < lt)) s = s.slice(gt + 1);           // commence au milieu d'une balise
  s.split(/<[^>]*(?:>|$)/).forEach((t) => bits.push(t));
  return bits;
}

/* Ce qu'on retire autour d'un morceau : la ponctuation de couture. Une
   parenthèse OUVRANTE en fin de morceau (« Ticket test envoyé ( ») ou fermante en
   tête appartient à la concaténation ; une parenthèse entière, au texte. */
const PUNCT = /^[\s·:«»+)\-–]+|[\s·:«»+(\-–]+$/g;
function fragments(lits) {
  const out = [];
  lits.forEach((lit) => visibleText(lit).forEach((t) => {
    t.split(' · ').forEach((piece) => {
      const f = piece.replace(/&nbsp;/g, ' ').replace(PUNCT, '').trim();
      if (f.length < 2) return;
      if (f === 'use strict' || f === 'Content-Type' || ['MAD', 'POST', 'NFD', 'SEC', 'LAV', 'REP', 'DET', 'RET', 'FP', 'PRO', 'RY'].includes(f) || /^[Mm][\d-].*[qQzZ]/.test(f) || /^\.[a-z-]/.test(f)) return;
      if (!/[a-zà-ÿœ]/i.test(f)) return;                         // TEST CAISSE, POST, #TEST
      if (!/\s/.test(f) && !/^[A-ZÀ-ÝŒ]/.test(f)) return;       // identifiants : none, block, kpr-status
      if (/^(kpr-|data-|aria-)|[{}#;]|https?:|^\/|\.js\b|\.json\b/.test(f) || (f.includes('=') && !f.includes(' = '))) return;
      out.push(f);
    });
  }));
  return Array.from(new Set(out));
}


// Protocol verbs, Unicode normalisation and persisted receipt/service codes
// above are syntax/data identifiers, rather than interface copy.
const NOT_UI = new Map([
  ['A-04', 'Demo storage slot identifier'], ['B-07', 'Demo storage slot identifier'],
  ['05 39 94 XX XX', 'Demo venue phone number'],
]);
["Pressing Marshan", "Tanger", "Marshan", "Rue Assad Ibn Al Fourat, Tanger", "Riad Yasmina", "Kasbah", "7, Rue de la Kasbah, Tanger", "Booking.com", "Airbnb", "Ibn Battouta", "Chambre Patio", "Confort Médina", "Suite Yasmina"].forEach(s => NOT_UI.set(s, "Brand or demo venue/location"));
["Amal Berrada", "Youssef El Khattabi", "Hôtel Bab El Bahr", "Mme Rkia", "Fatima-Zahra Lamrani", "Mehdi Bennani", "Khadija Tazi", "Omar Sefrioui", "Naima Bouziane", "Fatiha Zerouali", "Hind & Omar Bennani", "Karim Bennis", "Ahmed & Leila El Fassi", "Awa Diallo", "Sophie Marceau", "Famille Rossi", "Marta & Diego Gómez", "Lucía Marín", "Claire Dubois"].forEach(s => NOT_UI.set(s, "Demo customer identity"));
["Repassage sur cintre", "Sans amidon", "Costumes pliés en housse", "Remise –15 % négociée", "Gouvernante", "Caftans, nettoyage main", "Pas de perchlo (allergie)", "Rideaux par panneau", "10 chemises chaque lundi", "Lot du lundi", "Col élimé", "Sfifa fragile, nettoyage main", "Salon, 4 panneaux", "Départ 12h00, en retard", "Lucía Marín arrive 18h30", "Réservée ce soir, Marta & Diego Gómez", "Allergie arachide, cuisine prévenue", "Ménage en cours, Famille Rossi arrive 15h30", "Airbnb, nuitées", "Étage terrasse, petit-déjeuner 8h30", "Fuite SDB, plombier vendredi", "Lit bébé demandé, 2 adultes, 2 enfants", "Client fidèle ×2", "thé sans sucre", "Étage calme demandé", "ce matin 09h20", "j2 20h45", "j1 14h50", "j2 23h10"].forEach(s => NOT_UI.set(s, "Demo merchant note, stored as free text"));

const files = ['pressing-caisse', 'pressing-catalog', 'pressing-ops', 'pos-hotel'];
const placeholders = s => (s.match(/\{[nx]\}/g) || []).sort().join(',');
let failed = 0;
for (const name of files) {
  dictionaries(name === 'pos-hotel' ? 'hotel' : 'pressing');
  const source = read('assets/' + name + '.js');
  const propertyLabels = [...source.matchAll(/\b(?:label|short|sub|flag):\s*(['"])(.*?)\1/g)].map(m => m[2]);
  const phrases = [...new Set(fragments(jsStrings(source)).concat(propertyLabels.flatMap(visibleText).flatMap(s => s.split(' · ')).map(s => s.trim()).filter(s => /[a-zà-ÿœ]/i.test(s) && s !== 'MAD')))].filter(f => !NOT_UI.has(f));
  const missing = phrases.filter(f => !covered(f));
  console.log(`${name}: ${phrases.length} interface fragments, ${missing.length} missing`);
  if (missing.length) { console.error(JSON.stringify(missing, null, 2)); failed++; }
}
function covered(f) {
  const num = /\d[\d\s\u202f\u00a0.,]*\d|\d/g;
  const clean = s => s.replace(/[«»]/g, '').replace(/\s+/g, ' ').trim();
  const candidates = [f, clean(f), f.replace(num, '{n}'), clean(f.replace(num, '{n}'))];
  L.set('en'); const en = L.tr(f); L.set('ar'); const ar = L.tr(f);
  if (en !== f && ar !== f) return true;
  const exact = Object.keys(EN).some(k => AR[k] && candidates.some(c => clean(k) === clean(c)));
  if (!/\s/.test(f)) return exact;
  return exact || Object.keys(EN).some(k => AR[k] && /\{[nx]\}/.test(k)
    && candidates.some(c => clean(k).includes(clean(c))));
}

for (const id of ['pressing', 'hotel']) {
  dictionaries(id);
for (const k of Object.keys(EN)) {
  if (!AR[k] || placeholders(k) !== placeholders(EN[k]) || placeholders(k) !== placeholders(AR[k])) {
    console.error('Missing language or mismatched placeholders:', k); failed++;
  }
  if ([k, EN[k], AR[k]].some(s => /\u2014/.test(s))) { console.error('Em dash:', k); failed++; }
}
}
// Exercise the real engine with rendered values, rather than accepting a
// dictionary key that cannot match an interpolated label at runtime.
const specialistSource = read('assets/caisse-lang.js').split('  /* Pressing till:')[1].split('  /* ───────────────────────── état')[0];
const rows = [...specialistSource.matchAll(/^      ("(?:[^"\\]|\\.)*"): (\[[^\n]*\]),$/gm)]
  .map(m => [JSON.parse(m[1]), JSON.parse(m[2])]);
for (const id of ['pressing', 'hotel']) {
  dictionaries(id);
  for (const [key] of rows) {
    if (!/\{[nx]\}/.test(key) || !EN[key] || !AR[key]) continue;
    const sample = s => s.replace(/\{n\}/g, '23').replace(/\{x\}/g, 'Amina');
    for (const lang of ['en', 'ar']) {
      L.set(lang);
      const expected = sample((lang === 'en' ? EN : AR)[key]);
      const actual = L.tr(sample(key));
      if (actual !== expected) { console.error('Runtime template:', id, lang, key, JSON.stringify(actual), 'expected', JSON.stringify(expected)); failed++; }
    }
  }
}
// Merchant-entered labels that collide with dictionary keys remain data.
const catalogueWindow = { addEventListener() {} };
vm.runInNewContext(read('assets/pressing-catalog.js'), { window: catalogueWindow });
const catalogue = catalogueWindow.KiwiPressingCatalog;
if (catalogue.labelHTML({ id: 'custom', label: 'Total' }) !== '<span data-nolang>Total</span>'
    || catalogue.labelHTML({ id: 'chemise', label: 'Chemise' }) !== 'Chemise'
    || !catalogue.labelHTML({ id: 'custom', label: '<Total>' }).includes('&lt;Total&gt;')) {
  console.error('Merchant labels must be escaped and excluded from the sweep'); failed++;
}
// Render sweep: built-in labels translate; customer data, amounts and codes
// retain their contents; changing back to French restores the original text.
active = 'pressing';
const textNode = (value, data = false) => ({ nodeType: 3, nodeValue: value,
  parentElement: { nodeType: 1, tagName: 'SPAN', parentElement: null,
    hasAttribute: name => data && name === 'data-nolang' } });
const garment = textNode('Chemise'), merchant = textNode('Total', true);
const amount = textNode('120 MAD'), ticket = textNode('PX-1054', true);
document.createTreeWalker = () => {
  const nodes = [garment, merchant, amount, ticket]; let at = 0;
  return { nextNode: () => nodes[at++] || null };
};
for (const [lang, label, money] of [['en', 'Shirt', '120 MAD'], ['ar', 'قميص', '\u2066120 MAD\u2069'], ['fr', 'Chemise', '120 MAD']]) {
  L.set(lang); L.apply();
  if (garment.nodeValue !== label || amount.nodeValue !== money || merchant.nodeValue !== 'Total' || ticket.nodeValue !== 'PX-1054') {
    console.error('Render sweep changed merchant data or failed language round trip:', lang); failed++;
  }
}
active = null;
L.set('en');
if (L.tr('Caftan Fassi · Vert · M, stock insuffisant') !== 'Caftan Fassi · Vert · M, not enough stock') {
  console.error('Specialist colour vocabulary leaked into boutique merchant data'); failed++;
}
if (failed) process.exitCode = 1;
else console.log('Pressing and hotel source coverage passed in EN and AR.');
