// La vie d'une table, côté file (/api/order/queue) : annuler la visite en
// cours, transférer une tablée, fusionner deux tables. Déplacé tel quel depuis
// queue.js, qui garde l'ordre de répartition. Chaque gestionnaire rend null
// quand le corps ne le concerne pas.

import { json } from '../../auth/_lib.js';
import { normTable, newSessionId, SESSION_ID } from './_lib.js';
import { closeOrderCourses } from './_course.js';
import { visitCredits } from '../_visit-cover.js';
import { deferCourse, operationId, atomicStatements, statement, employeeName } from './_queue-shared.js';

export async function cancelTable(ctx) {
  const { context, env, b, merchant, now, employee, pinActor } = ctx;
  /* Cancel the CURRENT visit as one operation. A local bill may know only one
   * of several kitchen tickets; cancelling that one and freeing the table
   * leaves the others payable (or reappearing on the next queue poll). The
   * expected session is mandatory so a stale device cannot cancel the next
   * party seated at the same physical table. Payment is never inferred. */
  if (b && b.cancelTable) {
    const table = normTable(b.cancelTable.table || b.cancelTable);
    const expectedSession = String(b.cancelTable.expectedSession || '').trim();
    if (!table || !SESSION_ID.test(expectedSession)) return json({ error: 'session-required', retry: true }, 409);
    if (!employee && !pinActor) return json({ error: 'operator-proof-required' }, 403);
    const actorId = String(pinActor?.id || employee?.member?.id || '').slice(0, 80);
    const actor = String(pinActor?.name || (employee && employeeName(employee.member)) || '').slice(0, 80);
    try {
      const visit = await env.DB.prepare(
        `SELECT id FROM table_sessions WHERE id = ? AND merchant = ? AND table_no = ?
         AND mode = 'table' AND status = 'open'`
      ).bind(expectedSession, merchant, table).first();
      if (!visit) return json({ error: 'stale-table-visit', retry: true }, 409);
      const paid = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND session_id = ? AND paid_ts IS NOT NULL`
      ).bind(merchant, expectedSession).first();
      if (Number(paid?.n) > 0) return json({ error: 'partially-paid-requires-refund' }, 409);
      const unsupported = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND session_id = ?
           AND paid_ts IS NULL AND status NOT IN ('pending','accepted','ready','served','rejected')`
      ).bind(merchant, expectedSession).first();
      if (Number(unsupported?.n) > 0) return json({ error: 'unsupported-order-state' }, 409);
      const batch = await atomicStatements(env, [
        statement(env,
          `INSERT INTO kitchen_voids
             (id, merchant, order_id, table_no, item_id, item_name, qty, price,
              reason, is_waste, actor, status, created_ts)
           SELECT 'kvoid-' || lower(hex(randomblob(16))), o.merchant, o.id, o.table_no,
             substr(COALESCE(json_extract(j.value,'$.id'), json_extract(j.value,'$.uid'), ''),1,80),
             substr(COALESCE(json_extract(j.value,'$.name'), 'Article'),1,120),
             MAX(1, CAST(COALESCE(json_extract(j.value,'$.qty'),1) AS INTEGER)),
             MAX(0, CAST(COALESCE(json_extract(j.value,'$.unitPrice'),json_extract(j.value,'$.price'),0) AS REAL)),
             'table_cancelled', CASE WHEN o.status IN ('ready','served') THEN 1 ELSE 0 END,
             ?, 'approved', ?
           FROM orders o, json_each(o.lines) j
           WHERE o.merchant = ? AND o.session_id = ? AND o.table_no = ?
             AND o.paid_ts IS NULL AND o.status IN ('accepted','ready','served')
             AND EXISTS (SELECT 1 FROM table_sessions live WHERE live.id = o.session_id
               AND live.merchant = o.merchant AND live.table_no = o.table_no AND live.status = 'open')
             AND NOT EXISTS (SELECT 1 FROM orders paid WHERE paid.merchant = o.merchant
               AND paid.session_id = o.session_id AND paid.paid_ts IS NOT NULL)
             AND NOT EXISTS (SELECT 1 FROM orders other WHERE other.merchant = o.merchant
               AND other.session_id = o.session_id AND other.paid_ts IS NULL
               AND other.status NOT IN ('pending','accepted','ready','served','rejected'))
             AND json_valid(o.lines) AND json_type(j.value) = 'object'`,
          actor, now, merchant, expectedSession, table),
        statement(env,
          `UPDATE orders SET status = 'rejected', updated_ts = ?, cancel_ts = ?,
             cancel_actor_id = ?, cancel_actor_name = ?
           WHERE merchant = ? AND session_id = ? AND table_no = ? AND paid_ts IS NULL
             AND status IN ('pending','accepted','ready','served')
             AND EXISTS (SELECT 1 FROM table_sessions live WHERE live.id = orders.session_id
               AND live.merchant = orders.merchant AND live.table_no = orders.table_no AND live.status = 'open')
             AND NOT EXISTS (SELECT 1 FROM orders paid WHERE paid.merchant = orders.merchant
               AND paid.session_id = orders.session_id AND paid.paid_ts IS NOT NULL)
             AND NOT EXISTS (SELECT 1 FROM orders other WHERE other.merchant = orders.merchant
               AND other.session_id = orders.session_id AND other.paid_ts IS NULL
               AND other.status NOT IN ('pending','accepted','ready','served','rejected'))`,
          now, now, actorId, actor, merchant, expectedSession, table),
        statement(env,
          `UPDATE table_sessions SET status = 'closed', closed_ts = ?,
             closed_by = 'cancelled', closed_actor_id = ?, closed_actor_name = ?
           WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open'
             AND NOT EXISTS (SELECT 1 FROM orders paid WHERE paid.merchant = ?
               AND paid.session_id = ? AND paid.paid_ts IS NOT NULL)
             AND NOT EXISTS (SELECT 1 FROM orders WHERE merchant = ? AND session_id = ?
               AND paid_ts IS NULL AND status <> 'rejected')`,
          now, actorId, actor, expectedSession, merchant, table,
          merchant, expectedSession, merchant, expectedSession),
      ]);
      if (!(Number(batch?.[2]?.meta?.changes) > 0)) return json({ error: 'table-operation-conflict', retry: true }, 409);
      deferCourse(context, closeOrderCourses(env, { merchant, sessionId: expectedSession, table, closedAt: now }));
      return json({ ok: true, table, sessionId: expectedSession,
        ordersCancelled: Number(batch?.[1]?.meta?.changes) || 0, closed: true });
    } catch (err) {
      return json({ error: String(err?.message || '') === 'atomic-batch-required'
        ? 'atomic-batch-required' : 'table-cancellation-failed' }, 503);
    }
  }
  return null;
}

