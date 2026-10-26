#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════════════
 * MÉTIERS DE BOUCHE · CE QUE LA CAISSE VEND, CE QUE LE TABLEAU DE BORD MONTRE
 *
 * Boulangerie, pizzeria, fast-food, food truck et traiteur vendaient les prix
 * de la démo chez un vrai commerçant, et leurs destinations du tableau de
 * bord (devis, acomptes, livraisons, fournées, gâteaux) n'affichaient rien de
 * ce que la caisse avait enregistré. Ce test tient :
 *
 *  1. la carte du commerçant devient la carte de la caisse (pizzeria : tailles,
 *     pâtes, boissons ; zones, moitié-moitié, cuisson viennent des réglages) ;
 *  2. le réel démarre VIDE (pas de démo présentée comme la sienne) ;
 *  3. une ligne, une zone, un devis emportent leur instantané : changer la
 *     carte ne change pas une commande déjà prise ;
 *  4. le traiteur : extras (forfait / par invité / par groupe), conditions du
 *     devis et décalage « J−n » réglable, échéancier qui tombe juste ;
 *  5. boulangerie : remise dernière heure réglable, produit dérivé ou libre
 *     reconstruit depuis sa ligne ;
 *  6. le tableau de bord lit l'état de la caisse en lecture seule (jamais en
 *     démo) ; l'éditeur de réglages est fr / en / ar à clés égales ;
 *  7. l'accueil : « clients réguliers » sans source = tiret, pas 0 (qui disait
 *     « tous vos clients sont nouveaux », fidélité 0,0 %).
 *
 * Les fonctions testées sont les vraies, extraites des fichiers et exécutées
 * dans un `vm`. Le reste est tenu par des assertions sur la source.
 *
 *   node tools/food-trades-truth-test.mjs
 * ═════════════════════════════════════════════════════════════════════════ */
import dashboardDependencies from './dashboard-dependencies.cjs';
import assert from 'node:assert/strict';
import coreTestSource from './core-test-source.cjs';
const { readFileSync } = coreTestSource;
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const PZ = read('assets/pos-pizzeria.js');
const TR = read('assets/pos-traiteur.js');
const BK = read('assets/pos-boulangerie.js');
const FF = read('assets/pos-fastfood.js');
const FT = read('assets/pos-foodtruck.js');
const VS = read('assets/vertical-state.js');
const TW = read('assets/trade-workspaces.js');
const FS = read('assets/food-trade-settings.js');
const DR = read('assets/dateRange.js');
const STORE = read('functions/api/store.js');
const DASH = dashboardDependencies.eager(read('dashboard.html'));
const MW = read('assets/restaurant-menu-workspace.js');

function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
function line(src, re) {
  const m = src.match(re);
  assert.ok(m, String(re) + ' found');
  return m[0];
}

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
const run = (code, extra = {}) => {
  const ctx = vm.createContext({ window: {}, Math, JSON, Date, Object, Array, Number, String, Map, Set, console, ...extra });
  vm.runInContext(code, ctx);
  return ctx;
};
const clone = (v) => JSON.parse(JSON.stringify(v));

