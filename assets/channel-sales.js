/* Kiwi · sales-channel truth.
 *
 * The financial ledger predates its channel field. Older receipts still carry
 * enough operational evidence to classify them safely: a restaurant table is
 * dining-room revenue, a boutique caisse receipt is counter revenue, an
 * "À emporter" receipt is takeaway, and an OrderPro order keeps its origin.
 * Unknown rows stay unknown and remain in the denominator — known channels are
 * never re-normalised around missing money.
 */
(function (root) {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }

  var DIRECT = {
    salle: 'dining', dining: 'dining', surplace: 'dining',
    terrasse: 'terrace', terrace: 'terrace',
    comptoir: 'counter', counter: 'counter',
    emporter: 'takeaway', takeaway: 'takeaway',
    retrait: 'pickup', pickup: 'pickup', clickcollect: 'pickup',
    livraison: 'delivery', delivery: 'delivery', glovo: 'delivery', yassir: 'delivery',
    boutique: 'store', store: 'store', cabine: 'cabin', cabin: 'cabin',
    domicile: 'home', home: 'home', produit: 'products', products: 'products',
    club: 'club', distance: 'remote', remote: 'remote', direct: 'direct',
    online: 'online', evenement: 'catering', catering: 'catering',
    orderpro: 'orderpro', kiwi: 'orderpro'
  };

  function allowed(key, ids) { return key && ids.indexOf(key) >= 0 ? key : ''; }

  function key(sale, channelIds, tradeRegistry, tradeId) {
    sale = sale || {};
    var ids = Array.isArray(channelIds) ? channelIds : [];
    var candidates = [sale.channel, sale.salesChannel, sale.orderChannel];
    for (var i = 0; i < candidates.length; i += 1) {
      var direct = DIRECT[text(candidates[i])] || text(candidates[i]);
      if (allowed(direct, ids)) return direct;
    }

    var label = text(sale.label || sale.orderRef || sale.ref);
    var tender = text(sale.method || sale.raw || sale.methods);
    if (/aemporter|takeaway/.test(label) && allowed('takeaway', ids)) return 'takeaway';
    if (/livraison|delivery|glovo|yassir/.test(label + tender) && allowed('delivery', ids)) return 'delivery';
    if (/reservationretrait|clickcollect|pickup/.test(label) && allowed('pickup', ids)) return 'pickup';
    if (/orderpro/.test(label) && allowed('orderpro', ids)) return 'orderpro';
    if (text(sale.origin) === 'orderpro' && allowed('orderpro', ids)) return 'orderpro';

    var tableEvidence = !!(sale.table || sale.tableNo || sale.session)
      || /^visit-/.test(String(sale.id || ''));
    if (tableEvidence) {
      if (text(sale.zone) === 'terrasse' && allowed('terrace', ids)) return 'terrace';
      if (allowed('dining', ids)) return 'dining';
    }

    /* Older till rows were written without a channel. Once explicit fulfilment
     * evidence has been excluded, the remaining path is deterministic for the
     * two established tills: restaurant caisse = dining, boutique caisse =
     * counter. Keep both fallbacks tied to their trade family and registry so a
     * foreign/imported receipt can never be silently relabelled. */
    var base = '';
    try { base = tradeRegistry && tradeRegistry.base ? tradeRegistry.base(tradeId) : ''; } catch (_) {}
    if (base === 'restaurant' && text(sale.origin) === 'caisse' && allowed('dining', ids)) return 'dining';
    if (base === 'boutique' && text(sale.origin) === 'caisse' && allowed('counter', ids)) return 'counter';
    return '';
  }

  /* A refund comes off the channel of the sale it reverses, on the day it is
   * paid back, the way « MAD encaissé » and the day report count money kept.
   * Without it a day with a 20,40 card refund showed Salle on 425 while every
   * other figure on the screen said 404,10. A refund whose sale cannot be found
   * leaves the total and stays unclassified. No channel goes below zero. */
  /* En centimes entiers d'un bout à l'autre : la somme des parts égale le total
   * au centime, sans dérive de flottant. */
  function cents(value) {
    var n = Math.round((+value || 0) * 100);
    return Number.isFinite(n) ? n : 0;
  }

  /* Boutique : « Chèque » est un anneau de règlement posé à côté des canaux
   * (propriétaire, 29 octobre 2026). Seul l'argent d'un passage au comptoir y
   * va : la part en chèque d'un ticket (paymentParts) ou tout le ticket payé
   * par chèque. Une livraison reste une livraison, quel que soit son moyen. */
  function chequeCents(sale, amount) {
    if (text(sale.method) === 'cheque') return amount;
    var parts = Array.isArray(sale.paymentParts) ? sale.paymentParts : [];
    var sum = parts.reduce(function (n, p) {
      return n + (p && text(p.method) === 'cheque' ? Math.max(0, Number.isSafeInteger(+p.amountCents) ? +p.amountCents : cents(p.amount)) : 0);
    }, 0);
    return Math.min(amount, sum);
  }

  /* Une vente partie en livraison vaut son ticket le jour de la vente, même si
   * l'argent arrive plus tard (la part « livraison » de paymentParts, que le
   * serveur garde à 0 MAD encaissé). L'encaissement du livreur, écrit ensuite
   * par /api/receivables (« Livraison reçue · … », canal delivery), règle cette
   * même vente : il ne compte pas une seconde fois. Amira Boutique, 29 octobre
   * 2026 : une livraison du jour laissait l'anneau Livraison à 0 %. */
  function deliveryOwedCents(sale) {
    var parts = Array.isArray(sale.paymentParts) ? sale.paymentParts : [];
    return parts.reduce(function (n, p) {
      return n + (p && text(p.method) === 'delivery' ? Math.max(0, Number.isSafeInteger(+p.amountCents) ? +p.amountCents : cents(p.amount)) : 0);
    }, 0);
  }
  function deliveryCollection(sale) {
    return text(sale.channel) === 'delivery' && /^Livraison reçue · /.test(String(sale.label || ''));
  }

  function breakdown(rows, channelIds, from, to, tradeRegistry, tradeId, refunds) {
    var amounts = Object.create(null);
    var total = 0;
    var classified = 0;
    var list = Array.isArray(rows) ? rows : [];
    var cheque = Array.isArray(channelIds) && channelIds.indexOf('cheque') >= 0;
    var delivery = Array.isArray(channelIds) && channelIds.indexOf('delivery') >= 0;
    list.forEach(function (sale) {
      var ts = +(sale && sale.ts) || 0;
      if (ts < from || ts >= to) return;
      var amount = Math.max(0, cents(sale && sale.amount));
      var owed = delivery ? deliveryOwedCents(sale) : 0;
      if (owed > 0) { total += owed; amounts.delivery = (amounts.delivery || 0) + owed; classified += owed; }
      if (!(amount > 0) || (delivery && deliveryCollection(sale))) return;
      total += amount;
      var channel = key(sale, channelIds, tradeRegistry, tradeId);
      var byCheque = cheque && (channel === 'counter' || !channel) ? chequeCents(sale, amount) : 0;
      if (byCheque > 0) { amounts.cheque = (amounts.cheque || 0) + byCheque; classified += byCheque; amount -= byCheque; }
      if (!channel || !(amount > 0)) return;
      amounts[channel] = (amounts[channel] || 0) + amount;
      classified += amount;
    });
    var byId = null;
    (Array.isArray(refunds) ? refunds : []).forEach(function (refund) {
      var ts = +(refund && refund.ts) || 0;
      if (ts < from || ts >= to) return;
      var amount = Math.abs(cents(refund && refund.amount));
      if (!(amount > 0)) return;
      if (!byId) {
        byId = Object.create(null);
        list.forEach(function (sale) {
          var id = sale && (sale.saleId || sale.id);
          if (id && (+sale.amount || 0) > 0) byId[String(id)] = sale;
        });
      }
      var sale = byId[String(refund.saleId || '')];
      var channel = sale ? key(sale, channelIds, tradeRegistry, tradeId) : key(refund, channelIds, tradeRegistry, tradeId);
      if (cheque && text(refund.method) === 'cheque' && amounts.cheque > 0) channel = 'cheque';   // rendu par chèque : sort de l'anneau Chèque
      total -= amount;
      if (!channel || !(amounts[channel] > 0)) return;
      var take = Math.min(amount, amounts[channel]);
      amounts[channel] -= take;
      classified -= take;
    });
    // A ring cannot represent debt. If unmatched refunds exceed the net,
    // do not invent a channel allocation: show the remaining net as unknown.
    // The revenue headline continues to carry the complete signed amount.
    total = Math.max(0, total);
    classified = Math.max(0, classified);
    if (classified > total) { amounts = Object.create(null); classified = 0; }
    var out = Object.create(null);
    Object.keys(amounts).forEach(function (k) { out[k] = amounts[k] / 100; });
    return { amounts: out, total: total / 100, classified: classified / 100, unknown: Math.max(0, total - classified) / 100 };
  }

  root.KiwiChannelSales = { key: key, breakdown: breakdown };
})(window);
