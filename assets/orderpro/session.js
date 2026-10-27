/* OrderPro session. Exports: rebuildSent, saveSent, loadSent, clearSent, SESSION.
 * Reads/writes only the declared live scope below; browser capabilities are checked by orderpro-boundary-test.
 * Classic lexical adapter intentionally preserves original function bodies, including assignments. */
KiwiOrderMenu.orderProParts.define('session', ["LIVE","NET","bootState","cart","currentOrderId","gotoScreen","onSessionClosed","sentKey","sentLines","sentOrders","sessionTotal","showToast","t","toCents"], function (scope) {
  with (scope) {
    function rebuildSent() {
      sentLines.length = 0;
      let c = 0;
      for (const o of sentOrders) {
        if (o.status === 'rejected') continue;
        for (const l of o.lines) sentLines.push(l);
        c += toCents(o.total);
      }
      sessionTotal = c / 100;
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.refreshStatus();
    }

    function saveSent() {
      if (!SESSION.id) return;
      try {
        if (sentOrders.length) localStorage.setItem(sentKey(SESSION.id), JSON.stringify(sentOrders));
        else localStorage.removeItem(sentKey(SESSION.id));
      } catch (_) {}
    }

    function loadSent(sessionId) {
      sentOrders = [];
      try {
        const prefix = 'kiwi-op-sent:' + NET.slug + ':';
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix) && k !== sentKey(sessionId)) localStorage.removeItem(k);
        }
        const saved = JSON.parse(localStorage.getItem(sentKey(sessionId)) || '[]');
        if (Array.isArray(saved)) {
          sentOrders = saved.filter(o => o && typeof o.id === 'string' && Array.isArray(o.lines));
        }
      } catch (_) {}
      rebuildSent();
    }

    function clearSent() {
      const id = SESSION.id;
      sentOrders = [];
      rebuildSent();
      if (id) { try { localStorage.removeItem(sentKey(id)); } catch (_) {} }
    }

    const SESSION = {
      id: '', mode: '', table: '', closed: false, closedBy: '',
      pendingSend: null,
      retiredSendRefs: new Set(),
      sendKey() { return 'kiwi-op-send:' + NET.slug; },
      sendScope() { return JSON.stringify([NET.slug, this.id, this.mode, String(this.table || '')]); },
      async prepareSend(lines) {
        const key = this.sendKey(), scope = this.sendScope(), payload = JSON.stringify(lines);
        const previous = this.pendingSend;
        let fingerprint = '';
        try {
          const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
          fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) { /* unavailable storage/crypto permits only an in-page retry */ }
        let ref = previous && previous.scope === scope && previous.payload === payload
          && !this.retiredSendRefs.has(key + ':' + previous.ref) ? previous.ref : '';
        if (!ref && fingerprint) {
          try {
            const saved = JSON.parse(localStorage.getItem(key) || 'null');
            if (saved && saved.v === 1 && saved.scope === scope && saved.fingerprint === fingerprint
                && /^r[A-Za-z0-9_-]{6,40}$/.test(saved.ref || '')
                && !this.retiredSendRefs.has(key + ':' + saved.ref)
                && localStorage.getItem(key + ':retired:' + saved.ref) !== '1') ref = saved.ref;
          } catch (_) {}
        }
        if (!ref) ref = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
        const attempt = { key, scope, payload, ref, durable: false };
        if (fingerprint) {
          try {
            const record = JSON.stringify({ v: 1, scope, fingerprint, ref });
            localStorage.setItem(key, record);
            attempt.durable = localStorage.getItem(key) === record;
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
          const saved = JSON.parse(localStorage.getItem(key) || 'null');
          if (saved && (attempt ? saved.ref === attempt.ref && saved.scope === attempt.scope
              : saved.scope === this.sendScope())) {
            // Tombstone first: if removeItem fails, a successful write still
            // prevents an acknowledged ref from being restored after navigation.
            try { localStorage.setItem(key, 'null'); } catch (_) {}
            localStorage.removeItem(key);
          }
          retireDurably = false;
        } catch (_) {}
        // If the shared slot cannot be read, do not overwrite a potentially
        // newer attempt. Retire ONLY the captured ref in its own small marker;
        // navigation can then reject the stale record once reads recover.
        if (retireDurably) {
          try { localStorage.setItem(key + ':retired:' + attempt.ref, '1'); } catch (_) {}
        }
        if (!attempt || this.pendingSend === attempt) this.pendingSend = null;
      },
      _key() { return 'kiwi-op-ses:' + NET.slug; },
      _read() {
        try { return JSON.parse(localStorage.getItem(this._key()) || 'null') || null; }
        catch (_) { return null; }
      },
      _write(v) {
        try {
          if (v) localStorage.setItem(this._key(), JSON.stringify(v));
          else localStorage.removeItem(this._key());
        } catch (_) {}
      },
      /* Une addition réglée à l'instant, sur CETTE table. */
      recentlySettled(mode, table, allowReorder = false) {
        if (allowReorder) return false;
        if (cart && cart.size > 0) return false;
        // A counter tag starts a new takeaway purchase each time it is tapped.
        // Keeping its previous closed session here made the promised NFC retry
        // reopen the thank-you screen for 30 minutes instead of the menu.
        if (mode === 'takeout') return false;
        const s = this._read();
        if (!s || !s.closedAt) return false;
        // Seule une vraie addition encaissée en caisse (settle) empêche la réouverture immédiate.
        // Une table annulée sans encaissement ou expirée ne doit pas bloquer le client.
        if (s.closedBy && s.closedBy !== 'settle') return false;
        if (s.hadOrder === false) return false;
        if (s.mode !== mode || String(s.table || '') !== String(table || '')) return false;
        return (Date.now() - s.closedAt) < 30 * 60 * 1000;
      },
      async open(mode, table) {
        if (this.id && this.mode === mode && String(this.table) === String(table || '')) return true;
        const res = await NET.openSession(mode, table);
        if (!res || !res.ok) {
          /* On n'invente rien : « le service n'est pas ouvert » est une réponse
             vraie et utile, et bien meilleure qu'une carte qu'on laisse
             parcourir avant de refuser la commande à la fin.
             Le refus peut tomber depuis le pavé numérique aussi bien qu'au
             démarrage : il faut donc REVENIR sur l'écran d'accueil, sinon le
             message s'écrirait dans un écran que personne ne regarde. */
          const err = res && res.error;
          if (err === 'service-closed' || err === 'orderpro-off') {
            gotoScreen('screen-boot');
            bootState(err === 'service-closed' ? 'closed' : 'off',
              { icon: err === 'service-closed' ? 'moon' : 'power-off' });
          } else {
            showToast(t('order_offline'));
          }
          return false;
        }
        this.id = res.session; this.mode = res.mode; this.table = res.table || '';
        this.closed = false; this.closedBy = '';
        this._write({ id: this.id, mode: this.mode, table: this.table });
        if (this.mode === 'table') loadSent(this.id);
        LIVE.start();
        return true;
      },
      markClosed(why) {
        if (this.closed) return;
        this.clearPendingSend();
        this.closed = true; this.closedBy = why || '';
        this._write({ closedBy: this.closedBy, id: this.id, mode: this.mode, table: this.table, closedAt: Date.now(), hadOrder: !!currentOrderId || (Array.isArray(sentLines) && sentLines.length > 0) });
        clearSent();
        onSessionClosed();
      },
    };


    return Object.freeze({ rebuildSent, saveSent, loadSent, clearSent, SESSION });
  }
});

/* One private state owner, with named methods and capability-limited views. */
KiwiOrderMenu.orderProParts.owner = function () {
  const values = Object.create(null);
  const initialize = (name, value) => {
    if (Object.hasOwn(values, name)) throw new Error('Duplicate OrderPro state: ' + name);
    values[name] = value;
  };
  const read = name => {
    if (!Object.hasOwn(values, name)) throw new ReferenceError(name + ' is not initialized');
    return values[name];
  };
  const write = (name, value) => { read(name); values[name] = value; return value; };
  const view = names => Object.defineProperties(Object.create(null), Object.fromEntries(names.map(name => [name, {
    enumerable: true, get: () => read(name), set: value => write(name, value),
  }])));
  return Object.freeze({ initialize, read, write, view });
};
