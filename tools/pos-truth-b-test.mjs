#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
 * CAISSES MÉTIER (SALLE DE SPORT, HÔTEL, COIFFURE, FLEURISTE, SPA)
 * CE QU'ELLES AFFIRMENT À UN COMMERCE RÉEL
 *
 * Mesuré le 2026-10-11 sur le stack local, une caisse appairée par métier :
 *
 *  1. Coiffure : le module ne s'ouvrait pas. `const TIP_LEDGER` était déclaré
 *     après le `KiwiVerticalState.open()` qui appelle `snapshot()` tout de
 *     suite (zone morte temporelle) : écran vide pour un vrai salon.
 *  2. Hôtel : les extras (minibar, hammam…) partaient au folio d'un vrai
 *     hôtel avec le tarif de la démo (95, 180, 250 MAD…), jamais saisi.
 *  3. Salle de sport : cours collectifs, planning, coachs, tranches de pointe,
 *     « 247 membres », « 64 200 MAD de MRR » et « occupation 38/120 »
 *     s'affichaient sur une salle vide ; la pointe recommandait « un coach de
 *     plus » sans un seul passage.
 *  4. Fleuriste : arrivages (120 tiges de roses, fraîcheur 4-5 jours) et
 *     bouquets signatures de la démo sur une vraie boutique.
 *  5. Spa : stocks inventés (« × 14 ») décomptés et bloquants, « journée
 *     simulée à 14:30 » dans l'en-tête.
 *  6. Coiffure : « Commission 40 % par coiffeur·se » sans que personne l'ait
 *     fixée.
 *  7. « synchronisé au retour du réseau » : un bouton qui simulait une coupure
 *     et un compteur qui ne regardait aucune file.
 *  8. « ✓✓ » sous un brouillon WhatsApp que personne n'a envoyé.
 *  9. « 1 jours », « 1 passages », « 2 ligne », « 1 achats », « 1 produits ».
 * 10. Maison : un tiret cadratin et quatre émojis dans l'interface.
 *
 * Exécute les vrais modules dans un `vm`, avec une caisse appairée (réel) puis
 * une caisse de démonstration.
 *
 *   node tools/pos-truth-b-test.mjs
 * ═════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (f) => readFileSync(path.join(ROOT, 'assets', f), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* ── un navigateur de pacotille, juste assez pour que le module se déclare ── */
function stub(name) {
  const fn = function () { return stub(name + '()'); };
  return new Proxy(fn, {
    get(_, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'length') return 0;
      if (k === 'then') return undefined;
      if (k === 'style' || k === 'dataset' || k === 'classList') return stub(name + '.' + String(k));
      return stub(name + '.' + String(k));
    },
    set() { return true; },
    apply() { return stub(name + '()'); },
    construct() { return stub('new ' + name); },
  });
}

function boot(file, { real }) {
  const store = new Map();
  const specs = [];
  const registered = [];
  const doc = {
    readyState: 'complete', body: stub('body'), head: stub('head'), documentElement: stub('html'),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => stub('el'), addEventListener() {}, removeEventListener() {},
    createTextNode: () => stub('text'), visibilityState: 'visible', fonts: stub('fonts'),
    cookie: '',
  };
  const win = {
    document: doc,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { onLine: true, language: 'fr-FR', userAgent: 'test', maxTouchPoints: 0 },
    location: { href: 'http://localhost/', hostname: 'localhost', search: '', pathname: '/kiwi-caisse.html', origin: 'http://localhost' },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    fetch: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    CustomEvent: function () {}, Event: function () {}, URLSearchParams, Intl, Date, Math, JSON, Object, Array, String, Number, Promise,
    KiwiEnv: { isReal: () => real, demosAllowed: !real },
    KiwiVerticalState: {
      isReal: () => real,
      register(spec) { specs.push(spec); try { spec.snapshot(); } catch (e) { win.__registerError = e; throw e; } return { save() {}, hydrate() {}, start() {} }; },
      open(name, spec) { specs.push({ vertical: name, ...spec }); try { spec.snapshot(); } catch (e) { win.__registerError = e; throw e; } return { save() {}, hydrate() {}, start() {} }; },
    },
    KiwiPosDispatch: { register(m) { registered.push(m); }, repaint() {} },
    KiwiPlatform: { isPaired: () => real, pairedMerchant: () => (real ? 'test-merchant' : '') },
    KiwiLive: { queueStatus: () => ({ pending: 0, blocked: 0 }) },
    Kiwi: { toast() {}, modal() {}, drawer() {} },
    KiwiPosSale: { record: () => ({ saleId: 'x' }) },
    KiwiReceipt: { nextRef: () => 'R-1', fmtMAD: (n) => n + ' MAD' },
    KiwiCloudDoc: { attach: () => ({ bind() {} }), currentSlug: () => 'test-merchant' },
    KiwiMenuStore: undefined,
  };
  win.window = win; win.self = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  let error = null;
  try { vm.runInContext(SRC(file), ctx, { filename: file }); } catch (e) { error = e; }
  return { ctx, win, specs, registered, error };
}

