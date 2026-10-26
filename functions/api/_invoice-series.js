// Facturation · l'allocateur de numéros, partagé par la caisse et la saisie.
//
// Un fichier préfixé `_` n'est pas routé : il est seulement importé.
//
// Une série annuelle par (établissement, préfixe, année du numéro).
// Les numéros historiques restent intacts. La caisse et la saisie partagent F.
// Le maximum ne considère que l'année demandée, puis repart de 1 en janvier.
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

// Compatibility export; migrations now own the invoicing schema.
const DDL = [];

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
  return /invoice_series\./.test(m) || /sale_invoices\.(?:seq|number)/.test(m) || /invoice_docs\.number/.test(m);
}

export async function nextSeq(db, merchant, prefix, year = new Date().getFullYear()) {
  const a = await db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM invoice_series WHERE merchant = ? AND prefix = ? AND number LIKE ?')
    .bind(merchant, prefix, `${prefix}-${year}-%`).first();
  let max = Number(a && a.m) || 0;
  if (prefix === 'F') {
    const b = await db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM sale_invoices WHERE merchant = ? AND number LIKE ?')
      .bind(merchant, `F-${year}-%`).first();
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
    const seq = await withSchema(env, () => nextSeq(env.DB, merchant, prefix, year));
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
