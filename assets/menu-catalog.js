/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · MENU CATALOG — window.KiwiMenuStore  (per-venue, persistent)
 * ---------------------------------------------------------------------------
 * The real, editable carte for a merchant-created store. Restaurant-family
 * venues (restaurant, café, fast-food, boulangerie, pizzeria, food truck,
 * traiteur) build their own menu here: Catégories → Sous-catégories → Produits
 * (nom, prix, description). It persists per-venue through window.KiwiStore, so
 * a new store starts EMPTY and its menu survives reloads — and the caisse
 * reads the SAME record (one brain).
 *
 * Ownership: this module takes over handlers['nav-menu'] ONLY for custom
 * (onboarded) venues. Demo venues (Café Atlas…) keep venues.js's rich demo
 * menu (miShowPage) untouched — the pitch demo can't regress. 'menu' is also
 * added to the starter layer's REAL_FOR_CUSTOM set (pages-pro.js) so the
 * "nothing here yet" placeholder no longer intercepts it.
 *
 * Load me AFTER assets/venue-store.js and after venues.js.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.KiwiStore) { console.warn('[menu-catalog] KiwiStore missing — load venue-store.js first'); return; }

  /* ───────────────── i18n mini ───────────────── */
  const LANG = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  const tr = (o) => (o == null ? '' : (o[LANG()] != null ? o[LANG()] : o.fr));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = {
    title:      { fr: 'Menu', en: 'Menu', ar: 'القائمة' },
    emptyH:     { fr: 'Votre carte est vide, et c\'est normal', en: 'Your menu is empty, and that\'s fine', ar: 'قائمتك فارغة، وهذا طبيعي' },
    emptyP:     { fr: 'Ajoutez vos catégories et vos produits. Tout est enregistré pour votre établissement et servira directement sur la caisse.', en: 'Add your categories and products. Everything is saved to your business and rings up straight on the register.', ar: 'أضف فئاتك ومنتجاتك. كل شيء محفوظ لنشاطك ويظهر مباشرة على الصندوق.' },
    addCat:     { fr: 'Ajouter une catégorie', en: 'Add a category', ar: 'إضافة فئة' },
    addSub:     { fr: 'Sous-catégorie', en: 'Sub-category', ar: 'فئة فرعية' },
    addItem:    { fr: 'Ajouter un produit', en: 'Add a product', ar: 'إضافة منتج' },
    loadEx:     { fr: 'Charger un exemple', en: 'Load an example', ar: 'تحميل مثال' },
    importCsv:  { fr: 'Importer un CSV', en: 'Import a CSV', ar: 'استيراد CSV' },
    example:    { fr: 'Exemple chargé, à vous de l\'adapter.', en: 'Example loaded, make it yours.', ar: 'تم تحميل المثال، عدّله كما تريد.' },
    catName:    { fr: 'Nom de la catégorie', en: 'Category name', ar: 'اسم الفئة' },
    subName:    { fr: 'Nom de la sous-catégorie', en: 'Sub-category name', ar: 'اسم الفئة الفرعية' },
    rename:     { fr: 'Renommer', en: 'Rename', ar: 'إعادة تسمية' },
    del:        { fr: 'Supprimer', en: 'Delete', ar: 'حذف' },
    delCatQ:    { fr: 'Supprimer cette catégorie et tous ses produits ?', en: 'Delete this category and all its products?', ar: 'حذف هذه الفئة وكل منتجاتها؟' },
    delItemQ:   { fr: 'Supprimer ce produit ?', en: 'Delete this product?', ar: 'حذف هذا المنتج؟' },
    save:       { fr: 'Enregistrer', en: 'Save', ar: 'حفظ' },
    cancel:     { fr: 'Annuler', en: 'Cancel', ar: 'إلغاء' },
    nameL:      { fr: 'Nom du produit', en: 'Product name', ar: 'اسم المنتج' },
    priceL:     { fr: 'Prix (MAD)', en: 'Price (MAD)', ar: 'السعر (درهم)' },
    catL:       { fr: 'Catégorie', en: 'Category', ar: 'الفئة' },
    subL:       { fr: 'Sous-catégorie (option)', en: 'Sub-category (optional)', ar: 'فئة فرعية (اختياري)' },
    descL:      { fr: 'Description (option)', en: 'Description (optional)', ar: 'وصف (اختياري)' },
    none:       { fr: '—', en: '—', ar: '—' },
    allItems:   { fr: 'Tous', en: 'All', ar: 'الكل' },
    products:   { fr: 'produits', en: 'products', ar: 'منتجات' },
    product:    { fr: 'produit', en: 'product', ar: 'منتج' },
    cats:       { fr: 'catégories', en: 'categories', ar: 'فئات' },
    noItems:    { fr: 'Aucun produit dans cette catégorie pour le moment.', en: 'No products in this category yet.', ar: 'لا منتجات في هذه الفئة بعد.' },
    avail:      { fr: 'Disponible', en: 'Available', ar: 'متاح' },
    unavail:    { fr: 'Indisponible', en: 'Unavailable', ar: 'غير متاح' },
    saved:      { fr: 'Menu mis à jour', en: 'Menu updated', ar: 'تم تحديث القائمة' },
    firstCat:   { fr: 'Commencez par créer une catégorie (ex. Entrées, Plats, Boissons).', en: 'Start by creating a category (e.g. Starters, Mains, Drinks).', ar: 'ابدأ بإنشاء فئة (مثل مقبلات، أطباق، مشروبات).' },
    mediaL:     { fr: 'Photo / vidéo (option)', en: 'Photo / video (optional)', ar: 'صورة / فيديو (اختياري)' },
    mediaAdd:   { fr: 'Ajouter une photo', en: 'Add a photo', ar: 'إضافة صورة' },
    mediaVid:   { fr: 'Ajouter une vidéo', en: 'Add a video', ar: 'إضافة فيديو' },
    mediaDel:   { fr: 'Retirer', en: 'Remove', ar: 'إزالة' },
    mediaUp:    { fr: 'Envoi…', en: 'Uploading…', ar: 'كيتصيفط…' },
    mediaHint:  { fr: 'Aperçu tel que vos clients le verront. Vertical, 3 à 5 secondes : la vidéo tourne en boucle, sans son.', en: 'Preview exactly as your customers will see it. Vertical, 3 to 5 seconds: the clip loops, muted.', ar: 'المعاينة بحال ما غاديين يشوفوها كليانتك. عمودي، من 3 ل 5 ثواني: الفيديو كيدور بلا صوت.' },
    /* Le fil du client met chaque plat dans la même tuile verticale : une vidéo
       de trente secondes n'y est pas une vidéo plus riche, c'est une vidéo dont
       personne ne verra la fin — et un fil où chaque tuile tourne à son rythme
       cesse de ressembler à un fil. D'où un plafond dit clairement, avec la
       durée constatée, plutôt qu'un refus muet à l'envoi. */
    mediaLong:  { fr: 'Clip trop long ({n} s). Filmez 3 à 5 secondes — maximum {max} s.', en: 'Clip too long ({n}s). Film 3 to 5 seconds — {max}s max.', ar: 'الفيديو طويل بزاف ({n} ثانية). صوّر من 3 ل 5 ثواني — الحد {max} ثانية.' },
    mediaWide:  { fr: 'Filmé à l\'horizontale : il sera recadré. Préférez la verticale.', en: 'Filmed landscape: it will be cropped. Prefer vertical.', ar: 'مصوّر بالعرض: غادي يتقصّ. حسن تصوّر بالطول.' },
    mediaOff:   { fr: 'Stockage média pas encore activé sur votre compte.', en: 'Media storage isn\'t enabled on your account yet.', ar: 'تخزين الميديا مازال ماتفعّلش فالحساب ديالك.' },
    mediaBig:   { fr: 'Fichier trop lourd.', en: 'File too large.', ar: 'الملف ثقيل بزاف.' },
    mediaBad:   { fr: 'Format non pris en charge.', en: 'Format not supported.', ar: 'الصيغة ماخدامة.' },
    mediaErr:   { fr: 'Envoi impossible, réessayez.', en: 'Upload failed, try again.', ar: 'التصويفط مامشاش، عاود جرّب.' },
    tags:       { fr: 'Tags NFC', en: 'NFC tags', ar: 'تاڭات NFC' },
    /* Les postes de préparation. Le vocabulaire est celui de la cuisine, pas
       celui du logiciel : un « poste », c'est l'endroit où le plat se fait. */
    stations:   { fr: 'Postes de préparation', en: 'Prep stations', ar: 'محطات التحضير' },
    stationL:   { fr: 'Poste de préparation', en: 'Prep station', ar: 'محطة التحضير' },
    stationAdd: { fr: 'Ajouter un poste', en: 'Add a station', ar: 'إضافة محطة' },
    stationNm:  { fr: 'Nom du poste', en: 'Station name', ar: 'اسم المحطة' },
    stationEx:  { fr: 'ex. Cuisson, Bar, Pâtisserie', en: 'e.g. Hot line, Bar, Pastry', ar: 'مثل: الطهي، البار، الحلويات' },
    kitchenNm:  { fr: 'Cuisine', en: 'Kitchen', ar: 'المطبخ' },
    stationDefB:{ fr: 'reçoit le reste', en: 'gets the rest', ar: 'كتوصلها الباقي' },
    stationDelQ:{ fr: 'Supprimer ce poste ? Les catégories qui y allaient repartiront vers la cuisine.', en: 'Delete this station? Categories routed there fall back to the kitchen.', ar: 'حذف هذه المحطة؟ الفئات ديالها غادي ترجع للمطبخ.' },
    stationNone:{ fr: 'Aucun poste défini', en: 'No station defined', ar: 'لا محطة محددة' },
    stationsHi: { fr: 'Le routage se règle sur la catégorie, pas ici : ouvrez une catégorie et donnez-lui son poste. La cuisine reçoit tout ce que vous n\'avez pas envoyé ailleurs — elle ne se supprime pas. L\'ordre ci-dessous est celui des onglets de l\'écran cuisine.', en: 'Routing is set on the category, not here: open a category and give it its station. The kitchen gets everything you haven\'t sent elsewhere — it can\'t be deleted. The order below is the tab order on the kitchen screen.', ar: 'التوجيه كيتحدد فالفئة ماشي هنا: حل فئة وعطيها المحطة ديالها. المطبخ كيوصلو كلشي اللي ما صيفطيهش لمحطة أخرى — وما كيتحدفش. الترتيب تحت هو ترتيب الأبواب فشاشة المطبخ.' },
    stationsEm: { fr: 'Vous n\'avez pas encore de postes. Sans poste, tout part sur un seul écran cuisine — ce qui suffit à beaucoup de cafés.', en: 'No stations yet. Without them everything lands on one kitchen screen — which is plenty for many cafés.', ar: 'مازال ماعندكش محطات. بلا محطات كلشي كيوصل لشاشة مطبخ وحدة — وهادشي كافي لبزاف ديال المقاهي.' },
    stationCol: { fr: 'Changer la couleur', en: 'Change the colour', ar: 'تغيير اللون' },
    moveUp:     { fr: 'Monter', en: 'Move up', ar: 'رفع' },
    moveDown:   { fr: 'Descendre', en: 'Move down', ar: 'خفض' },
    close:      { fr: 'Fermer', en: 'Close', ar: 'إغلاق' },
    /* Le routage vit sur la catégorie. « Cuisine » n'est pas une absence de
       réglage, c'est la réponse par défaut — d'où le nom en clair plutôt qu'un
       « aucun » qui laisserait croire que le plat ne part nulle part. */
    catStationL:{ fr: 'Part vers', en: 'Goes to', ar: 'كيمشي ل' },
    catStationD:{ fr: 'par défaut', en: 'default', ar: 'افتراضي' },
  };

  /* La palette des postes — exactement les sept teintes que l'écran cuisine de
   * la caisse utilise déjà pour ses pastilles. Ce ne sont pas des couleurs de
   * marque : ce sont des repères de lecture à trois mètres, dans une cuisine.
   * Elles restent donc identiques des deux côtés, sinon le poste « Bar » serait
   * bleu au bureau et orange au comptoir. */
  const STATION_COLORS = ['#1F5D3C', '#3FB67A', '#D99A2B', '#3677A6', '#164A2F', '#C24A2E', '#C97A4A'];

  /* Order Pro is a paid add-on and a PUBLIC surface — its entry point only
   * exists once an operator switched it on for this merchant. */
  function orderProOn() {
    try { return !!(window.KiwiOrderProPanel && window.KiwiOrderProPanel.enabled()); }
    catch (_) { return false; }
  }

  /* ───────────────── example template (a small café/resto starter) ───────────────── */
  function example() {
    return {
      seq: 20,
      /* Trois postes, parce que c'est la découpe la plus banale d'une cuisine
       * marocaine : le feu, le froid, et la machine à café. La cuisine vient en
       * tête et c'est elle le repli (kitchenId) — les deux autres ne reçoivent
       * que ce qu'une catégorie leur envoie. Le patron renomme, ajoute,
       * supprime : l'exemple n'est qu'un point de départ. */
      kitchenId: 'st_1',
      stations: [
        { id: 'st_1', name: 'Cuisson', color: STATION_COLORS[0] },
        { id: 'st_2', name: 'Froid', color: STATION_COLORS[1] },
        { id: 'st_3', name: 'Bar', color: STATION_COLORS[3] },
      ],
      /* Le routage, en quatre lignes : les entrées au froid, les boissons au
       * bar, le reste en cuisine. C'est exactement le geste qu'on demande au
       * patron — une phrase par catégorie, et plus jamais plat par plat. */
      cats: [
        { id: 'cat_1', name: 'Entrées', station: 'st_2', sub: [] },
        { id: 'cat_2', name: 'Plats', station: '', sub: [{ id: 'sub_1', name: 'Tajines' }, { id: 'sub_2', name: 'Grillades' }] },
        { id: 'cat_3', name: 'Boissons', station: 'st_3', sub: [{ id: 'sub_3', name: 'Chaudes' }, { id: 'sub_4', name: 'Fraîches' }] },
        { id: 'cat_4', name: 'Desserts', station: 'st_2', sub: [] },
      ],
      items: [
        { id: 'it_1', name: 'Salade marocaine', price: 32, catId: 'cat_1', subId: null, desc: 'Tomate, concombre, oignon, huile d\'olive', avail: true },
        { id: 'it_2', name: 'Harira', price: 28, catId: 'cat_1', subId: null, desc: 'Soupe pois chiches & lentilles', avail: true },
        { id: 'it_3', name: 'Tajine poulet citron', price: 95, catId: 'cat_2', subId: 'sub_1', desc: 'Poulet, olives, citron confit', avail: true },
        { id: 'it_4', name: 'Tajine kefta œuf', price: 85, catId: 'cat_2', subId: 'sub_1', desc: 'Viande hachée, œuf, tomate', avail: true },
        { id: 'it_5', name: 'Brochettes mixtes', price: 90, catId: 'cat_2', subId: 'sub_2', desc: 'Bœuf, poulet, merguez, frites', avail: true },
        { id: 'it_6', name: 'Thé à la menthe', price: 12, catId: 'cat_3', subId: 'sub_3', desc: 'Gunpowder, menthe fraîche', avail: true },
        { id: 'it_7', name: 'Café noir', price: 12, catId: 'cat_3', subId: 'sub_3', desc: 'Espresso', avail: true },
        { id: 'it_8', name: 'Orange pressée', price: 18, catId: 'cat_3', subId: 'sub_4', desc: 'Pressée minute', avail: true },
        { id: 'it_9', name: 'Msemen miel', price: 14, catId: 'cat_4', subId: null, desc: 'Crêpe feuilletée, beurre, miel', avail: true },
      ],
    };
  }

  const store = window.KiwiStore.define('menu', {
    blank: () => ({ seq: 0, cats: [], items: [], stations: [], kitchenId: '' }),
    example: example,
    /* Des postes seuls ne font pas une carte : un établissement qui n'a saisi
     * que « Bar » et « Cuisson » n'a toujours rien à vendre, et l'écran d'accueil
     * doit continuer de le lui dire. */
    isEmpty: (d) => !d || (!(d.cats && d.cats.length) && !(d.items && d.items.length)),
  });

  /* ───────────────── data ops ───────────────── */
  function nid(d, prefix) { d.seq = (d.seq || 0) + 1; return prefix + '_' + d.seq; }
  const catById = (d, id) => (d.cats || []).find((c) => c.id === id) || null;
  const itemById = (d, id) => (d.items || []).find((i) => i.id === id) || null;
  const itemsIn = (d, catId, subId) => (d.items || []).filter((i) => i.catId === catId && (subId == null || i.subId === subId));
  const stationsOf = (d) => (d && Array.isArray(d.stations)) ? d.stations : [];
  const stationById = (d, id) => stationsOf(d).find((s) => s && s.id === id) || null;

  /* ─── postes de préparation ───
   * LE ROUTAGE VIT SUR LA CATÉGORIE. « Boissons → Bar » se dit une fois et vaut
   * pour les boissons d'aujourd'hui comme pour celles de l'année prochaine ;
   * affecter les plats un par un, c'est un travail qui ne finit jamais et qu'on
   * oublie à chaque ajout.
   *
   * Et il n'y a plus de « premier de la liste = poste par défaut ». Cette règle
   * faisait de l'ORDRE un réglage : monter le Bar d'un cran, et toute la carte
   * non affectée partait au bar sans que rien ne le dise. Le repli est nommé —
   * la cuisine — il existe dès le premier jour, il ne se supprime pas, et
   * l'ordre ne sert plus qu'aux onglets de l'écran cuisine.
   *
   * La couleur est un repère de lecture, pas une décoration : elle se retrouve
   * à l'identique sur la pastille de l'écran cuisine. */

  /* La cuisine, telle qu'elle est. `d.kitchenId` la nomme ; à défaut on retombe
   * sur le premier poste, ce qui redonne EXACTEMENT l'ancien comportement pour
   * une carte écrite avant ce changement — personne ne voit son routage bouger
   * le jour de la mise à jour. */
  function kitchenIdOf(d) {
    const list = stationsOf(d);
    const want = d && d.kitchenId;
    if (want && list.some((s) => s && s.id === want)) return want;
    return list.length ? list[0].id : '';
  }
  /* Appelée dès qu'on touche aux postes ou au routage : la cuisine se crée sans
   * rien demander (le patron n'a pas à déclarer que sa cuisine existe), et le
   * repli implicite d'hier devient explicite.
   *
   * Reprise des affectations par plat : la version précédente les posait sur le
   * plat. On les remonte à leur catégorie quand elles y sont unanimes — le
   * patron qui avait pris le temps d'envoyer ses boissons au bar les retrouve
   * routées, sans avoir rien à refaire. En cas de désaccord dans une même
   * catégorie on ne tranche pas : deviner reviendrait à détourner des plats en
   * silence, et la catégorie part simplement en cuisine. */
  function ensureKitchen(d) {
    d.stations = stationsOf(d);
    if (!d.stations.length) {
      d.stations.push({ id: nid(d, 'st'), name: tr(T.kitchenNm), color: STATION_COLORS[0] });
    }
    d.kitchenId = kitchenIdOf(d);
    const known = (id) => !!id && d.stations.some((s) => s && s.id === id);
    (d.cats || []).forEach((c) => {
      if (!c) return;
      // Un poste supprimé ne doit pas laisser une catégorie pointer dans le vide.
      if (c.station && !known(c.station)) c.station = '';
      // Déjà réglée une fois — « en cuisine » EST un réglage. On n'y revient pas :
      // la reprise ci-dessous ne doit jamais écraser un choix du patron.
      if ('station' in c) return;
      const found = (d.items || []).reduce((acc, it) => {
        if (acc === false || !it || it.catId !== c.id) return acc;
        const s = known(it.station) ? it.station : '';
        if (!s) return acc;
        return acc === null ? s : (acc === s ? acc : false);
      }, null);
      c.station = (found && found !== d.kitchenId) ? found : '';
    });
    return d;
  }
  /* Le seul geste de routage de toute la carte. '' = la cuisine, et c'est un
   * choix qu'on écrit comme les autres — pas une case laissée vide. */
  function setCategoryStation(catId, stationId) {
    return store.update((d) => {
      ensureKitchen(d);
      const c = catById(d, catId); if (!c) return d;
      const ok = stationId && d.stations.some((s) => s && s.id === stationId);
      c.station = (ok && stationId !== d.kitchenId) ? String(stationId) : '';
      return d;
    });
  }
  function addStation(name) {
    return store.update((d) => {
      // Le premier poste ajouté n'est jamais le premier poste tout court : la
      // cuisine naît avant lui, sinon « Bar » deviendrait le repli de la carte.
      ensureKitchen(d);
      const nm = String(name || '').trim() || tr(T.stationNm);
      d.stations.push({ id: nid(d, 'st'), name: nm, color: STATION_COLORS[d.stations.length % STATION_COLORS.length] });
      return d;
    });
  }
  function renameStation(id, name) {
    return store.update((d) => { const s = stationById(d, id); if (s) s.name = String(name || s.name).trim() || s.name; return d; });
  }
  function cycleStationColor(id) {
    return store.update((d) => {
      const s = stationById(d, id); if (!s) return d;
      const i = STATION_COLORS.indexOf(s.color);
      s.color = STATION_COLORS[(i + 1) % STATION_COLORS.length];
      return d;
    });
  }
  function moveStation(id, delta) {
    return store.update((d) => {
      d.stations = stationsOf(d);
      const i = d.stations.findIndex((s) => s && s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.stations.length) return d;
      const [s] = d.stations.splice(i, 1);
      d.stations.splice(j, 0, s);
      return d;
    });
  }
  /* La cuisine ne se supprime pas : c'est le repli, et un repli qu'on peut
   * effacer n'en est pas un. Pour les autres, supprimer ne doit pas laisser une
   * catégorie pointer vers un poste disparu — la caisse l'enverrait dans un
   * filtre que personne ne regarde. Elle rentre en cuisine, en une écriture. */
  function deleteStation(id) {
    return store.update((d) => {
      ensureKitchen(d);
      if (!id || id === d.kitchenId) return d;
      d.stations = d.stations.filter((s) => s && s.id !== id);
      (d.cats || []).forEach((c) => { if (c && c.station === id) c.station = ''; });
      return d;
    });
  }

  function addCategory(name) {
    return store.update((d) => {
      // Une catégorie neuve part en cuisine — explicitement, pas par omission.
      const c = { id: nid(d, 'cat'), name: String(name || tr(T.catName)).trim() || tr(T.catName), sub: [], station: '' };
      d.cats.push(c);
      return d;
    });
  }
  function renameCategory(id, name) {
    return store.update((d) => { const c = catById(d, id); if (c) c.name = String(name || c.name).trim() || c.name; return d; });
  }
  function deleteCategory(id) {
    return store.update((d) => {
      d.cats = (d.cats || []).filter((c) => c.id !== id);
      d.items = (d.items || []).filter((i) => i.catId !== id);
      return d;
    });
  }
  function addSubcategory(catId, name) {
    return store.update((d) => {
      const c = catById(d, catId); if (!c) return d;
      c.sub = c.sub || [];
      c.sub.push({ id: nid(d, 'sub'), name: String(name || tr(T.subName)).trim() || tr(T.subName) });
      return d;
    });
  }
  function addItem(data) {
    return store.update((d) => {
      d.items.push({
        id: nid(d, 'it'),
        name: String(data.name || 'Produit').trim() || 'Produit',
        price: Math.max(0, +data.price || 0),
        catId: data.catId || (d.cats[0] && d.cats[0].id) || null,
        subId: data.subId || null,
        desc: String(data.desc || '').trim(),
        avail: data.avail !== false,
        // Pas de poste sur le plat : il suit sa catégorie. Les valeurs écrites
        // par la version précédente restent dans le document et ne sont plus
        // lues — ensureKitchen() les a remontées à la catégorie une fois pour
        // toutes, les effacer ne rendrait service à personne.
        // Media are URLs (uploaded to R2 via KiwiOrderPro.uploadMedia), never
        // bytes — base64 here would blow the localStorage quota in a dozen items.
        photo: String(data.photo || ''),
        video: String(data.video || ''),
      });
      return d;
    });
  }
  function updateItem(id, patch) {
    return store.update((d) => {
      const it = itemById(d, id); if (!it) return d;
      if (patch.name != null) it.name = String(patch.name).trim() || it.name;
      if (patch.price != null) it.price = Math.max(0, +patch.price || 0);
      if (patch.catId != null) it.catId = patch.catId;
      if ('subId' in patch) it.subId = patch.subId || null;
      if (patch.desc != null) it.desc = String(patch.desc).trim();
      if (patch.avail != null) it.avail = !!patch.avail;
      if ('photo' in patch) it.photo = String(patch.photo || '');
      if ('video' in patch) it.video = String(patch.video || '');
      return d;
    });
  }
  function deleteItem(id) {
    return store.update((d) => { d.items = (d.items || []).filter((i) => i.id !== id); return d; });
  }

  /* ───────────────── styles ───────────────── */
  function injectCss() {
    if (document.querySelector('#kiwi-menux-css')) return;
    const s = document.createElement('style');
    s.id = 'kiwi-menux-css';
    s.textContent = `
      .mx-wrap { --mx-line: var(--n-200); }
      .mx-empty { max-width: 520px; margin: 24px auto; text-align: center; padding: 40px 28px; background: var(--surface); border: 1px solid var(--mx-line); border-radius: 18px; }
      .mx-empty .ic { width: 54px; height: 54px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; background: var(--mint-soft); color: var(--atlas); margin-bottom: 16px; }
      .mx-empty h3 { font-size: 19px; letter-spacing: -0.01em; margin: 0 0 8px; color: var(--ink); }
      .mx-empty p { font-size: 14px; color: var(--n-600); line-height: 1.5; margin: 0 0 20px; }
      .mx-empty .row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
      .mx-grid { display: grid; grid-template-columns: 264px 1fr; gap: 18px; align-items: start; }
      @media (max-width: 860px) { .mx-grid { grid-template-columns: 1fr; } }
      .mx-rail { display: flex; flex-direction: column; gap: 8px; }
      .mx-cat-add, .mx-sub-add { display: inline-flex; align-items: center; gap: 7px; justify-content: center; width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 12px; border: 1.5px dashed var(--n-300); background: transparent; color: var(--n-600); font-family: var(--sans); font-size: 13px; font-weight: 500; cursor: pointer; transition: transform 140ms, opacity 140ms, background-color 140ms, border-color 140ms, color 140ms, box-shadow 140ms; }
      .mx-cat-add:hover, .mx-sub-add:hover { border-color: var(--atlas); color: var(--atlas); background: var(--mint-soft); }
      .mx-cat { border: 1px solid var(--mx-line); border-radius: 12px; background: var(--surface); overflow: hidden; }
      .mx-cat-head { display: flex; align-items: center; gap: 8px; padding: 11px 12px; cursor: pointer; transition: background 140ms; }
      .mx-cat.on .mx-cat-head { background: var(--mint-soft); }
      .mx-cat-head:hover { background: var(--paper-soft); }
      .mx-cat.on .mx-cat-head:hover { background: var(--mint-soft); }
      .mx-cat-head .nm { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; color: var(--ink); letter-spacing: -0.005em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mx-cat-head .ct { font-family: var(--mono); font-size: 10.5px; color: var(--n-500); background: var(--paper-soft); padding: 2px 7px; border-radius: 999px; }
      .mx-cat.on .mx-cat-head .ct { color: var(--atlas); background: var(--surface); }
      .mx-cat-head .ed { display: inline-flex; color: var(--n-400); padding: 2px; border-radius: 6px; }
      .mx-cat-head .ed:hover { color: var(--ink); background: var(--surface); }
      .mx-subs { padding: 4px 8px 10px; display: flex; flex-direction: column; gap: 4px; }
      .mx-sub { display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 8px; font-size: 12.5px; color: var(--n-600); cursor: pointer; transition: transform 120ms, opacity 120ms, background-color 120ms, border-color 120ms, color 120ms, box-shadow 120ms; }
      .mx-sub:hover { background: var(--paper-soft); color: var(--ink); }
      .mx-sub.on { background: var(--atlas); color: #fff; }
      .mx-sub-add { border: none; border-radius: 8px; padding: 7px 10px; justify-content: flex-start; font-size: 12px; }
      .mx-pane { border: 1px solid var(--mx-line); border-radius: 14px; background: var(--surface); overflow: hidden; }
      .mx-pane-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--mx-line); }
      .mx-pane-head h3 { margin: 0; font-size: 15px; letter-spacing: -0.01em; color: var(--ink); }
      .mx-pane-head .sub { font-size: 12px; color: var(--n-500); margin-top: 2px; }
      .mx-item { display: grid; grid-template-columns: 1fr auto auto auto; gap: 12px; align-items: center; padding: 13px 16px; border-bottom: 1px solid var(--mx-line); }
      .mx-item:last-child { border-bottom: 0; }
      .mx-item.off { opacity: 0.5; }
      .mx-item .nm { font-size: 14px; font-weight: 500; color: var(--ink); letter-spacing: -0.005em; }
      .mx-item .nm .tag { font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--n-500); background: var(--paper-soft); padding: 2px 6px; border-radius: 6px; margin-left: 8px; }
      .mx-item .d { font-size: 12px; color: var(--n-500); margin-top: 3px; }
      .mx-item .pr { font-family: var(--mono); font-size: 13.5px; font-weight: 600; color: var(--ink); white-space: nowrap; }
      .mx-item .sw { width: 34px; height: 20px; border-radius: 999px; background: var(--n-300); position: relative; cursor: pointer; transition: background 160ms; flex-shrink: 0; }
      .mx-item .sw.on { background: var(--atlas); }
      .mx-item .sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--surface); transition: transform 160ms; }
      .mx-item .sw.on::after { transform: translateX(14px); }
      .mx-item .act { display: inline-flex; gap: 4px; }
      .mx-item .act button { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--mx-line); background: var(--surface); color: var(--n-500); cursor: pointer; transition: transform 130ms, opacity 130ms, background-color 130ms, border-color 130ms, color 130ms, box-shadow 130ms; }
      .mx-item .act button:hover { color: var(--ink); border-color: var(--n-400); }
      .mx-item .act button.del:hover { color: var(--danger); border-color: var(--danger); }
      .mx-empty-items { padding: 40px 16px; text-align: center; color: var(--n-500); font-size: 13.5px; }
      .mx-pane-add { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 10px; border: none; background: var(--atlas); color: #fff; font-family: var(--sans); font-size: 13px; font-weight: 500; cursor: pointer; }
      .mx-pane-add:hover { filter: brightness(1.05); }
      .mx-field { margin-bottom: 13px; }
      .mx-field label { display: block; font-size: 11.5px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--n-500); margin-bottom: 6px; }
      .mx-field input, .mx-field select, .mx-field textarea { width: 100%; box-sizing: border-box; padding: 11px 13px; border: 1.5px solid var(--n-200); border-radius: 11px; font-family: var(--sans); font-size: 14.5px; color: var(--ink); background: var(--surface); outline: none; }
      .mx-field input:focus, .mx-field select:focus, .mx-field textarea:focus { border-color: var(--atlas); }
      .mx-field.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .mx-field textarea { resize: vertical; min-height: 60px; }
      /* media picker — the file inputs stay hidden, these are the affordances */
      .mx-media { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      /* 4/5 et non un carré : c'est EXACTEMENT le cadre de la tuile côté
         client (--tile-ratio dans OrderPro.html). Un aperçu carré montrait au
         patron une image que ses clients ne verraient jamais, et il découvrait
         le recadrage une fois la carte publiée. */
      .mx-media-prev { width: 76px; aspect-ratio: 4 / 5; height: auto; border-radius: 11px; object-fit: cover; background: var(--paper-soft); border: 1px solid var(--mx-line); flex: 0 0 auto; display: block; }
      .mx-media-actions { display: flex; gap: 6px; flex-wrap: wrap; }
      .mx-media-btn { padding: 8px 12px; font-size: 12.5px; }
      .mx-media-msg { font-size: 11.5px; color: var(--n-500); margin-top: 7px; line-height: 1.45; }
      /* item row thumbnail — only present once the merchant adds media */
      .mx-item .th { width: 38px; height: 38px; border-radius: 9px; object-fit: cover; background: var(--paper-soft); border: 1px solid var(--mx-line); }
      /* postes de préparation — la pastille est le même repère que sur l'écran
         cuisine de la caisse, à la même couleur. */
      .mx-stdot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: 0 0 8px; }
      /* Le routage de la catégorie ouverte, en tête de volet. Il se lit comme
         une phrase — « Part vers · Bar » — et non comme un formulaire : le
         libellé est petit et gris, la valeur porte le poids. */
      .mx-catst { display: inline-flex; align-items: center; gap: 7px; padding: 0 10px 0 11px;
        height: 34px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); }
      .mx-catst > span { font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase;
        color: var(--n-500); white-space: nowrap; }
      .mx-catst select { border: 0; background: none; outline: none; font: inherit; font-size: 13px;
        font-weight: 600; color: var(--ink); padding: 0; max-width: 168px; cursor: pointer; }
      .mx-item .nm .stag { display: inline-flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--n-600); background: var(--paper-soft); padding: 2px 7px; border-radius: 6px; margin-left: 8px; vertical-align: 1px; }
      .mx-st-hint { font-size: 12.5px; color: var(--n-600); line-height: 1.5; margin: 0 0 14px; }
      .mx-st-list { display: flex; flex-direction: column; gap: 7px; margin-bottom: 12px; }
      .mx-st-row { display: flex; align-items: center; gap: 9px; padding: 9px 11px; border: 1px solid var(--mx-line); border-radius: 11px; background: var(--surface); }
      .mx-st-sw { width: 22px; height: 22px; border-radius: 7px; border: 1px solid var(--mx-line); cursor: pointer; flex: 0 0 22px; padding: 0; }
      .mx-st-nm { flex: 1; min-width: 0; font-size: 14px; color: var(--ink); background: transparent; border: none; outline: none; font-family: var(--sans); padding: 2px 0; border-bottom: 1.5px solid transparent; }
      .mx-st-nm:focus { border-bottom-color: var(--atlas); }
      .mx-st-def { font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--atlas); background: var(--mint-soft); padding: 2px 7px; border-radius: 6px; white-space: nowrap; }
      .mx-st-act { display: inline-flex; gap: 3px; }
      .mx-st-act button { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--mx-line); background: var(--surface); color: var(--n-500); cursor: pointer; transition: transform 130ms, opacity 130ms, background-color 130ms, border-color 130ms, color 130ms; }
      .mx-st-act button:hover:not(:disabled) { color: var(--ink); border-color: var(--n-400); }
      .mx-st-act button:disabled { opacity: 0.32; cursor: default; }
      .mx-st-act button.del:hover { color: var(--danger); border-color: var(--danger); }
      .mx-st-empty { padding: 22px 4px 26px; text-align: center; color: var(--n-500); font-size: 13px; line-height: 1.55; }
    `;
    document.head.appendChild(s);
  }

  /* ───────────────── small SVGs ───────────────── */
  const PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  const EDIT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>';
  const DOWNLOAD = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>';
  const TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>';
  const SPARK = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z"/></svg>';
  /* Une cloche de passe — l'objet qu'on tape quand le plat sort du poste. */
  const BELL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18"/><path d="M20 15a8 8 0 1 0-16 0"/><path d="M12 4V2"/></svg>';
  const ARR_UP = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  const ARR_DN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';

  /* ───────────────── UI state ───────────────── */
  let activeCat = null;
  let activeSub = null; // null = all subs of the active category

  const fmt = (n) => Number(n || 0).toLocaleString(LANG() === 'ar' ? 'ar-MA' : 'fr-FR');

  function venueName() {
    const KV = window.KiwiVenue;
    const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    return vd.name || 'Votre établissement';
  }

  /* ───────────────── render ───────────────── */
  function render() {
    injectCss();
    const d = store.get();
    const cats = d.cats || [];
    const items = d.items || [];
    const stations0 = stationsOf(d);
    const kitchenId = kitchenIdOf(d);
    const kitchenSt = stationById(d, kitchenId);

    if (!cats.length && !items.length) return renderEmpty();

    // keep active selection valid
    if (!activeCat || !catById(d, activeCat)) { activeCat = cats[0] ? cats[0].id : null; activeSub = null; }
    const cat = catById(d, activeCat);
    if (activeSub && cat && !(cat.sub || []).some((s) => s.id === activeSub)) activeSub = null;

    const rail = cats.map((c) => {
      const isOn = c.id === activeCat;
      const count = itemsIn(d, c.id).length;
      const subs = (c.sub || []).map((s) => `
        <div class="mx-sub ${isOn && activeSub === s.id ? 'on' : ''}" data-action="mx-sub-pick" data-arg="${c.id}::${s.id}">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.name)}</span>
          <span style="font-family:var(--mono);font-size:10px;opacity:.6;">${itemsIn(d, c.id, s.id).length}</span>
        </div>`).join('');
      /* La pastille ne s'affiche QUE pour une catégorie détournée. Un point sur
       * chaque ligne serait du bruit — c'est l'exception qu'on veut voir sauter
       * aux yeux, et « pas de pastille » se lit alors « ça part en cuisine ». */
      const cSt = c.station ? stationById(d, c.station) : null;
      const cDot = cSt ? `<i class="mx-stdot" style="background:${esc(cSt.color || STATION_COLORS[0])}" title="${esc(cSt.name)}"></i>` : '';
      return `
        <div class="mx-cat ${isOn ? 'on' : ''}">
          <div class="mx-cat-head" data-action="mx-cat-pick" data-arg="${c.id}">
            <span class="nm">${esc(c.name)}</span>
            ${cDot}
            <span class="ct">${count}</span>
            <span class="ed" data-action="mx-cat-edit" data-arg="${c.id}" title="${esc(tr(T.rename))}">${EDIT}</span>
          </div>
          ${isOn ? `<div class="mx-subs">
            <div class="mx-sub ${activeSub == null ? 'on' : ''}" data-action="mx-sub-pick" data-arg="${c.id}::">
              <span style="flex:1;">${esc(tr(T.allItems))}</span><span style="font-family:var(--mono);font-size:10px;opacity:.6;">${count}</span>
            </div>
            ${subs}
            <button class="mx-sub-add" data-action="mx-sub-add" data-arg="${c.id}">${PLUS}<span>${esc(tr(T.addSub))}</span></button>
          </div>` : ''}
        </div>`;
    }).join('');

    const shown = cat ? itemsIn(d, cat.id, activeSub) : [];
    const subName = activeSub && cat ? (cat.sub || []).find((s) => s.id === activeSub) : null;
    const itemRows = shown.length ? shown.map((it) => {
      const sub = (cat.sub || []).find((s) => s.id === it.subId);
      /* Plus de pastille de poste par plat : tous les plats affichés ici
       * partagent la catégorie ouverte, donc son poste. Le répéter sur chaque
       * ligne laisserait croire qu'il se règle ligne par ligne. Il se lit une
       * fois, en tête de volet, là où il se règle. */
      const stTag = '';
      return `
        <div class="mx-item ${it.avail === false ? 'off' : ''}">
          <div style="display:flex;align-items:center;gap:11px;min-width:0;">
            ${it.video ? `<video class="th" src="${esc(it.video)}" muted playsinline preload="metadata"></video>`
              : (it.photo ? `<img class="th" src="${esc(it.photo)}" alt="" loading="lazy" />` : '')}
            <div style="min-width:0;">
              <div class="nm">${esc(it.name)}${sub ? `<span class="tag">${esc(sub.name)}</span>` : ''}${stTag}</div>
              ${it.desc ? `<div class="d">${esc(it.desc)}</div>` : ''}
            </div>
          </div>
          <div class="pr">${fmt(it.price)} MAD</div>
          <span class="sw ${it.avail === false ? '' : 'on'}" data-action="mx-item-avail" data-arg="${it.id}" role="switch" aria-checked="${it.avail !== false}" title="${esc(tr(it.avail === false ? T.unavail : T.avail))}"></span>
          <div class="act">
            <button data-action="mx-item-edit" data-arg="${it.id}" title="${esc(tr(T.rename))}">${EDIT}</button>
            <button class="del" data-action="mx-item-del" data-arg="${it.id}" title="${esc(tr(T.del))}">${TRASH}</button>
          </div>
        </div>`;
    }).join('') : `<div class="mx-empty-items">${esc(tr(T.noItems))}</div>`;

    const body = `
      <div class="mx-wrap">
        <div class="mx-grid">
          <div class="mx-rail">
            <button class="mx-cat-add" data-action="mx-cat-add">${PLUS}<span>${esc(tr(T.addCat))}</span></button>
            ${rail}
          </div>
          <div class="mx-pane">
            <div class="mx-pane-head">
              <div>
                <h3>${cat ? esc(cat.name) : esc(tr(T.title))}${subName ? ' · ' + esc(subName.name) : ''}</h3>
                <div class="sub">${shown.length} ${esc(tr(shown.length === 1 ? T.product : T.products))}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                ${/* Le routage, au seul endroit où on y pense : devant les plats
                      concernés. Caché tant qu'il n'y a qu'un poste — proposer un
                      choix qui n'en est pas un, c'est faire douter le patron. */''}
                ${cat && stations0.length > 1 ? `<label class="mx-catst">
                  <span>${esc(tr(T.catStationL))}</span>
                  <select data-cat-station="${esc(cat.id)}" aria-label="${esc(tr(T.catStationL))}">
                    <option value="">${esc(kitchenSt ? kitchenSt.name : tr(T.kitchenNm))} · ${esc(tr(T.catStationD))}</option>
                    ${stations0.filter((s) => s.id !== kitchenId).map((s) => `<option value="${esc(s.id)}" ${s.id === cat.station ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
                  </select>
                </label>` : ''}
                ${orderProOn() ? `<button class="mx-cat-add" style="width:auto;border-style:solid;margin:0;" data-action="orderpro-tags"><span>${esc(tr(T.tags))}</span></button>` : ''}
                <button class="mx-cat-add" style="width:auto;border-style:solid;margin:0;" data-action="mx-stations">${BELL}<span>${esc(tr(T.stations))}</span></button>
                <button class="mx-cat-add" style="width:auto;border-style:solid;margin:0;" data-action="mx-import">${DOWNLOAD}<span>${esc(tr(T.importCsv))}</span></button>
                <button class="mx-pane-add" data-action="mx-item-add">${PLUS}<span>${esc(tr(T.addItem))}</span></button>
              </div>
            </div>
            ${itemRows}
          </div>
        </div>
      </div>`;

    window.Kiwi.appPage('menu', {
      title: tr(T.title),
      subtitle: `${esc(venueName())} · ${items.length} ${tr(T.products)} · ${cats.length} ${tr(T.cats)}`,
      body,
    });
  }

  function renderEmpty() {
    injectCss();
    window.Kiwi.appPage('menu', {
      title: tr(T.title),
      subtitle: esc(venueName()),
      body: `
        <div class="mx-wrap">
          <div class="mx-empty">
            <div class="ic">${SPARK}</div>
            <h3>${esc(tr(T.emptyH))}</h3>
            <p>${esc(tr(T.emptyP))}</p>
            <div class="row">
              <button class="mx-pane-add" data-action="mx-cat-add">${PLUS}<span>${esc(tr(T.addCat))}</span></button>
              <button class="mx-cat-add" style="width:auto;border-style:solid;" data-action="mx-import">${DOWNLOAD}<span>${esc(tr(T.importCsv))}</span></button>
              <button class="mx-cat-add" style="width:auto;border-style:solid;" data-action="mx-load-example">${SPARK ? '' : ''}<span>${esc(tr(T.loadEx))}</span></button>
            </div>
          </div>
        </div>`,
    });
  }

  /* ───────────────── prompt + item modal ───────────────── */
  function promptText(opts, cb) {
    const K = window.Kiwi;
    const m = K.modal({
      tag: opts.tag || venueName(),
      title: opts.title || '',
      desc: opts.desc || '',
      width: 420,
      body: `<div class="mx-field"><input data-p-in type="text" value="${esc(opts.value || '')}" placeholder="${esc(opts.placeholder || '')}"/></div>`,
      foot: `<button class="kb ghost" type="button" data-p-cancel style="flex:1;justify-content:center;">${esc(tr(T.cancel))}</button>
             <button class="kb atlas" type="button" data-p-ok style="flex:1.3;justify-content:center;">${esc(opts.ok || tr(T.save))}</button>`,
    });
    const input = m.el.querySelector('[data-p-in]');
    const done = () => { const v = (input.value || '').trim(); m.close(); cb(v || null); };
    m.el.querySelector('[data-p-ok]').addEventListener('click', done);
    m.el.querySelector('[data-p-cancel]').addEventListener('click', () => { m.close(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
    setTimeout(() => { try { input.focus(); input.select(); } catch (_) {} }, 180);
  }

  /* ─── le gestionnaire de postes ───
   * Un seul écran, qui se repeint sur place : ajouter un poste, le renommer au
   * clavier, changer sa pastille, le monter (donc en faire le défaut), le
   * supprimer. Pas d'étape « enregistrer » — chaque geste écrit, comme partout
   * ailleurs dans la carte, et la publication vers la caisse suit toute seule
   * (store.subscribe → schedulePublish). */
  function stationsModal() {
    const K = window.Kiwi;
    const m = K.modal({
      tag: venueName(),
      title: tr(T.stations),
      width: 480,
      body: '<div data-st-body></div>',
      foot: `<button class="kb ghost" type="button" data-st-close style="flex:1;justify-content:center;">${esc(tr(T.close))}</button>`,
    });
    const body = m.el.querySelector('[data-st-body]');

    /* La cuisine se crée ici, sans rien demander — on ouvre la fenêtre des
     * postes, elle est déjà là. Écrit une seule fois : ensuite kitchenId est
     * posé et rouvrir la fenêtre ne touche plus à la carte. */
    const d0 = store.get();
    if (!stationsOf(d0).length || !d0.kitchenId) store.update((d) => ensureKitchen(d));

    function paint(focusId) {
      const dNow = store.get();
      const list = stationsOf(dNow);
      const kid = kitchenIdOf(dNow);
      const rows = list.map((s, i) => {
        /* La cuisine se renomme et se déplace comme les autres — c'est un poste
         * réel, pas une ligne système. Elle ne se supprime pas : le bouton
         * n'est pas désactivé, il n'existe pas. Un bouton grisé invite à
         * chercher pourquoi ; une absence se comprend toute seule. */
        const isKitchen = s.id === kid;
        return `
        <div class="mx-st-row" data-st-row="${esc(s.id)}">
          <button class="mx-st-sw" type="button" data-st-color="${esc(s.id)}"
                  style="background:${esc(s.color || STATION_COLORS[0])};"
                  title="${esc(tr(T.stationCol))}" aria-label="${esc(tr(T.stationCol))}"></button>
          <input class="mx-st-nm" type="text" value="${esc(s.name)}" data-st-name="${esc(s.id)}"
                 aria-label="${esc(tr(T.stationNm))}" />
          ${isKitchen ? `<span class="mx-st-def">${esc(tr(T.stationDefB))}</span>` : ''}
          <div class="mx-st-act">
            <button type="button" data-st-up="${esc(s.id)}" ${i === 0 ? 'disabled' : ''} title="${esc(tr(T.moveUp))}" aria-label="${esc(tr(T.moveUp))}">${ARR_UP}</button>
            <button type="button" data-st-down="${esc(s.id)}" ${i === list.length - 1 ? 'disabled' : ''} title="${esc(tr(T.moveDown))}" aria-label="${esc(tr(T.moveDown))}">${ARR_DN}</button>
            ${isKitchen ? '' : `<button type="button" class="del" data-st-del="${esc(s.id)}" title="${esc(tr(T.del))}" aria-label="${esc(tr(T.del))}">${TRASH}</button>`}
          </div>
        </div>`;
      }).join('');
      body.innerHTML = `
        <div class="mx-st-hint">${esc(tr(list.length ? T.stationsHi : T.stationsEm))}</div>
        ${list.length ? `<div class="mx-st-list">${rows}</div>` : `<div class="mx-st-empty">${esc(tr(T.stationNone))}</div>`}
        <button class="mx-cat-add" type="button" data-st-add>${PLUS}<span>${esc(tr(T.stationAdd))}</span></button>`;
      if (focusId) {
        const inp = body.querySelector(`[data-st-name="${focusId}"]`);
        if (inp) { try { inp.focus(); inp.select(); } catch (_) {} }
      }
    }

    /* Le nom se sauve à la volée : pas de bouton, donc pas de renommage perdu
     * parce qu'on a fermé la fenêtre en pensant que c'était pris. Amorti à
     * 350 ms parce qu'une écriture déclenche l'abonnement du store, donc un
     * re-rendu de la page carte SOUS la fenêtre — une fois par frappe, ça
     * repeindrait la liste des produits à chaque lettre. */
    let nameTimer = null;
    const flushName = () => {
      if (!nameTimer) return;
      clearTimeout(nameTimer.t); nameTimer.run(); nameTimer = null;
    };
    body.addEventListener('input', (e) => {
      const nm = e.target.closest('[data-st-name]');
      if (!nm) return;
      const id = nm.dataset.stName, val = nm.value;
      if (nameTimer) clearTimeout(nameTimer.t);
      const run = () => { nameTimer = null; renameStation(id, val); };
      nameTimer = { run, t: setTimeout(run, 350) };
    });
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('[data-st-name]')) { e.preventDefault(); e.target.blur(); }
    });
    // Quitter le champ écrit tout de suite — fermer la fenêtre juste après une
    // frappe ne doit pas perdre la dernière lettre.
    body.addEventListener('focusout', (e) => { if (e.target.closest('[data-st-name]')) flushName(); });
    body.addEventListener('click', (e) => {
      // Toute action qui repeint doit d'abord écrire le nom en cours de frappe :
      // sinon le repaint réaffiche la dernière valeur ENREGISTRÉE et les lettres
      // tapées dans les 350 dernières millisecondes disparaissent sous les yeux.
      const col = e.target.closest('[data-st-color]');
      if (col) { flushName(); cycleStationColor(col.dataset.stColor); paint(); return; }
      const up = e.target.closest('[data-st-up]');
      if (up) { flushName(); moveStation(up.dataset.stUp, -1); paint(); return; }
      const dn = e.target.closest('[data-st-down]');
      if (dn) { flushName(); moveStation(dn.dataset.stDown, 1); paint(); return; }
      const del = e.target.closest('[data-st-del]');
      if (del) {
        const id = del.dataset.stDel;
        const row = body.querySelector(`[data-st-row="${id}"]`);
        // Confirmation en place plutôt qu'une seconde fenêtre par-dessus la
        // première — deux voiles empilés, on ne sait plus lequel on ferme.
        if (row && !row.dataset.confirm) {
          row.dataset.confirm = '1';
          const act = row.querySelector('.mx-st-act');
          act.innerHTML = `<button type="button" class="del" data-st-del="${esc(id)}" title="${esc(tr(T.del))}" style="width:auto;padding:0 10px;font-size:11.5px;color:var(--danger);border-color:var(--danger);">${esc(tr(T.del))} ?</button>`;
          // Le désarmement ne doit ni voler le curseur à quelqu'un qui tape le
          // nom d'un AUTRE poste, ni repeindre une liste déjà refaite.
          setTimeout(() => {
            try {
              if (!row.dataset.confirm || !body.contains(row)) return;
              if (body.contains(document.activeElement) && document.activeElement.closest('[data-st-name]')) return;
              paint();
            } catch (_) {}
          }, 4000);
          return;
        }
        flushName(); deleteStation(id); paint(); return;
      }
      if (e.target.closest('[data-st-add]')) {
        flushName();
        addStation('');
        const list = stationsOf(store.get());
        paint(list.length ? list[list.length - 1].id : null);
        return;
      }
    });
    m.el.querySelector('[data-st-close]').addEventListener('click', () => { flushName(); m.close(); render(); });
    // Échap ferme la fenêtre sans passer par le bouton, et retirer un champ du
    // DOM ne déclenche pas focusout : sans ce filet, fermer au clavier juste
    // après avoir tapé perdrait la fin du nom. Capture, pour passer avant le
    // gestionnaire de fermeture de la modale.
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Escape') flushName(); }, true);
    paint();
  }

  function itemModal(existing) {
    const K = window.Kiwi;
    const d = store.get();
    const cats = d.cats || [];
    if (!cats.length) { promptText({ title: tr(T.addCat), desc: tr(T.firstCat), placeholder: tr(T.catName), ok: tr(T.addCat) }, (v) => { if (v) { addCategory(v); render(); } }); return; }
    const it = existing || { name: '', price: '', catId: activeCat || cats[0].id, subId: activeSub || null, desc: '', avail: true, photo: '', video: '' };
    // Live media state for this modal — mutated by the picker, read on save.
    const media = { photo: it.photo || '', video: it.video || '' };

    const catOpts = cats.map((c) => `<option value="${c.id}" ${c.id === it.catId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const subsFor = (cid) => (catById(d, cid) ? (catById(d, cid).sub || []) : []);
    const subOptsHtml = (cid, sel) => `<option value="">${esc(tr(T.none))}</option>` + subsFor(cid).map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');

    const m = K.modal({
      tag: venueName(),
      title: existing ? tr(T.rename) : tr(T.addItem),
      width: 460,
      body: `
        <div class="mx-field"><label>${esc(tr(T.nameL))}</label><input data-f-name type="text" value="${esc(it.name)}" placeholder="${esc(tr(T.nameL))}"/></div>
        <div class="mx-field two">
          <div><label>${esc(tr(T.priceL))}</label><input data-f-price type="number" inputmode="decimal" min="0" step="1" value="${esc(it.price)}" placeholder="0"/></div>
          <div><label>${esc(tr(T.catL))}</label><select data-f-cat>${catOpts}</select></div>
        </div>
        ${/* Aucun sélecteur de poste ici : ce plat part au poste de sa catégorie,
              réglé une fois en tête de la liste des produits. */''}
        <div class="mx-field"><label>${esc(tr(T.subL))}</label><select data-f-sub>${subOptsHtml(it.catId, it.subId)}</select></div>
        <div class="mx-field"><label>${esc(tr(T.descL))}</label><textarea data-f-desc placeholder="${esc(tr(T.descL))}">${esc(it.desc || '')}</textarea></div>
        <div class="mx-field">
          <label>${esc(tr(T.mediaL))}</label>
          <div class="mx-media" data-f-media></div>
          <div class="mx-media-msg" data-f-media-msg>${esc(tr(T.mediaHint))}</div>
          <input type="file" data-f-photo-input accept="image/*" hidden />
          <input type="file" data-f-video-input accept="video/*" hidden />
        </div>`,
      foot: `<button class="kb ghost" type="button" data-f-cancel style="flex:1;justify-content:center;">${esc(tr(T.cancel))}</button>
             <button class="kb atlas" type="button" data-f-save style="flex:1.3;justify-content:center;">${esc(tr(T.save))}</button>`,
    });
    const q = (s) => m.el.querySelector(s);
    q('[data-f-cat]').addEventListener('change', (e) => { q('[data-f-sub]').innerHTML = subOptsHtml(e.target.value, null); });

    /* ── media: pick a file → it goes to R2 → we keep the URL ──
       The buttons are always live. If the account has no media storage yet the
       upload answers `no-media` and we say so in one line — an honest "not
       switched on" beats a button that looks broken. */
    const msg = (text) => { const el = q('[data-f-media-msg]'); if (el) el.textContent = text; };
    function renderMedia() {
      const box = q('[data-f-media]');
      if (!box) return;
      /* L'aperçu TOURNE, comme chez le client : c'est la seule façon pour le
         patron de juger sa boucle — un point de départ mal choisi ne se voit
         que quand ça reboucle. */
      const preview = media.video
        ? `<video class="mx-media-prev" src="${esc(media.video)}" autoplay loop muted playsinline preload="metadata" disablepictureinpicture></video>`
        : (media.photo ? `<img class="mx-media-prev" src="${esc(media.photo)}" alt="" />` : '');
      const del = (media.photo || media.video)
        ? `<button class="kb ghost mx-media-btn" type="button" data-f-media-del>${esc(tr(T.mediaDel))}</button>` : '';
      box.innerHTML = `
        ${preview}
        <div class="mx-media-actions">
          <button class="kb ghost mx-media-btn" type="button" data-f-pick-photo>${esc(tr(T.mediaAdd))}</button>
          <button class="kb ghost mx-media-btn" type="button" data-f-pick-video>${esc(tr(T.mediaVid))}</button>
          ${del}
        </div>`;
    }
    function uploadErr(error) {
      if (error === 'no-media' || error === 'not-configured') return tr(T.mediaOff);
      if (error === 'too-large') return tr(T.mediaBig);
      if (error === 'bad-type') return tr(T.mediaBad);
      return tr(T.mediaErr);
    }
    /* Ce que le fichier contient VRAIMENT, avant de l'envoyer. Le navigateur
       sait lire la durée et les dimensions d'un clip sans le téléverser : on
       refuse donc localement, tout de suite, avec la durée constatée — plutôt
       que de faire monter quinze mégaoctets pour dire non ensuite. */
    const MAX_CLIP_S = 10;
    function probeClip(file) {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true;
        const done = (r) => { URL.revokeObjectURL(url); resolve(r); };
        v.onloadedmetadata = () => done({ ok: true, seconds: v.duration || 0, w: v.videoWidth, h: v.videoHeight });
        v.onerror = () => done({ ok: false });
        // Un conteneur que le navigateur ne sait pas lire ne doit pas bloquer
        // l'envoi : le serveur tranchera sur le type MIME.
        setTimeout(() => done({ ok: false }), 4000);
        v.src = url;
      });
    }

    async function handleFile(file, kind) {
      if (!file) return;
      if (!window.KiwiOrderPro || !window.KiwiOrderPro.uploadMedia) { msg(tr(T.mediaOff)); return; }
      let warn = '';
      if (kind === 'video') {
        const p = await probeClip(file);
        if (p.ok && p.seconds > MAX_CLIP_S + 0.5) {
          msg(tr(T.mediaLong).replace('{n}', Math.round(p.seconds)).replace('{max}', MAX_CLIP_S));
          return;
        }
        if (p.ok && p.w && p.h && p.w > p.h) warn = tr(T.mediaWide);
      }
      msg(tr(T.mediaUp));
      const res = await window.KiwiOrderPro.uploadMedia(file);
      if (!res || !res.ok) { msg(uploadErr(res && res.error)); return; }
      // One medium per item: a video supersedes a photo and vice-versa, so the
      // card can never show two competing things.
      if (kind === 'video') { media.video = res.url; media.photo = ''; }
      else { media.photo = res.url; media.video = ''; }
      // L'avertissement de cadrage survit à l'envoi : c'est APRÈS, en voyant
      // l'aperçu recadré, qu'il devient compréhensible.
      msg(warn || tr(T.mediaHint));
      renderMedia();
    }
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-f-pick-photo]')) { q('[data-f-photo-input]').click(); return; }
      if (e.target.closest('[data-f-pick-video]')) { q('[data-f-video-input]').click(); return; }
      if (e.target.closest('[data-f-media-del]')) { media.photo = ''; media.video = ''; renderMedia(); return; }
    });
    q('[data-f-photo-input]').addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0], 'photo'));
    q('[data-f-video-input]').addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0], 'video'));
    renderMedia();

    q('[data-f-cancel]').addEventListener('click', () => m.close());
    q('[data-f-save]').addEventListener('click', () => {
      const data = {
        name: q('[data-f-name]').value, price: q('[data-f-price]').value,
        catId: q('[data-f-cat]').value, subId: q('[data-f-sub]').value || null, desc: q('[data-f-desc]').value,
        photo: media.photo, video: media.video,
        // Aucun poste ici : un plat part au poste de SA catégorie. Changer de
        // catégorie dans ce formulaire change donc son poste — c'est la même
        // phrase dite une fois, et c'est tout l'intérêt.
      };
      if (!data.name.trim()) { q('[data-f-name]').focus(); return; }
      if (existing) updateItem(existing.id, data); else { addItem(data); activeCat = data.catId; activeSub = data.subId || null; }
      m.close(); render();
      if (window.Kiwi.toast) window.Kiwi.toast(tr(T.saved), { type: 'success', force: true });
    });
    setTimeout(() => { try { q('[data-f-name]').focus(); } catch (_) {} }, 180);
  }

  /* ───────────────── handlers ───────────────── */
  /* Le sélecteur de poste est un <select> : la délégation de clic de Kiwi ne le
   * voit pas, il faut écouter `change`. Posé UNE fois sur le document plutôt
   * qu'à chaque rendu — la page carte se repeint à chaque frappe d'un nom de
   * poste, et un écouteur par rendu s'empilerait jusqu'à écrire cent fois. */
  let catStationBound = false;
  function bindCatStation() {
    if (catStationBound) return;
    catStationBound = true;
    document.addEventListener('change', (e) => {
      const sel = e.target && e.target.closest && e.target.closest('[data-cat-station]');
      if (!sel) return;
      setCategoryStation(sel.getAttribute('data-cat-station'), sel.value);
      render();
    });
  }

  function registerHandlers() {
    const H = window.Kiwi && window.Kiwi.handlers;
    if (!H) return;
    bindCatStation();
    H['mx-cat-add'] = () => promptText({ title: tr(T.addCat), placeholder: tr(T.catName), ok: tr(T.addCat) }, (v) => { if (v) { const c = addCategory(v); const d = store.get(); const last = d.cats[d.cats.length - 1]; if (last) { activeCat = last.id; activeSub = null; } render(); } });
    H['mx-cat-pick'] = (_el, id) => { activeCat = id; activeSub = null; render(); };
    H['mx-sub-pick'] = (_el, arg) => { const [cid, sid] = String(arg || '').split('::'); activeCat = cid; activeSub = sid || null; render(); };
    H['mx-cat-edit'] = (_el, id) => {
      const d = store.get(); const c = catById(d, id); if (!c) return;
      promptText({ title: tr(T.rename), value: c.name, placeholder: tr(T.catName), ok: tr(T.save),
        desc: `<button class="kb ghost" type="button" data-action="mx-cat-del" data-arg="${id}" style="color:var(--danger);border-color:var(--danger);padding:6px 12px;font-size:12px;">${esc(tr(T.del))}</button>` },
        (v) => { if (v) { renameCategory(id, v); render(); } });
    };
    H['mx-cat-del'] = (_el, id) => {
      // close any open modal, then confirm
      document.querySelectorAll('.modal-veil, .kiwi-modal-veil').forEach((v) => { try { v.remove(); } catch (_) {} });
      confirmThen(tr(T.delCatQ), () => { deleteCategory(id); if (activeCat === id) { activeCat = null; activeSub = null; } render(); });
    };
    H['mx-sub-add'] = (_el, id) => promptText({ title: tr(T.addSub), placeholder: tr(T.subName), ok: tr(T.addSub) }, (v) => { if (v) { addSubcategory(id, v); activeCat = id; render(); } });
    H['mx-stations'] = () => stationsModal();
    H['mx-item-add'] = () => itemModal(null);
    H['mx-item-edit'] = (_el, id) => { const it = itemById(store.get(), id); if (it) itemModal(it); };
    H['mx-item-del'] = (_el, id) => confirmThen(tr(T.delItemQ), () => { deleteItem(id); render(); });
    H['mx-item-avail'] = (_el, id) => { const it = itemById(store.get(), id); if (it) { updateItem(id, { avail: it.avail === false }); render(); } };
    /* Bring the carte over from whatever the kitchen used before — a spreadsheet
     * or an export from the old till. assets/catalog-import.js does the reading
     * and shows what it found; we only re-render once it has written. */
    H['mx-import'] = () => {
      if (!window.KiwiCatalogImport) {
        if (window.Kiwi.toast) window.Kiwi.toast('Import indisponible', { type: 'warn', desc: 'Rechargez la page.', force: true });
        return;
      }
      window.KiwiCatalogImport.openMenu({ onDone: () => { activeCat = null; activeSub = null; render(); } });
    };
    H['mx-load-example'] = () => { store.loadExample(); activeCat = null; activeSub = null; render(); if (window.Kiwi.toast) window.Kiwi.toast(tr(T.example), { type: 'success', force: true }); try { window.Kiwi.confetti && window.Kiwi.confetti(); } catch (_) {} };
  }

  function confirmThen(message, onYes) {
    const K = window.Kiwi;
    const m = K.modal({
      tag: venueName(), title: message, width: 400,
      foot: `<button class="kb ghost" type="button" data-c-no style="flex:1;justify-content:center;">${esc(tr(T.cancel))}</button>
             <button class="kb" type="button" data-c-yes style="flex:1;justify-content:center;background:var(--danger);color:#fff;border-color:var(--danger);">${esc(tr(T.del))}</button>`,
    });
    m.el.querySelector('[data-c-no]').addEventListener('click', () => m.close());
    m.el.querySelector('[data-c-yes]').addEventListener('click', () => { m.close(); onYes(); });
  }

  /* ───────────────── nav-menu ownership (custom venues only) ───────────────── */
  function isCustom() { const KV = window.KiwiVenue; return !!(KV && KV.isCustom && KV.isCustom()); }
  let owned = false;
  function ownNav() {
    if (owned) return;
    const H = window.Kiwi && window.Kiwi.handlers;
    if (!H) return;
    const prev = H['nav-menu'];
    const wrapped = function () {
      if (isCustom()) { document.body.classList.remove('page-genpage'); return render(); }
      return prev ? prev.apply(this, arguments) : undefined;
    };
    wrapped.__mxOwned = true;
    H['nav-menu'] = wrapped;
    owned = true;
  }

  /* ───────────────── publish to the customer QR page (real merchants only) ───
   * The customer self-order page (kiwi-order.html) runs on the diner's own phone
   * — it can't read this localStorage record. So a real, signed-in merchant
   * mirrors its carte up to the server (POST /api/menu; the server derives the
   * merchant from the session, we only send the data). GET /api/menu?merchant=
   * <slug> then serves it to the customer. Gated to KiwiEnv.isReal() so the local
   * pitch demo never makes a network call and stays byte-identical; fail-soft so
   * a static host (GitHub Pages) or offline just no-ops. Debounced so a burst of
   * edits publishes once. */
  function isRealSession() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; }
  }
  /* A boutique has no carte. It publishes STOCK to the same row, through
   * assets/orderpro-publish.js — so if this published too, its empty
   * { cats:[], items:[] } would land as type='boutique', the server would run
   * the boutique sanitizer over it, and the shop's real products would be
   * overwritten with nothing. The two publishers share one row; this one owns
   * restaurants, the other owns boutiques. Server type wins, same precedence as
   * orderpro-publish.js, so a stale local key can't misroute the decision. */
  const BOUTIQUE_TRADES = ['boutique', 'pret-a-porter', 'pretaporter', 'mode', 'friperie',
                           'chaussures', 'maroquinerie', 'bijouterie', 'concept-store',
                           'sport', 'vetement', 'habillement'];
  function isBoutiqueVenue(vd) {
    let serverType = '';
    try { serverType = (window.KiwiConfig && window.KiwiConfig.type) || ''; } catch (_) {}
    const raw = String(serverType || (vd && (vd.subtype || vd.type)) || '').toLowerCase();
    return !!raw && BOUTIQUE_TRADES.some((t) => raw.indexOf(t) !== -1);
  }

  /* ═══════════════ LA CARTE APPARTIENT AU COMPTE, PAS AU NAVIGATEUR ══════════
   * Ce module ne faisait que POUSSER. La carte de travail vivait dans le seul
   * localStorage du navigateur qui l'avait saisie — donc un commerçant qui
   * ouvrait son tableau de bord sur son téléphone, sur un iPad, ou dans une
   * fenêtre privée trouvait une carte vide. Et pire : il republiait ce vide
   * par-dessus la vraie carte, et le client qui scannait le QR de sa table
   * tombait sur « bientôt disponible ». Une carte n'est pas un réglage
   * d'affichage, c'est le fonds de commerce.
   *
   * Trois règles, dans cet ordre :
   *
   *  1. LIRE AVANT D'ÉCRIRE. Aucune publication tant que le serveur n'a pas
   *     répondu. Un navigateur neuf n'a rien à dire tant qu'il n'a rien lu.
   *  2. NE RIEN PERDRE. Panne, hors ligne, 503, session expirée : on avale, la
   *     copie locale reste la vérité de travail, on retente à la modification
   *     suivante. Le tableau de bord ne bloque jamais sur le réseau.
   *  3. FUSIONNER, PAS ÉCRASER. Union par id : ce que CET appareil affiche
   *     l'emporte sur un id connu des deux côtés, et tout ce que l'autre a
   *     ajouté vient s'ajouter. Rien ne disparaît.
   *
   * Rien ici ne connaît un magasin en particulier : l'identité est
   * slugMerchant(nom de l'établissement) côté serveur, résolue depuis la
   * session. Tout établissement créé aujourd'hui ou dans deux ans passe par le
   * même chemin, sans une ligne de code de plus. */
  const cloud = { read: false, merchant: '', tried: 0, pulling: false };

  function storeSlug() {
    try {
      const C = window.KiwiConfig;
      if (C && C.storeSlug) { const s = C.storeSlug(); if (s) return s; }
    } catch (_) {}
    const KV = window.KiwiVenue;
    let name = '';
    try {
      const vd = KV && KV.isCustom && KV.isCustom() && KV.getCurrentVenueData && KV.getCurrentVenueData();
      if (vd && vd.name) name = String(vd.name).trim();
    } catch (_) {}
    return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // Le compteur d'ids (`seq`) ne voyage pas : le serveur ne stocke que la carte.
  // Sans ce rattrapage, un navigateur neuf repartirait de it_1 et écraserait des
  // produits existants dès le premier ajout.
  function healSeq(d) {
    let max = +d.seq || 0;
    const scan = (id) => { const m = /_(\d+)$/.exec(String(id || '')); if (m) max = Math.max(max, +m[1]); };
    (d.cats || []).forEach((c) => { scan(c.id); (c.sub || []).forEach((s) => scan(s.id)); });
    (d.items || []).forEach((i) => scan(i.id));
    // Les postes tirent du même compteur : sans ce balayage, un navigateur neuf
    // recréerait st_1 par-dessus un poste existant et les plats du serveur
    // suivraient le mauvais.
    (d.stations || []).forEach((s) => scan(s.id));
    d.seq = max;
    return d;
  }

  // Union par id, cet appareil d'abord. Les sous-catégories fusionnent de même,
  // sinon renommer une catégorie sur un poste effacerait les sous-catégories
  // créées sur l'autre.
  function mergeMenus(mine, theirs) {
    /* kitchenId voyage avec la carte. C'est LE réglage qui dit où part ce que
     * personne n'a routé ; le perdre à la fusion ferait retomber le repli sur
     * « le premier de la liste », c'est-à-dire exactement le piège qu'on vient
     * de retirer. Celui de cet appareil gagne, l'autre sert de secours. */
    const out = {
      seq: Math.max(+(mine && mine.seq) || 0, +(theirs && theirs.seq) || 0),
      kitchenId: (mine && mine.kitchenId) || (theirs && theirs.kitchenId) || '',
      cats: [], items: [], stations: [],
    };
    /* Les postes fusionnent AVANT le reste et dans l'ordre de cet appareil :
     * cet ordre est celui des onglets de l'écran cuisine, donc celui qu'on a
     * sous les yeux gagne, et les postes créés ailleurs viennent se ranger
     * derrière plutôt que de disparaître. */
    const stSeen = Object.create(null);
    [((mine && mine.stations) || []), ((theirs && theirs.stations) || [])].forEach((list) => {
      list.forEach((s) => { if (s && s.id && !stSeen[s.id]) { stSeen[s.id] = 1; out.stations.push(s); } });
    });
    /* `station` fait partie de la catégorie au même titre que son nom : c'est le
     * routage. L'oublier ici renverrait toute la carte en cuisine au premier
     * rechargement depuis un autre appareil — une panne silencieuse, découverte
     * au coup de feu. Cet appareil gagne ; l'autre comble un trou, jamais plus. */
    const byId = Object.create(null);
    const mkCat = (c) => ({ id: c.id, name: c.name, station: c.station || '', sub: (c.sub || []).slice() });
    ((mine && mine.cats) || []).forEach((c) => {
      if (!c || !c.id || byId[c.id]) return;
      byId[c.id] = mkCat(c);
      out.cats.push(byId[c.id]);
    });
    ((theirs && theirs.cats) || []).forEach((c) => {
      if (!c || !c.id) return;
      if (!byId[c.id]) { byId[c.id] = mkCat(c); out.cats.push(byId[c.id]); return; }
      if (!byId[c.id].station && c.station) byId[c.id].station = c.station;
      const have = Object.create(null);
      byId[c.id].sub.forEach((s) => { if (s && s.id) have[s.id] = 1; });
      (c.sub || []).forEach((s) => { if (s && s.id && !have[s.id]) byId[c.id].sub.push(s); });
    });
    const seen = Object.create(null);
    [((mine && mine.items) || []), ((theirs && theirs.items) || [])].forEach((list) => {
      list.forEach((it) => { if (it && it.id && !seen[it.id]) { seen[it.id] = 1; out.items.push(it); } });
    });
    return healSeq(out);
  }

  /* Relire la carte du compte. Adoption pure si ce navigateur est vierge (le cas
   * qui compte : téléphone, iPad, fenêtre privée), fusion sinon. */
  function pull() {
    if (!isRealSession() || cloud.pulling) return Promise.resolve(false);
    const KV = window.KiwiVenue;
    const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    if (isBoutiqueVenue(vd)) { cloud.read = true; return Promise.resolve(false); }
    cloud.pulling = true;
    const slug = storeSlug();
    return fetch('/api/menu?mine=1' + (slug ? '&merchant=' + encodeURIComponent(slug) : ''),
                 { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        cloud.pulling = false;
        if (!j || j.error || j.unreachable) return false;   // injoignable → surtout ne pas publier
        cloud.merchant = j.merchant || '';
        cloud.read = true;                                   // à partir d'ici, publier est sûr
        const theirs = j.menu;
        if (!theirs || !((theirs.items && theirs.items.length) || (theirs.cats && theirs.cats.length))) return false;
        const mine = store.get();
        const empty = !((mine.cats && mine.cats.length) || (mine.items && mine.items.length));
        store.set(empty ? healSeq({ seq: 0, cats: theirs.cats || [], items: theirs.items || [], stations: theirs.stations || [], kitchenId: theirs.kitchenId || '' })
                        : mergeMenus(mine, theirs));
        try { if (isCustom()) render(); } catch (_) {}
        return true;
      })
      .catch(() => { cloud.pulling = false; return false; });   // hors ligne → local reste la vérité
  }

  let syncTimer = null;
  function publish(vid) {
    if (!isRealSession()) return;                 // local demo → never touch the network
    const KV = window.KiwiVenue;
    const vd = (KV && KV.getVenueData && KV.getVenueData(vid)) ||
               (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    if (isBoutiqueVenue(vd)) return;              // stock is published by orderpro-publish.js
    // RÈGLE 1 — rien ne part tant qu'on n'a pas lu. Sans ce verrou, un navigateur
    // neuf publiait sa carte vide par-dessus la vraie, quinze cents millisecondes
    // après l'ouverture du tableau de bord.
    if (!cloud.read) { if (cloud.tried++ < 3) pull().then(() => { if (cloud.read) publish(vid); }); return; }
    const data = store.get(vid);
    const slug = cloud.merchant || storeSlug();
    /* Les horaires partent AVEC la carte. Le téléphone du client ne peut pas
     * lire les réglages du commerçant : sans ce passager, la page de commande
     * ne saurait pas que le restaurant est fermé et prendrait la commande
     * quand même. Le serveur ne garde que la semaine et les exceptions
     * (functions/api/menu.js) — les dérogations internes ne sortent pas. */
    const withHours = (() => {
      try {
        const KH = window.KiwiHours;
        if (!KH || !KH.isConfigured(vid)) return data;
        const h = KH.get(vid);
        return Object.assign({}, data, { hours: { v: 1, week: h.week, exceptions: h.exceptions } });
      } catch (_) { return data; }
    })();
    try {
      fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: vd.name || '', type: vd.type || '', data: withHours,
          merchant: slug || undefined,
          // On a relu le serveur : une carte vide ici est une carte vidée exprès,
          // pas un navigateur qui n'a rien trouvé. Le serveur refuse l'inverse.
          allowEmpty: true,
        }),
      }).catch(function () {});                    // fire-and-forget, fail-soft
    } catch (_) {}
  }
  function schedulePublish(vid) {
    if (!isRealSession()) return;
    if (syncTimer) { try { clearTimeout(syncTimer); } catch (_) {} }
    syncTimer = setTimeout(function () { syncTimer = null; publish(vid); }, 800);
  }

  /* ───────────────── boot ───────────────── */
  function boot() {
    registerHandlers();
    // venues.js re-asserts nav-menu at 'load'; own it just after, before the
    // starter layer wraps at load+150ms (it lets 'menu' through via REAL_FOR_CUSTOM).
    setTimeout(ownNav, 60);
    // re-render the open menu page live when this venue's menu changes elsewhere
    // (caisse), and — for a real merchant — publish the new carte to the server so
    // the customer QR page picks it up.
    store.subscribe((vid) => {
      if (isCustom() && document.querySelector('.dash-genpage [data-page="menu"], .kw-app [data-genpage="menu"]')) {
        try { render(); } catch (_) {}
      }
      schedulePublish(vid);
    });
    /* Un changement d'horaires doit repartir vers la page client tout de suite :
     * un commerçant qui déclare sa fermeture de l'Aïd le matin ne doit pas voir
     * des commandes arriver l'après-midi parce que la publication attendait la
     * prochaine modification de la carte. */
    try {
      if (window.KiwiHours && window.KiwiHours.subscribe) {
        window.KiwiHours.subscribe(function () { schedulePublish(); });
      }
    } catch (_) {}
    // RELIRE, PUIS publier. Dans cet ordre, et jamais l'inverse : c'est la
    // lecture qui reconstruit la carte dans un navigateur neuf, et c'est elle
    // qui autorise la publication (voir la règle 1 dans publish()).
    if (isRealSession()) {
      setTimeout(function () {
        pull().then(function () { try { publish(); } catch (_) {} });
      }, 1200);
      // Revenir sur l'onglet après avoir modifié la carte sur un autre appareil
      // doit suffire à la voir arriver — sans marteler le réseau.
      let lastPull = 0;
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        const now = Date.now();
        if (now - lastPull < 20000) return;
        lastPull = now;
        try { pull(); } catch (_) {}
      });
    }
  }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  /* ───────────────── public API (for the caisse — one brain) ───────────────── */
  window.KiwiMenuStore = {
    data: (vid) => store.get(vid),
    categories: (vid) => (store.get(vid).cats || []),
    items: (vid) => (store.get(vid).items || []),
    availableItems: (vid) => (store.get(vid).items || []).filter((i) => i.avail !== false),
    isEmpty: (vid) => store.isEmpty(vid),
    subscribe: (fn) => store.subscribe(fn),
    loadExample: (vid) => store.loadExample(vid),
    addCategory, addSubcategory, addItem, updateItem, deleteItem, renameCategory, deleteCategory,
    /* Les postes de préparation. `stations()` rend la liste DANS L'ORDRE, qui
     * est l'ordre des onglets de l'écran cuisine — plus le réglage de routage.
     * Le routage se lit sur la catégorie (`cat.station`, vide = la cuisine) et
     * le repli se nomme : `kitchenId()`. */
    stations: (vid) => (store.get(vid).stations || []),
    kitchenId: (vid) => kitchenIdOf(store.get(vid)),
    setCategoryStation,
    addStation, renameStation, deleteStation, moveStation, cycleStationColor,
    render,
    publish: (vid) => publish(vid),   // push this venue's carte to the customer QR page (real merchants only)
    _store: store,
  };
})();
