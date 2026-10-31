#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · les tuiles KPI TOURNENT (vague 12)
 *
 *   node tools/kpi-tiles-run-test.js
 *
 * tools/kpi-ledger-test.js contrôlait par expressions régulières que chaque
 * tuile « passe par revDelta » : une tuile pouvait contenir ce texte et se
 * tromper d'arithmétique, et seules les suites navigateur rendaient les tuiles.
 * Ici le catalogue réel de assets/dateRange.js (KPI_CATALOG et l'arithmétique
 * qui le précède) est évalué tel quel ; seuls ownData(), realClosedTips() et
 * les tables par métier sont des doubles. Chaque tuile dérivée du CA est
 * calculée sur la période réelle du banc (37 ventes, 4 618 MAD), puis sur une
 * période de démonstration, puis sans coût saisi, et ses valeurs et variations
 * sont comparées à l'arithmétique attendue, chiffre par chiffre.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const coreTestSource = require('./core-test-source.cjs');
const SRC = coreTestSource.readFileSync(path.join(__dirname, '..', 'assets/dateRange.js'), 'utf8');

const from = SRC.indexOf('const r1 = ');
const catalogAt = SRC.indexOf('const KPI_CATALOG');
const to = SRC.indexOf('\n  };', catalogAt) + 5;
assert.ok(from > 0 && catalogAt > from && to > catalogAt, 'le catalogue est extractible');

function load({ own = true, closedTips = null, lang = 'fr' } = {}) {
  const doubles = { ownData: () => own, realClosedTips: () => closedTips, getLang: () => lang };
  return new Function('ownData', 'realClosedTips', 'getLang', `const DEFAULT_MARGIN = { restaurant: 69, spa: 78, boutique: 54, fusion: 69 }; const TIP_RATE = { restaurant: 0.072, spa: 0.055, boutique: 0, fusion: 0.06 };\n${SRC.slice(from, to)}\nreturn KPI_CATALOG;`)(doubles.ownData, doubles.realClosedTips, doubles.getLang);
}
const derive = (cat, key, d, ctx) => cat[key].derive(d, ctx);
const CTX = { nbDays: 4, venueType: 'boutique', range: { from: 0, to: 1 } };

let n = 0;
const ok = (label, fn) => { try { fn(); n++; } catch (e) { console.log('  ✗ ' + label + ' — ' + String(e.message).split('\n')[0]); process.exitCode = 1; } };

/* La période réelle : 37 ventes à un panier AFFICHÉ de 125 pour 4 618 MAD réels. */
const REAL = {
  tx: { value: 37, delta: 5 }, panier: { value: 125, delta: 2 }, revenue: { value: 4618, delta: 7.3 },
  marge: { value: 40, delta: -1.5 },
};

