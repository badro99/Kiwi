/* Guest transport: live catalogue, sessions, submission and network error mapping. */
KiwiOrderMenu.orderProParts.run('transport', function () {
// extract:NETcomment:start
    /* ═══════════════════════════════════════════════════════════════════════
       NET — the only way this app learns anything.
       ───────────────────────────────────────────────────────────────────────
       OrderPro is a guest's phone: no account, no session, no shared storage
       with the till. Every fact it shows (store name, menu, prices, stock) is
       fetched over the network from the merchant's published catalogue, and
       every order it sends goes over the network to the caisse. Deliberately
       NO localStorage read of catalogue/order state — the three brains
       (OrderPro · caisse · dashboard) sync through the backend, not through a
       browser.

       Store identity = the `s` slug in the NFC link. That slug is the same
       merchant key the caisse pairing spine uses, so a phone that tapped the
       tag in store A can only ever see and order from store A.

       Fail-soft contract: when the backend is absent (static host, not yet
       deployed) fetches resolve to null and the UI says so honestly. It never
       invents a menu and never fakes a sent order.
       ═══════════════════════════════════════════════════════════════════════ */
// extract:NETcomment:end
// extract:NET:start
  function create({ location, fetch, demo: demoProvider }) {
      const qs = new URLSearchParams(location.search);
      const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
      const slug = clean(qs.get('s') || qs.get('store') || '', 64).toLowerCase();
      const table = clean(qs.get('t') || qs.get('table') || '', 4).replace(/\D/g, '');
      const modeParam = clean(qs.get('m') || qs.get('mode') || '', 12).toLowerCase();

      async function getJSON(url) {
        try {
          const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
          if (!r.ok) return null;
          return await r.json();
        } catch (_) { return null; }        // offline / no backend → caller decides
      }
      async function postJSON(url, body) {
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const j = await r.json().catch(() => null);
          if (!r.ok) return Object.assign({ ok: false, status: r.status, error: (j && j.error) || 'http-' + r.status }, j || {});
          return j || { ok: false, error: 'empty' };
        } catch (_) { return { ok: false, error: 'network' }; }
      }

      /* ?s=demo is the pitch demo (assets/orderpro-demo.js): its menu and its
         kitchen answer from the phone, and nothing reaches a server. */
      const demo = () => (slug === 'demo' && demoProvider()) || null;

      return {
        slug, table,
        demo: slug === 'demo',
        mode: modeParam === 'takeout' || modeParam === 'emporter' ? 'takeout'
            : modeParam === 'table' || modeParam === 'sur-place' ? 'table' : '',
        /* The store's published catalogue — the SAME endpoint the QR self-order
           page reads (functions/api/menu.js), so a merchant publishes once and
           both surfaces see it. → { name, type, menu, shop, orderpro } */
        catalog: () => demo() ? demo().catalog() : getJSON('/api/menu?merchant=' + encodeURIComponent(slug)),
        /* Send one order to the caisse queue → { ok, id, number, total, lines } */
        placeOrder: (payload) => demo() ? demo().placeOrder(payload) : postJSON('/api/order', Object.assign({}, payload, { merchant: slug })),
        /* Poll one order's live status → { ok, status, number } */
        orderStatus: (id) => demo() ? demo().orderStatus(id) : getJSON('/api/order?merchant=' + encodeURIComponent(slug) +
                                     '&id=' + encodeURIComponent(id)),
        /* S'asseoir. La session lie CE téléphone à CETTE table, et la caisse
           peut la fermer : encaisser l'addition coupe le robinet, et le client
           qui aurait gardé le lien ne peut plus commander de chez lui.
           → { ok, session, mode, table, status } */
        openSession: (mode, table) => demo() ? demo().openSession(mode, table) : postJSON('/api/order/session',
          { merchant: slug, mode: mode, table: table || '' }),
        /* Suis-je encore le bienvenu ? C'est aussi le battement de cœur qui
           allume la table sur le plan de salle du comptoir.
           → { ok, status, closedBy, table, mode } */
        sessionStatus: (id) => demo() ? demo().sessionStatus(id) : getJSON('/api/order/session?merchant=' + encodeURIComponent(slug) +
                                       '&session=' + encodeURIComponent(id)),
        serviceRequest: (session, action) => demo() ? demo().serviceRequest(session, action) : postJSON('/api/order/session',
          { merchant: slug, session, action }),
      };
  }

// extract:NET:end
  function retry(scope, capabilities) {
    const { TextEncoder, Uint8Array } = capabilities;
    const { NET } = scope;
    return {
// extract:retry:start
      sendKey() { return 'kiwi-op-send:' + NET.slug; },
      sendScope() { return JSON.stringify([NET.slug, this.id, this.mode, String(this.table || '')]); },
      async prepareSend(lines) {
        const key = this.sendKey(), scope = this.sendScope(), payload = JSON.stringify(lines);
        const previous = this.pendingSend;
        let fingerprint = '';
        try {
          const digest = await capabilities.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
          fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) { /* unavailable storage/crypto permits only an in-page retry */ }
        let ref = previous && previous.scope === scope && previous.payload === payload
          && !this.retiredSendRefs.has(key + ':' + previous.ref) ? previous.ref : '';
        if (!ref && fingerprint) {
          try {
            const saved = JSON.parse(capabilities.localStorage.getItem(key) || 'null');
            if (saved && saved.v === 1 && saved.scope === scope && saved.fingerprint === fingerprint
                && /^r[A-Za-z0-9_-]{6,40}$/.test(saved.ref || '')
                && !this.retiredSendRefs.has(key + ':' + saved.ref)
                && capabilities.localStorage.getItem(key + ':retired:' + saved.ref) !== '1') ref = saved.ref;
          } catch (_) {}
        }
        if (!ref) ref = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
        const attempt = { key, scope, payload, ref, durable: false };
        if (fingerprint) {
          try {
            const record = JSON.stringify({ v: 1, scope, fingerprint, ref });
            capabilities.localStorage.setItem(key, record);
            attempt.durable = capabilities.localStorage.getItem(key) === record;
          } catch (_) {}
        }
        this.pendingSend = attempt;
        return attempt;
      },
      clearPendingSend(attempt = this.pendingSend) {
        const key = attempt ? attempt.key : this.sendKey();
        let retireDurably = !!attempt;
        if (attempt) this.retiredSendRefs.add(key + ':' + attempt.ref);
        try {
          const saved = JSON.parse(capabilities.localStorage.getItem(key) || 'null');
          if (saved && (attempt ? saved.ref === attempt.ref && saved.scope === attempt.scope
              : saved.scope === this.sendScope())) {
            // Tombstone first: if removeItem fails, a successful write still
            // prevents an acknowledged ref from being restored after navigation.
            try { capabilities.localStorage.setItem(key, 'null'); } catch (_) {}
            capabilities.localStorage.removeItem(key);
          }
          retireDurably = false;
        } catch (_) {}
        // If the shared slot cannot be read, do not overwrite a potentially
        // newer attempt. Retire ONLY the captured ref in its own small marker;
        // navigation can then reject the stale record once reads recover.
        if (retireDurably) {
          try { capabilities.localStorage.setItem(key + ':retired:' + attempt.ref, '1'); } catch (_) {}
        }
        if (!attempt || this.pendingSend === attempt) this.pendingSend = null;
      },
// extract:retry:end
    };
  }
  return Object.freeze({ create, retry });
});
