(function () {
  'use strict';

  const waiting = [];
  let released = false;
  let fallbackTimer = null;

  function introFinished() {
    const lock = document.querySelector('[data-kiwi-lock]');
    const greet = document.querySelector('[data-kiwi-greet]');
    if (lock && lock.isConnected && getComputedStyle(lock).display !== 'none') return false;
    if (greet && greet.isConnected) return false;
    return document.readyState !== 'loading' && !!document.body;
  }

  function drain() {
    if (released) return;
    released = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);

    const next = () => {
      const callback = waiting.shift();
      if (!callback) return;
      try { callback(); } catch (error) { setTimeout(() => { throw error; }, 0); }
      scheduleNext();
    };
    const scheduleNext = () => {
      if (!waiting.length) return;
      if (window.requestIdleCallback) requestIdleCallback(next, { timeout: 1500 });
      else setTimeout(next, 80);
    };
    scheduleNext();
  }

  function check() {
    if (!released && introFinished()) drain();
  }

  function arm() {
    if (released) return;
    check();
    if (!released && !fallbackTimer) fallbackTimer = setTimeout(check, 10000);
  }

  function whenUnlocked(callback) {
    if (typeof callback !== 'function') return;
    if (released) { setTimeout(callback, 0); return; }
    waiting.push(callback);
    arm();
  }

  window.KiwiDashboardBoot = { whenUnlocked, isUnlocked: () => released || introFinished() };
  window.addEventListener('kiwi:dashboard-unlocked', drain, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm, { once: true });
  else arm();
})();

/* Vue opérateur (?op=1&merchant=X) : la page parle du commerce X, et de lui
 * seul. Un navigateur qui a servi de caisse garde son appairage
 * (kiwiPairedVenue, kiwiPaired) ; six modules du tableau de bord (catalogue,
 * clients, rapports du jour, documents, opérations, quarantaine) le lisent
 * avant le commerce à l'écran. Santos, 19 nov. 2026 : la vue opérateur de
 * Santos interrogeait aussi le catalogue, les clients, les rapports et la
 * fidélité d'Amira Boutique, appairée un jour sur ce poste. Sur CETTE page,
 * l'appairage se lit vide ; rien n'est effacé, la caisse du poste reste
 * appairée. Chargé tôt et sans defer : avant tout module qui lit le stockage. */
(function () {
  'use strict';
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('op') !== '1' || !q.get('merchant')) return;
    const hidden = new Set(['kiwiPairedVenue', 'kiwiPaired']);
    const store = window.localStorage, get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      return this === store && hidden.has(String(key)) ? null : get.apply(this, arguments);
    };
  } catch (_) {}
})();
