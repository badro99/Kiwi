#!/usr/bin/env node
import maisonSource from './pos-maison-test-source.cjs';
import caisseTestSource from './caisse-test-source.cjs';
/* Kiwi · la caisse restaurant dit ce qui est vrai
 *
 *   node tools/till-truth-test.mjs
 *
 * Neuf défauts mesurés au clic, sur une pile locale, dans un vrai navigateur :
 *
 *   1  le fond d'ouverture était présélectionné (500) puis jamais compté
 *   2  « Carte » sans lecteur écrivait la vente toute seule, deux secondes après
 *   3  le Z d'un vrai commerce annonçait « à 2 % de l'objectif » (18 000 inventé)
 *   4  une remise à emporter n'était pas comptée au Z (le panier était déjà vidé)
 *   5  « Moyenne table » était un ticket moyen (CA / transactions)
 *   6  une addition partagée à parts égales comptait le plat entier dans CHAQUE part
 *   7  un plat épuisé (86) disparaissait de la grille au lieu de rester grisé
 *   8  une vente de plat sans recette écrivait « -1 » sur un article fantôme du stock
 *   9  le rapport journalier du patron perdait les 2e, 3e... additions partagées
 *      d'une même journée (identité de vente = libellé « À emporter · part 1 »)
 *      et le Z perdait ses remises au rechargement de la caisse
 *
 * Les fonctions livrées sont exécutées en VM ; les contrôles de balisage
 * restants nécessitent le DOM du navigateur pour couvrir tout le câblage.
 * Branché dans tools/check.js.
 */
import fs from 'node:fs';
import declarations from './js-declarations.cjs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => maisonSource(fs.readFileSync(path.join(ROOT, p), 'utf8'));
let pass = 0; const fails = [];
const ok = (label, cond, detail) => { if (cond) pass++; else fails.push(label + (detail ? ' · ' + detail : '')); };

const CAISSE = caisseTestSource(R('kiwi-caisse.html'));
const run = (file, name, context) => vm.runInContext(declarations.declaration(R(file), name), context);

/* 1 · fond d'ouverture */
ok('1 · aucune pastille de fond n\'est présélectionnée dans le gabarit',
  !/class="ci-float-chip is-active"/.test(CAISSE));
ok('1 · le dernier fond n\'est qu\'un raccourci, pas une valeur d\'office',
  /id="ci-float-last"/.test(CAISSE) && /Dernier fond : /.test(CAISSE));

/* 2 · carte sans lecteur */
for (const real of [true, false]) {
  const window = { KiwiEnv: { isReal: () => real } };
  vm.runInNewContext(R('assets/caisse-hardware.js'), { window, navigator: {}, localStorage: { getItem: () => null } });
  ok('2 · le matériel identifie le TPE externe selon la session', window.KiwiHardware.externalCardTerminal() === real);
}
// The static button must still exist in the browser shell.
ok('2 · la confirmation est présente dans le gabarit', /id="card-confirm"/.test(CAISSE));
{
  let click, approvals = 0, commits = 0;
  const app = R('assets/caisse-app.js');
  const start = app.indexOf("    if (reader.confirm) reader.confirm.addEventListener('click'");
  const end = app.indexOf("    $('#pay-card').addEventListener", start);
  const c = vm.createContext({ reader: { confirm: { addEventListener: (event, fn) => { if (event === 'click') click = fn; } } },
    cardPaymentCommitted: false, tenderInFlight: false, cardAttemptSeq: 1,
    cardModal: { classList: { contains: () => true } },
    window: { KiwiHardware: { authorizeCard: async (amount, disc, status, options) => {
      if (amount === 20 && options.cashierConfirmed) approvals++;
      return { approved: true };
    } } }, currentTotal: () => 20, payTipAmount: () => 0, triggerCardSuccess: () => { commits++; } });
  vm.runInContext(app.slice(start, end), c);
  ok('2 · enregistrer le clic ne déclenche aucune vente', typeof click === 'function' && approvals === 0 && commits === 0);
  click(); await new Promise(resolve => setImmediate(resolve));
  ok('2 · confirmer appelle le matériel puis valide une vente', approvals === 1 && commits === 1);
  c.cardPaymentCommitted = true; click(); await Promise.resolve();
  ok('2 · confirmer deux fois ne réencaisse pas', commits === 1 && approvals === 1);
}

