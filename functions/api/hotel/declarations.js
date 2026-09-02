// Kiwi — Hotel Monthly Internal Review & Revisions Ledger
//
// INTERNAL integrity snapshot, not an official declaration. The locked spec
// (docs/specs/HOTEL_TOURISM_REPORTING_SPEC.md §5) freezes the official STDN
// closing, regulatory occupancy/MRE/REM maths, minor/day-use rules and any
// administrative export: this route computes none of those and claims none.
// It seals an append-only, hash-chained revision of internal aggregates so a
// manager can prove *what the books said* on a given day — nothing more.
//
// Source of truth: the append-only `hotel_stay_events` ledger (uncapped,
// server cursor). `store_docs.reservations` is the operational cache capped at
// 4 000 bookings: it is consulted for per-stay PII detail checks only, and any
// stay the ledger knows but the cache lost BLOCKS the review instead of being
// silently undercounted. No event table → 503, never a silent fallback.

import { tenantFor } from '../_private.js';
import {
  json, verifyStaffPin, isOperator, operatorActor,
} from '../../auth/_lib.js';
import { resolveHotelActor } from '../inventory/_hotel-actor.js';
import { resolveInventoryUnitScope } from '../inventory/_unit-scope.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const REF_RE = /^[A-Za-z0-9._~-]{8,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TZ = 'Africa/Casablanca';

const str = (val, max = 255) => (typeof val === 'string' ? val.trim().slice(0, max) : '');

/* Deterministic key-sorted JSON for audit hashing. Deliberately NOT advertised
 * as RFC 8785 (JCS): full JCS also canonicalises numbers, strings and unicode
 * escapes, which this does not do. Inputs here are counts, ISO codes and
 * fixed-shape aggregates we control, so sorted-keys + compact separators is
 * byte-stable — and the test pins determinism, not an RFC number. */
export function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

export async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Direction-level roles, accent-insensitive. Union of the manager-override
 * list used by /api/sale/cancel and the hotel-manager terms from
 * _hotel-actor.js — one ladder, no second PIN path. */
const DIRECTION_ROLES = new Set([
  'manager', 'owner', 'proprietaire', 'admin', 'administrateur', 'direction',
  'gerant', 'responsable', 'superviseur', 'managerowner', 'hotelmanager',
  'directeurgeneral', 'directricegenerale', 'directeurhotel', 'directricehotel',
  'directeur', 'directrice', 'gouvernant', 'gouvernante', 'econome',
]);
function plainRole(value) {
  return String(value || '').trim().toLocaleLowerCase('fr')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}
function isDirectionRole(role) {
  const normalized = plainRole(role);
  return DIRECTION_ROLES.has(normalized) || /(?:^|-)manager$/.test(normalized);
}

function todayCasa() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/* Authority ladder for the monthly review. Allowed: the entitled owner session
 * or a direction-level employee (both resolve to kind 'hotel-manager' via
 * resolveHotelActor, which also covers named operators), or a direction-role
 * staff PIN presented by an already-authenticated caller (paired till, owner
 * session or named operator — verifyStaffPin enforces that boundary plus rate
 * limiting). Refused: cashier/serveur/employee/department roles, bare tills,
 * anonymous callers, and anybody from another tenant. A PIN alone, with no
 * session or till cookie, proves nothing and resolves nothing. */
async function resolveReviewer(request, env, merchant, pin) {
  try {
    const actor = await resolveHotelActor(request, env, merchant);
    if (actor && actor.kind === 'hotel-manager') {
      return { ok: true, userId: String(actor.id || '').slice(0, 96), userName: String(actor.name || 'Direction').slice(0, 120) };
    }
  } catch (_) {}
  try {
    if (await isOperator(request, env)) {
      const op = await operatorActor(request, env);
      return { ok: true, userId: String((op && op.id) || 'operator').slice(0, 96), userName: String((op && op.label) || 'Opérateur Kiwi').slice(0, 120) };
    }
  } catch (_) {}
  if (pin) {
    const verified = await verifyStaffPin(request, env, merchant, pin, { requireTill: true });
    if (!verified.ok) {
      if (verified.response) return { ok: false, response: verified.response };
      return { ok: false, error: verified.error || 'unauthorized', status: verified.status || 401 };
    }
    if (!isDirectionRole(verified.staff && verified.staff.role)) {
      return { ok: false, error: 'manager-required', status: 403 };
    }
    return {
      ok: true,
      userId: verified.staff.id ? `staff:${String(verified.staff.id).slice(0, 80)}` : '',
      userName: String(verified.staff.name || verified.staff.role || 'Direction').slice(0, 120),
    };
  }
  return { ok: false, error: 'unauthorized', status: 401 };
}

