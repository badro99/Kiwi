/* Kiwi · tenant-scoped pressing catalogue
 *
 * One source of truth for the pressing dashboard and every paired caisse.
 * Garment names, categories, visibility and per-treatment prices are editable;
 * soft hiding keeps old tickets readable. CloudDoc provides the same
 * read-before-write and conflict retry used by the rest of the product.
 */
(function () {
  'use strict';

  var PREFIX = 'kiwi:pressing-catalog:v1:';
  var listeners = new Set();
  var cloud = null;

  var DEFAULTS = {
    v: 1,
    services: [
      { id: 'sec', label: 'Nettoyage à sec', short: 'À sec', code: 'SEC', updatedAt: 0 },
      { id: 'lavage', label: 'Lavage', short: 'Lavage', code: 'LAV', updatedAt: 0 },
      { id: 'repassage', label: 'Repassage', short: 'Repassage', code: 'REP', updatedAt: 0 },
      { id: 'detachage', label: 'Détachage', short: 'Détachage', code: 'DET', updatedAt: 0 },
      { id: 'retouche', label: 'Retouche', short: 'Retouche', code: 'RET', updatedAt: 0 }
    ],
    categories: [
      { id: 'hauts', label: 'Hauts', updatedAt: 0 },
      { id: 'bas', label: 'Bas', updatedAt: 0 },
      { id: 'robes', label: 'Robes & tenues', updatedAt: 0 },
      { id: 'linge', label: 'Linge de maison', updatedAt: 0 },
      { id: 'cuir', label: 'Cuir & spécial', updatedAt: 0 },
      { id: 'chaussures', label: 'Chaussures', updatedAt: 0 }
    ],
    items: [
      { id:'chemise',cat:'hauts',label:'Chemise',prices:{sec:25,lavage:18,repassage:10,detachage:30,retouche:35} },
      { id:'tshirt',cat:'hauts',label:'T-shirt',prices:{lavage:14,repassage:8,detachage:22,sec:20} },
      { id:'pull',cat:'hauts',label:'Pull',prices:{sec:30,lavage:22,repassage:12,detachage:35,retouche:40} },
      { id:'veste',cat:'hauts',label:'Veste',prices:{sec:45,repassage:20,detachage:50,retouche:60} },
      { id:'costume',cat:'hauts',label:'Costume',flag:'multi-pièces',variants:[
        {id:'2p',label:'2 pièces',pieces:['Veste','Pantalon'],prices:{sec:70,repassage:35,detachage:80,retouche:80}},
        {id:'3p',label:'3 pièces',pieces:['Veste','Pantalon','Gilet'],prices:{sec:90,repassage:45,detachage:100,retouche:90}}
      ] },
      { id:'manteau',cat:'hauts',label:'Manteau',prices:{sec:60,repassage:25,detachage:65,retouche:70} },
      { id:'pantalon',cat:'bas',label:'Pantalon',prices:{sec:28,lavage:18,repassage:12,detachage:32,retouche:30} },
      { id:'jean',cat:'bas',label:'Jean',prices:{lavage:20,repassage:12,sec:30,detachage:35,retouche:30} },
      { id:'jupe',cat:'bas',label:'Jupe',prices:{sec:26,lavage:18,repassage:12,detachage:30,retouche:35} },
      { id:'short',cat:'bas',label:'Short',prices:{lavage:12,repassage:8,sec:18,detachage:20,retouche:25} },
      { id:'robe',cat:'robes',label:'Robe',prices:{sec:40,lavage:30,repassage:18,detachage:45,retouche:50} },
      { id:'robe_soiree',cat:'robes',label:'Robe de soirée',flag:'délicat',prices:{sec:90,repassage:40,detachage:100,retouche:80} },
      { id:'caftan',cat:'robes',label:'Caftan · takchita',flag:'main',prices:{sec:120,repassage:60,detachage:130,retouche:100} },
      { id:'drap',cat:'linge',label:'Drap',def:'lavage',prices:{lavage:15,repassage:10,sec:25} },
      { id:'housse',cat:'linge',label:'Housse de couette',def:'lavage',prices:{lavage:25,repassage:15,sec:35} },
      { id:'couverture',cat:'linge',label:'Couverture',def:'lavage',prices:{lavage:45,sec:60} },
      { id:'nappe',cat:'linge',label:'Nappe',def:'lavage',prices:{lavage:20,repassage:12,sec:30,detachage:28} },
      { id:'rideaux',cat:'linge',label:'Rideaux',sub:'par panneau',def:'sec',prices:{sec:50,lavage:35,repassage:20} },
      { id:'tapis',cat:'linge',label:'Tapis',flag:'au m²',def:'lavage',variants:[
        {id:'s',label:'Petit · < 2 m²',prices:{lavage:80}},
        {id:'m',label:'Moyen · 2–4 m²',prices:{lavage:140}},
        {id:'l',label:'Grand · > 4 m²',prices:{lavage:220}}
      ] },
      { id:'veste_cuir',cat:'cuir',label:'Veste cuir',flag:'72 h',prices:{sec:180,detachage:200,retouche:90} },
      { id:'daim',cat:'cuir',label:'Daim',flag:'72 h',prices:{sec:200,detachage:220} },
      { id:'doudoune',cat:'cuir',label:'Doudoune',prices:{lavage:70,sec:90,retouche:60} },
      { id:'chaussures',cat:'chaussures',label:'Chaussures cuir',sub:'la paire',def:'sec',prices:{sec:80} },
      { id:'baskets',cat:'chaussures',label:'Baskets',sub:'la paire',def:'lavage',prices:{lavage:70} },
      { id:'babouches',cat:'chaussures',label:'Babouches',sub:'la paire',def:'sec',prices:{sec:50} }
    ].map(function (x) { x.active = true; x.art = x.id; x.updatedAt = 0; return x; }),
    updatedAt: 0
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function cleanText(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 100); }
  function money(v) { var n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(100000, Math.round(n * 100) / 100) : 0; }
  function scope() {
    try { if (window.KiwiPressingOps && KiwiPressingOps.scope) return KiwiPressingOps.scope(); } catch (_) {}
    try {
      var p = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return cleanText(p && (p.merchant || p.slug || p.venueId || p.name), 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    } catch (_) { return ''; }
  }
  function key() { return PREFIX + (scope() || 'demo'); }
  function cleanPrices(raw) {
    var out = {};
    DEFAULTS.services.forEach(function (s) { var n = money(raw && raw[s.id]); if (n) out[s.id] = n; });
    return out;
  }
  function cleanVariant(v, i) {
    return {
      id: cleanText(v && v.id, 40) || ('var-' + i), label: cleanText(v && v.label, 100) || ('Option ' + (i + 1)),
      pieces: Array.isArray(v && v.pieces) ? v.pieces.map(function (x) { return cleanText(x, 80); }).filter(Boolean).slice(0, 12) : undefined,
      prices: cleanPrices(v && v.prices)
    };
  }
  function cleanItem(raw, i) {
    var cats = DEFAULTS.categories.map(function (c) { return c.id; });
    var item = {
      id: cleanText(raw && raw.id, 40) || ('article-' + i),
      cat: cats.indexOf(raw && raw.cat) >= 0 ? raw.cat : cats[0],
      label: cleanText(raw && raw.label, 100) || 'Nouvel article',
      sub: cleanText(raw && raw.sub, 80), flag: cleanText(raw && raw.flag, 40),
      def: cleanText(raw && raw.def, 24), art: cleanText(raw && raw.art, 40) || 'chemise',
      active: !raw || raw.active !== false, updatedAt: Math.max(0, Number(raw && raw.updatedAt) || 0)
    };
    if (Array.isArray(raw && raw.variants) && raw.variants.length) item.variants = raw.variants.slice(0, 12).map(cleanVariant);
    else item.prices = cleanPrices(raw && raw.prices);
    return item;
  }
  function mergeRows(mine, theirs) {
    var by = Object.create(null);
    (theirs || []).concat(mine || []).forEach(function (row) {
      if (!row || !row.id) return;
      var old = by[row.id];
      if (!old || (+row.updatedAt || 0) >= (+old.updatedAt || 0)) by[row.id] = row;
    });
    return Object.keys(by).map(function (id) { return by[id]; });
  }
  function hydrate(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var categories = mergeRows(raw.categories, DEFAULTS.categories).map(function (c) {
      return { id: cleanText(c.id,40), label: cleanText(c.label,100) || c.id, updatedAt: Math.max(0,+c.updatedAt||0) };
    });
    var services = mergeRows(raw.services, DEFAULTS.services).map(function (s) {
      return { id: cleanText(s.id,24), label: cleanText(s.label,100), short: cleanText(s.short,40), code: cleanText(s.code,8), updatedAt: Math.max(0,+s.updatedAt||0) };
    }).filter(function (s) { return DEFAULTS.services.some(function (d) { return d.id === s.id; }); });
    var items = mergeRows(raw.items, DEFAULTS.items).slice(0, 500).map(cleanItem);
    return { v: 1, categories: categories, services: services, items: items, updatedAt: Math.max(0, +raw.updatedAt || 0) };
  }
  function read() {
    try { return hydrate(JSON.parse(localStorage.getItem(key()) || 'null')); }
    catch (_) { return hydrate(null); }
  }
  function emit(doc) {
    listeners.forEach(function (fn) { try { fn(clone(doc)); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('kiwi:pressing-catalog', { detail: { scope: scope() } })); } catch (_) {}
  }
  function write(doc) {
    doc = hydrate(doc);
    try { localStorage.setItem(key(), JSON.stringify(doc)); } catch (_) { return false; }
    emit(doc); return true;
  }
  function merge(mine, theirs) {
    return hydrate({
      categories: mergeRows(mine && mine.categories, theirs && theirs.categories),
      services: mergeRows(mine && mine.services, theirs && theirs.services),
      items: mergeRows(mine && mine.items, theirs && theirs.items),
      updatedAt: Math.max(+(mine && mine.updatedAt)||0, +(theirs && theirs.updatedAt)||0)
    });
  }
  function save(doc) {
    doc.updatedAt = Date.now();
    if (!write(doc)) return false;
    bind(); if (cloud) cloud.push();
    return true;
  }
  function updateItem(id, patch) {
    var doc = read();
    var item = doc.items.find(function (x) { return x.id === id; });
    if (!item) return false;
    var next = cleanItem(Object.assign({}, item, patch || {}, { id: item.id, updatedAt: Date.now() }), 0);
    var hasPrice = next.variants ? next.variants.some(function (v) { return Object.keys(v.prices).length; }) : Object.keys(next.prices).length;
    if (!next.label || !hasPrice) return false;
    doc.items[doc.items.indexOf(item)] = next;
    return save(doc);
  }
  function addItem(data) {
    var doc = read();
    var label = cleanText(data && data.label, 100);
    var prices = cleanPrices(data && data.prices);
    if (!label || !Object.keys(prices).length) return null;
    var base = label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,24) || 'article';
    var id = base, n = 2;
    while (doc.items.some(function (x) { return x.id === id; })) id = base + '-' + n++;
    var item = cleanItem({ id:id, label:label, cat:data.cat, prices:prices, art:'chemise', active:true, updatedAt:Date.now() }, doc.items.length);
    doc.items.push(item);
    return save(doc) ? clone(item) : null;
  }
  function subscribe(fn) { listeners.add(fn); return function () { listeners.delete(fn); }; }
  function bind() {
    if (cloud) return cloud.bind();
    if (!window.KiwiCloudDoc || !scope()) return Promise.resolve(false);
    cloud = KiwiCloudDoc.attach({
      feature: 'pressing-catalog', slug: scope, localKey: key, read: read, write: write, merge: merge,
      isEmpty: function (doc) { return !doc || !Array.isArray(doc.items); }
    });
    return cloud.bind();
  }

  function priceInputs(item, variant) {
    var prices = variant ? variant.prices : item.prices;
    return read().services.map(function (s) {
      return '<label class="pce-price"><span>' + esc(s.short) + '</span><span class="pce-money"><input type="number" min="0" max="100000" step="1" inputmode="decimal" data-pce-price="' + esc(s.id) + '"' + (variant ? ' data-pce-variant="' + esc(variant.id) + '"' : '') + ' value="' + esc(prices[s.id] || '') + '" aria-label="' + esc(s.label + ' · ' + item.label) + '"><b>MAD</b></span></label>';
    }).join('');
  }
  function itemRow(item, doc) {
    var categoryOptions = doc.categories.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === item.cat ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('');
    var prices = item.variants && item.variants.length
      ? '<div class="pce-variants">' + item.variants.map(function (v) { return '<div class="pce-variant"><b>' + esc(v.label) + '</b><div class="pce-prices">' + priceInputs(item,v) + '</div></div>'; }).join('') + '</div>'
      : '<div class="pce-prices">' + priceInputs(item,null) + '</div>';
    return '<article class="pce-item' + (item.active ? '' : ' is-hidden') + '" data-pce-item="' + esc(item.id) + '">' +
      '<div class="pce-item-main"><label><span>Nom affiché</span><input class="pce-name" maxlength="100" value="' + esc(item.label) + '" data-pce-name></label>' +
      '<label><span>Catégorie</span><select data-pce-cat>' + categoryOptions + '</select></label>' +
      '<label class="pce-visible"><input type="checkbox" data-pce-active' + (item.active ? ' checked' : '') + '><span>Visible à la caisse</span></label></div>' + prices +
      '<div class="pce-item-foot"><span>' + (item.variants ? item.variants.length + ' déclinaisons' : 'Prix vide = service indisponible') + '</span><button type="button" class="pxd-btn pce-save" data-pce-save>Enregistrer</button></div></article>';
  }
  function renderEditor(host, opts) {
    if (!host) return;
    opts = opts || {};
    var doc = read();
    host.innerHTML = '<div class="pce-editor' + (opts.compact ? ' is-compact' : '') + '">' +
      '<div class="pce-toolbar"><div><h3>Catalogue du comptoir</h3><p>Les changements s’appliquent aux prochains dépôts sur toutes les caisses de cet établissement.</p></div><button type="button" class="pxd-btn primary" data-pce-new>+ Nouvel article</button></div>' +
      '<div class="pce-new" data-pce-new-form hidden><label><span>Nom</span><input maxlength="100" data-pce-new-name placeholder="Ex. Gilet"></label><label><span>Catégorie</span><select data-pce-new-cat>' + doc.categories.map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.label)+'</option>';}).join('') + '</select></label>' +
      '<div class="pce-prices">' + doc.services.map(function(s){return '<label class="pce-price"><span>'+esc(s.short)+'</span><span class="pce-money"><input type="number" min="0" max="100000" step="1" inputmode="decimal" data-pce-new-price="'+esc(s.id)+'" placeholder="—"><b>MAD</b></span></label>';}).join('') + '</div><div class="pce-new-actions"><span data-pce-note>Renseignez au moins un prix.</span><button type="button" class="pxd-btn" data-pce-cancel>Annuler</button><button type="button" class="pxd-btn primary" data-pce-create>Ajouter</button></div></div>' +
      '<div class="pce-list">' + doc.items.map(function(item){return itemRow(item,doc);}).join('') + '</div></div>';

    var newButton = host.querySelector('[data-pce-new]');
    var newForm = host.querySelector('[data-pce-new-form]');
    newButton.onclick = function () { newForm.hidden = false; newForm.querySelector('[data-pce-new-name]').focus(); };
    host.querySelector('[data-pce-cancel]').onclick = function () { newForm.hidden = true; };
    host.querySelector('[data-pce-create]').onclick = function () {
      var prices = {};
      newForm.querySelectorAll('[data-pce-new-price]').forEach(function (input) { var n=money(input.value); if(n) prices[input.dataset.pceNewPrice]=n; });
      var made = addItem({ label:newForm.querySelector('[data-pce-new-name]').value, cat:newForm.querySelector('[data-pce-new-cat]').value, prices:prices });
      if (!made) { newForm.querySelector('[data-pce-note]').textContent = 'Ajoutez un nom et au moins un prix supérieur à 0.'; return; }
      renderEditor(host,opts);
    };
    host.querySelectorAll('[data-pce-save]').forEach(function (button) {
      button.onclick = function () {
        var row = button.closest('[data-pce-item]');
        var item = read().items.find(function (x) { return x.id === row.dataset.pceItem; });
        if (!item) return;
        var patch = { label:row.querySelector('[data-pce-name]').value, cat:row.querySelector('[data-pce-cat]').value, active:row.querySelector('[data-pce-active]').checked };
        if (item.variants) {
          patch.variants = item.variants.map(function (v) {
            var next = clone(v); next.prices = {};
            row.querySelectorAll('[data-pce-variant="' + v.id + '"]').forEach(function (input) { var n=money(input.value); if(n) next.prices[input.dataset.pcePrice]=n; });
            return next;
          });
        } else {
          patch.prices = {};
          row.querySelectorAll('[data-pce-price]:not([data-pce-variant])').forEach(function (input) { var n=money(input.value); if(n) patch.prices[input.dataset.pcePrice]=n; });
        }
        if (!updateItem(item.id,patch)) { button.textContent='Nom et prix requis'; setTimeout(function(){button.textContent='Enregistrer';},1800); return; }
        renderEditor(host,opts);
      };
    });
  }

  window.addEventListener('storage', function (e) { if (e.key === key()) emit(read()); });
  window.KiwiPressingCatalog = {
    read: read, bind: bind, subscribe: subscribe, updateItem: updateItem, addItem: addItem,
    mountEditor: renderEditor, scope: scope, _merge: merge, _defaults: function () { return clone(DEFAULTS); }
  };
})();
