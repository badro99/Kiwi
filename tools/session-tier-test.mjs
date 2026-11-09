#!/usr/bin/env node
/* Kiwi · le palier d'une session, tenu par le serveur.
 *
 *   node tools/session-tier-test.mjs
 *
 * La session du compte reste ouverte sur l'appareil du comptoir. Quand une
 * réceptionniste ou un gérant déverrouille le tableau de bord avec SON code, le
 * serveur doit répondre à cet appareil à ce palier-là, et plus comme au patron :
 *   A. le middleware refuse les routes du patron (chiffre d'affaires, marges,
 *      paie, IA, clés…) sous le palier requis, et laisse le reste passer ;
 *   B. le palier vit en base, par appareil (sid) : un autre appareil du même
 *      compte n'est pas touché, et sans cookie de session on n'est personne ;
 *   C. /api/store : la réception lit l'équipe SANS les codes et ne peut pas la
 *      réécrire, ne lit ni la paie ni les charges, mais garde les réservations
 *      complètes (contacts des voyageurs) ;
 *   D. /api/config : la réception ne peut pas changer les codes de l'équipe ;
 *   E. un appareil d'avant le palier, ou une base pas migrée, garde son accès ;
 *   F. Face ID ne relève jamais le palier (sa marque vaut pour tout le compte),
 *      une forme bizarre du chemin ne contourne pas la carte, et appairer une
 *      caisse (qui lirait les documents de gestion) demande un gérant.
 * Tout est exécuté : vraies routes, vrai middleware, D1 node:sqlite. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { makeSession, SESS_COOKIE, tillToken } from '../functions/auth/_lib.js';
import { onRequest as gate } from '../functions/_middleware.js';
import { onRequestPost as pinVerify } from '../functions/api/pin/verify.js';
import { onRequestGet as storeGet, onRequestPost as storePost } from '../functions/api/store.js';
import { onRequestPost as configPost } from '../functions/api/config.js';
import { routeMinTier, sessionTier } from '../functions/auth/_session-tier.js';
import { onRequestPost as faceUnlock } from '../functions/api/pin/face.js';
import { faceMarkState } from '../functions/auth/_lib.js';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' · ' + detail : ''));
}
console.log('■ Palier de session (tools/session-tier-test.mjs)');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'session-tier-test-secret-32bytes!';
const SHOP = 'riad-palier';          // pas un slug de démo (voir DEMO_MERCHANTS)
const NEXT = 'NEXT-REACHED';

const SCHEMA = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
function freshEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return {
    sql: db,
    AUTH_SECRET: SECRET,
    DB: {
      prepare(q) {
        let args = [];
        const st = {
          bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
          async first() { const r = db.prepare(q).get(...args); return r === undefined ? null : r; },
          async all() { return { results: db.prepare(q).all(...args) }; },
          async run() { const r = db.prepare(q).run(...args); return { success: true, meta: { changes: r.changes } }; },
        };
        return st;
      },
      async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    },
  };
}

async function hotel() {
  const env = freshEnv();
  const now = Date.now();
  env.sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-r','r@riad.ma','R','Riad Palier','00','00',?)").run(now);
  env.sql.prepare("INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,updated_ts) VALUES (?,'{}','pro','hotel','acc-r','Riad Palier',?)").run(SHOP, now);
  const pin = (id, code, name, role) => env.sql.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)').run(id, SHOP, code, name, role, now);
  pin('p1', '4821', 'Patron', 'owner');
  pin('p2', '5930', 'Yassine', 'Réceptionniste');
  pin('p3', '6142', 'Karim', 'manager');
  const doc = (feature, data) => env.sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,1,?)').run(SHOP, feature, JSON.stringify(data), now);
  doc('team', { members: [{ id: 'm1', firstName: 'Yassine', function: 'Réceptionniste', pinCode: '5930', password: '5930' }], hours: {}, shifts: {} });
  doc('payroll', { runs: [{ month: '2026-10', total: 48210 }] });
  doc('charges', { items: [{ label: 'Loyer', amount: 18000 }] });
  doc('reservations', { items: [{ id: 'r1', name: 'Mme Alaoui', phone: '+212611223344', date: '2026-11-10' }] });
  const device = async () => {
    const token = await makeSession('acc-r', SECRET);
    return (url, init = {}) => new Request('https://kiwi.test' + url, {
      ...init, headers: { cookie: `${SESS_COOKIE}=${token}`, 'CF-Connecting-IP': '192.0.2.44', 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  };
  return { env, device };
}

async function unlock(env, req, code) {
  const res = await pinVerify({ request: req('/api/pin/verify', { method: 'POST', body: JSON.stringify({ pin: code }) }), env });
  return res.status;
}
async function through(env, request) {
  const res = await gate({ request, env, next: async () => new Response(NEXT, { status: 200 }) });
  const text = await res.clone().text();
  let body = null; try { body = JSON.parse(text); } catch (_) {}
  return { status: res.status, passed: text === NEXT, body };
}

/* ── A · le middleware ─────────────────────────────────────────────────── */
{
  const { env, device } = await hotel();
  const a = await device();

  const before = await through(env, a('/api/sales-summary?merchant=' + SHOP));
  ok('appareil sans palier inscrit (avant ce changement) : le chiffre d\'affaires passe comme avant', before.passed, JSON.stringify(before));

  ok('le code de la réceptionniste ouvre (200)', await unlock(env, a, '5930') === 200);
  for (const p of ['/api/sales-summary?merchant=' + SHOP, '/api/foodcost', '/api/pay-statements', '/api/month-report',
    '/api/ai/ask', '/api/hotel/performance?merchant=' + SHOP, '/api/hotel/channels?merchant=' + SHOP, '/api/agent/keys', '/api/invoices']) {
    const r = await through(env, a(p));
    ok(`réception : ${p.split('?')[0]} refusé (403 palier)`, r.status === 403 && r.body && r.body.error === 'tier' && r.body.tier === 'reception', JSON.stringify(r));
  }
  for (const p of ['/api/hotel/stays?merchant=' + SHOP, '/api/hotel/room-charges', '/api/clients', '/api/booking',
    '/api/inventory/internal-requests', '/api/me', '/api/config', '/api/store?feature=reservations']) {
    const r = await through(env, a(p));
    ok(`réception : ${p.split('?')[0]} passe`, r.passed, JSON.stringify(r));
  }

  ok('le code du gérant ouvre (200)', await unlock(env, a, '6142') === 200);
  ok('gérant : le chiffre d\'affaires passe', (await through(env, a('/api/sales-summary?merchant=' + SHOP))).passed);
  ok('gérant : l\'IA passe', (await through(env, a('/api/ai/ask'))).passed);
  const mFood = await through(env, a('/api/foodcost'));
  ok('gérant : les marges (foodcost) restent au patron', mFood.status === 403 && mFood.body.need === 'owner', JSON.stringify(mFood));
  const mPay = await through(env, a('/api/pay-statements'));
  ok('gérant : les bulletins de paie restent au patron', mPay.status === 403);

  ok('le code du patron ouvre (200)', await unlock(env, a, '4821') === 200);
  for (const p of ['/api/foodcost', '/api/pay-statements', '/api/sales-summary?merchant=' + SHOP, '/api/agent/keys'])
    ok(`patron : ${p.split('?')[0]} passe`, (await through(env, a(p))).passed);

  ok('un mauvais code ne change pas le palier', await unlock(env, a, '0000') === 401
    && (await sessionTier(a('/api/me'), env)).tier === 'owner');
}

