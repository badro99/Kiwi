/* Stock state owner. Exports named ledger, movement, count and receipt methods.
 * Reads injected functions only; browser services are listed in the split contract. */
window.KiwiStockState = (read) => {
  'use strict';
  const stStockOverrides = {};
  let stCountsCache = [];
  let stCountsLastFetched = 0;
  const currentStockFor = (...args) => read().currentStockFor(...args);
  const retailCatalog = (...args) => read().retailCatalog(...args);
  const retailSetProductStock = (...args) => read().retailSetProductStock(...args);
  const stShowReal = (...args) => read().stShowReal(...args);
  const stockLocationId = (...args) => read().stockLocationId(...args);
  const stockUnitId = (...args) => read().stockUnitId(...args);

  function ledgerOpeningFor(it) {
    if (it?.retail) return +it.currentStock || 0;
    const legacy = stStockOverrides[it.id] != null ? stStockOverrides[it.id] : it.currentStock;
    try {
      const L = window.KiwiInventory;
      if (stShowReal() && L && L.isReal && L.isReal()) {
        const locationId = stockLocationId();
        L.ensureOpening(it.id, +legacy || 0, { unitCost: +it.costPerUnit || null, locationId });
        return L.balance(it.id, { locationId });
      }
    } catch (_) {}
    return legacy;
  }

  function moveStock(it, qty, reason, refType, refId, note, unitCost, meta) {
    if (!it || !qty) return null;
    if (it.retail && retailCatalog()) return moveRetailStock(it, qty, reason, refType, refId);
    try {
      const L = window.KiwiInventory;
      if (stShowReal() && L && L.isReal && L.isReal()) {
        const locationId = meta && meta.locationId ? meta.locationId : stockLocationId();
        const movementMeta = Object.assign({}, meta || {}, { unitId: (meta && meta.unitId) || stockUnitId() });
        delete movementMeta.locationId;
        /* movementId explicite ⇒ le registre déduplique sur l'id (rejouer le
         * même dépôt est un no-op). Absent ⇒ comportement historique (UUID). */
        const payload = {
          itemId: it.id, locationId, qty, reason, refType: refType || 'manual', refId: refId || '',
          note: note || '', unitCost: unitCost == null ? (+it.costPerUnit || null) : unitCost,
          meta: movementMeta,
        };
        if (movementMeta.movementId) payload.id = movementMeta.movementId;
        delete movementMeta.movementId;
        return L.add(payload);
      }
    } catch (_) {}
    stStockOverrides[it.id] = currentStockFor(it) + qty;
    return null;
  }

  function moveRetailStock(it, qty, reason, refType, refId) {
    const next = Math.max(0, currentStockFor(it) + (+qty || 0));
    retailSetProductStock(it.id, next, reason || 'ajust');
    return { itemId: it.id, qty: +qty || 0, reason: reason || 'ajust', refType: refType || 'manual', refId: refId || '' };
  }

  function countStock(it, counted, refId) {
    const diff = Math.round((counted - currentStockFor(it)) * 1000) / 1000;
    if (diff) moveStock(it, diff, 'count', 'count', refId || ('count-' + Date.now()), 'Ajustement issu du comptage');
    return diff;
  }

  function stIntakePostAllOwner(S, helpers) {
    const { stIntakePostingCanonical, stIntakePostingIds, stIntakePostingLines, stIntakePrepare, stIntakeSupplierId, stSha256Hex } = helpers;
    return async function stIntakePostAll(ctx) {
    const P = window.KiwiProcurement || null;
    const K = window.KiwiInventory || null;
    const C = window.KiwiCost || null;
    const docId = String((ctx && ctx.docId) || '');
    if (!docId) throw new Error('intake-doc-required');
    /* Sans registre, aucun mouvement ne doit partir : un K.add absent
     * avalerait chaque ligne en silence et le document serait marqué
     * confirmé sur du vide. */
    if (!K || typeof K.add !== 'function') throw new Error('intake-ledger-required');
    const owner = (typeof K.merchant === 'function') ? String(K.merchant() || '') : '';
    if (!owner) throw new Error('intake-merchant-required');
    const supplierName = String(ctx.supplierName || '');
    const externalRef = String(ctx.externalRef || '');
    const receivedAt = +ctx.receivedAt || Date.now();
    const issuedAt = +ctx.issuedAt || receivedAt;

    let supplierId = '';
    if (P) {
      const list = (P.doc && P.doc().suppliers) || [];
      const norm = supplierName.trim().toLowerCase();
      const known = list.find((s) => String((s && s.name) || '').trim().toLowerCase() === norm);
      if (known) supplierId = known.id;
      else if (norm) {
        const created = P.addSupplier({ id: stIntakeSupplierId(supplierName), name: supplierName });
        supplierId = (created && created.id) || '';
      }
    }

    const normalizedCtx = Object.assign({}, ctx, {
      receivedAt, issuedAt, lines: ctx.lines || [],
    });
    const canonical = stIntakePostingCanonical(normalizedCtx);
    const postLines = stIntakePostingLines(normalizedCtx);
    const cleanLines = postLines.map((l) => ({
      itemId: l.itemId, name: l.name, qty: l.qty, unit: l.unit, unitCost: l.unitCost,
    }));
    if (!cleanLines.length) throw new Error('intake-lines-required');
    const ids = await stIntakePostingIds(owner, docId, postLines.length);

    /* Avant la première écriture locale, le serveur fige l'empreinte du
     * brouillon relu. Un crash puis une nouvelle extraction/correction ne peut
     * donc pas réutiliser les ids indexés avec un autre contenu. */
    const postingHash = await stSha256Hex(new TextEncoder().encode(JSON.stringify(canonical)));
    await stIntakePrepare(docId, postingHash, cleanLines.length);

    let receipt = null;
    if (P && P.receiveDirect) {
      receipt = P.receiveDirect({
        receiptId: ids.receiptId, supplierId, externalRef, receivedAt,
        lines: cleanLines, skipMovements: true, skipCosts: true,
      });
      if (!receipt || receipt.error) throw new Error((receipt && receipt.error) || 'receipt-failed');
    }

    postLines.forEach((l, idx) => {
      /* Acceptation vérifiée ligne par ligne : K.add rend null quand le
       * registre refuse (pas réel, pas de marchand, ligne invalide). Un
       * refus silencieux serait une confirmation mensongère — on lève, la
       * reprise rejouera (ids déterministes, couches convergentes). */
      const accepted = K.add({
        id: ids.movementIds[idx],
        itemId: l.itemId, qty: +l.qty, reason: 'receipt',
        refType: 'receipt', refId: receipt ? receipt.id : ids.receiptId,
        note: [supplierName, externalRef].filter(Boolean).join(' · '),
        unitCost: l.unitCost, occurredTs: receivedAt,
        meta: {
          supplierId: l.cardSupplierId || supplierId,
          supplierName, externalRef, receiptRef: ids.receiptId,
          receivedAt, rank: l.cardRank || 1,
          expiresAt: l.dlc ? new Date(l.dlc + 'T23:59:59').getTime() : null,
        },
      });
      if (!accepted) throw new Error('intake-movement-rejected:' + l.itemId);
      if (l.updateCost && +l.unitCost > 0 && C && C.setItemCost) {
        try { C.setItemCost(l.itemId, +l.unitCost, supplierName); } catch (_) {}
      }
    });

    /* K.add est local-first et ne constitue pas un accusé de réception D1.
     * Sans ce sync explicite, le document pouvait être marqué confirmed puis
     * l'onglet mourir avant que le setTimeout du registre pousse ses lignes. */
    if (typeof K.sync !== 'function' || await K.sync() !== true) {
      throw new Error('intake-movement-sync-required');
    }

    let invoice = null;
    if (P && P.attachInvoice) {
      const inv = P.attachInvoice({
        invoiceId: ids.invoiceId, supplierId, number: externalRef,
        issuedAt, receiptId: receipt ? receipt.id : ids.receiptId,
        lines: cleanLines, source: String(ctx.source || 'pdf'),
      });
      if (inv && !inv.error) invoice = inv;
    }
    return { receiptId: receipt ? receipt.id : ids.receiptId, invoiceId: invoice ? invoice.id : null, movementIds: ids.movementIds };
  };
  }

  function fetchServerCountsOwner(S, helpers) {
    const {  } = helpers;
    return async function fetchServerCounts() {
    // Pace attempts too: a paused/offline read must not render and retry forever.
    S.stCountsLastFetched = Date.now();
    try {
      const resp = await fetch('/api/inventory/counts');
      const data = await resp.json();
      if (data && Array.isArray(data.counts)) {
        S.stCountsCache = data.counts;
        S.stCountsLastFetched = Date.now();
      }
    } catch (_) {}
  };
  }

  function stLegacyPostAllOwner(S, helpers) {
    const { stUpsertSupplierCard } = helpers;
    return function stLegacyPostAll(ctx) {
    const supplier = String((ctx && ctx.supplier) || '');
    const externalRef = String((ctx && ctx.externalRef) || '');
    const date = String((ctx && ctx.date) || '');
    const receivedAt = +((ctx && ctx.receivedAt) || Date.now());
    const receiptRef = String((ctx && ctx.receiptRef) || ('receipt-' + Date.now().toString(36)));
    const lines = Array.isArray(ctx && ctx.lines) ? ctx.lines : [];
    const items = Array.isArray(ctx && ctx.items) ? ctx.items : [];
    const receivingLines = lines.map((line) => {
      const it = items.find((x) => x.id === line.itemId);
      return {
        itemId: line.itemId,
        name: it?.name || line.itemId,
        qty: line.qty,
        unit: it?.unit || 'unité',
        unitCost: line.cost,
      };
    });
    let receiptId = receiptRef;
    if (window.KiwiProcurement?.receiveDirect) {
      let known = window.KiwiProcurement.doc()?.suppliers?.find((s) => String(s.name || '').toLowerCase() === supplier.toLowerCase());
      if (!known) known = window.KiwiProcurement.addSupplier({ name: supplier });
      const receipt = window.KiwiProcurement.receiveDirect({
        receiptId: receiptRef,
        supplierId: known?.id || supplier,
        externalRef,
        receivedAt,
        lines: receivingLines,
        skipMovements: true,
        skipCosts: true,
      });
      if (receipt && receipt.id) receiptId = receipt.id;
      if (window.KiwiProcurement?.attachInvoice) {
        try {
          window.KiwiProcurement.attachInvoice({
            supplierId: known?.id || supplier,
            number: externalRef,
            date,
            receiptId,
            lines: receivingLines,
            source: 'pdf',
          });
        } catch (_) {}
      }
    }
    // La boucle moveStock reste la SEULE à écrire des mouvements sur ce chemin.
    lines.forEach((line) => {
      const it = items.find((x) => x.id === line.itemId);
      if (!it) return;
      const { supId, supRank } = stUpsertSupplierCard(it, supplier, line);
      moveStock(it, line.qty, 'receipt', 'receipt', receiptRef,
        [supplier, externalRef, date].filter(Boolean).join(' · '), line.cost || null, {
          supplierId: supId,
          supplierName: supplier,
          externalRef,
          receiptRef,
          receivedAt,
          rank: supRank,
          expiresAt: line.dlc ? new Date(line.dlc + 'T23:59:59').getTime() : null,
        });
      if (line.updateCost && line.cost > 0 && window.KiwiCost?.setItemCost) {
        window.KiwiCost.setItemCost(it.id, line.cost, supplier);
      }
    });
    return { receiptId };
  };
  }

  return Object.freeze({ ledgerOpeningFor, moveStock, moveRetailStock, countStock,
    overrides: () => stStockOverrides,
    counts: () => stCountsCache, replaceCounts: value => { stCountsCache = value; },
    countsFetchedAt: () => stCountsLastFetched, markCountsFetched: value => { stCountsLastFetched = value; },
    stLegacyPostAll: stLegacyPostAllOwner, stIntakePostAll: stIntakePostAllOwner, fetchServerCounts: fetchServerCountsOwner,
  });
};
