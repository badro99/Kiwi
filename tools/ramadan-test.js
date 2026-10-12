#!/usr/bin/env node
/* Ramadan, mesuré sur les ventes (assets/ramadan.js) et dit par Kiwi IQ.
 *
 *   · les dates : calendrier Umm al-Qura du navigateur, Ramadans complets ;
 *   · l'effet : journée moyenne pendant Ramadan contre les 28 jours d'avant,
 *     part du soir, jour de l'Aïd, refaits ici à la main ;
 *   · rien n'est dit sans couverture : historique trop court, trop de jours
 *     sans ventes, Ramadan en cours ;
 *   · Kiwi IQ cite ces chiffres en FR/EN/AR, et sans historique garde son
 *     « je n'invente pas de prévision » en donnant la date du prochain. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓ ' + msg); };

global.window = {};
require(path.join(ROOT, 'assets/ramadan.js'));
const R = window.KiwiRamadan;

console.log('\n■ Dates');
ok(R.supported, 'this runtime has the Umm al-Qura calendar');
const P = R.periods('2024-01-01', '2027-12-31');
ok(JSON.stringify(P.map((p) => [p.hijriYear, p.start, p.end, p.eid, p.days])) === JSON.stringify([
  [1445, '2024-03-11', '2024-04-09', '2024-04-10', 30],
  [1446, '2025-03-01', '2025-03-29', '2025-03-30', 29],
  [1447, '2026-02-18', '2026-03-19', '2026-03-20', 30],
  [1448, '2027-02-08', '2027-03-08', '2027-03-09', 29],
]), 'Ramadan 1445 to 1448 match the published Umm al-Qura dates');
ok(R.next('2026-10-12').start === '2027-02-08', 'the next Ramadan after 12 October 2026 starts on 8 February 2027');
ok(R.periods('2025-03-10', '2025-03-12').length === 1 && R.periods('2025-03-10', '2025-03-12')[0].start === '2025-03-01', 'a window inside Ramadan still returns the whole month');

/* Ventes : de mi-janvier à fin avril 2025. Avant Ramadan, 600 MAD à midi et
 * 300 MAD le soir ; pendant, 200 à midi et 900 le soir, fermé deux jours ;
 * fermé le jour de l'Aïd. Les heures UTC 11:00 et 20:30 restent du même côté
 * de 18 h à Casablanca, qu'il soit UTC+0 (Ramadan) ou UTC+1. */
const day = (d, n) => R.addDays(d, n);
function salesFor(from, to, opts) {
  const o = opts || {}, out = [];
  let id = 0;
  for (let d = from; d <= to; d = day(d, 1)) {
    const inR = d >= '2025-03-01' && d <= '2025-03-29';
    if (d === '2025-03-30') continue;
    if (inR && (o.closed || ['2025-03-07', '2025-03-14']).includes(d)) continue;
    const noon = Date.parse(d + 'T11:00:00Z'), eve = Date.parse(d + 'T20:30:00Z');
    out.push({ id: 's' + (id++), ts: noon, amount: inR ? 200 : 600 });
    out.push({ id: 's' + (id++), ts: eve, amount: inR ? 900 : 300 });
  }
  out.push({ id: 'void', ts: Date.parse('2025-03-10T12:00:00Z'), amount: 99999, void_ts: 1 });
  out.push({ id: 'refund', ts: Date.parse('2025-02-10T12:00:00Z'), amount: 5000, kind: 'refund' });
  return out;
}
const SALES = salesFor('2025-01-15', '2025-04-30');

console.log('\n■ Effet mesuré');
{
  const e = R.effect(SALES, { today: '2025-10-01' });
  ok(e && e.hijriYear === 1446 && e.start === '2025-03-01' && e.end === '2025-03-29', 'it reads Ramadan 1446, the last one the sales cover');
  ok(e.during.openDays === 27 && e.during.days === 29 && Math.abs(e.during.avg - 1100) < 1e-9, `Ramadan: 27 open days of 29, 1 100 MAD a day (got ${e.during.avg})`);
  ok(e.before.openDays === 28 && Math.abs(e.before.avg - 900) < 1e-9, 'the 28 days before: 900 MAD a day, the refund and the voided sale left out');
  ok(Math.abs(e.change - 200 / 900) < 1e-12, `change +${(e.change * 100).toFixed(1)} % recomputed by hand`);
  ok(Math.abs(e.during.eveningShare - 900 / 1100) < 1e-12 && Math.abs(e.before.eveningShare - 300 / 900) < 1e-12, 'evening share 81.8 % against 33.3 %');
  ok(e.eid && e.eid.day === '2025-03-30' && e.eid.open === false && e.eid.revenue === 0, 'Eid al-Fitr: closed, said as closed');
}
ok(R.effect(salesFor('2025-02-15', '2025-04-30'), { today: '2025-10-01' }) === null, 'history starting inside the 4 weeks before: nothing claimed');
{
  const closed = [];
  for (let d = '2025-03-01'; d <= '2025-03-20'; d = day(d, 1)) closed.push(d);
  ok(R.effect(salesFor('2025-01-15', '2025-04-30', { closed }), { today: '2025-10-01' }) === null, 'sales on 9 Ramadan days of 29: too thin, nothing claimed');
}
ok(R.effect(salesFor('2025-01-15', '2025-03-20'), { today: '2025-03-20' }) === null, 'Ramadan still running: not measured');
ok(R.effect([], { today: '2025-10-01' }) === null, 'no sales, no claim');