/* ── B · par appareil, en base ─────────────────────────────────────────── */
{
  const { env, device } = await hotel();
  const desk = await device();
  const office = await device();
  await unlock(env, desk, '5930');
  ok('comptoir déverrouillé par la réception : refusé', (await through(env, desk('/api/sales-summary'))).status === 403);
  ok('le bureau du patron (autre appareil, même compte) n\'est pas touché', (await through(env, office('/api/sales-summary'))).passed);
  const naked = await through(env, new Request('https://kiwi.test/api/sales-summary', { headers: { 'CF-Connecting-IP': '192.0.2.44' } }));
  ok('sans cookie de session on n\'est personne (pas le patron)', !naked.passed && naked.status >= 300, String(naked.status));
}

/* ── C · /api/store ────────────────────────────────────────────────────── */
{
  const { env, device } = await hotel();
  const a = await device();
  await unlock(env, a, '5930');
  const get = async (feature) => {
    const res = await storeGet({ request: a('/api/store?feature=' + feature + '&merchant=' + SHOP), env });
    return { status: res.status, text: await res.text() };
  };
  const team = await get('team');
  ok('réception : l\'équipe se lit…', team.status === 200 && team.text.includes('Yassine'), team.text.slice(0, 120));
  ok('… sans aucun code personnel', !/5930/.test(team.text), team.text.slice(0, 200));
  const write = await storePost({ request: a('/api/store', { method: 'POST', body: JSON.stringify({ feature: 'team', merchant: SHOP, data: { members: [] }, rev: 1 }) }), env });
  ok('réception : réécrire l\'équipe est refusé (403)', write.status === 403);
  const stillThere = env.sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='team'").get(SHOP);
  ok('… et les codes de l\'équipe sont toujours en base', /5930/.test(stillThere.data));
  for (const f of ['payroll', 'charges']) {
    const r = await get(f);
    ok(`réception : « ${f} » refusé (403)`, r.status === 403 && !/48210|18000/.test(r.text), r.status + ' ' + r.text.slice(0, 80));
  }
  const resa = await get('reservations');
  ok('réception : les réservations restent complètes (téléphone du voyageur)', resa.status === 200 && resa.text.includes('+212611223344'), resa.text.slice(0, 160));

  await unlock(env, a, '6142');
  const mTeam = await get('team');
  ok('gérant : l\'équipe avec ses codes (il la gère, comme avant)', mTeam.status === 200 && /5930/.test(mTeam.text));
  ok('gérant : la paie se lit (planning)', (await get('payroll')).status === 200);

  /* Une caisse appairée sur le même appareil lit ce que le comptoir lit déjà. */
  const till = await tillToken(SECRET, SHOP);
  const tillRes = await storeGet({ request: new Request('https://kiwi.test/api/store?feature=charges&merchant=' + SHOP, { headers: { cookie: 'kiwi_till=' + till } }), env });
  ok('une caisse appairée seule garde ses règles d\'aujourd\'hui (lit les charges, expurgées)', tillRes.status === 200, String(tillRes.status));
}

