#!/usr/bin/env node
/* « Analyse du menu » · phase 2 : les ventes par catégorie et par article.
 *
 * Ce que ce fichier tient, sur les vrais fichiers (day-report.js, cost.js,
 * restaurant-menu-workspace.js, finance.js) :
 *   1. Le même registre que la Performance : brut, net, annulée, doublon et
 *      remboursement donnent les mêmes chiffres dans les deux onglets.
 *   2. Six périodes, en journées commerciales : une vente à 04 h 59 le 1er
 *      appartient au mois précédent ; « Hier » ne contient pas aujourd'hui.
 *   3. Par catégorie et par article : encaissé TTC après remise répartie,
 *      parts sur les lignes d'articles, hors carte et montant libre à part.
 *   4. Une formule garde son prix ; ses composants comptent en quantité.
 *   5. États : vide, hors ligne, registre absent (erreur), sans coût ni
 *      profit affiché ; la période choisie est retenue.
 *   6. FR / EN / AR. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* Les ventes de banc sont datées de 05:00:01 à 05:05:01 de la journée
 * commerciale en cours : dans les dix premières minutes après la coupure de
 * 05:00 elles seraient encore dans le futur, et la suite échouait chaque
 * matin à cette heure-là. Le bac à sable lit alors l'horloge dix minutes
 * plus tard ; le reste du temps, elle est intacte. */
const benchShift = (() => {
  const d = new Date();
  const since = ((d.getHours() + 19) % 24) * 3600e3 + d.getMinutes() * 60e3 + d.getSeconds() * 1e3 + d.getMilliseconds();
  return since < 600e3 ? 600e3 - since : 0;
})();
class BenchDate extends Date {
  constructor(...args) { if (args.length) super(...args); else super(Date.now() + benchShift); }
  static now() { return Date.now() + benchShift; }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { loadCost } = require('./kiwi-cost-harness.js');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra != null ? '\n      ' + String(extra).slice(0, 500) : '')); }
};
console.log('■ Ventes par catégorie et par article (tools/menu-sales-test.mjs)');

const noop = () => {};
const roots = { fin: { innerHTML: '' }, menu: { hidden: true, innerHTML: '' }, bc: { innerHTML: '' } };
const el = () => ({ classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, removeAttribute: noop,
  appendChild: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: '', style: {}, dataset: {} });
const document = { readyState: 'complete', body: el(), documentElement: el(), head: el(), addEventListener: noop, createElement: el, getElementById: () => null,
  querySelector: (s) => (s === '[data-finance-root]' ? roots.fin : s === '[data-menu-root]' ? roots.menu : s === '.breadcrumb' ? roots.bc : null), querySelectorAll: () => [] };
const items = [
  { id: 'tajine', name: 'Tajine', price: 110, catId: 'plats', avail: true },
  { id: 'the', name: 'Thé', price: 22, catId: 'boissons', avail: true },
  { id: 'salade', name: 'Salade', price: 33, catId: 'plats', avail: true },
  { id: 'menu', name: 'Menu midi', price: 60, catId: 'formules', avail: true, formula: { slots: [] } },
  { id: 'couscous', name: 'Couscous', price: 90, catId: 'plats', avail: true },      // jamais vendu
  { id: 'ancien', name: 'Ancien plat', price: 50, catId: 'plats', archived: true },  // archivé : pas « sans vente »
];
const data = { cats: [{ id: 'plats', name: 'Plats' }, { id: 'boissons', name: 'Boissons' }, { id: 'formules', name: 'Formules' }], items, stations: [], opts: [] };
const mem = new Map();
let lang = 'fr';
const nav = { onLine: true };
const win = {
  Kiwi: { handlers: {}, toast: noop, setActivePage: noop, pageShell: noop, modal: noop },
  KiwiVenue: { getVenue: () => 'resto', getVenueData: () => ({ name: 'Resto' }), getCurrentVenueData: () => ({ id: 'resto', name: 'Resto', type: 'restaurant' }), getVenueType: () => 'restaurant', isCustom: () => true, subscribe: noop },
  KiwiEnv: { isReal: () => true, demosAllowed: false },
  KiwiI18n: { getLang: () => lang },
  KiwiMenuStore: { data: () => data, items: () => items, subscribe: noop, kitchenId: () => '' },
  KiwiSales: { list: () => salesRows, subscribe: noop },
  KiwiRefunds: { list: () => refundRows },
  KiwiLive: { status: () => ({ backfillComplete: true }) },
  KiwiRestaurantRecipes: { get: () => null, metrics: () => ({ costComplete: false }), subscribe: noop },
  addEventListener: noop, setTimeout, clearTimeout, console, scrollTo: noop,
};
win.window = win;
let salesRows = [], refundRows = [];
const localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
win.localStorage = localStorage;
win.navigator = nav;
document.documentElement.lang = 'fr';
const ctx = vm.createContext({ Date: BenchDate, window: win, Kiwi: win.Kiwi, document, console, setTimeout, clearTimeout, localStorage, navigator: nav, Intl, requestAnimationFrame: (fn) => fn(), innerWidth: 1400, innerHeight: 900 });
vm.runInContext(R('assets/day-report.js'), ctx, { filename: 'day-report.js' });
const DR = win.KiwiDayReport;
win.KiwiDateRange = { bounds: (p) => { const d = p === 'trenteJours' ? 30 : p === 'septJours' ? 7 : 1; return [DR.dayBounds(DR.shiftDay(DR.today(), -(d - 1))).from, Infinity]; } };
loadCost(ctx, { vat: { mode: 'rate', rate: 10, included: true }, costs: { items: {}, recipes: {}, ingredients: [], charges: [], targets: {} } });
vm.runInContext(R('assets/restaurant-menu-workspace.js'), ctx, { filename: 'restaurant-menu-workspace.js' });
vm.runInContext(R('assets/finance.js'), ctx, { filename: 'finance.js' });
const A = win.KiwiRestaurantMenuWorkspace.analysis;
const H = win.Kiwi.handlers;

