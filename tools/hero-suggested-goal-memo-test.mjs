#!/usr/bin/env node
/* L'objectif suggéré du tableau de bord ne ressert pas le souvenir d'un autre
 * commerce ni celui d'avant une vente tardive, et ses 28 journées sont des
 * journées commerciales du commerce (23 h / 25 h comprises). Exécute le vrai
 * renderGoal de assets/daterange/hero.js. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const HERO = readFileSync(new URL('../assets/daterange/hero.js', import.meta.url), 'utf8');
const H = 3600000, DAY = 24 * H;
const TODAY = Date.UTC(2026, 10, 3, 5);
const node = () => ({ textContent: '', dataset: {}, style: {}, title: '', removeAttribute() {} });

function harness({ slugRef, salesBySlug, stats, bounds }) {
  const nodes = { '[data-goal-label]': node(), '[data-goal-pct]': node(), '[data-goal-fill]': node() };
  const calls = { windows: [] };
  const window = { KiwiSales: { list: slug => salesBySlug[slug] || [] }, KiwiVenue: { getCurrentVenueData: () => ({ goal: 0 }), isCustom: () => true } };
  const state = {
    currentRange: 'aujourdhui', getLang: () => 'fr', effRange: () => 'aujourdhui', guardOperatorFigures: () => false,
    vData: () => ({ goal: 0, current: 0 }), isLiveDemo: () => false, getSim: () => null, ownData: () => true,
    realSalesTotals: () => ({ revenue: 0 }), rangeBounds: () => [TODAY, TODAY + DAY], RANGE_DAYS: { aujourdhui: 1 },
    realWindowStats: (from, to) => { calls.windows.push([from, to]); return { revenue: stats(from, to, slugRef.v) }; },
    activeMerchantSlug: () => slugRef.v,
    GOAL_LABEL: { fr: { aujourdhui: 'OBJECTIF JOUR' } }, GOAL_UNSET: { fr: 'à définir' }, kitCase: t => t,
    frInt: n => String(Math.round(n)), curUnit: () => 'MAD', animateNumber: (n, _f, to) => { n.textContent = Math.round(to) + ' %'; }, homeSet() {},
  };
  if (bounds) { state.merchantDayKey = (t) => String(t); state.merchantDayBounds = (key) => bounds(+key); }
  vm.runInNewContext(HERO, { window, document: { querySelector: s => nodes[s] || null }, localStorage: { getItem: () => null }, console });
  const api = window.__kiwiHomeRenderers.hero(state);
  return { goal() { api.renderGoal(); return nodes['[data-goal-label]'].textContent; }, calls };
}

/* 1. Deux commerces dans la même zone : le second ne reçoit pas l'objectif du premier. */
const slug = { v: 'boutique-a' };
const per = { 'boutique-a': 1000, 'boutique-b': 3000 };
const sales = { 'boutique-a': [{ amount: 1 }], 'boutique-b': [{ amount: 1 }] };
const h1 = harness({ slugRef: slug, salesBySlug: sales, stats: (_f, _t, s) => per[s] });
assert.match(h1.goal(), /1000 MAD/, 'commerce A : médiane 1000');
slug.v = 'boutique-b';
assert.match(h1.goal(), /3000 MAD/, 'commerce B : son propre objectif, pas celui de A');

/* 2. Une vente tardive d'un jour passé change le registre : le souvenir est recalculé. */
let boost = 1000;
const lateSales = { x: [{ amount: 10 }] };
const h2 = harness({ slugRef: { v: 'x' }, salesBySlug: lateSales, stats: () => boost });
assert.match(h2.goal(), /1000 MAD/);
boost = 2000; lateSales.x.push({ amount: 5 });
assert.match(h2.goal(), /2000 MAD/, 'après une vente tardive le registre a bougé, le souvenir est invalide');

/* 3. Journées commerciales : une journée de 25 h au milieu des 28, pas 28 tranches de 24 h. */
const odd = TODAY - 10 * DAY;                      /* début de la journée de 25 h : [odd, odd + 25 h) */
const bounds = (t) => t >= odd && t < odd + 25 * H ? { from: odd, to: odd + 25 * H }
  : t >= odd + 25 * H && t < odd + 25 * H + DAY ? { from: odd + 25 * H, to: odd + 25 * H + DAY }
  : { from: Math.floor((t - (TODAY % DAY)) / DAY) * DAY + (TODAY % DAY), to: 0 };
const h3 = harness({ slugRef: { v: 'paris' }, salesBySlug: {}, stats: () => 500, bounds });
h3.goal();
const spans = h3.calls.windows.map(([f, t]) => t - f);
assert.ok(spans.includes(25 * H), 'la fenêtre de 25 h est lue en entier');
assert.equal(h3.calls.windows[0][1], TODAY, 'la première fenêtre se termine à la borne du jour');
for (let i = 1; i < h3.calls.windows.length; i++) assert.equal(h3.calls.windows[i][1], h3.calls.windows[i - 1][0], 'fenêtres contiguës, sans trou ni recouvrement');
console.log('✓ hero-suggested-goal-memo-test');
