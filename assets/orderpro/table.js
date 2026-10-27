/* OrderPro table. Exports: pressKey, renderTableDisplay, updateContinueState, chooseMode, seatHere, applyMenuMode, guestLand, commitTable.
 * Reads/writes only the declared live scope below; browser capabilities are checked by orderpro-boundary-test.
 * Classic lexical adapter intentionally preserves original function bodies, including assignments. */
KiwiOrderMenu.orderProParts.define('table', ["$","SESSION","gotoScreen","guestReady","onSessionClosed","orderMode","t","tableNumber"], function (scope) {
  with (scope) {
    function pressKey(key) {
      if (key === 'back') {
        tableNumber = tableNumber.slice(0, -1);
      } else if (/^\d$/.test(key)) {
        if (tableNumber.length >= 3) return; // cap at 3 digits
        // avoid leading zero
        if (tableNumber === '' && key === '0') return;
        tableNumber += key;
      }
      renderTableDisplay();
      updateContinueState();
    }

    function renderTableDisplay() {
      const disp = $('#table-display');
      if (!tableNumber) {
        disp.innerHTML = `<span class="table-digit is-placeholder">·</span>`;
        return;
      }
      disp.innerHTML = tableNumber.split('').map(d => `<span class="table-digit">${d}</span>`).join('');
    }

    function updateContinueState() {
      const btn = $('#continue-btn');
      btn.classList.toggle('is-ready', tableNumber.length > 0);
    }

    async function chooseMode(mode) {
      orderMode = mode;
      if (mode === 'table') {
        tableNumber = '';
        renderTableDisplay();
        updateContinueState();
        gotoScreen('screen-table');
      } else {
        // Un retrait au comptoir s'assoit lui aussi : c'est la session qui
        // porte la révocation quand la commande est remise au client.
        if (!(await seatHere('takeout', ''))) return;
        gotoScreen('screen-menu');
        applyMenuMode();
      }
    }

    async function seatHere(mode, table, allowReorder = false) {
      if (SESSION.recentlySettled(mode, table, allowReorder)) {
        // L'addition vient d'être réglée sur ce téléphone : recharger la page
        // ne rouvre pas le robinet. Le tag de la table servira au client
        // suivant, qui n'a pas ce souvenir dans le sien.
        SESSION.closed = true;
        SESSION.closedBy = 'settle';
        onSessionClosed();
        return false;
      }
      return SESSION.open(mode, table);
    }

    function applyMenuMode() {
      const badge = $('#menu-badge');
      const subtitle = $('#cart-subtitle');
      const note = $('#cart-note');
      const sendLabel = $('#send-label');
      const serviceBar = $('#service-bar');
      if (orderMode === 'takeout') {
        badge.innerHTML = `<i data-lucide="shopping-bag"></i><span id="menu-badge-text">${t('badge_takeout')}</span>`;
        subtitle.textContent = t('cart_subtitle_takeout');
        note.innerHTML = t('cart_note_takeout_html');
        sendLabel.textContent = t('send_takeout');
        serviceBar.classList.add('is-takeout');
        serviceBar.hidden = false;
      } else {
        badge.innerHTML = `<i data-lucide="utensils"></i><span id="menu-badge-text">${t('badge_table')} ${tableNumber}</span>`;
        subtitle.textContent = t('cart_subtitle_table').replace('{n}', tableNumber || '—');
        note.textContent = t('cart_note_table');
        sendLabel.textContent = t('send_table');
        serviceBar.classList.remove('is-takeout');
        serviceBar.hidden = false;
      }
      if (window.lucide) window.lucide.createIcons();
    }

    async function guestLand(pending) {
      const wait = pending || guestReady;
      if (wait) { try { await Promise.race([wait, new Promise(r => setTimeout(r, 2500))]); } catch (_) {} }
      return !!(globalThis.KiwiGuest && await globalThis.KiwiGuest.land(pending));
    }

    async function commitTable() {
      if (!tableNumber) return;
      if (!(await seatHere('table', tableNumber))) return;
      applyMenuMode();
      if (!(await guestLand())) gotoScreen('screen-menu');
    }


    return Object.freeze({ pressKey, renderTableDisplay, updateContinueState, chooseMode, seatHere, applyMenuMode, guestLand, commitTable });
  }
});
