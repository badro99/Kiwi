/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · PROMOTIONS — window.KiwiPromos
 * ---------------------------------------------------------------------------
 * Le moteur de promotions de la boutique. Une promotion n'est PAS une remise :
 * une remise est un geste (la gérante accorde −10 % à cette cliente-ci, sur ce
 * ticket-là) ; une promotion est une RÈGLE que le magasin pose une fois et qui
 * s'applique toute seule, à tous les articles qu'elle vise, pendant toute sa
 * durée, sans que personne au comptoir ait à s'en souvenir.
 *
 * C'est pour ça que ce fichier existe à côté d'assets/pos-boutique.js plutôt
 * que dedans : les règles de prix doivent être lisibles et vérifiables SANS
 * navigateur (voir tools/promos-test.js). Aucun DOM ici, uniquement la règle.
 *
 * ── Ce qu'une promotion peut viser ────────────────────────────────────────
 *   tout      · tout le magasin
 *   rayon     · un ou plusieurs rayons
 *   produits  · des articles choisis un par un
 *   avant     · tout ce qui est entré en stock avant une date  (déstockage)
 *   stock     · tout ce qui descend à N pièces ou moins        (fins de série)
 *
 * ── LA RÈGLE QUI COMPTE : deux promotions sur un même article ─────────────
 * Elles ne s'additionnent JAMAIS. Le prix le PLUS BAS pour la cliente gagne,
 * et lui seul. C'est le seul arbitrage qu'une caissière peut défendre devant
 * quelqu'un qui a lu les deux affiches en vitrine : « c'est la meilleure des
 * deux qui s'applique ». Prendre la dernière créée, ou les cumuler, produit un
 * prix que personne ne sait expliquer — et, en cumulé, des tickets à zéro.
 * À prix égal, c'est la plus ancienne qui l'emporte : l'affichage ne saute pas
 * quand le commerçant crée une promotion équivalente.
 *
 * La remise gérante, elle, reste possible PAR-DESSUS le prix promo (c'est un
 * geste d'autorité, le refuser en silence serait pire) — mais pos-boutique.js
 * l'affiche alors ligne à ligne, les deux baisses nommées séparément.
 *
 * ── Quand : des dates, et si l'on veut des jours et des heures ───────────
 *   from / to · premier et dernier instant (0 = sans borne) ;
 *   days      · jours de la semaine (0 = dimanche), vide = tous ;
 *   start/end · heures « HH:MM » de chaque jour, vides = toute la journée.
 * « Le mardi », « de 12:00 à 14:00 », « le week-end » : en heure de
 * Casablanca et sur la journée d'exploitation de la caisse (elle commence à
 * 05:00), pour qu'une fenêtre 22:00–01:00 du vendredi compte encore pour le
 * vendredi à 00:30, exactement comme les promotions de la carte
 * (assets/menu-promos.js). Hors de sa fenêtre, une promotion est « en
 * attente » : elle n'est pas finie, elle reprend au prochain créneau.
 *
 * Les prix sont des ENTIERS de dirhams, comme partout ailleurs dans la caisse.
 * Une promotion ne peut pas descendre un prix sous zéro.
 *
 * Persistance : par magasin (comme le catalogue), et remontée au serveur via
 * assets/cloud-doc.js — une promotion posée depuis le bureau doit atteindre le
 * comptoir, et une caisse qui l'ignore vendrait au prix fort pendant que la
 * vitrine annonce −30 %.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DEMO_VENUE = 'maisonMansour';
  var keyFor = function (v) { return 'kiwi:bqPromos:v1:' + v; };
  var VENUE = DEMO_VENUE;
  var KEY = keyFor(VENUE);

  var db = null;              /* { v, promos:[], deleted:[] } */
  var subs = new Set();
  var doc = null;             /* poignée cloud-doc */
  var batching = 0, dirty = false;

  function blank() { return { v: 1, promos: [], deleted: [] }; }

  function load() {
    if (db) return db;
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      db = (raw && typeof raw === 'object' && Array.isArray(raw.promos)) ? raw : blank();
      if (!Array.isArray(db.deleted)) db.deleted = [];
    } catch (_) { db = blank(); }
    return db;
  }

  /* Ce que la dernière écriture a vraiment donné. Avant, l'exception de
     localStorage (quota plein, navigation privée) était avalée et la remontée
     partait sans qu'on l'attende : l'écran annonçait « la caisse est à jour »
     pour une promotion qui pouvait n'exister ni sur cet appareil ni au
     serveur. Désormais :
       · `localKept`  : la copie locale a-t-elle pris ? (lue par durable())
       · lastCommit() : { local, server } ; `server` est la PROMESSE du
         résultat de l'envoi (cloud-doc pushNow), null sans copie serveur.
     Un échec local émet « kiwi:local-save » { store:'promos', durable:false },
     et la première écriture qui reprend émet { durable:true }. La mémoire, elle,
     garde toujours la promotion : la caisse continue de l'appliquer. */
  var localKept = true;
  var last = { local: true, server: Promise.resolve(null) };
  function writeLocal() {
    var ok = false;
    try { localStorage.setItem(KEY, JSON.stringify(db)); ok = true; } catch (_) {}
    var was = localKept;
    localKept = ok;
    if (!(ok && was)) {
      try {
        if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
          window.dispatchEvent(new CustomEvent('kiwi:local-save', { detail: { store: 'promos', key: KEY, durable: ok } }));
        }
      } catch (_) {}
    }
    return ok;
  }
  function pushServer() {
    if (!doc) return Promise.resolve(null);
    /* pushNow rend la réponse du serveur ; on lit d'abord sa copie (bind) pour
       ne jamais pousser à l'aveugle. Une poignée qui ne sait que push() (plus
       ancienne, ou un banc d'essai) garde l'envoi différé, sans résultat. */
    if (typeof doc.pushNow === 'function') {
      return Promise.resolve()
        .then(function () { return typeof doc.bind === 'function' ? doc.bind() : null; })
        .then(function () { return doc.pushNow(); }, function () { return doc.pushNow(); })
        .then(function (res) { return res || null; }, function (e) { return { ok: false, status: 0, error: String(e) }; });
    }
    if (doc.push) { try { doc.push(); } catch (_) {} }
    return Promise.resolve(null);
  }
  function commit() {
    if (batching) { dirty = true; return last; }
    var ok = writeLocal();
    subs.forEach(function (fn) { try { fn(); } catch (_) {} });
    last = { local: ok, server: pushServer() };
    return last;
  }
  function batch(fn) {
    batching++;
    try { fn(); } finally {
      batching--;
      if (!batching && dirty) { dirty = false; commit(); }
    }
  }

  function use(venueId) {
    var v = venueId || DEMO_VENUE;
    if (v === VENUE) return;
    VENUE = v; KEY = keyFor(v); db = null;
    load();
    subs.forEach(function (fn) { try { fn(); } catch (_) {} });
  }

  /* ───────────────────────── normalisation ─────────────────────────
     Tout ce qui entre — saisie d'écran, document venu du serveur, copie
     restaurée d'une version antérieure — repasse par ici. Une promotion mal
     formée ne doit pas pouvoir fausser un prix : à la moindre valeur illisible
     on retombe sur quelque chose d'inoffensif (0 %, aucune cible). */
  var rules = window.KiwiPromoRules;
  var SCOPES = ['tout', 'rayon', 'produits', 'avant', 'stock'];
  var seq = 0;

  function newId() {
    seq++;
    return 'pr_' + Math.random().toString(36).slice(2, 8) + seq.toString(36);
  }
  function num(v, dflt) { var n = +v; return Number.isFinite(n) ? n : (dflt || 0); }
  function str(v) { return String(v == null ? '' : v); }

  /* ───────────────────────── l'horloge de la caisse ─────────────────────────
     Heure de Casablanca, jamais celle de l'appareil : une tablette réglée sur
     Paris ouvrirait le « midi » à 11:00. La journée commence à 05:00. */
  var BUSINESS_DAY_START_MIN = 300;
  var toMin = rules.toMin;
  function businessMoment(now) {
    var b = rules.businessMoment(now);
    return { weekday: b.weekday, min: b.min };
  }
  function hasWindow(p) { return !!((p.days && p.days.length) || (p.start && p.end)); }

  function normalize(p) {
    p = p || {};
    var common = rules.normalize(p, 'boutique');
    var kind = common.kind, value = common.value;
    var sc = (p.scope && typeof p.scope === 'object') ? p.scope : {};
    var type = SCOPES.indexOf(sc.type) >= 0 ? sc.type : 'tout';
    var scope = { type: type };
    if (type === 'rayon' || type === 'produits') {
      scope.ids = Array.isArray(sc.ids) ? sc.ids.map(str).filter(Boolean) : [];
    }
    /* `avant` sans date ne vise RIEN (et non pas « tout ») : une cible vide qui
       se lit comme le magasin entier, c'est le magasin bradé par accident. */
    if (type === 'avant') scope.before = num(sc.before, 0);
    if (type === 'stock') scope.max = Math.max(0, Math.round(num(sc.max, 0)));
    var days = common.days, start = common.start, end = common.end;
    return {
      id: str(p.id) || newId(),
      name: str(p.name).slice(0, 80) || 'Promotion',
      badge: str(p.badge).slice(0, 24),
      kind: kind,
      value: value,
      scope: scope,
      from: num(p.from, 0) || 0,          /* 0 = démarre tout de suite */
      to: num(p.to, 0) || 0,              /* 0 = sans date de fin */
      days: days.length === 7 ? [] : days, /* vide = tous les jours */
      start: start, end: end,             /* vides = toute la journée */
      paused: !!p.paused,
      createdAt: num(p.createdAt, 0) || Date.now(),
      updatedAt: num(p.updatedAt, 0) || Date.now(),
    };
  }

  /* Le libellé porté par l'article en rayon. Dérivé quand le commerçant n'a
     rien écrit, pour qu'une pastille ne soit jamais vide sur une carte. */
  function badgeOf(p) {
    if (p.badge) return p.badge;
    if (p.kind === 'percent') return '−' + p.value + ' %';
    if (p.kind === 'amount') return '−' + p.value + ' MAD';
    return p.value + ' MAD';
  }

  /* ───────────────────────── état dans le temps ─────────────────────────
     Jamais stocké : un état rangé en base est un état qui ment dès le
     lendemain matin. On le recalcule à chaque lecture, à partir des dates. */
  function status(p, now) {
    return rules.status(p, now || Date.now(), 'boutique');
  }

  /* Le prochain créneau d'une promotion en attente, dit comme on le dirait au
     comptoir : { day: 0 (aujourd'hui) … 7, weekday, at: 'HH:MM' | '' }.
     null quand elle n'a pas de fenêtre ou qu'elle ne reprendra pas. */
  function nextWindow(p, now) {
    p = normalize(p);
    now = now || Date.now();
    if (!hasWindow(p) || p.paused) return null;
    var b = businessMoment(now);
    /* En minutes depuis 05:00 : à 02:00, la journée a commencé hier matin et
       son 22:00 est derrière nous, pas devant. */
    var since = function (m) { return (m - BUSINESS_DAY_START_MIN + 1440) % 1440; };
    var a = toMin(p.start);
    var nowB = since(b.min);
    var atB = a == null ? 0 : since(a);
    for (var k = 0; k <= 7; k++) {
      var wd = (b.weekday + k) % 7;
      if (p.days.length && p.days.indexOf(wd) < 0) continue;
      if (k === 0 && (a == null || nowB >= atB)) continue;     /* déjà passé aujourd'hui */
      var when = now + k * 86400000 + (atB - nowB) * 60000;
      if (p.to && when > p.to) return null;
      return { day: k, weekday: wd, at: p.start || '' };
    }
    return null;
  }
  var isRunning = function (p, now) { return status(p, now) === 'active'; };

  /* ───────────────────────── l'horloge des écritures ─────────────────────────
     La fusion arbitre par `updatedAt` (et une pierre tombale par `at`). Pris tel
     quel sur l'horloge de l'appareil, une caisse en retard de trois heures
     datait sa modification SOUS celle qu'elle venait de recevoir du bureau : la
     fusion suivante rendait l'ancienne règle, ou réactivait une promotion
     qu'elle venait de mettre en pause. Horloge hybride : chaque écriture prend
     le plus grand de l'heure murale et du plus grand instant déjà vu + 1 (vu =
     tout ce que porte le document, donc tout ce que la fusion nous a appris).
     Un geste fait APRÈS avoir vu celui d'un autre appareil est donc toujours
     daté après lui, quelle que soit l'heure affichée. Le champ reste un nombre :
     les documents d'avant se fusionnent comme avant.
     Garde-fou : un instant vu qui n'est pas un nombre fini, ou qui dépasse de
     plus de 24 h l'heure de cet appareil (un poste réglé en 2099, un document
     abîmé), ne fait PAS avancer l'horloge. Sans ça, un seul appareil faux
     entraînait toutes les caisses dans son futur, pour toujours. L'enregistrement
     reste dans les données et la fusion l'arbitre comme avant ; il ne date
     simplement plus les gestes des autres. */
  var hlc = 0;
  var CLOCK_AHEAD = 24 * 3600 * 1000;
  function sane(t, lim) { t = +t; return (Number.isFinite(t) && t > 0 && t <= lim) ? t : 0; }
  function seenMax(d, lim) {
    var m = 0;
    ((d && d.promos) || []).forEach(function (p) { var t = sane(p && p.updatedAt, lim); if (t > m) m = t; });
    ((d && d.deleted) || []).forEach(function (x) { var t = sane(x && x.at, lim); if (t > m) m = t; });
    return m;
  }
  function stamp() {
    load();
    var wall = Date.now(), lim = wall + CLOCK_AHEAD;
    var t = Math.max(wall, seenMax(db, lim) + 1, sane(hlc, lim) + 1);
    hlc = t;
    return t;
  }
  /* La règle touchée, elle, passe toujours après sa propre copie, même datée
     au-delà des 24 h (un poste honnête mais mal réglé de deux jours) : sinon
     le geste fait ici céderait devant la copie qu'il vient de modifier. Cet
     instant-là ne nourrit pas l'horloge. */
  function stampAbove() {
    var t = stamp();
    for (var i = 0; i < arguments.length; i++) { var x = +arguments[i]; if (Number.isFinite(x) && x >= t) t = x + 1; }
    return t;
  }
  function tombAt(id) { var at = 0; db.deleted.forEach(function (d) { if (d && d.id === id) at = Math.max(at, num(d.at, 0)); }); return at; }

  function list() { load(); return db.promos.map(normalize); }
  function get(id) { load(); var p = db.promos.find(function (x) { return x.id === id; }); return p ? normalize(p) : null; }
  function active(now) { return list().filter(function (p) { return isRunning(p, now); }); }

  function save(patch) {
    load();
    var next = normalize(patch);
    var i = db.promos.findIndex(function (x) { return x.id === next.id; });
    next.updatedAt = stampAbove(i >= 0 ? db.promos[i].updatedAt : 0, tombAt(next.id));
    if (i >= 0) { next.createdAt = num(db.promos[i].createdAt, next.createdAt); db.promos[i] = next; }
    else db.promos.push(next);
    /* Ressusciter une promotion supprimée ailleurs : on lève la pierre tombale,
       sinon la fusion suivante la re-supprimerait dans le dos du commerçant. */
    db.deleted = db.deleted.filter(function (d) { return d.id !== next.id; });
    commit();
    return next;
  }

  /* Une suppression laisse une trace datée. Sans elle, la caisse d'à côté
     renverrait la promotion effacée au prochain échange, indéfiniment — c'est
     exactement ce qui arrivait aux articles de stock.js avant `delItems`. */
  function remove(id) {
    load();
    /* Daté AVANT de retirer la règle : son propre `updatedAt` compte parmi ce
       que l'appareil a vu, et la pierre tombale doit passer après lui. */
    var cur = db.promos.find(function (x) { return x.id === id; });
    var at = stampAbove(cur ? cur.updatedAt : 0);
    var before = db.promos.length;
    db.promos = db.promos.filter(function (x) { return x.id !== id; });
    if (db.promos.length === before) return false;
    db.deleted.push({ id: id, at: at });
    commit();
    return true;
  }
  function setPaused(id, val) {
    load();
    var p = db.promos.find(function (x) { return x.id === id; });
    if (!p) return null;
    p.paused = !!val;
    p.updatedAt = stampAbove(p.updatedAt);
    commit();
    return normalize(p);
  }

  /* ───────────────────────── la cible ─────────────────────────
     `item` est un article du catalogue tel que KiwiBoutiqueCatalog.compat() le
     rend : { id, rayon, price, cost, createdAt, sizes }. `stock` est passé à
     part parce que la caisse tient une projection vivante (les articles retenus
     par le ticket en cours) que le catalogue ne connaît pas encore. */
  /* GENERATED SHARED KiwiPromotionPricing BEGIN */
  /* Copy of functions/api/_rules-promotion-pricing.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiPromotionPricing = (function () {
    const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const toMin = (s) => { var m = HHMM.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; }
    const money = (v) => { var n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0; }
    const down = (n) => { return Math.max(0, Math.floor(n * 100 + 1e-6) / 100); }
    const normalize = (p, surface) => {
        var kind = ['percent', 'amount', 'fixed'].indexOf(p.kind) >= 0 ? p.kind : 'percent';
        var value = money(p.value);
        if (kind === 'percent') value = Math.min(100, value); /* kept to the centime (12.5 % stays 12.5 %), like every amount */
        var days = (Array.isArray(p.days) ? p.days : []).map(Number).filter(function (d, i, a) {
          return Number.isInteger(d) && d >= 0 && d <= 6 && a.indexOf(d) === i;
        }).sort(function (a, b) { return a - b; });
        var start = HHMM.test(p.start || '') ? p.start : '';
        var end = HHMM.test(p.end || '') ? p.end : '';
        if (!start || !end || start === end) { start = ''; end = ''; }
        return { kind: kind, value: value, days: days.length === 7 ? [] : days, start: start, end: end };
      }
    const inWindow = (p, b) => {
        if (p.days && p.days.length && p.days.indexOf(b.weekday) < 0) return false;
        var s = toMin(p.start), e = toMin(p.end);
        if (s == null || e == null) return true;
        return s < e ? b.min >= s && b.min < e : b.min >= s || b.min < e;
      }
    const price = (p, unit, surface) => {
        var base = money(unit);
        var out = base;
        if (p.kind === 'percent') out = Math.round(Math.round(base * 100) * (100 - p.value) / 100 + 1e-9) / 100;
        else if (p.kind === 'amount') out = base - p.value;
        else out = p.value;
        return Math.min(base, money(out));
      }
    const statusAt = (p, at, moment) => {
      if (!p) return 'ended';
      if (p.paused) return 'paused';
      if (p.to && at > p.to) return 'ended';
      if (p.from && at < p.from) return 'scheduled';
      if (!p.days?.length && !(p.start && p.end)) return 'active';
      return inWindow(p, moment) ? 'active' : 'waiting';
    }
    const lineDeal = (line, fullPrice, live) => {
      const stamp = (line && line.promo && Number.isFinite(+line.promo.price))
        ? { ...line.promo, price: down(line.promo.price) } : null;
      let best = { price: down(+fullPrice || 0), promo: null };
      if (stamp && stamp.price < best.price) best = { price: stamp.price, promo: stamp };
      if (live && live.price < best.price) best = { price: live.price,
        promo: { price: live.price, badge: live.badge, name: live.promo.name, id: live.promo.id } };
      return best;
    }
    const lineUnit = (base, remise) => { return down(+(base * (100 - remise) / 100) || 0); }
    const appliesMenu = (p, line) => {
      if (!line || line.kind === 'formula' || line.kind === 'formula-part') return false;
      if (p.all) return true;
      if (line.itemId && p.items.indexOf(String(line.itemId)) >= 0) return true;
      return !!line.catId && p.cats.indexOf(String(line.catId)) >= 0;
    }
    const resolveMenu = (promos, line, unit, moment) => {
      const base = money(unit);
      if (!(base > 0) || !Array.isArray(promos) || !promos.length) return null;
      let best = null;
      for (const p of promos) {
        if (!appliesMenu(p, line) || statusAt(p, moment.date, moment) !== 'active') continue;
        const value = price(p, base);
        if (value >= base) continue;
        best = choosePromotion(best, { price: value, promo: p }, true);
      }
      if (!best) return null;
      const p = best.promo;
      const badge = p.kind === 'percent' ? '−' + p.value + ' %' : p.kind === 'amount'
        ? '−' + String(p.value).replace('.', ',') + ' MAD' : String(p.value).replace('.', ',') + ' MAD';
      return { price: best.price, promo: { id: p.id, name: p.name, badge, before: base } };
    }
    const stockOf = (item) => {
        if (!item || !item.sizes) return 0;
        return Object.keys(item.sizes).reduce(function (s, k) { return s + (+item.sizes[k] || 0); }, 0);
      }
    const toTs = (v) => {
        if (!v) return 0;
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        var t = new Date(v).getTime();
        return Number.isFinite(t) ? t : 0;
      }
    const matches = (p, item, stock) => {
        if (!p || !item) return false;
        var sc = p.scope || {};
        if (sc.type === 'tout') return true;
        if (sc.type === 'rayon') return (sc.ids || []).indexOf(item.rayon) >= 0 || (!!item.uncat && (sc.ids || []).indexOf('_uncat') >= 0);
        if (sc.type === 'produits') return (sc.ids || []).indexOf(item.id) >= 0;
        if (sc.type === 'avant') {
          var bef = toTs(sc.before);
          var itAt = toTs(item.createdAt);
          return !!bef && !!itAt && itAt < bef;
        }
        if (sc.type === 'stock') {
          var n = (stock == null) ? stockOf(item) : stock;
          /* Un article épuisé ne porte pas d'affiche « fin de série » : la pastille
             promettrait un prix sur une étagère vide. */
          return n > 0 && n <= (sc.max || 0);
        }
        return false;
      }
    const choosePromotion = (best, candidate, zeroAge = false) => {
      const age = p => zeroAge ? (p.createdAt || 0) : p.createdAt;
      return !best || candidate.price < best.price || (candidate.price === best.price && age(candidate.promo) < age(best.promo)) ? candidate : best;
    }
    return { toMin, money, down, normalize, inWindow, price, statusAt, lineDeal, lineUnit, appliesMenu, resolveMenu, stockOf, toTs, matches, choosePromotion };
  })();
  /* GENERATED SHARED KiwiPromotionPricing END */
  var stockOf = KiwiPromotionPricing.stockOf, matches = KiwiPromotionPricing.matches;

  /* Vers le bas, jamais au plus proche : un article affiché 249,90 se compte
     249, et −10 % sur 245 fait 220, pas 221. Arrondir au plus proche
     encaissait parfois plus que le prix affiché (décision propriétaire,
     2026-10-19 : jamais au-dessus du prix en rayon). L'epsilon absorbe les
     erreurs de virgule flottante, jamais un vrai centime. */
  var down = rules.down;
  function applyTo(p, price) { return rules.price(p, price, 'boutique'); }

  /* Le prix effectif d'un article, et la promotion qui l'explique.
     Rend null quand rien ne s'applique — l'appelant garde alors son prix
     catalogue, ce qui est le comportement d'avant ce fichier. */
  function priceFor(item, opts) {
    opts = opts || {};
    if (!item) return null;
    var now = opts.now || Date.now();
    var stock = opts.stock;
    var was = down(num(item.price, 0));
    var best = null;
    list().forEach(function (p) {
      if (!isRunning(p, now)) return;
      if (!matches(p, item, stock)) return;
      var price = applyTo(p, was);
      if (price >= was) return;               /* une promotion qui ne baisse rien n'existe pas */
      best = KiwiPromotionPricing.choosePromotion(best, { price: price, was: was, off: was - price, promo: p, badge: badgeOf(p) });
    });
    return best;
  }

  /* Ce que la promotion coûterait au magasin sur un catalogue donné — la
     réponse que le commerçant veut AVANT d'enregistrer, pas après. `under` est
     le nombre d'articles qui passeraient sous leur prix d'achat : déstocker à
     perte est une décision légitime, la prendre sans le savoir ne l'est pas. */
  function preview(p, items, opts) {
    opts = opts || {};
    var norm = normalize(p);
    var out = { count: 0, under: 0, from: 0, to: 0, sample: [] };
    (items || []).forEach(function (item) {
      if (!matches(norm, item, opts.stockOf ? opts.stockOf(item) : null)) return;
      var was = down(num(item.price, 0));
      var price = applyTo(norm, was);
      if (price >= was) return;
      out.count++;
      out.from += was;
      out.to += price;
      var cost = num(item.cost, 0);
      if (cost > 0 && price < cost) out.under++;
      if (out.sample.length < 8) out.sample.push({ id: item.id, name: item.name, was: was, price: price, under: cost > 0 && price < cost });
    });
    return out;
  }

  /* ───────────────────────── fusion multi-caisses ─────────────────────────
     mergeDefault() de cloud-doc.js unit les listes par identifiant mais garde
     TOUJOURS notre version en cas de conflit : la promotion corrigée au bureau
     n'atteindrait jamais le comptoir. On arbitre donc par `updatedAt`, et deux
     suppressions s'additionnent au lieu de s'annuler (même raison que
     `delItems` dans assets/stock.js). */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v) || 'null';
  }
  function merge(mine, theirs) {
    if (!theirs) return mine;
    if (!mine) return theirs;
    var tomb = Object.create(null);
    var deleted = [];
    [mine.deleted, theirs.deleted].forEach(function (arr) {
      (Array.isArray(arr) ? arr : []).forEach(function (d) {
        if (!d || !d.id) return;
        var at = num(d.at, 0);
        if (!tomb[d.id] || at > tomb[d.id]) tomb[d.id] = at;
      });
    });
    Object.keys(tomb).forEach(function (id) { deleted.push({ id: id, at: tomb[id] }); });

    var by = Object.create(null);
    [mine.promos, theirs.promos].forEach(function (arr) {
      (Array.isArray(arr) ? arr : []).forEach(function (raw) {
        var p = normalize(raw);
        var cur = by[p.id];
        /* À `updatedAt` égal, le premier venu gagnait : « mine » sur un appareil,
           « theirs » sur l'autre, donc deux copies différentes ne convergeaient
           jamais. On départage sur le contenu (clés triées) : la plus grande
           chaîne l'emporte, identique sur tous les appareils. */
        if (!cur || p.updatedAt > cur.updatedAt ||
            (p.updatedAt === cur.updatedAt && canon(p) > canon(cur))) by[p.id] = p;
      });
    });
    var promos = Object.keys(by)
      .map(function (id) { return by[id]; })
      /* Une pierre tombale ne l'emporte que si elle est POSTÉRIEURE à la
         dernière modification : sinon rouvrir une promotion supprimée hier
         serait impossible. */
      .filter(function (p) { return !(tomb[p.id] && tomb[p.id] >= p.updatedAt); })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });

    return { v: 1, promos: promos, deleted: deleted };
  }

  function isEmpty(d) {
    return !d || (!(d.promos && d.promos.length) && !(d.deleted && d.deleted.length));
  }

  function cloud(slugFn) {
    if (doc || !window.KiwiCloudDoc) return doc;
    doc = window.KiwiCloudDoc.attach({
      /* Must match functions/api/store.js. `promos` was rejected as an unknown
       * feature, so rules appeared locally but never reached another device. */
      feature: 'promotions',
      slug: slugFn || window.KiwiCloudDoc.currentSlug,
      localKey: function () { return VENUE; },
      read: function () { load(); return db; },
      write: function (d) {
        db = (d && Array.isArray(d.promos)) ? d : blank();
        if (!Array.isArray(db.deleted)) db.deleted = [];
        writeLocal();
        subs.forEach(function (fn) { try { fn(); } catch (_) {} });
      },
      merge: merge,
      isEmpty: isEmpty,
    });
    return doc;
  }

  function stats(now) {
    var all = list();
    var n = now || Date.now();
    return {
      total: all.length,
      active: all.filter(function (p) { return status(p, n) === 'active'; }).length,
      scheduled: all.filter(function (p) { return status(p, n) === 'scheduled'; }).length,
      waiting: all.filter(function (p) { return status(p, n) === 'waiting'; }).length,
      paused: all.filter(function (p) { return status(p, n) === 'paused'; }).length,
      ended: all.filter(function (p) { return status(p, n) === 'ended'; }).length,
    };
  }

  window.KiwiPromos = {
    use: use, currentVenue: function () { return VENUE; }, demoVenue: DEMO_VENUE,
    load: load, batch: function (fn) { load(); batch(fn); },
    subscribe: function (fn) { load(); subs.add(fn); return function () { subs.delete(fn); }; },
    list: list, get: get, active: active, save: save, remove: remove, setPaused: setPaused,
    status: status, isRunning: isRunning, badgeOf: badgeOf, normalize: normalize,
    nextWindow: nextWindow, hasWindow: hasWindow, businessMoment: businessMoment,
    matches: matches, applyTo: applyTo, priceFor: priceFor, preview: preview, stockOf: stockOf,
    merge: merge, isEmpty: isEmpty, cloud: cloud, stats: stats,
    durable: function () { return localKept; },
    lastCommit: function () { return last; },
    reset: function () { db = blank(); commit(); },
  };
})();
