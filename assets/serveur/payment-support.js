/* Pure centime allocation and durable, merchant-scoped loyalty delivery. */
function serveurPaymentSupport() {
  if (serveurPaymentSupport.instance) return serveurPaymentSupport.instance;
  function allocate(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    const out = weights.map(w => sum ? Math.floor(total * w / sum) : 0);
    let left = total - out.reduce((a, b) => a + b, 0);
    if (sum > 0) for (let j = 0; left > 0; j = (j + 1) % out.length) {
      if (weights[j] > 0) { out[j]++; left--; }
    }
    return out;
  }
  function equal(cents, n, pct) {
    const base = Math.floor(cents / n);
    const bases = Array.from({ length: n }, (_, i) => i === n - 1 ? cents - base * (n - 1) : base);
    const tips = allocate(Math.round(cents * pct / 100 + 1e-9), bases);
    return bases.map((amountCents, i) => ({ amountCents, tipCents: tips[i] }));
  }
  const memory = new Map(), busy = new Set(), prefix = 'kiwi:serveur:loyalty:';
  function report() { console.warn('[serveur] loyalty storage unavailable; retry kept in memory'); }
  function read(merchant) {
    const entries = memory.get(merchant) || {};
    try { Object.assign(entries, JSON.parse(localStorage.getItem(prefix + merchant) || '{}')); } catch (_) { report(); }
    memory.set(merchant, entries);
    return entries;
  }
  function persist(merchant, entries) {
    memory.set(merchant, entries);
    try { localStorage.setItem(prefix + merchant, JSON.stringify(entries)); } catch (_) { report(); }
  }
  async function flush(merchant) {
    if (!merchant || busy.has(merchant) || navigator.onLine === false) return;
    busy.add(merchant);
    try {
      const entries = read(merchant);
      persist(merchant, entries);
      for (const [ref, body] of Object.entries(entries)) {
        try {
          const ctl = typeof AbortController === 'function' ? new AbortController() : null;
          const timer = setTimeout(() => { if (ctl) ctl.abort(); }, 12000);
          let response, data;
          try {
            response = await fetch('/api/employee-clients', {
              method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: ctl ? ctl.signal : undefined,
              headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            data = response.ok && await response.json();
          } finally { clearTimeout(timer); }
          // A definitive refusal (4xx other than 408/429) will never succeed: drop it instead of retrying forever.
          const refused = !response.ok && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
          if ((data && data.ok) || refused) { delete entries[ref]; persist(merchant, entries); }
        } catch (_) { break; }
      }
    } finally { busy.delete(merchant); }
  }
  function enqueue(body) {
    const entries = read(body.merchant);
    const ref = body.saleId ? 'employee-sale:' + body.saleId : body.ref;
    entries[ref] = { ...body, ref };
    persist(body.merchant, entries);
    void flush(body.merchant);
  }
  function retry() {
    const merchant = (typeof liveEmployeeState !== 'undefined' && liveEmployeeState && liveEmployeeState.merchant)
      || (typeof svSlug === 'function' ? svSlug() : '');
    if (merchant) void flush(merchant);
  }
  serveurPaymentSupport.instance = { allocate, equal, enqueue, flush };
  window.addEventListener('online', retry);
  setInterval(retry, 30000);
  setTimeout(retry, 0);
  return serveurPaymentSupport.instance;
}
serveurPaymentSupport();
