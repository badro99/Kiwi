/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi Caisse — hardware bridge. Registers never talk to a device directly;
 * they call KiwiHardware.*. Local demos may preview hardware. A hosted or paired
 * real till must receive an honest unavailable/failure result unless a real
 * device transport confirms the operation.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  function tr(message) { return window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(message) : message; }
  var hasSerial = 'serial' in navigator;
  var hasUSB = 'usb' in navigator;
  var hasBT = 'bluetooth' in navigator;

  function realTill() {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      if (window.KiwiPlatform && typeof window.KiwiPlatform.isPaired === 'function') return window.KiwiPlatform.isPaired();
      return !!JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return false; }
  }

  function failed(reason) { return Promise.resolve({ ok: false, reason: reason }); }

  function readCard(amount, options) {
    options = options || {};
    if (realTill()) {
      /* Kiwi does not yet drive a certified EMV terminal. For an ordinary sale,
         choosing "Carte" is nevertheless a valid cashier declaration: the
         customer paid on the merchant's standalone TPE, and Kiwi must record
         that tender as card so it reaches sales/KPIs without entering the cash
         drawer. This is deliberately labelled recordOnly — it is not a bank
         authorization. Operations that truly require a terminal response
         (notably a hotel pre-authorization) still fail closed. */
      if (options.capture === false || options.requireAuthorization === true) {
        return Promise.resolve({ approved: false, ok: false, amount: amount, reason: 'payment-terminal-not-configured' });
      }
      return Promise.resolve({
        approved: true, ok: true, amount: amount,
        recordOnly: true, externalTerminal: true,
        reason: 'external-terminal-card-recorded',
      });
    }
    return Promise.resolve({ approved: true, ok: true, amount: amount, mock: true });
  }

  /* A record-only card result is a DECLARATION, not an answer from a reader.
     Nothing on a standalone TPE tells Kiwi that the customer actually paid, so
     a timer (the trade tills wait ~2 s) must never write the sale: the cashier
     confirms it. A confirm button is added under the status line; if the till
     has no such anchor (or the modal is closed under it) the answer is "no".
     Resolves true only on an explicit tap. Fail closed. */
  function mmk(amount) {
    var n = Math.round((Number(amount) || 0) * 100) / 100;
    return n.toFixed(2).replace('.', ',') + ' MAD';
  }
  function cashierConfirms(amount, disc, status) {
    if (disc && disc.classList) disc.classList.remove('is-pulsing');
    var label = 'Le client a payé ' + mmk(amount) + ' sur le terminal';
    if (status) status.textContent = tr('Faites payer sur votre terminal, puis confirmez');
    var canMount = !!(status && status.parentNode && typeof status.parentNode.insertBefore === 'function'
      && typeof document !== 'undefined' && document.createElement);
    if (!canMount) {
      try { if (typeof window.confirm === 'function') return Promise.resolve(window.confirm(tr(label + ' ?')) === true); } catch (_) {}
      return Promise.resolve(false);
    }
    return new Promise(function (resolve) {
      var settled = false, timer = null;
      var btn = el('button', 'margin-top:14px;padding:11px 18px;border:0;border-radius:10px;background:#0B6E4F;color:#F7F5F0;font:600 14px/1.2 inherit;cursor:pointer', label);
      btn.type = 'button';
      btn.setAttribute('data-card-confirm', '1');
      function end(yes) {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        try { if (btn.parentNode) btn.parentNode.removeChild(btn); } catch (_) {}
        resolve(yes);
      }
      btn.addEventListener('click', function () { btn.disabled = true; end(true); });
      status.parentNode.insertBefore(btn, status.nextSibling || null);
      /* The cashier closed the payment window: the button leaves the page with
         it, and the answer is no. */
      timer = setInterval(function () {
        var live = false;
        try { live = !!(document.body && document.body.contains(btn)); } catch (_) {}
        if (!live) end(false);
      }, 400);
    });
  }

  /* One visual adapter for every POS vertical. It distinguishes a confirmed
     reader response from the cashier's external-terminal tender declaration;
     the caller still owns the actual sale commit. `options.cashierConfirmed`
     says the caller already collected that confirmation itself (the restaurant
     till has its own button), so it is not asked twice. */
  function authorizeCard(amount, disc, status, options) {
    return readCard(amount, options).then(function (result) {
      if (result && result.approved && result.recordOnly && !(options && options.cashierConfirmed === true)) {
        return cashierConfirms(amount, disc, status).then(function (yes) {
          return yes ? result : { approved: false, ok: false, amount: amount, reason: 'cashier-not-confirmed' };
        });
      }
      return result;
    }).then(function (result) {
      if (disc && disc.classList) disc.classList.remove('is-pulsing');
      if (disc && disc.replaceChildren && document.createElement) {
        var icon = document.createElement('i');
        icon.setAttribute('data-lucide', result && result.approved ? 'check' : 'x');
        disc.replaceChildren(icon);
      }
      if (result && result.approved) {
        if (disc && disc.classList) disc.classList.add('is-success');
        if (status) {
          status.textContent = result.recordOnly
            ? tr('Paiement carte enregistré · terminal externe')
            : tr('Paiement confirmé sur le lecteur');
          status.classList && status.classList.add('is-success');
        }
      } else {
        if (disc && disc.classList) disc.classList.remove('is-success');
        if (status) {
          status.textContent = result && result.reason === 'cashier-not-confirmed'
            ? tr('Paiement non confirmé · rien n\'a été enregistré')
            : tr('Paiement non confirmé · lecteur indisponible');
          status.classList && status.classList.remove('is-success');
        }
      }
      return result;
    }, function () {
      if (disc && disc.classList) disc.classList.remove('is-pulsing', 'is-success');
      if (status) { status.textContent = tr('Paiement non confirmé · erreur lecteur'); status.classList && status.classList.remove('is-success'); }
      return { approved: false, ok: false, amount: amount, reason: 'payment-terminal-error' };
    });
  }

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;   // textContent — never innerHTML
    return n;
  }

  function mockPrint(ticket) {
    return new Promise(function (resolve) {
      function done() { overlay.remove(); resolve({ ok: true, mock: true }); }
      var overlay = el('div', 'position:fixed;inset:0;z-index:9997;display:grid;place-items:center;background:rgba(10,15,13,.55)');
      overlay.setAttribute('role', 'dialog');
      var card = el('div', "background:#FFFDFA;width:300px;max-width:86vw;padding:22px;border-radius:14px;font:13px/1.5 'JetBrains Mono',monospace;box-shadow:0 24px 60px -20px rgba(0,0,0,.5)");
      card.appendChild(el('div', 'text-align:center;font-weight:700;margin-bottom:10px', (ticket && ticket.title) || 'Reçu Kiwi'));
      (ticket && ticket.lines ? ticket.lines : []).forEach(function (l) {
        var row = el('div', 'display:flex;justify-content:space-between');
        row.appendChild(el('span', '', (l.qty ? l.qty + '× ' : '') + (l.name || '')));
        row.appendChild(el('span', '', l.price || ''));
        card.appendChild(row);
      });
      card.appendChild(el('hr', 'border:0;border-top:1px dashed #ccc;margin:10px 0'));
      var tot = el('div', 'display:flex;justify-content:space-between;font-weight:700');
      tot.appendChild(el('span', '', 'Total'));
      tot.appendChild(el('span', '', (ticket && ticket.total) || ''));
      card.appendChild(tot);
      var close = el('button', 'margin-top:16px;width:100%;padding:10px;border:0;border-radius:9px;background:#0B6E4F;color:#F7F5F0;font-weight:600;cursor:pointer', 'Fermer');
      close.addEventListener('click', done);
      card.appendChild(close);
      overlay.appendChild(card);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) done(); });
      document.body.appendChild(overlay);
    });
  }

  window.KiwiHardware = {
    capabilities: { serial: hasSerial, usb: hasUSB, bluetooth: hasBT },
    // Print a receipt. REAL path: when a thermal printer is paired (KiwiPrinter +
    // the Kiwi Printer Bridge), the receipt is encoded to ESC/POS and printed for
    // real. A real till never converts a failed physical print into a successful
    // preview. The preview remains available only in the localhost demo.
    print: function (ticket) {
      if (window.KiwiPrinter && (KiwiPrinter.isConnected ? KiwiPrinter.isConnected() : KiwiPrinter.isConfigured())) {
        var o = {
          shop: ticket && ticket.title, lines: (ticket && ticket.lines) || [],
          total: ticket && ticket.total, method: ticket && ticket.method,
        };
        return KiwiPrinter.printReceipt(o).then(function (res) {
          if (res && res.ok) return { ok: true, printed: true, via: res.via || '' };
          return realTill() ? { ok: false, reason: (res && res.reason) || 'print-failed' } : mockPrint(ticket);
        }, function () {
          return realTill() ? { ok: false, reason: 'print-failed' } : mockPrint(ticket);
        });
      }
      return realTill() ? failed('printer-not-configured') : mockPrint(ticket);
    },
    // Open the cash drawer (ESC/POS kick). Real via the bridge when configured; the
    // mock resolves immediately otherwise. Le tiroir est branché en RJ11 sur
    // l'imprimante du COMPTOIR : le coup part vers le profil « caisse », jamais
    // vers une imprimante de production (cuisine/bar) du poste multi-imprimantes.
    openDrawer: function () {
      if (window.KiwiPrinter && (KiwiPrinter.isConnected ? KiwiPrinter.isConnected() : KiwiPrinter.isConfigured()) && window.KiwiEscPos) {
        return KiwiPrinter.printBytes(window.KiwiEscPos.builder().init().drawer().bytes(), 'caisse')
          .then(function (res) {
            if (res && res.ok) return { ok: true, opened: true, via: res.via || '' };
            return realTill() ? { ok: false, reason: (res && res.reason) || 'drawer-failed' } : { ok: true, mock: true };
          }, function () { return realTill() ? { ok: false, reason: 'drawer-failed' } : { ok: true, mock: true }; });
      }
      return realTill() ? failed('drawer-not-configured') : Promise.resolve({ ok: true, mock: true });
    },
    // No dummy product may enter a real inventory. Physical keyboard-wedge and
    // camera scanners use their dedicated inputs; this generic API is demo-only.
    scan: function (cb) {
      if (realTill()) return failed('scanner-not-configured');
      setTimeout(function () { cb && cb({ code: '000000000000', mock: true }); }, 250);
      return Promise.resolve({ ok: true, mock: true });
    },
    // No certified EMV provider is connected here. Standard sales are recorded
    // as external-terminal card tenders; authorization-only operations fail.
    readCard: readCard,
    authorizeCard: authorizeCard,
    // True when "Carte" can only be a declaration about the merchant's own
    // standalone TPE (no reader answers). The till must then ask its cashier to
    // confirm that the customer paid, instead of booking the sale on a timer.
    externalCardTerminal: function () { return realTill(); },
    // Pré-réchauffe le canal thermique dès qu'une intention d'encaissement apparaît,
    // évitant la latence de réveil (15–20 s) au premier ticket après une accalmie.
    warmPrinter: function (target) {
      if (window.KiwiPrinter && typeof window.KiwiPrinter.wake === 'function') {
        window.KiwiPrinter.wake(target);
      }
    },
  };
})();

