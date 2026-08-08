/* ═══════════════════════════════════════════════════════════════════════
 *  KIWI · LES MÉTIERS  (assets/trades.js)  →  window.KiwiTrades
 *
 *  Le type d'activité d'un établissement — « Restaurant », « Boutique »,
 *  « Salon de coiffure » — n'est pas une étiquette. C'est LE réglage qui
 *  décide de ce que le produit montre : la section verticale du tableau de
 *  bord, le vocabulaire de la barre latérale, les modules de la caisse
 *  (carte & tables pour un restaurant, catalogue & codes-barres pour une
 *  boutique, prestations & cabines pour un spa, chambres pour un hôtel).
 *
 *  Il existait QUATRE listes de métiers dans ce dépôt :
 *    · assets/onboarding.js  — l'inscription (14 métiers, sans hôtel)
 *    · assets/interactive.js — l'assistant PIN 0000 (15, sans « autre »)
 *    · assets/hotel.js       — le même assistant, réécrit avec l'hôtel (16)
 *    · assets/account.js     — une table d'étiquettes pour l'affichage (13)
 *  … et une CINQUIÈME, muette, dans assets/venues.js : la table qui traduit
 *  un métier en famille (SUBTYPE_BASE). Elle ignorait « traiteur » et
 *  « librairie », que deux des assistants proposaient pourtant — un traiteur
 *  créé au PIN 0000 retombait donc sur la famille par défaut, et le type
 *  renvoyé par le serveur ne s'appliquait jamais chez lui.
 *
 *  Pire : la fiche établissement (Mon profil → Mes établissements) offrait
 *  un CHAMP LIBRE. Le propriétaire pouvait écrire « boutique de fleurs »,
 *  « Resto », « n'importe quoi » — et rien ne se passait, parce qu'aucune de
 *  ces chaînes ne correspond à un métier connu. Un réglage qui accepte tout
 *  et n'applique rien est pire qu'un réglage absent : il fait croire au
 *  commerçant qu'il a configuré son établissement.
 *
 *  Ce fichier est la liste. Une seule. Tout le reste la lit.
 *
 *  Les IDENTIFIANTS sont un contrat : ils sont écrits dans les établissements
 *  déjà créés (`venue.subtype`) et poussés au serveur à l'inscription
 *  (`merchant_config.type`). On en ajoute, on n'en renomme jamais.
 *
 *  Pas de DOM au chargement, pas de dépendance. Vanilla, autonome.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var lang = function () {
    try {
      var I = window.KiwiI18n;
      if (I && I.getLang) return I.getLang() || 'fr';
      return localStorage.getItem('kiwiLang') || 'fr';
    } catch (_) { return 'fr'; }
  };
  var tr = function (o) {
    if (o == null) return '';
    if (typeof o === 'string') return o;
    var l = lang();
    return o[l] != null ? o[l] : (o.fr != null ? o.fr : '');
  };
  var ic = function (p) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
      + 'stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  };

  /* Les quatre FAMILLES. C'est ce que le moteur comprend : chaque métier en
   * hérite ses écrans. Un métier sans famille n'existe pas. */
  var BASES = ['restaurant', 'boutique', 'spa', 'hotel'];
  var BASE_LABEL = {
    restaurant: { fr: 'Restaurant', en: 'Restaurant', ar: 'مطعم' },
    boutique: { fr: 'Boutique', en: 'Shop', ar: 'متجر' },
    spa: { fr: 'Spa', en: 'Spa', ar: 'سبا' },
    hotel: { fr: 'Hôtel', en: 'Hotel', ar: 'فندق' },
  };

  /* Les canaux de vente sont une donnée du métier, pas une décision de mise
   * en page. Ils décrivent les voies crédibles par lesquelles CE métier vend ;
   * ils ne portent volontairement ni montant, ni objectif. Ces mesures
   * n'existent pas encore dans le journal KiwiSales et leur place n'est pas
   * dans un registre de vocabulaire. */
  var CHANNEL = {
    dining:    { fr: 'Salle',                 en: 'Dining room',          ar: 'القاعة' },
    terrace:   { fr: 'Terrasse',              en: 'Terrace',              ar: 'الشرفة' },
    counter:   { fr: 'Comptoir',              en: 'Counter',              ar: 'الشباك' },
    takeaway:  { fr: 'À emporter',            en: 'Takeaway',             ar: 'للأخذ' },
    delivery:  { fr: 'Livraison',             en: 'Delivery',             ar: 'التوصيل' },
    catering:  { fr: 'Événements',            en: 'Events',               ar: 'المناسبات' },
    pickup:    { fr: 'Réservation-retrait',   en: 'Reserve and collect',  ar: 'حجز واستلام' },
    store:     { fr: 'En boutique',           en: 'In store',             ar: 'في المتجر' },
    cabin:     { fr: 'En cabine',             en: 'Treatment room',       ar: 'في المقصورة' },
    home:      { fr: 'À domicile',            en: 'At home',              ar: 'في المنزل' },
    products:  { fr: 'Produits',              en: 'Products',             ar: 'المنتجات' },
    club:      { fr: 'Au club',               en: 'At the club',          ar: 'في النادي' },
    remote:    { fr: 'À distance',            en: 'Remote',               ar: 'عن بُعد' },
    direct:    { fr: 'Réservation directe',   en: 'Direct booking',       ar: 'حجز مباشر' },
    online:    { fr: 'Réservation en ligne',  en: 'Online booking',       ar: 'حجز عبر الإنترنت' },
    onsite:    { fr: 'Sur place',             en: 'On site',              ar: 'في المكان' },
  };
  var CHANNELS_BY_BASE = {
    restaurant: ['dining', 'terrace', 'takeaway', 'delivery'],
    boutique:   ['counter', 'pickup', 'delivery'],
    spa:        ['cabin', 'home', 'products'],
    hotel:      ['onsite', 'direct', 'online'],
  };
  var CHANNELS_BY_TRADE = {
    cafe:       ['dining', 'terrace', 'counter', 'takeaway'],
    fastfood:   ['counter', 'takeaway', 'delivery'],
    bakery:     ['counter', 'pickup', 'delivery'],
    pizzeria:   ['dining', 'takeaway', 'delivery'],
    traiteur:   ['catering', 'pickup', 'delivery'],
    foodtruck:  ['counter', 'takeaway', 'catering'],
    epicerie:   ['counter', 'delivery'],
    pharmacie:  ['counter', 'pickup', 'delivery'],
    librairie:  ['store', 'pickup', 'delivery'],
    fleuriste:  ['store', 'pickup', 'delivery'],
    pressing:   ['counter', 'pickup', 'delivery'],
    coiffure:   ['cabin', 'home', 'products'],
    sport:      ['club', 'remote', 'products'],
    autre:      ['onsite', 'remote'],
  };

  /* Les GROUPES sont une commodité d'affichage (les optgroup d'un menu
   * déroulant), pas une notion du moteur. Un commerçant cherche son métier
   * dans « Restauration », pas dans « base=restaurant ». */
  var GROUPS = [
    { id: 'food', label: { fr: 'Restauration', en: 'Food & drink', ar: 'المطاعم' } },
    { id: 'retail', label: { fr: 'Commerce', en: 'Retail', ar: 'التجارة' } },
    { id: 'care', label: { fr: 'Beauté & bien-être', en: 'Beauty & wellness', ar: 'الجمال والعافية' } },
    { id: 'stay', label: { fr: 'Hébergement', en: 'Hospitality', ar: 'الإقامة' } },
  ];

  /* `primary` = montré d'emblée dans les grilles d'icônes ; le reste vit
   * derrière « + Voir plus ». Six, pour couvrir les quatre familles et les
   * deux commerces les plus courants au Maroc. */
  var LIST = [
    /* ── Restauration ────────────────────────────────────────────────── */
    { id: 'restaurant', base: 'restaurant', group: 'food', primary: true,
      label: { fr: 'Restaurant', en: 'Restaurant', ar: 'مطعم' },
      icon: ic('<path d="M3 3v6a2 2 0 002 2h1v10M6 11V3M11 3c-1 0-2 1.6-2 4s1 4 2 4 2-1.6 2-4-1-4-2-4zM11 11v10"/>') },
    { id: 'cafe', base: 'restaurant', group: 'food', primary: true,
      label: { fr: 'Café / Salon de thé', en: 'Café / Tea room', ar: 'مقهى' },
      icon: ic('<path d="M17 8h1a4 4 0 010 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4z"/><path d="M6 2v2.5M10 2v2.5M14 2v2.5"/>') },
    { id: 'fastfood', base: 'restaurant', group: 'food',
      label: { fr: 'Fast-food / Snack', en: 'Fast food', ar: 'وجبات سريعة' },
      icon: ic('<path d="M3 11a9 9 0 0118 0"/><path d="M2 15h20"/><path d="M5 19h14a2 2 0 002-2H3a2 2 0 002 2z"/><path d="M7.5 7.6h.01M12 6.6h.01M16.5 7.6h.01"/>') },
    { id: 'bakery', base: 'restaurant', group: 'food',
      label: { fr: 'Boulangerie / Pâtisserie', en: 'Bakery', ar: 'مخبزة' },
      icon: ic('<path d="M4 13a8 4.5 0 0116 0v4.5A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5z"/><path d="M9.5 13.5v5M14.5 13.5v5"/>') },
    { id: 'pizzeria', base: 'restaurant', group: 'food',
      label: { fr: 'Pizzeria', en: 'Pizzeria', ar: 'بيتزيريا' },
      icon: ic('<path d="M3 7l9 14 9-14z"/><path d="M3 7a30 30 0 0118 0"/><path d="M9.5 11h.01M13 13.5h.01M11 16.5h.01"/>') },
    { id: 'traiteur', base: 'restaurant', group: 'food',
      label: { fr: 'Traiteur', en: 'Caterer', ar: 'خدمات تقديم الطعام' },
      icon: ic('<path d="M4 17a8 8 0 0116 0z"/><path d="M2 17h20"/><path d="M12 5v4"/><path d="M10.5 5h3"/>') },
    { id: 'foodtruck', base: 'restaurant', group: 'food',
      label: { fr: 'Food truck', en: 'Food truck', ar: 'شاحنة طعام' },
      icon: ic('<path d="M14 17V6a1 1 0 00-1-1H3a1 1 0 00-1 1v11h2"/><path d="M14 9h4l4 4v4h-2"/><path d="M9 17h2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>') },

    /* ── Commerce ────────────────────────────────────────────────────── */
    { id: 'boutique', base: 'boutique', group: 'retail', primary: true,
      label: { fr: 'Boutique', en: 'Shop', ar: 'متجر' },
      icon: ic('<path d="M6 2 3 6v13a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/>') },
    { id: 'epicerie', base: 'boutique', group: 'retail', primary: true,
      label: { fr: 'Épicerie / Superette', en: 'Grocery', ar: 'بقالة' },
      icon: ic('<path d="M3 4h2l2.6 11.4a1 1 0 001 .8h8.8a1 1 0 001-.8L21 8H6"/><circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/>') },
    { id: 'pharmacie', base: 'boutique', group: 'retail',
      label: { fr: 'Pharmacie', en: 'Pharmacy', ar: 'صيدلية' },
      icon: ic('<path d="M9.5 3h5a1 1 0 011 1v4.5H20a1 1 0 011 1v5a1 1 0 01-1 1h-4.5V20a1 1 0 01-1 1h-5a1 1 0 01-1-1v-4.5H4a1 1 0 01-1-1v-5a1 1 0 011-1h4.5V4a1 1 0 011-1z"/>') },
    { id: 'librairie', base: 'boutique', group: 'retail',
      label: { fr: 'Librairie / Papeterie', en: 'Bookshop', ar: 'مكتبة' },
      icon: ic('<path d="M12 7v14"/><path d="M3 18a1 1 0 01-1-1V4a1 1 0 011-1h5a3 3 0 013 3v14a3 3 0 00-3-3z"/><path d="M21 18a1 1 0 001-1V4a1 1 0 00-1-1h-5a3 3 0 00-3 3v14a3 3 0 013-3z"/>') },
    { id: 'fleuriste', base: 'boutique', group: 'retail',
      label: { fr: 'Fleuriste', en: 'Florist', ar: 'محل أزهار' },
      icon: ic('<path d="M12 22V12"/><path d="M12 12C9 12 7 9.5 7 6c4 0 5 2.5 5 6z"/><path d="M12 12c3 0 5-2.5 5-6-4 0-5 2.5-5 6z"/><path d="M8 22h8"/>') },
    /* Le pressing a SON comptoir (assets/pressing-caisse.js) depuis le début —
     * dépose, étiquettes par pièce, rack, retrait. Il manquait seulement ici,
     * donc un vrai pressing devait choisir « Autre activité », atterrissait sur
     * la base `boutique` et ouvrait la caisse boutique. Le métier existait, le
     * chemin pour y arriver non. */
    { id: 'pressing', base: 'boutique', group: 'retail',
      label: { fr: 'Pressing / Blanchisserie', en: 'Dry cleaner / Laundry', ar: 'مغسلة' },
      icon: ic('<path d="M12 3a2 2 0 00-1 3.73L3.6 11.4A1 1 0 004 13.3h16a1 1 0 00.4-1.9L13 6.73A2 2 0 0012 3z"/><path d="M4 13.3V19a2 2 0 002 2h12a2 2 0 002-2v-5.7"/>') },

    /* ── Beauté & bien-être ──────────────────────────────────────────── */
    { id: 'spa', base: 'spa', group: 'care', primary: true,
      label: { fr: 'Spa / Bien-être', en: 'Spa / Wellness', ar: 'سبا' },
      icon: ic('<path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>') },
    { id: 'coiffure', base: 'spa', group: 'care',
      label: { fr: 'Salon de coiffure', en: 'Hair salon', ar: 'صالون حلاقة' },
      icon: ic('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>') },
    { id: 'sport', base: 'spa', group: 'care',
      label: { fr: 'Salle de sport', en: 'Gym', ar: 'قاعة رياضية' },
      icon: ic('<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>') },

    /* ── Hébergement ─────────────────────────────────────────────────── */
    { id: 'hotel', base: 'hotel', group: 'stay', primary: true,
      label: { fr: 'Hôtel / Riad', en: 'Hotel / Riad', ar: 'فندق / رياض' },
      icon: ic('<path d="M3 21h18"/><path d="M5 21V7a2 2 0 012-2h10a2 2 0 012 2v14"/><path d="M9 9h2M13 9h2M9 13h2M13 13h2"/><path d="M10 21v-3h4v3"/>') },

    /* ── Le refuge ───────────────────────────────────────────────────────
     * « Autre activité » existe pour que personne ne soit bloqué à
     * l'inscription. Il vaut la famille Boutique — la plus neutre : un
     * catalogue et un panier, sans tables ni cabines. */
    { id: 'autre', base: 'boutique', group: 'retail',
      label: { fr: 'Autre activité', en: 'Something else', ar: 'نشاط آخر' },
      icon: ic('<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>') },
  ];

  var BY_ID = Object.create(null);
  LIST.forEach(function (t) { BY_ID[t.id] = t; });

  /* ── Reconnaître un métier écrit à la main ────────────────────────────
   * Des années de champ libre ont laissé des « Café · Restaurant », des
   * « Spa · Hammam », des « Restauration rapide ». On les rattache plutôt
   * que de les jeter : effacer le métier d'un client pour cause de faute de
   * frappe, c'est lui changer son tableau de bord sans le prévenir. */
  var norm = function (s) {
    /* NFD PUIS retrait des diacritiques, avant de jeter le reste : sans ça
     * « épicerie » perd son « é » entier et ne ressemble plus à rien.
     * Et on garde TOUTE lettre, pas seulement a–z. Un filtre [^a-z0-9]
     * réduisait « مقهى » à une chaîne vide : le métier d'un commerçant
     * enregistré en arabe cessait d'être reconnaissable. */
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  };
  var ALIAS = Object.create(null);
  var alias = function (id, list) { list.forEach(function (s) { ALIAS[norm(s)] = id; }); };
  LIST.forEach(function (t) {
    ALIAS[norm(t.id)] = t.id;
    ['fr', 'en', 'ar'].forEach(function (l) { if (t.label[l]) ALIAS[norm(t.label[l])] = t.id; });
  });
  alias('cafe', ['Café · Restaurant', 'Cafe Restaurant', 'Salon de thé', 'Coffee shop']);
  alias('restaurant', ['Restaurant · Traiteur', 'Resto', 'Restauration']);
  alias('fastfood', ['Restauration rapide', 'Snack', 'Fast food']);
  alias('bakery', ['Boulangerie', 'Pâtisserie', 'Patisserie']);
  alias('spa', ['Spa · Hammam', 'Hammam', 'Bien-être', 'Institut de beauté']);
  alias('sport', ['Sport & bien-être', 'Gym', 'Fitness']);
  alias('boutique', ['Magasin', 'Retail', 'Prêt-à-porter', 'Pret a porter']);
  alias('epicerie', ['Superette', 'Supérette', 'Alimentation générale']);
  alias('pressing', ['Blanchisserie', 'Laverie', 'Teinturerie', 'Nettoyage à sec', 'Nettoyage a sec',
    'Dry cleaning', 'Dry cleaner', 'Laundry', 'Laundromat', 'صباغة', 'تنظيف جاف']);
  alias('hotel', ['Riad', 'Maison d’hôtes', 'Maison d\'hotes', 'Hotellerie', 'Hôtellerie']);
  /* Les familles elles-mêmes : « boutique » et « restaurant » sont déjà des
   * identifiants, « spa » aussi ; seul « hotel » a besoin d'être dit. */

  /* Trop courts ou trop communs pour être cherchés dans une phrase. */
  var VAGUE = { spa: 1, cafe: 1, sport: 1, autre: 1 };

  /* Rend un identifiant de métier connu, ou '' si rien ne correspond.
   * Accepte un identifiant, une famille, ou une étiquette écrite à la main. */
  function resolve(any) {
    if (!any) return '';
    var raw = String(any).trim();
    if (BY_ID[raw]) return raw;
    var n = norm(raw);
    if (!n) return '';
    if (ALIAS[n]) return ALIAS[n];
    /* Dernier recours : « Boutique de fleurs » contient « boutique ». On garde
     * le mot le plus long, et on n'essaie QUE les identifiants assez
     * spécifiques pour ne pas piéger un mot ordinaire — « spa » vit dans
     * « espace », « sport » dans « transport », « cafe » dans « cafeteria ».
     * Reconnaître de travers est pire que ne pas reconnaître : le métier
     * décide des écrans du client. */
    var best = '';
    Object.keys(BY_ID).forEach(function (id) {
      if (id.length < 5 || VAGUE[id]) return;
      if (n.indexOf(id) >= 0 && id.length > best.length) best = id;
    });
    return best;
  }

  function get(id) { return BY_ID[resolve(id)] || null; }
  function base(id) {
    var t = get(id);
    if (t) return t.base;
    var raw = String(id || '').trim();
    return BASES.indexOf(raw) >= 0 ? raw : '';
  }
  /* L'étiquette à AFFICHER. Un métier inconnu et non vide garde son texte —
   * on ne remplace pas ce qu'un client a écrit par « Établissement ». */
  function label(id, fallback) {
    var t = get(id);
    if (t) return tr(t.label);
    var b = base(id);
    if (b) return tr(BASE_LABEL[b]);
    var raw = String(id || '').trim();
    if (raw) return raw;
    return fallback == null ? '' : fallback;
  }
  function baseLabel(b) { return tr(BASE_LABEL[b]) || ''; }
  function channels(id) {
    var tradeId = resolve(id);
    var ids = CHANNELS_BY_TRADE[tradeId];
    if (!ids) ids = CHANNELS_BY_BASE[base(id)] || CHANNELS_BY_TRADE.autre;
    return ids.map(function (channelId) {
      return { id: channelId, label: tr(CHANNEL[channelId]) || channelId };
    });
  }
  function all() { return LIST.slice(); }
  function primaries() { return LIST.filter(function (t) { return t.primary; }); }
  function secondaries() { return LIST.filter(function (t) { return !t.primary; }); }

  /* ── Deux façons de choisir ───────────────────────────────────────────
   * `cards()` — la grille d'icônes des assistants d'inscription : on découvre
   *   son métier en le voyant.
   * `options()` — le menu déroulant des réglages : on retrouve son métier en
   *   le cherchant, dans une fiche déjà dense. */
  function cards(selected, opts) {
    opts = opts || {};
    var sel = resolve(selected);
    var cls = opts.cls || 'ob-type';
    var moreCls = opts.moreCls || 'ob-more';
    var attr = opts.attr || 'data-ob-type';
    return LIST.map(function (t) {
      var hide = !t.primary ? ' ' + moreCls : '';
      return '<button type="button" class="' + cls + (t.id === sel ? ' sel' : '') + hide + '" '
        + attr + '="' + t.id + '">' + t.icon + '<span>' + esc(tr(t.label)) + '</span></button>';
    }).join('');
  }
  function options(selected, opts) {
    opts = opts || {};
    var sel = resolve(selected);
    var out = '';
    if (opts.placeholder) {
      out += '<option value=""' + (sel ? '' : ' selected') + '>' + esc(opts.placeholder) + '</option>';
    }
    GROUPS.forEach(function (g) {
      var items = LIST.filter(function (t) { return t.group === g.id; });
      if (!items.length) return;
      out += '<optgroup label="' + esc(tr(g.label)) + '">';
      items.forEach(function (t) {
        out += '<option value="' + t.id + '"' + (t.id === sel ? ' selected' : '') + '>'
          + esc(tr(t.label)) + '</option>';
      });
      out += '</optgroup>';
    });
    return out;
  }

  window.KiwiTrades = {
    LIST: LIST, BASES: BASES, GROUPS: GROUPS, CHANNELS: CHANNEL,
    all: all, primaries: primaries, secondaries: secondaries,
    get: get, base: base, label: label, baseLabel: baseLabel, resolve: resolve,
    channels: channels, cards: cards, options: options,
  };
})();
