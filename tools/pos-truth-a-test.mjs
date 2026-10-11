#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * CAISSES MÉTIER, GROUPE A · CE QU'UN COMMERÇANT RÉEL VOIT, ET CE QUI EST VRAI
 *
 * Pharmacie, librairie, épicerie, boulangerie, food truck, fast-food, pizzeria
 * et traiteur ouvrent chez un vrai commerçant (caisse appairée) avec :
 *
 *  1. des données de démonstration présentées comme les siennes : stocks, lots
 *     de péremption, tableau de garde, « bientôt épuisé », listes scolaires,
 *     emplacements du camion, créneaux « 13h » du coup de feu ;
 *  2. un stock « non suivi » lu comme un stock à zéro (`null <= 0` est vrai en
 *     JavaScript) : tout le rayon barré « épuisé » ;
 *  3. des affirmations que rien ne soutenait : « la fournée du matin est
 *     sortie », « le n°1 », « pêche du jour », « annoncé au micro » sans micro ;
 *  4. une pastille « En ligne / Hors-ligne » basculée à la main, puis « Réseau
 *     de retour, 3 actions synchronisées » alors que rien n'était envoyé ;
 *  5. 12,50 MAD affiché « 13 MAD », « 0 ventes », la fournée numérotée 10 ;
 *  6. un devis de traiteur envoyé au client avec 30 / 50 / 20 % et 7 jours que
 *     le traiteur n'avait jamais choisis ;
 *  7. vertical-state : un terminal dont l'identité arrivait une seconde plus
 *     tard ne relisait jamais sa fiche enregistrée, puis l'écrasait.
 *
 * Les fonctions testées sont les vraies, extraites des fichiers et exécutées
 * dans un `vm` (le DOM n'est pas nécessaire pour elles). Le reste est tenu par
 * des assertions sur la source, là où le code n'est pas isolable.
 *
 *   node tools/pos-truth-a-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const VS = read('assets/vertical-state.js');
const MOD = {};
['pharmacie', 'librairie', 'epicerie', 'boulangerie', 'foodtruck', 'fastfood', 'pizzeria', 'traiteur']
  .forEach((id) => { MOD[id] = read(`assets/pos-${id}.js`); });

function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
/* One-line `const x = ...;` statement. */
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

/* ───────────────────────── vertical-state : réseau ───────────────────────── */
function loadVS({ env, store } = {}) {
  const listeners = {};
  const ls = new Map();
  const win = {
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    KiwiEnv: env, KiwiStore: store,
  };
  const ctx = vm.createContext({
    window: win,
    document: { readyState: 'loading', addEventListener() {}, visibilityState: 'visible' },
    navigator: { onLine: true },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) },
    setInterval: () => 0, setTimeout: () => 0, Date, Math, JSON, Map, Set, String, Number, Object, Array,
  });
  vm.runInContext(VS, ctx);
  return { win, ctx, listeners, ls };
}

ok('KiwiVerticalNet existe même sans le stockage des fiches, et ne l’exige pas', () => {
  const { win } = loadVS();
  assert.equal(typeof win.KiwiVerticalNet.status, 'function');
  assert.equal(typeof win.KiwiVerticalNet.change, 'function');
  assert.equal(win.KiwiVerticalState, undefined, 'sans KiwiStore, pas de KiwiVerticalState (comportement d’origine)');
});

ok('status lit navigator.onLine et la file d’envoi, pas un drapeau local', () => {
  const { win, ctx } = loadVS();
  win.KiwiLive = { queueStatus: () => ({ pending: 3, blocked: 0 }) };
  let st = win.KiwiVerticalNet.status();
  assert.equal(st.offline, false); assert.equal(st.queued, 3); assert.equal(st.blocked, false);
  ctx.navigator.onLine = false;
  st = win.KiwiVerticalNet.status();
  assert.equal(st.offline, true);
  win.KiwiLive = { queueStatus: () => ({ pending: 0, blocked: 2 }) };
  assert.equal(win.KiwiVerticalNet.status().blocked, true);
  win.KiwiLive = { queueStatus: () => ({ storageError: true }) };
  assert.equal(win.KiwiVerticalNet.status().blocked, true, 'un stockage en erreur est un blocage');
  win.KiwiLive = undefined;
  assert.equal(win.KiwiVerticalNet.status().queued, 0, 'sans file connue : zéro, jamais NaN');
});

