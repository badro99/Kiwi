(function () {
  'use strict';
  const RECEIVABLE_METHODS = Object.freeze(['credit', 'crédit', 'compte', 'delivery', 'livraison', 'avoir', 'unpaid']);
  function tenderBucket(method) {
    const m = String(method || '').trim().toLowerCase();
    if (['cash', 'especes', 'espèces'].includes(m)) return 'cash';
    if (['card', 'carte', 'visa', 'mc', 'mastercard'].includes(m)) return 'card';
    if (m === 'tap') return 'tap';
    if (['qr', 'wallet'].includes(m)) return 'qr';
    if (m === 'link') return 'link';
    if (['virement', 'transfer', 'bank_transfer'].includes(m)) return 'transfer';
    if (['chèque', 'cheque', 'check'].includes(m)) return 'cheque';
    if (['split', 'partage', 'partagé'].includes(m)) return 'split';
    if (RECEIVABLE_METHODS.includes(m)) return null;
    return 'other';
  }
  function tenderAmounts(entry) {
    const amount = Math.max(0, +entry.amount || 0);
    const parts = Array.isArray(entry.paymentParts) ? entry.paymentParts.filter(part =>
      part && tenderBucket(part.method) && Number.isSafeInteger(+part.amountCents) && +part.amountCents > 0) : [];
    if (!parts.length) return [{ key: tenderBucket(entry.method), amount }];
    const received = parts.reduce((sum, part) => sum + +part.amountCents, 0);
    // Dashboard revenue excludes consigned liability; preserve that measure
    // while attributing its received part to the actual tender(s).
    return parts.map(part => ({ key: tenderBucket(part.method), amount: amount * +part.amountCents / received }));
  }
  function statsFromSales(sales, refundEntries, from, to) {
    let revenue = 0, gross = 0, refunds = 0, collected = 0, receivable = 0, count = 0, card = 0, cash = 0;
    sales.forEach((e) => {
      const ts = +e.ts || 0;
      if (ts < from || ts >= to) return;
      const amt = Math.max(0, +e.amount || 0);
      revenue += amt; gross += amt; count++;
      const tender = tenderBucket(e.method);
      if (tender) collected += amt;
      else if (RECEIVABLE_METHODS.includes(String(e.method || '').trim().toLowerCase())) receivable += amt;
      tenderAmounts(e).forEach(part => {
        if (part.key === 'cash') cash += part.amount;
        if (part.key === 'card' || part.key === 'tap') card += part.amount;
      });
    });
    refundEntries.forEach((e) => {
      const ts = +e.ts || 0;
      if (ts < from || ts >= to) return;
      const amt = Math.abs(+e.amount || 0);
      revenue -= Math.abs(+e.amount || 0); refunds += amt;
      const tender = tenderBucket(e.method);
      if (tender) collected -= amt;
      else if (RECEIVABLE_METHODS.includes(String(e.method || '').trim().toLowerCase())) receivable -= amt;
      if (tender === 'cash') cash -= amt;
      if (tender === 'card' || tender === 'tap') card -= amt;
    });
    return { revenue, gross, refunds, collected, receivable, count, basket: count ? gross / count : 0, card, cash };
  }
  // A summary bucket must be wholly inside or outside the requested window.
  function windowDays(days, from, to) {
    return days.filter(day => {
      if (day.to <= from || day.from >= to) return false;
      if (day.from < from || day.to > to) throw new RangeError('Summary day straddles window');
      return true;
    });
  }
  function statsFromSummary(days, splits, from, to) {
    const selected = windowDays(days, from, to);
    // Bucket entries reuse the raw primitive for method and refund semantics.
    const sales = [], refunds = [];
    let count = 0;
    selected.forEach(day => {
      count += day.count;
      Object.entries(day.methods).forEach(([method, value]) => sales.push({ ts: day.from, method, amount: value.cents / 100 }));
      Object.entries(day.refunds).forEach(([method, cents]) => refunds.push({ ts: day.from, method, amount: cents / 100 }));
    });
    const result = statsFromSales(sales, refunds, from, to);
    result.count = count;
    result.basket = count ? result.gross / count : 0;
    // Whole-sale attribution excludes split rows, which need proportional parts.
    const whole = selected.flatMap(day => Object.entries(day.whole).map(([method, cents]) => ({ ts: day.from, method, amount: cents / 100 })));
    const splitRows = splits.filter(row => selected.some(day => row.ts >= day.from && row.ts < day.to))
      .map(row => ({ ts: row.ts, method: row.method, amount: row.cents / 100, paymentParts: row.parts }));
    const tenders = statsFromSales(whole.concat(splitRows), refunds, from, to);
    result.card = tenders.card;
    result.cash = tenders.cash;
    return result;
  }
  // Supply the store clock explicitly; no DOM or global merchant state is read.
  function hoursFromSales(sales, from, to, hourOf) {
    const hours = {};
    sales.forEach(entry => {
      const ts = +entry.ts || 0, amount = Math.max(0, +entry.amount || 0);
      if (ts < from || ts >= to || !amount) return;
      const hour = hourOf(ts);
      hours[hour] = (hours[hour] || 0) + amount;
    });
    return hours;
  }
  function hoursFromSummary(days, from, to) {
    const hours = {};
    windowDays(days, from, to).forEach(day => Object.entries(day.hours).forEach(([hour, cents]) => {
      hours[hour] = (hours[hour] || 0) + cents / 100;
    }));
    return hours;
  }
  window.KiwiSalesMath = Object.freeze({ tenderBucket, tenderAmounts, RECEIVABLE_METHODS,
    statsFromSales, statsFromSummary, hoursFromSales, hoursFromSummary });
})();
