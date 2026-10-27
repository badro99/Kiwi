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
  // Bound transport and JSON reads, even when a transport ignores abort.
  function fetchDeadline(url, options, readBody) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer;
    var request = new Promise(function (resolve, reject) {
      try { resolve(fetch(url, Object.assign({}, options, controller ? {signal: controller.signal} : {}))); }
      catch (error) { reject(error); }
    }).then(function (response) {
      if (readBody === false || !response || typeof response.json !== 'function') return response;
      return response.json().then(function (data) {
        response.json = function () { return Promise.resolve(data); }; return response;
      }, function (error) {
        response.json = function () { return Promise.reject(error); }; return response;
      });
    });
    var deadline = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        var error = new Error('request-timeout'); error.code = 'timeout';
        reject(error);
        if (controller) controller.abort();
      }, 12000);
    });
    return Promise.race([request, deadline]).finally(function () { clearTimeout(timer); });
  }


  // Shared by the till book and dashboard directory. Arabic keeps this
  // surface's Latin digits, including when the dashboard i18n is unavailable.
  var numberFormats = {};
  function clientNumber(value, language, quantity) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    var scale = quantity ? 1000 : 100;
    n = Math.round(n * scale) / scale;
    var lang = language || document.documentElement.lang || 'fr';
    var locale = lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR';
    var digits = quantity ? 0 : (Number.isInteger(n) ? 0 : 2);
    // The dashboard's shared formatter wins where it is loaded, so these
    // figures read like every other amount on the page.
    var shared = window.KiwiNumber && window.KiwiNumber.format;
    if (shared) return shared(n, { minimumFractionDigits: digits, maximumFractionDigits: quantity ? 3 : digits }).replace(/[\u202f\u00a0]/g, '\u00a0');
    var key = locale + ':' + quantity + ':' + digits;
    var formatter = numberFormats[key] || (numberFormats[key] = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits, maximumFractionDigits: quantity ? 3 : digits
    }));
    return formatter.format(n).replace(/[\u202f\u00a0]/g, '\u00a0');
  }
  function clientQuantity(value) {
    var n = Number(value);
    return isFinite(n) ? Math.max(0, Math.round(n * 1000) / 1000) : 0;
  }
  window.KiwiClientNumbers = {
    money: function (n, lang) { return clientNumber(n, lang, false); },
    quantity: function (n, lang) { return clientNumber(n, lang, true); },
    csv: function (n) { return String(Math.round((Number(n) || 0) * 100) / 100); }
  };

  if (!window.KiwiStore || !window.KiwiStore.define) {
    console.warn('clients-store.js loaded before venue-store.js · KiwiClients disabled');
    return;
  }

  var DAY = 86400000;
  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function now() { return Date.now(); }
  function daysSince(ts) { return ts ? Math.floor((now() - ts) / DAY) : Infinity; }

  // the POS vertical currently unlocked on the caisse. Every vertical, pressing
  // included, carries is-pos-<id>; the main café/resto caisse only is-unlocked.
  // Order matters — is-pos-* also has is-unlocked.
  function activePosId() {
    try {
      var cls = document.body.className || '';
      var m = cls.match(/is-pos-([a-z0-9]+)/);
      if (m) return m[1];
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
  /* One-time carry-over, for the same reason as the boutique catalogue: the book
   * used to be named by whatever kiwiLiveMerchant held (an account-level slug),
   * and is now named for the store. Identical in the one-store case; where they
   * differ, adopt the existing book instead of showing an empty client list.
   * Copy, never move. */
  var adopted = {};
  function hasClients(raw) {
    try { var d = JSON.parse(raw || 'null'); return !!(d && d.list && d.list.length); } catch (_) { return false; }
  }
  /* Same one-store-only rule as the boutique catalogue: with two stores there is
   * no way to tell which of them the account-keyed book belonged to. */
  function soleStore() {
    try {
      var a = JSON.parse(localStorage.getItem('kiwiCustomVenues') || '[]');
      return Array.isArray(a) && a.length === 1;
    } catch (_) { return false; }
  }
  function adoptLegacyBook(slug) {
    if (!slug || adopted[slug]) return;
    adopted[slug] = 1;
    if (!soleStore()) return;
    try {
      var pre = 'kiwi:clients:v1:';
      // An EMPTY book does not count as "already has one" — otherwise merely
      // opening the page once would permanently block the carry-over.
      if (hasClients(localStorage.getItem(pre + slug))) return;
      // Where the book could have been filed before: the pin as it stood before
      // live-link.js repointed it (it preserves that for us — it loads first, so
      // we cannot snapshot in time), and the account name it derived from.
      var biz = '';
      try { biz = (window.KiwiMe && window.KiwiMe.business) || ''; } catch (_) {}
      var cands = [biz && slugStore(biz), ls('kiwiLiveMerchantPrev'), ls('kiwiLiveMerchant')];
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        if (!c || c === slug) continue;
        var old = localStorage.getItem(pre + c);
        if (!hasClients(old)) continue;                    // nothing worth carrying
        localStorage.setItem(pre + slug, old);
        return;
      }
    } catch (_) {}
  }
  function pairedVenueData() {
    try {
      var pv = (window.KiwiCaissePairing && KiwiCaissePairing.pairedVenue && KiwiCaissePairing.pairedVenue())
        || (window.KiwiPlatform && KiwiPlatform.pairedVenue && KiwiPlatform.pairedVenue());
      if (!pv) {
        var raw = ls('kiwiPairedVenue');
        if (raw) pv = JSON.parse(raw);
      }
      return pv || null;
    } catch (_) { return null; }
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
        // Le slug gravé (venues.js › slugOf) plutôt que le nom re-slugifié :
        // renommer son établissement ne doit pas ouvrir un carnet vide à côté
        // de celui où sont tous les clients.
        var cs = cvd && ((cvd.slug || '') || (cvd.name && slugStore(cvd.name)));
        if (cs) { adoptLegacyBook(cs); return cs; }
      }
    } catch (_) {}
    // 2) CAISSE: when running on a paired till (or in an active POS session), the
    //    till's own pairing identity (kiwiPairedVenue) MUST outrank the browser-wide
    //    kiwiLiveMerchant! Otherwise, an operator who previously inspected another
    //    store (e.g. Amira Café) in the dashboard leaves kiwiLiveMerchant pointing
    //    to that other store, which caused the boutique till to read the café's
    //    clients instead of the boutique's clients (#0154).
    try {
      var isPaired = ls('kiwiPaired') === '1';
      var pid = activePosId();
      if (isPaired || pid) {
        var pv = pairedVenueData();
        if (pv && (pv.merchant || pv.venueId || pv.slug)) {
          return pv.merchant || pv.venueId || pv.slug;
        }
      }
    } catch (_) {}
    // 3) the merchant slug, written on both sides at pairing — the reliable spine.
    var m = ls('kiwiLiveMerchant'); if (m) return m;
    // 4) caisse: paired venue fallback.
    var pvFallback = pairedVenueData();
    if (pvFallback && (pvFallback.merchant || pvFallback.venueId || pvFallback.slug)) {
      return pvFallback.merchant || pvFallback.venueId || pvFallback.slug;
    }
    // 5) dashboard: the current venue id (pre-identity fallback).
    try { var v = KiwiStore.currentVenue && KiwiStore.currentVenue(); if (v) return v; } catch (_) {}
    // 6) demo verticals (unpaired PIN 0002-0015). A boutique/spa/resto demo maps to
    //    the SAME dashboard venue id its catalogue already uses (maisonMansour…), so
    //    the caisse and the dashboard share ONE client book per store — one brain,
    //    exactly like the boutique inventory. Verticals with no dashboard twin get a
    //    local demo-<id> book.
    var pid2 = activePosId(); if (pid2) return DEMO_VENUE_BY_POS[pid2] || ('demo-' + pid2);
    return null;
  }
  // caisse vertical → the dashboard demo venue id (venues.js REAL_VENUES).
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
    var pv = pairedVenueData();
    if (pv) return { type: pv.type || '', subtype: pv.subtype || '' };
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

  /* `auto: true` = personne n'a choisi ce programme, il est DÉDUIT du métier du
   * magasin. La distinction compte depuis que le programme se synchronise : le
   * défaut est matérialisé dès la première lecture — donc avant que la copie
   * serveur n'ait eu le temps d'arriver — et sans ce drapeau il gagnait la
   * fusion contre le vrai réglage. Le commerçant réglait « 10 visites = 1 café
   * offert » sur le portable, et la caisse continuait d'annoncer « −10 % » en
   * ayant écrasé son choix. Un défaut déduit ne quitte donc jamais l'appareil ;
   * setConfig() retire le drapeau, parce que là quelqu'un a décidé. */
  var DEFAULT_CFG = function () {
    return {
      auto: true,
      model: defaultModel(),
      visit:   { target: 10, reward: '1 offert' },
      amount:  { perMad: 1, threshold: 100, reward: '−10 %' },
      product: { item: 'Café', target: 10, reward: '1 offert' },
    };
  };

  /* ── the two KiwiStore records ─────────────────────────────────────────── */
  var clientsStore = KiwiStore.define('clients', { blank: function () { return { list: [], seq: 0 }; } });
  /* The loyalty PROGRAMME (model, targets, rewards) rides the document mirror —
   * it is one small object per store, edited from the dashboard configurator and
   * read on every till. The client BOOK does not: it goes record by record
   * through /api/clients below, because a book grows without a natural ceiling
   * and two tills serving two different customers must never collide over one
   * document. Same server, two shapes, for two different write patterns.
   *
   * Without this, a merchant who set "10 cafés = 1 offert" on the laptop saw the
   * tablet's till keep the default programme, and the two counted different
   * rewards for the same customer. */
  var fidelityStore = KiwiStore.define('fidelity', {
    blank: function () { return null; },
    cloud: true,
    // Un programme déduit ne compte pas comme un réglage : voir DEFAULT_CFG.
    isEmpty: function (d) { return !d || !d.model || !!d.auto; },
  });

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
  /* Le programme tourne quand quelqu'un l'a choisi. Le défaut déduit du métier
   * (`auto`) sert à pré-remplir l'éditeur, pas à distribuer des récompenses. */
  function loyaltyOn(book) {
    book = book || bookId();
    // La démo montre la fidélité en marche ; elle n'engage aucun commerçant.
    if (isDemoBook(book) || SEED_VENUES[book]) return true;
    var c = fidelityStore.get(book);
    return KiwiLoyaltyRules.loyaltyOn(c);
  }

  function setConfig(patch, book) {
    book = book || bookId();
    var c = config(book);
    var next = Object.assign({}, c, patch || {});
    // Quelqu'un a décidé : ce n'est plus un défaut déduit, et ça a désormais le
    // droit de voyager jusqu'aux autres appareils.
    delete next.auto;
    fidelityStore.set(next, book);
    return next;
  }

  /* ── normalisation & dedup ─────────────────────────────────────────────── */
  function normPhone(p) {
    return window.KiwiPhone ? window.KiwiPhone.normalize(p) : String(p == null ? '' : p).replace(/[^\d+]/g, '');
  }
  function money(v) {
    var n = Number(v);
    return isFinite(n) ? Math.max(0, Math.min(1000000000, Math.round(n * 100) / 100)) : 0;
  }
  function samePhone(a, b) {
    if (window.KiwiPhone) return window.KiwiPhone.same(a, b);
    a = normPhone(a); b = normPhone(b);
    if (!a || !b) return false;
    return a === b;
  }
  function blankClient() {
    return { id: '', name: '', phone: '', email: '', birthday: '', gender: '', city: '', address: '', notes: '', tags: [],
      hospitality: {},
      points: 0, stamps: 0, visits: 0, spend: 0, consent: false, consentEmail: false,
      source: 'caisse', firstSeen: 0, lastSeen: 0, updated: 0, history: [] };
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
      if (!rec.profileBase) rec.profileBase = profileSnapshot(rec);
      // merge editable fields onto the existing record.
      ['name', 'email', 'birthday', 'gender', 'city', 'address', 'notes'].forEach(function (k) {
        if (input[k] != null && input[k] !== '') rec[k] = input[k];
      });
      /* A note is cleared only by an edit of this very record (its card or
         its form). A blank from a create that landed on the same phone
         keeps the note the team already wrote. */
      if (input.notes === '' && input.id && input.id === rec.id) rec.notes = '';
      if (input.phone != null && normPhone(input.phone)) rec.phone = normPhone(input.phone);
      if (typeof input.consent === 'boolean') rec.consent = input.consent;
      if (typeof input.consentEmail === 'boolean') rec.consentEmail = input.consentEmail;
      if (Array.isArray(input.tags)) rec.tags = input.tags.slice();
      if (input.hospitality && typeof input.hospitality === 'object') {
        rec.hospitality = Object.assign({}, rec.hospitality || {}, input.hospitality);
      }
    } else {
      rec = Object.assign(blankClient(), {
        id: 'c' + (++d.seq) + '_' + Math.abs(hash(book + (input.phone || input.name || d.seq))).toString(36),
        name: input.name || '', phone: normPhone(input.phone), email: input.email || '',
        birthday: input.birthday || '', gender: input.gender || '', city: input.city || '',
        address: input.address || '', notes: input.notes || '',
        hospitality: input.hospitality && typeof input.hospitality === 'object' ? Object.assign({}, input.hospitality) : {},
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

