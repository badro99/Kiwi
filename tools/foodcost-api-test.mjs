#!/usr/bin/env node
/* Coût simple · l'API des fiches de coût (functions/api/foodcost.js).
 *
 * Ce banc tient, sur la vraie route et le vrai schema.sql :
 *   1. Qui : le propriétaire de CE magasin et un opérateur nommé lisent et
 *      écrivent ; une caisse appairée, un employé, un autre compte, un
 *      visiteur sans session : 403. Pas de slug de démo ici, sinon
 *      entitledMerchant() rendrait n'importe qui « chez lui ».
 *   2. L'option est opt-in : absente ou fausse ⇒ lecture seule, écritures
 *      refusées, rien d'effacé quand on l'éteint après usage.
 *   3. Une version lue ne s'écrase pas : 409 avec la version en ligne.
 *   4. Chaque version est figée dans l'historique, qui et quand.
 *   5. Saisie bornée : un champ vide reste inconnu (null), jamais 0.
 *   6. Aucune écriture dans le stock ni dans `costs`. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestGet, onRequestPost, cleanSheet } = await import(path.join(ROOT, 'functions/api/foodcost.js'));
const auth = await import(path.join(ROOT, 'functions/auth/_lib.js'));

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra != null ? '\n      ' + String(extra).slice(0, 400) : '')); }
};
console.log('■ Coût simple · API (tools/foodcost-api-test.mjs)');

const SECRET = 'foodcost-secret-0123456789abcdef';
const SHOP = 'resto-test-fc';
const OTHER = 'autre-resto-fc';
const now = Date.now();
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const insert = (sql, ...v) => sqlite.prepare(sql).run(...v);
insert(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-1','owner@resto.ma','Resto Test FC','s','h',?,'active')`, now);
insert(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-2','autre@resto.ma','Autre Resto FC','s','h',?,'active')`, now);
insert(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,updated_ts) VALUES (?,?,'pro','restaurant','acc-1','Resto','active',?)`, SHOP, JSON.stringify({ simple_food_cost: true }), now);
insert(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,updated_ts) VALUES (?,'{}','pro','restaurant','acc-2','Autre','active',?)`, OTHER, now);
insert(`INSERT INTO operators (id,label,salt,hash,created_ts) VALUES ('op1','Badr','s','h',?)`, now);
const TEAM = { members: [{ id: 'm1', firstName: 'Samira', function: 'Serveur', pinCode: '0000' }] };
insert(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'team',?,1,?)`, SHOP, JSON.stringify(TEAM), now);
insert(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'employee-access',?,1,?)`, SHOP, JSON.stringify({ members: TEAM.members }), now);

const DB = {
  prepare(sql) {
    const st = sqlite.prepare(sql);
    let args = [];
    const api = {
      bind(...v) { args = v; return api; },
      async first() { const r = st.get(...args); return r === undefined ? null : r; },
      async all() { return { results: st.all(...args) }; },
      async run() { const r = st.run(...args); return { meta: { changes: r.changes }, success: true }; },
    };
    return api;
  },
  async batch(stmts) {
    sqlite.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
    catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; }
  },
};
const env = { AUTH_SECRET: SECRET, DB };

const owner = auth.sessionCookie(await auth.makeSession('acc-1', SECRET)).split(';')[0];
const stranger = auth.sessionCookie(await auth.makeSession('acc-2', SECRET)).split(';')[0];
const till = `kiwi_till=${await auth.tillToken(SECRET, SHOP)}`;
const employee = auth.employeeCookie(await auth.employeeToken(SECRET, { merchant: SHOP, staffId: 'm1' })).split(';')[0];
const operator = `kiwi_op=${await auth.operatorToken(SECRET)}; kiwi_op_id=${await auth.operatorIdToken(SECRET, 'op1')}`;

const get = async (q, cookie) => {
  const r = await onRequestGet({ env, request: new Request(`https://kiwi.test/api/foodcost?${q}`, { headers: cookie ? { Cookie: cookie } : {} }) });
  return { status: r.status, body: await r.json() };
};
const post = async (body, cookie) => {
  const r = await onRequestPost({ env, request: new Request('https://kiwi.test/api/foodcost', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json() };
};

/* ── 1 · qui ── */
const SHEET = {
  name: 'Tajine poulet', kind: 'sheet', menuItemId: 'tajine', sellingPrice: 110, vatIncluded: true, vatRate: 10, portions: 4, targetPct: 30,
  lines: [
    { id: 'a', name: 'Poulet', type: 'food', packPrice: 60, packQty: 1, packUnit: 'kg', useQty: 800, useUnit: 'g', yieldPct: 80, priceDate: '2026-10-01' },
    { id: 'b', name: 'Barquette', type: 'packaging', packPrice: 50, packQty: 100, packUnit: 'unité', useQty: 4, useUnit: 'unité' },
    { id: 'c', name: 'Épices', type: 'food', packPrice: '', packQty: 1, packUnit: 'kg', useQty: 20, useUnit: 'g' },
  ],
};
let r = await post({ merchant: SHOP, action: 'save', sheet: SHEET }, owner);
ok('le propriétaire crée une fiche (201, version 1)', r.status === 201 && r.body.sheet.version === 1, JSON.stringify(r));
const id = r.body.sheet && r.body.sheet.id;
for (const [label, cookie] of [['une caisse appairée', till], ['un employé connecté', employee], ['un autre compte', stranger], ['un visiteur sans session', '']]) {
  const g = await get(`merchant=${SHOP}`, cookie);
  const p = await post({ merchant: SHOP, action: 'save', sheet: { ...SHEET, name: 'Intrus' } }, cookie);
  ok(`${label} ne lit ni n’écrit (403/403)`, g.status === 403 && p.status === 403, `${g.status}/${p.status}`);
}
r = await get(`merchant=${SHOP}`, operator);
ok('un opérateur nommé lit la fiche', r.status === 200 && r.body.sheets.length === 1);
r = await get(`merchant=${SHOP}`, owner);
ok('liste : option allumée, modifiable, une fiche', r.status === 200 && r.body.enabled === true && r.body.canEdit === true && r.body.sheets[0].name === 'Tajine poulet');

