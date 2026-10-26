import { json } from '../../auth/_lib.js';
import { fail, str, parseJson, addDays, changesOf, QUOTE_VALID_DAYS } from './_shared.js';
import { normLines, computeTotals } from './_tax.js';
import { todayFor, getRow, sumsFor, balanceOf, displayStatus, presentFull, insertStatement, draftRow, CREDITED_SQL, remainingCredit, loadIssuedInvoice, sellerSnapshot } from './_documents.js';
// Contrat interne : reçoit ctx authentifié et body parsé ; retourne les Responses des avoirs, devis, duplications et suppressions, ou lève Fail. Transactions et ordre des écritures conservés.

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


export { creditNote, quoteStatus, convertQuote, duplicate, deleteDraft };