ok('change ne dit « Réseau de retour » que sur un vrai changement, et jamais « synchronisé »', () => {
  const { win } = loadVS();
  const N = win.KiwiVerticalNet;
  assert.equal(N.change(false, { offline: false, queued: 0, blocked: false }), '', 'rien n’a changé');
  assert.equal(N.change(true, { offline: true, queued: 0, blocked: false }), '');
  assert.match(N.change(false, { offline: true, queued: 0, blocked: false }), /^Pas de réseau/);
  assert.equal(N.change(true, { offline: false, queued: 0, blocked: false }), 'Réseau de retour.');
  const back = N.change(true, { offline: false, queued: 3, blocked: false });
  assert.match(back, /3 ventes en cours d’envoi/);
  assert.doesNotMatch(back, /synchronis/);
  assert.match(N.change(true, { offline: false, queued: 1, blocked: false }), /1 vente en cours/);
  assert.match(N.change(true, { offline: false, queued: 2, blocked: true }), /bloquée/);
});

ok('say décrit l’instant : hors réseau, en cours d’envoi, bloqué, ou rien en attente', () => {
  const { win } = loadVS();
  const N = win.KiwiVerticalNet;
  assert.match(N.say({ offline: true, queued: 0, blocked: false }), /Pas de réseau/);
  assert.match(N.say({ offline: false, queued: 2, blocked: false }), /2 ventes en cours d’envoi/);
  assert.match(N.say({ offline: false, queued: 0, blocked: true }), /bloquée/);
  assert.match(N.say({ offline: false, queued: 0, blocked: false }), /aucune vente en attente/);
});

ok('watch réagit à online, offline et à la file, et se désabonne', () => {
  const { win, listeners } = loadVS();
  const seen = [];
  const off = win.KiwiVerticalNet.watch((st) => seen.push(st));
  listeners.offline.forEach((fn) => fn());
  listeners['kiwi:sale-queue'].forEach((fn) => fn({ detail: { pending: 4, blocked: 0 } }));
  assert.equal(seen.length, 2);
  assert.equal(seen[1].queued, 4);
  off();
  listeners.online.forEach((fn) => fn());
  assert.equal(seen.length, 2, 'désabonné : plus rien');
});

/* ───────────────────────── vertical-state : hydratation ───────────────────── */
ok('un terminal dont l’identité arrive après coup relit sa fiche enregistrée au lieu de l’écraser', () => {
  const rows = { shop1: { verticals: { foo: { schema: 1, data: { n: 42 } } }, commands: [], seq: 1 } };
  const writes = [];
  const store = { define: () => store, get: (id) => rows[id], update: (fn, id) => { writes.push(id); }, subscribe() {}, currentVenue: () => '' };
  const env = { real: false, isReal() { return this.real; } };
  const { win } = loadVS({ env, store });
  win.KiwiPlatform = { pairedMerchant: () => 'shop1' };       /* le commerce est connu, pas encore « réel » */
  let state = { n: 1 };
  const h = win.KiwiVerticalState.open('foo', { snapshot: () => state, restore: (d) => { state = d; }, schema: 1 });
  assert.equal(h.hydrate(), false, 'pas encore réel : rien à lire');
  assert.equal(h.save('tôt'), false, 'pas encore réel : rien n’est écrit');
  assert.deepEqual(writes, []);
  env.real = true;                                            /* KiwiMe répond une seconde plus tard */
  assert.equal(h.hydrate(), true, 'la fiche enregistrée est relue');
  assert.equal(state.n, 42, 'et non écrasée par les valeurs par défaut du module');
});

ok('hydrate ne se verrouille pas tant que le terminal n’est pas réel', () => {
  const body = grab(VS, 'function hydrate()');
  assert.doesNotMatch(body, /\|\| *!real\(\) *\|\| *!activeVenue\) *\{ *hydrated *= *true/, 'l’ancien verrou a disparu');
  assert.match(body, /if \(!real\(\) \|\| !activeVenue\) return false;/);
});

