/* Native lifecycle telemetry. The shared err-reporter owns redaction, rate
 * limiting and transport; this layer only turns native lifecycle signals into
 * small operational errors. A process killed while backgrounded is normal and
 * is deliberately not reported as a crash. */
(function () {
  'use strict';
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;

  var KEY = 'kiwi:native-session:v1';
  var App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; }
  }
  function write(state) {
    try { localStorage.setItem(KEY, JSON.stringify({ state: state, at: Date.now() })); } catch (_) {}
  }
  function report(message, detail) {
    window.setTimeout(function () {
      if (typeof window.KiwiReportError !== 'function') return;
      window.KiwiReportError(new Error(String(detail || message || 'native-lifecycle').slice(0, 240)), message);
    }, 0);
  }

  var previous = read();
  if (previous && previous.state === 'active' && Date.now() - Number(previous.at || 0) < 7 * 86400000) {
    report('native-active-session-ended', 'Kiwi Pro restarted after an unclean active session');
  }
  write('active');

  if (App && typeof App.addListener === 'function') {
    App.addListener('appStateChange', function (event) {
      write(event && event.isActive ? 'active' : 'background');
    });
    App.addListener('appRestoredResult', function (event) {
      if (event && event.success === false) report('native-restored-result-failed', event.pluginId || event.methodName || 'unknown-plugin');
    });
  }
  window.addEventListener('pagehide', function () { write('clean'); });
})();
