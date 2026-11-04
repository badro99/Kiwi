  /* Keypad budget only: a copied verifier cache remains guessable. Persist a
     clock high-water mark so rolling time back never consumes the delay. */
  var offlineBudgets = {};
  var offlineBudget = { check: function (merchant, fail, reset) {
    var key = 'kiwi:caisse:offline-pin-budget:v1:' + encodeURIComponent(String(merchant || ''));
    var b = offlineBudgets[key];
    try { b = JSON.parse(ls(key) || 'null') || b; } catch (_) {}
    b = b || { failures: 0, until: 0, at: 0 };
    var now = Math.max(Number(b.at) || 0, (window.KiwiTrustedClock || Date).now());
    if (reset) b = { failures: 0, until: 0, at: now };
    if (fail) {
      b.failures = Math.min(10, (Number(b.failures) || 0) + 1);
      if (b.failures >= 5) b.until = Math.max(Number(b.until) || 0, now + Math.min(900000, 30000 * Math.pow(2, b.failures - 5)));
    }
    b.at = now; offlineBudgets[key] = b;
    set(key, JSON.stringify(b));
    return Math.max(0, Math.ceil(((Number(b.until) || 0) - now) / 1000));
  }
  , notice: function (seconds) {
    var text = "Trop d'essais hors ligne · réessayez dans " + seconds + ' s';
    toast((window.KiwiCaisseLang || { tr: function (s) { return s; } }).tr(text));
  } };
