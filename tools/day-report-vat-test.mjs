#!/usr/bin/env node
// @ts-check
/* La TVA par taux sur le rapport journalier et le Z.
 *
 * Avant : le Z donnait un seul total TTC. Un comptable ne peut pas passer la
 * journée en écriture sans le HT, la TVA et le TTC de chaque taux. Ce test
 * exécute le vrai calcul (functions/api/_rules-day-vat.js, la même règle que
 * celle copiée dans assets/z-reconciliation.js), puis le vrai rapport
 * (day-report.js build / services reportés), l'écran, le CSV, le tableau de
 * l'export PDF et les deux encodeurs du ticket Z. Centimes entiers partout. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { dayVat, mergeDayVat } from '../functions/api/_rules-day-vat.js';

let passed = 0;
const ok = (cond, label) => { assert.ok(cond, label); passed += 1; console.log('  ✓ ' + label); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const byRate = (v, rate) => v.rows.find((r) => r.rate === rate);

/* ── la règle ── */
const one = dayVat([{ amount: 120, lines: null }], { defaultRate: 20 });
ok(byRate(one, 20).htC === 10000 && byRate(one, 20).vatC === 2000 && byRate(one, 20).ttcC === 12000, '120 MAD à 20 % : HT 100, TVA 20, TTC 120');

const mixed = dayVat([{ amount: 120, lines: [{ total: 60, rate: 10 }, { total: 60, rate: 20 }] }], { defaultRate: null });
ok(mixed.rows.length === 2 && byRate(mixed, 10).ttcC === 6000 && byRate(mixed, 20).ttcC === 6000, 'un ticket à deux taux se répartit par ligne');
ok(byRate(mixed, 10).htC === 5455 && byRate(mixed, 10).vatC === 545, '60 MAD à 10 % : HT 54,55, TVA 5,45 (arrondi au centime)');

const disc = dayVat([{ amount: 108, lines: [{ total: 60, rate: 10 }, { total: 60, rate: 20 }] }], {});
ok(disc.totals.ttcC === 10800, 'une remise ticket réduit chaque ligne au prorata, sans centime perdu');

const noRate = dayVat([{ amount: 50, lines: [{ total: 50 }] }, { amount: 30, lines: null }], { defaultRate: null });
ok(noRate.rows.length === 1 && noRate.rows[0].rate === null && noRate.rows[0].ttcC === 8000, 'sans taux ni défaut : « taux non renseigné », rien n’est deviné');
ok(noRate.rows[0].htC === null && noRate.rows[0].vatC === null && noRate.totals.vatC === 0 && noRate.totals.unknownC === 8000, 'le HT et la TVA inconnus restent absents des totaux');

const dflt = dayVat([{ amount: 100, lines: [{ total: 40, rate: 7 }, { total: 60 }] }], { defaultRate: 20 });
ok(byRate(dflt, 7).ttcC === 4000 && byRate(dflt, 20).ttcC === 6000, 'une ligne sans taux prend le taux par défaut du commerçant');

const exempt = dayVat([{ amount: 40, lines: [{ total: 40, rate: 0 }] }], { defaultRate: 20 });
ok(byRate(exempt, 0).htC === 4000 && byRate(exempt, 0).vatC === 0, 'un taux 0 % est un taux (exonéré), pas un taux inconnu');

const refund = dayVat([{ amount: 100 }, { amount: -100, kind: 'refund' }, { amount: 100, kind: 'refund' }], { defaultRate: 20 });
ok(byRate(refund, 20).ttcC === -10000 && byRate(refund, 20).htC === -8333 && byRate(refund, 20).vatC === -1667, 'un remboursement se déduit, qu’il soit signé ou marqué refund');
const mirror = dayVat([{ amount: 100 }, { amount: -100 }], { defaultRate: 20 });
ok(byRate(mirror, 20).ttcC === 0 && byRate(mirror, 20).htC === 0 && byRate(mirror, 20).vatC === 0, 'un remboursement égal annule la vente au centime');

