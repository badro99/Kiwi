import { pollQueue } from './_queue-poll.js';
import { serviceScope } from './_queue-service.js';
import { reopenedFloorBills } from './_queue-reopened.js';
export { reopenedFloorBills } from './_queue-reopened.js';
// /api/order/queue — the STAFF half of the order relay (the caisse ET la cuisine).
//
//   GET  ?merchant=slug&since=<ts>[&role=kitchen]   → { ok, orders:[…], sessions:[…], now }
//   POST { merchant, id, status, server?, paid? }   → { ok, id, status, number }
//   POST { merchant, closeSession | closeTable }    → { ok, closed }
//   POST { merchant, create:{…} }                   → { ok, id, number, status }
//
// ── Pourquoi la caisse ÉCRIT ici, elle aussi ────────────────────────────────
// Cette file a été écrite pour le téléphone du client : lui déposait, le
// comptoir lisait. Le chemin inverse — le serveur tape une commande AU COMPTOIR
// et la cuisine doit la voir — n'existait tout simplement pas. La caisse
// poussait son bon dans un tableau en mémoire de sa propre page et imprimait :
// une tablette posée en cuisine ne recevait RIEN de ce qu'un serveur venait de
// saisir, parce que rien ne sortait jamais de l'appareil.
//
// D'où `create`. Une commande venue de la caisse arrive DÉJÀ ACCEPTÉE : la
// décision humaine que `pending` attend a été prise par le serveur au moment où
// il a appuyé sur « Envoyer en cuisine ». La refaire attendre en cuisine
// n'ajouterait qu'un geste et un retard.
//
// NOT public. This path is deliberately left OUT of the gate's OrderPro
// carve-out (which matches /api/order exactly, not the prefix), so reaching it
// requires the same credentials as the rest of the site — in practice the
// caisse's kiwi_gate staff cookie, exactly like /api/sale.
//
// This is where the human decision lives. An order arrives as `pending` and
// STAYS pending until staff accept it; only then is it a kitchen ticket. Nothing
// here is automatic — no auto-accept, no timeout that promotes an order. If the
// till is busy the customer sees "waiting for the till", which is the truth.
//
// Status flow:  pending → accepted → ready → served
//                   └──→ rejected                      (staff declined; terminal)
//                 accepted/ready → archived             (paid takeout removed from live follow-up; not a sale)
//
// ── Deux choses que ce GET fait en plus de lire ─────────────────────────────
// 1. IL POINTE. Ce sondage est la seule preuve régulière et authentifiée que le
//    comptoir est allumé. On en note l'heure (deskTouch), et c'est CETTE trace
//    qui autorise un téléphone à ouvrir une session : commerce fermé, caisse
//    éteinte, plus personne ne commande. La protection contre « je garde le
//    lien et je commande de chez moi » tient à cette ligne-là.
// 2. IL RAPPORTE QUI EST ASSIS. Les sessions vivantes voyagent avec la file,
//    dans la même réponse : la caisse allume ses tables sur le plan de salle
//    sans un deuxième sondage, et sans une deuxième horloge à désynchroniser.

import { json, entitledMerchant, activeServiceEmployee, isTillFor, readTillActorProof } from '../../auth/_lib.js';
import { startOfDay, deskTouch, normTable, CURSOR_LAG_MS, pollCursor } from './_lib.js';
import { merchantZone } from '../_business-day.js';
import { visitCredits } from '../_visit-cover.js';
import { ORDER_ID, MAX_LINES, displayMoney, employeeName, ensureServiceTableSession } from './_queue-shared.js';
import { cancelTable, transferTable, mergeTables } from './_queue-tables.js';
import { createFloorTicket, createTicket } from './_queue-create.js';
import { voidLine, editLine, ackVoid, recallTicket, stationCooking, stationReady } from './_queue-kitchen.js';
import { closeVisit } from './_queue-payments.js';
import { archiveTakeout, advanceOrder } from './_queue-status.js';

/* ── OÙ VIT CHAQUE GESTE ─────────────────────────────────────────────────────
 * Ce fichier garde les deux portes (GET, POST), ce qui les garde (marchand,
 * coupure du serveur, preuve d'opérateur) et l'ORDRE dans lequel un corps de
 * requête est confié aux gestes. Les gestes eux-mêmes vivent à côté :
 *   _queue-shared.js    briques communes (identifiants, lots atomiques, visite) ;
 *   _queue-create.js    créer un bon (salle, caisse) ;
 *   _queue-tables.js    annuler une visite, transférer, fusionner ;
 *   _queue-kitchen.js   annulations négociées et avancement par poste ;
 *   _queue-payments.js  fermer une visite et ce qui reste dû ;
 *   _queue-status.js    transitions d'état, remise, classement d'un emporter. */

