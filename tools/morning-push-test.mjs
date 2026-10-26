#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* « Le point du matin » : push d'ouverture avec le total d'hier.
 *
 * Passe par les vraies routes (morning.js, register.js, _dispatch.js) sur une
 * base SQLite au schéma réel, avec fetch remplacé : aucun appel réseau, aucune
 * vraie clé. La clé APNs est une clé P-256 jetable générée ici. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const morning = await import(pathToFileURL(path.join(ROOT, 'functions/api/push/morning.js')).href);
const dispatch = await import(pathToFileURL(path.join(ROOT, 'functions/api/push/_dispatch.js')).href);
const register = await import(pathToFileURL(path.join(ROOT, 'functions/api/push/register.js')).href);
const lib = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);
const worker = await import(pathToFileURL(path.join(ROOT, 'workers/morning-push/index.js')).href);

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const realFetch = globalThis.fetch;
const SECRET = 'morning-test-secret-0123456789abcdef';
const AUTH_SECRET = 'morning-auth-secret-0123456789abcdef';
const hex = (c) => c.repeat(64);
const TOK = { a: hex('a'), caisse: hex('b'), b: hex('c'), c: hex('d'), android: hex('e'), dead: hex('f') };

// Une clé P-256 jetable au format .p8 (PKCS8 PEM).
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
const APNS = { APNS_KEY_ID: 'KEYID12345', APNS_TEAM_ID: 'TEAMID6789', APNS_PRIVATE_KEY: PEM };

// Casablanca est à UTC en octobre : 05:35 le 14/10/2026 = 05:35Z. La journée
// close est donc le 13/10 : [13/10 05:00Z, 14/10 05:00Z).
const NOW = Date.parse('2026-10-14T05:35:00Z');
const iso = (s) => Date.parse(s);

