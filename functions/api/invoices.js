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
import { merchantZone } from './_business-day.js';
import { iceCompact, iceProblem, ICE_DETAIL } from './_ice.js';
import { PREFIXES, allocateNumber, ensureInvoicingSchema } from './_invoice-series.js';

/* Les taux de TVA marocains (CGI art. 87 et 89). Une seule liste, exportée :
 * elle peut changer sans toucher au reste. 0 = exonéré (mention obligatoire). */
export const VAT_RATES = [20, 14, 10, 7, 0];
export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'cheque', 'other'];
export const DOC_TYPES = ['invoice', 'credit_note', 'quote'];

const MAX_LINES = 200;
const MAX_LIST = 500;
const MAX_IMPORT = 500;
const MAX_BODY = 2000000;
const MAX_DOC_CENTS = 1e12;          // 10 milliards de dirhams : borne de bon sens
const MAX_UNIT_CENTS = 1e9;
const MAX_QTY = 1e6;
const QUOTE_VALID_DAYS = 30;
const CHUNK = 40;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ─────────────────────────── erreurs ─────────────────────────── */

class Fail extends Error {
  constructor(status, code, message, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = message || '';
    this.extra = extra || null;
  }
}
const fail = (status, code, message, extra) => new Fail(status, code, message, extra);

function failResponse(err) {
  if (err instanceof Fail) {
    return json({ error: err.code, message: err.detail, ...(err.extra || {}) }, err.status);
  }
  // Rien du message interne ne sort : il pourrait porter une requête ou une valeur.
  return json({ error: 'server-error', message: 'Erreur serveur.' }, 500);
}

/* ─────────────────────────── utilitaires ─────────────────────────── */

const str = (v, max) => String(v == null ? '' : v)
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .trim()
  .slice(0, max);

function parseJson(text, fallback) {
  try { const v = JSON.parse(text); return v == null ? fallback : v; } catch (_) { return fallback; }
}

function validDay(day) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return false;
  const t = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day;
}
function addDays(day, n) {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}
function todayIn(zone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (_) { return new Date().toISOString().slice(0, 10); }
}

function newId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return prefix + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const changesOf = (res) => Number(res && res.meta && res.meta.changes) || 0;

/* ─────────────────────────── montants ─────────────────────────── */

/* Total HT d'une ligne, en centimes entiers, arrondi à la demi-unité supérieure :
 *   round(qté × PU × (1 − remise %)).
 * En BigInt : quantité en millièmes, remise en centièmes de pour cent, aucun
 * flottant ne décide d'un centime. */
function lineHT(line) {
  const qtyMilli = BigInt(Math.round(line.qty * 1000));
  const discount = BigInt(Math.round(line.discountPct * 100));
  const num = qtyMilli * BigInt(line.unitHT) * (10000n - discount);
  const den = 10000000n; // 1000 (millièmes) × 10000 (centièmes de %)
  return Number((num * 2n + den) / (2n * den));
}

/* Les totaux d'un document : HT, TVA par taux, TTC. La TVA se calcule sur la BASE
 * de chaque taux (somme des lignes), pas ligne par ligne : c'est ce que la
 * facture imprime et ce que la déclaration reprend. */
export function computeTotals(lines) {
  const groups = new Map();
  let ht = 0;
  for (const line of lines) {
    const v = lineHT(line);
    ht += v;
    groups.set(line.vatRate, (groups.get(line.vatRate) || 0) + v);
  }
  if (ht > MAX_DOC_CENTS) throw fail(400, 'invalid-lines', 'Montant trop élevé.');
  const byRate = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, baseCents]) => ({ rate, baseCents, vatCents: Math.floor((baseCents * rate + 50) / 100) }));
  const vat = byRate.reduce((s, g) => s + g.vatCents, 0);
  return { htCents: ht, vatCents: vat, ttcCents: ht + vat, byRate };
}

/* ─────────────────────────── normalisation ─────────────────────────── */

function normCustomer(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    name: str(c.name, 120),
    address: str(c.address, 300),
    ice: iceCompact(str(c.ice, 40)).slice(0, 20),
    if: str(c.if != null ? c.if : c.ifNum, 30),
    email: str(c.email, 120),
    phone: str(c.phone, 30),
    clientId: str(c.clientId, 64),
  };
}

