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
    try { var v = localStorage.getItem(GKEY); return LEVELS.indexOf(v) !== -1 ? v : 'standard'; }
    catch (e) { return 'standard'; }
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
