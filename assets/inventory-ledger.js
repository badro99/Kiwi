/* Kiwi Inventory Ledger — append-only stock truth shared by dashboard/caisse.
 * Quantities are movements, never overwritten snapshots. Local-first writes are
 * queued and replayed idempotently to /api/inventory/movements. */
(function () {
  'use strict';
  /* GENERATED SHARED KiwiRecipeUnits BEGIN */
  /* Copy of functions/api/_rules-recipe-units.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiRecipeUnits = (function () {
    const UNITS = [
      { id: 'mg', label: 'Milligramme (mg)', family: 'mass', factor: 0.001 },
      { id: 'g', label: 'Gramme (g)', family: 'mass', factor: 1 },
      { id: 'kg', label: 'Kilogramme (kg)', family: 'mass', factor: 1000 },
      { id: 'ml', label: 'Millilitre (ml)', family: 'volume', factor: 1 },
      { id: 'cl', label: 'Centilitre (cl)', family: 'volume', factor: 10 },
      { id: 'L', label: 'Litre (L)', family: 'volume', factor: 1000 },
      { id: 'unité', label: 'Unité', family: 'count', factor: 1 },
      { id: 'douzaine', label: 'Douzaine', family: 'package', factor: 1 },
      { id: 'lot', label: 'Lot', family: 'package', factor: 1 },
      { id: 'paquet', label: 'Paquet', family: 'package', factor: 1 },
      { id: 'sachet', label: 'Sachet', family: 'package', factor: 1 },
      { id: 'sac', label: 'Sac', family: 'package', factor: 1 },
      { id: 'boîte', label: 'Boîte', family: 'package', factor: 1 },
      { id: 'carton', label: 'Carton', family: 'package', factor: 1 },
      { id: 'barquette', label: 'Barquette', family: 'package', factor: 1 },
      { id: 'bouteille', label: 'Bouteille', family: 'package', factor: 1 },
      { id: 'canette', label: 'Canette', family: 'package', factor: 1 },
      { id: 'bocal', label: 'Bocal', family: 'package', factor: 1 },
      { id: 'pot', label: 'Pot', family: 'package', factor: 1 },
      { id: 'bidon', label: 'Bidon', family: 'package', factor: 1 },
      { id: 'seau', label: 'Seau', family: 'package', factor: 1 },
      { id: 'fût', label: 'Fût', family: 'package', factor: 1 },
      { id: 'bac', label: 'Bac', family: 'package', factor: 1 },
      { id: 'botte', label: 'Botte', family: 'package', factor: 1 },
      { id: 'caisse', label: 'Caisse', family: 'package', factor: 1 },
      { id: 'plateau', label: 'Plateau', family: 'package', factor: 1 },
      { id: 'rouleau', label: 'Rouleau', family: 'package', factor: 1 },
    ];
    const key = (value) => String(value == null ? '' : value).trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
    const aliases = {
      mg: 'mg', milligramme: 'mg', milligrammes: 'mg',
      g: 'g', gr: 'g', gramme: 'g', grammes: 'g',
      kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramme: 'kg', kilogrammes: 'kg',
      ml: 'ml', millilitre: 'ml', millilitres: 'ml',
      cl: 'cl', centilitre: 'cl', centilitres: 'cl',
      l: 'L', litre: 'L', litres: 'L',
      unite: 'unité', unites: 'unité', unit: 'unité', units: 'unité', piece: 'unité', pieces: 'unité',
      douzaine: 'douzaine', douzaines: 'douzaine', dozen: 'douzaine',
      lot: 'lot', lots: 'lot', paquet: 'paquet', paquets: 'paquet', pack: 'paquet', packs: 'paquet',
      sachet: 'sachet', sachets: 'sachet', sac: 'sac', sacs: 'sac',
      boite: 'boîte', boites: 'boîte', box: 'boîte', boxes: 'boîte', carton: 'carton', cartons: 'carton',
      barquette: 'barquette', barquettes: 'barquette', bouteille: 'bouteille', bouteilles: 'bouteille',
      canette: 'canette', canettes: 'canette', bocal: 'bocal', bocaux: 'bocal', pot: 'pot', pots: 'pot',
      bidon: 'bidon', bidons: 'bidon', seau: 'seau', seaux: 'seau', fut: 'fût', futs: 'fût',
      bac: 'bac', bacs: 'bac', botte: 'botte', bottes: 'botte', caisse: 'caisse', caisses: 'caisse',
      plateau: 'plateau', plateaux: 'plateau', rouleau: 'rouleau', rouleaux: 'rouleau',
    };
    const byId = new Map(UNITS.map((unit) => [unit.id, unit]));
    function normalize(value, fallback = 'unité') { return aliases[key(value)] || (fallback === '' ? '' : (aliases[key(fallback)] || 'unité')); }
    function info(value) { return byId.get(normalize(value, '')) || null; }
    function convert(qty, from, to) {
      const a = info(from), b = info(to), n = Number(qty);
      if (!Number.isFinite(n) || n < 0 || !a || !b) return null;
      if (a.id === b.id) return n;
      if (!['mass', 'volume'].includes(a.family) || a.family !== b.family) return null;
      return n * a.factor / b.factor;
    }
    function unitCost(cost, pricedBy, wantedUnit) {
      const one = convert(1, wantedUnit, pricedBy), n = Number(cost);
      return one == null || !Number.isFinite(n) ? null : n * one;
    }
    // Movement wire format: authoritative integer milli-units, including signed exits.
    function movementMilli(raw) {
      const qty = Number(raw && (raw.qty ?? raw.quantity));
      return raw && raw.qtyMilli != null ? Math.round(Number(raw.qtyMilli))
        : Math.round((Number.isFinite(qty) ? qty : 0) * 1000);
    }
    function recipeQuantity(line, quantity, yieldQuantity) {
      const number = v => Number.isFinite(+v) ? +v : 0;
      const per = line.stockQty != null ? number(line.stockQty) : number(line.qty);
      return per * quantity / (number(yieldQuantity) > 0 ? number(yieldQuantity) : 1);
    }
    return { UNITS, normalize, info, convert, unitCost, movementMilli, recipeQuantity };
  })();
  /* GENERATED SHARED KiwiRecipeUnits END */


  var PREFIX = 'kiwi:inventoryLedger:v1:';
  var subs = new Set();
  var syncing = false;
  /* Les motifs qu'une caisse écrit sans autorisation : la même liste que
   * AUTOMATIC_REASONS dans functions/api/inventory/movements.js. */
  var AUTOMATIC = { 'sale': 1, 'sale-reversal': 1 };
  var cachedKey = '';
  var cachedRaw = null;
  var cachedDoc = null;
  var cachedSnapshotDoc = null;
  var cachedSnapshot = null;
  var health = { lastStatus: 0, lastError: '', lastAttemptAt: 0, lastAcknowledgedAt: 0, storageError: false };

  function real() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!window.KiwiPlatform?.isPaired?.() || !!paired(); }
    catch (_) { return !!paired(); }
  }
  function paired() { try { return window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  /* QUEL MAGASIN ÉCRIT CE MOUVEMENT DE STOCK ?
   * L'appairage (`kiwiPairedVenue`) est l'identité du COMPTE derrière ce
   * comptoir, pas de l'établissement qu'on regarde. Un commerçant qui tient un
   * pressing, un restaurant et une boutique le voyait donc empiler trois stocks
   * dans un seul registre : une réception de tissu au pressing atterrissait sur
   * la même clé que le réassort du café.
   * `KiwiCloudDoc.currentSlug()` est la chaîne canonique (cloud-doc.js) :
   * établissement à l'écran d'abord, appairage ensuite, flux Live en dernier.
   * On la suit ; l'appairage ne reste qu'un filet quand cloud-doc n'a pas
   * encore répondu (ou n'est pas chargé sur cette page). */
  function merchant() {
    try {
      if (window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug) {
        var cur = window.KiwiCloudDoc.currentSlug(); if (cur) return String(cur).slice(0, 64);
      }
    } catch (_) {}
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedMerchant === 'function') {
        var pm = window.KiwiPlatform.pairedMerchant();
        if (pm) return pm;
      }
    } catch (_) {}
    var p = paired();
    if (p && p.merchant) return String(p.merchant).slice(0, 64);
    try {
      if (window.KiwiLive && window.KiwiLive.merchant) {
        var m = window.KiwiLive.merchant(); if (m) return String(m).slice(0, 64);
      }
    } catch (_) {}
    return '';
  }
  function terminalId() {
    try { return String(localStorage.getItem('kiwi:caisse:terminal-id:v1') || '').trim().slice(0, 80); }
    catch (_) { return ''; }
  }
  function key() { return PREFIX + merchant(); }
  function blank() {
    return { cursor: 0, base: {}, rows: [], queued: [], unitId: '', locationId: '', economatLocationId: '' };
  }
  function retainScope(d, scope) {
    if (!scope || typeof scope !== 'object') return d;
    d.unitId = String(scope.unitId || '').slice(0, 80);
    d.locationId = String(scope.locationId || '').slice(0, 80);
    d.economatLocationId = String(scope.economatLocationId || '').slice(0, 80);
    return d;
  }
  function unitId() { return String(read().unitId || '').slice(0, 80); }
  function locationId() {
    var d = read();
    return String(d.locationId || d.economatLocationId || 'principal').slice(0, 80);
  }
  function effectiveLocation(d, value) {
    var id = String(value || 'principal').slice(0, 80);
    return id === 'principal' && d.economatLocationId ? d.economatLocationId : id;
  }
  function read() {
    if (!real() || !merchant()) return blank();
    try {
      var k = key();
      var raw = localStorage.getItem(k) || 'null';
      if (cachedDoc && cachedKey === k && cachedRaw === raw) return cachedDoc;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') d = blank();
      d.base = d.base && typeof d.base === 'object' ? d.base : {};
      d.rows = Array.isArray(d.rows) ? d.rows : [];
      d.queued = Array.isArray(d.queued) ? d.queued : [];
      d.cursor = Math.max(0, +d.cursor || 0);
      d.unitId = String(d.unitId || '').slice(0, 80);
      d.locationId = String(d.locationId || '').slice(0, 80);
      d.economatLocationId = String(d.economatLocationId || '').slice(0, 80);
      cachedKey = k; cachedRaw = raw; cachedDoc = d;
      cachedSnapshotDoc = null; cachedSnapshot = null;
      return d;
    } catch (_) { return blank(); }
  }
  function balanceKey(r, d) {
    return [r.itemId || '', r.variantId || '', effectiveLocation(d, r.locationId)].join('|');
  }
  /* Au-delà de `max` lignes, les plus anciennes lignes ACQUITTÉES se fondent
   * dans le solde de base. Une ligne que le serveur n'a pas encore reçue (curseur
   * nul : en file, ou mise de côté) n'est jamais fondue ni jetée : c'était le cas
   * avant, et un registre de plus de 6 000 lignes perdait en silence des sorties
   * que D1 n'avait jamais vues. */
  function compact(d, max, keep) {
    max = max || 6000; keep = keep || 4000;
    if (d.rows.length <= max) return d;
    var tail = new Set(d.rows.slice(-keep).map(function (r) { return r.id; }));
    var out = [];
    d.rows.forEach(function (r) {
      if (tail.has(r.id) || !(+r.cursor > 0)) { out.push(r); return; }
      var k = balanceKey(r, d);
      d.base[k] = Math.round(((+d.base[k] || 0) + (+r.qty || 0)) * 1000) / 1000;
    });
    d.rows = out;
    return d;
  }
  /* UN STOCKAGE PLEIN NE DOIT PAS AVALER LES MOUVEMENTS EN SILENCE.
   * Si l'écriture échoue (quota du navigateur), on refond l'historique acquitté
   * à 1 000 lignes — la file, elle, reste entière — et on réessaie. Si cela
   * échoue encore, l'état le dit (`status().storageError`) et le battement de la
   * caisse le remonte à la console : avant, la vente ne laissait aucune trace. */
  function write(d, batch) {
    var k = key(); var next = d; var raw;
    try {
      next = compact(d); raw = JSON.stringify(next);
      try { localStorage.setItem(k, raw); }
      catch (error) {
        // Consumption retries through add() after a batch failure, so quota
        // compaction and subsequent costs follow the original per-row path.
        if (batch) throw error;
        next = compact(next, 1000, 1000); raw = JSON.stringify(next); localStorage.setItem(k, raw);
      }
      cachedKey = k; cachedRaw = raw; cachedDoc = next;
      cachedSnapshotDoc = null; cachedSnapshot = null;
      health.storageError = false;
    } catch (_) {
      health.storageError = true;
      cachedKey = ''; cachedRaw = null; cachedDoc = null;
      cachedSnapshotDoc = null; cachedSnapshot = null;
    }
    if (!batch || !health.storageError) subs.forEach(function (fn) { try { fn(); } catch (_) {} });
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function uuid() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function clean(raw) {
    raw = raw || {};
    var qty = KiwiRecipeUnits.movementMilli(raw) / 1000;
    return {
      id: String(raw.id || ('inv-' + uuid())).slice(0, 80),
      itemId: String(raw.itemId || '').slice(0, 80),
      variantId: String(raw.variantId || '').slice(0, 80),
      locationId: String(raw.locationId || 'principal').slice(0, 80),
      qty: qty, reason: String(raw.reason || 'manual').slice(0, 32),
      /* Un coût unitaire est un taux, pas un montant : arrondi au centime, un
       * ingrédient tenu au gramme (0,008 MAD) devient 0,01 — 25 % d'écart sur
       * tout le coût matière. Les montants, eux, s'arrondissent en aval. */
      unitCost: raw.unitCost == null || !Number.isFinite(+raw.unitCost) ? null : Math.max(0, Math.round(+raw.unitCost * 10000) / 10000),
      currency: String(raw.currency || 'MAD').slice(0, 3),
      refType: String(raw.refType || 'manual').slice(0, 32),
      refId: String(raw.refId || '').slice(0, 100),
      note: String(raw.note || '').slice(0, 500), actor: String(raw.actor || '').slice(0, 100),
      occurredTs: Math.max(1, Math.round(+raw.occurredTs || Date.now())),
      reversalOf: String(raw.reversalOf || '').slice(0, 80),
      meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : null,
      cursor: Math.max(0, +raw.cursor || 0),
      blocked: raw.blocked ? 1 : 0,
      refused: raw.refused ? String(raw.refused).slice(0, 40) : '',
    };
  }
  function add(raw) {
    if (!real() || !merchant()) return null;
    raw = Object.assign({}, raw || {});
    if (!raw.locationId) raw.locationId = locationId();
    var m = clean(raw);
    if (!m.itemId || !m.qty) return null;
    var d = read();
    if (d.rows.some(function (r) { return r.id === m.id; })) return m;
    d.rows.push(m); d.queued.push(m.id); write(d);
    setTimeout(sync, 0);
    return m;
  }
  // Preserve append order (including compaction boundaries), but publish once.
  // null signals a failed write so consumption can retry through legacy add().
  function addMany(rows) {
    if (!real() || !merchant() || (!Array.isArray(rows) && typeof rows !== 'function')) return null;
    var d = read();
    var ids = new Set(d.rows.map(function (r) { return r.id; }));
    var results = []; var changed = false;
    function append(raw) {
      raw = Object.assign({}, raw || {});
      if (!raw.locationId) raw.locationId = d.locationId || d.economatLocationId || 'principal';
      var m = clean(raw);
      if (!m.itemId || !m.qty) { results.push(null); return null; }
      results.push(m);
      if (ids.has(m.id)) return m;
      ids.add(m.id); d.rows.push(m); d.queued.push(m.id); changed = true;
      // Match the old per-add folding and base rounding exactly.
      var before = d.rows;
      compact(d);
      if (before !== d.rows) append.compactionVersion++;
      cachedSnapshotDoc = null; cachedSnapshot = null;
      return m;
    }
    append.has = function (id) { return ids.has(id); };
    append.compactionVersion = 0;
    // A producer can allocate costs against the staged ledger, including the
    // exact legacy compaction boundary, without publishing intermediate stock.
    if (typeof rows === 'function') rows(append);
    else rows.forEach(append);
    if (changed) {
      write(d, true);
      setTimeout(sync, 0);
      if (health.storageError) return null;
    }
    return results;
  }
  /* A transfer pair is authored atomically by the server. This hook mirrors
   * only acknowledged rows into the local ledger and never queues them for a
   * second POST, so the browser cannot split the pair or mint authority. */
  function acknowledge(rows) {
    if (!real() || !merchant() || !Array.isArray(rows)) return 0;
    var d = read(); var byId = new Map(d.rows.map(function (r) { return [r.id, r]; })); var added = 0;
    rows.forEach(function (raw) {
      var m = clean(raw);
      if (!m.id || !m.itemId || !m.qty) return;
      if (!byId.has(m.id)) { d.rows.push(m); byId.set(m.id, m); added++; }
      else if (m.cursor) byId.get(m.id).cursor = m.cursor;
      d.queued = d.queued.filter(function (id) { return id !== m.id; });
      /* Le curseur de lecture n'avance pas ici : il ne bouge qu'avec pull().
       * Le numéro d'une ligne qu'on vient d'écrire peut dépasser des lignes
       * d'autres caisses pas encore lues ; y sauter les perdait pour toujours. */
    });
    if (added || rows.length) write(d);
    return added;
  }
  function ensureOpening(itemId, qty, opts) {
    opts = opts || {};
    qty = Math.round((+qty || 0) * 1000) / 1000;
    if (!itemId || !qty) return null;
    var targetLocation = opts.locationId || locationId();
    var seed = [merchant(), itemId, opts.variantId || '', targetLocation].join('|');
    return add({
      id: 'inv-open-' + hash(seed), itemId: itemId, variantId: opts.variantId,
      locationId: targetLocation, qty: qty, reason: 'opening', unitCost: opts.unitCost,
      refType: 'opening', refId: itemId, note: opts.note || 'Solde initial migré',
      occurredTs: opts.occurredTs,
    });
  }
  function snapshotFor(d) {
    if (cachedSnapshotDoc === d && cachedSnapshot) return cachedSnapshot;
    var out = {};
    Object.keys(d.base).forEach(function (key) {
      var parts = key.split('|');
      var mapped = [parts[0] || '', parts[1] || '', effectiveLocation(d, parts[2])].join('|');
      out[mapped] = Math.round(((+out[mapped] || 0) + (+d.base[key] || 0)) * 1000) / 1000;
    });
    d.rows.forEach(function (r) {
      var k = balanceKey(r, d); out[k] = Math.round(((+out[k] || 0) + (+r.qty || 0)) * 1000) / 1000;
    });
    cachedSnapshotDoc = d; cachedSnapshot = out;
    return out;
  }
  function snapshot() { return Object.assign({}, snapshotFor(read())); }
  function balance(itemId, opts) {
    opts = opts || {}; var d = read(); var snap = snapshotFor(d); var total = 0;
    var requestedLocation = opts.locationId == null ? null : effectiveLocation(d, opts.locationId);
    Object.keys(snap).forEach(function (k) {
      var p = k.split('|');
      if (p[0] !== String(itemId)) return;
      if (opts.variantId != null && p[1] !== String(opts.variantId)) return;
      if (requestedLocation != null && p[2] !== requestedLocation) return;
      total += +snap[k] || 0;
    });
    return Math.round(total * 1000) / 1000;
  }
  function history(itemId, opts) {
    var d = read(); opts = opts || {};
    var requestedLocation = opts.locationId == null ? null : effectiveLocation(d, opts.locationId);
    return d.rows.filter(function (r) {
      if (itemId && r.itemId !== itemId) return false;
      return requestedLocation == null || effectiveLocation(d, r.locationId) === requestedLocation;
    }).map(function (r) {
      if (requestedLocation == null) return r;
      return Object.assign({}, r, { locationId: effectiveLocation(d, r.locationId) });
    })
      .sort(function (a, b) { return b.occurredTs - a.occurredTs; });
  }
  /* Read-only bounded range for exports.  Keeping this filtering in the ledger
   * avoids reports reaching into its private localStorage shape (and therefore
   * accidentally mixing tenants). */
  function between(from, to) {
    from = Math.max(0, +from || 0); to = Math.max(from, +to || Date.now());
    return read().rows.filter(function (r) {
      return (+r.occurredTs || 0) >= from && (+r.occurredTs || 0) < to;
    }).sort(function (a, b) { return a.occurredTs - b.occurredTs; });
  }
  /* Le serveur ne connaît que ses motifs (REASONS, movements.js). « waste »,
   * écrit par l'ancienne déclaration de perte, n'en est pas un : chaque lot qui
   * le portait était refusé (400) et la file de l'appareil restait bloquée
   * derrière lui. On l'envoie sous son nom serveur. */
  var WIRE_REASON = { waste: 'loss', casse: 'loss', perte: 'loss', perime: 'expiry' };
  function post(m, movements) {
    return fetch('/api/inventory/movements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ merchant: m, movements: movements, terminalId: terminalId() }),
    });
  }
  async function refusal(res) {
    try { var b = await res.json(); return b && typeof b === 'object' ? b : {}; } catch (_) { return {}; }
  }
  function settle(d, body) {
    retainScope(d, body.scope);
    var cursors = new Map((body.accepted || []).map(function (x) { return [x.id, +x.cursor || 0]; }));
    d.rows.forEach(function (r) { if (cursors.has(r.id)) r.cursor = cursors.get(r.id); });
    d.queued = d.queued.filter(function (id) { return !cursors.has(id); });
    if (cursors.size) health.lastAcknowledgedAt = Date.now();
  }
  /* Une ligne mise de côté reste au stock local et à l'historique ; elle sort
   * seulement de la file, avec la raison du refus. */
  function setAside(d, ids, why) {
    var out = new Set(ids);
    d.rows.forEach(function (r) { if (out.has(r.id)) { r.blocked = 1; r.refused = String(why || 'refused').slice(0, 40); } });
    d.queued = d.queued.filter(function (id) { return !out.has(id); });
  }
  /* 400 (ligne invalide), 409 (même id, autre contenu) et 422 désignent une
   * LIGNE, pas une panne : renvoyer le même lot ne passera jamais. */
  var ROW_REFUSAL = { 400: 1, 409: 1, 422: 1 };
  async function push(d, m, round) {
    round = round || 0;
    var ids = d.queued.slice(0, 200);
    if (!ids.length) return d;
    var set = new Set(ids);
    var movements = d.rows.filter(function (r) { return set.has(r.id); });
    if (!movements.length) { d.queued = d.queued.filter(function (id) { return !set.has(id); }); return d; }
    movements.forEach(function (r) { if (WIRE_REASON[r.reason]) r.reason = WIRE_REASON[r.reason]; });
    var res = await post(m, movements);
    health.lastStatus = res.status;
    /* UN REFUS N'EST PAS UNE PANNE RÉSEAU.
     * Le serveur refuse un motif discrétionnaire écrit depuis une caisse
     * (movements.js : seul le propriétaire, un opérateur nommé ou un code
     * responsable vérifié peut en poster). Relancer la même écriture toutes les
     * vingt secondes ne la fera jamais passer : la file resterait bloquée, et
     * avec elle les VENTES légitimes derrière. On sort donc ces lignes de la
     * file en les marquant — le stock local et l'historique les gardent, elles
     * portent simplement « à autoriser » au lieu de tourner en boucle.
     * Le serveur refuse le LOT ENTIER dès qu'une seule ligne est
     * discrétionnaire. On ne sort donc que celles-là : une vente ou un retour
     * du même lot n'a rien à se faire autoriser, et la bloquer avec elles la
     * gardait pour toujours sur la tablette — la sortie n'arrivait jamais au
     * tableau de bord. Elle repart aussitôt, sans la ligne refusée. */
    if (res.status === 403) {
      var refused = await refusal(res);
      if (refused.error === 'reason-forbidden') {
        var held = movements.filter(function (r) { return !AUTOMATIC[r.reason]; });
        setAside(d, (held.length ? held : movements).map(function (r) { return r.id; }), 'reason-forbidden');
        return round < 4 ? push(d, m, round + 1) : d;
      }
      health.lastError = String(refused.error || 'http-403').slice(0, 96);
      throw new Error('inventory-push-403');
    }
    /* UNE LIGNE REFUSÉE NE BLOQUE PLUS LA FILE.
     * Avant, un lot refusé pour une seule ligne (un motif inconnu, un id déjà
     * écrit par un autre appareil avec un autre contenu) repartait tel quel
     * toutes les vingt secondes, pour toujours, et chaque vente derrière lui
     * restait sur la tablette sans qu'aucune erreur ne s'affiche. Un 409 qui
     * nomme ses ids les met de côté ; sinon on renvoie le lot ligne par ligne,
     * et seule la ligne refusée seule est mise de côté. */
    if (ROW_REFUSAL[res.status]) {
      var why = await refusal(res);
      health.lastError = String(why.error || ('http-' + res.status)).slice(0, 96);
      var named = res.status === 409 && Array.isArray(why.ids)
        ? why.ids.filter(function (id) { return set.has(id); }) : [];
      if (named.length) { setAside(d, named, why.error || 'id-conflict'); return round < 4 ? push(d, m, round + 1) : d; }
      if (movements.length === 1) { setAside(d, [movements[0].id], why.error || ('http-' + res.status)); return d; }
      for (var i = 0; i < movements.length; i++) {
        var one = await post(m, [movements[i]]);
        if (one.ok) { settle(d, await one.json()); continue; }
        var alone = await refusal(one);
        if (ROW_REFUSAL[one.status] || (one.status === 403 && alone.error === 'reason-forbidden')) {
          setAside(d, [movements[i].id], alone.error || ('http-' + one.status));
          continue;
        }
        health.lastStatus = one.status;
        throw new Error('inventory-push-' + one.status);
      }
      return d;
    }
    if (!res.ok) { health.lastError = 'http-' + res.status; throw new Error('inventory-push-' + res.status); }
    settle(d, await res.json());
    health.lastError = '';
    return d;
  }
  /* `since` pagine dans le tour ; seul `cursor`, que le serveur garde un peu
   * derrière l'horloge, est conservé d'un tour à l'autre. */
  async function pull(d, m) {
    var since = d.cursor;
    do {
      var res = await fetch('/api/inventory/movements?merchant=' + encodeURIComponent(m) + '&since=' + encodeURIComponent(since) + '&terminalId=' + encodeURIComponent(terminalId()), { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error('inventory-pull-' + res.status);
      var body = await res.json(); retainScope(d, body.scope);
      var byId = new Map(d.rows.map(function (r) { return [r.id, r]; }));
      (body.movements || []).forEach(function (raw) {
        var r = clean(raw); r.cursor = +raw.cursor || 0;
        if (!byId.has(r.id)) { d.rows.push(r); byId.set(r.id, r); }
        else if (r.cursor) byId.get(r.id).cursor = r.cursor;
      });
      d.cursor = Math.max(d.cursor, +body.cursor || 0);
      var next = Math.max(d.cursor, +body.next || 0);
      if (!(next > since) || !(body.more || +body.next > 0)) break;
      since = next;
    } while (true);
    return d;
  }
  async function sync() {
    var online = typeof navigator === 'undefined' || navigator.onLine !== false;
    var m = merchant(); if (syncing || !real() || !m || !online) return false;
    syncing = true; health.lastAttemptAt = Date.now();
    try { var d = read(); d = await push(d, m); d = await pull(d, m); write(d); return true; }
    catch (e) {
      if (!health.lastError) health.lastError = String((e && e.message) || 'sync-failed').slice(0, 96);
      return false;
    }
    finally { syncing = false; }
  }
  function reverse(movement, reason, note, opts) {
    if (!movement || !movement.id || !movement.qty) return null;
    opts = opts || {};
    return add({
      // Même contre-mouvement au double clic ou au rejeu.
      id: opts.id || ('inv-reverse-' + hash(merchant() + '|' + movement.id)),
      itemId: movement.itemId, variantId: movement.variantId, locationId: movement.locationId,
      qty: -movement.qty, reason: reason || 'manual', unitCost: movement.unitCost,
      refType: movement.refType, refId: movement.refId, note: note || 'Contre-mouvement',
      reversalOf: movement.id,
    });
  }

  /* Ce que la caisse dit d'elle-même au battement : combien de mouvements
   * attendent, combien le serveur a refusés, et le dernier refus. Sans cela, une
   * file bloquée ne se voyait nulle part (Pasta Corner, octobre 2026 : trois
   * semaines de ventes sans une sortie de stock, et aucune erreur). */
  function status() {
    var d = read(); var q = new Set(d.queued); var oldest = 0;
    var refused = d.rows.filter(function (r) { return r.blocked; });
    d.rows.forEach(function (r) { if (q.has(r.id) && (!oldest || +r.occurredTs < oldest)) oldest = +r.occurredTs || 0; });
    return {
      pending: d.queued.length, refused: refused.length, oldestPendingAt: oldest,
      refusedEntries: refused.slice(-20).map(function (r) {
        return { id: r.id, itemId: r.itemId, qty: r.qty, reason: r.reason, why: r.refused || 'reason-forbidden', ts: r.occurredTs };
      }),
      lastStatus: health.lastStatus, lastError: health.lastError,
      lastAttemptAt: health.lastAttemptAt, lastAcknowledgedAt: health.lastAcknowledgedAt,
      storageError: health.storageError,
    };
  }
  function startBackgroundSync() {
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('storage', function (e) { if (e.key && e.key.indexOf(PREFIX) === 0) subs.forEach(function (fn) { try { fn(); } catch (_) {} }); });
    setInterval(sync, 20000);
    setTimeout(sync, 1200);
  }
  if (window.KiwiDashboardBoot?.whenUnlocked) window.KiwiDashboardBoot.whenUnlocked(startBackgroundSync);
  else startBackgroundSync();

  window.KiwiInventory = {
    isReal: real, merchant: merchant, terminalId: terminalId, unitId: unitId, locationId: locationId,
    add: add, addMany: addMany, acknowledge: acknowledge, reverse: reverse,
    ensureOpening: ensureOpening, balance: balance, snapshot: snapshot, history: history, between: between,
    sync: sync, pending: function () { return read().queued.length; }, status: status,
    subscribe: function (fn) { subs.add(fn); return function () { subs.delete(fn); }; },
  };
}());