console.log('\n■ Kiwi IQ');
function agent(sales, lang) {
  const noop = () => {};
  const el = () => { const e = { dataset: {}, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, addEventListener: noop, removeEventListener: noop, appendChild: noop, insertAdjacentHTML: noop, querySelectorAll: () => [], setAttribute: noop, getAttribute: () => null, textContent: '', innerHTML: '', focus: noop }; e.querySelector = () => e; return e; };
  const document = { readyState: 'complete', documentElement: el(), head: el(), body: el(), createElement: () => el(), querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, getElementById: () => null };
  const store = {};
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, length: 0 };
  const w = { document, localStorage, addEventListener: noop, setTimeout: () => 0, matchMedia: () => ({ matches: false, addEventListener: noop }), KiwiI18n: { getLang: () => lang },
    KiwiSales: { list: () => sales } };
  w.window = w;
  const ctx = { window: w, document, localStorage, console, setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, navigator: { language: 'fr-FR', userAgent: 'node' }, location: { href: 'https://kiwi-maroc.pages.dev/dashboard.html', search: '' }, fetch: () => Promise.reject(new Error('offline')) };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['agent-data.js', 'agent-features.js', 'agent-truth.js', 'ramadan.js', 'agent.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8'), ctx, { filename: f });
  return w;
}
const strip = (s) => String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/[  ]/g, ' ');
const flat = (r) => r ? [r.text, ...(r.stats || []).map((s) => `${s.l}: ${s.v} (${s.h})`), r.verdict && r.verdict.text, r.note].map(strip).join('\n') : '';
{
  const w = agent(SALES, 'fr');
  const a = flat(w.KiwiAgentAsk('comment se passe le ramadan pour moi', 'fr'));
  ok(/Ramadan sur Kiwi \(1446 H, du 1 mars 2025 au 29 mars 2025\)/.test(a), 'FR: names Ramadan 1446 and its dates');
  ok(/Journée moyenne · Ramadan: 1 100 MAD \(27 jours avec des ventes sur 29\)/.test(a) && /4 semaines avant: 900 MAD \(28 jours avec des ventes sur 28\)/.test(a), 'FR: both average days, with how many days had sales');
  ok(/Écart: \+22,2 %/.test(a) && /plus haute de 22,2 %/.test(a), 'FR: +22,2 % and the verdict');
  ok(/Part du soir \(dès 18 h\): 81,8 % \(contre 33,3 % avant Ramadan\)/.test(a), 'FR: the evening share moved from 33,3 % to 81,8 %');
  ok(/Jour de l’Aïd al-Fitr: aucune vente/.test(a), 'FR: Eid day closed, said plainly');
  ok(/Umm al-Qura/.test(a) && /un jour/.test(a), 'FR: says the dates can be a day off the Moroccan sighting');
  ok(!/pas d’historique de Ramadan/.test(a) && !/—/.test(a), 'FR: no « no history » line when there is history, no em dash');
  const en = flat(agent(SALES, 'en').KiwiAgentAsk('how is ramadan for my business', 'en'));
  ok(/Your last Ramadan on Kiwi \(1446 AH/.test(en) && /Difference: \+22[.,]2 %/.test(en), 'EN');
  const ar = flat(agent(SALES, 'ar').KiwiAgentAsk('كيف يكون رمضان بالنسبة لي', 'ar'));
  ok(/آخر رمضان لك على Kiwi/.test(ar) && /يوم عيد الفطر/.test(ar), 'AR');
}
{
  const w = agent([], 'fr');
  const a = flat(w.KiwiAgentAsk('comment se passe le ramadan pour moi', 'fr'));
  const nextStart = R.next(new Date().toISOString().slice(0, 10));
  ok(!/1446 H/.test(a), 'without Ramadan history no figure is invented');
  ok(/pas d’historique de Ramadan/.test(a) && (!nextStart || a.includes('Le prochain Ramadan commence vers le')), 'it keeps « no history, no invented forecast » and adds when the next Ramadan starts');
}

console.log(`\nramadan: ${pass} passed`);
