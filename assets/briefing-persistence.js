(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KiwiBriefingPersistence = factory();
}(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function createPersistence(deps) {
  var slug = deps.slug, localKey = deps.localKey, validSettings = deps.validSettings;
  var render = deps.render, compute = deps.compute, isReal = deps.isReal, localStorage = deps.localStorage;
  var LIMITS = deps.limits, MAX_DAYS = 370, CLOCK_SKEW = 86400000, FEATURE = 'briefing';
  var doc = { days: [] }, docSlug = '', localKept = true, cloud = null;
  function stableJSON(value) {
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableJSON).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableJSON(value[key]);
    }).join(',') + '}';
  }
  function safeDoc(value, venue) {
    value = value && typeof value === 'object' ? value : {};
    venue = venue == null ? slug() : String(venue);
    var days = Array.isArray(value.days) ? value.days.filter(function (x) {
      return x && x.id && x.day && venue && x.venue === venue;
    }) : [];
    days.sort(function (a, b) {
      var clock = (+b.updatedAt || 0) - (+a.updatedAt || 0);
      if (clock) return clock;
      var left = stableJSON(a), right = stableJSON(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    var seen = Object.create(null);
    var settings = validSettings(value.settings), clocks = {};
    Object.keys(settings).forEach(function (key) {
      var at = value.settingsFieldsAt && value.settingsFieldsAt[key];
      var clock = typeof at === 'number' && Number.isFinite(at) ? at : Number(value.settingsAt) || 0;
      /* A field clock is Lamport: an edit lands at max(now, previous + 1), so two
         edits in one millisecond legitimately sit just past Date.now(). Only a
         clock far in the future (a broken device clock) is discarded. */
      clocks[key] = clock > Date.now() + CLOCK_SKEW ? 0 : clock;
    });
    /* One record per business day (the most recently edited wins), then the
       retention keeps the most recent BUSINESS days, not the most recently
       edited ones: reopening an old briefing must not displace a newer day. */
    var perDay = days.filter(function (row) {
      if (seen[row.day]) return false;
      seen[row.day] = true; return true;
    });
    var keepDays = Object.create(null);
    perDay.map(function (row) { return String(row.day); }).sort().reverse().slice(0, MAX_DAYS).forEach(function (d) { keepDays[d] = true; });
    return { settings: settings, settingsAt: Number(value.settingsAt) || 0, settingsFieldsAt: clocks, days: perDay.filter(function (row) { return keepDays[String(row.day)]; }) };
  }
  function readLocal() {
    var venue = slug();
    docSlug = venue;
    if (!venue) return { days: [] };
    try { var raw = localStorage.getItem(localKey()), parsed = raw === null ? { days: [] } : JSON.parse(raw); if (!parsed || !Array.isArray(parsed.days)) throw new Error('invalid-document'); localKept = true; return safeDoc(parsed, venue); }
    catch (_) { localKept = false; return { days: [], error: 'local-read-unavailable' }; }
  }
  function own() {
    if (docSlug !== slug()) doc = readLocal();
    return doc;
  }
  function writeLocal(value) {
    var venue = slug();
    doc = safeDoc(value, venue); docSlug = venue;
    if (venue) {
      var ok = false;
      try { localStorage.setItem(localKey(), JSON.stringify(doc)); ok = true; } catch (_) { console.warn("[briefing] writeLocal failed"); }
      var was = localKept;
      localKept = ok;
      if (!(ok && was)) {
        try {
          if (deps.canDispatch()) {
            deps.dispatch({ store: 'briefing', key: localKey(), durable: ok });
          }
        } catch (_) { console.warn("[briefing] writeLocal failed"); }
      }
    }
    render();
  }
  function mergeDocs(a, b) {
    var left = safeDoc(a), right = safeDoc(b);
    var settings = {}, clocks = {};
    Object.keys(LIMITS).forEach(function (key) {
      var la = left.settingsFieldsAt[key], ra = right.settingsFieldsAt[key];
      var chosen = la == null ? right : ra == null ? left : la > ra ? left : la < ra ? right : stableJSON(left.settings[key]) > stableJSON(right.settings[key]) ? left : right;
      if (chosen.settings[key] != null) { settings[key] = chosen.settings[key]; clocks[key] = chosen.settingsFieldsAt[key]; }
    });
    return safeDoc({ days: left.days.concat(right.days), settings: settings, settingsFieldsAt: clocks, settingsAt: Math.max(left.settingsAt, right.settingsAt) });
  }
  function save() {
    writeLocal(doc);
    var key = localKey() + ':cloud-save', handle = cloud, venue = slug();
    var id = String(Date.now()) + ':' + Math.random().toString(36).slice(2);
    try { localStorage.setItem(key, id); } catch (_) { localKept = false; render(); }
    render();
    return Promise.resolve().then(function () {
      if (!handle) throw new Error('cloud-unavailable');
      return handle.bind();
    }).then(function () {
      if (venue !== slug()) throw new Error('venue-changed');
      return handle.pushNow();
    }).then(function (result) {
      if (!result || !result.ok) throw new Error('cloud-unconfirmed');
      try { if (localStorage.getItem(key) === id) localStorage.removeItem(key); } catch (_) { console.warn("[briefing] save failed"); }
      render(); return { ok: true, id: id };
    }).catch(function () { render(); return { ok: false, id: id, error: 'cloud-unconfirmed' }; });
  }
  function attachCloud() {
    if (cloud || !isReal() || !slug() || !deps.cloudDoc() || !deps.cloudDoc().attach) return;
    cloud = deps.cloudDoc().attach({
      feature: FEATURE, slug: slug, localKey: localKey,
      read: function () { return safeDoc(own()); }, write: writeLocal, merge: mergeDocs,
      isEmpty: function (x) { return !x || (!(x.days || []).length && !Object.keys(x.settings || {}).length); },
      onPulled: function () { compute(); }
    });
  }
  return { own: own, writeLocal: writeLocal, mergeDocs: mergeDocs, save: save, attachCloud: attachCloud, reload: function () { doc = readLocal(); }, bind: function () { return cloud && cloud.bind ? cloud.bind() : false; }, durable: function () { return localKept; }, cloudFailed: function () { try { return !localKept || !!localStorage.getItem(localKey() + ':cloud-save'); } catch (_) { localKept = false; return true; } } };
  }
  return { createPersistence: createPersistence };
}));
