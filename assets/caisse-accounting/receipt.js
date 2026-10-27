
    /* Real store identity, resolved from the 6-digit pairing (kiwiPairedVenue =
     * {name,location,…}) or a hosted session. A real store prints ITS OWN name +
     * city and NO legal ICE/phone (we don't hold them) · never the "Café Atlas"
     * demo. The local demo (unpaired localhost) is unchanged. */
    function storePaired() {
      try {
        if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedVenue === 'function') {
          var pv = window.KiwiPlatform.pairedVenue();
          if (pv) return pv;
        }
      } catch (_) {}
      try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; }
    }
    function storeIsReal() { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!storePaired(); } catch (_) { return !!storePaired(); } }
    function storeName()   { const p = storePaired(); return (p && p.name) || (storeIsReal() ? '' : 'Café Atlas'); }
    function storeCity()   { const p = storePaired(); return (p && p.location) || (storeIsReal() ? '' : 'Maarif · Casablanca'); }

    /* ══════════ LE REÇU · celui du propriétaire, pas celui de la caisse ══════
     * La caisse ne compose plus de ticket. Elle demande à window.KiwiReceipt le
     * reçu que le propriétaire a réglé sur son tableau de bord : son enseigne,
     * son adresse, SON ICE (que ce fichier n'avait aucun moyen de connaître ·
     * il imprimait un ICE de démonstration, masqué chez un vrai client, donc
     * aucune mention légale du tout), ses messages, sa largeur de rouleau.
     *
     * La DÉMO garde son identité de démonstration, fournie explicitement : sans
     * établissement réel il n'y a aucune fiche à lire, et un ticket de démo
     * anonyme ne montre plus rien de ce qu'il est censé montrer. */
    function demoIdentity() {
      return {
        business: { name: 'Café Atlas', legal: { address: 'Maarif · Casablanca', ice: RECEIPT_ICE, phone: RECEIPT_PHONE } },
        /* La TVA restauration à 10 %, telle que la démo l'a toujours affichée.
           Un VRAI commerce ne l'a pas d'office : il la règle, ou son ticket
           n'affiche pas de ventilation (voir assets/receipt.js · vat.mode). */
        config: Object.assign(window.KiwiReceipt.blankConfig(), { vat: { mode: 'rate', rate: 10, included: true } }),
      };
    }
    /* Traduit une écriture du journal en vente lisible par KiwiReceipt. */
    function receiptSaleFrom(entry) {
      const isRefund = entry.kind === 'refund';
      return {
        ref: entry.ref,
        ts: entry.time instanceof Date ? entry.time.getTime() : new Date(entry.time).getTime(),
        label: entry.label,
        cashier: entry.cashier || (currentCashier && currentCashier.name) || '',
        lines: Array.isArray(entry.lines) ? entry.lines : [],
        total: Math.abs(entry.amount),
        tip: isRefund ? 0 : (entry.tip || 0),
        method: entry.method,
        kind: isRefund ? 'refund' : 'sale',
        of: entry.refundOf || '',
        reason: entry.reason || '',
      };
    }
    function receiptOpts(extra) {
      const o = Object.assign({}, extra || {});
      if (!storeIsReal()) Object.assign(o, demoIdentity());
      return o;
    }
    /* Figer le ticket avec la vente. Ne jette jamais : un encaissement réussi ne
       peut pas échouer parce que le reçu n'a pas pu se composer. */
    function attachReceipt(entry) {
      try {
        const K = window.KiwiReceipt;
        if (!K) return;
        entry.rc = K.snapshot(K.build(receiptSaleFrom(entry), receiptOpts()));
      } catch (_) {}
    }
    function reconcileReceiptOrderNumber(order, entry) {
      if (!order || order.opNum == null) return entry || null;
      const orderId = String(order.opId || '');
      const row = entry || (orderId ? journal.find(candidate =>
        candidate && String(candidate.orderId || '') === orderId) : null);
      if (!row) return null;
      const canonical = ticketNo(order);
      if (!canonical || String(row.ref || '') === String(canonical)) return row;
      row.ref = canonical;
      /* The snapshot is intentionally immutable for business details, but the
         temporary order counter is not a legal receipt identity. Rebuild only
         at this allocation boundary so every customer output uses the same
         permanent number already shown by Caisse and kitchen. */
      attachReceipt(row);
      /* The first mirror may have reached D1 during the old race. Replaying the
         same immutable sale id is idempotent; /api/sale updates only its human
         reference, so Dashboard is repaired without adding a transaction. */
      try { window.KiwiLive?.postSale?.(row); } catch (_) {}
      try { persistShift(); } catch (_) {}
      return row;
    }
    /* Rouvrir le ticket d'une écriture : le figé s'il existe (c'est LE ticket du
       client, mentions de l'époque comprises), sinon un rendu à partir de ce que
       le journal porte · le cas des ventes d'avant cette version. */
    function receiptDocFor(entry, opts) {
      const K = window.KiwiReceipt;
      if (!K) return null;
      opts = receiptOpts(opts);
      try {
        /* Also heals a receipt restored from storage if the permanent number
           arrived just before a reload but the final persistence lost the
           race. This is global restaurant logic, independent of merchant. */
        if (entry && entry.orderId) {
          const order = opTickets.get(String(entry.orderId)) || kdsOrders.find(candidate =>
            candidate && String(candidate.opId || '') === String(entry.orderId));
          if (order) reconcileReceiptOrderNumber(order, entry);
        }
        if (entry && entry.rc) return K.fromSnapshot(entry.rc, opts);
        return K.build(receiptSaleFrom(entry), opts);
      } catch (_) { return null; }
    }
    /* ── IMPRIMER LE TICKET DE LA VENTE QU'ON VIENT D'ENCAISSER ──────────────
     * Les boutons « Imprimer ticket » des modaux carte et espèces disaient
     * « Ticket en impression… » et ne faisaient rien : le client tendait la
     * main, le caissier regardait l'imprimante, rien ne sortait. C'est le pire
     * mensonge qu'une caisse puisse faire, et le même que #receipt-print a déjà
     * corrigé · on réutilise sa mécanique telle quelle.
     *
     * La vente visée est `lastSaleId`, posée par recordSale() : on ne refouille
     * pas le journal par montant, sinon une note partagée en deux imprimerait
     * deux fois la même moitié.
     *
     * KiwiReceipt.print() ne jette jamais et se rabat sur la boîte d'impression
     * du système quand aucune imprimante ESC/POS n'est jointe · c'est ce qui
     * fait qu'un restaurant équipé d'une imprimante Windows sort enfin du
     * papier. Et quand rien ne sort, on le dit. */
    function lastSaleEntry() {
      if (!lastSaleId) return null;
      try { return journal.find(en => en.id === lastSaleId) || null; } catch (_) { return null; }
    }
    function printSaleTicket(entry, opts) {
      if (!entry) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucun ticket à imprimer')); return; }
      const doc = receiptDocFor(entry, opts);
      if (!doc) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression indisponible sur cet appareil')); return; }
      const queue = window.KiwiKitchenPrint;
      if (queue && typeof queue.enqueueReceipt === 'function') {
        const queued = queue.enqueueReceipt(entry.id, doc, opts && opts.copy ? 'manual-reprint' : 'original');
        if (queued && queued.accepted) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ticket ajouté à la file d’impression'));
        else if (queued && queued.pending) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ticket déjà en attente d’impression'));
        else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ticket déjà imprimé'));
        return;
      }
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression du ticket…'));
      Promise.resolve(window.KiwiReceipt.print(doc)).then(
        (r) => toast(r && r.ok ? ticketPrintedWord(r) : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression échouée · vérifiez l\'imprimante')),
        () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression échouée · vérifiez l\'imprimante'))
      );
    }
    /* Dire PAR OÙ c'est sorti. Un caissier qui voit « Ticket imprimé » alors que
       la boîte d'impression du système vient de s'ouvrir croit à une panne. */
    function ticketPrintedWord(r) {
      const via = r && r.via;
      /* Un dialogue d'impression ouvert n'est pas un ticket imprimé. */
      if (via === 'browser') return 'Ticket ouvert dans l\'impression système';
      if (via === 'pdf') return 'Ticket prêt · imprimer ou partager le PDF';
      if (via === 'bluetooth') return 'Ticket imprimé · Bluetooth';
      if (via === 'usb') return 'Ticket imprimé · USB';
      if (via === 'network') return 'Ticket imprimé · réseau';
      return 'Ticket imprimé';
    }
    /* Le coup de pied du tiroir-caisse. Silencieux : sans imprimante jointe il
       n'y a pas de tiroir à ouvrir, et un caissier qui encaisse en espèces n'a
       pas besoin qu'on le lui rappelle à chaque vente. */
    function openCashDrawer() {
      try {
        const H = window.KiwiHardware;
        if (H && H.openDrawer) Promise.resolve(H.openDrawer()).catch(() => {});
      } catch (_) {}
    }
    /* Envoyer le ticket au client. « Envoyé · SMS / WhatsApp » n'envoyait rien.
       On ouvre un vrai brouillon WhatsApp, que le caissier valide · même geste
       que la boutique. Sans numéro connu, wa.me ouvre le sélecteur de contact. */
    function sendSaleTicket(entry) {
      if (!entry) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucun ticket à envoyer')); return; }
      const doc = receiptDocFor(entry, {});
      let txt = '';
      try { txt = (doc && window.KiwiReceipt && window.KiwiReceipt.text) ? window.KiwiReceipt.text(doc) : ''; } catch (_) {}
      if (!txt) {
        txt = [storeName(), '', 'Ticket ' + (entry.ref || ''), fmtMAD(Math.abs(entry.amount)), 'Merci !']
          .filter(Boolean).join('\n');
      }
      try {
        window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Brouillon WhatsApp ouvert'));
      } catch (_) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Envoi indisponible sur cet appareil')); }
    }

    /* Patch the static header labels (top bar, clock-in card, floor-plan) so a real
     * paired store shows ITS name/city · never "Café Atlas · Maarif" or "DÉMO LIVE".
     * No-op for the local demo. Runs on load; re-run after clock-in if needed. */
    function applyStoreIdentity() {
      if (!storeIsReal()) return;
      const nm = storeName() || 'Ma caisse', city = storeCity();
      const top = document.getElementById('topbar-store'); if (top) top.textContent = [nm, city].filter(Boolean).join(' · ');
      const sub = document.getElementById('greet-sub');   if (sub) sub.textContent = nm + ' · service ouvert';
      const role = document.querySelector('.clockin-role'); if (role) role.textContent = 'Caissier · ' + nm;
      const foot = document.querySelector('.clockin-foot'); if (foot) foot.textContent = city || nm;
      document.querySelectorAll('.plan-room-label').forEach((el) => {
        const em = el.querySelector('em'); el.textContent = nm + ' '; if (em) el.appendChild(em);
      });
      // STAFF · never show the demo cashiers (Othmane N., Yassine M.…) on a real
      // store. Use operator-set staff (KiwiConfig.pins) when present, else a plain
      // "Caissier". Also drops the demo roster so handover only lists real staff.
      let staff = null;
      try { const p = window.KiwiConfig && window.KiwiConfig.pins; if (Array.isArray(p) && p.length) staff = p; } catch (_) {}
      // WHO unlocked this till · the staff code they entered identifies them
      // (assets/caisse-pairing.js → window.KiwiStaff). Falling back to staff[0]
      // meant the register greeted the first name on the roster, printed it on
      // tickets and filed the shift under it, whoever had actually signed in.
      const me = window.KiwiStaff || null;
      const cashName = (me && me.name) || (staff && staff[0] && staff[0].name) || 'Caissier';
      const cashRole = (me && me.role) || (staff && staff[0] && staff[0].role) || 'Caissier';
      currentCashier = { id: String((me && me.id) || 'me'), name: cashName, role: cashRole };
      if (Array.isArray(CASHIER_ROSTER)) {
        CASHIER_ROSTER.length = 0;
        (staff || []).forEach((s, i) => CASHIER_ROSTER.push({ id: 'staff' + i, name: s.name || 'Caissier', role: s.role || 'Caissier' }));
        /* La passation exclut le caissier sortant par son IDENTIFIANT. Sur un vrai
           magasin, le roster est reconstruit en 'staff0..N' alors que le caissier
           en poste garde l'id fictif 'me' : il se retrouvait donc proposé comme
           caissier ENTRANT de sa propre passation, et on pouvait se passer la
           caisse à soi-même jusqu'au Rapport Z. On l'aligne sur sa ligne du
           roster (le code d'accès nous a donné son nom). */
        const mine = CASHIER_ROSTER.find((c) => c.name === cashName);
        if (mine) currentCashier.id = mine.id;
      }
      const first = String(cashName).trim().split(/\s+/)[0] || 'Caissier';
      const g1 = document.getElementById('greet-line1'); if (g1) g1.textContent = 'Bonjour ' + first + ',';
      const wb = document.getElementById('wb-line1');    if (wb) wb.textContent = 'Bonjour ' + first;
      const cn = document.querySelector('.cashier-name'); if (cn) cn.textContent = cashName;
      const setGreet = (sel, tag) => document.querySelectorAll(sel).forEach((el) => {
        el.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Bonjour') + (tag ? ' ' : ', ');
        const m = document.createElement(tag || 'b'); m.textContent = first; el.appendChild(m);
      });
      setGreet('.pin-greet', ''); setGreet('.clockin-greet', 'em');
      // Floor team (Équipe drawer + plan server badges) · rebuilt from the real
      // roster. Empty roster → empty drawer, no invented staff or shift timers.
      rebuildRealRoster();
      // Welcome-screen demo stats (static "53 transactions", "11 tables ka-yaklo")
      // → a real store opens empty. Recompute from the (empty) ledger + blank the
      // mid-service subtitle. The demo path never reaches here (storeIsReal false).
      const wb2 = document.getElementById('wb-line2'); if (wb2) wb2.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ouverture de service');
      const tx = document.getElementById('stat-txns'); if (tx) tx.textContent = '0';
      const txd = document.getElementById('stat-txns-delta'); if (txd) txd.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Carte 0% · Cash 0%');
      /* Les remises d'amorçage (95 MAD, 2 remises) sont du décor de démo. Sur un
         vrai commerce elles se retrouvaient dans le Z et dans le rapport du
         patron comme si quelqu'un les avait vraiment accordées.
         Mais cette fonction rejoue aussi à la saisie du code (`kiwi-staff`), APRÈS
         qu'un service en cours a été relu : remettre à zéro à ce moment-là effaçait
         les remises et les autorisations manager déjà accordées, donc le Z de
         fin de service affichait « Réductions accordées 0 » après un simple
         rechargement de la caisse. On ne purge que le décor, jamais un service ouvert. */
      if (!shiftOpenedAt) { shift.discounts = 0; shift.discountsCount = 0; shift.cancels = 0; }
      try { if (typeof renderShiftStats === 'function') renderShiftStats(); } catch (_) {}
      // Static demo defaults inside modals (server-row, message-target, and the
      // clôture card "Café Atlas · Othmane N.") · shown before their render fns
      // run. Neutralize to the real store / generic staff.
      const rpsn = document.getElementById('rp-server-name'); if (rpsn) rpsn.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Serveur');
      const mtn  = document.getElementById('msg-target-name'); if (mtn) mtn.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Serveur');
      const clo  = document.getElementById('clo-meta');
      if (clo) clo.textContent = (storeName() || '') + ' · ' + (currentCashier && currentCashier.name || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Caissier'));
    }

    /* Render a journal entry as a printed thermal ticket.
     * Le reçu à l'écran est LE reçu : même moteur, même mise en page, mêmes
     * mentions que celui qui sort de l'imprimante. Avant, cet écran avait sa
     * propre composition · d'où une « TVA 10 % » posée sur toutes les ventes, y
     * compris dans une boutique où elle est de 20 %, et un pied de page que le
     * papier ne portait pas. Le chemin d'avant reste en secours pour un
     * navigateur où assets/receipt.js n'a pas chargé. */
    function renderReceipt(entry) {
      const paper = $('#receipt-paper');
      const body  = $('#receipt-body');
      if (!entry || !paper || !body) return;

      const isRefund = entry.kind === 'refund';
      paper.classList.toggle('is-refund', isRefund);

      const doc = receiptDocFor(entry);
      if (doc) {
        try { window.KiwiReceipt.ensureCSS(); } catch (_) {}
        body.innerHTML = window.KiwiReceipt.html(doc);
        const tk = body.querySelector('.kr-ticket');
        if (tk && (doc.paper === '58' || doc.paper === '57')) tk.classList.add('kr-w58');
        return;
      }

      const d   = entry.time instanceof Date ? entry.time : new Date(entry.time);
      const dd  = String(d.getDate()).padStart(2, '0');
      const mo  = String(d.getMonth() + 1).padStart(2, '0');
      const yy  = d.getFullYear();
      const hh  = String(d.getHours()).padStart(2, '0');
      const mi  = String(d.getMinutes()).padStart(2, '0');

      /* amount is signed for refunds · work off the magnitude for TVA math. */
      const gross = Math.abs(entry.amount);
      const ht    = Math.floor((Math.round(gross * 100) * 100 + 55) / 110) / 100;  /* TVA 10 %, arrondie au centime. */
      const tva   = gross - ht;
      const tip   = !isRefund && entry.tip > 0 ? entry.tip : 0;
      const sign  = isRefund ? '− ' : '';  /* minus sign */

      /* line items · itemised if entry.lines present, else summary fallback. */
      let itemsHTML;
      if (Array.isArray(entry.lines) && entry.lines.length) {
        itemsHTML = entry.lines.map(l => {
          const qty = l.qty || 1;
          return `<div class="rct-line">`
               +   `<span class="rct-line-qty">${qty}×</span>`
               +   `<span class="rct-line-name">${escTeam(l.name)}</span>`
               +   `<span class="rct-line-dots" aria-hidden="true"></span>`
               +   `<span class="rct-line-total">${sign}${fmtMAD(Math.abs(l.total))}</span>`
               + `</div>`;
        }).join('');
      } else {
        itemsHTML = `<div class="rct-line">`
                  +   `<span class="rct-line-qty">1×</span>`
                  +   `<span class="rct-line-name">Commande</span>`
                  +   `<span class="rct-line-dots" aria-hidden="true"></span>`
                  +   `<span class="rct-line-total">${sign}${fmtMAD(gross)}</span>`
                  + `</div>`;
      }

      const totalPaye = gross + tip;
      let totalsHTML =
          `<div class="rct-tot"><span class="rct-tot-k">Total HT</span>`
        +   `<span class="rct-tot-v">${sign}${fmtMAD(ht)}</span></div>`
        + `<div class="rct-tot"><span class="rct-tot-k">TVA 10 %</span>`
        +   `<span class="rct-tot-v">${sign}${fmtMAD(tva)}</span></div>`
        + `<div class="rct-tot"><span class="rct-tot-k">Total TTC</span>`
        +   `<span class="rct-tot-v">${sign}${fmtMAD(gross)}</span></div>`;
      if (tip > 0) {
        totalsHTML +=
            `<div class="rct-tot"><span class="rct-tot-k">Pourboire</span>`
          +   `<span class="rct-tot-v">${fmtMAD(tip)}</span></div>`;
      }
      totalsHTML +=
          `<div class="rct-tot rct-grand">`
        +   `<span class="rct-tot-k">${isRefund ? 'TOTAL REMBOURSÉ' : 'TOTAL PAYÉ'}</span>`
        +   `<span class="rct-tot-v">${sign}${fmtMAD(totalPaye)}</span></div>`;

      const payLabel = entry.method === 'cash'
        ? (isRefund ? 'Remboursé en espèces' : 'Réglé en espèces')
        : (isRefund ? 'Remboursé sur carte'  : 'Réglé par carte');
      const payIcon  = entry.method === 'cash' ? 'banknote' : 'credit-card';

      /* faux barcode · 38 bars, widths vary purely via CSS nth-child. */
      const bars = '<span></span>'.repeat(38);

      body.innerHTML =
          `<div class="rct-head">`
        +   `<div class="rct-logo">${escTeam(storeName())}<i aria-hidden="true"></i></div>`
        +   (storeCity() ? `<div class="rct-sub">${escTeam(storeCity())}</div>` : '')
        +   (storeIsReal() ? '' : `<div class="rct-sub rct-tiny">ICE ${RECEIPT_ICE}</div>`)
        +   (storeIsReal() ? '' : `<div class="rct-sub rct-tiny">${RECEIPT_PHONE}</div>`)
        + `</div>`
        + (isRefund ? `<div class="rct-refund-banner">REMBOURSEMENT</div>` : '')
        + `<hr class="rct-rule" />`
        + `<div class="rct-row"><span class="rct-k">Date</span>`
        +   `<span class="rct-v">${dd}/${mo}/${yy}</span></div>`
        + `<div class="rct-row"><span class="rct-k">Heure</span>`
        +   `<span class="rct-v">${hh}:${mi}</span></div>`
        + `<div class="rct-row"><span class="rct-k">N° ticket</span>`
        +   `<span class="rct-v">${escTeam(entry.ref)}</span></div>`
        + `<div class="rct-row"><span class="rct-k">${isRefund ? 'Origine' : 'Service'}</span>`
        +   `<span class="rct-v">${escTeam(entry.label)}</span></div>`
        + `<div class="rct-row"><span class="rct-k">Caissier</span>`
        +   `<span class="rct-v">${escTeam(entry.cashier || currentCashier.name)}</span></div>`
        + `<div class="rct-dash" aria-hidden="true">${'· '.repeat(28)}</div>`
        + itemsHTML
        + `<hr class="rct-rule" />`
        + totalsHTML
        + `<div class="rct-paid"><i data-lucide="${payIcon}"></i>${payLabel}</div>`
        + `<div class="rct-dash" aria-hidden="true">${'· '.repeat(28)}</div>`
        + `<div class="rct-thanks">`
        +   (isRefund
              ? `Sma7 lina · merci d'votre compréhension`
              : `Bsa7tkom · à bientôt chez <b>${storeName()}</b>`)
        + `</div>`
        + `<div class="rct-barcode" aria-hidden="true">${bars}</div>`
        + `<div class="rct-barcode-num">${entry.ref}</div>`;

      if (window.lucide) lucide.createIcons();
    }
    function openReceipt(entry) {
      if (!entry) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ticket introuvable')); return; }
      receiptEntry = entry;
      renderReceipt(entry);
      $('#receipt-modal').classList.add('is-open');
      $('#receipt-body').scrollTop = 0;
    }
    function closeReceipt() { $('#receipt-modal').classList.remove('is-open'); }
