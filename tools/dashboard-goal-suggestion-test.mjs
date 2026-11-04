#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * TABLEAU DE BORD · OBJECTIF SUGGÉRÉ ET GRANDS CHIFFRES DANS LES TUILES
 *
 * 3 novembre 2026, Santos Store : « Objectif du jour » restait vide
 * (« · Aucun objectif défini ») parce que le commerçant n'avait rien saisi.
 * Le tableau de bord propose désormais un objectif tiré de ses propres ventes
 * (assets/daterange/hero.js › suggestedGoal) et le marque « suggéré » :
 *   - jour : médiane des 28 derniers jours AVEC ventes, arrondie vers le haut ;
 *   - période plus longue : moyenne par jour calendaire × jours de la période ;
 *   - moins de trois jours de ventes : rien d'inventé, « à définir » reste ;
 *   - un objectif saisi par le commerçant passe toujours devant.
 * On exécute le vrai renderGoal sur un DOM réduit et des ventes synthétiques.
 *
 * Même jour : « 3916,50 MAD » sortait de la tuile « Bénéfice brut ». La bande
 * des KPI réduit la valeur qui déborde (assets/daterange/kpi.js › fitKpiValue).
 *
 * Même jour encore : le tableau de bord de Santos affichait 0 partout alors que
 * God Mode avait tout. Le registre des ventes ne vit que dans localStorage ; une
 * écriture refusée (stockage plein) le laissait vide. Il reste désormais en
 * mémoire pour la page (assets/venues/helpers.js › ledgerWrite).
 *
 *   node tools/dashboard-goal-suggestion-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HERO = readFileSync(path.join(ROOT, 'assets/daterange/hero.js'), 'utf8');
const KPI = readFileSync(path.join(ROOT, 'assets/daterange/kpi.js'), 'utf8');
const VX = readFileSync(path.join(ROOT, 'assets/design-vexel-layout.js'), 'utf8');

const DAY = 86400000;
const TODAY = Date.UTC(2026, 10, 3, 5);

function el() {
  return { textContent: '', dataset: {}, style: {}, title: '', removeAttribute(name) { if (name === 'title') this.title = ''; } };
}

/* revenueByDaysAgo[k] = chiffre du jour J-k (k = 1..28). */
function run({ revenueByDaysAgo = {}, merchantGoal = 0, range = 'aujourdhui', today = 0, lang = 'fr' }) {
  const nodes = { '[data-goal-label]': el(), '[data-goal-pct]': el(), '[data-goal-fill]': el() };
  const homes = [];
  const window = {
    KiwiSales: {},
    KiwiVenue: { getCurrentVenueData: () => ({ goal: merchantGoal }), isCustom: () => true },
  };
  const document = { querySelector: (s) => nodes[s] || null };
  const state = {
    currentRange: range,
    getLang: () => lang,
    effRange: () => range,
    guardOperatorFigures: () => false,
    vData: () => ({ goal: 0, current: 0 }),
    goalByVenue: {},
    isLiveDemo: () => false,
    getSim: () => null,
    ownData: () => true,
    realSalesTotals: () => ({ revenue: today }),
    rangeBounds: (r) => (r === 'aujourdhui' ? [TODAY, TODAY + DAY] : [TODAY - 6 * DAY, TODAY + DAY]),
    realWindowStats: (from) => ({ revenue: revenueByDaysAgo[Math.round((TODAY - from) / DAY)] || 0 }),
    RANGE_DAYS: { aujourdhui: 1, hier: 1, septJours: 7, trenteJours: 30 },
    GOAL_LABEL: { fr: { aujourdhui: 'OBJECTIF JOUR', septJours: 'OBJECTIF SEMAINE', trenteJours: 'OBJECTIF MOIS' }, en: { aujourdhui: 'DAILY GOAL' }, ar: { aujourdhui: 'الهدف اليومي' } },
    GOAL_UNSET: { fr: 'à définir' },
    kitCase: (t) => t,
    frInt: (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
    curUnit: () => 'MAD',
    animateNumber: (node, _from, to) => { node.textContent = Math.round(to) + ' %'; },
    homeSet: (k, v) => homes.push([k, v]),
  };
  const ctx = { window, document, localStorage: { getItem: () => null }, console };
  vm.runInNewContext(HERO, ctx);
  const api = window.__kiwiHomeRenderers.hero(state);
  api.renderGoal();
  const label = nodes['[data-goal-label]'];
  return { nodes, title: label.title, label: label.textContent, suggested: label.dataset.goalSuggested === '1', unset: label.dataset.goalUnset === '1', home: homes.at(-1)?.[1] };
}

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };

