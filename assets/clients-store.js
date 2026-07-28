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
   * across devices (caisse tablet ⇄ dashboard laptop).
   * Merge is last-write-wins on each record's `updated` clock. ─────────────────── */
  function realEnv() { try { return !!(window.KiwiEnv && KiwiEnv.isReal && KiwiEnv.isReal()); } catch (_) { return false; } }
  function syncable(book) {
    return (ls('kiwiLive') === '1' || realEnv()) && !!book && !isDemoBook(book) && !SEED_VENUES[book];
  }
  function curKey(book) { return 'kiwi:clients-cur:v1:' + book; }
  function getCursor(book) { var n = Number(ls(curKey(book))); return n > 0 ? n : 0; }
  function setCursor(book, c) { try { localStorage.setItem(curKey(book), String(c || 0)); } catch (_) {} }

  /* ── LA FILE D'ATTENTE ────────────────────────────────────────────────────
   * Ces deux appels étaient « fire-and-forget » : un POST qui échoue — hors
   * ligne, table pas encore migrée, session expirée — n'était jamais rejoué. La
   * fiche restait bien dans le navigateur, mais elle n'atteignait le serveur
   * qu'au prochain passage du client en caisse, c'est-à-dire peut-être jamais.
   * Un tunnel de réseau au comptoir suffisait à ce qu'une cliente inscrite le
   * matin n'existe pas sur le portable du patron le soir.
   *
   * On garde donc les identifiants en souffrance. Ils sont rejoués au tour de
   * synchronisation suivant, en relisant la fiche COURANTE depuis le carnet
   * local — jamais un instantané figé, sinon on renverrait un solde de points
   * périmé par-dessus un plus récent. Une suppression est mise en file sous
   * '-<id>' : elle doit être rejouée elle aussi, ou le client supprimé revient
   * depuis l'autre appareil. */
  function outKey(book) { return 'kiwi:clients-out:v1:' + book; }
  function outRead(book) {
    try { var a = JSON.parse(ls(outKey(book)) || '[]'); return Array.isArray(a) ? a : []; }
    catch (_) { return []; }
  }
  function outWrite(book, a) {
    // Plafonné : une caisse hors ligne pendant des jours ne doit pas remplir le
    // localStorage. Les plus anciens sortent — ils restent dans le carnet local
    // de toute façon, et le prochain passage du client les remettra en file.
    try { localStorage.setItem(outKey(book), JSON.stringify(a.slice(-500))); } catch (_) {}
  }
  function outAdd(book, token) {
    if (!syncable(book) || !token) return;
    var a = outRead(book);
    if (a.indexOf(token) === -1) { a.push(token); outWrite(book, a); }
  }
  function outDrop(book, token) {
    var a = outRead(book);
    var i = a.indexOf(token);
    if (i >= 0) { a.splice(i, 1); outWrite(book, a); }
  }

  function pushClient(rec, book) {
    if (!syncable(book) || !rec || !rec.id) return;
    var id = rec.id;
    try {
      fetch('/api/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify(Object.assign({ merchant: book }, rec)),
      }).then(function (r) {
        if (r && r.ok) { outDrop(book, id); return; }
        outAdd(book, id);                    // 401 / 503 / 500 → on retentera
      }).catch(function () { outAdd(book, id); });
    } catch (_) { outAdd(book, id); }
  }
  function deleteRemote(id, book) {
    if (!syncable(book) || !id) return;
    // Une suppression en attente annule un envoi en attente de la même fiche :
    // rejouer le POST ressusciterait ce qu'on vient d'effacer.
    outDrop(book, id);
    try {
      fetch('/api/clients?merchant=' + encodeURIComponent(book) + '&id=' + encodeURIComponent(id),
        { method: 'DELETE', keepalive: true })
        .then(function (r) {
          if (r && r.ok) { outDrop(book, '-' + id); return; }
          outAdd(book, '-' + id);
        }).catch(function () { outAdd(book, '-' + id); });
    } catch (_) { outAdd(book, '-' + id); }
  }

  /* Rejoue ce qui n'est jamais parti. Silencieux : un échec remet simplement le
   * jeton en file, et le carnet local n'a jamais cessé d'être utilisable. */
  function flushOutbox(book) {
    if (!syncable(book)) return;
    var pending = outRead(book);
    if (!pending.length) return;
    var byId = {};
    readBook(book).list.forEach(function (c) { byId[c.id] = c; });
    pending.slice(0, 25).forEach(function (token) {
      if (token.charAt(0) === '-') { deleteRemote(token.slice(1), book); return; }
      var rec = byId[token];
      // La fiche a quitté le carnet local sans passer par remove() : il n'y a
      // plus rien à envoyer, on sort le jeton plutôt que de retenter sans fin.
      if (!rec) { outDrop(book, token); return; }
      pushClient(rec, book);
    });
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
    var gone = {};
    rows.forEach(function (r) {
      /* Une pierre tombale : ce client a été supprimé sur un autre appareil.
       * Sans ce cas, la ligne serait fusionnée comme une fiche ordinaire — vidée
       * de son nom et de son téléphone par le serveur — et le carnet afficherait
       * un client anonyme et immortel à la place d'une suppression. */
      if (r && r.deleted) {
        if (byId[r.id]) { gone[r.id] = 1; changed = true; }
        // La suppression est acquise : plus rien à rejouer pour cette fiche.
        outDrop(book, r.id); outDrop(book, '-' + r.id);
        return;
      }
      var sc = fromServer(r), local = byId[sc.id];
      if (!local) {
        d.list.push(sc); byId[sc.id] = sc; changed = true;
        var mm = /^c(\d+)_/.exec(sc.id); if (mm) { var n = parseInt(mm[1], 10); if (n > (d.seq || 0)) d.seq = n; }
      } else if ((sc.updated || 0) >= (local.updated || 0)) {
        Object.assign(local, sc); changed = true;
      }
    });
    if (changed) {
      d.list = d.list.filter(function (c) { return !gone[c.id]; });
      clientsStore.set(d, book); // notifies subscribers; does NOT re-push
    }
    return changed;
  }
  /* Une page au plus par appel côté serveur (500 fiches). Un navigateur neuf qui
   * adopte un carnet de 2 000 clients doit continuer à demander tant qu'il
   * reste des pages, sinon il s'arrête à la première et croit avoir tout lu.
   * Le garde-fou de profondeur évite qu'une réponse incohérente ne fasse
   * tourner la boucle sans fin. */
  function pull(book, cb, depth) {
    book = book || bookId();
    if (!syncable(book)) { if (cb) cb(false); return; }
    var since = getCursor(book);
    try {
      fetch('/api/clients?merchant=' + encodeURIComponent(book) + '&since=' + since, { headers: { Accept: 'application/json' } })
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (data) {
          if (!data || !Array.isArray(data.clients)) { if (cb) cb(false); return; }
          var changed = data.clients.length ? mergeServer(book, data.clients) : false;
          // Le curseur n'avance que s'il avance vraiment : sur une réponse
          // incohérente, mieux vaut relire deux fois que sauter des fiches.
          if (data.cursor > since) setCursor(book, data.cursor);
          if (data.more && data.cursor > since && (depth || 0) < 20) {
            pull(book, function (more) { if (cb) cb(changed || more); }, (depth || 0) + 1);
            return;
          }
          if (cb) cb(changed);
        }).catch(function () { if (cb) cb(false); });
    } catch (_) { if (cb) cb(false); }
  }
  var pollTimer = null;
  function tick() {
    var b = bookId();
    if (!syncable(b)) return;
    flushOutbox(b);   // d'abord ce qui n'est jamais parti d'ici…
    pull(b);          // …puis ce que les autres appareils ont fait
  }
  function startSync() {
    tick();
    if (!pollTimer) pollTimer = setInterval(tick, 15000);
  }

  /* ── live updates (same-tab + cross-tab, via KiwiStore) ─────────────────── */
  function subscribe(fn) { return clientsStore.subscribe(function (vid) { try { fn(vid); } catch (_) {} }); }
  // The fidelity PROGRAM (model / targets / rewards) is its own record — the
  // dashboard configurator writes it and the caisse Carnet must re-read it live,
  // so a merchant who changes "10 cafés = 1 offert" on the laptop sees the till's
  // header update without a reload. Same-tab notify here; cross-tab via `storage`.
  function subscribeConfig(fn) { return fidelityStore.subscribe(function (vid) { try { fn(vid); } catch (_) {} }); }

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
    subscribe: subscribe, subscribeConfig: subscribeConfig,
    // backend sync (fail-soft — no-op until /api/clients + D1 are deployed)
    pull: pull, sync: startSync, syncable: function (b) { return syncable(b || bookId()); },
  };

  // Kick the sync loop, and (re)start it the moment a device goes live / pairs.
  window.addEventListener('storage', function (e) {
    if (e && (e.key === 'kiwiLive' || e.key === 'kiwiLiveMerchant' || e.key === 'kiwiPaired')) startSync();
  });
  startSync();
})();
