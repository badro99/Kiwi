/* Kiwi · staff-perms-till · les droits de l'équipe AU COMPTOIR.
 *
 * La caisse lit /api/permissions (équipe réduite à { nom, droits effectifs },
 * jamais un code, jamais une surcharge), la garde par établissement pour le
 * hors-ligne, et s'en sert pour trois choses :
 *   1. Le pavé d'autorisation sait QUEL droit l'acte demande : le dernier
 *      KiwiAuthAct (cash_in, open_drawer, close_till…) le dit. Un code qui
 *      n'a pas ce droit est refusé sur le pavé, avec son nom et l'acte ; celui
 *      d'un responsable qui l'a passe, et devient l'auteur écrit de l'acte.
 *   2. Quand la personne qui tient la caisse a reçu le droit (tiroir, espèces,
 *      clôture), le pavé du responsable ne s'ouvre plus pour elle.
 *   3. Les éléments marqués data-perm="…" portent un cadenas quand la personne
 *      en poste n'a pas le droit ; un clic demande le code d'un responsable
 *      (sauf data-perm-flow : le parcours le demande déjà lui-même).
 * Ce n'est jamais la seule barrière : le serveur relit chaque droit
 * (functions/api/_permissions.js). Tant que le patron n'a pas enregistré ses
 * droits, rien ici ne change le comportement de la caisse.
 */