const MODULES = ['pos-gym.js', 'pos-hotel.js', 'pos-coiffure.js', 'pos-fleuriste.js', 'pos-spa.js'];
const booted = {};
for (const f of MODULES) for (const real of [true, false]) booted[f + (real ? ':real' : ':demo')] = boot(f, { real });

console.log('\n1. chaque module se déclare, réel comme démo (zone morte temporelle)');
for (const f of MODULES) for (const real of [true, false]) {
  ok(`${f} s'ouvre en ${real ? 'réel' : 'démo'}`, () => {
    const b = booted[f + (real ? ':real' : ':demo')];
    assert.equal(b.error, null, String(b.error && b.error.message));
    assert.ok(b.specs.length >= 1, 'enregistré dans KiwiVerticalState');
    assert.ok(b.registered.length >= 1, 'enregistré dans KiwiPosDispatch');
  });
}

const snap = (f, real) => booted[f + (real ? ':real' : ':demo')].specs[0].snapshot();

console.log('\n2. le réel démarre vide, la démo garde sa démo');
ok('gym réel : aucun cours, aucune tranche de pointe, aucun passage', () => {
  const s = snap('pos-gym.js', true);
  assert.equal(s.v, 2);
  assert.equal(JSON.stringify(s.classes || []), '[]');
  assert.equal((s.peakSlots || []).reduce((n, x) => n + (x.count || 0), 0), 0);
  assert.equal(s.basePassages || 0, 0);
});
ok('gym démo : cours et pointe de la démo présents', () => {
  const s = snap('pos-gym.js', false);
  assert.ok((s.classes || []).length > 0, 'cours');
  assert.ok((s.peakSlots || []).reduce((n, x) => n + (x.count || 0), 0) > 0, 'pointe');
});
ok('hôtel réel : aucune chambre, aucun séjour de démo, aucun tarif d\'extra', () => {
  const s = snap('pos-hotel.js', true);
  assert.equal(JSON.stringify(s.rooms), '{}');
  assert.equal(JSON.stringify(s.stays), '{}');
  assert.equal(JSON.stringify(s.extraPrices), '{}');
});
ok('hôtel démo : chambres et séjours de la démo présents', () => {
  const s = snap('pos-hotel.js', false);
  assert.ok(Object.keys(s.rooms).length >= 5);
  assert.ok(Object.keys(s.stays).length >= 1);
});
ok('fleuriste réel : arrivages sans quantité inventée', () => {
  const s = snap('pos-fleuriste.js', true);
  assert.equal(s.v, 2);
  const arr = s.arrivals || [];
  assert.ok(arr.every((a) => a.qty == null || a.qty === 0), 'aucune quantité');
});
ok('fleuriste démo : arrivages chiffrés', () => {
  const s = snap('pos-fleuriste.js', false);
  assert.ok((s.arrivals || []).some((a) => a.qty > 0));
});
ok('spa réel : aucun stock inventé', () => {
  const s = snap('pos-spa.js', true);
  assert.equal(s.v, 2);
  const prods = s.products || s.stock || {};
  const vals = Array.isArray(prods) ? prods.map((p) => p.stock) : Object.values(prods);
  assert.ok(vals.every((v) => v == null || v === 0 || typeof v === 'object'), 'stocks ' + JSON.stringify(vals).slice(0, 80));
});
ok('coiffure réel : pas de taux de commission avant que le salon le fixe', () => {
  const s = snap('pos-coiffure.js', true);
  assert.equal(s.commission == null, true, 'commission ' + s.commission);
});
ok('coiffure démo : 40 %', () => {
  const s = snap('pos-coiffure.js', false);
  assert.equal(s.commission, 0.4);
});

