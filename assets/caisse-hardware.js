/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi Caisse — hardware bridge. Registers never talk to a device directly;
 * they call KiwiHardware.*. Local demos may preview hardware. A hosted or paired
 * real till must receive an honest unavailable/failure result unless a real
 * device transport confirms the operation.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var hasSerial = 'serial' in navigator;
  var hasUSB = 'usb' in navigator;
  var hasBT = 'bluetooth' in navigator;

  function realTill() {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      return !!JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return false; }
  }

  function failed(reason) { return Promise.resolve({ ok: false, reason: reason }); }

  function readCard(amount) {
    if (realTill()) return Promise.resolve({ approved: false, ok: false, amount: amount, reason: 'payment-terminal-not-configured' });
    return Promise.resolve({ approved: true, ok: true, amount: amount, mock: true });
  }

  /* One visual adapter for every POS vertical. It may paint success only after
     readCard() returns approved=true; production therefore cannot manufacture
     an approval with a timer. The caller still owns the actual sale commit. */
  function authorizeCard(amount, disc, status) {
    return readCard(amount).then(function (result) {
      if (disc && disc.classList) disc.classList.remove('is-pulsing');
      if (disc && disc.replaceChildren && document.createElement) {
        var icon = document.createElement('i');
        icon.setAttribute('data-lucide', result && result.approved ? 'check' : 'x');
        disc.replaceChildren(icon);
      }
      if (result && result.approved) {
        if (disc && disc.classList) disc.classList.add('is-success');
        if (status) { status.textContent = 'Khlass ! Paiement confirmé sur le lecteur'; status.classList && status.classList.add('is-success'); }
      } else {
        if (disc && disc.classList) disc.classList.remove('is-success');
        if (status) { status.textContent = 'Paiement non confirmé · lecteur indisponible'; status.classList && status.classList.remove('is-success'); }
      }
      return result;
    }, function () {
      if (disc && disc.classList) disc.classList.remove('is-pulsing', 'is-success');
      if (status) { status.textContent = 'Paiement non confirmé · erreur lecteur'; status.classList && status.classList.remove('is-success'); }
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
    // mock resolves immediately otherwise.
    openDrawer: function () {
      if (window.KiwiPrinter && (KiwiPrinter.isConnected ? KiwiPrinter.isConnected() : KiwiPrinter.isConfigured()) && window.KiwiEscPos) {
        return KiwiPrinter.printBytes(window.KiwiEscPos.builder().init().drawer().bytes())
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
    // NO certified EMV provider is connected here. A real till gets an explicit
    // rejection instead of a fabricated approval that could mark an unpaid sale paid.
    readCard: readCard,
    authorizeCard: authorizeCard,
  };
})();