/* ───────────────────────── montants, pluriels ───────────────────────────── */
ok('pharmacie : 12,50 MAD reste 12,50 (plus « 13 MAD »), un entier reste sans décimales', () => {
  const ctx = vm.createContext({ Intl, Math, Number });
  vm.runInContext(grab(MOD.pharmacie, 'const fmtNum = (n) =>') + ';\n' + line(MOD.pharmacie, /  const fmtMAD = \(n\) => fmtNum\(n\) \+ ' MAD';/) + '\nthis.fmtMAD = fmtMAD;', ctx);
  assert.equal(ctx.fmtMAD(12.5), '12,50 MAD');
  assert.equal(ctx.fmtMAD(7.5), '7,50 MAD');
  assert.equal(ctx.fmtMAD(9.9), '9,90 MAD');
  assert.equal(ctx.fmtMAD(12), '12 MAD');
  assert.equal(ctx.fmtMAD(0), '0 MAD');
});

ok('épicerie : 3,60 MAD reste 3,60 (plus « 4 MAD »), fmtMAD n’est qu’un alias', () => {
  const ctx = vm.createContext({ Intl, Math, Number });
  vm.runInContext(grab(MOD.epicerie, 'const fmtMAD2 = (n) =>') + ';\nconst fmtMAD = (n) => fmtMAD2(n);\nthis.fmtMAD = fmtMAD;', ctx);
  assert.equal(ctx.fmtMAD(3.6), '3,60 MAD');
  assert.equal(ctx.fmtMAD(8), '8 MAD');
  assert.equal(ctx.fmtMAD(1.5), '1,50 MAD');
  assert.match(MOD.epicerie, /const fmtMAD = \(n\) => fmtMAD2\(n\);/);
});

ok('boulangerie : khobz à 1,50 MAD se lit 1,50 MAD', () => {
  const m = MOD.boulangerie;
  const ctx = vm.createContext({ Intl, Math, Number });
  const fmtN = grab(m, 'const fmtN = (n) =>');
  vm.runInContext(fmtN + ';\n' + line(m, /  const fmtMAD = \(n\) => fmtN\(n\) \+ ' MAD';/) + '\nthis.fmtMAD = fmtMAD;', ctx);
  assert.equal(ctx.fmtMAD(1.5), '1,50 MAD');
  assert.equal(ctx.fmtMAD(9), '9 MAD');
});

ok('pluriel français : 0 et 1 au singulier, 2 et plus au pluriel, dans les huit caisses', () => {
  Object.entries(MOD).forEach(([id, src]) => {
    const ctx = vm.createContext({ Math });
    vm.runInContext(line(src, /  const plu\s*= \(n, one, many\) => [^\n]*;/) + '\nthis.plu = plu;', ctx);
    assert.equal(ctx.plu(0, 'vente'), 'vente', id + ' 0');
    assert.equal(ctx.plu(1, 'vente'), 'vente', id + ' 1');
    assert.equal(ctx.plu(2, 'vente'), 'ventes', id + ' 2');
    assert.equal(ctx.plu(2, 'œuf', 'œufs'), 'œufs', id + ' many');
    assert.equal(ctx.plu(-3, 'vente'), 'ventes', id + ' négatif');
  });
});

/* ───────────────────────── stock « non suivi » ───────────────────────────── */
ok('librairie : un stock absent n’est pas un stock à zéro', () => {
  const m = MOD.librairie;
  const ctx = vm.createContext({ Number });
  vm.runInContext(['const pvReal = () => false;', line(m, /  const trk +=[^\n]*;/), line(m, /  const stockLabel = [^\n]*;/), 'this.s = stockLabel;'].join('\n'), ctx);
  assert.equal(ctx.s(null), 'stock non suivi');
  assert.equal(ctx.s(undefined), 'stock non suivi');
  assert.equal(ctx.s(0), 'épuisé');
  assert.equal(ctx.s(5), '5 en stock');
  assert.equal(null <= 0, true, 'le piège de JavaScript que le code doit éviter');
});