async function tableExists(env, name) {
  try {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1"
    ).bind(name).first();
    return !!(row && row.name);
  } catch (_) { return false; }
}

function formatDeclaration(r) {
  let payload = {};
  let lineage = {};
  try { payload = JSON.parse(r.payload_json || '{}'); } catch (_) {}
  try { lineage = JSON.parse(r.lineage_json || '{}'); } catch (_) {}
  return {
    merchant: r.merchant, month: r.month, revision: r.revision, state: r.state,
    sourceCursor: r.source_cursor, idempotencyKey: r.idempotency_key,
    canonicalHash: r.canonical_hash, previousHash: r.previous_hash,
    payload, lineage,
    closedAt: r.closed_at, closedBy: { id: r.closed_by_user_id, name: r.closed_by_name },
    rectificationReason: r.rectification_reason, createdAt: r.created_at,
  };
}

async function readRevisions(env, merchant, month) {
  const rows = (await env.DB.prepare(
    'SELECT * FROM hotel_monthly_declarations WHERE merchant = ? AND month = ? ORDER BY revision DESC'
  ).bind(merchant, month).all())?.results || [];
  return rows;
}

function overlapNights(fromDate, toDate, monthStart, nextMonth) {
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) return 0;
  const start = fromDate > monthStart ? fromDate : monthStart;
  const end = toDate < nextMonth ? toDate : nextMonth;
  if (end <= start) return 0;
  return Math.max(0, Math.round((Date.parse(end + 'T12:00:00Z') - Date.parse(start + 'T12:00:00Z')) / 86400000));
}

/* Rebuild the authoritative stay set from the event ledger. Every event carries
 * a full snapshot payload (not a delta), so the latest event per stay — ordered
 * by the server cursor, then the per-revision ordinal — IS the stay's state.
 * Cancelled and no-show stays are excluded from every aggregate. */
function staysFromEvents(eventRows) {
  const latest = new Map();
  for (const row of eventRows) {
    const cursor = Number(row.srv_cursor);
    const ordinal = Number(row.event_ordinal);
    if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(ordinal) || ordinal < 0) {
      throw new Error('invalid-event-ledger');
    }
    let payload = null;
    try { payload = JSON.parse(row.payload_json || 'null'); } catch (_) { throw new Error('invalid-event-ledger'); }
    const stayId = String(row.stay_id || '');
    if (!payload || typeof payload !== 'object' || !stayId || String(payload.stayId || '') !== stayId) {
      throw new Error('invalid-event-ledger');
    }
    const prev = latest.get(stayId);
    if (!prev || cursor > prev.cursor || (cursor === prev.cursor && ordinal > prev.ordinal)) {
      latest.set(stayId, { cursor, ordinal, payload });
    }
  }
  return [...latest.values()].map((entry) => entry.payload).filter((stay) => {
    const status = String(stay.status || '');
    return status && status !== 'cancelled' && status !== 'no_show';
  });
}

