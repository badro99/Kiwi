#!/usr/bin/env node
import { missingMigratedTables } from './fixtures/migrated-tables.cjs';
/* ═══════════════════════════════════════════════════════════════════════════
 * TERMINAUX · CE QUE LE PARC AFFIRME
 *
 * La page lit de vrais battements (device_health). Mesuré sur la pile locale,
 * avec un propriétaire qui ouvre sa caisse sur le même appareil que son
 * tableau de bord :
 *
 * 1. UNE LIGNE PAR APPLICATION. Caisse et tableau de bord partageaient un
 *    identifiant (localStorage) ET la clé d'idempotence du battement (appareil
 *    + tranche de cinq minutes) : le battement de la caisse était refusé comme
 *    doublon, et la ligne, écrasée à chaque battement, changeait d'`app`. La
 *    caisse n'apparaissait jamais comme caisse.
 * 2. UN BATTEMENT QUI RAPPORTE UN CHANGEMENT PASSE. Le « battement immédiat »
 *    après un ticket d'essai partageait la clé de la tranche : l'état de
 *    l'imprimante restait celui du chargement.
 * 3. UN NOM, PAS UN IDENTIFIANT. L'appareil n'envoyait aucun libellé : la page
 *    affichait « dev:1a8606e3-9464-44ba-… » en titre. Il se décrit maintenant
 *    (système · navigateur, et l'ID que la caisse affiche en haut de l'écran),
 *    et le patron peut le renommer sans que le battement efface son choix.
 * 4. UN TABLEAU DE BORD NE SE DÉCLARE PAS « MUET ». Chaque navigateur, chaque
 *    profil vidé, naissait sous un nouvel identifiant et levait une alarme
 *    « appareil muet » à vie (trente jours). La console se lit tant qu'elle a
 *    été vue dans la journée, sans alarme ; caisses et salle gardent leur
 *    seuil et leurs trente jours.
 *
 * Le Worker est le vrai, sur du vrai SQL (node:sqlite) ; operations.js tourne
 * dans un `vm`.
 *
 *   node tools/terminaux-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { onRequestGet, onRequestPost } from '../functions/api/operations.js';
import { makeSession, tillToken, employeeToken, slugMerchant } from '../functions/auth/_lib.js';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserSource = fs.readFileSync(path.join(ROOT, 'assets/operations.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(ROOT, 'assets/operations-ui.js'), 'utf8');

let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n').filter(Boolean).slice(0, 3).join(' | ')}`); }
}

/* ── Le Worker, sur du vrai SQL ─────────────────────────────────────────── */
const D1 = (db) => ({
  prepare(sql) {
    const params = [];
    const stmt = {
      bind(...args) { params.push(...args); return stmt; },
      async run() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
      async first() { const row = db.prepare(sql).get(...params); return row === undefined ? null : row; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
    };
    return stmt;
  },
  async batch(statements) {
    db.exec('BEGIN IMMEDIATE');
    try { const out = []; for (const s of statements) out.push(await s.run()); db.exec('COMMIT'); return out; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  },
});

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE accounts (id TEXT PRIMARY KEY, business TEXT, status TEXT DEFAULT 'active', session_epoch INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, account_id TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, updated_ts INTEGER);
  CREATE TABLE operators (id TEXT PRIMARY KEY);
  CREATE TABLE employee_auth_versions (merchant TEXT, member_id TEXT, auth_version INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(merchant, member_id));
`);
  missingMigratedTables(db);
const SECRET = 'terminaux-suite-secret';
const BUSINESS = 'Café Test';
const MERCHANT = slugMerchant(BUSINESS);
db.prepare('INSERT INTO accounts (id, business) VALUES (?, ?)').run('acc-owner', BUSINESS);
db.prepare('INSERT INTO merchant_config (merchant, account_id, status) VALUES (?, ?, ?)').run(MERCHANT, 'acc-owner', 'active');
db.prepare('INSERT INTO store_docs (merchant, feature, data, updated_ts) VALUES (?, ?, ?, ?)')
  .run(MERCHANT, 'team', JSON.stringify({ members: [{ id: 'emp-2', name: 'Nadia', function: 'Manager' }] }), 2);
const env = { DB: D1(db), AUTH_SECRET: SECRET };
const ownerCookie = `kiwi_sess=${await makeSession('acc-owner', SECRET)}`;
const tillCookie = `kiwi_till=${await tillToken(SECRET, MERCHANT)}`;
/* Un responsable travaille à une caisse appairée : son cookie d'employé voyage avec celui de la caisse. */
const managerCookie = `kiwi_employee=${await employeeToken(SECRET, { merchant: MERCHANT, staffId: 'emp-2' })}; ${tillCookie}`;

function request(cookie, { method = 'GET', query = '', body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request('https://kiwi.test/api/operations' + query, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function post(cookie, body) {
  const r = await onRequestPost({ request: request(cookie, { method: 'POST', body }), env });
  return { status: r.status, data: await r.json() };
}
async function get(cookie, query) {
  const r = await onRequestGet({ request: request(cookie, { query }), env });
  return { status: r.status, data: await r.json() };
}
let seq = 0;
const cmd = (action, payload, extra) => { const id = 'op:tx-' + String(++seq).padStart(5, '0'); return { id, idempotencyKey: id, merchant: MERCHANT, domain: 'device', action, payload, ...(extra || {}) }; };
const beat = (cookie, payload) => post(cookie, cmd('heartbeat', payload));
const fleet = async () => {
  const v = await get(ownerCookie, `?merchant=${MERCHANT}&view=devices`);
  return { status: v.status, data: v.data, byId: new Map(((v.data && v.data.devices) || []).map((d) => [d.deviceId, d])) };
};
const hours = (n) => n * 3600 * 1000;

// Historical rows are read using the schema installed by migrations.
db.prepare(`INSERT INTO device_health (merchant, device_id, app, label, printer_configured, printer_connected, beats, first_seen_ts, last_seen_ts)
  VALUES (?, 'dev:legacy-till', 'caisse', 'Caisse comptoir', 1, 1, 7, ?, ?)`).run(MERCHANT, Date.now() - 1000, Date.now() - 1000);

await ok('une ligne historique reste lisible sur une base migrée', async () => {
  const f = await fleet();
  assert.equal(f.status, 200);
  const legacy = f.byId.get('dev:legacy-till');
  assert.ok(legacy, 'la ligne historique est relue');
  assert.equal(legacy.label, 'Caisse comptoir');
  assert.equal(legacy.renamed, false);
});

/* ── 4. La console ne se déclare pas muette ─────────────────────────────── */
await ok('un tableau de bord qui bat est listé, sans alarme', async () => {
  const r = await beat(ownerCookie, { app: 'dashboard', deviceId: 'dev:laptop:web', label: 'Mac · Chrome', at: Date.now() - 5 * 60 * 1000 });
  assert.equal(r.data.command.status, 'completed');
  assert.equal(r.data.command.result.alert, '');
  const f = await fleet();
  const d = f.byId.get('dev:laptop:web');
  assert.ok(d, 'listé');
  assert.equal(d.alert, '');
  assert.equal(f.data.offline, 0);
});

await ok('un tableau de bord resté muet plus de trois battements n\'est plus listé : console fermée, pas un appareil en panne', async () => {
  const r = await beat(ownerCookie, { app: 'dashboard', deviceId: 'dev:closed-tab:web', label: 'Safari', at: Date.now() - hours(3) });
  assert.equal(r.data.command.result.alert, '', 'pas d\'alarme à l\'écriture');
  const f = await fleet();
  assert.equal(f.byId.get('dev:closed-tab:web'), undefined);
  assert.equal(f.data.offline, 0, 'et il ne gonfle pas « appareils muets »');
  assert.equal(f.data.alerts, 0);
});

await ok('une tablette de salle muette garde l\'alarme et ses trente jours (seul le tableau de bord est exempté)', async () => {
  const r = await beat(ownerCookie, { app: 'serveur', deviceId: 'dev:floor', label: 'iPhone · Safari', at: Date.now() - hours(20) });
  assert.equal(r.data.command.result.alert, 'device-offline');
  const f = await fleet();
  assert.equal(f.byId.get('dev:floor').alert, 'device-offline');
});

/* ── 3. Un nom, pas un identifiant ──────────────────────────────────────── */
await ok('le libellé que l\'appareil se donne remonte tel quel', async () => {
  await beat(tillCookie, { app: 'caisse', deviceId: 'dev:till-1', label: 'iPad · Safari · ID 3CC8E2', printerConfigured: true, printerConnected: true });
  const f = await fleet();
  assert.equal(f.byId.get('dev:till-1').label, 'iPad · Safari · ID 3CC8E2');
});

await ok('le patron renomme : son nom gagne, et le battement suivant ne l\'efface pas', async () => {
  const r = await post(ownerCookie, cmd('rename', { deviceId: 'dev:till-1', name: '  Caisse comptoir  ' }));
  assert.equal(r.data.command.status, 'completed');
  assert.equal(r.data.command.result.label, 'Caisse comptoir');
  let f = await fleet();
  assert.equal(f.byId.get('dev:till-1').label, 'Caisse comptoir');
  assert.equal(f.byId.get('dev:till-1').renamed, true);
  await beat(tillCookie, { app: 'caisse', deviceId: 'dev:till-1', label: 'iPad · Safari · ID 3CC8E2', printerConfigured: true, printerConnected: true });
  f = await fleet();
  assert.equal(f.byId.get('dev:till-1').label, 'Caisse comptoir', 'le battement réécrit `label`, jamais le nom du patron');
});

await ok('un nom vide rend l\'appareil à son nom d\'origine', async () => {
  const r = await post(ownerCookie, cmd('rename', { deviceId: 'dev:till-1', name: '   ' }));
  assert.equal(r.data.command.status, 'completed');
  assert.equal(r.data.command.result.renamed, false);
  const f = await fleet();
  assert.equal(f.byId.get('dev:till-1').label, 'iPad · Safari · ID 3CC8E2');
  assert.equal(f.byId.get('dev:till-1').renamed, false);
});

await ok('on ne renomme pas un appareil qui ne s\'est jamais manifesté', async () => {
  const r = await post(ownerCookie, cmd('rename', { deviceId: 'dev:never-seen', name: 'Fantôme' }));
  assert.equal(r.data.command.status, 'failed');
  assert.equal(r.data.command.lastError, 'device-unknown');
});

await ok('une caisse ne renomme pas le parc ; un responsable le peut (même droit que faire taire une alarme)', async () => {
  const till = await post(tillCookie, cmd('rename', { deviceId: 'dev:till-1', name: 'Pirate' }));
  assert.equal(till.status, 403);
  assert.equal(till.data.error, 'permission-denied');
  const mgr = await post(managerCookie, cmd('rename', { deviceId: 'dev:till-1', name: 'Caisse 1' }));
  assert.equal(mgr.status, 200);
  assert.equal(mgr.data.command.status, 'completed');
});

await ok('un nom est borné et débarrassé de ses caractères de contrôle', async () => {
  const r = await post(ownerCookie, cmd('rename', { deviceId: 'dev:till-1', name: 'A\u0000B\u0007C' + 'x'.repeat(200) }));
  assert.equal(r.data.command.status, 'completed');
  const label = r.data.command.result.label;
  assert.ok(label.length <= 80 && !/[\u0000-\u001f]/.test(label), label);
});

/* ── Le navigateur : identité, clé d'idempotence, libellé ───────────────── */
let uuid = 0;
function browser(pathname, storage, ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', touch = 5) {
  const sent = [];
  const platform = {
    tenant: () => 'cafe-test', register() {},
    access: { role: () => 'owner', can: () => true }, telemetry: { start: () => ({ end() {} }) },
  };
  const navigator = { userAgent: ua, maxTouchPoints: touch, onLine: true, standalone: false };
  const context = {
    window: { KiwiPlatform: platform, addEventListener() {}, dispatchEvent() {} },
    navigator, location: { pathname }, document: { body: { classList: { contains: () => false } }, addEventListener() {} },
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } },
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      sent.push({ url: String(url), body });
      return { ok: true, status: 200, json: async () => ({ ok: true, command: { id: body && body.id, status: 'completed', result: {} } }) };
    },
    crypto: { randomUUID: () => 'cmd-' + (++uuid) },
    URLSearchParams, CustomEvent: class {}, setInterval() {}, setTimeout() {}, console, Date, Math, Promise, Set, Error, Object, String, Number, JSON,
  };
  context.window.window = context.window; context.window.navigator = navigator; context.window.location = context.location;
  vm.createContext(context);
  vm.runInContext(browserSource, context, { filename: 'operations.js' });
  return { O: context.window.KiwiOperations, sent };
}
const beats = (sent) => sent.filter((s) => s.body && s.body.action === 'heartbeat').map((s) => s.body);

await ok('1. caisse et tableau de bord du même navigateur battent sous deux identifiants et deux clés', async () => {
  const shared = { kiwiDeviceId: 'dev:abc' };
  const till = browser('/kiwi-caisse.html', shared);
  const dash = browser('/dashboard.html', shared);
  await till.O.heartbeat(); await dash.O.heartbeat();
  const t = beats(till.sent)[0], d = beats(dash.sent)[0];
  assert.equal(t.payload.deviceId, 'dev:abc', 'la caisse garde l\'identifiant historique : sa ligne existe déjà côté serveur');
  assert.equal(t.payload.app, 'caisse');
  assert.equal(d.payload.deviceId, 'dev:abc:web');
  assert.equal(d.payload.app, 'dashboard');
  assert.notEqual(t.idempotencyKey, d.idempotencyKey, 'sans cela le serveur refuse le second comme doublon du premier');
});

await ok('1. rejoué contre le vrai Worker : les deux lignes existent, chacune avec sa propre app', async () => {
  const shared = { kiwiDeviceId: 'dev:samebrowser' };
  const till = browser('/kiwi-caisse.html', shared);
  const dash = browser('/dashboard.html', shared);
  for (const side of [dash, till]) {
    await side.O.heartbeat();
    const b = beats(side.sent)[0];
    const r = await post(ownerCookie, { ...b, merchant: MERCHANT });
    assert.equal(r.data.command && r.data.command.status, 'completed', JSON.stringify(r.data));
  }
  const f = await fleet();
  assert.equal(f.byId.get('dev:samebrowser').app, 'caisse');
  assert.equal(f.byId.get('dev:samebrowser:web').app, 'dashboard');
});

await ok('2. un battement forcé ne partage pas la clé de la tranche de cinq minutes', async () => {
  const { O, sent } = browser('/kiwi-caisse.html', { kiwiDeviceId: 'dev:k' });
  await O.heartbeat(); await O.heartbeat();
  await O.heartbeat(true); await new Promise((r) => setTimeout(r, 3)); await O.heartbeat(true);
  const keys = beats(sent).map((b) => b.idempotencyKey);
  assert.equal(keys[0], keys[1], 'deux battements ordinaires de la même tranche se confondent : c\'est voulu');
  assert.notEqual(keys[2], keys[0], 'le battement forcé passe');
  assert.notEqual(keys[2], keys[3], 'deux forcés successifs aussi');
});

await ok('2. le ticket d\'essai déclenche ce battement forcé (source)', () => {
  assert.match(browserSource, /beat\(true\)\.catch/);
});

await ok('la clé d\'idempotence reste sous la limite de 128 caractères même avec un identifiant long', async () => {
  const { O, sent } = browser('/dashboard.html', { kiwiDeviceId: 'dev:' + 'a'.repeat(76) });
  await O.heartbeat(true);
  assert.ok(beats(sent)[0].idempotencyKey.length <= 128, String(beats(sent)[0].idempotencyKey.length));
});

await ok('3. l\'appareil se décrit : système, navigateur, et pour une caisse l\'ID affiché en haut de la caisse', async () => {
  const till = browser('/kiwi-caisse.html', { kiwiDeviceId: 'dev:x', 'kiwi:caisse:terminal-id:v1': 'web_8f2a3cc8e2' });
  await till.O.heartbeat();
  assert.equal(beats(till.sent)[0].payload.label, 'iPad · Safari · ID 3CC8E2');
  const mac = browser('/dashboard.html', { kiwiDeviceId: 'dev:y' }, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 0);
  await mac.O.heartbeat();
  assert.equal(beats(mac.sent)[0].payload.label, 'Mac · Chrome');
  for (const b of [...beats(till.sent), ...beats(mac.sent)]) assert.ok(!/dev:/.test(b.payload.label), 'jamais l\'identifiant technique');
});

await ok('3. la page ne montre plus l\'identifiant technique en titre (source de la carte)', () => {
  assert.ok(!/var name = device\.label \|\| device\.deviceId;/.test(uiSource), 'l\'ancien repli sur deviceId a disparu');
  assert.match(uiSource, /\(c\.dvApp\[device\.app\] \|\| device\.app/);
});

console.log(`\n${failed ? '✗' : '✓'} terminaux-truth-test · ${passed} passés, ${failed} échoués`);
process.exit(failed ? 1 : 0);