function database({ legacyTokens = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  if (legacyTokens) db.exec('ALTER TABLE push_tokens DROP COLUMN lang');
  db.exec('DROP TABLE IF EXISTS push_morning_sent'); // créée à la volée, comme en production
  const env = {
    AUTH_SECRET,
    DB: {
      prepare(q) {
        const st = db.prepare(q);
        const bound = (p) => ({
          async first() { const row = st.get(...p); return row === undefined ? null : row; },
          async all() { return { results: st.all(...p) }; },
          async run() { const r = st.run(...p); return { meta: { changes: Number(r.changes) }, success: true }; },
        });
        return Object.assign(bound([]), { bind: (...p) => bound(p) });
      },
    },
  };
  return { db, env };
}

let saleSeq = 0;
function sale(db, merchant, ts, cents, extra = {}) {
  const whole = Math.round(cents / 100);
  db.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, ts, void_ts) VALUES (?,?,?,?,?,?,?)`)
    .run(`s${++saleSeq}`, merchant, extra.legacy ? whole : whole, extra.legacy ? null : cents, 'cash', ts, extra.void ? ts + 1 : null);
}
function token(db, merchant, tok, role = 'dashboard', platform = 'ios', lang = null) {
  const cols = lang === null ? '' : ', lang';
  db.prepare(`INSERT INTO push_tokens (merchant, token, role, platform, created_at, updated_at${cols}) VALUES (?,?,?,?,?,?${lang === null ? '' : ',?'})`)
    .run(...[merchant, tok, role, platform, 1, 1].concat(lang === null ? [] : [lang]));
}
function seed(db) {
  // shop-a : 1 000 + 3 230,50 + 50 (ancienne ligne en MAD entiers) - 20 (remboursement) = 4 260,50, 3 ventes
  sale(db, 'shop-a', iso('2026-10-13T05:00:00Z'), 100000);           // 05:00 pile : dans la journée
  sale(db, 'shop-a', iso('2026-10-14T02:00:00Z'), 323050);           // 03:00 le 14 : encore la journée du 13
  sale(db, 'shop-a', iso('2026-10-13T12:00:00Z'), 5000, { legacy: true });
  sale(db, 'shop-a', iso('2026-10-13T13:00:00Z'), -2000);            // remboursement : net, non compté
  sale(db, 'shop-a', iso('2026-10-13T04:59:59Z'), 99900);            // 04:59:59 : veille, exclue
  sale(db, 'shop-a', iso('2026-10-14T05:00:00Z'), 50000);            // 05:00 le 14 : aujourd'hui, exclue
  sale(db, 'shop-a', iso('2026-10-13T15:00:00Z'), 77700, { void: true }); // annulée : hors livres
  // shop-b : rien hier, une vente aujourd'hui
  sale(db, 'shop-b', iso('2026-10-14T05:10:00Z'), 12000);
  // shop-c : une vente hier, appareil en anglais
  sale(db, 'shop-c', iso('2026-10-13T10:00:00Z'), 12000);
  token(db, 'shop-a', TOK.a, 'dashboard', 'ios', '');
  token(db, 'shop-a', TOK.caisse, 'caisse', 'ios', '');
  token(db, 'shop-a', TOK.android, 'dashboard', 'android', '');
  token(db, 'shop-b', TOK.b, 'dashboard', 'ios', '');
  token(db, 'shop-c', TOK.c, 'dashboard', 'ios', 'en');
}

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  return calls;
}
const apnsOk = () => new Response('', { status: 200 });
const apnsError = (status, reason) => new Response(JSON.stringify({ reason }), { status, headers: { 'content-type': 'application/json' } });
const tokenOf = (call) => call.url.split('/3/device/')[1];
const bodyOf = (call) => JSON.parse(call.init.body);
const flat = (s) => String(s).replace(/ | /g, ' ');
const post = (secret) => new Request('https://k/api/push/morning', { method: 'POST', headers: secret == null ? {} : { 'X-Kiwi-Morning-Secret': secret } });
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

try {
  console.log('■ Le point du matin · accès à la route');
  {
    const { env } = database();
    const calls = stubFetch(apnsOk);
    let res = await morning.onRequestPost({ request: post(SECRET), env: { ...env, ...APNS } });
    ok('sans MORNING_PUSH_SECRET côté serveur : 503', res.status === 503);
    res = await morning.onRequestPost({ request: post('mauvais-secret'), env: { ...env, ...APNS, MORNING_PUSH_SECRET: SECRET } });
    ok('mauvais secret : 401', res.status === 401);
    res = await morning.onRequestPost({ request: post(null), env: { ...env, ...APNS, MORNING_PUSH_SECRET: SECRET } });
    ok('en-tête absent : 401', res.status === 401);
    res = await morning.onRequestPost({ request: post(SECRET.slice(0, -1)), env: { ...env, ...APNS, MORNING_PUSH_SECRET: SECRET } });
    ok('préfixe du secret : 401', res.status === 401);
    ok('le comparateur est vrai pour le bon secret seulement', await morning.secretMatches(SECRET, SECRET) && !(await morning.secretMatches(SECRET, SECRET + 'x')));
    res = await morning.onRequestGet();
    ok('GET : 405', res.status === 405);
    ok('rien n\'est parti sur ces refus', calls.length === 0);
    const mw = fs.readFileSync(path.join(ROOT, 'functions/_middleware.js'), 'utf8');
    ok('la porte du site laisse passer ce POST exact (le Worker n\'a pas de session)', /method === 'POST' && path === '\/api\/push\/morning'\) return next\(\)/.test(mw));
  }

  console.log('■ Le point du matin · APNs non configuré : aucun envoi, aucune erreur');
  {
    const { db, env } = database();
    seed(db);
    const calls = stubFetch(apnsOk);
    const res = await morning.onRequestPost({ request: post(SECRET), env: { ...env, MORNING_PUSH_SECRET: SECRET } });
    const body = await res.json();
    ok('200 et rien envoyé', res.status === 200 && body.ok === true && body.sent === 0 && body.skipped['gateway-unconfigured'] === 1, JSON.stringify(body));
    ok('fetch jamais appelé', calls.length === 0);
    const partial = await morning.runMorningPush({ ...env, APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' }, NOW);
    ok('une clé APNs incomplète vaut non configuré', partial.sent === 0 && calls.length === 0);
    ok('aucun marqueur posé', db.prepare("SELECT name FROM sqlite_master WHERE name = 'push_morning_sent'").get() === undefined);
  }

  console.log('■ Le point du matin · journée commerciale, annulations, jours sans vente');
  let sharedDb, sharedEnv, sharedCalls;
  {
    const { db, env } = database();
    seed(db);
    sharedDb = db; sharedEnv = { ...env, ...APNS, MORNING_PUSH_SECRET: SECRET };
    dispatch.resetApnsJwtCache();
    sharedCalls = stubFetch(apnsOk);
    const out = await morning.runMorningPush(sharedEnv, NOW);
    const byToken = Object.fromEntries(sharedCalls.map((c) => [tokenOf(c), c]));
    ok('deux magasins notifiés, un seul appareil chacun', out.sent === 2 && sharedCalls.length === 2 && !!byToken[TOK.a] && !!byToken[TOK.c], JSON.stringify(out));
    const a = byToken[TOK.a] && bodyOf(byToken[TOK.a]).aps.alert;
    ok('total de la journée 05:00 à 05:00, annulée et veille exclues, remboursement soustrait', a && flat(a.body) === 'Hier : 4 260,50 MAD · 3 ventes', a && a.body);
    ok('titre français par défaut', a && a.title === 'Le point du matin');
    const c = byToken[TOK.c] && bodyOf(byToken[TOK.c]).aps.alert;
    ok('la langue stockée de l\'appareil est respectée (anglais)', c && c.title === 'Morning briefing' && flat(c.body) === 'Yesterday: 120 MAD · 1 sale', c && c.body);
    ok('un magasin sans vente hier est sauté (pas de « 0 »)', !byToken[TOK.b] && out.skipped['no-sales'] === 1);
    ok('la caisse et l\'Android du même magasin ne reçoivent rien', !byToken[TOK.caisse] && !byToken[TOK.android]);
    ok('une ligne de marqueur par magasin notifié', sharedDb.prepare('SELECT COUNT(*) AS n FROM push_morning_sent').get().n === 2
      && sharedDb.prepare("SELECT day FROM push_morning_sent WHERE merchant = 'shop-a'").get().day === '2026-10-13');
    ok('aucun montant ni jeton dans la réponse', !JSON.stringify(out).includes(TOK.a) && !/MAD|4260/.test(JSON.stringify(out)));
  }

  console.log('■ Le point du matin · idempotence');
  {
    const before = sharedCalls.length;
    const again = await morning.runMorningPush(sharedEnv, NOW + 60 * 1000);
    ok('deuxième appel le même jour : rien envoyé', again.sent === 0 && sharedCalls.length === before && again.skipped['already-sent'] === 2, JSON.stringify(again));
    const nextCalls = stubFetch(apnsOk);
    const tomorrow = await morning.runMorningPush(sharedEnv, NOW + 24 * 3600 * 1000);
    const nextTokens = nextCalls.map(tokenOf).sort();
    ok('le lendemain, la journée du 14 est évaluée à part (shop-a et shop-b, pas shop-c)',
      tomorrow.sent === 2 && nextTokens.join() === [TOK.a, TOK.b].sort().join()
      && flat(bodyOf(nextCalls.find((c) => tokenOf(c) === TOK.a)).aps.alert.body) === 'Hier : 500 MAD · 1 vente', JSON.stringify(tomorrow));
    ok('le marqueur de la veille reste, celui du jour s\'ajoute', sharedDb.prepare('SELECT COUNT(*) AS n FROM push_morning_sent WHERE day = ?').get('2026-10-13').n === 2
      && sharedDb.prepare('SELECT COUNT(*) AS n FROM push_morning_sent WHERE day = ?').get('2026-10-14').n === 2);
  }

  console.log('■ APNs · requête, jeton fournisseur');
  {
    const call = sharedCalls[0];
    const h = call.init.headers;
    ok('POST sur api.push.apple.com/3/device/<jeton>', call.init.method === 'POST' && call.url === `https://api.push.apple.com/3/device/${tokenOf(call)}`);
    ok('apns-topic, push-type alert, priorité 10', h['apns-topic'] === 'com.kiwios.pro' && h['apns-push-type'] === 'alert' && h['apns-priority'] === '10');
    const jwt = String(h.authorization).replace(/^bearer /, '');
    const [hh, cc, ss] = jwt.split('.');
    const header = JSON.parse(b64(hh).toString()), claims = JSON.parse(b64(cc).toString());
    ok('en-tête JWT : ES256 et kid', header.alg === 'ES256' && header.kid === 'KEYID12345');
    ok('revendications : iss = équipe, iat récent', claims.iss === 'TEAMID6789' && Math.abs(claims.iat - Math.floor(Date.now() / 1000)) < 120);
    const sig = b64(ss);
    ok('signature brute r||s de 64 octets', sig.length === 64);
    ok('la signature se vérifie avec la clé publique', await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, sig, new TextEncoder().encode(`${hh}.${cc}`)));
    ok('le même jeton fournisseur sert tous les envois (cache)', sharedCalls.every((c) => c.init.headers.authorization === h.authorization));
    const first = await dispatch.apnsJwt({ ...APNS });
    ok('apnsJwt rend le jeton en cache', first === jwt);
    ok('payload : alerte + son, sans jeton', bodyOf(call).aps.sound === 'default' && !call.init.body.includes(tokenOf(call)));
    ok('sandbox : APNS_SANDBOX=1 vise api.sandbox.push.apple.com',
      dispatch.apnsHost({ APNS_SANDBOX: '1' }) === 'https://api.sandbox.push.apple.com'
      && dispatch.apnsHost({ APNS_SANDBOX: 'true' }) === 'https://api.sandbox.push.apple.com'
      && dispatch.apnsHost({ APNS_SANDBOX: '0' }) === 'https://api.push.apple.com'
      && dispatch.apnsHost({}) === 'https://api.push.apple.com');
    const pem = await dispatch.apnsJwt({ ...APNS, APNS_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') }, Date.now() + 3 * 3600 * 1000);
    ok('un PEM aux « \\n » littéraux est accepté, et un jeton expiré est refait', typeof pem === 'string' && pem !== jwt);
  }

  console.log('■ APNs · jetons morts supprimés, pannes passagères rejouables');
  {
    const { db, env } = database();
    seed(db);
    token(db, 'shop-a', TOK.dead, 'dashboard', 'ios', '');
    const full = { ...env, ...APNS };
    dispatch.resetApnsJwtCache();
    stubFetch((url) => url.endsWith(TOK.dead) ? apnsError(410, 'Unregistered') : apnsOk());
    let out = await morning.runMorningPush(full, NOW);
    ok('410 : le jeton est retiré de push_tokens, les autres restent',
      db.prepare('SELECT COUNT(*) AS n FROM push_tokens WHERE token = ?').get(TOK.dead).n === 0
      && db.prepare('SELECT COUNT(*) AS n FROM push_tokens WHERE token = ?').get(TOK.a).n === 1 && out.removed === 1, JSON.stringify(out));

    const second = database();
    seed(second.db);
    token(second.db, 'shop-a', TOK.dead, 'dashboard', 'ios', '');
    stubFetch((url) => url.endsWith(TOK.dead) ? apnsError(400, 'BadDeviceToken') : apnsOk());
    out = await morning.runMorningPush({ ...second.env, ...APNS }, NOW);
    ok('400 BadDeviceToken : retiré aussi', second.db.prepare('SELECT COUNT(*) AS n FROM push_tokens WHERE token = ?').get(TOK.dead).n === 0);

    const third = database();
    seed(third.db);
    stubFetch(() => apnsError(400, 'PayloadEmpty'));
    out = await morning.runMorningPush({ ...third.env, ...APNS }, NOW);
    ok('une autre erreur 400 ne supprime aucun jeton', third.db.prepare("SELECT COUNT(*) AS n FROM push_tokens").get().n === 5, JSON.stringify(out));

    const fourth = database();
    seed(fourth.db);
    stubFetch(() => apnsError(503, 'ServiceUnavailable'));
    out = await morning.runMorningPush({ ...fourth.env, ...APNS }, NOW);
    ok('panne passagère : le marqueur est rendu, rien n\'est perdu', out.sent === 0 && fourth.db.prepare('SELECT COUNT(*) AS n FROM push_morning_sent').get().n === 0);
    const retryCalls = stubFetch(apnsOk);
    out = await morning.runMorningPush({ ...fourth.env, ...APNS }, NOW + 1000);
    ok('un nouvel appel du même jour réessaie et réussit', out.sent === 2 && retryCalls.length === 2);

    const fifth = database();
    seed(fifth.db);
    stubFetch(apnsOk);
    dispatch.resetApnsJwtCache();
    out = await morning.runMorningPush({ ...fifth.env, ...APNS, APNS_PRIVATE_KEY: 'pas une clé' }, NOW);
    ok('clé illisible : échec doux, aucun plantage, pas de fuite', out.ok === true && out.sent === 0 && !JSON.stringify(out).includes('pas une clé'));
  }

  console.log('■ Bases en retard sur schema.sql');
  {
    const { db, env } = database({ legacyTokens: true });
    for (const [m, ts, cents] of [['shop-a', iso('2026-10-13T10:00:00Z'), 50000]]) sale(db, m, ts, cents);
    db.prepare("INSERT INTO push_tokens (merchant, token, role, platform, created_at, updated_at) VALUES ('shop-a', ?, 'dashboard', 'ios', 1, 1)").run(TOK.a);
    const calls = stubFetch(apnsOk);
    const out = await morning.runMorningPush({ ...env, ...APNS }, NOW);
    ok('sans colonne lang : envoyé en français', out.sent === 1 && flat(bodyOf(calls[0]).aps.alert.body) === 'Hier : 500 MAD · 1 vente', JSON.stringify(out));
  }
  {
    const { env } = database();
    const noTable = { ...env, DB: { prepare: () => { throw new Error('no such table: push_tokens'); } }, ...APNS };
    stubFetch(apnsOk);
    const out = await morning.runMorningPush(noTable, NOW);
    ok('sans table push_tokens : saut propre', out.ok === true && out.sent === 0);
    const event = await dispatch.dispatchPushEvent(noTable, 'shop-a', { role: 'caisse' });
    ok('dispatchPushEvent : table absente, saut propre', event.skipped === 'table-unavailable');
  }

  console.log('■ Dispatch d\'évènement : envoi réel aux seuls appareils iOS');
  {
    const { db, env } = database();
    token(db, 'shop-a', TOK.caisse, 'caisse', 'ios', '');
    token(db, 'shop-a', TOK.android, 'caisse', 'android', '');
    token(db, 'shop-a', TOK.dead, 'caisse', 'ios', '');
    const calls = stubFetch((url) => url.endsWith(TOK.dead) ? apnsError(410, 'Unregistered') : apnsOk());
    const out = await dispatch.dispatchPushEvent({ ...env, ...APNS }, 'shop-a', { role: 'caisse', title: 'Commande', body: 'Table 4' });
    ok('iOS seulement, le jeton mort est retiré', out.sent === 1 && out.removed === 1 && calls.length === 2
      && db.prepare('SELECT COUNT(*) AS n FROM push_tokens').get().n === 2, JSON.stringify(out));
    const fcmOnly = await dispatch.dispatchPushEvent({ ...env, FCM_PROJECT_ID: 'p', FCM_SERVICE_ACCOUNT: 's' }, 'shop-a', { role: 'caisse' });
    ok('FCM reste un saut propre', fcmOnly.sent === 0 && !!fcmOnly.skipped);
    globalThis.fetch = realFetch;
    const noop = await dispatch.dispatchPushEvent(env, 'shop-a', { role: 'caisse' });
    ok('sans clé APNs ni FCM : rien, gateway-unconfigured', noop.skipped === 'gateway-unconfigured');
  }

  console.log('■ Inscription : rôle dashboard et langue');
  {
    const { db, env } = database();
    db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-m','o@morning.test','Shop M','s','h',?,'active')`).run(Date.now());
    db.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES ('shop-m','{}','boutique','acc-m','Shop M','active',0,?)`).run(Date.now());
    const owner = lib.sessionCookie(await lib.makeSession('acc-m', AUTH_SECRET)).split(';')[0];
    const reg = (body) => register.onRequestPost({ env, request: new Request('https://k/api/push/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: owner }, body: JSON.stringify(body) }) });
    let res = await reg({ merchant: 'shop-m', token: TOK.a, platform: 'ios', role: 'dashboard', lang: 'ar' });
    let row = db.prepare('SELECT role, lang FROM push_tokens WHERE token = ?').get(TOK.a);
    ok('le propriétaire inscrit un jeton dashboard avec sa langue', res.status === 200 && row.role === 'dashboard' && row.lang === 'ar');
    res = await reg({ merchant: 'shop-m', token: TOK.a, platform: 'ios', role: 'dashboard' });
    ok('sans langue, la langue déjà stockée reste', res.status === 200 && db.prepare('SELECT lang FROM push_tokens WHERE token = ?').get(TOK.a).lang === 'ar');
    res = await reg({ merchant: 'shop-m', token: TOK.a, platform: 'ios', role: 'dashboard', lang: 'xx' });
    ok('une langue inconnue est ignorée', res.status === 200 && db.prepare('SELECT lang FROM push_tokens WHERE token = ?').get(TOK.a).lang === 'ar');
    res = await reg({ merchant: 'shop-m', token: TOK.a, action: 'unregister' });
    ok('désactiver la bascule supprime le jeton', res.status === 200 && (await res.json()).unregistered === true && db.prepare('SELECT COUNT(*) AS n FROM push_tokens').get().n === 0);

    db.exec('ALTER TABLE push_tokens DROP COLUMN lang');
    res = await reg({ merchant: 'shop-m', token: TOK.b, platform: 'ios', role: 'dashboard', lang: 'en' });
    ok('base ancienne : l\'inscription réussit et la colonne langue est ajoutée', res.status === 200
      && db.prepare('SELECT lang FROM push_tokens WHERE token = ?').get(TOK.b).lang === 'en');
  }

  console.log('■ Texte et Worker');
  {
    const all = ['fr', 'en', 'ar'].flatMap((l) => Object.values(morning.morningMessage(l, 123456, 7)));
    ok('aucun tiret cadratin dans les trois langues', all.every((t) => !t.includes('—')));
    ok('pluriel et décimales', flat(morning.morningMessage('fr', 100000, 1).body) === 'Hier : 1 000 MAD · 1 vente'
      && morning.morningMessage('en', 123456, 2).body === 'Yesterday: 1,234.56 MAD · 2 sales');
    ok('langue inconnue : français', morning.morningMessage('de', 100, 1).title === 'Le point du matin');
    const at = (s) => worker.inSendWindow(new Date(s));
    ok('après réforme : 05:30Z passe, 04:30Z non', at('2026-10-14T05:30:00Z') && !at('2026-10-14T04:30:00Z'));
    ok('Ramadan (UTC+0) : 04:30Z (04:30) non, 05:30Z (05:30) passe', !at('2026-03-10T04:30:00Z') && at('2026-03-10T05:30:00Z'));
    const calls = stubFetch(() => Response.json({ ok: true, sent: 3 }));
    let r = await worker.run({ MORNING_PUSH_SECRET: SECRET }, new Date('2026-10-14T05:31:00Z'));
    ok('dans la fenêtre : un POST avec le secret et rien d\'autre',
      r.sent === 3 && calls.length === 1 && calls[0].url === 'https://kiwi-os.com/api/push/morning'
      && calls[0].init.method === 'POST' && calls[0].init.headers['X-Kiwi-Morning-Secret'] === SECRET && !calls[0].init.body);
    r = await worker.run({ MORNING_PUSH_SECRET: SECRET }, new Date('2026-10-14T06:31:00Z'));
    ok('hors fenêtre : aucun appel', r.skipped === 'outside-window' && calls.length === 1);
    let threw = false;
    try { await worker.run({}, new Date('2026-10-14T04:31:00Z')); } catch (_) { threw = true; }
    ok('sans secret le Worker refuse de partir', threw);
    const toml = fs.readFileSync(path.join(ROOT, 'workers/morning-push/wrangler.toml'), 'utf8');
    ok('wrangler.toml : cron en UTC avec la note Ramadan', /crons = \["30 4 \* \* \*", "30 5 \* \* \*"\]/.test(toml) && /Ramadan/.test(toml));
  }

  console.log('■ Coque iOS et page : câblage statique');
  {
    const read = (f) => coreTestSource.readFileSync(path.join(ROOT, f), 'utf8');
    const ent = read('app/ios/App/App/App.entitlements'), proj = read('app/ios/App/App.xcodeproj/project.pbxproj');
    const shell = read('app/ios/App/App/KiwiNativeShell.swift'), appDelegate = read('app/ios/App/App/AppDelegate.swift');
    const scene = read('app/ios/App/App/SceneDelegate.swift'), ui = read('assets/interactive.js');
    ok('App.entitlements porte aps-environment', /<key>aps-environment<\/key>\s*<string>development<\/string>/.test(ent));
    ok('le projet Xcode signe avec ces droits (Debug et Release) et référence le fichier',
      (proj.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length === 2 && /path = App\.entitlements;/.test(proj));
    ok('la permission n\'est demandée que sur {push:"enable"}, jamais au lancement',
      /case "enable":[\s\S]*requestAuthorization/.test(shell) && !/requestAuthorization/.test(appDelegate + scene)
      && /registerForRemoteNotifications\(\)/.test(shell) && !/registerForRemoteNotifications/.test(appDelegate));
    ok('AppDelegate remet le jeton en hexadécimal à la coque', /didRegisterForRemoteNotificationsWithDeviceToken/.test(appDelegate) && /%02x/.test(appDelegate));
    ok('l\'hôte annonce la capacité push avant tout script de page', /Object\.freeze\(\{sheet:1,push:1\}\)/.test(scene));
    ok('fond de la vue web aligné sur l\'écran de lancement (WebKit 215479)', /isOpaque = false/.test(scene) && /underPageBackgroundColor = launchGround/.test(scene));
    ok('la page ne parle à la coque qu\'à la demande du propriétaire, en rôle dashboard',
      /'settings-morning'/.test(ui) && /postMessage\(\{ push: 'enable' \}\)/.test(ui) && /role: 'dashboard'/.test(ui) && /action: 'unregister'/.test(ui));
    ok('désactivé par défaut : aucun état stocké, aucun appel natif au chargement',
      /kiwiMorningPush/.test(ui) && /if \(native\(\) && read\(\)\) setTimeout\(refresh/.test(ui));
    ok('FR, EN et AR pour la bascule', ['Le point du matin', 'Morning briefing', 'ملخص الصباح'].every((t) => ui.includes(t)));
  }
} finally {
  globalThis.fetch = realFetch;
}

console.log(`\nmorning-push-test: ${passed} passés, ${failed} échoués`);
process.exit(failed ? 1 : 0);
