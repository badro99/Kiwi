// Les deux chemins qui CRÉENT un bon dans la file (/api/order/queue) : la
// commande prise en salle (create:true, prix de la carte publiée) et le bon
// venu de la caisse (create:{…}, prix du comptoir). Déplacé tel quel depuis
// queue.js, qui garde la répartition.

import { json, isTillFor } from '../../auth/_lib.js';
import { startOfDay, nextOrderNumber, normTable, priceOrder, SESSION_ID } from './_lib.js';
import { recordOrderCourse } from './_course.js';
import { merchantZone } from '../_business-day.js';
import { deferCourse, ORDER_ID, storedOrderLines, MAX_LINES, ensureServiceTableSession } from './_queue-shared.js';

const MAX_TOTAL = 200000;          // 200 000 MAD — un garde-fou, pas une règle

export async function createFloorTicket(ctx) {
  const { context, env, b, merchant, now } = ctx;
  /* ── La commande prise EN SALLE ────────────────────────────────────────────
   * Le troisième chemin d'entrée de la file, à côté du téléphone du client
   * (/api/order) et du comptoir qui fait avancer les états (plus bas).
   *
   * Pourquoi il a fallu l'écrire. « Lancer la commande » dans kiwi-serveur.html
   * n'était qu'un toast : il effaçait le drapeau « non envoyé » de la table et
   * affichait « commande envoyée · cuisine + bar ». Rien ne partait. La cuisine
   * n'a jamais reçu ce ticket, la caisse ne l'a jamais vu, et le serveur avait
   * la confirmation écrite du contraire. Un onglet rechargé perdait la saisie
   * sans laisser de trace. C'est le seul défaut de cette liste où le produit
   * AFFIRME avoir fait une chose qu'il n'a pas faite.
   *
   * Trois différences assumées avec le chemin public :
   *
   * 1. PAS de `orderProEnabled`. Order Pro est l'option du QR client ; la
   *    tablette de salle est un appareil DU commerçant, derrière la même porte
   *    que la caisse (entitledMerchant, plus haut). Un restaurant qui ne veut
   *    pas de commande client doit quand même pouvoir envoyer en cuisine.
   *
   * 2. PAS de `deskOpen`. Ce verrou existe contre « je garde le lien et je
   *    commande de chez moi » — un risque du téléphone d'inconnu, pas du
   *    serveur en salle, dont la présence EST la preuve que le service tourne.
   *
   * 3. …et pas de `deskTouch` non plus, dans l'autre sens : la salle ne doit
   *    pas faire passer le COMPTOIR pour allumé. C'est ce pointage qui autorise
   *    les téléphones des clients à ouvrir une session ; l'étendre à la tablette
   *    de salle rouvrirait la commande client alors que la caisse dort.
   *
   * Ce qu'on ne change PAS : le prix. Il vient de la carte publiée
   * (priceOrder), jamais de la tablette — même règle que pour le téléphone du
   * client, pour la même raison. Une tablette de salle est plus difficile à
   * détourner qu'un téléphone d'inconnu, pas impossible, et surtout : un seul
   * barème rend la caisse, la cuisine et le rapport journalier d'accord entre
   * eux. Limite connue, suivie à part : les suppléments d'options ne sont pas
   * encore tarifés côté serveur, donc un plat à options part à son prix de base.
   *
   * L'état d'arrivée est `accepted`, pas `pending` : `pending` veut dire « le
   * comptoir n'a pas encore décidé ». Ici le serveur a pris la commande en
   * personne, la décision est prise. Passer par `pending` obligerait le
   * comptoir à ré-accepter chaque table, et surtout ferait expirer en
   * `rejected` (TTL de trente minutes, plus haut) une commande bel et bien
   * lancée pendant un coup de feu. */
  if (b && b.create === true) {
    const mode = b.mode === 'takeout' ? 'takeout' : 'table';
    const table = mode === 'table' ? normTable(b.table) : '';
    if (mode === 'table' && !table) return json({ error: 'table-required' }, 400);

    const rawLines = Array.isArray(b.lines) ? b.lines : [];
    if (!rawLines.length) return json({ error: 'empty-order' }, 400);
    if (rawLines.length > MAX_LINES) return json({ error: 'too-many-lines' }, 400);

    const priced = await priceOrder(env, merchant, rawLines);
    /* Rien de publié en face. On le DIT — le patron publie sa carte depuis le
     * tableau de bord et la salle repart — au lieu de reprendre les prix de la
     * tablette, ce qui ferait diverger le ticket cuisine du rapport du soir. */
    if (priced.noCatalogue) return json({ error: 'menu-not-published' }, 409);
    if (priced.archived.length) return json({ error: 'archived', archived: priced.archived }, 409);
    if (priced.formulaOnly.length) return json({ error: 'formula_only', formulaOnly: priced.formulaOnly }, 409);
    const unknown = (priced.unknown || []).filter(Boolean);
    const unavailable = (priced.unavailable || []).filter(Boolean);
    const invalidOptions = (priced.invalidOptions || []).filter(Boolean);
    if (unknown.length || unavailable.length || invalidOptions.length) {
      return json({
        error: 'menu-changed',
        unknown,
        unavailable,
        invalidOptions,
      }, 409);
    }
    if (!priced.lines.length) return json({ error: 'empty-order' }, 400);
    const total = priced.total;
    if (total <= 0 || total > MAX_TOTAL) return json({ error: 'bad-total' }, 400);

    const server = String((b && b.server) || '').trim().slice(0, 40);
    const today = startOfDay(now, await merchantZone(env, merchant));
    /* Resolve a retry BEFORE opening a visit. A late Wi-Fi replay after the
       bill was paid must return its original ticket, not silently create a
       fresh open session for the now-empty physical table. */
    const clientRef = String((b && b.ref) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || null;
    if (clientRef) {
      try {
        const dup = await env.DB.prepare(
          `SELECT id, number, total, lines, session_id FROM orders WHERE merchant = ? AND client_ref = ?`
        ).bind(merchant, clientRef).first();
        if (dup) {
          return json({ ok: true, id: dup.id, number: dup.number, total: dup.total,
                        session: dup.session_id || null, lines: storedOrderLines(dup), replayed: true });
        }
      } catch (_) { /* colonne pas encore migrée → pas d'idempotence, comme avant */ }
    }
    /* A table number is reusable; a bill is not. Every employee ticket belongs
       to the current visit/session so a later party at table 3 never inherits
       yesterday's or the previous test's unpaid tickets. */
    const serviceSession = mode === 'table'
      ? await (async () => {
          const expectedSession = String((b && (b.expectedSession || b.expectedSessionId)) || '').trim();
          if (expectedSession) {
            const currentSession = await env.DB.prepare(
              `SELECT id, seen_ts FROM table_sessions
                 WHERE id = ? AND merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open'`
            ).bind(expectedSession, merchant, table).first();
            if (!currentSession) return { stale: true };
            if (b.expectedRevision != null && Number(currentSession.seen_ts) !== Number(b.expectedRevision)) {
              return { stale: true, id: currentSession.id, revision: Number(currentSession.seen_ts) || 0 };
            }
            // Keep the captured visit. Re-resolving after this await could
            // open the next party's visit if settlement wins in between.
            return currentSession;
          }
          return ensureServiceTableSession(env, merchant, table, now);
        })() : null;
    if (serviceSession && serviceSession.stale) {
      return json({ error: 'stale-table-visit', retry: true, sessionId: serviceSession.id || undefined,
        revision: serviceSession.revision }, 409);
    }
    if (mode === 'table' && !serviceSession) return json({ error: 'service-session-unavailable' }, 503);

    /* Idempotence. Le double-envoi est PLUS probable en salle que sur le
     * téléphone du client : le wifi d'un café porte mal jusqu'au fond de la
     * terrasse, et un serveur qui ne voit pas sa confirmation retape sur
     * « Lancer ». Sans clé, la cuisine sortait deux fois le même plat. */
    const id = 'ord-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
    const linesJson = JSON.stringify(priced.lines);
    let orderNumber;
    try { orderNumber = await nextOrderNumber(env, merchant, now); }
    catch (_) { return json({ error: 'number-allocation-failed' }, 503); }

    /* Deux écritures, une seule idée — même discipline que index.js : les
     * colonnes tardives (server_name, menu_rev, priced_ts, client_ref) font
     * échouer l'INSERT sur une base où la migration n'est pas passée, et il
     * vaut mieux un ticket sans nom de serveur que pas de ticket du tout. */
    let row = null;
    try {
      row = await env.DB.prepare(
        `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
                             created_ts, updated_ts, server_name, menu_rev, priced_ts, client_ref, session_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?
         WHERE ? IS NULL OR EXISTS (SELECT 1 FROM table_sessions
           WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open')
         RETURNING number`
      ).bind(
        id, merchant, orderNumber, mode, table, total, linesJson, now, now,
        server || null, priced.menuRev, priced.priced ? now : null, clientRef, serviceSession && serviceSession.id,
        serviceSession && serviceSession.id, serviceSession && serviceSession.id, merchant, table
      ).first();
    } catch (_) {
      /* La clé a-t-elle parlé avant la migration ? Deux envois simultanés de la
       * MÊME clé : le second se fait refuser par l'index unique et tombe ici.
       * Le relire évite qu'il réussisse en seconde chance sans clé — deux
       * tickets, deux numéros, deux fois le même plat en cuisine. */
      if (clientRef) {
        try {
          const raced = await env.DB.prepare(
            `SELECT id, number, total, lines FROM orders WHERE merchant = ? AND client_ref = ?`
          ).bind(merchant, clientRef).first();
          if (raced) {
            return json({ ok: true, id: raced.id, number: raced.number, total: raced.total,
                          lines: storedOrderLines(raced), replayed: true });
          }
        } catch (_) { /* colonne absente → c'était bien une base non migrée */ }
      }
      try {
        row = await env.DB.prepare(
          `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
                               created_ts, updated_ts, session_id)
           SELECT ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?
           WHERE ? IS NULL OR EXISTS (SELECT 1 FROM table_sessions
             WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open')
           RETURNING number`
        ).bind(id, merchant, orderNumber, mode, table, total, linesJson, now, now,
          serviceSession && serviceSession.id, serviceSession && serviceSession.id,
          serviceSession && serviceSession.id, merchant, table).first();
      } catch (e) {
        return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
      }
    }

    if (!row) return json({ error: 'stale-table-visit', retry: true }, 409);
    deferCourse(context, recordOrderCourse(env, {
      merchant, orderId: id, orderNumber: (row && row.number) || 1,
      acceptedAt: now, sentAt: now,
    }));
    return json({
      ok: true, id, number: (row && row.number) || 1,
      status: 'accepted', total, lines: priced.lines, session: serviceSession && serviceSession.id,
    });
  }
  return null;
}

/* ═══════════ LE BON DE CAISSE DEVIENT UNE LIGNE QUE LA CUISINE PEUT LIRE ════
 * Appelé par POST { merchant, create:{…} }. `merchant` est déjà résolu par le
 * serveur — jamais celui que le corps prétend.
 *
 * Forme attendue :
 *   { id, mode:'table'|'takeout', table, server, lines:[{name,qty,unitPrice,note,station}] }
 *
 * `station` voyage AVEC la ligne. La cuisine ne connaît pas la carte du
 * commerçant : sans le poste posé au moment de l'envoi, la tablette devrait
 * relire le catalogue pour savoir si un plat va au bar ou au piano, et un plat
 * renommé depuis casserait le rapprochement. Le bon porte donc sa propre
 * vérité, figée à l'instant où il est parti — comme le ticket papier.
 * ═══════════════════════════════════════════════════════════════════════════ */
/* MAX_LINES est déclaré une fois pour toute la file, dans _queue-shared.js — la salle et le
 * bon de cuisine sont arrivés séparément avec chacun le leur, et la fusion des
 * deux branches a produit une double déclaration qui ne fait pas tourner un
 * module ESM (le build Cloudflare échouait avant même de déployer). */
const MAX_QTY = 99;

function cleanLines(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const l of raw.slice(0, MAX_LINES)) {
    if (!l) continue;
    const name = String(l.name || '').trim().slice(0, 80);
    if (!name) continue;
    const line = {
      name,
      qty: Math.min(MAX_QTY, Math.max(1, Math.round(Number(l.qty) || 1))),
      /* Centimes conservés : arrondir au dirham transformait un 14,50 MAD du
       * comptoir en 15 sur le bon de cuisine et sur le total de la commande. */
      unitPrice: Math.max(0, Math.round((Number(l.unitPrice) || 0) * 100) / 100),
      note: String(l.note || '').slice(0, 200),
      visuals: (Array.isArray(l.visuals) ? l.visuals.slice(0, 12) : [])
        .map((v) => ({
          emoji: String((v && (v.emoji || v.e)) || '').trim().slice(0, 16),
          name: String((v && (v.name || v.label || v.cn)) || '').trim().slice(0, 60),
        }))
        .filter((v) => v.name),
      station: String(l.station || '').slice(0, 40),
    };
    if (l.kind) line.kind = String(l.kind).slice(0, 20);
    if (l.formulaUid) line.formulaUid = String(l.formulaUid).slice(0, 40);
    if (l.formulaName) line.formulaName = String(l.formulaName).slice(0, 80);
    if (l.slotLabel) line.slotLabel = String(l.slotLabel).slice(0, 80);
    if (l.formulaSlotId) line.formulaSlotId = String(l.formulaSlotId).slice(0, 40);
    if (l.lineId) line.lineId = String(l.lineId).slice(0, 60);
    if (l.uid) line.uid = String(l.uid).slice(0, 60);
    if (l.id) line.id = String(l.id).slice(0, 60);
    if (l.course === 'suite') line.course = 'suite';
    out.push(line);
  }
  return out;
}

