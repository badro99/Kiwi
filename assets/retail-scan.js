/* Kiwi Retail Scan — continuous phone-camera checkout for product-led stores.
 * Vanilla, local-first, and deliberately additive: every métier keeps its native
 * checkout while this shared lane writes to the same catalog, stock and sales
 * truth as the owner dashboard. */
(function () {
  'use strict';

  var ELIGIBLE = { boutique: 1, epicerie: 1, pharmacie: 1, librairie: 1, fleuriste: 1, autre: 1 };
  var LABELS = {
    boutique: 'Vente boutique', epicerie: 'Vente épicerie', pharmacie: 'Vente pharmacie',
    librairie: 'Vente librairie', fleuriste: 'Vente fleuriste', autre: 'Vente comptoir',
  };
  var FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code'];
  var mounted = Object.create(null);
  var current = '';
  var currentRoot = null;
  var overlay = null;
  var video = null;
  var stream = null;
  var detector = null;
  var raf = 0;
  var stopped = true;
  var torch = false;
  var torchTrack = null;
  var lastRead = Object.create(null);
  var creditCloud = null;
  var committed = false;
  var state = { cart: [], lookup: null, pending: '', parts: [], method: 'cash', clientId: '', lastReceipt: null };

  function $(q, at) { return (at || document).querySelector(q); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function money(n) { n = Math.round((+n || 0) * 100) / 100; return Number.isFinite(n) ? n : 0; }
  function fmt(n) { return new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(money(n)) + ' MAD'; }
  function normalizeCode(raw) { return String(raw == null ? '' : raw).trim().replace(/[\r\n\t]/g, ''); }
  function toast(msg, kind) {
    if (window.KiwiCaisseToast) { window.KiwiCaisseToast(msg, kind); return; }
    var fn = window.KiwiPosDispatch && window.KiwiPosDispatch.toast;
    if (typeof fn === 'function') fn(msg);
  }
  function icons() { try { if (window.lucide) window.lucide.createIcons(); } catch (_) {} }

  function paired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function venueKey(vertical) {
    var p = paired();
    if (p && (p.merchant || p.venueId || p.id)) return String(p.merchant || p.venueId || p.id);
    try { var s = window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug(); if (s) return String(s); } catch (_) {}
    return 'demo-retail-' + String(vertical || 'store');
  }
  function storeName() {
    var p = paired();
    return (p && p.name) || LABELS[current] || 'Kiwi';
  }
  function storageKey() { return 'kiwi:retailScan:v1:' + venueKey(current); }
  function creditKey() { return 'kiwi:retailCredit:v1:' + venueKey(current); }
  function blankCredit() { return { seq: 0, entries: [] }; }
  function readCredit() {
    try {
      var d = JSON.parse(localStorage.getItem(creditKey()) || 'null');
      return d && Array.isArray(d.entries) ? d : blankCredit();
    } catch (_) { return blankCredit(); }
  }
  function mergeCredits(a, b) {
    var by = Object.create(null), seq = Math.max(+(a && a.seq) || 0, +(b && b.seq) || 0);
    [a, b].forEach(function (d) {
      ((d && d.entries) || []).forEach(function (x) {
        if (!x || !x.id) return;
        var old = by[x.id];
        if (!old || (+x.updated || +x.ts || 0) >= (+old.updated || +old.ts || 0)) by[x.id] = x;
      });
    });
    return { seq: seq, entries: Object.keys(by).map(function (k) { return by[k]; }).sort(function (x, y) { return (+x.ts || 0) - (+y.ts || 0); }).slice(-3000) };
  }
  function writeCredit(d, push) {
    try { localStorage.setItem(creditKey(), JSON.stringify(d)); } catch (_) {}
    if (push !== false && creditCloud) try { creditCloud.push(0); } catch (_) {}
  }
  function bindCredit() {
    creditCloud = null;
    if (!window.KiwiCloudDoc || !window.KiwiCloudDoc.attach) return;
    creditCloud = window.KiwiCloudDoc.attach({
      feature: 'retailcredit', slug: function () { return venueKey(current); }, localKey: creditKey,
      read: readCredit,
      write: function (d) { writeCredit(d && Array.isArray(d.entries) ? d : blankCredit(), false); if (overlay && overlay.classList.contains('is-open')) renderPayment(); },
      merge: mergeCredits,
      isEmpty: function (d) { return !d || !d.entries || !d.entries.length; },
    });
    try { creditCloud.bind(); } catch (_) {}
  }

  function loadSession() {
    state.cart = []; state.parts = []; state.clientId = '';
    try {
      var d = JSON.parse(localStorage.getItem(storageKey()) || 'null');
      if (d && Array.isArray(d.cart)) state.cart = d.cart.filter(function (l) { return l && l.productId && l.variantId && +l.qty > 0; }).slice(0, 100);
      if (d && Array.isArray(d.parts)) state.parts = d.parts.filter(function (p) { return p && ['cash', 'card', 'credit'].indexOf(p.method) >= 0 && +p.amount > 0; }).slice(0, 8);
      if (d && d.clientId) state.clientId = String(d.clientId).slice(0, 80);
    } catch (_) {}
    state.lookup = null; state.pending = ''; state.method = 'cash'; state.lastReceipt = null;
  }
  function saveSession() {
    try { localStorage.setItem(storageKey(), JSON.stringify({ v: 1, vertical: current, cart: state.cart, parts: state.parts, clientId: state.clientId, updated: Date.now() })); } catch (_) {}
    paintLaunches();
  }

  function catalog() { return window.KiwiBoutiqueCatalog || null; }
  function bindCatalog() {
    var C = catalog(), key = venueKey(current);
    if (!C) return false;
    try { C.use(key); } catch (_) {}
    try {
      if (window.KiwiPromos) {
        window.KiwiPromos.use(key);
        window.KiwiPromos.cloud(function () { return key; });
      }
    } catch (_) {}
    return true;
  }
  function categoryName(id) {
    var C = catalog(), cats = C ? C.listCategories() : [];
    var c = cats.find(function (x) { return x.id === id; });
    return c ? c.name : 'Sans catégorie';
  }
  function stockFor(hit) {
    if (!hit || !hit.product || !hit.variant) return 0;
    try {
      var I = window.KiwiInventory;
      var hist = I && I.history && I.history(hit.product.id);
      if (hist && hist.length) return Math.max(0, I.balance(hit.product.id, { variantId: hit.variant.id }));
    } catch (_) {}
    return Math.max(0, +hit.variant.stock || 0);
  }
  function priceFor(product, stock) {
    var base = money(product && product.priceMAD);
    try {
      var P = window.KiwiPromos;
      var promo = P && P.priceFor(Object.assign({}, product, { price: base }), { stock: stock });
      if (promo) return { price: money(promo.price), was: money(promo.was), badge: promo.badge || (promo.promo && promo.promo.name) || 'Promotion' };
    } catch (_) {}
    return { price: base, was: 0, badge: '' };
  }
  function lookup(code) {
    var C = catalog(); if (!C) return null;
    var hit = C.findByBarcode(code); if (!hit) return null;
    var stock = stockFor(hit), price = priceFor(hit.product, stock);
    return { code: code, product: hit.product, variant: hit.variant, stock: stock, price: price.price, was: price.was, promo: price.badge, category: categoryName(hit.product.categoryId) };
  }

  function cartTotal() { return money(state.cart.reduce(function (s, l) { return s + money(l.unitPrice) * (+l.qty || 0); }, 0)); }
  function cartQty() { return state.cart.reduce(function (s, l) { return s + (+l.qty || 0); }, 0); }
  function lineFor(hit) { return state.cart.find(function (l) { return l.variantId === hit.variant.id; }); }
  function addHit(hit, quiet) {
    if (!hit || !(hit.stock > 0)) { if (!quiet) toast('Article en rupture, impossible de l’ajouter'); return false; }
    var line = lineFor(hit), qty = line ? +line.qty || 0 : 0;
    if (qty >= hit.stock) { if (!quiet) toast('Stock atteint pour ' + hit.product.name); return false; }
    if (line) {
      line.qty++;
      line.maxStock = hit.stock;
      line.unitPrice = hit.price;
      line.basePrice = money(hit.product.priceMAD);
      line.promo = hit.promo || '';
    } else {
      state.cart.push({
        productId: hit.product.id, variantId: hit.variant.id, code: hit.code,
        name: hit.product.name, category: hit.category, qty: 1, maxStock: hit.stock,
        unitPrice: hit.price, basePrice: money(hit.product.priceMAD), unitCost: money(hit.product.cost), promo: hit.promo || '',
      });
    }
    saveSession(); renderCart();
    if (!quiet) toast(hit.product.name + ' ajouté · ' + fmt(hit.price));
    return true;
  }
  function setQty(idx, qty) {
    var l = state.cart[idx]; if (!l) return;
    qty = Math.floor(+qty || 0);
    if (qty <= 0) state.cart.splice(idx, 1);
    else if (qty <= (+l.maxStock || 0)) l.qty = qty;
    else { toast('Stock limité à ' + l.maxStock + ' pour ' + l.name); return; }
    saveSession(); renderCart();
  }

  function blip() {
    try { if (navigator.vibrate) navigator.vibrate(32); } catch (_) {}
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ac = new AC(), o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 1900; g.gain.setValueAtTime(.045, ac.currentTime); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + .1);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + .11); setTimeout(function () { try { ac.close(); } catch (_) {} }, 220);
    } catch (_) {}
  }
  function scan(raw) {
    var code = normalizeCode(raw), KB = window.KiwiBarcode;
    if (!code) return false;
    if (KB && KB.validate) {
      var valid = KB.validate(code);
      if (!valid.ok) { toast('Code incomplet ou illisible'); return false; }
    }
    var now = Date.now();
    if (lastRead[code] && now - lastRead[code] < 900) return false;
    lastRead[code] = now;
    blip();
    var hit = lookup(code);
    if (!hit) {
      state.lookup = null; state.pending = code; renderResult();
      setCameraStatus('<b>Code inconnu</b> · créez sa fiche, la caméra reste prête');
      return true;
    }
    state.pending = ''; state.lookup = hit;
    addHit(hit, true); renderResult();
    setCameraStatus('<b>' + esc(hit.product.name) + '</b> · ' + esc(fmt(hit.price)) + ' · ' + esc(String(hit.stock)) + ' en stock');
    return true;
  }

  function setCameraStatus(html) { var el = overlay && $('.krs-camera-status', overlay); if (el) el.innerHTML = html; }
  function cameraAvailable() { try { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.BarcodeDetector); } catch (_) { return false; } }
  async function startCamera() {
    if (!overlay || !overlay.classList.contains('is-open') || !cameraAvailable()) {
      setCameraStatus('<b>Caméra non disponible</b> · la douchette et la saisie manuelle restent actives');
      if (video) video.classList.add('is-idle');
      return false;
    }
    stopCamera(); stopped = false;
    try {
      var supported = FORMATS;
      try { var got = await window.BarcodeDetector.getSupportedFormats(); var common = FORMATS.filter(function (x) { return got.indexOf(x) >= 0; }); if (common.length) supported = common; } catch (_) {}
      detector = new window.BarcodeDetector({ formats: supported });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (stopped) { stream.getTracks().forEach(function (t) { t.stop(); }); return false; }
      video.srcObject = stream; video.classList.remove('is-idle'); await video.play();
      torchTrack = stream.getVideoTracks()[0] || null;
      try {
        var caps = torchTrack && torchTrack.getCapabilities ? torchTrack.getCapabilities() : null;
        var tb = $('.krs-torch', overlay); if (tb) tb.hidden = !(caps && caps.torch);
      } catch (_) {}
      setCameraStatus('<b>Lecture continue active</b> · présentez les produits l’un après l’autre');
      var last = 0;
      var tick = async function (ts) {
        if (stopped) return;
        if (!state.pending && ts - last > 110 && video.readyState >= 2) {
          last = ts;
          try { var hits = await detector.detect(video); if (hits && hits[0] && hits[0].rawValue) scan(hits[0].rawValue); } catch (_) {}
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return true;
    } catch (err) {
      var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setCameraStatus(denied ? '<b>Accès caméra refusé</b> · autorisez-le dans le navigateur' : '<b>Caméra indisponible</b> · utilisez la douchette ou le champ');
      if (video) video.classList.add('is-idle');
      return false;
    }
  }
  function stopCamera() {
    stopped = true; if (raf) cancelAnimationFrame(raf); raf = 0;
    try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
    stream = null; detector = null; torchTrack = null; torch = false;
    try { if (video) { video.pause(); video.srcObject = null; video.classList.add('is-idle'); } } catch (_) {}
  }
  function toggleTorch() {
    if (!torchTrack) return; torch = !torch;
    Promise.resolve(torchTrack.applyConstraints({ advanced: [{ torch: torch }] })).catch(function () { torch = false; });
    var b = $('.krs-torch', overlay); if (b) b.classList.toggle('is-on', torch);
  }

  function categoryOptions() {
    var C = catalog(), cats = C ? C.listCategories() : [];
    return cats.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('') + '<option value="__new">Nouvelle catégorie…</option>';
  }
  function renderResult() {
    var out = overlay && $('.krs-result', overlay); if (!out) return;
    overlay.classList.toggle('is-creating', !!state.pending);
    if (state.pending) {
      out.innerHTML = '<div class="krs-create"><h2>Créer ce produit</h2><p>Code <b>' + esc(state.pending) + '</b> · la fiche sera immédiatement partagée avec le dashboard.</p>' +
        '<div class="krs-form"><div class="krs-field"><label>Nom du produit</label><input id="krs-new-name" maxlength="80" autocomplete="off" placeholder="Nom affiché" /></div>' +
        '<div class="krs-field"><label>Prix</label><input id="krs-new-price" type="number" min="0" max="1000000" step="0.01" inputmode="decimal" placeholder="0,00" /></div>' +
        '<div class="krs-field"><label>Stock initial</label><input id="krs-new-stock" type="number" min="0" max="100000" step="1" inputmode="numeric" value="1" /></div>' +
        '<div class="krs-field"><label>Catégorie</label><select id="krs-new-cat">' + categoryOptions() + '</select></div>' +
        '<div class="krs-field"><label>Nouvelle catégorie</label><input id="krs-new-catname" maxlength="50" placeholder="Si nécessaire" /></div>' +
        '<div class="krs-field"><label>Coût unitaire</label><input id="krs-new-cost" type="number" min="0" max="1000000" step="0.01" inputmode="decimal" placeholder="Facultatif" /></div></div>' +
        '<div class="krs-create-actions"><button class="krs-btn" data-krs-skip>Ignorer</button><button class="krs-btn primary" data-krs-create>Créer et ajouter</button></div></div>';
      setTimeout(function () { var n = $('#krs-new-name', out); if (n) n.focus(); }, 30);
      return;
    }
    var h = state.lookup;
    if (!h) {
      out.innerHTML = '<div class="krs-empty"><div><i data-lucide="scan-barcode"></i><b>Scannez sans interrompre la vente</b><br><span>Le prix, le stock et la promotion apparaissent ici.</span></div></div>';
      icons(); return;
    }
    var cls = h.stock <= 0 ? ' is-out' : h.stock <= 3 ? ' is-low' : '';
    out.innerHTML = '<div class="krs-card"><div><div class="krs-eyebrow">' + esc(h.category) + '</div><div class="krs-product-name">' + esc(h.product.name) + '</div>' +
      '<div class="krs-product-meta">' + esc(h.code) + (h.variant.size ? ' · ' + esc(h.variant.size) : '') + '</div>' +
      '<div class="krs-stock' + cls + '"><span>Stock disponible</span><b>' + esc(String(h.stock)) + '</b></div>' +
      '<button class="krs-add" data-krs-add ' + (h.stock > 0 ? '' : 'disabled') + '>Ajouter encore</button></div>' +
      '<div class="krs-price"><span class="krs-price-now">' + esc(fmt(h.price)) + '</span>' +
      (h.was ? '<span class="krs-price-was">' + esc(fmt(h.was)) + '</span>' : '') +
      (h.promo ? '<span class="krs-promo">' + esc(h.promo) + '</span>' : '') + '</div></div>';
  }
  function createPending() {
    var C = catalog(); if (!C || !state.pending) return;
    var name = ($('#krs-new-name', overlay) || {}).value || '';
    var price = money(($('#krs-new-price', overlay) || {}).value);
    var stock = Math.max(0, Math.floor(+((($('#krs-new-stock', overlay) || {}).value)) || 0));
    var cost = money(($('#krs-new-cost', overlay) || {}).value);
    var categoryId = ($('#krs-new-cat', overlay) || {}).value || '';
    var newCat = String((($('#krs-new-catname', overlay) || {}).value) || '').trim();
    name = String(name).trim();
    if (!name) { toast('Le nom du produit est requis'); return; }
    if (!(price >= 0)) { toast('Le prix est invalide'); return; }
    var code = state.pending, product, variant;
    try {
      C.batch(function () {
        if (categoryId === '__new' || !categoryId) {
          var cat = C.addCategory(newCat || 'Nouveaux produits', 'atlas'); categoryId = cat.id;
        }
        product = C.addProduct({ name: name, categoryId: categoryId, priceMAD: price, cost: cost, kind: 'unite', art: current });
        variant = C.addVariant({ productId: product.id, colorId: 'standard', colorLabel: 'Standard', size: 'Unité', stock: stock });
        var attached = C.attachBarcode(variant.id, code, { type: 'imported' });
        if (!attached || !attached.ok) throw new Error((attached && attached.reason) || 'code-invalide');
      });
      try { if (stock && window.KiwiInventory) window.KiwiInventory.ensureOpening(product.id, stock, { variantId: variant.id, unitCost: cost, note: 'Stock initial · création au scan' }); } catch (_) {}
    } catch (err) { toast('Création impossible · ' + err.message); return; }
    state.pending = '';
    state.lookup = lookup(code);
    if (state.lookup) addHit(state.lookup, true);
    renderResult(); renderCart();
    setCameraStatus('<b>' + esc(name) + '</b> créé et ajouté · lecture continue active');
    toast(name + ' créé dans le catalogue partagé');
  }

  function renderCart() {
    var head = overlay && $('.krs-cart-head', overlay), lines = overlay && $('.krs-lines', overlay), foot = overlay && $('.krs-cart-foot', overlay);
    if (!head || !lines || !foot) return;
    head.innerHTML = '<b>Panier</b><span>' + cartQty() + ' article' + (cartQty() > 1 ? 's' : '') + '</span>' + (state.cart.length ? '<button class="krs-clear" data-krs-clear>Vider</button>' : '');
    lines.innerHTML = state.cart.length ? state.cart.map(function (l, i) {
      return '<div class="krs-line"><div><div class="krs-line-name">' + esc(l.name) + '</div><div class="krs-line-meta">' + esc(fmt(l.unitPrice)) + (l.promo ? ' · ' + esc(l.promo) : '') + ' · stock ' + esc(String(l.maxStock)) + '</div>' +
        '<div class="krs-stepper"><button data-krs-minus="' + i + '" aria-label="Retirer">−</button><b>' + l.qty + '</b><button data-krs-plus="' + i + '" aria-label="Ajouter">+</button></div></div>' +
        '<div class="krs-line-total">' + esc(fmt(l.unitPrice * l.qty)) + '</div></div>';
    }).join('') : '<div class="krs-cart-empty"><div><i data-lucide="shopping-basket"></i><br>Le prochain scan arrive ici.</div></div>';
    foot.innerHTML = '<div class="krs-total"><span>Total à encaisser</span><b>' + esc(fmt(cartTotal())) + '</b></div><button class="krs-checkout" data-krs-checkout ' + (state.cart.length ? '' : 'disabled') + '>Encaisser</button>';
    paintLaunches(); icons();
  }

  function clients() { try { return window.KiwiClients ? window.KiwiClients.list() : []; } catch (_) { return []; } }
  function due() { return money(cartTotal() - state.parts.reduce(function (s, p) { return s + (+p.amount || 0); }, 0)); }
  function methodLabel(m) { return ({ cash: 'Espèces', card: 'Carte', credit: 'Crédit client' })[m] || m; }
  function renderPayment() {
    var pay = overlay && $('.krs-pay', overlay); if (!pay || !pay.classList.contains('is-open')) return;
    if (state.lastReceipt) {
      pay.innerHTML = '<div class="krs-pay-card"><h2>Vente enregistrée</h2><p class="krs-pay-sub">Le stock, le journal et le dashboard ont reçu la même vente.</p>' +
        '<div class="krs-due"><span>Total</span><b>' + esc(fmt(state.lastReceipt.total)) + '</b></div><div class="krs-pay-status" id="krs-pay-status"></div>' +
        '<div class="krs-pay-actions"><button data-krs-print><i data-lucide="printer"></i> Imprimer</button><button data-krs-pay-close>Continuer</button></div></div>';
      icons(); return;
    }
    var cs = clients();
    pay.innerHTML = '<div class="krs-pay-card"><h2>Encaissement</h2><p class="krs-pay-sub">Ajoutez une ou plusieurs parts. La vente n’est validée qu’une seule fois quand le solde atteint zéro.</p>' +
      '<div class="krs-due"><span>Reste à régler</span><b>' + esc(fmt(due())) + '</b></div>' +
      '<div class="krs-methods">' + ['cash', 'card', 'credit'].map(function (m) { return '<button class="krs-method ' + (state.method === m ? 'is-on' : '') + '" data-krs-method="' + m + '"><i data-lucide="' + (m === 'cash' ? 'banknote' : m === 'card' ? 'credit-card' : 'notebook-tabs') + '"></i>' + methodLabel(m) + '</button>'; }).join('') + '</div>' +
      (state.method === 'credit' ? '<div class="krs-customer"><select id="krs-client"><option value="">Choisir un client…</option>' + cs.map(function (c) { return '<option value="' + esc(c.id) + '" ' + (state.clientId === c.id ? 'selected' : '') + '>' + esc(c.name || c.phone || 'Client') + (c.phone ? ' · ' + esc(c.phone) : '') + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="krs-part"><input id="krs-part-amount" type="number" min="0.01" max="' + due() + '" step="0.01" inputmode="decimal" value="' + due().toFixed(2) + '" aria-label="Montant de la part" /><button data-krs-add-part>Ajouter la part</button></div>' +
      '<div class="krs-parts">' + state.parts.map(function (p) { return '<div class="krs-part-row"><span>' + esc(methodLabel(p.method)) + (p.clientName ? ' · ' + esc(p.clientName) : '') + '</span><b>' + esc(fmt(p.amount)) + '</b></div>'; }).join('') + '</div>' +
      '<div class="krs-pay-status" id="krs-pay-status"></div><div class="krs-pay-actions"><button data-krs-pay-cancel>' + (state.parts.length ? 'Terminer le solde' : 'Annuler') + '</button></div></div>';
    icons();
  }
  function paymentStatus(msg) { var s = overlay && $('#krs-pay-status', overlay); if (s) s.textContent = msg || ''; }
  async function addPaymentPart() {
    if (committed || due() <= 0) return;
    var input = $('#krs-part-amount', overlay), amount = money(input && input.value);
    if (!(amount > 0) || amount - due() > .001) { paymentStatus('Le montant doit être compris entre 0,01 MAD et le solde restant.'); return; }
    var part = { method: state.method, amount: amount };
    if (state.method === 'credit') {
      var cid = ($('#krs-client', overlay) || {}).value || state.clientId;
      var c = clients().find(function (x) { return x.id === cid; });
      if (!c) { paymentStatus('Choisissez un client avant de mettre une somme à crédit.'); return; }
      state.clientId = c.id; part.clientId = c.id; part.clientName = c.name || c.phone || 'Client';
    }
    if (state.method === 'card') {
      paymentStatus('Confirmation du lecteur en cours…');
      var H = window.KiwiHardware;
      if (!H || !H.authorizeCard) { paymentStatus('Lecteur de carte indisponible. Aucun paiement n’a été enregistré.'); return; }
      var statusNode = $('#krs-pay-status', overlay);
      var result;
      try { result = await H.authorizeCard(amount, null, statusNode); } catch (_) { result = null; }
      if (!result || !result.approved) { paymentStatus('Paiement carte non confirmé. Aucun montant n’a été ajouté.'); return; }
      part.authorization = String(result.id || result.ref || '').slice(0, 80);
    }
    state.parts.push(part);
    saveSession();
    if (due() <= .001) finalizeSale(); else renderPayment();
  }

  function nextRef() {
    var seq = 1;
    try { seq = window.KiwiPosSale ? window.KiwiPosSale.nextSeq(current, 1) : Date.now() % 100000; } catch (_) { seq = Date.now() % 100000; }
    var bare = 'RS-' + seq;
    try { return window.KiwiPosSale && window.KiwiPosSale.stamp ? window.KiwiPosSale.stamp(bare) : bare; } catch (_) { return bare; }
  }
  function recordCredits(ref, paidParts) {
    var credits = (paidParts || state.parts).filter(function (p) { return p.method === 'credit'; }); if (!credits.length) return;
    var d = readCredit();
    credits.forEach(function (p) {
      d.seq = (+d.seq || 0) + 1;
      d.entries.push({ id: venueKey(current) + '-cr-' + d.seq + '-' + Date.now().toString(36), clientId: p.clientId, clientName: p.clientName, amount: money(p.amount), saleRef: ref, vertical: current, ts: Date.now(), updated: Date.now(), status: 'open' });
    });
    writeCredit(d, true);
  }
  function printLast() {
    var r = state.lastReceipt; if (!r) return Promise.resolve(false);
    var P = window.KiwiPrinter;
    var opts = { shop: storeName(), ref: r.ref, date: new Date(r.ts).toLocaleString('fr-MA'), lines: r.lines.map(function (l) { return { name: l.name, qty: l.qty, price: fmt(l.total) }; }), total: fmt(r.total), method: r.methodLabel, footer: 'Merci pour votre visite' };
    if (!P || !P.printReceipt) { paymentStatus('Imprimante Kiwi indisponible.'); return Promise.resolve(false); }
    return Promise.resolve(P.printReceipt(opts)).then(function (res) {
      if (res && res.ok) { paymentStatus('Ticket imprimé' + (res.via ? ' · ' + res.via : '') + '.'); return true; }
      if (P.browserReceipt) { P.browserReceipt(opts); paymentStatus('Boîte d’impression ouverte.'); return true; }
      paymentStatus('Impression non confirmée. La vente reste enregistrée.'); return false;
    }, function () { paymentStatus('Impression impossible. La vente reste enregistrée.'); return false; });
  }
  function finalizeSale() {
    if (committed || !state.cart.length || due() > .001) return;
    committed = true;
    var total = cartTotal(), ref = nextRef(), parts = state.parts.slice();
    var lines = state.cart.map(function (l) { return { name: l.name, qty: l.qty, total: money(l.unitPrice * l.qty), itemId: l.productId, variantId: l.variantId, unit: 'unité', kind: 'product', unitCost: l.unitCost }; });
    var rawMethod = parts.length > 1 ? 'split' : (parts[0] && parts[0].method) || 'cash';
    var sale = { total: total, method: rawMethod, label: (LABELS[current] || 'Vente') + ' · ' + cartQty() + ' art.', ref: ref, lines: lines, parts: parts };
    var journalled = null;
    try { if (window.KiwiPosSale) journalled = window.KiwiPosSale.record(current, sale); } catch (_) {}
    if (!journalled) {
      committed = false;
      paymentStatus('Journal de ventes indisponible. Les parts confirmées et le panier sont conservés : réessayez après avoir rafraîchi la caisse.');
      return;
    }
    /* Keep the catalog snapshot (used by the dashboard grid) aligned with the
       append-only ledger (written by KiwiPosSale → InventoryConsumption). */
    try {
      var C = catalog();
      if (C) C.batch(function () { state.cart.forEach(function (l) { C.adjustStock(l.variantId, -l.qty, 'vente-scan'); }); });
    } catch (_) {}
    recordCredits(ref, parts);
    try {
      if (state.clientId && window.KiwiClients) window.KiwiClients.recordPurchase(state.clientId, { amount: total, visit: true });
    } catch (_) {}
    if (parts.some(function (p) { return p.method === 'cash'; })) try { window.KiwiHardware && window.KiwiHardware.openDrawer && window.KiwiHardware.openDrawer(); } catch (_) {}
    state.lastReceipt = { ref: ref, ts: Date.now(), total: total, lines: lines, parts: parts, methodLabel: parts.map(function (p) { return methodLabel(p.method) + ' ' + fmt(p.amount); }).join(' · ') };
    state.cart = []; state.parts = []; state.clientId = ''; saveSession(); renderCart(); renderPayment();
    committed = false;
  }

  function buildOverlay() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.className = 'krs-overlay'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Scan continu et encaissement');
    overlay.innerHTML = '<div class="krs-shell"><header class="krs-head"><span class="krs-head-mark"><i data-lucide="scan-barcode"></i></span><div class="krs-head-copy"><b>Scan continu</b><span>Catalogue, stock, promotions et encaissement dans un seul geste</span></div><span class="krs-net"></span><button class="krs-close" data-krs-close aria-label="Fermer"><i data-lucide="x"></i></button></header>' +
      '<div class="krs-main"><section class="krs-work"><div class="krs-camera"><video class="krs-video is-idle" playsinline muted></video><div class="krs-frame"></div><div class="krs-manual"><input id="krs-manual" autocomplete="off" inputmode="text" placeholder="Scanner ou saisir un code…" /><button data-krs-manual aria-label="Lire le code"><i data-lucide="arrow-right"></i></button></div><div class="krs-camera-bar"><div class="krs-camera-status"><b>Préparation de la caméra…</b></div><button class="krs-cam-act krs-torch" hidden>Lampe</button><button class="krs-cam-act" data-krs-restart>Relancer</button></div></div><div class="krs-result"></div></section>' +
      '<aside class="krs-cart"><div class="krs-cart-head"></div><div class="krs-lines"></div><div class="krs-cart-foot"></div></aside></div></div><div class="krs-pay"></div>';
    document.body.appendChild(overlay); video = $('.krs-video', overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-krs-close]')) { close(); return; }
      if (e.target.closest('[data-krs-restart]')) { startCamera(); return; }
      if (e.target.closest('.krs-torch')) { toggleTorch(); return; }
      if (e.target.closest('[data-krs-manual]')) { var mi = $('#krs-manual', overlay); if (mi) { scan(mi.value); mi.value = ''; mi.focus(); } return; }
      if (e.target.closest('[data-krs-skip]')) { state.pending = ''; renderResult(); setCameraStatus('<b>Lecture continue active</b> · présentez le produit suivant'); return; }
      if (e.target.closest('[data-krs-create]')) { createPending(); return; }
      if (e.target.closest('[data-krs-add]')) { addHit(state.lookup); return; }
      if (e.target.closest('[data-krs-clear]')) { state.cart = []; saveSession(); renderCart(); return; }
      var minus = e.target.closest('[data-krs-minus]'), plus = e.target.closest('[data-krs-plus]');
      if (minus || plus) { var idx = +(minus ? minus.dataset.krsMinus : plus.dataset.krsPlus); setQty(idx, (+state.cart[idx].qty || 0) + (plus ? 1 : -1)); return; }
      if (e.target.closest('[data-krs-checkout]')) { state.method = 'cash'; state.lastReceipt = null; committed = false; $('.krs-pay', overlay).classList.add('is-open'); renderPayment(); return; }
      var method = e.target.closest('[data-krs-method]'); if (method) { state.method = method.dataset.krsMethod; renderPayment(); return; }
      if (e.target.closest('[data-krs-add-part]')) { addPaymentPart(); return; }
      if (e.target.closest('[data-krs-pay-cancel]')) {
        if (state.parts.length) { paymentStatus('Une part est déjà confirmée. Encaissez le solde restant pour terminer la vente.'); return; }
        $('.krs-pay', overlay).classList.remove('is-open'); return;
      }
      if (e.target.closest('[data-krs-print]')) { printLast(); return; }
      if (e.target.closest('[data-krs-pay-close]')) { state.lastReceipt = null; state.parts = []; state.clientId = ''; saveSession(); $('.krs-pay', overlay).classList.remove('is-open'); renderResult(); return; }
    });
    overlay.addEventListener('change', function (e) { if (e.target.id === 'krs-client') state.clientId = e.target.value; });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if ($('.krs-pay', overlay).classList.contains('is-open')) { if (!state.parts.length) $('.krs-pay', overlay).classList.remove('is-open'); } else close(); return; }
      if (e.key === 'Enter' && e.target.id === 'krs-manual') { e.preventDefault(); scan(e.target.value); e.target.value = ''; }
      if (e.key === 'Enter' && state.pending && (e.target.id === 'krs-new-name' || e.target.id === 'krs-new-price' || e.target.id === 'krs-new-stock')) { e.preventDefault(); createPending(); }
    });
    window.addEventListener('online', renderNetwork); window.addEventListener('offline', renderNetwork);
    icons();
  }
  function renderNetwork() {
    if (!overlay) return; var n = $('.krs-net', overlay), off = navigator.onLine === false;
    n.classList.toggle('is-off', off); n.textContent = off ? 'Hors ligne · ventes en attente' : 'En ligne · synchronisation active';
  }
  function open(vertical, root) {
    if (!ELIGIBLE[vertical]) return false;
    current = vertical; currentRoot = root || document.getElementById('pos-' + vertical);
    if (!bindCatalog()) { toast('Catalogue indisponible sur cette caisse'); return false; }
    bindCredit(); loadSession(); buildOverlay();
    state.lookup = null; state.pending = ''; state.lastReceipt = null;
    overlay.classList.add('is-open');
    if (state.parts.length && state.cart.length) $('.krs-pay', overlay).classList.add('is-open');
    renderNetwork(); renderResult(); renderCart(); renderPayment(); icons(); startCamera();
    setTimeout(function () { var i = $('#krs-manual', overlay); if (i && !cameraAvailable()) i.focus(); }, 80);
    return true;
  }
  function close() {
    if (!overlay) return;
    var p = $('.krs-pay', overlay);
    if (p && p.classList.contains('is-open') && state.parts.length && !state.lastReceipt) {
      paymentStatus('Une part est déjà confirmée. Encaissez le solde restant avant de fermer.');
      return;
    }
    stopCamera(); state.pending = ''; overlay.classList.remove('is-open'); if (p) p.classList.remove('is-open');
  }
  function paintLaunches() {
    Object.keys(mounted).forEach(function (id) {
      var b = mounted[id]; if (!b || !b.isConnected) return;
      var key = current === id ? storageKey() : 'kiwi:retailScan:v1:' + venueKey(id), count = 0;
      try { var d = JSON.parse(localStorage.getItem(key) || 'null'); count = d && Array.isArray(d.cart) ? d.cart.reduce(function (n, l) { return n + (+l.qty || 0); }, 0) : 0; } catch (_) {}
      var badge = $('.krs-launch-count', b); if (badge) { badge.textContent = count; badge.hidden = !count; }
    });
  }
  function mount(root, vertical) {
    if (!root || !ELIGIBLE[vertical]) return false;
    if (mounted[vertical] && mounted[vertical].isConnected) return true;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'krs-launch'; b.setAttribute('aria-label', 'Ouvrir le scan continu');
    b.innerHTML = '<i data-lucide="scan-barcode"></i><span>Scan continu</span><b class="krs-launch-count" hidden>0</b>';
    b.addEventListener('click', function () { open(vertical, root); }); root.appendChild(b); mounted[vertical] = b; paintLaunches(); icons(); return true;
  }

  window.KiwiRetailScan = {
    eligible: function (id) { return !!ELIGIBLE[id]; }, mount: mount, open: open, close: close, scan: scan,
    _test: { money: money, normalizeCode: normalizeCode, mergeCredits: mergeCredits, due: function (total, parts) { return money(total - (parts || []).reduce(function (s, p) { return s + (+p.amount || 0); }, 0)); } },
  };
}());
