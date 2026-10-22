#!/usr/bin/env node
/* Coût simple · le calcul et l'onglet (assets/simple-food-cost.js + finance.js).
 *
 *   1. Le calcul : lot, rendement, emballages, portions, TVA incluse ⇒ % sur le
 *      HT, prix pour l'objectif ; un inconnu reste inconnu (jamais 0) ; unités
 *      incompatibles dites ; prix de plus de 90 jours signalés.
 *   2. L'onglet n'existe que si `simple_food_cost === true` sur un compte réel.
 *   3. États : chargement, liste, vide, 403, erreur, lecture seule, hors ligne,
 *      conflit (409) qui garde la saisie et dit qui a modifié.
 *   4. La saisie ne redessine que les chiffres (le champ garde le focus).
 *   5. Export CSV sans formule injectable ; aucune écriture de stock. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra != null ? '\n      ' + String(extra).slice(0, 500) : '')); }
};
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.005;
console.log('■ Coût simple · calcul et onglet (tools/simple-food-cost-test.mjs)');

/* ── un petit document : juste ce que le module touche ── */
const listeners = {};
const stub = (attrs = {}) => ({ innerHTML: '', attrs, getAttribute: (k) => attrs[k], children: {} });
const root = stub();
root.querySelector = (sel) => {
  const m = sel.match(/^\[data-sfc-linecost="(\d+)"\]$/);
  if (m) return (root.children['lc' + m[1]] ||= stub());
  if (sel === '[data-sfc-summary-host]') return (root.children.summary ||= stub());
  return null;
};
let mounted = false;
const document = {
  documentElement: { lang: 'fr' }, head: { appendChild() {} }, body: { appendChild() {} },
  getElementById: () => null, createElement: () => ({ click() {}, remove() {}, set href(v) {}, set download(v) {} }),
  querySelector: (sel) => (sel === '[data-sfc-root]' && mounted ? root : null),
  addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
};
const nav = { onLine: true };
/* localStorage partagé : c'est lui qui survit au « rechargement » simulé plus bas. */
const disk = new Map();
const makeStorage = () => ({ getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => { disk.set(k, String(v)); }, removeItem: (k) => { disk.delete(k); } });
disk.set('kiwiAccountKey', 'Owner@Resto.ma');
const calls = [];
let reply = () => ({ status: 200, body: { enabled: true, canEdit: true, sheets: [] } });
const fetch = async (url, opts) => {
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url, body });
  const r = reply(url, body);
  return { status: r.status, json: async () => r.body };
};
let confirmAnswer = true;
const win = {
  KiwiEnv: { isReal: () => true },
  KiwiConfig: { features: {} },
  KiwiI18n: { getLang: () => 'fr' },
  KiwiCloudDoc: { currentSlug: () => 'resto-test' },
  KiwiMenuStore: { items: () => [{ id: 'tajine', name: 'Tajine', price: 110 }] },
  KiwiReceipt: { config: () => ({ vat: { mode: 'rate', rate: 10, included: true } }) },
  KiwiDayReport: { today: () => '2026-10-11' },
  addEventListener: (t, fn) => { (listeners['w:' + t] ||= []).push(fn); },
  confirm: () => confirmAnswer,
};
win.window = win;
const ctx = vm.createContext({ window: win, document, navigator: nav, fetch, localStorage: makeStorage(), console, setTimeout: (fn) => fn(), clearTimeout() {}, Intl, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: class { constructor(p) { this.p = p; } } });
vm.runInContext(R('assets/restaurant-units.js'), ctx, { filename: 'restaurant-units.js' });
vm.runInContext(R('assets/simple-food-cost.js'), ctx, { filename: 'simple-food-cost.js' });
const F = win.KiwiSimpleFoodCost;
const conv = win.KiwiRestaurantUnits.convert;
const flush = () => new Promise((r) => setImmediate(r));

