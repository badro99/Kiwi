// POST /api/sale — record one real sale into Cloudflare D1.
//
// Runs behind the passcode gate (functions/_middleware.js): the caisse's
// same-origin fetch carries the kiwi_gate cookie, so unlocked devices reach it
// and outsiders don't. Free on the Cloudflare Pages + D1 tiers.
//
// Requires a D1 binding named DB (see wrangler.toml / LIVE_LINK.md). If the
// binding is missing the endpoint fails soft (503) so the app never breaks.

import { entitledMerchant, activeServiceEmployee } from '../auth/_lib.js';
import { storeSuspended } from './_private.js';
import { startOfDay } from './order/_lib.js';
import { settleServiceTable } from './service/events.js';
import { poke } from './_live.js';

const MAX_AMOUNT = 200000; // same sanity ceiling as Order Pro

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

  const rawAmount = Number(b && b.amount);
  const amount = Math.round(rawAmount);
  if (!Number.isFinite(rawAmount) || amount <= 0 || amount > MAX_AMOUNT) {
    return json({ error: 'bad-amount' }, 400);
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
   * employee may use it, and success will also close the table/session below. */
  const employeeTable = String((b && b.table) || '').trim().replace(/^table\s*/i, '').replace(/^t(?=\d+$)/i, '').slice(0, 32);
  let employee = null;
  if (employeeTable) {
    employee = await activeServiceEmployee(request, env, merchant);
    if (!employee) return json({ error: 'on-shift-service-required' }, 403);
    if (employee.attendance && employee.attendance.pauseTs) return json({ error: 'employee-on-pause' }, 403);
  }

  /* Un établissement suspendu n'encaisse plus. C'est le seul endroit où la
   * suspension doit vraiment mordre : tout le reste est confort, ceci est la
   * caisse. La caisse garde sa file locale et retentera — rien n'est perdu, la
   * boutique rouvre avec sa journée à la réactivation. */
  if (await storeSuspended(env, merchant)) {
    return json({ error: 'store-suspended', merchant }, 423);
  }
  const method = String((b && b.method) || 'cash').slice(0, 16);
  const label = String((b && b.label) || 'Vente').slice(0, 80);
  const ref = String((b && b.ref) || '').slice(0, 40);
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
  const id = String((b && b.id) || '').slice(0, 64) || ('sale-' + ts + '-' + Math.random().toString(36).slice(2, 8));

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
  try {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO sales (id, merchant, amount, method, label, ref, ts, lines) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, merchant, amount, method, label, ref, ts, lines).run();
  } catch (e) {
    /* A database that predates the `lines` column rejects the 8-column insert.
     * Write the sale without the basket rather than lose the sale — the money
     * is the part that must not be dropped, and the migration in schema.sql
     * brings the detail back for everything recorded after it runs. */
    if (String((e && e.message) || e).includes('lines')) {
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
    } else {
      return json({ error: 'db', detail: String(e && e.message || e) }, 500);
    }
  }

  if (employeeTable) {
    /* Close every live client session for this physical table and mark its
       current-day kitchen tickets paid. These writes are idempotent, so a Wi-Fi
       retry with the same sale id completes any step whose response was lost. */
    try {
      await env.DB.prepare(
        `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = 'service-payment'
          WHERE merchant = ? AND table_no = ? AND status = 'open'`
      ).bind(now, merchant, employeeTable).run();
    } catch (_) {}
    try {
      await env.DB.prepare(
        `UPDATE orders SET paid_ts = ?, updated_ts = ?
          WHERE merchant = ? AND table_no = ? AND created_ts >= ? AND paid_ts IS NULL`
      ).bind(now, now, merchant, employeeTable, startOfDay(now)).run();
    } catch (_) {}
    const settled = await settleServiceTable(env, merchant, employeeTable);
    if (!settled.ok) return json({ error: settled.error || 'table-settlement-failed', saleSaved: true, id }, 503);
  }
  await poke(env, merchant, 'sales');
  return json({ ok: true, id, lines: linesMode, table: employeeTable || undefined });
}

// A stray GET shouldn't 405-noise the console — just report health.
export function onRequestGet({ env }) {
  return json({ ok: true, db: !!(env && env.DB) });
}
