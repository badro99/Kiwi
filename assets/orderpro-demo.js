/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/orderpro-demo.js · the pitch demo, inside the one guest app
 * (spec §21.1, stage 3c). OrderPro.html?s=demo loads it (KiwiOrderMenu.need,
 * from <template id="orderpro-lazy">) and its network layer answers from here
 * instead of the server: Café Atlas's menu, a visit, an order that is
 * accepted, then ready, then served. Nothing leaves the phone and nothing is
 * recorded anywhere. It is what kiwi-order.html showed without ?merchant.
 *
 *   KiwiOrderDemo.catalog()           /api/menu's shape
 *   KiwiOrderDemo.placeOrder(body)    /api/order's answer, priced from the menu
 *   KiwiOrderDemo.orderStatus(id)     pending → accepted → ready (takeaway) or
 *                                     served (table), on a short clock
 *   KiwiOrderDemo.openSession(mode, table), sessionStatus(id), serviceRequest()
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* The dashboard's fingerprint (menu-i18n.js › hash), so the demo's
     translations read as fresh exactly like a real store's. */
  function hash(name, desc) {
    var str = String(name == null ? '' : name).trim() + '\u001f' + String(desc == null ? '' : desc).trim();
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function tr(name, desc, en, ar) {
    var h = hash(name, desc);
    return {
      en: { name: en[0], desc: en[1], h: h },
      ar: { name: ar[0], desc: ar[1], h: h }
    };
  }

  var MEDIA = 'assets/media/menu-demo/';
  var cats = [
    ['coffee', 'Café', 'Coffee', 'قهوة'],
    ['pastry', 'Pâtisserie', 'Pastries', 'حلويات'],
    ['savory', 'Salé', 'Savory', 'ساندويتش'],
    ['drink', 'Boissons', 'Drinks', 'مشروبات']
  ].map(function (c) {
    var h = hash(c[1], '');
    return { id: c[0], name: c[1], i18n: { en: { name: c[2], h: h }, ar: { name: c[3], h: h } } };
  });

  function group(id, name, kind, choices, required) {
    return {
      id: id, name: name, kind: kind, required: !!required,
      choices: choices.map(function (c) { return { id: c[0], name: c[1], price: c[2] || 0 }; })
    };
  }
  var opts = [
    group('sucre', 'Sucre', 'one', [['normal', 'Sucré'], ['leger', 'Peu sucré'], ['sans', 'Sans sucre'], ['brun', 'Sucre brun']]),
    group('lait', 'Type de lait', 'one', [['lait', 'Lait classique'], ['amande', "Lait d'amande", 5], ['soja', 'Lait de soja', 5], ['sans', 'Sans lait']]),
    group('shot', 'Intensité', 'one', [['simple', 'Simple'], ['double', 'Double', 5]]),
    group('chauffer', 'Préparation', 'one', [['froid', 'Tel quel'], ['chaud', 'Réchauffé']]),
    group('extras', 'Accompagnement', 'many', [['beurre', 'Beurre', 2], ['confiture', 'Confiture maison', 3], ['miel', "Miel d'oranger", 3]]),
    group('pain', 'Pain', 'one', [['campagne', 'Pain de campagne'], ['complet', 'Pain complet'], ['wrap', 'En wrap']], true),
    group('retirer', 'Retirer', 'many', [['tomate', 'Tomate'], ['oignon', 'Oignon'], ['cornichons', 'Cornichons'], ['olives', 'Olives']]),
    group('sauce', 'Sauce', 'one', [['classique', 'Sauce classique'], ['harissa', 'Harissa épicée'], ['sans', 'Sans sauce']]),
    group('glace', 'Glaçons', 'one', [['avec', 'Avec glaçons'], ['sans', 'Sans glaçons']])
  ];

  function item(id, catId, name, desc, price, groups, en, ar, extra) {
    var it = { id: id, catId: catId, name: name, desc: desc, price: price, opts: groups, avail: true, i18n: tr(name, desc, en, ar) };
    if (extra) Object.keys(extra).forEach(function (k) { it[k] = extra[k]; });
    return it;
  }
  var items = [
    item('espresso', 'coffee', 'Espresso', 'Court, intense, torréfaction du jour', 12, ['sucre', 'shot'],
      ['Espresso', "Short, intense, today's roast"], ['إسبريسو', 'قصير، قوي، تحميص اليوم'],
      { video: MEDIA + 'v24044gl0000d47044vog65jf7h8q560.mov' }),
    item('noss-noss', 'coffee', 'Noss-noss', 'Moitié café, moitié lait chaud, la fierté locale', 16, ['sucre'],
      ['Noss-noss', 'Half coffee, half hot milk, the local pride'], ['نص نص', 'نص قهوة نص حليب سخون، الفخر المحلي']),
    item('cappuccino', 'coffee', 'Cappuccino', 'Mousse onctueuse, cacao en option', 22, ['sucre', 'lait', 'shot'],
      ['Cappuccino', 'Silky foam, cocoa optional'], ['كابوتشينو', 'رغوة ناعمة، كاكاو اختياري'],
      { video: MEDIA + 'v09044g40000cbokh6rc77uem774h4fg.mov' }),
    item('iced-latte', 'coffee', 'Latte glacé', 'Café froid, lait, glaçons, sirop vanille optionnel', 26, ['sucre', 'lait'],
      ['Iced latte', 'Cold espresso, milk, ice, vanilla syrup optional'], ['لاتيه بارد', 'إسبريسو بارد، حليب، جليد، فانيليا اختيارية'],
      { video: MEDIA + 'v14044g50000d33o2m7og65urp9k0keg.mov', tag: 'new' }),
    item('the-menthe', 'drink', 'Thé à la menthe', 'Théière en argent, menthe fraîche, sucre à part', 22, ['sucre'],
      ['Mint tea', 'Silver teapot, fresh mint, sugar on the side'], ['أتاي بالنعناع', 'إبريق فضة، نعناع طري، السكر جنبا'],
      { video: MEDIA + 'v1c044g50000d6lqmn7og65uhmc2vtl0.mov', tag: 'new' }),
    item('msemen', 'pastry', 'Msemen au miel', "Crêpe feuilletée chaude, miel d'oranger", 18, ['chauffer'],
      ['Msemen with honey', 'Warm flaky pancake, orange-blossom honey'], ['مسمن بالعسل', 'مسمن سخون، عسل البرتقال']),
    item('briouate', 'pastry', 'Briouate aux amandes', "Pâte filo, amandes, eau de fleur d'oranger", 14, ['chauffer'],
      ['Almond briouate', 'Filo pastry, almonds, orange-blossom water'], ['بريوات باللوز', 'عجين رقيق، اللوز، ماء الزهر']),
    item('croissant', 'pastry', 'Croissant beurre', 'Pur beurre · cuit ce matin', 12, ['chauffer', 'extras'],
      ['Butter croissant', 'All butter · baked this morning'], ['كرواسون بالزبدة', 'زبدة طبيعية · مخبوز هاد الصباح']),
    item('sandwich-thon', 'savory', 'Sandwich thon-olives', 'Pain maison, thon, olives noires, harissa', 32, ['pain', 'retirer', 'sauce'],
      ['Tuna-olive sandwich', 'House bread, tuna, black olives, harissa'], ['ساندويتش طون وزيتون', 'خبز محلي، طون، زيتون كحل، حريسة']),
    item('panini', 'savory', 'Panini fromage-tomate', 'Ciabatta, mozzarella, tomate confite', 28, ['pain', 'retirer'],
      ['Cheese-tomato panini', 'Ciabatta, mozzarella, slow-roasted tomato'], ['بانيني فرماج وماطيشة', 'تشاباتا، موزاريلا، ماطيشة محمصة']),
    item('fresh-orange', 'drink', "Jus d'orange pressé", 'Pressé minute, sans sucre ajouté', 18, ['glace'],
      ['Fresh-pressed orange juice', 'Pressed to order, no added sugar'], ['عصير ليمون فريسكو', 'معصور دابا، بلا سكر زائد']),
    item('avocado', 'drink', 'Smoothie avocat-banane', "Lait d'amande, miel, cardamome", 26, ['sucre', 'glace'],
      ['Avocado-banana smoothie', 'Almond milk, honey, cardamom'], ['سموتي أفوكا وبنانا', 'حليب اللوز، عسل، حبهان']),
    item('sparkling', 'drink', 'Eau pétillante Oulmès', '33 cl · servie fraîche', 8, [],
      ['Oulmès sparkling water', '33 cl · served chilled'], ['ما أولماس غازية', '33 سل · كيخدم بارد'])
  ];

  var menu = { cats: cats, items: items, opts: opts };
  var byId = {};
  items.forEach(function (it) { byId[it.id] = it; });
  var choice = {};
  opts.forEach(function (g) { g.choices.forEach(function (c) { choice[g.id + ':' + c.id] = c.price || 0; }); });

  var seq = 41;
  var orders = {};
  var later = function (v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 250); }); };

  function catalog() {
    return later({ name: 'Café Atlas', type: 'cafe', menu: JSON.parse(JSON.stringify(menu)), shop: null, orderpro: true, menuLangs: false, menuNutrition: false, zone: '', demo: true });
  }
  function placeOrder(body) {
    var lines = (Array.isArray(body && body.lines) ? body.lines : []).filter(function (l) { return l && byId[l.id]; }).map(function (l) {
      var unit = byId[l.id].price;
      (Array.isArray(l.optionChoices) ? l.optionChoices : []).forEach(function (p) { unit += choice[p.group + ':' + p.choiceId] || 0; });
      return { id: l.id, qty: Math.max(1, Number(l.qty) || 1), unitPrice: unit };
    });
    if (!lines.length) return later({ ok: false, error: 'empty' });
    var id = 'ord-demo-' + Date.now().toString(36);
    var total = lines.reduce(function (s, l) { return s + l.unitPrice * l.qty; }, 0);
    orders[id] = { at: Date.now(), takeout: body.mode === 'takeout' };
    return later({ ok: true, id: id, number: ++seq, total: total, lines: lines, demo: true });
  }
  /* The kitchen of a demo: accepted after 4 s, then ready (takeaway) or
     served at the table after 14 s. */
  function orderStatus(id) {
    var o = orders[id];
    if (!o) return later({ ok: false, error: 'not-found' });
    var age = Date.now() - o.at;
    var status = age < 4000 ? 'pending' : age < 14000 ? 'accepted' : (o.takeout ? 'ready' : 'served');
    return later({ ok: true, status: status });
  }
  function openSession(mode, table) {
    return later({ ok: true, session: 'ses-demo-' + Date.now().toString(36), mode: mode, table: table || '', status: 'open' });
  }
  function sessionStatus() { return later({ ok: true, status: 'open' }); }
  function serviceRequest() { return later({ ok: true }); }

  root.KiwiOrderDemo = {
    catalog: catalog, placeOrder: placeOrder, orderStatus: orderStatus,
    openSession: openSession, sessionStatus: sessionStatus, serviceRequest: serviceRequest
  };
})(typeof window !== 'undefined' ? window : globalThis);
