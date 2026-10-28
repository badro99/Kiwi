#!/usr/bin/env node
/* Kiwi · console-untranslated-test · the operator console leaves no French in
 * English or Arabic.
 *
 * Thirteenth blind rating (28 October), i18n#1 and console#0: admin-workspace.js
 * translates by looking up each French fragment in its copy table; a fragment
 * with no row stayed French in EN and AR and nothing said so. text() now
 * remembers every miss, and this suite renders every page, every dossier tab,
 * the task form and every loading and failure notice in EN and AR, with
 * merchants of every trade and every account state, then requires the list of
 * misses to be empty. A new French string without its row fails here, by name.
 *   node tools/console-untranslated-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../assets/admin-workspace.js', import.meta.url), 'utf8');
const policy = require('../assets/admin-policy.js');
const SOURCES = ['quarantine', 'bridges', 'print', 'errors', 'support', 'integrations', 'caisseSync', 'shopify', 'shopifyLink', 'receivables', 'unpaidTables', 'zChecks', 'conflicts', 'tenantGuard', 'discountPolicy', 'saleFlags', 'activity', 'board', 'tasks', 'notes', 'events'];
const DAY = 864e5;

function boot(lang) {
  const elements = new Map();
  const element = () => ({ innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, style: {}, contains: () => false, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, removeAttribute() {}, addEventListener() {}, getClientRects: () => [] });
  const dialogs = [];
  const document = {
    documentElement: { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' },
    body: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, appendChild(el) { dialogs.push(el); } },
    activeElement: null,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement() { return { innerHTML: '', setAttribute() {}, querySelector(sel) { return sel === '[name="outcome"]' ? null : {}; }, querySelectorAll: () => [], addEventListener() {}, showModal() {} }; },
  };
  const window = { KiwiAdminPolicy: policy, KiwiOperator: { close() {}, snapshot: () => ({}) }, KiwiAdminI18n: { lang } };
  const context = vm.createContext({ window, document, Intl, Date, URLSearchParams, CSS: { escape: String }, crypto: { randomUUID: () => 'test-id' }, location: { search: '', hash: '' }, localStorage: { getItem: () => null } });
  vm.runInContext(source.slice(0, source.indexOf("  document.addEventListener('click'"))
    + ';window.test={state,copy,missed,L,text,notice,today,fleet,revenue,onboarding,dossierView,taskDialog,render,policyText,ago,date,tabs,routes};})();', context);
  return { t: window.test, elements, dialogs };
}

function fixtures(now) {
  const kinds = ['hotel', 'restaurant', 'boutique', 'pressing', 'epicerie', 'maison', 'cafe'];
  const statuses = ['active', 'pending', 'suspended', 'trial', 'expired'];
  return kinds.map((type, i) => ({
    merchant: 'm' + i, business: 'Établissement ' + i, type, city: 'Rabat', plan: ['basic', 'plus', 'pro', 'ultra'][i % 4],
    store_status: statuses[i % statuses.length], last_ts: i % 2 ? now - 3 * DAY : now - 60000, today_amount: i * 10,
    created_ts: now - (i + 1) * 9 * DAY, trial_ends: now + (i - 3) * DAY, paid_until: now + (i - 2) * 5 * DAY, price: i % 3 ? 300 : 0,
  }));
}

function data(now, rows = {}) {
  return { now, actor: { id: 'op' }, sources: Object.fromEntries(SOURCES.map((k) => [k, { available: true, rows: rows[k] || [] }])) };
}

const failures = [];
for (const lang of ['en', 'ar']) {
  const { t, dialogs, elements } = boot(lang);
  const now = Date.now();
  t.state.clients = fixtures(now);
  t.state.now = now;
  const views = [];
  const look = (label, run) => { try { views.push([label, String(run() ?? '')]); } catch (e) { failures.push(`${lang} · ${label} threw: ${e.message}`); } };

  // Notices: demo, loading, failed read, missing and truncated sources.
  t.state.live = false; look('notice demo', t.notice);
  t.state.live = true; t.state.data = null; t.state.loading = true; look('notice loading', t.notice);
  t.state.loading = false; t.state.loadError = { code: 'http-503' }; look('notice failed', t.notice);
  t.state.loadError = null;
  const partial = data(now); partial.sources.print = { available: false, failure: { code: 'd1-timeout' } }; partial.sources.errors = { available: true, rows: [], truncated: true };
  t.state.data = partial; look('notice partial', t.notice);

  // Every page with live, empty sources, then with a few rows of each kind.
  for (const rows of [{}, {
    tasks: [{ id: 't1', merchant: 'm1', title: 'Rappeler', status: 'open', version: 1, due_ts: now - DAY }, { id: 't2', merchant: 'm2', title: 'Former', status: 'snoozed', version: 1 }],
    notes: [{ id: 'n1', merchant: 'm1', body: 'note', created_ts: now - 5000 }],
    errors: [{ merchant: 'm1', message: 'boom', ts: now - 3600e3, count: 3 }],
    bridges: [{ merchant: 'm0', last_seen: now - 2 * DAY, version: '1.3.0' }],
    print: [{ merchant: 'm0', status: 'failed', ts: now - 3600e3 }],
    saleFlags: [{ merchant: 'm1', id: 'f1', action: 'basket-flag', note: 'basket-mismatch', amount_cents: 1200, sale_ts: now, updated_ts: now }],
  }]) {
    t.state.data = data(now, rows);
    for (const route of Object.keys(t.routes)) { t.state.route = route; t.state.merchant = ''; look('page ' + route, () => { t.render(); return t.routes[route].join(' '); }); }
    look('today', t.today);
    look('fleet all', () => t.fleet(''));
    look('revenue', t.revenue);
    look('onboarding', () => t.onboarding(''));
    for (const c of t.state.clients) {
      t.state.route = 'merchant'; t.state.merchant = c.merchant;
      for (const tab of Object.keys(t.tabs)) { t.state.tab = tab; look(`dossier ${c.type} ${tab}`, () => { t.dossierView(); return ''; }); }
      look('fleet ' + c.type, () => t.fleet(c.merchant));
      look('onboarding ' + c.type, () => t.onboarding(c.merchant));
    }
  }
  await t.taskDialog();
  await t.taskDialog({ id: 'task', version: 1, title: 'x', merchant: 'm1', status: 'in_progress' });
  look('relative times', () => [t.ago(0), t.ago(now - 5 * 60000), t.date(0)].join(' '));

  // Second net, for French that never went through the lookup at all: in the
  // English pages, any word carrying a French accent that is not fixture data.
  if (lang === 'en') {
    const html = views.map((v) => v[1]).concat([...elements.values()].map((e) => e.innerHTML + ' ' + e.textContent), dialogs.map((d) => d.innerHTML)).join(' ');
    const words = new Set((html.replace(/<[^>]*>/g, ' ').match(/[A-Za-zÀ-ÿ’']*[àâçéèêëîïôûùüÿœÉÈÀÇ][A-Za-zÀ-ÿ’']*/g) || []).filter((w) => !/^Établissement$/.test(w) && !/^[A-ZÀ-Ý]{1,2}$/.test(w)));
    if (words.size) failures.push('en · French words in the rendered pages: ' + [...words].join(', '));
  }
  const missed = Object.keys(t.missed);
  if (missed.length) failures.push(`${lang} · ${missed.length} French fragment(s) with no translation:\n      ` + missed.map((s) => JSON.stringify(s)).join('\n      '));
  else console.log(`  ✓ ${lang} · ${views.length} views and ${dialogs.length} dialogs rendered, no French fragment left untranslated`);
}

// The recorder itself: a made-up French fragment is caught, a known one is not.
{
  const { t } = boot('en');
  t.L('<p>Phrase française inventée pour le test</p><span>Suspendu</span>');
  assert.deepEqual(Object.keys(t.missed), ['Phrase française inventée pour le test']);
  const fr = boot('fr').t; fr.L('<p>Phrase française inventée pour le test</p>');
  assert.deepEqual(Object.keys(fr.missed), [], 'French needs no row');
  console.log('  ✓ the recorder names an unmapped fragment in EN and ignores French');
}

if (failures.length) { for (const f of failures) console.log('  ✗ ' + f); console.log(`\n✗ console-untranslated-test · ${failures.length} failure(s)`); process.exit(1); }
console.log('\n✓ console-untranslated-test');