ok('boulangerie : trk/isOut ne barrent pas un produit dont le restant n’est pas suivi', () => {
  const m = MOD.boulangerie;
  const ctx = vm.createContext({ Number });
  vm.runInContext([line(m, /  const trk +=[^\n]*;/), line(m, /  const isOut = [^\n]*;/), 'this.trk = trk; this.isOut = isOut;'].join('\n'), ctx);
  assert.equal(ctx.trk({ stock: null }), false);
  assert.equal(ctx.isOut({ stock: null }), false);
  assert.equal(ctx.isOut({ stock: 0 }), true);
  assert.equal(ctx.isOut({ stock: 3 }), false);
});

ok('pharmacie : un médicament dont le stock n’est pas suivi n’est ni « rupture » ni « bientôt épuisé »', () => {
  const m = MOD.pharmacie;
  const ctx = vm.createContext({});
  vm.runInContext('const pvReal = () => false;\nconst STOCK = { a: 0, b: 4, c: null };\n' + line(m, /  const tracked = [^\n]*;/) + '\n' + line(m, /  const isOut +=[^\n]*;/) + '\nthis.t = tracked; this.o = isOut;', ctx);
  assert.equal(ctx.t('c'), false); assert.equal(ctx.o('c'), false); assert.equal(ctx.t('zzz'), false);
  assert.equal(ctx.o('a'), true); assert.equal(ctx.o('b'), false);
});

ok('épicerie : « stock non suivi » est une section à part, pas un rayon vide', () => {
  assert.match(MOD.epicerie, /typeof it\.stock === 'number'/);
  assert.match(MOD.epicerie, /stock non suivi/);
  assert.match(MOD.epicerie, /Kiwi ne connaît pas encore vos quantités en rayon/);
});

/* ───────────────────────── données de démonstration : réel = vide ─────────── */
const GATED = {
  pharmacie: ['LOTS', 'GROSSISTE_SUGGEST', 'MEDECINS', 'PATIENTS', 'PHARMA_GARDE', 'GARDE_SALES'],
  librairie: ['CUSTOMERS', 'CMDS', 'SCHOOLS'],
  epicerie: ['CARNET'],
  boulangerie: ['FOURNEES', 'CAKES'],
  foodtruck: ['ROTA', 'QUEUE', 'SERVED', 'sold'],
};
Object.entries(GATED).forEach(([id, names]) => {
  ok(`${id} : ${names.join(', ')} démarrent vides pour un commerçant réel`, () => {
    names.forEach((n) => assert.match(MOD[id], new RegExp(`const ${n} = pvReal\\(\\) \\?`), `${n} gated`));
  });
});

ok('les compteurs de tickets d’un commerce réel commencent à 1, pas au numéro de la démo', () => {
  assert.match(MOD.pharmacie, /let saleSeq = pvReal\(\) \? 1 : 2480/);
  assert.match(MOD.librairie, /let saleSeq = pvReal\(\) \? 1 : 4821/);
  assert.match(MOD.librairie, /let cmdSeq = pvReal\(\) \? 1 : 318/);
  assert.match(MOD.epicerie, /let ticketSeq = pvReal\(\) \? 1 : 642/);
  assert.match(MOD.boulangerie, /let fourSeq = pvReal\(\) \? 1 : 10/);
  assert.match(MOD.boulangerie, /let cakeSeq = pvReal\(\) \? 1 : 116/);
  assert.match(MOD.foodtruck, /let seq = pvReal\(\) \? 1 : 48/);
  assert.match(MOD.fastfood, /seq: pvReal\(\) \? 1 : 47/);
  assert.match(MOD.pizzeria, /let seq = pvReal\(\) \? 1 : 208/);
  assert.match(MOD.traiteur, /(evSeq|let evSeq)[^\n]*pvReal\(\) \? 1/);
  assert.match(MOD.traiteur, /(dvSeq|let dvSeq)[^\n]*pvReal\(\) \? 1/);
});

