import { merchantZone } from '../_business-day.js';
import { iceCompact, iceProblem } from '../_ice.js';
import { fail, str, parseJson, todayIn, newId } from './_shared.js';
// Contrat interne : reçoit ctx authentifié { env, db, merchant, actor, today? } ; retourne lignes, projections ou statements D1. todayFor mémorise le jour dans ctx ; aucun accès à la requête HTTP.

async function todayFor(ctx) {
  if (!ctx.today) ctx.today = todayIn(await merchantZone(ctx.env, ctx.merchant));
  return ctx.today;
}

/* ─────────────────────────── lecture d'un document ─────────────────────────── */

async function getRow(ctx, id) {
  const key = str(id, 64);
  if (!key) throw fail(400, 'invalid-id', 'Identifiant manquant.');
  const row = await ctx.db.prepare('SELECT * FROM invoice_docs WHERE id = ? AND merchant = ?').bind(key, ctx.merchant).first();
  if (!row) throw fail(404, 'not-found', 'Document introuvable.');
  return row;
}

async function sumsFor(ctx, id) {
  const p = await ctx.db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS s FROM invoice_payments WHERE merchant = ? AND doc_id = ?')
    .bind(ctx.merchant, id).first();
  const c = await ctx.db.prepare(
    "SELECT COALESCE(SUM(ttc_cents), 0) AS s FROM invoice_docs WHERE merchant = ? AND original_id = ? AND type = 'credit_note' AND number IS NOT NULL"
  ).bind(ctx.merchant, id).first();
  return { paid: Number(p && p.s) || 0, credited: Number(c && c.s) || 0 };
}

/* Solde = TTC − règlements − avoirs émis. Négatif quand on a encaissé plus que
 * ce que la facture vaut après avoir : c'est alors un remboursement à faire. */
function balanceOf(row, paid, credited) {
  if (row.type !== 'invoice') return 0;
  return Number(row.ttc_cents) - paid - credited;
}

/* L'état affiché. Tout ce qui se dérive (retard, partiel, soldé, expiré) se
 * dérive ICI et à la lecture ; seuls draft / issued / cancelled et l'état d'un
 * devis sont écrits. Le retard l'emporte sur « partiel » : c'est l'urgence. */
function displayStatus(row, paid, credited, today) {
  if (row.type === 'quote') {
    if (row.status === 'sent' && row.valid_until && row.valid_until < today) return 'expired';
    return row.status;
  }
  if (row.status === 'draft') return 'draft';
  if (row.type === 'credit_note') return row.status;
  if (row.status === 'cancelled') return 'cancelled';
  const balance = balanceOf(row, paid, credited);
  if (balance <= 0) return 'paid';
  if (row.due_date && row.due_date < today) return 'overdue';
  if (paid > 0) return 'partial';
  return 'issued';
}

const SNAKE = {
  issueDate: 'issue_date', dueDate: 'due_date', termsDays: 'terms_days', validUntil: 'valid_until',
  paymentMethod: 'payment_method', exemptionMention: 'exemption_mention', internalNote: 'internal_note',
  originalId: 'original_id', originalNumber: 'original_number', sourceQuoteId: 'source_quote_id',
  createdTs: 'created_ts', updatedTs: 'updated_ts', issuedTs: 'issued_ts', sentTs: 'sent_ts',
  cancelledTs: 'cancelled_ts', legacyRef: 'legacy_ref',
};

/* Le document tel que le client le lit : le contrat dit « la ligne complète »,
 * on la rend donc sous les deux orthographes (camelCase comme le corps des
 * requêtes, snake_case comme les colonnes). created_by ne sort pas. */
function present(row, ctx) {
  const doc = {
    id: row.id, type: row.type, status: row.status,
    displayStatus: displayStatus(row, ctx.paid, ctx.credited, ctx.today),
    number: row.number || null, seq: row.seq == null ? null : Number(row.seq),
    issueDate: row.issue_date || null, dueDate: row.due_date || null,
    termsDays: row.terms_days == null ? null : Number(row.terms_days),
    validUntil: row.valid_until || null,
    customer: parseJson(row.customer, {}), seller: row.seller ? parseJson(row.seller, null) : null,
    lines: parseJson(row.lines, []), totals: parseJson(row.totals, { htCents: 0, vatCents: 0, ttcCents: 0, byRate: [] }),
    paymentMethod: row.payment_method || null, note: row.note || '', exemptionMention: row.exemption_mention || '',
    internalNote: row.internal_note || '',
    originalId: row.original_id || null, originalNumber: ctx.originalNumber || null,
    sourceQuoteId: row.source_quote_id || null, reason: row.reason || '',
    createdTs: Number(row.created_ts) || null, updatedTs: Number(row.updated_ts) || null,
    issuedTs: row.issued_ts == null ? null : Number(row.issued_ts),
    sentTs: row.sent_ts == null ? null : Number(row.sent_ts),
    cancelledTs: row.cancelled_ts == null ? null : Number(row.cancelled_ts),
    legacyRef: row.legacy_ref || null,
    paidCents: ctx.paid, creditedCents: ctx.credited,
    balanceCents: balanceOf(row, ctx.paid, ctx.credited),
  };
  for (const [camel, snake] of Object.entries(SNAKE)) doc[snake] = doc[camel];
  return doc;
}

