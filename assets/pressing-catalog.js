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
  var editorStates = new WeakMap();

  /* Official Material Symbols · Outlined 400, copied byte-for-byte from
   * google/material-design-icons. The catalogue stays self-contained/offline. */
  var MI = {
    search: 'M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z',
    left: 'M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z',
    right: 'M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z',
    more: 'M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z',
    hauts: 'm240-522-40 22q-14 8-30 4t-24-18L66-654q-8-14-4-30t18-24l230-132h70q9 0 14.5 5.5T400-820v20q0 33 23.5 56.5T480-720q33 0 56.5-23.5T560-800v-20q0-9 5.5-14.5T580-840h70l230 132q14 8 18 24t-4 30l-80 140q-8 14-23.5 17.5T760-501l-40-20v361q0 17-11.5 28.5T680-120H280q-17 0-28.5-11.5T240-160v-362Zm80-134v456h320v-456l124 68 42-70-172-100q-15 51-56.5 84.5T480-640q-56 0-97.5-33.5T326-758L154-658l42 70 124-68Zm160 177Z',
    bas: 'm240-522-40 22q-14 8-30 4t-24-18L66-654q-8-14-4-30t18-24l230-132h70q9 0 14.5 5.5T400-820v20q0 33 23.5 56.5T480-720q33 0 56.5-23.5T560-800v-20q0-9 5.5-14.5T580-840h70l230 132q14 8 18 24t-4 30l-80 140q-8 14-23.5 17.5T760-501l-40-20v361q0 17-11.5 28.5T680-120H280q-17 0-28.5-11.5T240-160v-362Zm80-134v456h320v-456l124 68 42-70-172-100q-15 51-56.5 84.5T480-640q-56 0-97.5-33.5T326-758L154-658l42 70 124-68Zm160 177Z',
    robes: 'M120-160q-17 0-28.5-11.5T80-200q0-10 4-18.5T96-232l344-258v-70q0-17 12-28.5t29-11.5q25 0 42-18t17-43q0-25-17.5-42T480-720q-25 0-42.5 17.5T420-660h-80q0-58 41-99t99-41q58 0 99 40.5t41 98.5q0 47-27.5 84T520-526v36l344 258q8 5 12 13.5t4 18.5q0 17-11.5 28.5T840-160H120Zm120-80h480L480-420 240-240Z',
    linge: 'M80-200v-240q0-27 11-49t29-39v-112q0-50 35-85t85-35h160q23 0 43 8.5t37 23.5q17-15 37-23.5t43-8.5h160q50 0 85 35t35 85v112q18 17 29 39t11 49v240h-80v-80H160v80H80Zm440-360h240v-80q0-17-11.5-28.5T720-680H560q-17 0-28.5 11.5T520-640v80Zm-320 0h240v-80q0-17-11.5-28.5T400-680H240q-17 0-28.5 11.5T200-640v80Zm-40 200h640v-80q0-17-11.5-28.5T760-480H200q-17 0-28.5 11.5T160-440v80Zm640 0H160h640Z',
    cuir: 'M280-80v-240h-64q-40 0-68-28t-28-68q0-29 16-53.5t42-36.5l262-116v-26q-36-13-58-43.5T360-760q0-50 35-85t85-35q50 0 85 35t35 85h-80q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760q0 17 11.5 28.5T480-720t28.5 11.5Q520-697 520-680v58l262 116q26 12 42 36.5t16 53.5q0 40-28 68t-68 28h-64v240H280Zm-64-320h64v-40h400v40h64q7 0 11.5-5t4.5-13q0-5-2.5-8.5T750-432L480-552 210-432q-5 2-7.5 5.5T200-418q0 8 4.5 13t11.5 5Zm144 240h240v-200H360v200Zm0-200h240-240Z',
    chaussures: 'M216-580q39 0 74 14t64 41l382 365h24q17 0 28.5-11.5T800-200q0-8-1.5-17T788-235L605-418l-71-214-74 18q-38 10-69-14t-31-63v-84l-28-14-154 206q-1 1-1 1.5t-1 1.5h40Zm0 80h-46q3 7 7.5 13t10.5 11l324 295q11 11 25 16t29 5h54L299-467q-17-17-38.5-25t-44.5-8ZM566-80q-30 0-57-11t-50-31L134-417q-46-42-51.5-103T114-631l154-206q17-23 45.5-30.5T368-861l28 14q21 11 32.5 30t11.5 42v84l74-19q30-8 58 7.5t38 44.5l65 196 170 170q20 20 27.5 43t7.5 49q0 50-35 85t-85 35H566Z'
  };
  function mi(name, cls) { return '<svg class="' + (cls || '') + '" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="' + MI[name] + '"></path></svg>'; }
  function garmentPhoto(item) {
    var shared = window.KiwiPressingGarmentIcons;
    return shared && shared.render ? shared.render(item, 'pce-garment-art') : mi(MI[item.cat] ? item.cat : 'hauts');
  }

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

  function priceInputs(item, variant, services) {
    var prices = variant ? variant.prices : item.prices;
    return services.map(function (s) {
      return '<label class="pce-price"><span>' + esc(s.short) + '</span><span class="pce-money"><input type="number" min="0" max="100000" step="1" inputmode="decimal" data-pce-price="' + esc(s.id) + '"' + (variant ? ' data-pce-variant="' + esc(variant.id) + '"' : '') + ' value="' + esc(prices[s.id] || '') + '" aria-label="' + esc(s.label + ' · ' + item.label) + '"><b>MAD</b></span></label>';
    }).join('');
  }
  function itemMin(item) {
    var values = [];
    if (item.variants) item.variants.forEach(function (v) { Object.keys(v.prices || {}).forEach(function (k) { values.push(+v.prices[k]); }); });
    else Object.keys(item.prices || {}).forEach(function (k) { values.push(+item.prices[k]); });
    values = values.filter(function (v) { return Number.isFinite(v) && v > 0; });
    return values.length ? Math.min.apply(Math, values) : 0;
  }
  function itemServiceCount(item) {
    var ids = new Set();
    if (item.variants) item.variants.forEach(function (v) { Object.keys(v.prices || {}).forEach(function (k) { ids.add(k); }); });
    else Object.keys(item.prices || {}).forEach(function (k) { ids.add(k); });
    return ids.size;
  }
  function itemRow(item, doc, state) {
    var categoryOptions = doc.categories.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === item.cat ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('');
    var category = doc.categories.find(function (c) { return c.id === item.cat; }) || { label:item.cat };
    var open = state.expanded === item.id;
    var prices = item.variants && item.variants.length
      ? '<div class="pce-variants">' + item.variants.map(function (v) { return '<div class="pce-variant"><b>' + esc(v.label) + '</b><div class="pce-prices">' + priceInputs(item,v,doc.services) + '</div></div>'; }).join('') + '</div>'
      : '<div class="pce-prices">' + priceInputs(item,null,doc.services) + '</div>';
    var min = itemMin(item);
    return '<article class="pce-item' + (item.active ? '' : ' is-hidden') + (open ? ' is-open' : '') + '" data-pce-item="' + esc(item.id) + '">' +
      '<button type="button" class="pce-summary" data-pce-toggle aria-expanded="' + (open ? 'true' : 'false') + '">' +
        '<span class="pce-item-photo">' + garmentPhoto(item) + '</span><span class="pce-summary-copy"><b>' + esc(item.label) + '</b><small>' + esc(category.label) + '</small></span>' +
        '<span class="pce-summary-price"><b>' + (min ? 'dès ' + esc(min) + ' MAD' : 'Sans prix') + '</b><small>' + itemServiceCount(item) + ' traitement' + (itemServiceCount(item) === 1 ? '' : 's') + '</small></span>' +
        '<span class="pce-status ' + (item.active ? 'is-live' : '') + '">' + (item.active ? 'À la caisse' : 'Masqué') + '</span>' + mi('more','pce-chevron') + '</button>' +
      (open ? '<div class="pce-item-body"><div class="pce-item-main"><label><span>Nom affiché</span><input class="pce-name" maxlength="100" value="' + esc(item.label) + '" data-pce-name></label>' +
      '<label><span>Catégorie</span><select data-pce-cat>' + categoryOptions + '</select></label>' +
      '<label class="pce-visible"><input type="checkbox" data-pce-active' + (item.active ? ' checked' : '') + '><span>Visible à la caisse</span></label></div>' + prices +
      '<div class="pce-item-foot"><span>' + (item.variants ? item.variants.length + ' déclinaisons' : 'Prix vide = service indisponible') + '</span><button type="button" class="pxd-btn pce-close" data-pce-toggle>Fermer</button><button type="button" class="pxd-btn primary pce-save" data-pce-save>Enregistrer</button></div></div>' : '') + '</article>';
  }
  function renderEditor(host, opts) {
    if (!host) return;
    opts = opts || {};
    var doc = read();
    var state = editorStates.get(host);
    if (!state) { state = { q:'', cat:'all', page:0, expanded:null, newOpen:false }; editorStates.set(host,state); }
    var q = cleanText(state.q,100).toLocaleLowerCase('fr');
    var filtered = doc.items.filter(function (item) { return (state.cat === 'all' || item.cat === state.cat) && (!q || item.label.toLocaleLowerCase('fr').indexOf(q) >= 0); });
    var pageSize = 8;
    var pageCount = Math.max(1,Math.ceil(filtered.length/pageSize));
    state.page = Math.max(0,Math.min(state.page,pageCount-1));
    var first = state.page * pageSize;
    var visible = filtered.slice(first,first+pageSize);
    var countFor = function (cat) { return doc.items.filter(function (i) { return cat === 'all' || i.cat === cat; }).length; };
    host.innerHTML = '<div class="pce-editor' + (opts.compact ? ' is-compact' : '') + '">' +
      '<div class="pce-toolbar"><div><h3>Catalogue du comptoir</h3><p>Les changements s’appliquent aux prochains dépôts sur toutes les caisses de cet établissement.</p></div><button type="button" class="pxd-btn primary" data-pce-new>+ Nouvel article</button></div>' +
      '<div class="pce-navigator"><label class="pce-search">' + mi('search') + '<input type="search" value="' + esc(state.q) + '" placeholder="Rechercher un article…" aria-label="Rechercher un article" data-pce-search></label><div class="pce-filters" role="group" aria-label="Filtrer par catégorie"><button type="button" class="pce-filter' + (state.cat === 'all' ? ' on' : '') + '" data-pce-filter="all">Tous <b>' + countFor('all') + '</b></button>' + doc.categories.map(function(c){return '<button type="button" class="pce-filter' + (state.cat === c.id ? ' on' : '') + '" data-pce-filter="' + esc(c.id) + '">' + esc(c.label) + ' <b>' + countFor(c.id) + '</b></button>';}).join('') + '</div></div>' +
      '<div class="pce-new" data-pce-new-form' + (state.newOpen ? '' : ' hidden') + '><label><span>Nom</span><input maxlength="100" data-pce-new-name placeholder="Ex. Gilet"></label><label><span>Catégorie</span><select data-pce-new-cat>' + doc.categories.map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.label)+'</option>';}).join('') + '</select></label>' +
      '<div class="pce-prices">' + doc.services.map(function(s){return '<label class="pce-price"><span>'+esc(s.short)+'</span><span class="pce-money"><input type="number" min="0" max="100000" step="1" inputmode="decimal" data-pce-new-price="'+esc(s.id)+'" placeholder="—"><b>MAD</b></span></label>';}).join('') + '</div><div class="pce-new-actions"><span data-pce-note>Renseignez au moins un prix.</span><button type="button" class="pxd-btn" data-pce-cancel>Annuler</button><button type="button" class="pxd-btn primary" data-pce-create>Ajouter</button></div></div>' +
      '<div class="pce-resultbar"><span>' + (filtered.length ? (first+1) + '–' + Math.min(first+pageSize,filtered.length) + ' sur ' + filtered.length : 'Aucun article') + '</span><div class="pce-pages"><button type="button" data-pce-prev aria-label="Page précédente"' + (state.page ? '' : ' disabled') + '>' + mi('left') + '</button><b>Page ' + (state.page+1) + ' / ' + pageCount + '</b><button type="button" data-pce-next aria-label="Page suivante"' + (state.page < pageCount-1 ? '' : ' disabled') + '>' + mi('right') + '</button></div></div>' +
      '<div class="pce-list">' + (visible.length ? visible.map(function(item){return itemRow(item,doc,state);}).join('') : '<div class="pce-empty">Aucun article ne correspond à cette recherche.</div>') + '</div></div>';

    var newButton = host.querySelector('[data-pce-new]');
    var newForm = host.querySelector('[data-pce-new-form]');
    newButton.onclick = function () { state.newOpen = !state.newOpen; renderEditor(host,opts); if(state.newOpen) host.querySelector('[data-pce-new-name]').focus(); };
    host.querySelector('[data-pce-cancel]').onclick = function () { state.newOpen = false; renderEditor(host,opts); };
    var searchInput=host.querySelector('[data-pce-search]');
    var updateSearch=function (e) {
      state.q=e.target.value;
      state.page=0;
      clearTimeout(state.searchTimer);
      state.searchTimer=setTimeout(function () {
        renderEditor(host,opts);
        var input=host.querySelector('[data-pce-search]');
        if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}
      },80);
    };
    searchInput.oninput=updateSearch;
    searchInput.onsearch=updateSearch;
    searchInput.onchange=updateSearch;
    host.querySelectorAll('[data-pce-filter]').forEach(function (button) { button.onclick=function(){state.cat=button.dataset.pceFilter;state.page=0;state.expanded=null;renderEditor(host,opts);}; });
    host.querySelector('[data-pce-prev]').onclick=function(){if(state.page){state.page--;state.expanded=null;renderEditor(host,opts);}};
    host.querySelector('[data-pce-next]').onclick=function(){if(state.page<pageCount-1){state.page++;state.expanded=null;renderEditor(host,opts);}};
    host.querySelector('[data-pce-create]').onclick = function () {
      var prices = {};
      newForm.querySelectorAll('[data-pce-new-price]').forEach(function (input) { var n=money(input.value); if(n) prices[input.dataset.pceNewPrice]=n; });
      var made = addItem({ label:newForm.querySelector('[data-pce-new-name]').value, cat:newForm.querySelector('[data-pce-new-cat]').value, prices:prices });
      if (!made) { newForm.querySelector('[data-pce-note]').textContent = 'Ajoutez un nom et au moins un prix supérieur à 0.'; return; }
      state.q=made.label; state.cat='all'; state.page=0; state.expanded=made.id; state.newOpen=false;
      renderEditor(host,opts);
    };
    host.querySelectorAll('[data-pce-toggle]').forEach(function (button) { button.onclick=function(){var row=button.closest('[data-pce-item]'); state.expanded=state.expanded===row.dataset.pceItem?null:row.dataset.pceItem; renderEditor(host,opts);}; });
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
        state.expanded=null; renderEditor(host,opts);
      };
    });
  }

  window.addEventListener('storage', function (e) { if (e.key === key()) emit(read()); });
  window.KiwiPressingCatalog = {
    read: read, bind: bind, subscribe: subscribe, updateItem: updateItem, addItem: addItem,
    mountEditor: renderEditor, scope: scope, _merge: merge, _defaults: function () { return clone(DEFAULTS); }
  };
})();