/* ── LA SUITE ANNONCÉE ─────────────────────────────────────────────────────
 * La caisse retient des plats « à suivre » (les plats principaux pendant que
 * l'entrée part) puis les envoie d'un geste, « Envoyer la suite ». Ni l'un ni
 * l'autre n'atteignait l'écran cuisine distant : il voyait l'entrée seule, puis
 * un bon de plats sans rien qui dise que c'était la suite d'une table déjà
 * servie. Le cuisinier ne pouvait ni anticiper ni reconnaître.
 *
 * Le marqueur « suite » voyage sur les lignes (comme voidAlert) : il n'a besoin
 * d'aucune colonne. L'annonce, elle, n'est pas une ligne · elle ne se paie pas,
 * ne se compte pas dans les ventes et ne se marque pas prête · elle vit donc à
 * côté, dans une table créée au premier usage. */
const MAX_FOLLOWING = 40;
function cleanFollowing(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const it of raw.slice(0, MAX_FOLLOWING)) {
    const name = String((it && it.name) || '').trim().slice(0, 80);
    if (!name) continue;
    out.push({ name, qty: Math.min(MAX_QTY, Math.max(1, Math.round(Number(it.qty) || 1))) });
  }
  return out;
}
/* La caisse mint l'identifiant d'un bon au geste (`ord-` + Date.now() en base
 * 36, assets/kitchen-relay.js) : il porte l'ordre des gestes d'UNE caisse, sans
 * dépendre de l'heure d'arrivée au serveur ni d'un écart d'horloge. Une forme
 * d'identifiant inconnue n'est jamais comparée. */
