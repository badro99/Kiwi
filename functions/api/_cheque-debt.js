/* Chèques reçus d'un client · ce qu'un rejet fait au compte de la cliente.
 *
 * Il n'y a qu'UN modèle de dette client en boutique : la note ouverte
 * (retail_balances, functions/api/_retail-balances.js), que lisent le carnet
 * de crédit du patron (functions/api/_credit-accounts.js › clientDebtors), la
 * fiche cliente et l'écran Acomptes de la caisse (« cliente doit »). Un chèque
 * client rejeté y entre ; rien n'est écrit ailleurs (plus de ligne client au
 * grand livre money_ledger, que personne ne lisait).
 *
 * ── Le flux de caisse reste juste au centime ────────────────────────────────
 * Un chèque pris à la caisse a été compté dans la vente (moyen « chèque »).
 * S'il revient impayé, cet argent n'est jamais arrivé :
 *   · rejet (premier) : une ligne négative dans le flux des ventes, comme un
 *     remboursement (sales, id 'chqbounce-<chèque>', moyen chèque, libellé
 *     « Chèque impayé »), SEULEMENT si le chèque paie une vente encore
 *     vivante (non annulée). Un chèque saisi au tableau de bord sans vente
 *     n'a rien compté : il n'enlève rien ;
 *   · la dette entre au compte de la cliente : une note ouverte
 *     'chqdebt-<chèque>' du montant, si le chèque est rattaché à une fiche
 *     cliente qui existe. Sans fiche, la dette reste visible sur le chèque
 *     (debt_open) et entre au compte dès qu'une fiche lui est donnée ;
 *   · la cliente paie à la caisse (écran Acomptes) : un reçu
 *     « acompte-reglement » ordinaire, compté une fois, réduit la note ;
 *   · le chèque représenté est encaissé, ou le patron note un règlement hors
 *     caisse (virement, espèces au bureau) : ce qui RESTE dû sur la note
 *     revient au flux (ligne positive 'chqback-<geste>', seulement si la ligne
 *     négative existe) et la note se ferme à ce qui a été payé à la caisse.
 *   Total : vente X − X (rejet) + reçus caisse + reste = X, jamais 2X.
 * Contentieux, représentation : rien ne bouge.
 *
 * Toutes ces instructions sont conditionnées à la ligne d'historique du
 * passage (même lot D1 que le passage) : un passage refusé ou rejoué n'écrit
 * rien, deux fois rien. */

const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SALE_METHOD = { cash: 'cash', card: 'card', transfer: 'transfer', other: 'transfer', cheque: 'cheque', till: 'cash' };

export const isClientParty = (c) => c && c.direction === 'received' && c.party_type === 'customer'
  && CLIENT_ID.test(String(c.party_id || '')) && !String(c.party_id).startsWith('n:');