console.log('\n3. ce que le texte affirme');
const text = Object.fromEntries(MODULES.concat(['pos-maison.js', 'pos-boutique.js']).map((f) => [f, SRC(f)]));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
for (const f of Object.keys(text)) {
  ok(`${f} : ni tiret cadratin ni émoji dans l'interface`, () => {
    const code = stripComments(text[f]);
    assert.ok(!/—/.test(code), 'U+2014');
    assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿\u{FE0F}]/u.test(code.replace(/[✓✕×←→↑↓·•–−≥≤✗]/g, '')), 'émoji');
  });
}
for (const f of ['pos-gym.js', 'pos-fleuriste.js']) {
  ok(`${f} : pas de « ✓✓ » sur un brouillon non envoyé`, () => {
    assert.ok(!stripComments(text[f]).includes('✓✓'));
  });
}
ok('aucune jonction « N jours / passages / achats » au singulier fautif', () => {
  for (const f of ['pos-gym.js', 'pos-coiffure.js', 'pos-fleuriste.js', 'pos-spa.js', 'pos-boutique.js', 'pos-maison.js']) {
    const code = stripComments(text[f]);
    assert.ok(!/\$\{[^}]+\} achats\b/.test(code), f + ' « achats » fixe');
    assert.ok(!/\$\{[^}]+\} produits ·/.test(code), f + ' « produits » fixe');
    assert.ok(!/ ligne\$\{/.test(code), f + ' « ligne » à l\'unité');
  }
});

console.log('\n4. le réseau : pas de coupure simulée dans une vraie caisse');
for (const f of MODULES) {
  ok(`${f} : le bouton réseau ne simule rien en réel`, () => {
    const code = text[f];
    assert.ok(/navigator\.onLine/.test(code), 'lit navigator.onLine');
    assert.ok(/pvReal\(\)/.test(code));
  });
}
ok('hôtel : la file regardée est celle des charges chambre', () => {
  assert.ok(/roomChargeRows\(\)/.test(text['pos-hotel.js']));
});

ok('hôtel : un séjour dont la chambre a été supprimée ne fait plus planter les folios', () => {
  const code = text['pos-hotel.js'];
  // lectures non gardées : on retire d'abord les « ROOMS[n] && (…ROOMS[n].x…) »
  const unguarded = code.replace(/ROOMS\[(\w+)\] && \([^\n]*/g, '');
  const bare = (unguarded.match(/ROOMS\[[^\]]+\]\.(status|type)\b/g) || []);
  // seule écriture autorisée : setRoom, gardée par « if (!ROOMS[n]) return; »
  assert.deepEqual(bare, ['ROOMS[n].status'], bare.join(', '));
  assert.match(code, /if \(!ROOMS\[n\]\) return;\s*ROOMS\[n\]\.status = status/);
});

console.log('\n5. hôtel : un extra se pose au prix saisi, jamais au prix de la démo');
{
  const code = text['pos-hotel.js'];
  ok('chargeAmt lit le prix du poste (unit) avant la grille', () => {
    assert.match(code, /function chargeAmt\(c\) \{ return \(Number\.isFinite\(c\.unit\) \? c\.unit : CHARGE\[c\.cid\]\.unit\) \* c\.qty; \}/);
  });
  ok('réel : le bouton est inactif tant que le prix est nul', () => {
    assert.match(code, /disabled' : ''\}[^\n]*Poster sur le folio|!\(sheet\.unit > 0\) \? 'disabled'/);
    assert.match(code, /Saisissez le prix unitaire avant de poster/);
  });
  ok('le prix tapé part tel quel dans la vente', () => {
    assert.match(code, /total, method: 'room'/);
    assert.match(code, /const total = sheetTotal\(\)/);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