ok('foodtruck : un camion réel n’a ni emplacement inventé, ni pain, gaz, batterie ou fonds de démo', () => {
  const m = MOD.foodtruck;
  assert.match(m, /vitals: pvReal\(\) \? \{ pain: null, gaz: null, batterie: null, fonds: null \}/);
  assert.match(m, /waits: pvReal\(\) \? \[\] :/);
  assert.match(m, /const HIER_TOTAL = pvReal\(\) \? 0 :/);
  assert.match(m, /const SPOTS = pvReal\(\) \? \[/);
});

ok('boulangerie : l’en-tête n’affirme « la fournée du matin est sortie » que dans la démo', () => {
  assert.match(MOD.boulangerie, /\$\{pvReal\(\) \? '' : ', la fournée du matin est sortie'\}/);
  assert.doesNotMatch(MOD.boulangerie, /textContent = `\$\{fmtDT\(new Date\(\)\)\}, la fournée du matin est sortie`/);
});

ok('fast-food et pizzeria : « le n°1 », « du jour », « la classique » ne s’affichent pas chez un vrai commerçant', () => {
  [['fastfood', MOD.fastfood], ['pizzeria', MOD.pizzeria]].forEach(([id, src]) => {
    const ctx = vm.createContext({});
    const env = { real: false };
    ctx.pvReal = () => env.real;
    vm.runInContext(line(src, /  const flagOf = [^\n]*;/) + '\nthis.flagOf = flagOf;', ctx);
    env.real = false;
    assert.equal(ctx.flagOf({ flag: 'la classique' }), 'la classique', id + ' démo');
    assert.equal(ctx.flagOf({ flag: 'pêche du jour' }), 'pêche du jour', id + ' démo conserve');
    env.real = true;
    assert.equal(ctx.flagOf({ flag: 'pêche du jour' }), '', id + ' réel : retiré');
    assert.equal(ctx.flagOf({ flag: 'la classique' }), '', id + ' réel : retiré');
    assert.equal(ctx.flagOf({ flag: 'pizza fermée' }), 'pizza fermée', id + ' réel : la description reste');
    assert.equal(ctx.flagOf({}), '', id + ' sans mention');
  });
  const ctx = vm.createContext({ pvReal: () => true });
  vm.runInContext(line(MOD.fastfood, /  const flagOf = [^\n]*;/) + '\nthis.flagOf = flagOf;', ctx);
  assert.equal(ctx.flagOf({ flag: 'le n°1' }), '');
  assert.equal(ctx.flagOf({ flag: 'broche du jour' }), '');
  assert.equal(ctx.flagOf({ flag: 'pressé minute' }), 'pressé minute');
});

ok('librairie : un ISBN de substitution (xxx) n’est jamais montré comme un vrai', () => {
  assert.match(MOD.librairie, /\/x\{3,\}\/i\.test\(it\.isbn \|\| ''\) \? '' :/);
});

/* ───────────────────────── coup de feu du fast-food ───────────────────────── */
ok('fast-food : les barres « commandes / heure » viennent des ventes, jamais toutes dans « 13h »', () => {
  const m = MOD.fastfood;
  const FIXED = Date.UTC(2026, 9, 11, 11, 20, 0);
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(FIXED); }
    static now() { return FIXED; }
  }
  let sales = [];
  const ctx = vm.createContext({
    Intl, Math, Number, Date: FakeDate, window: { KiwiPosSale: { today: () => sales } },
  });
  vm.runInContext([grab(m, 'const casaSlot = (ts) =>') + ';', grab(m, 'function hoursFromSales()'), 'this.h = hoursFromSales; this.slot = casaSlot;'].join('\n'), ctx);
  // aucune vente : une seule barre, celle du créneau en cours, à zéro
  let bars = ctx.h();
  assert.equal(bars.length, 1);
  assert.equal(bars[0].n, 0); assert.equal(bars[0].now, true);
  // trois ventes : deux il y a dix minutes, une il y a 90 minutes
  sales = [{ ts: FIXED - 10 * 60e3 }, { ts: FIXED - 12 * 60e3 }, { ts: FIXED - 90 * 60e3 }];
  bars = ctx.h();
  assert.equal(bars.reduce((s, b) => s + b.n, 0), 3, 'chaque vente est comptée une fois');
  assert.ok(bars.length >= 3, 'plusieurs créneaux, pas une barre unique');
  assert.equal(bars[bars.length - 1].now, true);
  assert.equal(bars.filter((b) => b.now).length, 1);
  const labels = bars.map((b) => b.t);
  assert.equal(new Set(labels).size, labels.length, 'des libellés distincts');
  assert.ok(labels.every((t) => /^\d{1,2}h(30)?$/.test(t)), 'format 12h / 12h30');
  // demi-heure : 12h10 et 12h40 ne tombent pas dans la même barre
  assert.notEqual(ctx.slot(Date.UTC(2026, 9, 11, 11, 10)), ctx.slot(Date.UTC(2026, 9, 11, 11, 40)));
});

