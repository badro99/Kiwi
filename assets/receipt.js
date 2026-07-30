/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LE REÇU — window.KiwiReceipt
 * ---------------------------------------------------------------------------
 * LE ticket de caisse d'un établissement. Un seul, réglé dans Réglages → Mon
 * compte → Reçu. La caisse ne fabrique plus le sien : elle demande celui-là.
 *
 * Ce qui existait avant : chaque surface composait son reçu à la main. La
 * boutique écrivait `shop: pv.name || 'Kiwi'` et rien d'autre ; la caisse
 * restaurant affichait un ICE de démonstration codé en dur (masqué chez un
 * vrai client, donc AUCUNE mention légale sur le ticket d'un commerce qui en a
 * pourtant l'obligation) et une « TVA 10 % » posée sur toutes les ventes, y
 * compris celles d'une boutique où elle est de 20 % ; cinq métiers avaient leur
 * propre receiptHTML(). Cinq mises en page pour un même commerce, et pas une
 * seule ne savait dire l'ICE du commerçant.
 *
 * ── DEUX FICHES, PAS UNE ───────────────────────────────────────────────────
 * L'identité légale (raison sociale, adresse, téléphone, ICE, IF, RC, patente,
 * CNSS) et l'APPARENCE du reçu (logo, messages, ce qu'on affiche) sont deux
 * documents distincts, exprès :
 *
 *   business  — la fiche de l'établissement. Éditée dans « Mes établissements »
 *               et NULLE PART AILLEURS. L'éditeur de reçu la lit et propose un
 *               raccourci pour la corriger ; il n'en garde pas de copie, sinon
 *               deux ICE cohabiteraient et l'un des deux serait faux.
 *   receipt   — l'apparence, le seul document que l'éditeur de reçu écrit.
 *
 * Les deux sont per-établissement et `cloud:true` : régler son reçu sur l'iPad
 * du comptoir et le retrouver depuis son téléphone n'est pas une option, c'est
 * la définition d'un réglage de compte.
 *
 * ── CE QUI NE SE DÉSACTIVE PAS ─────────────────────────────────────────────
 * LOCKED : l'identité de l'établissement, le numéro de ticket, la date/heure,
 * les articles, les totaux et le paiement. Un commerçant personnalise son reçu ;
 * il ne peut pas en retirer par mégarde ce qui en fait une preuve d'achat. Ces
 * blocs n'ont donc aucun interrupteur — ils ne sont pas « cochés par défaut »,
 * ils ne sont pas cochables.
 *
 * ── UN CHAMP VIDE NE S'IMPRIME PAS ─────────────────────────────────────────
 * Pas de « ICE : — » sur un ticket. Une mention légale absente disparaît de la
 * ligne ; c'est dans les RÉGLAGES qu'on dit au propriétaire ce qui manque, pas
 * sur le ticket du client. Un tiret imprimé à la place d'un ICE ressemble à un
 * ICE illisible, ce qui est pire que son absence.
 *
 * ── LE RECU SE FIGE AU MOMENT DE LA VENTE ──────────────────────────────────
 * snapshot() range le document rendu AVEC la vente. Le commerçant qui change de
 * raison sociale, de logo ou de pied de page en septembre ne réécrit pas les
 * tickets de juillet : une réimpression ressort le ticket tel qu'il a été remis
 * au client, avec son numéro d'origine. C'est la différence entre un reçu et un
 * aperçu.
 *
 * ── UNE MISE EN PAGE, TROIS SORTIES ────────────────────────────────────────
 * build() rend un DOCUMENT ; escpos(), html() et text() le parcourent dans le
 * même ordre. Le thermique, l'aperçu écran et l'impression par le pilote
 * système sortent donc le même ticket — c'est la raison d'être du document
 * intermédiaire, sans lui les trois divergent en trois semaines.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VER = 1;

  /* ═══════════════════ petites fonctions pures ═══════════════════ */

  /* La langue du ticket, quand le réglage dit « auto ».
   *
   * KiwiI18n est la langue du TABLEAU DE BORD — et il n'est pas chargé sur
   * kiwi-caisse.html. « Auto » retombait donc systématiquement sur le français
   * au comptoir : une caissière basculait son écran en arabe et continuait de
   * tendre des reçus français, sur la seule surface où le ticket est imprimé.
   * On lit donc AUSSI la langue du comptoir (assets/caisse-lang.js), qui est
   * la bonne réponse là où le papier sort. Le réglage explicite du commerçant
   * (print.lang) l'emporte toujours sur les deux — il n'entre même pas ici. */
  function lang() {
    var l = '';
    /* Le comptoir d'abord : KiwiCaisseLang n'existe QUE sur kiwi-caisse.html
       (dashboard.html ne le charge pas), donc sa présence dit à elle seule que
       le papier sort ici, et c'est la langue de la personne qui le tend. */
    try { l = (window.KiwiCaisseLang && window.KiwiCaisseLang.get && window.KiwiCaisseLang.get()) || ''; } catch (_) {}
    if (!l) {
      try { l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || ''; } catch (_) {}
    }
    return (l === 'en' || l === 'ar') ? l : 'fr';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (_) { return o; } }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 120); }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ═══════════════════ l'établissement concerné ═══════════════════
   * Rigoureusement la même cascade que assets/hours.js : le tableau de bord
   * raisonne en identifiants de venue, la caisse en slugs de magasin, et les
   * deux doivent atterrir sur LA MÊME fiche — sinon le comptoir imprime une
   * enseigne et le bureau en règle une autre. Toute correction ici doit être
   * reportée là-bas (et dans day-report.js), les trois sont solidaires. */
  function venueKey(explicit) {
    if (explicit) {
      try {
        var KV = window.KiwiVenue;
        if (KV && KV.VENUES && KV.VENUES[explicit]) return explicit;   /* déjà une venue */
        var CD = window.KiwiCloudDoc;
        if (KV && KV.VENUES && CD && CD.slugFor) {
          var ids = Object.keys(KV.VENUES);
          for (var i = 0; i < ids.length; i++) {
            if (CD.slugFor(ids[i]) === explicit) return ids[i];        /* c'était un slug */
          }
        }
      } catch (_) {}
      return explicit;
    }
    try { var v = window.KiwiStore && window.KiwiStore.currentVenue && window.KiwiStore.currentVenue(); if (v) return v; } catch (_) {}
    try { var s = window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug(); if (s) return s; } catch (_) {}
    try { var dr = window.KiwiDayReport && window.KiwiDayReport.storeSlug && window.KiwiDayReport.storeSlug(); if (dr) return dr; } catch (_) {}
    try { var pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); if (pv && pv.merchant) return pv.merchant; } catch (_) {}
    return null;
  }

  /* ═══════════════════ LA FICHE ÉTABLISSEMENT (business) ═══════════════════
   * Les mentions légales marocaines. Ce document est la SOURCE : l'éditeur de
   * reçu, le ticket, la facture et tout ce qui viendra ensuite le lisent, et
   * seule la fiche « Mes établissements » l'écrit. */

  /* `fiscal` et non `if` : `if` est un mot réservé, et une clé qu'on ne peut
   * pas écrire `o.if` finit toujours par être lue de travers quelque part. */
  var LEGAL_FIELDS = [
    { k: 'legalName', label: { fr: 'Raison sociale', en: 'Legal name', ar: 'الاسم القانوني' }, important: true },
    { k: 'address', label: { fr: 'Adresse', en: 'Address', ar: 'العنوان' }, important: true },
    { k: 'city', label: { fr: 'Ville', en: 'City', ar: 'المدينة' }, important: false },
    { k: 'phone', label: { fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' }, important: true },
    { k: 'ice', label: { fr: 'ICE', en: 'ICE', ar: 'ICE' }, important: true },
    { k: 'fiscal', label: { fr: 'Identifiant fiscal (IF)', en: 'Tax ID (IF)', ar: 'الرقم الضريبي' }, important: true },
    { k: 'rc', label: { fr: 'Registre de commerce (RC)', en: 'Trade register (RC)', ar: 'السجل التجاري' }, important: true },
    { k: 'patente', label: { fr: 'Patente', en: 'Patente', ar: 'الباتنتا' }, important: true },
    { k: 'cnss', label: { fr: 'CNSS', en: 'CNSS', ar: 'CNSS' }, important: false },
    { k: 'email', label: { fr: 'Email', en: 'Email', ar: 'البريد' }, important: false },
    { k: 'web', label: { fr: 'Site web', en: 'Website', ar: 'الموقع' }, important: false },
  ];

  function blankBusiness() {
    return { v: VER, name: '', tradeName: '', legal: {}, updatedAt: 0 };
  }
  function normalizeBusiness(d) {
    var o = blankBusiness();
    if (!d || typeof d !== 'object') return o;
    o.name = str(d.name, 90);
    o.tradeName = str(d.tradeName, 90);
    var src = (d.legal && typeof d.legal === 'object') ? d.legal : d;
    LEGAL_FIELDS.forEach(function (f) {
      var v = str(src[f.k], f.k === 'address' ? 160 : 90);
      if (v) o.legal[f.k] = v;
    });
    o.updatedAt = num(d.updatedAt);
    return o;
  }
  function businessEmpty(d) {
    d = normalizeBusiness(d);
    return !d.name && !d.tradeName && !Object.keys(d.legal).length;
  }

  /* ═══════════════════ LA FICHE REÇU (receipt) ═══════════════════ */

  function blankConfig() {
    return {
      v: VER,
      look: {
        logo: '',            /* data: URI, ≤ 24 ko — voir setLogo() */
        logoOn: true,
        header: '',          /* remplace l'enseigne en tête ; vide = le nom de l'établissement */
        tagline: '',
        contact: 'full',     /* full | compact | off — présentation adresse + téléphone */
      },
      show: {
        cashier: true,
        terminal: true,
        customer: true,
        loyalty: true,
        itemRef: false,      /* la référence article sous chaque ligne */
        itemBarcode: false,  /* le code-barres article, quand la ligne en porte un */
        legal: { ice: true, fiscal: true, rc: true, patente: true, cnss: false },
      },
      /* La TVA. `mode:'none'` par défaut et c'est délibéré : beaucoup de petits
       * commerces marocains ne facturent pas de TVA, et une ligne « TVA 10 % »
       * affichée d'office est un chiffre inventé sur une pièce comptable. Le
       * propriétaire l'active et choisit son taux ; tant qu'il ne l'a pas fait,
       * le ticket montre un total, pas une ventilation. */
      vat: { mode: 'none', rate: 20, included: true },
      msg: {
        welcome: '',
        thanks: '',
        policy: '',          /* retours & échanges */
        social: '',          /* @instagram, page, … une ligne libre */
        web: '',
        whatsapp: '',
        qr: 'none',          /* none | web | whatsapp | custom */
        qrText: '',
      },
      print: {
        paper: '80',
        decimals: 'auto',    /* auto | always | never */
        lang: 'auto',        /* auto | fr | en | ar */
        second: '',          /* '' | fr | en | ar — le ticket bilingue */
        density: 'normal',   /* compact | normal | airy */
      },
      updatedAt: 0,
    };
  }

  var PAPERS = ['80', '58', '57', '76', '110', '112'];

  function normalizeConfig(d) {
    var o = blankConfig();
    if (!d || typeof d !== 'object') return o;
    var L = d.look || {}, S = d.show || {}, M = d.msg || {}, P = d.print || {}, V = d.vat || {};
    if (typeof L.logo === 'string' && L.logo.indexOf('data:image/') === 0) o.look.logo = L.logo.slice(0, 200000);
    o.look.logoOn = L.logoOn !== false;
    o.look.header = str(L.header, 60);
    o.look.tagline = str(L.tagline, 80);
    o.look.contact = ['full', 'compact', 'off'].indexOf(L.contact) >= 0 ? L.contact : 'full';

    ['cashier', 'terminal', 'customer', 'loyalty', 'itemRef', 'itemBarcode'].forEach(function (k) {
      if (S[k] != null) o.show[k] = !!S[k];
    });
    var SL = S.legal || {};
    Object.keys(o.show.legal).forEach(function (k) { if (SL[k] != null) o.show.legal[k] = !!SL[k]; });

    o.vat.mode = (V.mode === 'rate') ? 'rate' : 'none';
    var r = num(V.rate);
    o.vat.rate = (r > 0 && r <= 100) ? Math.round(r * 100) / 100 : 20;
    o.vat.included = V.included !== false;

    o.msg.welcome = str(M.welcome, 120);
    o.msg.thanks = str(M.thanks, 120);
    o.msg.policy = str(M.policy, 240);
    o.msg.social = str(M.social, 120);
    o.msg.web = str(M.web, 120);
    o.msg.whatsapp = str(M.whatsapp, 40);
    o.msg.qr = ['none', 'web', 'whatsapp', 'custom'].indexOf(M.qr) >= 0 ? M.qr : 'none';
    o.msg.qrText = str(M.qrText, 160);

    o.print.paper = PAPERS.indexOf(String(P.paper)) >= 0 ? String(P.paper) : '80';
    o.print.decimals = ['auto', 'always', 'never'].indexOf(P.decimals) >= 0 ? P.decimals : 'auto';
    o.print.lang = ['auto', 'fr', 'en', 'ar'].indexOf(P.lang) >= 0 ? P.lang : 'auto';
    o.print.second = ['', 'fr', 'en', 'ar'].indexOf(P.second) >= 0 ? P.second : '';
    o.print.density = ['compact', 'normal', 'airy'].indexOf(P.density) >= 0 ? P.density : 'normal';
    /* Un ticket bilingue dans la même langue deux fois n'est pas bilingue. */
    if (o.print.second && o.print.second === o.print.lang) o.print.second = '';

    o.updatedAt = num(d.updatedAt);
    return o;
  }
  /* Une fiche « vide » = jamais réglée. Sert au miroir serveur : ne jamais
   * écraser la fiche d'un autre appareil avec un formulaire jamais ouvert. */
  function configEmpty(d) {
    if (!d || typeof d !== 'object') return true;
    return !num(d.updatedAt);
  }

  /* ═══════════════════ persistance ═══════════════════ */

  var bizStore = null, cfgStore = null;
  /* Pourquoi la dernière remontée n'est pas partie, quand elle n'est pas partie.
     Vide = rien à signaler. Lu par l'éditeur (receipt-ui.js) pour prévenir. */
  var refused = '';
  function BS() {
    if (bizStore) return bizStore;
    if (!window.KiwiStore || !window.KiwiStore.define) return null;
    bizStore = window.KiwiStore.define('business', {
      blank: blankBusiness, cloud: true,
      isEmpty: function (d) { return businessEmpty(d); },
      merge: mergeByDate(businessEmpty),
    });
    return bizStore;
  }
  function CS() {
    if (cfgStore) return cfgStore;
    if (!window.KiwiStore || !window.KiwiStore.define) return null;
    cfgStore = window.KiwiStore.define('receipt', {
      blank: blankConfig, cloud: true,
      isEmpty: function (d) { return configEmpty(d); },
      merge: mergeByDate(configEmpty),
      /* Le reçu est le seul document de Kiwi qui porte une IMAGE. C'est donc le
       * seul qui puisse se faire refuser pour sa taille — et le refuser en
       * silence serait le pire des cas : le commerçant voit son nouveau ticket
       * dans l'aperçu du tableau de bord et son comptoir imprime l'ancien. */
      onRefused: function (why) { refused = why || 'too-large'; fire(venueKey()); },
    });
    return cfgStore;
  }
  /* Deux appareils qui règlent le même reçu : le dernier enregistré gagne, en
   * bloc. Fusionner champ par champ produirait un ticket que personne n'a
   * validé — l'en-tête d'un appareil sur le pied de page de l'autre. */
  function mergeByDate(isEmpty) {
    return function (mine, theirs) {
      if (!theirs || isEmpty(theirs)) return mine;
      if (!mine || isEmpty(mine)) return theirs;
      return (num(mine.updatedAt) >= num(theirs.updatedAt)) ? mine : theirs;
    };
  }

  var subs = [];
  function subscribe(fn) { if (typeof fn === 'function') subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }
  function fire(vid) { subs.forEach(function (f) { try { f(vid); } catch (_) {} }); }
  (function wire() {
    if (!window.KiwiStore || !window.KiwiStore.subscribe) return;
    window.KiwiStore.subscribe('receipt', function (v) { fire(v); });
    window.KiwiStore.subscribe('business', function (v) { fire(v); });
  })();

  /* ── la fiche établissement ─────────────────────────────────────────────── */

  /* Reprise de l'ancien stockage. Les mentions légales vivaient dans
   * `kiwiSet:biz:<carte>:<champ>` — par NAVIGATEUR, et rangées sous
   * l'identifiant d'une carte d'écran, pas d'un établissement. Un commerçant
   * qui avait rempli son ICE le retrouve donc ici, une fois, au premier accès :
   * lui redemander ce qu'il a déjà saisi serait la meilleure façon de lui faire
   * croire que Kiwi perd ses données. */
  var LEGACY_MAP = { name: 'name', address: 'address', city: 'city', phone: 'phone', ice: 'ice', fiscal: 'fiscal', rc: 'rc', patente: 'patente', cnss: 'cnss' };
  var migrated = Object.create(null);
  function legacyBusiness(bizId) {
    var out = {};
    try {
      Object.keys(LEGACY_MAP).forEach(function (k) {
        var v = localStorage.getItem('kiwiSet:biz:' + bizId + ':' + LEGACY_MAP[k]);
        if (v && String(v).trim()) out[k] = String(v).trim();
      });
    } catch (_) {}
    return out;
  }
  function migrateBusiness(vid, bizId) {
    if (!vid || !bizId || migrated[vid + '|' + bizId]) return;
    migrated[vid + '|' + bizId] = 1;
    var s = BS(); if (!s) return;
    var cur = normalizeBusiness(s.get(vid));
    if (!businessEmpty(cur)) return;                 /* déjà réglé : on ne touche à rien */
    var old = legacyBusiness(bizId);
    var keys = Object.keys(old);
    if (!keys.length) return;
    var doc = blankBusiness();
    if (old.name) doc.name = old.name;
    keys.forEach(function (k) { if (k !== 'name') doc.legal[k] = old[k]; });
    doc.updatedAt = Date.now();
    s.set(doc, vid);
  }

  function getBusiness(venueId) {
    var vid = venueKey(venueId);
    var s = BS();
    var doc = normalizeBusiness(s && vid ? s.get(vid) : null);
    /* Le nom affiché n'est pas une mention légale : il vient de l'établissement
     * actif si la fiche ne le porte pas. Un ticket sans enseigne n'existe pas. */
    if (!doc.name) doc.name = venueName(vid);
    return doc;
  }
  function setBusiness(patch, venueId) {
    var vid = venueKey(venueId);
    var s = BS(); if (!s || !vid) return null;
    var doc = normalizeBusiness(s.get(vid));
    patch = patch || {};
    if (patch.name != null) doc.name = str(patch.name, 90);
    if (patch.tradeName != null) doc.tradeName = str(patch.tradeName, 90);
    var src = patch.legal || patch;
    LEGAL_FIELDS.forEach(function (f) {
      if (src[f.k] == null) return;
      var v = str(src[f.k], f.k === 'address' ? 160 : 90);
      if (v) doc.legal[f.k] = v; else delete doc.legal[f.k];
    });
    doc.updatedAt = Date.now();
    s.set(doc, vid);
    /* Enregistrer dans l'éditeur est une action explicite : ne pas attendre le
       debounce générique avant d'envoyer la fiche que la caisse doit imprimer. */
    try { var bc = s.cloud && s.cloud(); if (bc && bc.flush) bc.flush(); } catch (_) {}
    fire(vid);
    return doc;
  }
  function venueName(vid) {
    try {
      var KV = window.KiwiVenue;
      if (KV && KV.VENUES && KV.VENUES[vid]) return KV.VENUES[vid].name || '';
      if (KV && KV.getCurrentVenueData) { var d = KV.getCurrentVenueData(); if (d && d.name) return d.name; }
    } catch (_) {}
    try { var pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); if (pv && pv.name) return pv.name; } catch (_) {}
    try { if (window.KiwiMe && window.KiwiMe.business) return String(window.KiwiMe.business); } catch (_) {}
    return '';
  }

  /* Ce qui manque encore. Renvoyé aux RÉGLAGES, jamais au ticket. */
  function missing(venueId) {
    var b = getBusiness(venueId);
    return LEGAL_FIELDS.filter(function (f) { return f.important && !b.legal[f.k]; })
      .map(function (f) { return { key: f.k, label: f.label[lang()] || f.label.fr }; });
  }
  function isComplete(venueId) { return missing(venueId).length === 0; }

  /* ── la fiche reçu ──────────────────────────────────────────────────────── */

  function getConfig(venueId) {
    var vid = venueKey(venueId);
    var s = CS();
    return normalizeConfig(s && vid ? s.get(vid) : null);
  }
  function setConfig(cfg, venueId) {
    var vid = venueKey(venueId);
    var s = CS(); if (!s || !vid) return null;
    refused = '';                      /* on repart optimiste : le refus, s'il
                                          revient, viendra du serveur lui-même */
    var doc = normalizeConfig(cfg);
    doc.updatedAt = Date.now();
    s.set(doc, vid);
    /* Même garantie pour l'apparence du reçu. Le bouton Enregistrer doit rendre
       le nouveau ticket disponible au comptoir tout de suite. */
    try { var cc = s.cloud && s.cloud(); if (cc && cc.flush) cc.flush(); } catch (_) {}
    fire(vid);
    return doc;
  }
  function isConfigured(venueId) { return !configEmpty(CS() && venueKey(venueId) ? CS().get(venueKey(venueId)) : null); }

  /* ═══════════════════ LE NUMÉRO DE TICKET ═══════════════════
   * Ce que faisait la caisse restaurant : `'KW-' + random(28000..29999)`. Deux
   * tickets pouvaient porter le même numéro le même jour, et rien ne montait.
   * Un numéro de reçu est une référence comptable ; il se compte.
   *
   * Format : <AAMMJJ>-<NNNN>-<TT>. La date parce qu'un commerçant cherche un
   * ticket par jour ; la séquence parce qu'elle doit monter ; l'étiquette de
   * terminal (KiwiPosSale.deviceTag) parce que deux caisses du même magasin
   * comptent chacune de leur côté hors ligne et ne doivent pas se percuter.
   * Le compteur est LOCAL et remis à zéro chaque jour : une caisse doit pouvoir
   * numéroter un ticket sans réseau. */
  var SEQ_KEY = 'kiwi:receiptSeq:';
  function today6(d) {
    d = d || new Date();
    return String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }
  function deviceTag() {
    try { if (window.KiwiPosSale && window.KiwiPosSale.deviceTag) return window.KiwiPosSale.deviceTag(); } catch (_) {}
    return '';
  }
  function nextRef(venueId, at) {
    var vid = venueKey(venueId) || 'store';
    var day = today6(at instanceof Date ? at : new Date());
    var k = SEQ_KEY + vid + ':' + day;
    var n = 1;
    try { n = Math.max(1, (parseInt(localStorage.getItem(k), 10) || 0) + 1); localStorage.setItem(k, String(n)); } catch (_) {}
    try { pruneSeq(vid, day); } catch (_) {}
    var tag = deviceTag();
    return day + '-' + String(n).padStart(4, '0') + (tag ? '-' + tag : '');
  }
  /* Un compteur par jour et par magasin, ça fait une clé par jour. On garde les
   * quatre derniers jours : assez pour rouvrir la veille, pas assez pour
   * remplir le stockage d'un commerce ouvert depuis trois ans. */
  function pruneSeq(vid, keepDay) {
    var pre = SEQ_KEY + vid + ':';
    var kill = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(pre) === 0 && k.slice(pre.length) !== keepDay) kill.push(k);
    }
    if (kill.length > 4) kill.sort().slice(0, kill.length - 4).forEach(function (k) { try { localStorage.removeItem(k); } catch (_) {} });
  }

  /* ═══════════════════ LE DOCUMENT ═══════════════════
   * build(sale, opts) → le ticket, rendu, prêt à imprimer OU à figer.
   *
   *   sale = { ref, ts|time, lines:[{name,qty,unit,total,ref,barcode,note}],
   *            subtotal, discount, tip, total, pay:[{label,amount}] | method,
   *            cashier, terminal, customer:{name,loyalty,points},
   *            kind:'sale'|'refund', of, reason, change, received }
   */
  function build(sale, opts) {
    sale = sale || {}; opts = opts || {};
    var vid = venueKey(opts.venueId);
    var cfg = opts.config ? normalizeConfig(opts.config) : getConfig(vid);
    var biz = opts.business ? normalizeBusiness(opts.business) : getBusiness(vid);
    var L = cfg.print.lang === 'auto' ? lang() : cfg.print.lang;
    var T = dict(L);
    var at = sale.ts != null ? new Date(sale.ts) : (sale.time instanceof Date ? sale.time : new Date(sale.time || Date.now()));
    if (isNaN(at.getTime())) at = new Date();
    var refund = sale.kind === 'refund';

    /* ── les lignes ── */
    var lines = (Array.isArray(sale.lines) ? sale.lines : []).slice(0, 120).map(function (l) {
      var qty = num(l && l.qty) || 1;
      var total = Math.abs(num(l && (l.total != null ? l.total : (l.amount != null ? l.amount : (num(l.unit) * qty)))));
      var o = { name: str(l && l.name, 60) || T.article, qty: qty, total: total };
      var unit = num(l && (l.unit != null ? l.unit : l.price));
      if (unit && qty > 1) o.unit = Math.abs(unit);
      if (cfg.show.itemRef && l && l.ref) o.ref = str(l.ref, 32);
      if (cfg.show.itemBarcode && l && l.barcode) o.barcode = str(l.barcode, 20);
      if (l && l.note) o.note = str(l.note, 60);
      return o;
    });

    /* ── les totaux ──
     * On part du TOTAL réellement encaissé et on remonte : c'est lui qui a été
     * payé, le reste est de la présentation. L'inverse (recomposer le total à
     * partir des lignes) ferait diverger le ticket et le tiroir dès qu'une
     * remise n'est pas répercutée ligne à ligne. */
    var linesSum = lines.reduce(function (s, l) { return s + l.total; }, 0);
    var discount = Math.abs(num(sale.discount != null ? (sale.discount.amount != null ? sale.discount.amount : sale.discount) : 0));
    var total = sale.total != null ? Math.abs(num(sale.total)) : Math.max(0, linesSum - discount);
    var subtotal = sale.subtotal != null ? Math.abs(num(sale.subtotal)) : (linesSum || total + discount);
    var tip = Math.abs(num(sale.tip));

    /* ── LA PROMOTION EST NOMMÉE, PAS FONDUE DANS « REMISE » ──
     * Une promotion et une remise n'ont pas la même origine : l'une est une
     * décision du magasin qui vaut pour tout le monde, l'autre un geste fait à
     * cette cliente-ci. Les additionner sous un seul mot rend le reçu
     * invérifiable — la cliente a vu « −30 % » en vitrine, elle veut retrouver
     * ces −30 % sur son ticket, et non un total de remise qui ne correspond à
     * aucune affiche. C'est aussi ce qui permet, trois jours plus tard, de
     * savoir à quel titre l'article avait baissé. */
    var promo = Math.abs(num(sale.promo != null ? (sale.promo.amount != null ? sale.promo.amount : sale.promo) : 0));
    var promoLabel = str((sale.promo && sale.promo.label) || '', 40);

    var totals = { subtotal: subtotal, discount: discount, promo: promo, promoLabel: promoLabel, tip: tip, total: total, vat: null };
    if (cfg.vat.mode === 'rate' && total > 0) {
      var r = cfg.vat.rate / 100;
      var ht = cfg.vat.included ? total / (1 + r) : total;
      var tva = cfg.vat.included ? total - ht : total * r;
      totals.vat = { rate: cfg.vat.rate, ht: round2(ht), tva: round2(tva), included: cfg.vat.included };
    }

    /* ── le paiement ── */
    var pay = [];
    if (Array.isArray(sale.pay) && sale.pay.length) {
      pay = sale.pay.slice(0, 6).map(function (p) {
        return { label: methodLabel(p && (p.label || p.method || p.m), T), amount: Math.abs(num(p && p.amount)) };
      });
    } else if (sale.method) {
      pay = [{ label: methodLabel(sale.method, T), amount: total + tip }];
    }

    var doc = {
      v: VER,
      lang: L, second: cfg.print.second || '',
      paper: opts.paper || cfg.print.paper,
      density: cfg.print.density,
      decimals: decimalsFor(cfg.print.decimals, [total, subtotal, discount, tip].concat(lines.map(function (l) { return l.total; }))),
      kind: refund ? 'refund' : 'sale',
      shop: shopBlock(biz, cfg),
      welcome: cfg.msg.welcome,
      meta: metaBlock(sale, cfg, at, T, opts),
      lines: lines,
      totals: totals,
      pay: pay,
      cash: (sale.received != null || sale.change != null)
        ? { received: Math.abs(num(sale.received)), change: Math.abs(num(sale.change)) } : null,
      customer: customerBlock(sale, cfg),
      refund: refund ? { of: str(sale.of, 40), reason: str(sale.reason, 80) } : null,
      foot: {
        thanks: cfg.msg.thanks,
        policy: cfg.msg.policy,
        social: cfg.msg.social,
        web: cfg.msg.web,
        whatsapp: cfg.msg.whatsapp,
      },
      qr: qrFor(cfg),
      /* Le mot qui marque une réimpression. `copy: true` demande celui de la
       * langue du ticket — un caissier arabophone imprimait « DUPLICATA » parce
       * que l'appelant écrivait le mot français en dur, sur un reçu par ailleurs
       * entièrement en arabe. Une chaîne reste acceptée telle quelle : un métier
       * qui veut son propre mot (« COPIE ATELIER ») le passe encore. */
      copy: opts.copy === true ? T.copy : str(opts.copy, 40),
      T: T,
    };
    return doc;
  }

  /* ═══════════════════ LA LISTE DES VENTES, EN TICKET ═══════════════════
   * Un récapitulatif — les ventes d'une journée, une ligne chacune — sorti sur
   * le MÊME papier que les reçus : le logo du commerçant, son en-tête, ses
   * mentions légales, sa largeur de rouleau, sa langue, ses décimales. C'est
   * tout l'intérêt de passer par ici plutôt que d'écrire une mise en page à
   * part : le commerçant a choisi son ticket une fois, dans le tableau de bord,
   * et ce document-là en hérite sans qu'on ait à le lui redemander.
   *
   * CE N'EST PAS UN REÇU, et ça doit se voir. Un récapitulatif porte son titre
   * en bandeau, n'affiche ni mode de paiement encaissé, ni rendu, ni cliente,
   * et ne s'appelle jamais « duplicata ». Un papier de 17 670 MAD qu'on peut
   * confondre avec un ticket de vente est un papier dangereux.
   *
   * On ne recalcule rien : chaque ligne est une vente déjà encaissée, et le
   * total est leur somme. Le détail par mode de paiement, quand les ventes le
   * portent, parce que c'est ce qu'on compare au tiroir en fin de journée. */
  function buildSummary(sales, opts) {
    opts = opts || {};
    var vid = venueKey(opts.venueId);
    var cfg = opts.config ? normalizeConfig(opts.config) : getConfig(vid);
    var biz = opts.business ? normalizeBusiness(opts.business) : getBusiness(vid);
    var L = cfg.print.lang === 'auto' ? lang() : cfg.print.lang;
    var T = dict(L);
    var list = (Array.isArray(sales) ? sales : []).slice(0, 300);

    var rows = list.map(function (s) {
      var at = new Date(s && s.ts != null ? s.ts : Date.now());
      if (isNaN(at.getTime())) at = new Date();
      return {
        time: pad2(at.getHours()) + ':' + pad2(at.getMinutes()),
        ts: at.getTime(),
        ref: str(s && s.ref, 40),
        label: str(s && s.label, 60) || T.article,
        amount: Math.abs(num(s && s.total)),
        method: methodLabel((s && (s.raw || s.method)) || '', T),
      };
    });
    var total = rows.reduce(function (a, r) { return a + r.amount; }, 0);

    /* Par mode de paiement. Une vente sans mode reconnu ne va nulle part
       plutôt que dans un panier « Autre » qui affirmerait ce qu'on ignore. */
    var order = [], by = {};
    rows.forEach(function (r) {
      if (!r.method) return;
      if (!by[r.method]) { by[r.method] = { label: r.method, amount: 0, n: 0 }; order.push(r.method); }
      by[r.method].amount += r.amount;
      by[r.method].n++;
    });

    var from = opts.from != null ? new Date(opts.from) : (rows.length ? new Date(rows[rows.length - 1].ts) : new Date());
    var to = opts.to != null ? new Date(opts.to) : (rows.length ? new Date(rows[0].ts) : new Date());

    return {
      v: VER,
      lang: L, second: cfg.print.second || '',
      paper: opts.paper || cfg.print.paper,
      density: cfg.print.density,
      decimals: decimalsFor(cfg.print.decimals, [total].concat(rows.map(function (r) { return r.amount; }))),
      kind: 'summary',
      shop: shopBlock(biz, cfg),
      welcome: '',
      meta: {
        ref: '',
        date: pad2(to.getDate()) + '/' + pad2(to.getMonth() + 1) + '/' + to.getFullYear(),
        time: pad2(from.getHours()) + ':' + pad2(from.getMinutes()) + ' — ' + pad2(to.getHours()) + ':' + pad2(to.getMinutes()),
        ts: to.getTime(),
        label: '',
      },
      summary: {
        title: str(opts.title, 40) || T.report,
        rows: rows,
        byMethod: order.map(function (k) { return by[k]; }),
        count: rows.length,
      },
      lines: [],
      totals: { subtotal: total, discount: 0, promo: 0, promoLabel: '', tip: 0, total: total, vat: null },
      pay: [],
      cash: null,
      customer: null,
      refund: null,
      foot: {
        thanks: '', policy: '', social: '', web: cfg.msg.web, whatsapp: '',
      },
      qr: '',
      copy: '',
      T: T,
    };
  }

  function round2(n) { return Math.round(num(n) * 100) / 100; }
  function decimalsFor(mode, amounts) {
    if (mode === 'always') return true;
    if (mode === 'never') return false;
    return amounts.some(function (a) { return Math.abs(num(a) % 1) > 0.004; });
  }

  /* L'en-tête. `header` du réglage l'emporte sur le nom de l'établissement ;
   * la raison sociale ne s'affiche que si elle DIFFÈRE du nom commercial —
   * l'imprimer deux fois de suite fait douter du ticket. */
  function shopBlock(biz, cfg) {
    var name = cfg.look.header || biz.tradeName || biz.name || '';
    var legalName = biz.legal.legalName || '';
    var o = {
      name: name,
      legalName: (legalName && legalName.toLowerCase() !== String(name).toLowerCase()) ? legalName : '',
      tagline: cfg.look.tagline,
      logo: cfg.look.logoOn ? cfg.look.logo : '',
      contact: [],
      legal: [],
    };
    if (cfg.look.contact !== 'off') {
      var addr = [biz.legal.address, biz.legal.city].filter(Boolean).join(', ');
      if (addr) o.contact.push(addr);
      if (biz.legal.phone) o.contact.push(biz.legal.phone);
      if (cfg.look.contact === 'full' && biz.legal.email) o.contact.push(biz.legal.email);
      /* `compact` : tout sur une ligne, pour les rouleaux 58 mm. */
      if (cfg.look.contact === 'compact') o.contact = [o.contact.join(' · ')].filter(Boolean);
    }
    /* Les mentions légales. UNE ligne par mention présente, et rien du tout
     * pour une mention absente — jamais « ICE : — ». */
    [['ice', 'ICE'], ['fiscal', 'IF'], ['rc', 'RC'], ['patente', 'Patente'], ['cnss', 'CNSS']].forEach(function (p) {
      if (!cfg.show.legal[p[0]]) return;
      var v = biz.legal[p[0]];
      if (v) o.legal.push(p[1] + ' ' + v);
    });
    return o;
  }

  function metaBlock(sale, cfg, at, T, opts) {
    var m = {
      ref: str(sale.ref, 40),
      date: pad2(at.getDate()) + '/' + pad2(at.getMonth() + 1) + '/' + at.getFullYear(),
      time: pad2(at.getHours()) + ':' + pad2(at.getMinutes()),
      ts: at.getTime(),
      label: str(sale.label, 60),
    };
    if (cfg.show.cashier && sale.cashier) m.cashier = str(sale.cashier, 40);
    if (cfg.show.terminal) {
      var t = str(sale.terminal, 24) || opts.terminal || deviceTag();
      if (t) m.terminal = t;
    }
    return m;
  }

  function customerBlock(sale, cfg) {
    if (!cfg.show.customer) return null;
    var c = sale.customer;
    if (!c || (!c.name && !c.phone)) return null;
    var o = { name: str(c.name, 60), phone: str(c.phone, 30) };
    if (cfg.show.loyalty && (c.points != null || c.loyalty)) {
      o.loyalty = c.loyalty ? str(c.loyalty, 60) : null;
      if (c.points != null) o.points = Math.round(num(c.points));
    }
    return o;
  }

  function qrFor(cfg) {
    if (cfg.msg.qr === 'none') return '';
    if (cfg.msg.qr === 'web') return cfg.msg.web || '';
    if (cfg.msg.qr === 'whatsapp') return cfg.msg.whatsapp ? ('https://wa.me/' + cfg.msg.whatsapp.replace(/[^0-9]/g, '')) : '';
    return cfg.msg.qrText || '';
  }

  var METHODS = {
    fr: { cash: 'Espèces', card: 'Carte bancaire', tap: 'Sans contact', qr: 'QR', wallet: 'Virement', avoir: 'Avoir', mixed: 'Mixte' },
    en: { cash: 'Cash', card: 'Card', tap: 'Contactless', qr: 'QR', wallet: 'Transfer', avoir: 'Credit note', mixed: 'Split' },
    ar: { cash: 'نقداً', card: 'بطاقة', tap: 'بدون تلامس', qr: 'QR', wallet: 'تحويل', avoir: 'رصيد', mixed: 'مختلط' },
  };
  function methodLabel(m, T) {
    /* Les accents TOMBENT avant la comparaison. Sans le NFD, « espèces » se
     * réduisait à « espces » — introuvable dans la table — et le ticket
     * imprimait le mot brut du métier au lieu du libellé du reçu. Même piège
     * que slugMerchant : en français, retirer `[^a-z]` d'une chaîne accentuée
     * ne l'aplatit pas, ça la mutile. */
    var k = String(m == null ? '' : m).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z]/g, '');
    var map = { especes: 'cash', espece: 'cash', cash: 'cash', liquide: 'cash', carte: 'card', card: 'card', cb: 'card', tpe: 'card', tap: 'tap', qr: 'qr', virement: 'wallet', wallet: 'wallet', transfer: 'wallet', avoir: 'avoir', mixte: 'mixed', mixed: 'mixed' };
    var hit = map[k];
    return hit ? (METHODS[T.__lang] || METHODS.fr)[hit] : str(m, 40);
  }

  /* ═══════════════════ les mots ═══════════════════ */
  var DICT = {
    fr: { __lang: 'fr', article: 'Article', receipt: 'REÇU', refund: 'REMBOURSEMENT', no: 'N°', date: 'Date', time: 'Heure', cashier: 'Caissier', terminal: 'Terminal', client: 'Client', points: 'Points', subtotal: 'Sous-total', discount: 'Remise', promo: 'Promotion', saved: 'Vous avez économisé', ht: 'Total HT', vat: 'TVA', total: 'TOTAL', totalRefund: 'TOTAL REMBOURSÉ', tip: 'Pourboire', paid: 'Payé', received: 'Reçu', change: 'Rendu', origin: 'Ticket d’origine', reason: 'Motif', thanks: 'Merci de votre visite', copy: 'DUPLICATA', report: 'RAPPORT DE VENTES', period: 'Période', count: 'Ventes', avg: 'Panier moyen', ref: 'Réf.' },
    en: { __lang: 'en', article: 'Item', receipt: 'RECEIPT', refund: 'REFUND', no: 'No.', date: 'Date', time: 'Time', cashier: 'Cashier', terminal: 'Terminal', client: 'Customer', points: 'Points', subtotal: 'Subtotal', discount: 'Discount', promo: 'Promotion', saved: 'You saved', ht: 'Net', vat: 'VAT', total: 'TOTAL', totalRefund: 'TOTAL REFUNDED', tip: 'Tip', paid: 'Paid', received: 'Received', change: 'Change', origin: 'Original receipt', reason: 'Reason', thanks: 'Thank you for your visit', copy: 'DUPLICATE', report: 'SALES REPORT', period: 'Period', count: 'Sales', avg: 'Average basket', ref: 'Ref.' },
    ar: { __lang: 'ar', article: 'منتج', receipt: 'وصل', refund: 'استرجاع', no: 'رقم', date: 'التاريخ', time: 'الساعة', cashier: 'الصندوق', terminal: 'الجهاز', client: 'الزبون', points: 'نقاط', subtotal: 'المجموع الفرعي', discount: 'تخفيض', promo: 'عرض', saved: 'وفّرت', ht: 'المجموع دون ض.ق.م', vat: 'ض.ق.م', total: 'المجموع', totalRefund: 'المبلغ المسترجع', tip: 'إكرامية', paid: 'المدفوع', received: 'المستلم', change: 'الباقي', origin: 'الوصل الأصلي', reason: 'السبب', thanks: 'شكراً على زيارتكم', copy: 'نسخة', report: 'تقرير المبيعات', period: 'الفترة', count: 'عدد المبيعات', avg: 'معدل السلة', ref: 'مرجع' },
  };
  function dict(l) { return DICT[l] || DICT.fr; }

  /* ═══════════════════ l'argent, écrit ═══════════════════ */
  function money(n, doc) {
    var v = num(n);
    var s = doc && doc.decimals
      ? v.toFixed(2)
      : String(Math.round(v));
    /* Séparateur de milliers en espace insécable fine côté écran, espace
     * simple côté thermique : une imprimante 8 bits ne connaît pas le premier. */
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join(',');
  }
  function moneyMAD(n, doc) { return money(n, doc) + ' MAD'; }

  /* ═══════════════════ SORTIE 1 · ESC/POS (thermique) ═══════════════════ */
  function escpos(doc, o) {
    o = o || {};
    var E = window.KiwiEscPos;
    if (!E || !E.builder) return null;
    var paper = doc.paper || '80';
    var cols = E.paperCols ? E.paperCols(paper) : 48;
    var b = E.builder().init();
    var T = doc.T || dict(doc.lang);
    var refund = doc.kind === 'refund';
    var rule = function () { b.line(new Array(cols + 1).join('-')); };
    var row = function (l, r, bold) {
      l = String(l == null ? '' : l); r = String(r == null ? '' : r);
      if (l.length + r.length + 1 > cols) l = l.slice(0, Math.max(0, cols - r.length - 1));
      var gap = Math.max(1, cols - l.length - r.length);
      if (bold) b.bold(true);
      b.line(l + new Array(gap + 1).join(' ') + r);
      if (bold) b.bold(false);
    };

    /* — l'enseigne — */
    b.align('center');
    if (doc.shop.name) b.bold(true).size(2, 2).line(doc.shop.name).size(1, 1).bold(false);
    if (doc.shop.legalName) b.line(doc.shop.legalName);
    if (doc.shop.tagline) b.line(doc.shop.tagline);
    doc.shop.contact.forEach(function (c) { b.line(c); });
    doc.shop.legal.forEach(function (l) { b.line(l); });
    if (doc.welcome) b.feed(1).line(doc.welcome);
    if (refund) b.feed(1).bold(true).size(2, 2).line(T.refund).size(1, 1).bold(false);
    /* Le bandeau du récapitulatif. En gras et en grand, pour la même raison que
       celui du remboursement : ce papier ne doit pas pouvoir passer pour un
       ticket de vente. */
    if (doc.summary) b.feed(1).bold(true).size(1, 2).line(doc.summary.title).size(1, 1).bold(false);
    if (doc.copy) b.bold(true).line('— ' + doc.copy + ' —').bold(false);

    /* — quoi, quand, qui — */
    b.align('left'); rule();
    if (doc.meta.ref) row(T.no, doc.meta.ref);
    if (doc.summary) row(T.period, doc.meta.date + '  ' + doc.meta.time);
    else row(T.date, doc.meta.date + '  ' + doc.meta.time);
    if (doc.meta.label) row('', doc.meta.label);
    if (doc.meta.cashier) row(T.cashier, doc.meta.cashier);
    if (doc.meta.terminal) row(T.terminal, doc.meta.terminal);
    if (doc.customer) {
      row(T.client, doc.customer.name || doc.customer.phone);
      if (doc.customer.points != null) row('  ' + T.points, String(doc.customer.points));
      if (doc.customer.loyalty) b.line('  ' + doc.customer.loyalty);
    }
    if (doc.refund && doc.refund.of) row(T.origin, doc.refund.of);
    if (doc.refund && doc.refund.reason) row(T.reason, doc.refund.reason);

    /* — la liste des ventes, quand c'en est une — */
    if (doc.summary) {
      rule();
      doc.summary.rows.forEach(function (r) {
        row(r.time + '  ' + r.label, moneyMAD(r.amount, doc));
        if (r.ref) b.line('    ' + r.ref + (r.method ? '  ·  ' + r.method : ''));
      });
      rule();
      row(T.count, String(doc.summary.count));
      doc.summary.byMethod.forEach(function (m) {
        row('  ' + m.label + ' (' + m.n + ')', moneyMAD(m.amount, doc));
      });
      b.size(1, 2);
      row(T.total, moneyMAD(doc.totals.total, doc), true);
      b.size(1, 1);
      b.align('center').feed(1);
      if (doc.foot.web) b.line(doc.foot.web);
      if (doc.second) secondLanguage(b, doc, cols);
      b.feed(1).line('Kiwi');
      b.cut();
      if (o.openDrawer) b.drawer();
      return b.bytes();
    }

    /* — le panier — */
    rule();
    doc.lines.forEach(function (l) {
      row(l.qty + '× ' + l.name, moneyMAD(l.total, doc));
      if (l.unit) b.line('    ' + money(l.unit, doc) + ' × ' + l.qty);
      if (l.ref) b.line('    ' + T.ref + ' ' + l.ref);
      if (l.barcode) b.line('    ' + l.barcode);
      if (l.note) b.line('    > ' + l.note);
    });

    /* — l'argent — */
    rule();
    var t = doc.totals;
    if (t.discount > 0 || t.promo > 0) row(T.subtotal, moneyMAD(t.subtotal, doc));
    if (t.promo > 0) row(t.promoLabel || T.promo, '- ' + moneyMAD(t.promo, doc));
    if (t.discount > 0) row(T.discount, '- ' + moneyMAD(t.discount, doc));
    if (t.vat) { row(T.ht, moneyMAD(t.vat.ht, doc)); row(T.vat + ' ' + t.vat.rate + ' %', moneyMAD(t.vat.tva, doc)); }
    if (t.tip > 0) row(T.tip, moneyMAD(t.tip, doc));
    b.size(1, 2);
    row(refund ? T.totalRefund : T.total, (refund ? '- ' : '') + moneyMAD(t.total + t.tip, doc), true);
    b.size(1, 1);
    /* Ce que la cliente a économisé, en toutes lettres, sous le total. C'est la
       ligne qu'on relit dans le sac en rentrant — et la seule preuve papier que
       la promotion affichée en vitrine a bien été appliquée. */
    if (!refund && (t.promo + t.discount) > 0) {
      b.align('center').bold(true).line(T.saved + ' ' + moneyMAD(t.promo + t.discount, doc)).bold(false).align('left');
    }
    doc.pay.forEach(function (p) { row(p.label, moneyMAD(p.amount, doc)); });
    if (doc.cash) { row(T.received, moneyMAD(doc.cash.received, doc)); row(T.change, moneyMAD(doc.cash.change, doc)); }

    /* — le pied — */
    b.align('center').feed(1);
    if (doc.foot.thanks) b.line(doc.foot.thanks);
    else b.line(T.thanks);
    if (doc.foot.policy) wrapText(doc.foot.policy, cols).forEach(function (l) { b.line(l); });
    if (doc.foot.social) b.line(doc.foot.social);
    if (doc.foot.web) b.line(doc.foot.web);
    if (doc.foot.whatsapp) b.line('WhatsApp ' + doc.foot.whatsapp);
    if (doc.second) secondLanguage(b, doc, cols);
    b.feed(1).line('Kiwi');
    b.cut();
    if (o.openDrawer) b.drawer();
    return b.bytes();
  }

  /* Le ticket bilingue : la seconde langue reprend le strict nécessaire — le
   * total et le remerciement. Répéter le ticket entier double la longueur du
   * papier pour rien ; ce qu'un client lit dans sa langue, c'est ce qu'il a
   * payé. */
  function secondLanguage(b, doc, cols) {
    var T2 = dict(doc.second);
    b.feed(1);
    b.line(T2.total + ' : ' + moneyMAD(doc.totals.total + doc.totals.tip, doc));
    b.line(doc.foot.thanks || T2.thanks);
  }

  function wrapText(s, cols) {
    var words = String(s || '').split(/\s+/), out = [], cur = '';
    words.forEach(function (w) {
      if (!cur) { cur = w; return; }
      if ((cur + ' ' + w).length <= cols) cur += ' ' + w; else { out.push(cur); cur = w; }
    });
    if (cur) out.push(cur);
    return out;
  }

  /* ═══════════════════ SORTIE 2 · HTML (aperçu, écran, pilote système) ═══
   * La même traversée, dans le même ordre. Sert à trois choses : l'aperçu vivant
   * de l'éditeur, le reçu à l'écran de la caisse (le « reçu numérique »), et
   * l'impression par le pilote système quand aucune thermique n'est joignable. */
  function html(doc, o) {
    o = o || {};
    var T = doc.T || dict(doc.lang);
    var refund = doc.kind === 'refund';
    var out = [];
    /* ── LES CODES NE SE LISENT PAS À L'ENVERS ────────────────────────────────
     * Dans un ticket arabe, le moteur bidirectionnel réordonne les segments
     * latins : « SS-28-GQ » s'affichait « GQ-SS-28 », et « 30/07/2026 21:01 —
     * 21:29 » ressortait « 21:29 — 2026 21:01/07/30 ». Ce ne sont pas des
     * détails : un numéro de ticket recopié à l'envers ne retrouve aucune vente,
     * et une période illisible rend le papier inutilisable au rapprochement.
     * On isole donc chaque valeur latine (LRI … PDI) — le rendu suit la ligne
     * arabe, la valeur garde son propre sens de lecture. */
    var code = function (s) {
      s = String(s == null ? '' : s);
      return s ? '<bdi dir="ltr" class="kr-code">' + esc(s) + '</bdi>' : '';
    };
    var Rh = function (k, vHtml, cls) {
      out.push('<div class="kr-r' + (cls ? ' ' + cls : '') + '"><span>' + esc(k) + '</span><span>' + vHtml + '</span></div>');
    };
    var Ph = function (cls, h) { out.push('<div class="' + cls + '">' + h + '</div>'); };
    var P = function (cls, txt) { out.push('<div class="' + cls + '">' + esc(txt) + '</div>'); };
    var R = function (k, v, cls) {
      out.push('<div class="kr-r' + (cls ? ' ' + cls : '') + '"><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>');
    };

    out.push('<div class="kr-ticket kr-d-' + esc(doc.density || 'normal') + (doc.lang === 'ar' ? ' kr-rtl' : '') + '" dir="' + (doc.lang === 'ar' ? 'rtl' : 'ltr') + '">');
    if (doc.shop.logo) out.push('<div class="kr-logo"><img alt="" src="' + esc(doc.shop.logo) + '"/></div>');
    if (doc.shop.name) P('kr-shop', doc.shop.name);
    if (doc.shop.legalName) P('kr-c kr-sm', doc.shop.legalName);
    if (doc.shop.tagline) P('kr-c kr-sm', doc.shop.tagline);
    doc.shop.contact.forEach(function (c) { P('kr-c kr-sm', c); });
    doc.shop.legal.forEach(function (l) { P('kr-c kr-xs', l); });
    if (doc.welcome) P('kr-c kr-welcome', doc.welcome);
    if (refund) P('kr-banner', T.refund);
    if (doc.summary) P('kr-banner', doc.summary.title);
    if (doc.copy) P('kr-c kr-copy', '— ' + doc.copy + ' —');

    out.push('<div class="kr-rule"></div>');
    if (doc.meta.ref) Rh(T.no, code(doc.meta.ref));
    Rh(doc.summary ? T.period : T.date, code(doc.meta.date + '  ' + doc.meta.time));
    if (doc.meta.label) R('', doc.meta.label);
    if (doc.meta.cashier) R(T.cashier, doc.meta.cashier);
    if (doc.meta.terminal) R(T.terminal, doc.meta.terminal);
    if (doc.customer) {
      R(T.client, doc.customer.name || doc.customer.phone);
      if (doc.customer.points != null) R(T.points, String(doc.customer.points));
      if (doc.customer.loyalty) P('kr-sm', doc.customer.loyalty);
    }
    if (doc.refund && doc.refund.of) Rh(T.origin, code(doc.refund.of));
    if (doc.refund && doc.refund.reason) R(T.reason, doc.refund.reason);

    if (doc.summary) {
      out.push('<div class="kr-rule"></div>');
      doc.summary.rows.forEach(function (r) {
        out.push('<div class="kr-r kr-item"><span>' + esc(r.time + '  ' + r.label) + '</span><span>'
          + esc(moneyMAD(r.amount, doc)) + '</span></div>');
        var sub = [];
        if (r.ref) sub.push(code(r.ref));
        if (r.method) sub.push(esc(r.method));
        if (sub.length) Ph('kr-sub', sub.join(' · '));
      });
      out.push('<div class="kr-rule"></div>');
      R(T.count, String(doc.summary.count));
      doc.summary.byMethod.forEach(function (m) { R(m.label + ' (' + m.n + ')', moneyMAD(m.amount, doc)); });
      R(T.total, moneyMAD(doc.totals.total, doc), 'kr-total');
      out.push('<div class="kr-rule"></div>');
      if (doc.foot.web) P('kr-c kr-xs', doc.foot.web);
      if (doc.second) {
        var T2s = dict(doc.second);
        P('kr-c kr-sm', T2s.total + ' : ' + moneyMAD(doc.totals.total, doc));
      }
      P('kr-c kr-xs kr-kiwi', 'Kiwi');
      out.push('</div>');
      return out.join('');
    }

    out.push('<div class="kr-rule"></div>');
    doc.lines.forEach(function (l) {
      out.push('<div class="kr-r kr-item"><span>' + esc(l.qty + '× ' + l.name) + '</span><span>' + esc(moneyMAD(l.total, doc)) + '</span></div>');
      var sub = [];
      if (l.unit) sub.push(code(money(l.unit, doc) + ' × ' + l.qty));
      if (l.ref) sub.push(esc(T.ref) + ' ' + code(l.ref));
      if (l.barcode) sub.push(code(l.barcode));
      if (l.note) sub.push(esc('> ' + l.note));
      if (sub.length) Ph('kr-sub', sub.join(' · '));
    });

    out.push('<div class="kr-rule"></div>');
    var t = doc.totals;
    if (t.discount > 0 || t.promo > 0) R(T.subtotal, moneyMAD(t.subtotal, doc));
    if (t.promo > 0) R(t.promoLabel || T.promo, '- ' + moneyMAD(t.promo, doc));
    if (t.discount > 0) R(T.discount, '- ' + moneyMAD(t.discount, doc));
    if (t.vat) { R(T.ht, moneyMAD(t.vat.ht, doc)); R(T.vat + ' ' + t.vat.rate + ' %', moneyMAD(t.vat.tva, doc)); }
    if (t.tip > 0) R(T.tip, moneyMAD(t.tip, doc));
    R(refund ? T.totalRefund : T.total, (refund ? '- ' : '') + moneyMAD(t.total + t.tip, doc), 'kr-total');
    if (!refund && (t.promo + t.discount) > 0) P('kr-saved', T.saved + ' ' + moneyMAD(t.promo + t.discount, doc));
    doc.pay.forEach(function (p) { R(p.label, moneyMAD(p.amount, doc)); });
    if (doc.cash) { R(T.received, moneyMAD(doc.cash.received, doc)); R(T.change, moneyMAD(doc.cash.change, doc)); }

    out.push('<div class="kr-rule"></div>');
    P('kr-c kr-thanks', doc.foot.thanks || T.thanks);
    if (doc.foot.policy) P('kr-c kr-xs', doc.foot.policy);
    if (doc.foot.social) P('kr-c kr-xs', doc.foot.social);
    if (doc.foot.web) P('kr-c kr-xs', doc.foot.web);
    if (doc.foot.whatsapp) P('kr-c kr-xs', 'WhatsApp ' + doc.foot.whatsapp);
    if (doc.qr) P('kr-c kr-xs kr-qr', doc.qr);
    if (doc.second) {
      var T2 = dict(doc.second);
      out.push('<div class="kr-rule"></div>');
      P('kr-c kr-sm', T2.total + ' : ' + moneyMAD(doc.totals.total + doc.totals.tip, doc));
      P('kr-c kr-xs', doc.foot.thanks || T2.thanks);
    }
    P('kr-c kr-xs kr-kiwi', 'Kiwi');
    out.push('</div>');
    return out.join('');
  }

  /* La feuille de style de l'aperçu. Injectée une fois, sur demande — ce fichier
   * n'a pas de DOM autrement. Les largeurs sont en millimètres réels pour que
   * l'aperçu 58 mm ait la tête d'un 58 mm et pas d'un 80 mm rétréci. */
  function ensureCSS() {
    if (document.getElementById('kiwi-receipt-css')) return;
    var st = document.createElement('style');
    st.id = 'kiwi-receipt-css';
    st.textContent = [
      '.kr-ticket{--kr-w:72mm;width:var(--kr-w);margin:0 auto;background:#fff;color:#111;padding:5mm 4mm;',
      'font-family:var(--mono,ui-monospace,"JetBrains Mono",Menlo,Consolas,monospace);font-size:11px;line-height:1.5;box-sizing:border-box;}',
      '.kr-ticket.kr-w58{--kr-w:52mm;font-size:10px;}',
      '.kr-d-compact{line-height:1.34;}.kr-d-airy{line-height:1.72;}',
      '.kr-rtl{direction:rtl;}',
      /* Le logo en HAUT, AU MILIEU. `text-align` ne centre que du contenu en
         ligne : une image que le navigateur traite autrement restait collée à
         gauche. `display:block` + marges auto centrent la BOÎTE, pas le flux. */
      '.kr-logo{text-align:center;margin:0 auto 3mm;}',
      '.kr-logo img{display:block;margin:0 auto;max-width:90%;max-height:27mm;object-fit:contain;}',
      '.kr-shop{text-align:center;font-weight:700;font-size:16px;letter-spacing:-0.01em;margin-bottom:1mm;}',
      '.kr-c{text-align:center;}.kr-sm{font-size:10px;}.kr-xs{font-size:9px;opacity:.85;}',
      '.kr-sub{font-size:9px;opacity:.75;}',
      '.kr-saved{text-align:center;font-weight:700;margin-top:2px;}',
      '.kr-welcome{margin-top:2mm;font-style:normal;}',
      '.kr-banner{text-align:center;font-weight:700;font-size:13px;letter-spacing:.08em;margin:2mm 0;padding:1mm 0;border:1px solid currentColor;}',
      '.kr-copy{font-weight:700;margin-top:1mm;}',
      '.kr-rule{border-top:1px dashed #999;margin:2.4mm 0;}',
      '.kr-r{display:flex;justify-content:space-between;gap:3mm;}',
      '.kr-r>span:last-child{white-space:nowrap;}',
      '.kr-r>span:first-child{overflow-wrap:anywhere;}',
      '.kr-item>span:first-child{font-weight:500;}',
      '.kr-sub{font-size:9px;opacity:.75;padding-inline-start:4mm;}',
      /* Un numero de ticket, un code-barres, une date : des valeurs latines qui
         gardent leur sens de lecture au milieu d une ligne arabe. Sans cela
         « SS-28-GQ » sort « GQ-SS-28 », et un numero recopie a l envers ne
         retrouve aucune vente. */
      '.kr-code{unicode-bidi:isolate;direction:ltr;}',
      '.kr-total{font-weight:700;font-size:14px;margin:1.4mm 0;}',
      '.kr-thanks{margin-top:1mm;}',
      '.kr-qr{word-break:break-all;}',
      '.kr-kiwi{margin-top:3mm;letter-spacing:.14em;opacity:.6;}',
    ].join('');
    document.head.appendChild(st);
  }

  /* ═══════════════════ SORTIE 3 · texte brut ═══════════════════
   * Pour un reçu envoyé par WhatsApp / e-mail, et pour les tests. */
  function text(doc) {
    var cols = 40, T = doc.T || dict(doc.lang), out = [];
    var row = function (l, r) {
      l = String(l || ''); r = String(r || '');
      var gap = Math.max(1, cols - l.length - r.length);
      return l + new Array(gap + 1).join(' ') + r;
    };
    if (doc.shop.name) out.push(doc.shop.name);
    if (doc.shop.legalName) out.push(doc.shop.legalName);
    doc.shop.contact.forEach(function (c) { out.push(c); });
    doc.shop.legal.forEach(function (l) { out.push(l); });
    if (doc.kind === 'refund') out.push(T.refund);
    if (doc.summary) out.push(doc.summary.title);
    if (doc.copy) out.push('— ' + doc.copy + ' —');
    out.push(new Array(cols + 1).join('-'));
    if (doc.meta.ref) out.push(row(T.no, doc.meta.ref));
    out.push(row(doc.summary ? T.period : T.date, doc.meta.date + ' ' + doc.meta.time));
    if (doc.meta.cashier) out.push(row(T.cashier, doc.meta.cashier));
    out.push(new Array(cols + 1).join('-'));
    if (doc.summary) {
      doc.summary.rows.forEach(function (r) { out.push(row(r.time + ' ' + r.label, moneyMAD(r.amount, doc))); });
      out.push(new Array(cols + 1).join('-'));
      out.push(row(T.count, String(doc.summary.count)));
      doc.summary.byMethod.forEach(function (m) { out.push(row(m.label + ' (' + m.n + ')', moneyMAD(m.amount, doc))); });
      out.push(row(T.total, moneyMAD(doc.totals.total, doc)));
      return out.join('\n');
    }
    doc.lines.forEach(function (l) { out.push(row(l.qty + '× ' + l.name, moneyMAD(l.total, doc))); });
    out.push(new Array(cols + 1).join('-'));
    if (doc.totals.promo > 0) out.push(row(doc.totals.promoLabel || T.promo, '- ' + moneyMAD(doc.totals.promo, doc)));
    if (doc.totals.discount > 0) out.push(row(T.discount, '- ' + moneyMAD(doc.totals.discount, doc)));
    if (doc.totals.vat) out.push(row(T.vat + ' ' + doc.totals.vat.rate + ' %', moneyMAD(doc.totals.vat.tva, doc)));
    /* Le signe et le libellé du remboursement, comme dans les deux autres
     * sorties. Un total non signé sur un reçu d'avoir se lit comme un
     * encaissement — la seule ligne qu'il ne faut pas se tromper à lire. */
    var refunded = doc.kind === 'refund';
    out.push(row(refunded ? T.totalRefund : T.total,
      (refunded ? '- ' : '') + moneyMAD(doc.totals.total + doc.totals.tip, doc)));
    doc.pay.forEach(function (p) { out.push(row(p.label, moneyMAD(p.amount, doc))); });
    /* Reçu / Rendu. Le thermique (escpos) et l'écran (html) les portaient déjà ;
       cette sortie-ci les oubliait, et c'est elle qui part à l'imprimante
       système. Un ticket sans le rendu est précisément celui qu'on rouvre pour
       vérifier le rendu. */
    if (doc.cash) {
      out.push(row(T.received, moneyMAD(doc.cash.received, doc)));
      out.push(row(T.change, moneyMAD(doc.cash.change, doc)));
    }
    out.push(doc.foot.thanks || T.thanks);
    return out.join('\n');
  }

  /* ═══════════════════ IMPRIMER ═══════════════════
   * Thermique d'abord, pilote système ensuite. Jamais de toast qui annonce une
   * impression qui n'a pas eu lieu — c'est exactement ce que faisait le bouton
   * « Imprimer » du reçu de la caisse. */
  function print(doc, o) {
    o = o || {};
    var KP = window.KiwiPrinter;
    var bytes = escpos(doc, o);
    if (KP && bytes && (KP.isConnected ? KP.isConnected() : KP.isConfigured && KP.isConfigured())) {
      return KP.printBytes(bytes).then(function (r) {
        if (r && r.ok) return r;
        return browser(doc, o);
      }, function () { return browser(doc, o); });
    }
    return Promise.resolve(browser(doc, o));
  }
  function browser(doc, o) {
    var KP = window.KiwiPrinter;
    ensurePrintCSS(doc.paper);
    if (KP && KP.browserPrintHTML) return KP.browserPrintHTML(html(doc), doc.paper);
    /* Sans printer-bridge.js (page client, aperçu isolé) : on imprime quand même. */
    var root = document.getElementById('kr-print-root');
    if (root) root.remove();
    root = document.createElement('div');
    root.id = 'kr-print-root';
    root.innerHTML = html(doc);
    document.body.appendChild(root);
    setTimeout(function () {
      try { window.print(); } catch (_) {}
      setTimeout(function () { var r = document.getElementById('kr-print-root'); if (r) r.remove(); }, 600);
    }, 60);
    return { ok: true, via: 'browser' };
  }
  /* Le CSS d'impression du reçu Kiwi. printer-bridge en a un pour SES tickets
   * (.kpr-*) ; celui-ci cadre les nôtres (.kr-*) à la largeur du rouleau. */
  function ensurePrintCSS(paper) {
    ensureCSS();
    var w = String(paper || '80');
    var mm = ({ '44': 44, '57': 57, '58': 58, '76': 76, '80': 80, '110': 110, '112': 112 })[w] || 80;
    var prev = document.getElementById('kiwi-receipt-print-css');
    if (prev) { if (prev.getAttribute('data-w') === String(mm)) return; prev.remove(); }
    var st = document.createElement('style');
    st.id = 'kiwi-receipt-print-css';
    st.setAttribute('data-w', String(mm));
    st.textContent =
      '#kr-print-root{display:none;}' +
      '@media print{@page{size:' + mm + 'mm auto;margin:0;}' +
      'html,body{margin:0!important;padding:0!important;background:#fff!important;}' +
      'body>*:not(#kr-print-root):not(#kpr-print-root){display:none!important;}' +
      '#kr-print-root{display:block!important;position:static!important;}' +
      '#kr-print-root .kr-ticket,#kpr-print-root .kr-ticket{--kr-w:' + (mm - 6) + 'mm;box-shadow:none;}' +
      /* ── UN GRIS N'EST PAS UNE NUANCE, C'EST UNE BOUILLIE ────────────────────
       * L'aperçu à l'écran atténue les mentions secondaires (opacity .85, .75,
       * .6) : c'est joli sur une dalle rétro-éclairée. Sur PAPIER, une tête
       * thermique ne connaît que noir ou rien — elle tramote ce gris en points
       * espacés, et à 9 px le pied de page sort délavé, illisible en biais.
       * C'est exactement ce qu'un client nous a montré sur son ticket : entête
       * et TOTAL nets, conditions de retour et « Kiwi » presque effacés.
       * À l'impression, donc : tout en noir plein, et un plancher de taille. */
      '#kr-print-root .kr-ticket *,#kpr-print-root .kr-ticket *{opacity:1!important;color:#000!important;}' +
      '#kr-print-root .kr-xs,#kpr-print-root .kr-xs,' +
      '#kr-print-root .kr-sub,#kpr-print-root .kr-sub{font-size:10px!important;}' +
      '#kr-print-root .kr-sm,#kpr-print-root .kr-sm{font-size:11px!important;}' +
      /* Le logo : centré et net. `print-color-adjust` empêche le navigateur
         d'« économiser l'encre » en éclaircissant l'image — sur un rouleau
         thermique cette économie-là efface le logo. */
      '#kr-print-root .kr-logo img,#kpr-print-root .kr-logo img{display:block;margin:0 auto;' +
      'print-color-adjust:exact;-webkit-print-color-adjust:exact;}}';
    document.head.appendChild(st);
  }

  /* ═══════════════════ FIGER / RÉIMPRIMER ═══════════════════
   * Le document tel qu'il a été remis au client. `T` est retirée (elle se
   * reconstruit depuis `lang`) et les champs vides tombent : une vente porte
   * son ticket, pas un formulaire. */
  function snapshot(doc) {
    if (!doc) return null;
    var s = clone(doc);
    delete s.T;
    /* Le logo est une image ; la répéter sur chaque vente remplirait le
     * stockage en un après-midi. On garde le fait qu'il y en avait un, et la
     * réimpression reprend celui de la fiche. */
    if (s.shop && s.shop.logo) s.shop.logo = '1';
    strip(s);
    return s;
  }
  function strip(o) {
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v === '' || v == null || (Array.isArray(v) && !v.length)) { delete o[k]; return; }
      if (typeof v === 'object' && !Array.isArray(v)) { strip(v); if (!Object.keys(v).length) delete o[k]; }
    });
  }
  /* Rouvrir un ticket figé. `copy` marque la réimpression — deux exemplaires du
   * même reçu qui circulent sans le dire, c'est une pièce qu'on ne peut plus
   * rapprocher. Le NUMÉRO et le CONTENU, eux, ne bougent pas : c'est le même
   * ticket, pas une nouvelle vente. */
  function fromSnapshot(snap, opts) {
    opts = opts || {};
    if (!snap) return null;
    var d = clone(snap);
    d.v = VER;
    d.lang = d.lang || lang();
    d.T = dict(d.lang);
    d.shop = d.shop || {};
    d.shop.contact = d.shop.contact || [];
    d.shop.legal = d.shop.legal || [];
    if (d.shop.logo === '1') {
      var cfg = getConfig(opts.venueId);
      d.shop.logo = cfg.look.logoOn ? cfg.look.logo : '';
    }
    d.lines = d.lines || [];
    d.pay = d.pay || [];
    d.totals = d.totals || { subtotal: 0, discount: 0, promo: 0, promoLabel: '', tip: 0, total: 0, vat: null };
    // Un reçu réimprimé depuis une version antérieure n'a pas ces champs : sans
    // ce repli, la ligne « Promotion » afficherait `undefined` sur un duplicata.
    if (d.totals.promo == null) d.totals.promo = 0;
    if (d.totals.promoLabel == null) d.totals.promoLabel = '';
    d.meta = d.meta || {};
    d.foot = d.foot || {};
    /* `copy: true` veut dire « marque-le comme duplicata », pas « écris true » :
       str(true) rendait littéralement « — true — » en travers du ticket, sur le
       seul chemin qui compte (une réimpression passe toujours par le figé).
       Même traduction qu'à la construction, dans la langue du ticket d'origine. */
    if (opts.copy) d.copy = opts.copy === true ? d.T.copy : str(opts.copy, 40);
    if (opts.paper) d.paper = opts.paper;
    return d;
  }

  /* Un ticket de démonstration pour l'aperçu et le test d'impression — SANS
   * enregistrer de vente ni consommer un numéro. `ref` est explicitement une
   * référence d'essai : un ticket de test qui porte un vrai numéro de séquence
   * finit dans une caisse comme une vente qu'on cherchera toute la soirée. */
  function sample(opts) {
    opts = opts || {};
    var T = dict(opts.lang || lang());
    return build({
      ref: 'TEST-0001',
      ts: Date.now(),
      label: opts.label || '',
      cashier: opts.cashier || (T.__lang === 'ar' ? 'أمينة' : 'Amina'),
      lines: [
        { name: T.__lang === 'en' ? 'Cotton shirt' : (T.__lang === 'ar' ? 'قميص قطني' : 'Chemise coton'), qty: 1, total: 240, ref: 'CH-104', barcode: '6111234567890' },
        { name: T.__lang === 'en' ? 'Leather belt' : (T.__lang === 'ar' ? 'حزام جلد' : 'Ceinture cuir'), qty: 2, unit: 90, total: 180 },
      ],
      subtotal: 420, discount: 20, total: 400,
      method: 'card',
      customer: { name: T.__lang === 'ar' ? 'سعاد ب.' : 'Souad B.', points: 40 },
    }, opts);
  }

  /* ═══════════════════ ALLER CHERCHER LA FICHE AVANT D'EN AVOIR BESOIN ═══════
   * Les deux documents ne partaient chercher leur copie serveur qu'au premier
   * getBusiness()/getConfig() — et sur une caisse, le premier lecteur est
   * attachReceipt(), c'est-à-dire l'encaissement lui-même. La lecture est
   * synchrone, la relecture serveur ne l'est pas : le PREMIER ticket de la
   * session sortait donc avec ce que la tablette avait sous la main (rien du
   * tout sur une caisse neuve, la version d'avant sur les autres), et la copie
   * à jour n'arrivait qu'ensuite. Pire, tant que personne n'avait lu la fiche
   * elle n'était pas attachée au miroir : « Rafraîchir » ne pouvait pas la
   * relire, puisqu'il ne savait pas qu'elle existait.
   *
   * On la demande donc à l'ouverture de la page. Un simple get() suffit : il
   * matérialise l'enregistrement, l'attache au miroir et lance la relecture.
   * Aucune ligne n'est créée côté serveur pour autant — pushNow() refuse de
   * remonter un document vide qui n'a jamais eu de révision.
   *
   * Et on recommence quand la caisse s'appaire : avant le code à six chiffres il
   * n'y a aucun établissement à lire, donc rien à précharger. */
  function warm() {
    try {
      if (!venueKey()) return;
      var b = BS(); if (b) b.get();
      var c = CS(); if (c) c.get();
    } catch (_) {}
  }
  var livePullTimer = null;
  function isCaissePage() {
    try { return /\/kiwi-caisse(?:\.html)?$/.test(location.pathname || ''); } catch (_) { return false; }
  }
  function pullReceiptNow() {
    if (!isCaissePage()) return;
    try { if (document.visibilityState === 'hidden') return; } catch (_) {}
    [BS(), CS()].forEach(function (s) {
      try { var c = s && s.cloud && s.cloud(); if (c && c.pull) c.pull(false); } catch (_) {}
    });
  }
  function startLivePull() {
    if (livePullTimer || !isCaissePage() || typeof setInterval !== 'function') return;
    /* /api/store n'offre pas de flux poussé. Une relecture légère pendant que la
       caisse est visible donne au comptoir le reçu enregistré au dashboard en
       moins de deux secondes, sans recharger ni attendre un changement d'onglet. */
    livePullTimer = setInterval(pullReceiptNow, 1500);
  }
  (function bootWarm() {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(warm, 0); startLivePull(); });
      } else { setTimeout(warm, 0); startLivePull(); }
      document.addEventListener('kiwi-paired', function () { setTimeout(warm, 0); startLivePull(); });
    } catch (_) {}
  })();

  /* ═══════════════════ l'API ═══════════════════ */
  window.KiwiReceipt = {
    /* fiche établissement (source unique des mentions légales) */
    business: getBusiness, saveBusiness: setBusiness, LEGAL_FIELDS: LEGAL_FIELDS,
    missing: missing, isComplete: isComplete, migrateBusiness: migrateBusiness,
    /* fiche reçu */
    config: getConfig, saveConfig: setConfig, blankConfig: blankConfig,
    normalizeConfig: normalizeConfig, isConfigured: isConfigured,
    /* construire / rendre */
    build: build, buildSummary: buildSummary,
    html: html, escpos: escpos, text: text, print: print,
    ensureCSS: ensureCSS, sample: sample,
    /* figer / rouvrir */
    snapshot: snapshot, fromSnapshot: fromSnapshot,
    /* numérotation */
    nextRef: nextRef,
    /* divers */
    venueKey: venueKey, subscribe: subscribe, money: money, moneyMAD: moneyMAD,
    /* '' quand la copie serveur est à jour ; sinon la raison du refus. Un reçu
       réglé qui ne quitte pas l'appareil est un reçu que la caisse n'imprimera
       jamais : l'éditeur doit pouvoir le dire. */
    syncRefused: function () { return refused; },
    /* Ce qu'un propriétaire ne peut PAS retirer de son reçu. Exporté pour que
     * l'éditeur affiche la liste au lieu de la sous-entendre. */
    LOCKED: ['shop', 'ref', 'date', 'lines', 'totals', 'pay'],
  };
})();
