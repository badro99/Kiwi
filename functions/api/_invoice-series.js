// Facturation · l'allocateur de numéros, partagé par la caisse et la saisie.
//
// Un fichier préfixé `_` n'est pas routé : il est seulement importé.
//
// Une série par (établissement, préfixe) : F (factures), AV (avoirs), D (devis).
// `seq` est global au commerçant, jamais remis à zéro à l'année (l'année du
// numéro est celle de l'émission). Pour F, la série est PARTAGÉE avec les
// factures de caisse (`sale_invoices`) : le prochain numéro est
// `max(invoice_series, sale_invoices) + 1`, si bien que l'historique d'un
// commerçant qui n'a jamais saisi de facture est respecté, et que la caisse et
// la saisie ne distribuent jamais le même numéro.
//
// La réservation (`invoice_series`) et ce qui la justifie (la ligne
// `sale_invoices`, l'UPDATE du document) partent dans le MÊME `DB.batch` : D1 le
// joue en une transaction, donc un numéro n'est consommé que si le document
// l'est aussi, sans trou. Une collision d'unicité (deux appareils au même
// instant) annule le lot entier ; on relit le maximum et on recommence.

export const PREFIXES = { invoice: 'F', credit_note: 'AV', quote: 'D' };
const MAX_ATTEMPTS = 8;

export function formatNumber(prefix, year, seq) {
  const y = Number(year) || new Date().getFullYear();
  const s = Math.max(1, Math.floor(Number(seq)) || 1);
  return `${prefix}-${y}-${String(s).padStart(4, '0')}`;
}

/* La production a toujours du retard sur schema.sql : les tables se créent au
 * premier besoin, quand une requête répond « no such table » (et pas avant :
 * aucun DDL ne part à chaque requête). Ce DDL doit dire la même chose que
 * schema.sql ; tools/invoices-v2-test.mjs le vérifie colonne par colonne. */
const DDL = [
  `CREATE TABLE IF NOT EXISTS sale_invoices (
    merchant TEXT NOT NULL, seq INTEGER NOT NULL, number TEXT NOT NULL,
    sale_id TEXT NOT NULL, customer TEXT, snapshot TEXT NOT NULL, created_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, sale_id), UNIQUE (merchant, seq))`,
  'CREATE INDEX IF NOT EXISTS idx_sale_invoices_merchant_seq ON sale_invoices (merchant, seq)',
  `CREATE TABLE IF NOT EXISTS invoice_series (
    merchant TEXT NOT NULL, prefix TEXT NOT NULL, seq INTEGER NOT NULL, number TEXT NOT NULL,
    doc_ref TEXT, created_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, prefix, seq))`,
  `CREATE TABLE IF NOT EXISTS invoice_docs (
    id TEXT PRIMARY KEY, merchant TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
    number TEXT, seq INTEGER, issue_date TEXT, due_date TEXT, terms_days INTEGER, valid_until TEXT,
    customer TEXT NOT NULL, seller TEXT, lines TEXT NOT NULL, totals TEXT NOT NULL,
    ttc_cents INTEGER NOT NULL DEFAULT 0, payment_method TEXT, note TEXT, exemption_mention TEXT,
    internal_note TEXT, original_id TEXT, source_quote_id TEXT, reason TEXT,
    created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL, issued_ts INTEGER, sent_ts INTEGER,
    cancelled_ts INTEGER, created_by TEXT, legacy_ref TEXT)`,
  'CREATE INDEX IF NOT EXISTS idx_invoice_docs_merchant ON invoice_docs (merchant, type, issue_date)',
  'CREATE INDEX IF NOT EXISTS idx_invoice_docs_original ON invoice_docs (merchant, original_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_docs_number ON invoice_docs (merchant, number) WHERE number IS NOT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_docs_legacy ON invoice_docs (merchant, legacy_ref) WHERE legacy_ref IS NOT NULL',
  `CREATE TABLE IF NOT EXISTS invoice_payments (
    id TEXT PRIMARY KEY, merchant TEXT NOT NULL, doc_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0), date TEXT, method TEXT, reference TEXT,
    created_ts INTEGER NOT NULL, created_by TEXT)`,
  'CREATE INDEX IF NOT EXISTS idx_invoice_payments_doc ON invoice_payments (merchant, doc_id)',
];

