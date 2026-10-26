
    function cashSessionId() {
      if (!cashSessionKey) cashSessionKey = 'shift-' + String((shiftOpenedAt && shiftOpenedAt.getTime()) || Date.now());
      return cashSessionKey;
    }
    function cashTerminalId() {
      try {
        const sessions = window.KiwiCashSessions;
        return sessions && typeof sessions.terminalId === 'function'
          ? String(sessions.terminalId() || '').trim().slice(0, 96)
          : '';
      } catch (_) { return ''; }
    }
    function cashActorId(fallback) {
      try { return String((window.KiwiStaff && window.KiwiStaff.id) || fallback || (currentCashier && currentCashier.id) || 'till').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 96) || 'till'; }
      catch (_) { return 'till'; }
    }
    function cashActorRef(value) {
      return String(value || 'till').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 96) || 'till';
    }
    function emitCashSession(event) {
      if (window.KiwiTillTenant?.mismatch()) return;
      if (window.KiwiCashSessions && window.KiwiCashSessions.emit) window.KiwiCashSessions.emit(event);
      else (window.__kiwiCashSessionPending || (window.__kiwiCashSessionPending = [])).push(event);
    }   // flashes the freshest entry while the drawer is open

    /* Le numéro de ticket. C'était `'KW-' + random(28000..29999)` : deux ventes
       du même service pouvaient sortir avec le même numéro, et rien ne montait.
       Un numéro de reçu est une référence comptable · il se compte, par
       établissement et par jour, avec l'étiquette du terminal pour que deux
       caisses hors ligne ne se percutent pas (assets/receipt.js · nextRef). */
    function genRef() {
      try { if (window.KiwiReceipt && window.KiwiReceipt.nextRef) return window.KiwiReceipt.nextRef(); } catch (_) {}
      return 'KW-' + (28000 + Math.floor(Math.random() * 1999));
    }

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

    /* Record one completed tender (table payment, vente rapida, or split part).
       `amount` stays the base addition; `tip` (pourboire) is recorded alongside.
       `lines` (optional) · itemised order [{ name, qty, total }] for the receipt. */
    function accountActiveDiscount(settlementTable, saleDiscount) {
      let d = null, cut = 0;
      const tId = settlementTable || selectedId;
      if (mode === 'vrap') {
        d = vrapDiscount;
        const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
        cut = vrapDiscountAmount(gross);
      } else if (tId && tables[tId]) {
        d = tables[tId].discount;
        const gross = generateOrder(tId, tables[tId]).reduce((s, l) => s + l.total, 0);
        cut = discountAmountFor(tId, gross);
      }
      /* À l'emporter, `finalizeTender` a déjà envoyé le panier en cuisine et l'a
         vidé quand on arrive ici : la remise recalculée sur le panier valait 0 et
         le Z affichait « Réductions accordées 0 » pour une remise bien écrite en
         base. La vente porte sa propre remise (activeSaleDiscount) : on s'y fie. */
      if (!(cut > 0) && saleDiscount && saleDiscount.discountAmountCents > 0) {
        cut = saleDiscount.discountAmountCents / 100;
      }
      /* New discounts explicitly carry `accounted:false`. Legacy persisted
         discounts have no flag and were already added at approval time. */
      if (!d || d.accounted !== false || !(cut > 0)) return;
      const accounted = { ...d, amount: money(cut), accounted: true };
      if (mode === 'vrap') currentOrder().setDiscount(accounted);
      else if (tId && tables[tId]) tableSettlement().project(tables[tId], { discount: accounted });
      shift.discounts = money(shift.discounts + cut);
      shift.discountsCount++;
    }
    function discountReasonCode(value) {
      const key = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (/client/.test(key)) return 'loyal-customer';
      if (/cuisine/.test(key)) return 'kitchen-error';
      if (/commercial/.test(key)) return 'commercial';
      return 'other';
    }
    function activeSaleDiscount(amount, lines, settlementTable) {
      const tId = settlementTable || selectedId;
      const d = mode === 'vrap' ? vrapDiscount : (tId && tables[tId] && tables[tId].discount);
      if (!d || !Array.isArray(lines) || !lines.length) return null;
      const gross = money(lines.reduce((sum, line) => sum + (Number(line && (line.total != null ? line.total : ((line.price || 0) * (line.qty || 0)))) || 0), 0));
      const discount = money(Math.max(0, gross - money(amount)));
      if (!(gross > 0) || !(discount > 0) || discount > gross) return null;
      return {
        grossAmountCents: minor(gross), discountAmountCents: minor(discount),
        discountKind: d.kind === 'pct' ? 'percent' : 'amount',
        discountPercent: d.kind === 'pct' ? Number(d.value) : null,
        discountReason: discountReasonCode(d.reason),
        actorId: String(d.actorId || (currentCashier && currentCashier.id) || '').slice(0, 96)
      };
    }   // { key, rows: [{ entry, shift, at }] }
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

    function recordSale(amount, method, label, tip, lines, settlementTable, tenderOrder, split) {
      /* Le coût du plat GELÉ au moment de la vente (fiche technique complète,
         sinon coût saisi, via KiwiCost.of, le même moteur que le dashboard).
         Sans lui, l'Analyse du menu appliquait le coût d'aujourd'hui à toutes
         les ventes passées : une hausse du prix d'achat réécrivait l'historique.
         Inconnu : rien n'est écrit, jamais 0. */
      function frozenUnitCost(l) {
        try {
          if (!l || !l.itemId || l.kind === 'formula' || l.kind === 'formula-part' || !(+l.total > 0)) return null;
          const C = window.KiwiCost;
          if (!C || typeof C.of !== 'function') return null;
          const hit = C.of({ kind: l.kind || '', id: String(l.itemId), name: l.baseName || l.name || '' });
          const c = hit ? Number(hit.mad) : NaN;
          return Number.isFinite(c) && c > 0 ? Math.round(c * 100) / 100 : null;
        } catch (_) { return null; }
      }
      amount = money(amount);
      /* A cashier ticket can temporarily have no server visit (offline relay).
         Its immutable order number is still enough to recognize a second tap
         on the same uncleared bill. Never book that money or stock twice. */
      if (settlementTable && !split) {
        const paid = paidReceiptForCurrentTable(settlementTable);
        if (paid) { lastSaleId = paid.id; if (paid.saleHeldLocal) retryHeldSalesSafely(); return paid; }
      }
      const discount = activeSaleDiscount(amount, lines, settlementTable);
      const complimentary = amount === 0 && discount
        && discount.grossAmountCents === discount.discountAmountCents
        && /^[A-Za-z0-9:_-]{1,96}$/.test(discount.actorId || '')
        && !/^\d{4}$/.test(discount.actorId || '')
        && Array.isArray(lines) && lines.length > 0;
      if (amount < 0 || (amount === 0 && !complimentary)) return;
      /* An OrderPro takeaway is one commercial event even if the success modal
         is closed, the PWA reloads, or the remote paid flag arrives late. Tie
         the ledger row to the immutable OrderPro id instead of minting a new
         sale id on every tap. This is the financial last line of defence: a
         second Encaisser can reconcile the UI, never book the money twice. */
      /* `finalizeTender()` captures the order before any asynchronous relay can
         repaint or clear the takeaway editor. Keep that exact object attached
         to the receipt instead of rediscovering it through mutable UI state. */
      const vrapOrder = tenderOrder && tenderOrder.type === 'takeaway'
        ? tenderOrder
        : (mode === 'vrap' && vrapEditingNum != null
          ? kdsOrders.find(o => o && o.num === vrapEditingNum) : null);
      const orderProSaleId = vrapOrder && vrapOrder.opId
        ? ('sale-' + String(vrapOrder.opId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 58)) : '';
      if (orderProSaleId) {
        const existingSale = journal.find(row => row && row.id === orderProSaleId);
        if (existingSale) { lastSaleId = existingSale.id; if (existingSale.saleHeldLocal) retryHeldSalesSafely(); return existingSale; }
      }
      const entry = {
        id: orderProSaleId || ('sale-' + (window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2))),
        time: new Date(),
        label: label || 'Vente',
        /* Le reçu client, la caisse et la cuisine parlent du MÊME numéro de
           commande. La clé comptable reste `entry.id`; `ref` est le repère
           humain imprimé et doit être le numéro opérationnel. */
        amount: amount, method: method,
        ref: vrapOrder ? ticketNo(vrapOrder)
          : (settlementTable ? (tables[settlementTable]?.reopenRef || settledOrderLabel(settlementTable)) : genRef()),
        tip: money(tip),
        cashier: currentCashier.name,
      };
      if (complimentary) {
        entry.kind = 'complimentary';
        entry.settlementKind = 'complimentary';
      }
      if (vrapOrder && vrapOrder.opId) entry.orderId = String(vrapOrder.opId);
      if (discount) Object.assign(entry, discount);
      if (settlementTable) {
        entry.table = String(settlementTable);
        const visit = phoneSessionOf(settlementTable);
        if (visit) {
          entry.session = String(visit);
        }
        entry.channel = tables[settlementTable] && tables[settlementTable].zone === 'terrasse' ? 'terrace' : 'dining';
      } else if (mode === 'vrap') {
        entry.channel = 'takeaway';
        if (split && Number.isFinite(split.index)) {
          entry.id = entry.id + '-split-' + Number(split.index);
        }
      } else if (split && Number.isFinite(split.index)) {
        entry.id = entry.id + '-split-' + Number(split.index);
      }
      if (split && Number.isFinite(split.index) && Number.isFinite(split.count)) {
        entry.split = { index: Number(split.index), count: Number(split.count), flowId: String(split.flowId || '') };
      }
      if (Array.isArray(lines) && lines.length) {
        entry.lines = lines.filter(l => l.kind !== 'formula-part').map(l => {
          const unitPrice = l.price != null ? l.price : (l.unit != null ? l.unit : (l.qty ? money(l.total / l.qty) : l.total));
          const saved = Object.assign(
            {
              name: l.name,
              baseName: String(l.baseName || '').slice(0, 60),
              qty: l.qty,
              unit: unitPrice,
              price: unitPrice,
              total: money(l.total != null ? l.total : (unitPrice * l.qty)),
              cat: l.cat || '',
            },
            l.itemId ? { itemId: l.itemId } : null,
            l.kind ? { kind: l.kind } : null,
            l.shareDen > 1 ? { shareDen: Number(l.shareDen) } : null,
            /* La promotion de la carte qui a fixé ce prix : son id, son nom et
               ce que la ligne aurait coûté sans elle (le rapport compte la
               différence). */
            (l.promo && l.promo.id) ? { promo: { id: String(l.promo.id), name: String(l.promo.name || ''),
              full: money((+l.promo.before || 0) * (+l.qty || 0)) } } : null);
          const frozenCost = frozenUnitCost(l);
          if (frozenCost != null) saved.unitCost = frozenCost;
          if (Array.isArray(l.formulaChoices)) {
            saved.formulaChoices = l.formulaChoices.map(choice => ({
              name: String((choice && choice.name) || 'Choix'),
              qty: Math.max(1, +(choice && choice.qty) || +l.qty || 1),
              total: money(Math.max(0, +(choice && choice.total) || 0)),
            }));
          }
          return saved;
        });
      }
      if (settlementTable && tables[settlementTable]) {
        /* markPaid() clears the table immediately after the final tender. Keep
         * a bounded bill snapshot on the immutable local receipt so an audited
         * void can restore the same note after a reload, not manufacture a new
         * kitchen order or silently charge the whole split again. */
        const table = tables[settlementTable];
        const source = split && splitState && Array.isArray(splitState.sourceLines) && splitState.sourceLines.length
          ? splitState.sourceLines : generateOrder(settlementTable, table);
        entry.reopenSnapshot = {
          table: String(settlementTable), covers: Math.max(1, Number(table.covers) || 1),
          orderNo: String(table.orderNo || settledOrderRef(settlementTable) || ''),
          ref: String(entry.ref || ''),
          lines: source.slice(0, 40).map(line => ({
            name: String(line.name || ''), qty: Math.max(1, Number(line.qty) || 1),
            total: money(Number(line.total) || 0),
            price: money(Number(line.price ?? line.unit) || ((Number(line.total) || 0) / (Number(line.qty) || 1))),
          })),
          split: split && splitState.flow ? {
            id: String(splitState.flow.id || split.flowId || ''),
            parts: splitState.flow.parts.slice(0, 50).map(part => ({
              ...part, lines: Array.isArray(part.lines) ? part.lines.slice(0, 40).map(line => ({ ...line })) : [],
            })),
            total: splitState.total, mode: splitState.splitMode,
          } : null,
        };
      }
      accountActiveDiscount(settlementTable, split ? null : discount);
      /* Le reçu se fige ICI, au moment de la vente. Si le propriétaire change
         de raison sociale, de logo ou de pied de page en septembre, les tickets
         de juillet ne se réécrivent pas : une réimpression ressort celui qui a
         été remis au client, avec son numéro. */
      attachReceipt(entry);
      /* Une addition partagée à parts égales écrivait le plat entier dans CHAQUE
         part : trois parts d'un tajine comptaient trois tajines au rapport Z, au
         tableau de bord et dans la sortie de stock. Le reçu (figé ci-dessus) garde
         « 1× Tajine · 1/3 » ; la ligne comptable compte 1/3 de plat, de sorte que
         les N parts additionnées redonnent exactement le plat vendu. */
      if (Array.isArray(entry.lines)) {
        entry.lines.forEach(l => {
          if (l && l.shareDen > 1) { l.qty = Math.round((Number(l.qty) || 1) / l.shareDen * 1000) / 1000; delete l.shareDen; }
        });
      }
      window.KiwiTillTenant?.stamp(entry);
      if (settlementTable && tables[settlementTable]) {
        const billLines = split && splitState.sourceLines?.length ? splitState.sourceLines : generateOrder(settlementTable, tables[settlementTable]);
        const totalCents = !split ? minor(amount) : splitState.flow
          ? minor(splitState.flow.parts.reduce((sum, part) => sum + Number(part.base ?? (part.amount - (part.tip || 0))), 0))
          : Math.max(0, minor(billLines.reduce((sum, line) => sum + Number(line.total || 0), 0)) - Number(discount?.discountAmountCents || 0));
        tableSettlement().bill(settlementTable, { totalCents, lines: entry.reopenSnapshot?.lines || [],
          payments: split && splitState.flow ? splitState.flow.parts.flatMap((part, index) => part.paid ? [{
            id: part.saleId || ('legacy:' + splitState.flow.id + ':' + index),
            amountCents: minor(part.base ?? (part.amount - (part.tip || 0))), tipCents: minor(part.tip || 0), method: part.payMethod,
          }] : []) : [] });
        tableSettlement().addPayment(settlementTable, { id: entry.id, amountCents: minor(amount), tipCents: minor(tip || 0), method });
      }
      journal.push(entry);
      lastSaleId = entry.id;
      /* Do not leave a five-second loss window between taking money and the
         autosave. The offline server queue is durable too, but the till's own
         journal must survive an immediate reload on its own. */
      try { persistShift(); } catch (_) {}
      /* ── LA MARCHANDISE SORT AVEC L'ARGENT ────────────────────────────────
       * Les quatorze métiers en pos-*.js encaissent par KiwiPosSale.record(),
       * qui sort le stock au passage (assets/pos-sale.js). Le service à table
       * est le flux NATIF de cette caisse : il ne passe pas par là, et rien
       * d'autre n'appelait le moteur de consommation. Un restaurant pouvait
       * donc servir un service entier · dix-neuf tables réglées · sans qu'un
       * gramme de poulet ne quitte l'inventaire. La fiche technique, le coût
       * matière et la valeur de stock disaient tous la vérité séparément ; le
       * pont entre la vente et la matière n'existait pas.
       *
       * Les lignes portent déjà leur itemId (currentSaleLines), donc la
       * recette se résout directement. Les identifiants de mouvement dérivent
       * de la référence du ticket : un rechargement ne consomme jamais deux
       * fois. Le moteur ignore de lui-même services, pourboires et taxes. */
      try { window.KiwiInventoryConsumption?.record?.(entry); } catch (_) {}
      /* Fidélité. Le carnet du commerçant vivait déjà sur ce comptoir mais rien
         ne l'appelait ici : on pouvait inscrire un client, jamais lui compter
         un passage. Une note = un passage, même réglée en quatre parts · d'où
         le détachement immédiat (voir creditSaleToClient). */
      try { creditSaleToClient(entry); } catch (_) {}
      // Live Link (opt-in, off by default): mirror this sale to the owner's
      // dashboard via /api/sale. No-op unless kiwiLive is on. Never blocks the sale.
      try {
        if (window.KiwiLive) {
          // Le reçu reste détaillé ; le miroir conserve le solde au-delà de 40 lignes.
          const mirrored = window.KiwiPosSale?.foldLines ? Object.assign({}, entry, { lines: window.KiwiPosSale.foldLines(entry.lines) }) : entry;
          const posted = window.KiwiLive.postSale(mirrored);
          if (posted && posted.ok === true && posted.queued === true && posted.id) {
            entry.serverSaleId = posted.id;
            // Queue durability is not server acceptance. Only kiwi:money-sync
            // with state=accepted may clear this debt from the local journal.
            entry.saleSyncPending = true;
            delete entry.saleSyncError;
            /* The feed echoes this same sale under `posted.id`. Persist that
               bridge immediately: without it, a reload before the next
               autosave forgot the relationship and displayed the local row
               plus its cloud echo as two cash transactions. */
            try { persistShift(); } catch (_) {}
          } else if (posted && posted.ok === false) {
            /* Refused by the queue (storage full): the money is taken, so the
               sale stays, once, and is held for replay. The cashier is told it
               is recorded, never that it failed, or the customer pays twice. */
            const durable = holdSaleLocally(entry, posted.reason || 'sale-enqueue-failed');
            try { persistShift(); } catch (_) {}
            warnSaleHeld(durable);
          } else {
            entry.saleSyncPending = true;
            entry.saleSyncError = String((posted && posted.reason) || 'sale-sync-unavailable').slice(0, 96);
            try { persistShift(); } catch (_) {}
          }
        }
      } catch (_) {
        const durable = holdSaleLocally(entry, 'sale-enqueue-failed');
        try { persistShift(); } catch (_) {}
        warnSaleHeld(durable);
      }
      /* Once the receipt is journaled, optional UI/loyalty failures must not
         skip markPaid() and leave the same cash sale payable again. */
      try { renderShiftStats(); } catch (_) {}
      try { if ($('#journal-drawer').classList.contains('is-open')) renderJournal(); } catch (_) {}
      try { refreshOpenReconciliationModals(); } catch (_) {}
      return entry;
    }

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

    /* À QUELLE note. Le client est attaché à une addition précise, pas au
       comptoir : passer de la mesa 3 à la mesa 7 avec une fiche encore
       accrochée créditerait le passage à la mauvaise personne. On étiquette
       donc l'attache avec son contexte, et on la lâche dès qu'il change. */
    function saleContextKey() {
      try { return (mode === 'vrap') ? ('vrap:' + (vrapEditingNum == null ? 'new' : vrapEditingNum)) : ('table:' + (selectedId || '')); }
      catch (_) { return ''; }
    }

    function clientsOn() {
      try { return !!(storeIsReal() && window.KiwiClients && window.KiwiClients.bookId()); }
      catch (_) { return false; }
    }
    function clientInitials(name) {
      const p = String(name || '').trim().split(/\s+/).filter(Boolean);
      return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
    }
    /* « 7/10 » ou « 240 pts » · ce que l'employé doit pouvoir annoncer au
       client sans ouvrir un autre écran. */
    function clientProgressLabel(rec) {
      try {
        const KC = window.KiwiClients;
        /* Sans programme choisi, « 0/10 » annonçait une carte à tampons que le
           commerce n'a jamais proposée. */
        if (KC.loyaltyOn && !KC.loyaltyOn()) return '';
        const cfg = (KC.config && KC.config()) || {};
        if (cfg.model === 'amount') return (rec.points || 0) + ' pts';
        const target = (cfg.model === 'product' ? (cfg.product && cfg.product.target) : (cfg.visit && cfg.visit.target)) || 10;
        return (rec.stamps || 0) + '/' + target;
      } catch (_) { return ''; }
    }

    function renderSaleClient() {
      const btn = $('#rp-client');
      if (!btn) return;
      if (saleClient && saleClient.ctx && saleClient.ctx !== saleContextKey()) saleClient = null;
      btn.hidden = !clientsOn();
      const lab = $('#rp-client-label');
      const x = $('#rp-client-clear');
      if (saleClient) {
        let rec = null;
        try { rec = window.KiwiClients.get(saleClient.id); } catch (_) {}
        const prog = rec ? clientProgressLabel(rec) : '';
        btn.classList.add('is-on');
        if (lab) lab.textContent = saleClient.name + (prog ? ' · ' + prog : '');
        if (x) x.hidden = false;
      } else {
        btn.classList.remove('is-on');
        if (lab) lab.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Client & fidélité');
        if (x) x.hidden = true;
      }
    }

    function creditSaleToClient(entry) {
      if (!saleClient || !clientsOn()) return;
      const id = saleClient.name, cid = saleClient.id;
      saleClient = null;                       // une note = un passage
      try {
        /* #0168 · the client page shows what was eaten, on which ticket and
           how it was paid, the same history the boutique already fills. */
        const res = window.KiwiClients.recordPurchase(cid, {
          amount: entry.amount, method: entry.method, saleRef: entry.ref,
          saleId: entry.id, eventRef: entry.id, createdAt: +entry.time,
          items: (entry.lines || []).map(l => ({ name: l.name, qty: l.qty, total: l.total })),
        });
        renderSaleClient();
        if (!res) return;
        toast(res.rewardReady
          ? `${id} · récompense atteinte`
          : `${id} · passage enregistré`);
      } catch (_) { renderSaleClient(); }
    }

    function clRows(q) {
      let list = [];
      try { list = window.KiwiClients.list() || []; } catch (_) {}
      const needle = String(q || '').trim().toLowerCase();
      if (needle) {
        const digits = needle.replace(/\D/g, '');
        list = list.filter(c =>
          String(c.name || '').toLowerCase().indexOf(needle) !== -1 ||
          (digits && String(c.phone || '').replace(/\D/g, '').indexOf(digits) !== -1));
      }
      // Les plus récents d'abord : au comptoir, c'est presque toujours un habitué.
      list = list.slice().sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''))).slice(0, 40);
      if (!list.length) {
        return `<div class="cl-empty">${needle
          ? 'Personne à ce nom.<br />Créez la fiche avec « Nouveau client ».'
          : 'Le carnet est vide.<br />Le premier client s\'inscrit ici, au comptoir.'}</div>`;
      }
      return list.map(c => `
        <button type="button" class="cl-row" data-cl-pick="${escTeam(c.id)}">
          <span class="ini">${escTeam(clientInitials(c.name))}</span>
          <span class="who"><b>${escTeam(c.name || 'Sans nom')}</b><span>${escTeam(c.phone || '')}</span></span>
          <span class="pts">${escTeam(clientProgressLabel(c))}</span>
        </button>`).join('');
    }
    function clPaint() {
      const l = $('#cl-list');
      if (l) l.innerHTML = clRows($('#cl-search') ? $('#cl-search').value : '');
      const nw = $('#cl-new'); if (nw) nw.hidden = !clNewMode;
      const ls = $('#cl-list'); if (ls) ls.hidden = clNewMode;
      const sr = $('#cl-search'); if (sr) sr.hidden = clNewMode;
      const cl = $('#cl-confirm-label'); if (cl) cl.textContent = clNewMode ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Enregistrer') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Nouveau client');
    }
    function openClientModal() {
      if (!clientsOn()) return;
      clNewMode = false;
      const s = $('#cl-search'); if (s) s.value = '';
      ['#cl-new-name', '#cl-new-phone'].forEach(sel => { const el = $(sel); if (el) el.value = ''; });
      const cs = $('#cl-new-consent'); if (cs) cs.checked = false;
      clPaint();
      clientModal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      setTimeout(() => { try { $('#cl-search').focus(); } catch (_) {} }, 120);
    }
    function closeClientModal() { clientModal.classList.remove('is-open'); }
    function attachClient(rec) {
      if (!rec) return;
      saleClient = { id: rec.id, name: rec.name || 'Client', phone: rec.phone || '', ctx: saleContextKey() };
      renderSaleClient();
      closeClientModal();
      toast(`${saleClient.name} attaché à la note`);
    }
    /* The Clients page (assets/clients-book.js) puts a client on the note in
       progress from their card, as Shopify and Loyverse do: the same attach as
       the picker above, the same one-note-one-visit rule, and the 2027 bill
       repaints so its header shows who the note is for (owner, 26 Oct 2026). */
    window.KiwiCaisseSaleClient = {
      /* A note to put the client on: À emporter always has one, the floor
         only once a table is open. */
      available() { try { return clientsOn() && (mode === 'vrap' || !!selectedId); } catch (_) { return false; } },
      current() { return saleClient && saleClient.ctx === saleContextKey() ? saleClient.id : null; },
      note() { try { return ($('#rp-table').textContent || '').trim(); } catch (_) { return ''; } },
      attach(rec) {
        if (!rec || !this.available()) return false;
        attachClient(rec);
        try { if (typeof tillKitPaint === 'function') tillKitPaint(); } catch (_) {}
        return true;
      },
      detach() {
        saleClient = null;
        renderSaleClient();
        try { if (typeof tillKitPaint === 'function') tillKitPaint(); } catch (_) {}
      },
    };
    /* Ce script s'exécute pendant l'analyse de la page ; clients-store.js est
       `defer` et n'existe pas encore. Le test d'ici ne s'abonnait donc jamais,
       et le bouton « Client & fidélité », masqué au démarrage, ne revenait
       qu'au prochain changement de mode : une caisse ouverte sur À emporter
       ne proposait jamais d'attacher un client. On s'accroche une fois les
       scripts différés chargés. */
    function hookClientBook() {
      try {
        if (!window.KiwiClients || !window.KiwiClients.subscribe) return false;
        window.KiwiClients.subscribe(renderSaleClient);
        renderSaleClient();
        return true;
      } catch (_) { return false; }
    } /* Casablanca landline (demo) */

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

    /* Live sidebar stats · computed from the journal */
    function renderShiftStats() {
      const t       = journalTotals();
      const cardPct = t.revenue > 0 ? Math.round(t.card / t.revenue * 100) : 0;
      const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
      set('#stat-txns',          String(t.txns));
      set('#stat-txns-delta',    t.revenue > 0
        ? `Carte ${cardPct}% · Cash ${100 - cardPct}%`
        : 'Aucun encaissement');
      set('#stat-avg',           fmtMAD(t.txns > 0 ? t.revenue / t.txns : 0));
      set('#stat-tables',        String(shift.tablesPaid));
      const scope = $('#stat-service-scope');
      if (scope) scope.textContent = shiftOpenedAt
        ? 'Service depuis ' + shiftOpenedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucun service ouvert');
    }

    function fmtDur(min) {
      const h = Math.floor(min / 60), m = min % 60;
      return h > 0 ? `${h}h ${String(m).padStart(2, '0')}` : `${m} mn`;
    }

    /* ---- Ouverture de caisse · clock-in button ---- */
    /* Les horaires autorisent-ils d'ouvrir maintenant ?
     * Trois réponses possibles, et une seule interrompt : ouvert → on continue ;
     * horaires jamais renseignés → on continue AUSSI (on ne bloque pas un
     * commerçant sur une donnée qu'on ne lui a jamais demandée, et le tableau de
     * bord l'invite déjà à la remplir) ; fermé → on demande.
     * Une dérogation encore active vaut accord : le responsable a déjà décidé
     * il y a dix minutes, on ne le rappelle pas à chaque écran. */
    function hoursAllowOpening() {
      const KH = window.KiwiHours;
      if (!KH || !KH.isConfigured()) return { ok: true };
      if (KH.activeOverride()) return { ok: true };
      const st = KH.statusAt(Date.now());
      if (st.open) return { ok: true };
      return { ok: false, text: KH.summary(Date.now(), undefined, carteLang()).text };
    }
    function askHoursOverride(reasonText, proceed) {
      const veil = $('#hours-gate');
      if (!veil) { proceed(); return; }
      const sub = $('#hg-sub');
      if (sub) sub.textContent = reasonText || '';
      try { window.KiwiCaisseLang?.apply?.(veil); } catch (_) {}
      veil.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      const shut = () => veil.classList.remove('is-open');
      $('#hg-cancel').onclick = shut;
      $('#hg-confirm').onclick = () => {
        try {
          window.KiwiHours.override({
            by: (currentCashier && currentCashier.name) || '',
            reason: 'ouverture hors horaires',
            minutes: 720,   /* la nuit entière : on ne redemande pas à chaque vente */
          });
        } catch (_) {}
        shut();
        proceed();
      };
    }

    function openService() {
      // Deliberate support entry can resume this browser's real service, but
      // must not replace its receipts with a fresh zero-transaction snapshot.
      if (operatorCaisseRequested() && !shiftOpenedAt) {
        const saved = loadPersistedShift();
        if (saved && saved.merchant === currentMerchantSlug()) {
          shiftMerchant = currentMerchantSlug();
          restoreShift(saved);
          try { adoptHeldSalesIntoJournal(); } catch (_) {}
          enterShellDirectly();
          startEmployeeSaleJournalSync();
          return;
        }
      }
      /* Un tiroir s'ouvre sur un montant que le caissier a indiqué, pas sur
         une valeur présélectionnée, démo comprise. Rien n'est écrit tant que ce
         n'est pas fait (le bouton reste d'ailleurs désactivé jusque-là). */
      if (!floatChosen) {
        if (tillKitOpenFloat()) return;   // kiwiSkin2027:till, étape 4 (13)
        const err = document.getElementById('ci-float-err');
        if (err) err.hidden = false;
        return;
      }
      /* Le contrôle horaire passe AVANT toute écriture d'état : reposer la
       * question après avoir ouvert le poste laisserait un service à moitié
       * commencé si le responsable annule. */
      const gate = hoursAllowOpening();
      if (!gate.ok) { askHoursOverride(gate.text, doOpenService); return; }
      doOpenService();
    }

    function doOpenService() {
      const btn       = document.getElementById('clockin-btn');
      const clockinEl = document.getElementById('clockin-screen');
      if (btn) btn.classList.add('is-confirmed');
      if (window.lucide) lucide.createIcons();

      // Open the cashier's shift. The DEMO opens mid-service (~2h of seeded sales);
      // a REAL / paired store opens a fresh shift with an EMPTY ledger (0 sales,
      // 0 transactions) that fills from real encaissements.
      const _realStore = storeIsReal();
      shiftOpenedAt = _realStore ? new Date() : new Date(Date.now() - 128 * 60 * 1000);
      terminalCardTotal = null;
      // Ce service naît chez CE commerçant · cf. la note sur shiftMerchant.
      shiftMerchant = currentMerchantSlug();
      /* Qui a ouvert. Figé maintenant et jamais réécrit : après une passation,
         `currentCashier` est la personne qui FERME, et le rapport doit nommer
         les deux. C'était la question sans réponse du Z précédent. */
      shiftOpenedBy = (currentCashier && currentCashier.name) || '';
      posteOpenedAt = shiftOpenedAt;        // first cashier's poste = whole shift
      posteOpeningFloat = openingFloat;
      emitCashSession({
        sessionId: cashSessionId(), eventType: 'open', expectedCents: Math.round(openingFloat * 100),
        countedCents: null, gapCents: null, actorId: cashActorId(),
        openedAt: shiftOpenedAt.getTime(), occurredAt: shiftOpenedAt.getTime()
      });
      if (tillKitFloat) tillKitFloat.done();
      if (!_realStore) seedJournal();
      renderShiftStats();
      try { saveProvisional(true); } catch (_) {}
      /* Only now may the shared settled-sales ledger hydrate Transactions,
         Résumé and Ventes par article. Unpaid orders remain outside it. */
      startEmployeeSaleJournalSync();

      setTimeout(() => runEntrySequence(clockinEl), document.documentElement.classList.contains('kiwi-native') ? 0 : 540);
      if (document.documentElement.classList.contains('kiwi-native')) { try { persistShift(); } catch (_) {} }
      signalTillServiceReady();
    }

    /* Greeting flash + iOS shell dive-in · runs after the register opens */
    function runEntrySequence(clockinEl) {
      if (document.documentElement.classList.contains('kiwi-native')) {
        if (clockinEl) clockinEl.style.display = 'none';
        const greeting = document.querySelector('[data-kiwi-greet]');
        if (greeting) greeting.remove();
        document.body.classList.add('is-unlocked');
        setMode('vrap');
        setVrapView('builder');
        return;
      }
      const shellEl  = document.querySelector('.shell');
      const topbarEl = document.querySelector('.topbar');
      const greetEl  = document.querySelector('[data-kiwi-greet]');

      // --- Populate dynamic greeting text BEFORE measuring em width ---
      const onCount  = Object.values(servers).filter(s => s.status === 'on').length;
      const eatCount = Object.values(tables).filter(t =>
        t.status === 'ka-yaklo' || t.status === 'bgha-ykhlass'
      ).length;
      const hour = new Date().getHours();
      const greetWord = hour < 17 ? 'Bonjour' : 'Bonsoir';
      const line1El = document.getElementById('greet-line1');
      const subEl   = document.getElementById('greet-sub');
      if (line1El) line1El.textContent = `${greetWord} ${String(currentCashier.name || '').trim().split(/\s+/)[0] || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Caissier')},`;
      if (subEl)   subEl.innerHTML = `${onCount} serveur${onCount > 1 ? 's' : ''} en service <em>·</em> ${eatCount} table${eatCount > 1 ? 's' : ''} en cours`;

      // --- Wrap <em> in .em-clip and measure its natural width ---
      let emClip = null;
      if (greetEl) {
        const greetH1 = greetEl.querySelector('h1');
        const greetEm = greetH1 && greetH1.querySelector('em');
        if (greetEm && !greetEm.parentNode.classList.contains('em-clip')) {
          const naturalW = Math.ceil(greetEm.getBoundingClientRect().width) + 6;
          emClip = document.createElement('span');
          emClip.className = 'em-clip';
          emClip.style.setProperty('--em-w', naturalW + 'px');
          greetEm.parentNode.insertBefore(emClip, greetEm);
          emClip.appendChild(greetEm);
        }
      }

      // t=0: clock-in screen leaves, greeting fades in over it.
      if (clockinEl) clockinEl.classList.add('is-leaving');
      if (greetEl) {
        greetEl.classList.add('is-visible');
        greetEl.setAttribute('aria-hidden', 'false');
      }
      setTimeout(() => { if (clockinEl) clockinEl.style.display = 'none'; }, 520);

      // t=1400: typewriter starts
      setTimeout(() => emClip && emClip.classList.add('is-revealed', 'is-typing'), 1400);
      // t=2400: caret drops
      setTimeout(() => emClip && emClip.classList.remove('is-typing'), 2400);

      // t=3200: greeting fades + shell dives in (iOS zoom + sidebar stagger)
      setTimeout(() => {
        if (greetEl) {
          greetEl.classList.remove('is-visible');
          greetEl.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.add('is-unlocked');
        /* Slice D · la caisse s'ouvre sur le registre (vente rapide) :
           ringuer à zéro tap ; la salle reste à un tap. */
        setMode('vrap');
        setVrapView('builder');
        if (shellEl)  shellEl.classList.add('is-entering');
        if (topbarEl) topbarEl.classList.add('is-entering');
        setTimeout(() => {
          if (shellEl)  shellEl.classList.remove('is-entering');
          if (topbarEl) topbarEl.classList.remove('is-entering');
        }, 760);
      }, 3200);

      // t=4000: greeting removed
      setTimeout(() => { if (greetEl && greetEl.parentNode) greetEl.remove(); }, 4000);
    }
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

    /* Le rapport de l'instant. Non clôturé, sans comptage de tiroir : on ne
       demande ici que ce que le journal sait déjà. */
    function rpReport() {
      try { return buildDayReport(null, 0); } catch (_) { return null; }
    }
    function rpVocab() {
      try { return window.KiwiDayReport ? window.KiwiDayReport.vocab() : null; } catch (_) { return null; }
    }
    function rpEsc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function rpHour(h) { return String(h).padStart(2, '0') + 'h'; }

    /* ── Onglet Résumé ── */
    function renderResume(r) {
      const body = $('#journal-body');
      if (!body) return;
      if (!r || (!r.txns && !(r.refunds && r.refunds.count))) {
        body.innerHTML = '<div class="rp-empty">Aucune vente pour l’instant.<br>Le rapport se remplit tout seul au premier encaissement.</div>';
        return;
      }
      const kpi = (l, v, sub, lead) =>
        `<div class="rp-kpi${lead ? ' is-lead' : ''}"><div class="rp-kpi-l">${rpEsc(l)}</div>`
        + `<div class="rp-kpi-v">${rpEsc(v)}${sub ? `<small>${rpEsc(sub)}</small>` : ''}</div></div>`;
      const row = (l, v) => `<div class="rp-r"><span class="rp-r-l">${rpEsc(l)}</span><span class="rp-r-v">${rpEsc(v)}</span></div>`;
      const M = { cash: 'Espèces', card: 'Carte', wallet: 'Virement', tap: 'Kiwi Tap', qr: 'QR', link: 'Lien' };

      /* `gross` est le brut AVANT remboursements, `methods` les porte déjà en
         négatif : afficher l'un au-dessus des autres faisait dire à l'écran
         « Encaissé 12 651 » et « Espèces 12 321 » sur la même vue · l'écart
         valait exactement les remboursements du service, et il a coûté une nuit
         de recherche à un commerçant. On nomme donc explicitement le brut et
         le net ; les modes de paiement affichent leur total net. */
      const refundAmt = (r.refunds && r.refunds.count) ? (+r.refunds.amount || 0) : 0;
      const collected = money(r.gross - refundAmt);

      let html = '<div class="rp-kpis">'
        + kpi('Net après remboursements', fmtMAD(r.net), '', true)
        + kpi('Transactions', String(r.txns))
        + kpi('Ticket moyen', fmtMAD(r.basket))
        + kpi('Ventes avant remboursements', fmtMAD(r.gross))
        + '</div>';

      const meth = Object.keys(r.methods || {}).filter(k => r.methods[k])
        .sort((a, b) => r.methods[b] - r.methods[a])
        .map(k => row(M[k] || k, fmtMAD(r.methods[k]))).join('');
      if (meth) html += `<div class="rp-sec"><div class="rp-h"><span>Moyens de paiement · net</span><em>${rpEsc(fmtMAD(collected))}</em></div>${meth}</div>`;

      /* Le rythme du service. Utile au comptoir pour une raison très concrète :
         savoir si le coup de feu est passé avant d'envoyer quelqu'un en pause. */
      const hrs = (r.hours || []).filter(h => h && (h.net > 0 || h.txns > 0));
      if (hrs.length > 1) {
        const max = hrs.reduce((m, h) => Math.max(m, h.net), 0);
        const peak = hrs.reduce((m, h) => (!m || h.net > m.net) ? h : m, null);
        const every = hrs.length > 7 ? 2 : 1;
        const cols = hrs.map(h => {
          const pct = max > 0 ? Math.max(3, Math.round(h.net / max * 100)) : 3;
          return `<div class="rp-hr${peak && h.h === peak.h ? ' is-peak' : ''}" title="${rpEsc(rpHour(h.h) + ' · ' + fmtMAD(h.net) + ' · ' + h.txns + ' ticket' + (h.txns > 1 ? 's' : ''))}">`
               + `<span class="rp-hr-b" style="height:${pct}%"></span></div>`;
        }).join('');
        const labels = hrs.map((h, i) => `<span>${i % every === 0 ? rpEsc(rpHour(h.h)) : ''}</span>`).join('');
        html += `<div class="rp-sec"><div class="rp-h"><span>Le rythme du service</span>`
              + `<em>Pic ${rpEsc(rpHour(peak.h))} · ${rpEsc(fmtMAD(peak.net))}</em></div>`
              + `<div class="rp-hrs">${cols}</div><div class="rp-hrx">${labels}</div></div>`;
      }

      let adj = '';
      if (refundAmt) {
        adj += row('Ventes brutes', fmtMAD(r.gross));
        adj += row(`Remboursements (${r.refunds.count})`, '− ' + fmtMAD(refundAmt));
      }
      if (r.discounts && r.discounts.amount) adj += row('Remises accordées', '− ' + fmtMAD(r.discounts.amount));
      if (r.tips) adj += row('Pourboires', fmtMAD(r.tips));
      if (adj) html += `<div class="rp-sec"><div class="rp-h"><span>Ajustements</span></div>${adj}</div>`;

      body.innerHTML = html;
    }

    /* ── Onglet Ventes par article ──
       LA question du comptoir : combien j'en ai vendu, de celui-là. Les données
       existaient déjà (le Z les imprime depuis toujours) mais aucun écran de la
       caisse ne les montrait · il fallait fermer la journée pour les voir. */
    function renderItems(r) {
      const body = $('#journal-body');
      if (!body) return;
      const V = rpVocab() || { item: 'article', items: 'articles', cats: 'catégories' };
      const cats = (r && r.categories) || [];
      if (!cats.length) {
        body.innerHTML = (r && r.txns)
          ? '<div class="rp-empty">Les ventes de ce service ont été encaissées sans panier détaillé.<br>Le détail par article n’existe que pour les ventes passées par la carte ou le catalogue.</div>'
          : '<div class="rp-empty">Aucun article vendu pour l’instant.</div>';
        return;
      }
      const q = journalSearch.trim().toLowerCase();
      let totQ = 0, totV = 0, shown = 0;
      const blocks = cats.map((c) => {
        const prods = (c.products || []).filter(p => !q || String(p.name).toLowerCase().includes(q));
        if (!prods.length) return '';
        shown += prods.length;
        let cq = 0, cv = 0;
        const rows = prods.map((p) => {
          cq += (+p.qty || 0); cv += (+p.total || 0);
          return `<div class="rp-it"><span class="rp-it-q">${rpEsc(p.qty)}×</span>`
               + `<span class="rp-it-n">${rpEsc(p.name)}</span>`
               + `<span class="rp-it-t">${rpEsc(fmtMAD(p.total))}</span></div>`;
        }).join('');
        totQ += cq; totV += cv;
        return `<div class="rp-cat"><div class="rp-cat-h">`
             + `<span class="rp-cat-n">${rpEsc(c.name)}</span>`
             + `<span class="rp-cat-v">${rpEsc(fmtMAD(cv))}</span></div>`
             + `<div class="rp-cat-b">${rows}</div></div>`;
      }).join('');
      if (!shown) {
        body.innerHTML = '<div class="rp-empty">Walo, aucun article ne correspond.</div>';
        return;
      }
      /* La couverture se dit quand elle n'est pas totale : un détail article qui
         ne couvre que les deux tiers du chiffre a l'air complet si on se tait. */
      const cover = (!q && r.coverage != null && r.coverage < 100)
        ? `<div class="rp-note">Ce détail porte sur ${r.coverage}% du chiffre encaissé · les ventes sans panier détaillé n’y figurent pas.</div>` : '';
      body.innerHTML = `<div class="rp-sec"><div class="rp-h"><span>${rpEsc(V.items)} vendus</span>`
        + `<em>${rpEsc(String(totQ))} · ${rpEsc(fmtMAD(totV))}</em></div>${blocks}${cover}</div>`;
    }

    /* ── Onglet Journal ── (l'ancien tiroir, mot pour mot) */
    function renderJournalList() {
      /* Le résumé de la barre d'outils est posé par renderJournal() · il change
         de nature selon l'onglet, donc il ne s'écrit plus ici. */
      const q = journalSearch.trim().toLowerCase();
      /* Les ventes sorties des livres ne se réimpriment pas et ne se remboursent
         pas : les laisser dans la liste, c'est laisser un caissier rendre de
         l'argent sur une vente qui n'existe plus. */
      let list = journal.filter(e => !e.voided).reverse();  // newest first
      if (journalFilter !== 'all') list = list.filter(e =>
        journalFilter === 'complimentary'
          ? (e.kind === 'complimentary' || e.settlementKind === 'complimentary' || e.method === 'complimentary')
          : e.method === journalFilter);
      if (q) list = list.filter(e =>
        e.label.toLowerCase().includes(q) ||
        e.ref.toLowerCase().includes(q) ||
        String(e.amount).includes(q)
      );

      const body = $('#journal-body');
      if (!body) return;
      if (list.length === 0) {
        body.innerHTML = '<div class="jr-empty">Walo, aucune transaction ne correspond.</div>';
        return;
      }
      body.innerHTML = list.map(e => {
        const hh = String(e.time.getHours()).padStart(2, '0');
        const mm = String(e.time.getMinutes()).padStart(2, '0');
        const isRefund = e.kind === 'refund';
        const isComplimentary = e.kind === 'complimentary' || e.settlementKind === 'complimentary' || e.method === 'complimentary';
        const icCls  = isRefund ? 'refund' : (isComplimentary ? 'complimentary' : e.method);
        const icon   = isRefund ? 'corner-up-left' : (isComplimentary ? 'gift' : (e.method === 'cash' ? 'banknote' : 'credit-card'));
        const mLabel = isComplimentary ? 'Offerte' : ({ cash: 'Espèces', card: 'Carte', wallet: 'Virement', tap: 'Kiwi Tap', qr: 'QR' }[e.method] || 'Autre');
        const fresh  = e.id === lastSaleId ? ' jr-entry--fresh' : '';
        const amtTxt = isRefund
          ? '− ' + fmtMAD(Math.abs(e.amount))
          : fmtMAD(e.amount);
        const refundedTag = e.refunded
          ? `<span class="jr-tag-refunded">remboursé</span>` : '';
        const sourceMeta = e.origin === 'employee'
          ? ` · App employé${e.cashier ? ' · ' + rpEsc(e.cashier) : ''}`
          : (e.origin === 'orderpro' ? ' · OrderPro' : '');
        const tipMeta = (!isRefund && e.tip > 0)
          ? ` · pourboire ${fmtMAD(e.tip)}` : '';
        return `<button class="jr-entry${fresh}" data-jr-id="${escTeam(e.id || '')}"${e.id ? '' : ' disabled'}>`
             + `<span class="jr-entry-ic jr-entry-ic--${icCls}"><i data-lucide="${icon}"></i></span>`
             + `<span class="jr-entry-main">`
             /* L'étiquette porte maintenant le nom de table, saisi par le
                commerçant : elle passe par l'échappement comme ses voisines. */
             +   `<span class="jr-entry-label">${rpEsc(e.label)}${refundedTag}</span>`
             +   `<span class="jr-entry-meta">${hh}:${mm} · ${mLabel} · ${e.ref}${sourceMeta}${tipMeta}</span>`
             + `</span>`
             + `<span class="jr-entry-amount${isRefund ? ' is-refund' : ''}">${amtTxt}</span>`
             + `<span class="jr-entry-invoice" data-jr-invoice="${escTeam(e.id || '')}" role="button" tabindex="0" aria-label="Facture A4 ${escTeam(e.ref)}"><i data-lucide="file-text"></i></span>`
             + `<span class="jr-entry-reprint" data-jr-print="${escTeam(e.id || '')}" role="button" tabindex="0" aria-label="Réimprimer le ticket ${escTeam(e.ref)}"><i data-lucide="printer"></i></span>`
             + `</button>`;
      }).join('');
      if (window.lucide) lucide.createIcons();
    }

    /* Le chef d'orchestre. Les autres modules appellent renderJournal() quand une
       vente tombe ou qu'un remboursement passe : ils n'ont pas à savoir quel
       onglet est ouvert, ils demandent un rafraîchissement et c'est tout. */
    function renderJournal() {
      const tot = journalTotals();
      const sumEl = $('#jr-summary');
      const searchEl = $('#rp-search');
      const filtEl = $('#jr-filters');
      const input = $('#jr-search-input');

      /* Une seule barre d'outils pour trois onglets : ce qui n'a pas de sens
         disparaît au lieu de rester là sans effet. Les filtres carte/espèces ne
         veulent rien dire sur un classement d'articles. */
      if (searchEl) searchEl.hidden = (rpTab === 'resume');
      if (filtEl) filtEl.hidden = (rpTab !== 'journal');
      if (input) input.placeholder = (rpTab === 'items')
        ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rechercher un article') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rechercher, table, montant, réf');

      let r = null;
      if (rpTab !== 'journal') r = rpReport();

      if (sumEl) {
        if (rpTab === 'items' && r) {
          const V = rpVocab() || { items: 'articles' };
          const n = (r.categories || []).reduce((s, c) => s + (+c.qty || 0), 0);
          sumEl.textContent = `${n} ${V.items} · ${(r.categories || []).length} ${(r.categories || []).length > 1 ? (V.cats || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('catégories')) : (V.cat || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('catégorie'))}`;
        } else {
          sumEl.textContent = `${tot.txns} transaction${tot.txns > 1 ? 's' : ''} · ${fmtMAD(tot.revenue)} encaissés`;
        }
      }

      if (rpTab === 'resume') renderResume(r);
      else if (rpTab === 'items') renderItems(r);
      else renderJournalList();

      renderRapportFoot();
    }

    /* Les actions du pied suivent l'onglet : on imprime ce qu'on est en train
       de lire, pas un menu d'impressions dont deux sur trois ne correspondent
       pas à l'écran. */
    function renderRapportFoot() {
      const foot = $('#rp-foot');
      if (!foot) return;
      const has = journal.some(e => !e.voided);
      let html = '';
      if (rpTab === 'items') {
        html = `<button class="rp-btn primary" data-rp-act="print-items"><i data-lucide="printer"></i><span>Imprimer les ventes par article</span></button>`;
      } else if (rpTab === 'journal') {
        html = `<button class="rp-btn" data-rp-act="reprint-last"><i data-lucide="rotate-ccw"></i><span>Réimprimer le dernier ticket</span></button>`;
      } else {
        html = `<button class="rp-btn primary" data-rp-act="print-report"><i data-lucide="printer"></i><span>Imprimer le rapport</span></button>`;
      }
      foot.innerHTML = html;
      foot.hidden = !has;
      if (window.lucide) lucide.createIcons();
    }

    /* Le ticket « ventes par article ». Il se sort EN PLEIN SERVICE · c'est tout
       son intérêt · donc il porte « EN COURS » et pas d'heure de fermeture : un
       ticket daté d'une clôture qui n'a pas eu lieu est un faux. */
    function printItemSales() {
      const r = rpReport();
      if (!r) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport indisponible')); return; }
      if (!window.KiwiPrinter || !window.KiwiPrinter.printDayReport) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Imprimante indisponible')); return; }
      const V = rpVocab() || { items: 'articles' };
      const opts = dayReportPrintOpts(r, registerClosing ? '' : 'EN COURS');
      opts.itemsOnly = true;
      opts.title = 'VENTES PAR ' + String(V.item || 'article').toUpperCase();
      opts.closedLabel = '';
      opts.noItemsWord = 'Aucun article détaillé';
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression…'));
      Promise.resolve(window.KiwiPrinter.printDayReport(opts)).then(
        (res) => toast(res && res.ok ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ventes par article imprimées') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression impossible')),
        () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression impossible')));
    }
    function printLiveReport() {
      const r = rpReport();
      if (!r) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport indisponible')); return; }
      doPrintDayReport(r, registerClosing ? '' : 'EN COURS');
    }
    /* Le rouleau bourre sur la dernière vente : c'est le geste de panne le plus
       fréquent d'un comptoir, il mérite un bouton et pas une chasse dans la
       liste. Les ventes sorties des livres ne comptent pas. */
    function reprintLastTicket() {
      const last = journal.slice().reverse().find(e => e && !e.voided && e.kind !== 'refund');
      if (!last) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucun ticket à réimprimer')); return; }
      printSaleTicket(last, { copy: true });
    }

    function openJournal(tab) {
      lastSaleId = null;
      rpTab = tab || 'journal';
      $$('#rp-tabs [data-rp-tab]').forEach((b) => {
        const on = b.dataset.rpTab === rpTab;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const dayEl = $('#rp-day');
      if (dayEl) {
        const d = String(currentBusinessDay() || '').split('-');
        dayEl.textContent = d.length === 3 ? `· ${d[2]}/${d[1]}` : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('· ce service');
      }
      renderJournal();
      $('#journal-drawer').classList.add('is-open');
    }
    function closeJournal() { $('#journal-drawer').classList.remove('is-open'); }

    /* ---- Fond de caisse · opening float + cash sales + cash tips + movements ---- */
    function handoverGapCents() {
      return handovers.reduce((sum, handover) => sum + minor(handover && handover.ecart), 0);
    }
    function drawerExpected() {
      /* GENERATED SHARED KiwiDrawerReportModel BEGIN */
      /* Copy of functions/api/_rules-day-report.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
      var KiwiDrawerReportModel = (function () {
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
      /* GENERATED SHARED KiwiDrawerReportModel END */
      const t = journalTotals();
      /* Once a signed handover has counted the physical drawer, its gap is no
         longer the incoming cashier's responsibility. Carry every signed gap
         into the final expected amount so the passation slips and Z reconcile
         exactly, while the individual gaps remain visible in the report. */
      return major(KiwiDrawerReportModel.expectedCashCents(minor(openingFloat), t.cashC, t.cashTipsC, t.movesInC, t.movesOutC, handoverGapCents()));
    }
    function paintCmTypeLabels() {
      const L = CM_TYPE_LABEL[carteLang()] || CM_TYPE_LABEL.fr;
      $$('#cm-type .cm-type-btn').forEach(b => {
        const s = b.querySelector('.cm-type-label');
        if (s && L[b.dataset.cmType]) s.textContent = L[b.dataset.cmType];
      });
    }

    function updateCmCustomVisibility() {
      const wrap = $('#cm-custom-wrap');
      const input = $('#cm-custom-input');
      const label = $('#cm-custom-label');
      if (!wrap || !input || !label) return;
      if (cmReason === 'Autre') {
        wrap.removeAttribute('hidden');
        const isOut = (cmType === 'out');
        label.textContent = isOut
          ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Précisez le motif de la sortie (obligatoire)')
          : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Précisez le motif de l'entrée (obligatoire)");
        input.placeholder = isOut
          ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ex. Pain, taxi, courses, réparation...')
          : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Ex. Fond d'appoint, remboursement...");
        setTimeout(() => input.focus(), 50);
      } else {
        wrap.setAttribute('hidden', '');
        input.value = '';
      }
    }

    function renderCmReasons() {
      cmReason = CM_REASONS[cmType][0];
      $('#cm-reasons').innerHTML = CM_REASONS[cmType].map((r, i) =>
        `<button class="cm-reason${i === 0 ? ' is-active' : ''}" data-cm-reason="${r}">${r}</button>`
      ).join('');
      updateCmCustomVisibility();
    }
    function renderCmList() {
      const list = $('#cm-list');
      if (!list) return;
      if (cashMovements.length === 0) {
        list.innerHTML = '<div class="cm-empty">Aucun mouvement enregistré.</div>';
        return;
      }
      list.innerHTML = cashMovements.slice().reverse().map(m => {
        const hh = String(m.time.getHours()).padStart(2, '0');
        const mm = String(m.time.getMinutes()).padStart(2, '0');
        const icon = m.type === 'in' ? 'arrow-down-to-line' : 'arrow-up-from-line';
        const sign = m.type === 'in' ? '+ ' : '− ';
        const cleanReason = String(m.reason || 'Autre').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const cleanActor = m.actorName ? ` · <span style="opacity:0.8">${String(m.actorName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</span>` : '';
        return `<div class="cm-row">`
          + `<span class="cm-row-ic cm-row-ic--${m.type}"><i data-lucide="${icon}"></i></span>`
          + `<span class="cm-row-reason">${cleanReason}${cleanActor}</span>`
          + `<span class="cm-row-time">${hh}:${mm}</span>`
          + `<span class="cm-row-amt cm-row-amt--${m.type}">${sign}${fmtMAD(m.amount)}</span>`
          + `</div>`;
      }).join('');
      if (window.lucide) lucide.createIcons();
    }
    function openCashMove() {
      if (isFeatureOff('cash-move') || isFeatureOff('cashMove')) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Mouvements de caisse désactivés pour cet établissement'));
        return;
      }
      cmType = 'out';
      $$('#cm-type .cm-type-btn').forEach(b => b.classList.toggle('is-active', b.dataset.cmType === 'out'));
      paintCmTypeLabels();
      if (!cmLangHooked && window.KiwiCaisseLang && window.KiwiCaisseLang.subscribe) {
        cmLangHooked = true;
        window.KiwiCaisseLang.subscribe(paintCmTypeLabels);
      }
      $('#cm-amount').value = '';
      const customInput = $('#cm-custom-input');
      if (customInput) customInput.value = '';
      renderCmReasons();
      renderCmList();
      $('#cm-current').textContent = fmtMAD(drawerExpected());
      $('#cash-move-modal').classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      setTimeout(() => { const a = $('#cm-amount'); if (a) a.focus(); }, 60);
    }
    function closeCashMove() { $('#cash-move-modal').classList.remove('is-open'); }
    function confirmCashMove() {
      /* `money()` arrondit au centime ; `Math.round()` arrondissait au dirham.
         Un apport de 12,50 entrait à 13 et une sortie de 12,50 sortait à 13 :
         le fond de caisse dérivait d'un demi-dirham par mouvement, en silence,
         et l'écart de passation en fin de service accusait le compteur. */
      const amount = money(parseFloat($('#cm-amount').value) || 0);
      if (amount <= 0) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Saisis un montant')); return; }
      const customInput = $('#cm-custom-input');
      const customVal = (customInput && customInput.value ? customInput.value.trim() : '');
      if (cmReason === 'Autre' && !customVal) {
        toast(cmType === 'in' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Précisez le motif de l'entrée") : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Précisez le motif de la sortie"));
        if (customInput) customInput.focus();
        return;
      }
      const finalReason = (cmReason === 'Autre') ? customVal : (cmReason || 'Autre');

      window.KiwiAuthAct?.(cmType === 'in' ? { kind: 'cash_in', key: 'act.cash_in', args: { amount: fmtMAD(amount) } } : { kind: 'cash_out', key: 'act.cash_out', args: { amount: fmtMAD(amount) } });
      requireTillOperator(`${cmType === 'in' ? 'Entrée' : 'Sortie'} de caisse · ${fmtMAD(amount)}`, (actor) => {
        const actorId = String((actor && actor.id) || cashActorId()).slice(0, 96);
        const actorName = String((actor && actor.name) || (currentCashier && currentCashier.name) || 'Caissier').slice(0, 80);
        cashMovements.push({
          id: 'cm-' + Date.now(), time: new Date(),
          type: cmType, amount: amount, reason: finalReason,
          actorId: actorId, actorName: actorName,
        });
        emitCashSession({
          sessionId: cashSessionId(), eventType: 'movement', expectedCents: Math.round(drawerExpected() * 100),
          countedCents: null, gapCents: null, movementKind: cmType,
          movementAmountCents: Math.round(amount * 100), movementReason: finalReason,
          actorId: actorId, openedAt: shiftOpenedAt.getTime(), occurredAt: Date.now()
        });
        refreshOpenReconciliationModals();
        toast(`${cmType === 'in' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Entrée') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Sortie')} de caisse · ${fmtMAD(amount)} (${actorName})`);
        closeCashMove();
      });
    }

    /* ── Ouverture sans vente ─────────────────────────────────────────────
     * Le tiroir ne s'ouvre hors vente que sous code manager · vérifié côté
     * serveur (assets/caisse-pairing.js), jamais dans le navigateur · et
     * chaque ouverture laisse une trace dans les mouvements de caisse :
     * montant nul, le fond attendu ne bouge pas, mais la passation et le
     * rapport journalier montrent qui a fait sonner le tiroir et quand. */
    function openDrawerNoSale() {
      if (isFeatureOff('open-drawer') || isFeatureOff('openDrawer')) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ouverture manuelle du tiroir désactivée pour cet établissement'));
        return;
      }
      window.KiwiAuthAct?.({ kind: 'open_drawer', key: 'act.open_drawer' });
      requireManager('Ouvrir le tiroir sans vente', () => {
        cashMovements.push({
          id: 'cm-' + Date.now(), time: new Date(),
          type: 'out', amount: 0, reason: 'Ouverture sans vente',
        });
        emitCashSession({
          sessionId: cashSessionId(), eventType: 'movement', expectedCents: Math.round(drawerExpected() * 100),
          countedCents: null, gapCents: null, movementKind: 'no-sale', movementAmountCents: 0,
          movementReason: 'Ouverture sans vente', actorId: cashActorId(),
          openedAt: shiftOpenedAt.getTime(), occurredAt: Date.now()
        });
        const H = window.KiwiHardware;
        const p = (H && H.openDrawer) ? Promise.resolve(H.openDrawer()) : Promise.resolve({ ok: false });
        p.then((res) => {
          if (res && res.ok) toast(res.mock ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Tiroir ouvert (démo)') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Tiroir ouvert'));
          else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Tiroir injoignable · vérifiez l\'imprimante du comptoir'));
        }, () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Tiroir injoignable · vérifiez l\'imprimante du comptoir')));
      });
    }

    /* ── Clock-in : le fond d'ouverture ───────────────────────────────────────
     * Trois pastilles rondes pour la voie rapide, « Autre » pour le montant réel.
     * Le montant retenu est mémorisé : un café qui ouvre tous les matins avec
     * 750 MAD ne doit pas le ressaisir tous les matins. Un fond de 0 est
     * légitime (tiroir vide, comptage plus tard) · seul le négatif ne l'est
     * pas, et c'est la seule valeur qu'on refuse.
     *
     * La mémoire est rangée par établissement (`kiwi:openingFloat:v1:<slug>`) :
     * un même appareil sert parfois deux commerces du même patron · la boutique
     * ouvre à 300, le café à 1 200 · et le préfixe `kiwi:` la fait balayer par
     * purgeTenantState() au changement de compte (assets/identity.js). */
    function floatMemKey() {
      try { const p = storePaired(); if (p && p.merchant) return 'kiwi:openingFloat:v1:' + p.merchant; } catch (_) {}
      return 'kiwi:openingFloat:v1:demo';
    }
    /* Le bouton « Ouvrir la caisse » et l'aide suivent le choix : désactivé et
       aide visible tant que rien n'est choisi. Le mode support (reprise d'un
       service déjà ouvert) n'a pas de fond à compter : il reste actif. */
    function syncFloatGate() {
      const resume = typeof operatorCaisseRequested === 'function' && operatorCaisseRequested();
      const btn = document.getElementById('clockin-btn');
      /* Sous le kit, le fond se compte dans la feuille du kit : le bouton l'ouvre. */
      const root = document.documentElement;
      const kit = !!(root && root.hasAttribute && root.hasAttribute('data-k-till'));
      if (btn && !btn.classList.contains('is-confirmed')) btn.disabled = !floatChosen && !resume && !kit;
      if (floatErr) floatErr.hidden = floatChosen || resume || kit;
    }
    function readFloatInput() {
      const v = parseFloat(floatInput && floatInput.value);
      return Number.isFinite(v) && v > 0 ? v : 0;
    }
    function rememberFloat(v) {
      try { localStorage.setItem(floatMemKey(), String(v)); } catch (_) {}
    }
    function markFloatChip(chip) {
      $$('#ci-float-chips .ci-float-chip').forEach(c => c.classList.toggle('is-active', c === chip));
    }
    function showFloatCustom(on, focus) {
      if (!floatCustom) return;
      floatCustom.hidden = !on;
      const btn = floatChips && floatChips.querySelector('[data-float="custom"]');
      if (btn) btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on && focus && floatInput) { floatInput.focus(); floatInput.select(); }
    }

    /* Restitution du dernier fond utilisé. Rejouée à l'appairage : la caisse
       démarre avant de savoir à quel établissement elle est liée, et c'est le
       slug qui dit quel montant se souvenir. */
    function restoreFloat() {
      let saved = NaN;
      try { saved = parseFloat(localStorage.getItem(floatMemKey())); } catch (_) {}
      const hasSaved = Number.isFinite(saved) && saved >= 0;
      /* Rien n'est présélectionné, sur aucun commerce, démo comprise. Le dernier
         fond n'est qu'un raccourci proposé · c'est un contact du caissier qui
         l'engage. */
      if (!floatChosen) {
        openingFloat = 0; markFloatChip(null); showFloatCustom(false);
        if (floatLast) {
          if (hasSaved) {
            floatLast.textContent = 'Dernier fond : ' + saved + ' MAD';
            floatLast.dataset.value = String(saved);
            floatLast.hidden = false;
          } else floatLast.hidden = true;
        }
      }
      syncFloatGate();
    }
    function routeAccessPin(code) {
      if (pinRoutePending) return;
      pinRoutePending = true;
      if (code === '0001') { setTimeout(() => { pinRoutePending = false; unlockKitchenScreen(); }, 180); return; }
      const tryVertical = (remaining) => {
        if (window.KiwiPosDispatch && window.KiwiPosDispatch.has(code)) {
          pinRoutePending = false;
          window.KiwiPosDispatch.unlock(code);
          return;
        }
        /* Deferred scripts may not have evaluated yet on a cold/slow first
           load. A reserved specialist PIN must never fall through into the
           restaurant register merely because its dispatcher is 200 ms late. */
        if (verticalDemoPins.has(code) && remaining > 0) {
          setTimeout(() => tryVertical(remaining - 1), 100);
          return;
        }
        pinRoutePending = false;
        if (verticalDemoPins.has(code)) {
          toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Module métier indisponible · rechargez la caisse'));
          pinBuffer = '';
          renderPinDots();
          return;
        }
        unlockApp();
      };
      setTimeout(() => tryVertical(30), 180);
    }
