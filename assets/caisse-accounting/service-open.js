
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
