    function heldSalesKey() {
      let slug = currentMerchantSlug();
      if (!slug) { try { slug = String(window.KiwiLive?.merchant?.() || ''); } catch (_) { slug = ''; } }
      return slug ? HELD_SALES_PREFIX + slug : '';
    }
    function heldSaleRows() {
      const key = heldSalesKey();
      if (!key) return [];
      if (heldSalesCache && heldSalesCache.key === key) return heldSalesCache.rows;
      let rows = [];
      try { const parsed = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(parsed)) rows = parsed; } catch (_) {}
      heldSalesCache = { key, rows: rows.filter(row => row && row.entry && row.entry.id) };
      /* The IndexedDB copy is the one that survived when localStorage was
         full. Fold it in once per merchant; ids make the union idempotent. */
      try {
        window.KiwiOffline?.getMeta?.(key).then((stored) => {
          if (!Array.isArray(stored) || !heldSalesCache || heldSalesCache.key !== key) return;
          let added = 0;
          stored.forEach((row) => {
            if (!row || !row.entry || !row.entry.id) return;
            if (heldSalesCache.rows.some(r => r.entry.id === row.entry.id)) return;
            heldSalesCache.rows.push(row); added++;
          });
          if (added) { adoptHeldSalesIntoJournal(); paintHeldSales(); retryHeldSales(); }
        });
      } catch (_) {}
      return heldSalesCache.rows;
    }
    /* Renvoie true si localStorage a pris l'écriture, sinon une promesse qui
       dit si IndexedDB l'a prise. false = la vente ne vit qu'en mémoire. */
    function saveHeldSales(rows) {
      const key = heldSalesKey();
      if (!key) return Promise.resolve(false);
      heldSalesCache = { key, rows };
      let local = false;
      try { if (rows.length) localStorage.setItem(key, JSON.stringify(rows)); else localStorage.removeItem(key); local = true; } catch (_) {}
      let idb = Promise.resolve(false);
      try {
        const put = window.KiwiOffline?.putMeta?.(key, rows);
        if (put && typeof put.then === 'function') idb = put.then(done => done === true, () => false);
      } catch (_) {}
      return local ? true : idb;
    }
    function holdSaleLocally(entry, reason) {
      entry.saleSyncPending = true;
      entry.saleSyncError = String(reason || 'sale-enqueue-failed').slice(0, 96);
      entry.saleHeldLocal = true;
      const rows = heldSaleRows().filter(row => row.entry.id !== entry.id);
      let copy = null;
      try { copy = JSON.parse(JSON.stringify(entry)); } catch (_) {}
      if (copy) rows.push({ entry: copy, shift: shiftOpenedAt ? shiftOpenedAt.toISOString() : '', at: Date.now() });
      const durable = saveHeldSales(rows);
      paintHeldSales();
      return durable;
    }
    function releaseHeldSale(id) {
      const rows = heldSaleRows();
      if (!rows.some(row => row.entry.id === id)) return;
      saveHeldSales(rows.filter(row => row.entry.id !== id));
      paintHeldSales();
    }
    /* The shift blob is the bigger write: when storage is full it fails too,
       and a reload would come back without the sale. A held row stamped with
       THIS shift is put back in the journal; one from a closed shift is only
       replayed to the queue, never counted into another day's Z. */
    function adoptHeldSalesIntoJournal() {
      if (!shiftOpenedAt) return 0;
      if (window.KiwiTillTenant?.mismatch()) return 0;
      const shift = shiftOpenedAt.toISOString();
      let adopted = 0;
      heldSaleRows().forEach((row) => {
        if (row.shift !== shift || journal.some(e => e && e.id === row.entry.id)) return;
        if (row.entry.merchant && shiftMerchant && row.entry.merchant !== shiftMerchant) return;
        try { journal.push(reviveJournalEntry(row.entry)); adopted++; } catch (_) {}
      });
      if (adopted) {
        try { persistShift(); } catch (_) {}
        try { renderShiftStats(); } catch (_) {}
      }
      return adopted;
    }
    function retryHeldSales() {
      if (!window.KiwiLive || !window.KiwiLive.postSale) return 0;
      /* Le service en mémoire est celui d'un autre commerce : postSale refuse
         de toute façon une vente qui n'est pas d'ici, on ne le sollicite pas. */
      if (window.KiwiTillTenant?.mismatch()) return 0;
      const rows = heldSaleRows();
      if (!rows.length) return 0;
      let sent = 0, journalChanged = false;
      const keep = rows.filter((row) => {
        const live = journal.find(e => e && e.id === row.entry.id);
        /* Voided on this till before it ever left: the void flow owns it. */
        if (live && live.voided) { delete live.saleHeldLocal; journalChanged = true; return false; }
        let posted = null;
        try { posted = window.KiwiLive.postSale(live || reviveJournalEntry(row.entry)); } catch (_) {}
        if (posted && posted.ok === true && posted.queued === true && posted.id) {
          if (live) {
            live.serverSaleId = posted.id;
            live.saleSyncPending = true;
            delete live.saleSyncError;
            delete live.saleHeldLocal;
            journalChanged = true;
          }
          sent++;
          return false;
        }
        return true;
      });
      if (keep.length !== rows.length) saveHeldSales(keep);
      if (journalChanged) { try { persistShift(); } catch (_) {} }
      paintHeldSales();
      return sent;
    }
    /* A second tap on a receipt already paid here is the moment to retry a
       held one, never a reason to book it again (recordSale). */
    function retryHeldSalesSafely() {
      try { retryHeldSales(); } catch (_) {}
    }
    function paintHeldSales() {
      try { window.dispatchEvent(new CustomEvent('kiwi:held-sales', { detail: { count: heldSaleRows().length } })); } catch (_) {}
    }
    /* A sale recorded and handed to the queue is confirmed; one that only
       reached this till's journal is not. The success haptic waits for the
       first. With Live Link off (demo) there is no queue to confirm. */
    function saleRecordConfirmed(entry) {
      return !!entry && !entry.saleHeldLocal;
    }
    /* `durable` : ce que holdSaleLocally() a renvoyé. Si ni localStorage ni
       IndexedDB n'ont pris la vente et que la file l'a refusée, elle ne vit
       qu'en mémoire : dire « enregistrée » serait faux (rechargement = perdue). */
    function warnSaleHeld(durable) {
      const recorded = () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Vente enregistrée sur cette caisse · envoi en attente, ne pas encaisser à nouveau'), 6000, 'warn');
      if (durable === true || durable === undefined) { recorded(); return; }
      Promise.resolve(durable).then((saved) => {
        if (saved) recorded();
        else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Vente NON sauvegardée : stockage de la caisse plein et serveur injoignable. Ne rechargez pas la page ni ne fermez la caisse, notez le ticket. Ne pas encaisser à nouveau.'), 15000, 'warn');
      }, recorded);
    }
