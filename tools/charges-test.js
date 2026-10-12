#!/usr/bin/env node
'use strict';
/* Charges fixes, commissions et résultat net : le calcul, tenu au centime.
 *
 * La marge brute disait combien chaque plat rapporte. Le résultat net dit si
 * le commerce gagne de l'argent. Entre les deux : le loyer (qui court même le
 * jour de fermeture), les salaires d'Équipe et leurs charges patronales, et ce
 * que la carte ou Glovo prélèvent vente par vente. Ce banc charge le VRAI
 * assets/charges-engine.js, et le VRAI assets/cost.js pour le registre des
 * ventes, et vérifie chaque règle sur des chiffres faits à la main.
 *
 *   node tools/charges-test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadCost } = require('./kiwi-cost-harness');

let fails = 0, n = 0;
function ok(label, cond, detail) {
  n++;
  if (cond) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); return; }
  fails++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
const near = (a, b, eps = 0.011) => a != null && b != null && Math.abs(a - b) <= eps;

const ctx = vm.createContext({ console, Date, Math, JSON, Number, String, Array, Object, Map, Set });
ctx.window = ctx; ctx.globalThis = ctx;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'charges-engine.js'), 'utf8'), ctx, { filename: 'charges-engine.js' });
const E = ctx.KiwiChargesEngine;
const D = E.days;

const line = (id, amount, extra) => Object.assign({ id, label: id, cat: 'rent', freq: 'month', versions: [{ from: '2026-01', amount }], until: null }, extra || {});

console.log('\n\x1b[1mCharges fixes · le calcul\x1b[0m');

/* ── 1. Une ligne, dans le temps ─────────────────────────────────────────── */
{
  const rent = line('rent', 9000, { versions: [{ from: '2026-01', amount: 9000 }, { from: '2026-03', amount: 9900 }] });
  ok('le loyer de février reste celui de février après la hausse de mars', E.monthlyOf(rent, '2026-02') === 9000 && E.monthlyOf(rent, '2026-03') === 9900 && E.monthlyOf(rent, '2026-11') === 9900);
  ok('avant sa première version, une charge ne pèse rien', E.monthlyOf(rent, '2025-12') === 0);
  ok('une charge arrêtée ne pèse plus après son dernier mois', E.monthlyOf(line('x', 500, { until: '2026-05' }), '2026-05') === 500 && E.monthlyOf(line('x', 500, { until: '2026-05' }), '2026-06') === 0);
  ok('une assurance annuelle pèse son douzième chaque mois', E.monthlyOf(line('ins', 6000, { freq: 'year' }), '2026-07') === 500);
  ok('une charge trimestrielle pèse son tiers chaque mois', E.monthlyOf(line('acc', 3000, { freq: 'quarter' }), '2026-07') === 1000);
}

/* ── 2. Un mois sur ses jours ────────────────────────────────────────────── */
{
  const doc = { lines: [line('rent', 3100)] };
  ok('un jour d’octobre porte 1/31 du loyer', E.fixedFor(doc, ['2026-10-12']).total === 100);
  ok('un jour de février porte 1/28', near(E.fixedFor(doc, ['2026-02-10']).total, 3100 / 28));
  ok('le mois entier porte le loyer entier, ni plus ni moins', E.fixedFor(doc, D.monthDays('2026-10-01')).total === 3100 && E.fixedFor(doc, D.monthDays('2026-02-01')).total === 3100);
  const across = D.lastDays('2026-03-02', 30);
  ok('30 jours à cheval sur deux mois : chaque jour au tarif de son mois', across[0] === '2026-02-01' && near(E.fixedFor(doc, across).total, 3100 + 3100 * 2 / 31));
  ok('aucun jour, aucune charge', E.fixedFor(doc, []).total === 0);
}

