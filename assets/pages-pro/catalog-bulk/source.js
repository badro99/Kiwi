/* Kiwi · where the catalogue spreadsheet reads and writes (window.KiwiBulkSource)
 *
 * Two catalogues behind one shape:
 *   boutique  KiwiBoutiqueCatalog (products × variants, local-first, mirrored
 *             to /api/catalog)
 *   menu      KiwiMenuStore (the carte, mirrored to /api/menu)
 *
 * load(kind) → { kind, rows, columns, categories, lists }
 *   rows carry the grid's canonical fields (assets/pages-pro/catalog-bulk/rules.js).
 * save(kind, patches, listChanges) → { ok, updated, unchanged, local, conflicts, issues, error }
 *   patches: [{ id, set, was }] — the changed rows only.
 *
 * Saving, in order of preference:
 *   1. a real store: ONE call to POST /api/catalog/batch (validated, tenant-
 *      safe, all or nothing). On success the local copy is brought level: the
 *      boutique re-reads its server copy (sync), the carte applies the same
 *      values through its own store, whose publish then finds the server
 *      already holding them.
 *   2. the server unreachable (offline, 5xx): the same values go into the local
 *      store, which keeps them and mirrors them up when the network returns, as
 *      every other catalogue edit does. Said to the merchant, never hidden.
 *   3. the local demo store: local only, by design.
 *
 * Price lists (window.KiwiPriceLists, built separately) add one column per
 * non-main list when, and only when, that module is present.
 */
