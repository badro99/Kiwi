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

/* Optional historical read model. Only a trimming marker opts a ledger in. */
(function () {
  'use strict';
  const tenants = new Map(), listeners = new Set();
  const PREFIX = 'kiwiSalesSummary:v1:', LIMIT = 800, MAX_BYTES = 180000;
  const merchant = () => window.KiwiLive?.merchant?.() || '';
  const clock = () => window.KiwiDayReport;
  function coverageStart(venueId) {
    // No marker means all local rows remain authoritative, including refunds
    // before the first sale. Feed completion alone must not change this path.
    try {
      const raw = localStorage.getItem('kiwiSalesCoverage:' + (venueId || merchant()));
      const n = Number(raw);
      return raw !== null && Number.isFinite(n) && n > 0 ? n : null;
    } catch (_) { return null; }
  }
  function state(m) {
    if (!tenants.has(m)) {
      let saved = [];
      try { saved = JSON.parse(localStorage.getItem(PREFIX + m) || '[]'); } catch (_) {}
      const days = new Map();
      if (Array.isArray(saved)) saved.slice(-LIMIT).forEach(row => {
        if (row && row.day && Number.isFinite(row.day.from) && row.day.to > row.day.from && Array.isArray(row.splits)) days.set(row.day.from, row);
      });
      tenants.set(m, { days, pending: new Set(), retry: new Map() });
    }
    return tenants.get(m);
  }
  function persist(m, s, stable) {
    const rows = [...s.days.values()].filter(r => r.day.to <= stable).sort((a, b) => a.day.from - b.day.from).slice(-LIMIT);
    let encoded = JSON.stringify(rows);
    while (encoded.length > MAX_BYTES / 2 && rows.length) { rows.shift(); encoded = JSON.stringify(rows); }
    try { localStorage.setItem(PREFIX + m, encoded); } catch (_) {}
    // Bound memory too, without touching any other tenant's storage.
    while (s.days.size > LIMIT) s.days.delete(s.days.keys().next().value);
  }
  async function load(m, s, bounds, stable) {
    bounds.forEach(b => s.pending.add(b.from));
    let timer;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    try {
      const data = await Promise.race([
        Promise.resolve().then(() => fetch('/api/sales-summary?merchant=' + encodeURIComponent(m) + '&from=' + bounds[0].from + '&to=' + bounds[bounds.length - 1].to,
          { headers: { Accept: 'application/json' }, credentials: 'include', cache: 'no-store', signal: controller?.signal }))
          .then(r => { if (!r?.ok) throw new Error('http'); return r.json(); }),
        new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error('timeout')); }, 12000); })
      ]);
      if (data.merchant !== m || !Array.isArray(data.days) || !Array.isArray(data.splits)) throw new Error('scope');
      for (const b of bounds) {
        const day = data.days.find(d => d.from === b.from && d.to === b.to);
        if (!day || !day.methods || !day.whole || !day.refunds || !day.hours) throw new Error('shape');
      }
      bounds.forEach(b => s.days.set(b.from, { day: data.days.find(d => d.from === b.from),
        splits: data.splits.filter(r => r.ts >= b.from && r.ts < b.to), at: Date.now() }));
      persist(m, s, stable);
      if (merchant() === m) listeners.forEach(fn => { try { fn(); } catch (_) {} });
    } catch (_) {
      bounds.forEach(b => s.retry.set(b.from, Date.now() + 30000));
    } finally {
      clearTimeout(timer);
      bounds.forEach(b => s.pending.delete(b.from));
    }
  }
  function get(from, to) {
    const m = merchant(), R = clock();
    if (!m || !R || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
    const s = state(m), bounds = [];
    let b = R.dayBounds(R.businessDay(from, m), m);
    const stable = R.dayBounds(R.businessDay(R.dayBounds(R.today(m), m).from - 1, m), m).from;
    for (let i = 0; b.from < to && i < 4000; i++) {
      bounds.push(b);
      const next = R.dayBounds(R.businessDay(b.to, m), m);
      if (next.from <= b.from) return null;
      b = next;
    }
    if (!bounds.length || bounds[bounds.length - 1].to < to) return null;
    let missing = false, batch = [];
    function flush() { if (batch.length) load(m, s, batch, stable); batch = []; }
    bounds.forEach(b => {
      const row = s.days.get(b.from);
      // Today's and yesterday's buckets are never persisted and refresh each minute.
      const fresh = row && (b.to <= stable || Date.now() - row.at < 60000);
      if (!fresh) {
        missing = true;
        if (!s.pending.has(b.from) && !(s.retry.get(b.from) > Date.now())) batch.push(b);
        else flush();
        if (batch.length === 400) flush();
      } else flush();
    });
    flush();
    if (missing) return null;
    return { days: bounds.map(b => s.days.get(b.from).day), splits: bounds.flatMap(b => s.days.get(b.from).splits) };
  }
  function stats(sales, refunds, from, to, venueId) {
    const M = window.KiwiSalesMath, boundary = coverageStart(venueId);
    if (boundary === null || from >= boundary) return M.statsFromSales(sales, refunds, from, to);
    const end = Math.min(to, boundary), summary = get(from, end);
    const fallback = () => Object.assign(M.statsFromSales(sales, refunds, from, to), { partial: true });
    if (!summary) return fallback();
    try {
      const old = M.statsFromSummary(summary.days, summary.splits, from, end);
      const recent = M.statsFromSales(sales, refunds, Math.max(from, boundary), to);
      Object.keys(old).forEach(k => { if (k !== 'basket') recent[k] += old[k]; });
      recent.basket = recent.count ? recent.gross / recent.count : 0;
      return recent;
    } catch (_) { return fallback(); } // Partial-day windows cannot use daily totals.
  }
  window.KiwiSalesSummary = Object.freeze({ coverageStart, get, stats,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } });
})();