/* ── 3. Les commissions, vente par vente ─────────────────────────────────── */
{
  const doc = { commissions: { methods: { card: 1.5, tap: 1.5 }, channels: { glovo: 25, surplace: 10 } } };
  ok('la carte paie son taux sur la vente', near(E.commissionOf(doc, { amount: 200, method: 'card' }).method, 3));
  ok('les espèces ne paient rien', E.commissionOf(doc, { amount: 200, method: 'cash' }).method === 0);
  const split = E.commissionOf(doc, { amount: 100, method: 'split', parts: [{ method: 'card', amountCents: 6000 }, { method: 'cash', amountCents: 4000 }] });
  ok('un paiement partagé : seule la part carte paie la carte', near(split.method, 0.9), split);
  const glovo = E.commissionOf(doc, { amount: 100, method: 'card', channel: 'Glovo' });
  ok('Glovo prélève sa part sur toute la vente, en plus de la carte', near(glovo.channel, 25) && near(glovo.method, 1.5), glovo);
  ok('un canal du commerce (sur place) ne paie jamais de plateforme, même mal réglé', E.commissionOf(doc, { amount: 100, method: 'cash', channel: 'surplace' }).channel === 0);
  const all = E.commissionsFor(doc, [{ amount: 200, method: 'card' }, { amount: 100, method: 'cash', channel: 'glovo' }]);
  ok('les commissions d’une période s’additionnent par moyen et par canal', all.total === 28 && all.byKey['ch:glovo'] === 25 && all.byKey['pm:card'] === 3, all);
  const seen = E.seenKeys([{ method: 'card' }, { method: 'cash' }, { method: 'split', parts: [{ method: 'tap' }, { method: 'cash' }] }, { method: 'cash', channel: 'Glovo' }, { method: 'cash', channel: 'surplace' }]);
  ok('l’éditeur ne propose que les moyens et canaux réellement vus, hors espèces et salle', JSON.stringify(seen.methods.sort()) === '["card","tap"]' && JSON.stringify(seen.channels) === '["glovo"]', seen);
}

/* ── 4. Le personnel, depuis Équipe ──────────────────────────────────────── */
{
  const s = E.staffFor({ baseDue: 8000, variablePay: 2000, salaried: 2, rated: 1, members: 3 }, 21);
  ok('salaires + heures + 21 % de charges patronales', s.total === 12100 && s.social === 2100, s);
  ok('sans taux réglé : les salaires seuls, et on le sait', E.staffFor({ baseDue: 8000, variablePay: 0 }, null).total === 8000 && E.staffFor({ baseDue: 8000 }, null).socialSet === false);
  ok('pas d’équipe connue : pas de ligne personnel inventée', E.staffFor(null, 21) === null);
}

/* ── 5. Le résultat ──────────────────────────────────────────────────────── */
{
  const doc = { lines: [line('rent', 3100)], social: { rate: 20 }, commissions: { methods: { card: 2 }, channels: {} } };
  const netOf = (x) => x / 1.1;
  /* 1 100 TTC vendus, 880 chiffrés (80 %) : 800 HT chiffrés, 320 de coût. */
  const cov = { revenue: 1100, revenueCosted: 880, netCosted: 800, cost: 320, profit: 480, pctCosted: 80, refunds: 0 };
  const r = E.result(doc, { cov, sales: [{ amount: 1100, method: 'card' }], days: ['2026-10-12'], labour: { baseDue: 50, variablePay: 0 }, netOf });
  /* taux mesuré 60 % ; non chiffré 220 TTC = 200 HT → 120 de marge estimée */
  ok('la marge des ventes sans coût est estimée au taux mesuré, et dite estimée', near(r.margin, 600) && r.estimated === true && near(r.rate, 0.6), r);
  ok('commissions, personnel et charges fixes sont retirés un par un', near(r.commissions.total, 22) && near(r.staff.total, 60) && r.fixed.total === 100);
  ok('résultat net = marge − commissions − personnel − charges fixes', near(r.net, 600 - 22 - 60 - 100), r.net);
  const full = E.result(doc, { cov: Object.assign({}, cov, { revenueCosted: 1100, netCosted: 1000, cost: 400, profit: 600, pctCosted: 100 }), sales: [], days: [], labour: null, netOf });
  ok('tout est chiffré : rien d’estimé', full.estimated === false && near(full.margin, 600));
  const refunded = E.result(doc, { cov: Object.assign({}, cov, { refunds: 110 }), sales: [], days: [], labour: null, netOf });
  ok('un remboursement retire la marge de la vente qu’il rend', near(refunded.margin, 600 - 100 * 0.6), refunded.margin);
  const few = E.result(doc, { cov: Object.assign({}, cov, { pctCosted: 49.9 }), sales: [], days: ['2026-10-12'], labour: null, netOf });
  ok('sous la moitié des ventes chiffrées : aucun résultat net, jamais un chiffre inventé', few.net === null && few.margin === null && few.tooFew === true);
  ok('…mais les charges restent comptées et affichables', few.fixed.total === 100);
  const none = E.result(doc, { cov: { revenue: 0, revenueCosted: 0, netCosted: 0, cost: 0, profit: 0, pctCosted: null, refunds: 0 }, sales: [], days: ['2026-10-12'], labour: null, netOf });
  ok('un jour sans vente : le résultat est la perte des charges du jour', none.net === -100 && none.margin === 0);
  ok('un commerce sans aucune charge saisie n’est pas « configuré »', E.result({ lines: [], commissions: { methods: {}, channels: {} } }, { cov, sales: [], days: [] }).configured === false);
}