async function presentFull(ctx, row) {
  const { paid, credited } = await sumsFor(ctx, row.id);
  let originalNumber = null;
  if (row.original_id) {
    const o = await ctx.db.prepare('SELECT number FROM invoice_docs WHERE id = ? AND merchant = ?').bind(row.original_id, ctx.merchant).first();
    originalNumber = o && o.number;
  }
  return present(row, { paid, credited, originalNumber, today: await todayFor(ctx) });
}

/* ─────────────────────────── écriture ─────────────────────────── */

const COLS = ['id', 'merchant', 'type', 'status', 'number', 'seq', 'issue_date', 'due_date', 'terms_days', 'valid_until',
  'customer', 'seller', 'lines', 'totals', 'ttc_cents', 'payment_method', 'note', 'exemption_mention', 'internal_note',
  'original_id', 'source_quote_id', 'reason', 'created_ts', 'updated_ts', 'issued_ts', 'sent_ts', 'cancelled_ts',
  'created_by', 'legacy_ref'];

/* INSERT d'un brouillon. Avec `guard` ({sql, params}), la ligne n'est insérée que
 * si la condition tient, dans la même transaction que ce qui la précède. */
function insertStatement(ctx, d, guard) {
  const values = COLS.map((c) => (d[c] === undefined ? null : d[c]));
  const marks = COLS.map(() => '?').join(', ');
  if (guard) {
    return ctx.db.prepare(`INSERT INTO invoice_docs (${COLS.join(', ')}) SELECT ${marks} WHERE ${guard.sql}`)
      .bind(...values, ...(guard.params || []));
  }
  return ctx.db.prepare(`INSERT INTO invoice_docs (${COLS.join(', ')}) VALUES (${marks})`).bind(...values);
}

function draftRow(ctx, fields) {
  const now = Date.now();
  return {
    id: newId('inv_'), merchant: ctx.merchant, status: 'draft', created_ts: now, updated_ts: now,
    created_by: ctx.actor, ...fields,
  };
}

const CREDITED_SQL = "(SELECT COALESCE(SUM(ttc_cents), 0) FROM invoice_docs WHERE merchant = ? AND original_id = ? AND type = 'credit_note' AND number IS NOT NULL)";

/* Ce qu'il reste à créditer sur une facture émise : TTC − avoirs déjà émis. */
async function remainingCredit(ctx, invoiceRow) {
  const { credited } = await sumsFor(ctx, invoiceRow.id);
  return Number(invoiceRow.ttc_cents) - credited;
}

async function loadIssuedInvoice(ctx, id) {
  const inv = await getRow(ctx, id);
  if (inv.type !== 'invoice') throw fail(400, 'invalid-type', 'Seule une facture se crédite.');
  if (inv.status === 'draft') throw fail(409, 'not-issued', 'La facture n’est pas émise.');
  return inv;
}

/* ─────────────────────────── identité du vendeur ─────────────────────────── */

const SELLER_KEYS = { name: 120, legalName: 160, address: 200, city: 80, ice: 20, if: 30, rc: 60, patente: 40, phone: 30, email: 120 };

/* L'identité légale figée sur le document : la fiche de l'établissement tenue
 * côté serveur (document `business` de store_docs — raison sociale, adresse,
 * ICE, IF, RC, patente…), qui est la source des mentions du reçu et de la
 * facture de caisse. Ce que la fiche ne dit pas peut être complété par l'objet
 * `seller` que le client envoie à l'émission, limité aux clés connues et à des
 * longueurs bornées ; la fiche serveur l'emporte toujours quand elle dit
 * quelque chose. */
async function sellerSnapshot(ctx, hint) {
  let biz = null;
  try {
    const r = await ctx.db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'business'").bind(ctx.merchant).first();
    if (r) biz = parseJson(r.data, null);
  } catch (_) {}
  let cfgName = '';
  try {
    const r = await ctx.db.prepare('SELECT name FROM merchant_config WHERE merchant = ?').bind(ctx.merchant).first();
    cfgName = r && r.name ? String(r.name) : '';
  } catch (_) {}
  const legal = biz && biz.legal && typeof biz.legal === 'object' ? biz.legal : {};
  const fromServer = {
    name: biz && (biz.name || biz.tradeName) || cfgName,
    legalName: legal.legalName,
    address: legal.address, city: legal.city,
    ice: legal.ice,
    if: legal.fiscal != null ? legal.fiscal : (legal.if != null ? legal.if : legal.ifNum),
    rc: legal.rc, patente: legal.patente,
    phone: legal.phone, email: legal.email,
  };
  const h = hint && typeof hint === 'object' ? hint : {};
  const fromHint = { ...h, if: h.if != null ? h.if : h.fiscal };
  const out = {};
  for (const [key, max] of Object.entries(SELLER_KEYS)) {
    let v = key === 'ice' ? iceCompact(str(fromServer[key], 40)) : str(fromServer[key], max);
    if (key === 'ice' && (iceProblem(v) !== null)) v = '';
    if (!v) {
      v = key === 'ice' ? iceCompact(str(fromHint[key], 40)) : str(fromHint[key], max);
      if (key === 'ice' && (iceProblem(v) !== null)) v = '';
    }
    out[key] = v.slice(0, max);
  }
  return out;
}


export { todayFor, getRow, sumsFor, balanceOf, displayStatus, presentFull, insertStatement, draftRow, CREDITED_SQL, remainingCredit, loadIssuedInvoice, sellerSnapshot };
