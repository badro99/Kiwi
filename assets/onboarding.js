/* ═══════════════════════════════════════════════════════════════════════
 *  KIWI · FIRST-RUN ONBOARDING  (assets/onboarding.js)
 *
 *  A warm, guided setup that runs BEFORE the merchant ever sees a dashboard.
 *  We don't know who the client is yet — so instead of greeting "Bonjour
 *  Rachid" and showing Café Atlas, we ask. The flow gathers:
 *    · who they are (first name — used to greet them by name afterwards)
 *    · their business (name + trade)
 *    · how many établissements + which city
 *    · how big the team is
 *    · what they care about (goals)  — skippable
 *    · up to 4 team access codes (owner / manager / staff / +1)
 *      -> these become REAL PIN codes: the lock screen validates against them
 *         and switches role (owner = full, manager = no money, staff = ops).
 *
 *  Everything after the business name is optional and skippable, so nobody
 *  feels trapped. On finish it creates a fresh, empty venue (via KiwiVenue),
 *  persists the answers to localStorage, and reveals the dashboard.
 *
 *  Triggers:
 *    · Automatic on genuine first run (no `kiwiOnboarded`, no custom venue).
 *    · Manually via PIN 0000 (Kiwi.handlers['onboard']) or KiwiOnboarding.open().
 *    · Force with ?onboarding  ·  skip with ?demo  ·  KiwiOnboarding.reset().
 *
 *  All interpolated user values pass through esc() — same trusted-HTML
 *  contract as interactive.js modal/drawer bodies. Vanilla, self-contained.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── i18n · captured from the app's language choice ──────────────────── */
  const lang = () => { try { return localStorage.getItem('kiwiLang') || 'fr'; } catch (_) { return 'fr'; } };
  const tr = (o) => (o == null ? '' : (o[lang()] ?? o.fr ?? ''));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };

  /* ── Trades — the visible label maps to a data vertical (`base`).
   *    THE list now lives in assets/trades.js and every screen that offers a
   *    trade reads it there: this wizard, the PIN-0000 wizard, the hotel
   *    wizard, the establishment card in Settings. Four copies had drifted —
   *    two of them offered trades that the venue engine could not even map to
   *    a vertical. The literal below is only the parachute for a page that
   *    somehow loads this file without trades.js. ── */
  /* Material Symbols (Outlined, 400, grade 0, grille 24), recopiés depuis
   * assets/icons/material/ — voir le README de ce dossier. Forme pleine,
   * viewBox natif 0 -960 960 960 : la CSS pilote `color`, pas `stroke`. */
  const mi = (d) => `<svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
  const TYPES = (window.KiwiTrades && window.KiwiTrades.all()) || [
    { id: 'restaurant', base: 'restaurant', primary: true, label: { fr: 'Restaurant', en: 'Restaurant', ar: 'مطعم' }, /* restaurant.svg */ icon: mi('M280-80v-366q-51-14-85.5-56T160-600v-280h80v280h40v-280h80v280h40v-280h80v280q0 56-34.5 98T360-446v366h-80Zm400 0v-320H560v-280q0-83 58.5-141.5T760-880v800h-80Z') },
    { id: 'cafe', base: 'restaurant', primary: true, label: { fr: 'Café / Salon de thé', en: 'Café / Tea room', ar: 'مقهى' }, /* local_cafe.svg */ icon: mi('M160-120v-80h640v80H160Zm160-160q-66 0-113-47t-47-113v-400h640q33 0 56.5 23.5T880-760v120q0 33-23.5 56.5T800-560h-80v120q0 66-47 113t-113 47H320Zm0-80h240q33 0 56.5-23.5T640-440v-320H240v320q0 33 23.5 56.5T320-360Zm400-280h80v-120h-80v120ZM320-360h-80 400-320Z') },
    { id: 'boutique', base: 'boutique', primary: true, label: { fr: 'Boutique', en: 'Shop', ar: 'متجر' }, /* storefront.svg */ icon: mi('M841-518v318q0 33-23.5 56.5T761-120H201q-33 0-56.5-23.5T121-200v-318q-23-21-35.5-54t-.5-72l42-136q8-26 28.5-43t47.5-17h556q27 0 47 16.5t29 43.5l42 136q12 39-.5 71T841-518Zm-272-42q27 0 41-18.5t11-41.5l-22-140h-78v148q0 21 14 36.5t34 15.5Zm-180 0q23 0 37.5-15.5T441-612v-148h-78l-22 140q-4 24 10.5 42t37.5 18Zm-178 0q18 0 31.5-13t16.5-33l22-154h-78l-40 134q-6 20 6.5 43t41.5 23Zm540 0q29 0 42-23t6-43l-42-134h-76l22 154q3 20 16.5 33t31.5 13ZM201-200h560v-282q-5 2-6.5 2H751q-27 0-47.5-9T663-518q-18 18-41 28t-49 10q-27 0-50.5-10T481-518q-17 18-39.5 28T393-480q-29 0-52.5-10T299-518q-21 21-41.5 29.5T211-480h-4.5q-2.5 0-5.5-2v282Zm560 0H201h560Z') },
    { id: 'spa', base: 'spa', primary: true, label: { fr: 'Spa / Bien-être', en: 'Spa / Wellness', ar: 'سبا' }, /* spa.svg */ icon: mi('M480-80q-73-9-145-39.5T206.5-207Q150-264 115-351T80-560v-40h40q51 0 105 13t101 39q12-86 54.5-176.5T480-880q57 65 99.5 155.5T634-548q47-26 101-39t105-13h40v40q0 122-35 209t-91.5 144q-56.5 57-128 87.5T480-80Zm-2-82q-11-166-98.5-251T162-518q11 171 101.5 255T478-162Zm2-254q15-22 36.5-45.5T558-502q-2-57-22.5-119T480-742q-35 59-55.5 121T402-502q20 17 42 40.5t36 45.5Zm78 236q37-12 77-35t74.5-62.5q34.5-39.5 59-98.5T798-518q-94 14-165 62.5T524-332q12 32 20.5 70t13.5 82Zm-78-236Zm78 236Zm-80 18Zm46-170ZM480-80Z') },
    { id: 'fastfood', base: 'restaurant', label: { fr: 'Fast-food / Snack', en: 'Fast food', ar: 'وجبات سريعة' }, /* lunch_dining.svg */ icon: mi('M160-120q-33 0-56.5-23.5T80-200v-120h800v120q0 33-23.5 56.5T800-120H160Zm0-120v40h640v-40H160Zm263-160q-21 20-77 20t-76-20q-20-20-56-20t-57 20q-21 20-77 20v-80q36 0 57-20t77-20q56 0 76 20t56 20q36 0 57-20t77-20q56 0 77 20t57 20q36 0 56-20t76-20q56 0 79 20t55 20v80q-56 0-75-20t-55-20q-36 0-58 20t-78 20q-56 0-77-20t-57-20q-36 0-57 20ZM80-560v-40q0-115 108.5-177.5T480-840q183 0 291.5 62.5T880-600v40H80Zm400-200q-124 0-207.5 31T166-640h628q-23-58-106.5-89T480-760Zm0 520Zm0-400Z') },
    { id: 'bakery', base: 'restaurant', label: { fr: 'Boulangerie / Pâtisserie', en: 'Bakery', ar: 'مخبزة' }, /* bakery_dining.svg */ icon: mi('M804-282q17 9 30-4t4-30l-58-108-42 108 66 34Zm-200-38h48l96-238q3-8-1.5-13.5T736-580l-80-32q-9-3-17.5 2T628-596l-24 276Zm-296 0h48l-24-276q-2-11-10.5-15t-17.5-1l-80 32q-8 3-11.5 8.5T212-558l96 238Zm-152 38 66-34-42-108-58 108q-9 17 4 30t30 4Zm280-38h88l30-338q2-9-4.5-15.5T534-680H426q-8 0-14.5 6.5T406-658l30 338ZM138-200q-42 0-70-31.5T40-306q0-12 3.5-23.5T52-352l88-168q-14-40 1-79t53-55l80-32q14-5 28-7t28 1q14-29 39-48.5t57-19.5h108q32 0 57 19.5t39 48.5q14-2 28-.5t28 6.5l80 32q40 16 56 55t-2 77l88 168q6 11 9 23t3 25q0 45-30.5 75.5T814-200q-11 0-22-2.5t-22-7.5l-62-30H250l-56 30q-13 7-27.5 8.5T138-200Zm342-280Z') },
    { id: 'pizzeria', base: 'restaurant', label: { fr: 'Pizzeria', en: 'Pizzeria', ar: 'بيتزيريا' }, /* local_pizza.svg */ icon: mi('M480-80 80-680q85-72 186.5-116T480-840q112 0 213.5 43.5T880-680L480-80Zm0-144 292-438q-65-45-139-71.5T480-760q-79 0-152.5 26.5T188-662l292 438Zm-57.5-353.5Q440-595 440-620t-17.5-42.5Q405-680 380-680t-42.5 17.5Q320-645 320-620t17.5 42.5Q355-560 380-560t42.5-17.5Zm100 200Q540-395 540-420t-17.5-42.5Q505-480 480-480t-42.5 17.5Q420-445 420-420t17.5 42.5Q455-360 480-360t42.5-17.5ZM480-224Z') },
    { id: 'foodtruck', base: 'restaurant', label: { fr: 'Food truck', en: 'Food truck', ar: 'شاحنة طعام' }, /* local_shipping.svg */ icon: mi('M155-195q-35-35-35-85H40v-440q0-33 23.5-56.5T120-800h560v160h120l120 160v200h-80q0 50-35 85t-85 35q-50 0-85-35t-35-85H360q0 50-35 85t-85 35q-50 0-85-35Zm113.5-56.5Q280-263 280-280t-11.5-28.5Q257-320 240-320t-28.5 11.5Q200-297 200-280t11.5 28.5Q223-240 240-240t28.5-11.5ZM120-360h32q17-18 39-29t49-11q27 0 49 11t39 29h272v-360H120v360Zm628.5 108.5Q760-263 760-280t-11.5-28.5Q737-320 720-320t-28.5 11.5Q680-297 680-280t11.5 28.5Q703-240 720-240t28.5-11.5ZM680-440h170l-90-120h-80v120ZM360-540Z') },
    { id: 'epicerie', base: 'boutique', label: { fr: 'Épicerie / Superette', en: 'Grocery', ar: 'بقالة' }, /* local_grocery_store.svg */ icon: mi('M223.5-103.5Q200-127 200-160t23.5-56.5Q247-240 280-240t56.5 23.5Q360-193 360-160t-23.5 56.5Q313-80 280-80t-56.5-23.5Zm400 0Q600-127 600-160t23.5-56.5Q647-240 680-240t56.5 23.5Q760-193 760-160t-23.5 56.5Q713-80 680-80t-56.5-23.5ZM246-720l96 200h280l110-200H246Zm-38-80h590q23 0 35 20.5t1 41.5L692-482q-11 20-29.5 31T622-440H324l-44 80h480v80H280q-45 0-68-39.5t-2-78.5l54-98-144-304H40v-80h130l38 80Zm134 280h280-280Z') },
    { id: 'pharmacie', base: 'boutique', label: { fr: 'Pharmacie', en: 'Pharmacy', ar: 'صيدلية' }, /* local_pharmacy.svg */ icon: mi('M120-120v-80l80-240-80-240v-80h508l58-160 94 34-46 126h106v80l-80 240 80 240v80H120Zm320-160h80v-120h120v-80H520v-120h-80v120H320v80h120v120Zm-236 80h552l-80-240 80-240H204l80 240-80 240Zm276-240Z') },
    { id: 'fleuriste', base: 'boutique', label: { fr: 'Fleuriste', en: 'Florist', ar: 'محل أزهار' }, /* local_florist.svg */ icon: mi('M480-600q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm-70.5 218.5Q378-403 364-438q-5 0-9 .5t-9 .5q-52 0-89-37t-37-89q0-21 7-40.5t21-36.5q-13-17-20-36.5t-7-40.5q0-52 36.5-89t88.5-37q5 0 9 .5t9 .5q14-35 45.5-56.5T480-920q39 0 70.5 21.5T596-842q5 0 9-.5t9-.5q52 0 88.5 37t36.5 89q0 21-6.5 40.5T712-640q13 17 20 36.5t7 40.5q0 52-36.5 89T614-437q-5 0-9-.5t-9-.5q-14 35-45.5 56.5T480-360q-39 0-70.5-21.5ZM480-80q0-74 28.5-139.5T586-334q49-49 114.5-77.5T840-440q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Zm98-98q57-21 100-64t64-100q-57 21-100 64t-64 100Zm-98 98q0-74-28.5-139.5T374-334q-49-49-114.5-77.5T120-440q0 74 28.5 139.5T226-186q49 49 114.5 77.5T480-80Zm-98-98q-57-21-100-64t-64-100q57 21 100 64t64 100Zm196 0Zm-196 0Zm232-339q19 0 32.5-13.5T660-563q0-14-7.5-24.5T633-604l-35-17q-2 11-6 21.5t-9 19.5q-5 9-12 17t-15 15l32 23q5 4 11.5 6t14.5 2Zm-16-142 35-17q12-6 19-17t7-24q0-19-13-32.5T614-763q-8 0-14 2t-12 6l-33 23q8 7 15.5 15t12.5 17q5 9 9 19.5t6 21.5Zm-159-93q10-4 20-6t21-2q11 0 21 2t20 6l5-44q2-18-12.5-31T480-840q-19 0-33.5 13T434-796l5 44Zm41 312q19 0 33.5-13t12.5-31l-5-44q-10 4-20 6t-21 2q-11 0-21-2t-20-6l-5 44q-2 18 12.5 31t33.5 13ZM362-659q2-11 6-21.5t9-19.5q5-9 12-17t15-15l-32-23q-5-4-11.5-6t-14.5-2q-19 0-32.5 13.5T300-717q0 13 7.5 24t19.5 17l35 17Zm-16 141q8 0 14-1.5t12-6.5l33-22q-8-7-15.5-15T377-580q-5-9-9-19.5t-6-21.5l-35 17q-12 6-19 17t-7 24q1 19 13.5 32t31.5 13Zm237-62Zm0-120Zm-103-60Zm0 240ZM377-700Zm0 120Z') },
    { id: 'maison', base: 'boutique', label: { fr: 'Maison', en: 'Home', ar: 'المنزل' }, /* home_and_garden.svg */ icon: mi('M160-160v-375l-72 55-47-63 439-337 440 336-48 64-392-300-240 184v356h160v80H160Zm540 95q-42 29-92.5 24.5T521-81q-36-36-40.5-86.5T505-260q-29-42-24.5-92.5T521-439q36-36 86.5-40.5T700-455q42-29 92.5-24.5T879-439q36 36 40.5 86.5T895-260q29 42 24.5 92.5T879-81q-36 36-86.5 40.5T700-65Zm0-98 46 32q18 13 39 11t37-18q16-16 18-37t-11-39l-32-46 32-46q13-18 11-39t-18-37q-16-16-37-18t-39 11l-46 32-46-32q-18-13-39-11t-37 18q-16 16-18 37t11 39l32 46-32 46q-13 18-11 39t18 37q16 16 37 18t39-11l46-32Zm35.5-61.5Q750-239 750-260t-14.5-35.5Q721-310 700-310t-35.5 14.5Q650-281 650-260t14.5 35.5Q679-210 700-210t35.5-14.5ZM480-470Zm220 210Z') },
    { id: 'coiffure', base: 'spa', label: { fr: 'Salon de coiffure', en: 'Hair salon', ar: 'صالون حلاقة' }, /* content_cut.svg */ icon: mi('M760-120 480-400l-94 94q8 15 11 32t3 34q0 66-47 113T240-80q-66 0-113-47T80-240q0-66 47-113t113-47q17 0 34 3t32 11l94-94-94-94q-15 8-32 11t-34 3q-66 0-113-47T80-720q0-66 47-113t113-47q66 0 113 47t47 113q0 17-3 34t-11 32l494 494v40H760ZM600-520l-80-80 240-240h120v40L600-520ZM296.5-663.5Q320-687 320-720t-23.5-56.5Q273-800 240-800t-56.5 23.5Q160-753 160-720t23.5 56.5Q207-640 240-640t56.5-23.5ZM494-466q6-6 6-14t-6-14q-6-6-14-6t-14 6q-6 6-6 14t6 14q6 6 14 6t14-6ZM296.5-183.5Q320-207 320-240t-23.5-56.5Q273-320 240-320t-56.5 23.5Q160-273 160-240t23.5 56.5Q207-160 240-160t56.5-23.5Z') },
    { id: 'sport', base: 'spa', label: { fr: 'Salle de sport', en: 'Gym', ar: 'قاعة رياضية' }, /* fitness_center.svg */ icon: mi('m536-84-56-56 142-142-340-340-142 142-56-56 56-58-56-56 84-84-56-58 56-56 58 56 84-84 56 56 58-56 56 56-142 142 340 340 142-142 56 56-56 58 56 56-84 84 56 58-56 56-58-56-84 84-56-56-58 56Z') },
    { id: 'autre', base: 'boutique', label: { fr: 'Autre activité', en: 'Something else', ar: 'نشاط آخر' }, /* category.svg */ icon: mi('m260-520 220-360 220 360H260ZM700-80q-75 0-127.5-52.5T520-260q0-75 52.5-127.5T700-440q75 0 127.5 52.5T880-260q0 75-52.5 127.5T700-80Zm-580-20v-320h320v320H120Zm580-60q42 0 71-29t29-71q0-42-29-71t-71-29q-42 0-71 29t-29 71q0 42 29 71t71 29Zm-500-20h160v-160H200v160Zm202-420h156l-78-126-78 126Zm78 0ZM360-340Zm340 80Z') },
  ];

  /* ── What matters to them — informs which modules we surface first ────── */
  const GOALS = [
    { id: 'sales', label: { fr: 'Augmenter mes ventes', en: 'Grow my sales', ar: 'زيادة مبيعاتي' }, /* trending_up.svg */ icon: mi('m136-240-56-56 296-298 160 160 208-206H640v-80h240v240h-80v-104L536-320 376-480 136-240Z') },
    { id: 'time', label: { fr: 'Gagner du temps', en: 'Save time', ar: 'توفير الوقت' }, /* schedule.svg */ icon: mi('m612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z') },
    { id: 'theft', label: { fr: 'Réduire les pertes & le vol', en: 'Cut losses & theft', ar: 'تقليل الخسائر والسرقة' }, /* shield.svg */ icon: mi('M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z') },
    { id: 'margins', label: { fr: 'Comprendre mes marges', en: 'Understand my margins', ar: 'فهم هوامشي' }, /* bar_chart.svg */ icon: mi('M640-160v-280h160v280H640Zm-240 0v-640h160v640H400Zm-240 0v-440h160v440H160Z') },
    { id: 'stock', label: { fr: 'Mieux gérer mon stock', en: 'Manage my stock', ar: 'إدارة مخزوني' }, /* inventory_2.svg */ icon: mi('M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z') },
    { id: 'loyalty', label: { fr: 'Fidéliser mes clients', en: 'Keep customers loyal', ar: 'كسب ولاء العملاء' }, /* favorite.svg */ icon: mi('m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z') },
    { id: 'remote', label: { fr: 'Piloter à distance', en: 'Manage remotely', ar: 'الإدارة عن بعد' }, /* phonelink.svg */ icon: mi('M480-540ZM80-160v-80h400v80H80Zm120-120q-33 0-56.5-23.5T120-360v-360q0-33 23.5-56.5T200-800h560q33 0 56.5 23.5T840-720H200v360h280v80H200Zm600 40v-320H640v320h160Zm-180 80q-25 0-42.5-17.5T560-220v-360q0-25 17.5-42.5T620-640h200q25 0 42.5 17.5T880-580v360q0 25-17.5 42.5T820-160H620Zm100-300q13 0 21.5-9t8.5-21q0-13-8.5-21.5T720-520q-12 0-21 8.5t-9 21.5q0 12 9 21t21 9Zm0 60Z') },
    { id: 'multi', label: { fr: 'Gérer plusieurs points de vente', en: 'Run multiple locations', ar: 'إدارة عدة نقاط بيع' }, /* location_city.svg */ icon: mi('M120-120v-560h240v-80l120-120 120 120v240h240v400H120Zm80-80h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm240 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm240 480h80v-80h-80v80Zm0-160h80v-80h-80v80Z') },
  ];

  /* ── Team access rows offered in the PIN step ─────────────────────────── */
  const ACCESS = [
    { role: 'owner',   fixed: true,  title: { fr: 'Vous · propriétaire', en: 'You · owner', ar: 'أنت · المالك' },       perm: { fr: 'Accès complet, finances, paie, tout.', en: 'Full access, finances, payroll, everything.', ar: 'وصول كامل.' } },
    { role: 'manager', fixed: false, title: { fr: 'Responsable / gérant', en: 'Manager', ar: 'المسؤول' },                perm: { fr: 'Tout sauf finances, marges & paie.', en: 'Everything except finances, margins & payroll.', ar: 'كل شيء ما عدا المالية.' } },
    { role: 'staff',   fixed: false, title: { fr: 'Équipe / caissier', en: 'Staff / cashier', ar: 'الفريق' },            perm: { fr: 'Caisse, commandes & salle uniquement.', en: 'Register, orders & floor only.', ar: 'الصندوق والطلبات فقط.' } },
    { role: 'staff',   fixed: false, title: { fr: 'Accès supplémentaire', en: 'Extra access', ar: 'وصول إضافي' },        perm: { fr: 'Caisse & commandes.', en: 'Register & orders.', ar: 'الصندوق والطلبات.' }, extra: true },
  ];
  const RESERVED = ['0000', '0505', '1111', '0909']; // demo codes — keep them free

  /* ── Session state ───────────────────────────────────────────────────── */
  const S = {
    step: 0,
    ownerName: '', bizName: '', typeId: 'restaurant',
    venueCount: 1, city: '',
    teamSize: 3,
    goals: [], dailyGoal: '',
    pins: [ { role: 'owner', name: '', code: '' }, { role: 'manager', name: '', code: '' }, { role: 'staff', name: '', code: '' }, { role: 'staff', name: '', code: '' } ],
  };
  const DRAFT_KEY = 'kiwiOnboardingDraft:v1';
  function saveDraft() {
    /* Access codes are credentials. Never put them in persistent browser
       storage merely to make the wizard resumable. Names/roles may resume;
       every PIN must be entered again after a reload. */
    const safe = {
      step: Math.max(0, Math.min(6, Number(S.step) || 0)),
      ownerName: S.ownerName, bizName: S.bizName, typeId: S.typeId,
      venueCount: S.venueCount, city: S.city, teamSize: S.teamSize,
      goals: Array.isArray(S.goals) ? S.goals.slice(0, GOALS.length) : [],
      dailyGoal: S.dailyGoal,
      pins: (Array.isArray(S.pins) ? S.pins : []).slice(0, 20).map((p) => ({
        role: p && p.role === 'manager' ? 'manager' : (p && p.role === 'owner' ? 'owner' : 'staff'),
        name: String((p && p.name) || '').slice(0, 20), code: '',
      })),
    };
    LS.set(DRAFT_KEY, JSON.stringify(safe));
  }
  function restoreDraft() {
    let d = null;
    try { d = JSON.parse(LS.get(DRAFT_KEY) || 'null'); } catch (_) {}
    if (!d || typeof d !== 'object') return;
    const knownType = TYPES.some((t) => t.id === d.typeId);
    S.step = Math.max(0, Math.min(6, Number(d.step) || 0));
    S.ownerName = String(d.ownerName || '').slice(0, 40);
    S.bizName = String(d.bizName || '').slice(0, 60);
    S.typeId = knownType ? d.typeId : S.typeId;
    S.venueCount = Math.max(1, Math.min(60, Number(d.venueCount) || 1));
    S.city = String(d.city || '').slice(0, 30);
    S.teamSize = Math.max(1, Math.min(200, Number(d.teamSize) || 1));
    S.goals = Array.isArray(d.goals) ? d.goals.filter((g) => GOALS.some((x) => x.id === g)).slice(0, GOALS.length) : [];
    S.dailyGoal = String(d.dailyGoal || '').slice(0, 24);
    if (Array.isArray(d.pins) && d.pins.length) {
      S.pins = d.pins.slice(0, 20).map((p, i) => ({
        role: i === 0 ? 'owner' : (p && p.role === 'manager' ? 'manager' : 'staff'),
        name: String((p && p.name) || '').slice(0, 20), code: '',
      }));
    }
  }
  restoreDraft();
  const TOTAL = 6; // counted steps (welcome + finish are bookends)
  let root = null, injected = false, opened = false;
  // True once the ACCOUNT answered step 1 for us — see prefillFromAccount().
  let namePrefilled = false;

  function entryBrand() {
    return `<span class="kob-brand" aria-label="Kiwi">
      <span class="kob-brand-legacy">kiwi<i></i></span>
      <span class="vx-entry-logo" aria-hidden="true">
        <img class="brand-logo-light" src="assets/kiwi-logo.svg" width="846" height="446" alt="" />
        <img class="brand-logo-dark" src="assets/kiwi-logo-dark.svg" width="846" height="446" alt="" />
      </span>
    </span>`;
  }

  /* ── Styles (scoped .kob-) ───────────────────────────────────────────── */
  function inject() {
    if (injected) return; injected = true;
    const css = `
    .kob-root{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;
      padding:24px;color:var(--paper);opacity:0;transition:opacity .5s cubic-bezier(.32,.72,0,1);
      background:radial-gradient(80% 60% at 28% 16%,rgba(125,242,176,.12),transparent 60%),
                 radial-gradient(70% 55% at 78% 88%,rgba(11,110,79,.24),transparent 62%),
                 linear-gradient(135deg,#0A1612,#0A0F0D);}
    .kob-root.kob-in{opacity:1;}
    .kob-root.kob-out{opacity:0;transform:scale(1.02);pointer-events:none;}
    .kob-card{width:100%;max-width:560px;max-height:calc(100vh - 48px);display:flex;flex-direction:column;
      background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:26px;
      padding:30px 32px 26px;box-shadow:0 40px 90px -30px rgba(0,0,0,.6);-webkit-backdrop-filter:blur(18px) saturate(1.1);backdrop-filter:blur(18px) saturate(1.1);}
    /* Liquid Glass — real refraction when assets/liquid-glass.js is present and enabled.
       Same fill/blur (legibility preserved); only adds the #kiwi-lg displacement. Inert otherwise. */
    @supports ((-webkit-backdrop-filter:url("#k")) or (backdrop-filter:url("#k"))){
      html[data-kiwi-glass="on"] .kob-card{-webkit-backdrop-filter:url(#kiwi-lg) blur(18px) saturate(1.1);backdrop-filter:url(#kiwi-lg) blur(18px) saturate(1.1);}
    }
    .kob-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;min-height:24px;}
    .kob-brand{font-family:var(--sans);font-weight:600;font-size:19px;letter-spacing:-.03em;display:inline-flex;align-items:center;}
    .kob-brand i{width:6px;height:6px;border-radius:50%;background:var(--mint);display:inline-block;margin-left:3px;transform:translateY(1px);}
    /* The real wordmark only rides in under the Vexel skin, which swaps the
       legacy text mark for it (design-vexel.css § 13). Hidden by default so the
       pre-Vexel presentation is untouched. */
    .kob-brand .vx-entry-logo{display:none;}
    .kob-config-label{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(233,239,233,.4);}
    .kob-rail{display:flex;gap:6px;align-items:center;}
    .kob-rail b{width:20px;height:4px;border-radius:2px;background:rgba(255,255,255,.16);transition:background .3s,width .3s;display:block;}
    .kob-rail b.on{background:var(--mint);width:30px;}
    .kob-rail b.done{background:rgba(125,242,176,.55);}
    .kob-body{overflow-y:auto;overflow-x:hidden;flex:1;margin:-4px -6px 0;padding:4px 6px 2px;}
    .kob-body::-webkit-scrollbar{width:7px;}.kob-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:6px;}
    .kob-eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--mint);margin:0 0 12px;}
    .kob-h{font-family:var(--serif);font-weight:400;font-size:clamp(30px,5vw,42px);line-height:1.04;letter-spacing:-.01em;margin:0 0 10px;color:#fff;}
    .kob-h .k-sans{font-family:var(--sans);font-style:normal;font-weight:600;letter-spacing:-.02em;}
    .kob-sub{font-size:14.5px;line-height:1.55;color:rgba(233,239,233,.72);margin:0 0 22px;max-width:44ch;}
    .kob-anim{animation:kob-rise .44s cubic-bezier(.32,.72,0,1) both;}
    @keyframes kob-rise{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
    .kob-field{width:100%;box-sizing:border-box;font-family:var(--sans);font-size:16px;color:#fff;
      background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.14);border-radius:14px;padding:15px 16px;outline:none;
      transition:border-color .16s,background .16s;}
    .kob-field::placeholder{color:rgba(233,239,233,.4);}
    .kob-field:focus{border-color:var(--mint);background:rgba(255,255,255,.09);}
    .kob-lbl{display:block;font-size:12.5px;font-weight:500;color:rgba(233,239,233,.62);margin:16px 0 7px;letter-spacing:.005em;}
    .kob-lbl .opt{color:rgba(233,239,233,.4);font-weight:400;}
    .kob-types{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;}
    .kob-type{display:flex;flex-direction:column;align-items:center;gap:8px;padding:15px 8px;cursor:pointer;text-align:center;
      background:rgba(255,255,255,.045);border:1.5px solid rgba(255,255,255,.1);border-radius:15px;
      font-family:var(--sans);font-size:12px;font-weight:500;color:rgba(233,239,233,.82);transition:border-color .14s,background .14s,transform .14s;}
    .kob-type svg{width:24px;height:24px;color:rgba(233,239,233,.7);transition:color .14s;}
    .kob-type:hover{border-color:rgba(255,255,255,.28);transform:translateY(-1px);}
    .kob-type.sel{border-color:var(--mint);background:rgba(125,242,176,.13);color:#fff;}
    .kob-type.sel svg{color:var(--mint);}
    .kob-type.hide{display:none;}
    .kob-more{margin-top:10px;width:100%;padding:11px;cursor:pointer;background:transparent;border:1.5px dashed rgba(255,255,255,.2);
      border-radius:13px;font-family:var(--sans);font-size:13px;font-weight:500;color:rgba(233,239,233,.72);transition:border-color .14s,color .14s;}
    .kob-more:hover{border-color:var(--mint);color:var(--mint);}
    .kob-step{display:flex;align-items:center;gap:14px;justify-content:center;margin:6px 0 4px;}
    .kob-step button{width:52px;height:52px;border-radius:50%;cursor:pointer;font-size:26px;line-height:1;color:#fff;
      background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.16);transition:background .14s,border-color .14s,transform .1s;
      display:flex;align-items:center;justify-content:center;}
    .kob-step button:hover{background:rgba(255,255,255,.13);border-color:var(--mint);}
    .kob-step button:active{transform:scale(.92);}
    .kob-step .kob-num{min-width:96px;text-align:center;font-family:var(--sans);font-weight:600;font-size:46px;letter-spacing:-.03em;font-feature-settings:'tnum' 1;color:#fff;}
    .kob-step .kob-num small{display:block;font-size:12px;font-weight:500;letter-spacing:.02em;color:rgba(233,239,233,.5);margin-top:2px;}
    .kob-chips{display:flex;flex-wrap:wrap;gap:9px;}
    .kob-chip{display:inline-flex;align-items:center;gap:8px;padding:11px 15px 11px 13px;cursor:pointer;
      background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.12);border-radius:13px;
      font-family:var(--sans);font-size:13.5px;font-weight:500;color:rgba(233,239,233,.85);transition:border-color .14s,background .14s;}
    .kob-chip svg{width:17px;height:17px;color:rgba(233,239,233,.6);transition:color .14s;}
    .kob-chip:hover{border-color:rgba(255,255,255,.3);}
    .kob-chip.sel{border-color:var(--mint);background:rgba(125,242,176,.13);color:#fff;}
    .kob-chip.sel svg{color:var(--mint);}
    .kob-chip .tick{width:16px;height:16px;opacity:0;transition:opacity .14s;}
    .kob-chip.sel .tick{opacity:1;}
    .kob-access{display:flex;flex-direction:column;gap:11px;}
    .kob-acc{background:rgba(255,255,255,.045);border:1.5px solid rgba(255,255,255,.1);border-radius:16px;padding:14px 15px;transition:border-color .16s,background .16s;}
    .kob-acc.filled{border-color:rgba(125,242,176,.42);background:rgba(125,242,176,.05);}
    .kob-acc-hd{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px;}
    .kob-acc-ttl{font-family:var(--sans);font-weight:600;font-size:14.5px;color:#fff;letter-spacing:-.01em;}
    .kob-acc-perm{font-size:11.5px;color:rgba(233,239,233,.52);line-height:1.4;margin-top:2px;}
    .kob-acc-tag{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:99px;white-space:nowrap;
      background:rgba(125,242,176,.14);color:var(--mint);}
    .kob-acc-tag.req{background:rgba(217,154,43,.16);color:#f0c46a;}
    .kob-acc-row{display:flex;gap:9px;}
    .kob-acc-row .kob-field{padding:11px 13px;font-size:14px;}
    .kob-name{flex:1.3;}
    .kob-code{flex:1;font-family:var(--mono);letter-spacing:.42em;text-align:center;font-size:17px;padding-right:8px;}
    .kob-code::placeholder{letter-spacing:.28em;}
    .kob-role{flex:1;padding:10px 34px 10px 13px;font-size:14px;appearance:none;-webkit-appearance:none;cursor:pointer;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23e9efe9' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;}
    .kob-role option{color:#0A0F0D;}
    .kob-acc-rm{background:none;border:0;cursor:pointer;color:rgba(233,239,233,.5);font-size:24px;line-height:1;width:34px;height:34px;border-radius:9px;flex:none;margin-left:8px;transition:color .14s,background .14s;}
    .kob-acc-rm:hover{color:#ffb3a3;background:rgba(255,255,255,.07);}
    .kob-acc-add{margin-top:11px;width:100%;padding:12px;cursor:pointer;background:transparent;border:1.5px dashed rgba(255,255,255,.2);
      border-radius:13px;font-family:var(--sans);font-size:13.5px;font-weight:500;color:rgba(233,239,233,.72);transition:border-color .14s,color .14s;}
    .kob-acc-add:hover{border-color:var(--mint);color:var(--mint);}
    .kob-foot{display:flex;gap:10px;align-items:center;margin-top:20px;flex-wrap:wrap;}
    .kob-btn{font-family:var(--sans);font-weight:600;font-size:15px;cursor:pointer;border:0;border-radius:14px;padding:15px 22px;
      transition:transform .12s,box-shadow .2s,background .16s;display:inline-flex;align-items:center;justify-content:center;gap:7px;}
    .kob-btn.primary{flex:1;color:#06231a;background:linear-gradient(135deg,#9dfbc4,var(--mint));box-shadow:0 14px 30px -12px rgba(125,242,176,.6);}
    .kob-btn.primary:hover{transform:translateY(-1px);box-shadow:0 18px 36px -12px rgba(125,242,176,.7);}
    .kob-btn.primary:active{transform:translateY(0);}
    .kob-btn.ghost{background:rgba(255,255,255,.06);color:rgba(233,239,233,.82);border:1.5px solid rgba(255,255,255,.14);}
    .kob-btn.ghost:hover{background:rgba(255,255,255,.11);color:#fff;}
    .kob-back{background:none;border:0;cursor:pointer;color:rgba(233,239,233,.55);font-family:var(--sans);font-size:13.5px;font-weight:500;
      padding:8px 4px;display:inline-flex;align-items:center;gap:5px;transition:color .14s;}
    .kob-back:hover{color:#fff;}
    .kob-skip{background:none;border:0;cursor:pointer;color:rgba(233,239,233,.5);font-family:var(--sans);font-size:13px;font-weight:500;text-decoration:underline;text-underline-offset:3px;padding:8px;transition:color .14s;}
    .kob-skip:hover{color:rgba(233,239,233,.85);}
    .kob-err{color:#ffb3a3;font-size:12.5px;margin:9px 2px 0;min-height:1px;}
    .kob-explore{text-align:center;margin-top:16px;}
    a.kob-skip{display:inline-block;}
    .kob-explore .kob-sep{color:rgba(233,239,233,.28);font-size:12px;}
    .kob-recap{display:flex;flex-direction:column;gap:1px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden;margin:2px 0 6px;}
    .kob-recap .r{display:flex;justify-content:space-between;gap:14px;padding:12px 15px;font-size:13.5px;}
    .kob-recap .r+.r{border-top:1px solid rgba(255,255,255,.07);}
    .kob-recap .r span{color:rgba(233,239,233,.55);}
    .kob-recap .r b{color:#fff;font-weight:600;text-align:right;}
    .kob-hero-mark{width:60px;height:60px;border-radius:18px;background:linear-gradient(140deg,var(--atlas),var(--riad));
      display:flex;align-items:center;justify-content:center;margin:0 0 22px;box-shadow:0 12px 30px -10px rgba(11,110,79,.8);}
    .kob-hero-mark svg{width:32px;height:32px;}
    .kob-celebrate{text-align:center;padding:12px 0;}
    .kob-celebrate .kob-hero-mark{margin:0 auto 22px;animation:kob-pop .5s cubic-bezier(0.34, 1.45, 0.5, 1) both;}
    @keyframes kob-pop{from{opacity:0;transform:scale(.4);}to{opacity:1;transform:none;}}
    @media (max-width:560px){
      .kob-card{padding:24px 20px 20px;border-radius:22px;}
      .kob-types{grid-template-columns:repeat(2,1fr);}
      .kob-acc-row{flex-direction:column;}
      .kob-h{font-size:30px;}
    }
    html[dir="rtl"] .kob-sub{margin-left:auto;}
    @media (prefers-reduced-motion:reduce){.kob-anim,.kob-celebrate .kob-hero-mark{animation:none;}.kob-root{transition:none;}}
    `;
    const s = document.createElement('style'); s.id = 'kob-style'; s.textContent = css;
    document.head.appendChild(s);
  }

  /* ── Rail ────────────────────────────────────────────────────────────── */
  // Same two-mark structure the lock screen and the account gate use: the
  // legacy text wordmark, plus the real logo the Vexel skin swaps in.
  function brandMark() {
    return '<span class="kob-brand-legacy"><img src="assets/kiwi-newlogo.svg" alt=""></span>'
      + '<span class="vx-entry-logo" aria-hidden="true">'
      + '<img class="brand-logo-light" src="assets/kiwi-newlogo.svg" width="886" height="486" alt="" />'
      + '<img class="brand-logo-dark" src="assets/kiwi-newlogo-inverse.svg" width="886" height="486" alt="" />'
      + '</span>';
  }

  function rail() {
    let b = '';
    for (let i = 1; i <= TOTAL; i++) {
      // Don't leave a dot for a step nobody will see. It reappears if « Retour »
      // walks back into the name step.
      if (i === 1 && namePrefilled && S.step !== 1) continue;
      const cls = i < S.step ? 'done' : (i === S.step ? 'on' : '');
      b += `<b class="${cls}"></b>`;
    }
    return `<div class="kob-rail" aria-hidden="true">${b}</div>`;
  }

  /* ── Shared bits ─────────────────────────────────────────────────────── */
  function unitFor(field) {
    const v = S[field];
    return field === 'venueCount'
      ? tr({ fr: v > 1 ? 'établissements' : 'établissement', en: v > 1 ? 'locations' : 'location', ar: 'محل' })
      : tr({ fr: v > 1 ? 'personnes' : 'personne', en: v > 1 ? 'people' : 'person', ar: 'أشخاص' });
  }
  function stepper(field, min, max) {
    return `
      <div class="kob-step" data-stepper="${field}" data-min="${min}" data-max="${max}">
        <button type="button" data-inc="-1" aria-label="moins">&minus;</button>
        <div class="kob-num" data-stepval>${S[field]}<small>${unitFor(field)}</small></div>
        <button type="button" data-inc="1" aria-label="plus">+</button>
      </div>`;
  }
  function footNav(o) {
    o = o || {};
    return `
      <button class="kob-back" data-go="back">&lsaquo; ${tr({ fr: 'Retour', en: 'Back', ar: 'رجوع' })}</button>
      ${o.skip ? `<button class="kob-skip" data-go="next" data-skip>${tr({ fr: 'Passer', en: 'Skip', ar: 'تخطّي' })}</button>` : ''}
      <button class="kob-btn primary" data-go="next">${esc(o.nextLabel || tr({ fr: 'Continuer', en: 'Continue', ar: 'متابعة' }))}</button>`;
  }

  /* ── Step renderers — each returns {body, foot} HTML ─────────────────── */
  function stepWelcome() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Bienvenue sur Kiwi', en: 'Welcome to Kiwi', ar: 'مرحباً بك في كيوي' })}</p>
          <h1 class="kob-h">${tr({ fr: 'On met tout en place <span class="k-sans">ensemble.</span>', en: "Let's set it all up <span class=\"k-sans\">together.</span>", ar: 'لنُهيّئ كل شيء <span class="k-sans">معاً.</span>' })}</h1>
          <p class="kob-sub">${tr({
            fr: "Quelques questions rapides, moins de 2 minutes, et votre espace est prêt, à votre nom, avec votre équipe. Rien n'est définitif : tout se modifie plus tard.",
            en: 'A few quick questions, under 2 minutes, and your space is ready, in your name, with your team. Nothing is final: everything can change later.',
            ar: 'بضعة أسئلة سريعة, أقل من دقيقتين, وتكون مساحتك جاهزة. لا شيء نهائي؛ كل شيء قابل للتعديل لاحقاً.' })}</p>
        </div>`,
      foot: `
        <button class="kob-btn primary" data-go="next">${tr({ fr: 'Commencer', en: 'Get started', ar: 'لنبدأ' })}</button>
        <div class="kob-explore" style="flex-basis:100%;">
          ${(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) ? '' : `<button class="kob-skip" data-explore>${tr({ fr: "Explorer la démo d'abord", en: 'Explore the demo first', ar: 'استكشاف العرض أولاً' })}</button><span class="kob-sep" aria-hidden="true">·</span>`}
          <a class="kob-skip" href="/auth/logout" data-signin>${tr({ fr: "J'ai déjà un compte", en: 'I already have an account', ar: 'لدي حساب بالفعل' })}</a>
        </div>`,
    };
  }

  function stepName() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Faisons connaissance', en: "Let's meet", ar: 'لنتعارف' })}</p>
          <h1 class="kob-h">${tr({ fr: 'Comment vous appelez-vous ?', en: 'What should we call you?', ar: 'ما اسمك؟' })}</h1>
          <p class="kob-sub">${tr({ fr: 'Juste votre prénom, pour vous accueillir par votre nom chaque matin.', en: 'Just your first name, so we can greet you by name every morning.', ar: 'اسمك الأول فقط, لنرحّب بك كل صباح.' })}</p>
          <input class="kob-field" data-f="ownerName" type="text" value="${esc(S.ownerName)}" maxlength="24" placeholder="${tr({ fr: 'Ex. Rachid', en: 'e.g. Rachid', ar: 'مثال: رشيد' })}" autocomplete="given-name"/>
        </div>`,
      foot: footNav({}),
    };
  }

  function typeCard(t, hidden) {
    return `<button class="kob-type${t.id === S.typeId ? ' sel' : ''}${hidden ? ' hide kob-xtra' : ''}" data-type="${t.id}">${t.icon}<span>${esc(tr(t.label))}</span></button>`;
  }
  function stepBusiness() {
    const prim = TYPES.filter((t) => t.primary);
    const more = TYPES.filter((t) => !t.primary);
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Votre affaire', en: 'Your business', ar: 'نشاطك' })}</p>
          <h1 class="kob-h">${tr({ fr: 'Parlez-nous de votre affaire.', en: 'Tell us about your business.', ar: 'حدّثنا عن نشاطك.' })}</h1>
          <label class="kob-lbl">${tr({ fr: "Nom de l'établissement", en: 'Business name', ar: 'اسم النشاط' })}</label>
          <input class="kob-field" data-f="bizName" type="text" value="${esc(S.bizName)}" maxlength="40" placeholder="${tr({ fr: 'Ex. Café des Oudayas', en: 'e.g. Oudayas Café', ar: 'مثال: مقهى الأوداية' })}"/>
          <label class="kob-lbl">${tr({ fr: "Type d'activité", en: 'Type of business', ar: 'نوع النشاط' })}</label>
          <div class="kob-types">
            ${prim.map((t) => typeCard(t)).join('')}
            ${more.map((t) => typeCard(t, true)).join('')}
          </div>
          <button class="kob-more" data-more>${tr({ fr: '+ Voir plus de types', en: '+ More types', ar: '+ المزيد من الأنواع' })} (${more.length})</button>
        </div>`,
      foot: footNav({}),
    };
  }

  function stepPlaces() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Vos points de vente', en: 'Your locations', ar: 'نقاط بيعك' })}</p>
          <h1 class="kob-h">${tr({ fr: "Combien d'établissements gérez-vous ?", en: 'How many locations do you run?', ar: 'كم عدد المحلات التي تديرها؟' })}</h1>
          <p class="kob-sub">${tr({ fr: "Un seul aujourd'hui ? Parfait. Kiwi grandit avec vous quand vous en ouvrez d'autres.", en: 'Just one today? Perfect. Kiwi grows with you as you open more.', ar: 'واحد اليوم؟ ممتاز. ينمو كيوي معك.' })}</p>
          ${stepper('venueCount', 1, 60)}
          <label class="kob-lbl">${tr({ fr: 'Ville principale', en: 'Main city', ar: 'المدينة الرئيسية' })} <span class="opt">· ${tr({ fr: 'optionnel', en: 'optional', ar: 'اختياري' })}</span></label>
          <input class="kob-field" data-f="city" type="text" value="${esc(S.city)}" maxlength="30" placeholder="${tr({ fr: 'Ex. Rabat', en: 'e.g. Rabat', ar: 'مثال: الرباط' })}"/>
        </div>`,
      foot: footNav({}),
    };
  }

  function stepTeam() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Votre équipe', en: 'Your team', ar: 'فريقك' })}</p>
          <h1 class="kob-h">${tr({ fr: 'Vous êtes combien à travailler ici ?', en: 'How many of you work here?', ar: 'كم عدد العاملين لديك؟' })}</h1>
          <p class="kob-sub">${tr({ fr: "Vous compris. On s'en sert pour préparer la paie, le planning et les accès, sans engagement.", en: 'You included. We use it to prepare payroll, scheduling and access, no commitment.', ar: 'أنت من ضمنهم. نستخدمه لتحضير الرواتب والجدولة والوصول.' })}</p>
          ${stepper('teamSize', 1, 200)}
        </div>`,
      foot: footNav({ skip: true }),
    };
  }

  function stepGoals() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Vos priorités', en: 'Your priorities', ar: 'أولوياتك' })}</p>
          <h1 class="kob-h">${tr({ fr: "Qu'est-ce qui compte le plus ?", en: 'What matters most to you?', ar: 'ما الأهم بالنسبة لك؟' })}</h1>
          <p class="kob-sub">${tr({ fr: "Choisissez ce qui vous parle, on met en avant les bons outils pour vous. Plusieurs choix possibles.", en: "Pick what speaks to you, we'll surface the right tools. Choose as many as you like.", ar: 'اختر ما يناسبك, سنُبرز الأدوات المناسبة. يمكن اختيار أكثر من واحد.' })}</p>
          <div class="kob-chips">
            ${GOALS.map((g) => `<button class="kob-chip${S.goals.includes(g.id) ? ' sel' : ''}" data-goal="${g.id}">${g.icon}<span>${esc(tr(g.label))}</span><svg class="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></button>`).join('')}
          </div>
          <label class="kob-lbl">${tr({ fr: "Objectif de chiffre d'affaires par jour", en: 'Daily revenue target', ar: 'هدف الإيرادات اليومية' })} <span class="opt">· ${tr({ fr: 'optionnel', en: 'optional', ar: 'اختياري' })}</span></label>
          <input class="kob-field" data-f="dailyGoal" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(S.dailyGoal)}" placeholder="${tr({ fr: 'Ex. 5000 MAD', en: 'e.g. 5000 MAD', ar: 'مثال: 5000 درهم' })}"/>
        </div>`,
      foot: footNav({ skip: true }),
    };
  }

  /* Role → label/permission metadata, reused for dynamically-added rows. */
  function roleMeta(role) {
    return role === 'owner' ? ACCESS[0] : (role === 'manager' ? ACCESS[1] : ACCESS[2]);
  }
  function accessRow(i) {
    const p = S.pins[i] || { role: 'staff', name: '', code: '' };
    const isOwner = i === 0 || p.role === 'owner';
    const a = roleMeta(isOwner ? 'owner' : p.role);
    const nameVal = p.name || (isOwner ? S.ownerName.trim() : '');
    const filled = /^\d{4}$/.test(p.code);
    const head = isOwner
      ? `<div>
            <div class="kob-acc-ttl">${esc(tr(a.title))}</div>
            <div class="kob-acc-perm">${esc(tr(a.perm))}</div>
         </div>
         <span class="kob-acc-tag req">${tr({ fr: 'Requis', en: 'Required', ar: 'إلزامي' })}</span>`
      : `<select class="kob-field kob-role" data-pin-role="${i}" aria-label="${tr({ fr: 'Rôle', en: 'Role', ar: 'الدور' })}">
            <option value="manager"${p.role === 'manager' ? ' selected' : ''}>${tr({ fr: 'Responsable / gérant', en: 'Manager', ar: 'المسؤول' })}</option>
            <option value="staff"${p.role !== 'manager' ? ' selected' : ''}>${tr({ fr: 'Équipe / caissier', en: 'Staff / cashier', ar: 'الفريق' })}</option>
         </select>
         <button type="button" class="kob-acc-rm" data-pin-remove="${i}" aria-label="${tr({ fr: 'Retirer', en: 'Remove', ar: 'حذف' })}">&times;</button>`;
    return `
      <div class="kob-acc${filled ? ' filled' : ''}" data-acc="${i}">
        <div class="kob-acc-hd">${head}</div>
        ${isOwner ? '' : `<div class="kob-acc-perm" style="margin:-4px 0 10px;">${esc(tr(a.perm))}</div>`}
        <div class="kob-acc-row">
          <input class="kob-field kob-name" type="text" data-pin-name="${i}" value="${esc(nameVal)}" maxlength="20" placeholder="${isOwner ? tr({ fr: 'Votre prénom', en: 'Your name', ar: 'اسمك' }) : tr({ fr: 'Prénom (ex. Salma)', en: 'Name (e.g. Salma)', ar: 'الاسم' })}"/>
          <input class="kob-field kob-code" data-pin-code="${i}" value="${esc(p.code)}" inputmode="numeric" maxlength="4" placeholder="&bull;&bull;&bull;&bull;" aria-label="Code"/>
        </div>
      </div>`;
  }
  function stepAccess() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: "Accès de l'équipe", en: 'Team access', ar: 'وصول الفريق' })}</p>
          <h1 class="kob-h">${tr({ fr: 'Les codes de votre équipe.', en: "Your team's access codes.", ar: 'رموز دخول فريقك.' })}</h1>
          <p class="kob-sub">${tr({ fr: "Chaque personne entre son code à 4 chiffres pour ouvrir Kiwi, et ne voit que ce qui la concerne. Le vôtre est le seul obligatoire.", en: 'Each person enters their 4-digit code to open Kiwi, and only sees what concerns them. Only yours is required.', ar: 'يُدخل كل شخص رمزه المكوّن من 4 أرقام, ويرى فقط ما يخصه. رمزك وحده إلزامي.' })}</p>
          <div class="kob-access">
            ${S.pins.map((p, i) => accessRow(i)).join('')}
          </div>
          <button type="button" class="kob-acc-add" data-pin-add>${tr({ fr: '+ Ajouter un membre', en: '+ Add a member', ar: '+ إضافة عضو' })}</button>
          <div class="kob-err" data-acc-err></div>
        </div>`,
      foot: footNav({ nextLabel: tr({ fr: 'Presque fini →', en: 'Almost done →', ar: 'اقتربنا →' }) }),
    };
  }

  function stepFinish() {
    const t = TYPES.find((x) => x.id === S.typeId) || TYPES[0];
    const codes = S.pins.filter((p) => /^\d{4}$/.test(p.code)).length;
    const goalNames = S.goals.map((id) => tr((GOALS.find((g) => g.id === id) || {}).label)).filter(Boolean);
    const row = (k, v) => `<div class="r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Dernière étape', en: 'Last step', ar: 'الخطوة الأخيرة' })}</p>
          <h1 class="kob-h">${S.ownerName ? esc(S.ownerName) + ', ' : ''}<span class="k-sans">${tr({ fr: 'tout est prêt.', en: "you're all set.", ar: 'كل شيء جاهز.' })}</span></h1>
          <p class="kob-sub">${tr({ fr: 'Vérifiez, puis créez votre espace. Vous pourrez tout ajuster ensuite dans les Réglages.', en: 'Have a look, then create your space. You can adjust anything later in Settings.', ar: 'راجع ثم أنشئ مساحتك. يمكنك تعديل كل شيء لاحقاً.' })}</p>
          <div class="kob-recap">
            ${row(tr({ fr: 'Établissement', en: 'Business', ar: 'النشاط' }), S.bizName || '—')}
            ${row(tr({ fr: 'Activité', en: 'Type', ar: 'النوع' }), tr(t.label))}
            ${row(tr({ fr: 'Points de vente', en: 'Locations', ar: 'نقاط البيع' }), String(S.venueCount) + (S.city ? ' · ' + S.city : ''))}
            ${row(tr({ fr: 'Équipe', en: 'Team', ar: 'الفريق' }), tr({ fr: String(S.teamSize) + ' personnes', en: String(S.teamSize) + ' people', ar: String(S.teamSize) + ' أشخاص' }))}
            ${goalNames.length ? row(tr({ fr: 'Priorités', en: 'Priorities', ar: 'الأولويات' }), goalNames.slice(0, 2).join(', ') + (goalNames.length > 2 ? ' +' + (goalNames.length - 2) : '')) : ''}
            ${row(tr({ fr: "Codes d'accès", en: 'Access codes', ar: 'رموز الدخول' }), tr({ fr: codes + ' actif' + (codes > 1 ? 's' : ''), en: codes + ' active', ar: codes + ' نشط' }))}
          </div>
        </div>`,
      foot: `
        <button class="kob-back" data-go="back">&lsaquo; ${tr({ fr: 'Retour', en: 'Back', ar: 'رجوع' })}</button>
        <button class="kob-btn primary" data-finish>${tr({ fr: 'Créer mon espace', en: 'Create my space', ar: 'إنشاء مساحتي' })}</button>`,
    };
  }

  const STEPS = [stepWelcome, stepName, stepBusiness, stepPlaces, stepTeam, stepGoals, stepAccess, stepFinish];

  /* ── Render current step ─────────────────────────────────────────────── */
  function render() {
    saveDraft();
    const def = STEPS[S.step]();
    const showRail = S.step >= 1 && S.step <= TOTAL;
    root.querySelector('.kob-card').innerHTML = `
      <div class="kob-top">
        <span class="kob-brand">${brandMark()}</span>
        ${showRail ? rail() : `<span class="kob-config-label">${tr({ fr: 'Configuration', en: 'Setup', ar: 'الإعداد' })}</span>`}
      </div>
      <div class="kob-body">${def.body}</div>
      <div class="kob-foot">${def.foot}</div>`;
    const first = root.querySelector('.kob-body input[type="text"], .kob-body input:not([type])');
    if (first) setTimeout(() => { try { first.focus(); } catch (_) {} }, 340);
  }

  /* ── Read inputs of the current step into state ──────────────────────── */
  function capture() {
    root.querySelectorAll('[data-f]').forEach((i) => { S[i.dataset.f] = i.value; });
    root.querySelectorAll('[data-pin-name]').forEach((i) => { const n = +i.dataset.pinName; if (S.pins[n]) S.pins[n].name = i.value.trim(); });
    root.querySelectorAll('[data-pin-code]').forEach((i) => { const n = +i.dataset.pinCode; if (S.pins[n]) S.pins[n].code = i.value.replace(/\D/g, '').slice(0, 4); });
    root.querySelectorAll('[data-pin-role]').forEach((i) => { const n = +i.dataset.pinRole; if (S.pins[n]) S.pins[n].role = i.value; });
    saveDraft();
  }

  function parsedDailyGoal() {
    const raw = String(S.dailyGoal == null ? '' : S.dailyGoal).trim();
    if (!raw) return 0;
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) return null;
    const amount = Number(raw.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000) return null;
    return Math.round(amount * 100) / 100;
  }

  /* ── Validate before advancing (returns error string or null) ────────── */
  function validate() {
    if ((S.step === 1 || S.step === 7) && !S.ownerName.trim()) return tr({ fr: 'Indiquez votre prénom.', en: 'Enter your first name.', ar: 'أدخل اسمك.' });
    if ((S.step === 2 || S.step === 7) && !S.bizName.trim()) return tr({ fr: 'Donnez un nom à votre établissement.', en: 'Give your business a name.', ar: 'أدخل اسم نشاطك.' });
    if (S.step === 5 && parsedDailyGoal() === null) return tr({ fr: 'Saisissez un objectif positif, avec au maximum deux décimales.', en: 'Enter a positive target with at most two decimal places.', ar: 'أدخل هدفاً موجباً بمنزلتين عشريتين كحد أقصى.' });
    if (S.step === 6 || S.step === 7) {
      const owner = S.pins[0];
      if (!/^\d{4}$/.test(owner.code)) return tr({ fr: 'Choisissez votre code à 4 chiffres (le vôtre est obligatoire).', en: 'Choose your 4-digit code (yours is required).', ar: 'اختر رمزك المكوّن من 4 أرقام.' });
      const seen = {};
      for (const p of S.pins) {
        if (!p.code) continue;
        if (!/^\d{4}$/.test(p.code)) return tr({ fr: 'Chaque code doit faire exactement 4 chiffres.', en: 'Each code must be exactly 4 digits.', ar: 'كل رمز يجب أن يكون 4 أرقام.' });
        if (RESERVED.includes(p.code)) return tr({ fr: 'Le code ' + p.code + ' est réservé à la démo, choisissez-en un autre.', en: 'Code ' + p.code + ' is reserved for the demo, pick another.', ar: 'الرمز ' + p.code + ' محجوز، اختر غيره.' });
        if (seen[p.code]) return tr({ fr: 'Deux personnes ont le même code, chaque code doit être unique.', en: 'Two people share a code, each must be unique.', ar: 'رمزان متطابقان، يجب أن يكون كل رمز فريداً.' });
        seen[p.code] = 1;
      }
    }
    return null;
  }

  /* ── Navigation ──────────────────────────────────────────────────────── */
  function go(dir) {
    capture();
    if (dir === 'next') {
      const err = validate();
      if (err) { flashErr(err); return; }
    }
    S.step += (dir === 'next' ? 1 : -1);
    if (S.step < 0) S.step = 0;
    // The name is the one question the account already answered. Skip it going
    // FORWARD only — « Retour » still lands on it, so the name stays editable
    // for anyone who signed up as "Sté Café Atlas SARL" and wants their own.
    if (dir === 'next' && S.step === 1 && namePrefilled) S.step = 2;
    if (S.step >= STEPS.length) { S.step = STEPS.length - 1; return; }
    render();
  }
  function flashErr(msg) {
    const box = root.querySelector('[data-acc-err]');
    if (box) box.textContent = msg;
    try { if (window.Kiwi && Kiwi.toast) Kiwi.toast(msg, { type: 'warn', force: true }); } catch (_) {}
  }

  /* ── Finish · persist + create venue + celebrate ─────────────────────── */
  function finish() {
    capture();
    const finishErr = validate();
    if (finishErr) { flashErr(finishErr); return; }
    const t = TYPES.find((x) => x.id === S.typeId) || TYPES[0];
    const validPins = S.pins.filter((p) => /^\d{4}$/.test(p.code)).map((p) => ({
      role: p.role, code: p.code,
      name: p.name || (p.role === 'owner' ? (S.ownerName || tr({ fr: 'Propriétaire', en: 'Owner', ar: 'المالك' })) : ''),
    }));
    LS.set('kiwiOwnerName', S.ownerName.trim());
    LS.set('kiwiBizName', S.bizName.trim());
    LS.set('kiwiBizType', S.typeId);
    LS.set('kiwiCity', S.city.trim());
    LS.set('kiwiVenueCount', String(S.venueCount));
    LS.set('kiwiTeamSize', String(S.teamSize));
    LS.set('kiwiGoals', JSON.stringify(S.goals));
    LS.set('kiwiPins', JSON.stringify(validPins));
    /* Mirror the client's PINs up to the server so the operator console can see
     * and manage them (God mode). Fire-and-forget + fail-safe — a static host or
     * offline session just keeps the local copy, nothing breaks. */
    try { if (window.KiwiConfig && window.KiwiConfig.syncPins) window.KiwiConfig.syncPins(validPins); } catch (_) {}
    /* Mirror the business type too, so the operator console shows this merchant's
     * real modules (boutique ≠ restaurant). Same fire-and-forget contract. */
    try { if (window.KiwiConfig && window.KiwiConfig.syncType) window.KiwiConfig.syncType(S.typeId); } catch (_) {}
    LS.set('kiwiRole', 'owner');
    LS.set('kiwiOnboarded', '1');
    LS.del('kiwiSkipOnboard');

    let vid = null;
    try {
      vid = window.KiwiVenue && KiwiVenue.createVenue && KiwiVenue.createVenue({
        type: t.base, subtype: t.id,
        name: S.bizName.trim() || tr({ fr: 'Mon activité', en: 'My business', ar: 'نشاطي' }),
        location: S.city.trim(),
        goal: parsedDailyGoal() || 0,
        staffCount: S.teamSize,
        profile: { goals: S.goals, venueCount: S.venueCount, owner: S.ownerName.trim() },
      });
      if (vid && KiwiVenue.setVenue) KiwiVenue.setVenue(vid);
    } catch (_) {
      if (typeof Kiwi !== 'undefined' && Kiwi.toast) {
        Kiwi.toast('Impossible d’enregistrer l’établissement', { type: 'warn', force: true });
      }
    }

    /* Seed the entered staff into the REAL per-venue roster (team.js) so they
     * persist and show on the Équipe page — not just the login-lock's kiwiPins. */
    try {
      const teamPeople = S.pins.map((p) => ({
        role: p.role,
        code: /^\d{4}$/.test(p.code) ? p.code : '',
        name: (p.name || '').trim() || (p.role === 'owner' ? (S.ownerName || '').trim() : ''),
      })).filter((p) => p.name);
      const venue = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData();
      if (venue && window.KiwiTeam && KiwiTeam.importMembers) KiwiTeam.importMembers(venue, teamPeople);
    } catch (_) {}

    try {
      window.__kiwiRole = 'owner';
      document.body.classList.remove('role-manager', 'role-staff');
      document.body.classList.add('role-owner');
    } catch (_) {}

    LS.del(DRAFT_KEY);
    celebrate(vid);
  }

  let autoEnter = null;
  function celebrate() {
    const name = S.ownerName.trim();
    root.querySelector('.kob-card').innerHTML = `
      <div class="kob-top"><span class="kob-brand">${brandMark()}</span></div>
      <div class="kob-body"><div class="kob-celebrate">
        <div class="kob-hero-mark"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7DF2B0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
        <h1 class="kob-h" style="text-align:center;">${name ? esc(name) + ', ' : ''}<span class="k-sans">${tr({ fr: 'votre espace est prêt.', en: 'your space is ready.', ar: 'مساحتك جاهزة.' })}</span></h1>
        <p class="kob-sub" style="margin:0 auto;text-align:center;">${tr({ fr: 'Enregistrez votre première vente et regardez votre tableau de bord prendre vie.', en: 'Record your first sale and watch your dashboard come alive.', ar: 'سجّل أول عملية بيع وشاهد لوحتك تنبض بالحياة.' })}</p>
      </div></div>
      <div class="kob-foot"><button class="kob-btn primary" data-enter>${tr({ fr: 'Entrer dans mon espace →', en: 'Enter my space →', ar: 'ادخل مساحتي ←' })}</button></div>`;
    autoEnter = setTimeout(enterApp, 2800);
  }

  /* ── Dismiss the wizard + reveal the dashboard underneath ────────────── */
  function enterApp() {
    if (autoEnter) { clearTimeout(autoEnter); autoEnter = null; }
    const name = S.ownerName.trim();
    close();
    try {
      if (window.__kiwiLock && window.__kiwiLock.reveal) window.__kiwiLock.reveal();
      else {
        const lock = document.querySelector('[data-kiwi-lock]'); if (lock) lock.remove();
        document.documentElement.style.overflow = '';
        const app = document.querySelector('.app'); if (app) app.classList.remove('kw-app-hidden');
        const bar = document.querySelector('.demo-bar'); if (bar) bar.classList.remove('kw-bar-hidden');
        document.body.classList.add('cards-enter');
      }
    } catch (_) {}
    try {
      if (window.Kiwi && Kiwi.toast) Kiwi.toast(tr({ fr: 'Bienvenue' + (name ? ' ' + name : ''), en: 'Welcome' + (name ? ' ' + name : ''), ar: 'مرحباً' + (name ? ' ' + name : '') }), {
        type: 'success', force: true,
        desc: tr({ fr: 'Votre espace est prêt, enregistrez votre première vente.', en: 'Your space is ready, record your first sale.', ar: 'مساحتك جاهزة، سجّل أول بيع.' }),
      });
    } catch (_) {}
    /* Brand-new business: surface the "Connectez votre caisse" panel so the owner
     * pairs their till immediately (once the entry choreography has settled). */
    try {
      setTimeout(function () {
        const pair = function () {
          try { if (window.KiwiCaisseLink && KiwiCaisseLink.promptNewMerchant) KiwiCaisseLink.promptNewMerchant(); } catch (_) {}
        };
        /* Avant l'appairage, pour les métiers qui en ont, les MODÈLES DE RAYONS :
           un magasin qui démarre a un catalogue vide, et le remplir article par
           article est son premier mur. Les deux fenêtres s'ENCHAÎNENT au lieu de
           s'empiler — d'où le rappel passé à `then`, appelé que le commerçant
           choisisse ses rayons ou passe son chemin. */
        let offered = false;
        try {
          offered = !!(window.KiwiStoreTemplates && KiwiStoreTemplates.offer
            && KiwiStoreTemplates.offer(S.typeId, { then: function () { setTimeout(pair, 500); } }));
        } catch (_) { offered = false; }
        if (!offered) pair();
      }, 1300);
    } catch (_) {}
  }

  /* ── Explore the demo instead (bail to the PIN lock) ─────────────────── */
  function exploreDemo() {
    LS.set('kiwiSkipOnboard', '1');
    LS.del(DRAFT_KEY);
    close();
    try { if (window.__kiwiLock && window.__kiwiLock.show) window.__kiwiLock.show(); } catch (_) {}
  }

  /* ── Overlay lifecycle ───────────────────────────────────────────────── */
  function build() {
    inject();
    root = document.createElement('div');
    root.className = 'kob-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Configuration Kiwi');
    const card = document.createElement('div'); card.className = 'kob-card';
    root.appendChild(card);
    document.body.appendChild(root);

    root.addEventListener('click', (e) => {
      const goBtn = e.target.closest('[data-go]');
      if (goBtn) { go(goBtn.dataset.go); return; }
      if (e.target.closest('[data-explore]')) { exploreDemo(); return; }
      const signin = e.target.closest('[data-signin]');
      if (signin) {
        // /auth/logout clears every Kiwi auth cookie, but it lands on `/` —
        // which serves the public landing page, not the account form. So clear
        // first, then go straight to the gate: one tap instead of three. The
        // href stays a real link, so this still works if the fetch fails.
        e.preventDefault();
        fetch('/auth/logout', { redirect: 'manual', credentials: 'same-origin' })
          .then(() => { location.href = '/dashboard'; })
          .catch(() => { location.href = signin.getAttribute('href'); });
        return;
      }
      if (e.target.closest('[data-finish]')) { finish(); return; }
      if (e.target.closest('[data-enter]')) { enterApp(); return; }
      if (e.target.closest('[data-more]')) {
        root.querySelectorAll('.kob-xtra').forEach((x) => x.classList.remove('hide'));
        const b = e.target.closest('[data-more]'); if (b) b.style.display = 'none';
        return;
      }
      if (e.target.closest('[data-pin-add]')) {
        capture(); S.pins.push({ role: 'staff', name: '', code: '' }); render(); return;
      }
      const rmBtn = e.target.closest('[data-pin-remove]');
      if (rmBtn) {
        capture(); const n = +rmBtn.dataset.pinRemove;
        if (n > 0 && S.pins.length > 1) S.pins.splice(n, 1);
        render(); return;
      }
      const tc = e.target.closest('[data-type]');
      if (tc) {
        S.typeId = tc.dataset.type;
        saveDraft();
        root.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('sel', x === tc));
        return;
      }
      const gc = e.target.closest('[data-goal]');
      if (gc) {
        const id = gc.dataset.goal;
        const at = S.goals.indexOf(id);
        if (at >= 0) S.goals.splice(at, 1); else S.goals.push(id);
        saveDraft();
        gc.classList.toggle('sel');
        return;
      }
      const inc = e.target.closest('[data-inc]');
      if (inc) {
        const wrap = inc.closest('[data-stepper]');
        const f = wrap.dataset.stepper, min = +wrap.dataset.min, max = +wrap.dataset.max;
        S[f] = Math.max(min, Math.min(max, (+S[f] || min) + (+inc.dataset.inc)));
        saveDraft();
        const numEl = wrap.querySelector('[data-stepval]');
        numEl.innerHTML = `${S[f]}<small>${unitFor(f)}</small>`;
        return;
      }
    });

    root.addEventListener('input', (e) => {
      const code = e.target.closest('[data-pin-code]');
      if (code) {
        code.value = code.value.replace(/\D/g, '').slice(0, 4);
        const row = code.closest('[data-acc]');
        if (row) row.classList.toggle('filled', /^\d{4}$/.test(code.value));
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.target && e.target.matches && e.target.matches('[data-pin-name],[data-pin-code]')) return;
        const primary = root.querySelector('[data-finish], [data-enter], .kob-foot [data-go="next"]');
        if (primary) { e.preventDefault(); primary.click(); }
      } else if (e.key === 'Escape' && S.step === 0) {
        exploreDemo();
      }
    });
  }

  function open(opts) {
    opts = opts || {};
    if (opened) return;
    opened = true;
    if (typeof opts.startStep === 'number') S.step = opts.startStep;
    if (!root) build();
    try { if (window.__kiwiLock && window.__kiwiLock.hide) window.__kiwiLock.hide(); } catch (_) {}
    document.documentElement.style.overflow = 'hidden';
    render();
    /* setTimeout (not rAF) so the fade-in also fires when the tab is
     * backgrounded — rAF is throttled/paused off-screen. */
    setTimeout(() => { if (root) root.classList.add('kob-in'); }, 20);
  }

  function close() {
    if (!root) return;
    opened = false;
    root.classList.add('kob-out');
    const dead = root;
    setTimeout(() => { if (dead && dead.parentNode) dead.remove(); if (root === dead) root = null; }, 480);
  }

  function isComplete() { return LS.get('kiwiOnboarded') === '1'; }
  function reset() {
    ['kiwiOnboarded', 'kiwiOwnerName', 'kiwiBizName', 'kiwiBizType', 'kiwiCity', 'kiwiVenueCount', 'kiwiTeamSize', 'kiwiGoals', 'kiwiPins', 'kiwiSkipOnboard', DRAFT_KEY].forEach(LS.del);
  }

  /* ── L'inscription a déjà répondu à deux de ces questions ──────────────
   * The signup form captures the owner's name and the business name
   * (functions/auth/signup.js writes both onto the account), /api/me hands
   * them back, and assets/identity.js publishes them on window.KiwiMe BEFORE
   * it settles the gate this wizard awaits. Yet step 1 still asked « Comment
   * vous appelez-vous ? » to a merchant who had typed their name one screen
   * earlier. So seed the state from the account, and skip the name step
   * entirely when it answers.
   *
   * Read KiwiMe, NOT localStorage: reset() runs first on the ?onboarding=1
   * signup hand-off and deletes kiwiOwnerName/kiwiBizName — the very keys
   * identity.js had just filled in. That deletion is why every prefill through
   * localStorage came back empty.
   *
   * Whatever the account left blank is still asked, normally. */
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function prefillFromAccount() {
    const me = window.KiwiMe || {};
    // Step 1 wants the first name only ("juste votre prénom") — signup takes
    // the full one, so cut it down rather than greeting « Rachid Benhima ».
    if (!S.ownerName.trim()) S.ownerName = firstName(me.name).slice(0, 24);
    if (!S.bizName.trim()) S.bizName = String(me.business || '').trim().slice(0, 40);
    namePrefilled = !!S.ownerName.trim();
  }

  /* ── Auto-launch decision ────────────────────────────────────────────── */
  function hasCustomVenue() {
    try {
      if (!(window.KiwiVenue && KiwiVenue.isCustom && KiwiVenue.isCustom())) return false;
      // The synthetic 'own' placeholder venue (venues.js ensureOwnEmptyVenue) makes
      // isCustom() true for EVERY authenticated merchant from the first paint — it is
      // created precisely so demo surfaces zero out, and its own comment notes "the
      // onboarding CTA can still show". Reusing isCustom() as "already has a venue"
      // wrongly denies a BRAND-NEW merchant the setup wizard, stranding them on the
      // PIN lock with no valid code (fresh signup → dashboard gate, no onboarding).
      // Ignore 'own' here; only a GENUINE user-created venue suppresses auto-launch.
      // ('scoped' = operator God-mode → keep suppressing so the wizard never opens in
      // the operator's face.)
      var v = (KiwiVenue.getVenue && KiwiVenue.getVenue()) || '';
      return v !== 'own';
    } catch (_) { return false; }
  }
  /* The URL's one-shot instructions. Consumed BEFORE we await anything, because
   * ?onboarding is a one-shot signup param and awaiting first would let a second
   * caller see it again. Returns 'force' | 'skip' | null. */
  function forcedByQuery() {
    const q = new URLSearchParams(location.search);
    if (q.has('demo')) return 'skip';
    if (q.has('onboarding')) {
      // It used to be STICKY: every reload with ?onboarding=1 still in the URL
      // re-ran reset() + relaunched the wizard, wiping a just-completed
      // kiwiOnboarded (P3). Strip it so a refresh can't re-trigger, and never
      // reset an account that already finished onboarding.
      try { history.replaceState({}, '', location.pathname + location.hash); } catch (_) {}
      if (isComplete()) return 'skip';
      reset();
      return 'force';
    }
    return null;
  }

  /* Everything this BROWSER can work out on its own. It is the whole answer for a
   * session with no account behind it — the local demo, the shared staff
   * passcode, a static mirror with no API. For a signed-in merchant it is only a
   * cache, and a treacherous one: `kiwiOnboarded` is per-browser, so a new
   * device, another browser, a private window or cleared site data all read an
   * established merchant as a brand-new signup; and identity.js purges the flag
   * outright (it is in TENANT_KEYS) whenever a different account last used this
   * browser, so even logging back in on your own machine could lose it. */
  function localSaysNew() {
    if (isComplete()) return false;
    if (LS.get('kiwiSkipOnboard') === '1') return false;
    if (hasCustomVenue()) return false;
    return true;
  }
  function shouldAutoLaunch() {
    const forced = forcedByQuery();
    return forced ? forced === 'force' : localSaysNew();
  }

  /* Cache the server's verdict. `kiwiOnboarded` stops being the source of truth
   * and becomes what it should always have been — a local echo of it, so the next
   * load is instant and an offline one still knows an établissement exists. */
  function markComplete() { if (!isComplete()) LS.set('kiwiOnboarded', '1'); }
  function hostedApp() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.hosted); } catch (_) { return false; }
  }

  /* ── Should the wizard open by itself? Ask the server first. ──────────────
   *
   * "Create your business" is not a question you may ask an account that already
   * has one, and only the server knows whether it does — the establishment lives
   * in D1, the flag we used to read lives in this browser. So wait for the
   * identity gate (assets/identity.js → window.KiwiIdentity.ready) instead of
   * racing it, and let its answer decide. It resolves from every branch of
   * /api/me, failures included, so this always settles. */
  function decide() {
    const forced = forcedByQuery();
    let gate = null;
    try { gate = window.KiwiIdentity && window.KiwiIdentity.ready; } catch (_) {}
    // No identity script on this page at all → nothing to wait for.
    if (!gate || typeof gate.then !== 'function') {
      return Promise.resolve(forced ? forced === 'force' : localSaysNew());
    }
    return gate.then(function (st) {
      st = st || {};
      // An operator's God-mode view of a client, or a page already reloading
      // after an account switch. Neither is somebody doing their own setup.
      if (st.operator || st.reloading) return false;

      if (st.authenticated) {
        // THE FIX. The account owns at least one établissement, so it is not new
        // — whatever this browser does or doesn't remember about it.
        if (st.onboarded) { markComplete(); return false; }
        // The server looked and found nothing anywhere: no store, no staff code,
        // no sale. This really is a merchant who has yet to set up.
        return forced === 'force' ? true : localSaysNew();
      }

      // There IS a backend and it could not tell us who this is (a D1 blip, a
      // 503). Not knowing is never a reason to invent a business on a hosted
      // app — the merchant reaches setup with the signup link or PIN 0000, and
      // meanwhile nothing gets duplicated. The local demo is untouched.
      if (st.unreachable && hostedApp()) return false;

      // No account behind this session: the local demo, the staff passcode, a
      // static mirror. Local state is all there is, exactly as before.
      return forced ? forced === 'force' : localSaysNew();
    }).catch(function () {
      return forced ? forced === 'force' : localSaysNew();
    });
  }

  function initHandler() {
    try {
      if (window.Kiwi && Kiwi.handlers) {
        Kiwi.handlers['onboard'] = () => { reset(); prefillFromAccount(); S.step = 0; open(); };
      }
    } catch (_) {}
  }

  window.KiwiOnboarding = {
    open, close, isComplete, reset, shouldAutoLaunch,
    get profile() { return { ownerName: LS.get('kiwiOwnerName'), bizName: LS.get('kiwiBizName'), type: LS.get('kiwiBizType') }; },
  };

  function boot() {
    if (!document.querySelector('[data-kiwi-lock]')) { initHandler(); return; }
    initHandler();
    // decide() awaits the identity gate, so KiwiVenue (loaded earlier in the
    // document) is always present by the time we open — the old 60 ms guess is
    // gone along with the race it was papering over.
    // decide() has awaited the identity gate, so window.KiwiMe is already there
    // — prefill before the first render, never after.
    decide().then(function (yes) { if (yes) { prefillFromAccount(); S.step = 0; open(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
