#!/usr/bin/env node
/* Vague 11 · plafonds d'abus et rédactions sur les routes serveur.
 *
 * Les vraies routes sur le vrai schéma (schema.sql en SQLite mémoire, batchs
 * transactionnels : tools/server-money-fixture.mjs) :
 *   · appairage : un client IPv6 qui change d'adresse dans son /64, ou de /64
 *     dans son /48, ne gagne plus d'essais ; un appairage réussi ne remet pas
 *     à zéro le compteur du réseau ;
 *   · console : « ce PIN existe déjà » est compté et journalisé, deux ajouts
 *     simultanés du même code n'en créent qu'un ; les codes opérateur créés et
 *     retirés laissent une trace, le dernier ne part pas ;
 *   · support : la caisse ne dépose plus de demande, un renvoi ne crée ni
 *     seconde demande ni second courriel, dix par heure, le courriel ne recopie
 *     pas le texte saisi ; le webhook entrant est idempotent ;
 *   · commande publique : un script avec le slug ne remplit plus la file du
 *     jour, sans rien changer au service normal derrière un seul wifi ;
 *   · réservations : une caisse appairée ne lit ni contacts ni jetons, et sa
 *     réécriture ne les efface pas.
 * Aucun code réel n'est imprimé : les PIN de ce banc sont fictifs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './server-money-fixture.mjs';
import { operatorToken, operatorIdToken, makeSession, tillToken, SESS_COOKIE, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as redeem } from '../functions/api/pair/redeem.js';
import { onRequestPost as bridgesPost } from '../functions/api/print/bridges.js';
import { onRequestPost as pinsPost } from '../functions/api/admin/pins.js';
import { onRequestPost as opsPost, onRequestDelete as opsDelete } from '../functions/api/admin/operators.js';
import { onRequestPost as ticketPost } from '../functions/api/support/tickets.js';
import { onRequestPost as inboundPost } from '../functions/api/support/inbound.js';
import { onRequestPost as orderPost } from '../functions/api/order/index.js';
import { onRequestGet as storeGet, onRequestPost as storePost } from '../functions/api/store.js';
import { sourceKeys } from '../functions/api/_net-source.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0; const failures = [];
function ok(label, cond, detail = '') {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failures.push(label); console.log('  ✗ ' + label + (detail ? ' · ' + detail : '')); }
}
const req = (url, { method = 'POST', cookie = '', ip = '', body, headers = {} } = {}) => new Request('https://kiwi.test' + url, {
  method,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}), ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/* ── sourceKeys ─────────────────────────────────────────────────────────── */
console.log('\nsource réseau');
ok('IPv6 : deux adresses du même /64 partagent la clé étroite',
  sourceKeys('2001:db8:1:2::5').narrow === sourceKeys('2001:0db8:0001:0002:ffff::9').narrow);
ok('IPv6 : deux /64 du même /48 partagent la clé large',
  sourceKeys('2001:db8:1:2::5').wide === sourceKeys('2001:db8:1:ff::5').wide
  && sourceKeys('2001:db8:1:2::5').narrow !== sourceKeys('2001:db8:1:ff::5').narrow);
ok('IPv4 garde sa clé historique (l’adresse nue)', sourceKeys('198.51.100.7').narrow === '198.51.100.7');
ok('IPv4 vue par une pile IPv6 redevient IPv4', sourceKeys('::ffff:198.51.100.7').narrow === '198.51.100.7');
ok('valeur illisible : un compteur à son nom, pas de clé large', sourceKeys('garbage').narrow === 'garbage' && sourceKeys('garbage').wide === '');

