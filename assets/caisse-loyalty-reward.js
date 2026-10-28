/* Owner: the loyalty reward on the restaurant till's note.
 *
 * The restaurant till counted points and said « récompense atteinte », then
 * kept counting: nothing on the till gave the reward, so a card never reset
 * unless someone opened the client's page and pressed « Offrir la
 * récompense » (associé, 2026-10-27: Amira Cafe had a client at 529 points
 * for a 300-point reward). The boutique applies the reward on the ticket; the
 * restaurant now does too, through the bill's own discount:
 *
 *   1. A client with a ready card is attached to the note: « Récompense prête »
 *      (#rp-reward, under « Client & fidélité ») puts the reward on the note
 *      as a discount with the reason « Fidélité client » (reason code
 *      loyal-customer), so the total, the receipt, the sale record, the Z and
 *      the dashboard all carry it like any discount. A percentage reward
 *      (« −10 % ») is a percentage; « 1 offert » takes one unit of the
 *      programme's product (or the cheapest dish) off.
 *   2. When cash is confirmed, the server is asked to reserve the reward
 *      (same POST /api/clients redemption as the clients book). Refused (used
 *      on another till): the discount comes off and the cashier confirms the
 *      full price. Offline or slow: the sale goes through and the redemption
 *      is queued under the same reference. Card and other methods were
 *      already charged at that point, so they never block.
 *   3. When the sale is recorded and the visit credited, the card is burnt
 *      (KiwiClients.redeem), so the points drop by the threshold.
 *
 * Backing out of a payment burns nothing: the reservation happens only at
 * the cash confirm, and the redemption only once the sale exists.
 *
 * Classic script after caisse-app.js: it reads the till's shared globals
 * (mode, tables, selectedId, cart, saleClient…) only at call time. */