/* ── QUI PEUT AUTORISER UNE COMMANDE ORDERPRO ──────────────────────────────
 * Sortie en fonction pure pour qu'un test puisse l'exécuter telle quelle, et
 * pour qu'une seule expression décide. Trois verrous, dans cet ordre :
 *   • seul `accepted` passe — REFUSER un client engage la maison, ça reste au
 *     comptoir, et aucun autre état ne se faufile ici ;
 *   • la commande doit exister ET vivre sur une table — un « à emporter » n'a
 *     aucune table par quoi le rattacher à une coupure, il reste à la caisse ;
 *   • la table doit être dans la coupure de l'employé, la même condition que
 *     pour prendre, annuler ou modifier une ligne. Rien de nouveau. */
function floorMayAcceptOrder(b, orderRow, scope) {
  if (!b || b.create === true) return false;
  if (String((b && b.status) || '') !== 'accepted') return false;
  const id = typeof b.id === 'string' ? b.id.trim() : '';
  if (!ORDER_ID.test(id)) return false;
  if (!orderRow || String(orderRow.mode || '') !== 'table') return false;
  const table = normTable(orderRow.table_no);
  return !!(table && scope && scope.allTables && scope.allTables.has(table));
}
/* Extraction privée : _queue-poll-policy */
/* Extraction privée : _queue-service */
/* Extraction privée : _queue-columns */
/* Extraction privée : _queue-reopened */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const asked = (url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  if (!asked) return json({ error: 'merchant-required' }, 400);
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  /* The gate admits every signed-in merchant plus a shared staff passcode, so
   * "reached this endpoint" never meant "owns this store". Reading the slug from
   * the query let any caller pull another restaurant's live queue — items,
   * notes, totals, table numbers. Server decides now. */
  /* Un serveur en service entre par la même porte que le comptoir, mais il n'a
   * pas les mêmes droits de lecture. Sans `?role=service` il recevait la file
   * ENTIÈRE du commerce : les commandes de livraison avec le téléphone et
   * l'adresse du client, et les tables des autres. Dès que l'appelant n'est ni
   * la caisse appairée, ni le propriétaire, ni un opérateur, la lecture est
   * donc forcée au périmètre « service » (tables de la salle seulement) et les
   * coordonnées du client sont retirées de ce qui lui revient. */
  const privileged = await entitledMerchant(request, env, asked, { allowTill: true });
  const merchant = privileged || await entitledMerchant(request, env, asked, { allowEmployee: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const staffOnly = !privileged;

  // Le pointage du comptoir. Volontairement AVANT toute lecture qui peut
  // échouer : une base sans la table `orders` doit quand même compter comme
  // « caisse allumée », sinon activer Order Pro sur une base pas encore migrée
  // fermerait la porte au lieu de l'ouvrir.
  //
  // …mais PAS quand c'est l'écran cuisine qui sonde. Ce pointage est la seule
  // preuve que le COMPTOIR est allumé, et c'est lui qui autorise un téléphone à
  // ouvrir une session. Une tablette oubliée allumée en cuisine aurait donc
  // gardé la commande à distance ouverte toute la nuit, commerce fermé : la
  // protection « caisse éteinte ⇒ plus personne ne commande » se serait éteinte
  // avec elle, sans que personne ne s'en aperçoive.
  const role = staffOnly ? 'service' : (url.searchParams.get('role') || '').trim().toLowerCase();
  const service = role === 'service' ? await serviceScope(request, env, merchant) : null;
  if (role === 'service' && !service) return json({ error: 'on-shift-service-required' }, 403);
  if (role !== 'kitchen' && role !== 'service') await deskTouch(env, merchant);

  return pollQueue({ env, url, merchant, role, service });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const asked = String((b && b.merchant) || '').trim().toLowerCase().slice(0, 64);
  if (!asked) return json({ error: 'bad-request' }, 400);

  /* Same hole on the write side: accepting or rejecting another store's tickets
   * only ever required knowing its slug. */
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true, allowEmployee: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const now = Date.now();

  /* Permettre au caissier de congédier une commande expirée ou annulée pour qu'elle
   * ne pollue plus l'écran "Expirées · à reprendre". */
  if (b && (b.action === 'dismiss_expired' || b.dismiss === true) && b.id) {
    const orderId = String(b.id).trim();
    if (!ORDER_ID.test(orderId)) return json({ error: 'bad-request' }, 400);
    try {
      const changed = await env.DB.prepare(
        `UPDATE orders SET server_name = 'dismissed', updated_ts = ?
          WHERE id = ? AND merchant = ? AND status = 'rejected'
            AND (server_name IS NULL OR server_name <> 'dismissed')`
      ).bind(now, orderId, merchant).run();
      const count = Number((changed && changed.meta && changed.meta.changes) || changed?.changes || 0);
      if (count) return json({ ok: true, id: orderId, dismissed: true });
      const current = await env.DB.prepare(
        'SELECT status, server_name FROM orders WHERE id = ? AND merchant = ?'
      ).bind(orderId, merchant).first();
      if (!current) return json({ error: 'not-found' }, 404);
      if (current.status === 'rejected' && current.server_name === 'dismissed') {
        return json({ ok: true, id: orderId, dismissed: true, replayed: true });
      }
      return json({ error: 'dismissal-not-eligible', status: current.status }, 409);
    } catch (e) {
      return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
    }
  }

  /* Employee cookies may only CREATE a ticket for a real table in this store's
   * owner-managed floor plan. "Toutes les tables" is intentional coverage:
   * another on-duty server may help, while notifications continue to follow
   * the table's owner. A paused employee cannot submit orders. */
  const employee = await activeServiceEmployee(request, env, merchant);
  /* A shared tablet can retain a service cookie after the cashier pairs it.
   * The till credential, not the incidental employee cookie, decides whether
   * a cashier may void another server's table or a table-less takeaway. */
  if (employee && !await isTillFor(request, env, merchant)) {
    const scope = await serviceScope(request, env, merchant);
    const employeeTable = b && b.create === true && b.mode !== 'takeout' ? normTable(b.table) : '';
    const employeeOpenTable = b && b.openTable != null ? normTable(b.openTable) : '';
    const employeeCloseTable = b && b.closeTable != null ? normTable(b.closeTable) : '';
    if (employee.attendance && employee.attendance.pauseTs) return json({ error: 'employee-on-pause' }, 403);
    const validCreate = b && b.create === true && employeeTable && scope && scope.allTables.has(employeeTable);
    const validOpen = employeeOpenTable && scope && scope.allTables.has(employeeOpenTable);
    const validClose = employeeCloseTable && scope && scope.allTables.has(employeeCloseTable);

    const employeeTransferFrom = b && b.transferTable ? normTable(b.transferTable.fromTable || b.transferTable.from) : '';
    const employeeTransferTo = b && b.transferTable ? normTable(b.transferTable.toTable || b.transferTable.to) : '';
    const validTransfer = employeeTransferFrom && employeeTransferTo && scope && scope.allTables.has(employeeTransferFrom) && scope.allTables.has(employeeTransferTo);

    const employeeMergeSource = b && b.mergeTables ? normTable(b.mergeTables.sourceTable || b.mergeTables.source) : '';
    const employeeMergeTarget = b && b.mergeTables ? normTable(b.mergeTables.targetTable || b.mergeTables.target) : '';
    const validMerge = employeeMergeSource && employeeMergeTarget && scope && scope.allTables.has(employeeMergeSource) && scope.allTables.has(employeeMergeTarget);

    /* La table qui décide est celle de la commande stockée dès qu'un orderId
     * est donné : celle que le corps déclare ne servait qu'à défaut, et un
     * serveur pouvait nommer sa table à côté de la commande d'une autre. */
    let employeeVoidTable = b && b.voidLine ? normTable(b.voidLine.tableNo || b.voidLine.table) : '';
    if (b && b.voidLine && b.voidLine.orderId && env.DB) {
      try {
        const ord = await env.DB.prepare('SELECT table_no FROM orders WHERE id = ? AND merchant = ?').bind(b.voidLine.orderId, merchant).first();
        if (ord && ord.table_no) employeeVoidTable = normTable(ord.table_no);
      } catch (_) {}
    }
    const validVoid = b && b.voidLine && employeeVoidTable && scope && scope.allTables.has(employeeVoidTable);

    let employeeEditTable = b && b.editLine ? normTable(b.editLine.tableNo || b.editLine.table) : '';
    if (b && b.editLine && b.editLine.orderId && env.DB) {
      try {
        const ord = await env.DB.prepare('SELECT table_no FROM orders WHERE id = ? AND merchant = ?').bind(b.editLine.orderId, merchant).first();
        if (ord && ord.table_no) employeeEditTable = normTable(ord.table_no);
      } catch (_) {}
    }
    const validEdit = b && b.editLine && employeeEditTable && scope && scope.allTables.has(employeeEditTable);

    const employeeCancelTable = b && b.cancelTable ? normTable(b.cancelTable.table || b.cancelTable) : '';
    const validCancelTable = employeeCancelTable && scope && scope.allTables.has(employeeCancelTable);

    let employeeAckTable = b && b.ackVoid ? normTable(b.ackVoid.tableNo || b.ackVoid.table) : '';
    if (b && b.ackVoid && b.ackVoid.orderId && env.DB) {
      try {
        const ord = await env.DB.prepare('SELECT table_no FROM orders WHERE id = ? AND merchant = ?').bind(b.ackVoid.orderId, merchant).first();
        if (ord && ord.table_no) employeeAckTable = normTable(ord.table_no);
      } catch (_) {}
    }
    const validAck = b && b.ackVoid && b.ackVoid.orderId && employeeAckTable && scope && scope.allTables.has(employeeAckTable);

    /* ── AUTORISER UNE COMMANDE ORDERPRO DEPUIS LA SALLE ───────────────────
     * Une commande arrivée par QR ou par le web attendait la caisse, et le
     * serveur ne pouvait rien en faire : l'app le PRÉVENAIT (« nouvelle
     * commande »), lui affichait déjà les lignes dans l'addition de la table,
     * puis le laissait traverser la salle pour qu'un autre appuie sur un
     * bouton. Il peut désormais l'accepter lui-même.
     *
     * La condition est celle de toutes les autres actions de salle, pas une
     * nouvelle : la table est dans sa coupure. Deux limites tenues exprès —
     * seul `accepted` passe par ici (REFUSER un client engage la maison, ça
     * reste au comptoir), et une commande à emporter n'a pas de table donc
     * pas de rattachement possible à une coupure : elle reste à la caisse. */
    let employeeStatusOrder = null;
    if (b && b.create !== true && b.status === 'accepted' && typeof b.id === 'string' && ORDER_ID.test(b.id.trim()) && env.DB) {
      try {
        employeeStatusOrder = await env.DB.prepare(
          'SELECT table_no, mode FROM orders WHERE id = ? AND merchant = ?'
        ).bind(b.id.trim(), merchant).first();
      } catch (_) {}
    }
    const validStatus = floorMayAcceptOrder(b, employeeStatusOrder, scope);

    /* `closeSession` n'était validé NULLE PART dans ce bloc, alors que le
     * gestionnaire le fait gagner sur `closeTable` à chaque branche — y compris
     * celle qui estampille `paid_ts` sur toute la visite. Un serveur passait donc
     * le contrôle avec `closeTable` sur une table qu'il sert légitimement, et
     * l'effet tombait sur la visite d'une AUTRE table : celle-ci était soldée
     * sans la moindre ligne dans `sales`. `closeTable` seul laisse au contraire
     * les commandes impayées et renvoie leur compte pour que l'application
     * alerte — c'est l'écart visible que ce chemin effaçait.
     *
     * Ce n'est pas un oubli de périmètre : `closeSession` est le signal de la
     * CAISSE, émis par markPaid() via assets/orderpro-inbox.js. Aucune surface
     * employé ne l'envoie — kiwi-serveur.html poste `closeTable`. Un appelant
     * employé n'a donc rien à y faire. */
    if (b && b.closeSession) {
      return json({ error: 'settlement-is-till-only' }, 403);
    }
    /* Le bon de caisse (`create` objet) porte des prix tapés au comptoir : il
     * appartient à la caisse appairée, comme le règlement. Il passait derrière
     * n'importe quel geste de salle valide (une acceptation de commande, par
     * exemple), parce que la répartition plus bas le traite avant d'avancer
     * l'état. La salle crée ses bons par `create: true`, au prix du menu. */
    if (b && b.create && typeof b.create === 'object') {
      return json({ error: 'till-ticket-is-till-only' }, 403);
    }

    if (!validCreate && !validOpen && !validClose && !validTransfer && !validMerge && !validVoid && !validAck && !validEdit && !validCancelTable && !validStatus) {
      return json({ error: 'floor-table-required' }, 403);
    }
    if (validCreate || validTransfer || validMerge || validVoid || validEdit || validStatus) {
      if (!b.server && employee.member) b.server = employeeName(employee.member);
    }
  }

  const pairedTill = await isTillFor(request, env, merchant);
  const pinActor = b.actorProof ? await readTillActorProof(b.actorProof, env.AUTH_SECRET, merchant) : null;
  if (b.actorProof && !pinActor) return json({ error: 'invalid-action-identity' }, 403);

  /* Seating is the beginning of the visit, not the first kitchen ticket.
   * Persist the visit as soon as the employee confirms the covers so caisse,
   * OrderPro and later orders all share one durable session identity. */
  const openTable = b && b.openTable != null ? normTable(b.openTable) : '';
  if (openTable) {
    const session = await ensureServiceTableSession(env, merchant, openTable, now);
    if (!session) return json({ error: 'service-session-unavailable' }, 503);
    return json({ ok: true, table: openTable, session: session.id, opened_ts: session.opened_ts,
      revision: Number(session.seen_ts) || 0 });
  }

  /* Chaque geste rend sa réponse, ou null quand le corps ne le concerne pas.
   * L'ordre est celui d'origine et il compte : un corps qui porte deux gestes
   * est confié au premier de cette liste. */
  const ctx = { context, request, env, b, merchant, now, employee, pairedTill, pinActor };
  const handled = await cancelTable(ctx)    // b.cancelTable
    || await createFloorTicket(ctx)         // b.create === true
    || await transferTable(ctx)             // b.transferTable
    || await mergeTables(ctx)               // b.mergeTables
    || await voidLine(ctx)                  // b.voidLine
    || await editLine(ctx)                  // b.editLine
    || await ackVoid(ctx)                   // b.ackVoid
    || await closeVisit(ctx);               // b.closeSession / b.closeTable
  if (handled) return handled;

  /* ── Déposer un bon venu de la caisse ─────────────────────────────────────
   * Le serveur a tapé la commande d'une table (ou une vente à emporter) et
   * appuyé sur « Envoyer en cuisine ». Jusqu'ici ce geste ne quittait pas
   * l'appareil : le bon vivait dans un tableau JavaScript de la page et
   * s'imprimait, point. Une tablette en cuisine ne pouvait rien en savoir.
   *
   * Trois choix qui méritent d'être dits :
   *  · `accepted` d'emblée. La décision humaine que `pending` attend vient
   *    d'être prise par le serveur ; la redemander en cuisine n'ajouterait
   *    qu'un geste et un retard au milieu d'un coup de feu.
   *  · les prix viennent de la caisse, PAS du catalogue. À l'inverse du
   *    téléphone d'un inconnu (voir priceOrder dans _lib.js), l'appelant est
   *    ici du personnel authentifié de CE commerce : ce qu'il a tapé au
   *    comptoir EST la vérité de la vente, remise offerte comprise. On
   *    recalcule seulement le total, pour qu'il ne puisse pas dériver de ses
   *    lignes.
   *  · idempotent sur `id`. La caisse mint son identifiant AVANT d'appeler et
   *    rejoue le même en cas de réseau tombé ; sans ça, un tunnel de trente
   *    secondes dans un sous-sol aurait fait sortir le même plat deux fois. */
  if (b && b.create && typeof b.create === 'object') {
    return createTicket(context, env, merchant, b.create, now);
  }

  /* ── Faire avancer une commande ───────────────────────────────────────── */
  const id = String((b && b.id) || '').trim();
  const status = String((b && b.status) || '').trim();
  if (!ORDER_ID.test(id)) return json({ error: 'bad-request' }, 400);

  const progressed = await archiveTakeout(ctx, id, status)   // archived
    || await recallTicket(ctx, id, status)                    // recall
    || await stationCooking(ctx, id, status)                  // cooking
    || await stationReady(ctx, id, status);                   // ready + station
  if (progressed) return progressed;
  return advanceOrder(ctx, id, status);
}
