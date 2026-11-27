#!/usr/bin/env node
// The assistant reads one named period (assets/agent-data.js, periodSpec /
// sPeriod) and leaves how-to questions and slips to the guide or the model
// (supportAsk). Both came from a thousand random questions written on 27 Nov
// 2026 by someone who had never seen the assistant: « ventes la semaine
// dernière », « ch7al dkhlt akher 7 iyam », « tickets had simana » got « I
// can't compare two periods » or today's total, and « Can I print an invoice
// again? » got a hiring simulation.
//
// The sales below are spread over several weeks, so each period has its own
// figure: a wrong window gives a wrong number, never a lucky right one.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { load, flatten } = require(path.join(root, 'tools/agent-harness.cjs'));
process.chdir(root);

const DAY = 864e5, H = 3600e3;
const t0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
const dow = (new Date(t0).getDay() + 6) % 7;            // Monday = 0
const mon = t0 - dow * DAY;
const now = new Date(t0), firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
const firstOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

const sale = (ts, amount, method, lines) => ({ ts, amount, method, lines: lines.map(([name, qty, total]) => ({ name, qty, total })) });
const FEED = [
  sale(t0 + 12 * H, 100, 'cash', [['Tacos XL', 2, 80], ['Coca 33cl', 1, 20]]),
  sale(mon - 5 * DAY + 12 * H, 300, 'card', [['Tacos XL', 3, 120], ['Burger Classic', 3, 180]]),
  sale(mon - 4 * DAY + 13 * H, -50, 'cash', []),
  sale(mon - 3 * DAY + 12 * H, 70, 'cash', [['Frites', 7, 70]]),
  sale(firstOfLast + 14 * DAY + 12 * H, 500, 'cash', [['Burger Classic', 5, 300], ['Tiramisu', 4, 200]]),
].map((s, i) => Object.assign(s, { cursor: i + 1 }));
const ITEMS = ['Tacos XL', 'Burger Classic', 'Salade César', 'Frites', 'Coca 33cl', 'Thé à la menthe', 'Tiramisu'];

const world = (lang) => load({
  lang, role: 'owner', corpus: false,
  env: { isReal: () => true },
  venue: { isCustom: () => true, getVenue: () => 'v1', getCurrentVenueData: () => ({ name: 'Burger test', subtype: 'restaurant' }) },
  sales: { list: () => FEED, totals: () => ({ revenue: 100, count: 1, basket: 100 }) },
  globals: { KiwiMenuStore: { items: () => ITEMS.map((name, i) => ({ id: 'i' + i, name, price: 20 + i * 5 })) } },
});
const W = {};
const ask = (q, L) => { const w = W[L] || (W[L] = world(L)); return { route: w.KiwiAgentRoute(q), text: flatten(w.KiwiAgentAsk(q, L)).replace(/\s+/g, ' ') }; };
const sum = (from, to, pick = (s) => s.amount > 0 ? s.amount : 0) => FEED.filter((s) => s.ts >= from && s.ts < to).reduce((a, s) => a + pick(s), 0);
const units = (from, to, name) => FEED.filter((s) => s.ts >= from && s.ts < to).reduce((a, s) => a + s.lines.filter((l) => l.name === name).reduce((b, l) => b + l.qty, 0), 0);
const has = (text, n) => new RegExp('(?:^|[^\\d])' + n + '(?:[^\\d]|$)').test(text);
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// 1. One period, read for what was asked.
const lastWeek = sum(mon - 7 * DAY, mon);                              // 370
const last7 = sum(t0 - 6 * DAY, t0 + DAY);
const thisWeek = sum(mon, t0 + DAY);
const lastMonth = sum(firstOfLast, firstOfMonth);
for (const [q, L, want, why] of [
  ['mes ventes la semaine dernière', 'fr', lastWeek, 'last week, Monday to Sunday'],
  ['I need a summary of revenue last week', 'en', lastWeek, '« summary of revenue » names the takings, not a topic'],
  ['ch7al dkhlt akher 7 iyam', 'fr', last7, 'the last seven days, today included'],
  ['وريني المبيعات الأسبوع الماضي عفاك', 'ar', lastWeek, 'Arabic, last week'],
  ['I need a summary of sales last month', 'en', lastMonth, 'last calendar month'],
]) {
  const r = ask(q, L);
  ok(/^lookup/.test(r.route) && has(r.text, want), `« ${q} » (${why}) should give ${want} MAD → {${r.route}} ${r.text.slice(0, 140)}`);
}
{
  const r = ask('combien de tickets cette semaine', 'fr');
  const count = FEED.filter((s) => s.ts >= mon && s.ts < t0 + DAY && s.amount > 0).length;
  ok(/^lookup/.test(r.route) && new RegExp(count + ' ticket').test(r.text) && has(r.text, thisWeek), `tickets this week → ${count} for ${thisWeek} MAD, got ${r.text.slice(0, 120)}`);
}
{
  const r = ask('combien de tacos vendus la semaine dernière', 'fr');
  const u = units(mon - 7 * DAY, mon, 'Tacos XL');
  ok(r.text.includes(u + ' × Tacos XL') && !r.text.includes((u + 2) + ' × Tacos XL'), `tacos last week → ${u}, not today's 2 added → ${r.text.slice(0, 120)}`);
}
{
  const r = ask('cash payments last month', 'en');
  ok(/In cash/.test(r.text) && has(r.text, lastMonth), `cash last month → ${lastMonth} → ${r.text.slice(0, 120)}`);
  const f = ask('remboursements la semaine dernière', 'fr');
  ok(/1 remboursement/.test(f.text) && has(f.text, 50), `refunds last week → 1 for 50 MAD → ${f.text.slice(0, 120)}`);
}

