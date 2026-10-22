// Les transitions d'état d'une commande, côté file (/api/order/queue) :
// accepter, refuser, prête, servie (encaissement et remise compris), et le
// classement d'un emporter payé. Déplacé tel quel depuis queue.js, qui garde
// la répartition.

import { json } from '../../auth/_lib.js';
import { recordOrderCourse, closeOrderCourses } from './_course.js';
import { deferCourse, displayMoney, operationId, atomicStatements, statement, employeeName } from './_queue-shared.js';

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
  rejected: ['pending', 'accepted', 'ready'],
  ready:    ['accepted'],
  served:   ['ready', 'accepted'],
};

export async function archiveTakeout(ctx, id, status) {
  const { env, merchant, now, pinActor } = ctx;
  /* A paid takeaway can outlive the six-hour kitchen window on a saved till.
   * Filing it away is NOT a handover, cancellation, refund, or new sale. Keep
   * the paid timestamp and order lines untouched and require a named till
   * operator, so a stray tap cannot silently hide a customer's pickup. */
  if (status === 'archived') {
    if (!pinActor) return json({ error: 'operator-proof-required' }, 403);
    let current;
    try {
      current = await env.DB.prepare(
        'SELECT number, mode, status, paid_ts, updated_ts FROM orders WHERE id = ? AND merchant = ?'
      ).bind(id, merchant).first();
    } catch (_) { return json({ error: 'archive-read-failed' }, 503); }
    if (!current) return json({ error: 'not-found' }, 404);
    if (current.status === 'archived') return json({ ok: true, id, status, number: current.number, replayed: true });
    if (current.mode !== 'takeout' || current.paid_ts == null || !['accepted', 'ready'].includes(current.status)) {
      return json({ error: 'archive-not-eligible', status: current.status, number: current.number }, 409);
    }
    try {
      const archivedAt = Math.max(now, Number(current.updated_ts || 0) + 1);
      const update = statement(env,
        `UPDATE orders SET status = 'archived', updated_ts = ?
          WHERE id = ? AND merchant = ? AND mode = 'takeout' AND paid_ts IS NOT NULL
            AND status IN ('accepted','ready') AND updated_ts = ?`,
        archivedAt, id, merchant, current.updated_ts);
      const audit = statement(env,
        `INSERT OR IGNORE INTO operational_events (id,command_id,merchant,event,status,detail,created_ts)
          SELECT ?, ?, ?, 'takeout-archived', 'ok', ?, ?
            WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND merchant = ?
              AND status = 'archived' AND updated_ts = ?)`,
        operationId(id + '-' + merchant, 'archive'), id, merchant,
        JSON.stringify({ actorId: pinActor.id || '', actorName: pinActor.name || '', previousStatus: current.status }),
        archivedAt, id, merchant, archivedAt);
      const results = await atomicStatements(env, [update, audit]);
      if (!Number(results?.[0]?.meta?.changes || 0)) return json({ error: 'concurrent-update', retry: true }, 409);
      return json({ ok: true, id, status, number: current.number, archivedAt });
    } catch (_) { return json({ error: 'archive-write-failed' }, 503); }
  }
  return null;
}

