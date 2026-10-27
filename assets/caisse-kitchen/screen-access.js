
    /* ===========================================================
       KITCHEN-DISPLAY MODE (PIN 0001)
       -----------------------------------------------------------
       This terminal can also serve as the kitchen display · a wall
       screen for the cooks to glance at. There is no user; the
       0001 code unlocks the terminal STRAIGHT INTO the KDS, the
       cashier shell stays hidden, and the close button becomes
       "Verrouiller" to send the terminal back to its PIN screen.
       (0000 → pressing mode, see assets/pressing-caisse.js.)
       =========================================================== */
    function unlockKitchenScreen() {
      // Identical dot success animation to unlockApp().
      $$('#pin-dots .pin-dot').forEach((d, i) => {
        setTimeout(() => d.classList.add('is-success'), i * 70);
      });

      // t=460: PIN fades out, body flips into kitchen-display mode.
      setTimeout(() => {
        pinScreen.classList.add('is-leaving');
        document.body.classList.add('is-kitchen', 'is-unlocked');
      }, 460);

      // t=940: PIN gone, kitchen entry sequence starts.
      setTimeout(() => {
        pinScreen.style.display = 'none';
        runKitchenEntrySequence();
      }, 940);
    }

    /* Kitchen-display intro flash → KDS open. No person addressed ·
       the screen just announces itself as the kitchen station. */
    function runKitchenEntrySequence() {
      const greetEl  = document.querySelector('[data-kiwi-greet]');
      const line1El  = document.getElementById('greet-line1');
      const emEl     = document.getElementById('greet-em');
      const subEl    = document.getElementById('greet-sub');
      if (line1El) line1El.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('L-cuisine,');
      if (emEl)    emEl.textContent    = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('service bda.');
      if (subEl)   subEl.innerHTML     = `${escTeam(storeName())} <em>·</em> file de préparation`;

      // Wrap <em> in .em-clip and measure natural width (same as cashier path).
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

      // t=0: greeting fades in.
      if (greetEl) {
        greetEl.classList.add('is-visible');
        greetEl.setAttribute('aria-hidden', 'false');
      }
      // t=700: typewriter starts
      setTimeout(() => emClip && emClip.classList.add('is-revealed', 'is-typing'), 700);
      // t=1700: caret drops
      setTimeout(() => emClip && emClip.classList.remove('is-typing'), 1700);

      // t=2400: greeting fades, KDS opens underneath. Close-btn becomes
      // "Verrouiller" · the kitchen mode exit signals "lock this station".
      setTimeout(() => {
        if (greetEl) {
          greetEl.classList.remove('is-visible');
          greetEl.setAttribute('aria-hidden', 'true');
        }
        openKds();
        const labelEl = document.getElementById('kds-close-label');
        if (labelEl) labelEl.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Verrouiller');
      }, 2400);

      // t=3200: greeting element removed.
      setTimeout(() => { if (greetEl && greetEl.parentNode) greetEl.remove(); }, 3200);
    }

    /* Kitchen "Verrouiller" · lock the station back to the PIN screen. */
    function lockoutKitchen() {
      closeKds();
      document.body.classList.remove('is-kitchen', 'is-unlocked');
      const labelEl = document.getElementById('kds-close-label');
      if (labelEl) labelEl.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer');
      window.__kiwiPinReset();
    }