/* 3 · objectif */
{
  const nodes = new Map();
  const $ = key => { if (!nodes.has(key)) nodes.set(key, { style: {}, value: '', innerHTML: '' }); return nodes.get(key); };
  const c = vm.createContext({ $, window: {}, renderOpenTableBills() {}, shiftOpenedAt: new Date(),
    storeName: () => 'Test', currentCashier: { name: 'Test' }, dafrDays: [], monthsEn: [],
    journalTotals: () => ({ revenue: 200, txns: 2, card: 100, cash: 100 }),
    shift: { tablesPaid: 1, discounts: 2 }, authorizations: [], handovers: [],
    fmtDur: String, fmtMAD: String, money: Number, openingFloat: 0, drawerExpected: () => 100,
    updateEcart() {}, updateCardEcart() {}, terminalCardTotal: null, DAILY_OBJECTIF: 18000, storeIsReal: () => true });
  run('assets/caisse-accounting/closing.js', 'renderCloture', c);
  c.renderCloture();
  ok('3 · le Z réel affiche seulement les encaissements', $('#clo-highlight-text').innerHTML === '<em>200</em> encaissés sur ce service.');
  ok('5 · le Z affiche le ticket moyen calculé par transaction', $('#clo-rows').innerHTML.includes('<span class="clo-row-label">Ticket moyen</span><span class="clo-row-value mono">100</span>'));
}

/* 4 · remise à emporter */
{
  const c = vm.createContext({ window: {}, storeIsReal: () => true, storeName: () => 'Test', storeCity: () => '',
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    CASHIER_ROSTER: [], rebuildRealRoster() {}, shiftOpenedAt: new Date(),
    shift: { discounts: 12, discountsCount: 2, cancels: 1 } });
  run('assets/caisse-accounting/receipt.js', 'applyStoreIdentity', c);
  c.applyStoreIdentity();
  ok('4 · un service relu conserve remises et annulations', c.shift.discounts === 12 && c.shift.discountsCount === 2 && c.shift.cancels === 1);
  c.shiftOpenedAt = null; c.applyStoreIdentity();
  ok('4 · sans service ouvert le décor est effacé', c.shift.discounts === 0 && c.shift.discountsCount === 0 && c.shift.cancels === 0);
}
{
  const split = vm.createContext({ window: {}, splitState: { total: 30, numParts: 3, splitMode: 'egal', isVrap: true,
    itemTotals: { Plat: { totalQty: 1, unitPrice: 30, itemId: 'plat' } } },
    minor: n => Math.round(n * 100), major: n => n / 100, money: Number, effectiveTipPct: () => 0,
    lineCat: () => 'Plats', $: () => ({}), renderSplitFlow() {}, lucide: { createIcons() {} } });
  for (const name of ['shareMoney', 'launchSplitFlow']) run('assets/caisse/split-tender.js', name, split);
  split.launchSplitFlow();
  const parts = split.splitState.flow.parts;
  ok('6 · le partage produit trois fractions du plat', parts.length === 3 && parts.every(p => p.lines[0].shareDen === 3 && p.lines[0].total === 10));
  const c = vm.createContext({ window: {}, mode: 'vrap', vrapEditingNum: null, journal: [],
    money: n => Math.round((Number(n) || 0) * 100) / 100, activeSaleDiscount: () => ({ discountAmountCents: 235 }),
    genRef: () => 'test', currentCashier: { name: 'Test' }, attachReceipt() {},
    accountActiveDiscount(table, discount) { c.accounted = discount; } });
  run('assets/caisse-accounting/record-sale.js', 'recordSale', c);
  const sale = c.recordSale(10, 'cash', 'Test', 0, parts[0].lines, null);
  ok('4 · la vente transmet sa remise après vidage du panier', c.accounted.discountAmountCents === 235);
  ok('6 · chaque part compte un tiers de plat au journal', sale.lines[0].qty === 0.333 && !('shareDen' in sale.lines[0]));
}

