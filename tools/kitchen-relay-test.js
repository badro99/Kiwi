#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LE RELAIS CUISINE — le bon quitte enfin l'appareil
 *
 *   node tools/kitchen-relay-test.js
 *
 * Ce que le comptoir a remonté : « on clique sur envoyer en cuisine et ça ne
 * marche pas ». C'était vrai d'une façon qu'aucun écran ne montrait — le bon
 * partait bien, mais dans un tableau JavaScript de la page de la caisse, et
 * s'imprimait. Une tablette posée en cuisine ne recevait RIEN, et sans
 * imprimante thermique il n'existait aucun chemin du tout. Or on ne vend pas
 * d'imprimante en cuisine : la tablette EST le passe.
 *
 * Le relais tient donc en quatre promesses, et ce banc les vérifie contre les
 * VRAIES Pages Functions et un SQLite ouvert sur le vrai schema.sql — parce que
 * la moitié des règles sont tenues par le SQL lui-même (clé primaire,
 * numérotation par jour, UPDATE conditionné à l'état de départ) :
 *
 *   1. DÉPÔT       un bon de caisse arrive DÉJÀ accepté, numéroté, avec ses
 *                  postes ; la cuisine n'a pas à le ré-accepter.
 *   2. REJEU       le même identifiant rejoué ne fait pas sortir le plat deux
 *                  fois — c'est ce qui rend la file de secours hors ligne sûre.
 *   3. RETOUR      « prête » depuis la cuisine remonte jusqu'au comptoir.
 *   4. PRÉSENCE    le sondage de la CUISINE ne doit pas faire croire que le
 *                  COMPTOIR est allumé : c'est ce pointage qui autorise les
 *                  téléphones à commander, et une tablette oubliée allumée en
 *                  cuisine aurait gardé la porte ouverte toute la nuit.
 *
 * Plus les contrats de source côté client — parce que le transport peut être
 * parfait et la caisse ne jamais l'appeler.
 * ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as queuePost, onRequestGet as queueGet } from '../functions/api/order/queue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-secret-not-a-real-key';
const SLUG = 'chez-hamid';
const OTHER = 'chez-rival';
const ACC = 'acc-hamid';

let pass = 0; const fails = [];
const ok = (l, c, d) => { if (c) pass++; else fails.push(l + (d ? ' — ' + d : '')); };

/* `channel`, `ext_ref` et `customer` ne sont pas dans le CREATE TABLE : la base
 * déployée les a reçues par un ALTER passé à la main, et schema.sql n'en garde
 * que la trace en commentaire (même contournement que tools/live-mock-server.mjs).
 * Une base de banc sans elles ne ressemble PAS à la production — et c'est
 * précisément la différence qui a fait sortir un bon anonyme au premier essai. */
const DEPLOYED_ALTERS = [
  'ALTER TABLE orders ADD COLUMN channel TEXT',
  'ALTER TABLE orders ADD COLUMN ext_ref TEXT',
  'ALTER TABLE orders ADD COLUMN customer TEXT',
];

function makeDB(withAlters = true) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  if (withAlters) for (const a of DEPLOYED_ALTERS) { try { db.exec(a); } catch (_) {} }
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() { const r = db.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  };
  return { prepare, _db: db };
}

const DB = makeDB();
const env = { DB, AUTH_SECRET: SECRET };