function normLines(raw) {
  if (!Array.isArray(raw)) throw fail(400, 'invalid-lines', 'Lignes attendues.');
  if (raw.length > MAX_LINES) throw fail(400, 'invalid-lines', 'Trop de lignes.');
  const out = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') throw fail(400, 'invalid-lines', 'Ligne invalide.');
    const qty = Number(l.qty);
    const unit = Number(l.unitHT);
    const disc = l.discountPct == null || l.discountPct === '' ? 0 : Number(l.discountPct);
    const rate = l.vatRate == null || l.vatRate === '' ? 20 : Number(l.vatRate);
    if (!Number.isFinite(qty) || qty < 0 || qty > MAX_QTY) throw fail(400, 'invalid-lines', 'Quantité invalide.');
    if (!Number.isFinite(unit) || unit < 0 || unit > MAX_UNIT_CENTS) throw fail(400, 'invalid-lines', 'Prix unitaire invalide.');
    if (!Number.isFinite(disc) || disc < 0 || disc > 100) throw fail(400, 'invalid-lines', 'Remise invalide.');
    if (!VAT_RATES.includes(rate)) throw fail(400, 'invalid-lines', 'Taux de TVA invalide.');
    const line = {
      description: str(l.description, 300),
      qty: Math.round(qty * 1000) / 1000,
      unitHT: Math.round(unit),
      discountPct: Math.round(disc * 100) / 100,
      vatRate: rate,
    };
    // Une ligne vide (la rangée blanche du formulaire) n'est pas une ligne.
    if (!line.description && line.unitHT === 0) continue;
    out.push(line);
  }
  return out;
}

function normDay(v, code) {
  if (v == null || v === '') return null;
  if (!validDay(v)) throw fail(400, code, 'Date invalide (AAAA-MM-JJ).');
  return v;
}
function normTerms(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 365) throw fail(400, 'invalid-termsDays', 'Délai de paiement invalide.');
  return n;
}
function normMethod(v) {
  if (v == null || v === '') return null;
  const m = String(v);
  if (!PAYMENT_METHODS.includes(m)) throw fail(400, 'invalid-paymentMethod', 'Mode de paiement invalide.');
  return m;
}

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

  const where = ['d.merchant = ?'];
  const params = [ctx.merchant];
  if (type) { where.push('d.type = ?'); params.push(type); }
  if (from) { where.push('d.issue_date >= ?'); params.push(from); }
  if (to) { where.push('d.issue_date <= ?'); params.push(to); }
  const rows = await ctx.db.prepare(
    `SELECT d.id, d.type, d.status, d.number, d.issue_date, d.due_date, d.valid_until, d.customer, d.ttc_cents,
            d.legacy_ref, d.original_id, d.source_quote_id, d.created_ts, o.number AS original_number
       FROM invoice_docs d LEFT JOIN invoice_docs o ON o.id = d.original_id AND o.merchant = d.merchant
      WHERE ${where.join(' AND ')}
      ORDER BY d.issue_date DESC, d.created_ts DESC LIMIT ${MAX_LIST}`
  ).bind(...params).all();
  const list = (rows && rows.results) || [];

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
  return json({ ok: true, docs });
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

/* ── save : créer ou modifier un brouillon (ou un devis non converti) ── */

const CONTENT_KEYS = ['customer', 'lines', 'issueDate', 'termsDays', 'dueDate', 'validUntil', 'paymentMethod', 'note', 'exemptionMention', 'reason'];