function aggregateMonth(stays, monthStart, nextMonth) {
  let totalArrivals = 0;
  let totalBedNights = 0;
  const occupiedRoomNights = new Set();
  const byNationality = {};
  const statusCounts = {};
  for (const stay of stays) {
    const checkIn = String(stay.checkIn || '');
    const checkOut = String(stay.checkOut || '');
    if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut) || checkOut <= checkIn) continue;
    if (!(checkIn < nextMonth && checkOut > monthStart)) continue;
    const status = String(stay.status || 'unknown');
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const segments = Array.isArray(stay.guestSegments) ? stay.guestSegments : [];
    const travelers = segments.length ? segments : [{ nationalityCountry: '' }];
    if (checkIn >= monthStart && checkIn < nextMonth) totalArrivals += travelers.length;
    const roomSegs = Array.isArray(stay.roomSegments) && stay.roomSegments.length
      ? stay.roomSegments
      : [{ roomId: String(stay.roomId || stay.stayId || ''), fromDate: checkIn, toDate: checkOut }];
    for (const seg of travelers) {
      const nights = overlapNights(String(seg.fromDate || checkIn), String(seg.toDate || checkOut), monthStart, nextMonth);
      if (nights <= 0) continue;
      totalBedNights += nights;
      const nat = /^[A-Z]{2}$/.test(String(seg.nationalityCountry || '')) ? seg.nationalityCountry : 'XX';
      byNationality[nat] = (byNationality[nat] || 0) + nights;
    }
    for (const seg of roomSegs) {
      const roomId = String(seg.roomId || stay.roomId || stay.stayId || '');
      if (!roomId) continue;
      const nights = overlapNights(String(seg.fromDate || checkIn), String(seg.toDate || checkOut), monthStart, nextMonth);
      const base = Date.parse(((String(seg.fromDate || checkIn) > monthStart ? String(seg.fromDate || checkIn) : monthStart)) + 'T12:00:00Z');
      for (let i = 0; i < nights; i++) {
        occupiedRoomNights.add(`${roomId}|${new Date(base + i * 86400000).toISOString().slice(0, 10)}`);
      }
    }
  }
  return { totalArrivals, totalBedNights, occupiedRoomNightsCount: occupiedRoomNights.size, nightsByNationality: byNationality, statusCounts, activeStaysCount: stays.length };
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const scope = await resolveInventoryUnitScope(request, env, merchant);
  if (!scope.scoped) return json({ error: 'hotel-units-required' }, 409);
  const reviewer = await resolveReviewer(request, env, merchant, '');
  if (!reviewer.ok) return json({ error: reviewer.error }, reviewer.status || 401);

  const month = url.searchParams.get('month') || '';
  if (month && !MONTH_RE.test(month)) return json({ error: 'invalid-month' }, 400);
  try {
    if (!(await tableExists(env, 'hotel_monthly_declarations'))) {
      return json({ error: 'declaration-unavailable', migrationRequired: true }, 503);
    }
    let query = 'SELECT * FROM hotel_monthly_declarations WHERE merchant = ?';
    const params = [merchant];
    if (month) { query += ' AND month = ?'; params.push(month); }
    query += ' ORDER BY month DESC, revision DESC';
    const rows = (await env.DB.prepare(query).bind(...params).all())?.results || [];
    return json({ ok: true, merchant, month: month || null, declarations: rows.map(formatDeclaration) });
  } catch (e) {
    return json({ error: 'db-error' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = await tenantFor(request, env, body?.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  const action = str(body?.action || 'finalize', 16);
  const month = str(body?.month, 7);
  const idempotencyKey = str(body?.idempotencyKey, 80);
  const pin = str(body?.pin, 12);
  const rectificationReason = str(body?.rectificationReason, 500);

  if (!MONTH_RE.test(month)) return json({ error: 'invalid-month', detail: 'Format YYYY-MM requis.' }, 400);
  if (!['finalize', 'rectify'].includes(action)) return json({ error: 'bad-action' }, 400);
  if (!idempotencyKey) return json({ error: 'missing-idempotency-key', detail: 'Chaque scellé ou révision exige une clé d’idempotence.' }, 400);
  if (!REF_RE.test(idempotencyKey)) return json({ error: 'invalid-idempotency-key' }, 400);

  const reviewer = await resolveReviewer(request, env, merchant, pin);
  if (!reviewer.ok) {
    if (reviewer.response) return reviewer.response;
    return json({ error: reviewer.error }, reviewer.status || 401);
  }
  const scope = await resolveInventoryUnitScope(request, env, merchant);
  if (!scope.scoped) return json({ error: 'hotel-units-required' }, 409);

  if (action === 'rectify' && rectificationReason.length < 10) {
    return json({ error: 'missing-reason', detail: 'Un motif d’au moins 10 caractères est requis pour déposer une révision corrective.' }, 400);
  }
  if (!(await tableExists(env, 'hotel_monthly_declarations'))) {
    return json({ error: 'declaration-unavailable', migrationRequired: true }, 503);
  }
  if (!(await tableExists(env, 'hotel_stay_events'))) {
    return json({ error: 'declaration-unavailable', detail: 'Journal des séjours indisponible : contrôle interne refusé plutôt que calculé sur une source tronquée.', migrationRequired: true }, 503);
  }

  let existingRevs = [];
  try {
    existingRevs = await readRevisions(env, merchant, month);
  } catch (e) {
    return json({ error: 'db-error' }, 500);
  }

  const replay = existingRevs.find((r) => r.idempotency_key === idempotencyKey);
  if (replay) {
    let replayLineage = {};
    try { replayLineage = JSON.parse(replay.lineage_json || '{}'); } catch (_) {}
    if (replayLineage.action && replayLineage.action !== action) {
      return json({ error: 'idempotency-key-reuse', detail: 'Cette clé a déjà scellé une autre opération : générez-en une nouvelle.' }, 409);
    }
    return json({ ok: true, replayed: true, declaration: formatDeclaration(replay) });
  }
  if (action === 'finalize' && existingRevs.length > 0) {
    return json({
      error: 'already-finalized',
      detail: `Le mois ${month} a déjà fait l’objet d’un contrôle interne (révision ${existingRevs[0].revision}). Déposez une révision corrective pour corriger.`,
      currentRevision: existingRevs[0].revision,
    }, 409);
  }
  if (action === 'rectify' && existingRevs.length === 0) {
    return json({ error: 'not-finalized', detail: `Le mois ${month} n’a jamais fait l’objet d’un contrôle interne. Scellez-le d’abord (« finalize »).` }, 404);
  }
  const expectedRev = action === 'finalize' ? 0 : (+existingRevs[0].revision || 0);
  const previousHash = action === 'rectify' ? String(existingRevs[0].canonical_hash || '') : '';
  if (action === 'rectify' && (!Number.isSafeInteger(expectedRev) || expectedRev < 1 || !previousHash)) {
    return json({ error: 'revision-chain-broken' }, 409);
  }

  // Authoritative month from the event ledger — never from the capped cache.
  let eventRows = [];
  try {
    eventRows = (await env.DB.prepare(
      'SELECT stay_id, event_type, payload_json, srv_cursor, event_ordinal FROM hotel_stay_events WHERE merchant = ? ORDER BY srv_cursor ASC, event_ordinal ASC'
    ).bind(merchant).all())?.results || [];
  } catch (e) {
    return json({ error: 'db-error' }, 500);
  }
  const sourceCursor = eventRows.reduce((max, r) => Math.max(max, +r.srv_cursor || 0), 0);
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const mNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(Date.UTC(year, mNum, 0)).getUTCDate();
  const monthStart = `${month}-01`;
  const nextMonth = mNum === 12 ? `${year + 1}-01-01` : `${year}-${String(mNum + 1).padStart(2, '0')}-01`;
  let stays = [];
  try {
    stays = staysFromEvents(eventRows).filter((stay) => {
      const checkIn = String(stay.checkIn || '');
      const checkOut = String(stay.checkOut || '');
      return DATE_RE.test(checkIn) && DATE_RE.test(checkOut) && checkIn < nextMonth && checkOut > monthStart;
    });
  } catch (_) {
    return json({ error: 'event-ledger-invalid', detail: 'Journal des séjours invalide : contrôle interne refusé.' }, 503);
  }

  // Per-stay PII detail lives in the operational cache. A ledger stay the
  // cache lost (4 000-booking cap, eviction) BLOCKS the review: silently
  // undercounting a month is exactly the failure this ledger exists to stop.
  let detailById = new Map();
  try {
    const stayRow = await env.DB.prepare(
      "SELECT data FROM store_docs WHERE merchant = ? AND feature = 'reservations' LIMIT 1"
    ).bind(merchant).first();
    let doc = null;
    try { doc = stayRow && stayRow.data ? JSON.parse(stayRow.data) : null; } catch (_) {}
    const bookings = doc && Array.isArray(doc.bookings) ? doc.bookings : [];
    detailById = new Map(bookings.filter((b) => b && b.id).map((b) => [String(b.id), b]));
  } catch (e) {
    return json({ error: 'db-error' }, 500);
  }

  const today = todayCasa();
  const blockingExceptions = [];
  for (const stay of stays) {
    const stayId = String(stay.stayId || '');
    const status = String(stay.status || '');
    const checkOut = String(stay.checkOut || '');
    const detail = detailById.get(stayId);
    if (!detail) {
      blockingExceptions.push({
        bookingId: stayId, code: 'stay-detail-unavailable',
        label: 'Séjour absent du cache opérationnel : contrôle interne refusé',
      });
      continue;
    }
    if (status !== 'checked_in' && status !== 'completed') continue;
    if (status === 'checked_in' && DATE_RE.test(checkOut) && checkOut < today) {
      blockingExceptions.push({
        bookingId: stayId, bookingCode: String(detail.code || ''), roomId: String(detail.resourceId || ''),
        code: 'stale_checkout', label: `Séjour non clôturé (départ prévu le ${checkOut})`,
      });
    }
    const guests = Array.isArray(detail.guests) ? detail.guests : [];
    const partySize = Math.max(1, +detail.partySize || 1);
    if (guests.length < partySize) {
      blockingExceptions.push({
        bookingId: stayId, bookingCode: String(detail.code || ''), roomId: String(detail.resourceId || ''),
        code: 'missing_manifest', label: `Fiche voyageurs incomplète (${guests.length}/${partySize})`,
      });
    }
    guests.forEach((g, idx) => {
      const num = idx + 1;
      if (!g || !g.idDocNumber || !g.idDocType) {
        blockingExceptions.push({
          bookingId: stayId, bookingCode: String(detail.code || ''), roomId: String(detail.resourceId || ''),
          code: 'missing_identity', label: `Pièce d’identité manquante (voyageur ${num})`,
        });
      }
      if (!g || !g.nationality) {
        blockingExceptions.push({
          bookingId: stayId, bookingCode: String(detail.code || ''), roomId: String(detail.resourceId || ''),
          code: 'missing_nationality', label: `Nationalité manquante (voyageur ${num})`,
        });
      }
    });
  }

  if (blockingExceptions.length > 0) {
    return json({
      error: 'unresolved-exceptions',
      detail: `Contrôle mensuel interne impossible : ${blockingExceptions.length} anomalie(s) bloquante(s) sur le mois ${month}.`,
      exceptions: blockingExceptions,
    }, 422);
  }

  const agg = aggregateMonth(stays, monthStart, nextMonth);
  const now = Date.now();
  const nextRevision = expectedRev + 1;
  const payload = {
    merchant, month, revision: nextRevision, sourceCursor, daysInMonth,
    totalArrivals: agg.totalArrivals, totalBedNights: agg.totalBedNights,
    occupiedRoomNightsCount: agg.occupiedRoomNightsCount,
    nightsByNationality: agg.nightsByNationality, statusCounts: agg.statusCounts,
    activeStaysCount: agg.activeStaysCount, finalizedAt: now,
  };
  const canonicalHash = await sha256Hex(canonicalJson(payload));
  const lineage = { engine: 'kiwi-hotel-internal-review-v1', schemaVersion: 1, action, sourceCursor };

  /* Compare-and-swap insert: the row lands only if the revision tip is still
   * the one we read. A concurrent finalize/rectify makes the predicate false,
   * zero rows move, and we map it to replay/409 — never a 500, never a forked
   * chain. previous_hash always points at the tip we actually built on. */
  let inserted = 0;
  let insertConflict = false;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO hotel_monthly_declarations (
         merchant, month, revision, state, source_cursor, idempotency_key,
         canonical_hash, previous_hash, payload_json, lineage_json,
         closed_at, closed_by_user_id, closed_by_name, rectification_reason, created_at
       ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COALESCE(MAX(revision), 0) FROM hotel_monthly_declarations WHERE merchant = ? AND month = ?) = ?`
    ).bind(
      merchant, month, nextRevision, action === 'finalize' ? 'snapshot' : 'snapshot-rectified',
      sourceCursor, idempotencyKey, canonicalHash, previousHash,
      JSON.stringify(payload), JSON.stringify(lineage),
      now, reviewer.userId, reviewer.userName, rectificationReason || '', now,
      merchant, month, expectedRev
    ).run();
    inserted = Number(result && result.meta && result.meta.changes) || 0;
  } catch (e) {
    // Genuine DB failures stay 5xx; only a lost race maps to replay/409.
    if (!/UNIQUE|PRIMARY|constraint/i.test(String((e && e.message) || e || ''))) {
      return json({ error: 'write-declaration-failed' }, 500);
    }
    insertConflict = true;
  }
  if (inserted <= 0 && !insertConflict) {
    // CAS predicate false: someone sealed a revision between our read and write.
    insertConflict = true;
  }
  if (!insertConflict) {
    let stored = null;
    try {
      stored = await env.DB.prepare(
        'SELECT * FROM hotel_monthly_declarations WHERE merchant = ? AND idempotency_key = ? LIMIT 1'
      ).bind(merchant, idempotencyKey).first();
    } catch (_) {}
    if (!stored) return json({ error: 'db-error' }, 500);
    return json({ ok: true, declaration: formatDeclaration(stored) });
  }
  {
    let current = [];
    try { current = await readRevisions(env, merchant, month); } catch (_) {}
    const won = current.find((r) => r.idempotency_key === idempotencyKey);
    if (won) return json({ ok: true, replayed: true, declaration: formatDeclaration(won) });
    if (action === 'finalize') {
      return json({
        error: 'already-finalized',
        detail: `Le mois ${month} a déjà fait l’objet d’un contrôle interne. Déposez une révision corrective pour corriger.`,
        currentRevision: current.length ? current[0].revision : null,
      }, 409);
    }
    return json({
      error: 'revision-conflict',
      detail: `Une autre révision a été scellée entre-temps pour ${month}. Rechargez et reposez votre révision corrective.`,
      currentRevision: current.length ? current[0].revision : null,
    }, 409);
  }
}
