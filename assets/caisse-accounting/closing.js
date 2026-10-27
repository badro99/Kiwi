    function updateEcart() {
      const line = $('#clo-ecart-line'), out = $('#clo-ecart'), inp = $('#clo-count');
      if (!line || !out) return;
      line.classList.remove('is-ok', 'is-off');
      const raw = inp ? inp.value : '';
      if (raw === '' || raw == null) { out.textContent = '·'; return; }
      const counted = money(parseFloat(raw) || 0);
      const ecart = major(minor(counted) - minor(clotureExpected));
      const sign  = ecart > 0 ? '+ ' : (ecart < 0 ? '− ' : '');
      out.textContent = sign + fmtMAD(Math.abs(ecart));
      line.classList.add(Math.abs(ecart) <= 5 ? 'is-ok' : 'is-off');
    }
    function updateCardEcart() {
      const line = $('#clo-card-ecart-line'), out = $('#clo-card-ecart'), inp = $('#clo-card-z');
      if (!line || !out) return;
      line.classList.remove('is-ok', 'is-off');
      const raw = inp ? String(inp.value || '').trim() : '';
      if (!raw) { out.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('À saisir'); return; }
      const terminal = Number(raw);
      if (!Number.isFinite(terminal) || terminal < 0 ||
          Math.abs(terminal * 100 - Math.round(terminal * 100)) > 0.000001) {
        out.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Montant invalide');
        line.classList.add('is-off');
        return;
      }
      const gap = major(minor(terminal) - minor(clotureCardExpected));
      if (gap === 0) {
        out.textContent = 'Rapproché · ' + fmtMAD(0);
        line.classList.add('is-ok');
      } else if (gap > 0) {
        out.textContent = 'Terminal + ' + fmtMAD(gap);
        line.classList.add('is-off');
      } else {
        out.textContent = 'Kiwi + ' + fmtMAD(Math.abs(gap));
        line.classList.add('is-off');
      }
    }
    function openCloture() {
      /* #0164 · a recorded close never reopens its own count sheet. */
      if (registerClosed) { finishClose(); return; }
      if (tillKitOpenCount()) return;   // kiwiSkin2027:till, étape 4 (7)
      renderCloture(false);
      /* Dans la langue de la caisse AVANT de s'afficher : le balayage différé
         laissait passer une image en français. */
      try { window.KiwiCaisseLang?.apply?.($('#cloture-modal')); } catch (_) {}
      $('#cloture-modal').classList.add('is-open');
      if (window.lucide) lucide.createIcons();
    }
    /* ── UNE ADDITION OUVERTE NE TRAVERSE PAS LA CLÔTURE EN SILENCE ──────────
       Vu en production le 14 octobre : quatre commandes envoyées en cuisine
       pour la table 2 (131 MAD), jamais encaissées, et la caisse fermée le
       soir même. La clôture efface le poste (clearPersistedShift) avec les
       additions qu'il contient, et le serveur ne renvoie plus une commande
       acceptée au-delà de six heures (KITCHEN_TTL_MS) : le lendemain, la
       table 2 paraissait occupée mais vide, le caissier l'a remise à zéro, et
       131 MAD de repas servis sont sortis des livres sans encaissement ni
       annulation. La clôture nomme maintenant chaque table qui porte encore
       une addition (lignes envoyées ou validées) et refuse de fermer tant
       qu'elle n'est ni encaissée ni annulée, sauf si le caissier coche qu'il
       ferme quand même. */
    function openTableBills() {
      const out = [];
      /* typeof : la feuille de clôture est aussi rendue sans plan de salle
         (boutique) et dans des bacs à sable de test. */
      const bills = (typeof tableOrders !== 'undefined' && tableOrders) || {};
      Object.keys(bills).forEach((id) => {
        const lines = (bills[id] || []).filter((l) => l && (l.sent || l.committed) && (+l.qty || 0) > 0);
        if (!lines.length) return;
        const total = lines.reduce((sum, l) => sum + (+l.price || 0) * (+l.qty || 0), 0);
        out.push({ id: String(id), total: Math.round(total * 100) / 100 });
      });
      return out.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0) || a.id.localeCompare(b.id));
    }
    function renderOpenTableBills() {
      const box = $('#clo-open-box');
      if (!box) return [];
      const open = openTableBills();
      const cloOpenEsc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      box.hidden = !open.length;
      const ack = $('#clo-open-ack');
      if (ack) ack.checked = false;
      const linesEl = $('#clo-open-lines');
      if (!linesEl) return open;
      linesEl.innerHTML = open.map((t) =>
        `<div class="clo-drawer-line"><span>Table ${cloOpenEsc(t.id)}</span><span class="mono">${fmtMAD(t.total)}</span></div>`).join('')
        + (open.length > 1 ? `<div class="clo-drawer-line is-total"><span>Non encaissé</span><span class="mono">${fmtMAD(open.reduce((s, t) => s + t.total, 0))}</span></div>` : '');
      return open;
    }
    function renderCloture(preserveCount = false) {
      renderOpenTableBills();
      const now      = new Date();
      const openedAt = shiftOpenedAt || now;
      const durMin   = Math.max(0, Math.floor((now - openedAt) / 60000));
      const pad2     = n => String(n).padStart(2, '0');

      /* Le commerce et le caissier sont des données, chacun dans son <bdi> : en
         arabe, le point de « Othmane N. » passait sinon de l'autre côté du nom.
         La date reste un nœud à part, que la langue de la caisse traduit. */
      const cloEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      $('#clo-meta').innerHTML =
        `<bdi>${cloEsc(storeName())}</bdi> · <bdi>${cloEsc(currentCashier.name)}</bdi> · `
        + `<span>${dafrDays[now.getDay()]} ${now.getDate()} ${monthsEn[now.getMonth()]}</span>`;

      const tot = journalTotals();
      const rows = [
        ['Service ouvert à', `${pad2(openedAt.getHours())}:${pad2(openedAt.getMinutes())}`, false, ''],
        ['Durée du service', fmtDur(durMin),                                               false, ''],
        ['Transactions',     String(tot.txns),                                             false, ''],
        ['Tables réglées',   String(shift.tablesPaid),                                      false, ''],
        ['Total encaissé',   fmtMAD(tot.revenue),                                           true,  'total'],
        ['dont Carte',       fmtMAD(tot.card),                                              true,  'sub'],
        ['dont Espèces',     fmtMAD(tot.cash),                                              true,  'sub'],
        ['Ticket moyen',     fmtMAD(tot.txns > 0 ? tot.revenue / tot.txns : 0),             true,  ''],
        ['Réductions accordées', fmtMAD(shift.discounts),                                   true,  ''],
      ];
      if (tot.tips > 0)    rows.push(['Pourboires', fmtMAD(tot.tips), true, '']);
      if (shift.refunds > 0) rows.push(['Remboursements', fmtMAD(shift.refunds), true, '']);
      if (authorizations.length > 0) rows.push(['Autorisations manager', String(authorizations.length), false, '']);
      if (handovers.length > 0) {
        rows.push(['Passations de caisse', String(handovers.length), false, '']);
        handovers.forEach(h => {
          const ht = new Date(h.time);
          rows.push([`${pad2(ht.getHours())}:${pad2(ht.getMinutes())} · ${h.fromName} → ${h.toName}`,
                     fmtEcart(h.ecart), true, 'sub']);
        });
      }

      $('#clo-rows').innerHTML = rows.map((r, i) => {
        const cls  = 'clo-row' + (r[3] === 'total' ? ' is-total' : (r[3] === 'sub' ? ' is-sub' : ''));
        const vCls = 'clo-row-value' + (r[2] ? ' mono' : '');
        return `<div class="${cls}" style="animation-delay:${i * 70}ms">`
             + `<span class="clo-row-label">${r[0]}</span>`
             + `<span class="${vCls}">${r[1]}</span></div>`;
      }).join('');

      // Tiroir-caisse · full reconciliation (float + cash sales + cash tips ± movements).
      // Cash pourboires physically land in the till; card tips do not.
      clotureExpected = drawerExpected();
      const dLines = [
        ["Fond d'ouverture",   fmtMAD(openingFloat),    ''],
        ['Espèces encaissées', '+ ' + fmtMAD(tot.cash), ''],
      ];
      if (tot.cashTips > 0) dLines.push(['Pourboires espèces', '+ ' + fmtMAD(tot.cashTips), '']);
      if (tot.movesIn  > 0) dLines.push(['Entrées de caisse', '+ ' + fmtMAD(tot.movesIn),  '']);
      if (tot.movesOut > 0) dLines.push(['Sorties de caisse', '− ' + fmtMAD(tot.movesOut), '']);
      dLines.push(['Attendu en caisse', fmtMAD(clotureExpected), 'is-total']);
      $('#clo-drawer-lines').innerHTML = dLines.map(l =>
        `<div class="clo-drawer-line ${l[2]}"><span>${l[0]}</span><span class="mono">${l[1]}</span></div>`
      ).join('');
      const countEl = $('#clo-count');
      if (!preserveCount && countEl) countEl.value = '';
      updateEcart();

      /* `tot.card` ne couvre que le service courant. Le rapport prévisualisé
         ajoute les services déjà clôturés de la même journée commerciale. */
      let cardReport = null;
      try { if (typeof buildDayReport === 'function') cardReport = buildDayReport(null, 0); } catch (_) {}
      const reportCard = Number(cardReport && cardReport.methods && cardReport.methods.card);
      clotureCardExpected = money(Number.isFinite(reportCard) ? reportCard : tot.card);
      const cardKiwi = $('#clo-card-kiwi');
      if (cardKiwi) cardKiwi.textContent = fmtMAD(clotureCardExpected);
      const cardInput = $('#clo-card-z');
      if (!preserveCount && cardInput) {
        cardInput.value = terminalCardTotal == null ? '' : String(terminalCardTotal);
      }
      updateCardEcart();

      // Highlight · objectif d'lyoum progress
      const pct    = Math.round(tot.revenue / DAILY_OBJECTIF * 100);
      const hlIcon = $('#cloture-modal .clo-highlight-icon');
      const hlText = $('#clo-highlight-text');
      if (storeIsReal()) {
        /* L'objectif de 18 000 MAD est une valeur de démonstration : un vrai
           commerce n'en a défini aucun sur la caisse. On dit seulement ce qui a
           été encaissé, jamais « à 2 % de l'objectif » d'un but que personne
           n'a fixé. */
        if (hlIcon) hlIcon.innerHTML = '<i data-lucide="receipt-text"></i>';
        if (hlText) hlText.innerHTML = `<em>${fmtMAD(tot.revenue)}</em> encaissés sur ce service.`;
      } else if (tot.revenue >= DAILY_OBJECTIF) {
        if (hlIcon) hlIcon.innerHTML = '<i data-lucide="trophy"></i>';
        if (hlText) hlText.innerHTML = `Objectif d'lyoum dépassé, <em>${fmtMAD(tot.revenue)}</em> encaissés. Beau service.`;
      } else {
        if (hlIcon) hlIcon.innerHTML = '<i data-lucide="target"></i>';
        if (hlText) hlText.innerHTML = `À <em>${pct}%</em> de l'objectif d'lyoum, ${fmtMAD(DAILY_OBJECTIF - tot.revenue)} restants.`;
      }
      // Re-trigger the entrance animation on the static blocks
      [['#clo-drawer-box', rows.length * 70 + 30], ['#clo-card-box', rows.length * 70 + 60], ['#clo-highlight', rows.length * 70 + 90]].forEach(([sel, delay]) => {
        const el = $(sel);
        if (!el) return;
        el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
        el.style.animationDelay = delay + 'ms';
      });
    }
    /* ═══════════════════════════════════════════════════════════════════════
       === RAPPORT JOURNALIER ===  (le « Z », écrit pour survivre à la caisse)
       ═══════════════════════════════════════════════════════════════════════
       Ce que la caisse sait et que le serveur ne saura jamais : le fond
       d'ouverture, les mouvements d'espèces, les remises accordées, qui a ouvert
       et qui a fermé, et le comptage du tiroir. Les VENTES, elles, sont déjà
       parties par /api/sale et n'ont aucun besoin d'être recopiées ici.

       Pourquoi on enregistre AUSSI en cours de service et pas seulement à la
       clôture : remises, fond, comptage et mouvements de tiroir ne sont pas des
       ventes. Les remboursements ont désormais leur propre contre-écriture
       append-only dans le flux financier ; le rapport provisoire reste la vérité
       opérationnelle du poste pendant le service. Il est remplacé par
       l'instantané DÉFINITIF à la clôture, recalculé depuis le journal plutôt
       qu'accumulé : c'est ce qui rend la double clôture inoffensive.
    */
    function dayReportSession(counted) {
      return {
        sessionId: cashSessionId(),
        terminalId: cashTerminalId(),
        openedAt: shiftOpenedAt ? shiftOpenedAt.getTime() : 0,
        openedBy: shiftOpenedBy || (currentCashier && currentCashier.name) || '',
        openingFloat: openingFloat,
        cashMovements: cashMovements,
        handovers: handovers,
        discounts: shift.discounts,
        discountsCount: shift.discountsCount,
        cancels: shift.cancels,
        countedCash: counted,
        terminalCardTotal: typeof terminalCardTotal === 'number' ? terminalCardTotal : null,
        cardReconciliationSource: 'manual-z',
      };
    }
    /* La journée commerciale que la caisse rapporte : celle de MAINTENANT. Un
       service ouvert à 22h et fermé à 2h du matin est une seule journée, celle
       de la veille (le seuil de 5 h la garde), et c'est ce que le patron
       appelle « hier soir ». Mais un service ouvert à 4 h 56 et encore ouvert à
       5 h 02 a changé de journée : le tableau de bord range la vente de 5 h 02
       dans aujourd'hui, et la caisse, restée sur la journée de l'ouverture, ne
       la voyait dans aucun rapport. Le rapport de la caisse suit la même
       frontière que le tableau de bord, à la minute. */
    function currentBusinessDay() {
      const DR = window.KiwiDayReport;
      if (!DR) return '';
      return DR.businessDay(Date.now());
    }
    function buildDayReport(counted, closedAt) {
      const DR = window.KiwiDayReport;
      if (!DR) return null;
      const sess = dayReportSession(counted);
      if (closedAt) {
        sess.closedAt = closedAt;
        sess.closedBy = (currentCashier && currentCashier.name) || '';
      }
      const pv = storePaired() || {};
      const report = DR.build({
        day: currentBusinessDay(),
        sales: journal.filter(isReportableJournalEntry),
        session: sess,
        store: { slug: DR.storeSlug(), name: storeName(), location: storeCity(), type: pv.type || '' },
        source: 'caisse',
      });
      return DR.preview ? DR.preview(report) : report;
    }
    /* The local journal is the payment truth used by the printed Z. Before a
       snapshot or final close, replay every locally-created positive sale into
       Live Link. postSale() derives the same stable server id each time, so
       this heals a missed asynchronous enqueue without ever booking twice.
       Cloud-imported rows are already in /api/feed and must not be mirrored. */
    function reconcileJournalSales(onlyMissing) {
      if (!window.KiwiLive || !window.KiwiLive.postSale) return 0;
      /* Le journal en mémoire appartient à un autre commerce que celui de la
         caisse : le rejouer, c'était poster les ventes de A chez B sous de
         nouveaux identifiants (postSale lit le commerce COURANT). Elles
         attendent le retour de la caisse chez A, intactes. */
      if (window.KiwiTillTenant?.mismatch()) return 0;
      const here = currentMerchantSlug();
      let n = 0;
      let syncChanged = false;
      journal.forEach((entry) => {
        if (!entry || entry.origin || entry.voided || entry.kind === 'refund'
          || (!(Number(entry.amount) > 0) && entry.kind !== 'complimentary')) return;
        if (entry.merchant && entry.merchant !== here) return;   // vendue ailleurs
        if (onlyMissing && entry.serverSaleId && !entry.saleSyncPending) return;
        try {
          const queued = window.KiwiLive.postSale(entry);
          if (queued && queued.ok === true && queued.queued === true && queued.id) {
            entry.serverSaleId = queued.id;
            if (!entry.saleSyncPending) syncChanged = true;
            entry.saleSyncPending = true;
            delete entry.saleSyncError;
            if (entry.saleHeldLocal) { delete entry.saleHeldLocal; releaseHeldSale(entry.id); syncChanged = true; }
            n++;
          } else if (queued && queued.ok === false && !entry.saleHeldLocal && !entry.serverSaleId) {
            /* Never queued: hold it. One that already has a server id was
               taken by the queue earlier; a full write-ahead on this replay
               says nothing about it, so it is not counted as held. */
            holdSaleLocally(entry, queued.reason);
            syncChanged = true;
          } else {
            const error = String((queued && queued.reason) || 'sale-sync-unavailable').slice(0, 96);
            if (!entry.saleSyncPending || entry.saleSyncError !== error) syncChanged = true;
            entry.saleSyncPending = true;
            entry.saleSyncError = error;
          }
        } catch (_) {
          if (!entry.saleSyncPending || entry.saleSyncError !== 'sale-enqueue-failed') syncChanged = true;
          entry.saleSyncPending = true;
          entry.saleSyncError = 'sale-enqueue-failed';
        }
      });
      /* Refunds use the same durable queue, but carry the manager identity
         proved at approval time. This second pass closes the crash window
         between writing the local journal and enqueueing the counter-entry.
         Older journals did not retain that signed capability; the visible
         recovery block asks a manager again, never invents an approver. */
      if (window.KiwiLive.postRefund) journal.forEach((entry) => {
        if (!entry || entry.origin || entry.voided || entry.kind !== 'refund' || !(Number(entry.amount) < 0)) return;
        if (entry.merchant && entry.merchant !== here) return;
        if (onlyMissing && entry.serverSaleId) return;
        const orig = refundOriginalFor(entry);
        if (!orig) return;
        const actor = entry.refundActor || null;
        /* A manager identity is not a manager authorization. Legacy rows and
           expired offline approvals go through the visible recovery flow below;
           silently inventing a capability here would only fill the outbox with
           requests the server must reject. */
        if (!actor || !actor.id || !actor.name || !actor.role || !actor.approval) return;
        try {
          const queued = window.KiwiLive.postRefund(entry, orig, actor);
          if (queued && queued.ok === true && queued.queued === true && queued.id) { entry.serverSaleId = queued.id; n++; }
        } catch (_) {}
      });
      if (n || syncChanged) { try { persistShift(); } catch (_) {} }
      try { window.KiwiLive.flush(true); } catch (_) {}
      return n;
    }
    function saveProvisional(force) {
      if (!shiftOpenedAt || registerClosing) return;
      /* Le rapport se construit avec le journal en mémoire et le slug courant :
         chez un autre commerce, il porterait le chiffre du service d'origine. */
      if (window.KiwiTillTenant?.mismatch()) return;
      /* A sale may be rung in the short boot window before the paired merchant
         identity resolves. postSale() correctly refuses to guess a tenant, but
         the old code retried only at register close. Heal only entries that do
         not yet carry a stable server id on every report heartbeat/refund. */
      try { reconcileJournalSales(true); } catch (_) {}
      if (!window.KiwiDayReport) return;
      if (!force && Date.now() - lastProvisional < 90000) return;
      lastProvisional = Date.now();
      try {
        const r = buildDayReport(null, 0);
        if (!r) return;
        r.closed = false;
        window.KiwiDayReport.save(r, { reopen: false, note: 'en cours', by: shiftOpenedBy });
        // A paid receipt must be compared with D1 during the shift, not only
        // after the cashier closes the register hours later.
        if (storeIsReal() && window.KiwiZReconciliation?.queueSnapshot) {
          /* Keep voided rows here: the Z manifest needs their IDs to remove
             receipts previously snapshotted during this shift. The report
             itself still excludes them via buildDayReport(). */
          window.KiwiZReconciliation.queueSnapshot(r, journal)
            .then((result) => {
              if (!result?.ok) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapprochement des ventes en attente · conservez cette caisse'));
              else if (result.unqueuedCount || result.unqueuedCents)
                toast('Écart caisse détecté · ' + result.unqueuedCount + ' reçu(s) hors file · conservez cette caisse');
            });
        }
      } catch (_) {}
    }

    /* Les libellés du ticket. Ils vivent ici et pas dans l'encodeur : l'encodeur
       ne doit connaître ni la langue ni le métier, seulement la mise en page. */
    function dayReportPrintOpts(report, copyLabel) {
      const DR = window.KiwiDayReport;
      const V = DR ? DR.vocab() : { items: 'articles' };
      const hm = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
      const p = String(report.day || '').split('-');
      return {
        report: report,
        shop: storeName() || 'Kiwi',
        address: storeCity(),
        title: 'RAPPORT JOURNALIER',
        dateLabel: p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : report.day,
        copy: copyLabel || '',
        openedLabel: hm(report.openedAt),
        closedLabel: hm(report.closedAt || Date.now()),
        detailTitle: 'DÉTAIL PAR ' + String(V.cat || 'catégorie').toUpperCase(),
        drawerTitle: 'TIROIR-CAISSE',
        netLabel: 'NET DU JOUR',
        unitWord: V.items || 'articles',
        /* La forme au singulier, pour que le total d'une catégorie qui n'a
           vendu qu'une pièce dise « = 1 plat » et pas « = 1 plats ». */
        unitWordOne: V.item || '',
        notCounted: 'non compté',
        handoverWord: 'Passation',
        reopenWord: 'Clôture n°',
        methodLabels: { cash: 'Espèces', card: 'Carte', wallet: 'Virement', tap: 'Kiwi Tap', qr: 'QR' },
        fmt: (n) => fmtMAD(n).replace(/\s*MAD\s*$/, ''),
      };
    }
    /* Imprime, et dit la vérité sur ce qui s'est passé. « Envoyé à l'imprimante »
       alors que rien n'est branché est exactement le message qui faisait croire
       que le Z sortait alors qu'il n'existait pas. */
    function doPrintDayReport(report, copyLabel) {
      if (!window.KiwiPrinter || !window.KiwiPrinter.printDayReport) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Imprimante indisponible')); return Promise.resolve({ ok: false });
      }
      return window.KiwiPrinter.printDayReport(dayReportPrintOpts(report, copyLabel))
        .then((res) => {
          if (res && res.ok) toast(res.via === 'pdf' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport prêt · imprimer ou partager le PDF') : res.via === 'browser' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport ouvert dans l\'impression système') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport imprimé'));
          else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Impression impossible · le rapport reste dans le tableau de bord"));
          return res || { ok: false };
        }, () => { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Impression impossible · le rapport reste dans le tableau de bord")); return { ok: false }; });
    }
    /* kiwiSkin2027:till · le rapport Z sur le kit (étape 4 (14), §18.9). Son
       numéro : les clôtures du classeur de ce commerce (closedCount, partagé
       par KiwiCloudDoc), celle-ci comprise ; 1 sur la démo. */
    function tillKitZNumber() {
      let n = 0;
      try { (window.KiwiDayReport.list() || []).forEach((d) => { n += Number(d && d.closedCount) || 0; }); } catch (_) {}
      return Math.max(1, n);
    }
    function showPostClose(report) {
      closedReport = report;
      if (tillKitOn() && window.KiwiTillZ && window.KiwiTillZ.open({
        report, n: tillKitZNumber(),
        onPrint: () => doPrintDayReport(report, ''),
        onDone: finishClose,
      })) return;
      const veil = $('#zsheet-modal');
      if (!veil) { finishClose(); return; }
      /* Le vocabulaire du métier dans la langue de la caisse : « 34 dishes » et non
         « 34 plats » sur un comptoir réglé en anglais. */
      const V = window.KiwiDayReport ? window.KiwiDayReport.vocab(undefined, carteLang()) : { items: 'articles' };
      const nCat = (report.categories || []).length;
      const nItems = (report.categories || []).reduce((s, c) => s + (c.qty || 0), 0);
      $('#zs-total').textContent = fmtMAD(report.net);
      const bits = [`${report.txns} transaction${report.txns > 1 ? 's' : ''}`];
      if (nCat) bits.push(`${nItems} ${V.items} · ${nCat} ${nCat > 1 ? V.cats : V.cat}`);
      if (report.reconciliation && report.reconciliation.status !== 'complete') {
        bits.push('Z provisoire · rapprochement distant incomplet');
      }
      if (report.cash && report.cash.ecart != null && Math.abs(report.cash.ecart) > 0.5) {
        bits.push(`écart ${fmtEcart(report.cash.ecart)}`);
      }
      const card = report.cardReconciliation;
      if (card && card.terminal != null) {
        if (card.status === 'matched') bits.push('carte rapprochée');
        else if (card.gap > 0) bits.push(`carte · Terminal + ${fmtMAD(card.gap)}`);
        else if (card.gap < 0) bits.push(`carte · Kiwi + ${fmtMAD(Math.abs(card.gap))}`);
      }
      $('#zs-sub').textContent = bits.join(' · ');
      $('#zs-reprint').hidden = true;
      try { window.KiwiCaisseLang?.apply?.(veil); } catch (_) {}
      veil.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
    }
    function finishClose() {
      window.KiwiServiceRequests?.reset();
      const veil = $('#zsheet-modal'); if (veil) veil.classList.remove('is-open');
      toast(`Caisse fermée · à bientôt ${String(currentCashier.name || '').trim().split(/\s+/)[0] || ''}`.trim());
      setTimeout(() => location.reload(), 640);
    }
    function closeStepWithin(promise, fallback) {
      let timer = null;
      return Promise.race([
        Promise.resolve(promise).catch(() => fallback),
        new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), CLOSE_STEP_TIMEOUT_MS); }),
      ]).finally(() => clearTimeout(timer));
    }
    function setCloseBusy(on) {
      try {
        const btn = $('#clo-close');
        if (!btn) return;
        btn.disabled = !!on;
        const label = btn.querySelector && btn.querySelector('span');
        if (label) label.textContent = on ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Clôture en cours…') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer la caisse');
      } catch (_) {}
    }
    async function closeRegister() {
      if (registerClosed) { finishClose(); return; }
      if (registerClosing) { toast('Clôture en cours · patientez quelques secondes'); return; }
      const countInput = $('#clo-count');
      const countedRaw = countInput ? countInput.value.trim() : '';
      const counted = countedRaw === '' ? NaN : Number(countedRaw);
      if (!Number.isFinite(counted) || counted < 0 ||
          Math.abs(counted * 100 - Math.round(counted * 100)) > 0.000001) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Saisissez les espèces comptées (0 si le tiroir est vide)'));
        countInput?.focus();
        return;
      }
      const cardInput = $('#clo-card-z');
      const cardRaw = cardInput ? cardInput.value.trim() : '';
      const cardZ = cardRaw === '' ? NaN : Number(cardRaw);
      if (!Number.isFinite(cardZ) || cardZ < 0 ||
          Math.abs(cardZ * 100 - Math.round(cardZ * 100)) > 0.000001) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Saisissez le total carte du Z terminal (0 si aucune carte)'));
        cardInput?.focus();
        return;
      }
      const openBills = openTableBills();
      if (openBills.length && !$('#clo-open-ack')?.checked) {
        renderOpenTableBills();
        try { $('#clo-open-box').scrollIntoView({ block: 'center' }); } catch (_) {}
        toast(openBills.length === 1
          ? `Table ${openBills[0].id} encore ouverte · encaissez-la, annulez-la ou cochez « Fermer quand même »`
          : `${openBills.length} tables encore ouvertes · encaissez-les, annulez-les ou cochez « Fermer quand même »`);
        return;
      }
      terminalCardTotal = money(cardZ);
      try { persistShift(); } catch (_) {}
      registerClosing = true;
      /* The sheet stays open with a busy button while the close works: hiding
         it first left a bare till on screen for up to 8 s, and the cashier
         reopened Clôture and tapped again into the silent guard. */
      setCloseBusy(true);
      try {
        await closeRegisterSteps(counted);
      } catch (err) {
        if (registerClosed) { finishClose(); return; }
        registerClosing = false;
        setCloseBusy(false);
        $('#cloture-modal').classList.add('is-open');
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Clôture interrompue · poste conservé. Réessayez.'));
      }
    }
    async function closeRegisterSteps(counted) {

      /* L'ORDRE COMPTE. On écrit le rapport AVANT d'effacer le poste : la
         version d'avant effaçait le poste puis rechargeait la page, et le
         rapport de la journée n'avait jamais existé nulle part. Les ventes,
         elles, ne sont pas touchées · ni ici ni ailleurs : une clôture produit
         un document, elle ne modifie pas le registre. */
      let report = null, reportSaved = false;
      let reconciliation = { ok: false, complete: false, count: 0, reason: 'feed-not-read' };
      try {
        /* Reconcile BEFORE freezing the Z. The synchronous write-ahead copy in
           Live Link survives the reload below, while flush starts delivery now. */
        reconcileJournalSales();
        reconciliation = await closeStepWithin(syncSettledBusinessDay({ timeoutMs: 8000 }),
          { ok: false, complete: false, count: 0, reason: 'feed-timeout' });
      } catch (_) {}
      try {
        report = buildDayReport(counted, Date.now());
        if (report && window.KiwiDayReport) {
          report.reconciliation = {
            status: reconciliation.complete ? 'complete' : 'provisional',
            remoteFeed: reconciliation.ok ? 'read' : 'unavailable',
            remoteRows: Number(reconciliation.count) || 0,
            reason: String(reconciliation.reason || '').slice(0, 32),
          };
          report.closed = true;
          const saved = window.KiwiDayReport.save(report, { by: (currentCashier && currentCashier.name) || '' });
          if (saved) report = saved;
          const persisted = window.KiwiDayReport.load(report.day, report.store?.slug);
          reportSaved = !!saved && (!window.KiwiDayReport.isReal() ||
            (persisted?.closedAt === report.closedAt && persisted?.sessionId === report.sessionId));
          /* La remontée serveur est débattue et la page se recharge dans une
             seconde : sans flush() le rapport partirait après la mort de
             l'onglet, c'est-à-dire jamais. */
          window.KiwiDayReport.flush();
        }
      } catch (_) {}
      if (!report || !reportSaved) {
        registerClosing = false;
        setCloseBusy(false);
        $('#cloture-modal').classList.add('is-open');
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Clôture non enregistrée · poste conservé. Vérifiez le stockage puis réessayez.'));
        return;
      }
      /* IndexedDB can stall on iPad after the app was backgrounded. A stalled
         Z write is a failed close (the shift stays), never an endless wait. */
      const zQueued = !storeIsReal() ? { ok: true, demo: true } : await closeStepWithin(window.KiwiZReconciliation
        ? window.KiwiZReconciliation.queueClose(report, journal)
        : Promise.resolve({ ok: false, reason: 'module-unavailable' }), { ok: false, reason: 'timeout' });
      if (!zQueued || !zQueued.ok) {
        registerClosing = false;
        setCloseBusy(false);
        $('#cloture-modal').classList.add('is-open');
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapprochement Z non protégé · poste conservé. Vérifiez le stockage puis réessayez.'));
        return;
      }
      if (zQueued.unqueuedCount || zQueued.unqueuedCents)
        toast('Écart Z conservé · ' + zQueued.unqueuedCount + ' reçu(s) hors file · contactez le support');

      const closedAt = Date.now();
      const tot = journalTotals();
      clotureExpected = drawerExpected();
      const expectedCents = minor(clotureExpected);
      const countedCents = minor(counted);
      const gapCents = countedCents - expectedCents;
      emitCashSession({
        sessionId: cashSessionId(), eventType: 'close',
        expectedCents: expectedCents,
        countedCents: countedCents,
        gapCents: gapCents,
        ...(closeGapReason ? { gapReason: closeGapReason } : {}),
        actorId: cashActorId(), openedAt: shiftOpenedAt.getTime(), occurredAt: closedAt
      });

      /* From here the close is recorded. Whatever happens next, the only way
         out is finishClose(): no path may leave this service on screen. */
      registerClosed = true;
      /* §15.3 : un seul Paid, sur l'image où la clôture est actée. */
      if (tillKitCount) { try { tillKitCount.cc.committed(); } catch (_) {} }
      clearPersistedShift();
      $('#cloture-modal').classList.remove('is-open');
      setCloseBusy(false);
      try { showPostClose(report); } catch (_) { finishClose(); }
    }
