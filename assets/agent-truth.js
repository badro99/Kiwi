/* Kiwi AI · capability truth, live operational reads and guarded actions.
 *
 * This is the assistant's contract with the product. Feature names come from
 * the same merchant/profile registry as the dashboard; live facts come only
 * from an installed module that owns that fact. Missing adapters stay missing
 * — the assistant never replaces them with demo data or a plausible number.
 */
(function () {
  'use strict';

  var norm = function (s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim(); };
  var LOCALE = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };
  var money = function (n, l) { return (Math.round((+n || 0) * 100) / 100).toLocaleString(LOCALE[l] || LOCALE.fr) + ' MAD'; };
  function storage(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function venue() { try { return window.KiwiVenue && window.KiwiVenue.getCurrentVenueData ? (window.KiwiVenue.getCurrentVenueData() || {}) : {}; } catch (_) { return {}; } }
  function trade() { try { return (window.KiwiFeatureGuide && window.KiwiFeatureGuide.trade && window.KiwiFeatureGuide.trade()) || venue().subtype || venue().trade || venue().type || 'autre'; } catch (_) { return 'autre'; } }
  function role() {
    var raw = window.__kiwiRole;
    if (raw == null) raw = storage('kiwiRole');
    /* The owner dashboard predates PIN-scoped roles and legitimately has no
     * role marker. Explicit staff/manager badges still override this below. */
    if (raw == null || raw === '') return 'owner';
    var id = '';
    try { id = window.KiwiRoles && window.KiwiRoles.idOf ? (window.KiwiRoles.idOf(raw) || '') : ''; } catch (_) {}
    if (id === 'proprietaire') return 'owner';
    if (id === 'manager') return 'manager';
    var n = norm(raw);
    if (/^(owner|proprietaire|direction|patron)$/.test(n)) return 'owner';
    if (/^(manager|admin|gerant|management)$/.test(n)) return 'manager';
    return 'staff';
  }
  function plan() {
    try { return String((window.KiwiVenue && window.KiwiVenue.getPlan && window.KiwiVenue.getPlan()) || (window.KiwiConfig && window.KiwiConfig.plan) || 'standard'); }
    catch (_) { return 'standard'; }
  }
  /* Trois états, pas deux : « cloud » quand le commerçant a accepté l'IA
   * serveur, « deterministic » quand il l'a refusée (mode privé), « ask » tant
   * qu'il n'a pas tranché — le copilote demande alors une fois. L'ancien
   * drapeau kiwiAiLocal (appareil inapte au modèle téléchargé) n'a plus de
   * sens depuis le retrait de WebLLM et n'est plus lu. */
  function aiMode() {
    var c = storage('kiwiAiCloud');
    if (c === 'on') return 'cloud';
    if (c === 'off') return 'deterministic';
    return 'ask';
  }
  function venueId() {
    var v = venue();
    try { return String(v.id || v.venueId || (window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || ''); }
    catch (_) { return String(v.id || v.venueId || ''); }
  }
  function pageExists(nav) {
    if (!nav) return false;
    try {
      if (window.Kiwi && window.Kiwi.handlers && typeof window.Kiwi.handlers['nav-' + nav] === 'function') return true;
      var p = window.KiwiVenue && window.KiwiVenue.getSubtypeProfile && window.KiwiVenue.getSubtypeProfile(trade());
      if (p && Array.isArray(p.items) && p.items.some(function (x) { return x && x.nav === nav; })) return true;
      var ws = window.KiwiTradeWorkspaces && window.KiwiTradeWorkspaces.pages;
      return Array.isArray(ws) && ws.some(function (x) { return x && x.trade === trade() && x.nav === nav; });
    } catch (_) { return false; }
  }
  var PROBES = {
    inventory: function () { return !!(window.KiwiInventory || window.KiwiRestaurantStock); },
    scanner: function () { return !!window.KiwiRetailScan; }, receipts: function () { return !!window.KiwiReceipt; },
    printer: function () { return !!window.KiwiPrinter; }, kds: function () { return !!(window.KiwiOrderInbox || window.KiwiKitchenRelay); },
    tables: function () { return !!readFloorPlan(); }, reservations: function () { return !!readFloorPlan(); },
    'pressing-orders': function () { return !!window.KiwiPressingOps; },
    'pressing-workshop': function () { return !!window.KiwiPressingOps; },
    'pressing-pickup': function () { return !!window.KiwiPressingOps; },
  };
  function canConfigure(key, r) {
    r = r || role();
    if (r === 'owner') return true;
    if (r === 'manager') return !/^(team|payments|receipts)$/.test(key);
    return false;
  }
  function featurePermission(key, r) {
    if (canConfigure(key, r)) return 'configure';
    if (r === 'staff' && /^(team|payments|reporting)$/.test(key)) return 'restricted';
    return 'view-only';
  }
  function context(opts) {
    opts = opts || {}; var t = trade(), r = opts.role || role();
    var fs = [];
    try { fs = window.KiwiFeatureGuide && window.KiwiFeatureGuide.features ? window.KiwiFeatureGuide.features(t) : []; } catch (_) {}
    return {
      venue: { id: venueId(), name: venue().name || venue().label || '', trade: t }, plan: plan(), role: r,
      aiMode: aiMode(), assistantAccess: 'read-only',
      features: fs.map(function (f) {
        var probe = PROBES[f.key]; var live = probe ? !!probe() : false; var page = pageExists(f.nav);
        var enabled = live || page;
        return { key: f.key, nav: f.nav || '', label: f.label, enabled: enabled, entitled: enabled, live: live,
          readable: !!probe && live, configurable: canConfigure(f.key, r), permission: featurePermission(f.key, r),
          source: live ? 'live-module' : page ? 'merchant-navigation' : 'not-installed', readiness: readiness(f.key, f.nav).status };
      }),
    };
  }

  function readFloorPlan() {
    var ids = [], v = venue();
    [v.id, v.venueId, venueId()].forEach(function (x) { if (x && ids.indexOf(String(x)) < 0) ids.push(String(x)); });
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < 2; j++) {
        var key = j ? 'kiwiPlanDeSalle:slug:' + ids[i] : 'kiwiPlanDeSalle:' + ids[i];
        try { var doc = JSON.parse(storage(key) || 'null'); if (doc && Array.isArray(doc.tables)) return doc; } catch (_) {}
      }
    }
    return null;
  }
  function inventoryCatalog() {
    var rows = [];
    try {
      if (window.KiwiRestaurantStock && typeof window.KiwiRestaurantStock.items === 'function') {
        rows = (window.KiwiRestaurantStock.items() || []).map(function (x) { return {
          id: String(x.id || ''), name: String(x.name || x.label || x.id || ''), stock: +x.currentStock || 0,
          threshold: Math.max(0, +x.reorderLevel || 0), theoreticalUsage: Math.max(0, +x.theoreticalUsage || 0)
        }; });
        if (rows.length) return { source: 'restaurant-stock', rows: rows };
      }
    } catch (_) {}
    try {
      var C = window.KiwiBoutiqueCatalog;
      if (C && typeof C.listProducts === 'function') {
        rows = (C.listProducts() || []).map(function (x) { return {
          id: String(x.id || ''), name: String(x.name || x.label || x.id || ''),
          stock: typeof C.productStock === 'function' ? (+C.productStock(x.id) || 0) : 0,
          threshold: Math.max(0, +x.lowStock || +x.reorderLevel || +x.stockMin || 0)
        }; });
        if (rows.length) return { source: 'retail-catalog', rows: rows };
      }
    } catch (_) {}
    return { source: '', rows: [] };
  }
  function inventoryRead() {
    var K = window.KiwiInventory, cat = inventoryCatalog();
    if ((!K || typeof K.snapshot !== 'function') && !cat.rows.length) return { available: false, source: 'inventory-ledger' };
    try {
      var s = K && K.snapshot ? (K.snapshot() || {}) : {}, sums = Object.create(null);
      Object.keys(s).forEach(function (k) { var id = String(k).split('||')[0]; sums[id] = (sums[id] || 0) + (+s[k] || 0); });
      var rows = cat.rows.length ? cat.rows.map(function (x) {
        var stock = Object.prototype.hasOwnProperty.call(sums, x.id) ? sums[x.id] : x.stock;
        return { id: x.id, name: x.name, stock: stock, threshold: x.threshold, theoreticalUsage: x.theoreticalUsage || 0 };
      }) : Object.keys(sums).map(function (id) { return { id: id, name: id, stock: sums[id], threshold: 0, theoreticalUsage: 0 }; });
      var out = rows.filter(function (x) { return x.stock <= 0; });
      var low = rows.filter(function (x) { return x.stock > 0 && x.threshold > 0 && x.stock < x.threshold; });
      var neg = rows.filter(function (x) { return x.stock < 0; });
      var nameList = function (a) { return a.slice().sort(function (a, b) { return a.stock - b.stock; }).slice(0, 5).map(function (x) { return x.name; }); };
      return { available: true, source: cat.source || 'inventory-ledger', data: {
        positions: rows.length, units: rows.reduce(function (a, x) { return a + x.stock; }, 0), zero: rows.filter(function (x) { return x.stock === 0; }).length,
        out: out.length, low: low.length, negative: neg.length, pending: K && K.pending ? K.pending() : 0,
        outNames: nameList(out), lowNames: nameList(low), negativeNames: nameList(neg), catalogCoverage: cat.rows.length ? 'named' : 'ledger-ids'
      } };
    } catch (_) { return { available: false, source: 'inventory-ledger' }; }
  }
  function pressingRead() {
    try { return window.KiwiPressingOps && window.KiwiPressingOps.summary ? { available: true, source: 'pressing-ops', data: window.KiwiPressingOps.summary() } : { available: false, source: 'pressing-ops' }; }
    catch (_) { return { available: false, source: 'pressing-ops' }; }
  }
  function tablesRead() {
    var p = readFloorPlan(); if (!p) return { available: false, source: 'floorplan' };
    var rows = p.tables || [], out = { total: rows.length, free: 0, occupied: 0, reserved: 0, bill: 0, settled: 0 };
    rows.forEach(function (x) {
      var st = norm(x.status || 'free');
      if (/reserv|reserve/.test(st) || x.reservationName) out.reserved++;
      else if (/addition|bill/.test(st)) out.bill++;
      else if (/regle|settled|paid/.test(st)) out.settled++;
      else if (/occup|cours|open|commande/.test(st)) out.occupied++;
      else out.free++;
    });
    return { available: true, source: 'floorplan', data: out, rows: rows };
  }
  function reservationsRead() {
    var t = tablesRead(); if (!t.available) return { available: false, source: 'floorplan-reservations' };
    var rows = (t.rows || []).filter(function (x) { return !!(x.reservationName || /reserv/.test(norm(x.status))); });
    var today = new Date().toISOString().slice(0, 10);
    var upcoming = rows.filter(function (x) { return !x.reservationDate || x.reservationDate >= today; });
    return { available: true, source: 'floorplan-reservations', limited: true, coverage: 'floorplan-only', data: {
      reservations: rows.length, upcoming: upcoming.length,
      tables: rows.map(function (x) { return x.num || x.id || ''; }).filter(Boolean),
      nextTimes: upcoming.map(function (x) { return [x.reservationDate || today, x.reservationTime || ''].filter(Boolean).join(' '); }).filter(function (x) { return x.trim() !== today; }).sort().slice(0, 3)
    } };
  }
  function kdsRead() {
    try {
      if (window.KiwiOrderInbox && window.KiwiOrderInbox.orders) {
        var raw = window.KiwiOrderInbox.orders() || {}, rows = Array.isArray(raw) ? raw : Object.keys(raw).map(function (k) { return raw[k]; });
        var d = { total: rows.length, pending: 0, accepted: 0, ready: 0, served: 0 };
        rows.forEach(function (x) { var s = norm(x && x.status); if (Object.prototype.hasOwnProperty.call(d, s)) d[s]++; });
        return { available: true, source: 'order-inbox', data: d };
      }
      if (window.KiwiKitchenRelay) return { available: true, source: 'kitchen-relay', limited: true, data: { queuedOffline: window.KiwiKitchenRelay.pending ? window.KiwiKitchenRelay.pending() : 0, reachable: window.KiwiKitchenRelay.reachable ? window.KiwiKitchenRelay.reachable() : null } };
    } catch (_) {}
    return { available: false, source: 'kds' };
  }
  function receiptRead() {
    var K = window.KiwiReceipt; if (!K) return { available: false, source: 'receipt' };
    try { var missing = K.missing ? K.missing(K.business ? K.business() : {}) : []; return { available: true, source: 'receipt', data: { configured: K.isConfigured ? !!K.isConfigured() : false, legalComplete: K.isComplete ? !!K.isComplete(K.business()) : missing.length === 0, missing: missing, syncIssue: K.syncRefused ? K.syncRefused() : '' } }; }
    catch (_) { return { available: false, source: 'receipt' }; }
  }
  function printerRead() {
    var K = window.KiwiPrinter; if (!K) return { available: false, source: 'printer' };
    try { var c = K.getConfig ? (K.getConfig() || {}) : {}; return { available: true, source: 'printer', data: { configured: !!(K.isConfigured && K.isConfigured()), connected: !!(K.isConnected && K.isConnected()), transport: K.btConnected && K.btConnected() ? 'bluetooth' : K.usbConnected && K.usbConnected() ? 'usb' : c.ip ? 'network' : c.osPrinter ? 'system' : 'none' } }; }
    catch (_) { return { available: false, source: 'printer' }; }
  }
  var READERS = { inventory: inventoryRead, pressing: pressingRead, tables: tablesRead, reservations: reservationsRead, kds: kdsRead, receipt: receiptRead, printer: printerRead };
  function read(kind) { return READERS[kind] ? READERS[kind]() : { available: false, source: kind }; }

  var STATUS_RX = /\b(?:combien|etat|statut|maintenant|aujourd|en cours|en attente|libre|occupee?s?|prete?s?|retard|connecte|configure|disponible|rupture|faible|pending|ready|today|status|how many|connected|configured|available)\b|(?:الان|الآن|اليوم|كم|حالة|متصل|جاهز)/;
  function intent(raw) {
    var q = norm(raw); if (!STATUS_RX.test(q)) return '';
    if (/imprimante|printer|طابع/.test(q)) return 'printer';
    if (/recu|ticket|facture|receipt|وصل|فاتور/.test(q) && /config|complet|sync|statut|etat|status|جاهز|حالة/.test(q)) return 'receipt';
    if (/reservation|booking|حجز/.test(q)) return 'reservations';
    if (/kds|cuisine|production|kitchen/.test(q)) return 'kds';
    if (/table|salle|terrasse|floor|طاول|قاعة/.test(q)) return 'tables';
    if (/pressing|vetement|piece|atelier|rack|retrait|garment|مصبن|ملابس|ورشة/.test(q) && /commande|pret|retard|atelier|rack|order|ready|late|طلب|جاهز|متاخر|ورشة/.test(q)) return 'pressing';
    if (/stock|inventaire|inventory|rupture|مخزون/.test(q)) return 'inventory';
    return '';
  }
  var C = {
    fr: { unavailable: 'Je n’ai pas de source active pour cette donnée dans cet établissement. Je ne vais pas remplacer son absence par une estimation.', read: 'Lecture seule · aucune donnée ni aucun statut n’a été modifié.', limited: 'Cette lecture couvre uniquement les données réellement reliées à cet écran.', source: 'Source', yes: 'Oui', no: 'Non', unknown: 'Inconnu', current: 'À jour', none: '—',
      text: { inventory: 'Voici l’état réel du stock.', pressing: 'Voici la charge pressing en direct.', tables: 'État réel du plan de salle.', reservations: 'Réservations visibles sur le plan de salle.', kds: 'État réel du relais de production.', receipt: 'État réel de la configuration des reçus.', printer: 'État réel de l’impression sur cet appareil.' },
      labels: { positions: 'Articles suivis', units: 'Unités nettes', out: 'Ruptures', low: 'Stock faible', names: 'À traiter', pending: 'À synchroniser', active: 'Actives', received: 'Reçues', treating: 'En traitement', ready: 'Prêtes', late: 'En retard', due: 'Solde restant', free: 'Libres', occupied: 'Occupées', reserved: 'Réservées', bill: 'Addition', total: 'Total', bookings: 'Réservations liées aux tables', upcoming: 'À venir', tables: 'Tables', queue: 'En attente', accepted: 'Acceptées', served: 'Servies', offline: 'Actions hors ligne', reachable: 'Relais joignable', configured: 'Configuré', legal: 'Mentions légales complètes', sync: 'Synchronisation', connected: 'Connectée', transport: 'Transport' } },
    en: { unavailable: 'No active source provides this fact for this location. I will not replace it with an estimate.', read: 'Read-only · no data or status was changed.', limited: 'This read covers only data genuinely connected to this screen.', source: 'Source', yes: 'Yes', no: 'No', unknown: 'Unknown', current: 'Up to date', none: '—',
      text: { inventory: 'Here is the live inventory state.', pressing: 'Here is the live pressing workload.', tables: 'Here is the live floor-plan state.', reservations: 'These are the reservations connected to the floor plan.', kds: 'Here is the live production relay state.', receipt: 'Here is the live receipt configuration state.', printer: 'Here is the live printing state on this device.' },
      labels: { positions: 'Tracked items', units: 'Net units', out: 'Out of stock', low: 'Low stock', names: 'Needs attention', pending: 'Pending sync', active: 'Active', received: 'Received', treating: 'In treatment', ready: 'Ready', late: 'Late', due: 'Outstanding balance', free: 'Free', occupied: 'Occupied', reserved: 'Reserved', bill: 'Bill requested', total: 'Total', bookings: 'Table-linked bookings', upcoming: 'Upcoming', tables: 'Tables', queue: 'Pending', accepted: 'Accepted', served: 'Served', offline: 'Offline actions', reachable: 'Relay reachable', configured: 'Configured', legal: 'Legal details complete', sync: 'Synchronisation', connected: 'Connected', transport: 'Transport' } },
    ar: { unavailable: 'لا يوجد مصدر نشط لهذه المعلومة في هذه المؤسسة، ولن أستبدلها بتقدير.', read: 'قراءة فقط · لم تتغير أي بيانات أو حالة.', limited: 'تشمل هذه القراءة فقط البيانات المرتبطة فعلياً بهذه الشاشة.', source: 'المصدر', yes: 'نعم', no: 'لا', unknown: 'غير معروف', current: 'محدّث', none: '—',
      text: { inventory: 'هذه حالة المخزون المباشرة.', pressing: 'هذه حالة عمل المصبنة الآن.', tables: 'هذه حالة خريطة القاعة الآن.', reservations: 'هذه الحجوزات المرتبطة بخريطة القاعة.', kds: 'هذه حالة مسار الإنتاج الآن.', receipt: 'هذه حالة إعداد الوصل الآن.', printer: 'هذه حالة الطباعة على هذا الجهاز.' },
      labels: { positions: 'المنتجات المتابعة', units: 'صافي الوحدات', out: 'نفد المخزون', low: 'مخزون منخفض', names: 'يتطلب الانتباه', pending: 'بانتظار المزامنة', active: 'نشطة', received: 'مستلمة', treating: 'قيد المعالجة', ready: 'جاهزة', late: 'متأخرة', due: 'الرصيد المتبقي', free: 'حرة', occupied: 'مشغولة', reserved: 'محجوزة', bill: 'طلب الحساب', total: 'المجموع', bookings: 'حجوزات مرتبطة بالطاولات', upcoming: 'قادمة', tables: 'الطاولات', queue: 'قيد الانتظار', accepted: 'مقبولة', served: 'مسلّمة', offline: 'عمليات دون اتصال', reachable: 'المسار متصل', configured: 'مضبوط', legal: 'البيانات القانونية مكتملة', sync: 'المزامنة', connected: 'متصلة', transport: 'طريقة الربط' } },
  };
  function reply(raw, opts) {
    var kind = intent(raw); if (!kind) return null;
    var l = opts && opts.lang; if (l !== 'en' && l !== 'ar') l = /[\u0600-\u06ff]/.test(raw) ? 'ar' : 'fr';
    var c = C[l], r = read(kind);
    if (!r.available) return { text: c.unavailable, note: c.read, meta: c.source + ' · ' + r.source };
    var d = r.data || {}, stats = [], text = c.text[kind] || '';
    var yesNo = function (v) { return v === true ? c.yes : v === false ? c.no : c.unknown; };
    if (kind === 'inventory') {
      stats = [{ l: c.labels.positions, v: String(d.positions) }, { l: c.labels.out, v: String(d.out || 0) }, { l: c.labels.low, v: String(d.low || 0) }, { l: c.labels.pending, v: String(d.pending || 0) }];
      var attention = (d.negativeNames || []).concat(d.outNames || [], d.lowNames || []).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).slice(0, 5);
      if (attention.length) stats.push({ l: c.labels.names, v: attention.join(' · ') });
    }
    if (kind === 'pressing') stats = [{ l: c.labels.active, v: String(d.active || 0) }, { l: c.labels.received, v: String(d.received || 0) }, { l: c.labels.treating, v: String(d.treating || 0) }, { l: c.labels.ready, v: String(d.ready || 0) }, { l: c.labels.late, v: String(d.late || 0) }, { l: c.labels.due, v: money(d.due, l) }];
    if (kind === 'tables') stats = [{ l: c.labels.free, v: String(d.free || 0) }, { l: c.labels.occupied, v: String(d.occupied || 0) }, { l: c.labels.reserved, v: String(d.reserved || 0) }, { l: c.labels.bill, v: String(d.bill || 0) }, { l: c.labels.total, v: String(d.total || 0) }];
    if (kind === 'reservations') stats = [{ l: c.labels.bookings, v: String(d.reservations || 0) }, { l: c.labels.upcoming, v: String(d.upcoming || 0) }, { l: c.labels.tables, v: (d.tables || []).join(', ') || c.none }];
    if (kind === 'kds') stats = r.source === 'order-inbox' ? [{ l: c.labels.queue, v: String(d.pending || 0) }, { l: c.labels.accepted, v: String(d.accepted || 0) }, { l: c.labels.ready, v: String(d.ready || 0) }, { l: c.labels.served, v: String(d.served || 0) }] : [{ l: c.labels.offline, v: String(d.queuedOffline || 0) }, { l: c.labels.reachable, v: yesNo(d.reachable) }];
    if (kind === 'receipt') stats = [{ l: c.labels.configured, v: yesNo(d.configured) }, { l: c.labels.legal, v: yesNo(d.legalComplete) }, { l: c.labels.sync, v: d.syncIssue || c.current }];
    if (kind === 'printer') stats = [{ l: c.labels.configured, v: yesNo(d.configured) }, { l: c.labels.connected, v: yesNo(d.connected) }, { l: c.labels.transport, v: d.transport || c.none }];
    return { text: text, stats: stats, note: c.read + (r.limited ? ' ' + c.limited : ''), meta: c.source + ' · ' + r.source };
  }

  function readiness(key, nav) {
    var r, gaps = [], status = 'ready', source = 'merchant-navigation';
    if (key === 'inventory') { r = inventoryRead(); source = r.source; if (!r.available) gaps.push('inventory-source'); else if (!(r.data && r.data.positions)) gaps.push('opening-stock'); }
    else if (key === 'receipts') { r = receiptRead(); source = r.source; if (!r.available) gaps.push('receipt-engine'); else { if (!r.data.configured) gaps.push('receipt-template'); if (!r.data.legalComplete) gaps = gaps.concat((r.data.missing || []).map(function (x) { return 'legal:' + x; })); } }
    else if (key === 'printer') { r = printerRead(); source = r.source; if (!r.available || !r.data.configured) gaps.push('printer-configuration'); else if (!r.data.connected) gaps.push('printer-connection'); }
    else if (key === 'tables') { r = tablesRead(); source = r.source; if (!r.available || !(r.data && r.data.total)) gaps.push('floorplan'); }
    else if (key === 'reservations') { r = reservationsRead(); source = r.source; if (!r.available) gaps.push('floorplan'); else gaps.push('floorplan-only'); }
    else if (key === 'kds') { r = kdsRead(); source = r.source; if (!r.available) gaps.push('production-relay'); }
    else if (/^pressing-/.test(key)) { r = pressingRead(); source = r.source; if (!r.available) gaps.push('pressing-operations'); }
    else if (key === 'scanner') { source = 'retail-scan'; if (!window.KiwiRetailScan) gaps.push('scanner-module'); if (!(window.isSecureContext || (typeof location !== 'undefined' && /^https:/.test(String(location.protocol || ''))))) gaps.push('secure-context'); }
    else if (!pageExists(nav || key)) gaps.push('page-validation');
    if (gaps.length) status = gaps.every(function (x) { return x === 'floorplan-only' || x === 'page-validation'; }) ? 'needs-validation' : 'needs-attention';
    return { key: key, status: status, ready: status === 'ready', gaps: gaps, source: source };
  }

  /* Mutation tools are deny-by-default. Only append-only stock movements have
   * both a real backend contract and a stable command id today. Everything
   * else is advertised as unavailable until its transport can make the same
   * guarantees. No natural-language answer calls this API automatically. */
  var confirmations = Object.create(null), results = Object.create(null);
  function actionStorageKey(commandId) { return 'kiwi:agent-action:v1:' + venueId() + ':' + commandId; }
  function priorAction(commandId) { try { return JSON.parse(storage(actionStorageKey(commandId)) || 'null'); } catch (_) { return null; } }
  function rememberAction(commandId, result) { try { localStorage.setItem(actionStorageKey(commandId), JSON.stringify(result)); } catch (_) {} return result; }
  function requestAction(name, args) {
    args = args || {}; var r = role();
    var said = String(args.said || name || '').trim().slice(0, 240);
    var commandId = String(args.commandId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
    if (!commandId) return { ok: false, reason: 'command-id-required' };
    var prior = priorAction(commandId); if (prior) return { ok: true, replayed: true, result: prior };
    if (name === 'stock-adjust') {
      if (!window.KiwiInventory || (r !== 'owner' && r !== 'manager')) return { ok: false, reason: 'read-only' };
      if (!args.itemId || !isFinite(+args.qty) || +args.qty === 0 || Math.abs(+args.qty) > 100000) return { ok: false, reason: 'invalid' };
    } else if (name === 'order-status') {
      if (!window.KiwiOrderInbox || typeof window.KiwiOrderInbox.setStatus !== 'function' || (r !== 'owner' && r !== 'manager')) return { ok: false, reason: 'read-only' };
      if (!/^ord-[a-z0-9-]{6,48}$/i.test(String(args.orderId || '')) || !/^(accepted|rejected|ready|served)$/.test(String(args.status || ''))) return { ok: false, reason: 'invalid' };
    } else if (name === 'reprint') {
      if (r !== 'owner' && r !== 'manager') return { ok: false, reason: 'read-only' };
      if (!window.KiwiPosReprint || typeof window.KiwiPosReprint.rows !== 'function' || typeof window.KiwiPosReprint.reprint !== 'function') return { ok: false, reason: 'unavailable' };
      var vertical = String(args.vertical || trade()).replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
      if (vertical !== trade()) return { ok: false, reason: 'tenant-mismatch' };
      var ref = String(args.ref || '').trim().slice(0, 80);
      var row = (window.KiwiPosReprint.rows(vertical) || []).find(function (x) { return x && String(x.ref) === ref; });
      if (!vertical || !ref || !row) return { ok: false, reason: 'receipt-not-found' };
      args = { vertical: vertical, ref: ref };
    } else if (name === 'customer-message-draft') {
      if (r !== 'owner' && r !== 'manager') return { ok: false, reason: 'read-only' };
      var digits = String(args.phone || '').replace(/[^0-9+]/g, '');
      if (digits.indexOf('00') === 0) digits = '+' + digits.slice(2);
      if (!/^\+?[1-9][0-9]{7,14}$/.test(digits) || !String(args.text || '').trim()) return { ok: false, reason: 'invalid' };
      args = { phone: digits, text: String(args.text).trim().slice(0, 1500) };
    } else return { ok: false, reason: 'read-only' };
    var token = 'confirm-' + Math.random().toString(36).slice(2, 12);
    confirmations[token] = { name: name, commandId: commandId, said: said, args: name === 'stock-adjust'
      ? { itemId: String(args.itemId).slice(0, 80), qty: +args.qty, reason: String(args.reason || 'manual').slice(0, 32), note: String(args.note || '').slice(0, 300) }
      : name === 'order-status' ? { orderId: String(args.orderId), status: String(args.status), station: String(args.station || '').slice(0, 40) }
      : args, expires: Date.now() + 120000 };
    return { ok: true, confirmationRequired: true, token: token, summary: confirmations[token].args };
  }
  function confirmAction(token) {
    if (results[token]) return results[token];
    var c = confirmations[token]; if (!c || c.expires < Date.now()) return { ok: false, reason: 'expired' };
    delete confirmations[token];

    /* Opening a WhatsApp composer is a draft handoff, not a business-state
     * mutation. Keep its result synchronous and explicit: opened is not sent. */
    if (c.name === 'customer-message-draft') {
      var href = 'https://wa.me/' + c.args.phone.replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(c.args.text);
      var opened = null;
      try { opened = window.open(href, '_blank', 'noopener'); } catch (_) {}
      var draft = opened ? { ok: true, outcome: 'draft-opened', sent: false, deliveryVerified: false }
        : { ok: false, reason: 'popup-blocked' };
      if (draft.ok) rememberAction(c.commandId, draft);
      results[token] = draft;
      return draft;
    }

    /* Isolated demos and the release harness expose the real adapters without
     * the hosted audit facade. Keep their established synchronous stock and
     * asynchronous order contracts; a hosted session still fails closed when
     * KiwiOperations is missing. */
    var legacy = !window.KiwiEnv;
    try { legacy = legacy || !!(window.KiwiEnv && window.KiwiEnv.isDemo && window.KiwiEnv.isDemo()); } catch (_) {}
    if (legacy && c.name === 'stock-adjust') {
      var legacyMovement = window.KiwiInventory.add({ id: 'ai-stock-' + venueId().replace(/[^a-zA-Z0-9_-]/g, '-') + '-' + c.commandId, itemId: c.args.itemId, qty: c.args.qty, reason: c.args.reason, note: c.args.note, refType: 'assistant-confirmed', refId: c.commandId });
      var legacyStock = legacyMovement ? { ok: true, id: legacyMovement.id } : { ok: false, reason: 'write-refused' };
      results[token] = legacyStock.ok ? rememberAction(c.commandId, legacyStock) : legacyStock;
      return results[token];
    }
    if (legacy && c.name === 'order-status') {
      var legacyOrder = window.KiwiOrderInbox.setStatus(c.args.orderId, c.args.status, c.args.station ? { station: c.args.station } : {})
        .then(function (j) { return rememberAction(c.commandId, j && (j.ok || j.status === c.args.status) ? { ok: true, id: c.args.orderId, status: c.args.status } : { ok: false, reason: (j && (j.error || j.reason)) || 'write-refused' }); })
        .catch(function () { return { ok: false, reason: 'network' }; });
      results[token] = legacyOrder;
      return legacyOrder;
    }
    if (legacy && c.name === 'reprint') {
      var legacyReceipt = (window.KiwiPosReprint.rows(c.args.vertical) || []).find(function (x) { return x && String(x.ref) === c.args.ref; });
      if (!legacyReceipt) return { ok: false, reason: 'receipt-not-found' };
      var legacyPrint = Promise.resolve(window.KiwiPosReprint.reprint(c.args.vertical, legacyReceipt)).then(function (j) {
        var out = j && j.ok ? { ok: true, ref: c.args.ref, physicalVerified: true } : { ok: false, reason: 'print-not-confirmed' };
        if (out.ok) rememberAction(c.commandId, out);
        return out;
      }).catch(function () { return { ok: false, reason: 'print-failed' }; });
      results[token] = legacyPrint;
      return legacyPrint;
    }

    var task = (async function () {
      var O = window.KiwiOperations;
      if (!O || typeof O.agentRun !== 'function' || typeof O.transition !== 'function') return { ok: false, reason: 'audit-unavailable' };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };

      if (c.name === 'order-status') {
        try {
          var changed = await O.agentRun('update-order-status', {
            orderId: c.args.orderId, status: c.args.status, station: c.args.station || ''
          }, c.said);
          var command = changed && changed.command;
          return command && command.status === 'completed'
            ? rememberAction(c.commandId, { ok: true, id: c.args.orderId, status: c.args.status, commandId: command.id, audited: true })
            : { ok: false, reason: command && (command.lastError || command.status) || 'write-refused' };
        } catch (_) { return { ok: false, reason: 'network' }; }
      }

      if (c.name === 'stock-adjust') {
        var movementId = 'ai-stock-' + venueId().replace(/[^a-zA-Z0-9_-]/g, '-') + '-' + c.commandId;
        var started;
        try {
          started = await O.agentRun('stock-adjust', {
            itemId: c.args.itemId, qty: c.args.qty, reason: c.args.reason,
            note: c.args.note, movementId: movementId
          }, c.said);
        } catch (_) { return { ok: false, reason: 'network' }; }
        var stockCommand = started && started.command;
        if (!stockCommand || stockCommand.status !== 'processing') return { ok: false, reason: stockCommand && (stockCommand.lastError || stockCommand.status) || 'audit-refused' };
        var movement = null;
        try {
          movement = window.KiwiInventory.add({ id: movementId, itemId: c.args.itemId, qty: c.args.qty, reason: c.args.reason, note: c.args.note, refType: 'assistant-confirmed', refId: stockCommand.id });
        } catch (_) {}
        try { await O.transition(stockCommand.id, movement ? 'completed' : 'failed', { confirmed: true, reason: movement ? '' : 'write-refused' }); } catch (_) {
          if (movement) return rememberAction(c.commandId, { ok: true, id: movement.id, commandId: stockCommand.id, auditPending: true });
        }
        return movement
          ? rememberAction(c.commandId, { ok: true, id: movement.id, commandId: stockCommand.id, audited: true })
          : { ok: false, reason: 'write-refused' };
      }

      var receipt = (window.KiwiPosReprint.rows(c.args.vertical) || []).find(function (x) { return x && String(x.ref) === c.args.ref; });
      if (!receipt) return { ok: false, reason: 'receipt-not-found' };
      var openedCommand;
      try {
        openedCommand = await O.agentRun('reprint', { deviceId: O.deviceId(), ref: c.args.ref }, c.said);
      } catch (_) { return { ok: false, reason: 'network' }; }
      var printCommand = openedCommand && openedCommand.command;
      if (!printCommand || printCommand.status !== 'processing') return { ok: false, reason: printCommand && (printCommand.lastError || printCommand.status) || 'audit-refused' };
      var printed;
      try { printed = await window.KiwiPosReprint.reprint(c.args.vertical, receipt); } catch (_) { printed = null; }
      var printOk = !!(printed && printed.ok);
      try { await O.transition(printCommand.id, printOk ? 'completed' : 'failed', { confirmed: true, reason: printOk ? '' : 'print-not-confirmed' }); } catch (_) {}
      var out = printOk ? { ok: true, ref: c.args.ref, physicalVerified: true, commandId: printCommand.id, audited: true }
        : { ok: false, reason: 'print-not-confirmed' };
      if (out.ok) rememberAction(c.commandId, out);
      return out;
    }());
    results[token] = task;
    return task;
  }

  window.KiwiFeatureTruth = { context: context, role: role, plan: plan, aiMode: aiMode, read: read, intent: intent, readiness: readiness };
  window.KiwiAgentOps = { canHandle: function (q) { return !!intent(q); }, reply: reply, read: read };
  window.KiwiAgentActions = { request: requestAction, confirm: confirmAction, availability: function () { return {
    stockAdjust: { available: !!window.KiwiInventory && (role() === 'owner' || role() === 'manager'), confirmation: true, idempotent: true },
    orderStatus: { available: !!(window.KiwiOrderInbox && typeof window.KiwiOrderInbox.setStatus === 'function') && (role() === 'owner' || role() === 'manager'), confirmation: true, idempotent: true },
    reprint: { available: !!(window.KiwiPosReprint && window.KiwiReceipt) && (role() === 'owner' || role() === 'manager'), confirmation: true, idempotent: true, physicalResultRequired: true },
    customerMessage: { available: typeof window.open === 'function' && (role() === 'owner' || role() === 'manager'), confirmation: true, idempotent: true, outcome: 'draft-only', deliveryVerified: false },
  }; } };
}());
