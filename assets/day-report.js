/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RAPPORT JOURNALIER — window.KiwiDayReport
 * ---------------------------------------------------------------------------
 * Le Z de caisse, écrit UNE fois et lu par les deux surfaces. La caisse
 * l'imprime au moment de la clôture, le tableau de bord le rouvre le lendemain
 * matin — et les deux tombent sur les mêmes chiffres, parce que les deux
 * appellent build() sur la même matière.
 *
 * ── CE QUI EXISTAIT, ET POURQUOI ÇA NE SUFFISAIT PAS ───────────────────────
 * La caisse restaurant avait déjà un écran de clôture (renderCloture) : durée
 * du service, total encaissé, carte/espèces, attendu en caisse, écart. Trois
 * choses manquaient, et ce sont les trois qui comptent pour un patron qui ouvre
 * son téléphone à 8h du matin :
 *   · Le rapport n'existait QUE tant que l'onglet vivait. `closeRegister()`
 *     effaçait le poste et rechargeait la page — le lendemain, plus rien.
 *   · « Imprimer le rapport Z » affichait un toast. Rien ne sortait de
 *     l'imprimante.
 *   · Aucun détail produit. Un total de 2 000 MAD ne dit pas si la journée
 *     s'est faite sur douze jeans ou sur trois manteaux.
 *
 * ── LA RÈGLE QUI REND LA DOUBLE CLÔTURE INOFFENSIVE ────────────────────────
 * Un rapport n'est JAMAIS accumulé, il est RECALCULÉ depuis le journal des
 * ventes. Clôturer deux fois la même journée ne peut donc pas compter les
 * ventes deux fois : la deuxième clôture repart des mêmes lignes et retrouve le
 * même total. Ce qu'elle ajoute, c'est une ligne dans `revisions` — la trace de
 * la réouverture, que la comptabilité exige et que l'écrasement silencieux
 * aurait perdue. Une clôture n'efface et ne modifie AUCUNE vente : le rapport
 * est un document à côté du registre, jamais à sa place.
 *
 * ── LA JOURNÉE COMMERCIALE N'EST PAS LA JOURNÉE CIVILE ─────────────────────
 * Un restaurant qui ouvre à 10h et ferme à 1h du matin fait UNE journée, pas
 * deux. Découper à minuit couperait son service en deux rapports dont aucun ne
 * veut rien dire. `businessDay()` décale donc l'horloge de `cutoff` heures
 * (5h par défaut) avant de prendre la date : une vente à 00h30 appartient à la
 * veille, une vente à 06h00 à aujourd'hui. Le seuil est réglable par
 * établissement — une boîte de nuit le pousse à 7h, une boulangerie le descend
 * à 4h.
 *
 * ── LA CATÉGORIE D'UN PRODUIT, DANS L'ORDRE ────────────────────────────────
 *   1. `c` porté par la ligne de vente elle-même. C'est la vérité : la caisse
 *      la connaissait au moment de l'encaissement. Elle survit au fait que le
 *      commerçant renomme ou supprime la catégorie six mois plus tard.
 *   2. Sinon, le catalogue actuel (rayons boutique, carte restaurant), par nom.
 *      C'est ce qui rattrape TOUT l'historique écrit avant ce fichier.
 *   3. Sinon « Divers ». Jamais zéro, jamais inventé.
 *
 * `coverage` dit quelle part du chiffre portait un panier détaillé. Un rapport
 * dont la moitié des ventes n'ont pas de lignes doit le DIRE, pas afficher un
 * classement produits qui a l'air complet et ne l'est pas.
 *
 * ── OÙ ÇA VIT ──────────────────────────────────────────────────────────────
 * Local : `kiwi:dayreports:v1:<slug>` — le slug du magasin, pas l'identifiant
 * de venue (celui-là est propre au navigateur, cf. cloud-doc.js). Serveur :
 * store_docs, feature `dayreports`, via KiwiCloudDoc — c'est ce qui fait qu'un
 * rapport clôturé sur l'iPad du comptoir s'ouvre le lendemain sur le téléphone
 * du patron. Tout est « fail-soft » : pas de réseau, pas de migration, session
 * expirée — la copie locale reste la vérité de travail et la remontée retente.
 *
 * Chargez-moi APRÈS cloud-doc.js. Aucune dépendance DOM : ce fichier ne dessine
 * rien, il calcule et il range.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VER = 1;
  var LOCAL_PREFIX = 'kiwi:dayreports:v1:';
  var CUTOFF_KEY = 'kiwiDayCutoff';       /* par magasin : kiwiDayCutoff:<slug> */
  var DEFAULT_CUTOFF = 5;                 /* 05:00 — couvre les services de nuit */
  /* ── COMBIEN DE JOURNÉES ON GARDE, ET POURQUOI CES NOMBRES-LÀ ──────────────
   * Le classeur est UN document JSON dans store_docs, et /api/store le passe par
   * un bornage générique (functions/api/store.js) : au plus 400 clés dans un
   * objet, au plus 120 000 nœuds dans tout le document. Dépasser l'un ou
   * l'autre fait REFUSER l'écriture — et un refus ici est le pire des échecs
   * possibles, parce qu'il est silencieux : la copie locale continue de vivre,
   * le commerçant ne voit rien, et le jour où il ouvre Kiwi sur un autre
   * appareil ses rapports n'y sont pas.
   *
   * On reste donc franchement en dessous des deux plafonds. 370 journées, c'est
   * un exercice comptable entier plus un mois de marge, et 30 clés de rab avant
   * la limite du serveur. Le budget de nœuds est le vrai garde-fou : une
   * brasserie qui vend 90 références par jour pèse ~500 nœuds la journée, soit
   * 185 000 sur un an — au-delà du plafond. `pruneToBudget()` élague donc les
   * journées les plus ANCIENNES jusqu'à tenir, au lieu de laisser le serveur
   * refuser tout le classeur. Un magasin ordinaire (20 à 40 références par jour)
   * garde ses 370 journées sans jamais approcher le budget. */
  var KEEP_DAYS = 370;
  var NODE_BUDGET = 90000;                /* 75 % du plafond serveur : la marge est volontaire */

  /* La clé de regroupement des produits dont on ne connaît pas la catégorie.
     Une clé MACHINE, jamais affichée : le rapport sort avec un vrai libellé
     ("Divers") et un drapeau `uncat`, pour qu'aucun lecteur n'ait à reconnaître
     un fourre-tout en comparant des chaînes. Un commerçant a parfaitement le
     droit d'appeler un rayon « Divers » ; le sien ne doit pas se confondre avec
     celui-ci. */
  var UNCAT = '__kiwi_uncat__';

  /* ─────────────────────────── petits outils ─────────────────────────── */

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function num(n) { var x = +n; return isFinite(x) ? x : 0; }
  function round2(n) { return Math.round(num(n) * 100) / 100; }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  /* Le slug du magasin — la seule clé sur laquelle la caisse et le tableau de
     bord tombent d'accord. Même cascade que clients-store.js bookId(), pour
     qu'un magasin n'ait jamais deux carnets de rapports. */
  function slugStore(name) {
    return String(name == null ? '' : name).toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 64);
  }
  function storeSlug() {
    /* 1) TABLEAU DE BORD : le magasin actuellement à l'écran. Il passe devant
     *    kiwiLiveMerchant parce que ce global est unique — sur un compte à deux
     *    boutiques il retient la dernière active, et le patron qui regarde le
     *    restaurant verrait le rapport de la boutique. */
    try {
      var KV = window.KiwiVenue;
      if (KV && KV.isCustom && KV.isCustom() && KV.getCurrentVenueData) {
        var vd = KV.getCurrentVenueData();
        // Le slug gravé de l'établissement (venues.js › slugOf) plutôt qu'une
        // re-slugification du nom : sinon corriger l'enseigne ouvre un cahier
        // de clôtures vierge à côté de celui qui contient l'année.
        var s = vd && ((vd.slug || '') || (vd.name && slugStore(vd.name)));
        if (s) return s;
      }
    } catch (_) {}
    /* 2) la colonne vertébrale, écrite des deux côtés à l'appairage. */
    var m = ls('kiwiLiveMerchant'); if (m) return m;
    /* 3) CAISSE : le magasin appairé. */
    try {
      var pv = window.KiwiCaissePairing && window.KiwiCaissePairing.pairedVenue
        && window.KiwiCaissePairing.pairedVenue();
      if (pv && pv.merchant) return pv.merchant;
    } catch (_) {}
    try {
      var pv2 = JSON.parse(ls('kiwiPairedVenue') || 'null');
      if (pv2 && pv2.name) return slugStore(pv2.name);
    } catch (_) {}
    return '';
  }

  /* Vrai commerce ? Même règle que pos-sale.js et cloud-doc.js : une démo ne
     doit ni écrire ni relire de rapports, sinon un terminal qui a servi un vrai
     magasin puis repasse en démo ressort les chiffres du commerçant. */
  function isReal() {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      if (JSON.parse(ls('kiwiPairedVenue') || 'null')) return true;
    } catch (_) {}
    try { return !!(window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()); } catch (_) {}
    return false;
  }

  /* ──────────────────── la journée commerciale ──────────────────── */

  function cutoff(slug) {
    var k = CUTOFF_KEY + ':' + (slug || storeSlug());
    var raw = ls(k);
    if (raw == null) raw = ls(CUTOFF_KEY);            /* réglage hérité, tous magasins */
    var h = parseInt(raw, 10);
    if (isFinite(h) && h >= 0 && h <= 12) return h;   /* réglage explicite : il gagne */
    /* Rien d'explicite ? L'établissement sait à quelle heure il ferme — on le
     * lui demande plutôt que de garder un 5 h arbitraire. Un restaurant qui
     * ferme à 03:00 avait ses fins de nuit rangées dans le lendemain ; ses
     * horaires le disent maintenant sans que personne ait à régler quoi que ce
     * soit.
     *
     * derivedCutoff() ne renvoie JAMAIS moins que le plancher qu'on lui passe.
     * C'est délibéré : raccourcir la bascule d'un magasin déjà en service
     * couperait une soirée en cours en deux journées commerciales, et le
     * rapport du soir se retrouverait à cheval. On ne fait que rallonger. */
    try {
      var d = window.KiwiHours && window.KiwiHours.derivedCutoff
        && window.KiwiHours.derivedCutoff(slug || undefined, DEFAULT_CUTOFF);
      /* `typeof d === 'number'` et pas seulement isFinite(d) : derivedCutoff
       * rend null quand l'établissement n'a aucun service de nuit, et
       * isFinite(null) vaut TRUE en JavaScript (Number(null) === 0). Sans ce
       * test, un commerce fermant à 18 h se retrouvait avec une bascule à
       * `null`, et toutes les dates du rapport partaient en NaN. */
      if (typeof d === 'number' && isFinite(d) && d >= 0 && d <= 12) return d;
    } catch (_) {}
    return DEFAULT_CUTOFF;
  }
  function setCutoff(h, slug) {
    var v = parseInt(h, 10);
    if (!isFinite(v) || v < 0 || v > 12) return cutoff(slug);
    lset(CUTOFF_KEY + ':' + (slug || storeSlug()), String(v));
    return v;
  }

  /* businessDay(ts) → 'YYYY-MM-DD'. Une vente à 00h30 avec un seuil à 5h rend
     la date de la VEILLE : 00h30 − 5h = 19h30 hier. C'est exactement ce qu'un
     patron entend par « la recette d'hier soir ». */
  function businessDay(ts, slug) {
    var t = (ts instanceof Date) ? ts.getTime() : num(ts || Date.now());
    return ymd(new Date(t - cutoff(slug) * 3600000));
  }
  /* Les bornes réelles d'une journée commerciale, en millisecondes. */
  function dayBounds(day, slug) {
    var p = String(day || '').split('-');
    var d = new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1, cutoff(slug), 0, 0, 0);
    return { from: d.getTime(), to: d.getTime() + 24 * 3600000 };
  }
  function today(slug) { return businessDay(Date.now(), slug); }
  /* La dernière journée TERMINÉE — celle que le patron regarde le matin. */
  function lastClosedDay(slug) {
    var b = dayBounds(today(slug), slug);
    return businessDay(b.from - 1000, slug);
  }
  function shiftDay(day, delta, slug) {
    var b = dayBounds(day, slug);
    return businessDay(b.from + num(delta) * 24 * 3600000 + 3600000, slug);
  }

  /* ──────────────────── le vocabulaire du métier ──────────────────── */

  /* Un restaurant vend des plats rangés en familles, une boutique des articles
     rangés en rayons. Le rapport doit parler la langue du commerce qu'il décrit,
     sinon il a l'air d'un logiciel générique posé par-dessus. */
  var VOCAB = {
    restaurant: {
      fr: { item: 'plat', items: 'plats', cat: 'famille', cats: 'familles', sold: 'vendus' },
      en: { item: 'dish', items: 'dishes', cat: 'section', cats: 'sections', sold: 'sold' },
      ar: { item: 'طبق', items: 'أطباق', cat: 'قسم', cats: 'أقسام', sold: 'مباع' },
    },
    boutique: {
      fr: { item: 'article', items: 'articles', cat: 'rayon', cats: 'rayons', sold: 'vendus' },
      en: { item: 'item', items: 'items', cat: 'department', cats: 'departments', sold: 'sold' },
      ar: { item: 'صنف', items: 'أصناف', cat: 'قسم', cats: 'أقسام', sold: 'مباع' },
    },
    spa: {
      fr: { item: 'prestation', items: 'prestations', cat: 'catégorie', cats: 'catégories', sold: 'réalisées' },
      en: { item: 'service', items: 'services', cat: 'category', cats: 'categories', sold: 'performed' },
      ar: { item: 'خدمة', items: 'خدمات', cat: 'فئة', cats: 'فئات', sold: 'منجزة' },
    },
    hotel: {
      fr: { item: 'prestation', items: 'prestations', cat: 'catégorie', cats: 'catégories', sold: 'vendues' },
      en: { item: 'service', items: 'services', cat: 'category', cats: 'categories', sold: 'sold' },
      ar: { item: 'خدمة', items: 'خدمات', cat: 'فئة', cats: 'فئات', sold: 'مباعة' },
    },
    generic: {
      fr: { item: 'produit', items: 'produits', cat: 'catégorie', cats: 'catégories', sold: 'vendus' },
      en: { item: 'product', items: 'products', cat: 'category', cats: 'categories', sold: 'sold' },
      ar: { item: 'منتج', items: 'منتجات', cat: 'فئة', cats: 'فئات', sold: 'مباع' },
    },
  };
  /* Le libellé du fourre-tout, commun à tous les métiers. */
  var UNCAT_LABEL = { fr: 'Divers', en: 'Other', ar: 'متفرقات' };
  /* Les sous-types (pizzeria, fastfood, epicerie…) retombent sur leur base : le
     vocabulaire d'une pizzeria est celui d'un restaurant. */
  var BASE_OF = {
    pizzeria: 'restaurant', fastfood: 'restaurant', foodtruck: 'restaurant',
    traiteur: 'restaurant', boulangerie: 'restaurant', cafe: 'restaurant',
    epicerie: 'boutique', pharmacie: 'boutique', librairie: 'boutique',
    fleuriste: 'boutique', pressing: 'boutique',
    coiffure: 'spa', gym: 'spa', institut: 'spa',
  };
  function businessType() {
    var t = '';
    try { t = (window.KiwiConfig && window.KiwiConfig.type) || ''; } catch (_) {}
    if (!t) { try { t = (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && (window.KiwiVenue.getCurrentVenueData() || {}).type) || ''; } catch (_) {} }
    if (!t) { try { t = (JSON.parse(ls('kiwiPairedVenue') || 'null') || {}).type || ''; } catch (_) {} }
    t = String(t || '').toLowerCase();
    return BASE_OF[t] || (VOCAB[t] ? t : 'generic');
  }
  function lang() {
    try { return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; }
  }
  function vocab(type, l) {
    var base = VOCAB[type || businessType()] || VOCAB.generic;
    var k = l || lang();
    var v = base[k] || base.fr;
    return { item: v.item, items: v.items, cat: v.cat, cats: v.cats, sold: v.sold,
             uncat: UNCAT_LABEL[k] || UNCAT_LABEL.fr };
  }

  /* ──────────────────── produit → catégorie ──────────────────── */

  /* L'index du catalogue ACTUEL, par nom normalisé. Sert de repêchage pour tout
     l'historique écrit avant que les ventes ne portent leur catégorie. */
  function categoryIndex() {
    var idx = Object.create(null);
    var put = function (name, cat) {
      var k = String(name || '').trim().toLowerCase();
      if (k && cat && !idx[k]) idx[k] = String(cat).trim();
    };
    /* Boutique — rayons. */
    try {
      var BC = window.KiwiBoutiqueCatalog;
      if (BC && BC.listProducts) {
        var cats = Object.create(null);
        (BC.listCategories() || []).forEach(function (c) { if (c && c.id) cats[c.id] = c.name; });
        (BC.listProducts({ all: true }) || []).forEach(function (p) { if (p) put(p.name, cats[p.categoryId]); });
      }
    } catch (_) {}
    /* Restaurant / prestations — la carte. */
    try {
      var MS = window.KiwiMenuStore;
      var d = MS && MS.data && MS.data();
      if (d) {
        var mc = Object.create(null);
        (d.cats || []).forEach(function (c) { if (c && c.id) mc[c.id] = c.name; });
        (d.items || []).forEach(function (it) { if (it) put(it.name, mc[it.catId]); });
      }
    } catch (_) {}
    /* La carte de démonstration exposée par venues.js (KiwiMenu.items). */
    try {
      var KM = window.KiwiMenu;
      if (KM && KM.items) (KM.items() || []).forEach(function (it) { if (it) put(it.name, it.category); });
    } catch (_) {}
    return idx;
  }

  /* ──────────────────── construire le rapport ──────────────────── */

  /* Normalise une vente, d'où qu'elle vienne : le journal de la caisse
     ({time, amount, method, lines:[{name,qty,total}]}) ou KiwiSales côté
     tableau de bord ({ts, amount, method, lines:[{name,qty,total}]}), ou encore
     la ligne brute du serveur ({t, n, q}). Une seule forme ensuite. */
  function normSale(s) {
    if (!s) return null;
    var ts = s.ts != null ? s.ts : (s.time instanceof Date ? s.time.getTime() : +new Date(s.time || 0));
    if (!isFinite(ts) || !ts) return null;
    var amount = num(s.amount != null ? s.amount : s.total);
    var lines = null;
    if (Array.isArray(s.lines) && s.lines.length) {
      lines = s.lines.map(function (l) {
        if (!l) return null;
        return {
          name: String(l.name != null ? l.name : (l.n != null ? l.n : 'Article')).slice(0, 60),
          qty: num(l.qty != null ? l.qty : l.q) || 0,
          total: num(l.total != null ? l.total : l.t) || 0,
          cat: l.cat != null ? String(l.cat) : (l.c != null ? String(l.c) : ''),
        };
      }).filter(Boolean);
      if (!lines.length) lines = null;
    }
    return {
      id: String(s.id || s.ref || ('s' + ts)),
      ts: ts,
      amount: amount,
      method: String(s.method || 'cash').toLowerCase(),
      label: String(s.label || ''),
      ref: String(s.ref || ''),
      kind: String(s.kind || ''),
      tip: num(s.tip),
      discount: num(s.discount),
      cashier: String(s.cashier || ''),
      lines: lines,
    };
  }

  /* build({ day, sales, session, store }) → le rapport complet.
   *
   * `sales`   toutes les ventes connues (elles seront filtrées sur la journée)
   * `session` ce que SEULE la caisse sait : fond d'ouverture, mouvements
   *           d'espèces, comptage, qui a ouvert / fermé, remises accordées.
   * `store`   { slug, name, location, type } — l'en-tête du document.
   */
  function build(opts) {
    opts = opts || {};
    var slug = opts.store && opts.store.slug || storeSlug();
    var day = opts.day || today(slug);
    var b = dayBounds(day, slug);
    var sess = opts.session || {};
    var idx = opts.categoryIndex || categoryIndex();
    var uncatLabel = vocab().uncat;

    /* Le filtre sur la journée commerciale. Dédoublonné par id : la caisse
       garde son journal ET reçoit l'écho serveur de ses propres ventes, et une
       vente comptée deux fois est exactement ce que ce rapport doit empêcher. */
    var seen = Object.create(null);
    var rows = [];
    (opts.sales || []).forEach(function (raw) {
      var s = normSale(raw);
      if (!s || s.ts < b.from || s.ts >= b.to) return;
      var k = s.id || (s.ts + ':' + s.amount + ':' + s.ref);
      if (seen[k]) return;
      seen[k] = 1;
      rows.push(s);
    });
    rows.sort(function (a, c) { return a.ts - c.ts; });

    /* ── agrégats ──
       Un remboursement est une vente de montant négatif OU une entrée marquée
       kind:'refund'. Les deux existent dans le journal : on compte la MAGNITUDE
       dans `refunds` et on laisse le montant signé peser sur le net. */
    var gross = 0, refundAmt = 0, refundN = 0, txns = 0;
    var methods = Object.create(null);
    var tips = 0, cashTips = 0;
    var withLines = 0, totalForCoverage = 0;
    var cats = Object.create(null);
    var first = 0, last = 0;
    /* La courbe horaire, indexée sur l'OFFSET depuis le seuil de journée et non
       sur l'heure de l'horloge : à 5h de seuil, le coup de feu de minuit doit
       tomber APRÈS celui de 22h, pas dix-neuf cases avant lui. L'heure lisible
       repart de l'offset au moment de l'écriture. Tableau creux : un commerce
       ouvre douze heures, pas vingt-quatre, et chaque case coûte au budget. */
    var hours = new Array(24);
    var cut = cutoff(slug);
    /* Qui a encaissé quoi. Ne sort que si les ventes portent un nom — le
       clavier de la caisse en met un, une commande OrderPro non. */
    var byCashier = Object.create(null);

    rows.forEach(function (s) {
      var isRefund = s.kind === 'refund' || s.amount < 0;
      var mag = Math.abs(s.amount);
      if (isRefund) { refundAmt += mag; refundN++; }
      else { gross += s.amount; txns++; }
      if (!first || s.ts < first) first = s.ts;
      if (s.ts > last) last = s.ts;

      var m = s.method || 'cash';
      methods[m] = round2(num(methods[m]) + (isRefund ? -mag : s.amount));
      tips += s.tip;
      if (m === 'cash') cashTips += s.tip;

      var off = Math.floor((s.ts - b.from) / 3600000);
      if (off >= 0 && off < 24) {
        var H = hours[off] || (hours[off] = { h: (cut + off) % 24, net: 0, txns: 0 });
        H.net += isRefund ? -mag : s.amount;
        if (!isRefund) H.txns++;
      }
      if (s.cashier) {
        var CA = byCashier[s.cashier] || (byCashier[s.cashier] = { name: s.cashier, net: 0, txns: 0 });
        CA.net += isRefund ? -mag : s.amount;
        if (!isRefund) CA.txns++;
      }

      if (!isRefund) {
        totalForCoverage += s.amount;
        if (s.lines) withLines += s.amount;
      }

      /* Détail produit. Un remboursement RETIRE ses lignes du classement —
         sinon un article vendu puis rendu resterait affiché comme vendu. */
      if (s.lines) {
        var sign = isRefund ? -1 : 1;
        s.lines.forEach(function (l) {
          var name = l.name || 'Article';
          var cat = l.cat || idx[name.trim().toLowerCase()] || UNCAT;
          var C = cats[cat] || (cats[cat] = { name: cat, qty: 0, total: 0, products: Object.create(null) });
          var P = C.products[name] || (C.products[name] = { name: name, qty: 0, total: 0 });
          P.qty += sign * l.qty; P.total += sign * l.total;
          C.qty += sign * l.qty; C.total += sign * l.total;
        });
      }
    });

    /* Le tri : la catégorie qui rapporte le plus en premier, « Divers » à la
       fin quoi qu'il arrive — c'est un fourre-tout, pas un rayon. */
    var categories = Object.keys(cats).map(function (k) {
      var C = cats[k];
      var prods = Object.keys(C.products).map(function (p) { return C.products[p]; })
        .filter(function (p) { return p.qty !== 0 || p.total !== 0; })
        .sort(function (a, c) { return c.total - a.total || c.qty - a.qty; })
        .map(function (p) { return { name: p.name, qty: round2(p.qty), total: round2(p.total) }; });
      /* On sort un LIBELLÉ, pas la clé de regroupement, plus un drapeau. Les
         deux lecteurs (page et imprimante) affichent `name` sans rien savoir,
         et `uncat` reste là pour trier et pour retraduire à l'affichage. */
      var isUncat = C.name === UNCAT;
      var out = { name: isUncat ? uncatLabel : C.name, qty: round2(C.qty), total: round2(C.total), products: prods };
      if (isUncat) out.uncat = true;
      return out;
    }).filter(function (c) { return c.products.length; })
      .sort(function (a, c) {
        var ad = !!a.uncat, cd = !!c.uncat;
        if (ad !== cd) return ad ? 1 : -1;
        return c.total - a.total;
      });

    /* ── le tiroir ──
       Attendu = fond d'ouverture + espèces encaissées + pourboires espèces
       + entrées − sorties − remboursements rendus en espèces. Les pourboires
       carte ne tombent pas dans le tiroir, ils ne comptent pas. */
    var moves = (sess.cashMovements || []).map(function (m) {
      return {
        ts: (m.time instanceof Date) ? m.time.getTime() : num(m.ts || m.time),
        type: m.type === 'out' ? 'out' : 'in',
        amount: Math.abs(num(m.amount)),
        reason: String(m.reason || ''),
      };
    }).filter(function (m) { return m.amount > 0 && m.ts >= b.from && m.ts < b.to; });
    var movesIn = 0, movesOut = 0;
    moves.forEach(function (m) { if (m.type === 'in') movesIn += m.amount; else movesOut += m.amount; });

    var cashSales = round2(num(methods.cash));   /* déjà net des remboursements espèces */
    var opening = num(sess.openingFloat);
    var expected = round2(opening + cashSales + cashTips + movesIn - movesOut);
    var counted = (sess.countedCash == null || sess.countedCash === '') ? null : round2(sess.countedCash);
    var ecart = counted == null ? null : round2(counted - expected);

    var discounts = round2(sess.discounts);
    var discountsN = num(sess.discountsCount) || 0;
    var cancels = num(sess.cancels) || 0;

    var net = round2(gross - refundAmt);

    return {
      v: VER,
      day: day,
      cutoff: cutoff(slug),
      store: {
        slug: slug,
        name: (opts.store && opts.store.name) || '',
        location: (opts.store && opts.store.location) || '',
        type: (opts.store && opts.store.type) || businessType(),
      },
      openedAt: num(sess.openedAt) || first || 0,
      closedAt: num(sess.closedAt) || 0,
      /* La journée est close quand la caisse a posé une heure de fermeture, et
         à ce moment-là seulement. Le drapeau existait déjà côté lecteurs —
         chip de statut, tampon PROVISOIRE du ticket — mais personne ne
         l'écrivait : toute journée clôturée s'affichait « non clôturée » et
         s'imprimait provisoire. */
      closed: !!num(sess.closedAt),
      firstSaleAt: first || 0,
      lastSaleAt: last || 0,
      openedBy: String(sess.openedBy || ''),
      closedBy: String(sess.closedBy || ''),
      txns: txns,
      gross: round2(gross),
      net: net,
      basket: txns ? round2(gross / txns) : 0,
      refunds: { count: refundN, amount: round2(refundAmt) },
      discounts: { count: discountsN, amount: discounts },
      cancels: cancels,
      methods: methods,
      tips: round2(tips),
      categories: categories,
      hours: hours.map(function (H) { return { h: H.h, net: round2(H.net), txns: H.txns }; }).filter(Boolean),
      cashiers: Object.keys(byCashier).map(function (k) {
        return { name: byCashier[k].name, net: round2(byCashier[k].net), txns: byCashier[k].txns };
      }).sort(function (a, c) { return c.net - a.net; }),
      coverage: totalForCoverage > 0 ? Math.round(withLines / totalForCoverage * 100) : (txns ? 0 : 100),
      cash: {
        opening: round2(opening),
        sales: cashSales,
        tips: round2(cashTips),
        movesIn: round2(movesIn),
        movesOut: round2(movesOut),
        movements: moves,
        expected: expected,
        counted: counted,
        ecart: ecart,
      },
      handovers: (sess.handovers || []).map(function (h) {
        return {
          ts: (h.time instanceof Date) ? h.time.getTime() : num(h.ts || h.time),
          from: String(h.fromName || h.from || ''),
          to: String(h.toName || h.to || ''),
          ecart: num(h.ecart),
        };
      }),
      closedCount: 0,
      revisions: [],
      builtAt: Date.now(),
      source: String(opts.source || 'caisse'),
    };
  }

  /* ──────────────────── le classeur ──────────────────── */

  function localKey(slug) { return LOCAL_PREFIX + (slug || storeSlug()); }
  function readAll(slug) {
    if (!isReal()) return { days: {} };
    var raw = null;
    try { raw = JSON.parse(ls(localKey(slug)) || 'null'); } catch (_) { raw = null; }
    if (!raw || typeof raw !== 'object' || !raw.days) return { days: {} };
    return raw;
  }
  /* Le coût d'une journée en nœuds, dans la même unité que le compteur du
     serveur : un nœud par valeur et par conteneur. On n'a pas besoin d'être
     exact, seulement de ne jamais SOUS-estimer — d'où les arrondis vers le
     haut sur l'enveloppe. */
  function nodeCost(r) {
    var n = 40;                                   /* enveloppe : totaux, tiroir, méthodes */
    n += (r.cash && r.cash.movements ? r.cash.movements.length : 0) * 5;
    n += (r.handovers || []).length * 5;
    n += (r.revisions || []).length * 7;
    n += (r.hours || []).length * 4;        /* au plus 24 — une par heure ouverte */
    n += (r.cashiers || []).length * 4;
    (r.categories || []).forEach(function (c) {
      n += 5 + (c.products || []).length * 4;
    });
    return n;
  }
  /* Élague les journées les plus ANCIENNES jusqu'à tenir dans le budget. On
     coupe par le passé et jamais par le présent : le rapport d'hier matin est
     celui qu'on ouvre, celui de l'an dernier est celui qu'on archive. */
  function pruneToBudget(doc) {
    var keys = Object.keys(doc.days || {}).sort();          /* ancien → récent */
    while (keys.length > KEEP_DAYS) { delete doc.days[keys.shift()]; }
    var total = 0;
    keys.forEach(function (k) { total += nodeCost(doc.days[k]); });
    while (total > NODE_BUDGET && keys.length > 1) {
      var oldest = keys.shift();
      total -= nodeCost(doc.days[oldest]);
      delete doc.days[oldest];
    }
    return doc;
  }

  function writeAll(doc, slug) {
    try { pruneToBudget(doc); } catch (_) {}
    try { lset(localKey(slug), JSON.stringify(doc)); } catch (_) {}
    push();
  }

  function load(day, slug) {
    var d = readAll(slug);
    return (d.days && d.days[day]) || null;
  }
  function list(slug) {
    var d = readAll(slug);
    return Object.keys(d.days || {}).sort().reverse().map(function (k) { return d.days[k]; });
  }
  function days(slug) { return Object.keys(readAll(slug).days || {}).sort().reverse(); }

  /* save(report, {by, note, reopen}) — LA règle de la double clôture.
   *
   * Le rapport entrant a été RECALCULÉ depuis le journal : il est déjà juste.
   * On ne fusionne donc pas des totaux, on remplace le document et on hérite
   * de son historique. `closedCount` et `revisions` sont la mémoire de la
   * journée — combien de fois on l'a fermée, et ce que chaque fermeture a vu.
   * Sans ça, une réouverture pour corriger un écart de caisse effacerait la
   * trace de la première clôture, ce qu'aucun comptable n'accepte. */
  function save(report, meta) {
    if (!report || !report.day) return null;
    if (!isReal()) return report;               /* la démo ne classe rien */
    meta = meta || {};
    var slug = (report.store && report.store.slug) || storeSlug();
    var doc = readAll(slug);
    if (!doc.days) doc.days = {};
    var prev = doc.days[report.day] || null;

    report.closedCount = (prev ? num(prev.closedCount) : 0) + (meta.reopen === false ? 0 : 1);
    report.revisions = (prev && Array.isArray(prev.revisions) ? prev.revisions.slice(-19) : []);
    report.revisions.push({
      at: Date.now(),
      by: String(meta.by || report.closedBy || ''),
      gross: report.gross,
      txns: report.txns,
      ecart: report.cash ? report.cash.ecart : null,
      note: String(meta.note || (prev ? 'réouverture' : 'clôture')),
    });
    if (prev && prev.openedAt && !report.openedAt) report.openedAt = prev.openedAt;
    if (prev && prev.openedBy && !report.openedBy) report.openedBy = prev.openedBy;

    doc.days[report.day] = report;
    writeAll(doc, slug);
    notify(report.day);
    return report;
  }

  /* ──────────────────── la copie serveur ──────────────────── */

  var docHandle = null;
  function cloud() {
    if (docHandle || !window.KiwiCloudDoc) return docHandle;
    docHandle = window.KiwiCloudDoc.attach({
      feature: 'dayreports',
      slug: function () { return storeSlug(); },
      read: function () { return readAll(); },
      write: function (d) {
        if (!d || !d.days) return;
        try { lset(localKey(), JSON.stringify(d)); } catch (_) {}
        notify(null);
      },
      isEmpty: function (d) { return !d || !d.days || !Object.keys(d.days).length; },
      /* FUSION — la seule qui ne perde rien. Deux caisses du même magasin
         clôturent chacune de leur côté : on garde LES DEUX journées, et si
         elles décrivent la MÊME journée on garde celle qui a été clôturée en
         dernier (elle a vu plus de ventes), en concaténant les révisions pour
         que la trace des deux fermetures survive. */
      merge: function (mine, theirs) {
        var out = { days: {} };
        var a = (mine && mine.days) || {}, c = (theirs && theirs.days) || {};
        Object.keys(a).forEach(function (k) { out.days[k] = a[k]; });
        Object.keys(c).forEach(function (k) {
          var m = out.days[k], t = c[k];
          if (!m) { out.days[k] = t; return; }
          var keep = (num(t.builtAt) > num(m.builtAt)) ? t : m;
          var other = keep === t ? m : t;
          var revs = (other.revisions || []).concat(keep.revisions || []);
          /* Dédoublonnage sur l'horodatage : la même clôture remontée deux fois
             ne doit pas apparaître deux fois dans l'historique. */
          var seenR = Object.create(null);
          keep = Object.assign({}, keep, {
            revisions: revs.filter(function (r) {
              var kk = r && r.at; if (!kk || seenR[kk]) return false; seenR[kk] = 1; return true;
            }).sort(function (x, y) { return x.at - y.at; }).slice(-20),
            closedCount: Math.max(num(m.closedCount), num(t.closedCount)),
          });
          out.days[k] = keep;
        });
        /* La fusion de deux classeurs peut dépasser le budget que chacun
           respectait séparément — c'est le résultat de la fusion qui repart au
           serveur, donc c'est lui qu'il faut borner. */
        try { pruneToBudget(out); } catch (_) {}
        return out;
      },
    });
    return docHandle;
  }
  function push() { try { var c = cloud(); if (c && c.push) c.push(); } catch (_) {} }
  function pull() { try { var c = cloud(); if (c && c.pull) c.pull(); } catch (_) {} }
  /* La clôture recharge la page juste après. push() est débattu (il attend un
     temps mort pour grouper les écritures) : sans flush(), le rapport partirait
     APRÈS que l'onglet soit mort, c'est-à-dire jamais. */
  function flush() { try { var c = cloud(); if (c && c.flush) c.flush(); } catch (_) {} }

  /* ──────────────────── abonnements ──────────────────── */

  var subs = new Set();
  function notify(day) { subs.forEach(function (fn) { try { fn(day); } catch (_) {} }); }
  /* Un autre onglet (la caisse à côté du tableau de bord) qui clôture. */
  window.addEventListener('storage', function (e) {
    if (e && e.key && e.key.indexOf(LOCAL_PREFIX) === 0) notify(null);
  });

  window.KiwiDayReport = {
    /* journée commerciale */
    businessDay: businessDay, dayBounds: dayBounds, today: today,
    lastClosedDay: lastClosedDay, shiftDay: shiftDay,
    cutoff: cutoff, setCutoff: setCutoff,
    /* langue du métier */
    vocab: vocab, businessType: businessType,
    /* calcul */
    build: build, categoryIndex: categoryIndex, normSale: normSale,
    /* classeur */
    save: save, load: load, list: list, days: days,
    storeSlug: storeSlug, isReal: isReal,
    /* serveur */
    push: push, pull: pull, flush: flush,
    subscribe: function (fn) { subs.add(fn); return function () { subs.delete(fn); }; },
  };

  /* Hydrate au chargement : sans ça, un navigateur neuf a un classeur vide et
     le premier `push()` effacerait les rapports du serveur (règle 3 de
     cloud-doc.js — ne jamais pousser avant d'avoir lu). */
  if (window.KiwiCloudDoc) { try { pull(); } catch (_) {} }
})();
