/* Owner: caisse operator login and shift initialization helpers.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */

    function tillKitOpenFloat() {
      if (!tillKitOn() || !customElements.get('k-cash-count') || !customElements.get('k-sheet')) return false;
      if (tillKitFloat) tillKitFloat.sheet.remove();
      const sheet = document.createElement('k-sheet');
      sheet.setAttribute('size', 'count');
      const cc = document.createElement('k-cash-count');
      cc.setAttribute('mode', 'open');
      sheet.appendChild(cc);
      document.body.appendChild(sheet);
      const done = () => { try { cc.committed(); } catch (_) {} sheet.removeAttribute('open'); setTimeout(() => sheet.remove(), 400); tillKitFloat = null; };
      tillKitFloat = { sheet, cc, done };
      sheet.addEventListener('kiwi:action', (e) => {
        const d = e.detail || {};
        if (d.action === 'k.sheet.close') { sheet.removeAttribute('open'); return; }
        /* « Saisir le total » : les puces livrées et leur montant libre. */
        if (d.action === 'k.cash-count.enter-total') {
          sheet.removeAttribute('open');
          const box = $('.clockin-float');
          if (box) box.classList.add('k-shown');
          const other = $('#ci-float-chips [data-float="custom"]');
          if (other) other.click();
          return;
        }
        if (d.action !== 'k.cash-count.open') return;
        const v = d.value || {};
        openingFloat = Math.max(0, Number(v.counted) || 0);
        floatChosen = true;
        rememberFloat(openingFloat);
        openService();
      });
      let last = NaN;
      try { last = parseFloat(localStorage.getItem(floatMemKey())); } catch (_) {}
      cc.count = { lastFloat: Number.isFinite(last) && last > 0 ? last : null };
      sheet.setAttribute('open', '');
      return true;
    }

    

    function renderPinDots() {
      $$('#pin-dots .pin-dot').forEach((d, i) => {
        d.classList.toggle('is-filled', i < pinBuffer.length);
      });
    }

    /* Support access skips a staff PIN only after pairing proves the named
       operator. It is NOT permission to open a new merchant service on load,
       overwrite its provisional Z, or resume a local cashier's journal. */
    function operatorCaisseRequested() {
      try {
        return new URLSearchParams(location.search || '').get('op') === '1';
      } catch (_) { return false; }
    }

    function unlockApp() {
      /* PIN accepted · cross-fade the PIN into the clock-in screen
       * (ouverture de caisse). The greeting flash + shell dive-in now
       * run from openService(), once the cashier opens the register. */
      const clockinEl = document.getElementById('clockin-screen');

      if (operatorCaisseRequested()) {
        const notice = document.getElementById('operator-service-notice');
        if (notice) notice.hidden = false;
        const link = document.getElementById('operator-dashboard-link');
        if (link) link.href = '/dashboard?op=1&merchant=' + encodeURIComponent(currentMerchantSlug());
      }

      // t=0..210: success pop on the 4 dots, staggered left → right.
      $$('#pin-dots .pin-dot').forEach((d, i) => {
        setTimeout(() => d.classList.add('is-success'), i * 70);
      });

      // t=460: cross-fade · PIN out, clock-in screen in.
      setTimeout(() => {
        pinScreen.classList.add('is-leaving');
        if (clockinEl) {
          clockinEl.classList.add('is-visible');
          clockinEl.setAttribute('aria-hidden', 'false');
        }
      }, 460);

      // t=940: PIN gone.
      setTimeout(() => { pinScreen.style.display = 'none'; }, 940);
    }

    