/* ── 5 · saisie bornée ── */
const data = r.body.sheets[0].data;
ok('un prix vide reste inconnu (null), jamais 0', data.lines[2].packPrice === null && data.lines[0].packPrice === 60);
ok('rendement par défaut 100 %, type et unités conservés', data.lines[1].yieldPct === 100 && data.lines[1].type === 'packaging' && data.lines[0].yieldPct === 80);
const c = cleanSheet({ name: 'x'.repeat(500), portions: 0, targetPct: 400, lines: Array.from({ length: 200 }, () => ({ packQty: -3, yieldPct: 0 })) });
ok('bornes : nom 120, portions ≥ 1, objectif ≤ 100 ou inconnu, 80 lignes, quantité négative ⇒ inconnue', c.name.length === 120 && c.portions === 1 && c.targetPct === null && c.lines.length === 80 && c.lines[0].packQty === null && c.lines[0].yieldPct === 100);

/* ── 3 · conflit ── */
r = await post({ merchant: SHOP, action: 'save', sheet: { ...SHEET, id, name: 'Tajine poulet v2' }, baseVersion: 1 }, owner);
ok('enregistrer sur la version lue : version 2', r.status === 200 && r.body.sheet.version === 2, JSON.stringify(r.body).slice(0, 200));
r = await post({ merchant: SHOP, action: 'save', sheet: { ...SHEET, id, name: 'Écrasement' }, baseVersion: 1 }, operator);
ok('enregistrer sur une version périmée : 409 et la version en ligne, rien d’écrasé', r.status === 409 && r.body.sheet.name === 'Tajine poulet v2' && r.body.sheet.version === 2);
r = await post({ merchant: SHOP, action: 'save', sheet: { ...SHEET, id: 'inconnu-123', name: 'X' }, baseVersion: 1 }, owner);
ok('un id inconnu ne crée pas de fiche en douce (404)', r.status === 404);