{
  const document = { readyState: 'loading', addEventListener() {} };
  for (const [locale, expected] of [['fr', 'Ticket moyen'], ['en', 'Average ticket'], ['ar', 'متوسط التذكرة']]) {
    const window = {};
    vm.runInNewContext(R('assets/caisse-lang.js'), { window, document,
      localStorage: { getItem: () => locale } });
    ok('5 · le ticket moyen est traduit en ' + locale, window.KiwiCaisseLang.tr('Ticket moyen') === expected);
  }
}

// Whole-shell retired label coverage requires rendering every browser surface.
ok('5 · le gabarit conserve Ticket moyen et retire Moyenne table', !/>Moyenne table</.test(CAISSE) && />Ticket moyen</.test(CAISSE));

/* 7 · 86 */
{
  const grid = { innerHTML: '' };
  const c = vm.createContext({ window: {}, caisseCarte: () => ({ cats: [{ id: 'plats', name: 'Plats' }], items: [
    { id: 'out', name: 'Plat épuisé', catId: 'plats', price: 30, avail: false },
    { id: 'in', name: 'Plat disponible', catId: 'plats', price: 20 },
    { id: 'archived', name: 'Ancien plat', archived: true, avail: false },
  ] }), carteState: {}, CAT_PALETTE: [], STATION_PALETTE: [], activeCat: 'all',
    activeSub: null, mode: 'vrap', cart: [], $: () => grid, escTeam: String,
    menuArt: () => '', subLabelL: () => '', catLabelL: () => 'Plats', menuName: m => m.name, fmtMAD: String });
  run('assets/caisse/catalogue.js', 'rebuildCarte', c);
  run('assets/caisse/catalogue.js', 'renderMenu', c);
  c.rebuildCarte(); c.renderMenu();
  ok('7 · la carte conserve seulement les plats épuisés non archivés', c.carteState.soldOut.length === 1 && c.carteState.soldOut[0].id === 'out' && c.menuItems.length === 1);
  ok('7 · le rendu garde le plat épuisé grisé et désactivé', grid.innerHTML.includes('menu-item is-86') && grid.innerHTML.includes('aria-disabled="true"') && grid.innerHTML.includes('Plat épuisé'));
}
{
  let click, added = 0;
  const messages = [];
  const app = R('assets/caisse-app.js');
  const start = app.indexOf("    document.addEventListener('click', (e) => {");
  const end = app.indexOf("    document.addEventListener('input', (e) => {", start);
  const c = vm.createContext({ document: { addEventListener: (event, fn) => { if (event === 'click') click = fn; } },
    TBL_SEL: '.table', mode: 'vrap', tr: s => s, toast: s => messages.push(s), addToCart: () => { added++; } });
  vm.runInContext(app.slice(start, end), c);
  for (const soldOut of [true, false]) {
    const card = { dataset: { menuId: 'plat' }, classList: { contains: name => soldOut && name === 'is-86' } };
    click({ target: { closest: selector => selector === '.menu-item' ? card : null } });
    if (soldOut) ok('7 · toucher un plat épuisé refuse la vente et explique pourquoi', added === 0 && messages[0] === 'Plat épuisé · retiré de la vente');
    else ok('7 · un plat disponible reste vendable', added === 1);
  }
}

