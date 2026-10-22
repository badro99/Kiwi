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
const MAX_ROWS = 100;
/* The queue may contain more than one page after a disconnected service.
 * A cursor needs both timestamp and id: many orders can share the same
 * millisecond, and a timestamp-only continuation would skip the rest. */
function readPageCursor(raw, now) {
  if (!raw || raw.length > 300) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.v !== 1 || !Number.isSafeInteger(value.end)
      || !Number.isSafeInteger(value.ts) || value.end > now + CURSOR_LAG_MS
      || value.ts < 0 || value.ts > value.end
      || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id)) return null;
    return value;
  } catch (_) { return null; }
}
const PENDING_TTL_MS = 30 * 60 * 1000;
const KITCHEN_TTL_MS = 6 * 60 * 60 * 1000;
const OPEN_VISIT_RECOVERY_MS = 7 * 24 * 60 * 60 * 1000;
// Archive changes are tombstones for tills with a saved shift. They must be
// delivered even when the original order is older than the kitchen window.
const ARCHIVED_TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000;
/* Combien de temps une commande refusée reste lisible comme « expirée » dans
 * le sondage. Deux heures : assez pour qu'un client qui arrive avec du retard
 * retrouve sa commande au comptoir et la fasse reprendre, assez court pour ne
 * pas transformer la file en archive. Voir le bloc `expired` dans onRequestGet. */
const EXPIRED_MS = 2 * 60 * 60 * 1000;
/* Au-delà de cet âge, le sondage d'un serveur en service ré-estampille les
 * sessions de ses tables. Cinq minutes : très en dessous des deux heures de
 * PRESENCE_MS, donc la table ne peut pas s'éteindre sous les pieds du serveur,
 * et assez espacé pour qu'un sondage toutes les six secondes n'écrive pas. */
const SERVICE_TOUCH_MS = 5 * 60 * 1000;

function serviceNorm(value) {
  let s = String(value || '').trim().toLowerCase();
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  return s.replace(/\s+/g, ' ');
}
async function serviceScope(request, env, merchant) {
  const employee = await activeServiceEmployee(request, env, merchant);
  if (!employee) return null;
  const tables = new Set(), allTables = new Set(), pausedTables = new Set();
  const pausedServers = [];
  try {
    const [row, attendanceRow, teamRow] = await Promise.all([
      env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'floorplan'").bind(merchant).first(),
      env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'attendance'").bind(merchant).first(),
      env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'").bind(merchant).first(),
    ]);
    const plan = JSON.parse((row && row.data) || '{}');
    const attendance = JSON.parse((attendanceRow && attendanceRow.data) || '{}');
    const team = JSON.parse((teamRow && teamRow.data) || '{}');
    const staff = Object.create(null);
    (Array.isArray(plan.staff) ? plan.staff : []).forEach((s) => { if (s && s.id) staff[String(s.id)] = s; });
    const members = Array.isArray(team.members) ? team.members : [];
    const memberIds = new Set(members.map((m) => String(m && m.id || '')).filter(Boolean));
    const memberByName = new Map(members.map((m) => [serviceNorm(employeeName(m)), String(m && m.id || '')]));
    const assignedMemberId = (value) => {
      const raw = String(value || '');
      if (memberIds.has(raw)) return raw;
      const legacy = raw.startsWith('tm-') ? raw.slice(3) : '';
      if (legacy && memberIds.has(legacy)) return legacy;
      return memberByName.get(serviceNorm(staff[raw] && staff[raw].name)) || raw;
    };
    const pausedIds = new Set(), pausedNames = new Set();
    (Array.isArray(attendance.entries) ? attendance.entries : []).forEach((entry) => {
      if (!entry || entry.outTs || !entry.pauseTs) return;
      const id = String(entry.memberId || entry.staffId || '');
      const name = serviceNorm(entry.name);
      if (id) pausedIds.add(id);
      if (name) pausedNames.add(name);
    });
    const myId = String(employee.member.id || employee.session.staffId || '');
    const myName = serviceNorm(employeeName(employee.member));
    (Array.isArray(plan.tables) ? plan.tables : []).forEach((table) => {
      if (!table) return;
      const tableId = normTable(table.num || table.id);
      if (!tableId) return;
      allTables.add(tableId);
      const rawAssigned = Array.isArray(table.servers) && table.servers.length
        ? table.servers : (table.server ? [table.server] : []);
      if (!rawAssigned.length) { tables.add(tableId); return; }
      const assigned = Array.from(new Set(rawAssigned.map(assignedMemberId).filter(Boolean)));
      const assignedNames = rawAssigned.map((id) => serviceNorm(staff[String(id)] && staff[String(id)].name)).filter(Boolean);
      if (assigned.includes(myId) || assignedNames.includes(myName)) {
        tables.add(tableId);
      }
      if (assigned.some((id) => pausedIds.has(id)) || assignedNames.some((name) => pausedNames.has(name))) {
        pausedTables.add(tableId);
        assigned.forEach((id, index) => {
          if (!pausedIds.has(id) && !pausedNames.has(assignedNames[index])) return;
          if (!pausedServers.some((s) => s.id === id)) pausedServers.push({ id, name: assignedNames[index] || id });
        });
      }
    });
  } catch (_) {}
  return { employee, tables, allTables, pausedTables, pausedServers, name: serviceNorm(employeeName(employee.member)) };
}

