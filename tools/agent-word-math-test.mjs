#!/usr/bin/env node
// Arithmetic said in words gets a number, in every language the counter
// speaks. From 60 random questions written on 27 Nov 2026: « 7seb lia 3200 dh
// m9ssma 3la 26 nhar » was « not understood », and « 2 kg de viande à 95 dh le
// kilo, ça fait combien ? » went to the model, which can invent the product.
// A sum only reads when the words say one: a salary per month, a price rise,
// a count of sales at a price stay with their own routes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { load, flatten } = require(path.join(root, 'tools/agent-harness.cjs'));
process.chdir(root);

const W = {};
const world = (lang) => W[lang] || (W[lang] = load({
  lang, role: 'owner', corpus: false,
  env: { isReal: () => true },
  venue: { isCustom: () => true, getVenue: () => 'v1', getCurrentVenueData: () => ({ name: 'Boucherie test', subtype: 'restaurant' }) },
  sales: { list: () => [], totals: () => ({ revenue: 0, count: 0, basket: 0 }) },
}));
const ask = (q, L) => { const w = world(L); return { route: w.KiwiAgentRoute(q), text: flatten(w.KiwiAgentAsk(q, L)).replace(/\s+/g, ' ') }; };
let n = 0;

for (const [q, L, want] of [
  ['7seb lia 3200 dh m9ssma 3la 26 nhar', 'fr', '123,08'],
  ['3200 divisé par 26', 'fr', '123,08'],
  ['3200 dh répartis sur 26 jours', 'fr', '123,08'],
  ['split 3200 between 26 days', 'en', '123.08'],
  ['احسب لي 3200 درهم مقسومة على 26 يوم', 'ar', '123'],
  ['٣٢٠٠ مقسمة على ٢٦', 'ar', '123'],
  ["J'ai vendu 2 kg de viande à 95 dh le kilo, ça fait combien ?", 'fr', '190'],
  ['3 kilos à 85 dh le kg', 'fr', '255'],
  ['2.5 kg at 120 dh per kilo, how much is that?', 'en', '300'],
  ['b3t 4 kilo b 70 dh l kilo ch7al hadi', 'fr', '280'],
  ['12 pièces à 15 dh la pièce ça fait combien', 'fr', '180'],
  ['250 fois 12', 'fr', '3 000'],
  ['250 times 12', 'en', '3,000'],
]) {
  const r = ask(q, L);
  assert.ok(/^math/.test(r.route) && r.text.includes(want), `« ${q} » should compute ${want} → {${r.route}} ${r.text.slice(0, 120)}`);
  n++;
}

// Words that only look like a sum keep their own route.
for (const [q, L] of [
  ['un serveur à 3000 dh par mois, je peux ?', 'fr'],
  ['wach n9der nzid serveur b 3000 dh f chhar', 'fr'],
  ['augmente mes prix de 10%', 'fr'],
  ['combien de tacos à 40 dh j’ai vendus cette semaine', 'fr'],
  ['I sold 2 burgers today, how much did I make?', 'en'],
  ['divise mon chiffre par 2', 'fr'],
]) {
  const r = ask(q, L);
  assert.ok(!/^math/.test(r.route), `« ${q} » is not a sum to compute → {${r.route}} ${r.text.slice(0, 100)}`);
  n++;
}

console.log(`✓ agent word math: ${n} checks (division and unit price in words, traps keep their route)`);