/* Six jours sur sept ouverts, le dimanche fermé : quatre semaines. */
const weeks = {};
for (let k = 1; k <= 28; k++) weeks[k] = k % 7 === 0 ? 0 : 4000 + (k % 6) * 500;

ok('sans objectif saisi, la carte propose la médiane des jours vendus, arrondie, marquée suggérée', () => {
  const r = run({ revenueByDaysAgo: weeks, today: 2100 });
  assert.equal(r.unset, false);
  assert.equal(r.suggested, true);
  /* Jours vendus : 24 valeurs de 4 000 à 6 500 ; médiane 5 250 ⇒ 5 300 au pas de 100. */
  assert.equal(r.label, 'OBJECTIF JOUR · 5 300 MAD · suggéré');
  assert.equal(r.home.suggested, true);
  assert.equal(r.home.pct, Math.round(2100 / 5300 * 100));
});

ok('un jour fermé ne tire pas la cible vers le bas, un gros jour isolé ne la gonfle pas', () => {
  const spiky = { ...weeks, 3: 90000 };
  assert.equal(run({ revenueByDaysAgo: spiky }).label, 'OBJECTIF JOUR · 5 300 MAD · suggéré');
});

ok('semaine : moyenne par jour calendaire × 7', () => {
  const total = Object.values(weeks).reduce((a, b) => a + b, 0);
  const expected = Math.ceil(total / 28 * 7 / 1000) * 1000;
  const r = run({ revenueByDaysAgo: weeks, range: 'septJours' });
  assert.equal(r.suggested, true);
  assert.equal(r.label, 'OBJECTIF SEMAINE · ' + String(expected).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' MAD · suggéré');
});

ok('moins de trois jours de ventes : rien d’inventé, « à définir »', () => {
  const r = run({ revenueByDaysAgo: { 1: 800, 9: 1200 } });
  assert.equal(r.unset, true);
  assert.equal(r.suggested, false);
  assert.equal(r.label, 'OBJECTIF JOUR · à définir');
});

ok('l’objectif saisi par le commerçant passe devant la suggestion', () => {
  const r = run({ revenueByDaysAgo: weeks, merchantGoal: 3000 });
  assert.equal(r.suggested, false);
  assert.equal(r.label, 'OBJECTIF JOUR · 3 000 MAD');
});

ok('base et Vexel rendent une seule suggestion visible en fr/en/ar, avec montant et titre', () => {
  const strings = vm.runInNewContext(VX.match(/var GOAL_STR = (\{[\s\S]*?\n  \});/)[0] + ';GOAL_STR');
  const start = VX.indexOf("    var amountSource = document.querySelector('[data-hero-amount]');", VX.indexOf('function refresh()'));
  const end = VX.indexOf('    if (goalUnset) {', VX.indexOf('var goalSuggested', start));
  const mirror = VX.slice(start, end);
  for (const [lang, short] of [['fr', 'suggéré'], ['en', 'suggested'], ['ar', 'مقترح']]) {
    for (const merchantGoal of [0, 3000]) {
      const r = run({ revenueByDaysAgo: weeks, lang, merchantGoal });
      const nodes = { ...r.nodes, '[data-vexel-goal-target]': el(), '[data-hero-amount]': { textContent: '2100 MAD' } };
      vm.runInNewContext(mirror, { document: { querySelector: s => nodes[s] || null }, GOAL_STR: strings, lang: () => lang,
        setText: (node, text) => { if (node) node.textContent = text; } });
      const target = nodes['[data-vexel-goal-target]'];
      assert.equal(r.label, ({fr:'OBJECTIF JOUR', en:'DAILY GOAL', ar:'الهدف اليومي'}[lang]) + ' · ' + (merchantGoal ? '3 000 MAD' : '5 300 MAD · ' + short));
      assert.equal(target.textContent, '/ ' + (merchantGoal ? '3 000 MAD' : '5 300 MAD · ' + short));
      if (!merchantGoal) { assert.equal(r.title, strings[lang].suggested); assert.equal(target.title, r.title); }
      else { assert.equal(r.title, ''); assert.equal(target.title, ''); }
    }
  }
});

