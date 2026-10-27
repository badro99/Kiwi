
    /* ── AGRÉGATION COMPTABLE DU JOURNAL ET DU POSTE ─────────────────────────
     * Source unique de vérité pour le chiffre d'affaires, les modes de règlement,
     * les pourboires, le nombre de transactions et les mouvements d'espèces.
     * Tout le calcul financier est conduit en centimes entiers (minor).
     *
     *  - sans `sinceMs` : couvre l'ensemble du service (clôture Z).
     *  - avec `sinceMs` : restreint aux écritures du poste courant (passation).
     *
     * RÈGLES DE RECOUVREMENT COMPTABLE :
     *  1. e.voided est strictement exclu (sortie des livres par le support).
     *  2. Un remboursement (kind === 'refund') réduit le net et son mode d'encaissement,
     *     mais ne compte PAS comme une transaction (n'incrémente pas txns).
     *  3. Les pourboires d'une vente annulée sont également exclus.
     *  4. Mouvements d'espèces (cashMovements) ventilés en centimes entiers.
     * ─────────────────────────────────────────────────────────────────────────── */
    function isReportableJournalEntry(entry) {
      if (!entry || entry.voided) return false;
      /* A rejected server refund remains a receipt/audit fact, but it must not
         reduce the canonical Z unless cash was actually handed out. That
         physical exception stays visible for reconciliation. */
      if (entry.kind === 'refund' && entry.refundSyncStatus === 'rejected'
        && !refundHasCashException(entry)) return false;
      return true;
    }
    function rollupLedger(sinceMs) {
      /* GENERATED SHARED KiwiDayReportModel BEGIN */
      /* Copy of functions/api/_rules-day-report.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
      var KiwiDayReportModel = (function () {
        /* Day-report figures. Callers supply normalized rows and the business-day bounds.
         * The ledger profile preserves the till's historic non-cash bucket and rounding;
         * the report profile preserves detailed tenders and split-tip allocation. */
        const num = function (n) { var x = +n; return isFinite(x) ? x : 0; }
        const round2 = function (n) { return Math.round(num(n) * 100) / 100; }
        const minor = function (n) { return Math.round(((Number(n) || 0) + Number.EPSILON) * 100); }
        const major = function (n) { return n / 100; }
        const ledgerFigures = function (journal, cashMovements, sinceMs) {
              const hasSince = typeof sinceMs === 'number' && Number.isFinite(sinceMs);
              let revenueC = 0, cardC = 0, cashC = 0, tipsC = 0, cashTipsC = 0, txns = 0;
              for (const e of journal) {
                if (!e || e.voided) continue;
                if (e.kind === 'refund' && e.refundSyncStatus === 'rejected'
                  && !(e.cashHandedOut === true || Number(e.cashHandedOutAt) > 0
                    || e.refundReconciliation === 'cash-handed-out')) continue;
                if (hasSince) {
                  const t = (e.time instanceof Date ? e.time : new Date(e.time)).getTime();
                  if (t < sinceMs) continue;
                }
                /* A refund changes net revenue and the tender balance, but it is not a
                   second sale. Counting it in `txns` made one 100 MAD sale followed by
                   a 20 MAD refund display 2 transactions and a 40 MAD average basket. */
                if ((e.amount > 0 || e.kind === 'complimentary') && e.kind !== 'refund') txns++;
                revenueC += minor(e.amount);
                if (e.method === 'cash') cashC += minor(e.amount); else cardC += minor(e.amount);
                const tip = e.tip || 0;
                tipsC += minor(tip);
                if (e.method === 'cash') cashTipsC += minor(tip);
              }
              let movesInC = 0, movesOutC = 0;
              for (const m of cashMovements) {
                if (!m) continue;
                if (hasSince) {
                  const t = (m.time instanceof Date ? m.time : new Date(m.time)).getTime();
                  if (t < sinceMs) continue;
                }
                if (m.type === 'in') movesInC += minor(m.amount); else movesOutC += minor(m.amount);
              }
              return {
                revenue: major(revenueC),
                card: major(cardC),
                cash: major(cashC),
                tips: major(tipsC),
                cashTips: major(cashTipsC),
                txns,
                movesIn: major(movesInC),
                movesOut: major(movesOutC),
                revenueC,
                cardC,
                cashC,
                tipsC,
                cashTipsC,
                movesInC,
                movesOutC,
              };
        }
        const reportFigures = function (rows) {
          var gross = 0, refundAmt = 0, refundN = 0, txns = 0;
          var methods = Object.create(null), tips = 0, cashTips = 0;
          rows.forEach(function (s) {
              var isRefund = s.kind === 'refund' || s.amount < 0;
              var mag = Math.abs(s.amount);
              if (isRefund) { refundAmt += mag; refundN++; }
              else { gross += s.amount; txns++; }
              var m = s.method || 'cash';
              var tenderParts = !isRefund && s.parts && s.parts.length ? s.parts : null;
              if (tenderParts) tenderParts.forEach(function (p) {
                var method = p.method === 'avoir' ? 'credit' : p.method;
                methods[method] = round2(num(methods[method]) + p.amountCents / 100);
              });
              else methods[m] = round2(num(methods[m]) + (isRefund ? -mag : s.amount));
              tips += s.tip;
              cashTips += s.tipMethod ? (s.tipMethod === 'cash' ? s.tip : 0) : tenderParts ? Math.sign(s.tip) * Math.round(Math.abs(s.tip) * 100 * tenderParts.reduce(function (n, p) { return n + (p.method === 'cash' ? p.amountCents : 0); }, 0) / tenderParts.reduce(function (n, p) { return n + p.amountCents; }, 0) + 1e-9) / 100 : m === 'cash' ? s.tip : 0;

          });
          return { gross: gross, net: round2(gross - refundAmt), txns: txns,
            refunds: { count: refundN, amount: refundAmt }, methods: methods,
            tips: tips, cashTips: cashTips };
        }
        const expectedCash = function (opening, cash, tips, movesIn, movesOut, gap) {
          return round2(expectedCashCents(opening, cash, tips, movesIn, movesOut, gap));
        }

        const expectedCashCents = function (opening, cash, tips, movesIn, movesOut, gap) {
          return opening + cash + tips + movesIn - movesOut + gap;
        }
        return { ledgerFigures, reportFigures, expectedCash, expectedCashCents };
      })();
      /* GENERATED SHARED KiwiDayReportModel END */
      return KiwiDayReportModel.ledgerFigures(journal, cashMovements, sinceMs);
    }

    /* Roll up the ledger · single source of truth for revenue / tenders */
    function journalTotals() {
      return rollupLedger();
    }

    /* ── UNE VENTE SORTIE DES LIVRES DOIT QUITTER LE COMPTOIR AUSSI ──────────
     * Quand le support annule une vente d'essai depuis la console opérateur, le
     * tableau de bord cesse de la compter immédiatement · mais la caisse, elle,
     * la gardait dans « encaissé aujourd'hui » jusqu'à minuit. Le patron voyait
     * alors deux chiffres différents pour la même journée, et c'est toujours la
     * caisse qu'il croit.
     *
     * KiwiLive publie l'ensemble des références annulées à chaque sondage (pas
     * un delta) : on peut donc aussi bien REMETTRE une vente rétablie. Le
     * drapeau `voided` porté par l'écriture est le registre · ce qui rend
     * l'opération idempotente sur les quatre-vingt-dix secondes suivantes.
     * Même mécanique que la boutique (assets/pos-boutique.js). */
    function refreshOpenReconciliationModals() {
      try {
        if ($('#handover-modal') && $('#handover-modal').classList.contains('is-open')) {
          renderHandoverCount(true);
          if ($('#ho-verify') && $('#ho-verify').value !== '') updateHandoverVerdict();
        }
      } catch (_) {}
      try {
        if ($('#cloture-modal') && $('#cloture-modal').classList.contains('is-open')) {
          renderCloture(true);
        }
      } catch (_) {}
      try {
        if ($('#cm-modal') && $('#cm-modal').classList.contains('is-open') && typeof renderCashMovements === 'function') {
          renderCashMovements();
        }
      } catch (_) {}
    }

    function reconcileVoids(refs, saleIds, voidEvents, opts) {
      if (!storeIsReal()) return 0;
      const KP = window.KiwiPosSale;
      const hit = (KP && KP.refMatcher) ? KP.refMatcher(refs) : null;
      const ids = new Set((saleIds || []).map((id) => String(id || '')).filter(Boolean));
      const activeIds = (opts && opts.activeSaleIds) ? opts.activeSaleIds : ((typeof activeCloudSaleIds !== 'undefined' && activeCloudSaleIds.size) ? activeCloudSaleIds : null);
      const restoredIds = (opts && opts.restoredIds) ? opts.restoredIds : null;

      function isFormattedFiscal(ref) {
        const s = String(ref || '').trim();
        if (!s) return false;
        if (/^\d{6}-/i.test(s)) return true;
        if (/^(kw|opd|rec|fac|ticket|cmd)-/i.test(s)) return true;
        if (/-\w{2}$/.test(s) && s.length >= 6) return true;
        return false;
      }

      const voidMapById = new Map();
      const voidMapByRef = new Map();
      if (Array.isArray(voidEvents)) {
        voidEvents.forEach((ev) => {
          if (!ev) return;
          const vts = ev.voidTs != null ? Number(ev.voidTs) : (ev.vts != null ? Number(ev.vts) : null);
          if (ev.id) voidMapById.set(String(ev.id), vts);
          if (ev.ref) voidMapByRef.set(String(ev.ref), vts);
        });
      }

      let touched = 0;
      journal.forEach((e) => {
        if (!e) return;
        let serverId = '';
        try { serverId = window.KiwiLive?.saleIdFor?.(e, currentMerchantSlug()) || ''; } catch (_) {}

        const entryId = String(e.id || '');
        const entryRef = String(e.ref || '').trim();
        const saleTs = (e.time instanceof Date ? e.time.getTime() : new Date(e.time || 0).getTime()) || 0;

        // Explicit restoration evidence: restores any voided entry
        if (e.voided && restoredIds && ((entryId && restoredIds.has(entryId)) || (serverId && restoredIds.has(serverId)) || (entryRef && restoredIds.has(entryRef)))) {
          e.voided = false;
          delete e.voidConfirmed;
          delete e.voidAuthority;
          delete e.voidTs;
          delete e.voidAt;
          touched++;
          return;
        }

        let matched = false;

        /* A refund created locally can remain in this caisse journal even when
           its upload never reached D1. If God Mode authoritatively removes the
           original test receipt, that local counter-entry must follow it;
           otherwise the drawer is reduced by money that never left it. The
           complete void list is sent on every poll, so this is reversible when
           the original receipt is restored too. */
        let linkedRefundMatched = false;
        if (e.kind === 'refund' && !e.refundOfId && hit && e.refundOf && refundOriginalFor(e)) {
          const originalRef = String(e.refundOf || '').trim();
          if (originalRef && isFormattedFiscal(originalRef) && hit(originalRef)) {
            const originalVoidTs = voidMapByRef.get(originalRef);
            if (originalVoidTs == null || saleTs <= originalVoidTs + 60000) {
              matched = true;
              linkedRefundMatched = true;
            }
          }
        }

        // 1. Exact unique ID match (authoritative: independent of untrusted client clock)
        if ((entryId && ids.has(entryId)) || (serverId && ids.has(serverId))) {
          matched = true;
        }

        let refHitInFeed = false;
        let allowRefMatch = false;
        let causalityFailed = false;

        // 2. Reference match (only if not already matched, and reference is not a bare table/seat identifier)
        if (!matched && hit && entryRef) {
          const isBareTable = /^\d{1,4}$/.test(entryRef);
          const isTableSeat = /^[A-Za-z]{1,4}-\d{1,3}$/.test(entryRef);
          const isTableSale = Boolean(e.table || e.session || entryId.startsWith('visit-'));

          // Bare table numbers or table sales with non-fiscal refs MUST NEVER be matched by ref
          allowRefMatch = !isBareTable && (!isTableSale || (!isTableSeat && isFormattedFiscal(entryRef)));

          if (hit(entryRef)) {
            refHitInFeed = true;
            if (allowRefMatch) {
              const voidTs = voidMapByRef.get(entryRef);
              if (voidTs == null || saleTs <= voidTs + 60000) {
                matched = true;
              } else {
                causalityFailed = true;
              }
            }
          }
        }

        if (matched) {
          const isServerConfirmed = Boolean(
            (entryId && ids.has(entryId)) ||
            (serverId && ids.has(serverId)) ||
            (entryId && voidMapById.has(entryId)) ||
            (serverId && voidMapById.has(serverId))
          );
          const newAuthority = isServerConfirmed ? 'server' : (linkedRefundMatched ? 'linked-ref' : 'ref');

          if (!e.voided || (isServerConfirmed && !e.voidConfirmed)) {
            e.voided = true;
            if (isServerConfirmed) e.voidConfirmed = true;
            e.voidAuthority = newAuthority;
            const voidTs = (entryId && voidMapById.get(entryId)) || (serverId && voidMapById.get(serverId)) || (entryRef && voidMapByRef.get(entryRef)) || Date.now();
            e.voidTs = voidTs;
            e.voidAt = Date.now();
            if (typeof activeCloudSaleIds !== 'undefined') {
              if (entryId) activeCloudSaleIds.delete(entryId);
              if (serverId) activeCloudSaleIds.delete(serverId);
            }
            if (e.kind !== 'refund') {
              try { window.KiwiInventoryConsumption?.reverse?.(e.ref, 'Vente sortie des livres'); } catch (_) {}
            }
            touched++;
          }
          return;
        }

        // --- At this point, matched === false ---

        /* Unlike an ordinary reference void, linked-ref represents the state
           of the original receipt. Its disappearance from this complete list
           is explicit restoration evidence for the local refund as well. */
        if (e.voided && e.voidAuthority === 'linked-ref') {
          e.voided = false;
          delete e.voidConfirmed;
          delete e.voidAuthority;
          delete e.voidTs;
          delete e.voidAt;
          touched++;
          return;
        }

        // A confirmed server void MUST NEVER be cleared by an empty feed, partial feed, or feed omission.
        // It remains durable unless explicit restoration evidence is provided (restoredIds).
        if (e.voided && e.voidConfirmed) {
          return;
        }

        // A void based on reference authority also remains durable; omission from subsequent feeds
        // does not resurrect it without explicit restoration or confirmed server state.
        if (e.voided && e.voidAuthority === 'ref') {
          return;
        }

        // An ambiguous legacy local flag (voided === true without voidConfirmed):
        // Heals ONLY when authoritative receipt-level evidence confirms it is active on the server
        // (i.e. receipt identity is in activeIds / active cloud sales with void_ts IS NULL).
        // Unrelated reference collisions in the void feed must NEVER infer that the receipt is active.
        if (e.voided && !e.voidConfirmed) {
          const isCloudActive = Boolean(activeIds && (activeIds.has(entryId) || (serverId && activeIds.has(serverId))));
          if (isCloudActive) {
            e.voided = false;
            delete e.voidConfirmed;
            delete e.voidAuthority;
            delete e.voidTs;
            delete e.voidAt;
            touched++;
          }
          return;
        }
      });

      /* Legacy refunds created before the durable server refund link can still
         be tied unambiguously to the original receipt inside this till's own
         append-only journal. The original entry may have been matched by its
         server id while refundOf contains its printed ref, so comparing the
         refund only with the feed refs leaves the negative half active. Run a
         second pass after originals have been reconciled and make that exact
         local relationship follow the original's state. */
      journal.forEach((refund) => {
        if (!refund || refund.kind !== 'refund' || !(refund.refundOfId || refund.refundOf)) return;
        const original = refundOriginalFor(refund);
        if (!original) return;
        if (original.voided && !refund.voided) {
          refund.voided = true;
          refund.voidAuthority = 'linked-local';
          refund.voidTs = Number(original.voidTs) || Date.now();
          refund.voidAt = Date.now();
          touched++;
        } else if (!original.voided && refund.voided && refund.voidAuthority === 'linked-local') {
          refund.voided = false;
          delete refund.voidAuthority;
          delete refund.voidTs;
          delete refund.voidAt;
          touched++;
        }
      });
      if (!touched) return 0;
      renderShiftStats();
      if ($('#journal-drawer') && $('#journal-drawer').classList.contains('is-open')) renderJournal();
      try { if (typeof refreshOpenReconciliationModals === 'function') refreshOpenReconciliationModals(); } catch (_) {}
      /* persistShift() ecrit le journal - donc les drapeaux. saveProvisional()
         ecrit le rapport du jour. Il faut les DEUX : sans le premier un simple
         rechargement ressuscitait la vente annulee dans les totaux ; sans le
         second le rapport provisoire du tableau de bord la comptait encore. */
      try { persistShift(); } catch (_) {}
      try { saveProvisional(true); } catch (_) {}
      return touched;
    }

    /* Seed the ledger so the demo opens mid-service (~2h of transactions) */
    function seedJournal() {
      const openedMs = shiftOpenedAt.getTime();
      const span     = Date.now() - openedMs;
      const N        = 47;
      const tIds     = Object.keys(tables);
      let tablesDone = 0;
      for (let i = 0; i < N; i++) {
        const isVrap = Math.random() < 0.26;
        let label, amount;
        if (isVrap) {
          label  = 'À emporter';
          amount = 30 + Math.floor(Math.random() * 13) * 15;  // 30–210 MAD
        } else {
          label  = tIds[Math.floor(Math.random() * tIds.length)];
          amount = 90 + Math.floor(Math.random() * 28) * 15;  // 90–495 MAD
          tablesDone++;
        }
        /* Le panier détaillé, composé de VRAIS plats de la carte chargée. Sans
           lui, la démo encaissait des montants sans marchandise : l'onglet
           « ventes par article » du rapport · celui qui répond à « combien j'en
           ai vendu, de celui-là » · restait vide sur la caisse qu'on montre aux
           clients, et avait l'air cassé alors qu'il disait la vérité. Le montant
           suit le panier et non l'inverse : une addition qui ne fait pas la
           somme de ses lignes est le premier chiffre qu'un restaurateur vérifie.
           Carte absente (vrai commerce pas encore configuré) : on retombe sur
           l'ancien comportement, un montant sans lignes. */
        let lines = null;
        if (menuItems && menuItems.length) {
          const nl = isVrap ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3);
          const picked = Object.create(null);
          for (let k = 0; k < nl; k++) {
            const m = menuItems[Math.floor(Math.random() * menuItems.length)];
            if (!m) continue;
            const q = 1 + (Math.random() < 0.22 ? 1 : 0);
            const p = picked[m.id] || (picked[m.id] = { name: m.name, qty: 0, total: 0, cat: catLabels[m.cat] || '' });
            p.qty += q;
            p.total += (+m.price || 0) * q;
          }
          lines = Object.keys(picked).map((k) => picked[k]);
          if (lines.length) amount = lines.reduce((s, l) => s + l.total, 0);
          else lines = null;
        }
        // ~45% of tenders carry a small pourboire (rounded to 5 MAD, ~5–12%).
        let tip = 0;
        if (Math.random() < 0.45) {
          const pct = 5 + Math.floor(Math.random() * 8);      // 5–12 %
          tip = Math.max(5, Math.round(amount * pct / 100 / 5) * 5);
        }
        journal.push({
          id: 'seed-' + i,
          time: new Date(openedMs + span * (i + 0.5) / N),
          label: label, amount: amount,
          method: Math.random() < 0.6 ? 'card' : 'cash',
          tip: tip,
          ref: genRef(),
          cashier: currentCashier.name,
          lines: lines,
        });
      }
      shift.tablesPaid = tablesDone;
    }