/* ── 1 · le calcul ── */
const base = {
  name: 'Tajine poulet', sellingPrice: 110, vatIncluded: true, vatRate: 10, portions: 4, targetPct: 30,
  lines: [
    { id: 'a', name: 'Poulet', type: 'food', packPrice: 60, packQty: 1, packUnit: 'kg', useQty: 800, useUnit: 'g', yieldPct: 80, priceDate: '2026-10-01' },
    { id: 'b', name: 'Barquette', type: 'packaging', packPrice: 50, packQty: 100, packUnit: 'unité', useQty: 4, useUnit: 'unité', yieldPct: 100, priceDate: '2026-09-01' },
  ],
};
let c = F.compute(base, { convert: conv, today: '2026-10-11' });
ok(near(c.lines[0].cost, 60) && near(c.lines[1].cost, 2), 'ligne : 60 MAD/kg × 800 g ÷ 80 % de rendement = 60 ; 50 MAD les 100 × 4 = 2', JSON.stringify(c.lines.map((l) => l.cost)));
ok(near(c.food, 60) && near(c.packaging, 2) && near(c.total, 62) && near(c.perPortion, 15.5), 'lot 62 (matière 60, emballages 2), 4 portions ⇒ 15,50 par portion');
ok(near(c.priceHT, 100) && near(c.pct, 15.5) && near(c.contribution, 84.5), 'TVA 10 % incluse : 110 TTC ⇒ 100 HT, coût matière 15,5 %, contribution 84,50');
ok(near(c.suggested, 15.5 / 0.3 * 1.1), 'prix pour 30 % : 51,67 HT ⇒ 56,83 TTC', c.suggested);
ok(c.status === 'ok' && c.complete, 'fiche complète');

c = F.compute({ ...base, vatIncluded: false }, { convert: conv, today: '2026-10-11' });
ok(near(c.pct, 15.5 / 110 * 100), 'TVA non incluse : le % porte sur le prix saisi');

c = F.compute({ ...base, lines: [...base.lines, { id: 'c', name: 'Épices', type: 'food', packPrice: null, packQty: 1, packUnit: 'kg', useQty: 20, useUnit: 'g' }] }, { convert: conv, today: '2026-10-11' });
ok(c.status === 'incomplete' && c.total === null && c.perPortion === null && c.pct === null && near(c.known, 62), 'un prix inconnu : total, portion et % inconnus (jamais 0) ; le connu reste « au moins 62 »');
ok(c.lines[2].reason === 'price' && c.unknown.length === 1, 'la ligne inconnue est nommée et sa raison dite');

c = F.compute({ ...base, lines: [{ id: 'v', name: 'Huile', packPrice: 90, packQty: 1, packUnit: 'bouteille', useQty: 50, useUnit: 'ml' }] }, { convert: conv, today: '2026-10-11' });
ok(c.lines[0].cost === null && c.lines[0].reason === 'unit', 'des ml sur un produit acheté à la bouteille : inconnu, « unités incompatibles »');

c = F.compute({ ...base, lines: [{ ...base.lines[0], priceDate: '2026-06-01' }, { ...base.lines[1], priceDate: '2026-07-14' }] }, { convert: conv, today: '2026-10-11' });
ok(c.status === 'stale' && c.stale.length === 1 && c.lines[0].age === 132 && !c.lines[1].stale, 'prix de 132 jours signalé ancien, 89 jours non (seuil 90)');
c = F.compute({ ...base, lines: [{ ...base.lines[0], priceDate: '' }] }, { convert: conv, today: '2026-10-11' });
ok(c.lines[0].undated && !c.lines[0].stale, 'un prix sans date est dit « non daté », pas « ancien »');
c = F.compute({ ...base, sellingPrice: null }, { convert: conv, today: '2026-10-11' });
ok(c.pct === null && c.contribution === null && near(c.perPortion, 15.5), 'sans prix de vente : pas de %, le coût par portion reste');
c = F.compute({ ...base, lines: [] }, { convert: conv, today: '2026-10-11' });
ok(c.status === 'empty' && c.total === null, 'sans ligne : vide, pas 0 MAD');

/* ── 2 · l'onglet n'existe que si l'option est allumée ── */
ok(F.available() === false, 'option absente : pas d’onglet');
win.KiwiConfig.features.simple_food_cost = 'true';
ok(F.available() === false, 'seul `true` allume l’onglet');
win.KiwiConfig.features.simple_food_cost = true;
win.KiwiEnv.isReal = () => false;
ok(F.available() === false, 'jamais en démo');
win.KiwiEnv.isReal = () => true;
ok(F.available() === true, 'option allumée sur un compte réel : onglet');

/* ── 3 · états ── */
let html = F.panel();
ok(/data-sfc-state="loading"/.test(html), 'chargement : dit, sans chiffre');
mounted = true;
await flush(); await flush();
ok(calls[0] && calls[0].url === '/api/foodcost?merchant=resto-test', 'lecture : la route du magasin courant', calls[0] && calls[0].url);
ok(/data-sfc-state="empty"/.test(root.innerHTML) && /Nouvelle fiche/.test(root.innerHTML), 'aucune fiche : état vide et bouton de création');

