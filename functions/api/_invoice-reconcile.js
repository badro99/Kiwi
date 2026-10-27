// Server-side reconciliation of a till invoice (POST /api/invoice).
//
// The till sends its own snapshot (lines, rate, totals). The sale it invoices is
// in D1, and so is the v2 engine's rule for rates (invoices/_shared.js). The
// number shares series F with that engine, so what is printed under it must be
// as well founded: the TTC is the sale's amount, the rate is one the engine
// accepts, HT and TVA are RECOMPUTED from that TTC and that rate, and the
// lines are the sale's own lines. A till figure that disagrees is replaced, and
// the correction is written on the snapshot (`reconciled`) instead of refusing
// a real invoice over a rounding. Only a rate nobody can invoice with, or a
// TTC that is not the sale's, is refused.
import { VAT_RATES } from './invoices/_shared.js';

const round2 = (n) => Math.round(n * 100) / 100;

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/* TVA incluse : HT = TTC / (1 + taux), arrondi au centime supérieur à la demi-unité.
   Même formule que assets/invoice.js build(), en centimes entiers. */
export function splitTtc(ttcCents, rate) {
  const ht = rate > 0 ? Math.floor((ttcCents * 100 + (100 + rate) / 2) / (100 + rate)) : ttcCents;
  return { htCents: ht, vatCents: ttcCents - ht };
}

function saleLines(sale, ttcCents) {
  let parsed = null;
  try { parsed = sale.lines ? JSON.parse(sale.lines) : null; } catch (_) { parsed = null; }
  const rows = Array.isArray(parsed) ? parsed.filter((l) => l && Number(l.q) > 0) : [];
  if (!rows.length) return null;
  const lines = rows.map((l) => {
    const qty = Math.max(0.001, Number(l.q) || 1);
    const total = round2(Math.max(0, Number(l.t) || 0));
    return { name: String(l.n || 'Article').trim().slice(0, 60), qty, unitTTC: round2(total / qty), totalTTC: total };
  });
  const gap = ttcCents - lines.reduce((n, l) => n + Math.round(l.totalTTC * 100), 0);
  if (gap) lines.push({ name: gap < 0 ? 'Remise' : 'Ajustement', qty: 1, unitTTC: gap / 100, totalTTC: gap / 100 });
  return lines;
}

export function reconcileInvoiceSnapshot(snap, sale) {
  const corrected = [];
  const ttcCents = sale.amount_cents != null
    ? Math.round(Number(sale.amount_cents))
    : Math.round(Number(snap.totals && snap.totals.ttc) * 100);
  if (!Number.isSafeInteger(ttcCents) || ttcCents < 0) throw fail(409, 'total-mismatch');

  let rate = snap.tvaRate == null || snap.tvaRate === '' ? null : Number(snap.tvaRate);
  if (rate === null) {
    const askedVat = snap.totals && snap.totals.tva != null ? Math.round(Number(snap.totals.tva) * 100) : 0;
    rate = askedVat > 0 ? (VAT_RATES.find((r) => splitTtc(ttcCents, r).vatCents === askedVat) ?? NaN) : 0;
  }
  if (!VAT_RATES.includes(rate)) throw fail(409, 'invalid-vat-rate');

  const { htCents, vatCents } = splitTtc(ttcCents, rate);
  const asked = snap.totals || {};
  if (asked.ht == null || Math.round(Number(asked.ht) * 100) !== htCents
      || asked.tva == null || Math.round(Number(asked.tva) * 100) !== vatCents) corrected.push('totals');
  snap.tvaRate = rate;
  snap.totals = { ht: htCents / 100, tva: vatCents / 100, ttc: ttcCents / 100 };

  const own = saleLines(sale, ttcCents);
  const sent = Array.isArray(snap.lines) ? snap.lines : null;
  const sentCents = sent ? sent.reduce((n, l) => n + Math.round(Number(l && l.totalTTC) * 100), 0) : NaN;
  if (own) {
    if (!sent || JSON.stringify(sent.map((l) => [l && l.name, Math.round(Number(l && l.totalTTC) * 100)]))
        !== JSON.stringify(own.map((l) => [l.name, Math.round(l.totalTTC * 100)]))) corrected.push('lines');
    snap.lines = own;
  } else if (!sent || !sent.length || sentCents !== ttcCents) {
    // The sale kept no basket and the till's lines do not add up to the money.
    const label = String(sale.ref || sale.label || '').trim();
    snap.lines = [{ name: label ? 'Vente ' + label : 'Vente comptoir', qty: 1, unitTTC: ttcCents / 100, totalTTC: ttcCents / 100 }];
    if (sent && sent.length) corrected.push('lines');
  }
  if (corrected.length) snap.reconciled = corrected;
  return snap;
}
