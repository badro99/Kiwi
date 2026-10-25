/* Owner: caisse manager approval, attendance and team drawers.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */
      // called when the pad closes without an approval

    function renderMgrDots() {
      $$('#mgr-dots .mgr-dot').forEach((d, i) => {
        d.classList.toggle('is-filled', i < mgrBuffer.length);
      });
    }

    function closeManagerModal() {
      const abandoned = mgrOnCancel;
      mgrOnCancel = null;
      mgrModal.classList.remove('is-open');
      mgrBuffer = '';
      mgrOnApprove = null;
      mgrBusy = false;
      mgrAuthContext = null;
      mgrNeedsServer = false;
      mgrValidate = null;
      mgrModal.classList.remove('is-error', 'is-needs-connection');
      showMgrNote('');
      $('#mgr-needs').hidden = true;
      $$('#mgr-dots .mgr-dot').forEach(d => d.classList.remove('is-filled', 'is-success'));
      if (typeof abandoned === 'function') { try { abandoned(); } catch (_) {} }
    }

    function showMgrNote(text) {
      const note = $('#mgr-note');
      if (!note) return;
      note.textContent = text || '';
      note.hidden = !text;
    }

    /* opts : voir requireTillOperator (onCancel surtout : une promesse qui attend
       l'approbation doit pouvoir se défaire si le pavé se ferme sans elle). */
    function requireManager(actionLabel, onApprove, authContext, opts) {
      openAuthorization(actionLabel, onApprove, 'manager', authContext, opts);
    }

    
    function authAct(act) { nextAuthAct = act ? { act, at: Date.now() } : null; }
    

    /* opts (all optional):
         needsServer · the act's effect is a server write with no outbox (it
                       cannot be replayed later). Offline, no code is taken: the
                       pad opens in its needs-a-connection state, and a code the
                       server could not judge is never approved by the offline
                       verifier. Nothing retries by itself.
         validate    · (who) => refusal text | null. Judges WHO the code proved,
                       on the pad, before it closes.
         hint        · replaces the line under the keys.
         onCancel    · called when the pad closes without an approval. */
    function requireTillOperator(actionLabel, onApprove, opts) {
      openAuthorization(actionLabel, onApprove, 'till', null, opts);
    }
    

    /* « Définitivement hors ligne » seulement : navigator.onLine === true ne
       prouve rien, c'est pourquoi le vérificateur refuse aussi, de son côté, de
       laisser le repli hors ligne approuver un acte qui exige le serveur. */
    function tillReachable() {
      try { return navigator.onLine !== false; } catch (_) { return true; }
    }

    function showNeedsConnection() {
      mgrBuffer = '';
      mgrBusy = false;
      mgrModal.classList.remove('is-error');
      mgrModal.classList.add('is-needs-connection');
      showMgrNote('');
      $$('#mgr-dots .mgr-dot').forEach(d => d.classList.remove('is-filled', 'is-success'));
      $('#mgr-needs').hidden = false;
    }

    function openAuthorization(actionLabel, onApprove, access, authContext, opts) {
      const act = nextAuthAct && Date.now() - nextAuthAct.at < 1000 ? nextAuthAct.act : null;
      nextAuthAct = null;
      /* kiwiSkin2027:till · the approval on the kit's pad (assets/kit/till-pin.js).
         Every approval, at both levels, joins the authorization log with the
         identity, the verdict and, for a verdict read from a row, provenAt. */
      if (window.KiwiTillPin && typeof window.KiwiTillPin.approve === 'function') {
        window.KiwiTillPin.approve({
          level: access === 'till' ? 'till' : 'manager', act, label: actionLabel,
          onApprove, onCancel: opts && opts.onCancel, needsServer: !!(opts && opts.needsServer),
          authContext: authContext || null, incoming: opts && opts.incoming, validate: opts && opts.validate,
          log: (e) => authorizations.push({ id: 'auth-' + Date.now(), time: new Date(), action: e.label, level: e.level,
            who: { id: e.id, name: e.name, role: e.role }, verdict: e.verdict, provenAt: e.provenAt }),
        });
        return;
      }
      if (typeof mgrOnCancel === 'function') { const abandoned = mgrOnCancel; mgrOnCancel = null; try { abandoned(); } catch (_) {} }
      mgrBuffer = '';
      mgrBusy = false;
      mgrAccess = access === 'till' ? 'till' : 'manager';
      mgrAuthContext = authContext || null;
      mgrOnApprove = typeof onApprove === 'function' ? onApprove : null;
      mgrNeedsServer = !!(opts && opts.needsServer);
      mgrValidate = opts && typeof opts.validate === 'function' ? opts.validate : null;
      mgrOnCancel = opts && typeof opts.onCancel === 'function' ? opts.onCancel : null;
      mgrModal.classList.remove('is-error', 'is-needs-connection');
      showMgrNote('');
      $('#mgr-needs').hidden = true;
      $('#manager-modal-title').textContent = mgrAccess === 'till' ? 'Autorisation caisse' : 'Autorisation manager';
      $('#manager-modal-sub').textContent = actionLabel || 'Action à autoriser';
      $$('#mgr-dots .mgr-dot').forEach(d => d.classList.remove('is-filled', 'is-success'));
      mgrModal.classList.add('is-open');
      const hint = mgrModal.querySelector('.mgr-hint');
      if (hint) {
        let demo = true;
        try { demo = !(window.KiwiEnv?.isReal?.() || window.KiwiCaissePairing?.isPaired?.()); } catch (_) {}
        hint.textContent = (opts && opts.hint) || (demo ? 'Démo locale · n’importe quel code' : (mgrAccess === 'till'
          ? 'Code caissier, manager ou propriétaire requis'
          : 'Code manager ou propriétaire requis'));
      }
      if (mgrNeedsServer && !tillReachable()) showNeedsConnection();
      if (window.lucide) lucide.createIcons();
    }

    /* Le verdict vient du serveur (assets/caisse-pairing.js › verifyCode), donc
       il ARRIVE : la caisse ne détient plus les codes et ne peut plus trancher
       elle-même. Toujours une promesse, y compris en démo locale, pour que
       l'appelant n'ait qu'un seul chemin à gérer. */
    function managerCodeValid(code) {
      let protectedTill = false;
      try { protectedTill = !!(window.KiwiEnv?.isReal?.() || window.KiwiCaissePairing?.isPaired?.()); } catch (_) {}
      if (!protectedTill) return Promise.resolve(true);
      const P = window.KiwiCaissePairing;
      const ask = mgrAccess === 'till' ? P?.authorizeTill : P?.authorizeManager;
      if (typeof ask !== 'function') return Promise.resolve(false);
      /* authorizeTill takes `{ needsServer }` as its second argument,
         authorizeManager takes the action context. */
      const second = mgrAccess === 'till' ? { needsServer: mgrNeedsServer } : mgrAuthContext;
      try { return Promise.resolve(ask.call(P, code, second)).then((ok) => ok === true, () => false); }
      catch (_) { return Promise.resolve(false); }
    }

    function mgrPushDigit(v) {
      if (mgrBusy || mgrBuffer.length >= 4) return;
      /* No keys in the needs-a-connection state, on screen or on a keyboard. */
      if (mgrModal.classList.contains('is-needs-connection')) return;
      if (!mgrBuffer.length) showMgrNote('');
      mgrBuffer += v;
      renderMgrDots();
      if (mgrBuffer.length === 4) {
        /* La vérification part sur le réseau : on VERROUILLE le pavé le temps de
           la réponse, sinon un cinquième chiffre frappé pendant l'aller-retour
           repartait sur une seconde vérification et le refus de la première
           effaçait un tampon qui n'était déjà plus le sien. */
        mgrBusy = true;
        const attempt = mgrBuffer;
        managerCodeValid(attempt).then((valid) => {
          if (attempt !== mgrBuffer) return;   // annulé / rouvert entre-temps
          if (!valid && mgrNeedsServer && window.KiwiCaissePairing?.lastVerifyState?.().offline) {
            /* Le serveur n'a pas pu juger le code et l'acte exige le serveur :
               on n'approuve pas, on le dit. Aucun code n'est gardé. */
            showNeedsConnection();
            return;
          }
          if (valid && mgrValidate) {
            const refusal = mgrValidate(mgrVerifiedIdentity());
            if (refusal) {
              /* Le serveur a répondu oui, mais pas pour la bonne personne : le
                 refus se lit ICI, sur le pavé, avant qu'il se ferme. */
              mgrModal.classList.add('is-error');
              showMgrNote(refusal);
              nativeHapticDanger();
              setTimeout(() => {
                mgrModal.classList.remove('is-error');
                mgrBuffer = ''; mgrBusy = false; renderMgrDots();
              }, 520);
              return;
            }
          }
          if (!valid) {
            mgrModal.classList.add('is-error');
            toast((mgrAccess === 'till' ? 'Code caisse' : 'Code manager') + ' incorrect ou impossible à vérifier');
            setTimeout(() => {
              mgrModal.classList.remove('is-error');
              mgrBuffer = ''; mgrBusy = false; renderMgrDots();
            }, 520);
            return;
          }
          mgrApprove();
        });
      }
    }

    /* Qui le code vient de prouver (jamais le code). */
    function mgrVerifiedIdentity() {
      const P = window.KiwiCaissePairing;
      return (mgrAccess === 'till' ? (P?.lastOperator?.() || P?.lastManager?.()) : P?.lastManager?.())
        || (window.KiwiStaff ? { id: window.KiwiStaff.id || 'till', name: window.KiwiStaff.name || 'Caissier', role: window.KiwiStaff.role || 'Caissier' } : null)
        || (currentCashier ? { id: currentCashier.id, name: currentCashier.name, role: currentCashier.role } : null)
        || { id: 'till', name: 'Caissier', role: 'Caissier' };
    }

    /* Le code est bon : la chorégraphie de succès puis l'action autorisée. */
    function mgrApprove() {
      mgrBusy = true;
      const action  = $('#manager-modal-sub').textContent;
      const approve = mgrOnApprove;
      const verified = mgrVerifiedIdentity();
      // Success beat · dots pop left → right, mirroring the access PIN.
      $$('#mgr-dots .mgr-dot').forEach((d, i) => {
        setTimeout(() => d.classList.add('is-success'), i * 70);
      });
      mgrOnCancel = null;   // approved: closing the pad is not an abandonment
      setTimeout(() => {
        if (mgrAccess === 'manager') authorizations.push({ id: 'auth-' + Date.now(), time: new Date(), action: action });
        closeManagerModal();
        if (approve) approve(verified);
      }, 520);
    }

    
    function renderAttendanceHistory(entries) {
      const host = $('#attendance-code-history');
      if (!host) return;
      const rows = (Array.isArray(entries) ? entries : []).slice(0, 5);
      host.innerHTML = rows.length ? `
        <div class="team-section-label">Derniers pointages</div>
        ${rows.map((entry) => {
          const arrival = entry.inTs ? new Date(entry.inTs).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : '·';
          const departure = entry.outTs ? new Date(entry.outTs).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : 'En service';
          /* Envoyé plus tard depuis le téléphone : délai déclaré visible pour le gérant. */
          const ms = Math.max(Number(entry.inDeferredMs) || 0, Number(entry.outDeferredMs) || 0);
          const total = Math.max(1, Math.round(ms / 60000)), h = Math.floor(total / 60), m = total % 60;
          const lang = String(document.documentElement.lang || 'fr').slice(0, 2);
          const note = !ms ? '' : lang === 'ar' ? `أُرسل لاحقاً من الهاتف · التأخير المصرَّح به ${h ? `${h} س ${m} د` : `${m} د`}`
            : lang === 'en' ? `Sent later from the phone · declared delay ${h ? `${h} h ${m} min` : `${m} min`}`
            : `Envoyé plus tard depuis le téléphone · délai déclaré ${h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`}`;
          return `<div style="padding:9px 0;border-bottom:1px solid var(--line);font-size:12px;"><div style="display:flex;justify-content:space-between;gap:12px;"><b>${escTeam(entry.name || 'Employé')}</b><span>${arrival} → ${departure}</span></div>${note ? `<div class="team-meta" data-attendance-deferred>${escTeam(note)}</div>` : ''}</div>`;
        }).join('')}` : '<div class="team-meta">Aucun pointage enregistré.</div>';
    }
    function renderAttendanceCodeExpiry() {
      const remaining = Math.max(0, attendanceCodeExpires - Date.now());
      const label = $('#attendance-code-expiry');
      if (!label) return;
      if (!remaining) {
        label.textContent = 'Code expiré · générez-en un nouveau';
        return;
      }
      const seconds = Math.ceil(remaining / 1000);
      label.textContent = `Valide encore ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    function generateAttendanceCode() {
      const value = $('#attendance-code-value');
      const button = $('#attendance-code-new');
      value.textContent = '······';
      button.disabled = true;
      fetch('/api/team/live', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ merchant: pairedTeamMerchant(), action: 'generate-attendance-code' }),
      }).then(async (response) => {
        let data = {}; try { data = await response.json(); } catch (_) {}
        if (!response.ok) throw new Error(data.error || 'attendance-code-write-failed');
        value.textContent = String(data.code || '').replace(/(.{3})/, '$1 ');
        attendanceCodeExpires = Number(data.expiresTs) || 0;
        renderAttendanceCodeExpiry();
        if (attendanceCodeTimer) clearInterval(attendanceCodeTimer);
        attendanceCodeTimer = setInterval(renderAttendanceCodeExpiry, 1000);
      }).catch(() => {
        value.textContent = 'Erreur';
        $('#attendance-code-expiry').textContent = 'Code non généré · vérifiez la connexion';
      }).finally(() => { button.disabled = false; });
    }
    function openAttendanceCode() {
      /* kiwiSkin2027:till (étape 4, §10.34) : le code partagé du commerce, sur le
         kit (assets/kit/till-attendance.js), qui ne le remplace plus à
         l'ouverture. */
      if (document.documentElement.hasAttribute('data-k-till') && window.KiwiTillAttendance && window.KiwiTillAttendance.open({
        merchant: pairedTeamMerchant,
        post: (body) => fetch('/api/team/live', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }),
        time: (ts) => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); },
        venue: () => storeName(),
      })) { pollLiveTeam(); return; }
      $('#attendance-code-modal').classList.add('is-open');
      generateAttendanceCode();
      pollLiveTeam();
    }
    function closeAttendanceCode() {
      $('#attendance-code-modal').classList.remove('is-open');
      if (attendanceCodeTimer) clearInterval(attendanceCodeTimer);
      attendanceCodeTimer = null;
    }
    

    /* ===========================================================
       TEAM DRAWER · list servers, break management, send message
       =========================================================== */
    function activeServerCount() {
      return Object.values(servers).filter(s => s.status === 'on').length;
    }
    function pauseElapsedMn(s) {
      if (!s.breakStart) return 0;
      return Math.floor((Date.now() - s.breakStart) / 60000);
    }
    function updateTeamCount() {
      $('#team-count').textContent = activeServerCount();
    }

    function teamCardHTML(s) {
      const initials = serverInitials(s);
      const isPause = s.status === 'pause';
      const isOff   = s.status === 'off';
      const dotClass = isPause ? 'pause' : (isOff ? 'off' : 'on');
      let meta = '';
      let actions = '';
      if (s.status === 'on') {
        const myTables = Object.entries(tables)
          .filter(([_, t]) => t.server === s.id && t.status !== 'khawya' && t.status !== 'khlass').length;
        // Real roster has no live clock-in yet (no serveur app) → show the role,
        // not a fabricated "depuis 08:12". Demo servers keep their shift time.
        meta = s.since
          ? `En service depuis ${s.since} · ${myTables} table${myTables !== 1 ? 's' : ''} actives`
          : (s.role ? escTeam(s.role) : 'Sur le service');
        actions = `
          <button class="team-btn" data-team-action="message" data-server="${s.id}" title="Envoyer un message">
            <i data-lucide="message-square"></i>
          </button>
          <button class="team-btn danger" data-team-action="start-pause" data-server="${s.id}" title="Donner une pause">
            <i data-lucide="coffee"></i>
          </button>
        `;
      } else if (s.status === 'pause') {
        const mn = pauseElapsedMn(s);
        meta = `<span class="pause-tick">En pause · ${mn} mn</span>`;
        actions = `
          <button class="team-btn" data-team-action="message" data-server="${s.id}" title="Envoyer un message">
            <i data-lucide="message-square"></i>
          </button>
          <button class="team-btn primary" data-team-action="end-pause" data-server="${s.id}" title="Fin de pause">
            <i data-lucide="play"></i>
          </button>
        `;
      } else {
        meta = 'Pas en service · fin de shift';
        actions = `
          <button class="team-btn" data-team-action="message" data-server="${s.id}" title="Envoyer un message" disabled style="opacity:.35;">
            <i data-lucide="message-square"></i>
          </button>
        `;
      }
      return `
        <div class="team-card ${isPause ? 'is-pause' : ''}" data-team-card="${s.id}">
          <span class="team-avatar" style="background:${s.color};">
            ${initials}
            <span class="badge-dot ${dotClass}"></span>
          </span>
          <div class="team-info">
            <div class="team-name">${escTeam(s.name)}</div>
            <div class="team-meta">${meta}</div>
          </div>
          <div class="team-actions">${actions}</div>
        </div>
      `;
    }

    function renderTeamDrawer() {
      const onDuty = Object.values(servers).filter(s => s.status === 'on');
      const onPause = Object.values(servers).filter(s => s.status === 'pause');
      const offDuty = Object.values(servers).filter(s => s.status === 'off');

      let html = '';
      // A real store with no roster: nudge to the dashboard (the brain), not a
      // bare "aucun serveur". Demo always has on-duty servers, so it never shows.
      const emptyMsg = (storeIsReal() && !currentRoster().length)
        ? '<div class="team-empty"><div class="team-empty-t">Aucun membre dans l\'équipe</div><div class="team-empty-s">Ajoutez votre équipe depuis votre tableau de bord · <b>Équipe</b>. Elle apparaîtra ici automatiquement.</div></div>'
        : '<div class="team-meta" style="padding:6px 4px;">Aucun serveur actif.</div>';
      html += `<div class="team-section-label">En service · ${onDuty.length}</div>`;
      html += onDuty.map(teamCardHTML).join('') || emptyMsg;

      if (onPause.length) {
        html += `<div class="team-section-label">En pause · ${onPause.length}</div>`;
        html += onPause.map(teamCardHTML).join('');
      }
      if (offDuty.length) {
        html += `<div class="team-section-label">Pas en service · ${offDuty.length}</div>`;
        html += offDuty.map(teamCardHTML).join('');
      }

      html += `
        <div class="team-broadcast">
          <button id="team-broadcast-all" type="button">
            <i data-lucide="megaphone"></i> Message à toute l'équipe
          </button>
        </div>
      `;
      $('#team-drawer-body').innerHTML = html;
      lucide.createIcons();
      updateTeamCount();
    }

    function openTeamDrawer() {
      renderTeamDrawer();
      $('#team-drawer').classList.add('is-open');
      pollLiveTeam();
    }
    function closeTeamDrawer() {
      $('#team-drawer').classList.remove('is-open');
    }

    
    function openMsgModal(targetId) {
      msgTargetId = targetId;
      const isAll = targetId === 'ALL';
      const av = $('#msg-target-avatar');
      const nm = $('#msg-target-name');
      const st = $('#msg-target-status');
      if (isAll) {
        av.textContent = '∀';
        av.style.background = 'var(--ink)';
        nm.textContent = 'Toute l\'équipe';
        /* Singulier pour 0 et 1 : « 1 serveurs en service » ne se dit pas. */
        const n = activeServerCount();
        st.textContent = `· ${n} serveur${n > 1 ? 's' : ''} en service`;
      } else {
        const s = servers[targetId];
        av.textContent = serverInitials(s);
        av.style.background = s.color;
        nm.textContent = s.name;
        st.textContent = s.status === 'on' ? '· En service'
                       : s.status === 'pause' ? `· en pause depuis ${pauseElapsedMn(s)} mn`
                       : '· hors service · il le verra à son pointage';
      }
      $('#msg-input').value = '';
      $('#msg-modal').classList.add('is-open');
      setTimeout(() => $('#msg-input').focus(), 80);
    }
    function closeMsgModal() {
      $('#msg-modal').classList.remove('is-open');
      msgTargetId = null;
    }
    
    function openReassignModal(tableId) {
      reassignTableId = tableId;
      const t = tables[tableId];
      $('#reassign-table-id').textContent = tableId;

      const html = Object.values(servers)
        .filter(s => s.status !== 'off')
        .map(s => {
          const initials = serverInitials(s);
          const isCurrent = s.id === t.server;
          const badge = s.status === 'on'
            ? '<span class="reassign-opt-badge on">En service</span>'
            : '<span class="reassign-opt-badge pause">En pause</span>';
          const myTables = Object.entries(tables)
            .filter(([_, tt]) => tt.server === s.id && tt.status !== 'khawya' && tt.status !== 'khlass').length;
          return `
            <button class="reassign-opt ${isCurrent ? 'is-current' : ''}" data-reassign="${s.id}" type="button">
              <span class="team-avatar" style="background:${escTeam(s.color)};">${escTeam(initials)}</span>
              <div class="reassign-opt-info">
                <div class="reassign-opt-name">${escTeam(s.name)}${isCurrent ? ' · actuel' : ''}</div>
                <div class="reassign-opt-meta">${myTables} table${myTables !== 1 ? 's' : ''} actives</div>
              </div>
              ${badge}
            </button>
          `;
        }).join('');
      $('#reassign-list').innerHTML = html;
      $('#reassign-modal').classList.add('is-open');
      lucide.createIcons();
    }
    function closeReassignModal() {
      $('#reassign-modal').classList.remove('is-open');
      reassignTableId = null;
    }
    