const J = async (r) => { try { return await r.json(); } catch (_) { return null; } };
async function post(body, headers = {}, e = env) {
  const request = new Request('https://k.test/api/order/queue', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const res = await queuePost({ request, env: e });
  return { status: res.status, body: await J(res) };
}
async function get(qs, headers = {}, e = env) {
  const request = new Request('https://k.test/api/order/queue?' + qs, { method: 'GET', headers });
  const res = await queueGet({ request, env: e });
  return { status: res.status, body: await J(res) };
}
const deskSeen = () => {
  const r = DB._db.prepare('SELECT seen_ts FROM order_desk WHERE merchant=?').get(SLUG);
  return r ? r.seen_ts : 0;
};

const CAISSE = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const RELAY = fs.readFileSync(path.join(ROOT, 'assets/kitchen-relay.js'), 'utf8');
const INBOX = fs.readFileSync(path.join(ROOT, 'assets/orderpro-inbox.js'), 'utf8');
const CUISINE = fs.readFileSync(path.join(ROOT, 'kiwi-cuisine.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');

(async () => {
  const now = Date.now();
  DB._db.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run(ACC, 'hamid@example.ma', 'Hamid', 'Chez Hamid', 's', 'h', now);
  for (const [m, acc] of [[SLUG, ACC], [OTHER, 'acc-other']]) {
    DB._db.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,updated_ts) VALUES (?,?,?,?,?)')
      .run(m, '{}', 'restaurant', acc, now);
  }
  const asStaff = { Cookie: sessionCookie(await makeSession(ACC, SECRET)).split(';')[0] };

  const TICKET = {
    id: 'ord-bench-tajine-01', mode: 'table', table: 'T7', server: 'Amine',
    lines: [
      { name: 'Tajine poulet', qty: 2, unitPrice: 85, note: 'sans coriandre', station: 'cuisson' },
      { name: 'Thé à la menthe', qty: 2, unitPrice: 15, station: 'boissons' },
    ],
  };

  /* ═══ 1. DÉPÔT ═══════════════════════════════════════════════════════════ */
  let r = await post({ merchant: SLUG, create: TICKET }, asStaff);
  ok('la caisse peut poser un bon', r.status === 200 && r.body.ok, JSON.stringify(r.body));
  ok('le bon arrive DÉJÀ accepté (le serveur a déjà décidé)', r.body.status === 'accepted');
  ok('il est numéroté', r.body.number === 1, 'n°' + r.body.number);
  ok('le total est recalculé depuis les lignes', r.body.total === 85 * 2 + 15 * 2, 'total=' + r.body.total);

  let q = await get('merchant=' + SLUG + '&since=0&role=kitchen', asStaff);
  ok('la cuisine voit le bon', q.body.orders.length === 1);
  const seen = q.body.orders[0];
  ok('…avec sa table', seen.table === 'T7');
  ok('…avec le nom du serveur', seen.server === 'Amine');
  ok('…marqué comme venant de la caisse', seen.channel === 'caisse');
  ok('…avec la note de cuisine', seen.lines[0].note === 'sans coriandre');
  /* Le poste voyage AVEC la ligne. Sans lui, la tablette devrait relire la
     carte pour savoir si un plat va au bar ou au piano — et un plat renommé au
     bureau depuis casserait le rapprochement d'un bon déjà parti. */
  ok('…et chaque ligne porte son POSTE de préparation',
    seen.lines[0].station === 'cuisson' && seen.lines[1].station === 'boissons');

  /* ═══ 2. REJEU ═══════════════════════════════════════════════════════════ */
  r = await post({ merchant: SLUG, create: TICKET }, asStaff);
  ok('le rejeu du même identifiant est reconnu', r.status === 200 && r.body.replayed === true);
  q = await get('merchant=' + SLUG + '&since=0&role=kitchen', asStaff);
  ok('…et ne fait PAS sortir le plat deux fois', q.body.orders.length === 1,
    q.body.orders.length + ' bons');

  const second = await post({
    merchant: SLUG,
    create: { id: 'ord-bench-cafe-02', mode: 'takeout', lines: [{ name: 'Café', qty: 1, unitPrice: 12 }] },
  }, asStaff);
  ok('un DEUXIÈME bon prend le numéro suivant', second.body.number === 2, 'n°' + second.body.number);

  /* Un geste `Accepter` oublié ne doit pas reconstruire le ticket au login du
     lendemain. C'était le chemin exact du timer à 920 minutes observé en KDS. */
  await post({ merchant: SLUG, create: {
    id: 'ord-bench-hier-03', mode: 'table', table: 'T1',
    lines: [{ name: 'Ancien tajine', qty: 1, unitPrice: 80, station: 'cuisson' }],
  } }, asStaff);
  DB._db.prepare('UPDATE orders SET created_ts=?, updated_ts=? WHERE id=?')
    .run(now - 7 * 60 * 60 * 1000, now - 7 * 60 * 60 * 1000, 'ord-bench-hier-03');
  q = await get('merchant=' + SLUG + '&since=0&role=kitchen', asStaff);
  ok('un bon accepté oublié ne revient pas dans le KDS du service suivant',
    !q.body.orders.some((o) => o.id === 'ord-bench-hier-03'));

  /* ═══ 3. RETOUR, PAR POSTE ═══════════════════════════════════════════════ */
  r = await post({ merchant: SLUG, id: TICKET.id, status: 'cooking', station: 'cuisson' }, asStaff);
  ok('accepter au poste cuisson ne lance pas le poste boissons',
    r.status === 200 && r.body.status === 'accepted'
      && r.body.lines[0].stationAccepted === true && r.body.lines[1].stationAccepted !== true,
    JSON.stringify(r.body));
  q = await get('merchant=' + SLUG + '&since=0&role=kitchen', asStaff);
  let acceptedBack = q.body.orders.find((o) => o.id === TICKET.id);
  ok('la progression acceptée par poste revient sur toutes les tablettes KDS',
    acceptedBack && acceptedBack.lines[0].stationAccepted === true
      && acceptedBack.lines[1].stationAccepted !== true, JSON.stringify(acceptedBack));

  r = await post({ merchant: SLUG, id: TICKET.id, status: 'cooking' }, asStaff);
  ok('accepter depuis Tous lance toutes les sections du ticket',
    r.status === 200 && r.body.lines.every((line) => line.stationAccepted === true),
    JSON.stringify(r.body));

  r = await post({ merchant: SLUG, id: TICKET.id, status: 'ready', station: 'cuisson' }, asStaff);
  ok('la cuisine peut marquer seulement son poste prêt',
    r.status === 200 && r.body.status === 'accepted' && r.body.station === 'cuisson',
    JSON.stringify(r.body));
  q = await get('merchant=' + SLUG + '&since=0', asStaff);
  let back = q.body.orders.find((o) => o.id === TICKET.id);
  ok('le poste cuisson est prêt sans terminer le bar ni toute la commande',
    back && back.status === 'accepted'
      && back.lines[0].stationReady === true && back.lines[1].stationReady !== true,
    JSON.stringify(back));

  r = await post({ merchant: SLUG, id: TICKET.id, status: 'ready', station: 'boissons' }, asStaff);
  ok('le dernier poste prêt termine alors la commande entière',
    r.status === 200 && r.body.status === 'ready', JSON.stringify(r.body));
  q = await get('merchant=' + SLUG + '&since=0', asStaff);
  back = q.body.orders.find((o) => o.id === TICKET.id);
  ok('le comptoir apprend que toute la commande est prête', back && back.status === 'ready');

  r = await post({ merchant: SLUG, id: 'ord-bench-cafe-02', status: 'ready' }, asStaff);
  ok('depuis l’onglet Tous, le geste termine directement toute la commande',
    r.status === 200 && r.body.status === 'ready', JSON.stringify(r.body));

  r = await post({ merchant: SLUG, id: TICKET.id, status: 'served' }, asStaff);
  ok('puis « servie »', r.status === 200 && r.body.status === 'served');
  /* Un bon servi ne se rouvre pas : sinon un doigt qui traîne sur la tablette
     remettrait en préparation un plat déjà sur la table. */
  r = await post({ merchant: SLUG, id: TICKET.id, status: 'ready' }, asStaff);
  ok('un bon servi ne repart pas en préparation', r.status === 409, 'status=' + r.status);

  /* ═══ 4. PRÉSENCE ════════════════════════════════════════════════════════ */
  DB._db.prepare('DELETE FROM order_desk WHERE merchant=?').run(SLUG);
  await get('merchant=' + SLUG + '&since=0&role=kitchen', asStaff);
  ok('le sondage de la CUISINE ne fait pas pointer le comptoir', deskSeen() === 0,
    'seen_ts=' + deskSeen());
  await get('merchant=' + SLUG + '&since=0', asStaff);
  ok('le sondage de la CAISSE, lui, pointe toujours', deskSeen() > 0);

  /* ═══ 5. REFUS ═══════════════════════════════════════════════════════════ */
  r = await post({ merchant: SLUG, create: { id: 'ord-bench-vide-03', lines: [] } }, asStaff);
  ok('un bon sans ligne est refusé', r.status === 400 && r.body.error === 'empty-order');
  r = await post({ merchant: SLUG, create: { id: 'PASBON', lines: [{ name: 'x', qty: 1 }] } }, asStaff);
  ok('un identifiant malformé est refusé', r.status === 400 && r.body.error === 'bad-id');
  /* Le slug dans le corps n'est qu'une DEMANDE : c'est le serveur qui décide de
     quel commerce on parle, à partir de la session. Réclamer le voisin ne pose
     donc rien dans sa cuisine — le bon retombe chez soi. */
  r = await post({ merchant: OTHER, create: { id: 'ord-bench-vol-04', mode: 'takeout', lines: [{ name: 'x', qty: 1, unitPrice: 10 }] } }, asStaff);
  const volé = DB._db.prepare('SELECT merchant FROM orders WHERE id=?').get('ord-bench-vol-04');
  ok('réclamer le slug d’un autre commerçant ne pose rien dans SA cuisine',
    !volé || volé.merchant === SLUG, 'merchant=' + (volé && volé.merchant));
  const chezRival = DB._db.prepare('SELECT COUNT(*) n FROM orders WHERE merchant=?').get(OTHER);
  ok('…la cuisine du voisin reste vide', chezRival.n === 0, 'n=' + chezRival.n);

  // Quantité et libellé bornés — le corps vient d'une porte gardée, mais borner
  // reste ce qui empêche un bug de client de remplir la base.
  r = await post({
    merchant: SLUG,
    create: { id: 'ord-bench-borne-05', mode: 'table', table: 'T1',
      lines: [{ name: 'x'.repeat(300), qty: 9999, unitPrice: -5 }] },
  }, asStaff);
  const stored = DB._db.prepare('SELECT lines, total FROM orders WHERE id=?').get('ord-bench-borne-05');
  const bornee = JSON.parse(stored.lines)[0];
  ok('le libellé est borné', bornee.name.length === 80, 'len=' + bornee.name.length);
  ok('la quantité est plafonnée', bornee.qty === 99, 'qty=' + bornee.qty);
  ok('un prix négatif devient zéro', bornee.unitPrice === 0 && stored.total === 0);

  /* ═══ 5 bis. UNE BASE À QUI IL MANQUE UNE VAGUE DE COLONNES ══════════════
   * `channel` n'est pas dans le CREATE TABLE — la base déployée l'a reçue par
   * un ALTER. Écrire `channel` et `server_name` dans le MÊME énoncé les faisait
   * tomber ENSEMBLE : sur une base sans `channel`, le bon sortait anonyme, et
   * la cuisine redemandait « c'est pour qui, la 7 ? » — la question exacte que
   * ce champ existe pour supprimer. */
  {
    const oldDB = makeDB(false);          // base d'AVANT la vague `channel`
    const oldEnv = { DB: oldDB, AUTH_SECRET: SECRET };
    oldDB._db.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
      .run(ACC, 'hamid@example.ma', 'Hamid', 'Chez Hamid', 's', 'h', Date.now());
    oldDB._db.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,updated_ts) VALUES (?,?,?,?,?)')
      .run(SLUG, '{}', 'restaurant', ACC, Date.now());
    const rr = await post({ merchant: SLUG, create: {
      id: 'ord-bench-vieille-06', mode: 'table', table: 'T2', server: 'Yassine',
      lines: [{ name: 'Harira', qty: 1, unitPrice: 20, station: 'cuisson' }],
    } }, asStaff, oldEnv);
    ok('sur une base pas encore migrée, le bon part quand même', rr.status === 200 && rr.body.ok,
      JSON.stringify(rr.body));
    const kept = oldDB._db.prepare('SELECT server_name FROM orders WHERE id=?').get('ord-bench-vieille-06');
    ok('…et il garde le nom du serveur', kept && kept.server_name === 'Yassine',
      'server_name=' + (kept && kept.server_name));
  }

  /* ═══ 6. LES CONTRATS DE SOURCE ══════════════════════════════════════════
   * Le transport peut être irréprochable et la caisse ne jamais l'appeler —
   * c'était exactement l'état d'avant. */
  ok('la caisse charge le relais', /assets\/kitchen-relay\.js/.test(CAISSE));
  ok('une mesa envoyée en cuisine part sur le réseau',
    /function sendTableToKitchen[\s\S]{0,2600}?relayToKitchen\(order\)/.test(CAISSE));
  ok('une vente à emporter aussi',
    /function sendToKitchen\(\)[\s\S]{0,1600}?relayToKitchen\(order\)/.test(CAISSE));
  const relayFn = (CAISSE.match(/function relayToKitchen\(order\)\s*\{[\s\S]{0,2600}?\n {4}\}/) || [''])[0];
  ok('le bon porte le poste de chaque ligne', /station: \(i\.stations && i\.stations\[0\]\)/.test(relayFn));
  /* Sans cette inscription, le sondage retrouverait notre propre bon six
     secondes plus tard, ne le reconnaîtrait pas, et en ferait un SECOND ticket
     sur l'écran cuisine de la caisse — le même plat, deux fois. */
  ok('le bon posé est inscrit pour ne pas revenir en double',
    /opTickets\.set\(id, order\)/.test(relayFn));
  ok('un rechargement en plein service ne duplique pas les bons',
    /kdsOrders\.find\(t => t && t\.opId === o\.id\)/.test(CAISSE));
  ok('un bon revenu de cette caisse ne double jamais la ligne de la table',
    /if \(o\.channel !== 'caisse'\)\s*\{\s*attachOrderProTable\(o\)/.test(CAISSE));
  ok('une addition employé ne reçoit que la visite actuellement ouverte',
    /o\.session[\s\S]{0,180}?activeSeat\.session/.test(CAISSE)
      && /!o\.session && o\.server/.test(CAISSE)
      && /orderSession: String\(o\.session/.test(CAISSE));
  ok('les anciennes lignes sans visite sont nettoyées une fois puis reconstruites depuis la file',
    /ORDER_BRIDGE_SYNC_VERSION = 2/.test(CAISSE)
      && /saved\.orderBridgeSyncVersion[\s\S]{0,700}?line\.orderProLine/.test(CAISSE));
  ok('une ancienne copie porteuse du même bon caisse est réparée précisément',
    /o\.channel === 'caisse'[\s\S]{0,700}?line\.orderProLine[\s\S]{0,100}?startsWith\(String\(o\.id\) \+ ':'\)/.test(CAISSE));
  ok('une nouvelle caisse ne recharge pas les tables du service précédent',
    /shiftOpenedAt\.getTime\(\) - 30 \* 60 \* 1000/.test(CAISSE));
  ok('le téléphone ne réaffiche pas un snapshot de service expiré',
    /state\.ts[\s\S]{0,100}?Date\.now\(\) - 12 \* 60 \* 60 \* 1000/.test(fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8')));
  ok('la caisse sonde la file même sans Order Pro (sinon « prêt » ne revient jamais)',
    /!orderProOn\(\) && !hasKitchen\(\)/.test(INBOX));
  ok('…et « hasKitchen » désigne bien la caisse à écran cuisine',
    /function hasKitchen\(\) \{ return !!window\.KiwiCaisseKitchen; \}/.test(INBOX));
  ok('le poste porté par la ligne prime sur une re-déduction par le nom',
    /l\.station && kdsStations\(\)\.some/.test(CAISSE));
  ok('la tablette envoie le poste actif avec son geste prête',
    /KiwiKitchenRelay\.bump\(id, 'ready', station\)/.test(CUISINE));
  ok('la tablette envoie aussi le poste actif avec son geste accepter',
    /KiwiKitchenRelay\.bump\(takeId, 'cooking', takeStation\)/.test(CUISINE));
  ok('le filtre Toutes garde le geste de commande entière',
    /var station = S\.station === 'all' \? '' : S\.station/.test(CUISINE));
  ok('la caisse conserve aussi la progression prête par poste',
    /function kdsViewStatus\(o, sid\)/.test(CAISSE)
      && /stationReady: l\.stationReady === true/.test(CAISSE));
  ok('la caisse conserve la progression accepter par poste',
    /stationAccepted: l\.stationAccepted === true/.test(CAISSE)
      && /opPush\(o, 'cooking', station \? \{ station \} : \{\}\)/.test(CAISSE));

  ok('le relais rejoue les envois perdus', /function schedule\(\)/.test(RELAY) && /RETRY_MS/.test(RELAY));
  ok('un refus de fond n’est pas rejoué indéfiniment',
    /r\.status >= 400 && r\.status < 500/.test(RELAY));
  ok('l’identifiant est minté AVANT l’appel (c’est ce qui rend le rejeu sûr)',
    /function newId\(\)/.test(RELAY) && /'ord-' \+ Date\.now\(\)\.toString\(36\)/.test(RELAY));
  ok('la tablette cuisine n’a pas besoin du module d’appairage de la caisse',
    /ls\('kiwiPaired'\) === '1' \|\| paired\(\)/.test(RELAY));

  /* La page cuisine elle-même. Deux exigences de produit, pas de code : rien
     ne s'imprime, et une commande que le comptoir n'a pas acceptée n'apparaît
     jamais devant la brigade. */
  ok('la page cuisine existe et charge le relais', /assets\/kitchen-relay\.js/.test(CUISINE));
  ok('aucune impression en cuisine — c’est la tablette, le passe',
    !/window\.print|KiwiPrinter|printKitchen|escpos/i.test(CUISINE));
  ok('un bon en attente du comptoir n’est pas montré à la cuisine',
    /o\.status === 'pending' \|\| o\.status === 'rejected'/.test(CUISINE));
  ok('la cuisine sonde en se déclarant cuisine (pas comptoir)',
    /pull\(S\.since, 'kitchen'\)/.test(CUISINE));
  ok('un bon oublié d’avant-hier ne rouvre pas le tableau du matin',
    /STALE_MS/.test(CUISINE));
  ok('une tablette restée ouverte purge aussi les anciens bons déjà en mémoire',
    /Object\.keys\(S\.orders\)[\s\S]{0,350}?delete S\.orders\[id\]/.test(CUISINE));
  ok('le rechargement ne fait pas carillonner la tablette', /firstPass/.test(CUISINE));
  ok('l’écran ne s’éteint pas en plein service', /wakeLock/.test(CUISINE));
  ok('le romain, même ici', /em, i, cite \{ font-style: normal; \}/.test(CUISINE));

  ok('la coquille hors-ligne embarque la page cuisine', /'\/kiwi-cuisine\.html'/.test(SW));
  ok('…et le relais', /'\/assets\/kitchen-relay\.js'/.test(SW));
  /* Un écran cuisine hors ligne qui se rouvre sur le tableau de bord du patron
     n'est pas un repli : sur une tablette murale sans clavier, personne n'en
     sort. */
  ok('hors ligne, la cuisine se rouvre sur la CUISINE',
    /indexOf\('\/kiwi-cuisine'\) === 0\) return caches\.match\('\/kiwi-cuisine\.html'\)/.test(SW));

  console.log('');
  if (fails.length) {
    fails.forEach((f) => console.log('  ✗ ' + f));
    console.log(`\n✗ relais cuisine : ${pass} ok, ${fails.length} échec(s)\n`);
    process.exit(1);
  }
  console.log(`  ✓ relais cuisine (${pass} contrôles : dépôt accepté d'emblée, numérotation, `
    + 'postes portés par la ligne,\n    rejeu idempotent, retour « prête » au comptoir, '
    + 'présence du comptoir préservée, bornes,\n    câblage caisse ↔ tablette, zéro impression)\n');
})().catch((e) => { console.log('  ✗ ' + (e && e.stack || e)); process.exit(1); });