/* ── 6. Le seuil de rentabilité ──────────────────────────────────────────── */
{
  const doc = { lines: [line('rent', 6000)], social: { rate: null }, commissions: {} };
  const recent = { margin: 600, commissions: { total: 0 }, salesTTC: 1000, tooFew: false };
  const be = E.breakEven(doc, { recent, month: '2026-10', monthLabour: { baseDue: 6000, variablePay: 0 }, openDays: 26, openElapsed: 10, mtdSales: 8000 });
  ok('seuil = (charges + personnel du mois) ÷ taux de contribution', be.salesNeeded === 20000 && near(be.contribution, 0.6), be);
  ok('…ramené aux jours d’ouverture', near(be.perDay, 20000 / 26) && be.daysAreOpenDays === true);
  ok('…et le rythme du mois dit si on l’atteindra', be.projection === 20800 && be.gap === 800, be);
  const civil = E.breakEven(doc, { recent, month: '2026-10', monthLabour: null, openDays: null, elapsed: 12, mtdSales: 3000 });
  ok('sans horaires : les jours civils, et on le dit', civil.days === 31 && civil.daysAreOpenDays === false);
  ok('marge inconnue : pas de seuil', E.breakEven(doc, { recent: { margin: null, tooFew: true, salesTTC: 1000, commissions: { total: 0 } }, month: '2026-10' }).reason === 'too-few');
  ok('aucune charge : pas de seuil à atteindre', E.breakEven({ lines: [] }, { recent, month: '2026-10' }).reason === 'no-costs');
  ok('une contribution négative ne donne pas un seuil négatif', E.breakEven(doc, { recent: { margin: 100, commissions: { total: 200 }, salesTTC: 1000 }, month: '2026-10' }).reason === 'negative');
}

/* ── 7. Le document : bornes, fusion, édition datée ──────────────────────── */
{
  const d = E.normalize({ lines: [
    { id: 'a', label: 'Loyer', versions: [{ from: '2026-01', amount: 9000 }, { from: '2026-13', amount: 1 }, { from: '2026-02', amount: -5 }] },
    { id: 'b', versions: [{ from: '2026-01', amount: 1e12 }] },
    { label: 'sans id', versions: [{ from: '2026-01', amount: 10 }] },
  ], social: { rate: 300 }, commissions: { methods: { CARD: 2, tap: -1 }, channels: { glovo: '25' } } });
  ok('un mois impossible, un montant négatif ou absurde sont écartés, pas corrigés', d.lines.length === 1 && d.lines[0].versions.length === 1 && d.lines[0].versions[0].amount === 9000, d.lines);
  ok('un taux hors bornes est écarté', d.social.rate === null && d.commissions.methods.card === 2 && !('tap' in d.commissions.methods) && d.commissions.channels.glovo === 25, d);
  const merged = E.merge({ lines: [line('a', 100, { updatedAt: 5 }), line('b', 200, { updatedAt: 1 })], updatedAt: 5 },
    { lines: [line('a', 999, { updatedAt: 9 }), line('c', 300, { updatedAt: 2 })], updatedAt: 3, social: { rate: 22 } });
  const byId = Object.fromEntries(merged.lines.map((l) => [l.id, l.versions[0].amount]));
  ok('deux appareils : chaque ligne garde sa version la plus récente, aucune ne disparaît', byId.a === 999 && byId.b === 200 && byId.c === 300, byId);
  const gone = E.merge({ lines: [E.remove(line('a', 100), 20)], updatedAt: 20 }, { lines: [line('a', 100, { updatedAt: 9 })], updatedAt: 9 });
  ok('une ligne supprimée sur un appareil ne revient pas de l’autre', gone.lines.length === 1 && gone.lines[0].deleted === true && E.monthlyTotal(gone, '2026-10') === 0, gone.lines);
  ok('…et ne compte plus comme une charge saisie', E.result(gone, { days: [] }).configured === false);
  const raised = E.setAmount(line('a', 9000), 9900, '2026-10');
  ok('modifier « à partir d’octobre » garde l’ancien montant avant', E.monthlyOf(raised, '2026-09') === 9000 && E.monthlyOf(raised, '2026-10') === 9900);
  ok('arrêter en octobre : septembre compte encore, octobre plus', (() => { const s = E.stop(line('a', 9000), '2026-10'); return s.until === '2026-09' && E.monthlyOf(s, '2026-09') === 9000 && E.monthlyOf(s, '2026-10') === 0; })());
  ok('arrêter une charge qui n’a jamais pesé : elle disparaît', E.stop(line('a', 9000, { versions: [{ from: '2026-10', amount: 9000 }] }), '2026-10') === null);
  ok('le passage d’une année se compte juste', E.stop(line('a', 9000), '2026-01') === null && E.stop(line('a', 9000, { versions: [{ from: '2025-06', amount: 1 }] }), '2026-01').until === '2025-12');
}

