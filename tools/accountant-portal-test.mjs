#!/usr/bin/env node
/* Espace comptable : l'expert-comptable lit les livres d'UN magasin, sans rien
 * pouvoir écrire, et son cookie n'ouvre rien d'autre.
 *
 * Ce banc passe par les vraies routes (access, session, books) et par les vraies
 * routes voisines que le cookie ne doit PAS ouvrir (store, sale, push/register,
 * pair/devices, month-report), sur une base SQLite au schéma réel. Il tient :
 *   - le jeton n'est rendu qu'une fois et seule son empreinte est stockée ;
 *   - l'échange pose le cookie, limité en essais, et ne le met pas dans le jeton ;
 *   - les lectures sont celles de CE magasin (un autre magasin : 403) ;
 *   - le cookie comptable n'est honoré nulle part ailleurs ;
 *   - POST/PUT/PATCH/DELETE sur les livres : 405, et aucune donnée ne bouge ;
 *   - accès révoqué ou expiré : 401 ; une caisse ne peut pas inviter ;
 *   - la coupure de 05:00, y compris en fin de mois ;
 *   - aucune réponse ne porte de champ ou de valeur ressemblant à un secret ;
 *   - la production en retard sur schema.sql ;
 *   - la porte du site (middleware) : exactement trois entrées ouvertes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);
const access = await import(pathToFileURL(path.join(ROOT, 'functions/api/comptable/access.js')).href);
const session = await import(pathToFileURL(path.join(ROOT, 'functions/api/comptable/session.js')).href);
const books = await import(pathToFileURL(path.join(ROOT, 'functions/api/comptable/books.js')).href);
const store = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')).href);
const sale = await import(pathToFileURL(path.join(ROOT, 'functions/api/sale.js')).href);
const pushRegister = await import(pathToFileURL(path.join(ROOT, 'functions/api/push/register.js')).href);
const devices = await import(pathToFileURL(path.join(ROOT, 'functions/api/pair/devices.js')).href);
const monthReport = await import(pathToFileURL(path.join(ROOT, 'functions/api/month-report.js')).href);
const priv = await import(pathToFileURL(path.join(ROOT, 'functions/api/_private.js')).href);
const middleware = await import(pathToFileURL(path.join(ROOT, 'functions/_middleware.js')).href);

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const SECRET = 'accountant-portal-secret-0123456789';
const SHOP = 'compta-shop', OTHER = 'other-shop';
const now = Date.now();
const iso = (s) => Date.parse(s);

function database({ dropZ = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const acc = db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES (?,?,?,'s','h',?,'active')`);
  acc.run('acc-a', 'a@compta.test', 'Compta Shop', now);
  acc.run('acc-b', 'b@other.test', 'Other Shop', now);
  const cfg = db.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','boutique',?,?,'active',0,?)`);
  cfg.run(SHOP, 'acc-a', 'Compta Shop', now);
  cfg.run(OTHER, 'acc-b', 'Other Shop', now);
  db.prepare(`INSERT INTO operators (id,label,salt,hash,created_ts) VALUES ('op-test1','Test','s','h',?)`).run(now);

  const ins = db.prepare(`INSERT INTO sales (id,merchant,amount,amount_cents,method,label,ref,ts,channel,payment_parts,void_ts,void_reason,void_note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const S = (id, merchant, cents, method, ts, extra = {}) => ins.run(
    id, merchant, extra.legacy != null ? extra.legacy : Math.round(cents / 100), extra.legacy != null ? null : cents, method,
    extra.label || null, extra.ref || ('R-' + id), iso(ts), extra.channel || null, extra.parts || null,
    extra.voidTs || null, extra.reason || null, extra.note || null);
  S('s0', SHOP, 99900, 'cash', '2026-09-30T12:00:00Z');                    // septembre : hors période
  S('s1', SHOP, 1000, 'cash', '2026-10-10T03:59:59Z');                     // 04:59:59 locale : jour du 9
  S('s2', SHOP, 2000, 'card', '2026-10-10T04:00:00Z', { label: 'Mme Client 0612345678' }); // 05:00:00 : jour du 10
  S('s3', SHOP, 5000, 'cash', '2026-10-10T15:00:00Z', { legacy: 50 });     // ligne d'avant les centimes
  S('s4', SHOP, -500, 'cash', '2026-10-10T16:00:00Z', { channel: 'refund' });
  S('s5', SHOP, 700, 'cash', '2026-10-10T17:00:00Z', { voidTs: iso('2026-10-10T18:00:00Z'), reason: 'doublon', note: 'secret note interne' });
  S('s6', SHOP, 3000, 'split', '2026-10-11T09:00:00Z', { parts: JSON.stringify([{ method: 'cash', amountCents: 1500 }, { method: 'card', amountCents: 1500 }]) });
  S('s8', SHOP, 400, 'card', '2026-11-01T03:30:00Z');                      // 04:30 le 1er nov. : encore le 31 octobre
  S('s9', SHOP, 800, 'card', '2026-11-01T04:00:00Z');                      // 05:00 le 1er nov. : novembre
  S('x1', OTHER, 77777, 'cash', '2026-10-10T10:00:00Z');                   // un autre magasin

  const inv = db.prepare(`INSERT INTO sale_invoices (merchant,seq,number,sale_id,customer,snapshot,created_ts) VALUES (?,?,?,?,?,?,?)`);
  inv.run(SHOP, 1, 'F-2026-0001', 's2', JSON.stringify({ name: 'SARL Atlas', ice: '001234567000012', if: '123', phone: '0699887766' }),
    JSON.stringify({ issuedTs: iso('2026-10-10T10:00:00Z'), tvaRate: 20, totals: { ht: 16.67, tva: 3.33, ttc: 20 }, customer: { phone: '0699887766' }, seller: { pinCode: '4321' } }), iso('2026-10-10T10:00:00Z'));
  inv.run(SHOP, 2, 'F-2026-0002', 's3', null,
    JSON.stringify({ issuedTs: iso('2026-11-02T10:00:00Z'), tvaRate: 20, totals: { ht: 41.67, tva: 8.33, ttc: 50 } }), iso('2026-11-02T10:00:00Z'));
  inv.run(OTHER, 1, 'F-2026-0001', 'x1', null,
    JSON.stringify({ issuedTs: iso('2026-10-10T10:00:00Z'), tvaRate: 10, totals: { ht: 1, tva: 0.1, ttc: 1.1 } }), iso('2026-10-10T10:00:00Z'));

  const cash = db.prepare(`INSERT INTO cash_session_events (id,merchant,session_id,terminal_id,event_type,expected_cents,counted_cents,gap_cents,movement_kind,movement_amount_cents,movement_reason,actor_id,counterparty_actor_id,opened_ts,occurred_ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const opened = iso('2026-10-10T06:00:00Z');
  cash.run('e1', SHOP, 'sess-1', 'term_secret_device_01', 'open', 20000, null, null, null, null, null, 'staff-secret-id', null, opened, opened);
  cash.run('e2', SHOP, 'sess-1', 'term_secret_device_01', 'movement', null, null, null, 'out', 1500, 'achat de lait', 'staff-secret-id', null, opened, iso('2026-10-10T09:00:00Z'));
  /* 03:30 à Casablanca le 11 : encore le jour d'activité du 10 (coupure 05:00). */
  cash.run('e2b', SHOP, 'sess-1', 'term_secret_device_01', 'movement', null, null, null, 'in', 300, 'monnaie', 'staff-secret-id', null, opened, iso('2026-10-11T02:30:00Z'));
  cash.run('e3', SHOP, 'sess-1', 'term_secret_device_01', 'close', 52000, 51500, -500, null, null, null, 'staff-secret-id', null, opened, iso('2026-10-10T20:00:00Z'));
  cash.run('e4', OTHER, 'sess-9', 'term_other', 'open', 1, null, null, null, null, null, 'x', null, opened, opened);

  const z = db.prepare(`INSERT INTO z_reconciliations (merchant,business_day,terminal_id,reported_count,reported_cents,server_count,server_cents,missing_count,missing_cents,mismatch_count,extra_count,status,result_json,updated_ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  z.run(SHOP, '2026-10-10', 'term_secret_device_01', 4, 6500, 4, 6500, 0, 0, 0, 0, 'matched', '{"ids":["s2"]}', now);
  z.run(OTHER, '2026-10-10', 'term_other', 1, 1, 1, 1, 0, 0, 0, 0, 'matched', '{}', now);

  if (dropZ) db.exec('DROP TABLE z_reconciliations');
  const env = { AUTH_SECRET: SECRET, DB: {
    prepare(q) {
      const st = db.prepare(q);
      const bound = (p) => ({
        async first() { const row = st.get(...p); return row === undefined ? null : row; },
        async all() { return { results: st.all(...p) }; },
        async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
      });
      return Object.assign(bound([]), { bind: (...p) => bound(p) });
    },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  } };
  return { db, env };
}

const BASE = 'https://kiwi-os.com';
let ipSeq = 20;
const req = (p, { cookie = '', method = 'GET', body, ip } = {}) => new Request(BASE + p, {
  method,
  headers: { ...(cookie ? { Cookie: cookie } : {}), 'CF-Connecting-IP': ip || `10.7.0.${ipSeq++}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
const bodyOf = async (res) => { const t = await res.text(); try { return { text: t, json: JSON.parse(t) }; } catch (_) { return { text: t, json: null }; } };

const responses = []; // tout ce que l'espace comptable a rendu, pour l'examen des secrets
async function call(fn, request, env) {
  const res = await fn({ request, env });
  const b = await bodyOf(res.clone());
  responses.push(b.text);
  return { res, status: res.status, ...b };
}

const { db, env } = database();
const ownerA = lib.sessionCookie(await lib.makeSession('acc-a', SECRET)).split(';')[0];
const ownerB = lib.sessionCookie(await lib.makeSession('acc-b', SECRET)).split(';')[0];
const till = `kiwi_till=${await lib.tillToken(SECRET, SHOP)}`;
const operator = `kiwi_op=${await lib.operatorToken(SECRET)}; kiwi_op_id=${await lib.operatorIdToken(SECRET, 'op-test1')}`;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const cookieOf = (res) => (res.headers.get('Set-Cookie') || '').split(';')[0];

console.log('■ Invitation · le lien n\'est rendu qu\'une fois, seule l\'empreinte est stockée');
let token, accessId, acct;
{
  const r = await call(access.onRequest, req('/api/comptable/access', { cookie: ownerA, method: 'POST', body: { merchant: SHOP, label: 'Cabinet Benali', email: 'benali@cabinet.test' } }), env);
  ok('le propriétaire crée un accès (201)', r.status === 201 && r.json.ok, r.text);
  ok('le lien est https://kiwi-os.com/comptable.html#<jeton>', typeof r.json.url === 'string' && r.json.url.startsWith('https://kiwi-os.com/comptable.html#'), r.json.url);
  token = r.json.url.split('#')[1]; accessId = r.json.id;
  ok('le jeton fait 32 octets en base64url (43 caractères)', /^[A-Za-z0-9_-]{43}$/.test(token));
  ok('le jeton est dans le fragment seulement, pas dans la requête', !r.json.url.includes('?'));
  const row = db.prepare('SELECT * FROM accountant_access WHERE id = ?').get(accessId);
  ok('seule l\'empreinte SHA-256 est stockée', row.token_hash === sha(token));
  ok('le jeton n\'apparaît dans aucune colonne', !JSON.stringify(row).includes(token));
  ok('créateur et expiration (12 mois) enregistrés', row.created_by === 'acc-a' && Math.abs(row.expires_ts - (row.created_ts + 365 * 86400000)) < 1000);
  const list = await call(access.onRequest, req(`/api/comptable/access?merchant=${SHOP}`, { cookie: ownerA }), env);
  ok('la liste montre l\'accès sans jeton ni empreinte', list.status === 200 && list.json.accesses.length === 1
    && !list.text.includes(token) && !list.text.includes(row.token_hash) && !/token|hash/i.test(list.text), list.text);
  ok('…avec nom, statut actif et dernière vue vide', list.json.accesses[0].label === 'Cabinet Benali' && list.json.accesses[0].status === 'active' && list.json.accesses[0].lastSeenTs === 0);
  const opList = await call(access.onRequest, req(`/api/comptable/access?merchant=${SHOP}`, { cookie: operator }), env);
  ok('un opérateur nommé peut lister', opList.status === 200);
  const bad = await call(access.onRequest, req('/api/comptable/access', { cookie: ownerA, method: 'POST', body: { merchant: SHOP, email: 'pas un email' } }), env);
  ok('une adresse invalide est refusée (400)', bad.status === 400);
}

console.log('■ Qui peut inviter');
{
  const asTill = await call(access.onRequest, req('/api/comptable/access', { cookie: till, method: 'POST', body: { merchant: SHOP } }), env);
  ok('une caisse appairée ne crée pas d\'accès (403)', asTill.status === 403);
  const asTillList = await call(access.onRequest, req(`/api/comptable/access?merchant=${SHOP}`, { cookie: till }), env);
  ok('…ni ne les liste (403)', asTillList.status === 403);
  const other = await call(access.onRequest, req('/api/comptable/access', { cookie: ownerB, method: 'POST', body: { merchant: SHOP } }), env);
  ok('le propriétaire d\'un autre magasin ne crée pas d\'accès ici (403)', other.status === 403);
  const anon = await call(access.onRequest, req('/api/comptable/access', { method: 'POST', body: { merchant: SHOP } }), env);
  ok('sans session (403)', anon.status === 403);
  const demo = await call(access.onRequest, req('/api/comptable/access', { cookie: `kiwi_gate=${await lib.staffToken('x')}`, method: 'POST', body: { merchant: 'cafe-atlas' } }), env);
  ok('le laissez-passer d\'équipe n\'ouvre pas non plus un magasin de démonstration (403)', demo.status === 403);
  const revoke = await call(access.onRequest, req(`/api/comptable/access?merchant=${SHOP}&id=${accessId}`, { cookie: ownerB, method: 'DELETE' }), env);
  ok('un autre propriétaire ne révoque pas cet accès (403)', revoke.status === 403 && !db.prepare('SELECT revoked_ts FROM accountant_access WHERE id = ?').get(accessId).revoked_ts);
  const wrong = await call(access.onRequest, req('/api/comptable/access', { cookie: ownerA, method: 'PUT', body: { merchant: SHOP } }), env);
  ok('PUT sur access : 405', wrong.status === 405);
}

console.log('■ Échange · le jeton du lien contre un cookie');
{
  const noMethod = await call(session.onRequest, req('/api/comptable/session'), env);
  ok('GET sur session : 405', noMethod.status === 405);
  const bad = await call(session.onRequest, req('/api/comptable/session', { method: 'POST', body: { token: 'x'.repeat(43) } }), env);
  ok('un jeton inconnu est refusé (401 invalid-link)', bad.status === 401 && bad.json.error === 'invalid-link' && !bad.res.headers.get('Set-Cookie'));
  const malformed = await call(session.onRequest, req('/api/comptable/session', { method: 'POST', body: { token: 'court' } }), env);
  ok('un jeton mal formé est refusé (401)', malformed.status === 401);
  const good = await call(session.onRequest, req('/api/comptable/session', { method: 'POST', body: { token } }), env);
  const setCookie = good.res.headers.get('Set-Cookie') || '';
  ok('le bon jeton est échangé (200)', good.status === 200 && good.json.ok && good.json.merchant === SHOP, good.text);
  ok('le cookie kiwi_acct est HttpOnly, Secure, SameSite=Lax', /^kiwi_acct=/.test(setCookie) && /HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Lax/.test(setCookie), setCookie);
  ok('…limité à /api/comptable (il ne part pas vers le reste de l\'app)', /Path=\/api\/comptable(;|$)/.test(setCookie), setCookie);
  ok('…et ne contient pas le jeton du lien', !setCookie.includes(token));
  acct = cookieOf(good.res);
  ok('« dernière vue » est renseignée', db.prepare('SELECT last_seen_ts FROM accountant_access WHERE id = ?').get(accessId).last_seen_ts > 0);
  const again = await call(session.onRequest, req('/api/comptable/session', { method: 'POST', body: { token } }), env);
  ok('le lien peut être rouvert depuis un autre appareil (200)', again.status === 200);
  // Force brute : huit essais ratés depuis la même adresse, puis blocage.
  let last;
  for (let i = 0; i < 9; i++) last = await call(session.onRequest, req('/api/comptable/session', { method: 'POST', ip: '10.9.9.9', body: { token: crypto.randomBytes(32).toString('base64url') } }), env);
  ok('l\'échange est limité en essais (429)', last.status === 429 && last.json.error === 'too_many_attempts', String(last.status));
  const blockedGood = await call(session.onRequest, req('/api/comptable/session', { method: 'POST', ip: '10.9.9.9', body: { token } }), env);
  ok('…même avec le bon jeton, une adresse bloquée attend (429)', blockedGood.status === 429);
}

console.log('■ Lecture · les livres de CE magasin, jour d\'activité 05:00');
let oct;
{
  const none = await call(books.onRequest, req('/api/comptable/books?month=2026-10'), env);
  ok('sans cookie : 401', none.status === 401);
  const forged = await call(books.onRequest, req('/api/comptable/books?month=2026-10', { cookie: `kiwi_acct=${accessId}.${'0'.repeat(64)}` }), env);
  ok('cookie à signature falsifiée : 401', forged.status === 401);
  const r = await call(books.onRequest, req('/api/comptable/books?month=2026-10', { cookie: acct }), env);
  oct = r.json;
  ok('lecture du mois (200, lecture seule)', r.status === 200 && oct.ok && oct.readOnly === true && oct.merchant === SHOP, r.text.slice(0, 200));
  ok('le magasin est nommé', oct.store.name === 'Compta Shop');
  ok('le jour d\'activité commence à 05:00 locale (borne du 10 octobre = 04:00Z)', oct.range.fromTs === iso('2026-10-01T04:00:00Z') && oct.range.cutoffHour === 5, String(oct.range.fromTs));
  const refs = oct.sales.journal.map((j) => j.ref);
  ok('04:59:59 appartient au jour précédent (le 9)', oct.sales.journal.find((j) => j.ref === 'R-s1').day === '2026-10-09');
  ok('05:00:00 ouvre le jour suivant (le 10)', oct.sales.journal.find((j) => j.ref === 'R-s2').day === '2026-10-10');
  ok('fin de mois : 04:30 le 1er novembre reste dans octobre (31)', oct.sales.journal.find((j) => j.ref === 'R-s8').day === '2026-10-31');
  ok('…et 05:00 le 1er novembre n\'y est plus', !refs.includes('R-s9'));
  ok('septembre est exclu', !refs.includes('R-s0'));
  ok('un autre magasin n\'apparaît pas', !r.text.includes('77777') && !refs.includes('R-x1'));
  const s = oct.sales.summary;
  ok('nombre de ventes : 1000, 2000, 5000, 3000, 400 = 5', s.count === 5, JSON.stringify(s));
  ok('brut, remboursements et net en centimes', s.grossCents === 11400 && s.refundsCents === 500 && s.netCents === 10900, JSON.stringify(s));
  ok('une ligne d\'avant les centimes vaut ses dirhams × 100', oct.sales.journal.find((j) => j.ref === 'R-s3').amountCents === 5000);
  ok('par moyen de paiement, le ticket mixte est réparti sur ses parts', s.byMethod.cash === 1000 + 5000 - 500 + 1500 && s.byMethod.card === 2000 + 1500 + 400 && !s.byMethod.split, JSON.stringify(s.byMethod));
  ok('un remboursement est listé à part', oct.sales.refunds.length === 1 && oct.sales.refunds[0].amountCents === -500);
  ok('une vente annulée sort des totaux et se liste avec son motif', s.voidCount === 1 && oct.sales.voids[0].reason === 'doublon' && !refs.includes('R-s5'));
  const d10 = oct.sales.days.find((d) => d.day === '2026-10-10');
  ok('le journal par jour : 10 octobre = 2000 + 5000 − 500', d10.netCents === 6500 && d10.count === 2, JSON.stringify(d10));
  ok('les 31 jours du mois sont présents', oct.sales.days.length === 31 && oct.sales.days.find((d) => d.day === '2026-10-05').netCents === 0);
  ok('somme des jours = net du mois', oct.sales.days.reduce((a, d) => a + d.netCents, 0) === s.netCents);
  ok('TVA : seulement les factures émises du mois (celle de novembre est exclue)', oct.vat.invoiceCount === 1 && oct.vat.tvaCents === 333 && oct.vat.htCents === 1667 && oct.vat.ttcCents === 2000 && oct.vat.byRate['20'].count === 1, JSON.stringify(oct.vat));
  ok('…et dit d\'où elle vient', oct.vat.source === 'invoices' && /factures/i.test(oct.vat.note));
  ok('factures : numéro, client (nom, ICE) et totaux', oct.invoices.rows.length === 1 && oct.invoices.rows[0].number === 'F-2026-0001' && oct.invoices.rows[0].customer.name === 'SARL Atlas' && oct.invoices.rows[0].customer.ice === '001234567000012');
  const sess = oct.cash.sessions[0];
  ok('caisse : fond, sortie, comptage et écart', oct.cash.sessions.length === 1 && sess.openingCents === 20000 && sess.movements[0].amountCents === 1500 && sess.expectedCents === 52000 && sess.countedCents === 51500 && sess.gapCents === -500, JSON.stringify(sess));
  ok('un mouvement à 03:30 est daté du jour d\'activité, pas du jour UTC', sess.movements.length === 2 && sess.movements[0].day === '2026-10-10' && sess.movements[1].day === '2026-10-10', JSON.stringify(sess.movements));
  ok('Z : lu pour la période, sans identifiant de caisse', oct.z.rows.length === 1 && oct.z.rows[0].day === '2026-10-10' && oct.z.rows[0].status === 'matched' && oct.z.rows[0].terminal === 1);
  const range = await call(books.onRequest, req('/api/comptable/books?from=2026-10-09&to=2026-10-10', { cookie: acct }), env);
  ok('une plage de dates fonctionne (9 au 10 : 1000 + 2000 + 5000 − 500)', range.status === 200 && range.json.sales.summary.netCents === 7500 && range.json.sales.days.length === 2, range.text.slice(0, 160));
  ok('mois invalide : 400', (await call(books.onRequest, req('/api/comptable/books?month=2026-13', { cookie: acct }), env)).status === 400);
  ok('plage trop longue : 400', (await call(books.onRequest, req('/api/comptable/books?from=2026-01-01&to=2026-12-31', { cookie: acct }), env)).status === 400);
  const wrongShop = await call(books.onRequest, req(`/api/comptable/books?month=2026-10&merchant=${OTHER}`, { cookie: acct }), env);
  ok('un autre magasin demandé : 403', wrongShop.status === 403);
  const sameShop = await call(books.onRequest, req(`/api/comptable/books?month=2026-10&merchant=${SHOP}`, { cookie: acct }), env);
  ok('son propre magasin nommé : 200', sameShop.status === 200);
}

console.log('■ Rien d\'autre ne s\'ouvre avec ce cookie');
{
  const salesBefore = db.prepare('SELECT COUNT(*) n FROM sales').get().n;
  const docsBefore = db.prepare('SELECT COUNT(*) n FROM store_docs').get().n;
  const json = { 'Content-Type': 'application/json', Cookie: acct, 'CF-Connecting-IP': '10.5.5.5' };
  const as = (p, init = {}) => new Request(BASE + p, { ...init, headers: { ...json, ...(init.headers || {}) } });
  let res = await store.onRequestGet({ request: as(`/api/store?feature=team&merchant=${SHOP}`), env });
  ok('/api/store GET : 401', res.status === 401, String(res.status));
  res = await store.onRequestPost({ request: as('/api/store', { method: 'POST', body: JSON.stringify({ feature: 'menu', merchant: SHOP, data: { x: 1 }, baseRev: 0 }) }), env });
  ok('/api/store POST : 401, rien d\'écrit', res.status === 401 && db.prepare('SELECT COUNT(*) n FROM store_docs').get().n === docsBefore, String(res.status));
  res = await sale.onRequestPost({ request: as('/api/sale', { method: 'POST', body: JSON.stringify({ merchant: SHOP, id: 'forged-sale', amountCents: 100, method: 'cash', ts: Date.now() }) }), env });
  ok('/api/sale POST : refusé, aucune vente créée', [401, 403].includes(res.status) && db.prepare('SELECT COUNT(*) n FROM sales').get().n === salesBefore, String(res.status));
  res = await pushRegister.onRequestPost({ request: as('/api/push/register', { method: 'POST', body: JSON.stringify({ merchant: SHOP, token: 'A'.repeat(40), platform: 'web', role: 'dashboard' }) }), env });
  ok('/api/push/register POST : 401', res.status === 401, String(res.status));
  res = await devices.onRequestGet({ request: as(`/api/pair/devices?merchant=${SHOP}`), env });
  ok('/api/pair/devices : 403', res.status === 403);
  res = await monthReport.onRequestGet({ request: as(`/api/month-report?merchant=${SHOP}&month=2026-10`), env });
  ok('/api/month-report : 403', res.status === 403);
  res = await access.onRequest({ request: as(`/api/comptable/access?merchant=${SHOP}`), env });
  ok('l\'accès comptable ne liste pas (ni ne crée) les accès : 403', res.status === 403);
  res = await access.onRequest({ request: as('/api/comptable/access', { method: 'POST', body: JSON.stringify({ merchant: SHOP }) }), env });
  ok('…un comptable n\'invite pas un autre comptable : 403', res.status === 403);
  const probe = new Request(BASE + '/x', { headers: { Cookie: acct } });
  ok('entitledMerchant ne le reconnaît pas', (await lib.entitledMerchant(probe, env, SHOP)) === '');
  ok('isTillFor ne le reconnaît pas', (await lib.isTillFor(probe, env, SHOP)) === false);
  ok('tenantFor ne le reconnaît pas', !(await priv.tenantFor(probe, env, SHOP, { strict: true })));
  ok('ce n\'est pas un opérateur', (await lib.isOperator(probe, env)) === false);
}

console.log('■ Lecture seule');
{
  const before = JSON.stringify([db.prepare('SELECT COUNT(*) n, SUM(amount) s FROM sales').get(), db.prepare('SELECT COUNT(*) n FROM sale_invoices').get(), db.prepare('SELECT COUNT(*) n FROM cash_session_events').get()]);
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = await call(books.onRequest, req('/api/comptable/books?month=2026-10', { cookie: acct, method: m, ...(m === 'DELETE' ? {} : { body: { merchant: SHOP, amountCents: 1 } }) }), env);
    ok(`${m} sur les livres : 405`, r.status === 405, String(r.status));
  }
  const after = JSON.stringify([db.prepare('SELECT COUNT(*) n, SUM(amount) s FROM sales').get(), db.prepare('SELECT COUNT(*) n FROM sale_invoices').get(), db.prepare('SELECT COUNT(*) n FROM cash_session_events').get()]);
  ok('aucune donnée n\'a bougé', before === after);
  const src = fs.readFileSync(path.join(ROOT, 'functions/api/comptable/books.js'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('books.js ne contient aucune écriture SQL', !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b\s/i.test(src));
}

console.log('■ Révocation et expiration');
{
  const revoked = await call(access.onRequest, req(`/api/comptable/access?merchant=${SHOP}&id=${accessId}`, { cookie: ownerA, method: 'DELETE' }), env);
  ok('le propriétaire révoque (200)', revoked.status === 200 && revoked.json.revokedTs > 0);
  const r = await call(books.onRequest, req('/api/comptable/books?month=2026-10', { cookie: acct }), env);
  ok('les livres répondent 401 « revoked » (la page peut dire pourquoi)', r.status === 401 && r.json.error === 'revoked', r.text);
  const ex = await call(session.onRequest, req('/api/comptable/session', { method: 'POST', body: { token } }), env);
  ok('le lien révoqué ne s\'échange plus (401 revoked)', ex.status === 401 && ex.json.error === 'revoked');
  const list = await call(access.onRequest, req(`/api/comptable/access?merchant=${SHOP}`, { cookie: ownerA }), env);
  ok('la liste le dit révoqué', list.json.accesses[0].status === 'revoked');
  const gone = await call(access.onRequest, req(`/api/comptable/access?merchant=${SHOP}&id=ca_${'A'.repeat(16)}`, { cookie: ownerA, method: 'DELETE' }), env);
  ok('révoquer un accès inconnu : 404', gone.status === 404);

  const c = await call(access.onRequest, req('/api/comptable/access', { cookie: operator, method: 'POST', body: { merchant: SHOP, label: 'Expert 2', days: 30 } }), env);
  const t2 = c.json.url.split('#')[1];
  ok('un opérateur nommé peut inviter (journal : op:op-test1)', c.status === 201 && db.prepare('SELECT created_by FROM accountant_access WHERE id = ?').get(c.json.id).created_by === 'op:op-test1');
  const ex2 = await call(session.onRequest, req('/api/comptable/session', { method: 'POST', body: { token: t2 } }), env);
  const acct2 = cookieOf(ex2.res);
  ok('le second accès se connecte', ex2.status === 200 && (await call(books.onRequest, req('/api/comptable/books?month=2026-10', { cookie: acct2 }), env)).status === 200);
  ok('l\'ancien cookie révoqué ne rouvre rien à travers le second', (await call(books.onRequest, req('/api/comptable/books?month=2026-10', { cookie: acct }), env)).status === 401);
  db.prepare('UPDATE accountant_access SET expires_ts = ? WHERE id = ?').run(Date.now() - 1000, c.json.id);
  const expired = await call(books.onRequest, req('/api/comptable/books?month=2026-10', { cookie: acct2 }), env);
  ok('un accès expiré : 401 « expired »', expired.status === 401 && expired.json.error === 'expired');
  const exExp = await call(session.onRequest, req('/api/comptable/session', { method: 'POST', body: { token: t2 } }), env);
  ok('…et son lien ne s\'échange plus', exExp.status === 401 && exExp.json.error === 'expired');
  // Plafond d'accès actifs par magasin
  let last;
  for (let i = 0; i < 11; i++) last = await call(access.onRequest, req('/api/comptable/access', { cookie: ownerA, method: 'POST', body: { merchant: SHOP } }), env);
  ok('au plus 10 accès actifs par magasin (409)', last.status === 409 && last.json.error === 'too-many-accesses');
}

console.log('■ Aucun secret dans les réponses');
{
  const all = responses.join('\n');
  const keys = new Set();
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); } };
  responses.forEach((t) => { try { walk(JSON.parse(t)); } catch (_) {} });
  const bad = [...keys].filter((k) => /pin|pass|secret|token|hash|phone|tel$|mobile|cookie|code|actor|device|terminal_?id/i.test(k));
  // « token » n'apparaît que dans la requête d'échange (jamais en réponse), « url » porte le lien à la création.
  ok('aucune clé de réponse ne ressemble à un identifiant ou un secret', bad.length === 0, bad.join(', '));
  ok('ni code de caisse, ni identifiant de personnel', !all.includes('staff-secret-id') && !all.includes('term_secret_device_01'));
  ok('ni téléphone de client, ni libellé de ticket', !all.includes('0612345678') && !all.includes('0699887766') && !all.includes('Mme Client'));
  ok('ni note interne d\'annulation', !all.includes('secret note interne'));
  ok('ni code dans le snapshot de facture', !all.includes('4321') && !all.includes('pinCode'));
  ok('le nom du client reste là où la facture le porte', all.includes('SARL Atlas'));
}