/* ── pairing#0 ──────────────────────────────────────────────────────────── */
console.log('\npairing#0 · essais de code par réseau');
{
  const f = await fixture(ROOT);
  const now = Date.now();
  const addCode = (code) => f.sql.prepare('INSERT INTO pairings (code, merchant, type, subtype, name, created_ts, expires_ts) VALUES (?,?,?,?,?,?,?)')
    .run(code, f.merchant, 'boutique', '', 'Shop', now, now + 15 * 60 * 1000);
  const guess = (ip, code = '000001') => redeem({ request: req('/api/pair/redeem', { ip, body: { code } }), env: f.env });
  // Un client qui change d'adresse à chaque essai dans son /64.
  let blockedAt = 0;
  for (let i = 1; i <= 40 && !blockedAt; i++) {
    const r = await guess(`2001:db8:aa:1::${i.toString(16)}`);
    if (r.status === 429) blockedAt = i;
  }
  ok('IPv6 tournant dans un /64 : bloqué au 11e essai', blockedAt === 11, 'bloqué à ' + blockedAt);
  // Le même client fait tourner ses /64 dans un /48.
  blockedAt = 0;
  for (let i = 1; i <= 60 && !blockedAt; i++) {
    const r = await guess(`2001:db8:bb:${i.toString(16)}::1`);
    if (r.status === 429) blockedAt = i;
  }
  ok('IPv6 tournant de /64 en /64 dans un /48 : bloqué au 31e essai', blockedAt === 31, 'bloqué à ' + blockedAt);
  // Un appairage réussi efface la maille étroite, pas celle du réseau.
  for (let i = 1; i <= 9; i++) await guess(`2001:db8:cc:${i}::1`);
  addCode('482913');
  const good = await guess('2001:db8:cc:9::1', '482913');
  ok('un vrai code passe sous le plafond', good.status === 200, 'statut ' + good.status);
  const wide = f.sql.prepare("SELECT fails FROM pair_attempts WHERE ip = ?").get('pairw|' + sourceKeys('2001:db8:cc::1').wide);
  ok('le compteur du réseau survit à un appairage réussi', wide && wide.fails === 9, JSON.stringify(wide));
  ok('le compteur étroit est effacé par l’appairage', !f.sql.prepare('SELECT 1 FROM pair_attempts WHERE ip = ?').get(sourceKeys('2001:db8:cc:9::1').narrow));
  // IPv4 : la boutique qui se trompe deux fois puis réussit n'est jamais gênée.
  await guess('203.0.113.9'); await guess('203.0.113.9');
  addCode('550127');
  ok('IPv4 : deux erreurs puis le bon code passent', (await guess('203.0.113.9', '550127')).status === 200);
  ok('un autre réseau n’est pas touché', (await guess('192.0.2.44')).status === 422);
  f.close();
}

/* ── pairing#0 bis · le code d'un pont d'impression ───────────────────── */
console.log('\npairing#0 · code d’appairage d’un pont d’impression');
{
  const f = await fixture(ROOT);
  const guess = (ip, code = '000001') => bridgesPost({ request: req('/api/print/bridges', { ip, body: { action: 'redeem', code } }), env: f.env });
  let blockedAt = 0;
  for (let i = 1; i <= 40 && !blockedAt; i++) {
    const r = await guess(`2001:db8:dd:1::${i.toString(16)}`);
    if (r.status === 429) blockedAt = i;
  }
  ok('pont · IPv6 tournant dans un /64 : bloqué au 11e essai', blockedAt === 11, 'bloqué à ' + blockedAt);
  blockedAt = 0;
  for (let i = 1; i <= 60 && !blockedAt; i++) {
    const r = await guess(`2001:db8:ee:${i.toString(16)}::1`);
    if (r.status === 429) blockedAt = i;
  }
  ok('pont · IPv6 tournant de /64 en /64 : bloqué au 31e essai', blockedAt === 31, 'bloqué à ' + blockedAt);
  const burst = await Promise.all(Array.from({ length: 12 }, () => guess('198.51.100.20')));
  const fails = f.sql.prepare('SELECT fails FROM pair_attempts WHERE ip = ?').get('print:198.51.100.20');
  ok('pont · des essais simultanés sont tous comptés', fails && fails.fails === 12 || burst.some((r) => r.status === 429), JSON.stringify(fails));
  ok('pont · un autre réseau n’est pas touché', (await guess('192.0.2.45')).status === 422);
  const down = { ...f.env, DB: { prepare() { throw new Error('d1 down'); } } };
  const r = await bridgesPost({ request: req('/api/print/bridges', { ip: '192.0.2.46', body: { action: 'redeem', code: '000001' } }), env: down });
  ok('pont · limiteur injoignable : l’essai est refusé, pas accepté', r.status === 503, 'statut ' + r.status);
  f.close();
}

