import { ensureInvoicingSchema } from './_invoice-series.js';
import { fail, failResponse, str, parseJson, validDay, DOC_TYPES, MAX_LIST, MAX_BODY, DAY_RE } from './invoices/_shared.js';
import { getRow, todayFor, presentFull, displayStatus, balanceOf } from './invoices/_documents.js';
import { save, issue, markSent } from './invoices/_lifecycle.js';
import { payment, deletePayment } from './invoices/_payments.js';
import { creditNote, quoteStatus, convertQuote, duplicate, deleteDraft } from './invoices/_adjustments.js';
import { importLegacy } from './invoices/_legacy.js';
export { VAT_RATES, PAYMENT_METHODS, DOC_TYPES } from './invoices/_shared.js';
export { computeTotals } from './invoices/_tax.js';
// GET  /api/invoices — factures, avoirs et devis saisis d'un établissement.
// POST /api/invoices — créer, émettre, encaisser, créditer, convertir.
//
// Facturation v2 (contrat du 2026-10-13, partagé avec assets/invoicing.js). Ce que le serveur
// tient, et que le navigateur ne peut pas tenir :
//   · les MONTANTS : le serveur seul calcule les totaux, en centimes entiers,
//     par taux de TVA. Un total envoyé par le client est ignoré ;
//   · le NUMÉRO : attribué à l'émission seulement, par l'allocateur commun
//     (_invoice-series.js), sans trou ni doublon, partagé avec les factures de
//     caisse pour la série F ;
//   · le VERROU : une fois émise, une facture ou un avoir ne bouge plus ; on la
//     corrige par un avoir, jamais en la rouvrant ;
//   · les BORNES : un règlement ne dépasse pas le solde, un avoir ne dépasse
//     pas ce qui reste à créditer.
//
// Qui entre : la session du compte propriétaire, ou un opérateur nommé. Rien
// d'autre : ni la caisse appairée, ni un employé connecté, ni le cookie de
// l'expert-comptable (qui ne lit les livres que par /api/comptable/books). Même
// règle que les documents de `store.js` qui portent des secrets (editsRoster) :
// `entitledMerchant` SANS allowTill ni allowEmployee. La porte du site
// (functions/_middleware.js) n'ouvre RIEN pour cette route.
//
// Aucune donnée de facture ni de client ne va dans un journal.

import { json, entitledMerchant, activeAccountSession } from '../auth/_lib.js';
import { storeOperationalState } from './_private.js';

/* Extraction privée : shared */

/* Extraction privée : tax */

/* ─────────────────────────── accès ─────────────────────────── */

async function authorize(request, env, askedRaw, write) {
  const asked = str(askedRaw, 64);
  if (!asked) throw fail(400, 'invalid-merchant', 'Établissement manquant.');
  let entitled = '';
  try { entitled = await entitledMerchant(request, env, asked); } catch (_) { entitled = ''; }
  if (!entitled) throw fail(401, 'unauthorized', 'Connexion requise.');
  if (entitled !== asked) throw fail(403, 'forbidden', 'Établissement non autorisé.');
  if (write) {
    const state = await storeOperationalState(env, asked);
    if (!state.ok || state.suspended || state.pending) throw fail(403, 'forbidden', 'Écriture indisponible pour cet établissement.');
  }
  let actor = 'operator';
  try {
    const sess = await activeAccountSession(request, env);
    if (sess && sess.aid) actor = 'acc:' + sess.aid;
  } catch (_) {}
  return { env, db: env.DB, merchant: asked, actor };
}

/* Extraction privée : documents */

/* ─────────────────────────── GET ─────────────────────────── */

export async function onRequestGet({ request, env }) {
  try {
    if (!env || !env.DB) return json({ error: 'no-db' }, 503);
    const url = new URL(request.url);
    const ctx = await authorize(request, env, url.searchParams.get('merchant'), false);
    return await withTables(ctx, () => read(ctx, url));
  } catch (err) { return failResponse(err); }
}

/* La production a du retard sur schema.sql : une table absente se crée à la
 * première demande qui la touche, puis la demande est rejouée une fois. */