const SHEET = { id: 'fc-1', name: 'Tajine poulet', kind: 'sheet', version: 2, archived: false, updatedTs: Date.UTC(2026, 9, 10, 9), updatedBy: 'Propriétaire · o***@resto.ma', data: base };
const TPL = { ...SHEET, id: 'fc-2', name: 'Modèle tajine', kind: 'template', version: 1 };
reply = () => ({ status: 200, body: { enabled: true, canEdit: true, sheets: [SHEET, TPL] } });
const click = async (attrs) => { const el = { getAttribute: (k) => attrs[k], closest: (s) => (s === '[data-sfc]' ? el : s === '[data-sfc-root]' ? root : null) }; for (const fn of listeners.click) await fn({ target: el }); await flush(); };
await click({ 'data-sfc': 'retry' });
ok(/Fiches/.test(root.innerHTML) && /Modèles/.test(root.innerHTML) && /15,50 MAD/.test(root.innerHTML) && /15,5 %/.test(root.innerHTML), 'liste : fiches et modèles séparés, coût par portion et % calculés', root.innerHTML.slice(0, 400));

await click({ 'data-sfc': 'open', 'data-id': 'fc-1' });
ok(/data-sfc-field="sheet.name" value="Tajine poulet"/.test(root.innerHTML) && /data-sfc-summary/.test(root.innerHTML), 'ouvrir : l’éditeur montre la fiche et son résumé');
ok(/Version 2/.test(root.innerHTML) && /o\*\*\*@resto\.ma/.test(root.innerHTML), 'l’éditeur dit la version, quand et qui');

/* saisie : seuls les chiffres se redessinent */
const before = root.innerHTML;
const input = (field, value, line, type = 'number') => {
  const row = line == null ? null : { getAttribute: () => String(line) };
  const el = { type, value: String(value), checked: false, getAttribute: (k) => (k === 'data-sfc-field' ? field : null),
    closest: (s) => (s === '[data-sfc-field]' ? el : s === '[data-sfc-root]' ? root : s === '[data-sfc-line]' ? row : null) };
  listeners.input.forEach((fn) => fn({ target: el }));
};
input('packPrice', '75', 0);
ok(root.innerHTML === before && /75,00 MAD/.test(root.children.lc0.innerHTML) && /19,25 MAD/.test(root.children.summary.innerHTML), 'saisir un prix : la ligne (75 × 0,8 kg ÷ 80 %) et le résumé (77 ÷ 4 = 19,25 par portion) se mettent à jour, le formulaire n’est pas redessiné', root.children.summary.innerHTML.slice(0, 300));
input('packPrice', '', 0);
ok(/Inconnu/.test(root.children.lc0.innerHTML) && /au moins/.test(root.children.summary.innerHTML) && /Le total n’est pas calculé/.test(root.children.summary.innerHTML), 'vider le prix : la ligne devient inconnue, le total « au moins », jamais 0');
input('packPrice', '75', 0);

/* enregistrer, puis conflit */
reply = (url, body) => (body && body.action === 'save' ? { status: 200, body: { sheet: { ...SHEET, version: 3, data: body.sheet } } } : { status: 200, body: {} });
await click({ 'data-sfc': 'save' });
const saveCall = calls.filter((x) => x.body && x.body.action === 'save').pop();
ok(saveCall && saveCall.body.baseVersion === 2 && saveCall.body.sheet.id === 'fc-1' && saveCall.body.sheet.lines[0].packPrice === 75 && saveCall.body.merchant === 'resto-test', 'enregistrer envoie la version lue (2) et la saisie');
ok(/Enregistrée · version 3/.test(root.innerHTML), 'confirmation : version 3');
input('portions', '5', null);
input('sheet.portions', '5', null);
reply = () => ({ status: 409, body: { error: 'conflict', sheet: { ...SHEET, version: 4, updatedBy: 'Opérateur · Badr', data: { ...base, name: 'Autre' } } } });
await click({ 'data-sfc': 'save' });
ok(/data-sfc-state="conflict"/.test(root.innerHTML) && /Opérateur · Badr/.test(root.innerHTML) && /value="5"/.test(root.innerHTML), 'conflit : dit qui a modifié, la saisie (5 portions) est gardée', root.innerHTML.slice(0, 300));
reply = (url, body) => ({ status: 200, body: { sheet: { ...SHEET, version: 5, data: body.sheet } } });
await click({ 'data-sfc': 'keep-mine' });
ok(calls.filter((x) => x.body && x.body.action === 'save').pop().body.baseVersion === 4, '« garder ma version » réenregistre sur la version en ligne (4), après l’avoir vue');

