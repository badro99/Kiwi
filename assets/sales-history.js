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
  const generations = new Map();
  const PREFIX = 'kiwiSalesSummary:v1:', LIMIT = 800, MAX_BYTES = 180000;
  const merchant = () => window.KiwiLive?.merchant?.() || '';
  const clock = () => window.KiwiDayReport;
  function coverageStart(venueId) {
    // No marker means all local rows remain authoritative, including refunds
    // before the first sale. Feed completion alone must not change this path.
    try {
      const scope = window.KiwiSales?.scope ? window.KiwiSales.scope(venueId) : (venueId || merchant());
      if (!scope) return null;
      const raw = localStorage.getItem('kiwiSalesCoverage:' + scope);
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
    const generation = generations.get(m);
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
      if (generation !== generations.get(m)) return;
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
    if (!summary || window.KiwiSalesReconcile?.proof(venueId)?.pending > 0) return fallback();
    try {
      const old = M.statsFromSummary(summary.days, summary.splits, from, end);
      const recent = M.statsFromSales(sales, refunds, Math.max(from, boundary), to);
      Object.keys(old).forEach(k => { if (k !== 'basket') recent[k] += old[k]; });
      recent.basket = recent.count ? recent.gross / recent.count : 0;
      return recent;
    } catch (_) { return fallback(); } // Partial-day windows cannot use daily totals.
  }
  window.KiwiSalesSummary = Object.freeze({ coverageStart, get, stats,
    invalidate(m) {
      generations.set(m, (generations.get(m) || 0) + 1);
      tenants.delete(m);
      try { localStorage.removeItem(PREFIX + m); } catch (_) {}
      if (merchant() === m) listeners.forEach(fn => { try { fn(); } catch (_) {} });
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } });
})();