async function withTables(ctx, fn) {
  try { return await fn(); }
  catch (err) {
    if (!/no such table/i.test(String((err && err.message) || err))) throw err;
    await ensureInvoicingSchema(ctx.db);
    return fn();
  }
}

async function read(ctx, url) {
  const today = await todayFor(ctx);
  const id = url.searchParams.get('id');
  if (id) {
    const row = await getRow(ctx, id);
    const full = await presentFull(ctx, row);
    const pays = await ctx.db.prepare(
      'SELECT id, amount_cents, date, method, reference, created_ts FROM invoice_payments WHERE merchant = ? AND doc_id = ? ORDER BY date, created_ts'
    ).bind(ctx.merchant, row.id).all();
    const cns = await ctx.db.prepare(
      "SELECT id, number, ttc_cents, issue_date FROM invoice_docs WHERE merchant = ? AND original_id = ? AND type = 'credit_note' AND number IS NOT NULL ORDER BY seq"
    ).bind(ctx.merchant, row.id).all();
    return json({
      ok: true,
      doc: full,
      payments: ((pays && pays.results) || []).map((p) => ({
        id: p.id, amountCents: Number(p.amount_cents), date: p.date || null, method: p.method || null,
        reference: p.reference || '', createdTs: Number(p.created_ts),
      })),
      creditNotes: ((cns && cns.results) || []).map((c) => ({
        id: c.id, number: c.number, ttcCents: Number(c.ttc_cents), issueDate: c.issue_date || null,
      })),
      displayStatus: full.displayStatus,
      balanceCents: full.balanceCents,
    });
  }

  const type = url.searchParams.get('type');
  if (type && !DOC_TYPES.includes(type)) throw fail(400, 'invalid-type', 'Type inconnu.');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from && !validDay(from)) throw fail(400, 'invalid-from', 'Date de début invalide.');
  if (to && !validDay(to)) throw fail(400, 'invalid-to', 'Date de fin invalide.');

  const rawCursor = url.searchParams.get('cursor');
  const cursor = rawCursor ? readListCursor(rawCursor) : null;
  if (rawCursor && !cursor) throw fail(400, 'bad-cursor', 'Curseur de liste invalide.');
  const asked = Number(url.searchParams.get('limit'));
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_LIST) : MAX_LIST;

  const where = ['d.merchant = ?'];
  const params = [ctx.merchant];
  if (type) { where.push('d.type = ?'); params.push(type); }
  if (from) { where.push('d.issue_date >= ?'); params.push(from); }
  if (to) { where.push('d.issue_date <= ?'); params.push(to); }
  /* Pagination par curseur (clé composée, stable même si des documents
   * s'ajoutent entre deux pages) : date d'émission, puis création, puis
   * identifiant, du plus récent au plus ancien. Toujours DANS le magasin
   * (d.merchant = ? reste la première condition) : un curseur n'est qu'une
   * position, jamais une permission. */
  if (cursor) {
    where.push(`(COALESCE(d.issue_date, '') < ? OR (COALESCE(d.issue_date, '') = ? AND (d.created_ts < ? OR (d.created_ts = ? AND d.id < ?))))`);
    params.push(cursor.day, cursor.day, cursor.ts, cursor.ts, cursor.id);
  }
  const rows = await ctx.db.prepare(
    `SELECT d.id, d.type, d.status, d.number, d.issue_date, d.due_date, d.valid_until, d.customer, d.ttc_cents,
            d.legacy_ref, d.original_id, d.source_quote_id, d.created_ts, o.number AS original_number
       FROM invoice_docs d LEFT JOIN invoice_docs o ON o.id = d.original_id AND o.merchant = d.merchant
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(d.issue_date, '') DESC, d.created_ts DESC, d.id DESC LIMIT ${limit + 1}`
  ).bind(...params).all();
  const all = (rows && rows.results) || [];
  const list = all.slice(0, limit);
  const lastRow = list[list.length - 1];
  const nextCursor = all.length > limit && lastRow ? writeListCursor(lastRow) : null;

  const paid = new Map();
  const credited = new Map();
  if (list.some((r) => r.type === 'invoice')) {
    const p = await ctx.db.prepare('SELECT doc_id, SUM(amount_cents) AS s FROM invoice_payments WHERE merchant = ? GROUP BY doc_id').bind(ctx.merchant).all();
    for (const r of (p && p.results) || []) paid.set(r.doc_id, Number(r.s) || 0);
    const c = await ctx.db.prepare(
      "SELECT original_id, SUM(ttc_cents) AS s FROM invoice_docs WHERE merchant = ? AND type = 'credit_note' AND number IS NOT NULL AND original_id IS NOT NULL GROUP BY original_id"
    ).bind(ctx.merchant).all();
    for (const r of (c && c.results) || []) credited.set(r.original_id, Number(r.s) || 0);
  }

  const docs = list.map((r) => {
    const p = paid.get(r.id) || 0;
    const cr = credited.get(r.id) || 0;
    const cust = parseJson(r.customer, {});
    const out = {
      id: r.id, type: r.type, status: r.status,
      displayStatus: displayStatus(r, p, cr, today),
      number: r.number || null, issueDate: r.issue_date || null, dueDate: r.due_date || null,
      customer: { name: String(cust.name || ''), ice: String(cust.ice || '') },
      totals: { ttcCents: Number(r.ttc_cents) || 0 },
      balanceCents: balanceOf(r, p, cr),
      paidCents: p,
    };
    if (r.type === 'quote') out.validUntil = r.valid_until || null;
    if (r.original_number) out.originalNumber = r.original_number;
    if (r.legacy_ref) out.legacyRef = r.legacy_ref;
    return out;
  });
  /* `nextCursor` vaut null sur la dernière page. Un client qui n'envoie pas de
   * curseur reçoit la même première page qu'avant (500 au plus) et peut
   * ignorer ce champ. */
  return json({ ok: true, docs, nextCursor });
}