const excl = dayVat([{ amount: 100 }], { defaultRate: 20, included: false });
ok(excl.rows[0].htC === 10000 && excl.rows[0].vatC === 2000 && excl.rows[0].ttcC === 12000 && excl.included === false, 'prix hors taxe : la TVA s’ajoute au HT, comme sur le ticket');

/* propriété : HT + TVA = TTC par taux, et rien ne se perd, sur des tickets pseudo-aléatoires */
let seed = 20261028;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const RATES = [0, 7, 10, 14, 20, 5.5];
let sound = true, conserved = true, mergeSound = true;
for (let n = 0; n < 300; n++) {
  const rows = [];
  for (let i = 0; i < 1 + Math.floor(rnd() * 6); i++) {
    const lines = Array.from({ length: Math.floor(rnd() * 4) }, () => ({ total: Math.round(rnd() * 9000) / 100 + 0.01, rate: rnd() < 0.3 ? undefined : RATES[Math.floor(rnd() * RATES.length)] }));
    const gross = lines.reduce((s, l) => s + l.total, 0);
    const amount = lines.length ? Math.round(gross * (0.7 + rnd() * 0.3) * 100) / 100 : Math.round(rnd() * 20000) / 100;
    rows.push({ amount: rnd() < 0.15 ? -amount : amount, kind: rnd() < 0.1 ? 'refund' : '', lines: lines.length ? lines : null });
  }
  const opts = { defaultRate: rnd() < 0.2 ? null : RATES[Math.floor(rnd() * RATES.length)] };
  const v = dayVat(rows, opts);
  for (const r of v.rows) if (r.rate != null && r.htC + r.vatC !== r.ttcC) sound = false;
  const expected = rows.reduce((s, r) => s + (r.kind === 'refund' || r.amount < 0 ? -1 : 1) * Math.abs(Math.round(r.amount * 100)), 0);
  if (v.totals.allC !== expected) conserved = false;
  const cut = Math.floor(rows.length / 2);
  const m = mergeDayVat(dayVat(rows.slice(0, cut), opts), dayVat(rows.slice(cut), opts));
  if (m && JSON.stringify(m.rows) !== JSON.stringify(v.rows)) mergeSound = false;
}
ok(sound, 'propriété : HT + TVA = TTC pour chaque taux (300 journées)');
ok(conserved, 'propriété : la somme des taux est exactement la somme des ventes signées');
ok(mergeSound, 'propriété : deux services fusionnés = la journée calculée d’un bloc');

