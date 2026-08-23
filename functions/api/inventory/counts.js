// /api/inventory/counts — Inventaire physique universel, aveugle et traçable.
//
// Gère la soumission des inventaires aveugles depuis la caisse (Boutique, Maison, Restaurant/Ledger),
// le gel des métadonnées humaines (nom produit, couleur, taille, SKU, code-barres),
// le calcul de l'écart au moment du gel, la revue par le propriétaire et l'application append-only.
//
//   · GET  /api/inventory/counts                → Liste des inventaires du magasin
//   · GET  /api/inventory/counts?id=cnt_...     → Détail d'un inventaire gelé + événements
//   · GET  /api/inventory/counts?rollup=1       → Écarts récurrents (top articles / employés)
//   · POST /api/inventory/counts (action=submit)→ Soumission / re-soumission d'un inventaire aveugle
//   · POST /api/inventory/counts (action=review/approve/reject/request-correction) → Décision propriétaire

import { json, entitledMerchant } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

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
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS inventory_count_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      count_id TEXT NOT NULL,
      merchant TEXT NOT NULL,
      event TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT,
      via TEXT,
      note TEXT,
      ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_inventory_count_events_merchant_count ON inventory_count_events (merchant, count_id, ts)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS inventory_sync_sequences (merchant TEXT PRIMARY KEY, last_ts INTEGER NOT NULL)'
  ).run();
}