(function () {
  'use strict';
  var KEY = 'kiwiPerms:v1:';
  var REFRESH_MS = 10 * 60 * 1000;
  /* L'acte du pavé → le droit (assets/permissions-catalog.js › ACTION_PERM). */
  var ACT_PERM = { cash_in: 'money.cash', cash_out: 'money.cash', open_drawer: 'sales.drawer', close_till: 'money.close-day',
    refund: 'sales.refund', stock_adjust: 'stock.adjust', cancel_order: 'sales.void-sent', cancel_table: 'sales.void-sent' };
  var PERM_KIND = { 'money.cash': 'cash', 'sales.drawer': 'drawer', 'money.close-day': 'close-day', 'sales.refund': 'refund',
    'stock.adjust': 'inventory', 'sales.void-sent': 'void-sent', 'sales.discount': 'discount', 'sales.price': 'price', 'sales.cancel': 'cancel' };
  /* Ce que la personne en poste peut faire elle-même sans pavé : rien qui
     demande une preuve signée liée à la commande (remboursement, stock). */
  var SELF_SERVE = { 'money.cash': 1, 'sales.drawer': 1, 'money.close-day': 1, 'sales.void-sent': 1 };
  var LABEL = {
    'money.cash': ['sortir ou entrer des espèces', 'move cash in or out', 'إدخال وإخراج الكاش'],
    'sales.drawer': ['ouvrir le tiroir sans vente', 'open the drawer without a sale', 'فتح الدرج بلا بيع'],
    'money.close-day': ['clôturer la journée', 'close the day', 'سدّ النهار'],
    'sales.refund': ['rembourser un client', 'refund a customer', 'إرجاع الفلوس للزبون'],
    'stock.adjust': ['corriger le stock', 'adjust stock', 'تصحيح المخزون'],
    'sales.void-sent': ['retirer un article déjà envoyé', 'remove an item already sent', 'حذف طلب بعدما مشى للكوزينة'],
  };

  function lang() { try { return (window.KiwiCaisseLang && window.KiwiCaisseLang.lang && window.KiwiCaisseLang.lang()) || document.documentElement.lang || 'fr'; } catch (_) { return 'fr'; } }
  function say(perm) { var l = String(lang()).slice(0, 2), row = LABEL[perm]; return row ? row[l === 'en' ? 1 : l === 'ar' ? 2 : 0] : perm; }
  function nameKey(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) {}
    return s;
  }
  function merchant() {
    try {
      var P = window.KiwiCaissePairing, v = P && typeof P.pairedVenue === 'function' ? P.pairedVenue() : null;
      if (v && v.merchant) return String(v.merchant);
    } catch (_) {}
    try { var raw = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); return String((raw && raw.merchant) || ''); } catch (_) { return ''; }
  }
  function read() {
    var m = merchant();
    if (!m) return null;
    try { var d = JSON.parse(localStorage.getItem(KEY + m) || 'null'); return d && Array.isArray(d.staff) ? d : null; } catch (_) { return null; }
  }
  function sync() {
    var m = merchant();
    if (!m || typeof fetch !== 'function') return Promise.resolve(null);
    return fetch('/api/permissions?merchant=' + encodeURIComponent(m), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok || !Array.isArray(d.staff)) return null;
        var doc = { configured: !!d.configured, freeDiscountPct: Number(d.freeDiscountPct) || 0, ts: Date.now(),
          staff: d.staff.map(function (s) { return { k: nameKey(s.name), perms: Array.isArray(s.perms) ? s.perms : [] }; }) };
        try { localStorage.setItem(KEY + m, JSON.stringify(doc)); } catch (_) {}
        apply();
        return doc;
      })
      .catch(function () { return null; });   // hors ligne : la dernière copie reste
  }
  /* true | false | null (inconnu : la boutique n'a rien configuré, ou la
     personne n'est pas dans la copie) — null ne restreint jamais rien. */
  function can(perm, who) {
    who = who || window.KiwiStaff;
    var doc = read();
    if (!who || !doc || !doc.configured) return null;
    if (!who.offline && who.permission && who.permission.id === perm && who.permission.configured) return !!who.permission.granted;
    var k = nameKey(who.name), row = null;
    for (var i = 0; i < doc.staff.length; i++) if (doc.staff[i].k === k) { row = doc.staff[i]; break; }
    return row ? row.perms.indexOf(perm) !== -1 : null;
  }
  function refusal(who, perm) {
    var l = String(lang()).slice(0, 2), name = String((who && who.name) || '').trim();
    if (l === 'en') return (name || 'This code') + ' is not allowed to ' + say(perm) + '. A manager can approve with their code.';
    if (l === 'ar') return (name || 'هاد الكود') + ' ما عندوش الحق: ' + say(perm) + '. المسيّر يقدر يوافق بالكود ديالو.';
    return (name || 'Ce code') + ' n’a pas le droit de ' + say(perm) + '. Un responsable peut valider avec son code.';
  }

  /* Le dernier acte annoncé au pavé, lu à l'ouverture qui le suit. */
  var lastAct = null;
  function currentPerm() {
    var a = lastAct && Date.now() - lastAct.at < 1000 ? lastAct.act : null;
    lastAct = null;
    return a ? ACT_PERM[String(a.kind || '')] || '' : '';
  }
  function wrapPads() {
    if (window.__kiwiStaffPermsWrapped) return;
    var act = window.KiwiAuthAct, till = window.requireTillOperator, mgr = window.requireManager;
    if (typeof act !== 'function' || typeof till !== 'function' || typeof mgr !== 'function') return;
    window.__kiwiStaffPermsWrapped = true;
    window.KiwiAuthAct = function (a) { lastAct = a ? { act: a, at: Date.now() } : null; return act.apply(this, arguments); };
    /* requireTillOperator est une déclaration globale de caisse/settings.js : la
       remplacer ici change ce que chaque appel résout. */
    window.requireTillOperator = function (label, onApprove, opts) {
      var perm = currentPerm(), doc = read();
      if (!perm || !doc || !doc.configured) return till.apply(this, arguments);
      var o = Object.assign({}, opts || {}), before = o.validate;
      o.validate = function (who) {
        if (can(perm, who) === false) return refusal(who, perm);
        return typeof before === 'function' ? before(who) : null;
      };
      return till.call(this, label, onApprove, o);
    };
    window.requireManager = function (label, onApprove, authContext, opts) {
      var perm = currentPerm();
      if (perm && SELF_SERVE[perm] && can(perm) === true && typeof onApprove === 'function') {
        var s = window.KiwiStaff || {};
        return onApprove({ id: s.id, name: s.name, role: s.role, viaPermission: perm });
      }
      var ctx = authContext || (perm && PERM_KIND[perm] ? { kind: PERM_KIND[perm] } : authContext);
      return mgr.call(this, label, onApprove, ctx, opts);
    };
  }

  /* data-perm : cadenas et demande d'accord. */
  function apply() {
    try {
      document.querySelectorAll('[data-perm]').forEach(function (el) {
        if (can(el.getAttribute('data-perm')) === false) el.setAttribute('data-perm-locked', '');
        else el.removeAttribute('data-perm-locked');
      });
    } catch (_) {}
  }
  function onClick(e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-perm]') : null;
    if (!el || el.dataset.permPass || el.hasAttribute('data-perm-flow')) return;
    var perm = el.getAttribute('data-perm');
    if (can(perm) !== false || typeof window.requireManager !== 'function') return;
    e.preventDefault(); e.stopImmediatePropagation();
    var label = el.getAttribute('data-perm-label') || String(el.textContent || '').trim().slice(0, 60) || say(perm);
    window.requireManager(label, function () {
      el.dataset.permPass = '1';
      try { el.click(); } finally { delete el.dataset.permPass; }
    }, PERM_KIND[perm] ? { kind: PERM_KIND[perm] } : undefined);
  }
  function css() {
    if (document.getElementById('kiwi-perm-css')) return;
    var st = document.createElement('style');
    st.id = 'kiwi-perm-css';
    /* Material Symbols « lock » (assets/icons/material/lock.svg), en masque : la couleur suit le texte. */
    st.textContent = '[data-perm-locked]{position:relative;opacity:.62}' +
      '[data-perm-locked]::after{content:"";position:absolute;top:4px;inset-inline-end:4px;width:13px;height:13px;background:currentColor;' +
      '-webkit-mask:url(assets/icons/material/lock.svg) center/contain no-repeat;mask:url(assets/icons/material/lock.svg) center/contain no-repeat}';
    document.head.appendChild(st);
  }

  function boot() {
    css(); wrapPads(); apply(); sync();
    document.addEventListener('click', onClick, true);
    document.addEventListener('kiwi-staff', function () { wrapPads(); apply(); });
    window.addEventListener('online', sync);
    setInterval(sync, REFRESH_MS);
    /* caisse-app.js pose ses pavés après nous : on réessaie jusqu'à les trouver. */
    var tries = 0, t = setInterval(function () { wrapPads(); if (window.__kiwiStaffPermsWrapped || ++tries > 40) clearInterval(t); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KiwiStaffPerms = { can: can, sync: sync, apply: apply, read: read };
})();