export async function advanceOrder(ctx, id, status) {
  const { context, env, b, merchant, now, employee, pinActor } = ctx;
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
  const from = Object.prototype.hasOwnProperty.call(FROM, status)
    ? (status === 'rejected' && pinActor ? [...FROM[status], 'served'] : FROM[status]) : null;
  if (!from) return json({ error: 'bad-status' }, 400);

  // Le serveur affecté à la table, posé au moment de l'acceptation : le ticket
  // cuisine porte alors un nom, au lieu d'obliger la brigade à demander « c'est
  // pour qui, la 7 ? ». Chaîne bornée — elle vient déjà d'une porte gardée.
  const server = String((b && b.server) || '').trim().slice(0, 40);
  const paid = b && b.paid === true;

  /* A takeaway handover is recorded, not gated.
   *
   * It used to demand the short-lived PIN proof minted by /api/pin/verify, and
   * answered 403 `handover-identity-required` without one. That cost a 4-digit
   * code at every single counter handover — the most repeated gesture of the
   * rush — to protect a transition that moves no money: the order is already
   * paid when it reaches `ready`, and `served` only files it into the day's
   * history. The proof also lives five minutes, so it could never be taken once
   * per shift; it had to be re-entered order after order.
   *
   * What is kept: when a proof IS supplied the actor is still verified server-
   * side and written to the ledger, so a till that wants named handovers keeps
   * them. Without one the event is still recorded, with an empty actor — the
   * same shape as the sessions that predate the proof. Cancellation is
   * untouched and remains nominative. */
  let takeoutHandover = null;
  if (status === 'served') {
    try {
      takeoutHandover = await env.DB.prepare(
        `SELECT id, status, number, mode, session_id FROM orders
          WHERE id = ? AND merchant = ?`
      ).bind(id, merchant).first();
    } catch (_) { return json({ error: 'handover-read-failed' }, 503); }
    if (takeoutHandover && takeoutHandover.mode === 'takeout'
        && takeoutHandover.status === 'served') {
      return json({ ok: true, id, status: 'served', number: takeoutHandover.number, replayed: true });
    }
  }

  const marks = from.map(() => '?').join(',');
  if (status === 'rejected') {
    let current = null;
    try {
      current = await env.DB.prepare(
        'SELECT id, status, number, table_no, session_id, lines, paid_ts FROM orders WHERE id = ? AND merchant = ?'
      ).bind(id, merchant).first();
    } catch (_) { return json({ error: 'cancellation-read-failed' }, 503); }
    if (!current) return json({ error: 'not-found' }, 404);
    if (current.status === 'rejected') {
      return json({ ok: true, id, status: 'rejected', number: current.number, replayed: true });
    }
    if (!from.includes(current.status) || current.paid_ts != null) {
      return json({ error: 'bad-transition', status: current.status, number: current.number }, 409);
    }
    let currentLines = [];
    try { currentLines = JSON.parse(current.lines) || []; } catch (_) {}
    const actor = String(pinActor?.name || (employee ? employeeName(employee.member) : '') || server || 'caisse').slice(0, 80);
    const kitchenVoidIds = [];
    const voidStatements = [];
    if (current.status === 'accepted' || current.status === 'ready' || current.status === 'served') {
      for (const [index, line] of currentLines.entries()) {
        if (!line || !line.name) continue;
        const voidId = 'kvoid-' + crypto.randomUUID();
        kitchenVoidIds.push(voidId);
        voidStatements.push(statement(env,
          `INSERT INTO kitchen_voids
             (id, merchant, order_id, table_no, item_id, item_name, qty, price, reason, is_waste, actor, status, created_ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'order_rejected', ?, ?, 'approved', ?)`,
          voidId, merchant, id, current.table_no || '', String(line.id || `line-${index}`).slice(0, 80),
          String(line.name).slice(0, 120), Math.max(1, Math.round(Number(line.qty) || 1)),
          displayMoney(line.unitPrice ?? line.price), ['ready','served'].includes(current.status) ? 1 : 0, actor, now));
      }
    }
    try {
      const update = statement(env,
        `UPDATE orders SET status = 'rejected', updated_ts = ?,
            cancel_actor_id = ?, cancel_actor_name = ?, cancel_ts = ?
          WHERE id = ? AND merchant = ? AND status IN (${marks}) AND paid_ts IS NULL`,
        now, pinActor?.id || employee?.member?.id || '', actor, now, id, merchant, ...from);
      const batch = await atomicStatements(env, [update, ...voidStatements]);
      const changed = Number(batch && batch[0] && batch[0].meta && batch[0].meta.changes) || 0;
      if (!changed) return json({ error: 'concurrent-update', retry: true }, 409);
    } catch (_) {
      return json({ error: 'cancellation-write-failed' }, 503);
    }
    deferCourse(context, closeOrderCourses(env, { merchant, sessionId: current.session_id, table: current.table_no, closedAt: now }));
    return json({ ok: true, id, status: 'rejected', number: current.number,
      kitchenCancellation: true, kitchenVoidIds, lines: currentLines });
  }
  let row;
  try {
    /* Un seul énoncé, donc deux caisses qui acceptent la même commande au même
     * instant ne peuvent pas la faire avancer deux fois : la seconde ne trouve
     * plus l'état de départ et RETURNING revient vide.
     *
     * merchant dans le WHERE garde un magasin d'agir sur les tickets d'un autre
     * — ce qui n'est vrai que depuis que `merchant` est dérivé du serveur. */
    const orderUpdate = statement(env,
      `UPDATE orders
          SET status = ?, updated_ts = ?,
              server_name = COALESCE(NULLIF(?, ''), server_name),
              cancel_actor_id = CASE WHEN ? = 'rejected' THEN ? ELSE cancel_actor_id END,
              cancel_actor_name = CASE WHEN ? = 'rejected' THEN ? ELSE cancel_actor_name END,
              cancel_ts = CASE WHEN ? = 'rejected' THEN ? ELSE cancel_ts END,
              paid_ts = CASE WHEN ? = 1 AND paid_ts IS NULL THEN ? ELSE paid_ts END
        WHERE id = ? AND merchant = ? AND status IN (${marks})
          AND (? <> 'rejected' OR paid_ts IS NULL)
          ${takeoutHandover && takeoutHandover.mode === 'takeout' && takeoutHandover.session_id
            ? `AND EXISTS (SELECT 1 FROM table_sessions WHERE id = ? AND merchant = ? AND mode = 'takeout' AND status = 'open')`
            : ''}
        RETURNING id, status, number, mode, session_id`,
      status, now, server, status, pinActor?.id || '', status, pinActor?.name || '', status, now,
      paid ? 1 : 0, now, id, merchant, ...from, status,
      ...(takeoutHandover && takeoutHandover.mode === 'takeout' && takeoutHandover.session_id
        ? [takeoutHandover.session_id, merchant] : []));
    if (takeoutHandover && takeoutHandover.mode === 'takeout' && takeoutHandover.session_id) {
      const handoverUpdate = statement(env,
          `UPDATE table_sessions SET status = 'closed', closed_ts = ?,
            closed_by = 'takeout-handover', closed_actor_id = ?, closed_actor_name = ?
          WHERE id = ? AND merchant = ? AND mode = 'takeout' AND status = 'open'
            AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND merchant = ? AND status = 'served' AND updated_ts = ?)`,
        /* `pinActor` est désormais facultatif : sans lui ces deux colonnes
         * restent vides, elles ne doivent surtout pas lever (le catch plus bas
         * transformerait un simple passage de plat en `handover-write-failed`
         * 503, c'est-à-dire en panne visible au comptoir). */
        now, pinActor?.id || '', pinActor?.name || '', takeoutHandover.session_id, merchant, id, merchant, now);
      const batch = await atomicStatements(env, [orderUpdate, handoverUpdate]);
      /* The order update carries RETURNING: its returned row is the proof it
         moved, whatever a driver puts in meta.changes. */
      const first = batch && batch[0];
      const changes = Number(first && first.meta && first.meta.changes)
        || (Array.isArray(first && first.results) ? first.results.length : 0);
      if (changes) row = await env.DB.prepare(
        'SELECT id, status, number, mode, session_id FROM orders WHERE id = ? AND merchant = ?'
      ).bind(id, merchant).first();
    } else {
      row = await orderUpdate.first();
    }
  } catch (_) {
    if (status === 'rejected') return json({ error: 'cancellation-write-failed' }, 503);
    if (takeoutHandover && takeoutHandover.mode === 'takeout' && takeoutHandover.session_id) {
      return json({ error: 'handover-write-failed' }, 503);
    }
    // Colonnes de session pas encore migrées : on fait avancer l'état seul.
    try {
      row = await env.DB.prepare(
          `UPDATE orders SET status = ?, updated_ts = ?
            WHERE id = ? AND merchant = ? AND status IN (${marks})
            RETURNING id, status, number, mode, session_id`
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
    if (status === 'rejected' && cur.status === 'rejected') {
      return json({ ok: true, id, status: cur.status, number: cur.number, replayed: true });
    }
    /* Encaisser an already accepted/ready takeaway is not a kitchen status
       transition; it is an idempotent payment stamp. Previously the repeated
       status returned 409 before paid_ts was written, so the sale reached the
       books while the caisse card stayed payable and could be booked twice. */
    if (paid && cur.status === status) {
      try {
        await env.DB.prepare(
          `UPDATE orders SET paid_ts = COALESCE(paid_ts, ?), updated_ts = ?
            WHERE id = ? AND merchant = ?`
        ).bind(now, now, id, merchant).run();
        return json({ ok: true, id, status: cur.status, number: cur.number, paid: true, replayed: true });
      } catch (e) {
        return json({ error: 'payment-state-write-failed', detail: String((e && e.message) || e) }, 503);
      }
    }
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
  if (status === 'served' && !(row.mode === 'takeout' && takeoutHandover?.session_id)) {
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
