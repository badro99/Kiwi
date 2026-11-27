#!/usr/bin/env node
// The assistant's paraphrase bench: every question a merchant can ask about
// their OWN figures, typed the many ways merchants type it (Moroccan French,
// English, Arabic, Darija in Arabic letters and in arabizi, typos, SMS), asked
// of one fixture business whose answers are known. Each answer is graded on the
// FACT it must carry (9 people in the team, Tacos XL sells most, 420 MAD
// today…), not on the route it took.
//
// Why it exists (27 Nov 2026): a restaurant asked "how many employees" and got
// a number the model made up; the router knew "combien d'employés" but not
// "how many employees", "nombre d'employés" or "شحال من خدام". The routing
// corpus held four phrasings per question. This holds dozens, and a miss must
// never reach the model as a free guess: it is either answered from the data
// or declined honestly (see the "declines" check).
//
// Questions live in tools/agent-bench.json (generated, then curated by hand;
// a phrasing that is genuinely ambiguous is removed there with its reason in
// the commit, never silently). Report: node tools/agent-bench-test.mjs --report
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { load, flatten } = require('./agent-harness.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const BENCH = JSON.parse(fs.readFileSync(path.join(here, 'agent-bench.json'), 'utf8'));
const REPORT = process.argv.includes('--report');

/* ── the fixture business: every answer below is known ──
 * Numbers are chosen so no two facts share a value: 420 MAD over 4 tickets
 * (basket 105), 9 people in the team (2 on shift), 5 clients in the book,
 * 7 items on the menu and in the catalogue, Salma has 88 points. */
const noon = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime(); })();
const DAY = 864e5;
const FEED = [
  { cursor: 1, amount: 180, method: 'cash', ts: noon - 3 * 3600e3, lines: [{ name: 'Tacos XL', qty: 4, total: 160 }, { name: 'Salade César', qty: 1, total: 20 }] },
  { cursor: 2, amount: 150, method: 'card', ts: noon - 2 * 3600e3, lines: [{ name: 'Tacos XL', qty: 3, total: 120 }, { name: 'Coca 33cl', qty: 2, total: 30 }] },
  { cursor: 3, amount: 60, method: 'cash', ts: noon - 3600e3, lines: [{ name: 'Tacos XL', qty: 1, total: 40 }, { name: 'Frites', qty: 1, total: 20 }] },
  { cursor: 4, amount: 30, method: 'cash', ts: noon - 1800e3, lines: [{ name: 'Coca 33cl', qty: 2, total: 30 }] },
];
const TEAM = ['Karim Alaoui', 'Nadia Tazi', 'Omar', 'Hind', 'Said', 'Imane', 'Yassir', 'Ghita', 'Reda']
  .map((name, i) => ({ id: 'm' + i, name, role: i < 4 ? 'Serveur' : 'Cuisine', hoursToday: i < 2 ? 4 : 0 }));
const BOOK = [
  { name: 'Salma Bennani', spend: 4200, visits: 31, points: 88, lastSeen: noon - 2 * DAY },
  { name: 'Youssef Idrissi', spend: 2600, visits: 18, points: 51, lastSeen: noon - 60 * DAY },
  { name: 'Leila Amrani', spend: 900, visits: 6, points: 12, lastSeen: noon - 4 * DAY },
  { name: 'Mehdi Fassi', spend: 600, visits: 4, points: 8, lastSeen: noon - 8 * DAY },
  { name: 'Kenza Lahlou', spend: 300, visits: 2, points: 4, lastSeen: noon - 11 * DAY },
];
const ITEMS = ['Tacos XL', 'Burger Classic', 'Salade César', 'Frites', 'Coca 33cl', 'Thé à la menthe', 'Tiramisu'];
const PRODUCTS = ITEMS.map((name, i) => ({ id: 'p' + i, name }));
const STOCK = { p0: 25, p1: 14, p2: 6, p3: 2, p4: 0, p5: 30, p6: 9 };
const closesAt = (() => { const d = new Date(); d.setHours(23, 0, 0, 0); return d.getTime(); })();
const HOURS = {
  isConfigured: () => true,
  statusAt: () => ({ open: true, closesAt, minutesToClose: Math.max(1, Math.round((closesAt - Date.now()) / 6e4)) }),
  summary: () => ({ text: '12:00 – 23:00' }),
  wallClock: (ms) => ms,
  weekText: () => 'tous les jours 12:00 – 23:00',
  dayLabel: (k) => k,
  exceptions: () => [],
};