async function nextCursor(env, merchant) {
  const now = Date.now();
  try {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO inventory_sync_sequences (merchant, last_ts) VALUES (?, 0)'
    ).bind(merchant).run();
    const row = await env.DB.prepare(
      `UPDATE inventory_sync_sequences
          SET last_ts = CASE WHEN last_ts >= ? THEN last_ts + 1 ELSE ? END
        WHERE merchant = ? RETURNING last_ts AS value`
    ).bind(now, now, merchant).first();
    return Number(row && row.value) || now;
  } catch (_) {
    return now;
  }
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

      let events = [];
      try {
        const evRes = await env.DB.prepare(
          `SELECT id, count_id, merchant, event, actor_id, actor_name, via, note, ts
             FROM inventory_count_events
            WHERE merchant = ? AND count_id = ?
            ORDER BY ts ASC`
        ).bind(merchant, countId).all();
        events = (evRes && evRes.results) || [];
      } catch (_) {}

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
          meta,
          events
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
      const until = num(url.searchParams.get('until')) || (Date.now() + 864e5);
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
    const until = num(url.searchParams.get('until')) || (Date.now() + 864e5);

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

  // ── ACTIONS PROPRIÉTAIRE : REVIEW / APPROVE / REJECT / REQUEST-CORRECTION ───
  if (action === 'review' || action === 'approve' || action === 'reject' || action === 'request-correction') {
    // Vérification de droit strict propriétaire/opérateur (pas de caisse ni employé simple)
    const entitled = await entitledMerchant(request, env, merchant);
    if (entitled !== merchant) {
      return json({ error: 'forbidden' }, 403);
    }

    const countId = str(body.id || body.countId, 80);
    if (!countId) return json({ error: 'missing_count_id' }, 400);

    const row = await env.DB.prepare(
      `SELECT * FROM inventory_counts WHERE merchant = ? AND id = ?`
    ).bind(merchant, countId).first();
    if (!row) return json({ error: 'not_found' }, 404);

    if (row.status === 'applied') {
      return json({ success: true, count: { id: countId, status: 'applied', alreadyApplied: true } });
    }

    const reviewerId = str(body.reviewerId || body.actorId, 80);
    const reviewerName = str(body.reviewerName || body.actor || 'Propriétaire', 100);
    const reviewNote = str(body.reviewNote || body.note, 500);
    const nowMs = Date.now();

    // ── 1. Demande de correction (action: request-correction) ────────────────
    if (action === 'request-correction') {
      if (!reviewNote) {
        return json({ error: 'note_required', message: 'Une note explicative est requise pour demander une correction.' }, 400);
      }

      const stmts = [
        env.DB.prepare(
          `UPDATE inventory_counts
              SET status = 'correction_requested', review_decision = 'correction_requested', review_note = ?,
                  reviewed_at = ?, reviewer_id = ?, reviewer_name = ?, updated_ts = ?
            WHERE merchant = ? AND id = ?`
        ).bind(reviewNote, nowMs, reviewerId, reviewerName, nowMs, merchant, countId),
        env.DB.prepare(
          `INSERT INTO inventory_count_events (count_id, merchant, event, actor_id, actor_name, via, note, ts)
           VALUES (?, ?, 'correction_requested', ?, ?, 'dashboard', ?, ?)`
        ).bind(countId, merchant, reviewerId, reviewerName, reviewNote, nowMs)
      ];

      await env.DB.batch(stmts);

      return json({
        success: true,
        count: { id: countId, status: 'correction_requested', decision: 'correction_requested' }
      });
    }

    // ── 2. Rejet pur et simple ───────────────────────────────────────────────
    if (action === 'reject' || body.decision === 'rejected') {
      const stmts = [
        env.DB.prepare(
          `UPDATE inventory_counts
              SET status = 'rejected', review_decision = 'rejected', review_note = ?,
                  reviewed_at = ?, reviewer_id = ?, reviewer_name = ?, updated_ts = ?
            WHERE merchant = ? AND id = ?`
        ).bind(reviewNote, nowMs, reviewerId, reviewerName, nowMs, merchant, countId),
        env.DB.prepare(
          `INSERT INTO inventory_count_events (count_id, merchant, event, actor_id, actor_name, via, note, ts)
           VALUES (?, ?, 'rejected', ?, ?, 'dashboard', ?, ?)`
        ).bind(countId, merchant, reviewerId, reviewerName, reviewNote, nowMs)
      ];

      await env.DB.batch(stmts);

      return json({
        success: true,
        count: { id: countId, status: 'rejected', decision: 'rejected' }
      });
    }

    // ── 3. Approbation & Application en lot atomique (ONE env.DB.batch) ──────
    let lines = [];
    try { lines = JSON.parse(row.lines_json || '[]'); } catch (_) {}

    const batchStmts = [];

    if (row.engine === 'ledger') {
      const srvTs = await nextCursor(env, merchant);
      lines.forEach((line) => {
        const diff = num(line.diff);
        if (!diff) return;
        const itemId = str(line.itemId, 80);
        const variantId = str(line.variantId, 80);
        const locationId = str(line.locationId, 80) || 'principal';
        // Identifiant déterministe garantissant l'idempotence
        const movId = `cnt-${countId}-${itemId}-${variantId}-${locationId}`;
        const qtyMilli = Math.round(diff * 1000);
        const unitCostCents = line.unitCost != null ? Math.round(num(line.unitCost) * 100) : null;
        const lineNote = str(line.explanation || line.note || `Ajustement inventaire ${countId}`, 500);

        batchStmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO inventory_movements (
              id, merchant, item_id, variant_id, location_id, qty_milli, reason,
              unit_cost_cents, currency, ref_type, ref_id, note, actor,
              occurred_ts, srv_ts, reversal_of, meta, created_ts
            ) VALUES (?, ?, ?, ?, ?, ?, 'count', ?, 'MAD', 'count', ?, ?, ?, ?, ?, '', ?, ?)`
          ).bind(
            movId, merchant, itemId, variantId, locationId, qtyMilli,
            unitCostCents, countId, lineNote, reviewerName,
            nowMs, srvTs, JSON.stringify({ countId, lineKey: line.key || itemId }), nowMs
          )
        );
      });
    } else if (row.engine === 'boutique' || row.engine === 'maison') {
      /* Pour Boutique / Maison : table `catalogs`.
       *
       * Trois défauts tenaient ensemble ici. La lecture et l'écriture étaient
       * deux allers-retours séparés et l'UPDATE n'avait aucun WHERE sur `rev` :
       * deux approbations simultanées écrasaient l'une l'autre, la perdante
       * voyant ses mouvements disparaître alors que son inventaire restait
       * marqué « appliqué ». Et le try/catch muet faisait exactement la même
       * chose quand la lecture échouait : stock inchangé, inventaire classé.
       *
       * L'écriture sort donc du lot, se fait en compare-and-swap sur `rev`, et
       * un échec REFUSE l'approbation au lieu de la déclarer faite. Les
       * mouvements portent un identifiant déterministe : on saute ceux déjà
       * présents, une reprise après erreur ne double donc jamais le stock. */
      let catRow = null;
      try {
        catRow = await env.DB.prepare(
          `SELECT data, rev FROM catalogs WHERE merchant = ?`
        ).bind(merchant).first();
      } catch (_) {
        return json({ error: 'catalog-unreadable' }, 503);
      }
      if (catRow && catRow.data) {
        let catalog;
        try { catalog = JSON.parse(catRow.data); }
        catch (_) { return json({ error: 'catalog-unreadable' }, 503); }
        if (!Array.isArray(catalog.moves)) catalog.moves = [];
        const seen = new Set(catalog.moves.map(m => m && m.id).filter(Boolean));
        lines.forEach(line => {
          const diff = num(line.diff);
          if (!diff || !line.variantId) return;
          const movId = `cnt-${countId}-${line.variantId}`;
          if (seen.has(movId)) return;
          seen.add(movId);
          catalog.moves.push({
            id: movId,
            vid: line.variantId,
            d: Math.round(diff),
            at: nowMs,
            why: 'inventaire',
            actor: reviewerName,
            ref: countId
          });
        });
        const prevRev = num(catRow.rev) || 0;
        let applied = null;
        try {
          applied = await env.DB.prepare(
            `UPDATE catalogs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND rev = ?`
          ).bind(JSON.stringify(catalog), prevRev + 1, nowMs, merchant, prevRev).run();
        } catch (_) { applied = null; }
        if (!applied || !applied.meta || !applied.meta.changes) {
          return json({ error: 'catalog-conflict' }, 409);
        }
      }
    }

    // Mise à jour du statut inventaire
    batchStmts.push(
      env.DB.prepare(
        `UPDATE inventory_counts
            SET status = 'applied', review_decision = 'approved', review_note = ?,
                reviewed_at = ?, reviewer_id = ?, reviewer_name = ?, applied_at = ?, updated_ts = ?
          WHERE merchant = ? AND id = ?`
      ).bind(reviewNote, nowMs, reviewerId, reviewerName, nowMs, nowMs, merchant, countId)
    );

    // Événement d'approbation
    batchStmts.push(
      env.DB.prepare(
        `INSERT INTO inventory_count_events (count_id, merchant, event, actor_id, actor_name, via, note, ts)
         VALUES (?, ?, 'approved', ?, ?, 'dashboard', ?, ?)`
      ).bind(countId, merchant, reviewerId, reviewerName, reviewNote, nowMs)
    );

    await env.DB.batch(batchStmts);

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

  // ── ACTION: SUBMIT / RESUBMIT (CAISSE / OPÉRATEUR) ──────────────────────────
  /* `inventory_counts.id` est une clé primaire GLOBALE, pas (merchant, id) : un
   * identifiant deviné suffisait à écraser le comptage d'un autre commerçant,
   * l'upsert ne portant aucun prédicat `merchant`. La garde est désormais dans
   * la clause ON CONFLICT ci-dessous ; ce repli cesse en plus d'être devinable —
   * il tenait dans un horodatage suivi de quatre caractères de Math.random(),
   * soit environ un million de possibilités, et Math.random n'est pas
   * cryptographique. NB : le client fournit normalement son propre id, celui
   * d'assets/ reste à revoir. */
  const countId = str(body.id, 80) || ('cnt_' + crypto.randomUUID());
  const supersedesId = str(body.supersedes, 80);
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

  let boutiqueStockMap = new Map();
  if (engine === 'boutique' || engine === 'maison') {
    try {
      const catRow = await env.DB.prepare('SELECT data FROM catalogs WHERE merchant = ?').bind(merchant).first();
      if (catRow && catRow.data) {
        const cat = JSON.parse(catRow.data);
        (cat.variants || []).forEach(v => {
          if (v && v.id) boutiqueStockMap.set(v.id, num(v.stock != null ? v.stock : v.base));
        });
      }
    } catch (_) {}
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
    } else if ((engine === 'boutique' || engine === 'maison') && l.systemQty == null && variantId && boutiqueStockMap.has(variantId)) {
      systemQty = boutiqueStockMap.get(variantId);
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
  const metaObj = body.meta && typeof body.meta === 'object' ? body.meta : {};
  if (supersedesId) metaObj.supersedes = supersedesId;
  const metaJson = JSON.stringify(metaObj);

  const submitBatch = [];

  // Si resoumission avec supersedes : marquer l'ancien document 'superseded'
  if (supersedesId) {
    submitBatch.push(
      env.DB.prepare(
        `UPDATE inventory_counts SET status = 'superseded', updated_ts = ? WHERE merchant = ? AND id = ?`
      ).bind(nowMs, merchant, supersedesId)
    );
    submitBatch.push(
      env.DB.prepare(
        `INSERT INTO inventory_count_events (count_id, merchant, event, actor_id, actor_name, via, note, ts)
         VALUES (?, ?, 'superseded', ?, ?, 'till', ?, ?)`
      ).bind(supersedesId, merchant, employeeId, employeeName, `Remplacé par ${countId}`, nowMs)
    );
  }

  submitBatch.push(
    env.DB.prepare(
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
        meta_json = excluded.meta_json, updated_ts = excluded.updated_ts
      WHERE inventory_counts.merchant = excluded.merchant
        AND inventory_counts.status IN ('submitted', 'superseded', 'rejected')`
    ).bind(
      countId, merchant, engine, storeId, storeName,
      employeeId, employeeName, employeeRole, nowMs,
      totalLines, totalCounted, totalSystem, totalDiff,
      totalVarianceCostMAD, absVarianceCostMAD, linesJson, metaJson,
      nowMs, nowMs
    )
  );

  submitBatch.push(
    env.DB.prepare(
      `INSERT INTO inventory_count_events (count_id, merchant, event, actor_id, actor_name, via, note, ts)
       VALUES (?, ?, ?, ?, ?, 'till', ?, ?)`
    ).bind(
      countId, merchant, supersedesId ? 'resubmitted' : 'submitted',
      employeeId, employeeName, str(body.note, 500), nowMs
    )
  );

  await env.DB.batch(submitBatch);

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