async function save(ctx, body) {
  const today = await todayFor(ctx);
  const id = body.id == null || body.id === '' ? '' : str(body.id, 64);
  let existing = null;
  if (id) {
    existing = await getRow(ctx, id);
    if (body.type != null && body.type !== '' && body.type !== existing.type) throw fail(400, 'invalid-type', 'Le type ne change pas.');
  }
  const type = existing ? existing.type : String(body.type || '');
  if (!existing) {
    if (type === 'credit_note') throw fail(400, 'invalid-type', 'Un avoir se crée depuis la facture (action credit-note).');
    if (!DOC_TYPES.includes(type)) throw fail(400, 'invalid-type', 'Type inconnu.');
  }

  // Les champs, normalisés une fois : pour un brouillon on les écrit, pour un
  // document verrouillé on les COMPARE à ce qui est stocké.
  const has = (k) => body[k] !== undefined;
  const base = existing || {};
  const customer = has('customer') ? normCustomer(body.customer) : parseJson(base.customer, normCustomer({}));
  const lines = has('lines') ? normLines(body.lines) : parseJson(base.lines, []);
  const issueDate = has('issueDate') ? normDay(body.issueDate, 'invalid-issueDate') : (base.issue_date || null);
  const termsDays = has('termsDays') ? normTerms(body.termsDays) : (base.terms_days == null ? null : Number(base.terms_days));
  let dueDate = has('dueDate') ? normDay(body.dueDate, 'invalid-dueDate') : (base.due_date || null);
  const validUntil = has('validUntil') ? normDay(body.validUntil, 'invalid-validUntil') : (base.valid_until || null);
  const paymentMethod = has('paymentMethod') ? normMethod(body.paymentMethod) : (base.payment_method || null);
  const note = has('note') ? str(body.note, 1000) : (base.note || '');
  const exemption = has('exemptionMention') ? str(body.exemptionMention, 300) : (base.exemption_mention || '');
  const internalNote = has('internalNote') ? str(body.internalNote, 1000) : (base.internal_note || '');
  const reason = type === 'credit_note' && has('reason') ? str(body.reason, 300) : (base.reason || '');

  if (existing) {
    const locked = existing.type === 'quote' ? existing.status === 'invoiced' : existing.status !== 'draft';
    if (locked) {
      // Une facture ou un avoir émis (ou un devis converti) ne bouge plus. Seule
      // la note interne s'écrit ; renvoyer à l'identique ce qui est déjà stocké
      // n'est pas une modification.
      const same = {
        customer: JSON.stringify(customer) === JSON.stringify(parseJson(base.customer, {})),
        lines: JSON.stringify(lines) === JSON.stringify(parseJson(base.lines, [])),
        issueDate: issueDate === (base.issue_date || null),
        termsDays: termsDays === (base.terms_days == null ? null : Number(base.terms_days)),
        dueDate: dueDate === (base.due_date || null),
        validUntil: validUntil === (base.valid_until || null),
        paymentMethod: paymentMethod === (base.payment_method || null),
        note: note === (base.note || ''),
        exemptionMention: exemption === (base.exemption_mention || ''),
        reason: reason === (base.reason || ''),
      };
      if (CONTENT_KEYS.some((k) => has(k) && !same[k])) {
        throw fail(409, 'locked', 'Document émis : seule la note interne se modifie. Corrigez par un avoir.');
      }
      await ctx.db.prepare('UPDATE invoice_docs SET internal_note = ?, updated_ts = ? WHERE id = ? AND merchant = ?')
        .bind(internalNote, Date.now(), existing.id, ctx.merchant).run();
      return json({ ok: true, doc: await presentFull(ctx, await getRow(ctx, existing.id)) });
    }
  }

  // Les dates : l'émission du jour par défaut ; l'échéance se déduit du délai.
  const issue = issueDate || today;
  if (!has('dueDate') && termsDays != null) dueDate = addDays(issue, termsDays);
  let valid = validUntil;
  if (type === 'quote' && !valid) valid = addDays(issue, QUOTE_VALID_DAYS);
  if (type !== 'quote') valid = null;
  if (type === 'credit_note') dueDate = null;

  const totals = computeTotals(lines);

  if (type === 'credit_note') {
    const inv = await loadIssuedInvoice(ctx, existing.original_id);
    if (totals.ttcCents > await remainingCredit(ctx, inv)) throw fail(409, 'credit-exceeds-invoice', 'L’avoir dépasse ce qu’il reste à créditer.');
  }

  const now = Date.now();
  if (!existing) {
    const d = draftRow(ctx, {
      type, issue_date: issue, due_date: dueDate, terms_days: termsDays, valid_until: valid,
      customer: JSON.stringify(customer), lines: JSON.stringify(lines), totals: JSON.stringify(totals), ttc_cents: totals.ttcCents,
      payment_method: paymentMethod, note, exemption_mention: exemption, internal_note: internalNote,
    });
    await insertStatement(ctx, d).run();
    return json({ ok: true, doc: await presentFull(ctx, await getRow(ctx, d.id)) });
  }

  const res = await ctx.db.prepare(
    `UPDATE invoice_docs SET issue_date = ?, due_date = ?, terms_days = ?, valid_until = ?, customer = ?, lines = ?, totals = ?,
            ttc_cents = ?, payment_method = ?, note = ?, exemption_mention = ?, internal_note = ?, reason = ?, updated_ts = ?
      WHERE id = ? AND merchant = ?
        AND (status = 'draft' OR (type = 'quote' AND status IN ('sent', 'accepted', 'rejected')))`
  ).bind(issue, dueDate, termsDays, valid, JSON.stringify(customer), JSON.stringify(lines), JSON.stringify(totals),
    totals.ttcCents, paymentMethod, note, exemption, internalNote, reason, now, existing.id, ctx.merchant).run();
  if (!changesOf(res)) throw fail(409, 'locked', 'Document émis : seule la note interne se modifie.');
  return json({ ok: true, doc: await presentFull(ctx, await getRow(ctx, existing.id)) });
}

