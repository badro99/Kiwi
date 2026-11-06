/* Pure centime allocation and durable, merchant-scoped loyalty delivery.
   Plus, tout en bas : les lots « Lancer » laissés sur la tablette (svOrphanBatches), annoncés et jamais rejoués. */
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
  const authNeeded = new Set();
  function announce(kind, merchant) {
    try {
      if (typeof toast !== 'function' || typeof employeePick !== 'function') return;
      toast(kind === 'auth'
        ? employeePick('Points fidélité en attente · reconnectez-vous pour les envoyer', 'Loyalty points pending · sign in again to send them', 'نقاط الولاء قيد الانتظار · سجّل الدخول من جديد لإرسالها')
        : employeePick('Points fidélité refusés par le serveur pour un achat', 'Loyalty points refused by the server for a purchase', 'رفض الخادم نقاط الولاء لعملية شراء'), 7000);
    } catch (_) {}
  }
  function status(merchant) { return { pending: Object.keys(read(merchant)).length, authNeeded: authNeeded.has(merchant) }; }
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
          let timer, response, data;
          // Promise-race deadline: a transport or body that ignores abort cannot keep this merchant busy forever.
          const deadline = new Promise((_, reject) => { timer = setTimeout(() => { if (ctl) ctl.abort(); reject(new Error('request-timeout')); }, 12000); });
          try {
            await Promise.race([deadline, (async () => {
              response = await fetch('/api/employee-clients', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: ctl ? ctl.signal : undefined,
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
              });
              data = response.ok && await response.json();
            })()]);
          } finally { clearTimeout(timer); }
          // An expired session (401) is not a refusal of the purchase: keep it under the same key until the employee signs in again.
          if (response.status === 401) { authNeeded.add(merchant); announce('auth', merchant); break; }
          // A definitive refusal (4xx other than 401/408/429) will never succeed: drop it instead of retrying forever, and say so.
          const refused = !response.ok && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
          if (data && data.ok) { authNeeded.delete(merchant); delete entries[ref]; persist(merchant, entries); }
          else if (refused) { delete entries[ref]; persist(merchant, entries); announce('refused', merchant); }
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
  serveurPaymentSupport.instance = { allocate, equal, enqueue, flush, status };
  window.addEventListener('online', retry);
  setInterval(retry, 30000);
  setTimeout(retry, 0);
  return serveurPaymentSupport.instance;
}
serveurPaymentSupport();

/* Lots « Lancer » non confirmés laissés sur cette tablette par un AUTRE serveur
   (déconnecté, téléphone changé), ou par celui-ci mais trop anciens pour être
   rejoués : le balayage ne les envoie jamais, donc personne ne les voyait.
   On les annonce une fois, avec les tables concernées, sans rien rejouer. */
function svOrphanBatches() {
  const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug() || 'store';
  const me = (liveEmployeeState && (liveEmployeeState.staffId || liveEmployeeState.employeeId)) || currentUser || 'employee';
  const prefix = 'kiwi:service-pending-v1:' + merchant + ':';
  const found = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key.indexOf(prefix) !== 0) continue;
      const rest = key.slice(prefix.length), cut = rest.indexOf(':');
      if (cut < 1) continue;
      let pending = null;
      try { pending = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { continue; }
      if (!pending || !pending.ref || !Array.isArray(pending.lines) || !pending.lines.length) continue;
      const stale = Date.now() - Number(pending.createdAt || 0) > SV_DRAFT_TTL;
      const operator = rest.slice(0, cut);
      if (operator !== String(me) || stale) found.push({ operator, table: rest.slice(cut + 1), stale, ref: pending.ref });
    }
  } catch (_) {}
  return found;
}
const svOrphanAnnounced = new Set();
function svAnnounceOrphans() {
  const fresh = svOrphanBatches().filter((o) => !svOrphanAnnounced.has(o.ref));
  if (!fresh.length) return 0;
  fresh.forEach((o) => svOrphanAnnounced.add(o.ref));
  const tables = Array.from(new Set(fresh.map((o) => o.table))).join(', ');
  toast(employeePick('Commandes non envoyées en cuisine, laissées sur cette tablette · voyez avec le responsable', 'Orders not sent to the kitchen were left on this tablet · check with your manager', 'طلبات لم تُرسل إلى المطبخ بقيت على هذا الجهاز · راجع المسؤول') + ' (' + tables + ')', 9000);
  return fresh.length;
}