/* ── console#0 ──────────────────────────────────────────────────────────── */
console.log('\nconsole#0 · codes d’équipe ajoutés depuis la console');
{
  const f = await fixture(ROOT);
  const op = `kiwi_op=${await operatorToken(f.env.AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(f.env.AUTH_SECRET, 'money-operator')}`;
  const add = (pin, name = 'Salarié') => pinsPost({ request: req('/api/admin/pins', { cookie: op, body: { merchant: f.merchant, pin, name, role: 'caisse' } }), env: f.env });
  const [a, b] = await Promise.all([add('4821', 'A'), add('4821', 'B')]);
  const rows = f.sql.prepare('SELECT COUNT(*) AS n FROM staff_pins WHERE merchant = ? AND pin = ?').get(f.merchant, '4821').n;
  ok('deux ajouts simultanés du même code n’en créent qu’un', rows === 1 && [a.status, b.status].sort().join() === '200,409', `${rows} lignes, ${a.status}/${b.status}`);
  const creates = f.sql.prepare("SELECT COUNT(*) AS n FROM account_audit WHERE action = 'staff-pin-create'").get().n;
  ok('une seule création au journal', creates === 1, String(creates));
  const dupes = f.sql.prepare("SELECT * FROM account_audit WHERE action = 'staff-pin-duplicate'").all();
  ok('le refus est journalisé au nom de l’opérateur', dupes.length === 1 && dupes[0].actor_id === 'money-operator');
  ok('le journal ne porte jamais le code', !JSON.stringify(f.sql.prepare('SELECT * FROM account_audit').all()).includes('4821'));
  // Sonder les codes : chaque « existe déjà » coûte.
  for (const pin of ['1001', '1002', '1003', '1004', '1005', '1006', '1007']) {
    f.sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)').run('pin-' + pin, f.merchant, pin, 'X', 'caisse', 1);
  }
  const statuses = [];
  for (const pin of ['1001', '1002', '1003', '1004', '1005', '1006', '1007']) statuses.push((await add(pin)).status);
  const after = await add('7731');
  // Chaque ajout compte aussi au budget de l'établissement : l'arrêt vient au plus tard au huitième refus.
  ok('l’opérateur qui sonde est arrêté', statuses.every((s) => s === 409 || s === 429) && statuses.includes(429) && after.status === 429, statuses.join(',') + ' puis ' + after.status);
  ok('et ne peut plus sonder, même un code libre', !f.sql.prepare('SELECT 1 FROM staff_pins WHERE pin = ?').get('7731'));
  f.close();
}
{
  // Une création réussie dit aussi « ce code était libre » : chaque ajout compte.
  const f = await fixture(ROOT);
  const op = `kiwi_op=${await operatorToken(f.env.AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(f.env.AUTH_SECRET, 'money-operator')}`;
  const add = (merchant, pin) => pinsPost({ request: req('/api/admin/pins', { cookie: op, body: { merchant, pin, name: 'X', role: 'caisse' } }), env: f.env });
  const statuses = [];
  for (let i = 0; i < 9; i++) statuses.push((await add(f.merchant, String(2100 + i))).status);
  ok('huit ajouts réussis puis l’opérateur est arrêté sur cet établissement', statuses.slice(0, 8).every((s) => s === 200) && statuses[8] === 429, statuses.join(','));
  ok('le neuvième code n’est pas créé', !f.sql.prepare('SELECT 1 FROM staff_pins WHERE merchant = ? AND pin = ?').get(f.merchant, '2108'));
  f.close();
}