/* ── D · /api/config : les codes de l'équipe ───────────────────────────── */
{
  const { env, device } = await hotel();
  const a = await device();
  await unlock(env, a, '5930');
  const res = await configPost({ request: a('/api/config', { method: 'POST', body: JSON.stringify({ merchant: SHOP, pins: [{ id: 'p9', name: 'Yassine', role: 'owner', code: '1111' }] }) }), env });
  ok('réception : publier des codes d\'équipe est refusé (403)', res.status === 403, String(res.status));
  const rows = env.sql.prepare('SELECT pin FROM staff_pins WHERE merchant = ? ORDER BY id').all(SHOP).map((r) => r.pin);
  ok('… et aucun code n\'a bougé', !rows.includes('1111') && rows.includes('4821'), rows.join(','));
}

/* ── E · compatibilité ─────────────────────────────────────────────────── */
{
  const { env, device } = await hotel();
  const a = await device();
  env.sql.exec('DROP TABLE session_tiers');
  ok('base pas encore migrée : le code de réception ouvre quand même', await unlock(env, a, '5930') === 200);
  ok('base pas encore migrée : comportement d\'avant (rien ne casse au déploiement)', (await through(env, a('/api/sales-summary'))).passed);
  ok('la carte des routes : rien d\'autre que les routes du patron', routeMinTier('/api/hotel/stays') === '' && routeMinTier('/api/feed') === ''
    && routeMinTier('/api/store') === '' && routeMinTier('/api/pin/verify') === '' && routeMinTier('/api/ai/menu-translate') === 'manager');
}

/* ── F · Face ID, forme du chemin, appairage ──────────────────────────── */
{
  const { env, device } = await hotel();
  const a = await device();
  const face = async (req, access) => {
    const st = await faceMarkState(req('/api/me'), env, access);
    const res = await faceUnlock({ request: req('/api/pin/face', { method: 'POST', body: JSON.stringify({ access, mark: st.mark }) }), env });
    return res.status;
  };
  await unlock(env, a, '5930');
  ok('une marque Face ID patron valide répond 200…', await face(a, 'owner') === 200);
  ok('… mais ne relève pas le comptoir de la réception au patron', (await sessionTier(a('/api/me'), env)).tier === 'reception'
    && (await through(env, a('/api/sales-summary'))).status === 403);
  ok('remonter demande un code : le code du patron relève', await unlock(env, a, '4821') === 200
    && (await through(env, a('/api/sales-summary'))).passed);
  ok('Face ID gérant baisse un appareil patron au gérant', await face(a, 'manager') === 200
    && (await sessionTier(a('/api/me'), env)).tier === 'manager' && (await through(env, a('/api/foodcost'))).status === 403);

  await unlock(env, a, '5930');
  for (const p of ['/api/sales-summary/', '//api//sales-summary', '/api/sales%2Dsummary', '/API/Sales-Summary', '/api/ai/', '/api/ai'])
    ok(`réception : « ${p} » reste refusé`, routeMinTier(p) !== '' && (await through(env, a(p))).status === 403, routeMinTier(p));
  /* À mi-vie, un chargement de page renouvelle le cookie : le palier passe avant. */
  const realNow = Date.now;
  Date.now = () => realNow() + 20 * 86400 * 1000;
  let doc;
  try { doc = await through(env, a('/api/sales-summary', { headers: { 'Sec-Fetch-Dest': 'document' } })); } finally { Date.now = realNow; }
  ok('réception : la route du patron ouverte comme une page, à mi-vie du cookie, reste refusée', doc.status === 403 && !doc.passed, JSON.stringify(doc));
  const pair = await through(env, a('/api/pair/create', { method: 'POST', body: '{}' }));
  ok('réception : appairer une caisse est refusé (403)', pair.status === 403 && pair.body.need === 'manager', JSON.stringify(pair));
  const fresh = await device();
  ok('un appareil du patron (sans palier inscrit) appaire toujours', (await through(env, fresh('/api/pair/create', { method: 'POST', body: '{}' }))).passed);
}

if (failures) { console.log(`\n✗ ${failures} échec(s)`); process.exit(1); }
console.log('\n✓ palier de session tenu');