/* Caisse · la confirmation des gestes qui détruisent ou annulent quelque chose.
 *
 * window.confirm() est une boîte du navigateur : sans habillage Kiwi, sans gestion du
 * focus, et dans l'app iPhone elle contourne la feuille native que la décision du
 * 4 novembre a retenue pour les confirmations. KiwiCaisseLang.ask() pose la question
 * dans l'ordre : feuille native de l'app si l'hôte l'annonce, sinon feuille Kiwi dans la
 * page (focus piégé, Échap annule, le focus revient où il était), et seulement à défaut de
 * document la boîte du système. Elle rend une promesse : true sur « Confirmer », false sinon.
 * Le texte arrive déjà traduit (KiwiCaisseLang.tr) ; les deux boutons sont traduits ici. */
(function () {
  'use strict';
  var STYLE_ID = 'kiwi-ask-style';
  function tr(s) { try { return window.KiwiCaisseLang && window.KiwiCaisseLang.tr ? window.KiwiCaisseLang.tr(s) : s; } catch (_) { return s; } }
  function css() {
    return '.kiwi-ask{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,15,13,.45)}' +
      '.kiwi-ask-card{max-width:380px;width:100%;box-sizing:border-box;padding:22px;border-radius:16px;background:var(--surface,#FFFDFA);color:var(--ink,#0A0F0D);border:1px solid var(--n-200,#E8E6E0);box-shadow:0 18px 48px rgba(10,15,13,.28);font-family:inherit}' +
      '.kiwi-ask-title{margin:0;font-size:16px;font-weight:600;line-height:1.35}' +
      '.kiwi-ask-body{margin:8px 0 0;font-size:13.5px;line-height:1.5;color:var(--n-500,#6B7570);white-space:pre-line}' +
      '.kiwi-ask-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap}' +
      '.kiwi-ask-btn{min-height:44px;padding:0 18px;border-radius:12px;border:1px solid var(--n-200,#E8E6E0);background:var(--paper-soft,#EFECE3);color:var(--ink,#0A0F0D);font:600 14px/1 inherit;cursor:pointer}' +
      '.kiwi-ask-btn.is-go{border-color:var(--atlas,#0B6E4F);background:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}' +
      '.kiwi-ask-btn.is-danger{border-color:var(--danger,#C94A3A);background:var(--danger,#C94A3A);color:var(--paper,#F7F5F0)}' +
      '.kiwi-ask-btn:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:2px}';
  }
  function split(message) {
    var text = String(message == null ? '' : message), at = text.indexOf('\n\n');
    return at < 0 ? { title: text, body: '' } : { title: text.slice(0, at), body: text.slice(at + 2) };
  }
  function nativeAsk(parts, go, back, danger) {
    var N = window.__kiwiNativeRuntime;
    if (!N || typeof N.nativeSheetAvailable !== 'function' || !N.nativeSheetAvailable()) return null;
    return N.nativeSheet({ title: parts.title, message: parts.body, actions: [{ id: 'go', label: go, style: danger ? 'destructive' : 'plain' }, { id: 'back', label: back }] })
      .then(function (choice) { return choice === 'go'; });
  }
  function pageAsk(parts, go, back, danger) {
    return new Promise(function (resolve) {
      var doc = document, opener = doc.activeElement, done = false;
      if (!doc.getElementById(STYLE_ID)) { var st = doc.createElement('style'); st.id = STYLE_ID; st.textContent = css(); doc.head.appendChild(st); }
      var veil = doc.createElement('div'); veil.className = 'kiwi-ask';
      var card = doc.createElement('div'); card.className = 'kiwi-ask-card';
      card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-modal', 'true');
      var title = doc.createElement('h3'); title.className = 'kiwi-ask-title'; title.id = 'kiwi-ask-title'; title.textContent = parts.title;
      card.setAttribute('aria-labelledby', title.id); card.appendChild(title);
      if (parts.body) { var body = doc.createElement('p'); body.className = 'kiwi-ask-body'; body.id = 'kiwi-ask-body'; body.textContent = parts.body; card.setAttribute('aria-describedby', body.id); card.appendChild(body); }
      var actions = doc.createElement('div'); actions.className = 'kiwi-ask-actions';
      var no = doc.createElement('button'); no.type = 'button'; no.className = 'kiwi-ask-btn'; no.textContent = back;
      var yes = doc.createElement('button'); yes.type = 'button'; yes.className = 'kiwi-ask-btn ' + (danger ? 'is-danger' : 'is-go'); yes.textContent = go;
      actions.appendChild(no); actions.appendChild(yes); card.appendChild(actions); veil.appendChild(card);
      function end(value) {
        if (done) return; done = true;
        doc.removeEventListener('keydown', onKey, true);
        if (veil.parentNode) veil.parentNode.removeChild(veil);
        try { if (opener && opener.focus) opener.focus(); } catch (_) {}
        resolve(value);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); return; }
        if (e.key !== 'Tab') return;
        var first = no, last = yes, cur = doc.activeElement;
        if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
        else if (cur !== first && cur !== last) { e.preventDefault(); first.focus(); }
      }
      no.onclick = function () { end(false); };
      yes.onclick = function () { end(true); };
      veil.addEventListener('click', function (e) { if (e.target === veil) end(false); });
      doc.addEventListener('keydown', onKey, true);
      doc.body.appendChild(veil);
      no.focus(); /* le geste sûr d'abord : Entrée n'efface rien */
    });
  }
  function ask(message, opts) {
    opts = opts || {};
    var parts = split(message), go = tr(opts.confirm || 'Confirmer'), back = tr(opts.cancel || 'Annuler'), danger = !!opts.danger;
    var viaApp = null;
    try { viaApp = nativeAsk(parts, go, back, danger); } catch (_) { viaApp = null; }
    if (viaApp) return viaApp;
    if (typeof document !== 'undefined' && document.body && document.createElement) return pageAsk(parts, go, back, danger);
    try { return Promise.resolve(typeof window.confirm === 'function' && window.confirm(tr(String(message))) === true); } catch (_) { return Promise.resolve(false); }
  }
  /* Pas de nouveau global : la caisse lit déjà KiwiCaisseLang, la question s'y accroche. */
  function attach() { if (window.KiwiCaisseLang && !window.KiwiCaisseLang.ask) window.KiwiCaisseLang.ask = ask; }
  /* caisse-lang.js se charge après ce fichier : la question s'y accroche une fois la page lue
   * (ou tout de suite si ce fichier arrive après coup). */
  if (typeof document !== 'undefined' && document.readyState === 'loading' && document.addEventListener) document.addEventListener('DOMContentLoaded', attach);
  else setTimeout(attach, 0);
})();
