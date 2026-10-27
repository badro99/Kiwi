import { movementMilli } from '../_rules-recipe-units.js';
// /api/inventory/movements — registre de stock append-only, par établissement.
//
// GET  ?merchant=slug&since=<cursor>  → mouvements incrémentaux
// GET  ?merchant=slug&summary=1       → solde courant par article/lieu
// POST { merchant, movements:[...] }  → écriture idempotente, jamais d'UPDATE

import { json, entitledMerchant, readManagerStockProof, stockProofScope } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { resolveInventoryUnitScope, scopeSql } from './_unit-scope.js';

const PAGE = 500;
/* Même recul que la file des commandes (CURSOR_LAG_MS, order/_lib.js). Pas
 * importé de là : ce module-là tire les règles de promotion du navigateur. */
const CURSOR_LAG_MS = 2000;
const REASONS = new Set([
  'opening', 'receipt', 'supplier-return', 'sale', 'sale-reversal',
  'production-input', 'production-output', 'transfer-out', 'transfer-in',
  'loss', 'expiry', 'gift', 'staff-meal', 'count', 'return', 'manual',
]);

/* Deux familles de motifs, deux autorités.
 *
 * `sale` et `sale-reversal` sont AUTOMATIQUES : c'est la caisse
 * qui les écrit en encaissant, elle doit continuer à le faire sans rien demander.
 * Tous les autres sont DISCRÉTIONNAIRES — quelqu'un décide que de la marchandise
 * a été perdue, offerte, transférée ou reçue — et c'est par là que passait la
 * fraude : `tenantFor` accepte un simple cookie de caisse, donc un caissier
 * pouvait sortir des bouteilles et poster la perte correspondante au nom d'un
 * collègue. Le système interdit pourtant déjà ce geste ailleurs : operations.js
 * refuse `write:inventory` au rôle caisse, et counts.js exige le propriétaire
 * pour valider un écart. C'était un chemin parallèle vers un état interdit. */
/* La production n'a aucun auteur automatique (aucun écran ne l'écrit) : la
 * laisser passer depuis une caisse ouvrait une sortie sans contrôle. Elle
 * suit donc la règle des motifs discrétionnaires. Et un motif automatique
 * n'a qu'un sens : une vente sort du stock, son annulation y revient. Une
 * « vente » positive ou une « annulation » négative n'est pas une vente, c'est
 * un ajustement déguisé. */
const AUTOMATIC_REASONS = new Set(['sale', 'sale-reversal']);
const REASON_SIGN = { 'sale': -1, 'sale-reversal': 1, 'production-input': -1, 'production-output': 1 };

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : null;

async function ensureSchema(env) {
  // Schema owned by migrations 0001–0010.
}

async function nextCursor(env, merchant) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO inventory_sync_sequences (merchant, last_ts) VALUES (?, 0)'
  ).bind(merchant).run();
  const row = await env.DB.prepare(
    `UPDATE inventory_sync_sequences
        SET last_ts = CASE WHEN last_ts >= ? THEN last_ts + 1 ELSE ? END
      WHERE merchant = ? RETURNING last_ts AS value`
  ).bind(now, now, merchant).first();
  return Number(row && row.value) || now;
}