/* 8 · stock : exécution du vrai moteur */
{
  const memory = new Map();
  const localStorage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
  const win = { localStorage, KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'amira-cafe' }, addEventListener() {} };
  win.window = win;
  const ctx = vm.createContext({ window: win, localStorage, navigator: { onLine: false }, crypto: globalThis.crypto, console, Date, Math, JSON, Map, Set, Promise,
    setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {} });
  vm.runInContext(R('assets/inventory-ledger.js'), ctx);
  win.KiwiCost = { doc: () => ({ ingredients: [], recipes: {} }) };
  vm.runInContext(R('assets/inventory-consumption.js'), ctx);
  const I = win.KiwiInventory, C = win.KiwiInventoryConsumption;
  I.ensureOpening('retail-sku-1', 10, {});
  const sale = (ref, lines) => ({ id: ref, ref, time: new Date(1770000000000), amount: 10, method: 'cash', lines });
  C.record(sale('T-1', [{ itemId: 'it_2', name: 'Café noir', qty: 1, total: 12, cat: 'Boissons' }]));
  ok('8 · un plat sans recette n\'écrit aucun mouvement fantôme', I.history('it_2').length === 0 && I.balance('it_2') === 0,
    JSON.stringify(I.history('it_2').map((r) => r.qty)));
  C.record(sale('T-2', [{ itemId: 'retail-sku-1', name: 'Article', qty: 2, total: 20 }]));
  ok('8 · un vrai article de stock sort toujours sa marchandise', I.balance('retail-sku-1') === 8, String(I.balance('retail-sku-1')));
}

/* 9 · rapport journalier : exécution du vrai module */
{
  const memory = new Map();
  const ls = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
  ls.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'resto-test', name: 'Resto', type: 'restaurant' }));
  const ctx = vm.createContext({ window: { localStorage: ls, addEventListener: () => {} }, localStorage: ls, Date, Math, JSON, RegExp, Array, Object, String, Number });
  ctx.window.window = ctx.window;
  vm.runInContext(R('assets/day-report.js'), ctx);
  const DR = ctx.window.KiwiDayReport;
  const t0 = Date.parse('2026-10-11T15:00:00Z');
  /* La forme exacte d'une vente du feed du tableau de bord : pas d'id, un saleId
     serveur, et pour une part d'addition partagée une `ref` qui est le libellé. */
  const part = (n, saleId, ts) => ({ ts, amount: 51.67, method: 'cash', label: 'À emporter · part ' + n, ref: 'À emporter · part ' + n, saleId,
    lines: [{ name: 'Tajine poulet · 1/3', baseName: 'Tajine poulet', qty: 0.333, total: 28.33, cat: 'Plats' }] });
  const sales = [part(1, 'sale-a-split-0', t0), part(1, 'sale-b-split-0', t0 + 600000), part(2, 'sale-b-split-1', t0 + 610000)];
  const rep = DR.build({ day: '2026-10-11', sales, store: { slug: 'resto-test', name: 'Resto', type: 'restaurant' } });
  ok('9 · deux additions partagées du même libellé comptent toutes leurs parts', rep.txns === 3, 'txns=' + rep.txns);
  ok('9 · normSale retient l\'identifiant serveur', DR.normSale(sales[0]).id === 'sale-a-split-0');
}
{
  const t = Date.parse('2026-10-11T15:00:00Z');
  const window = { KiwiDayReport: { dayBounds: () => ({ from: t - 1, to: t + 100 }) },
    KiwiSales: { list: () => [
      { saleId: 'a', ref: 'Part 1', ts: t, amount: 10 },
      { saleId: 'b', ref: 'Part 1', ts: t + 1, amount: 10 },
      { saleId: 'a', ref: 'Part 1', ts: t, amount: 10 },
    ] } };
  vm.runInNewContext(R('assets/day-report-export.js'), { window });
  const rows = window.KiwiDayReportExport.context({ day: '2026-10-11' }).sales;
  ok('9 · export conserve les ventes distinctes et dédoublonne leur écho', rows.length === 2 && rows[0].id === 'a' && rows[1].id === 'b');
}

/* 10 · « God Mode » est le nom interne de la console opérateur : le caissier ne
   le voit jamais, un module coupé l'est « pour cet établissement ». */
{
  const strip = (src) => src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['kiwi-caisse.html', 'assets/pos-maison.js']) {
    const hits = (strip(R(f)).match(/[^\n]*God Mode[^\n]*/g) || []).map((l) => l.trim().slice(0, 80));
    ok('10 · aucun « God Mode » montré au caissier dans ' + f, !hits.length, hits.join(' | '));
  }
}

