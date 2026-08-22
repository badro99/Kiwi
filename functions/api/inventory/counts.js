// /api/inventory/counts — Inventaire physique universel, aveugle et traçable.
//
// Gère la soumission des inventaires aveugles depuis la caisse (Boutique, Maison, Restaurant/Ledger),
// le gel des métadonnées humaines (nom produit, couleur, taille, SKU, code-barres),
// le calcul de l'écart au moment du gel, la revue par le propriétaire et l'application append-only.
//
//   · GET  /api/inventory/counts                → Liste des inventaires du magasin
//   · GET  /api/inventory/counts?id=cnt_...     → Détail d'un inventaire gelé
//   · GET  /api/inventory/counts?rollup=1       → Écarts récurrents (top articles / employés)
//   · POST /api/inventory/counts                → Soumission d'un inventaire aveugle (caisse)
//   · POST /api/inventory/counts (action=review) → Validation/rejet propriétaire et application

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const ts = (v) => Math.max(0, Math.min(1e15, Math.round(Number(v) || 0)));

async function ensureSchema(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS inventory_counts (
      id TEXT PRIMARY KEY,
      merchant TEXT NOT NULL,
      engine TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      store_id TEXT NOT NULL DEFAULT '',
      store_name TEXT NOT NULL DEFAULT '',
      employee_id TEXT NOT NULL DEFAULT '',
      employee_name TEXT NOT NULL DEFAULT '',
      employee_role TEXT NOT NULL DEFAULT '',
      submitted_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      reviewer_id TEXT DEFAULT '',
      reviewer_name TEXT DEFAULT '',
      review_decision TEXT DEFAULT '',
      review_note TEXT DEFAULT '',
      applied_at INTEGER,
      total_lines INTEGER NOT NULL DEFAULT 0,
      total_counted REAL NOT NULL DEFAULT 0,
      total_system REAL NOT NULL DEFAULT 0,
      total_diff REAL NOT NULL DEFAULT 0,
      total_variance_cost_mad REAL NOT NULL DEFAULT 0,
      abs_variance_cost_mad REAL NOT NULL DEFAULT 0,
      lines_json TEXT NOT NULL DEFAULT '[]',
      meta_json TEXT DEFAULT '{}',
      created_ts INTEGER NOT NULL,
      updated_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_inventory_counts_merchant_date ON inventory_counts (merchant, submitted_at)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_inventory_counts_merchant_status ON inventory_counts (merchant, status)'
  ).run();
}

