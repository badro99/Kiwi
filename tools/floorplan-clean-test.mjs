#!/usr/bin/env node
/* Un plan de salle ne porte pas de balisage dans ses ids ni ses couleurs.
 *
 * Le document `floorplan` s'écrit depuis le tableau de bord ET depuis une
 * caisse appairée, et les deux le lisent en HTML : ids de table, de zone et
 * d'élément dans des attributs data-*, couleurs dans des attributs style. Un
 * id portant un guillemet sortait de l'attribut : une caisse pouvait poser du
 * script dans le tableau de bord du propriétaire.
 *
 * Ce banc tient la règle (functions/api/_rules-floorplan-clean.js), son
 * application par le serveur à l'écriture d'une caisse appairée, et la copie
 * du navigateur (assets/floorplan-core.js › KiwiFloorCore.cleanPlan) qui
 * nettoie à la lecture les plans enregistrés avant elle. Un plan ordinaire
 * ressort octet pour octet.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { cleanFloorplan } = await import(pathToFileURL(path.join(ROOT, 'functions/api/_rules-floorplan-clean.js')).href);
const { onRequestPost: storePost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')).href);
const { tillToken, DEMO_MERCHANTS } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

const BAD = '"><img src=x onerror=alert(1)>';
const nest = (n) => (n ? { a: nest(n - 1) } : { m: BAD });
const hostile = () => ({
  zones: [{ id: 'z1' + BAD, name: 'Terrasse "sud"', color: 'red;background:url(x)', room: { w: 900, h: 600, floor: 'parquet' } }],
  tables: [{ id: 't1' + BAD, zone: 'z1' + BAD, num: '4<b>', color: '#0B6E4F"', servers: ['mem-a' + BAD, 'mem-b'], server: 'mem-a' + BAD, group: 'g"1' }],
  objects: [{ id: 'e1', zone: 'z1' + BAD, type: 'bar' + BAD, color: 'javascript:x', fill: '#abc' },
    { id: ['e2' + BAD], zone: { evil: BAD }, color: { v: BAD }, x: '1px" onmouseover="alert(1)', w: [BAD], rot: '90', ['k' + BAD]: 1,
      deep: nest(16) }],
  rooms: [],
  staff: [{ id: 's"1', name: 'Samira <S.>', color: '#C0306E' }],
});
const ordinary = () => ({
  zones: [{ id: 'zbd8f2a', name: "L'olivier", color: '#0B6E4F', room: { w: 900, h: 600, wallW: 2, floor: 'tile' } }],
  tables: [{ id: 'tq1x9b2c', zone: 'zbd8f2a', num: 12, color: null, servers: ['mem-4k2j9a1'], server: 'mem-4k2j9a1', seats: 4, type: 'round4' },
    { id: 't2', zone: 'zbd8f2a', num: 'A-3', color: '#c89235', group: 'grp_1', floor: 'rdc' }],
  objects: [{ id: 'em1_ab12', zone: 'zbd8f2a', type: 'bar', color: '#2C2520' }],
  rooms: [], staff: [{ id: 'mem-4k2j9a1', name: 'Rachid O.', color: '#5A6CDB' }],
});

const markup = /["'<>`]/;
const strings = (o, skip = []) => o && typeof o === 'object'
  ? Object.entries(o).flatMap(([k, v]) => [...(skip.includes(k) ? [] : [k]), ...(skip.includes(k) ? [] : strings(v, skip))])
  : (typeof o === 'string' ? [o] : []);
function check(label, clean) {
  const out = clean(hostile());
  const ids = [out.zones[0].id, out.tables[0].id, out.tables[0].zone, out.tables[0].server, out.tables[0].group,
    ...out.tables[0].servers, out.objects[0].zone, out.staff[0].id];
  assert.ok(ids.every((v) => typeof v === 'string' && /^[A-Za-z0-9_.:-]+$/.test(v)), label + ' : ids réduits à des caractères sûrs ' + JSON.stringify(ids));
  assert.equal(out.tables[0].zone, out.zones[0].id, label + ' : la table pointe toujours vers sa zone (réécriture déterministe)');
  assert.equal(out.tables[0].server, out.tables[0].servers[0], label + ' : le serveur principal reste le premier de la liste');
  assert.equal(out.zones[0].color, null, label + ' : une couleur qui n’est pas hexadécimale tombe à la couleur par défaut');
  assert.equal(out.tables[0].color, null, label + ' : un hexadécimal suivi d’un guillemet aussi');
  assert.equal(out.objects[0].color, null);
  assert.equal(out.objects[0].fill, '#abc', label + ' : un hexadécimal court reste');
  assert.equal(out.staff[0].color, '#C0306E');
  assert.equal(out.tables[0].num, '4b', label + ' : le numéro perd ses caractères de balisage');
  assert.equal(out.zones[0].name, 'Terrasse "sud"', label + ' : les noms affichés restent tels quels (échappés au rendu)');
  assert.equal(out.zones[0].room.floor, 'parquet', label + ' : un matériau de sol est un mot, il reste');
  assert.equal(out.objects[0].type, 'bar”img src=x onerror=alert(1)', label + ' : un type perd son balisage et garde un guillemet typographique');
  const odd = out.objects[1];
  assert.deepEqual(odd.id, ['e2___img_src_x_onerror_alert_1__'], label + ' : un id en tableau est nettoyé élément par élément');
  assert.ok(!strings(odd.zone).some((v) => markup.test(v)), label + ' : un id en objet est nettoyé dans ses champs');
  assert.equal(odd.color, null, label + ' : une couleur qui n’est pas une chaîne tombe à null');
  assert.equal(odd.x, 0, label + ' : une coordonnée non numérique devient 0');
  assert.equal(odd.w, 0, label + ' : une largeur en tableau devient 0');
  assert.equal(odd.rot, 90, label + ' : une rotation écrite en texte redevient un nombre');
  assert.ok(Object.keys(odd).every((k) => /^[A-Za-z0-9_.:-]+$/.test(k)), label + ' : les clés suivent la règle des ids');
  assert.ok(!strings(odd.deep).some((v) => v.includes('<')), label + ' : ce qui dépasse la profondeur d’un plan est retiré');
  assert.ok(!strings(out, ['name', 'label']).some((v) => markup.test(v)),
    label + ' : hors noms et étiquettes, plus aucun caractère de balisage dans tout le document');
  assert.deepEqual(clean(ordinary()), ordinary(), label + ' : un plan ordinaire ressort inchangé');
}

check('règle', cleanFloorplan);

/* La copie du navigateur : la même règle, exposée par KiwiFloorCore. */
{
  const context = { window: {}, console };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/floorplan-core.js'), 'utf8'), context, { filename: 'floorplan-core.js' });
  const core = context.window.KiwiFloorCore;
  assert.equal(typeof core.cleanPlan, 'function', 'KiwiFloorCore.cleanPlan existe');
  check('navigateur', (d) => JSON.parse(JSON.stringify(core.cleanPlan(d))));
}