ok('fast-food : le pied de page ne prétend pas « le pic était à 12h30 » en réel', () => {
  assert.match(MOD.fastfood, /pvReal\(\) \? \(peak\.n \? `, le pic est à \$\{esc\(peak\.t\)\}` : ''\) : ', le pic était à 12h30'/);
});

/* ───────────────────────── appel au micro du food truck ───────────────────── */
ok('food truck : « annoncé à voix haute » seulement si la tablette parle vraiment', () => {
  const m = MOD.foodtruck;
  const spoken = [];
  function Utter(t) { this.text = t; }
  const mk = (win) => {
    const ctx = vm.createContext({ window: win, toast: () => {} });
    vm.runInContext(grab(m, 'function announce(text)') + '\nthis.announce = announce;', ctx);
    return ctx;
  };
  const talking = mk({ speechSynthesis: { cancel() {}, speak: (u) => spoken.push(u.text) }, SpeechSynthesisUtterance: Utter });
  assert.equal(talking.announce('Omar, c’est prêt'), true);
  assert.deepEqual(spoken, ['Omar, c’est prêt']);
  assert.equal(mk({}).announce('x'), false, 'aucune synthèse vocale : on ne prétend rien');
  assert.equal(mk({ speechSynthesis: {}, SpeechSynthesisUtterance: undefined }).announce('x'), false);
  const boom = mk({ speechSynthesis: { cancel() {}, speak() { throw new Error('nope'); } }, SpeechSynthesisUtterance: Utter });
  assert.equal(boom.announce('x'), false, 'une erreur de synthèse ne passe pas pour une annonce');
  const body = grab(m, 'function callOrder(id)');
  assert.match(body, /announce\(/);
  assert.match(body, /Pas de voix sur cet appareil/);
});

/* ───────────────────────── devis du traiteur ──────────────────────────────── */
ok('traiteur : les conditions du devis viennent du devis, avec des valeurs sûres par défaut', () => {
  const m = MOD.traiteur;
  const ctx = vm.createContext({ Math, Number });
  vm.runInContext([
    line(m, /  (?:const|let) DEFAULT_TERMS = [^\n]*;/),
    grab(m, 'function termsOf(x)'),
    line(m, /  const schemeLabel = [^\n]*;/),
    'this.termsOf = termsOf; this.schemeLabel = schemeLabel; this.D = DEFAULT_TERMS;',
  ].join('\n'), ctx);
  const t = (x) => JSON.parse(JSON.stringify(ctx.termsOf(x)));
  assert.deepEqual(t(null), { c: 30, j7: 50, valid: 7, off: 7, solde: 20 });
  assert.deepEqual(t({ terms: { c: 50, j7: 20, valid: 14 } }), { c: 50, j7: 20, valid: 14, off: 7, solde: 30 });
  assert.deepEqual(t({ terms: { c: 40, j7: 40, valid: 3 } }), { c: 40, j7: 40, valid: 3, off: 7, solde: 20 });
  assert.deepEqual(t({ terms: { c: 60, j7: 50, valid: 7 } }), { c: 30, j7: 50, valid: 7, off: 7, solde: 20 }, 'somme > 99 : valeurs par défaut');
  assert.equal(t({ terms: { c: 0, j7: 50, valid: 7 } }).c, 30, 'zéro ne passe pas');
  assert.equal(t({ terms: { c: 30, j7: 50, valid: 'abc' } }).valid, 7);
  assert.equal(ctx.schemeLabel({ terms: { c: 50, j7: 20, valid: 7 } }), '50 / 20 / 30');
  assert.equal(ctx.schemeLabel({}), '30 / 50 / 20');
});

ok('traiteur : l’échéancier suit les conditions choisies et ne perd pas un dirham', () => {
  const m = MOD.traiteur;
  const DAY = 864e5;
  const ctx = vm.createContext({ Math, Number, Date, DAY });
  vm.runInContext([
    'const evTotals = (ev) => ({ total: ev.__total });',
    line(m, /  (?:const|let) DEFAULT_TERMS = [^\n]*;/),
    grab(m, 'function termsOf(x)'),
    grab(m, 'function buildTranches(ev)'),
    'this.build = buildTranches;',
  ].join('\n'), ctx);
  const date = new Date('2026-11-10T18:00:00Z');
  for (const [terms, total] of [[undefined, 3500], [{ c: 50, j7: 20, valid: 7 }, 3500], [{ c: 33, j7: 33, valid: 7 }, 1001], [{ c: 10, j7: 10, valid: 30 }, 77]]) {
    const tr = ctx.build({ __total: total, terms, date, confirmedAt: null });
    assert.equal(tr.reduce((s, x) => s + x.amount, 0), total, 'somme = total');
    assert.equal(tr.reduce((s, x) => s + x.pct, 0), 100);
    assert.equal(tr[0].amount, Math.round(total * tr[0].pct / 100));
  }
  const tr = ctx.build({ __total: 3500, terms: { c: 50, j7: 20, valid: 7 }, date, confirmedAt: null });
  assert.deepEqual(Array.from(tr, (x) => x.amount), [1750, 700, 1050]);
  assert.equal(tr[1].due.getTime(), date.getTime() - 7 * DAY, 'J−7 reste le repère de la deuxième tranche');
});

ok('traiteur : WhatsApp et devis imprimé lisent les conditions du devis, pas des chiffres écrits en dur', () => {
  const m = MOD.traiteur;
  const wa = grab(m, 'function waMessage(ev, kind)');
  assert.match(wa, /const tm = termsOf\(ev\);/);
  assert.match(wa, /\$\{tm\.c\} % à la confirmation/);
  assert.match(wa, /\$\{tm\.j7\} % à J-\$\{tm\.off\}/);
  assert.match(wa, /\$\{tm\.valid\} \$\{plu\(tm\.valid, 'jour'\)\}/);
  assert.doesNotMatch(wa, /30 % à la confirmation|50 % à J-7|bloquée 7 jours/);
  assert.match(m, /Échéancier \$\{schemeLabel\(ev\)\}/);
  assert.match(m, /Devis valable \$\{termsOf\(ev\)\.valid\}/);
  assert.doesNotMatch(m, /Échéancier 30 \/ 50 \/ 20/);
  // l'écran de composition laisse choisir
  assert.match(m, /id="tr-q-tc"/); assert.match(m, /id="tr-q-tj"/); assert.match(m, /id="tr-q-tv"/);
  assert.match(m, /c \+ j7 > 99/);
});

ok('traiteur : la signature du message WhatsApp n’a plus de point médian orphelin', () => {
  assert.doesNotMatch(MOD.traiteur, /`\\n·\$\{pvName\('Traiteur Dar Zellij'\)/);
});

/* ───────────────────────── pastille réseau : plus d'interrupteur ────────────── */
ok('les huit caisses lisent le réseau du terminal et ne basculent plus à la main chez un vrai commerçant', () => {
  Object.entries(MOD).forEach(([id, src]) => {
    assert.match(src, /KiwiVerticalNet/, id + ' utilise l’état du terminal');
    assert.match(src, /function syncNet\(/, id + ' syncNet');
    const sync = grab(src, 'function syncNet(');
    assert.match(sync, /if \(!pvReal\(\)\) return;/, id + ' démo : la coupure reste simulée');
    assert.match(sync, /KiwiVerticalNet\.change\(/, id + ' message de changement');
    const tog = grab(src, 'function toggleOffline(');
    assert.match(tog, /if \(pvReal\(\)\) \{ syncNet\(\); return; \}/, id + ' un tap ne bascule rien en réel');
  });
});

/* ───────────────────────── pharmacie : scan, appel, grossiste ─────────────── */
ok('pharmacie : le scan ouvre le vrai lecteur, sans vignette devinée', () => {
  assert.match(MOD.pharmacie, /KiwiRetailScan/);
  assert.match(MOD.pharmacie, /tel:/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
