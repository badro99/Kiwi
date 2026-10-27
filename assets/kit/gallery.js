/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/gallery.js · the kit gallery (kit.html), stage 2's one
 * adopter (spec §21.1).
 *
 * Every component, in its states, on fixture data that reads as what it is:
 * no merchant, no network, no storage. The theme and language switches set
 * what a real page would (data-theme, lang/dir, KiwiStrings, KiwiFormat) and
 * announce kiwi:langchange. Every kit action the gallery can emit has one
 * adapter here, which writes the action's name in the event log on the page,
 * so the tests can drive a control and read what it reported.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var doc = root.document;
  var K = root.KiwiKit, A = root.KiwiActions;
  if (!K || !A) return;
  var $ = function (s) { return doc.querySelector(s); };

  /* ── the event log ───────────────────────────────────────────────────── */
  var log = [];
  root.__kitLog = log;
  function note(d) {
    log.push(d.action + (d.id != null ? ' · ' + d.id : ''));
    var el = $('#log');
    if (!el) return;
    var li = doc.createElement('li');
    li.textContent = log[log.length - 1];
    el.insertBefore(li, el.firstChild);
    while (el.children.length > 12) el.removeChild(el.lastChild);
  }
  var NAMES = [
    'k.button.press', 'k.switch.toggle', 'k.stepper.step', 'k.stepper.edit', 'k.chips.select', 'k.chips.open',
    'k.field.clear', 'k.list.select', 'k.list.toggle', 'k.list.button', 'k.list.action', 'k.list.overflow', 'k.list.retry',
    'k.banner.action', 'k.banner.dismiss', 'k.empty.action', 'k.page-header.back', 'k.page-header.action',
    'k.segmented.select', 'k.tabbar.select', 'k.rail.select', 'k.rail.sync', 'k.rail.cashier', 'k.sidebar.select',
    'k.date-button.open', 'k.range-picker.preset', 'k.range-picker.apply', 'k.range-picker.pick',
    'k.sheet.open', 'k.sheet.close', 'k.sheet.dismiss-request', 'k.popover.close', 'k.toast.action',
    'k.pin-pad.face', 'k.pin-pad.action', 'k.pin-pad.extra', 'k.pin-pad.done',
    'k.kpi-grid.open', 'k.kpi-grid.retry', 'k.kpi-grid.add-costs', 'k.chart.show-data', 'k.compare.open', 'k.compare.select',
    'k.keypad.key', 'k.menu-grid.add', 'k.menu-grid.options',
    'k.bill.line-select', 'k.bill.step', 'k.bill.remove', 'k.bill.void', 'k.bill.edit-options', 'k.bill.print', 'k.bill.overflow',
    'k.bill.split', 'k.bill.discount', 'k.bill.send', 'k.bill.pay',
    'k.options.add', 'k.pay.method', 'k.pay.tip', 'k.pay.tip-open', 'k.pay.quick', 'k.pay.confirm', 'k.pay.back', 'k.pay.client',
    'k.cash-count.close', 'k.cash-count.open', 'k.cash-count.enter-total', 'k.split.pay-share', 'k.discount.apply',
    'k.bill-bar.open', 'k.code-display.replace', 'k.code-display.retry', 'k.code-display.pair',
    'k.lane.action', 'k.lane.retry', 'k.lane.newer'
  ];
  NAMES.forEach(function (n) { A.on(n, note); });

  /* ── theme and language ──────────────────────────────────────────────── */
  function setLang(l) {
    doc.documentElement.lang = l;
    doc.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    if (root.KiwiStrings) root.KiwiStrings.setLocale(l);
    if (root.KiwiFormat) root.KiwiFormat.setLang(l);
    root.dispatchEvent(new CustomEvent('kiwi:langchange', { detail: { lang: l } }));
  }
  function setTheme(v) { doc.documentElement.setAttribute('data-theme', v); }
  A.off('k.segmented.select');
  A.on('k.segmented.select', function (d, e) {
    var host = e.target;
    var v = d.value && d.value.value;
    if (host && host.id === 'g-lang') setLang(v);
    else if (host && host.id === 'g-theme') setTheme(v);
    note(d);
  });

  /* ── fixtures (the worked example of §18.0, rounded for the gallery) ─── */
  function money(n) { return K.money(n, 2); }
  /* Monday 5 October 2026, the fixture's last Monday, named in the page's language. */
  function monday() { var f = K.fmt(); return (f && f.weekday('2026-10-05')) || 'Monday'; }
  /* The currency word alone, in the page's language (MAD, درهم). */
  function mad() { var f = K.fmt(); return f ? f.unit('0').slice(2) : 'MAD'; }
  var t = K.t;
  function fill() {
    var seg = function (id, opts, v) { var el = $(id); if (el) { el.options = opts; if (v) el.setAttribute('value', v); } };
    seg('#g-lang', [{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }, { value: 'ar', label: 'العربية' }], doc.documentElement.lang || 'en');
    seg('#g-theme', [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], doc.documentElement.getAttribute('data-theme') || 'light');
    seg('#seg-range', [{ value: 'today', label: t('range.today') }, { value: 'yesterday', label: t('range.yesterday') }, { value: 'd7', label: t('range.d7') }, { value: 'd30', label: t('range.d30') }], 'today');
    seg('#seg-cats', ['Starters', 'Tajines', 'Couscous', 'Pastillas', 'Drinks', 'Desserts', 'Sides'].map(function (c) { return { value: c, label: c }; }), 'Starters');
    seg('#seg-kds', [{ value: 'all', label: t('kds.all'), count: 9 }, { value: 'hot', label: t('kds.station.hot'), count: 7 }, { value: 'cold', label: t('kds.station.cold'), count: 2 }, { value: 'pastry', label: t('kds.station.pastry'), count: 2 }, { value: 'drinks', label: t('kds.station.drinks'), count: 4 }], 'all');

    var chips = $('#chips-single'); if (chips) chips.options = [{ value: 'all', label: t('orders.all') }, { value: 'card', label: t('orders.card') }, { value: 'cash', label: t('orders.cash') }, { value: 'refunds', label: t('orders.refunds') }];
    var multi = $('#chips-multi'); if (multi) multi.options = [{ value: 'vip', label: t('customers.vip') }, { value: 'new', label: t('customers.status.new') }, { value: 'inactive', label: t('customers.status.inactive') }];

    var list = $('#list');
    if (list) list.rows = [
      { id: 'r1', icon: 'payments', title: 'Table 4', subtitle: '17:28 · Karim', value: money(230), trailing: 'chevron' },
      { id: 'r2', avatar: 'SB', title: 'Salma Bennani', subtitle: t('customers.status.regular'), trailing: 'chevron', actions: [{ id: 'call', label: 'Call', icon: 'call_split', tone: 'grab' }] },
      { id: 'r3', icon: 'notifications', title: t('settings.morning'), subtitle: t('settings.morning_sub'), trailing: 'switch', checked: true },
      { id: 'r4', title: t('compare.yesterday_same'), radio: true, selected: true, value: money(20301) },
      { id: 'r5', title: t('compare.none'), radio: true },
      { id: 'r6', title: t('state.load_failed'), error: true }
    ];
    var hdr = $('#hdr'); if (hdr) hdr.actions = [{ id: 'search', label: t('customers.search'), icon: 'search' }];

    var nav = [{ id: 'home', label: t('nav.home'), icon: 'dashboard' }, { id: 'orders', label: t('nav.orders'), icon: 'receipt_long', badge: 3 }, { id: 'report', label: t('nav.report'), icon: 'bar_chart' }, { id: 'customers', label: t('nav.customers'), icon: 'group' }, { id: 'more', label: t('nav.more'), icon: 'more_horiz' }];
    var tb = $('#tabbar'); if (tb) tb.items = nav;
    var rail = $('#rail'); if (rail) { rail.items = nav.slice(0, 4); rail.footer = { sync: { icon: 'wifi_off', label: t('sync.all_sent') }, cashier: 'Karim Alaoui' }; }
    var sb = $('#sidebar'); if (sb) sb.sections = [{ label: '', items: nav }];

    var fig = $('#fig'); if (fig && !fig.figure) fig.figure = { value: 19174, precision: 2, kind: 'money' };
    var kpi = $('#kpi');
    if (kpi) kpi.tiles = [
      { key: 'orders', label: t('home.orders'), value: '86', delta: 4, deltaKind: 'num' },
      { key: 'avg_ticket', label: t('home.avg_basket'), value: K.fmt() ? K.fmt().num(222.95, 2) : '222.95', unit: mad(), delta: -13, deltaKind: 'money' },
      { key: 'card_share', label: t('home.card_share'), value: '82', unit: '%', delta: 1, deltaKind: 'pts' },
      { key: 'refunds', label: t('orders.refunds'), value: K.fmt() ? K.fmt().num(165, 2) : '165.00', unit: mad(), delta: 45, deltaKind: 'money' },
      { key: 'margin', label: t('kpi.margin'), state: 'na' },
      { key: 'returning', label: t('home.returning'), state: 'stale', value: '31', unit: '%', updated: '17:20' },
      { key: 'tips', label: 'Tips', state: 'loading' },
      { key: 'cash_revenue', label: t('orders.cash'), state: 'error' }
    ];
    var chart = $('#chart');
    if (chart) {
      var today = [], base = [], v = 0, b = 0;
      var shape = [0, 0, 420, 1200, 2600, 3410, 3200, 1400, 600, 500, 900, 1800, 2400, 1144];
      var bshape = [0, 0, 380, 1300, 2900, 3600, 3300, 1500, 700, 600, 1100, 2200, 2900, 3100, 2400, 1700, 900, 500, 300, 200, 100, 0, 0, 0, 0];
      shape.forEach(function (x, i) { v += x; today.push({ h: i, v: v }); });
      today[today.length - 1].h = 12.65;
      bshape.forEach(function (x, i) { b += x; base.push({ h: i, v: b }); });
      chart.series = { today: today, baseline: base, cutoff: 5, nowH: 12.65, baselineKey: 'yesterday', baselineTime: '17:39', delta: -1127 };
    }
    var cmp = $('#compare');
    if (cmp) cmp.options = [{ value: 'yesterday', label: t('compare.yesterday_same'), figure: money(20301) }, { value: 'weekday', label: t('compare.weekday_same', { weekday: monday() }), figure: money(18760) }, { value: 'none', label: t('compare.none') }];
    if (cmp) cmp.setAttribute('baseline', t('compare.yesterday_at', { time: '17:39' }));

    var menu = $('#menu');
    if (menu) {
      var names = ['Harira', 'Zaalouk', 'Briouates', 'Tajine agneau pruneaux', 'Tajine poulet citron', 'Couscous royal', 'Pastilla poulet', 'Thé à la menthe', 'Jus d\'orange', 'Cornes de gazelle'];
      var secs = ['Starters', 'Tajines', 'Couscous', 'Pastillas', 'Drinks', 'Desserts'].map(function (c, si) {
        var items = [];
        for (var i = 0; i < (si === 0 ? 8 : 6); i++) items.push({ id: c + i, name: names[(si * 3 + i) % names.length], price: 25 + ((si * 7 + i * 11) % 9) * 10, options: i % 3 === 1, soldOut: si === 1 && i === 4, qty: si === 0 && i === 0 ? 2 : 0 });
        return { id: c.toLowerCase(), title: c, items: items };
      });
      menu.sections = secs;
    }
    var bill = $('#bill');
    if (bill) bill.bill = {
      title: t('floor.table', { n: 4 }), meta: t('bill.meta', { n: 3, time: '17:02', staff: 'Karim' }),
      lines: [
        { id: 'l1', qty: 2, name: 'Harira', price: 60 },
        { id: 'l2', qty: 1, name: 'Tajine agneau pruneaux', mods: ['Sans amandes'], price: 120 },
        { id: 'l3', qty: 1, name: 'Zaalouk', price: 50, sent: true, sentAt: '17:28', sentQty: 1 }
      ],
      discount: { label: t('discount.line', { reason: t('discount.reason.loyal') }), amount: 0 }, total: 230
    };
    var opt = $('#options');
    if (opt) opt.item = { name: 'Tajine poulet citron', price: 110, groups: [
      { id: 'side', label: 'Side', required: true, max: 1, options: [{ id: 'bread', label: 'Bread' }, { id: 'rice', label: 'Rice', price: 10 }, { id: 'fries', label: 'Fries', soldOut: true }] },
      { id: 'extra', label: 'Extras', required: false, max: 2, options: [{ id: 'olives', label: 'Olives', price: 5 }, { id: 'egg', label: 'Egg', price: 8 }] }] };
    var pay = $('#pay'); if (pay && !pay.__seeded) { pay.__seeded = true; pay.pay =  { bill: t('floor.table', { n: 4 }), due: 230, method: 'cash', tipPct: 0 }; }
    var count = $('#count'); if (count) count.count = { opening: 500, cashSales: 8240, refundsCash: 120, cashTips: 60, cashIn: 720, cashOut: 600 };
    var count2 = $('#count-open'); if (count2) count2.count = { lastFloat: 500 };
    var split = $('#split'); if (split) { split.bill = { total: 230, lines: [{ id: 'a', name: 'Harira', amount: 60 }, { id: 'b', name: 'Tajine agneau pruneaux', amount: 120 }, { id: 'c', name: 'Zaalouk', amount: 50 }] }; split.paidShares = []; }
    var disc = $('#discount'); if (disc) { disc.bill = { total: 230 }; disc.policy = { configured: false }; }
    var lane = function (id, list) { var el = $(id); if (el) el.tickets = list; };
    var item = function (q, n, m) { return { qty: q, name: n, mods: m || [] }; };
    lane('#lane-new', [
      { id: '48', number: 48, minutes: 2, source: { kind: 'delivery', label: 'Glovo 3416' }, items: [item(1, 'Couscous royal'), item(2, 'Thé à la menthe')] },
      { id: '49', number: 49, minutes: 1, source: { label: 'Table 12' }, items: [item(1, 'Harira'), item(1, 'Briouates')] },
      { id: '50', number: 50, minutes: 0, source: { label: t('orders.takeaway', { n: 50 }) }, items: [item(1, 'Pastilla poulet')] }
    ]);
    lane('#lane-prep', [
      { id: '42', number: 42, minutes: 18, source: { label: 'Table 22' }, items: [item(1, 'Tajine agneau pruneaux'), item(1, 'Zaalouk'), item(2, 'Harira')], note: 'Nut allergy: no almonds' },
      { id: '43', number: 43, minutes: 12, source: { kind: 'delivery', label: 'Glovo 3412' }, items: [item(1, 'Couscous royal', ['Sans raisins']), { qty: 1, name: 'Tajine poulet citron', voided: true }] },
      { id: '44', number: 44, minutes: 11, source: { label: 'Table 4' }, items: [item(1, 'Harira')], error: true },
      { id: '45', number: 45, minutes: 6, source: { label: 'Table 12' }, items: [item(1, 'Pastilla poulet'), item(1, 'Thé à la menthe')], recalled: true }
    ]);
    lane('#lane-ready', [{ id: '40', number: 40, minutes: 1, source: { label: 'Table 2' }, items: [] }, { id: '41', number: 41, minutes: 0, source: { label: t('orders.takeaway', { n: 41 }) }, items: [] }]);
  }

  /* ── the gallery's own buttons (light DOM, plain) ─────────────────────── */
  doc.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-g]');
    if (!b) return;
    var w = b.getAttribute('data-g');
    if (w === 'sheet') $('#sheet').openFrom(K.gid('g'));
    else if (w === 'confirm') $('#confirm').openFrom(K.gid('g'));
    else if (w === 'popover') { var p = $('#popover'); p.anchor = b; p.setAttribute('open', ''); }
    else if (w === 'toast') root.KiwiToast.show({ message: t('bill.removed_toast', { item: 'Harira' }), action: { id: 'undo', label: t('action.undo') } });
    else if (w === 'toast-info') root.KiwiToast.show({ message: t('sync.all_sent') });
    else if (w === 'pin-wrong') $('#pin').answer({ message: t('pin.wrong'), dots: 'danger', shake: true, clear: true, haptic: 'Failed' });
    else if (w === 'pin-offline') $('#pin').answer({ message: t('pin.offline'), keys: 'disabled', action: { id: 'retry', label: t('action.try_again') } });
    else if (w === 'pin-gate') $('#pin').gate(t('pin.till.needs_connection'));
    else if (w === 'pin-ungate') $('#pin').ungate(t('pin.connection_back'));
    else if (w === 'pin-ok') $('#pin').answer({ name: t('pin.hello', { name: 'Karim' }), dots: 'accent', message: '' });
    else if (w === 'pin-reset') $('#pin').reset();
    else if (w === 'code-loading') $('#code-att').setAttribute('state', 'loading');
    else if (w === 'code-new') { var c = $('#code-att'); c.setAttribute('state', 'shown'); c.setAttribute('code', String(100000 + Math.floor(Math.random() * 899999))); }
  });

  /* The demo pad answers by itself: any code is refused, except while the
     gallery's buttons say otherwise. No code is compared or kept here. */
  function wirePad() {
    var pad = $('#pin');
    if (!pad) return;
    pad.onsubmit = function () {
      setTimeout(function () { pad.answer({ message: t('pin.wrong'), dots: 'danger', shake: true, clear: true, haptic: 'Failed' }); }, 400);
    };
  }

  function start() {
    var lang = (doc.documentElement.lang || 'en').slice(0, 2);
    if (root.KiwiStrings) root.KiwiStrings.setLocale(lang);
    if (root.KiwiFormat) root.KiwiFormat.setLang(lang);
    fill();
    wirePad();
    /* A host changes the language or the theme the way a page does (lang, dir,
       data-theme, kiwi:langchange), not only through the gallery's own
       controls: the fixtures follow the language, the two controls follow both. */
    root.addEventListener('kiwi:langchange', fill);
    if (root.MutationObserver) new MutationObserver(function () {
      var l = $('#g-lang'), th = $('#g-theme');
      if (l) l.setAttribute('value', (doc.documentElement.lang || 'en').slice(0, 2));
      if (th) th.setAttribute('value', doc.documentElement.getAttribute('data-theme') || 'light');
    }).observe(doc.documentElement, { attributes: true, attributeFilter: ['lang', 'data-theme'] });
    var sh = $('#sheet-list'); if (sh) sh.rows = [{ id: 'a', title: t('compare.yesterday_same'), radio: true, selected: true }, { id: 'b', title: t('compare.weekday_same', { weekday: monday() }), radio: true }];
    doc.body.setAttribute('data-ready', '');
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
