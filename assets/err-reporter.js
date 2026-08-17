/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Client Error Reporter (Observability & Fail-Soft Telemetry)
 *
 * Captures unhandled exceptions and unhandled promise rejections, aggressively
 * redacts sensitive customer data (PINs, Moroccan phones, auth tokens, emails),
 * throttles dispatches, and logs to Cloudflare D1 with asset version stamps.
 *
 * Privacy Guarantees:
 *   - NEVER logs passwords, PINs, or request bodies
 *   - Strips Moroccan phone numbers (+212, 06, 07)
 *   - Strips auth tokens and Bearer headers
 *   - Strips email addresses
 *   - Maximum 5 error dispatches per minute per client session (deduplicated)
 *   - 100% fail-soft: never throws or disrupts cashier / merchant operation
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (win) {
  'use strict';
  if (win.__kiwiErrorReporterLoaded) return;
  win.__kiwiErrorReporterLoaded = true;

  var MAX_PER_MINUTE = 5;
  var DEDUP_COOLDOWN_MS = 60000;
  var recentErrors = [];
  var seenSignatures = {};

  var REGEX_PHONE = /(?:\+?212|0)\s*[5-7](?:[\s.-]*\d){8}/g;
  var REGEX_PIN = /\b\d{4,6}\b/g;
  var REGEX_AUTH = /(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi;
  var REGEX_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  var REGEX_URL_SECRET = /[?&](?:password|pin|secret|token|auth|key)=[^&#\s]*/gi;

  function redact(str) {
    if (!str) return '';
    var s = String(str);
    s = s.replace(REGEX_AUTH, '[AUTH_REDACTED]');
    s = s.replace(REGEX_URL_SECRET, '$1=[REDACTED]');
    s = s.replace(REGEX_EMAIL, '[EMAIL_REDACTED]');
    s = s.replace(REGEX_PHONE, '[PHONE_REDACTED]');
    s = s.replace(REGEX_PIN, '[PIN_REDACTED]');
    return s;
  }

  function getMerchant() {
    try {
      if (win.KiwiVenue && typeof win.KiwiVenue.getVenue === 'function') {
        var v = win.KiwiVenue.getVenue();
        if (v && v !== 'fusion') return String(v).slice(0, 64);
      }
      if (win.KiwiConfig && win.KiwiConfig.merchant) {
        return String(win.KiwiConfig.merchant).slice(0, 64);
      }
      var ls = localStorage.getItem('kiwiMerchant') || localStorage.getItem('kiwiVenue');
      if (ls) return String(ls).slice(0, 64);
    } catch (_) {}
    return '';
  }

  function getVersion() {
    try {
      if (win.__KIWI_APP_VERSION) return String(win.__KIWI_APP_VERSION).slice(0, 32);
      var sw = localStorage.getItem('kiwiShellVer');
      if (sw) return String(sw).slice(0, 32);
    } catch (_) {}
    return '';
  }

  function cleanFile(url) {
    if (!url) return '';
    try {
      var s = String(url).split('?')[0].split('#')[0];
      var parts = s.split('/');
      return parts.slice(-2).join('/').slice(0, 120);
    } catch (_) {
      return String(url).slice(0, 120);
    }
  }

  function shouldThrottle(sig) {
    var now = Date.now();
    // Clean old entries
    recentErrors = recentErrors.filter(function (t) { return now - t < 60000; });
    if (recentErrors.length >= MAX_PER_MINUTE) return true;

    // Check duplicate signature cooldown
    if (seenSignatures[sig] && (now - seenSignatures[sig] < DEDUP_COOLDOWN_MS)) {
      return true;
    }

    recentErrors.push(now);
    seenSignatures[sig] = now;
    return false;
  }

  function report(errObj) {
    try {
      var rawMsg = (errObj && (errObj.message || errObj.reason || errObj.name)) || 'Unknown error';
      var msg = redact(String(rawMsg).slice(0, 300));
      var file = cleanFile(errObj && (errObj.filename || errObj.source || ''));
      var line = parseInt(errObj && errObj.lineno, 10) || 0;
      var col = parseInt(errObj && errObj.colno, 10) || 0;
      var rawStack = (errObj && errObj.stack) || '';
      var stack = redact(String(rawStack).slice(0, 1000));
      var merchant = getMerchant();
      var sig = merchant + ':' + file + ':' + line + ':' + msg;

      if (shouldThrottle(sig)) return;

      var payload = {
        merchant: merchant,
        message: msg,
        file: file,
        line: line,
        col: col,
        stack: stack,
        url: win.location ? win.location.pathname.slice(0, 120) : '',
        version: getVersion(),
        userAgent: (win.navigator && win.navigator.userAgent) ? win.navigator.userAgent.slice(0, 200) : ''
      };

      var jsonStr = JSON.stringify(payload);

      if (win.navigator && typeof win.navigator.sendBeacon === 'function') {
        var sent = win.navigator.sendBeacon('/api/error', new Blob([jsonStr], { type: 'application/json' }));
        if (sent) return;
      }

      if (typeof fetch === 'function') {
        fetch('/api/error', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: jsonStr,
          keepalive: true
        }).catch(function () {});
      }
    } catch (_) {}
  }

  // 1. Unhandled JS Errors
  win.addEventListener('error', function (event) {
    try {
      if (!event) return;
      var err = event.error || {};
      report({
        message: event.message || err.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: err.stack
      });
    } catch (_) {}
  });

  // 2. Unhandled Promise Rejections
  win.addEventListener('unhandledrejection', function (event) {
    try {
      if (!event) return;
      var reason = event.reason || {};
      if (typeof reason === 'string') {
        report({ message: reason });
      } else {
        report({
          message: reason.message || reason.name || 'Unhandled Promise Rejection',
          stack: reason.stack,
          filename: reason.filename || reason.fileName,
          lineno: reason.lineNumber || reason.lineno
        });
      }
    } catch (_) {}
  });

  // 3. Public API for manual fail-soft reporting
  win.KiwiReportError = function (err, customMsg) {
    try {
      if (!err) return;
      if (typeof err === 'string') {
        report({ message: customMsg ? (customMsg + ': ' + err) : err });
      } else {
        report({
          message: (customMsg ? (customMsg + ': ') : '') + (err.message || err.name || 'Error'),
          stack: err.stack,
          filename: err.filename || err.fileName,
          lineno: err.lineno || err.lineNumber
        });
      }
    } catch (_) {}
  };

  win.KiwiRedactForLog = redact;
})(typeof window !== 'undefined' ? window : this);