/* ── console#1 ──────────────────────────────────────────────────────────── */
console.log('\nconsole#1 · codes opérateur');
{
  const f = await fixture(ROOT);
  const op = `kiwi_op=${await operatorToken(f.env.AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(f.env.AUTH_SECRET, 'money-operator')}`;
  const created = await opsPost({ request: req('/api/admin/operators', { cookie: op, body: { label: 'Partenaire', code: 'synthetic-operator-code-1' } }), env: f.env });
  const id = (await created.json()).operator.id;
  const audit = f.sql.prepare("SELECT * FROM account_audit WHERE action = 'operator-create'").all();
  ok('créer un code opérateur laisse une trace nommée', created.status === 200 && audit.length === 1 && audit[0].actor_id === 'money-operator' && audit[0].next === 'Partenaire');
  ok('la trace ne porte ni le code ni son empreinte', !JSON.stringify(audit).includes('synthetic-operator-code-1') && !JSON.stringify(audit).includes(f.sql.prepare('SELECT hash FROM operators WHERE id = ?').get(id).hash));
  const del = await opsDelete({ request: req('/api/admin/operators?id=' + id, { method: 'DELETE', cookie: op }), env: f.env });
  const gone = f.sql.prepare("SELECT * FROM account_audit WHERE action = 'operator-delete'").all();
  ok('retirer un code opérateur laisse une trace', del.status === 200 && gone.length === 1 && gone[0].prev === 'Partenaire');
  const last = await opsDelete({ request: req('/api/admin/operators?id=money-operator', { method: 'DELETE', cookie: op }), env: f.env });
  ok('le dernier code opérateur ne part pas', last.status === 409 && !!f.sql.prepare("SELECT 1 FROM operators WHERE id = 'money-operator'").get(), 'statut ' + last.status);
  ok('sans code nommé, aucune création (pas d’amorçage par le laissez-passer)',
    (await opsPost({ request: req('/api/admin/operators', { body: { label: 'X', code: 'synthetic-operator-code-2' } }), env: f.env })).status === 403);
  const src = fs.readFileSync(path.join(ROOT, 'functions/api/admin/operators.js'), 'utf8');
  ok('la branche d’amorçage morte a disparu', !/allowBootstrap/.test(src));
  f.close();
}