export const debtNoteId = (chequeId) => 'chqdebt-' + String(chequeId).replace(/^chq_/, '');
export const bounceSaleId = (chequeId) => 'chqbounce-' + String(chequeId).replace(/^chq_/, '');
const ticketRef = (c) => ('CHQ-' + (String(c.number || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'X') + '-' + String(c.id).slice(-6)).toUpperCase();

export async function clientOf(env, merchant, id) {
  if (!CLIENT_ID.test(String(id || ''))) return null;
  try { return await env.DB.prepare('SELECT id, name, phone FROM clients WHERE merchant = ? AND id = ? AND deleted = 0').bind(merchant, String(id)).first(); }
  catch (_) { return null; }
}

/* Les ventes que ce chèque paie, et si l'une est encore vivante. */
export async function salesOf(env, merchant, chequeId) {
  try {
    const rs = await env.DB.prepare(`SELECT l.link_id, s.id AS sale, s.void_ts FROM cheque_links l LEFT JOIN sales s ON s.merchant = l.merchant AND s.id = l.link_id
       WHERE l.merchant = ? AND l.cheque_id = ? AND l.link_type = 'sale'`).bind(merchant, chequeId).all();
    const rows = (rs && rs.results) || [];
    const known = rows.filter((r) => r.sale != null);
    return { linked: rows.length, live: known.filter((r) => r.void_ts == null).length, voided: known.filter((r) => r.void_ts != null).length };
  } catch (_) { return { linked: 0, live: 0, voided: 0 }; }
}

/* La note de dette d'un chèque, et ce que la caisse a déjà reçu dessus. */
export async function debtNote(env, merchant, chequeId) {
  try {
    const row = await env.DB.prepare(`SELECT b.id, b.customer_id, b.total_cents,
        COALESCE((SELECT SUM(r.amount_cents) FROM retail_balance_receipts r LEFT JOIN sales s ON s.merchant = r.merchant AND s.id = r.sale_id
          WHERE r.merchant = b.merchant AND r.balance_id = b.id AND (r.status = 'pending' OR (s.id IS NOT NULL AND s.void_ts IS NULL))), 0) AS paid,
        (SELECT COUNT(*) FROM retail_balance_receipts r WHERE r.merchant = b.merchant AND r.balance_id = b.id) AS receipts
       FROM retail_balances b WHERE b.merchant = ? AND b.id = ?`).bind(merchant, debtNoteId(chequeId)).first();
    if (!row) return null;
    const total = Number(row.total_cents) || 0, paid = Number(row.paid) || 0;
    return { id: String(row.id), customerId: String(row.customer_id), totalCents: total, paidCents: paid, remainingCents: Math.max(0, total - paid), receipts: Number(row.receipts) || 0 };
  } catch (_) { return null; }
}
export async function bounceRow(env, merchant, chequeId) {
  try { return await env.DB.prepare('SELECT id, amount_cents FROM sales WHERE merchant = ? AND id = ?').bind(merchant, bounceSaleId(chequeId)).first(); }
  catch (_) { return null; }
}

const ifHist = 'EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)';
function saleRow(env, merchant, id, cents, method, label, c, now, histId) {
  return env.DB.prepare(`INSERT OR IGNORE INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel, payment_parts)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'cheque', ? WHERE ${ifHist}`)
    .bind(id, merchant, Math.round(cents / 100), cents, method, label, String(c.number || '').slice(0, 40) || ticketRef(c), now,
      JSON.stringify([{ method, amountCents: cents }]), merchant, histId);
}
export function openNoteStatement(env, merchant, c, clientId, now, histId) {
  return env.DB.prepare(`INSERT OR IGNORE INTO retail_balances (merchant, id, customer_id, ticket_ref, total_cents, created_ts)
      SELECT ?, ?, ?, ?, ?, ? WHERE ${ifHist} AND EXISTS (SELECT 1 FROM clients WHERE merchant = ? AND id = ? AND deleted = 0)`)
    .bind(merchant, debtNoteId(c.id), clientId, ticketRef(c), Number(c.amount_cents), now, merchant, histId, merchant, clientId);
}

/* Avant un passage : ce qu'il faut lire pour écrire juste. */
export async function planCustomerDebt(env, merchant, c, kind, method) {
  if (kind === 'bounce') {
    const sales = await salesOf(env, merchant, c.id);
    const client = isClientParty(c) ? await clientOf(env, merchant, c.party_id) : null;
    return { kind, counted: sales.live > 0, clientId: client ? String(client.id) : '' };
  }
  if (kind === 'close') {
    const [note, bounce] = await Promise.all([debtNote(env, merchant, c.id), bounceRow(env, merchant, c.id)]);
    const remaining = note ? note.remainingCents : Number(c.amount_cents);
    if (method === 'till' && remaining > 0) return { error: 'balance-open', remaining };
    return { kind, note, counted: !!bounce, remaining, method: SALE_METHOD[method] || 'cheque' };
  }
  return null;
}

/* Les instructions du plan, dans le lot du passage. */
export function customerDebtStatements(env, merchant, c, plan, ctx) {
  const { histId, now, requestId } = ctx;
  const cents = Number(c.amount_cents);
  const out = [];
  if (plan.kind === 'bounce') {
    if (plan.counted) out.push(saleRow(env, merchant, bounceSaleId(c.id), -cents, 'cheque', 'Chèque impayé', c, now, histId));
    if (plan.clientId) out.push(openNoteStatement(env, merchant, c, plan.clientId, now, histId));
  }
  if (plan.kind === 'close') {
    if (plan.counted && plan.remaining > 0) {
      out.push(saleRow(env, merchant, 'chqback-' + String(requestId).replace(/[^A-Za-z0-9_-]/g, '').slice(-40), plan.remaining, plan.method,
        plan.method === 'cheque' ? 'Chèque impayé, encaissé à la représentation' : 'Chèque impayé, réglé hors caisse', c, now, histId));
    }
    if (plan.note) {
      /* La note se ferme à ce que la caisse a reçu ; sans reçu, elle disparaît. */
      if (plan.note.receipts === 0) out.push(env.DB.prepare(`DELETE FROM retail_balances WHERE merchant = ? AND id = ? AND ${ifHist}
          AND NOT EXISTS (SELECT 1 FROM retail_balance_receipts r WHERE r.merchant = ? AND r.balance_id = ?)`)
        .bind(merchant, plan.note.id, merchant, histId, merchant, plan.note.id));
      else if (plan.note.paidCents > 0 && plan.note.remainingCents > 0) out.push(env.DB.prepare(`UPDATE retail_balances SET total_cents = ? WHERE merchant = ? AND id = ? AND ${ifHist}`)
        .bind(plan.note.paidCents, merchant, plan.note.id, merchant, histId));
    }
  }
  return out;
}

/* Ce que l'écran doit savoir en plus du papier : la vente annulée (« ticket
   annulé »), la note ouverte au compte de la cliente et ce qui en reste. */
export async function annotateCheques(env, merchant, views) {
  const list = (views || []).filter(Boolean);
  if (!list.length) return list;
  const ids = list.map((v) => v.id);
  const voided = new Map();
  try {
    for (let i = 0; i < ids.length; i += 80) {
      const part = ids.slice(i, i + 80);
      const rs = await env.DB.prepare(`SELECT l.cheque_id, SUM(CASE WHEN s.void_ts IS NOT NULL THEN 1 ELSE 0 END) AS v, SUM(CASE WHEN s.void_ts IS NULL THEN 1 ELSE 0 END) AS live
          FROM cheque_links l JOIN sales s ON s.merchant = l.merchant AND s.id = l.link_id
         WHERE l.merchant = ? AND l.link_type = 'sale' AND l.cheque_id IN (${part.map(() => '?').join(',')}) GROUP BY l.cheque_id`).bind(merchant, ...part).all();
      for (const r of (rs && rs.results) || []) voided.set(String(r.cheque_id), Number(r.v) > 0 && Number(r.live) === 0);
    }
  } catch (_) { /* une base sans ventes : rien à signaler */ }
  for (const v of list) {
    v.saleVoided = !!voided.get(v.id);
    v.clientId = v.direction === 'received' && v.partyType === 'customer' && v.partyId && !v.partyId.startsWith('n:') ? v.partyId : '';
    v.debt = null;
    if (v.debtOpen && v.clientId) {
      const note = await debtNote(env, merchant, v.id);
      v.debt = note ? { onAccount: true, totalCents: note.totalCents, paidCents: note.paidCents, remainingCents: note.remainingCents } : { onAccount: false };
    }
  }
  return list;
}