{
  const cat = load({ own: true });
  ok('chaque tuile du CA lit le total exact, pas ventes × panier arrondi (4 618, jamais 4 625)', () => {
    assert.equal(derive(cat, 'revenue', REAL, CTX).value, 4618);
    assert.equal(derive(cat, 'revPerDay', REAL, CTX).value, 4618 / 4);
    assert.equal(derive(cat, 'profit', REAL, CTX).value, 4618 * 40 / 100);
    assert.equal(derive(cat, 'cogs', REAL, CTX).value, 4618 * (1 - 40 / 100));
  });
  ok('bénéfice et coût matière partagent le CA : ils font toujours le CA à eux deux', () => {
    const profit = derive(cat, 'profit', REAL, CTX).value, cogs = derive(cat, 'cogs', REAL, CTX).value;
    assert.ok(Math.abs(profit + cogs - 4618) < 1e-9, 'profit + coût = ' + (profit + cogs));
  });
  ok('CA, CA par jour : la variation est celle du CA réel (7,3), pas la somme des ventes et du panier (7)', () => {
    assert.equal(derive(cat, 'revenue', REAL, CTX).delta, 7.3);
    assert.equal(derive(cat, 'revPerDay', REAL, CTX).delta, 7.3);
  });
  ok('bénéfice : la variation du CA plus celle de la marge ; coût matière : la variation du CA moins celle de la marge', () => {
    assert.equal(derive(cat, 'profit', REAL, CTX).delta, 5.8);
    assert.equal(derive(cat, 'cogs', REAL, CTX).delta, 8.8);
  });
  ok('une marge sans variation connue ne fabrique pas un zéro : la tuile n\'affiche aucune comparaison', () => {
    const d = { ...REAL, marge: { value: 40 } };
    assert.equal(derive(cat, 'profit', d, CTX).delta, null);
    assert.equal(derive(cat, 'profit', d, CTX).value, 4618 * 40 / 100);
  });
  ok('chez un vrai commerçant sans coût saisi : ni marge, ni bénéfice, ni coût matière (jamais la marge type du métier)', () => {
    const d = { tx: REAL.tx, panier: REAL.panier, revenue: REAL.revenue };
    assert.equal(derive(cat, 'profit', d, CTX), null);
    assert.equal(derive(cat, 'cogs', d, CTX), null);
    assert.equal(derive(cat, 'revenue', d, CTX).value, 4618, 'le CA, lui, reste affiché');
  });
  ok('sans baseline sur le CA réel, la tuile retombe sur l\'approximation des ventes et du panier, jamais sur 0 %', () => {
    const d = { ...REAL, revenue: { value: 4618, delta: null } };
    assert.equal(derive(cat, 'revenue', d, CTX).delta, 7);
    const nobase = { tx: { value: 10, delta: null }, panier: { value: 20, delta: 3 } };
    assert.equal(derive(cat, 'revenue', nobase, CTX).delta, null);
    assert.equal(derive(cat, 'revPerDay', nobase, CTX).delta, null);
  });
  ok('une période sans ventes ni panier ne montre aucune tuile de CA', () => {
    for (const k of ['revenue', 'revPerDay', 'profit', 'cogs']) assert.equal(derive(cat, k, {}, CTX), null, k);
  });
  ok('ventes par jour = ventes ÷ jours ouverts, avec la variation des ventes', () => {
    const t = derive(cat, 'txPerDay', REAL, CTX);
    assert.equal(t.value, 37 / 4); assert.equal(t.delta, 5);
    assert.equal(derive(cat, 'txPerDay', {}, CTX), null);
  });
}

{
  const cat = load({ own: false });
  ok('la démonstration continue de passer par ventes × panier, tuiles et variations comprises', () => {
    const demo = { tx: { value: 182, delta: 15.2 }, panier: { value: 134, delta: 1.5 }, marge: { value: 54, delta: 0.5 } };
    const ctx = { nbDays: 7, venueType: 'boutique' };
    assert.equal(derive(cat, 'revenue', demo, ctx).value, 182 * 134);
    assert.equal(derive(cat, 'revenue', demo, ctx).delta, 16.7);
    assert.equal(derive(cat, 'revPerDay', demo, ctx).value, 182 * 134 / 7);
    assert.equal(derive(cat, 'profit', demo, ctx).value, 182 * 134 * 54 / 100);
  });
  ok('la démonstration sans marge saisie prend la marge type du métier, la tuile restaurant aussi', () => {
    const d = { tx: { value: 100, delta: 1 }, panier: { value: 100, delta: 1 } };
    assert.equal(derive(cat, 'profit', d, { nbDays: 1, venueType: 'restaurant' }).value, 10000 * 69 / 100);
    assert.equal(derive(cat, 'profit', d, { nbDays: 1, venueType: 'inconnu' }), null);
  });
  ok('les pourboires de la démo sont une estimation du CA par métier, et rien pour un métier sans pourboire', () => {
    const d = { tx: { value: 100, delta: 2 }, panier: { value: 100, delta: 3 } };
    const t = derive(cat, 'tips', d, { nbDays: 1, venueType: 'restaurant' });
    assert.equal(t.value, 10000 * 0.072); assert.equal(t.delta, 5);
    assert.equal(derive(cat, 'tips', d, { nbDays: 1, venueType: 'boutique' }), null);
  });
}

