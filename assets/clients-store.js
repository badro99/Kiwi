/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CLIENTS STORE — window.KiwiClients  (the Fidélité engine)
 * ---------------------------------------------------------------------------
 * ONE per-store client book, shared caisse ↔ dashboard through KiwiStore, the
 * same "one brain" the boutique catalogue and the pairing code already prove.
 * An employee adds a client from the caisse (assets/clients-book.js); the owner
 * sees the full list, segmented, on the dashboard (assets/growth-crm.js) and
 * runs marketing from there.
 *
 *   Records:  kiwi:clients:v1:<book>   → { list:[client…], seq }
 *   Config:   kiwi:fidelity:v1:<book>  → { model, visit, amount, product }
 *
 * <book> — the tenant key. We use `kiwiLiveMerchant` (the merchant slug) because
 * the pairing writes it on BOTH surfaces byte-for-byte (dashboard: caisse-link,
 * caisse: caisse-pairing), so a write on the till and a read on the dashboard
 * resolve to the SAME localStorage record with zero backend. Falls back to the
 * paired venueId, then the dashboard's current venue.
 *
 * Cross-device sync (caisse on a tablet, dashboard on a laptop) rides /api/clients +
 * D1 (functions/api/clients.js) — fail-soft like the pairing endpoints: same-browser
 * via localStorage today, and the server carries the book across devices the moment
 * that endpoint is deployed. Demo/seed books never sync (demo data stays local).
 *
 * Load order: AFTER venue-store.js (needs KiwiStore.define). Vanilla, self-contained.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (!window.KiwiStore || !window.KiwiStore.define) {
    console.warn('clients-store.js loaded before venue-store.js — KiwiClients disabled');
    return;
  }

  var DAY = 86400000;
  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function now() { return Date.now(); }
  function daysSince(ts) { return ts ? Math.floor((now() - ts) / DAY) : Infinity; }

  // the POS vertical currently unlocked on the caisse. pos-* verticals carry
  // is-pos-<id>; the pressing carries is-pressing; the main café/resto caisse only
  // is-unlocked. Order matters — is-pos-* also has is-unlocked.
  function activePosId() {
    try {
      var cls = document.body.className || '';
      var m = cls.match(/is-pos-([a-z0-9]+)/);
      if (m) return m[1];
      if (/\bis-pressing\b/.test(cls)) return 'pressing';
      if (/\bis-unlocked\b/.test(cls)) return 'restaurant';
      return '';
    } catch (_) { return ''; }
  }

  /* ── the tenant key both surfaces agree on ─────────────────────────────── */
  // slugMerchant() twin (functions/auth/_lib.js · caisse-link.js) — a store's name
  // must produce the SAME book id on the dashboard as the slug its till was paired
  // under, or the two ends keep separate client books.
  function slugStore(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function bookId() {
    // 1) DASHBOARD: the store currently being looked at. This outranks the pin
    //    below because kiwiLiveMerchant is a single global — on an account with
    //    two shops it holds whichever was last active, so leading with it served
    //    the boutique's client book while the restaurant was on screen.
    try {
      var KV = window.KiwiVenue;
      if (KV && KV.isCustom && KV.isCustom() && KV.getCurrentVenueData) {
        var cvd = KV.getCurrentVenueData();
        var cs = cvd && cvd.name && slugStore(cvd.name);
        if (cs) return cs;
      }
    } catch (_) {}
    // 2) the merchant slug, written on both sides at pairing — the reliable spine.
    var m = ls('kiwiLiveMerchant'); if (m) return m;
    // 3) caisse: the paired venue.
    try {
      var pv = window.KiwiCaissePairing && KiwiCaissePairing.pairedVenue && KiwiCaissePairing.pairedVenue();
      if (pv && (pv.merchant || pv.venueId)) return pv.merchant || pv.venueId;
    } catch (_) {}
    // 4) dashboard: the current venue id (pre-identity fallback).
    try { var v = KiwiStore.currentVenue && KiwiStore.currentVenue(); if (v) return v; } catch (_) {}
    // 5) demo verticals (unpaired PIN 0002-0015). A boutique/spa/resto demo maps to
    //    the SAME dashboard venue id its catalogue already uses (maisonMansour…), so
    //    the caisse and the dashboard share ONE client book per store — one brain,
    //    exactly like the boutique inventory. Verticals with no dashboard twin get a
    //    local demo-<id> book.
    var pid = activePosId(); if (pid) return DEMO_VENUE_BY_POS[pid] || ('demo-' + pid);
    return null;
  }
  // caisse vertical → the dashboard demo venue id (venues.js REAL_VENUES / venues2.js).
  var DEMO_VENUE_BY_POS = { boutique: 'maisonMansour', spa: 'spaBahia', restaurant: 'cafeAtlas', hotel: 'riadYasmina' };
  // books we pre-seed so a demo looks alive. cafeAtlas is left empty on purpose so
  // the flagship pitch demo keeps its rich hard-coded CRM until real clients arrive.
  var SEED_VENUES = { maisonMansour: 1, spaBahia: 1, riadYasmina: 1 };
  function isDemoBook(book) { return /^demo-/.test(String(book || '')); }
  // Seed ONLY the local pitch demo. On any hosted domain or for a signed-in
  // merchant (KiwiEnv.isReal), NOTHING is ever seeded — a real store's book is
  // always empty until its own till fills it. Demo data can never reach the product.
  function shouldSeed(book) {
    try { if (window.KiwiEnv && KiwiEnv.isReal && KiwiEnv.isReal()) return false; } catch (_) {}
    return isDemoBook(book) || !!SEED_VENUES[book];
  }

  /* ── the store's trade, for the default fidelity mechanic ──────────────── */
  function venueMeta() {
    try {
      var pv = window.KiwiCaissePairing && KiwiCaissePairing.pairedVenue && KiwiCaissePairing.pairedVenue();
      if (pv) return { type: pv.type || '', subtype: pv.subtype || '' };
    } catch (_) {}
    try {
      var d = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData();
      if (d) return { type: d.type || d.kind || '', subtype: d.subtype || d.trade || '' };
    } catch (_) {}
    return { type: '', subtype: '' };
  }

  // model per trade — mirrors the three models in features.js › loyalty.
  //   visit   → X visites = Y offert (café, salon, spa, gym)
  //   product → stamp sur un item (restaurant, pizzeria, boulangerie, traiteur)
  //   amount  → 1 pt / MAD (boutique, épicerie, pharmacie, hôtel — spend-based)
  var MODEL_BY_TRADE = {
    // visit
    cafe: 'visit', coffee: 'visit', salon: 'visit', coiffure: 'visit', spa: 'visit',
    beaute: 'visit', hammam: 'visit', gym: 'visit', sport: 'visit', fitness: 'visit',
    // product
    restaurant: 'product', resto: 'product', pizzeria: 'product', fastfood: 'product',
    snack: 'product', foodtruck: 'product', boulangerie: 'product', bakery: 'product',
    traiteur: 'product', patisserie: 'product',
    // amount
    boutique: 'amount', mode: 'amount', epicerie: 'amount', superette: 'amount',
    pharmacie: 'amount', parapharmacie: 'amount', librairie: 'amount', fleuriste: 'amount',
    hotel: 'amount', riad: 'amount', pressing: 'amount',
  };
  function defaultModel() {
    var meta = venueMeta();
    var sub = String(meta.subtype || '').toLowerCase();
    var typ = String(meta.type || '').toLowerCase();
    var pid = activePosId(); // demo verticals carry no pairedVenue → use the POS id
    return MODEL_BY_TRADE[sub] || MODEL_BY_TRADE[typ] || MODEL_BY_TRADE[pid] || 'amount';
  }

  var DEFAULT_CFG = function () {
    return {
      model: defaultModel(),
      visit:   { target: 10, reward: '1 offert' },
      amount:  { perMad: 1, threshold: 100, reward: '−10 %' },
      product: { item: 'Café', target: 10, reward: '1 offert' },
    };
  };

  /* ── the two KiwiStore records ─────────────────────────────────────────── */
  var clientsStore = KiwiStore.define('clients', { blank: function () { return { list: [], seq: 0 }; } });
  var fidelityStore = KiwiStore.define('fidelity', { blank: function () { return null; } });

  /* Demo books only (kiwi-caisse PIN verticals): seed a small, segment-diverse
   * roster on first open so the Carnet looks alive for a demo. A REAL/paired
   * store's book is NEVER seeded — it starts empty and fills from the till. */
  function maybeSeedDemo(book, d) {
    if (!shouldSeed(book) || d.demoSeeded || (d.list && d.list.length)) return d;
    var t = now();
    var mk = function (o) { return Object.assign(blankClient(), o); };
    d.list = [
      mk({ id: 'd1', name: 'Lalla Khadija El Fassi', phone: '0661421830', email: 'k.elfassi@gmail.com',   city: 'Casablanca', birthday: '1985-04-12', consent: true, consentEmail: true, source: 'caisse', visits: 9, spend: 12400, points: 12400, stamps: 4, firstSeen: t - 120 * DAY, lastSeen: t - 3 * DAY }),
      mk({ id: 'd2', name: 'Salma Bennani',          phone: '0662334455', email: 'salma.bennani@outlook.fr', city: 'Rabat',    birthday: '1992-09-30', consent: true, consentEmail: false, source: 'caisse', visits: 4, spend: 2200, points: 2200, stamps: 4, firstSeen: t - 60 * DAY,  lastSeen: t - 8 * DAY }),
      mk({ id: 'd3', name: 'Imane Alaoui',           phone: '0655778899', email: '',                        city: 'Tanger',    birthday: '',            consent: true, consentEmail: false, source: 'caisse', visits: 1, spend: 850,  points: 850,  stamps: 1, firstSeen: t - 6 * DAY,   lastSeen: t - 6 * DAY }),
      mk({ id: 'd4', name: 'Nawal Idrissi',          phone: '0670112233', email: 'nawal.idrissi@gmail.com', city: 'Marrakech', birthday: '1978-01-25', consent: true, consentEmail: true,  source: 'caisse', visits: 6, spend: 5400, points: 5400, stamps: 6, firstSeen: t - 200 * DAY, lastSeen: t - 45 * DAY }),
    ];
    d.seq = 4;
    d.demoSeeded = true;
    return d;
  }

  function readBook(book) {
    book = book || bookId();
    var d = clientsStore.get(book);
    if (!d || !Array.isArray(d.list)) d = { list: [], seq: 0 };
    if (book && shouldSeed(book) && !d.demoSeeded && !d.list.length) {
      d = maybeSeedDemo(book, d);
      clientsStore.set(d, book); // persist the seed once
    }
    return d;
  }
  function writeBook(d, book) { clientsStore.set(d, book || bookId()); }

  function config(book) {
    book = book || bookId();
    var c = fidelityStore.get(book);
    if (!c || !c.model) { c = DEFAULT_CFG(); fidelityStore.set(c, book); }
    return c;
  }
  function setConfig(patch, book) {
    book = book || bookId();
    var c = config(book);
    var next = Object.assign({}, c, patch || {});
    fidelityStore.set(next, book);
    return next;
  }

  /* ── normalisation & dedup ─────────────────────────────────────────────── */
  function normPhone(p) { return String(p == null ? '' : p).replace(/[^\d+]/g, ''); }
  function samePhone(a, b) {
    a = normPhone(a); b = normPhone(b);
    if (!a || !b) return false;
    // compare on the last 9 digits (Moroccan mobile) so 06… / +2126… match.
    var ta = a.replace(/\D/g, '').slice(-9), tb = b.replace(/\D/g, '').slice(-9);
    return ta.length >= 6 && ta === tb;
  }
  function blankClient() {
    return { id: '', name: '', phone: '', email: '', birthday: '', gender: '', city: '', address: '', notes: '', tags: [],
      points: 0, stamps: 0, visits: 0, spend: 0, consent: false, consentEmail: false,
      source: 'caisse', firstSeen: 0, lastSeen: 0, updated: 0 };
  }

  /* ── reads ─────────────────────────────────────────────────────────────── */
  function list(book) { return readBook(book).list.slice(); }
  function get(id, book) { return readBook(book).list.filter(function (c) { return c.id === id; })[0] || null; }
  function findByPhone(phone, book) {
    if (!normPhone(phone)) return null;
    return readBook(book).list.filter(function (c) { return samePhone(c.phone, phone); })[0] || null;
  }
  function count(book) { return readBook(book).list.length; }

  /* ── writes ────────────────────────────────────────────────────────────── */
  function upsert(input, book) {
    book = book || bookId();
    var d = readBook(book);
    var rec;
    if (input.id) rec = d.list.filter(function (c) { return c.id === input.id; })[0];
    if (!rec && input.phone) rec = d.list.filter(function (c) { return samePhone(c.phone, input.phone); })[0];
    if (rec) {
      // merge editable fields onto the existing record.
      ['name', 'email', 'birthday', 'gender', 'city', 'address', 'notes'].forEach(function (k) {
        if (input[k] != null && input[k] !== '') rec[k] = input[k];
      });
      if (input.phone != null && normPhone(input.phone)) rec.phone = normPhone(input.phone);
      if (typeof input.consent === 'boolean') rec.consent = input.consent;
      if (typeof input.consentEmail === 'boolean') rec.consentEmail = input.consentEmail;
      if (Array.isArray(input.tags)) rec.tags = input.tags.slice();
    } else {
      rec = Object.assign(blankClient(), {
        id: 'c' + (++d.seq) + '_' + Math.abs(hash(book + (input.phone || input.name || d.seq))).toString(36),
        name: input.name || '', phone: normPhone(input.phone), email: input.email || '',
        birthday: input.birthday || '', gender: input.gender || '', city: input.city || '',
        address: input.address || '', notes: input.notes || '',
        consent: !!input.consent, consentEmail: !!input.consentEmail,
        tags: Array.isArray(input.tags) ? input.tags.slice() : [],
        source: input.source || 'caisse', firstSeen: now(), lastSeen: now(),
      });
      d.list.push(rec);
    }
    rec.updated = now();
    writeBook(d, book);
    pushClient(rec, book);
    return rec;
  }

  // record a purchase / visit against a client and accrue fidelity.
  //   opts.amount  → MAD spent (amount model)
  //   opts.visit   → count a visit toward a stamp card (visit / product model)
  // returns { client, rewardReady:bool } — rewardReady when a stamp card fills.
  function recordPurchase(id, opts, book) {
    book = book || bookId();
    opts = opts || {};
    var d = readBook(book);
    var rec = d.list.filter(function (c) { return c.id === id; })[0];
    if (!rec) return null;
    var cfg = config(book);
    var amount = Math.max(0, Math.round(opts.amount || 0));

    rec.visits = (rec.visits || 0) + 1;
    rec.lastSeen = now();
    if (!rec.firstSeen) rec.firstSeen = now();
    if (amount > 0) rec.spend = (rec.spend || 0) + amount;

    var rewardReady = false;
    if (cfg.model === 'amount') {
      var per = (cfg.amount && cfg.amount.perMad) || 1;
      rec.points = (rec.points || 0) + Math.round(amount * per);
      var thr = (cfg.amount && cfg.amount.threshold) || 100;
      rewardReady = thr > 0 && rec.points >= thr;
    } else {
      // visit / product → one stamp per record.
      var target = (cfg.model === 'product' ? (cfg.product && cfg.product.target) : (cfg.visit && cfg.visit.target)) || 10;
      rec.stamps = (rec.stamps || 0) + 1;
      rewardReady = rec.stamps >= target;
    }
    rec.updated = now();
    writeBook(d, book);
    pushClient(rec, book);
    return { client: rec, rewardReady: rewardReady };
  }

  // burn a filled stamp card (staff hands over the reward).
  function redeem(id, book) {
    book = book || bookId();
    var d = readBook(book);
    var rec = d.list.filter(function (c) { return c.id === id; })[0];
    if (!rec) return null;
    var cfg = config(book);
    if (cfg.model === 'amount') {
      var thr = (cfg.amount && cfg.amount.threshold) || 100;
      rec.points = Math.max(0, (rec.points || 0) - thr);
    } else {
      var target = (cfg.model === 'product' ? (cfg.product && cfg.product.target) : (cfg.visit && cfg.visit.target)) || 10;
      rec.stamps = Math.max(0, (rec.stamps || 0) - target);
    }
    rec.updated = now();
    writeBook(d, book);
    pushClient(rec, book);
    return rec;
  }

  function remove(id, book) {
    book = book || bookId();
    var d = readBook(book);
    d.list = d.list.filter(function (c) { return c.id !== id; });
    writeBook(d, book);
    deleteRemote(id, book);
  }

  /* ── segmentation — the 4 buckets the dashboard composer speaks ─────────── */
  //   new  · acquired ≤30 j, ≤2 visits      vip · high value
  //   win  · dormant >30 j (win-back)        reg · everyone else (regulars)
  var VIP_SPEND = 3000, VIP_VISITS = 20, DORMANT_DAYS = 30, NEW_DAYS = 30;
  function segment(c) {
    if (!c) return 'reg';
    if (daysSince(c.lastSeen) > DORMANT_DAYS) return 'win';
    if ((c.spend || 0) >= VIP_SPEND || (c.visits || 0) >= VIP_VISITS) return 'vip';
    if (daysSince(c.firstSeen) <= NEW_DAYS && (c.visits || 0) <= 2) return 'new';
    return 'reg';
  }
  function segmentCounts(book) {
    var out = { reg: 0, vip: 0, new: 0, win: 0, total: 0 };
    list(book).forEach(function (c) { out[segment(c)]++; out.total++; });
    return out;
  }
  // progress toward this client's next reward, 0..1, for the stamp/points bar.
  function progress(c, cfg) {
    cfg = cfg || config();
    if (cfg.model === 'amount') {
      var thr = (cfg.amount && cfg.amount.threshold) || 100;
      return thr > 0 ? Math.min(1, (c.points || 0) / thr) : 0;
    }
    var target = (cfg.model === 'product' ? (cfg.product && cfg.product.target) : (cfg.visit && cfg.visit.target)) || 10;
    return target > 0 ? Math.min(1, (c.stamps || 0) / target) : 0;
  }

  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }

  /* ── real backend sync (fail-soft) — /api/clients + D1 (functions/api/clients.js)
   * Same contract as live-link's /api/sale: gated on kiwiLive (or a real/hosted env),
   * NEVER demo/seed books, and endpoint absence (404/503/offline) is a silent no-op.
   * localStorage stays the source of truth same-browser; the server carries the book
   * across devices (caisse tablet ⇄ dashboard laptop) the moment the endpoint deploys.
   * Merge is last-write-wins on each record's `updated` clock. ─────────────────── */
  function realEnv() { try { return !!(window.KiwiEnv && KiwiEnv.isReal && KiwiEnv.isReal()); } catch (_) { return false; } }
  function syncable(book) {
    return (ls('kiwiLive') === '1' || realEnv()) && !!book && !isDemoBook(book) && !SEED_VENUES[book];
  }
  function curKey(book) { return 'kiwi:clients-cur:v1:' + book; }
  function getCursor(book) { var n = Number(ls(curKey(book))); return n > 0 ? n : 0; }
  function setCursor(book, c) { try { localStorage.setItem(curKey(book), String(c || 0)); } catch (_) {} }

  function pushClient(rec, book) {
    if (!syncable(book) || !rec) return;
    try {
      fetch('/api/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify(Object.assign({ merchant: book }, rec)),
      }).catch(function () {});
    } catch (_) {}
  }
  function deleteRemote(id, book) {
    if (!syncable(book) || !id) return;
    try {
      fetch('/api/clients?merchant=' + encodeURIComponent(book) + '&id=' + encodeURIComponent(id),
        { method: 'DELETE', keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  // map a D1 row (snake_case, 0/1) back onto a client record.
  function fromServer(r) {
    return {
      id: r.id, name: r.name || '', phone: r.phone || '', email: r.email || '', birthday: r.birthday || '',
      gender: r.gender || '', city: r.city || '', address: r.address || '', notes: r.notes || '', tags: [],
      points: r.points || 0, stamps: r.stamps || 0, visits: r.visits || 0, spend: r.spend || 0,
      consent: !!r.consent, consentEmail: !!r.consent_email, source: r.source || 'caisse',
      firstSeen: r.first_seen || 0, lastSeen: r.last_seen || 0, updated: r.updated_ts || 0,
    };
  }
  // merge server rows into the local book, last-write-wins on `updated`.
  function mergeServer(book, rows) {
    var d = readBook(book), changed = false, byId = {};
    d.list.forEach(function (c) { byId[c.id] = c; });
    rows.forEach(function (r) {
      var sc = fromServer(r), local = byId[sc.id];
      if (!local) {
        d.list.push(sc); byId[sc.id] = sc; changed = true;
        var mm = /^c(\d+)_/.exec(sc.id); if (mm) { var n = parseInt(mm[1], 10); if (n > (d.seq || 0)) d.seq = n; }
      } else if ((sc.updated || 0) >= (local.updated || 0)) {
        Object.assign(local, sc); changed = true;
      }
    });
    if (changed) clientsStore.set(d, book); // notifies subscribers; does NOT re-push
    return changed;
  }
  function pull(book, cb) {
    book = book || bookId();
    if (!syncable(book)) { if (cb) cb(false); return; }
    var since = getCursor(book);
    try {
      fetch('/api/clients?merchant=' + encodeURIComponent(book) + '&since=' + since, { headers: { Accept: 'application/json' } })
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (data) {
          if (!data || !Array.isArray(data.clients)) { if (cb) cb(false); return; }
          var changed = data.clients.length ? mergeServer(book, data.clients) : false;
          if (data.cursor) setCursor(book, data.cursor);
          if (cb) cb(changed);
        }).catch(function () { if (cb) cb(false); });
    } catch (_) { if (cb) cb(false); }
  }
  var pollTimer = null;
  function startSync() {
    var b = bookId();
    if (syncable(b)) pull(b);
    if (!pollTimer) pollTimer = setInterval(function () { var bk = bookId(); if (syncable(bk)) pull(bk); }, 15000);
  }

  /* ── live updates (same-tab + cross-tab, via KiwiStore) ─────────────────── */
  function subscribe(fn) { return clientsStore.subscribe(function (vid) { try { fn(vid); } catch (_) {} }); }

  window.KiwiClients = {
    bookId: bookId,
    hasBook: function () { return !!bookId(); },
    // reads
    list: list, get: get, findByPhone: findByPhone, count: count,
    // writes
    upsert: upsert, recordPurchase: recordPurchase, redeem: redeem, remove: remove,
    // fidelity config
    config: config, setConfig: setConfig, defaultModel: defaultModel,
    // analytics
    segment: segment, segmentCounts: segmentCounts, progress: progress,
    // helpers
    normPhone: normPhone, samePhone: samePhone, daysSince: daysSince,
    subscribe: subscribe,
    // backend sync (fail-soft — no-op until /api/clients + D1 are deployed)
    pull: pull, sync: startSync, syncable: function (b) { return syncable(b || bookId()); },
  };

  // Kick the sync loop, and (re)start it the moment a device goes live / pairs.
  window.addEventListener('storage', function (e) {
    if (e && (e.key === 'kiwiLive' || e.key === 'kiwiLiveMerchant' || e.key === 'kiwiPaired')) startSync();
  });
  startSync();
})();