/* ── issue : valider, figer, numéroter ── */

async function issue(ctx, body) {
  const row = await getRow(ctx, body.id);
  // Idempotent : une facture déjà émise est rendue telle quelle.
  if (row.number) return json({ ok: true, doc: await presentFull(ctx, row), warnings: [] });
  if (row.status !== 'draft') throw fail(409, 'locked', 'Document non modifiable.');

  const checked = await validateForIssue(ctx, row);
  const seller = await sellerSnapshot(ctx, body.seller);
  const today = await todayFor(ctx);

  // Date d'émission : jamais dans le futur, jamais avant le document précédent de
  // la série (la numérotation est chronologique), jamais avant la facture qu'un
  // avoir corrige. L'année du numéro est celle de cette date.
  let issueDate = row.issue_date && validDay(row.issue_date) ? row.issue_date : today;
  if (issueDate > today) issueDate = today;
  const last = await ctx.db.prepare(
    'SELECT MAX(issue_date) AS d FROM invoice_docs WHERE merchant = ? AND type = ? AND number IS NOT NULL'
  ).bind(ctx.merchant, row.type).first();
  if (last && last.d && issueDate < last.d) issueDate = last.d;
  if (checked.original && checked.original.issue_date && issueDate < checked.original.issue_date) issueDate = checked.original.issue_date;

  let dueDate = row.due_date || null;
  if (row.type === 'invoice') {
    if (row.terms_days != null && (!dueDate || !validDay(dueDate))) dueDate = addDays(issueDate, Number(row.terms_days));
    if (dueDate && dueDate < issueDate) dueDate = issueDate;
  } else dueDate = null;
  let validUntil = row.valid_until || null;
  if (row.type === 'quote' && (!validUntil || validUntil < issueDate)) validUntil = addDays(issueDate, QUOTE_VALID_DAYS);

  const prefix = PREFIXES[row.type];
  const isCredit = row.type === 'credit_note';
  const isQuote = row.type === 'quote';
  const nextStatus = isQuote ? 'sent' : 'issued';
  const now = Date.now();
  const year = Number(issueDate.slice(0, 4));

  // La réservation n'a lieu que si le brouillon est encore un brouillon (deux
  // appareils qui émettent le même ne consomment qu'un numéro) et, pour un
  // avoir, que le total des avoirs reste dans la facture.
  const guard = { sql: "EXISTS (SELECT 1 FROM invoice_docs WHERE id = ? AND merchant = ? AND number IS NULL AND status = 'draft')", params: [row.id, ctx.merchant] };
  if (isCredit) {
    guard.sql += ` AND ${CREDITED_SQL} + ? <= (SELECT ttc_cents FROM invoice_docs WHERE id = ? AND merchant = ? AND status = 'issued')`;
    guard.params.push(ctx.merchant, row.original_id, checked.totals.ttcCents, row.original_id, ctx.merchant);
  }

  const out = await allocateNumber(ctx.env, ctx.merchant, prefix, year, {
    docRef: row.id,
    guard,
    extra: (seq, number) => {
      const stmts = [ctx.db.prepare(
        `UPDATE invoice_docs SET status = ?, number = ?, seq = ?, issue_date = ?, due_date = ?, valid_until = ?, customer = ?, seller = ?,
                lines = ?, totals = ?, ttc_cents = ?, issued_ts = ?, sent_ts = ?, updated_ts = ?
          WHERE id = ? AND merchant = ? AND number IS NULL AND status = 'draft'
            AND EXISTS (SELECT 1 FROM invoice_series WHERE merchant = ? AND prefix = ? AND seq = ? AND doc_ref = ?)`
      ).bind(nextStatus, number, seq, issueDate, dueDate, validUntil, JSON.stringify(checked.customer), JSON.stringify(seller),
        JSON.stringify(checked.lines), JSON.stringify(checked.totals), checked.totals.ttcCents, now, isQuote ? now : null, now,
        row.id, ctx.merchant, ctx.merchant, prefix, seq, row.id)];
      if (isCredit) {
        // Les avoirs couvrent toute la facture : elle est annulée.
        stmts.push(ctx.db.prepare(
          `UPDATE invoice_docs SET status = 'cancelled', cancelled_ts = ?, updated_ts = ?
            WHERE id = ? AND merchant = ? AND status = 'issued'
              AND ${CREDITED_SQL} >= ttc_cents`
        ).bind(now, now, row.original_id, ctx.merchant, ctx.merchant, row.original_id));
      }
      return stmts;
    },
  });

  const fresh = await getRow(ctx, row.id);
  if (!out.applied) {
    // Quelqu'un l'a émis entre-temps : on le rend. Sinon c'est la borne d'avoir
    // qui a refusé : on rejoue le contrôle pour dire laquelle.
    if (fresh.number) return json({ ok: true, doc: await presentFull(ctx, fresh), warnings: [] });
    await validateForIssue(ctx, fresh);
    throw fail(409, 'conflict', 'Émission impossible pour le moment, réessayez.');
  }
  const warnings = [];
  if (!seller.ice) warnings.push('seller-ice-missing');
  return json({ ok: true, doc: await presentFull(ctx, fresh), warnings });
}

