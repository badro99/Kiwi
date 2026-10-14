#!/usr/bin/env node
// OrderPro · la page d'accueil du client (assets/orderpro-guest.js).
//
// Exécute le module livré dans un bac à sable, sans navigateur :
//   · chaque texte existe en français, en anglais et en arabe, sans tiret
//     cadratin ni « (s) » ;
//   · un filtre « sans lait » ne montre jamais un plat sans fiche ;
//   · chaque Sudoku a UNE solution, cohérente avec la grille ;
//   · « même tournée » recalcule le prix au centime près ;
//   · le temps annoncé est celui du plat le plus lent connu ;
//   · un pseudo est fait de lettres et de chiffres ;
//   · « servir au ftour » ne part que dans la fenêtre du serveur ;
//   · OrderPro.html n'appelle le module que par des crochets gardés, et
//     chaque crochet existe.
// Run: node tools/orderpro-guest-hub-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../assets/orderpro-guest.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../OrderPro.html', import.meta.url), 'utf8');

let passed = 0, failed = 0;
function ok(name, run) {
  try { run(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message.split('\n')[0]); }
}

function load({ menu = [], opt = {}, lang = 'fr' } = {}) {
  const I18N = { fr: {}, en: {}, ar: {} };
  const ctx = vm.createContext({
    Math, Number, String, JSON, Set, Map, Array, Object, Promise, Intl, Date, isFinite,
    setTimeout, clearTimeout, setInterval, clearInterval,
    I18N, currentLang: lang,
    t: (k) => (I18N[ctx.currentLang] && I18N[ctx.currentLang][k]) || k,
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    MENU: menu, OPT: opt, MENU_ALL: new Map(menu.map((m) => [m.id, m])),
    itemOf: (id) => menu.find((m) => m.id === id), nameOf: (id) => (menu.find((m) => m.id === id) || {}).name || '',
    toCents: (v) => Math.round((Number(v) || 0) * 100),
    money: (v) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2).replace('.', ',').replace(/,00$/, '') + ' MAD',
    lineKey: (id, options, note) => id + '|' + JSON.stringify(options || {}) + '|' + (note || ''),
    NET: { slug: 'cafe-test' }, SESSION: { id: 'tsx-test' }, STORE: { name: 'Café Test' },
    tableNumber: '4', orderMode: 'table', sentOrders: [], sentLines: [], sessionTotal: 0,
    cart: new Map(),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => null, querySelector: () => null, addEventListener() {} },
  });
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.runInContext(src, ctx, { filename: 'orderpro-guest.js' });
  return { ctx, api: ctx.KiwiGuest, x: ctx.KiwiGuest._test, I18N };
}

console.log('OrderPro · la page d’accueil du client');

ok('chaque texte gx_ existe en FR, EN et AR, sans tiret cadratin ni « (s) »', () => {
  const { I18N } = load();
  const fr = Object.keys(I18N.fr).filter((k) => k.startsWith('gx_'));
  assert.ok(fr.length > 60, 'module strings merged into I18N (' + fr.length + ')');
  for (const l of ['en', 'ar']) {
    const missing = fr.filter((k) => !(k in I18N[l]));
    assert.deepEqual(missing, [], l + ' misses ' + missing.join(', '));
    const extra = Object.keys(I18N[l]).filter((k) => k.startsWith('gx_') && !(k in I18N.fr));
    assert.deepEqual(extra, [], l + ' has keys FR lacks: ' + extra.join(', '));
  }
  for (const l of ['fr', 'en', 'ar']) {
    for (const [k, v] of Object.entries(I18N[l])) {
      assert.ok(!String(v).includes('—'), `${l}.${k} carries an em dash`);
      assert.ok(!/\((s|es)\)/.test(String(v)), `${l}.${k} uses a "(s)" plural`);
    }
  }
});

