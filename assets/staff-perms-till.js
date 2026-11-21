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
 * Avant même qu'un code soit tapé, le pavé dit quel droit manque et qui peut
 * valider (« Sara n'a pas le droit de… Omar ou Hind peuvent valider »).
 * Les preuves signées par le serveur (actorProof du dernier accord, sellerProof
 * de la personne en poste) partent avec les mouvements de caisse : le serveur
 * juge l'auteur prouvé, jamais l'identifiant que la caisse déclare.
 * Ce n'est jamais la seule barrière : le serveur relit chaque droit
 * (functions/api/_permissions.js). Tant que le patron n'a pas ACTIVÉ ses
 * droits, rien ici ne change le comportement de la caisse.
 */
(function () {
  'use strict';
  var KEY = 'kiwiPerms:v1:';
  var REFRESH_MS = 10 * 60 * 1000;
  /* L'acte du pavé → le droit (assets/permissions-catalog.js › ACTION_PERM). */
  var ACT_PERM = { cash_in: 'money.cash', cash_out: 'money.cash', open_drawer: 'sales.drawer', close_till: 'money.close-day',
    refund: 'sales.refund', stock_adjust: 'stock.adjust', cancel_order: 'sales.void-sent', cancel_table: 'sales.void-sent',
    discount: 'sales.discount' };
  var PERM_KIND = { 'money.cash': 'cash', 'sales.drawer': 'drawer', 'money.close-day': 'close-day', 'sales.refund': 'refund',
    'stock.adjust': 'inventory', 'sales.void-sent': 'void-sent', 'sales.discount': 'discount', 'sales.price': 'price', 'sales.cancel': 'cancel' };
  /* Ce que la personne en poste peut faire elle-même sans pavé : rien qui
     demande une preuve signée (remboursement, stock) ni rien que le journal
     juge (espèces, tiroir, clôture, remise : seule la preuve du GESTE couvre,
     functions/api/_permissions.js › flagUnauthorized). Elle tape alors SON code. */
  var SELF_SERVE = { 'sales.void-sent': 1 };
  /* Hors ligne, le serveur ne peut signer aucune preuve : espèces et clôture ne
     bloquent jamais la caisse (CLAUDE.md §2, fail-soft). La personne en poste
     fait le geste ; au retour du réseau le fait part avec sa preuve de poste et
     le journal du patron l'inscrit (« sans code », ou « sans le droit » si elle
     ne l'a pas). Remise et tiroir sans vente gardent le pavé : ils attendent. */
  var OFFLINE_SELF = { 'money.cash': 1, 'money.close-day': 1 };
  function offline() { try { return window.navigator && window.navigator.onLine === false; } catch (_) { return false; } }
  /* Arabe : darija, comme le catalogue (assets/permissions-catalog.js › can). */
  var LABEL = {
    'money.cash': ['sortir ou entrer des espèces', 'move cash in or out', 'يدخّل ولا يخرّج الفلوس من الكاشة'],
    'sales.drawer': ['ouvrir le tiroir sans vente', 'open the drawer without a sale', 'يحلّ الكاشة بلا بيع'],
    'money.close-day': ['clôturer la journée', 'close the day', 'يسدّ النهار'],
    'sales.refund': ['rembourser un client', 'refund a customer', 'يرجّع الفلوس للكليان'],
    'stock.adjust': ['corriger le stock', 'adjust stock', 'يصحّح السلعة'],
    'sales.void-sent': ['retirer un article déjà envoyé', 'remove an item already sent', 'يحيّد طلب مشى للكوزينة'],
    'sales.discount': ['faire une remise au-delà du seuil', 'give a discount above the limit', 'يدير تخفيض فوق الحد'],
    'sales.cancel': ['annuler une vente encaissée', 'cancel a paid sale', 'يلغي بيعة تخلّصات'],
    'sales.price': ['changer un prix à la caisse', 'change a price at the till', 'يبدّل الثمن فالصندوق'],
  };
  /* Le dernier accord donné sur le pavé (ou par le droit de la personne en
     poste) : la preuve de CE geste, signée par le serveur ; elle ne couvre
     qu'un fait, jugé à sa réception (functions/api/_act-proof.js). */
  var lastApproval = null, APPROVAL_MS = 5 * 60 * 1000;

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
          staff: d.staff.map(function (s) { return { k: nameKey(s.name), n: String(s.name || '').slice(0, 60), perms: Array.isArray(s.perms) ? s.perms : [] }; }) };
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
  /* Qui, dans la copie de la boutique, a ce droit (trois noms au plus). */
  function holders(perm, except) {
    var doc = read(), out = [], skip = nameKey(except || '');
    if (!doc) return out;
    for (var i = 0; i < doc.staff.length && out.length < 3; i++) {
      var s = doc.staff[i];
      if (s.n && s.k !== skip && s.perms.indexOf(perm) !== -1) out.push(s.n);
    }
    return out;
  }
  function orList(names, l) {
    if (names.length < 2) return names.join('');
    var word = l === 'en' ? ' or ' : l === 'ar' ? ' ولا ' : ' ou ';
    return names.slice(0, -1).join(', ') + word + names[names.length - 1];
  }
  function canValidate(perm, except) {
    var l = String(lang()).slice(0, 2), list = holders(perm, except);
    if (!list.length) return l === 'en' ? 'A manager can approve with their code.' : l === 'ar' ? 'المسؤول يقدر يوافق بالكود ديالو.' : 'Un responsable peut valider avec son code.';
    var many = list.length > 1;
    if (l === 'en') return orList(list, l) + ' can approve.';
    if (l === 'ar') return orList(list, l) + (many ? ' يقدرو يوافقو.' : ' يقدر يوافق.');
    return orList(list, l) + (many ? ' peuvent valider.' : ' peut valider.');
  }
  function refusal(who, perm) {
    var l = String(lang()).slice(0, 2), name = String((who && who.name) || '').trim();
    if (l === 'en') return (name || 'This code') + ' is not allowed to ' + say(perm) + '. ' + canValidate(perm, name);
    if (l === 'ar') return (name || 'هاد الكود') + ' ما عندوش الحق باش ' + say(perm) + '. ' + canValidate(perm, name);
    return (name || 'Ce code') + ' n’a pas le droit de ' + say(perm) + '. ' + canValidate(perm, name);
  }
  /* Ce que le pavé affiche AVANT le code : le droit qui manque, et qui l'a. */
  function needHint(perm) {
    var s = window.KiwiStaff || {}, l = String(lang()).slice(0, 2), name = String(s.name || '').trim();
    if (name && can(perm) === false) return refusal(s, perm);
    if (name && can(perm) === true) {
      if (l === 'en') return 'Confirm with your code: this is recorded in your name.';
      if (l === 'ar') return 'أكّد بالكود ديالك: هاد الحركة كتتسجّل باسمك.';
      return 'Confirmez avec votre code : ce geste est inscrit à votre nom.';
    }
    if (l === 'en') return 'Needs the right to ' + say(perm) + '. ' + canValidate(perm, name);
    if (l === 'ar') return 'خاص الحق باش ' + say(perm) + '. ' + canValidate(perm, name);
    return 'Il faut le droit de ' + say(perm) + '. ' + canValidate(perm, name);
  }
  /* Les preuves à joindre à un mouvement : jamais un code, jamais un nom. */
  function proofs() {
    var out = {}, s = window.KiwiStaff;
    if (lastApproval && lastApproval.proof && Date.now() - lastApproval.at < APPROVAL_MS) out.actProof = lastApproval.proof;
    if (s && typeof s.sellerProof === 'string' && s.sellerProof) out.sellerProof = s.sellerProof;
    return out;
  }

  /* Appelé par caisse/settings.js › openAuthorization avec l'acte annoncé
     (KiwiAuthAct). null = rien à changer ; { done } = acte autorisé sans pavé ;
     sinon le contexte et les options à donner au pavé. */
  function forAct(act, access, onApprove, authContext, opts) {
    var perm = act ? ACT_PERM[String(act.kind || '')] || '' : '';
    var doc = read();
    if (!perm || !doc || !doc.configured) return null;
    if (OFFLINE_SELF[perm] && offline() && typeof onApprove === 'function') {
      var o0 = window.KiwiStaff || {};
      lastApproval = { proof: '', at: Date.now() };
      onApprove({ id: o0.id, name: o0.name, role: o0.role, viaPermission: perm, offline: true });
      return { done: true, offline: true };
    }
    if (access !== 'till' && SELF_SERVE[perm] && can(perm) === true && typeof onApprove === 'function') {
      var s = window.KiwiStaff || {};
      lastApproval = { proof: '', at: Date.now() };   // la personne en poste : sa sellerProof suffit
      onApprove({ id: s.id, name: s.name, role: s.role, viaPermission: perm });
      return { done: true };
    }
    var o = Object.assign({}, opts || {}), before = o.validate;
    o.validate = function (who) {
      if (can(perm, who) === false) return refusal(who, perm);
      return typeof before === 'function' ? before(who) : null;
    };
    if (!o.hint) o.hint = needHint(perm);
    var approved = typeof onApprove === 'function' ? function (who) {
      lastApproval = { proof: String((who && who.actProof) || ''), at: Date.now() };
      return onApprove.apply(this, arguments);
    } : onApprove;
    /* L'acte part avec le code, aux deux niveaux : le serveur signe la preuve de
       CE geste (acte, montant, sens ; functions/api/_act-proof.js). */
    var ctx = authContext;
    if (!ctx && PERM_KIND[perm]) {
      ctx = { kind: PERM_KIND[perm] };
      if (Number.isInteger(act.amountCents) && act.amountCents > 0) ctx.amountCents = act.amountCents;
      if (act.move === 'in' || act.move === 'out') ctx.move = act.move;
      if (Number.isFinite(act.pct) && act.pct > 0) ctx.pct = act.pct;
    }
    return { authContext: ctx, opts: o, onApprove: approved };
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
    var sheetStyle = document.createElement('style');
    sheetStyle.id = 'kiwi-perm-css';
    /* Material Symbols « lock » (assets/icons/material/lock.svg), en masque : la couleur suit le texte. */
    sheetStyle.textContent = '[data-perm-locked]{position:relative;opacity:.62}' +
      '[data-perm-locked]::after{content:"";position:absolute;top:4px;inset-inline-end:4px;width:13px;height:13px;background:currentColor;' +
      '-webkit-mask:url(assets/icons/material/lock.svg) center/contain no-repeat;mask:url(assets/icons/material/lock.svg) center/contain no-repeat}';
    document.head.appendChild(sheetStyle);
  }

  /* Le pavé (caisse/settings.js) nous joint par l'espace de l'appairage, qu'il
     lit déjà : la caisse ne gagne pas un global de plus à surveiller. */
  function attach() {
    try {
      var P = window.KiwiCaissePairing;
      if (P && !P.permsForAct) P.permsForAct = forAct;
      if (P && !P.permsProofs) P.permsProofs = proofs;
    } catch (_) {}
  }
  attach();
  /* Jamais bloquant : un document réduit (banc, page sans DOM complet) ne doit rien casser. */
  function boot() {
    try {
      attach(); css(); apply(); sync();
      document.addEventListener('click', onClick, true);
      document.addEventListener('kiwi-staff', apply);
      window.addEventListener('online', sync);
      var timer = setInterval(sync, REFRESH_MS);
      if (timer && typeof timer.unref === 'function') timer.unref();
    } catch (_) {}
  }
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    window.KiwiStaffPerms = { can: can, sync: sync, apply: apply, read: read, forAct: forAct, proofs: proofs, needHint: needHint };
  } catch (_) {}
})();
