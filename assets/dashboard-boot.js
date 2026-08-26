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