/* ── tickets#0 ──────────────────────────────────────────────────────────── */
console.log('\ntickets#0 · demandes de support');
{
  const f = await fixture(ROOT);
  const mails = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  const env = { ...f.env, MAIL_WEBHOOK: 'https://mail.test/hook' };
  const op = `kiwi_op=${await operatorToken(f.env.AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(f.env.AUTH_SECRET, 'money-operator')}`;
  const file = async (cookie, summary, contact = 'stranger@example.test') => {
    const waits = [];
    const r = await ticketPost({ request: req('/api/support/tickets', { cookie, body: { merchant: f.merchant, summary, channel: 'email', contact, client: {} } }), env, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    return { status: r.status, body: await r.json() };
  };
  const till = `${TILL_COOKIE}=${await tillToken(f.env.AUTH_SECRET, f.merchant)}`;
  const fromTill = await file(till, 'Message libre envoyé par la caisse à une adresse quelconque');
  ok('une caisse appairée ne dépose pas de demande', fromTill.status === 403 && mails.length === 0, 'statut ' + fromTill.status);
  const ownerCookie = `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}`;
  const first = await file(ownerCookie, 'Texte écrit par l’appelant, à ne pas relayer');
  ok('le propriétaire dépose sa demande', first.status === 200 && first.body.ok, 'statut ' + first.status);
  ok('le courriel ne recopie pas le texte saisi', mails.length === 1 && !mails[0].text.includes('Texte écrit par') && mails[0].text.includes(first.body.ticket.reference));
  const again = await file(ownerCookie, 'Texte écrit par l’appelant, à ne pas relayer');
  ok('un renvoi identique rend la même demande', again.status === 200 && again.body.ticket.reference === first.body.ticket.reference);
  ok('sans seconde ligne ni second courriel', mails.length === 1 && f.sql.prepare('SELECT COUNT(*) AS n FROM support_tickets').get().n === 1);
  const statuses = [];
  for (let i = 2; i <= 11; i++) statuses.push((await file(op, `Demande distincte numéro ${i} pour le plafond`)).status);
  ok('dix demandes par heure et par établissement', statuses.slice(0, 9).every((s) => s === 200) && statuses[9] === 429, statuses.join(','));
  ok('la demande refusée n’envoie rien', mails.length === 10, String(mails.length));
  globalThis.fetch = realFetch;
  f.close();
}

/* ── tickets#1 ──────────────────────────────────────────────────────────── */
console.log('\ntickets#1 · webhook entrant');
{
  const f = await fixture(ROOT);
  const env = { ...f.env, SUPPORT_INBOUND_SECRET: 'synthetic-inbound-secret-0123456789' };
  f.sql.prepare("INSERT INTO support_tickets (id,reference,merchant,category,priority,status,channel,contact,summary,created_ts,updated_ts,closed_ts) VALUES ('t1','K-1','server-money-shop','autre','normal','waiting-client','email','a@example.test','Demande',1,1,NULL)").run();
  const hook = (body, secret = env.SUPPORT_INBOUND_SECRET) => inboundPost({ request: req('/api/support/inbound', { body, headers: { 'X-Kiwi-Support-Secret': secret } }), env });
  ok('un mauvais secret est refusé', (await hook({ reference: 'K-1', body: 'x' }, 'synthetic-inbound-secret-0123456788')).status === 403);
  await hook({ reference: 'K-1', body: 'Toujours en panne' });
  f.sql.prepare("UPDATE support_tickets SET status='waiting-client' WHERE id='t1'").run();
  const retry = await hook({ reference: 'K-1', body: 'Toujours en panne' });
  const n = f.sql.prepare("SELECT COUNT(*) AS n FROM support_messages WHERE ticket_id='t1'").get().n;
  ok('un réessai du webhook n’ajoute pas de message', retry.status === 200 && n === 1, n + ' messages');
  ok('ni ne rouvre la demande', f.sql.prepare("SELECT status FROM support_tickets WHERE id='t1'").get().status === 'waiting-client');
  await hook({ reference: 'K-1', body: 'Merci', messageId: '<abc@mail>' });
  await hook({ reference: 'K-1', body: 'Merci (copie)', messageId: '<abc@mail>' });
  ok('un identifiant de message ne s’inscrit qu’une fois', f.sql.prepare("SELECT COUNT(*) AS n FROM support_messages WHERE ticket_id='t1'").get().n === 2);
  const src = fs.readFileSync(path.join(ROOT, 'functions/api/support/inbound.js'), 'utf8');
  ok('le secret n’est plus comparé par !==', !/!==\s*env\.SUPPORT_INBOUND_SECRET/.test(src));
  f.close();
}

/* ── orderpro#0 ─────────────────────────────────────────────────────────── */
console.log('\norderpro#0 · commande publique');
{
  const f = await fixture(ROOT);
  const now = Date.now(), slug = 'w11-cafe';
  f.sql.prepare("INSERT INTO merchant_config (merchant,features,type,updated_ts) VALUES (?,?,?,?)").run(slug, '{"orderpro":true}', 'restaurant', now);
  f.sql.prepare('INSERT INTO menus (merchant,name,type,data,updated_ts) VALUES (?,?,?,?,?)').run(slug, 'Café', 'restaurant',
    JSON.stringify({ cats: [{ id: 'c1', name: 'Boissons', sub: [] }], items: [{ id: 'i1', name: 'Thé', price: 15, catId: 'c1', avail: true }] }), now);
  f.sql.prepare('INSERT INTO order_desk (merchant,seen_ts) VALUES (?,?)').run(slug, now);
  const order = (ip) => orderPost({ request: req('/api/order', { ip, body: { merchant: slug, mode: 'takeout', lines: [{ id: 'i1', qty: 1 }] } }), env: f.env });
  // Service normal : vingt clients derrière le même wifi, la file sous la moitié.
  const cafe = [];
  for (let i = 0; i < 20; i++) cafe.push((await order('198.51.100.20')).status);
  ok('vingt commandes derrière un même wifi passent en service normal', cafe.every((s) => s === 200), cafe.join(','));
  f.sql.prepare("UPDATE orders SET status = 'accepted' WHERE merchant = ?").run(slug);
  // Un script qui fait tourner son adresse dans son /64.
  let refused = 0;
  for (let i = 1; i <= 70; i++) {
    const r = await order(`2001:db8:dd:1::${i.toString(16)}`);
    if (r.status === 429) refused++;
  }
  const pending = f.sql.prepare("SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND status = 'pending'").get(slug).n;
  ok('le script ne remplit pas la file du jour', pending < 60, pending + ' en attente');
  const guest = await order('192.0.2.77');
  ok('un vrai client commande encore', guest.status === 200, 'statut ' + guest.status);
  f.close();
}

/* ── booking#1 ──────────────────────────────────────────────────────────── */
console.log('\nbooking#1 · carnet de réservations et caisse appairée');
{
  const f = await fixture(ROOT);
  const till = `${TILL_COOKIE}=${await tillToken(f.env.AUTH_SECRET, f.merchant)}`;
  const owner = `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}`;
  const start = Date.now() + 86400000;
  const doc = {
    v: 1, settings: { published: true },
    services: [{ id: 'svc', name: 'Coupe', duration: 30, capacity: 1, resourceIds: ['r1'], active: true }],
    resources: [{ id: 'r1', name: 'Amal', kind: 'person', capacity: 1, active: true }],
    blocked: [],
    bookings: [{ id: 'bk1', code: 'K1', customer: { name: 'Salma', phone: '+212600000001', email: 'salma@example.test', address: 'Rue des Synthèses 1' },
      serviceId: 'svc', resourceId: 'r1', startAt: start, endAt: start + 1800000, status: 'confirmed', source: 'public',
      manageToken: 'synthetic-manage-token-0001', publicRef: 'pub-0001',
      guests: [{ id: 'g1', name: 'Salma', idDocNumber: 'SYN123456', birthDate: '1990-01-01', nationality: 'SYN-NAT' }] }],
  };
  f.sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'reservations', ?, 1, ?)").run(f.merchant, JSON.stringify(doc), Date.now());
  const read = async (cookie) => { const r = await storeGet({ request: req('/api/store?feature=reservations&merchant=' + f.merchant, { method: 'GET', cookie }), env: f.env }); return { status: r.status, etag: r.headers.get('ETag'), body: await r.json() }; };
  const tillView = await read(till);
  const seen = JSON.stringify(tillView.body.data);
  ok('la caisse lit le carnet', tillView.status === 200 && tillView.body.data.bookings.length === 1);
  ok('sans le jeton « gérer ma réservation »', !seen.includes('synthetic-manage-token-0001') && !seen.includes('pub-0001'));
  ok('sans téléphone ni courriel', !seen.includes('+212600000001') && !seen.includes('salma@example.test'));
  ok('sans pièce d’identité', !seen.includes('SYN123456') && !seen.includes('1990-01-01'));
  ok('ni aucun autre champ personnel, même nouveau', !seen.includes('Rue des Synthèses') && !seen.includes('SYN-NAT'));
  ok('et sans ETag', !tillView.etag);
  const ownerView = await read(owner);
  ok('le propriétaire lit tout', JSON.stringify(ownerView.body.data).includes('synthetic-manage-token-0001') && JSON.stringify(ownerView.body.data).includes('SYN123456'));
  ok('et garde sa revalidation', !!ownerView.etag);
  // La caisse réécrit la vue qu'elle a reçue, plus une réservation inventée avec un jeton.
  const edited = JSON.parse(seen);
  edited.bookings[0].note = 'Table près de la fenêtre';
  edited.bookings.push({ id: 'bk2', code: 'K2', customer: { name: 'Omar', phone: '', email: '' }, serviceId: 'svc', resourceId: 'r1',
    startAt: start + 3600000, endAt: start + 5400000, status: 'confirmed', source: 'staff', manageToken: 'forged-by-till' });
  const write = await storePost({ request: req('/api/store', { cookie: till, body: { merchant: f.merchant, feature: 'reservations', data: edited, baseRev: tillView.body.rev } }), env: f.env });
  const stored = JSON.parse(f.sql.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'reservations'").get(f.merchant).data);
  const b1 = stored.bookings.find((b) => b.id === 'bk1'), b2 = stored.bookings.find((b) => b.id === 'bk2');
  ok('la caisse écrit encore le carnet', write.status === 200 && b1 && b1.note === 'Table près de la fenêtre', 'statut ' + write.status);
  ok('sans effacer le jeton ni les contacts', b1 && b1.manageToken === 'synthetic-manage-token-0001' && b1.publicRef === 'pub-0001'
    && b1.customer.phone === '+212600000001' && b1.customer.email === 'salma@example.test');
  ok('ni les pièces des voyageurs', b1 && b1.guests[0].idDocNumber === 'SYN123456' && b1.guests[0].birthDate === '1990-01-01');
  ok('ni l’adresse ni la nationalité', b1 && b1.customer.address === 'Rue des Synthèses 1' && b1.guests[0].nationality === 'SYN-NAT');
  ok('et sans fabriquer de jeton', b2 && b2.manageToken === '');
  f.close();
}

console.log(`\nwave11-security-test: ${passed} contrôles, ${failures.length} échec(s)`);
if (failures.length) { failures.forEach((l) => console.log('  ✗ ' + l)); process.exit(1); }