const today = DR.today();
const start = DR.dayBounds(today).from + 1000;
const twoDaysAgo = DR.dayBounds(DR.shiftDay(today, -2)).from + 3600e3;
const firstThis = today.slice(0, 8) + '01';
const lastOfPrev = DR.shiftDay(firstThis, -1);
const before5hOnThe1st = DR.dayBounds(firstThis).from - 60e3;    // 04 h 59 le 1er : journée du dernier jour du mois précédent
const L = (id, name, qty, total, extra) => ({ itemId: id, name, qty, total, ...(extra || {}) });
salesRows = [
  { saleId: 's1', ts: start, amount: 264, lines: [L('tajine', 'Tajine', 2, 220), L('the', 'Thé', 2, 44)] },
  { saleId: 's2', ts: start + 60e3, amount: 99, lines: [L('tajine', 'Tajine', 1, 110)] },                       // remise 11
  { saleId: 's3', ts: start + 120e3, amount: 33, lines: [L('salade', 'Salade', 1, 33)] },
  { saleId: 's1', ts: start, amount: 264, lines: [L('tajine', 'Tajine', 2, 220), L('the', 'Thé', 2, 44)] },      // même id
  { saleId: 's4', ts: start + 180e3, amount: 110, void_ts: start + 200e3, lines: [L('tajine', 'Tajine', 1, 110)] },
  { saleId: 's5', ts: start + 240e3, amount: 22, lines: [L('the', 'Thé', 1, 22)] },
];
refundRows = [{ saleId: 'r1', ts: start + 300e3, amount: 22 }];
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const open = (k) => { win.KiwiFinance.open(k); return roots.fin.innerHTML; };

/* ── 1 · le même registre que la Performance ── */
win.Kiwi.handlers['nav-finance']();
const perf = open('performance');
mem.delete('kiwiMenuSalesPeriod');
let html = open('sales');
ok(/data-fin-tab-open="sales"/.test(html) && /data-sales-state="ready"/.test(html), 'l’onglet Ventes s’ouvre par KiwiFinance.open("sales")', html.slice(0, 300));
const g = (h) => (h.match(/data-ledger-gross="([^"]+)"/) || [])[1], n = (h) => (h.match(/data-ledger-net="([^"]+)"/) || [])[1];
ok(g(html) === '418.00' && n(html) === '396.00' && g(html) === g(perf) && n(html) === n(perf), 'Ventes et Performance : même brut (418) et même net (396) sur 30 journées', `${g(html)}/${n(html)} vs ${g(perf)}/${n(perf)}`);
ok(/Ticket moyen[^<]*<\/span><b>104,5(0)? MAD/.test(html), 'ticket moyen = brut ÷ tickets (418 ÷ 4)', (text(html).match(/Ticket moyen.{0,40}/) || [])[0]);