async function validateForIssue(ctx, row) {
  const customer = normCustomer(parseJson(row.customer, {}));
  if (!customer.name) throw fail(400, 'invalid-customer', 'Le nom du client est obligatoire.');
  const problem = iceProblem(customer.ice);
  if (problem) throw fail(400, 'invalid-ice', ICE_DETAIL[problem] || ICE_DETAIL.length, { reason: problem, detail: ICE_DETAIL[problem] || ICE_DETAIL.length });

  // Une ligne à quantité nulle n'est pas une ligne ; il en faut au moins une.
  const lines = normLines(parseJson(row.lines, [])).filter((l) => l.qty > 0);
  if (!lines.length) throw fail(400, 'invalid-lines', 'Au moins une ligne avec une quantité.');
  if (lines.some((l) => !l.description)) throw fail(400, 'invalid-lines', 'Chaque ligne a une désignation.');
  const totals = computeTotals(lines);
  if (row.type !== 'quote' && totals.ttcCents <= 0) throw fail(400, 'invalid-lines', 'Le total doit être positif.');

  if (row.type !== 'quote' && lines.some((l) => l.vatRate === 0)
      && !String(row.note || '').trim() && !String(row.exemption_mention || '').trim()) {
    throw fail(400, 'exempt-mention-required', 'Une ligne exonérée exige la mention de la base légale d’exonération.');
  }

  let original = null;
  if (row.type === 'credit_note') {
    if (!String(row.reason || '').trim()) throw fail(400, 'invalid-reason', 'Le motif de l’avoir est obligatoire.');
    original = await loadIssuedInvoice(ctx, row.original_id);
    if (original.status !== 'issued') throw fail(409, 'credit-exceeds-invoice', 'Cette facture est déjà entièrement créditée.');
    if (totals.ttcCents > await remainingCredit(ctx, original)) throw fail(409, 'credit-exceeds-invoice', 'L’avoir dépasse ce qu’il reste à créditer.');
  }
  return { customer, lines, totals, original };
}

/* ── mark-sent ── */

async function markSent(ctx, body) {
  const row = await getRow(ctx, body.id);
  if (!row.number) throw fail(409, 'not-issued', 'Le document n’est pas émis.');
  const now = Date.now();
  await ctx.db.prepare('UPDATE invoice_docs SET sent_ts = COALESCE(sent_ts, ?), updated_ts = ? WHERE id = ? AND merchant = ?')
    .bind(now, now, row.id, ctx.merchant).run();
  return json({ ok: true, doc: await presentFull(ctx, await getRow(ctx, row.id)) });
}

/* ── payment / delete-payment ── */

async function payment(ctx, body) {
  const row = await getRow(ctx, body.id);
  if (row.type !== 'invoice') throw fail(400, 'invalid-type', 'Seule une facture se règle.');
  if (row.status === 'draft') throw fail(409, 'not-issued', 'La facture n’est pas émise.');
  const amount = Number(body.amountCents);
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_DOC_CENTS) throw fail(400, 'invalid-amountCents', 'Montant invalide.');
  const today = await todayFor(ctx);
  const date = body.date == null || body.date === '' ? today : normDay(body.date, 'invalid-date');
  if (date > today) throw fail(400, 'invalid-date', 'La date d’un règlement n’est pas dans le futur.');
  const method = body.method == null || body.method === '' ? 'other' : String(body.method);
  if (!PAYMENT_METHODS.includes(method)) throw fail(400, 'invalid-method', 'Mode de paiement invalide.');

  const { paid, credited } = await sumsFor(ctx, row.id);
  if (row.status !== 'issued' || amount > balanceOf(row, paid, credited)) {
    throw fail(409, 'amount-exceeds-balance', 'Le montant dépasse le solde.', { balanceCents: Math.max(0, balanceOf(row, paid, credited)) });
  }

  // Le contrôle ci-dessus répond au client ; celui-ci tient face à deux
  // règlements simultanés : l'INSERT n'a lieu que si le total reste dans la facture.
  const id = newId('pay_');
  const res = await ctx.db.prepare(
    `INSERT INTO invoice_payments (id, merchant, doc_id, amount_cents, date, method, reference, created_ts, created_by)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COALESCE(SUM(amount_cents), 0) FROM invoice_payments WHERE merchant = ? AND doc_id = ?) + ? + ${CREDITED_SQL}
            <= (SELECT ttc_cents FROM invoice_docs WHERE id = ? AND merchant = ? AND type = 'invoice' AND status = 'issued')`
  ).bind(id, ctx.merchant, row.id, amount, date, method, str(body.reference, 80), Date.now(), ctx.actor,
    ctx.merchant, row.id, amount, ctx.merchant, row.id, row.id, ctx.merchant).run();
  if (!changesOf(res)) throw fail(409, 'amount-exceeds-balance', 'Le montant dépasse le solde.');
  return paymentResult(ctx, row.id, id);
}

