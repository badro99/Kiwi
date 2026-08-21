import {
  entitledMerchant, isTillFor, isTerminalFor, json, readCookie,
  TERMINAL_COOKIE, terminalToken, terminalCookie
} from '../auth/_lib.js';

const EVENT_TYPES = new Set(['open', 'movement', 'handover', 'close']);
const MOVEMENT_KINDS = new Set(['in', 'out', 'no-sale']);
const MAX_CENTS = 1_000_000_000;

function ident(value, max = 96) {
  const text = String(value || '');
  return text.length > 0 && text.length <= max && /^[A-Za-z0-9._:-]+$/.test(text) ? text : '';
}
function actor(value) {
  const id = ident(value, 96);
  return id && !/^\d{4}$/.test(id) ? id : '';
}
function cents(value, signed) {
  if (value == null) return null;
  const n = Number(value);
  const min = signed ? -MAX_CENTS : 0;
  return Number.isInteger(n) && n >= min && n <= MAX_CENTS ? n : NaN;
}
function textValue(value, max) {
  const text = String(value == null ? '' : value).trim();
  return text && text.length <= max ? text : '';
}
function askedMerchant(url) {
  return String(url.searchParams.get('merchant') || '').slice(0, 64);
}
function redacted() {
  return json({ ok: true, ready: false, redacted: true, events: [] });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = askedMerchant(url);
  if (!merchant) return redacted();

  const entitled = await entitledMerchant(request, env, merchant);
  let sql = '';
  let binds = [];
  if (entitled === merchant) {
    const from = Math.max(0, Number(url.searchParams.get('from')) || 0);
    sql = `SELECT id, merchant, session_id, terminal_id, event_type,
      expected_cents, counted_cents, gap_cents, movement_kind,
      movement_amount_cents, movement_reason, actor_id,
      counterparty_actor_id, opened_ts, occurred_ts
      FROM cash_session_events WHERE merchant = ? AND occurred_ts >= ?
      ORDER BY occurred_ts ASC LIMIT 1000`;
    binds = [merchant, from];
  } else {
    const terminalId = ident(url.searchParams.get('terminalId'), 80);
    const sessionId = ident(url.searchParams.get('sessionId'));
    const till = await isTillFor(request, env, merchant);
    const terminal = terminalId && await isTerminalFor(request, env, merchant, terminalId);
    if (!till || !terminal || !sessionId) return redacted();
    sql = `SELECT id, merchant, session_id, terminal_id, event_type,
      expected_cents, counted_cents, gap_cents, movement_kind,
      movement_amount_cents, movement_reason, actor_id,
      counterparty_actor_id, opened_ts, occurred_ts
      FROM cash_session_events
      WHERE merchant = ? AND terminal_id = ? AND session_id = ?
      ORDER BY occurred_ts ASC LIMIT 500`;
    binds = [merchant, terminalId, sessionId];
  }

  try {
    const result = await env.DB.prepare(sql).bind(...binds).all();
    return json({ ok: true, ready: true, redacted: false, events: (result && result.results) || [] });
  } catch (_) {
    return json({ ok: true, ready: false, redacted: false, events: [] });
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body = {};
  try { body = (await request.json()) || {}; } catch (_) { return json({ error: 'invalid-json' }, 400); }

  const merchant = String(body.merchant || '').slice(0, 64);
  const terminalId = ident(body.terminalId, 80);
  const sessionId = ident(body.sessionId);
  const till = merchant && terminalId && sessionId && await isTillFor(request, env, merchant);
  let terminal = till && await isTerminalFor(request, env, merchant, terminalId);
  let bootstrapTerminal = false;
  if (till && !terminal && !readCookie(request, TERMINAL_COOKIE)) {
    terminal = true;
    bootstrapTerminal = true;
  }
  if (!merchant || !terminalId || !sessionId || !till || !terminal) {
    return json({ error: 'write-refused' }, 403);
  }

  const id = ident(body.id);
  const eventType = String(body.eventType || '');
  const expected = cents(body.expectedCents, false);
  const counted = cents(body.countedCents, false);
  const gap = cents(body.gapCents, true);
  const movementKind = body.movementKind == null ? '' : String(body.movementKind);
  const movementAmount = cents(body.movementAmountCents, false);
  const movementReason = body.movementReason == null ? '' : textValue(body.movementReason, 80);
  const actorId = actor(body.actorId);
  const counterpartyActorId = body.counterpartyActorId == null ? '' : actor(body.counterpartyActorId);
  const openedAt = Number(body.openedAt);
  const occurredAt = Number(body.occurredAt);

  const badMoney = [expected, counted, gap, movementAmount].some(Number.isNaN);
  const badGap = expected != null && counted != null && gap !== counted - expected;
  const badMovement = eventType === 'movement'
    ? (!MOVEMENT_KINDS.has(movementKind) || movementAmount == null || !movementReason)
    : !!(movementKind || movementAmount != null || movementReason);
  if (!id || !EVENT_TYPES.has(eventType) || !actorId || badMoney || badGap || badMovement
      || (eventType === 'handover' && !counterpartyActorId)
      || !Number.isInteger(openedAt) || !Number.isInteger(occurredAt)
      || openedAt <= 0 || occurredAt < openedAt || occurredAt > Date.now() + 600000) {
    return json({ error: 'invalid-event' }, 422);
  }

  try {
    if (eventType !== 'open') {
      const opened = await env.DB.prepare(
        "SELECT id FROM cash_session_events WHERE merchant = ? AND terminal_id = ? AND session_id = ? AND event_type = 'open' LIMIT 1"
      ).bind(merchant, terminalId, sessionId).first();
      if (!opened) return json({ error: 'session-not-open' }, 409);
    }
    await env.DB.prepare(`INSERT OR IGNORE INTO cash_session_events
      (id, merchant, session_id, terminal_id, event_type, expected_cents,
       counted_cents, gap_cents, movement_kind, movement_amount_cents,
       movement_reason, actor_id, counterparty_actor_id, opened_ts, occurred_ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, merchant, sessionId, terminalId, eventType, expected, counted, gap,
        movementKind || null, movementAmount, movementReason || null, actorId,
        counterpartyActorId || null, openedAt, occurredAt).run();
    const response = json({ ok: true, id }, 201);
    if (bootstrapTerminal) {
      response.headers.append('Set-Cookie', terminalCookie(await terminalToken(env.AUTH_SECRET, merchant, terminalId)));
    }
    return response;
  } catch (_) {
    return json({ error: 'write-unavailable' }, 503);
  }
}
