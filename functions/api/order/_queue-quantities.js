import { json } from '../../auth/_lib.js';
import { normTable } from './_guest-tables.js';
import { storedOrderLines, atomicStatements, statement, employeeName } from './_queue-shared.js';
// Contrat : ctx authentifié vers annulation, quantité ou accusé ; écrit uniquement les commandes et leurs lignes via les lots communs.
/* Les deux assistants de l'annulation en attente, partagés par voidLine et
 * editLine. Ils lisaient `env`, `merchant` et `now` dans la requête en cours ;
 * la fabrique les leur rend sous les mêmes noms. */
export function voidDispatch(env, merchant, now) {
  function pendingVoidResponse(r) {
    if (r && r.conflict) { const status = r.conflict; delete r.conflict; return json(r, status); }
    return json(r);
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
    /* L'alerte et le bon s'écrivent ensemble, et seulement si le bon n'a pas
     * bougé depuis sa lecture. Écrits l'un après l'autre et sans garde, deux
     * serveurs qui annulaient le même plat en cuisine laissaient deux alertes
     * (la seconde orpheline), et un « prêt » de poste tombé entre la lecture
     * et l'écriture était effacé par les lignes relues avant lui. */
    const guard = 'id = ? AND merchant = ? AND updated_ts = ? AND lines = ?';
    const guardArgs = [targetOrder.id, merchant, targetOrder.updated_ts, targetOrder.lines];
    const statements = [];
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
      statements.push(statement(env,
        `INSERT INTO kitchen_voids (id, merchant, order_id, table_no, item_id, item_name, qty, price, reason, is_waste, actor, status, created_ts)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ? WHERE EXISTS (SELECT 1 FROM orders WHERE ${guard})`,
        voidId, merchant, targetOrder.id, targetOrder.table_no || '', tl.id || tl.uid || '', tl.name || '', voidQty, tl.unitPrice ?? tl.price ?? 0, reason || 'client_change', isWaste ? 1 : 0, actor, now, ...guardArgs));
    }
    const nextTs = Math.max(now, (Number(targetOrder.updated_ts) || 0) + 1);
    statements.push(statement(env,
      `UPDATE orders SET lines = ?, updated_ts = ? WHERE ${guard}`,
      JSON.stringify(lines), nextTs, ...guardArgs));
    try {
      const result = await atomicStatements(env, statements);
      if (!Number(result[result.length - 1]?.meta?.changes)) return { error: 'concurrent-update', retry: true, conflict: 409 };
    } catch (_) {
      return { error: 'item-cancellation-write-failed', retry: true, conflict: 503 };
    }

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
  return { pendingVoidResponse, dispatchPendingVoid };
}

