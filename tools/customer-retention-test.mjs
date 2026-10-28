#!/usr/bin/env node
import dashboardDependencies from './dashboard-dependencies.cjs';
/* Ticket #0165 · Customer retention: the rules the owner controls.
 *
 * Groups come from the owner's thresholds and the customer's own rhythm; an
 * offer has a cost, dates and limits; results count who came back after a
 * message. The server keeps the document owner-only and redacted for tills.
 *
 *   node tools/customer-retention-test.mjs
 */
import fs from 'node:fs';
import { shippedFunction } from './shipped-function.mjs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

const window = {
  Kiwi: { handlers: {} },
  KiwiStore: { define: () => ({ get: () => null, set() {}, cloud: () => null, subscribe() {} }) },
};
window.window = window;
const context = { window, document: {}, console, Date, Math, Number, String, JSON, Object, Array, encodeURIComponent };
vm.createContext(context);
vm.runInContext(read('assets/customer-retention.js'), context, { filename: 'customer-retention.js' });
const R = window.KiwiRetention;
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 9, 12);
const S = R.cleanSettings({ regularDays: 30, inactiveDays: 90, rhythmFactor: 1.5, marginPct: 60 });
const visitsEvery = (days, count, lastDaysAgo) => Array.from({ length: count }, (_, i) => ({ ts: NOW - (lastDaysAgo + i * days) * DAY, amount: 100 }));