/* ── 4 · historique ── */
r = await post({ merchant: SHOP, action: 'save', sheet: { ...SHEET, id, name: 'Tajine poulet v3', lines: [{ ...SHEET.lines[0], packPrice: 75 }] }, baseVersion: 2 }, operator);
ok('un opérateur enregistre la version 3', r.status === 200 && r.body.sheet.version === 3 && /Opérateur · Badr/.test(r.body.sheet.updatedBy));
r = await get(`merchant=${SHOP}&id=${id}`, owner);
ok('historique : trois versions, la plus récente d’abord, qui et quand', r.body.history.map((h) => h.version).join() === '3,2,1' && /Propriétaire · o.*@resto\.ma/.test(r.body.history[2].actor) && /Badr/.test(r.body.history[0].actor) && r.body.history.every((h) => h.ts > 0), JSON.stringify(r.body.history));
ok('l’adresse du propriétaire est masquée dans le journal', !r.body.history.some((h) => /owner@resto\.ma/.test(h.actor)));
r = await get(`merchant=${SHOP}&id=${id}&version=1`, owner);
ok('la version 1 est figée : prix du poulet 60, trois lignes', r.status === 200 && r.body.snapshot.data.lines[0].packPrice === 60 && r.body.snapshot.data.lines.length === 3);
const before = sqlite.prepare('SELECT COUNT(*) AS n FROM foodcost_snapshots').get().n;
await post({ merchant: SHOP, action: 'save', sheet: { ...SHEET, id, name: 'Périmé' }, baseVersion: 1 }, owner);
ok('un enregistrement refusé n’ajoute aucune version', sqlite.prepare('SELECT COUNT(*) AS n FROM foodcost_snapshots').get().n === before);

/* ── modèles, copie, archive ── */
r = await post({ merchant: SHOP, action: 'duplicate', id, kind: 'template', name: 'Modèle tajine' }, owner);
ok('dupliquer en modèle : nouvelle fiche, version 1', r.status === 201 && r.body.sheet.kind === 'template' && r.body.sheet.id !== id && r.body.sheet.version === 1);
r = await post({ merchant: SHOP, action: 'archive', id, archived: true, baseVersion: 3 }, owner);
ok('archiver : version 4, la fiche reste lisible', r.status === 200 && r.body.sheet.archived === true && r.body.sheet.version === 4);

/* ── 2 · option opt-in ── */
sqlite.prepare('UPDATE merchant_config SET features = ? WHERE merchant = ?').run('{}', SHOP);
r = await get(`merchant=${SHOP}`, owner);
ok('option éteinte (clé absente) : lecture seule, rien d’effacé', r.status === 200 && r.body.enabled === false && r.body.canEdit === false && r.body.sheets.length === 2);
r = await post({ merchant: SHOP, action: 'save', sheet: { ...SHEET, name: 'Nouvelle' } }, owner);
ok('option éteinte : écriture refusée (403 disabled)', r.status === 403 && r.body.error === 'disabled');
sqlite.prepare('UPDATE merchant_config SET features = ? WHERE merchant = ?').run(JSON.stringify({ simple_food_cost: 'yes' }), SHOP);
r = await post({ merchant: SHOP, action: 'save', sheet: { ...SHEET, name: 'Nouvelle' } }, owner);
ok('seul `true` allume l’option (« yes » ne suffit pas)', r.status === 403);
sqlite.prepare('UPDATE merchant_config SET features = ?, status = ? WHERE merchant = ?').run(JSON.stringify({ simple_food_cost: true }), 'suspended', SHOP);
r = await post({ merchant: SHOP, action: 'save', sheet: { ...SHEET, name: 'Nouvelle' } }, owner);
ok('magasin suspendu : écriture refusée', r.status === 403 && r.body.error === 'suspended');
sqlite.prepare('UPDATE merchant_config SET status = ? WHERE merchant = ?').run('active', SHOP);

/* ── isolation ── */
r = await get(`merchant=${OTHER}`, owner);
ok('le propriétaire de A ne lit pas les fiches de B', r.status === 403);
r = await get(`merchant=${OTHER}`, stranger);
ok('B ne voit aucune fiche de A', r.status === 200 && r.body.sheets.length === 0 && r.body.enabled === false);

/* ── 6 · pas d'inventaire ── */
const src = fs.readFileSync(path.join(ROOT, 'functions/api/foodcost.js'), 'utf8');
ok('la route n’écrit ni le stock ni le document `costs`', !/stock_|inventory|store_docs|'costs'/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
ok('aucune réponse n’est mise en cache', /Cache-Control': 'no-store'/.test(src));

console.log(`\n${fail ? '✗' : '✓'} ${pass} contrôles verts${fail ? `, ${fail} en échec` : ''}`);
process.exit(fail ? 1 : 0);
