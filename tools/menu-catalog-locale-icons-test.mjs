import menuCatalogSource from './menu-catalog-test-source.cjs';
/* Carte · nombres de la langue choisie, icônes Material, sélecteurs accessibles.
 *
 * r20 : fmt() ne connaissait que ar-MA et fr-FR (l'anglais lisait « 15 765,38 »,
 * l'arabe « 15.765,38 », ni l'un ni l'autre la règle du tableau de bord) ; les
 * icônes PLUS, EDIT, DOWNLOAD, TRASH, SPARK, BELL étaient dessinées à la main ;
 * le supplément d'un choix avançait par pas de 1 dirham alors que la carte garde
 * les centimes ; les boutons « un seul » / « plusieurs » ne disaient leur état
 * qu'avec une classe. Ce banc exécute le vrai code. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = menuCatalogSource();
const cut = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error('repère : ' + from); return src.slice(a, b); };
let lang = 'fr';
const window = { KiwiI18n: { getLang: () => lang } };
const ctx = vm.createContext({ window, Number, String, Math, Intl });
vm.runInContext([
  cut("  const LANG = () =>", "  const tr = "),
  cut("  const PLUS = ", "  /* ───────────────── UI state"),
  cut("  const fmt = (n)", "  function venueName"),
  'globalThis.out = { fmt, fmtPct, icons: { PLUS, EDIT, DOWNLOAD, TRASH, SPARK, LIST, BELL, ARR_UP, ARR_DN } };',
].join('\n'), ctx);
const { fmt, fmtPct, icons } = ctx.out;
const flat = (s) => String(s).replace(/[  ]/g, ' ');

for (const [l, want] of [['fr', '15 765,38'], ['en', '15,765.38'], ['ar', '15 765,38']]) {
  lang = l;
  assert.equal(flat(fmt(15765.38)), want, l + ' : montant');
  assert.equal(flat(fmtPct(71.88)), l === 'en' ? '71.9' : '71,9', l + ' : marge à une décimale');
}

/* Icônes : le tracé est celui du fichier vendored, rien d'autre. */
const glyph = (name) => /<path d="([^"]*)"/.exec(fs.readFileSync(path.join(ROOT, 'assets/icons/material', name + '.svg'), 'utf8'))[1];
const table = { PLUS: 'add', EDIT: 'edit', DOWNLOAD: 'download', TRASH: 'delete', SPARK: 'auto_awesome', LIST: 'list', BELL: 'notifications', ARR_UP: 'arrow_upward', ARR_DN: 'arrow_downward' };
for (const [k, name] of Object.entries(table)) {
  const svg = icons[k];
  assert.ok(svg.includes('viewBox="0 -960 960 960"') && svg.includes('fill="currentColor"'), k + ' : forme Material');
  assert.ok(!/stroke/.test(svg), k + ' : aucun trait dessiné à la main');
  assert.equal(/<path d="([^"]*)"/.exec(svg)[1], glyph(name), k + ' : tracé de ' + name + '.svg octet pour octet');
}

/* Modificateurs : le vrai optsModal, avec un faux DOM. */
const modifiers = fs.readFileSync(path.join(ROOT, 'assets/menu-catalog/modifiers.js'), 'utf8');
const parts = {}, noop = () => {};
const state = [{ id: 'g1', name: 'Sauces', kind: 'one', required: false, choices: [{ id: 'c1', name: 'Harissa', price: 2.5, emoji: '' }] }];
const body = { innerHTML: '', handlers: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener(n, fn) { this.handlers[n] = fn; } };
const modal = { el: { querySelector: (s) => (s === '[data-og-body]' ? body : { addEventListener() {} }), addEventListener() {} }, close() {} };
new Function('window', modifiers)({ KiwiMenuCatalogParts: parts, Kiwi: { modal: () => modal } });
parts.modifiers({ store: { get: () => state }, optsOf: (d) => d, optById: (d, id) => d.find((g) => g.id === id), tr: (o) => (o && (o.fr || o)) || '', T: new Proxy({}, { get: (_, k) => ({ fr: String(k) }) }), esc: (v) => String(v == null ? '' : v),
  venueName: () => 'Test', PLUS: '+', TRASH: 'x', OPT_EMOJIS: [], cleanOptEmoji: (v) => v, addOptGroup: noop, updateOptGroup: (id, patch) => Object.assign(state.find((g) => g.id === id), patch), deleteOptGroup: noop, addOptChoice: noop, updateOptChoice: noop, deleteOptChoice: noop, confirmThen: noop, render: noop }).optsModal();
assert.match(body.innerHTML, /data-oc-price="g1::c1"/);
const price = /<input[^>]*data-oc-price[^>]*>/.exec(body.innerHTML)[0];
assert.match(price, /step="0\.01"/, 'le supplément avance au centime');
assert.match(price, /value="2\.5"/);
const kinds = () => [...body.innerHTML.matchAll(/<button[^>]*data-og-kind="g1::(one|many)"[^>]*>/g)].map((m) => [m[1], /aria-pressed="(true|false)"/.exec(m[0])?.[1], /class="on"/.test(m[0])]);
assert.deepEqual(kinds(), [['one', 'true', true], ['many', 'false', false]], 'état annoncé : « un seul » pressé');
const btn = { dataset: { ogKind: 'g1::many' } };
body.handlers.click({ target: { closest: (s) => (s === '[data-og-kind]' ? btn : null), dataset: {} } });
assert.equal(state[0].kind, 'many');
assert.deepEqual(kinds(), [['one', 'false', false], ['many', 'true', true]], 'après le clic, « plusieurs » est pressé et « un seul » ne l’est plus');
console.log('✓ menu catalogue: locale numbers, vendored Material icons, centime step, aria-pressed selectors');
