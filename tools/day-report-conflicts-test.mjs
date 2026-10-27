#!/usr/bin/env node
/* Deux appareils clôturent le même tiroir avec un comptage différent :
 * day-report.js (mergeDaySnapshots) garde une version et note l'autre dans
 * snapshotConflicts, mais le rapport du tableau de bord ne le disait pas : le
 * patron lisait le comptage retenu sans savoir qu'un autre existait.
 * Ce test fabrique la contradiction avec le vrai module, puis rend le bloc dans
 * les trois langues. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const ok = (cond, label) => { assert.ok(cond, label); passed += 1; console.log('  ✓ ' + label); };

const memory = new Map();
const storage = { getItem: (k) => memory.get(k) || null, setItem: (k, v) => memory.set(k, String(v)) };
const node = () => ({ dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; }, textContent: '', innerHTML: '' });
const document = { head: node(), body: node(), documentElement: node(), createElement: node, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } };
const ctx = { console, Date, Intl, localStorage: storage, setTimeout() {}, document,
  window: { localStorage: storage, KiwiEnv: { isReal: () => true }, addEventListener() {}, KiwiI18n: { getLang: () => 'fr' },
    KiwiVenue: { isCustom: () => true, getCurrentVenue: () => 'qa-conflict', getCurrentVenueData: () => ({ slug: 'qa-conflict', name: 'QA' }) } } };
vm.createContext(ctx);
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
vm.runInContext(read('assets/day-report.js'), ctx);
vm.runInContext(read('assets/day-report-conflicts.js'), ctx);
const R = ctx.window.KiwiDayReport, CF = ctx.window.KiwiDayReportConflicts;
ok(CF && typeof CF.html === 'function', 'le module de contradictions se charge');

const store = { slug: 'qa-conflict', name: 'QA' };
const day = '2026-09-10';
const ts = (h) => Date.parse('2026-09-10T' + h + ':00Z');
const closing = (counted, by) => R.build({ day, store, sales: [{ id: 'cloud-sale', amount: 85, ts: ts('14:05'), method: 'cash' }], session: {
  sessionId: 'same-session-key', terminalId: 'cloud-terminal', openedAt: ts('14:00'), closedAt: ts('14:10'), openingFloat: 500, countedCash: counted, closedBy: by } });
R.save(closing(585, 'Salma'), { by: 'Salma' });
const first = R.load(day, store.slug);
const other = closing(600, 'Youssef');
other.builtAt = Number(first.builtAt) + 200000;
const merged = R.mergeDaySnapshots(first, other);
ok(merged.snapshotConflicts.length === 1, 'la fusion note une contradiction');

/* ── le modèle : un seul côté est retenu, celui que le rapport affiche ── */
const [item] = CF.view(merged);
const keptSides = item.sides.filter((x) => x.kept);
ok(keptSides.length === 1, 'exactement une version est retenue');
const shown = R.drawerSessions(merged)[0].cash.counted;
ok(keptSides[0].side.counted === shown, `la version retenue est celle que le rapport affiche (${shown})`);
ok(item.sides.filter((x) => !x.kept)[0].side.counted !== shown, 'l\'autre version est marquée écartée');
ok(CF.view({}).length === 0 && CF.html({}, {}) === '', 'sans contradiction, le bloc ne rend rien');
ok(CF.html({ snapshotConflicts: [] }, {}) === '', 'une liste vide ne rend rien non plus');

/* ── le rendu, dans les trois langues ── */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ui = (lang) => ({ LANG: () => lang, esc, hm: (ms) => new Date(ms).toISOString().slice(11, 16), money: (n) => String(n), CUR: () => 'MAD',
  row: (l, v, mod) => '<div class="r ' + (mod || '') + '">' + esc(l) + ' ' + esc(v) + '</div>' });
const WORDS = { fr: ['Deux clôtures différentes', 'Retenue', 'Écartée', 'Attendu', 'Compté'], en: ['Two different closings', 'Kept', 'Set aside', 'Expected', 'Counted'], ar: ['إقفالان مختلفان', 'المعتمدة', 'المستبعدة', 'المتوقع', 'المعدود'] };
for (const lang of ['fr', 'en', 'ar']) {
  const html = CF.html(merged, ui(lang));
  ok(WORDS[lang].every((w) => html.includes(w)), `[${lang}] titre, retenue, écartée, attendu et compté sont écrits`);
  ok(html.includes('Salma') && html.includes('Youssef'), `[${lang}] les deux personnes qui ont clôturé sont nommées`);
  ok(html.includes('585') && html.includes('600'), `[${lang}] les deux comptages sont montrés`);
  ok(!/—/.test(html), `[${lang}] pas de tiret cadratin`);
}
ok(CF.html(merged, ui('fr')).includes('data-kdr-conflicts'), 'le bloc est repérable dans la page');

/* ── le câblage : le rapport passe la liste et affiche le bloc ── */
const dash = read('assets/day-report-dash.js');
ok(/built\.snapshotConflicts\s*=\s*snap\.snapshotConflicts/.test(dash), 'le rapport recalculé garde les contradictions de l\'instantané');
ok(/KiwiDayReportConflicts\.html\(r,/.test(dash), 'le rapport affiche le bloc sous le tiroir');
const startup = read('assets/pages/dashboard-startup.js');
ok(/day-report-conflicts\.js\?v=\d+/.test(startup) && startup.indexOf('day-report-conflicts.js') < startup.indexOf('day-report-dash.js'), 'le module se charge avant le rapport');
const sw = read('kiwi-sw.js');
ok(/\/assets\/day-report-conflicts\.js\?v=\d+/.test(sw), 'le module est dans le cache hors ligne');

console.log(`\nday-report-conflicts: ${passed} contrôles`);
