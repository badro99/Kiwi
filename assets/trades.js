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
  /* Les icônes des métiers sont des Material Symbols (Outlined, 400, grade 0,
   * grille 24) recopiées telles quelles depuis assets/icons/material/ — le nom
   * du fichier source est en commentaire au-dessus de chaque tracé. Ce fichier
   * reste sans dépendance : il ne peut pas lire le dossier, il recopie.
   * Format natif de Material : viewBox 0 -960 960 960, forme pleine, pas de
   * tracé. Ne le convertissez pas ; la CSS pilote `color` comme avant. */
  var mi = function (d) {
    return '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">'
      + '<path d="' + d + '"/></svg>';
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
    // Nom de marque : jamais traduit, dans aucune langue.
    orderpro:  { fr: 'OrderPro',              en: 'OrderPro',             ar: 'OrderPro' },
  };
  var CHANNELS_BY_BASE = {
    restaurant: ['dining', 'takeaway', 'delivery', 'orderpro'],
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
      /* restaurant.svg */
      icon: mi('M280-80v-366q-51-14-85.5-56T160-600v-280h80v280h40v-280h80v280h40v-280h80v280q0 56-34.5 98T360-446v366h-80Zm400 0v-320H560v-280q0-83 58.5-141.5T760-880v800h-80Z') },
    { id: 'cafe', base: 'restaurant', group: 'food', primary: true,
      label: { fr: 'Café / Salon de thé', en: 'Café / Tea room', ar: 'مقهى' },
      /* local_cafe.svg */
      icon: mi('M160-120v-80h640v80H160Zm160-160q-66 0-113-47t-47-113v-400h640q33 0 56.5 23.5T880-760v120q0 33-23.5 56.5T800-560h-80v120q0 66-47 113t-113 47H320Zm0-80h240q33 0 56.5-23.5T640-440v-320H240v320q0 33 23.5 56.5T320-360Zm400-280h80v-120h-80v120ZM320-360h-80 400-320Z') },
    { id: 'fastfood', base: 'restaurant', group: 'food',
      label: { fr: 'Fast-food / Snack', en: 'Fast food', ar: 'وجبات سريعة' },
      /* lunch_dining.svg */
      icon: mi('M160-120q-33 0-56.5-23.5T80-200v-120h800v120q0 33-23.5 56.5T800-120H160Zm0-120v40h640v-40H160Zm263-160q-21 20-77 20t-76-20q-20-20-56-20t-57 20q-21 20-77 20v-80q36 0 57-20t77-20q56 0 76 20t56 20q36 0 57-20t77-20q56 0 77 20t57 20q36 0 56-20t76-20q56 0 79 20t55 20v80q-56 0-75-20t-55-20q-36 0-58 20t-78 20q-56 0-77-20t-57-20q-36 0-57 20ZM80-560v-40q0-115 108.5-177.5T480-840q183 0 291.5 62.5T880-600v40H80Zm400-200q-124 0-207.5 31T166-640h628q-23-58-106.5-89T480-760Zm0 520Zm0-400Z') },
    { id: 'bakery', base: 'restaurant', group: 'food',
      label: { fr: 'Boulangerie / Pâtisserie', en: 'Bakery', ar: 'مخبزة' },
      /* bakery_dining.svg */
      icon: mi('M804-282q17 9 30-4t4-30l-58-108-42 108 66 34Zm-200-38h48l96-238q3-8-1.5-13.5T736-580l-80-32q-9-3-17.5 2T628-596l-24 276Zm-296 0h48l-24-276q-2-11-10.5-15t-17.5-1l-80 32q-8 3-11.5 8.5T212-558l96 238Zm-152 38 66-34-42-108-58 108q-9 17 4 30t30 4Zm280-38h88l30-338q2-9-4.5-15.5T534-680H426q-8 0-14.5 6.5T406-658l30 338ZM138-200q-42 0-70-31.5T40-306q0-12 3.5-23.5T52-352l88-168q-14-40 1-79t53-55l80-32q14-5 28-7t28 1q14-29 39-48.5t57-19.5h108q32 0 57 19.5t39 48.5q14-2 28-.5t28 6.5l80 32q40 16 56 55t-2 77l88 168q6 11 9 23t3 25q0 45-30.5 75.5T814-200q-11 0-22-2.5t-22-7.5l-62-30H250l-56 30q-13 7-27.5 8.5T138-200Zm342-280Z') },
    { id: 'pizzeria', base: 'restaurant', group: 'food',
      label: { fr: 'Pizzeria', en: 'Pizzeria', ar: 'بيتزيريا' },
      /* local_pizza.svg */
      icon: mi('M480-80 80-680q85-72 186.5-116T480-840q112 0 213.5 43.5T880-680L480-80Zm0-144 292-438q-65-45-139-71.5T480-760q-79 0-152.5 26.5T188-662l292 438Zm-57.5-353.5Q440-595 440-620t-17.5-42.5Q405-680 380-680t-42.5 17.5Q320-645 320-620t17.5 42.5Q355-560 380-560t42.5-17.5Zm100 200Q540-395 540-420t-17.5-42.5Q505-480 480-480t-42.5 17.5Q420-445 420-420t17.5 42.5Q455-360 480-360t42.5-17.5ZM480-224Z') },
    { id: 'traiteur', base: 'restaurant', group: 'food',
      label: { fr: 'Traiteur', en: 'Caterer', ar: 'خدمات تقديم الطعام' },
      /* room_service.svg */
      icon: mi('M80-200v-80h800v80H80Zm40-120v-40q0-128 78.5-226T400-710v-10q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720v10q124 26 202 124t78 226v40H120Zm82-80h556q-14-104-93-172t-185-68q-106 0-184.5 68T202-400Zm278 0Z') },
    { id: 'foodtruck', base: 'restaurant', group: 'food',
      label: { fr: 'Food truck', en: 'Food truck', ar: 'شاحنة طعام' },
      /* local_shipping.svg */
      icon: mi('M155-195q-35-35-35-85H40v-440q0-33 23.5-56.5T120-800h560v160h120l120 160v200h-80q0 50-35 85t-85 35q-50 0-85-35t-35-85H360q0 50-35 85t-85 35q-50 0-85-35Zm113.5-56.5Q280-263 280-280t-11.5-28.5Q257-320 240-320t-28.5 11.5Q200-297 200-280t11.5 28.5Q223-240 240-240t28.5-11.5ZM120-360h32q17-18 39-29t49-11q27 0 49 11t39 29h272v-360H120v360Zm628.5 108.5Q760-263 760-280t-11.5-28.5Q737-320 720-320t-28.5 11.5Q680-297 680-280t11.5 28.5Q703-240 720-240t28.5-11.5ZM680-440h170l-90-120h-80v120ZM360-540Z') },

    /* ── Commerce ────────────────────────────────────────────────────── */
    { id: 'boutique', base: 'boutique', group: 'retail', primary: true,
      label: { fr: 'Boutique', en: 'Shop', ar: 'متجر' },
      /* storefront.svg */
      icon: mi('M841-518v318q0 33-23.5 56.5T761-120H201q-33 0-56.5-23.5T121-200v-318q-23-21-35.5-54t-.5-72l42-136q8-26 28.5-43t47.5-17h556q27 0 47 16.5t29 43.5l42 136q12 39-.5 71T841-518Zm-272-42q27 0 41-18.5t11-41.5l-22-140h-78v148q0 21 14 36.5t34 15.5Zm-180 0q23 0 37.5-15.5T441-612v-148h-78l-22 140q-4 24 10.5 42t37.5 18Zm-178 0q18 0 31.5-13t16.5-33l22-154h-78l-40 134q-6 20 6.5 43t41.5 23Zm540 0q29 0 42-23t6-43l-42-134h-76l22 154q3 20 16.5 33t31.5 13ZM201-200h560v-282q-5 2-6.5 2H751q-27 0-47.5-9T663-518q-18 18-41 28t-49 10q-27 0-50.5-10T481-518q-17 18-39.5 28T393-480q-29 0-52.5-10T299-518q-21 21-41.5 29.5T211-480h-4.5q-2.5 0-5.5-2v282Zm560 0H201h560Z') },
    { id: 'epicerie', base: 'boutique', group: 'retail', primary: true,
      label: { fr: 'Épicerie / Superette', en: 'Grocery', ar: 'بقالة' },
      /* local_grocery_store.svg */
      icon: mi('M223.5-103.5Q200-127 200-160t23.5-56.5Q247-240 280-240t56.5 23.5Q360-193 360-160t-23.5 56.5Q313-80 280-80t-56.5-23.5Zm400 0Q600-127 600-160t23.5-56.5Q647-240 680-240t56.5 23.5Q760-193 760-160t-23.5 56.5Q713-80 680-80t-56.5-23.5ZM246-720l96 200h280l110-200H246Zm-38-80h590q23 0 35 20.5t1 41.5L692-482q-11 20-29.5 31T622-440H324l-44 80h480v80H280q-45 0-68-39.5t-2-78.5l54-98-144-304H40v-80h130l38 80Zm134 280h280-280Z') },
    { id: 'pharmacie', base: 'boutique', group: 'retail',
      label: { fr: 'Pharmacie', en: 'Pharmacy', ar: 'صيدلية' },
      /* local_pharmacy.svg */
      icon: mi('M120-120v-80l80-240-80-240v-80h508l58-160 94 34-46 126h106v80l-80 240 80 240v80H120Zm320-160h80v-120h120v-80H520v-120h-80v120H320v80h120v120Zm-236 80h552l-80-240 80-240H204l80 240-80 240Zm276-240Z') },
    { id: 'librairie', base: 'boutique', group: 'retail',
      label: { fr: 'Librairie / Papeterie', en: 'Bookshop', ar: 'مكتبة' },
      /* menu_book.svg */
      icon: mi('M560-564v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-600q-38 0-73 9.5T560-564Zm0 220v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-380q-38 0-73 9t-67 27Zm0-110v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-490q-38 0-73 9.5T560-454ZM260-320q47 0 91.5 10.5T440-278v-394q-41-24-87-36t-93-12q-36 0-71.5 7T120-692v396q35-12 69.5-18t70.5-6Zm260 42q44-21 88.5-31.5T700-320q36 0 70.5 6t69.5 18v-396q-33-14-68.5-21t-71.5-7q-47 0-93 12t-87 36v394Zm-40 118q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740q51-30 106.5-45T700-800q52 0 102 12t96 36q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59ZM280-494Z') },
    { id: 'fleuriste', base: 'boutique', group: 'retail',
      label: { fr: 'Fleuriste', en: 'Florist', ar: 'محل أزهار' },
      /* local_florist.svg */
      icon: mi('M480-600q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm-70.5 218.5Q378-403 364-438q-5 0-9 .5t-9 .5q-52 0-89-37t-37-89q0-21 7-40.5t21-36.5q-13-17-20-36.5t-7-40.5q0-52 36.5-89t88.5-37q5 0 9 .5t9 .5q14-35 45.5-56.5T480-920q39 0 70.5 21.5T596-842q5 0 9-.5t9-.5q52 0 88.5 37t36.5 89q0 21-6.5 40.5T712-640q13 17 20 36.5t7 40.5q0 52-36.5 89T614-437q-5 0-9-.5t-9-.5q-14 35-45.5 56.5T480-360q-39 0-70.5-21.5ZM480-80q0-74 28.5-139.5T586-334q49-49 114.5-77.5T840-440q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Zm98-98q57-21 100-64t64-100q-57 21-100 64t-64 100Zm-98 98q0-74-28.5-139.5T374-334q-49-49-114.5-77.5T120-440q0 74 28.5 139.5T226-186q49 49 114.5 77.5T480-80Zm-98-98q-57-21-100-64t-64-100q57 21 100 64t64 100Zm196 0Zm-196 0Zm232-339q19 0 32.5-13.5T660-563q0-14-7.5-24.5T633-604l-35-17q-2 11-6 21.5t-9 19.5q-5 9-12 17t-15 15l32 23q5 4 11.5 6t14.5 2Zm-16-142 35-17q12-6 19-17t7-24q0-19-13-32.5T614-763q-8 0-14 2t-12 6l-33 23q8 7 15.5 15t12.5 17q5 9 9 19.5t6 21.5Zm-159-93q10-4 20-6t21-2q11 0 21 2t20 6l5-44q2-18-12.5-31T480-840q-19 0-33.5 13T434-796l5 44Zm41 312q19 0 33.5-13t12.5-31l-5-44q-10 4-20 6t-21 2q-11 0-21-2t-20-6l-5 44q-2 18 12.5 31t33.5 13ZM362-659q2-11 6-21.5t9-19.5q5-9 12-17t15-15l-32-23q-5-4-11.5-6t-14.5-2q-19 0-32.5 13.5T300-717q0 13 7.5 24t19.5 17l35 17Zm-16 141q8 0 14-1.5t12-6.5l33-22q-8-7-15.5-15T377-580q-5-9-9-19.5t-6-21.5l-35 17q-12 6-19 17t-7 24q1 19 13.5 32t31.5 13Zm237-62Zm0-120Zm-103-60Zm0 240ZM377-700Zm0 120Z') },
    /* La maison — vaisselle, art de la table, décoration — a SA caisse
     * (assets/pos-maison.js, code 0017) : marque, service complet ou pièce
     * détachée, motif, ticket cadeau, casse et livraison fragile. Sans cette
     * entrée, une boutique de vaisselle devait choisir « Boutique » et
     * perdait les six. */
    { id: 'maison', base: 'boutique', group: 'retail',
      label: { fr: 'Maison', en: 'Home', ar: 'المنزل' },
      /* home_and_garden.svg */
      icon: mi('M160-160v-375l-72 55-47-63 439-337 440 336-48 64-392-300-240 184v356h160v80H160Zm540 95q-42 29-92.5 24.5T521-81q-36-36-40.5-86.5T505-260q-29-42-24.5-92.5T521-439q36-36 86.5-40.5T700-455q42-29 92.5-24.5T879-439q36 36 40.5 86.5T895-260q29 42 24.5 92.5T879-81q-36 36-86.5 40.5T700-65Zm0-98 46 32q18 13 39 11t37-18q16-16 18-37t-11-39l-32-46 32-46q13-18 11-39t-18-37q-16-16-37-18t-39 11l-46 32-46-32q-18-13-39-11t-37 18q-16 16-18 37t11 39l32 46-32 46q-13 18-11 39t18 37q16 16 37 18t39-11l46-32Zm35.5-61.5Q750-239 750-260t-14.5-35.5Q721-310 700-310t-35.5 14.5Q650-281 650-260t14.5 35.5Q679-210 700-210t35.5-14.5ZM480-470Zm220 210Z') },

    /* Le pressing a SON comptoir (assets/pressing-caisse.js) depuis le début —
     * dépose, étiquettes par pièce, rack, retrait. Il manquait seulement ici,
     * donc un vrai pressing devait choisir « Autre activité », atterrissait sur
     * la base `boutique` et ouvrait la caisse boutique. Le métier existait, le
     * chemin pour y arriver non. */
    { id: 'pressing', base: 'boutique', group: 'retail',
      label: { fr: 'Pressing / Blanchisserie', en: 'Dry cleaner / Laundry', ar: 'مغسلة' },
      /* local_laundry_service.svg */
      icon: mi('M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v640q0 33-23.5 56.5T720-80H240Zm0-80h480v-640H240v640Zm381.5-98.5Q680-317 680-400t-58.5-141.5Q563-600 480-600t-141.5 58.5Q280-483 280-400t58.5 141.5Q397-200 480-200t141.5-58.5ZM480-268q-26 0-50.5-9.5T386-306l188-188q19 19 28.5 43.5T612-400q0 55-38.5 93.5T480-268ZM320-680q17 0 28.5-11.5T360-720q0-17-11.5-28.5T320-760q-17 0-28.5 11.5T280-720q0 17 11.5 28.5T320-680Zm148.5-11.5Q480-703 480-720t-11.5-28.5Q457-760 440-760t-28.5 11.5Q400-737 400-720t11.5 28.5Q423-680 440-680t28.5-11.5ZM240-160v-640 640Z') },

    /* ── Beauté & bien-être ──────────────────────────────────────────── */
    { id: 'spa', base: 'spa', group: 'care', primary: true,
      label: { fr: 'Spa / Bien-être', en: 'Spa / Wellness', ar: 'سبا' },
      /* spa.svg */
      icon: mi('M480-80q-73-9-145-39.5T206.5-207Q150-264 115-351T80-560v-40h40q51 0 105 13t101 39q12-86 54.5-176.5T480-880q57 65 99.5 155.5T634-548q47-26 101-39t105-13h40v40q0 122-35 209t-91.5 144q-56.5 57-128 87.5T480-80Zm-2-82q-11-166-98.5-251T162-518q11 171 101.5 255T478-162Zm2-254q15-22 36.5-45.5T558-502q-2-57-22.5-119T480-742q-35 59-55.5 121T402-502q20 17 42 40.5t36 45.5Zm78 236q37-12 77-35t74.5-62.5q34.5-39.5 59-98.5T798-518q-94 14-165 62.5T524-332q12 32 20.5 70t13.5 82Zm-78-236Zm78 236Zm-80 18Zm46-170ZM480-80Z') },
    { id: 'coiffure', base: 'spa', group: 'care',
      label: { fr: 'Salon de coiffure', en: 'Hair salon', ar: 'صالون حلاقة' },
      /* content_cut.svg */
      icon: mi('M760-120 480-400l-94 94q8 15 11 32t3 34q0 66-47 113T240-80q-66 0-113-47T80-240q0-66 47-113t113-47q17 0 34 3t32 11l94-94-94-94q-15 8-32 11t-34 3q-66 0-113-47T80-720q0-66 47-113t113-47q66 0 113 47t47 113q0 17-3 34t-11 32l494 494v40H760ZM600-520l-80-80 240-240h120v40L600-520ZM296.5-663.5Q320-687 320-720t-23.5-56.5Q273-800 240-800t-56.5 23.5Q160-753 160-720t23.5 56.5Q207-640 240-640t56.5-23.5ZM494-466q6-6 6-14t-6-14q-6-6-14-6t-14 6q-6 6-6 14t6 14q6 6 14 6t14-6ZM296.5-183.5Q320-207 320-240t-23.5-56.5Q273-320 240-320t-56.5 23.5Q160-273 160-240t23.5 56.5Q207-160 240-160t56.5-23.5Z') },
    { id: 'sport', base: 'spa', group: 'care',
      label: { fr: 'Salle de sport', en: 'Gym', ar: 'قاعة رياضية' },
      /* fitness_center.svg */
      icon: mi('m536-84-56-56 142-142-340-340-142 142-56-56 56-58-56-56 84-84-56-58 56-56 58 56 84-84 56 56 58-56 56 56-142 142 340 340 142-142 56 56-56 58 56 56-84 84 56 58-56 56-58-56-84 84-56-56-58 56Z') },

    /* ── Hébergement ─────────────────────────────────────────────────── */
    { id: 'hotel', base: 'hotel', group: 'stay', primary: true,
      label: { fr: 'Hôtel / Riad', en: 'Hotel / Riad', ar: 'فندق / رياض' },
      /* hotel.svg */
      icon: mi('M40-200v-600h80v400h320v-320h320q66 0 113 47t47 113v360h-80v-120H120v120H40Zm155-275q-35-35-35-85t35-85q35-35 85-35t85 35q35 35 35 85t-35 85q-35 35-85 35t-85-35Zm325 75h320v-160q0-33-23.5-56.5T760-640H520v240ZM308.5-531.5Q320-543 320-560t-11.5-28.5Q297-600 280-600t-28.5 11.5Q240-577 240-560t11.5 28.5Q263-520 280-520t28.5-11.5ZM280-560Zm240-80v240-240Z') },

    /* ── Le refuge ───────────────────────────────────────────────────────
     * « Autre activité » existe pour que personne ne soit bloqué à
     * l'inscription. Il vaut la famille Boutique — la plus neutre : un
     * catalogue et un panier, sans tables ni cabines. */
    { id: 'autre', base: 'boutique', group: 'retail',
      label: { fr: 'Autre activité', en: 'Something else', ar: 'نشاط آخر' },
      /* category.svg */
      icon: mi('m260-520 220-360 220 360H260ZM700-80q-75 0-127.5-52.5T520-260q0-75 52.5-127.5T700-440q75 0 127.5 52.5T880-260q0 75-52.5 127.5T700-80Zm-580-20v-320h320v320H120Zm580-60q42 0 71-29t29-71q0-42-29-71t-71-29q-42 0-71 29t-29 71q0 42 29 71t71 29Zm-500-20h160v-160H200v160Zm202-420h156l-78-126-78 126Zm78 0ZM360-340Zm340 80Z') },
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