/* Le serveur : une caisse appairée écrit un plan piégé, la base garde un plan propre. */
{
  const AUTH_SECRET = 'floorplan-clean-secret-0123456789';
  const SHOP = 'amira-cafe-banc';
  assert.ok(!DEMO_MERCHANTS[SHOP], 'le magasin du banc n’est pas un slug de démo');
  const now = Date.now();
  const db = new DatabaseSync(':memory:');
  db.exec(`
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
`);
  db.prepare(`INSERT INTO accounts VALUES ('acc-1','o@amira.ma','Amira Cafe','s','h',?,'active',0)`).run(now);
  db.prepare(`INSERT INTO merchant_config VALUES (?, '{}','pro','restaurant','acc-1','Amira Cafe','active',0,?)`).run(SHOP, now);
  const env = { AUTH_SECRET, DB: {
    prepare(q) {
      const st = db.prepare(q);
      return { bind(...p) { return {
        async first() { const row = st.get(...p); return row === undefined ? null : row; },
        async all() { return { results: st.all(...p) }; },
        async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
      }; } };
    },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  } };
  const till = `kiwi_till=${await tillToken(AUTH_SECRET, SHOP)}`;
  const post = (data) => storePost({ request: new Request('https://k/api/store', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: till, 'CF-Connecting-IP': '10.0.0.2' },
    body: JSON.stringify({ feature: 'floorplan', merchant: SHOP, data }) }), env });
  const deep = await post(hostile());
  assert.equal(deep.status, 413, 'un plan plus profond qu’un plan réel est refusé');
  const flat = hostile(); delete flat.objects[1].deep;
  const res = await post(flat);
  assert.equal(res.status, 200, 'la caisse appairée écrit toujours le plan : ' + res.status + ' ' + await res.clone().text());
  const stored = JSON.parse(db.prepare(`SELECT data FROM store_docs WHERE merchant=? AND feature='floorplan'`).get(SHOP).data);
  const attrs = [...stored.zones, ...stored.tables, ...stored.objects].flatMap((o) => [o.id, o.zone, o.color, o.server, ...(o.servers || [])]);
  assert.ok(attrs.every((v) => v == null || !markup.test(String(v))), 'la base ne garde aucun id ni couleur porteur de balisage');
  assert.equal(stored.zones[0].name, 'Terrasse "sud"', 'les noms restent ceux du commerçant');
}

console.log('✓ floorplan-clean-test : ids et couleurs du plan nettoyés par la règle, le serveur et le navigateur ; un plan ordinaire inchangé');