/* Complete raw windows for detail readers. No writes to the durable ledger. */
(function () {
  'use strict';
  const cache = new Map(), pending = new Map(), MAX_SPAN = 400 * 86400000 + 7200000;
  const merchant = () => window.KiwiLive?.merchant?.() || '';
  const copy = rows => JSON.parse(JSON.stringify(rows));
  async function read(url) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => fetch(url, { headers: { Accept: 'application/json' },
          credentials: 'include', cache: 'no-store', signal: controller?.signal }))
          .then(r => { if (!r?.ok) throw new Error('http'); return r.json(); }),
        new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error('timeout')); }, 12000); })
      ]);
    } finally { clearTimeout(timer); }
  }
  async function collect(m, from, to) {
    const sales = [], cursors = new Set(), tokens = new Set();
    let after = '', lastTs = from, lastCursor = 0;
    for (let page = 0; page < 20; page++) {
      const data = await read('/api/feed?window=1&merchant=' + encodeURIComponent(m) + '&from=' + from + '&to=' + to + '&limit=500'
        + (after ? '&after=' + encodeURIComponent(after) : ''));
      if (merchant() !== m || data?.merchant !== m || data.from !== from || data.to !== to ||
          !Array.isArray(data.sales) || data.sales.length > 500 || typeof data.complete !== 'boolean' ||
          (data.complete ? data.next !== null : typeof data.next !== 'string' || !data.next || !data.sales.length)) throw new Error('shape');
      for (const row of data.sales) {
        if (!row || !Number.isFinite(row.ts) || row.ts < from || row.ts >= to ||
            !Number.isSafeInteger(row.cursor) || row.cursor <= 0 || cursors.has(row.cursor) ||
            row.ts < lastTs || (row.ts === lastTs && row.cursor <= lastCursor) ||
            !Number.isFinite(row.amountCents ?? row.amount)) throw new Error('row');
        cursors.add(row.cursor); lastTs = row.ts; lastCursor = row.cursor; sales.push(row);
      }
      if (data.complete) return sales;
      if (tokens.has(data.next)) throw new Error('cursor');
      tokens.add(data.next); after = data.next;
    }
    return null; // Never present a prefix as a complete window.
  }
  function fetchRaw(from, to) {
    try {
      const m = merchant();
      if (!m || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from <= 0 || to <= from || to - from > MAX_SPAN) return Promise.resolve(null);
      const key = JSON.stringify([m, from, to]), hit = cache.get(key);
      if (hit && Date.now() - hit.at < 60000) return Promise.resolve(copy(hit.rows));
      if (pending.has(key)) return pending.get(key).then(rows => rows === null ? null : copy(rows));
      const task = collect(m, from, to).then(rows => {
        if (rows !== null && merchant() === m) {
          cache.delete(key); cache.set(key, { rows, at: Date.now() });
          while (cache.size > 4) cache.delete(cache.keys().next().value);
          return rows;
        }
        return null;
      }).catch(() => null).finally(() => pending.delete(key));
      pending.set(key, task);
      return task.then(rows => rows === null ? null : copy(rows));
    } catch (_) { return Promise.resolve(null); }
  }
  window.KiwiSalesWindow = Object.freeze({ fetchRaw });
})();
