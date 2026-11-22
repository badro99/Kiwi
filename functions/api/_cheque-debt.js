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
/* Les lignes que le portefeuille écrit au flux des ventes : jamais une vente, jamais un remboursement. */
export const isChequeAdjustId = (id) => /^chq(?:bounce|back)-/.test(String(id || ''));
export const CHEQUE_ADJUST_SQL = "(id LIKE 'chqbounce-%' OR id LIKE 'chqback-%')";
const ticketRef = (c) => ('CHQ-' + (String(c.number || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'X') + '-' + String(c.id).slice(-6)).toUpperCase();

export async function clientOf(env, merchant, id) {
  if (!CLIENT_ID.test(String(id || ''))) return null;
  try { return await env.DB.prepare('SELECT id, name, phone FROM clients WHERE merchant = ? AND id = ? AND deleted = 0').bind(merchant, String(id)).first(); }
  catch (_) { return null; }
}

/* La part « chèque » d'un ticket : le lien, sinon le règlement, sinon le ticket. */
function partOf(r) {
  const link = Number(r.link_cents);
  if (Number.isSafeInteger(link) && link > 0) return link;
  try {
    const parts = JSON.parse(r.payment_parts || 'null');
    if (Array.isArray(parts)) {
      const n = parts.filter((x) => x && x.method === 'cheque').reduce((t, x) => t + (Math.round(Number(x.amountCents)) || 0), 0);
      if (n > 0) return n;
    }
  } catch (_) { /* règlement illisible : le ticket */ }
  const cents = r.amount_cents != null ? Number(r.amount_cents) : Math.round(Number(r.amount || 0) * 100);
  return Math.max(0, cents || 0);
}
/* Les tickets que ce chèque paie, sa part de chacun, et ce qui vit encore. */
export async function sharesOf(env, merchant, c) {
  const out = { linked: 0, rows: [], live: 0, voided: 0, liveShare: 0, voidedShare: 0 };
  let rows = [];
  try {
    const rs = await env.DB.prepare(`SELECT l.link_id, l.amount_cents AS link_cents, s.id AS sale, s.void_ts, s.amount_cents, s.amount, s.payment_parts
        FROM cheque_links l LEFT JOIN sales s ON s.merchant = l.merchant AND s.id = l.link_id
       WHERE l.merchant = ? AND l.cheque_id = ? AND l.link_type = 'sale' ORDER BY l.created_at, l.link_id`).bind(merchant, c.id).all();
    rows = (rs && rs.results) || [];
  } catch (_) { rows = []; }
  out.linked = rows.length;
  let left = Math.max(0, Number(c.amount_cents) || 0);
  for (const r of rows) {
    if (r.sale == null) continue;
    const share = Math.min(left, partOf(r));
    left -= share;
    const live = r.void_ts == null;
    out.rows.push({ sale: String(r.sale), live, share });
    if (live) { out.live++; out.liveShare += share; } else { out.voided++; out.voidedShare += share; }
  }
  return out;
}
/* Compat : le nombre de tickets liés, vivants, annulés. */
export async function salesOf(env, merchant, chequeId) {
  const sh = await sharesOf(env, merchant, { id: chequeId, amount_cents: Number.MAX_SAFE_INTEGER });
  return { linked: sh.linked, live: sh.live, voided: sh.voided };
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
/* La ligne « Chèque impayé » encore comptée (une ligne annulée ne compte plus). */
export async function bounceRow(env, merchant, chequeId) {
  try { return await env.DB.prepare('SELECT id, amount_cents FROM sales WHERE merchant = ? AND id = ? AND void_ts IS NULL').bind(merchant, bounceSaleId(chequeId)).first(); }
  catch (_) { return null; }
}

const ifHist = 'EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)';
function saleRow(env, merchant, id, cents, method, label, c, now, histId) {
  return env.DB.prepare(`INSERT OR IGNORE INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel, payment_parts)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'cheque', ? WHERE ${ifHist}`)
    .bind(id, merchant, Math.round(cents / 100), cents, method, label, String(c.number || '').slice(0, 40) || ticketRef(c), now,
      JSON.stringify([{ method, amountCents: cents }]), merchant, histId);
}
export function openNoteStatement(env, merchant, c, clientId, now, histId, cents) {
  return env.DB.prepare(`INSERT OR IGNORE INTO retail_balances (merchant, id, customer_id, ticket_ref, total_cents, created_ts)
      SELECT ?, ?, ?, ?, ?, ? WHERE ${ifHist} AND EXISTS (SELECT 1 FROM clients WHERE merchant = ? AND id = ? AND deleted = 0)`)
    .bind(merchant, debtNoteId(c.id), clientId, ticketRef(c), Number(cents), now, merchant, histId, merchant, clientId);
}
/* Ce qu'un chèque rejeté doit au compte de sa cliente : la part des tickets
   vivants ; sans ticket, rien, sauf accord explicite du patron (onAccount). */
export async function owedFor(env, merchant, c, onAccount) {
  const sh = await sharesOf(env, merchant, c);
  if (sh.linked > 0) return { linked: sh.linked, owed: sh.liveShare, counted: sh.liveShare };
  return { linked: 0, owed: onAccount === true ? Number(c.amount_cents) : 0, counted: 0 };
}

/* Avant un passage : ce qu'il faut lire pour écrire juste. */
export async function planCustomerDebt(env, merchant, c, kind, method, opts) {
  const o = opts || {};
  if (kind === 'bounce') {
    const w = await owedFor(env, merchant, c, o.onAccount);
    const client = w.owed > 0 && isClientParty(c) ? await clientOf(env, merchant, c.party_id) : null;
    /* Des tickets tous annulés : plus rien n'est dû, le chèque ne porte pas de dette. */
    return { kind, counted: w.counted > 0, bounceCents: w.counted, clientId: client ? String(client.id) : '', noteCents: w.owed,
      debtOpen: w.linked > 0 && w.owed === 0 ? 0 : 1 };
  }
  if (kind === 'close') {
    const [note, bounce] = await Promise.all([debtNote(env, merchant, c.id), bounceRow(env, merchant, c.id)]);
    const counted = bounce ? Math.max(0, -Number(bounce.amount_cents) || 0) : 0;
    if (method === 'till' && (!note || note.remainingCents > 0)) return { error: 'balance-open', remaining: note ? note.remainingCents : Number(c.amount_cents) };
    return { kind, note, counted: counted > 0, backCents: Math.max(0, counted - (note ? note.paidCents : 0)), method: SALE_METHOD[method] || 'cheque' };
  }
  return null;
}

/* Les instructions du plan, dans le lot du passage. */
export function customerDebtStatements(env, merchant, c, plan, ctx) {
  const { histId, now, requestId } = ctx;
  const out = [];
  if (plan.kind === 'bounce') {
    if (plan.counted) out.push(saleRow(env, merchant, bounceSaleId(c.id), -plan.bounceCents, 'cheque', 'Chèque impayé', c, now, histId));
    if (plan.clientId && plan.noteCents > 0) out.push(openNoteStatement(env, merchant, c, plan.clientId, now, histId, plan.noteCents));
  }
  if (plan.kind === 'close') {
    if (plan.counted && plan.backCents > 0) {
      out.push(saleRow(env, merchant, 'chqback-' + String(requestId).replace(/[^A-Za-z0-9_-]/g, '').slice(-40), plan.backCents, plan.method,
        plan.method === 'cheque' ? 'Chèque impayé, encaissé à la représentation' : 'Chèque impayé, réglé hors caisse', c, now, histId));
    }
    if (plan.note) out.push(...closeNote(env, merchant, plan.note, histId));
  }
  return out;
}
/* La note se ferme à ce que la caisse a reçu ; sans reçu, elle disparaît. */
function closeNote(env, merchant, note, histId) {
  if (note.receipts === 0) return [env.DB.prepare(`DELETE FROM retail_balances WHERE merchant = ? AND id = ? AND ${ifHist}
      AND NOT EXISTS (SELECT 1 FROM retail_balance_receipts r WHERE r.merchant = ? AND r.balance_id = ?)`)
    .bind(merchant, note.id, merchant, histId, merchant, note.id)];
  return [env.DB.prepare(`UPDATE retail_balances SET total_cents = ? WHERE merchant = ? AND id = ? AND ${ifHist}`)
    .bind(note.paidCents, merchant, note.id, merchant, histId)];
}

/* ── Un ticket annulé après le rejet de son chèque ───────────────────────────
   Lu avant le lot de l'annulation (functions/api/sale/cancel.js), écrit dans
   ce lot, conditionné à l'annulation elle-même (void_ts posé à CET instant) et
   à une ligne d'historique propre au couple ticket × chèque : rejouer
   l'annulation n'enlève rien deux fois. */
export async function planSaleVoid(env, merchant, saleId) {
  let list = [];
  try {
    const rs = await env.DB.prepare(`SELECT c.* FROM cheque_links l JOIN cheques c ON c.merchant = l.merchant AND c.id = l.cheque_id
       WHERE l.merchant = ? AND l.link_type = 'sale' AND l.link_id = ? AND c.direction = 'received' AND c.party_type <> 'supplier' AND c.debt_open = 1`).bind(merchant, saleId).all();
    list = (rs && rs.results) || [];
  } catch (_) { return []; }
  const plans = [];
  for (const c of list) {
    const sh = await sharesOf(env, merchant, c);
    const mine = sh.rows.find((r) => r.sale === String(saleId) && r.live);
    if (!mine || !(mine.share > 0)) continue;
    const [bounce, note] = await Promise.all([bounceRow(env, merchant, c.id), debtNote(env, merchant, c.id)]);
    const counted = bounce ? Math.max(0, -Number(bounce.amount_cents) || 0) : 0;
    const give = Math.min(mine.share, counted || mine.share);
    const leftOwed = Math.max(0, sh.liveShare - mine.share), paid = note ? note.paidCents : 0;
    plans.push({ cheque: c, share: mine.share, bounce: bounce ? { id: String(bounce.id), next: counted - Math.min(counted, mine.share) } : null,
      note, noteNext: note ? Math.max(0, note.totalCents - give) : 0, debtOpen: leftOwed > paid ? 1 : 0 });
  }
  return plans;
}
export function saleVoidStatements(env, merchant, plans, ctx) {
  const { saleId, voidTs, now, actor, ref } = ctx;
  const out = [];
  const voided = 'EXISTS (SELECT 1 FROM sales WHERE merchant = ? AND id = ? AND void_ts = ?)';
  for (const p of plans) {
    const c = p.cheque, histId = 'chh_v' + String(c.id).slice(-12) + String(voidTs).slice(-8);
    const why = `Ticket ${String(ref || saleId).slice(0, 40)} annulé : ${(p.share / 100).toFixed(2)} MAD rendus`;
    out.push(env.DB.prepare(`INSERT OR IGNORE INTO cheque_history (merchant, id, cheque_id, request_id, action, from_status, to_status, event_date, reason, detail, ledger_entry_id, actor, at)
        SELECT ?, ?, id, ?, 'edit', status, status, ?, ?, 'sale-void', NULL, ?, ? FROM cheques WHERE merchant = ? AND id = ? AND ${voided}`)
      .bind(merchant, histId, ('void:' + saleId + ':' + c.id).slice(0, 120), new Date(now).toISOString().slice(0, 10), why, String(actor || '').slice(0, 100), now,
        merchant, c.id, merchant, String(saleId), voidTs));
    if (p.bounce) {
      if (p.bounce.next <= 0) out.push(env.DB.prepare(`UPDATE sales SET void_ts = ?, void_reason = 'ticket-annule', void_note = '' WHERE merchant = ? AND id = ? AND void_ts IS NULL AND ${ifHist}`)
        .bind(now, merchant, p.bounce.id, merchant, histId));
      else out.push(env.DB.prepare(`UPDATE sales SET amount_cents = ?, amount = ?, payment_parts = ? WHERE merchant = ? AND id = ? AND void_ts IS NULL AND ${ifHist}`)
        .bind(-p.bounce.next, -Math.round(p.bounce.next / 100), JSON.stringify([{ method: 'cheque', amountCents: -p.bounce.next }]), merchant, p.bounce.id, merchant, histId));
    }
    if (p.note) {
      if (p.noteNext <= p.note.paidCents) out.push(...closeNote(env, merchant, p.note, histId));
      else out.push(env.DB.prepare(`UPDATE retail_balances SET total_cents = ? WHERE merchant = ? AND id = ? AND ${ifHist}`).bind(p.noteNext, merchant, p.note.id, merchant, histId));
    }
    if (!p.debtOpen) out.push(env.DB.prepare(`UPDATE cheques SET debt_open = 0, version = version + 1, updated_at = ? WHERE merchant = ? AND id = ? AND ${ifHist}`)
      .bind(now, merchant, c.id, merchant, histId));
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
      const rs = await env.DB.prepare(`SELECT l.cheque_id, SUM(CASE WHEN s.void_ts IS NOT NULL THEN 1 ELSE 0 END) AS v, SUM(CASE WHEN s.void_ts IS NULL THEN 1 ELSE 0 END) AS live, COUNT(*) AS n
          FROM cheque_links l JOIN sales s ON s.merchant = l.merchant AND s.id = l.link_id
         WHERE l.merchant = ? AND l.link_type = 'sale' AND l.cheque_id IN (${part.map(() => '?').join(',')}) GROUP BY l.cheque_id`).bind(merchant, ...part).all();
      for (const r of (rs && rs.results) || []) voided.set(String(r.cheque_id), { all: Number(r.v) > 0 && Number(r.live) === 0, some: Number(r.v) > 0, n: Number(r.n) || 0 });
    }
  } catch (_) { /* une base sans ventes : rien à signaler */ }
  for (const v of list) {
    const vs = voided.get(v.id);
    v.saleVoided = !!(vs && vs.all);
    v.salePartlyVoided = !!(vs && vs.some && !vs.all);
    v.linkedSales = vs ? vs.n : 0;
    v.clientId = v.direction === 'received' && v.partyType === 'customer' && v.partyId && !v.partyId.startsWith('n:') ? v.partyId : '';
    v.debt = null;
    if (v.debtOpen && v.clientId) {
      const note = await debtNote(env, merchant, v.id);
      v.debt = note ? { onAccount: true, totalCents: note.totalCents, paidCents: note.paidCents, remainingCents: note.remainingCents } : { onAccount: false };
    }
  }
  return list;
}
