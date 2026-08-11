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
  var money = function (n) { return (Math.round((+n || 0) * 100) / 100).toLocaleString('fr-FR') + ' MAD'; };
  function storage(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function venue() { try { return window.KiwiVenue && window.KiwiVenue.getCurrentVenueData ? (window.KiwiVenue.getCurrentVenueData() || {}) : {}; } catch (_) { return {}; } }
  function trade() { try { return (window.KiwiFeatureGuide && window.KiwiFeatureGuide.trade && window.KiwiFeatureGuide.trade()) || venue().subtype || venue().trade || venue().type || 'autre'; } catch (_) { return 'autre'; } }
  function role() {
    var raw = window.__kiwiRole;
    if (raw == null) raw = storage('kiwiRole');
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
  function aiMode() {
    if (storage('kiwiAiCloud') === 'on') return 'cloud';
    if (storage('kiwiAiLocal') === 'off') return 'deterministic';
    return 'local';
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
    if (r === 'staff') return !/^(team|payments|receipts|pressing-services)$/.test(key);
    return key !== 'team';
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
        return { key: f.key, nav: f.nav || '', label: f.label, enabled: live || page, live: live,
          readable: !!probe && live, configurable: canConfigure(f.key, r), permission: canConfigure(f.key, r) ? 'allowed' : 'read-only' };
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
  function inventoryRead() {
    var K = window.KiwiInventory;
    if (!K || typeof K.snapshot !== 'function') return { available: false, source: 'inventory-ledger' };
    try {
      var s = K.snapshot() || {}, vals = Object.keys(s).map(function (k) { return +s[k] || 0; });
      return { available: true, source: 'inventory-ledger', data: { positions: vals.length, units: vals.reduce(function (a, b) { return a + b; }, 0), zero: vals.filter(function (x) { return x === 0; }).length, negative: vals.filter(function (x) { return x < 0; }).length, pending: K.pending ? K.pending() : 0 } };
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
    return { available: true, source: 'floorplan-reservations', limited: true, data: { reservations: rows.length, tables: rows.map(function (x) { return x.num || x.id || ''; }).filter(Boolean) } };
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
    fr: { unavailable: 'Je n’ai pas de source active pour cette donnée dans cet établissement. Je ne vais pas remplacer son absence par une estimation.', read: 'Lecture seule · aucune donnée ni aucun statut n’a été modifié.', limited: 'Cette lecture couvre uniquement les données réellement reliées à cet écran.' },
    en: { unavailable: 'No active source provides this fact for this location. I will not replace it with an estimate.', read: 'Read-only · no data or status was changed.', limited: 'This read covers only data genuinely connected to this screen.' },
    ar: { unavailable: 'لا يوجد مصدر نشط لهذه المعلومة في هذه المؤسسة، ولن أستبدلها بتقدير.', read: 'قراءة فقط · لم تتغير أي بيانات أو حالة.', limited: 'تشمل هذه القراءة فقط البيانات المرتبطة فعلياً بهذه الشاشة.' },
  };
  function reply(raw, opts) {
    var kind = intent(raw); if (!kind) return null;
    var l = opts && opts.lang; if (l !== 'en' && l !== 'ar') l = /[\u0600-\u06ff]/.test(raw) ? 'ar' : 'fr';
    var c = C[l], r = read(kind);
    if (!r.available) return { text: c.unavailable, note: c.read, meta: 'Source · ' + r.source };
    var d = r.data || {}, stats = [], text = '';
    if (kind === 'inventory') { text = l === 'en' ? 'Here is the live inventory-ledger state.' : l === 'ar' ? 'هذه حالة سجل المخزون المباشرة.' : 'Voici l’état réel du registre de stock.'; stats = [{ l: 'Positions', v: String(d.positions) }, { l: 'Unités nettes', v: String(d.units) }, { l: 'À synchroniser', v: String(d.pending) }]; }
    if (kind === 'pressing') { text = l === 'en' ? 'Here is the live pressing workload.' : l === 'ar' ? 'هذه حالة عمل المصبنة الآن.' : 'Voici la charge pressing en direct.'; stats = [{ l: 'Actives', v: String(d.active) }, { l: 'Prêtes', v: String(d.ready) }, { l: 'En retard', v: String(d.late) }, { l: 'Solde restant', v: money(d.due) }]; }
    if (kind === 'tables') { text = 'État réel du plan de salle.'; stats = [{ l: 'Libres', v: String(d.free) }, { l: 'Occupées', v: String(d.occupied) }, { l: 'Réservées', v: String(d.reserved) }, { l: 'Total', v: String(d.total) }]; }
    if (kind === 'reservations') { text = 'Réservations visibles sur le plan de salle.'; stats = [{ l: 'Réservations liées aux tables', v: String(d.reservations) }, { l: 'Tables', v: d.tables.join(', ') || '—' }]; }
    if (kind === 'kds') { text = 'État réel du relais de production.'; stats = r.source === 'order-inbox' ? [{ l: 'En attente', v: String(d.pending) }, { l: 'Acceptées', v: String(d.accepted) }, { l: 'Prêtes', v: String(d.ready) }] : [{ l: 'Actions hors ligne', v: String(d.queuedOffline) }, { l: 'Relais joignable', v: d.reachable === true ? 'Oui' : d.reachable === false ? 'Non' : 'Inconnu' }]; }
    if (kind === 'receipt') { text = 'État réel de la configuration des reçus.'; stats = [{ l: 'Modèle configuré', v: d.configured ? 'Oui' : 'Non' }, { l: 'Mentions légales complètes', v: d.legalComplete ? 'Oui' : 'Non' }, { l: 'Synchronisation', v: d.syncIssue || 'À jour' }]; }
    if (kind === 'printer') { text = 'État réel de l’impression sur cet appareil.'; stats = [{ l: 'Configurée', v: d.configured ? 'Oui' : 'Non' }, { l: 'Connectée', v: d.connected ? 'Oui' : 'Non' }, { l: 'Transport', v: d.transport }]; }
    return { text: text, stats: stats, note: c.read + (r.limited ? ' ' + c.limited : ''), meta: 'Source · ' + r.source };
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
    var commandId = String(args.commandId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
    if (!commandId) return { ok: false, reason: 'command-id-required' };
    var prior = priorAction(commandId); if (prior) return { ok: true, replayed: true, result: prior };
    if (name === 'stock-adjust') {
      if (!window.KiwiInventory || (r !== 'owner' && r !== 'manager')) return { ok: false, reason: 'read-only' };
      if (!args.itemId || !isFinite(+args.qty) || +args.qty === 0 || Math.abs(+args.qty) > 100000) return { ok: false, reason: 'invalid' };
    } else if (name === 'order-status') {
      if (!window.KiwiOrderInbox || typeof window.KiwiOrderInbox.setStatus !== 'function' || (r !== 'owner' && r !== 'manager')) return { ok: false, reason: 'read-only' };
      if (!/^ord-[a-z0-9-]{6,48}$/i.test(String(args.orderId || '')) || !/^(accepted|rejected|ready|served)$/.test(String(args.status || ''))) return { ok: false, reason: 'invalid' };
    } else return { ok: false, reason: 'read-only' };
    var token = 'confirm-' + Math.random().toString(36).slice(2, 12);
    confirmations[token] = { name: name, commandId: commandId, args: name === 'stock-adjust'
      ? { itemId: String(args.itemId).slice(0, 80), qty: +args.qty, reason: String(args.reason || 'manual').slice(0, 32), note: String(args.note || '').slice(0, 300) }
      : { orderId: String(args.orderId), status: String(args.status), station: String(args.station || '').slice(0, 40) }, expires: Date.now() + 120000 };
    return { ok: true, confirmationRequired: true, token: token, summary: confirmations[token].args };
  }
  function confirmAction(token) {
    if (results[token]) return results[token];
    var c = confirmations[token]; if (!c || c.expires < Date.now()) return { ok: false, reason: 'expired' };
    delete confirmations[token];
    if (c.name === 'stock-adjust') {
      var m = window.KiwiInventory.add({ id: 'ai-stock-' + venueId().replace(/[^a-zA-Z0-9_-]/g, '-') + '-' + c.commandId, itemId: c.args.itemId, qty: c.args.qty, reason: c.args.reason, note: c.args.note, refType: 'assistant-confirmed', refId: c.commandId });
      return (results[token] = rememberAction(c.commandId, m ? { ok: true, id: m.id } : { ok: false, reason: 'write-refused' }));
    }
    var promise = window.KiwiOrderInbox.setStatus(c.args.orderId, c.args.status, c.args.station ? { station: c.args.station } : {})
      .then(function (j) { return rememberAction(c.commandId, j && (j.ok || j.status === c.args.status) ? { ok: true, id: c.args.orderId, status: c.args.status } : { ok: false, reason: (j && (j.error || j.reason)) || 'write-refused' }); })
      .catch(function () { return { ok: false, reason: 'network' }; });
    results[token] = promise; return promise;
  }

  window.KiwiFeatureTruth = { context: context, role: role, plan: plan, aiMode: aiMode, read: read, intent: intent };
  window.KiwiAgentOps = { canHandle: function (q) { return !!intent(q); }, reply: reply, read: read };
  window.KiwiAgentActions = { request: requestAction, confirm: confirmAction, availability: function () { return {
    stockAdjust: { available: !!window.KiwiInventory && (role() === 'owner' || role() === 'manager'), confirmation: true, idempotent: true },
    orderStatus: { available: !!(window.KiwiOrderInbox && typeof window.KiwiOrderInbox.setStatus === 'function') && (role() === 'owner' || role() === 'manager'), confirmation: true, idempotent: true },
    reprint: { available: false, reason: 'physical-print-exactly-once-not-guaranteed' },
    customerMessage: { available: false, reason: 'no-confirmed-message-transport' },
  }; } };
}());