/* lecture seule / hors ligne / 403 / erreur */
nav.onLine = false;
await click({ 'data-sfc': 'save' });
ok(/Hors ligne/.test(root.innerHTML), 'hors ligne : le calcul reste, l’enregistrement attend');

/* hors ligne, puis rechargement : la saisie n'est pas perdue */
input('sheet.portions', '6', null);
await click({ 'data-sfc': 'save' });
const DKEY = 'kiwi:sfcDraft:owner@resto.ma@resto-test';
const kept = JSON.parse(disk.get(DKEY) || 'null');
ok(kept && kept.draft.portions === 6 && kept.pendingSave === true && kept.openId === 'fc-1' && kept.baseVersion === 5,
  'hors ligne : la saisie non enregistrée (6 portions) est gardée sur l’appareil, par compte et par magasin, avec la demande d’enregistrement', disk.get(DKEY));
/* Un second exemplaire du module, sur le même stockage : c'est un rechargement. */
async function reboot(account, answer) {
  disk.set('kiwiAccountKey', account);
  const L = {}, out = { calls: [], root: stub(), L };
  out.root.querySelector = () => null;
  const doc2 = { ...document, querySelector: (sel) => (sel === '[data-sfc-root]' ? out.root : null), addEventListener: (t, fn) => { (L[t] ||= []).push(fn); } };
  const w2 = { ...win, KiwiConfig: { features: { simple_food_cost: true } }, KiwiI18n: { getLang: () => 'fr' }, addEventListener: (t, fn) => { (L['w:' + t] ||= []).push(fn); } };
  delete w2.KiwiSimpleFoodCost; delete w2.KiwiRestaurantUnits;
  w2.window = w2;
  const f2 = async (url, opts) => { const body = opts && opts.body ? JSON.parse(opts.body) : null; out.calls.push({ url, body }); const r = answer(url, body); return { status: r.status, json: async () => r.body }; };
  const c2 = vm.createContext({ window: w2, document: doc2, navigator: { onLine: true }, fetch: f2, localStorage: makeStorage(), console, setTimeout: (fn) => fn(), clearTimeout() {}, Intl, URL: ctx.URL, Blob: ctx.Blob });
  vm.runInContext(R('assets/restaurant-units.js'), c2, { filename: 'restaurant-units.js' });
  vm.runInContext(R('assets/simple-food-cost.js'), c2, { filename: 'simple-food-cost.js' });
  w2.KiwiSimpleFoodCost.panel();
  await flush(); await flush(); await flush();
  return out;
}
const SHEET5 = { ...SHEET, version: 5 };
const other = await reboot('autre@ailleurs.ma', () => ({ status: 200, body: { enabled: true, canEdit: true, sheets: [SHEET5] } }));
ok(other.calls.length === 1 && /Tajine poulet/.test(other.root.innerHTML) && !/Calcul non enregistré retrouvé/.test(other.root.innerHTML) && !other.calls.some((x) => x.body) && disk.has(DKEY),
  'un autre compte sur le même navigateur ne retrouve pas la saisie, et ne l’efface pas');
const back = await reboot('owner@resto.ma', (url, body) => (body && body.action === 'save'
  ? { status: 200, body: { sheet: { ...SHEET, version: 6, data: body.sheet } } }
  : { status: 200, body: { enabled: true, canEdit: true, sheets: [SHEET5] } }));
const resumed = back.calls.find((x) => x.body && x.body.action === 'save');
ok(resumed && resumed.body.baseVersion === 5 && resumed.body.sheet.id === 'fc-1' && resumed.body.sheet.portions === 6,
  'après rechargement en ligne : la saisie revient et l’enregistrement demandé hors ligne part, sur la version lue (5)', String(JSON.stringify(resumed ? resumed.body : null)).slice(0, 200));
ok(/Enregistrée · version 6/.test(back.root.innerHTML) && !disk.has(DKEY), 'enregistrée : la copie locale est effacée', back.root.innerHTML.slice(0, 200));
disk.set('kiwiAccountKey', 'Owner@Resto.ma');