/* Le curseur est opaque pour le client : base64url de [jour, création, id]
 * de la dernière ligne rendue, relu et validé strictement. */
function writeListCursor(r) {
  const raw = JSON.stringify([String(r.issue_date || ''), Number(r.created_ts) || 0, String(r.id)]);
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function readListCursor(raw) {
  const s = String(raw || '');
  if (!/^[A-Za-z0-9_-]{8,400}$/.test(s)) return null;
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const v = JSON.parse(decodeURIComponent(escape(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))));
    if (!Array.isArray(v) || v.length !== 3) return null;
    const [day, ts, id] = v;
    if (typeof day !== 'string' || (day && !DAY_RE.test(day))) return null;
    if (!Number.isSafeInteger(ts) || ts < 0) return null;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
    return { day, ts, id };
  } catch (_) { return null; }
}

/* ─────────────────────────── POST ─────────────────────────── */

export async function onRequestPost({ request, env }) {
  try {
    if (!env || !env.DB) return json({ error: 'no-db' }, 503);
    const text = await request.text();
    if (text.length > MAX_BODY) throw fail(413, 'too-large', 'Requête trop volumineuse.');
    let body;
    try { body = JSON.parse(text); } catch (_) { throw fail(400, 'bad-json', 'JSON invalide.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'bad-json', 'JSON invalide.');
    const ctx = await authorize(request, env, body.merchant, true);
    const handler = ACTIONS[String(body.action || '')];
    if (!handler) throw fail(400, 'invalid-action', 'Action inconnue.');
    return await withTables(ctx, () => handler(ctx, body));
  } catch (err) { return failResponse(err); }
}

/* Extraction privée : lifecycle */

/* Extraction privée : payments */

/* Extraction privée : adjustments */

/* Extraction privée : legacy */

const ACTIONS = {
  save,
  issue,
  'mark-sent': markSent,
  payment,
  'delete-payment': deletePayment,
  'credit-note': creditNote,
  'quote-status': quoteStatus,
  'convert-quote': convertQuote,
  duplicate,
  'delete-draft': deleteDraft,
  'import-legacy': importLegacy,
};