async function deletePayment(ctx, body) {
  const row = await getRow(ctx, body.id);
  const pid = str(body.paymentId, 64);
  if (!pid) throw fail(400, 'invalid-paymentId', 'Règlement manquant.');
  const res = await ctx.db.prepare('DELETE FROM invoice_payments WHERE id = ? AND doc_id = ? AND merchant = ?').bind(pid, row.id, ctx.merchant).run();
  if (!changesOf(res)) throw fail(404, 'not-found', 'Règlement introuvable.');
  return paymentResult(ctx, row.id, null);
}

async function paymentResult(ctx, docId, paymentId) {
  const row = await getRow(ctx, docId);
  const full = await presentFull(ctx, row);
  const pays = await ctx.db.prepare(
    'SELECT id, amount_cents, date, method, reference, created_ts FROM invoice_payments WHERE merchant = ? AND doc_id = ? ORDER BY date, created_ts'
  ).bind(ctx.merchant, docId).all();
  const payments = ((pays && pays.results) || []).map((p) => ({
    id: p.id, amountCents: Number(p.amount_cents), date: p.date || null, method: p.method || null,
    reference: p.reference || '', createdTs: Number(p.created_ts),
  }));
  return json({
    ok: true, balanceCents: full.balanceCents, displayStatus: full.displayStatus, paidCents: full.paidCents,
    payment: paymentId ? payments.find((p) => p.id === paymentId) || null : null, payments, doc: full,
  });
}

/* ── credit-note : un brouillon d'avoir sur une facture émise ── */

async function creditNote(ctx, body) {
  const inv = await loadIssuedInvoice(ctx, body.id);
  if (inv.status !== 'issued') throw fail(409, 'credit-exceeds-invoice', 'Cette facture est déjà entièrement créditée.');
  const reason = str(body.reason, 300);
  if (!reason) throw fail(400, 'invalid-reason', 'Le motif de l’avoir est obligatoire.');
  const lines = (body.lines === undefined ? parseJson(inv.lines, []) : normLines(body.lines)).filter((l) => l.qty > 0);
  if (!lines.length) throw fail(400, 'invalid-lines', 'Au moins une ligne à créditer.');
  const totals = computeTotals(lines);
  if (totals.ttcCents <= 0) throw fail(400, 'invalid-lines', 'Le total doit être positif.');
  if (totals.ttcCents > await remainingCredit(ctx, inv)) throw fail(409, 'credit-exceeds-invoice', 'L’avoir dépasse ce qu’il reste à créditer.');
  const today = await todayFor(ctx);
  const d = draftRow(ctx, {
    type: 'credit_note', issue_date: today, customer: inv.customer, lines: JSON.stringify(lines), totals: JSON.stringify(totals),
    ttc_cents: totals.ttcCents, exemption_mention: inv.exemption_mention || null, note: null,
    original_id: inv.id, reason,
  });
  await insertStatement(ctx, d).run();
  return json({ ok: true, doc: await presentFull(ctx, await getRow(ctx, d.id)) });
}

/* ── quote-status / convert-quote ── */