function sanitize(raw, now) {
  const id = str(raw && raw.id, 80);
  const itemId = str(raw && (raw.itemId ?? raw.item_id), 80);
  const reason = str(raw && raw.reason, 32).toLowerCase();
  const qtyMilli = movementMilli(raw);
  const cost = finite(raw && (raw.unitCost ?? raw.unit_cost));
  /* Deux écritures du coût, deux lecteurs : `unit_cost_cents` reste pour les
   * lecteurs historiques, `unit_cost_rate` (×1e-4, entier) porte le TAUX —
   * à 2 décimales, 0,0045 MAD/g devenait 0 et le coût matière disparaissait. */
  const unitCostRate = cost != null && cost >= 0 ? Math.round(cost * 10000) : null;
  let meta = null;
  try {
    if (raw && raw.meta && typeof raw.meta === 'object') {
      const encoded = JSON.stringify(raw.meta);
      if (encoded.length <= 4000) meta = encoded;
    }
  } catch (_) {}
  const occurred = Math.round(finite(raw && (raw.occurredTs ?? raw.occurred_ts)) || now);
  return {
    id, itemId, reason,
    variantId: str(raw && (raw.variantId ?? raw.variant_id), 80),
    locationId: str(raw && (raw.locationId ?? raw.location_id), 80) || 'principal',
    qtyMilli,
    unitCostCents: cost != null && cost >= 0 ? Math.round(cost * 100) : null,
    unitCostRate,
    currency: str(raw && raw.currency, 3).toUpperCase() || 'MAD',
    refType: str(raw && (raw.refType ?? raw.ref_type), 32),
    refId: str(raw && (raw.refId ?? raw.ref_id), 100),
    note: str(raw && raw.note, 500), actor: str(raw && raw.actor, 100),
    occurredTs: occurred > 0 && occurred <= now + 86400000 ? occurred : now,
    reversalOf: str(raw && (raw.reversalOf ?? raw.reversal_of), 80),
    meta,
  };
}

function valid(m) {
  return !!(m.id && m.itemId && REASONS.has(m.reason)
    && Number.isSafeInteger(m.qtyMilli) && m.qtyMilli !== 0
    && Math.abs(m.qtyMilli) <= 1e12
    && (!REASON_SIGN[m.reason] || Math.sign(m.qtyMilli) === REASON_SIGN[m.reason]));
}

/* Lecture du coût : le taux ×1e-4 prime ; les lignes historiques (taux NULL)
 * retombent sur les centimes. Un seul endroit pour les deux projections. */
function rateOf(r) {
  if (r.unit_cost_rate != null) return Number(r.unit_cost_rate) / 10000;
  return r.unit_cost_cents == null ? null : Number(r.unit_cost_cents) / 100;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stableValue(value[key]);
      return out;
    }, {});
  }
  return value;
}

function movementPayload(m) {
  let meta = null;
  try { meta = m.meta ? JSON.parse(m.meta) : null; } catch (_) { meta = null; }
  return JSON.stringify(stableValue({
    id: m.id,
    itemId: m.itemId ?? m.item_id,
    variantId: m.variantId ?? m.variant_id ?? '',
    locationId: m.locationId ?? m.location_id ?? 'principal',
    qtyMilli: Number(m.qtyMilli ?? m.qty_milli),
    reason: m.reason,
    unitCostCents: m.unitCostCents ?? m.unit_cost_cents ?? null,
    unitCostRate: m.unitCostRate ?? m.unit_cost_rate ?? null,
    currency: m.currency || 'MAD',
    refType: m.refType ?? m.ref_type ?? '',
    refId: m.refId ?? m.ref_id ?? '',
    note: m.note || '',
    actor: m.actor || '',
    occurredTs: Number(m.occurredTs ?? m.occurred_ts),
    reversalOf: m.reversalOf ?? m.reversal_of ?? '',
    meta,
  }));
}

