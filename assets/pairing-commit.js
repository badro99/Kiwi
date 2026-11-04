/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · POSER UN APPAIRAGE — window.KiwiPairingCommit
 * ---------------------------------------------------------------------------
 * Écrire l'appairage, ce n'est pas écrire quatre clés. C'est aussi CONSTATER
 * que l'appareil change de commerçant, et faire partir ce qui appartenait au
 * précédent. Les quatre écritures sont la partie visible ; la purge est la
 * partie qui protège.
 *
 * POURQUOI CE FICHIER EXISTE. La règle vivait dans applyPairing()
 * (assets/caisse-pairing.js), où elle est née avec la caisse. Mais la caisse
 * n'est pas le seul appareil qui s'appaire : kiwi-cuisine.html a son propre
 * redeem(), qui POSTe sur la même route et écrivait les mêmes quatre clés —
 * sans la détection de changement, sans la purge. Une tablette du passe
 * ré-appairée du restaurant A au restaurant B gardait donc, sous le nom de B,
 * tout l'état local de A : ventes (kiwiSales:*), catalogue, établissements,
 * service en cours. Même origine que la caisse, mêmes clés, aucune serrure.
 *
 * C'est exactement la leçon de assets/tenant-purge.js — « deux portes et une
 * seule serrure » — d'un cran plus haut : là-bas on a partagé la LISTE des
 * clés, ici on partage le GESTE qui les efface. Y ajouter une garde la fait
 * respecter des deux côtés le même jour.
 *
 * Sans transport et sans interface : ce module ne sait ni parler à
 * /api/pair/redeem ni afficher un pavé. Il reçoit un commerce déjà résolu et
 * le pose. C'est ce qui lui permet de vivre sur un écran de cuisine, qui n'a
 * ni pavé PIN, ni dispatcher POS, ni caisse.
 *
 * Dépend de assets/tenant-purge.js (chargé avant) pour la liste des clés.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function readMap() { try { return JSON.parse(ls('kiwiPairings') || '{}') || {}; } catch (_) { return {}; } }
  function pairedVenue() { try { return JSON.parse(ls('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }

  /* Les données du locataire partent avec l'appairage ; l'identité matérielle
     reste avec l'appareil physique. KiwiTenantPurge retire à juste titre toute
     clé « kiwi: », donc on préserve explicitement le suffixe de l'appareil POS
     autour de cette purge partagée. */
  function purgeTenantData() {
    var deviceTag = ls('kiwi:posDevice');
    try {
      if (window.KiwiTenantPurge && window.KiwiTenantPurge.purge) window.KiwiTenantPurge.purge();
    } catch (_) {}
    if (deviceTag) set('kiwi:posDevice', deviceTag);
  }

  /* Pose l'appairage. `code` peut être vide (hand-off sans code) ; `d` est la
   * réponse déjà validée du serveur ou l'entrée de la carte locale.
   * opts.onTenantSwitch(was, venue) : ce que CETTE surface doit oublier en plus
   * de la purge partagée — le caissier pour la caisse, la file pour la cuisine.
   * Renvoie { ok, venue, switched } ; `switched` dit si la purge a eu lieu. */
  function commit(code, d, opts) {
    d = d || {};
    opts = opts || {};
    var venue = {
      merchant: d.merchant || '', venueId: d.venueId || '', type: d.type || '',
      subtype: d.subtype || '', name: d.name || '', location: d.location || '',
    };

    /* Ré-appairage vers un AUTRE commerce : ce qui appartenait au précédent n'a
       rien à faire ici. Effacé MAINTENANT, et pas seulement contrôlé au
       rechargement — l'appareil garde son état en mémoire, et le prochain
       autosave le réécrirait estampillé du nouveau commerçant : un blob qui dit
       B en contenant A passe alors tous les contrôles.

       Purge AVANT d'écrire kiwiLiveMerchant : la règle balaye tout ce qui
       commence par « kiwi: » et toute la liste TENANT_KEYS — l'ordre inverse
       effacerait l'appairage qu'on vient de poser. */
    var was = pairedVenue();
    var switched = !!(was && was.merchant && was.merchant !== venue.merchant);
    if (switched) {
      try {
        if (typeof opts.onTenantSwitch === 'function') opts.onTenantSwitch(was, venue);
      } catch (err) {
        if (window.KiwiReportError) window.KiwiReportError(err, 'tenant:pairing_switch_hook_failed');
      }
      /* Le service en cours du comptoir part explicitement en plus de la liste
         partagée : il porte le journal, les additions et les mouvements
         d'espèces, c'est-à-dire l'argent d'un commerce. */
      try { localStorage.removeItem('kiwi-caisse-shift'); } catch (_) {}
      try { localStorage.removeItem('kiwi-caisse-shift:' + (was.merchant || was.slug)); } catch (_) {}
      try {
        purgeTenantData();
      } catch (err) {
        if (window.KiwiReportError) window.KiwiReportError(err, 'tenant:caisse_tenant_switch_purge_failed');
      }
    }

    set('kiwiLiveMerchant', venue.merchant);
    set('kiwiLive', '1');
    set('kiwiPaired', '1');
    set('kiwiPairedVenue', JSON.stringify(venue));

    /* Les surfaces peignent le nom du magasin au DOMContentLoaded, soit AVANT
     * que redeem() ait répondu — sur un ré-appairage elles gardaient donc le nom
     * du magasin précédent. On annonce la liaison pour qu'elles repeignent. */
    try { document.dispatchEvent(new CustomEvent('kiwi-paired', { detail: venue })); } catch (_) {}

    /* Reflète « connectée » dans la carte pour que l'onglet du tableau de bord
     * bascule sa pastille (même navigateur). Le hand-off ne porte pas de code :
     * on enregistre alors une ligne contre le magasin lui-même, sans quoi le
     * panneau resterait sur « En attente de la caisse… » à côté d'une caisse qui
     * marche. */
    try {
      var map = readMap();
      var key = code || ('dev:' + venue.merchant);
      map[key] = map[key] || { merchant: venue.merchant, venueId: venue.venueId, type: venue.type,
        subtype: venue.subtype, name: venue.name, location: venue.location, createdAt: Date.now() };
      map[key].status = 'connected';
      map[key].connectedAt = Date.now();
      set('kiwiPairings', JSON.stringify(map));
    } catch (_) {}

    return { ok: true, venue: venue, switched: switched };
  }

  window.KiwiPairingCommit = { commit: commit, purgeTenantData: purgeTenantData };
})();

/* ── window.KiwiTrustedClock · une horloge que reculer l'heure de l'appareil ne trompe pas.
 *
 * Les identités du personnel gardées hors ligne (72 h, 24 h pour un acte de
 * responsable, assets/caisse-pairing/offline-codes.js) se mesuraient avec le
 * Date.now() de la caisse : reculer l'horloge de la tablette gardait un code
 * révoqué valable aussi longtemps qu'on voulait.
 *
 *   now()         l'heure en ms, recalée sur le serveur à chaque contact, et qui ne
 *                 recule jamais : jamais en dessous du plus haut point déjà vu ;
 *   rolledBack()  vrai quand l'horloge de l'appareil est revenue de plus de 5 min
 *                 en arrière depuis ce plus haut point : un code gardé hors ligne
 *                 est alors refusé (échec fermé) jusqu'au prochain contact serveur ;
 *   anchor(ms)    l'heure du serveur : recale l'horloge et lève l'alerte ;
 *   observe(res)  lit l'en-tête Date d'une réponse du serveur et l'ancre ;
 *   observe(res, sentAt)  la même lecture, chronométrée : un échantillon de plus
 *                 (voir « Heure de la caisse » ci-dessous) ;
 *   skewMs()      le décalage appris, serveur moins appareil (0 sans mesure) ;
 *   date()        l'heure corrigée, en Date (sans la règle « jamais en arrière »).
 *
 * HEURE DE LA CAISSE (décision du 4 novembre 2026). Une vente porte l'heure corrigée
 * (`ts`) ET celle de l'appareil (`deviceTs`) ; la journée commerciale et l'heure du
 * ticket suivent la corrigée. Le décalage est la MÉDIANE des derniers échantillons
 * (un seul faux ne le déplace pas) ; un échantillon dont l'aller-retour dépasse 2 s
 * est écarté, la réponse ayant voyagé trop longtemps pour dire l'heure à la seconde.
 * Chaque réponse réussie de /api/ du même site en fournit un (annoncée par
 * assets/till-tenant.js, événement `kiwi:api-response`). Au-delà de 5 min d'écart, un avis discret ; sans
 * serveur joint, l'heure de l'appareil reste inchangée et rien ne s'affiche. Le
 * décalage est annoncé à la file des ventes par l'événement `kiwi:clock-skew`
 * (KiwiLive.now() le lit) : la caisse n'a pas à connaître ce module.
 *
 * Limite connue : une tablette éteinte puis rallumée avec une horloge reculée ne se
 * voit qu'au prochain contact serveur, qui recale tout.
 *
 * Aucun réseau, aucun code, aucune donnée de commerçant : deux nombres dans le
 * navigateur de l'appareil.
 *
 * Ce bloc vit ici, avec l'appairage, parce que la caisse est au plafond de ses balises <script>
 * (tools/file-size-ratchet-test.mjs) : un fichier de plus n'avait nulle part où se charger. */
(function () {
  'use strict';
  var KEY = 'kiwi:caisse:clock:v1';
  var TOLERANCE = 5 * 60 * 1000;  /* une horloge corrigée de quelques minutes n'est pas une triche */
  var SAVE_EVERY = 60 * 1000;     /* le plus haut point s'écrit au plus une fois par minute */
  var MAX_SAMPLES = 9, SLOW_RTT = 2000, NOTICE_TEXT = "Heure de l'appareil décalée";
  var hw = 0, skew = 0, saved = 0, samples = [];
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && isFinite(s.hw) && isFinite(s.skew)) { hw = Math.max(0, +s.hw); skew = +s.skew; saved = hw; }
    if (s && Array.isArray(s.samples)) samples = s.samples.filter(isFinite).slice(-MAX_SAMPLES);
  } catch (_) {}
  function save() {
    saved = hw;
    try { localStorage.setItem(KEY, JSON.stringify({ hw: hw, skew: skew, samples: samples })); } catch (_) {}
  }
  function median(list) {
    var a = list.slice().sort(function (x, y) { return x - y; }), mid = a.length >> 1;
    return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
  }
  function changed() {
    try { document.dispatchEvent(new CustomEvent('kiwi:clock-skew', { detail: { skewMs: skew } })); } catch (_) {}
    try {
      var el = document.getElementById('kiwi-clock-skew');
      if (Math.abs(skew) <= TOLERANCE) { if (el && el.remove) el.remove(); return; }
      if (!el && document.body && document.createElement) {
        el = document.createElement('div'); el.id = 'kiwi-clock-skew'; el.setAttribute('role', 'status');
        el.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:9000;padding:6px 12px;border-radius:999px;background:var(--riad,#053B2C);color:var(--paper,#F7F5F0);font:500 12px/1.2 "Inter Tight",sans-serif;opacity:.92;pointer-events:none';
        document.body.appendChild(el);
      }
      if (el && !el.firstChild) el.appendChild(document.createTextNode(NOTICE_TEXT)); /* la langue du comptoir le traduit (assets/caisse-lang.js) */
    } catch (_) {}
  }
  /* Un échantillon : l'en-tête Date (tronqué à la seconde, donc visé au milieu de
   * la seconde) moins l'heure de l'appareil au milieu de l'aller-retour. */
  function sample(dateHeader, sentAt, receivedAt) {
    var server = Date.parse(String(dateHeader || '')), sent = +sentAt, got = +receivedAt, rtt = got - sent;
    if (!isFinite(server) || !isFinite(sent) || !isFinite(got) || !(rtt >= 0) || rtt > SLOW_RTT) return false;
    samples.push(Math.round(server + 500 - (sent + rtt / 2)));
    if (samples.length > MAX_SAMPLES) samples = samples.slice(-MAX_SAMPLES);
    skew = median(samples); hw = Date.now() + skew; save(); changed();
    return true;
  }
  function raw() { return Date.now() + skew; }
  function now() {
    var t = raw();
    if (t > hw) { hw = t; if (hw - saved >= SAVE_EVERY) save(); }
    return hw;
  }
  function rolledBack() { return raw() < hw - TOLERANCE; }
  function anchor(ms) {
    ms = Number(ms);
    if (!isFinite(ms) || ms < Date.UTC(2020, 0, 1)) return;
    skew = ms - Date.now(); hw = ms; samples = []; save(); changed();
  }
  function observe(res, sentAt) {
    try {
      var d = res && res.headers && res.headers.get && res.headers.get('Date');
      if (!d) return;
      if (sentAt != null) sample(d, sentAt, Date.now()); else anchor(Date.parse(d));
    } catch (_) {}
  }
  /* Les réponses réussies de /api/ du même site, annoncées par le filet réseau de
   * la caisse (assets/till-tenant.js, seul à envelopper fetch ici). */
  try {
    document.addEventListener('kiwi:api-response', function (e) {
      var d = e && e.detail;
      if (d && d.res) observe(d.res, d.sentAt);
    });
  } catch (_) {}
  try { if (skew) changed(); } catch (_) {}
  /* Un battement par minute tant que la caisse est ouverte : le plus haut point suit
   * le temps réel, donc revenir en arrière après des heures d'activité se voit. */
  try { if (typeof setInterval === 'function') setInterval(now, SAVE_EVERY); } catch (_) {}
  try { window.addEventListener('pagehide', function () { now(); save(); }); } catch (_) {}
  window.KiwiTrustedClock = { now: now, rolledBack: rolledBack, anchor: anchor, observe: observe, skewMs: function () { return skew; },
    date: function () { return new Date(Date.now() + skew); } };
})();
