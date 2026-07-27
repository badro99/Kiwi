/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · HORAIRES D'OUVERTURE — window.KiwiHours
 * ---------------------------------------------------------------------------
 * LA source des horaires d'un établissement. Une seule, tenue dans Réglages →
 * Mes établissements. Aucun autre module ne stocke d'horaires : Réservations,
 * Order Pro, la caisse, la page client, le rapport journalier et l'assistant
 * posent tous leur question ICI.
 *
 * Ce qui existait avant : un champ « Horaires » en texte libre. On pouvait y
 * écrire « 12-02 », « lun-sam 9h/20h sauf ramadan », ou rien. Aucune machine ne
 * pouvait en tirer « sommes-nous ouverts ? », donc personne ne le lisait, donc
 * chaque module inventait ses propres heures dans son coin. Un texte que rien
 * ne lit n'est pas une donnée, c'est une note. Le remplacer par une structure
 * est tout l'objet de ce fichier.
 *
 * ── LE MODÈLE ──────────────────────────────────────────────────────────────
 *   { v: 1,
 *     week: { mon: { open: true, periods: [ {from:'12:00', to:'15:00'},
 *                                           {from:'19:00', to:'02:00'} ] }, … },
 *     exceptions: [ { id, from:'2026-08-01', to:'2026-08-15',
 *                     kind:'closed'|'hours', label:'Aïd', periods:[…] } ],
 *     overrides: [ { at, by, until, reason } ],
 *     updatedAt }
 *
 * `open:false` = fermé ce jour-là. `periods` vide = fermé aussi. Un jour ouvert
 * porte 1 ou 2 services (midi + soir), pas davantage : au-delà on décrit une
 * exception, pas une semaine type.
 *
 * ── APRÈS MINUIT ───────────────────────────────────────────────────────────
 * C'est le cas qui casse toutes les implémentations naïves. « 19:00–02:00 »
 * n'est pas une erreur de saisie et ne se compare pas avec `to > from` : c'est
 * un service qui commence lundi soir et finit mardi matin. Ici une période est
 * un COUPLE (début, durée), jamais un couple (début, fin) comparé bêtement —
 * `to <= from` veut dire « le lendemain », point. Un mardi 00:30, l'ouverture
 * qui compte est celle de LUNDI, et c'est pour ça que statusAt() examine
 * toujours la veille en plus du jour même.
 *
 * ── EXCEPTIONS ─────────────────────────────────────────────────────────────
 * Une exception (Aïd, Ramadan, congés, jour férié, saison) couvre une PLAGE de
 * dates et remplace la semaine type sur cette plage seulement. La semaine type
 * n'est jamais écrasée : quand la plage se termine, l'établissement retrouve
 * ses horaires normaux sans que personne n'ait à les ressaisir. C'est la seule
 * raison pour laquelle une exception est une liste à part et pas une écriture
 * dans `week`.
 *
 * Subtilité qui vaut un commentaire : une exception gouverne l'OUVERTURE de sa
 * date, pas ce qui déborde de la veille. Si lundi 19:00–02:00 et mardi est
 * exceptionnellement fermé, le service de lundi va quand même jusqu'à 02:00
 * mardi — le commerçant ferme sa nuit, il n'ouvre pas sa journée.
 *
 * ── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
 * Il n'invente rien. `isConfigured()` est faux tant que le propriétaire n'a pas
 * rempli sa semaine, et TOUT appelant doit le tester avant de parler. Un
 * assistant qui répond « vous fermez à 23h » parce que les restaurants ferment
 * souvent à 23h est pire qu'un assistant qui dit « je ne sais pas » : le
 * premier se fait croire.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VER = 1;
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  /* getDay() : 0 = dimanche. Notre semaine commence lundi (Maroc, et partout
   * où l'on affiche un planning hebdomadaire). */
  var DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var MIN_DAY = 1440;
  /* Le pas des menus déroulants. 15 min : assez fin pour « 8h30 » ou « 19h45 »,
   * assez large pour rester un menu qu'on parcourt à l'œil. */
  var STEP = 15;

  var DAY_LABEL = {
    fr: { mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi', thu: 'Jeudi', fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche' },
    en: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
    ar: { mon: 'الإثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة', sat: 'السبت', sun: 'الأحد' },
  };
  var DAY_SHORT = {
    fr: { mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim' },
    en: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' },
    ar: { mon: 'ن', tue: 'ث', wed: 'ر', thu: 'خ', fri: 'ج', sat: 'س', sun: 'ح' },
  };

  /* ═══════════ petites fonctions pures ═══════════ */
  function lang() {
    try {
      var l = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang();
      return (l === 'en' || l === 'ar') ? l : 'fr';
    } catch (_) { return 'fr'; }
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /* 'HH:MM' → minutes. Refuse tout le reste : c'est le point où « 12-02 »
   * s'arrête, et il vaut mieux qu'il s'arrête ici que trois modules plus loin. */
  function toMin(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h === 24 && mi === 0) return MIN_DAY;
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return h * 60 + mi;
  }
  function fromMin(min) {
    min = Math.max(0, Math.round(+min || 0));
    if (min >= MIN_DAY) return '24:00';
    return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
  }
  /* Durée d'une période, la seule arithmétique qui gère l'après-minuit :
   * to <= from ⇒ on franchit minuit ⇒ on ajoute une journée. */
  function span(p) {
    var a = toMin(p && p.from), b = toMin(p && p.to);
    if (a == null || b == null) return 0;
    if (b === MIN_DAY) return MIN_DAY - a;
    if (b > a) return b - a;
    return b + MIN_DAY - a;              /* 19:00 → 02:00 = 7 h */
  }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0) : null;
  }
  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (_) { return o; } }

  /* ═══════════ la forme vide ═══════════ */
  function blankDay() { return { open: false, periods: [] }; }
  function blank() {
    var w = {};
    DAYS.forEach(function (d) { w[d] = blankDay(); });
    return { v: VER, week: w, exceptions: [], overrides: [], updatedAt: 0 };
  }
  /* Un horaire est « configuré » dès qu'UN jour porte une période valable.
   * Une semaine entièrement fermée n'est pas un horaire, c'est un formulaire
   * qu'on a ouvert puis quitté — et l'assistant doit le dire, pas répondre
   * « vous êtes fermé toute la semaine ». */
  function configured(doc) {
    if (!doc || !doc.week) return false;
    return DAYS.some(function (d) {
      var day = doc.week[d];
      return !!(day && day.open && (day.periods || []).some(function (p) { return span(p) > 0; }));
    });
  }

  /* Normalise ce qui vient du disque ou du serveur. Tout ce qui n'est pas une
   * heure valable disparaît ici plutôt que de contaminer un calcul plus loin. */
  function normalize(raw) {
    var out = blank();
    if (!raw || typeof raw !== 'object') return out;
    var w = raw.week || {};
    DAYS.forEach(function (d) {
      var src = w[d] || {};
      var periods = (Array.isArray(src.periods) ? src.periods : [])
        .map(function (p) {
          var a = toMin(p && p.from), b = toMin(p && p.to);
          if (a == null || b == null) return null;
          if (a === b) return null;                       /* durée nulle */
          return { from: fromMin(a), to: fromMin(b) };
        })
        .filter(Boolean)
        .slice(0, 2);                                     /* midi + soir, pas plus */
      out.week[d] = { open: !!src.open && periods.length > 0, periods: periods };
    });
    out.exceptions = (Array.isArray(raw.exceptions) ? raw.exceptions : [])
      .map(normalizeException).filter(Boolean).slice(0, 60);
    out.overrides = (Array.isArray(raw.overrides) ? raw.overrides : []).slice(-20);
    out.updatedAt = +raw.updatedAt || 0;
    return out;
  }
  function normalizeException(e) {
    if (!e || typeof e !== 'object') return null;
    var from = parseYmd(e.from), to = parseYmd(e.to || e.from);
    if (!from) return null;
    if (!to || to < from) to = from;
    var kind = (e.kind === 'hours') ? 'hours' : 'closed';
    var periods = (Array.isArray(e.periods) ? e.periods : [])
      .map(function (p) {
        var a = toMin(p && p.from), b = toMin(p && p.to);
        return (a == null || b == null || a === b) ? null : { from: fromMin(a), to: fromMin(b) };
      })
      .filter(Boolean).slice(0, 2);
    if (kind === 'hours' && !periods.length) return null;   /* « autres horaires » sans horaire */
    return {
      id: String(e.id || ('x' + from.getTime() + Math.random().toString(36).slice(2, 6))),
      from: ymd(from), to: ymd(to), kind: kind,
      label: String(e.label || '').slice(0, 60),
      periods: periods,
    };
  }

  /* ═══════════ persistance — une fiche par établissement ═══════════
   * KiwiStore porte déjà les trois règles éprouvées (jamais de perte sur panne
   * réseau, jamais d'écrasement de l'autre appareil, jamais d'envoi avant
   * hydratation) et la clé par établissement. On ne réécrit pas ça ici.
   * `cloud:true` ⇒ la fiche suit le commerçant d'un appareil à l'autre, ce qui
   * est non négociable : des horaires qui ne vivent que dans un navigateur ne
   * sont pas la source de vérité de quoi que ce soit. */
  var store = null;
  function S() {
    if (store) return store;
    if (!window.KiwiStore || !window.KiwiStore.define) return null;
    store = window.KiwiStore.define('hours', {
      blank: blank,
      cloud: true,
      isEmpty: function (d) { return !configured(d); },
      /* Deux appareils qui éditent la même semaine : le plus récemment
       * enregistré gagne, en bloc. Fusionner jour par jour produirait une
       * semaine que personne n'a jamais validée — un lundi de l'iPad avec un
       * mardi du PC — et c'est justement ce qu'un horaire ne peut pas être. */
      merge: function (mine, theirs) {
        if (!theirs || !configured(theirs)) return mine;
        if (!mine || !configured(mine)) return theirs;
        return (+mine.updatedAt || 0) >= (+theirs.updatedAt || 0) ? mine : theirs;
      },
    });
    return store;
  }

  /* Quel établissement ? Le tableau de bord a un moteur de venues, la caisse
   * n'en a aucun — elle connaît son magasin appairé, et rien d'autre. Une
   * fiche d'horaires doit pourtant être LA MÊME des deux côtés, sinon le
   * comptoir et le bureau répondent différemment à « ouvre-t-on ce soir ? ».
   *
   * D'où la même cascade que clients-store.js et day-report.js : l'identifiant
   * de venue quand il existe, sinon le slug du magasin — que slugFor() renvoie
   * tel quel, donc les deux surfaces atterrissent sur LE MÊME document serveur
   * même si leur clé locale diffère. C'est le serveur qui les réconcilie, et
   * c'est bien lui la source partagée. */
  function venueKey(explicit) {
    if (explicit) {
      /* L'appelant peut nous donner un identifiant de venue OU un slug de
       * magasin — day-report.js raisonne en slugs, le tableau de bord en
       * identifiants de venue. Les deux désignent le même commerce mais la
       * fiche n'est rangée que sous UN des deux, et lire sous l'autre renvoie
       * un document vide : c'est exactement comme ça qu'un restaurant fermant
       * à 03:00 se retrouvait avec la bascule de journée par défaut. On traduit
       * donc, au lieu de faire confiance à la coïncidence. */
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
      return explicit;                     /* caisse : le slug EST la clé locale */
    }
    try {
      var v = window.KiwiStore && window.KiwiStore.currentVenue && window.KiwiStore.currentVenue();
      if (v) return v;
    } catch (_) {}
    try {
      var s = window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug();
      if (s) return s;
    } catch (_) {}
    /* CAISSE. currentSlug() ci-dessus exige KiwiEnv.isReal(), ce qui est la
     * bonne prudence côté tableau de bord mais laisse un comptoir appairé sans
     * identité sur un hébergement où ce drapeau n'est pas posé. day-report.js
     * résout déjà ce cas avec une cascade plus large (le magasin appairé, puis
     * kiwiLiveMerchant) — et comme la journée commerciale du Z est calculée à
     * partir de CES horaires, les deux doivent tomber sur le même magasin. Deux
     * cascades divergentes, c'est un Z qui bascule à une heure et un horaire
     * qui en dit une autre. */
    try {
      var dr = window.KiwiDayReport && window.KiwiDayReport.storeSlug && window.KiwiDayReport.storeSlug();
      if (dr) return dr;
    } catch (_) {}
    try {
      var pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      if (pv && pv.merchant) return pv.merchant;
    } catch (_) {}
    return null;
  }
  function get(venueId) {
    var s = S();
    if (!s) return blank();
    try { return normalize(s.get(venueKey(venueId))); } catch (_) { return blank(); }
  }
  function set(doc, venueId) {
    var s = S();
    var next = normalize(doc);
    next.updatedAt = Date.now();
    if (s) { try { s.set(next, venueKey(venueId)); } catch (_) {} }
    notify(venueId);
    return next;
  }
  function isConfigured(venueId) { return configured(get(venueId)); }

  var subs = new Set();
  function subscribe(fn) { subs.add(fn); return function () { subs.delete(fn); }; }
  function notify(venueId) { subs.forEach(function (fn) { try { fn(venueId); } catch (_) {} }); }
  try { if (window.KiwiStore && window.KiwiStore.subscribe) window.KiwiStore.subscribe('hours', notify); } catch (_) {}

  /* ═══════════ résolution : quelles périodes, tel jour ═══════════ */
  /* L'exception qui couvre cette date, s'il y en a une. La plus récemment
   * ajoutée gagne quand deux se chevauchent : c'est la dernière décision du
   * propriétaire, et c'est celle qu'il s'attend à voir appliquée. */
  function exceptionOn(doc, date) {
    var key = ymd(date), hit = null;
    (doc.exceptions || []).forEach(function (e) {
      if (key >= e.from && key <= e.to) hit = e;
    });
    return hit;
  }
  /* Les périodes d'ouverture DE cette date : l'exception si elle existe, sinon
   * la semaine type. Ne dit rien de ce qui déborde de la veille. */
  function periodsOn(doc, date) {
    var ex = exceptionOn(doc, date);
    if (ex) return { periods: ex.kind === 'closed' ? [] : ex.periods.slice(), exception: ex };
    var day = doc.week[DOW[date.getDay()]];
    return { periods: (day && day.open) ? (day.periods || []).slice() : [], exception: null };
  }
  /* Les créneaux ABSOLUS d'une date : [{start:ms, end:ms, exception}]. Une
   * période qui franchit minuit finit bien le lendemain — c'est ici, une seule
   * fois, que ce décalage est fait. */
  function absoluteOn(doc, date) {
    var base = midnight(date).getTime();
    var r = periodsOn(doc, date);
    return r.periods.map(function (p) {
      var a = toMin(p.from);
      var d = span(p);
      return { start: base + a * 60000, end: base + (a + d) * 60000, exception: r.exception, from: p.from, to: p.to };
    }).filter(function (s) { return s.end > s.start; });
  }
  /* Tous les créneaux susceptibles de contenir `t` ou de le suivre : la veille
   * (pour un service qui déborde), le jour même, et les suivants. */
  function window_(doc, t, daysAhead) {
    var out = [];
    var d0 = midnight(new Date(t));
    for (var i = -1; i <= (daysAhead == null ? 8 : daysAhead); i++) {
      var d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i);
      out = out.concat(absoluteOn(doc, d));
    }
    return out.sort(function (a, b) { return a.start - b.start; });
  }

  /* ═══════════ l'état à un instant ═══════════
   * La question que tout le produit pose. Réponse : ouvert ou non, jusqu'à
   * quand, ou à partir de quand — et « inconnu » quand rien n'est rempli. */
  function statusAt(ts, venueId) { return statusOf(get(venueId), ts); }
  /* La même chose sur un document EXPLICITE. L'éditeur de réglages en a besoin :
   * il doit montrer « Ouvert · ferme à 02:00 » pour la semaine en cours de
   * saisie, qui n'est pas encore enregistrée. Sans ça il faudrait écrire le
   * brouillon dans le magasin pour le résumer — c'est-à-dire publier à chaque
   * clic un horaire que le propriétaire n'a pas validé. */
  function statusOf(doc, ts) {
    doc = normalize(doc);
    var t = (ts instanceof Date) ? ts.getTime() : (+ts || Date.now());
    if (!configured(doc)) {
      return { known: false, open: false, configured: false, reason: 'unset', exception: null,
               closesAt: null, opensAt: null, minutesToClose: null };
    }
    var slots = window_(doc, t, 8);
    var cur = null, next = null;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].start <= t && t < slots[i].end) { cur = slots[i]; break; }
      if (slots[i].start > t && !next) next = slots[i];
    }
    /* Deux services collés (12:00–15:00 puis 15:00–19:00) : on prolonge la
     * fermeture jusqu'au bout de la chaîne, sinon « ferme à 15:00 » serait faux
     * pour un commerce qui ne ferme pas à 15:00. */
    if (cur) {
      var end = cur.end;
      for (var j = 0; j < slots.length; j++) {
        if (slots[j].start <= end && slots[j].end > end) { end = slots[j].end; j = -1; }
      }
      return {
        known: true, open: true, configured: true, reason: cur.exception ? 'exception' : 'week',
        exception: cur.exception || null, closesAt: end, opensAt: null,
        minutesToClose: Math.max(0, Math.round((end - t) / 60000)),
      };
    }
    var today = periodsOn(doc, new Date(t));
    return {
      known: true, open: false, configured: true,
      reason: today.exception ? 'exception' : (today.periods.length ? 'between' : 'closedDay'),
      exception: today.exception || null,
      closesAt: null, opensAt: next ? next.start : null, minutesToClose: null,
    };
  }
  function isOpenAt(ts, venueId) { var s = statusAt(ts, venueId); return s.known && s.open; }

  /* ═══════════ le résumé lisible ═══════════ */
  var SUM_T = {
    fr: { unset: 'Horaires non renseignés', openTill: function (h) { return 'Ouvert · ferme à ' + h; },
          open24: 'Ouvert 24 h/24', closedToday: 'Fermé aujourd’hui',
          opensAt: function (h) { return 'Ouvre à ' + h; }, opensOn: function (d, h) { return 'Ouvre ' + d + ' à ' + h; },
          exClosed: 'Fermé exceptionnellement', exHours: function (l) { return l ? 'Horaires ' + l : 'Horaires exceptionnels'; },
          closedAll: 'Fermé' },
    en: { unset: 'Opening hours not set', openTill: function (h) { return 'Open · closes at ' + h; },
          open24: 'Open 24 hours', closedToday: 'Closed today',
          opensAt: function (h) { return 'Opens at ' + h; }, opensOn: function (d, h) { return 'Opens ' + d + ' at ' + h; },
          exClosed: 'Closed exceptionally', exHours: function (l) { return l ? l + ' hours' : 'Special hours'; },
          closedAll: 'Closed' },
    ar: { unset: 'ساعات العمل غير محددة', openTill: function (h) { return 'مفتوح · يغلق في ' + h; },
          open24: 'مفتوح 24 ساعة', closedToday: 'مغلق اليوم',
          opensAt: function (h) { return 'يفتح في ' + h; }, opensOn: function (d, h) { return 'يفتح ' + d + ' في ' + h; },
          exClosed: 'مغلق استثنائيًا', exHours: function (l) { return l ? 'ساعات ' + l : 'ساعات استثنائية'; },
          closedAll: 'مغلق' },
  };
  function hhmm(ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function summary(ts, venueId, L) { return summaryOf(get(venueId), ts, L); }
  function summaryOf(doc, ts, L) {
    L = L || lang();
    var T = SUM_T[L] || SUM_T.fr;
    var t = (ts instanceof Date) ? ts.getTime() : (+ts || Date.now());
    var st = statusOf(doc, t);
    if (!st.configured) return { text: T.unset, tone: 'unset' };
    if (st.open) {
      /* 24 h : la fermeture est au-delà d'une journée pleine. */
      if (st.minutesToClose >= MIN_DAY - 1) return { text: T.open24, tone: 'open' };
      var txt = T.openTill(hhmm(st.closesAt));
      if (st.exception) txt += ' · ' + (st.exception.label || T.exHours(''));
      return { text: txt, tone: 'open' };
    }
    if (st.exception && st.exception.kind === 'closed') {
      return { text: st.exception.label ? T.exClosed + ' · ' + st.exception.label : T.exClosed, tone: 'closed' };
    }
    if (st.opensAt) {
      var same = ymd(new Date(st.opensAt)) === ymd(new Date(t));
      if (same) return { text: T.opensAt(hhmm(st.opensAt)), tone: 'soon' };
      var dl = (DAY_LABEL[L] || DAY_LABEL.fr)[DOW[new Date(st.opensAt).getDay()]];
      var tomorrow = ymd(new Date(st.opensAt)) === ymd(new Date(t + MIN_DAY * 60000));
      return { text: tomorrow ? T.closedToday + ' · ' + T.opensAt(hhmm(st.opensAt))
                              : T.opensOn(dl, hhmm(st.opensAt)), tone: 'closed' };
    }
    return { text: T.closedAll, tone: 'closed' };
  }

  /* ═══════════ créneaux réservables ═══════════
   * Réservations, Order Pro et la page client demandent tous « quelles heures
   * puis-je proposer le 12 août ? ». Une seule implémentation, ici.
   *   opts.step      pas en minutes (défaut 30)
   *   opts.lastOrder marge avant fermeture (défaut 0) — un service ne se
   *                  commande pas à la minute où la cuisine s'arrête.
   *   opts.after     n'émettre que les créneaux après cet instant */
  function slots(date, opts, venueId) {
    opts = opts || {};
    var doc = get(venueId);
    if (!configured(doc)) return [];
    var d = (date instanceof Date) ? date : (parseYmd(date) || new Date());
    var step = Math.max(5, +opts.step || 30);
    var last = Math.max(0, +opts.lastOrder || 0);
    var after = opts.after != null ? ((opts.after instanceof Date) ? opts.after.getTime() : +opts.after) : null;
    var out = [];
    absoluteOn(doc, d).forEach(function (s) {
      var limit = s.end - last * 60000;
      /* Aligner sur le pas depuis l'ouverture, pas depuis minuit : un service
       * qui ouvre à 12:15 propose 12:15, 12:45 — pas 12:30. */
      for (var t = s.start; t <= limit; t += step * 60000) {
        /* L'heure de fermeture elle-même n'est JAMAIS un créneau : un service
         * de 12:00 à 15:00 se réserve jusqu'à 14:30, pas à 15:00. La borne
         * haute d'une période est exclue partout ailleurs (statusAt), elle doit
         * l'être ici aussi — sinon Réservations proposerait poliment une table
         * à l'heure où l'on éteint les lumières. */
        if (t >= s.end) break;
        if (after != null && t < after) continue;
        out.push({ at: t, label: hhmm(t), exception: !!s.exception });
      }
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  /* La question fermée que posent les surfaces client : « puis-je servir à
   * cette heure ? ». Répond aussi POURQUOI non — l'exigence explicite du
   * produit est de ne jamais refuser sans expliquer. */
  function canServeAt(ts, venueId, opts) {
    opts = opts || {};
    var t = (ts instanceof Date) ? ts.getTime() : (+ts || Date.now());
    var st = statusAt(t, venueId);
    var L = opts.lang || lang();
    if (!st.configured) return { ok: false, why: 'unset', text: (SUM_T[L] || SUM_T.fr).unset, status: st };
    var last = Math.max(0, +opts.lastOrder || 0);
    if (st.open && (last === 0 || st.minutesToClose >= last)) return { ok: true, why: 'open', text: '', status: st };
    return { ok: false, why: st.open ? 'tooLate' : (st.exception ? 'exception' : 'closed'),
             text: summary(t, venueId, L).text, status: st };
  }

  /* ═══════════ la journée commerciale ═══════════
   * Le rapport journalier découpe les ventes par « journée commerciale » et non
   * par jour calendaire, via une heure de bascule. Cette heure était réglée à
   * la main (5 h par défaut) ; l'établissement sait désormais lui-même à quelle
   * heure il ferme, alors autant le lui demander.
   *
   * Règle de sûreté : cette dérivation ne RACCOURCIT jamais la bascule. Un
   * commerce déjà en service tourne avec 5 h ; passer soudain à 0 h couperait
   * une soirée en cours en deux journées. On prend donc le maximum entre
   * l'existant et ce que dit l'horaire, jamais le minimum. */
  function derivedCutoff(venueId, floor) {
    var doc = get(venueId);
    if (!configured(doc)) return null;
    var latest = 0;                      /* minutes après minuit d'une fin de nuit */
    var scan = function (periods) {
      (periods || []).forEach(function (p) {
        var a = toMin(p.from); if (a == null) return;
        var e = a + span(p);
        if (e > MIN_DAY) latest = Math.max(latest, e - MIN_DAY);
      });
    };
    DAYS.forEach(function (d) { if (doc.week[d] && doc.week[d].open) scan(doc.week[d].periods); });
    (doc.exceptions || []).forEach(function (e) { if (e.kind === 'hours') scan(e.periods); });
    if (!latest) return null;            /* aucun service de nuit : rien à dire */
    /* +1 h de battement : le Z se tape après le dernier client, pas pendant. */
    var h = Math.ceil(latest / 60) + 1;
    return Math.max(+floor || 0, Math.min(12, h));
  }

  /* ═══════════ dérogation tracée ═══════════
   * Un responsable peut servir hors horaires — un groupe qui s'attarde, une
   * livraison convenue. Ce n'est pas un contournement silencieux : ça
   * s'enregistre, avec qui et pourquoi, et ça expire tout seul. */
  function override(opts, venueId) {
    opts = opts || {};
    var doc = get(venueId);
    var mins = Math.min(720, Math.max(5, +opts.minutes || 60));
    var rec = { at: Date.now(), until: Date.now() + mins * 60000,
                by: String(opts.by || '').slice(0, 60), reason: String(opts.reason || '').slice(0, 120) };
    doc.overrides = (doc.overrides || []).slice(-19);
    doc.overrides.push(rec);
    set(doc, venueId);
    return rec;
  }
  function activeOverride(venueId) {
    var doc = get(venueId);
    var now = Date.now();
    var hit = null;
    (doc.overrides || []).forEach(function (o) { if (+o.until > now) hit = o; });
    return hit;
  }

  /* ═══════════ helpers de présentation ═══════════ */
  /* « Lun–Ven 09:00–13:00, 15:00–19:00 · Sam 09:00–13:00 · Dim fermé » —
   * les jours identiques et consécutifs sont regroupés. */
  function weekText(venueId, L) {
    L = L || lang();
    var doc = get(venueId);
    if (!configured(doc)) return (SUM_T[L] || SUM_T.fr).unset;
    var sh = DAY_SHORT[L] || DAY_SHORT.fr;
    var sig = function (d) {
      var day = doc.week[d];
      if (!day || !day.open || !day.periods.length) return '';
      return day.periods.map(function (p) { return p.from + '–' + p.to; }).join(', ');
    };
    var out = [], run = null;
    DAYS.forEach(function (d) {
      var s = sig(d);
      if (run && run.sig === s) { run.end = d; return; }
      if (run) out.push(run);
      run = { sig: s, start: d, end: d };
    });
    if (run) out.push(run);
    var closed = (SUM_T[L] || SUM_T.fr).closedAll;
    return out.map(function (r) {
      var label = r.start === r.end ? sh[r.start] : sh[r.start] + '–' + sh[r.end];
      return label + ' ' + (r.sig || closed);
    }).join(' · ');
  }

  window.KiwiHours = {
    /* données */
    get: get, set: set, blank: blank, normalize: normalize,
    isConfigured: isConfigured, subscribe: subscribe,
    /* interrogation */
    statusAt: statusAt, isOpenAt: isOpenAt, summary: summary, weekText: weekText,
    /* les mêmes, sur un document non enregistré (l'éditeur de réglages) */
    statusOf: statusOf, summaryOf: summaryOf, configured: configured,
    periodsOn: function (date, venueId) { return periodsOn(get(venueId), (date instanceof Date) ? date : (parseYmd(date) || new Date())); },
    slotsFor: slots, canServeAt: canServeAt,
    exceptionOn: function (date, venueId) { return exceptionOn(get(venueId), (date instanceof Date) ? date : (parseYmd(date) || new Date())); },
    /* journée commerciale + dérogations */
    derivedCutoff: derivedCutoff, override: override, activeOverride: activeOverride,
    /* vocabulaire, pour l'éditeur et les appelants */
    DAYS: DAYS.slice(), STEP: STEP,
    dayLabel: function (d, L) { return (DAY_LABEL[L || lang()] || DAY_LABEL.fr)[d] || d; },
    dayShort: function (d, L) { return (DAY_SHORT[L || lang()] || DAY_SHORT.fr)[d] || d; },
    toMin: toMin, fromMin: fromMin, span: span, ymd: ymd,
  };
}());