console.log('■ Production en retard sur schema.sql');
{
  const lag = database({ dropZ: true });
  lag.db.exec('DROP TABLE accountant_access');
  const owner = lib.sessionCookie(await lib.makeSession('acc-a', SECRET)).split(';')[0];
  const c = await call(access.onRequest, req('/api/comptable/access', { cookie: owner, method: 'POST', body: { merchant: SHOP } }), lag.env);
  ok('la table des accès se crée au premier usage', c.status === 201 && !!lag.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'accountant_access'").get());
  const ex = await call(session.onRequest, req('/api/comptable/session', { method: 'POST', body: { token: c.json.url.split('#')[1] } }), lag.env);
  const r = await call(books.onRequest, req('/api/comptable/books?month=2026-10', { cookie: cookieOf(ex.res) }), lag.env);
  ok('une table Z absente se dit « non enregistrée » plutôt que vide', r.status === 200 && r.json.z.status === 'not-recorded' && r.json.sales.status === 'ok', r.text.slice(0, 200));
  const fresh = database();
  fresh.db.exec('DROP TABLE accountant_access');
  const probe = await call(books.onRequest, req('/api/comptable/books', { cookie: `kiwi_acct=ca_${'B'.repeat(16)}.${'1'.repeat(64)}` }), fresh.env);
  ok('base sans la table : refus propre (401), pas de plantage', probe.status === 401);
}

console.log('■ Porte du site (middleware) · trois entrées, pas une de plus');
{
  const run = async (method, p, cookie = '') => {
    let nexted = false;
    const res = await middleware.onRequest({
      request: new Request(BASE + p, { method, headers: { 'CF-Connecting-IP': '10.3.3.3', ...(cookie ? { Cookie: cookie } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}) }),
      env: { AUTH_SECRET: SECRET, DB: env.DB },
      next: async () => { nexted = true; return new Response('{}', { status: 200 }); },
    });
    return { nexted, status: res.status };
  };
  ok('GET /comptable.html passe sans compte', (await run('GET', '/comptable.html')).nexted);
  ok('GET /comptable (URL propre) passe sans compte', (await run('GET', '/comptable')).nexted);
  ok('POST /api/comptable/session passe sans compte', (await run('POST', '/api/comptable/session')).nexted);
  ok('GET /api/comptable/books passe (le handler exige le cookie)', (await run('GET', '/api/comptable/books?month=2026-10')).nexted);
  for (const [m, p] of [['POST', '/api/comptable/books'], ['GET', '/api/comptable/session'], ['GET', '/api/comptable/access?merchant=' + SHOP], ['POST', '/api/comptable/access'], ['DELETE', '/api/comptable/access?id=x'], ['GET', '/api/comptable/other'], ['POST', '/comptable.html']]) {
    const r = await run(m, p, acct);
    ok(`${m} ${p.split('?')[0]} reste derrière la porte (${r.status})`, !r.nexted && r.status === 401);
  }
}

console.log('■ Pages · portail comptable et ligne des Réglages');
{
  const page = fs.readFileSync(path.join(ROOT, 'comptable.html'), 'utf8');
  const dash = fs.readFileSync(path.join(ROOT, 'assets/interactive.js'), 'utf8');
  const inlineScript = (page.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  let parses = true;
  try { new vm.Script(inlineScript); } catch (_) { parses = false; }
  ok('le script de comptable.html se compile', parses && inlineScript.length > 5000);
  ok('la page ne dessine ni lucide, ni italique, ni blanc pur, ni tiret cadratin', !/data-lucide/.test(page) && !/font-style:\s*italic/i.test(page) && !/#fff\b|#ffffff\b/i.test(page) && !page.includes('—'));
  ok('icônes Material par <i data-icon> uniquement', /<i data-icon="/.test(page) && !/<path\b/.test(page));
  ok('FR, EN, AR et RTL', ['fr: {', 'en: {', 'ar: {'].every((k) => inlineScript.includes(k)) && /dir = lang === 'ar' \? 'rtl'/.test(inlineScript));
  ok('le fragment est échangé puis effacé de l\'adresse', /\/api\/comptable\/session/.test(inlineScript) && /history\.replaceState/.test(inlineScript));
  ok('la page ne fait que des GET (livres) et un POST (échange)', !/method:\s*'(PUT|PATCH|DELETE)'/.test(inlineScript) && (inlineScript.match(/method:\s*'POST'/g) || []).length === 1);
  ok('exports CSV : BOM, point-virgule, virgule décimale, Blob', /\\ufeff/.test(inlineScript) && /join\(';'\)/.test(inlineScript) && /replace\('\.', ','\)/.test(inlineScript) && /new Blob/.test(inlineScript));
  ok('noms de fichier kiwi-<magasin>-<mois>-<partie>.csv', /'kiwi-' \+ state\.data\.merchant/.test(inlineScript) && /'journal'|"journal"/.test(inlineScript));
  ok('états : lien révoqué, expiré, hors ligne, mois sans données', ['revokedTitle', 'expiredTitle', 'offlineTitle', 'emptyTitle'].every((k) => inlineScript.includes(k)));
  ok('Réglages : la ligne « Espace comptable » ouvre settings-accountant', /action: 'settings-accountant'/.test(dash) && /'settings-accountant': \(\) => \{/.test(dash));
  ok('…qui parle à /api/comptable/access, jamais au jeton', /\/api\/comptable\/access/.test(dash) && !/localStorage[^;]*accountant/i.test(dash.slice(dash.indexOf("'settings-accountant'"), dash.indexOf("'glass-level'"))));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
