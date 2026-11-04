/* Day-report figures. Callers supply normalized rows and the business-day bounds.
 * The ledger profile preserves the till's historic non-cash bucket and rounding;
 * the report profile preserves detailed tenders and split-tip allocation; both sum in centimes. */
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
  var grossC = 0, refundC = 0, refundN = 0, txns = 0;
  var methodsC = Object.create(null), tipsC = 0, cashTipsC = 0;
  rows.forEach(function (s) {
      var isRefund = s.kind === 'refund' || s.amount < 0;
      var magC = minor(Math.abs(s.amount)), tipC = minor(s.tip);
      if (isRefund) { refundC += magC; refundN++; }
      else { grossC += minor(s.amount); txns++; }
      var m = s.method || 'cash';
      var tenderParts = !isRefund && s.parts && s.parts.length ? s.parts : null;
      if (tenderParts) tenderParts.forEach(function (p) {
        var method = p.method === 'avoir' ? 'credit' : p.method;
        methodsC[method] = num(methodsC[method]) + p.amountCents;
      });
      else methodsC[m] = num(methodsC[m]) + (isRefund ? -magC : minor(s.amount));
      tipsC += tipC;
      cashTipsC += s.tipMethod ? (s.tipMethod === 'cash' ? tipC : 0) : tenderParts ? Math.sign(tipC) * Math.round(Math.abs(tipC) * tenderParts.reduce(function (n, p) { return n + (p.method === 'cash' ? p.amountCents : 0); }, 0) / tenderParts.reduce(function (n, p) { return n + p.amountCents; }, 0) + 1e-9) : m === 'cash' ? tipC : 0;
  });
  var methods = Object.create(null); for (var k in methodsC) methods[k] = major(methodsC[k]);
  return { gross: major(grossC), net: major(grossC - refundC), txns: txns,
    refunds: { count: refundN, amount: major(refundC) }, methods: methods,
    tips: major(tipsC), cashTips: major(cashTipsC) };
}
export const expectedCash = function (opening, cash, tips, movesIn, movesOut, gap) {
  return round2(expectedCashCents(opening, cash, tips, movesIn, movesOut, gap));
}

export const expectedCashCents = function (opening, cash, tips, movesIn, movesOut, gap) {
  return opening + cash + tips + movesIn - movesOut + gap;
}
