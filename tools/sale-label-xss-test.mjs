#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* ═════════════════════════════════════════════════════════════════
 * Kiwi · le libellé d'une vente et la réf d'un remboursement ne sont pas du HTML.
 *
 *   node tools/sale-label-xss-test.mjs
 *
 * POST /api/sale range `label` (et `ref`, pour un remboursement) tels quels, 80
 * caractères, depuis n'importe quelle caisse ou n'importe quel employé. Le
 * tableau de bord les posait ensuite dans innerHTML : la ligne du flux
 * (dateRange.js › renderFeed) et le tiroir d'une commande (interactive.js ›
 * open-order). Un libellé `<img src=x onerror=…>` s'exécutait dans la session du
 * patron. Idem pour le nom du commerce dans l'aperçu fidélité (features.js), que
 * l'inscription ne filtrait pas non plus (functions/auth/signup.js).
 *
 * Le banc EXÉCUTE les gabarits livrés (extraits des fichiers, pas recopiés) avec
 * une charge hostile et exige qu'aucune balise vivante n'en sorte.
 * ═════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => coreTestSource.readFileSync(path.join(ROOT, f), 'utf8');
const DR = read('assets/dateRange.js');
const IA = read('assets/interactive.js');
const FE = read('assets/features.js');
const SU = read('functions/auth/signup.js');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* Le bloc `{ … }` qui suit `marker`, accolades appariées (chaînes sans accolade). */
function block(src, marker) {
  const i = src.indexOf(marker);
  assert.ok(i >= 0, marker + ' introuvable');
  let d = 0;
  for (let k = src.indexOf('{', i + marker.length - 1); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + marker);
}

const EVIL = '<img src=x onerror="window.__pwn=1">';
const EVIL2 = '"><script>window.__pwn=2</script>';
/* Aucune balise vivante : tout `<` est devenu `&lt;`, tout guillemet `&quot;`. */
const live = (html) => /<(img src=x|script|svg onload|b onmouseover|i id=pwn|img id=pwn)/i.test(html);

/* ── 1 · la ligne du flux ───────────────────────────────────────────────── */
const escLine = DR.match(/const escTxt = \(s\) => String\(s == null \? '' : s\)\n.*\n/);
const mapStart = DR.indexOf('rows.map((r, idx) => {');
const mapEnd = DR.indexOf("}).join('');", mapStart);
ok('le gabarit de ligne du flux est retrouvé dans dateRange.js', () => {
  assert.ok(escLine && mapStart > 0 && mapEnd > mapStart);
});
const feedExpr = DR.slice(mapStart, mapEnd + "}).join('')".length);
const render = (rows) => {
  const fn = new Function('rows', 'window', 'trPay', 'curUnit', escLine[0] + '\nreturn ' + feedExpr + ';');
  const w = { __kiwiFeedOrders: {} };
  return fn(rows, w, (s) => s, () => 'MAD');
};
const baseRow = { t: '12:00', method: 'cash', primary: 'Espèces', sub: '', flag: '', ctx: '', amt: '10,00', neg: false, isNew: false };

ok('flux : le libellé de la vente (ctx) est échappé', () => {
  const html = render([Object.assign({}, baseRow, { ctx: EVIL })]);
  assert.ok(!live(html), html);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;window.__pwn=1&quot;&gt;'));
});
ok('flux : la réf d’un remboursement (sub) est échappée', () => {
  const html = render([Object.assign({}, baseRow, { neg: true, primary: 'Remboursement', sub: EVIL2 })]);
  assert.ok(!live(html), html);
  assert.ok(html.includes('&lt;script&gt;'));
});
ok('flux : client, table, méthode, drapeau et heure sont échappés aussi', () => {
  const html = render([Object.assign({}, baseRow, { customer: EVIL, table: EVIL2, method: '"><b onmouseover=1 x="', flag: '"><i id=pwn', t: EVIL })]);
  assert.ok(!live(html), html);
});
ok('flux : un libellé honnête passe inchangé (& compris)', () => {
  const html = render([Object.assign({}, baseRow, { ctx: 'Camille & Pierre R.' })]);
  assert.ok(html.includes('Camille &amp; Pierre R.'));
});

/* ── 2 · le tiroir d'une commande ───────────────────────────────────────── */
const handlerSrc = block(IA, "'open-order': (el) => {");
function openOrder(o) {
  const captured = [];
  const doc = { documentElement: { lang: 'fr' }, body: { addEventListener() {}, removeEventListener() {} }, querySelector: () => null };
  const win = { __kiwiFeedOrders: { k: o }, KiwiNumber: null };
  const get = new Function('window', 'document', 'kiwiLang', 'drawer', 'handlers', 'toast', 'return ({' + handlerSrc + '})["open-order"];');
  get(win, doc, () => 'fr', (cfg) => captured.push(cfg), {}, () => {}).call(null, { dataset: { orderKey: 'k' } });
  return captured[0];
}
const order = (extra) => Object.assign({
  method: 'cash', primary: 'Espèces', sub: 'Vente', flag: '', t: '12:00', amt: '10,00', receiptNo: 'R1',
  items: [], subtotal: '10,00', tva: '1,00', tvaRate: 10, total: '10,00', saleId: 's1', covers: 1,
}, extra || {});

ok('tiroir : libellé (primary) et réf (sub) d’une vente réelle sont échappés', () => {
  const d = openOrder(order({ primary: EVIL, sub: EVIL2 }));
  assert.ok(d, 'drawer appelé');
  assert.ok(!live(d.body), d.body);
});
ok('tiroir : N° de reçu, serveur, table, article et heure sont échappés', () => {
  const d = openOrder(order({ receiptNo: EVIL, server: EVIL2, table: EVIL, t: '12:00', items: [{ qty: 1, price: 2, name: EVIL }], saleId: '' }));
  assert.ok(!live(d.body), d.body);
});
ok('tiroir : la classe de la pastille ne sort pas de l’attribut', () => {
  const d = openOrder(order({ method: 'cash"><img id=pwn x="', flag: '"><svg onload=1' }));
  assert.ok(!live(d.body), d.body);
});

/* ── 3 · l'aperçu fidélité et l'inscription ─────────────────────────────── */
ok('aperçu fidélité : le nom du commerce est échappé avant le gabarit', () => {
  assert.ok(/const _progRaw = _biz/.test(FE));
  const line = FE.match(/const _prog = String\(_progRaw\)[^\n]*;/);
  assert.ok(line, 'ligne d’échappement');
  assert.ok(/\$\{_prog\}/.test(FE) && !/\$\{_progRaw\}/.test(FE));
  const esc = new Function('_progRaw', line[0] + '\nreturn _prog;');
  const out = esc('· <IMG SRC=X ONERROR=ALERT(1)>');
  assert.ok(!/</.test(out), out);
});
ok('inscription : name et business perdent < et >', () => {
  assert.ok(/const name = String\(body\.name \|\| ''\)\.replace\(\/\[<>\]\/g, ''\)\.trim\(\)/.test(SU));
  assert.ok(/const business = String\(body\.business \|\| ''\)\.replace\(\/\[<>\]\/g, ''\)\.trim\(\)/.test(SU));
});

console.log(`\n${failed ? '✗' : '✓'} sale-label-xss : ${passed} ok, ${failed} en échec`);
process.exit(failed ? 1 : 0);
