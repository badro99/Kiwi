
    /* Convert one immutable /api/feed row into the caisse journal shape. The
       feed only contains SETTLED sales: editable OrderPro / employee orders do
       not enter this path until /api/sale has accepted their final payment. */
    function cloudSaleJournalEntry(sale) {
      const origin = String(sale.origin || 'caisse').toLowerCase();
      const sourceLabel = origin === 'employee' ? 'App employé'
        : (origin === 'orderpro' ? 'OrderPro' : 'Caisse');
      const entry = {
        id: String(sale.id), serverSaleId: String(sale.id),
        amountCents: sale.amountCents, time: new Date(Number(sale.ts) || Date.now()),
        label: String(sale.orderRef || sale.label || 'Vente'), amount: money(sale.amount),
        method: String(sale.method || 'cash'), ref: String(sale.receiptRef || sale.ref || sale.id),
        /* /api/feed joint tip_cents (hors montant) : une vente pourboirée sur un
           autre poste gardait 0 de pourboire ici, au Z comme au tiroir. */
        tip: Number.isSafeInteger(Number(sale.tipCents)) && Number(sale.tipCents) > 0 ? Number(sale.tipCents) / 100 : 0,
        cashier: String(sale.server || sourceLabel),
        channel: String(sale.channel || ''), origin: origin,
      };
      if (Array.isArray(sale.lines) && sale.lines.length) {
        entry.lines = sale.lines.map((line) => ({
          name: String(line.name || 'Article'), baseName: String(line.baseName || ''),
          qty: Math.max(1, Number(line.qty) || 1),
          total: money(line.total), cat: String(line.cat || ''),
          itemId: String(line.itemId || ''),
          formulaChoices: Array.isArray(line.formulaChoices)
            ? line.formulaChoices.map(choice => ({
                name: String((choice && choice.name) || 'Choix'),
                qty: Math.max(1, +(choice && choice.qty) || 1),
                total: money(Math.max(0, +(choice && choice.total) || 0)),
              })) : [],
        }));
      }
      return entry;
    }

    function journalEntryMatchesCloudSale(entry, sale) {
      if (!entry || !sale) return false;
      const saleId = String(sale.id || sale.saleId || '');
      if (saleId && (String(entry.id || '') === saleId
        || String(entry.serverSaleId || '') === saleId)) return true;

      // Do not conflate different parts of a split bill
      const entryId = String(entry.id || '');
      const entryIsSplit = entryId.includes('-split-') || /·\s*part\s*\d+/i.test(String(entry.label || ''));
      const saleIsSplit = saleId.includes('-split-') || /·\s*part\s*\d+/i.test(String(sale.label || sale.orderRef || ''));
      if (entryIsSplit || saleIsSplit) {
        if (saleId && entryId && entryId !== saleId) return false;
        const entryPartMatch = String(entry.label || '').match(/·\s*part\s*(\d+)/i) || entryId.match(/-split-(\d+)/);
        const salePartMatch = String(sale.label || sale.orderRef || '').match(/·\s*part\s*(\d+)/i) || saleId.match(/-split-(\d+)/);
        if (entryPartMatch && salePartMatch && entryPartMatch[1] !== salePartMatch[1]) return false;
      }

      const saleOrderId = String(sale.orderId || '');
      if (saleOrderId && String(entry.orderId || '') === saleOrderId) return true;

      /* A caisse row uses `ref = 25` and `label = À emporter #25`; the feed
         deliberately exposes both the fiscal receipt ref (86) and the human
         order ref (À emporter #25). Comparing only entry.ref was the exact
         reason these pairs survived. Require same amount and a tight time
         window before using labels, so two genuine 35 MAD sales remain two. */
      if (money(entry.amount) !== money(sale.amount)) return false;
      const entryTs = +new Date(entry.time || 0);
      const saleTs = Number(sale.ts || 0);
      if (!entryTs || !saleTs || Math.abs(entryTs - saleTs) > 5000) return false;
      const localRefs = [entry.ref, entry.label].map((v) => String(v || '').trim()).filter(Boolean);
      const cloudRefs = [sale.receiptRef, sale.ref, sale.orderRef, sale.label]
        .map((v) => String(v || '').trim()).filter(Boolean);
      return localRefs.some((ref) => cloudRefs.includes(ref));
    }

    function reconcileCloudSaleInJournal(sale, meta) {
      const matches = [];
      journal.forEach((entry, index) => {
        if (journalEntryMatchesCloudSale(entry, sale)) matches.push(index);
      });
      if (!matches.length) return null;

      /* Prefer the locally captured row: it owns the frozen customer receipt,
         option detail and inventory metadata. Then remove every cloud echo of
         that exact payment from the open-service journal. This also repairs
         already persisted Pasta Corner pairs when the day sync replays them. */
      const keepIndex = matches.find((index) => !journal[index].origin) ?? matches[0];
      const keep = journal[keepIndex];
      keep.serverSaleId = String(sale.id || sale.saleId || keep.serverSaleId || '');
      if (keep.voided) {
        if (keep.voidConfirmed || keep.voidAuthority === 'ref' || keep.voidAt || keep.voidTs) {
          // A confirmed server void must NEVER be resurrected by an older active-sale feed response.
          // It can only be restored with explicit restoration evidence (e.g. sale.restored or post-void freshness).
          const isExplicitRestore = sale.restored === true
            || (sale.restoredTs && keep.voidTs && Number(sale.restoredTs) > Number(keep.voidTs));
          const hasPostVoidFreshness = Boolean(meta && meta.requestTime && keep.voidAt && (meta.requestTime > keep.voidAt)
            && !(window.KiwiLive && window.KiwiLive.voidedSaleIds && window.KiwiLive.voidedSaleIds().includes(keep.serverSaleId)));

          if (isExplicitRestore || hasPostVoidFreshness) {
            keep.voided = false;
            delete keep.voidConfirmed;
            delete keep.voidAuthority;
            delete keep.voidTs;
            delete keep.voidAt;
          }
        } else {
          // An ambiguous legacy local flag (voided: true without voidConfirmed):
          // A matching cloud sale arriving from D1 (where void_ts IS NULL) is authoritative receipt-level
          // evidence that this sale is currently active on the server.
          keep.voided = false;
          delete keep.voidConfirmed;
          delete keep.voidAuthority;
          delete keep.voidTs;
          delete keep.voidAt;
        }
      }
      if (!keep.orderId && sale.orderId) keep.orderId = String(sale.orderId);
      const permanentRef = String(sale.receiptRef || sale.ref || '').trim();
      if (permanentRef && (keep.channel === 'takeaway'
        || /^à emporter\b/i.test(String(keep.label || '')))) {
        keep.ref = permanentRef;
        keep.label = 'À emporter #' + permanentRef;
        /* Repair the frozen client copy too. This only runs after the exact
           amount/time/order match above, never from a guessed sequence. */
        attachReceipt(keep);
      }
      for (let i = matches.length - 1; i >= 0; i--) {
        const index = matches[i];
        if (index !== keepIndex) journal.splice(index, 1);
      }
      return keep;
    }

    function ingestSettledCloudSales(sales) {
      const meta = arguments[1];
      /* Never advance/drop the financial feed before a register exists. This
         was the parity bug: watchFeed started at DOMContentLoaded, called this
         branch while shiftOpenedAt was null, then advanced its cursor forever. */
      if (!(shiftOpenedAt instanceof Date) || isNaN(shiftOpenedAt.getTime())) return 0;
      let changed = false;
      (sales || []).forEach((sale) => {
        if (!sale || !(Number(sale.amount) > 0)) return;
        const sid = String(sale.id || sale.saleId || '');
        if (sid) activeCloudSaleIds.add(sid);
        /* The caisse journal is THIS service, not the commercial day. Closing
           the register freezes and clears it; reopening at 19:20 must start at
           0 even though Dashboard keeps the full day's ledger. Employee and
           OrderPro payments still enter when their settlement happened after
           this service opened. Importing the whole business day here made the
           freshly opened caisse resurrect every transaction from the Z that
           had just been printed. */
        const saleTs = Number(sale.ts || 0);
        if (!saleTs || saleTs < shiftOpenedAt.getTime()) return;
        if (reconcileCloudSaleInJournal(sale, meta)) { changed = true; return; } // reconcileCloudSaleInJournal(sale)
        const entry = cloudSaleJournalEntry(sale);
        attachReceipt(entry);
        window.KiwiTillTenant?.stamp(entry);
        journal.push(entry);
          /* Une addition réglée sur le téléphone d'un serveur est une vente du
             même commerce, sur le même stock. Ces lignes-là arrivent du serveur
             sans itemId · le moteur les repêche par nom de plat. L'identifiant
             de mouvement dérive de la référence du ticket : que la vente entre
             par le comptoir ou par le miroir, elle ne sort la marchandise
             qu'une fois. */
        try { window.KiwiInventoryConsumption?.record?.(entry); } catch (_) {}
        if (entry.channel === 'dining' || entry.channel === 'terrace'
          || String(entry.id).endsWith('-emp')) shift.tablesPaid++;
        changed = true;
      });
      if (!changed) return 0;
      /* Chronological journal = stable report, stable last-ticket action, and
         the same ordering after a reload no matter which device took payment. */
      journal.sort((a, b) => (+new Date(a.time) || 0) - (+new Date(b.time) || 0));
      try { persistShift(); } catch (_) {}
      try { saveProvisional(true); } catch (_) {}
      renderShiftStats();
      if ($('#journal-drawer').classList.contains('is-open')) renderJournal();
      refreshOpenReconciliationModals();
      return 1;
    }

    /* Reconcile this OPEN SERVICE before listening for deltas. Dashboard owns
       the complete commercial-day ledger; the till owns only its current Z. */
    function syncSettledBusinessDay() {
      const opts = arguments[0] || {};
      const timeoutMs = Math.max(250, Number(opts.timeoutMs) || 8000);
      if (!(shiftOpenedAt instanceof Date) || isNaN(shiftOpenedAt.getTime())) {
        return Promise.resolve({ ok: false, complete: false, count: 0, reason: 'service-not-open' });
      }
      const merchant = currentMerchantSlug();
      if (!merchant) return Promise.resolve({ ok: false, complete: false, count: 0, reason: 'merchant-unresolved' });
      const from = shiftOpenedAt.getTime();
      const requestTime = Date.now();
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      let timeoutId = null;
      const read = fetch('/api/feed?merchant=' + encodeURIComponent(merchant) + '&from=' + from, {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
        signal: controller ? controller.signal : undefined,
      }).then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data || !Array.isArray(data.sales)) return { ok: false, complete: false, count: 0, reason: 'feed-unavailable' };
          ingestSettledCloudSales(data.sales, { requestTime, responseTime: Date.now() });
          refreshOpenReconciliationModals();
          /* /api/feed?from= is bounded at 2,000 rows. Exactly that many rows
             means the remote aggregate may still be truncated; never certify
             such a Z as complete without an explicit continuation signal. */
          return { ok: true, complete: data.sales.length < 2000, count: data.sales.length,
            reason: data.sales.length < 2000 ? '' : 'feed-limit' };
        }).catch((error) => ({ ok: false, complete: false, count: 0,
          reason: error && error.name === 'AbortError' ? 'feed-timeout' : 'feed-error' }));
      const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          try { if (controller) controller.abort(); } catch (_) {}
          resolve({ ok: false, complete: false, count: 0, reason: 'feed-timeout' });
        }, timeoutMs);
      });
      return Promise.race([read, timeout]).then((result) => {
        if (timeoutId) clearTimeout(timeoutId);
        return result;
      });
    }

    function startEmployeeSaleJournalSync() {
      /* Opening/restoring the register is the start signal. Starting earlier
         consumes history without somewhere to persist it. */
      if (!(shiftOpenedAt instanceof Date) || isNaN(shiftOpenedAt.getTime())) return;
      if (!window.KiwiLive || !KiwiLive.watchFeed) return;
      const merchant = currentMerchantSlug();
      if (employeeSaleFeedStarted && employeeSaleFeedMerchant === merchant) {
        syncSettledBusinessDay();
        return;
      }
      employeeSaleFeedStarted = true;
      employeeSaleFeedMerchant = merchant;
      /* `watchFeed` starts at the merchant's first-ever row and pages forward.
         A busy restaurant could therefore wait minutes before today's OP sale
         appeared. Seed the journal from the bounded business-day endpoint,
         then keep the normal cursor feed for live updates. */
      syncSettledBusinessDay();
      KiwiLive.watchFeed(ingestSettledCloudSales);
    }   // { id, name, phone, ctx } · attaché à la note en cours