/* ── 2 · six périodes en journées commerciales ── */
const pills = html.match(/data-action="rmw-sales-period" data-period="[a-zA-Z0-9]+"/g) || [];
ok(pills.map((p) => p.split('"').slice(-2)[0]).join() === 'today,yesterday,d7,d30,month,lastMonth', 'six périodes : aujourd’hui, hier, 7 j, 30 j, ce mois-ci, mois dernier', pills.join(' '));
ok(/class="mi-pill-row rmw-sales-pills" role="tablist"/.test(html) && /class="mi-pill on"[^>]*data-period="d30"/.test(html), 'les périodes passent par .mi-pill-row (lentille liquide) ; 30 jours par défaut');
const from = +(html.match(/data-sales-from="(\d+)"/) || [])[1], to = +(html.match(/data-sales-to="(\d+)"/) || [])[1];
ok(from === DR.dayBounds(DR.shiftDay(today, -29)).from && to <= DR.dayBounds(today).to, '30 jours = 30 journées commerciales, bornes du rapport journalier', `${from} ${to}`);

H['rmw-sales-period']({ dataset: { period: 'yesterday' } });
html = roots.fin.innerHTML;
ok(mem.get('kiwiMenuSalesPeriod') === 'yesterday', 'la période choisie est retenue (kiwiMenuSalesPeriod)');
ok(/data-sales-state="empty"/.test(html) && /Aucune vente sur cette période/.test(html), 'Hier sans vente : état vide nommé, pas de tableau à zéro', text(html).slice(0, 300));
ok(/journée commerciale/.test(text(html)), 'une période d’un jour est datée et dite « journée commerciale »');
H['rmw-sales-period']({ dataset: { period: 'nope' } });
ok(mem.get('kiwiMenuSalesPeriod') === 'yesterday', 'une période inconnue est refusée');

salesRows.push(
  { saleId: 'p1', ts: twoDaysAgo, amount: 33, lines: [L('salade', 'Salade', 1, 33)] },
  { saleId: 'm1', ts: before5hOnThe1st, amount: 22, lines: [L('the', 'Thé', 1, 22)] },
);
const winOf = (k) => { H['rmw-sales-period']({ dataset: { period: k } }); const h = roots.fin.innerHTML; return { h, gross: +g(h) || 0 }; };
const t0 = winOf('today'), d7 = winOf('d7'), mo = winOf('month'), lm = winOf('lastMonth');
ok(t0.gross === 418 && d7.gross === 418 + 33 + (before5hOnThe1st >= DR.dayBounds(DR.shiftDay(today, -6)).from ? 22 : 0), 'aujourd’hui exclut l’avant-veille ; 7 jours l’inclut', `${t0.gross} / ${d7.gross}`);
ok(!(lm.gross === 0) && lm.gross >= 22 && mo.gross === 418 + (DR.shiftDay(today, -2) >= firstThis ? 33 : 0), '04 h 59 le 1er : vente du mois précédent, pas de ce mois-ci', `month ${mo.gross} · lastMonth ${lm.gross}`);
ok(new RegExp(`data-sales-from="${DR.dayBounds(lastOfPrev.slice(0, 8) + '01').from}"`).test(lm.h) && new RegExp(`data-sales-to="${DR.dayBounds(firstThis).from}"`).test(lm.h), 'Mois dernier = du 1er à 5 h au 1er suivant à 5 h, mois civil entier');
salesRows = salesRows.filter((s) => s.saleId !== 'p1' && s.saleId !== 'm1');

