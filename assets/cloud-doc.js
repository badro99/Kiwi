/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CLOUD DOC — window.KiwiCloudDoc
 * ---------------------------------------------------------------------------
 * LE FILET, rendu réutilisable. Une copie serveur sur laquelle retomber, pour
 * n'importe quelle donnée d'établissement.
 *
 * L'inventaire d'une boutique a été le premier à en avoir une (assets/boutique-
 * catalog.js → /api/catalog). Tout le reste de ce qu'un commerçant configure
 * vivait encore UNIQUEMENT dans le localStorage du navigateur qui l'avait saisi :
 * sa carte, son équipe et ses plannings de paie, son programme de fidélité, son
 * plan de salle. Une fenêtre privée fermée, un deuxième appareil, un cache vidé,
 * et l'établissement était vide. Ressaisir vingt salariés et quatre semaines de
 * planning parce qu'on a ouvert Kiwi sur l'iPad du comptoir n'est pas
 * acceptable.
 *
 * Ce fichier ne contient donc AUCUNE connaissance d'une fonctionnalité
 * particulière : juste les trois règles, écrites une fois, que chaque
 * fonctionnalité câble avec son propre `read` / `write` / `merge`.
 *
 *  1. NE JAMAIS PERDRE DE DONNÉE. Toute panne — hors ligne, 500, table pas
 *     encore migrée, session expirée — est avalée : la copie locale reste la
 *     vérité de travail et la remontée est retentée. La caisse continue de
 *     vendre dans un sous-sol sans réseau.
 *  2. NE JAMAIS ÉCRASER L'AUTRE APPAREIL. On envoie la révision sur laquelle on
 *     s'est basé ; si le serveur a bougé entre-temps il refuse (409) et rend sa
 *     copie. On fusionne et on repropose.
 *  3. NE JAMAIS POUSSER AVANT D'AVOIR LU. Un navigateur neuf a un document
 *     vide ; s'il poussait en premier il effacerait le vrai.
 *
 * ── LA CLÉ, ET POURQUOI CE N'EST PAS L'IDENTIFIANT DE VENUE ────────────────
 *
 * assets/venue-store.js range tout sous `kiwi:<feature>:v1:<venueId>`. Or cet
 * identifiant est PROPRE À CE NAVIGATEUR : venues.js le tire de l'horloge à la
 * création (`'v' + Date.now()`), et du slug à l'adoption d'un magasin déjà
 * enregistré (`'v-' + slug`, ajouté avec /api/me). Deux navigateurs du même
 * commerçant ne tombent donc JAMAIS sur la même clé — une copie serveur rangée
 * sous l'identifiant de venue ne serait relue par personne.
 *
 * La clé serveur est le SLUG DU NOM DU MAGASIN, que la caisse et le tableau de
 * bord calculent tous les deux à l'identique (functions/auth/_lib.js
 * slugMerchant · merchant-config.js storeSlug · pages-pro.js _bqxVenue). C'est
 * la colonne vertébrale de sales / menus / catalogs, et maintenant de
 * store_docs.
 *
 * Le stockage LOCAL, lui, ne bouge pas : il reste rangé sous l'identifiant de
 * venue, parce que c'est ce que lisent toutes les surfaces existantes. Ce
 * fichier ne fait que traduire l'un vers l'autre — plus `carryForward()`, qui
 * récupère un enregistrement laissé orphelin sous un ANCIEN identifiant du même
 * magasin (le cas exact d'un navigateur qui avait créé la boutique à l'horloge
 * puis l'a ré-adoptée au slug).
 *
 * Charger AVANT venue-store.js et team.js. Vanilla, autonome, sans dépendance.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var REV_PREFIX = 'kiwiDocRev:v1:';
  var STORE_PREFIX = 'kiwi:';          // le préfixe de venue-store.js
  var COOLDOWN = 20000;                // relecture au retour d'onglet
  var DEBOUNCE = 900;

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  /* Deux documents sont-ils le même ? Sert uniquement à ne pas remonter une
   * fusion qui n'a rien changé. Prudent dans le bon sens : deux documents
   * identiques rangés dans un ordre de clés différent seront déclarés
   * différents, et on remontera une fois pour rien — exactement ce que faisait
   * l'ancien code à chaque fois. L'inverse (déclarer identiques deux documents
   * qui diffèrent, donc taire une modification) est impossible ici. */
  function identical(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
  }

  /* Jumeau de slugMerchant (functions/auth/_lib.js). Le nom d'un magasin doit
   * produire le MÊME slug ici, sur la caisse et sur le serveur, sinon les deux
   * bouts se parlent sous deux clés différentes sans jamais s'en apercevoir. */
  function slugStore(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /* venues.js les déclare transitoires et « never persisted » : 'own' est un
   * placeholder de session — il ne désigne aucun magasin en particulier, et rien
   * ne doit jamais partir sous son nom.
   *
   * 'scoped' était rangé ici avec lui, et c'était l'erreur : la vue opérateur
   * n'est pas un placeholder, elle porte le magasin d'un client bien réel, celui
   * que /api/me a résolu. La traiter comme anonyme coupait toute synchronisation
   * en God mode — l'opérateur ouvrait le tableau de bord d'un client et lisait
   * « horaires non renseignés » sur un établissement qui les avait enregistrés
   * depuis des semaines, ainsi que reçu, équipe, fidélité, plan de salle et
   * rapports de clôture, tous vides pour la même raison. Les fonctionnalités
   * paraissaient marcher parce qu'elles passent, elles, par /api/config et
   * /api/catalog, qui prennent le magasin dans l'URL et pas dans la venue. */
  var TRANSIENT = { own: 1 };

  /* Le magasin de la vue portée. Lu sur la venue synthétique, que venues.js
   * n'écrit qu'après confirmation du cookie opérateur par le serveur : coller
   * « ?merchant=… » derrière l'adresse ne suffit donc pas à s'en réclamer. */
  function scopedSlug() {
    try {
      var KV = window.KiwiVenue;
      var d = KV && KV.getVenueData && KV.getVenueData('scoped');
      var s = (d && d.id === 'scoped' && d.slug) ? String(d.slug).trim() : '';
      return s;
    } catch (_) { return ''; }
  }

  function isReal() {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      /* Une caisse appairée n'a normalement PAS de session propriétaire — et
         c'est voulu. La traiter comme une démo coupait pourtant TOUS les
         documents cloud du comptoir : horaires, rapports journaliers, équipe,
         reçu, plan de salle… La caisse calculait alors sa journée commerciale
         avec le seuil local par défaut pendant que le dashboard connaissait les
         vraies heures du magasin.

         L'appairage ne donne aucun droit ici : /api/store vérifie encore le
         cookie httpOnly kiwi_till et le slug. Il dit seulement au navigateur
         qu'il doit tenter la synchronisation de CE terminal réel. */
      var pv = window.KiwiCaissePairing && window.KiwiCaissePairing.pairedVenue
        && window.KiwiCaissePairing.pairedVenue();
      if (pv && pv.merchant) return true;
      var saved = JSON.parse(ls('kiwiPairedVenue') || 'null');
      return !!(saved && saved.merchant);
    } catch (_) { return false; }
  }

  /* Les magasins de démonstration ne quittent jamais ce navigateur : ils sont
   * semés localement et n'appartiennent à aucun compte. */
  function isDemoId(id) {
    return /^demo-/.test(id) || { cafeAtlas: 1, maisonMansour: 1, spaBahia: 1, riadYasmina: 1 }[id] === 1;
  }

  function venueList() {
    try {
      var a = JSON.parse(ls('kiwiCustomVenues') || '[]');
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }

  /* Attention au repli de getVenueData() : `VENUES[id] || VENUES[courante]`.
   * Un identifiant INCONNU en ressort donc avec la fiche de la venue affichée —
   * et comme on en tire un slug, un magasin absent prenait le nom de celui qu'on
   * regarde. En vue portée, où la seule venue est le client ouvert, ça faisait
   * reconnaître l'enregistrement local de N'IMPORTE quel autre magasin comme
   * étant celui du client : carryForward() recopiait les horaires du client
   * précédent chez le suivant. On exige donc que la fiche rendue soit bien celle
   * qu'on a demandée. */
  function venueById(id) {
    var KV = window.KiwiVenue;
    try {
      var d = KV && KV.getVenueData && KV.getVenueData(id);
      if (d && d.id === id) return d;
    } catch (_) {}
    try {
      var c = KV && KV.getCurrentVenueData && KV.getCurrentVenueData();
      if (c && c.id === id) return c;
    } catch (_) {}
    var list = venueList();
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  /* Un identifiant local (venue ou carnet) → le slug du magasin, ou '' quand
   * rien ne doit partir sur le réseau.
   *
   * Deux cas, et surtout PAS de troisième deviné au hasard :
   *   · l'identifiant désigne une venue connue → le slug de son NOM. Pas celui
   *     du compte : un compte qui tient deux boutiques verrait sinon les deux
   *     partager un seul document.
   *   · l'identifiant EST déjà un slug (clients-store.js range son carnet sous
   *     `kiwiLiveMerchant`) → on ne l'accepte que si on peut le RECONNAÎTRE
   *     comme le slug d'un magasin de ce compte. Une reconnaissance à l'allure
   *     — « ça ressemble à un slug » — enverrait un jour l'identifiant de venue
   *     `v1abcd` d'un magasin supprimé sous un nom de magasin inventé. */
  function slugFor(id) {
    if (!isReal()) return '';
    id = String(id == null ? '' : id).trim();
    /* La vue portée : son slug est porté par la venue, jamais deviné de son nom
     * — un magasin peut s'appeler autrement que son slug d'inscription, et se
     * tromper de slug ferait écrire chez le voisin. Vide tant que le serveur
     * n'a pas répondu : on ne synchronise rien plutôt que n'importe quoi. */
    if (id === 'scoped') return scopedSlug();
    if (!id || TRANSIENT[id] || isDemoId(id)) return '';

    /* `vd.slug` est l'identité gravée de l'établissement (venues.js › slugOf) ;
     * `slugStore(vd.name)` n'en est qu'une reconstitution — juste tant que
     * personne n'a corrigé l'enseigne, fausse ensuite. Un document rangé sous un
     * slug reconstitué est un document perdu pour le magasin qui le croyait
     * sien. */
    var vd = venueById(id);
    if (vd) {
      if (vd.slug) return String(vd.slug);
      return (vd.custom && vd.name) ? slugStore(vd.name) : '';
    }

    // Pas une venue : est-ce un slug qu'on sait rattacher à ce compte ?
    if (ls('kiwiLiveMerchant') === id) return id;
    var list = venueList();
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v && v.custom && (v.slug === id || (v.name && slugStore(v.name) === id))) return id;
    }
    try {
      var biz = (window.KiwiMe && window.KiwiMe.business) || '';
      if (biz && slugStore(biz) === id) return id;
    } catch (_) {}
    try {
      var pv = window.KiwiCaissePairing && window.KiwiCaissePairing.pairedVenue
        && window.KiwiCaissePairing.pairedVenue();
      if (pv && pv.merchant && pv.merchant === id) return id;
    } catch (_) {}
    return '';
  }

  /* Le slug du magasin actuellement à l'écran (ou derrière le comptoir). */
  function currentSlug() {
    var KV = window.KiwiVenue;
    try {
      var d = KV && KV.getCurrentVenueData && KV.getCurrentVenueData();
      if (d && d.id) { var s = slugFor(d.id); if (s) return s; }
    } catch (_) {}
    // Caisse : pas de moteur de venues, mais un magasin appairé.
    try {
      var pv = window.KiwiCaissePairing && window.KiwiCaissePairing.pairedVenue
        && window.KiwiCaissePairing.pairedVenue();
      if (pv && pv.merchant) return slugFor(pv.merchant);
    } catch (_) {}
    var m = ls('kiwiLiveMerchant');
    return m ? slugFor(m) : '';
  }

  /* ── RÉCUPÉRATION DES ENREGISTREMENTS ORPHELINS ────────────────────────────
   * Le stockage local est rangé sous l'identifiant de venue, et cet identifiant
   * peut CHANGER pour un même magasin sur un même navigateur : celui qui a créé
   * la boutique la range sous `v` + horloge, puis un effacement partiel suivi
   * d'une reconnexion la fait ré-adopter sous `v-<slug>` (venues.js
   * adoptServerStores). L'ancien enregistrement reste alors en place, complet,
   * mais plus personne ne le lit — et comme le nouveau est vide, la première
   * remontée aurait proposé du vide au serveur.
   *
   * On balaie donc les clés `kiwi:<feature>:v1:*` du navigateur à la recherche
   * d'un autre identifiant qui désigne LE MÊME magasin, et on recopie. Copie,
   * jamais déplacement : si l'hypothèse est fausse, rien n'a été détruit.
   *
   * `shape` sert aux fonctionnalités antérieures à venue-store.js, qui portent
   * leur propre convention de clé : `kiwi:stockOverlay:<venueId>` et
   * `kiwiPlanDeSalle:<venueId>` (un simple préfixe), `kiwiStarter:<venueId>:<nav>`
   * (l'identifiant au MILIEU, d'où le suffixe). Elles souffrent exactement du
   * même changement d'identifiant ; sans ce paramètre le balayage cherchait un
   * préfixe `:v1:` qu'elles n'ont jamais eu et ne trouvait donc jamais rien —
   * un sauvetage silencieusement inopérant, pire que pas de sauvetage.
   * Une chaîne vaut pour `{ prefix }`. */
  function carryForward(feature, venueId, slug, hasData, shape) {
    if (!slug || !venueId) return null;
    if (typeof shape === 'string') shape = { prefix: shape };
    shape = shape || {};
    var pre = shape.prefix || (STORE_PREFIX + feature + ':v1:');
    var suf = shape.suffix || '';
    var mine = pre + venueId + suf;
    try {
      if (hasData(ls(mine))) return null;                 // déjà quelque chose ici
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(pre) !== 0 || k === mine) continue;
        if (suf && k.slice(-suf.length) !== suf) continue;   // une autre destination
        var otherId = suf ? k.slice(pre.length, k.length - suf.length) : k.slice(pre.length);
        if (slugFor(otherId) !== slug) continue;          // un autre magasin
        var raw = ls(k);
        if (!hasData(raw)) continue;                      // rien à récupérer
        lset(mine, raw);
        return raw;
      }
    } catch (_) {}
    return null;
  }

  /* ── FUSION PAR DÉFAUT ─────────────────────────────────────────────────────
   * Union, cet appareil prioritaire. Un tableau d'objets porteurs d'`id` est
   * fusionné par id ; un objet, clé par clé ; un scalaire, c'est le nôtre.
   *
   * Deux appareils qui modifient LA MÊME entrée en même temps voient donc l'un
   * des deux gagner — mais rien ne DISPARAÎT jamais, ce qui est le seul
   * arbitrage acceptable quand la donnée perdue serait un salarié ou un produit.
   * Une fonctionnalité qui sait mieux arbitrer (une horloge par ligne, par
   * exemple) passe son propre `merge`. */
  function idOf(e) { return e && typeof e === 'object' ? (e.id || e.key || e.code || '') : ''; }

  function mergeDefault(mine, theirs) {
    if (theirs == null) return mine;
    if (mine == null) return theirs;
    if (Array.isArray(mine) && Array.isArray(theirs)) {
      if (!mine.length) return theirs.slice();
      if (!idOf(mine[0]) && !idOf(theirs[0])) return mine.slice();   // pas d'identité → le nôtre
      var seen = Object.create(null);
      var out = [];
      var take = function (e) {
        var id = idOf(e);
        if (!id) { out.push(e); return; }
        if (seen[id]) return;
        seen[id] = 1; out.push(e);
      };
      mine.forEach(take);
      theirs.forEach(take);
      return out;
    }
    if (typeof mine === 'object' && typeof theirs === 'object'
        && !Array.isArray(mine) && !Array.isArray(theirs)) {
      var o = {};
      Object.keys(theirs).forEach(function (k) { o[k] = theirs[k]; });
      Object.keys(mine).forEach(function (k) {
        o[k] = Object.prototype.hasOwnProperty.call(theirs, k)
          ? mergeDefault(mine[k], theirs[k]) : mine[k];
      });
      return o;
    }
    return mine;
  }

  /* « Vide » = rien qui ressemble à du contenu. Un compteur ou un numéro de
   * version ne comptent pas : `{ v: 1, seq: 0 }` est un navigateur neuf, pas un
   * commerçant qui a tout supprimé. Sert à ne jamais effacer le serveur. */
  function emptyDefault(d) {
    if (d == null) return true;
    if (Array.isArray(d)) return !d.length;
    if (typeof d !== 'object') return false;
    var keys = Object.keys(d);
    for (var i = 0; i < keys.length; i++) {
      var v = d[keys[i]];
      if (v == null) continue;
      if (Array.isArray(v)) { if (v.length) return false; continue; }
      if (typeof v === 'object') { if (!emptyDefault(v)) return false; continue; }
      if (typeof v === 'string') { if (v.trim()) return false; continue; }
    }
    return true;
  }

  /* ── LE MIROIR ─────────────────────────────────────────────────────────────
   * opts.feature        nom de la fonctionnalité (doit être dans FEATURES,
   *                     functions/api/store.js)
   * opts.slug()         le magasin concerné, '' = ne rien synchroniser
   * opts.read()         le document local du magasin courant
   * opts.write(doc)     le remplacer + prévenir l'écran. NE DOIT PAS reprogrammer
   *                     de remontée : le miroir décide lui-même quand repousser.
   * opts.merge(a, b)    optionnel — a = le nôtre, b = celui du serveur
   * opts.isEmpty(doc)   optionnel
   * opts.onPulled(doc)  optionnel — appelé après une hydratation réussie
   * opts.localKey()     optionnel — SOUS QUEL NOM ce navigateur range la copie
   *                     que read()/write() manipulent. Voir LE SIGNET plus bas :
   *                     sans lui, deux copies locales du même magasin partagent
   *                     un seul signet de révision et l'une des deux se croit à
   *                     jour en portant l'autre version.
   */
  function attach(opts) {
    opts = opts || {};
    var feature = opts.feature;
    var merge = opts.merge || mergeDefault;
    var empty = opts.isEmpty || emptyDefault;
    var slugOf = opts.slug || currentSlug;
    var localOf = typeof opts.localKey === 'function' ? opts.localKey : null;

    var st = { rev: 0, read: Object.create(null), timer: null, busy: false,
               again: false, tries: 0, last: 0 };

    function on() { return !!(isReal() && feature && slugOf()); }

    /* ── LE SIGNET DE RÉVISION ────────────────────────────────────────────────
     * « la copie que je tiens EST la révision N du serveur ». C'est ce signet qui
     * autorise pull() à ne rien faire quand il n'y a rien de nouveau.
     *
     * Il était rangé sous le seul slug du magasin. Or le slug désigne le magasin
     * CÔTÉ SERVEUR, pas la copie locale : le tableau de bord range la sienne sous
     * l'identifiant de venue (`kiwi:business:v1:v-amira-boutique`) et la caisse
     * sous le slug (`kiwi:business:v1:amira-boutique`) — deux enregistrements
     * distincts, un seul signet, dans le même navigateur. Le propriétaire
     * corrigeait donc son adresse au bureau ; la remontée estampillait le signet
     * « révision 2 » ; et la caisse, qui portait encore la révision 1, lisait ce
     * signet, se déclarait à jour et ne relisait plus JAMAIS — ni au retour sur
     * l'onglet, ni sur « Rafraîchir », ni au rechargement. Le comptoir imprimait
     * l'ancienne adresse indéfiniment, sans un mot.
     *
     * Le signet nomme donc maintenant la copie qu'il décrit. Les surfaces qui
     * rangeaient déjà leur copie sous le slug (le rapport journalier, le carnet
     * de clientes) gardent exactement leur clé : rien à re-synchroniser chez
     * elles. Un signet perdu ne coûte de toute façon qu'une réconciliation de
     * plus — jamais une donnée : pull() fusionne au lieu d'écraser. */
    function revKey(slug) {
      var lk = localOf ? String(localOf() || '') : '';
      return REV_PREFIX + feature + ':' + slug + (lk && lk !== slug ? '@' + lk : '');
    }
    function readRev(slug) { var n = parseInt(ls(revKey(slug)) || '0', 10); return n > 0 ? n : 0; }
    function writeRev(slug, r) { lset(revKey(slug), String(r || 0)); }

    /* ── LA REMONTÉE REFUSÉE ────────────────────────────────────────────────
     * Un 413 (document hors bornes) laissait la copie locale intacte — c'est la
     * bonne décision — puis PLUS RIEN. Le commentaire disait « on retentera » ;
     * personne ne retentait. Le commerçant posait son logo, le voyait dans son
     * aperçu, et son ticket de caisse ne changeait jamais.
     *
     * On garde donc une marque du refus, à côté du signet de révision. Elle
     * survit au rechargement, et le prochain contact avec le serveur repropose
     * le document : le jour où la borne serveur bouge, la copie en attente
     * repart toute seule, sans que le commerçant ait à ré-enregistrer ce qu'il
     * avait déjà enregistré. Une tentative par ouverture de page, pas plus. */
    function refusedKey(slug) { return 'kiwiDocRefused:v1:' + revKey(slug).slice(REV_PREFIX.length); }
    function markRefused(slug, why) { lset(refusedKey(slug), String(why || '1')); }
    function clearRefused(slug) { try { localStorage.removeItem(refusedKey(slug)); } catch (_) {} }
    function isRefused(slug) { return !!ls(refusedKey(slug)); }

    /* Une panne réseau n'est pas un refus applicatif, mais elle doit survivre au
     * rechargement de la page de la même façon. Sans cette marque, le signet de
     * révision reste égal au serveur et le prochain pull conclut à tort que la
     * copie locale (modifiée hors ligne) est déjà synchronisée. Le jeton change
     * à chaque modification : une réponse à un ancien POST ne peut donc pas
     * effacer la marque d'une saisie plus récente faite pendant son trajet. */
    function dirtyKey(slug) { return 'kiwiDocDirty:v1:' + revKey(slug).slice(REV_PREFIX.length); }
    function markDirty(slug) {
      var token = Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
      lset(dirtyKey(slug), token);
      return token;
    }
    function dirtyToken(slug) { return ls(dirtyKey(slug)); }
    function clearDirty(slug, token) {
      try {
        if (!token || localStorage.getItem(dirtyKey(slug)) === token) {
          localStorage.removeItem(dirtyKey(slug));
        }
      } catch (_) {}
    }

    /* Lit la copie serveur et la réconcilie avec la locale. `first` = tout
     * premier contact pour ce magasin : c'est le SEUL cas où un document local
     * vide est remplacé en bloc (le navigateur neuf adopte l'établissement).
     * Ensuite on fusionne toujours, pour ne pas jeter ce qui vient d'être saisi
     * ici pendant l'aller-retour. */
    function pull(first) {
      var slug = slugOf();
      if (!on()) return Promise.resolve(false);
      return fetch('/api/store?feature=' + encodeURIComponent(feature)
                   + '&merchant=' + encodeURIComponent(slug),
                   { headers: { Accept: 'application/json' } })
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (res) {
          // Le commerçant a changé de magasin pendant l'aller-retour : cette
          // réponse concerne un autre établissement, on la jette.
          if (!res || slug !== slugOf()) return false;
          st.read[slug] = 1;
          st.last = Date.now();

          var serverRev = +res.rev || 0;
          var theirs = res.data;
          var mine = opts.read();
          var mineEmpty = empty(mine);
          var theirsEmpty = empty(theirs);

          if (theirsEmpty) {
            // Rien en ligne : c'est ce navigateur qui fait référence.
            st.rev = serverRev;
            if (!mineEmpty) push(0);
            return false;
          }
          st.rev = serverRev;
          /* Déjà à jour : notre dernière remontée EST ce que le serveur porte.
             Sauf si une remontée a été refusée : le signet dit alors « à jour »
             pour une copie que le serveur n'a jamais acceptée. On repropose. */
          if (!mineEmpty && readRev(slug) === serverRev) {
            if (isRefused(slug) || dirtyToken(slug)) push(0, true);
            return false;
          }

          var adopt = first && mineEmpty;
          var next = adopt ? theirs : merge(mine, theirs);
          opts.write(next);
          writeRev(slug, serverRev);
          if (opts.onPulled) { try { opts.onPulled(next); } catch (_) {} }
          /* Notre fusion doit remonter — SAUF si elle n'a rien ajouté à ce que le
           * serveur porte déjà. Repousser une copie identique incrémente `rev`
           * pour rien, et surtout périme le signet de l'autre appareil : il
           * relit, refusionne, repousse, et les deux surfaces se renvoient
           * indéfiniment le même document à chaque retour d'onglet. Observé au
           * banc : une adresse propagée correctement faisait tout de même passer
           * la révision de 2 à 3 sans qu'un caractère ait changé. */
          if (!adopt && !identical(next, theirs)) push(0);
          return true;
        })
        .catch(function () { return false; });   // hors ligne → le local fait foi
    }

    function push(delay, alreadyDirty) {
      if (!on()) return;
      if (!alreadyDirty) markDirty(slugOf());
      if (st.timer) clearTimeout(st.timer);
      st.timer = setTimeout(function () { pushNow(); }, delay == null ? DEBOUNCE : delay);
    }

    function pushNow(o) {
      st.timer = null;
      if (!on()) return;
      var slug = slugOf();
      var sentDirty = dirtyToken(slug) || markDirty(slug);
      // Règle 3 : jamais pousser avant d'avoir lu, sinon un navigateur neuf efface.
      if (!st.read[slug]) { pull(true); return; }
      /* Rien à dire au serveur : le document est vide ET il n'y a encore aucune
       * ligne en face. Sans ce garde, la simple ouverture d'une page suffisait à
       * créer une ligne — celle de la valeur par défaut que le module vient de
       * matérialiser, que le commerçant n'a jamais choisie. Le prochain appareil
       * l'aurait alors reçue comme un vrai réglage. Un document vidé APRÈS coup
       * (rev > 0) passe, lui : c'est une suppression, pas un silence. */
      if (!st.rev && empty(opts.read())) {
        clearDirty(slug, sentDirty);
        return;
      }
      if (st.busy) { st.again = true; return; }
      st.busy = true;
      fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: feature, merchant: slug, baseRev: st.rev, data: opts.read(),
        }),
        // L'onglet peut se fermer juste après une saisie : keepalive laisse la
        // requête partir quand même.
        keepalive: !!(o && o.keepalive),
      })
        .then(function (r) {
          return r.json().then(function (j) { return { status: r.status, j: j }; })
            .catch(function () { return { status: r.status, j: null }; });
        })
        .then(function (res) {
          if (slug !== slugOf()) return;
          if (res.status === 200 && res.j && res.j.ok) {
            st.rev = +res.j.rev || 0;
            writeRev(slug, st.rev);
            clearRefused(slug);
            clearDirty(slug, sentDirty);
            st.tries = 0;
            return;
          }
          /* 413 : le document dépasse une borne du serveur. La copie locale est
             intacte, mais elle ne quittera JAMAIS cet appareil tant que rien ne
             change — un silence qui se lit comme « c'est enregistré ». On le
             marque, on le retentera, et la surface qui sait parler au commerçant
             peut le lui dire. */
          if (res.status === 413) {
            markRefused(slug, (res.j && res.j.why) || 'too-large');
            if (opts.onRefused) {
              try { opts.onRefused((res.j && res.j.why) || 'too-large'); } catch (_) {}
            }
            return;
          }
          // 409 : le serveur a bougé (ou a refusé un envoi vide). Il rend sa
          // copie — on fusionne et on repropose, quelques fois au plus pour ne
          // jamais tourner en rond si l'autre appareil écrit en continu.
          if (res.status === 409 && res.j && res.j.data && st.tries < 3) {
            st.tries++;
            var next = merge(opts.read(), res.j.data);
            opts.write(next);
            st.rev = +res.j.rev || 0;
            writeRev(slug, st.rev);
            if (opts.onPulled) { try { opts.onPulled(next); } catch (_) {} }
            st.again = true;
          }
          // 401 / 413 / 503 / 500 → on garde tout en local et on retentera.
        })
        .catch(function () { /* hors ligne : la saisie reste, la remontée attendra */ })
        .then(function () {
          st.busy = false;
          if (st.again) { st.again = false; push(400); }
        });
    }

    // Le magasin actif vient de changer (ou la page vient de s'ouvrir) : on lit
    // sa copie serveur une fois.
    function bind() {
      var slug = slugOf();
      if (!on() || st.read[slug]) return;
      pull(true);
    }

    /* Revenir sur l'onglet est le moment où l'on veut voir ce que l'AUTRE
     * appareil a fait — la caisse a encaissé pendant qu'on regardait ailleurs.
     * On relit, sans marteler le serveur. */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (!on() || Date.now() - st.last < COOLDOWN) return;
      pull(false);
    });

    /* `online` est le seul signal immédiat du navigateur après une coupure. Une
     * copie sale repart sans attendre une nouvelle saisie ni un aller-retour
     * d'onglet ; une copie propre relit simplement ce que les autres appareils
     * ont pu faire pendant la panne. Le POST garde baseRev, donc un serveur qui
     * a avancé répondra 409 et passera par la fusion normale. */
    window.addEventListener('online', function () {
      var slug = slugOf();
      if (!on()) return;
      if (dirtyToken(slug) || isRefused(slug)) push(0, true);
      else pull(false);
    });

    // Une modification en attente ne doit pas mourir avec l'onglet.
    window.addEventListener('pagehide', function () {
      if (st.timer) { clearTimeout(st.timer); st.timer = null; pushNow({ keepalive: true }); }
    });

    var handle = {
      feature: feature,
      slug: slugOf,
      enabled: on,
      bind: bind,
      pull: pull,
      push: push,
      flush: function () { if (st.timer) clearTimeout(st.timer); st.timer = null; pushNow({ keepalive: true }); },
    };
    live.push(handle);
    return handle;
  }

  /* Tous les documents attachés dans cette page — plan de salle, classeur du
   * jour, etc. Le bouton « Rafraîchir » de la caisse les relit d'un coup : il
   * n'a pas à savoir lesquels existent sur ce métier-là. */
  var live = [];
  function pullAll() {
    var on = live.filter(function (h) { return h.enabled(); });
    if (!on.length) return Promise.resolve(false);
    return Promise.all(on.map(function (h) {
      return h.pull(false).catch(function () { return false; });
    })).then(function (rs) { return rs.some(Boolean); });
  }

  window.KiwiCloudDoc = {
    attach: attach,
    pullAll: pullAll,
    slugFor: slugFor,
    currentSlug: currentSlug,
    slugStore: slugStore,
    carryForward: carryForward,
    mergeDefault: mergeDefault,
    isEmpty: emptyDefault,
    isReal: isReal,
  };
})();
