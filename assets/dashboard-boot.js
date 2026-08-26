(function () {
  'use strict';

  const waiting = [];
  let released = false;
  let observer = null;

  function lockReleased() {
    const lock = document.querySelector('[data-kiwi-lock]');
    if (!lock) return document.readyState !== 'loading' && !!document.body;
    if (lock.hidden || lock.getAttribute('aria-hidden') === 'true') return true;
    if (lock.classList.contains('is-unlocked') || lock.classList.contains('unlocked') || lock.classList.contains('out')) return true;
    try {
      const style = getComputedStyle(lock);
      const opacity = Number.parseFloat(style.opacity || '1');
      return style.display === 'none' || style.visibility === 'hidden' || (style.pointerEvents === 'none' && opacity <= 0.05);
    } catch (_) {
      return false;
    }
  }

  function drain() {
    if (released) return;
    released = true;
    if (observer) observer.disconnect();

    const next = () => {
      const callback = waiting.shift();
      if (!callback) return;
      try { callback(); } catch (error) { setTimeout(() => { throw error; }, 0); }
      if (window.requestIdleCallback) requestIdleCallback(next, { timeout: 120 });
      else setTimeout(next, 16);
    };
    next();
  }

  function check() {
    if (!released && lockReleased()) drain();
  }

  function arm() {
    if (released || observer) { check(); return; }
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    });
    check();
  }

  function whenUnlocked(callback) {
    if (typeof callback !== 'function') return;
    if (released) { setTimeout(callback, 0); return; }
    waiting.push(callback);
    arm();
  }

  window.KiwiDashboardBoot = { whenUnlocked, isUnlocked: () => released || lockReleased() };
  window.addEventListener('kiwi:dashboard-unlocked', drain, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm, { once: true });
  else arm();
})();
