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

import { json, entitledMerchant, activeServiceEmployee } from '../../auth/_lib.js';
import { startOfDay, startOfWeek, deskTouch, normTable, priceOrder, newSessionId, SESSION_ID, pollCursor } from './_lib.js';
import { recordOrderCourse, closeOrderCourses } from './_course.js';

function deferCourse(context, promise) {
  const safe = Promise.resolve(promise).catch(() => false);
  if (context && typeof context.waitUntil === 'function') context.waitUntil(safe);
}

/* Les transitions LÉGALES, par état d'arrivée. Avant, l'UPDATE ne regardait pas
 * l'état de départ : on pouvait faire passer une commande de `pending`
 * directement à `ready` sans que la cuisine l'ait jamais vue, ou ramener une
 * commande servie en préparation. Le téléphone, le comptoir et la cuisine
 * pouvaient alors se contredire, et une étape franchie se défaisait en silence.
 *
 * `served` accepte aussi `accepted` : un café tendu par-dessus le comptoir n'a
 * pas de passage par « prêt ». Les états terminaux (`served`, `rejected`) ne
 * figurent dans aucune liste de départ — donc rien ne les rouvre. */
const FROM = {
  accepted: ['pending'],
  rejected: ['pending'],
  ready:    ['accepted'],
  served:   ['ready', 'accepted'],
};
const ORDER_ID = /^ord-[a-z0-9-]{6,48}$/;

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
const PENDING_TTL_MS = 30 * 60 * 1000;
const KITCHEN_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_LINES = 60;              // une commande, généreusement
/* Au-delà de cet âge, le sondage d'un serveur en service ré-estampille les
 * sessions de ses tables. Cinq minutes : très en dessous des deux heures de
 * PRESENCE_MS, donc la table ne peut pas s'éteindre sous les pieds du serveur,
 * et assez espacé pour qu'un sondage toutes les six secondes n'écrive pas. */
const SERVICE_TOUCH_MS = 5 * 60 * 1000;
const MAX_TOTAL = 200000;          // 200 000 MAD — un garde-fou, pas une règle

