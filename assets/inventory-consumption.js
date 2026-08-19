/* Kiwi Inventory Consumption — turns an accepted sale into idempotent stock
 * movements. Services/tips/taxes never consume stock. Complete recipes consume
 * ingredients; other physical products consume their own item identity. */
(function () {
  'use strict';

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function n(v) { v = +v; return Number.isFinite(v) ? v : 0; }
  function doc() { try { return window.KiwiCost?.doc?.() || {}; } catch (_) { return {}; } }
  function norm(v) { return String(v == null ? '' : v).trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  /* Une part d'addition partagée ne porte que le libellé du plat : le partage
   * est indexé par nom, jamais par identifiant. Sans ce repêchage, un ticket
   * partagé en deux sortait l'argent sans sortir la marchandise. */
  function recipeByName(name, d) {
    var want = norm(name);
    if (!want) return '';
    var ids = Object.keys(d.recipes || {});
    for (var i = 0; i < ids.length; i++) {
      if (norm(d.recipes[ids[i]] && d.recipes[ids[i]].name) === want) return ids[i];
    }
    return '';
  }

  /* A recipe line names its ingredient in the costing namespace ("stock:usr-a1"),
   * the ledger keys movements on the bare article id. Left unresolved, every
   * consumed gram lands on a phantom article and the real one never moves. */
  function articleId(ln, d) {
    if (!ln) return '';
    if (ln.stock) return String(ln.stock);
    var id = String(ln.ing || '');
    var known = (d.ingredients || []).find(function (x) { return String(x.id) === id; });
    if (known && known.stockId) return String(known.stockId);
    return id.indexOf('stock:') === 0 ? id.slice(6) : '';
  }

  /* Le coût d'usage est porté par l'ingrédient dans son unité de recette
   * (0,008 MAD le gramme), la sortie de stock est écrite dans l'unité du stock
   * (le kilo). Le rapport qty/stockQty de la ligne fait la conversion sans
   * qu'aucune table d'unités soit nécessaire : 0,008 × 1000 g ÷ 1 kg = 8 MAD/kg.
   * Sans cette valeur, le grand livre compte les quantités mais jamais l'argent,
   * et le coût matière réel n'est plus dérivable d'une seule vente. */
  function lineUnitCost(ln, d) {
    if (!ln) return null;
    var id = String(ln.ing || '');
    var ing = (d.ingredients || []).find(function (x) { return String(x.id) === id; });
    var use = ing && ing.useCost != null ? n(ing.useCost) : null;
    if (use == null || !(use > 0)) return null;
    var recipeQty = n(ln.qty);
    var stockQty = ln.stockQty != null ? n(ln.stockQty) : recipeQty;
    if (!(recipeQty > 0) || !(stockQty > 0)) return null;
    return use * recipeQty / stockQty;
  }

  function recipeLines(productId, qty, d, depth, trail) {
    if (!productId || depth > 5) return null;
    var rec = d.recipes && d.recipes[String(productId)];
    if (!rec || rec.status !== 'complete' || !Array.isArray(rec.lines) || !rec.lines.length) return null;
    var out = [];
    var yieldQty = n(rec.yield) > 0 ? n(rec.yield) : 1;
    for (var i = 0; i < rec.lines.length; i++) {
      var ln = rec.lines[i]; if (!ln) return null;
      /* Prefer the quantity already expressed in the article's own unit: the
       * till carries no unit table, so 350 g of chicken can only be booked
       * against a stock kept in kilos if the dashboard did the sum. */
      var per = ln.stockQty != null ? n(ln.stockQty) : n(ln.qty);
      var used = per * qty / yieldQty;
      if (!(used > 0)) continue;
      if (ln.sub) {
        var nested = recipeLines(String(ln.sub), used, d, depth + 1, trail.concat(String(productId)));
        if (!nested) return null;
        out = out.concat(nested);
      } else if (ln.ing) {
        var article = articleId(ln, d);
        /* An ingredient with no article behind it (a note, a garnish nobody
         * counts) simply does not move stock. It must not sink the recipe and
         * send the dish's own identity to the ledger instead. */
        if (article) out.push({ itemId: article, qty: used, unitCost: lineUnitCost(ln, d), recipe: String(productId), trail: trail });
      }
    }
    return out;
  }

  function deriveLots(itemId) {
    var I = window.KiwiInventory;
    if (!I || !I.history) return [];
    var rows = (I.history(itemId) || []).slice().reverse(); // Chronological order
    var lots = [];

    for (var i = 0; i < rows.length; i++) {
      var m = rows[i];
      if (!m || m.itemId !== itemId) continue;
      var q = +m.qty || 0;
      if (!(q !== 0)) continue;

      if (q > 0 && (m.reason === 'opening' || m.reason === 'receipt')) {
        var rank = m.meta && m.meta.rank != null ? +m.meta.rank : (m.reason === 'opening' ? 999 : 50);
        lots.push({
          id: m.id,
          initialQty: q,
          remainingQty: q,
          unitCost: m.unitCost != null && Number.isFinite(+m.unitCost) ? +m.unitCost : null,
          rank: rank,
          ts: +m.occurredTs || 0,
          meta: m.meta || null,
          supplierName: (m.meta && m.meta.supplierName) || null,
        });
      } else if (q < 0) {
        // Deplete from available active lots sorted by rank ASC, ts ASC
        var needed = Math.abs(q);
        var active = lots.filter(function (l) { return l.remainingQty > 0; });
        active.sort(function (a, b) {
          if (a.rank !== b.rank) return a.rank - b.rank;
          return a.ts - b.ts;
        });
        for (var j = 0; j < active.length && needed > 0; j++) {
          var lot = active[j];
          var take = Math.min(lot.remainingQty, needed);
          lot.remainingQty = Math.round((lot.remainingQty - take) * 1000) / 1000;
          needed = Math.round((needed - take) * 1000) / 1000;
        }
      } else if (q > 0) {
        // Reversal / restitution: restore to lot matching frozen unitCost (or most recently depleted lot)
        var restored = q;
        var candidates = lots.filter(function (l) {
          return l.remainingQty < l.initialQty && (m.unitCost == null || l.unitCost === m.unitCost);
        });
        if (!candidates.length) {
          candidates = lots.filter(function (l) { return l.remainingQty < l.initialQty; });
        }
        candidates.sort(function (a, b) { return b.ts - a.ts; });
        for (var k = 0; k < candidates.length && restored > 0; k++) {
          var cLot = candidates[k];
          var canAdd = Math.min(cLot.initialQty - cLot.remainingQty, restored);
          cLot.remainingQty = Math.round((cLot.remainingQty + canAdd) * 1000) / 1000;
          restored = Math.round((restored - canAdd) * 1000) / 1000;
        }
      }
    }

    // Sort lots: rank ASC (primary supplier rank 1 first, rank 2 next, legacy opening last), then ts ASC (FIFO within rank)
    lots.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.ts - b.ts;
    });

    return lots.filter(function (l) { return l.remainingQty > 0; });
  }

  function allocateCost(itemId, reqQty, defaultUnitCost) {
    reqQty = Math.max(0, +reqQty || 0);
    if (!(reqQty > 0)) return defaultUnitCost;
    var lots = deriveLots(itemId);
    var remainingReq = reqQty;
    var totalCost = 0;
    var coveredQty = 0;

    for (var i = 0; i < lots.length && remainingReq > 0; i++) {
      var lot = lots[i];
      if (lot.remainingQty <= 0) continue;
      var take = Math.min(lot.remainingQty, remainingReq);
      var cost = lot.unitCost != null ? lot.unitCost : defaultUnitCost;
      if (cost != null) {
        totalCost += take * cost;
        coveredQty += take;
      }
      lot.remainingQty = Math.round((lot.remainingQty - take) * 1000) / 1000;
      remainingReq = Math.round((remainingReq - take) * 1000) / 1000;
    }

    // Terminal fallback for unbacked deficit portion
    if (remainingReq > 0) {
      if (defaultUnitCost != null && Number.isFinite(+defaultUnitCost) && +defaultUnitCost > 0) {
        totalCost += remainingReq * +defaultUnitCost;
        coveredQty += remainingReq;
      } else {
        // Partial coverage with no default rate: return null rather than diluting average
        return null;
      }
    }

    if (coveredQty >= reqQty && reqQty > 0) {
      return Math.round((totalCost / reqQty) * 10000) / 10000;
    }
    return null;
  }

  function movementId(ref, lineIndex, itemId, part) {
    var merchant = window.KiwiInventory?.merchant?.() || '';
    return 'inv-sale-' + hash([merchant, ref, lineIndex, itemId, part || 0].join('|'));
  }

  function record(sale) {
    var I = window.KiwiInventory;
    if (!I || !I.isReal?.() || !sale || !Array.isArray(sale.lines)) return { written: 0, skipped: 0 };
    var d = doc(); var written = 0, skipped = 0;
    var ref = String(sale.ref || sale.id || ('sale-' + n(sale.ts || sale.time))).slice(0, 100);
    sale.lines.forEach(function (line, idx) {
      if (!line) return;
      var kind = String(line.kind || '').toLowerCase();
      if (['service', 'tip', 'tax', 'payment', 'class', 'pt', 'formula'].indexOf(kind) >= 0) { skipped++; return; }
      var itemId = String(line.itemId || line.id || '');
      var qty = Math.max(0, n(line.qty || line.quantity));
      if (!(qty > 0)) { skipped++; return; }
      var ingredients = itemId ? recipeLines(itemId, qty, d, 0, []) : null;
      if (!itemId) {
        /* Ligne sans identifiant : on n'accepte que le repêchage par nom, et
         * seulement s'il aboutit à une vraie recette. Consommer l'article
         * "Tajine poulet citron" lui-même ne voudrait rien dire. */
        var alias = recipeByName(line.name, d);
        ingredients = alias ? recipeLines(alias, qty, d, 0, []) : null;
        if (!ingredients) { skipped++; return; }
        itemId = alias;
      }
      var targets = ingredients || [{ itemId: itemId, qty: qty, direct: true }];
      targets.forEach(function (x, part) {
        var baseCost = x.direct
          ? (line.unitCost != null ? n(line.unitCost) : null)
          : (x.unitCost != null ? n(x.unitCost) : null);
        var realizedCost = allocateCost(x.itemId, x.qty, baseCost);
        var m = I.add({
          id: movementId(ref, idx, x.itemId, part), itemId: x.itemId,
          variantId: x.direct ? String(line.variantId || '') : '', qty: -x.qty,
          reason: 'sale', refType: 'sale', refId: ref,
          unitCost: realizedCost,
          occurredTs: n(sale.ts || sale.time) || Date.now(),
          note: x.direct ? String(line.name || 'Vente') : `Recette · ${line.name || itemId}`,
          meta: { sourceItemId: itemId, recipe: x.recipe || '', line: idx, part: part, lineQty: n(line.qty || line.quantity || 1) },
        });
        if (m) written++;
      });
    });
    return { written: written, skipped: skipped };
  }

  function reverse(ref, note) {
    var I = window.KiwiInventory; if (!I || !ref) return 0;
    var rows = (I.history() || []).filter(function (r) { return r.reason === 'sale' && r.refId === String(ref); });
    var nrows = 0;
    rows.forEach(function (r) {
      var id = 'inv-void-' + hash([I.merchant?.() || '', r.id].join('|'));
      if (I.reverse(r, 'sale-reversal', note || 'Vente annulée', { id: id })) nrows++;
    });
    return nrows;
  }

  function reverseSaleRows(saleRows, voidRecord, note) {
    var I = window.KiwiInventory;
    if (!I || !Array.isArray(saleRows) || !saleRows.length || !voidRecord) return 0;
    var orderId = String(voidRecord.orderId || voidRecord.order_id || voidRecord.ref || '').slice(0, 100);
    var voidId = String(voidRecord.voidId || voidRecord.void_id || voidRecord.id || '').slice(0, 80);
    var voidQty = Math.max(0, n(voidRecord.qty || voidRecord.quantity || 1));
    var merchant = I.merchant?.() || '';
    var history = (I.history && I.history()) || [];
    var written = 0;

    // Group matching sale rows by itemId so recipe ingredients reverse together
    var byItem = new Map();
    for (var i = 0; i < saleRows.length; i++) {
      var r = saleRows[i];
      if (!r || !r.itemId) continue;
      if (!byItem.has(r.itemId)) byItem.set(r.itemId, []);
      byItem.get(r.itemId).push(r);
    }

    byItem.forEach(function (rowsForItem, itemId) {
      var totalItemSold = rowsForItem.reduce(function (sum, r) { return sum + Math.abs(+r.qty || 0); }, 0);
      var origDishQty = 0;
      if (rowsForItem[0] && rowsForItem[0].meta && rowsForItem[0].meta.lineQty != null) {
        origDishQty = Math.max(0, +rowsForItem[0].meta.lineQty || 0);
      }
      var targetVoidQty = 0;
      if (origDishQty > 0) {
        targetVoidQty = Math.min(totalItemSold, Math.round((totalItemSold * (voidQty / origDishQty)) * 1000) / 1000);
      } else {
        targetVoidQty = Math.min(totalItemSold, voidQty);
      }

      var remainingToReverse = targetVoidQty;
      // Unwind rows for this item in reverse depletion order
      for (var j = rowsForItem.length - 1; j >= 0 && remainingToReverse > 0; j--) {
        var sRow = rowsForItem[j];
        var sQty = Math.abs(+sRow.qty || 0);
        if (!(sQty > 0)) continue;

        var alreadyReversed = history.reduce(function (sum, r) {
          return (r.reversalOf === sRow.id && r.reason === 'sale-reversal') ? sum + (+r.qty || 0) : sum;
        }, 0);
        var availableToReverse = Math.max(0, Math.round((sQty - alreadyReversed) * 1000) / 1000);
        if (!(availableToReverse > 0)) continue;

        var revQty = Math.min(availableToReverse, remainingToReverse);
        // Both local and remote paths hash identical tuple [merchant, voidId, sRow.itemId, part]
        // where part is the recipe-target index persisted in meta.part
        var part = (sRow.meta && sRow.meta.part != null) ? sRow.meta.part : (sRow.meta && sRow.meta.line != null ? sRow.meta.line : 0);
        var voidMvId = 'inv-void-' + hash([merchant, voidId, sRow.itemId, part].join('|'));

        var m = I.add({
          id: voidMvId,
          itemId: sRow.itemId,
          variantId: sRow.variantId || '',
          locationId: sRow.locationId || 'principal',
          qty: revQty,
          reason: 'sale-reversal',
          refType: 'kitchen-void',
          refId: orderId,
          unitCost: sRow.unitCost != null ? sRow.unitCost : null, // Frozen cost from original sale!
          occurredTs: Math.max(Date.now(), (sRow && sRow.occurredTs ? +sRow.occurredTs + 1 : Date.now())),
          note: note || (voidRecord.reason ? `Annulation cuisine · ${voidRecord.reason}` : 'Annulation cuisine'),
          reversalOf: sRow.id,
          meta: Object.assign({}, sRow.meta || {}, { voidId: voidId, voidReason: voidRecord.reason || '' }),
        });
        if (m) {
          written++;
          remainingToReverse = Math.round((remainingToReverse - revQty) * 1000) / 1000;
        }
      }
    });
    return written;
  }

  async function reverseVoid(voidRecord, note) {
    var I = window.KiwiInventory;
    if (!I || !I.isReal?.() || !voidRecord) return 0;
    // Waste voids (is_waste = 1): the loss stands, zero stock movements.
    if (voidRecord.isWaste || voidRecord.is_waste) return 0;

    var orderId = String(voidRecord.orderId || voidRecord.order_id || voidRecord.ref || '').slice(0, 100);
    var voidId = String(voidRecord.voidId || voidRecord.void_id || voidRecord.id || '').slice(0, 80);
    var itemId = String(voidRecord.itemId || voidRecord.item_id || voidRecord.lineId || '');
    var voidQty = Math.max(0, n(voidRecord.qty || voidRecord.quantity || 1));
    if (!voidId || !(voidQty > 0)) return 0;

    var merchant = I.merchant?.() || '';
    var history = (I.history && I.history()) || [];

    // 1. Check local ledger for original sale movements
    var saleRows = history.filter(function (r) {
      if (r.reason !== 'sale' || r.refId !== orderId) return false;
      if (!itemId) return true;
      return r.itemId === itemId || (r.meta && (r.meta.sourceItemId === itemId || r.meta.recipe === itemId));
    });

    if (saleRows.length > 0) {
      return reverseSaleRows(saleRows, voidRecord, note);
    }

    // 2. Remote device path: fetch original frozen sale movements from D1 before estimating
    var remoteRows = null;
    try {
      if (typeof fetch === 'function' && merchant && orderId) {
        var u = '/api/inventory/movements?merchant=' + encodeURIComponent(merchant) + '&refId=' + encodeURIComponent(orderId) + '&reason=sale';
        var res = await fetch(u, { credentials: 'same-origin', cache: 'no-store' });
        if (res.ok) {
          var body = await res.json();
          if (Array.isArray(body && body.movements) && body.movements.length) {
            remoteRows = body.movements.filter(function (r) {
              if (r.reason !== 'sale' || r.refId !== orderId) return false;
              if (!itemId) return true;
              return r.itemId === itemId || (r.meta && (r.meta.sourceItemId === itemId || r.meta.recipe === itemId));
            });
          }
        }
      }
    } catch (_) {}

    if (remoteRows && remoteRows.length > 0) {
      return reverseSaleRows(remoteRows, voidRecord, note);
    }

    // 3. Fallback to recipe estimation (offline or unrecorded original sale)
    var d = doc();
    var ingredients = itemId ? recipeLines(itemId, voidQty, d, 0, []) : null;
    if (!itemId && voidRecord.name) {
      var alias = recipeByName(voidRecord.name, d);
      ingredients = alias ? recipeLines(alias, voidQty, d, 0, []) : null;
      if (alias) itemId = alias;
    }
    var targets = ingredients || (itemId ? [{ itemId: itemId, qty: voidQty, direct: true }] : []);
    var written = 0;
    targets.forEach(function (x, part) {
      var voidMvId = 'inv-void-' + hash([merchant, voidId, x.itemId, part || 0].join('|'));
      var baseCost = null;
      if (x.direct) {
        if (voidRecord.unitCost != null) {
          baseCost = n(voidRecord.unitCost);
        } else {
          var known = (d.ingredients || []).find(function (ing) {
            return String(ing.id) === x.itemId || String(ing.stockId) === x.itemId || String(ing.id) === ('stock:' + x.itemId);
          });
          if (known && known.useCost != null) baseCost = n(known.useCost);
        }
      } else {
        baseCost = x.unitCost != null ? n(x.unitCost) : null;
      }
      var m = I.add({
        id: voidMvId,
        itemId: x.itemId,
        variantId: '',
        locationId: 'principal',
        qty: x.qty,
        reason: 'sale-reversal',
        refType: 'kitchen-void',
        refId: orderId,
        unitCost: voidRecord.unitCost != null ? n(voidRecord.unitCost) : baseCost,
        occurredTs: Date.now(),
        note: note || (voidRecord.reason ? `Annulation cuisine · ${voidRecord.reason}` : 'Annulation cuisine'),
        reversalOf: '', // Do not invent lineIndex link
        meta: { sourceItemId: itemId, recipe: x.recipe || '', voidId: voidId, part: part || 0, costSource: 'recipe-estimate' },
      });
      if (m) written++;
    });
    return written;
  }

  window.KiwiInventoryConsumption = { record: record, reverse: reverse, reverseVoid: reverseVoid, recipeLines: recipeLines, deriveLots: deriveLots, allocateCost: allocateCost };
})();