/* Calcul du système actuel pour le moteur ledger par (item_id, variant_id, location_id) */
async function fetchLedgerBalances(env, merchant) {
  if (!env || !env.DB) return new Map();
  try {
    const res = await env.DB.prepare(
      `SELECT item_id, COALESCE(variant_id, '') AS variant_id, COALESCE(location_id, 'principal') AS location_id,
              SUM(qty_milli) AS qty_milli
         FROM inventory_movements
        WHERE merchant = ?
        GROUP BY item_id, variant_id, location_id`
    ).bind(merchant).all();
    const map = new Map();
    ((res && res.results) || []).forEach(r => {
      const key = `${r.item_id}|${r.variant_id}|${r.location_id}`;
      map.set(key, Number(r.qty_milli || 0) / 1000);
    });
    return map;
  } catch (_) {
    return new Map();
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env || !env.DB) return json({ counts: [] });
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  try { await ensureSchema(env); } catch (_) {}

  const countId = str(url.searchParams.get('id'), 80);
  if (countId) {
    try {
      const row = await env.DB.prepare(
        `SELECT * FROM inventory_counts WHERE merchant = ? AND id = ?`
      ).bind(merchant, countId).first();
      if (!row) return json({ error: 'not_found' }, 404);
      let lines = []; try { lines = JSON.parse(row.lines_json || '[]'); } catch (_) {}
      let meta = {}; try { meta = JSON.parse(row.meta_json || '{}'); } catch (_) {}
      return json({
        count: {
          id: row.id,
          merchant: row.merchant,
          engine: row.engine,
          status: row.status,
          storeId: row.store_id,
          storeName: row.store_name,
          employeeId: row.employee_id,
          employeeName: row.employee_name,
          employeeRole: row.employee_role,
          submittedAt: row.submitted_at,
          reviewedAt: row.reviewed_at,
          reviewerId: row.reviewer_id,
          reviewerName: row.reviewer_name,
          reviewDecision: row.review_decision,
          reviewNote: row.review_note,
          appliedAt: row.applied_at,
          totalLines: row.total_lines,
          totalCounted: row.total_counted,
          totalSystem: row.total_system,
          totalDiff: row.total_diff,
          totalVarianceCostMAD: row.total_variance_cost_mad,
          absVarianceCostMAD: row.abs_variance_cost_mad,
          lines,
          meta
        }
      });
    } catch (e) {
      return json({ error: 'db', message: e.message }, 503);
    }
  }

  // Roll-up d'écarts récurrents
  if (url.searchParams.get('rollup') === '1') {
    try {
      const since = Math.max(0, num(url.searchParams.get('since')));
      const until = num(url.searchParams.get('until')) || Date.now() + 864e5;
      const res = await env.DB.prepare(
        `SELECT * FROM inventory_counts
          WHERE merchant = ? AND submitted_at >= ? AND submitted_at <= ?
          ORDER BY submitted_at DESC`
      ).bind(merchant, since, until).all();
      const rows = (res && res.results) || [];
      
      const variantRollup = new Map();
      const employeeRollup = new Map();
      const storeRollup = new Map();

      rows.forEach(r => {
        let lines = [];
        try { lines = JSON.parse(r.lines_json || '[]'); } catch (_) {}
        lines.forEach(l => {
          const vKey = l.variantId || l.itemId;
          const vLabel = l.productName ? `${l.productName}${l.color ? ' · ' + l.color : ''}${l.size ? ' · ' + l.size : ''}` : (l.name || vKey);
          const curV = variantRollup.get(vKey) || { key: vKey, label: vLabel, sku: l.sku || '', countTimes: 0, absDiffSum: 0, absCostSum: 0, netDiffSum: 0 };
          curV.countTimes++;
          curV.absDiffSum += Math.abs(num(l.diff));
          curV.absCostSum += Math.abs(num(l.varianceCost));
          curV.netDiffSum += num(l.diff);
          variantRollup.set(vKey, curV);
        });

        const empKey = r.employee_id || r.employee_name || 'Inconnu';
        const curE = employeeRollup.get(empKey) || { id: empKey, name: r.employee_name, countTimes: 0, absCostSum: 0 };
        curE.countTimes++;
        curE.absCostSum += num(r.abs_variance_cost_mad);
        employeeRollup.set(empKey, curE);

        const stKey = r.store_id || r.store_name || 'Principal';
        const curS = storeRollup.get(stKey) || { id: stKey, name: r.store_name, countTimes: 0, absCostSum: 0, totalDiffSum: 0 };
        curS.countTimes++;
        curS.absCostSum += num(r.abs_variance_cost_mad);
        curS.totalDiffSum += num(r.total_diff);
        storeRollup.set(stKey, curS);
      });

      const topVariants = Array.from(variantRollup.values()).sort((a, b) => b.absCostSum - a.absCostSum).slice(0, 20);
      const topEmployees = Array.from(employeeRollup.values()).sort((a, b) => b.absCostSum - a.absCostSum).slice(0, 10);
      const stores = Array.from(storeRollup.values());

      return json({
        merchant,
        since,
        until,
        totalCounts: rows.length,
        topVariants,
        topEmployees,
        stores
      });
    } catch (e) {
      return json({ error: 'db', message: e.message }, 503);
    }
  }

  // Liste des inventaires
  try {
    const statusFilter = str(url.searchParams.get('status'), 32);
    const employeeFilter = str(url.searchParams.get('employee'), 80);
    const since = Math.max(0, num(url.searchParams.get('since')));
    const until = num(url.searchParams.get('until')) || Date.now() + 864e5;

    let query = `SELECT id, merchant, engine, status, store_id, store_name,
                        employee_id, employee_name, employee_role, submitted_at,
                        reviewed_at, reviewer_id, reviewer_name, review_decision, review_note,
                        applied_at, total_lines, total_counted, total_system, total_diff,
                        total_variance_cost_mad, abs_variance_cost_mad, created_ts, updated_ts
                   FROM inventory_counts
                  WHERE merchant = ? AND submitted_at >= ? AND submitted_at <= ?`;
    const args = [merchant, since, until];
    if (statusFilter) {
      query += ` AND status = ?`;
      args.push(statusFilter);
    }
    if (employeeFilter) {
      query += ` AND (employee_id = ? OR employee_name = ?)`;
      args.push(employeeFilter, employeeFilter);
    }
    query += ` ORDER BY submitted_at DESC LIMIT 100`;

    const res = await env.DB.prepare(query).bind(...args).all();
    const counts = ((res && res.results) || []).map(row => ({
      id: row.id,
      merchant: row.merchant,
      engine: row.engine,
      status: row.status,
      storeId: row.store_id,
      storeName: row.store_name,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      employeeRole: row.employee_role,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
      reviewerId: row.reviewer_id,
      reviewerName: row.reviewer_name,
      reviewDecision: row.review_decision,
      reviewNote: row.review_note,
      appliedAt: row.applied_at,
      totalLines: row.total_lines,
      totalCounted: row.total_counted,
      totalSystem: row.total_system,
      totalDiff: row.total_diff,
      totalVarianceCostMAD: row.total_variance_cost_mad,
      absVarianceCostMAD: row.abs_variance_cost_mad,
      createdTs: row.created_ts,
      updatedTs: row.updated_ts
    }));

    return json({ merchant, counts });
  } catch (e) {
    return json({ error: 'db', message: e.message }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'db_unavailable' }, 503);
  let body = null;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad_json' }, 400); }

  const url = new URL(request.url);
  const merchantParam = body.merchant || url.searchParams.get('merchant');
  const merchant = await tenantFor(request, env, merchantParam);
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  try { await ensureSchema(env); } catch (_) {}

  const action = str(body.action, 32) || 'submit';

  // ── ACTION: REVIEW / APPROVE / REJECT (PROPRIÉTAIRE) ────────────────────────
  if (action === 'review' || action === 'approve' || action === 'reject') {
    const countId = str(body.id || body.countId, 80);
    if (!countId) return json({ error: 'missing_count_id' }, 400);

    const row = await env.DB.prepare(
      `SELECT * FROM inventory_counts WHERE merchant = ? AND id = ?`
    ).bind(merchant, countId).first();
    if (!row) return json({ error: 'not_found' }, 404);

    if (row.status === 'applied') {
      return json({ success: true, count: { id: countId, status: 'applied', alreadyApplied: true } });
    }

    const decision = action === 'reject' ? 'rejected' : (str(body.decision, 32) || 'approved');
    const reviewerId = str(body.reviewerId || body.actorId, 80);
    const reviewerName = str(body.reviewerName || body.actor || 'Propriétaire', 100);
    const reviewNote = str(body.reviewNote || body.note, 500);
    const nowMs = Date.now();

    if (decision === 'rejected') {
      await env.DB.prepare(
        `UPDATE inventory_counts
            SET status = 'rejected', review_decision = 'rejected', review_note = ?,
                reviewed_at = ?, reviewer_id = ?, reviewer_name = ?, updated_ts = ?
          WHERE merchant = ? AND id = ?`
      ).bind(reviewNote, nowMs, reviewerId, reviewerName, nowMs, merchant, countId).run();

      return json({ success: true, count: { id: countId, status: 'rejected', decision: 'rejected' } });
    }

    // Décision = APPROVED → Appliquer les mouvements de stock selon le moteur
    let lines = [];
    try { lines = JSON.parse(row.lines_json || '[]'); } catch (_) {}

    if (row.engine === 'ledger') {
      // Écriture des mouvements ledger groupés sur (item_id, variant_id, location_id)
      for (const line of lines) {
        const diff = num(line.diff);
        if (!diff) continue;
        const movId = 'mov_cnt_' + countId + '_' + Math.random().toString(36).slice(2, 7);
        const itemId = str(line.itemId, 80);
        const variantId = str(line.variantId, 80);
        const locationId = str(line.locationId, 80) || 'principal';
        const qtyMilli = Math.round(diff * 1000);
        const unitCostCents = line.unitCost != null ? Math.round(num(line.unitCost) * 100) : null;
        const note = str(line.explanation || line.note || `Ajustement inventaire ${countId}`, 500);

        await env.DB.prepare(
          `INSERT OR IGNORE INTO inventory_movements (
            id, merchant, item_id, variant_id, location_id, qty_milli, reason,
            unit_cost_cents, currency, ref_type, ref_id, note, actor,
            occurred_ts, srv_ts, reversal_of, meta, created_ts
          ) VALUES (?, ?, ?, ?, ?, ?, 'count', ?, 'MAD', 'count', ?, ?, ?, ?, ?, '', ?, ?)`
        ).bind(
          movId, merchant, itemId, variantId, locationId, qtyMilli,
          unitCostCents, countId, note, reviewerName,
          nowMs, nowMs, JSON.stringify({ countId, lineKey: line.key || itemId }), nowMs
        ).run();
      }
    } else if (row.engine === 'boutique') {
      // Mise à jour du catalogue boutique privé via la table store_docs ou documents
      try {
        const docRow = await env.DB.prepare(
          `SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'catalog'`
        ).bind(merchant).first();
        if (docRow && docRow.data) {
          let catalog = JSON.parse(docRow.data);
          if (!Array.isArray(catalog.moves)) catalog.moves = [];
          lines.forEach(line => {
            const diff = num(line.diff);
            if (!diff || !line.variantId) return;
            catalog.moves.push({
              id: 'mov_cnt_' + countId + '_' + Math.random().toString(36).slice(2, 7),
              vid: line.variantId,
              d: Math.round(diff),
              at: nowMs,
              why: 'count',
              actor: reviewerName,
              ref: countId
            });
          });
          const nextRev = (num(docRow.rev) || 0) + 1;
          await env.DB.prepare(
            `UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = 'catalog'`
          ).bind(JSON.stringify(catalog), nextRev, nowMs, merchant).run();
        }
      } catch (_) {}
    }

    await env.DB.prepare(
      `UPDATE inventory_counts
          SET status = 'applied', review_decision = 'approved', review_note = ?,
              reviewed_at = ?, reviewer_id = ?, reviewer_name = ?, applied_at = ?, updated_ts = ?
        WHERE merchant = ? AND id = ?`
    ).bind(reviewNote, nowMs, reviewerId, reviewerName, nowMs, nowMs, merchant, countId).run();

    return json({
      success: true,
      count: {
        id: countId,
        status: 'applied',
        decision: 'approved',
        appliedAt: nowMs
      }
    });
  }

  // ── ACTION: SUBMIT INVENTORY (CAISSE / OPÉRATEUR) ───────────────────────────
  const countId = str(body.id, 80) || ('cnt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
  const engine = str(body.engine, 32) || 'ledger';
  const storeId = str(body.storeId, 80);
  const storeName = str(body.storeName, 100);
  const employeeId = str(body.employeeId || body.actorId, 80);
  const employeeName = str(body.employeeName || body.actor || 'Employé', 100);
  const employeeRole = str(body.employeeRole || 'Caissier', 50);
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const nowMs = Date.now();

  let ledgerBalances = new Map();
  if (engine === 'ledger') {
    ledgerBalances = await fetchLedgerBalances(env, merchant);
  }

  let totalLines = 0;
  let totalCounted = 0;
  let totalSystem = 0;
  let totalDiff = 0;
  let totalVarianceCostMAD = 0;
  let absVarianceCostMAD = 0;

  const processedLines = rawLines.map(l => {
    totalLines++;
    const itemId = str(l.itemId || l.id, 80);
    const variantId = str(l.variantId, 80);
    const locationId = str(l.locationId, 80) || 'principal';
    const key = l.key || `${itemId}|${variantId}|${locationId}`;
    
    // Calcul de la quantité système
    let systemQty = num(l.systemQty);
    if (engine === 'ledger' && ledgerBalances.has(key)) {
      systemQty = ledgerBalances.get(key);
    }
    
    const countedQty = num(l.countedQty != null ? l.countedQty : l.counted);
    const diff = Math.round((countedQty - systemQty) * 1000) / 1000;
    const unitCost = num(l.unitCost != null ? l.unitCost : l.cost);
    const varianceCost = Math.round((diff * unitCost) * 100) / 100;

    totalCounted += countedQty;
    totalSystem += systemQty;
    totalDiff += diff;
    totalVarianceCostMAD += varianceCost;
    absVarianceCostMAD += Math.abs(varianceCost);

    return {
      key,
      itemId,
      variantId,
      locationId,
      // Métadonnées humaines gelées (nom produit, couleur, taille, SKU, code-barres)
      productName: str(l.productName || l.name, 100),
      color: str(l.color || l.colorLabel, 50),
      size: str(l.size, 50),
      sku: str(l.sku || l.barcode, 60),
      barcode: str(l.barcode, 60),
      unit: str(l.unit, 30) || 'unité',
      unitCost,
      systemQty,
      countedQty,
      diff,
      varianceCost,
      explanation: str(l.explanation, 200),
      note: str(l.note, 500)
    };
  });

  const linesJson = JSON.stringify(processedLines);
  const metaJson = JSON.stringify(body.meta && typeof body.meta === 'object' ? body.meta : {});

  await env.DB.prepare(
    `INSERT INTO inventory_counts (
      id, merchant, engine, status, store_id, store_name,
      employee_id, employee_name, employee_role, submitted_at,
      total_lines, total_counted, total_system, total_diff,
      total_variance_cost_mad, abs_variance_cost_mad, lines_json, meta_json,
      created_ts, updated_ts
    ) VALUES (?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      status = 'submitted', total_lines = excluded.total_lines,
      total_counted = excluded.total_counted, total_system = excluded.total_system,
      total_diff = excluded.total_diff, total_variance_cost_mad = excluded.total_variance_cost_mad,
      abs_variance_cost_mad = excluded.abs_variance_cost_mad, lines_json = excluded.lines_json,
      meta_json = excluded.meta_json, updated_ts = excluded.updated_ts`
  ).bind(
    countId, merchant, engine, storeId, storeName,
    employeeId, employeeName, employeeRole, nowMs,
    totalLines, totalCounted, totalSystem, totalDiff,
    totalVarianceCostMAD, absVarianceCostMAD, linesJson, metaJson,
    nowMs, nowMs
  ).run();

  return json({
    success: true,
    count: {
      id: countId,
      status: 'submitted',
      engine,
      totalLines,
      totalCounted,
      totalSystem,
      totalDiff,
      totalVarianceCostMAD,
      absVarianceCostMAD,
      submittedAt: nowMs
    }
  });
}
