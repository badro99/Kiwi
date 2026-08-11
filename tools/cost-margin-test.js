#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · la marge se MESURE, elle ne se suppose pas
 *
 *   node tools/cost-margin-test.js
 *
 * Ce que ce banc défend, et pourquoi il existe.
 *
 * Le tableau de bord affichait trois tuiles — Marge brute, Bénéfice brut, Coût
 * matière — qui dérivaient toutes d'un seul chiffre. Ce chiffre était calculé
 * en rapprochant le LIBELLÉ du ticket du nom d'un produit du catalogue. Or le
 * libellé est un résumé de panier (« Pain complet +3 art. », « Table 4 »), pas
 * un produit. Conséquences mesurées avant correction :
 *
 *   · un panier de plusieurs articles ne se résolvait jamais ;
 *   · quand il se résolvait, on retranchait UN coût unitaire du montant du
 *     ticket ENTIER — quatre pains à 5 MAD donnaient 18 MAD de bénéfice au lieu
 *     de 12 ;
 *   · tout le reste retombait sur une constante de métier. Pour un café, dont
 *     aucune vente ne se résolvait, la tuile affichait exactement 69,0 % tous
 *     les jours, à vie. Une constante présentée comme une mesure — et les trois
 *     tuiles se confirmaient mutuellement puisqu'elles en dérivaient.
 *
 * On n'extrait pas ici une copie de la logique : on CHARGE assets/cost.js tel
 * qu'il est livré, dans un bac à sable minimal, et on l'interroge. Si quelqu'un
 * réécrit le résolveur, ce banc parle — au lieu de continuer à valider une
 * copie devenue fausse.
 *
 * La règle qu'il protège avant toutes les autres : un coût inconnu ne produit
 * JAMAIS un nombre. Ni 0, ni 100 %, ni la moyenne du métier. Il produit `null`,
 * et `null` remonte jusqu'à l'écran.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0; const fails = [];
const ok = (label, cond, detail) => { if (cond) pass++; else fails.push(label + (detail ? ' — ' + detail : '')); };
const near = (a, b) => a != null && Math.abs(a - b) < 0.005;

/* ── le bac à sable ─────────────────────────────────────────────────────── */
function bootCost(opts) {
  const o = opts || {};
  const mem = new Map();
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const noop = () => {};
  const win = { addEventListener: noop, console, setTimeout };
  win.window = win;
  const document = { addEventListener: noop, querySelector: () => null, head: { appendChild: noop },
    createElement: () => ({ style: {} }), body: { classList: { add: noop, remove: noop, contains: () => false } } };
  const ctx = vm.createContext({ window: win, document, localStorage, console, setTimeout, clearTimeout });

  /* KiwiStore réduit à ce que define() promet : un document par établissement,
     lu et écrit tel quel. On ne teste pas venue-store.js ici, on teste cost.js. */
  vm.runInContext(`
    window.__v = 'v-test';
    window.KiwiStore = {
      currentVenue: () => window.__v,
      define(feature, opts) {
        const key = () => 'kiwi:' + feature + ':v1:' + window.__v;
        const subs = new Set();
        const read = () => { const r = localStorage.getItem(key()); return r ? JSON.parse(r) : opts.blank(); };
        const write = (d) => { localStorage.setItem(key(), JSON.stringify(d)); subs.forEach(f => f()); return d; };
        return { get: read, set: write,
          update(fn) { const d = read(); const n = fn(d); return write(n === undefined ? d : n); },
          subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }, cloud: () => null };
      }
    };
  `, ctx);

  if (o.vat) vm.runInContext(`window.KiwiReceipt = { config: () => ({ vat: ${JSON.stringify(o.vat)} }) };`, ctx);
  /* La VRAIE forme de l'API : KiwiMenuStore expose items(), pas get(). Un shim
     trop généreux avait laissé passer un `.get()` inexistant dans cost.js —
     le repli par nom rendait alors « non chiffré » sur tout l'historique, en
     silence, parce qu'un try/catch avalait le TypeError. */
  if (o.menu) vm.runInContext(`window.KiwiMenuStore = { items: () => ${JSON.stringify(o.menu)} };`, ctx);
  if (o.shop) {
    vm.runInContext(`
      window.KiwiBoutiqueVenueKey = () => 'k';
      window.KiwiBoutiqueCatalog = { use: () => {}, listProducts: () => ${JSON.stringify(o.shop)} };
    `, ctx);
  }
  vm.runInContext(R('assets/cost.js'), ctx, { filename: 'cost.js' });
  return win.KiwiCost;
}

