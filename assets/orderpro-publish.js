/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ORDERPRO PUBLISHER — window.KiwiOrderPro
 * ---------------------------------------------------------------------------
 * The dashboard is the brain. This carries what it knows out to the customer's
 * phone, over the network — the phone shares no browser, no storage and no
 * Bluetooth with the till, so an HTTP round trip is the only link there is.
 *
 * Deliberately NARROW, because half the job already exists: assets/menu-catalog
 * .js publishes a restaurant's carte to POST /api/menu on every edit. This module
 * does NOT duplicate that. It owns the two things nothing else does:
 *
 *   1. BOUTIQUE stock — products × colour × size, counts and barcodes — pushed to
 *      the same POST /api/menu with type='boutique' (functions/api/menu.js runs a
 *      different sanitizer on that type, so the two shapes never collide).
 *   2. MEDIA — uploadMedia() turns a chosen file into an /api/media/… URL. Both
 *      catalogue editors call it, and both store the URL, never the bytes: the
 *      catalogues live in localStorage, where one base64 photo would eat the
 *      whole quota.
 *
 * Guarantees: REAL ONLY (never publishes for a demo/pitch venue — a published
 * catalogue is a public page and the Café Atlas seed must never become one),
 * FAIL-SOFT (no backend ⇒ quiet no-op, the dashboard behaves exactly as today),
 * DEBOUNCED (a merchant editing prices fires dozens of store writes; we publish
 * once, ~1.2 s after they stop).
 *
 * Load me AFTER menu-catalog.js and boutique-catalog.js.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DEBOUNCE_MS = 1200;
  var K = { bizName: 'kiwiBizName', bizType: 'kiwiBizType' };

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

  // Mirror of functions/auth/_lib.js:slugMerchant — one key across
  // dashboard / caisse / OrderPro / D1, with no stored mapping anywhere.
  function slugMerchant(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'client';
  }

  function venueData() {
    try { return window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData(); }
    catch (_) { return null; }
  }
  function isCustom() {
    try { return !!(window.KiwiVenue && KiwiVenue.isCustom && KiwiVenue.isCustom()); }
    catch (_) { return false; }
  }
  // Same gate menu-catalog.js uses before it touches the network: the local pitch
  // demo never makes a call and stays byte-identical.
  function isRealSession() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); }
    catch (_) { return false; }
  }

  /* The real store this dashboard belongs to — or null, meaning publish nothing. */
  function currentBiz() {
    if (!isCustom()) return null;                    // demo/pitch venue → never publish
    var v = venueData();
    var me = window.KiwiMe || null;
    var name = String((v && v.name) || (me && me.business) || ls(K.bizName) || '').trim();
    if (!name) return null;
    return { merchant: slugMerchant(name), name: name, venueId: (v && v.id) || '', type: orderProType(v) };
  }

  /* OrderPro has exactly two verticals. Everything that sells a plate is
   * 'restaurant'; everything that sells a garment off a rail is 'boutique'. An
   * unrecognised trade gets the restaurant flow, which degrades to a plain list
   * of items and prices — never to a broken screen. */
  var BOUTIQUE_TRADES = ['boutique', 'pret-a-porter', 'pretaporter', 'mode', 'friperie',
                         'chaussures', 'maroquinerie', 'bijouterie', 'concept-store'];
  function orderProType(v) {
    var raw = String((v && (v.subtype || v.type)) || ls(K.bizType) || '').toLowerCase();
    for (var i = 0; i < BOUTIQUE_TRADES.length; i++) {
      if (raw.indexOf(BOUTIQUE_TRADES[i]) !== -1) return 'boutique';
    }
    return 'restaurant';
  }

  /* ───────────────── boutique snapshot ─────────────────
   * Shaped for functions/api/menu.js's sanitizeShop, which is what OrderPro's
   * boutique vertical reads back. Mapping lives here (one place) so the phone
   * stays dumb and small. */
  function boutiqueSnapshot() {
    var C = window.KiwiBoutiqueCatalog;
    if (!C) return null;
    var products = C.listProducts({ includeArchived: false }) || [];
    if (!products.length) return null;
    var variants = [];
    products.forEach(function (p) {
      (C.listVariants(p.id) || []).forEach(function (v) {
        variants.push({
          id: v.id, productId: v.productId, colorId: v.colorId, size: v.size,
          stock: v.stock,
          // Only the codes — a shopper never needs our barcode bookkeeping.
          barcodes: (v.barcodes || []).map(function (b) { return (b && b.code) != null ? b.code : b; }),
        });
      });
    });
    return {
      categories: (C.listCategories() || []).map(function (c) { return { id: c.id, name: c.name }; }),
      products: products.map(function (p) {
        return { id: p.id, name: p.name, categoryId: p.categoryId, priceMAD: p.priceMAD, photo: p.photo || '' };
      }),
      variants: variants,
      colors: C.colors(),
    };
  }

  /* ───────────────── publish ───────────────── */

  var timer = null;
  var lastSent = '';                                 // skip identical re-publishes
  var state = { publishing: false, lastOk: 0, lastError: '' };

  function publishNow() {
    var biz = currentBiz();
    // Restaurants are already published by menu-catalog.js — nothing to do here.
    if (!biz || biz.type !== 'boutique' || !isRealSession()) {
      return Promise.resolve({ ok: false, error: 'nothing-to-publish' });
    }
    var catalog = boutiqueSnapshot();
    if (!catalog) return Promise.resolve({ ok: false, error: 'nothing-to-publish' });

    var body = JSON.stringify({ name: biz.name, type: 'boutique', data: catalog });
    if (body === lastSent) return Promise.resolve({ ok: true, skipped: true });

    state.publishing = true;
    return fetch('/api/menu', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: body,
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        state.publishing = false;
        if (r.ok && j && j.ok) {
          lastSent = body;                           // only cache a CONFIRMED publish
          state.lastOk = Date.now();
          state.lastError = '';
          return j;
        }
        state.lastError = (j && j.error) || ('http-' + r.status);
        return { ok: false, error: state.lastError };
      });
    }).catch(function () {
      // No backend (static host / not deployed yet) → silent no-op, by design.
      state.publishing = false;
      state.lastError = 'network';
      return { ok: false, error: 'network' };
    });
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; publishNow(); }, DEBOUNCE_MS);
  }

  /* ───────────────── media upload ─────────────────
   * Turns a chosen File into a URL. Everything about media in Kiwi hangs off
   * this: catalogues store what it returns, never the bytes. */
  function uploadMedia(file) {
    if (!file) return Promise.resolve({ ok: false, error: 'no-file' });
    return fetch('/api/media?name=' + encodeURIComponent(file.name || 'file'), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (r.ok && j && j.ok) return j;             // { ok, url, kind }
        return { ok: false, error: (j && j.error) || ('http-' + r.status), status: r.status };
      });
    }).catch(function () { return { ok: false, error: 'network' }; });
  }

  /* Is media storage actually live? The dashboard can ask before offering the
   * picker, so it says "pas encore activé" instead of failing after the merchant
   * already chose a 20 MB video. */
  function mediaReady() {
    return fetch('/api/media', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return !!(j && j.media); })
      .catch(function () { return false; });
  }

  /* ───────────────── wire-up ───────────────── */
  function start() {
    var biz = currentBiz();
    if (!biz || biz.type !== 'boutique') return;     // demo venue / restaurant / no store
    try { if (window.KiwiBoutiqueCatalog) window.KiwiBoutiqueCatalog.subscribe(schedule); } catch (_) {}
    // Publish once on load so a store stocked before this shipped catches up.
    setTimeout(publishNow, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.KiwiOrderPro = {
    publishNow: publishNow,
    schedule: schedule,
    uploadMedia: uploadMedia,
    mediaReady: mediaReady,
    merchant: function () { var b = currentBiz(); return b ? b.merchant : ''; },
    type: function () { var b = currentBiz(); return b ? b.type : ''; },
    state: function () { return { publishing: state.publishing, lastOk: state.lastOk, lastError: state.lastError }; },
    slugMerchant: slugMerchant,
  };
})();
