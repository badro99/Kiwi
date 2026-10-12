#!/usr/bin/env node
/* « Souvent pris ensemble » : des paires que les tickets réels réunissent,
 * jamais un hasard présenté comme une règle.
 *
 * On extrait du VRAI assets/dateRange.js realPairs et renderPairs, et on les
 * exécute sur un journal de ventes fabriqué. Le seuil (20 tickets à plusieurs
 * articles, 5 tickets par paire) et la preuve affichée sont ce que ce test
 * défend : en dessous, la carte dit combien il en manque, elle n'invente pas. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');
const DASH = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
let failures = 0, passed = 0;
const check = (label, ok, detail) => { if (ok) { passed++; console.log('  ✓ ' + label); } else { failures++; console.log('  ✗ ' + label + (detail ? '\n      ' + detail : '')); } };

console.log('■ Souvent pris ensemble (tools/basket-pairs-test.mjs)');
const i = SRC.indexOf('  const PAIRS_MIN_BASKETS = 20'), j = SRC.indexOf('  const STAFF_ONDUTY_STR = {', i);
check('realPairs and renderPairs are extractable', i > 0 && j > i);
if (failures) process.exit(1);

const FROM = 1_000_000, TO = 2_000_000;
function make(sales) {
  const ctx = vm.createContext({
    Map, Set, Math, String, Number, Array, Object,
    currentRange: 'septJours', rangeBounds: () => [FROM, TO], realSalesList: () => sales,
    escTxt: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    frInt: (n) => String(Math.round(n)),
  });
  vm.runInContext(SRC.slice(i, j) + '\nthis.realPairs = realPairs; this.renderPairs = renderPairs; this.MIN = PAIRS_MIN_BASKETS;', ctx);
  return ctx;
}
const line = (itemId, name, qty = 1) => ({ itemId, name, qty, total: 10 * qty });
let t = FROM + 1;
const sale = (...lines) => ({ ts: t++, amount: 10, lines });
const THE = () => line('it_6', 'Thé à la menthe'), MSEMEN = () => line('it_9', 'Msemen miel'),
  CAFE = () => line('it_7', 'Café noir'), JUS = () => line('it_8', 'Orange pressée'), HARIRA = () => line('it_2', 'Harira');

/* 24 tickets à plusieurs articles : thé + msemen 9 fois, café + jus 6 fois,
   harira + thé 4 fois (sous le seuil), plus 5 tickets d'un seul msemen. */
const book = [];
for (let k = 0; k < 9; k++) book.push(sale(THE(), MSEMEN()));
for (let k = 0; k < 6; k++) book.push(sale(CAFE(), JUS(), { ...CAFE(), name: 'Café noir (double)' }));
for (let k = 0; k < 4; k++) book.push(sale(HARIRA(), THE()));
for (let k = 0; k < 5; k++) book.push(sale(CAFE(), HARIRA()));
for (let k = 0; k < 5; k++) book.push(sale(MSEMEN()));
book.push({ ts: FROM - 5, lines: [THE(), MSEMEN()] });             // avant la période
book.push({ ts: TO, lines: [THE(), MSEMEN()] });                   // fin exclue
book.push({ ts: t++, amount: 50, lines: null });                   // vente sans détail
book.push({ ts: t++, lines: [null, { name: '', qty: 1 }, { itemId: 'x', name: 'Rendu', qty: 0 }, THE(), MSEMEN()] }); // lignes vides ignorées : 10e thé + msemen

const ctx = make(book);
const p = ctx.realPairs();
check('multi-item tickets in the period: 25', p.baskets === 25, JSON.stringify(p.baskets));
check('three pairs at most, the most frequent first', p.rows.length === 3 && p.rows[0].together === 10, JSON.stringify(p.rows));
const tm = p.rows[0];
check('Thé + Msemen: 10 tickets, led by the less-sold item', tm && tm.lead === 'Thé à la menthe' && tm.other === 'Msemen miel', JSON.stringify(tm));
check('its share = 10 of the 14 tickets with thé', tm && Math.round(tm.share * 100) === 71, String(tm && tm.share));
const cj = p.rows.find((r) => /Orange/.test(r.lead + r.other));
check('the same item under an option name counts once per ticket (café + jus = 6)', cj && cj.together === 6, JSON.stringify(cj));
check('a pair seen 4 times is not shown (Harira + Thé)', !p.rows.some((r) => /Harira/.test(r.lead + r.other) && /Thé/.test(r.lead + r.other)));
check('5 times is enough (Café + Harira)', p.rows.some((r) => /Harira/.test(r.lead + r.other) && /Café/.test(r.lead + r.other)));

const few = make(book.slice(0, 12)).realPairs();
check('below 20 multi-item tickets: no pair, whatever the counts', few.rows.length === 0 && few.baskets === 12, JSON.stringify(few));

function render(sales, lang = 'fr', isCustom = true) {
  const c = make(sales);
  const host = { hidden: true, innerHTML: '', replaceChildren() { this.innerHTML = ''; } };
  c.renderPairs({ querySelector: () => host }, isCustom, lang);
  return host;
}
const shown = render(book);
check('the card shows the pairs with their evidence', !shown.hidden && /Souvent pris ensemble/.test(shown.innerHTML)
  && /10 tickets · 71 % des tickets avec Thé à la menthe/.test(shown.innerHTML), shown.innerHTML.slice(0, 300));
const waiting = render(book.slice(0, 12));
check('below the threshold it says how many tickets it has and needs', !waiting.hidden && /à partir de 20 tickets/.test(waiting.innerHTML) && /\(12 pour l’instant\)/.test(waiting.innerHTML), waiting.innerHTML);
const flat = [];
for (let k = 0; k < 22; k++) flat.push(sale(line('a' + k, 'A' + k), line('b' + k, 'B' + k)));
const none = render(flat);
check('enough tickets but no repeated pair: it says so', /Aucune paire ne revient encore/.test(none.innerHTML), none.innerHTML);
check('no detailed ticket at all: the strip stays hidden', render([{ ts: t++, lines: null }]).hidden === true);
check('the demo shows nothing it did not measure', render(book, 'fr', false).hidden === true);
const xss = [];
for (let k = 0; k < 20; k++) xss.push(sale(line('p', '<img src=x onerror=alert(1)>'), line('q', 'Q & "R"')));
check('item names are escaped', !/<img/.test(render(xss).innerHTML) && /&lt;img/.test(render(xss).innerHTML));
check('English and Arabic speak too', /Often bought together/.test(render(book, 'en').innerHTML) && /يُشترى معاً غالباً/.test(render(book, 'ar').innerHTML));

console.log('\n■ Wiring');
check('the products card has the strip, hidden until it has something', /<div class="prod-pairs" data-products-pairs hidden><\/div>/.test(DASH));
check('renderProducts paints it on every repaint', /try \{ renderPairs\(card, isCustom, lang\); \} catch/.test(SRC));
check('no em dash in what the strip says', !/—/.test(SRC.slice(SRC.indexOf('const PAIRS_STR'), j)));

console.log(failures ? `\n✗ ${failures} check(s) failed` : `\n✓ ${passed} basket-pair checks green`);
process.exit(failures ? 1 : 0);