const L = (name, qty, total, extra) => Object.assign({ name, qty, total }, extra || {});
const MENU = [
  { id: 'it_1', name: 'Pain complet', price: 5 },
  { id: 'it_2', name: 'Café noir', price: 3 },
  { id: 'it_3', name: 'Msemen', price: 10 },
];

/* ══════════════ 1 · le module se charge et expose son contrat ══════════════ */
{
  const C = bootCost({ menu: MENU });
  ok('KiwiCost est exposé', !!C);
  ['of', 'coverage', 'marginOf', 'basis', 'netOf', 'setItemCost', 'itemCost', 'listMissing', 'subscribe']
    .forEach((k) => ok(`KiwiCost.${k} existe`, typeof C[k] === 'function'));
}

/* ══════════════ 2 · un coût inconnu ne devient JAMAIS un nombre ══════════════ */
{
  const C = bootCost({ menu: MENU });
  const r = C.of({ kind: 'menu', id: 'it_1', name: 'Pain complet' });
  ok('coût absent ⇒ mad null', r.mad === null, JSON.stringify(r));
  ok('coût absent ⇒ src null', r.src === null);
  ok('coût absent ⇒ pas de 0', r.mad !== 0);

  C.setItemCost('it_1', 2);
  ok('coût saisi ⇒ relu', C.itemCost('it_1') === 2);
  ok('coût saisi ⇒ src flat', C.of({ kind: 'menu', id: 'it_1' }).src === 'flat');

  /* Vider le champ EFFACE. Un 0 conservé rendrait « 100 % de marge », ce qui est
     le chiffre inventé que tout ce travail supprime. */
  C.setItemCost('it_1', 0);
  ok('coût 0 ⇒ effacé, pas stocké', C.itemCost('it_1') === null);
  C.setItemCost('it_1', null);
  ok('coût null ⇒ effacé', C.itemCost('it_1') === null);
  ok('marginOf sans coût ⇒ null', C.marginOf(5, 0) === null);
  ok('marginOf sans prix ⇒ null', C.marginOf(0, 2) === null);
  ok('marginOf ⇒ jamais 100 sur coût absent', C.marginOf(5, null) === null);
}

/* ══════════════ 3 · LA quantité (le bug à 6 MAD par ticket) ══════════════ */
{
  const C = bootCost({ menu: MENU });
  C.setItemCost('it_1', 2);
  const r = C.coverage([{ ts: 1, amount: 20, label: 'Pain complet', lines: [L('Pain complet', 4, 20)] }], 0, 9e15);
  ok('4 pains : le coût est multiplié par la quantité', near(r.cost, 8), 'cost=' + r.cost);
  ok('4 pains : bénéfice 12 et non 18', near(r.profit, 12), 'profit=' + r.profit);
  ok('4 pains : marge 60 %', near(r.marginPct, 60), 'pct=' + r.marginPct);
}

/* ══════════════ 4 · on lit les LIGNES, pas le libellé du ticket ══════════════ */
{
  const C = bootCost({ menu: MENU });
  C.setItemCost('it_1', 2); C.setItemCost('it_2', 3);
  /* Le libellé « Pain complet +3 art. » ne désignait aucun produit : l'ancien
     code n'y trouvait rien et inventait la marge du métier. */
  const r = C.coverage([{ ts: 1, amount: 35, label: 'Pain complet +3 art.',
    lines: [L('Pain complet', 1, 5), L('Café noir', 3, 30)] }], 0, 9e15);
  ok('panier mixte : résolu par les lignes', near(r.profit, 24), 'profit=' + r.profit);
  ok('panier mixte : couverture 100 %', near(r.pctCosted, 100), 'pct=' + r.pctCosted);

  /* Un ticket SANS détail (13 métiers n'envoient pas encore de panier) compte
     au chiffre d'affaires mais jamais à la marge — sinon on affirmerait une
     marge sur une vente dont on ignore le contenu. */
  const r2 = C.coverage([{ ts: 1, amount: 50, label: 'Vente' }], 0, 9e15);
  ok('ticket sans lignes : compté au CA', near(r2.revenue, 50));
  ok('ticket sans lignes : hors marge', near(r2.revenueCosted, 0));
  ok('ticket sans lignes : marge null', r2.marginPct === null);
}

