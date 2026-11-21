/* Kiwi · le TARIF à la caisse (boutique et épicerie).
 *
 * Un grossiste (jomla) passe au comptoir : la caissière l'attache au ticket et
 * ses prix de gros s'appliquent tout seuls, parce que le patron a mis sa fiche
 * au tarif « Gros » (tableau de bord › Tarifs). Pour un client sans tarif, la
 * caissière peut changer de tarif sur le ticket, mais il faut le code d'un
 * responsable : c'est une baisse de prix, comme une remise. Le serveur relit
 * l'accord sur la vente (functions/api/_price-list-sale.js).
 *
 * Hors ligne : la caisse garde une copie des tarifs, de leurs prix et des
 * tarifs par défaut des fiches (GET /api/price-lists/snapshot), comme elle
 * garde le catalogue. Un article sans prix dans le tarif garde son prix
 * principal. Rien ici n'invente un prix.
 *
 * window.KiwiTillPriceList :
 *   apply(P)          remplace item.price par le prix du tarif (item.mainPrice garde le principal)
 *   priceFor(id, mad) le prix d'un article dans le tarif courant, en MAD
 *   current()         { id, name, isMain, why, approvedBy }
 *   onCustomer(id)    une fiche attachée (ou 'passage', ou null)
 *   choose(id)        changer de tarif (code responsable si ce n'est pas celui de la fiche)
 *   saleFields()      { priceListId, priceListApproval } à joindre à la vente
 *   receiptLabel()    « Tarif · Gros » pour le reçu, '' au principal
 *   reset()           retour au principal (ticket suivant)
 *   subscribe(fn)     appelée à chaque changement de tarif ou de copie
 *   chipHtml()        le bouton du ticket ; open() la feuille de choix
 */
