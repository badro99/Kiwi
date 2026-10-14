#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Import de la carte : ne rien casser de ce qui est déjà là
 *
 *  1. Un prix illisible (« sur demande ») valait 0 : un plat existant passait à
 *     0 MAD, un plat nouveau était créé gratuit. Il est désormais ignoré (prix
 *     conservé) ou refusé (article nouveau non créé).
 *  2. Un réimport rallumait (`avail: true`) les articles que le commerçant
 *     avait éteints à la main, dès que la colonne `disponible` était vide ou
 *     disait « oui ». Seul un « non » explicite change la disponibilité d'un
 *     article existant.
 * ─────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/catalog-import.js', import.meta.url), 'utf8');
const doc = { seq: 0, cats: [], items: [] };
const nid = (p) => p + '_' + (++doc.seq);
const noopEl = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
  setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
const win = {
  addEventListener() {}, removeEventListener() {},
  document: { createElement: noopEl, getElementById: () => null, head: noopEl(), body: noopEl(), documentElement: { lang: 'fr' } },
  KiwiMenuStore: {
    categories: () => doc.cats, items: () => doc.items,
    addCategory: (name) => { doc.cats.push({ id: nid('cat'), name: String(name), sub: [] }); return doc; },
    addSubcategory: (id, name) => { const c = doc.cats.find((x) => x.id === id); if (c) c.sub.push({ id: nid('sub'), name }); return doc; },
    addItem: (d) => { doc.items.push({ id: nid('it'), name: d.name, price: +d.price || 0, catId: d.catId || null, subId: d.subId || null, desc: d.desc || '', avail: d.avail !== false }); return doc; },
    updateItem: (id, patch) => { Object.assign(doc.items.find((x) => x.id === id), patch); return doc; },
  },
};
win.window = win; win.document.defaultView = win;
const ctx = vm.createContext({ window: win, document: win.document, console, Intl, Math, JSON, Date, setTimeout, clearTimeout });
vm.runInContext(source, ctx, { filename: 'assets/catalog-import.js' });
const IMP = win.KiwiCatalogImport;

const run = (csv) => { const plan = IMP.analyseMenu(IMP.parse(csv)); assert.ok(plan.ok, 'plan'); const res = IMP.applyMenu(plan); return { plan, res }; };
const item = (n) => doc.items.find((i) => i.name === n);

run('article,categorie,prix_mad,disponible\nHarira,Soupes,28,oui\nTajine,Plats,95,oui\n');
assert.equal(doc.items.length, 2);
// Le commerçant éteint la harira à la main.
item('Harira').avail = false;

// 1 · prix illisible sur un article existant : le prix reste.
let r = run('article,categorie,prix_mad\nTajine,Plats,sur demande\n');
assert.equal(item('Tajine').price, 95, 'prix illisible : le prix existant est conservé, pas écrasé par 0');
assert.ok(r.plan.issues.some((x) => /prix illisible/.test(x.msg) && /conservé/.test(x.msg)), 'le plan le signale');

// 1b · prix illisible sur un article nouveau : pas créé.
r = run('article,categorie,prix_mad\nCouscous,Plats,beaucoup\n');
assert.equal(item('Couscous'), undefined, 'un article nouveau au prix illisible n\'est pas créé gratuit');
assert.equal(r.plan.counts.newItems, 0);
assert.ok(r.plan.issues.some((x) => x.level === 'skip' && /non créé/.test(x.msg)));

// 2 · colonne `disponible` absente : l'article éteint le reste.
run('article,categorie,prix_mad\nHarira,Soupes,30\n');
assert.equal(item('Harira').avail, false, 'sans colonne, un réimport ne rallume pas l\'article éteint');
assert.equal(item('Harira').price, 30, 'mais le prix lisible est bien mis à jour');
// colonne présente et « oui » : ne rallume pas non plus.
run('article,categorie,prix_mad,disponible\nHarira,Soupes,30,oui\n');
assert.equal(item('Harira').avail, false, '« oui » ne rallume pas ce que le commerçant a éteint');
// colonne vide.
run('article,categorie,prix_mad,disponible\nHarira,Soupes,30,\n');
assert.equal(item('Harira').avail, false, 'cellule vide : disponibilité inchangée');
// « non » explicite éteint un article allumé.
run('article,categorie,prix_mad,disponible\nTajine,Plats,95,non\n');
assert.equal(item('Tajine').avail, false, '« non » explicite éteint');
// un article nouveau reste disponible par défaut.
run('article,categorie,prix_mad\nMsemen,Petit-déjeuner,14\n');
assert.equal(item('Msemen').avail, true, 'un article nouveau est disponible par défaut');
assert.equal(item('Msemen').price, 14);

console.log('menu-import-preserve-test: ok');