// Opening and accounting execute the production declarations with side effects observed.
{
  let opens = 0;
  const error = { hidden: true };
  const c = vm.createContext({ operatorCaisseRequested: () => false, floatChosen: false,
    tillKitOpenFloat: () => false, document: { getElementById: () => error },
    hoursAllowOpening: () => ({ ok: true }), doOpenService: () => { opens++; } });
  vm.runInContext(caisseTestSource.declarations('openService'), c);
  c.openService();
  ok('1 execution · sans fond : erreur visible et aucune ouverture', opens === 0 && error.hidden === false);
  c.floatChosen = true; c.openService();
  ok('1 execution · fond explicitement choisi permet l’ouverture', opens === 1);
}
{
  const c = vm.createContext({ mode: 'vrap', selectedId: null, cart: [],
    vrapDiscount: { accounted: false }, shift: { discounts: 0, discountsCount: 0 },
    vrapDiscountAmount: () => 0, money: n => Math.round(n * 100) / 100 });
  // Supply the production order owner so its setDiscount projection is exercised.
  vm.runInContext(caisseTestSource.orderDeclarations(), c);
  vm.runInContext(caisseTestSource.declarations('accountActiveDiscount'), c);
  c.accountActiveDiscount(null, { discountAmountCents: 235 });
  ok('4 execution · panier vidé conserve 235 centimes de remise au Z', Math.round(c.shift.discounts * 100) === 235 && c.shift.discountsCount === 1);
}

/* Execution contract: external TPE, unavailable reader, approval, stale reply.
 * The click registration above is also executed before authorization. */
async function cardScenario(source, external, authorize) {
  const elements = new Map(), timers = [], pending = [];
  const el = () => ({ hidden: true, textContent: '', innerHTML: '', style: {},
    classList: { values: new Set(), add(...v) { v.forEach(x => this.values.add(x)); }, remove(...v) { v.forEach(x => this.values.delete(x)); }, contains(v) { return this.values.has(v); } } });
  const $ = key => { if (!elements.has(key)) elements.set(key, el()); return elements.get(key); };
  const c = vm.createContext({ $, window: { KiwiHardware: { externalCardTerminal: () => external, authorizeCard: authorize } },
    reader: Object.fromEntries(['disc','status','method','foot','confirm'].map(k => [k, el()])),
    cardModal: $('#card-modal'), cardAttemptSeq: 0, cardPaymentCommitted: false,
    cardTenderMethod: '', resetPayTip() {}, renderPayTip() {}, currentTotal: () => 21.35,
    payTipAmount: () => 0, fmtMADcents: n => String(n), lucide: { createIcons() {} },
    setTimeout(fn) { timers.push(fn); }, triggerCardSuccess(result) { pending.push(result); } });
  vm.runInContext(source, c);
  c.openCardModal();
  for (const fn of timers) await fn();
  await Promise.resolve(); await Promise.resolve();
  return { c, timers, pending };
}
{
  const code = caisseTestSource.declarations('openCardModal');
  const external = await cardScenario(code, true, () => { throw Error('external terminal must not authorize'); });
  ok('2 execution · TPE externe attend sans minuteur, confirmation visible', external.timers.length === 0 && !external.c.reader.confirm.hidden && !external.pending.length);
  const absent = await cardScenario(code, false, undefined);
  ok('2 execution · lecteur absent ne valide jamais', !absent.pending.length && absent.c.reader.status.textContent.includes('non confirmé'));
  const refused = await cardScenario(code, false, async () => ({ approved: false }));
  ok('2 execution · refus ne valide jamais', !refused.pending.length);
  const approved = await cardScenario(code, false, async () => ({ approved: true }));
  ok('2 execution · accord matériel déclenche une seule validation', approved.pending.length === 1 && approved.pending[0].approved);
  // Mutation preserves every old regex, but makes the return unreachable.
  const mutant = code.replace('if (externalTerminal) return;', 'if (false) { if (externalTerminal) return; }');
  const broken = await cardScenario(mutant, true, undefined);
  ok('2 mutation · nouveau contrat détecte le garde TPE devenu mort', broken.timers.length !== 0);
}

if (fails.length) { console.error('\n✗ ' + fails.length + ' contrôle(s) rouge(s)\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('✓ till-truth: ' + pass + ' contrôles verts');