export const INVOICING_DDL = DDL;

export async function ensureInvoicingSchema(db) {
  for (const sql of DDL) await db.prepare(sql).run();
}

const messageOf = (err) => String((err && err.message) || err || '');

/* Joue `fn` ; si la base répond qu'une table manque, crée le schéma et rejoue
 * UNE fois. Sûr pour un lot : un lot échoué est annulé en entier. */
export async function withSchema(env, fn) {
  try { return await fn(); }
  catch (err) {
    if (!/no such table/i.test(messageOf(err))) throw err;
    await ensureInvoicingSchema(env.DB);
    return fn();
  }
}

/* Une collision SUR LE NUMÉRO (et pas sur la vente ni sur l'identifiant du
 * document) : le seul cas où recommencer avec un autre numéro a un sens. */
export function isNumberCollision(err) {
  const m = messageOf(err);
  if (!/UNIQUE constraint failed|constraint/i.test(m)) return false;
  return /invoice_series\./.test(m) || /sale_invoices\.seq/.test(m) || /invoice_docs\.number/.test(m);
}

export async function nextSeq(db, merchant, prefix) {
  const a = await db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM invoice_series WHERE merchant = ? AND prefix = ?')
    .bind(merchant, prefix).first();
  let max = Number(a && a.m) || 0;
  if (prefix === 'F') {
    const b = await db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM sale_invoices WHERE merchant = ?')
      .bind(merchant).first();
    max = Math.max(max, Number(b && b.m) || 0);
  }
  return max + 1;
}

const changesOf = (res) => Number(res && res.meta && res.meta.changes) || 0;

/* Réserve le prochain numéro de la série `prefix` pour `year`.
 *
 *   opts.docRef  qui le porte (identifiant du document, ou de la vente)
 *   opts.extra   (seq, number, now) => [statements]  ce qui doit partir dans le
 *                MÊME lot que la réservation (INSERT sale_invoices, UPDATE du
 *                document…). Rappelé à chaque tentative, avec le numéro courant.
 *   opts.guard   { sql, params }  condition SQL de la réservation : si elle est
 *                fausse, rien n'est réservé (`applied: false`) et le lot ne fait
 *                rien. C'est ce qui rend l'émission d'un même brouillon par deux
 *                appareils sans trou de numérotation.
 *
 * Rend { seq, number, applied, results }. */
export async function allocateNumber(env, merchant, prefix, year, opts = {}) {
  if (!env || !env.DB) throw new Error('no-db');
  const docRef = opts.docRef == null ? null : String(opts.docRef);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const seq = await withSchema(env, () => nextSeq(env.DB, merchant, prefix));
    const number = formatNumber(prefix, year, seq);
    const now = Date.now();
    const reserve = opts.guard
      ? env.DB.prepare(
        'INSERT INTO invoice_series (merchant, prefix, seq, number, doc_ref, created_ts) SELECT ?, ?, ?, ?, ?, ? WHERE ' + opts.guard.sql
      ).bind(merchant, prefix, seq, number, docRef, now, ...(opts.guard.params || []))
      : env.DB.prepare(
        'INSERT INTO invoice_series (merchant, prefix, seq, number, doc_ref, created_ts) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(merchant, prefix, seq, number, docRef, now);
    const extra = opts.extra ? opts.extra(seq, number, now) : [];
    try {
      const results = await withSchema(env, () => env.DB.batch([reserve, ...extra]));
      return { seq, number, applied: changesOf(results[0]) > 0, results };
    } catch (err) {
      if (!isNumberCollision(err)) throw err;
    }
  }
  throw new Error('concurrency-retry-exhausted');
}