function world(lang) {
  return load({
    lang, role: 'owner', corpus: false,
    env: { isReal: () => true },
    venue: { isCustom: () => true, getVenue: () => 'v1', getCurrentVenueData: () => ({ name: 'Burger test', subtype: 'restaurant' }) },
    sales: { list: () => FEED, totals: () => ({ revenue: 420, count: 4, basket: 105 }) },
    globals: {
      KiwiTeam: { roster: () => TEAM },
      KiwiClients: {
        hasBook: () => true, list: () => BOOK,
        config: () => ({ on: true, threshold: 100, reward: 'un café' }),
        segmentCounts: () => ({ total: 5, vip: 1, win: 1, new: 0, reg: 3 }),
      },
      KiwiBoutiqueCatalog: {
        listProducts: () => PRODUCTS, productStock: (id) => STOCK[id],
        stats: () => ({ products: 7, costed: 7, stockCost: 1900, stockValue: 3800, totalStock: 86, ruptures: 1, low: 1 }),
      },
      KiwiMenuStore: { items: () => ITEMS.map((name, i) => ({ id: 'i' + i, name, price: 20 + i * 5 })) },
      KiwiHours: HOURS,
    },
  });
}

/* What each answer must carry. Facts, so the language does not matter; a
 * function when the fact alone could also be read off a neighbouring answer. */
const FACT = {
  'staff.count': /\b9\b|٩/,
  'staff.today': /Karim Alaoui/,
  'staff.top': (s) => /Serveur ×4/.test(s) && !/\b9\b/.test(s.split('\n')[0]),
  'product.top': /Tacos XL/,
  'product.bottom': /Salade César|Frites/,
  'client.top': /Salma Bennani/,
  'client.points': /\b88\b/,
  'client.dormant': /Youssef Idrissi/,
  'stock.out': /Coca 33cl/,
  'hours.close': /23:00/,
  'hours.open': /23:00|12:00/,
  'revenue.today': /\b420\b/,
  'revenue.month': /\b420\b/,
  'orders.today': /\b4\b/,
  'basket.avg': /\b105\b/,
  'clients.count': /\b5\b/,
  'menu.count': /\b7\b/,
};
const holds = (f, s) => (typeof f === 'function' ? f(s) : f.test(s));
/* The UI language a writer of each register would have set. */
const UI = { fr: 'fr', en: 'en', ar: 'ar', darija: 'ar', arabizi: 'fr' };

const worlds = {};
const ask = (q, lang) => { const w = worlds[lang] || (worlds[lang] = world(lang)); return flatten(w.KiwiAgentAsk(q, lang)); };

const route = (q, lang) => { try { return worlds[lang].KiwiAgentRoute(q); } catch (_) { return '?'; } };
let total = 0, pass = 0;
const misses = [];
const byIntent = {};
for (const [intent, regs] of Object.entries(BENCH)) {
  const fact = FACT[intent];
  if (!fact) { misses.push({ intent, q: '(no FACT for this intent)', got: '' }); continue; }
  byIntent[intent] = { total: 0, pass: 0, llm: 0 };
  for (const [reg, qs] of Object.entries(regs)) {
    if (reg === 'near' || !UI[reg]) continue;
    for (const q of qs) {
      total++; byIntent[intent].total++;
      const got = ask(q, UI[reg]);
      if (holds(fact, got)) { pass++; byIntent[intent].pass++; continue; }
      if (got === '[[LLM]]') byIntent[intent].llm++;
      misses.push({ intent, reg, q, got: `{${route(q, UI[reg])}} ` + got.replace(/\s+/g, ' ').slice(0, 100) });
    }
  }
}