/* ══════════════ 5 · aucun coût saisi ⇒ AUCUNE marge (les 69 % à vie) ══════════════ */
{
  const C = bootCost({ menu: MENU });
  const day = [
    { ts: 1, amount: 5, label: 'Pain complet', lines: [L('Pain complet', 1, 5)] },
    { ts: 2, amount: 12, label: 'Café noir', lines: [L('Café noir', 4, 12)] },
  ];
  const r = C.coverage(day, 0, 9e15);
  ok('rien de chiffré : marginPct null', r.marginPct === null, 'pct=' + r.marginPct);
  ok('rien de chiffré : pas de 69 %', r.marginPct !== 69);
  ok('rien de chiffré : couverture 0 %', near(r.pctCosted, 0));
  ok('rien de chiffré : le CA reste juste', near(r.revenue, 17));
  ok('rien de chiffré : les manquants sont nommés', r.missing.length === 2);
}

/* ══════════════ 6 · couverture partielle : le chiffre est partiel ET dit ══════════════ */
{
  const C = bootCost({ menu: MENU });
  C.setItemCost('it_1', 2);           // Msemen reste non chiffré
  const r = C.coverage([
    { ts: 1, amount: 20, label: 'Pain complet', lines: [L('Pain complet', 4, 20)] },
    { ts: 2, amount: 40, label: 'Msemen', lines: [L('Msemen', 4, 40)] },
  ], 0, 9e15);
  ok('partiel : la marge ne porte que sur le chiffré', near(r.profit, 12), 'profit=' + r.profit);
  ok('partiel : couverture 33,3 %', near(r.pctCosted, 33.33), 'pct=' + r.pctCosted);
  ok('partiel : le non chiffré est listé', r.missing.length === 1 && r.missing[0].name === 'Msemen');
  ok('partiel : avec son manque à gagner', near(r.missing[0].revenue, 40));
  ok('partiel : le CA total reste complet', near(r.revenue, 60));
}

/* ══════════════ 7 · la file de travail est triée par impact ══════════════ */
{
  const C = bootCost({ menu: MENU });
  const r = C.coverage([
    { ts: 1, amount: 5, lines: [L('Pain complet', 1, 5)] },
    { ts: 2, amount: 40, lines: [L('Msemen', 4, 40)] },
    { ts: 3, amount: 12, lines: [L('Café noir', 4, 12)] },
  ], 0, 9e15);
  ok('manquants triés par CA décroissant',
    r.missing.map((m) => m.name).join('|') === 'Msemen|Café noir|Pain complet',
    r.missing.map((m) => m.name).join('|'));
}

/* ══════════════ 8 · la TVA — la marge se calcule HORS TAXE ══════════════ */
{
  /* Pas de TVA déclarée : on calcule sur le prix tel qu'il est saisi. C'est le
     défaut, parce que beaucoup de petits commerces marocains ne la facturent pas. */
  const A = bootCost({ menu: MENU, vat: { mode: 'none', rate: 20, included: true } });
  ok('TVA none : base = le prix', near(A.netOf(100), 100));
  ok('TVA none : basis.mode', A.basis().mode === 'none');

  /* TVA activée, prix TTC : 100 MAD affichés contiennent 20 % de taxe, qui
     n'appartient pas au commerçant. Une vente 100 sur un coût 60 n'est pas
     40 % de marge mais 28 %. */
  const B = bootCost({ menu: MENU, vat: { mode: 'rate', rate: 20, included: true } });
  ok('TVA 20 % TTC : 100 ⇒ 83,33 HT', near(B.netOf(100), 83.3333), String(B.netOf(100)));
  const mg = B.marginOf(100, 60);
  ok('TVA 20 % TTC : marge 28 % et non 40 %', near(mg.pct, 28), 'pct=' + (mg && mg.pct));

  /* Prix déjà hors taxe : rien à retirer. */
  const D = bootCost({ menu: MENU, vat: { mode: 'rate', rate: 20, included: false } });
  ok('TVA 20 % HT : base inchangée', near(D.netOf(100), 100));
  ok('TVA 20 % HT : marge 40 %', near(D.marginOf(100, 60).pct, 40));
}