/* ── 3 · par catégorie et par article ── */
salesRows.push(
  { saleId: 'f1', ts: start + 400e3, amount: 60, lines: [L('menu', 'Menu midi', 1, 60, { kind: 'formula', formulaUid: 'u1' }), L('the', 'Thé', 1, 0, { kind: 'formula-part', formulaUid: 'u1' })] },
  { saleId: 'o1', ts: start + 500e3, amount: 25, lines: [L('', 'Plat du jour', 1, 15), L('libre', 'Article libre', 1, 10)] },
);
H['rmw-sales-period']({ dataset: { period: 'd30' } });
html = roots.fin.innerHTML;
const t = text(html);
const catRow = (key) => (html.match(new RegExp(`data-sales-cat="${key}">([\\s\\S]*?)</tr>`)) || [])[1] || '';
ok(/319(,00)? MAD/.test(text(html.match(/<tr[^>]*><td><b>Tajine[\s\S]*?<\/tr>/)?.[0] || '')), 'Tajine : 220 + 99 encaissés (la remise de 11 reste sur son ticket)');
ok(/352(,00)? MAD/.test(text(catRow('c:plats'))) && /66(,00)? MAD/.test(text(catRow('c:boissons'))) && /60(,00)? MAD/.test(text(catRow('c:formules'))), 'par catégorie : Plats 352, Boissons 66, Formules 60', [catRow('c:plats'), catRow('c:boissons')].map(text).join(' | '));
const theRow = text(html.match(/<tr[^>]*><td><b>Thé[\s\S]*?<\/tr>/)?.[0] || '');
ok(/^Thé Boissons 4 1 en formule 66(,00)? MAD/.test(theRow.trim()), 'Thé : 4 vendus dont 1 en formule, le CA reste 66 (la formule garde son prix)', theRow);
ok(/Menu midi Formules 1 60(,00)? MAD/.test(t), 'la formule porte ses 60 MAD');
ok(/22(,00)? MAD\s*$/.test(theRow.trim()), 'prix moyen du Thé = 66 ÷ 3 unités payées, pas ÷ 4', theRow);
const offIdx = html.indexOf('data-sales-cat="off"'), freeIdx = html.indexOf('data-sales-cat="free"'), platsIdx = html.indexOf('data-sales-cat="c:plats"');
ok(offIdx > platsIdx && freeIdx > platsIdx && /Hors de la carte actuelle/.test(t) && /Montant libre · hors carte/.test(t), 'hors carte et montant libre : leurs propres lignes, après la carte');
ok(/Plat du jour Hors de la carte actuelle 1 15(,00)? MAD/.test(t), 'un plat hors carte reste nommé, jamais rattaché au hasard');
const itemised = 319 + 33 + 66 + 60 + 25;
ok(new RegExp(`lignes d’articles \\(${itemised}(,00)? MAD\\)`).test(t), 'les parts portent sur les lignes d’articles, et le total est dit', t.match(/Les parts portent.{0,80}/)?.[0]);
ok(/1 plat de la carte sans vente sur la période/.test(t), 'les plats sans vente sont comptés (pas les archivés)');
ok(!/Profit|Marge|Coût|coût/.test(t.replace(/Coûts actuels[^.]*\./, '')), 'l’onglet Ventes ne parle que d’argent encaissé : ni coût, ni profit, ni marge', (t.match(/.{30}(Profit|Marge|Coût|coût).{30}/) || [])[0]);

/* ── 4 · états ── */
nav.onLine = false;
html = open('sales');
ok(/Hors ligne : ce sont les ventes que cet appareil détient/.test(text(html)), 'hors ligne : la page le dit, les chiffres restent ceux de l’appareil');
nav.onLine = true;
win.KiwiLive.status = () => ({ backfillComplete: false });
html = open('sales');
ok(/partiels pour cette période/.test(text(html)) && !/30 jours complets/.test(text(html)), 'historique en cours de chargement : partiel, sans parler de 30 jours');
win.KiwiLive.status = () => ({ backfillComplete: true });
const ledger = win.KiwiCost.ledger;
delete win.KiwiCost.ledger;
html = open('sales');
ok(/data-sales-state="error"/.test(html) && /rien n’a été modifié/.test(text(html)), 'registre absent : erreur dite, aucun chiffre inventé');
win.KiwiCost.ledger = ledger;

/* ── 5 · langues ── */
lang = 'en'; document.documentElement.lang = 'en';
html = open('sales');
ok(/Sales by category and item/.test(html) && />Sales</.test(html) && /This month/.test(html) && /Last month/.test(html), 'EN : titre, onglet et périodes');
lang = 'ar'; document.documentElement.lang = 'ar';
html = open('sales');
ok(/المبيعات حسب الفئة والمنتج/.test(html) && /الشهر الماضي/.test(html), 'AR : titre et périodes');
lang = 'fr'; document.documentElement.lang = 'fr';

/* ── 6 · source ── */
const src = R('assets/restaurant-menu-workspace.js');
const keys = ['salesTitle', 'salesPresetMonth', 'salesPresetLastMonth', 'salesShareNote', 'salesOffline', 'salesError', 'salesLoading', 'salesInFormula'];
ok(keys.every((k) => (src.match(new RegExp(`\\n\\s+${k}: '`, 'g')) || []).length === 3), 'chaque libellé existe en FR, EN et AR');
ok(/@media \(max-width:720px\)\{\.rmw-sales-table thead\{display:none\}/.test(src) && /content:var\(--l2\)/.test(src), 'téléphone : chaque ligne devient une carte, chaque chiffre garde son libellé');
ok(!/[—]/.test((src.match(/salesTitle[\s\S]*?salesShareNote: '[^']*'/g) || []).join('')), 'aucun tiret cadratin dans les libellés');

console.log(`\n${fail ? '✗' : '✓'} ${pass} contrôles verts${fail ? `, ${fail} en échec` : ''}`);
process.exit(fail ? 1 : 0);