(function () {
  'use strict';
  var REASON = 'Fidélité client';
  var held = null;   /* { clientId, ctx, target, ref, accepted, inSale, label } */

  function tr(s) { var L = window.KiwiCaisseLang; return L && L.tr ? L.tr(s) : s; }
  function say(msg, sub) { try { if (typeof toast === 'function') toast(tr(msg), sub); } catch (_) {} }
  function KC() { return window.KiwiClients || null; }
  function m2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function ctxKey() { try { return typeof saleContextKey === 'function' ? saleContextKey() : ''; } catch (_) { return ''; } }
  function attached() {
    try { return (saleClient && saleClient.ctx === ctxKey() && typeof clientsOn === 'function' && clientsOn()) ? saleClient : null; }
    catch (_) { return null; }
  }
  function target() {
    if (mode === 'vrap') return { kind: 'vrap' };
    if (selectedId && tables[selectedId]) return { kind: 'table', id: selectedId };
    return null;
  }
  function discountOf(t) {
    if (!t) return null;
    if (t.kind === 'vrap') return vrapDiscount || null;
    return (tables[t.id] && tables[t.id].discount) || null;
  }
  function linesOf(t) {
    if (!t) return [];
    if (t.kind === 'vrap') return cart.map(function (l) { return { name: l.name, qty: l.qty, unit: m2(l.price) }; });
    return generateOrder(t.id, tables[t.id]).map(function (l) {
      return { name: l.name, qty: l.qty, unit: l.qty ? m2(l.total / l.qty) : 0 };
    });
  }
  function grossOf(t) { return m2(linesOf(t).reduce(function (s, l) { return s + l.unit * l.qty; }, 0)); }
  function isReward(d) { return !!(d && ((d.reward && d.reward.clientId) || (held && d.reason === REASON))); }

  /* What the programme gives, and whether this client's card is full. */
  function spec(rec) {
    var kc = KC();
    if (!kc || !rec) return null;
    try { if (kc.loyaltyOn && !kc.loyaltyOn()) return null; } catch (_) { return null; }
    var cfg = (kc.config && kc.config()) || {};
    var ready = false;
    try { ready = kc.progress ? kc.progress(rec, cfg) >= 1 : false; } catch (_) {}
    if (cfg.model === 'amount') {
      var txt = String((cfg.amount && cfg.amount.reward) || '−10 %');
      var pct = txt.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (pct) return { ready: ready, kind: 'pct', value: Number(pct[1].replace(',', '.')), label: txt };
      var mad = txt.match(/(\d+(?:[.,]\d+)?)\s*(?:MAD|DH|dh|درهم)/);
      if (mad) return { ready: ready, kind: 'amount', value: Number(mad[1].replace(',', '.')), label: txt };
      /* Ni pourcentage ni montant : le commerçant a écrit un cadeau (« un thé
         offert »). On rendait 10 % — un chiffre qu'il n'a jamais écrit, sur
         toute l'addition. C'est « offert » qu'il a écrit : une unité de la note,
         la moins chère, comme une carte à tampons. */
      return { ready: ready, kind: 'free', label: txt, item: '' };
    }
    var product = cfg.model === 'product';
    var label = String((product ? (cfg.product && cfg.product.reward) : (cfg.visit && cfg.visit.reward)) || '1 offert');
    return { ready: ready, kind: 'free', label: label, item: product ? String((cfg.product && cfg.product.item) || '') : '' };
  }
  function fold(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }
  /* « 1 offert »: one unit of the programme's product when the note has it,
     else the cheapest dish on the note (a visit card names no product). */
  function freeUnit(rw, lines) {
    var pool = lines.filter(function (l) { return l.qty > 0 && l.unit > 0; });
    if (rw.item) {
      var want = fold(rw.item);
      pool = pool.filter(function (l) { var n = fold(l.name); return n && (n === want || n.indexOf(want) !== -1); });
      if (!pool.length) return { missing: rw.item };
    }
    if (!pool.length) return { amount: 0 };
    return { amount: Math.min.apply(null, pool.map(function (l) { return l.unit; })) };
  }

  function setDiscount(t, d) {
    if (!t) return;
    if (t.kind === 'vrap') {
      currentOrder().setDiscount(d);
      try { renderCart(); } catch (_) {}
    } else if (tables[t.id]) {
      if (d) tableSettlement().project(tables[t.id], { discount: d });
      else tableSettlement().project(tables[t.id], {}, ['discount']);
      try { if (selectedId === t.id && mode !== 'order') renderRightPanel(t.id); } catch (_) {}
      try { refreshTableNode(t.id); } catch (_) {}
    }
    try { if (typeof tillKitPaint === 'function') tillKitPaint(); } catch (_) {}
  }
  function sameTarget(a, b) { return !!(a && b && a.kind === b.kind && a.id === b.id); }
  /* Take the reward off the note it was put on, wherever the till is now. */
  function drop(quiet) {
    if (!held) return;
    var t = held.target;
    held = null;
    if (t && isRewardOn(t)) setDiscount(t, null);
    if (!quiet) say('Récompense retirée du ticket');
    paint();
  }
  function isRewardOn(t) { var d = discountOf(t); return !!(d && ((d.reward && d.reward.clientId) || d.reason === REASON)); }

  function apply() {
    var c = attached(), kc = KC();
    if (!c || !kc) { say('Attachez d’abord un client à la note'); return; }
    var rec = null;
    try { rec = kc.get(c.id); } catch (_) {}
    var rw = spec(rec);
    if (!rw || !rw.ready) { say('Pas encore de récompense pour ce client'); return; }
    var t = target();
    if (!t) return;
    var d = discountOf(t);
    if (d && !isReward(d)) { say('Une remise est déjà sur la note', tr('Retirez-la pour appliquer la récompense.')); return; }
    var gross = grossOf(t);
    var disc;
    if (rw.kind === 'pct') {
      disc = { kind: 'pct', value: rw.value, amount: m2(Math.min(gross, Math.round(gross * 100 * rw.value / 100) / 100)) };
    } else {
      var unit = rw.kind === 'amount' ? { amount: rw.value } : freeUnit(rw, linesOf(t));
      if (unit.missing) { say('Ajoutez l’article de la récompense à la note', unit.missing); return; }
      disc = { kind: 'amount', value: m2(Math.min(unit.amount, gross)), amount: m2(Math.min(unit.amount, gross)) };
    }
    if (!(disc.amount > 0)) { say('Ajoutez des articles avant d’appliquer la récompense'); return; }
    var actor = '';
    try { actor = String((currentCashier && currentCashier.id) || '').slice(0, 96); } catch (_) {}
    setDiscount(t, Object.assign(disc, { reason: REASON, actorId: actor, accounted: false, reward: { clientId: c.id, label: rw.label } }));
    held = { clientId: c.id, ctx: ctxKey(), target: t, ref: kc.redemptionRef ? kc.redemptionRef(c.id) : '', accepted: false, inSale: false, label: rw.label };
    say('Récompense appliquée', rw.label);
    paint();
  }
  function toggle() { if (held && isRewardOn(held.target)) drop(false); else apply(); }

  /* Keep the reward tied to its client and its note: a detached client, a
     different client, or a note that lost the reward lets it go. */
  function sync() {
    if (!held) return;
    var c = null;
    try { c = saleClient; } catch (_) {}
    if (!isRewardOn(held.target)) { held = null; return; }
    if (!c || c.id !== held.clientId || c.ctx !== held.ctx) drop(true);
  }

  /* The shipped button, under « Client & fidélité ». The 2027 payment row
     reads its label and presses it (assets/caisse/till-frame.js). */
  function paint() {
    var btn = document.getElementById('rp-reward');
    if (!btn) return;
    var on = !!(held && isRewardOn(held.target) && sameTarget(held.target, target()));
    var c = attached(), rw = null;
    if (!on && c) { try { rw = spec(KC().get(c.id)); } catch (_) {} }
    var show = on || !!(rw && rw.ready);
    btn.hidden = !show;
    btn.classList.toggle('is-on', on);
    var lab = document.getElementById('rp-reward-label');
    /* Tapping again takes it off: the button says which state it is in. */
    if (lab) lab.textContent = on ? tr('Récompense appliquée') + ' · ' + held.label
      : rw ? tr('Récompense prête') + ' · ' + rw.label : '';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /* Cash confirm: reserve on the server before the sale is written. */
  function gate(method) {
    if (!held || !sameTarget(held.target, target()) || !isRewardOn(held.target)) return Promise.resolve(true);
    held.inSale = true;
    var kc = KC();
    if (held.accepted || !kc || !kc.reserveRedemption || !held.ref || navigator.onLine === false) return Promise.resolve(true);
    var h = held, timer;
    return Promise.race([
      kc.reserveRedemption(h.clientId, kc.bookId(), { ref: h.ref, clientId: h.clientId }),
      new Promise(function (resolve) { timer = setTimeout(function () { resolve(null); }, 3000); }),
    ]).catch(function () { return null; }).then(function (result) {
      clearTimeout(timer);
      if (result && result.accepted) { h.accepted = true; return true; }
      if (!result || !result.refused || method !== 'cash') return true;
      h.inSale = false;
      drop(true);
      try { if (window.KiwiCaisseToast) window.KiwiCaisseToast(tr('Récompense indisponible. Confirmez le paiement au plein tarif.'), 6000, 'warn'); } catch (_) {}
      return false;
    });
  }
  /* The visit is credited (creditSaleToClient): burn the card. */
  function settle(clientId) {
    if (!held || held.clientId !== clientId || !held.inSale) return;
    var h = held, kc = KC();
    held = null;
    try { if (kc && kc.redeem) kc.redeem(clientId, null, h.accepted ? { ref: h.ref, accepted: true } : { ref: h.ref }); } catch (_) {}
    paint();
  }

  function bind() {
    var btn = document.getElementById('rp-reward');
    if (btn && !btn.__kiwiReward) {
      btn.__kiwiReward = true;
      btn.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
    }
    paint();
  }
  /* The note was renamed (a new takeaway became board order N). */
  function rekey(from, to) { if (held && held.ctx === from) held.ctx = to; }
  window.KiwiSaleReward = { gate: gate, settle: settle, sync: sync, paint: paint, toggle: toggle, rekey: rekey,
    active: function () { return !!(held && isRewardOn(held.target)); } };
  document.addEventListener('kiwi:tender-gate', function (e) { if (e.detail && e.detail.hold) e.detail.hold(gate(e.detail.method)); });
  /* Loaded on demand once the client book is hooked (sale-client.js). */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