/* ══════════════ 9 · la remise de table ══════════════ */
{
  /* Les lignes totalisent 35, la caisse n'a encaissé que 28 : une remise a été
     accordée sur la note sans toucher les lignes. Ignorer l'écart surévaluerait
     la marge de chaque journée de promotion. */
  const C = bootCost({ menu: MENU });
  C.setItemCost('it_1', 2); C.setItemCost('it_2', 3);
  const r = C.coverage([{ ts: 1, amount: 28, label: 'Table 4',
    lines: [L('Pain complet', 1, 5), L('Café noir', 3, 30)] }], 0, 9e15);
  ok('remise : le CA suit l\'encaissé', near(r.revenueCosted, 28), 'costed=' + r.revenueCosted);
  ok('remise : la marge est amputée d\'autant', near(r.profit, 17), 'profit=' + r.profit);
}

/* ══════════════ 10 · le coût GELÉ sur la ligne prime (phase 5) ══════════════ */
{
  const C = bootCost({ menu: MENU });
  C.setItemCost('it_1', 9);                       // le coût d'AUJOURD'HUI
  const r = C.coverage([{ ts: 1, amount: 20,
    lines: [L('Pain complet', 4, 20, { unitCost: 2 })] }], 0, 9e15);
  ok('coût gelé : la ligne gagne sur le carnet', near(r.cost, 8), 'cost=' + r.cost);
  ok('coût gelé : corriger un prix d\'achat ne réécrit pas le passé', near(r.profit, 12));
}

/* ══════════════ 11 · le catalogue boutique reste la source des produits ══════════════ */
{
  const C = bootCost({ shop: [{ id: 'p1', name: 'Chemise', cost: 60 }] });
  const r = C.of({ kind: 'shop', id: 'p1', name: 'Chemise' });
  ok('boutique : le coût produit est lu', r.mad === 60 && r.src === 'variant', JSON.stringify(r));
  const r2 = C.of({ kind: 'shop', id: 'p2', name: 'Pantalon' });
  ok('boutique : produit inconnu ⇒ null', r2.mad === null);
  /* Un produit boutique à coût 0 n'est PAS un produit gratuit : c'est un champ
     jamais rempli. Il doit rester non chiffré. */
  const C2 = bootCost({ shop: [{ id: 'p3', name: 'Ceinture', cost: 0 }] });
  ok('boutique : cost 0 ⇒ non chiffré', C2.of({ kind: 'shop', id: 'p3' }).mad === null);
}

/* ══════════════ 12 · le repli par NOM (l'historique d'avant la phase 5) ══════════════ */
{
  /* Les ventes déjà en base ne portent pas l'identifiant de l'article. Sans ce
     repli, un patron qui vient de chiffrer toute sa carte verrait « non
     chiffré » sur tout son historique et croirait la saisie inutile. */
  const C = bootCost({ menu: MENU });
  C.setItemCost('it_2', 3);
  const r = C.of({ kind: 'menu', name: 'Café noir' });   // aucun id
  ok('repli par nom : résolu', r.mad === 3 && r.src === 'flat', JSON.stringify(r));
  ok('repli par nom : insensible à la casse', C.of({ name: 'CAFÉ NOIR' }).mad === 3);
  ok('repli par nom : nom inconnu ⇒ null', C.of({ name: 'Thé' }).mad === null);
}

/* ══════════════ 13 · la fenêtre de dates ══════════════ */
{
  const C = bootCost({ menu: MENU });
  C.setItemCost('it_1', 2);
  const sales = [
    { ts: 100, amount: 5, lines: [L('Pain complet', 1, 5)] },
    { ts: 500, amount: 5, lines: [L('Pain complet', 1, 5)] },
    { ts: 900, amount: 5, lines: [L('Pain complet', 1, 5)] },
  ];
  ok('fenêtre : borne basse incluse, haute exclue', near(C.coverage(sales, 100, 900).revenue, 10),
    String(C.coverage(sales, 100, 900).revenue));
  ok('fenêtre : tout', near(C.coverage(sales, 0, 9e15).revenue, 15));
}

