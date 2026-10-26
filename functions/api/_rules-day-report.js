/* Day-report figures. Callers supply normalized rows and the business-day bounds.
 * The ledger profile preserves the till's historic non-cash bucket and rounding;
 * the report profile preserves detailed tenders and split-tip allocation. */
const num = function (n) { var x = +n; return isFinite(x) ? x : 0; }
const round2 = function (n) { return Math.round(num(n) * 100) / 100; }
const minor = function (n) { return Math.round(((Number(n) || 0) + Number.EPSILON) * 100); }
const major = function (n) { return n / 100; }
export const ledgerFigures = function (journal, cashMovements, sinceMs) {
      const hasSince = typeof sinceMs === 'number' && Number.isFinite(sinceMs);
      let revenueC = 0, cardC = 0, cashC = 0, tipsC = 0, cashTipsC = 0, txns = 0;
      for (const e of journal) {
        if (!e || e.voided) continue;
        if (e.kind === 'refund' && e.refundSyncStatus === 'rejected'
          && !(e.cashHandedOut === true || Number(e.cashHandedOutAt) > 0
            || e.refundReconciliation === 'cash-handed-out')) continue;
        if (hasSince) {
          const t = (e.time instanceof Date ? e.time : new Date(e.time)).getTime();
          if (t < sinceMs) continue;
        }
        /* A refund changes net revenue and the tender balance, but it is not a
           second sale. Counting it in `txns` made one 100 MAD sale followed by
           a 20 MAD refund display 2 transactions and a 40 MAD average basket. */
        if ((e.amount > 0 || e.kind === 'complimentary') && e.kind !== 'refund') txns++;
        revenueC += minor(e.amount);
        if (e.method === 'cash') cashC += minor(e.amount); else cardC += minor(e.amount);
        const tip = e.tip || 0;
        tipsC += minor(tip);
        if (e.method === 'cash') cashTipsC += minor(tip);
      }
      let movesInC = 0, movesOutC = 0;
      for (const m of cashMovements) {
        if (!m) continue;
        if (hasSince) {
          const t = (m.time instanceof Date ? m.time : new Date(m.time)).getTime();
          if (t < sinceMs) continue;
        }
        if (m.type === 'in') movesInC += minor(m.amount); else movesOutC += minor(m.amount);
      }
      return {
        revenue: major(revenueC),
        card: major(cardC),
        cash: major(cashC),
        tips: major(tipsC),
        cashTips: major(cashTipsC),
        txns,
        movesIn: major(movesInC),
        movesOut: major(movesOutC),
        revenueC,
        cardC,
        cashC,
        tipsC,
        cashTipsC,
        movesInC,
        movesOutC,
      };
}
export const reportFigures = function (rows) {
  var gross = 0, refundAmt = 0, refundN = 0, txns = 0;
  var methods = Object.create(null), tips = 0, cashTips = 0;
  rows.forEach(function (s) {
      var isRefund = s.kind === 'refund' || s.amount < 0;
      var mag = Math.abs(s.amount);
      if (isRefund) { refundAmt += mag; refundN++; }
      else { gross += s.amount; txns++; }
      var m = s.method || 'cash';
      var tenderParts = !isRefund && s.parts && s.parts.length ? s.parts : null;
      if (tenderParts) tenderParts.forEach(function (p) {
        var method = p.method === 'avoir' ? 'credit' : p.method;
        methods[method] = round2(num(methods[method]) + p.amountCents / 100);
      });
      else methods[m] = round2(num(methods[m]) + (isRefund ? -mag : s.amount));
      tips += s.tip;
      cashTips += s.tipMethod ? (s.tipMethod === 'cash' ? s.tip : 0) : tenderParts ? Math.sign(s.tip) * Math.round(Math.abs(s.tip) * 100 * tenderParts.reduce(function (n, p) { return n + (p.method === 'cash' ? p.amountCents : 0); }, 0) / tenderParts.reduce(function (n, p) { return n + p.amountCents; }, 0) + 1e-9) / 100 : m === 'cash' ? s.tip : 0;

  });
  return { gross: gross, net: round2(gross - refundAmt), txns: txns,
    refunds: { count: refundN, amount: refundAmt }, methods: methods,
    tips: tips, cashTips: cashTips };
}
export const expectedCash = function (opening, cash, tips, movesIn, movesOut, gap) {
  return round2(expectedCashCents(opening, cash, tips, movesIn, movesOut, gap));
}

export const expectedCashCents = function (opening, cash, tips, movesIn, movesOut, gap) {
  return opening + cash + tips + movesIn - movesOut + gap;
}
