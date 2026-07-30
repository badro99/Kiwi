/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · VENUE STORE — window.KiwiStore
 * ---------------------------------------------------------------------------
 * One reusable per-venue persistence engine. Every operational feature that a
 * store owner configures (menu, floor plan, stock, services, promotions,
 * returns, clients, reservations…) gets its own namespaced, per-venue,
 * cross-tab-synced localStorage record through this — the SAME shape the
 * boutique catalogue proved (assets/boutique-catalog.js), generalised so we
 * stop hand-copying persistence logic per feature.
 *
 * Key format:  kiwi:<feature>:v1:<venueId>
 *   e.g.  kiwi:menu:v1:v1a2b3c   ·   kiwi:floorplan:v1:cafeAtlas
 *
 * A newly created (custom) store starts EMPTY: define()'s blank() shape.
 * A demo store can be pre-seeded via opts.seedFor(venueId). The dashboard and
 * the caisse both resolve the SAME venueId → the SAME key → one brain: a sale
 * rung up on the caisse and an edit made on the dashboard hit one record and
 * both surfaces re-render (same-tab via subscribe(), cross-tab via `storage`).
 *
 * ── ONE BROWSER, THOUGH ────────────────────────────────────────────────────
 * "Both surfaces" meant both surfaces OF THE SAME BROWSER. Every record here
 * was localStorage and nothing else, so a merchant who opened the dashboard on
 * a second device — or in a private window, or after clearing the cache — found
 * their carte, their roster and their loyalty programme gone. `opts.cloud` gives
 * a feature a server copy through assets/cloud-doc.js, which carries the three
 * rules the boutique inventory proved: never lose data on a network failure,
 * never overwrite the other device, never push before hydrating.
 *
 * The server key is deliberately NOT this venueId. venues.js mints it from the
 * clock on creation ('v' + Date.now()) and from the slug on adoption
 * ('v-' + slug), so two browsers of the same merchant never agree on it — a
 * server copy filed under it would be read back by nobody. cloud-doc.js keys on
 * slugMerchant(store name) instead, which the caisse, the dashboard and the
 * server all compute identically, and translates between the two. Local storage
 * is untouched: every existing read site still finds its record where it was.
 *
 * Load me AFTER cloud-doc.js and BEFORE any module that calls KiwiStore.define().
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const PREFIX = 'kiwi:';
  const VER = 'v1';
  const keyFor = (feature, venueId) => PREFIX + feature + ':' + VER + ':' + venueId;
  const KEY_RE = /^kiwi:([^:]+):v1:(.+)$/;

  const subs = Object.create(null); // feature -> Set<fn(venueId)>

  function rawGet(feature, venueId) {
    try { const r = localStorage.getItem(keyFor(feature, venueId)); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function rawSet(feature, venueId, obj) {
    try { localStorage.setItem(keyFor(feature, venueId), JSON.stringify(obj)); } catch (e) {}
  }
  function notify(feature, venueId) {
    const set = subs[feature];
    if (!set) return;
    set.forEach((fn) => { try { fn(venueId); } catch (e) {} });
  }
  function subscribe(feature, fn) {
    (subs[feature] || (subs[feature] = new Set())).add(fn);
    return () => { try { subs[feature].delete(fn); } catch (e) {} };
  }

  // Cross-tab: a write in another tab (e.g. the caisse) → notify this tab's
  // subscribers for that feature so the open page re-renders live.
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key.indexOf(PREFIX) !== 0) return;
    const m = e.key.match(KEY_RE);
    if (m) notify(m[1], m[2]);
  });

  // The active store id — the one identifier that lines dashboard ↔ caisse up.
  function currentVenue() {
    const KV = window.KiwiVenue;
    if (!KV) return null;
    const d = KV.getCurrentVenueData && KV.getCurrentVenueData();
    return (d && d.id) || (KV.getVenue && KV.getVenue()) || null;
  }

  function shallowEmpty(d) {
    if (!d || typeof d !== 'object') return true;
    return Object.keys(d).every((k) => {
      const v = d[k];
      if (v == null) return true;
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === 'object') return Object.keys(v).length === 0;
      return false; // a scalar (e.g. a seq counter) doesn't count as "content"… handled by isEmpty override
    });
  }

  /* Define a per-venue store for one feature and get a small bound handle.
   *   opts.blank()        → the empty shape for a brand-new store (required-ish; defaults to {})
   *   opts.seedFor(vid)   → demo seed for a specific venue, or null → blank (optional)
   *   opts.example(vid)   → a starter template loaded on demand ("Charger un exemple") (optional)
   *   opts.isEmpty(data)  → bool override for the empty check (optional)
   *   opts.cloud          → true (or a feature name) to mirror this record to the
   *                         server, so it survives this browser. The name must be
   *                         listed in FEATURES (functions/api/store.js) — an
   *                         unknown one is refused there and the record simply
   *                         stays local, which is the fail-soft we want.
   *   opts.merge(a, b)    → conflict resolution when two devices both wrote (a =
   *                         ours, b = the server's). Defaults to a union that
   *                         favours this device but drops nothing (optional).
   * Every handle method resolves the venue from the argument, else the active one. */
  function define(feature, opts) {
    opts = opts || {};
    const blank = opts.blank || (() => ({}));
    const resolve = (vid) => vid || currentVenue();
    const empty = (d) => (opts.isEmpty ? !!opts.isEmpty(d) : shallowEmpty(d));

    /* ── the server copy ────────────────────────────────────────────────────
     * `active` is the venue this handle last touched. It is NOT always
     * currentVenue(): clients-store.js addresses its records by an explicit book
     * id, and on the caisse there is no venue engine at all. Tracking what was
     * actually read or written is the only thing true on every surface. */
    const cloudName = opts.cloud === true ? feature : (typeof opts.cloud === 'string' ? opts.cloud : '');
    const carried = Object.create(null);   // slugs whose orphan sweep already ran
    const bound = Object.create(null);     // venue ids already handed to the mirror
    let doc = null;
    let active = null;

    function cloudDoc() {
      if (!cloudName || doc || !window.KiwiCloudDoc) return doc;
      doc = window.KiwiCloudDoc.attach({
        feature: cloudName,
        slug: () => window.KiwiCloudDoc.slugFor(active || currentVenue()),
        // rawGet, not read(): read() materialises a seed, and the mirror must be
        // able to see a genuinely absent record as absent.
        read: () => rawGet(feature, active || currentVenue()) || blank(),
        write: (d) => {
          const vid = active || currentVenue();
          if (!vid) return;
          rawSet(feature, vid, d);
          notify(feature, vid);          // the open page re-renders with the server's copy
        },
        merge: opts.merge,
        isEmpty: (d) => empty(d),
        // Le serveur a refusé la copie (document hors bornes) : la fonctionnalité
        // doit pouvoir le dire au commerçant plutôt que de le laisser croire que
        // son réglage a suivi sur ses autres appareils.
        onRefused: opts.onRefused,
        /* Sous quel nom CE navigateur range la copie que read()/write() touchent.
         * Le dashboard dit `v-amira-boutique`, la caisse dit `amira-boutique` : un
         * même magasin, deux enregistrements locaux. Le miroir a besoin de le
         * savoir pour ne pas leur donner un signet de révision commun — sinon
         * l'un des deux se croit à jour en portant la version de l'autre (voir
         * LE SIGNET DE RÉVISION dans cloud-doc.js). */
        localKey: () => active || currentVenue() || '',
      });
      return doc;
    }

    /* First contact with a store in this page: recover anything left orphaned
     * under an older venue id for the SAME store, then read the server copy. */
    function cloudBind(vid) {
      if (!cloudName || !window.KiwiCloudDoc) return;
      // read() runs on every render (a client list, a menu repaint), so this is
      // a hot path. Once a store is bound there is nothing left to decide.
      if (bound[vid]) return;
      const slug = window.KiwiCloudDoc.slugFor(vid);
      if (!slug) return;                                   // demo / not a real store
      if (!carried[slug]) {
        carried[slug] = 1;
        window.KiwiCloudDoc.carryForward(feature, vid, slug, (raw) => {
          try { return !empty(JSON.parse(raw || 'null')); } catch (e) { return false; }
        });
      }
      const c = cloudDoc();
      if (!c) return;                      // cloud-doc.js absent → stays local
      bound[vid] = 1;
      c.bind();
    }

    function read(vid) {
      vid = resolve(vid);
      if (!vid) return blank();
      active = vid;
      // Asynchronous on purpose: read() hands back what this browser has right
      // now, and the page re-renders through notify() when the copy lands.
      if (cloudName && !bound[vid]) setTimeout(() => cloudBind(vid), 0);
      let d = rawGet(feature, vid);
      if (d == null) {
        d = (opts.seedFor && opts.seedFor(vid)) || blank();
        rawSet(feature, vid, d); // materialise so the record is stable on first read
      }
      return d;
    }
    function write(vid, data) {
      vid = resolve(vid);
      if (!vid) return data;
      active = vid;
      rawSet(feature, vid, data);      // the local write stays synchronous: no
      notify(feature, vid);            // surface ever waits on the network
      if (cloudName) { cloudBind(vid); const c = cloudDoc(); if (c) c.push(); }
      return data;
    }

    return {
      feature,
      venue: resolve,
      key: (vid) => keyFor(feature, resolve(vid)),
      get: (vid) => read(vid),
      set: (data, vid) => write(vid, data),
      // fn receives the (mutable) data; return a value to replace it, or mutate in place.
      update(fn, vid) {
        vid = resolve(vid);
        const d = read(vid);
        const n = fn(d);
        return write(vid, n === undefined ? d : n);
      },
      subscribe: (fn) => subscribe(feature, fn),
      loadExample(vid) {
        vid = resolve(vid);
        const ex = opts.example && opts.example(vid);
        if (ex) write(vid, ex);
        return ex || null;
      },
      clear(vid) { return write(vid, blank()); },
      isEmpty(vid) { return empty(read(vid)); },
      hasData(vid) { return !empty(read(vid)); },
      /* The server copy, for a surface that needs to act on it directly:
       * .cloud().pull() to re-read now, .cloud().flush() to send a pending
       * change immediately. Null when this feature has no `opts.cloud`. */
      cloud: () => cloudDoc(),
    };
  }

  window.KiwiStore = {
    key: keyFor,
    get: rawGet,
    set: (f, v, o) => { rawSet(f, v, o); notify(f, v); },
    subscribe,
    currentVenue,
    define,
    /* The store's server identity — the slug, never the venueId. Exposed so a
     * surface outside this engine (team.js) resolves it exactly the same way. */
    slugFor: (vid) => (window.KiwiCloudDoc ? window.KiwiCloudDoc.slugFor(vid || currentVenue()) : ''),
  };
})();