async function movementHash(m) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(movementPayload(m)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function storedMovementPayload(row) {
  return movementPayload({
    ...row,
    itemId: row.item_id,
    variantId: row.variant_id,
    locationId: row.location_id,
    qtyMilli: row.qty_milli,
    unitCostCents: row.unit_cost_cents,
    unitCostRate: row.unit_cost_rate,
    refType: row.ref_type,
    refId: row.ref_id,
    occurredTs: row.occurred_ts,
    reversalOf: row.reversal_of,
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env || !env.DB) return json({ merchant: '', movements: [], cursor: 0 });
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const scope = await resolveInventoryUnitScope(request, env, merchant, {
    terminalId: url.searchParams.get('terminalId'),
  });
  if (scope.scoped && !scope.allowed) return json({ error: 'unit-forbidden' }, 403);
  const requestedLocation = str(url.searchParams.get('locationId') || url.searchParams.get('location_id'), 80);
  if (requestedLocation && !scope.permitsLocation(requestedLocation)) {
    return json({ error: 'location-forbidden' }, 403);
  }
  const locationFilter = scopeSql('location_id', scope.storageLocations(requestedLocation));
  try { await ensureSchema(env); } catch (_) { return json({ merchant, movements: [], cursor: 0, unmigrated: true }); }

  if (url.searchParams.get('summary') === '1') {
    try {
      const res = await env.DB.prepare(
        `SELECT item_id, variant_id, location_id, SUM(qty_milli) AS qty_milli,
                MAX(srv_ts) AS cursor
           FROM inventory_movements
          WHERE merchant = ?${locationFilter.clause}
          GROUP BY item_id, variant_id, location_id
          ORDER BY item_id, variant_id, location_id`
      ).bind(merchant, ...locationFilter.values).all();
      const grouped = new Map();
      for (const r of ((res && res.results) || [])) {
        const locationId = scope.projectLocation(r.location_id);
        const key = `${r.item_id}\u0000${r.variant_id}\u0000${locationId}`;
        const old = grouped.get(key) || {
          itemId: r.item_id, variantId: r.variant_id, locationId, qty: 0, cursor: 0,
        };
        old.qty += Number(r.qty_milli || 0) / 1000;
        old.cursor = Math.max(old.cursor, Number(r.cursor || 0));
        grouped.set(key, old);
      }
      return json({ merchant, balances: [...grouped.values()], scope: scope.metadata() });
    } catch (_) { return json({ error: 'db' }, 503); }
  }

  const refIdFilter = str(url.searchParams.get('refId') || url.searchParams.get('ref_id'), 100);
  const reasonFilter = str(url.searchParams.get('reason'), 32).toLowerCase();

  if (refIdFilter) {
    try {
      let query = `SELECT id, item_id, variant_id, location_id, qty_milli, reason,
                           unit_cost_cents, unit_cost_rate, currency, ref_type, ref_id, note, actor,
                          occurred_ts, srv_ts, reversal_of, meta
                     FROM inventory_movements
                    WHERE merchant = ? AND ref_id = ?`;
      const args = [merchant, refIdFilter];
      if (reasonFilter) {
        query += ` AND reason = ?`;
        args.push(reasonFilter);
      }
      query += locationFilter.clause;
      args.push(...locationFilter.values);
      query += ` ORDER BY occurred_ts ASC, srv_ts ASC LIMIT 200`;
      const res = await env.DB.prepare(query).bind(...args).all();
      const rows = (res && res.results) || [];
      const movements = rows.map((r) => {
        let meta = null; try { meta = r.meta ? JSON.parse(r.meta) : null; } catch (_) {}
        return {
          id: r.id, itemId: r.item_id, variantId: r.variant_id, locationId: scope.projectLocation(r.location_id),
          qty: Number(r.qty_milli || 0) / 1000, reason: r.reason,
          unitCost: rateOf(r),
          currency: r.currency, refType: r.ref_type, refId: r.ref_id, note: r.note,
          actor: r.actor, occurredTs: r.occurred_ts, cursor: r.srv_ts,
          reversalOf: r.reversal_of, meta,
        };
      });
      return json({ merchant, movements, cursor: 0, more: false, scope: scope.metadata() });
    } catch (_) { return json({ error: 'db' }, 503); }
  }

  const since = Math.max(0, Math.round(Number(url.searchParams.get('since')) || 0));
  /* Le curseur rendu reste CURSOR_LAG_MS derrière l'horloge, comme celui de la
   * file des commandes (order/_lib.js). Une écriture prend son numéro
   * (nextCursor) PUIS insère : entre les deux, une autre caisse peut insérer
   * un numéro plus grand et un lecteur avancer au-delà. La ligne qui arrive
   * ensuite, sous son curseur, n'était jamais relue. Les lignes récentes sont
   * renvoyées quand même ; la caisse les dédoublonne par id. */
  const settled = Date.now() - CURSOR_LAG_MS;
  try {
    const res = await env.DB.prepare(
      `SELECT id, item_id, variant_id, location_id, qty_milli, reason,
              unit_cost_cents, unit_cost_rate, currency, ref_type, ref_id, note, actor,
              occurred_ts, srv_ts, reversal_of, meta
         FROM inventory_movements
        WHERE merchant = ? AND srv_ts > ?${locationFilter.clause}
        ORDER BY srv_ts ASC LIMIT ?`
    ).bind(merchant, since, ...locationFilter.values, PAGE).all();
    const rows = (res && res.results) || [];
    let cursor = since;
    const movements = rows.map((r) => {
      const srv = Number(r.srv_ts || 0);
      if (srv <= settled) cursor = Math.max(cursor, srv);
      let meta = null; try { meta = r.meta ? JSON.parse(r.meta) : null; } catch (_) {}
      return {
        id: r.id, itemId: r.item_id, variantId: r.variant_id, locationId: scope.projectLocation(r.location_id),
        qty: Number(r.qty_milli || 0) / 1000, reason: r.reason,
        unitCost: rateOf(r),
        currency: r.currency, refType: r.ref_type, refId: r.ref_id, note: r.note,
        actor: r.actor, occurredTs: r.occurred_ts, cursor: r.srv_ts,
        reversalOf: r.reversal_of, meta,
      };
    });
    /* Page pleine : `next` est le numéro de sa dernière ligne, pour lire la
     * page suivante dans le même tour ; `cursor` reste le seul qu'on garde.
     * `more` ne vaut que si `cursor` avance : une caisse d'avant `next` ne
     * relit donc jamais la même page en boucle. */
    const next = rows.length === PAGE ? Number(rows[rows.length - 1].srv_ts || 0) : 0;
    return json({ merchant, movements, cursor, next, more: rows.length === PAGE && cursor > since, scope: scope.metadata() });
  } catch (_) { return json({ error: 'db' }, 503); }
}

/* D1 refuses a statement with more than 100 bound parameters (« too many
 * SQL variables », measured on production 2026-10-21; local SQLite accepts
 * 32 766, so no test saw it). The till sends up to 200 movements per batch:
 * every list below is cut so that no statement binds more than 100. Pasta
 * Corner's queue passed 39 movements on 30 September and every batch since
 * answered 503, for 1 156 movements and counting. */
const ID_CHUNK = 90;                       // merchant + 90 ids
const GUARD_CHUNK = 39;                    // 21 insert values + 2 per guarded movement
function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body; try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const scope = await resolveInventoryUnitScope(request, env, merchant, {
    terminalId: body && body.terminalId,
  });
  if (scope.scoped && !scope.allowed) return json({ error: 'unit-forbidden' }, 403);
  const raw = Array.isArray(body && body.movements) ? body.movements : [body && body.movement || body];
  if (!raw.length || raw.length > 200) return json({ error: 'bad-count' }, 400);
  const now = Date.now();
  const movements = raw.map((m) => sanitize(m, now));
  if (movements.some((m) => !valid(m))) return json({ error: 'bad-movement' }, 400);
  try {
    await Promise.all(movements.map(async (movement) => { movement.payloadHash = await movementHash(movement); }));
  } catch (_) { return json({ error: 'hash-unavailable' }, 503); }
  const byId = new Map();
  for (const movement of movements) {
    const previous = byId.get(movement.id);
    if (previous && previous !== movement.payloadHash) {
      return json({ error: 'id-conflict', ids: [movement.id] }, 409);
    }
    byId.set(movement.id, movement.payloadHash);
  }
  const legacyIds = new Set();
  for (let index = 0; index < movements.length; index += 1) {
    const source = raw[index] || {};
    const explicit = str(source.locationId ?? source.location_id, 80);
    if (explicit && !scope.permitsMovementLocation(explicit, movements[index].reason)) {
      return json({ error: 'location-forbidden' }, 403);
    }
    const effective = scope.effectiveMovementLocation(explicit, movements[index].reason);
    if (scope.scoped && !effective) return json({ error: 'location-required' }, 422);
    movements[index].locationId = effective;
  }

  /* `entitledMerchant` SANS allowTill : la session du propriétaire ou un
   * opérateur nommé, comme pour l'approbation d'un écart dans counts.js. */
  const discretionary = movements.filter((m) => !AUTOMATIC_REASONS.has(m.reason));
  if (discretionary.length) {
    let mayAdjust = false;
    try { mayAdjust = (await entitledMerchant(request, env, merchant)) === merchant; }
    catch (_) { mayAdjust = false; }
    /* Le comptoir n'est pas pour autant condamné au tableau de bord : un
     * responsable peut autoriser CES mouvements-là en frappant son code, que
     * /api/pin/verify vérifie avant de délivrer une capacité signée. Elle porte
     * la liste exacte des identifiants — elle ne peut donc pas être rejouée sur
     * une autre sortie — et elle nomme l'auteur, qui remplace tout nom que le
     * client aurait pu écrire lui-même. */
    if (!mayAdjust) {
      const proof = await readManagerStockProof(body && body.approval, env.AUTH_SECRET, merchant);
      const covers = proof && proof.scope === stockProofScope(discretionary.map((m) => m.id));
      if (!covers) return json({ error: 'reason-forbidden' }, 403);
      const who = String(proof.staffName || proof.staffId || '').slice(0, 100);
      discretionary.forEach((m) => { m.actor = who; });
    }
  }

  try { await ensureSchema(env); } catch (_) { return json({ error: 'unmigrated' }, 503); }

  /* L'id est GLOBALEMENT unique (PRIMARY KEY sans merchant) : si un id du
   * lot appartient déjà à UN AUTRE établissement, l'INSERT OR IGNORE
   * l'ignorerait silencieusement puis l'acquittement le déclarerait écrit —
   * une écriture fantôme. On refuse le lot entier AVANT toute écriture. */
  try {
    const taken = [];
    for (const part of chunks(movements, ID_CHUNK)) {
      const found = await env.DB.prepare(
        `SELECT id FROM inventory_movements WHERE id IN (${part.map(() => '?').join(',')}) AND merchant != ?`
      ).bind(...part.map((m) => m.id), merchant).all();
      ((found && found.results) || []).forEach((r) => taken.push(r.id));
    }
    if (taken.length) return json({ error: 'id-conflict', ids: taken.slice(0, 20) }, 409);
  } catch (_) { return json({ error: 'db' }, 503); }

  /* Older rows predate payload_hash. They are upgraded lazily, but only after
   * their complete immutable payload has been compared. A legacy UUID is not
   * allowed to become a different movement merely because its first replay had
   * no hash column yet. */
  try {
    let rows = [];
    try {
      for (const part of chunks(movements, ID_CHUNK)) {
        const existing = await env.DB.prepare(
          `SELECT id, item_id, variant_id, location_id, qty_milli, reason,
                  unit_cost_cents, unit_cost_rate, currency, ref_type, ref_id,
                  note, actor, occurred_ts, reversal_of, meta, payload_hash
             FROM inventory_movements
            WHERE merchant = ? AND id IN (${part.map(() => '?').join(',')})`
        ).bind(merchant, ...part.map((m) => m.id)).all();
        rows = rows.concat((existing && existing.results) || []);
      }
    } catch (_) {
      rows = [];
      /* A rolling deployment may still expose the pre-hash schema. Real D1 is
       * upgraded by ensureSchema; this fallback keeps old read-only fixtures
       * able to accept a new id while retaining the cross-tenant guard above. */
      try {
        for (const part of chunks(movements, ID_CHUNK)) {
          const legacy = await env.DB.prepare(
            `SELECT id, item_id, variant_id, location_id, qty_milli, reason,
                    unit_cost_cents, currency, ref_type, ref_id, note, actor,
                    occurred_ts, reversal_of, meta
               FROM inventory_movements
              WHERE merchant = ? AND id IN (${part.map(() => '?').join(',')})`
          ).bind(merchant, ...part.map((m) => m.id)).all();
          rows = rows.concat((legacy && legacy.results) || []);
        }
      } catch (_) { rows = []; }
    }
    for (const row of rows) {
      const wanted = byId.get(row.id);
      let actual = String(row.payload_hash || '');
      if (!actual) {
        legacyIds.add(row.id);
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(storedMovementPayload(row)));
        actual = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      }
      if (actual !== wanted) return json({ error: 'id-conflict', ids: [row.id] }, 409);
    }
  } catch (_) { return json({ error: 'db' }, 503); }

  /* Each insert is held back if a movement of its group already exists with
   * another payload (a concurrent device that won the race). The group is the
   * chunk of GUARD_CHUNK movements it belongs to, so the statement stays under
   * D1's 100 variables; a conflict found later in the batch answers 409 with
   * its id, the till sets that id aside and replays the rest, idempotently. */
  const guardOf = new Map();
  for (const group of chunks(movements, GUARD_CHUNK)) {
    const guard = {
      sql: group.map(() => "(id = ? AND payload_hash <> ? AND payload_hash <> '')").join(' OR '),
      args: group.flatMap((movement) => [movement.id, movement.payloadHash]),
    };
    group.forEach((movement) => guardOf.set(movement, guard));
  }

  const accepted = [];
  try {
    for (const m of movements) {
      const { sql: conflictGuard, args: conflictArgs } = guardOf.get(m);
      const cursor = await nextCursor(env, merchant);
      await env.DB.prepare(
        `INSERT OR IGNORE INTO inventory_movements
          (id, merchant, item_id, variant_id, location_id, qty_milli, reason,
           unit_cost_cents, unit_cost_rate, currency, ref_type, ref_id, note, actor, occurred_ts,
           srv_ts, reversal_of, meta, payload_hash, created_ts)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM inventory_movements
             WHERE merchant = ? AND (${conflictGuard})
          )
         `
      ).bind(
        m.id, merchant, m.itemId, m.variantId, m.locationId, m.qtyMilli, m.reason,
        m.unitCostCents, m.unitCostRate, m.currency, m.refType, m.refId, m.note, m.actor,
        m.occurredTs, cursor, m.reversalOf, m.meta, m.payloadHash, now,
        merchant, ...conflictArgs,
      ).run();
      // INSERT OR IGNORE is deliberately idempotent. When another device has
      // already sent this UUID, return the cursor of the existing row rather
      // than the unused sequence value allocated for this retry.
      const stored = await env.DB.prepare(
        'SELECT srv_ts AS cursor FROM inventory_movements WHERE id = ? AND merchant = ?'
      ).bind(m.id, merchant).first();
      let storedHash = null;
      try {
        const hashRow = await env.DB.prepare(
          'SELECT payload_hash FROM inventory_movements WHERE id = ? AND merchant = ?'
        ).bind(m.id, merchant).first();
        storedHash = hashRow ? String(hashRow.payload_hash || '') : null;
      } catch (_) {}
      if (!stored || (storedHash !== null && storedHash && storedHash !== m.payloadHash)
        || (storedHash === '' && !legacyIds.has(m.id))) {
        return json({ error: 'id-conflict', ids: [m.id] }, 409);
      }
      accepted.push({ id: m.id, cursor: Number(stored && stored.cursor) || cursor });
    }
  } catch (_) { return json({ error: 'db' }, 503); }
  return json({ ok: true, merchant, accepted, scope: scope.metadata() });
}
