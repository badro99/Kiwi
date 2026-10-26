import { expectedCashCents } from './_rules-day-report.js';
import {
  entitledMerchant, isTillFor, isTerminalFor, json, readCookie,
  TERMINAL_COOKIE, terminalToken, terminalCookie, tillEpoch
} from '../auth/_lib.js';

const EVENT_TYPES = new Set(['open', 'movement', 'handover', 'close']);
const MOVEMENT_KINDS = new Set(['in', 'out', 'no-sale']);
/* Why a closing count differs from the expected cash (étape 4, the count
   sheet's reason chips, outside tolerance): a close only, one of four codes. */
const GAP_REASONS = new Set(['counting', 'change', 'unrecorded', 'other']);
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
    /* L'enrôlement sans cookie n'existe que pour un poste NEUF. Sans cette
     * vérification, n'importe quelle caisse appairée pouvait écrire dans le
     * tiroir d'un autre poste du même commerçant en effaçant son cookie et en
     * annonçant son terminalId : les écarts de caisse d'un collègue devenaient
     * modifiables. Un poste qui a déjà un historique garde le sien. */
    let known = null;
    try {
      known = await env.DB.prepare(
        'SELECT id FROM cash_session_events WHERE merchant = ? AND terminal_id = ? LIMIT 1'
      ).bind(merchant, terminalId).first();
    } catch (_) { known = null; }
    if (!known) {
      terminal = true;
      bootstrapTerminal = true;
    }
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
  const gapReason = body.gapReason == null ? '' : String(body.gapReason);
  const actorId = actor(body.actorId);
  const counterpartyActorId = body.counterpartyActorId == null ? '' : actor(body.counterpartyActorId);
  const openedAt = Number(body.openedAt);
  const occurredAt = Number(body.occurredAt);

  const badMoney = [expected, counted, gap, movementAmount].some(Number.isNaN);
  const badGap = expected != null && counted != null && gap !== counted - expected;
  const badMovement = eventType === 'movement'
    ? (!MOVEMENT_KINDS.has(movementKind) || movementAmount == null || !movementReason)
    : !!(movementKind || movementAmount != null || movementReason);
  const badGapReason = !!gapReason && (eventType !== 'close' || !GAP_REASONS.has(gapReason));
  if (!id || !EVENT_TYPES.has(eventType) || !actorId || badMoney || badGap || badMovement || badGapReason
      || (eventType === 'handover' && !counterpartyActorId)
      || (eventType === 'close' && (expected == null || counted == null || gap == null))
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
    /* Le fond de caisse attendu était purement déclaratif : la caisse envoyait
     * `expectedCents`, le serveur se contentait de vérifier que gap = compté −
     * attendu. Annoncer un attendu bas rendait donc un manquant invisible.
     * Le serveur ne peut pas reconstituer les ventes espèces d'un poste (la
     * table `sales` ne porte ni terminal ni session), mais il détient toute la
     * chaîne d'événements de la session : ouverture + entrées − sorties est un
     * PLANCHER que l'attendu ne peut pas passer. On ne refuse jamais la
     * fermeture — un comptoir bloqué est pire — on retient le plancher et on
     * recalcule l'écart avec. */
    let expectedFinal = expected;
    let gapFinal = gap;
    if (expected != null && eventType !== 'open') {
      try {
        const chain = await env.DB.prepare(
          `SELECT id, event_type, expected_cents, gap_cents, movement_kind, movement_amount_cents, occurred_ts
             FROM cash_session_events
            WHERE merchant = ? AND terminal_id = ? AND session_id = ?`
        ).bind(merchant, terminalId, sessionId).all();
        let floorCents = 0;
        ((chain && chain.results) || []).forEach((row) => {
          if (row.id === id) return;   // a replay never counts itself
          if (row.event_type === 'open') floorCents += Number(row.expected_cents) || 0;
          else if (row.event_type === 'movement') {
            const amount = Number(row.movement_amount_cents) || 0;
            if (row.movement_kind === 'in') floorCents += amount;
            else if (row.movement_kind === 'out') floorCents -= amount;
          } else if (row.event_type === 'handover') {
            /* Un passage de caisse signé qui a trouvé un manquant le reporte
             * dans l'attendu du poste (drawerExpected côté caisse). Jusqu'au
             * 22 octobre 2026 le plancher l'ignorait : l'attendu honnête
             * passait SOUS lui, le serveur le remontait, et la clôture
             * comptait une seconde fois le manquant déjà signé. */
            floorCents += Number(row.gap_cents) || 0;
          }
        });
        /* Les remboursements en espèces sortent du tiroir sans être des
         * mouvements : un retour en début de service fait légitimement passer
         * l'attendu sous ouverture + entrées − sorties. La table des ventes ne
         * porte pas le poste, donc on retire tous ceux du commerce sur la
         * période (et les ventes espèces d'avant annulées pendant) : le
         * plancher ne peut que baisser, jamais inventer un manquant. */
        /* La fenêtre ne vient PAS du corps de la requête : un poste qui
         * annoncerait une ouverture ancienne ramasserait des mois de
         * remboursements et effacerait le manquant que ce plancher doit voir.
         * Elle part de l'ouverture ENREGISTRÉE, ne dépasse pas l'horloge du
         * serveur, et ne couvre jamais plus de 24 heures. */
        const openRow = ((chain && chain.results) || []).find((row) => row.event_type === 'open' && row.id !== id);
        const until = Math.min(Number(occurredAt) || 0, Date.now()) + 600000;
        const since = Math.max(Number(openRow && openRow.occurred_ts) || until, until - 24 * 3600000);
        const outflow = await env.DB.prepare(
          `SELECT amount_cents, method, payment_parts FROM sales
            WHERE merchant = ?
              AND ((amount_cents < 0 AND ts BETWEEN ? AND ?)
                OR (amount_cents > 0 AND ts < ? AND void_ts BETWEEN ? AND ?))
              AND (method = 'cash' OR payment_parts LIKE '%cash%')
            LIMIT 2000`
        ).bind(merchant, since, until, since, since, until).all();
        let cashOut = 0;
        ((outflow && outflow.results) || []).forEach((sale) => {
          const whole = Math.abs(Number(sale.amount_cents) || 0);
          if (sale.method === 'cash') { cashOut += whole; return; }
          let part = 0;
          try {
            (JSON.parse(sale.payment_parts) || []).forEach((p) => {
              if (p && p.method === 'cash') part += Math.abs(Number(p.amountCents) || 0);
            });
          } catch (_) { part = 0; }
          cashOut += Math.min(part, whole);   // seule la part espèces sort du tiroir
        });
        floorCents = expectedCashCents(floorCents, 0, 0, 0, cashOut, 0);
        if (Number.isFinite(floorCents) && floorCents > expectedFinal) {
          expectedFinal = Math.min(floorCents, MAX_CENTS);
          if (counted != null) gapFinal = counted - expectedFinal;
        }
      } catch (_) { /* base muette : on garde la valeur annoncée */ }
    }
    /* The gap's reason is written WITH the close, in the same append: this
       ledger is insert-only (no UPDATE, no DELETE), so a reason is never added
       afterwards. A base that lags schema.sql gets the column on first use (as
       sale.js does tip_cents); if it cannot be added, the close is appended
       without the reason and never refused. */
    let reasonColumn = false;
    if (gapReason) {
      try {
        const columns = await env.DB.prepare('PRAGMA table_info(cash_session_events)').all();
        reasonColumn = (columns.results || []).some((column) => column.name === 'gap_reason');
        if (!reasonColumn) {
          try { await env.DB.prepare('ALTER TABLE cash_session_events ADD COLUMN gap_reason TEXT').run(); reasonColumn = true; } catch (_) {}
        }
      } catch (_) { /* the close stands; the Z keeps the reason */ }
    }
    const eventBinds = [id, merchant, sessionId, terminalId, eventType, expectedFinal, counted, gapFinal,
      movementKind || null, movementAmount, movementReason || null, actorId,
      counterpartyActorId || null, openedAt, occurredAt];
    if (reasonColumn) {
      await env.DB.prepare(`INSERT OR IGNORE INTO cash_session_events
        (id, merchant, session_id, terminal_id, event_type, expected_cents,
         counted_cents, gap_cents, movement_kind, movement_amount_cents,
         movement_reason, actor_id, counterparty_actor_id, opened_ts, occurred_ts, gap_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(...eventBinds, gapReason).run();
    } else {
      await env.DB.prepare(`INSERT OR IGNORE INTO cash_session_events
        (id, merchant, session_id, terminal_id, event_type, expected_cents,
         counted_cents, gap_cents, movement_kind, movement_amount_cents,
         movement_reason, actor_id, counterparty_actor_id, opened_ts, occurred_ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(...eventBinds).run();
    }
    const response = json({ ok: true, id }, 201);
    if (bootstrapTerminal) {
      const epoch = await tillEpoch(env, merchant);
      if (!Number.isFinite(epoch)) return json({ error: 'auth-verification-unavailable' }, 503);
      response.headers.append('Set-Cookie', terminalCookie(await terminalToken(env.AUTH_SECRET, merchant, terminalId, epoch)));
    }
    return response;
  } catch (_) {
    return json({ error: 'write-unavailable' }, 503);
  }
}
