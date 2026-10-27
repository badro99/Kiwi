
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
