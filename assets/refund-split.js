/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LE PARTAGE D'UN REMBOURSEMENT · window.KiwiRefundSplit
 * ---------------------------------------------------------------------------
 * Pur : ni navigateur, ni base, ni horloge. Deux lecteurs, une seule règle :
 *   - functions/api/sale/refund.js écrit le remboursement avec elle ;
 *   - la caisse Maison (assets/pos-maison/checkout.js) l'annonce avec elle,
 *     AVANT l'accord du responsable, pour que l'écran dise ce que le serveur
 *     va réellement faire.
 *
 * La règle (serveur depuis le 22 octobre) :
 *   1. l'argent d'abord, dans le moyen que la caisse a choisi, jusqu'à l'argent
 *      encaissé sur le ticket et pas encore rendu ;
 *   2. le reste revient sur les avoirs qui avaient payé le ticket, dans l'ordre
 *      de leur code, chacun jusqu'à ce qu'il avait payé moins ce qui lui est
 *      déjà revenu ;
 *   3. ce qui dépasse encore (leftCents > 0) est refusé par le serveur.
 *
 * Les montants sont en centimes. Une allocation d'argent est
 * { method, amountCents } ; une allocation d'avoir est
 * { method: 'credit', creditId, amountCents }. Ce sont exactement les objets
 * que le serveur range dans sale_audit.impact.allocations.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.KiwiRefundSplit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Les avoirs dans l'ordre du serveur : par code, puis par identifiant. Le code
     est unique par commerçant (idx_store_credit_code), la caisse le connaît. */
  function orderCredits(credits) {
    return (credits || []).slice().sort(function (a, b) {
      var ka = String((a && (a.code || a.id)) || ''), kb = String((b && (b.code || b.id)) || '');
      if (ka !== kb) return ka < kb ? -1 : 1;
      var ia = String((a && a.id) || ''), ib = String((b && b.id) || '');
      return ia < ib ? -1 : ia > ib ? 1 : 0;
    });
  }

  /* Ce que les remboursements précédents ont déjà pris : l'argent d'un côté,
     chaque avoir de l'autre. `lists` est une liste de listes d'allocations. */
  function spentOf(lists) {
    var spent = {};
    (lists || []).forEach(function (entries) {
      (entries || []).forEach(function (part) {
        var key = part.method === 'credit' ? 'credit:' + part.creditId : 'money';
        spent[key] = (spent[key] || 0) + Number(part.amountCents || 0);
      });
    });
    return spent;
  }

  /* Un remboursement de `amountCents` sur un ticket qui a encaissé
     `moneyCents` d'argent et consommé `credits` [{ id, code, cents }]. */
  function allocate(o) {
    var spent = (o && o.spent) || {};
    var left = Number(o && o.amountCents) || 0;
    var allocations = [];
    var moneyPart = Math.min(left, Math.max(0, (Number(o && o.moneyCents) || 0) - (spent.money || 0)));
    if (moneyPart > 0) allocations.push({ method: String((o && o.method) || 'cash'), amountCents: moneyPart });
    left -= moneyPart;
    var creditPart = 0;
    orderCredits(o && o.credits).forEach(function (r) {
      var cents = Math.min(left, Math.max(0, Number(r.cents) - (spent['credit:' + r.id] || 0)));
      if (cents > 0) { allocations.push({ method: 'credit', creditId: r.id, amountCents: cents }); creditPart += cents; }
      left -= cents;
    });
    return { allocations: allocations, moneyCents: moneyPart, creditCents: creditPart, leftCents: left };
  }

  /* L'aperçu de la caisse : elle ne relit pas le journal du serveur, elle sait
     combien ce ticket a déjà rendu (`previousCents`). L'argent part toujours en
     premier, donc ce cumul suffit à retrouver ce qui a déjà été pris de chaque
     côté. */
  function preview(o) {
    var base = { moneyCents: o && o.moneyCents, credits: o && o.credits, method: o && o.method };
    var before = Number(o && o.previousCents) || 0;
    var spent = before > 0 ? spentOf([allocate({ amountCents: before, moneyCents: base.moneyCents, credits: base.credits, method: base.method }).allocations]) : {};
    return allocate({ amountCents: o && o.amountCents, moneyCents: base.moneyCents, credits: base.credits, method: base.method, spent: spent });
  }

  /* Les avoirs d'un ticket tels que la caisse les garde dans sale.parts
     ({ m: 'avoir', code, amount } en dirhams), regroupés par code. Côté caisse,
     l'identifiant d'un avoir EST son code. */
  function creditsFromParts(parts) {
    var byCode = {};
    var order = [];
    (parts || []).forEach(function (part) {
      if (!part || part.m !== 'avoir' || !part.code) return;
      var cents = Math.round((Number(part.amount) || 0) * 100);
      if (!(cents > 0)) return;
      if (!(part.code in byCode)) { byCode[part.code] = 0; order.push(part.code); }
      byCode[part.code] += cents;
    });
    return order.map(function (code) { return { id: code, code: code, cents: byCode[code] }; });
  }

  return { orderCredits: orderCredits, spentOf: spentOf, allocate: allocate, preview: preview, creditsFromParts: creditsFromParts };
});
