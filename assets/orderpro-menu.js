/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/orderpro-menu.js · what the QR page (kiwi-order.html) gave a
 * guest and OrderPro.html did not (spec §21.1, stage 3c: one guest-ordering
 * app). Loaded synchronously before OrderPro's own script, after
 * menu-i18n.js and order-ui-langs.js; hours.js may arrive later (defer), it
 * is only read when a status is asked for.
 *
 *   KiwiOrderMenu.strings(I18N)     adds this file's keys to fr/en/ar (the
 *                                   page's own keys win) and one dictionary
 *                                   per order-ui-langs language, over EN
 *   KiwiOrderMenu.configure(res)    the languages this store publishes
 *                                   (/api/menu: menuLangs, menu), its hours
 *                                   and zone; returns the language list
 *   KiwiOrderMenu.langs(), pick(saved), asLang(l), rtl(l), picker(current)
 *   KiwiOrderMenu.tr(entity, lang)  { name, desc } in that language, the
 *                                   merchant's text when stale or missing
 *   KiwiOrderMenu.closed(), renderClosed(t, lang)
 *                                   the opening-hours banner (#kh-closed)
 *   KiwiOrderMenu.setOrdering(on, t), ordering(), blocked()
 *                                   a menu to browse when Order Pro is off
 *   KiwiOrderMenu.nutritionSummary(item, t), nutritionDetail(item, t)
 *
 * Nothing here decides an order: the server refuses one outside the hours
 * (functions/api/order) and without Order Pro (403 orderpro-off). These
 * only tell the guest before they try.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var doc = root.document;
  var M = function () { return root.KiwiMenuI18n || null; };

  var STR = {
    fr: {
      closed_now: 'Fermé en ce moment',
      closed_why: "Nous n'acceptons pas de commande en dehors des heures d'ouverture.",
      ordering_off_note: "Carte à consulter : la commande depuis le téléphone n'est pas activée ici. Commandez au comptoir.",
      nutrition_title: 'Valeurs nutritionnelles',
      nutrition_indicative: 'Valeurs indicatives par portion, hors options',
      nutrition_allergens: 'Allergènes',
      nutrition_none: 'Aucun allergène déclaré',
      nutrient_energy: 'Énergie', nutrient_protein: 'Protéines', nutrient_carbs: 'Glucides',
      nutrient_fat: 'Lipides', nutrient_sugars: 'Sucres', nutrient_salt: 'Sel',
      nutrient_short_protein: 'P', nutrient_short_carbs: 'G', nutrient_short_fat: 'L',
      allergen_gluten: 'Gluten', allergen_crustaces: 'Crustacés', allergen_oeufs: 'Œufs', allergen_poissons: 'Poissons',
      allergen_arachides: 'Arachides', allergen_soja: 'Soja', allergen_lait: 'Lait', allergen_fruits_a_coque: 'Fruits à coque',
      allergen_celeri: 'Céleri', allergen_moutarde: 'Moutarde', allergen_sesame: 'Sésame', allergen_sulfites: 'Sulfites',
      allergen_lupin: 'Lupin', allergen_mollusques: 'Mollusques'
    },
    en: {
      closed_now: 'Closed right now',
      closed_why: "We don't take orders outside opening hours.",
      ordering_off_note: "Menu for browsing: ordering from your phone isn't enabled here. Please order at the counter.",
      nutrition_title: 'Nutrition facts',
      nutrition_indicative: 'Indicative values per portion, excluding options',
      nutrition_allergens: 'Allergens',
      nutrition_none: 'No declared allergens',
      nutrient_energy: 'Energy', nutrient_protein: 'Protein', nutrient_carbs: 'Carbohydrate',
      nutrient_fat: 'Fat', nutrient_sugars: 'Sugars', nutrient_salt: 'Salt',
      nutrient_short_protein: 'P', nutrient_short_carbs: 'C', nutrient_short_fat: 'F',
      allergen_gluten: 'Gluten', allergen_crustaces: 'Crustaceans', allergen_oeufs: 'Eggs', allergen_poissons: 'Fish',
      allergen_arachides: 'Peanuts', allergen_soja: 'Soy', allergen_lait: 'Milk', allergen_fruits_a_coque: 'Nuts',
      allergen_celeri: 'Celery', allergen_moutarde: 'Mustard', allergen_sesame: 'Sesame', allergen_sulfites: 'Sulphites',
      allergen_lupin: 'Lupin', allergen_mollusques: 'Molluscs'
    },
    ar: {
      closed_now: 'مغلق حاليًا',
      closed_why: 'لا نقبل الطلبات خارج ساعات العمل.',
      ordering_off_note: 'القائمة للاطلاع فقط: الطلب بالتلفون ماشي مفعل هنا. طلب من الكونطوار.',
      nutrition_title: 'القيم الغذائية',
      nutrition_indicative: 'قيم تقريبية لكل حصة، بدون الخيارات',
      nutrition_allergens: 'مسببات الحساسية',
      nutrition_none: 'لا توجد مسببات حساسية مصرح بها',
      nutrient_energy: 'الطاقة', nutrient_protein: 'البروتين', nutrient_carbs: 'الكربوهيدرات',
      nutrient_fat: 'الدهون', nutrient_sugars: 'السكريات', nutrient_salt: 'الملح',
      nutrient_short_protein: 'ب', nutrient_short_carbs: 'ك', nutrient_short_fat: 'د',
      allergen_gluten: 'الغلوتين', allergen_crustaces: 'القشريات', allergen_oeufs: 'البيض', allergen_poissons: 'السمك',
      allergen_arachides: 'الفول السوداني', allergen_soja: 'الصويا', allergen_lait: 'الحليب', allergen_fruits_a_coque: 'المكسرات',
      allergen_celeri: 'الكرفس', allergen_moutarde: 'الخردل', allergen_sesame: 'السمسم', allergen_sulfites: 'الكبريتيت',
      allergen_lupin: 'الترمس', allergen_mollusques: 'الرخويات'
    }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function strings(I18N) {
    Object.keys(STR).forEach(function (l) { I18N[l] = Object.assign({}, STR[l], I18N[l] || {}); });
    var extra = root.KiwiOrderUiLangs || {};
    Object.keys(extra).forEach(function (l) {
      if (!I18N[l]) I18N[l] = Object.assign({}, I18N.en, extra[l]);
    });
    return I18N;
  }

  /* ── languages ───────────────────────────────────────────────────────── */
  var CORE = ['fr', 'ar', 'en'];
  var list = CORE.slice();
  function asLang(l) { var m = M(); return m ? m.asLang(l) : (CORE.indexOf(l) >= 0 ? l : ''); }
  function rtl(l) { var m = M(); return m ? !!m.rtl(l) : l === 'ar'; }
  function pick(saved) {
    var s = asLang(saved || '');
    if (s && list.indexOf(s) >= 0) return s;
    var m = M();
    var nav = root.navigator ? (root.navigator.languages || [root.navigator.language]) : [];
    var a = m ? m.autoPick(list, nav) : '';
    return a && list.indexOf(a) >= 0 ? a : (list.indexOf('fr') >= 0 ? 'fr' : list[0]);
  }
  /* The floating picker keeps OrderPro's short labels; each button names its
     language in full for a screen reader. */
  var SHORT = { ar: 'د', he: 'ע', 'zh-Hans': '简', 'zh-Hant': '繁', ja: '日', ko: '한', hi: 'हि', el: 'ΕΛ', ru: 'РУ', uk: 'УК' };
  function picker(current) {
    var m = M();
    var names = (m && m.NAMES) || { fr: 'Français', ar: 'الدارجة', en: 'English' };
    var host = doc.getElementById('lang-picker');
    if (!host) return;
    /* Shown in the reading order of the shipped picker (د · EN · FR) when the
       store keeps the three; the rest follow in the store's order. */
    var order = list.slice().sort(function (a, b) {
      var ia = ['ar', 'en', 'fr'].indexOf(a), ib = ['ar', 'en', 'fr'].indexOf(b);
      return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
    });
    host.innerHTML = order.map(function (l) {
      var label = SHORT[l] || String(l).split('-')[0].toUpperCase();
      return '<button class="lang-btn' + (l === current ? ' is-active' : '') + '" type="button" data-lang="' + esc(l) +
        '" lang="' + esc(l) + '" aria-label="' + esc(names[l] || l) + '" aria-pressed="' + (l === current) + '">' + esc(label) + '</button>';
    }).join('');
    host.classList.toggle('is-many', order.length > 3);
    /* The header keeps the picker's width free, so a long name or five
       languages never put the store's name under the keys. */
    try { doc.documentElement.style.setProperty('--lang-picker-w', host.offsetWidth + 'px'); } catch (_) {}
  }
  function tr(e, l) {
    var m = M();
    if (!m || !e) return null;
    return { name: m.name(e, l), desc: m.desc(e, l) };
  }

  /* ── opening hours ───────────────────────────────────────────────────── */
  /* Null until the merchant set hours in the dashboard. Then nothing is
     blocked: refusing a guest over a form nobody filled would cost the
     merchant a customer. */
  var hours = null, zone = '';
  function configure(res) {
    var menu = res && res.menu;
    hours = (menu && menu.hours) || null;
    zone = res && typeof res.zone === 'string' ? res.zone : '';
    var m = M();
    if (m && menu) { try { m.index(menu); } catch (_) {} }
    list = m ? (res && res.menuLangs === true && menu ? m.langs(menu) : m.LANGS.slice()) : CORE.slice();
    if (!list.length) list = CORE.slice();
    return list.slice();
  }
  function status() {
    var H = root.KiwiHours;
    if (!hours || !H) return null;
    try { return H.statusOf(hours, Date.now(), zone); } catch (_) { return null; }
  }
  function closed() { var s = status(); return !!(s && s.configured && !s.open); }
  function hoursText(lang) {
    var H = root.KiwiHours;
    if (!hours || !H) return '';
    var L = lang === 'ar' ? 'ar' : lang === 'fr' ? 'fr' : 'en';
    try { return H.summaryOf(hours, Date.now(), L, zone).text || ''; } catch (_) { return ''; }
  }
  /* It says why and when it reopens: a dry "unavailable" sends the guest next
     door, "we reopen tomorrow at 12:00" brings them back. */
  function renderClosed(t, lang) {
    var el = doc.getElementById('kh-closed');
    if (!closed()) { if (el) el.remove(); return false; }
    if (!el) {
      el = doc.createElement('div');
      el.id = 'kh-closed';
      el.className = 'kh-closed';
      el.setAttribute('role', 'status');
      var host = doc.getElementById('app') || doc.body;
      host.insertBefore(el, host.firstChild);
    }
    /* The floating language picker sits over the banner's end. */
    var p = doc.getElementById('lang-picker');
    el.style.paddingInlineEnd = (p && p.offsetWidth ? p.offsetWidth + 28 : 16) + 'px';
    var text = hoursText(lang);
    el.innerHTML = '<span class="kh-dot" aria-hidden="true"></span><span><b>' + esc(t('closed_now')) + '</b>' +
      (text ? ' · ' + esc(text) : '') + '</span>';
    return true;
  }

  /* ── a menu to browse ────────────────────────────────────────────────── */
  /* Order Pro is a paid option. Without it the server refuses every order;
     a printed table QR still has to show the menu, so the page shows it and
     hides every way to order. */
  var ordering = true;
  function setOrdering(on, t) {
    ordering = !!on;
    if (doc.body) doc.body.classList.toggle('ordering-off', !ordering);
    var oo = doc.getElementById('oo-banner');
    if (oo) {
      oo.hidden = ordering;
      if (!ordering) { oo.setAttribute('data-i18n', 'ordering_off_note'); oo.textContent = t('ordering_off_note'); }
    }
  }

  /* ── nutrition (only what the merchant marked complete) ──────────────── */
  function nutritionSummary(item, t) {
    var n = item && item.nutrition;
    if (!n) return '';
    var g = function (k, v) { return '<span>' + esc(t(k)) + ' <bdi dir="ltr">' + esc(v) + ' g</bdi></span>'; };
    return '<div class="dish-nutrition"><bdi dir="ltr">' + esc(n.kcal) + ' kcal</bdi><span aria-hidden="true">·</span>' +
      g('nutrient_short_protein', n.protein) + '<span aria-hidden="true">·</span>' +
      g('nutrient_short_carbs', n.carbs) + '<span aria-hidden="true">·</span>' + g('nutrient_short_fat', n.fat) + '</div>';
  }
  function nutritionDetail(item, t) {
    var n = item && item.nutrition;
    if (!n) return '';
    var cells = [
      ['nutrient_energy', 'kcal', 'kcal'], ['nutrient_protein', 'protein', 'g'],
      ['nutrient_carbs', 'carbs', 'g'], ['nutrient_fat', 'fat', 'g'],
      ['nutrient_sugars', 'sugars', 'g'], ['nutrient_salt', 'salt', 'g']
    ].map(function (c) {
      return '<div class="custom-nutrition-cell"><span>' + esc(t(c[0])) + '</span><bdi dir="ltr">' + esc(n[c[1]]) + ' ' + c[2] + '</bdi></div>';
    }).join('');
    var allergens = Array.isArray(item.allergens) ? item.allergens : [];
    var chips = allergens.length ? allergens.map(function (k) {
      return '<span class="custom-allergen-chip">' + (k === 'gluten' ? '<i class="custom-allergen-icon" aria-hidden="true"></i>' : '') + esc(t('allergen_' + k)) + '</span>';
    }).join('') : '<span class="custom-allergen-chip">' + esc(t('nutrition_none')) + '</span>';
    return '<section class="custom-nutrition" aria-label="' + esc(t('nutrition_title')) + '"><div class="custom-nutrition-title">' + esc(t('nutrition_title')) +
      '</div><div class="custom-nutrition-grid">' + cells + '</div><div class="custom-allergens"><div class="custom-allergens-label">' + esc(t('nutrition_allergens')) +
      '</div><div class="custom-allergen-list">' + chips + '</div></div><p class="custom-nutrition-note">' + esc(t('nutrition_indicative')) + '</p></section>';
  }

  root.KiwiOrderMenu = {
    strings: strings, configure: configure,
    langs: function () { return list.slice(); }, pick: pick, asLang: asLang, rtl: rtl, picker: picker, tr: tr,
    closed: closed, hoursText: hoursText, renderClosed: renderClosed,
    setOrdering: setOrdering, ordering: function () { return ordering; },
    blocked: function () { return !ordering || closed(); },
    nutritionSummary: nutritionSummary, nutritionDetail: nutritionDetail
  };
})(typeof window !== 'undefined' ? window : globalThis);