async function quoteStatus(ctx, body) {
  const row = await getRow(ctx, body.id);
  if (row.type !== 'quote') throw fail(400, 'invalid-type', 'Ce n’est pas un devis.');
  const status = String(body.status || '');
  if (status !== 'accepted' && status !== 'rejected') throw fail(400, 'invalid-status', 'Statut attendu : accepted ou rejected.');
  if (row.status === 'draft') throw fail(409, 'not-issued', 'Le devis n’est pas émis.');
  const res = await ctx.db.prepare(
    "UPDATE invoice_docs SET status = ?, updated_ts = ? WHERE id = ? AND merchant = ? AND type = 'quote' AND status IN ('sent', 'accepted', 'rejected')"
  ).bind(status, Date.now(), row.id, ctx.merchant).run();
  if (!changesOf(res)) throw fail(409, 'locked', 'Ce devis est déjà converti en facture.');
  return json({ ok: true, doc: await presentFull(ctx, await getRow(ctx, row.id)) });
}

async function convertQuote(ctx, body) {
  const row = await getRow(ctx, body.id);
  if (row.type !== 'quote') throw fail(400, 'invalid-type', 'Ce n’est pas un devis.');
  if (row.status === 'invoiced') {
    // Idempotent : la facture déjà tirée de ce devis est rendue.
    const done = await ctx.db.prepare('SELECT * FROM invoice_docs WHERE merchant = ? AND source_quote_id = ? ORDER BY created_ts LIMIT 1')
      .bind(ctx.merchant, row.id).first();
    if (done) return json({ ok: true, doc: await presentFull(ctx, done), quote: await presentFull(ctx, row), already: true });
  }
  if (row.status === 'draft') throw fail(409, 'not-issued', 'Le devis n’est pas émis.');
  if (row.status === 'rejected') throw fail(409, 'invalid-status', 'Un devis refusé ne se convertit pas.');
  const today = await todayFor(ctx);
  const terms = row.terms_days == null ? null : Number(row.terms_days);
  const d = draftRow(ctx, {
    type: 'invoice', issue_date: today, due_date: terms == null ? null : addDays(today, terms), terms_days: terms,
    customer: row.customer, lines: row.lines, totals: row.totals, ttc_cents: row.ttc_cents,
    payment_method: row.payment_method || null, note: row.note || null, exemption_mention: row.exemption_mention || null,
    source_quote_id: row.id,
  });
  const guard = { sql: "EXISTS (SELECT 1 FROM invoice_docs WHERE id = ? AND merchant = ? AND type = 'quote' AND status IN ('sent', 'accepted'))", params: [row.id, ctx.merchant] };
  const results = await ctx.db.batch([
    insertStatement(ctx, d, guard),
    ctx.db.prepare("UPDATE invoice_docs SET status = 'invoiced', updated_ts = ? WHERE id = ? AND merchant = ? AND type = 'quote' AND status IN ('sent', 'accepted')")
      .bind(Date.now(), row.id, ctx.merchant),
  ]);
  if (!changesOf(results[0])) throw fail(409, 'conflict', 'Ce devis vient d’être converti.');
  return json({ ok: true, doc: await presentFull(ctx, await getRow(ctx, d.id)), quote: await presentFull(ctx, await getRow(ctx, row.id)) });
}

/* ── duplicate / delete-draft ── */

async function duplicate(ctx, body) {
  const row = await getRow(ctx, body.id);
  if (row.type === 'credit_note') throw fail(400, 'invalid-type', 'Un avoir ne se duplique pas.');
  const today = await todayFor(ctx);
  const terms = row.terms_days == null ? null : Number(row.terms_days);
  const d = draftRow(ctx, {
    type: row.type, issue_date: today,
    due_date: row.type === 'invoice' && terms != null ? addDays(today, terms) : null, terms_days: terms,
    valid_until: row.type === 'quote' ? addDays(today, QUOTE_VALID_DAYS) : null,
    customer: row.customer, lines: row.lines, totals: row.totals, ttc_cents: row.ttc_cents,
    payment_method: row.payment_method || null, note: row.note || null, exemption_mention: row.exemption_mention || null,
  });
  await insertStatement(ctx, d).run();
  return json({ ok: true, doc: await presentFull(ctx, await getRow(ctx, d.id)) });
}

async function deleteDraft(ctx, body) {
  const row = await getRow(ctx, body.id);
  // Un numéro n'est jamais supprimé : seul ce qui n'en a pas peut l'être.
  const res = await ctx.db.prepare("DELETE FROM invoice_docs WHERE id = ? AND merchant = ? AND status = 'draft' AND number IS NULL")
    .bind(row.id, ctx.merchant).run();
  if (!changesOf(res)) throw fail(409, 'locked', 'Seul un brouillon se supprime.');
  return json({ ok: true, deleted: row.id });
}

/* ── import-legacy : les factures gardées sur l'appareil par l'ancienne version ── */

function nearestRate(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r)) return 20;
  return VAT_RATES.reduce((best, v) => (Math.abs(v - r) < Math.abs(best - r) ? v : best), VAT_RATES[0]);
}