/* Complete raw windows for detail readers. No writes to the durable ledger. */
(function () {
  'use strict';
  const cache = new Map(), pending = new Map(), MAX_SPAN = 400 * 86400000 + 7200000;
  const merchant = () => window.KiwiLive?.merchant?.() || '';
  const copy = rows => JSON.parse(JSON.stringify(rows));
  const generations = new Map();
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
      const generation = generations.get(m);
      const task = collect(m, from, to).then(rows => {
        if (generation !== generations.get(m)) return null;
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
  window.KiwiSalesWindow = Object.freeze({ fetchRaw, invalidate(m) {
    generations.set(m, (generations.get(m) || 0) + 1);
    for (const key of cache.keys()) if (JSON.parse(key)[0] === m) cache.delete(key);
  } });
})();

/* Coverage-gated reconciliation. A failed replay never publishes its prefix. */
(function () {
  'use strict';
  const proofs = new Map();
  const cents = row => row.amountCents != null ? row.amountCents : Math.round(row.amount * 100);
  const id = row => String(row.saleId || row.id || '');
  function scope(venue) { return window.KiwiSales?.scope?.(venue) || ''; }
  function coverage(venue) {
    const key = scope(venue);
    if (!key) return null;
    try {
      const raw = localStorage.getItem('kiwiSalesCoverage:' + key), n = Number(raw);
      return raw !== null && Number.isSafeInteger(n) && n > 0 ? n : null;
    } catch (_) { return null; }
  }
  function invalidate(merchant) {
    // A tombstone has no timestamp; a revision may move the original day.
    // Invalidate only this merchant, including in-flight historical reads.
    window.KiwiSalesSummary?.invalidate?.(merchant);
    window.KiwiSalesWindow?.invalidate?.(merchant);
  }
  function inside(row, proof) {
    return Number.isSafeInteger(row?.cursor) && row.cursor > 0 && row.cursor <= proof.fence &&
      row.ts >= proof.from && row.ts < proof.to;
  }
  function pending(row, debt) {
    return !row?.cursor || row.pending || row.syncPending || debt.has(id(row));
  }
  function retain(rows, cursors, proof) {
    const keep = new Set(cursors.map(Number)), debt = new Set(proof.pendingIds || []);
    return rows.filter(row => pending(row, debt) || !inside(row, proof) || keep.has(Number(row.cursor)));
  }
  function reconcile(rows, raw, proof, sign, make) {
    const debt = new Set(proof.pendingIds || []);
    const wanted = raw.filter(row => cents(row) * sign > 0);
    const ids = new Set(raw.map(id)), cursors = new Set(raw.map(row => row.cursor));
    // The proved interval may remove stale server rows, never manual/upload debt.
    const kept = rows.filter(row => pending(row, debt) ||
      (!inside(row, proof) && !ids.has(id(row)) && !cursors.has(row.cursor) &&
       !(row.ts >= proof.from && (proof.removed || []).some(r => r.cursor === row.cursor && id(r) === id(row)))));
    for (const row of wanted) {
      if (row.ts < proof.from || debt.has(id(row))) continue;
      kept.push(make(Object.assign({}, row, { amount: Math.abs(cents(row)) / 100,
        saleId: id(row), ref: row.orderRef || row.ref || '', receiptRef: row.receiptRef || row.ref || '' })));
    }
    return kept;
  }
  function verify(sales, refunds, raw, proof) {
    const debt = new Set(proof.pendingIds || []);
    let count = 0;
    function matches(rows, sign) {
      count += rows.filter(row => pending(row, debt)).length;
      const actual = rows.filter(row => !pending(row, debt) && inside(row, proof));
      const expected = raw.filter(row => inside(row, proof) && cents(row) * sign > 0 && !debt.has(id(row)));
      const saved = new Map(actual.map(row => [row.cursor, row]));
      return saved.size === actual.length && actual.length === expected.length && expected.every(row => {
        const entry = saved.get(row.cursor);
        return entry && id(entry) === id(row) && entry.ts === row.ts && cents(entry) === cents(row) * sign;
      });
    }
    if (!matches(sales, 1) || !matches(refunds, -1)) throw new Error('ledger');
    return { pending: count };
  }
  function create(merchant, venue, read, active) {
    const from = coverage(venue), ledgerScope = scope(venue);
    if (from === null || !ledgerScope) throw new Error('coverage');
    const checkpointKey = 'kiwiSalesChangeCheckpoint:' + ledgerScope;
    let committed = null;
    function check() {
      if (!active() || (window.KiwiVenue?.getVenue && window.KiwiVenue.getVenue() !== venue) ||
          scope(venue) !== ledgerScope || coverage(venue) !== from) throw new Error('scope');
    }
    function sale(row) {
      if (!row || !id(row) || !Number.isSafeInteger(row.cursor) || row.cursor <= 0 ||
          !Number.isSafeInteger(row.ts) || row.ts <= 0 || !Number.isSafeInteger(cents(row))) throw new Error('invalid-sales');
    }
    async function cycle() {
      check();
      const next = committed ? Object.assign({}, committed, { rows: new Map(committed.rows), removed: [] }) :
        { from, to: Date.now() + 7200000, fence: null, changeFence: null, cursor: 0, rows: new Map(), removed: [], checkpoint: null };
      let pages = 0, changed = false;
      const base = '/api/feed?merchant=' + encodeURIComponent(merchant);
      async function page(query) {
        if (++pages > 200) throw new Error('cursor');
        const data = await read(base + query); check();
        if (!data || data.error || data.merchant !== merchant) throw new Error('scope');
        return data;
      }
      function upsert(row) {
        sale(row);
        for (const [key, old] of next.rows) if (old.cursor === row.cursor || id(old) === id(row)) next.rows.delete(key);
        if (row.ts >= from && !row.voided) next.rows.set(id(row), row);
      }
      function completion(data) {
        if (typeof data.complete !== 'boolean' || (data.complete ? data.next !== null : typeof data.next !== 'string' || !data.next)) throw new Error('cursor');
      }
      async function changes(position) {
        let token = String(position), seen = new Set(), seq = /^\d+$/.test(String(position)) ? Number(position) : -1;
        do {
          const data = await page('&changes=1&afterChange=' + encodeURIComponent(token) + '&limit=500');
          completion(data);
          if (!Array.isArray(data.changes) || data.changes.length > 500 || typeof data.checkpoint !== 'string' || !data.checkpoint ||
              (!data.complete && (data.next !== data.checkpoint || data.next === token))) throw new Error('cursor');
          for (const row of data.changes) {
            if (!Number.isSafeInteger(row.seq) || row.seq <= seq) throw new Error('cursor');
            seq = row.seq; changed = true;
            next.removed.push(row);
            if (row.deleted === true) {
              if (!id(row) || !Number.isSafeInteger(row.cursor) || row.cursor <= 0) throw new Error('invalid-sales');
              for (const [key, old] of next.rows) if (id(old) === id(row) && old.cursor === row.cursor) next.rows.delete(key);
            } else {
              if (typeof row.voided !== 'boolean') throw new Error('invalid-sales');
              upsert(row);
            }
          }
          next.checkpoint = data.checkpoint;
          if (data.complete) break;
          if (seen.has(data.next)) throw new Error('cursor');
          seen.add(data.next); token = data.next;
        } while (true);
      }
      if (!committed) {
        let after = '', lastTs = from, lastCursor = 0, seen = new Set(), cursors = new Set(), identities = new Set();
        do {
          const data = await page('&window=1&from=' + from + '&to=' + next.to + '&limit=500' + (after ? '&after=' + encodeURIComponent(after) : ''));
          completion(data);
          if (data.from !== from || data.to !== next.to || !Array.isArray(data.sales) || data.sales.length > 500 ||
              !Number.isSafeInteger(data.fence) || data.fence < 0 || !Number.isSafeInteger(data.changeFence) || data.changeFence < 0) throw new Error('invalid-feed');
          if (next.fence === null) { next.fence = data.fence; next.changeFence = data.changeFence; next.cursor = data.fence; }
          if (next.fence !== data.fence || next.changeFence !== data.changeFence) throw new Error('cursor');
          for (const row of data.sales) {
            sale(row);
            if (row.ts < from || row.ts >= next.to || row.cursor > next.fence || cursors.has(row.cursor) || identities.has(id(row)) ||
                row.ts < lastTs || (row.ts === lastTs && row.cursor <= lastCursor)) throw new Error('cursor');
            cursors.add(row.cursor); identities.add(id(row)); lastTs = row.ts; lastCursor = row.cursor; upsert(row);
          }
          if (data.complete) break;
          if (!data.sales.length || seen.has(data.next)) throw new Error('cursor');
          seen.add(data.next); after = data.next;
        } while (true);
        // Replay the offline checkpoint too, so archived corrections invalidate caches.
        let saved = null;
        try { saved = localStorage.getItem(checkpointKey); } catch (_) {}
        await changes(saved || next.changeFence);
      }
      // Inserts after F, including backdated inserts during bootstrap.
      do {
        const data = await page('&since=' + next.cursor + '&limit=500');
        if (!Array.isArray(data.sales) || !Array.isArray(data.voided) || !Number.isSafeInteger(data.cursor)) throw new Error('invalid-feed');
        const limit = Number.isInteger(data.limit) && data.limit >= 50 && data.limit <= 500 ? data.limit : 50;
        if (data.sales.length > limit) throw new Error('invalid-feed');
        let cursor = next.cursor;
        for (const row of data.sales) { sale(row); if (row.cursor <= cursor) throw new Error('cursor'); cursor = row.cursor; upsert(row); }
        if (data.cursor !== cursor) throw new Error('cursor');
        next.cursor = cursor;
        if (data.sales.length < limit) break;
      } while (true);
      // Also closes mutations between the bootstrap change drain and rowid catch-up.
      await changes(next.checkpoint);
      check();
      const offline = window.KiwiOffline;
      // Do not reconcile away rows when the device cannot inspect its upload debt.
      if (!offline?.list) throw new Error('pending-proof');
      const debt = await offline.list('sale', merchant); check();
      if (!Array.isArray(debt)) throw new Error('pending-proof');
      next.pendingIds = debt.map(row => String(row.saleId || row.id || row.payload?.id || ''));
      if (next.pendingIds.some(key => !key)) throw new Error('pending-proof');
      const result = Object.assign({}, next, { rows: [...next.rows.values()], scope: ledgerScope,
        pending: next.pendingIds.length, changed, bootstrap: !committed });
      return { result, commit() {
        check(); committed = next;
        proofs.set(ledgerScope, result);
        if (changed || result.bootstrap) invalidate(merchant);
        // Caller persists only after ledger effects and verification have succeeded.
        localStorage.setItem(checkpointKey, next.checkpoint);
      } };
    }
    return { cycle, reset() { committed = null; proofs.delete(ledgerScope); invalidate(merchant);
      try { localStorage.removeItem(checkpointKey); } catch (_) {} } };
  }
  window.KiwiSalesReconcile = Object.freeze({ scope, coverage, invalidate, inside, retain, reconcile, verify, create,
    proof(venue) { return proofs.get(scope(venue)); } });
})();
