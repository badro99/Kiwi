
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
