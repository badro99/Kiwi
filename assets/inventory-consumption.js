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
        if (article) out.push({ itemId: article, qty: used, recipe: String(productId), trail: trail });
      }
    }
    return out;
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
      if (['service', 'tip', 'tax', 'payment', 'class', 'pt'].indexOf(kind) >= 0) { skipped++; return; }
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
        var m = I.add({
          id: movementId(ref, idx, x.itemId, part), itemId: x.itemId,
          variantId: x.direct ? String(line.variantId || '') : '', qty: -x.qty,
          reason: 'sale', refType: 'sale', refId: ref,
          unitCost: x.direct && line.unitCost != null ? n(line.unitCost) : null,
          occurredTs: n(sale.ts || sale.time) || Date.now(),
          note: x.direct ? String(line.name || 'Vente') : `Recette · ${line.name || itemId}`,
          meta: { sourceItemId: itemId, recipe: x.recipe || '', line: idx },
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

  window.KiwiInventoryConsumption = { record: record, reverse: reverse, recipeLines: recipeLines };
})();