/* ══════════════ 14 · la source : le code livré, pas une copie ══════════════ */
{
  const src = R('assets/dateRange.js');
  ok('dateRange : realGrossProfit délègue à KiwiCost',
    /function realGrossProfit\([^)]*\)\s*\{[\s\S]{0,400}?KiwiCost/.test(src));
  ok('dateRange : realGrossProfit ne lit plus e.label',
    !/function realGrossProfit[\s\S]{0,1200}?byName\.get\(String\(e\.label/.test(src));
  ok('dateRange : DEFAULT_MARGIN ne s\'applique plus à un vrai commerçant',
    /margeOf = \(d, ctx\) => \{[\s\S]{0,220}?ownData\(\)[\s\S]{0,120}?return null;/.test(src),
    'margeOf doit rendre null sur ownData()');
  ok('dateRange : les trois tuiles tombent sur le tiret ensemble',
    /data\.marge = \{ \.\.\.dash \};[\s\S]{0,120}data\.profit = \{ \.\.\.dash \};[\s\S]{0,120}data\.cogs = \{ \.\.\.dash \};/.test(src));

  const int = R('assets/interactive.js');
  ok('interactive : kpi-detail est gardé contre la démo',
    /'kpi-detail':[\s\S]{0,1400}?KiwiEnv[\s\S]{0,120}?isReal[\s\S]{0,400}?const authored = real \? null : kpiData\[arg\]/.test(int),
    'un vrai commerçant ne doit pas voir le tiroir rédigé du Café Atlas');

  const pp = R('assets/pages-pro.js');
  ok('pages-pro : plus de « Marge 100 % » sur un produit non chiffré',
    !/const margin = p\.priceMAD \? Math\.round\(\(1 - \(p\.cost \|\| 0\)/.test(pp));
  ok('pages-pro : le produit non chiffré le dit',
    /Prix d’achat manquant/.test(pp));

  const fin = R('assets/finance.js');
  ok('finance : la déclaration de TVA fabriquée est partie', !/TVA_DATA|tvaPayable|tvaDueDate/.test(fin));
  ok('finance : plus d\'e-mail de comptable inventé', !/cabinetdouiri|samira@/.test(fin));
  ok('finance : plus de gestionnaire d\'export TVA', !/fin-tva-pdf|fin-tva-xls|fin-tva-send/.test(fin));

  const st = R('assets/stock.js');
  ok('stock : plus de repli sur le CA du Café Atlas',
    !/return VENUE_REVENUE\[currentVenueId\(\)\] \|\| 825000;/.test(st));

  const dx = R('assets/dashboard-extra.js');
  ok('dashboard-extra : l\'export CSV des marges est gardé',
    /handlers\['margin-export'\][\s\S]{0,600}?isCustom[\s\S]{0,200}?return;/.test(dx));

  const sw = R('kiwi-sw.js');
  ok('service worker : cost.js est dans la coquille', /'\/assets\/cost\.js(\?v=\d+)?'/.test(sw));
  const dash = R('dashboard.html');
  ok('dashboard : cost.js est chargé', /<script src="assets\/cost\.js(\?v=\d+)?"/.test(dash));
  ok('dashboard : cost.js après venue-store.js',
    dash.indexOf('assets/cost.js') > dash.indexOf('assets/venue-store.js'));
  ok('dashboard : cost.js avant menu-catalog.js',
    dash.indexOf('assets/cost.js') < dash.indexOf('assets/menu-catalog.js'));

  const mc = R('assets/menu-catalog.js');
  ok('carte : le champ coût existe', /data-f-cost/.test(mc));
  ok('carte : la marge vivante existe', /data-f-margin/.test(mc));
  ok('carte : le coût n\'est PAS écrit sur l\'article',
    !/cost: /.test(mc.slice(mc.indexOf('function addItem'), mc.indexOf('function deleteItem'))),
    'un cost sur l\'article partirait sur /api/menu, qui est public');
  ok('carte : le coût passe par KiwiCost.setItemCost', /KC\.setItemCost\(/.test(mc));

  const cost = R('assets/cost.js');
  ok('cost.js : lit KiwiMenuStore.items(), pas un .get() inexistant',
    /KiwiMenuStore[\s\S]{0,200}?typeof M\.items === 'function'/.test(cost)
      && !/KiwiMenuStore\.get\(/.test(cost),
    'un .get() est avalé par le try/catch et casse le repli par nom en silence');
  ok('finance.js : idem pour le comptage des produits',
    !/KiwiMenuStore\.get\(/.test(R('assets/finance.js')));

  const menuApi = R('functions/api/menu.js');
  ok('serveur : sanitizeMenu ne connaît toujours pas cost',
    !/cost/.test(menuApi.slice(menuApi.indexOf('function sanitizeMenu'), menuApi.indexOf('function sanitizeShop'))),
    'le coût ne doit jamais pouvoir être publié');
}

/* ══════════════ 15 · ce que la page REND, et pas ce qu'elle contient ══════════════
 * Chercher « TVA » dans le fichier ne prouve rien : les notes de suppression
 * citent forcément ce qu'elles suppriment. On rend donc la page pour de vrai,
 * dans les deux modes, et on lit ce qui sort. */
function renderFinance(real) {
  const noop = () => {};
  const root = { innerHTML: '' };
  const el = () => ({ classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop,
    removeAttribute: noop, appendChild: noop, addEventListener: noop, querySelector: () => null,
    querySelectorAll: () => [], innerHTML: '', textContent: '', style: {}, dataset: {} });
  const win = {
    Kiwi: { handlers: {}, toast: noop, setActivePage: noop, pageShell: noop, modal: noop },
    KiwiVenue: { getVenue: () => (real ? 'v-test' : 'cafeAtlas'),
      getVenueData: () => ({ name: real ? 'Boulangerie El Menzah' : 'Café Atlas' }),
      isCustom: () => real, subscribe: noop },
    KiwiEnv: { isReal: () => real, demosAllowed: !real },
    KiwiI18n: { getLang: () => 'fr' },
    KiwiMenuStore: { items: () => MENU },
    KiwiCost: { doc: () => ({ items: { it_1: { cost: 2 } } }) },
    addEventListener: noop, setTimeout, clearTimeout, console, scrollTo: noop,
  };
  win.window = win;
  const document = { readyState: 'complete', body: el(), documentElement: el(), head: el(),
    addEventListener: noop, createElement: el, getElementById: () => null,
    querySelector: (s) => (s === '[data-finance-root]' ? root : null), querySelectorAll: () => [] };
  const ctx = vm.createContext({ window: win, document, console, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem: noop } });
  vm.runInContext(R('assets/finance.js'), ctx, { filename: 'finance.js' });
  win.KiwiFinance.render();
  return root.innerHTML;
}
{
  const realHtml = renderFinance(true);
  ok('rendu réel : aucune TVA à l\'écran', !/TVA|VAT/.test(realHtml), realHtml.slice(0, 160));
  ok('rendu réel : aucun « téléchargement simulé »', !/simulé/.test(realHtml));
  ok('rendu réel : aucun chiffre du Café Atlas', !/Café Atlas|27 512|825 000|800 000|500 000/.test(realHtml));
  ok('rendu réel : dit ce qu\'il reste à faire', /chiffrer|Chiffrez/.test(realHtml), realHtml.slice(0, 200));
  ok('rendu réel : compte les produits pour de vrai',
    /2 produits sur 3/.test(realHtml), realHtml.replace(/<[^>]+>/g, ' ').slice(0, 300));
  ok('rendu réel : propose d\'ouvrir la carte', /data-action="nav-menu"/.test(realHtml));

  const demoHtml = renderFinance(false);
  ok('rendu démo : la page de démonstration rend toujours ses panneaux',
    /fin-pnl/.test(demoHtml) && demoHtml.length > 4000, 'len=' + demoHtml.length);
  ok('rendu démo : la TVA fabriquée n\'y est plus non plus', !/tva|TVA/.test(demoHtml));
}

/* ══════════════ 16 · la démo n'est pas touchée ══════════════ */
{
  const src = R('assets/dateRange.js');
  ok('démo : DEFAULT_MARGIN existe toujours pour la démonstration',
    /DEFAULT_MARGIN = \{ restaurant: 69/.test(src));
  const int = R('assets/interactive.js');
  ok('démo : le tiroir rédigé existe toujours', /'marge': \{/.test(int));
}

/* ─────────────────────────── verdict ─────────────────────────── */
if (fails.length) {
  console.log('\n  ✗ marges & coûts — ' + fails.length + ' échec(s) sur ' + (pass + fails.length) + '\n');
  fails.forEach((f) => console.log('    · ' + f));
  console.log();
  process.exit(1);
}
console.log('  ✓ marges & coûts (' + pass + ' contrôles : quantité, lignes et non libellé, '
  + 'aucune constante de métier, non chiffré ≠ 0 ni 100 %, couverture annoncée, TVA hors taxe, '
  + 'remise répartie, coût gelé, fuites de démo fermées, TVA fabriquée retirée)');