ok('the page registers its sidebar handler', () => {
  assert.equal(typeof window.Kiwi.handlers['customer-retention'], 'function');
});
ok('a weekly customer seen 3 days ago is regular', () => {
  assert.equal(R.groupOf({ visits: 6, history: visitsEvery(7, 6, 3) }, S, NOW), 'regular');
});
ok('a weekly customer absent 15 days visits less often (rhythm × 1.5)', () => {
  assert.equal(R.rhythmDays({ history: visitsEvery(7, 6, 15) }, NOW), 7);
  assert.equal(R.groupOf({ visits: 6, history: visitsEvery(7, 6, 15) }, S, NOW), 'less');
});
ok('a monthly customer absent 20 days is still regular: their own rhythm, not a fixed rule', () => {
  assert.equal(R.groupOf({ visits: 4, history: visitsEvery(30, 4, 20) }, S, NOW), 'regular');
});
ok('anyone past the regular threshold visits less often', () => {
  assert.equal(R.groupOf({ visits: 1, history: visitsEvery(1, 1, 40) }, S, NOW), 'less');
});
ok('past the inactive threshold is inactive', () => {
  assert.equal(R.groupOf({ visits: 9, history: visitsEvery(7, 9, 120) }, S, NOW), 'inactive');
});
ok('a customer with no visit is in no group', () => {
  assert.equal(R.groupOf({ visits: 0, history: [] }, S, NOW), null);
});
ok('the owner moves the thresholds and the groups follow', () => {
  const strict = R.cleanSettings({ regularDays: 10, inactiveDays: 30, rhythmFactor: 1.5, marginPct: 60 });
  assert.equal(R.groupOf({ visits: 1, history: visitsEvery(1, 1, 20) }, strict, NOW), 'less');
  assert.equal(R.groupOf({ visits: 1, history: visitsEvery(1, 1, 40) }, strict, NOW), 'inactive');
});
ok('offer cost by kind', () => {
  assert.equal(R.offerCost({ type: 'percent', value: 10 }, 200), 20);
  assert.equal(R.offerCost({ type: 'fixed', value: 50 }, 30), 30);
  assert.equal(R.offerCost({ type: 'item', value: 12 }, 200), 12);
  assert.equal(R.offerCost({ type: 'none', value: 0 }, 200), 0);
});
ok('a suggestion never gives away more than a quarter of the margin', () => {
  assert.equal(R.suggestPercent('inactive', 60), 15);
  assert.equal(R.suggestPercent('less', 60), 10);
  assert.equal(R.suggestPercent('inactive', 20), 5);
});
ok('offers respect their dates', () => {
  assert.equal(R.offerActive({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-09'), true);
  assert.equal(R.offerActive({ from: '2026-10-10', to: '' }, '2026-10-09'), false);
  assert.equal(R.offerActive({ from: '', to: '2026-10-08' }, '2026-10-09'), false);
});
ok('settings and offers are clamped to sane values', () => {
  /* Un seul chiffre est réglable : les trois seuils en découlent, et aucune
     valeur aberrante venue d'un ancien document ne peut plus les tordre. */
  assert.deepEqual(JSON.parse(JSON.stringify(R.cleanSettings({ backEveryDays: -4, inactiveDays: 'x', rhythmFactor: 99, marginPct: 0, enabled: 'yes' }))),
    { enabled: false, backEveryDays: 1, regularDays: 1, inactiveDays: 3, rhythmFactor: 1.5, marginPct: 1 });
  const o = R.cleanOffer({ type: 'percent', value: 250, perClient: 0, from: 'soon' }, 'less');
  assert.equal(o.value, 100); assert.equal(o.perClient, 1); assert.equal(o.from, '');
  assert.equal(R.cleanOffer({ type: 'bogus' }, 'regular').type, 'none');
});
ok('results: a visit after the message counts as a return, with its revenue', () => {
  const sentAt = NOW - 10 * DAY;
  const c = { history: [{ ts: NOW - 2 * DAY, amount: 80 }, { ts: NOW - 5 * DAY, amount: 40 }, { ts: NOW - 30 * DAY, amount: 999 }] };
  assert.deepEqual(JSON.parse(JSON.stringify(R.outcome({ sentAt }, c))), { back: true, visits: 2, revenue: 120 });
  assert.equal(R.outcome({ sentAt }, { history: [{ ts: NOW - 30 * DAY, amount: 50 }] }).back, false);
});
ok('Moroccan local numbers become international for WhatsApp', () => {
  assert.equal(R.waPhone('0661 03 44 88'), '212661034488');
  assert.equal(R.waPhone('+33 6 12 34 56 78'), '33612345678');
  assert.equal(R.waPhone(''), '');
});

const store = read('functions/api/store.js');
ok('the server knows the retention document', () => {
  assert.match(store, /retention:\s*\{ keys: \['settings', 'offers', 'sends'\]/);
});
ok('paired tills cannot read the send log nor write the document', () => {
  assert.match(store, /function stripRetention\(\) \{ return \{ settings: null, offers: null, sends: \[\] \}; \}/);
  assert.match(store, /const REDACT = \{[^}]*retention: stripRetention/);
});
const dash = dashboardDependencies(read('dashboard.html'));
ok('the sidebar opens the page, sold with the CRM', () => {
  assert.match(dash, /data-action="customer-retention" data-feature="crm"/);
  assert.match(dash, /assets\/customer-retention\.js\?v=\d+/);
});
const src = read('assets/customer-retention.js');
ok('nothing is sent without the owner: WhatsApp opens only from the approve button, only with consent', () => {
  assert.match(src, /if \(x\.blocked \|\| !x\.c\.consent \|\| !phone\) return;/);
  assert.equal((src.match(/wa\.me/g) || []).length, 1);
});
ok('no italics and no em dash in user copy', () => {
  assert.doesNotMatch(src, /font-style:\s*italic/);
  assert.doesNotMatch(src, /—/);
});
ok('one visit does not make a regular: a recent first visit is its own group', () => {
  assert.equal(R.groupOf({ visits: 1, history: visitsEvery(1, 1, 0) }, S, NOW), 'new');
  assert.equal(R.groupOf({ visits: 2, history: visitsEvery(7, 2, 0) }, S, NOW), 'regular');
  // never an offer, never a suggestion for it: offers stay keyed to the three groups
  assert.match(src, /var GROUPS = \['regular', 'less', 'inactive'\];/);
  assert.match(src, /return r\.group === 'less' \|\| r\.group === 'inactive';/);
  assert.match(src, /group: \{ new: 'Première visite',/);
});
ok('no loyalty card on: the column says so instead of « 0 / 10 »', () => {
  const KC = { loyaltyOn: () => false };
  assert.equal(shippedFunction(src, 'loyaltyLabel', { window: { KiwiClients: KC }, KiwiClients: KC })({ stamps: 0 }), '·');
});
ok('the open page follows the shared customer book, never under the owner\'s hand', () => {
  assert.match(src, /KiwiClients\.pull\(function \(ch\) \{ if \(ch\) refreshClients\(\); \}\)/);
  assert.match(src, /offClients = KiwiClients\.subscribe\(function \(\) \{ refreshClients\(\); \}\)/);
  let paints = 0;
  const state = { tab: 'activity' }, document = { body: { contains: () => true }, activeElement: null };
  const refresh = shippedFunction(src, 'refreshClients', {
    root: { contains: () => true }, document, state, window: {}, data: [], rows: [], byId: {},
    buildRows: () => [], rerender: () => paints++, Date,
  });
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) { document.activeElement = { tagName }; refresh(); assert.equal(paints, 0); }
  document.activeElement = null; state.tab = 'groups'; refresh(); assert.equal(paints, 0);
  state.tab = 'activity'; refresh(); assert.equal(paints, 1);
});
ok('the margin that caps suggested discounts shows what Kiwi measured, without overwriting the owner\'s figure', () => {
  assert.match(src, /var cov = C\.coverage\(S\.list\(\), to - 30 \* DAY, to\);/);
  assert.match(src, /measuredMarginHtml\(\) \+ '<\/div>'/);
  assert.doesNotMatch(src, /marginPct\s*=\s*cov\./);
});
ok('a loyalty reward cannot be offered while the loyalty card is off', () => {
  assert.match(src, /var off = t === 'reward' && loyaltyOff && o\.type !== t;/);
  assert.match(src, /loyaltyOff: 'carte de fidélité désactivée'/);
});

/* ── UN SEUL CHIFFRE, PRÉ-REMPLI PAR LE MÉTIER ─────────────────────────────
 * Les trois seuils réglables partaient tous à trente jours, pour tout le monde.
 * On vient chercher son pain tous les trois jours et ses vêtements deux fois
 * l'an : à trente jours, la boulangerie n'avait jamais un client « qui vient
 * moins souvent » et la boutique les avait tous en « inactifs ». */
vm.runInContext(read('assets/trades.js'), context, { filename: 'trades.js' });
const trade = (id) => { window.KiwiVenue = { getCurrentVenueData: () => ({ subtype: id }) }; };

ok('le métier donne le rythme, et ce ne sont pas les mêmes', () => {
  const TR = window.KiwiTrades;
  assert.equal(TR.rhythm('bakery'), 3);
  assert.equal(TR.rhythm('cafe'), 7);
  assert.equal(TR.rhythm('restaurant'), 21);
  assert.equal(TR.rhythm('boutique'), 90);
  assert.equal(TR.rhythm('coiffure'), 35);
  assert.equal(TR.rhythm('hotel'), 180);
  // un métier inconnu ne casse rien : trente jours, comme avant
  assert.equal(TR.rhythm('rien-du-tout'), 30);
  // tous les métiers de la liste en ont un, et aucun n'est absurde
  for (const t of TR.LIST) assert.ok(t.rhythm >= 1 && t.rhythm <= 365, t.id);
});

ok('un établissement neuf part sur le rythme de SON métier', () => {
  trade('cafe');
  assert.equal(R.defaultSettings().backEveryDays, 7);
  trade('boutique');
  assert.equal(R.defaultSettings().backEveryDays, 90);
  // et sans métier connu, le repli de toujours
  window.KiwiVenue = null;
  assert.equal(R.defaultSettings().backEveryDays, 30);
});

ok('les trois groupes découlent du seul chiffre', () => {
  const s7 = R.cleanSettings({ backEveryDays: 7 });
  assert.equal(s7.regularDays, 7);
  assert.equal(s7.inactiveDays, 21);
  assert.equal(s7.rhythmFactor, 1.5);
  const s90 = R.cleanSettings({ backEveryDays: 90 });
  assert.equal(s90.inactiveDays, 270);
  // le plafond tient : 365 × 3 dépasserait 730
  assert.equal(R.cleanSettings({ backEveryDays: 365 }).inactiveDays, 730);
});

ok('le même client n’est pas classé pareil au café et à la boutique', () => {
  /* Vu il y a 40 jours, deux visites espacées de 40 jours (son propre rythme
     ne le trahit donc pas) : parti pour un café, régulier pour une boutique. */
  const c = { visits: 2, history: visitsEvery(40, 2, 40) };
  assert.equal(R.groupOf(c, R.cleanSettings({ backEveryDays: 7 }), NOW), 'inactive');
  assert.equal(R.groupOf(c, R.cleanSettings({ backEveryDays: 90 }), NOW), 'regular');
});

ok('un réglage déjà choisi ne bouge pas sous le commerçant', () => {
  /* Les documents d'avant portaient regularDays : il DEVIENT le rythme, donc
     « régulier » veut dire exactement la même chose qu'hier. */
  const migrated = R.cleanSettings({ enabled: true, regularDays: 45, inactiveDays: 120, rhythmFactor: 2, marginPct: 55 });
  assert.equal(migrated.backEveryDays, 45);
  assert.equal(migrated.regularDays, 45);
  assert.equal(migrated.enabled, true);
  assert.equal(migrated.marginPct, 55);
  // backEveryDays l'emporte dès qu'il existe
  assert.equal(R.cleanSettings({ backEveryDays: 12, regularDays: 45 }).backEveryDays, 12);
});

ok('l’écran ne propose plus qu’un champ, et dit ce qu’il veut dire', () => {
  const T = new Proxy({}, { get: (_, key) => key === 'derived' ? (n, i) => `Régulier ${n}, inactif ${i}` : ['th2', 'f', 'group'].includes(key) ? new Proxy({}, { get: (_, k) => String(k) }) : String(key) });
  const renderGroups = shippedFunction(src, 'groupsHtml', {
    doc: { settings: R.cleanSettings({ backEveryDays: 7 }), offers: {} },
    T, GROUPS: [], INACTIVE_FACTOR: 3, window: {}, tradeRhythm: () => 7,
    field: (label, value) => `<label>${label}${value}</label>`,
    input: (name, value) => `<input name="${name}" value="${value}">`,
    esc: String, measuredMarginHtml: () => '',
  });
  const renderedGroups = vm.runInNewContext('renderGroups()', { renderGroups });
  assert.match(renderedGroups, /<label>backEvery<input name="backEveryDays" value="7">/);
  assert.doesNotMatch(renderedGroups, /name="regularDays"/);
  assert.doesNotMatch(renderedGroups, /name="inactiveDays"/);
  assert.doesNotMatch(renderedGroups, /name="rhythmFactor"/);
  assert.match(renderedGroups, /data-cr-derived>Régulier 7, inactif 21/);
  // mis à jour pendant la frappe, sans repeindre la page sous le curseur
  assert.match(src, /getAttribute\('name'\) !== 'backEveryDays'\) return;/);
  assert.doesNotMatch(src, /\[data-cr-rhythm\][\s\S]{0,400}?persist\(/);
});

console.log(`\ncustomer-retention: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
