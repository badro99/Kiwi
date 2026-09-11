// POST /api/sale — record one real sale into Cloudflare D1.
//
// Runs behind the passcode gate (functions/_middleware.js): the caisse's
// same-origin fetch carries the kiwi_gate cookie, so unlocked devices reach it
// and outsiders don't. Free on the Cloudflare Pages + D1 tiers.
//
// Requires a D1 binding named DB (see wrangler.toml / docs/ops/LIVE_LINK.md). If the
// binding is missing the endpoint fails soft (503) so the app never breaks.

import { entitledMerchant, activeServiceEmployee, isTillFor, isOperator, readSession, readCookie, SESS_COOKIE, storeOwner } from '../auth/_lib.js';
import { storeSuspended, storeSubscriptionPending } from './_private.js';
import { startOfDay } from './order/_lib.js';
import { settleServiceTable, serviceVisitGuard } from './service/events.js';
import { poke } from './_live.js';

const MAX_AMOUNT_CENTS = 20000000; // 200,000 MAD in centimes
const MAX_AMOUNT_DIRHAMS = 200000; // legacy ceiling
const DISCOUNT_REASONS = new Set(['commercial', 'loyal-customer', 'kitchen-error', 'other']);

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const hasAmountCents = b && b.amountCents != null && Number.isFinite(Number(b.amountCents));
  const hasAmount = b && b.amount != null && Number.isFinite(Number(b.amount));

  if (!hasAmountCents && !hasAmount) {
    return json({ error: 'bad-amount' }, 400);
  }

  let amountCents = 0;
  if (hasAmountCents) {
    amountCents = Math.round(Number(b.amountCents));
  } else {
    // Legacy client passed float or integer dirhams (e.g. 12.50 or 13)
    const rawAmount = Number(b.amount);
    amountCents = Math.round(rawAmount * 100);
  }

  // If both provided, verify they agree within rounding tolerance (<= 50 cents).
  // LOAD-BEARING: Must remain strict `> 50`, never `>= 50`. A .50 MAD sale (e.g. 12.50 MAD = 1250 cents)
  // sends rounded amount: 13 (1300 cents), giving an exact difference of 50. Changing to `>=`
  // produces a terminal 400 that permanently drops every half-dirham sale in the outbox.
  if (hasAmountCents && hasAmount) {
    const rawFromAmount = Math.round(Number(b.amount) * 100);
    if (Math.abs(amountCents - rawFromAmount) > 50) {
      return json({ error: 'bad-amount' }, 400);
    }
  }

  // Legacy whole dirham column value (rounded for backward-compatibility)
  const amount = Math.round(amountCents / 100);

  // Validate floor (> 0) and ceiling (<= 20,000,000 cents) on centime level
  if (amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
    return json({ error: 'bad-amount' }, 400);
  }

  const hasDiscount = b && (b.grossAmountCents != null || b.discountAmountCents != null || b.discountReason != null || b.actorId != null);
  let grossAmountCents = null, discountAmountCents = null, discountReason = null, discountActorId = null;
  if (hasDiscount) {
    grossAmountCents = Math.round(Number(b.grossAmountCents));
    discountAmountCents = Math.round(Number(b.discountAmountCents));
    discountReason = String(b.discountReason || '');
    discountActorId = String(b.actorId || '').slice(0, 96);
    if (!Number.isFinite(grossAmountCents) || !Number.isFinite(discountAmountCents)
      || grossAmountCents <= 0 || grossAmountCents > MAX_AMOUNT_CENTS
      || discountAmountCents <= 0 || discountAmountCents > grossAmountCents
      || Math.abs((grossAmountCents - discountAmountCents) - amountCents) > 1) return json({ error: 'bad-discount-amount' }, 400);
    if (!DISCOUNT_REASONS.has(discountReason)) return json({ error: 'bad-discount-reason' }, 400);
    if (!/^[A-Za-z0-9:_-]{1,96}$/.test(discountActorId) || /^\d{4}$/.test(discountActorId)) return json({ error: 'bad-discount-actor' }, 400);
  }

  // A sale MUST name its store. The old fallback to a literal 'default' bucket
  // meant every device whose identity had not resolved yet wrote into one shared
  // tenant — which any other unresolved device then read back as its own (see the
  // tenant-scoping note in feed.js). Refusing is strictly safer than mis-filing:
  // an unattributed sale in a shared bucket is unrecoverable, a 400 is visible.
  const asked = String((b && b.merchant) || '').slice(0, 64);
  if (!asked) return json({ error: 'no-merchant' }, 400);

  /* …and it must be a store this caller is actually entitled to. Until now the
   * slug was taken from the body and never checked, so anyone past the gate
   * could inject revenue into any merchant's books — and there is no delete
   * path to undo it. The rule is feed.js's, now shared (auth/_lib.js). A paired
   * till writes to the store it was bound to; a signed-in merchant to its own,
   * whatever the body claimed. */
  /* A clocked-in service employee may settle a table from the employee app.
   * `allowEmployee` is deliberately backed by activeServiceEmployee(): the
   * signed employee cookie alone is not enough, and an off-shift waiter still
   * cannot write money into the ledger. */
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true, allowEmployee: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  /* A waiter payment names its table. That turns this endpoint from a generic
   * ledger append into the single settlement boundary: only an on-shift floor
   * employee, paired till, or authorized store owner/operator may use it, and
   * success will also close the table/session below. */
  const employeeTable = String((b && b.table) || '').trim().replace(/^table\s*/i, '').replace(/^t(?=\d+$)/i, '').slice(0, 32);
  let employee = null;
  if (employeeTable) {
    employee = await activeServiceEmployee(request, env, merchant);
    if (!employee) {
      const isTill = await isTillFor(request, env, merchant);
      let isOwnerOrOp = false;
      if (!isTill) {
        const sess = await readSession(readCookie(request, SESS_COOKIE), env && env.AUTH_SECRET);
        if (sess && sess.aid) {
          isOwnerOrOp = (await storeOwner(env, merchant)) === sess.aid;
        }
        if (!isOwnerOrOp) {
          isOwnerOrOp = await isOperator(request, env);
        }
      }
      if (!isTill && !isOwnerOrOp) {
        return json({ error: 'on-shift-service-required' }, 403);
      }
    } else if (employee.attendance && employee.attendance.pauseTs) {
      return json({ error: 'employee-on-pause' }, 403);
    }
  }

  /* A restaurant payment settles a VISIT, never a reusable table number.
   * Both caisse and employee surfaces pass the same session id; deriving the
   * ledger id from it makes a cross-device retry hit the same primary key. */
  const rawSession = String((b && b.session) || '').trim().slice(0, 64);
  /* Older local split flows wrote `flow-*` into the queued sale as if it were
     a server table visit. Recover only that unmistakable client token when the
     payload is explicitly a takeaway split. Any real-looking server session
     remains strict and still returns table-session-missing when absent. */
  const localSplitSession = b && b.channel === 'takeaway' && b.split
    && /^flow-[a-z0-9-]+$/i.test(rawSession);
  const requestedSession = localSplitSession ? '' : rawSession;
  const split = b && b.split;
  if (split != null && (!split
    || !Number.isInteger(split.index) || !Number.isInteger(split.count)
    || split.count < 1 || split.count > 50 || split.index < 0 || split.index >= split.count)) {
    return json({ error: 'bad-split' }, 400);
  }

  let serviceSession = null;
  if (requestedSession || employeeTable) {
    try {
      serviceSession = requestedSession
        ? await env.DB.prepare(
            `SELECT id, table_no, status, opened_ts, closed_ts FROM table_sessions
              WHERE id = ? AND merchant = ? AND mode = 'table' LIMIT 1`
          ).bind(requestedSession, merchant).first()
        : await env.DB.prepare(
            `SELECT id, table_no, status, opened_ts, closed_ts FROM table_sessions
              WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open'
              ORDER BY opened_ts DESC LIMIT 1`
          ).bind(merchant, employeeTable).first();
    } catch (_) { serviceSession = null; }
    if (requestedSession && (!serviceSession || !serviceSession.id)) {
      return json({ error: 'table-session-missing' }, 404);
    }
    if (!serviceSession || !serviceSession.id) {
      if (employee) return json({ error: 'open-service-session-required' }, 409);
    } else if (employeeTable && String(serviceSession.table_no) !== employeeTable) {
      return json({ error: 'service-session-table-mismatch' }, 409);
    }
    /* Caisse persists its local receipt and closes the visit in parallel. The
       close request may arrive first; a closed visit must therefore still be
       allowed to write its deterministic sale row. INSERT OR IGNORE below is
       the arbiter, so a later replay remains one row. */
    if (employee && serviceSession && serviceSession.status === 'open') {
      let sent = null;
      try {
        sent = await env.DB.prepare(
          `SELECT id FROM orders WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL LIMIT 1`
        ).bind(merchant, serviceSession.id).first();
      } catch (err) {
        console.error('[sale] Order verification query threw for session', serviceSession.id);
        return json({ error: 'db-read-failed' }, 500);
      }
      if (!sent || !sent.id) return json({ error: 'send-order-before-payment' }, 409);
    }
  }

  /* Un établissement suspendu n'encaisse plus. C'est le seul endroit où la
   * suspension doit vraiment mordre : tout le reste est confort, ceci est la
   * caisse. La caisse garde sa file locale et retentera — rien n'est perdu, la
   * boutique rouvre avec sa journée à la réactivation. */
  if (await storeSuspended(env, merchant)) {
    return json({ error: 'store-suspended', merchant }, 423);
  }
  if (await storeSubscriptionPending(env, merchant)) {
    return json({ error: 'subscription-required', merchant }, 402);
  }
  const method = String((b && b.method) || 'cash').slice(0, 16);
  const label = String((b && b.label) || 'Vente').slice(0, 80);
  const ref = String((b && b.ref) || '').slice(0, 40);
  const channel = String((b && b.channel) || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 24);
  const rawTs = Number(b && b.ts);
  // A broken device clock must not create a sale dated years in the future,
  // which would poison daily reports indefinitely. Old offline sales remain
  // valid; only non-finite/non-positive/future values are normalised.
  const now = Date.now();
  const ts = Number.isFinite(rawTs) && rawTs > 0 && rawTs <= now + 86400000 ? rawTs : now;

  // The row id is the caller's idempotency key. A till that loses WiFi mid-POST
  // cannot know whether the sale landed, so it retries from its offline queue —
  // and with a server-invented id every retry would have written the day's
  // takings twice. The client now sends a stable id per sale (see the queue in
  // assets/live-link.js) and INSERT OR IGNORE makes the retry a no-op. Callers
  // that send no id keep the old behaviour: a fresh row every time.
  const effectiveSessionId = (serviceSession && serviceSession.id) || requestedSession;
  const splitPrefix = split && effectiveSessionId
    ? ('visit-' + String(effectiveSessionId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) + '-split-') : '';
  const splitIds = splitPrefix ? Array.from({ length: split.count }, (_, i) => splitPrefix + i + '-emp') : [];
  const id = splitPrefix ? splitIds[split.index] : (serviceSession
    ? ('visit-' + String(serviceSession.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 52) + '-emp')
    : (String((b && b.id) || '').slice(0, 64) || ('sale-' + ts + '-' + Math.random().toString(36).slice(2, 8))));

  /* The basket. Validated and re-serialised here rather than trusted: this is
   * client-supplied JSON going into a column the dashboard and the assistant
   * both read, so it gets the same treatment as every other field — bounded
   * length, bounded count, coerced types. A malformed or oversized basket
   * costs the line detail, never the sale. */
  let lines = null;
  try {
    const raw = b && b.lines;
    if (Array.isArray(raw) && raw.length) {
      /* `c` = la catégorie du produit AU MOMENT DE LA VENTE, telle que la
       * caisse la connaissait. Elle est facultative et le rapport journalier
       * sait s'en passer (il repêche la catégorie dans le catalogue actuel, par
       * nom) — mais le repêchage se trompe dès que le commerçant renomme un
       * rayon, déplace un produit ou le supprime. Deux mois plus tard, le
       * rapport d'une journée passée reclasserait ses ventes selon un catalogue
       * qui n'existait pas ce jour-là. Stockée avec la ligne, la catégorie est
       * datée comme le reste du ticket et ne bouge plus.
       *
       * Vide si absente, jamais inventée : le rapport distingue « pas de
       * catégorie connue » de « catégorie Divers », et ne prétend pas classer
       * l'historique écrit avant cette ligne. */
      const clean = raw.slice(0, 40).map((l) => {
        const qty = Math.round(Math.max(0, Math.min(1000000,
          Number(l && (l.q ?? l.qty ?? l.quantity)) || 0)) * 1000) / 1000;
        const o = {
          n: String((l && (l.n ?? l.name)) || 'Article').slice(0, 60),
          q: qty,
          t: Math.round(Math.max(0, Math.min(100000000,
            Number(l && (l.t ?? l.total)) || 0)) * 100) / 100,
        };
        const c = String((l && (l.c ?? l.cat ?? l.category)) || '').slice(0, 40);
        if (c) o.c = c;
        /* Sale-line v2.  Names remain snapshots for receipts and old reports;
         * these stable identifiers are what stock, recipe and margin engines
         * need in order to avoid guessing against today's catalogue. */
        const itemId = String((l && (l.i ?? l.itemId ?? l.item_id ?? l.id)) || '').slice(0, 80);
        const variantId = String((l && (l.v ?? l.variantId ?? l.variant_id)) || '').slice(0, 80);
        const unit = String((l && (l.u ?? l.unit)) || '').slice(0, 24);
        const kind = String((l && (l.kd ?? l.kind)) || '').slice(0, 24);
        const recipeVersion = String((l && (l.r ?? l.recipeVersionId ?? l.recipe_version_id)) || '').slice(0, 80);
        if (itemId) o.i = itemId;
        if (variantId) o.v = variantId;
        if (unit) o.u = unit;
        if (kind) o.kd = kind;
        if (recipeVersion) o.r = recipeVersion;

        const rawFormulaChoices = l && (l.fc ?? l.formulaChoices);
        if (Array.isArray(rawFormulaChoices)) {
          const formulaChoices = rawFormulaChoices.slice(0, 30).map((choice) => ({
            n: String((choice && (choice.n ?? choice.name)) || 'Choix').slice(0, 60),
            q: Math.round(Math.max(0, Math.min(1000000,
              Number(choice && (choice.q ?? choice.qty)) || 1)) * 1000) / 1000 || 1,
            t: Math.round(Math.max(0, Math.min(100000000,
              Number(choice && (choice.t ?? choice.total)) || 0)) * 100) / 100,
          }));
          if (formulaChoices.length) o.fc = formulaChoices;
        }

        const rawCost = Number(l && (l.k ?? l.unitCost ?? l.unit_cost));
        if (Number.isFinite(rawCost) && rawCost >= 0 && rawCost <= 10000000) {
          o.k = Math.round(rawCost * 100) / 100;
        }

        /* Options are deliberately a small list of stable id + quantity
         * deltas.  Free-form notes and photos do not belong in the financial
         * sale row and would make the offline queue unbounded. */
        const rawOptions = l && (l.o ?? l.options ?? l.optionDeltas ?? l.option_deltas);
        if (Array.isArray(rawOptions)) {
          const options = rawOptions.slice(0, 16).map((x) => {
            if (typeof x === 'string') return { i: x.slice(0, 80), q: 1 };
            const id = String((x && (x.i ?? x.id ?? x.itemId)) || '').slice(0, 80);
            const oq = Math.round(Math.max(-1000000, Math.min(1000000,
              Number(x && (x.q ?? x.qty ?? x.quantity)) || 0)) * 1000) / 1000;
            return id ? { i: id, q: oq || 1 } : null;
          }).filter(Boolean);
          if (options.length) o.o = options;
        }
        return o;
      }).filter((l) => l.q > 0);
      if (clean.length) {
        const s = JSON.stringify(clean);
        /* Le plafond monte avec la catégorie : 40 lignes × ~40 caractères de
         * plus, sinon un gros panier catégorisé perdrait TOUT son détail au
         * profit d'un `lines = null`. La colonne est un TEXT, elle s'en moque. */
        if (s.length <= 24000) lines = s;
      }
    }
  } catch (_) { lines = null; }

  let linesMode = 'stored';
  let stored = false;

  // ── IDEMPOTENCY VS CONFLICT CHECK ─────────────────────────────────────────
  // A replay of the exact same financial transaction is safe and idempotent.
  // But a retry claiming the same unique sale ID with conflicting money or
  // method is rejected to prevent silent ledger corruption.
  let existing = null;
  let preflightError = null;
  try {
    existing = await env.DB.prepare(
      'SELECT id, amount, amount_cents, method FROM sales WHERE id = ? AND merchant = ? LIMIT 1'
    ).bind(id, merchant).first();
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (msg.includes('no such column') || msg.includes('amount_cents')) {
      try {
        existing = await env.DB.prepare(
          'SELECT id, amount, method FROM sales WHERE id = ? AND merchant = ? LIMIT 1'
        ).bind(id, merchant).first();
      } catch (fallbackErr) {
        preflightError = fallbackErr;
      }
    } else {
      preflightError = err;
    }
  }
  if (preflightError) {
    return json({
      error: 'db-verification-failed',
      detail: String((preflightError && preflightError.message) || preflightError),
      id,
    }, 503);
  }
  if (existing && existing.id) {
    const existingCents = existing.amount_cents != null
      ? Math.round(Number(existing.amount_cents))
      : Math.round(Number(existing.amount || 0) * 100);
    const existingMethod = String(existing.method || '');
    if (existingCents !== amountCents || existingMethod !== method) {
      return json({
        error: 'sale-conflict',
        detail: 'conflicting-financial-data',
        id: id,
        expected: { amountCents: existingCents, method: existingMethod },
        received: { amountCents, method },
      }, 409);
    }
    stored = true;
  }

  if (hasDiscount) {
    try {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO sales (id, merchant, amount, method, label, ref, ts, lines, channel, amount_cents, gross_amount_cents, discount_amount_cents, discount_reason, discount_actor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, merchant, amount, method, label, ref, ts, lines, channel || null, amountCents,
             grossAmountCents, discountAmountCents, discountReason, discountActorId).run();
      stored = true;
    } catch (discountError) {
      const message = String((discountError && discountError.message) || discountError);
      if (!/gross_amount_cents|discount_amount_cents|discount_reason|discount_actor_id/.test(message)) {
        return json({ error: 'db', detail: message }, 500);
      }
    }
  }
  if (!stored) try {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO sales (id, merchant, amount, method, label, ref, ts, lines, channel, amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, merchant, amount, method, label, ref, ts, lines, channel || null, amountCents).run();
  } catch (e) {
    const missing = String((e && e.message) || e);
    if (missing.includes('channel')) {
      try {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO sales (id, merchant, amount, method, label, ref, ts, lines) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, merchant, amount, method, label, ref, ts, lines).run();
        linesMode = 'stored-channel-unmigrated';
      } catch (legacyError) {
        if (!String((legacyError && legacyError.message) || legacyError).includes('lines')) {
          return json({ error: 'db', detail: String(legacyError && legacyError.message || legacyError) }, 500);
        }
      }
    } else if (missing.includes('amount_cents')) {
      try {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO sales (id, merchant, amount, method, label, ref, ts, lines, channel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, merchant, amount, method, label, ref, ts, lines, channel || null).run();
        linesMode = 'stored-no-cents';
      } catch (channelError) {
        if (String((channelError && channelError.message) || channelError).includes('channel')) {
          try {
            await env.DB.prepare(
              'INSERT OR IGNORE INTO sales (id, merchant, amount, method, label, ref, ts, lines) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(id, merchant, amount, method, label, ref, ts, lines).run();
            linesMode = 'stored-channel-unmigrated';
          } catch (legacyError) {
            if (!String((legacyError && legacyError.message) || legacyError).includes('lines')) {
              return json({ error: 'db', detail: String(legacyError && legacyError.message || legacyError) }, 500);
            }
          }
        }
      }
    }
    if (missing.includes('lines') || ((missing.includes('channel') || missing.includes('amount_cents')) && linesMode === 'stored')) {
      try {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO sales (id, merchant, amount, method, label, ref, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, merchant, amount, method, label, ref, ts).run();
        linesMode = 'unmigrated';
      } catch (_) { /* fall through to the real error */ }
      if (linesMode === 'unmigrated') {
        /* Continue into table settlement; an old optional `lines` column must
           never leave money saved while the table remains occupied. */
      } else {
        return json({ error: 'db', detail: String(e && e.message || e) }, 500);
      }
    } else if (linesMode !== 'stored-channel-unmigrated' && linesMode !== 'stored-no-cents') {
      return json({ error: 'db', detail: String(e && e.message || e) }, 500);
    }
  }

  // -- DURABLE WRITE BOUNDARY CONFLICT VERIFICATION ---------------------------
  // Under concurrency, competing requests with conflicting financial data
  // may both pass preflight reads before either insert finishes.
  // Inspect the winning persisted row in the database: if the stored row has
  // a different amount or method, this request lost the race and must fail 409 Conflict.
  let winning = null;
  let verifyError = null;
  try {
    winning = await env.DB.prepare(
      'SELECT id, amount, amount_cents, method FROM sales WHERE id = ? AND merchant = ? LIMIT 1'
    ).bind(id, merchant).first();
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (msg.includes('no such column') || msg.includes('amount_cents')) {
      try {
        winning = await env.DB.prepare(
          'SELECT id, amount, method FROM sales WHERE id = ? AND merchant = ? LIMIT 1'
        ).bind(id, merchant).first();
      } catch (fallbackErr) {
        verifyError = fallbackErr;
      }
    } else {
      verifyError = err;
    }
  }

  // If reading the winning row failed due to an unexpected DB error, fail safely with 503
  // so the client outbox retains and retries with the same idempotency key.
  if (verifyError) {
    return json({
      error: 'db-verification-failed',
      detail: String((verifyError && verifyError.message) || verifyError),
      id,
    }, 503);
  }

  // If the query returned null (no winning row found in database), persistence could not be verified.
  if (!winning || !winning.id) {
    return json({
      error: 'sale-not-persisted',
      id,
    }, 503);
  }

  const winningCents = winning.amount_cents != null
    ? Math.round(Number(winning.amount_cents))
    : Math.round(Number(winning.amount || 0) * 100);
  const winningMethod = String(winning.method || '');
  if (winningCents !== amountCents || winningMethod !== method) {
    return json({
      error: 'sale-conflict',
      detail: 'conflicting-financial-data',
      id: id,
      expected: { amountCents: winningCents, method: winningMethod },
      received: { amountCents, method },
    }, 409);
  }

  // ONLY after durable verification succeeds:
  // An idempotent replay can carry a later canonical restaurant number.
  // The money, method, timestamp and basket are immutable; only the human-facing
  // reference may be reconciled.
  if (ref) {
    try {
      await env.DB.prepare(
        'UPDATE sales SET ref = ? WHERE id = ? AND merchant = ? AND (ref IS NULL OR ref <> ?)'
      ).bind(ref, id, merchant, ref).run();
    } catch (_) { /* Older schemas still retain the successfully inserted sale. */ }
  }

  let settlementPending = false;
  let splitComplete = !split;
  if (split) {
    if (splitIds.length) {
      // Distinct, deterministic rows preserve each tender and make retries safe.
      // Closing depends on durable receipts, never on a client's pre-fetch count.
      try {
        const receipts = await env.DB.prepare(
          `SELECT id FROM sales WHERE merchant = ? AND id IN (${splitIds.map(() => '?').join(',')})`
        ).bind(merchant, ...splitIds).all();
        splitComplete = new Set((receipts.results || []).map(row => row.id)).size === split.count;
      } catch (_) {
        return json({ error: 'split-receipts-unavailable' }, 503);
      }
    } else {
      splitComplete = true;
    }
  }
  if (serviceSession && serviceSession.id && splitComplete) {
    const settledTable = employeeTable || String(serviceSession.table_no || '');
    const sessionWasOpen = serviceSession.status === 'open';

    // Check if a newer visit has already opened on this table
    let hasNewerVisit = false;
    try {
      const newerRow = await env.DB.prepare(
        `SELECT id FROM table_sessions
          WHERE merchant = ? AND table_no = ? AND id <> ?
            AND (status = 'open' OR opened_ts >= ?)
          LIMIT 1`
      ).bind(merchant, settledTable, serviceSession.id, Number(serviceSession.opened_ts) || 0).first();
      if (newerRow && newerRow.id) hasNewerVisit = true;
    } catch (_) {
      // Receipt is already durable. Keep the same command retryable, but do
      // not interpret an unreadable ownership check as permission to settle.
      await poke(env, merchant, 'sales');
      return json({ ok: true, id, lines: linesMode, table: settledTable, settlementPending: true });
    }

    // 1. Close session if open, recording pending status until complete
    if (sessionWasOpen) {
      try {
        await env.DB.prepare(
          `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = 'service-payment-pending'
            WHERE id = ? AND merchant = ? AND status = 'open'`
        ).bind(now, serviceSession.id, merchant).run();
      } catch (err) {
        console.error('[sale] Failed to mark table session closed for session', serviceSession.id, 'merchant', merchant);
        settlementPending = true;
      }
    }

    // A no-op or failed close is not a completed stage. Re-read the durable
    // boundary before freeing occupancy or paying unlinked orders.
    let closedSession = null;
    try {
      closedSession = await env.DB.prepare('SELECT status, closed_ts, closed_by FROM table_sessions WHERE id = ? AND merchant = ?')
        .bind(serviceSession.id, merchant).first();
    } catch (_) { settlementPending = true; }
    if (settlementPending || !closedSession || closedSession.status !== 'closed') {
      await poke(env, merchant, 'sales');
      return json({ ok: true, id, lines: linesMode, table: settledTable, settlementPending: true });
    }

    // 2. Settle orders
    const visitStart = Number(serviceSession.opened_ts) || now;
    const sessionCutoff = Number(closedSession.closed_ts) || Number(serviceSession.closed_ts) || now;
    const visitGuard = serviceVisitGuard(merchant, settledTable, serviceSession);
    try {
      if (!hasNewerVisit) {
        await env.DB.prepare(
          `UPDATE orders SET paid_ts = ?, updated_ts = ?
            WHERE merchant = ? AND paid_ts IS NULL
              AND ( session_id = ?
                 OR (session_id IS NULL AND table_no = ?
                     AND created_ts BETWEEN ? AND ? AND ${visitGuard.sql}) )`
        ).bind(now, now, merchant, serviceSession.id, settledTable, visitStart, sessionCutoff, ...visitGuard.args).run();
      } else {
        // Newer visit exists: strictly settle orders belonging to this specific session only
        await env.DB.prepare(
          `UPDATE orders SET paid_ts = ?, updated_ts = ?
            WHERE merchant = ? AND paid_ts IS NULL AND session_id = ?`
        ).bind(now, now, merchant, serviceSession.id).run();
      }
    } catch (_) {
      settlementPending = true;
    }

    // Check if any orders for this session remain unpaid
    try {
      const unpaid = await env.DB.prepare(
        `SELECT id FROM orders WHERE merchant = ? AND paid_ts IS NULL
          AND (session_id = ? OR (session_id IS NULL AND table_no = ?
            AND created_ts BETWEEN ? AND ? AND ${visitGuard.sql})) LIMIT 1`
      ).bind(merchant, serviceSession.id, settledTable, visitStart, sessionCutoff, ...visitGuard.args).first();
      if (unpaid && unpaid.id) settlementPending = true;
    } catch (_) {
      settlementPending = true;
    }

    // 3. Floor reconciliation (settleServiceTable)
    // Only attempt floor settlement if no newer visit has taken over this table
    if (!hasNewerVisit) {
      let floorNeedsSettlement = true;
      try {
        const docRow = await env.DB.prepare(
          "SELECT data FROM store_docs WHERE merchant = ? AND feature = 'service-events'"
        ).bind(merchant).first();
        const docData = JSON.parse((docRow && docRow.data) || '{}');
        const st = docData && docData.states && docData.states[settledTable];
        if (st && st.status === 'khawya') {
          floorNeedsSettlement = false;
        }
      } catch (_) {}

      if (floorNeedsSettlement) {
        const settled = await settleServiceTable(env, merchant, settledTable, serviceSession);
        if (!settled.ok) {
          settlementPending = true;
        }
      }
    }

    // Finalize only after all stages are verified. The parallel caisse close
    // may have won first, so its closed_by marker is not proof of completion.
    if (!settlementPending) {
      try {
        await env.DB.prepare(
          `UPDATE table_sessions SET closed_by = 'service-payment'
            WHERE id = ? AND merchant = ? AND status = 'closed'`
        ).bind(serviceSession.id, merchant).run();
        const complete = await env.DB.prepare('SELECT status, closed_by FROM table_sessions WHERE id = ? AND merchant = ?')
          .bind(serviceSession.id, merchant).first();
        if (!complete || complete.status !== 'closed' || complete.closed_by !== 'service-payment') settlementPending = true;
      } catch (_) { settlementPending = true; }
    }
  }
  await poke(env, merchant, 'sales');
  return json({
    ok: true, id, lines: linesMode, table: employeeTable || (serviceSession && serviceSession.table_no) || undefined,
    settlementPending: settlementPending || undefined,
  });
}

// A stray GET shouldn't 405-noise the console — just report health.
export function onRequestGet({ env }) {
  return json({ ok: true, db: !!(env && env.DB) });
}
