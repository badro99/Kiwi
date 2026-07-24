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
    mediaHint:  { fr: 'Visible par vos clients sur la carte en ligne.', en: 'Visible to your customers on the online menu.', ar: 'كيبان لكليانتك فالقائمة أونلاين.' },
    mediaOff:   { fr: 'Stockage média pas encore activé sur votre compte.', en: 'Media storage isn\'t enabled on your account yet.', ar: 'تخزين الميديا مازال ماتفعّلش فالحساب ديالك.' },
    mediaBig:   { fr: 'Fichier trop lourd.', en: 'File too large.', ar: 'الملف ثقيل بزاف.' },
    mediaBad:   { fr: 'Format non pris en charge.', en: 'Format not supported.', ar: 'الصيغة ماخدامة.' },
    mediaErr:   { fr: 'Envoi impossible, réessayez.', en: 'Upload failed, try again.', ar: 'التصويفط مامشاش، عاود جرّب.' },
    tags:       { fr: 'Tags NFC', en: 'NFC tags', ar: 'تاڭات NFC' },
  };

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
      cats: [
        { id: 'cat_1', name: 'Entrées', sub: [] },
        { id: 'cat_2', name: 'Plats', sub: [{ id: 'sub_1', name: 'Tajines' }, { id: 'sub_2', name: 'Grillades' }] },
        { id: 'cat_3', name: 'Boissons', sub: [{ id: 'sub_3', name: 'Chaudes' }, { id: 'sub_4', name: 'Fraîches' }] },
        { id: 'cat_4', name: 'Desserts', sub: [] },
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
    blank: () => ({ seq: 0, cats: [], items: [] }),
    example: example,
    isEmpty: (d) => !d || (!(d.cats && d.cats.length) && !(d.items && d.items.length)),
  });

  /* ───────────────── data ops ───────────────── */
  function nid(d, prefix) { d.seq = (d.seq || 0) + 1; return prefix + '_' + d.seq; }
  const catById = (d, id) => (d.cats || []).find((c) => c.id === id) || null;
  const itemById = (d, id) => (d.items || []).find((i) => i.id === id) || null;
  const itemsIn = (d, catId, subId) => (d.items || []).filter((i) => i.catId === catId && (subId == null || i.subId === subId));

  function addCategory(name) {
    return store.update((d) => {
      const c = { id: nid(d, 'cat'), name: String(name || tr(T.catName)).trim() || tr(T.catName), sub: [] };
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
      .mx-cat-add, .mx-sub-add { display: inline-flex; align-items: center; gap: 7px; justify-content: center; width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 12px; border: 1.5px dashed var(--n-300); background: transparent; color: var(--n-600); font-family: var(--sans); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 140ms; }
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
      .mx-sub { display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 8px; font-size: 12.5px; color: var(--n-600); cursor: pointer; transition: all 120ms; }
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
      .mx-item .sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 160ms; }
      .mx-item .sw.on::after { transform: translateX(14px); }
      .mx-item .act { display: inline-flex; gap: 4px; }
      .mx-item .act button { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--mx-line); background: var(--surface); color: var(--n-500); cursor: pointer; transition: all 130ms; }
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
      .mx-media-prev { width: 64px; height: 64px; border-radius: 11px; object-fit: cover; background: var(--paper-soft); border: 1px solid var(--mx-line); flex: 0 0 auto; }
      .mx-media-actions { display: flex; gap: 6px; flex-wrap: wrap; }
      .mx-media-btn { padding: 8px 12px; font-size: 12.5px; }
      .mx-media-msg { font-size: 11.5px; color: var(--n-500); margin-top: 7px; line-height: 1.45; }
      /* item row thumbnail — only present once the merchant adds media */
      .mx-item .th { width: 38px; height: 38px; border-radius: 9px; object-fit: cover; background: var(--paper-soft); border: 1px solid var(--mx-line); }
    `;
    document.head.appendChild(s);
  }

  /* ───────────────── small SVGs ───────────────── */
  const PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  const EDIT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>';
  const TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>';
  const SPARK = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z"/></svg>';

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
      return `
        <div class="mx-cat ${isOn ? 'on' : ''}">
          <div class="mx-cat-head" data-action="mx-cat-pick" data-arg="${c.id}">
            <span class="nm">${esc(c.name)}</span>
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
      return `
        <div class="mx-item ${it.avail === false ? 'off' : ''}">
          <div style="display:flex;align-items:center;gap:11px;min-width:0;">
            ${it.video ? `<video class="th" src="${esc(it.video)}" muted playsinline preload="metadata"></video>`
              : (it.photo ? `<img class="th" src="${esc(it.photo)}" alt="" loading="lazy" />` : '')}
            <div style="min-width:0;">
              <div class="nm">${esc(it.name)}${sub ? `<span class="tag">${esc(sub.name)}</span>` : ''}</div>
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
                ${orderProOn() ? `<button class="mx-cat-add" style="width:auto;border-style:solid;margin:0;" data-action="orderpro-tags"><span>${esc(tr(T.tags))}</span></button>` : ''}
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
      const preview = media.video
        ? `<video class="mx-media-prev" src="${esc(media.video)}" muted playsinline preload="metadata"></video>`
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
    async function handleFile(file, kind) {
      if (!file) return;
      if (!window.KiwiOrderPro || !window.KiwiOrderPro.uploadMedia) { msg(tr(T.mediaOff)); return; }
      msg(tr(T.mediaUp));
      const res = await window.KiwiOrderPro.uploadMedia(file);
      if (!res || !res.ok) { msg(uploadErr(res && res.error)); return; }
      // One medium per item: a video supersedes a photo and vice-versa, so the
      // card can never show two competing things.
      if (kind === 'video') { media.video = res.url; media.photo = ''; }
      else { media.photo = res.url; media.video = ''; }
      msg(tr(T.mediaHint));
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
      };
      if (!data.name.trim()) { q('[data-f-name]').focus(); return; }
      if (existing) updateItem(existing.id, data); else { addItem(data); activeCat = data.catId; activeSub = data.subId || null; }
      m.close(); render();
      if (window.Kiwi.toast) window.Kiwi.toast(tr(T.saved), { type: 'success', force: true });
    });
    setTimeout(() => { try { q('[data-f-name]').focus(); } catch (_) {} }, 180);
  }

  /* ───────────────── handlers ───────────────── */
  function registerHandlers() {
    const H = window.Kiwi && window.Kiwi.handlers;
    if (!H) return;
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
    H['mx-item-add'] = () => itemModal(null);
    H['mx-item-edit'] = (_el, id) => { const it = itemById(store.get(), id); if (it) itemModal(it); };
    H['mx-item-del'] = (_el, id) => confirmThen(tr(T.delItemQ), () => { deleteItem(id); render(); });
    H['mx-item-avail'] = (_el, id) => { const it = itemById(store.get(), id); if (it) { updateItem(id, { avail: it.avail === false }); render(); } };
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
  let syncTimer = null;
  function publish(vid) {
    if (!isRealSession()) return;                 // local demo → never touch the network
    const KV = window.KiwiVenue;
    const vd = (KV && KV.getVenueData && KV.getVenueData(vid)) ||
               (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    const data = store.get(vid);
    try {
      fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: vd.name || '', type: vd.type || '', data: data }),
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
    // Publish once on boot so a merchant who never edits still has its carte live.
    if (isRealSession()) setTimeout(function () { try { publish(); } catch (_) {} }, 1500);
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
    render,
    publish: (vid) => publish(vid),   // push this venue's carte to the customer QR page (real merchants only)
    _store: store,
  };
})();