ok('le module ne met pas de tiret cadratin ni d’italique dans ses styles', () => {
  assert.ok(!src.includes('—'), 'no em dash anywhere in the module');
  assert.ok(!/font-style\s*:\s*italic/.test(src), 'no italic');
  assert.ok(!/background\s*:\s*#fff\b/i.test(src), 'no pure white background');
});

ok('un filtre actif cache les plats qui ont l’allergène ET ceux sans fiche', () => {
  const menu = [
    { id: 'a', name: 'Thé', allergens: [] },
    { id: 'b', name: 'Msemen', allergens: ['gluten', 'lait'] },
    { id: 'c', name: 'Cornes', allergens: ['fruits_a_coque'] },
    { id: 'd', name: 'Harira', allergens: null },
  ];
  const { x } = load({ menu });
  assert.deepEqual(menu.filter(x.dietAllows).map((m) => m.id), ['a', 'b', 'c', 'd'], 'no filter: everything shows');
  x.G.diet.add('lait');
  assert.deepEqual(menu.filter(x.dietAllows).map((m) => m.id), ['a', 'c'], 'dairy-free hides msemen and the unknown harira');
  x.G.diet.add('nuts');
  assert.deepEqual(menu.filter(x.dietAllows).map((m) => m.id), ['a'], 'nut-free also hides the gazelle horns');
});

ok('chaque Sudoku a une seule solution, que la grille respecte', () => {
  const { x } = load();
  for (const level of ['easy', 'medium', 'hard']) {
    const { grid, solution } = x.makeSudoku(level);
    assert.equal(grid.length, 81);
    assert.ok(solution.every((v) => v >= 1 && v <= 9), level + ': solution is full');
    solution.forEach((v, i) => assert.ok(x.okAt(solution.map((w, k) => (k === i ? 0 : w)), i, v), level + ': solution valid at ' + i));
    grid.forEach((v, i) => assert.ok(v === 0 || v === solution[i], level + ': given digit matches the solution'));
    assert.equal(x.solve(grid.slice(), true), 1, level + ': exactly one solution');
    const holes = grid.filter((v) => v === 0).length;
    assert.ok(holes >= 20 && holes <= 54, level + ': ' + holes + ' holes');
  }
});

ok('« même tournée » recalcule le prix au centime : 14,50 + 3,50 = 18', () => {
  const opt = { o1: { choices: [{ id: 'small', delta: 0 }, { id: 'big', delta: 3.5 }] }, o2: { choices: [{ id: 'x', delta: 0.1 }, { id: 'y', delta: 0.2 }] } };
  const { x } = load({ opt });
  assert.equal(x.unitPriceOf({ price: 14.5 }, { o1: 'big' }), 18);
  assert.equal(x.unitPriceOf({ price: 14.5 }, { o1: 'small' }), 14.5);
  assert.equal(x.unitPriceOf({ price: 1 }, { o2: ['x', 'y'] }), 1.3, 'multi-choice deltas add without float drift');
  assert.equal(x.unitPriceOf({ price: 10 }, { gone: 'z' }), 10, 'an option group that no longer exists adds nothing');
});

ok('le temps annoncé : le plat connu le plus lent, sinon la moyenne, sinon rien', () => {
  const { x } = load();
  assert.equal(x.estimate(['a']), null, 'no data, no promise');
  x.G.data = { waits: { overall: 12, items: { a: 8, b: 21 } } };
  assert.equal(x.estimate(['a', 'b']), 21);
  assert.equal(x.estimate(['a', 'zz']), 8);
  assert.equal(x.estimate(['zz']), 12);
  x.G.data = { waits: { overall: null, items: {} } };
  assert.equal(x.estimate(['zz']), null);
});

ok('un pseudo : 2 à 14 lettres ou chiffres, accents et arabe compris', () => {
  const { x } = load();
  for (const good of ['Yasmine', 'Ali 2', 'Zoé', 'سارة', 'team_4']) assert.ok(x.nickOk(good), good + ' accepted');
  for (const bad of ['', 'A', 'x'.repeat(15), '<b>', 'a@b', ' -x']) assert.ok(!x.nickOk(bad), JSON.stringify(bad) + ' refused');
});

ok('« servir au ftour » ne part qu’entre 2 minutes et 8 heures avant l’iftar', () => {
  const { api, x } = load();
  x.G.ftour = true;
  x.G.data = { ramadan: { today: Date.now() + 3 * 3600e3 } };
  assert.deepEqual({ ...api.orderExtras() }, { ftour: true });
  x.G.data = { ramadan: { today: Date.now() + 60e3 } };
  assert.deepEqual({ ...api.orderExtras() }, {}, 'too late: one minute left');
  x.G.data = { ramadan: { today: Date.now() + 9 * 3600e3 } };
  assert.deepEqual({ ...api.orderExtras() }, {}, 'too early');
  x.G.data = { ramadan: { today: Date.now() + 3 * 3600e3 } };
  x.G.ftour = false;
  assert.deepEqual({ ...api.orderExtras() }, {}, 'unticked');
  x.G.data = null; x.G.ftour = true;
  assert.deepEqual({ ...api.orderExtras() }, {}, 'Ramadan mode off');
});

ok('l’addition WhatsApp regroupe les lignes identiques et dit son périmètre', () => {
  const menu = [{ id: 't', name: 'Tajine', price: 85 }, { id: 'c', name: 'Café', price: 14.5 }];
  const { ctx, x } = load({ menu });
  ctx.sentLines = [{ id: 't', qty: 1, unitPrice: 85, options: {}, note: '' }, { id: 't', qty: 1, unitPrice: 85, options: {}, note: '' }, { id: 'c', qty: 1, unitPrice: 14.5, options: {}, note: '' }];
  ctx.sessionTotal = 184.5;
  const text = x.whatsappText();
  assert.match(text, /^Café Test · .* 4\n/);
  assert.match(text, /2× Tajine · 170 MAD/);
  assert.match(text, /1× Café · 14,50 MAD/);
  assert.match(text, /184,50 MAD/);
  assert.ok(text.trim().endsWith(ctx.I18N.fr.gx_wa_scope), 'ends on what the bill covers');
});

ok('OrderPro.html n’appelle le module que par des crochets gardés, qui existent tous', () => {
  const { api } = load();
  const calls = new Set();
  page.split('\n').forEach((line, i) => {
    const used = [...line.matchAll(/KiwiGuest\.([A-Za-z_]+)\s*\(/g)].map((m) => m[1]);
    if (!used.length) return;
    assert.ok(/globalThis\.KiwiGuest\s*(&&|\?|\))|!globalThis\.KiwiGuest\s*\|\|/.test(line), 'unguarded call at OrderPro.html:' + (i + 1));
    used.forEach((n) => calls.add(n));
  });
  assert.ok(calls.size >= 12, 'hooks found: ' + [...calls].join(', '));
  for (const n of calls) assert.equal(typeof api[n], 'function', 'KiwiGuest.' + n + ' exists');
  assert.match(page, /<script src="assets\/orderpro-guest\.js\?v=\d+"><\/script>\s*<\/body>/, 'loaded after the page script');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
