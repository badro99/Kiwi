import { json } from '../../auth/_lib.js';
import { startOfDay } from './_guest-clock.js';
import { normTable } from './_guest-tables.js';
import { CURSOR_LAG_MS, pollCursor } from './_lib.js';
import { merchantZone } from '../_business-day.js';
import { visitCredits } from '../_visit-cover.js';
import { displayMoney, MAX_LINES } from './_queue-shared.js';
import { reopenedFloorBills } from './_queue-reopened.js';
import { COL_SETS, COL_SET_MISSING } from './_queue-columns.js';
import { MAX_ROWS, readPageCursor, PENDING_TTL_MS, KITCHEN_TTL_MS, OPEN_VISIT_RECOVERY_MS, ARCHIVED_TOMBSTONE_MS, EXPIRED_MS, SERVICE_TOUCH_MS } from './_queue-poll-policy.js';
// Contrat : env, URL, marchand autorisé, rôle et périmètre déjà contrôlés ; sondage, expiration et présence des visites uniquement. La route garde les droits et le pointage du comptoir.
export async function pollQueue({ env, url, merchant, role, service }) {
  // `since` est le curseur de la caisse : elle demande ce qui a changé depuis la
  // dernière réponse, donc un long service coûte une petite réponse par tour.
  const since = Math.max(
    0,
    Number(url.searchParams.get('since')) || 0,
    service ? Number(service.employee.attendance && service.employee.attendance.inTs) || 0 : 0,
  );
  const now = Date.now();
  const rawPageCursor = url.searchParams.get('cursor');
  const pageCursor = rawPageCursor ? readPageCursor(rawPageCursor, now) : null;
  if (rawPageCursor && !pageCursor) return json({ ok: false, error: 'invalid-queue-cursor' }, 400);
  /* A status update can receive a monotonic timestamp a millisecond ahead of
   * Date.now() in the same request burst. Include that small future margin,
   * while the completed client cursor still trails the ORIGINAL poll time. */
  const pageEnd = pageCursor ? pageCursor.end : now + CURSOR_LAG_MS;
  const zone = await merchantZone(env, merchant), today = startOfDay(now, zone);
  const kitchenCutoff = now - KITCHEN_TTL_MS;

  /* ── LE SONDAGE DU SERVEUR EST UN BATTEMENT DE CŒUR ────────────────────────
   * `seen_ts` décide, plus bas, si une table compte encore comme occupée
   * (PRESENCE_MS). Pour une session ouverte depuis un TÉLÉPHONE, c'est le
   * téléphone qui le rafraîchit (order/session.js). Pour une session ouverte
   * par un SERVEUR, personne ne le faisait : elle était estampillée une fois à
   * l'ouverture, puis plus jamais.
   *
   * Au bout de deux heures, la session disparaissait donc de `sessions`, la
   * caisse perdait la table de `phoneSeats`, et `attachOrderProTable` refusait
   * chaque commande suivante — définitivement, puisque le curseur `since` ne
   * représente jamais deux fois la même. Un dîner qui dure, et le dessert
   * n'est pas sur l'addition. Rien ne le signalait.
   *
   * Un serveur EN SERVICE qui sonde est l'équivalent exact du battement du
   * téléphone : la preuve régulière et authentifiée que quelqu'un s'occupe de
   * ces tables. On l'écrit donc, mais pas à chaque tour — seulement quand la
   * marque a vieilli, sinon chaque sondage de chaque serveur deviendrait une
   * écriture. */
  if (service && service.allTables.size) {
    const tables = Array.from(service.allTables).slice(0, 200);
    const marks = tables.map(() => '?').join(',');
    try {
      await env.DB.prepare(
        `UPDATE table_sessions SET seen_ts = ?
          WHERE merchant = ? AND status = 'open' AND mode = 'table'
            AND seen_ts < ? AND table_no IN (${marks})`
      ).bind(now, merchant, now - SERVICE_TOUCH_MS, ...tables).run();
    } catch (err) {
      console.error('[queue] Failed to update table sessions seen_ts for merchant', merchant);
    }
  }

  /* A phone order nobody accepted is not a kitchen ticket forever. Test taps,
   * abandoned carts and customers who walked away used to return after every
   * caisse refresh because `pending` had no terminal condition. */
  try {
    await env.DB.prepare(
      `UPDATE orders SET status = 'rejected', updated_ts = ?
        WHERE merchant = ? AND status = 'pending' AND created_ts < ?`
    ).bind(now, merchant, now - PENDING_TTL_MS).run();
  } catch (err) {
    console.error('[queue] Failed to auto-reject expired pending orders for merchant', merchant);
  }

  /* La file est un tableau de SERVICE, pas l'archive des commandes. Un bon
   * accepté mais jamais marqué prêt restait auparavant lisible sans aucune
   * borne : au premier login du lendemain, la cuisine le reconstruisait avec
   * son horodatage d'origine et affichait un timer de quinze heures. Six heures
   * gardent un service tardif à travers minuit, mais empêchent qu'un bon oublié
   * ou un ancien état `ready` ne revienne les jours suivants. Les `pending`
   * ont leur règle plus stricte de trente minutes juste au-dessus. */
  // The till must rebuild an unpaid bill even after its kitchen ticket ages
  // out. Match PRESENCE's unpaid definition (paid_ts IS NULL, not truthiness);
  // accepted/ready already exclude rejected. Keep this inside the same cursor
  // window and LIMIT so a fresh since=0 poll drains every recovery row.
  const tillRole = role !== 'kitchen' && role !== 'service';
  const recovery = `OR (status IN ('accepted','ready') AND paid_ts IS NULL
                AND EXISTS (SELECT 1 FROM table_sessions s
                  WHERE s.id = orders.session_id AND s.merchant = orders.merchant
                    AND s.status = 'open' AND s.opened_ts >= ?))`;
  const where = (recover) => `FROM orders
        WHERE merchant = ? AND updated_ts > ? AND updated_ts <= ?
          ${pageCursor ? 'AND (updated_ts > ? OR (updated_ts = ? AND id > ?))' : ''}
          AND ((status = 'archived' AND updated_ts >= ?)
            OR (status IN ('pending','accepted','ready','served')
              AND (status = 'pending' OR created_ts >= ? ${recover ? recovery : ''})
              AND (status <> 'served' OR created_ts >= ?)))
        ORDER BY updated_ts, id
        LIMIT ?`;

  let rows = null;
  let degraded = [];
  for (let i = 0; i < COL_SETS.length; i++) {
    // Missing session/payment columns (or table_sessions) must retain the
    // existing TTL query instead of turning a legacy till's queue empty.
    const variants = tillRole && COL_SETS[i].includes('paid_ts') ? [true, false] : [false];
    for (const recover of variants) {
      try {
        rows = await env.DB.prepare(`SELECT ${COL_SETS[i]} ${where(recover)}`)
          .bind(merchant, since, pageEnd,
            ...(pageCursor ? [pageCursor.ts, pageCursor.ts, pageCursor.id] : []),
            now - ARCHIVED_TOMBSTONE_MS, kitchenCutoff,
            ...(recover ? [now - OPEN_VISIT_RECOVERY_MS] : []), today, MAX_ROWS + 1).all();
        degraded = COL_SET_MISSING[i];
        break;
      } catch (_) { rows = null; }
    }
    if (rows) break;
  }
  // Table pas migrée du tout → une file vide, jamais une erreur que la caisse
  // aurait à gérer. Elle continue d'interroger et s'allume au déploiement.
  if (!rows) return json({ ok: true, orders: [], sessions: [], now: pollCursor(now), ordersAvailable: false });

  const hasMore = (rows.results || []).length > MAX_ROWS;
  const pageRows = (rows.results || []).slice(0, MAX_ROWS);
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && lastRow
    ? { v: 1, end: pageEnd, ts: Number(lastRow.updated_ts), id: String(lastRow.id) }
    : null;

  // Handover is an immutable course milestone, not updated_ts (payment replays
  // also move that clock). Keep the orders schema fallbacks independent of the
  // optional course table; legacy rows must expose an honest unknown timestamp.
  const servedById = new Map();
  const servedIds = pageRows.filter((r) => r.status === 'served').map((r) => r.id);
  if (servedIds.length) {
    try {
      // D1 allows 100 bound values; reserve one for the merchant predicate.
      for (let offset = 0; offset < servedIds.length; offset += 99) {
        const ids = servedIds.slice(offset, offset + 99);
        const courses = await env.DB.prepare(
          `SELECT order_id, served_ts FROM order_course
            WHERE merchant = ? AND order_id IN (${ids.map(() => '?').join(',')})`
        ).bind(merchant, ...ids).all();
        for (const course of (courses.results || [])) {
          const ts = Number(course.served_ts);
          if (Number.isInteger(ts) && ts > 0 && ts <= 8640000000000000) servedById.set(course.order_id, ts);
        }
      }
    } catch (_) { degraded = [...degraded, 'order_course']; }
  }

  /* Les plats annoncés « à suivre » (voir cleanFollowing). Une base qui n'a
   * pas encore la table rend des bons sans annonce, jamais une erreur. */
  const followingById = new Map();
  const tableIds = pageRows.filter((r) => r.mode === 'table').map((r) => r.id);
  if (tableIds.length) {
    try {
      for (let offset = 0; offset < tableIds.length; offset += 99) {
        const ids = tableIds.slice(offset, offset + 99);
        const found = await env.DB.prepare(
          `SELECT order_id, items FROM order_following
            WHERE merchant = ? AND cleared_ts IS NULL AND order_id IN (${ids.map(() => '?').join(',')})`
        ).bind(merchant, ...ids).all();
        for (const f of (found.results || [])) {
          try {
            const items = JSON.parse(f.items);
            if (Array.isArray(items) && items.length) followingById.set(f.order_id, items);
          } catch (_) {}
        }
      }
    } catch (_) { /* pas encore de table order_following */ }
  }

  let orders = pageRows.map((r) => {
    let lines = [];
    try { lines = JSON.parse(r.lines) || []; } catch (_) { lines = []; }
    let customer = null;
    try { customer = r.customer ? JSON.parse(r.customer) : null; } catch (_) { customer = null; }
    /* Téléphone et adresse d'un client : réservés au comptoir et au
     * propriétaire. Un serveur garde de quoi appeler la table par son nom. */
    if (service && customer && typeof customer === 'object') {
      customer = customer.name ? { name: String(customer.name).slice(0, 80) } : null;
    }
    return {
      id: r.id, number: r.number, mode: r.mode, table: r.table_no || '',
      total: r.total, lines, status: r.status,
      // Absent (base pas encore migrée) ⇒ 'kiwi' : une commande sans canal est
      // une commande du relais d'origine, c'est ce qu'elle a toujours été.
      channel: r.channel || 'kiwi',
      ref: r.ext_ref || '',
      customer,
      session: r.session_id || '',
      server: r.server_name || '',
      paid: !!r.paid_ts,
      created_ts: r.created_ts, updated_ts: r.updated_ts,
      served_ts: r.status === 'served' ? (servedById.get(r.id) || null) : null,
      ...(followingById.has(r.id) ? { following: followingById.get(r.id) } : {}),
    };
  });
  if (service) {
    orders = orders.filter((order) => {
      if (order.created_ts && now - Number(order.created_ts) > 18 * 60 * 60 * 1000) return false;
      return order.mode === 'table' && service.allTables.has(normTable(order.table));
    });
  }

  /* Qui est assis en ce moment. Ce n'est pas la file : une table peut avoir un
   * téléphone posé dessus et zéro commande — c'est même l'état normal pendant
   * qu'on lit la carte, et c'est précisément ce que le plan de salle doit
   * montrer.
   *
   * Ce qui termine une session, c'est l'ADDITION, pas le silence du téléphone.
   * Une fenêtre courte (deux minutes de battement) éteignait la table dès que
   * le client verrouillait son écran pour parler à ses voisins — et le serveur
   * voyait une table se vider alors que les clients étaient toujours devant
   * leur plat. Deux heures : assez pour un repas entier téléphone en poche,
   * assez court pour qu'une session oubliée ne hante pas la salle toute la
   * journée. Le vrai ménage reste la fermeture à l'encaissement, et le garde-fou
   * des six heures dans session.js. */
  const PRESENCE_MS = 2 * 60 * 60 * 1000;
  let sessions = [];
  let closedSessions = [];
  const duplicateVisits = [];
  try {
    const live = await env.DB.prepare(
      `SELECT id, mode, table_no, opened_ts, seen_ts FROM table_sessions
        WHERE merchant = ? AND status = 'open' AND (seen_ts > ?
          OR EXISTS (SELECT 1 FROM orders o WHERE o.merchant = table_sessions.merchant
            AND o.session_id = table_sessions.id AND o.paid_ts IS NULL AND o.status <> 'rejected'))
        ORDER BY opened_ts LIMIT 200`
    ).bind(merchant, now - PRESENCE_MS).all();
    sessions = (live.results || []).map((s) => ({
      id: s.id, mode: s.mode || 'table', table: s.table_no || '',
      opened_ts: s.opened_ts, seen_ts: s.seen_ts,
    }));
  } catch (_) { sessions = []; }
  try {
    const closed = await env.DB.prepare(
      `SELECT id, mode, table_no, closed_ts, closed_by FROM table_sessions
        WHERE merchant = ? AND status = 'closed' AND closed_ts > ?
        ORDER BY closed_ts LIMIT 200`
    ).bind(merchant, now - 12 * 60 * 60 * 1000).all();
    closedSessions = (closed.results || []).map((s) => ({
      id: s.id, mode: s.mode || 'table', table: s.table_no || '',
      closed_ts: s.closed_ts, closed_by: s.closed_by || '',
    }));
  } catch (_) { closedSessions = []; }
  if (service) sessions = sessions.filter((session) => service.allTables.has(normTable(session.table)));
  if (service) closedSessions = closedSessions.filter((session) => service.allTables.has(normTable(session.table)));

  /* A void/reopen creates a payment visit, not a second kitchen order. Expose
   * its outstanding receipt as read-only floor context. Otherwise the waiter
   * sees an occupied table with an empty bill and is offered a 0-MAD payment.
   * Never graft the old paid order onto this visit: split parts that remain
   * paid would become payable twice. */
  const reopenedBills = service ? await reopenedFloorBills(env, merchant, sessions, now) : [];

  /* Ce qui a déjà été encaissé sur une visite ouverte sans solder de commande
   * (parts d'une addition partagée, acomptes d'une table fusionnée ici). Le
   * téléphone le retranche de l'addition : sans ce chiffre, une table
   * fusionnée après un paiement partiel proposait de nouveau le total. */
  if (service) {
    const credits = await visitCredits(env, merchant, sessions.map((s) => s.id));
    if (credits) sessions.forEach((s) => { if (credits.has(String(s.id))) s.creditCents = credits.get(String(s.id)); });
  }

  /* ── CE QUE LE TTL A TUÉ, LA CAISSE DOIT LE VOIR ──────────────────────────
   * Le rejet automatique (trente minutes sans validation, plus haut) est
   * terminal et INVISIBLE : `rejected` ne figure pas dans le WHERE de la
   * file, donc une commande à emporter jamais validée disparaissait des deux
   * côtés à la fois — plus au serveur, et l'instantané local la purgeait au
   * rechargement (staleQueuedServerTicket). Le client arrivait, le comptoir
   * ne trouvait rien, et personne ne pouvait dire si la commande n'avait
   * jamais existé. Pire : le ticket `held` local survivait en mémoire et
   * restait payable, c'est-à-dire qu'on pouvait encaisser une commande morte
   * (le serveur répond 409, la cuisine locale imprime quand même).
   *
   * On expose donc les refus récents, en lecture seule. La caisse s'en sert
   * à deux choses : invalider ses fantômes (un ticket local dont le serveur
   * dit « refusée » n'est plus payable) et montrer « Expirée · N°X » avec
   * reprise en un geste au lieu de « on ne trouve rien ». Lecture seule :
   * aucune transition ne ressuscite, la reprise crée une commande neuve. */
  let expired = [];
  try {
    const gone = await env.DB.prepare(
      `SELECT id, number, mode, table_no, total, lines, created_ts, updated_ts FROM orders
        WHERE merchant = ? AND status = 'rejected'
          AND (server_name IS NULL OR server_name <> 'dismissed')
          AND updated_ts > ?
        ORDER BY updated_ts DESC LIMIT 50`
    ).bind(merchant, now - EXPIRED_MS).all();
    expired = (gone.results || []).map((r) => {
      let lines = [];
      try {
        const parsed = JSON.parse(r.lines);
        if (Array.isArray(parsed)) {
          lines = parsed.slice(0, MAX_LINES).map((l) => ({
            name: String((l && l.name) || '').slice(0, 80),
            qty: Math.min(99, Math.max(1, Math.round(Number((l && l.qty) || 1)))),
            unitPrice: displayMoney(l && l.unitPrice),
            note: String((l && l.note) || '').slice(0, 200),
            station: String((l && l.station) || '').slice(0, 40),
          })).filter((l) => l.name);
        }
      } catch (_) { lines = []; }
      return {
        id: r.id, number: r.number, mode: r.mode, table: r.table_no || '',
        total: r.total, lines,
        /* A cancelled ticket is not just an old order-shaped row. The caisse
         * feeds this object back through the same ingestion bridge as a live
         * queue delta, where `status` is the terminal-state discriminator.
         * Omitting it made every poll rebuild the rejected ticket as active
         * immediately after removing it, which repeated the cancellation
         * toast forever and left its exact lines on the table bill. */
        status: 'rejected',
        created_ts: r.created_ts, updated_ts: r.updated_ts,
      };
    });
  } catch (_) { expired = []; }
  if (service) {
    expired = expired.filter((order) => {
      if (order.mode !== 'table') return true;
      return service.allTables.has(normTable(order.table));
    });
  }

  if (service) {
    /* The table number is furniture, not a bill id. Only expose orders that
       belong to the currently open visit on that table. This remains correct
       even on a production DB where the optional paid_ts migration is missing:
       closing the visit alone is enough to prevent its old rows from being
       reattached to the next clients. */
    /* Une TABLE peut porter plusieurs sessions ouvertes. Elle ne le devrait
     * pas — l'index unique partiel `table_sessions_live` l'interdit — mais cet
     * index fait partie des objets qu'une base déployée n'a peut-être jamais
     * reçus (`node tools/d1-schema.mjs` le dit). Sans lui, deux serveurs qui
     * ouvrent la même table dans la même seconde en créent deux.
     *
     * Ce code gardait UN identifiant par table dans une Map : le dernier écrit
     * écrasait l'autre, et toutes les commandes de la session perdante
     * disparaissaient de l'application du serveur qui les avait saisies. Le
     * serveur voyait sa table se vider en plein service, sans erreur.
     *
     * On accepte donc TOUTES les sessions ouvertes de la table. Un doublon
     * dégrade alors en « les deux serveurs voient les deux commandes » — ce qui
     * est le comportement souhaitable — au lieu d'en effacer la moitié. */
    const openVisitsByTable = new Map();
    sessions.forEach((session) => {
      if (!session || !session.table || !session.id) return;
      const key = normTable(session.table);
      if (!openVisitsByTable.has(key)) openVisitsByTable.set(key, new Set());
      openVisitsByTable.get(key).add(String(session.id));
    });
    orders = orders.filter((order) => {
      const visits = openVisitsByTable.get(normTable(order.table));
      return !!visits && !!order.session && visits.has(String(order.session)) && !order.paid;
    });
    /* Et on le DIT, au lieu de le rattraper en silence : un doublon signale un
     * index manquant, c'est-à-dire une réparation de schéma à faire. */
    for (const [table, visits] of openVisitsByTable) {
      if (visits.size > 1) duplicateVisits.push({ table, sessions: Array.from(visits) });
    }
  }

  return json({
    /* `now` EST le curseur du prochain sondage : il recule légèrement, sinon
       une commande écrite entre la prise de l'heure et la lecture n'est jamais
       présentée (voir pollCursor). */
    ok: true, orders, sessions, closedSessions,
    reopenedBills: reopenedBills || [], reopenedBillsAvailable: reopenedBills !== null,
    /* Old cached clients only know `now`. On a partial page, advance them to
     * just before its last timestamp instead of skipping unseen rows. New
     * clients drain `nextCursor` and use the full window cursor only at end. */
    now: hasMore ? Math.max(since, Number(lastRow.updated_ts) - 1) : pollCursor(pageEnd - CURSOR_LAG_MS),
    nextCursor, ordersAvailable: true,
    /* The server's clock and the store's zone: a kitchen tablet ages tickets (created_ts is server time) and prints their hour with these, not its own clock. */
    serverNow: now, zone,
    /* Refus récents (TTL ou comptoir), lecture seule : invalider les fantômes
       locaux et proposer la reprise. Absent = rien n'a été refusé récemment. */
    expired: expired.length ? expired : undefined,
    /* The KDS needs the same terminal signal even when the rejected row is no
       longer in the normal order stream. Keep this additive for older clients. */
    cancelledTickets: expired.length ? expired : undefined,
    /* Colonnes absentes de la base déployée. Vide = tout est là.
       `node tools/d1-schema.mjs` les pose. */
    degraded: degraded.length ? degraded : undefined,
    service: service ? {
      mineTables: Array.from(service.tables),
      allTables: Array.from(service.allTables),
      pausedTables: Array.from(service.pausedTables),
      pausedServers: service.pausedServers,
      duplicateVisits: duplicateVisits.length ? duplicateVisits : undefined,
      paused: !!(service.employee.attendance && service.employee.attendance.pauseTs),
    } : undefined,
  });
}
