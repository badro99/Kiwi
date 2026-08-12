/* Kiwi Platform Kernel
 *
 * One tenant-aware boundary for the external capabilities Kiwi borrows from
 * best-in-class open-source systems.  No external project becomes the source
 * of truth: every adapter either returns verified data or an explicit
 * unavailable result.  This file is deliberately vanilla and lazy; a caisse
 * never downloads a map or chart engine merely because it can.
 */
(function () {
  'use strict';

  var VERSION = 1;
  var providers = Object.create(null);
  var searchProviders = Object.create(null);
  var listeners = new Set();
  var telemetry = [];
  var MAX_TELEMETRY = 250;
  var bc = null;
  try { bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('kiwi-platform-v1') : null; } catch (_) {}

  function clean(value, max) { return String(value == null ? '' : value).trim().slice(0, max || 120); }
  function clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; } }
  function slug(value) {
    return clean(value, 80).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function paired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function tenant() {
    var p = paired();
    if (p && (p.merchant || p.slug)) return clean(p.merchant || p.slug, 80);
    try {
      var v = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData();
      if (v && (v.slug || v.merchant)) return clean(v.slug || v.merchant, 80);
      if (v && v.custom && v.name) return slug(v.name);
    } catch (_) {}
    try { var s = window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug(); if (s) return clean(s, 80); } catch (_) {}
    try { var live = localStorage.getItem('kiwiLiveMerchant'); if (live) return clean(live, 80); } catch (_) {}
    return 'local-demo';
  }
  function emit(type, detail) {
    var event = { type: clean(type, 40), tenant: tenant(), detail: clone(detail || {}), at: Date.now() };
    listeners.forEach(function (fn) { try { fn(event); } catch (_) {} });
    try { if (bc) bc.postMessage(event); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('kiwi-platform', { detail: event })); } catch (_) {}
  }
  if (bc) bc.onmessage = function (event) {
    var row = event && event.data;
    if (!row || row.tenant !== tenant()) return;
    listeners.forEach(function (fn) { try { fn(row); } catch (_) {} });
  };

  function register(name, adapter) {
    name = clean(name, 40);
    if (!name || !adapter || typeof adapter !== 'object') throw new Error('Invalid platform adapter');
    providers[name] = adapter;
    emit('capability', { name: name, state: 'registered' });
    return adapter;
  }
  function capability(name) {
    var adapter = providers[clean(name, 40)];
    if (!adapter) return { name: clean(name, 40), available: false, reason: 'not-registered' };
    var state = { name: clean(name, 40), available: true, reason: '', engine: clean(adapter.engine || 'kiwi', 60) };
    try {
      if (typeof adapter.available === 'function') state.available = !!adapter.available();
      else if (adapter.available === false) state.available = false;
      if (!state.available) state.reason = clean(typeof adapter.reason === 'function' ? adapter.reason() : adapter.reason || 'not-configured', 120);
    } catch (_) { state.available = false; state.reason = 'adapter-error'; }
    return state;
  }
  function capabilities() { return Object.keys(providers).sort().map(capability); }

  /* OpenFGA-inspired relation model.  Front-end checks improve the experience,
     but never replace server authorization. Unknown mutations are denied. */
  var ROLE = {
    owner: ['*'], proprietaire: ['*'], operator: ['*'],
    manager: ['read:*','write:catalog','write:inventory','write:planning','write:customers','write:orders','write:reservations','write:reports','action:refund','action:reprint','action:message'],
    caisse: ['read:catalog','read:inventory','read:customers','read:orders','write:orders','write:customers','action:checkout','action:reprint'],
    cashier: ['read:catalog','read:inventory','read:customers','read:orders','write:orders','write:customers','action:checkout','action:reprint'],
    serveur: ['read:tables','read:orders','read:planning','write:orders','action:request-bill'],
    server: ['read:tables','read:orders','read:planning','write:orders','action:request-bill'],
    kitchen: ['read:orders','write:order-status'], cuisinier: ['read:orders','write:order-status'],
    stock: ['read:catalog','read:inventory','write:inventory'], magasinier: ['read:catalog','read:inventory','write:inventory'],
    employee: ['read:planning'], employe: ['read:planning']
  };
  function accessKey() { return 'kiwiAccess:v1:' + tenant(); }
  function accessDoc() {
    try { var d = JSON.parse(localStorage.getItem(accessKey()) || 'null'); return d && typeof d === 'object' ? d : { grants: [], denies: [] }; }
    catch (_) { return { grants: [], denies: [] }; }
  }
  function roleOf(subject) {
    subject = subject || {};
    var value = subject.role || subject.tier || subject.function || '';
    if (!value) {
      try { value = sessionStorage.getItem('kiwiStaffRole') || localStorage.getItem('kiwiStaffRole') || ''; } catch (_) {}
    }
    return clean(value || 'employee', 40).toLowerCase();
  }
  function matches(rule, action, resource, subject) {
    if (!rule) return false;
    if (typeof rule === 'string') {
      if (rule === '*') return true;
      var wanted = action + ':' + resource;
      return rule === wanted || rule === action + ':*';
    }
    return (!rule.subject || rule.subject === subject.id || rule.subject === roleOf(subject)) &&
      (!rule.action || rule.action === action || rule.action === '*') &&
      (!rule.resource || rule.resource === resource || rule.resource === '*');
  }
  function can(subject, action, resource) {
    subject = subject || {};
    action = clean(action, 30).toLowerCase(); resource = clean(resource, 50).toLowerCase();
    if (!action || !resource) return false;
    var doc = accessDoc();
    if ((doc.denies || []).some(function (rule) { return matches(rule, action, resource, subject); })) return false;
    if ((doc.grants || []).some(function (rule) { return matches(rule, action, resource, subject); })) return true;
    return (ROLE[roleOf(subject)] || ROLE.employee).some(function (rule) { return matches(rule, action, resource, subject); });
  }
  function setAccess(doc) {
    doc = doc && typeof doc === 'object' ? doc : {};
    var safe = { grants: Array.isArray(doc.grants) ? doc.grants.slice(0, 500) : [], denies: Array.isArray(doc.denies) ? doc.denies.slice(0, 500) : [], updatedAt: Date.now() };
    try { localStorage.setItem(accessKey(), JSON.stringify(safe)); } catch (_) { return false; }
    emit('access', { updatedAt: safe.updatedAt }); return true;
  }

  /* OpenTelemetry-inspired local spans. Attributes are allow-listed; customer
     text, names, phones, order contents and credentials are never recorded. */
  var ALLOWED_ATTR = { capability:1, route:1, method:1, status:1, result:1, engine:1, offline:1, count:1, bytes:1, vertical:1 };
  function safeAttrs(attrs) {
    var out = {};
    Object.keys(attrs || {}).forEach(function (key) {
      if (!ALLOWED_ATTR[key]) return;
      var value = attrs[key];
      out[key] = typeof value === 'number' || typeof value === 'boolean' ? value : clean(value, 80);
    });
    return out;
  }
  function startSpan(name, attrs) {
    var started = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    var row = { id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'sp-' + Date.now().toString(36) + Math.random().toString(36).slice(2), name: clean(name, 80), tenant: tenant(), startedAt: Date.now(), attrs: safeAttrs(attrs) };
    return {
      end: function (result, more) {
        var ended = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        row.ms = Math.max(0, Math.round(ended - started)); row.result = clean(result || 'ok', 30);
        row.attrs = Object.assign(row.attrs, safeAttrs(more)); telemetry.push(row);
        if (telemetry.length > MAX_TELEMETRY) telemetry.shift();
        emit('span', { name: row.name, result: row.result, ms: row.ms }); return clone(row);
      }
    };
  }
  function telemetrySummary() {
    var rows = telemetry.slice(), failures = rows.filter(function (row) { return row.result !== 'ok' && row.result !== 'success'; });
    var times = rows.map(function (row) { return row.ms || 0; }).sort(function (a,b) { return a-b; });
    return { total: rows.length, failures: failures.length, failureRate: rows.length ? Math.round(failures.length / rows.length * 100) : 0, medianMs: times.length ? times[Math.floor(times.length / 2)] : 0 };
  }

  /* Meilisearch-inspired provider index with deterministic local fallback. */
  function registerSearch(name, fn) { if (name && typeof fn === 'function') searchProviders[clean(name, 40)] = fn; }
  function normalize(text) { return clean(text, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function score(row, terms) {
    var title = normalize(row.title), body = normalize([row.subtitle,row.keywords,row.id].join(' '));
    return terms.reduce(function (sum, term) { return sum + (title === term ? 50 : title.indexOf(term) === 0 ? 25 : title.indexOf(term) >= 0 ? 12 : body.indexOf(term) >= 0 ? 4 : -100); }, 0);
  }
  async function search(query, opts) {
    var terms = normalize(query).split(/\s+/).filter(Boolean).slice(0, 8); if (!terms.length) return [];
    var names = Object.keys(searchProviders), all = [];
    await Promise.all(names.map(async function (name) {
      try {
        var rows = await searchProviders[name](query, opts || {});
        (Array.isArray(rows) ? rows : []).slice(0, 250).forEach(function (row) { if (row && row.title) all.push(Object.assign({ provider:name }, row)); });
      } catch (_) {}
    }));
    return all.map(function (row) { return Object.assign(row, { _score:score(row,terms) }); }).filter(function (row) { return row._score >= 0; }).sort(function (a,b) { return b._score-a._score || String(a.title).localeCompare(String(b.title)); }).slice(0, Math.max(1, Math.min(50, +(opts && opts.limit) || 15)));
  }

  window.KiwiPlatform = {
    version: VERSION, tenant: tenant, register: register, capability: capability, capabilities: capabilities,
    subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; }, emit: emit,
    access: { can:can, role:roleOf, read:accessDoc, write:setAccess },
    telemetry: { start:startSpan, list:function () { return clone(telemetry); }, summary:telemetrySummary, clear:function () { telemetry.length=0; } },
    search: { register:registerSearch, query:search },
  };
})();