(function () {
  'use strict';
  const RULES = () => window.KiwiBulkRules;
  const CAT = () => window.KiwiBoutiqueCatalog;
  const MENU = () => window.KiwiMenuStore;

  function real() { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; } }

  function merchantFor(kind) {
    if (kind === 'boutique') { const C = CAT(); return C ? String(C.currentVenue() || '') : ''; }
    try { const C = window.KiwiConfig; const s = C && C.storeSlug && C.storeSlug(); if (s) return String(s); } catch (_) {}
    return '';
  }
  function cloud(kind) {
    if (!real()) return false;
    if (kind === 'boutique') { const C = CAT(); return !!(C && C.currentVenue() && C.currentVenue() !== C.demoVenue); }
    return !!merchantFor('menu');
  }

  /* ── reading ──────────────────────────────────────────────────────────── */
  function boutiqueRows() {
    const C = CAT(); if (!C) return null;
    C.load();
    const categories = C.listCategories().map((c) => ({ id: c.id, name: c.name }));
    const rows = C.listProducts({ includeArchived: true }).map((p) => {
      const vs = C.listVariants(p.id);
      const codes = vs.reduce((n, v) => n + ((v.barcodes || []).length), 0);
      return {
        id: p.id, name: p.name || '', sku: p.sku || '',
        barcode: vs.length === 1 ? (C.primaryBarcode(vs[0]) || '') : '',
        price: Number(p.priceMAD) || 0, cost: Number(p.cost) || 0,
        lowStock: Number(p.reorderLevel) || 0, category: p.categoryId || null, sellable: !p.archived,
        stock: C.productStock(p.id), multi: vs.length !== 1, variants: vs.length, codes,
      };
    });
    return { rows, categories };
  }
  function menuRows() {
    const M = MENU(); if (!M) return null;
    const categories = (M.categories() || []).map((c) => ({ id: c.id, name: c.name }));
    const rows = (M.items() || []).filter((it) => it && !it.archived).map((it) => ({
      id: it.id, name: it.name || '', price: Number(it.price) || 0, category: it.catId || null, sellable: it.avail !== false,
    }));
    return { rows, categories };
  }

  /* Price lists (assets/price-lists.js, the « Tarifs » feature): its contract
     with this sheet is list() → [{ id, name, isMain }], prices(listId) →
     Map<itemKey, cents>, setPrices([{ itemKey, listId, price: cents | null }]).
     Prices cross that boundary in integer centimes; the sheet shows MAD.
     Read defensively all the same: an array of rows is accepted too. */
  async function priceLists(rows) {
    const PL = window.KiwiPriceLists;
    if (!PL || typeof PL.list !== 'function' || typeof PL.prices !== 'function') return [];
    try {
      const all = await PL.list();
      const lists = (Array.isArray(all) ? all : []).filter((l) => l && l.id && !l.isMain && !l.main);
      for (const l of lists) {
        const got = await PL.prices(l.id);
        const map = new Map();
        const mad = (c) => Math.round(Number(c)) / 100;
        if (got instanceof Map) got.forEach((c, id) => { if (c != null && Number.isFinite(Number(c))) map.set(String(id), mad(c)); });
        else if (Array.isArray(got)) got.forEach((x) => { const id = x && (x.itemKey || x.itemId || x.id); const c = x && (x.cents != null ? x.cents : x.price); if (id && c != null) map.set(String(id), mad(c)); });
        rows.forEach((r) => { r['pl:' + l.id] = map.has(r.id) ? map.get(r.id) : null; });
      }
      return lists.map((l) => ({ id: l.id, name: String(l.name || l.id) }));
    } catch (_) { return []; }
  }

  async function load(kind) {
    const base = kind === 'boutique' ? boutiqueRows() : menuRows();
    if (!base) return null;
    const lists = await priceLists(base.rows);
    return { kind, rows: base.rows, categories: base.categories, lists, cloud: cloud(kind), fields: RULES().FIELDS[kind] };
  }

  /* ── writing ──────────────────────────────────────────────────────────── */
  function applyLocalBoutique(patches) {
    const C = CAT();
    const run = () => patches.forEach(({ id, set }) => {
      const patch = {};
      if ('name' in set) patch.name = set.name;
      if ('sku' in set) patch.sku = set.sku;
      if ('price' in set) patch.priceMAD = set.price;
      if ('cost' in set) patch.cost = set.cost;
      if ('lowStock' in set) patch.reorderLevel = set.lowStock;
      if ('category' in set) patch.categoryId = set.category;
      if (Object.keys(patch).length) C.updateProduct(id, patch);
      if ('sellable' in set) C.archiveProduct(id, !set.sellable);
      if ('barcode' in set) {
        const vs = C.listVariants(id);
        if (vs.length === 1) {
          const v = vs[0], old = (v.barcodes || []).find((b) => b.primary) || (v.barcodes || [])[0];
          if (old && old.code !== set.barcode && old.type !== 'ean13') C.removeBarcode(v.id, old.code);
          if (set.barcode) C.attachBarcode(v.id, set.barcode);
        }
      }
    });
    if (C.batch) C.batch(run); else run();
  }
  function applyLocalMenu(patches) {
    const M = MENU();
    patches.forEach(({ id, set }) => {
      const patch = {};
      if ('name' in set) patch.name = set.name;
      if ('price' in set) patch.price = set.price;
      if ('category' in set) { patch.catId = set.category; patch.subId = null; }
      if ('sellable' in set) patch.avail = set.sellable;
      if (Object.keys(patch).length) M.updateItem(id, patch);
    });
  }
  const applyLocal = (kind, patches) => (kind === 'boutique' ? applyLocalBoutique(patches) : applyLocalMenu(patches));

  async function savePriceLists(listChanges) {
    const PL = window.KiwiPriceLists;
    if (!listChanges.length) return { ok: true, count: 0 };
    if (!PL || typeof PL.setPrices !== 'function') return { ok: false, count: 0 };
    const rows = listChanges.map((x) => ({ itemKey: x.itemId, listId: x.listId, price: x.price == null || x.price === '' ? null : Math.round(Number(x.price) * 100) }));
    try { await PL.setPrices(rows); return { ok: true, count: listChanges.length }; }
    catch (_) { return { ok: false, count: 0 }; }
  }

  async function save(kind, patches, listChanges) {
    const lists = await savePriceLists(listChanges || []);
    if (!lists.ok) return { ok: false, error: 'price-lists' };   // nothing else leaves: the sheet keeps every edit
    if (!patches.length) return { ok: true, updated: 0, unchanged: 0, lists: lists.count };
    if (!cloud(kind)) { applyLocal(kind, patches); return { ok: true, updated: patches.length, local: true, lists: lists.count }; }
    let res, body = null;
    try {
      res = await fetch('/api/catalog/batch', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, merchant: merchantFor(kind), opId: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), rows: patches }),
      });
      body = await res.json().catch(() => null);
    } catch (_) { res = null; }
    if (res && res.ok && body && body.ok) {
      if (kind === 'boutique') {
        try { await CAT().sync(); } catch (_) {}
        /* The re-read can miss (network gone right after the write): whatever
           the local copy still lacks is applied here too, so the screen never
           shows a saved value as unsaved. */
        const now = new Map((boutiqueRows() || { rows: [] }).rows.map((r) => [r.id, r]));
        const behind = patches.filter((p) => { const r = now.get(p.id); return r && Object.keys(p.set).some((f) => !RULES().sameValue(f, r[f], p.set[f])); });
        if (behind.length) applyLocal('boutique', behind);
      } else applyLocal('menu', patches);
      return { ok: true, updated: body.updated, unchanged: body.unchanged, lists: lists.count };
    }
    if (res && res.status === 409 && body && body.error === 'conflict') return { ok: false, conflicts: body.conflicts || [] };
    /* Articles created on this device and not yet mirrored up are unknown to
       the server. They travel with the device's own sync, so the whole batch
       does too, instead of failing on a row the merchant can see. */
    const unsynced = res && ((res.status === 422 && body && body.issues && body.issues.length && body.issues.every((i) => i.code === 'not-found'))
      || (res.status === 409 && body && (body.error === 'catalog-missing' || body.error === 'menu-missing')));
    if (unsynced) { applyLocal(kind, patches); return { ok: true, updated: patches.length, local: true, lists: lists.count }; }
    if (res && res.status === 422 && body && body.issues) return { ok: false, issues: body.issues };
    if (res && (res.status === 401 || res.status === 403)) return { ok: false, error: 'unauthorized' };
    if (res && res.status < 500 && res.status !== 0 && body && body.error && body.error !== 'unmigrated') return { ok: false, error: body.error };
    /* Unreachable: the edit is kept on this device and leaves with the next sync. */
    applyLocal(kind, patches);
    return { ok: true, updated: patches.length, local: true, offline: true, lists: lists.count };
  }

  /* The boutique CSV export, unchanged (assets/boutique-catalog.js · exportCsv):
     its columns are the ones the CSV importer reads back. */
  const legacyCsv = (kind) => (kind === 'boutique' && CAT() && CAT().exportCsv ? CAT().exportCsv() : null);

  window.KiwiBulkSource = { load, save, cloud, merchantFor, applyLocal, legacyCsv };
})();