nav.onLine = true;
input('sheet.portions', '7', null);
const typed = disk.has(DKEY);
await click({ 'data-sfc': 'back' });
ok(typed && !disk.has(DKEY), 'quitter la fiche en abandonnant la saisie efface la copie locale');
reply = () => ({ status: 200, body: { enabled: false, canEdit: false, sheets: [SHEET] } });
await click({ 'data-sfc': 'retry' });
ok(/data-sfc-state="readonly"/.test(root.innerHTML) && !/Nouvelle fiche/.test(root.innerHTML), 'option éteinte : lecture seule dite, pas de création');
await click({ 'data-sfc': 'open', 'data-id': 'fc-1' });
ok(/data-sfc-field="sheet.name" value="Tajine poulet" maxlength="120" disabled/.test(root.innerHTML) && !/data-sfc="save"/.test(root.innerHTML), 'option éteinte : champs désactivés, pas de bouton Enregistrer');
await click({ 'data-sfc': 'back' });
reply = () => ({ status: 403, body: { error: 'forbidden' } });
await click({ 'data-sfc': 'retry' });
ok(/data-sfc-state="forbidden"/.test(root.innerHTML) && /propriétaire/.test(root.innerHTML), '403 : réservé au propriétaire, dit');
reply = () => ({ status: 503, body: { error: 'storage' } });
await click({ 'data-sfc': 'retry' });
ok(/data-sfc-state="error"/.test(root.innerHTML) && /Rien n’a été modifié/.test(root.innerHTML), 'erreur : dite, sans chiffre inventé');

/* ── 5 · export, stock ── */
const rows = F._exportRows({ ...base, name: '=HYPERLINK("x")', lines: [{ ...base.lines[0], name: '+cmd' }] });
const cellOut = (v) => vm.runInContext(`(${R('assets/simple-food-cost.js').match(/const cell = (\(v\) => \{[\s\S]*?\});/)[1]})`, ctx)(v);
ok(cellOut(rows[0][1]).startsWith("\"'=") && cellOut(rows[2][0]) === "'+cmd", 'export : une cellule qui commence par = ou + ne devient jamais une formule', `${cellOut(rows[0][1])} · ${cellOut(rows[2][0])}`);
const src = R('assets/simple-food-cost.js');
ok(!/KiwiMaisonStock|adjustStock|KiwiStock|\/api\/stock|\/api\/inventory|KiwiCost\.(set|update)/.test(src), 'aucune écriture de stock ni du document `costs`');

/* ── 6 · langues, règles de marque ── */
const dict = src.match(/const T = \{([\s\S]*?)\n  \};/)[1];
const keysOf = (l) => (dict.match(new RegExp(`\\n    ${l}: \\{([\\s\\S]*?)\\n    \\},`)) || ['', ''])[1].match(/\b([a-zA-Z]+): '/g).map((k) => k.slice(0, -3)).sort().join();
ok(keysOf('fr') && keysOf('fr') === keysOf('en') && keysOf('fr') === keysOf('ar'), 'FR, EN et AR portent les mêmes libellés');
ok(!/—/.test(dict) && !/italic/.test(src), 'aucun tiret cadratin dans les libellés, aucune italique');
win.KiwiI18n.getLang = () => 'en';
await click({ 'data-sfc': 'retry' });
reply = () => ({ status: 200, body: { enabled: true, canEdit: true, sheets: [SHEET] } });
await click({ 'data-sfc': 'retry' });
ok(/Cost per portion/.test(root.innerHTML) && /New sheet/.test(root.innerHTML), 'EN : la liste en anglais');

/* ── finance.js : l'onglet suit l'option ── */
const fin = R('assets/finance.js');
ok(/const tabsNow = \(\) => FIN_TABS\.filter\(\(k\) => k !== 'cost' \|\| costOn\(\)\)/.test(fin) && /if \(finTab === 'cost' && !costOn\(\)\) finTab = 'overview';/.test(fin), 'finance.js : onglet « Coût simple » seulement si l’option est allumée, sinon retour à la vue d’ensemble');
ok(/finTab === 'cost' && costOn\(\) && document\.querySelector\('\[data-sfc-root\]'\)/.test(fin), 'finance.js : les ventes en direct ne redessinent pas la fiche en cours de saisie');
ok(/key:'simple_food_cost', label:'Coût simple \(fiches de coût\)', off:true/.test(R('kiwi-admin.html')), 'console : l’option est éteinte par défaut (off:true)');

console.log(`\n${fail ? '✗' : '✓'} ${pass} contrôles verts${fail ? `, ${fail} en échec` : ''}`);
process.exit(fail ? 1 : 0);
