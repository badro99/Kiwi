#!/usr/bin/env node
// « Est-ce que mon snack peut fermer une heure plus tôt sans perdre trop de
// ventes ? » got the sales card on 27 Nov 2026. The answer is in the sales:
// what the last hour before closing brought in, read against the opening
// hours the merchant set. A split day (lunch 12–15, dinner 19–23) closes once,
// at 23:00: the end of lunch is not « the last hour ». Without hours set, the
// assistant asks for them rather than guessing a closing time.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { load, flatten } = require(path.join(root, 'tools/agent-harness.cjs'));
process.chdir(root);

const H = 3600e3, DAY = 24 * H;
const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
const SERVICES = [[12, 15], [19, 23]];
const slotsOf = (d0) => SERVICES.map(([a, b]) => [d0 + a * H, d0 + b * H]);
const midnight = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const HOURS = {
  isConfigured: () => true,
  wallClock: (ms) => ms,
  statusAt(ts) {
    const all = [...slotsOf(midnight(ts) - DAY), ...slotsOf(midnight(ts)), ...slotsOf(midnight(ts) + DAY)];
    const cur = all.find(([a, b]) => a <= ts && ts < b);
    if (cur) return { known: true, open: true, configured: true, closesAt: cur[1], opensAt: null };
    const next = all.find(([a]) => a > ts);
    return { known: true, open: false, configured: true, closesAt: null, opensAt: next ? next[0] : null };
  },
  isOpenAt(ts) { return this.statusAt(ts).open; },
};

// Ten days, each the same: 12:30 → 30, 13:00 → 100, 14:30 → 50 (end of lunch,
// not the last hour), 20:00 → 200, 22:15 → 80 (the last hour), 23:30 → 40
// (after the hours set). The days start two back: the current business day
// is left out, and before 05:00 it still carries yesterday's date.
const FEED = [];
for (let d = 2; d <= 11; d++) {
  const d0 = today - d * DAY;
  for (const [h, m, amount] of [[12, 30, 30], [13, 0, 100], [14, 30, 50], [20, 0, 200], [22, 15, 80], [23, 30, 40]]) {
    FEED.push({ ts: d0 + h * H + m * 60e3, amount, method: 'cash', lines: [], cursor: FEED.length + 1 });
  }
}
const world = (lang, hours) => load({
  lang, role: 'owner', corpus: false,
  env: { isReal: () => true },
  venue: { isCustom: () => true, getVenue: () => 'v1', getCurrentVenueData: () => ({ name: 'Snack test', subtype: 'restaurant' }) },
  sales: { list: () => FEED, totals: () => ({ revenue: 0, count: 0, basket: 0 }) },
  globals: hours === false ? { KiwiHours: { isConfigured: () => false, statusAt: () => ({ known: false, open: false }) } } : { KiwiHours: HOURS },
});
const W = {};
const ask = (q, L, hours) => {
  const k = L + (hours === false ? '-unset' : '');
  const w = W[k] || (W[k] = world(L, hours));
  return { route: w.KiwiAgentRoute(q), text: flatten(w.KiwiAgentAsk(q, L)).replace(/\s+/g, ' ') };
};
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// Total 5 000 over 10 days. Last hour before the 23:00 close: 800 (16 %), 80 a day.
for (const [q, L, money, share, perDay] of [
  ['Est-ce que mon snack peut fermer une heure plus tôt sans perdre trop de ventes ?', 'fr', /800 MAD/, /16 %/, /80 MAD/],
  ['if I close an hour earlier how much do I lose', 'en', /800 MAD/, /16%/, /80 MAD/],
  ['ila sddit sa3a 9bel ch7al ghadi nkhser', 'fr', /800 MAD/, /16 %/, /80 MAD/],
  ['إلا سديت ساعة قبل شحال غادي نخسر؟', 'ar', /800 MAD/, /16/, /80 MAD/],
  ['should I close earlier on weekdays', 'en', /800 MAD/, /16%/, /80 MAD/],
  ['wach nsedd bekri b sa3a?', 'fr', /800 MAD/, /16 %/, /80 MAD/],
]) {
  const r = ask(q, L);
  ok(/^lookup/.test(r.route) && money.test(r.text) && share.test(r.text) && perDay.test(r.text) && /10/.test(r.text),
    `« ${q} » measures the last hour before closing → {${r.route}} ${r.text.slice(0, 220)}`);
  ok(!/\b250 MAD|\b1 050 MAD/.test(r.text), `« ${q} » does not count the end of lunch as the last hour → ${r.text.slice(0, 200)}`);
  ok(/\b10\b.{0,60}(?:horaires|hours|الأوقات|أوقات)/.test(r.text), `« ${q} » says 10 sales fall outside the hours set → ${r.text.slice(-260)}`);
}
// Two hours before 23:00 reach back to 21:00: still only 22:15. Three reach
// 20:00 too: 2 800 (56 %).
{
  const two = ask('fermer deux heures plus tôt, ça me coûte combien ?', 'fr');
  ok(/800 MAD/.test(two.text) && !/2 800/.test(two.text) && /2 dernières heures/.test(two.text), `two hours earlier → ${two.text.slice(0, 200)}`);
  const three = ask('si je ferme trois heures plus tôt ?', 'fr');
  ok(/2 800 MAD/.test(three.text) && /56 %/.test(three.text), `three hours earlier → ${three.text.slice(0, 200)}`);
}
// Opening an hour later: the first hour of the first service, 12:30 → 300 (6 %).
{
  const r = ask('et si j’ouvre une heure plus tard ?', 'fr');
  ok(/300 MAD/.test(r.text) && /6 %/.test(r.text) && !/2 300|500 MAD/.test(r.text), `opening an hour later → {${r.route}} ${r.text.slice(0, 200)}`);
}
// No opening hours set: ask for them, guess nothing.
{
  const r = ask('Est-ce que je peux fermer une heure plus tôt ?', 'fr', false);
  ok(/horaires/.test(r.text) && !/MAD/.test(r.text), `without hours set the assistant asks for them → ${r.text.slice(0, 200)}`);
}
// Two finished days are too few to measure anything: said, not computed.
{
  const w = load({
    lang: 'fr', role: 'owner', corpus: false, env: { isReal: () => true },
    venue: { isCustom: () => true, getVenue: () => 'v1', getCurrentVenueData: () => ({ name: 'Snack neuf', subtype: 'restaurant' }) },
    sales: { list: () => FEED.filter((e) => e.ts > today - 3 * DAY), totals: () => ({ revenue: 0, count: 0, basket: 0 }) },
    globals: { KiwiHours: HOURS },
  });
  const text = flatten(w.KiwiAgentAsk('je peux fermer une heure plus tôt ?', 'fr')).replace(/\s+/g, ' ');
  ok(/trop peu/.test(text) && !/MAD/.test(text), `two days of sales are too few → ${text.slice(0, 160)}`);
}
// Look-alikes keep their route.
for (const [q, L] of [
  ['à quelle heure je ferme ce soir ?', 'fr'],
  ['je vais fermer 3 jours pour l’aïd', 'fr'],
  ['combien j’ai vendu hier', 'fr'],
  ['comment fermer la caisse plus tôt', 'fr'],
  ['je ferme plus tôt ce soir', 'fr'],
]) { const r = ask(q, L); ok(!/avant la fermeture|after opening|après l’ouverture/.test(r.text), `« ${q} » is not a last-hour question → {${r.route}} ${r.text.slice(0, 100)}`); }

console.log(`✓ agent last hour: ${n} checks (the last hour before the day’s close, read against the hours set)`);