function serviceNorm(value) {
  let s = String(value || '').trim().toLowerCase();
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  return s.replace(/\s+/g, ' ');
}
function employeeName(member) {
  return [member && member.firstName, member && member.lastName].filter(Boolean).join(' ').trim();
}
async function ensureServiceTableSession(env, merchant, table, now) {
  try {
    let row = await env.DB.prepare(
      `SELECT id, opened_ts FROM table_sessions
        WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open'
        ORDER BY opened_ts DESC LIMIT 1`
    ).bind(merchant, table).first();
    if (row && row.id) {
      /* Une commande de plus sur cette table EST un signe de vie. Sans cette
       * ligne, `seen_ts` restait figé à l'ouverture de la session : la fenêtre
       * de présence du GET (PRESENCE_MS) la laissait tomber au bout de deux
       * heures, et la caisse cessait alors d'attacher les tournées suivantes à
       * l'addition — le dessert et la deuxième bouteille n'étaient jamais
       * facturés. Voir aussi le pointage du service dans le GET. */
      try {
        await env.DB.prepare('UPDATE table_sessions SET seen_ts = ? WHERE id = ?')
          .bind(now, row.id).run();
      } catch (_) {}
      return row;
    }
    const id = newSessionId();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts)
       VALUES (?, ?, 'table', ?, 'open', ?, ?)`
    ).bind(id, merchant, table, now, now).run();
    row = await env.DB.prepare(
      `SELECT id, opened_ts FROM table_sessions
        WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open'
        ORDER BY opened_ts DESC LIMIT 1`
    ).bind(merchant, table).first();
    return row && row.id ? row : null;
  } catch (_) { return null; }
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
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true, allowEmployee: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

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
  const role = (url.searchParams.get('role') || '').trim().toLowerCase();
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
  const today = startOfDay(now);
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
  const WHERE = `FROM orders
        WHERE merchant = ? AND updated_ts > ?
          AND status IN ('pending','accepted','ready','served')
          AND (status = 'pending' OR created_ts >= ?)
          AND (status <> 'served' OR created_ts >= ?)
        ORDER BY created_ts
        LIMIT ?`;

  let rows = null;
  let degraded = [];
  for (let i = 0; i < COL_SETS.length; i++) {
    try {
      rows = await env.DB.prepare(`SELECT ${COL_SETS[i]} ${WHERE}`)
        .bind(merchant, since, kitchenCutoff, today, MAX_ROWS).all();
      degraded = COL_SET_MISSING[i];
      break;
    } catch (_) { rows = null; }
  }
  // Table pas migrée du tout → une file vide, jamais une erreur que la caisse
  // aurait à gérer. Elle continue d'interroger et s'allume au déploiement.
  if (!rows) return json({ ok: true, orders: [], sessions: [], now: pollCursor(now), ordersAvailable: false });

  let orders = (rows.results || []).map((r) => {
    let lines = [];
    try { lines = JSON.parse(r.lines) || []; } catch (_) { lines = []; }
    let customer = null;
    try { customer = r.customer ? JSON.parse(r.customer) : null; } catch (_) { customer = null; }
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
        WHERE merchant = ? AND status = 'open' AND seen_ts > ?
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
    ok: true, orders, sessions, closedSessions, now: pollCursor(now), ordersAvailable: true,
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

  /* Employee cookies may only CREATE a ticket for a real table in this store's
   * owner-managed floor plan. "Toutes les tables" is intentional coverage:
   * another on-duty server may help, while notifications continue to follow
   * the table's owner. A paused employee cannot submit orders. */
  const employee = await activeServiceEmployee(request, env, merchant);
  if (employee) {
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
    const validVoid = b && b.voidLine && b.voidLine.orderId && employeeVoidTable && scope && scope.allTables.has(employeeVoidTable);

    let employeeEditTable = b && b.editLine ? normTable(b.editLine.tableNo || b.editLine.table) : '';
    if (b && b.editLine && b.editLine.orderId && !employeeEditTable && env.DB) {
      try {
        const ord = await env.DB.prepare('SELECT table_no FROM orders WHERE id = ? AND merchant = ?').bind(b.editLine.orderId, merchant).first();
        if (ord && ord.table_no) employeeEditTable = normTable(ord.table_no);
      } catch (_) {}
    }
    const validEdit = b && b.editLine && b.editLine.orderId && employeeEditTable && scope && scope.allTables.has(employeeEditTable);

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

    if (!validCreate && !validOpen && !validClose && !validTransfer && !validMerge && !validVoid && !validAck && !validEdit && !validStatus) {
      return json({ error: 'floor-table-required' }, 403);
    }
    if (validCreate || validTransfer || validMerge || validVoid || validEdit || validStatus) {
      if (!b.server && employee.member) b.server = employeeName(employee.member);
    }
  }

  const now = Date.now();

  /* Seating is the beginning of the visit, not the first kitchen ticket.
   * Persist the visit as soon as the employee confirms the covers so caisse,
   * OrderPro and later orders all share one durable session identity. */
  const openTable = b && b.openTable != null ? normTable(b.openTable) : '';
  if (openTable) {
    const session = await ensureServiceTableSession(env, merchant, openTable, now);
    if (!session) return json({ error: 'service-session-unavailable' }, 503);
    return json({ ok: true, table: openTable, session: session.id, opened_ts: session.opened_ts });
  }

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
    if (priced.unknown.length || priced.unavailable.length || priced.invalidOptions.length) {
      return json({
        error: 'menu-changed',
        unknown: priced.unknown,
        unavailable: priced.unavailable,
        invalidOptions: priced.invalidOptions,
      }, 409);
    }
    if (!priced.lines.length) return json({ error: 'empty-order' }, 400);
    const total = priced.total;
    if (total <= 0 || total > MAX_TOTAL) return json({ error: 'bad-total' }, 400);

    const server = String((b && b.server) || '').trim().slice(0, 40);
    const today = startOfDay(now);
    const week = startOfWeek(now);
    /* Resolve a retry BEFORE opening a visit. A late Wi-Fi replay after the
       bill was paid must return its original ticket, not silently create a
       fresh open session for the now-empty physical table. */
    const clientRef = String((b && b.ref) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || null;
    if (clientRef) {
      try {
        const dup = await env.DB.prepare(
          `SELECT id, number, total, session_id FROM orders WHERE merchant = ? AND client_ref = ?`
        ).bind(merchant, clientRef).first();
        if (dup) {
          return json({ ok: true, id: dup.id, number: dup.number, total: dup.total,
                        session: dup.session_id || null, lines: priced.lines, replayed: true });
        }
      } catch (_) { /* colonne pas encore migrée → pas d'idempotence, comme avant */ }
    }
    /* A table number is reusable; a bill is not. Every employee ticket belongs
       to the current visit/session so a later party at table 3 never inherits
       yesterday's or the previous test's unpaid tickets. */
    const serviceSession = mode === 'table'
      ? await ensureServiceTableSession(env, merchant, table, now) : null;
    if (mode === 'table' && !serviceSession) return json({ error: 'service-session-unavailable' }, 503);

    /* Idempotence. Le double-envoi est PLUS probable en salle que sur le
     * téléphone du client : le wifi d'un café porte mal jusqu'au fond de la
     * terrasse, et un serveur qui ne voit pas sa confirmation retape sur
     * « Lancer ». Sans clé, la cuisine sortait deux fois le même plat. */
    const id = 'ord-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
    const linesJson = JSON.stringify(priced.lines);
    const NUMBER = `COALESCE(MAX(number), 0) + 1`;

    /* Deux écritures, une seule idée — même discipline que index.js : les
     * colonnes tardives (server_name, menu_rev, priced_ts, client_ref) font
     * échouer l'INSERT sur une base où la migration n'est pas passée, et il
     * vaut mieux un ticket sans nom de serveur que pas de ticket du tout. */
    let row = null;
    try {
      row = await env.DB.prepare(
        `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
                             created_ts, updated_ts, server_name, menu_rev, priced_ts, client_ref, session_id)
         SELECT ?, ?, ${NUMBER}, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?
           FROM orders WHERE merchant = ? AND created_ts >= ?
         RETURNING number`
      ).bind(
        id, merchant, mode, table, total, linesJson, now, now,
        server || null, priced.menuRev, priced.priced ? now : null, clientRef, serviceSession && serviceSession.id,
        merchant, week
      ).first();
    } catch (_) {
      /* La clé a-t-elle parlé avant la migration ? Deux envois simultanés de la
       * MÊME clé : le second se fait refuser par l'index unique et tombe ici.
       * Le relire évite qu'il réussisse en seconde chance sans clé — deux
       * tickets, deux numéros, deux fois le même plat en cuisine. */
      if (clientRef) {
        try {
          const raced = await env.DB.prepare(
            `SELECT id, number, total FROM orders WHERE merchant = ? AND client_ref = ?`
          ).bind(merchant, clientRef).first();
          if (raced) {
            return json({ ok: true, id: raced.id, number: raced.number, total: raced.total,
                          lines: priced.lines, replayed: true });
          }
        } catch (_) { /* colonne absente → c'était bien une base non migrée */ }
      }
      try {
        row = await env.DB.prepare(
          `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
                               created_ts, updated_ts, session_id)
           SELECT ?, ?, ${NUMBER}, ?, ?, ?, ?, 'accepted', ?, ?, ?
             FROM orders WHERE merchant = ? AND created_ts >= ?
           RETURNING number`
        ).bind(id, merchant, mode, table, total, linesJson, now, now,
          serviceSession && serviceSession.id, merchant, week).first();
      } catch (e) {
        return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
      }
    }

    deferCourse(context, recordOrderCourse(env, {
      merchant, orderId: id, orderNumber: (row && row.number) || 1,
      acceptedAt: now, sentAt: now,
    }));
    return json({
      ok: true, id, number: (row && row.number) || 1,
      status: 'accepted', total, lines: priced.lines, session: serviceSession && serviceSession.id,
    });
  }

  /* ── Transférer une table (Déplacement de convives) ─────────────────────────
   * Les convives changent de table (ex. de la salle vers la terrasse).
   * 1. On vérifie que la table de destination n'a pas déjà une session ouverte.
   * 2. On met à jour la session ouverte de la table d'origine vers la table de destination.
   * 3. On met à jour les commandes ouvertes de cette session vers la nouvelle table
   *    (pour que la cuisine et les additions pointent vers la bonne table physique).
   * 4. On consigne le transfert dans `table_transfers` pour l'historique comptable et d'audit. */
  if (b && b.transferTable && typeof b.transferTable === 'object') {
    const fromTable = normTable(b.transferTable.from);
    const toTable = normTable(b.transferTable.to);
    if (!fromTable || !toTable) return json({ error: 'invalid-tables' }, 400);
    if (fromTable === toTable) return json({ ok: true, same: true, table: toTable });

    const server = String((b.transferTable && b.transferTable.server) || (employee && employeeName(employee.member)) || '').trim().slice(0, 40);
    const covers = Math.max(1, Number(b.transferTable.covers) || 1);

    try {
      // 1. Vérifier si la table destination a déjà une session ouverte
      const targetBusy = await env.DB.prepare(
        `SELECT id FROM table_sessions WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open' LIMIT 1`
      ).bind(merchant, toTable).first();
      if (targetBusy && targetBusy.id) {
        return json({ error: 'target-table-occupied', targetTable: toTable }, 409);
      }

      // 2. Trouver la session active de la table d'origine
      const sourceSession = await env.DB.prepare(
        `SELECT id, opened_ts FROM table_sessions WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open' ORDER BY opened_ts DESC LIMIT 1`
      ).bind(merchant, fromTable).first();

      const sessionId = sourceSession ? String(sourceSession.id) : null;

      // 3. Déplacer la session
      if (sessionId) {
        await env.DB.prepare(
          `UPDATE table_sessions SET table_no = ?, seen_ts = ? WHERE id = ? AND merchant = ? AND status = 'open'`
        ).bind(toTable, now, sessionId, merchant).run();
      }

      // 4. Déplacer les commandes en cours de cette session ou table
      let orderCount = 0;
      if (sessionId) {
        const res = await env.DB.prepare(
          `UPDATE orders SET table_no = ?, updated_ts = ? WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL`
        ).bind(toTable, now, merchant, sessionId).run();
        orderCount = (res && res.meta && res.meta.changes) || 0;
      } else {
        const res = await env.DB.prepare(
          `UPDATE orders SET table_no = ?, updated_ts = ? WHERE merchant = ? AND table_no = ? AND paid_ts IS NULL`
        ).bind(toTable, now, merchant, fromTable).run();
        orderCount = (res && res.meta && res.meta.changes) || 0;
      }

      // 5. Enregistrer le déplacement dans le registre d'audit table_transfers
      const transferId = 'trf-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
      try {
        await env.DB.prepare(
          `INSERT INTO table_transfers (id, merchant, from_table, to_table, session_id, server, covers, orders_count, is_merge, created_ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
        ).bind(transferId, merchant, fromTable, toTable, sessionId, server || null, covers, orderCount, now).run();
      } catch (_) { /* table pas encore migrée */ }

      return json({
        ok: true,
        transferId,
        fromTable,
        toTable,
        sessionId,
        ordersMoved: orderCount,
        now,
      });
    } catch (e) {
      return json({ error: 'transfer-failed', detail: String((e && e.message) || e) }, 500);
    }
  }

  /* ── Fusionner deux tables (ex. Table 5 et Table 6 combinées) ───────────────
   * Deux tables sont rassemblées pour un grand groupe.
   * Les commandes de la table source sont rattachées à la session de la table cible.
   * La session source est close avec 'merged-into-X'. */
  if (b && b.mergeTables && typeof b.mergeTables === 'object') {
    const targetTable = normTable(b.mergeTables.targetTable || b.mergeTables.target);
    const sourceTable = normTable(b.mergeTables.sourceTable || b.mergeTables.source);
    if (!targetTable || !sourceTable) return json({ error: 'invalid-tables' }, 400);
    if (targetTable === sourceTable) return json({ ok: true, same: true, table: targetTable });

    const server = String((b.mergeTables && b.mergeTables.server) || (employee && employeeName(employee.member)) || '').trim().slice(0, 40);

    try {
      // 1. Session cible
      let targetSession = await env.DB.prepare(
        `SELECT id FROM table_sessions WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open' ORDER BY opened_ts DESC LIMIT 1`
      ).bind(merchant, targetTable).first();
      if (!targetSession) {
        targetSession = await ensureServiceTableSession(env, merchant, targetTable, now);
      }
      const targetSessionId = targetSession ? String(targetSession.id) : null;

      // 2. Session source
      const sourceSession = await env.DB.prepare(
        `SELECT id FROM table_sessions WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open' ORDER BY opened_ts DESC LIMIT 1`
      ).bind(merchant, sourceTable).first();
      const sourceSessionId = sourceSession ? String(sourceSession.id) : null;

      // 3. Déplacer les commandes de source vers target
      let movedOrders = 0;
      if (sourceSessionId && targetSessionId) {
        const res = await env.DB.prepare(
          `UPDATE orders SET table_no = ?, session_id = ?, updated_ts = ?
            WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL`
        ).bind(targetTable, targetSessionId, now, merchant, sourceSessionId).run();
        movedOrders = (res && res.meta && res.meta.changes) || 0;
      } else {
        const res = await env.DB.prepare(
          `UPDATE orders SET table_no = ?, session_id = COALESCE(?, session_id), updated_ts = ?
            WHERE merchant = ? AND table_no = ? AND paid_ts IS NULL`
        ).bind(targetTable, targetSessionId, now, merchant, sourceTable).run();
        movedOrders = (res && res.meta && res.meta.changes) || 0;
      }

      // 4. Clore la session source
      if (sourceSessionId) {
        await env.DB.prepare(
          `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = ?
            WHERE id = ? AND merchant = ? AND status = 'open'`
        ).bind(now, 'merged-into-' + targetTable, sourceSessionId, merchant).run();
      }

      // 5. Enregistrer la fusion dans table_transfers
      const mergeId = 'trf-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
      try {
        await env.DB.prepare(
          `INSERT INTO table_transfers (id, merchant, from_table, to_table, session_id, server, covers, orders_count, is_merge, created_ts)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, ?)`
        ).bind(mergeId, merchant, sourceTable, targetTable, targetSessionId, server || null, movedOrders, now).run();
      } catch (_) {}

      return json({
        ok: true,
        mergeId,
        targetTable,
        sourceTable,
        targetSessionId,
        ordersMerged: movedOrders,
        now,
      });
    } catch (e) {
      return json({ error: 'merge-failed', detail: String((e && e.message) || e) }, 500);
    }
  }

  async function dispatchPendingVoid(targetOrder, targetLines, lines, qtyToVoid, isWaste, actor, reason) {
    const list = Array.isArray(targetLines) ? targetLines : [targetLines];
    /* La quantité annulée est CELLE QUE L'APPELANT DEMANDE — le delta d'une
     * réduction (3 → 2 annule 1), jamais la ligne entière. Sur une formule,
     * le parent porte ce delta et chaque composant suit au prorata de sa
     * propre quantité : un menu enfant ×2 dont on retire un exemplaire rend
     * une frite, pas deux. Le premier élément de `list` est toujours la
     * ligne visée ; les suivants sont ses composants. */
    const primary = list[0];
    const askedQty = Math.max(1, Math.round(Number(qtyToVoid) || 1));
    const primaryQty = Math.max(1, Math.round(Number(primary && primary.qty) || 1));
    const ratio = Math.min(1, askedQty / primaryQty);
    let primaryVoidId = null;
    for (const tl of list) {
      const voidId = 'voi-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
      if (!primaryVoidId) primaryVoidId = voidId;
      const lineQty = Math.max(1, Math.round(Number(tl.qty) || 1));
      const voidQty = tl === primary ? Math.min(askedQty, lineQty) : Math.max(1, Math.min(lineQty, Math.round(lineQty * ratio)));
      tl.voidAlert = {
        id: voidId,
        qty: voidQty,
        reason: reason || 'client_change',
        actor: actor,
        isWaste: isWaste ? 1 : 0,
        ts: now,
      };
      try {
        await env.DB.prepare(
          `INSERT INTO kitchen_voids (id, merchant, order_id, table_no, item_id, item_name, qty, price, reason, is_waste, actor, status, created_ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
        ).bind(voidId, merchant, targetOrder.id, targetOrder.table_no, tl.id || tl.uid || '', tl.name || '', voidQty, tl.unitPrice ?? tl.price ?? 0, reason || 'client_change', isWaste ? 1 : 0, actor, now).run();
      } catch (err) {
        console.error('[queue] Failed to insert pending kitchen void alert', voidId, 'merchant', merchant);
      }
    }
    const nextTs = Math.max(now, (Number(targetOrder.updated_ts) || 0) + 1);

    await env.DB.prepare(
      `UPDATE orders SET lines = ?, updated_ts = ? WHERE id = ? AND merchant = ?`
    ).bind(JSON.stringify(lines), nextTs, targetOrder.id, merchant).run();

    return {
      ok: true,
      tier: 2,
      action: 'alert_dispatched',
      voidId: primaryVoidId,
      directVoid: false,
      alertSent: true,
      orderId: targetOrder.id,
      table: targetOrder.table_no,
      voidAlert: list[0] ? list[0].voidAlert : null,
      remainingLines: lines,
    };
  }

  /* ── Annuler une ligne de commande en cuisine (Protocole à 2 niveaux) ───────
   * 1. Si le plat n'a pas encore été accepté par la brigade (stationAccepted falsy) :
   *    -> Annulation directe en temps réel (le plat est retiré de la commande).
   * 2. Si le plat est en cours de préparation (stationAccepted true / cooking) :
   *    -> Une alerte d'annulation prioritaire (voidAlert) est posée sur la commande.
   *    -> La brigade reçoit une alerte visuelle et sonore sur le KDS avec boutons d'acquittement.
   * 3. Toutes les annulations sont auditées dans `kitchen_voids` avec leur motif et statut. */
  if (b && b.voidLine && typeof b.voidLine === 'object') {
    const table = normTable(b.voidLine.table);
    const lineId = String(b.voidLine.lineId || b.voidLine.itemId || b.voidLine.id || '').trim();
    const qtyToVoid = Math.max(1, Number(b.voidLine.qty) || 1);
    const reason = String(b.voidLine.reason || 'client_change').trim();
    const isWaste = b.voidLine.isWaste ? 1 : 0;
    const actor = String(b.voidLine.actor || (employee && employeeName(employee.member)) || 'Serveur').trim().slice(0, 40);

    if (!lineId) return json({ error: 'line-id-required' }, 400);

    // Trouver la commande active
    let targetOrder = null;
    if (b.voidLine.orderId) {
      targetOrder = await env.DB.prepare(
        `SELECT id, table_no, total, lines, status, updated_ts, number FROM orders WHERE id = ? AND merchant = ? AND paid_ts IS NULL`
      ).bind(b.voidLine.orderId, merchant).first();
    } else if (table) {
      targetOrder = await env.DB.prepare(
        `SELECT id, table_no, total, lines, status, updated_ts, number FROM orders WHERE merchant = ? AND table_no = ? AND paid_ts IS NULL ORDER BY created_ts DESC LIMIT 1`
      ).bind(merchant, table).first();
    }

    if (!targetOrder) return json({ error: 'order-not-found' }, 404);

    let lines = [];
    try { lines = JSON.parse(targetOrder.lines) || []; } catch (_) { lines = []; }

    const targetLine = lines.find(l => String(l.id) === lineId || String(l.uid) === lineId || String(l.name) === lineId);
    if (!targetLine) return json({ error: 'line-not-on-order' }, 404);

    const isFormula = targetLine.kind === 'formula' && !!targetLine.formulaUid;
    const affectedLines = isFormula
      ? lines.filter(l => l.formulaUid === targetLine.formulaUid || l === targetLine)
      : [targetLine];

    const isCooking = affectedLines.some(l => l.stationAccepted === true);
    const voidId = 'voi-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);

    if (!isCooking) {
      // ── Niveau 1 : Annulation immédiate (plat non entamé) ──────────────────
      if (!isFormula && targetLine.qty > qtyToVoid) {
        targetLine.qty -= qtyToVoid;
      } else {
        lines = lines.filter(l => !affectedLines.includes(l));
      }
      const newTotal = lines.reduce((s, l) => s + ((Number(l.unitPrice ?? l.price) || 0) * (Number(l.qty) || 0)), 0);
      const nextTs = Math.max(now, (Number(targetOrder.updated_ts) || 0) + 1);

      await env.DB.prepare(
        `UPDATE orders SET lines = ?, total = ?, updated_ts = ? WHERE id = ? AND merchant = ?`
      ).bind(JSON.stringify(lines), newTotal, nextTs, targetOrder.id, merchant).run();

      for (const affLine of affectedLines) {
        const vId = 'voi-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
        try {
          await env.DB.prepare(
            `INSERT INTO kitchen_voids (id, merchant, order_id, table_no, item_id, item_name, qty, price, reason, is_waste, actor, status, created_ts)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`
          ).bind(vId, merchant, targetOrder.id, targetOrder.table_no, affLine.id || affLine.uid || lineId, affLine.name || lineId, affLine.qty || qtyToVoid, affLine.unitPrice ?? affLine.price ?? 0, reason, isWaste, actor, now).run();
        } catch (err) {
          console.error('[queue] Failed to insert approved kitchen void record', vId, 'merchant', merchant);
        }
      }

      return json({
        ok: true,
        tier: 1,
        action: 'voided',
        voidId,
        directVoid: true,
        orderId: targetOrder.id,
        table: targetOrder.table_no,
        itemId: targetLine.id || lineId,
        itemName: targetLine.name || lineId,
        qty: qtyToVoid,
        isWaste: isWaste,
        remainingLines: lines,
        total: newTotal,
      });
    } else {
      return json(await dispatchPendingVoid(targetOrder, affectedLines, lines, qtyToVoid, isWaste, actor, reason));
    }
  }

  /* ── Modification d'une ligne envoyée (Serveur) ─────────────────────────
   * Si le plat n'est pas encore accepté par la cuisine :
   *   -> Mutation en place avec compare-and-set sur updated_ts (0 ligne kitchen_voids).
   *   -> En cas de conflit (acceptation simultanée en cuisine), relecture unique et réévaluation.
   * Si le plat est déjà accepté (stationAccepted true) :
   *   -> Changement de note refusé (409 / tier: 2).
   *   -> Diminution de quantité (qty down) -> alerte pendingVoid (tier 2).
   *   -> Augmentation de quantité (qty up) -> ajout d'une ligne non acceptée pour le delta (0 void). */
  if (b && b.editLine && typeof b.editLine === 'object') {
    const table = normTable(b.editLine.table);
    const lineId = String(b.editLine.lineId || b.editLine.itemId || b.editLine.id || '').trim();
    const actor = String(b.editLine.actor || (employee && employeeName(employee.member)) || 'Serveur').trim().slice(0, 40);
    const isWaste = b.editLine.isWaste ? 1 : 0;
    const reason = String(b.editLine.reason || 'edit_reduction').trim();

    if (!lineId) return json({ error: 'line-id-required' }, 400);

    let targetOrder = null;
    if (b.editLine.orderId) {
      targetOrder = await env.DB.prepare(
        `SELECT id, table_no, total, lines, status, updated_ts, number FROM orders WHERE id = ? AND merchant = ? AND paid_ts IS NULL`
      ).bind(b.editLine.orderId, merchant).first();
    } else if (table) {
      targetOrder = await env.DB.prepare(
        `SELECT id, table_no, total, lines, status, updated_ts, number FROM orders WHERE merchant = ? AND table_no = ? AND paid_ts IS NULL ORDER BY created_ts DESC LIMIT 1`
      ).bind(merchant, table).first();
    }

    if (!targetOrder) return json({ error: 'order-not-found' }, 404);

    let lines = [];
    try { lines = JSON.parse(targetOrder.lines) || []; } catch (_) { lines = []; }

    const targetLine = lines.find(l => String(l.id) === lineId || String(l.uid) === lineId || String(l.name) === lineId);
    if (!targetLine) return json({ error: 'line-not-on-order' }, 404);

    const oldQty = Number(targetLine.qty) || 0;
    const newQty = b.editLine.qty != null ? Math.max(0, Number(b.editLine.qty)) : oldQty;
    const oldNote = String(targetLine.note || '').trim();
    const newNote = b.editLine.note != null ? String(b.editLine.note).trim() : oldNote;
    const noteChanged = b.editLine.note != null && newNote !== oldNote;
    const qtyDelta = newQty - oldQty;

    const isFormula = targetLine.kind === 'formula' && !!targetLine.formulaUid;
    const affectedLines = isFormula
      ? lines.filter(l => l.formulaUid === targetLine.formulaUid || l === targetLine)
      : [targetLine];

    const isCooking = affectedLines.some(l => l.stationAccepted === true);

    // ── Branche post-acceptation ───────────────────────────────────────────
    if (isCooking) {
      if (noteChanged) {
        return json({ ok: false, error: 'accepted-cannot-edit-note', reason: 'accepted', tier: 2 }, 409);
      }
      if (qtyDelta < 0) {
        return json(await dispatchPendingVoid(targetOrder, affectedLines, lines, Math.abs(qtyDelta), isWaste, actor, reason));
      }
      if (qtyDelta > 0) {
        const newLine = {
          ...targetLine,
          uid: 'ln-' + crypto.randomUUID().slice(0, 8),
          qty: qtyDelta,
          stationAccepted: false,
          stationReady: false,
          voidAlert: null,
        };
        lines.push(newLine);
        const newTotal = lines.reduce((s, l) => s + ((Number(l.unitPrice ?? l.price) || 0) * (Number(l.qty) || 0)), 0);
        const nextTs = Math.max(now, (Number(targetOrder.updated_ts) || 0) + 1);
        await env.DB.prepare(
          `UPDATE orders SET lines = ?, total = ?, updated_ts = ? WHERE id = ? AND merchant = ?`
        ).bind(JSON.stringify(lines), newTotal, nextTs, targetOrder.id, merchant).run();

        return json({
          ok: true,
          tier: 1,
          action: 'appended',
          orderId: targetOrder.id,
          table: targetOrder.table_no,
          appendedLine: newLine,
          remainingLines: lines,
          total: newTotal,
        });
      }
      return json({ ok: true, noop: true });
    }

    // ── Branche pré-acceptation avec CAS sur updated_ts ─────────────────────
    let draftLines = lines.map(l => ({ ...l }));
    let draftLine = draftLines.find(l => String(l.id || l.uid) === lineId || String(l.name) === lineId);
    if (newQty === 0) {
      draftLines = draftLines.filter(l => !affectedLines.some(al => (al.uid && al.uid === l.uid) || al === l));
    } else {
      draftLine.qty = newQty;
      if (b.editLine.note != null) draftLine.note = newNote;
    }
    const newTotal = draftLines.reduce((s, l) => s + ((Number(l.unitPrice ?? l.price) || 0) * (Number(l.qty) || 0)), 0);
    const nextTs = Math.max(now, (Number(targetOrder.updated_ts) || 0) + 1);

    const casResult = await env.DB.prepare(
      `UPDATE orders SET lines = ?, total = ?, updated_ts = ? WHERE id = ? AND merchant = ? AND updated_ts = ?`
    ).bind(JSON.stringify(draftLines), newTotal, nextTs, targetOrder.id, merchant, targetOrder.updated_ts).run();

    const changes = Number((casResult && (casResult.meta && casResult.meta.changes != null ? casResult.meta.changes : casResult.changes)) || 0);

    if (changes === 0) {
      // Concurrence détectée : ré-évaluation fraîche
      const freshOrder = await env.DB.prepare(
        `SELECT id, table_no, total, lines, status, updated_ts, number FROM orders WHERE id = ? AND merchant = ? AND paid_ts IS NULL`
      ).bind(targetOrder.id, merchant).first();
      if (!freshOrder) return json({ error: 'order-not-found' }, 404);

      let freshLines = [];
      try { freshLines = JSON.parse(freshOrder.lines) || []; } catch (_) {}
      const freshLine = freshLines.find(l => String(l.id || l.uid) === lineId || String(l.name) === lineId);
      if (!freshLine) return json({ error: 'line-not-on-order' }, 404);

      const freshAffected = isFormula
        ? freshLines.filter(l => l.formulaUid === targetLine.formulaUid || l === freshLine)
        : [freshLine];
      const freshCooking = freshAffected.some(l => l.stationAccepted === true);

      if (freshCooking) {
        if (noteChanged) {
          return json({ ok: false, error: 'accepted-cannot-edit-note', reason: 'accepted', tier: 2 }, 409);
        }
        if (qtyDelta < 0) {
          return json(await dispatchPendingVoid(freshOrder, freshAffected, freshLines, Math.abs(qtyDelta), isWaste, actor, reason));
        }
        if (qtyDelta > 0) {
          const newLine = {
            ...freshLine,
            uid: 'ln-' + crypto.randomUUID().slice(0, 8),
            qty: qtyDelta,
            stationAccepted: false,
            stationReady: false,
            voidAlert: null,
          };
          freshLines.push(newLine);
          const freshTotal = freshLines.reduce((s, l) => s + ((Number(l.unitPrice ?? l.price) || 0) * (Number(l.qty) || 0)), 0);
          const freshNextTs = Math.max(now, (Number(freshOrder.updated_ts) || 0) + 1);
          await env.DB.prepare(
            `UPDATE orders SET lines = ?, total = ?, updated_ts = ? WHERE id = ? AND merchant = ?`
          ).bind(JSON.stringify(freshLines), freshTotal, freshNextTs, freshOrder.id, merchant).run();

          return json({
            ok: true, tier: 1, action: 'appended', orderId: freshOrder.id, table: freshOrder.table_no,
            appendedLine: newLine, remainingLines: freshLines, total: freshTotal,
          });
        }
        return json({ ok: true, noop: true });
      }

      // Toujours non accepté : appliquer la mutation fraîchement
      if (newQty === 0) {
        freshLines = freshLines.filter(l => l !== freshLine);
      } else {
        freshLine.qty = newQty;
        if (b.editLine.note != null) freshLine.note = newNote;
      }
      const freshTotal = freshLines.reduce((s, l) => s + ((Number(l.unitPrice ?? l.price) || 0) * (Number(l.qty) || 0)), 0);
      const freshNextTs = Math.max(now, (Number(freshOrder.updated_ts) || 0) + 1);
      await env.DB.prepare(
        `UPDATE orders SET lines = ?, total = ?, updated_ts = ? WHERE id = ? AND merchant = ?`
      ).bind(JSON.stringify(freshLines), freshTotal, freshNextTs, freshOrder.id, merchant).run();

      return json({
        ok: true, tier: 1, action: 'mutated', orderId: freshOrder.id, table: freshOrder.table_no,
        remainingLines: freshLines, total: freshTotal,
      });
    }

    return json({
      ok: true, tier: 1, action: 'mutated', orderId: targetOrder.id, table: targetOrder.table_no,
      remainingLines: draftLines, total: newTotal,
    });
  }

  /* ── Acquittement de l'annulation par la cuisine (KDS) ─────────────────────
   * Le chef valide l'arrêt de la préparation ou signale que le plat est déjà prêt. */
  if (b && b.ackVoid && typeof b.ackVoid === 'object') {
    const orderId = String(b.ackVoid.orderId || b.ackVoid.id || '').trim();
    const action = b.ackVoid.action === 'reject' ? 'reject' : 'accept';
    const isWaste = b.ackVoid.isWaste !== undefined ? (b.ackVoid.isWaste ? 1 : 0) : null;

    if (!orderId) return json({ error: 'order-id-required' }, 400);

    const targetOrder = await env.DB.prepare(
      `SELECT id, table_no, total, lines, status, updated_ts FROM orders WHERE id = ? AND merchant = ?`
    ).bind(orderId, merchant).first();

    if (!targetOrder) return json({ error: 'order-not-found' }, 404);

    let lines = [];
    try { lines = JSON.parse(targetOrder.lines) || []; } catch (_) { lines = []; }

    let voidIdFound = null;
    let voidItemFound = null;
    let voidQtyFound = 1;
    lines = lines.map(line => {
      if (line && line.voidAlert) {
        voidIdFound = line.voidAlert.id;
        voidItemFound = line.id || line.uid || line.name;
        voidQtyFound = Math.max(1, Number(line.voidAlert.qty) || 1);
        if (action === 'accept') {
          const vQty = voidQtyFound;
          if (line.qty > vQty) {
            return { ...line, qty: line.qty - vQty, voidAlert: null };
          } else {
            return null; // line removed
          }
        } else {
          // Chef rejected void: dish was already plated
          return { ...line, voidAlert: null, voidRejected: true, note: (line.note ? line.note + ' ' : '') + '[DÉJÀ PRÊT]' };
        }
      }
      return line;
    }).filter(Boolean);

    const newTotal = lines.reduce((s, l) => s + ((Number(l.unitPrice ?? l.price) || 0) * (Number(l.qty) || 0)), 0);
    const nextTs = Math.max(now, (Number(targetOrder.updated_ts) || 0) + 1);

    await env.DB.prepare(
      `UPDATE orders SET lines = ?, total = ?, updated_ts = ? WHERE id = ? AND merchant = ?`
    ).bind(JSON.stringify(lines), newTotal, nextTs, targetOrder.id, merchant).run();

    if (voidIdFound) {
      try {
        await env.DB.prepare(
          `UPDATE kitchen_voids SET status = ?, is_waste = COALESCE(?, is_waste) WHERE id = ? AND merchant = ?`
        ).bind(action === 'accept' ? 'approved' : 'rejected', isWaste, voidIdFound, merchant).run();
      } catch (err) {
        console.error('[queue] Failed to update kitchen void status for void', voidIdFound, 'merchant', merchant);
      }
    }

    return json({
      ok: true,
      action: action === 'accept' ? 'accepted' : 'rejected',
      orderId: targetOrder.id,
      voidId: voidIdFound,
      itemId: voidItemFound,
      qty: voidQtyFound,
      isWaste: isWaste !== null ? isWaste : 0,
      table: targetOrder.table_no,
      total: newTotal,
      lines,
    });
  }

  /* ── Fermer une session ────────────────────────────────────────────────────
   * C'est le geste qui coupe le robinet : l'addition est réglée, le téléphone
   * du client cesse de pouvoir commander et bascule sur le remerciement. La
   * caisse l'appelle depuis markPaid(), donc par la même porte gardée que le
   * reste — un client ne peut pas fermer sa propre session, et surtout pas
   * celle d'une autre table. */
  const closeSession = String((b && b.closeSession) || '').trim();
  const closeTable = (b && b.closeTable) != null ? normTable(b.closeTable) : '';
  if (closeSession || closeTable) {
    if (closeSession && !SESSION_ID.test(closeSession)) return json({ error: 'bad-session' }, 400);
    /* ── QUI A FERMÉ, ET CE QUI RESTAIT DÛ ─────────────────────────────────
     * N'importe quel serveur en service peut fermer n'importe quelle table de
     * la salle, et c'est VOULU : la couverture entre collègues est le
     * fonctionnement normal d'un service — celui qui passe débarrasse la table
     * de celui qui est en pause. Restreindre casserait le métier.
     *
     * Mais fermer ne solde pas (voir l'asymétrie plus bas), donc fermer la
     * table d'un collègue par erreur laissait une addition impayée derrière
     * soi, sans trace de l'auteur ni signal à l'écran. La couverture reste
     * libre ; elle cesse d'être anonyme et silencieuse. On note QUI ferme, et
     * on RÉPOND ce qui restait impayé pour que l'app puisse le dire tout de
     * suite — au moment où quelqu'un peut encore rattraper. */
    const closer = employee
      ? ('service:' + String(employee.member.id || employee.session.staffId || '')).slice(0, 48)
      : String((b && b.closedBy) || 'settle').slice(0, 48);
    const why = closer;
    let closed = 0;
    /* Compté AVANT la fermeture : après, les sessions ne sont plus ouvertes et
     * la question ne peut plus être posée. */
    let unpaid = 0;
    try {
      const pending = closeSession
        ? await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM orders
              WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL`
          ).bind(merchant, closeSession).first()
        : await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM orders o
               JOIN table_sessions s ON s.id = o.session_id
              WHERE o.merchant = ? AND s.table_no = ? AND s.status = 'open'
                AND o.paid_ts IS NULL`
          ).bind(merchant, closeTable).first();
      unpaid = Number((pending && pending.n) || 0);
    } catch (_) { unpaid = 0; }   // colonnes absentes ⇒ on ne prétend pas savoir
    try {
      const res = closeSession
        ? await env.DB.prepare(
            `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = ?
              WHERE id = ? AND merchant = ? AND status = 'open'`
          ).bind(now, why, closeSession, merchant).run()
        : await env.DB.prepare(
            `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = ?
              WHERE merchant = ? AND table_no = ? AND status = 'open'`
          ).bind(now, why, merchant, closeTable).run();
      closed = (res && res.meta && res.meta.changes) || 0;
    } catch (_) { /* table pas migrée → rien à fermer, et surtout pas d'échec de vente */ }

    /* Les commandes de cette session sont soldées avec elle. `paid_ts` n'est pas
     * un état : une commande peut être servie et payée, ou payée puis servie
     * (le retrait au comptoir), et confondre les deux aurait obligé la cuisine
     * à connaître la caisse.
     *
     * ── L'ASYMÉTRIE AVEC `closeTable` EST VOULUE ────────────────────────────
     * `closeSession` vient de markPaid() : l'addition VIENT d'être encaissée,
     * donc solder est la vérité. `closeTable` ne dit que « cette table est
     * libre » — un départ sans payer, une table nettoyée à la main, une remise
     * à zéro. Y ajouter `paid_ts` INVENTERAIT une recette : le rapport Z
     * compterait une addition que personne n'a réglée.
     *
     * Ce qui rendait l'asymétrie dangereuse a été corrigé ailleurs : le
     * règlement de /api/sale ne balaie plus « toutes les impayées de cette
     * table depuis minuit », il ne solde que la visite en cours. Une commande
     * laissée impayée par un `closeTable` reste donc impayée — visible comme
     * telle — au lieu d'être ramassée par le paiement de la tablée suivante. */
    try {
      if (closeSession) {
        await env.DB.prepare(
          `UPDATE orders SET paid_ts = ?, updated_ts = ?
            WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL`
        ).bind(now, now, merchant, closeSession).run();
      }
    } catch (_) {}
    deferCourse(context, closeOrderCourses(env, {
      merchant, sessionId: closeSession, table: closeTable, closedAt: now,
    }));
    return json({ ok: true, closed, unpaid: unpaid || undefined });
  }

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

  /* "Accepter" is preparation progress, not an order-state transition: the
   * order already reached KDS as accepted. Store the progress on each line so
   * Bar accepting its drinks does not move Kitchen, and so every KDS device
   * sees the same result. An empty station is the deliberate "Toutes" action. */
  const acceptedStation = String((b && b.station) || '').trim().slice(0, 40);
  if (status === 'cooking') {
    for (let attempt = 0; attempt < 4; attempt++) {
      let current = null;
      try {
        current = await env.DB.prepare(
          'SELECT lines, status, updated_ts, number FROM orders WHERE id = ? AND merchant = ?'
        ).bind(id, merchant).first();
      } catch (e) {
        return json({ error: 'read-failed', detail: String((e && e.message) || e) }, 500);
      }
      if (!current) return json({ error: 'not-found' }, 404);
      if (current.status !== 'accepted') {
        return json({ error: 'bad-transition', status: current.status, number: current.number }, 409);
      }
      let lines = [];
      try { lines = JSON.parse(current.lines) || []; } catch (_) { lines = []; }
      let matched = false;
      lines = lines.map((line) => {
        if (acceptedStation && String((line && line.station) || '') !== acceptedStation) return line;
        matched = true;
        return { ...line, stationAccepted: true };
      });
      if (!matched) return json({ error: acceptedStation ? 'station-not-on-order' : 'empty-order' }, 400);
      const previousTs = Number(current.updated_ts) || 0;
      const nextTs = Math.max(now, previousTs + 1);
      let changed = null;
      try {
        changed = await env.DB.prepare(
          `UPDATE orders SET lines = ?, updated_ts = ?
            WHERE id = ? AND merchant = ? AND status = 'accepted' AND updated_ts = ?
            RETURNING id, status, number`
        ).bind(JSON.stringify(lines), nextTs, id, merchant, previousTs).first();
      } catch (e) {
        return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
      }
      if (changed) {
        if (changed.status === 'ready') {
          deferCourse(context, recordOrderCourse(env, {
            merchant, orderId: changed.id, orderNumber: changed.number, readyAt: nextTs,
          }));
        }
        return json({ ok: true, id: changed.id, status: changed.status,
                      number: changed.number, station: acceptedStation, lines });
      }
    }
    return json({ error: 'concurrent-update', retry: true }, 409);
  }

  /* A station completes only its own lines. The ready bits live inside the
   * existing lines JSON, so this works on every deployed database without a
   * schema change. Optimistic compare-and-swap prevents bar + kitchen taps at
   * the same instant from overwriting each other. `station` absent means the
   * "Toutes" tab and deliberately completes the whole order below. */
  const readyStation = String((b && b.station) || '').trim().slice(0, 40);
  if (status === 'ready' && readyStation) {
    for (let attempt = 0; attempt < 4; attempt++) {
      let current = null;
      try {
        current = await env.DB.prepare(
          'SELECT lines, status, updated_ts, number FROM orders WHERE id = ? AND merchant = ?'
        ).bind(id, merchant).first();
      } catch (e) {
        return json({ error: 'read-failed', detail: String((e && e.message) || e) }, 500);
      }
      if (!current) return json({ error: 'not-found' }, 404);
      if (current.status !== 'accepted' && current.status !== 'ready') {
        return json({ error: 'bad-transition', status: current.status, number: current.number }, 409);
      }
      let lines = [];
      try { lines = JSON.parse(current.lines) || []; } catch (_) { lines = []; }
      let matched = false;
      lines = lines.map((line) => {
        if (String((line && line.station) || '') !== readyStation) return line;
        matched = true;
        return { ...line, stationReady: true };
      });
      if (!matched) return json({ error: 'station-not-on-order' }, 400);
      const allReady = lines.length > 0 && lines.every((line) => line && line.stationReady === true);
      const nextStatus = allReady ? 'ready' : 'accepted';
      const previousTs = Number(current.updated_ts) || 0;
      const nextTs = Math.max(now, previousTs + 1);
      let changed = null;
      try {
        changed = await env.DB.prepare(
          `UPDATE orders SET lines = ?, status = ?, updated_ts = ?
            WHERE id = ? AND merchant = ? AND updated_ts = ?
            RETURNING id, status, number`
        ).bind(JSON.stringify(lines), nextStatus, nextTs, id, merchant, previousTs).first();
      } catch (e) {
        return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
      }
      if (changed) {
        return json({ ok: true, id: changed.id, status: changed.status,
                      number: changed.number, station: readyStation, lines });
      }
    }
    return json({ error: 'concurrent-update', retry: true }, 409);
  }
  /* hasOwnProperty, et non `FROM[status]`. Un objet littéral hérite d'Object
   * .prototype, donc `FROM['constructor']`, `FROM['toString']`, `FROM['valueOf']`
   * — et toute autre clé du prototype — répondaient une FONCTION, qui est
   * « truthy » : la garde `if (!from)` les laissait passer, puis `from.map()`
   * quelques lignes plus bas levait un TypeError NON rattrapé (il est hors du
   * try). Résultat : `{"status":"constructor"}` ne recevait pas le 400
   * « bad-status » prévu, mais faisait tomber la Function en 500. Rien ne
   * s'écrivait en base — l'état des commandes n'a jamais été en jeu — mais un
   * corps malformé pouvait faire crier la caisse au lieu de se faire refuser
   * proprement, et c'est ce qu'un scanner trouve en premier. */
  const from = Object.prototype.hasOwnProperty.call(FROM, status) ? FROM[status] : null;
  if (!from) return json({ error: 'bad-status' }, 400);

  // Le serveur affecté à la table, posé au moment de l'acceptation : le ticket
  // cuisine porte alors un nom, au lieu d'obliger la brigade à demander « c'est
  // pour qui, la 7 ? ». Chaîne bornée — elle vient déjà d'une porte gardée.
  const server = String((b && b.server) || '').trim().slice(0, 40);
  const paid = b && b.paid === true;

  const marks = from.map(() => '?').join(',');
  let row;
  try {
    /* Un seul énoncé, donc deux caisses qui acceptent la même commande au même
     * instant ne peuvent pas la faire avancer deux fois : la seconde ne trouve
     * plus l'état de départ et RETURNING revient vide.
     *
     * merchant dans le WHERE garde un magasin d'agir sur les tickets d'un autre
     * — ce qui n'est vrai que depuis que `merchant` est dérivé du serveur. */
    row = await env.DB.prepare(
      `UPDATE orders
          SET status = ?, updated_ts = ?,
              server_name = COALESCE(NULLIF(?, ''), server_name),
              paid_ts = CASE WHEN ? = 1 AND paid_ts IS NULL THEN ? ELSE paid_ts END
        WHERE id = ? AND merchant = ? AND status IN (${marks})
        RETURNING id, status, number`
    ).bind(status, now, server, paid ? 1 : 0, now, id, merchant, ...from).first();
  } catch (_) {
    // Colonnes de session pas encore migrées : on fait avancer l'état seul.
    try {
      row = await env.DB.prepare(
        `UPDATE orders SET status = ?, updated_ts = ?
          WHERE id = ? AND merchant = ? AND status IN (${marks})
          RETURNING id, status, number`
      ).bind(status, now, id, merchant, ...from).first();
    } catch (e) {
      return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
    }
  }

  /* Rien mis à jour : soit la commande n'existe pas chez ce commerçant, soit
   * elle n'était pas dans un état d'où ce pas est permis. Les deux méritent des
   * réponses différentes — un 404 ferait croire à une commande disparue alors
   * qu'un collègue vient simplement de l'accepter avant nous. */
  if (!row) {
    let cur = null;
    try {
      cur = await env.DB.prepare('SELECT status, number FROM orders WHERE id = ? AND merchant = ?')
        .bind(id, merchant).first();
    } catch (_) {}
    if (!cur) return json({ error: 'not-found' }, 404);
    return json({ error: 'bad-transition', status: cur.status, number: cur.number }, 409);
  }

  const milestone = status === 'accepted'
    ? { acceptedAt: now, sentAt: now }
    : (status === 'ready' ? { readyAt: now } : (status === 'served' ? { servedAt: now } : null));
  if (milestone) {
    deferCourse(context, recordOrderCourse(env, Object.assign({
      merchant, orderId: row.id, orderNumber: row.number,
    }, milestone)));
  }

  /* ── La remise en main propre CLÔT la session du comptoir ─────────────────
   * Un retrait au comptoir n'a pas d'addition à encaisser plus tard : si rien
   * ne fermait sa session ici, le client repartait avec son sac ET un lien
   * toujours actif, et pouvait continuer à commander depuis le trottoir. La
   * commande servie était bien terminale, la SESSION ne l'était pas — et c'est
   * elle qui autorise la suivante.
   *
   * En salle, au contraire, « servie » veut dire que le plat est arrivé sur la
   * table : les convives mangent, ils commanderont peut-être un dessert. Leur
   * session ne se ferme qu'à l'addition (closeSession, plus haut). D'où le
   * test sur le mode, et non sur le seul statut. */
  if (status === 'served') {
    try {
      const own = await env.DB.prepare(
        `SELECT s.id AS sid FROM orders o
           JOIN table_sessions s ON s.id = o.session_id
          WHERE o.id = ? AND o.merchant = ? AND s.mode = 'takeout' AND s.status = 'open'`
      ).bind(id, merchant).first();
      if (own && own.sid) {
        await env.DB.prepare(
          `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = 'served'
            WHERE id = ? AND status = 'open'`
        ).bind(now, own.sid).run();
      }
    } catch (_) { /* colonnes/table absentes → rien à fermer, la vente reste faite */ }
  }

  return json({ ok: true, id: row.id, status: row.status, number: row.number });
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
/* MAX_LINES est déclaré une fois pour tout le fichier, en tête — la salle et le
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
      unitPrice: Math.max(0, Math.round(Number(l.unitPrice) || 0)),
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
    out.push(line);
  }
  return out;
}

async function createTicket(context, env, merchant, c, now) {
  const id = String(c.id || '').trim();
  if (!ORDER_ID.test(id)) return json({ error: 'bad-id' }, 400);

  const lines = cleanLines(c.lines);
  if (!lines.length) return json({ error: 'empty-order' }, 400);

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
  const ticketSession = mode === 'table' && table
    ? await ensureServiceTableSession(env, merchant, table, now) : null;
  const sessionId = ticketSession && ticketSession.id ? ticketSession.id : null;
  const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const linesJson = JSON.stringify(lines);
  const week = startOfWeek(now);

  /* Renvoi du même bon (le réseau est tombé, la caisse rejoue). On rend la
   * commande telle qu'elle est, sans rien réécrire : elle a peut-être déjà été
   * marquée prête en cuisine entre-temps, et un UPDATE la ferait reculer. */
  try {
    const dup = await env.DB.prepare(
      'SELECT id, number, status FROM orders WHERE id = ? AND merchant = ?'
    ).bind(id, merchant).first();
    if (dup) return json({ ok: true, id: dup.id, number: dup.number, status: dup.status, replayed: true });
  } catch (_) { /* table absente → l'insertion ci-dessous tranchera */ }

  /* Même numérotation que le relais téléphone : un compteur par commerçant et
   * par semaine, calculé dans l'énoncé lui-même pour qu'il n'y ait pas de fenêtre
   * entre « lire le max » et « écrire ». MAX() sans GROUP BY rend toujours une
   * ligne, donc le premier bon de la semaine reçoit bien le numéro 1. */
  const NUMBER = 'COALESCE(MAX(number), 0) + 1';
  const FROM_WEEK = `FROM orders WHERE merchant = ? AND created_ts >= ? RETURNING number`;
  const BASE_COLS = 'id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts';
  const BASE_VALS = `?, ?, ${NUMBER}, ?, ?, ?, ?, 'accepted', ?, ?`;
  const head = [id, merchant, mode, table, total, linesJson, now, now];
  const tail = [merchant, week];

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
  for (const s of SHAPES) {
    try {
      row = await env.DB.prepare(`INSERT INTO orders (${s.cols}) SELECT ${s.vals} ${FROM_WEEK}`)
        .bind(...head, ...s.mid, ...tail).first();
      lastErr = null;
      break;
    } catch (e) { lastErr = e; row = null; }
  }

  if (lastErr) {
    /* Course avec un rejeu simultané du même identifiant : la clé primaire a
     * parlé. On relit et on rend la commande de l'autre requête, exactement
     * comme un renvoi tardif — jamais un deuxième bon. */
    try {
      const raced = await env.DB.prepare(
        'SELECT id, number, status FROM orders WHERE id = ? AND merchant = ?'
      ).bind(id, merchant).first();
      if (raced) return json({ ok: true, id: raced.id, number: raced.number, status: raced.status, replayed: true });
    } catch (_) {}
    return json({ error: 'write-failed', detail: String((lastErr && lastErr.message) || lastErr) }, 500);
  }

  deferCourse(context, recordOrderCourse(env, {
    merchant, orderId: id, orderNumber: (row && row.number) || 1,
    acceptedAt: now, sentAt: now,
  }));
  return json({ ok: true, id, number: (row && row.number) || 1, status: 'accepted', total });
}