export async function voidLine(ctx) {
  const { env, b, merchant, now, employee, pairedTill, pinActor } = ctx;
  const { pendingVoidResponse, dispatchPendingVoid } = voidDispatch(env, merchant, now);
  /* ── Annuler une ligne de commande en cuisine (Protocole à 2 niveaux) ───────
   * 1. Si le plat n'a pas encore été accepté par la brigade (stationAccepted falsy) :
   *    -> Annulation directe en temps réel (le plat est retiré de la commande).
   * 2. Si le plat est en cours de préparation (stationAccepted true / cooking) :
   *    -> Une alerte d'annulation prioritaire (voidAlert) est posée sur la commande.
   *    -> La brigade reçoit une alerte visuelle et sonore sur le KDS avec boutons d'acquittement.
   * 3. Toutes les annulations sont auditées dans `kitchen_voids` avec leur motif et statut. */
  if (b && b.voidLine && typeof b.voidLine === 'object') {
    // Cashier confirmation is final for an unpaid item. A kitchen screen
    // remains informed through the audited void, but cannot indefinitely
    // block the guest's bill. Service-phone requests retain the two-tier flow.
    const immediate = b.voidLine.immediate === true;
    /* A paired caisse may remove one unpaid item without asking for a PIN on
     * every tap. The till credential still proves that this is the store's
     * registered caisse; whole-table cancellation remains separately guarded
     * by a short-lived operator proof above. */
    if (immediate && !pinActor && !pairedTill) return json({ error: 'till-required' }, 403);
    const requestId = String(b.voidLine.requestId || '');
    if (immediate && !/^voi-[a-zA-Z0-9-]{16,80}$/.test(requestId)) return json({ error: 'void-request-id-required' }, 400);
    const table = normTable(b.voidLine.table);
    const lineId = String(b.voidLine.lineId || b.voidLine.itemId || b.voidLine.id || '').trim();
    const fallbackItemId = String(b.voidLine.itemId || '').trim();
    const qtyToVoid = Math.max(1, Number(b.voidLine.qty) || 1);
    const reason = String(b.voidLine.reason || 'client_change').trim();
    const isWaste = b.voidLine.isWaste ? 1 : 0;
    const actor = String(pinActor?.name || (pairedTill ? 'Caisse' : '')
      || b.voidLine.actor || (employee && employeeName(employee.member)) || 'Serveur').trim().slice(0, 40);

    if (!lineId) return json({ error: 'line-id-required' }, 400);
    if (immediate) {
      const replay = await env.DB.prepare(
        `SELECT o.id, o.table_no, o.lines, o.total FROM kitchen_voids v
         JOIN orders o ON o.id = v.order_id AND o.merchant = v.merchant
         WHERE v.id = ? AND v.merchant = ? AND v.status = 'approved'`
      ).bind(requestId, merchant).first();
      if (replay) return json({ ok: true, directVoid: true, replayed: true,
        orderId: replay.id, table: replay.table_no, total: replay.total, remainingLines: storedOrderLines(replay) });
    }

    // Trouver la commande active
    let targetOrder = null;
    if (b.voidLine.orderId) {
      targetOrder = await env.DB.prepare(
        `SELECT id, table_no, total, lines, status, updated_ts, number FROM orders
         WHERE id = ? AND merchant = ? AND paid_ts IS NULL AND status <> 'rejected'`
      ).bind(b.voidLine.orderId, merchant).first();
    } else if (table) {
      /* A table can have many kitchen tickets (initial meal + desserts).
       * The newest ticket is NOT necessarily the one that owns this line. */
      const candidates = await env.DB.prepare(
        `SELECT o.id, o.table_no, o.total, o.lines, o.status, o.updated_ts, o.number
         FROM orders o JOIN table_sessions s ON s.id = o.session_id AND s.merchant = o.merchant
         WHERE o.merchant = ? AND o.table_no = ? AND o.paid_ts IS NULL
           AND o.status <> 'rejected' AND s.status = 'open'
         ORDER BY o.created_ts DESC LIMIT 100`
      ).bind(merchant, table).all();
      const orders = candidates.results || [];
      // A product may appear in several kitchen tickets on the same table.
      // The immutable line UID wins; product identity is a legacy fallback only.
      const uidMatches = orders.filter(order => storedOrderLines(order)
        .some(line => String(line.uid || '') === lineId));
      const matches = uidMatches.length ? uidMatches : orders.filter(order => storedOrderLines(order)
        .some(line => String(line.id || '') === (fallbackItemId || lineId)));
      if (matches.length > 1) return json({ error: 'ambiguous-line', orderIdRequired: true }, 409);
      targetOrder = matches[0] || null;
    }

    if (!targetOrder) return json({ error: 'order-not-found' }, 404);
    if (table && normTable(targetOrder.table_no) !== table) return json({ error: 'wrong-table' }, 409);

    let lines = [];
    try { lines = JSON.parse(targetOrder.lines) || []; } catch (_) { lines = []; }

    // Never use a product fallback to cancel another variant when the UID
    // explicitly identifies a different (or already removed) line.
    let targetLine = lines.find(l => String(l.uid || '') === lineId);
    if (!targetLine) {
      const legacy = lines.filter(l => String(l.id) === lineId || (!l.uid && String(l.id) === fallbackItemId));
      if (legacy.length > 1) return json({ error: 'ambiguous-line' }, 409);
      targetLine = legacy[0];
    }
    if (!targetLine) return json({ error: 'line-not-on-order' }, 404);

    const isFormula = targetLine.kind === 'formula' && !!targetLine.formulaUid;
    const affectedLines = isFormula
      ? lines.filter(l => l.formulaUid === targetLine.formulaUid || l === targetLine)
      : [targetLine];

    if (!immediate && affectedLines.some(line => line.voidAlert)) {
      return json({ error: 'pending-kitchen-approval', orderId: targetOrder.id }, 409);
    }

    const isCooking = affectedLines.some(l => l.stationAccepted === true);
    let voidId = 'voi-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);

    if (!isCooking || immediate) {
      const pendingIds = affectedLines.map(line => line.voidAlert?.id).filter(Boolean);
      if (immediate) affectedLines.forEach(line => { delete line.voidAlert; });
      // ── Niveau 1 : Annulation immédiate (plat non entamé) ──────────────────
      const directVoidQty = new Map();
      if (isFormula) {
        const primaryQty = Math.max(1, Math.round(Number(targetLine.qty) || 1));
        const askedQty = Math.min(primaryQty, qtyToVoid);
        const ratio = askedQty / primaryQty;
        affectedLines.forEach(line => {
          const lineQty = Math.max(1, Math.round(Number(line.qty) || 1));
          const delta = line === targetLine
            ? askedQty
            : Math.max(1, Math.min(lineQty, Math.round(lineQty * ratio)));
          directVoidQty.set(line, delta);
          line.qty = Math.max(0, lineQty - delta);
        });
        lines = lines.filter(line => !affectedLines.includes(line) || Number(line.qty) > 0);
      } else if (targetLine.qty > qtyToVoid) {
        directVoidQty.set(targetLine, qtyToVoid);
        targetLine.qty -= qtyToVoid;
      } else {
        affectedLines.forEach(line => directVoidQty.set(line, Math.max(1, Number(line.qty) || qtyToVoid)));
        lines = lines.filter(l => !affectedLines.includes(l));
      }
      const newTotal = lines.reduce((s, l) => s + ((Number(l.unitPrice ?? l.price) || 0) * (Number(l.qty) || 0)), 0);
      const nextTs = Math.max(now, (Number(targetOrder.updated_ts) || 0) + 1);

      const guard = `id = ? AND merchant = ? AND paid_ts IS NULL AND status <> 'rejected' AND updated_ts = ? AND lines = ?`;
      const guardArgs = [targetOrder.id, merchant, targetOrder.updated_ts, targetOrder.lines];
      const statements = [];
      // Audit and bill change share a transaction and the same revision guard.
      // A racing payment or cancellation must leave both untouched.
      for (const [index, affLine] of affectedLines.entries()) {
        const vId = immediate ? (index ? requestId + '-' + index : requestId) : 'voi-' + crypto.randomUUID();
        if (!index) voidId = vId;
        statements.push(statement(env,
            `INSERT INTO kitchen_voids (id, merchant, order_id, table_no, item_id, item_name, qty, price, reason, is_waste, actor, status, created_ts)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ? WHERE EXISTS (SELECT 1 FROM orders WHERE ${guard})`,
          /* Production databases created by the original kitchen-void migration
           * still enforce `table_no NOT NULL`. A takeaway deliberately has no
           * table, so persist the canonical empty table marker instead of NULL.
           * Newer schemas accept either value, keeping this backward-compatible. */
          vId, merchant, targetOrder.id, targetOrder.table_no || '', affLine.id || affLine.uid || lineId,
          affLine.name || lineId, directVoidQty.get(affLine) || qtyToVoid, affLine.unitPrice ?? affLine.price ?? 0,
          reason, isWaste, actor, now, ...guardArgs));
      }
      for (const pendingId of pendingIds) statements.push(statement(env,
        `UPDATE kitchen_voids SET status = 'rejected' WHERE id = ? AND merchant = ? AND status = 'pending'
         AND EXISTS (SELECT 1 FROM orders WHERE ${guard})`, pendingId, merchant, ...guardArgs));
      statements.push(statement(env,
        `UPDATE orders SET lines = ?, total = ?, updated_ts = ? WHERE ${guard}`,
        JSON.stringify(lines), newTotal, nextTs, ...guardArgs));
      try {
        const result = await atomicStatements(env, statements);
        if (!Number(result[result.length - 1]?.meta?.changes)) return json({ error: 'concurrent-update', retry: true }, 409);
      } catch (_) {
        return json({ error: 'item-cancellation-write-failed', retry: true }, 503);
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
      return pendingVoidResponse(await dispatchPendingVoid(targetOrder, affectedLines, lines, qtyToVoid, isWaste, actor, reason));
    }
  }
  return null;
}

export async function editLine(ctx) {
  const { env, b, merchant, now, employee } = ctx;
  const { pendingVoidResponse, dispatchPendingVoid } = voidDispatch(env, merchant, now);
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
        return pendingVoidResponse(await dispatchPendingVoid(targetOrder, affectedLines, lines, Math.abs(qtyDelta), isWaste, actor, reason));
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
          return pendingVoidResponse(await dispatchPendingVoid(freshOrder, freshAffected, freshLines, Math.abs(qtyDelta), isWaste, actor, reason));
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
  return null;
}

export async function ackVoid(ctx) {
  const { env, b, merchant, now } = ctx;
  /* ── Acquittement de l'annulation par la cuisine (KDS) ─────────────────────
   * Le chef valide l'arrêt de la préparation ou signale que le plat est déjà prêt. */
  if (b && b.ackVoid && typeof b.ackVoid === 'object') {
    const orderId = String(b.ackVoid.orderId || b.ackVoid.id || '').trim();
    const action = b.ackVoid.action === 'reject' ? 'reject' : 'accept';
    const isWaste = b.ackVoid.isWaste !== undefined ? (b.ackVoid.isWaste ? 1 : 0) : null;

    if (!orderId) return json({ error: 'order-id-required' }, 400);

    const targetOrder = await env.DB.prepare(
      `SELECT id, table_no, total, lines, status, updated_ts FROM orders
       WHERE id = ? AND merchant = ? AND paid_ts IS NULL AND status <> 'rejected'`
    ).bind(orderId, merchant).first();

    if (!targetOrder) return json({ error: 'order-not-found' }, 404);

    let lines = [];
    try { lines = JSON.parse(targetOrder.lines) || []; } catch (_) { lines = []; }

    const voids = [];
    let voidIdFound = null;
    let voidItemFound = null;
    let voidQtyFound = 1;
    lines = lines.map(line => {
      if (line && line.voidAlert) {
        voidIdFound = line.voidAlert.id;
        voidItemFound = line.id || line.uid || line.name;
        voidQtyFound = Math.max(1, Number(line.voidAlert.qty) || 1);
        voids.push({ voidId: voidIdFound, itemId: voidItemFound, qty: voidQtyFound,
          isWaste: isWaste !== null ? isWaste : (line.voidAlert.isWaste ? 1 : 0) });
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

    if (!voids.length) return json({ error: 'no-pending-kitchen-void', retry: true }, 409);
    const newTotal = lines.reduce((s, l) => s + ((Number(l.unitPrice ?? l.price) || 0) * (Number(l.qty) || 0)), 0);
    const nextTs = Math.max(now, (Number(targetOrder.updated_ts) || 0) + 1);

    const applied = await env.DB.prepare(
      `UPDATE orders SET lines = ?, total = ?, updated_ts = ?
       WHERE id = ? AND merchant = ? AND paid_ts IS NULL AND status <> 'rejected' AND updated_ts = ?`
    ).bind(JSON.stringify(lines), newTotal, nextTs, targetOrder.id, merchant, targetOrder.updated_ts).run();
    if (!Number(applied?.meta?.changes)) return json({ error: 'order-changed', retry: true }, 409);

    for (const entry of voids) {
      try {
        await env.DB.prepare(
          `UPDATE kitchen_voids SET status = ?, is_waste = COALESCE(?, is_waste) WHERE id = ? AND merchant = ?`
        ).bind(action === 'accept' ? 'approved' : 'rejected', isWaste, entry.voidId, merchant).run();
      } catch (err) {
        console.error('[queue] Failed to update kitchen void status for void', entry.voidId, 'merchant', merchant);
      }
    }

    return json({
      ok: true,
      action: action === 'accept' ? 'accepted' : 'rejected',
      orderId: targetOrder.id,
      voidId: voidIdFound,
      itemId: voidItemFound,
      qty: voidQtyFound,
      isWaste: voids[voids.length - 1].isWaste,
      voids: voids.map(entry => ({ ...entry, orderId: targetOrder.id, table: targetOrder.table_no })),
      table: targetOrder.table_no,
      total: newTotal,
      lines,
    });
  }
  return null;
}