/* ── 8. Le registre de KiwiCost porte les ventes gardées ─────────────────── */
{
  const cctx = vm.createContext({ console, Date, Math, JSON, Number, String, Array, Object, Map, Set });
  cctx.window = cctx;
  const C = loadCost(cctx, {});
  const L = C.ledger([
    { id: 's1', ts: 10, amount: 100, method: 'card', channel: '' },
    { id: 's1', ts: 10, amount: 100, method: 'card', channel: '' },
    { id: 's2', ts: 11, amount: 50, method: 'cash', channel: 'glovo' },
    { id: 's3', ts: 12, amount: 80, method: 'card', voided: true },
    { id: 's4', ts: 13, amount: 60, method: 'split', paymentParts: [{ method: 'card', amountCents: 2000 }, { method: 'cash', amountCents: 4000 }] },
  ], {});
  ok('le registre rend les ventes gardées : ni doublon, ni annulée', L.sales.length === 3 && L.sales.map((s) => s.id).join() === 's1,s2,s4', L.sales);
  ok('…avec moyen, canal et parts', L.sales[1].channel === 'glovo' && L.sales[2].parts.length === 2 && L.sales[0].method === 'card');
  const fee = E.commissionsFor({ commissions: { methods: { card: 2 }, channels: { glovo: 20 } } }, L.sales);
  ok('une vente reçue deux fois ne paie pas sa commission deux fois', near(fee.total, 2 + 10 + 0.4), fee);
}

/* ── 9. La page Marges d'un vrai commerçant ──────────────────────────────
 * finance.js, cost.js, charges-engine.js et charges.js, les vrais, dans un
 * bac à sable : la page dit-elle le résultat net que le calcul donne ? */