// 2. Not a single period: the honest refusal, or the route that owns it.
for (const [q, L] of [
  ['compare les ventes de cette semaine avec la semaine dernière', 'fr'],
  ['pourquoi mes ventes ont baissé la semaine dernière', 'fr'],
  ['9aren lia lbi3 chhar li fat m3a had chhar', 'fr'],
]) { const r = ask(q, L); ok(/^notrend/.test(r.route), `« ${q} » compares two periods → {${r.route}}`); }
for (const [q, L, not] of [
  ['un serveur à 3000 dh par mois, je peux ?', 'fr', /^lookup/],
  ['ventes prévues à la fin du mois', 'fr', /^lookup/],
  ['What were takings on March 12?', 'en', /^lookup/],
]) { const r = ask(q, L); ok(!not.test(r.route), `« ${q} » is not a period read-back → {${r.route}}`); }
{
  const r = ask('Show me expenses last week please', 'en');
  ok(/not one I read by period/.test(r.text) && !/took/.test(r.text), `expenses last week is not the takings → ${r.text.slice(0, 120)}`);
}
// Today's and yesterday's takings stay with the day card.
ok(/^day/.test(ask("les ventes d'aujourd'hui", 'fr').route), 'today is the day card');

// 3. A question about using the till is not a figure.
for (const [q, L] of [
  ['Can I print an invoice again?', 'en'],
  ['I accidentally charged the same customer twice', 'en'],
  ['كيفاش نسجل مصروف ديال الطاكسي؟', 'ar'],
  ['J’ai noté un achat comme une vente par erreur', 'fr'],
  ['Can I set different prices for dine-in and takeaway?', 'en'],
]) {
  const r = ask(q, L);
  ok(/^(?:llm|feature)\b/.test(r.route), `« ${q} » is a how-to or a slip → {${r.route}} ${r.text.slice(0, 80)}`);
}
for (const [q, L, want] of [
  ['can i afford another waiter at 3000 dh', 'en', /^(?:hire|afford)/],
  ['wach n9der nzid serveur?', 'fr', /^hire/],
  ['comment augmenter mes ventes', 'fr', /^advice/],
]) { const r = ask(q, L); ok(want.test(r.route), `« ${q} » keeps its route → {${r.route}}`); }

console.log(`✓ agent period: ${n} checks (one period read back, two periods refused, how-tos left to the guide)`);