function idMintedAt(id) {
  const m = /^ord-([0-9a-z]{8,9})-/.exec(String(id || ''));
  const ms = m ? parseInt(m[1], 36) : 0;
  return ms > 1.5e12 && ms < 4e12 ? ms : 0;
}
async function suiteAlreadySent(env, merchant, table, id, now) {
  const mine = idMintedAt(id);
  if (!mine || !table) return false;
  try {
    const found = await env.DB.prepare(
      `SELECT id FROM orders WHERE merchant = ? AND mode = 'table' AND table_no = ?
          AND created_ts >= ? AND lines LIKE '%"course":"suite"%' LIMIT 20`
    ).bind(merchant, table, now - 24 * 3600 * 1000).all();
    return (found.results || []).some((r) => idMintedAt(r.id) > mine);
  } catch (_) { return false; }
}
async function ensureFollowingTable(env) {
  // Schema owned by migrations 0001–0010.
}

export async function createTicket(context, env, merchant, c, now) {
  const id = String(c.id || '').trim();
  if (!ORDER_ID.test(id)) return json({ error: 'bad-id' }, 400);

  /* `cleanLines` TRONQUE à MAX_LINES, et silencieusement : le comptoir
   * recevait un `ok` franc, marquait chaque ligne envoyée, et l'écran cuisine
   * distant ne voyait que les soixante premiers plats. Le reste de la table
   * n'existait nulle part et personne ne l'apprenait. Le chemin employé
   * (POST /order, plus haut) refuse déjà ce cas par `too-many-lines` ; le bon
   * de caisse le refuse maintenant pareil, et le comptoir le DIT au caissier
   * (relayToKitchen). Mieux vaut un bon qu'on envoie en deux qu'un bon amputé
   * que personne ne voit. Le ticket local, lui, est déjà imprimé en entier :
   * la commande n'est pas perdue, c'est la cuisine distante qu'il faut
   * resservir. */
  if (Array.isArray(c.lines) && c.lines.length > MAX_LINES) {
    return json({ error: 'too-many-lines', max: MAX_LINES, sent: c.lines.length }, 400);
  }
  const lines = cleanLines(c.lines);
  if (!lines.length) return json({ error: 'empty-order' }, 400);
  const course = c.course === 'suite' ? 'suite' : '';
  if (course) lines.forEach((l) => { l.course = 'suite'; });

  const mode = c.mode === 'takeout' ? 'takeout' : 'table';
  const table = mode === 'table' ? normTable(c.table) : '';
  const server = String(c.server || '').trim().slice(0, 40);

  /* ── LE BON DE CAISSE APPARTIENT À LA VISITE, LUI AUSSI ────────────────────
   * Il partait sans `session_id`. Trois conséquences, toutes silencieuses :
   * l'app employé ne le voyait JAMAIS (son filtre exige une visite ouverte),
   * l'encaissement ne le soldait que par un rattrapage sur le numéro de table,
   * et rien ne l'empêchait de survivre au départ de la tablée.
   *
   * Tant que l'addition avait une seconde vérité — les lignes recopiées dans le
   * document d'occupation — le trou ne se voyait pas : le serveur voyait quand
   * même les articles du comptoir, par l'autre chemin. En supprimant ce chemin,
   * il fallait réparer celui-ci. Un bon de caisse est une commande de la table
   * comme une autre ; il rejoint donc la même visite. */
  /* ── MAIS PAS UNE VISITE DÉJÀ RÉGLÉE ─────────────────────────────────────
   * « La visite ouverte de cette table » n'identifie pas une tablée. Quand la
   * fermeture de la tablée précédente n'avait pas encore atteint le serveur
   * (réseau du comptoir, rechargement), le premier bon de la tablée suivante
   * rejoignait CETTE visite. Son règlement, rejoué ensuite par la caisse ou
   * par la vente en attente, soldait le nouveau bon avec l'argent de l'ancien
   * repas : la table disparaissait de la caisse et le bon n'existait plus
   * nulle part comme dû (Pasta Corner, table 6, bon #86).
   *
   * La caisse sait quelles visites elle a encaissées ; elle les nomme. On les
   * ferme ici SANS toucher `paid_ts` · fermer ne prouve aucun paiement, et la
   * vente de l'ancienne tablée soldera ses propres bons en arrivant (sale.js
   * ne solde que sa session quand une visite plus récente existe). */
  /* Renvoi du même bon (le réseau est tombé, la caisse rejoue). On rend la
   * commande telle qu'elle est, sans rien réécrire : elle a peut-être déjà été
   * marquée prête en cuisine entre-temps, et un UPDATE la ferait reculer.
   * Et AVANT d'ouvrir une visite : la table du bon a pu être transférée depuis,
   * et ouvrir sa visite ici assoyait une tablée fantôme à l'ancienne table. */
  try {
    const dup = await env.DB.prepare(
      'SELECT * FROM orders WHERE id = ? AND merchant = ?'
    ).bind(id, merchant).first();
    if (dup) return json({ ok: true, id: dup.id, number: dup.number, status: dup.status,
      session: dup.session_id || undefined, replayed: true });
  } catch (_) { /* table absente → l'insertion ci-dessous tranchera */ }

  const settledVisits = mode === 'table' && table && Array.isArray(c.settledSessions)
    ? [...new Set(c.settledSessions.map((s) => String(s || '').trim()).filter((s) => SESSION_ID.test(s)))].slice(0, 20)
    : [];
  if (settledVisits.length && await isTillFor(context.request, env, merchant)) {
    try {
      await env.DB.prepare(
        `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = 'settled-at-till'
          WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open'
            AND id IN (${settledVisits.map(() => '?').join(', ')})`
      ).bind(now, merchant, table, ...settledVisits).run();
    } catch (_) { /* never block a kitchen ticket on this repair */ }
  }
  const ticketSession = mode === 'table' && table
    ? await ensureServiceTableSession(env, merchant, table, now) : null;
  const sessionId = ticketSession && ticketSession.id ? ticketSession.id : null;
  const total = lines.reduce((s, l) => s + Math.round(l.unitPrice * 100) * l.qty, 0) / 100;
  const linesJson = JSON.stringify(lines);

  /* L'annonce s'écrit AVANT le bon : la cuisine sonde par `updated_ts`, et un
   * bon lu avant son annonce ne serait jamais relu. Une annonce dont le bon
   * échoue ensuite reste orpheline, sans effet : rien ne la lit sans son bon. */
  let following = mode === 'table' && !course ? cleanFollowing(c.following) : [];
  /* Un bon d'entrée rejoué APRÈS sa suite (le relais de secours rejoue dans le
   * désordre) ne doit pas écrire une annonce que plus rien n'éteindra. */
  if (following.length && await suiteAlreadySent(env, merchant, table, id, now)) following = [];
  if (following.length) {
    try {
      await ensureFollowingTable(env);
      await env.DB.prepare(
        `INSERT OR IGNORE INTO order_following (order_id, merchant, table_no, items, created_ts)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, merchant, table, JSON.stringify(following), now).run();
    } catch (_) { /* l'annonce ne bloque jamais un bon de cuisine */ }
  }

  /* Même numérotation que le relais téléphone : un compteur durable par
   * commerçant et par semaine. Supprimer ou annuler un bon laisse un trou et ne
   * permet jamais de réutiliser son numéro. */
  let orderNumber;
  try { orderNumber = await nextOrderNumber(env, merchant, now); }
  catch (_) { return json({ error: 'number-allocation-failed' }, 503); }
  const RETURN_NUMBER = 'RETURNING number';
  const BASE_COLS = 'id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts';
  const BASE_VALS = `?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?`;
  const head = [id, merchant, orderNumber, mode, table, total, linesJson, now, now];

  /* Les colonnes se sont ajoutées par vagues, et toutes les bases n'ont pas reçu
   * les mêmes : `server_name` est venu avec la session de table, `channel` avec
   * les canaux extérieurs. Une base à qui il manque `channel` doit quand même
   * garder le NOM DU SERVEUR — l'écrire dans le même énoncé que `channel`
   * faisait tomber les deux ensemble, et le bon sortait anonyme (« c'est pour
   * qui, la 7 ? », la question que ce champ existe pour supprimer).
   * Du plus riche au plus pauvre, on s'arrête au premier qui répond. */
  const SHAPES = [
    ...(sessionId ? [
      { cols: BASE_COLS + ', server_name, channel, priced_ts, session_id',
        vals: BASE_VALS + `, ?, 'caisse', ?, ?`, mid: [server, now, sessionId] },
      { cols: BASE_COLS + ', server_name, session_id',
        vals: BASE_VALS + ', ?, ?', mid: [server, sessionId] },
    ] : []),
    { cols: BASE_COLS + ', server_name, channel, priced_ts',
      vals: BASE_VALS + `, ?, 'caisse', ?`, mid: [server, now] },
    { cols: BASE_COLS + ', server_name', vals: BASE_VALS + ', ?', mid: [server] },
    { cols: BASE_COLS, vals: BASE_VALS, mid: [] },
  ];

  let row = null;
  let lastErr = null;
  /* La caisse attend la visite dans la réponse (relayToKitchen → timerSession)
   * pour savoir à quelle tablée appartient l'addition avant le prochain
   * sondage. On ne la rend que si la base l'a réellement enregistrée. */
  let storedSession = null;
  for (const s of SHAPES) {
    try {
      row = await env.DB.prepare(`INSERT INTO orders (${s.cols}) SELECT ${s.vals}
        WHERE ? IS NULL OR EXISTS (SELECT 1 FROM table_sessions
          WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open') ${RETURN_NUMBER}`)
        .bind(...head, ...s.mid, sessionId, sessionId, merchant, table).first();
      lastErr = null;
      storedSession = s.cols.endsWith('session_id') ? sessionId : null;
      break;
    } catch (e) { lastErr = e; row = null; }
  }

  if (lastErr) {
    /* Course avec un rejeu simultané du même identifiant : la clé primaire a
     * parlé. On relit et on rend la commande de l'autre requête, exactement
     * comme un renvoi tardif — jamais un deuxième bon. */
    try {
      const raced = await env.DB.prepare(
        'SELECT * FROM orders WHERE id = ? AND merchant = ?'
      ).bind(id, merchant).first();
      if (raced) return json({ ok: true, id: raced.id, number: raced.number, status: raced.status,
        session: raced.session_id || undefined, replayed: true });
    } catch (_) {}
    return json({ error: 'write-failed', detail: String((lastErr && lastErr.message) || lastErr) }, 500);
  }

  if (!row) return json({ error: 'stale-table-visit', retry: true }, 409);
  /* La suite est partie : les annonces de cette table n'ont plus rien à dire. */
  if (course && table) {
    try {
      await env.DB.prepare(
        `UPDATE order_following SET cleared_ts = ?
          WHERE merchant = ? AND table_no = ? AND cleared_ts IS NULL AND order_id <> ?`
      ).bind(now, merchant, table, id).run();
    } catch (_) { /* table absente : aucune annonce à éteindre */ }
  }
  deferCourse(context, recordOrderCourse(env, {
    merchant, orderId: id, orderNumber: (row && row.number) || 1,
    acceptedAt: now, sentAt: now,
  }));
  return json({ ok: true, id, number: (row && row.number) || 1, status: 'accepted', total,
    session: (row && storedSession) || undefined });
}
