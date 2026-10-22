/* ═══════════════════════════════════════════════════════════════════════════
 * KIWI · DESIGN 2026 — activation controller
 *
 * The "Liquid Glass" skin (design-2026.css) is enabled by any passcode (see the
 * PIN handler in dashboard.html, which calls KiwiDesign2026.enable()). State
 * persists in localStorage. There is no on-screen toggle; to revert, call
 * KiwiDesign2026.disable() (or remove the design-2026 <link>/<script>).
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var KEY = 'kiwiDesign2026';
  function isOn() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function unlocked() { try { return localStorage.getItem(KEY) != null; } catch (e) { return false; } }

  function apply(on) {
    document.body.classList.toggle('design-2026', on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    cleanup();
  }

  /* No floating pill anymore — just clear one left over from a cached build. */
  function cleanup() {
    var stale = document.querySelector('.kiwi-design-toggle');
    if (stale) stale.remove();
  }

  function init() {
    // Default ON — the Liquid Glass skin is the standard product look now.
    // A merchant who runs KiwiDesign2026.disable() (persists '0') opts back out.
    var v; try { v = localStorage.getItem(KEY); } catch (e) {}
    if (v !== '0') document.body.classList.add('design-2026');
    cleanup();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.KiwiDesign2026 = {
    enable: function () { apply(true); },
    disable: function () { apply(false); },
    toggle: function () { apply(!document.body.classList.contains('design-2026')); },
    isUnlocked: unlocked,
  };
})();

/* ── Ci-dessous, l'ancien assets/design-ios27.js (réuni ici le 22 octobre 2026, corps inchangé). ── */
/* ═══════════════════════════════════════════════════════════════════════════
 * KIWI · DESIGN iOS-27 TIER — activation controller (see design-ios27.css).
 *
 * EXPERIMENTAL, gated: only the 1111 passcode calls KiwiDesignIOS27.enable()
 * (see the PIN handler in dashboard.html). Layers ON TOP of the stable
 * Design-2026 skin — enable() guarantees the base layer is on. State persists
 * in localStorage; the Apple-style transparency control (setGlass) persists
 * its level too. No on-screen toggle; to revert call
 * KiwiDesignIOS27.disable() or remove the design-ios27 <link>/<script>.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var KEY = 'kiwiDesignIOS27';
  var GKEY = 'kiwiGlassLevel';
  var LEVELS = ['clear', 'standard', 'frosted', 'opaque'];

  function isOn() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function getGlass() {
    try { var v = localStorage.getItem(GKEY); return LEVELS.indexOf(v) !== -1 ? v : 'opaque'; }
    catch (e) { return 'opaque'; }
  }
  function setGlass(level) {
    if (LEVELS.indexOf(level) === -1) level = 'standard';
    document.body.classList.remove('glass-clear', 'glass-frosted', 'glass-opaque');
    if (level !== 'standard') document.body.classList.add('glass-' + level);
    try { localStorage.setItem(GKEY, level); } catch (e) {}
    return level;
  }
  function apply(on) {
    document.body.classList.toggle('design-ios27', on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    if (on) {
      if (window.KiwiDesign2026) window.KiwiDesign2026.enable(); // base layer required
      setGlass(getGlass());
    } else {
      document.body.classList.remove('glass-clear', 'glass-frosted', 'glass-opaque');
    }
  }
  function init() {
    // Default ON — the iOS-27 liquid-glass tier is the standard dashboard look now.
    // KiwiDesignIOS27.disable() (persists '0') opts a merchant back out.
    var v; try { v = localStorage.getItem(KEY); } catch (e) {}
    if (v !== '0') apply(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.KiwiDesignIOS27 = {
    enable: function () { apply(true); },
    disable: function () { apply(false); },
    isOn: isOn,
    setGlass: setGlass,
    getGlass: getGlass,
  };
})();
