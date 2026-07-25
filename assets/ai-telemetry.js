/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · AI telemetry — window.KiwiAiTelemetry
 *
 * The audit's lowest score, and fairly: Kiwi could not say which assistant
 * questions fail, how long an answer takes on a shop till, how often the local
 * model actually finishes downloading, or whether a merchant found the reply
 * useful. Every one of those is a product decision made blind.
 *
 * What this records, per interaction:
 *   route        which scenario answered (or 'model', or 'refused')
 *   provenance   deterministic · lookup · model · refused · error
 *   tier         owner / manager / staff — so a permissions regression shows up
 *   lang         the language the question was asked in
 *   ms           end-to-end latency
 *   redacted     how many figures the guardrail removed from a model answer
 *   verdict      the merchant's own thumb, when they give one
 *
 * What it does NOT record: the question. Not hashed, not truncated, not
 * "anonymised" — a merchant's questions are about their money, their staff and
 * their debts, and a ring buffer of them sitting in localStorage is a liability
 * no product decision is worth. Only the LENGTH BUCKET is kept, which is enough
 * to tell a one-word query from an essay.
 *
 * Nothing is sent anywhere. There is no endpoint, no beacon, no fetch. It lives
 * in memory for the session and mirrors the last 200 events to localStorage so
 * a merchant on the phone to support can read a summary back. Works offline,
 * because the till often is.
 *
 *   window.KiwiAiTelemetry.log(event)     record one
 *   window.KiwiAiTelemetry.list()         raw events
 *   window.KiwiAiTelemetry.summary()      counts, medians, failure rate
 *   window.KiwiAiTelemetry.report()       a block to read down the phone
 *   window.KiwiAiTelemetry.clear()
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var KEY = 'kiwiAiTelemetry';
  var MAX = 200;
  var buf = [];

  try {
    var saved = localStorage.getItem(KEY);
    if (saved) buf = JSON.parse(saved) || [];
    if (!Array.isArray(buf)) buf = [];
  } catch (_) { buf = []; }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(buf.slice(-MAX))); } catch (_) {}
  }

  /* Length, not content. 0 = a word or two, 1 = a sentence, 2 = a paragraph. */
  function bucket(n) { return n < 20 ? 0 : n < 80 ? 1 : 2; }

  function log(e) {
    if (!e || typeof e !== 'object') return null;
    var row = {
      t: Date.now(),
      route: String(e.route || '').slice(0, 24),
      prov: String(e.provenance || '').slice(0, 16),
      tier: String(e.tier || '').slice(0, 8),
      lang: String(e.lang || '').slice(0, 2),
      ms: Math.max(0, Math.round(e.ms || 0)),
      len: bucket(e.qLength || 0),
    };
    if (e.redacted) row.red = Math.round(e.redacted);
    if (e.diag) row.diag = String(e.diag).slice(0, 12);
    if (e.verdict) row.v = e.verdict === 'up' ? 1 : -1;
    buf.push(row);
    if (buf.length > MAX) buf.shift();
    persist();
    return row;
  }

  /* Attach a merchant's thumb to the most recent event — the answer they are
   * looking at is the one that just happened. */
  function rate(verdict) {
    if (!buf.length) return;
    buf[buf.length - 1].v = verdict === 'up' ? 1 : -1;
    persist();
  }

  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  }

  function summary() {
    var byProv = {}, byRoute = {}, lat = [], red = 0, up = 0, down = 0;
    buf.forEach(function (r) {
      byProv[r.prov || '?'] = (byProv[r.prov || '?'] || 0) + 1;
      byRoute[r.route || '?'] = (byRoute[r.route || '?'] || 0) + 1;
      if (r.ms) lat.push(r.ms);
      if (r.red) red += r.red;
      if (r.v === 1) up++;
      if (r.v === -1) down++;
    });
    return {
      total: buf.length,
      byProvenance: byProv,
      byRoute: byRoute,
      medianMs: median(lat),
      p90Ms: lat.length ? lat.slice().sort(function (a, b) { return a - b; })[Math.floor(lat.length * 0.9)] : 0,
      figuresRedacted: red,
      thumbsUp: up,
      thumbsDown: down,
      /* The number the audit actually asked for: which questions fail. A
       * question that reached the model at all is one the deterministic engine
       * could not answer, so this is the honest miss rate of the part of Kiwi
       * that is verifiable. */
      modelFallbackRate: buf.length ? Math.round((byProv.model || 0) / buf.length * 100) : 0,
      refusedRate: buf.length ? Math.round((byProv.refused || 0) / buf.length * 100) : 0,
    };
  }

  function report() {
    var s = summary();
    if (!s.total) return 'Aucune interaction enregistrée.';
    var routes = Object.keys(s.byRoute).sort(function (a, b) { return s.byRoute[b] - s.byRoute[a]; }).slice(0, 8);
    return [
      s.total + ' interactions',
      'latence médiane ' + s.medianMs + ' ms · p90 ' + s.p90Ms + ' ms',
      'renvoyé au modèle ' + s.modelFallbackRate + ' % · refusé (permissions) ' + s.refusedRate + ' %',
      'chiffres retirés par le garde-fou : ' + s.figuresRedacted,
      'avis : ' + s.thumbsUp + ' pouce(s) en haut, ' + s.thumbsDown + ' en bas',
      'routes : ' + routes.map(function (r) { return r + '×' + s.byRoute[r]; }).join(', '),
    ].join('\n');
  }

  window.KiwiAiTelemetry = {
    log: log,
    rate: rate,
    list: function () { return buf.slice(); },
    summary: summary,
    report: report,
    clear: function () { buf.length = 0; persist(); },
  };
})();