ok('une valeur KPI qui déborde de sa tuile est réduite, pas coupée', () => {
  const src = /function fitKpiValue\(valEl, measure = kpiMeasure\) \{[\s\S]*?\n    \}/.exec(KPI);
  assert.ok(src, 'fitKpiValue');
  const fit = vm.runInNewContext(src[0] + ';fitKpiValue', { getComputedStyle: (e) => ({ fontSize: e.style.fontSize || '34px' }), Math, kpiMeasure: null });
  /* Tuile : 200 px de place ; le texte en demande 300 à 34 px et suit le corps. */
  const node = (avail, at34) => ({ style: { fontSize: '' }, avail, at34 });
  const measure = (e) => ({ avail: e.avail, need: e.at34 * (parseFloat(e.style.fontSize || '34') / 34) });
  const wide = node(200, 300);
  fit(wide, measure);
  assert.ok(measure(wide).need <= 201, wide.style.fontSize);
  /* Un chiffre court garde la taille du skin. */
  const short = node(200, 90);
  fit(short, measure);
  assert.equal(short.style.fontSize, '');
  /* Plancher : jamais sous 16 px. */
  const huge = node(50, 900);
  fit(huge, measure);
  assert.equal(huge.style.fontSize, '16px');
  /* La mesure lit le bord intérieur de la tuile, pas la largeur de la valeur. */
  assert.match(KPI, /closest\('\.kpi-m'\)/);
  assert.match(KPI, /createRange\(\)/);
});

ok('stockage refusé : le registre des ventes reste lisible, l’incident remonte une fois', () => {
  const HELPERS = readFileSync(path.join(ROOT, 'assets/venues/helpers.js'), 'utf8');
  const store = new Map([['kiwiSales:own@santos-store', '[{"ts":1,"amount":5}]'], ['other', 'x'.repeat(10)]]);
  const localStorage = {
    get length() { return store.size; },
    key: (i) => [...store.keys()][i],
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; },
    removeItem: (k) => store.delete(k),
  };
  const rejected = [];
  const window = {};
  const ctx = { window, localStorage, Promise: { reject: (e) => { rejected.push(e.message); return { catch() {} }; } }, JSON, Map, Object, String, Array };
  vm.runInNewContext(HELPERS, ctx);
  const { cachedLedger, ledgerWrite } = window.__kiwiVenueParts.cache.call({}, {});
  const key = 'kiwiSales:own@santos-store';
  const rows = Array.from({ length: 3171 }, (_, i) => ({ ts: i, amount: 100, cursor: i + 1 }));
  assert.equal(ledgerWrite(key, rows), true);
  assert.equal(cachedLedger(key).length, 3171, 'le tableau de bord relit les ventes');
  assert.equal(store.has(key), false, 'l’ancienne copie partielle ne répond plus');
  ledgerWrite(key, rows.slice(0, 10));
  assert.equal(cachedLedger(key).length, 10);
  assert.equal(rejected.length, 1, 'un seul rapport par page');
  assert.match(rejected[0], /^kiwi-ledger-storage-refused: kiwiSales:own 3171 rows \d+ chars, storage \d+ chars, QuotaExceededError$/);
  assert.doesNotMatch(rejected[0], /santos/, 'pas de slug dans le rapport');
});

console.log(`dashboard-goal-suggestion · ${n} checks`);