export async function transferTable(ctx) {
  const { env, b, merchant, now, employee } = ctx;
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
    const transferId = operationId(b.transferTable.operationId || b.transferTable.opId, 'trf');

    try {
      const replay = await env.DB.prepare(
        'SELECT id, from_table, to_table, session_id, orders_count FROM table_transfers WHERE id = ? AND merchant = ?'
      ).bind(transferId, merchant).first();
      if (replay) {
        return json({ ok: true, transferId: replay.id, fromTable: replay.from_table,
          toTable: replay.to_table, sessionId: replay.session_id || null,
          ordersMoved: Number(replay.orders_count) || 0, replayed: true, now });
      }

      const sourceSession = await env.DB.prepare(
        `SELECT id, opened_ts, seen_ts FROM table_sessions
          WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open'
          ORDER BY opened_ts DESC LIMIT 1`
      ).bind(merchant, fromTable).first();
      if (!sourceSession || !sourceSession.id) return json({ error: 'source-session-required' }, 409);
      const expectedSession = String(b.transferTable.expectedSession || sourceSession.id);
      const expectedRevision = b.transferTable.expectedRevision == null
        ? Number(sourceSession.seen_ts) || 0 : Number(b.transferTable.expectedRevision);
      if (expectedSession !== String(sourceSession.id)
          || expectedRevision !== (Number(sourceSession.seen_ts) || 0)) {
        return json({ error: 'stale-table-visit', retry: true, sessionId: sourceSession.id,
          revision: Number(sourceSession.seen_ts) || 0 }, 409);
      }

      const targetBusy = await env.DB.prepare(
        `SELECT id FROM table_sessions WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open' LIMIT 1`
      ).bind(merchant, toTable).first();
      if (targetBusy && targetBusy.id) {
        return json({ error: 'target-table-occupied', targetTable: toTable }, 409);
      }

      const sessionId = String(sourceSession.id);
      const nextRevision = Math.max(now, (Number(sourceSession.seen_ts) || 0) + 1);
      const batch = await atomicStatements(env, [
        statement(env,
          `INSERT INTO table_transfers
             (id, merchant, from_table, to_table, session_id, server, covers, orders_count, is_merge, created_ts)
           SELECT ?, ?, ?, ?, ?, ?, ?,
             (SELECT COUNT(*) FROM orders WHERE merchant = ? AND table_no = ? AND paid_ts IS NULL AND status <> 'rejected'),
             0, ?
           WHERE EXISTS (SELECT 1 FROM table_sessions
                           WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open' AND seen_ts = ?)
             AND NOT EXISTS (SELECT 1 FROM table_sessions
                               WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open')
             AND NOT EXISTS (SELECT 1 FROM table_transfers WHERE id = ?)`,
          transferId, merchant, fromTable, toTable, sessionId, server || null, covers,
          merchant, fromTable, now, sessionId, merchant, fromTable, expectedRevision,
          merchant, toTable, transferId),
        statement(env,
          `UPDATE table_sessions SET table_no = ?, seen_ts = ?
             WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open' AND seen_ts = ?
               AND EXISTS (SELECT 1 FROM table_transfers WHERE id = ? AND merchant = ?)
               AND NOT EXISTS (SELECT 1 FROM table_sessions
                                 WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open')`,
          toTable, nextRevision, sessionId, merchant, fromTable, expectedRevision,
          transferId, merchant, merchant, toTable),
        statement(env,
          `UPDATE orders SET table_no = ?, session_id = ?, updated_ts = ?
             WHERE merchant = ? AND table_no = ? AND paid_ts IS NULL AND status <> 'rejected'
               AND EXISTS (SELECT 1 FROM table_transfers WHERE id = ? AND merchant = ?)
               AND EXISTS (SELECT 1 FROM table_sessions
                             WHERE id = ? AND merchant = ? AND table_no = ?
                               AND status = 'open' AND seen_ts = ?)`,
          toTable, sessionId, now, merchant, fromTable, transferId, merchant,
          sessionId, merchant, toTable, nextRevision),
      ]);
      const claimChanged = Number(batch && batch[0] && batch[0].meta && batch[0].meta.changes) || 0;
      const sessionChanged = Number(batch && batch[1] && batch[1].meta && batch[1].meta.changes) || 0;
      if (!claimChanged || !sessionChanged) {
        const raced = await env.DB.prepare(
          'SELECT id, from_table, to_table, session_id, orders_count FROM table_transfers WHERE id = ? AND merchant = ?'
        ).bind(transferId, merchant).first();
        if (raced) return json({ ok: true, transferId: raced.id, fromTable: raced.from_table,
          toTable: raced.to_table, sessionId: raced.session_id || null,
          ordersMoved: Number(raced.orders_count) || 0, replayed: true, now });
        return json({ error: 'table-operation-conflict', retry: true }, 409);
      }
      const moved = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND table_no = ? AND session_id = ? AND paid_ts IS NULL AND status <> 'rejected'`
      ).bind(merchant, toTable, sessionId).first();
      const orderCount = Number((moved && moved.n) || 0);
      let paidLeftBehind = 0;
      try {
        const paid = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND table_no = ? AND paid_ts IS NOT NULL AND session_id = ?`
        ).bind(merchant, fromTable, sessionId).first();
        paidLeftBehind = Number((paid && paid.n) || 0);
      } catch (_) { paidLeftBehind = 0; }

      return json({
        ok: true,
        transferId,
        fromTable,
        toTable,
        sessionId,
        ordersMoved: orderCount,
        paidLeftBehind,
        movedSession: sessionId,
        revision: nextRevision,
        now,
      });
    } catch (e) {
      if (String((e && e.message) || e) === 'atomic-batch-required') {
        return json({ error: 'atomic-batch-required' }, 503);
      }
      try {
        const replay = await env.DB.prepare(
          'SELECT id, from_table, to_table, session_id, orders_count FROM table_transfers WHERE id = ? AND merchant = ?'
        ).bind(transferId, merchant).first();
        if (replay) return json({ ok: true, transferId: replay.id, fromTable: replay.from_table,
          toTable: replay.to_table, sessionId: replay.session_id || null,
          ordersMoved: Number(replay.orders_count) || 0, replayed: true, now });
      } catch (_) {}
      return json({ error: 'transfer-failed', detail: String((e && e.message) || e) }, 500);
    }
  }
  return null;
}

