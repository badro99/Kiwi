import { json } from '../../auth/_lib.js';
import { iceProblem, ICE_DETAIL } from '../_ice.js';
import { PREFIXES, allocateNumber } from '../_invoice-series.js';
import { fail, str, parseJson, validDay, addDays, changesOf, DOC_TYPES, QUOTE_VALID_DAYS } from './_shared.js';
import { computeTotals, normCustomer, normLines, normDay, normTerms, normMethod } from './_tax.js';
import { todayFor, getRow, sumsFor, balanceOf, displayStatus, presentFull, insertStatement, draftRow, CREDITED_SQL, remainingCredit, loadIssuedInvoice, sellerSnapshot } from './_documents.js';
// Contrat interne : reçoit ctx authentifié et body déjà parsé ; valide et écrit les brouillons et émissions, retourne la Response existante ou lève Fail. Ne lit pas la requête et ne décide pas des droits.

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


export { save, issue, markSent };