/* Traps: questions that look like one of the seventeen and are not, each one
 * a wrong answer the vocabulary layer once gave or could give. They must not
 * come back carrying the look-alike's figure. */
const TRAPS = [
  { q: 'ch7al points 3nd Ahmed Bennani', lang: 'fr', not: /\b88\b/, why: 'another Bennani is not Salma' },
  { q: 'qui travaille demain', lang: 'fr', not: /Karim Alaoui/, why: 'tomorrow is not today’s shift' },
  { q: 'who works tomorrow', lang: 'en', not: /Karim Alaoui/, why: 'tomorrow is not today’s shift' },
  { q: 'on ouvre à quelle heure demain', lang: 'fr', must: /Demain/, why: 'tomorrow’s hours, not the state now' },
  { q: 'كم دفعت للمورد اليوم', lang: 'ar', route: 'charges', why: 'a supplier payment is a cost, not the takings' },
  { q: 'combien j’ai payé au fournisseur aujourd’hui', lang: 'fr', route: 'charges', why: 'a supplier payment is a cost, not the takings' },
  { q: 'combien coûte un employé', lang: 'fr', not: /équipe compte/, why: 'a cost, not the headcount' },
  { q: 'je veux licencier 3 serveurs, combien j’économise', lang: 'fr', not: /équipe compte/, why: 'a layoff simulation' },
  { q: 'كم عدد ساعات عمل الموظف اليوم', lang: 'ar', not: /فريقك يضم/, why: 'hours worked, not the headcount' },
  { q: 'je veux gagner 300000 par mois', lang: 'fr', route: 'goal', why: 'a target, not the month’s revenue' },
  { q: 'mon cash s’épuise', lang: 'fr', route: 'runway', why: 'cash, not stock' },
  { q: 'f ramadan kanbi3 9lil', lang: 'fr', route: 'season', why: 'a season, not the slowest item' },
  { q: 'mes ventes de janvier dernier', lang: 'fr', not: /moins vendu/, why: '« dernier » is a month, not a rank' },
  { q: 'ça va aujourd’hui ?', lang: 'fr', not: /\b420\b/, why: '« ça » is not the CA' },
  { q: 'send a message to inactive customers', lang: 'en', not: /Youssef Idrissi/, why: 'an order, not a question' },
  { q: 'ajoute un plat au menu', lang: 'fr', not: /compte <?b?>?7|compte 7/, why: 'an order, not a question' },
  { q: 'متوسط أرباح المقاهي', lang: 'ar', route: 'market', why: 'the sector’s average stays refused' },
  { q: 'ما هو متوسط السلة', lang: 'ar', must: /\b105\b/, why: 'the average ticket is not market data' },
];
const traps = [];
for (const t of TRAPS) {
  const got = ask(t.q, t.lang), r = route(t.q, t.lang);
  const bad = (t.not && t.not.test(got)) || (t.must && !t.must.test(got)) || (t.route && r !== t.route);
  if (bad) traps.push(`${t.q}  (${t.why})  →  {${r}} ${got.replace(/\s+/g, ' ').slice(0, 90)}`);
}

if (REPORT) {
  for (const [k, v] of Object.entries(byIntent)) console.log(`${String(v.pass).padStart(3)}/${String(v.total).padEnd(3)} ${k.padEnd(15)} ${v.llm ? `(${v.llm} to the model)` : ''}`);
  console.log('');
  for (const m of misses) console.log(`✗ [${m.intent} · ${m.reg}] ${m.q}  →  ${m.got}`);
}
console.log(`${misses.length ? '✗' : '✓'} agent bench: ${pass}/${total} answered with the right fact`);
console.log(`${traps.length ? '✗' : '✓'} agent bench: ${TRAPS.length - traps.length}/${TRAPS.length} look-alike traps avoided`);
for (const m of traps) console.log(`  ✗ trap: ${m}`);
if (!REPORT && misses.length) for (const m of misses.slice(0, 25)) console.log(`  ✗ [${m.intent} · ${m.reg}] ${m.q}  →  ${m.got}`);
if (misses.length || traps.length) process.exit(1);