export async function mergeTables(ctx) {
  const { env, b, merchant, now, employee } = ctx;
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
    const mergeId = operationId(b.mergeTables.operationId || b.mergeTables.opId, 'mrg');

    try {
      const replay = await env.DB.prepare(
        'SELECT id, from_table, to_table, session_id, orders_count FROM table_transfers WHERE id = ? AND merchant = ?'
      ).bind(mergeId, merchant).first();
      if (replay) {
        return json({ ok: true, mergeId: replay.id, sourceTable: replay.from_table,
          targetTable: replay.to_table, targetSessionId: replay.session_id || null,
          ordersMerged: Number(replay.orders_count) || 0, replayed: true, now });
      }

      // 1. Session cible
      const targetSession = await env.DB.prepare(
        `SELECT id, seen_ts FROM table_sessions WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open' ORDER BY opened_ts DESC LIMIT 1`
      ).bind(merchant, targetTable).first();
      // Create an empty destination only inside the successful merge batch.
      // A rejected kitchen race must not leave a ghost occupied table behind.
      const targetSessionId = targetSession ? String(targetSession.id) : newSessionId();

      // 2. Session source
      const sourceSession = await env.DB.prepare(
        `SELECT id, seen_ts FROM table_sessions WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open' ORDER BY opened_ts DESC LIMIT 1`
      ).bind(merchant, sourceTable).first();
      const sourceSessionId = sourceSession ? String(sourceSession.id) : null;
      if (!sourceSessionId) return json({ error: 'source-session-required' }, 409);
      const expectedSession = String(b.mergeTables.expectedSession || sourceSessionId);
      const expectedRevision = b.mergeTables.expectedRevision == null
        ? Number(sourceSession.seen_ts) || 0 : Number(b.mergeTables.expectedRevision);
      if (expectedSession !== sourceSessionId
          || expectedRevision !== (Number(sourceSession.seen_ts) || 0)) {
        return json({ error: 'stale-table-visit', retry: true, sessionId: sourceSessionId,
          revision: Number(sourceSession.seen_ts) || 0 }, 409);
      }

      /* Merge is one state transition, not three awaited writes. The source
       * visit is closed only if its immutable revision still matches; the
       * order move and audit row are committed in the same SQLite/D1 batch. */
      const saleColumns = await env.DB.prepare('PRAGMA table_info(sales)').all();
      const hasPayments = (saleColumns.results || []).some(c => c.name === 'session_id');
      const nextRevision = Math.max(now, (Number(sourceSession.seen_ts) || 0) + 1);
      const batch = await atomicStatements(env, [
        statement(env,
          `INSERT INTO table_transfers
             (id, merchant, from_table, to_table, session_id, server, covers, orders_count, is_merge, created_ts)
           SELECT ?, ?, ?, ?, ?, ?, 0,
             (SELECT COUNT(*) FROM orders WHERE merchant = ? AND table_no = ? AND paid_ts IS NULL AND status <> 'rejected'),
             1, ?
           WHERE EXISTS (SELECT 1 FROM table_sessions
                           WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open' AND seen_ts = ?)
             AND (EXISTS (SELECT 1 FROM table_sessions
                           WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open')
               OR (? = 1 AND NOT EXISTS (SELECT 1 FROM table_sessions
                           WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open')))
             AND NOT EXISTS (SELECT 1 FROM table_transfers WHERE id = ?)`,
          mergeId, merchant, sourceTable, targetTable, targetSessionId, server || null,
          merchant, sourceTable, now, sourceSessionId, merchant, sourceTable, expectedRevision,
          targetSessionId, merchant, targetTable, targetSession ? 0 : 1,
          merchant, targetTable, mergeId),
        statement(env,
          `INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts)
           SELECT ?, ?, ?, 'table', 'open', ?, ? WHERE ? = 1
             AND EXISTS (SELECT 1 FROM table_transfers WHERE id = ? AND merchant = ?)`,
          targetSessionId, merchant, targetTable, now, now, targetSession ? 0 : 1, mergeId, merchant),
        statement(env,
          `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = ?, seen_ts = ?
             WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open' AND seen_ts = ?
               AND EXISTS (SELECT 1 FROM table_transfers WHERE id = ? AND merchant = ?)`,
          now, 'merged-into-' + targetTable, nextRevision, sourceSessionId, merchant,
          sourceTable, expectedRevision, mergeId, merchant),
        statement(env,
          `UPDATE orders SET table_no = ?, session_id = ?, updated_ts = ?
             WHERE merchant = ? AND table_no = ? AND paid_ts IS NULL AND status <> 'rejected'
               AND EXISTS (SELECT 1 FROM table_transfers WHERE id = ? AND merchant = ?)
               AND EXISTS (SELECT 1 FROM table_sessions
                             WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open')`,
          targetTable, targetSessionId, now, merchant, sourceTable,
          mergeId, merchant, targetSessionId, merchant, targetTable),
        // Les acomptes suivent la visite fusionnée, sans changer leur argent.
        ...(hasPayments ? [statement(env,
          `UPDATE sales SET session_id = ? WHERE merchant = ? AND session_id = ?
             AND EXISTS (SELECT 1 FROM table_transfers WHERE id = ? AND merchant = ?)`,
          targetSessionId, merchant, sourceSessionId, mergeId, merchant)] : []),
      ]);
      const claimChanged = Number(batch && batch[0] && batch[0].meta && batch[0].meta.changes) || 0;
      const sourceChanged = Number(batch && batch[2] && batch[2].meta && batch[2].meta.changes) || 0;
      const movedOrders = Number(batch && batch[3] && batch[3].meta && batch[3].meta.changes) || 0;
      if (!claimChanged || !sourceChanged) {
        const raced = await env.DB.prepare(
          'SELECT id, from_table, to_table, session_id, orders_count FROM table_transfers WHERE id = ? AND merchant = ?'
        ).bind(mergeId, merchant).first();
        if (raced) return json({ ok: true, mergeId: raced.id, sourceTable: raced.from_table,
          targetTable: raced.to_table, targetSessionId: raced.session_id || null,
          ordersMerged: Number(raced.orders_count) || 0, replayed: true, now });
        return json({ error: 'table-operation-conflict', retry: true }, 409);
      }

      let mergePaidLeft = 0;
      try {
        const paid = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND table_no = ? AND paid_ts IS NOT NULL AND session_id = ?`
        ).bind(merchant, sourceTable, sourceSessionId).first();
        mergePaidLeft = Number((paid && paid.n) || 0);
      } catch (_) { mergePaidLeft = 0; }

      /* Les acomptes des deux tables suivent la visite fusionnée : l'appareil
       * qui fusionne doit facturer le reste, pas le total réuni. */
      const credits = await visitCredits(env, merchant, [targetSessionId]);

      return json({
        ok: true,
        mergeId,
        targetTable,
        sourceTable,
        targetSessionId,
        ordersMerged: movedOrders,
        paidLeftBehind: mergePaidLeft,
        creditCents: credits ? (credits.get(String(targetSessionId)) || 0) : undefined,
        now,
      });
    } catch (e) {
      if (String((e && e.message) || e) === 'atomic-batch-required') {
        return json({ error: 'atomic-batch-required' }, 503);
      }
      try {
        const replay = await env.DB.prepare(
          'SELECT id, from_table, to_table, session_id, orders_count FROM table_transfers WHERE id = ? AND merchant = ?'
        ).bind(mergeId, merchant).first();
        if (replay) return json({ ok: true, mergeId: replay.id, sourceTable: replay.from_table,
          targetTable: replay.to_table, targetSessionId: replay.session_id || null,
          ordersMerged: Number(replay.orders_count) || 0, replayed: true, now });
      } catch (_) {}
      return json({ error: 'merge-failed', detail: String((e && e.message) || e) }, 500);
    }
  }
  return null;
}