/* ═══════════════ 1 · PIZZERIA : la carte du commerçant ═══════════════ */
console.log('\npizzeria · carte et réglages');
const pzCode = `
  const pvReal = () => true;
  const SIZES = [], SIZE = {}, PIZZAS = [], PIZZA = {}, DRINKS = [], DRINK = {}, ZONES = [], ZONE = {};
  let HALF_FEE = null, BAKE_MS = 12 * 60 * 1000, root = null;
  const $ = () => null; const renderGrid = () => {}; const renderAll = () => {};
  const carteApi = null; let SETTINGS = {};
  const settingsApi = { get: () => SETTINGS };
  ${line(PZ, /  const DRINK_CAT = .*;/)}
  ${line(PZ, /  const SIZE_G = .*;/)}
  ${line(PZ, /  const PATE_G = .*;/)}
  let carteSkipped = 0;
  ${grab(PZ, 'function applyCarte(c)')}
  ${grab(PZ, 'function applySettings()')}
  ${line(PZ, /  const zoneOf = .*;/)}
  ${line(PZ, /  const drinkOf = .*;/)}
  ${grab(PZ, 'function linePrice(ln)')}
  globalThis.T = { applyCarte, applySettings, zoneOf, drinkOf, linePrice, SIZES, PIZZAS, DRINKS, ZONES, ZONE, setSettings: (s) => { SETTINGS = s; },
    halfFee: () => HALF_FEE, bake: () => BAKE_MS };
`;
const pz = run(pzCode).T;
const grp = (name, kind, choices, required) => ({ id: 'g_' + name, name, kind, required: !!required, choices: choices.map(([n, p], i) => ({ id: name + i, name: n, price: p })) });
const CARTE = { items: [
  { id: 'mg', name: 'Margherita', desc: 'tomate', price: 35, catName: 'Pizzas', groups: [grp('Taille', 'one', [['Petite', 0], ['Moyenne', 10], ['Grande', 25]], true), grp('Pâte', 'one', [['Fine', 0], ['Épaisse', 3]])] },
  { id: 'cz', name: 'Calzone', desc: '', price: 38, catName: 'Pizzas', groups: [grp('Taille', 'one', [['Petite', 0], ['Moyenne', 12]], true)] },
  { id: 'fr', name: 'Frites', desc: '', price: 12.5, catName: 'Entrées', groups: [] },
  { id: 'co', name: 'Coca', desc: '33 cl', price: 10, catName: 'Boissons', groups: [] },
] };
ok('réel : aucune pizza, boisson ni zone avant la carte', () => {
  assert.equal(pz.PIZZAS.length, 0); assert.equal(pz.DRINKS.length, 0); assert.equal(pz.ZONES.length, 0);
  assert.equal(pz.halfFee(), null, 'pas de moitié-moitié sans supplément saisi');
});
pz.applyCarte(CARTE);
ok('catégorie « Boissons » = boissons, le reste = articles à vendre', () => {
  assert.deepEqual(clone(pz.DRINKS.map((d) => d.label)), ['Coca']);
  assert.deepEqual(clone(pz.PIZZAS.map((p) => p.label)), ['Margherita', 'Calzone', 'Frites']);
});
ok('le groupe « Taille » donne les tailles : prix carte + supplément du choix', () => {
  const mg = pz.PIZZAS[0];
  assert.deepEqual(clone(mg.prices), { petite: 35, moyenne: 45, grande: 60 });
  assert.deepEqual(clone(pz.PIZZAS[1].prices), { petite: 38, moyenne: 50 });
  assert.equal(pz.SIZES.map((s) => s.id).join(','), 'petite,moyenne,grande,u');
});
ok('sans groupe Taille : un seul prix (« u »), décimales gardées', () => {
  assert.deepEqual(clone(pz.PIZZAS[2].prices), { u: 12.5 });
});
ok('le groupe « Pâte » est la pâte ; la pizza sans pâte n\'en propose pas', () => {
  assert.equal(pz.PIZZAS[0].pates.map((c) => c.name).join(','), 'Fine,Épaisse');
  assert.equal(pz.PIZZAS[1].pates, null);
});
ok('linePrice : une ligne réelle porte son prix unitaire figé', () => {
  assert.equal(pz.linePrice({ unit: 45, qty: 2 }), 90);
  assert.equal(pz.linePrice({ unit: 12.5, qty: 3 }), 37.5);
});
ok('le prix d\'une ligne ne bouge pas quand la carte change', () => {
  const ln = { unit: 45, qty: 1, label: 'Margherita' };
  pz.applyCarte({ items: [{ id: 'mg', name: 'Margherita', price: 99, catName: 'Pizzas', groups: [] }] });
  assert.equal(pz.linePrice(ln), 45);
  pz.applyCarte(CARTE);
});
ok('boisson supprimée de la carte : la ligne garde libellé et prix', () => {
  const d = pz.drinkOf({ did: 'gone', label: 'Orangina', unit: 11, qty: 1 });
  assert.equal(d.label, 'Orangina'); assert.equal(d.price, 11);
});
pz.setSettings({ zones: [{ id: 'z1', label: 'Centre', fee: '15', eta: '30 min' }, { id: '', label: 'sans id', fee: 5 }, { id: 'z2', label: 'Port', fee: -3 }], halfFee: '4', bakeMin: '9' });
pz.applySettings();
ok('réglages : zones nettoyées (id et libellé requis, frais >= 0)', () => {
  assert.deepEqual(clone(pz.ZONES), [{ id: 'z1', label: 'Centre', fee: 15, eta: '30 min' }, { id: 'z2', label: 'Port', fee: 0, eta: '' }]);
  assert.equal(pz.ZONE.z1.fee, 15);
});
ok('réglages : moitié-moitié et cuisson lus ; vide = pas de moitié-moitié', () => {
  assert.equal(pz.halfFee(), 4); assert.equal(pz.bake(), 9 * 60000);
  pz.setSettings({ halfFee: '' }); pz.applySettings();
  assert.equal(pz.halfFee(), null);
  pz.setSettings({ halfFee: 0 }); pz.applySettings();
  assert.equal(pz.halfFee(), 0, '0 MAD est un supplément valable');
  assert.equal(pz.bake(), 12 * 60000, 'cuisson par défaut quand rien n\'est saisi');
});
ok('zoneOf : l\'instantané pris à la commande prime sur la zone courante', () => {
  pz.setSettings({ zones: [{ id: 'z1', label: 'Centre', fee: 20 }] }); pz.applySettings();
  assert.equal(pz.zoneOf({ zone: 'z1', zoneSnap: { id: 'z1', label: 'Centre', fee: 15 } }).fee, 15);
  assert.equal(pz.zoneOf({ zone: 'z1' }).fee, 20);
  assert.equal(pz.zoneOf({ zoneSnap: { id: 'libre', label: 'Hay Salam', fee: 18 } }).label, 'Hay Salam');
  assert.equal(pz.zoneOf({ zone: 'supprimee' }).fee, 0, 'zone disparue : jamais d\'exception');
});
ok('démo : les tableaux de démo restent derrière pvReal()', () => {
  assert.match(PZ, /const PIZZAS = pvReal\(\) \? \[\] : \[/);
  assert.match(PZ, /let HALF_FEE = pvReal\(\) \? null : 5;/);
  assert.match(PZ, /const ZONES = pvReal\(\) \? \[\] : \[/);
  assert.match(PZ, /if \(pvReal\(\) && carteApi\) \{ ?applyCarte\(carteApi\.read\(\)\); ?carteApi\.watch\(applyCarte\)/);
});

/* ═══════════════ 2 · TRAITEUR : devis, extras, J−n ═══════════════ */
console.log('\ntraiteur · devis, extras et conditions');
const trCode = `
  const DISH = {}, EXTRA = {}; const DAY = 86400000;
  const fmtN = (n) => String(n); const fmtMAD = (n) => n + ' MAD';
  ${line(TR, /  const plu = .*;/)}
  ${line(TR, /  const genericPack = .*;/)}
  ${grab(TR, 'function dishOf(x, id)')}
  ${grab(TR, 'function extraCalc(def, g)')}
  ${grab(TR, 'function extraOf(x, id)')}
  ${line(TR, /  const extraCost = .*;/)}
  ${line(TR, /  const extraLine = [\s\S]*?\n  };/)}
  ${line(TR, /  function perPerson\(ev\) \{.*\}/)}
  ${grab(TR, 'function evTotals(ev)')}
  let DEFAULT_TERMS = { c: 30, j7: 50, valid: 7, off: 7 };
  ${grab(TR, 'function termsOf(x)')}
  ${grab(TR, 'function buildTranches(ev)')}
  globalThis.T = { dishOf, extraOf, extraCost, extraLine, evTotals, termsOf, buildTranches, DISH, EXTRA,
    setDefault: (t) => { DEFAULT_TERMS = t; } };
`;
const tr = run(trCode).T;
const DAYMS = 86400000;
const snap = { dishes: { tajine: { id: 'tajine', label: 'Tajine poulet', sub: '', course: 'plats', price: 80 }, pastilla: { id: 'pastilla', label: 'Pastilla', sub: '', course: 'entrees', price: 45 } },
  extras: { serveur: { id: 'serveur', label: 'Serveur', mode: 'groupe', per: 20, unit: 'serveur', each: 300 }, vaisselle: { id: 'vaisselle', label: 'Vaisselle', mode: 'invite', unit: 'couvert', each: 12 }, livr: { id: 'livr', label: 'Livraison', mode: 'forfait', each: 600 } } };
const mkEv = (o = {}) => Object.assign({ guests: 100, menu: ['tajine', 'pastilla'], extras: ['serveur', 'vaisselle', 'livr'], date: new Date('2026-12-20T18:00:00Z'), status: 'devis', snap: clone(snap) }, o);
ok('réel : aucun plat ni extra de démo (DISH / EXTRA vides)', () => {
  assert.equal(Object.keys(tr.DISH).length, 0); assert.equal(Object.keys(tr.EXTRA).length, 0);
  assert.match(TR, /const DISHES = pvReal\(\) \? \[\] : \[/);
  assert.match(TR, /const EXTRAS = pvReal\(\) \? \[\] : \[/);
});
ok('plat de l\'instantané : prix par personne × invités', () => {
  const t = tr.evTotals(mkEv());
  assert.equal(t.pp, 125); assert.equal(t.menuTotal, 12500);
});
ok('extras : forfait / par invité / par groupe', () => {
  const ev = mkEv();
  assert.equal(tr.extraCost('livr', 100, ev), 600);
  assert.equal(tr.extraCost('vaisselle', 100, ev), 1200);
  assert.equal(tr.extraCost('serveur', 100, ev), 5 * 300);
  assert.equal(tr.extraCost('serveur', 101, ev), 6 * 300, 'un groupe entamé compte');
  assert.equal(tr.evTotals(ev).total, 12500 + 600 + 1200 + 1500);
});
ok('libellé d\'un extra : forfait seul, ou « n unités × prix »', () => {
  const ev = mkEv();
  assert.equal(tr.extraLine('livr', 100, ev), 'forfait');
  assert.equal(tr.extraLine('serveur', 100, ev), '5 serveurs × 300 MAD');
});
ok('le devis garde son prix quand la carte bouge (instantané)', () => {
  const ev = mkEv();
  const before = tr.evTotals(ev).total;
  tr.DISH.tajine = { id: 'tajine', label: 'Tajine', price: 500, pack: () => '' };
  assert.equal(tr.evTotals(ev).total, before);
  delete tr.DISH.tajine;
});
ok('plat inconnu et sans instantané : 0, jamais d\'exception', () => {
  const d = tr.dishOf({}, 'fantome');
  assert.equal(d.price, 0); assert.equal(d.label, 'fantome');
  assert.equal(tr.extraCost('fantome', 50, {}), 0);
});
ok('conditions : 30 / 50 / 20 et J−7 par défaut', () => {
  const t = tr.termsOf({});
  assert.deepEqual(clone(t), { c: 30, j7: 50, valid: 7, off: 7, solde: 20 });
});
ok('conditions : décalage J−n réglable, borné à 1..90', () => {
  assert.equal(tr.termsOf({ terms: { c: 30, j7: 50, valid: 7, off: 10 } }).off, 10);
  assert.equal(tr.termsOf({ terms: { c: 30, j7: 50, valid: 7, off: 200 } }).off, 7);
  assert.equal(tr.termsOf({ terms: { c: 30, j7: 50, valid: 7, off: 0 } }).off, 7);
});
ok('conditions : 70 + 40 > 99 retombe sur les valeurs par défaut', () => {
  const t = tr.termsOf({ terms: { c: 70, j7: 40, valid: 7, off: 7 } });
  assert.equal(t.c, 30); assert.equal(t.j7, 50);
});
ok('conditions réglées dans Menu › Caisse = nouvelle valeur par défaut', () => {
  tr.setDefault({ c: 25, j7: 45, valid: 14, off: 10 });
  assert.deepEqual(clone(tr.termsOf({})), { c: 25, j7: 45, valid: 14, off: 10, solde: 30 });
  tr.setDefault({ c: 30, j7: 50, valid: 7, off: 7 });
});
ok('échéancier : la somme des tranches = le total, au centime près', () => {
  const ev = mkEv({ guests: 37 });
  const tr3 = tr.buildTranches(ev);
  assert.equal(tr3.reduce((s, t) => s + t.amount, 0), tr.evTotals(ev).total);
  assert.equal(tr3.length, 3);
});
ok('échéancier : la tranche « J−n » tombe n jours avant l\'événement', () => {
  const ev = mkEv({ terms: { c: 30, j7: 50, valid: 7, off: 10 } });
  const t2 = tr.buildTranches(ev)[1];
  assert.equal(t2.label, 'À J−10');
  assert.equal(new Date(ev.date).getTime() - new Date(t2.due).getTime(), 10 * DAYMS);
  assert.equal(tr.buildTranches(mkEv())[1].label, 'À J−7');
});
ok('source : le décalage se règle sur le devis et se lit partout', () => {
  assert.match(TR, /id="tr-q-to"/);
  assert.doesNotMatch(TR, /À J−7['`]/, 'plus de « J−7 » écrit en dur dans un libellé');
  assert.match(TR, /const blankDraft = \(\) => \(\{[\s\S]{0,400}terms: null/);
});

/* ═══════════════ 3 · BOULANGERIE : prix et produits figés ═══════════════ */
console.log('\nboulangerie · dernière heure, produits dérivés et libres');
const bkCode = `
  const pvReal = () => true;
  const PROD = {}, CATALOG = [], FOURNEES = []; const state = { lastHour: false, ticket: [], cat: 'tous' };
  let LH_PCT = 50; let root = null; const carteApi = null; let SETTINGS = {}; const settingsApi = { get: () => SETTINGS };
  const PARTS = [], PART = {}, PARFUMS = [];
  const renderCats = () => {}, renderGrid = () => {}, renderTicket = () => {}, refreshOps = () => {}, renderJour = () => {}, icons = () => {};
  let carteSnap = null, carteSkipped = 0;
  ${line(BK, /  const effPrice = .*;/)}
  ${grab(BK, 'function applyCarte(c)')}
  ${grab(BK, 'function ensureSnap(l)')}
  ${grab(BK, 'function applySettings()')}
  globalThis.T = { PROD, CATALOG, state, effPrice, applyCarte, ensureSnap, applySettings, PARTS, PARFUMS,
    lh: () => LH_PCT, setSettings: (s) => { SETTINGS = s; } };
`;
const bk = run(bkCode).T;
ok('réel : catalogue vide avant la carte', () => {
  assert.match(BK, /CATALOG\.splice\(0\)|pvReal\(\) \? \[\] :/);
  assert.equal(bk.CATALOG.length, 0);
});
bk.applyCarte({ items: [
  { id: 'bg', name: 'Baguette', desc: '', price: 1.2, catName: 'Pains', catId: 'c1', groups: [] },
  { id: 'cr', name: 'Croissant', desc: '', price: 3.5, catName: 'Viennoiseries', catId: 'c2', groups: [] },
] });
ok('un article = un produit, une catégorie = un rayon ; centimes gardés', () => {
  assert.deepEqual(clone(bk.CATALOG.map((c) => c.label)), ['Pains', 'Viennoiseries']);
  assert.equal(bk.PROD.bg.price, 1.2);
});
ok('dernière heure : remise réglable, appliquée au prix, au centime', () => {
  bk.state.lastHour = true;
  assert.equal(bk.effPrice(bk.PROD.cr), 1.75, '50 % par défaut');
  bk.setSettings({ lastHourPct: 40 }); bk.applySettings();
  assert.equal(bk.lh(), 40);
  assert.equal(bk.effPrice(bk.PROD.cr), 2.1);
  bk.PROD.cr.price = 1.25; bk.setSettings({ lastHourPct: 50 }); bk.applySettings();
  assert.equal(bk.effPrice(bk.PROD.cr), 0.62, 'demi-centime : arrondi en dessous, jamais 0,63');
  bk.PROD.cr.price = 1.2; bk.setSettings({ lastHourPct: 30 }); bk.applySettings();
  assert.equal(bk.effPrice(bk.PROD.cr), 0.84, '1,2 × 70 = 83,999… reste 0,84');
  bk.PROD.cr.price = 3.5;
  bk.setSettings({ lastHourPct: 120 }); bk.applySettings();
  assert.equal(bk.lh(), 50, 'hors 1..90 : valeur par défaut');
  bk.state.lastHour = false;
  assert.equal(bk.effPrice(bk.PROD.cr), 3.5);
});
ok('réglages gâteaux : format sans prix ou sans libellé écarté', () => {
  bk.setSettings({ cakeParts: [{ id: 'p6', label: '6 parts', price: '180' }, { id: 'px', label: 'sans prix', price: 0 }, { id: '', label: 'x', price: 10 }], parfums: ['Chocolat', '  ', 'Vanille'] });
  bk.applySettings();
  assert.equal(bk.PARTS.length, 1); assert.equal(bk.PARTS[0].price, 180);
  assert.deepEqual(clone(bk.PARFUMS), ['Chocolat', 'Vanille']);
});
ok('un produit dérivé ou libre se reconstruit depuis sa ligne', () => {
  const l = { prodId: 'free_1', snap: { label: 'Gâteau maison', price: 42.5, cat: 'libre', free: true } };
  assert.equal(bk.PROD.free_1, undefined);
  bk.ensureSnap(l);
  assert.equal(bk.PROD.free_1.price, 42.5); assert.equal(bk.PROD.free_1.free, true);
});
ok('un produit retiré de la carte reste connu d\'un ticket qui le porte', () => {
  const l = { prodId: 'gone', snap: { label: 'Msemen', price: 2, cat: 'libre' } };
  bk.state.ticket = [l];
  bk.applyCarte({ items: [{ id: 'bg', name: 'Baguette', price: 1.2, catName: 'Pains', catId: 'c1', groups: [] }] });
  assert.equal(bk.state.ticket.length, 1, 'la ligne survit à la carte retouchée');
});
ok('« ticket » au singulier pour 0 et 1 (français)', () => {
  assert.doesNotMatch(BK, /tickets? \$\{[^}]*\} ?>? ?1 ?\?/);
});

/* ═══════════════ 4 · FAST-FOOD et FOOD TRUCK : carte du commerçant ═══════════════ */
console.log('\nfast-food et food truck · carte du commerçant');
for (const [name, src] of [['fast-food', FF], ['food truck', FT]]) {
  ok(`${name} : lit la carte du commerçant (KiwiVerticalCarte), démo derrière pvReal()`, () => {
    assert.match(src, /KiwiVerticalCarte/);
    assert.match(src, /pvReal\(\) \? \[\] : \[/);
  });
}

/* ═══════════════ 5 · tableau de bord : lecture seule de la caisse ═══════════════ */
console.log('\ntableau de bord · ce que la caisse a enregistré');
const twCode = `
  const L = (fr, en, ar) => ({ fr, en, ar }); const pick = (o) => (o && o.fr) || '';
  const UI = { currency: L('MAD', 'MAD', 'د.م') }; const lang = () => 'fr';
  let DOCS = {}; const tillDoc = (v) => DOCS[v] || null;
  const money = (n) => String(Math.round((+n || 0) * 100) / 100);
  ${grab(TW, 'const TILL = {')};
  ${grab(TW, 'function when(v, withTime)')}
  const mad = (n) => money(n) + ' ' + pick(UI.currency);
  ${line(TW, /  const evTotal = .*;/)}
  ${line(TW, /  const evPaid = .*;/)}
  ${grab(TW, 'function tillCards(cfg)')}
  globalThis.T = { tillCards, setDocs: (d) => { DOCS = d; } };
`;
const tw = run(twCode).T;
const D1 = '2026-12-20T18:00:00Z';
tw.setDocs({
  traiteur: { events: [
    { id: 'e1', status: 'devis', name: 'Mariage Alami', client: 'Alami', date: D1, devisRef: 'D-001', guests: 120, tranches: [{ amount: 1000 }, { amount: 2000 }] },
    { id: 'e2', status: 'acompte', name: 'Anniversaire', client: 'Idrissi', date: D1, guests: 40, tranches: [{ amount: 300, paid: 1 }, { amount: 700, due: '2020-01-01', pct: 70 }] },
  ] },
  pizzeria: { customers: [{ id: 'c1', name: 'Karim' }], orders: [
    { id: 'P-1', mode: 'livraison', custId: 'c1', address: 'Rue 5', zoneSnap: { label: 'Centre', fee: 15 }, createdAt: 1, lines: [{ unit: 45, qty: 2 }], pay: { paid: 105 }, jobs: [{ status: 'prete' }] },
    { id: 'P-2', mode: 'surplace', createdAt: 2, lines: [{ unit: 40, qty: 1 }], pay: { paid: 0 }, jobs: [{ status: 'four' }, { status: 'file' }] },
  ] },
  boulangerie: { cakes: [{ id: 'G-1', name: 'Anniv', status: 'prep', retrait: D1, price: 300, paid: 100, partsLabel: '8 parts' }], batches: [], don: null, catalog: [] },
});
ok('traiteur · devis : seuls les devis envoyés', () => {
  const c = tw.tillCards({ trade: 'traiteur', nav: 'quotes' });
  assert.equal(c.length, 1); assert.match(c[0].title, /D-001 · Mariage Alami/);
  assert.ok(c[0].meta.some((m) => String(m[1]).includes('3000')), 'montant = somme des tranches');
});
ok('traiteur · acomptes : reçu, reste, échéance dépassée signalée', () => {
  const c = tw.tillCards({ trade: 'traiteur', nav: 'deposits' });
  assert.equal(c.length, 1);
  assert.equal(c[0].alert, 'Échéance dépassée');
  assert.deepEqual(clone(c[0].meta.slice(0, 2).map((m) => m[1])), ['300 MAD', '700 MAD']);
});
ok('pizzeria · livraisons : total = lignes + frais de la zone figée, payée détectée', () => {
  const c = tw.tillCards({ trade: 'pizzeria', nav: 'delivery' });
  assert.equal(c.length, 1);
  const tot = c[0].meta.find((m) => m[0].fr === 'Montant')[1];
  assert.match(tot, /^105 MAD · Payée$/);
  assert.equal(c[0].status, 'Prête');
});
ok('pizzeria · cuisine : seules les commandes pas encore prêtes', () => {
  const c = tw.tillCards({ trade: 'pizzeria', nav: 'kds' });
  assert.equal(c.length, 1); assert.equal(c[0].title, 'P-2'); assert.equal(c[0].status, 'Au four');
});
ok('boulangerie · gâteaux : solde = prix − acompte', () => {
  const c = tw.tillCards({ trade: 'bakery', nav: 'tables' });
  assert.equal(c.length, 1);
  assert.equal(c[0].meta.find((m) => m[0].fr === 'Solde')[1], '200 MAD');
});
ok('démo ou caisse muette : aucune carte (jamais de données inventées)', () => {
  tw.setDocs({});
  assert.equal(tw.tillCards({ trade: 'traiteur', nav: 'quotes' }).length, 0);
  assert.equal(tw.tillCards({ trade: 'pizzeria', nav: 'delivery' }).length, 0);
  assert.equal(tw.tillCards({ trade: 'bakery', nav: 'tables' }).length, 0);
  assert.match(TW, /if \(!window\.KiwiEnv\?\.isReal\?\.\(\)\) return null;/);
});
ok('lecture seule : le tableau de bord n\'écrit jamais l\'état de la caisse', () => {
  const body = grab(TW, 'function tillDoc(vertical)');
  assert.doesNotMatch(body, /\.set\(|\.save\(|\.put\(/);
});

/* ═══════════════ 6 · réglages : stockage, éditeur, i18n ═══════════════ */
console.log('\nréglages de caisse · stockage et éditeur');
ok('serveur : le document `foodtrade` existe, écrit par la session propriétaire seulement', () => {
  assert.match(STORE, /foodtrade:\s+\{ keys: \['pizzeria', 'traiteur', 'boulangerie'\]/);
  assert.match(STORE, /OWNER_EDIT_FEATURES[\s\S]{0,400}'foodtrade'/);
});
ok('vertical-state : KiwiVerticalSettings et KiwiVerticalCarte exportés', () => {
  assert.match(VS, /window\.KiwiVerticalSettings\s*=/);
  assert.match(VS, /window\.KiwiVerticalCarte\s*=/);
  assert.match(VS, /KiwiStore\.define\('foodtrade'/);
});
const D = vm.runInNewContext('(' + grab(FS, 'var D = {').replace(/^var D = /, '') + ')');
ok('éditeur : fr, en et ar ont exactement les mêmes clés', () => {
  const k = (l) => Object.keys(D[l]).sort().join(',');
  assert.equal(k('en'), k('fr')); assert.equal(k('ar'), k('fr'));
});
ok('éditeur : aucune valeur vide, aucun tiret cadratin dans le texte affiché', () => {
  for (const l of ['fr', 'en', 'ar']) for (const [key, v] of Object.entries(D[l])) {
    assert.ok(String(v).trim(), `${l}.${key} vide`);
    assert.ok(!String(v).includes('—'), `${l}.${key} contient U+2014`);
  }
});
ok('éditeur : n\'est proposé qu\'au réel, pour pizzeria / traiteur / boulangerie', () => {
  const win = { KiwiVenue: { getCurrentVenueData: () => ({ subtype: 'pizzeria' }) }, KiwiEnv: { isReal: () => true } };
  const ctx = vm.createContext({ window: win, document: { addEventListener() {}, readyState: 'loading' }, localStorage: { getItem: () => 'fr' }, Math, JSON, Date, Number, String, Object, Array, setTimeout, console });
  vm.runInContext(FS, ctx);
  const A = win.KiwiFoodTradeSettings;
  assert.equal(A.enabled(), true); assert.equal(A.tradeOf(), 'pizzeria');
  win.KiwiVenue.getCurrentVenueData = () => ({ type: 'bakery' }); assert.equal(A.tradeOf(), 'boulangerie');
  win.KiwiVenue.getCurrentVenueData = () => ({ type: 'restaurant' }); assert.equal(A.enabled(), false);
  win.KiwiVenue.getCurrentVenueData = () => ({ subtype: 'traiteur' }); win.KiwiEnv.isReal = () => false;
  assert.equal(A.enabled(), false, 'démo : pas d\'éditeur');
});
ok('tableau de bord : l\'onglet « Caisse » du Menu monte l\'éditeur, le script est chargé', () => {
  assert.match(DASH, /assets\/food-trade-settings\.js\?v=\d+/);
  assert.match(MW, /KiwiFoodTradeSettings/);
  assert.match(MW, /TAB_ICONS\s*=\s*\{[^}]*caisse:\s*'point_of_sale'/);
});

/* ═══════════════ 7 · accueil : « réguliers » sans source ═══════════════ */
console.log('\naccueil · clients réguliers sans source');
ok('réel : sans client identifié sur la période, réguliers = tiret (pas 0), propagé à fidélité et nouveaux clients', () => {
  /* La source est le carnet clients (tools/client-mix-test.mjs) ; sans
     passage identifié, le tiret reste. */
  assert.match(DR, /regulars: data\.regulars \? \(mix\.visitors[\s\S]{0,300}: \{ \.\.\.data\.regulars, text: '·'/);
  const ret = grab(DR, 'retention:  {');
  assert.match(ret, /d\.regulars\.text === '·'/);
  const nc = grab(DR, 'newClients: {');
  assert.match(nc, /d\.regulars\.text === '·'/);
});
ok('démo : réguliers / fidélité / nouveaux clients dérivent toujours du total', () => {
  assert.match(grab(DR, 'newClients: {'), /d\.tx\.value - d\.regulars\.value/);
});

console.log('\nfeature-truth · frais de livraison, compteurs clients, options du traiteur');
const COST = read('assets/cost.js');
ok('marges : une ligne `fee` (livraison) rejoint les frais, jamais « à chiffrer »', () => {
  assert.match(PZ, /category: 'livraison', qty: 1, unit: 'service', kind: 'fee', total \}/);
  const at = COST.indexOf('rows.forEach(({ l, lineNo, qty, listed }) => {'); assert.ok(at > 0); const body = COST.slice(at, at + 2400);
  assert.match(body, /=== 'fee'\) \{ out\.unitemisedAmt \+= collected; out\.feeAmt \+= collected; return; \}/);
  assert.ok(body.indexOf("=== 'fee'") < body.indexOf('out.lines.push(row)'), 'la ligne de frais sort avant d\'entrer au registre des marges');
});
ok('pizzeria : la fiche client compte chaque commande validée', () => {
  const body = grab(PZ, 'function commitOrder(o)');
  const ctx = run(`const CUST = { k1: { id: 'k1', orders: 0 } }; const JOB = {}; const ORDERS = []; let seq = 1;
    const freshTicket = () => {}, renderTicket = () => {}, renderBadges = () => {}, renderStats = () => {}, queueIfOffline = () => {};
    const window = {}; const toast = () => {}; const destLabel = () => ''; const pvReal = () => true;
    ${body.replace(/try \{\s*if \(window\.KiwiFoodProductionPrint[\s\S]*?\} catch \(_\) \{\}/, '').replace(/const n = o\.jobs\.length;[\s\S]*$/, '}')}
    commitOrder({ id: 'M-1', custId: 'k1', jobs: [], lines: [] });
    commitOrder({ id: 'M-2', custId: 'k1', jobs: [], lines: [] });
    commitOrder({ id: 'M-3', custId: null, jobs: [], lines: [] });
    globalThis.N = CUST.k1.orders;`);
  assert.equal(ctx.N, 2);
});
ok('traiteur : un plat à options ouvre la feuille de la carte et fige le choix par personne', () => {
  assert.match(TR, /groups: Array\.isArray\(it\.groups\) && it\.groups\.length \? it\.groups : null/);
  assert.match(TR, /carteApi\.sheet\(\{ title: dish\.label/);
  assert.match(TR, /price: r && r\.unit != null \? \+r\.unit : dish\.price/);
  assert.match(TR, /\.\.\.\(d\.base \? \{ base: d\.base \} : \{\}\), \.\.\.\(Array\.isArray\(d\.o\) && d\.o\.length \? \{ o: d\.o \} : \{\}\)/);
  // la variante est vendue sous l'article de la carte, options × invités
  const ev = { guests: 50, menu: ['tj~Frites'], extras: [], snap: { dishes: { 'tj~Frites': { id: 'tj~Frites', base: 'tj', label: 'Tajine (Frites)', course: 'plats', price: 95, o: [{ id: 'opt-frites', qty: 1 }] } }, extras: {} } };
  const code = `const DISH = {}, EXTRA = {}; const fmtN = (n) => String(n);
    ${line(TR, /  const plu = .*;/)}
    ${line(TR, /  const genericPack = .*;/)}
    ${grab(TR, 'function dishOf(x, id)')}
    ${grab(TR, 'function extraCalc(def, g)')}
    ${grab(TR, 'function extraOf(x, id)')}
    ${grab(TR, 'function eventSaleLines(ev, received)')}
    globalThis.L = JSON.stringify(eventSaleLines(${JSON.stringify(ev)}, 4750));`;
  const out = JSON.parse(run(code).L);
  assert.equal(out[0].itemId, 'tj'); assert.equal(out[0].name, 'Tajine (Frites)'); assert.equal(out[0].total, 4750);
  assert.equal(JSON.stringify(out[0].options), JSON.stringify([{ id: 'opt-frites', qty: 50 }]));
});
ok('caisse : une fiche arrivée d\'une autre caisse ne remplace pas le ticket en cours', () => {
  assert.match(VS, /var LOCAL = Array\.isArray\(spec\.local\) \? spec\.local : \['ticket', 'draft', 'cart'\];/);
  assert.match(VS, /var incoming = row\.data, /);
  assert.match(VS, /restore\(keepLocal\(merged\)\);/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
