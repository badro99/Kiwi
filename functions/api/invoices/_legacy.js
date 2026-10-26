import { json } from '../../auth/_lib.js';
import { fail, str, validDay, addDays, changesOf, VAT_RATES, MAX_LINES, MAX_UNIT_CENTS, MAX_QTY, MAX_IMPORT, CHUNK } from './_shared.js';
import { computeTotals } from './_tax.js';
import { todayFor, draftRow, insertStatement } from './_documents.js';
// Contrat interne : reçoit ctx authentifié et body parsé ; normalise les documents historiques et retourne la Response du bilan importé/ignoré. Aucun changement de numérotation ni de transaction.

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


export { importLegacy };