/* ── le vrai rapport (day-report.js) ── */
const memory = new Map();
const storage = { getItem: (k) => memory.get(k) || null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
const node = () => ({ dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
const document = { head: node(), body: node(), documentElement: node(), readyState: 'loading', addEventListener() {}, createElement: node, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } };
const makeCtx = (vatCfg) => {
  const win = { localStorage: storage, KiwiEnv: { isReal: () => true }, addEventListener() {}, KiwiI18n: { getLang: () => 'fr' },
    KiwiReceipt: { config: () => ({ vat: vatCfg }) },
    KiwiVenue: { isCustom: () => true, getCurrentVenue: () => 'qa-vat', getCurrentVenueData: () => ({ slug: 'qa-vat', name: 'QA' }) } };
  const c = { console, Date, Intl, localStorage: storage, setTimeout() {}, document, window: win };
  vm.createContext(c);
  vm.runInContext(read('assets/day-report.js'), c);
  vm.runInContext(read('assets/z-reconciliation.js'), c);   /* le module TVA voyage avec lui : voir son en-tête */
  return c;
};
const ctx = makeCtx({ mode: 'rate', rate: 10, included: true });
const R = ctx.window.KiwiDayReport, V = ctx.window.KiwiDayReportVat;
ok(R && V && typeof V.compute === 'function', 'le rapport et le module TVA se chargent');

const day = '2026-09-10';
const ts = (h) => Date.parse('2026-09-10T' + h + ':00Z');
const store = { slug: 'qa-vat', name: 'QA' };
const sales = [
  { id: 'a', amount: 120, ts: ts('14:05'), method: 'cash', lines: [{ n: 'Sac', q: 1, t: 60, taxRate: 20 }, { n: 'Café', q: 2, t: 60 }] },
  { id: 'b', amount: 55, ts: ts('14:20'), method: 'card' },
  { id: 'r1', amount: -11, ts: ts('14:40'), method: 'cash', kind: 'refund' },
];
const report = R.build({ day, store, sales, session: { sessionId: 's1', openedAt: ts('14:00'), closedAt: ts('15:00'), openingFloat: 0 } });
ok(report.vat && report.vat.rows.length === 2, 'build() écrit la ventilation TVA dans le Z');
const r20 = report.vat.rows.find((x) => x.rate === 20), r10 = report.vat.rows.find((x) => x.rate === 10);
ok(r20.ttcC === 6000 && r20.htC === 5000 && r20.vatC === 1000, 'la ligne qui porte un taux de 20 % le garde (HT 50, TVA 10)');
ok(r10.ttcC === 6000 + 5500 - 1100 && r10.htC + r10.vatC === r10.ttcC, 'les lignes sans taux prennent les 10 % du commerçant, remboursement déduit');
ok(report.vat.totals.ttcC === Math.round(report.net * 100), 'la somme TTC des taux est le net du rapport, au centime');
ok(report.vat.totals.unknownC === 0, 'rien n’est resté sans taux');

const bare = makeCtx({ mode: 'none', rate: 20, included: true });
const bareReport = bare.window.KiwiDayReport.build({ day, store, sales, session: {} });
ok(bareReport.vat.rows.some((x) => x.rate == null) && bareReport.vat.totals.unknownC > 0, 'sans taux par défaut, les ventes sans taux restent « non renseigné »');
ok(bareReport.vat.rows.some((x) => x.rate === 20) && bareReport.vat.rows.filter((x) => x.rate != null).length === 1, 'la ligne qui porte son taux est tout de même ventilée');

/* deux services le même jour : la TVA s'additionne par taux */
const first = R.build({ day, store, sales: sales.slice(0, 1), session: { sessionId: 'svc1', openedAt: ts('14:00'), closedAt: ts('14:10') } });
const second = R.build({ day, store, sales: sales.slice(1), session: { sessionId: 'svc2', openedAt: ts('14:15'), closedAt: ts('15:00') } });
R.save(first, { by: 'A' });
const saved = R.save(second, { by: 'B' });
const stored = R.load(day, store.slug);
const both = (saved && saved.vat) || (stored && stored.vat);
ok(both && both.totals.ttcC === report.vat.totals.ttcC && both.totals.vatC === report.vat.totals.vatC, 'deux services de la même journée : la TVA du Z est celle de la journée entière');

/* ── l'écran, le CSV, le tableau PDF, le ticket ── */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ui = (lang) => ({ LANG: () => lang, esc, money: (n) => n.toFixed(2), CUR: () => 'MAD', row: (l, v, m) => '<div class="r ' + (m || '') + '">' + esc(l) + ' | ' + esc(v) + '</div>' });
const WORDS = { fr: ['TVA par taux', 'HT', 'Total', '20 %'], en: ['VAT by rate', 'Excl. VAT', 'Total', '20 %'], ar: ['الضريبة حسب النسبة', 'خارج الضريبة', 'المجموع', '20 %'] };
for (const lang of ['fr', 'en', 'ar']) {
  const html = V.html(report, ui(lang));
  ok(WORDS[lang].every((w) => html.includes(w)), `[${lang}] l’écran écrit le titre, le HT, le total et chaque taux`);
  ok(html.includes('data-kdr-vat') && !/—/.test(html), `[${lang}] le bloc est repérable, sans tiret cadratin`);
}
ok(V.html(bareReport, ui('fr')).includes('Taux non renseigné') && V.html(bareReport, ui('fr')).includes('ne devine pas') === false && /devine/.test(V.html(bareReport, ui('fr'))), 'l’écran signale les ventes sans taux et dit pourquoi');
ok(V.html({ txns: 3 }, ui('fr')).includes('non enregistrée'), 'un ancien Z sans ventilation le dit au lieu de se taire');
ok(V.html({ txns: 0 }, ui('fr')) === '' && V.html({ txns: 3, historical: true }, ui('fr')) === '', 'une journée vide ou un total d’archive ne montre rien');

const csv = V.csvRows(report.vat, 'fr');
ok(csv[0][0] === 'TVA par taux' && csv[1].join('|') === 'Taux|HT|TVA|TTC' && csv[csv.length - 1][0] === 'Total', 'le CSV : titre, colonnes Taux/HT/TVA/TTC, ligne Total');
ok(csv.some((x) => x[0] === '20 %' && x[1] === '50.00' && x[2] === '10.00' && x[3] === '60.00'), 'le CSV porte les montants en format machine');
const table = V.tableRows(report.vat, 'en');
ok(table.headers.join('|') === 'Rate|Excl. VAT|VAT|Incl. VAT' && table.rows.length === 3, 'le tableau de l’export PDF suit la langue');

/* l'export détaillé et l'écran câblent le module */
const exportSrc = read('assets/day-report-export.js');
ok(/chosen\.summary&&window\.KiwiDayReportVat/.test(exportSrc) && /csvRows\(report\.vat/.test(exportSrc) && /tableRows\(report\.vat/.test(exportSrc), 'l’export détaillé (CSV et PDF) inclut la TVA dans la synthèse');
const dashSrc = read('assets/day-report-dash.js');
ok(/KiwiDayReportVat\.html\(r,/.test(dashSrc) && /KiwiDayReportVat\.csvRows\(r\.vat/.test(dashSrc), 'l’écran et le CSV simple du tableau de bord affichent la TVA');

/* les deux encodeurs du ticket Z impriment le même bloc */
const printCtx = { window: { KiwiDayReportVat: V }, Uint8Array, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), document: {} };
vm.runInNewContext(read('assets/escpos.js'), printCtx);
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);
const zText = Buffer.from(printCtx.window.KiwiEscPos.dayReport({ paper: '80', shop: 'QA', title: 'Z', fmt, methodLabels: {}, report })).toString('latin1');
ok(/TVA PAR TAUX/.test(zText) && /TVA 20 %\s+10\.00 MAD/.test(zText) && /TVA 10 %\s+/.test(zText) && /Total TVA/.test(zText), 'le ticket Z thermique imprime la TVA par taux');
const zLines = V.ticketBlock(report.vat, 'fr', (n) => fmt(n) + ' MAD');
ok(zLines.lines.length === report.vat.rows.length * 2 + 1, 'le bloc du ticket : deux lignes par taux et le total');
const bridgeSrc = read('assets/printer-bridge.js');
ok(/ticketBlock\(r\.vat, o\.lang, money\)/.test(bridgeSrc), 'le ticket du pilote système imprime le même bloc');
const noVat = Buffer.from(printCtx.window.KiwiEscPos.dayReport({ paper: '80', shop: 'QA', title: 'Z', fmt, methodLabels: {}, report: Object.assign({}, report, { vat: null }) })).toString('latin1');
ok(!/TVA PAR TAUX/.test(noVat), 'un Z sans ventilation s’imprime comme avant');

/* le module TVA est chargé partout où le rapport se construit : il voyage dans z-reconciliation.js (la caisse n'a plus de balise script à perdre) */
const shells = ['kiwi-caisse.html', 'assets/pages/dashboard-startup.js', 'kiwi-sw.js'];
ok(shells.every((f) => /z-reconciliation\.js\?v=\d+/.test(read(f))), 'la caisse, le tableau de bord et le cache hors ligne chargent z-reconciliation.js, donc le module TVA');

console.log(`\nday-report-vat: ${passed} contrôles`);