/* Les colonnes se sont ajoutées par vagues : `channel/ext_ref/customer` avec la
 * livraison, `session_id/server_name/paid_ts` avec la session de table. Une base
 * où une vague n'est pas passée fait échouer le SELECT qui la nomme, et un
 * SELECT qui échoue rendrait ici une file VIDE — le comptoir ne verrait plus
 * rien, sans que rien ne le signale. On essaie donc du plus riche au plus
 * pauvre, et on s'arrête au premier qui répond. */
const BASE = 'id, number, mode, table_no, total, lines, status, created_ts, updated_ts';
const COL_SETS = [
  BASE + ', channel, ext_ref, customer, session_id, server_name, paid_ts',
  BASE + ', channel, ext_ref, customer',
  BASE + ', session_id, server_name, paid_ts',
  BASE,
];
/* Ce que la base N'A PAS quand c'est cette forme-là qui a répondu.
 *
 * Le repli est volontaire — mieux vaut une file dégradée qu'une file vide —
 * mais il était MUET, et c'est ce qui coûtait cher : une base sans
 * `session_id` sert des commandes que l'app employé n'affichera jamais, une
 * base sans `client_ref` n'a plus aucune protection contre le doublon, et dans
 * les deux cas tout paraît sain. On le dit donc, dans la réponse, à chaque
 * sondage : c'est la différence entre « ça marche » et « ça marche encore ». */
const COL_SET_MISSING = [
  [],
  ['session_id', 'server_name', 'paid_ts'],
  ['channel', 'ext_ref', 'customer'],
  ['channel', 'ext_ref', 'customer', 'session_id', 'server_name', 'paid_ts'],
];

export async function reopenedFloorBills(env, merchant, sessions, now = Date.now()) {
  if (!sessions.length) return [];
  try {
    const active = new Map(sessions.map(s => [String(s.id), s]));
    const visitIds = sessions.map(s => String(s.id));
    const where = `FROM sale_audit a WHERE a.merchant = ? AND a.action = 'reopen' AND a.ts > ?
      AND json_valid(a.impact) AND json_extract(a.impact, '$.sessionId') IN (${visitIds.map(() => '?').join(',')})
      ORDER BY a.ts DESC`;
    let rows;
    try {
      rows = await env.DB.prepare(`SELECT a.sale_id, a.ref, a.amount, a.amount_cents, a.impact ${where}`)
        .bind(merchant, now - 36 * 60 * 60 * 1000, ...visitIds).all();
    } catch (_) {
      rows = await env.DB.prepare(`SELECT a.sale_id, a.ref, a.amount, a.impact ${where}`)
        .bind(merchant, now - 36 * 60 * 60 * 1000, ...visitIds).all();
    }
    const seen = new Set();
    return (rows.results || []).flatMap(row => {
      let impact;
      try { impact = JSON.parse(row.impact || '{}'); } catch (_) { return []; }
      const visit = active.get(String(impact.sessionId || ''));
      if (!visit || seen.has(visit.id)) return [];
      seen.add(visit.id);
      const cents = row.amount_cents != null ? Number(row.amount_cents)
        : impact.totals && impact.totals.amountCents != null && Number.isFinite(Number(impact.totals.amountCents))
          ? Number(impact.totals.amountCents) : Math.round(Number(row.amount || 0) * 100);
      return [{ session: visit.id, table: visit.table, saleId: row.sale_id,
        ref: String(row.ref || '').slice(0, 96), amountCents: Math.max(0, Math.round(cents) || 0),
        lines: Array.isArray(impact.lines) ? impact.lines.slice(0, 40).map(line => ({
          name: String(line && line.name || 'Article').slice(0, 80),
          qty: Math.max(0, Number(line && line.qty) || 0),
          total: Math.max(0, Number(line && line.total) || 0),
        })) : [] }];
    });
  } catch (_) { return null; }
}

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
  const today = startOfDay(now, await merchantZone(env, merchant));
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

    let employeeVoidTable = b && b.voidLine ? normTable(b.voidLine.tableNo || b.voidLine.table) : '';
    if (b && b.voidLine && b.voidLine.orderId && !employeeVoidTable && env.DB) {
      try {
        const ord = await env.DB.prepare('SELECT table_no FROM orders WHERE id = ? AND merchant = ?').bind(b.voidLine.orderId, merchant).first();
        if (ord && ord.table_no) employeeVoidTable = normTable(ord.table_no);
      } catch (_) {}
    }
    const validVoid = b && b.voidLine && employeeVoidTable && scope && scope.allTables.has(employeeVoidTable);

    let employeeEditTable = b && b.editLine ? normTable(b.editLine.tableNo || b.editLine.table) : '';
    if (b && b.editLine && b.editLine.orderId && !employeeEditTable && env.DB) {
      try {
        const ord = await env.DB.prepare('SELECT table_no FROM orders WHERE id = ? AND merchant = ?').bind(b.editLine.orderId, merchant).first();
        if (ord && ord.table_no) employeeEditTable = normTable(ord.table_no);
      } catch (_) {}
    }
    const validEdit = b && b.editLine && employeeEditTable && scope && scope.allTables.has(employeeEditTable);

    const employeeCancelTable = b && b.cancelTable ? normTable(b.cancelTable.table || b.cancelTable) : '';
    const validCancelTable = employeeCancelTable && scope && scope.allTables.has(employeeCancelTable);

    let employeeAckTable = b && b.ackVoid ? normTable(b.ackVoid.tableNo || b.ackVoid.table) : '';
    if (b && b.ackVoid && b.ackVoid.orderId && !employeeAckTable && env.DB) {
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