function renderMarges(o) {
  const noop = () => {};
  const root = { innerHTML: '' };
  const el = () => ({ classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop,
    removeAttribute: noop, appendChild: noop, addEventListener: noop, querySelector: () => null,
    querySelectorAll: () => [], innerHTML: '', textContent: '', style: {}, dataset: {} });
  const pad = (x) => String(x).padStart(2, '0');
  const t = new Date(Date.now() - 5 * 3600e3);
  const iso = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  const document = { readyState: 'complete', body: el(), documentElement: el(), head: el(),
    addEventListener: noop, createElement: el, getElementById: () => null,
    querySelector: (q) => (q === '[data-finance-root]' ? root : null), querySelectorAll: () => [] };
  const fctx = vm.createContext({ document, console, setTimeout, clearTimeout, Date, Math, JSON, Number, String, Array, Object, Map, Set, Intl,
    localStorage: { getItem: () => null, setItem: noop } });
  const win = fctx;
  win.window = win;
  Object.assign(win, {
    Kiwi: { handlers: {}, toast: noop, setActivePage: noop, pageShell: noop, modal: noop, drawer: noop },
    KiwiVenue: { getVenue: () => 'v-test', getVenueData: () => ({ name: 'Boulangerie El Menzah' }), isCustom: () => true, subscribe: noop },
    KiwiEnv: { isReal: () => true, demosAllowed: false },
    KiwiI18n: { getLang: () => 'fr' },
    KiwiMenuStore: { items: () => o.menu },
    KiwiSales: { list: () => o.sales },
    KiwiDateRange: {
      bounds: (p) => [Date.now() - (p === 'trenteJours' ? 30 : p === 'septJours' ? 7 : 1) * 864e5, Date.now() + 1],
      selectedBusinessDay: () => iso,
    },
    KiwiDayReport: { dayBounds: (d) => ({ from: new Date(`${d}T05:00:00`).getTime(), to: new Date(`${d}T05:00:00`).getTime() + 864e5 }) },
    KiwiTeam: { labour: o.labour || (() => null) },
    addEventListener: noop, scrollTo: noop,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'charges-engine.js'), 'utf8'), fctx, { filename: 'charges-engine.js' });
  loadCost(fctx, { costs: o.costs });
  if (o.charges) win.KiwiStore.define('charges', { blank: () => ({}) }).set(o.charges);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'charges.js'), 'utf8'), fctx, { filename: 'charges.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'finance.js'), 'utf8'), fctx, { filename: 'finance.js' });
  win.KiwiFinance.render();
  return { html: root.innerHTML, text: root.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), win, iso };
}
{
  const now = Date.now();
  const menu = [{ id: 'p1', name: 'Pain', price: 5 }, { id: 'p2', name: 'Msemen', price: 10 }];
  const sales = [0, 1, 2].map((i) => ({ id: `s${i}`, ts: now - (i + 1) * 3600e3, amount: 5, method: 'card', lines: [{ itemId: 'p1', name: 'Pain', qty: 1, unitPrice: 5, total: 5 }] }));
  const costs = { items: { p1: { cost: 2, at: 1 } }, ingredients: [], recipes: {}, charges: [], targets: {} };
  const charges = { v: 1, lines: [{ id: 'rent', label: 'Loyer', cat: 'rent', freq: 'month', versions: [{ from: '2025-01', amount: 3100 }], until: null }],
    social: { rate: 20 }, commissions: { methods: { card: 2 }, channels: {} } };
  const labour = (days) => ({ baseDue: 100 * days.length, variablePay: 0, baseMass: 3000, salaried: 1, rated: 0, members: 1 });
  const r = renderMarges({ menu, sales, costs, charges, labour });
  const days = E.days.lastDays(r.iso, 7);
  const fixed = E.fixedFor(charges, days).total;
  const expected = Math.round((9 - 0.3 - 700 * 1.2 - fixed) * 100) / 100;
  const shown = +((/data-net="(-?[\d.]+)"/.exec(r.html) || [])[1]);
  ok('la page Marges dit le résultat de la période, pas seulement le résultat matière', /Résultat de la période/.test(r.text) && /= Résultat net/.test(r.text), r.text.slice(0, 300));
  ok('…chaque retenue à sa ligne : commissions, personnel, charges fixes des 7 jours',
    /− Commissions 0,30 MAD/.test(r.text) && /− Personnel 840 MAD/.test(r.text) && /− Charges fixes · 7 jours/.test(r.text), r.text.slice(0, 600));
  ok('…et le résultat net affiché est celui du calcul, au centime', near(shown, expected, 0.001), { shown, expected });
  ok('la carte Charges fixes dit ce qu’il faut couvrir chaque mois', /data-charges-card/.test(r.html) && /À couvrir chaque mois 6 700 MAD/.test(r.text.replace(/ | /g, ' ')), r.text.slice(-900));
  const need = +((/data-need="([\d.]+)"/.exec(r.html) || [])[1]);
  ok('le seuil de rentabilité = (3 100 + 3 000 × 1,2) ÷ (8,70 ÷ 15)', near(need, 6700 / (8.7 / 15), 0.01), need);
  ok('une vraie page Marges n’a plus « Kiwi ne les connaît pas »', !/ne les connaît pas/.test(r.text));

  const blank = renderMarges({ menu, sales, costs });
  ok('rien de saisi : la page invite à renseigner les charges, sans chiffre inventé',
    /data-action="charges-open"/.test(blank.html) && !/Résultat net|data-charges-breakeven|data-net=/.test(blank.html) && /Résultat matière/.test(blank.text), blank.text.slice(0, 400));
  ok('…et le gestionnaire du bouton existe', typeof blank.win.Kiwi.handlers['charges-open'] === 'function');

  const half = renderMarges({ menu, costs, charges, labour,
    sales: sales.concat([{ id: 'm1', ts: now - 3600e3, amount: 20, method: 'cash', lines: [{ itemId: 'p2', name: 'Msemen', qty: 2, unitPrice: 10, total: 20 }] }]) });
  ok('moins de la moitié chiffrée : charges listées, résultat net « · », et pourquoi', /= Résultat net · /.test(half.text) && !/data-net=/.test(half.html)
    && /seules 42[.,]9\s?% des ventes ont un coût/.test(half.text), half.text.slice(0, 900));
}

console.log(`\n${fails ? '\x1b[31m✗' : '\x1b[32m✓'} charges : ${n - fails}/${n}\x1b[0m`);
process.exit(fails ? 1 : 0);