(function () {
  'use strict';
  if (window.KiwiTillPriceList) return;

  var MAIN = 'main';
  var REFRESH_MS = 5 * 60000;
  var listeners = [];
  var snap = { lists: [], prices: {}, clients: {}, at: 0 };
  var sel = { id: MAIN, why: 'main', approval: '', approvedBy: '', clientId: '' };
  var loadedFor = '';

  function lang() { try { return (window.KiwiCaisseLang && window.KiwiCaisseLang.get && window.KiwiCaisseLang.get()) || 'fr'; } catch (_) { return 'fr'; } }
  function L(fr, en, ar) { var l = lang(); return l === 'en' ? en : l === 'ar' ? ar : fr; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function paired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function merchant() {
    try { var m = window.KiwiLive && window.KiwiLive.merchant && window.KiwiLive.merchant(); if (m) return String(m); } catch (_) {}
    var p = paired();
    return p && p.merchant ? String(p.merchant) : '';
  }
  function isReal() {
    try { if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true; } catch (_) {}
    return !!paired();
  }
  function key(m) { return 'kiwiPriceLists:' + m; }
  function emit() { listeners.slice().forEach(function (fn) { try { fn(current()); } catch (_) {} }); }

  function readCache(m) {
    try { var c = JSON.parse(localStorage.getItem(key(m)) || 'null'); if (c && Array.isArray(c.lists)) return c; } catch (_) {}
    return null;
  }
  function adopt(c) {
    snap = { lists: Array.isArray(c.lists) ? c.lists : [], prices: c.prices || {}, clients: c.clients || {}, at: +c.at || 0 };
    if (sel.id !== MAIN && !byId(sel.id)) sel = { id: MAIN, why: 'main', approval: '', approvedBy: '', clientId: sel.clientId };
  }
  function refresh() {
    var m = merchant();
    if (!m || !isReal()) return Promise.resolve(false);
    if (loadedFor !== m) { loadedFor = m; var cached = readCache(m); if (cached) { adopt(cached); emit(); } }
    if (typeof fetch !== 'function') return Promise.resolve(false);
    return fetch('/api/price-lists/snapshot?merchant=' + encodeURIComponent(m), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok || merchant() !== m) return false;
        var before = JSON.stringify([snap.lists, snap.prices, snap.clients]);
        adopt(j);
        try { localStorage.setItem(key(m), JSON.stringify({ at: j.at, lists: j.lists, prices: j.prices, clients: j.clients })); } catch (_) { /* quota : la copie reste en mémoire */ }
        if (JSON.stringify([snap.lists, snap.prices, snap.clients]) !== before) emit();
        return true;
      })
      .catch(function () { return false; });   // hors ligne : la copie locale fait foi
  }

  function byId(id) { for (var i = 0; i < snap.lists.length; i++) if (snap.lists[i].id === id) return snap.lists[i]; return null; }
  function mainList() { return byId(MAIN) || { id: MAIN, name: L('Prix principal', 'Main price', 'الثمن الأساسي'), isMain: true }; }
  function others() { return snap.lists.filter(function (l) { return !l.isMain; }); }
  function current() {
    var l = byId(sel.id) || mainList();
    return { id: l.id, name: l.name, isMain: !!l.isMain || l.id === MAIN, why: sel.why, approvedBy: sel.approvedBy };
  }
  function centsFor(itemId) {
    if (sel.id === MAIN) return null;
    var map = snap.prices[sel.id];
    if (!map) return null;
    var v = map[itemId];
    return typeof v === 'number' && isFinite(v) && v >= 0 ? v : null;
  }
  function priceFor(itemId, mainMad) {
    var c = centsFor(itemId);
    return c == null ? mainMad : c / 100;
  }
  /* P est reconstruit à chaque compat() : on modifie la copie, jamais le catalogue. */
  function apply(P) {
    if (!P) return P;
    if (loadedFor !== merchant()) refresh();
    var seen = [];
    Object.keys(P).forEach(function (id) {
      var item = P[id];
      if (!item || seen.indexOf(item) >= 0) return;
      seen.push(item);
      if (item.mainPrice == null) item.mainPrice = item.price;
      var c = centsFor(item.id || id);
      item.price = c == null ? item.mainPrice : c / 100;
      item.priceList = c == null ? null : sel.id;
    });
    return P;
  }

  function set(next) {
    var changed = next.id !== sel.id;
    sel = next;
    if (changed) emit();
  }
  function onCustomer(clientId) {
    var id = clientId && clientId !== 'passage' ? String(clientId) : '';
    var def = id ? snap.clients[id] : '';
    if (def && byId(def)) { set({ id: def, why: 'client', approval: '', approvedBy: '', clientId: id }); return; }
    /* La fiche part (ou n'a pas de tarif) : un tarif venu d'elle s'en va avec elle. */
    if (sel.why === 'client') set({ id: MAIN, why: 'main', approval: '', approvedBy: '', clientId: id });
    else sel.clientId = id;
  }
  function choose(id, done) {
    var target = byId(id);
    if (!target) return;
    var finish = function (ok) { if (typeof done === 'function') done(ok); };
    if (target.isMain || id === MAIN) { set({ id: MAIN, why: 'main', approval: '', approvedBy: '', clientId: sel.clientId }); finish(true); return; }
    if (sel.clientId && snap.clients[sel.clientId] === id) { set({ id: id, why: 'client', approval: '', approvedBy: '', clientId: sel.clientId }); finish(true); return; }
    var ask = window.requireManager;
    if (typeof ask !== 'function') {
      /* Démo locale sans pavé : rien de réel n'est encaissé. Une vraie caisse sans pavé ne change pas de tarif. */
      if (!isReal()) { set({ id: id, why: 'manager', approval: '', approvedBy: '', clientId: sel.clientId }); finish(true); } else finish(false);
      return;
    }
    try { if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: 'price_list', key: 'act.price_list', args: { name: target.name } }); } catch (_) {}
    ask(L('Tarif', 'Price list', 'التسعيرة') + ' · ' + target.name, function () {
      var mgr = null;
      try { mgr = window.KiwiCaissePairing && window.KiwiCaissePairing.lastManager(); } catch (_) {}
      set({ id: id, why: 'manager', approval: (mgr && mgr.approval) || '', approvedBy: (mgr && mgr.name) || '', clientId: sel.clientId });
      finish(true);
    }, { kind: 'price-list', listId: id }, { onCancel: function () { finish(false); } });
  }
  function saleFields() {
    if (sel.id === MAIN) return {};
    var out = { priceListId: sel.id };
    if (sel.approval) out.priceListApproval = sel.approval;
    return out;
  }
  function receiptLabel() {
    var c = current();
    return c.isMain ? '' : L('Tarif', 'Price list', 'التسعيرة') + ' · ' + c.name;
  }
  function reset() { set({ id: MAIN, why: 'main', approval: '', approvedBy: '', clientId: '' }); }

  /* ── le bouton du ticket et la feuille de choix ── */
  function css() {
    if (document.getElementById('tpl-css')) return;
    var s = document.createElement('style');
    s.id = 'tpl-css';
    s.textContent = '.tpl-chip{display:inline-flex;align-items:center;gap:6px;margin:6px 0 0;padding:5px 10px;border-radius:999px;border:1px solid var(--line,rgba(10,15,13,.14));background:transparent;color:var(--ink,#0A0F0D);font:500 12.5px/1.2 "Inter Tight",system-ui,sans-serif;cursor:pointer}'
      + '.tpl-chip.is-on{border-color:var(--atlas,#0B6E4F);background:rgba(11,110,79,.08);color:var(--riad,#053B2C)}'
      + '.tpl-chip svg{width:15px;height:15px;fill:currentColor;flex:none}'
      + '.tpl-chip small{color:var(--ink-3,#5d6662);font-weight:400}'
      + '.tpl-veil{position:fixed;inset:0;z-index:9000;display:grid;place-items:center;background:rgba(10,15,13,.42);padding:16px}'
      + '.tpl-sheet{width:min(420px,100%);max-height:80vh;overflow:auto;border-radius:18px;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);padding:18px;box-shadow:0 24px 60px -24px rgba(5,59,44,.5);font-family:"Inter Tight",system-ui,sans-serif}'
      + '.tpl-sheet h3{margin:0 0 4px;font-size:17px;font-weight:600}.tpl-sheet p{margin:0 0 12px;font-size:13px;color:var(--ink-3,#5d6662);line-height:1.45}'
      + '.tpl-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;margin:0 0 8px;padding:12px 14px;border-radius:12px;border:1px solid var(--line,rgba(10,15,13,.12));background:transparent;color:inherit;font:500 14px/1.3 inherit;text-align:start;cursor:pointer}'
      + '.tpl-opt.is-on{border-color:var(--atlas,#0B6E4F);background:rgba(11,110,79,.08)}.tpl-opt small{font-weight:400;color:var(--ink-3,#5d6662)}'
      + '.tpl-close{margin-top:6px;width:100%;padding:11px;border-radius:12px;border:0;background:rgba(10,15,13,.06);color:inherit;font:500 14px inherit;cursor:pointer}';
    document.head.appendChild(s);
  }
  var ICON = 'M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Zm220 160Z';
  function chipHtml() {
    if (!others().length) return '';
    css();
    var c = current();
    var why = c.why === 'client' ? L('fiche client', 'customer record', 'بطاقة الزبون') : c.why === 'manager' ? (c.approvedBy || L('responsable', 'manager', 'المسؤول')) : '';
    return '<button type="button" class="tpl-chip' + (c.isMain ? '' : ' is-on') + '" data-tpl-open aria-haspopup="dialog">'
      + '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="' + ICON + '"/></svg>'
      + esc(L('Tarif', 'Price list', 'التسعيرة')) + ' · ' + esc(c.name) + (why ? ' <small>· ' + esc(why) + '</small>' : '') + '</button>';
  }
  function open() {
    if (!others().length) return;
    css();
    var c = current();
    var veil = document.createElement('div');
    veil.className = 'tpl-veil';
    veil.setAttribute('role', 'dialog');
    veil.setAttribute('aria-modal', 'true');
    var rows = [mainList()].concat(others()).map(function (l) {
      var on = l.id === c.id || (l.isMain && c.isMain);
      var note = l.isMain ? L('le prix affiché en rayon', 'the shelf price', 'ثمن الرف')
        : sel.clientId && snap.clients[sel.clientId] === l.id ? L('tarif de la fiche', 'this customer’s list', 'تسعيرة هذا الزبون')
          : L('code responsable', 'manager code', 'رمز المسؤول');
      return '<button type="button" class="tpl-opt' + (on ? ' is-on' : '') + '" data-tpl-pick="' + esc(l.id) + '"><span>' + esc(l.name) + '</span><small>' + esc(note) + '</small></button>';
    }).join('');
    veil.innerHTML = '<div class="tpl-sheet"><h3>' + esc(L('Tarif du ticket', 'Price list for this ticket', 'تسعيرة هذه التذكرة')) + '</h3><p>'
      + esc(L('Les articles sans prix dans ce tarif gardent leur prix principal.', 'Items with no price in this list keep their main price.', 'السلع التي ليس لها ثمن في هذه التسعيرة تبقى بثمنها الأساسي.'))
      + '</p>' + rows + '<button type="button" class="tpl-close" data-tpl-close>' + esc(L('Fermer', 'Close', 'إغلاق')) + '</button></div>';
    var close = function () { if (veil.parentNode) veil.parentNode.removeChild(veil); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    veil.addEventListener('click', function (e) {
      var pick = e.target.closest && e.target.closest('[data-tpl-pick]');
      if (pick) { close(); choose(pick.getAttribute('data-tpl-pick')); return; }
      if (e.target === veil || (e.target.closest && e.target.closest('[data-tpl-close]'))) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(veil);
    var first = veil.querySelector('.tpl-opt.is-on') || veil.querySelector('.tpl-opt');
    if (first) try { first.focus(); } catch (_) {}
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-tpl-open]');
    if (b) { e.preventDefault(); open(); }
  });

  window.KiwiTillPriceList = {
    apply: apply, priceFor: priceFor, current: current, onCustomer: onCustomer, choose: choose,
    saleFields: saleFields, receiptLabel: receiptLabel, reset: reset, refresh: refresh,
    subscribe: function (fn) { if (typeof fn === 'function' && listeners.indexOf(fn) < 0) listeners.push(fn); },
    lists: function () { return [mainList()].concat(others()); },
    chipHtml: chipHtml, open: open,
  };
  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, REFRESH_MS);
  window.addEventListener('online', function () { refresh(); });
})();
