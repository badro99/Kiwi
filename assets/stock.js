/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Stock & approvisionnement page
 *
 * Self-contained IIFE that owns the 5-tab inventory + supply management page
 * reachable from the sidebar "Stock & approvisionnement" item. The page
 * replaces the previous fullpage drawer (which lived in pages-pro.js).
 *
 * Tabs:
 *   1. Vue d'ensemble  — 4 KPI cards · urgent alerts · variance AI · 7-day deliveries
 *   2. Articles & stock — search + filters + sortable table or card grid
 *   3. Fournisseurs    — 3 stats + supplier table + price-changes AI
 *   4. Commandes       — 4 active orders + history + Kiwi auto-order suggestion
 *   5. Prévisions IA   — SVG demand chart + shortfalls + seasonal insights (Ultra)
 *
 * Modals:
 *   · Scanner une facture  · Inventaire physique  · Quick Order
 *   · Supplier Profile     · Item Detail          · Day-deliveries Detail
 *
 * Reads INVENTORY + SUPPLIERS from window.KiwiVenue. All demo edits
 * (sent orders, counted inventory, scanned invoices) live in module-scoped
 * state — they reset on page refresh per spec.
 *
 * Loads AFTER assets/pages.js + pages-pro.js so its nav-stock handler wins.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
   * i18n — FR/EN/AR strings · captured-originals pattern aligns w/ i18n.js
   * ═══════════════════════════════════════════════════════════════════════ */
  /* stock-part:strings */
  const STR = window.KiwiStockStrings;
  /* /stock-part:strings */

  const lang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const t = (k, ...args) => {
    const L = STR[lang()] || STR.fr;
    const v = L[k] != null ? L[k] : STR.fr[k];
    if (typeof v === 'function') return v(...args);
    return v != null ? v : k;
  };

  const catalogText=(key,fr)=>window.KiwiCatalogUI?.text(key,fr)||fr;
  const catalogLabel=(key,fr)=>window.KiwiCatalogUI?.label(key,fr)||esc(fr);
  const catalogIcon=(name)=>`<img class="catalog-icon" draggable="false" src="assets/icons/material/${name}.svg" alt="" aria-hidden="true"/>`;

  /* ═══════════════════════════════════════════════════════════════════════
   * State (resets on page refresh)
   * ═══════════════════════════════════════════════════════════════════════ */
  let stCurrentTab = 'overview';
  /* #0151 · A phone opens on the two-column cards; a wide screen on the table. */
  let stItemView = (typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches) ? 'cards' : 'list';
  let stCatFilter = 'all';
  let stStatusFilter = 'all';
  let stSearch = '';
  let stSortBy = 'name';
  let stSortDir = 'asc';
  let stVenueFilter = 'all';
  let stItemSubView = 'catalog'; // 'catalog' | 'waste' | 'counts'
  let stWasteFilterReason = 'all';
  let stWasteDateRange = '30j';
  let stWasteSearch = '';
  let stCountSubTab = 'list'; // 'list' | 'rollup'
  let stCountStatusFilter = 'all'; // 'all' | 'submitted' | 'applied' | 'rejected'
  let stCountDateFilter = '30j'; // 'aujourdhui' | '7j' | '30j' | 'tout'
  let stCountSearch = '';
  const stockState = window.KiwiStockState(() => ({ currentStockFor, retailCatalog, retailSetProductStock, stShowReal, stockLocationId, stockUnitId }));
  const stStockOverrides = stockState.overrides();
  const stMarked86 = new Set();
  const stConfirmedOrders = new Set();
  const stSentSuggested = false;
  let stPageActive = false;
  let stDemoClockUnsub = null;

  /* Per-session mutable overlay on top of read-only venue inventory/suppliers.
   * Adds, edits, and deletes live here until reload — matches the rest of the
   * dashboard's "fake data resets on reload" demo contract. */
  let stUserItems       = [];                 // brand-new items created this session
  const stItemOverrides = Object.create(null); // edits to existing items, keyed by id
  const stDeletedItems  = new Set();          // soft-deleted item ids
  let stUserSuppliers   = [];                 // brand-new suppliers created this session
  const stSupOverrides  = Object.create(null); // edits to existing suppliers, keyed by id
  const stDeletedSups   = new Set();          // soft-deleted supplier ids
  let stUserCategories  = [];                 // owner-added categories [{ id, label }]
  const stCategoryOverrides = Object.create(null); // renamed built-ins/user categories, keyed by id
  const stDeletedCategories = new Set();      // deleted category ids (items are reassigned first)

  /* ── Persistance de la surcouche — VRAI commerçant uniquement ──
   * Le contrat « ça repart à zéro au rechargement » ci-dessus vaut pour la
   * DÉMO : ce sont des retouches sur un inventaire fictif, elles doivent
   * disparaître. Pour un vrai commerçant ce ne sont pas des retouches de démo,
   * c'est SON stock : il saisissait ses articles, ses fournisseurs et ses
   * catégories, voyait la page se remplir, rechargeait — et tout avait disparu,
   * sans le moindre avertissement. Le travail d'une soirée de saisie.
   *
   * Rangé par établissement sous `kiwi:` (purgé au changement de compte, voir
   * TENANT_PREFIXES dans identity.js). La démo n'écrit ni ne lit : son contrat
   * de remise à zéro est intact. */
  /* « (démo · réinitialisé au refresh) » était collé dans les libellés eux-mêmes,
     donc affiché AUSSI au vrai commerçant — à qui on annonçait que sa saisie
     serait perdue, pendant qu'elle l'était effectivement. Maintenant qu'elle est
     conservée, la mise en garde ne vaut plus que pour la démo. */
  const stDemoNote = () => (stShowReal() ? '' : ({
    fr: ' (démo · réinitialisé au refresh)',
    en: ' (demo · resets on refresh)',
    ar: ' (تجريبي · يُعاد عند التحديث)',
  }[lang()] || ' (démo · réinitialisé au refresh)'));

  /* `currentVenueId()` peut valoir la constante 'scoped' — ce n'est pas un
     établissement, c'est « celui que la console opérateur regarde ». Deux
     commerçants ouverts l'un après l'autre depuis la console partageaient donc
     la même clé `kiwi:stockOverlay:scoped`, et le cache stOverlayLoadedFor, qui
     compare ce même identifiant, ne rechargeait même pas entre les deux : le
     stock du premier restait à l'écran sous le nom du second. Dès que
     l'identifiant est transitoire, on range par slug résolu. */
  const stOverlayScope = () => {
    const vid = currentVenueId();
    try {
      /* Real dashboard + paired caisse use the SAME local key as well as the
       * same server document. This gives same-browser tabs immediate storage
       * events; carryForward below adopts the former venue-id/scoped key. */
      const s = stShowReal() && window.KiwiCloudDoc && window.KiwiCloudDoc.slugFor(vid);
      if (s) return s;
    } catch (_) {}
    return vid;
  };
  const stOverlayKey = () => 'kiwi:stockOverlay:' + stOverlayScope();
  let stOverlayLoadedFor = null;

  function migrateStockDocV2(d) {
    if (!d || typeof d !== 'object') return d;
    if ((d.schemaVersion || 1) >= 2 && Array.isArray(d.subcategories)) return d;

    const categories = Array.isArray(d.cats) ? [...d.cats] : (Array.isArray(d.categories) ? [...d.categories] : []);
    const knownCatIds = new Set(categories.map(c => c && c.id));
    const subcategories = [];

    const originals = new Map();
    (Array.isArray(d.items) ? d.items : []).forEach(item => {
      if (!item || !item.id) return;
      originals.set(String(item.id), item);
      const catId = String(item.category || item.cat || 'epicerie');
      if (!knownCatIds.has(catId)) {
        categories.push({ id: catId, label: String(item.category || item.cat || 'Épicerie') });
        knownCatIds.add(catId);
      }
      const supCards = [];
      if (item.supplier) {
        supCards.push({
          id: 'sup-card-' + item.id,
          supplierName: String(item.supplier),
          defaultPrice: Number.isFinite(+item.costPerUnit) ? +item.costPerUnit : (Number.isFinite(+item.cost) ? +item.cost : 0),
          purchaseUnit: String(item.unit || 'unité'),
          factor: 1,
          rank: 1,
        });
      }
      subcategories.push({
        id: String(item.id),
        categoryId: catId,
        name: String(item.name || 'Article'),
        unit: String(item.unit || 'unité'),
        defaultCost: Number.isFinite(+item.costPerUnit) ? +item.costPerUnit : (Number.isFinite(+item.cost) ? +item.cost : 0),
        suppliers: supCards,
        currentStock: Number.isFinite(+item.currentStock) ? +item.currentStock : (Number.isFinite(+item.stock) ? +item.stock : 0),
        parLevel: item.parLevel != null ? +item.parLevel : (item.par != null ? +item.par : null),
        reorderLevel: item.reorderLevel != null ? +item.reorderLevel : (item.reorder != null ? +item.reorder : null),
        usageThisWeek: +item.usageThisWeek || 0,
        theoreticalUsage: +item.theoreticalUsage || 0,
        updatedAt: +item.updatedAt || Date.now(),
      });
    });

    d.schemaVersion = 2;
    d.cats = categories;
    d.categories = categories;
    d.subcategories = subcategories;

    /* Enveloppe de compatibilité. On PART de l'article d'origine et on n'écrase
       que les champs projetés : reconstruire depuis une liste fixe détruit en
       silence tout champ hors liste (lastDelivery, deliveryFrequency, status,
       sku, notes…), et stOverlayRaw() réécrit le document migré dans
       localStorage dès la lecture — la perte est immédiate et irréversible. */
    d.items = subcategories.map(s => Object.assign({}, originals.get(s.id) || {}, {
      id: s.id,
      name: s.name,
      category: s.categoryId,
      unit: s.unit,
      costPerUnit: s.defaultCost,
      supplier: (s.suppliers && s.suppliers[0] && s.suppliers[0].supplierName) || '',
      currentStock: s.currentStock != null ? +s.currentStock : 0,
      parLevel: s.parLevel,
      reorderLevel: s.reorderLevel,
      usageThisWeek: s.usageThisWeek != null ? +s.usageThisWeek : 0,
      theoreticalUsage: s.theoreticalUsage != null ? +s.theoreticalUsage : 0,
      updatedAt: s.updatedAt,
    }));
    return d;
  }

  function stSaveOverlay() {
    if (!stShowReal()) return;
    try {
      const doc = migrateStockDocV2({
        schemaVersion: 2,
        items: stUserItems,
        itemOv: stItemOverrides,
        delItems: [...stDeletedItems],
        sups: stUserSuppliers,
        supOv: stSupOverrides,
        delSups: [...stDeletedSups],
        cats: stUserCategories,
        categories: stUserCategories,
        catOv: stCategoryOverrides,
        delCats: [...stDeletedCategories],
        stockOv: stStockOverrides,
      });
      localStorage.setItem(stOverlayKey(), JSON.stringify(doc));
    } catch (_) { /* quota plein → on ne casse pas la saisie en cours */ }
    try { window.dispatchEvent(new CustomEvent('kiwi-stock-changed', { detail: { venue: stOverlayScope() } })); } catch (_) {}
    const c = stCloud();
    if (c) c.push();
  }

  /* ── LA COPIE SERVEUR DU STOCK ────────────────────────────────────────────
   * La surcouche ci-dessus a sauvé la saisie d'un rechargement, pas d'un
   * changement d'appareil : elle était rangée sous `kiwi:stockOverlay:<venueId>`
   * — un identifiant que venues.js tire de l'horloge, donc propre à CE
   * navigateur. Le gérant saisissait ses articles et ses fournisseurs sur le
   * portable de l'arrière-boutique, ouvrait Kiwi sur la tablette du comptoir, et
   * retrouvait l'inventaire de départ.
   *
   * `read` relit le localStorage plutôt que les variables vivantes : la page
   * peut n'avoir jamais été ouverte pour ce magasin, auquel cas les
   * variables sont vides alors que le disque, lui, est plein. Proposer ce vide
   * comme état courant ferait adopter la copie serveur PAR-DESSUS une saisie
   * locale bien réelle. */
  let stDoc = null;
  let stDocBound = false;

  function stOverlayRaw() {
    try {
      const raw = localStorage.getItem(stOverlayKey());
      const s = JSON.parse(raw || 'null');
      if (s && typeof s === 'object') {
        const hadV2 = (s.schemaVersion || 1) >= 2 && Array.isArray(s.subcategories);
        const migrated = migrateStockDocV2(s);
        if (!hadV2 && stShowReal()) {
          try { localStorage.setItem(stOverlayKey(), JSON.stringify(migrated)); } catch (_) {}
        }
        return migrated;
      }
    } catch (_) {}
    return { schemaVersion: 2, items: [], subcategories: [], sups: [], cats: [], categories: [], itemOv: {}, supOv: {}, catOv: {}, stockOv: {}, delItems: [], delSups: [], delCats: [] };
  }

  /* Union par identifiant (le défaut de cloud-doc.js) — SAUF les suppressions.
   * `delItems`/`delSups` sont des listes d'identifiants NUS, et la fusion par
   * défaut, faute d'identité à comparer, garde simplement la nôtre : l'article
   * supprimé sur la tablette réapparaissait donc au premier envoi du portable,
   * en boucle. Deux suppressions s'additionnent, elles ne s'arbitrent pas. */
  function stMergeOverlay(mine, theirs) {
    mine = migrateStockDocV2(mine);
    theirs = migrateStockDocV2(theirs);
    const M = window.KiwiCloudDoc && window.KiwiCloudDoc.mergeDefault;
    if (!M || !theirs) return mine;
    const out = M(mine, theirs);
    out.schemaVersion = 2;
    ['delItems', 'delSups', 'delCats'].forEach((k) => {
      const a = Array.isArray(mine && mine[k]) ? mine[k] : [];
      const b = Array.isArray(theirs && theirs[k]) ? theirs[k] : [];
      out[k] = [...new Set([...a, ...b])];
    });
    /* The caisse edits user-created items through itemOv so it never needs a
       second catalog. Resolve the rare same-item, two-device edit by its row
       timestamp instead of whichever browser happened to pull last. */
    ['itemOv', 'supOv', 'catOv'].forEach((k) => {
      out[k] = { ...((theirs && theirs[k]) || {}) };
      Object.entries((mine && mine[k]) || {}).forEach(([id, row]) => {
        const other = out[k][id];
        if (!other || (+row?.updatedAt || 0) >= (+other?.updatedAt || 0)) out[k][id] = row;
      });
    });
    // Merge subcategories by id and updatedAt
    const subMap = new Map();
    (Array.isArray(theirs && theirs.subcategories) ? theirs.subcategories : []).forEach(s => {
      if (s && s.id) subMap.set(String(s.id), s);
    });
    (Array.isArray(mine && mine.subcategories) ? mine.subcategories : []).forEach(s => {
      if (!s || !s.id) return;
      const other = subMap.get(String(s.id));
      if (!other || (+s.updatedAt || 0) >= (+other.updatedAt || 0)) subMap.set(String(s.id), s);
    });
    out.subcategories = Array.from(subMap.values());
    /* Même règle qu'à la migration : on PART de l'article existant, jamais de
       la sous-catégorie seule — elle n'a jamais porté lastDelivery, status, sku,
       notes… Ce merge tourne à CHAQUE synchronisation cloud ; reconstruire depuis
       la sous-catégorie défaisait le correctif de la migration au premier pull. */
    const prevItems = new Map();
    [theirs, mine].forEach((side) => {
      (Array.isArray(side && side.items) ? side.items : []).forEach((it) => {
        if (it && it.id != null) prevItems.set(String(it.id), Object.assign({}, prevItems.get(String(it.id)) || {}, it));
      });
    });
    out.items = out.subcategories.map(s => {
      const ov = (out.itemOv && out.itemOv[s.id]) || {};
      return Object.assign({}, prevItems.get(String(s.id)) || {}, {
        id: s.id,
        name: ov.name != null ? String(ov.name) : s.name,
        category: ov.category != null ? String(ov.category) : (ov.cat != null ? String(ov.cat) : s.categoryId),
        unit: ov.unit != null ? String(ov.unit) : s.unit,
        costPerUnit: ov.costPerUnit != null ? +ov.costPerUnit : (ov.cost != null ? +ov.cost : s.defaultCost),
        supplier: ov.supplier != null ? String(ov.supplier) : ((s.suppliers && s.suppliers[0] && s.suppliers[0].supplierName) || ''),
        currentStock: s.currentStock != null ? +s.currentStock : 0,
        parLevel: ov.parLevel != null ? +ov.parLevel : (ov.par != null ? +ov.par : s.parLevel),
        reorderLevel: ov.reorderLevel != null ? +ov.reorderLevel : (ov.reorder != null ? +ov.reorder : s.reorderLevel),
        usageThisWeek: s.usageThisWeek != null ? +s.usageThisWeek : 0,
        theoreticalUsage: s.theoreticalUsage != null ? +s.theoreticalUsage : 0,
        updatedAt: Math.max(+s.updatedAt || 0, +ov.updatedAt || 0),
      });
    });
    return out;
  }

  function stCloud() {
    if (stDoc || !window.KiwiCloudDoc) return stDoc;
    stDoc = window.KiwiCloudDoc.attach({
      feature: 'stock',
      slug: () => window.KiwiCloudDoc.slugFor(currentVenueId()),
      read: stOverlayRaw,
      write: (d) => {
        try { localStorage.setItem(stOverlayKey(), JSON.stringify(d)); } catch (_) {}
        // Forcer la relecture : les variables vivantes portent encore l'ancienne
        // surcouche, et c'est elles que dessine render().
        stOverlayLoadedFor = null;
        try { stEnsureOverlay(); } catch (_) {}
        if (stPageActive) { try { render(); } catch (_) {} }
        try { window.dispatchEvent(new CustomEvent('kiwi-stock-changed', { detail: { venue: stOverlayScope() } })); } catch (_) {}
      },
      merge: stMergeOverlay,
      /* Un commerçant qui n'a rien saisi porte quand même les huit champs
       * vides : sans ce test, ouvrir la page suffisait à créer une ligne. */
      isEmpty: (d) => !d || !(
        (d.items && d.items.length) || (d.subcategories && d.subcategories.length)
        || (d.sups && d.sups.length) || (d.cats && d.cats.length)
        || (d.itemOv && Object.keys(d.itemOv).length) || (d.supOv && Object.keys(d.supOv).length)
        || (d.catOv && Object.keys(d.catOv).length)
        || (d.stockOv && Object.keys(d.stockOv).length)
        || (d.delItems && d.delItems.length) || (d.delSups && d.delSups.length) || (d.delCats && d.delCats.length)
      ),
    });
    return stDoc;
  }

  /* Recharge la surcouche du commerce courant. Les Set/objet sont `const` :
     on les vide et les re-remplit sur place plutôt que de les réaffecter. */
  function stEnsureOverlay() {
    const venue = stOverlayScope();
    if (stOverlayLoadedFor === venue) return;
    stOverlayLoadedFor = venue;
    stUserItems = []; stUserSuppliers = []; stUserCategories = [];
    stDeletedItems.clear(); stDeletedSups.clear();
    stDeletedCategories.clear();
    Object.keys(stItemOverrides).forEach((k) => delete stItemOverrides[k]);
    Object.keys(stSupOverrides).forEach((k) => delete stSupOverrides[k]);
    Object.keys(stCategoryOverrides).forEach((k) => delete stCategoryOverrides[k]);
    Object.keys(stStockOverrides).forEach((k) => delete stStockOverrides[k]);
    if (!stShowReal()) return;                       // la démo repart de zéro, comme avant
    let s = null;
    try { s = JSON.parse(localStorage.getItem(stOverlayKey()) || 'null'); } catch (_) { return; }
    if (!s || typeof s !== 'object') return;
    s = migrateStockDocV2(s);
    if (Array.isArray(s.items)) stUserItems = s.items.map(normalizeStockItem);
    if (Array.isArray(s.sups)) stUserSuppliers = s.sups;
    if (Array.isArray(s.cats)) stUserCategories = s.cats;
    (s.delItems || []).forEach((id) => stDeletedItems.add(id));
    (s.delSups || []).forEach((id) => stDeletedSups.add(id));
    (s.delCats || []).forEach((id) => stDeletedCategories.add(id));
    Object.assign(stItemOverrides, s.itemOv || {});
    Object.keys(stItemOverrides).forEach((id) => {
      if (stItemOverrides[id]?.unit) stItemOverrides[id].unit = stockUnit(stItemOverrides[id].unit);
    });
    Object.assign(stSupOverrides, s.supOv || {});
    Object.assign(stCategoryOverrides, s.catOv || {});
    Object.assign(stStockOverrides, s.stockOv || {});
  }

  /* Premier contact avec ce magasin dans cette page : on récupère d'abord ce
   * qu'un ANCIEN identifiant de venue aurait laissé orphelin sur ce navigateur,
   * puis on lit la copie serveur. Appelé depuis showPage() — le stock n'a aucun
   * consommateur en arrière-plan, contrairement à l'équipe dont les codes
   * alimentent la caisse, donc il n'y a rien à hydrater tant que personne ne
   * regarde. */
  function stCloudBind() {
    if (!window.KiwiCloudDoc || !stShowReal()) return;
    const vid = currentVenueId();
    const slug = window.KiwiCloudDoc.slugFor(vid);
    if (!slug) return;                                  // démo / pas un vrai magasin
    let migratedLocal = false;
    /* Operator view used `scoped:<slug>` before both surfaces standardized on
       the canonical slug. Adopt that exact legacy key once; cloud-doc's generic
       carryForward cannot infer a slug from the `scoped:` composite. */
    try {
      const currentKey = stOverlayKey();
      const scopedKey = 'kiwi:stockOverlay:scoped:' + slug;
      if (!localStorage.getItem(currentKey) && localStorage.getItem(scopedKey)) {
        localStorage.setItem(currentKey, localStorage.getItem(scopedKey));
        migratedLocal = true;
      }
    } catch (_) {}
    const carried = window.KiwiCloudDoc.carryForward('stockOverlay', stOverlayScope(), slug, (raw) => {
      try {
        const d = JSON.parse(raw || 'null');
        return !!(d && ((d.items && d.items.length) || (d.sups && d.sups.length)));
      } catch (_) { return false; }
    }, 'kiwi:stockOverlay:');
    if (carried || migratedLocal) {
      stOverlayLoadedFor = null;
      stEnsureOverlay();
      if (stPageActive) render();
    }
    const c = stCloud();
    if (!c) return;
    if (!stDocBound) {
      stDocBound = true;
      c.bind();
    } else {
      /* Re-opening the stock page is an explicit refresh boundary: fetch
       * caisse movements/catalog edits even when this SPA never went hidden. */
      c.pull(false);
    }
    try { window.KiwiInventory?.sync?.(); } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Lucide icons inline
   * ═══════════════════════════════════════════════════════════════════════ */
  const IC = {
    layoutDashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    package: '<path d="M16.5 9.4L7.5 4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>',
    truck: '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 4v4h-7"/><circle cx="5.5" cy="19" r="2.5"/><circle cx="18.5" cy="19" r="2.5"/>',
    clipboardList: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    sparkles: '<path d="M12 3l1.9 4.7L18 9.5l-4.1 1.8L12 16l-1.9-4.7L6 9.5l4.1-1.8L12 3z"/><path d="M18 14l1 2.5L21 18l-2.5 1L18 21l-1-2.5L15 18l2.5-1z"/>',
    wallet: '<path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-1"/><path d="M21 12h-5a2 2 0 100 4h5"/>',
    alertTriangle: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    alertCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    receipt: '<path d="M4 2v20l3-3 3 3 3-3 3 3 3-3 3 3V2l-3 3-3-3-3 3-3-3-3 3-3-3z"/><path d="M8 9h8M8 13h6"/>',
    trendingUp: '<path d="M22 7l-8 8-4-4-8 8"/><path d="M16 7h6v6"/>',
    trendingDown: '<path d="M22 17l-8-8-4 4-8-8"/><path d="M16 17h6v-6"/>',
    minus: '<path d="M5 12h14"/>',
    swap: '<path d="M7 7h11l-3-3M18 7l-3 3M17 17H6l3 3M6 17l3-3"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    moreH: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    phone: '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>',
    messageCircle: '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
    zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    camera: '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    star: '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7l3-7z"/>',
    download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  };
  const STOCK_MATERIAL_ICONS = {
    layoutDashboard: 'layout-dashboard', package: 'package', truck: 'truck',
    clipboardList: 'clipboard-list', sparkles: 'sparkles', wallet: 'wallet',
    alertTriangle: 'alert-triangle', alertCircle: 'alert-circle', receipt: 'receipt',
    trendingUp: 'trending-up', trendingDown: 'trending-down', minus: 'minus',
    swap: 'arrow-left-right', eye: 'eye', plus: 'plus', edit: 'pencil',
    moreH: 'more-horizontal', phone: 'phone', messageCircle: 'message-circle',
    search: 'search', x: 'x', checkCircle: 'check-circle-2', zap: 'zap',
    camera: 'camera', calendar: 'calendar', star: 'star',
    download: 'arrow-down-to-line', upload: 'arrow-up-from-line', info: 'info'
  };
  const svg = (k, sz = 14) => `<i data-lucide="${STOCK_MATERIAL_ICONS[k] || 'help'}" style="width:${sz}px;height:${sz}px" aria-hidden="true"></i>`;

  /* ═══════════════════════════════════════════════════════════════════════
   * Formatting helpers
   * ═══════════════════════════════════════════════════════════════════════ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const localeFor = () => (lang() === 'en' ? 'en-US' : 'fr-FR');
  const fmtNum = (n, dec = 0) => {
    if (n == null || isNaN(n)) return '0';
    return window.KiwiNumber?.number(n, dec) || new Intl.NumberFormat(localeFor(), { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
  };
  /* Dirhams entiers sans décimales, centimes conservés à toute échelle. */
  const fmtMad = (n) => {
    const v = Math.round((+n || 0) * 100) / 100;
    return `${fmtNum(v, Number.isInteger(v) ? 0 : 2)} MAD`;
  };
  const fmtUnit = (q, u) => {
    const v = Math.round((+q || 0) * 1000) / 1000;
    const dec = (String(v).split('.')[1] || '').length;
    return `${fmtNum(v, dec)} ${u}`;
  };
  const unitApi = () => window.KiwiRestaurantUnits;
  const stockUnit = (value) => unitApi()?.normalize?.(value) || 'unité';
  const normalizeStockItem = (item) => ({ ...(item || {}), unit: stockUnit(item?.unit) });
  const stockUnitOptions = (value) => {
    const selected = stockUnit(value);
    return (unitApi()?.list?.() || []).map((unit) => `<option value="${esc(unit.id)}"${unit.id === selected ? ' selected' : ''}>${esc(unit.label)}</option>`).join('');
  };
  const fmtPct = (n, dec = 1) => `${n > 0 ? '+' : ''}${fmtNum(n, dec)} %`;
  const fmtDateShort = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const monthsFr = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    const monthsEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthsAr = ['يناير','فبراير','مارس','أبريل','ماي','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نونبر','دجنبر'];
    const months = lang() === 'en' ? monthsEn : lang() === 'ar' ? monthsAr : monthsFr;
    return `${d.getDate()} ${months[d.getMonth()]}`;
  };
  const catLabel = (c) => {
    const built = t(`cat.${c}`);
    if (built && built !== `cat.${c}`) return built;
    try {
      if (isRetailStock() && window.KiwiBoutiqueCatalog) {
        const retail = window.KiwiBoutiqueCatalog.listCategories().find((x) => String(x.id) === String(c));
        if (retail) return retail.name || c;
      }
    } catch (_) {}
    const usr = stUserCategories.find(x => x.id === c);
    return usr ? usr.label : c;
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Data access
   * ═══════════════════════════════════════════════════════════════════════ */
  function isFusion() {
    return (window.KiwiVenue?.isFusion?.() === true) || !!document.body?.classList?.contains('fusion-mode');
  }
  function currentVenueId() {
    return window.KiwiVenue?.getVenue?.() || 'cafeAtlas';
  }
  function isRetailStock() {
    let type = '';
    try { type = String(window.KiwiConfig?.type || window.KiwiVenue?.getVenueType?.() || '').toLowerCase(); } catch (_) {}
    return ['boutique', 'maison', 'epicerie', 'pharmacie', 'librairie', 'fleuriste', 'pressing', 'autre'].includes(type);
  }
  function retailCatalog() {
    const C = window.KiwiBoutiqueCatalog;
    if (!C || !isRetailStock()) return null;
    try {
      const key = window.KiwiBoutiqueVenueKey?.() || stockBusinessSlug();
      if (key && C.currentVenue?.() !== key) C.use(key);
    } catch (_) {}
    return C;
  }
  function retailProcurementDoc() {
    try { return window.KiwiProcurement?.doc?.() || { suppliers: [], orders: [], receipts: [], returns: [], invoices: [] }; }
    catch (_) { return { suppliers: [], orders: [], receipts: [], returns: [], invoices: [] }; }
  }
  function retailSupplierSpend(supplierId) {
    const since = Date.now() - 30 * 86400000;
    return (retailProcurementDoc().receipts || []).filter((r) => r.supplierId === supplierId && (+r.receivedAt || +r.createdAt || 0) >= since)
      .reduce((sum, r) => sum + (r.lines || []).reduce((s, line) => s + (+line.qty || 0) * (+line.unitCost || 0), 0), 0);
  }
  function retailSetProductStock(productId, wanted, reason) {
    const C = retailCatalog(); if (!C) return false;
    wanted = Math.max(0, Math.round(+wanted || 0));
    let variants = C.listVariants(productId) || [];
    if (!variants.length) {
      const created = C.addVariant({ productId, colorId: 'sans-couleur', colorLabel: 'Sans couleur', colorHex: '#A0A0A0', size: 'TU', stock: wanted });
      return !!created;
    }
    let delta = wanted - variants.reduce((sum, v) => sum + (+v.stock || 0), 0);
    if (!delta) return true;
    if (delta > 0) { C.adjustStock(variants[0].id, delta, reason || 'ajust'); return true; }
    let remove = -delta;
    variants.slice().sort((a, b) => (+b.stock || 0) - (+a.stock || 0)).forEach((v) => {
      if (!remove) return;
      const qty = Math.min(remove, Math.max(0, +v.stock || 0));
      if (qty) { C.adjustStock(v.id, -qty, reason || 'ajust'); remove -= qty; }
    });
    return remove === 0;
  }
  function stockBusinessSlug() {
    try {
      const slug = window.KiwiDayReport?.storeSlug;
      if (typeof slug === 'function') return slug() || currentVenueId();
    } catch (_) {}
    return currentVenueId();
  }
  /* Operational dates belong to the merchant day, not the developer's last
   * demo snapshot. KiwiDayReport owns the cutoff/timezone rules; the local
   * calendar date is only a fail-soft fallback while that module is loading. */
  function stockBusinessDate(ts) {
    const slug = stockBusinessSlug();
    try {
      const d = window.KiwiDayReport?.businessDay;
      if (typeof d === 'function') return d(ts == null ? Date.now() : ts, slug);
    } catch (_) {}
    const now = new Date(ts == null ? Date.now() : ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  function stockBusinessDateDate(ts) {
    // Noon avoids a timezone conversion moving a YYYY-MM-DD key to its eve.
    return new Date(`${stockBusinessDate(ts)}T12:00:00`);
  }
  function stockCalendarDates(ts, count = 7) {
    const today = stockBusinessDateDate(ts);
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }
  // The "Kiwi AI" insight cards are hardcoded demo prose naming demo suppliers
  // (Coopérative Taliouine, Marché Central…) and demo dishes. For a REAL session
  // (hosted / signed-in / operator-scoped / custom venue) they must not render.
  function stShowReal() {
    try {
      if (window.KiwiEnv?.isReal?.()) return true;
      if (window.KiwiVenue?.isCustom?.(currentVenueId())) return true;
    } catch (_) {}
    return false;
  }
  function applyItemOverlay(items) {
    const filtered = items.filter(it => !stDeletedItems.has(it.id));
    return filtered.map(it => (stItemOverrides[it.id] ? { ...it, ...stItemOverrides[it.id] } : it));
  }
  function getInv() {
    const C = retailCatalog();
    if (C) {
      const suppliers = new Map((retailProcurementDoc().suppliers || []).map((s) => [String(s.id), s]));
      return (C.listProducts() || []).map((p) => ({
        id: p.id, name: p.name, category: p.categoryId || '_uncat', unit: 'pièce',
        supplier: suppliers.get(String(p.supplierId || ''))?.name || '', supplierId: p.supplierId || '',
        currentStock: C.productStock(p.id), parLevel: Math.max(0, +p.parLevel || 0),
        reorderLevel: Math.max(0, +p.reorderLevel || 0), costPerUnit: Math.max(0, +p.cost || 0),
        priceMAD: Math.max(0, +p.priceMAD || 0), usageThisWeek: 0, theoreticalUsage: 0,
        lastDelivery: null, deliveryFrequency: '·', retail: true,
      }));
    }
    const V = window.KiwiVenue;
    if (!V?.getInventory) return [...stUserItems].map(normalizeStockItem);
    let base;
    if (isFusion()) {
      if (stVenueFilter && stVenueFilter !== 'all') base = V.getInventory(stVenueFilter);
      else base = [
        ...V.getInventory('cafeAtlas'),
        ...V.getInventory('maisonMansour'),
        ...V.getInventory('spaBahia'),
      ];
    } else {
      base = V.getInventory(currentVenueId());
    }
    return [...applyItemOverlay(base), ...applyItemOverlay(stUserItems)].map(normalizeStockItem);
  }
  function getSup() {
    if (isRetailStock() && window.KiwiProcurement?.doc) {
      return (retailProcurementDoc().suppliers || []).filter((s) => s && s.active !== false).map((s) => ({
        id: s.id, name: s.name || 'Fournisseur', location: s.address || '', category: s.categories || '',
        contact: s.phone || '', deliverySchedule: (+s.leadDays || 0) ? `${+s.leadDays} j` : '·',
        paymentTerms: s.paymentTerms || '·', rating: null, monthlySpend: retailSupplierSpend(s.id),
        priceChangeLast30d: 0, retail: true,
      }));
    }
    const base = window.KiwiVenue?.getSuppliers?.() || [];
    const filtered = base
      .filter(s => !stDeletedSups.has(s.id))
      .map(s => (stSupOverrides[s.id] ? { ...s, ...stSupOverrides[s.id] } : s));
    return [...filtered, ...stUserSuppliers.filter(s => !stDeletedSups.has(s.id))];
  }
  function allCategories() {
    const C = retailCatalog();
    if (C) return (C.listCategories() || []).map((c) => ({ id: c.id, label: c.name || 'Catégorie' }));
    // Built-in slugs (mirror cat pill row + select options) + user-added.
    const builtin = [
      { id: 'viandes',      label: t('catViandes') },
      { id: 'poissons',     label: t('catPoissons') },
      { id: 'legumes',      label: t('catLegumes') },
      { id: 'epicerie',     label: t('catEpicerie') },
      { id: 'epices',       label: t('catEpices') },
      { id: 'laitiers',     label: t('catLaitiers') },
      { id: 'boissons',     label: t('catBoissons') },
      { id: 'consommables', label: t('catConsommables') },
    ];
    return [...builtin, ...stUserCategories]
      .filter(c => !stDeletedCategories.has(c.id))
      .map(c => stCategoryOverrides[c.id] ? { ...c, ...stCategoryOverrides[c.id] } : c);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Computed metrics
   * ═══════════════════════════════════════════════════════════════════════ */
  function stockLocationId() {
    try { return window.KiwiInventory?.locationId?.() || 'principal'; }
    catch (_) { return 'principal'; }
  }
  function stockUnitId() {
    try { return window.KiwiInventory?.unitId?.() || ''; }
    catch (_) { return ''; }
  }
  function ledgerOpeningFor(...args) { return stockState.ledgerOpeningFor.apply(this, args); }
  const currentStockFor = (it) => ledgerOpeningFor(it);
  /* Read-only projection for the morning briefing. "Tracked" means both an
   * explicit positive reorder threshold and durable ledger history; an absent
   * snapshot is never interpreted as zero stock. */
  function briefingStockItems() {
    return getInv().map((it) => {
      const threshold = Number(it && it.reorderLevel);
      let history = [], balance = null;
      try {
        if (window.KiwiInventory?.history && window.KiwiInventory?.balance) {
          const locationId = stockLocationId();
          history = window.KiwiInventory.history(it.id, { locationId }) || [];
          if (history.length) balance = window.KiwiInventory.balance(it.id, { locationId });
        }
      } catch (_) { history = []; balance = null; }
      return {
        id: String(it.id || ''), name: String(it.name || ''), unit: String(it.unit || ''),
        balance: Number.isFinite(+balance) ? +balance : null,
        threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null,
        par: Number.isFinite(+it.parLevel) && +it.parLevel > 0 ? +it.parLevel : null,
        supplier: String(it.supplier || ''), tracked: history.length > 0 && Number.isFinite(threshold) && threshold > 0
      };
    });
  }
  window.KiwiStockBriefing = { items: briefingStockItems };

  function moveStock(...args) { return stockState.moveStock.apply(this, args); }

  function moveRetailStock(...args) { return stockState.moveRetailStock.apply(this, args); }

  function countStock(...args) { return stockState.countStock.apply(this, args); }
  /* A real restaurant's recipe is the source of theoretical ingredient usage.
   * Demo venues keep their historic fixture values; real venues never inherit
   * those figures and only receive a number once sales + recipes exist. */
  let stTheoUsageBusy = false;
  const theoreticalUsageFor = (it) => {
    /* The recipe engine reads this same inventory back to resolve units and
     * costs. Without this guard the two call each other until the tab dies. */
    if (stTheoUsageBusy) return Number(it.theoreticalUsage) || 0;
    try {
      stTheoUsageBusy = true;
      const measured = window.KiwiRestaurantRecipes?.theoreticalUsage?.(it.id, currentVenueId(), 7);
      if (stShowReal()) return Number(measured) || 0;
      if (Number(measured) > 0) return Number(measured);
    } catch (_) {} finally { stTheoUsageBusy = false; }
    return Number(it.theoreticalUsage) || 0;
  };
  function stockConfiguredSupplierName(...args) { return stockParts.alerts.stockConfiguredSupplierName.apply(this, args); }
  function stockSupplierEvidence(...args) { return stockParts.alerts.stockSupplierEvidence.apply(this, args); }
  function stockAlertState(...args) { return stockParts.alerts.stockAlertState.apply(this, args); }
  const statusOf = (it) => stockAlertState(it, currentStockFor(it)).status;
  window.KiwiStockOperatingDay = {
    businessDate: stockBusinessDate,
    businessSlug: stockBusinessSlug,
    calendarDates: (ts, count) => stockCalendarDates(ts, count),
    alertState: stockAlertState,
    catalogue: () => { stEnsureOverlay(); return getInv(); },
    suppliers: () => getSup(),
    categories: () => allCategories(),
    overviewAlerts: (items) => overviewAlertRows(items),
    lastDelivery: actualLastDelivery,
  };
  const variance = (it) => {
    const theoretical = theoreticalUsageFor(it);
    return theoretical > 0 ? ((it.usageThisWeek - theoretical) / theoretical) * 100 : 0;
  };
  const daysOfStock = (it) => {
    const rate = it.usageThisWeek / 7;
    return rate > 0 ? Math.max(0, Math.round(currentStockFor(it) / rate)) : null;
  };
  function actualLastDelivery(it) {
    if (!stShowReal()) return it.lastDelivery || null;
    try {
      const rows = itemHistory(it).filter((r) =>
        (+r.qty || 0) > 0 && ['receipt', 'transfer-in'].includes(String(r.reason || ''))
      );
      if (!rows.length) return null;
      const latest = rows.reduce((a, b) => (+a.occurredTs || 0) >= (+b.occurredTs || 0) ? a : b);
      return latest.occurredTs ? stockBusinessDate(latest.occurredTs) : null;
    } catch (_) { return null; }
  }
  const totalValue = (items) => items.reduce((s, it) => s + (currentStockFor(it) * it.costPerUnit), 0);
  const foodCostMonth = (items) => items.reduce((s, it) => s + (theoreticalUsageFor(it) * it.costPerUnit * 4.33), 0);
  /* Le dénominateur du ratio « coût matière / chiffre d'affaires ».
   *
   * Ces montants sont ceux des trois établissements de démonstration. Le repli
   * `|| 825000` les servait aussi à un VRAI commerçant : son coût matière, bien
   * réel, était alors divisé par le chiffre d'affaires du Café Atlas. Le ratio
   * qui en sortait n'était ni le sien ni celui de personne, et il portait une
   * pastille verte ou orange qui invitait à agir dessus.
   *
   * Chez un vrai commerçant on lit donc ses ventes des 30 derniers jours, et
   * si on ne les a pas — première semaine, navigateur neuf qui n'a pas fini de
   * rapatrier le flux — on rend null : la ligne du ratio disparaît au lieu de
   * s'inventer un dénominateur. */
  function weeklyRevenue() {
    try {
      const to = Date.now();
      const t = window.KiwiSales && window.KiwiSales.totals
        && window.KiwiSales.totals(currentVenueId(), to - 7 * 864e5, to);
      const rev = t && +t.revenue;
      return rev > 0 ? rev : null;
    } catch (_) { return null; }
  }
  const VENUE_REVENUE = { cafeAtlas: 825000, maisonMansour: 358000, spaBahia: 269000, fusion: 1452000 };
  function monthlyRevenue() {
    if (stShowReal()) {
      try {
        const to = Date.now();
        const t = window.KiwiSales && window.KiwiSales.totals
          && window.KiwiSales.totals(currentVenueId(), to - 30 * 864e5, to);
        const rev = t && +t.revenue;
        return rev > 0 ? rev : null;
      } catch (_) { return null; }
    }
    if (isFusion()) {
      if (stVenueFilter && stVenueFilter !== 'all') return VENUE_REVENUE[stVenueFilter] || 825000;
      return VENUE_REVENUE.fusion;
    }
    return VENUE_REVENUE[currentVenueId()] || null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Page show/hide — mirrors Équipe/Menu pattern
   * ═══════════════════════════════════════════════════════════════════════ */
  function showPage() {
    stPageActive = true;
    // Exactly one page shell at a time — see Kiwi.pageShell.
    if (window.Kiwi && Kiwi.pageShell) Kiwi.pageShell('stock');
    else document.body.classList.add('page-stock');
    // « Accueil / Stock » in the screen's language, repainted on a switch.
    window.Kiwi?.breadcrumb?.(() => t('breadcrumb'));
    /* Pin sidebar selector on Stock via Kiwi.setActivePage — drawers/modals
     * opened from here close back into this highlight, not Accueil. */
    window.Kiwi?.setActivePage?.('stock');
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    document.querySelector('.sidebar nav a[data-nav="stock"]')?.classList.add('active');
    window.scrollTo({ top: 0 });
    render();
    // La copie serveur arrive après coup et repeint par elle-même : on n'attend
    // jamais le réseau pour afficher ce que ce navigateur sait déjà.
    try { stCloudBind(); } catch (_) {}
    // Subscribe to demo clock for live food-cost tick (subtle)
    if (!stDemoClockUnsub && window.KiwiDemoClock?.subscribe) {
      stDemoClockUnsub = window.KiwiDemoClock.subscribe(() => tickFoodCost());
    }
  }
  function showDashboard() {
    if (!document.body.classList.contains('page-stock')) return;
    stPageActive = false;
    document.body.classList.remove('page-stock');
    window.Kiwi?.breadcrumb?.();
    if (stDemoClockUnsub) { try { stDemoClockUnsub(); } catch (_) {} stDemoClockUnsub = null; }
    window.Kiwi?.setActivePage?.('accueil');
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Render dispatcher
   * ═══════════════════════════════════════════════════════════════════════ */
  function render() {
    const root = document.querySelector('[data-stock-root]');
    if (!root) return;
    stEnsureOverlay();      // le stock saisi par le commerçant, relu avant d'afficher
    root.removeAttribute('hidden');
    const html = `
      ${renderHeader()}
      ${isFusion() ? renderVenueFilter() : ''}
      ${renderTabs()}
      <div class="st-tab-body">${renderTabBody()}</div>
    `;
    if(window.KiwiCatalogUI){if(!window.KiwiCatalogUI.replace(root,html))return;}else root.innerHTML=html;
    enhanceAfterRender();
  }

  function enhanceAfterRender() {
    // Animate progress bars + stock bars from 0 to target on initial paint
    requestAnimationFrame(() => {
      document.querySelectorAll('[data-stock-bar]').forEach(el => {
        const pct = +el.dataset.stockBar || 0;
        el.style.width = `${Math.min(100, pct)}%`;
      });
    });
    // Wire up search input
    const sorter=document.querySelector('[data-stock-mobile-sort]');
    if(sorter)sorter.onchange=()=>{stSortBy=sorter.value;rerenderTabBody();};
    const sb = document.querySelector('[data-stock-search-input]');
    if (sb) sb.addEventListener('input', (e) => { stSearch = e.target.value.toLowerCase(); rerenderTabBody(); });
    const wsb = document.querySelector('[data-stock-waste-search]');
    if (wsb) wsb.addEventListener('input', (e) => { stWasteSearch = e.target.value; rerenderTabBody(); });
    const csb = document.querySelector('[data-stock-count-search]');
    if (csb) csb.addEventListener('input', (e) => { stCountSearch = e.target.value; rerenderTabBody(); });
  }

  function rerenderTabBody() {
    const body = document.querySelector('.st-tab-body');
    if(body){const html=renderTabBody();if(window.KiwiCatalogUI){if(!window.KiwiCatalogUI.replace(body,html))return;}else body.innerHTML=html;}
    enhanceAfterRender();
  }

  function renderTabBody() {
    switch (stCurrentTab) {
      case 'overview':  return renderOverview();
      case 'items':     return renderItems();
      case 'suppliers': return renderSuppliers();
      case 'orders':    return renderOrders();
      case 'forecast':  return renderForecast();
      default:          return renderOverview();
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Header
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderHeader() {
    const items = getInv();
    const supCount = getSup().length;
    const val = fmtMad(totalValue(items));
    const subText = t('sub', items.length, supCount, val);
    return `
      <div class="st-head">
        <div>
          <div class="st-title">${esc(t('title'))}</div>
          <div class="st-sub">${esc(subText)}</div>
        </div>
        <div class="st-head-acts">
          <button data-activation=write class="st-btn primary" type="button" data-action="stock-add-item">${svg('plus',13)}<span>${esc(t('btnAdd'))}</span></button>
          <button class="catalog-more" type="button" data-action="stock-workspace-actions" aria-label="${esc(catalogText('stockActions','Outils du stock'))}">${catalogIcon('tune')}</button>
        </div>
      </div>
    `;
  }

  function renderVenueFilter() {
    const pick = (id, label) => {
      const on = stVenueFilter === id;
      return `<button class="st-venue-pill${on ? ' on' : ''}" type="button" data-action="stock-venue-filter" data-venue="${id}">${esc(label)}</button>`;
    };
    return `
      <div class="st-venue-row">
        ${pick('all', t('venueAll'))}
        ${pick('cafeAtlas', t('venueAtlas'))}
        ${pick('maisonMansour', t('venueMaison'))}
        ${pick('spaBahia', t('venueSpa'))}
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Tabs
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderTabs() {
    const tab = (id, ico, label, extra = '') => {
      const on = stCurrentTab === id;
      return `<button class="st-tab${on ? ' on' : ''}" type="button" role="tab" aria-selected="${on}" data-action="stock-tab" data-tab="${id}">${svg(ico, 14)}<span>${esc(label)}</span>${extra}</button>`;
    };
    const ultraPill = `<span class="st-ultra-pill">${esc(t('ultra'))}</span>`;
    return `
      <div class="st-tabs" role="tablist">
        ${tab('overview',  'layoutDashboard', t('tabOverview'))}
        ${tab('items',     'package',          t('tabItems'))}
        ${tab('suppliers', 'truck',            t('tabSuppliers'))}
        ${tab('orders',    'clipboardList',    t('tabOrders'))}
        ${isRetailStock() ? '' : tab('forecast',  'sparkles',         t('tabForecast'), ultraPill)}
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 1 · Vue d'ensemble
   * ═══════════════════════════════════════════════════════════════════════ */
  function computeTier1LowAlerts(...args) { return stockParts.alerts.computeTier1LowAlerts.apply(this, args); }

  function overviewAlertRows(...args) { return stockParts.alerts.overviewAlertRows.apply(this, args); }

  function renderOverview(...args) { return stockParts.overview.renderOverview.apply(this, args); }

  function renderKpiCards(...args) { return stockParts.overview.renderKpiCards.apply(this, args); }

  const TIER_LOW = {
    fr: { status: (q) => `Fournisseur principal bas · ${q} restant`, main: 'Lot principal', next: 'Lot suivant', buffer: 'Seuil tampon', basis: 'calculé sur 3j d\'usage', trans: 'Transition prochaine vers tarif secondaire.', order: 'Commander chez principal' },
    en: { status: (q) => `Main supplier running low · ${q} left`, main: 'Main lot', next: 'Next lot', buffer: 'Buffer threshold', basis: 'based on 3 days of use', trans: 'Switching to the secondary price soon.', order: 'Order from main supplier' },
    ar: { status: (q) => `المورّد الرئيسي منخفض · ${q} متبقٍ`, main: 'الدفعة الرئيسية', next: 'الدفعة التالية', buffer: 'حد الأمان', basis: 'محسوب على 3 أيام استهلاك', trans: 'الانتقال قريبًا إلى السعر الثانوي.', order: 'اطلب من المورّد الرئيسي' }
  };
  /* « Ignorer 24h » answered « Alerte ignorée pour 24h » and the alert was
   * back on the next render. Snoozes are now kept per store for 24 hours, on
   * this device: a low-stock warning is a reminder, not shared data. An item
   * that is OUT is never silenced. */
  const IGNORE_KEY = () => `kiwiStockIgnore:${currentVenueId()}`;
  function ignoredAlerts(...args) { return stockParts.alerts.ignoredAlerts.apply(this, args); }
  function isAlertIgnored(name) { return !!ignoredAlerts()[String(name || '')]; }
  function ignoreAlert(...args) { return stockParts.alerts.ignoreAlert.apply(this, args); }

  /* « Marquer 86 » said « marqué 86 sur 6 terminaux » (six, always) and put the
   * name in a Set nothing read. A stock item is an ingredient; what the till
   * hides is a dish. So the merchant picks the dishes (those whose recipe uses
   * the ingredient are pre-ticked) and each one is hidden through the same
   * server route the till's own Menu switch uses: /api/menu/availability. */
  const M86_COPY = {
    fr: {
      title: (n) => `Plus de ${n} : masquer des plats`, intro: 'Les plats cochés disparaissent de la caisse, d’OrderPro et de l’app équipe jusqu’à ce que vous les remettiez.',
      fromRecipe: 'utilise cet ingrédient', none: 'Aucun plat publié sur votre carte.', noneDesc: 'Publiez votre carte dans Menu & modificateurs pour pouvoir masquer un plat.',
      cancel: 'Annuler', apply: 'Masquer les plats cochés', pick: 'Cochez au moins un plat.',
      done: (n) => `${n} plat${n > 1 ? 's' : ''} masqué${n > 1 ? 's' : ''} en caisse`, doneDesc: 'Remettez-les depuis Menu & modificateurs ou le bouton Menu de la caisse.',
      partial: (ok, ko) => `${ok} masqué${ok > 1 ? 's' : ''}, ${ko} non enregistré${ko > 1 ? 's' : ''}`, fail: 'Rien n’a été masqué', failDesc: 'Le serveur n’a pas répondu. Vérifiez la connexion et réessayez.',
      demo: 'Démo : rien n’est envoyé à une caisse.',
    },
    en: {
      title: (n) => `Out of ${n}: hide dishes`, intro: 'Ticked dishes disappear from the till, OrderPro and the team app until you bring them back.',
      fromRecipe: 'uses this ingredient', none: 'No dish published on your menu.', noneDesc: 'Publish your menu in Menu & modifiers to be able to hide a dish.',
      cancel: 'Cancel', apply: 'Hide ticked dishes', pick: 'Tick at least one dish.',
      done: (n) => `${n} dish${n > 1 ? 'es' : ''} hidden at the till`, doneDesc: 'Bring them back from Menu & modifiers or the till’s Menu button.',
      partial: (ok, ko) => `${ok} hidden, ${ko} not saved`, fail: 'Nothing was hidden', failDesc: 'The server did not answer. Check the connection and try again.',
      demo: 'Demo: nothing is sent to a till.',
    },
    ar: {
      title: (n) => `نفد ${n}: إخفاء أطباق`, intro: 'تختفي الأطباق المحددة من الصندوق وOrderPro وتطبيق الفريق حتى تعيدها.',
      fromRecipe: 'يستعمل هذا المكوّن', none: 'لا توجد أطباق منشورة في قائمتك.', noneDesc: 'انشر قائمتك في القائمة والإضافات لتتمكن من إخفاء طبق.',
      cancel: 'إلغاء', apply: 'إخفاء الأطباق المحددة', pick: 'حدد طبقًا واحدًا على الأقل.',
      done: (n) => `تم إخفاء ${n} طبق في الصندوق`, doneDesc: 'أعدها من القائمة والإضافات أو من زر القائمة في الصندوق.',
      partial: (ok, ko) => `تم إخفاء ${ok}، ولم يُحفظ ${ko}`, fail: 'لم يُخفَ أي شيء', failDesc: 'لم يرد الخادم. تحقق من الاتصال وأعد المحاولة.',
      demo: 'عرض تجريبي: لا يُرسل أي شيء إلى صندوق.',
    },
  };
  const IGNORE_TOAST = {
    fr: (n) => `Alerte ${n} masquée 24 h sur cet appareil`,
    en: (n) => `${n} alert hidden for 24 h on this device`,
    ar: (n) => `تم إخفاء تنبيه ${n} لمدة 24 ساعة على هذا الجهاز`,
  };
  function openMark86(...args) { return stockParts.alerts.openMark86.apply(this, args); }

  function renderAlertCard(...args) { return stockParts.alerts.renderAlertCard.apply(this, args); }

  // Les plats dont une fiche technique utilise cet article (restaurant seulement ; ailleurs, rien).
  function dishesUsing(...args) { return stockParts.alerts.dishesUsing.apply(this, args); }

  function renderAiCard(...args) { return stockParts.overview.renderAiCard.apply(this, args); }

  /* 7-day delivery strip — the weekday supplier pattern is demo data, but the
   * displayed dates follow the merchant's current operating day. */
  function renderDeliveryStrip(...args) { return stockParts.overview.renderDeliveryStrip.apply(this, args); }

  /* Day-of-week → suppliers delivering. Demo data — Sun=0..Sat=6 */
  function computeDeliveriesForDay(...args) { return stockParts.overview.computeDeliveriesForDay.apply(this, args); }

  function computeNextDelivery(...args) { return stockParts.overview.computeNextDelivery.apply(this, args); }

  function tickFoodCost() {
    /* A real store's cost does not wobble on a timer: the figure moves when
       its stock or its sales do, and render() repaints it then. */
    if (stShowReal()) return;
    if (!stPageActive || stCurrentTab !== 'overview') return;
    const el = document.querySelector('[data-stock-live-foodcost]');
    if (!el) return;
    const base = foodCostMonth(getInv()) / 4;
    // Very subtle ±0.5% jitter to convey life
    const jitter = (Math.sin(Date.now() / 23000) * 0.005);
    el.textContent = fmtMad(base * (1 + jitter));
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 2 · Articles & stock (Catalogue, Journal des pertes, Historique)
   * ═══════════════════════════════════════════════════════════════════════ */

  /* Journal des pertes, historique des inventaires et revue propriétaire ·
   * FR / EN / AR. Ce qui est STOCKÉ reste en français (« Propriétaire »,
   * « Magasin principal », « Déclaration perte · perime », « Remplacé par … ») :
   * les registres existants et le serveur en dépendent. On traduit au moment
   * d'afficher, comme jobName() dans team.js et les noms de couleur de
   * color-palette.js. Sous FR, chaque libellé reste celui d'avant. */
  const COUNT_STR = {
    fr: {
      exportCsv: 'Exporter CSV',
      rangeToday: "Aujourd'hui", range7: '7 derniers jours', range30: '30 derniers jours', rangeAll: 'Tout l’historique',
      thDate: 'Date & Heure', thItem: 'Article', thEmployee: 'Employé', thActions: 'Actions', thValueMad: 'Valeur MAD',
      // Journal des pertes
      wasteSearchPh: 'Chercher un article, employé, note…', wasteSearchAria: 'Recherche journal des pertes',
      declareBtn: 'Déclarer une perte', reasonAll: 'Tous motifs',
      rsPerime: 'Périmé', rsCasse: 'Casse', rsAvarie: 'Avarié / Abîmé', rsAvarieShort: 'Avarié', rsOffert: 'Offert',
      rsStaff: 'Repas équipe', rsOther: 'Autre perte', rsLoss: 'Perte', rsReversal: 'Annulation',
      kpiLostValue: 'TOTAL VALEUR PERDUE', kpiLostRecords: (n) => `${n} déclarations de pertes`,
      kpiLostVolume: "VOLUME D'ARTICLES PERDUS", kpiLostVolumeSub: 'unités / kg sorties',
      thQty: 'Quantité', thUnit: 'Unité', thReason: 'Motif', thNote: 'Note',
      lot: (id) => `Lot: ${id}`, cancelLossTitle: 'Annuler cette perte', cancel: 'Annuler',
      wasteEmpty: 'Aucune perte enregistrée sur cette période.',
      wasteFoot: (n, v) => `Total : ${n} lignes de pertes · Valeur cumulée : <b>${v}</b>`,
      moveNotFound: 'Mouvement introuvable',
      cancelLossConfirm: (q) => `Annuler la perte de ${q} pour cet article ? Un contre-mouvement sera écrit dans le registre.`,
      lossCancelledToast: 'Perte annulée · contre-mouvement enregistré',
      keepLoss: 'Garder la perte', lossCancelFailed: 'La perte n’a pas pu être annulée. Rien n’a changé dans le registre.',
      // Déclarer une perte
      declareTitle: 'Déclarer une perte de stock',
      declareSub: 'Déduction immédiate du registre et traçabilité dans le journal des pertes.',
      declareItem: 'Article concerné', declareQty: 'Quantité perdue', declareReason: 'Motif de la perte',
      optPerime: 'Péremption / DLC dépassée', optCasse: 'Casse / Détérioration', optAvarie: 'Avarie / Défaut',
      optOffert: 'Geste commercial / Offert', optStaff: 'Repas employé / équipe', optOther: 'Autre motif',
      declareNote: 'Justification / Note (optionnelle)', declareNotePh: 'Ex: DLC au 21/08, bocal brisé à la mise en rayon…',
      declareSave: 'Enregistrer la perte', qtyInvalid: 'Précisez une quantité valide',
      lossSavedToast: 'Perte enregistrée et déduite du stock',
      // Historique des inventaires
      tabList: 'Liste des inventaires', tabRollup: 'Écarts récurrents (Analyse)', newCount: 'Nouvel inventaire',
      countSearchPh: 'Chercher un inventaire, employé, magasin…', countSearchAria: 'Recherche inventaires',
      statusAll: 'Tous statuts', statusPending: (n) => `À valider (${n})`, statusApplied: 'Validés', statusRejected: 'Refusés',
      kpiCounts: 'INVENTAIRES RÉALISÉS', kpiCountsSub: (n) => `${n} en attente de revue`,
      kpiNet: 'ÉCART NET EN VALEUR', kpiAbs: (v) => `Écart absolu : ${v}`,
      thRef: 'Réf.', thStore: 'Magasin', thItems: 'Articles', thNetMad: 'Écart net MAD', thStatus: 'Statut',
      stPending: 'À valider', stApplied: 'Validé', stRejected: 'Refusé',
      btnReview: 'Examiner', btnDetails: 'Détails',
      countsEmpty: 'Aucun inventaire correspondant aux filtres.',
      countsFoot: (n) => `${n} inventaire${n > 1 ? 's' : ''} affiché${n > 1 ? 's' : ''}`,
      rollTopItems: 'Articles & déclinaisons aux plus forts écarts',
      thCountTimes: 'Comptages', thCumDiff: 'Écart cumulé', thImpactMad: 'Impact MAD', sku: (s) => `Réf: ${s}`,
      rollNoVariance: 'Aucun écart détecté.', rollByEmployee: 'Écarts par employé',
      thCountsN: 'Inventaires', thAbsCum: 'Écart absolu cumulé', rollNoCount: 'Aucun comptage.',
      rollByStore: 'Synthèse par établissement', thVenue: 'Établissement', thNet: 'Écart net', thAbs: 'Écart absolu',
      // Revue propriétaire
      countNotFound: 'Inventaire introuvable',
      dTitle: (id) => `Inventaire #${id}`,
      dDesc: (store, who, date, time) => `${store} · Soumis par ${who} le ${date} à ${time}`,
      dPending: 'À valider par le propriétaire', dApplied: 'Validé & appliqué',
      dLines: (n) => `${n} article${n > 1 ? 's' : ''} compté${n > 1 ? 's' : ''}`,
      dTotal: 'Écart total en valeur :', dReviewNote: 'Note de revue :', dBy: (name) => `(par ${name})`,
      thItemVariant: 'Article & Déclinaison', thBefore: 'Stock avant', thCounted: 'Compté', thDiff: 'Écart', thRemark: 'Remarque',
      dNoLines: 'Aucune ligne enregistrée.',
      dNoteLabel: 'Note ou commentaire de décision (optionnel)', dNotePh: 'Justification de la décision…',
      dClose: 'Fermer', dReject: "Refuser l'inventaire", dApprove: 'Valider et appliquer le stock',
      toastApproved: 'Inventaire validé · stock mis à jour', toastRejected: 'Inventaire refusé',
      // Valeurs stockées, lues dans la langue de l'écran
      whoOwner: 'Propriétaire', whoEmployee: 'Employé', whoCashier: 'Caissier', whoUnknown: 'Inconnu',
      storeMain: 'Magasin principal', storeRegister: 'Caisse Principale',
      roleOwner: 'Propriétaire', roleAdmin: 'Admin', roleManager: 'Manager', roleCashier: 'Caissier', roleServer: 'Serveur', roleEmployee: 'Employé',
      replacedBy: (id) => `Remplacé par ${id}`, unitDefault: 'unité',
      wasteNoteDeclared: (r) => `Déclaration perte · ${r}`, wasteNoteCancelled: (ref) => `Annulation perte ${ref}`,
      // Exports
      csvCounts: ['ID_Inventaire', 'Date', 'Magasin', 'Employe', 'Role', 'Statut', 'Nb_Lignes', 'Ecart_Net_MAD', 'Ecart_Abs_MAD', 'Validateur', 'Decision', 'Note_Revue'],
      csvWaste: ['Date', 'Article', 'Quantite', 'Unite', 'Motif', 'Valeur_MAD', 'Employe', 'Note', 'ID_Mouvement'],
      csvCountsFile: 'historique-inventaires', csvWasteFile: 'journal-pertes',
    },
    en: {
      exportCsv: 'Export CSV',
      rangeToday: 'Today', range7: 'Last 7 days', range30: 'Last 30 days', rangeAll: 'All history',
      thDate: 'Date & time', thItem: 'Item', thEmployee: 'Employee', thActions: 'Actions', thValueMad: 'Value MAD',
      wasteSearchPh: 'Search an item, employee or note…', wasteSearchAria: 'Search the waste journal',
      declareBtn: 'Record a loss', reasonAll: 'All reasons',
      rsPerime: 'Expired', rsCasse: 'Breakage', rsAvarie: 'Damaged', rsAvarieShort: 'Damaged', rsOffert: 'Given away',
      rsStaff: 'Staff meal', rsOther: 'Other loss', rsLoss: 'Loss', rsReversal: 'Cancellation',
      kpiLostValue: 'TOTAL VALUE LOST', kpiLostRecords: (n) => `${n} loss record${n === 1 ? '' : 's'}`,
      kpiLostVolume: 'VOLUME OF ITEMS LOST', kpiLostVolumeSub: 'units / kg removed',
      thQty: 'Quantity', thUnit: 'Unit', thReason: 'Reason', thNote: 'Note',
      lot: (id) => `Lot: ${id}`, cancelLossTitle: 'Cancel this loss', cancel: 'Cancel',
      wasteEmpty: 'No loss recorded in this period.',
      wasteFoot: (n, v) => `Total: ${n} loss line${n === 1 ? '' : 's'} · Cumulative value: <b>${v}</b>`,
      moveNotFound: 'Movement not found',
      cancelLossConfirm: (q) => `Cancel the loss of ${q} for this item? A reversing movement will be written to the ledger.`,
      lossCancelledToast: 'Loss cancelled · reversing movement recorded',
      keepLoss: 'Keep the loss', lossCancelFailed: 'The loss could not be cancelled. Nothing changed in the ledger.',
      declareTitle: 'Record a stock loss',
      declareSub: 'Deducted from the ledger at once and traced in the waste journal.',
      declareItem: 'Item concerned', declareQty: 'Quantity lost', declareReason: 'Reason for the loss',
      optPerime: 'Expired / past use-by date', optCasse: 'Breakage / deterioration', optAvarie: 'Damage / defect',
      optOffert: 'Goodwill gesture / given away', optStaff: 'Staff meal', optOther: 'Other reason',
      declareNote: 'Justification / note (optional)', declareNotePh: 'E.g. use-by 21/08, jar broken while shelving…',
      declareSave: 'Record the loss', qtyInvalid: 'Enter a valid quantity',
      lossSavedToast: 'Loss recorded and deducted from stock',
      tabList: 'Count list', tabRollup: 'Recurring variances (analysis)', newCount: 'New count',
      countSearchPh: 'Search a count, employee or store…', countSearchAria: 'Search counts',
      statusAll: 'All statuses', statusPending: (n) => `To review (${n})`, statusApplied: 'Approved', statusRejected: 'Rejected',
      kpiCounts: 'COUNTS COMPLETED', kpiCountsSub: (n) => `${n} awaiting review`,
      kpiNet: 'NET VARIANCE IN VALUE', kpiAbs: (v) => `Absolute variance: ${v}`,
      thRef: 'Ref.', thStore: 'Store', thItems: 'Items', thNetMad: 'Net variance MAD', thStatus: 'Status',
      stPending: 'To review', stApplied: 'Approved', stRejected: 'Rejected',
      btnReview: 'Review', btnDetails: 'Details',
      countsEmpty: 'No count matches these filters.',
      countsFoot: (n) => `${n} count${n === 1 ? '' : 's'} shown`,
      rollTopItems: 'Items and variants with the largest variances',
      thCountTimes: 'Counts', thCumDiff: 'Cumulative variance', thImpactMad: 'Impact MAD', sku: (s) => `Ref: ${s}`,
      rollNoVariance: 'No variance found.', rollByEmployee: 'Variances by employee',
      thCountsN: 'Counts', thAbsCum: 'Cumulative absolute variance', rollNoCount: 'No counts yet.',
      rollByStore: 'Summary by location', thVenue: 'Location', thNet: 'Net variance', thAbs: 'Absolute variance',
      countNotFound: 'Count not found',
      dTitle: (id) => `Count #${id}`,
      dDesc: (store, who, date, time) => `${store} · Submitted by ${who} on ${date} at ${time}`,
      dPending: 'Awaiting owner review', dApplied: 'Approved and applied',
      dLines: (n) => `${n} item${n === 1 ? '' : 's'} counted`,
      dTotal: 'Total variance in value:', dReviewNote: 'Review note:', dBy: (name) => `(by ${name})`,
      thItemVariant: 'Item & variant', thBefore: 'Stock before', thCounted: 'Counted', thDiff: 'Variance', thRemark: 'Remark',
      dNoLines: 'No line recorded.',
      dNoteLabel: 'Decision note or comment (optional)', dNotePh: 'Reason for the decision…',
      dClose: 'Close', dReject: 'Reject the count', dApprove: 'Approve and apply to stock',
      toastApproved: 'Count approved · stock updated', toastRejected: 'Count rejected',
      whoOwner: 'Owner', whoEmployee: 'Employee', whoCashier: 'Cashier', whoUnknown: 'Unknown',
      storeMain: 'Main store', storeRegister: 'Main register',
      roleOwner: 'Owner', roleAdmin: 'Admin', roleManager: 'Manager', roleCashier: 'Cashier', roleServer: 'Server', roleEmployee: 'Employee',
      replacedBy: (id) => `Replaced by ${id}`, unitDefault: 'unit',
      wasteNoteDeclared: (r) => `Loss declared · ${r}`, wasteNoteCancelled: (ref) => `Loss cancelled ${ref}`,
      csvCounts: ['Count_ID', 'Date', 'Store', 'Employee', 'Role', 'Status', 'Lines', 'Net_Variance_MAD', 'Abs_Variance_MAD', 'Reviewer', 'Decision', 'Review_Note'],
      csvWaste: ['Date', 'Item', 'Quantity', 'Unit', 'Reason', 'Value_MAD', 'Employee', 'Note', 'Movement_ID'],
      csvCountsFile: 'count-history', csvWasteFile: 'waste-journal',
    },
    ar: {
      exportCsv: 'تصدير الجدول',
      rangeToday: 'اليوم', range7: 'آخر 7 أيام', range30: 'آخر 30 يومًا', rangeAll: 'السجل كاملًا',
      thDate: 'التاريخ والوقت', thItem: 'المنتج', thEmployee: 'الموظف', thActions: 'إجراءات', thValueMad: 'القيمة بالدرهم',
      wasteSearchPh: 'ابحث عن منتج أو موظف أو ملاحظة…', wasteSearchAria: 'البحث في سجل الهدر',
      declareBtn: 'تسجيل خسارة', reasonAll: 'كل الأسباب',
      rsPerime: 'منتهي الصلاحية', rsCasse: 'كسر', rsAvarie: 'تالف', rsAvarieShort: 'تالف', rsOffert: 'هدية',
      rsStaff: 'وجبة الفريق', rsOther: 'خسارة أخرى', rsLoss: 'خسارة', rsReversal: 'إلغاء',
      kpiLostValue: 'إجمالي القيمة المفقودة', kpiLostRecords: (n) => `عدد التصريحات: ${n}`,
      kpiLostVolume: 'حجم المنتجات المفقودة', kpiLostVolumeSub: 'وحدات أو كيلوغرامات خرجت من المخزون',
      thQty: 'الكمية', thUnit: 'الوحدة', thReason: 'السبب', thNote: 'ملاحظة',
      lot: (id) => `الدفعة: ${id}`, cancelLossTitle: 'إلغاء هذه الخسارة', cancel: 'إلغاء',
      wasteEmpty: 'لا توجد خسائر مسجلة في هذه الفترة.',
      wasteFoot: (n, v) => `عدد أسطر الخسائر: ${n} · القيمة التراكمية: <b>${v}</b>`,
      moveNotFound: 'الحركة غير موجودة',
      cancelLossConfirm: (q) => `إلغاء خسارة ${q} لهذا المنتج؟ ستُكتب حركة عكسية في السجل.`,
      lossCancelledToast: 'أُلغيت الخسارة · سُجّلت حركة عكسية',
      keepLoss: 'الإبقاء على الخسارة', lossCancelFailed: 'تعذّر إلغاء الخسارة. لم يتغير شيء في السجل.',
      declareTitle: 'تسجيل خسارة في المخزون',
      declareSub: 'تُخصم فورًا من السجل وتبقى قابلة للتتبع في سجل الهدر.',
      declareItem: 'المنتج المعني', declareQty: 'الكمية المفقودة', declareReason: 'سبب الخسارة',
      optPerime: 'انتهاء الصلاحية', optCasse: 'كسر أو تلف', optAvarie: 'عطب أو عيب',
      optOffert: 'مجاملة تجارية أو هدية', optStaff: 'وجبة الموظفين أو الفريق', optOther: 'سبب آخر',
      declareNote: 'المبرر أو ملاحظة (اختياري)', declareNotePh: 'مثال: تنتهي الصلاحية في 21/08، برطمان انكسر أثناء الترتيب…',
      declareSave: 'تسجيل الخسارة', qtyInvalid: 'أدخل كمية صحيحة',
      lossSavedToast: 'سُجّلت الخسارة وخُصمت من المخزون',
      tabList: 'قائمة عمليات الجرد', tabRollup: 'الفروق المتكررة (تحليل)', newCount: 'جرد جديد',
      countSearchPh: 'ابحث عن جرد أو موظف أو متجر…', countSearchAria: 'البحث في عمليات الجرد',
      statusAll: 'كل الحالات', statusPending: (n) => `للمراجعة (${n})`, statusApplied: 'المقبولة', statusRejected: 'المرفوضة',
      kpiCounts: 'عمليات الجرد المنجزة', kpiCountsSub: (n) => `في انتظار المراجعة: ${n}`,
      kpiNet: 'صافي الفرق بالقيمة', kpiAbs: (v) => `الفرق المطلق: ${v}`,
      thRef: 'المرجع', thStore: 'المتجر', thItems: 'المنتجات', thNetMad: 'صافي الفرق بالدرهم', thStatus: 'الحالة',
      stPending: 'للمراجعة', stApplied: 'مقبول', stRejected: 'مرفوض',
      btnReview: 'مراجعة', btnDetails: 'التفاصيل',
      countsEmpty: 'لا يوجد جرد يطابق عوامل التصفية.',
      countsFoot: (n) => `عدد عمليات الجرد المعروضة: ${n}`,
      rollTopItems: 'المنتجات والأصناف ذات أكبر الفروق',
      thCountTimes: 'مرات العد', thCumDiff: 'الفرق التراكمي', thImpactMad: 'الأثر بالدرهم', sku: (s) => `المرجع: ${s}`,
      rollNoVariance: 'لم يُرصد أي فرق.', rollByEmployee: 'الفروق حسب الموظف',
      thCountsN: 'عمليات الجرد', thAbsCum: 'الفرق المطلق التراكمي', rollNoCount: 'لا توجد عمليات عد.',
      rollByStore: 'ملخص حسب المؤسسة', thVenue: 'المؤسسة', thNet: 'صافي الفرق', thAbs: 'الفرق المطلق',
      countNotFound: 'الجرد غير موجود',
      dTitle: (id) => `الجرد رقم ${id}`,
      dDesc: (store, who, date, time) => `${store} · أرسله ${who} في ${date} على الساعة ${time}`,
      dPending: 'في انتظار مراجعة المالك', dApplied: 'مقبول ومُطبَّق',
      dLines: (n) => `المنتجات المعدودة: ${n}`,
      dTotal: 'إجمالي الفرق بالقيمة:', dReviewNote: 'ملاحظة المراجعة:', dBy: (name) => `(بواسطة ${name})`,
      thItemVariant: 'المنتج والصنف', thBefore: 'المخزون قبل العد', thCounted: 'المعدود', thDiff: 'الفرق', thRemark: 'ملاحظة',
      dNoLines: 'لا توجد أسطر مسجلة.',
      dNoteLabel: 'ملاحظة أو تعليق على القرار (اختياري)', dNotePh: 'مبرر القرار…',
      dClose: 'إغلاق', dReject: 'رفض الجرد', dApprove: 'قبول الجرد وتطبيقه على المخزون',
      toastApproved: 'قُبل الجرد · تم تحديث المخزون', toastRejected: 'رُفض الجرد',
      whoOwner: 'المالك', whoEmployee: 'موظف', whoCashier: 'أمين الصندوق', whoUnknown: 'غير معروف',
      storeMain: 'المتجر الرئيسي', storeRegister: 'الصندوق الرئيسي',
      roleOwner: 'المالك', roleAdmin: 'مسؤول', roleManager: 'مدير', roleCashier: 'أمين الصندوق', roleServer: 'نادل', roleEmployee: 'موظف',
      replacedBy: (id) => `استُبدل بالجرد ${id}`, unitDefault: 'وحدة',
      wasteNoteDeclared: (r) => `تصريح بخسارة · ${r}`, wasteNoteCancelled: (ref) => `إلغاء خسارة ${ref}`,
      csvCounts: ['معرّف الجرد', 'التاريخ', 'المتجر', 'الموظف', 'الدور', 'الحالة', 'عدد الأسطر', 'صافي الفرق بالدرهم', 'الفرق المطلق بالدرهم', 'المراجع', 'القرار', 'ملاحظة المراجعة'],
      csvWaste: ['التاريخ', 'المنتج', 'الكمية', 'الوحدة', 'السبب', 'القيمة بالدرهم', 'الموظف', 'ملاحظة', 'معرّف الحركة'],
      csvCountsFile: 'سجل-الجرد', csvWasteFile: 'سجل-الهدر',
    },
  };
  function ct(k, ...args) {
    const L = COUNT_STR[lang()] || COUNT_STR.fr;
    const v = L[k] != null ? L[k] : COUNT_STR.fr[k];
    return typeof v === 'function' ? v(...args) : (v != null ? v : k);
  }
  /* Montant : « درهم » sous l'arabe, comme curUnit() du tableau de bord. */
  function ctMad(n) {
    const s = fmtMad(n);
    return lang() === 'ar' ? s.replace(/MAD$/, 'درهم') : s;
  }
  /* Quantité : séparateurs de KiwiNumber, jusqu'à trois décimales utiles. */
  function ctNum(n) {
    const v = Math.round((+n || 0) * 1000) / 1000;
    const dec = Number.isInteger(v) ? 0 : Math.min(3, (String(v).split('.')[1] || '').length);
    return fmtNum(v, dec);
  }
  /* Date et heure : la locale des nombres (chiffres latins sous FR et AR). */
  function ctWhen(ts) {
    const d = new Date(ts || Date.now());
    const loc = window.KiwiNumber?.locale?.() || (lang() === 'en' ? 'en-GB' : 'fr-FR');
    return { date: d.toLocaleDateString(loc), time: d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) };
  }
  /* Noms par défaut posés par Kiwi (jamais un vrai prénom) → langue de l'écran. */
  function ctWho(name) {
    const s = String(name == null ? '' : name);
    const key = { 'Propriétaire': 'whoOwner', 'Employé': 'whoEmployee', 'Caissier': 'whoCashier', 'Inconnu': 'whoUnknown' }[s.trim()];
    if (key) return ct(key);
    const m = /^(.+) \(Propriétaire\)$/.exec(s);
    return m ? `${m[1]} (${ct('whoOwner')})` : s;
  }
  function ctRole(role) {
    const s = String(role == null ? '' : role).trim();
    const code = { owner: 'roleOwner', admin: 'roleAdmin', manager: 'roleManager', cashier: 'roleCashier', server: 'roleServer', employee: 'roleEmployee', staff: 'roleEmployee' }[s.toLowerCase()];
    if (code) return ct(code);
    if (lang() === 'fr') return s;
    const label = { 'Propriétaire': 'roleOwner', 'Admin': 'roleAdmin', 'Manager': 'roleManager', 'Gérant': 'roleManager', 'Gérante': 'roleManager', 'Caissier': 'roleCashier', 'Caissière': 'roleCashier', 'Serveur': 'roleServer', 'Serveuse': 'roleServer', 'Employé': 'roleEmployee', 'Employée': 'roleEmployee' }[s];
    return label ? ct(label) : s;
  }
  function ctStore(name) {
    const s = String(name == null ? '' : name).trim();
    if (!s) return ct('storeMain');
    const key = { 'Magasin principal': 'storeMain', 'Principal': 'storeMain', 'Caisse Principale': 'storeRegister' }[s];
    return key && lang() !== 'fr' ? ct(key) : s;
  }
  function ctReviewNote(note) {
    const s = String(note == null ? '' : note);
    const m = /^Remplacé par (.+)$/.exec(s);
    return m ? ct('replacedBy', m[1]) : s;
  }
  /* Motif d'une ligne du journal ; un code inconnu (« waste », …) se lit « Perte ». */
  function ctReason(code, isReversal) {
    if (isReversal) return ct('rsReversal');
    const key = { perime: 'rsPerime', expiry: 'rsPerime', 'Péremption': 'rsPerime', casse: 'rsCasse', avarie: 'rsAvarie', offert: 'rsOffert', gift: 'rsOffert', 'repas-equipe': 'rsStaff', 'staff-meal': 'rsStaff', autre: 'rsOther' }[code];
    return ct(key || 'rsLoss');
  }
  /* Notes générées par Kiwi (déclaration, annulation) ; une note saisie reste telle quelle. */
  function ctWasteNote(note) {
    const s = String(note == null ? '' : note);
    let m = /^Déclaration perte · (\S+)$/.exec(s);
    if (m) return ct('wasteNoteDeclared', ctReason(m[1]));
    m = /^Annulation perte (\S+)$/.exec(s);
    return m ? ct('wasteNoteCancelled', m[1]) : s;
  }
  /* Unités canoniques de restaurant-units.js ; sous l'arabe « كغ » comme le
     reste de la page, sous l'anglais les symboles restent des symboles. */
  function ctUnit(unit) {
    const s = String(unit == null ? '' : unit);
    if (s === 'unité') return ct('unitDefault');
    const l = lang();
    if (l !== 'en' && l !== 'ar') return s;
    const U = {
      mg: [s, 'ملغ'], g: [s, 'غ'], kg: [s, 'كغ'], ml: [s, 'مل'], cl: [s, 'سل'], L: [s, 'ل'],
      douzaine: ['dozen', 'دزينة'], lot: ['lot', 'دفعة'], paquet: ['pack', 'رزمة'], sachet: ['sachet', 'كيس صغير'],
      sac: ['bag', 'كيس'], 'boîte': ['box', 'علبة'], carton: ['carton', 'كرتونة'], barquette: ['tray', 'علبة تغليف'],
      bouteille: ['bottle', 'قنينة'], canette: ['can', 'علبة معدنية'], bocal: ['jar', 'برطمان'], pot: ['pot', 'وعاء'],
      bidon: ['jerrycan', 'جالون'], seau: ['bucket', 'سطل'], 'fût': ['keg', 'برميل'], bac: ['tub', 'حوض'],
      botte: ['bunch', 'حزمة'], caisse: ['crate', 'صندوق'], plateau: ['tray', 'صينية'], rouleau: ['roll', 'لفافة'],
    }[s];
    return U ? U[l === 'en' ? 0 : 1] : s;
  }

  function getWasteMovements(...args) { return stockParts.loss.getWasteMovements.apply(this, args); }

  function renderWasteJournal(...args) { return stockParts.loss.renderWasteJournal.apply(this, args); }

  function exportWasteCsv(...args) { return stockParts.loss.exportWasteCsv.apply(this, args); }

  function cancelWasteMovement(movementId) {
    if (!movementId || !window.KiwiInventory) return;
    const history = window.KiwiInventory.history() || [];
    const m = history.find(r => r.id === movementId);
    if (!m) { window.Kiwi?.toast?.(ct('moveNotFound'), { type: 'warn' }); return; }
    /* La question passe par la fenêtre partagée (Kiwi.modal), comme l'achat et
       la réception : traduite, focus dedans puis rendu au bouton d'origine,
       Échap, la croix ou le fond ferment sans rien écrire. Le focus part sur
       « Garder la perte » : le choix sûr est celui par défaut. Plus de boîte
       native (confirm). Sans Kiwi.modal, rien n'est écrit. */
    const K = window.Kiwi;
    if (!K || typeof K.modal !== 'function') return;
    const md = K.modal({
      title: ct('cancelLossTitle'),
      width: 480,
      body: `<p style="margin:0; color:var(--n-700); line-height:1.55;">${esc(ct('cancelLossConfirm', ctNum(Math.abs(m.qty))))}</p>`,
      foot: `<button class="st-btn" type="button" data-dismiss data-autofocus data-stock-loss-keep>${esc(ct('keepLoss'))}</button><button class="st-btn primary" type="button" data-stock-loss-reverse>${esc(ct('cancelLossTitle'))}</button>`,
    });
    md?.el?.querySelector('[data-stock-loss-reverse]')?.addEventListener('click', () => {
      md.close();
      const rev = window.KiwiInventory.reverse(m, 'manual', `Annulation perte ${m.refId || m.id}`);
      if (!rev) { window.Kiwi?.toast?.(ct('lossCancelFailed'), { type: 'warn' }); return; }
      window.KiwiInventory.sync();
      window.Kiwi?.toast?.(ct('lossCancelledToast'), { type: 'success' });
      if (stPageActive) render();
    });
  }

  function openDeclareWasteModal(...args) { return stockParts.loss.openDeclareWasteModal.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * HISTORIQUE DES INVENTAIRES PHYSIQUES & REVUE PROPRIÉTAIRE
   * ═══════════════════════════════════════════════════════════════════════ */
  function fetchServerCounts(...args) { return stockParts.counts.fetchServerCounts.apply(this, args); }

  function getAllCounts(...args) { return stockParts.counts.getAllCounts.apply(this, args); }

  function filterCounts(...args) { return stockParts.counts.filterCounts.apply(this, args); }

  function renderCountsHistory(...args) { return stockParts.counts.renderCountsHistory.apply(this, args); }

  function renderCountsRollup(...args) { return stockParts.counts.renderCountsRollup.apply(this, args); }

  function openCountDetailModal(...args) { return stockParts.counts.openCountDetailModal.apply(this, args); }

  /* Garde partagée approve/reject : un seul appui effectif à la fois. Le
   * fanion module bloque le ré-appui pendant la requête ; les boutons portent
   * disabled + aria-busy sur la modale pour les lecteurs d'écran et le tactile. */
  let stReviewBusy = false;
  function stReviewBusyTake(...args) { return stockParts.counts.stReviewBusyTake.apply(this, args); }
  function stReviewBusyRelease(...args) { return stockParts.counts.stReviewBusyRelease.apply(this, args); }

  /* Envoi seul, sans état : construit le corps, appelle, rend le verdict brut.
   * fetchFn injectable pour les tests (défaut : fetch global). */
  function stReviewCountSend(...args) { return stockParts.counts.stReviewCountSend.apply(this, args); }

  /* Décision pure : que doit faire la coquille à partir du verdict ?
   * Jamais d'écriture ici — seulement un plan. Le serveur reste le seul
   * écrivain des approbations réelles ; la surcouche locale (démo) rejoue
   * le comportement historique, jamais en plus d'un succès serveur. */
  function stReviewCountErr(...args) { return stockParts.counts.stReviewCountErr.apply(this, args); }
  function stReviewCountPlan(...args) { return stockParts.counts.stReviewCountPlan.apply(this, args); }

  function reviewCount(...args) { return stockParts.counts.reviewCount.apply(this, args); }

  function exportCountsCsv(...args) { return stockParts.counts.exportCountsCsv.apply(this, args); }

  function renderItems() {
    const subNav = `
      <div class="st-item-subtabs" style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--n-200);padding-bottom:10px;">
        <button class="st-cat-pill${stItemSubView === 'catalog' ? ' on' : ''}" type="button" data-action="stock-subview" data-subview="catalog" style="font-weight:600;">${catalogLabel('inventoryCatalog','Catalogue des articles')}</button>
        <button class="st-cat-pill${stItemSubView === 'waste' ? ' on' : ''}" type="button" data-action="stock-subview" data-subview="waste" style="font-weight:600;">${catalogLabel('wasteJournal','Journal des pertes')}</button>
        <button class="st-cat-pill${stItemSubView === 'counts' ? ' on' : ''}" type="button" data-action="stock-subview" data-subview="counts" style="font-weight:600;">${catalogLabel('countHistory','Historique des inventaires')}</button>
      </div>
    `;

    if (stItemSubView === 'waste') {
      return `<div class="st-section">${subNav}${renderWasteJournal()}</div>`;
    }
    if (stItemSubView === 'counts') {
      return `<div class="st-section">${subNav}${typeof renderCountsHistory === 'function' ? renderCountsHistory() : '<div style="padding:20px;">Chargement de l\'historique…</div>'}</div>`;
    }

    const items = getInv();
    const filteredAll = filterItems(items);
    const sorted = sortItems(filteredAll);
    const counts = {
      all: items.length,
      ok: items.filter(it => statusOf(it) === 'ok').length,
      low: items.filter(it => statusOf(it) === 'low').length,
      out: items.filter(it => statusOf(it) === 'out').length,
    };
    return `
      <div class="st-section">
        ${subNav}
        ${renderToolbar()}
        ${stItemView === 'list' ? renderItemTable(sorted) : renderItemCardGrid(sorted)}
        <div class="st-tbl-foot">
          ${esc(t('tblFoot', sorted.length, fmtMad(totalValue(sorted)), counts.ok, counts.low, counts.out))}
        </div>
      </div>
    `;
  }

  function renderToolbar() {
    const catPill = (id, label) => `<button class="st-cat-pill${stCatFilter === id ? ' on' : ''}" type="button" data-action="stock-cat-filter" data-cat="${id}">${esc(label)}</button>`;
    const statPill = (id, label) => `<button class="st-cat-pill${stStatusFilter === id ? ' on' : ''}" type="button" data-action="stock-status-filter" data-status="${id}">${esc(label)}</button>`;
    const viewBtn = (id, label) => `<button class="st-view-btn${stItemView === id ? ' on' : ''}" type="button" data-action="stock-view" data-view="${id}">${esc(label)}</button>`;
    const cats = allCategories();
    return `
      <div class="st-toolbar">
        <div class="st-search-row">
          <div class="st-search-wrap">
            ${svg('search', 16)}
            <input class="st-search" type="text" placeholder="${esc(t('searchPlaceholder'))}" value="${esc(stSearch)}" data-stock-search-input aria-label="${esc(t('searchPlaceholder'))}" />
          </div>
          <div class="st-view-toggle">
            ${viewBtn('list', t('viewList'))}
            ${viewBtn('cards', t('viewCards'))}
          </div>
        </div>
        <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%; flex-wrap:wrap;">
          ${catPill('all', t('catAll'))}
          ${cats.map(c => catPill(c.id, c.label)).join('')}
          ${stCatFilter !== 'all' && cats.some(c => c.id === stCatFilter)
            ? `<button class="st-cat-pill" type="button" data-action="stock-manage-cat" data-cat="${esc(stCatFilter)}" title="${esc(t('manageCatTitle'))}" aria-label="${esc(t('manageCatTitle'))}">${svg('edit', 12)}<span>${esc(t('manageCatTitle'))}</span></button>` : ''}
          <button data-activation=write class="st-cat-pill" type="button" data-action="stock-add-cat" title="${esc(t('addCatPillTitle'))}" aria-label="${esc(t('addCatPillTitle'))}" style="font-weight:700;">+</button>
        </div>
        <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%;">
          ${statPill('all', t('statAll'))}
          ${statPill('ok',  t('statOk'))}
          ${statPill('low', t('statLowFilter'))}
          ${statPill('out', t('statOutFilter'))}
        </div>
      </div>
    `;
  }

  function filterItems(items) {
    return items.filter(it => {
      if (stCatFilter !== 'all' && it.category !== stCatFilter) return false;
      if (stStatusFilter !== 'all' && statusOf(it) !== stStatusFilter) return false;
      if (stSearch) {
        const q = stSearch;
        if (!it.name.toLowerCase().includes(q) &&
            !it.supplier.toLowerCase().includes(q) &&
            !catLabel(it.category).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function sortItems(items) {
    const dir = stSortDir === 'asc' ? 1 : -1;
    const sorted = [...items];
    sorted.sort((a, b) => {
      let av, bv;
      switch (stSortBy) {
        case 'stock':   av = currentStockFor(a); bv = currentStockFor(b); break;
        case 'par':     av = a.parLevel; bv = b.parLevel; break;
        case 'variance':av = variance(a); bv = variance(b); break;
        case 'value':   av = currentStockFor(a) * a.costPerUnit; bv = currentStockFor(b) * b.costPerUnit; break;
        case 'days':    av = daysOfStock(a); bv = daysOfStock(b); break;
        case 'status':  av = ['out','low','ok'].indexOf(statusOf(a)); bv = ['out','low','ok'].indexOf(statusOf(b)); break;
        case 'name':
        default:        av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return 0;
    });
    return sorted;
  }

  function sortInd(key) {
    if (stSortBy !== key) return '<span class="sort-ind">↕</span>';
    return `<span class="sort-ind">${stSortDir === 'asc' ? '↑' : '↓'}</span>`;
  }

  function renderItemTable(items) {
    if (items.length === 0) return `<div style="padding:24px; text-align:center; color:var(--n-500); font-size:13px;">${catalogLabel('noMatch','Aucun article ne correspond aux filtres.')}</div>`;
    return `
      <div class="st-mobile-items"><label class="st-mobile-sort">${catalogLabel('sort','Trier')}<select data-stock-mobile-sort aria-label="${esc(catalogText('sort','Trier'))}">${[['name',t('colArticle')],['stock',t('colStock')],['value',t('colValue')],['status',t('colStatus')]].map(([id,label])=>`<option value="${id}"${stSortBy===id?' selected':''}>${esc(label)}</option>`).join('')}</select></label>${items.map(renderDenseItem).join('')}</div>
      <div class="st-tbl-wrap st-desktop-items">
        <table class="st-tbl">
          <thead>
            <tr>
              <th class="${stSortBy === 'name' ? 'sorted' : ''}" data-action="stock-sort" data-sort="name">${esc(t('colArticle'))}${sortInd('name')}</th>
              <th>${esc(t('colCat'))}</th>
              <th class="${stSortBy === 'stock' ? 'sorted' : ''}" data-action="stock-sort" data-sort="stock">${esc(t('colStock'))}${sortInd('stock')}</th>
              <th class="${stSortBy === 'par' ? 'sorted' : ''}" data-action="stock-sort" data-sort="par">${esc(t('colPar'))}${sortInd('par')}</th>
              <th class="${stSortBy === 'variance' ? 'sorted' : ''}" data-action="stock-sort" data-sort="variance">${esc(t('colVar'))}${sortInd('variance')}</th>
              <th class="r ${stSortBy === 'value' ? 'sorted' : ''}" data-action="stock-sort" data-sort="value">${esc(t('colValue'))}${sortInd('value')}</th>
              <th>${esc(t('colSupplier'))}</th>
              <th class="c ${stSortBy === 'days' ? 'sorted' : ''}" data-action="stock-sort" data-sort="days">${esc(t('colDays'))}${sortInd('days')}</th>
              <th class="${stSortBy === 'status' ? 'sorted' : ''}" data-action="stock-sort" data-sort="status">${esc(t('colStatus'))}${sortInd('status')}</th>
              <th class="r">${esc(t('colActions'))}</th>
            </tr>
          </thead>
          <tbody>
            ${items.length === 0 ? '<tr><td colspan="10" style="padding:44px 20px;text-align:center;"><div style="display:flex;flex-direction:column;align-items:center;"><div style="width:44px;height:44px;border-radius:12px;background:rgba(11,110,79,0.10);border:1px solid rgba(11,110,79,0.18);color:var(--atlas);display:grid;place-items:center;margin-bottom:12px;"><svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg></div><div style="font-weight:600;font-size:14.5px;color:var(--ink);margin-bottom:4px;">' + esc(t('noMatch') || 'Aucun article ne correspond aux filtres.') + '</div></div></td></tr>' : items.map(renderItemRow).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderDenseItem(it){
    const cur=currentStockFor(it),state=statusOf(it),label=state==='ok'?t('stOk'):state==='low'?t('stLow'):t('stOut');
    return `<button class="st-dense-item" type="button" data-action="stock-item-detail" data-item-id="${esc(it.id)}"><span><strong>${esc(it.name)}</strong><small>${esc(catLabel(it.category))} · ${esc(fmtMad(it.costPerUnit))} / ${esc(it.unit)}</small></span><span class="st-dense-stock"><b>${esc(fmtUnit(cur,it.unit))}</b><span class="st-catalog-status ${state}">${esc(label)}</span></span></button>`;
  }

  function renderItemRow(it) {
    const cur = currentStockFor(it);
    const parPct = it.parLevel > 0 ? Math.min(100, (cur / it.parLevel) * 100) : 0;
    const barCls = parPct >= 50 ? 'ok' : parPct >= 20 ? 'warn' : 'bad';
    const v = variance(it);
    const varAbs = Math.abs(v);
    const varCls = varAbs <= 5 ? 'ok' : varAbs <= 15 ? 'warn' : 'bad';
    const varIco = v > 1 ? 'trendingUp' : v < -1 ? 'trendingDown' : 'minus';
    const days = daysOfStock(it);
    const daysShown = days >= 999 ? '·' : Math.round(days);
    const daysCls = days >= 7 ? 'ok' : days >= 3 ? 'warn' : days >= 1 ? 'bad' : 'crit';
    const st = statusOf(it);
    const stLabel = st === 'ok' ? t('stOk') : st === 'low' ? t('stLow') : t('stOut');
    const valueCell = fmtMad(cur * it.costPerUnit);
    const theoretical = theoreticalUsageFor(it);
    const varCostMad = fmtMad(Math.abs(v) / 100 * theoretical * it.costPerUnit);
    return `
      <tr class="st-row-in">
        <td>
          <div class="st-cell-name">${esc(it.name)}</div>
          <div class="st-cell-cost">${esc(fmtMad(it.costPerUnit))} / ${esc(it.unit)}</div>
        </td>
        <td><span class="st-sup-cat">${esc(catLabel(it.category))}</span></td>
        <td>
          <div class="st-cell-stock">${esc(fmtUnit(cur, it.unit))}</div>
          <div class="st-cell-stock-bar"><div class="st-cell-stock-bar-fill ${barCls}" data-stock-bar="${parPct}"></div></div>
        </td>
        <td>
          <div class="st-cell-par">${esc(fmtUnit(it.parLevel, it.unit))}</div>
          <div class="st-cell-par-sub">min: ${esc(fmtUnit(it.reorderLevel, it.unit))}</div>
        </td>
        <td>
          <span class="st-cell-var ${varCls}">${svg(varIco, 12)}${esc(fmtPct(v))}
            <span class="st-tt">${esc(t('varTip', fmtUnit(it.usageThisWeek, it.unit), fmtUnit(theoretical, it.unit), varCostMad))}</span>
          </span>
        </td>
        <td class="r"><span class="st-cell-value">${esc(valueCell)}</span></td>
        <td>
          <div class="st-cell-sup">${esc(it.supplier.split(' · ')[0])}</div>
          <div class="st-cell-sup-sub">${esc(actualLastDelivery(it) ? fmtDateShort(actualLastDelivery(it)) : '·')}</div>
        </td>
        <td class="c"><span class="st-cell-days ${daysCls}">${esc(daysShown === '·' ? '·' : `${daysShown} j`)}</span></td>
        <td><span class="st-cell-status ${st}"><span class="sd"></span>${esc(stLabel)}</span></td>
        <td class="r">
          <div class="st-actions">
            <button class="st-icon-btn" type="button" data-action="stock-item-detail" data-item-id="${esc(it.id)}" title="${esc(t('btnDetail'))}" aria-label="${esc(t('btnDetail'))}">${svg('eye', 14)}</button>
            <button data-activation=write class="st-icon-btn" type="button" data-action="stock-reorder" data-item-id="${esc(it.id)}" title="${esc(t('btnReorder'))}" aria-label="${esc(t('btnReorder'))}">${svg('plus', 14)}</button>
            <button data-activation=write class="st-icon-btn" type="button" data-action="stock-edit-item" data-item-id="${esc(it.id)}" title="${esc(t('mItEdit'))}" aria-label="${esc(t('mItEdit'))}">${svg('edit', 14)}</button>
            <button data-activation=write class="st-icon-btn" type="button" data-action="stock-delete-item" data-item-id="${esc(it.id)}" title="${esc(t('titleDelete'))}" aria-label="${esc(t('titleDelete'))}" style="color:#9a1f1f;">${svg('x', 14)}</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderItemCardGrid(items) {
    if (items.length === 0) return `<div style="padding:24px; text-align:center; color:var(--n-500); font-size:13px;">${catalogLabel('noMatch','Aucun article ne correspond aux filtres.')}</div>`;
    return `<div class="st-card-grid">${items.map(renderItemCard).join('')}</div>`;
  }

  function renderItemCard(it) {
    const cur = currentStockFor(it);
    const parPct = it.parLevel > 0 ? Math.min(100, (cur / it.parLevel) * 100) : 0;
    const st = statusOf(it);
    const barCls = parPct >= 50 ? 'ok' : parPct >= 20 ? 'warn' : 'bad';
    return `
      <button type="button" class="st-card ${st}" data-action="stock-item-detail" data-item-id="${esc(it.id)}">
        <div class="st-card-top">
          <div class="st-card-name">${esc(it.name)}</div>
          <span class="st-card-cat">${esc(catLabel(it.category))}</span>
        </div>
        <div class="st-card-level"><div class="st-card-stock">${esc(fmtNum(cur, Number.isInteger(cur) ? 0 : 1))}<span class="u">${esc(it.unit)}</span></div>
        <span class="st-catalog-status ${st}">${esc(st==='ok'?t('stOk'):st==='low'?t('stLow'):t('stOut'))}</span></div>
        <div class="st-card-bar"><div class="st-card-bar-fill ${barCls}" data-stock-bar="${parPct}"></div></div>
        <div class="st-card-meta">
          <span>Par : <b>${esc(fmtUnit(it.parLevel, it.unit))}</b></span>
          <span>${esc(fmtMad(cur * it.costPerUnit))}</span>
        </div>
      </button>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 3 · Fournisseurs
   * ═══════════════════════════════════════════════════════════════════════ */
  function computeRealSupplierPriceChanges(...args) { return stockParts.purchasing.computeRealSupplierPriceChanges.apply(this, args); }

  function renderRealSupplierPriceChanges(...args) { return stockParts.purchasing.renderRealSupplierPriceChanges.apply(this, args); }

  function renderSuppliers(...args) { return stockParts.purchasing.renderSuppliers.apply(this, args); }

  function supplierDate(...args) { return stockParts.purchasing.supplierDate.apply(this, args); }
  function supplierHistory(...args) { return stockParts.purchasing.supplierHistory.apply(this, args); }
  /* #0151 · One tap target per supplier: the card opens the supplier, the
     round button calls them. Category and area share one quiet line. */
  function renderSupplierCard(...args) { return stockParts.purchasing.renderSupplierCard.apply(this, args); }

  function renderSupRow(...args) { return stockParts.purchasing.renderSupRow.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 4 · Commandes
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderOrders(...args) { return stockParts.purchasing.renderOrders.apply(this, args); }

  function renderActiveOrders(...args) { return stockParts.purchasing.renderActiveOrders.apply(this, args); }

  function renderHistoryTable(...args) { return stockParts.purchasing.renderHistoryTable.apply(this, args); }

  function renderSuggestedOrder(...args) { return stockParts.purchasing.renderSuggestedOrder.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 5 · Prévisions IA (Ultra)
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderForecast() {
    const unlocked = isFusion() || window.KiwiVenue?.getPlan?.() === 'ultra';
    if (!unlocked) {
      return `
        <div class="st-section">
          <div class="st-locked">
            <div class="st-locked-inner">
              <div class="st-locked-ico">${svg('sparkles', 30)}</div>
              <div class="st-locked-t">${esc(t('lockedT'))}</div>
              <div class="st-locked-b">${esc(t('lockedB'))}</div>
              <button class="st-locked-cta" type="button" data-action="stock-upgrade-ultra">${esc(t('lockedCta'))}</button>
            </div>
          </div>
        </div>
      `;
    }

    // Unlocked but real → the demo forecast (chart, shortfalls, seasonality) is
    // all Café Atlas data; show an honest empty state instead.
    if (stShowReal()) {
      const c = ({
        /* No forecast is built for a real store yet. The old copy promised that
           « Kiwi AI anticipe vos ruptures » as soon as there was history. */
        fr: { h: 'Pas encore de prévisions', p: 'Kiwi ne calcule pas encore de prévisions de stock. Les alertes de stock bas, elles, fonctionnent déjà : elles sont sur la vue d’ensemble, calculées sur vos niveaux de réappro.' },
        en: { h: 'No forecasts yet', p: 'Kiwi does not compute stock forecasts yet. Low-stock alerts already work: they are on the overview, based on your reorder levels.' },
        ar: { h: 'لا توجد توقعات بعد', p: 'لا يحسب Kiwi توقعات المخزون بعد. تنبيهات انخفاض المخزون تعمل بالفعل: تجدها في النظرة العامة، محسوبة على مستويات إعادة الطلب.' },
      })[(window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'] || { h: 'Your forecasts will show here', p: '' };
      return `<div class="st-section"><div style="padding:44px 24px;text-align:center;max-width:520px;margin:0 auto;">
        <div style="font-size:16px;font-weight:640;letter-spacing:-.01em;margin-bottom:8px;">${c.h}</div>
        <div style="font-size:13.5px;color:var(--n-500);line-height:1.6;">${c.p}</div></div></div>`;
    }

    return `
      <div class="st-section">
        <div class="st-section-head"><h3>${esc(t('fcTitle'))}</h3><span class="st-section-sub">${esc(t('fcSub'))}</span></div>
        <div class="st-fc-chart-wrap">${renderForecastChart()}</div>
      </div>

      <div class="st-section">
        <div class="st-section-head">
          <h3>${esc(t('fcShortfallsT'))}</h3>
          <span class="st-section-sub">${esc(t('fcShortfallsSub'))}</span>
        </div>
        <div class="st-shortfalls">
          ${renderShortfall('Menthe fraîche', 'mardi', '80 bottes', 'lundi')}
          ${renderShortfall('Lait entier', 'mercredi', '60 L', 'mardi')}
          ${renderShortfall('Œufs', 'jeudi', '200 unités', 'mercredi')}
          ${renderShortfall('Coca-Cola 33cl', 'vendredi', '240 bouteilles', 'jeudi')}
        </div>
      </div>

      <div class="st-section">
        <div class="st-section-head"><h3>Kiwi AI · saisonnalité &amp; événements</h3></div>
        ${renderAiCard(t('fcRamadanT'), t('fcRamadanB'), t('fcRamadanA'))}
        ${renderAiCard(t('fcWeekendT'), t('fcWeekendB'), t('fcWeekendA'))}
      </div>

      ${isFusion() ? `
        <div class="st-section">
          <div class="st-section-head"><h3>Procurement multi-sites</h3></div>
          ${renderAiCard(t('fcCrossT'), t('fcCrossB'), t('fcCrossA'))}
        </div>
      ` : ''}
    `;
  }

  function renderShortfall(name, when, qty, byWhen) {
    return `
      <div class="st-shortfall">
        <div class="st-shortfall-ico">${svg('alertTriangle', 16)}</div>
        <div class="st-shortfall-body">
          <div class="t">${esc(name)} · rupture prévue ${esc(when)}</div>
          <div class="s">commander ${esc(qty)} avant ${esc(byWhen)}</div>
        </div>
        <button data-activation=write class="st-btn primary" type="button" data-action="stock-program-shortfall" data-item-name="${esc(name)}">${esc(t('btnScheduleOrder'))}</button>
      </div>
    `;
  }

  function renderForecastChart() {
    // SVG line chart — 7 days, 5 items, scaled to height 220
    const days = [t('dayMon'), t('dayTue'), t('dayWed'), t('dayThu'), t('dayFri'), t('daySat'), t('daySun')];
    const series = [
      { name: 'Tajine kefta', color: '#16774F', data: [42, 48, 51, 47, 64, 78, 71] },
      { name: 'Tomates', color: '#6A6151', data: [28, 32, 30, 34, 41, 48, 38] },
      { name: 'Pain rond', color: '#BBB199', data: [62, 70, 68, 74, 92, 108, 86] },
      { name: 'Thé menthe', color: '#0E805C', data: [80, 88, 85, 92, 114, 132, 108] },
      { name: 'Lait entier', color: '#A8A49A', data: [18, 22, 20, 24, 30, 36, 28] },
    ];
    const W = 720, H = 220, PAD = { l: 36, r: 16, t: 12, b: 28 };
    const maxV = Math.max(...series.flatMap(s => s.data));
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const xAt = (i) => PAD.l + (i / (days.length - 1)) * innerW;
    const yAt = (v) => PAD.t + innerH - (v / maxV) * innerH;
    const gridY = [0, 0.25, 0.5, 0.75, 1].map(p => {
      const y = PAD.t + innerH - p * innerH;
      return `<line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" /><text x="${PAD.l - 8}" y="${y + 3}" text-anchor="end" font-size="9">${Math.round(p * maxV)}</text>`;
    }).join('');
    const xLabels = days.map((d, i) => `<text x="${xAt(i)}" y="${H - 6}" text-anchor="middle" font-size="10">${esc(d.slice(0, 3))}</text>`).join('');
    const lines = series.map(s => {
      const path = s.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
      return `<path class="line" d="${path}" stroke="${s.color}" />`;
    }).join('');
    const legend = series.map(s => `<div class="st-fc-leg"><span class="lk" style="background:${s.color};"></span>${esc(s.name)}</div>`).join('');
    return `
      <svg class="st-fc-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Forecast chart">
        <g class="grid">${gridY}</g>
        <g class="axis">${xLabels}</g>
        ${lines}
      </svg>
      <div class="st-fc-legend">${legend}</div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Quick Order
   * ═══════════════════════════════════════════════════════════════════════ */
  /* « Commande envoyée à X · WhatsApp confirmé · livraison prévue demain 08h »
   * was a toast and nothing else: no message left, nothing was recorded, and
   * the modal offered an « Express · 6h · +120 MAD » fee no supplier had ever
   * quoted. Kiwi does not deliver orders to suppliers. It prepares the message
   * and opens WhatsApp on the supplier's own number; the merchant sends it.
   * With no number on file, the order is copied for any other channel. */
  function openQuickOrder(...args) { return stockParts.purchasing.openQuickOrder.apply(this, args); }
  const QO_COPY = {
    fr: {
      noSupplier: 'Aucun fournisseur enregistré', notePh: 'Ex. livraison avant 11h, entrée arrière',
      costLabel: 'COÛT ESTIMÉ (prix d’achat × quantité)', noCost: 'prix d’achat non renseigné',
      sendWa: 'Ouvrir WhatsApp', copy: 'Copier la commande',
      howWa: (n) => `Kiwi prépare le message et ouvre WhatsApp sur le numéro de ${n}. C’est vous qui l’envoyez.`,
      howNoPhone: (n) => `${n} n’a pas de numéro enregistré : la commande est copiée, collez-la où vous voulez. Ajoutez son numéro pour passer par WhatsApp.`,
      howNoSupplier: 'Aucun fournisseur : la commande est copiée. Ajoutez vos fournisseurs dans l’onglet Fournisseurs.',
      message: (sup, q, unit, name, note) => `Bonjour${sup ? ' ' + sup : ''}, je voudrais commander ${q} ${unit} de ${name}.${note ? ' ' + note : ''} Merci.`,
      toastWa: (n) => `WhatsApp ouvert pour ${n}`, toastWaDesc: 'Le message est prêt. Il part quand vous l’envoyez dans WhatsApp.',
      toastCopied: 'Commande copiée', toastCopyFail: 'Copie impossible, voici la commande',
      poSaved: (n) => `Bon ${n} enregistré en brouillon dans Commandes.`,
    },
    en: {
      noSupplier: 'No supplier on file', notePh: 'E.g. deliver before 11am, back entrance',
      costLabel: 'ESTIMATED COST (purchase price × quantity)', noCost: 'purchase price not set',
      sendWa: 'Open WhatsApp', copy: 'Copy the order',
      howWa: (n) => `Kiwi drafts the message and opens WhatsApp on ${n}’s number. You send it.`,
      howNoPhone: (n) => `${n} has no number on file: the order is copied, paste it anywhere. Add their number to use WhatsApp.`,
      howNoSupplier: 'No supplier: the order is copied. Add your suppliers in the Suppliers tab.',
      message: (sup, q, unit, name, note) => `Hello${sup ? ' ' + sup : ''}, I would like to order ${q} ${unit} of ${name}.${note ? ' ' + note : ''} Thank you.`,
      toastWa: (n) => `WhatsApp opened for ${n}`, toastWaDesc: 'The message is ready. It goes when you send it in WhatsApp.',
      toastCopied: 'Order copied', toastCopyFail: 'Could not copy, here is the order',
      poSaved: (n) => `Order ${n} saved as a draft in Orders.`,
    },
    ar: {
      noSupplier: 'لا يوجد مورد مسجل', notePh: 'مثال: التسليم قبل 11 صباحًا، الباب الخلفي',
      costLabel: 'التكلفة التقديرية (سعر الشراء × الكمية)', noCost: 'سعر الشراء غير محدد',
      sendWa: 'فتح واتساب', copy: 'نسخ الطلبية',
      howWa: (n) => `يحضّر Kiwi الرسالة ويفتح واتساب على رقم ${n}. أنت من يرسلها.`,
      howNoPhone: (n) => `لا يوجد رقم لـ ${n}: تم نسخ الطلبية، الصقها حيث تشاء. أضف رقمه لاستعمال واتساب.`,
      howNoSupplier: 'لا يوجد مورد: تم نسخ الطلبية. أضف مورديك في تبويب الموردين.',
      message: (sup, q, unit, name, note) => `مرحبًا${sup ? ' ' + sup : ''}، أود طلب ${q} ${unit} من ${name}.${note ? ' ' + note : ''} شكرًا.`,
      toastWa: (n) => `تم فتح واتساب لـ ${n}`, toastWaDesc: 'الرسالة جاهزة. تُرسل عندما ترسلها في واتساب.',
      toastCopied: 'تم نسخ الطلبية', toastCopyFail: 'تعذر النسخ، هذه هي الطلبية',
      poSaved: (n) => `حُفظ الطلب ${n} كمسودة في الطلبيات.`,
    },
  };

  const PICK_COPY = {
    fr: { title: 'Nouvelle commande', intro: 'Choisissez l’article à commander. Les plus bas en stock sont en premier.', empty: 'Aucun article en stock pour l’instant.', stock: 'en stock' },
    en: { title: 'New order', intro: 'Pick the item to order. Lowest stock first.', empty: 'No stock items yet.', stock: 'in stock' },
    ar: { title: 'طلبية جديدة', intro: 'اختر المادة المراد طلبها. الأقل مخزونًا أولًا.', empty: 'لا توجد مواد في المخزون بعد.', stock: 'في المخزون' },
  };
  function openOrderPicker(...args) { return stockParts.purchasing.openOrderPicker.apply(this, args); }
  /* Where the store keeps purchase orders (retail, Ultra), the quick order is
   * recorded as a draft BC: it shows in « Commandes » and is received against
   * later. It stays a draft: Kiwi cannot know the WhatsApp message left. */
  function recordQuickOrder(...args) { return stockParts.purchasing.recordQuickOrder.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * EXTRACTION & MATCHING FACTURES FOURNISSEUR
   * ═══════════════════════════════════════════════════════════════════════ */
  function normalizeMatchStr(...args) { return stockParts.intake.normalizeMatchStr.apply(this, args); }

  function tokenizeMatchStr(...args) { return stockParts.intake.tokenizeMatchStr.apply(this, args); }

  function tokenOverlapScore(...args) { return stockParts.intake.tokenOverlapScore.apply(this, args); }

  function matchInvoiceLines(...args) { return stockParts.intake.matchInvoiceLines.apply(this, args); }

  function compareLineCost(...args) { return stockParts.intake.compareLineCost.apply(this, args); }

  let _pdfjsPromise = null;
  function loadPdfJs(...args) { return stockParts.intake.loadPdfJs.apply(this, args); }

  function extractPdfText(...args) { return stockParts.intake.extractPdfText.apply(this, args); }

  /* ── Guichet unique, slice 1 (facture PDF) — derrière fanion ────────────
   * Fanion : ?intake=1 ou localStorage kiwiIntake1=1. Éteint = comportement
   * historique à l'octet près. Le pré-filtre identité tourne sur le texte
   * pdf.js AVANT tout upload et tout appel modèle (sign-off : pré-filtre
   * exigé avant expédition) ; l'empreinte SHA-256 est l'identifiant du
   * document (re-dépôt = même id, jamais de doublon silencieux). */

  /* Entretien des cartes fournisseur d'un article (surcouche locale).
   * Convergent : retrouver une carte existante par nom, sinon créer avec un
   * id fourni (déterministe sur le chemin guichet) ou historique sinon.
   * Ne poste JAMAIS de mouvement — le propriétaire des mouvements est
   * l'appelant. Extraite du flux de confirmation, comportement identique. */
  function stUpsertSupplierCard(...args) { return stockParts.intake.stUpsertSupplierCard.apply(this, args); }

  /* Empreinte du brouillon RELU, distincte du hash du PDF. L'ordre des lignes
   * est volontairement significatif puisque les ids de mouvement portent
   * l'index : une reprise réordonnée doit être refusée avant toute écriture,
   * jamais mêlée silencieusement à la tentative précédente. */
  function stIntakePostingLines(...args) { return stockParts.intake.stIntakePostingLines.apply(this, args); }
  function stIntakePostingCanonical(...args) { return stockParts.intake.stIntakePostingCanonical.apply(this, args); }
  function stIntakePostingFingerprint(...args) { return stockParts.intake.stIntakePostingFingerprint.apply(this, args); }
  function stIntakePrepare(...args) { return stockParts.intake.stIntakePrepare.apply(this, args); }

  /* ── Guichet unique : le SEUL propriétaire des écritures d'un dépôt ──────
   * Reçoit des données pures (aucun DOM), écrit : ligne comptable
   * (upsert déterministe), mouvements (ids déterministes, registre
   * déduplique), coûts (cases à cocher), facture (upsert déterministe).
   * Chaque couche converge : rejouer après N'IMPORTE QUELLE interruption
   * (y compris entre deux lignes) produit exactement le même état.
   * Dépend uniquement de window.* — exécutable en test sur le vrai code. */
  function stIntakePostAll(...args) { return stockParts.intake.stIntakePostAll.apply(this, args); }
  function stIntakeEnabled(...args) { return stockParts.intake.stIntakeEnabled.apply(this, args); }
  function stIntakeIdHint(...args) { return stockParts.intake.stIntakeIdHint.apply(this, args); }
  function stIntakeMrzZone(...args) { return stockParts.intake.stIntakeMrzZone.apply(this, args); }
  /* FNV-1a 32 bits → hex : empreinte courte stable pour dériver des ids
   * déterministes (ce n'est PAS un identifiant de sécurité, cf. SHA-256
   * côté registre). Pure, testée. */
  function stIntakeHash(...args) { return stockParts.intake.stIntakeHash.apply(this, args); }
  /* Ids primaires d'un dépôt — contrat d'idempotence inter-marchands.
   * `inventory_movements.id` est GLOBALEMENT unique : sans le marchand dans
   * l'empreinte, deux marchands traitant le même PDF partageraient les ids —
   * le second INSERT serait ignoré puis faussement acquitté. Ici :
   * SHA-256(marchand + docId + index). Le `merchant` est celui qui possédera
   * le mouvement (registre local, même valeur que la synchro enverra) ; le
   * serveur refuse en plus un id pris par un autre (409 id-conflict).
   * Les ids comptables (réception/facture) restent doc-scopés : leurs
   * magasins sont par-marchand, seule la table des mouvements est globale.
   * Async (SubtleCrypto) ; échoue fermé sans marchand ni crypto. */
  function stIntakePostingIds(...args) { return stockParts.intake.stIntakePostingIds.apply(this, args); }
  function stIntakeSupplierId(...args) { return stockParts.intake.stIntakeSupplierId.apply(this, args); }
  function stSha256Hex(...args) { return stockParts.intake.stSha256Hex.apply(this, args); }
  function stIntakeMerchant(...args) { return stockParts.intake.stIntakeMerchant.apply(this, args); }
  function stIntakeCommit(...args) { return stockParts.intake.stIntakeCommit.apply(this, args); }
  function stIntakeUpload(...args) { return stockParts.intake.stIntakeUpload.apply(this, args); }
  function stIntakeOutboxKey(...args) { return stockParts.intake.stIntakeOutboxKey.apply(this, args); }
  function stIntakeOutboxRead(...args) { return stockParts.intake.stIntakeOutboxRead.apply(this, args); }
  function stIntakeOutboxWrite(...args) { return stockParts.intake.stIntakeOutboxWrite.apply(this, args); }
  function stIntakePostedKey(...args) { return stockParts.intake.stIntakePostedKey.apply(this, args); }
  function stIntakePostedHas(...args) { return stockParts.intake.stIntakePostedHas.apply(this, args); }
  function stIntakePostedAdd(...args) { return stockParts.intake.stIntakePostedAdd.apply(this, args); }
  /* Garde pure : un docId déjà posté ici, ou déjà confirmé côté serveur
   * (deuxième appareil), ne reposte jamais le stock. Testée. */
  function stIntakePostGuard(...args) { return stockParts.intake.stIntakePostGuard.apply(this, args); }
  function stIntakeServerStatus(...args) { return stockParts.intake.stIntakeServerStatus.apply(this, args); }
  /* Une seule tentative de marquage, outbox tenue à jour. L'outbox ne
   * contient que des « stock déjà posté, marquage en attente » : la rejouer
   * ne reposte jamais le stock, elle ne renvoie que le marquage. */
  function stIntakeMarkOnce(...args) { return stockParts.intake.stIntakeMarkOnce.apply(this, args); }
  function stIntakeFlushOutbox(...args) { return stockParts.intake.stIntakeFlushOutbox.apply(this, args); }
  function stRenderIntakeStop(...args) { return stockParts.intake.stRenderIntakeStop.apply(this, args); }
  function wireIntakeStop(...args) { return stockParts.intake.wireIntakeStop.apply(this, args); }

  /* ── Conflit de reprise (409 posting-conflict) ──────────────────────────
   * Un premier envoi a figé une empreinte différente : la tentative en cours
   * n'a RIEN écrit (le prepare précède réception, mouvements, coûts et
   * facture) et ne doit rien écrire. On montre ce qui diffère — jamais le
   * hash du document ni l'empreinte figée — avec pour seules issues : fermer,
   * revenir à la relecture, voir l'historique de l'article (workflow
   * existant via data-action="stock-item-detail"). Ni reset, ni écrasement,
   * ni contre-passation, ni republication, ni suppression, ni « continuer ».
   * Stash DOM : les nœuds de la relecture sont mis de côté (valeurs saisies
   * et écouteurs intacts, aucun réaffichage) puis restaurés au retour. */
  let stConflictStash = null;
  function stIntakeFetchRecorded(...args) { return stockParts.intake.stIntakeFetchRecorded.apply(this, args); }
  function stIntakeCompareConflict(...args) { return stockParts.intake.stIntakeCompareConflict.apply(this, args); }
  function stRenderIntakeConflict(...args) { return stockParts.intake.stRenderIntakeConflict.apply(this, args); }
  function stShowIntakeConflict(...args) { return stockParts.intake.stShowIntakeConflict.apply(this, args); }
  function stHandleIntakePostingConflict(...args) { return stockParts.intake.stHandleIntakePostingConflict.apply(this, args); }
  function stRestoreIntakeReview(...args) { return stockParts.intake.stRestoreIntakeReview.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Scan invoice
   * ═══════════════════════════════════════════════════════════════════════ */
  function openInvoiceScan(...args) { return stockParts.intake.openInvoiceScan.apply(this, args); }

  function renderScanStage1(...args) { return stockParts.intake.renderScanStage1.apply(this, args); }

  function wireScanStage1(...args) { return stockParts.intake.wireScanStage1.apply(this, args); }

  /* ── Coffre des pièces déposées (lecture seule) ─────────────────────────
   * Liste paginée des métadonnées + visionneuse PDF authentifiée (cookie de
   * session). N'invente ni fournisseur ni montant : D1 ne retient que le
   * type, la date, le statut, la taille et l'identifiant raccourci. Aucune
   * mention « archivé » sans hasObject. Mise en page fluide (aucune largeur
   * fixe) : 320 px comme desktop, sens de lecture hérité de la page. */
  function stArchiveUrl(...args) { return stockParts.intake.stArchiveUrl.apply(this, args); }
  function stIntakeArchiveList(...args) { return stockParts.intake.stIntakeArchiveList.apply(this, args); }
  function stFmtSize(...args) { return stockParts.intake.stFmtSize.apply(this, args); }
  function stFmtArcDate(...args) { return stockParts.intake.stFmtArcDate.apply(this, args); }
  function stArcTypeLabel(...args) { return stockParts.intake.stArcTypeLabel.apply(this, args); }
  function stArcStatusLabel(...args) { return stockParts.intake.stArcStatusLabel.apply(this, args); }
  function renderScanArchive(...args) { return stockParts.intake.renderScanArchive.apply(this, args); }
  function openScanArchive(...args) { return stockParts.intake.openScanArchive.apply(this, args); }

  function renderScanReview(...args) { return stockParts.intake.renderScanReview.apply(this, args); }

  function renderRealReceiptReview(...args) { return stockParts.intake.renderRealReceiptReview.apply(this, args); }

  /* Chemin historique (hors guichet) : UN SEUL propriétaire des mouvements.
   * La boucle moveStock du handler reste l'unique écrivain ; receiveDirect ne
   * fait que la pièce comptable (skipMovements) et n'applique aucun coût
   * (skipCosts — la case à cocher du handler reste seule décisionnaire).
   * Reçoit des données pures + le catalogue résolu ; testable en vm. */
  function stLegacyPostAll(...args) { return stockParts.intake.stLegacyPostAll.apply(this, args); }

  /* Garde anti double-clic du bouton de confirmation : le premier appui
   * pose le fanion et désactive le bouton ; tout appui concurrent est jeté.
   * Libérer (stReleaseConfirmBusy) sur chaque échec récupérable ; le succès
   * ferme la modale, le bouton disparaît avec elle. */
  function stClaimConfirmBusy(...args) { return stockParts.intake.stClaimConfirmBusy.apply(this, args); }
  function stReleaseConfirmBusy(...args) { return stockParts.intake.stReleaseConfirmBusy.apply(this, args); }

  function wireScanReview(...args) { return stockParts.intake.wireScanReview.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Physical count
   * ═══════════════════════════════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════════════════════════════
   * Guide d'inventaire — cause probable, historique, feuille imprimable
   * ═══════════════════════════════════════════════════════════════════════ */
  /* Cause probable d'un écart de comptage. Fonction pure : l'ordre des règles
   * est un choix métier — un signal enregistré (pertes déclarées, livraison
   * récente) explique mieux qu'une heuristique de catégorie, donc il passe
   * avant. `moves` vient du registre (7 derniers jours, hors 'count'). */
  function stCountReason(...args) { return stockParts.counts.stCountReason.apply(this, args); }
  /* Mouvements récents d'un article, pour nourrir stCountReason. Registre réel
   * uniquement : les fixtures démo n'ont pas d'historique de mouvements. */
  function stRecentMoves(...args) { return stockParts.counts.stRecentMoves.apply(this, args); }
  /* Historique des inventaires validés — même portée tenant que l'overlay
   * stock (compte réel = slug cloud, sinon venue id). Plafonné : c'est un
   * journal de tendance, pas une base ; le registre reste la vérité. */
  const stCountHistKey = () => 'kiwi:inventoryCounts:v1:' + stOverlayScope();
  function stCountHistory(...args) { return stockParts.counts.stCountHistory.apply(this, args); }
  function stSaveCountHistory(...args) { return stockParts.counts.stSaveCountHistory.apply(this, args); }
  const stCountDate = (ts) => {
    try {
      const loc = lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-FR';
      return new Date(ts).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (_) { return new Date(ts).toLocaleDateString(); }
  };

  /* Feuille d'inventaire papier. À l'aveugle par défaut : sans la colonne
   * théorique, le compteur note ce qu'il voit au lieu de confirmer le chiffre
   * attendu. Impression via iframe caché (même motif qu'operational-print). */
  function stSheetHtml(...args) { return stockParts.counts.stSheetHtml.apply(this, args); }
  function printCountSheet(...args) { return stockParts.counts.printCountSheet.apply(this, args); }
  function openCountSheet(...args) { return stockParts.counts.openCountSheet.apply(this, args); }
  /* Revue des écarts avant application. Seul chemin d'écriture : countStock →
   * moveStock → registre. Rien ne bouge tant que le propriétaire n'a pas vu
   * chaque écart, sa valeur en MAD et sa cause probable. */
  function openCountReview(...args) { return stockParts.counts.openCountReview.apply(this, args); }

  function openPhysicalCount(...args) { return stockParts.counts.openPhysicalCount.apply(this, args); }

  function wirePhysicalCount(...args) { return stockParts.counts.wirePhysicalCount.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Supplier profile
   * ═══════════════════════════════════════════════════════════════════════ */
  function openSupplierProfile(...args) { return stockParts.purchasing.openSupplierProfile.apply(this, args); }

  function renderMiniPriceChart(...args) { return stockParts.purchasing.renderMiniPriceChart.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Item detail
   * ═══════════════════════════════════════════════════════════════════════ */
  function movementLabel(...args) { return stockParts.catalog.movementLabel.apply(this, args); }
  function itemHistory(...args) { return stockParts.catalog.itemHistory.apply(this, args); }
  function renderRealItemMovementSummary(...args) { return stockParts.catalog.renderRealItemMovementSummary.apply(this, args); }
  function swapSupplierRanks(...args) { return stockParts.catalog.swapSupplierRanks.apply(this, args); }

  function renderRealItemHistory(...args) { return stockParts.catalog.renderRealItemHistory.apply(this, args); }
  function openAddBackupSupplier(...args) { return stockParts.catalog.openAddBackupSupplier.apply(this, args); }

  function openItemMovement(...args) { return stockParts.catalog.openItemMovement.apply(this, args); }
  function openItemDetail(...args) { return stockParts.catalog.openItemDetail.apply(this, args); }

  function renderItemUsageChart(...args) { return stockParts.catalog.renderItemUsageChart.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Add / Edit item
   * Shared form. existingId === null → add, otherwise edit overlay.
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderCatOptions(...args) { return stockParts.catalog.renderCatOptions.apply(this, args); }
  function renderSupOptions(...args) { return stockParts.catalog.renderSupOptions.apply(this, args); }
  /* Return the modal container of the most-recently-opened backdrop,
   * so multiple stacked modals don't collide on the selectors above. */
  function topBackdrop(...args) { return stockParts.catalog.topBackdrop.apply(this, args); }
  /* Wire the [data-dismiss-modal] cancel buttons inside this scope to close
   * the modal — interactive.js doesn't bind these globally. */
  function wireDismiss(...args) { return stockParts.catalog.wireDismiss.apply(this, args); }
  /* Properly close the top stock modal so unlockPageScroll() runs. The bug
   * fix for the scroll-lock leak: direct `.kiwi-backdrop?.remove()` skips
   * the modal helper's close handler — counter stays > 0, html.kiwi-locked
   * stays on, page won't scroll until reload. Click the wired X instead. */
  function closeTopModal(...args) { return stockParts.catalog.closeTopModal.apply(this, args); }
  function wireCatNewToggle(...args) { return stockParts.catalog.wireCatNewToggle.apply(this, args); }
  const nutritionKeys = ['kcal', 'protein', 'carbs', 'fat', 'sugars', 'salt'];
  const allergenKeys = () => window.KiwiMenuNutrition?.ALLERGEN_KEYS || [
    'gluten', 'crustaces', 'oeufs', 'poissons', 'arachides', 'soja', 'lait',
    'fruits_a_coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques',
  ];
  let ciqualPromise = null;
  function loadCiqual(...args) { return stockParts.catalog.loadCiqual.apply(this, args); }
  function searchKey(...args) { return stockParts.catalog.searchKey.apply(this, args); }
  function nutrientLabel(...args) { return stockParts.catalog.nutrientLabel.apply(this, args); }
  function nutrientSection(...args) { return stockParts.catalog.nutrientSection.apply(this, args); }
  function wireNutrition(...args) { return stockParts.catalog.wireNutrition.apply(this, args); }
  function readNutrition(...args) { return stockParts.catalog.readNutrition.apply(this, args); }
  function openAddItem(...args) { return stockParts.catalog.openAddItem.apply(this, args); }
  function openEditItem(...args) { return stockParts.catalog.openEditItem.apply(this, args); }
  /* ── Article de stock · création et modification ──────────────────────────
   * 2026-10-12, what this form replaced:
   *  · a new article saved with « Stock actuel » left empty was written with
   *    its PAR LEVEL as stock, and that invented quantity went to the ledger
   *    as the opening balance (KiwiInventory.ensureOpening);
   *  · an empty « Niveau de réappro » became 40 % of the par level without a
   *    word on screen (the rule stays, the form now says it);
   *  · numbers went through parseFloat, so « 2,5 » kg was stored as 2;
   *  · the first supplier was silently picked for every new article (no empty
   *    option), and « + Nouvelle catégorie… » left unconfirmed saved the
   *    article under « Légumes »;
   *  · the « Nom de la catégorie / Confirmer » row was always visible (inline
   *    display:none followed by display:flex), the unit and the third number
   *    were cut off on a phone, and an empty name only moved the focus. */
  function stItemNum(...args) { return stockParts.catalog.stItemNum.apply(this, args); }
  function stItemVal(...args) { return stockParts.catalog.stItemVal.apply(this, args); }
  function stItemCss(...args) { return stockParts.catalog.stItemCss.apply(this, args); }
  /* Le niveau de réappro, mesuré. Sous ce qu'on consomme entre deux
     livraisons, le stock ne tient plus jusqu'à la suivante. Il faut les deux
     mesures : la consommation réelle de la semaine (usageThisWeek) et au
     moins trois livraisons enregistrées au registre, soit deux intervalles ;
     sinon rien n'est proposé. Le chiffre n'est qu'une proposition : il
     n'entre dans le champ que si le commerçant clique. */
  function reorderFromHistory(...args) { return stockParts.catalog.reorderFromHistory.apply(this, args); }
  function reorderSuggestionFor(...args) { return stockParts.catalog.reorderSuggestionFor.apply(this, args); }
  function openItemForm(...args) { return stockParts.catalog.openItemForm.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Confirm delete item
   * ═══════════════════════════════════════════════════════════════════════ */
  function confirmDeleteItem(...args) { return stockParts.catalog.confirmDeleteItem.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Add / Edit supplier
   * ═══════════════════════════════════════════════════════════════════════ */
  function openAddSupplier(...args) { return stockParts.purchasing.openAddSupplier.apply(this, args); }
  function openEditSupplier(...args) { return stockParts.purchasing.openEditSupplier.apply(this, args); }
  function openSupplierForm(...args) { return stockParts.purchasing.openSupplierForm.apply(this, args); }

  function confirmDeleteSupplier(...args) { return stockParts.purchasing.confirmDeleteSupplier.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Add category (from cat-pill row)
   * ═══════════════════════════════════════════════════════════════════════ */
  function openAddCategory(...args) { return stockParts.catalog.openAddCategory.apply(this, args); }

  function openManageCategory(...args) { return stockParts.catalog.openManageCategory.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Day deliveries detail
   * ═══════════════════════════════════════════════════════════════════════ */
  function openDayDetail(...args) { return stockParts.overview.openDayDetail.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * Send suggested order
   * ═══════════════════════════════════════════════════════════════════════ */
  function sendSuggestedOrder(...args) { return stockParts.purchasing.sendSuggestedOrder.apply(this, args); }

  /* ═══════════════════════════════════════════════════════════════════════
   * Handler registration
   * ═══════════════════════════════════════════════════════════════════════ */
  function registerHandlers() {
    if (!window.Kiwi?.handlers) return setTimeout(registerHandlers, 60);
    const H = window.Kiwi.handlers;

    H['nav-stock'] = () => showPage();
    const origAccueil = H['nav-accueil'];
    H['nav-accueil'] = function () { showDashboard(); return origAccueil?.call(this); };

    // Tabs / filters / view
    H['stock-workspace-actions']=()=>{
      const actions=[['stock-scan-invoice',t('btnScan')],['stock-count-sheet',t('btnSheet')],['stock-physical-count',t('btnCount')]];
      const m=window.Kiwi.modal({title:catalogText('stockActions','Outils du stock'),width:480,body:`<div class="catalog-sheet">${actions.map(([action,label])=>`<button type="button" data-catalog-stock="${action}">${esc(label)}</button>`).join('')}</div>`});
      m.el.querySelectorAll('[data-catalog-stock]').forEach(button=>button.onclick=()=>{m.close();H[button.dataset.catalogStock]?.(button);});
    };
    H['stock-tab'] = (el) => { stCurrentTab = el.dataset.tab; render(); };
    H['stock-subview'] = (el) => { stItemSubView = el.dataset.subview; render(); };
    H['stock-waste-range'] = (el) => { stWasteDateRange = el.dataset.range; rerenderTabBody(); };
    H['stock-waste-reason'] = (el) => { stWasteFilterReason = el.dataset.reason; rerenderTabBody(); };
    H['stock-open-declare-waste'] = () => openDeclareWasteModal();
    H['stock-declare-waste-prefill'] = (el) => openDeclareWasteModal({ itemId: el.dataset.itemId, qty: parseFloat(el.dataset.qty) || 1, reason: el.dataset.reason });
    H['stock-modal-close'] = () => closeTopModal();
    H['stock-export-waste-csv'] = () => exportWasteCsv();
    H['stock-cancel-waste'] = (el) => cancelWasteMovement(el.dataset.movementId);
    H['stock-count-range'] = (el) => { stCountDateFilter = el.dataset.range; rerenderTabBody(); };
    H['stock-count-status'] = (el) => { stCountStatusFilter = el.dataset.status; rerenderTabBody(); };
    H['stock-count-tab'] = (el) => { stCountSubTab = el.dataset.tab; rerenderTabBody(); };
    H['stock-count-detail'] = (el) => openCountDetailModal(el.dataset.countId);
    H['stock-export-counts-csv'] = () => exportCountsCsv();
    H['stock-venue-filter'] = (el) => { stVenueFilter = el.dataset.venue; render(); };
    H['stock-cat-filter'] = (el) => { stCatFilter = el.dataset.cat; rerenderTabBody(); };
    H['stock-status-filter'] = (el) => { stStatusFilter = el.dataset.status; rerenderTabBody(); };
    H['stock-view'] = (el) => { stItemView = el.dataset.view; rerenderTabBody(); };
    H['stock-sort'] = (el) => {
      const key = el.dataset.sort;
      if (stSortBy === key) stSortDir = stSortDir === 'asc' ? 'desc' : 'asc';
      else { stSortBy = key; stSortDir = 'asc'; }
      rerenderTabBody();
    };

    // Header actions
    H['stock-scan-invoice'] = () => openInvoiceScan();
    H['stock-physical-count'] = () => openPhysicalCount();
    H['stock-count-sheet'] = () => openCountSheet();
    H['stock-add-item'] = () => openAddItem();

    // Item actions
    H['stock-item-detail'] = (el) => openItemDetail(el.dataset.itemId);
    H['stock-edit-item'] = (el) => openEditItem(el.dataset.itemId);
    H['stock-delete-item'] = (el) => confirmDeleteItem(el.dataset.itemId);
    // "More" icon → open detail modal (which now has Modifier / Supprimer reachable from the footer).
    H['stock-item-more'] = (el) => openItemDetail(el.dataset.itemId);
    H['stock-reorder'] = (el) => openQuickOrder(el.dataset.itemId);
    H['stock-urgent-order'] = (el) => openQuickOrder(el.dataset.itemId, { urgent: true });
    H['stock-mark-86'] = (el) => openMark86(el.dataset.itemName);
    H['stock-ignore-24h'] = (el) => {
      ignoreAlert(el.dataset.itemName);
      window.Kiwi.toast(IGNORE_TOAST[lang()]?.(el.dataset.itemName) || IGNORE_TOAST.fr(el.dataset.itemName), { type: 'info' });
      rerenderTabBody();
    };
    // Category pill add
    H['stock-add-cat'] = () => openAddCategory();
    H['stock-manage-cat'] = (el) => openManageCategory(el.dataset.cat);

    function isPhone(v) { return /^\+?[\d\s.-]{8,}$/.test(String(v || '').trim()); }
    function phoneDigits(v) {
      const d = String(v || '').replace(/\D/g, '');
      return String(v || '').trim().startsWith('+') ? '+' + d : d;
    }
    function waDigits(v) {
      let d = String(v || '').replace(/\D/g, '');
      if (/^0[67]\d{8}$/.test(d)) d = '212' + d.slice(1);
      return d;
    }

    // Supplier actions
    H['stock-supplier-detail'] = (el) => openSupplierProfile(el.dataset.supplierId);
    H['stock-call-supplier'] = (el) => {
      const contact = (el.dataset.phone || '').trim();
      const name = (el.dataset.name || '').trim();
      const supId = el.dataset.supplierId;
      if (isPhone(contact)) {
        location.href = 'tel:' + phoneDigits(contact);
      } else {
        window.Kiwi.toast('Pas de numéro · modifiez le fournisseur', { type: 'warn' });
        const sup = getSup().find(s => s.id === supId || s.name === name);
        if (sup) openEditSupplier(sup.id);
      }
    };
    H['stock-wa-supplier'] = (el) => {
      const contact = (el.dataset.phone || '').trim();
      const name = (el.dataset.name || '').trim();
      const supId = el.dataset.supplierId;
      if (isPhone(contact)) {
        const text = `Bonjour ${name}, `;
        window.open(`https://wa.me/${waDigits(contact)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      } else {
        window.Kiwi.toast('Pas de numéro · modifiez le fournisseur', { type: 'warn' });
        const sup = getSup().find(s => s.id === supId || s.name === name);
        if (sup) openEditSupplier(sup.id);
      }
    };
    H['stock-new-po'] = (el) => openInvoiceScan({ supplierId: el.dataset.supplierId });
    H['stock-add-supplier'] = () => openAddSupplier();
    H['stock-edit-supplier'] = (el) => openEditSupplier(el.dataset.supplierId);
    H['stock-delete-supplier'] = (el) => confirmDeleteSupplier(el.dataset.supplierId);

    // Orders
    /* « + Nouvelle commande » answered an info toast. It now asks which item,
       then opens the same quick order as the alert cards. */
    H['stock-new-order'] = () => openOrderPicker();
    H['stock-ord-detail'] = (el) => window.Kiwi.toast(t('ordDetailToast', el.dataset.orderId), { type: 'info', desc: t('ordDetailDesc') });
    H['stock-ord-edit'] = (el) => window.Kiwi.toast(t('ordEditToast', el.dataset.orderId), { type: 'info' });
    H['stock-ord-cancel'] = (el) => window.Kiwi.toast(t('ordCancelToast', el.dataset.orderId), { type: 'warn' });
    H['stock-ord-pause'] = (el) => window.Kiwi.toast(t('ordPauseToast', el.dataset.orderId), { type: 'info' });
    H['stock-ord-track'] = (el) => window.Kiwi.toast(`Suivi commande #${el.dataset.orderId} · livraison dans 6h`, { type: 'info' });
    H['stock-ord-contact'] = (el) => window.Kiwi.toast(`Contact fournisseur · commande #${el.dataset.orderId}`, { type: 'info' });
    H['stock-confirm-order'] = (el) => {
      stConfirmedOrders.add(el.dataset.orderId);
      window.Kiwi.toast(`Commande #${el.dataset.orderId} confirmée`, { type: 'success' });
      if (stCurrentTab === 'orders') rerenderTabBody();
    };
    H['stock-edit-suggested'] = () => window.Kiwi.toast('Édition de la commande suggérée', { type: 'info' });
    H['stock-send-suggested'] = () => sendSuggestedOrder();

    // Forecast
    H['stock-program-shortfall'] = (el) => window.Kiwi.toast(`Commande programmée · ${el.dataset.itemName}`, { type: 'success' });
    /* No subscription price inside the iOS app (App Review 3.1.1): the CTA is
       hidden there and the handler stays silent if anything still calls it. */
    H['stock-upgrade-ultra'] = () => {
      if (document.documentElement.classList.contains('kiwi-native')) return;
      window.Kiwi.toast('Kiwi Ultra · 1 499 MAD/mois · multi-pays, AI procurement, account manager', { type: 'info', duration: 4500 });
    };

    // Calendar
    H['stock-day-detail'] = (el) => openDayDetail(el.dataset.day, el.dataset.dayName);

    Object.keys(H).filter(name => name === 'nav-stock' || name.startsWith('stock-'))
      .forEach(name => { H[name] = stockHandler(H[name]); });

    // Re-render on venue/language changes
    window.KiwiVenue?.subscribe?.(() => { if (stPageActive) render(); });
    window.addEventListener('kiwi:langchange', () => { if (stPageActive) render(); });
    let stockSyncPaint = 0;
    const repaintFromSharedStock = () => {
      if (!stPageActive || stockSyncPaint) return;
      stockSyncPaint = setTimeout(() => { stockSyncPaint = 0; render(); }, 0);
    };
    window.KiwiInventory?.subscribe?.(repaintFromSharedStock);
    window.KiwiBoutiqueCatalog?.subscribe?.(repaintFromSharedStock);
    window.KiwiProcurement?.store?.subscribe?.(repaintFromSharedStock);
    window.addEventListener('storage', (e) => {
      if (e.key !== stOverlayKey()) return;
      stOverlayLoadedFor = null;
      repaintFromSharedStock();
    });
  }


  /* Pont interne unique : les accesseurs gardent les liaisons vivantes.
   * Les fonctions stables sont capturées par les parties ; les let restent ici. */
  const stockParts = Object.create(null);
  const stockScope = {
    get stockMovements() { return stockParts.movements; },
    stockState,
    get IGNORE_KEY() { return IGNORE_KEY; },
    get M86_COPY() { return M86_COPY; },
    get TIER_LOW() { return TIER_LOW; },
    get actualLastDelivery() { return actualLastDelivery; },
    get currentVenueId() { return currentVenueId; },
    get foodCostMonth() { return foodCostMonth; },
    get isAlertIgnored() { return isAlertIgnored; },
    get isFusion() { return isFusion; },
    get monthlyRevenue() { return monthlyRevenue; },
    get overviewAlertRows() { return overviewAlertRows; },
    get renderAlertCard() { return renderAlertCard; },
    get stMarked86() { return stMarked86; },
    get stockBusinessDateDate() { return stockBusinessDateDate; },
    get stockCalendarDates() { return stockCalendarDates; },
    get totalValue() { return totalValue; },
    get weeklyRevenue() { return weeklyRevenue; },
    get STR() { return STR; },
    get lang() { return lang; },
    get t() { return t; },
    get catalogText() { return catalogText; },
    get catalogLabel() { return catalogLabel; },
    get stCatFilter() { return stCatFilter; }, set stCatFilter(value) { stCatFilter = value; },
    get stItemSubView() { return stItemSubView; }, set stItemSubView(value) { stItemSubView = value; },
    get stWasteFilterReason() { return stWasteFilterReason; }, set stWasteFilterReason(value) { stWasteFilterReason = value; },
    get stWasteDateRange() { return stWasteDateRange; }, set stWasteDateRange(value) { stWasteDateRange = value; },
    get stWasteSearch() { return stWasteSearch; }, set stWasteSearch(value) { stWasteSearch = value; },
    get stCountSubTab() { return stCountSubTab; }, set stCountSubTab(value) { stCountSubTab = value; },
    get stCountStatusFilter() { return stCountStatusFilter; }, set stCountStatusFilter(value) { stCountStatusFilter = value; },
    get stCountDateFilter() { return stCountDateFilter; }, set stCountDateFilter(value) { stCountDateFilter = value; },
    get stCountSearch() { return stCountSearch; }, set stCountSearch(value) { stCountSearch = value; },
    get stCountsCache() { return stockState.counts(); }, set stCountsCache(value) { stockState.replaceCounts(value); },
    get stCountsLastFetched() { return stockState.countsFetchedAt(); }, set stCountsLastFetched(value) { stockState.markCountsFetched(value); },
    get stStockOverrides() { return stStockOverrides; },
    get stConfirmedOrders() { return stConfirmedOrders; },
    get stPageActive() { return stPageActive; }, set stPageActive(value) { stPageActive = value; },
    get stUserItems() { return stUserItems; }, set stUserItems(value) { stUserItems = value; },
    get stItemOverrides() { return stItemOverrides; },
    get stDeletedItems() { return stDeletedItems; },
    get stUserSuppliers() { return stUserSuppliers; }, set stUserSuppliers(value) { stUserSuppliers = value; },
    get stSupOverrides() { return stSupOverrides; },
    get stDeletedSups() { return stDeletedSups; },
    get stUserCategories() { return stUserCategories; }, set stUserCategories(value) { stUserCategories = value; },
    get stCategoryOverrides() { return stCategoryOverrides; },
    get stDeletedCategories() { return stDeletedCategories; },
    get stDemoNote() { return stDemoNote; },
    get stOverlayScope() { return stOverlayScope; },
    get stSaveOverlay() { return stSaveOverlay; },
    get stOverlayRaw() { return stOverlayRaw; },
    get svg() { return svg; },
    get esc() { return esc; },
    get fmtNum() { return fmtNum; },
    get fmtMad() { return fmtMad; },
    get fmtUnit() { return fmtUnit; },
    get stockUnit() { return stockUnit; },
    get stockUnitOptions() { return stockUnitOptions; },
    get fmtPct() { return fmtPct; },
    get fmtDateShort() { return fmtDateShort; },
    get catLabel() { return catLabel; },
    get isRetailStock() { return isRetailStock; },
    get retailCatalog() { return retailCatalog; },
    get retailProcurementDoc() { return retailProcurementDoc; },
    get retailSetProductStock() { return retailSetProductStock; },
    get stockBusinessDate() { return stockBusinessDate; },
    get stShowReal() { return stShowReal; },
    get getInv() { return getInv; },
    get getSup() { return getSup; },
    get allCategories() { return allCategories; },
    get stockLocationId() { return stockLocationId; },
    get currentStockFor() { return currentStockFor; },
    get moveStock() { return moveStock; },
    get countStock() { return countStock; },
    get theoreticalUsageFor() { return theoreticalUsageFor; },
    get statusOf() { return statusOf; },
    get variance() { return variance; },
    get daysOfStock() { return daysOfStock; },
    get render() { return render; },
    get rerenderTabBody() { return rerenderTabBody; },
    get openMark86() { return openMark86; },
    get renderAiCard() { return renderAiCard; },
    get ct() { return ct; },
    get ctMad() { return ctMad; },
    get ctNum() { return ctNum; },
    get ctWhen() { return ctWhen; },
    get ctWho() { return ctWho; },
    get ctRole() { return ctRole; },
    get ctStore() { return ctStore; },
    get ctReviewNote() { return ctReviewNote; },
    get ctReason() { return ctReason; },
    get ctWasteNote() { return ctWasteNote; },
    get ctUnit() { return ctUnit; },
    get stReviewBusy() { return stReviewBusy; }, set stReviewBusy(value) { stReviewBusy = value; },
    get openQuickOrder() { return openQuickOrder; },
    get QO_COPY() { return QO_COPY; },
    get PICK_COPY() { return PICK_COPY; },
    get _pdfjsPromise() { return _pdfjsPromise; }, set _pdfjsPromise(value) { _pdfjsPromise = value; },
    get stConflictStash() { return stConflictStash; }, set stConflictStash(value) { stConflictStash = value; },
    get stCountHistKey() { return stCountHistKey; },
    get stCountDate() { return stCountDate; },
    get itemHistory() { return itemHistory; },
    get topBackdrop() { return topBackdrop; },
    get wireDismiss() { return wireDismiss; },
    get closeTopModal() { return closeTopModal; },
    get nutritionKeys() { return nutritionKeys; },
    get allergenKeys() { return allergenKeys; },
    get ciqualPromise() { return ciqualPromise; }, set ciqualPromise(value) { ciqualPromise = value; },
  };
  window.KiwiStockInternal = {
    install(name, factory) { stockParts[name] = factory(stockScope); },
  };
  /* URLs littérales : tools/stamps.js les découvre et remonte au chargeur. */
  const stockUrls = [
    'assets/stock/movements.js?v=3',
    'assets/stock/overview.js?v=3',
    'assets/stock/alerts.js?v=3',
    'assets/stock/loss.js?v=1',
    'assets/stock/counts.js?v=5',
    'assets/stock/purchasing.js?v=2',
    'assets/stock/intake.js?v=11',
    'assets/stock/catalog.js?v=3',
  ];
  const stockLoads = new Map();
  function loadStockParts() {
    return Promise.all(stockUrls.map(url => {
      if (stockLoads.has(url)) return stockLoads.get(url);
      const script = document.createElement('script');
      script.src = url;
      const loading = new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => { stockLoads.delete(url); script.remove(); reject(new Error(url)); };
        document.head.appendChild(script);
      });
      stockLoads.set(url, loading);
      return loading;
    }));
  }
  function stockHandler(handler) {
    return function () {
      if (Object.keys(stockParts).length === stockUrls.length) return handler.apply(this, arguments);
      const self = this, args = arguments;
      return loadStockParts().then(() => handler.apply(self, args), () => {
        window.Kiwi?.toast?.(t('mCountErrOffline'), { type: 'error' });
      });
    };
  }
  /* Les parties se chargent dès le démarrage (précachées par le service worker) :
     un premier clic ne doit pas attendre le réseau, sinon un sélecteur de
     fichier perd l'activation utilisateur (Safari) ou échoue hors ligne. */
  try { loadStockParts().catch(() => {}); } catch (_) {}

  /* Private bridge used by restaurant recipes. It exposes the same persisted
   * inventory the Stock page renders, including edits and physical counts;
   * no demo inventory is copied into a real restaurant. */
  window.KiwiRestaurantStock = {
    items: () => {
      stEnsureOverlay();
      const rows = getInv().map((it) => ({ ...it, currentStock: currentStockFor(it) }));
      const recipeUsage = window.KiwiRestaurantRecipes?.theoreticalUsageMap
        ? window.KiwiRestaurantRecipes.theoreticalUsageMap(currentVenueId(), 7, rows)
        : null;
      return rows.map((it) => ({
        ...it,
        theoreticalUsage: recipeUsage ? (+recipeUsage[String(it.id)] || 0) : theoreticalUsageFor(it),
      }));
    },
    /* Same rows without the recipe-derived usage. The recipe engine reads the
     * inventory to resolve units and costs, and it is what computes that usage
     * in the first place: enriching the rows it consumes would recurse. */
    rows: () => {
      stEnsureOverlay();
      return getInv().map((it) => ({ ...it, currentStock: currentStockFor(it) }));
    },
    theoreticalUsage: (stockId) => {
      stEnsureOverlay();
      const it = getInv().find((row) => String(row.id) === String(stockId));
      return it ? theoreticalUsageFor(it) : 0;
    },
  };
  try { window.dispatchEvent(new CustomEvent('kiwi-stock-ready')); } catch (_) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerHandlers);
  } else {
    registerHandlers();
  }
})();
