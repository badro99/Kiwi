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