ok('pourboires d\'un vrai commerçant : ceux déclarés à la clôture, un point médian sans journée close, des points de suspension en attendant', () => {
  const ctx = { nbDays: 1, venueType: 'restaurant', range: {} };
  assert.deepEqual(derive(load({ own: true, closedTips: { days: 3, sum: 412 } }), 'tips', REAL, ctx), { value: 412, unit: 'MAD', fmt: 'int', delta: null });
  assert.equal(derive(load({ own: true, closedTips: { days: 0, sum: 0 } }), 'tips', REAL, ctx).text, '·');
  assert.equal(derive(load({ own: true, closedTips: { partial: true } }), 'tips', REAL, ctx).text, '…');
  const part = derive(load({ own: true, closedTips: { partial: true, days: 2, sum: 120.5 } }), 'tips', REAL, ctx);
  assert.equal(part.value, 120.5, 'partiel : les pourboires connus restent affichés');
  assert.equal(part.noteKey, 'dash.kpi.tipsPartial', 'partiel : la tuile porte sa note');
  assert.equal(derive(load({ own: true, closedTips: null }), 'tips', REAL, ctx), null);
  assert.ok(derive(load({ own: true, closedTips: { days: 1, sum: 5 } }), 'tips', REAL, ctx).value !== 4618 * 0.072, 'jamais le CA × 7,2 % inventé');
});

ok('fidélité et nouveaux clients : le carnet clients quand il existe, le point médian sans réguliers connus', () => {
  const cat = load({ own: true });
  const mix = { clientMix: { regulars: 30, newcomers: 10, visitors: 40, deltaRate: 2, deltaNew: -3 } };
  assert.deepEqual(derive(cat, 'retention', mix, CTX), { value: 75, unit: '%', fmt: 'pct1', delta: 2 });
  assert.deepEqual(derive(cat, 'newClients', mix, CTX), { value: 10, unit: '', fmt: 'int', delta: -3 });
  assert.equal(derive(cat, 'retention', { tx: REAL.tx, regulars: { text: '·' } }, CTX).text, '·');
  assert.equal(derive(cat, 'retention', {}, CTX), null);
});

ok('une tuile absente de la période n\'invente pas de valeur (marge, succès, ratio, occupation)', () => {
  const cat = load({ own: true });
  for (const k of ['marge', 'success', 'ratio', 'occupation', 'adr', 'regulars']) assert.equal(derive(cat, k, {}, CTX), null, k);
  assert.equal(derive(cat, 'marge', { marge: { value: 55, delta: 1 } }, CTX).value, 55);
});

ok('bénéfice brut sur une marge partiellement chiffrée : la tuile dit sur quelle part des ventes, dans la langue de l\'écran', () => {
  const partial = { ...REAL, marge: { value: 31.6, costedPct: 69.3 } };
  assert.equal(derive(load({ own: true }), 'profit', partial, CTX).note, 'Estimation · coût connu sur 69 % des ventes');
  assert.equal(derive(load({ own: true, lang: 'en' }), 'profit', partial, CTX).note, 'Estimate · cost known on 69 % of sales');
  assert.ok(/69/.test(derive(load({ own: true, lang: 'ar' }), 'profit', partial, CTX).note));
  assert.equal(derive(load({ own: true }), 'profit', { ...REAL, marge: { value: 40, costedPct: 100 } }, CTX).note, '', 'tout chiffré : pas de mention');
  assert.equal(derive(load({ own: true }), 'profit', REAL, CTX).note, '', 'démo et marge sans couverture : pas de mention');
});

ok('la bande par défaut d\'une boutique montre ventes nettes et bénéfice brut', () => {
  const data = coreTestSource.readFileSync(path.join(__dirname, '..', 'assets/venues/data.js'), 'utf8');
  const at = data.indexOf('    boutique: [\n      { key: \'tx\'');
  assert.ok(at > 0, 'bande boutique introuvable');
  const keys = [...data.slice(at, data.indexOf('],', at)).matchAll(/key: '([a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['tx', 'panier', 'revenue', 'profit', 'tauxRetour', 'ratio']);
});

ok('toutes les tuiles du catalogue répondent sans lever sur une période vide et sur la période réelle', () => {
  const cat = load({ own: true, closedTips: null });
  const keys = Object.keys(cat);
  assert.ok(keys.length >= 15, keys.length + ' tuiles');
  for (const k of keys) {
    for (const d of [{}, REAL]) assert.doesNotThrow(() => cat[k].derive(d, CTX), k);
  }
});

console.log(process.exitCode ? `\n✗ tuiles KPI : ${n} ok, échec(s) ci-dessus` : `  ✓ tuiles KPI exécutées (${n} contrôles : CA exact dans cinq tuiles, variations, démo intacte, marge absente, pourboires réels, carnet clients, périodes vides)`);