function legacyDoc(raw, today) {
  if (!raw || typeof raw !== 'object') return { skip: 'invalid-doc' };
  const idPart = str(raw.id, 40);
  if (!idPart) return { skip: 'missing-id' };
  const ref = '#' + idPart;
  const items = Array.isArray(raw.items) ? raw.items : [];
  const rate = nearestRate(raw.taxRate);
  const lines = [];
  for (const it of items.slice(0, MAX_LINES)) {
    if (!it || typeof it !== 'object') continue;
    const price = Number(it.price);
    const qty = Number(it.qty);
    const description = str(it.description, 300);
    if (!description && !(price > 0)) continue;
    if (!Number.isFinite(price) || price < 0 || price * 100 > MAX_UNIT_CENTS) return { ref, skip: 'invalid-lines' };
    if (!Number.isFinite(qty) || qty < 0 || qty > MAX_QTY) return { ref, skip: 'invalid-lines' };
    // Les prix de l'ancienne version sont HT : c'est ce qu'on garde.
    lines.push({ description: description || 'Article', qty: Math.round(qty * 1000) / 1000, unitHT: Math.round(price * 100), discountPct: 0, vatRate: rate });
  }
  if (!lines.length) return { ref, skip: 'no-lines' };
  let totals;
  try { totals = computeTotals(lines); } catch (_) { return { ref, skip: 'invalid-lines' }; }
  const contact = str(raw.contact, 120);
  const customer = {
    name: str(raw.customer, 120), address: '', ice: '', if: '',
    email: contact.includes('@') ? contact : '', phone: contact && !contact.includes('@') ? contact.slice(0, 30) : '', clientId: '',
  };
  const issueDate = validDay(raw.issueDate) ? raw.issueDate : today;
  const terms = Number.isInteger(Number(raw.terms)) && Number(raw.terms) >= 0 && Number(raw.terms) <= 365 && raw.terms !== '' && raw.terms != null ? Number(raw.terms) : null;
  const dueDate = validDay(raw.dueDate) ? raw.dueDate : (terms == null ? null : addDays(issueDate, terms));
  return {
    ref,
    fields: {
      type: 'invoice', issue_date: issueDate, due_date: dueDate, terms_days: terms,
      customer: JSON.stringify(customer), lines: JSON.stringify(lines), totals: JSON.stringify(totals), ttc_cents: totals.ttcCents,
      note: str(raw.note, 1000) || null, legacy_ref: ref,
    },
  };
}

async function importLegacy(ctx, body) {
  if (!Array.isArray(body.docs)) throw fail(400, 'invalid-docs', 'Liste de documents attendue.');
  if (body.docs.length > MAX_IMPORT) throw fail(400, 'invalid-docs', `Au plus ${MAX_IMPORT} documents par appel.`);
  const today = await todayFor(ctx);
  const known = new Set();
  const have = await ctx.db.prepare('SELECT legacy_ref FROM invoice_docs WHERE merchant = ? AND legacy_ref IS NOT NULL').bind(ctx.merchant).all();
  for (const r of (have && have.results) || []) known.add(r.legacy_ref);

  const imported = [];
  const skipped = [];
  const queue = [];
  for (const raw of body.docs) {
    const doc = legacyDoc(raw, today);
    if (doc.skip) { skipped.push({ legacyRef: doc.ref || null, reason: doc.skip }); continue; }
    if (known.has(doc.ref)) { skipped.push({ legacyRef: doc.ref, reason: 'already-imported' }); continue; }
    known.add(doc.ref); // le même numéro deux fois dans l'appel ne passe qu'une fois
    queue.push(draftRow(ctx, doc.fields));
  }
  for (let i = 0; i < queue.length; i += CHUNK) {
    const slice = queue.slice(i, i + CHUNK);
    // Idempotent même sous course : l'INSERT se garde lui-même.
    const results = await ctx.db.batch(slice.map((d) => insertStatement(ctx, d, {
      sql: 'NOT EXISTS (SELECT 1 FROM invoice_docs WHERE merchant = ? AND legacy_ref = ?)', params: [ctx.merchant, d.legacy_ref],
    })));
    slice.forEach((d, k) => {
      if (changesOf(results[k])) imported.push({ legacyRef: d.legacy_ref, id: d.id });
      else skipped.push({ legacyRef: d.legacy_ref, reason: 'already-imported' });
    });
  }
  return json({ ok: true, imported, skipped, importedCount: imported.length, skippedCount: skipped.length });
}

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
