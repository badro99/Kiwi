/* Kiwi Vertical State — shared persistence shell for specialist caisses.
 * A vertical registers a pure snapshot/restore pair. The shell hydrates before
 * first render, detects meaningful domain changes, writes locally immediately,
 * and mirrors the document per merchant through KiwiStore/CloudDoc. UI-only
 * route, modal, query and focus state must stay out of each snapshot. */
(function () {
  'use strict';

  /* ── Réseau du comptoir : ce que le terminal SAIT, pas ce qu'un bouton prétend ──
   * Onze métiers affichaient une pastille « En ligne / Hors-ligne » qu'un tap
   * basculait à la main, puis annonçaient « Réseau de retour, 3 actions
   * synchronisées » : un drapeau local avait changé, rien n'avait été envoyé ni
   * vérifié. Les ventes partent réellement par la file de live-link
   * (kiwiSaleQueue, rejouée au retour du réseau), c'est donc elle, et
   * navigator.onLine, que le terminal doit montrer.
   *
   * Défini AVANT la garde KiwiStore ci-dessous : l'état du réseau ne dépend pas
   * du stockage des fiches, et un métier doit pouvoir le lire même si ce
   * dernier ne s'est pas chargé. Rétro-compatible : aucun module existant ne
   * l'appelle encore. */
  var netWatchers = [];
  var netBound = false;
  function netStatus(snapshot) {
    var q = snapshot || null;
    if (!q) { try { q = window.KiwiLive && window.KiwiLive.queueStatus && window.KiwiLive.queueStatus(); } catch (_) { q = null; } }
    q = q || {};
    var storageError = !!q.storageError;
    var blocked = (+q.blocked || 0) > 0 || storageError;
    return {
      offline: typeof navigator !== 'undefined' && navigator.onLine === false,
      queued: Math.max(0, +q.pending || 0),
      blocked: blocked,
      storageError: storageError,
    };
  }
  function netEmit(snapshot) {
    var st = netStatus(snapshot);
    netWatchers.slice().forEach(function (fn) { try { fn(st); } catch (_) {} });
  }
  function netWatch(fn) {
    if (typeof fn !== 'function') return function () {};
    netWatchers.push(fn);
    if (!netBound && typeof window !== 'undefined' && window.addEventListener) {
      netBound = true;
      window.addEventListener('online', function () { netEmit(); });
      window.addEventListener('offline', function () { netEmit(); });
      window.addEventListener('kiwi:sale-queue', function (e) { netEmit(e && e.detail); });
      window.addEventListener('storage', function (e) { if (!e || e.key === 'kiwiSaleQueue') netEmit(); });
    }
    return function () { netWatchers = netWatchers.filter(function (x) { return x !== fn; }); };
  }
  /* La phrase que le tap sur la pastille doit dire, vraie à l'instant T. */
  function netSay(st) {
    st = st || netStatus();
    if (st.blocked) return 'Synchronisation bloquée, les ventes restent sur cette caisse. Contactez le support.';
    if (st.offline) return 'Pas de réseau, les ventes restent sur cette caisse et partiront au retour de la connexion.';
    if (st.queued) return st.queued + ' vente' + (st.queued > 1 ? 's' : '') + ' en cours d’envoi au serveur.';
    return 'Caisse en ligne, aucune vente en attente d’envoi.';
  }
  /* Message d'un CHANGEMENT d'état (réseau perdu / revenu), ou '' s'il n'y en a pas.
   * « Réseau de retour, 3 actions synchronisées » se disait dès que le navigateur
   * repassait en ligne, alors que la file d'envoi ne faisait que commencer à se
   * vider : on dit ce qui est vrai à cet instant, « en cours d'envoi ». Sur un
   * terminal appairé, caisse-pwa.js avale déjà le tap sur la pastille et la
   * rejoue depuis navigator.onLine : c'est donc ce message, pas un tap, qui
   * informe le caissier. */
  function netChange(wasOffline, st) {
    st = st || netStatus();
    if (!!wasOffline === !!st.offline) return '';
    if (st.offline) return 'Pas de réseau, les ventes restent sur cette caisse et partiront au retour de la connexion.';
    if (st.blocked) return 'Réseau de retour, mais la synchronisation est bloquée. Contactez le support.';
    return st.queued
      ? 'Réseau de retour, ' + st.queued + ' vente' + (st.queued > 1 ? 's' : '') + ' en cours d’envoi.'
      : 'Réseau de retour.';
  }
  window.KiwiVerticalNet = { status: netStatus, watch: netWatch, say: netSay, change: netChange };

  if (!window.KiwiStore?.define) return;

  var handles = new Map();
  function pairedVenue(value) {
    if (value && typeof value === 'object') return value;
    try {
      return (window.KiwiPlatform && typeof window.KiwiPlatform.pairedVenue === 'function' && window.KiwiPlatform.pairedVenue())
        || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return null; }
  }
  /* The caisse deliberately does not load venues.js.  Consequently the venue
   * store's implicit currentVenue() is null there: every get()/update() without
   * an id used to read a blank document and silently drop the write.  A pairing
   * carries the server identity already, so use that identity explicitly.  The
   * merchant slug is stable across devices; venueId is retained for older
   * pairings that pre-date it. */
  function venueKey(value) {
    if (!value) {
      try {
        if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedMerchant === 'function') {
          var pm = window.KiwiPlatform.pairedMerchant();
          if (pm) return pm;
        }
      } catch (_) {}
    }
    var p = pairedVenue(value);
    var id = p && (p.merchant || p.venueId || p.id);
    if (id) return String(id);
    try { return String(window.KiwiStore.currentVenue?.() || ''); } catch (_) { return ''; }
  }
  function real() {
    try { if (window.KiwiEnv?.isReal?.()) return true; } catch (_) {}
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.isPaired === 'function' && window.KiwiPlatform.isPaired()) return true;
      return !!JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return false; }
  }
  function copy(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } }
  function device() {
    var k = 'kiwi:verticalops:device'; var d = '';
    try { d = localStorage.getItem(k) || ''; } catch (_) {}
    if (!d) { d = 'terminal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); try { localStorage.setItem(k, d); } catch (_) {} }
    return d;
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  var store = window.KiwiStore.define('verticalops', {
    cloud: 'verticalops',
    blank: function () { return { verticals: {}, commands: [], seq: 0 }; },
    isEmpty: function (d) { return !d || !Object.keys(d.verticals || {}).length; },
    merge: function (mine, theirs) {
      var out = { verticals: {}, commands: [], seq: Math.max(+(mine?.seq || 0), +(theirs?.seq || 0)) };
      var a = mine?.verticals || {}, b = theirs?.verticals || {};
      new Set(Object.keys(a).concat(Object.keys(b))).forEach(function (k) {
        var x = a[k], y = b[k]; out.verticals[k] = !y || +(x?.updatedAt || 0) >= +(y?.updatedAt || 0) ? x : y;
      });
      var seen = new Set();
      (theirs?.commands || []).concat(mine?.commands || []).sort(function (x, y) { return +(x.at || 0) - +(y.at || 0); }).forEach(function (c) {
        if (!c?.id || seen.has(c.id)) return; seen.add(c.id); out.commands.push(c);
      });
      out.commands = out.commands.slice(-300);
      return out;
    },
    onRefused: function (reason) {
      try {
        window.Kiwi?.toast?.('Synchronisation métier refusée', {
          type: 'error', force: true,
          desc: reason === 'string-too-long'
            ? 'Une photo est trop volumineuse. Réessayez avec une image plus légère.'
            : 'Les données restent sur cet appareil. Réessayez après avoir allégé le dossier.',
        });
      } catch (_) {}
    },
  });

  function open(name, spec) {
    name = String(name || '').trim().toLowerCase();
    if (!name || !spec?.snapshot || !spec?.restore) return null;
    if (handles.has(name)) return handles.get(name);
    var hydrated = false, applying = false, saving = false, last = '', timer = 0;
    var activeVenue = venueKey();
    var baseline = copy(spec.snapshot());
    function signature(data) { try { return JSON.stringify(data); } catch (_) { return ''; } }
    function restore(data) {
      applying = true;
      try { spec.restore(copy(data)); } finally { applying = false; }
    }
    function selectVenue(value) {
      var next = venueKey(value);
      if (next === activeVenue) return false;
      /* Never let tenant A's closure-level arrays become tenant B's first
       * autosave.  Restore the pristine module state before looking up B. */
      restore(baseline);
      activeVenue = next;
      hydrated = false;
      last = '';
      return true;
    }
    function hydrate() {
      selectVenue();
      if (hydrated) return false;
      /* Pas encore réel, ou pas encore de commerce : on N'est PAS hydraté.
       * Verrouiller hydrated=true ici faisait qu'un terminal dont l'identité
       * arrivait une seconde plus tard (KiwiMe, appairage) n'allait jamais lire
       * sa fiche enregistrée, puis écrasait celle-ci par les valeurs par
       * défaut du module au premier changement. save() attend le réel. */
      if (!real() || !activeVenue) return false;
      var row = store.get(activeVenue)?.verticals?.[name];
      if (row?.data) restore(row.data);
      var current = copy(spec.snapshot()); last = signature(current); hydrated = true; return !!row?.data;
    }
    function save(label) {
      selectVenue();
      if (!real() || !activeVenue || applying) return false;
      if (!hydrated) hydrate();
      var data = copy(spec.snapshot()); if (!data) return false;
      var sig = signature(data); if (!sig || sig === last) return false;
      var now = Date.now(), dev = device();
      saving = true;
      try {
        store.update(function (d) {
          d.verticals ||= {}; d.commands ||= []; d.seq = (+d.seq || 0) + 1;
          var command = { id: `${dev}-${d.seq}-${hash(sig)}`, vertical: name, label: String(label || 'state-change').slice(0, 80), at: now, device: dev, hash: hash(sig) };
          d.verticals[name] = { schema: +(spec.schema || 1), updatedAt: now, device: dev, commandId: command.id, data: data };
          d.commands.push(command); d.commands = d.commands.slice(-300); return d;
        }, activeVenue);
      } finally { saving = false; }
      last = sig; return true;
    }
    function rebind(value) {
      if (!selectVenue(value)) return false;
      hydrate();
      return true;
    }
    function start() {
      hydrate(); if (!timer) timer = setInterval(function () { save('autosave'); }, 1500);
    }
    var api = { hydrate: hydrate, save: save, start: start, rebind: rebind, venue: function () { return activeVenue; }, store: store };
    handles.set(name, api);
    store.subscribe(function (vid) {
      if (saving || applying || String(vid || '') !== activeVenue) return;
      var row = store.get(activeVenue)?.verticals?.[name];
      if (!row?.data) return;
      restore(row.data);
      last = signature(copy(spec.snapshot()));
      try { window.KiwiPosDispatch?.repaint?.(); } catch (_) {}
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else setTimeout(start, 0); /* let a lazily loaded vertical finish declaring its domain constants */
    window.addEventListener('pagehide', function () { save('pagehide'); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') save('hidden'); });
    return api;
  }

  window.KiwiVerticalState = {
    open: open,
    register: function (spec) { return open(spec?.vertical, spec); },
    store: store,
    isReal: real,
  };
  document.addEventListener('kiwi-paired', function (event) {
    handles.forEach(function (handle) { try { handle.rebind(event && event.detail); } catch (_) {} });
  });
})();
