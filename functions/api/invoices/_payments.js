import { json } from '../../auth/_lib.js';
import { fail, str, newId, changesOf, addDays, MAX_DOC_CENTS, PAYMENT_METHODS } from './_shared.js';
import { normDay } from './_tax.js';
import { getRow, todayFor, sumsFor, balanceOf, CREDITED_SQL, presentFull } from './_documents.js';
// Contrat interne : reçoit ctx authentifié et body parsé ; retourne la Response des règlements avec les mêmes gardes SQL et bornes, ou lève Fail.

/* ── payment / delete-payment ── */

async function payment(ctx, body) {
  const row = await getRow(ctx, body.id);
  if (row.type !== 'invoice') throw fail(400, 'invalid-type', 'Seule une facture se règle.');
  if (row.status === 'draft') throw fail(409, 'not-issued', 'La facture n’est pas émise.');
  const amount = Number(body.amountCents);
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_DOC_CENTS) throw fail(400, 'invalid-amountCents', 'Montant invalide.');
  const today = await todayFor(ctx);
  let date = body.date == null || body.date === '' ? today : normDay(body.date, 'invalid-date');
  /* « Aujourd'hui » est celui du magasin. Un appareil à l'est de lui (un
   * patron en voyage, un navigateur à l'heure de Paris) dit déjà « demain »
   * pendant quelques heures : un jour d'avance est l'horloge, pas l'intention,
   * et devient aujourd'hui comme la date d'émission. Au-delà, c'est refusé. */
  if (date > today && date <= addDays(today, 1)) date = today;
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


export { payment, deletePayment };
