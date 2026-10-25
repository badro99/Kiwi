/* Owner: caisse cashier handover and accounting API helpers.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */


    /* ===========================================================
       PASSATION DE CAISSE · cashier shift handover
       -----------------------------------------------------------
       Two cashiers share a business day. At the shift change the
       OUTGOING cashier counts the drawer; the INCOMING cashier
       recounts to verify; only when the two counts agree does the
       handover go through. Both names land on a printable "bon de
       passation" so any end-of-day shortfall is bracketed to the
       right poste · the mutual count IS the control (no manager PIN).
       =========================================================== */
    function cashierInitials(name) {
      return (name || '?').trim().split(/\s+/)
             .map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
    }
    function fmtEcart(e) {
      e = money(e);
      if (e === 0) return '0 MAD';
      return (e > 0 ? '+ ' : '− ') + fmtMAD(Math.abs(e));
    }
    function pad2HO(n) { return String(n).padStart(2, '0'); }

    /* Roll up journal + cash movements for ONE poste (entries since `sinceMs`). */
    function posteRollup(sinceMs) {
      return rollupLedger(sinceMs);
    }

    /* Apply the live cashier identity to the sidebar card. */
    function renderCashierCard() {
      const nameEl = document.querySelector('.cashier-name');
      const roleEl = document.querySelector('.cashier-role');
      if (nameEl) nameEl.textContent = currentCashier.name;
      if (roleEl) roleEl.textContent = currentCashier.role
        + (handovers.length > 0 ? ' · poste ' + (handovers.length + 1) : '');
    }

    
    /* The pill only means something once the till is paired: until then it
       hid a dead control (tap → "must be paired first"). Once paired it shows
       the id's tail so support can read it off the screen. */
    function syncTerminalIdButton() {
      if (!terminalIdButton) return;
      const id = window.KiwiCaisseContext.current().terminalId;
      terminalIdButton.hidden = !id;
      if (id) terminalIdButton.textContent = 'ID · ' + id.slice(-6).toUpperCase();
    }
    

    function showHandoverStep(step) {
      $('#ho-step-count').hidden  = step !== 'count';
      $('#ho-step-verify').hidden = step !== 'verify';
      $('#ho-step-done').hidden   = step !== 'done';
    }

    /* Step 1 · outgoing cashier's poste recap + drawer reconciliation. */
    function renderHandoverCount(preserveCount = false) {
      const now      = new Date();
      const openedAt = posteOpenedAt || shiftOpenedAt || now;
      const durMin   = Math.max(0, Math.floor((now - openedAt) / 60000));
      const r        = posteRollup(openedAt.getTime());
      handoverState.expected = major(minor(posteOpeningFloat) + r.cashC + r.cashTipsC + r.movesInC - r.movesOutC);

      $('#ho-count-sub').textContent =
        `${currentCashier.name} termine son poste, compte le tiroir.`;

      const recap = [
        ['Poste ouvert à', `${pad2HO(openedAt.getHours())}:${pad2HO(openedAt.getMinutes())}`],
        ['Durée du poste', fmtDur(durMin)],
        ['Transactions',   String(r.txns)],
        ['Encaissé',       fmtMAD(r.revenue)],
      ];
      $('#ho-recap').innerHTML = recap.map(x =>
        `<div class="ho-recap-row"><span class="k">${x[0]}</span><span class="v">${x[1]}</span></div>`
      ).join('');

      const lines = [
        ['Fond du poste',      fmtMAD(posteOpeningFloat), ''],
        ['Espèces encaissées', '+ ' + fmtMAD(r.cash),     ''],
      ];
      if (r.cashTips > 0) lines.push(['Pourboires espèces', '+ ' + fmtMAD(r.cashTips), '']);
      if (r.movesIn  > 0) lines.push(['Entrées de caisse',  '+ ' + fmtMAD(r.movesIn),  '']);
      if (r.movesOut > 0) lines.push(['Sorties de caisse',  '− ' + fmtMAD(r.movesOut), '']);
      lines.push(['Attendu en caisse', fmtMAD(handoverState.expected), 'is-total']);
      $('#ho-recon').innerHTML = lines.map(l =>
        `<div class="ho-recon-line ${l[2]}"><span>${l[0]}</span><span class="mono">${l[1]}</span></div>`
      ).join('');

      if (!preserveCount) {
        const inp = $('#ho-count');
        if (inp) inp.value = '';
      }
      updateHandoverEcart();
    }

    function updateHandoverEcart() {
      const box = $('#ho-ecart'), out = $('#ho-ecart-val'), inp = $('#ho-count');
      if (!box || !out) return;
      box.classList.remove('is-ok', 'is-off');
      const raw = inp ? inp.value : '';
      if (raw === '' || raw == null) { out.textContent = '·'; return; }
      /* Le comptage physique se fait à la pièce : il y a des 5 et des 10
         centimes dans le tiroir. Arrondir au dirham fabriquait jusqu'à 0,50 MAD
         d'écart sur un tiroir pourtant juste · et le caissier repartait chercher
         une erreur qui n'existait pas. On garde le centime. */
      handoverState.counted = money(parseFloat(raw) || 0);
      const ecart = major(minor(handoverState.counted) - minor(handoverState.expected));
      out.textContent = fmtEcart(ecart);
      box.classList.add(Math.abs(ecart) <= 5 ? 'is-ok' : 'is-off');
    }

    /* Step 2 · incoming cashier picker + verification recount. */
    function renderHandoverVerify() {
      const list = CASHIER_ROSTER.filter(c => c.id !== currentCashier.id);
      /* Sans repreneur enregistré, la passation ne peut aboutir : on le dit et on
         indique où ajouter un poste, plutôt que de laisser une liste vide. */
      $('#ho-cashiers').innerHTML = list.length ? list.map(c =>
        `<button class="ho-cashier" data-ho-cashier="${c.id}">`
        + `<span class="ho-cashier-av">${escTeam(cashierInitials(c.name))}</span>`
        + `<span class="ho-cashier-main">`
        +   `<span class="ho-cashier-name">${escTeam(c.name)}</span>`
        +   `<span class="ho-cashier-role">${escTeam(c.role)}</span>`
        + `</span>`
        + `<span class="ho-cashier-tick"><i data-lucide="check-circle-2"></i></span>`
        + `</button>`
      ).join('') : '<div class="ho-empty">Aucun autre poste enregistré sur cette caisse. Ajoutez un caissier depuis le tableau de bord (Équipe) avant de passer la main.</div>';
      if (handoverState.incoming) {
        const card = $(`#ho-cashiers [data-ho-cashier="${handoverState.incoming.id}"]`);
        if (card) card.classList.add('is-active');
      }
      $('#ho-takeover-val').textContent = fmtMAD(handoverState.counted);
      $('#ho-verify').value = '';
      handoverState.verifyCount = 0;
      updateHandoverVerdict();
    }

    function updateHandoverVerdict() {
      const v   = $('#ho-verdict');
      const btn = $('#ho-verify-confirm');
      if (!v || !btn) return;
      v.classList.remove('is-idle', 'is-ok', 'is-warn');
      const raw = $('#ho-verify') ? $('#ho-verify').value : '';
      let icon, msg, cls, enabled = false;
      if (!handoverState.incoming) {
        cls = 'is-idle'; icon = 'info';
        msg = 'Choisis le caissier entrant.';
      } else if (raw === '' || raw == null) {
        cls = 'is-idle'; icon = 'calculator';
        msg = `<b>${escTeam(handoverState.incoming.name)}</b> recompte le tiroir pour vérifier.`;
      } else {
        handoverState.verifyCount = money(parseFloat(raw) || 0);
        if (minor(handoverState.verifyCount) === minor(handoverState.counted)) {
          cls = 'is-ok'; icon = 'shield-check'; enabled = true;
          msg = `Les deux comptes concordent, <b>${fmtMAD(handoverState.counted)}</b>. Caisse vérifiée.`;
        } else {
          cls = 'is-warn'; icon = 'alert-triangle';
          const diff = major(minor(handoverState.verifyCount) - minor(handoverState.counted));
          msg = `Écart de <b>${fmtEcart(diff)}</b> avec le sortant, recomptez ensemble.`;
        }
      }
      v.classList.add(cls);
      v.innerHTML = `<i data-lucide="${icon}"></i><span>${msg}</span>`;
      btn.disabled = !enabled;
      if (window.lucide) lucide.createIcons();
    }

    /* Step 3 · the printable handover slip. */
    function renderHandoverSlip(rec) {
      const d        = new Date(rec.time);
      const opened   = new Date(rec.posteOpenedAt);
      const ecartCls = Math.abs(rec.ecart) <= 5 ? 'is-ok' : 'is-off';
      $('#ho-done-sub').textContent =
        `${rec.toName} reprend la caisse, ${rec.fromName} est dégagé de toute responsabilité sur la suite.`;
      $('#ho-slip').innerHTML =
          `<div class="ho-slip-head">`
        +   `<div class="ho-slip-title">Bon de passation</div>`
        +   `<div class="ho-slip-date">${storeName()} · ${pad2HO(d.getDate())}/${pad2HO(d.getMonth()+1)}/${d.getFullYear()} · ${pad2HO(d.getHours())}:${pad2HO(d.getMinutes())}</div>`
        + `</div>`
        + `<div class="ho-slip-row"><span class="k">Poste ouvert à</span><span class="v mono">${pad2HO(opened.getHours())}:${pad2HO(opened.getMinutes())}</span></div>`
        + `<div class="ho-slip-row"><span class="k">Attendu en caisse</span><span class="v mono">${fmtMAD(rec.expected)}</span></div>`
        + `<div class="ho-slip-row"><span class="k">Espèces comptées</span><span class="v mono">${fmtMAD(rec.counted)}</span></div>`
        + `<div class="ho-slip-ecart ${ecartCls}"><span>Écart constaté</span><span class="mono">${fmtEcart(rec.ecart)}</span></div>`
        + `<div class="ho-slip-row" style="margin-top:8px;"><span class="k">Caisse transmise</span><span class="v mono">${fmtMAD(rec.counted)}</span></div>`
        + `<div class="ho-slip-sign">`
        +   `<div class="ho-slip-sign-col"><div class="ho-slip-sign-name">${rec.fromName}</div><div class="ho-slip-sign-role">Caissier sortant</div></div>`
        +   `<div class="ho-slip-sign-col"><div class="ho-slip-sign-name">${rec.toName}</div><div class="ho-slip-sign-role">Caissier entrant</div></div>`
        + `</div>`;
    }

    function openHandover() {
      if (isFeatureOff('passation')) {
        toast('Passation de caisse désactivée pour cet établissement');
        return;
      }
      handoverState.counted = 0;
      handoverState.incoming = null;
      handoverState.verifyCount = 0;
      renderHandoverCount(false);
      showHandoverStep('count');
      handoverModal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      setTimeout(() => { const i = $('#ho-count'); if (i) i.focus(); }, 80);
    }
    function closeHandover() { handoverModal.classList.remove('is-open'); }

    function handoverIdentity(value) {
      return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    /* Qui peut confirmer une passation : le caissier entrant, avec SON code. Le
       pavé l'applique (requireTillOperator › validate) avant de se fermer ;
       confirmHandover la rejoue pour tout appelant qui ne passe pas par le pavé. */
    function handoverApprovalRefusal(who) {
      if (!storeIsReal()) return null;
      const inc = handoverState.incoming;
      if (!who || !who.actorProof) return 'Le caissier entrant doit confirmer avec son code personnel';
      if (!inc || !handoverIdentity(who.name) || handoverIdentity(who.name) !== handoverIdentity(inc.name)) {
        return 'Code différent de celui du caissier entrant';
      }
      return null;
    }

    function confirmHandover(who) {
      const inc = handoverState.incoming;
      if (!inc) { toast('Choisis le caissier entrant'); return; }
      const refusal = handoverApprovalRefusal(who);
      if (refusal) { toast(refusal); return false; }
      if ($('#ho-verify').value === '' ||
          minor(handoverState.verifyCount) !== minor(handoverState.counted)) {
        toast('Les deux comptes doivent concorder'); return false;
      }
      const now = new Date();
      const openedAt = posteOpenedAt || shiftOpenedAt || now;
      const r = posteRollup(openedAt.getTime());
      const freshExpected = major(minor(posteOpeningFloat) + r.cashC + r.cashTipsC + r.movesInC - r.movesOutC);
      handoverState.expected = freshExpected;
      const ecart = major(minor(handoverState.counted) - minor(freshExpected));
      const rec = {
        id: 'ho-' + Date.now(),
        time: now,
        fromName: currentCashier.name,
        toName: inc.name,
        posteOpenedAt: openedAt,
        expected: freshExpected,
        counted: handoverState.counted,
        ecart: ecart,
        confirmedById: (who && who.id) || inc.id,
        confirmedByName: (who && who.name) || inc.name,
      };
      handovers.push(rec);
      emitCashSession({
        sessionId: cashSessionId(), eventType: 'handover',
        expectedCents: minor(rec.expected), countedCents: minor(rec.counted),
        gapCents: minor(rec.ecart), actorId: cashActorId(currentCashier.id),
        counterpartyActorId: cashActorRef((who && who.id) || inc.id), openedAt: shiftOpenedAt.getTime(), occurredAt: now.getTime()
      });
      // The incoming cashier takes the counted drawer over as their float.
      currentCashier    = { id: inc.id, name: inc.name, role: inc.role };
      posteOpenedAt     = now;
      posteOpeningFloat = handoverState.counted;
      renderCashierCard();
      renderHandoverSlip(rec);
      showHandoverStep('done');
      persistShift();
      if (window.lucide) lucide.createIcons();
      toast('Passation enregistrée · ' + inc.name + ' prend la caisse');
      return true;
    }

    

    /* Les fiches techniques arrivent par un autre document, `costs`, que rien
       n'ouvrait avant la PREMIÈRE vente : c'est inventory-consumption.js qui le
       lisait, au moment d'encaisser. Une caisse sans copie locale (tablette
       neuve, stockage vidé) vendait donc ce premier article avec une copie
       vide, et ne consommait aucun ingrédient. Tant qu'il n'est pas ouvert, le
       relevé toutes les 30 s de caisse-refresh.js (KiwiCloudDoc.pullAll) ne le
       connaît pas non plus. On l'ouvre au démarrage et à chaque appairage :
       get() lit la copie serveur une fois, puis pullAll() la tient à jour. */
    function bindRecipes() {
      try { window.KiwiCost && window.KiwiCost.store && window.KiwiCost.store.get(); } catch (_) {}
    }
    
