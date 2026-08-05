/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · pages-pro.js — sidebar handler upgrade pass
 *
 * Concatenation of 9 sub-agent outputs covering:
 *   Section 1: nav-accueil / nav-transactions / nav-terminaux / nav-reglements
 *              nav-conformite / nav-equipe / nav-payroll / nav-reservations
 *   Section 2 restaurant: nav-tables / nav-menu / nav-kds / nav-stock
 *   Section 2 boutique:   nav-inventory / nav-categories / nav-promos / nav-returns
 *   Section 2 spa:        nav-appointments / nav-services
 *                         nav-practitioners / nav-clients
 *
 * Loads after pages.js — overrides original handlers + adds 8 new ones.
 * Each agent's section is wrapped in its own IIFE to isolate scopes.
 * ─────────────────────────────────────────────────────────────────────────── */

/* ═══ Section 1A · accueil / transactions / terminaux / reglements ═══ */
(function() {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · sidebar pages — investor-demo polish
 * 4 handlers: nav-accueil, nav-transactions, nav-terminaux, nav-reglements
 * Drop-in replacement for assets/pages.js — assumes (toast, drawer, handlers)
 * are in scope from the surrounding IIFE.
 * ─────────────────────────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════════
 * 1 · ACCUEIL · return to the main dashboard view
 *     Closes any open drawer/modal and scrolls back to top. No drawer.
 * ─────────────────────────────────────────────────────────────────────────── */
const NAV_ACCUEIL_STR = {
    fr: 'Accueil · tableau de bord',
    en: 'Home · Dashboard',
    ar: 'الرئيسية · لوحة التحكم'
};
handlers['nav-accueil'] = () => {
  // Dismiss any open drawer / modal so the dashboard underneath is fully visible.
  document.querySelectorAll('.kiwi-drawer-backdrop, .kiwi-backdrop').forEach(el => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 280);
  });
  // Bypass-clear the scroll-lock counter since we just removed backdrops by hand
  // (instead of going through each drawer's close()).
  window.__kiwiScrollLocks = 0;
  document.documentElement.classList.remove('kiwi-locked');
  // Pin the sidebar selector on Accueil — full-page handlers wrap this and
  // also call their own showDashboard() teardown, so by the time those run
  // the canonical activePage is already 'accueil'.
  window.Kiwi?.setActivePage?.('accueil');
  // Glide back to top of the main view.
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast(NAV_ACCUEIL_STR[trLang()] || NAV_ACCUEIL_STR.fr, { type: 'info', duration: 1200 });
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 2 · COMMANDES · live-synced order log, deterministic across opens
 *
 * Row count + cumulative volume are pulled from KiwiDemoClock so the drawer
 * always matches the dashboard's Commandes KPI tile (which is also driven
 * by the same simulator). The drawer subscribes to clock ticks and re-renders
 * as new orders come in.
 *
 * Filters (Toutes / Cartes / Mobile / Espèces / Remboursements), the date
 * range selector (Aujourd'hui / Hier / 7 j / 30 j), the tabs (Toutes /
 * Réconciliation / Anti-fraude) and the row-click detail are all wired.
 * ─────────────────────────────────────────────────────────────────────────── */
handlers['nav-transactions'] = () => {
  const TX_STR = {
    fr: {
        title: 'Commandes',
        heroLive: "VOLUME AUJOURD'HUI · LIVE",
        heroVolume: 'VOLUME · ',
        order: 'commande',
        orders: 'commandes',
        avgBasket: 'panier moyen',
        liveSync: 'sync horloge démo · refresh 3 s',
        consolidated: 'données consolidées',
        all: 'Toutes',
        cards: 'Cartes',
        mobile: 'Mobile',
        cash: 'Espèces',
        refunds: 'Remboursements',
        reconciliation: 'Réconciliation',
        fraud: 'Anti-fraude',
        filterActive: 'Filtre actif :',
        ordersDisplayed: 'commandes affichées',
        orderDisplayed: 'commande affichée',
        on: 'sur',
        clear: 'Effacer',
        noOrders: 'Aucune commande pour ce filtre.',
        olderOrdersHidden: 'commandes plus anciennes masquées',
        olderOrderHidden: 'commande plus ancienne masquée',
        showAll: 'Tout afficher',
        settlementOf: 'Règlement du',
        reconciled: 'Rapproché',
        grossVolume: 'Volume brut',
        visaMcInterchange: 'Interchange Visa/MC',
        kiwiNetworkFees: 'Frais réseau Kiwi',
        vatOnFees: 'TVA sur frais',
        netPaidOut: 'Net versé',
        savingsVsCmi: 'Économie vs CMI :',
        today: 'ce jour',
        vs: 'vs',
        openAlerts: 'alertes ouvertes',
        model: 'Modèle',
        slidingWindow: 'fenêtre glissante',
        examine: 'Examiner',
        markLegitimate: 'Marquer légitime',
        blockCard: 'Bloquer la carte',
        paid: 'Réglé',
        pending: 'Attente',
        refunded: 'Remboursé',
        hour: 'HEURE',
        method: 'MÉTHODE',
        client: 'CLIENT',
        amount: 'MONTANT',
        tip: 'POURBOIRE',
        status: 'STATUT',
    },
    en: {
        title: 'Orders',
        heroLive: "TODAY'S VOLUME · LIVE",
        heroVolume: 'VOLUME · ',
        order: 'order',
        orders: 'orders',
        avgBasket: 'avg basket',
        liveSync: 'demo clock sync · refresh 3s',
        consolidated: 'consolidated data',
        all: 'All',
        cards: 'Cards',
        mobile: 'Mobile',
        cash: 'Cash',
        refunds: 'Refunds',
        reconciliation: 'Reconciliation',
        fraud: 'Anti-fraud',
        filterActive: 'Active filter:',
        ordersDisplayed: 'orders displayed',
        orderDisplayed: 'order displayed',
        on: 'of',
        clear: 'Clear',
        noOrders: 'No orders for this filter.',
        olderOrdersHidden: 'older orders hidden',
        olderOrderHidden: 'older order hidden',
        showAll: 'Show all',
        settlementOf: 'Settlement of',
        reconciled: 'Reconciled',
        grossVolume: 'Gross volume',
        visaMcInterchange: 'Visa/MC Interchange',
        kiwiNetworkFees: 'Kiwi network fees',
        vatOnFees: 'VAT on fees',
        netPaidOut: 'Net paid out',
        savingsVsCmi: 'Savings vs CMI:',
        today: 'today',
        vs: 'vs',
        openAlerts: 'open alerts',
        model: 'Model',
        slidingWindow: 'sliding window',
        examine: 'Examine',
        markLegitimate: 'Mark legitimate',
        blockCard: 'Block card',
        paid: 'Paid',
        pending: 'Pending',
        refunded: 'Refunded',
        hour: 'TIME',
        method: 'METHOD',
        client: 'CUSTOMER',
        amount: 'AMOUNT',
        tip: 'TIP',
        status: 'STATUS',
    },
    ar: {
        title: 'الطلبات',
        heroLive: "حجم التداول اليوم · مباشر",
        heroVolume: 'حجم التداول · ',
        order: 'طلب',
        orders: 'طلبات',
        avgBasket: 'متوسط السلة',
        liveSync: 'مزامنة مع الساعة التجريبية · تحديث كل 3 ثوانٍ',
        consolidated: 'بيانات موحدة',
        all: 'الكل',
        cards: 'البطاقات',
        mobile: 'الجوال',
        cash: 'نقدًا',
        refunds: 'المبالغ المستردة',
        reconciliation: 'التسوية',
        fraud: 'مكافحة الاحتيال',
        filterActive: 'فلتر نشط:',
        ordersDisplayed: 'طلبات معروضة',
        orderDisplayed: 'طلب معروض',
        on: 'من',
        clear: 'مسح',
        noOrders: 'لا توجد طلبات لهذا الفلتر.',
        olderOrdersHidden: 'طلبات أقدم مخفية',
        olderOrderHidden: 'طلب أقدم مخفي',
        showAll: 'عرض الكل',
        settlementOf: 'تسوية',
        reconciled: 'تمت التسوية',
        grossVolume: 'الحجم الإجمالي',
        visaMcInterchange: 'رسوم فيزا/ماستركارد',
        kiwiNetworkFees: 'رسوم شبكة كيوي',
        vatOnFees: 'الضريبة على الرسوم',
        netPaidOut: 'صافي المبلغ المدفوع',
        savingsVsCmi: 'التوفير مقابل CMI:',
        today: 'اليوم',
        vs: 'مقابل',
        openAlerts: 'تنبيهات مفتوحة',
        model: 'نموذج',
        slidingWindow: 'نافذة منزلقة',
        examine: 'فحص',
        markLegitimate: 'وضع علامة كمشروع',
        blockCard: 'حظر البطاقة',
        paid: 'مدفوع',
        pending: 'قيد الانتظار',
        refunded: 'مسترد',
        hour: 'الوقت',
        method: 'الطريقة',
        client: 'العميل',
        amount: 'المبلغ',
        tip: 'الإكرامية',
        status: 'الحالة',
    }
  };

  const RANGE_LABEL_STR = {
    fr: { aujourdhui: "Aujourd'hui", hier: 'Hier', sept: '7 derniers jours', trente: '30 derniers jours' },
    en: { aujourdhui: "Today", hier: 'Yesterday', sept: 'Last 7 days', trente: 'Last 30 days' },
    ar: { aujourdhui: "اليوم", hier: 'أمس', sept: 'آخر 7 أيام', trente: 'آخر 30 يومًا' },
  };
  const venue = (window.KiwiVenue?.getVenue?.()) || 'cafeAtlas';
  const DAILY_TARGET = ({ cafeAtlas: 215, maisonMansour: 48, spaBahia: 22 })[venue] || 215;

  const lang = trLang();
  const T = TX_STR[lang] || TX_STR.fr;

  /* Deterministic PRNG (Mulberry32 + FNV-1a seed). Keeps the day's order
   * pool stable across drawer opens — closing and reopening shows the same
   * commandes you saw before. */
  function makeRng(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => {
      h |= 0; h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const METHODS = {
    [T.cards]:    [{ n: 'Visa', mask: '4291' }, { n: 'Mastercard', mask: '7820' }, { n: 'Visa', mask: '0043' }, { n: 'Visa', mask: '8124' }, { n: 'Mastercard', mask: '1209' }, { n: 'Mastercard', mask: '6670' }],
    [T.mobile]:    [{ n: 'Kiwi Tap', mask: 'NFC' }, { n: 'Kiwi Wallet', mask: 'QR' }, { n: 'Apple Pay', mask: 'NFC' }, { n: 'Google Pay', mask: 'NFC' }],
    [T.cash]: [{ n: T.cash, mask: '—' }],
  };
  const CUSTOMERS = ['Karim B.', 'Sara L.', 'Youssef A.', 'Nawal K.', 'Hassan J.', 'Imane M.', 'Mehdi R.', 'Fatima Z.', 'Rachid O.', 'Lina S.', 'Ahmed T.', 'Yasmine H.', 'Omar F.', 'Naima Z.', 'Tarik B.', 'Aïcha M.', 'Walid K.', 'Soukaina A.', 'Reda H.', 'Salma F.', 'Hicham D.', 'Mariam S.', 'Brahim K.', 'Latifa O.', 'Khalid R.'];

  /* Build a chronologically sorted pool. simIdx (0..15 == 11h..02h) lets us
   * slice "the first N orders of the day" deterministically against cumTx. */
  function buildPool(salt, size) {
    const today = new Date();
    const rng = makeRng(`${venue}-${today.getFullYear()}-${today.getMonth()}-${today.getDate()}-${salt}`);
    const pool = [];
    for (let i = 0; i < size; i++) {
      const r = rng();
      const cat = r < 0.66 ? T.cards : r < 0.92 ? T.mobile : T.cash;
      const opts = METHODS[cat];
      const m = opts[Math.floor(rng() * opts.length)];
      const amt = Math.round((40 + rng() * 360) * 100) / 100;
      const tip = rng() > 0.6 ? Math.round(amt * 0.1 * 100) / 100 : 0;
      const simIdx = Math.floor(rng() * 16);
      const minute = Math.floor(rng() * 60);
      const realHour = (11 + simIdx) % 24;
      pool.push({
        id: `KW-${(70000 + i + Math.floor(rng() * 9999)).toString().padStart(5, '0')}`,
        t: `${realHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        simIdx,
        n: m.n, mask: m.mask, cat,
        c: CUSTOMERS[Math.floor(rng() * CUSTOMERS.length)],
        amt, tip,
        status: rng() > 0.95 ? 'pend' : 'ok',
      });
    }
    pool.sort((a, b) => a.simIdx - b.simIdx || a.t.localeCompare(b.t));
    return pool;
  }

  function buildRefunds(sourcePool, n) {
    const rng = makeRng(`${venue}-ref-${n}`);
    const out = [];
    for (let i = 0; i < n; i++) {
      const src = sourcePool[Math.floor(rng() * sourcePool.length)] || sourcePool[0];
      if (!src) break;
      out.push({
        id: `KW-RB-${(40000 + i).toString().padStart(5, '0')}`,
        t: src.t, n: src.n, mask: src.mask, c: src.c,
        amt: -Math.round(src.amt * (0.4 + rng() * 0.5) * 100) / 100,
        tip: 0, status: 'ref', cat: T.refunds, simIdx: src.simIdx,
      });
    }
    return out;
  }

  /* Pre-build all four range pools so opening the drawer is instant. */
  const POOL = {
    aujourdhui: buildPool('today', DAILY_TARGET + 40),
    hier:       buildPool('y1',    DAILY_TARGET),
    sept:       buildPool('w1',    DAILY_TARGET * 7),
    trente:     buildPool('m1',    DAILY_TARGET * 30),
  };

  const fmt2 = (n) => Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt0 = (n) => Math.round(n).toLocaleString('fr-FR').replace(/,/g, ' ');

  /* Drawer state */
  let activeFilter = T.all;
  let activeRange  = 'aujourdhui';
  let activeTab    = 'flux';
  let expanded     = false;
  let unsub        = null;

  function getCumTx() {
    return window.KiwiDemoClock?.getSimState?.()?.cumTx ?? Math.round(DAILY_TARGET * 0.7);
  }
  function rangeRows() {
    if (activeRange === 'aujourdhui') return POOL.aujourdhui.slice(0, getCumTx());
    if (activeRange === 'hier')       return POOL.hier;
    if (activeRange === 'sept')       return POOL.sept;
    return POOL.trente;
  }
  function rangeRefunds() {
    const base = rangeRows();
    const n    = activeRange === 'aujourdhui' ? Math.max(1, Math.floor(getCumTx() / 40))
                : activeRange === 'hier'       ? 8
                : activeRange === 'sept'       ? 28
                : 115;
    return buildRefunds(base.length ? base : POOL.aujourdhui, n);
  }

  const RANGE_LABEL = RANGE_LABEL_STR[lang] || RANGE_LABEL_STR.fr;
  const FILTERS     = [T.all, T.cards, T.mobile, T.cash, T.refunds];

  let host;
  const dr = window.Kiwi.appPage('transactions', { title: T.title, subtitle: '…', body: `<div data-tx-host></div>` });
  host = dr.el.querySelector('[data-tx-host]');

  function render() {
    const baseRows = rangeRows();
    const refunds  = rangeRefunds();
    /* ─── HERO = always the unfiltered total for the active range.
     * The hero number is what should match the dashboard's Commandes KPI tile.
     * Filters narrow only the table below, not the headline. ─── */
    const heroTotal  = baseRows.length;
    const heroSum    = baseRows.reduce((s, r) => s + r.amt, 0);
    const heroAvg    = heroTotal > 0 ? Math.round(heroSum / heroTotal) : 0;

    /* ─── TABLE = filtered subset ─── */
    const list = activeFilter === T.refunds ? refunds
               : activeFilter === T.all         ? baseRows
               : baseRows.filter(r => r.cat === activeFilter);
    const total   = list.length;
    const sumAmt  = list.reduce((s, r) => s + r.amt, 0);
    const live    = activeRange === 'aujourdhui';
    const filtered = activeFilter !== T.all;
    const sortedDesc = list.slice().sort((a, b) => b.simIdx - a.simIdx || b.t.localeCompare(a.t));
    const limit   = expanded ? 500 : 80;
    const display = sortedDesc.slice(0, limit);
    const hidden  = Math.max(0, total - display.length);

    const tabs = [['flux',T.all], ['rec',T.reconciliation], ['fra',T.fraud]];

    host.innerHTML = `
      <div class="p-hero">
        <div class="l">${live ? T.heroLive : T.heroVolume + RANGE_LABEL[activeRange].toUpperCase()}</div>
        <div class="big">${fmt0(Math.abs(heroSum))} <span style="font-size:18px; opacity:0.7;">MAD</span></div>
        <div class="sub">${heroTotal} ${heroTotal > 1 ? T.orders : T.order} · ${T.avgBasket} ${heroAvg} MAD · ${live ? T.liveSync : T.consolidated}</div>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; align-items:center;">
        ${FILTERS.map(c => `
          <button class="chip ${activeFilter === c ? 'ok' : 'neutral'}" data-action="tx-filter" data-arg="${c}" style="padding:6px 12px; font-size:12px; cursor:pointer; border:0;">${c}</button>
        `).join('')}
        <span style="flex:1;"></span>
        <button class="kb ghost" data-action="tx-daterange" style="padding:6px 12px; font-size:12px; gap:6px;">${RANGE_LABEL[activeRange]} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>
      </div>

      ${filtered ? `
        <div style="background:rgba(125,242,176,0.10); border:1px solid rgba(11,110,79,0.16); padding:8px 14px; border-radius:9px; margin-bottom:12px; font-size:12.5px; color:var(--riad); display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <span>${T.filterActive} <b>${activeFilter}</b> · ${total} ${total > 1 ? T.ordersDisplayed : T.orderDisplayed}${activeFilter !== T.refunds ? ` ${T.on} ${heroTotal}` : ''} · ${fmt0(Math.abs(sumAmt))} MAD</span>
          <button class="kb ghost" data-action="tx-filter" data-arg="${T.all}" style="padding:4px 10px; font-size:11.5px;">${T.clear}</button>
        </div>
      ` : ''}

      <div style="display:flex; gap:4px; padding:4px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:11px; margin-bottom:14px;">
        ${tabs.map(([k, l]) => {
          const on = activeTab === k;
          return `<button class="tx-tab ${on ? 'on' : ''}" data-tx-tab="${k}" style="flex:1; padding:9px 12px; border:0; background:${on?'var(--surface)':'transparent'}; color:${on?'var(--ink)':'var(--n-500)'}; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; box-shadow:${on?'0 1px 2px rgba(0,0,0,0.05)':'none'};">${l}</button>`;
        }).join('')}
      </div>

      <div data-tx-pane="flux" style="display:${activeTab === 'flux' ? '' : 'none'};">
        ${display.length === 0 ? `
          <div style="padding:40px 16px; text-align:center; color:var(--n-500); font-size:13px;">${T.noOrders}</div>
        ` : `
          <table class="p-table">
            <thead><tr><th>${T.hour.toUpperCase()}</th><th>${T.method.toUpperCase()}</th><th>${T.client.toUpperCase()}</th><th class="right">${T.amount.toUpperCase()}</th><th class="right">${T.tip.toUpperCase()}</th><th>${T.status.toUpperCase()}</th></tr></thead>
            <tbody>
              ${display.map(r => `
                <tr data-action="tx-detail" data-arg="${r.id}" style="cursor:pointer;">
                  <td class="mono">${r.t}</td>
                  <td><b>${r.n}</b> <span style="color:var(--n-500);">${r.mask}</span></td>
                  <td style="color:var(--n-600);">${r.c}</td>
                  <td class="mono right" style="${r.amt < 0 ? 'color:var(--danger);' : ''}">${r.amt < 0 ? '−' : ''}${fmt2(r.amt)}</td>
                  <td class="mono right" style="color:${r.tip > 0 ? 'var(--success)' : 'var(--n-400)'};">${r.tip > 0 ? '+' + fmt2(r.tip) : '—'}</td>
                  <td><span class="chip ${r.status === 'ok' ? 'ok' : 'pend'}">${r.status === 'ok' ? T.paid : r.status === 'ref' ? T.refunded : T.pending}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${hidden > 0 ? `
            <div style="text-align:center; padding:14px; color:var(--n-500); font-size:12px;">
              ${hidden} ${hidden > 1 ? T.olderOrdersHidden : T.olderOrderHidden} ·
              <a href="#" data-action="tx-show-all" style="color:var(--atlas); font-weight:500;">${T.showAll}</a>
            </div>
          ` : ''}
        `}
      </div>

      <div data-tx-pane="rec" style="display:${activeTab === 'rec' ? '' : 'none'};">
        <div class="p-card" style="background:var(--surface);">
          <div class="head"><h4>${T.settlementOf} 28 avril</h4><span class="chip ok">${T.reconciled}</span></div>
          <table class="p-table" style="margin-top:6px;">
            <tbody>
              <tr><td>${T.grossVolume} · 174 ${T.orders}</td><td class="mono right">+30 482,50 MAD</td></tr>
              <tr><td style="color:var(--n-500);">${T.visaMcInterchange} (1,18 %)</td><td class="mono right" style="color:var(--danger);">−359,69 MAD</td></tr>
              <tr><td style="color:var(--n-500);">${T.kiwiNetworkFees} (0,30 %)</td><td class="mono right" style="color:var(--danger);">−91,45 MAD</td></tr>
              <tr><td style="color:var(--n-500);">${T.vatOnFees}</td><td class="mono right" style="color:var(--danger);">−90,23 MAD</td></tr>
              <tr style="border-top:2px solid var(--ink);"><td><b>${T.netPaidOut} Bank of Africa ••3291</b></td><td class="mono right"><b style="color:var(--atlas); font-size:15px;">29 941,13 MAD</b></td></tr>
            </tbody>
          </table>
          <div style="margin-top:14px; padding:10px 14px; background:var(--mint-soft, rgba(125,242,176,0.18)); border-radius:9px; font-size:12.5px; color:var(--riad);">
            <b>${T.savingsVsCmi}</b> +247 MAD ${T.today} · 1,18 % ${T.vs} 2,0 % CMI
          </div>
        </div>
      </div>

      <div data-tx-pane="fra" style="display:${activeTab === 'fra' ? '' : 'none'};">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
          <span class="chip" style="background:var(--warn-soft); color:var(--warn-ink);">2 ${T.openAlerts}</span>
          <span style="font-size:11.5px; color:var(--n-500);">${T.model}: Kiwi Sentinel · 30 j ${T.slidingWindow}</span>
        </div>
        ${[
          { t: 'Visa •• 0043, 3ᵉ remboursement cette semaine', d: 'Pattern récurrent · 240 MAD à chaque fois · adresse IP changeante', risk: 'Élevé' },
          { t: 'Kiwi Wallet QR, pic anormal 13:42', d: '7 commandes du même device en 4 minutes · panier moyen 38 MAD', risk: 'Moyen' },
        ].map(a => `
          <div class="p-card" style="background:var(--surface);">
            <div class="head">
              <div>
                <h4 style="font-size:14.5px;">${a.t}</h4>
                <div style="font-size:12px; color:var(--n-500); margin-top:4px;">${a.d}</div>
              </div>
              <span class="chip ${a.risk === 'Élevé' ? 'pend' : 'neutral'}">${a.risk}</span>
            </div>
            <div style="display:flex; gap:6px; margin-top:8px;">
              <button class="kb ghost" data-action="fra-investigate" style="padding:6px 10px; font-size:12px;">${T.examine}</button>
              <button class="kb ghost" data-action="fra-allow" style="padding:6px 10px; font-size:12px;">${T.markLegitimate}</button>
              <button class="kb atlas" data-action="fra-block" style="padding:6px 10px; font-size:12px;">${T.blockCard}</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    /* Wire tab buttons (rebound on every render since innerHTML wipes listeners). */
    host.querySelectorAll('.tx-tab').forEach(btn => {
      btn.onclick = () => { activeTab = btn.dataset.txTab; render(); };
    });

    /* Live subtitle */
    const subEl = dr.el.querySelector('.genpage-head p, .kiwi-drawer-head p');
    if (subEl) subEl.textContent = `${heroTotal} ${heroTotal > 1 ? T.orders : T.order} · ${fmt0(Math.abs(heroSum))} MAD · ${RANGE_LABEL[activeRange]}`;
  }

  render();

  /* Action handlers — (element, arg) signature per interactive.js routing */
  handlers['tx-filter'] = (_el, c) => {
    if (FILTERS.indexOf(c) === -1) return;
    activeFilter = c;
    expanded = false;
    render();
  };
  handlers['tx-daterange'] = (el) => {
    if (!el) return;
    const lang = trLang();
    const T = TX_STR[lang] || TX_STR.fr;
    const RANGE_LABEL = RANGE_LABEL_STR[lang] || RANGE_LABEL_STR.fr;
    menu(el, [
      { label: RANGE_LABEL.aujourdhui,       active: activeRange === 'aujourdhui', onClick: () => { activeRange = 'aujourdhui'; activeFilter = T.all; expanded = false; render(); } },
      { label: RANGE_LABEL.hier,               active: activeRange === 'hier',       onClick: () => { activeRange = 'hier';      activeFilter = T.all; expanded = false; render(); } },
      { sep: true },
      { label: RANGE_LABEL.sept,   active: activeRange === 'sept',       onClick: () => { activeRange = 'sept';      activeFilter = T.all; expanded = false; render(); } },
      { label: RANGE_LABEL.trente,  active: activeRange === 'trente',     onClick: () => { activeRange = 'trente';    activeFilter = T.all; expanded = false; render(); } },
    ]);
  };
  handlers['tx-show-all'] = () => { expanded = true; render(); };
  handlers['tx-detail']   = (_el, id) => toast(`${T.title} · ${id || ''}`, { type: 'info', duration: 1500 });
  if (!handlers['fra-investigate']) handlers['fra-investigate'] = () => toast(T.dossierOuvert, { type: 'info', duration: 1800 });
  if (!handlers['fra-allow'])       handlers['fra-allow']       = () => toast(T.marqueLegitime, { type: 'success', duration: 1600 });
  if (!handlers['fra-block'])       handlers['fra-block']       = () => toast(T.carteBloquee, { type: 'success', duration: 1800 });

  /* Live updates from the demo clock (only when viewing today). */
  if (window.KiwiDemoClock?.subscribe) {
    unsub = window.KiwiDemoClock.subscribe(() => {
      // Stop updating once we leave the Transactions page (the appPage host
      // persists and is shared, so guard on the active page, not isConnected).
      if (!dr.el || !dr.el.isConnected || (window.Kiwi && window.Kiwi.activePage !== 'transactions')) { unsub?.(); unsub = null; return; }
      if (activeRange !== 'aujourdhui') return;
      render();
    });
  }
  const origClose = dr.close || (() => {});
  dr.close = () => { unsub?.(); unsub = null; origClose(); };
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 3 · TERMINAUX · fleet management
 *
 * The fleet is now KiwiPad pro (comptoir), KiwiPad cashless (salle),
 * KiwiPad (terrasse), KiwiOrders pro (cuisine). Each card swaps its
 * abstract SVG block for the matching "gamification" product render so
 * the merchant sees their actual hardware at a glance.
 *
 * "Ajouter" and "Demander un terminal" both open the new catalog drawer.
 * ─────────────────────────────────────────────────────────────────────────── */
const TERMINAUX_STR = {
    fr: {
        loaned: 'Prêté · Kiwi Pro',
        purchased: 'Acheté · 03/2025',
        replacement: 'Remplacement dû',
        title: 'Parc terminaux',
        subtitle: (active, total) => `${active} / ${total} actifs · uptime 24h 94,2 % · 273 tx aujourd'hui`,
        heroTitle: 'ÉTAT DU PARC · CAFÉ ATLAS',
        online: 'en ligne',
        heroSubtitle: 'Batterie moy. 78 % · firmware à jour majoritaire · 1 mise à jour disponible',
        deployedDevices: 'Appareils déployés',
        add: 'Ajouter',
        updateAvailable: 'MAJ disponible',
        onlineStatus: 'En ligne',
        offlineStatus: 'Hors-ligne',
        txToday: 'tx aujourd\'hui',
        testTx: 'Tx test',
        diagnose: 'Diagnostiquer',
        manage: 'Gérer',
        beats: 'PULSATIONS · 30 MIN',
        battery: 'BATTERIE',
        lastTx: 'DERNIÈRE TX',
        beforeDisconnect: 'avant déconnexion',
        orderNewTerminal: 'Commander un nouveau terminal',
        orderNewTerminalDesc: 'KiwiPad pro, KiwiPad cashless ou KiwiOrders pro · livraison 48h Casablanca',
        requestTerminal: 'Demander un terminal',
        testTxSent: 'Tx test envoyée',
        diagOpen: 'Diagnostic ... · ouvert',
        comptoir: 'Comptoir',
        salle: 'Salle',
        terrasse: 'Terrasse',
        cuisine: 'Cuisine',
        wifi: 'Wi-Fi',
        fourG: '4G',
        // — fleet management · Add / Manage / Deactivate / Remove —
        manageTitle: 'Gérer le terminal',
        firmwareLabel: 'Firmware',
        batteryWord: 'Batterie',
        locationLabel: 'Emplacement',
        locationPlaceholder: 'ex. Comptoir, Terrasse…',
        networkLabel: 'Réseau',
        modelLabel: 'Modèle',
        disabledStatus: 'Désactivé',
        save: 'Enregistrer',
        cancel: 'Annuler',
        saveDone: 'Emplacement mis à jour',
        actionsLabel: 'Actions',
        deactivate: 'Désactiver ce terminal',
        reactivate: 'Réactiver ce terminal',
        deactivatedToast: (n) => `${n} désactivé`,
        reactivatedToast: (n) => `${n} réactivé`,
        deactivatedDesc: 'Le terminal n\'acceptera plus de paiements jusqu\'à réactivation.',
        reactivatedDesc: 'Le terminal est de nouveau prêt à encaisser.',
        diagRunning: 'Diagnostic en cours',
        diagDesc: 'Réseau, batterie et firmware vérifiés, aucun problème détecté.',
        testUnavailable: 'Terminal hors-ligne, test impossible',
        dangerZone: 'Zone sensible',
        removeBtn: 'Retirer du parc',
        removeTitle: 'Retirer ce terminal ?',
        removeDesc: (n) => `${n} sera retiré de votre parc Kiwi. Vous pourrez le réenregistrer à tout moment via « Ajouter ».`,
        removeCta: 'Retirer le terminal',
        removedToast: (n) => `${n} retiré du parc`,
        addTitle: 'Ajouter un terminal',
        addIntro: 'Enregistrez un appareil Kiwi déjà en votre possession. Pour commander du nouveau matériel, utilisez « Demander un terminal ».',
        addCta: 'Ajouter au parc',
        addedToast: (n) => `${n} ajouté au parc`,
        addedDesc: 'Le terminal est en ligne et prêt à encaisser.',
    },
    en: {
        loaned: 'Loaned · Kiwi Pro',
        purchased: 'Purchased · 03/2025',
        replacement: 'Replacement due',
        title: 'Terminal Fleet',
        subtitle: (active, total) => `${active} / ${total} active · 24h uptime 94.2% · 273 tx today`,
        heroTitle: 'FLEET STATUS · CAFÉ ATLAS',
        online: 'online',
        heroSubtitle: 'Avg. battery 78% · majority firmware up-to-date · 1 update available',
        deployedDevices: 'Deployed Devices',
        add: 'Add',
        updateAvailable: 'Update available',
        onlineStatus: 'Online',
        offlineStatus: 'Offline',
        txToday: 'tx today',
        testTx: 'Test Tx',
        diagnose: 'Diagnose',
        manage: 'Manage',
        beats: 'HEARTBEATS · 30 MIN',
        battery: 'BATTERY',
        lastTx: 'LAST TX',
        beforeDisconnect: 'before disconnect',
        orderNewTerminal: 'Order a new terminal',
        orderNewTerminalDesc: 'KiwiPad pro, KiwiPad cashless or KiwiOrders pro · 48h delivery in Casablanca',
        requestTerminal: 'Request a terminal',
        testTxSent: 'Test tx sent',
        diagOpen: 'Diagnosis ... · open',
        comptoir: 'Counter',
        salle: 'Floor',
        terrasse: 'Terrace',
        cuisine: 'Kitchen',
        wifi: 'Wi-Fi',
        fourG: '4G',
        // — fleet management · Add / Manage / Deactivate / Remove —
        manageTitle: 'Manage terminal',
        firmwareLabel: 'Firmware',
        batteryWord: 'Battery',
        locationLabel: 'Location',
        locationPlaceholder: 'e.g. Counter, Terrace…',
        networkLabel: 'Network',
        modelLabel: 'Model',
        disabledStatus: 'Deactivated',
        save: 'Save',
        cancel: 'Cancel',
        saveDone: 'Location updated',
        actionsLabel: 'Actions',
        deactivate: 'Deactivate this terminal',
        reactivate: 'Reactivate this terminal',
        deactivatedToast: (n) => `${n} deactivated`,
        reactivatedToast: (n) => `${n} reactivated`,
        deactivatedDesc: 'The terminal will stop accepting payments until reactivated.',
        reactivatedDesc: 'The terminal is ready to take payments again.',
        diagRunning: 'Running diagnostics',
        diagDesc: 'Network, battery and firmware checked, no issues found.',
        testUnavailable: 'Terminal offline, test unavailable',
        dangerZone: 'Danger zone',
        removeBtn: 'Remove from fleet',
        removeTitle: 'Remove this terminal?',
        removeDesc: (n) => `${n} will be removed from your Kiwi fleet. You can re-register it any time via "Add".`,
        removeCta: 'Remove terminal',
        removedToast: (n) => `${n} removed from fleet`,
        addTitle: 'Add a terminal',
        addIntro: 'Register a Kiwi device you already have. To order new hardware, use "Request a terminal".',
        addCta: 'Add to fleet',
        addedToast: (n) => `${n} added to fleet`,
        addedDesc: 'The terminal is online and ready to take payments.',
    },
    ar: {
        loaned: 'معار · كيوي برو',
        purchased: 'تم الشراء · 03/2025',
        replacement: 'يجب استبداله',
        title: 'أسطول الأجهزة',
        subtitle: (active, total) => `${active} / ${total} نشط · وقت التشغيل 24 ساعة 94.2% · 273 معاملة اليوم`,
        heroTitle: 'حالة الأسطول · مقهى أطلس',
        online: 'متصل',
        heroSubtitle: 'متوسط البطارية 78% · معظم البرامج الثابتة محدثة · 1 تحديث متوفر',
        deployedDevices: 'الأجهزة المنشورة',
        add: 'إضافة',
        updateAvailable: 'تحديث متوفر',
        onlineStatus: 'متصل',
        offlineStatus: 'غير متصل',
        txToday: 'معاملة اليوم',
        testTx: 'اختبار معاملة',
        diagnose: 'تشخيص',
        manage: 'إدارة',
        beats: 'النبضات · 30 دقيقة',
        battery: 'البطارية',
        lastTx: 'آخر معاملة',
        beforeDisconnect: 'قبل انقطاع الاتصال',
        orderNewTerminal: 'طلب جهاز جديد',
        orderNewTerminalDesc: 'KiwiPad pro, KiwiPad cashless أو KiwiOrders pro · توصيل خلال 48 ساعة في الدار البيضاء',
        requestTerminal: 'طلب جهاز',
        testTxSent: 'تم إرسال معاملة اختبار',
        diagOpen: 'تشخيص ... · مفتوح',
        comptoir: 'الكاونتر',
        salle: 'القاعة',
        terrasse: 'الشرفة',
        cuisine: 'المطبخ',
        wifi: 'Wi-Fi',
        fourG: '4G',
        // — إدارة الأسطول · إضافة / إدارة / تعطيل / إزالة —
        manageTitle: 'إدارة الجهاز',
        firmwareLabel: 'البرنامج الثابت',
        batteryWord: 'البطارية',
        locationLabel: 'الموقع',
        locationPlaceholder: 'مثال: الكاونتر، الشرفة…',
        networkLabel: 'الشبكة',
        modelLabel: 'الموديل',
        disabledStatus: 'معطّل',
        save: 'حفظ',
        cancel: 'إلغاء',
        saveDone: 'تم تحديث الموقع',
        actionsLabel: 'إجراءات',
        deactivate: 'تعطيل هذا الجهاز',
        reactivate: 'إعادة تفعيل هذا الجهاز',
        deactivatedToast: (n) => `تم تعطيل ${n}`,
        reactivatedToast: (n) => `تمت إعادة تفعيل ${n}`,
        deactivatedDesc: 'لن يقبل الجهاز المدفوعات حتى إعادة تفعيله.',
        reactivatedDesc: 'الجهاز جاهز لاستقبال المدفوعات من جديد.',
        diagRunning: 'جارٍ التشخيص',
        diagDesc: 'تم فحص الشبكة والبطارية والبرنامج الثابت، لم يتم العثور على مشاكل.',
        testUnavailable: 'الجهاز غير متصل، التجربة غير متاحة',
        dangerZone: 'منطقة حساسة',
        removeBtn: 'إزالة من الأسطول',
        removeTitle: 'إزالة هذا الجهاز؟',
        removeDesc: (n) => `سيُزال ${n} من أسطول كيوي. يمكنك إعادة تسجيله في أي وقت عبر «إضافة».`,
        removeCta: 'إزالة الجهاز',
        removedToast: (n) => `تمت إزالة ${n} من الأسطول`,
        addTitle: 'إضافة جهاز',
        addIntro: 'سجّل جهاز كيوي موجوداً لديك بالفعل. لطلب جهاز جديد، استخدم «طلب جهاز».',
        addCta: 'إضافة إلى الأسطول',
        addedToast: (n) => `تمت إضافة ${n} إلى الأسطول`,
        addedDesc: 'الجهاز متصل وجاهز لاستقبال المدفوعات.',
    },
};
/* Live fleet state — module-level so add / deactivate / remove survive the
 * Terminaux drawer being closed & re-opened within a session. A full page
 * reload re-seeds the demo fleet. */
let TERM_FLEET = null;
function termFleetSeed() {
  return [
    { id: 'KP-PRO-2831', model: 'KiwiPad pro',     loc: 'comptoir', net: 'wifi', img: 'Hardware_pictures/Hardware_gamefication4.png',    state: 'on',  batt: 87,  battStart: 96,  fw: '4.2.1', fwUpdate: false, txDay: 87,  life: 'loaned',      pulse: 0.70 },
    { id: 'KP-CL-1208',  model: 'KiwiPad cashless', loc: 'salle',    net: '4g',   img: 'Hardware_pictures/Hardware_gamefication2.png',    state: 'on',  batt: 63,  battStart: 92,  fw: '2.0.4', fwUpdate: true,  txDay: 54,  life: 'purchased',   pulse: 0.55 },
    { id: 'KP-PRO-2832', model: 'KiwiPad pro',     loc: 'terrasse', net: 'wifi', img: 'Hardware_pictures/Hardware_gamefication4.png',    state: 'off', batt: 64,  battStart: 88,  fw: '4.2.1', fwUpdate: false, txDay: 0,   life: 'replacement', pulse: 0.05 },
    { id: 'KO-PRO-4501', model: 'KiwiOrders pro',  loc: 'cuisine',  net: 'wifi', img: 'Hardware_pictures/Hardware_KDSgamefication1.png', state: 'on',  batt: 100, battStart: 100, fw: '3.1.0', fwUpdate: false, txDay: 132, life: 'loaned',      pulse: 0.78 },
  ];
}
function termFleet() { if (!TERM_FLEET) TERM_FLEET = termFleetSeed(); return TERM_FLEET; }

/* Hardware the "Add a terminal" form can register. */
const TERM_MODELS = {
  'KiwiPad pro':      { prefix: 'KP-PRO', fw: '4.2.1', img: 'Hardware_pictures/Hardware_gamefication4.png' },
  'KiwiPad cashless': { prefix: 'KP-CL',  fw: '2.0.4', img: 'Hardware_pictures/Hardware_gamefication2.png' },
  'KiwiOrders pro':   { prefix: 'KO-PRO', fw: '3.1.0', img: 'Hardware_pictures/Hardware_KDSgamefication1.png' },
};

handlers['nav-terminaux'] = () => {
  const T = TERMINAUX_STR[trLang()] || TERMINAUX_STR.fr;
  const fleet = termFleet();
  const lifeChip = { loaned: 'ok', purchased: 'neutral', replacement: 'pend' };
  const lifeText = { loaned: T.loaned, purchased: T.purchased, replacement: T.replacement };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const locName = (l) => T[l] || l;
  const netName = (n) => (n === '4g' ? T.fourG : n === 'wifi' ? T.wifi : n);
  const activeCount = () => fleet.filter((t) => t.state === 'on').length;
  const byId = (id) => fleet.find((t) => t.id === id);

  /* sparkline + battery-curve helpers */
  const spark = (arr, color = 'var(--atlas)') => {
    const max = Math.max(...arr, 1);
    const w = 120, h = 28;
    const pts = arr.map((v, i) => `${(i / (arr.length - 1)) * w},${h - (v / max) * h}`).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  const battCurve = (start, end) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push(start + ((end - start) * i / 12));
    return spark(pts, 'var(--atlas)');
  };
  const beat = (n) => Array.from({ length: 30 }, () => Math.max(0.4, n + (Math.random() - 0.5) * 0.5));

  /* ── fleet markup · re-rendered in place after every mutation ───────── */
  function fleetHtml() {
    return `
      <div class="p-hero">
        <div class="l">${T.heroTitle}</div>
        <div class="big">${activeCount()} / ${fleet.length} <span style="font-size:18px; opacity:0.7;">${T.online}</span></div>
        <div class="sub">${T.heroSubtitle}</div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); text-transform:uppercase;">${T.deployedDevices}</div>
        <button class="kb ghost" data-action="term-add" style="padding:6px 12px; font-size:12px; gap:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>${T.add}</button>
      </div>

      ${fleet.map((t) => {
        const off = t.state === 'off';
        const disabled = t.state === 'disabled';
        const dim = off || disabled;
        const bg = off ? 'background:var(--warn-soft);' : disabled ? 'background:var(--paper-soft);' : '';
        const dot = t.state === 'on' ? 'var(--success)' : off ? 'var(--danger)' : 'var(--n-400)';
        const statusTxt = t.state === 'on' ? `${T.onlineStatus} · ${netName(t.net)}` : off ? `${T.offlineStatus} · 09:18` : T.disabledStatus;
        const sparkColor = t.state === 'on' ? 'var(--atlas)' : off ? 'var(--danger)' : 'var(--n-400)';
        return `
        <div class="p-card" style="margin-bottom:10px; ${bg}">
          <div style="display:grid; grid-template-columns:104px 1fr auto; gap:14px; align-items:center; margin-bottom:12px;">
            <div style="width:104px; height:80px; border-radius:11px; background:var(--surface); border:1px solid var(--n-200); display:flex; align-items:center; justify-content:center; padding:6px; ${dim ? 'opacity:0.55;' : ''}">
              <img src="${t.img}" alt="${esc(t.model)}" style="max-width:100%; max-height:100%; object-fit:contain; display:block;" loading="lazy">
            </div>
            <div>
              <div style="font-weight:600; font-size:14.5px; letter-spacing:-0.005em;">${esc(t.model)} · ${esc(locName(t.loc))}</div>
              <div style="font-family:var(--mono); font-size:11px; color:var(--n-500); margin-top:2px;">S/N ${esc(t.id)} · firmware ${t.fw}${t.fwUpdate ? ` · <span class="chip pend" style="padding:1px 7px; font-size:10px; margin-left:4px;">${T.updateAvailable}</span>` : ''}</div>
              <div style="display:flex; gap:14px; margin-top:8px; font-size:11.5px; color:var(--n-600); flex-wrap:wrap;">
                <span style="display:inline-flex; align-items:center; gap:5px;"><i style="width:6px; height:6px; border-radius:50%; background:${dot};"></i>${statusTxt}</span>
                <span>${t.txDay} ${T.txToday}</span>
                <span class="chip ${lifeChip[t.life] || 'neutral'}" style="padding:1px 8px; font-size:10px;">${lifeText[t.life] || ''}</span>
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
              <button class="kb ghost" data-action="term-test" data-arg="${t.id}" style="padding:5px 10px; font-size:11.5px; gap:5px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg>${T.testTx}</button>
              <button class="kb ${off ? 'atlas' : 'ghost'}" data-action="term-manage" data-arg="${t.id}" style="padding:5px 10px; font-size:11.5px;">${T.manage}</button>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; padding-top:12px; border-top:1px solid var(--n-200);">
            <div>
              <div style="font-size:10px; letter-spacing:0.08em; color:var(--n-500); font-family:var(--mono); margin-bottom:4px;">${T.beats}</div>
              ${spark(beat(t.state === 'on' ? t.pulse : 0.05), sparkColor)}
            </div>
            <div>
              <div style="font-size:10px; letter-spacing:0.08em; color:var(--n-500); font-family:var(--mono); margin-bottom:4px;">${T.battery} · ${t.batt} %</div>
              ${battCurve(t.battStart / 100, t.batt / 100)}
            </div>
            <div>
              <div style="font-size:10px; letter-spacing:0.08em; color:var(--n-500); font-family:var(--mono); margin-bottom:4px;">${T.lastTx}</div>
              <div style="font-family:var(--mono); font-weight:500; font-size:13px;">${t.state === 'on' ? '14:' + (28 + Math.floor(Math.random() * 9)) : '09:18'}</div>
              <div style="font-size:11px; color:var(--n-500); margin-top:2px;">${t.state === 'on' ? Math.round(40 + Math.random() * 200) + ',00 MAD' : T.beforeDisconnect}</div>
            </div>
          </div>
        </div>`;
      }).join('')}

      <div style="padding:18px; margin-top:6px; background:var(--paper-soft); border-radius:14px; border:1px dashed var(--n-300); text-align:center;">
        <div style="font-weight:600; margin-bottom:4px; font-size:14.5px;">${T.orderNewTerminal}</div>
        <div style="font-size:12.5px; color:var(--n-500); margin-bottom:12px;">${T.orderNewTerminalDesc}</div>
        <button class="kb atlas" data-action="add-terminal" style="padding:9px 18px;">${T.requestTerminal}</button>
      </div>
    `;
  }

  /* re-render the open drawer body + keep the sidebar badge in sync */
  function refresh() {
    const wrap = document.getElementById('term-fleet');
    if (wrap) wrap.innerHTML = fleetHtml();
    const sub = document.querySelector('.kiwi-drawer-backdrop .kiwi-drawer-head p');
    if (sub) sub.textContent = T.subtitle(activeCount(), fleet.length);
    const cnt = document.querySelector('a[data-nav="terminaux"] .count');
    if (cnt) cnt.textContent = String(fleet.length);
  }

  /* shared form styling for the Manage / Add modals */
  const fieldCss = 'width:100%; padding:9px 12px; border:1px solid var(--n-300); border-radius:9px; font-size:13px; font-family:inherit; background:var(--surface); color:var(--ink); box-sizing:border-box;';
  const labelCss = 'display:block; font-size:10px; letter-spacing:0.08em; font-family:var(--mono); color:var(--n-500); text-transform:uppercase; margin-bottom:6px;';

  /* ── MANAGE one terminal · rename · activate/deactivate · diagnose · remove ── */
  function openManage(t) {
    const off = t.state === 'off';
    const disabled = t.state === 'disabled';
    const dot = t.state === 'on' ? 'var(--success)' : off ? 'var(--danger)' : 'var(--n-400)';
    const statusTxt = t.state === 'on' ? `${T.onlineStatus} · ${netName(t.net)}` : off ? `${T.offlineStatus} · 09:18` : T.disabledStatus;
    const m = modal({
      title: `${esc(t.model)} · ${esc(locName(t.loc))}`,
      tag: `S/N ${esc(t.id)}`,
      width: 460,
      body: `
        <div style="display:flex; gap:13px; align-items:center; padding-bottom:14px; border-bottom:1px solid var(--n-200);">
          <div style="width:80px; height:62px; border-radius:10px; background:var(--surface); border:1px solid var(--n-200); display:flex; align-items:center; justify-content:center; padding:6px; flex-shrink:0;">
            <img src="${t.img}" alt="" style="max-width:100%; max-height:100%; object-fit:contain;">
          </div>
          <div style="font-size:12px; color:var(--n-600); line-height:1.65;">
            <div style="display:inline-flex; align-items:center; gap:6px; font-weight:600; color:var(--ink); font-size:12.5px;"><i style="width:7px; height:7px; border-radius:50%; background:${dot};"></i>${statusTxt}</div>
            <div>${T.firmwareLabel} ${t.fw}${t.fwUpdate ? ` · <span style="color:var(--warn-ink);">${T.updateAvailable}</span>` : ''}</div>
            <div>${T.batteryWord} ${t.batt} % · ${t.txDay} ${T.txToday}</div>
          </div>
        </div>

        <div style="margin-top:14px;">
          <label style="${labelCss}" for="term-loc-input">${T.locationLabel}</label>
          <input id="term-loc-input" type="text" value="${esc(locName(t.loc))}" placeholder="${esc(T.locationPlaceholder)}" style="${fieldCss}">
        </div>

        <div style="margin-top:16px;">
          <div style="${labelCss}">${T.actionsLabel}</div>
          <div style="display:flex; gap:8px;">
            <button id="term-mtest" class="kb ghost" style="flex:1; justify-content:center; padding:8px 10px; font-size:12px;">${T.testTx}</button>
            <button id="term-mdiag" class="kb ghost" style="flex:1; justify-content:center; padding:8px 10px; font-size:12px;">${T.diagnose}</button>
          </div>
          <button id="term-mtoggle" class="kb ${disabled ? 'atlas' : 'ghost'}" style="width:100%; justify-content:center; margin-top:8px; padding:9px 12px; font-size:12.5px;">${disabled ? T.reactivate : T.deactivate}</button>
        </div>

        <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--n-200);">
          <div style="font-size:10px; letter-spacing:0.08em; font-family:var(--mono); color:var(--danger); text-transform:uppercase; margin-bottom:8px;">${T.dangerZone}</div>
          <button id="term-mremove" class="kb ghost" style="width:100%; justify-content:center; padding:9px 12px; font-size:12.5px; color:var(--danger); border-color:rgba(193,58,46,0.45);">${T.removeBtn}</button>
        </div>
      `,
      foot: `
        <button id="term-mcancel" class="kb ghost" style="padding:9px 16px;">${T.cancel}</button>
        <button id="term-msave" class="kb atlas" style="padding:9px 16px;">${T.save}</button>
      `,
    });
    const q = (s) => m.el.querySelector(s);
    q('#term-mcancel').onclick = () => m.close();
    q('#term-mtest').onclick = () => {
      if (t.state !== 'on') { toast(T.testUnavailable, { type: 'info', duration: 1800 }); return; }
      toast(`${T.testTxSent} · ${t.id.slice(-4)}`, { type: 'success', duration: 1800 });
    };
    q('#term-mdiag').onclick = () => toast(T.diagRunning, { type: 'info', duration: 2200, desc: T.diagDesc });
    q('#term-msave').onclick = () => {
      const v = q('#term-loc-input').value.trim();
      if (v && v !== locName(t.loc)) t.loc = v;
      m.close();
      refresh();
      toast(T.saveDone, { type: 'success', duration: 1600 });
    };
    q('#term-mtoggle').onclick = () => {
      t.state = t.state === 'disabled' ? 'on' : 'disabled';
      const nowOn = t.state === 'on';
      m.close();
      refresh();
      toast(nowOn ? T.reactivatedToast(t.model) : T.deactivatedToast(t.model), {
        type: nowOn ? 'success' : 'info',
        duration: 2200,
        desc: nowOn ? T.reactivatedDesc : T.deactivatedDesc,
      });
    };
    q('#term-mremove').onclick = () => { m.close(); openRemove(t); };
  }

  /* ── REMOVE confirmation ────────────────────────────────────────────── */
  function openRemove(t) {
    const m = modal({
      title: T.removeTitle,
      width: 420,
      desc: T.removeDesc(`${t.model} · ${locName(t.loc)}`),
      body: `
        <div style="display:flex; gap:12px; align-items:center; padding:12px; background:var(--paper-soft); border-radius:10px; border:1px solid var(--n-200);">
          <div style="width:56px; height:44px; border-radius:8px; background:var(--surface); border:1px solid var(--n-200); display:flex; align-items:center; justify-content:center; padding:5px; flex-shrink:0;">
            <img src="${t.img}" alt="" style="max-width:100%; max-height:100%; object-fit:contain;">
          </div>
          <div style="font-size:12px; color:var(--n-600);">
            <div style="font-weight:600; color:var(--ink); font-size:13px;">${esc(t.model)} · ${esc(locName(t.loc))}</div>
            <div style="font-family:var(--mono); margin-top:2px;">S/N ${esc(t.id)}</div>
          </div>
        </div>
      `,
      foot: `
        <button id="term-rcancel" class="kb ghost" style="padding:9px 16px;">${T.cancel}</button>
        <button id="term-rconfirm" class="kb danger" style="padding:9px 16px;">${T.removeCta}</button>
      `,
    });
    m.el.querySelector('#term-rcancel').onclick = () => m.close();
    m.el.querySelector('#term-rconfirm').onclick = () => {
      const i = fleet.findIndex((x) => x.id === t.id);
      if (i >= 0) fleet.splice(i, 1);
      m.close();
      refresh();
      toast(T.removedToast(t.model), { type: 'success', duration: 2000 });
    };
  }

  /* ── ADD a terminal to the fleet ────────────────────────────────────── */
  function openAdd() {
    const models = Object.keys(TERM_MODELS);
    const m = modal({
      title: T.addTitle,
      width: 460,
      desc: T.addIntro,
      body: `
        <div style="margin-bottom:13px;">
          <label style="${labelCss}" for="term-add-model">${T.modelLabel}</label>
          <select id="term-add-model" style="${fieldCss}">
            ${models.map((mm) => `<option value="${esc(mm)}">${esc(mm)}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:13px;">
          <label style="${labelCss}" for="term-add-loc">${T.locationLabel}</label>
          <input id="term-add-loc" type="text" placeholder="${esc(T.locationPlaceholder)}" style="${fieldCss}">
        </div>
        <div>
          <label style="${labelCss}" for="term-add-net">${T.networkLabel}</label>
          <select id="term-add-net" style="${fieldCss}">
            <option value="wifi">${T.wifi}</option>
            <option value="4g">${T.fourG}</option>
          </select>
        </div>
      `,
      foot: `
        <button id="term-acancel" class="kb ghost" style="padding:9px 16px;">${T.cancel}</button>
        <button id="term-asave" class="kb atlas" style="padding:9px 16px;">${T.addCta}</button>
      `,
    });
    const q = (s) => m.el.querySelector(s);
    q('#term-acancel').onclick = () => m.close();
    q('#term-asave').onclick = () => {
      const model = q('#term-add-model').value;
      const spec = TERM_MODELS[model] || TERM_MODELS['KiwiPad pro'];
      const loc = q('#term-add-loc').value.trim() || locName('comptoir');
      const net = q('#term-add-net').value === '4g' ? '4g' : 'wifi';
      const sn = `${spec.prefix}-${1000 + Math.floor(Math.random() * 8999)}`;
      fleet.push({
        id: sn, model, loc, net, img: spec.img,
        state: 'on', batt: 100, battStart: 100, fw: spec.fw,
        fwUpdate: false, txDay: 0, life: 'loaned', pulse: 0.5,
      });
      m.close();
      refresh();
      toast(T.addedToast(`${model} · ${loc}`), { type: 'success', duration: 2400, desc: T.addedDesc });
    };
  }

  /* ── render the drawer ──────────────────────────────────────────────── */
  window.Kiwi.appPage('terminaux', {
    title: T.title,
    subtitle: T.subtitle(activeCount(), fleet.length),
    body: `<div id="term-fleet">${fleetHtml()}</div>`,
  });
  const cnt0 = document.querySelector('a[data-nav="terminaux"] .count');
  if (cnt0) cnt0.textContent = String(fleet.length);

  /* ── wire actions · re-bound each open so a language switch is applied ── */
  handlers['term-test'] = (_el, id) => {
    const t = byId(id);
    if (!t) return;
    if (t.state !== 'on') { toast(T.testUnavailable, { type: 'info', duration: 1800 }); return; }
    toast(`${T.testTxSent} · ${id.slice(-4)}`, { type: 'success', duration: 1800 });
  };
  handlers['term-manage'] = (_el, id) => { const t = byId(id); if (t) openManage(t); };
  handlers['term-add'] = () => openAdd();

  /* "Demander un terminal" → hardware catalogue (ordering brand-new gear). */
  handlers['add-terminal'] = () => handlers['terminal-catalog']?.();
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 3b · CATALOGUE HARDWARE — opened from "Demander un terminal"
 *
 * 5 products on a 2-column grid. Each card: hero photo, name, price tag,
 * tagline, description, and a "Commander" CTA that toasts a confirmation.
 * ─────────────────────────────────────────────────────────────────────────── */
const CATALOG_STR = {
    fr: {
        kiwipadProTag: 'Comptoir modulaire · flagship 2026',
        kiwipadProDesc: 'Écran tactile sur pied réglable, imprimante de tickets, tiroir-caisse intégré, lecteur de carte sans fil. Design discret, modules détachables. Le poste de référence Kiwi.',
        kiwiordersProTag: 'KDS · cuisine + bar + stations',
        kiwiordersProDesc: 'Écran KDS sur bras articulé avec imprimante de tickets. Pour cuisine, bar, BBQ ou toute station de préparation reliée à la caisse principale.',
        kiwipadCashlessTag: '100 % cashless · tablette + lecteur',
        kiwipadCashlessDesc: 'Tablette tactile + lecteur de carte + imprimante. Pour commerces 100 % cashless sans gestion d\'espèces ni tiroir-caisse.',
        title: 'Demander un terminal',
        subtitle: 'Catalogue Kiwi · livraison 48h Casablanca · paiement échelonné disponible',
        heroTitle: 'CATALOGUE HARDWARE · KIWI 2026',
        heroModels: '3 modèles',
        heroKds: 'dont 1 KDS',
        heroSubtitle: "Le KiwiPad pro et le KiwiOrders pro sont prêtés gratuitement avec l'abonnement Kiwi Pro · les modèles additionnels et upgrades sont facturés.",
        flagship: 'FLAGSHIP 2026',
        order: 'Commander',
        proProgram: 'PROGRAMME PRO',
        proProgramTitle: '1 KiwiPad pro + 1 KiwiOrders pro offerts',
        proProgramDesc: "Inclus dans l'abonnement Kiwi Pro · les pièces additionnelles utilisent le tarif ci-dessus.",
        talkToAdvisor: 'Parler à un conseiller',
        orderSent: 'Commande envoyée',
        delivery: 'Livraison 48h à Casablanca',
        billing: 'facturation',
        onNextSettlement: 'sur votre prochain règlement',
        advisorNotified: 'Conseiller Kiwi notifié',
        advisorCallback: "Un membre de l'équipe vous rappellera dans la journée.",
    },
    en: {
        kiwipadProTag: 'Modular counter · 2026 flagship',
        kiwipadProDesc: 'Adjustable stand touchscreen, ticket printer, integrated cash drawer, wireless card reader. Discreet design, detachable modules. The Kiwi reference station.',
        kiwiordersProTag: 'KDS · kitchen + bar + stations',
        kiwiordersProDesc: 'KDS screen on an articulated arm with ticket printer. For kitchen, bar, BBQ or any preparation station connected to the main cash register.',
        kiwipadCashlessTag: '100% cashless · tablet + reader',
        kiwipadCashlessDesc: 'Touch tablet + card reader + printer. For 100% cashless businesses without cash management or cash drawer.',
        title: 'Request a terminal',
        subtitle: 'Kiwi Catalog · 48h delivery in Casablanca · installment payment available',
        heroTitle: 'HARDWARE CATALOG · KIWI 2026',
        heroModels: '3 models',
        heroKds: 'including 1 KDS',
        heroSubtitle: 'The KiwiPad pro and a KiwiOrders pro are loaned for free with the Kiwi Pro subscription · additional models and upgrades are billed.',
        flagship: 'FLAGSHIP 2026',
        order: 'Order',
        proProgram: 'PRO PROGRAM',
        proProgramTitle: '1 KiwiPad pro + 1 KiwiOrders pro offered',
        proProgramDesc: 'Included in the Kiwi Pro subscription · additional items use the price list above.',
        talkToAdvisor: 'Talk to an advisor',
        orderSent: 'Order sent',
        delivery: '48h delivery in Casablanca',
        billing: 'billing',
        onNextSettlement: 'on your next settlement',
        advisorNotified: 'Kiwi advisor notified',
        advisorCallback: 'A team member will call you back during the day.',
    },
    ar: {
        kiwipadProTag: 'كاونتر معياري · الرائد 2026',
        kiwipadProDesc: 'شاشة لمس على حامل قابل للتعديل، طابعة إيصالات، درج نقود مدمج، قارئ بطاقات لاسلكي. تصميم بسيط، وحدات قابلة للفصل. محطة كيوي المرجعية.',
        kiwiordersProTag: 'KDS · مطبخ + بار + محطات',
        kiwiordersProDesc: 'شاشة KDS على ذراع مفصلي مع طابعة إيصالات. للمطبخ، البار، الشواء أو أي محطة تحضير متصلة بالصندوق الرئيسي.',
        kiwipadCashlessTag: '100٪ غير نقدي · جهاز لوحي + قارئ',
        kiwipadCashlessDesc: 'جهاز لوحي يعمل باللمس + قارئ بطاقات + طابعة. للشركات غير النقدية 100٪ بدون إدارة نقدية أو درج نقود.',
        title: 'طلب جهاز طرفي',
        subtitle: 'كتالوج كيوي · توصيل خلال 48 ساعة في الدار البيضاء · الدفع بالتقسيط متاح',
        heroTitle: 'كتالوج الأجهزة · كيوي 2026',
        heroModels: '3 موديلات',
        heroKds: 'منها 1 KDS',
        heroSubtitle: 'يتم إعارة KiwiPad pro و KiwiOrders pro مجانًا مع اشتراك Kiwi Pro · تتم فوترة الموديلات الإضافية والترقيات.',
        flagship: 'رائد 2026',
        order: 'اطلب',
        proProgram: 'برنامج PRO',
        proProgramTitle: '1 KiwiPad pro + 1 KiwiOrders pro مجانًا',
        proProgramDesc: 'مضمن في اشتراك Kiwi Pro · تستخدم العناصر الإضافية قائمة الأسعار أعلاه.',
        talkToAdvisor: 'تحدث إلى مستشار',
        orderSent: 'تم إرسال الطلب',
        delivery: 'توصيل خلال 48 ساعة في الدار البيضاء',
        billing: 'فوترة',
        onNextSettlement: 'على تسويتك التالية',
        advisorNotified: 'تم إشعار مستشار كيوي',
        advisorCallback: 'سيتصل بك أحد أعضاء الفريق خلال اليوم.',
    },
};
handlers['terminal-catalog'] = () => {
  const T = CATALOG_STR[trLang()] || CATALOG_STR.fr;
  const CATALOG = [
    {
      sku: 'kiwipad-pro', name: 'KiwiPad pro', price: '300 €',
      img: 'Hardware_pictures/Hardware_4.png',
      tag: T.kiwipadProTag,
      desc: T.kiwipadProDesc,
      featured: true,
    },
    {
      sku: 'kiwiorders-pro', name: 'KiwiOrders pro', price: '200 €',
      img: 'Hardware_pictures/Hardware_KDS1.png',
      tag: T.kiwiordersProTag,
      desc: T.kiwiordersProDesc,
    },
    {
      sku: 'kiwipad-cashless', name: 'KiwiPad cashless', price: '100 €',
      img: 'Hardware_pictures/Hardware_2.png',
      tag: T.kiwipadCashlessTag,
      desc: T.kiwipadCashlessDesc,
    },
  ];

  drawer({
    title: T.title,
    subtitle: T.subtitle,
    width: 880,
    body: `
      <div class="p-hero">
        <div class="l">${T.heroTitle}</div>
        <div class="big" style="font-size:26px;">${T.heroModels} <span style="font-size:16px; opacity:0.75;">· ${T.heroKds}</span></div>
        <div class="sub">${T.heroSubtitle}</div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px;">
        ${CATALOG.map(p => `
          <div class="p-card" style="margin:0; padding:0; overflow:hidden; background:var(--surface); ${p.featured ? 'grid-column:1 / -1; display:grid; grid-template-columns:1.1fr 1fr;' : ''} border:1px solid ${p.featured ? 'rgba(11,110,79,0.22)' : 'var(--n-200)'}; ${p.featured ? 'box-shadow:0 1px 0 rgba(11,110,79,0.06), 0 14px 32px -18px rgba(11,110,79,0.22);' : ''}">
            <div style="position:relative; ${p.featured ? 'aspect-ratio:auto; min-height:260px;' : 'aspect-ratio:5/3;'} background:var(--paper-soft); display:flex; align-items:center; justify-content:center; padding:${p.featured ? '20' : '14'}px; ${p.featured ? 'border-right:1px solid var(--n-200);' : 'border-bottom:1px solid var(--n-200);'}">
              <img src="${p.img}" alt="${p.name}" style="max-width:100%; max-height:100%; object-fit:contain; display:block;" loading="lazy">
              ${p.featured ? `<span class="chip" style="position:absolute; top:12px; left:12px; background:var(--ink); color:var(--mint); font-size:10px; padding:4px 10px; letter-spacing:0.08em;">${T.flagship}</span>` : ''}
              <span style="position:absolute; top:${p.featured ? '12' : '10'}px; right:${p.featured ? '12' : '10'}px; background:var(--surface); border:1px solid var(--n-200); border-radius:999px; padding:4px 10px; font-family:var(--mono); font-size:12px; font-weight:600; color:var(--ink);">${p.price}</span>
            </div>
            <div style="padding:${p.featured ? '20px 22px' : '14px 16px 16px'}; display:flex; flex-direction:column;">
              <h4 style="margin:0 0 4px; font-size:${p.featured ? '20' : '15.5'}px; letter-spacing:-0.015em;">${p.name}</h4>
              <div style="font-family:var(--mono); font-size:${p.featured ? '11' : '10.5'}px; color:var(--atlas); letter-spacing:0.06em; text-transform:uppercase; margin-bottom:10px;">${p.tag}</div>
              <p style="margin:0 0 14px; font-size:${p.featured ? '13.5' : '12.5'}px; color:var(--n-600); line-height:1.55; flex:1;">${p.desc}</p>
              <button class="kb ${p.featured ? 'atlas' : 'ghost'}" data-action="catalog-order" data-arg="${p.sku}" style="width:100%; justify-content:center; padding:${p.featured ? '10px 16px' : '8px 12px'}; font-size:${p.featured ? '13' : '12.5'}px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18l-2 13H5L3 3z"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg>
                ${T.order} · ${p.price}
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <div style="padding:16px 18px; background:var(--inverse-surface); color:var(--inverse-ink); border-radius:14px;">
        <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
          <div style="flex:1; min-width:240px;">
            <div style="font-family:var(--mono); font-size:10px; letter-spacing:0.12em; color:var(--mint); margin-bottom:4px;">${T.proProgram}</div>
            <div style="font-size:14px; font-weight:600;">${T.proProgramTitle}</div>
            <div style="font-size:12px; color:#a7d5b9; margin-top:3px;">${T.proProgramDesc}</div>
          </div>
          <button class="kb" data-action="contact-sales" style="background:var(--mint); color:var(--riad); padding:9px 16px; font-size:12.5px; font-weight:600;">${T.talkToAdvisor}</button>
        </div>
      </div>
    `,
  });

  if (!handlers['catalog-order']) {
    handlers['catalog-order'] = (_el, sku) => {
      const p = CATALOG.find(x => x.sku === sku);
      if (!p) return;
      toast(`${T.orderSent} · ${p.name}`, { type: 'success', duration: 2200, desc: `${T.delivery} · ${T.billing} ${p.price} ${T.onNextSettlement}.` });
    };
  }
  if (!handlers['contact-sales']) {
    handlers['contact-sales'] = () => toast(T.advisorNotified, { type: 'info', duration: 1800, desc: T.advisorCallback });
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 4 · RÈGLEMENTS · settlements ledger + 30-day cash-flow forecast
 * ─────────────────────────────────────────────────────────────────────────── */
const REGLEMENTS_STR = {
    fr: {
        settlements: 'Règlements',
        subtitle: (month, year, bank, acct, percent) => `${month} ${year} · ${bank} ••${acct} · T+1 · ${percent}% à l'heure`,
        settledThisMonth: 'RÉGLÉ CE MOIS',
        settlementsCount: (count) => `${count} versements`,
        savingsVsCmi: 'économie vs CMI',
        cashflow30d: 'Cash-flow · 30 jours',
        history14d: 'Historique 14 j · projection IA 16 j à venir',
        upcoming16d: 'à venir 16 j',
        today: 'AUJ.',
        nextT1: 'PROCHAIN T+1',
        tomorrow9am: 'Demain 9h00',
        settleNow: 'Régler maintenant',
        commissions: 'COMMISSIONS',
        blended: 'blended',
        savingsVsCmiTitle: 'ÉCONOMIE vs CMI',
        vsTpeRental: 'Vs 2,0 % + loc TPE',
        linkedBankAccounts: 'Comptes bancaires liés',
        addIban: '+ IBAN',
        mainAccount: 'Compte principal · 100 % du flux',
        backupAccount: 'Backup · 0 % flux configuré',
        reconciled: 'Rapproché',
        pending: 'En attente',
        details: 'Détails',
        settlementDetail: (date) => `Détail du règlement de demain (${date})`,
        grossVolume: 'Volume brut',
        orders: 'commandes',
        visaMcInterchange: 'Interchange Visa/MC',
        kiwiNetworkFees: 'Frais réseau Kiwi',
        vatOnFees: 'TVA sur frais',
        netPaid: 'Net versé',
        recentHistory: 'Historique récent',
        settled: 'Réglé',
        instantTransfer: 'Virement instantané · weekend',
        exportPdf: 'Export PDF',
        exportCsv: 'Export CSV',
        accountingPackage: 'Pack comptable',
        instantSettlementToast: (amount) => `Règlement instantané · ${amount} MAD viré`,
        addIbanToast: 'Ajouter un IBAN, flux KYC bientôt',
        ibanDetailsToast: 'Détails du compte',
        pdfExportToast: 'Export PDF généré · téléchargement en cours',
        csvExportToast: (lines) => `Export CSV généré · ${lines} lignes`,
        accountingPackageToast: 'Pack comptable · envoyé à votre expert-comptable',
    },
    en: {
        settlements: 'Settlements',
        subtitle: (month, year, bank, acct, percent) => `${month} ${year} · ${bank} ••${acct} · T+1 · ${percent}% on time`,
        settledThisMonth: 'SETTLED THIS MONTH',
        settlementsCount: (count) => `${count} settlements`,
        savingsVsCmi: 'savings vs CMI',
        cashflow30d: 'Cash-flow · 30 days',
        history14d: '14-day history · 16-day AI projection',
        upcoming16d: 'upcoming 16 d',
        today: 'TODAY',
        nextT1: 'NEXT T+1',
        tomorrow9am: 'Tomorrow 9:00 AM',
        settleNow: 'Settle now',
        commissions: 'COMMISSIONS',
        blended: 'blended',
        savingsVsCmiTitle: 'SAVINGS vs CMI',
        vsTpeRental: 'Vs 2.0% + POS rental',
        linkedBankAccounts: 'Linked bank accounts',
        addIban: '+ IBAN',
        mainAccount: 'Main account · 100% of flow',
        backupAccount: 'Backup · 0% flow configured',
        reconciled: 'Reconciled',
        pending: 'Pending',
        details: 'Details',
        settlementDetail: (date) => `Settlement detail for tomorrow (${date})`,
        grossVolume: 'Gross volume',
        orders: 'orders',
        visaMcInterchange: 'Visa/MC Interchange',
        kiwiNetworkFees: 'Kiwi network fees',
        vatOnFees: 'VAT on fees',
        netPaid: 'Net paid',
        recentHistory: 'Recent history',
        settled: 'Settled',
        instantTransfer: 'Instant transfer · weekend',
        exportPdf: 'Export PDF',
        exportCsv: 'Export CSV',
        accountingPackage: 'Accounting package',
        instantSettlementToast: (amount) => `Instant settlement · ${amount} MAD transferred`,
        addIbanToast: 'Add an IBAN, KYC flow coming soon',
        ibanDetailsToast: 'Account details',
        pdfExportToast: 'PDF Export generated · download in progress',
        csvExportToast: (lines) => `CSV Export generated · ${lines} lines`,
        accountingPackageToast: 'Accounting package · sent to your accountant',
    },
    ar: {
        settlements: 'التسويات',
        subtitle: (month, year, bank, acct, percent) => `${month} ${year} · ${bank} ••${acct} · T+1 · ${percent}% في الوقت المحدد`,
        settledThisMonth: 'تمت تسويته هذا الشهر',
        settlementsCount: (count) => `${count} تسويات`,
        savingsVsCmi: 'التوفير مقابل CMI',
        cashflow30d: 'التدفق النقدي · 30 يومًا',
        history14d: 'سجل 14 يومًا · توقعات الذكاء الاصطناعي لـ 16 يومًا قادمة',
        upcoming16d: 'قادم في 16 يومًا',
        today: 'اليوم',
        nextT1: 'T+1 التالي',
        tomorrow9am: 'غدًا 9:00 صباحًا',
        settleNow: 'تسوية الآن',
        commissions: 'العمولات',
        blended: 'مخلوط',
        savingsVsCmiTitle: 'التوفير مقابل CMI',
        vsTpeRental: 'مقابل 2.0٪ + إيجار TPE',
        linkedBankAccounts: 'الحسابات المصرفية المرتبطة',
        addIban: '+ IBAN',
        mainAccount: 'الحساب الرئيسي · 100٪ من التدفق',
        backupAccount: 'حساب احتياطي · 0٪ تدفق مهيأ',
        reconciled: 'تمت التسوية',
        pending: 'قيد الانتظار',
        details: 'التفاصيل',
        settlementDetail: (date) => `تفاصيل تسوية الغد (${date})`,
        grossVolume: 'الحجم الإجمالي',
        orders: 'طلبات',
        visaMcInterchange: 'رسوم فيزا/ماستركارد',
        kiwiNetworkFees: 'رسوم شبكة كيوي',
        vatOnFees: 'ضريبة القيمة المضافة على الرسوم',
        netPaid: 'صافي المبلغ المدفوع',
        recentHistory: 'السجل الحديث',
        settled: 'تمت التسوية',
        instantTransfer: 'تحويل فوري · عطلة نهاية الأسبوع',
        exportPdf: 'تصدير PDF',
        exportCsv: 'تصدير CSV',
        accountingPackage: 'حزمة المحاسبة',
        instantSettlementToast: (amount) => `تسوية فورية · ${amount} درهم محوّل`,
        addIbanToast: 'إضافة IBAN، تدفق KYC قريبًا',
        ibanDetailsToast: 'تفاصيل الحساب',
        pdfExportToast: 'تم إنشاء تصدير PDF · التنزيل قيد التقدم',
        csvExportToast: (lines) => `تم إنشاء تصدير CSV · ${lines} أسطر`,
        accountingPackageToast: 'حزمة المحاسبة · أرسلت إلى محاسبك',
    },
};
handlers['nav-reglements'] = () => {
  // 30-day forecast — historical 14 days (solid) + 16 days projected (dashed)
  const days = 30;
  const fc = [];
  let base = 18000;
  for (let i = 0; i < days; i++) {
    const dow = (i + 3) % 7; // mon=0..sun=6
    const weekendBoost = dow >= 4 ? 1.18 : 1.0;
    const drift = base + Math.sin(i / 4) * 2200 + (Math.random() - 0.5) * 1800;
    fc.push(Math.round(drift * weekendBoost));
  }
  const W = 660, H = 110, pad = 6;
  const max = Math.max(...fc), min = Math.min(...fc);
  const x = (i) => pad + (i / (days - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const histPts = fc.slice(0, 14).map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const projPts = fc.slice(13).map((v, i) => `${x(i + 13)},${y(v)}`).join(' ');
  const areaPts = `${pad},${H - pad} ${histPts} ${x(13)},${H - pad}`;
  const totalProj = fc.slice(14).reduce((a, b) => a + b, 0);

  const T = REGLEMENTS_STR[trLang()] || REGLEMENTS_STR.fr;

  const settles = [
    ['28 avril', '29 941,13', `${T.settled} · Bank of Africa ••3291`, 'ok'],
    ['27 avril', '24 102,80', `${T.settled} · Bank of Africa ••3291`, 'ok'],
    ['26 avril', '22 850,40', `${T.instantTransfer}`, 'ok'],
    ['25 avril', '21 688,15', `${T.settled} · Bank of Africa ••3291`, 'ok'],
    ['24 avril', '17 290,60', `${T.settled} · Bank of Africa ••3291`, 'ok'],
    ['23 avril', '19 824,25', `${T.settled} · Bank of Africa ••3291`, 'ok'],
    ['22 avril', '23 091,50', `${T.settled} · Bank of Africa ••3291`, 'ok'],
  ];

  drawer({
    title: T.settlements,
    subtitle: T.subtitle('Avril', '2026', 'Bank of Africa', '3291', '99,2'),
    width: 760,
    body: `
      <div class="p-hero">
        <div class="l">RÉGLÉ CE MOIS</div>
        <div class="big">347 280 <span style="font-size:18px; opacity:0.7;">MAD</span></div>
        <div class="sub">22 versements · économie vs CMI : +5 240 MAD ce mois</div>
      </div>

      <div class="p-card" style="background:var(--surface); padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:6px;">
          <div>
            <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); text-transform:uppercase;">Cash-flow · 30 jours</div>
            <div style="font-size:13px; color:var(--n-600); margin-top:3px;">Historique 14 j · projection IA 16 j à venir</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--mono); font-size:18px; font-weight:600; color:var(--atlas); letter-spacing:-0.015em;">+${totalProj.toLocaleString('fr-FR').replace(/,/g, ' ')} MAD</div>
            <div style="font-size:11px; color:var(--n-500);">à venir 16 j</div>
          </div>
        </div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block; margin-top:8px;">
          <defs><linearGradient id="cf-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--atlas)" stop-opacity="0.18"/><stop offset="1" stop-color="var(--atlas)" stop-opacity="0"/></linearGradient></defs>
          <polygon points="${areaPts}" fill="url(#cf-grad)"/>
          <polyline points="${histPts}" fill="none" stroke="var(--atlas)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="${projPts}" fill="none" stroke="var(--atlas)" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round" stroke-opacity="0.6"/>
          <line x1="${x(13)}" y1="${pad}" x2="${x(13)}" y2="${H-pad}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="2 3" opacity="0.4"/>
          <circle cx="${x(13)}" cy="${y(fc[13])}" r="3.5" fill="var(--atlas)"/>
          <text x="${x(13)+6}" y="${pad+12}" font-family="var(--mono)" font-size="9" fill="var(--n-500)" letter-spacing="0.06em">AUJ.</text>
        </svg>
      </div>

      <div style="background:var(--paper-soft); border-radius:14px; padding:16px; margin:10px 0; display:grid; grid-template-columns:1fr 1fr 1fr; gap:18px;">
        <div>
          <div style="font-size:10.5px; color:var(--n-500); letter-spacing:0.08em; font-family:var(--mono);">PROCHAIN T+1</div>
          <div style="font-size:21px; font-weight:600; margin-top:4px; letter-spacing:-0.02em;">23 091 MAD</div>
          <div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">Demain 9h00</div>
          <button class="kb atlas" data-action="settle-now" style="margin-top:10px; padding:6px 12px; font-size:12px;">Régler maintenant</button>
        </div>
        <div>
          <div style="font-size:10.5px; color:var(--n-500); letter-spacing:0.08em; font-family:var(--mono);">COMMISSIONS</div>
          <div style="font-size:21px; font-weight:600; margin-top:4px; color:var(--danger); letter-spacing:-0.02em;">−4 128 MAD</div>
          <div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">1,18 % blended</div>
        </div>
        <div>
          <div style="font-size:10.5px; color:var(--n-500); letter-spacing:0.08em; font-family:var(--mono);">ÉCONOMIE vs CMI</div>
          <div style="font-size:21px; font-weight:600; margin-top:4px; color:var(--atlas); letter-spacing:-0.02em;">+5 240 MAD</div>
          <div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">Vs 2,0 % + loc TPE</div>
        </div>
      </div>

      <div class="p-card" style="background:var(--surface); padding:16px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:13px; font-weight:600;">Comptes bancaires liés</div>
          <button class="kb ghost" data-action="add-iban" style="padding:5px 10px; font-size:11.5px;">+ IBAN</button>
        </div>
        ${[
          ['Bank of Africa', '••3291', 'Compte principal · 100 % du flux', 'ok', 'Rapproché'],
          ['Attijariwafa', '••8104', 'Backup · 0 % flux configuré', 'neutral', 'En attente'],
        ].map(([b, m, d, st, lbl]) => `
          <div style="display:grid; grid-template-columns:auto 1fr auto auto; gap:14px; padding:11px 0; border-top:1px solid var(--n-200); align-items:center;">
            <div style="width:32px; height:32px; border-radius:8px; background:var(--ink); color:var(--mint); display:flex; align-items:center; justify-content:center; font-family:var(--mono); font-size:10px; font-weight:600;">${b.slice(0,2).toUpperCase()}</div>
            <div>
              <div style="font-weight:500; font-size:13.5px;">${b} <span style="color:var(--n-500); font-family:var(--mono); font-size:12px;">${m}</span></div>
              <div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">${d}</div>
            </div>
            <span class="chip ${st}">${lbl}</span>
            <button class="kb ghost" data-action="iban-detail" style="padding:5px 9px; font-size:11px;">Détails</button>
          </div>
        `).join('')}
      </div>

      <div class="p-card" style="background:var(--surface); padding:16px; margin-bottom:10px;">
        <div style="font-size:13px; font-weight:600; margin-bottom:10px;">Détail du règlement de demain (28 avril → 29 avril)</div>
        <table class="p-table">
          <tbody>
            <tr><td>Volume brut · 142 commandes</td><td class="mono right">+23 484,80 MAD</td></tr>
            <tr><td style="color:var(--n-500);">Interchange Visa/MC (1,18 %)</td><td class="mono right" style="color:var(--danger);">−277,12 MAD</td></tr>
            <tr><td style="color:var(--n-500);">Frais réseau Kiwi (0,30 %)</td><td class="mono right" style="color:var(--danger);">−70,45 MAD</td></tr>
            <tr><td style="color:var(--n-500);">TVA sur frais</td><td class="mono right" style="color:var(--danger);">−46,23 MAD</td></tr>
            <tr style="border-top:2px solid var(--ink);"><td><b>Net versé · Bank of Africa ••3291</b></td><td class="mono right"><b style="color:var(--atlas); font-size:15px;">23 091,00 MAD</b></td></tr>
          </tbody>
        </table>
      </div>

      <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); text-transform:uppercase; margin:14px 0 8px;">Historique récent</div>
      <div style="background:var(--surface); border:1px solid var(--n-200); border-radius:12px; padding:6px 14px;">
        ${settles.map(([d, a, s, st]) => `
          <div style="display:grid; grid-template-columns:110px 1fr 180px 90px; gap:14px; padding:11px 0; border-top:1px solid var(--n-200); align-items:center; font-size:13px;">
            <b>${d}</b>
            <span class="mono" style="font-family:var(--mono); font-weight:500;">${a} MAD</span>
            <span style="color:var(--n-500); font-size:11.5px;">${s}</span>
            <span style="text-align:right;"><span class="chip ${st}">${st === 'ok' ? 'Réglé' : 'Attente'}</span></span>
          </div>
        `).join('')}
      </div>

      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="kb ghost" data-action="export-pdf" style="flex:1; justify-content:center; padding:10px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>Export PDF</button>
        <button class="kb ghost" data-action="export-csv" style="flex:1; justify-content:center; padding:10px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Export CSV</button>
        <button class="kb atlas" data-action="export-comptable" style="flex:1; justify-content:center; padding:10px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M3 12h18"/></svg>Pack comptable</button>
      </div>
    `,
  });

  if (!handlers['settle-now']) handlers['settle-now'] = () => toast('Règlement instantané · 23 091 MAD viré', { type: 'success', duration: 2200 });
  if (!handlers['add-iban']) handlers['add-iban'] = () => toast('Ajouter un IBAN, flux KYC bientôt', { type: 'info', duration: 1600 });
  if (!handlers['iban-detail']) handlers['iban-detail'] = () => toast('Détails du compte', { type: 'info', duration: 1400 });
  if (!handlers['export-pdf']) handlers['export-pdf'] = () => toast('Export PDF généré · téléchargement en cours', { type: 'success', duration: 1800 });
  if (!handlers['export-csv']) handlers['export-csv'] = () => toast('Export CSV généré · 22 lignes', { type: 'success', duration: 1800 });
  if (!handlers['export-comptable']) handlers['export-comptable'] = () => toast('Pack comptable · envoyé à votre expert-comptable', { type: 'success', duration: 2200 });
};
})();

/* ═══ Section 1B · conformite / equipe / payroll / reservations ═══ */
(function() {
  "use strict";
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
/* ════════════════════════════════════════════════════════════════════════════
 * Kiwi · sidebar handlers · S1B polish pass
 * Investor-demo quality drawers for: nav-conformite · nav-equipe ·
 * nav-payroll · nav-reservations.
 * Drop-in replacements for the existing handlers. CTAs route through toasts;
 * markup IS the deliverable.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ═══════════════════ CONFORMITÉ ═══════════════════ */
const CONFORMITE_STR = {
    fr: {
        title: 'Conformité & sécurité',
        subtitle: (name) => `${name} · registres et pièces administratives`,
        scoreTitle: 'SCORE DE CONFORMITÉ',
        score: '100 / 100 · AAA',
        scoreDesc: 'Pièces administratives, déclarations et échéances suivies dans Kiwi.',
        reportPdf: 'Rapport PDF',
        kycDocs: 'Coffre KYC documentaire',
        kycDocsSub: '6 documents · suivi des échéances · re-upload en 1 clic',
        upload: 'Téléverser',
        doc: 'DOCUMENT',
        ref: 'RÉFÉRENCE',
        status: 'STATUT',
        expires: 'ÉCHÉANCE',
        reupload: 'Re-upload',
        amlScreening: 'Screening AML / PEP',
        amlScreeningSub: 'Dernier scan il y a 6 min · prochain scan 18:00',
        live: 'Live',
        noMatch: 'Aucun match',
        declarationsCalendar: 'Calendrier déclarations BAM & DGI',
        declarationsCalendarSub: '3 échéances dans les 30 jours',
        auditLog: "Journal d'audit · loi 09-08 / RGPD",
        auditLogSub: 'Toute action sensible enregistrée · 7 ans de rétention',
        exportSignedCsv: 'Exporter CSV signé',
        secretsRotation: 'Rotation des secrets',
        secretsRotationSub: 'Clés API · webhooks · tokens · HSM ledger',
        manualRotation: 'Rotation manuelle',
        uploadKycToast: 'Téléverser un document KYC',
        uploadKycToastDesc: 'Glissez le PDF/JPEG · OCR + vérification automatique en 30 s.',
        reuploadKycToast: 'Re-upload document',
        reuploadKycToastDesc: 'Sélectionnez le nouveau fichier · ancienne version archivée 7 ans.',
        calendarExportToast: 'Calendrier .ics exporté',
        calendarExportToastDesc: 'Importable dans Google Calendar, Outlook, Apple Calendar.',
        auditExportToast: 'Export CSV signé',
        auditExportToastDesc: 'Export horodaté, à conserver avec vos pièces comptables.',
        rotateSecretToast: 'Rotation manuelle initiée',
        rotateSecretToastDesc: 'Nouveau secret généré · ancien valide 24 h pour transition.',
    },
    en: {
        title: 'Compliance & Security',
        subtitle: (name) => `${name} · records and administrative documents`,
        scoreTitle: 'COMPLIANCE SCORE',
        score: '100 / 100 · AAA',
        scoreDesc: 'Administrative documents, filings and deadlines tracked in Kiwi.',
        reportPdf: 'PDF Report',
        kycDocs: 'KYC Document Vault',
        kycDocsSub: '6 documents · deadline tracking · 1-click re-upload',
        upload: 'Upload',
        doc: 'DOCUMENT',
        ref: 'REFERENCE',
        status: 'STATUS',
        expires: 'EXPIRATION',
        reupload: 'Re-upload',
        amlScreening: 'AML / PEP Screening',
        amlScreeningSub: 'Last scan 6 min ago · next scan 6:00 PM',
        live: 'Live',
        noMatch: 'No match',
        declarationsCalendar: 'BAM & DGI Declarations Calendar',
        declarationsCalendarSub: '3 deadlines within 30 days',
        auditLog: 'Audit Log · Law 09-08 / GDPR',
        auditLogSub: 'All sensitive actions recorded · 7-year retention',
        exportSignedCsv: 'Export Signed CSV',
        secretsRotation: 'Secrets Rotation',
        secretsRotationSub: 'API keys · webhooks · tokens · HSM ledger',
        manualRotation: 'Manual Rotation',
        uploadKycToast: 'Upload a KYC document',
        uploadKycToastDesc: 'Drag and drop the PDF/JPEG · OCR + automatic verification in 30s.',
        reuploadKycToast: 'Re-upload document',
        reuploadKycToastDesc: 'Select the new file · old version archived for 7 years.',
        calendarExportToast: 'Calendar .ics exported',
        calendarExportToastDesc: 'Importable into Google Calendar, Outlook, Apple Calendar.',
        auditExportToast: 'Signed CSV Export',
        auditExportToastDesc: 'Timestamped export, keep it with your accounting records.',
        rotateSecretToast: 'Manual rotation initiated',
        rotateSecretToastDesc: 'New secret generated · old one valid for 24h for transition.',
    },
    ar: {
        title: 'الامتثال والأمان',
        subtitle: (name) => `${name} · امتثال 100٪ · تم اجتياز تدقيق بنك المغرب`,
        scoreTitle: 'درجة الامتثال',
        score: '100 / 100 · AAA',
        scoreDesc: 'الوثائق الإدارية والتصاريح والآجال متتبَّعة في كيوي.',
        reportPdf: 'تقرير PDF',
        kycDocs: 'خزنة مستندات اعرف عميلك',
        kycDocsSub: '6 مستندات · تتبّع الآجال · إعادة تحميل بنقرة واحدة',
        upload: 'تحميل',
        doc: 'المستند',
        ref: 'المرجع',
        status: 'الحالة',
        expires: 'انتهاء الصلاحية',
        reupload: 'إعادة تحميل',
        amlScreening: 'فحص مكافحة غسيل الأموال / PEP',
        amlScreeningSub: 'آخر فحص قبل 6 دقائق · الفحص التالي 6:00 مساءً',
        live: 'مباشر',
        noMatch: 'لا يوجد تطابق',
        declarationsCalendar: 'تقويم إعلانات بنك المغرب و DGI',
        declarationsCalendarSub: '3 مواعيد نهائية خلال 30 يومًا',
        auditLog: 'سجل التدقيق · قانون 09-08 / GDPR',
        auditLogSub: 'جميع الإجراءات الحساسة مسجلة · الاحتفاظ لمدة 7 سنوات',
        exportSignedCsv: 'تصدير CSV موقع',
        secretsRotation: 'تدوير الأسرار',
        secretsRotationSub: 'مفاتيح API · webhooks · الرموز · دفتر الأستاذ HSM',
        manualRotation: 'تدوير يدوي',
        uploadKycToast: 'تحميل مستند KYC',
        uploadKycToastDesc: 'اسحب وأفلت ملف PDF/JPEG · OCR + تحقق تلقائي في 30 ثانية.',
        reuploadKycToast: 'إعادة تحميل المستند',
        reuploadKycToastDesc: 'حدد الملف الجديد · يتم أرشفة الإصدار القديم لمدة 7 سنوات.',
        calendarExportToast: 'تم تصدير تقويم .ics',
        calendarExportToastDesc: 'يمكن استيراده إلى تقويم Google و Outlook و Apple Calendar.',
        auditExportToast: 'تصدير CSV موقع',
        auditExportToastDesc: 'تصدير مؤرَّخ، احتفظ به مع مستنداتك المحاسبية.',
        rotateSecretToast: 'بدء التدوير اليدوي',
        rotateSecretToastDesc: 'تم إنشاء سر جديد · القديم صالح لمدة 24 ساعة للانتقال.',
    },
};
/* ⚠ DEAD CODE — superseded. dashboard.html loads assets/conformite.js AFTER
 * this file, and conformite.js reassigns handlers['nav-conformite'] to the
 * operational compliance page (Clôture Z / HACCP / Équipements / Documents).
 * Nothing below can render. Kept only because CONFORMITE_STR still feeds a
 * few sibling handlers; the regulator-attribution copy has been neutralised
 * so a future re-enable cannot resurrect claims Kiwi cannot make.
 * Delete candidate — see the compliance-claims sweep. */
handlers['nav-conformite'] = () => {
  const v = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Café Atlas', type: 'restaurant' };
  const T = CONFORMITE_STR[trLang()] || CONFORMITE_STR.fr;
  const docs = [
    ['CIN gérant', 'Rachid Benhima · BK 384721', 'Expire dans 14 mois', 'ok', '14 mars 2027'],
    ['Registre de commerce', 'RC Tanger · 3847821', 'Renouvelé · valide 12 mois', 'ok', '20 janv. 2027'],
    ['Patente professionnelle', 'Article 21 · TPE Tanger', 'Expire dans 47 jours', 'pend', '15 juin 2026'],
    ['ICE', '00284912000089 · DGI', 'Permanent · vérifié', 'ok', '—'],
    ['Attestation CNSS', 'Affiliation 9 281 037', 'À jour · payée le 12 avril', 'ok', 'Trim. suivant'],
    ['Quittance TVA · Q1 2026', 'Régime du réel · trimestriel', 'À déposer dans 6 jours', 'pend', '5 mai 2026'],
  ];
  const aml = [
    ['UN sanctions', T.noMatch, `14:02 ${T.today}`],
    ['EU consolidated', T.noMatch, `14:02 ${T.today}`],
    ['OFAC SDN', T.noMatch, `14:02 ${T.today}`],
    ['ANRF Maroc · PEP', T.noMatch, `14:02 ${T.today}`],
  ];
  const audit = [
    ['14:02', 'Screening AML automatique', 'Système · 4 listes', 'ok'],
    ['09:18', 'Export ledger anonymisé', 'badromail9@kiwi.ma', 'ok'],
    ['Hier 23:11', 'Rotation token webhook', 'Système · cron', 'ok'],
    ['Hier 18:44', 'Accès données client (RGPD art. 15)', 'Sara L. · demande satisfaite', 'ok'],
    ['22 avril', 'Audit trail exporté pour DGI', 'Comptable Hassani', 'ok'],
    ['18 avril', 'Tentative login refusée · IP RU', 'Mehdi M. · alerte WhatsApp', 'ref'],
    ['12 avril', 'Mise à jour politique de confidentialité', 'CNDP · loi 09-08', 'ok'],
  ];
  const secrets = [
    ['Clé API publique', 'pk_live_kw_••••a921', 'Rotation auto · 90 jours', '12 jours', 'ok'],
    ['Webhook signing secret', 'whsec_••••2f30', 'Rotée hier 23:11', '< 1 jour', 'ok'],
    ['Token agent mode', 'agt_••••4c81', 'Rotation manuelle requise', '84 jours', 'pend'],
    ['Clé chiffrement ledger', 'KMS · n+one Casa', 'HSM · rotation annuelle', '6 mois', 'ok'],
  ];
  drawer({
    title: T.title,
    subtitle: T.subtitle(v.name),
    width: 880,
    body: `
      <div class="comp-score">
        <div class="ring">
          <svg viewBox="0 0 42 42">
            <circle cx="21" cy="21" r="17" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="4"/>
            <circle cx="21" cy="21" r="17" fill="none" stroke="var(--mint)" stroke-width="4" stroke-dasharray="100 107" stroke-dashoffset="25" transform="rotate(-90 21 21)" stroke-linecap="round"/>
          </svg>
          <div class="c">AAA</div>
        </div>
        <div>
          <div class="t">${T.scoreTitle}</div>
          <div class="v">${T.score}</div>
          <div class="d">${T.scoreDesc}</div>
        </div>
        <button class="kb" data-action="download-kit" style="background:var(--mint); color:var(--riad); padding:9px 14px; font-size:12.5px; align-self:center;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M5 10l7 7 7-7M5 21h14"/></svg>${T.reportPdf}
        </button>
      </div>

      <div class="sh-section">
        <div class="sh-section-head">
          <div><h4>${T.kycDocs}</h4><div class="sub">${T.kycDocsSub}</div></div>
          <button class="kb ghost" data-action="upload-kyc">+ ${T.upload}</button>
        </div>
        <table class="p-table">
          <thead><tr><th>${T.doc}</th><th>${T.ref}</th><th>${T.status}</th><th class="right">${T.expires}</th><th></th></tr></thead>
          <tbody>
            ${docs.map(([n, ref, s, st, exp]) => `
              <tr>
                <td><b>${n}</b></td>
                <td style="color:var(--n-500); font-size:12px;">${ref}</td>
                <td><span class="chip ${st}">${s}</span></td>
                <td class="mono right" style="font-size:12px;">${exp}</td>
                <td class="right"><button class="kb ghost" data-action="kyc-replace" style="padding:5px 9px; font-size:11px;">${T.reupload}</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="sh-grid-2">
        <div class="sh-section" style="margin-bottom:12px;">
          <div class="sh-section-head" style="margin-bottom:10px;">
            <div><h4>${T.amlScreening}</h4><div class="sub">${T.amlScreeningSub}</div></div>
            <span class="chip ok">${T.live}</span>
          </div>
          ${aml.map(([list, res, t]) => `
            <div style="display:grid; grid-template-columns:1fr auto auto; gap:12px; align-items:center; padding:10px 0; border-top:1px solid var(--n-200); font-size:12.5px;">
              <div><b>${list}</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">${t}</div></div>
              <span class="chip ok" style="font-size:10.5px;">${res}</span>
            </div>
          `).join('')}
          <div class="rc-foot" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--n-200); font-size:11.5px; color:var(--n-500); line-height:1.45;">
            Continu · scan toutes les 4 h sur la base clients & équipe. Alertes WhatsApp + email aux dirigeants.
          </div>
        </div>

        <div class="sh-section" style="margin-bottom:12px;">
          <div class="sh-section-head" style="margin-bottom:10px;">
            <div><h4>${T.declarationsCalendar}</h4><div class="sub">${T.declarationsCalendarSub}</div></div>
            <button class="kb ghost" data-action="cal-export" style="padding:6px 10px; font-size:11px;">.ics</button>
          </div>
          ${[
            ['5 mai', 'Quittance TVA Q1 2026', 'DGI · télédéclaration', 'pend'],
            ['12 mai', 'Rapport trimestriel acquéreur', 'Bank Al-Maghrib', 'pend'],
            ['25 mai', 'Bordereau CNSS · avril', 'CNSS · DAMANCOM', 'ok'],
            ['15 juin', 'Renouvellement patente', 'TPE Tanger', 'pend'],
          ].map(([d, n, src, st]) => `
            <div style="display:grid; grid-template-columns:60px 1fr auto; gap:10px; align-items:center; padding:10px 0; border-top:1px solid var(--n-200); font-size:12.5px;">
              <div class="mono" style="font-weight:600; font-size:13px;">${d}</div>
              <div><b>${n}</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">${src}</div></div>
              <span class="chip ${st}">${st === 'ok' ? 'Prêt' : 'À faire'}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="sh-section" style="margin-bottom:12px;">
        <div class="sh-section-head" style="margin-bottom:10px;">
          <div><h4>${T.auditLog}</h4><div class="sub">${T.auditLogSub}</div></div>
          <button class="kb ghost" data-action="audit-export" style="padding:6px 10px; font-size:11px;">${T.exportSignedCsv}</button>
        </div>
        ${audit.map(([t, ev, who, st]) => `
          <div style="display:grid; grid-template-columns:90px 1fr 1fr auto; gap:12px; align-items:center; padding:9px 0; border-top:1px solid var(--n-200); font-size:12.5px;">
            <div class="mono" style="color:var(--n-500); font-size:11px;">${t}</div>
            <div><b>${ev}</b></div>
            <div style="color:var(--n-500); font-size:11.5px;">${who}</div>
            <span class="chip ${st}">${st === 'ok' ? 'OK' : 'Bloqué'}</span>
          </div>
        `).join('')}
      </div>

      <div class="sh-section" style="margin-bottom:0;">
        <div class="sh-section-head" style="margin-bottom:10px;">
          <div><h4>${T.secretsRotation}</h4><div class="sub">${T.secretsRotationSub}</div></div>
          <button class="kb ghost" data-action="rotate-secret" style="padding:6px 10px; font-size:11px;">${T.manualRotation}</button>
        </div>
        ${secrets.map(([n, mask, pol, age, st]) => `
          <div style="display:grid; grid-template-columns:1fr 160px 130px auto; gap:12px; align-items:center; padding:10px 0; border-top:1px solid var(--n-200); font-size:12.5px;">
            <div><b>${n}</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">${pol}</div></div>
            <div class="mono" style="font-size:11px; color:var(--n-500);">${mask}</div>
            <div class="mono" style="font-size:11px;">il y a ${age}</div>
            <span class="chip ${st}">${st === 'ok' ? 'OK' : 'À tourner'}</span>
          </div>
        `).join('')}
      </div>
    `,
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
 * ÉQUIPE — redesigned for Kiwi 1.0 investor demo
 *
 * What you see on open:
 *   1. Status strip   — live count: En service / En pause / Hors service
 *   2. Kiwi AI alerts — flagged pointage anomalies (recurring lateness etc.)
 *   3. Members list   — sorted by status, with timeline bar (8h-2am scale)
 *                       showing scheduled shift vs actual time worked and a
 *                       NOW marker pegged to wall-clock time
 *   4. Permissions    — 5 role cards in a 2-col grid (replaces boring table)
 *   5. Journal PIN    — kept, polished
 *
 * Add-member modal is wired end-to-end: prénom + nom, rôle, PIN (auto-gen),
 * téléphone (optional) → pushed to in-memory state → drawer re-renders. Wiped
 * on page reload (no localStorage).
 *
 * Removed: green revenue hero, Passations de service, Certifications · suivi.
 * ─────────────────────────────────────────────────────────────────────────── */
handlers['nav-equipe'] = () => {
  const v = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Café Atlas' };

  /* ─── Persistent in-memory team state (resets on page reload) ─── */
  if (!window.__kiwiTeam) {
    window.__kiwiTeam = {
      members: [
        // Équipe matin (8h-16h or short variants)
        { id: 1, initials: 'FK', name: 'Fatima Khalki',  role: 'Manager',          kind: 'manager', avatar: 'a', team: 'matin', shift: [8, 16],   breakAt: null,        pin: '1234' },
        { id: 2, initials: 'SB', name: 'Sofia Belkadi',  role: 'Barista',          kind: 'server',  avatar: 'c', team: 'matin', shift: [8, 16],   breakAt: [14, 14.5],  pin: '2345' },
        { id: 3, initials: 'MM', name: 'Mehdi Mansouri', role: 'Cuisine',          kind: 'kitchen', avatar: 'a', team: 'matin', shift: [8, 14],   breakAt: null,        pin: '3456' },
        { id: 4, initials: 'LS', name: 'Lina Saidi',     role: 'Caissière',        kind: 'cashier', avatar: 'b', team: 'matin', shift: [9, 15],   breakAt: null,        pin: '4567' },
        // Équipe soir (17h-1am)
        { id: 5, initials: 'HJ', name: 'Hamid Jelloul',  role: 'Serveur · terrasse', kind: 'server',  avatar: 'b', team: 'soir',  shift: [17, 25],  breakAt: null,        pin: '5678' },
        { id: 6, initials: 'YA', name: 'Youssef Amrani', role: 'Serveur · soir',   kind: 'server',  avatar: 'd', team: 'soir',  shift: [17, 25],  breakAt: null,        pin: '6789' },
        { id: 7, initials: 'NK', name: 'Nawal Kettani',  role: 'Caissière soir',   kind: 'cashier', avatar: 'd', team: 'soir',  shift: [18, 26],  breakAt: null,        pin: '7890' },
        { id: 8, initials: 'KB', name: 'Karim Berrada',  role: 'Cuisine soir',     kind: 'kitchen', avatar: 'c', team: 'soir',  shift: [17, 25],  breakAt: null,        pin: '8901' },
      ],
      nextId: 9,
    };
  }

  const ROLE_COLOR = { manager: 'var(--atlas)', server: 'var(--riad)', kitchen: '#D99A2B', cashier: '#0B6E4F', admin: 'var(--ink)' };
  const ROLE_OPTIONS = [
    { value: 'server',  label: 'Serveur / Serveuse' },
    { value: 'manager', label: 'Manager' },
    { value: 'kitchen', label: 'Cuisine' },
    { value: 'cashier', label: 'Caissier / Caissière' },
  ];

  /* ─── Time helpers (timeline scale: 8h → 26h == 8am to 2am next day) ─── */
  const SCALE_START = 8, SCALE_END = 26, SCALE_SPAN = SCALE_END - SCALE_START;
  const nowHours = () => {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  };
  const formatTimeHr = (h) => {
    const wholeH = Math.floor(h) % 24;
    const m = Math.round((h - Math.floor(h)) * 60);
    return `${String(wholeH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const formatDuration = (mins) => {
    if (mins <= 0) return '0m';
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
  };

  /* Derive a member's live status from real-time vs scheduled shift. */
  function statusOf(m) {
    const now = nowHours();
    if (now < m.shift[0]) return 'scheduled';
    if (now >= m.shift[1]) return 'clocked-out';
    if (m.breakAt && now >= m.breakAt[0] && now <= m.breakAt[1]) return 'on-break';
    return 'on-shift';
  }
  const STATUS_INFO = {
    'on-shift':     { label: 'En service',      cls: 'ok',      dot: 'var(--success)', tone: 'rgba(11,110,79,0.10)' },
    'on-break':     { label: 'En pause',        cls: 'pend',    dot: 'var(--warning)', tone: 'rgba(217,154,43,0.10)' },
    'clocked-out':  { label: 'Sorti',           cls: 'neutral', dot: 'var(--n-400)',   tone: 'transparent' },
    'scheduled':    { label: 'Pas encore',      cls: 'neutral', dot: 'var(--n-300)',   tone: 'transparent' },
    'new':          { label: 'NOUV.',           cls: 'ok',      dot: 'var(--mint)',    tone: 'rgba(125,242,176,0.14)' },
  };
  const STATUS_ORDER = { 'on-shift': 0, 'on-break': 1, 'scheduled': 2, 'clocked-out': 3 };

  /* ─── Personal shift timeline — scale = member's own shift only ─── */
  function renderTimeline(m) {
    const status = statusOf(m);
    const now = nowHours();
    const startH = m.shift[0], endH = m.shift[1];
    const span = endH - startH;
    const pctOf = (h) => Math.min(100, Math.max(0, ((h - startH) / span) * 100));

    let workedPct, dotPct;
    if (status === 'clocked-out')     { workedPct = 100; dotPct = 100; }
    else if (status === 'scheduled')  { workedPct = 0;  dotPct = 0; }
    else                              { workedPct = pctOf(now); dotPct = workedPct; }

    const roleC = ROLE_COLOR[m.kind] || 'var(--atlas)';
    const isLive = status === 'on-shift' || status === 'on-break';
    const breakL = m.breakAt ? pctOf(m.breakAt[0]) : 0;
    const breakW = m.breakAt ? pctOf(m.breakAt[1]) - breakL : 0;

    return `
      <div style="position: relative; padding: 14px 4px 4px;">
        <!-- the rail -->
        <div style="position: relative; height: 8px; background: linear-gradient(90deg, var(--n-100), #ECEAE4 50%, var(--n-100)); border-radius: 999px; overflow: visible;">
          ${workedPct > 0 ? `
            <div style="position: absolute; top: 0; bottom: 0; left: 0; width: ${workedPct}%;
              background: linear-gradient(90deg, ${roleC}, ${roleC === 'var(--atlas)' ? '#7DF2B0' : '#0B6E4F'});
              border-radius: 999px;
              box-shadow: 0 1px 2px rgba(11,110,79,0.18);
              transition: width 600ms cubic-bezier(0.32, 0.72, 0, 1);"></div>` : ''}
          ${m.breakAt ? `
            <div style="position: absolute; top: 0; bottom: 0; left: ${breakL}%; width: ${breakW}%;
              background: repeating-linear-gradient(45deg, rgba(255,255,255,0.55), rgba(255,255,255,0.55) 3px, transparent 3px, transparent 6px);
              border-radius: 999px;"></div>` : ''}
          ${isLive ? `
            <div style="position: absolute; left: ${dotPct}%; top: 50%; transform: translate(-50%, -50%);
              width: 16px; height: 16px; border-radius: 50%;
              background: var(--surface); border: 3px solid ${roleC};
              box-shadow: 0 0 0 5px rgba(11,110,79,0.10), 0 2px 6px rgba(10,15,13,0.14);
              z-index: 2;">
              <span style="position: absolute; inset: -3px; border-radius: 50%; background: ${roleC}; opacity: 0.28;
                animation: kw-eq-ripple 1.8s ease-out infinite;"></span>
            </div>` : ''}
        </div>
        <!-- end labels (NO whitespace-collapsing, dedicated start + end) -->
        <div style="display: flex; justify-content: space-between; margin-top: 8px;">
          <span class="mono" style="font-size: 10.5px; color: var(--n-500); letter-spacing: 0.04em;">${formatTimeHr(startH)}</span>
          <span class="mono" style="font-size: 10.5px; color: var(--n-500); letter-spacing: 0.04em;">${formatTimeHr(endH >= 24 ? endH - 24 : endH)}</span>
        </div>
      </div>
    `;
  }

  /* ─── Kiwi AI · pointage anomaly alerts (mocked patterns) ─── */
  const AI_ALERTS = [
    {
      kind: 'late',
      title: 'Hamid Jelloul a pointé en retard 3 jours d\'affilée',
      detail: 'Moyenne +18 min sur la prise de service du soir · pattern récurrent depuis lundi.',
      action: 'Programmer un point',
      sev: 'pend',
    },
    {
      kind: 'overtime',
      title: 'Sofia Belkadi · 3h27 d\'heures sup. non validées',
      detail: 'Cumul sur la semaine en cours · à valider avant samedi pour intégration paie.',
      action: 'Valider les heures',
      sev: 'pend',
    },
    {
      kind: 'absent',
      title: 'Youssef Amrani n\'a pas pointé hier soir',
      detail: 'Aucune notification d\'absence reçue · 1ʳᵉ occurrence ce mois-ci.',
      action: 'Contacter Youssef',
      sev: 'ref',
    },
  ];

  /* ─── Permissions matrix (5 roles × 6 capabilities) ─── */
  const CAPS = ['Encaisser', 'Remboursement', 'Annulation ticket', 'Voir rapports', 'Modifier menu', 'Gérer équipe'];
  const PERMS = [
    { role: 'Propriétaire', kind: 'admin',   perms: [1,1,1,1,1,1] },
    { role: 'Manager',      kind: 'manager', perms: [1,1,1,1,1,1] },
    { role: 'Serveur',      kind: 'server',  perms: [1,0,1,0,0,0] },
    { role: 'Cuisine',      kind: 'kitchen', perms: [0,0,0,0,0,0] },
    { role: 'Caissier',     kind: 'cashier', perms: [1,0,1,1,0,0] },
  ];

  /* ─── Journal PIN — sensitive actions audit ─── */
  const PIN_LOG = [
    ['14:02', 'Fatima Khalki',  'Annulation ticket #4128',                              'ok'],
    ['13:48', 'Sofia Belkadi',  'Tentative remboursement refusée · niveau insuffisant',  'ref'],
    ['12:30', 'Hamid Jelloul',  'Ouverture caisse',                                      'ok'],
    ['Hier 22:55', 'Youssef Amrani', 'Échec PIN ×3 · réinitialisé par manager',         'pend'],
    ['Hier 21:12', 'Karim Berrada',  'Remboursement validé · 240 MAD',                   'ok'],
  ];

  /* ─── Open the drawer with a host div, then render into it ─── */
  let host;
  const dr = drawer({
    title: 'Équipe',
    subtitle: '…',
    width: 980,
    body: `<div data-eq-host></div>`,
  });
  host = dr.el.querySelector('[data-eq-host]');

  function render() {
    const members = window.__kiwiTeam.members;
    const decorated = members.map(m => ({ ...m, _status: statusOf(m) }));
    const counts = decorated.reduce((acc, m) => {
      if (m._status === 'on-shift') acc.onShift++;
      else if (m._status === 'on-break') acc.onBreak++;
      else acc.off++;
      return acc;
    }, { onShift: 0, onBreak: 0, off: 0 });

    // Sort by status group, then by name within group
    const sorted = decorated.slice().sort((a, b) => {
      const sa = STATUS_ORDER[a._status] ?? 9, sb = STATUS_ORDER[b._status] ?? 9;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });

    // Subtitle live counts
    const subEl = dr.el.querySelector('.genpage-head p, .kiwi-drawer-head p');
    if (subEl) subEl.textContent = `${v.name} · ${counts.onShift} en service · ${counts.onBreak} en pause · ${counts.off} hors service`;

    host.innerHTML = `
      <!-- Status strip -->
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;">
        ${[
          ['EN SERVICE',     counts.onShift, 'var(--success)', 'rgba(11,110,79,0.08)'],
          ['EN PAUSE',       counts.onBreak, 'var(--warning)', 'rgba(217,154,43,0.10)'],
          ['HORS SERVICE',   counts.off,     'var(--n-400)',   'var(--paper-soft)'],
        ].map(([label, n, dot, bg]) => `
          <div style="padding:14px 16px; border:1px solid var(--n-200); border-radius:12px; background:${bg};">
            <div style="display:flex; align-items:center; gap:8px; font-family:var(--mono); font-size:10.5px; letter-spacing:0.1em; color:var(--n-500);">
              <span style="width:7px; height:7px; border-radius:50%; background:${dot};"></span>${label}
            </div>
            <div style="font-size:24px; font-weight:600; letter-spacing:-0.02em; margin-top:6px;">${n}<span style="font-size:13px; color:var(--n-500); font-weight:400; margin-left:4px;">/ ${decorated.length}</span></div>
          </div>
        `).join('')}
      </div>

      <!-- Kiwi AI · pointage anomalies -->
      <div style="background:linear-gradient(135deg, var(--inverse-surface) 0%, #15201A 100%); color:var(--inverse-ink); border-radius:14px; padding:16px 18px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:24px; height:24px; border-radius:7px; background:rgba(125,242,176,0.16); display:flex; align-items:center; justify-content:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="2"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z"/></svg>
            </div>
            <div>
              <div style="font-family:var(--mono); font-size:10px; letter-spacing:0.12em; color:var(--mint);">KIWI AI · POINTAGES</div>
              <div style="font-size:13.5px; font-weight:600; margin-top:2px;">${AI_ALERTS.length} anomalies détectées cette semaine</div>
            </div>
          </div>
          <span class="chip" style="background:rgba(125,242,176,0.16); color:var(--mint); font-size:10.5px; padding:3px 9px;">recommandations</span>
        </div>
        ${AI_ALERTS.map(a => `
          <div style="display:grid; grid-template-columns:1fr auto; gap:14px; align-items:center; padding:10px 0; border-top:1px solid rgba(255,255,255,0.07);">
            <div>
              <div style="font-size:13px; font-weight:500; color:var(--inverse-ink);">${a.title}</div>
              <div style="font-size:11.5px; color:#a7d5b9; margin-top:3px; line-height:1.5;">${a.detail}</div>
            </div>
            <button class="kb" data-action="ai-pointage" data-arg="${a.kind}" style="background:rgba(125,242,176,0.14); color:var(--mint); padding:6px 12px; font-size:11.5px; white-space:nowrap;">${a.action} →</button>
          </div>
        `).join('')}
      </div>

      <!-- Members list -->
      <div style="padding:16px 18px; background:var(--surface); border:1px solid var(--n-200); border-radius:14px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div>
            <h4 style="margin:0; font-size:14.5px; letter-spacing:-0.01em;">Membres · ${v.name}</h4>
            <div style="font-size:11.5px; color:var(--n-500); margin-top:3px;">Pointages temps réel via Kiwi Caisse · 2 équipes (matin / soir)</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="kb ghost" data-action="broadcast-team" style="padding:7px 11px; font-size:12px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>
              Message équipe
            </button>
            <button class="kb primary" data-action="add-member" style="padding:7px 12px; font-size:12.5px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              Ajouter un membre
            </button>
          </div>
        </div>

        <style>
          @keyframes kw-eq-ripple {
            0%   { transform: scale(1);  opacity: 0.42; }
            70%  { transform: scale(2.4); opacity: 0;   }
            100% { transform: scale(2.4); opacity: 0;   }
          }
          @keyframes kw-eq-pulse {
            0%, 100% { opacity: 1; }
            50%      { opacity: 0.55; }
          }
          .kw-eq-row { transition: border-color 180ms, box-shadow 180ms, transform 180ms; }
          .kw-eq-row.active { background: var(--surface); }
          .kw-eq-row.active:hover { box-shadow: 0 1px 0 rgba(10,15,13,0.04), 0 12px 24px -14px rgba(10,15,13,0.16); transform: translateY(-1px); }
          .kw-eq-row.inactive { background: var(--paper-soft); }
          .kw-eq-iconbtn { width: 28px; height: 28px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--n-200); background: var(--surface); color: var(--n-500); cursor: pointer; transition: transform 120ms, opacity 120ms, background-color 120ms, border-color 120ms, color 120ms, box-shadow 120ms; }
          .kw-eq-iconbtn:hover { color: var(--ink); border-color: var(--n-300); }
          .kw-eq-detailbtn { padding: 5px 11px; font-size: 11.5px; border-radius: 7px; border: 1px solid var(--n-200); background: var(--surface); color: var(--ink); cursor: pointer; transition: transform 120ms, opacity 120ms, background-color 120ms, border-color 120ms, color 120ms, box-shadow 120ms; }
          .kw-eq-detailbtn:hover { background: var(--paper-soft); }
        </style>
        ${sorted.map(m => {
          const info = STATUS_INFO[m._status];
          const newChip = m.isNew ? `<span class="chip" style="background:rgba(125,242,176,0.20); color:var(--riad); font-size:9.5px; padding:2px 7px; margin-left:6px; letter-spacing:0.05em;">NOUV.</span>` : '';
          const roleC = ROLE_COLOR[m.kind] || 'var(--atlas)';
          const isActive = m._status === 'on-shift' || m._status === 'on-break';
          const durationMins  = isActive ? Math.round((nowHours() - m.shift[0]) * 60) : 0;
          const remainingMins = isActive ? Math.round((m.shift[1] - nowHours()) * 60) : 0;
          const totalMins     = (m.shift[1] - m.shift[0]) * 60;
          const progressPct   = isActive ? Math.round((durationMins / totalMins) * 100) : (m._status === 'clocked-out' ? 100 : 0);
          const shiftLabel = `${formatTimeHr(m.shift[0])} → ${formatTimeHr(m.shift[1] >= 24 ? m.shift[1] - 24 : m.shift[1])}`;
          const teamLabel  = m.team === 'matin' ? 'Équipe matin' : 'Équipe soir';

          if (isActive) {
            /* RICH active card */
            return `
              <div class="kw-eq-row active" style="position: relative; padding: 16px 18px; border: 1px solid var(--n-200); border-left: 3px solid ${roleC}; border-radius: 12px; margin-bottom: 10px;">
                <div style="display: grid; grid-template-columns: 44px 1fr auto; gap: 14px; align-items: flex-start;">
                  <div class="av ${m.avatar}" style="width: 44px; height: 44px; font-size: 13.5px; font-weight: 600;">${m.initials}</div>
                  <div style="min-width: 0; padding-top: 1px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <div style="font-weight: 600; font-size: 15px; letter-spacing: -0.01em;">${m.name}</div>
                      ${newChip}
                    </div>
                    <div style="font-size: 11.5px; color: var(--n-500); margin-top: 3px; display: flex; align-items: center; gap: 8px;">
                      <span style="display: inline-flex; align-items: center; gap: 5px; color: var(--n-600); font-weight: 500;">
                        <i style="width: 6px; height: 6px; border-radius: 2px; background: ${roleC};"></i>${m.role}
                      </span>
                      <span style="color: var(--n-300);">·</span>
                      <span>${teamLabel}</span>
                    </div>
                  </div>
                  <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                    <span class="chip ${info.cls}" style="font-size: 10.5px; padding: 3px 10px;">
                      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${info.dot}; margin-right: 6px; animation: kw-eq-pulse 1.8s ease-in-out infinite;"></span>${info.label}
                    </span>
                    <div style="display: flex; gap: 5px;">
                      <button class="kw-eq-iconbtn" data-action="member-reset-pin" data-arg="${m.id}" title="Réinitialiser le PIN">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
                      </button>
                      <button class="kw-eq-detailbtn" data-action="member-detail" data-arg="${m.name}">Détails</button>
                    </div>
                  </div>
                </div>

                <!-- Timeline + counters -->
                <div style="margin-top: 14px; padding-left: 58px;">
                  ${renderTimeline(m)}
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                    <div style="font-size: 11.5px; color: var(--n-500);">
                      <span class="mono" style="color: var(--ink); font-weight: 600;">${formatDuration(durationMins)}</span>
                      <span style="margin: 0 4px;">·</span>
                      <span style="color: var(--n-500);">${progressPct}% du shift</span>
                    </div>
                    <div style="font-size: 11.5px; color: var(--n-500);">
                      reste <span class="mono" style="color: var(--ink); font-weight: 600;">${formatDuration(remainingMins)}</span>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }

          /* COMPACT inactive row — one-line summary */
          const offSubline = (() => {
            if (m._status === 'clocked-out') return `Service terminé · sorti à <span class="mono">${formatTimeHr(m.shift[1] >= 24 ? m.shift[1] - 24 : m.shift[1])}</span>`;
            if (m._status === 'scheduled')   return `Prise de service à <span class="mono">${formatTimeHr(m.shift[0])}</span>`;
            return '';
          })();
          return `
            <div class="kw-eq-row inactive" style="display: grid; grid-template-columns: 36px 1fr auto auto; gap: 12px; align-items: center; padding: 11px 16px; border: 1px solid var(--n-200); border-left: 3px solid ${roleC}; border-radius: 12px; margin-bottom: 8px; opacity: 0.72;">
              <div class="av ${m.avatar}" style="width: 36px; height: 36px; font-size: 12px;">${m.initials}</div>
              <div style="min-width: 0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-weight: 600; font-size: 13.5px; letter-spacing: -0.005em;">${m.name}</span>
                  ${newChip}
                </div>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 2px;">
                  ${m.role} · ${teamLabel} · <span class="mono">${shiftLabel}</span>
                </div>
              </div>
              <div style="text-align: right; display: flex; flex-direction: column; gap: 3px;">
                <span class="chip ${info.cls}" style="font-size: 10.5px; padding: 3px 9px;">
                  <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: ${info.dot}; margin-right: 5px;"></span>${info.label}
                </span>
                <span style="font-size: 10.5px; color: var(--n-500);">${offSubline}</span>
              </div>
              <div style="display: flex; gap: 5px;">
                <button class="kw-eq-iconbtn" data-action="member-reset-pin" data-arg="${m.id}" title="Réinitialiser le PIN">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
                </button>
                <button class="kw-eq-detailbtn" data-action="member-detail" data-arg="${m.name}">Détails</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Permissions matrix, 2-col grid of role cards -->
      <div style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:10px;">
          <div>
            <h4 style="margin:0; font-size:14.5px; letter-spacing:-0.01em;">Matrice de permissions</h4>
            <div style="font-size:11.5px; color:var(--n-500); margin-top:3px;">5 rôles · 6 capacités · modifiable par le propriétaire</div>
          </div>
          <button class="kb ghost" data-action="edit-perms" style="padding:6px 11px; font-size:11.5px;">Modifier les rôles</button>
        </div>
        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px;">
          ${PERMS.map(r => {
            const active = r.perms.filter(Boolean).length;
            const roleC = ROLE_COLOR[r.kind] || 'var(--atlas)';
            return `
              <div style="background:var(--surface); border:1px solid var(--n-200); border-radius:12px; padding:14px 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                  <div style="display:flex; align-items:center; gap:9px;">
                    <i style="width:9px; height:9px; border-radius:50%; background:${roleC};"></i>
                    <b style="font-size:13.5px; letter-spacing:-0.005em;">${r.role}</b>
                  </div>
                  <span class="mono" style="font-size:10.5px; color:var(--n-500); background:var(--paper-soft); padding:2px 7px; border-radius:5px;">${active} / ${CAPS.length}</span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 12px;">
                  ${CAPS.map((c, i) => `
                    <div style="display:flex; align-items:center; gap:6px; font-size:11.5px; color:${r.perms[i] ? 'var(--ink)' : 'var(--n-400)'};">
                      ${r.perms[i]
                        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${roleC}" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>`
                        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M6 18L18 6"/></svg>`
                      }
                      ${c}
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Journal PIN -->
      <div style="background:var(--surface); border:1px solid var(--n-200); border-radius:14px; padding:16px 18px;">
        <div style="margin-bottom:10px;">
          <h4 style="margin:0; font-size:14.5px; letter-spacing:-0.01em;">Journal PIN &amp; actions sensibles</h4>
          <div style="font-size:11.5px; color:var(--n-500); margin-top:3px;">Annulations · remboursements · ouvertures de caisse · échecs de saisie</div>
        </div>
        ${PIN_LOG.map(([t, who, ev, st]) => `
          <div style="display:grid; grid-template-columns:90px 1fr auto; gap:14px; align-items:center; padding:10px 0; border-top:1px solid var(--n-200); font-size:12.5px;">
            <div class="mono" style="font-size:11px; color:var(--n-500);">${t}</div>
            <div><b>${who}</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">${ev}</div></div>
            <span class="chip ${st}">${st === 'ok' ? 'OK' : st === 'pend' ? 'Réinit.' : 'Refusé'}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  render();

  /* ─── ADD MEMBER MODAL — wired end-to-end ─── */
  handlers['add-member'] = () => {
    let pinAuto = String(Math.floor(1000 + Math.random() * 9000));
    const modalHandle = modal({
      title: 'Nouveau membre',
      width: 500,
      body: `
        <style>
          [data-eq-form] input,
          [data-eq-form] select {
            width: 100%;
            padding: 11px 13px;
            border: 1px solid var(--n-300);
            border-radius: 9px;
            font-family: var(--sans);
            font-size: 14px;
            outline: none;
            background: var(--surface);
            color: var(--ink);
            transition: border-color 140ms, box-shadow 140ms;
            box-sizing: border-box;
          }
          [data-eq-form] input:focus,
          [data-eq-form] select:focus {
            border-color: var(--atlas);
            box-shadow: 0 0 0 3px rgba(11,110,79,0.12);
          }
          [data-eq-form] input::placeholder { color: var(--n-400); }
          [data-eq-form] .eq-section-label {
            font-family: var(--mono);
            font-size: 10px;
            letter-spacing: 0.14em;
            color: var(--n-500);
            text-transform: uppercase;
          }
          [data-eq-form] .eq-help {
            font-size: 11.5px;
            color: var(--n-500);
            margin-top: 7px;
            line-height: 1.5;
          }
        </style>
        <div data-eq-form style="padding: 2px 0;">

          <p style="margin: 0 0 22px; font-size: 13px; color: var(--n-500); line-height: 1.6;">
            Ajoute un employé à <b style="color: var(--ink); font-weight: 600;">${v.name}</b>. Il recevra son PIN par SMS et un lien vers l'app <b style="color: var(--ink); font-weight: 600;">Kiwi Caisse</b>.
          </p>

          <!-- Identité (prénom + nom in 2 cols) -->
          <div style="margin-bottom: 20px;">
            <div class="eq-section-label" style="margin-bottom: 9px;">Identité</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <input type="text" data-eq-firstname placeholder="Prénom" autocomplete="given-name" autofocus />
              <input type="text" data-eq-lastname  placeholder="Nom"    autocomplete="family-name" />
            </div>
          </div>

          <!-- Rôle -->
          <div style="margin-bottom: 20px;">
            <div class="eq-section-label" style="margin-bottom: 9px;">Rôle</div>
            <div style="position: relative;">
              <select data-eq-role style="padding-right: 38px; appearance: none; -webkit-appearance: none; cursor: pointer;">
                ${ROLE_OPTIONS.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
              </select>
              <svg style="position: absolute; right: 13px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--n-500);" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
          </div>

          <!-- PIN Caisse -->
          <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px;">
              <div class="eq-section-label">PIN Caisse</div>
              <button type="button" data-action="eq-regen-pin" style="background: none; border: 0; padding: 4px 8px; margin: -4px -8px; color: var(--atlas); font-size: 11.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-family: var(--sans); border-radius: 5px;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 4v6h6M23 20v-6h-6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.64A9 9 0 0020.49 15"/></svg>
                Régénérer
              </button>
            </div>
            <input type="text" data-eq-pin value="${pinAuto}" maxlength="4" inputmode="numeric" pattern="[0-9]{4}"
                   style="font-family: var(--mono); font-size: 24px; font-weight: 600; letter-spacing: 0.5em; text-align: center; padding: 16px 0 16px 0.5em; background: var(--paper-soft); border-color: var(--n-200); color: var(--ink);" />
            <div class="eq-help">Envoyé par SMS lors de l'invitation · l'employé peut le changer après sa première connexion.</div>
          </div>

          <!-- Téléphone (optionnel) -->
          <div>
            <div class="eq-section-label" style="margin-bottom: 9px;">
              Téléphone <span style="color: var(--n-400); font-weight: 400; letter-spacing: 0.02em; text-transform: none; margin-left: 6px;">— optionnel, pour l'invitation SMS</span>
            </div>
            <div style="display: grid; grid-template-columns: 92px 1fr; gap: 8px;">
              <div style="display: flex; align-items: center; justify-content: center; padding: 11px 8px; border: 1px solid var(--n-300); border-radius: 9px; background: var(--paper-soft); font-family: var(--mono); font-size: 13px; color: var(--n-600); gap: 5px; box-sizing: border-box;">
                <span style="font-size: 14px;">🇲🇦</span><span>+212</span>
              </div>
              <input type="tel" data-eq-phone placeholder="6XX XX XX XX" autocomplete="tel-national" />
            </div>
          </div>

        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Annuler</button>
        <button class="kb atlas" data-action="eq-submit-member" style="gap: 7px; padding: 9px 16px; font-weight: 600;">
          Ajouter &amp; inviter
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      `,
    });

    // Regen PIN button
    handlers['eq-regen-pin'] = () => {
      pinAuto = String(Math.floor(1000 + Math.random() * 9000));
      const pinEl = modalHandle.el.querySelector('[data-eq-pin]');
      if (pinEl) pinEl.value = pinAuto;
    };

    // Submit
    handlers['eq-submit-member'] = () => {
      const fn = (modalHandle.el.querySelector('[data-eq-firstname]')?.value || '').trim();
      const ln = (modalHandle.el.querySelector('[data-eq-lastname]')?.value  || '').trim();
      const role = modalHandle.el.querySelector('[data-eq-role]')?.value || 'server';
      const pin = (modalHandle.el.querySelector('[data-eq-pin]')?.value || pinAuto).trim();
      const phone = (modalHandle.el.querySelector('[data-eq-phone]')?.value || '').trim();

      if (!fn || !ln) {
        toast('Prénom et nom requis', { type: 'pend', duration: 1800 });
        return;
      }
      if (!/^\d{4}$/.test(pin)) {
        toast('PIN invalide · 4 chiffres requis', { type: 'pend', duration: 1800 });
        return;
      }

      const initials = (fn[0] + ln[0]).toUpperCase();
      const roleLabel = ROLE_OPTIONS.find(r => r.value === role)?.label.split(' / ')[0] || 'Serveur';
      const id = window.__kiwiTeam.nextId++;
      const newMember = {
        id, initials,
        name: `${fn} ${ln}`,
        role: roleLabel,
        kind: role,
        avatar: ['a','b','c','d'][id % 4],
        team: nowHours() < 14 ? 'soir' : 'matin', // schedule for the next shift
        shift: nowHours() < 14 ? [17, 25] : [8, 16],
        breakAt: null,
        pin,
        isNew: true,
      };
      window.__kiwiTeam.members.push(newMember);

      modalHandle.close();
      render();
      toast(`${fn} ${ln} ajouté·e à l'équipe`, {
        type: 'success',
        duration: 2400,
        desc: phone
          ? `SMS d'invitation envoyé au ${phone} · PIN ${pin} · prochaine prise de service ${newMember.shift[0]}h00.`
          : `PIN ${pin} · prochaine prise de service ${newMember.shift[0]}h00.`,
      });
    };
  };

  /* ─── Quick-action handlers (reset PIN, broadcast, AI alert) ─── */
  handlers['member-reset-pin'] = (_el, id) => {
    const m = window.__kiwiTeam.members.find(x => String(x.id) === String(id));
    if (!m) return;
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    m.pin = newPin;
    toast(`PIN réinitialisé · ${m.name}`, {
      type: 'success',
      duration: 2200,
      desc: `Nouveau PIN ${newPin} envoyé par SMS · ancien PIN désactivé immédiatement.`,
    });
  };

  handlers['broadcast-team'] = () => {
    const composer = modal({
      title: 'Message à l\'équipe',
      width: 440,
      body: `
        <div style="font-size:12.5px; color:var(--n-500); margin-bottom:12px; line-height:1.5;">
          Envoie une notification push à tous les appareils Kiwi Caisse de l'équipe.
        </div>
        <textarea data-eq-broadcast placeholder="Ex. Réservation 20h table 12 · 8 couverts · préparez la salle privée." rows="4" style="width:100%; padding:11px 13px; border:1px solid var(--n-300); border-radius:9px; font-family:var(--sans); font-size:13px; resize:vertical; outline:none;" autofocus></textarea>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Annuler</button>
        <button class="kb atlas" data-action="eq-send-broadcast">Envoyer à 8 appareils</button>
      `,
    });
    handlers['eq-send-broadcast'] = () => {
      const msg = (composer.el.querySelector('[data-eq-broadcast]')?.value || '').trim();
      if (!msg) { toast('Message vide', { type: 'pend' }); return; }
      composer.close();
      toast('Message envoyé à 8 appareils Kiwi Caisse', {
        type: 'success',
        duration: 2200,
        desc: msg.length > 70 ? msg.slice(0, 70) + '…' : msg,
      });
    };
  };

  handlers['ai-pointage'] = (_el, kind) => {
    const labels = {
      late:     ['Point programmé · Hamid Jelloul', 'Convocation 15h jeudi · note ajoutée au dossier.'],
      overtime: ['Heures validées · Sofia Belkadi', '3h27 ajoutées au prochain bulletin paie.'],
      absent:   ['Youssef contacté', 'SMS envoyé · accusé de réception en attente.'],
    };
    const [t, d] = labels[kind] || ['Action effectuée', 'Recommandation Kiwi AI appliquée.'];
    toast(t, { type: 'success', duration: 2200, desc: d });
  };

  if (!handlers['member-detail']) handlers['member-detail'] = (el) => toast(`Profil de ${el?.dataset?.arg || 'l\'employé'}`, { type: 'info', desc: 'Pointage · revenus · pourboires · historique disciplinaire.' });
  if (!handlers['edit-perms'])    handlers['edit-perms']    = () => toast('Éditeur de permissions', { type: 'info', desc: 'Cochez/décochez les capacités par rôle · changement appliqué immédiatement.' });
};

/* ═══════════════════ PAIE & PLANNING ═══════════════════ */
handlers['nav-payroll'] = () => {
  const v = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Café Atlas' };
  const staff = [
    { i: 'FK', k: 'a', n: 'Fatima',  role: 'Serveuse senior', shifts: ['m','m','off','m','m','m','off'] },
    { i: 'HJ', k: 'b', n: 'Hamid',   role: 'Serveur terrasse', shifts: ['e','e','off','e','e','e','e'] },
    { i: 'SB', k: 'c', n: 'Sofia',   role: 'Barista',          shifts: ['d','d','d','off','d','d','d'] },
    { i: 'YA', k: 'd', n: 'Youssef', role: 'Serveur soir',     shifts: ['off','e','e','e','e','dbl','off'] },
    { i: 'MM', k: 'a', n: 'Mehdi',   role: 'Cuisine',          shifts: ['m','m','m','m','m','m','off'] },
  ];
  const slot = { m: ['8–17','JOUR','morning'], e: ['12–22','SOIR','evening'], d: ['9–15','COMPTOIR','day'], dbl: ['11–23','DOUBLE','evening'], off: ['off','','off'] };
  const days = ['Lun 21','Mar 22','Mer 23','Jeu 24','Ven 25','Sam 26','Dim 27'];
  const leaves = [
    ['Sofia Belkadi', '2 jours · 5–6 mai', 'Mariage cousine', 'pend'],
    ['Mehdi Mansouri', '1 jour · 1ᵉʳ mai', 'Fête du travail (férié)', 'ok'],
    ['Youssef Amrani', '3 jours · 15–17 mai', 'Voyage familial', 'pend'],
  ];
  drawer({
    title: 'Paie &amp; planning',
    subtitle: 'Pointage POS · pourboires partagés · ratio main d\'œuvre',
    width: 1040,
    body: `
      <div class="p-hero">
        <div class="l">SAMEDI 25 AVRIL · MAIN D'ŒUVRE</div>
        <div class="big">4 / 5 <span style="font-size:18px; opacity:0.7;">employés pointés</span></div>
        <div class="sub">Coût aujourd'hui <b style="color:var(--mint);">1 240 MAD</b> · ratio 16,8 % des ventes, sain</div>
      </div>

      <div class="sh-section">
        <div class="sh-section-head">
          <div><h4>Planning hebdomadaire · 21 → 27 avril</h4><div class="sub">Glissez une cellule pour modifier</div></div>
          <button class="kb ghost" data-action="edit-shifts" style="padding:8px 12px; font-size:12.5px;">Modifier</button>
        </div>
        <div class="sh-week">
          <div></div>
          ${days.map((d, i) => `<div class="head${i === 5 ? ' today' : ''}">${d}</div>`).join('')}
          ${staff.map(s => `
            <div class="name" style="display:flex; align-items:center; gap:8px;">
              <span style="display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; background:${s.k === 'a' ? 'var(--atlas)' : s.k === 'b' ? 'var(--riad)' : s.k === 'c' ? '#D99A2B' : 'var(--atlas-700)'}; color:var(--paper); font-size:9.5px; font-weight:600; font-family:var(--mono);">${s.i}</span>
              <div style="line-height:1.2;"><div style="font-size:12px; font-weight:500;">${s.n}</div><div style="font-size:9.5px; color:var(--n-500); font-family:var(--mono);">${s.role}</div></div>
            </div>
            ${s.shifts.map(sh => {
              const [hours, label, cls] = slot[sh];
              return `<div class="cell ${cls}"><div class="h">${hours}</div>${label ? `<div class="d">${label}</div>` : ''}</div>`;
            }).join('')}
          `).join('')}
        </div>
      </div>

      <div class="sh-grid-2">
        <div class="sh-section" style="margin-bottom:12px;">
          <div class="sh-section-head" style="margin-bottom:10px;">
            <div><h4>Pourboires partagés</h4><div class="sub">Pool 1 867 MAD aujourd'hui · à distribuer en fin de service</div></div>
          </div>
          <div class="sh-tip-cfg">
            <div><b>Pool ${v.name}</b><div class="m">60 % salle · 25 % bar · 15 % cuisine · pondéré aux heures travaillées</div></div>
            <button class="kb ghost" data-action="edit-tip-rule">Modifier</button>
          </div>
          ${[
            ['a', 'FK', 'Fatima', 'salle · 6h25', 35, 654],
            ['b', 'HJ', 'Hamid',  'salle · 5h38', 30, 560],
            ['c', 'SB', 'Sofia',  'bar · 5h08',   25, 467],
            ['d', 'MM', 'Mehdi',  'cuisine · 5h12', 10, 186],
          ].map(([k, i, n, r, pct, amt]) => `
            <div class="sh-tip-pool">
              <div class="av ${k}">${i}</div>
              <div><b>${n}</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">${r}</div></div>
              <div class="pct">${pct} %</div>
              <div class="amt">+${amt} MAD</div>
            </div>
          `).join('')}
          <button class="kb atlas" style="width:100%; justify-content:center; margin-top:12px;" data-action="distribute-tips">Distribuer · WhatsApp à l'équipe →</button>
        </div>

        <div class="sh-section" style="margin-bottom:12px;">
          <div class="sh-section-head" style="margin-bottom:10px;">
            <div><h4>Heures vs cible · 7 jours</h4><div class="sub">Cible 30 % · benchmark cafés Casa 28 %</div></div>
            <span class="chip ok">SAIN · 16,8 %</span>
          </div>
          <div class="sh-lvs">
            <div class="sh-lvs-head">
              <div>
                <div class="sh-lvs-num">16,8<span class="u">%</span></div>
                <div style="font-size:11px; color:var(--n-500); margin-top:4px; font-family:var(--mono); letter-spacing:0.04em;">AUJ. · 1 240 / 7 380 MAD</div>
              </div>
            </div>
            <svg viewBox="0 0 280 120" style="width:100%; height:120px; margin-top:6px;">
              <line x1="0" y1="42" x2="280" y2="42" stroke="#A8A49A" stroke-dasharray="3 3" stroke-width="1"/>
              <text x="278" y="38" text-anchor="end" font-family="JetBrains Mono" font-size="9" fill="#6F6C65">cible 30 %</text>
              ${[['Lun',22],['Mar',19],['Mer',24],['Jeu',18],['Ven',17],['Sam',16.8],['Dim',0]].map(([day, pct], i) => {
                const x = 8 + i * 38; const h = pct === 0 ? 0 : (pct / 35) * 88; const y = 102 - h;
                const isToday = i === 5; const isFuture = pct === 0;
                const fill = isFuture ? '#E8E6E0' : isToday ? '#0B6E4F' : '#7DF2B0';
                return `<g><rect x="${x}" y="${y}" width="22" height="${h}" rx="3" fill="${fill}"/><text x="${x + 11}" y="116" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="${isToday ? '#0B6E4F' : '#6F6C65'}" font-weight="${isToday ? '600' : '400'}">${day}</text>${pct > 0 ? `<text x="${x + 11}" y="${y - 4}" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#0A0F0D">${pct}%</text>` : ''}</g>`;
              }).join('')}
            </svg>
            <div class="sh-lvs-foot">
              <label><i style="background:var(--atlas);"></i>Aujourd'hui</label>
              <label><i style="background:var(--mint);"></i>Précédents</label>
              <label><i style="background:#A8A49A;"></i>Cible</label>
            </div>
          </div>
        </div>
      </div>

      <div class="sh-grid-2">
        <div class="sh-section" style="margin-bottom:12px;">
          <div class="sh-section-head" style="margin-bottom:10px;">
            <div><h4>Aperçu bulletin · Fatima Khalki</h4><div class="sub">Avril 2026 · 162 h · serveuse senior · pré-rempli DGI</div></div>
            <button class="kb ghost" data-action="payslip-pdf" style="padding:6px 10px; font-size:11px;">PDF</button>
          </div>
          <div style="background:var(--surface); border:1px solid var(--n-200); border-radius:12px; padding:14px;">
            ${[
              ['Salaire brut', '5 800,00', 'var(--ink)'],
              ['CNSS salarié (4,48 %)', '−259,84', 'var(--n-600)'],
              ['AMO salarié (2,26 %)', '−131,08', 'var(--n-600)'],
              ['IGR (barème 2026)', '−412,30', 'var(--n-600)'],
              ['Avantages en nature', '+180,00', 'var(--atlas)'],
            ].map(([l, v, c]) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid var(--n-200); font-size:12.5px;">
                <span style="color:var(--n-600);">${l}</span>
                <span class="mono" style="font-weight:500; color:${c};">${v}</span>
              </div>
            `).join('')}
            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:11px; margin-top:6px; border-top:2px solid var(--ink);">
              <b style="font-size:13px;">Net à payer</b>
              <b class="mono" style="font-size:18px; font-weight:600; color:var(--atlas); letter-spacing:-0.015em;">5 176,78 MAD</b>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
            <button class="kb ghost" data-action="generate-payslips" style="justify-content:center;">Générer 5 bulletins</button>
            <button class="kb atlas" data-action="export-dgi" style="justify-content:center;">Export DGI · CSV</button>
          </div>
        </div>

        <div class="sh-section" style="margin-bottom:12px;">
          <div class="sh-section-head" style="margin-bottom:10px;">
            <div><h4>Demandes de congé en attente</h4><div class="sub">3 demandes · à valider avant vendredi</div></div>
            <button class="kb ghost" data-action="all-leaves" style="padding:6px 10px; font-size:11px;">Toutes</button>
          </div>
          ${leaves.map(([who, when, reason, st]) => `
            <div style="padding:11px 0; border-top:1px solid var(--n-200); font-size:12.5px;">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:6px;">
                <div style="flex:1;"><b>${who}</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">${when} · ${reason}</div></div>
                <span class="chip ${st}">${st === 'ok' ? 'Approuvé' : 'À valider'}</span>
              </div>
              ${st === 'pend' ? `
                <div style="display:flex; gap:6px; margin-top:6px;">
                  <button class="kb ghost" data-action="leave-deny" style="padding:5px 10px; font-size:11px; flex:1; justify-content:center;">Refuser</button>
                  <button class="kb atlas" data-action="leave-approve" style="padding:5px 10px; font-size:11px; flex:1; justify-content:center;">Approuver</button>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Fermer</button>
      <button class="kb primary" data-action="export-payroll">Exporter la paie du mois</button>
    `,
  });
};

/* ═══════════════════ RÉSERVATIONS & RDV ═══════════════════ */
const RESV_STR = {
  fr: {
    title: 'Réservations & RDV',
    subtitle: (name, covers, conf, wait) => `${name} · ${covers} couverts aujourd'hui · ${conf} réservations confirmées · ${wait} en liste d'attente`,
    heroCovers: 'couverts prévus',
    heroSub: (conf, dep) => `${conf} réservations confirmées · ${dep} acomptes attendus · 1 alerte de pacing à 19:00`,
    calTitle: 'Calendrier 7 jours · couverts par créneau',
    calSub: 'Hauteur = nombre de couverts · couleur = densité',
    calm: 'Calme', busy: 'Soutenu', sat: 'Saturé', today: 'auj.', cov: 'couv.',
    bookTitle: (d, n) => `Réservations ${d} · ${n} entrées`,
    bookSub: 'Trié par heure · cliquez pour ouvrir le détail client',
    newBtn: '+ Nouvelle',
    th: ['HEURE', 'CLIENT', 'PARTY', 'NOTE', 'NO-SHOW', 'STATUT'],
    confirmed: 'Confirmé', deposit: 'Acompte',
    ns: { low: 'Faible', med: 'Modéré', high: 'Élevé' },
    waitTitle: 'Liste d\'attente',
    waitSub: 'Auto-promotion dès qu\'une table se libère',
    autoOn: 'Auto-promote ON',
    ready: (n, t) => `${n} pers · prêt dans ~${t} min`,
    readyTable: (n, t, tb) => `${n} pers · prêt dans ~${t} min · place ${tb}`,
    smsReady: 'SMS prêt →', sms: 'SMS',
    waitFoot: 'SMS automatique « votre table est prête » dès qu\'une table de la bonne taille se libère.',
    chanTitle: 'Canaux de réservation · 30 jours',
    chanSub: '142 réservations · 18 % no-show prévenus par acompte',
    chGoogle: 'Google Réserver', chWa: 'WhatsApp direct', chWalk: 'Walk-in', chSite: 'Site direct',
    chanFoot: 'Google Réserver est synchronisé en temps réel · pas de double-booking possible.',
    paceTitle: 'Alerte pacing · 19:00–19:15',
    paceBody: '9 couverts arrivent dans la même fenêtre de 15 min. Cuisine sous tension prévue. <b>Buffer de 15 min recommandé</b> sur la prochaine réservation, ou décaler à 19:30.',
    paceBtn: 'Appliquer buffer',
    close: 'Fermer', addBtn: '+ Nouvelle réservation',
  },
  en: {
    title: 'Reservations & appointments',
    subtitle: (name, covers, conf, wait) => `${name} · ${covers} covers today · ${conf} confirmed reservations · ${wait} on the waitlist`,
    heroCovers: 'covers expected',
    heroSub: (conf, dep) => `${conf} confirmed reservations · ${dep} deposits pending · 1 pacing alert at 19:00`,
    calTitle: '7-day calendar · covers per slot',
    calSub: 'Height = number of covers · colour = density',
    calm: 'Quiet', busy: 'Busy', sat: 'Full', today: 'today', cov: 'cov.',
    bookTitle: (d, n) => `Reservations ${d} · ${n} entries`,
    bookSub: 'Sorted by time · click to open the client detail',
    newBtn: '+ New',
    th: ['TIME', 'CLIENT', 'PARTY', 'NOTE', 'NO-SHOW', 'STATUS'],
    confirmed: 'Confirmed', deposit: 'Deposit',
    ns: { low: 'Low', med: 'Moderate', high: 'High' },
    waitTitle: 'Waitlist',
    waitSub: 'Auto-promotion as soon as a table frees up',
    autoOn: 'Auto-promote ON',
    ready: (n, t) => `${n} ppl · ready in ~${t} min`,
    readyTable: (n, t, tb) => `${n} ppl · ready in ~${t} min · table ${tb}`,
    smsReady: 'SMS ready →', sms: 'SMS',
    waitFoot: 'Automatic "your table is ready" SMS as soon as a right-sized table frees up.',
    chanTitle: 'Booking channels · 30 days',
    chanSub: '142 reservations · 18% of no-shows prevented by deposits',
    chGoogle: 'Reserve with Google', chWa: 'WhatsApp direct', chWalk: 'Walk-in', chSite: 'Direct website',
    chanFoot: 'Reserve with Google syncs in real time · double-booking impossible.',
    paceTitle: 'Pacing alert · 19:00–19:15',
    paceBody: '9 covers arrive within the same 15-min window. Kitchen pressure expected. <b>15-min buffer recommended</b> on the next reservation, or shift it to 19:30.',
    paceBtn: 'Apply buffer',
    close: 'Close', addBtn: '+ New reservation',
  },
  ar: {
    title: 'الحجوزات والمواعيد',
    subtitle: (name, covers, conf, wait) => `${name} · ${covers} مقعدًا اليوم · ${conf} حجوزات مؤكدة · ${wait} في قائمة الانتظار`,
    heroCovers: 'مقعدًا متوقعًا',
    heroSub: (conf, dep) => `${conf} حجوزات مؤكدة · ${dep} عربون مرتقب · تنبيه تدفق عند 19:00`,
    calTitle: 'تقويم 7 أيام · المقاعد لكل فترة',
    calSub: 'الارتفاع = عدد المقاعد · اللون = الكثافة',
    calm: 'هادئ', busy: 'نشِط', sat: 'مكتمل', today: 'اليوم', cov: 'مقعد',
    bookTitle: (d, n) => `حجوزات ${d} · ${n} حجزًا`,
    bookSub: 'مرتب حسب الساعة · انقر لفتح تفاصيل العميل',
    newBtn: '+ جديد',
    th: ['الساعة', 'العميل', 'العدد', 'ملاحظة', 'الغياب', 'الحالة'],
    confirmed: 'مؤكد', deposit: 'عربون',
    ns: { low: 'منخفض', med: 'متوسط', high: 'مرتفع' },
    waitTitle: 'قائمة الانتظار',
    waitSub: 'ترقية تلقائية فور تحرر طاولة',
    autoOn: 'الترقية التلقائية مفعّلة',
    ready: (n, t) => `${n} أشخاص · جاهز خلال ~${t} دقيقة`,
    readyTable: (n, t, tb) => `${n} أشخاص · جاهز خلال ~${t} دقيقة · طاولة ${tb}`,
    smsReady: 'رسالة جاهز ←', sms: 'SMS',
    waitFoot: 'رسالة تلقائية « طاولتكم جاهزة » فور تحرر طاولة بالحجم المناسب.',
    chanTitle: 'قنوات الحجز · 30 يومًا',
    chanSub: '142 حجزًا · 18% من الغيابات مُنعت بالعربون',
    chGoogle: 'الحجز عبر Google', chWa: 'واتساب مباشر', chWalk: 'بدون موعد', chSite: 'الموقع مباشرة',
    chanFoot: 'الحجز عبر Google متزامن في الوقت الفعلي · لا حجز مزدوج ممكن.',
    paceTitle: 'تنبيه التدفق · 19:00–19:15',
    paceBody: '9 مقاعد تصل في نفس نافذة الـ15 دقيقة. ضغط متوقع على المطبخ. <b>يُنصح بفاصل 15 دقيقة</b> قبل الحجز التالي، أو تأجيله إلى 19:30.',
    paceBtn: 'تطبيق الفاصل',
    close: 'إغلاق', addBtn: '+ حجز جديد',
  },
};

handlers['nav-reservations'] = () => {
  const v = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Café Atlas' };
  const lang = trLang();
  const T = RESV_STR[lang] || RESV_STR.fr;
  const pk = (o) => (o == null ? '' : (o[lang] ?? o.fr ?? ''));
  const escV = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* 7-day strip anchored on the real current date — labels follow the UI language. */
  const LOC = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };
  const dShort = new Intl.DateTimeFormat(LOC[lang] || 'fr-FR', { weekday: 'short', day: 'numeric' });
  const dLong = new Intl.DateTimeFormat(LOC[lang] || 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const now = new Date();
  const COVERS = [38, 41, 52, 28, 32, 22, 18];
  const BLOCKS = [
    [['12:00','14:30',14,'lunch'],['19:00','22:30',24,'dinner']],
    [['11:30','14:00',16,'lunch'],['19:00','22:30',25,'dinner']],
    [['12:00','14:30',18,'lunch'],['19:30','23:00',34,'dinner']],
    [['12:00','14:00',10,'lunch'],['19:30','22:00',18,'dinner']],
    [['11:30','13:30',12,'lunch'],['19:00','22:00',20,'dinner']],
    [['12:00','15:00',22,'lunch']],
    [],
  ];
  /* Les créneaux de service de la semaine. Pour un vrai établissement dont les
   * horaires sont renseignés, ils viennent des HORAIRES et de rien d'autre :
   * c'était l'incohérence la plus visible du produit — un restaurant qui ferme
   * à 02:00 voyait quand même son planning s'arrêter à 22:30, parce que ces
   * blocs étaient écrits en dur ici. Réservations n'a pas — et ne doit pas
   * avoir — son propre réglage d'horaires.
   *
   * Un service qui franchit minuit est tronqué à 24:00 POUR L'AFFICHAGE
   * seulement : la piste horizontale représente une journée, on ne peut pas y
   * dessiner 02:00 du lendemain. La disponibilité réelle, elle, est calculée
   * par KiwiHours.slotsFor() qui, lui, ne tronque rien. */
  const KH = window.KiwiHours;
  const realHours = !!(KH && KH.isConfigured());
  const scheduleBlocks = (d) => {
    const r = KH.periodsOn(d);
    return (r.periods || []).map((p) => {
      const a = KH.toMin(p.from);
      const end = Math.min(1440, a + KH.span(p));
      return [p.from, KH.fromMin(end), 0, a < 15 * 60 ? 'lunch' : 'dinner'];
    });
  };
  const days = COVERS.map((covers, i) => {
    const d = new Date(now); d.setDate(now.getDate() + i);
    return {
      n: dShort.format(d),
      covers: realHours ? 0 : covers,
      blocks: realHours ? scheduleBlocks(d) : BLOCKS[i],
      today: i === 0,
    };
  });
  /* L'amplitude de la piste. Calculée sur ce qui est réellement affiché, avec
     une demi-heure de marge de chaque côté, pour qu'aucun bloc ne déborde. */
  const tMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s)); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
  const TRACK = (() => {
    let a = 24 * 60, b = 0;
    days.forEach((d) => (d.blocks || []).forEach(([from, to]) => {
      a = Math.min(a, tMin(from)); b = Math.max(b, tMin(to));
    }));
    if (a >= b) { a = 11 * 60; b = 23 * 60; }       /* semaine vide : la fenêtre héritée */
    return { a: Math.max(0, a - 30), b: Math.min(1440, b + 30) };
  })();
  const blockColor = (cap, type) => {
    if (cap >= 30) return 'var(--danger)';
    if (cap >= 18) return 'var(--warning)';
    return type === 'lunch' ? 'var(--atlas)' : 'var(--riad)';
  };
  const bookings = [
    { t: '12:30', n: 'Famille Bensaïd', p: 4, note: { fr: 'Terrasse · sans porc', en: 'Terrace · no pork', ar: 'تراس · بدون لحم خنزير' }, ns: 'low', st: 'ok', tag: { fr: '12 visites', en: '12 visits', ar: '12 زيارة' } },
    { t: '13:15', n: 'Tarik & Yasmine', p: 2, note: { fr: 'Salle · table tranquille', en: 'Indoors · quiet table', ar: 'القاعة · طاولة هادئة' }, ns: 'low', st: 'ok', tag: { fr: 'Régulier', en: 'Regular', ar: 'زبون دائم' } },
    { t: '13:45', n: 'Karim Benhima', p: 3, note: { fr: 'Anniversaire · gâteau prévu', en: 'Birthday · cake planned', ar: 'عيد ميلاد · كعكة مجهزة' }, ns: 'low', st: 'ok', tag: { fr: 'Acompte 200', en: 'Deposit 200', ar: 'عربون 200' } },
    { t: '19:00', n: 'Société Atlas Pharma', p: 12, note: { fr: 'Groupe · menu fixe', en: 'Group · set menu', ar: 'مجموعة · قائمة محددة' }, ns: 'med', st: 'pend', tag: { fr: 'Acompte attendu', en: 'Deposit pending', ar: 'عربون مرتقب' } },
    { t: '19:00', n: 'Famille Lahcen', p: 5, note: { fr: 'Terrasse · 2 enfants · chaise haute', en: 'Terrace · 2 kids · high chair', ar: 'تراس · طفلان · كرسي مرتفع' }, ns: 'high', st: 'ok', tag: { fr: 'Alerte pacing', en: 'Pacing alert', ar: 'تنبيه التدفق' } },
    { t: '19:15', n: 'Sophie & Yann', p: 2, note: { fr: 'Touristes · table fenêtre', en: 'Tourists · window table', ar: 'سياح · طاولة بجانب النافذة' }, ns: 'med', st: 'ok', tag: { fr: 'Anniversaire', en: 'Birthday', ar: 'عيد ميلاد' } },
    { t: '20:00', n: 'Hassan & invités', p: 6, note: { fr: 'Salle · vin frais demandé', en: 'Indoors · chilled wine requested', ar: 'القاعة · طلب نبيذ بارد' }, ns: 'low', st: 'ok', tag: { fr: '—', en: '—', ar: '—' } },
    { t: '21:00', n: 'Reservation +212 6 41 ··', p: 4, note: { fr: 'Sans préférence', en: 'No preference', ar: 'بدون تفضيل' }, ns: 'high', st: 'pend', tag: { fr: '2 no-shows', en: '2 no-shows', ar: 'غيابان سابقان' } },
  ];
  const confirmed = bookings.filter((b) => b.st === 'ok').length;
  const pendingDep = bookings.filter((b) => b.st === 'pend').length;
  const waitCount = 3;
  const todayCovers = days[0].covers;
  const todayLong = dLong.format(now);
  const todayShort = dShort.format(now);
  const noShowChip = { low: ['ok', T.ns.low], med: ['pend', T.ns.med], high: ['ref', T.ns.high] };
  window.Kiwi.appPage('reservations', {
    title: T.title,
    subtitle: T.subtitle(v.name, todayCovers, confirmed, waitCount),
    body: `
      <div class="p-hero">
        <div class="l">${escV(todayLong).toUpperCase()} · ${escV(v.name).toUpperCase()}</div>
        <div class="big">${todayCovers} <span style="font-size:18px; opacity:0.7;">${T.heroCovers}</span></div>
        <div class="sub">${T.heroSub(confirmed, pendingDep)}</div>
      </div>

      <div class="sh-section">
        <div class="sh-section-head">
          <div><h4>${T.calTitle}</h4><div class="sub">${T.calSub}</div></div>
          <div class="resv-legend">
            <span><i style="background:var(--atlas);"></i>${T.calm}</span>
            <span><i style="background:var(--warning);"></i>${T.busy}</span>
            <span><i style="background:var(--danger);"></i>${T.sat}</span>
          </div>
        </div>
        <div class="resv-cal">
          ${days.map(d => `
            <div class="rcal-row">
              <div class="rcal-name" style="${d.today ? 'color:var(--atlas); font-weight:600;' : ''}">${d.n}${d.today ? ' · ' + T.today : ''}<div style="font-size:10.5px; color:var(--n-500); font-family:var(--mono); margin-top:2px;">${d.covers} ${T.cov}</div></div>
              <div class="rcal-track">
                ${d.blocks.map(([from, to, cap, type]) => {
                  /* La piste couvre TRACK.a → TRACK.b, calculé sur la semaine
                     réelle (voir plus haut) et non plus figé sur 11 h–23 h : un
                     commerce ouvrant à 08:00 sortait de la piste par la gauche,
                     avec un bloc à left négatif que le navigateur rognait. */
                  const fM = tMin(from); const tM = Math.max(tMin(to), fM + 30);
                  const left = ((fM - TRACK.a) / (TRACK.b - TRACK.a)) * 100;
                  const width = ((tM - fM) / (TRACK.b - TRACK.a)) * 100;
                  return `<div class="rcal-block" style="left:${Math.max(0, left).toFixed(2)}%; width:${Math.min(100 - Math.max(0, left), width).toFixed(2)}%; background:${blockColor(cap, type)};">${from}–${to}${cap ? ' · ' + cap : ''}</div>`;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="rcal-axis"><span>11h</span><span>13h</span><span>15h</span><span>17h</span><span>19h</span><span>21h</span><span>23h</span></div>
      </div>

      <div class="sh-section">
        <div class="sh-section-head">
          <div><h4>${T.bookTitle(todayShort, bookings.length)}</h4><div class="sub">${T.bookSub}</div></div>
          <button class="kb primary" data-action="add-reservation" style="padding:8px 12px; font-size:12.5px;">${T.newBtn}</button>
        </div>
        <table class="p-table" style="font-size:12.5px;">
          <thead><tr><th>${T.th[0]}</th><th>${T.th[1]}</th><th class="right">${T.th[2]}</th><th>${T.th[3]}</th><th>${T.th[4]}</th><th>${T.th[5]}</th></tr></thead>
          <tbody>
            ${bookings.map((b) => {
              const [chipKind, chipLabel] = noShowChip[b.ns];
              return `
                <tr data-action="resv-detail" data-arg="${escV(b.n)}">
                  <td class="mono"><b>${b.t}</b></td>
                  <td><b>${escV(b.n)}</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">${pk(b.tag)}</div></td>
                  <td class="mono right"><b>${b.p}</b> ${T.cov}</td>
                  <td style="color:var(--n-500); font-size:12px;">${pk(b.note)}</td>
                  <td><span class="chip ${chipKind}" style="font-size:10.5px;">${chipLabel}</span></td>
                  <td><span class="chip ${b.st}">${b.st === 'ok' ? T.confirmed : T.deposit}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="sh-grid-2">
        <div class="sh-section" style="margin-bottom:12px;">
          <div class="sh-section-head" style="margin-bottom:10px;">
            <div><h4>${T.waitTitle}</h4><div class="sub">${T.waitSub}</div></div>
            <label style="display:inline-flex; align-items:center; gap:8px; font-size:11.5px; color:var(--n-600);">
              <span style="position:relative; display:inline-block; width:32px; height:18px; background:var(--atlas); border-radius:999px;">
                <span style="position:absolute; top:2px; left:16px; width:14px; height:14px; background:var(--paper); border-radius:50%; transition: transform 200ms, opacity 200ms, background-color 200ms, border-color 200ms, color 200ms, box-shadow 200ms;"></span>
              </span>
              ${T.autoOn}
            </label>
          </div>
          <div class="resv-wait">
            <div><b>+212 6 22 11 09 88</b><div class="m">${T.readyTable(2, 12, 'T7')}</div></div>
            <button class="kb atlas" data-action="resv-sms">${T.smsReady}</button>
          </div>
          <div class="resv-wait">
            <div><b>Mehdi R.</b><div class="m">${T.ready(4, 25)}</div></div>
            <button class="kb ghost" data-action="resv-sms">${T.sms}</button>
          </div>
          <div class="resv-wait">
            <div><b>+212 6 41 02 76 12</b><div class="m">${T.ready(2, 40)}</div></div>
            <button class="kb ghost" data-action="resv-sms">${T.sms}</button>
          </div>
          <div class="rc-foot" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--n-200); font-size:11.5px; color:var(--n-500); line-height:1.45;">
            ${T.waitFoot}
          </div>
        </div>

        <div class="sh-section" style="margin-bottom:12px;">
          <div class="sh-section-head" style="margin-bottom:10px;">
            <div><h4>${T.chanTitle}</h4><div class="sub">${T.chanSub}</div></div>
          </div>
          <div style="display:flex; gap:14px; align-items:center; margin-bottom:14px;">
            <svg viewBox="0 0 80 80" style="width:90px; height:90px; flex-shrink:0;">
              <circle cx="40" cy="40" r="32" fill="none" stroke="var(--n-200)" stroke-width="11" pathLength="100"/>
              <circle cx="40" cy="40" r="32" fill="none" stroke="var(--atlas)" stroke-width="11" pathLength="100" stroke-linecap="butt" stroke-dasharray="39.29 60.71" stroke-dashoffset="25"/>
              <circle cx="40" cy="40" r="32" fill="none" stroke="#7DF2B0"      stroke-width="11" pathLength="100" stroke-linecap="butt" stroke-dasharray="27.35 72.65" stroke-dashoffset="-16.79"/>
              <circle cx="40" cy="40" r="32" fill="none" stroke="#D99A2B"      stroke-width="11" pathLength="100" stroke-linecap="butt" stroke-dasharray="17.40 82.60" stroke-dashoffset="-46.64"/>
              <circle cx="40" cy="40" r="32" fill="none" stroke="var(--riad)"  stroke-width="11" pathLength="100" stroke-linecap="butt" stroke-dasharray="5.96 94.04" stroke-dashoffset="-66.54"/>
            </svg>
            <div style="flex:1; display:flex; flex-direction:column; gap:6px; font-size:12px;">
              ${[
                ['var(--atlas)', T.chGoogle,  60, 42],
                ['#7DF2B0',      T.chWa,      43, 30],
                ['#D99A2B',      T.chWalk,    28, 20],
                ['var(--riad)',  T.chSite,    11, 8],
              ].map(([c, l, n, pct]) => `
                <div style="display:grid; grid-template-columns:10px 1fr auto auto; gap:8px; align-items:center;">
                  <i style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${c};"></i>
                  <span>${l}</span>
                  <span class="mono" style="font-size:11px; color:var(--n-500);">${n}</span>
                  <b class="mono" style="font-size:11px;">${pct} %</b>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="rc-foot" style="padding-top:10px; border-top:1px solid var(--n-200); font-size:11.5px; color:var(--n-500); line-height:1.45;">
            ${T.chanFoot}
          </div>
        </div>
      </div>

      <div style="background:linear-gradient(135deg, #8A6210, #D99A2B); color:var(--paper); border-radius:14px; padding:16px 18px; display:flex; gap:14px; align-items:flex-start;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:2px;"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        <div style="flex:1;">
          <div style="font-weight:600; font-size:13.5px; margin-bottom:3px;">${T.paceTitle}</div>
          <div style="font-size:12.5px; line-height:1.45; opacity:0.95;">${T.paceBody}</div>
        </div>
        <button class="kb" data-action="resv-buffer" style="background:rgba(255,255,255,0.2); color:var(--paper); padding:7px 12px; font-size:12px;">${T.paceBtn}</button>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>${T.close}</button>
      <button class="kb primary" data-action="add-reservation">${T.addBtn}</button>
    `,
  });
};

/* Stub handlers used inside the new drawers */
handlers['upload-kyc']      = () => {
    const T = CONFORMITE_STR[trLang()] || CONFORMITE_STR.fr;
    toast(T.uploadKycToast, { type: 'info', desc: T.uploadKycToastDesc });
};
handlers['kyc-replace']     = () => {
    const T = CONFORMITE_STR[trLang()] || CONFORMITE_STR.fr;
    toast(T.reuploadKycToast, { type: 'info', desc: T.reuploadKycToastDesc });
};
handlers['cal-export']      = () => {
    const T = CONFORMITE_STR[trLang()] || CONFORMITE_STR.fr;
    toast(T.calendarExportToast, { type: 'success', desc: T.calendarExportToastDesc });
};
handlers['audit-export']    = () => {
    const T = CONFORMITE_STR[trLang()] || CONFORMITE_STR.fr;
    toast(T.auditExportToast, { type: 'success', desc: T.auditExportToastDesc });
};
handlers['rotate-secret']   = () => {
    const T = CONFORMITE_STR[trLang()] || CONFORMITE_STR.fr;
    toast(T.rotateSecretToast, { type: 'info', desc: T.rotateSecretToastDesc });
};
// add-member / member-detail / edit-perms are now registered inside
// nav-equipe's handler so they can close over the live team state.
handlers['payslip-pdf']     = () => toast('Bulletin de paie', { type: 'info', desc: 'Génération du PDF et envoi au salarié : bientôt disponible.' });
handlers['generate-payslips'] = () => toast('Bulletins de paie', { type: 'info', desc: 'Génération en lot et envoi à l’équipe : bientôt disponible.' });
handlers['export-dgi']      = () => toast('Export DGI', { type: 'info', desc: 'Export au format attendu par la DGI : bientôt disponible.' });
handlers['all-leaves']      = () => toast('Toutes les demandes de congé', { type: 'info', desc: 'Filtrez par employé, statut ou période.' });
handlers['leave-approve']   = () => toast('Demande approuvée', { type: 'success', desc: 'Pensez à prévenir le salarié : la notification automatique arrive bientôt.' });
handlers['leave-deny']      = () => toast('Demande refusée', { type: 'info', desc: 'Pensez à prévenir le salarié : la notification automatique arrive bientôt.' });
handlers['resv-detail']     = (el) => toast(`Réservation · ${el?.dataset?.arg || ''}`, { type: 'info', desc: 'Profil client unifié · historique · préférences · score no-show.' });
handlers['resv-buffer']     = () => toast('Buffer 15 min appliqué', { type: 'success', desc: 'Prochaine réservation décalée à 19:30 · client notifié WhatsApp.' });
})();

/* ═══ Section 2 rest A · tables / menu ═══ */
(function() {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
  /* Locale helper — every i18n lookup in this IIFE reads through trLang(). */
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Section 2a — restaurant vertical handlers
 * Replaces (or supplements) the existing `nav-tables` and `nav-menu`
 * handlers in /Users/badrosonair/Documents/kiwi/assets/pages.js.
 *
 * APPLY:
 *   1. Append the contents of /tmp/kiwi-s2-rest-css.css to the CSS template
 *      literal at the top of pages.js (just before `</style>`).
 *   2. Replace the bodies of `handlers['nav-tables']` and `handlers['nav-menu']`
 *      in pages.js with the bodies below. Auxiliary handlers
 *      (`tables-merge`, `tables-split`, `tables-move`, `tables-new`,
 *      `menu-add`, `menu-86`, `menu-edit`, `menu-mass`, `menu-schedule`)
 *      can sit alongside in the same `handlers = { ... }` block.
 *
 * DEPENDENCIES (already on window.Kiwi):
 *   toast, modal, drawer, handlers, confetti
 * ─────────────────────────────────────────────────────────────────────────── */

/* ─── helper: wire `data-dismiss` buttons on a modal/drawer to close ─── */
function wireDismiss(m) {
  if (!m || !m.el) return;
  m.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-dismiss]')) m.close();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1 ·  PLAN DE SALLE  ·  layout designer + server assignment + rotation
 *   Three modes share one canvas:
 *     • Layout       — drag tables, add zones, edit table props, templates
 *     • Assignation  — drag servers onto tables, color overlay, per-server stats
 *     • Rotation     — periodic rotation strategy with preview + fairness
 *   State persists in localStorage (kiwiPlanDeSalle) so refreshes survive.
 *   Resetting wipes back to the venue's default template.
 * ═══════════════════════════════════════════════════════════════════════════ */
const PDS_LS_KEY = 'kiwiPlanDeSalle';
/* Per-store floor plan: every store keeps its own layout under its own key. */
function pdsKey() {
  const merchant = pdsMerchantSlug();
  /* Reuse the existing caisse/dashboard mirror key. Never read a built-in
     venue's saved demo plan on behalf of a paired or authenticated merchant. */
  if (merchant) return PDS_LS_KEY + ':slug:' + merchant;
  /* A real, non-custom session without server identity is deliberately not
     persisted: one anonymous fallback key would mix successive merchants. */
  if (pdsNeedsMerchantSlug()) return '';
  const v = (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || 'default';
  return PDS_LS_KEY + ':' + v;
}
/* A floor can belong to a merchant even when KiwiVenue still points at one of
 * the built-in venue ids. That is the dangerous gap: authentication (or a till
 * pairing) is authoritative; `isCustom()` is only a venue-shape detail.
 *
 * Keep the pairing check tied to the paired VENUE record, not to the account
 * logged into this browser. A till changes merchant by pairing, so an account-
 * only check would let the demo floor reappear after a re-pair. */
function pdsMerchantContext() {
  try {
    if (window.KiwiEnv?.isReal?.()) return true;
    if (window.KiwiVenue?.isCustom?.()) return true;
    const paired = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    return !!(paired && (paired.merchant || paired.venueId || paired.name));
  } catch (_) { return false; }
}
function pdsSlug(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function pdsPairedVenue() {
  try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); }
  catch (_) { return null; }
}
function pdsMerchantSlug() {
  const paired = pdsPairedVenue();
  if (paired && paired.merchant) return pdsSlug(paired.merchant);
  try {
    if (window.KiwiEnv?.isReal?.() && !window.KiwiVenue?.isCustom?.()) {
      return pdsSlug(window.KiwiMe?.business || '');
    }
  } catch (_) {}
  return '';
}
function pdsNeedsMerchantSlug() {
  const paired = pdsPairedVenue();
  if (paired && (paired.merchant || paired.venueId || paired.name)) return true;
  try { return !!window.KiwiEnv?.isReal?.() && !window.KiwiVenue?.isCustom?.(); }
  catch (_) { return false; }
}
const PDS_GRID = 16;         /* snap-to-grid unit (px) */
const PDS_CANVAS_W = 880;
const PDS_CANVAS_H = 540;

/* Materials, the fixture catalogue, instance geometry and the table/chair/
   fixture drawing primitives now live in assets/floorplan-core.js, loaded
   just before this file. They are shared verbatim with the caisse so the
   till can render the owner's actual plan instead of its own guess at it. */

/* ─── Vue nuit — la console de service ────────────────────────────────────
 * Le plan que la page d'accueil promet est sombre : une salle charbon, des
 * tables au trait, le statut porté par la lumière. La vue nuit est donc le
 * DÉFAUT ; la vue jour reste entière derrière la bascule, car c'est elle qui
 * montre les matières telles que la caisse les affiche. La préférence vit
 * dans sa propre clé : l'état du plan est partagé avec la caisse, un choix
 * d'affichage du dashboard n'a rien à faire dedans. */
const PDS_VIEW_KEY = 'kiwiPdsView';
function pdsNoir() {
  try { return localStorage.getItem(PDS_VIEW_KEY) !== 'jour'; } catch (_) { return true; }
}
function pdsSetNoir(on) {
  try { localStorage.setItem(PDS_VIEW_KEY, on ? 'nuit' : 'jour'); } catch (_) {}
}
/* Une matière sur la scène nuit : rabattue vers le charbon en gardant `keep`
 * de sa teinte — le noyer reste chaud, le sauge reste vert, mais tout devient
 * nocturne. Encres et chaises suivent d'elles-mêmes : pdsInk/pdsChairTone
 * raisonnent en luminance, pas en clair codé en dur. */
function pdsNoirC(hex, keep) {
  const k = keep == null ? 0.18 : keep;
  const h = String(hex || '#141A16').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const base = [4, 5, 4];      /* #040504 — le charbon de la salle, quasi noir */
  return '#' + [0, 2, 4].map((i, j) => {
    const c = parseInt(n.slice(i, i + 2), 16) || 0;
    return Math.round(base[j] + (c - base[j]) * k).toString(16).padStart(2, '0');
  }).join('');
}
/* Même contrat que PDS_STATUS_RING (la caisse n'y touche pas), mais les
 * valeurs sont CELLES du mockup de l'accueil (SVG fp-* d'index.html) : une
 * échelle de blanc — libre 0.19, réservé 0.40 — et l'accent #00FFAE réservé
 * à l'occupée, qui seule a droit au halo et à l'anneau d'appel. Pas d'ambre :
 * le mockup n'en a pas. `fill`/`num`/`chair` suivent la même échelle. */
const PDS_STATUS_RING_NOIR = {
  /* Échelle remontée d'un cran par rapport au SVG de l'accueil : sur le sol
   * quasi noir demandé, les valeurs du mockup (0.19/0.40) lisaient trop bas.
   * Trois langages de trait pour trois états sans couleur : plein faible
   * (libre), tiret long (réservée), pointillé (à nettoyer). La distinction
   * survit au daltonisme et à la distance — c'est le motif qui parle. */
  free:     { s: 'rgba(255,255,255,0.30)', w: 1.25, dash: '',        fill: 'rgba(255,255,255,0.02)', chair: 'rgba(255,255,255,0.20)' },
  occupied: { s: '#00FFAE',                w: 1.25, dash: '',        fill: 'rgba(0,255,174,0.14)',   chair: 'rgba(0,255,174,0.70)' },
  reserved: { s: '#E8C067', w: 1.25, dash: '6 3',     fill: 'rgba(232,192,103,0.08)', chair: 'rgba(232,192,103,0.50)' },
  cleaning: { s: 'rgba(255,255,255,0.40)', w: 1.25, dash: '1.5 3.5', fill: 'rgba(255,255,255,0.02)', chair: 'rgba(255,255,255,0.20)' },
};
/* Une matière en vue jour ligne-claire : rabattue vers le papier chaud de la
 * marque en gardant `keep` de sa teinte — un lavis, pas une peinture. Le
 * noyer devient un beige chaud, le sauge un vert pâle : la MATIÈRE choisie
 * par le commerçant reste lisible sans casser le dessin à l'encre. */
function pdsJourC(hex, keep) {
  const k = keep == null ? 0.16 : keep;
  const h = String(hex || '#B9AF9B').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const base = [247, 245, 240];   /* #F7F5F0 — le papier de la marque */
  return '#' + [0, 2, 4].map((i, j) => {
    const c = parseInt(n.slice(i, i + 2), 16) || 0;
    return Math.round(base[j] + (c - base[j]) * k).toString(16).padStart(2, '0');
  }).join('');
}
/* Le miroir exact de l'échelle nuit, à l'encre sur papier : une échelle
 * d'encre #0A0F0D — libre 0.30, réservée 0.55 — et l'atlas #0B6E4F réservé
 * à l'occupée, qui seule a droit au halo et à l'anneau d'appel. La menthe
 * appartient à la nuit ; le jour vit en vert de la marque. */
const PDS_STATUS_RING_JOUR = {
  /* Même langage de trait que la nuit : plein faible / tiret long / pointillé.
   * La réservée s'ancre dans le riad #053B2C — encore de la marque, jamais
   * d'ambre ni de bleu. */
  free:     { s: 'rgba(10,15,13,0.30)', w: 1.25, dash: '',        fill: 'rgba(10,15,13,0.015)', chair: 'rgba(10,15,13,0.22)' },
  occupied: { s: '#0B6E4F',             w: 1.25, dash: '',        fill: 'rgba(11,110,79,0.10)', chair: 'rgba(11,110,79,0.70)' },
  reserved: { s: '#C89235',  w: 1.25, dash: '6 3',     fill: 'rgba(200,146,53,0.10)',   chair: 'rgba(200,146,53,0.55)' },
  cleaning: { s: 'rgba(10,15,13,0.45)', w: 1.25, dash: '1.5 3.5', fill: 'rgba(10,15,13,0.02)',  chair: 'rgba(10,15,13,0.24)' },
};

/* ─── Rendu nuit : le trait, pas la matière ───────────────────────────────
 * La scène de l'accueil est un dessin au trait — contours en filet, chaises
 * en tirets, remplissage à peine au-dessus du sol, la lumière réservée à
 * l'état. Re-teinter le rendu matières (bois éclairé, chaises en volume) n'y
 * arrivera jamais : la nuit a son propre tracé, le jour garde le sien. */
function pdsNoirTick(x, y, deg, fill) {
  /* La chaise du mockup, au pixel : rect(-9,-3,18,6, rx 3), centrée à 12 px
   * du bord de la table, la couleur suivant le statut de la table. */
  return `<rect x="-9" y="-3" width="18" height="6" rx="3" fill="${fill}"
    transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})"/>`;
}
function pdsNoirChairs(g, seats, ring) {
  if (!seats || seats < 1) return '';
  const { w, h, shape } = g;
  const fill = (ring && ring.chair) || 'rgba(255,255,255,0.12)';
  let out = '';
  if (shape === 'round') {
    /* Tirets tangents sur la circonférence, comme la grande ronde du mockup. */
    const rx = w / 2 + 12, ry = h / 2 + 12, cx = w / 2, cy = h / 2;
    for (let i = 0; i < seats; i++) {
      const a = -90 + (360 * i) / seats;
      const rad = a * Math.PI / 180;
      out += pdsNoirTick(cx + rx * Math.cos(rad), cy + ry * Math.sin(rad), a + 90, fill);
    }
    return out;
  }
  const alloc = pdsSeatSlots(w, h, seats);
  const along = (n, len) => Array.from({ length: n }, (_, j) => (len * (j + 1)) / (n + 1));
  along(alloc.top, w).forEach(px => { out += pdsNoirTick(px, -12, 0, fill); });
  along(alloc.bottom, w).forEach(px => { out += pdsNoirTick(px, h + 12, 0, fill); });
  along(alloc.left, h).forEach(py => { out += pdsNoirTick(-12, py, 90, fill); });
  along(alloc.right, h).forEach(py => { out += pdsNoirTick(w + 12, py, 90, fill); });
  return out;
}
/* Plateau du mockup, couche par couche : le disque d'appel (dégradé radial
 * menthe, occupée seulement), le corps en dégradé vertical #101312→#050605
 * posé sur une ombre portée (fp-body + fp-lift), puis la couche de statut —
 * remplissage + contour 1.25 sur la MÊME forme, rx 8. L'occupée reçoit en
 * plus l'anneau d'appel qui pulse (classe .pds-noir-call, animée en CSS,
 * l'équivalent exact de .kw-plan-call sur l'accueil). Les dégradés et le
 * filtre vivent une seule fois dans les defs partagées de la scène — les SVG
 * inline résolvent url(#…) à l'échelle du document. */
function pdsNoirTableBody(g, ring, status, tint) {
  /* `tint` absent = scène nuit (corps charbon, halo menthe). Présent = vue
   * jour ligne-claire : le corps est le lavis de la matière du commerçant
   * (pdsJourC), l'ombre et le halo passent aux defs jour (encre, atlas). */
  const jour = tint != null;
  const hot = status === 'occupied';
  const dash = ring.dash ? `stroke-dasharray="${ring.dash}"` : '';
  const fill = ring.fill || 'rgba(255,255,255,0.012)';
  const bodyFill = jour ? tint : 'url(#pdsNoirBody)';
  const lift = jour ? 'url(#pdsJourLift)' : 'url(#pdsNoirLift)';
  const callId = jour ? 'url(#pdsJourCall)' : 'url(#pdsNoirCall)';
  const cx = g.w / 2, cy = g.h / 2;
  /* Le disque d'appel aux valeurs du mockup — le sol quasi noir encaisse
   * la somme des halos sans se noyer, l'adoucissement n'est plus utile. */
  const call = hot ? `<circle cx="${cx}" cy="${cy}" r="${(Math.max(g.w, g.h) * 1.45).toFixed(0)}" fill="${callId}"/>` : '';
  if (g.shape === 'round') {
    return `${call}
      <ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="${bodyFill}" filter="${lift}"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="${fill}" stroke="${ring.s}" stroke-width="${ring.w}" ${dash}/>
      ${hot ? `<ellipse class="pds-noir-call" cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="none" stroke="${ring.s}" stroke-width="${ring.w}"/>` : ''}`;
  }
  const r = Math.min(8, g.w / 5, g.h / 5);
  return `${call}
    <rect x="0" y="0" width="${g.w}" height="${g.h}" rx="${r}" fill="${bodyFill}" filter="${lift}"/>
    <rect x="0" y="0" width="${g.w}" height="${g.h}" rx="${r}" fill="${fill}" stroke="${ring.s}" stroke-width="${ring.w}" ${dash}/>
    ${hot ? `<rect class="pds-noir-call" x="0" y="0" width="${g.w}" height="${g.h}" rx="${r}" fill="none" stroke="${ring.s}" stroke-width="${ring.w}"/>` : ''}`;
}
/* Le bâti au trait. Chaque genre a son idéogramme — la caisse porte son
 * interrupteur menthe, la cuisine ses hachures en filet, la porte son arc —
 * et l'inconnu retombe sur un simple contour. Les gabarits (couleur,
 * matière) ne jouent pas ici : la nuit dessine, elle ne peint pas. */
function pdsNoirFixture(e, K, g) {
  /* Le même trait dans les deux vues, seule l'encre change. Nuit : blanc un
   * cran au-dessus du mockup pour tenir sur le sol quasi noir — filet 0.38,
   * discret 0.20, pilules 0.05 / 0.20 — l'accent #00FFAE réservé au vivant
   * (interrupteur de caisse, plantes). Jour : encre #0A0F0D sur papier —
   * filet 0.45, discret 0.25 — et l'atlas de la marque en accent. */
  const jour = !pdsNoir();
  const line = jour ? 'rgba(10,15,13,0.45)' : 'rgba(255,255,255,0.38)';
  const dim  = jour ? 'rgba(10,15,13,0.25)' : 'rgba(255,255,255,0.20)';
  const pillFill = jour ? 'rgba(10,15,13,0.035)' : 'rgba(255,255,255,0.05)';
  const pillLine = jour ? 'rgba(10,15,13,0.25)' : 'rgba(255,255,255,0.20)';
  const acc = jour ? '11,110,79' : '0,255,174';
  switch (e.type) {
    case 'texte': return '';
    case 'comptoir': {
      /* Le bar du mockup porte ses tabourets : des cercles r 7 cerclés 0.22,
       * espacés de 38, à 15 px au-dessus du long côté. Seulement quand la
       * pilule est vraiment un comptoir (long et bas) — le SVG déborde de la
       * boîte, .pds-el-svg est en overflow:visible la nuit pour ça. */
      let stools = '';
      if (g.w >= 100 && g.w > g.h * 2) {
        const n = Math.max(2, Math.min(8, Math.floor(g.w / 38)));
        for (let i = 0; i < n; i++) {
          const sx = (g.w * (i + 1)) / (n + 1);
          stools += `<circle cx="${sx.toFixed(1)}" cy="-15" r="7" fill="none" stroke="${jour ? 'rgba(10,15,13,0.28)' : 'rgba(255,255,255,0.22)'}" stroke-width="1.25"/>`;
        }
      }
      return `${stools}<rect x="0.5" y="0.5" width="${g.w - 1}" height="${g.h - 1}" rx="${Math.max(3, Math.min(g.h / 2 - 1, 12))}"
        fill="${pillFill}" stroke="${pillLine}" stroke-width="1"/>`;
    }
    case 'caisse': {
      const kr = Math.max(3, Math.min(g.h / 2 - 1, 12));
      /* L'interrupteur du mockup : 22 × 14, rx 3, à 10 px du bord droit. */
      const th = Math.min(14, Math.max(8, g.h - 10)), tw = th / 14 * 22;
      const tx = g.w - tw - 10, ty = (g.h - th) / 2;
      return `<rect x="0.5" y="0.5" width="${g.w - 1}" height="${g.h - 1}" rx="${kr}" fill="${pillFill}" stroke="${pillLine}" stroke-width="1"/>
        <rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${tw.toFixed(1)}" height="${th.toFixed(1)}" rx="3" fill="rgba(${acc},0.14)" stroke="rgba(${acc},0.5)" stroke-width="1"/>`;
    }
    case 'cuisine':
      return `<defs><pattern id="pdsNoirHatch" width="16" height="16" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="16" stroke="${dim}" stroke-width="1"/></pattern></defs>
        <rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="8" fill="url(#pdsNoirHatch)" stroke="${dim}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
    case 'porte':
      /* La porte de l'accueil : seuil net (0.28 · 1.5), battement en arc
       * pointillé 3 3 (0.14 · 1). */
      return `<path d="M2 ${g.h - 2} A ${g.w - 4} ${g.w - 4} 0 0 1 ${g.w - 2} ${g.h - 2}" fill="none" stroke="${dim}" stroke-width="1" stroke-dasharray="3 3"/>
        <line x1="0" y1="${g.h - 1.5}" x2="${g.w}" y2="${g.h - 1.5}" stroke="${line}" stroke-width="1.5"/>`;
    case 'mur':
      return `<rect x="0" y="0" width="${g.w}" height="${g.h}" rx="${Math.min(2, g.h / 2)}" fill="${line}"/>`;
    case 'fenetre':
      return `<rect x="0" y="${g.h / 2 - 0.75}" width="${g.w}" height="1.5" fill="${line}"/>
        <rect x="0" y="0" width="1.5" height="${g.h}" fill="${line}"/>
        <rect x="${g.w - 1.5}" y="0" width="1.5" height="${g.h}" fill="${line}"/>`;
    case 'passe':
      return `<rect x="0.6" y="0.6" width="${g.w - 1.2}" height="${g.h - 1.2}" rx="${Math.min(g.h / 2, 6)}" fill="none" stroke="${dim}" stroke-width="1.2"/>`;
    case 'plante': {
      const cx = g.w / 2, cy = g.h / 2, r = Math.max(2, Math.min(g.w, g.h) / 2 - 1.5);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(${acc},0.04)" stroke="rgba(${acc},0.35)" stroke-width="1.2"/>
        <circle cx="${cx}" cy="${cy}" r="${Math.max(1, r * 0.45)}" fill="none" stroke="rgba(${acc},0.28)" stroke-width="1"/>`;
    }
    case 'colonne':
      return `<rect x="1" y="1" width="${g.w - 2}" height="${g.h - 2}" rx="3" fill="${jour ? 'rgba(10,15,13,0.05)' : 'rgba(255,255,255,0.06)'}" stroke="${line}" stroke-width="1.2"/>`;
    case 'wc':
      return `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="8" fill="none" stroke="${dim}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
    case 'escalier': {
      const n = Math.max(3, Math.min(12, Math.round(g.h / 15))), step = g.h / n;
      let out = `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="4" fill="none" stroke="${dim}" stroke-width="1.2"/>`;
      for (let i = 1; i < n; i++) {
        out += `<line x1="1.5" y1="${(step * i).toFixed(1)}" x2="${g.w - 1.5}" y2="${(step * i).toFixed(1)}" stroke="${dim}" stroke-width="1"/>`;
      }
      return out;
    }
    case 'banquette':
      /* Sur l'accueil la banquette est une seule pilule pleine (0.05 / 0.13,
       * rx 6) — pas de coussins dessinés. */
      return `<rect x="0.5" y="0.5" width="${g.w - 1}" height="${g.h - 1}" rx="${Math.min(6, g.h / 3, g.w / 3)}" fill="${pillFill}" stroke="${pillLine}" stroke-width="1"/>`;
    case 'claustra':
      return `<rect x="0" y="${g.h / 2 - 0.75}" width="${g.w}" height="1.5" fill="${dim}"/>` +
        Array.from({ length: Math.max(2, Math.round(g.w / 11)) }, (_, i) =>
          `<rect x="${(i * 11 + 2).toFixed(1)}" y="0" width="1.5" height="${g.h}" fill="${line}"/>`).join('');
    case 'garde':
      return `<rect x="0" y="${g.h / 2 - 0.75}" width="${g.w}" height="1.5" rx="0.75" fill="${line}"/>` +
        Array.from({ length: Math.max(2, Math.round(g.w / 22)) }, (_, i) =>
          `<rect x="${(i * 22 + 2).toFixed(1)}" y="0" width="1.5" height="${g.h}" fill="${dim}"/>`).join('');
    case 'tapis':
      return `<rect x="1" y="1" width="${g.w - 2}" height="${g.h - 2}" rx="3" fill="${jour ? 'rgba(10,15,13,0.02)' : 'rgba(255,255,255,0.02)'}" stroke="${dim}" stroke-width="1.2" stroke-dasharray="2 3"/>`;
    case 'vitrine':
      return jour
        ? `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="6" fill="rgba(64,102,124,0.08)" stroke="rgba(64,102,124,0.45)" stroke-width="1.2"/>`
        : `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="6" fill="rgba(191,217,232,0.05)" stroke="rgba(191,217,232,0.35)" stroke-width="1.2"/>`;
    default:
      return `<rect x="0.75" y="0.75" width="${Math.max(2, g.w - 1.5)}" height="${Math.max(2, g.h - 1.5)}" rx="6" fill="none" stroke="${dim}" stroke-width="1.2"/>`;
  }
}
/* Le sol la nuit : charbon teinté par le sol du commerçant, une grille fine
 * calée sur le pas d'aimantation (3 × PDS_GRID), et un souffle de lumière
 * depuis le haut — la même lumière que l'accueil sombre. Les finitions
 * (terrazzo, zellige) sont dessinées à l'encre sombre et disparaîtraient
 * ici ; la grille les remplace, la vue jour les garde. */
function pdsRoomShellNoir(zone) {
  /* Le sol du mockup (fp-floor + fp-grid) : un souffle blanc décentré —
   * 0.05 à 42 % / 34 %, 0.015 à 60 %, rien au bord — sur le charbon teinté
   * par le sol du commerçant, et la grille fine de 31 px à 0.028. Le mur est
   * le trait blanc 0.13 de l'accueil, pas la matière du gabarit. */
  const r = pdsRoom(zone);
  return `<div class="pds-floor" data-pds-floor style="
    background-color:${pdsNoirC(r.floor, 0.03)};
    background-image:
      radial-gradient(78% 78% at 42% 34%, rgba(255,255,255,0.04), rgba(255,255,255,0.012) 60%, transparent 100%),
      linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px);
    background-size: 100% 100%, 31px 31px, 31px 31px;
    background-repeat: no-repeat, repeat, repeat;
    ${r.wallW > 2 ? `box-shadow: inset 0 0 0 ${r.wallW}px rgba(255,255,255,0.20);` : ''}
  "></div>`;
}
/* Le sol le jour : le même dessin, à l'encre sur papier. Le sol choisi par le
 * commerçant devient un lavis sur le papier chaud (pdsJourC 0.30 — assez pour
 * distinguer chêne de béton, pas assez pour casser le dessin), la grille
 * passe à l'encre fine, la lumière entre par la même fenêtre décentrée que la
 * nuit — en blanc franc, c'est le matin — et le mur est un trait d'encre,
 * comme la nuit le fait en blanc : le mur du gabarit ne peint pas ici. */
function pdsRoomShellJour(zone) {
  const r = pdsRoom(zone);
  return `<div class="pds-floor" data-pds-floor style="
    background-color:${pdsJourC(r.floor, 0.30)};
    background-image:
      radial-gradient(78% 78% at 42% 34%, rgba(255,255,255,0.50), rgba(255,255,255,0.15) 60%, transparent 100%),
      linear-gradient(rgba(10,15,13,0.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(10,15,13,0.055) 1px, transparent 1px);
    background-size: 100% 100%, 31px 31px, 31px 31px;
    background-repeat: no-repeat, repeat, repeat;
    ${r.wallW > 2 ? `box-shadow: inset 0 0 0 ${r.wallW}px rgba(10,15,13,0.30);` : ''}
  "></div>`;
}


/* ─── Static i18n table — every label, status, role, template name ───────── */
const PDS_STR = {
  fr: {
    title: 'Plan de salle',
    subtitle: (name, n, occ) => `${name} · ${n} tables · ${occ} occupées en service`,
    tagPdS: 'PLAN DE SALLE',
    /* Modes */
    modeLayout: 'Aménagement',
    modeAssign: 'Affectation',
    modeRotate: 'Rotation',
    modeLayoutDesc: 'Glissez les tables · clic pour éditer · ajoutez murs, portes et plantes pour visualiser le restaurant.',
    modeAssignDesc: 'Glissez un serveur sur une table pour l\'affecter · cliquez une table pour réassigner.',
    modeRotateDesc: 'Faites tourner les serveurs entre zones et tables pour éviter la lassitude, équité automatique.',
    /* Top bar */
    save: 'Sauvegarder',
    saving: 'Enregistrement…',
    savedButton: 'Enregistré',
    saved: 'Plan enregistré',
    savedDesc: 'Toutes les modifications ont bien été enregistrées.',
    reset: 'Réinitialiser',
    resetTitle: 'Réinitialiser le plan ?',
    resetDesc: 'Supprime toutes les tables, zones et affectations · charge le template par défaut. Action irréversible.',
    resetCancel: 'Annuler',
    resetConfirm: 'Réinitialiser',
    resetDone: 'Plan réinitialisé',
    resetDoneDesc: 'Template par défaut chargé · 16 tables, 3 zones.',
    templates: 'Templates',
    export: 'Exporter le plan',
    exportToast: 'Plan exporté',
    exportDesc: 'PDF A3 · 1 page · prêt pour impression ou WhatsApp.',
    /* KPIs */
    kpiTables: 'TABLES',
    kpiCovers: 'COUVERTS',
    kpiZones: 'ZONES',
    kpiServers: 'SERVEURS',
    /* Zones */
    addZone: 'Ajouter une zone',
    addZoneDesc: 'Une nouvelle zone apparaîtra dans les onglets · vous pourrez la peupler de tables.',
    zoneName: 'Nom de la zone',
    zoneAdd: 'Créer',
    zoneAdded: 'Zone ajoutée',
    zoneAddedDesc: (n) => `Zone "${n}" créée · cliquez pour la sélectionner.`,
    renameZone: 'Renommer',
    renameZoneTitle: 'Renommer la zone',
    deleteZone: 'Supprimer la zone',
    deleteZoneTitle: 'Supprimer cette zone ?',
    deleteZoneDesc: (n, c) => `La zone "${n}" et ses ${c} tables seront retirées du plan. Action irréversible.`,
    deleteZoneOk: 'Supprimer',
    deleteZoneDone: 'Zone supprimée',
    deleteZoneNoLast: 'Dernière zone',
    deleteZoneNoLastDesc: 'Vous devez garder au moins une zone active.',
    zoneRenamedDesc: (n) => `Zone renommée en "${n}".`,
    /* Add table palette */
    paletteTitle: 'Ajouter une table',
    paletteHint: 'Cliquez pour ajouter, la table apparaît au centre de la zone.',
    /* Une table comme un comptoir s'ouvrent de la même façon ; rien ne le
       disait, et le comptoir passait pour un décor qu'on ne peut pas toucher. */
    editHint: 'Cliquez un objet posé — table, comptoir, cuisine, plante — pour le redimensionner ou le supprimer.',
    structTitle: 'Éléments structurels',
    structHint: 'Murs, portes, fenêtres et plantes, purement visuels.',
    elWall: 'Mur',
    elDoor: 'Porte',
    elWindow: 'Fenêtre',
    elColumn: 'Colonne',
    elPlant: 'Plante',
    tRound: 'Ronde',
    tSquare: 'Carrée',
    tRect: 'Rectangulaire',
    tBar: 'Bar / Comptoir',
    tHigh: 'Mange-debout',
    seats: 'places',
    addedTableToast: (id) => `Table ${id} ajoutée`,
    addedTableDesc: (s, z) => `${s} couverts · ${z} · glissez-la pour la positionner.`,
    addedElementToast: 'Élément ajouté',
    addedElementDesc: 'Glissez-le pour positionner · cliquez pour pivoter.',
    /* Snap */
    viewNuit: 'Vue nuit — console de service',
    viewJour: 'Vue jour — matières & décor',
    snapOn: 'Aimanter',
    snapOff: 'Libre',
    snapHint: 'Aimanter aligne les tables sur la grille',
    /* Table inspector */
    inspectorTitle: (id) => `Table ${id}`,
    inspectorNum: 'Numéro',
    inspectorType: 'Type',
    inspectorSeats: 'Places',
    inspectorStatus: 'Statut',
    inspectorNotes: 'Notes',
    inspectorServer: 'Serveur affecté',
    inspectorRotate: 'Pivoter',
    inspectorDuplicate: 'Dupliquer',
    inspectorDelete: 'Supprimer',
    inspectorDone: 'Modifications enregistrées',
    inspectorUnassigned: 'Aucun',
    statusFree: 'Libre',
    statusOccupied: 'Occupée',
    statusReserved: 'Réservée',
    statusCleaning: 'À nettoyer',
    /* Selection / bulk */
    selection: 'Sélection',
    bulkAlignH: 'Aligner horiz.',
    bulkAlignV: 'Aligner vert.',
    bulkDistH: 'Distribuer horiz.',
    bulkDistV: 'Distribuer vert.',
    bulkDelete: 'Supprimer',
    bulkClear: 'Désélectionner',
    bulkSetStatus: 'Statut',
    bulkOkAlign: 'Tables alignées',
    bulkOkDist: 'Tables distribuées uniformément',
    bulkOkDelete: (n) => `${n} tables supprimées`,
    bulkOkStatus: (n, s) => `${n} tables marquées ${s}`,
    bulkHintNone: 'Maintenez Maj et cliquez pour sélectionner plusieurs tables · au moins 2 pour aligner.',
    /* Groupement */
    groupTables: 'Grouper',
    ungroupTables: 'Dissocier',
    groupPickHint: 'Cliquez sur une autre table pour la grouper avec celle-ci.',
    groupPickCancel: 'Groupement annulé',
    groupOk: (a, b) => `Tables ${a} + ${b} groupées`,
    ungroupOk: 'Tables dissociées',
    bulkGroup: 'Grouper la sélection',
    bulkOkGroup: (n) => `${n} tables groupées`,
    groupCovers: (n) => `${n} couverts`,
    groupedWith: (nums) => `Groupée avec ${nums}`,
    /* Templates */
    templatesTitle: 'Templates de salle',
    templatesDesc: 'Démarrez avec une disposition pré-construite · vous pourrez la modifier ensuite.',
    tplBistro: 'Bistro · 30 couverts',
    tplBistroDesc: '8 tables intérieures + petite terrasse · 1 zone bar',
    tplResto: 'Restaurant · 60 couverts',
    tplRestoDesc: 'Salle principale 12 tables, terrasse, salon privé',
    tplCafe: 'Café · 20 couverts',
    tplCafeDesc: '6 mange-debout, comptoir, 3 tables ronde',
    tplBrasserie: 'Brasserie terrasse · 80 couverts',
    tplBrasserieDesc: 'Grande terrasse 10 tables, salle 8 tables, bar',
    tplBlank: 'Plan vierge',
    tplBlankDesc: 'Commencez de zéro · une seule zone vide',
    tplApply: 'Charger ce template',
    tplApplyConfirm: (n) => `Charger "${n}" ?`,
    tplApplyConfirmDesc: 'Le plan actuel sera remplacé. Pensez à exporter d\'abord si nécessaire.',
    tplLoaded: (n) => `${n} chargé`,
    tplLoadedDesc: 'Disposition initiale prête · personnalisez librement.',
    /* Empty state */
    emptyTitle: 'Commencez par choisir un template',
    emptyDesc: 'Ou créez votre première table, vous pouvez tout modifier ensuite.',
    emptyChoose: 'Choisir un template',
    emptyBlank: 'Démarrer vierge',
    /* Assignation mode */
    rosterTitle: 'Équipe en service',
    rosterHint: 'Glissez une pastille vers une table ou une zone',
    rosterShift: 'Shift soir',
    rosterUnassigned: 'Non affecté',
    rosterTables: (n) => `${n} tables`,
    rosterCovers: (n) => `${n} couverts`,
    clearAssign: 'Effacer toutes les affectations',
    clearAssignTitle: 'Effacer toutes les affectations ?',
    clearAssignDesc: 'Aucun serveur ne sera affecté à aucune table. Les affectations seront vides jusqu\'à réassignation.',
    clearAssignOk: 'Effacer',
    clearAssignDone: 'Affectations effacées',
    clearAssignDoneDesc: 'Toutes les tables sont libres d\'affectation serveur.',
    assignDone: (s, t) => `${s} affecté à ${t}`,
    assignDoneDesc: 'Coloré sur le plan · synchronisé avec l\'app serveur.',
    unassignDone: (t) => `${t} libérée d'affectation`,
    /* Rotation */
    rotateTitle: 'Configurer la rotation',
    rotateCTA: 'Configurer',
    rotateDesc: 'Quand vos serveurs alternent, ils restent motivés et apprennent toutes les tables.',
    rotatePeriod: 'Période',
    rotateDaily: 'Chaque jour',
    rotateShift: 'Chaque shift',
    rotateWeekly: 'Chaque semaine',
    rotateCustom: 'Personnalisée',
    rotateStrategy: 'Stratégie',
    rotZones: 'Rotation des zones',
    rotZonesDesc: 'Les serveurs tournent entre zones (recommandé)',
    rotTables: 'Rotation des tables',
    rotTablesDesc: 'Round-robin sur toutes les tables',
    rotPairs: 'Permutation par paires',
    rotPairsDesc: 'Vous choisissez les paires manuellement',
    rotPreview: 'Aperçu des 3 prochaines rotations',
    rotFairness: 'Équité par serveur',
    rotApply: 'Appliquer la rotation',
    rotApplied: 'Rotation appliquée',
    rotAppliedDesc: 'Tous les serveurs notifiés sur leur app · plan mis à jour.',
    rotNow: 'Tourner maintenant',
    rotNowDone: 'Rotation effectuée',
    rotNowDoneDesc: 'Nouvelles affectations actives · serveurs notifiés.',
    rotHistoryTitle: 'Historique de la semaine',
    rotHistoryHint: 'Vérifiez visuellement que personne ne reste sur la même zone trop longtemps.',
    rotNoneTitle: 'Aucune rotation configurée',
    rotNoneDesc: 'Configurez une rotation pour éviter que vos serveurs restent sur la même table pendant des mois.',
    rotNoneCTA: 'Configurer',
    fairnessLow: 'a trop fait cette zone, son tour arrive',
    fairnessHigh: 'rotation équilibrée',
    /* Status legend */
    legendTitle: 'Statuts',
    /* Generic */
    cancel: 'Annuler',
    close: 'Fermer',
    save2: 'Enregistrer',
    /* Days of week */
    days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    soonAvailable: 'Bientôt disponible',
    /* Scene picker (zone backdrop) */
    sceneLabel: 'Décor de la zone',
    sceneHint: (n) => `Change l'arrière-plan visuel de${n ? ` « ${n} »` : ' cette zone'}, purement esthétique, n'affecte pas vos tables.`,
    sceneSalle: 'Salle intérieure',
    sceneTerrasse: 'Terrasse extérieure',
    sceneBar: 'Bar / Comptoir',
    sceneEtage: 'Étage / Mezzanine',
    scenePrive: 'Salon privé',
    sceneBlank: 'Vierge (sans fixtures)',
    /* Floor toggle */
    floorRDC: 'Rez-de-chaussée',
    floorEtage: '1ᵉʳ étage',
    /* Room labels */
    roomLabel: (zone) => `${zone} · vue propriétaire`,
    viewOwner: 'vue propriétaire',
    floorCount: (occ, total) => `${total} tables · ${occ} occupées`,
  },
  en: {
    title: 'Floor Plan',
    subtitle: (name, n, occ) => `${name} · ${n} tables · ${occ} in service`,
    tagPdS: 'FLOOR PLAN',
    modeLayout: 'Layout',
    modeAssign: 'Assignment',
    modeRotate: 'Rotation',
    modeLayoutDesc: 'Drag tables · click to edit · add walls, doors and plants to visualize the room.',
    modeAssignDesc: 'Drag a server onto a table to assign · click a table to reassign.',
    modeRotateDesc: 'Rotate servers across zones and tables so they don\'t burn out, fairness built-in.',
    save: 'Save',
    saving: 'Saving…',
    savedButton: 'Saved',
    saved: 'Plan saved',
    savedDesc: 'All floor-plan changes were saved successfully.',
    reset: 'Reset',
    resetTitle: 'Reset the plan?',
    resetDesc: 'Removes all tables, zones and assignments · loads the default template. Cannot be undone.',
    resetCancel: 'Cancel',
    resetConfirm: 'Reset',
    resetDone: 'Plan reset',
    resetDoneDesc: 'Default template loaded · 16 tables, 3 zones.',
    templates: 'Templates',
    export: 'Export plan',
    exportToast: 'Plan exported',
    exportDesc: 'A3 PDF · 1 page · ready for print or WhatsApp.',
    kpiTables: 'TABLES',
    kpiCovers: 'COVERS',
    kpiZones: 'ZONES',
    kpiServers: 'SERVERS',
    addZone: 'Add a zone',
    addZoneDesc: 'A new zone will appear in the tabs · you can populate it with tables.',
    zoneName: 'Zone name',
    zoneAdd: 'Create',
    zoneAdded: 'Zone added',
    zoneAddedDesc: (n) => `Zone "${n}" created · click to select it.`,
    renameZone: 'Rename',
    renameZoneTitle: 'Rename zone',
    deleteZone: 'Delete zone',
    deleteZoneTitle: 'Delete this zone?',
    deleteZoneDesc: (n, c) => `Zone "${n}" and its ${c} tables will be removed. Cannot be undone.`,
    deleteZoneOk: 'Delete',
    deleteZoneDone: 'Zone deleted',
    deleteZoneNoLast: 'Last zone',
    deleteZoneNoLastDesc: 'You must keep at least one active zone.',
    zoneRenamedDesc: (n) => `Zone renamed to "${n}".`,
    paletteTitle: 'Add a table',
    paletteHint: 'Click to add, the table appears at the center of the zone.',
    editHint: 'Click any placed object — table, counter, kitchen, plant — to resize or delete it.',
    structTitle: 'Structural elements',
    structHint: 'Walls, doors, windows and plants, visual only.',
    elWall: 'Wall',
    elDoor: 'Door',
    elWindow: 'Window',
    elColumn: 'Column',
    elPlant: 'Plant',
    tRound: 'Round',
    tSquare: 'Square',
    tRect: 'Rectangular',
    tBar: 'Bar / Counter',
    tHigh: 'High table',
    seats: 'seats',
    addedTableToast: (id) => `Table ${id} added`,
    addedTableDesc: (s, z) => `${s} seats · ${z} · drag to position.`,
    addedElementToast: 'Element added',
    addedElementDesc: 'Drag to position · click to rotate.',
    viewNuit: 'Night view — service console',
    viewJour: 'Day view — materials & decor',
    snapOn: 'Snap',
    snapOff: 'Free',
    snapHint: 'Snap aligns tables to the grid',
    inspectorTitle: (id) => `Table ${id}`,
    inspectorNum: 'Number',
    inspectorType: 'Type',
    inspectorSeats: 'Seats',
    inspectorStatus: 'Status',
    inspectorNotes: 'Notes',
    inspectorServer: 'Assigned server',
    inspectorRotate: 'Rotate',
    inspectorDuplicate: 'Duplicate',
    inspectorDelete: 'Delete',
    inspectorDone: 'Changes saved',
    inspectorUnassigned: 'None',
    statusFree: 'Free',
    statusOccupied: 'Occupied',
    statusReserved: 'Reserved',
    statusCleaning: 'Cleaning',
    selection: 'Selection',
    bulkAlignH: 'Align horiz.',
    bulkAlignV: 'Align vert.',
    bulkDistH: 'Distribute horiz.',
    bulkDistV: 'Distribute vert.',
    bulkDelete: 'Delete',
    bulkClear: 'Deselect',
    bulkSetStatus: 'Status',
    bulkOkAlign: 'Tables aligned',
    bulkOkDist: 'Tables distributed evenly',
    bulkOkDelete: (n) => `${n} tables deleted`,
    bulkOkStatus: (n, s) => `${n} tables set to ${s}`,
    bulkHintNone: 'Hold Shift and click to select multiple tables · at least 2 to align.',
    groupTables: 'Group',
    ungroupTables: 'Ungroup',
    groupPickHint: 'Click another table to group it with this one.',
    groupPickCancel: 'Grouping cancelled',
    groupOk: (a, b) => `Tables ${a} + ${b} grouped`,
    ungroupOk: 'Tables ungrouped',
    bulkGroup: 'Group selection',
    bulkOkGroup: (n) => `${n} tables grouped`,
    groupCovers: (n) => `${n} covers`,
    groupedWith: (nums) => `Grouped with ${nums}`,
    templatesTitle: 'Room templates',
    templatesDesc: 'Start from a pre-built layout · you can modify it after.',
    tplBistro: 'Bistro · 30 covers',
    tplBistroDesc: '8 indoor tables + small terrace · 1 bar zone',
    tplResto: 'Restaurant · 60 covers',
    tplRestoDesc: 'Main hall 12 tables, terrace, private room',
    tplCafe: 'Café · 20 covers',
    tplCafeDesc: '6 high tables, counter, 3 round tables',
    tplBrasserie: 'Brasserie terrace · 80 covers',
    tplBrasserieDesc: 'Large terrace 10 tables, hall 8 tables, bar',
    tplBlank: 'Blank plan',
    tplBlankDesc: 'Start from scratch · one empty zone',
    tplApply: 'Load this template',
    tplApplyConfirm: (n) => `Load "${n}"?`,
    tplApplyConfirmDesc: 'The current plan will be replaced. Export first if needed.',
    tplLoaded: (n) => `${n} loaded`,
    tplLoadedDesc: 'Initial layout ready · customize freely.',
    emptyTitle: 'Start by choosing a template',
    emptyDesc: 'Or create your first table, you can change everything later.',
    emptyChoose: 'Choose a template',
    emptyBlank: 'Start blank',
    rosterTitle: 'Team on shift',
    rosterHint: 'Drag a chip onto a table or a zone',
    rosterShift: 'Evening shift',
    rosterUnassigned: 'Unassigned',
    rosterTables: (n) => `${n} tables`,
    rosterCovers: (n) => `${n} covers`,
    clearAssign: 'Clear all assignments',
    clearAssignTitle: 'Clear all assignments?',
    clearAssignDesc: 'No server will be assigned to any table. Assignments will be empty until reassigned.',
    clearAssignOk: 'Clear',
    clearAssignDone: 'Assignments cleared',
    clearAssignDoneDesc: 'All tables are now free of server assignment.',
    assignDone: (s, t) => `${s} assigned to ${t}`,
    assignDoneDesc: 'Highlighted on the plan · synced with the server app.',
    unassignDone: (t) => `${t} unassigned`,
    rotateTitle: 'Configure rotation',
    rotateCTA: 'Configure',
    rotateDesc: 'When your servers alternate, they stay motivated and learn every table.',
    rotatePeriod: 'Period',
    rotateDaily: 'Every day',
    rotateShift: 'Every shift',
    rotateWeekly: 'Every week',
    rotateCustom: 'Custom',
    rotateStrategy: 'Strategy',
    rotZones: 'Zone rotation',
    rotZonesDesc: 'Servers rotate across zones (recommended)',
    rotTables: 'Table rotation',
    rotTablesDesc: 'Round-robin on all tables',
    rotPairs: 'Manual pair swap',
    rotPairsDesc: 'You choose the pairs manually',
    rotPreview: 'Preview of next 3 rotations',
    rotFairness: 'Fairness per server',
    rotApply: 'Apply rotation',
    rotApplied: 'Rotation applied',
    rotAppliedDesc: 'All servers notified on their app · plan updated.',
    rotNow: 'Rotate now',
    rotNowDone: 'Rotation done',
    rotNowDoneDesc: 'New assignments active · servers notified.',
    rotHistoryTitle: 'This week history',
    rotHistoryHint: 'Visually check that nobody stays on the same zone too long.',
    rotNoneTitle: 'No rotation configured',
    rotNoneDesc: 'Set up a rotation so servers don\'t stay on the same table for months.',
    rotNoneCTA: 'Configure',
    fairnessLow: 'has done this zone too much, turn coming up',
    fairnessHigh: 'balanced rotation',
    legendTitle: 'Statuses',
    cancel: 'Cancel',
    close: 'Close',
    save2: 'Save',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    soonAvailable: 'Coming soon',
    /* Scene picker */
    sceneLabel: 'Zone backdrop',
    sceneHint: (n) => `Change the visual backdrop of${n ? ` "${n}"` : ' this zone'}, purely cosmetic, doesn't affect your tables.`,
    sceneSalle: 'Indoor dining',
    sceneTerrasse: 'Outdoor terrace',
    sceneBar: 'Bar / Counter',
    sceneEtage: 'Mezzanine / Upper',
    scenePrive: 'Private room',
    sceneBlank: 'Blank (no fixtures)',
    floorRDC: 'Ground floor',
    floorEtage: 'Upper floor',
    roomLabel: (zone) => `${zone} · owner view`,
    viewOwner: 'owner view',
    floorCount: (occ, total) => `${total} tables · ${occ} occupied`,
  },
  ar: {
    title: 'مخطط القاعة',
    subtitle: (name, n, occ) => `${name} · ${n} طاولة · ${occ} قيد الخدمة`,
    tagPdS: 'مخطط القاعة',
    modeLayout: 'التصميم',
    modeAssign: 'الإسناد',
    modeRotate: 'التدوير',
    modeLayoutDesc: 'اسحب الطاولات · انقر للتعديل · أضف الجدران والأبواب والنباتات لتخيل القاعة.',
    modeAssignDesc: 'اسحب نادلًا فوق طاولة لإسنادها · انقر طاولة لإعادة الإسناد.',
    modeRotateDesc: 'قم بتدوير النوادل بين المناطق والطاولات حتى لا يملّوا، العدالة تلقائية.',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    savedButton: 'تم الحفظ',
    saved: 'تم حفظ المخطط',
    savedDesc: 'تم حفظ جميع تغييرات مخطط القاعة بنجاح.',
    reset: 'إعادة تعيين',
    resetTitle: 'إعادة تعيين المخطط؟',
    resetDesc: 'يحذف كل الطاولات والمناطق والإسنادات · يحمّل القالب الافتراضي. لا يمكن التراجع.',
    resetCancel: 'إلغاء',
    resetConfirm: 'إعادة تعيين',
    resetDone: 'تمت إعادة تعيين المخطط',
    resetDoneDesc: 'تم تحميل القالب الافتراضي · 16 طاولة، 3 مناطق.',
    templates: 'القوالب',
    export: 'تصدير المخطط',
    exportToast: 'تم تصدير المخطط',
    exportDesc: 'PDF بحجم A3 · صفحة واحدة · جاهز للطباعة أو WhatsApp.',
    kpiTables: 'الطاولات',
    kpiCovers: 'المقاعد',
    kpiZones: 'المناطق',
    kpiServers: 'النوادل',
    addZone: 'إضافة منطقة',
    addZoneDesc: 'ستظهر منطقة جديدة في التبويبات · يمكنك ملؤها بالطاولات.',
    zoneName: 'اسم المنطقة',
    zoneAdd: 'إنشاء',
    zoneAdded: 'تمت إضافة المنطقة',
    zoneAddedDesc: (n) => `تم إنشاء المنطقة "${n}" · انقر لاختيارها.`,
    renameZone: 'إعادة تسمية',
    renameZoneTitle: 'إعادة تسمية المنطقة',
    deleteZone: 'حذف المنطقة',
    deleteZoneTitle: 'حذف هذه المنطقة؟',
    deleteZoneDesc: (n, c) => `سيتم حذف المنطقة "${n}" و${c} طاولاتها. لا يمكن التراجع.`,
    deleteZoneOk: 'حذف',
    deleteZoneDone: 'تم حذف المنطقة',
    deleteZoneNoLast: 'المنطقة الأخيرة',
    deleteZoneNoLastDesc: 'يجب الإبقاء على منطقة نشطة واحدة على الأقل.',
    zoneRenamedDesc: (n) => `تمت إعادة تسمية المنطقة إلى "${n}".`,
    paletteTitle: 'إضافة طاولة',
    paletteHint: 'انقر للإضافة، تظهر الطاولة في وسط المنطقة.',
    editHint: 'انقر أي عنصر موضوع — طاولة، بار، مطبخ، نبتة — لتغيير حجمه أو حذفه.',
    structTitle: 'العناصر الهيكلية',
    structHint: 'جدران، أبواب، نوافذ ونباتات، للعرض فقط.',
    elWall: 'جدار',
    elDoor: 'باب',
    elWindow: 'نافذة',
    elColumn: 'عمود',
    elPlant: 'نبتة',
    tRound: 'مستديرة',
    tSquare: 'مربعة',
    tRect: 'مستطيلة',
    tBar: 'بار / كاونتر',
    tHigh: 'طاولة عالية',
    seats: 'مقاعد',
    addedTableToast: (id) => `تمت إضافة الطاولة ${id}`,
    addedTableDesc: (s, z) => `${s} مقاعد · ${z} · اسحبها للموقع.`,
    addedElementToast: 'تمت إضافة العنصر',
    addedElementDesc: 'اسحب للموقع · انقر للتدوير.',
    viewNuit: 'عرض ليلي — وحدة الخدمة',
    viewJour: 'عرض نهاري — الخامات والديكور',
    snapOn: 'محاذاة',
    snapOff: 'حر',
    snapHint: 'المحاذاة تصفّ الطاولات على الشبكة',
    inspectorTitle: (id) => `طاولة ${id}`,
    inspectorNum: 'الرقم',
    inspectorType: 'النوع',
    inspectorSeats: 'المقاعد',
    inspectorStatus: 'الحالة',
    inspectorNotes: 'ملاحظات',
    inspectorServer: 'النادل المعين',
    inspectorRotate: 'تدوير',
    inspectorDuplicate: 'نسخ',
    inspectorDelete: 'حذف',
    inspectorDone: 'تم حفظ التعديلات',
    inspectorUnassigned: 'لا أحد',
    statusFree: 'متاحة',
    statusOccupied: 'مشغولة',
    statusReserved: 'محجوزة',
    statusCleaning: 'للتنظيف',
    selection: 'المحدد',
    bulkAlignH: 'محاذاة أفقيًا',
    bulkAlignV: 'محاذاة عموديًا',
    bulkDistH: 'توزيع أفقي',
    bulkDistV: 'توزيع عمودي',
    bulkDelete: 'حذف',
    bulkClear: 'إلغاء التحديد',
    bulkSetStatus: 'الحالة',
    bulkOkAlign: 'تمت محاذاة الطاولات',
    bulkOkDist: 'تم توزيع الطاولات بالتساوي',
    bulkOkDelete: (n) => `تم حذف ${n} طاولة`,
    bulkOkStatus: (n, s) => `تم تعيين ${n} طاولة على ${s}`,
    bulkHintNone: 'اضغط Shift وانقر لاختيار عدة طاولات · 2 على الأقل للمحاذاة.',
    groupTables: 'تجميع',
    ungroupTables: 'فصل',
    groupPickHint: 'انقر على طاولة أخرى لتجميعها مع هذه.',
    groupPickCancel: 'تم إلغاء التجميع',
    groupOk: (a, b) => `تم تجميع الطاولتين ${a} + ${b}`,
    ungroupOk: 'تم فصل الطاولات',
    bulkGroup: 'تجميع المحدد',
    bulkOkGroup: (n) => `تم تجميع ${n} طاولات`,
    groupCovers: (n) => `${n} مقعدًا`,
    groupedWith: (nums) => `مجمّعة مع ${nums}`,
    templatesTitle: 'قوالب القاعة',
    templatesDesc: 'ابدأ بترتيب جاهز · يمكنك تعديله لاحقًا.',
    tplBistro: 'بيسترو · 30 مقعدًا',
    tplBistroDesc: '8 طاولات داخلية + شرفة صغيرة · منطقة بار واحدة',
    tplResto: 'مطعم · 60 مقعدًا',
    tplRestoDesc: 'قاعة رئيسية 12 طاولة، شرفة، صالون خاص',
    tplCafe: 'مقهى · 20 مقعدًا',
    tplCafeDesc: '6 طاولات عالية، كاونتر، 3 طاولات مستديرة',
    tplBrasserie: 'شرفة برآسري · 80 مقعدًا',
    tplBrasserieDesc: 'شرفة كبيرة 10 طاولات، قاعة 8 طاولات، بار',
    tplBlank: 'مخطط فارغ',
    tplBlankDesc: 'ابدأ من الصفر · منطقة فارغة واحدة',
    tplApply: 'تحميل هذا القالب',
    tplApplyConfirm: (n) => `تحميل "${n}"؟`,
    tplApplyConfirmDesc: 'سيتم استبدال المخطط الحالي. صدّر أولًا إن أردت.',
    tplLoaded: (n) => `تم تحميل ${n}`,
    tplLoadedDesc: 'الترتيب الأولي جاهز · خصّص بحرية.',
    emptyTitle: 'ابدأ باختيار قالب',
    emptyDesc: 'أو أنشئ أول طاولة، يمكنك تعديل كل شيء لاحقًا.',
    emptyChoose: 'اختر قالبًا',
    emptyBlank: 'ابدأ فارغًا',
    rosterTitle: 'الفريق في الخدمة',
    rosterHint: 'اسحب الشارة فوق طاولة أو منطقة',
    rosterShift: 'وردية المساء',
    rosterUnassigned: 'غير معيّن',
    rosterTables: (n) => `${n} طاولات`,
    rosterCovers: (n) => `${n} مقاعد`,
    clearAssign: 'مسح كل الإسنادات',
    clearAssignTitle: 'مسح كل الإسنادات؟',
    clearAssignDesc: 'لن يكون أي نادل مسندًا لأي طاولة. ستبقى فارغة حتى إعادة الإسناد.',
    clearAssignOk: 'مسح',
    clearAssignDone: 'تم مسح الإسنادات',
    clearAssignDoneDesc: 'كل الطاولات حرة من إسناد النوادل الآن.',
    assignDone: (s, t) => `تم إسناد ${s} للطاولة ${t}`,
    assignDoneDesc: 'مميز على المخطط · متزامن مع تطبيق النادل.',
    unassignDone: (t) => `تم تحرير ${t}`,
    rotateTitle: 'إعداد التدوير',
    rotateCTA: 'إعداد',
    rotateDesc: 'حين يتناوب النوادل، يبقون متحفزين ويتعلمون كل الطاولات.',
    rotatePeriod: 'الفترة',
    rotateDaily: 'كل يوم',
    rotateShift: 'كل وردية',
    rotateWeekly: 'كل أسبوع',
    rotateCustom: 'مخصص',
    rotateStrategy: 'الاستراتيجية',
    rotZones: 'تدوير المناطق',
    rotZonesDesc: 'النوادل يتنقلون بين المناطق (موصى به)',
    rotTables: 'تدوير الطاولات',
    rotTablesDesc: 'دورة كاملة على جميع الطاولات',
    rotPairs: 'تبادل أزواج يدوي',
    rotPairsDesc: 'تختار أنت الأزواج يدويًا',
    rotPreview: 'معاينة آخر 3 تدويرات قادمة',
    rotFairness: 'العدالة لكل نادل',
    rotApply: 'تطبيق التدوير',
    rotApplied: 'تم تطبيق التدوير',
    rotAppliedDesc: 'تم إعلام كل النوادل عبر تطبيقهم · تم تحديث المخطط.',
    rotNow: 'دوّر الآن',
    rotNowDone: 'تم التدوير',
    rotNowDoneDesc: 'الإسنادات الجديدة نشطة · النوادل تلقوا الإشعار.',
    rotHistoryTitle: 'سجل هذا الأسبوع',
    rotHistoryHint: 'تحقق بصريًا أن أحدًا لا يبقى في نفس المنطقة طويلًا.',
    rotNoneTitle: 'لم يتم إعداد تدوير',
    rotNoneDesc: 'اضبط تدويرًا حتى لا يبقى النوادل على نفس الطاولة لأشهر.',
    rotNoneCTA: 'إعداد',
    fairnessLow: 'عمل هذه المنطقة كثيرًا، جاء دوره',
    fairnessHigh: 'تدوير متوازن',
    legendTitle: 'الحالات',
    cancel: 'إلغاء',
    close: 'إغلاق',
    save2: 'حفظ',
    days: ['اث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'],
    soonAvailable: 'قريبًا',
    /* Scene picker */
    sceneLabel: 'ديكور المنطقة',
    sceneHint: (n) => `غيّر الخلفية البصرية${n ? ` لمنطقة "${n}"` : ' لهذه المنطقة'}، تجميلي فقط، لا يؤثر على طاولاتك.`,
    sceneSalle: 'صالة داخلية',
    sceneTerrasse: 'تراس خارجي',
    sceneBar: 'حانة / كاونتر',
    sceneEtage: 'الطابق العلوي',
    scenePrive: 'صالون خاص',
    sceneBlank: 'فارغ (بدون تجهيزات)',
    floorRDC: 'الطابق الأرضي',
    floorEtage: 'الطابق الأول',
    roomLabel: (zone) => `${zone} · رؤية المالك`,
    viewOwner: 'رؤية المالك',
    floorCount: (occ, total) => `${total} طاولة · ${occ} مشغولة`,
  },
};

/* ─── v2 strings ──────────────────────────────────────────────────────────
 *   Added by assignment rather than inline, so the three language blocks
 *   above stay diff-clean and a missing key is a visible undefined instead
 *   of a silent French fallback in an Arabic UI. */
Object.assign(PDS_STR.fr, {
  undo: 'Annuler', redo: 'Rétablir',
  undoNothing: 'Rien à annuler', redoNothing: 'Rien à rétablir',
  unitCm: 'cm', deletedSuffix: 'supprimé',
  roomTitle: 'La salle', roomHint: 'Sol, murs et dimensions de cette zone.',
  roomHintNuit: 'Dimensions de cette zone.',
  roomFloor: 'Sol', roomWall: 'Murs', roomFinish: 'Finition',
  roomW: 'Larg.', roomH: 'Prof.', roomWallW: 'Mur',
  finplain: 'Uni', finterrazzo: 'Terrazzo', finzellige: 'Zellige',
  finbois: 'Parquet', fincarreaux: 'Carreaux',
  grpservice: 'Service', grparchi: 'Architecture', grpsalle: 'Salle',
  fixcomptoir: 'Comptoir', fixcuisine: 'Cuisine', fixpasse: 'Passe-plat',
  fixcaisse: 'Caisse', fixvitrine: 'Vitrine', fixmur: 'Mur', fixporte: 'Entrée',
  fixfenetre: 'Fenêtre', fixcolonne: 'Colonne', fixescalier: 'Escalier',
  fixwc: 'WC', fixbanquette: 'Banquette', fixclaustra: 'Claustra',
  fixplante: 'Plante', fixtapis: 'Tapis', fixgarde: 'Garde-corps', fixtexte: 'Texte',
  matbone: 'Ivoire', matsand: 'Sable', matstone: 'Pierre', matclay: 'Argile',
  matoak: 'Chêne', matbrass: 'Laiton', matterra: 'Terracotta', matwalnut: 'Noyer',
  matsage: 'Sauge', matebony: 'Ébène', matcoal: 'Charbon', matink: 'Encre',
  matatlas: 'Atlas', matriad: 'Riad', matmint: 'Menthe', matglass: 'Verre',
  inspectorSeats: 'Couverts', inspectorLabel: 'Libellé', inspectorSize: 'Taille',
  inspectorRotation: 'Orientation', inspectorMaterial: 'Matière', inspectorDepth: 'Profondeur',
  layerBack: 'Arrière', layerFront: 'Avant',
  lock: 'Verrouiller', unlock: 'Déverrouiller',
  lockedHint: 'Verrouillé — déverrouillez pour modifier',
  rotateHint: 'Faire pivoter · Maj pour 15°',
  noRoom: 'Pas de place libre ici',
  ambianceLabel: 'Ambiance', customColor: 'Couleur libre',
  wizTitle: 'Composons votre salle', wizDesc: 'Huit questions, puis trois plans meublés à comparer.',
  wizVenue: 'Type d’établissement', wizFloors: 'Combien d’étages ?',
  wizExtras: 'Vous avez aussi…', wizDims: 'Dimensions de la salle',
  wizW: 'Largeur', wizH: 'Profondeur', wizTables: 'Combien de tables ?',
  wizKitchen: 'La cuisine est de quel côté ?', wizEntrance: 'L’entrée est de quel côté ?',
  wizAlso: 'Aussi présent', wizGenerate: 'Composer mon plan', wizBack: 'Modifier',
  wizAgain: 'Régénérer', wizApply: 'Personnaliser ce plan',
  wizCardsNote: 'Chaque plan respecte des passages de service. Vous pourrez tout déplacer ensuite.',
  wizDone: (c) => `Plan composé · ${c} couverts`,
  wizDoneDesc: (n, a) => `${n} tables, passages de ${a} cm. Tout reste modifiable.`,
  wizShort: (n, r) => `${n} des ${r} tables demandées ne tiennent pas avec ces passages`,
  venuerestaurant: 'Restaurant', venuecafe: 'Café', venuesnack: 'Snack',
  venuepatisserie: 'Pâtisserie', venuerooftop: 'Rooftop',
  extraterrasse: 'Terrasse', extrapatio: 'Patio', extramezzanine: 'Mezzanine',
  extrasalon: 'Salon privé', extrabar: 'Bar',
  walln: 'Nord', walle: 'Est', walls: 'Sud', wallw: 'Ouest',
  vardense: 'Dense', varconfort: 'Confort', varbanquettes: 'Banquettes',
  covers: 'couverts', tables: 'tables', cover: 'couvert',
  aisleOf: (a) => `passages ${a} cm`,
  roomBackdrop: 'Fond', backdropNone: 'Aucun fond',
  ambriad: 'Riad', ambmarine: 'Bord de mer', ambbistrot: 'Néo-bistrot', ambjardin: 'Jardin',
  ambianceApplied: (n) => `Ambiance ${n} appliquée`,
  ambianceDesc: 'Sol, murs, tables et fond repeints ensemble. Les pièces peintes à la main sont conservées.',
  blockedHint: 'Chevauchement — relâchez pour poser à côté',
});
Object.assign(PDS_STR.en, {
  undo: 'Undo', redo: 'Redo',
  undoNothing: 'Nothing to undo', redoNothing: 'Nothing to redo',
  unitCm: 'cm', deletedSuffix: 'deleted',
  roomTitle: 'The room', roomHint: 'Floor, walls and dimensions of this zone.',
  roomHintNuit: 'Dimensions of this zone.',
  roomFloor: 'Floor', roomWall: 'Walls', roomFinish: 'Finish',
  roomW: 'Width', roomH: 'Depth', roomWallW: 'Wall',
  finplain: 'Plain', finterrazzo: 'Terrazzo', finzellige: 'Zellige',
  finbois: 'Wood', fincarreaux: 'Checker',
  grpservice: 'Service', grparchi: 'Architecture', grpsalle: 'Room',
  fixcomptoir: 'Counter', fixcuisine: 'Kitchen', fixpasse: 'Pass',
  fixcaisse: 'Till', fixvitrine: 'Display', fixmur: 'Wall', fixporte: 'Entrance',
  fixfenetre: 'Window', fixcolonne: 'Column', fixescalier: 'Stairs',
  fixwc: 'WC', fixbanquette: 'Banquette', fixclaustra: 'Screen',
  fixplante: 'Plant', fixtapis: 'Rug', fixgarde: 'Railing', fixtexte: 'Text',
  matbone: 'Bone', matsand: 'Sand', matstone: 'Stone', matclay: 'Clay',
  matoak: 'Oak', matbrass: 'Brass', matterra: 'Terracotta', matwalnut: 'Walnut',
  matsage: 'Sage', matebony: 'Ebony', matcoal: 'Charcoal', matink: 'Ink',
  matatlas: 'Atlas', matriad: 'Riad', matmint: 'Mint', matglass: 'Glass',
  inspectorSeats: 'Covers', inspectorLabel: 'Label', inspectorSize: 'Size',
  inspectorRotation: 'Orientation', inspectorMaterial: 'Material', inspectorDepth: 'Depth',
  layerBack: 'Send back', layerFront: 'Bring front',
  lock: 'Lock', unlock: 'Unlock',
  lockedHint: 'Locked — unlock to edit',
  rotateHint: 'Rotate · hold Shift for 15°',
  noRoom: 'No free space here',
  ambianceLabel: 'Ambiance', customColor: 'Custom colour',
  wizTitle: 'Let’s lay out your room', wizDesc: 'Eight questions, then three furnished plans to compare.',
  wizVenue: 'Type of venue', wizFloors: 'How many floors?',
  wizExtras: 'You also have…', wizDims: 'Room dimensions',
  wizW: 'Width', wizH: 'Depth', wizTables: 'How many tables?',
  wizKitchen: 'Which side is the kitchen?', wizEntrance: 'Which side is the entrance?',
  wizAlso: 'Also present', wizGenerate: 'Build my plan', wizBack: 'Edit answers',
  wizAgain: 'Regenerate', wizApply: 'Customise this plan',
  wizCardsNote: 'Every plan keeps real service aisles. You can move anything afterwards.',
  wizDone: (c) => `Plan built · ${c} covers`,
  wizDoneDesc: (n, a) => `${n} tables, ${a} cm aisles. Everything stays editable.`,
  wizShort: (n, r) => `${n} of the ${r} tables asked for do not fit at these aisles`,
  venuerestaurant: 'Restaurant', venuecafe: 'Café', venuesnack: 'Snack',
  venuepatisserie: 'Pâtisserie', venuerooftop: 'Rooftop',
  extraterrasse: 'Terrace', extrapatio: 'Patio', extramezzanine: 'Mezzanine',
  extrasalon: 'Private room', extrabar: 'Bar',
  walln: 'North', walle: 'East', walls: 'South', wallw: 'West',
  vardense: 'Dense', varconfort: 'Comfort', varbanquettes: 'Banquettes',
  covers: 'covers', tables: 'tables', cover: 'cover',
  aisleOf: (a) => `${a} cm aisles`,
  roomBackdrop: 'Backdrop', backdropNone: 'No backdrop',
  ambriad: 'Riad', ambmarine: 'Seaside', ambbistrot: 'Neo-bistro', ambjardin: 'Garden',
  ambianceApplied: (n) => `${n} ambiance applied`,
  ambianceDesc: 'Floor, walls, tables and backdrop repainted together. Hand-picked pieces are kept.',
  blockedHint: 'Overlapping — release to settle beside it',
});
Object.assign(PDS_STR.ar, {
  undo: 'تراجع', redo: 'إعادة',
  undoNothing: 'لا شيء للتراجع عنه', redoNothing: 'لا شيء لإعادته',
  unitCm: 'سم', deletedSuffix: 'حُذف',
  roomTitle: 'القاعة', roomHint: 'الأرضية والجدران وأبعاد هذه المنطقة.',
  roomHintNuit: 'أبعاد هذه المنطقة.',
  roomFloor: 'الأرضية', roomWall: 'الجدران', roomFinish: 'التشطيب',
  roomW: 'العرض', roomH: 'العمق', roomWallW: 'الجدار',
  finplain: 'سادة', finterrazzo: 'تيرازو', finzellige: 'زليج',
  finbois: 'خشب', fincarreaux: 'مربعات',
  grpservice: 'الخدمة', grparchi: 'العمارة', grpsalle: 'القاعة',
  fixcomptoir: 'الكونتوار', fixcuisine: 'المطبخ', fixpasse: 'ممر الأطباق',
  fixcaisse: 'الصندوق', fixvitrine: 'واجهة العرض', fixmur: 'جدار', fixporte: 'المدخل',
  fixfenetre: 'نافذة', fixcolonne: 'عمود', fixescalier: 'درج',
  fixwc: 'المرافق', fixbanquette: 'أريكة', fixclaustra: 'حاجز',
  fixplante: 'نبتة', fixtapis: 'زربية', fixgarde: 'حاجز واقٍ', fixtexte: 'نص',
  matbone: 'عاجي', matsand: 'رملي', matstone: 'حجري', matclay: 'طيني',
  matoak: 'بلوط', matbrass: 'نحاس', matterra: 'فخاري', matwalnut: 'جوز',
  matsage: 'مريمية', matebony: 'أبنوس', matcoal: 'فحمي', matink: 'حبري',
  matatlas: 'أطلس', matriad: 'رياض', matmint: 'نعناع', matglass: 'زجاج',
  inspectorSeats: 'المقاعد', inspectorLabel: 'التسمية', inspectorSize: 'الحجم',
  inspectorRotation: 'الاتجاه', inspectorMaterial: 'المادة', inspectorDepth: 'العمق',
  layerBack: 'إلى الخلف', layerFront: 'إلى الأمام',
  lock: 'قفل', unlock: 'فتح',
  lockedHint: 'مقفل — افتح القفل للتعديل',
  rotateHint: 'تدوير · اضغط Shift لـ 15°',
  noRoom: 'لا توجد مساحة فارغة هنا',
  ambianceLabel: 'الأجواء', customColor: 'لون حر',
  wizTitle: 'لنرتّب قاعتك', wizDesc: 'ثمانية أسئلة، ثم ثلاثة مخططات مؤثّثة للمقارنة.',
  wizVenue: 'نوع المحل', wizFloors: 'كم طابقًا؟',
  wizExtras: 'لديك أيضًا…', wizDims: 'أبعاد القاعة',
  wizW: 'العرض', wizH: 'العمق', wizTables: 'كم طاولة؟',
  wizKitchen: 'في أي جهة المطبخ؟', wizEntrance: 'في أي جهة المدخل؟',
  wizAlso: 'موجود أيضًا', wizGenerate: 'أنشئ مخططي', wizBack: 'تعديل',
  wizAgain: 'إعادة الإنشاء', wizApply: 'خصّص هذا المخطط',
  wizCardsNote: 'كل مخطط يحترم ممرات الخدمة. يمكنك تحريك كل شيء بعد ذلك.',
  wizDone: (c) => `تم إنشاء المخطط · ${c} مقعدًا`,
  wizDoneDesc: (n, a) => `${n} طاولة، ممرات ${a} سم. كل شيء قابل للتعديل.`,
  wizShort: (n, r) => `${n} من ${r} طاولة مطلوبة لا تتّسع بهذه الممرات`,
  venuerestaurant: 'مطعم', venuecafe: 'مقهى', venuesnack: 'سناك',
  venuepatisserie: 'حلويات', venuerooftop: 'سطح',
  extraterrasse: 'تراس', extrapatio: 'فناء', extramezzanine: 'ميزانين',
  extrasalon: 'صالون خاص', extrabar: 'بار',
  walln: 'شمال', walle: 'شرق', walls: 'جنوب', wallw: 'غرب',
  vardense: 'مكثّف', varconfort: 'مريح', varbanquettes: 'أرائك',
  covers: 'مقعدًا', tables: 'طاولة', cover: 'مقعد',
  aisleOf: (a) => `ممرات ${a} سم`,
  roomBackdrop: 'الخلفية', backdropNone: 'بدون خلفية',
  ambriad: 'رياض', ambmarine: 'شاطئ', ambbistrot: 'بيسترو', ambjardin: 'حديقة',
  ambianceApplied: (n) => `تم تطبيق أجواء ${n}`,
  ambianceDesc: 'الأرضية والجدران والطاولات والخلفية أُعيد طلاؤها معًا. القطع الملوّنة يدويًا تبقى كما هي.',
  blockedHint: 'تداخل — أفلت ليستقر بجانبه',
});

/* ─── Default roster — used when no team data is provided ────────────────── */
const PDS_DEFAULT_STAFF = [
  { id: 'KR', name: 'Karim Rifai',     color: '#0B6E4F' },
  { id: 'YS', name: 'Yasmine Senhaji', color: '#D99A2B' },
  { id: 'OM', name: 'Omar Maalouf',    color: '#053B2C' },
  { id: 'SK', name: 'Soukaina Belkadi',color: '#A85F00' },
  { id: 'MH', name: 'Mehdi Mansouri',  color: '#1A8FE3' },
  { id: 'NR', name: 'Nora Akkari',     color: '#C0306E' },
  { id: 'AY', name: 'Ayoub Tazi',      color: '#5A6CDB' },
  { id: 'IM', name: 'Imane Lahlou',    color: '#0B8A7B' },
];

/* ─── Table types — each has a default size + shape + seats ─────────────── */

/* ─── Structural elements (purely visual) ──────────────────────────────── */
const PDS_EL_TYPES = {
  wall:   { w: 200, h: 8,  color: '#2C2520' },
  door:   { w: 64,  h: 8,  color: '#0B6E4F' },
  window: { w: 96,  h: 6,  color: '#1A8FE3' },
  column: { w: 22,  h: 22, color: '#2C2520' },
  plant:  { w: 30,  h: 30, color: '#0B8A7B' },
};

/* ─── State manager · loaded from localStorage on demand ──────────────── */
/* ─── v1 → v2 migration ───────────────────────────────────────────────────
 *   v1 stored size and seats on the KIND and drew the comptoir, cuisine,
 *   stairs, plant and entrance inside a frozen SVG scene. v2 stores geometry
 *   on the instance and makes those fixtures real objects.
 *
 *   The scene → fixture step matters more than it looks: a merchant who had
 *   the "salle" backdrop had a counter and a kitchen on their plan. Dropping
 *   the scenes without replacing them would delete both from their floor. So
 *   each retired scene is reconstituted as the objects it used to depict —
 *   this time movable, resizable and deletable.                            */
const PDS_SCENE_MIGRATION = {
  salle: {
    room: { floor: '#FBF7EE', wall: '#2C2520', finish: 'terrazzo' },
    fix: [
      { type: 'comptoir', x: 40,  y: 470, w: 420, h: 42 },
      { type: 'cuisine',  x: 700, y: 48,  w: 150, h: 300 },
      { type: 'porte',    x: 6,   y: 228, w: 80,  h: 14, rot: 90 },
      { type: 'plante',   x: 792, y: 466, w: 46,  h: 46 },
    ],
  },
  terrasse: {
    room: { floor: '#E0D7C4', wall: '#8A6A45', finish: 'carreaux' },
    fix: [
      { type: 'garde',  x: 20,  y: 506, w: 840, h: 10 },
      { type: 'plante', x: 28,  y: 30,  w: 46,  h: 46 },
      { type: 'plante', x: 806, y: 30,  w: 46,  h: 46 },
    ],
  },
  bar: {
    room: { floor: '#EFE7D6', wall: '#1F2820', finish: 'bois' },
    fix: [
      { type: 'comptoir', x: 60,  y: 118, w: 520, h: 54 },
      { type: 'vitrine',  x: 640, y: 110, w: 150, h: 66 },
      { type: 'fenetre',  x: 120, y: 6,   w: 200, h: 10 },
    ],
  },
  etage: {
    room: { floor: '#FBF7EE', wall: '#2C2520', finish: 'zellige' },
    fix: [
      { type: 'escalier',  x: 44, y: 44,  w: 130, h: 96 },
      { type: 'banquette', x: 40, y: 452, w: 300, h: 66 },
    ],
  },
  prive: {
    room: { floor: '#EFE7D6', wall: '#053B2C', finish: 'zellige' },
    fix: [{ type: 'tapis', x: 260, y: 170, w: 360, h: 220 }],
  },
  blank: { room: { floor: '#FBF7EE', wall: '#2C2520', finish: 'plain' }, fix: [] },
};
const PDS_EL_RENAME = { wall: 'mur', door: 'porte', window: 'fenetre', column: 'colonne', plant: 'plante' };

function pdsNormalize(state) {
  if (!state || !Array.isArray(state.zones)) return state;
  const fresh = state.v !== 2;
  let nextEl = 1;
  const elId = () => 'em' + (nextEl++) + '_' + Math.random().toString(36).slice(2, 6);

  state.zones.forEach(z => {
    const scene = z.scene;
    const mig = PDS_SCENE_MIGRATION[scene] || PDS_SCENE_MIGRATION.blank;
    z.room = Object.assign({}, mig.room, z.room || {});
    if (z.room.w == null) z.room.w = PDS_CANVAS_W;
    if (z.room.h == null) z.room.h = PDS_CANVAS_H;
    if (z.room.wallW == null) z.room.wallW = 2;
    if (fresh && scene) {
      /* Reconstitute what the scene used to draw, once. */
      state.elements = state.elements || [];
      mig.fix.forEach((f, i) => {
        state.elements.push(Object.assign({
          id: elId(), zone: z.id, rot: 0, color: (PDS_FIX[f.type] || {}).color,
          label: null, z: i, locked: false,
        }, f));
      });
    }
    delete z.scene;
  });

  (state.tables || []).forEach(t => {
    const cfg = PDS_TABLE_TYPES[t.type] || PDS_TABLE_TYPES.round4;
    if (t.w == null) t.w = cfg.w;
    if (t.h == null) t.h = cfg.h;
    if (t.seats == null) t.seats = cfg.seats;
    if (t.shape == null) t.shape = cfg.shape;
    if (t.color === undefined) t.color = null;
    if (t.locked == null) t.locked = false;
  });

  state.elements = (state.elements || []).map((e, i) => {
    const type = PDS_EL_RENAME[e.type] || e.type;
    const cfg = PDS_FIX[type];
    if (!cfg) return null;          /* unknown kind — drop rather than crash */
    return Object.assign({}, e, {
      type,
      w: e.w != null ? e.w : cfg.w,
      h: e.h != null ? e.h : cfg.h,
      color: e.color || cfg.color,
      label: e.label !== undefined ? e.label : null,
      z: e.z != null ? e.z : i,
      locked: !!e.locked,
    });
  }).filter(Boolean);

  if (state.showChairs == null) state.showChairs = true;
  state.v = 2;
  return state;
}

function pdsLoad() {
  try {
    const key = pdsKey();
    const raw = key ? localStorage.getItem(key) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.zones && parsed.tables && parsed.staff) return pdsNormalize(parsed);
    }
  } catch (e) { /* fall through to default */ }
  return pdsNormalize(pdsDefaultState());
}
function pdsWriteLocal(state) {
  try { const key = pdsKey(); if (key) localStorage.setItem(key, JSON.stringify(state)); } catch (e) {}
  /* Mirror the layout under the merchant SLUG. The caisse has no KiwiVenue to
   * resolve pdsKey(), so it reads the plan by slug (storePaired().merchant) —
   * the same identity spine the boutique/menu already share, so a design made
   * here shows up on the till. Real custom stores only — a demo venue never
   * mirrors, so its seeded plan can't leak into a paired till. */
  try {
    var vd = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData();
    if (vd && vd.custom && vd.name) {
      // Slug gravé d'abord (venues.js › slugOf) : la caisse lit le plan sous le
      // slug de son appairage, qui ne change pas quand l'enseigne se corrige.
      var slug = vd.slug || _bqxSlug(vd.name);
      if (slug) localStorage.setItem(PDS_LS_KEY + ':slug:' + slug, JSON.stringify(state));
    }
  } catch (e) {}
}
function pdsSave(state) {
  pdsWriteLocal(state);
  var c = pdsCloud();
  if (c) c.push();
}

/* ── LA COPIE SERVEUR DU PLAN DE SALLE ──────────────────────────────────────
 * « le serveur lightera ça cross-device » disait le commentaire ci-dessus. Il
 * n'existait pas. Une heure passée à placer trente tables, leurs zones et leurs
 * serveurs ne quittait pas ce navigateur : le patron dessinait la salle sur son
 * portable, le maître d'hôtel ouvrait l'iPad du comptoir et retrouvait une
 * salle vide. C'est assets/cloud-doc.js qui porte les trois règles ; on ne
 * câble ici que le read / write / merge propres au plan.
 *
 * `pdsRawState` lit le document TEL QU'IL EST RANGÉ, jamais `pdsDefaultState()`
 * : le gabarit par défaut d'un magasin neuf porte déjà une zone, donc le
 * proposer au serveur créerait une ligne que le commerçant n'a jamais dessinée,
 * et le deuxième appareil la recevrait comme un vrai plan.
 *
 * « Vide » = aucune table. Une salle SANS table n'est pas une salle dessinée —
 * c'est la zone unique que le gabarit pose tout seul à la première ouverture de
 * la page. Poser sa première table suffit à tout faire partir. */
var pdsLive = null;    // l'état actuellement ouvert à l'écran, s'il y en a un
var pdsDoc = null;

function pdsRawState() {
  try {
    var key = pdsKey();
    var raw = key ? localStorage.getItem(key) : null;
    var p = raw ? JSON.parse(raw) : null;
    if (p && p.zones && p.tables) return p;
  } catch (e) {}
  return { zones: [], tables: [], staff: [] };
}

/* Union par identifiant, cet appareil prioritaire (le défaut de cloud-doc.js),
 * SAUF que le plan porte aussi des réglages scalaires (mode, snap, zone
 * courante) : ceux-là restent les nôtres, changer la zone affichée sur l'iPad
 * n'a pas à déplacer la vue du portable. */
function pdsMerge(mine, theirs) {
  var M = window.KiwiCloudDoc && window.KiwiCloudDoc.mergeDefault;
  if (!M || !theirs) return mine;
  var out = M(mine, theirs);
  ['mode', 'snap', 'zone', 'zoneId'].forEach(function (k) {
    if (mine && Object.prototype.hasOwnProperty.call(mine, k)) out[k] = mine[k];
  });
  return out;
}

/* Le plan a la même faiblesse d'identifiant que le reste : celui qui a créé le
 * restaurant l'a rangé sous `v`+horloge, une ré-adoption le range sous
 * `v-<slug>`, et le dessin d'origine reste en place sans lecteur. Le miroir par
 * slug (`kiwiPlanDeSalle:slug:<slug>`) partage ce préfixe mais n'est pas un
 * identifiant de venue : slugFor() ne le reconnaît pas et l'écarte. */
function pdsCarryForward() {
  if (!window.KiwiCloudDoc) return;
  var vid = (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || '';
  var slug = window.KiwiCloudDoc.currentSlug();
  if (!vid || !slug) return;
  window.KiwiCloudDoc.carryForward('floorplan', vid, slug, function (raw) {
    try { var d = JSON.parse(raw || 'null'); return !!(d && d.tables && d.tables.length); }
    catch (e) { return false; }
  }, PDS_LS_KEY + ':');
}

function pdsCloud() {
  if (pdsDoc || !window.KiwiCloudDoc || !pdsKey()) return pdsDoc;
  pdsDoc = window.KiwiCloudDoc.attach({
    feature: 'floorplan',
    slug: function () { return window.KiwiCloudDoc.currentSlug(); },
    /* Le signet de révision doit nommer la copie qu'il décrit. Ici la copie
     * locale est rangée sous l'ID d'établissement (`kiwiPlanDeSalle:<venueId>`)
     * alors que la caisse range la sienne sous le slug — sans cette ligne les
     * deux partagent un seul signet, et l'une des deux se déclare à jour en
     * portant l'ancienne révision. C'est exactement la panne du reçu, réglée
     * une première fois pour `business`/`receipt` (voir assets/cloud-doc.js). */
    localKey: pdsKey,
    read: pdsRawState,
    write: function (d) {
      pdsWriteLocal(d);
      /* La page est ouverte : on remplace le contenu de l'état VIVANT (les
       * gestionnaires de glisser-déposer tiennent cette référence) plutôt que
       * l'objet lui-même, puis on repeint par son propre `_refresh`. */
      if (!pdsLive) return;
      try {
        Object.keys(d).forEach(function (k) { if (k.charAt(0) !== '_') pdsLive[k] = d[k]; });
        if (pdsLive._refresh) pdsLive._refresh();
      } catch (e) {}
    },
    merge: pdsMerge,
    isEmpty: function (d) { return !d || !(d.tables && d.tables.length); },
  });
  return pdsDoc;
}
function pdsDefaultState() {
  /* Every merchant starts with an empty floor to design (one zone, no tables,
     no staff). Built-in demo venues keep their full layout only in demo mode. */
  if (pdsMerchantContext()) return pdsTemplate('blank');
  const zones = [
    { id: 'z1', name: 'Salle principale', scene: 'salle' },
    { id: 'z2', name: 'Terrasse',         scene: 'terrasse' },
    { id: 'z3', name: 'Bar',              scene: 'bar' },
  ];
  const mk = (id, zone, type, x, y, num, status, server, notes) => ({
    id, zone, type, x, y, num, status: status || 'free', server: server || null, notes: notes || '', rot: 0,
  });
  const tables = [
    mk('t1',  'z1', 'round4', 80,  80,  '1', 'occupied', 'KR', ''),
    mk('t2',  'z1', 'round4', 240, 80,  '2', 'free', 'KR', ''),
    mk('t3',  'z1', 'round2', 400, 80,  '3', 'reserved', 'KR', 'Famille El Idrissi · 20:00'),
    mk('t4',  'z1', 'sq4',    560, 80,  '4', 'occupied', 'YS', ''),
    mk('t5',  'z1', 'round6', 80,  240, '5', 'free', 'YS', ''),
    mk('t6',  'z1', 'round4', 256, 240, '6', 'cleaning', 'YS', ''),
    mk('t7',  'z1', 'rect6',  416, 240, '7', 'occupied', 'OM', ''),
    mk('t8',  'z1', 'round2', 624, 240, '8', 'free', 'OM', ''),
    mk('t9',  'z1', 'rect8',  176, 400, '9', 'occupied', 'OM', ''),
    mk('t10', 'z1', 'round4', 416, 400, '10', 'free', 'SK', ''),
    mk('t11', 'z1', 'sq2',    576, 400, '11', 'occupied', 'SK', ''),
    mk('t12', 'z1', 'round4', 720, 400, '12', 'reserved', 'SK', 'M. Benani · 20:30'),
    mk('t13', 'z2', 'round2', 96,  96,  'T1', 'occupied', 'MH', ''),
    mk('t14', 'z2', 'round4', 240, 96,  'T2', 'free', 'MH', ''),
    mk('t15', 'z2', 'round4', 400, 96,  'T3', 'occupied', 'NR', ''),
    mk('t16', 'z2', 'round6', 576, 96,  'T4', 'free', 'NR', ''),
    mk('t17', 'z2', 'rect4',  144, 256, 'T5', 'free', 'AY', ''),
    mk('t18', 'z2', 'rect4',  368, 256, 'T6', 'occupied', 'AY', ''),
    mk('t19', 'z2', 'round4', 576, 256, 'T7', 'free', 'IM', ''),
    mk('t20', 'z3', 'bar',    96,  120, 'B1', 'occupied', 'KR', ''),
    mk('t21', 'z3', 'bar',    176, 120, 'B2', 'occupied', 'KR', ''),
    mk('t22', 'z3', 'bar',    256, 120, 'B3', 'free', 'KR', ''),
    mk('t23', 'z3', 'high',   400, 200, 'B4', 'occupied', 'YS', ''),
    mk('t24', 'z3', 'high',   500, 200, 'B5', 'free', 'YS', ''),
  ];
  /* Pre-populate a sample week of history so Rotation mode has something to show */
  const history = [
    { day: 0, label: 'Lun', servers: { KR: 'z1', YS: 'z2', OM: 'z1', SK: 'z3', MH: 'z2' } },
    { day: 1, label: 'Mar', servers: { KR: 'z2', YS: 'z1', OM: 'z3', SK: 'z1', MH: 'z2' } },
    { day: 2, label: 'Mer', servers: { KR: 'z1', YS: 'z3', OM: 'z1', SK: 'z2', MH: 'z1' } },
    { day: 3, label: 'Jeu', servers: { KR: 'z3', YS: 'z1', OM: 'z2', SK: 'z1', MH: 'z2' } },
    { day: 4, label: 'Ven', servers: { KR: 'z2', YS: 'z2', OM: 'z1', SK: 'z3', MH: 'z1' } },
  ];
  return {
    zones,
    activeZone: 'z1',
    tables,
    elements: [],
    staff: PDS_DEFAULT_STAFF.slice(),
    rotation: { period: 'shift', strategy: 'zones', enabled: true },
    history,
    snap: true,
    mode: 'layout',
  };
}

/* ─── Templates catalog — wipes state, repopulates ────────────────────── */
function pdsTemplate(key) {
  const mk = (id, zone, type, x, y, num) => ({ id, zone, type, x, y, num, status: 'free', server: null, notes: '', rot: 0 });
  const blank = {
    zones: [{ id: 'z1', name: 'Salle', scene: 'salle' }],
    activeZone: 'z1', tables: [], elements: [],
    /* A merchant fills its own roster; only the local pitch demo gets samples. */
    staff: pdsMerchantContext() ? [] : PDS_DEFAULT_STAFF.slice(),
    rotation: { period: 'shift', strategy: 'zones', enabled: false },
    history: [],
    snap: true,
    mode: 'layout',
  };
  if (key === 'blank') return blank;
  if (key === 'bistro') {
    return {
      ...blank,
      zones: [
        { id: 'z1', name: 'Salle',    scene: 'salle' },
        { id: 'z2', name: 'Terrasse', scene: 'terrasse' },
        { id: 'z3', name: 'Bar',      scene: 'bar' },
      ],
      tables: [
        mk('t1','z1','round4', 96,  96,  '1'),
        mk('t2','z1','round4', 256, 96,  '2'),
        mk('t3','z1','sq2',    416, 96,  '3'),
        mk('t4','z1','round4', 96,  256, '4'),
        mk('t5','z1','sq4',    256, 256, '5'),
        mk('t6','z1','rect6',  416, 256, '6'),
        mk('t7','z1','round2', 96,  400, '7'),
        mk('t8','z1','round4', 256, 400, '8'),
        mk('t9','z2','round2', 96,  96,  'T1'),
        mk('t10','z2','round2',240, 96, 'T2'),
        mk('t11','z2','round4',384, 96, 'T3'),
        mk('t12','z3','bar',   96, 120, 'B1'),
        mk('t13','z3','bar',  176, 120, 'B2'),
        mk('t14','z3','high', 320, 200, 'B3'),
      ],
    };
  }
  if (key === 'resto') {
    return {
      ...blank,
      zones: [
        { id: 'z1', name: 'Salle principale', scene: 'salle' },
        { id: 'z2', name: 'Terrasse',         scene: 'terrasse' },
        { id: 'z3', name: 'Salon privé',      scene: 'prive' },
      ],
      tables: [
        ...Array.from({ length: 12 }, (_, i) => mk(`m${i+1}`, 'z1', i%3===0?'round6':i%3===1?'round4':'sq4',
          96 + (i%4)*180, 96 + Math.floor(i/4)*150, String(i+1))),
        ...Array.from({ length: 8 }, (_, i) => mk(`te${i+1}`, 'z2', i<4?'round2':'round4',
          96 + (i%4)*150, 96 + Math.floor(i/4)*150, `T${i+1}`)),
        mk('p1','z3','rect10',144,144,'P1'),
        mk('p2','z3','round4',160,330,'P2'),
        mk('p3','z3','round4',440,330,'P3'),
      ],
    };
  }
  if (key === 'cafe') {
    return {
      ...blank,
      zones: [
        { id: 'z1', name: 'Salle',    scene: 'salle' },
        { id: 'z2', name: 'Comptoir', scene: 'bar' },
      ],
      tables: [
        mk('h1','z1','high',96,96,'1'),
        mk('h2','z1','high',208,96,'2'),
        mk('h3','z1','high',320,96,'3'),
        mk('h4','z1','high',96,208,'4'),
        mk('h5','z1','high',208,208,'5'),
        mk('h6','z1','high',320,208,'6'),
        mk('r1','z1','round4',464,128,'7'),
        mk('r2','z1','round4',464,288,'8'),
        mk('r3','z1','round4',624,208,'9'),
        mk('b1','z2','bar',96,80,'C1'),
        mk('b2','z2','bar',176,80,'C2'),
        mk('b3','z2','bar',256,80,'C3'),
        mk('b4','z2','bar',336,80,'C4'),
      ],
    };
  }
  if (key === 'brasserie') {
    return {
      ...blank,
      zones: [
        { id: 'z1', name: 'Salle',       scene: 'salle' },
        { id: 'z2', name: 'Terrasse XL', scene: 'terrasse' },
        { id: 'z3', name: 'Bar',         scene: 'bar' },
      ],
      tables: [
        ...Array.from({ length: 8 }, (_, i) => mk(`s${i+1}`, 'z1', i%2 ? 'round4' : 'sq4',
          96 + (i%4)*160, 96 + Math.floor(i/4)*180, String(i+1))),
        ...Array.from({ length: 10 }, (_, i) => mk(`te${i+1}`, 'z2', i%3===0 ? 'round6' : 'round4',
          80 + (i%5)*160, 96 + Math.floor(i/5)*200, `T${i+1}`)),
        mk('b1','z3','bar', 96,120,'B1'),
        mk('b2','z3','bar',176,120,'B2'),
        mk('b3','z3','bar',256,120,'B3'),
        mk('b4','z3','bar',336,120,'B4'),
        mk('h1','z3','high',480,200,'H1'),
        mk('h2','z3','high',576,200,'H2'),
      ],
    };
  }
  return blank;
}

/* ─── Stylesheet, injected once at the document level ──────────────────
 * NOT inside the drawer body. The `.pds-*` sheet used to ship as
 * `<style>${PDS_INLINE_CSS}</style>` at the top of pdsRenderBody()'s HTML
 * string, so its lifetime was tied to that body — and `open-templates`
 * opens a SECOND drawer over the first, replacing the body and taking the
 * only copy of the stylesheet with it. The template picker then rendered
 * with no CSS at all: no card fill, no border, no padding, just stacked
 * text bleeding through the glass. Anything that reuses `.pds-*` markup
 * outside the main drawer depends on this being document-level. */
function pdsEnsureCss() {
  if (document.getElementById('pds-css')) return;
  const s = document.createElement('style');
  s.id = 'pds-css';
  s.textContent = PDS_INLINE_CSS;
  document.head.appendChild(s);
}

/* ─── nav-tables handler — main entry point ────────────────────────── */
handlers['nav-tables'] = () => {
  pdsEnsureCss();
  const T = PDS_STR[trLang()] || PDS_STR.fr;
  const v = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Café Atlas', type: 'restaurant' };
  /* Avant de lire : récupérer un dessin laissé sous un ancien identifiant. */
  try { pdsCarryForward(); } catch (_) {}
  const state = pdsLoad();
  /* L'état vivant, pour que la copie serveur qui arrive pendant qu'on dessine
   * repeigne la salle au lieu de se contenter du localStorage. */
  pdsLive = state;
  { const c = pdsCloud(); if (c) c.bind(); }

  /* Quick counters used in the subtitle + KPI strip */
  const nTables = state.tables.length;
  const nOcc = state.tables.filter(t => t.status === 'occupied').length;
  const nCovers = state.tables.reduce((s, t) => s + pdsGeom(t).seats, 0);

  const dr = fullpage({
    title: T.title,
    subtitle: T.subtitle(v.name, nTables, nOcc),
    width: 1240,
    body: pdsRenderBody(state, T),
    foot: pdsRenderFoot(state, T),
  });
  wireDismiss(dr);
  if (!dr || !dr.el) return;

  /* Sidebar pin: highlight "Plan de salle" while this page is open,
   * snap back to Accueil when the drawer closes (matches Équipe/Stock). */
  window.Kiwi?.setActivePage?.('tables');
  const prevClose = dr.close;
  dr.close = () => {
    try { pdsSave(state); } catch (_) {} /* auto-save the floor so a design is never lost on close */
    if (pdsLive === state) pdsLive = null;   /* plus rien à repeindre à l'écran */
    window.Kiwi?.setActivePage?.('accueil');
    prevClose();
  };

  /* Bootstrap mode + interactivity. Re-rendering goes through pdsRefresh()
   * which preserves the same drawer.el. */
  pdsAttach(dr.el, state, T, dr);
};

/* ═══ RENDERER ══════════════════════════════════════════════════════ */
function pdsRenderBody(state, T) {
  const nTables = state.tables.length;
  const nCovers = state.tables.reduce((s, t) => s + pdsGeom(t).seats, 0);
  const nZones = state.zones.length;
  const nServers = state.staff.length;
  return `
    <div class="p-kpis pds-kpis">
      <div class="p-kpi"><div class="l">${T.kpiTables}</div><div class="v">${nTables}</div><div class="d">${state.tables.filter(t=>t.status==='occupied').length} occ. · ${state.tables.filter(t=>t.status==='reserved').length} rés.</div></div>
      <div class="p-kpi"><div class="l">${T.kpiCovers}</div><div class="v">${nCovers}</div><div class="d">capacité totale</div></div>
      <div class="p-kpi"><div class="l">${T.kpiZones}</div><div class="v">${nZones}</div><div class="d">${state.zones.map(z=>z.name).slice(0,2).join(' · ')}${nZones>2?' …':''}</div></div>
      <div class="p-kpi"><div class="l">${T.kpiServers}</div><div class="v">${nServers}</div><div class="d">${T.rosterShift.toLowerCase()}</div></div>
    </div>

    <div class="pds-toolbar">
      <div class="pds-modes" data-pds-modes>
        <button class="pds-mode ${state.mode==='layout'?'active':''}" data-pds-mode="layout">${T.modeLayout}</button>
        <button class="pds-mode ${state.mode==='assign'?'active':''}" data-pds-mode="assign">${T.modeAssign}</button>
        <button class="pds-mode ${state.mode==='rotate'?'active':''}" data-pds-mode="rotate">${T.modeRotate}</button>
      </div>
      <div class="pds-mode-desc" data-pds-mode-desc>${
        state.mode === 'layout' ? T.modeLayoutDesc :
        state.mode === 'assign' ? T.modeAssignDesc : T.modeRotateDesc
      }</div>
      <div class="pds-zone-tabs" data-pds-zones>
        ${state.zones.map(z => `
          <button class="pds-zone ${z.id===state.activeZone?'active':''}" data-pds-zone="${z.id}">
            <span>${z.name}</span>
            <em>${state.tables.filter(t => t.zone === z.id).length}</em>
          </button>
        `).join('')}
        <button class="pds-zone pds-zone-add" data-pds-action="add-zone" title="${T.addZone}">+</button>
      </div>
    </div>

    <div class="pds-stage" data-pds-stage>
      ${pdsRenderStage(state, T)}
    </div>
  `;
}


/* Selection lives in pdsAttach's closure; the renderer needs to read it to
   draw handles on the selected object. This is the same Set, not a copy —
   pdsAttach assigns it — so there is still exactly one source of truth. */
let PDS_SEL = new Set();

/* Find any object by id across both arrays. Tables and fixtures use disjoint
   id prefixes, so one lookup serves both and the inspector, handles and
   keyboard nudge don't need to know which array they're editing. */
function pdsFind(state, id) {
  const t = state.tables.find(o => o.id === id);
  if (t) return { o: t, table: true };
  const e = state.elements.find(o => o.id === id);
  if (e) return { o: e, table: false };
  return null;
}
function pdsPlane(zone) {
  const r = (zone && zone.room) || {};
  return { w: Math.max(240, +r.w || PDS_CANVAS_W), h: Math.max(200, +r.h || PDS_CANVAS_H) };
}
/* Plane of the zone currently on screen — the clamp bound for drag and resize.
   PDS_CANVAS_W/H are now only the default room size, not a global. */
function pdsPlaneOf(state) {
  return pdsPlane(state.zones.find(z => z.id === state.activeZone) || state.zones[0]);
}

/* ─── Undo ────────────────────────────────────────────────────────────────
 *   Snapshots of the three mutable arrays. A designer who cannot undo does
 *   not experiment, and an editor nobody experiments in gets used once.
 *   pdsPush is called BEFORE a mutation, by the action that performs it. */
const PDS_UNDO = { stack: [], redo: [] };
function pdsSnap(state) {
  return JSON.stringify({ zones: state.zones, tables: state.tables, elements: state.elements });
}
function pdsApplySnap(state, s) {
  const d = JSON.parse(s);
  state.zones = d.zones; state.tables = d.tables; state.elements = d.elements;
  if (!state.zones.some(z => z.id === state.activeZone)) state.activeZone = state.zones[0]?.id;
}
function pdsPush(state) {
  PDS_UNDO.stack.push(pdsSnap(state));
  if (PDS_UNDO.stack.length > 40) PDS_UNDO.stack.shift();
  PDS_UNDO.redo.length = 0;
}
function pdsUndo(state) {
  if (!PDS_UNDO.stack.length) return false;
  PDS_UNDO.redo.push(pdsSnap(state));
  pdsApplySnap(state, PDS_UNDO.stack.pop());
  return true;
}
function pdsRedo(state) {
  if (!PDS_UNDO.redo.length) return false;
  PDS_UNDO.stack.push(pdsSnap(state));
  pdsApplySnap(state, PDS_UNDO.redo.pop());
  return true;
}

/* First grid position where a w×h object clears everything already placed,
   with an 8-unit breathing gap. Beats the old "centre + n×16 offset", which
   stacked the 7th item straight back onto the 1st. */
function pdsFreeSpot(state, w, h, plane) {
  const zone = state.activeZone;
  const boxes = state.tables.filter(t => t.zone === zone).map(t => ({ x: t.x, y: t.y, g: pdsGeom(t) }))
    .concat(state.elements.filter(e => e.zone === zone).map(e => ({ x: e.x, y: e.y, g: pdsGeom(e) })));
  /* Chairs stick PDS_PAD out of every table, so a gap smaller than two chair
     bands puts one table's chairs inside its neighbour's. Add walking room on
     top of that: this is a restaurant floor, not a packing problem. */
  const gap = PDS_PAD * 2 + 24;
  const hit = (x, y) => boxes.some(b =>
    x < b.x + b.g.w + gap && x + w + gap > b.x && y < b.y + b.g.h + gap && y + h + gap > b.y);
  /* How much this position actually covers other objects (no gap allowance) —
     used only to rank fallbacks. */
  const overlapArea = (x, y) => boxes.reduce((sum, b) => {
    const ox = Math.min(x + w, b.x + b.g.w) - Math.max(x, b.x);
    const oy = Math.min(y + h, b.y + b.g.h) - Math.max(y, b.y);
    return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
  }, 0);
  const step = PDS_GRID * 2;
  const top = 48;   /* clear of the room's own name plate */
  let best = null, bestArea = Infinity;
  for (let y = top; y + h <= plane.h - PDS_GRID; y += step) {
    for (let x = PDS_GRID * 2; x + w <= plane.w - PDS_GRID; x += step) {
      if (!hit(x, y)) return { x, y };
      /* Remember the least-crowded spot in case nothing is fully clear. */
      const a = overlapArea(x, y);
      if (a < bestArea) { bestArea = a; best = { x, y }; }
    }
  }
  /* A full floor used to dump the new object dead-centre, straight on top of
     whatever was already there. Land on the emptiest patch instead — still
     visible, still draggable, but not hidden under a table. */
  return best || { x: Math.max(0, Math.round((plane.w - w) / 2)), y: Math.max(0, Math.round((plane.h - h) / 2)) };
}

/* ─── Resize + rotate ─────────────────────────────────────────────────────
 *   Eight edge/corner handles plus a rotation grip, on tables and fixtures
 *   alike. Two things make this correct rather than approximately correct:
 *
 *   1. Screen deltas are divided by the stage scale k (pdsK) and then rotated
 *      into the object's LOCAL frame, so dragging the east handle of a table
 *      turned 30° widens it along its own axis instead of along the screen's.
 *   2. The handle opposite the one being dragged stays put. Because rotation
 *      is about the centre, holding an edge still means moving the centre to
 *      compensate: with A the anchor in local coords and c the local centre,
 *      C1 = C0 + R·((A0 − A1) + (c1 − c0)). Without that term a rotated
 *      object crawls across the floor as you resize it.                    */
/* Free movement that PULLS to a value within `tol`, instead of the hard
   Math.round(v / grid) * grid that made every drag feel notched. */
function pdsMagnet(v, grid, tol) {
  const n = Math.round(v / grid) * grid;
  return Math.abs(v - n) <= tol ? n : v;
}

/* Repaint ONE cell from state and re-arm its handlers. The old code called
   refresh() on pointerup, which rebuilt the whole drawer body plus both
   rails and reopened the inspector — that rebuild is the hitch you feel at
   the end of every resize. Nothing outside this cell changed, so nothing
   outside it needs to be rebuilt. */
function pdsRepaintCell(root, state, T, id, refresh, selection) {
  const f = pdsFind(state, id);
  const old = root.querySelector(`[data-pds-table="${id}"], [data-pds-el="${id}"]`);
  if (!f || !old) { refresh(); return; }
  const holder = document.createElement('div');
  holder.innerHTML = (f.table ? pdsRenderTable(f.o, state, T) : pdsRenderElement(f.o, state, T)).trim();
  const fresh = holder.firstElementChild;
  if (!fresh) { refresh(); return; }
  old.replaceWith(fresh);
  if (f.table) pdsAttachDrag(fresh, id, state, T, root, refresh, selection);
  else pdsAttachElDrag(fresh, id, state, T, root, refresh);
  pdsBindHandles(fresh, root, state, T, refresh, selection);
  try { pdsSave(state); } catch (_) {}
}

/* Push geometry back into the inspector's number fields without rebuilding
   it — never clobbering a field the merchant is currently typing in. */
function pdsSyncInspector(root, o) {
  const g = pdsGeom(o);
  /* querySelectorAll, not querySelector — rotation has both a dial and a
     number box, and they must not drift apart. */
  const set = (f, v) => {
    root.querySelectorAll(`[data-pds-field="${f}"]`).forEach(el => {
      if (document.activeElement !== el) el.value = v;
    });
  };
  set('w', Math.round(g.w)); set('h', Math.round(g.h));
  set('x', Math.round(o.x));  set('y', Math.round(o.y));
  set('rot', Math.round(o.rot || 0));
  const out = root.querySelector('[data-pds-rotout]');
  if (out) out.textContent = `${Math.round(o.rot || 0)}°`;
}

function pdsAttachResize(root, state, T, refresh, selection) {
  pdsBindHandles(root, root, state, T, refresh, selection);
}

function pdsBindHandles(scope, root, state, T, refresh, selection) {
  scope.querySelectorAll('[data-pds-handle]').forEach(hd => {
    const dir = hd.getAttribute('data-pds-handle');
    const id  = hd.getAttribute('data-pds-hid');
    hd.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const f = pdsFind(state, id);
      if (!f || f.o.locked) return;
      const o = f.o;
      const g0 = pdsGeom(o);
      const K = (f.table ? PDS_TABLE_TYPES[o.type] : PDS_FIX[o.type]) || {};
      const minW = K.minW || 28, minH = K.minH || 28;
      /* A column and a plant are round in plan — they resize, but keeping
         their ratio by default stops them turning into ovals. Shift inverts. */
      const ratioKind = (o.type === 'colonne' || o.type === 'plante');
      const plane = pdsPlaneOf(state);
      const k = pdsK(root);
      const rot0 = o.rot || 0;
      const rad = rot0 * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const R = (vx, vy) => [vx * cos - vy * sin, vx * sin + vy * cos];
      const w0 = g0.w, h0 = g0.h;
      const C0 = [o.x + w0 / 2, o.y + h0 / 2];
      const sx = ev.clientX, sy = ev.clientY;
      const cell = root.querySelector(`[data-pds-table="${id}"], [data-pds-el="${id}"]`);
      const badge = cell ? cell.querySelector('.pds-dim') : null;
      const pad = f.table ? PDS_PAD : 0;

      /* Last geometry that broke nothing — what a blocked frame falls back
         to, so the growing edge visibly stops at the blocker. */
      let last = { x: o.x, y: o.y, w: w0, h: h0, rot: rot0 };
      let lastRot = rot0;
      let live = false, frame = 0, ptr = null;

      const paint = () => {
        if (!cell) return;
        cell.style.left = (o.x - pad) + 'px';
        cell.style.top = (o.y - pad) + 'px';
        cell.style.width = (pdsGeom(o).w + pad * 2) + 'px';
        cell.style.height = (pdsGeom(o).h + pad * 2) + 'px';
        cell.style.transform = `rotate(${o.rot || 0}deg)`;
      };

      const apply = () => {
        frame = 0;
        if (!ptr) return;
        const ddx = (ptr.x - sx) / k, ddy = (ptr.y - sy) / k;
        if (!live) {
          if (Math.abs(ddx) < 2 && Math.abs(ddy) < 2) return;
          live = true;
          pdsPush(state);
          if (cell) cell.classList.add('is-resizing');
        }

        if (dir === 'rot') {
          if (!cell) return;
          const r = cell.getBoundingClientRect();
          let deg = Math.atan2(ptr.y - (r.top + r.height / 2),
                               ptr.x - (r.left + r.width / 2)) * 180 / Math.PI + 90;
          deg = (deg + 360) % 360;
          if (ptr.shift) {
            deg = Math.round(deg / 15) * 15;
          } else {
            /* Magnetic square angles. Free rotation is the default — every
               angle in between stays reachable — but you can still land on
               exactly 90° without aiming for it. */
            const near = Math.round(deg / 90) * 90;
            if (Math.abs(deg - near) <= 3) deg = near;
          }
          o.rot = Math.round(deg) % 360;
          const hits = pdsBlockers(state, o, null);
          const clean = hits.length === 0;
          if (clean) lastRot = o.rot;
          /* Name what is in the way, same as a drag does — "it went red" is
             half an answer without "and this is what it hit". */
          root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
          hits.forEach(b => {
            const n = root.querySelector(`[data-pds-table="${b.id}"], [data-pds-el="${b.id}"]`);
            if (n) n.classList.add('pds-blocker');
          });
          /* THE live preview. The old code returned before this line, so the
             angle updated in state and the screen never moved — which is why
             rotation felt like it snapped to a handful of positions on
             release rather than following the cursor. */
          cell.style.transform = `rotate(${o.rot}deg)`;
          cell.classList.toggle('is-blocked', !clean);
          if (badge) badge.textContent = `${o.rot}°`;
          return;
        }

        /* Screen delta → the object's own axes. */
        const ldx = ddx * cos + ddy * sin;
        const ldy = -ddx * sin + ddy * cos;
        const fromCentre = ptr.alt;
        const m = fromCentre ? 2 : 1;

        let w1 = w0, h1 = h0;
        if (dir.includes('e')) w1 = w0 + ldx * m;
        if (dir.includes('w')) w1 = w0 - ldx * m;
        if (dir.includes('s')) h1 = h0 + ldy * m;
        if (dir.includes('n')) h1 = h0 - ldy * m;

        /* Shift locks the aspect ratio (and unlocks it for the round kinds). */
        if (ptr.shift !== ratioKind) {
          const ar = w0 / h0;
          if (dir === 'n' || dir === 's') w1 = h1 * ar;
          else if (dir === 'e' || dir === 'w') h1 = w1 / ar;
          else if (Math.abs(w1 - w0) / ar >= Math.abs(h1 - h0)) h1 = w1 / ar;
          else w1 = h1 * ar;
        }

        if (state.snap) {
          w1 = pdsMagnet(w1, PDS_GRID, 6);
          h1 = pdsMagnet(h1, PDS_GRID, 6);
        }
        w1 = Math.max(minW, Math.min(plane.w, Math.round(w1)));
        h1 = Math.max(minH, Math.min(plane.h, Math.round(h1)));

        /* Hold the opposite edge — see the note above. Resizing from the
           centre holds the centre instead, so neither edge is an anchor. */
        let C1 = C0;
        if (!fromCentre) {
          const A0 = [dir.includes('w') ? w0 : 0, dir.includes('n') ? h0 : 0];
          const A1 = [dir.includes('w') ? w1 : 0, dir.includes('n') ? h1 : 0];
          const [rx, ry] = R((A0[0] - A1[0]) + (w1 - w0) / 2,
                             (A0[1] - A1[1]) + (h1 - h0) / 2);
          C1 = [C0[0] + rx, C0[1] + ry];
        }

        const at = { x: Math.round(C1[0] - w1 / 2), y: Math.round(C1[1] - h1 / 2), w: w1, h: h1, rot: rot0 };
        if (!rot0) {   /* clamping to the room is only meaningful axis-aligned */
          at.x = Math.max(0, Math.min(plane.w - w1, at.x));
          at.y = Math.max(0, Math.min(plane.h - h1, at.y));
        }

        /* A fixture may not grow through a table. Accept-or-reject is not
           enough: pointermoves are coalesced to one frame, so a fast drag
           can jump a long way between samples and a single rejected frame
           would freeze the whole gesture at its starting size. Bisect
           between the last legal geometry and the requested one instead, so
           the edge lands exactly ON the blocker whatever the frame rate. */
        const hits = pdsBlockers(state, o, at);
        if (!hits.length) {
          last = at;
        } else {
          const lerp = (t) => ({
            x: Math.round(last.x + (at.x - last.x) * t),
            y: Math.round(last.y + (at.y - last.y) * t),
            w: Math.round(last.w + (at.w - last.w) * t),
            h: Math.round(last.h + (at.h - last.h) * t),
            rot: rot0,
          });
          let lo = 0, hi = 1;
          for (let i = 0; i < 8; i++) {
            const mid = (lo + hi) / 2;
            if (pdsBlockers(state, o, lerp(mid)).length) hi = mid; else lo = mid;
          }
          const edge = lerp(lo);
          if (edge.w >= minW && edge.h >= minH) last = edge;
        }
        o.x = last.x; o.y = last.y; o.w = last.w; o.h = last.h;

        /* Name what stopped it — an edge that halts for no visible reason
           reads as a bug, not as a rule. */
        root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
        hits.forEach(b => {
          const n = root.querySelector(`[data-pds-table="${b.id}"], [data-pds-el="${b.id}"]`);
          if (n) n.classList.add('pds-blocker');
        });

        paint();
        if (badge) badge.textContent = `${last.w}×${last.h}`;
      };

      const move = (e2) => {
        /* Snapshot rather than retain the event, and coalesce to one style
           write per frame instead of one per pointermove. */
        ptr = { x: e2.clientX, y: e2.clientY, shift: e2.shiftKey, alt: e2.altKey };
        if (!frame) frame = requestAnimationFrame(apply);
      };

      const up = () => {
        hd.removeEventListener('pointermove', move);
        hd.removeEventListener('pointerup', up);
        hd.removeEventListener('pointercancel', up);
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        if (cell) cell.classList.remove('is-resizing', 'is-blocked');
        root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
        if (!live) return;          /* a click, not a drag — leave state alone */
        /* Rotation is free to preview through a neighbour; committing is not.
           The angle is what the merchant was aiming at, so honour it and move
           the table to the nearest spot where it fits — reverting the angle
           reads as "the rotation didn't take", which is worse than a nudge.
           Only when the floor has genuinely no room does the angle go back. */
        if (dir === 'rot' && pdsBlockers(state, o, null).length) {
          const spot = pdsNearestFree(state, o, o.x, o.y, plane);
          if (spot) { o.x = spot.x; o.y = spot.y; }
          else { o.rot = lastRot; if (window.Kiwi && Kiwi.toast) Kiwi.toast(T.noRoom); }
          paint();
        }
        selection.clear(); selection.add(id);
        pdsRepaintCell(root, state, T, id, refresh, selection);
        pdsSyncInspector(root, o);
      };

      try { hd.setPointerCapture(ev.pointerId); } catch (_) {}
      hd.addEventListener('pointermove', move);
      hd.addEventListener('pointerup', up);
      hd.addEventListener('pointercancel', up);
    });
  });
}

function pdsRenderStage(state, T) {
  if (state.mode === 'rotate') return pdsRenderRotateStage(state, T);
  /* Layout + Assignation share the same canvas; Assignation overlays a roster. */
  const tablesInZone = state.tables.filter(t => t.zone === state.activeZone);
  const elsInZone = state.elements.filter(e => e.zone === state.activeZone);
  const isEmpty = tablesInZone.length === 0 && elsInZone.length === 0;
  const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
  const occ = tablesInZone.filter(t => t.status === 'occupied').length;
  const P = pdsPlane(zone);
  /* Fixtures paint under tables, and within fixtures a rug must sit under a
     comptoir. z is explicit so the merchant can reorder. */
  const ordered = elsInZone.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  const noir = pdsNoir();
  return `
    <div class="pds-stage-grid pds-stage-${state.mode}">
      <div class="pds-rail" data-pds-rail>
        ${state.mode === 'layout' ? pdsRenderLayoutRail(state, T) : pdsRenderAssignRail(state, T)}
      </div>
      <div class="pds-canvas-wrap">
        <div class="pds-canvas-bar">
          <div class="pds-legend">
            <span class="pds-legend-title">${T.legendTitle}</span>
            <span class="pds-legend-item"><span class="pds-legend-swatch pds-sw-free"></span>${T.statusFree}</span>
            <span class="pds-legend-item"><span class="pds-legend-swatch pds-sw-occupied"></span>${T.statusOccupied}</span>
            <span class="pds-legend-item"><span class="pds-legend-swatch pds-sw-reserved"></span>${T.statusReserved}</span>
            <span class="pds-legend-item"><span class="pds-legend-swatch pds-sw-cleaning"></span>${T.statusCleaning}</span>
          </div>
          <div class="pds-bar-tools">
            ${state.mode === 'layout' ? `
              <button class="pds-tool" data-pds-action="undo" title="${T.undo}" aria-label="${T.undo}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.4 2.6L3 13"/></svg>
              </button>
              <button class="pds-tool" data-pds-action="redo" title="${T.redo}" aria-label="${T.redo}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.4 2.6L21 13"/></svg>
              </button>` : ''}
            <button class="pds-tool pds-tool-view" data-pds-action="toggle-view"
                    title="${noir ? T.viewJour : T.viewNuit}" aria-label="${noir ? T.viewJour : T.viewNuit}">
              ${noir
                ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
                : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'}
            </button>
            <label class="pds-snap" title="${T.snapHint}">
              <input type="checkbox" data-pds-snap ${state.snap?'checked':''}/>
              <span>${state.snap ? T.snapOn : T.snapOff}</span>
            </label>
          </div>
        </div>
        <div class="pds-plan-canvas" data-pds-backdrop
             style="${!noir && pdsRoom(zone).backdrop ? `background:${pdsRoom(zone).backdrop};` : ''}">
          <div class="pds-plan-room" data-pds-room style="max-width:${P.w}px; aspect-ratio:${P.w} / ${P.h};">
            <div class="pds-plan-label">${pdsEsc(zone?.name || '')} <em>· ${T.viewOwner || 'vue propriétaire'}</em></div>
            <div class="pds-plan-scale" data-pds-scale
                 style="width:${P.w}px; height:${P.h}px; transform:scale(calc(100cqw / ${P.w}px));">
              <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
                <linearGradient id="pdsNoirBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#101312"/><stop offset="100%" stop-color="#050605"/></linearGradient>
                <radialGradient id="pdsNoirCall"><stop offset="0%" stop-color="#00FFAE" stop-opacity="0.20"/><stop offset="100%" stop-color="#00FFAE" stop-opacity="0"/></radialGradient>
                <filter id="pdsNoirLift" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/></filter>
                <radialGradient id="pdsJourCall"><stop offset="0%" stop-color="#0B6E4F" stop-opacity="0.16"/><stop offset="100%" stop-color="#0B6E4F" stop-opacity="0"/></radialGradient>
                <filter id="pdsJourLift" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0A0F0D" flood-opacity="0.20"/></filter>
              </defs></svg>
              ${noir ? pdsRoomShellNoir(zone) : pdsRoomShellJour(zone)}
              <div class="pds-canvas" data-pds-canvas style="width:${P.w}px; height:${P.h}px;">
                ${isEmpty ? pdsRenderEmpty(state, T) : ''}
                ${ordered.map(e => pdsRenderElement(e, state, T)).join('')}
                ${pdsRenderGroups(tablesInZone, state, T)}
                ${tablesInZone.map(t => pdsRenderTable(t, state, T)).join('')}
                <div class="pds-bulk" data-pds-bulk hidden></div>
              </div>
            </div>
          </div>
          <div class="pds-plan-footer">
            <span class="pds-plan-floor-count">${T.floorCount(occ, tablesInZone.length)}</span>
            <span class="pds-plan-dims">${P.w} × ${P.h} ${T.unitCm}</span>
          </div>
        </div>
      </div>
      <div class="pds-inspector" data-pds-inspector>
        ${pdsRenderInspectorEmpty(state, T)}
      </div>
    </div>
  `;
}

/* Merchant-authored strings (zone names, fixture labels) reach innerHTML, so
   they get escaped. `${zone.name}` used to interpolate raw. */

function pdsRenderEmpty(state, T) {
  return `
    <div class="pds-empty">
      <h4>${T.emptyTitle}</h4>
      <p>${T.emptyDesc}</p>
      <div style="display:flex; gap:8px; justify-content:center;">
        <button class="kb atlas" data-pds-action="open-wizard">${T.wizGenerate}</button>
        <button class="kb ghost" data-pds-action="add-table-default">${T.emptyBlank}</button>
      </div>
    </div>
  `;
}

/* Layout rail — table palette + every fixture kind + the room panel.
   The fixture list is generated from PDS_FIX, so adding a kind there makes it
   placeable here with no second edit. */
function pdsRenderLayoutRail(state, T) {
  const types = ['round2','round4','round6','round8','sq2','sq4','rect4','rect6','rect8','rect10','bar','high'];
  const groups = {};
  Object.entries(PDS_FIX).forEach(([k, v]) => { (groups[v.grp] = groups[v.grp] || []).push([k, v]); });
  return `
    <div class="pds-rail-card">
      <div class="pds-rail-title">${T.paletteTitle}</div>
      <div class="pds-rail-hint">${T.paletteHint} ${T.editHint}</div>
      <div class="pds-palette">
        ${types.map(k => {
          const t = PDS_TABLE_TYPES[k];
          return `
            <button class="pds-pal-item" data-pds-action="add-table" data-pds-type="${k}" title="${t.label(T)}">
              <span class="pds-pal-shape pds-pal-${t.shape}" style="width:${Math.min(t.w/2, 28)}px; height:${Math.min(t.h/2, 28)}px;"></span>
              <span class="pds-pal-label">${t.label(T)}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
    ${Object.entries(groups).map(([grp, items]) => `
      <div class="pds-rail-card">
        <div class="pds-rail-title">${T['grp' + grp.charAt(0).toUpperCase() + grp.slice(1)] || PDS_FIX_GRP[grp]}</div>
        <div class="pds-palette pds-palette-el">
          ${items.map(([k, v]) => `
            <button class="pds-pal-item pds-pal-el" data-pds-action="add-el" data-pds-eltype="${k}"
                    title="${T['fix' + k] || k}">
              <span class="pds-pal-mini">${pdsFixMini(k, v)}</span>
              <span class="pds-pal-label">${T['fix' + k] || k}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('')}
    ${pdsRenderRoomCard(state, T)}
    <div class="pds-rail-card">
      <button class="kb atlas pds-rail-cta" data-pds-action="open-wizard">${T.wizTitle}</button>
      <button class="kb ghost pds-rail-cta" data-pds-action="rename-zone">${T.renameZone}</button>
      <button class="kb ghost pds-rail-cta pds-rail-danger" data-pds-action="delete-zone">${T.deleteZone}</button>
    </div>
  `;
}

/* Palette thumbnail — the fixture drawn by its own draw() at a small size, so
   the button always shows what will actually be placed. No second artwork to
   keep in sync. */
function pdsFixMini(kind, K) {
  const box = 26;
  const ar = K.w / K.h;
  const w = ar >= 1 ? box : Math.max(6, box * ar);
  const h = ar >= 1 ? Math.max(6, box / ar) : box;
  const g = { w, h };
  /* La vignette passe par le MÊME renderer au trait que la scène
     (pdsNoirFixture, qui choisit son encre selon la vue) : le bouton montre
     ce qui sera réellement posé. Le texte n'a pas de dessin — un Aa suffit. */
  const inkAa = pdsNoir() ? 'rgba(255,255,255,0.45)' : 'rgba(10,15,13,0.55)';
  if (K.render === 'none') {
    return `<span style="font:600 9px/1 var(--font-mono,monospace);color:${inkAa};">Aa</span>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${pdsNoirFixture({ type: kind }, K, g)}</svg>`;
}

/* Thumbnail drawn from the candidate's OWN objects. The five templates
   shipped hand-drawn previews next to a stored cover count, which is how
   a card advertising 60 covers could load a plan holding 98 — two sources
   of truth for one number. Here there is only the plan. */
function pdsPlanThumb(plan) {
  const z = plan.zones[0];
  if (!z) return '';
  const W = z.room.w, H = z.room.h;
  const r = pdsRoom(z);
  const items = plan.elements.filter(e => e.zone === z.id)
    .map(e => ({ o: e, c: pdsShade(pdsColor(e), -0.04) }))
    .concat(plan.tables.filter(t => t.zone === z.id).map(t => ({ o: t, c: pdsColor(t) })));
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect x="0" y="0" width="${W}" height="${H}" fill="${r.floor}" stroke="${r.wall}" stroke-width="10"/>
    ${items.map(({ o, c }) => {
      const g = pdsGeom(o);
      const round = (g.shape === 'round');
      return round
        ? `<ellipse cx="${o.x + g.w / 2}" cy="${o.y + g.h / 2}" rx="${g.w / 2}" ry="${g.h / 2}" fill="${c}"/>`
        : `<rect x="${o.x}" y="${o.y}" width="${g.w}" height="${g.h}" rx="6" fill="${c}"/>`;
    }).join('')}
  </svg>`;
}

/* Room panel — floor, walls, finish, dimensions. Replaces the six-scene
   dropdown: instead of picking one of six frozen drawings, the merchant sets
   the four properties those drawings differed by. */
function pdsRenderRoomCard(state, T) {
  const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
  const r = pdsRoom(zone);
  const P = pdsPlane(zone);
  const sw = (val, field) => PDS_MAT.map(m => `
    <button class="pds-sw ${m.c.toLowerCase() === String(val).toLowerCase() ? 'active' : ''}"
            data-pds-room-field="${field}" data-pds-val="${m.c}"
            style="background:${m.c};" title="${T['mat' + m.id] || m.id}"
            aria-label="${T['mat' + m.id] || m.id}"></button>`).join('');
  /* A free picker alongside the 16 tokens. Any hex is allowed, but the
     handler pulls it back into a legible luminance band so pdsInk() can
     always find readable ink for a table number — see pdsSafeColor. */
  const custom = (val, field) => `
    <label class="pds-sw pds-sw-custom" title="${T.customColor}">
      <input type="color" data-pds-room-field="${field}" value="${pdsHexOf(val)}"/>
    </label>`;
  /* En vue nuit le rendu aplatit toute matière vers le charbon (pdsNoirC) :
     ambiance, sol, murs, fond et finition n'auraient aucun effet visible.
     On ne montre que les dimensions. La vue jour trace murs et sol à l'encre
     (pdsRoomShellJour) : seuls ambiance, teinte du sol et fond jouent encore —
     murs et finition ont suivi le même sort que la nuit. */
  const noir = pdsNoir();
  return `
    <div class="pds-rail-card">
      <div class="pds-rail-title">${T.roomTitle}</div>
      <div class="pds-rail-hint">${noir ? T.roomHintNuit : T.roomHint}</div>
      ${noir ? '' : `
      <label class="pds-mini-label">${T.ambianceLabel}</label>
      <div class="pds-amb-row">
        ${Object.keys(PDS_AMBIANCE).map(k => {
          const A = PDS_AMBIANCE[k];
          return `<button class="pds-amb ${zone && zone.ambiance === k ? 'active' : ''}"
                          data-pds-action="ambiance" data-pds-amb="${k}" title="${T['amb'+k]}">
            <span class="pds-amb-chips" aria-hidden="true">
              <i style="background:${A.room.floor}"></i><i style="background:${A.room.wall}"></i>
              <i style="background:${A.table}"></i><i style="background:${A.backdrop}"></i>
            </span>
            <span class="pds-amb-name">${T['amb'+k]}</span>
          </button>`;
        }).join('')}
      </div>
      <label class="pds-mini-label">${T.roomFloor}</label>
      <div class="pds-sw-row">${sw(r.floor, 'floor')}${custom(r.floor, 'floor')}</div>
      <label class="pds-mini-label">${T.roomBackdrop}</label>
      <div class="pds-sw-row">
        <button class="pds-sw pds-sw-none ${r.backdrop ? '' : 'active'}"
                data-pds-room-field="backdrop" data-pds-val=""
                title="${T.backdropNone}" aria-label="${T.backdropNone}"></button>
        ${sw(r.backdrop, 'backdrop')}${custom(r.backdrop || '#F7F5F0', 'backdrop')}
      </div>`}
      <div class="pds-num-grid">
        <label>${T.roomW}<input class="kf-input pds-input" type="number" min="240" max="2400" step="20" data-pds-room-field="w" value="${P.w}"/></label>
        <label>${T.roomH}<input class="kf-input pds-input" type="number" min="200" max="2000" step="20" data-pds-room-field="h" value="${P.h}"/></label>
        <label>${T.roomWallW}<input class="kf-input pds-input" type="number" min="0" max="14" step="1" data-pds-room-field="wallW" value="${r.wallW}"/></label>
      </div>
    </div>
  `;
}

/* Assignation rail — roster of servers */
function pdsRenderAssignRail(state, T) {
  return `
    <div class="pds-rail-card">
      <div class="pds-rail-title">${T.rosterTitle}</div>
      <div class="pds-rail-hint">${T.rosterHint}</div>
      <div class="pds-roster">
        ${state.staff.map(s => {
          const tbls = state.tables.filter(t => t.server === s.id);
          const seats = tbls.reduce((acc, t) => acc + pdsGeom(t).seats, 0);
          return `
            <div class="pds-chip" draggable="false" data-pds-chip="${s.id}" style="--chip:${s.color};">
              <span class="pds-chip-dot"></span>
              <span class="pds-chip-body">
                <b>${pdsEsc(s.name)}</b>
                <em>${T.rosterTables(tbls.length)} · ${T.rosterCovers(seats)}</em>
              </span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    <div class="pds-rail-card">
      <button class="kb ghost pds-rail-cta pds-rail-danger" data-pds-action="clear-assign">${T.clearAssign}</button>
    </div>
  `;
}

/* Empty inspector */
function pdsRenderInspectorEmpty(state, T) {
  if (state.mode === 'assign') {
    return `
      <div class="pds-rail-card pds-inspect-empty">
        <div class="pds-rail-title">${T.modeAssign}</div>
        <div class="pds-rail-hint">${T.modeAssignDesc}</div>
        ${pdsRenderAssignSummary(state, T)}
      </div>
    `;
  }
  return `
    <div class="pds-rail-card pds-inspect-empty">
      <div class="pds-rail-title">${T.selection}</div>
      <div class="pds-rail-hint">${T.bulkHintNone}</div>
    </div>
  `;
}

function pdsRenderAssignSummary(state, T) {
  /* Tables per server — quick overview when no table is selected */
  return `
    <div class="pds-assign-sum">
      ${state.staff.map(s => {
        const tbls = state.tables.filter(t => t.server === s.id);
        return `<div class="pds-asum-row" style="--chip:${s.color};">
          <span class="pds-asum-dot"></span>
          <span class="pds-asum-name">${pdsEsc(s.name.split(' ')[0])}</span>
          <span class="pds-asum-n">${tbls.length}</span>
        </div>`;
      }).join('')}
      ${state.tables.filter(t => !t.server).length > 0 ? `
        <div class="pds-asum-row pds-asum-unassigned">
          <span class="pds-asum-dot" style="--chip:#9CA3AF;"></span>
          <span class="pds-asum-name">${T.rosterUnassigned}</span>
          <span class="pds-asum-n">${state.tables.filter(t => !t.server).length}</span>
        </div>
      ` : ''}
    </div>
  `;
}

/* ─── Inspector ───────────────────────────────────────────────────────────
 *   One inspector serves tables and fixtures. Geometry (X/Y/W/H/rotation) is
 *   editable numerically as well as by handle, because "make both banquettes
 *   exactly 240 wide" is not a drag gesture.                               */
function pdsRenderInspector(state, T, obj) {
  const found = pdsFind(state, obj.id) || { o: obj, table: true };
  const isT = found.table;
  const g = pdsGeom(obj);
  const c = pdsColor(obj);
  const K = isT ? (PDS_TABLE_TYPES[obj.type] || {}) : (PDS_FIX[obj.type] || {});
  const title = isT ? T.inspectorTitle(obj.num)
                    : (T['fix' + obj.type] || obj.type);
  const swatches = PDS_MAT.map(m => `
    <button class="pds-sw ${m.c.toLowerCase() === String(c).toLowerCase() ? 'active' : ''}"
            data-pds-field="color" data-pds-val="${m.c}" style="background:${m.c};"
            title="${T['mat' + m.id] || m.id}" aria-label="${T['mat' + m.id] || m.id}"></button>`).join('')
    /* Free picker per object. Choosing one sets colorLock, so a later
       ambiance repaints the room around this piece and leaves it alone. */
    + `<label class="pds-sw pds-sw-custom ${obj.colorLock ? 'active' : ''}" title="${T.customColor}">
         <input type="color" data-pds-field="color" value="${pdsHexOf(c)}"/>
       </label>`;
  return `
    <div class="pds-rail-card pds-inspect" data-pds-inspect-id="${obj.id}">
      <div class="pds-inspect-head">
        <div class="pds-rail-title">${pdsEsc(title)}</div>
        <button class="pds-inspect-close" data-pds-action="deselect" title="${T.bulkClear}" aria-label="${T.bulkClear}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      ${isT ? `
        <div class="pds-form-row">
          <label>${T.inspectorNum}</label>
          <input class="kf-input pds-input" data-pds-field="num" value="${pdsEsc(obj.num)}"/>
        </div>
        <div class="pds-form-row">
          <label>${T.inspectorType}</label>
          <select class="kf-input pds-input" data-pds-field="type">
            ${Object.entries(PDS_TABLE_TYPES).map(([k,v]) => `<option value="${k}" ${k===obj.type?'selected':''}>${v.label(T)}</option>`).join('')}
          </select>
        </div>
        <div class="pds-form-row">
          <label>${T.inspectorSeats}</label>
          <div class="pds-step">
            <button class="pds-step-btn" data-pds-action="seats-down" data-pds-id="${obj.id}" aria-label="−">−</button>
            <input class="kf-input pds-input pds-step-val" type="number" min="0" max="24" data-pds-field="seats" value="${g.seats}"/>
            <button class="pds-step-btn" data-pds-action="seats-up" data-pds-id="${obj.id}" aria-label="+">+</button>
          </div>
        </div>
      ` : `
        <div class="pds-form-row">
          <label>${T.inspectorLabel}</label>
          <input class="kf-input pds-input" data-pds-field="label"
                 value="${pdsEsc(obj.label != null ? obj.label : (K.label || ''))}" placeholder="—"/>
        </div>
      `}

      <div class="pds-form-row">
        <label>${T.inspectorSize} <span class="pds-unit">${T.unitCm}</span></label>
        <div class="pds-num-grid pds-num-4">
          <label>L<input class="kf-input pds-input" type="number" min="${K.minW||16}" max="2400" data-pds-field="w" value="${Math.round(g.w)}"/></label>
          <label>H<input class="kf-input pds-input" type="number" min="${K.minH||16}" max="2000" data-pds-field="h" value="${Math.round(g.h)}"/></label>
          <label>X<input class="kf-input pds-input" type="number" min="0" max="2400" data-pds-field="x" value="${Math.round(obj.x)}"/></label>
          <label>Y<input class="kf-input pds-input" type="number" min="0" max="2000" data-pds-field="y" value="${Math.round(obj.y)}"/></label>
        </div>
      </div>

      <div class="pds-form-row">
        <label>${T.inspectorRotation} <span class="pds-unit" data-pds-rotout>${Math.round(obj.rot||0)}°</span></label>
        <div class="pds-rot-row">
          <input class="pds-range" type="range" min="0" max="359" step="1" data-pds-field="rot" value="${Math.round(obj.rot||0)}"/>
          <input class="kf-input pds-input pds-rot-num" type="number" min="0" max="359" step="1"
                 data-pds-field="rot" value="${Math.round(obj.rot||0)}" aria-label="${T.inspectorRotation}"/>
          <button class="pds-step-btn" data-pds-action="rot-90" data-pds-id="${obj.id}" title="+90°">90°</button>
        </div>
      </div>

      ${!pdsNoir() && isT ? `
      <div class="pds-form-row">
        <label>${T.inspectorMaterial}</label>
        <div class="pds-sw-row">${swatches}</div>
      </div>` : ''}

      ${isT ? `
        <div class="pds-form-row">
          <label>${T.inspectorStatus}</label>
          <div class="pds-status-pills" data-pds-status-row>
            ${['free','occupied','reserved','cleaning'].map(st => `
              <button class="pds-status-pill pds-pill-${st} ${obj.status===st?'active':''}" data-pds-status="${st}">
                ${T['status' + st.charAt(0).toUpperCase() + st.slice(1)]}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="pds-form-row">
          <label>${T.inspectorServer}</label>
          <select class="kf-input pds-input" data-pds-field="server">
            <option value="">${T.inspectorUnassigned}</option>
            ${state.staff.map(s => `<option value="${s.id}" ${s.id===obj.server?'selected':''}>${pdsEsc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="pds-form-row">
          <label>${T.inspectorNotes}</label>
          <input class="kf-input pds-input" data-pds-field="notes" value="${pdsEsc(obj.notes || '')}" placeholder="—"/>
        </div>
      ` : `
        <div class="pds-form-row">
          <label>${T.inspectorDepth}</label>
          <div class="pds-inspect-actions pds-actions-tight">
            <button class="kb ghost" data-pds-action="layer-back" data-pds-id="${obj.id}">${T.layerBack}</button>
            <button class="kb ghost" data-pds-action="layer-front" data-pds-id="${obj.id}">${T.layerFront}</button>
          </div>
        </div>
      `}

      ${isT && obj.group ? (() => {
        /* La fusion se lit ici aussi : partenaires et capacité partagée. */
        const disp = (n) => /^\d$/.test(String(n)) ? '0' + n : n;
        const peers = state.tables.filter(tt => tt.group === obj.group && tt.id !== obj.id)
          .sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }));
        const seats = state.tables.filter(tt => tt.group === obj.group)
          .reduce((s, tt) => s + (pdsGeom(tt).seats || 0), 0);
        return `<div class="pds-group-info">${pdsEsc(T.groupedWith(peers.map(p => disp(p.num)).join(' + ')))} · ${pdsEsc(T.groupCovers(seats))}</div>`;
      })() : ''}

      <div class="pds-inspect-actions">
        <button class="kb ghost" data-pds-action="obj-lock" data-pds-id="${obj.id}">${obj.locked ? T.unlock : T.lock}</button>
        ${isT ? `<button class="kb ghost ${state._groupPickFrom === obj.id ? 'pds-group-arming' : ''}" data-pds-action="${obj.group ? 'table-ungroup' : 'table-group'}" data-pds-id="${obj.id}">${obj.group ? T.ungroupTables : T.groupTables}</button>` : ''}
        <button class="kb ghost" data-pds-action="table-duplicate" data-pds-id="${obj.id}">${T.inspectorDuplicate}</button>
        <button class="kb ghost pds-rail-danger" data-pds-action="table-delete" data-pds-id="${obj.id}">${T.inspectorDelete}</button>
      </div>
    </div>
  `;
}

function pdsRenderBulkInspector(state, T, selectedIds) {
  return `
    <div class="pds-rail-card pds-inspect">
      <div class="pds-inspect-head">
        <div class="pds-rail-title">${T.selection} · ${selectedIds.length}</div>
        <button class="pds-inspect-close" data-pds-action="deselect" title="${T.bulkClear}" aria-label="${T.bulkClear}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="pds-form-row">
        <label>${T.bulkSetStatus}</label>
        <div class="pds-status-pills">
          ${['free','occupied','reserved','cleaning'].map(st => `
            <button class="pds-status-pill pds-pill-${st}" data-pds-action="bulk-status" data-pds-status="${st}">
              ${T['status' + st.charAt(0).toUpperCase() + st.slice(1)]}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="pds-inspect-actions" style="margin-top:6px;">
        <button class="kb ghost" data-pds-action="bulk-align-h">${T.bulkAlignH}</button>
        <button class="kb ghost" data-pds-action="bulk-align-v">${T.bulkAlignV}</button>
        <button class="kb ghost" data-pds-action="bulk-dist-h">${T.bulkDistH}</button>
        <button class="kb ghost" data-pds-action="bulk-dist-v">${T.bulkDistV}</button>
      </div>
      <div class="pds-inspect-actions">
        <button class="kb ghost" data-pds-action="bulk-group">${T.bulkGroup}</button>
        <button class="kb ghost" data-pds-action="bulk-clear">${T.bulkClear}</button>
        <button class="kb ghost pds-rail-danger" data-pds-action="bulk-delete" style="grid-column:1 / -1;">${T.bulkDelete}</button>
      </div>
    </div>
  `;
}

/* ─── Seating ─────────────────────────────────────────────────────────────
 *   Chairs are derived from the table's CURRENT dimensions, not from a fixed
 *   per-type recipe. Each side's capacity comes from its length, so widening
 *   a 4-top puts the new chairs on the long sides instead of cramming them,
 *   and a resize visibly changes the seating — which is the whole point of
 *   being able to resize.                                                  */

/* One chair, anchored at a point ON the table edge and extending outward
   along its local −y. Seat pad + backrest, drawn in logical units. */


/* Compose a fixture's box into CSS.
 *   `bg` may be a solid or a gradient and `overlay` is a second image layer
 *   (brass rail, tile hatch, slats). They cannot both go through the
 *   `background` shorthand: the shorthand resets background-image, so a later
 *   `background-image: <overlay>` silently DELETED the body gradient — which
 *   is why the comptoir rendered as an empty outline with a gold strip. Both
 *   go into one background-image list instead, overlay first (topmost), with
 *   a solid background-color underneath. */

/* Resize/rotate affordances, drawn only on the single selected object.
   Inset by --pad so they hug the tabletop, not the chair band. */
function pdsHandles(o, g, T) {
  if (o.locked) {
    return `<span class="pds-locked" title="${T.lockedHint}" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    </span>`;
  }
  const dirs = ['nw','n','ne','e','se','s','sw','w'];
  return `<div class="pds-hdl-layer">
    ${dirs.map(d => `<span class="pds-hdl pds-hdl-${d}" data-pds-handle="${d}" data-pds-hid="${o.id}"></span>`).join('')}
    <span class="pds-hdl pds-hdl-rot" data-pds-handle="rot" data-pds-hid="${o.id}" title="${T.rotateHint}"></span>
    <span class="pds-dim">${Math.round(g.w)}×${Math.round(g.h)}</span>
  </div>`;
}

/* ─── Table ───────────────────────────────────────────────────────────────
 *   The viewBox is generated from this table's own w/h, so one SVG unit is
 *   one logical unit and the tabletop cannot be stretched out of shape no
 *   matter what size the merchant drags it to. Number and cover count are an
 *   HTML overlay, never SVG text — SVG text scales with the shape and smears
 *   on a long table.                                                       */
/* ─── Tables groupées, façon accueil ─────────────────────────────────────
 * Le mockup de l'accueil fusionne « 06 + 07 » : une enveloppe capsule qui
 * embrasse les deux tables, un halo doux derrière, et une pastille combinée
 * au-dessus. Ici la même grammaire, pilotée par `t.group` (id partagé,
 * persisté dans le plan) : l'enveloppe se dessine SOUS les tables — c'est
 * un lien, pas un couvercle — et suit les tables quand on les déplace. */
function pdsSweepGroups(state) {
  /* Un groupe réduit à une seule table après suppression n'existe plus. */
  const count = {};
  state.tables.forEach(t => { if (t.group) count[t.group] = (count[t.group] || 0) + 1; });
  state.tables.forEach(t => { if (t.group && count[t.group] < 2) delete t.group; });
}

function pdsRenderGroups(tables, state, T) {
  const byGroup = new Map();
  tables.forEach(t => {
    if (!t.group) return;
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group).push(t);
  });
  let out = '';
  byGroup.forEach((members, gid) => {
    if (members.length < 2) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let seats = 0;
    members.forEach(t => {
      const g = pdsGeom(t);
      x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y);
      x1 = Math.max(x1, t.x + g.w); y1 = Math.max(y1, t.y + g.h);
      seats += g.seats || 0;
    });
    const pad = 8;
    const nums = members.slice()
      .sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }))
      .map(t => /^\d$/.test(String(t.num)) ? '0' + t.num : t.num);
    out += `
      <div class="pds-group-env" data-pds-group="${pdsEsc(gid)}" style="left:${x0 - pad}px; top:${y0 - pad}px; width:${(x1 - x0) + pad * 2}px; height:${(y1 - y0) + pad * 2}px;">
        <span class="pds-group-chip">${pdsEsc(nums.join(' + '))}<span class="pds-group-covers"> · ${pdsEsc(T.groupCovers(seats))}</span></span>
      </div>`;
  });
  return out;
}

function pdsRenderTable(t, state, T) {
  const g = pdsGeom(t);
  /* Les deux vues passent par le MÊME tracé (chaises en tirets, corps posé
     sur son ombre, numéro à deux chiffres) — seule l'encre change : blanc et
     menthe la nuit, encre et atlas le jour, où le corps porte en plus le
     lavis de la matière choisie (pdsJourC) pour que le nuancier MATIÈRE
     reste un vrai choix. Le rendu matières de floorplan-core reste à la
     caisse, intact. */
  const noir = pdsNoir();
  const c = pdsColor(t);
  const P = PDS_PAD;
  const sel = PDS_SEL.has(t.id);
  const only = sel && PDS_SEL.size === 1;
  const sv = state.staff.find(s => s.id === t.server);
  const initials = sv ? sv.name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase() : '';
  const R = noir ? PDS_STATUS_RING_NOIR : PDS_STATUS_RING_JOUR;
  const ring = R[t.status] || R.free;
  const ink = noir ? 'rgba(255,255,255,0.5)'
    : (t.status === 'occupied' ? '#0B6E4F' : 'rgba(10,15,13,0.60)');
  const body = noir
    ? pdsNoirTableBody(g, ring, t.status || 'free')
    : pdsNoirTableBody(g, ring, t.status || 'free', pdsJourC(c, 0.30));

  const showChairs = state.showChairs !== false;
  const chairs = showChairs ? pdsNoirChairs(g, g.seats, ring) : '';
  const numDisp = /^\d$/.test(String(t.num)) ? '0' + t.num : t.num;
  const serverBadge = sv
    ? `<span class="pds-tbl-server" style="background:${sv.color};" title="${pdsEsc(sv.name)}">${initials}</span>`
    : '';
  /* La pastille « 6 min » du mockup : le temps depuis l'assise, posé
   * au-dessus de la table. Elle n'existe que si la table porte son heure
   * d'occupation (t.since, écrite quand le statut passe à occupée). */
  let sinceChip = '';
  if (t.status === 'occupied' && t.since > 0) {
    const min = Math.max(0, Math.round((Date.now() - t.since) / 60000));
    const disp = min >= 90 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
    sinceChip = `<span class="pds-tbl-since">${disp}</span>`;
  }

  return `
    <div class="pds-tbl-cell ${sel?'is-selected':''} ${state.mode==='assign' && sv?'pds-has-server':''} ${t.locked?'is-locked':''}"
         data-pds-table="${t.id}" data-status="${t.status || 'free'}"
         role="button" tabindex="0"
         aria-label="Table ${pdsEsc(t.num)}, ${g.seats} ${T.seats}"
         style="left:${t.x - P}px; top:${t.y - P}px; width:${g.w + P*2}px; height:${g.h + P*2}px;
                --pad:${P}px; transform:rotate(${t.rot||0}deg);">
      <svg class="pds-tbl-svg" viewBox="${-P} ${-P} ${g.w + P*2} ${g.h + P*2}" aria-hidden="true">
        ${chairs}${body}
      </svg>
      <div class="pds-tbl-face" style="color:${ink};">
        <span class="pds-tbl-num">${pdsEsc(numDisp)}</span>
        ${g.seats ? `<span class="pds-tbl-covers">${g.seats}p</span>` : ''}
      </div>
      ${serverBadge}
      ${sinceChip}
      ${only ? pdsHandles(t, g, T) : ''}
    </div>
  `;
}

/* ─── Fixture ─────────────────────────────────────────────────────────────
 *   Two render strategies, chosen per kind — see the note on PDS_FIX. Both
 *   are resize-safe; the label is always an HTML overlay.                   */
function pdsRenderElement(e, state, T) {
  const K = PDS_FIX[e.type];
  if (!K) return '';
  const g = pdsGeom(e);
  const noir = pdsNoir();
  const c = pdsColor(e);
  const sel = PDS_SEL.has(e.id);
  const only = sel && PDS_SEL.size === 1;
  const label = (e.label != null ? e.label : (K.label || ''));

  /* Les deux vues dessinent les mêmes idéogrammes au trait (pdsNoirFixture
     choisit son encre selon la vue) — les gabarits peints de floorplan-core
     restent à la caisse. */
  const inner = K.render === 'none' ? ''
    : `<svg class="pds-el-svg" viewBox="0 0 ${g.w} ${g.h}" aria-hidden="true">${pdsNoirFixture(e, K, g)}</svg>`;

  return `
    <div class="pds-el pds-el-${e.type} ${sel?'is-selected':''} ${e.locked?'is-locked':''}"
         data-pds-el="${e.id}" role="button" tabindex="0"
         aria-label="${pdsEsc(T['fix'+e.type] || e.type)}"
         style="left:${e.x}px; top:${e.y}px; width:${g.w}px; height:${g.h}px;
                --pad:0px; transform:rotate(${e.rot||0}deg); z-index:${10 + (e.z||0)};">
      <div class="pds-el-fill">${inner}</div>
      ${label ? `<span class="pds-el-label" style="color:${noir ? 'rgba(255,255,255,0.45)' : 'rgba(10,15,13,0.55)'};">${pdsEsc(label)}</span>` : ''}
      ${only ? pdsHandles(e, g, T) : ''}
    </div>
  `;
}

/* Rotation mode stage — separate from canvas */
function pdsRenderRotateStage(state, T) {
  const rot = state.rotation;
  const periodLabel = rot.period === 'daily' ? T.rotateDaily :
                     rot.period === 'shift' ? T.rotateShift :
                     rot.period === 'weekly' ? T.rotateWeekly : T.rotateCustom;
  const strategyLabel = rot.strategy === 'zones' ? T.rotZones :
                       rot.strategy === 'tables' ? T.rotTables : T.rotPairs;
  /* Compute preview — 3 rotations forward */
  const preview = pdsRotationPreview(state, 3);
  /* Compute fairness per server — count of unique zones over the last week */
  const fairness = pdsFairness(state);
  return `
    <div class="pds-rotate">
      <div class="pds-rotate-grid">
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotateTitle}</div>
          <div class="pds-rail-hint">${T.rotateDesc}</div>
          <div class="pds-rot-meta">
            <div><span class="pds-rot-lbl">${T.rotatePeriod}</span><span class="pds-rot-val">${periodLabel}</span></div>
            <div><span class="pds-rot-lbl">${T.rotateStrategy}</span><span class="pds-rot-val">${strategyLabel}</span></div>
          </div>
          <div class="pds-rot-actions">
            <button class="kb atlas" data-pds-action="rotate-configure">${T.rotateCTA}</button>
            <button class="kb ghost" data-pds-action="rotate-now">${T.rotNow}</button>
          </div>
        </div>
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotPreview}</div>
          <div class="pds-rail-hint">${rot.strategy === 'zones' ? T.rotZonesDesc : rot.strategy === 'tables' ? T.rotTablesDesc : T.rotPairsDesc}</div>
          <div class="pds-rot-preview">
            ${preview.map((step, idx) => `
              <div class="pds-rot-step">
                <div class="pds-rot-step-h">+${idx+1}</div>
                ${state.staff.slice(0, 6).map(s => {
                  const next = step[s.id];
                  const zone = state.zones.find(z => z.id === next);
                  return `<div class="pds-rot-line" style="--chip:${s.color};">
                    <span class="pds-asum-dot"></span>
                    <b>${s.name.split(' ')[0]}</b>
                    <em>${zone?.name || '—'}</em>
                  </div>`;
                }).join('')}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotFairness}</div>
          <div class="pds-rail-hint">${T.rotHistoryHint}</div>
          <div class="pds-fair">
            ${state.staff.slice(0, 6).map(s => {
              const f = fairness[s.id] || { score: 100, hot: null };
              const cls = f.score >= 70 ? 'high' : f.score >= 50 ? 'mid' : 'low';
              return `
                <div class="pds-fair-row" style="--chip:${s.color};">
                  <span class="pds-asum-dot"></span>
                  <span class="pds-fair-name">${s.name.split(' ')[0]}</span>
                  <span class="pds-fair-bar"><i class="pds-fair-${cls}" style="width:${f.score}%;"></i></span>
                  <span class="pds-fair-pct">${f.score}%</span>
                </div>
                <div class="pds-fair-note">${f.hot ? `<b>${state.zones.find(z=>z.id===f.hot)?.name || f.hot}</b> · ${T.fairnessLow}` : T.fairnessHigh}</div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="pds-rail-card pds-rot-history">
        <div class="pds-rail-title">${T.rotHistoryTitle}</div>
        <div class="pds-rail-hint">${T.rotHistoryHint}</div>
        <div class="pds-history-grid">
          <div class="pds-hist-h">
            <span></span>
            ${(state.history || []).map(d => `<span>${d.label}</span>`).join('')}
          </div>
          ${state.staff.slice(0, 6).map(s => `
            <div class="pds-hist-row" style="--chip:${s.color};">
              <span class="pds-hist-name"><span class="pds-asum-dot"></span>${s.name.split(' ')[0]}</span>
              ${(state.history || []).map(d => {
                const z = d.servers[s.id];
                const zname = state.zones.find(zo => zo.id === z)?.name || '—';
                const tag = z === 'z1' ? 'a' : z === 'z2' ? 'b' : z === 'z3' ? 'c' : 'd';
                return `<span class="pds-hist-cell pds-hist-${tag}" title="${zname}">${zname.slice(0,1)}</span>`;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

/* Compute next 3 rotation steps */
function pdsRotationPreview(state, count) {
  const zoneIds = state.zones.map(z => z.id);
  const result = [];
  for (let i = 0; i < count; i++) {
    const step = {};
    state.staff.slice(0, 6).forEach((s, idx) => {
      const offset = (idx + i + 1) % zoneIds.length;
      step[s.id] = zoneIds[offset];
    });
    result.push(step);
  }
  return result;
}

/* Compute fairness — % of unique zones touched this week */
function pdsFairness(state) {
  const fair = {};
  const history = state.history || [];
  const zoneIds = state.zones.map(z => z.id);
  state.staff.forEach(s => {
    const seen = new Set();
    const count = {};
    history.forEach(d => {
      const z = d.servers[s.id];
      if (z) {
        seen.add(z);
        count[z] = (count[z] || 0) + 1;
      }
    });
    /* Score = uniqueness × balance · 100; "hot" zone = >= 60% */
    const totalDays = history.length || 1;
    const uniqueRatio = zoneIds.length ? seen.size / zoneIds.length : 1;
    const maxCount = Math.max(...Object.values(count), 0);
    const maxRatio = maxCount / totalDays;
    let score = Math.round((uniqueRatio * 70) + ((1 - maxRatio) * 30));
    score = Math.max(0, Math.min(100, score));
    let hot = null;
    Object.entries(count).forEach(([z, c]) => {
      if (c / totalDays >= 0.6) hot = z;
    });
    fair[s.id] = { score, hot };
  });
  return fair;
}

function pdsRenderFoot(state, T) {
  return `
    <div class="pds-foot">
      <div class="pds-foot-meta">
        <span class="mono">PLAN · ${state.tables.length} TABLES · ${state.zones.length} ZONES</span>
      </div>
      <div class="pds-foot-actions">
        <button class="kb ghost" data-pds-action="export">${T.export}</button>
        <button class="kb ghost pds-rail-danger" data-pds-action="reset">${T.reset}</button>
        <button class="kb atlas" data-pds-action="save">${T.save}</button>
        <button class="kb ghost" data-dismiss>${T.close}</button>
      </div>
    </div>
  `;
}

/* ═══ INTERACTIVITY ═════════════════════════════════════════════════ */
function pdsAttach(root, state, T, dr) {
  /* La vue nuit est une classe sur la racine du tiroir : tout le squelette
     pds- en hérite, et la bascule ne re-rend que le corps. */
  root.classList.toggle('pds-noir', pdsNoir());
  /* Re-renders body + foot in-place, then re-binds events. Used after
   * every state mutation. */
  const refresh = () => {
    const body = root.querySelector('.kiwi-drawer-body');
    const foot = root.querySelector('.kiwi-drawer-foot');
    if (body) body.innerHTML = pdsRenderBody(state, T);
    if (foot) foot.innerHTML = pdsRenderFoot(state, T);
    bind();
    try { pdsSave(state); } catch (_) {} /* auto-save every change per store — a design is never lost */
  };

  /* ── Selection store ──────────────────────────────────────────────
   * The renderer needs to know what is selected in order to draw resize
   * handles on it, so the Set is shared with module scope rather than
   * copied — one Set, two readers. */
  PDS_SEL.clear();
  const selection = PDS_SEL;
  PDS_UNDO.stack.length = 0;
  PDS_UNDO.redo.length = 0;

  /* ── Event bindings ───────────────────────────────────────────── */
  const bind = () => {
    /* Mode switcher */
    root.querySelectorAll('[data-pds-mode]').forEach(btn => {
      btn.onclick = () => {
        const m = btn.getAttribute('data-pds-mode');
        if (state.mode === m) return;
        state.mode = m;
        selection.clear();
        refresh();
      };
    });

    /* Zone tabs */
    root.querySelectorAll('[data-pds-zone]').forEach(btn => {
      btn.onclick = () => {
        const z = btn.getAttribute('data-pds-zone');
        if (state.activeZone === z) return;
        state.activeZone = z;
        selection.clear();
        refresh();
      };
    });

    /* Snap toggle */
    const snap = root.querySelector('[data-pds-snap]');
    if (snap) snap.onchange = () => { state.snap = snap.checked; refresh(); };

    /* Action delegation */
    root.querySelectorAll('[data-pds-action]').forEach(btn => {
      btn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const action = btn.getAttribute('data-pds-action');
        pdsHandleAction(action, btn, state, T, root, dr, refresh, selection);
      };
    });

    /* Table click / drag (Layout + Assign) */
    if (state.mode !== 'rotate') {
      root.querySelectorAll('[data-pds-table]').forEach(el => {
        const id = el.getAttribute('data-pds-table');
        pdsAttachDrag(el, id, state, T, root, refresh, selection);
        el.onclick = (ev) => {
          if (ev.detail === 0) return; /* keyboard-triggered click without coords */
        };
      });
      /* Fixtures are selectable now, not just draggable. Selecting one is what
         opens the inspector that can resize, recolour or delete it — the
         capability that did not exist while they were scene artwork. */
      root.querySelectorAll('[data-pds-el]').forEach(el => {
        const id = el.getAttribute('data-pds-el');
        pdsAttachElDrag(el, id, state, T, root, refresh);
        el.onclick = (ev) => {
          ev.stopPropagation();
          if (state.mode !== 'layout') return;
          selection.clear();
          selection.add(id);
          refresh();
          setTimeout(() => openInspector(id), 0);
        };
      });
      pdsAttachResize(root, state, T, refresh, selection);
      /* Assign mode — wire chip drop */
      if (state.mode === 'assign') {
        root.querySelectorAll('[data-pds-chip]').forEach(chip => {
          pdsAttachChipDrag(chip, chip.getAttribute('data-pds-chip'), state, T, root, refresh);
        });
      }
    }

    /* Inspector inputs — resolved through the inspector's own id rather than
       by hunting for a `.is-selected` table in the DOM, so the exact same
       code edits a comptoir, a kitchen or a table. */
    const inspectEl = root.querySelector('[data-pds-inspect-id]');
    const selId = inspectEl ? inspectEl.getAttribute('data-pds-inspect-id') : null;
    const found = selId ? pdsFind(state, selId) : null;
    const reselect = () => {
      refresh();
      setTimeout(() => openInspector(selId), 0);
    };
    if (found) {
      const o = found.o;
      root.querySelectorAll('[data-pds-field]').forEach(input => {
        if (!input.closest('.pds-inspect')) return;
        const f = input.getAttribute('data-pds-field');

        /* Material swatches are buttons, not inputs. */
        if (input.tagName === 'BUTTON') {
          input.onclick = () => {
            pdsPush(state);
            o.color = input.getAttribute('data-pds-val');
            /* A token from the palette is not a hand-mixed colour, so it
               stays fair game for the next ambiance. */
            delete o.colorLock;
            reselect();
          };
          return;
        }

        /* Free colour picker on this one object. */
        if (f === 'color' && input.type === 'color') {
          input.oninput = () => {
            const cc = pdsSafeColor(input.value);
            o.color = cc; o.colorLock = 1;
            pdsRepaintCell(root, state, T, o.id, refresh, selection);
          };
          input.onchange = () => { pdsPush(state); o.color = pdsSafeColor(input.value); o.colorLock = 1; reselect(); };
          return;
        }

        const commit = () => {
          const v = input.value;
          pdsPush(state);
          const plane = pdsPlaneOf(state);
          const K = (found.table ? PDS_TABLE_TYPES[o.type] : PDS_FIX[o.type]) || {};
          if (f === 'num')        o.num = v.trim() || o.num;
          else if (f === 'label') o.label = v;
          else if (f === 'notes') o.notes = v;
          else if (f === 'server') o.server = v || null;
          else if (f === 'type') {
            /* Changing the type re-seeds geometry, otherwise a 2-top turned
               into a 10-top keeps the 2-top's footprint and the seats have
               nowhere to go. */
            const cfg = PDS_TABLE_TYPES[v];
            if (cfg) { o.type = v; o.w = cfg.w; o.h = cfg.h; o.seats = cfg.seats; o.shape = cfg.shape; }
          }
          else if (f === 'seats') o.seats = Math.max(0, Math.min(24, Math.round(+v || 0)));
          else if (f === 'w')     o.w = Math.max(K.minW || 16, Math.min(plane.w, Math.round(+v || 0)));
          else if (f === 'h')     o.h = Math.max(K.minH || 16, Math.min(plane.h, Math.round(+v || 0)));
          else if (f === 'x')     o.x = Math.max(0, Math.min(plane.w - pdsGeom(o).w, Math.round(+v || 0)));
          else if (f === 'y')     o.y = Math.max(0, Math.min(plane.h - pdsGeom(o).h, Math.round(+v || 0)));
          else if (f === 'rot')   o.rot = ((Math.round(+v || 0)) % 360 + 360) % 360;
          /* Geometry edits repaint the one cell they touch. Rebuilding the
             whole drawer and reopening the inspector — what reselect() does —
             is what made typing a size feel like the panel flinched. */
          if (f === 'w' || f === 'h' || f === 'x' || f === 'y' || f === 'rot') {
            pdsRepaintCell(root, state, T, o.id, refresh, selection);
            pdsSyncInspector(root, o);
          } else {
            reselect();
          }
        };
        input.onchange = commit;

        /* The rotation dial previews as you drag it; the commit lands on
           change. Without this the dial only moved the table on release,
           which is the same complaint as the rotate handle. */
        if (f === 'rot' && input.type === 'range') {
          input.oninput = () => {
            const deg = ((Math.round(+input.value || 0)) % 360 + 360) % 360;
            o.rot = deg;
            const cell = root.querySelector(`[data-pds-table="${o.id}"], [data-pds-el="${o.id}"]`);
            if (cell) cell.style.transform = `rotate(${deg}deg)`;
            root.querySelectorAll('[data-pds-field="rot"]').forEach(n => {
              if (n !== input) n.value = deg;
            });
            const out = root.querySelector('[data-pds-rotout]');
            if (out) out.textContent = `${deg}°`;
          };
        }
      });

      /* Status pill row inside inspector */
      root.querySelectorAll('[data-pds-status]').forEach(btn => {
        if (btn.getAttribute('data-pds-action')) return; /* handled elsewhere */
        btn.onclick = () => {
          if (!found.table) return;
          pdsPush(state);
          o.status = btn.getAttribute('data-pds-status');
          /* L'heure d'assise nourrit la pastille « N min » de la vue nuit. */
          if (o.status === 'occupied') { if (!o.since) o.since = Date.now(); }
          else delete o.since;
          /* Une table groupée est UNE table pour le service : le statut
             s'applique au groupe entier, heure d'assise partagée. */
          if (o.group) state.tables.forEach(tt => {
            if (tt.group === o.group && tt.id !== o.id) {
              tt.status = o.status;
              if (o.status === 'occupied') tt.since = o.since;
              else delete tt.since;
            }
          });
          reselect();
        };
      });
    }

    /* Room panel — floor, walls, finish, dimensions of the active zone. */
    root.querySelectorAll('[data-pds-room-field]').forEach(ctl => {
      const f = ctl.getAttribute('data-pds-room-field');
      const apply = (val) => {
        const zone = state.zones.find(z => z.id === state.activeZone);
        if (!zone) return;
        pdsPush(state);
        zone.room = zone.room || {};
        if (f === 'w' || f === 'h') {
          zone.room[f] = Math.max(f === 'w' ? 240 : 200, Math.round(+val || 0));
          /* Shrinking the room must not strand furniture outside it. */
          const plane = pdsPlane(zone);
          const clamp = (o) => {
            const g = pdsGeom(o);
            o.x = Math.max(0, Math.min(plane.w - g.w, o.x));
            o.y = Math.max(0, Math.min(plane.h - g.h, o.y));
          };
          state.tables.filter(t => t.zone === zone.id).forEach(clamp);
          state.elements.filter(e => e.zone === zone.id).forEach(clamp);
        } else if (f === 'wallW') {
          zone.room.wallW = Math.max(0, Math.min(14, Math.round(+val || 0)));
        } else if (f === 'backdrop') {
          /* Empty string is a real choice — "no backdrop", back to paper. */
          zone.room.backdrop = val ? pdsSafeColor(val) : null;
        } else if (f === 'floor' || f === 'wall') {
          zone.room[f] = pdsSafeColor(val);
        } else {
          zone.room[f] = val;
        }
        refresh();
      };
      if (ctl.tagName === 'BUTTON') ctl.onclick = () => apply(ctl.getAttribute('data-pds-val'));
      else if (ctl.type === 'color') {
        /* Live-preview the surface as the picker moves; commit on change so
           one drag through the spectrum is one undo step, not forty. */
        ctl.oninput = () => {
          const c = pdsSafeColor(ctl.value);
          const el = f === 'backdrop' ? root.querySelector('[data-pds-backdrop]')
                   : f === 'floor'    ? root.querySelector('[data-pds-floor]') : null;
          if (f === 'wall') {
            const fl = root.querySelector('[data-pds-floor]');
            if (fl) fl.style.boxShadow = `inset 0 0 0 ${pdsRoom(zone).wallW}px ${c}`;
          } else if (el) {
            el.style.backgroundColor = c;
          }
        };
        ctl.onchange = () => apply(ctl.value);
      }
      else ctl.onchange = () => apply(ctl.value);
    });

    /* Click on empty canvas floor — clears selection (deselects all tables) */
    const canvas = root.querySelector('[data-pds-canvas]');
    if (canvas) {
      canvas.onclick = (ev) => {
        if (ev.target !== canvas) return; /* clicked a table/element child — ignore */
        if (selection.size === 0) return;
        selection.clear();
        root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(el => el.classList.remove('is-selected'));
        openBulkInspector();
      };
    }
  };

  /* Open inspector for any object id — table or fixture. */
  const openInspector = (id) => {
    const f = pdsFind(state, id);
    const inspector = root.querySelector('[data-pds-inspector]');
    if (!inspector) return;
    if (!f) { inspector.innerHTML = pdsRenderInspectorEmpty(state, T); return; }
    inspector.innerHTML = pdsRenderInspector(state, T, f.o);
    bind();
    /* Sous 1100px l'inspecteur passe sous le plan : sélectionner un objet
       ouvrait alors un panneau qu'on ne voyait pas. 'nearest' ne bouge rien
       quand il est déjà à l'écran, donc la colonne large ne saute pas.
       Sans 'smooth' : mesuré dans ce tiroir, l'animation ne défile pas d'un
       pixel là où le saut direct parcourt ses 561. */
    try { inspector.scrollIntoView({ block: 'nearest' }); } catch (_) {}
  };
  /* Open bulk inspector */
  const openBulkInspector = () => {
    const inspector = root.querySelector('[data-pds-inspector]');
    if (!inspector) return;
    if (selection.size === 0) {
      inspector.innerHTML = pdsRenderInspectorEmpty(state, T);
    } else if (selection.size === 1) {
      const id = [...selection][0];
      openInspector(id);
      return;
    } else {
      inspector.innerHTML = pdsRenderBulkInspector(state, T, [...selection]);
    }
    bind();
  };

  /* Wire selection-aware methods onto state so action handlers can use them */
  state._openInspector = openInspector;
  state._openBulkInspector = openBulkInspector;
  state._selection = selection;
  state._refresh = refresh;

  /* Escape key — first press clears table selection, second press lets the
   *   drawer's own Escape handler close the page. Capture phase so we win
   *   the race against the drawer when a table is selected. */
  const onEscape = (ev) => {
    if (ev.key !== 'Escape') return;
    if (selection.size === 0) return; /* let the drawer close itself */
    if (!root.isConnected) return;   /* drawer already gone — bail */
    selection.clear();
    root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(el => el.classList.remove('is-selected'));
    openBulkInspector();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  };
  document.addEventListener('keydown', onEscape, true);
  /* Clean up the keydown listener when the drawer is dismissed. */
  if (dr && typeof dr.close === 'function') {
    const prev = dr.close;
    dr.close = function() {
      document.removeEventListener('keydown', onEscape, true);
      return prev.apply(this, arguments);
    };
  }

  bind();
}

/* ═══ STAGE SCALE ═══════════════════════════════════════════════════
 * The stage is authored once in logical units (${PDS_CANVAS_W}×${PDS_CANVAS_H},
 * 1 unit = 1 cm) and CSS scales it to fit the room (see .pds-plan-scale, which
 * derives the ratio from 100cqw). Everything downstream — drag deltas,
 * snapping, clamping — works in logical units and divides screen pixels by k,
 * so the maths never has to know how wide the window is.
 *
 * k is always MEASURED from the live box, never cached and never written by JS.
 * An earlier version set a --pds-k custom property from a ResizeObserver; at
 * 1024px the room was 712px while the property still read 0.968, and five
 * tables rendered outside the room. One source of truth only. */
function pdsK(root) {
  const scale = root && root.querySelector('[data-pds-scale]');
  if (!scale) return 1;
  const k = scale.getBoundingClientRect().width / PDS_CANVAS_W;
  return (isFinite(k) && k > 0.05) ? k : 1;
}

/* ═══ DRAG SYSTEM (pointer events, CSS transforms) ══════════════════ */
function pdsAttachDrag(el, id, state, T, root, refresh, selection) {
  let dragging = false;
  let startX, startY, origX, origY, transformX, transformY;
  let dragK = 1;
  let blockFrame = 0;
  let groupPeers = [];
  let groupOrig = {};
  const t = state.tables.find(tt => tt.id === id);
  if (!t) return;

  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    /* Mode « grouper » armé : le clic suivant lie les deux tables. Sur
     * soi-même, il annule. On sort avant toute logique de sélection ou de
     * drag — le refresh() reconstruit le DOM, donc plus rien à faire ici. */
    if (state._groupPickFrom) {
      ev.preventDefault();
      const fromId = state._groupPickFrom;
      state._groupPickFrom = null;
      const t = state.tables.find(tt => tt.id === id);
      if (fromId === id || !t) {
        toast(T.groupPickCancel, { duration: 1400 });
        refresh();
        setTimeout(() => state._openInspector(id), 0);
        return;
      }
      const from = state.tables.find(tt => tt.id === fromId);
      if (!from) { refresh(); return; }
      pdsPush(state);
      if (from.group && t.group && from.group !== t.group) {
        /* Deux groupes existants fusionnent : la cible rejoint le premier. */
        const old = t.group;
        state.tables.forEach(tt => { if (tt.group === old) tt.group = from.group; });
      } else {
        const gid = from.group || t.group || ('grp' + Date.now().toString(36));
        from.group = gid; t.group = gid;
      }
      selection.clear();
      selection.add(id);
      refresh();
      const disp = (n) => /^\d$/.test(String(n)) ? '0' + n : n;
      toast(T.groupOk(disp(from.num), disp(t.num)), { type: 'success' });
      setTimeout(() => state._openInspector(id), 0);
      return;
    }
    /* Selection logic */
    if (ev.shiftKey) {
      if (selection.has(id)) {
        selection.delete(id);
        el.classList.remove('is-selected');
      } else {
        selection.add(id);
        el.classList.add('is-selected');
      }
      state._openBulkInspector();
      ev.preventDefault();
      return;
    } else {
      /* Plain click — clear selection, pick this one */
      if (!selection.has(id) || selection.size > 1) {
        selection.clear();
        root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(n => n.classList.remove('is-selected'));
      }
      selection.add(id);
      el.classList.add('is-selected');
      state._openInspector(id);
    }
    dragging = true;
    startX = ev.clientX; startY = ev.clientY;
    origX = t.x; origY = t.y;
    transformX = 0; transformY = 0;
    /* Snapshot the stage scale for the duration of this drag. The table is a
     * child of the scaled plane, so a translate() on it is itself scaled —
     * meaning a screen delta of D px must be written as D/k logical units to
     * track the cursor 1:1. */
    dragK = pdsK(root);
    /* Les partenaires de groupe (et leur enveloppe) suivent le même
       translate pendant le drag : la fusion se déplace d'un seul geste. */
    groupPeers = [];
    groupOrig = {};
    if (t.group) {
      state.tables.forEach(tt => {
        if (tt.group === t.group && tt.id !== id) {
          groupOrig[tt.id] = { x: tt.x, y: tt.y };
          const n = root.querySelector(`[data-pds-table="${tt.id}"]`);
          if (n) groupPeers.push({ n, rot: tt.rot || 0 });
        }
      });
      const env = root.querySelector(`[data-pds-group="${t.group}"]`);
      if (env) groupPeers.push({ n: env, rot: null });
    }
    el.setPointerCapture(ev.pointerId);
    el.classList.add('is-dragging');
    ev.preventDefault();
  });

  el.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    transformX = (ev.clientX - startX) / dragK;
    transformY = (ev.clientY - startY) / dragK;
    el.style.transform = `translate(${transformX}px, ${transformY}px) rotate(${t.rot||0}deg)`;
    groupPeers.forEach(p => {
      p.n.style.transform = `translate(${transformX}px, ${transformY}px)` + (p.rot === null ? '' : ` rotate(${p.rot}deg)`);
    });
    /* The table always follows the cursor 1:1 — a table that refuses to move
       reads as a broken app, not as a rule. Illegality is shown, not enforced,
       until release. The collision test is coalesced to one per frame. */
    if (!blockFrame) blockFrame = requestAnimationFrame(() => {
      blockFrame = 0;
      const at = { x: Math.round(origX + transformX), y: Math.round(origY + transformY) };
      const hits = pdsBlockers(state, t, at);
      el.classList.toggle('is-blocked', hits.length > 0);
      root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
      hits.forEach(b => {
        const n = root.querySelector(`[data-pds-table="${b.id}"], [data-pds-el="${b.id}"]`);
        if (n) n.classList.add('pds-blocker');
      });
    });
  });

  const finish = (ev) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    let nx = origX + transformX;
    let ny = origY + transformY;
    if (state.snap) {
      nx = Math.round(nx / PDS_GRID) * PDS_GRID;
      ny = Math.round(ny / PDS_GRID) * PDS_GRID;
    }
    /* Clamp to the room — its own size, which the merchant can change. */
    const plane = pdsPlaneOf(state);
    const g = pdsGeom(t);
    nx = Math.max(0, Math.min(plane.w - g.w, nx));
    ny = Math.max(0, Math.min(plane.h - g.h, ny));
    if (blockFrame) { cancelAnimationFrame(blockFrame); blockFrame = 0; }
    el.classList.remove('is-blocked');
    root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
    /* Settle. A drop on top of something lands beside it — searched outward
       from where you actually aimed, so the table still goes where you meant
       it to go rather than springing back to where it started. */
    if (selection.size <= 1 && !t.group && pdsBlockers(state, t, { x: nx, y: ny }).length) {
      const spot = pdsNearestFree(state, t, nx, ny, plane);
      if (spot) { nx = spot.x; ny = spot.y; }
      else {
        nx = origX; ny = origY;
        if (window.Kiwi && Kiwi.toast) Kiwi.toast(T.noRoom);
      }
    }
    /* If shift-multi-drag, move all selected by the same delta */
    if (selection.size > 1 && selection.has(id)) {
      const dx = nx - origX;
      const dy = ny - origY;
      state.tables.forEach(tt => {
        if (selection.has(tt.id) && tt.id !== id) {
          const tg = pdsGeom(tt);
          tt.x = Math.max(0, Math.min(plane.w - tg.w, tt.x + dx));
          tt.y = Math.max(0, Math.min(plane.h - tg.h, tt.y + dy));
        }
      });
    }
    /* Une table groupée entraîne ses partenaires : la fusion est un seul
       meuble. Même delta pour chacun, borné à la pièce. Position absolue
       depuis l'origine capturée au pointerdown — un finish() qui rejoue
       (écouteurs empilés par un re-câblage) reste alors sans effet. */
    if (t.group) {
      const dx = nx - origX;
      const dy = ny - origY;
      state.tables.forEach(tt => {
        const o = groupOrig[tt.id];
        if (o && tt.group === t.group && !(selection.size > 1 && selection.has(tt.id))) {
          const tg = pdsGeom(tt);
          tt.x = Math.max(0, Math.min(plane.w - tg.w, o.x + dx));
          tt.y = Math.max(0, Math.min(plane.h - tg.h, o.y + dy));
        }
      });
      groupPeers = [];
    }
    t.x = nx;
    t.y = ny;
    /* Smooth commit: update style then full refresh (which will reset transform) */
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    el.style.transform = `rotate(${t.rot||0}deg)`;
    refresh();
    /* Re-select after refresh */
    setTimeout(() => {
      selection.forEach(sid => {
        const newEl = root.querySelector(`[data-pds-table="${sid}"]`);
        if (newEl) newEl.classList.add('is-selected');
      });
      if (selection.size > 1) state._openBulkInspector();
      else if (selection.size === 1) state._openInspector([...selection][0]);
    }, 0);
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

function pdsAttachElDrag(el, id, state, T, root, refresh) {
  let dragging = false;
  let startX, startY, origX, origY;
  let dragK = 1;
  let moved = false;
  let blockFrame = 0, lastX = 0, lastY = 0;
  const elObj = state.elements.find(e => e.id === id);
  if (!elObj) return;
  let lastTap = 0;
  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    /* Double-click rotates element */
    const now = Date.now();
    if (now - lastTap < 280) {
      elObj.rot = (elObj.rot || 0) + 90;
      refresh();
      lastTap = 0;
      return;
    }
    lastTap = now;
    dragging = true;
    moved = false;
    startX = ev.clientX; startY = ev.clientY;
    origX = elObj.x; origY = elObj.y;
    dragK = pdsK(root);   /* screen px → logical units, see pdsK() */
    el.setPointerCapture(ev.pointerId);
    el.classList.add('is-dragging');
    ev.preventDefault();
  });
  el.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    if (!moved && Math.abs(ev.clientX - startX) < 3 && Math.abs(ev.clientY - startY) < 3) return;
    moved = true;
    el.style.transform = `translate(${(ev.clientX - startX)/dragK}px, ${(ev.clientY - startY)/dragK}px) rotate(${elObj.rot||0}deg)`;
    if (!blockFrame) blockFrame = requestAnimationFrame(() => {
      blockFrame = 0;
      const at = { x: Math.round(origX + (lastX - startX) / dragK), y: Math.round(origY + (lastY - startY) / dragK) };
      const hits = pdsBlockers(state, elObj, at);
      el.classList.toggle('is-blocked', hits.length > 0);
      root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
      hits.forEach(b => {
        const n = root.querySelector(`[data-pds-table="${b.id}"], [data-pds-el="${b.id}"]`);
        if (n) n.classList.add('pds-blocker');
      });
    });
    lastX = ev.clientX; lastY = ev.clientY;
  });
  const finish = (ev) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging', 'is-blocked');
    if (blockFrame) { cancelAnimationFrame(blockFrame); blockFrame = 0; }
    root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
    /* A press that never moved is a click. Refreshing here would rebuild the
       stage DOM before the browser dispatches the click event, so the
       selection handler on this node would never fire — the fixture would
       feel impossible to select, resize or delete. Leave the DOM alone. */
    if (!moved) return;
    let nx = origX + (ev.clientX - startX) / dragK;
    let ny = origY + (ev.clientY - startY) / dragK;
    if (state.snap) {
      nx = Math.round(nx / PDS_GRID) * PDS_GRID;
      ny = Math.round(ny / PDS_GRID) * PDS_GRID;
    }
    const plane = pdsPlaneOf(state);
    const g = pdsGeom(elObj);
    nx = Math.max(0, Math.min(plane.w - g.w, nx));
    ny = Math.max(0, Math.min(plane.h - g.h, ny));
    /* Same settle rule as tables — a kitchen dropped over a table lands
       against it, not through it. */
    if (pdsBlockers(state, elObj, { x: nx, y: ny }).length) {
      const spot = pdsNearestFree(state, elObj, nx, ny, plane);
      if (spot) { nx = spot.x; ny = spot.y; }
      else {
        nx = origX; ny = origY;
        if (window.Kiwi && Kiwi.toast) Kiwi.toast(T.noRoom);
      }
    }
    elObj.x = nx; elObj.y = ny;
    refresh();
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

/* Server chip drag — drop on a table or a zone tab */
function pdsAttachChipDrag(chip, sid, state, T, root, refresh) {
  let dragging = false;
  let startX, startY;
  let ghost = null;
  const create = (ev) => {
    dragging = true;
    startX = ev.clientX; startY = ev.clientY;
    chip.setPointerCapture(ev.pointerId);
    /* Build a floating ghost following the cursor */
    ghost = chip.cloneNode(true);
    ghost.classList.add('pds-chip-ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.opacity = '0.9';
    document.body.appendChild(ghost);
    chip.classList.add('is-dragging');
    ev.preventDefault();
  };
  chip.addEventListener('pointerdown', create);
  chip.addEventListener('pointermove', (ev) => {
    if (!dragging || !ghost) return;
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
  });
  const finish = (ev) => {
    if (!dragging) return;
    dragging = false;
    chip.classList.remove('is-dragging');
    /* Hide the ghost so elementFromPoint reads what's under the cursor */
    if (ghost) ghost.style.display = 'none';
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    if (ghost) { ghost.remove(); ghost = null; }
    if (target) {
      const tableEl = target.closest('[data-pds-table]');
      const zoneEl = target.closest('[data-pds-zone]');
      if (tableEl) {
        const tid = tableEl.getAttribute('data-pds-table');
        const t = state.tables.find(tt => tt.id === tid);
        if (t) {
          t.server = sid;
          const sv = state.staff.find(s => s.id === sid);
          Kiwi.toast(T.assignDone(sv?.name.split(' ')[0] || sid, t.num), { type: 'success', desc: T.assignDoneDesc });
          refresh();
          return;
        }
      } else if (zoneEl) {
        const zid = zoneEl.getAttribute('data-pds-zone');
        /* Assign chip to every table in that zone */
        let count = 0;
        state.tables.forEach(t => { if (t.zone === zid) { t.server = sid; count++; } });
        const zname = state.zones.find(z => z.id === zid)?.name || '';
        const sv = state.staff.find(s => s.id === sid);
        Kiwi.toast(`${sv?.name.split(' ')[0] || sid} → ${zname}`, { type: 'success', desc: `${count} tables affectées.` });
        refresh();
        return;
      }
    }
    /* No drop target — small bounce-back toast (skip if too short of a drag) */
    if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) {
      /* Treated as click — open assign-chip menu */
      Kiwi.toast(state.staff.find(s => s.id === sid)?.name || sid, { type: 'info', desc: T.rosterHint, duration: 1400 });
    }
  };
  chip.addEventListener('pointerup', finish);
  chip.addEventListener('pointercancel', (ev) => {
    if (ghost) { ghost.remove(); ghost = null; }
    chip.classList.remove('is-dragging');
    dragging = false;
  });
}

/* ═══ ACTION HANDLERS ═════════════════════════════════════════════════ */
function pdsHandleAction(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);

  switch (action) {
    case 'toggle-view': {
      pdsSetNoir(!pdsNoir());
      root.classList.toggle('pds-noir', pdsNoir());
      refresh();
      break;
    }
    case 'save': {
      const feedback = Kiwi.buttonFeedback?.(btn, { pending: T.saving, done: T.savedButton });
      pdsSave(state);
      feedback?.success(T.savedButton);
      toast(T.saved, { type: 'success', desc: T.savedDesc, force: true });
      break;
    }
    case 'reset': {
      wireDismiss(modal({
        tag: T.tagPdS,
        title: T.resetTitle,
        desc: T.resetDesc,
        width: 480,
        body: '',
        foot: `
          <button class="kb ghost" data-dismiss>${T.resetCancel}</button>
          <button class="kb atlas" data-dismiss data-pds-reset-confirm>${T.resetConfirm}</button>
        `,
      }));
      const m = document.querySelector('.kiwi-modal:last-of-type [data-pds-reset-confirm]');
      if (m) m.addEventListener('click', () => {
        const fresh = pdsDefaultState();
        Object.keys(state).forEach(k => delete state[k]);
        Object.assign(state, fresh);
        pdsSave(state);
        refresh();
        toast(T.resetDone, { type: 'success', desc: T.resetDoneDesc });
      });
      break;
    }
    case 'export': {
      toast(T.exportToast, { type: 'success', desc: T.exportDesc });
      break;
    }
    case 'add-zone': {
      const m = modal({
        tag: T.tagPdS,
        title: T.addZone,
        desc: T.addZoneDesc,
        width: 480,
        body: `
          <div class="kf-group">
            <label class="kf-label">${T.zoneName}</label>
            <input class="kf-input" data-pds-zone-name autofocus placeholder="${T.zoneName}" value=""/>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button class="kb atlas" data-pds-zone-confirm>${T.zoneAdd}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const confirm = m.el.querySelector('[data-pds-zone-confirm]');
      confirm?.addEventListener('click', () => {
        const input = m.el.querySelector('[data-pds-zone-name]');
        const name = (input?.value || '').trim() || `Zone ${state.zones.length + 1}`;
        const id = 'z' + (Date.now().toString(36).slice(-4));
        state.zones.push({ id, name });
        state.activeZone = id;
        m.close();
        refresh();
        toast(T.zoneAdded, { type: 'success', desc: T.zoneAddedDesc(name) });
      });
      break;
    }
    case 'rename-zone': {
      const z = state.zones.find(zz => zz.id === state.activeZone);
      if (!z) break;
      const m = modal({
        tag: T.tagPdS,
        title: T.renameZoneTitle,
        desc: '',
        width: 480,
        body: `
          <div class="kf-group">
            <label class="kf-label">${T.zoneName}</label>
            <input class="kf-input" data-pds-zone-rename autofocus value="${z.name}"/>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button class="kb atlas" data-pds-zone-rename-confirm>${T.save2}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const confirm = m.el.querySelector('[data-pds-zone-rename-confirm]');
      confirm?.addEventListener('click', () => {
        const input = m.el.querySelector('[data-pds-zone-rename]');
        const name = (input?.value || '').trim();
        if (!name) { m.close(); return; }
        z.name = name;
        m.close();
        refresh();
        toast(T.renameZone, { type: 'success', desc: T.zoneRenamedDesc(name) });
      });
      break;
    }
    case 'delete-zone': {
      if (state.zones.length <= 1) {
        toast(T.deleteZoneNoLast, { type: 'warn', desc: T.deleteZoneNoLastDesc });
        break;
      }
      const z = state.zones.find(zz => zz.id === state.activeZone);
      if (!z) break;
      const count = state.tables.filter(t => t.zone === z.id).length;
      const m = modal({
        tag: T.tagPdS,
        title: T.deleteZoneTitle,
        desc: T.deleteZoneDesc(z.name, count),
        width: 480,
        body: '',
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button class="kb atlas pds-rail-danger" data-pds-zone-del-confirm>${T.deleteZoneOk}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const confirm = m.el.querySelector('[data-pds-zone-del-confirm]');
      confirm?.addEventListener('click', () => {
        state.tables = state.tables.filter(t => t.zone !== z.id);
        state.elements = state.elements.filter(e => e.zone !== z.id);
        state.zones = state.zones.filter(zz => zz.id !== z.id);
        state.activeZone = state.zones[0]?.id;
        m.close();
        refresh();
        toast(T.deleteZoneDone, { type: 'success', desc: `${z.name}` });
      });
      break;
    }
    /* ─── Setup wizard ───────────────────────────────────────────────────
       Replaces the five hard-coded templates. Eight questions, then three
       furnished candidates built from the answers — each labelled with the
       numbers it actually produced, so the count on the card and the count
       on the floor cannot drift apart the way the templates' could. */
    case 'open-templates':
    case 'open-wizard': {
      const A = state._wizAnswers || (state._wizAnswers = {
        venue: 'restaurant', floors: ['RDC'], extras: [],
        dims_default: { w: 1200, h: 800 }, tables: 18,
        kitchenWall: 'n', entranceWall: 's', wc: true,
      });
      let step = 1, plans = null, chosen = null, spin = 0;

      const VENUES = ['restaurant', 'cafe', 'snack', 'patisserie', 'rooftop'];
      const EXTRAS = ['terrasse', 'patio', 'mezzanine', 'salon', 'bar'];
      const WALLS  = ['n', 'e', 's', 'w'];

      const qBody = () => `
        <div class="pds-wiz">
          <label class="pds-wiz-q">${T.wizVenue}</label>
          <div class="pds-wiz-opts">
            ${VENUES.map(v => `<button class="pds-wiz-opt ${A.venue===v?'active':''}" data-wiz-venue="${v}">${T['venue'+v]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizFloors}</label>
          <div class="pds-wiz-opts">
            ${[1,2,3,4].map(n => `<button class="pds-wiz-opt ${A.floors.length===n?'active':''}" data-wiz-floors="${n}">${n}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizExtras}</label>
          <div class="pds-wiz-opts">
            ${EXTRAS.map(e => `<button class="pds-wiz-opt ${A.extras.includes(e)?'active':''}" data-wiz-extra="${e}">${T['extra'+e]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizDims}</label>
          <div class="pds-wiz-dims">
            <label>${T.wizW}<input class="kf-input pds-input" type="number" min="3" max="40" step="0.5" data-wiz-w value="${A.dims_default.w/100}"/><span class="pds-unit">m</span></label>
            <label>${T.wizH}<input class="kf-input pds-input" type="number" min="3" max="40" step="0.5" data-wiz-h value="${A.dims_default.h/100}"/><span class="pds-unit">m</span></label>
            <span class="pds-wiz-area">${((A.dims_default.w*A.dims_default.h)/10000).toFixed(0)} m²</span>
          </div>

          <label class="pds-wiz-q">${T.wizTables}</label>
          <div class="pds-wiz-dims">
            <input class="pds-range" type="range" min="2" max="60" step="1" data-wiz-tables value="${A.tables}"/>
            <span class="pds-wiz-area" data-wiz-tables-out>${A.tables}</span>
          </div>

          <label class="pds-wiz-q">${T.wizKitchen}</label>
          <div class="pds-wiz-opts">
            ${WALLS.map(w => `<button class="pds-wiz-opt ${A.kitchenWall===w?'active':''}" data-wiz-kw="${w}">${T['wall'+w]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizEntrance}</label>
          <div class="pds-wiz-opts">
            ${WALLS.map(w => `<button class="pds-wiz-opt ${A.entranceWall===w?'active':''}" data-wiz-ew="${w}">${T['wall'+w]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizAlso}</label>
          <div class="pds-wiz-opts">
            <button class="pds-wiz-opt ${A.wc?'active':''}" data-wiz-wc>${T.fixwc}</button>
          </div>
        </div>`;

      const cardBody = () => `
        <div class="pds-wiz-cards">
          ${plans.map((p, i) => `
            <button class="pds-wiz-card ${chosen===i?'active':''}" data-wiz-pick="${i}">
              <span class="pds-wiz-thumb">${pdsPlanThumb(p)}</span>
              <span class="pds-wiz-card-name">${T['var'+p.variant]}</span>
              <span class="pds-wiz-card-nums">
                <b>${p.covers}</b> ${T.covers} · ${p.tableCount} ${T.tables}<br/>
                ${p.m2PerCover} m²/${T.cover} · ${T.aisleOf(p.aisle)}
              </span>
              ${p.shortfall ? `<span class="pds-wiz-short">${T.wizShort(p.shortfall, p.requested)}</span>` : ''}
            </button>`).join('')}
        </div>
        <p class="pds-wiz-note">${T.wizCardsNote}</p>`;

      const m = drawer({
        title: T.wizTitle, subtitle: T.wizDesc, width: 620,
        body: qBody(),
        foot: `<button class="kb ghost" data-dismiss>${T.close}</button>
               <button class="kb atlas" data-wiz-go>${T.wizGenerate}</button>`,
      });
      wireDismiss(m);
      if (!m || !m.el) break;

      const bodyEl = () => m.el.querySelector('.kiwi-drawer-body') || m.el.querySelector('.kiwi-modal-body');
      const footEl = () => m.el.querySelector('.kiwi-drawer-foot') || m.el.querySelector('.kiwi-modal-foot');

      const build = () => {
        /* Vary the mix rotation per regeneration so "Régénérer" gives a
           genuinely different arrangement rather than the same one twice. */
        const mix = (PDS_VENUE_MIX[A.venue] || PDS_VENUE_MIX.restaurant).slice();
        for (let i = 0; i < (spin % Math.max(1, mix.length)); i++) mix.push(mix.shift());
        const ans = Object.assign({}, A, {
          mix,
          floors: A.floors,
          extras: A.extras.map(e => T['extra' + e]),
        });
        plans = ['dense', 'confort', 'banquettes'].map(v => pdsGeneratePlan(ans, v));
        chosen = 0;
      };

      const render = () => {
        const b = bodyEl(), f = footEl();
        if (step === 1) {
          if (b) b.innerHTML = qBody();
          if (f) f.innerHTML = `<button class="kb ghost" data-dismiss>${T.close}</button>
                                <button class="kb atlas" data-wiz-go>${T.wizGenerate}</button>`;
        } else {
          if (b) b.innerHTML = cardBody();
          if (f) f.innerHTML = `<button class="kb ghost" data-wiz-back>${T.wizBack}</button>
                                <button class="kb ghost" data-wiz-again>${T.wizAgain}</button>
                                <button class="kb atlas" data-wiz-apply>${T.wizApply}</button>`;
        }
        wireDismiss(m);
        wire();
      };

      const wire = () => {
        const on = (sel, fn) => m.el.querySelectorAll(sel).forEach(el => el.onclick = () => fn(el));
        on('[data-wiz-venue]', el => { A.venue = el.getAttribute('data-wiz-venue'); render(); });
        on('[data-wiz-floors]', el => {
          const n = +el.getAttribute('data-wiz-floors');
          const names = ['RDC', '1er', '2e', '3e'];
          A.floors = names.slice(0, n); render();
        });
        on('[data-wiz-extra]', el => {
          const k = el.getAttribute('data-wiz-extra');
          A.extras = A.extras.includes(k) ? A.extras.filter(x => x !== k) : A.extras.concat(k);
          render();
        });
        on('[data-wiz-kw]', el => { A.kitchenWall = el.getAttribute('data-wiz-kw'); render(); });
        on('[data-wiz-ew]', el => { A.entranceWall = el.getAttribute('data-wiz-ew'); render(); });
        on('[data-wiz-wc]', () => { A.wc = !A.wc; render(); });

        const wIn = m.el.querySelector('[data-wiz-w]'), hIn = m.el.querySelector('[data-wiz-h]');
        if (wIn) wIn.onchange = () => { A.dims_default.w = Math.round(Math.max(3, +wIn.value || 12) * 100); render(); };
        if (hIn) hIn.onchange = () => { A.dims_default.h = Math.round(Math.max(3, +hIn.value || 8) * 100); render(); };
        const tIn = m.el.querySelector('[data-wiz-tables]');
        if (tIn) {
          tIn.oninput = () => {
            A.tables = +tIn.value;
            const out = m.el.querySelector('[data-wiz-tables-out]');
            if (out) out.textContent = A.tables;
          };
        }

        const go = m.el.querySelector('[data-wiz-go]');
        if (go) go.onclick = () => { build(); step = 2; render(); };
        const back = m.el.querySelector('[data-wiz-back]');
        if (back) back.onclick = () => { step = 1; render(); };
        const again = m.el.querySelector('[data-wiz-again]');
        if (again) again.onclick = () => { spin++; build(); render(); };
        on('[data-wiz-pick]', el => { chosen = +el.getAttribute('data-wiz-pick'); render(); });

        const apply = m.el.querySelector('[data-wiz-apply]');
        if (apply) apply.onclick = () => {
          const p = plans[chosen];
          if (!p) return;
          pdsPush(state);
          state.zones = p.zones;
          state.tables = p.tables;
          state.elements = p.elements;
          state.activeZone = p.zones[0].id;
          state.v = 2;
          selection.clear();
          try { pdsSave(state); } catch (_) {}
          /* Closing this drawer takes the plan drawer underneath with it, so
             the merchant would land back on the dashboard having never seen
             the room they just built — the one moment it most needs to be on
             screen. Re-open it explicitly instead of assuming it survived. */
          m.close();
          refresh();
          setTimeout(() => {
            if (!document.querySelector('[data-pds-canvas]')) {
              try { handlers['nav-tables'](); } catch (_) {}
            }
            toast(T.wizDone(p.covers), {
              type: 'success',
              desc: p.shortfall ? T.wizShort(p.shortfall, p.requested) : T.wizDoneDesc(p.tableCount, p.aisle),
            });
          }, 60);
        };
      };

      wire();
      break;
    }
    case 'add-table':
    case 'add-table-default': {
      const type = action === 'add-table-default' ? 'round4' : btn.getAttribute('data-pds-type');
      const cfg = PDS_TABLE_TYPES[type] || PDS_TABLE_TYPES.round4;
      pdsPush(state);
      const plane = pdsPlaneOf(state);
      const spot = pdsFreeSpot(state, cfg.w, cfg.h, plane);
      const num = String(state.tables.length + 1);
      const newT = {
        id: newTableId(),
        zone: state.activeZone,
        type,
        x: spot.x,
        y: spot.y,
        /* Geometry is stamped onto the instance at birth. The type is only a
           source of defaults from here on, so resizing this table cannot
           affect any other table of the same type. */
        w: cfg.w, h: cfg.h, seats: cfg.seats, shape: cfg.shape,
        color: null,
        num,
        status: 'free',
        server: null,
        notes: '',
        rot: 0,
        locked: false,
      };
      state.tables.push(newT);
      /* Select BEFORE rendering: handles are drawn by the renderer from the
         selection, so selecting afterwards left the new table without any. */
      selection.clear();
      selection.add(newT.id);
      refresh();
      toast(T.addedTableToast(num), { type: 'success', desc: T.addedTableDesc(cfg.seats, state.zones.find(z=>z.id===state.activeZone)?.name || '') });
      setTimeout(() => { if (state._openInspector) state._openInspector(newT.id); }, 0);
      break;
    }
    case 'add-el': {
      const type = btn.getAttribute('data-pds-eltype');
      const cfg = PDS_FIX[type];
      if (!cfg) break;
      const plane = pdsPlaneOf(state);
      pdsPush(state);
      /* Drop new fixtures in a free spot rather than always dead-centre, so
         adding three in a row doesn't stack them into one illegible pile. */
      const spot = pdsFreeSpot(state, cfg.w, cfg.h, plane);
      const maxZ = state.elements.reduce((m, e) => Math.max(m, e.z || 0), 0);
      const el = {
        id: newElId(), zone: state.activeZone, type,
        x: spot.x, y: spot.y, w: cfg.w, h: cfg.h, rot: 0,
        color: cfg.color, label: null, z: maxZ + 1, locked: false,
      };
      state.elements.push(el);
      selection.clear(); selection.add(el.id);
      refresh();
      if (state._openInspector) setTimeout(() => state._openInspector(el.id), 0);
      toast(T.addedElementToast, { type: 'success', desc: T.addedElementDesc });
      break;
    }
    case 'clear-assign': {
      const m = modal({
        tag: T.tagPdS,
        title: T.clearAssignTitle,
        desc: T.clearAssignDesc,
        width: 480,
        body: '',
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button class="kb atlas pds-rail-danger" data-dismiss data-pds-clear-confirm>${T.clearAssignOk}</button>
        `,
      });
      wireDismiss(m);
      const confirm = m?.el?.querySelector('[data-pds-clear-confirm]');
      confirm?.addEventListener('click', () => {
        state.tables.forEach(t => { t.server = null; });
        refresh();
        toast(T.clearAssignDone, { type: 'success', desc: T.clearAssignDoneDesc });
      });
      break;
    }
    case 'rotate-configure': {
      const m = modal({
        tag: T.tagPdS,
        title: T.rotateTitle,
        desc: T.rotateDesc,
        width: 580,
        body: `
          <div class="pds-rot-cfg">
            <div class="kf-group">
              <label class="kf-label">${T.rotatePeriod}</label>
              <div class="pds-pillrow" data-pds-period>
                ${[['daily', T.rotateDaily],['shift', T.rotateShift],['weekly', T.rotateWeekly],['custom', T.rotateCustom]].map(([k,l]) => `
                  <button class="pds-cfg-pill ${state.rotation.period===k?'active':''}" data-pds-p="${k}">${l}</button>
                `).join('')}
              </div>
            </div>
            <div class="kf-group">
              <label class="kf-label">${T.rotateStrategy}</label>
              <div class="pds-strat-cards" data-pds-strat>
                ${[['zones',T.rotZones,T.rotZonesDesc],['tables',T.rotTables,T.rotTablesDesc],['pairs',T.rotPairs,T.rotPairsDesc]].map(([k,l,d]) => `
                  <button class="pds-strat-card ${state.rotation.strategy===k?'active':''}" data-pds-s="${k}">
                    <b>${l}</b>
                    <em>${d}</em>
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="kf-help">${T.rotPreview}</div>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button class="kb atlas" data-dismiss data-pds-rot-apply>${T.rotApply}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      let chosenP = state.rotation.period;
      let chosenS = state.rotation.strategy;
      m.el.querySelectorAll('[data-pds-p]').forEach(b => {
        b.addEventListener('click', () => {
          chosenP = b.getAttribute('data-pds-p');
          m.el.querySelectorAll('[data-pds-p]').forEach(o => o.classList.remove('active'));
          b.classList.add('active');
        });
      });
      m.el.querySelectorAll('[data-pds-s]').forEach(b => {
        b.addEventListener('click', () => {
          chosenS = b.getAttribute('data-pds-s');
          m.el.querySelectorAll('[data-pds-s]').forEach(o => o.classList.remove('active'));
          b.classList.add('active');
        });
      });
      m.el.querySelector('[data-pds-rot-apply]')?.addEventListener('click', () => {
        state.rotation = { period: chosenP, strategy: chosenS, enabled: true };
        refresh();
        toast(T.rotApplied, { type: 'success', desc: T.rotAppliedDesc });
      });
      break;
    }
    case 'rotate-now': {
      /* Apply 1 step of the preview, then push to history */
      const preview = pdsRotationPreview(state, 1)[0];
      if (preview) {
        /* In zone mode, reassign every table in zone Z to the server now on Z */
        if (state.rotation.strategy === 'zones') {
          Object.entries(preview).forEach(([sid, zid]) => {
            state.tables.forEach(t => {
              /* Tables in zid get this server */
              if (t.zone === zid) t.server = sid;
            });
          });
        } else {
          /* Tables / pairs — round-robin shuffle of server property across tables */
          const sids = state.staff.map(s => s.id);
          state.tables.forEach((t, i) => { t.server = sids[i % sids.length]; });
        }
        /* Append to history */
        state.history = state.history || [];
        state.history.push({ day: state.history.length, label: T.days[state.history.length % 7], servers: preview });
        if (state.history.length > 7) state.history.shift();
      }
      refresh();
      toast(T.rotNowDone, { type: 'success', desc: T.rotNowDoneDesc });
      break;
    }
    /* ── Inspector actions ─────────────────────────────────────── */
    /* ── Object actions ────────────────────────────────────────────
     * These used to be table-only. They now resolve through pdsFind, so the
     * same buttons rotate, duplicate, lock and delete a comptoir or a kitchen
     * — the operations the merchant could not previously perform on anything
     * that came out of a scene. The action names keep their `table-` prefix
     * because the inspector markup and the keyboard bindings both reference
     * them; renaming would be churn for no behaviour change. */
    case 'table-rotate':
    case 'rot-90': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f || f.o.locked) break;
      pdsPush(state);
      const step = action === 'rot-90' ? 90 : 45;
      f.o.rot = ((f.o.rot || 0) + step) % 360;
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'ambiance': {
      const key = btn.getAttribute('data-pds-amb');
      pdsPush(state);
      if (pdsApplyAmbiance(state, state.activeZone, key)) {
        refresh();
        toast(T.ambianceApplied(T['amb' + key]), { type: 'success', desc: T.ambianceDesc });
      }
      break;
    }
    case 'table-duplicate': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      if (f.table) {
        const newT = { ...f.o, id: newTableId(), x: f.o.x + 24, y: f.o.y + 24, num: f.o.num + '·' };
        delete newT.group;
        state.tables.push(newT);
        selection.clear(); selection.add(newT.id);
        refresh();
        toast(T.addedTableToast(newT.num), { type: 'success', desc: T.addedTableDesc(pdsGeom(newT).seats, state.zones.find(z=>z.id===newT.zone)?.name || '') });
      } else {
        const maxZ = state.elements.reduce((m, e) => Math.max(m, e.z || 0), 0);
        const newE = { ...f.o, id: newElId(), x: f.o.x + 24, y: f.o.y + 24, z: maxZ + 1 };
        state.elements.push(newE);
        selection.clear(); selection.add(newE.id);
        refresh();
        toast(T.addedElementToast, { type: 'success', desc: T.addedElementDesc });
      }
      break;
    }
    case 'table-delete': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      if (f.table) {
        state.tables.splice(state.tables.findIndex(o => o.id === id), 1);
        pdsSweepGroups(state);
        toast(`Table ${f.o.num} · ${T.deletedSuffix}`, { type: 'warn', duration: 1400 });
      } else {
        state.elements.splice(state.elements.findIndex(o => o.id === id), 1);
        toast(`${T['fix'+f.o.type] || f.o.type} · ${T.deletedSuffix}`, { type: 'warn', duration: 1400 });
      }
      selection.delete(id);
      refresh();
      break;
    }
    case 'table-group': {
      /* Arme le mode « choisir la seconde table » — le pointerdown de la
       * table cliquée ensuite fait la liaison (voir pdsAttachDrag). */
      const id = btn.getAttribute('data-pds-id');
      state._groupPickFrom = id;
      toast(T.groupPickHint, { duration: 2600 });
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'table-ungroup': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f || !f.table || !f.o.group) break;
      pdsPush(state);
      const gid = f.o.group;
      state.tables.forEach(tt => { if (tt.group === gid) delete tt.group; });
      refresh();
      toast(T.ungroupOk, { type: 'warn', duration: 1400 });
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'obj-lock': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      f.o.locked = !f.o.locked;
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'seats-up':
    case 'seats-down': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      const cur = pdsGeom(f.o).seats;
      f.o.seats = Math.max(0, Math.min(24, cur + (action === 'seats-up' ? 1 : -1)));
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'layer-back':
    case 'layer-front': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f || f.table) break;
      pdsPush(state);
      const zs = state.elements.map(e => e.z || 0);
      f.o.z = action === 'layer-front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'undo': {
      if (!pdsUndo(state)) { toast(T.undoNothing, { type: 'info', duration: 1200 }); break; }
      selection.clear();
      refresh();
      break;
    }
    case 'redo': {
      if (!pdsRedo(state)) { toast(T.redoNothing, { type: 'info', duration: 1200 }); break; }
      selection.clear();
      refresh();
      break;
    }
    /* ── Bulk actions ──────────────────────────────────────────── */
    case 'bulk-align-h': {
      if (selection.size < 2) break;
      const ids = [...selection];
      const ys = ids.map(id => state.tables.find(t => t.id === id)?.y).filter(v => v != null);
      const avg = Math.round(ys.reduce((a,b) => a+b, 0) / ys.length / PDS_GRID) * PDS_GRID;
      ids.forEach(id => { const t = state.tables.find(tt => tt.id === id); if (t) t.y = avg; });
      refresh();
      toast(T.bulkOkAlign, { type: 'success', duration: 1200 });
      break;
    }
    case 'bulk-align-v': {
      if (selection.size < 2) break;
      const ids = [...selection];
      const xs = ids.map(id => state.tables.find(t => t.id === id)?.x).filter(v => v != null);
      const avg = Math.round(xs.reduce((a,b) => a+b, 0) / xs.length / PDS_GRID) * PDS_GRID;
      ids.forEach(id => { const t = state.tables.find(tt => tt.id === id); if (t) t.x = avg; });
      refresh();
      toast(T.bulkOkAlign, { type: 'success', duration: 1200 });
      break;
    }
    case 'bulk-dist-h': {
      if (selection.size < 3) { toast(T.bulkHintNone, { type: 'info', duration: 1400 }); break; }
      const ids = [...selection];
      const arr = ids.map(id => state.tables.find(t => t.id === id)).filter(Boolean).sort((a,b) => a.x - b.x);
      const span = arr[arr.length-1].x - arr[0].x;
      const step = span / (arr.length - 1);
      arr.forEach((t, i) => { t.x = Math.round((arr[0].x + step * i) / PDS_GRID) * PDS_GRID; });
      refresh();
      toast(T.bulkOkDist, { type: 'success', duration: 1200 });
      break;
    }
    case 'bulk-dist-v': {
      if (selection.size < 3) { toast(T.bulkHintNone, { type: 'info', duration: 1400 }); break; }
      const ids = [...selection];
      const arr = ids.map(id => state.tables.find(t => t.id === id)).filter(Boolean).sort((a,b) => a.y - b.y);
      const span = arr[arr.length-1].y - arr[0].y;
      const step = span / (arr.length - 1);
      arr.forEach((t, i) => { t.y = Math.round((arr[0].y + step * i) / PDS_GRID) * PDS_GRID; });
      refresh();
      toast(T.bulkOkDist, { type: 'success', duration: 1200 });
      break;
    }
    case 'bulk-delete': {
      const n = selection.size;
      state.tables = state.tables.filter(t => !selection.has(t.id));
      pdsSweepGroups(state);
      selection.clear();
      refresh();
      toast(T.bulkOkDelete(n), { type: 'warn', duration: 1400 });
      break;
    }
    case 'bulk-group': {
      const members = state.tables.filter(t => selection.has(t.id));
      if (members.length < 2) break;
      pdsPush(state);
      const gid = 'grp' + Date.now().toString(36);
      members.forEach(t => { t.group = gid; });
      refresh();
      toast(T.bulkOkGroup(members.length), { type: 'success' });
      setTimeout(() => state._openBulkInspector(), 0);
      break;
    }
    case 'bulk-clear': {
      selection.clear();
      root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(el => el.classList.remove('is-selected'));
      state._openBulkInspector();
      break;
    }
    case 'bulk-status': {
      const st = btn.getAttribute('data-pds-status');
      const n = selection.size;
      const gids = new Set();
      selection.forEach(id => {
        const t = state.tables.find(tt => tt.id === id);
        if (!t) return;
        t.status = st;
        if (st === 'occupied') { if (!t.since) t.since = Date.now(); }
        else delete t.since;
        if (t.group) gids.add(t.group);
      });
      /* Le statut déborde sur les partenaires de groupe hors sélection. */
      state.tables.forEach(tt => {
        if (tt.group && gids.has(tt.group) && !selection.has(tt.id)) {
          tt.status = st;
          if (st === 'occupied') { if (!tt.since) tt.since = Date.now(); }
          else delete tt.since;
        }
      });
      refresh();
      toast(T.bulkOkStatus(n, T['status' + st.charAt(0).toUpperCase() + st.slice(1)]), { type: 'success', duration: 1400 });
      break;
    }
    /* 'set-scene' retired with PDS_SCENES — the room is four editable
       properties now, wired through [data-pds-room-field]. */
    case 'deselect': {
      /* Close inspector × button — clears the current selection and returns
       *   to the empty inspector / décor picker pane. */
      selection.clear();
      root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(el => el.classList.remove('is-selected'));
      state._openBulkInspector();
      break;
    }
    default: {
      Kiwi.toast(action, { type: 'info', desc: T.soonAvailable, duration: 1400 });
    }
  }
}

/* ═══ INLINE CSS · scoped to .pds-* ══════════════════════════════════ */
const PDS_INLINE_CSS = `
  .pds-kpis { margin-bottom: 14px; }
  .pds-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
  .pds-modes { display:flex; gap:4px; padding:3px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:11px; }
  .pds-mode { background:transparent; border:none; padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:500; color:var(--n-600); cursor:pointer; transition:.18s letter-spacing:0.01em; }
  .pds-mode:hover { color:var(--ink); }
  .pds-mode.active { background:var(--inverse-surface); color:var(--inverse-ink); font-weight:600; box-shadow:0 1px 2px rgba(10,15,13,0.16); }
  .pds-mode-desc { flex:1; font-size:12px; color:var(--n-600); padding:0 6px; min-width:240px; }
  .pds-zone-tabs { display:flex; gap:4px; padding:3px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:10px; }
  .pds-zone { background:transparent; border:none; padding:7px 12px; border-radius:7px; font-size:12px; font-weight:500; color:var(--n-700); cursor:pointer; display:flex; align-items:center; gap:6px; transition:.16s; }
  .pds-zone em { font-style:normal; font-family:var(--mono); font-size:10px; color:var(--n-500); }
  .pds-zone:hover { color:var(--ink); }
  .pds-zone.active { background:var(--paper); color:var(--ink); box-shadow:0 1px 3px rgba(10,15,13,0.08); font-weight:600; }
  .pds-zone.active em { color:var(--atlas); font-weight:600; }
  .pds-zone-add { padding:7px 10px; color:var(--atlas); font-weight:700; font-size:14px; }
  .pds-zone-add:hover { background:var(--paper); }

  /* align-items:start est la moitié qui compte : une piste de grille s'étire
     par défaut à la hauteur de la plus haute, et la palette fait deux mille
     six cents pixels. Le plan partait donc hors de l'écran dès qu'on
     descendait chercher une plante. Les deux colonnes latérales défilent
     maintenant chez elles, et le plan ne bouge plus. */
  .pds-stage-grid { display:grid; grid-template-columns: 220px 1fr 240px; gap:14px; align-items:start; }
  @media (max-width: 1100px) { .pds-stage-grid { grid-template-columns: 200px 1fr; } .pds-inspector { grid-column: 1 / -1; } }

  /* overscroll-behavior:contain arrête la chaîne : arrivé en bas de la
     palette, la molette ne repart pas dans le tiroir. C'est ce report-là
     qui donnait la sensation de défilement sans fin. */
  .pds-rail, .pds-inspector {
    position:sticky; top:0;
    max-height:calc(100vh - 210px); min-height:320px;
    overflow-y:auto; overscroll-behavior:contain;
    padding-right:4px; scrollbar-width:thin;
  }
  /* Sous 1100px l'inspecteur devient une rangée pleine largeur sous le plan :
     le coller ou le plafonner n'a plus de sens, il suit le flux. La palette,
     elle, garde son propre défilement — c'est elle qui fait deux mille pixels,
     à toutes les largeurs. */
  @media (max-width: 1100px) {
    .pds-rail { position:static; max-height:calc(100vh - 260px); }
    .pds-inspector { position:static; max-height:none; min-height:0; overflow:visible; }
  }

  .pds-rail { display:flex; flex-direction:column; gap:10px; }
  .pds-rail-card { background:var(--paper-soft); border:1px solid var(--n-200); border-radius:12px; padding:14px; }
  html[data-theme="dark"] .pds-rail-card { background:var(--paper-muted); }
  .pds-rail-title { font-size:11px; font-family:var(--mono); letter-spacing:0.1em; color:var(--n-500); text-transform:uppercase; margin-bottom:6px; }
  .pds-rail-hint { font-size:11.5px; color:var(--n-600); line-height:1.45; margin-bottom:10px; }
  .pds-rail-cta { width:100%; margin-bottom:6px; justify-content:center; }
  .pds-rail-cta:last-child { margin-bottom:0; }
  .pds-rail-danger { color:var(--danger); }
  .pds-rail-danger:hover { border-color:var(--danger); }

  .pds-palette { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  .pds-palette-el { grid-template-columns:1fr; }
  .pds-pal-item { background:var(--paper); border:1px solid var(--n-200); border-radius:9px; padding:8px 6px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; cursor:pointer; font-family:inherit; transition:.16s; min-height:62px; }
  .pds-pal-item:hover { border-color:var(--atlas); transform:translateY(-1px); box-shadow:0 4px 12px -8px rgba(11,110,79,0.3); }
  .pds-pal-shape { background:var(--n-200); border:1.5px solid var(--n-400); display:block; }
  .pds-pal-round { border-radius:50%; }
  .pds-pal-square { border-radius:3px; }
  .pds-pal-rect { border-radius:3px; }
  .pds-pal-label { font-size:10.5px; color:var(--n-700); font-weight:500; letter-spacing:0.01em; text-align:center; }
  .pds-pal-icon { width:24px; height:24px; }
  .pds-pal-el-wall { background:#2C2520; height:5px !important; margin-top:9px; width:24px; }
  .pds-pal-el-door { background:var(--atlas); height:5px !important; margin-top:9px; width:18px; border-radius:1px; }
  .pds-pal-el-window { background:#1A8FE3; height:4px !important; margin-top:10px; width:22px; border-radius:1px; }
  .pds-pal-el-column { background:#2C2520; width:14px !important; height:14px !important; margin-top:5px; border-radius:50%; }
  .pds-pal-el-plant { background:radial-gradient(circle, #0B8A7B 0 60%, transparent 65%); width:20px !important; height:20px !important; margin-top:2px; }

  .pds-canvas-wrap { display:flex; flex-direction:column; gap:10px; min-width:0; }
  .pds-canvas-bar { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:10px; flex-wrap:wrap; }
  .pds-legend { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .pds-legend-title { font-size:10.5px; font-family:var(--mono); letter-spacing:0.1em; color:var(--n-500); text-transform:uppercase; margin-right:4px; }
  .pds-legend-item { display:inline-flex; align-items:center; gap:6px; color:rgba(10,15,13,0.55); font:400 11px/1.2 var(--font-ui, 'Inter Tight'), system-ui; letter-spacing:-0.01em; }
  /* Légende jour : les mêmes cases 17 × 13 rx 4 que la nuit, à l'encre sur
     papier — l'atlas ne s'allume que pour l'occupée, comme dans la scène. */
  .pds-legend-swatch { width:17px; height:13px; border-radius:4px; display:inline-block; border:1.25px solid transparent; }
  .pds-sw-free      { background:rgba(10,15,13,0.015); border-color:rgba(10,15,13,0.30); }
  .pds-sw-occupied  { background:rgba(11,110,79,0.10); border-color:#0B6E4F; }
  .pds-sw-reserved  { background:rgba(200,146,53,0.10); border-style:dashed; border-color:#C89235; }
  .pds-sw-cleaning  { background:rgba(10,15,13,0.02); border-style:dotted; border-color:rgba(10,15,13,0.45); }
  .pds-pill { font-size:10px; font-family:var(--mono); letter-spacing:0.06em; padding:3px 8px; border-radius:99px; text-transform:uppercase; font-weight:600; border:1px solid transparent; }
  .pds-pill-free { background:rgba(10,15,13,0.06); color:var(--n-700); }
  .pds-pill-occupied { background:rgba(11,110,79,0.14); color:var(--atlas); }
  /* Les mêmes traits que le plan : tiret riad pour réservée, pointillé encre
     pour à nettoyer — plus d'ambre ni de bleu que le plan ne peint jamais. */
  .pds-pill-reserved { background:rgba(232,200,138,0.18); color:#7D5A1A; border:1px dashed rgba(200,146,53,0.65); }
  .pds-pill-cleaning { background:rgba(10,15,13,0.02); color:var(--n-700); border:1px dotted rgba(10,15,13,0.45); }
  .pds-snap { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--n-700); cursor:pointer; user-select:none; padding:4px 8px; border-radius:7px; }
  .pds-snap input { accent-color:var(--atlas); }

  /* ═════ ARCHITECTURAL ROOM — mirrors kiwi-caisse plan de salle ═════════════
     A cream "paper" floor framed by a 1.5px ink border with an inset highlight
     and a soft warm shadow. SVG backdrop draws the fixtures (comptoir,
     escalier, plantes, fenêtres). The inner .pds-canvas absorbs all the
     pointer events for table dragging — it is positioned over the SVG. */
  .pds-plan-canvas { position:relative; display:flex; flex-direction:column; gap:6px; min-width:0; min-height:0; }
  /* The room is a RESPONSIVE box; the stage inside it is a FIXED logical
     ${PDS_CANVAS_W}×${PDS_CANVAS_H} space scaled to fit (see .pds-plan-scale).
     It used to be a hard ${PDS_CANVAS_W}px wide with max-width:100%, so below
     ~1490px of viewport the room narrowed while the absolutely-positioned
     tables kept their px coordinates — and overflow:hidden silently cropped
     everything past the new edge. Scaling instead of cropping means one
     coordinate space at every width, which is also what lets the backdrop
     and the tables finally agree. 1 logical unit = 1 cm. */
  .pds-plan-room {
    position:relative;
    width: 100%;
    max-width: ${PDS_CANVAS_W}px;
    aspect-ratio: ${PDS_CANVAS_W} / ${PDS_CANVAS_H};
    margin: 0 auto;
    /* Scale reference for .pds-plan-scale. Doing this in CSS rather than from a
       JS-set custom property matters: a JS var is a second source of truth that
       goes stale the moment a resize callback is throttled (a hidden tab runs
       neither rAF nor ResizeObserver), and a stale scale silently crops the
       floor. cqw is always current because the browser resolves it. */
    container-type: inline-size;
    border:1.5px solid #2C2520;
    border-radius:16px;
    overflow:hidden;
    background:#FBF7EE;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.7) inset,
      0 0 0 1px rgba(44,37,32,0.06),
      0 18px 40px -32px rgba(20,15,10,0.15);
  }
  .pds-plan-room.is-terrasse {
    border-style:dashed;
    border-color:#A89770;
    background:#F7F2E8;
  }
  /* Fixed logical stage — the backdrop and the tables live on ONE plane that is
     scaled as a whole, so they can never drift apart. 100cqw is the room's own
     width, so dividing it by the logical width yields the exact fit ratio with
     no JS involved. transform-origin is top-left so logical (0,0) stays pinned
     to the room's corner. */
  .pds-plan-scale {
    position:absolute; top:0; left:0;
    width:${PDS_CANVAS_W}px;
    height:${PDS_CANVAS_H}px;
    transform-origin: 0 0;
    transform: scale(calc(100cqw / ${PDS_CANVAS_W}px));
  }
  .pds-plan-room .plan-bg {
    position:absolute; inset:0;
    width:100%; height:100%;
    pointer-events:none; display:block;
  }
  .pds-plan-room .plan-bg * { vector-effect: non-scaling-stroke; }
  .pds-plan-label {
    position:absolute; top:10px; left:16px;
    font-family:var(--sans, "Inter Tight", system-ui, sans-serif);
    font-size:11px; font-weight:600;
    color:#1A1F1C;
    letter-spacing:0.16em;
    text-transform:uppercase;
    z-index:4;
    pointer-events:none;
  }
  .pds-plan-label em {
    font-family:var(--serif, "Instrument Serif", serif);
     font-weight:400;
    text-transform:none;
    color:#5C5447;
    letter-spacing:0;
    margin-left:6px;
    font-size:13px;
  }
  .pds-plan-room.is-terrasse .pds-plan-label { color:#1F4A38; }
  .pds-plan-footer {
    display:flex; justify-content:flex-end; align-items:center;
    padding:2px 6px;
    font-size:11px; color:#5C5447;
    letter-spacing:0.04em;
    font-feature-settings:"tnum" 1;
    flex:0 0 auto;
  }
  .pds-plan-floor-count { font-family:var(--mono); }

  /* The canvas sits ON TOP of the SVG backdrop, transparent, capturing
     pointer events for table dragging. Same dimensions as plan-room. */
  .pds-canvas {
    position:absolute;
    inset:0;
    margin:0;
    border:none; border-radius:14px;
    overflow:visible;
    touch-action:none; user-select:none;
    background:transparent;
    z-index:2;
  }

  .pds-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center; padding:20px; background:rgba(255,255,255,0.7); border-radius:14px; z-index:3; backdrop-filter: blur(2px); }
  .pds-empty h4 { margin:0; font-size:18px; letter-spacing:-0.02em; color:var(--ink); }
  .pds-empty p { font-size:13px; color:var(--n-600); max-width:340px; margin:0; line-height:1.5; }

  /* ═════ TABLES — architectural language mirrored from kiwi-caisse ═══════
     Tables are absolute on the canvas. Each .pds-tbl-cell contains:
       • .pds-tbl       — the tabletop (wood/marble vibe via shadows)
       • .pds-tbl-num   — large bold number
       • .pds-tbl-covers— seat count (instrument serif, roman)
       • .pds-tbl-chairs / .pds-chair  — chair pills around the table
       • .pds-tbl-server — corner badge with server initials + color        */
  .pds-tbl-cell {
    position:absolute;
    cursor:pointer; user-select:none;
    transition: transform 150ms ease, filter 150ms ease;
    z-index:2;
  }
  .pds-tbl-cell:hover { transform: translateY(-1px); filter: brightness(1.02); }
  .pds-tbl-cell:active { transform: translateY(0); }
  .pds-tbl-cell:focus-visible { outline: 2px solid #1F5D3C; outline-offset: 3px; border-radius: 8px; }

  .pds-tbl-chairs {
    position:absolute;
    display:flex; justify-content:center; gap:5px;
    pointer-events:none;
  }
  .pds-tbl-chairs-top    { left:6px; right:6px; top:-9px;   height:7px; }
  .pds-tbl-chairs-bottom { left:6px; right:6px; bottom:-9px; height:7px; }
  .pds-chair {
    flex:0 1 16px; min-width:8px; max-width:22px;
    height:100%;
    background:linear-gradient(180deg, #8C8377 0%, #5F574C 100%);
    border-radius:3px;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.25) inset,
      0 1px 1.5px rgba(20,15,10,0.18);
  }
  .pds-tbl-chairs-ring { position:absolute; inset:-8px; pointer-events:none; }
  .pds-chair-radial {
    position:absolute; top:50%; left:50%;
    width:16px; height:7px;
    margin:-3.5px 0 0 -8px;
    background:linear-gradient(180deg, #8C8377 0%, #5F574C 100%);
    border-radius:3px;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.25) inset,
      0 1px 1.5px rgba(20,15,10,0.18);
    transform-origin:center;
  }

  /* Tabletop */
  .pds-tbl {
    position:relative;
    width:100%; height:100%;
    border-radius:7px;
    padding:4px 6px;
    display:flex; flex-direction:column; justify-content:space-between;
    transition: background-color 200ms ease, border-color 200ms ease, color 200ms ease;
    overflow:hidden;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.6) inset,
      0 2px 4px -1px rgba(20,15,10,0.14),
      0 1px 2px rgba(20,15,10,0.06);
  }
  .pds-tbl-cell.pds-is-round .pds-tbl {
    border-radius:50%;
    padding:12% 14%;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    text-align:center; gap:1px;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.7) inset,
      0 0 0 1px rgba(44,37,32,0.04) inset,
      0 3px 6px -1px rgba(20,15,10,0.18),
      0 1px 2px rgba(20,15,10,0.06);
  }
  .pds-tbl-cell.pds-is-round .pds-tbl-head {
    text-align:center;
    flex-direction:column;
    align-items:center; justify-content:center;
    gap:2px;
  }
  .pds-tbl-cell.pds-is-round .pds-tbl-server {
    top:-8px; right:auto;
    left:50%; transform:translateX(-50%);
  }
  .pds-tbl-cell.pds-is-square .pds-tbl { border-radius:4px; }
  .pds-tbl-cell.pds-is-bar    .pds-tbl { border-radius:4px; }

  .pds-tbl-head {
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    gap:1px; flex:1;
    font-feature-settings:"tnum" 1;
  }
  .pds-tbl-num    { font-weight:700; letter-spacing:0.01em; font-size:17px; line-height:1; color:inherit; }
  .pds-tbl-covers { font-family:var(--serif, "Instrument Serif", serif); font-weight:400; font-size:12px; line-height:1; opacity:0.7; }

  /* Status color encodings — mirrors caisse khawya / ka-yaklo etc. */
  .pds-tbl[data-status="free"] {
    background:var(--surface);
    border:1.5px solid #C8C5BD;
    color:#1A1F1C;
  }
  .pds-tbl[data-status="free"] .pds-tbl-num    { color:#4A453E; }
  .pds-tbl[data-status="free"] .pds-tbl-covers { color:#968D7F; }

  .pds-tbl[data-status="occupied"] {
    background:#EBF5F0;
    border:1.5px solid #C5E0D3;
    color:#1F5D3C;
  }
  .pds-tbl[data-status="occupied"] .pds-tbl-num    { color:#1F5D3C; }
  .pds-tbl[data-status="occupied"] .pds-tbl-covers { color:#437B5C; }

  .pds-tbl[data-status="reserved"] {
    background:#FFF1D6;
    border:1.5px solid #E8C88A;
    color:#7D5A1A;
  }
  .pds-tbl[data-status="reserved"] .pds-tbl-num    { color:#7D5A1A; }
  .pds-tbl[data-status="reserved"] .pds-tbl-covers { color:#A88A4C; }

  .pds-tbl[data-status="cleaning"] {
    background:#1F5D3C;
    border:1.5px solid transparent;
    color:#fff;
  }
  .pds-tbl[data-status="cleaning"] .pds-tbl-num    { color:#fff; }
  .pds-tbl[data-status="cleaning"] .pds-tbl-covers { color:rgba(255,255,255,0.78); }

  /* Selection — green outline ring (does not touch the table shape) */
  .pds-tbl-cell.is-selected .pds-tbl {
    box-shadow:
      0 0 0 3px rgba(11,110,79,0.28),
      0 1px 0 rgba(255,255,255,0.6) inset,
      0 2px 4px -1px rgba(20,15,10,0.14);
  }
  .pds-tbl-cell.is-dragging { z-index:5; cursor:grabbing; }
  .pds-tbl-cell.is-dragging .pds-tbl { box-shadow: 0 14px 30px -10px rgba(10,15,13,0.32); }

  /* Server color overlay (assign mode) — picks server color for tabletop border */
  .pds-tbl-cell.pds-has-server .pds-tbl { border-color: var(--pds-server, currentColor); border-width:2px; }

  /* Server badge — caisse style: circle pinned to corner, white ring */
  .pds-tbl-server {
    position:absolute;
    top:-10px; right:-10px;
    width:26px; height:26px; border-radius:50%;
    font-size:11px; font-weight:700; color:#fff;
    display:inline-flex; align-items:center; justify-content:center;
    border:2.5px solid #fff;
    box-shadow:
      0 2px 5px rgba(20,15,10,0.22),
      0 0 0 1px rgba(20,15,10,0.06);
    letter-spacing:0.02em;
    z-index:3;
    pointer-events:none;
    font-family:var(--sans, "Inter Tight", system-ui, sans-serif);
  }

  .pds-el { position:absolute; background: var(--n-700); border-radius:2px; cursor:grab; will-change: transform; }
  .pds-el.pds-el-wall { background:#2C2520; height:8px; box-shadow:inset 0 0 0 1px rgba(0,0,0,0.2); }
  .pds-el.pds-el-door { background:var(--atlas); border-radius:2px; height:8px; }
  .pds-el.pds-el-window { background:linear-gradient(180deg,#1A8FE3,#0F6FBF); height:6px; border-radius:2px; }
  .pds-el.pds-el-column { background:#2C2520; border-radius:50%; box-shadow:0 0 0 2px rgba(255,255,255,0.5) inset; }
  .pds-el.pds-el-plant { background:radial-gradient(circle, #0B8A7B 0 60%, transparent 65%); border-radius:50%; }
  .pds-el.is-dragging { cursor:grabbing; z-index:4; }

  .pds-inspector { display:flex; flex-direction:column; gap:10px; }
  .pds-inspect { padding:14px; }
  .pds-inspect-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; }
  .pds-inspect-head .pds-rail-title { margin-bottom:0; }
  .pds-inspect-close {
    background:transparent; border:1px solid var(--n-200); border-radius:7px;
    width:24px; height:24px; padding:0;
    display:inline-flex; align-items:center; justify-content:center;
    cursor:pointer; color:var(--n-600); transition:.16s;
    flex-shrink:0;
  }
  .pds-inspect-close:hover { background:var(--paper); color:var(--ink); border-color:var(--n-400); }
  .pds-inspect-close:active { transform:translateY(1px); }
  .pds-inspect-close svg { display:block; }
  .pds-form-row { margin-bottom:10px; }
  .pds-form-row > label { display:block; font-size:10.5px; font-family:var(--mono); letter-spacing:0.1em; color:var(--n-500); text-transform:uppercase; margin-bottom:5px; font-weight:600; }
  .pds-input { width:100%; padding:7px 9px; font-size:12.5px; }
  .pds-status-pills { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
  .pds-status-pill { padding:6px 8px; border:1.5px solid transparent; background:transparent; border-radius:7px; font-size:10.5px; font-weight:600; cursor:pointer; font-family:var(--mono); letter-spacing:0.04em; text-transform:uppercase; transition:.16s; }
  .pds-status-pill.pds-pill-free { background:rgba(10,15,13,0.06); color:var(--n-700); border-color:transparent; }
  .pds-status-pill.pds-pill-occupied { background:rgba(11,110,79,0.10); color:var(--atlas); }
  .pds-status-pill.pds-pill-reserved { background:rgba(232,200,138,0.14); color:#7D5A1A; border-style:dashed; border-color:rgba(200,146,53,0.55); }
  .pds-status-pill.pds-pill-cleaning { background:rgba(10,15,13,0.02); color:var(--n-700); border-style:dotted; border-color:rgba(10,15,13,0.40); }
  .pds-status-pill:hover { transform:translateY(-1px); }
  .pds-status-pill.active { border-color: currentColor; box-shadow:0 0 0 1px currentColor inset; }
  .pds-inspect-actions { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; }
  .pds-inspect-actions .kb { padding:7px 8px; font-size:11.5px; justify-content:center; }
  /* Bouton « Grouper » armé : il pulse doucement le temps du choix. */
  .pds-inspect-actions .kb.pds-group-arming { border-color:var(--atlas); color:var(--atlas); animation:pdsGroupArm 1.2s ease-in-out infinite; }
  @keyframes pdsGroupArm { 0%,100% { box-shadow:0 0 0 0 rgba(11,110,79,0); } 50% { box-shadow:0 0 0 3px rgba(11,110,79,0.18); } }

  /* ═════ TABLES GROUPÉES · l'enveloppe « 06 + 07 » du mockup d'accueil ═════
     Un cadre rx 20 qui embrasse les tables liées, une lueur radiale douce,
     et le cachet des numéros combinés au-dessus. Sous les tables, jamais
     cliquable — le groupe est un fait, pas une cible. */
  .pds-group-env { position:absolute; border-radius:20px; border:1.25px solid rgba(11,110,79,0.45); background:rgba(11,110,79,0.05); pointer-events:none; z-index:0; }
  .pds-group-env::before { content:''; position:absolute; inset:-30%; border-radius:50%; background:radial-gradient(closest-side, rgba(11,110,79,0.10), rgba(11,110,79,0)); z-index:-1; }
  .pds-group-chip { position:absolute; top:-26px; left:50%; transform:translateX(-50%); height:19px; padding:0 10px; border-radius:9.5px; background:var(--paper, #F7F5F0); border:1px solid rgba(11,110,79,0.45); color:#0B6E4F; font:500 10px/19px var(--mono, 'JetBrains Mono'); letter-spacing:0.02em; white-space:nowrap; }
  .pds-group-covers { opacity:0.72; }
  /* Ligne d'info du groupe dans l'inspecteur : un fait, pas un bouton. */
  .pds-group-info { margin-top:8px; padding:7px 10px; border-radius:9px; border:1px dashed rgba(11,110,79,0.35); background:rgba(11,110,79,0.05); color:#0B6E4F; font:500 11px/1.4 var(--mono, 'JetBrains Mono'); letter-spacing:0.01em; }

  .pds-inspect-empty .pds-rail-hint { line-height:1.55; }

  .pds-roster { display:flex; flex-direction:column; gap:5px; }
  .pds-chip { display:flex; align-items:center; gap:9px; padding:8px 10px; background:var(--paper); border:1px solid var(--n-200); border-radius:10px; cursor:grab; transition:.16s; }
  .pds-chip:hover { transform:translateY(-1px); border-color:var(--chip); box-shadow:0 4px 12px -8px var(--chip); }
  .pds-chip.is-dragging { cursor:grabbing; opacity:0.5; }
  .pds-chip-ghost { padding:8px 10px; background:var(--paper); border:1px solid var(--chip); border-radius:10px; transform:translate(-50%, -50%) rotate(-2deg); box-shadow:0 14px 30px -10px rgba(10,15,13,0.45); }
  .pds-chip-dot { width:14px; height:14px; border-radius:50%; background:var(--chip); flex-shrink:0; box-shadow:inset 0 0 0 1.5px rgba(255,255,255,0.4); }
  .pds-chip-body { display:flex; flex-direction:column; line-height:1.25; min-width:0; flex:1; }
  .pds-chip-body b { font-size:12.5px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pds-chip-body em { font-style:normal; font-size:10.5px; color:var(--n-500); font-family:var(--mono); letter-spacing:0.02em; margin-top:1px; }

  .pds-assign-sum { display:flex; flex-direction:column; gap:4px; margin-top:6px; }
  .pds-asum-row { display:flex; align-items:center; gap:8px; padding:6px 4px; font-size:12px; }
  .pds-asum-dot { width:9px; height:9px; border-radius:50%; background:var(--chip); flex-shrink:0; }
  .pds-asum-name { flex:1; color:var(--ink); }
  .pds-asum-n { font-family:var(--mono); font-size:11.5px; color:var(--n-600); font-weight:600; }
  .pds-asum-unassigned .pds-asum-name { color:var(--n-500); }

  .pds-tpls { display:flex; flex-direction:column; gap:10px; }
  .pds-tpl { background:var(--paper-soft); border:1px solid var(--n-200); border-radius:12px; padding:14px; }
  .pds-tpl-h { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
  .pds-tpl-h h4 { margin:0 0 4px; font-size:14.5px; font-weight:600; letter-spacing:-0.015em; }
  .pds-tpl-h p { margin:0; font-size:12px; color:var(--n-600); line-height:1.5; }

  .pds-rotate { display:flex; flex-direction:column; gap:14px; }
  .pds-rotate-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
  @media (max-width: 1100px) { .pds-rotate-grid { grid-template-columns:1fr; } }
  .pds-rot-meta { display:flex; flex-direction:column; gap:6px; margin:6px 0 10px; }
  .pds-rot-meta > div { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--paper); border:1px solid var(--n-200); border-radius:9px; font-size:12.5px; }
  .pds-rot-lbl { font-size:10.5px; font-family:var(--mono); letter-spacing:0.08em; color:var(--n-500); text-transform:uppercase; }
  .pds-rot-val { font-weight:600; color:var(--ink); }
  .pds-rot-actions { display:flex; gap:6px; }
  .pds-rot-actions .kb { flex:1; justify-content:center; }
  .pds-rot-preview { display:flex; flex-direction:column; gap:8px; }
  .pds-rot-step { background:var(--paper); border:1px solid var(--n-200); border-radius:10px; padding:10px; }
  .pds-rot-step-h { font-size:10.5px; font-family:var(--mono); letter-spacing:0.1em; color:var(--atlas); text-transform:uppercase; font-weight:700; margin-bottom:6px; }
  .pds-rot-line { display:grid; grid-template-columns:14px 1fr auto; gap:6px; align-items:center; font-size:11.5px; padding:2px 0; }
  .pds-rot-line .pds-asum-dot { width:9px; height:9px; }
  .pds-rot-line b { font-weight:600; }
  .pds-rot-line em { font-style:normal; font-size:11px; color:var(--n-500); font-family:var(--mono); }

  .pds-fair { display:flex; flex-direction:column; gap:4px; }
  .pds-fair-row { display:grid; grid-template-columns:14px 1fr 70px 36px; gap:6px; align-items:center; font-size:11.5px; }
  .pds-fair-name { font-weight:600; color:var(--ink); }
  .pds-fair-bar { height:5px; background:var(--n-200); border-radius:3px; overflow:hidden; }
  .pds-fair-bar > i { display:block; height:100%; border-radius:3px; }
  .pds-fair-bar .pds-fair-high { background:linear-gradient(90deg, var(--atlas), var(--mint)); }
  .pds-fair-bar .pds-fair-mid { background:linear-gradient(90deg, #D99A2B, #F2C24B); }
  .pds-fair-bar .pds-fair-low { background:linear-gradient(90deg, #C0306E, #E45990); }
  .pds-fair-pct { font-family:var(--mono); font-size:10.5px; color:var(--n-600); text-align:right; font-weight:600; }
  .pds-fair-note { font-size:10.5px; color:var(--n-500); padding:0 0 4px 20px; line-height:1.4; }
  .pds-fair-note b { color:var(--ink); }

  .pds-rot-history { padding:14px; }
  .pds-history-grid { display:flex; flex-direction:column; gap:4px; }
  .pds-hist-h, .pds-hist-row { display:grid; grid-template-columns: 100px repeat(7, 1fr); gap:4px; align-items:center; }
  .pds-hist-h > span { font-size:10.5px; font-family:var(--mono); letter-spacing:0.08em; color:var(--n-500); text-transform:uppercase; text-align:center; }
  .pds-hist-h > span:first-child { text-align:left; }
  .pds-hist-name { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:var(--ink); }
  .pds-hist-cell { height:24px; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:700; color:var(--paper); font-family:var(--mono); }
  .pds-hist-a { background:var(--atlas); }
  .pds-hist-b { background:#D99A2B; color:var(--paper); }
  .pds-hist-c { background:#1A8FE3; }
  .pds-hist-d { background:var(--n-400); color:var(--ink); }

  .pds-rot-cfg { display:flex; flex-direction:column; gap:14px; }
  .pds-pillrow { display:flex; gap:6px; flex-wrap:wrap; }
  .pds-cfg-pill { padding:7px 12px; border:1px solid var(--n-200); background:var(--paper); border-radius:8px; font-size:12px; cursor:pointer; color:var(--n-700); transition:.18s; font-family:inherit; }
  .pds-cfg-pill:hover { border-color:var(--atlas); }
  .pds-cfg-pill.active { background:var(--inverse-surface); color:var(--inverse-ink); border-color:var(--inverse-surface); font-weight:600; }
  .pds-strat-cards { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
  @media (max-width: 720px) { .pds-strat-cards { grid-template-columns:1fr; } }
  .pds-strat-card { background:var(--paper); border:1.5px solid var(--n-200); border-radius:10px; padding:12px; text-align:left; cursor:pointer; transition:.16s; font-family:inherit; }
  .pds-strat-card:hover { border-color:var(--atlas); }
  .pds-strat-card.active { border-color:var(--atlas); background:rgba(11,110,79,0.06); box-shadow:0 0 0 1.5px var(--atlas); }
  .pds-strat-card b { display:block; font-size:13px; font-weight:600; color:var(--ink); margin-bottom:3px; }
  .pds-strat-card em { display:block; font-style:normal; font-size:11.5px; color:var(--n-600); line-height:1.4; }

  .pds-scene-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
  .pds-scene-pill {
    padding:8px 8px;
    background:var(--paper); border:1px solid var(--n-200); border-radius:8px;
    font-size:11.5px; font-weight:500; color:var(--n-700);
    cursor:pointer; transition:.16s; font-family:inherit;
    letter-spacing:-0.005em; text-align:left;
  }
  .pds-scene-pill:hover { border-color:var(--atlas); color:var(--ink); transform: translateY(-1px); }
  .pds-scene-pill.active {
    background:var(--inverse-surface); color:var(--inverse-ink); border-color:var(--inverse-surface);
    font-weight:600; box-shadow:0 1px 2px rgba(10,15,13,0.16);
  }

  .pds-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; }
  .pds-foot-meta { font-size:11px; color:var(--n-500); letter-spacing:0.06em; }
  .pds-foot-meta .mono { font-family:var(--mono); }
  .pds-foot-actions { display:flex; gap:8px; }

  html[dir="rtl"] .pds-zone-tabs, html[dir="rtl"] .pds-modes { flex-direction:row-reverse; }

  /* ═══ v2 · object-model floor plan ═══════════════════════════════════════
     Everything below supersedes the v1 table/element rules above. The v1
     rules are left in place because a few of them (cell positioning, rail
     chrome, status pills) are still correct; the ones that are not are
     overridden here by source order. Anything keyed to a v1 fixture type
     (.pds-el-wall, .pds-el-door, …) is inert — those kinds were renamed. */

  /* Floor + walls, driven by zone.room rather than a baked scene. */
  /* Le creux de la pièce est posé en ligne par pdsRoomShell(), avec le mur :
     un box-shadow ici ne pourrait jamais l'emporter sur un style en ligne. */
  .pds-floor {
    position:absolute; inset:0;
    border-radius:14px;
    background-repeat:repeat;
    pointer-events:none;
  }
  .pds-plan-room { border-color:rgba(44,37,32,0.22); background:transparent; }

  /* ── Tables ────────────────────────────────────────────────────────────
     The cell is inflated by --pad on every side to hold the chair band, so
     .pds-tbl-face insets by --pad to sit on the tabletop itself. */
  .pds-tbl-cell {
    transform-origin:50% 50%;
    transition: filter 150ms ease;
  }
  /* Le survol soulève la table. La propriété transform est réservée à la
     rotation et au glisser — la toucher ici décalerait la géométrie —, donc
     l'élévation passe par une ombre portée, qui suit la silhouette SVG et
     non la boîte. */
  .pds-tbl-cell:hover { filter:brightness(1.035) drop-shadow(0 5px 10px rgba(20,15,10,0.20)); }
  .pds-tbl-cell.is-selected  { z-index:6; }
  .pds-tbl-cell.is-resizing  { z-index:7; }
  .pds-tbl-cell.is-locked    { cursor:default; }
  .pds-tbl-svg {
    position:absolute; inset:0; width:100%; height:100%;
    display:block; overflow:visible; pointer-events:none;
  }
  .pds-tbl-face {
    position:absolute; inset:var(--pad, 0px);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    pointer-events:none; text-align:center;
  }
  .pds-tbl-num    { font:600 15px/1 var(--font-ui, 'Inter Tight'), system-ui; letter-spacing:-0.01em; }
  /* Comme la nuit : seul le numéro habite la table, les couverts ne se
     montrent qu'à l'approche. */
  .pds-tbl-covers { font:400 10px/1 var(--mono, monospace); opacity:0; transition:opacity 180ms ease; margin-top:3px; }
  .pds-tbl-cell:hover .pds-tbl-covers,
  .pds-tbl-cell.is-selected .pds-tbl-covers { opacity:.5; }
  /* L'anneau d'appel pulse dans les deux vues — même géométrie, seule
     l'encre change (menthe la nuit, atlas le jour). Les @keyframes vivent
     dans la couche nuit ; ils sont globaux au document. */
  .pds-noir-call {
    transform-box:fill-box; transform-origin:center;
    animation:pdsNoirCall 2.6s cubic-bezier(.22,.7,.3,1) infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .pds-noir-call { animation:none; opacity:0; }
  }
  /* La pastille « N min » en jour : la même géométrie que la nuit, sur
     papier — jamais de blanc pur. */
  .pds-tbl-since {
    position:absolute; top:calc(var(--pad, 0px) - 24px); left:calc(var(--pad, 0px) - 6px);
    height:19px; padding:0 9px; border-radius:9.5px;
    display:inline-flex; align-items:center;
    background:rgba(247,245,240,0.92); border:1px solid rgba(10,15,13,0.16);
    font:500 10px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.02em; color:rgba(10,15,13,0.66);
    white-space:nowrap; pointer-events:none; z-index:4;
  }

  /* ── Fixtures ──────────────────────────────────────────────────────────
     The v1 rule painted .pds-el itself dark; v2 paints the .pds-el-fill
     child from the instance's own material, so the host must be cleared. */
  .pds-el { background:transparent; border-radius:0; transform-origin:50% 50%; }
  /* overflow:visible, pas hidden : le clip du bâti avalait les tabourets
     du comptoir (cy negatif) dans les deux vues — le trait ne déborde
     nulle part ailleurs, il n'y a plus de texture à contenir. */
  .pds-el-fill { position:absolute; inset:0; background-repeat:repeat; overflow:visible; }
  /* Les tabourets du comptoir se dessinent hors de la boîte du bâti,
     dans les deux vues. */
  .pds-el-svg  { position:absolute; inset:0; width:100%; height:100%; display:block; overflow:visible; }
  .pds-el-label {
    position:absolute; inset:0; padding:2px;
    display:flex; align-items:center; justify-content:center;
    font:500 9px/1.2 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.14em; text-transform:uppercase;
    pointer-events:none; text-align:center; overflow:hidden;
  }
  /* Les pilules BAR / CAISSE portent leur nom à gauche, comme la nuit. */
  .pds-el-comptoir .pds-el-label,
  .pds-el-caisse .pds-el-label { justify-content:flex-start; padding-left:16px; text-align:left; }
  /* Le curseur « grab » annonce le glisser, pas l'édition : rien ne disait
     qu'un comptoir s'ouvre, se redimensionne et se supprime comme une table.
     Le survol le dit maintenant, avec la même élévation que les tables. */
  .pds-el:not(.is-locked):not(.is-dragging):hover {
    filter: drop-shadow(0 4px 9px rgba(20,15,10,0.20));
    outline: 1.5px solid rgba(11,110,79,0.55); outline-offset: 2px;
  }
  .pds-el.is-selected { z-index:60; }
  .pds-el.is-locked   { cursor:default; }

  /* ── Selection · resize + rotate handles ───────────────────────────────
     Inset by --pad so they hug the tabletop, not the chair band. */
  .pds-hdl-layer { position:absolute; inset:var(--pad, 0px); pointer-events:none; }
  .pds-hdl-layer::before {
    content:''; position:absolute; inset:-2px;
    border:1.5px solid var(--atlas); border-radius:4px;
    box-shadow:0 0 0 3px rgba(11,110,79,0.14);
  }
  .pds-hdl {
    position:absolute; width:11px; height:11px; margin:-5.5px 0 0 -5.5px;
    background:var(--paper, #F7F5F0); border:1.5px solid var(--atlas);
    border-radius:2px; pointer-events:auto;
    box-shadow:0 1px 2px rgba(10,15,13,0.28);
  }
  .pds-hdl:hover { background:var(--mint, #7DF2B0); }
  .pds-hdl-nw { top:0;    left:0;    cursor:nwse-resize; }
  .pds-hdl-n  { top:0;    left:50%;  cursor:ns-resize; }
  .pds-hdl-ne { top:0;    left:100%; cursor:nesw-resize; }
  .pds-hdl-e  { top:50%;  left:100%; cursor:ew-resize; }
  .pds-hdl-se { top:100%; left:100%; cursor:nwse-resize; }
  .pds-hdl-s  { top:100%; left:50%;  cursor:ns-resize; }
  .pds-hdl-sw { top:100%; left:0;    cursor:nesw-resize; }
  .pds-hdl-w  { top:50%;  left:0;    cursor:ew-resize; }
  .pds-hdl-rot {
    top:-24px; left:50%; border-radius:50%;
    background:var(--atlas); border-color:var(--paper, #F7F5F0); cursor:grab;
  }
  .pds-hdl-rot::before {
    content:''; position:absolute; left:50%; top:100%;
    width:1.5px; height:14px; margin-left:-0.75px;
    background:var(--atlas); opacity:.55;
  }
  .pds-dim {
    position:absolute; bottom:-21px; left:50%; transform:translateX(-50%);
    font:600 9px/1.7 var(--mono, monospace);
    background:var(--ink, #0A0F0D); color:var(--paper, #F7F5F0);
    padding:1px 6px; border-radius:3px; white-space:nowrap;
  }
  .pds-locked {
    position:absolute; top:2px; right:2px;
    display:grid; place-items:center;
    width:16px; height:16px; border-radius:4px;
    background:rgba(10,15,13,0.72); color:var(--paper, #F7F5F0);
  }

  /* ── Inspector + room controls ─────────────────────────────────────────*/
  .pds-sw-row { display:flex; flex-wrap:wrap; gap:4px; }
  .pds-sw {
    width:20px; height:20px; border-radius:5px; cursor:pointer;
    border:1.5px solid rgba(44,37,32,0.20); padding:0;
    transition: transform 150ms cubic-bezier(0.34, 1.45, 0.5, 1), box-shadow 150ms ease;
  }
  .pds-sw:hover  { transform:scale(1.12); }
  .pds-sw.active { box-shadow:0 0 0 2px var(--paper, #F7F5F0), 0 0 0 3.5px var(--atlas); }
  .pds-mini-label {
    display:block; margin:9px 0 4px;
    font:600 10px/1 var(--mono, monospace);
    letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500);
  }
  .pds-num-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:8px; }
  .pds-num-grid.pds-num-4 { grid-template-columns:repeat(4, 1fr); margin-top:0; }
  .pds-num-grid > label {
    display:flex; flex-direction:column; gap:3px;
    font:600 9.5px/1 var(--mono, monospace);
    letter-spacing:0.08em; text-transform:uppercase; color:var(--n-500);
  }
  .pds-num-grid input { width:100%; padding:5px 6px; font-size:12px; text-align:center; }
  .pds-unit { font:400 9.5px/1 var(--mono, monospace); color:var(--n-400); letter-spacing:0.06em; text-transform:none; }
  .pds-step { display:flex; align-items:center; gap:5px; }
  .pds-step-val { flex:1; text-align:center; padding:5px 4px; }
  .pds-step-btn {
    width:26px; height:26px; flex:none;
    display:grid; place-items:center;
    border:1px solid var(--n-200); border-radius:7px;
    background:var(--surface); cursor:pointer;
    font:600 12px/1 var(--font-ui, system-ui); color:var(--ink);
  }
  .pds-step-btn:hover { background:var(--paper-muted); border-color:var(--atlas); }
  .pds-rot-row { display:flex; align-items:center; gap:8px; }
  .pds-range { flex:1; accent-color:var(--atlas); }
  .pds-actions-tight { margin-top:0; }

  /* ── Canvas toolbar ────────────────────────────────────────────────────*/
  .pds-bar-tools { display:flex; align-items:center; gap:6px; }
  .pds-tool {
    width:26px; height:26px; flex:none;
    display:grid; place-items:center;
    border:1px solid var(--n-200); border-radius:7px;
    background:var(--surface); color:var(--n-600); cursor:pointer;
  }
  .pds-tool:hover { background:var(--paper-muted); color:var(--atlas); border-color:var(--atlas); }
  .pds-plan-dims { font:400 10px/1 var(--mono, monospace); color:var(--n-400); letter-spacing:0.06em; }
  .pds-plan-footer { display:flex; align-items:center; justify-content:space-between; gap:10px; }

  /* Palette thumbnails are the fixture's own drawing, so the button always
     previews what will actually be placed. */
  .pds-pal-mini {
    display:grid; place-items:center;
    width:28px; height:28px; overflow:hidden;
  }
  .pds-pal-mini svg { display:block; max-width:100%; max-height:100%; }

  /* ═══ v3 · collision, fluid resize, free rotation ════════════════════════ */

  /* Illegal placement is SHOWN, never enforced mid-drag — the object keeps
     following the cursor and settles legally on release. Red is the one
     non-brand hue in the editor, and it only ever appears mid-gesture. */
  .pds-tbl-cell.is-blocked,
  .pds-el.is-blocked { filter:none; }
  .pds-tbl-cell.is-blocked::after,
  .pds-el.is-blocked::after {
    content:''; position:absolute; inset:var(--pad, 0px);
    border:1.5px solid #C0392B; border-radius:5px;
    background:rgba(192,57,43,0.13);
    pointer-events:none; z-index:3;
  }
  .pds-blocker::before {
    content:''; position:absolute; inset:var(--pad, 0px);
    border:1.5px dashed #C0392B; border-radius:5px;
    pointer-events:none; z-index:2;
  }

  /* Handles keep their 11px look but carry a 24px hit pad, so the same
     control works under a fingertip on a tablet. */
  .pds-hdl::after {
    content:''; position:absolute; left:50%; top:50%;
    width:24px; height:24px; transform:translate(-50%, -50%);
  }
  .pds-hdl-rot::after { width:30px; height:30px; }

  /* The dimension badge doubles as the angle readout during a rotate. */
  .pds-tbl-cell.is-resizing .pds-dim,
  .pds-el.is-resizing .pds-dim { background:var(--atlas); }

  .pds-rot-num { width:56px; flex:none; text-align:center; padding:5px 4px; }

  /* ── Ambiances ─────────────────────────────────────────────────────────
     Four curated whole-room palettes. Each button previews its own four
     surfaces, so the merchant picks from what they will get. */
  .pds-amb-row { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:4px; }
  .pds-amb {
    display:flex; flex-direction:column; gap:5px; align-items:flex-start;
    padding:7px 8px; cursor:pointer;
    border:1px solid var(--n-200); border-radius:9px; background:var(--surface);
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  .pds-amb:hover  { border-color:var(--atlas); }
  .pds-amb.active { border-color:var(--atlas); box-shadow:0 0 0 2px rgba(11,110,79,0.16); }
  .pds-amb-chips { display:flex; gap:0; border-radius:4px; overflow:hidden; width:100%; height:16px; }
  .pds-amb-chips i { flex:1; display:block; }
  .pds-amb-name {
    font:600 9.5px/1 var(--mono, monospace);
    letter-spacing:0.08em; text-transform:uppercase; color:var(--n-600);
  }

  /* Free picker sits in the swatch row and reads as one more swatch. The
     native colour input is stretched under a conic rainbow so it keeps the
     20px square the row is built on. */
  .pds-sw-custom {
    position:relative; overflow:hidden; display:inline-block;
    background:conic-gradient(#C0392B, #C9A46B, #7DF2B0, #0B6E4F, #BFD9E8, #8A6A45, #C0392B);
  }
  .pds-sw-custom input[type="color"] {
    position:absolute; inset:-4px; width:calc(100% + 8px); height:calc(100% + 8px);
    padding:0; border:0; opacity:0; cursor:pointer;
  }
  .pds-sw-none {
    background:
      linear-gradient(45deg, transparent 45%, #C0392B 45% 55%, transparent 55%),
      var(--paper, #F7F5F0);
  }

  /* ── Setup wizard ──────────────────────────────────────────────────────*/
  .pds-wiz { display:flex; flex-direction:column; gap:2px; }
  .pds-wiz-q {
    display:block; margin:14px 0 6px;
    font:600 10px/1 var(--mono, monospace);
    letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500);
  }
  .pds-wiz-q:first-child { margin-top:0; }
  .pds-wiz-opts { display:flex; flex-wrap:wrap; gap:6px; }
  .pds-wiz-opt {
    padding:7px 12px; cursor:pointer;
    border:1px solid var(--n-200); border-radius:8px;
    background:var(--surface); color:var(--n-700);
    font:500 12.5px/1 var(--font-ui, system-ui);
    transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
  }
  .pds-wiz-opt:hover  { border-color:var(--atlas); }
  .pds-wiz-opt.active { background:var(--atlas); border-color:var(--atlas); color:var(--paper, #F7F5F0); }
  .pds-wiz-dims { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .pds-wiz-dims label { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--n-600); }
  .pds-wiz-dims input[type="number"] { width:82px; text-align:center; }
  .pds-wiz-dims .pds-range { flex:1; min-width:160px; }
  .pds-wiz-area {
    font:600 12px/1 var(--mono, monospace); color:var(--atlas);
    padding:5px 9px; border-radius:7px; background:var(--paper-muted, rgba(11,110,79,0.07));
  }

  /* Three candidates, each previewing its own generated objects. */
  .pds-wiz-cards { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; }
  .pds-wiz-card {
    display:flex; flex-direction:column; gap:7px; align-items:stretch; text-align:left;
    padding:9px; cursor:pointer;
    border:1px solid var(--n-200); border-radius:11px; background:var(--surface);
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  .pds-wiz-card:hover  { border-color:var(--atlas); }
  .pds-wiz-card.active { border-color:var(--atlas); box-shadow:0 0 0 2px rgba(11,110,79,0.16); }
  .pds-wiz-thumb { display:block; border-radius:7px; overflow:hidden; background:var(--paper, #F7F5F0); }
  .pds-wiz-thumb svg { display:block; width:100%; height:88px; }
  .pds-wiz-card-name {
    font:600 10px/1 var(--mono, monospace);
    letter-spacing:0.1em; text-transform:uppercase; color:var(--ink);
  }
  .pds-wiz-card-nums { font-size:11.5px; line-height:1.5; color:var(--n-600); }
  .pds-wiz-card-nums b { font-size:15px; color:var(--atlas); }
  .pds-wiz-short {
    font:500 10.5px/1.4 var(--font-ui, system-ui);
    color:#8A4B22; background:rgba(192,57,43,0.09);
    padding:4px 6px; border-radius:6px;
  }
  .pds-wiz-note { margin:10px 0 0; font-size:11.5px; color:var(--n-500); }
  @media (max-width: 620px) { .pds-wiz-cards { grid-template-columns:1fr; } }

  /* ═══ v4 · vue nuit — la console de service ═══════════════════════════════
     Le look promis par la page d'accueil : salle charbon, tables au trait,
     le statut porté par la lumière. Tout vit sous .pds-noir (posée sur la
     racine du tiroir par pdsAttach) ; la vue jour au-dessus reste le rendu
     matières, intact. Une seule teinte d'accent — la menthe — et son halo
     rgba(0,255,174,…), le même vert que l'accueil sombre. */

  .pds-noir { color-scheme: dark; }

  /* La classe est doublée dans chaque sélecteur à dessein : le skin Vexel
     peint ce même chrome via « body.design-vexel :is(…) » — un élément plus
     deux classes — et la vue nuit doit l'emporter par spécificité, pas par
     ordre de source. */

  /* — La coque du tiroir : le cockpit entier passe au noir — */
  .pds-noir.pds-noir.pds-noir { background:rgba(5, 8, 6, 0.72); }
  /* !important : le skin 2026 (empilé par défaut) pose son verre blanc sur
     .kiwi-drawer avec !important — la spécificité seule ne suffit pas ici. */
  .pds-noir.pds-noir.pds-noir .kiwi-drawer { background:#090D0A !important; border-color:rgba(242,239,230,0.10) !important; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-body { background:transparent; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-head { background:#0B0F0C; border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-head :is(h1, h2, h3) { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-head p { color:rgba(242,239,230,0.50); }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-close {
    background:#141813; border-color:rgba(242,239,230,0.14); color:rgba(242,239,230,0.78);
  }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-close:hover { border-color:rgba(125,242,176,0.55); color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-foot { background:#0B0F0C; border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-inspector {
    background:transparent; border:none; box-shadow:none;
    -webkit-backdrop-filter:none; backdrop-filter:none;
  }

  /* — Chrome : panneaux, palette, inspecteur — */
  .pds-noir.pds-noir.pds-noir .pds-rail-card,
  .pds-noir.pds-noir.pds-noir .pds-tpl { background:#0F130F; border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-rail-title, .pds-noir.pds-noir.pds-noir .pds-legend-title,
  .pds-noir.pds-noir.pds-noir .pds-mini-label, .pds-noir.pds-noir.pds-noir .pds-wiz-q,
  .pds-noir.pds-noir.pds-noir .pds-form-row > label, .pds-noir.pds-noir.pds-noir .pds-rot-lbl { color:rgba(242,239,230,0.42); }
  .pds-noir.pds-noir.pds-noir .pds-rail-hint, .pds-noir.pds-noir.pds-noir .pds-mode-desc { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-pal-item,
  .pds-noir.pds-noir.pds-noir .pds-tool, .pds-noir.pds-noir.pds-noir .pds-step-btn, .pds-noir.pds-noir.pds-noir .pds-inspect-close,
  .pds-noir.pds-noir.pds-noir .pds-cfg-pill, .pds-noir.pds-noir.pds-noir .pds-scene-pill, .pds-noir.pds-noir.pds-noir .pds-wiz-opt,
  .pds-noir.pds-noir.pds-noir .pds-amb, .pds-noir.pds-noir.pds-noir .pds-strat-card, .pds-noir.pds-noir.pds-noir .pds-chip,
  .pds-noir.pds-noir.pds-noir .pds-wiz-card {
    background:#141813; border-color:rgba(242,239,230,0.10); color:rgba(242,239,230,0.78);
  }
  .pds-noir.pds-noir.pds-noir .pds-pal-label { color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-pal-shape { background:#1C221C; border-color:rgba(242,239,230,0.30); }
  .pds-noir.pds-noir.pds-noir .pds-pal-item:hover { border-color:rgba(125,242,176,0.55); box-shadow:0 6px 16px -10px rgba(0,255,174,0.35); }
  .pds-noir.pds-noir.pds-noir .pds-tool:hover, .pds-noir.pds-noir.pds-noir .pds-step-btn:hover,
  .pds-noir.pds-noir.pds-noir .pds-cfg-pill:hover, .pds-noir.pds-noir.pds-noir .pds-scene-pill:hover,
  .pds-noir.pds-noir.pds-noir .pds-wiz-opt:hover, .pds-noir.pds-noir.pds-noir .pds-amb:hover,
  .pds-noir.pds-noir.pds-noir .pds-strat-card:hover, .pds-noir.pds-noir.pds-noir .pds-inspect-close:hover {
    background:#1A201A; color:#EDEAE0; border-color:rgba(125,242,176,0.55);
  }
  .pds-noir.pds-noir.pds-noir .pds-chip-body b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-asum-name { color:rgba(242,239,230,0.80); }
  .pds-noir.pds-noir.pds-noir .pds-rot-meta > div, .pds-noir.pds-noir.pds-noir .pds-rot-step {
    background:#141813; border-color:rgba(242,239,230,0.10);
  }
  .pds-noir.pds-noir.pds-noir .pds-rot-val, .pds-noir.pds-noir.pds-noir .pds-fair-name, .pds-noir.pds-noir.pds-noir .pds-hist-name,
  .pds-noir.pds-noir.pds-noir .pds-strat-card b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-strat-card em { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-fair-bar { background:rgba(242,239,230,0.10); }

  /* Champs — color-scheme:dark règle les natifs, le reste suit. */
  .pds-noir.pds-noir.pds-noir .pds-input, .pds-noir.pds-noir.pds-noir input[type="number"], .pds-noir.pds-noir.pds-noir input[type="text"],
  .pds-noir.pds-noir.pds-noir select, .pds-noir.pds-noir.pds-noir textarea {
    background:#141813; border-color:rgba(242,239,230,0.14); color:#EDEAE0;
  }
  .pds-noir.pds-noir.pds-noir .pds-range, .pds-noir.pds-noir.pds-noir .pds-snap input { accent-color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-snap { color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-unit { color:rgba(242,239,230,0.35); }
  .pds-noir.pds-noir.pds-noir .pds-num-grid > label { color:rgba(242,239,230,0.42); }
  .pds-noir.pds-noir.pds-noir .pds-step-btn { color:#EDEAE0; }

  /* Bandeau KPI */
  .pds-noir.pds-noir.pds-noir .p-kpi { background:#0F130F; border:1px solid rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .p-kpi .l { color:rgba(242,239,230,0.45); }
  .pds-noir.pds-noir.pds-noir .p-kpi .v { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .p-kpi .d { color:rgba(242,239,230,0.40); }

  /* Modes + zones : rail sombre, pilule active claire — le contraste inversé
     de la vue jour, même géométrie pour que la lentille liquide suive. */
  .pds-noir.pds-noir.pds-noir .pds-modes, .pds-noir.pds-noir.pds-noir .pds-zone-tabs {
    background:#0D110D; border-color:rgba(242,239,230,0.10);
  }
  .pds-noir.pds-noir.pds-noir .pds-mode, .pds-noir.pds-noir.pds-noir .pds-zone { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-mode:hover, .pds-noir.pds-noir.pds-noir .pds-zone:hover { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-mode.active { background:#EDEAE0; color:#0B0F0C; }
  .pds-noir.pds-noir.pds-noir .pds-zone.active { background:#1C221C; color:#EDEAE0; box-shadow:none; }
  .pds-noir.pds-noir.pds-noir .pds-zone.active em { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-zone em { color:rgba(242,239,230,0.40); }
  .pds-noir.pds-noir.pds-noir .pds-zone-add { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-zone-add:hover { background:#1C221C; }

  /* Barre du plan + légende façon accueil : cases au trait, l'occupée seule
     rayonne. */
  .pds-noir.pds-noir.pds-noir .pds-canvas-bar { background:#0D110D; border-color:rgba(242,239,230,0.08); }
  /* Légende : les pastilles 17 × 13 rx 4 de l'accueil, sur la même échelle
     de blanc que les tables, la menthe pour l'occupée. Typo du mockup :
     400 · 11 px · -0.01em, encre 0.5. */
  .pds-noir.pds-noir.pds-noir .pds-legend-item {
    color:rgba(255,255,255,0.5);
    font:400 11px/1.2 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:-0.01em;
  }
  /* Les tabourets du comptoir se dessinent hors de la boîte du bâti. */
  .pds-noir.pds-noir.pds-noir .pds-el-svg { overflow:visible; }
  .pds-noir.pds-noir.pds-noir .pds-legend-swatch {
    width:17px; height:13px; border-radius:4px;
    background:rgba(255,255,255,0.012); box-shadow:none; border:1.25px solid rgba(255,255,255,0.19);
  }
  .pds-noir.pds-noir.pds-noir .pds-sw-occupied {
    border-color:#00FFAE; background:rgba(0,255,174,0.11);
  }
  .pds-noir.pds-noir.pds-noir .pds-sw-reserved { border-style:dashed; border-color:#E8C067; background:rgba(232,192,103,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-sw-cleaning { border-style:dotted; border-color:rgba(255,255,255,0.40); background:rgba(255,255,255,0.02); }

  /* — La scène — */
  .pds-noir.pds-noir.pds-noir .pds-plan-canvas {
    background:#020302;
    border:1px solid rgba(255,255,255,0.06);
    border-radius:20px;
    padding:16px 16px 8px;
  }
  .pds-noir.pds-noir.pds-noir .pds-plan-room {
    border:1.5px solid rgba(255,255,255,0.13);
    border-radius:18px;
    box-shadow: 0 34px 70px -40px rgba(0,0,0,0.9);
  }
  .pds-noir.pds-noir.pds-noir .pds-plan-room.is-terrasse {
    border-style:dashed; border-color:rgba(0,255,174,0.30); background:transparent;
  }
  .pds-noir.pds-noir.pds-noir .pds-plan-label { color:rgba(242,239,230,0.78); }
  .pds-noir.pds-noir.pds-noir .pds-plan-label em { color:rgba(242,239,230,0.42); }
  .pds-noir.pds-noir.pds-noir .pds-plan-footer { color:rgba(242,239,230,0.40); }
  .pds-noir.pds-noir.pds-noir .pds-plan-floor-count { color:rgba(242,239,230,0.40); }
  .pds-noir.pds-noir.pds-noir .pds-plan-dims { color:rgba(242,239,230,0.30); }
  .pds-noir.pds-noir.pds-noir .pds-empty { background:rgba(10,14,11,0.78); }
  .pds-noir.pds-noir.pds-noir .pds-empty h4 { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-empty p { color:rgba(242,239,230,0.55); }

  /* — Tables : le statut est une lumière, le numéro se lit sans effort.
     Typo du mockup : 500 · 0.04em ; l'échelle de blanc remontée à 0.40 / 0.55
     pour tenir sur le sol quasi noir, la menthe 0.90 pour l'occupée. Le
     survol remonte encore l'encre — un plan d'édition doit rester
     manipulable, l'accueil n'a pas ce souci. — */
  .pds-noir.pds-noir.pds-noir .pds-tbl-num {
    font:500 11px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.04em; color:rgba(255,255,255,0.40);
  }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"] .pds-tbl-num { color:rgba(0,255,174,0.90); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="reserved"] .pds-tbl-num { color:rgba(232,192,103,0.80); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell:hover .pds-tbl-num,
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-selected .pds-tbl-num { color:rgba(255,255,255,0.75); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"]:hover .pds-tbl-num,
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"].is-selected .pds-tbl-num { color:#00FFAE; }
  /* Le nombre de couverts n'existe qu'à l'approche — le mockup n'affiche que
     le numéro, et c'est ce silence qui le rend cher. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-covers { opacity:0; transition:opacity 180ms ease; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell:hover .pds-tbl-covers,
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-selected .pds-tbl-covers { opacity:.5; }
  /* Le halo de l'occupée vit désormais DANS le SVG (disque pdsNoirCall),
     comme sur l'accueil ; le survol garde juste un peu de lumière en plus. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell:hover { filter:brightness(1.25); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"]:hover { filter:brightness(1.15); }
  /* L'anneau d'appel — la copie de .kw-plan-call de l'accueil. */
  .pds-noir.pds-noir.pds-noir .pds-noir-call {
    transform-box:fill-box; transform-origin:center;
    animation:pdsNoirCall 2.6s cubic-bezier(.22,.7,.3,1) infinite;
  }
  @keyframes pdsNoirCall {
    0%, 62% { opacity:.85; transform:scale(1); }
    100%    { opacity:0;   transform:scale(1.5); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pds-noir.pds-noir.pds-noir .pds-noir-call { animation:none; opacity:0; }
  }
  /* La pastille « 6 min » : 19 px de haut, rx 9.5, encre 0.72 sur noir 0.92. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-since {
    position:absolute; top:calc(var(--pad, 0px) - 24px); left:calc(var(--pad, 0px) - 6px);
    height:19px; padding:0 9px; border-radius:9.5px;
    display:inline-flex; align-items:center;
    background:rgba(10,10,10,0.92); border:1px solid rgba(255,255,255,0.18);
    font:500 10px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.02em; color:rgba(255,255,255,0.72);
    white-space:nowrap; pointer-events:none; z-index:4;
  }
  .pds-noir.pds-noir.pds-noir .pds-tbl-server { border-color:#0D110E; }
  /* Les pastilles serveur appartiennent à l'Affectation ; en Aménagement
     elles ne font que du bruit que le mockup n'a pas. */
  .pds-noir.pds-noir.pds-noir .pds-stage-layout .pds-tbl-server { display:none; }

  /* — Sélection : cadre menthe + tirets d'angle, le geste de l'accueil — */
  .pds-noir.pds-noir.pds-noir .pds-hdl-layer::before {
    border-color:#7DF2B0; border-radius:9px;
    box-shadow:0 0 0 3px rgba(0,255,174,0.13), 0 0 26px rgba(0,255,174,0.20);
  }
  .pds-noir.pds-noir.pds-noir .pds-hdl { background:#0D110E; border-color:#7DF2B0; box-shadow:0 0 6px rgba(0,255,174,0.35); }
  .pds-noir.pds-noir.pds-noir .pds-hdl:hover { background:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-n, .pds-noir.pds-noir.pds-noir .pds-hdl-s { width:18px; height:5px; margin:-2.5px 0 0 -9px; border-radius:3px; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-e, .pds-noir.pds-noir.pds-noir .pds-hdl-w { width:5px; height:18px; margin:-9px 0 0 -2.5px; border-radius:3px; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-rot { background:#7DF2B0; border-color:#0D110E; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-rot::before { background:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-dim { background:#7DF2B0; color:#07100C; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-resizing .pds-dim,
  .pds-noir.pds-noir.pds-noir .pds-el.is-resizing .pds-dim { background:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-locked { background:rgba(242,239,230,0.14); color:#EDEAE0; }

  /* — Bâti : les idéogrammes se dessinent en SVG (pdsNoirFixture), le CSS ne
     rajoute rien sur le fond — un liseré ici doublerait le trait. — */
  .pds-noir.pds-noir.pds-noir .pds-el:not(.is-locked):not(.is-dragging):hover {
    outline-color:rgba(125,242,176,0.65);
    filter:drop-shadow(0 0 12px rgba(0,255,174,0.14));
  }
  /* Étiquettes du bâti : la typo du mockup — 500 · 0.14em · blanc 0.34 — et
     les pilules BAR / CAISSE portent leur nom à gauche, pas au centre. */
  .pds-noir.pds-noir.pds-noir .pds-el-label {
    font:500 9px/1.2 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.14em;
  }
  .pds-noir.pds-noir.pds-noir .pds-el-comptoir .pds-el-label,
  .pds-noir.pds-noir.pds-noir .pds-el-caisse .pds-el-label {
    justify-content:flex-start; padding-left:16px; text-align:left;
  }

  /* Gêne de placement : le rouge reste le seul hors-marque, plus clair ici. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-blocked::after,
  .pds-noir.pds-noir.pds-noir .pds-el.is-blocked::after { border-color:#E4604E; background:rgba(228,96,78,0.14); }
  .pds-noir.pds-noir.pds-noir .pds-blocker::before { border-color:#E4604E; }

  /* — Statuts (légende de l'inspecteur) — */
  .pds-noir.pds-noir.pds-noir .pds-pill-free { background:rgba(242,239,230,0.07); color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-pill-occupied { background:rgba(0,255,174,0.10); color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-pill-reserved { background:rgba(232,192,103,0.10); color:#E8C067; border:1px dashed rgba(232,192,103,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-pill-cleaning { background:rgba(255,255,255,0.02); color:rgba(242,239,230,0.60); border:1px dotted rgba(255,255,255,0.40); }

  /* — Groupes : l'enveloppe passe à la menthe sur la scène noire — */
  .pds-noir.pds-noir.pds-noir .pds-group-env { border-color:rgba(0,255,174,0.55); background:rgba(0,255,174,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-group-env::before { background:radial-gradient(closest-side, rgba(0,255,174,0.16), rgba(0,255,174,0)); }
  .pds-noir.pds-noir.pds-noir .pds-group-chip { background:rgba(4,26,20,0.92); border-color:rgba(0,255,174,0.55); color:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-inspect-actions .kb.pds-group-arming { border-color:#00FFAE; color:#00FFAE; animation:pdsGroupArm 1.2s ease-in-out infinite; }
  .pds-noir.pds-noir.pds-noir .pds-group-info { border-color:rgba(0,255,174,0.35); background:rgba(0,255,174,0.07); color:#7DF2B0; }

  /* Nuancier : l'anneau de l'actif passe à la menthe sur fond noir. */
  .pds-noir.pds-noir.pds-noir .pds-sw { border-color:rgba(242,239,230,0.18); }
  .pds-noir.pds-noir.pds-noir .pds-sw.active { box-shadow:0 0 0 2px #0F130F, 0 0 0 3.5px #7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-sw-none {
    background:
      linear-gradient(45deg, transparent 45%, #E4604E 45% 55%, transparent 55%),
      #141813;
  }

  /* Pied de page */
  .pds-noir.pds-noir.pds-noir .pds-foot-meta { color:rgba(242,239,230,0.40); }
  .pds-noir.pds-noir.pds-noir .kb.ghost { background:#141813; border-color:rgba(242,239,230,0.14); color:rgba(242,239,230,0.78); }
  .pds-noir.pds-noir.pds-noir .kb.ghost:hover { border-color:rgba(125,242,176,0.55); color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-rail-danger { color:#E4604E; }
  .pds-noir.pds-noir.pds-noir .pds-rail-danger:hover { border-color:#E4604E; }
`;

/* ═══════════════════════════════════════════════════════════════════════════
 * 2 ·  MENU & MODIFICATEURS  ·  width 980
 * ═══════════════════════════════════════════════════════════════════════════ */
handlers['nav-menu'] = () => {
  const CATS = [
    { key: 'entrees', label: 'Entrées',  count: 8 },
    { key: 'tajines', label: 'Tajines',  count: 9 },
    { key: 'couscous', label: 'Couscous', count: 5 },
    { key: 'desserts', label: 'Desserts', count: 8 },
    { key: 'boissons', label: 'Boissons', count: 18 },
  ];
  const MENU = {
    entrees: [
      ['ent-1', 'Salade marocaine',   'Tomate, concombre, oignon, huile d\'olive',     32,  'ok',  'illimité', 'sans coriandre', '', 6,  142, '+ 32 cette semaine'],
      ['ent-2', 'Briouates viande',    'Triangles croustillants, bœuf mijoté',          45,  'ok',  '32 portions', '', '', 8,  84, '+ 8 %'],
      ['ent-3', 'Harira',              'Soupe traditionnelle pois chiches & lentilles', 28,  'ok',  'illimité', 'extra dattes · sans céleri', '', 7,  98,  'pic Ramadan'],
      ['ent-4', 'Zaalouk',             'Aubergine fumée, tomate, ail',                  28,  'low', '6 portions',  'sans coriandre', 'gluten-free', 12, 56, 'top 30 %'],
      ['ent-5', 'Bissara',             'Fèves moulues, cumin, huile d\'olive',           22,  'ok',  'illimité', '', 'gluten-free', 14, 38, 'classique'],
    ],
    tajines: [
      ['taj-1', 'Tajine kefta œuf',     'Viande hachée, œuf, tomate, épices',           85,  'ok',  '+ 3 modificateurs', 'sans coriandre · pain à part · piment fort', '', 1, 312, '+ 12 % marge'],
      ['taj-2', 'Tajine agneau pruneaux','Agneau mijoté, pruneaux, amandes',            110, 'out', '0 portion · ruptu.','sans gluten', 'sans gluten', 4, 184, 'top weekend'],
      ['taj-3', 'Tajine poulet citron',  'Poulet, olives, citron confit',                95,  'ok',  '24 portions',  'sans olives', '', 3, 226, '+ 5 %'],
      ['taj-4', 'Tajine kefta classique','Boulettes, sauce tomate, œufs',                75,  'ok',  '18 portions',  '', '', 5, 168, 'régulier'],
      ['taj-5', 'Tajine boeuf prunes',   'Bœuf mijoté 4h, pruneaux d\'Agen',             125, 'low', '4 portions',   '', '', 6, 142, 'premium'],
    ],
    couscous: [
      ['cou-1', 'Couscous royal',         'Bœuf, poulet, merguez, légumes',             95,  'ok',  '+ 2 modificateurs', 'sans piment · merguez doux', '', 2, 287, 'vendredi · top'],
      ['cou-2', 'Couscous légumes',       '7 légumes, pois chiches, raisins',           68,  'ok',  'illimité',  '', 'végan', 9, 64, 'gluten · semoule'],
      ['cou-3', 'Couscous agneau',        'Agneau braisé, oignons confits',             105, 'low', '5 portions','sans piment', '', 7, 98, '+ 18 %'],
      ['cou-4', 'Pastilla au poulet',     'Feuille fine, amandes, cannelle',            120, 'low', '3 portions','sucré ou salé', '', 3, 156, 'effet wow'],
    ],
    desserts: [
      ['des-1', 'Msemen beurre & miel',   'Crêpe feuilletée, beurre, miel',             12,  'ok',  'illimité',  '', '', 6,  221, 'top breakfast'],
      ['des-2', 'Cornes de gazelle',      'Pâte d\'amande, fleur d\'oranger',           28,  'low', '12 pièces', '', 'sans gluten possible', 11, 72, 'cadeau client'],
      ['des-3', 'Sellou',                 'Graines de sésame, amandes, miel',           30,  'ok',  'artisanal', '', '', 13, 38, 'occasionnel'],
      ['des-4', 'Chebakia',               'Gâteaux de miel frit · Ramadan',             24,  'out', 'saisonnier','', '', 15, 0,  'rupture'],
    ],
    boissons: [
      ['bo-1', 'Thé à la menthe',         'Gunpowder + menthe fraîche + sucre',         12,  'ok',  'illimité',  'sucre à part · double menthe', '', 5, 412, '#1 vente'],
      ['bo-2', 'Orange pressée',          'Pressée minute · 45 oranges en stock',       18,  'ok',  '45 oranges','sans glace · double', '', 7, 198, '+ 8 %'],
      ['bo-3', 'Café noir double',        'Espresso double · grain Algeria',            14,  'ok',  '+ 4 modif. lait',  'lait amande · lait avoine · sans sucre', '', 10, 124, 'régulier'],
      ['bo-4', 'Limonade traditionnelle', 'Citron vert + eau de fleur d\'oranger',      16,  'ok',  'illimité',  'sans sucre · pétillante', '', 8, 87, 'été'],
      ['bo-5', 'Méchoui',                 'Agneau rôti, parts pour 2 · 4',              180, 'low', '2 portions', 'parts pour 4 · épices fortes', '', 16, 24, 'haut de gamme'],
    ],
  };
  let activeCat = 'tajines';
  let menu86 = new Set(['taj-2', 'des-4']);

  const tagsHtml = (allerg, free) => {
    const out = [];
    if (allerg) out.push(`<span class="tg warn">${allerg.split(' · ')[0]}</span>`);
    if (free)   out.push(`<span class="tg">${free}</span>`);
    return out.join('');
  };
  const stockChip = (st) => st === 'ok' ? '<span class="chip ok">en stock</span>' : st === 'low' ? '<span class="chip pend">stock bas</span>' : '<span class="chip ref">RUPTURE</span>';

  const renderRow = (item, idx, total) => {
    const [id, name, desc, price, st, , mod, free, rank, sold, perf] = item;
    const is86 = menu86.has(id);
    return `
      <div class="menu-row ${is86 ? 'is-86' : ''}" data-row="${id}">
        <div class="photo">${name.includes('Tajine') ? '◉' : name.includes('Couscous') ? '◓' : name.includes('Café') || name.includes('Thé') ? '☕' : name.includes('Pastilla') ? '✦' : name.includes('Salade') ? '◴' : '●'}</div>
        <div class="nm">${name}<div class="desc">${desc}</div><div class="tags">${stockChip(is86 ? 'out' : st)} ${mod ? `<span class="tg">${mod.split(' · ').length} modif.</span>` : ''} ${tagsHtml('', free)}</div></div>
        <div class="pr">${price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', ',')} MAD</div>
        <div class="rk"><b>#${rank}</b><div style="font-size:10px; color:var(--n-500);">${sold} vendus</div></div>
        <div class="menu-cat-actions" style="justify-content:flex-end;">
          <button class="ord-arrow" data-row-act="up" data-id="${id}" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''} aria-label="Monter">▲</button>
          <button class="ord-arrow" data-row-act="dn" data-id="${id}" ${idx === total - 1 ? 'disabled style="opacity:0.3;"' : ''} aria-label="Descendre">▼</button>
          <span class="toggle-86 ${is86 ? 'on' : ''}" data-row-act="86" data-id="${id}" title="${is86 ? 'Réactiver' : '86 it (rupture)'}"></span>
        </div>
        <div class="more" data-row-act="edit" data-id="${id}">⋯</div>
      </div>
    `;
  };

  const renderItems = (catKey) => {
    const list = MENU[catKey] || [];
    return list.map((it, i) => renderRow(it, i, list.length)).join('');
  };

  const menuDr = drawer({
    title: 'Menu & modificateurs · Café Atlas',
    subtitle: '45 items actifs · 5 catégories · 12 modificateurs · 2 produits 86\'d',
    width: 980,
    body: `
      <div class="p-kpis">
        <div class="p-kpi"><div class="l">CARTE ACTIVE</div><div class="v">45<span class="u">items</span></div><div class="d up">+ 3 ce mois</div></div>
        <div class="p-kpi"><div class="l">PANIER MOYEN</div><div class="v">158<span class="u"> MAD</span></div><div class="d up">+ 4,2 % vs sem. dernière</div></div>
        <div class="p-kpi"><div class="l">MARGE BRUTE</div><div class="v">66<span class="u">%</span></div><div class="d">cible 68 %</div></div>
        <div class="p-kpi" style="background:rgba(201,74,58,0.06); border-color:rgba(201,74,58,0.25);"><div class="l">86'D</div><div class="v" style="color:var(--danger);">2</div><div class="d">tajine agneau · chebakia</div></div>
      </div>

      <div class="menu-ai">
        <div class="ic">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg>
        </div>
        <div class="b">
          <div class="t">INSIGHT KIWI · 4H AGO</div>
          <div class="n">Promouvoir le tajine kefta œuf cette semaine.</div>
          <div class="d">+ 12 % de marge vs moyenne carte · lift +18 % attendu si placé en bannière catalogue.</div>
        </div>
        <button class="kb" style="background:var(--mint); color:var(--riad);" data-action="menu-promote">Mettre en avant</button>
      </div>

      <div class="p-toolbar">
        <div class="p-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
          Rechercher un item, un modificateur, un allergène…
        </div>
        <button class="kb ghost" data-action="menu-schedule">⏱ Plages horaires</button>
        <button class="kb ghost" data-action="menu-mass">Édition groupée</button>
        <button class="kb atlas" data-action="menu-add">+ Ajouter un item</button>
      </div>

      <div class="menu-pill-cats" id="menu-cats">
        ${CATS.map(c => `<button class="menu-pill-cat ${c.key === activeCat ? 'on' : ''}" data-cat="${c.key}">${c.label}<span class="ct">${c.count}</span></button>`).join('')}
      </div>

      <div class="p-pane" id="menu-pane">
        ${renderItems(activeCat)}
      </div>

      <div class="p-card" style="margin-top:18px;">
        <div class="head">
          <h4>Modificateurs partagés</h4>
          <span class="meta">12 ACTIFS · GLOBAUX SUR LA CARTE</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; font-size:12.5px;">
          ${[
            ['Sans coriandre', '21 items', 'gratuit'],
            ['Sans piment',    '18 items', 'gratuit'],
            ['Pain à part',    '15 items', 'gratuit'],
            ['Sucre à part',   '8 items',  'gratuit'],
            ['Double menthe',  'thé · 1 item', '+ 2 MAD'],
            ['Lait amande',    'cafés · 4 items', '+ 4 MAD'],
            ['Lait avoine',    'cafés · 4 items', '+ 4 MAD'],
            ['Parts pour 4',   'méchoui · 1 item', '+ 90 MAD'],
            ['Sans gluten',    '6 items',  'gratuit'],
            ['Bien cuit',      'tajines · 5', 'gratuit'],
            ['Saignant',       'tajines · 5', 'gratuit'],
            ['Pétillante',     'limonade · 1', '+ 1 MAD'],
          ].map(([n, scope, fee]) => `
            <div style="background:var(--surface); border:1px solid var(--n-200); border-radius:9px; padding:9px 11px;">
              <div style="font-weight:500; letter-spacing:-0.005em;">${n}</div>
              <div style="font-size:11px; color:var(--n-500); font-family:var(--mono); margin-top:3px; display:flex; justify-content:space-between;"><span>${scope}</span><span>${fee}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    `,
    foot: `
      <div style="display:flex; gap:8px; justify-content:space-between; width:100%; align-items:center;">
        <span style="font-family:var(--mono); font-size:11px; color:var(--n-500); letter-spacing:0.06em;">SYNC POS · 100 % · DERNIÈRE MAJ 12:42</span>
        <div style="display:flex; gap:8px;">
          <button class="kb ghost" data-dismiss>Fermer</button>
          <button class="kb primary" data-action="menu-publish">Publier la carte</button>
        </div>
      </div>
    `,
  });

  wireDismiss(menuDr);

  /* — wire up tabs, 86 toggles, reorder arrows, edit row — */
  setTimeout(() => {
    const root = menuDr.el;
    if (!root) return;
    const pane = root.querySelector('#menu-pane');

    root.querySelectorAll('#menu-cats .menu-pill-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-cat');
        if (key === activeCat) return;
        activeCat = key;
        root.querySelectorAll('#menu-cats .menu-pill-cat').forEach(b => b.classList.toggle('on', b === btn));
        pane.innerHTML = renderItems(activeCat);
        wireRows();
      });
    });

    function wireRows() {
      pane.querySelectorAll('[data-row-act]').forEach(b => {
        b.onclick = (e) => {
          e.stopPropagation();
          const a = b.getAttribute('data-row-act');
          const id = b.getAttribute('data-id');
          const list = MENU[activeCat];
          const idx = list.findIndex(x => x[0] === id);
          if (a === '86') {
            if (menu86.has(id)) menu86.delete(id); else menu86.add(id);
            window.Kiwi.toast(menu86.has(id) ? `${list[idx][1]} marqué 86 (rupture)` : `${list[idx][1]} de retour à la carte`, { type: menu86.has(id) ? 'warn' : 'success', desc: menu86.has(id) ? 'Retiré de la caisse et du QR menu.' : 'Item disponible sur tous les canaux.' });
            pane.innerHTML = renderItems(activeCat);
            wireRows();
          }
          if (a === 'up' && idx > 0) {
            [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
            pane.innerHTML = renderItems(activeCat);
            wireRows();
            window.Kiwi.toast(`${list[idx - 1][1]} repositionné`, { type: 'info' });
          }
          if (a === 'dn' && idx < list.length - 1) {
            [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
            pane.innerHTML = renderItems(activeCat);
            wireRows();
            window.Kiwi.toast(`${list[idx + 1][1]} repositionné`, { type: 'info' });
          }
          if (a === 'edit') openItemEdit(list[idx]);
        };
      });
      pane.querySelectorAll('.menu-row').forEach(r => {
        r.addEventListener('click', (e) => {
          if (e.target.closest('[data-row-act]')) return;
          const id = r.getAttribute('data-row');
          const list = MENU[activeCat];
          const item = list.find(x => x[0] === id);
          if (item) openItemEdit(item);
        });
      });
    }
    wireRows();
  }, 0);
};

/* ─── Item edit modal ──────────────────────────────────────────────────── */
function openItemEdit(it) {
  const [, name, desc, price, , avail, mod, free, rank, sold, perf] = it;
  const editM = window.Kiwi.modal({
    tag: 'ITEM',
    title: name,
    desc: desc,
    width: 640,
    body: `
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" value="${name}" /></div>
        <div class="kf-group"><label class="kf-label">Prix TTC</label><input class="kf-input mono" value="${price}.00" /></div>
      </div>
      <div class="kf-group">
        <label class="kf-label">Description courte</label>
        <input class="kf-input" value="${desc}" />
      </div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Catégorie</label>
          <select class="kf-input"><option>Entrées</option><option selected>Tajines</option><option>Couscous</option><option>Desserts</option><option>Boissons</option></select>
        </div>
        <div class="kf-group"><label class="kf-label">Temps de prep.</label>
          <select class="kf-input"><option>5 min</option><option>10 min</option><option selected>15 min</option><option>20 min</option><option>25 min</option><option>30 min</option></select>
        </div>
      </div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Allergènes</label>
          <input class="kf-input" value="œuf · gluten" placeholder="ex. arachides · gluten" />
        </div>
        <div class="kf-group"><label class="kf-label">Coût matière</label>
          <input class="kf-input mono" value="${Math.round(price * 0.34)}.00" />
        </div>
      </div>
      <div class="kf-group">
        <label class="kf-label">Modificateurs autorisés</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${['Sans coriandre', 'Sans piment', 'Pain à part', 'Bien cuit', 'Saignant', 'Sans gluten'].map((m, i) => `<span class="chip ${i<3?'ok':'neutral'}" style="cursor:pointer;">${i<3?'✓ ':''}${m}</span>`).join('')}
        </div>
      </div>
      <div class="p-card" style="margin:14px 0 0;">
        <div class="head"><h4 style="font-size:13px;">Performance · 30 derniers jours</h4><span class="meta">RANG #${rank}</span></div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px; font-size:12.5px;">
          <div><div style="color:var(--n-500); font-size:11px;">Vendus</div><div class="mono" style="font-size:18px; font-weight:600;">${sold}</div></div>
          <div><div style="color:var(--n-500); font-size:11px;">CA</div><div class="mono" style="font-size:18px; font-weight:600;">${(price * sold).toLocaleString('fr-FR')} MAD</div></div>
          <div><div style="color:var(--n-500); font-size:11px;">Marge brute</div><div class="mono" style="font-size:18px; font-weight:600; color:var(--atlas);">66 %</div></div>
        </div>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Annuler</button>
      <button class="kb danger" data-dismiss onclick="window.Kiwi.toast('${name} supprimé de la carte',{type:'warn',desc:'Item retiré · les commandes ouvertes restent valides.'})">Supprimer</button>
      <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('${name} mis à jour',{type:'success',desc:'Visible sur votre caisse et votre QR menu.'})">Enregistrer</button>
    `
  });
  if (typeof wireDismiss === 'function') wireDismiss(editM);
}

handlers['menu-add'] = () => {
  wireDismiss(modal({
    tag: 'NOUVEAU',
    title: 'Ajouter un nouvel item',
    desc: 'L\'item sera publié sur le POS, le QR menu et les agrégateurs en sync.',
    width: 600,
    body: `
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Nom de l'item</label><input class="kf-input" placeholder="ex. Tajine boulettes" /></div>
        <div class="kf-group"><label class="kf-label">Prix TTC</label><input class="kf-input mono" placeholder="0,00 MAD" /></div>
      </div>
      <div class="kf-group"><label class="kf-label">Catégorie</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${['Entrées', 'Tajines', 'Couscous', 'Desserts', 'Boissons'].map((c, i) => `<button class="kb ${i===1?'atlas':'ghost'}" style="flex:1; min-width:90px; justify-content:center;">${c}</button>`).join('')}
        </div>
      </div>
      <div class="kf-group"><label class="kf-label">Description (visible client)</label><input class="kf-input" placeholder="Ingrédients clés et style" /></div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Allergènes</label><input class="kf-input" placeholder="optionnel" /></div>
        <div class="kf-group"><label class="kf-label">Temps de prep.</label>
          <select class="kf-input"><option>5</option><option>10</option><option selected>15</option><option>20</option><option>25</option><option>30</option></select>
        </div>
      </div>
      <label style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px; font-size:13px; cursor:pointer; margin-bottom:6px;">
        <input type="checkbox" checked /> Publier immédiatement sur la caisse et le QR menu
      </label>
      <label style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px; font-size:13px; cursor:pointer;">
        <input type="checkbox" /> Marquer "nouveau" pendant 14 jours
      </label>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Annuler</button>
      <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Item publié sur la carte',{type:'success',desc:'Visible sur votre caisse et votre QR menu.'}); window.Kiwi.confetti();">Créer & publier</button>
    `
  }));
};

handlers['menu-mass'] = () => {
  wireDismiss(modal({
    tag: 'ÉDITION GROUPÉE',
    title: 'Modifier toute une catégorie',
    desc: 'Affecte tous les items sélectionnés en une opération.',
    width: 540,
    body: `
      <div class="kf-group"><label class="kf-label">Catégorie</label>
        <select class="kf-input"><option>Entrées (8)</option><option selected>Tajines (9)</option><option>Couscous (5)</option><option>Desserts (8)</option><option>Boissons (18)</option></select>
      </div>
      <div class="kf-group"><label class="kf-label">Action</label>
        <select class="kf-input">
          <option>Augmenter les prix de…</option>
          <option>Diminuer les prix de…</option>
          <option>Marquer la catégorie 86 (rupture)</option>
          <option>Activer disponibilité midi uniquement</option>
          <option>Cacher de la carte client</option>
        </select>
      </div>
      <div class="kf-group"><label class="kf-label">Pourcentage</label>
        <div style="display:flex; gap:6px;">
          ${['+ 2 %', '+ 5 %', '+ 8 %', '+ 10 %', 'autre'].map((p, i) => `<button class="kb ${i===1?'atlas':'ghost'}" style="flex:1; justify-content:center;">${p}</button>`).join('')}
        </div>
      </div>
      <div class="kf-help">9 items recevront +5 % · panier moyen estimé : 165 MAD (vs 158 MAD aujourd'hui).</div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Annuler</button>
      <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('9 tajines ré-tarifés (+5 %)',{type:'success',desc:'Sync en cours · prochaine commande à 16:42.'})">Appliquer</button>
    `
  }));
};

handlers['menu-schedule'] = () => {
  wireDismiss(modal({
    tag: 'PLAGES HORAIRES',
    title: 'Carte programmée',
    desc: 'Affiche / cache automatiquement des items selon le service ou la saison.',
    width: 600,
    body: `
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Couscous royal</h4><span class="chip ok">vendredi 11h–15h</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Affiché automatiquement le vendredi · masqué les autres jours.</div>
      </div>
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Méchoui</h4><span class="chip pend">soir 19h–23h</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Service du soir uniquement · 24h de préavis automatique.</div>
      </div>
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Carte Ramadan complète</h4><span class="chip pend">programmée</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Bascule automatique au coucher du soleil · 15 mars → 13 avril 2027. Harira, chebakia, briouates en avant-plan.</div>
      </div>
      <div class="p-card" style="margin:0;">
        <div class="head"><h4 style="font-size:14px;">Petit-déj.</h4><span class="chip neutral">8h–11h tous les jours</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Msemen, harira, café, thé. Switch automatique sur la carte midi à 11h00.</div>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Fermer</button>
      <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Programmation enregistrée',{type:'success',desc:'4 plages actives · sync POS et agrégateurs.'})">+ Ajouter une plage</button>
    `
  }));
};

handlers['menu-promote'] = () => {
  wireDismiss(modal({
    tag: 'PROMOUVOIR',
    title: 'Mettre en avant le tajine kefta œuf',
    desc: 'L\'item apparaîtra en bannière sur le QR menu et la caisse pendant 7 jours.',
    width: 540,
    body: `
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Estimation</h4><span class="meta">7 JOURS</span></div>
        <dl style="display:grid; grid-template-columns:1fr auto; gap:5px 14px; font-size:13px; margin:0;">
          <dt style="color:var(--n-500);">Lift de ventes attendu</dt><dd class="mono" style="color:var(--success); font-weight:600;">+18 %</dd>
          <dt style="color:var(--n-500);">Marge incrémentale</dt><dd class="mono">+ 2 184 MAD</dd>
          <dt style="color:var(--n-500);">Coût</dt><dd class="mono">0 MAD</dd>
        </dl>
      </div>
      <label style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px; font-size:13px; cursor:pointer;">
        <input type="checkbox" checked /> Inclure une photo générée par IA (gratuit)
      </label>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Plus tard</button>
      <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Tajine kefta œuf en avant',{type:'success',desc:'Bannière live sur le QR menu et la caisse.'}); window.Kiwi.confetti();">Lancer la promo</button>
    `
  }));
};

handlers['menu-publish'] = () => {
  wireDismiss(modal({
    tag: 'PUBLIER',
    title: 'Publier la carte ?',
    desc: 'La nouvelle version sera synchronisée sur tous les canaux en moins de 10 secondes.',
    width: 520,
    body: `
      <div class="p-card" style="margin:0;">
        <div class="head"><h4 style="font-size:14px;">12 modifications en attente</h4><span class="meta">DEPUIS 12:42</span></div>
        <ul style="list-style:none; margin:0; padding:0; font-size:13px;">
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">+ Ajout : <b>Pastilla aux fruits de mer</b></li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ Prix : Tajine kefta œuf 80 → <b>85 MAD</b></li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">86 : Tajine agneau pruneaux <span class="chip ref">RUPTURE</span></li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ Modificateurs : 3 nouveaux sur tajines</li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ 8 réorderings de catégorie</li>
        </ul>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Garder en brouillon</button>
      <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Carte publiée',{type:'success',desc:'Caisse et QR menu à jour.'}); window.Kiwi.confetti();">Publier maintenant</button>
    `
  }));
};
})();

/* ═══ Section 2 rest B · kds / stock ═══ */
(function() {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Section 2-B (restaurant vertical) — sidebar handlers
 *
 * Two replacement handlers for /Users/badrosonair/Documents/kiwi/assets/pages.js:
 *   1. handlers['nav-kds']    · Écran cuisine · live ticket queue (1040-wide)
 *   2. handlers['nav-stock']  · Stock ingrédients · 20-item grid (1000-wide)
 *
 * Plus auxiliary action handlers (kds-bump, kds-recall, stock-reorder…).
 * Drop the contents of this file in place of the existing nav-kds and nav-stock
 * blocks (and append the auxiliary handlers next to the other action stubs).
 *
 * Companion CSS: /tmp/kiwi-s2-rest-css.css (append additions there).
 * ─────────────────────────────────────────────────────────────────────────── */

  /* ═══════════════════ ÉCRAN CUISINE (KDS) ═══════════════════ */
  handlers['nav-kds'] = () => {
    const tickets = [
      { id: 'T-7821', table: 'T4', src: 'salle',  cook: 'MM', elapsed: 412, items: [{ q: 2, n: 'Salade marocaine', st: 'salade' }, { q: 1, n: 'Tajine kefta œuf', st: 'cuisson' }, { q: 3, n: 'Thé menthe', st: 'boissons' }] },
      { id: 'T-7822', table: 'T7', src: 'salle',  cook: 'MM', elapsed: 198, items: [{ q: 1, n: 'Couscous royal', st: 'cuisson' }, { q: 1, n: 'Pastilla poulet', st: 'cuisson' }] },
      { id: 'T-7823', table: 'T2', src: 'salle',  cook: 'AY', elapsed: 632, items: [{ q: 4, n: 'Briouates viande', st: 'cuisson' }, { q: 2, n: 'Caviar d\'aubergine', st: 'salade' }] },
      { id: 'T-7824', table: 'TR2',src: 'terrasse', cook: 'AY', elapsed: 88,  items: [{ q: 2, n: 'Tajine kefta', st: 'cuisson' }, { q: 1, n: 'Salade marocaine', st: 'salade' }, { q: 2, n: 'Orange pressée', st: 'boissons' }] },
      { id: 'G-3412', table: 'GLOVO', src: 'livraison', cook: 'MM', elapsed: 548, items: [{ q: 2, n: 'Tajine kefta œuf', st: 'cuisson' }, { q: 1, n: 'Salade marocaine', st: 'salade' }] },
      { id: 'T-7825', table: 'T9', src: 'salle',  cook: 'AY', elapsed: 944, items: [{ q: 1, n: 'Pastilla poulet', st: 'cuisson' }, { q: 1, n: 'Salade marocaine', st: 'salade' }, { q: 1, n: 'Pâtisseries assorties', st: 'desserts' }] },
      { id: 'Y-8821', table: 'YASSIR', src: 'livraison', cook: 'MM', elapsed: 318, items: [{ q: 3, n: 'Tajine kefta', st: 'cuisson' }] },
      { id: 'T-7826', table: 'TR1', src: 'terrasse', cook: 'AY', elapsed: 42,  items: [{ q: 2, n: 'Briouates viande', st: 'cuisson' }, { q: 1, n: 'Caviar d\'aubergine', st: 'salade' }, { q: 4, n: 'Café double', st: 'boissons' }] },
    ];
    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const cls = (s) => s < 480 ? 'ok' : s < 900 ? 'warn' : 'over';
    const stationLabel = { salade: 'Salade', cuisson: 'Cuisson', boissons: 'Boissons', desserts: 'Desserts' };

    const ticketHtml = (t) => `
      <div class="kds-tk ${cls(t.elapsed)}" data-tk="${t.id}" data-stations="${[...new Set(t.items.map(i => i.st))].join(' ')}">
        <div class="kds-tk-head">
          <div class="kds-tk-id">
            <b>${t.table}</b><span class="kds-tk-src">· ${t.src}</span>
          </div>
          <div class="kds-tk-time mono ${cls(t.elapsed)}">${fmt(t.elapsed)}</div>
        </div>
        <ul class="kds-tk-items">
          ${t.items.map(i => `<li><span class="kds-q mono">×${i.q}</span><span class="kds-it">${i.n}</span><span class="kds-st kds-st-${i.st}">${stationLabel[i.st]}</span></li>`).join('')}
        </ul>
        <div class="kds-tk-foot">
          <span class="kds-tk-cook">Affecté : <b>${t.cook === 'MM' ? 'Mehdi M.' : 'Ayoub Y.'}</b></span>
          <span class="kds-tk-acts">
            <button class="kb ghost xs" data-action="kds-recall" data-id="${t.id}">Rappeler</button>
            <button class="kb atlas xs" data-action="kds-bump" data-id="${t.id}">Bump</button>
          </span>
        </div>
      </div>`;

    const r = drawer({
      title: 'Écran cuisine · KDS',
      subtitle: '8 tickets en préparation · service midi · Mehdi Mansouri (chef)',
      width: 1040,
      body: `
        <div class="p-kpis kds-stat-strip">
          <div class="p-kpi"><div class="l">TICKETS ACTIFS</div><div class="v">8</div><div class="d">3 cuisson · 2 salade · 2 livraison · 1 terrasse</div></div>
          <div class="p-kpi"><div class="l">PRÉP. MOYENNE</div><div class="v">8 min <span class="u">14 s</span></div><div class="d up">SLA 12 min · respecté à 87 %</div></div>
          <div class="p-kpi"><div class="l">STATION CHARGÉE</div><div class="v">Cuisson</div><div class="d">5 tickets en file · 14 plats</div></div>
          <div class="p-kpi"><div class="l">PLAT DU MOMENT</div><div class="v">Tajine kefta</div><div class="d">7 commandes en 30 min</div></div>
        </div>

        <div class="kds-board">
          <div class="kds-main">
            <div class="kds-toolbar">
              <div class="kds-pills" role="tablist">
                <button class="kds-pill on" data-kds-st="all">Tout <span class="mono">8</span></button>
                <button class="kds-pill" data-kds-st="salade">Salade <span class="mono">4</span></button>
                <button class="kds-pill" data-kds-st="cuisson">Cuisson <span class="mono">7</span></button>
                <button class="kds-pill" data-kds-st="boissons">Boissons <span class="mono">3</span></button>
                <button class="kds-pill" data-kds-st="desserts">Desserts <span class="mono">1</span></button>
              </div>
              <div class="kds-tools">
                <button class="kb ghost xs" data-action="kds-fullscreen">Plein écran</button>
                <button class="kb ghost xs" data-action="kds-reassign">Réaffecter cuisinier</button>
              </div>
            </div>

            <div class="kds-grid-tk">
              ${tickets.map(ticketHtml).join('')}
            </div>
          </div>

          <aside class="kds-side">
            <div class="kds-side-head">
              <h5>Notifications cuisine</h5>
              <span class="chip neutral mono">5 nouvelles</span>
            </div>
            <div class="kds-notif warn">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
              <div><b>Ticket T9 dépasse 15 min</b><div class="m">Pastilla en attente cuisson · prévenir Mehdi M.</div></div>
            </div>
            <div class="kds-notif info">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div>
              <div><b>2 tajines kefta encore prévus</b><div class="m">Pré-cuire les œufs · gain estimé 90 s/ticket</div></div>
            </div>
            <div class="kds-notif info">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div>
              <div><b>Coursier Glovo arrivé</b><div class="m">Ticket G-3412 · prêt à récupérer comptoir</div></div>
            </div>
            <div class="kds-notif warn">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
              <div><b>Stock bas · feuilles de brick</b><div class="m">3 portions restantes · 86 le plat ?</div><button class="kds-notif-cta" data-action="kds-86" data-item="Pastilla poulet">86 cet item</button></div>
            </div>
            <div class="kds-notif">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></div>
              <div><b>Sofia (salle) demande</b><div class="m">T4, sans coriandre sur le tajine</div></div>
            </div>

            <div class="kds-side-head" style="margin-top:18px;">
              <h5>Performance cuisinier</h5>
            </div>
            <div class="kds-cook">
              <div class="kds-cook-av">MM</div>
              <div class="kds-cook-info">
                <b>Mehdi Mansouri · chef</b>
                <div class="m">4 tickets actifs · prép. moy. <b>7 min 50 s</b></div>
              </div>
              <span class="chip ok">SLA 92 %</span>
            </div>
            <div class="kds-cook">
              <div class="kds-cook-av b">AY</div>
              <div class="kds-cook-info">
                <b>Ayoub Yacoubi · auxiliaire</b>
                <div class="m">4 tickets actifs · prép. moy. <b>9 min 12 s</b></div>
              </div>
              <span class="chip pend">SLA 79 %</span>
            </div>
          </aside>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Fermer</button>
        <button class="kb ghost" data-action="kds-print-summary">Imprimer récap service</button>
        <button class="kb atlas" data-action="kds-fullscreen">Basculer iPad mural</button>
      `,
    });
    r.el.querySelector('.kiwi-drawer').classList.add('page-xl');
    r.el.querySelector('.kiwi-drawer').style.width = '1040px';

    // Click delegation: filter pills + ticket interactions
    r.el.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-kds-st]');
      if (pill) {
        r.el.querySelectorAll('[data-kds-st]').forEach(p => p.classList.toggle('on', p === pill));
        const k = pill.dataset.kdsSt;
        r.el.querySelectorAll('.kds-tk').forEach(tk => {
          const stations = (tk.dataset.stations || '').split(' ');
          tk.style.display = (k === 'all' || stations.includes(k)) ? '' : 'none';
        });
        return;
      }
      const tk = e.target.closest('.kds-tk');
      if (tk && !e.target.closest('button')) {
        const id = tk.dataset.tk;
        toast(`Ticket ${id} agrandi`, { type: 'info', desc: 'Mode focus · police × 1,4 pour brigade éloignée.' });
      }
    });
  };

  /* Stub handlers used inside the KDS drawer */
  handlers['kds-bump'] = (el) => {
    const id = el?.dataset.id || 'ticket';
    const tk = el?.closest('.kds-tk');
    modal({
      tag: 'CUISINE',
      title: `Bump ticket ${id} ?`,
      desc: 'Le ticket disparaît de l\'écran cuisine. La salle reçoit la notification « plat prêt ».',
      width: 460,
      body: `<div style="display:flex; gap:12px; padding:12px 14px; background:var(--paper-soft); border-radius:10px; font-size:13px; color:var(--n-600); line-height:1.5;">
        <span style="color:var(--atlas);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg></span>
        <div>Sofia (salle) sera notifiée pour récupérer les plats au pass. Action irréversible, utilisez « Rappeler » si besoin.</div>
      </div>`,
      foot: `<button class="kb ghost" data-dismiss-modal>Annuler</button><button class="kb atlas" data-confirm-bump="${id}">Bump ${id}</button>`,
    });
    document.querySelector('[data-confirm-bump]')?.addEventListener('click', () => {
      document.querySelector('.kiwi-backdrop')?.remove();
      if (tk) { tk.style.transition = 'all 280ms'; tk.style.opacity = '0'; tk.style.transform = 'translateX(20px)'; setTimeout(() => tk.remove(), 280); }
      toast(`Ticket ${id} bumpé`, { type: 'success', desc: 'Notification salle envoyée à Sofia · pass · ouvert depuis 4 s.' });
    });
    document.querySelector('[data-dismiss-modal]')?.addEventListener('click', () => document.querySelector('.kiwi-backdrop')?.remove());
  };
  handlers['kds-recall'] = (el) => {
    const id = el?.dataset.id || 'ticket';
    toast(`Ticket ${id} rappelé en cuisine`, { type: 'warn', desc: 'Le ticket revient en haut de la file · cuisinier averti.' });
  };
  handlers['kds-86'] = (el) => {
    const item = el?.dataset.item || 'plat';
    modal({
      tag: 'STOCK',
      title: `Mettre « ${item} » en 86 ?`,
      desc: 'Le plat devient indisponible sur la caisse et le QR table.',
      width: 480,
      body: `<div style="font-size:13px; color:var(--n-600); line-height:1.5;">Le client en train de commander voit le plat barré. Vous pouvez le réactiver dès que le stock revient.</div>`,
      foot: `<button class="kb ghost" data-dismiss-modal>Annuler</button><button class="kb danger" data-confirm-86>Confirmer le 86</button>`,
    });
    document.querySelector('[data-confirm-86]')?.addEventListener('click', () => {
      document.querySelector('.kiwi-backdrop')?.remove();
      toast(`${item} en 86`, { type: 'success', desc: 'Désactivé sur la caisse et le QR table.' });
    });
    document.querySelector('[data-dismiss-modal]')?.addEventListener('click', () => document.querySelector('.kiwi-backdrop')?.remove());
  };
  handlers['kds-fullscreen'] = () => toast('Mode iPad mural activé', { type: 'info', desc: 'Police × 1,4 · auto-refresh 3 s · interface tactile gants compatible.' });
  handlers['kds-reassign'] = () => toast('Réaffecter ticket', { type: 'info', desc: 'Glissez le ticket vers Mehdi M. ou Ayoub Y. pour transférer.' });
  handlers['kds-print-summary'] = () => toast('Récap service midi imprimé', { type: 'success', desc: '47 plats servis · prép. moy. 8 min 14 s · 3 retours cuisine.' });
})();

/* ═══ Section 2 boutique A · inventory / categories ═══ */
(function() {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE vertical · Maison Mansour, Gueliz · S2 sidebar handlers
 *  - nav-inventory     · Inventaire produits (1040 wide, dense SKU grid)
 *  - nav-categories    · Catégories (920 wide, hierarchical tree + tags + toggles)
 * Auxiliary handlers route every button: toasts, modals, nested drawers,
 * filter-pill delegation, color-tag pickers, bulk-CSV, add/edit forms, archive
 * confirmations.
 * ─────────────────────────────────────────────────────────────────────────── */


/* ─── shared inline SVG icons ─── */
const _ICN = {
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
  scan:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 012-2h2M21 7V5a2 2 0 00-2-2h-2M3 17v2a2 2 0 002 2h2M21 17v2a2 2 0 01-2 2h-2M7 8v8M11 8v8M15 8v8M19 8v8"/></svg>',
  upload: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  // Same tray as `upload`, arrow reversed — the file comes IN (import).
  download: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  plus:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  edit:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  copy:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  arch:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8M10 12h4"/></svg>',
  up:     '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 15l-6-6-6 6"/></svg>',
  down:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>',
  more:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="6" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18" r="1.4"/></svg>',
  trash:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>',
  merge:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3l4 4 4-4M12 7v8M5 21l7-7 7 7"/></svg>',
  eye:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>',
};

/* ─── French money formatter ─── */
const _mad = (n) => n.toLocaleString('fr-FR', {minimumFractionDigits: 0, maximumFractionDigits: 0}).replace(/,/g, ' ');
const _mad2 = (n) => n.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2}).replace(/,/g, ' ').replace(/ /g, ' ');

/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE vertical · Maison Mansour, Gueliz · S2 sidebar handlers
 *  - nav-inventory   · Inventaire produits — LIVE, backed by the shared catalog
 *  - nav-categories  · Catégories — real create / rename / recolour / delete
 *
 * Both pages read/write window.KiwiBoutiqueCatalog — the SAME product database
 * the caisse (PIN 0002) creates products into — and render real scannable
 * barcodes via window.KiwiBarcode. Every edit persists (localStorage) and both
 * surfaces stay in sync (subscribe() same-page + the native `storage` event
 * cross-tab). A variant = product × colour × size is the atomic barcoded unit.
 * ─────────────────────────────────────────────────────────────────────────── */
const CAT = () => window.KiwiBoutiqueCatalog;
const BC  = () => window.KiwiBarcode;
const _bqxReady = () => !!(window.KiwiBoutiqueCatalog && window.KiwiBarcode);

const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _TAGHEX = { atlas: '#0B6E4F', riad: '#053B2C', mint: '#7DF2B0', warn: '#D99A2B', danger: '#9B2F22', info: '#3D6B8C' };
const _TAGS = [
  { id: 'atlas', hex: '#0B6E4F', name: 'Atlas' }, { id: 'riad', hex: '#053B2C', name: 'Riad' },
  { id: 'mint', hex: '#7DF2B0', name: 'Menthe' }, { id: 'warn', hex: '#D99A2B', name: 'Safran' },
  { id: 'danger', hex: '#9B2F22', name: 'Carmin' }, { id: 'info', hex: '#3D6B8C', name: 'Indigo' },
];

let _bqxFilter = 'all';
let _bqxColorFilter = '';
let _bqxQuery = '';
let _bqxDrawerPid = null;
let _bqxModal = null;
let _bqxSubbed = false;

/* one-time styles for the variant matrix, barcode chips and category rows */
function _bqxCss() {
  if (window.KiwiColors) window.KiwiColors.injectCss();
  if (document.getElementById('bqx-css')) return;
  const st = document.createElement('style');
  st.id = 'bqx-css';
  st.textContent = `
    .bqx-vwrap { margin-top: 10px; border: 1px solid var(--line, #e7e3da); border-radius: 12px; overflow: hidden; }
    .bqx-vtable { width: 100%; border-collapse: collapse; font-size: 13px; }
    .bqx-vtable th { text-align: left; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--n-500, #77807b); padding: 8px 10px; background: var(--paper-soft, #f3f1ea); }
    .bqx-vtable td { padding: 9px 10px; border-top: 1px solid var(--line, #eee); vertical-align: middle; }
    /* Les pastilles elles-mêmes viennent de color-palette.js (.kc-sw) — un seul
       dessin pour le tableau de bord et la caisse. Ici : ce qui les entoure. */
    .bqx-cbtn { display: inline-flex; align-items: center; gap: 7px; background: none; border: 0; padding: 3px 5px; margin: -3px -5px; border-radius: 8px; font: inherit; color: inherit; cursor: pointer; }
    .bqx-cbtn:hover { background: var(--paper-soft, #f3f1ea); }
    .bqx-cbtn:focus-visible { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: 1px; }
    /* Famille sur une ligne, nuance d'origine dessous et alignée sous le mot :
       la colonne reste lisible même quand deux variantes affichent « Bleu ». */
    .bqx-ccell { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
    .bqx-ccell .bqx-cbtn span { white-space: nowrap; }
    .bqx-csrc { font-style: normal; font-size: 11px; color: var(--n-500, #77807b); margin-left: 24px; white-space: nowrap; }
    .bqx-card-cols { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 2px 0 1px; min-height: 16px; }
    .bqx-card-cols em { font-style: normal; font-size: 10.5px; color: var(--n-500, #77807b); }
    .bqx-cfilter { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin: 2px 0 6px; }
    .bqx-cfilter-l { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--n-500, #77807b); margin-right: 2px; }
    /* Sélectionné dans le filtre = anneau + coche, jamais la couleur seule. */
    .bqx-cfilter .kc-sw.is-on { box-shadow: 0 0 0 2px var(--paper, #F7F5F0), 0 0 0 4px var(--atlas, #0B6E4F); transform: scale(1.06); }
    html[data-theme="dark"] .bqx-cfilter .kc-sw.is-on { box-shadow: 0 0 0 2px var(--paper, #0f1512), 0 0 0 4px var(--mint, #7DF2B0); }
    .bqx-cfilter .kc-sw.is-on::after { content: ''; position: absolute; left: 50%; top: 50%; width: 30%; height: 55%; margin: -32% 0 0 -15%; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(42deg); }
    .bqx-cfilter .kc-sw.is-on.is-light::after { border-color: #0A0F0D; }
    .bqx-stk { display: inline-flex; align-items: center; gap: 5px; }
    .bqx-stk input { width: 46px; text-align: center; font-family: var(--mono, monospace); font-size: 13px; padding: 4px; border: 1px solid var(--line, #ddd); border-radius: 7px; background: var(--paper, #fff); color: var(--ink, #0A0F0D); }
    .bqx-stk button { width: 24px; height: 24px; border-radius: 7px; border: 1px solid var(--line, #ddd); background: var(--paper, #fff); cursor: pointer; font-size: 15px; line-height: 1; color: var(--ink, #0A0F0D); }
    .bqx-stk button:hover { background: var(--paper-soft, #f3f1ea); }
    .bqx-bc { display: flex; align-items: center; gap: 9px; }
    .bqx-bc svg { display: block; }
    .bqx-bc-code { font-family: var(--mono, monospace); font-size: 11px; color: var(--n-600, #555); white-space: nowrap; }
    .bqx-badge { font-size: 9px; padding: 1px 6px; border-radius: 6px; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
    .bqx-badge.gen { background: rgba(11,110,79,.12); color: #0B6E4F; }
    .bqx-badge.imp { background: rgba(217,154,43,.16); color: #8A6210; }
    .bqx-vact { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
    .bqx-nocode { color: var(--n-500, #99a); font-size: 12px; }
    .bqx-cat-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--line, #e7e3da); border-radius: 12px; margin-bottom: 8px; background: var(--paper, #fff); }
    .bqx-cat-bar { width: 5px; align-self: stretch; border-radius: 3px; min-height: 34px; }
    .bqx-cat-info { flex: 1; min-width: 0; }
    .bqx-cat-info .n { font-weight: 600; font-size: 14px; }
    .bqx-cat-info .m { font-size: 12px; color: var(--n-500, #77807b); margin-top: 2px; }
    .bqx-cat-sw { display: flex; gap: 5px; }
    .bqx-cat-sw button { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
    .bqx-cat-sw button.on { border-color: var(--ink, #0A0F0D); }
    .bqx-price-tag { font-family: var(--mono, monospace); }
  `;
  document.head.appendChild(st);
}

function _bqxSubscribe() {
  if (_bqxSubbed || !_bqxReady()) return;
  _bqxSubbed = true;
  CAT().subscribe(() => {
    const nav = document.querySelector('.sidebar nav a.active');
    const navKey = nav && nav.getAttribute('data-nav');
    const drawerOpen = document.querySelector('.kiwi-drawer-backdrop');
    if (!drawerOpen) {
      if (navKey === 'inventory') _renderInventory();
      else if (navKey === 'categories') _renderCategories();
    }
    _bqxRefreshDrawer();
  });
}

/* ─────────────────────────── colours / options helpers ───────────────────────────
   La couleur se choisit à la pastille, jamais dans une liste de noms : une liste
   déroulante de nuances oblige à lire treize mots pour retrouver le bleu, alors
   que l'œil le trouve seul. Le sélecteur, son état sélectionné, sa navigation au
   clavier et son libellé au survol viennent tous de assets/color-palette.js —
   les mêmes qu'en caisse, à la pastille près. */
function _colorPicker(sel, opts) {
  const k = window.KiwiColors;
  if (!k) return '';
  return k.picker('bqx-color', sel, Object.assign({ optional: true, label: 'Couleur' }, opts || {}));
}
/* La famille qu'une variante affiche, tolérante à un enregistrement écrit avant
   la normalisation (copie serveur d'un ancien build). */
function _bqxFam(v) {
  if (!v) return 'gris';
  if (v.colorFamily) return v.colorFamily;
  const k = window.KiwiColors;
  return k ? k.familyId(v.colorId, v.colorLabel, v.colorHex) : 'gris';
}
/* Ce qui distingue deux variantes tombant dans la même famille : la précision
   saisie par le commerçant, sinon la nuance d'origine. */
function _bqxVarNote(v) { return (v && (v.note || v.colorSource)) || ''; }
function _catOptions(sel, includeNone) {
  const none = includeNone ? `<option value="">— Sans catégorie</option>` : '';
  return none + CAT().listCategories().map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${_esc(c.name)}</option>`).join('');
}
function _kindOptions(sel) {
  const k = [['taille', 'Vêtement (tailles S-XL)'], ['pointure', 'Chaussure (pointures)'], ['tu', 'Taille unique']];
  return k.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. INVENTAIRE PRODUITS
 * ─────────────────────────────────────────────────────────────────────────── */
function _bqxGridHtml() {
  let products = CAT().listProducts({ categoryId: _bqxFilter, q: _bqxQuery });
  // Filtrer par couleur, c'est filtrer par FAMILLE : on cherche « du bleu », pas
  // « du bleu nuit ». Une variante marine et une variante turquoise répondent
  // toutes les deux, et restent malgré tout deux articles distincts.
  if (_bqxColorFilter) products = products.filter((p) => (CAT().getProduct(p.id).families || []).includes(_bqxColorFilter));
  if (!products.length) {
    return `<div class="kx-foot-hint"><div class="lh">Aucun produit</div><div class="rh">${
      _bqxColorFilter ? 'Aucun article de cette couleur. Touchez la pastille à nouveau pour tout revoir.'
        : _bqxQuery ? 'Aucun résultat pour cette recherche.'
        : 'Créez un produit ici, ou depuis la caisse (code 0002) avec la douchette.'}</div></div>`;
  }
  return `<div class="kx-sku-grid">${products.map((p) => {
    const data = CAT().getProduct(p.id);
    const stock = data.stock;
    const cat = data.category;
    const barHex = cat ? (_TAGHEX[cat.color] || '#0B6E4F') : '#9AA09D';
    const isOut = stock === 0, isLow = !isOut && stock <= 5;
    const stockClass = isOut ? 'out' : isLow ? 'low' : '';
    const chip = isOut ? '<span class="chip ref">Rupture</span>' : isLow ? '<span class="chip pend">Stock bas</span>' : '';
    const nBc = data.variants.reduce((s, v) => s + ((v.barcodes && v.barcodes.length) ? 1 : 0), 0);
    return `<div class="kx-sku" data-action="bqx-open" data-arg="${p.id}" style="cursor:pointer;">
      <div class="kx-sku-img" style="background: linear-gradient(135deg, ${barHex}, ${barHex}22);">
        <div class="kx-sku-img-tag">${cat ? _esc(cat.name.charAt(0).toUpperCase()) : '·'}</div>
      </div>
      <div class="kx-sku-body">
        <div class="kx-sku-head"><div class="n">${_esc(p.name)}</div><span class="chip neutral">${cat ? _esc(cat.name) : 'Divers'}</span></div>
        <div class="bqx-card-cols">${(data.colors || []).slice(0, 8).map((c) => (window.KiwiColors ? window.KiwiColors.swatch(c.id) : '')).join('')}${data.colors.length > 8 ? `<em>+${data.colors.length - 8}</em>` : ''}</div>
        <div class="kx-sku-sku mono">${data.sizes.length} taille${data.sizes.length > 1 ? 's' : ''} · ${_bqxN(data.variants.length, 'variante')}</div>
        <div class="kx-sku-row">
          <div class="kx-sku-price mono">${_mad(p.priceMAD)} MAD</div>
          <div class="kx-sku-stock ${stockClass} mono">${stock} en stock</div>
        </div>
        <div class="kx-sku-meta"><span>${nBc}/${data.variants.length} codes-barres</span>${chip ? '<span class="dot"></span>' + chip : ''}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

/* Filtre couleur : uniquement les familles que ce magasin a réellement en rayon.
   C'est ce qui garde « Transparent » hors du chemin tant qu'aucun article ne
   l'utilise, et ce qui évite d'afficher treize pastilles à une boutique qui n'en
   vend que quatre. Rien n'apparaît tant qu'il n'y a pas au moins deux couleurs :
   filtrer sur la seule couleur du magasin ne sert à rien. */
function _bqxColorBar(cat) {
  const kc = window.KiwiColors;
  if (!kc || !cat.colorsInUse) return '';
  const used = cat.colorsInUse();
  if (used.length < 2) return '';
  return `<div class="bqx-cfilter" role="group" aria-label="Filtrer par couleur">
    <span class="bqx-cfilter-l">Couleur</span>
    ${used.map((c) => {
      const on = _bqxColorFilter === c.id;
      return `<button class="kc-sw${c.light ? ' is-light' : ''}${on ? ' is-on' : ''}" ${c.pattern ? `data-kc-pattern="${c.pattern}"` : ''} `
        + `style="${c.pattern ? '' : `background-color:${c.hex};`}" data-action="bqx-cfilter" data-arg="${c.id}" `
        + `role="button" aria-pressed="${on ? 'true' : 'false'}" title="${_esc(c.label)}" aria-label="${_esc(c.label)}"></button>`;
    }).join('')}
    ${_bqxColorFilter ? `<button class="kb ghost xs" data-action="bqx-cfilter" data-arg="">Tout voir</button>` : ''}
  </div>`;
}

/* the boutique inventory follows the dashboard's active venue, so every boutique
   (Maison Mansour or any future store) gets its OWN catalogue automatically. */
/* One brain: a REAL merchant keys its catalogue by its MERCHANT SLUG — the identity
   spine mirrored byte-for-byte across dashboard/caisse/D1 (see caisse-link.js) — so the
   dashboard and the paired caisse read/write the SAME inventory. Venue ids ('own' /
   custom / cafeAtlas) are timing-dependent and diverge between the two surfaces; the
   slug never does. Demo (localhost, not signed in) keeps the venue id so the pitch
   catalogue still shows. */
function _bqxSlug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
}
/* One-time carry-over. Until now the catalogue key was slugged from the ACCOUNT
 * name; it is now slugged from the STORE name. For the common case (one store,
 * named like the account) the two are identical and nothing happens. Where they
 * differ, the merchant's existing stock lives under the old key — adopt it
 * rather than showing them an empty inventory. Copy, never move: the old key is
 * left untouched so nothing is destroyed if this is wrong. */
var _bqxAdopted = {};
/* Every slug the catalogue could have been filed under before it was keyed by
 * store. Order does not matter — each is tried and only a non-empty catalogue is
 * taken. kiwiLiveMerchant is checked both as it stands (live-link may not have
 * repointed it, or may be off entirely) and as it stood before it did
 * (kiwiLiveMerchantPrev), so this never depends on script load order. */
function _bqxLegacyPins() {
  var out = [];
  try {
    ['kiwiLiveMerchantPrev', 'kiwiLiveMerchant'].forEach(function (k) {
      var v = localStorage.getItem(k); if (v) out.push(v);
    });
  } catch (_) {}
  return out;
}
/* Only carry over when the account has exactly ONE store. With two, there is no
 * way to tell which of them the account-keyed data belonged to, and guessing
 * would drop the boutique's stock into the restaurant. One store is the upgrade
 * path this exists for; anything else is left alone. */
function _bqxSoleStore() {
  try {
    var a = JSON.parse(localStorage.getItem('kiwiCustomVenues') || '[]');
    return Array.isArray(a) && a.length === 1;
  } catch (_) { return false; }
}
function _bqxHasStock(raw) {
  try { var d = JSON.parse(raw || 'null'); return !!(d && d.products && d.products.length); } catch (_) { return false; }
}
function _bqxAdoptLegacy(slug, legacySlug) {
  if (!slug || _bqxAdopted[slug]) return;
  _bqxAdopted[slug] = 1;
  if (!_bqxSoleStore()) return;
  try {
    var pre = 'kiwiBoutiqueCatalog:v1:';
    // A BLANK record does not count as "already has its own" — opening the page
    // once materialises an empty catalogue, which would otherwise permanently
    // block the carry-over for a merchant who had stock under the old key.
    if (_bqxHasStock(localStorage.getItem(pre + slug))) return;
    var cands = [legacySlug].concat(_bqxLegacyPins());
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c || c === slug) continue;
      var old = localStorage.getItem(pre + c);
      if (!_bqxHasStock(old)) continue;                   // nothing worth carrying
      localStorage.setItem(pre + slug, old);
      var seq = localStorage.getItem('kiwiBarcodeSeq:' + c);
      if (seq && !localStorage.getItem('kiwiBarcodeSeq:' + slug)) localStorage.setItem('kiwiBarcodeSeq:' + slug, seq);
      return;
    }
  } catch (_) {}
}
function _bqxVenue() {
  try {
    if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) {
      // Canonical key = slugMerchant(store name) — the SAME slug the caisse's
      // paired venue carries (functions/api/pair/create.js) and clients-store
      // uses, so a product added on either surface lands under ONE key and
      // inventory syncs across devices.
      //
      // It must be the STORE's name, not the account's. KiwiMe.business is a
      // single account-level name, so on an account with two shops both would
      // share one inventory — and worse, the till keys off its paired venue
      // (pos-boutique.js `_bqPv.merchant`), so for any store whose name differs
      // from the account name the two ends silently disagreed: stock scanned in
      // at the register never appeared on the dashboard. Identity is only the
      // fallback, for an account that has no store record yet.
      //
      // Et c'est le slug GRAVÉ du magasin (venues.js › slugOf), pas une
      // re-slugification de son nom : le nom se corrige, et un inventaire qui
      // change de clé parce qu'on a ajouté un accent à l'enseigne est un
      // inventaire perdu.
      var vd = (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {};
      var biz = (window.KiwiMe && window.KiwiMe.business) || '';
      if (vd.custom && vd.name) {
        var slug = vd.slug || _bqxSlug(vd.name);
        _bqxAdoptLegacy(slug, biz && _bqxSlug(biz));
        return slug;
      }
      if (biz) return _bqxSlug(biz);
      if (vd.name) return _bqxSlug(vd.name);
    }
  } catch (_) {}
  return (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || 'maisonMansour';
}

/* Exposé pour les autres surfaces du tableau de bord — dateRange.js relit le
 * coût matière du catalogue pour calculer le bénéfice brut de l'accueil. La
 * règle de clé, et l'adoption des clés héritées qu'elle déclenche, ne doit
 * exister qu'ici : une deuxième copie dériverait tôt ou tard de celle-ci, et
 * les deux surfaces liraient alors deux inventaires différents. */
window.KiwiBoutiqueVenueKey = _bqxVenue;
/* Ce fichier s'exécute APRÈS dateRange.js, dont le premier rendu est déjà passé
 * sans la clé. On le prévient une fois pour qu'il rejoue sa bande de KPI. */
try { window.dispatchEvent(new Event('kiwi-catalog-key')); } catch (_) {}

/* Display name for a modal eyebrow — the store's OWN name. Identity first (it is
 * what the merchant signed up as), then the venue label, then a neutral word.
 * In the demo KiwiMe is absent and the venue IS Maison Mansour, so the demo tag
 * is unchanged. */
function _bqxTag() {
  try {
    // The STORE being looked at, not the account that owns it — otherwise both
    // shops on one account are labelled with the same name.
    var vd = (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {};
    if (vd.custom && vd.name) return String(vd.name).toUpperCase();
    var biz = (window.KiwiMe && window.KiwiMe.business) || '';
    if (biz) return String(biz).toUpperCase();
    if (vd.name) return String(vd.name).toUpperCase();
  } catch (_) {}
  return 'BOUTIQUE';
}

/* fr pluralisation for the boutique counters — "1 produit", "2 produits". */
function _bqxN(n, one, many) { return n + ' ' + (Math.abs(n) === 1 ? one : (many || one + 's')); }

/* Base d'affichage de « VALEUR DE STOCK ». Une boutique RÉELLE voit ce que sa
   marchandise a COÛTÉ — le seul chiffre exploitable en compta, en assurance ou
   pour un besoin en fonds de roulement — avec le potentiel de vente rappelé en
   dessous. La démo de présentation garde son chiffre au prix de vente, inchangé.
   `costed` vaut 0 quand aucun produit n'a de coût saisi : la base coût est alors
   un repli sur le prix, on ne promet donc pas un potentiel qui serait le même
   nombre affiché deux fois. */
function _bqxStockKPI(st) {
  const real = !!(window.KiwiVenue?.isCustom?.() || window.KiwiEnv?.isReal?.());
  if (!real) return { amount: st.stockValue, note: '' };
  return {
    amount: st.stockCost,
    note: st.costed ? ` · potentiel ${_mad(st.stockValue)} MAD` : '',
  };
}

function _renderInventory() {
  const cat = CAT();
  cat.use(_bqxVenue());
  const st = cat.stats();
  const cats = cat.listCategories();
  window.Kiwi.appPage('inventory', {
    title: 'Inventaire produits',
    subtitle: `${((window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {}).fullDisplay || 'Boutique'} · ${_bqxN(st.products, 'produit')} · ${_bqxN(st.variants, 'variante')} · base partagée avec la caisse`,
    body: `
      <div class="kx-kpi-strip">
        <div class="kx-kpi"><div class="l">PRODUITS</div><div class="v">${st.products}<span class="u">/ ${st.variants} var.</span></div><div class="d">${st.ruptures} en rupture</div></div>
        <div class="kx-kpi"><div class="l">VALEUR DE STOCK</div><div class="v">${_mad(_bqxStockKPI(st).amount)}<span class="u">MAD</span></div><div class="d">${st.totalStock} pièces${_bqxStockKPI(st).note}</div></div>
        <div class="kx-kpi ${st.low ? 'warn' : ''}"><div class="l">STOCK BAS / RUPTURES</div><div class="v">${st.low}<span class="u">+ ${st.ruptures}</span></div><div class="d">Seuil ≤ 5 unités</div></div>
        <div class="kx-kpi"><div class="l">CATÉGORIES</div><div class="v">${st.categories}</div><div class="d">Créer / supprimer côté Catégories</div></div>
      </div>

      <div class="p-toolbar" style="margin-top: 4px;">
        <div class="p-search" style="flex:1;"><span style="display:inline-flex;align-items:center;">${_ICN.search}</span>
          <input data-bqx-search placeholder="Rechercher produit, catégorie, code-barres…" value="${_esc(_bqxQuery)}" style="border:none;background:transparent;outline:none;margin-left:6px;font:inherit;color:inherit;flex:1;min-width:120px;" /></div>
        <button class="kb ghost" data-action="bqx-import">${_ICN.download}Importer CSV</button>
        <button class="kb ghost" data-action="bqx-export">${_ICN.upload}Exporter CSV</button>
        ${_orderProOn() ? `<button class="kb ghost" data-action="orderpro-tags">Tags NFC</button>` : ''}
        <button class="kb primary" data-action="bqx-new">${_ICN.plus}Nouveau produit</button>
      </div>

      <div class="kx-pills" data-pill-group="bqx-cat">
        <button class="kx-pill ${_bqxFilter === 'all' ? 'on' : ''}" data-action="bqx-filter" data-arg="all">Tous <span class="ct">${st.products}</span></button>
        ${cats.map((c) => `<button class="kx-pill ${_bqxFilter === c.id ? 'on' : ''}" data-action="bqx-filter" data-arg="${c.id}">${_esc(c.name)} <span class="ct">${cat.categoryCount(c.id)}</span></button>`).join('')}
      </div>

      ${_bqxColorBar(cat)}

      <div id="bqx-grid">${_bqxGridHtml()}</div>

      <div class="kx-foot-hint">
        <div class="lh">Astuce</div>
        <div class="rh">Cliquez un produit pour ouvrir sa matrice couleur × taille : stock par variante, génération et impression d'étiquettes EAN-13, ou enregistrement d'un ancien code-barres.</div>
      </div>
    `,
  });
  /* live search — re-render only the grid so the field keeps focus */
  setTimeout(() => {
    const s = document.querySelector('.dash-genpage [data-bqx-search]');
    if (s) s.addEventListener('input', () => {
      _bqxQuery = s.value.trim();
      const g = document.getElementById('bqx-grid');
      if (g) g.innerHTML = _bqxGridHtml();
    });
  }, 0);
}

handlers['nav-inventory'] = () => {
  if (!_bqxReady()) { toast('Module inventaire indisponible', { desc: 'Les moteurs catalogue/code-barres ne sont pas chargés.', type: 'warn' }); return; }
  _bqxCss(); _bqxSubscribe(); _renderInventory();
};

handlers['bqx-filter'] = (_el, arg) => { _bqxFilter = arg || 'all'; _renderInventory(); };
/* Une pastille déjà active se désactive : c'est le geste attendu d'un filtre à
   choix unique, et ça évite d'ajouter un bouton « tout » de plus. */
handlers['bqx-cfilter'] = (_el, arg) => {
  _bqxColorFilter = (_bqxColorFilter === arg) ? '' : (arg || '');
  _renderInventory();
};
/* The way IN — a shop arriving from another till brings its article file rather
 * than retyping it. assets/catalog-import.js owns the parsing, the preview and
 * the writes; the page only re-renders once the merchant has confirmed. */
handlers['bqx-import'] = () => {
  if (!window.KiwiCatalogImport) {
    toast('Import indisponible', { desc: 'Le module d\'import n\'est pas chargé, rechargez la page.', type: 'warn' });
    return;
  }
  window.KiwiCatalogImport.openBoutique({ onDone: () => _renderInventory() });
};
handlers['bqx-export'] = () => {
  try {
    const csv = CAT().exportCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const _vd = (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {};
    const _slug = String(_vd.name || (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || 'inventaire')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'inventaire';
    a.href = URL.createObjectURL(blob); a.download = `inventaire-${_slug}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    toast('Inventaire exporté', { desc: 'Fichier CSV téléchargé (produit, couleur, taille, stock, code-barres).', type: 'success' });
  } catch (e) { toast('Export impossible', { type: 'warn' }); }
};

/* ─── product detail drawer (the variant matrix) ─── */
function _variantRow(v, kind) {
  const primary = (v.barcodes || []).find((b) => b.primary) || (v.barcodes || [])[0];
  let bcCell;
  if (primary) {
    const svg = BC().svg(primary.code, { height: 26, module: 1.1, showText: false });
    const badge = primary.type === 'imported' ? '<span class="bqx-badge imp">importé</span>' : '<span class="bqx-badge gen">généré</span>';
    bcCell = `<div class="bqx-bc">${svg}<span><span class="bqx-bc-code">${_esc(primary.code)}</span> ${badge}</span></div>`;
  } else {
    bcCell = `<span class="bqx-nocode">aucun code</span>`;
  }
  const genOrPrint = primary
    ? `<button class="kb ghost xs" data-action="bqx-var-print" data-arg="${v.id}" title="Imprimer l'étiquette">${_ICN.upload}Étiquette</button>`
    : `<button class="kb ghost xs" data-action="bqx-var-gen" data-arg="${v.id}" title="Générer un EAN-13">${_ICN.scan}Générer</button>`;
  const fam = _bqxFam(v);
  const note = _bqxVarNote(v);
  const kc = window.KiwiColors;
  return `<tr>
    <td><div class="bqx-ccell">
      <button class="bqx-cbtn" data-action="bqx-var-color" data-arg="${v.id}" title="Changer la couleur">
        ${kc ? kc.swatch(fam) : ''}<span>${_esc(kc ? kc.label(fam) : v.colorLabel)}</span></button>
      ${note ? `<em class="bqx-csrc">${_esc(note)}</em>` : ''}</div></td>
    <td class="mono">${_esc(v.size)}</td>
    <td><span class="bqx-stk">
      <button data-action="bqx-var-dec" data-arg="${v.id}" aria-label="−1">−</button>
      <input type="number" min="0" value="${v.stock}" data-var-stock="${v.id}" />
      <button data-action="bqx-var-inc" data-arg="${v.id}" aria-label="+1">+</button>
    </span></td>
    <td>${bcCell}</td>
    <td><div class="bqx-vact">
      ${genOrPrint}
      <button class="kb ghost xs" data-action="bqx-var-reg" data-arg="${v.id}" title="Enregistrer un code existant">${_ICN.copy}Code existant</button>
      <button class="kb ghost xs danger-text" data-action="bqx-var-del" data-arg="${v.id}" title="Supprimer la variante">${_ICN.trash}</button>
    </div></td>
  </tr>`;
}

function _bqxProductBody(pid) {
  const data = CAT().getProduct(pid);
  if (!data) return '<p>Produit introuvable.</p>';
  const p = data.product;
  /* « Marge 100 % » était le sort réservé à tout produit dont le prix d'achat
   * n'était pas saisi : `(p.cost || 0)` faisait de l'absence un zéro, et un coût
   * nul se lit « tout est bénéfice ». C'est exactement le chiffre inventé qu'on
   * chasse — et il apparaissait par défaut sur CHAQUE produit d'une boutique qui
   * vient d'importer son stock. null ⇒ la ligne dit « prix d'achat manquant »,
   * ce qui est à la fois vrai et actionnable. */
  const cost = +p.cost > 0 ? +p.cost : null;
  const margin = (cost != null && p.priceMAD > 0) ? Math.round((1 - cost / p.priceMAD) * 100) : null;
  const rows = data.variants.length
    ? data.variants.map((v) => _variantRow(v, p.kind)).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--n-500,#99a);padding:18px;">Aucune variante. Ajoutez une couleur × taille ci-dessous.</td></tr>`;
  return `
    <div class="kx-stat-3">
      <div class="stat"><div class="l">PRIX VENTE</div><div class="v bqx-price-tag">${_mad(p.priceMAD)} MAD</div><div class="sub">${margin == null ? 'Prix d’achat manquant' : `Marge ${margin} %`}</div></div>
      <div class="stat"><div class="l">EN STOCK</div><div class="v">${data.stock}</div><div class="sub">${_bqxN(data.variants.length, 'variante')}</div></div>
      <div class="stat"><div class="l">CATÉGORIE</div><div class="v" style="font-size:16px;">${data.category ? _esc(data.category.name) : 'Divers'}</div><div class="sub">${data.colors.length} couleurs</div></div>
    </div>
    <div class="bqx-vwrap">
      <table class="bqx-vtable">
        <thead><tr><th>Couleur</th><th>Taille</th><th>Stock</th><th>Code-barres</th><th style="text-align:right;">Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="kb atlas" data-action="bqx-var-add" data-arg="${pid}">${_ICN.plus}Ajouter une variante</button>
      <button class="kb ghost" data-action="bqx-prod-print" data-arg="${pid}">${_ICN.upload}Imprimer toutes les étiquettes</button>
    </div>`;
}

function _bqxOpenProduct(pid) {
  const data = CAT().getProduct(pid);
  if (!data) { toast('Produit introuvable', { type: 'warn' }); return; }
  _bqxDrawerPid = pid;
  const p = data.product;
  drawer({
    title: p.name,
    subtitle: `${data.category ? data.category.name : 'Sans catégorie'} · ${_mad(p.priceMAD)} MAD · ${data.stock} en stock`,
    width: 640,
    body: _bqxProductBody(pid),
    foot: `
      <button class="kb ghost" data-dismiss>Fermer</button>
      <button class="kb ghost danger-text" data-action="bqx-prod-del" data-arg="${pid}">${_ICN.trash}Supprimer</button>
      <button class="kb atlas" data-action="bqx-prod-edit" data-arg="${pid}">${_ICN.edit}Modifier le produit</button>`,
  });
  _bqxMountDrawer(pid);
  /* re-render the grid behind once the drawer is dismissed */
  const bd = document.querySelector('.kiwi-drawer-backdrop');
  if (bd && window.MutationObserver) {
    const mo = new MutationObserver(() => {
      if (!document.body.contains(bd)) {
        mo.disconnect(); _bqxDrawerPid = null;
        const nav = document.querySelector('.sidebar nav a.active');
        if (nav && nav.getAttribute('data-nav') === 'inventory') _renderInventory();
      }
    });
    mo.observe(document.body, { childList: true });
  }
}

function _bqxMountDrawer(pid) {
  const root = document.querySelector('.kiwi-drawer-backdrop');
  if (!root) return;
  root.querySelectorAll('[data-var-stock]').forEach((inp) => {
    inp.addEventListener('change', () => { CAT().setStock(inp.getAttribute('data-var-stock'), parseInt(inp.value, 10) || 0); });
  });
  if (window.lucide) try { window.lucide.createIcons(); } catch (e) {}
}

function _bqxRefreshDrawer() {
  if (!_bqxDrawerPid) return;
  const back = document.querySelector('.kiwi-drawer-backdrop');
  if (!back) return;
  const body = back.querySelector('.kiwi-drawer-body');
  if (!body) return;
  const data = CAT().getProduct(_bqxDrawerPid);
  if (!data) { return; }
  body.innerHTML = _bqxProductBody(_bqxDrawerPid);
  const sub = back.querySelector('.kiwi-drawer-head p');
  if (sub) sub.textContent = `${data.category ? data.category.name : 'Sans catégorie'} · ${_mad(data.product.priceMAD)} MAD · ${data.stock} en stock`;
  _bqxMountDrawer(_bqxDrawerPid);
}

handlers['bqx-open'] = (_el, arg) => { if (arg) _bqxOpenProduct(arg); };

/* ─── variant actions (all persist via the catalog → subscribe re-renders) ─── */
handlers['bqx-var-inc'] = (_el, arg) => CAT().adjustStock(arg, +1);
handlers['bqx-var-dec'] = (_el, arg) => CAT().adjustStock(arg, -1);
handlers['bqx-var-del'] = (_el, arg) => CAT().deleteVariant(arg);
handlers['bqx-var-gen'] = (_el, arg) => {
  const code = CAT().generateBarcode(arg);
  if (code) toast('EAN-13 généré', { desc: `Code ${code} · imprimez l'étiquette pour l'article.`, type: 'success', duration: 2600 });
};
handlers['bqx-var-print'] = (_el, arg) => _bqxPrintVariant(arg);

function _bqxLabelFor(pid, v) {
  const p = CAT().getProduct(pid).product;
  const code = CAT().primaryBarcode(v);
  if (!code) return null;
  const fmt = BC().isValidEan13(code) ? 'ean13' : 'code128';
  return { title: p.name, sub: `${v.colorLabel} · ${v.size}`, price: _mad(p.priceMAD), code, format: fmt };
}
function _bqxPrintVariant(vid) {
  const cat = CAT();
  const all = cat.listProducts({ includeArchived: true });
  let found = null, pid = null;
  for (const p of all) { const v = cat.listVariants(p.id).find((x) => x.id === vid); if (v) { found = v; pid = p.id; break; } }
  if (!found) return;
  const label = _bqxLabelFor(pid, found);
  if (!label) { toast('Aucun code à imprimer', { desc: 'Générez d\'abord un EAN-13 pour cette variante.', type: 'warn' }); return; }
  _bqxAskCopies((copies) => { BC().printLabels([label], { copies }); });
}
handlers['bqx-prod-print'] = (_el, arg) => {
  const data = CAT().getProduct(arg);
  if (!data) return;
  const labels = data.variants.map((v) => _bqxLabelFor(arg, v)).filter(Boolean);
  if (!labels.length) { toast('Aucun code à imprimer', { desc: 'Générez au moins un EAN-13 pour ce produit.', type: 'warn' }); return; }
  _bqxAskCopies((copies) => { BC().printLabels(labels, { copies }); }, `${labels.length} variante(s) avec code-barres`);
};

function _bqxAskCopies(cb, note) {
  _bqxModal = modal({
    title: 'Imprimer les étiquettes', tag: 'ÉTIQUETTES · IMPRIMANTE',
    desc: note || 'Choisissez le nombre de copies par variante, puis lancez l\'impression.',
    width: 440,
    body: `<div class="kf-group"><label class="kf-label">Copies par variante</label>
      <input class="kf-input" type="number" min="1" value="1" data-bqx-copies /></div>
      <div class="kf-help">L'aperçu d'impression s'ouvre, envoyez-le vers l'imprimante à étiquettes.</div>`,
    foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb atlas" data-action="bqx-print-go">Imprimer</button>`,
  });
  _bqxPrintCb = cb;
}
let _bqxPrintCb = null;
handlers['bqx-print-go'] = () => {
  const n = parseInt(document.querySelector('.kiwi-backdrop [data-bqx-copies]')?.value, 10) || 1;
  if (_bqxModal) _bqxModal.close();
  if (_bqxPrintCb) { const cb = _bqxPrintCb; _bqxPrintCb = null; setTimeout(() => cb(Math.max(1, n)), 120); }
};

/* register an EXISTING barcode onto a variant (old POS code, kept verbatim) */
handlers['bqx-var-reg'] = (_el, arg) => {
  _bqxModal = modal({
    title: 'Enregistrer un code existant', tag: 'ANCIEN CODE-BARRES',
    desc: 'Scannez ou saisissez le code-barres déjà présent sur l\'article. Il est conservé tel quel, aucune réimpression.',
    width: 480,
    body: `<div class="kf-group"><label class="kf-label">Code-barres</label>
      <input class="kf-input mono" placeholder="Scannez ou tapez le code…" data-bqx-regcode autocomplete="off" /></div>
      <div class="kf-help">Le code peut être un EAN-13, UPC, ou tout code de l'ancien système. Il sera rattaché à cette couleur/taille.</div>`,
    foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb atlas" data-action="bqx-var-reg-save" data-arg="${arg}">Enregistrer le code</button>`,
  });
  setTimeout(() => { const i = document.querySelector('.kiwi-backdrop [data-bqx-regcode]'); if (i) i.focus(); }, 60);
};
handlers['bqx-var-reg-save'] = (_el, arg) => {
  const inp = document.querySelector('.kiwi-backdrop [data-bqx-regcode]');
  const raw = inp ? inp.value.trim() : '';
  if (!raw) { toast('Code vide', { type: 'warn' }); return; }
  const res = CAT().attachBarcode(arg, raw);
  if (res.ok) {
    if (_bqxModal) _bqxModal.close();
    toast(res.already ? 'Code déjà rattaché' : 'Code enregistré', { desc: `${raw} rattaché à la variante, scannable en caisse.`, type: 'success', duration: 2600 });
  } else if (res.reason === 'doublon') {
    toast('Code déjà utilisé', { desc: `Ce code est déjà rattaché à ${res.owner.product.name} (${res.owner.variant.colorLabel} · ${res.owner.variant.size}).`, type: 'warn', duration: 3600 });
  } else {
    toast('Enregistrement impossible', { type: 'warn' });
  }
};

/* add a variant (colour × size × stock) */
handlers['bqx-var-add'] = (_el, arg) => {
  const data = CAT().getProduct(arg);
  const kind = data ? data.product.kind : 'taille';
  const presets = CAT().sizePresets(kind);
  _bqxModal = modal({
    title: 'Ajouter une variante', tag: 'COULEUR × TAILLE',
    desc: 'Chaque variante est un article distinct avec son propre code-barres.',
    width: 480,
    body: `
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Couleur</label>${_colorPicker('noir')}</div>
        <div class="kf-group"><label class="kf-label">${kind === 'pointure' ? 'Pointure' : kind === 'tu' ? 'Taille' : 'Taille'}</label>
          <input class="kf-input" list="bqx-sizes" data-bqx-vsize value="${_esc(presets[0] || '')}" />
          <datalist id="bqx-sizes">${presets.map((s) => `<option value="${_esc(s)}">`).join('')}</datalist></div>
      </div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Stock initial</label><input class="kf-input" type="number" min="0" value="0" data-bqx-vstock /></div>
        <div class="kf-group"><label class="kf-label">Code-barres</label><select class="kf-input" data-bqx-vbc><option value="gen">Générer un EAN-13</option><option value="none">Aucun (plus tard)</option></select></div>
      </div>
      <div class="kf-group"><label class="kf-label">Précision (facultatif)</label>
        <input class="kf-input" maxlength="60" data-bqx-vnote placeholder="Ex. rayé, délavé, motif" />
        <div class="kf-help">À remplir seulement si deux variantes partagent la même couleur et doivent rester reconnaissables.</div></div>`,
    foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb atlas" data-action="bqx-var-add-save" data-arg="${arg}">Ajouter</button>`,
  });
};
handlers['bqx-var-add-save'] = (_el, arg) => {
  const b = document.querySelector('.kiwi-backdrop');
  if (!b) return;
  const colorId = (window.KiwiColors && window.KiwiColors.value(b)) || 'noir';
  const size = b.querySelector('[data-bqx-vsize]').value.trim() || 'TU';
  const stock = parseInt(b.querySelector('[data-bqx-vstock]').value, 10) || 0;
  const bc = b.querySelector('[data-bqx-vbc]').value;
  const note = (b.querySelector('[data-bqx-vnote]') || {}).value || '';
  const v = CAT().addVariant({ productId: arg, colorId, size, stock, note: note.trim() });
  if (v && bc === 'gen') CAT().generateBarcode(v.id);
  if (_bqxModal) _bqxModal.close();
  toast('Variante ajoutée', { desc: `${CAT().colorById(colorId)?.label || colorId} · ${size}${bc === 'gen' ? ' · EAN-13 généré' : ''}`, type: 'success', duration: 2400 });
};

/* Recolorer une variante existante. Elle garde son stock, ses codes-barres et
   son identité — deux variantes qui tombent sur la même famille restent deux
   articles distincts tant qu'un humain n'a pas décidé le contraire. */
handlers['bqx-var-color'] = (_el, arg) => {
  const v = (CAT().listVariants(_bqxDrawerPid) || []).find((x) => x.id === arg);
  if (!v) return;
  const data = CAT().getProduct(_bqxDrawerPid);
  _bqxModal = modal({
    title: 'Couleur de la variante', tag: `TAILLE ${_esc(v.size)}`,
    desc: data ? `${data.product.name}${v.colorSource ? ` · saisie à l'origine « ${v.colorSource} »` : ''}` : '',
    width: 460,
    body: `
      <div class="kf-group"><label class="kf-label">Couleur</label>${_colorPicker(_bqxFam(v))}</div>
      <div class="kf-group"><label class="kf-label">Précision (facultatif)</label>
        <input class="kf-input" maxlength="60" value="${_esc(v.note || '')}" data-bqx-vcnote placeholder="Ex. rayé, délavé, motif" />
        <div class="kf-help">Sert à distinguer deux variantes de même couleur. Le sélecteur, lui, reste simple.</div></div>`,
    foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb atlas" data-action="bqx-var-color-save" data-arg="${arg}">Enregistrer</button>`,
  });
};
handlers['bqx-var-color-save'] = (_el, arg) => {
  const b = document.querySelector('.kiwi-backdrop');
  if (!b) return;
  const colorId = window.KiwiColors && window.KiwiColors.value(b);
  const note = (b.querySelector('[data-bqx-vcnote]') || {}).value || '';
  CAT().updateVariant(arg, { colorId: colorId || undefined, note: note.trim() });
  if (_bqxModal) _bqxModal.close();
  toast('Couleur mise à jour', { type: 'success', duration: 2000 });
};

/* Order Pro is a paid add-on and a PUBLIC surface — its entry point only exists
   once an operator switched it on for this merchant. */
function _orderProOn() {
  try { return !!(window.KiwiOrderProPanel && window.KiwiOrderProPanel.enabled()); }
  catch (_) { return false; }
}

/* ── product photo OR video (shown to shoppers on the phone) ─────────────────
   Same deal as a menu item: a garment sells on movement, so a boutique gets a
   clip as well as a still. One medium per product — a video supersedes a photo
   and vice-versa — so the card can never show two competing things.

   Both pickers are always live. Storage is R2 via KiwiOrderPro.uploadMedia and
   we keep the URL only: the catalogue lives in localStorage, where a base64
   image would burn the whole quota in a handful of products. If media storage
   isn't enabled on the account yet the button says so instead of failing mute. */
let _bqxPhoto = '';
let _bqxVideo = '';
function _bqxMediaPreview() {
  if (_bqxVideo) return `<video class="bqx-photo-prev" src="${_esc(_bqxVideo)}" muted playsinline preload="metadata"></video>`;
  if (_bqxPhoto) return `<img class="bqx-photo-prev" src="${_esc(_bqxPhoto)}" alt="" />`;
  return '';
}
function _bqxMediaActions() {
  const has = _bqxPhoto || _bqxVideo;
  return `
    <div class="bqx-photo-actions">
      <button class="kb ghost" type="button" data-bqx-pick="photo" style="padding:8px 12px;font-size:12.5px;">Ajouter une photo</button>
      <button class="kb ghost" type="button" data-bqx-pick="video" style="padding:8px 12px;font-size:12.5px;">Ajouter une vidéo</button>
      ${has ? `<button class="kb ghost" type="button" data-bqx-media-del style="padding:8px 12px;font-size:12.5px;">Retirer</button>` : ''}
    </div>`;
}
/* ── La référence commune ────────────────────────────────────────────────────
 * Ce que le propriétaire pose UNE fois pour dire « le jean de Casa et le jean
 * de Rabat sont le même article ». Les deux magasins tiennent deux catalogues
 * séparés ; sans elle, le seul lien est le code-barres, et une étiquette
 * imprimée par Kiwi ne vaut rien en dehors du magasin qui l'a imprimée.
 *
 * Caché sur un compte à magasin unique : un champ dont l'utilité tient à
 * l'existence d'un second magasin n'a rien à faire sur l'écran de celui qui
 * n'en a qu'un — il ne saurait pas quoi y mettre, et le remplirait au hasard.
 * La valeur DÉJÀ posée reste en base et ressort le jour où il ouvre le second
 * (voir le `undefined` à l'enregistrement). */
function _bqxSkuField(sku) {
  if (_bqxSoleStore()) return '';
  return `
    <div class="kf-group">
      <label class="kf-label">Référence commune (option)</label>
      <input class="kf-input" value="${_esc(sku || '')}" data-bqx-esku
             placeholder="ex. JEAN-501" maxlength="48" />
      <div class="bqx-photo-msg">La même référence dans vos deux établissements, et la caisse saura
        dire « il en reste 3 à l'autre boutique » même si les étiquettes diffèrent.
        Majuscules, tirets et espaces sont ignorés.</div>
    </div>`;
}

function _bqxPhotoField(photo, video) {
  _bqxPhoto = photo || '';
  _bqxVideo = video || '';
  return `
    <div class="kf-group">
      <label class="kf-label">Photo / vidéo (option)</label>
      <div class="bqx-photo" data-bqx-photo-box>${_bqxMediaPreview()}${_bqxMediaActions()}</div>
      <div class="bqx-photo-msg" data-bqx-photo-msg>Visible par vos clients sur le téléphone.</div>
      <input type="file" accept="image/*" data-bqx-photo-input hidden />
      <input type="file" accept="video/*" data-bqx-video-input hidden />
    </div>`;
}
function _bqxWirePhoto(photo, video) {
  _bqxPhoto = photo || '';
  _bqxVideo = video || '';
  const b = document.querySelector('.kiwi-backdrop');
  if (!b) return;
  const box = b.querySelector('[data-bqx-photo-box]');
  const msg = b.querySelector('[data-bqx-photo-msg]');
  const photoInput = b.querySelector('[data-bqx-photo-input]');
  const videoInput = b.querySelector('[data-bqx-video-input]');
  if (!box || !photoInput || !videoInput) return;

  const paint = () => { box.innerHTML = _bqxMediaPreview() + _bqxMediaActions(); };
  box.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-bqx-pick]');
    if (pick) { (pick.dataset.bqxPick === 'video' ? videoInput : photoInput).click(); return; }
    if (e.target.closest('[data-bqx-media-del]')) { _bqxPhoto = ''; _bqxVideo = ''; paint(); return; }
  });

  const upload = async (file, kind) => {
    if (!file) return;
    if (!window.KiwiOrderPro || !window.KiwiOrderPro.uploadMedia) {
      msg.textContent = "Stockage média pas encore activé sur votre compte."; return;
    }
    msg.textContent = 'Envoi…';
    const res = await window.KiwiOrderPro.uploadMedia(file);
    if (!res || !res.ok) {
      msg.textContent = (res && (res.error === 'no-media' || res.error === 'not-configured'))
        ? "Stockage média pas encore activé sur votre compte."
        : (res && res.error === 'too-large') ? 'Fichier trop lourd.'
        : (res && res.error === 'bad-type') ? 'Format non pris en charge.'
        : 'Envoi impossible, réessayez.';
      return;
    }
    if (kind === 'video') { _bqxVideo = res.url; _bqxPhoto = ''; }
    else { _bqxPhoto = res.url; _bqxVideo = ''; }
    msg.textContent = 'Visible par vos clients sur le téléphone.';
    paint();
  };
  photoInput.addEventListener('change', (e) => upload(e.target.files && e.target.files[0], 'photo'));
  videoInput.addEventListener('change', (e) => upload(e.target.files && e.target.files[0], 'video'));
}

/* new product */
handlers['bqx-new'] = () => {
  _bqxModal = modal({
    // The store's OWN name — this modal is reachable by every real boutique, and
    // a hardcoded demo tag put "MAISON MANSOUR" on a real client's screen.
    title: 'Nouveau produit', tag: 'INVENTAIRE · ' + _bqxTag(),
    desc: 'Créez le produit, puis ajoutez ses variantes couleur × taille et leurs codes-barres.',
    width: 520,
    body: `
      <div class="kf-group"><label class="kf-label">Nom du produit</label><input class="kf-input" placeholder="Ex. Caftan brodé main" data-bqx-name /></div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Catégorie</label><select class="kf-input" data-bqx-cat>${_catOptions(_bqxFilter !== 'all' ? _bqxFilter : '', true)}</select></div>
        <div class="kf-group"><label class="kf-label">Type</label><select class="kf-input" data-bqx-kind>${_kindOptions('taille')}</select></div>
      </div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Prix vente (MAD)</label><input class="kf-input" type="number" min="0" placeholder="1890" data-bqx-price /></div>
        <div class="kf-group"><label class="kf-label">Coût d'achat (MAD)</label><input class="kf-input" type="number" min="0" placeholder="optionnel" data-bqx-cost /></div>
      </div>
      ${_bqxPhotoField('', '')}`,
    foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb atlas" data-action="bqx-new-save">Créer le produit</button>`,
  });
  _bqxWirePhoto('', '');
  setTimeout(() => { const i = document.querySelector('.kiwi-backdrop [data-bqx-name]'); if (i) i.focus(); }, 60);
};
handlers['bqx-new-save'] = () => {
  const b = document.querySelector('.kiwi-backdrop');
  if (!b) return;
  const name = b.querySelector('[data-bqx-name]').value.trim();
  if (!name) { toast('Nom requis', { type: 'warn' }); return; }
  const p = CAT().addProduct({
    name, categoryId: b.querySelector('[data-bqx-cat]').value || null,
    kind: b.querySelector('[data-bqx-kind]').value,
    priceMAD: parseInt(b.querySelector('[data-bqx-price]').value, 10) || 0,
    cost: parseInt(b.querySelector('[data-bqx-cost]').value, 10) || 0,
    photo: _bqxPhoto,
    video: _bqxVideo,
  });
  if (_bqxModal) _bqxModal.close();
  toast('Produit créé', { desc: 'Ajoutez maintenant ses variantes couleur × taille.', type: 'success' });
  setTimeout(() => _bqxOpenProduct(p.id), 260);
};

/* edit / delete product */
handlers['bqx-prod-edit'] = (_el, arg) => {
  const data = CAT().getProduct(arg);
  if (!data) return;
  const p = data.product;
  _bqxModal = modal({
    title: 'Modifier le produit', tag: _esc(p.name), width: 520,
    body: `
      <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" value="${_esc(p.name)}" data-bqx-ename /></div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Catégorie</label><select class="kf-input" data-bqx-ecat>${_catOptions(p.categoryId, true)}</select></div>
        <div class="kf-group"><label class="kf-label">Type</label><select class="kf-input" data-bqx-ekind>${_kindOptions(p.kind)}</select></div>
      </div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Prix vente (MAD)</label><input class="kf-input" type="number" min="0" value="${p.priceMAD}" data-bqx-eprice /></div>
        <div class="kf-group"><label class="kf-label">Coût d'achat (MAD)</label><input class="kf-input" type="number" min="0" value="${p.cost || 0}" data-bqx-ecost /></div>
      </div>
      ${_bqxSkuField(p.sku)}
      ${_bqxPhotoField(p.photo, p.video)}`,
    foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb atlas" data-action="bqx-prod-edit-save" data-arg="${arg}">Enregistrer</button>`,
  });
  _bqxWirePhoto(p.photo || '', p.video || '');
};
handlers['bqx-prod-edit-save'] = (_el, arg) => {
  const b = document.querySelector('.kiwi-backdrop');
  if (!b) return;
  CAT().updateProduct(arg, {
    name: b.querySelector('[data-bqx-ename]').value.trim() || undefined,
    categoryId: b.querySelector('[data-bqx-ecat]').value || null,
    kind: b.querySelector('[data-bqx-ekind]').value,
    priceMAD: parseInt(b.querySelector('[data-bqx-eprice]').value, 10) || 0,
    cost: parseInt(b.querySelector('[data-bqx-ecost]').value, 10) || 0,
    photo: _bqxPhoto,
    video: _bqxVideo,
    /* Le champ n'est affiché qu'aux comptes multi-magasins. `undefined` quand il
       est absent, jamais '' : updateProduct ne touche que les clés fournies, et
       envoyer '' effacerait la référence d'un compte qui vient de repasser à un
       seul magasin — puis la perdrait pour de bon à la réouverture du second. */
    sku: (() => { const el = b.querySelector('[data-bqx-esku]'); return el ? el.value : undefined; })(),
  });
  if (_bqxModal) _bqxModal.close();
  toast('Produit mis à jour', { type: 'success', duration: 2000 });
};
handlers['bqx-prod-del'] = (_el, arg) => {
  const data = CAT().getProduct(arg);
  if (!data) return;
  _bqxModal = modal({
    title: 'Supprimer ce produit ?', width: 460,
    desc: `« ${data.product.name} » et ses ${data.variants.length} variantes (codes-barres inclus) seront supprimés définitivement.`,
    body: `<div class="kx-warn-box danger"><div class="hd">Action irréversible</div><ul><li>Le produit disparaît de la caisse et du dashboard.</li><li>Les codes-barres associés sont libérés.</li></ul></div>`,
    foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb danger" data-action="bqx-prod-del-ok" data-arg="${arg}">${_ICN.trash}Supprimer définitivement</button>`,
  });
};
handlers['bqx-prod-del-ok'] = (_el, arg) => {
  CAT().deleteProduct(arg);
  if (_bqxModal) _bqxModal.close();
  const back = document.querySelector('.kiwi-drawer-backdrop');
  if (back && back.__kiwiClose) back.__kiwiClose();
  _bqxDrawerPid = null;
  toast('Produit supprimé', { type: 'warn', duration: 2200 });
  _renderInventory();
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. CATÉGORIES — real create / rename / recolour / delete (with reassign)
 * ─────────────────────────────────────────────────────────────────────────── */
function _renderCategories() {
  const cat = CAT();
  cat.use(_bqxVenue());
  const cats = cat.listCategories();
  const st = cat.stats();
  window.Kiwi.appPage('categories', {
    title: 'Catégories',
    subtitle: `${_bqxN(cats.length, 'catégorie')} · ${_bqxN(st.products, 'produit')} référencé${st.products === 1 ? '' : 's'} · base partagée avec la caisse`,
    body: `
      <div class="kx-kpi-strip cols-3">
        <div class="kx-kpi"><div class="l">CATÉGORIES</div><div class="v">${cats.length}</div><div class="d">Créez / supprimez librement</div></div>
        <div class="kx-kpi"><div class="l">PRODUITS RÉFÉRENCÉS</div><div class="v">${st.products}</div><div class="d">${cat.listProducts({ categoryId: 'all' }).filter((p) => !p.categoryId).length} sans catégorie</div></div>
        <div class="kx-kpi"><div class="l">VALEUR DE STOCK</div><div class="v">${_mad(_bqxStockKPI(st).amount)}<span class="u">MAD</span></div><div class="d">Toutes catégories${_bqxStockKPI(st).note}</div></div>
      </div>

      <div class="p-toolbar" style="margin-top:4px;">
        <div class="p-search" style="flex:1;"><span style="display:inline-flex;align-items:center;">${_ICN.search}</span><span style="margin-left:6px;color:var(--n-500,#77807b);">Organisez vos rayons, couleur, renommage, suppression</span></div>
        <button class="kb primary" data-action="bqx-cat-new">${_ICN.plus}Ajouter une catégorie</button>
      </div>

      <div style="margin-top:12px;">
        ${cats.length ? cats.map((c) => {
          const count = cat.categoryCount(c.id);
          const hex = _TAGHEX[c.color] || '#0B6E4F';
          return `<div class="bqx-cat-row">
            <div class="bqx-cat-bar" style="background:${hex};"></div>
            <div class="bqx-cat-info"><div class="n">${_esc(c.name)}</div><div class="m">${count} produit${count > 1 ? 's' : ''}</div></div>
            <div class="bqx-cat-sw">${_TAGS.map((t) => `<button class="${t.id === c.color ? 'on' : ''}" style="background:${t.hex};" title="${t.name}" data-action="bqx-cat-color" data-arg="${c.id}::${t.id}"></button>`).join('')}</div>
            <div class="kx-tree-actions">
              <button class="kb ghost xs" data-action="bqx-cat-rename" data-arg="${c.id}">${_ICN.edit}</button>
              <button class="kb ghost xs danger-text" data-action="bqx-cat-del" data-arg="${c.id}">${_ICN.trash}</button>
            </div>
          </div>`;
        }).join('') : '<div class="kx-foot-hint"><div class="lh">Aucune catégorie</div><div class="rh">Ajoutez votre premier rayon.</div></div>'}
      </div>

      <div class="kx-foot-hint">
        <div class="lh">Conseil</div>
        <div class="rh">Les couleurs de catégorie apparaissent aussi en caisse (code 0002). Supprimer une catégorie déplace ses produits vers « Sans catégorie » ou une catégorie de votre choix.</div>
      </div>
    `,
  });
}

handlers['nav-categories'] = () => {
  if (!_bqxReady()) { toast('Module catégories indisponible', { type: 'warn' }); return; }
  _bqxCss(); _bqxSubscribe(); _renderCategories();
};

handlers['bqx-cat-new'] = () => {
  _bqxModal = modal({
    title: 'Ajouter une catégorie', tag: 'RAYON', width: 480,
    body: `
      <div class="kf-group"><label class="kf-label">Nom de la catégorie</label><input class="kf-input" placeholder="Ex. Caftans de mariée" data-bqx-cname /></div>
      <div class="kf-group"><label class="kf-label">Couleur</label>
        <div class="bqx-cat-sw" data-bqx-cnewsw>${_TAGS.map((t, i) => `<button class="${i === 0 ? 'on' : ''}" style="background:${t.hex};width:24px;height:24px;" title="${t.name}" data-tone="${t.id}"></button>`).join('')}</div></div>`,
    foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb atlas" data-action="bqx-cat-new-save">Créer la catégorie</button>`,
  });
  setTimeout(() => {
    const sw = document.querySelector('.kiwi-backdrop [data-bqx-cnewsw]');
    if (sw) sw.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => { sw.querySelectorAll('button').forEach((x) => x.classList.remove('on')); btn.classList.add('on'); }));
    const i = document.querySelector('.kiwi-backdrop [data-bqx-cname]'); if (i) i.focus();
  }, 60);
};
handlers['bqx-cat-new-save'] = () => {
  const b = document.querySelector('.kiwi-backdrop');
  if (!b) return;
  const name = b.querySelector('[data-bqx-cname]').value.trim();
  if (!name) { toast('Nom requis', { type: 'warn' }); return; }
  const tone = b.querySelector('[data-bqx-cnewsw] button.on')?.getAttribute('data-tone') || 'atlas';
  CAT().addCategory(name, tone);
  if (_bqxModal) _bqxModal.close();
  toast('Catégorie créée', { desc: `« ${name} » est disponible en caisse et au dashboard.`, type: 'success' });
};
handlers['bqx-cat-color'] = (_el, arg) => {
  const [cid, tone] = String(arg || '').split('::');
  if (cid && tone) CAT().setCategoryColor(cid, tone);
};
handlers['bqx-cat-rename'] = (_el, arg) => {
  const c = CAT().listCategories().find((x) => x.id === arg);
  if (!c) return;
  _bqxModal = modal({
    title: 'Renommer la catégorie', width: 440,
    body: `<div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" value="${_esc(c.name)}" data-bqx-crename /></div>`,
    foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb atlas" data-action="bqx-cat-rename-save" data-arg="${arg}">Enregistrer</button>`,
  });
};
handlers['bqx-cat-rename-save'] = (_el, arg) => {
  const v = document.querySelector('.kiwi-backdrop [data-bqx-crename]')?.value.trim();
  if (!v) { toast('Nom requis', { type: 'warn' }); return; }
  CAT().renameCategory(arg, v);
  if (_bqxModal) _bqxModal.close();
  toast('Catégorie renommée', { type: 'success', duration: 1800 });
};
handlers['bqx-cat-del'] = (_el, arg) => {
  const cat = CAT();
  const c = cat.listCategories().find((x) => x.id === arg);
  if (!c) return;
  const count = cat.categoryCount(arg);
  const others = cat.listCategories().filter((x) => x.id !== arg);
  _bqxModal = modal({
    title: 'Supprimer cette catégorie ?', width: 480,
    desc: `« ${c.name} » contient ${count} produit${count > 1 ? 's' : ''}. Choisissez où les déplacer.`,
    body: `<div class="kf-group"><label class="kf-label">Déplacer les produits vers</label>
      <select class="kf-input" data-bqx-reassign><option value="">— Sans catégorie</option>${others.map((o) => `<option value="${o.id}">${_esc(o.name)}</option>`).join('')}</select></div>
      <div class="kx-warn-box danger"><div class="hd">Suppression</div><ul><li>La catégorie disparaît de la caisse et du dashboard.</li><li>Les produits sont conservés et déplacés, jamais supprimés.</li></ul></div>`,
    foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb danger" data-action="bqx-cat-del-ok" data-arg="${arg}">${_ICN.trash}Supprimer</button>`,
  });
};
handlers['bqx-cat-del-ok'] = (_el, arg) => {
  const reassignTo = document.querySelector('.kiwi-backdrop [data-bqx-reassign]')?.value || null;
  CAT().deleteCategory(arg, { reassignTo });
  if (_bqxModal) _bqxModal.close();
  toast('Catégorie supprimée', { desc: 'Les produits ont été déplacés.', type: 'warn', duration: 2200 });
};
})();

/* ═══ Section 2 boutique B · promos / returns ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Boutique vertical — sidebar handlers (set B)
 * ─────────────────────────────────────────────────────────────────────────── *
 *
 * Two production-grade sidebar handlers wired to the merchant dashboard click
 * delegation router (`Kiwi.handlers[name]`). Designed for the Maison Mansour
 * Gueliz boutique persona.
 *
 *   · `nav-promos`   · Promotions & offres (drawer width 1040)
 *   · `nav-returns`  · Retours & échanges  (drawer width  980)
 *
 * Plus a handful of auxiliary action handlers wired through `data-action`:
 *   · `promo-pause`           · `promo-end`         · `promo-edit`
 *   · `promo-segment`         · `promo-schedule`    · `promo-archive-detail`
 *   · `ret-detail`            · `ret-approve`       · `ret-refuse`
 *   · `ret-exchange`          · `ret-block`         · `ret-policy-save`
 *   · `ret-refund-original`   · `ret-refund-credit` · `ret-refund-whatsapp`
 *
 * Paired CSS lives in `/tmp/kiwi-s2-boutique-spa-css.css` (`.b-promo-*`,
 * `.b-ret-*`, `.kx-toggle`, `.p-grid-*`).
 *
 * Conventions
 *  · Brand only: var(--atlas) / --riad / --mint / --paper-soft.
 *  · French numbers ("1 245,50 MAD"), JetBrains Mono for tabular numerals.
 *  · No emojis in titles or CTAs (per CLAUDE.md §3).
 *  · No new accents — semantic states reuse --success / --warning / --danger.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  if (!window.Kiwi) return;
  const { toast, modal, drawer, handlers } = window.Kiwi;

  /* ═══════════════════ Inline SVG icon set ═══════════════════ */
  const SVG = {
    discount: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
    code:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    bundle:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    tax:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    bell:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    plus:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    pause:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
    edit:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    stop:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    chev:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>',
    box:      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>',
    block:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    check:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x:        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    swap:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
    wa:       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>',
    coin:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9.5c0-1.5 1.5-2 3-2s3 .5 3 2-1 1.8-3 2.5-3 1-3 2.5 1.5 2 3 2 3-.5 3-2"/></svg>',
    flag:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    cal:      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  };

  /* ═══════════════════ Number formatters ═══════════════════ */
  const fmtMAD = (n, dec = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/ | /g, ' ');
  const fmtInt = (n) => n.toLocaleString('fr-FR').replace(/ | /g, ' ');

  /* ═══════════════════ NAV-PROMOS ═══════════════════════════════════════════
   * Promotions & offres pour Maison Mansour Gueliz.
   * Width 1040 — wide-format drawer with active campaigns table, segment chips,
   * KPI summary, schedule wizard CTA and past campaigns archive.
   * ─────────────────────────────────────────────────────────────────────────── */
  handlers['nav-promos'] = () => {
    const active = [
      { id: 'P-2811', name: 'Soldes d\'été −30 %',           type: 'discount', kind: '−30 %',     value: '−30 %',         redem: 312, uplift: '+18,4 %', aov: '+9 %',  expiry: '12 j',   live: true },
      { id: 'P-2812', name: 'Code MAROC10',                  type: 'code',     kind: 'Code',       value: '−10 %',         redem:  87, uplift: '+11,2 %', aov: '+4 %',  expiry: '21 j',   live: true },
      { id: 'P-2813', name: 'Lot 3-pour-2 babouches',        type: 'bundle',   kind: 'Lot',        value: '3 pour 2',      redem:  46, uplift: '+22,8 %', aov: '+31 %', expiry: '6 j',    live: true },
      { id: 'P-2814', name: 'Tax-free Touristes UE',         type: 'tax',      kind: 'Segment',    value: 'TVA −20 %',     redem: 184, uplift: '+34,1 %', aov: '+24 %', expiry: 'Permanent', live: true },
      { id: 'P-2815', name: 'Black Friday avant-première',   type: 'discount', kind: '−25 %',     value: '−25 %',         redem:   0, uplift: '—', aov: '—',     expiry: 'J−18',   scheduled: true },
    ];

    const segments = [
      { id: 'all',     n: 'Tous',                count: '4 102', on: true  },
      { id: 'eu',      n: 'Touristes UE',        count: '892',   on: true  },
      { id: 'us',      n: 'Touristes US',        count: '316',   on: false },
      { id: 'dia',     n: 'Diaspora FR / ES',     count: '244',   on: false },
      { id: 'loyal',   n: 'Clients fidèles',     count: '198',   on: true  },
      { id: 'never',   n: 'Jamais venus',        count: '2 452', on: false },
    ];

    const archive = [
      { name: 'Aïd Adha −20 %',           period: 'Juin 2025',     redem: 421, uplift: '+27,6 %', revenue: '184 320 MAD', verdict: 'Réussite' },
      { name: 'Tax-free Tourists 2025',   period: 'Été 2025',      redem: 612, uplift: '+38,9 %', revenue: '298 470 MAD', verdict: 'Excellent' },
      { name: 'Pre-Ramadan Special',      period: 'Mars 2025',     redem: 188, uplift: '+8,4 %',  revenue: ' 62 940 MAD', verdict: 'Tiède' },
      { name: 'Code DIASPORA12',          period: 'Déc 2024',      redem: 109, uplift: '+14,2 %', revenue: ' 48 105 MAD', verdict: 'Réussite' },
    ];

    const totalRedem = active.reduce((a, c) => a + c.redem, 0);
    const totalUplift = 47820;

    window.Kiwi.appPage('promos', {
      title: 'Promotions',
      subtitle: 'Maison Mansour · Gueliz · 4 campagnes en direct · 1 planifiée',
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, var(--brand-deep), var(--atlas));">
          <div class="l">UPLIFT REVENUE · CAMPAGNES ACTIVES</div>
          <div class="big">+${fmtInt(totalUplift)} <span style="font-size:18px; opacity:0.7;">MAD</span></div>
          <div class="sub">${fmtInt(totalRedem)} échanges aujourd'hui · ${active.filter(a => a.live).length} promos en cours · Tax-free Touristes UE = top performer</div>
        </div>

        <div class="p-grid-3" style="margin-bottom: 18px;">
          <div class="p-card" style="margin-bottom: 0;">
            <div style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase;">UPLIFT TOTAL</div>
            <div style="font-size: 26px; font-weight: 600; font-family: var(--mono); font-feature-settings: 'tnum' 1; margin-top: 4px; letter-spacing: -0.02em;">+${fmtInt(totalUplift)} <span style="font-size: 13px; color: var(--n-500); font-weight: 500;">MAD</span></div>
            <div style="font-size: 12px; color: var(--n-500); margin-top: 4px;">vs panier sans promo · 30 j glissants</div>
          </div>
          <div class="p-card" style="margin-bottom: 0;">
            <div style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase;">ÉCHANGES AUJOURD'HUI</div>
            <div style="font-size: 26px; font-weight: 600; font-family: var(--mono); font-feature-settings: 'tnum' 1; margin-top: 4px; letter-spacing: -0.02em;">${fmtInt(totalRedem)}</div>
            <div style="font-size: 12px; color: var(--n-500); margin-top: 4px;">+${fmtInt(48)} vs hier · 14,8 % du trafic</div>
          </div>
          <div class="p-card" style="margin-bottom: 0;">
            <div style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase;">MEILLEURE CAMPAGNE</div>
            <div style="font-size: 17px; font-weight: 600; margin-top: 4px; letter-spacing: -0.015em;">Tax-free Touristes UE</div>
            <div style="font-size: 12px; color: var(--atlas); margin-top: 4px; font-weight: 500;">+34,1 % uplift · 184 redem.</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; flex-wrap: wrap;">
          <div>
            <div style="font-size: 11px; color: var(--n-500); letter-spacing: 0.1em; font-family: var(--mono); text-transform: uppercase;">CAMPAGNES ACTIVES</div>
            <div style="font-size: 12px; color: var(--n-500); margin-top: 4px;">Cliquez une ligne pour modifier · les chiffres se mettent à jour toutes les 60 s.</div>
          </div>
          <button class="kb atlas" data-action="promo-schedule">${SVG.plus}<span>Planifier une promo</span></button>
        </div>

        <table class="p-table" style="margin-bottom: 22px;">
          <thead>
            <tr>
              <th>NOM</th>
              <th>TYPE</th>
              <th class="right">VALEUR</th>
              <th class="right">REDEMPTIONS</th>
              <th class="right">UPLIFT</th>
              <th class="right">AOV</th>
              <th>EXPIRE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${active.map(p => `
              <tr data-action="promo-edit" data-arg="${p.id}">
                <td>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="width: 28px; height: 28px; border-radius: 8px; background: ${p.scheduled ? 'rgba(217,154,43,0.16)' : 'var(--mint-soft)'}; color: ${p.scheduled ? '#8A6210' : 'var(--atlas)'}; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">${SVG[p.type]}</span>
                    <b style="font-weight: 600;">${p.name}</b>
                  </div>
                </td>
                <td><span class="chip ${p.scheduled ? 'pend' : 'ok'}" style="font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.04em;">${p.kind.toUpperCase()}</span></td>
                <td class="mono right">${p.value}</td>
                <td class="mono right">${p.redem === 0 ? '—' : fmtInt(p.redem)}</td>
                <td class="mono right" style="color: ${p.uplift.startsWith('+') ? 'var(--atlas)' : 'var(--n-500)'}; font-weight: 600;">${p.uplift}</td>
                <td class="mono right" style="color: var(--n-500);">${p.aov}</td>
                <td><span class="chip ${p.expiry === 'Permanent' ? 'neutral' : p.scheduled ? 'pend' : 'ok'}" style="font-family: var(--mono); font-size: 10.5px;">${p.expiry}</span></td>
                <td style="text-align: right;">
                  <button class="kb ghost" style="padding: 5px 10px; font-size: 11.5px;" data-action="${p.scheduled ? 'promo-edit' : 'promo-pause'}" data-arg="${p.id}" data-bubble="stop">
                    ${p.scheduled ? SVG.edit : SVG.pause}
                    ${p.scheduled ? 'Modifier' : 'Pauser'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="p-card" style="margin-bottom: 18px;">
          <div class="head">
            <h4>Cibler par segment client</h4>
            <span class="meta">${segments.filter(s => s.on).length} / ${segments.length} ACTIFS</span>
          </div>
          <div style="font-size: 12.5px; color: var(--n-500); margin: 0 0 12px; line-height: 1.45;">Les promos s'affichent uniquement aux segments cochés. Cliquez pour activer ou désactiver.</div>
          <div class="b-promo-segments">
            ${segments.map(s => `
              <button class="b-promo-seg ${s.on ? 'on' : ''}" data-action="promo-segment" data-arg="${s.id}">
                ${s.on ? SVG.check : ''}
                <span>${s.n}</span>
                <span style="opacity: 0.6; font-family: var(--mono); font-size: 10.5px;">${s.count}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div style="font-size: 11px; color: var(--n-500); letter-spacing: 0.1em; font-family: var(--mono); text-transform: uppercase; margin-bottom: 10px;">ARCHIVE · 12 DERNIERS MOIS</div>
        <table class="p-table" style="margin-bottom: 6px;">
          <thead>
            <tr>
              <th>CAMPAGNE</th>
              <th>PÉRIODE</th>
              <th class="right">REDEMPTIONS</th>
              <th class="right">UPLIFT</th>
              <th class="right">REVENUE</th>
              <th>VERDICT</th>
            </tr>
          </thead>
          <tbody>
            ${archive.map(a => `
              <tr data-action="promo-archive-detail" data-arg="${a.name}">
                <td><b style="font-weight: 600;">${a.name}</b></td>
                <td style="color: var(--n-500); font-size: 12.5px;">${a.period}</td>
                <td class="mono right">${fmtInt(a.redem)}</td>
                <td class="mono right" style="color: var(--atlas); font-weight: 600;">${a.uplift}</td>
                <td class="mono right">${a.revenue}</td>
                <td><span class="chip ${a.verdict === 'Excellent' ? 'ok' : a.verdict === 'Tiède' ? 'neutral' : 'ok'}" style="font-size: 10.5px;">${a.verdict}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `,
    });
  };

  /* ═══════════════════ AUX · promo handlers ═══════════════════════════════ */
  handlers['promo-schedule'] = () => {
    let step = 1;
    const state = { type: '', value: '', audience: 'all', start: '01/05/2026', end: '15/05/2026' };

    const render = () => {
      const stepDots = `<div class="wiz-steps">${[1,2,3,4].map(i => `<div class="wiz-step ${i < step ? 'done' : i === step ? 'active' : ''}"></div>`).join('')}</div>`;
      let body, foot;
      if (step === 1) {
        body = `
          ${stepDots}
          <div style="margin-bottom: 8px; font-size: 14px; font-weight: 500;">Quel type de promotion ?</div>
          <div style="display: grid; gap: 10px;">
            ${[
              ['discount', 'Réduction directe', 'Pourcentage ou montant fixe sur tout le panier ou une catégorie.'],
              ['code',     'Code promo', 'Le client saisit un code à la caisse pour activer la remise.'],
              ['bundle',   'Lot / 3-pour-2', 'Achetez X, payez Y. Idéal pour vider du stock saisonnier.'],
              ['tax',      'Tax-free segment', 'TVA détaxée pour touristes UE/US/CH avec passeport.'],
            ].map(([id, t, d]) => `
              <div class="wiz-choice ${state.type === id ? 'selected' : ''}" data-pick="${id}">
                <div class="wc-ic">${SVG[id]}</div>
                <div><div class="wc-t">${t}</div><div class="wc-d">${d}</div></div>
              </div>
            `).join('')}
          </div>
        `;
        foot = `<button class="kb ghost" data-cancel>Annuler</button><button class="kb atlas" data-next>Suivant ${SVG.chev}</button>`;
      } else if (step === 2) {
        body = `
          ${stepDots}
          <div style="margin-bottom: 14px; font-size: 14px; font-weight: 500;">Quelle valeur ?</div>
          <div class="kf-group">
            <label class="kf-label">Valeur de la remise</label>
            <input class="kf-input" id="promoVal" placeholder="ex. 25 % ou 200 MAD" value="${state.value}"/>
            <div class="kf-help">Saisissez un pourcentage ("25 %") ou un montant fixe ("200 MAD").</div>
          </div>
          <div class="kf-row">
            <div class="kf-group">
              <label class="kf-label">Plancher panier</label>
              <input class="kf-input" placeholder="500 MAD"/>
            </div>
            <div class="kf-group">
              <label class="kf-label">Plafond remise</label>
              <input class="kf-input" placeholder="Aucun"/>
            </div>
          </div>
        `;
        foot = `<button class="kb ghost" data-back>Retour</button><button class="kb atlas" data-next>Suivant ${SVG.chev}</button>`;
      } else if (step === 3) {
        body = `
          ${stepDots}
          <div style="margin-bottom: 14px; font-size: 14px; font-weight: 500;">À qui s'adresse la promo ?</div>
          <div style="display: grid; gap: 8px;">
            ${[
              ['all',   'Tous les clients',     'Visible pour chaque visiteur de la boutique.'],
              ['eu',    'Touristes UE',         'Détectés par carte d\'origine. ~892 visiteurs / mois.'],
              ['us',    'Touristes US',         'Détectés par carte d\'origine. ~316 visiteurs / mois.'],
              ['dia',   'Diaspora FR / ES',      'Clients récurrents avec adresse hors Maroc.'],
              ['loyal', 'Clients fidèles',      '198 clients · 5+ achats sur 12 mois.'],
              ['never', 'Jamais venus',         'Anciens clients sans achat depuis 12+ mois.'],
            ].map(([id, t, d]) => `
              <div class="wiz-choice ${state.audience === id ? 'selected' : ''}" data-aud="${id}">
                <div class="wc-ic">${SVG.bell}</div>
                <div><div class="wc-t">${t}</div><div class="wc-d">${d}</div></div>
              </div>
            `).join('')}
          </div>
        `;
        foot = `<button class="kb ghost" data-back>Retour</button><button class="kb atlas" data-next>Suivant ${SVG.chev}</button>`;
      } else {
        const audLabel = { all: 'Tous les clients', eu: 'Touristes UE', us: 'Touristes US', dia: 'Diaspora FR/ES', loyal: 'Clients fidèles', never: 'Jamais venus' }[state.audience];
        const typLabel = { discount: 'Réduction directe', code: 'Code promo', bundle: 'Lot 3-pour-2', tax: 'Tax-free segment' }[state.type];
        body = `
          ${stepDots}
          <div style="margin-bottom: 14px; font-size: 14px; font-weight: 500;">Période et aperçu</div>
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">Date de début</label><input class="kf-input" value="${state.start}"/></div>
            <div class="kf-group"><label class="kf-label">Date de fin</label><input class="kf-input" value="${state.end}"/></div>
          </div>
          <div style="background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 14px; padding: 18px; margin-top: 10px;">
            <div style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin-bottom: 8px;">APERÇU CAMPAGNE</div>
            <dl class="tx-detail-grid" style="margin: 0;">
              <dt>Type</dt><dd>${typLabel || '—'}</dd>
              <dt>Valeur</dt><dd>${state.value || '—'}</dd>
              <dt>Audience</dt><dd>${audLabel}</dd>
              <dt>Période</dt><dd>${state.start} → ${state.end}</dd>
              <dt>Estim. uplift</dt><dd style="color: var(--atlas);">+12 à +28 % AOV</dd>
            </dl>
          </div>
        `;
        foot = `<button class="kb ghost" data-back>Retour</button><button class="kb atlas" data-go>${SVG.check} Planifier la promo</button>`;
      }
      return { body, foot };
    };

    const open = () => {
      const { body, foot } = render();
      const m = modal({ title: 'Planifier une promotion', desc: 'Boutique Maison Mansour · Gueliz', body, foot, width: 580 });

      m.el.querySelectorAll('[data-pick]').forEach(el => {
        el.onclick = () => { state.type = el.dataset.pick; m.close(); step = 1; setTimeout(open, 220); };
      });
      m.el.querySelectorAll('[data-aud]').forEach(el => {
        el.onclick = () => { state.audience = el.dataset.aud; m.el.querySelectorAll('[data-aud]').forEach(o => o.classList.remove('selected')); el.classList.add('selected'); };
      });
      m.el.querySelector('[data-next]')?.addEventListener('click', () => {
        if (step === 1 && !state.type) { toast('Choisissez d\'abord un type', { type: 'warn', duration: 2200 }); return; }
        if (step === 2) { state.value = m.el.querySelector('#promoVal')?.value || ''; if (!state.value) { toast('Saisissez une valeur', { type: 'warn', duration: 2200 }); return; } }
        step++;
        m.close();
        setTimeout(open, 220);
      });
      m.el.querySelector('[data-back]')?.addEventListener('click', () => { step--; m.close(); setTimeout(open, 220); });
      m.el.querySelector('[data-cancel]')?.addEventListener('click', m.close);
      m.el.querySelector('[data-go]')?.addEventListener('click', () => {
        m.close();
        toast('Promo planifiée · démarre le ' + state.start, { type: 'success', desc: 'Notification envoyée à l\'équipe POS Maison Mansour.', duration: 4000 });
      });
    };
    open();
  };

  handlers['promo-pause'] = (el, id) => {
    modal({
      tag: 'CONFIRMATION',
      title: 'Mettre en pause cette promo ?',
      desc: `Aucun client ne pourra plus l'utiliser tant qu'elle n'est pas réactivée. ID interne : ${id || '—'}.`,
      width: 460,
      foot: `<button class="kb ghost" data-cancel>Annuler</button><button class="kb danger" data-confirm>${SVG.pause} Pauser la promo</button>`,
    }).el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
      if (e.target.closest('[data-confirm]')) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        toast('Promo mise en pause', { type: 'warn', desc: 'Vous pouvez la réactiver à tout moment depuis la liste.', duration: 3500 });
      }
    });
  };

  handlers['promo-end'] = () => toast('Promo clôturée définitivement', { type: 'info', duration: 2800 });

  handlers['promo-edit'] = (_el, id) => toast('Édition · ' + (id || 'campagne'), { type: 'info', desc: 'Les modifications s\'appliquent immédiatement aux prochains paniers.', duration: 2600 });

  handlers['promo-segment'] = (id) => {
    const btn = document.querySelector(`[data-action="promo-segment"][data-arg="${id}"]`);
    if (!btn) return;
    btn.classList.toggle('on');
    const isOn = btn.classList.contains('on');
    const name = btn.querySelector('span')?.textContent || id;
    toast(`Segment "${name}" ${isOn ? 'activé' : 'désactivé'}`, { type: isOn ? 'success' : 'info', duration: 1800 });
  };

  handlers['promo-archive-detail'] = (name) => {
    modal({
      tag: 'ARCHIVE',
      title: name,
      desc: 'Récapitulatif de campagne · ouvert depuis l\'archive.',
      width: 560,
      body: `
        <div class="kx-stat-3">
          <div class="stat"><div class="l">REDEMPTIONS</div><div class="v">421</div><div class="sub">+38 % vs prévu</div></div>
          <div class="stat"><div class="l">UPLIFT</div><div class="v">+27,6 %</div><div class="sub">vs panier baseline</div></div>
          <div class="stat"><div class="l">REVENUE</div><div class="v">184 320</div><div class="sub">MAD bruts</div></div>
        </div>
        <div style="font-size: 13px; color: var(--n-600); line-height: 1.6;">
          La campagne a sur-performé sur les Touristes UE (+34 % AOV) et a sous-performé sur la Diaspora.
          Recommandation : la dupliquer pour Aïd 2026 en ciblant uniquement Touristes UE + Clients fidèles.
        </div>
      `,
      foot: `<button class="kb ghost" data-cancel>Fermer</button><button class="kb atlas" data-go>${SVG.plus} Dupliquer la campagne</button>`,
    }).el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
      if (e.target.closest('[data-go]')) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        toast('Campagne dupliquée · brouillon créé', { type: 'success', duration: 2800 });
      }
    });
  };

  /* ═══════════════════ NAV-RETURNS ═══════════════════════════════════════════
   * Retours & échanges. Width 980. Pending list, return-policy editor, fraud
   * watch, refund issuance row.
   * ─────────────────────────────────────────────────────────────────────────── */
  handlers['nav-returns'] = () => {
    const pending = [
      { id: 'R-7821', d: '24/04', name: 'Caftan brodé taille S',         amt: 2450,  reason: 'Taille',                client: 'Anna M. (DE)',     status: 'pend',  emoji: 'C' },
      { id: 'R-7822', d: '23/04', name: 'Babouches cuir caramel',         amt: 380,   reason: 'Défaut · couture',      client: 'Sophie L. (FR)',   status: 'pend',  emoji: 'B' },
      { id: 'R-7823', d: '23/04', name: 'Tapis berbère 1,2 × 1,8 m',     amt: 4200,  reason: 'Cadeau non désiré',     client: 'Karen B. (US)',    status: 'pend',  emoji: 'T' },
      { id: 'R-7824', d: '22/04', name: 'Théière argentée gravée',       amt: 950,   reason: 'N\'a pas plu',          client: 'Carmen R. (ES)',   status: 'ok',    emoji: 'TH' },
      { id: 'R-7825', d: '22/04', name: 'Coussin tissé Kilim',            amt: 290,   reason: 'Défaut · tache',        client: 'Hassan J. (MA)',   status: 'pend',  emoji: 'CO' },
      { id: 'R-7826', d: '21/04', name: 'Bracelet argent berbère',       amt: 1200,  reason: 'Taille',                client: 'Karima O. (MA)',   status: 'neutral', emoji: 'BR' },
    ];

    const flagged = [
      { name: 'Diana K. (US)',  reason: '4 retours en 28 j · 2 sur articles soldés', amt: '4 280 MAD', risk: 'Élevé' },
      { name: 'Sofia A. (FR)',  reason: '3 retours en 30 j · pattern post-Instagram', amt: '2 940 MAD', risk: 'Modéré' },
    ];

    window.Kiwi.appPage('returns', {
      title: 'Retours & échanges',
      subtitle: 'Maison Mansour · Gueliz · 5 demandes en attente · 2 clients flaggés',
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, var(--atlas), var(--brand-deep));">
          <div class="l">FENÊTRE DE RETOUR · 14 JOURS</div>
          <div class="big">${pending.filter(p => p.status === 'pend').length} <span style="font-size:18px; opacity:0.7;">en attente</span></div>
          <div class="sub">Taux de retour 30 j : 4,8 % · taux d'échange 30 j : 12,1 % · politique modifiable plus bas</div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 12px; flex-wrap: wrap;">
          <div>
            <div style="font-size: 11px; color: var(--n-500); letter-spacing: 0.1em; font-family: var(--mono); text-transform: uppercase;">DEMANDES EN ATTENTE</div>
            <div style="font-size: 12px; color: var(--n-500); margin-top: 4px;">Approuvez, refusez ou échangez. Cliquez "Détail" pour voir l'historique client complet.</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="kb ghost" data-action="ret-export"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M5 10l7 7 7-7M5 21h14"/></svg>Exporter</button>
            <button class="kb ghost" data-action="ret-policy-jump">${SVG.edit} Politique</button>
          </div>
        </div>

        <div class="p-card" style="padding: 8px 18px 12px;">
          ${pending.map(r => `
            <div class="b-ret-row" data-action="ret-detail" data-arg="${r.id}">
              <div class="b-ret-id">${r.id}<br><span style="opacity:0.7; font-size: 10px;">${r.d}</span></div>
              <div class="b-ret-thumb">${SVG.box}</div>
              <div class="b-ret-body">
                <div class="n">${r.name}</div>
                <div class="reason">Raison : ${r.reason}</div>
                <div class="who">${r.client}</div>
              </div>
              <div class="b-ret-amt">${fmtMAD(r.amt, 0)} MAD</div>
              <div style="display: flex; gap: 6px; align-items: center;">
                <span class="chip ${r.status}" style="font-size: 10.5px;">${r.status === 'pend' ? 'En attente' : r.status === 'ok' ? 'Approuvé' : r.status === 'ref' ? 'Refusé' : 'Échangé'}</span>
                ${r.status === 'pend' ? `
                  <button class="kb ghost" style="padding: 5px 10px; font-size: 11px;" data-action="ret-approve" data-arg="${r.id}" data-bubble="stop" title="Approuver">${SVG.check}</button>
                  <button class="kb ghost" style="padding: 5px 10px; font-size: 11px; color: var(--danger);" data-action="ret-refuse" data-arg="${r.id}" data-bubble="stop" title="Refuser">${SVG.x}</button>
                  <button class="kb ghost" style="padding: 5px 10px; font-size: 11px;" data-action="ret-exchange" data-arg="${r.id}" data-bubble="stop" title="Échanger">${SVG.swap}</button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="p-grid-2" style="margin-top: 18px;">
          <div class="p-card" style="margin-bottom: 0;">
            <div class="head">
              <h4>Politique de retour</h4>
              <span class="meta">MODIFIABLE</span>
            </div>
            <div style="font-size: 12.5px; color: var(--n-500); margin-bottom: 12px; line-height: 1.45;">Affichée sur le ticket et la fiche produit. Toute modification s'applique aux nouvelles ventes uniquement.</div>
            <div class="b-ret-policy" id="retPolicy">
              <div class="field">
                <div class="lbl">FENÊTRE DE RETOUR</div>
                <input type="number" value="14" min="0" max="90" step="1"/>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 4px;">jours après l'achat</div>
              </div>
              <div class="field">
                <div class="lbl">FRAIS DE RESTOCKING</div>
                <input type="number" value="0" min="0" max="50" step="1"/>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 4px;">pourcentage retenu</div>
              </div>
            </div>
            <div style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin: 14px 0 8px;">RÈGLES DE CONDITION</div>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: var(--n-700); line-height: 1.7;">
              ${[
                'Article non porté, non lavé, étiquette d\'origine présente',
                'Emballage et coffret-cadeau intacts',
                'Articles soldés > 30 % : crédit boutique uniquement',
                'Articles personnalisés (broderie, gravure) : non-retournables',
                'Bijoux : sceau anti-fraude non rompu',
              ].map(rule => `<li style="display: flex; align-items: flex-start; gap: 9px; padding: 4px 0;"><span style="color: var(--atlas); flex-shrink: 0; margin-top: 4px;">${SVG.check}</span><span>${rule}</span></li>`).join('')}
            </ul>
            <button class="kb atlas" style="width: 100%; justify-content: center; margin-top: 12px;" data-action="ret-policy-save">Enregistrer la politique</button>
          </div>

          <div class="p-card" style="margin-bottom: 0;">
            <div class="head">
              <h4>Veille fraude</h4>
              <span class="meta" style="color: var(--danger);">${flagged.length} CLIENTS FLAGGÉS</span>
            </div>
            <div style="font-size: 12.5px; color: var(--n-500); margin-bottom: 12px; line-height: 1.45;">3 retours ou plus sur 30 jours glissants. Vous pouvez bloquer leurs futures demandes de retour.</div>
            ${flagged.map((f, i) => `
              <div style="display: flex; align-items: flex-start; gap: 12px; padding: 14px 0; border-top: 1px solid var(--n-200);">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(201,74,58,0.12); color: var(--danger); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${SVG.flag}</div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; font-size: 13.5px;">${f.name}</div>
                  <div style="font-size: 12px; color: var(--n-500); margin-top: 2px; line-height: 1.4;">${f.reason}</div>
                  <div style="font-size: 11.5px; color: var(--n-500); margin-top: 6px; font-family: var(--mono);">Volume retours : ${f.amt} · Risque ${f.risk}</div>
                </div>
                <label class="kx-toggle">
                  <input type="checkbox" data-action="ret-block" data-arg="${f.name}"/>
                  <span class="track"></span>
                </label>
              </div>
            `).join('')}
            <div style="margin-top: 12px; padding: 10px 12px; background: rgba(217,154,43,0.08); border: 1px solid rgba(217,154,43,0.22); border-radius: 10px; font-size: 11.5px; color: var(--warn-ink); line-height: 1.5;">
              <b>Astuce.</b> Bloquer un client n'empêche pas l'achat, uniquement les retours. Notification email envoyée automatiquement.
            </div>
          </div>
        </div>

        <div class="p-card" style="margin-top: 18px;">
          <div class="head">
            <h4>Émission rapide d'un remboursement</h4>
            <span class="meta">3 OPTIONS</span>
          </div>
          <div style="font-size: 12.5px; color: var(--n-500); margin-bottom: 12px; line-height: 1.45;">Choisissez le canal, la commande d'origine sera automatiquement liée pour la conformité.</div>
          <div class="p-grid-3">
            <button class="kb ghost" style="padding: 14px; flex-direction: column; gap: 8px; min-height: 76px; align-items: center; justify-content: center;" data-action="ret-refund-original">
              ${SVG.coin}
              <div style="text-align: center;">
                <div style="font-weight: 600; font-size: 13px;">Carte d'origine</div>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 2px;">Visa / Mastercard · 1-3 jours</div>
              </div>
            </button>
            <button class="kb ghost" style="padding: 14px; flex-direction: column; gap: 8px; min-height: 76px; align-items: center; justify-content: center;" data-action="ret-refund-credit">
              ${SVG.code}
              <div style="text-align: center;">
                <div style="font-weight: 600; font-size: 13px;">Crédit boutique</div>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 2px;">Bon valable 12 mois</div>
              </div>
            </button>
            <button class="kb ghost" style="padding: 14px; flex-direction: column; gap: 8px; min-height: 76px; align-items: center; justify-content: center;" data-action="ret-refund-whatsapp">
              ${SVG.wa}
              <div style="text-align: center;">
                <div style="font-weight: 600; font-size: 13px;">Notifier WhatsApp</div>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 2px;">Lien de remboursement</div>
              </div>
            </button>
          </div>
        </div>
      `,
    });
  };

  /* ═══════════════════ AUX · returns handlers ═══════════════════════════════ */

  handlers['ret-detail'] = (id) => {
    const samplePhotos = ['mint-soft', 'rgba(217,154,43,0.16)', 'var(--paper-soft)', 'rgba(11,110,79,0.10)'];
    modal({
      tag: 'DEMANDE DE RETOUR · ' + (id || '—'),
      title: 'Caftan brodé taille S',
      desc: 'Anna M. (DE) · achat le 17/04/2026 · ticket #T-21847',
      width: 640,
      body: `
        <div class="kx-stat-3">
          <div class="stat"><div class="l">MONTANT</div><div class="v">2 450</div><div class="sub">MAD payés</div></div>
          <div class="stat"><div class="l">JOURS</div><div class="v">7 / 14</div><div class="sub">restants</div></div>
          <div class="stat"><div class="l">CLIENT</div><div class="v">3</div><div class="sub">achats antérieurs</div></div>
        </div>

        <div style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin: 14px 0 8px;">MOTIF DÉTAILLÉ</div>
        <div style="font-size: 13px; color: var(--n-700); line-height: 1.55; padding: 12px; background: var(--paper-soft); border-radius: 10px;">
          « La taille S est trop serrée à l'épaule pour ma morphologie. Je souhaite échanger contre une taille M ou être remboursée. L'article n'a pas été porté, l'étiquette est encore présente. »
        </div>

        <div style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin: 16px 0 8px;">PHOTOS FOURNIES</div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
          ${samplePhotos.map((c, i) => `
            <div style="aspect-ratio: 1; background: ${c}; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--n-500); font-size: 11px; font-family: var(--mono); border: 1px solid var(--n-200);">PHOTO ${i+1}</div>
          `).join('')}
        </div>

        <div style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin: 16px 0 8px;">HISTORIQUE CLIENTE · 3 ACHATS</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${[
            ['17/04/2026', 'Caftan brodé taille S',     '2 450 MAD', 'achat actuel'],
            ['08/02/2026', 'Foulard soie écru',         '720 MAD',   'aucun retour'],
            ['12/12/2025', 'Coffret huile argan',       '380 MAD',   'aucun retour'],
          ].map(([d, item, amt, st]) => `
            <div style="display: grid; grid-template-columns: 90px 1fr 110px auto; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--n-200); font-size: 12.5px; align-items: center;">
              <div class="mono" style="color: var(--n-500);">${d}</div>
              <div>${item}</div>
              <div class="mono" style="text-align: right;">${amt}</div>
              <div style="font-size: 11px; color: var(--n-500); font-family: var(--mono); letter-spacing: 0.04em;">${st}</div>
            </div>
          `).join('')}
        </div>
      `,
      foot: `
        <button class="kb ghost" data-action="ret-refuse" data-arg="${id || ''}" data-bubble="stop" style="color: var(--danger);">${SVG.x} Refuser</button>
        <button class="kb ghost" data-action="ret-refund-credit" data-bubble="stop">${SVG.code} Crédit boutique</button>
        <button class="kb ghost" data-action="ret-exchange" data-arg="${id || ''}" data-bubble="stop">${SVG.swap} Échanger</button>
        <button class="kb atlas" data-action="ret-approve" data-arg="${id || ''}" data-bubble="stop">${SVG.check} Approuver remboursement</button>
      `,
    });
  };

  handlers['ret-approve'] = (id) => {
    modal({
      tag: 'CHOISIR LE CANAL',
      title: 'Comment rembourser ?',
      desc: `Demande ${id || '—'} · 2 450 MAD · Anna M. (DE)`,
      width: 540,
      body: `
        <div style="display: grid; gap: 10px;">
          <div class="wiz-choice" data-channel="card">
            <div class="wc-ic">${SVG.coin}</div>
            <div><div class="wc-t">Carte d'origine · Visa ••4291</div><div class="wc-d">Crédité en 1 à 3 jours ouvrés. Aucun frais.</div></div>
          </div>
          <div class="wiz-choice" data-channel="credit">
            <div class="wc-ic">${SVG.code}</div>
            <div><div class="wc-t">Crédit boutique</div><div class="wc-d">Bon valable 12 mois sur tous les articles. +10 % offerts en bonus.</div></div>
          </div>
          <div class="wiz-choice" data-channel="cash">
            <div class="wc-ic">${SVG.coin}</div>
            <div><div class="wc-t">Espèces / virement</div><div class="wc-d">Disponible immédiatement à la caisse ou sous 48 h par virement.</div></div>
          </div>
        </div>
      `,
      foot: `<button class="kb ghost" data-cancel>Annuler</button>`,
    }).el.addEventListener('click', (e) => {
      const ch = e.target.closest('[data-channel]');
      if (ch) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        const labels = { card: 'sur la carte d\'origine', credit: 'en crédit boutique +10 %', cash: 'en espèces à la caisse' };
        toast('Remboursement approuvé', { type: 'success', desc: `${id || 'Demande'} remboursée ${labels[ch.dataset.channel]}.`, duration: 3500 });
      }
      if (e.target.closest('[data-cancel]')) e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
    });
  };

  handlers['ret-refuse'] = (id) => {
    modal({
      tag: 'CONFIRMATION',
      title: 'Refuser la demande de retour ?',
      desc: `Le client recevra une notification expliquant le motif. Cette action est définitive pour ${id || 'cette demande'}.`,
      width: 480,
      body: `
        <div class="kf-group">
          <label class="kf-label">Motif du refus (visible par le client)</label>
          <select class="kf-input">
            <option>Article hors fenêtre de retour</option>
            <option>Étiquette d'origine manquante</option>
            <option>Article porté ou lavé</option>
            <option>Article personnalisé non retournable</option>
            <option>Sceau anti-fraude rompu</option>
          </select>
        </div>
      `,
      foot: `<button class="kb ghost" data-cancel>Annuler</button><button class="kb danger" data-confirm>${SVG.x} Refuser définitivement</button>`,
    }).el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
      if (e.target.closest('[data-confirm]')) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        toast('Demande refusée', { type: 'danger', desc: 'Notification SMS envoyée au client.', duration: 3200 });
      }
    });
  };

  handlers['ret-exchange'] = (id) => {
    const items = [
      ['Caftan brodé taille M',     '2 450 MAD', 'En stock · 4'],
      ['Caftan brodé taille L',     '2 450 MAD', 'En stock · 2'],
      ['Caftan brodé taille XL',    '2 600 MAD', 'En stock · 1'],
      ['Caftan brodé col V · M',    '2 700 MAD', 'En stock · 3'],
      ['Caftan brodé Riad · M',     '3 200 MAD', '+ 750 MAD'],
    ];
    modal({
      tag: 'ÉCHANGE · ' + (id || '—'),
      title: 'Choisir un article de remplacement',
      desc: 'Article retourné : Caftan brodé taille S · 2 450 MAD',
      width: 580,
      body: `
        <div class="kf-group">
          <label class="kf-label">Rechercher dans le catalogue</label>
          <input class="kf-input" placeholder="Caftan brodé, babouches…" value="caftan brodé"/>
        </div>
        <div style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin: 14px 0 8px;">5 RÉSULTATS</div>
        <div style="display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto;">
          ${items.map(([n, p, st], idx) => `
            <div class="wiz-choice" data-pick="${idx}" style="padding: 12px 14px;">
              <div class="wc-ic">${SVG.box}</div>
              <div style="flex: 1;">
                <div class="wc-t">${n}</div>
                <div class="wc-d">${st}</div>
              </div>
              <div style="font-family: var(--mono); font-weight: 600; font-size: 13px;">${p}</div>
            </div>
          `).join('')}
        </div>
      `,
      foot: `<button class="kb ghost" data-cancel>Annuler</button>`,
    }).el.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const idx = +pick.dataset.pick;
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        toast('Échange enregistré', { type: 'success', desc: `Nouveau ticket : ${items[idx][0]}. Étiquette d'expédition envoyée par WhatsApp.`, duration: 3600 });
      }
      if (e.target.closest('[data-cancel]')) e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
    });
  };

  handlers['ret-block'] = (name) => {
    const cb = document.querySelector(`input[type="checkbox"][data-action="ret-block"][data-arg="${name}"]`);
    if (!cb) return;
    if (!cb.checked) {
      toast(`${name} déblocké`, { type: 'info', duration: 2200 });
      return;
    }
    cb.checked = false;
    modal({
      tag: 'CONFIRMATION',
      title: `Bloquer ${name} des retours ?`,
      desc: 'Les futures demandes seront automatiquement refusées. Le client peut continuer d\'acheter normalement.',
      width: 460,
      foot: `<button class="kb ghost" data-cancel>Annuler</button><button class="kb danger" data-confirm>${SVG.block} Bloquer</button>`,
    }).el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
      }
      if (e.target.closest('[data-confirm]')) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        cb.checked = true;
        toast(`${name} bloqué·e des retours`, { type: 'warn', desc: 'Email automatique envoyé.', duration: 3200 });
      }
    });
  };

  handlers['ret-policy-save'] = () => {
    const root = document.getElementById('retPolicy');
    const inputs = root ? root.querySelectorAll('input[type="number"]') : [];
    const win = inputs[0]?.value || '14';
    const fee = inputs[1]?.value || '0';
    toast('Politique de retour enregistrée', { type: 'success', desc: `Fenêtre ${win} j · restocking ${fee} %. Appliquée aux nouvelles ventes.`, duration: 3200 });
  };

  handlers['ret-policy-jump'] = () => {
    const el = document.getElementById('retPolicy');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Politique de retour', { type: 'info', desc: 'Modifiez la fenêtre ou les frais de restocking ci-dessous.', duration: 2400 });
  };

  handlers['ret-export'] = () => toast('Export retours · CSV en cours', { type: 'info', desc: '6 demandes · ouvert dans Excel ou Numbers.', duration: 2600 });

  handlers['ret-refund-original'] = () => toast('Remboursement carte d\'origine', { type: 'success', desc: 'Crédité en 1-3 jours ouvrés. Confirmation par SMS au client.', duration: 3000 });
  handlers['ret-refund-credit'] = () => toast('Crédit boutique émis', { type: 'success', desc: 'Bon valable 12 mois · +10 % offerts en bonus de fidélité.', duration: 3000 });
  handlers['ret-refund-whatsapp'] = () => toast('Lien WhatsApp envoyé', { type: 'success', desc: 'Le client recevra un lien sécurisé pour confirmer son IBAN.', duration: 3000 });

})();

/* ═══ Section 2 spa A · appointments / services ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Spa Bahia — sidebar handlers (vertical : SPA)
 * ─────────────────────────────────────────────────────────────────────────
 * Two production-grade drawers for the Spa Bahia mode (Hivernage, Marrakech) :
 *   1. nav-appointments  → calendrier 7 jours × 3 praticiennes (Booksy-tier)
 *   2. nav-services      → catalogue services & forfaits (5 catégories)
 *
 * Lives on top of pages.js (.p-hero / .p-card / .p-table / .kb / .chip / .mono)
 * + the spa-only CSS appended to /tmp/kiwi-s2-boutique-spa-css.css.
 *
 * No IIFE, no framework — vanilla. Patches `window.Kiwi.handlers` directly.
 * ─────────────────────────────────────────────────────────────────────── */
'use strict';

(() => {
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const { handlers, drawer, modal, toast, confetti } = window.Kiwi;

  /* ─── Shared spa data ─── */
  const PRACT = [
    { id: 'NH', name: 'Nour El Hassan',   role: 'Sénior · 8 ans',                     skill: 'sénior',   color: 'var(--atlas)' },
    { id: 'SB', name: 'Salma Benkirane',  role: 'Certifiée CIDESCO · massage thérap.', skill: 'certifié', color: 'var(--riad)'  },
    { id: 'YB', name: 'Yasmine Bouchikhi', role: 'Junior · spécialisée hammam',        skill: 'junior',   color: '#D99A2B'      },
  ];
  const SERVICES = [
    // category : massage | facial | hammam | day | cure
    { cat: 'massage', name: 'Massage relaxant 60 min',  abbr: 'MR60',  dur: 60, price: 550,  room: 'Salon 1',     skill: 'sénior',   sales: 1, contras: ['Grossesse 1ᵉʳ trim.'], notes: 'Huile d’argan tiède' },
    { cat: 'massage', name: 'Massage californien',      abbr: 'MCA',   dur: 60, price: 650,  room: 'Salon 2',     skill: 'sénior',   sales: 4, contras: [], notes: 'Pressions enveloppantes' },
    { cat: 'massage', name: 'Massage couple 60 min',    abbr: 'COUPL', dur: 60, price: 1100, room: 'Salon 1+2',   skill: 'sénior',   sales: 6, contras: [], notes: 'Cabine duo, deux praticiennes' },
    { cat: 'massage', name: 'Modelage pieds',           abbr: 'PIEDS', dur: 30, price: 280,  room: 'Salon 3',     skill: 'junior',   sales: 9, contras: ['Plaies ouvertes'], notes: 'Réflexologie douce' },
    { cat: 'massage', name: 'Réflexologie',             abbr: 'REFLE', dur: 45, price: 380,  room: 'Salon 3',     skill: 'certifié', sales: 7, contras: ['Phlébite'], notes: 'Points pieds + mains' },
    { cat: 'facial',  name: 'Soin du visage',           abbr: 'SVIS',  dur: 60, price: 650,  room: 'Salon 3',     skill: 'sénior',   sales: 3, contras: ['Allergie miel'], notes: 'Argan + miel d’oranger' },
    { cat: 'facial',  name: 'Soin anti-âge',            abbr: 'AAGE',  dur: 75, price: 780,  room: 'Salon 3',     skill: 'certifié', sales: 5, contras: ['Acide hyaluron.'], notes: 'Sérum + LED' },
    { cat: 'hammam',  name: 'Hammam traditionnel',      abbr: 'HAMTR', dur: 75, price: 350,  room: 'Hammam',      skill: 'junior',   sales: 2, contras: ['Hypertension sévère'], notes: 'Savon noir beldi' },
    { cat: 'hammam',  name: 'Gommage corps',            abbr: 'GOM',   dur: 45, price: 400,  room: 'Hammam',      skill: 'junior',   sales: 8, contras: ['Peau lésée'], notes: 'Kessa + savon noir' },
    { cat: 'hammam',  name: 'Gommage rhassoul',         abbr: 'RHAS',  dur: 30, price: 320,  room: 'Hammam',      skill: 'junior',   sales: 11, contras: [], notes: 'Argile de l’Atlas' },
    { cat: 'hammam',  name: 'Enveloppement boue',       abbr: 'BOUE',  dur: 60, price: 620,  room: 'Cabine humide', skill: 'certifié', sales: 10, contras: ['Claustro.'], notes: 'Ghassoul chaud + huiles ess.' },
    { cat: 'day',     name: 'Forfait Argan',            abbr: 'ARGAN', dur: 90, price: 850,  room: 'Salon 1+Hammam', skill: 'sénior', sales: 0, contras: [], notes: 'Hammam + gommage + massage 30 min' },
  ];
  const CLIENTS = [
    { i: 'LP', n: 'Lisa P.',     tag: 'US · VIP',           color: '#0B6E4F' },
    { i: 'AM', n: 'Anna M.',     tag: 'DE · 3 visites',     color: '#053B2C' },
    { i: 'SL', n: 'Sophie L.',   tag: 'FR · 7 visites',     color: '#0B6E4F' },
    { i: 'CR', n: 'Camille R.',  tag: 'FR · 2 visites',     color: '#D99A2B' },
    { i: 'IS', n: 'Imane S.',    tag: 'MA · fidèle (12)',   color: '#053B2C' },
    { i: 'YT', n: 'Yasmine T.',  tag: 'MA · VIP',           color: '#0B6E4F' },
    { i: 'KL', n: 'Karim L.',    tag: 'MA · 4 visites',     color: '#D99A2B' },
    { i: 'LM', n: 'Lucia M.',    tag: 'ES · 1ʳᵉ visite',    color: '#053B2C' },
  ];

  /* ─── Helpers ─── */
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR').replace(/,/g, ' ');
  const SVG = (p, sz = 14) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const ICN = {
    plus:    SVG('<path d="M12 5v14M5 12h14"/>'),
    cal:     SVG('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    user:    SVG('<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a4 4 0 014-4h8a4 4 0 014 4v2"/>'),
    clock:   SVG('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    sparkle: SVG('<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/>'),
    pkg:     SVG('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>'),
    edit:    SVG('<path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
    trash:   SVG('<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>'),
    bell:    SVG('<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>'),
  };
  const chip = (txt, cls = 'ok') => `<span class="chip ${cls}">${txt}</span>`;
  const riskChip = (r) => r === 'low' ? chip('Faible', 'ok') : r === 'mid' ? chip('Modéré', 'pend') : chip('Élevé', 'ref');

  /* ═══════════════════════════════════════════════════════════════════════
   * 1. nav-appointments — Calendrier rendez-vous (Spa Bahia)
   * ═════════════════════════════════════════════════════════════════════ */
  handlers['nav-appointments'] = () => {
    /* ─ Booking dataset (3 practitioners × 7 days × multiple slots) ─ */
    const DAYS = ['Lun 27', 'Mar 28', 'Mer 29', 'Jeu 30', 'Ven 1ᵉʳ', 'Sam 2', 'Dim 3'];
    const TODAY_IDX = 2; // mercredi — aujourd'hui
    const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
    // Bookings: [day, practitioner, startHour (decimal), durationHours, clientIdx, serviceIdx, risk, status, notes]
    const BOOK = [
      [0,'NH', 9.0, 1.5, 4, 11, 'low', 'ok',   'Cliente fidèle, prefère huile chaude'],
      [0,'NH',11.0, 1.0, 0,  1, 'low', 'ok',   'VIP, accueil thé à la menthe servi'],
      [0,'SB',10.0, 1.0, 1,  6, 'mid', 'ok',   'Allergie parabènes notée au dossier'],
      [0,'YB',14.0, 1.25, 7, 7, 'low', 'ok',   'Première visite, expliquer le rituel'],
      [1,'NH', 8.5, 1.0, 2,  0, 'low', 'ok',   ''],
      [1,'NH',14.0, 1.5, 5, 11, 'low', 'ok',   'Soin avant gala vendredi soir'],
      [1,'SB',10.0, 1.25, 3, 5, 'low', 'ok',   ''],
      [1,'YB',11.0, 0.75, 6, 9, 'high','pend', 'No-show 2× sur 6 mois, acompte demandé'],
      [1,'YB',16.0, 1.0, 1,  8, 'low', 'ok',   ''],
      // Today (Wednesday)
      [2,'NH', 9.0, 1.0, 4,  0, 'low', 'ok',   'Soins pieds en supplément'],
      [2,'NH',10.5, 1.5, 5, 11, 'low', 'ok',   'Forfait avec hammam puis massage'],
      [2,'NH',14.0, 1.0, 0,  1, 'low', 'ok',   'VIP, table de massage chauffée'],
      [2,'NH',16.0, 1.25, 2, 6, 'mid', 'pend', 'Confirmation WhatsApp en attente'],
      [2,'SB', 9.5, 1.0, 7,  4, 'low', 'ok',   ''],
      [2,'SB',11.5, 1.25, 3, 5, 'low', 'ok',   'Préfère cabine 3 (vue patio)'],
      [2,'SB',15.0, 1.0, 1,  6, 'low', 'ok',   ''],
      [2,'SB',17.0, 1.0, 6,  2, 'high','pend', 'Anniversaire du couple'],
      [2,'YB', 9.0, 1.25, 4, 7, 'low', 'ok',   ''],
      [2,'YB',12.0, 0.5, 5,  9, 'low', 'ok',   ''],
      [2,'YB',14.5, 1.0, 7,  8, 'mid', 'ok',   ''],
      [2,'YB',16.5, 1.25, 6,10, 'low', 'ok',   'Demande huile sans parfum'],
      // Thu / Fri / Sat / Sun forward bookings
      [3,'NH',10.0, 1.5, 0, 11, 'low', 'ok',   ''],
      [3,'SB',14.0, 1.25, 5, 6, 'low', 'ok',   ''],
      [3,'YB',16.0, 1.0, 1,  8, 'low', 'ok',   ''],
      [4,'NH', 9.0, 1.0, 4,  1, 'low', 'ok',   ''],
      [4,'NH',11.0, 1.5, 5, 11, 'low', 'ok',   ''],
      [4,'NH',15.0, 1.0, 2,  0, 'low', 'ok',   ''],
      [4,'SB',10.0, 1.25, 3, 5, 'low', 'ok',   ''],
      [4,'SB',13.0, 1.0, 6,  6, 'mid', 'ok',   ''],
      [4,'YB',14.0, 1.25, 7,10, 'low', 'ok',   ''],
      [4,'YB',17.0, 1.0, 1,  8, 'low', 'ok',   ''],
      [5,'NH',10.0, 1.0, 0,  0, 'low', 'ok',   'Samedi chargé, buffer 15 min'],
      [5,'NH',12.0, 1.0, 4, 11, 'low', 'ok',   ''],
      [5,'NH',15.0, 1.5, 2,  2, 'low', 'ok',   'Couple, anniversaire mariage'],
      [5,'SB',11.0, 1.25, 3, 5, 'low', 'ok',   ''],
      [5,'SB',14.0, 1.0, 5,  6, 'low', 'ok',   ''],
      [5,'YB',13.0, 1.25, 6, 7, 'low', 'ok',   ''],
      [5,'YB',16.0, 1.0, 7,  9, 'low', 'ok',   ''],
      [6,'SB',11.0, 1.0, 1,  4, 'low', 'ok',   'Dimanche, équipe réduite'],
      [6,'YB',14.0, 1.25, 5, 10,'low', 'ok',   ''],
    ];

    const todaysCount = BOOK.filter(b => b[0] === TODAY_IDX).length;
    const fillRate = Math.round((BOOK.length / (3 * 7 * 12 / 2)) * 100); // booked vs available 30-min slots
    const noShowCount = BOOK.filter(b => b[6] === 'high' || b[6] === 'mid').length;

    /* ─ Calendar block geometry: 8h–20h = 12h tall (each hour ≈ 26 px) ─ */
    const HSTART = 8, HEND = 20;
    const renderBlock = (b, idx) => {
      const [day, pid, h, dur, clIdx, svIdx, risk] = b;
      const top = ((h - HSTART) / (HEND - HSTART)) * 100;
      const height = (dur / (HEND - HSTART)) * 100;
      const cl = CLIENTS[clIdx];
      const sv = SERVICES[svIdx];
      const riskBadge = risk === 'low' ? '' : `<span class="s-cal-risk ${risk}"></span>`;
      return `<div class="s-cal-block" data-action="appt-detail" data-arg="${idx}" style="top:${top}%; height:${height}%; --pcol:${PRACT.find(p => p.id === pid).color};">
        <div class="s-cal-name">${cl.i} · ${sv.abbr}</div>
        <div class="s-cal-time">${String(Math.floor(h)).padStart(2,'0')}:${(h%1?'30':'00')} · ${sv.dur} min</div>
        ${riskBadge}
      </div>`;
    };

    const renderCol = (dayIdx, pid) => {
      const blocks = BOOK
        .map((b, i) => [b, i])
        .filter(([b]) => b[0] === dayIdx && b[1] === pid)
        .map(([b, i]) => renderBlock(b, i))
        .join('');
      return `<div class="s-cal-col" data-day="${dayIdx}" data-pract="${pid}">
        ${HOURS.map((h, i) => i === 0 ? '' : `<div class="s-cal-hline" style="top:${(i / (HOURS.length - 1)) * 100}%"></div>`).join('')}
        ${blocks}
      </div>`;
    };

    /* ─ Heatmap : utilisation horaire moyenne sur 7 jours ─ */
    const heatRow = HOURS.map((h, i) => {
      const slot = HSTART + i;
      const booked = BOOK.filter(b => slot >= b[2] && slot < b[2] + b[3]).length;
      const pct = Math.min(100, Math.round((booked / (3 * 7)) * 220));
      return `<div class="s-heat-cell" style="background: rgba(11,110,79, ${0.08 + pct / 140});" title="${h} · ${booked} RDV cumulés">
        <div class="s-heat-h">${h.split(':')[0]}h</div>
      </div>`;
    }).join('');

    /* ─ Waitlist (auto-promote when slot frees) ─ */
    const WAIT = [
      { c: CLIENTS[0], svc: 'Forfait Argan',     pref: 'Mer 14h–17h', auto: true,  ctx: 'Annulation Imane S. → push' },
      { c: CLIENTS[3], svc: 'Massage relaxant',   pref: 'Jeu 16h+',    auto: true,  ctx: 'Première visite, 2 places dispos' },
      { c: CLIENTS[6], svc: 'Hammam traditionnel', pref: 'Sam matin',  auto: false, ctx: 'Préférence Yasmine B.' },
      { c: CLIENTS[2], svc: 'Soin anti-âge',      pref: 'Ven soir',    auto: true,  ctx: 'Avant gala, urgent' },
    ];

    const r = window.Kiwi.appPage('appointments', {
      title: 'Calendrier rendez-vous',
      subtitle: 'Spa Bahia · Hivernage · 3 praticiennes',
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, var(--atlas), var(--brand-deep));">
          <div class="l">SEMAINE DU 27 AVRIL · MERCREDI EN COURS</div>
          <div class="big">${todaysCount} <span style="font-size:18px; opacity:0.7;">RDV aujourd'hui</span></div>
          <div class="sub">3 praticiennes · 12 heures d'ouverture · liste d'attente : ${WAIT.length} clientes</div>
        </div>

        <!-- KPI strip 4-up -->
        <div class="s-kpi-strip">
          <div class="s-kpi"><div class="l">TAUX REMPLISSAGE</div><div class="v">${fillRate} <span class="u">%</span></div><div class="sub">vs 64 % la sem. dernière</div></div>
          <div class="s-kpi"><div class="l">RDV AUJOURD'HUI</div><div class="v">${todaysCount}</div><div class="sub">17 confirmés · ${todaysCount - 17 > 0 ? todaysCount - 17 : 0} acomptes attente</div></div>
          <div class="s-kpi"><div class="l">RISQUE NO-SHOW</div><div class="v">${noShowCount}</div><div class="sub">3 modérés · 2 élevés (acompte)</div></div>
          <div class="s-kpi"><div class="l">LISTE D'ATTENTE</div><div class="v">${WAIT.length}</div><div class="sub">${WAIT.filter(w => w.auto).length} en auto-promotion</div></div>
        </div>

        <!-- Toolbar -->
        <div class="p-toolbar" style="margin: 4px 0 14px;">
          <div class="p-search">${SVG('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>')}Rechercher cliente ou téléphone…</div>
          <button class="kb ghost" data-action="appt-filter">${SVG('<path d="M4 6h16M7 12h10M10 18h4"/>',13)}Filtrer</button>
          <button class="kb ghost" data-action="appt-export">${SVG('<path d="M12 3v12M5 10l7 7 7-7M5 21h14"/>',13)}Exporter</button>
          <button class="kb atlas" data-action="appt-new">${ICN.plus}Nouveau RDV</button>
        </div>

        <!-- Practitioner legend -->
        <div class="s-legend">
          ${PRACT.map(p => `<span class="s-legend-it"><i style="background:${p.color};"></i><b>${p.id}</b> ${p.name} <span class="m">· ${p.role}</span></span>`).join('')}
        </div>

        <!-- Calendar grid: hours rail + 7 day columns × 3 practitioner sub-cols -->
        <div class="s-cal-shell">
          <div class="s-cal-rail">
            ${HOURS.map(h => `<div class="s-cal-rail-h">${h}</div>`).join('')}
          </div>
          <div class="s-cal-grid">
            ${DAYS.map((d, di) => `
              <div class="s-cal-day ${di === TODAY_IDX ? 'today' : ''}">
                <div class="s-cal-day-head">${d}${di === TODAY_IDX ? '<span class="s-now">●</span>' : ''}</div>
                <div class="s-cal-day-body">
                  ${PRACT.map(p => renderCol(di, p.id)).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Heatmap row -->
        <div class="s-heat-shell">
          <div class="s-heat-head"><b>Disponibilité moyenne · 7 jours</b><span class="m">Plus c'est sombre, plus le créneau est demandé</span></div>
          <div class="s-heat-row">${heatRow}</div>
        </div>

        <!-- Bottom dual cards: waitlist + channel breakdown -->
        <div class="p-grid-2 s-bottom-grid">
          <div class="p-card">
            <div class="head">
              <h4>Liste d'attente</h4>
              <button class="kb ghost" data-action="appt-wait-add" style="padding:6px 12px; font-size:12px;">+ Ajouter</button>
            </div>
            <div class="s-auto-toggle">
              <label class="s-switch"><input type="checkbox" data-action="appt-auto-toggle" checked><span class="s-slider"></span></label>
              <div><b>Auto-promotion</b><div class="m">Notifie la prochaine cliente dès qu'un créneau se libère</div></div>
            </div>
            ${WAIT.map((w, i) => `
              <div class="s-wait" data-action="appt-wait-detail" data-arg="${i}">
                <div class="s-wait-av" style="background:${w.c.color};">${w.c.i}</div>
                <div class="s-wait-info">
                  <b>${w.c.n}</b>
                  <div class="m">${w.svc} · ${w.pref}</div>
                  <div class="m s-wait-ctx">${w.ctx}</div>
                </div>
                <div class="s-wait-actions">
                  ${w.auto ? chip('Auto', 'ok') : chip('Manuel', 'neutral')}
                  <button class="kb ghost" style="padding:5px 9px; font-size:11px;" data-action="appt-wait-promote" data-arg="${i}">Promouvoir →</button>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="p-card">
            <div class="head"><h4>Origine des réservations</h4><span class="meta">7 DERNIERS JOURS</span></div>
            ${[
              ['Direct (téléphone, walk-in)', 38, 'var(--atlas)'],
              ['WhatsApp', 27, 'var(--riad)'],
              ['Booking.com Spa', 18, '#D99A2B'],
              ['Treatwell-like (Spa Atlas)', 12, '#7DF2B0'],
              ['Concierge hôtel partenaire', 5, 'var(--n-400)'],
            ].map(([n, p, c]) => `
              <div class="s-chan">
                <div class="s-chan-info"><b>${n}</b><span class="s-chan-pct">${p} %</span></div>
                <div class="s-chan-bar"><div style="width:${p * 2.5}%; background:${c};"></div></div>
              </div>
            `).join('')}
            <div class="rc-foot" style="margin-top:12px;">Booking.com prélève 15 % de commission. Direct + WhatsApp restent vos canaux les plus marges.</div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb atlas" data-action="appt-new">${ICN.plus}Nouveau rendez-vous</button>
      `,
    });

    /* ─ Slot click → nested drawer with full booking details ─ */
    setTimeout(() => {
      r.el.addEventListener('click', (e) => {
        const dismiss = e.target.closest('[data-dismiss]');
        if (dismiss) { r.close(); return; }
        const block = e.target.closest('[data-action="appt-detail"]');
        if (block) {
          e.stopPropagation();
          const idx = +block.dataset.arg;
          openBookingDetail(BOOK[idx]);
        }
        const promote = e.target.closest('[data-action="appt-wait-promote"]');
        if (promote) {
          e.stopPropagation();
          const i = +promote.dataset.arg;
          const w = WAIT[i];
          toast('Cliente promue', { type: 'success', desc: `${w.c.n} reçoit un SMS « créneau dispo » à l'instant.` });
        }
      }, true);
    }, 60);

    /* ─ Booking detail (nested drawer) ─ */
    function openBookingDetail(b) {
      const [day, pid, h, dur, clIdx, svIdx, risk, status, notes] = b;
      const cl = CLIENTS[clIdx];
      const sv = SERVICES[svIdx];
      const pr = PRACT.find(p => p.id === pid);
      const sd = drawer({
        title: `RDV · ${cl.n}`,
        subtitle: `${DAYS[day]} · ${String(Math.floor(h)).padStart(2,'0')}:${h%1?'30':'00'} · ${sv.dur} min`,
        width: 460,
        body: `
          <div class="s-detail-hero" style="background: linear-gradient(135deg, ${pr.color}, var(--ink));">
            <div class="l">${DAYS[day].toUpperCase()} · ${String(Math.floor(h)).padStart(2,'0')}:${h%1?'30':'00'}</div>
            <div class="big">${sv.name}</div>
            <div class="sub">${pr.name} · ${sv.room}</div>
          </div>

          <div class="s-detail-grid">
            <div><div class="l">CLIENTE</div><div class="v">${cl.n}</div><div class="sub">${cl.tag}</div></div>
            <div><div class="l">SERVICE</div><div class="v">${sv.dur} min · ${fmt(sv.price)} MAD</div><div class="sub">${sv.notes}</div></div>
            <div><div class="l">PRATICIENNE</div><div class="v">${pr.name}</div><div class="sub">${pr.role}</div></div>
            <div><div class="l">SALLE</div><div class="v">${sv.room}</div><div class="sub">Niveau requis : ${sv.skill}</div></div>
          </div>

          <div class="s-detail-meta">
            <div class="s-meta-row"><span>Risque no-show</span>${riskChip(risk)}</div>
            <div class="s-meta-row"><span>Statut paiement</span>${status === 'ok' ? chip('Acompte reçu', 'ok') : chip('Acompte attente', 'pend')}</div>
            <div class="s-meta-row"><span>Rappel WhatsApp J-1</span>${chip('Programmé 18h', 'neutral')}</div>
          </div>

          ${notes ? `<div class="s-detail-notes"><b>Notes praticienne</b><p>${notes}</p></div>` : ''}

          ${sv.contras.length ? `<div class="s-detail-contras">
            <b>Contre-indications</b>
            <div class="s-contra-row">${sv.contras.map(c => chip(c, 'pend')).join(' ')}</div>
          </div>` : ''}
        `,
        foot: `
          <div class="s-foot-row">
            <button class="kb ghost" data-action="appt-cancel">${ICN.trash}Annuler</button>
            <button class="kb ghost" data-action="appt-reschedule">${ICN.cal}Reprogrammer</button>
            <button class="kb atlas" data-action="appt-confirm-final">${ICN.bell}Confirmer</button>
          </div>
        `,
      });
      // Wire up footer
      setTimeout(() => {
        sd.el.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-action="appt-cancel"]')) {
            modal({
              title: 'Annuler ce rendez-vous ?',
              desc: `${cl.n} sera notifiée par WhatsApp. Si un acompte a été versé, il est conservé en avoir.`,
              body: '',
              foot: `<button class="kb ghost" data-dismiss>Garder</button><button class="kb danger" data-action="appt-cancel-confirm">Annuler le RDV</button>`,
            });
          }
          if (ev.target.closest('[data-action="appt-reschedule"]')) {
            toast('Lien de reprogrammation envoyé', { type: 'info', desc: `${cl.n} pourra choisir un nouveau créneau via WhatsApp.` });
          }
          if (ev.target.closest('[data-action="appt-confirm-final"]')) {
            sd.close();
            confetti();
            toast('RDV confirmé', { type: 'success', desc: `${cl.n} · ${sv.name} · ${pr.name}` });
          }
        });
      }, 60);
    }
  };

  /* ─── Aux handlers used inside the appointments drawer ─── */
  handlers['appt-filter']      = () => toast('Filtres', { type: 'info', desc: 'Praticienne, service, statut, risque no-show, choix multi.' });
  handlers['appt-export']      = () => toast('Planning exporté', { type: 'success', desc: '7 jours en PDF + iCal · envoyé à l\'équipe.' });
  handlers['appt-wait-add']    = () => toast('Ajout liste d\'attente', { type: 'info', desc: 'Saisissez la cliente et la préférence de créneau.' });
  handlers['appt-auto-toggle'] = () => toast('Auto-promotion mise à jour', { type: 'info', desc: 'Les annulations envoient désormais un SMS instantané.' });
  handlers['appt-wait-detail'] = () => toast('Détail liste d\'attente', { type: 'info', desc: 'Historique de visites · pref. praticienne · canal de rappel.' });
  handlers['appt-cancel-confirm'] = () => {
    document.querySelectorAll('.kiwi-backdrop').forEach(b => b.querySelector('.kiwi-modal-close')?.click());
    toast('RDV annulé', { type: 'warn', desc: 'WhatsApp envoyé · acompte converti en avoir 90 jours.' });
  };

  /* ─── Wizard: nouvelle réservation ─── */
  handlers['appt-new'] = () => {
    let step = 1, picked = { service: null, pract: null, date: null, time: null, client: null };

    const wizBody = () => {
      const stepsBar = `<div class="wiz-steps">
        ${[1,2,3,4,5,6].map(s => `<div class="wiz-step ${s < step ? 'done' : s === step ? 'active' : ''}"></div>`).join('')}
      </div>`;
      let content = '';
      if (step === 1) {
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">1. Choisir un service</h4>
          <div class="s-wiz-grid">
            ${SERVICES.slice(0, 8).map((s, i) => `
              <div class="wiz-choice ${picked.service === i ? 'selected' : ''}" data-pick-svc="${i}">
                <div class="wc-ic">${ICN.sparkle}</div>
                <div><div class="wc-t">${s.name}</div><div class="wc-d">${s.dur} min · ${fmt(s.price)} MAD · ${s.room}</div></div>
              </div>
            `).join('')}
          </div>`;
      } else if (step === 2) {
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">2. Choisir une praticienne</h4>
          <div class="s-wiz-grid">
            ${PRACT.map((p, i) => `
              <div class="wiz-choice ${picked.pract === i ? 'selected' : ''}" data-pick-pract="${i}">
                <div class="wc-ic" style="background:${p.color}; color:var(--paper);">${p.id}</div>
                <div><div class="wc-t">${p.name}</div><div class="wc-d">${p.role} · niveau ${p.skill}</div></div>
              </div>
            `).join('')}
          </div>`;
      } else if (step === 3) {
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">3. Choisir un jour</h4>
          <div class="s-wiz-days">
            ${['Lun 27','Mar 28','Mer 29','Jeu 30','Ven 1','Sam 2','Dim 3'].map((d, i) => `
              <button class="s-wiz-day ${picked.date === i ? 'on' : ''}" data-pick-date="${i}">
                <span class="d">${d.split(' ')[0]}</span>
                <span class="n">${d.split(' ')[1]}</span>
              </button>
            `).join('')}
          </div>`;
      } else if (step === 4) {
        const slots = ['09:00','09:30','10:30','11:00','12:00','14:00','14:30','15:00','16:00','17:00','17:30','18:30'];
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">4. Choisir un créneau</h4>
          <div class="s-wiz-times">
            ${slots.map((t, i) => `
              <button class="s-wiz-time ${picked.time === i ? 'on' : ''}" data-pick-time="${i}">${t}</button>
            `).join('')}
          </div>
          <div class="kf-help" style="margin-top:14px;">Les créneaux grisés sont déjà occupés par un autre RDV.</div>`;
      } else if (step === 5) {
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">5. Cliente</h4>
          <div class="kf-group"><label class="kf-label">Nom complet</label><input class="kf-input" placeholder="ex. Sophie Lambert" id="wiz-cl-n" value="${picked.client?.n || ''}"></div>
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">Téléphone</label><input class="kf-input" placeholder="+212 6 ..." id="wiz-cl-p" value="${picked.client?.p || ''}"></div>
            <div class="kf-group"><label class="kf-label">Email (optionnel)</label><input class="kf-input" placeholder="cliente@email.com" id="wiz-cl-e" value="${picked.client?.e || ''}"></div>
          </div>
          <div class="kf-group"><label class="kf-label">Notes (allergies, préférences)</label><textarea class="kf-input" rows="2" placeholder="ex. allergie parabènes" id="wiz-cl-nt">${picked.client?.nt || ''}</textarea></div>`;
      } else if (step === 6) {
        const sv = SERVICES[picked.service ?? 0];
        const pr = PRACT[picked.pract ?? 0];
        const dy = ['Lun 27','Mar 28','Mer 29','Jeu 30','Ven 1','Sam 2','Dim 3'][picked.date ?? 0];
        const tm = ['09:00','09:30','10:30','11:00','12:00','14:00','14:30','15:00','16:00','17:00','17:30','18:30'][picked.time ?? 0];
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">6. Récapitulatif</h4>
          <div class="s-wiz-recap">
            <div class="s-rec-line"><span>Service</span><b>${sv.name}</b></div>
            <div class="s-rec-line"><span>Praticienne</span><b>${pr.name}</b></div>
            <div class="s-rec-line"><span>Date · heure</span><b>${dy} · ${tm}</b></div>
            <div class="s-rec-line"><span>Salle</span><b>${sv.room}</b></div>
            <div class="s-rec-line"><span>Cliente</span><b>${picked.client?.n || '—'}</b></div>
            <div class="s-rec-line"><span>Téléphone</span><b>${picked.client?.p || '—'}</b></div>
            <div class="s-rec-total"><span>Total</span><b>${fmt(sv.price)} MAD</b></div>
          </div>
          <label class="s-rec-check"><input type="checkbox" id="wiz-deposit"><span>Demander un acompte de 30 %</span></label>
          <label class="s-rec-check"><input type="checkbox" id="wiz-wa" checked><span>Confirmation WhatsApp automatique</span></label>`;
      }
      return stepsBar + content;
    };

    const m = modal({
      title: 'Nouveau rendez-vous',
      tag: 'SPA BAHIA',
      desc: 'Service → praticienne → date → heure → cliente → confirmation',
      body: wizBody(),
      foot: `
        <button class="kb ghost" data-action="wiz-back">Retour</button>
        <button class="kb atlas" data-action="wiz-next">Suivant →</button>
      `,
      width: 580,
    });

    const refresh = () => { m.el.querySelector('.kiwi-modal-body').innerHTML = wizBody(); };

    setTimeout(() => {
      m.el.addEventListener('click', (e) => {
        const svc = e.target.closest('[data-pick-svc]'); if (svc) { picked.service = +svc.dataset.pickSvc; refresh(); }
        const pr  = e.target.closest('[data-pick-pract]'); if (pr) { picked.pract   = +pr.dataset.pickPract; refresh(); }
        const dt  = e.target.closest('[data-pick-date]'); if (dt) { picked.date    = +dt.dataset.pickDate; refresh(); }
        const tm  = e.target.closest('[data-pick-time]'); if (tm) { picked.time    = +tm.dataset.pickTime; refresh(); }
        if (e.target.closest('[data-action="wiz-back"]')) { if (step > 1) { step--; refresh(); } else { m.close(); } }
        if (e.target.closest('[data-action="wiz-next"]')) {
          if (step === 5) {
            picked.client = {
              n:  m.el.querySelector('#wiz-cl-n')?.value || 'Cliente',
              p:  m.el.querySelector('#wiz-cl-p')?.value || '',
              e:  m.el.querySelector('#wiz-cl-e')?.value || '',
              nt: m.el.querySelector('#wiz-cl-nt')?.value || '',
            };
          }
          if (step === 6) {
            m.close();
            confetti();
            const sv = SERVICES[picked.service ?? 0];
            toast('Rendez-vous confirmé', { type: 'success', desc: `${picked.client?.n || 'Cliente'} · ${sv.name} · WhatsApp envoyé.` });
            return;
          }
          if (step < 6) { step++; refresh(); }
          if (step === 6) m.el.querySelector('[data-action="wiz-next"]').textContent = 'Confirmer · envoyer WhatsApp';
        }
      });
    }, 60);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * 2. nav-services — Catalogue services & forfaits (Spa Bahia)
   * ═════════════════════════════════════════════════════════════════════ */
  handlers['nav-services'] = () => {
    const TABS = [
      { k: 'massage', n: 'Massages',          c: 5 },
      { k: 'facial',  n: 'Soins du visage',   c: 2 },
      { k: 'hammam',  n: 'Hammam & gommages', c: 4 },
      { k: 'day',     n: 'Forfaits journée',  c: 3 },
      { k: 'cure',    n: 'Cures multi-séances', c: 3 },
    ];
    const PACKAGES = [
      { n: 'Forfait Argan',          dur: '90 min',  p: 850,  desc: 'Hammam traditionnel + gommage + massage relaxant 30 min',         tag: 'Best-seller', sales: 38 },
      { n: 'Cure 4 séances',         dur: '4 × 60',  p: 2400, desc: 'Massage relaxant ou californien · valable 90 jours',              tag: 'Cure',        sales: 22 },
      { n: 'Soirée détente couple',  dur: '2 h',     p: 1980, desc: 'Hammam privatif + massage couple 60 min + thé à la menthe',       tag: 'Couple',      sales: 14 },
      { n: 'Mariée du jour',         dur: '4 h',     p: 4200, desc: 'Hammam + gommage rhassoul + soin visage + massage + manucure',    tag: 'Premium',     sales: 6  },
    ];
    const CURES = [
      { n: 'Cure Anti-âge · 5 séances', dur: '5 × 75', p: 3600, desc: 'Soin anti-âge LED · 1 séance / semaine pendant 5 sem.',         sales: 9 },
      { n: 'Cure Hammam mensuelle',     dur: 'illim.', p: 900,  desc: 'Accès illimité hammam + 2 gommages / mois · récurrent',         sales: 28 },
      { n: 'Cure Sportif récup.',       dur: '6 × 60', p: 2700, desc: 'Massage thérapeutique + réflexologie alternés',                 sales: 4 },
    ];

    const renderTabBody = (k) => {
      if (k === 'day') {
        return PACKAGES.map((p, i) => `
          <div class="s-pkg-card" data-action="svc-pkg-edit" data-arg="${i}">
            <div class="s-pkg-tag">${p.tag.toUpperCase()}</div>
            <h5>${p.n}</h5>
            <div class="s-pkg-meta">${p.dur} · ${fmt(p.p)} MAD</div>
            <p class="s-pkg-desc">${p.desc}</p>
            <div class="s-pkg-foot">
              <span class="meta">${p.sales} ventes / 30 j</span>
              <button class="kb ghost" style="padding:5px 10px; font-size:11.5px;" data-action="svc-pkg-edit" data-arg="${i}">${ICN.edit}Modifier</button>
            </div>
          </div>
        `).join('');
      }
      if (k === 'cure') {
        return CURES.map((c, i) => `
          <div class="s-pkg-card" data-action="svc-cure-edit" data-arg="${i}">
            <div class="s-pkg-tag" style="background: var(--ink); color: var(--mint);">CURE MULTI-SÉANCES</div>
            <h5>${c.n}</h5>
            <div class="s-pkg-meta">${c.dur} · ${fmt(c.p)} MAD</div>
            <p class="s-pkg-desc">${c.desc}</p>
            <div class="s-pkg-foot">
              <span class="meta">${c.sales} cures actives</span>
              <button class="kb ghost" style="padding:5px 10px; font-size:11.5px;">${ICN.edit}Modifier</button>
            </div>
          </div>
        `).join('');
      }
      const items = SERVICES.filter(s => s.cat === k).sort((a, b) => a.sales - b.sales);
      return `
        <table class="p-table s-svc-table">
          <thead><tr>
            <th>SERVICE</th><th class="right">DURÉE</th><th class="right">PRIX</th>
            <th>SALLE</th><th>NIVEAU</th><th>CONTRE-INDICATIONS</th><th class="right">RANG 30J</th><th></th>
          </tr></thead>
          <tbody>
            ${items.map((s, i) => `
              <tr data-action="svc-edit" data-arg="${SERVICES.indexOf(s)}">
                <td><b>${s.name}</b><div class="s-svc-notes">${s.notes || ''}</div></td>
                <td class="mono right">${s.dur} min</td>
                <td class="mono right">${fmt(s.price)} MAD</td>
                <td><span class="s-room-pill">${s.room}</span></td>
                <td><span class="s-skill ${s.skill}">${s.skill}</span></td>
                <td>${s.contras.length ? s.contras.map(c => `<span class="chip pend" style="margin-right:4px;">${c}</span>`).join('') : '<span style="color:var(--n-400);">—</span>'}</td>
                <td class="mono right"><b>#${s.sales + 1}</b></td>
                <td><button class="kb ghost" style="padding:4px 8px; font-size:11px;" data-action="svc-edit" data-arg="${SERVICES.indexOf(s)}">${ICN.edit}</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    };

    const r = window.Kiwi.appPage('services', {
      title: 'Services & forfaits',
      subtitle: 'Spa Bahia · catalogue complet · 17 prestations',
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, var(--atlas), var(--brand-deep));">
          <div class="l">CATALOGUE COMPLET</div>
          <div class="big">${SERVICES.length + PACKAGES.length + CURES.length} <span style="font-size:18px; opacity:0.7;">prestations actives</span></div>
          <div class="sub">12 services à la carte · 4 forfaits journée · 3 cures · ticket moyen 612 MAD</div>
        </div>

        <!-- AI insight banner -->
        <div class="s-ai-banner">
          <div class="s-ai-ic">${ICN.sparkle}</div>
          <div>
            <div class="s-ai-title">Forfait Argan en hausse de 24 % MoM</div>
            <div class="s-ai-desc">Vos clientes touristes le préfèrent à la carte 2× sur 3. Considérez un upsell « Argan Deluxe » à +250 MAD avec massage 60 min.</div>
          </div>
          <button class="kb ghost" style="padding:7px 12px; font-size:12px;" data-action="svc-ai-action">Créer Argan Deluxe</button>
        </div>

        <!-- Toolbar -->
        <div class="p-toolbar" style="margin: 4px 0 14px;">
          <div class="p-search">${SVG('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>')}Rechercher un service…</div>
          <button class="kb ghost" data-action="svc-season">${ICN.cal}Programmation saisonnière</button>
          <button class="kb ghost" data-action="svc-export">${SVG('<path d="M12 3v12M5 10l7 7 7-7M5 21h14"/>',13)}Exporter</button>
          <button class="kb atlas" data-action="svc-new">${ICN.plus}Nouveau service</button>
        </div>

        <!-- Tabs -->
        <div class="resv-tabs s-tabs" role="tablist">
          ${TABS.map((t, i) => `
            <button class="resv-tab ${i === 0 ? 'on' : ''}" data-svc-tab="${t.k}">
              ${t.n} <span class="s-tab-count">${t.c}</span>
            </button>
          `).join('')}
        </div>

        ${TABS.map((t, i) => `
          <div class="resv-pane s-svc-pane" data-svc-pane="${t.k}" ${i === 0 ? '' : 'hidden'}>
            ${renderTabBody(t.k)}
          </div>
        `).join('')}

        <!-- Combo / Forfait packages quick editor -->
        <div class="p-card" style="margin-top:18px;">
          <div class="head">
            <h4>Combos & forfaits · vue rapide</h4>
            <span class="meta">4 PACKAGES · 80 VENTES / 30 J</span>
          </div>
          <div class="s-combo-grid">
            ${PACKAGES.map((p, i) => `
              <div class="s-combo" data-action="svc-pkg-edit" data-arg="${i}">
                <div class="s-combo-tag">${p.tag}</div>
                <b>${p.n}</b>
                <div class="m">${p.dur} · ${fmt(p.p)} MAD</div>
                <div class="s-combo-sales">${p.sales} ventes / 30 j</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Seasonal scheduler -->
        <div class="p-card s-season-card">
          <div class="head">
            <h4>Programmation saisonnière</h4>
            <span class="meta">2 PROGRAMMES ACTIFS</span>
          </div>
          <div class="s-season-grid">
            <div class="s-season">
              <div class="s-season-h"><b>Menu Ramadan</b><span class="chip ok">Actif jusqu'au 9 mai</span></div>
              <p class="s-season-d">Soins plus calmes après ftour · gommage rhassoul + massage 30 min en duo · horaires 21h–01h.</p>
              <button class="kb ghost" style="padding:6px 12px; font-size:12px;" data-action="svc-season-edit">${ICN.edit}Modifier</button>
            </div>
            <div class="s-season">
              <div class="s-season-h"><b>Menu Été · gommage corps boost</b><span class="chip neutral">Programmé · 1 juin</span></div>
              <p class="s-season-d">Promotion gommage corps + enveloppement boue · −15 % avant 12h · push WhatsApp à 9h.</p>
              <button class="kb ghost" style="padding:6px 12px; font-size:12px;" data-action="svc-season-edit">${ICN.edit}Modifier</button>
            </div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb atlas" data-action="svc-new">${ICN.plus}Ajouter un service</button>
      `,
    });

    /* ─ Tab switcher ─ */
    setTimeout(() => {
      r.el.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-svc-tab]');
        if (tab) {
          const k = tab.dataset.svcTab;
          r.el.querySelectorAll('[data-svc-tab]').forEach(t => t.classList.toggle('on', t.dataset.svcTab === k));
          r.el.querySelectorAll('[data-svc-pane]').forEach(p => { p.hidden = (p.dataset.svcPane !== k); });
        }
        if (e.target.closest('[data-dismiss]')) r.close();
        const editRow = e.target.closest('[data-action="svc-edit"]');
        if (editRow) {
          e.stopPropagation();
          openServiceModal(SERVICES[+editRow.dataset.arg], +editRow.dataset.arg);
        }
        const pkgEdit = e.target.closest('[data-action="svc-pkg-edit"]');
        if (pkgEdit) {
          e.stopPropagation();
          openPackageModal(PACKAGES[+pkgEdit.dataset.arg]);
        }
        const cureEdit = e.target.closest('[data-action="svc-cure-edit"]');
        if (cureEdit) {
          e.stopPropagation();
          openPackageModal(CURES[+cureEdit.dataset.arg]);
        }
        if (e.target.closest('[data-action="svc-new"]')) {
          e.stopPropagation();
          openServiceModal(null);
        }
      });
    }, 60);

    /* ─ Service add / edit modal ─ */
    function openServiceModal(svc, idx) {
      const isEdit = !!svc;
      const data = svc || { name: '', cat: 'massage', dur: 60, price: 500, room: 'Salon 1', skill: 'sénior', contras: [], notes: '' };
      const m = modal({
        title: isEdit ? `Modifier · ${data.name}` : 'Nouveau service',
        tag: 'SPA BAHIA',
        desc: 'Tous les champs sont sauvegardés en local. Publication immédiate sur les canaux actifs.',
        body: `
          <div class="kf-group"><label class="kf-label">Nom du service</label><input class="kf-input" id="sv-n" value="${data.name}" placeholder="ex. Massage californien"></div>
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">Catégorie</label>
              <select class="kf-input" id="sv-c">
                ${TABS.filter(t => t.k !== 'day' && t.k !== 'cure').map(t => `<option value="${t.k}" ${data.cat === t.k ? 'selected' : ''}>${t.n}</option>`).join('')}
              </select>
            </div>
            <div class="kf-group"><label class="kf-label">Durée (min)</label>
              <select class="kf-input" id="sv-d">
                ${[30,45,60,75,90,120].map(d => `<option ${data.dur === d ? 'selected' : ''}>${d}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">Prix (MAD)</label><input class="kf-input" id="sv-p" type="number" value="${data.price}"></div>
            <div class="kf-group"><label class="kf-label">Salle</label>
              <select class="kf-input" id="sv-r">
                ${['Salon 1','Salon 2','Salon 3','Hammam','Cabine humide','Salon 1+2'].map(rm => `<option ${data.room === rm ? 'selected' : ''}>${rm}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="kf-group"><label class="kf-label">Niveau praticienne</label>
            <div class="s-pick-row">
              ${['junior','sénior','certifié'].map(sk => `<button class="s-pick ${data.skill === sk ? 'on' : ''}" data-pick-skill="${sk}">${sk}</button>`).join('')}
            </div>
          </div>
          <div class="kf-group"><label class="kf-label">Contre-indications (séparées par virgule)</label>
            <input class="kf-input" id="sv-ct" value="${data.contras.join(', ')}" placeholder="ex. Grossesse 1ᵉʳ trim., Hypertension">
          </div>
          <div class="kf-group"><label class="kf-label">Notes praticienne</label>
            <textarea class="kf-input" rows="2" id="sv-nt">${data.notes || ''}</textarea>
          </div>
        `,
        foot: `
          ${isEdit ? '<button class="kb danger" data-action="sv-delete">Supprimer</button>' : ''}
          <button class="kb ghost" data-dismiss>Annuler</button>
          <button class="kb atlas" data-action="sv-save">${isEdit ? 'Enregistrer' : 'Publier le service'}</button>
        `,
        width: 600,
      });
      setTimeout(() => {
        let pickedSkill = data.skill;
        m.el.addEventListener('click', (ev) => {
          const sk = ev.target.closest('[data-pick-skill]');
          if (sk) {
            pickedSkill = sk.dataset.pickSkill;
            m.el.querySelectorAll('[data-pick-skill]').forEach(b => b.classList.toggle('on', b.dataset.pickSkill === pickedSkill));
          }
          if (ev.target.closest('[data-action="sv-save"]')) {
            const name = m.el.querySelector('#sv-n').value || 'Sans titre';
            m.close();
            if (!isEdit) confetti();
            toast(isEdit ? 'Service mis à jour' : 'Service publié', {
              type: 'success',
              desc: `${name} · synchronisé sur tablette · WhatsApp · Booking.com.`,
            });
          }
          if (ev.target.closest('[data-action="sv-delete"]')) {
            modal({
              title: 'Supprimer ce service ?',
              desc: 'Les RDV déjà confirmés sont conservés. Le service sera retiré du catalogue public.',
              foot: `<button class="kb ghost" data-dismiss>Garder</button><button class="kb danger" data-action="sv-delete-confirm">Supprimer</button>`,
              width: 460,
            });
          }
          if (ev.target.closest('[data-action="sv-delete-confirm"]')) {
            document.querySelectorAll('.kiwi-backdrop').forEach(b => b.querySelector('.kiwi-modal-close')?.click());
            toast('Service supprimé', { type: 'warn', desc: 'Retiré du catalogue · 0 RDV impactés.' });
          }
          if (ev.target.closest('[data-dismiss]')) m.close();
        });
      }, 60);
    }

    /* ─ Package edit modal ─ */
    function openPackageModal(pkg) {
      modal({
        title: `Forfait · ${pkg.n}`,
        tag: 'COMBO',
        desc: pkg.desc,
        body: `
          <div class="s-rec-line"><span>Durée totale</span><b>${pkg.dur}</b></div>
          <div class="s-rec-line"><span>Prix forfait</span><b>${fmt(pkg.p)} MAD</b></div>
          <div class="s-rec-line"><span>Économie cliente</span><b style="color:var(--atlas);">−180 MAD vs à la carte</b></div>
          <div class="s-rec-line"><span>Ventes 30 j</span><b>${pkg.sales}</b></div>
          <div class="s-rec-line"><span>Annulation</span><b>72h avant · sans frais</b></div>
        `,
        foot: `<button class="kb ghost" data-dismiss>Fermer</button><button class="kb atlas" data-action="pkg-edit-go">${ICN.edit}Modifier le contenu</button>`,
        width: 540,
      });
    }
  };

  /* ─── Aux handlers used inside the services drawer ─── */
  handlers['svc-export']      = () => toast('Catalogue exporté', { type: 'success', desc: 'PDF tarifaire prêt à imprimer + flux Booking.com mis à jour.' });
  handlers['svc-season']      = () => toast('Programmation saisonnière', { type: 'info', desc: 'Définissez Ramadan, été, fêtes, Kiwi switch automatiquement.' });
  handlers['svc-season-edit'] = () => toast('Édition programme', { type: 'info', desc: 'Ajustez horaires, services actifs, promotions.' });
  handlers['svc-ai-action']   = () => {
    confetti();
    toast('Argan Deluxe créé', { type: 'success', desc: 'Brouillon ajouté · prêt à publier après validation prix.' });
  };
  handlers['pkg-edit-go']     = () => toast('Édition forfait', { type: 'info', desc: 'Composition modifiable séance par séance.' });

})();

/* ═══ Section 2 spa · practitioners ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Spa Bahia · Praticien·ne·s handler (sidebar)
 * Mindbody / Booksy-tier polish — staff cards, commission calc, certs.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const Kiwi = window.Kiwi || {};
  const handlers = Kiwi.handlers;
  if (!handlers) return;
  const { toast, modal, drawer } = Kiwi;

  /* ─── Inject scoped styles (idempotent) ─── */
  if (!document.getElementById('kiwi-spa-prac-css')) {
    const style = document.createElement('style');
    style.id = 'kiwi-spa-prac-css';
    style.textContent = `
    .pr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 820px) { .pr-grid { grid-template-columns: 1fr; } }
    .pr-card { background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 16px; padding: 18px; transition: border-color 160ms; }
    html[data-theme="dark"] .pr-card { background: var(--paper-muted); }
    .pr-card:hover { border-color: var(--atlas); }
    .pr-card .top { display: grid; grid-template-columns: 80px 1fr auto; gap: 14px; align-items: flex-start; margin-bottom: 12px; }
    .pr-blob { width: 80px; height: 80px; border-radius: 22px; display: flex; align-items: center; justify-content: center; color: var(--paper); font-weight: 600; font-size: 26px; letter-spacing: -0.04em; position: relative; overflow: hidden; }
    .pr-blob::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 28% 20%, rgba(255,255,255,0.28), transparent 55%); border-radius: 22px; }
    .pr-blob.a { background: linear-gradient(135deg, var(--atlas), var(--brand-deep)); }
    .pr-blob.b { background: linear-gradient(135deg, #D99A2B, #8A6210); }
    .pr-blob.c { background: linear-gradient(135deg, var(--atlas-700, #054C36), var(--atlas)); }
    .pr-card .nm { font-weight: 600; font-size: 16px; letter-spacing: -0.015em; }
    .pr-card .rl { font-size: 12px; color: var(--n-500); margin-top: 3px; line-height: 1.4; }
    .pr-badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px; font-size: 10.5px; font-family: var(--mono); letter-spacing: 0.06em; font-weight: 600; }
    .pr-badge.sr { background: var(--mint-soft); color: var(--riad); }
    .pr-badge.cf { background: rgba(217,154,43,0.16); color: var(--warn-ink); }
    .pr-badge.jr { background: rgba(11,110,79,0.1); color: var(--atlas); }
    .pr-bio { font-size: 12.5px; color: var(--n-600); line-height: 1.5; margin: 4px 0 12px; }
    .pr-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
    .pr-chip { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: var(--surface); border: 1px solid var(--n-200); color: var(--n-700); font-weight: 500; }
    html[data-theme="dark"] .pr-chip { background: var(--inverse-surface); }
    .pr-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 12px 0; border-top: 1px solid var(--n-200); border-bottom: 1px solid var(--n-200); margin-bottom: 12px; }
    .pr-kpis .k { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--n-500); font-family: var(--mono); }
    .pr-kpis .v { font-family: var(--mono); font-weight: 600; font-size: 14px; margin-top: 3px; letter-spacing: -0.01em; font-feature-settings: "tnum" 1; }
    .pr-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin-bottom: 12px; }
    .pr-day { aspect-ratio: 1; border-radius: 6px; background: var(--n-100); display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: var(--mono); font-size: 9px; color: var(--n-500); }
    .pr-day.busy { background: var(--mint-soft); color: var(--riad); }
    .pr-day.full { background: var(--atlas); color: var(--mint); }
    .pr-day.off { background: transparent; border: 1px dashed var(--n-200); }
    .pr-day .d { font-weight: 600; font-size: 10px; }
    .pr-day .h { font-size: 8.5px; opacity: 0.85; margin-top: 1px; }
    .pr-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
    .pr-actions .kb { padding: 8px 10px; font-size: 11.5px; justify-content: center; }
    .pr-cert { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--n-200); font-size: 12.5px; }
    .pr-cert:last-child { border-bottom: 0; }
    .pr-cert .n { font-weight: 500; }
    .pr-cert .m { font-size: 11px; color: var(--n-500); margin-top: 2px; font-family: var(--mono); letter-spacing: 0.04em; }
    .pr-cert-stat { font-size: 10.5px; padding: 3px 9px; border-radius: 999px; font-family: var(--mono); font-weight: 600; letter-spacing: 0.04em; }
    .pr-cert-stat.ok { background: #E3F7EC; color: var(--atlas-700, #054C36); }
    .pr-cert-stat.warn { background: var(--warn-soft); color: var(--warn-ink); }
    .pr-cert-stat.exp { background: #FDE8E4; color: #9B2F22; }
    .pr-calc-out { background: linear-gradient(135deg, var(--atlas), var(--brand-deep)); color: var(--inverse-ink); border-radius: 14px; padding: 18px; margin-top: 14px; }
    .pr-calc-out .l { font-size: 10.5px; font-family: var(--mono); letter-spacing: 0.1em; color: var(--mint); text-transform: uppercase; }
    .pr-calc-out .v { font-size: 32px; font-weight: 600; letter-spacing: -0.025em; margin-top: 4px; font-feature-settings: "tnum" 1; }
    .pr-calc-out .br { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(125,242,176,0.18); font-size: 12px; }
    .pr-calc-out .br span { color: #c6ead4; font-family: var(--mono); }
    .pr-calc-out .br b { color: var(--inverse-ink); font-family: var(--mono); font-weight: 600; }
    `;
    document.head.appendChild(style);
  }

  /* ─── Practitioner data (Spa Bahia, Hivernage) ─── */
  const PRACS = [
    {
      id: 'NH', cls: 'a', name: 'Nour El Hassan', role: 'Esthéticienne sénior · 8 ans',
      badge: ['sr', 'sénior'],
      bio: 'Référente visage anti-âge et soins thérapeutiques. Formatrice interne pour les nouvelles arrivantes.',
      specialties: ['Visage anti-âge', 'Massages thérapeutiques', 'Drainage lymphatique', 'Soins haute technologie'],
      certs: [
        { n: 'CIDESCO Suisse · diplôme international', d: 'Renouvelée 2024', s: 'ok', sl: 'À jour' },
        { n: 'École de massage thérapeutique · Marrakech', d: 'Obtenue 2018', s: 'ok', sl: 'À jour' },
        { n: 'RNCP niveau 5 · esthétique avancée', d: 'Renouv. déc. 2026', s: 'warn', sl: 'Bientôt' },
      ],
      commission: 25, rdv: 84, revenue: 38600, nps: 92, retention: 78,
      week: ['busy', 'full', 'busy', 'full', 'full', 'off', 'off'],
      hours: ['10', '8', '9', '8', '8', '—', '—'],
    },
    {
      id: 'SB', cls: 'b', name: 'Salma Benkirane', role: 'Esthéticienne certifiée · 5 ans',
      badge: ['cf', 'certifiée'],
      bio: 'Spécialisée en soins de relaxation et rituels corps. Très demandée sur les forfaits couples.',
      specialties: ['Massages relaxants', 'Gommages corps', 'Rituel marocain', 'Massage pierres chaudes'],
      certs: [
        { n: 'CIDESCO Suisse · diplôme international', d: 'Obtenue 2021', s: 'ok', sl: 'À jour' },
        { n: 'Certification massage californien · Casablanca', d: 'Obtenue 2022', s: 'ok', sl: 'À jour' },
        { n: 'Recyclage hygiène & protocoles HACCP', d: 'Renouv. juin 2026', s: 'warn', sl: 'Bientôt' },
      ],
      commission: 22, rdv: 72, revenue: 28200, nps: 88, retention: 71,
      week: ['busy', 'busy', 'full', 'busy', 'busy', 'full', 'off'],
      hours: ['7', '7', '9', '8', '7', '9', '—'],
    },
    {
      id: 'YB', cls: 'c', name: 'Yasmine Bouchikhi', role: 'Praticienne junior · 2 ans',
      badge: ['jr', 'junior'],
      bio: 'Hammam traditionnel et modelages détente. En cours de certification CIDESCO pour passage certifiée.',
      specialties: ['Hammam traditionnel', 'Modelages pieds', 'Gommage savon noir', 'Réflexologie plantaire'],
      certs: [
        { n: 'École hammam Marrakech · diplôme', d: 'Obtenue 2023', s: 'ok', sl: 'À jour' },
        { n: 'CIDESCO niveau 1 · en formation', d: 'Examen oct. 2026', s: 'warn', sl: 'En cours' },
        { n: 'Recyclage premiers secours SST', d: 'Expirée fév. 2026', s: 'exp', sl: 'Renouveler' },
      ],
      commission: 18, rdv: 56, revenue: 18400, nps: 84, retention: 62,
      week: ['off', 'busy', 'busy', 'full', 'busy', 'full', 'busy'],
      hours: ['—', '7', '7', '8', '7', '8', '6'],
    },
  ];

  const fmt = (n) => n.toLocaleString('fr-FR').replace(/,/g, ' ');
  const dows = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  function renderCard(p) {
    const [bcls, blbl] = p.badge;
    return `
      <div class="pr-card" data-prac="${p.id}">
        <div class="top">
          <div class="pr-blob ${p.cls}">${p.id}</div>
          <div>
            <div class="nm">${p.name}</div>
            <div class="rl">${p.role}</div>
            <div class="pr-bio">${p.bio}</div>
          </div>
          <div class="pr-badge ${bcls}">${blbl}</div>
        </div>

        <div class="pr-chips">
          ${p.specialties.map(s => `<span class="pr-chip">${s}</span>`).join('')}
        </div>

        <div class="pr-kpis">
          <div><div class="k">RDV mois</div><div class="v">${p.rdv}</div></div>
          <div><div class="k">Revenu</div><div class="v">${fmt(p.revenue)}</div></div>
          <div><div class="k">NPS</div><div class="v">${p.nps}</div></div>
          <div><div class="k">Rétention</div><div class="v">${p.retention} %</div></div>
        </div>

        <div class="pr-week">
          ${p.week.map((s, i) => `
            <div class="pr-day ${s}"><div class="d">${dows[i]}</div><div class="h">${p.hours[i] === '—' ? 'off' : p.hours[i] + 'h'}</div></div>
          `).join('')}
        </div>

        <div class="pr-actions">
          <button class="kb ghost" data-action="prac-agenda" data-prac="${p.id}">Agenda</button>
          <button class="kb ghost" data-action="prac-edit" data-prac="${p.id}">Modifier</button>
          <button class="kb atlas" data-action="prac-commission" data-prac="${p.id}">Commission</button>
        </div>
      </div>
    `;
  }

  /* ─── Main drawer ─── */
  handlers['nav-practitioners'] = () => {
    const totalRdv = PRACS.reduce((s, p) => s + p.rdv, 0);
    const totalRev = PRACS.reduce((s, p) => s + p.revenue, 0);
    const avgNps = Math.round(PRACS.reduce((s, p) => s + p.nps, 0) / PRACS.length);
    const totalCerts = PRACS.reduce((s, p) => s + p.certs.length, 0);
    const expiring = PRACS.reduce((s, p) => s + p.certs.filter(c => c.s !== 'ok').length, 0);

    window.Kiwi.appPage('practitioners', {
      title: 'Praticien·ne·s · Spa Bahia',
      subtitle: '3 actives · Hivernage, Marrakech · planning T+1',
      body: `
        <div class="p-hero">
          <div class="l">PERFORMANCE ÉQUIPE · AVRIL</div>
          <div class="big">${fmt(totalRev)} <span style="font-size:18px; opacity:0.7;">MAD</span></div>
          <div class="sub">${totalRdv} RDV cumulés · NPS moyen ${avgNps} · panier moyen ${fmt(Math.round(totalRev / totalRdv))} MAD · 3 praticiennes en service</div>
        </div>

        <div class="p-toolbar">
          <div class="p-search">Rechercher par nom, certification, spécialité…</div>
          <button class="kb ghost" data-action="prac-tracker">Certifications (${expiring}/${totalCerts} à suivre)</button>
          <button class="kb primary" data-action="prac-add">Ajouter une praticienne</button>
        </div>

        <div class="pr-grid">
          ${PRACS.map(renderCard).join('')}
          <div class="pr-card" style="display:flex; align-items:center; justify-content:center; flex-direction:column; gap:10px; border-style:dashed; cursor:pointer; min-height:300px;" data-action="prac-add">
            <div class="pr-blob" style="background: var(--paper); border: 1.5px dashed var(--n-300); color: var(--n-500);">+</div>
            <div style="font-weight:600; font-size:14px; letter-spacing:-0.01em;">Recruter une nouvelle praticienne</div>
            <div style="font-size:11.5px; color:var(--n-500); text-align:center; max-width:220px; line-height:1.45;">Wizard guidé · profil, certifications, planning et commission en 4 étapes.</div>
          </div>
        </div>
      `,
    });

    // Wire card-level actions inside this page
    const root = document.querySelector('.dash-genpage');
    if (!root) return;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      const id = btn.dataset.prac;
      if (a === 'prac-agenda') openAgenda(id);
      else if (a === 'prac-edit') openEdit(id);
      else if (a === 'prac-commission') openCommission(id);
      else if (a === 'prac-tracker') openTracker();
      else if (a === 'prac-add') openAddWizard();
      else if (a === 'prac-remove') confirmRemove(id);
    });
  };

  /* ─── Helpers ─── */
  const getPrac = (id) => PRACS.find(p => p.id === id) || PRACS[0];

  function openAgenda(id) {
    const p = getPrac(id);
    drawer({
      title: `Agenda · ${p.name}`,
      subtitle: `${p.rdv} RDV ce mois · ${fmt(p.revenue)} MAD`,
      width: 520,
      body: `
        <div class="p-card">
          <div class="head"><h4>Aujourd'hui</h4><span class="meta">29 AVR · 8 RDV</span></div>
          ${[
            ['09:30', 'Soin visage anti-âge · Mme. Tazi', '60 min · 750 MAD'],
            ['11:00', 'Massage thérapeutique · M. Chraibi', '90 min · 950 MAD'],
            ['13:00', 'Pause déjeuner', '60 min'],
            ['14:30', 'Drainage lymphatique · Mme. Bennani', '60 min · 700 MAD'],
            ['16:00', 'Rituel hammam premium · couple Idrissi', '120 min · 1 800 MAD'],
            ['18:30', 'Soin éclat express · Mme. Fassi', '45 min · 550 MAD'],
          ].map(([t, n, m]) => `
            <div class="resv-line"><div class="t">${t}</div><div class="info"><div class="n">${n}</div><div class="m">${m}</div></div><div><span class="chip ok">confirmé</span></div></div>
          `).join('')}
        </div>
        <button class="kb ghost" style="width:100%; justify-content:center; margin-top:10px;" onclick="window.Kiwi.toast('Export ICS envoyé', { desc: 'Agenda 7 jours synchronisé sur Google Calendar.', type: 'success' })">Exporter en .ics</button>
      `,
    });
  }

  function openEdit(id) {
    const p = getPrac(id);
    modal({
      tag: 'PROFIL PRATICIEN·NE',
      title: `Modifier · ${p.name}`,
      desc: 'Mise à jour des spécialités, taux de commission et planning de référence.',
      width: 560,
      body: `
        <div class="kf-group"><label class="kf-label">Nom complet</label><input class="kf-input" value="${p.name}"/></div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Rôle</label><input class="kf-input" value="${p.role}"/></div>
          <div class="kf-group"><label class="kf-label">Commission (%)</label><input class="kf-input" type="number" value="${p.commission}"/></div>
        </div>
        <div class="kf-group"><label class="kf-label">Spécialités (séparées par virgules)</label><input class="kf-input" value="${p.specialties.join(', ')}"/></div>
        <div class="kf-group"><label class="kf-label">Bio courte</label><textarea class="kf-input" rows="3">${p.bio}</textarea></div>
        <div class="kf-help">Les changements de commission s'appliquent au prochain cycle de paie (T+1 du mois).</div>
      `,
      foot: `
        <button class="kb ghost" data-action="prac-remove" data-prac="${p.id}">Désactiver le profil</button>
        <div style="flex:1;"></div>
        <button class="kb ghost" onclick="this.closest('.kiwi-backdrop').classList.remove('in'); setTimeout(()=>this.closest('.kiwi-backdrop')?.remove(), 280)">Annuler</button>
        <button class="kb primary" onclick="window.Kiwi.toast('Profil mis à jour', { desc: '${p.name} · changements actifs sur le planning T+1.', type: 'success' }); this.closest('.kiwi-backdrop').classList.remove('in'); setTimeout(()=>this.closest('.kiwi-backdrop')?.remove(), 280)">Enregistrer</button>
      `,
    });
  }

  function confirmRemove(id) {
    const p = getPrac(id);
    modal({
      tag: 'CONFIRMATION',
      title: `Désactiver ${p.name} ?`,
      desc: 'Le profil sera retiré du planning public mais conservé pour l\'historique paie et CNSS. Les RDV à venir seront réassignés.',
      width: 460,
      body: `
        <div style="background: #FDE8E4; color: #9B2F22; padding: 12px 14px; border-radius: 10px; font-size: 12.5px; line-height: 1.5;">
          ${p.rdv > 0 ? `<b>${p.rdv} RDV ce mois</b> et 12 RDV à venir devront être réattribués manuellement.` : 'Aucun RDV en cours.'}
        </div>
      `,
      foot: `
        <button class="kb ghost" onclick="this.closest('.kiwi-backdrop').classList.remove('in'); setTimeout(()=>this.closest('.kiwi-backdrop')?.remove(), 280)">Annuler</button>
        <button class="kb danger" onclick="window.Kiwi.toast('Profil désactivé', { desc: '${p.name} · 12 RDV en attente de réassignation.', type: 'warn' }); document.querySelectorAll('.kiwi-backdrop').forEach(b=>{b.classList.remove('in'); setTimeout(()=>b.remove(), 280)})">Désactiver</button>
      `,
    });
  }

  /* ─── Commission calculator ─── */
  function openCommission(presetId) {
    const opts = PRACS.map(p => `<option value="${p.id}" ${p.id === presetId ? 'selected' : ''}>${p.name} · ${p.commission}%</option>`).join('');
    modal({
      tag: 'CALCUL DE COMMISSION',
      title: 'Commission praticien·ne',
      desc: 'Saisissez le nombre de prestations et le panier moyen pour visualiser la commission nette CNSS.',
      width: 540,
      body: `
        <div class="kf-group"><label class="kf-label">Praticienne</label>
          <select class="kf-input" id="pr-calc-who">${opts}</select>
        </div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Nombre de prestations</label><input class="kf-input" id="pr-calc-n" type="number" value="60"/></div>
          <div class="kf-group"><label class="kf-label">Panier moyen (MAD)</label><input class="kf-input" id="pr-calc-avg" type="number" value="450"/></div>
        </div>
        <div class="pr-calc-out" id="pr-calc-out">
          <div class="l">COMMISSION NETTE · APRÈS CNSS</div>
          <div class="v" id="pr-calc-v">— MAD</div>
          <div class="br">
            <div><span>CA brut généré</span><br><b id="pr-calc-gross">— MAD</b></div>
            <div><span>Commission brute</span><br><b id="pr-calc-com">— MAD</b></div>
            <div><span>CNSS (4,48%)</span><br><b id="pr-calc-cnss">— MAD</b></div>
            <div><span>Taux appliqué</span><br><b id="pr-calc-rate">—%</b></div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb ghost" onclick="this.closest('.kiwi-backdrop').classList.remove('in'); setTimeout(()=>this.closest('.kiwi-backdrop')?.remove(), 280)">Fermer</button>
        <button class="kb primary" id="pr-calc-export">Exporter fiche paie</button>
      `,
    });

    const recompute = () => {
      const id = document.getElementById('pr-calc-who').value;
      const p = getPrac(id);
      const n = +document.getElementById('pr-calc-n').value || 0;
      const avg = +document.getElementById('pr-calc-avg').value || 0;
      const gross = n * avg;
      const com = Math.round(gross * (p.commission / 100));
      const cnss = Math.round(com * 0.0448);
      const net = com - cnss;
      document.getElementById('pr-calc-v').textContent = fmt(net) + ' MAD';
      document.getElementById('pr-calc-gross').textContent = fmt(gross) + ' MAD';
      document.getElementById('pr-calc-com').textContent = fmt(com) + ' MAD';
      document.getElementById('pr-calc-cnss').textContent = '− ' + fmt(cnss) + ' MAD';
      document.getElementById('pr-calc-rate').textContent = p.commission + '%';
    };
    setTimeout(() => {
      ['pr-calc-who', 'pr-calc-n', 'pr-calc-avg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', recompute);
      });
      recompute();
      const exp = document.getElementById('pr-calc-export');
      if (exp) exp.onclick = () => {
        toast('Fiche paie générée', { desc: 'PDF prêt pour validation comptable · synchronisée avec le module CNSS.', type: 'success' });
      };
    }, 50);
  }

  /* ─── Certification tracker ─── */
  function openTracker() {
    drawer({
      title: 'Certifications & formations',
      subtitle: 'Suivi renouvellement par praticienne · alerte 90 jours',
      width: 560,
      body: `
        ${PRACS.map(p => `
          <div class="p-card">
            <div class="head">
              <h4>${p.name}</h4>
              <span class="meta">${p.certs.length} CERTIFICATIONS</span>
            </div>
            ${p.certs.map(c => `
              <div class="pr-cert">
                <div><div class="n">${c.n}</div><div class="m">${c.d}</div></div>
                <span class="pr-cert-stat ${c.s}">${c.sl}</span>
                <button class="kb ghost" style="padding:6px 10px; font-size:11px;" onclick="window.Kiwi.toast('Rappel programmé', { desc: 'Notification envoyée 30 jours avant expiration.', type: 'info' })">Rappel</button>
              </div>
            `).join('')}
          </div>
        `).join('')}
        <button class="kb atlas" style="width:100%; justify-content:center; margin-top:10px;" onclick="window.Kiwi.toast('Export RH · bientôt', { desc: 'La synthèse RH sera exportable quand la paie sera branchée sur vos heures réelles.', type: 'pend' })">Exporter le tableau de bord RH</button>
      `,
    });
  }

  /* ─── Add practitioner wizard ─── */
  function openAddWizard(step = 1) {
    const total = 4;
    const steps = ['Identité', 'Spécialités', 'Certifications', 'Commission & planning'];
    const bodies = {
      1: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Prénom</label><input class="kf-input" placeholder="Imane"/></div>
          <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" placeholder="Alaoui"/></div>
        </div>
        <div class="kf-group"><label class="kf-label">Email pro</label><input class="kf-input" type="email" placeholder="praticien@spabahia.ma"/></div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">CIN</label><input class="kf-input" placeholder="BE123456"/></div>
          <div class="kf-group"><label class="kf-label">CNSS</label><input class="kf-input" placeholder="999 999 999"/></div>
        </div>
      `,
      2: `
        <div class="kf-help" style="margin-bottom:10px;">Cochez les spécialités. Affecte le routage automatique des RDV en ligne.</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          ${['Visage anti-âge', 'Massage suédois', 'Massage californien', 'Drainage lymphatique', 'Hammam traditionnel', 'Gommage savon noir', 'Réflexologie', 'Soins haute technologie', 'Modelages corps', 'Rituel marocain'].map(s => `
            <label style="display:flex; align-items:center; gap:8px; padding:9px 12px; border:1px solid var(--n-200); border-radius:10px; font-size:13px; cursor:pointer;"><input type="checkbox"/> ${s}</label>
          `).join('')}
        </div>
      `,
      3: `
        <div class="kf-help" style="margin-bottom:10px;">Ajoutez les certifications principales. Le tracker enverra une alerte 90 jours avant expiration.</div>
        <div class="kf-group"><label class="kf-label">Certification principale</label>
          <select class="kf-input"><option>CIDESCO Suisse</option><option>RNCP niveau 5 esthétique</option><option>École hammam Marrakech</option><option>Certification massage thérapeutique</option><option>Autre</option></select>
        </div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Date d'obtention</label><input class="kf-input" type="date"/></div>
          <div class="kf-group"><label class="kf-label">Date de renouvellement</label><input class="kf-input" type="date"/></div>
        </div>
        <button class="kb ghost" style="font-size:12px; padding:8px 14px;">+ Ajouter une certification</button>
      `,
      4: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Taux de commission (%)</label><input class="kf-input" type="number" value="20"/></div>
          <div class="kf-group"><label class="kf-label">Date d'embauche</label><input class="kf-input" type="date"/></div>
        </div>
        <div class="kf-group"><label class="kf-label">Planning de référence</label>
          <div style="display:grid; grid-template-columns: repeat(7,1fr); gap:6px;">
            ${dows.map(d => `<label style="text-align:center; padding:8px 4px; border:1px solid var(--n-200); border-radius:8px; font-size:11px; font-family:var(--mono); cursor:pointer;"><div style="font-weight:600;">${d}</div><input type="checkbox" style="margin-top:4px;"/></label>`).join('')}
          </div>
        </div>
        <div class="kf-help">La praticienne recevra ses identifiants par email pour accéder à son agenda mobile.</div>
      `,
    };
    modal({
      tag: `ÉTAPE ${step} / ${total} · ${steps[step - 1].toUpperCase()}`,
      title: 'Ajouter une praticienne',
      desc: 'Configuration complète en 4 étapes · profil actif sous 2 minutes.',
      width: 560,
      body: `
        <div class="wiz-steps">
          ${[1, 2, 3, 4].map(i => `<div class="wiz-step ${i < step ? 'done' : i === step ? 'active' : ''}"></div>`).join('')}
        </div>
        ${bodies[step]}
      `,
      foot: `
        ${step > 1 ? `<button class="kb ghost" id="wiz-back">Retour</button>` : `<button class="kb ghost" onclick="this.closest('.kiwi-backdrop').classList.remove('in'); setTimeout(()=>this.closest('.kiwi-backdrop')?.remove(), 280)">Annuler</button>`}
        <div style="flex:1;"></div>
        <button class="kb primary" id="wiz-next">${step === total ? 'Activer le profil' : 'Continuer'}</button>
      `,
    });
    setTimeout(() => {
      const next = document.getElementById('wiz-next');
      const back = document.getElementById('wiz-back');
      if (next) next.onclick = () => {
        document.querySelectorAll('.kiwi-backdrop').forEach(b => { b.classList.remove('in'); setTimeout(() => b.remove(), 280); });
        if (step === total) {
          toast('Praticienne ajoutée', { desc: 'Profil actif · email d\'invitation envoyé. Premier RDV planifiable dès demain.', type: 'success' });
          if (Kiwi.confetti) Kiwi.confetti();
        } else {
          setTimeout(() => openAddWizard(step + 1), 120);
        }
      };
      if (back) back.onclick = () => {
        document.querySelectorAll('.kiwi-backdrop').forEach(b => { b.classList.remove('in'); setTimeout(() => b.remove(), 280); });
        setTimeout(() => openAddWizard(step - 1), 120);
      };
    }, 50);
  }

  /* ─── Auxiliary handlers (callable via [data-action] elsewhere) ─── */
  handlers['practitioner-edit'] = () => openEdit('NH');
  handlers['practitioner-commission'] = () => openCommission('NH');
  handlers['practitioner-tracker'] = () => openTracker();
  handlers['practitioner-add'] = () => openAddWizard(1);
})();

/* ═══ Section 2 spa · clients ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Spa Bahia · sidebar handler · nav-clients
 * Mindbody / Booksy / Vagaro CRM-tier client list with profile drawer.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const Kiwi = window.Kiwi || {};
  const handlers = Kiwi.handlers;
  if (!handlers) return;
  const { toast, modal, drawer, confetti } = Kiwi;

  /* ─── Inject local CSS once ─── */
  if (!document.getElementById('spa-clients-css')) {
    const s = document.createElement('style');
    s.id = 'spa-clients-css';
    s.textContent = `
    .sc-pills { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 14px; padding: 4px; background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 12px; }
    html[data-theme="dark"] .sc-pills { background: var(--paper-muted); }
    .sc-pill { flex: 0 0 auto; padding: 8px 14px; border-radius: 9px; font-size: 12.5px; font-weight: 500; color: var(--n-500); cursor: pointer; transition: background 150ms, color 150ms; display: inline-flex; align-items: center; gap: 7px; border: 0; background: none; font-family: var(--sans); }
    .sc-pill:hover { color: var(--ink); }
    .sc-pill.on { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    html[data-theme="dark"] .sc-pill.on { background: var(--ink-soft); color: var(--paper); }
    .sc-pill .ct { font-family: var(--mono); font-size: 10.5px; color: var(--n-500); background: var(--n-100); padding: 1px 7px; border-radius: 999px; letter-spacing: 0.04em; }
    .sc-pill.on .ct { background: var(--mint-soft); color: var(--atlas); }

    .sc-flag { display: inline-block; width: 12px; height: 8px; border-radius: 2px; vertical-align: middle; margin-right: 7px; box-shadow: inset 0 0 0 1px rgba(10,15,13,0.08); }
    .sc-flag.ma { background: linear-gradient(180deg, #C1272D 50%, #C1272D 50%); }
    .sc-flag.fr { background: linear-gradient(90deg, #002395 33%, #fff 33% 66%, #ED2939 66%); }
    .sc-flag.es { background: linear-gradient(180deg, #AA151B 25%, #F1BF00 25% 75%, #AA151B 75%); }
    .sc-flag.us { background: linear-gradient(180deg, #B22234 50%, #fff 50%); }
    .sc-flag.de { background: linear-gradient(180deg, #000 33%, #DD0000 33% 66%, #FFCE00 66%); }

    .sc-tier { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 600; font-family: var(--mono); letter-spacing: 0.06em; text-transform: uppercase; }
    .sc-tier.bronze { background: rgba(217,154,43,0.16); color: var(--warn-ink); }
    .sc-tier.argent { background: var(--n-100); color: var(--n-600); }
    .sc-tier.or { background: var(--mint-soft); color: var(--atlas); }
    .sc-tier.platine { background: var(--riad); color: var(--mint); }
    html[data-theme="dark"] .sc-tier.argent { background: rgba(255,255,255,0.06); color: var(--paper); }

    .sc-bday { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; background: rgba(217,154,43,0.18); color: var(--warn-ink); font-size: 10.5px; font-weight: 500; font-family: var(--mono); letter-spacing: 0.04em; margin-left: 6px; }
    html[data-theme="dark"] .sc-bday { background: rgba(217,154,43,0.22); color: #E5B764; }

    .sc-bday-panel { background: linear-gradient(135deg, rgba(217,154,43,0.14), rgba(217,154,43,0.04)); border: 1px solid rgba(217,154,43,0.32); border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .sc-bday-panel .ic { width: 40px; height: 40px; border-radius: 10px; background: rgba(217,154,43,0.22); color: var(--warn-ink); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .sc-bday-panel .body { flex: 1; min-width: 220px; }
    .sc-bday-panel .body .t { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
    .sc-bday-panel .body .d { font-size: 12px; color: var(--n-600); margin-top: 3px; line-height: 1.45; }

    .sc-empty { padding: 40px 20px; text-align: center; color: var(--n-500); font-size: 13px; }

    .sc-prof-head { display: grid; grid-template-columns: 56px 1fr auto; gap: 16px; align-items: center; padding: 4px 0 14px; border-bottom: 1px solid var(--n-200); margin-bottom: 14px; }
    .sc-prof-av { width: 56px; height: 56px; border-radius: 50%; background: var(--atlas); color: var(--paper); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 20px; letter-spacing: -0.02em; }
    .sc-prof-av.platine { background: var(--riad); color: var(--mint); }
    .sc-prof-av.or { background: var(--atlas); }
    .sc-prof-av.argent { background: var(--n-500); }
    .sc-prof-av.bronze { background: #D99A2B; }
    .sc-prof-meta { font-family: var(--mono); font-size: 11px; color: var(--n-500); margin-top: 4px; letter-spacing: 0.04em; }

    .sc-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; font-size: 13px; margin-top: 4px; }
    .sc-info-grid dt { color: var(--n-500); padding: 6px 0; border-bottom: 1px solid var(--n-200); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; font-family: var(--mono); }
    .sc-info-grid dd { margin: 0; padding: 6px 0; border-bottom: 1px solid var(--n-200); text-align: right; font-weight: 500; }

    .sc-allergy { background: rgba(195,49,33,0.08); border: 1px solid rgba(195,49,33,0.2); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; display: flex; gap: 10px; align-items: flex-start; }
    .sc-allergy .ic { width: 28px; height: 28px; border-radius: 8px; background: rgba(195,49,33,0.16); color: #9B2F22; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .sc-allergy .b { flex: 1; }
    .sc-allergy .b .t { font-size: 13px; font-weight: 600; color: #9B2F22; letter-spacing: -0.01em; }
    .sc-allergy .b .d { font-size: 12px; color: var(--n-600); margin-top: 3px; line-height: 1.45; }

    .sc-history-row { display: grid; grid-template-columns: 80px 1fr 110px 70px; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--n-200); font-size: 12.5px; }
    .sc-history-row:first-of-type { border-top: 0; }
    .sc-history-row .dt { font-family: var(--mono); font-size: 11px; color: var(--n-500); letter-spacing: 0.04em; }
    .sc-history-row .svc { font-weight: 500; font-size: 13px; }
    .sc-history-row .pr { font-family: var(--mono); font-weight: 600; text-align: right; font-feature-settings: "tnum" 1; }
    .sc-history-row .pra { font-size: 11.5px; color: var(--n-500); }

    .sc-gift { background: linear-gradient(135deg, var(--inverse-surface), var(--inverse-line)); color: var(--paper); border-radius: 14px; padding: 18px; margin-bottom: 12px; position: relative; overflow: hidden; }
    .sc-gift::after { content: ""; position: absolute; right: -50px; top: -50px; width: 160px; height: 160px; background: radial-gradient(circle, var(--mint), transparent 60%); opacity: 0.18; pointer-events: none; }
    .sc-gift .l { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.12em; color: var(--mint); }
    .sc-gift .v { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin-top: 4px; font-feature-settings: "tnum" 1; }
    .sc-gift .s { font-size: 12px; color: #c6ead4; margin-top: 4px; }
    .sc-gift .ac { display: flex; gap: 8px; margin-top: 12px; position: relative; z-index: 1; }

    .sc-amounts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
    .sc-amount { padding: 12px 8px; background: var(--surface); border: 1px solid var(--n-200); border-radius: 10px; text-align: center; cursor: pointer; transition: transform 150ms, opacity 150ms, background-color 150ms, border-color 150ms, color 150ms, box-shadow 150ms; font-family: var(--mono); font-size: 13px; font-weight: 500; }
    html[data-theme="dark"] .sc-amount { background: var(--paper-soft); }
    .sc-amount:hover { border-color: var(--atlas); }
    .sc-amount.on { background: var(--atlas); color: var(--paper); border-color: var(--atlas); }

    .sc-wa-preview { background: #ECE5DD; border-radius: 14px; padding: 14px; margin: 12px 0; }
    html[data-theme="dark"] .sc-wa-preview { background: var(--paper-muted); }
    .sc-wa-bubble { background: #DCF8C6; border-radius: 8px 8px 8px 2px; padding: 10px 12px; max-width: 90%; font-size: 13px; color: #0A0F0D; line-height: 1.5; }
    html[data-theme="dark"] .sc-wa-bubble { background: rgba(125,242,176,0.18); color: var(--paper); }
    .sc-wa-time { font-size: 10px; color: var(--n-500); margin-top: 4px; text-align: right; font-family: var(--mono); }

    .sc-table tbody tr.sc-hide { display: none; }
    `;
    document.head.appendChild(s);
  }

  /* ─── Data ─── */
  const PRACTITIONERS = ['Nour', 'Salma', 'Yasmine', 'Imane'];
  const SERVICES = [
    'Hammam Royal',
    'Massage Argan 60min',
    'Massage Pierres Chaudes',
    'Soin Visage Hydratant',
    'Gommage Beldi',
    'Manucure Spa',
    'Pédicure Marrakchia',
    'Rituel Kessa',
    'Massage Californien',
    'Soin Anti-Âge',
  ];
  const CLIENTS = [
    { id: 1, fn: 'Lisa', ln: 'P.', flag: 'us', ltv: 38000, fav: 'Nour', last: "Aujourd'hui", tier: 'platine', bday: true, allergies: ['Allergie aux huiles essentielles d\'agrumes'], iban: 'US •• 8412' },
    { id: 2, fn: 'Anna', ln: 'M.', flag: 'de', ltv: 18200, fav: 'Nour', last: 'Hier', tier: 'or', bday: false, allergies: [] },
    { id: 3, fn: 'Sophie', ln: 'L.', flag: 'fr', ltv: 8400, fav: 'Salma', last: 'Il y a 3j', tier: 'argent', bday: true, allergies: [] },
    { id: 4, fn: 'Yasmine', ln: 'T.', flag: 'ma', ltv: 22100, fav: 'Yasmine', last: 'Il y a 1 sem', tier: 'or', bday: false, allergies: ['Peau sensible, éviter cire chaude'] },
    { id: 5, fn: 'Imane', ln: 'S.', flag: 'ma', ltv: 16800, fav: 'Nour', last: "Aujourd'hui", tier: 'or', bday: false, allergies: [] },
    { id: 6, fn: 'Karim', ln: 'L.', flag: 'ma', ltv: 6800, fav: 'Yasmine', last: 'Il y a 2 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 7, fn: 'Camille', ln: 'R.', flag: 'fr', ltv: 9200, fav: 'Salma', last: 'Hier', tier: 'argent', bday: false, allergies: [] },
    { id: 8, fn: 'Lucia', ln: 'M.', flag: 'es', ltv: 7100, fav: 'Salma', last: 'Il y a 3j', tier: 'argent', bday: false, allergies: [] },
    { id: 9, fn: 'Diana', ln: 'K.', flag: 'us', ltv: 3200, fav: 'Yasmine', last: 'Il y a 1 mois', tier: 'bronze', bday: false, allergies: [] },
    { id: 10, fn: 'Karen', ln: 'B.', flag: 'us', ltv: 4200, fav: 'Salma', last: 'Il y a 2 sem', tier: 'bronze', bday: false, allergies: [] },
    { id: 11, fn: 'Manon', ln: 'B.', flag: 'fr', ltv: 5400, fav: 'Imane', last: 'Il y a 1 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 12, fn: 'Hicham', ln: 'R.', flag: 'ma', ltv: 2800, fav: 'Yasmine', last: 'Il y a 3 mois', tier: 'bronze', bday: false, allergies: [] },
    { id: 13, fn: 'Salma', ln: 'O.', flag: 'ma', ltv: 19400, fav: 'Nour', last: 'Hier', tier: 'or', bday: false, allergies: [] },
    { id: 14, fn: 'Marion', ln: 'K.', flag: 'fr', ltv: 31600, fav: 'Salma', last: "Aujourd'hui", tier: 'platine', bday: true, allergies: ['Cicatrice récente, éviter zone lombaire'], iban: 'FR •• 2207' },
    { id: 15, fn: 'Aïcha', ln: 'B.', flag: 'ma', ltv: 8100, fav: 'Imane', last: 'Il y a 1 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 16, fn: 'Mehdi', ln: 'C.', flag: 'ma', ltv: 1400, fav: 'Yasmine', last: 'Il y a 3 mois', tier: 'bronze', bday: false, allergies: [] },
    { id: 17, fn: 'Emma', ln: 'D.', flag: 'fr', ltv: 12700, fav: 'Nour', last: 'Hier', tier: 'argent', bday: false, allergies: [] },
    { id: 18, fn: 'Mariana', ln: 'V.', flag: 'es', ltv: 14800, fav: 'Salma', last: 'Il y a 3j', tier: 'argent', bday: false, allergies: [] },
    { id: 19, fn: 'Fatima', ln: 'Z.', flag: 'ma', ltv: 24600, fav: 'Nour', last: "Aujourd'hui", tier: 'or', bday: false, allergies: ['Hypertension, pression douce uniquement'] },
    { id: 20, fn: 'Léa', ln: 'G.', flag: 'fr', ltv: 6200, fav: 'Imane', last: 'Il y a 2 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 21, fn: 'Helga', ln: 'W.', flag: 'de', ltv: 11400, fav: 'Salma', last: 'Il y a 1 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 22, fn: 'Jessica', ln: 'H.', flag: 'us', ltv: 9800, fav: 'Yasmine', last: 'Il y a 3j', tier: 'argent', bday: false, allergies: [] },
    { id: 23, fn: 'Carolina', ln: 'F.', flag: 'es', ltv: 3700, fav: 'Imane', last: 'Il y a 1 mois', tier: 'bronze', bday: false, allergies: [] },
    { id: 24, fn: 'Nawal', ln: 'A.', flag: 'ma', ltv: 28400, fav: 'Nour', last: 'Hier', tier: 'or', bday: false, allergies: [] },
    { id: 25, fn: 'Olivier', ln: 'P.', flag: 'fr', ltv: 4900, fav: 'Yasmine', last: 'Il y a 2 sem', tier: 'bronze', bday: false, allergies: [] },
    { id: 26, fn: 'Rachel', ln: 'S.', flag: 'us', ltv: 17200, fav: 'Nour', last: "Aujourd'hui", tier: 'or', bday: false, allergies: ['Asthme, éviter huiles fortes'] },
    { id: 27, fn: 'Klaus', ln: 'B.', flag: 'de', ltv: 5600, fav: 'Salma', last: 'Il y a 1 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 28, fn: 'Inès', ln: 'M.', flag: 'fr', ltv: 35200, fav: 'Nour', last: 'Hier', tier: 'platine', bday: false, allergies: [], iban: 'FR •• 7180' },
    { id: 29, fn: 'Soukaina', ln: 'E.', flag: 'ma', ltv: 13900, fav: 'Imane', last: 'Il y a 3j', tier: 'argent', bday: false, allergies: [] },
    { id: 30, fn: 'Pablo', ln: 'C.', flag: 'es', ltv: 2300, fav: 'Yasmine', last: 'Il y a 1 mois', tier: 'bronze', bday: false, allergies: [] },
  ];

  const fmtMAD = (n) => n.toLocaleString('fr-FR').replace(/ /g, ' ');
  const tierLabel = { bronze: 'Bronze', argent: 'Argent', or: 'Or', platine: 'Platine' };
  const isNew = (c) => c.last === "Aujourd'hui" || c.last === 'Hier';
  const isFidele = (c) => c.ltv >= 5000 && c.ltv < 30000;
  const isVIP = (c) => c.tier === 'or' || c.tier === 'platine';

  /* ─── History generator ─── */
  function buildHistory(c) {
    const out = [];
    const dates = ["Aujourd'hui", 'Il y a 5j', 'Il y a 12j', 'Il y a 3 sem', 'Il y a 1 mois', 'Il y a 2 mois', 'Il y a 3 mois', 'Il y a 5 mois'];
    let seed = c.id;
    for (let i = 0; i < 8; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const sv = SERVICES[Math.floor((seed / 233280) * SERVICES.length)];
      seed = (seed * 9301 + 49297) % 233280;
      const pr = 350 + Math.floor((seed / 233280) * 9) * 150;
      seed = (seed * 9301 + 49297) % 233280;
      const pra = PRACTITIONERS[Math.floor((seed / 233280) * PRACTITIONERS.length)];
      out.push({ d: dates[i], s: sv, pra, p: pr });
    }
    return out;
  }

  /* ─── Row renderer ─── */
  function rowHTML(c) {
    const bdayChip = c.bday ? `<span class="sc-bday">Anniv. avril</span>` : '';
    return `
      <tr data-spa-row data-spa-id="${c.id}" data-spa-tier="${c.tier}" data-spa-new="${isNew(c) ? 1 : 0}" data-spa-fid="${isFidele(c) ? 1 : 0}" data-spa-vip="${isVIP(c) ? 1 : 0}" data-spa-bday="${c.bday ? 1 : 0}">
        <td><span class="sc-flag ${c.flag}"></span><b>${c.fn} ${c.ln}</b>${bdayChip}</td>
        <td style="color:var(--n-600);">${c.last}</td>
        <td class="mono right">${fmtMAD(c.ltv)} <span style="color:var(--n-400); font-size:11px;">MAD</span></td>
        <td>${c.fav}</td>
        <td><span class="sc-tier ${c.tier}">${tierLabel[c.tier]}</span></td>
      </tr>
    `;
  }

  /* ─── Profile drawer ─── */
  function openProfile(id) {
    const c = CLIENTS.find((x) => x.id === id);
    if (!c) return;
    const history = buildHistory(c);
    const giftBalance = c.tier === 'platine' ? 1500 : c.tier === 'or' ? 800 : c.tier === 'argent' ? 250 : 0;
    const initials = (c.fn[0] + c.ln[0]).toUpperCase();
    const allergiesHTML = c.allergies.length
      ? c.allergies.map((a) => `
        <div class="sc-allergy">
          <div class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
          <div class="b"><div class="t">Contre-indication</div><div class="d">${a}</div></div>
        </div>
      `).join('')
      : `<div style="font-size:12.5px; color:var(--n-500); padding:8px 0;">Aucune allergie ou contre-indication signalée.</div>`;
    drawer({
      title: `${c.fn} ${c.ln}`,
      subtitle: `Membre ${tierLabel[c.tier]} · ${fmtMAD(c.ltv)} MAD à vie`,
      width: 560,
      body: `
        <div class="sc-prof-head">
          <div class="sc-prof-av ${c.tier}">${initials}</div>
          <div>
            <div style="font-size:15px; font-weight:600; letter-spacing:-0.01em;"><span class="sc-flag ${c.flag}"></span>${c.fn} ${c.ln} <span class="sc-tier ${c.tier}" style="margin-left:6px;">${tierLabel[c.tier]}</span></div>
            <div class="sc-prof-meta">CL-${String(c.id).padStart(4, '0')} · Praticienne fav. ${c.fav}${c.bday ? ' · Anniv. ce mois' : ''}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="kb ghost" data-action="spa-cli-block" data-arg="${c.id}" style="padding:7px 12px; font-size:12px;">Bloquer</button>
          </div>
        </div>

        <div class="p-card">
          <div class="head"><h4>Coordonnées</h4></div>
          <dl class="sc-info-grid">
            <dt>Téléphone</dt><dd class="mono">+212 6 ${20 + (c.id % 80)} ${10 + (c.id * 3) % 90} ${c.id * 7 % 100} ${c.id * 11 % 100}</dd>
            <dt>Email</dt><dd>${c.fn.toLowerCase()}.${c.ln[0].toLowerCase()}@mail.com</dd>
            <dt>Langue</dt><dd>${c.flag === 'fr' ? 'Français' : c.flag === 'ma' ? 'العربية / Français' : c.flag === 'es' ? 'Español' : c.flag === 'de' ? 'Deutsch' : 'English'}</dd>
            <dt>Source</dt><dd>${c.tier === 'platine' ? 'Concierge hôtel' : c.tier === 'or' ? 'Recommandation' : 'Walk-in'}</dd>
            ${c.iban ? `<dt>IBAN VIP</dt><dd class="mono">${c.iban}</dd>` : ''}
          </dl>
          <div style="display:flex; gap:8px; margin-top:14px;">
            <button class="kb atlas" data-action="spa-cli-wa" data-arg="${c.id}" style="flex:1; justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-9 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.2A8.38 8.38 0 013 11.5a8.5 8.5 0 0118 0z"/></svg>Rappel WhatsApp</button>
            ${c.bday ? `<button class="kb ghost" data-action="spa-cli-bday" data-arg="${c.id}" style="flex:1; justify-content:center;">Vœux + 15%</button>` : ''}
          </div>
        </div>

        ${c.allergies.length ? `<div class="p-card" style="background:rgba(195,49,33,0.04); border-color:rgba(195,49,33,0.2);"><div class="head"><h4 style="color:#9B2F22;">Allergies & contre-indications</h4></div>${allergiesHTML}</div>` : ''}

        <div class="p-card">
          <div class="head"><h4>Historique des soins</h4><span class="meta">${history.length} dernières séances</span></div>
          ${history.map((h) => `
            <div class="sc-history-row">
              <div class="dt">${h.d}</div>
              <div><div class="svc">${h.s}</div><div class="pra">avec ${h.pra}</div></div>
              <div class="pr">${fmtMAD(h.p)} MAD</div>
              <div style="text-align:right;"><span class="chip ok">Réglé</span></div>
            </div>
          `).join('')}
        </div>

        <div class="sc-gift">
          <div class="l">CARTE CADEAU</div>
          <div class="v">${fmtMAD(giftBalance)} <span style="font-size:14px; opacity:0.7;">MAD</span></div>
          <div class="s">${giftBalance > 0 ? 'Solde disponible · expire dans 11 mois' : 'Aucune carte active'}</div>
          <div class="ac">
            <button class="kb" style="background:var(--mint); color:var(--riad); padding:8px 14px; font-size:12.5px;" data-action="spa-cli-gift" data-arg="${c.id}">+ Émettre une carte</button>
          </div>
        </div>

        <div class="p-card">
          <div class="head"><h4>Recommandations à domicile</h4><button class="kb ghost" data-action="spa-cli-note" data-arg="${c.id}" style="padding:5px 10px; font-size:11.5px;">Modifier</button></div>
          <div style="font-size:13px; color:var(--n-700); line-height:1.55; padding:8px 0;">
            ${c.tier === 'platine' || c.tier === 'or' ? 'Application matin : sérum hyaluronique. Soir : crème argan + 3 gouttes huile de figue de Barbarie. Hammam maison 2× / semaine.' : 'Hydratation quotidienne, exfoliation hebdomadaire au gommage Beldi. Suivi dans 4 semaines.'}
          </div>
        </div>
      `,
      foot: `
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="kb ghost" data-action="dismiss-drawer">Fermer</button>
          <button class="kb primary" data-action="spa-cli-book" data-arg="${c.id}">Réserver une séance</button>
        </div>
      `,
    });
  }

  /* ─── Auxiliary handlers ─── */
  handlers['spa-cli-search'] = () => toast('Recherche client', { desc: 'Recherche en temps réel par nom, téléphone, email.', type: 'info' });
  handlers['spa-cli-add'] = () => {
    modal({
      title: 'Nouveau client',
      tag: 'CRM SPA BAHIA',
      desc: 'Fiche client minimale, détails complétés à la première visite.',
      width: 560,
      body: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Prénom</label><input class="kf-input" value="Camélia" /></div>
          <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" value="Bensaid" /></div>
        </div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Téléphone</label><input class="kf-input" value="+212 6 12 34 56 78" /></div>
          <div class="kf-group"><label class="kf-label">Email</label><input class="kf-input" value="camelia.b@mail.com" /></div>
        </div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Langue préférée</label><select class="kf-input"><option>Français</option><option>العربية</option><option>English</option><option>Español</option><option>Deutsch</option></select></div>
          <div class="kf-group"><label class="kf-label">Source</label><select class="kf-input"><option>Walk-in</option><option>Concierge hôtel</option><option>Recommandation</option><option>Instagram</option></select></div>
        </div>
        <div class="kf-group"><label class="kf-label">Allergies / contre-indications</label><textarea class="kf-input" rows="3" placeholder="Ex : peau sensible, hypertension, allergie aux huiles d'agrumes…"></textarea></div>
      `,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb primary" data-action="spa-cli-add-confirm">Créer la fiche</button>`,
    });
  };
  handlers['spa-cli-add-confirm'] = () => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    confetti();
    toast('Fiche client créée', { desc: 'Camélia Bensaid · ajoutée au CRM Spa Bahia.', type: 'success' });
  };
  handlers['spa-cli-row'] = (el) => openProfile(+el.dataset.arg);
  handlers['spa-cli-wa'] = (el) => {
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    modal({
      title: 'Rappel WhatsApp',
      tag: 'BAHIA SPA',
      desc: `Aperçu du message envoyé à ${c.fn} ${c.ln}.`,
      width: 480,
      body: `
        <div class="sc-wa-preview">
          <div class="sc-wa-bubble">
            Bonjour ${c.fn}, c'est Bahia Spa Hivernage. Votre praticienne ${c.fav} a un créneau libre demain à 15h pour votre soin habituel. Souhaitez-vous confirmer ?
            <div class="sc-wa-time">14:32 ✓✓</div>
          </div>
        </div>
        <textarea class="kf-input" rows="3">Bonjour ${c.fn}, c'est Bahia Spa Hivernage. Votre praticienne ${c.fav} a un créneau libre demain à 15h pour votre soin habituel.</textarea>
      `,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb atlas" data-action="spa-cli-wa-send" data-arg="${c.id}">Envoyer via WhatsApp Business</button>`,
    });
  };
  handlers['spa-cli-wa-send'] = (el) => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    toast('Message envoyé', { desc: `WhatsApp livré à ${c.fn} ${c.ln}. Lecture dans ~3 min en moyenne.`, type: 'success' });
  };
  handlers['spa-cli-bday'] = (el) => {
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    modal({
      title: 'Vœux d\'anniversaire',
      tag: 'CADEAU FIDÉLITÉ',
      desc: `Code -15% valable 30 jours · joint au message pour ${c.fn}.`,
      width: 480,
      body: `
        <div class="sc-wa-preview">
          <div class="sc-wa-bubble">
            Joyeux anniversaire ${c.fn} ! Toute l'équipe Bahia Spa vous offre <b>15% de réduction</b> sur votre prochaine séance, code BAHIA-${c.fn.toUpperCase().slice(0, 3)}15, valable 30 jours.
            <div class="sc-wa-time">15:08 ✓✓</div>
          </div>
        </div>
      `,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb atlas" data-action="spa-cli-bday-send" data-arg="${c.id}">Envoyer les vœux</button>`,
    });
  };
  handlers['spa-cli-bday-send'] = (el) => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    confetti();
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    toast('Vœux envoyés', { desc: `Code -15% remis à ${c.fn}. Notification de réception dans 30s.`, type: 'success' });
  };
  handlers['spa-cli-bday-batch'] = () => {
    const list = CLIENTS.filter((c) => c.bday);
    modal({
      title: 'Vœux groupés · 3 clientes',
      tag: 'CAMPAGNE AVRIL',
      desc: 'Aperçu unique · personnalisé automatiquement par client.',
      width: 540,
      body: `
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
          ${list.map((c) => `<div style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px;"><div class="sc-prof-av ${c.tier}" style="width:36px; height:36px; font-size:13px;">${(c.fn[0] + c.ln[0]).toUpperCase()}</div><div style="flex:1;"><div style="font-weight:500; font-size:13.5px;">${c.fn} ${c.ln}</div><div style="font-size:11.5px; color:var(--n-500);">${tierLabel[c.tier]} · ${fmtMAD(c.ltv)} MAD à vie</div></div><span class="chip ok">Prêt</span></div>`).join('')}
        </div>
        <div class="sc-wa-preview">
          <div class="sc-wa-bubble">Joyeux anniversaire {Prénom} ! L'équipe Bahia Spa vous offre <b>15% de réduction</b> sur votre prochaine séance, code BAHIA-{XXX}15.<div class="sc-wa-time">15:08 ✓✓</div></div>
        </div>
      `,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb atlas" data-action="spa-cli-bday-batch-send">Envoyer aux 3 clientes</button>`,
    });
  };
  handlers['spa-cli-bday-batch-send'] = () => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    confetti();
    toast('Campagne envoyée', { desc: '3 messages WhatsApp livrés · taux de lecture estimé 92%.', type: 'success' });
  };
  handlers['spa-cli-gift'] = (el) => {
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    modal({
      title: 'Émettre une carte cadeau',
      tag: c.fn.toUpperCase() + ' ' + c.ln.toUpperCase(),
      desc: 'Carte numérique livrée par WhatsApp + email avec QR de validation.',
      width: 480,
      body: `
        <label class="kf-label">Montant</label>
        <div class="sc-amounts">
          <div class="sc-amount">300</div>
          <div class="sc-amount on">500</div>
          <div class="sc-amount">1 000</div>
          <div class="sc-amount">2 500</div>
        </div>
        <div class="kf-help">MAD · valable 12 mois · transferable une fois</div>
        <div class="kf-group" style="margin-top:14px;"><label class="kf-label">Message personnalisé</label><textarea class="kf-input" rows="2" placeholder="De la part de…">Pour ta journée détente, l'équipe Bahia.</textarea></div>
      `,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb primary" data-action="spa-cli-gift-confirm" data-arg="${c.id}">Émettre · 500 MAD</button>`,
    });
    setTimeout(() => {
      document.querySelectorAll('.sc-amount').forEach((a) => {
        a.onclick = () => { document.querySelectorAll('.sc-amount').forEach((x) => x.classList.remove('on')); a.classList.add('on'); };
      });
    }, 0);
  };
  handlers['spa-cli-gift-confirm'] = () => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    confetti();
    toast('Carte cadeau émise', { desc: 'QR + email livrés · solde 500 MAD activé.', type: 'success' });
  };
  handlers['spa-cli-block'] = (el) => {
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    modal({
      title: 'Bloquer ce client ?',
      desc: `${c.fn} ${c.ln} ne pourra plus réserver en ligne ni recevoir de campagnes. Action réversible.`,
      width: 440,
      body: `<div class="kf-group"><label class="kf-label">Motif (interne)</label><textarea class="kf-input" rows="3" placeholder="Comportement inapproprié, no-show répété…"></textarea></div>`,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb danger" data-action="spa-cli-block-confirm" data-arg="${c.id}">Confirmer le blocage</button>`,
    });
  };
  handlers['spa-cli-block-confirm'] = (el) => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    toast('Client bloqué', { desc: `${c.fn} ${c.ln} retiré des campagnes et de la réservation en ligne.`, type: 'warn' });
  };
  handlers['spa-cli-note'] = () => toast('Édition activée', { desc: 'Recommandations modifiables · auto-save 2s.', type: 'info' });
  handlers['spa-cli-book'] = (el) => {
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    toast('Calendrier ouvert', { desc: `Réservation pour ${c.fn} ${c.ln} · créneaux ${c.fav} affichés.`, type: 'info' });
  };
  handlers['spa-cli-filter'] = (el) => {
    const k = el.dataset.arg;
    const root = el.closest('.kiwi-drawer-body') || document;
    root.querySelectorAll('[data-spa-pill]').forEach((p) => p.classList.toggle('on', p.dataset.spaPill === k));
    root.querySelectorAll('[data-spa-row]').forEach((r) => {
      const ok =
        k === 'all' ||
        (k === 'new' && r.dataset.spaNew === '1') ||
        (k === 'fid' && r.dataset.spaFid === '1') ||
        (k === 'vip' && r.dataset.spaVip === '1') ||
        (k === 'bday' && r.dataset.spaBday === '1');
      r.classList.toggle('sc-hide', !ok);
    });
  };

  /* ─── Main handler ─── */
  handlers['nav-clients'] = () => {
    const totalLTV = CLIENTS.reduce((s, c) => s + c.ltv, 0);
    const bdayList = CLIENTS.filter((c) => c.bday);
    const counts = {
      all: CLIENTS.length,
      new: CLIENTS.filter(isNew).length,
      fid: CLIENTS.filter(isFidele).length,
      vip: CLIENTS.filter(isVIP).length,
      bday: bdayList.length,
    };
    const d = window.Kiwi.appPage('clients', {
      title: 'Fiches clients',
      subtitle: `${CLIENTS.length} clients · ${fmtMAD(totalLTV)} MAD à vie · Spa Bahia Hivernage`,
      body: `
        <div class="p-hero">
          <div class="l">CRM SPA BAHIA</div>
          <div class="big">${fmtMAD(totalLTV)} <span style="font-size:18px; opacity:0.7;">MAD à vie</span></div>
          <div class="sub">${CLIENTS.length} clients actifs · ${counts.vip} VIP · panier moyen ${fmtMAD(Math.round(totalLTV / CLIENTS.length))} MAD</div>
        </div>

        <div class="sc-bday-panel">
          <div class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 19v-3a4 4 0 00-4-4H8a4 4 0 00-4 4v3M12 5v6M9 8h6"/><circle cx="12" cy="3" r="1.5"/></svg></div>
          <div class="body">
            <div class="t">${bdayList.length} anniversaires ce mois</div>
            <div class="d">${bdayList.map((c) => `${c.fn} ${c.ln}`).join(' · ')}, campagne WhatsApp + 15% prête à partir.</div>
          </div>
          <button class="kb atlas" data-action="spa-cli-bday-batch">Envoyer les vœux groupés</button>
        </div>

        <div class="p-toolbar">
          <div class="p-search" data-action="spa-cli-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
            Rechercher par nom, téléphone, email…
          </div>
          <button class="kb primary" data-action="spa-cli-add"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Nouveau client</button>
        </div>

        <div class="sc-pills">
          <button class="sc-pill on" data-spa-pill="all" data-action="spa-cli-filter" data-arg="all">Tous <span class="ct">${counts.all}</span></button>
          <button class="sc-pill" data-spa-pill="new" data-action="spa-cli-filter" data-arg="new">Nouveaux <span class="ct">${counts.new}</span></button>
          <button class="sc-pill" data-spa-pill="fid" data-action="spa-cli-filter" data-arg="fid">Fidèles <span class="ct">${counts.fid}</span></button>
          <button class="sc-pill" data-spa-pill="vip" data-action="spa-cli-filter" data-arg="vip">VIP <span class="ct">${counts.vip}</span></button>
          <button class="sc-pill" data-spa-pill="bday" data-action="spa-cli-filter" data-arg="bday">Anniv. ce mois <span class="ct">${counts.bday}</span></button>
        </div>

        <table class="p-table sc-table">
          <thead><tr><th>CLIENT</th><th>DERNIÈRE VISITE</th><th class="right">VALEUR À VIE</th><th>PRATICIENNE</th><th>NIVEAU</th></tr></thead>
          <tbody>
            ${CLIENTS.map(rowHTML).join('')}
          </tbody>
        </table>
      `,
    });
    setTimeout(() => {
      d.el.querySelectorAll('[data-spa-row]').forEach((r) => {
        r.addEventListener('click', () => openProfile(+r.dataset.spaId));
      });
    }, 0);
  };
})();

/* ═══ STATION ROUTING OVERRIDE · rebuilds nav-menu + nav-kds with multi-station model ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Section 2-S · STATION ROUTING
 * Adds the missing "stations de préparation" feature to the restaurant
 * vertical: every menu item routes to 1+ prep stations and the KDS lets
 * the brigade switch between station views.
 *
 *   · handlers['nav-menu']  · rebuilt with station-chip rows + edit modal
 *                             station picker + "Gérer les stations" CTA
 *   · handlers['nav-kds']   · rebuilt with top station-pill switcher and
 *                             per-station ticket filtering
 *
 * Appended to pages-pro.js at load time so it overrides the previous
 * implementations.  Vanilla JS · no build · no framework.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const { handlers, drawer, fullpage, modal, toast, confetti } = Kiwi;

  /* ───────────── data · STATIONS registry (mutable, in-memory) ───────────── */
  const STATIONS = [
    { id: 'cuisson',  name: 'Cuisson chaude',  color: 'var(--atlas)',   raw: '#0B6E4F', kind: 'kitchen' },
    { id: 'salade',   name: 'Salade froide',   color: 'var(--success)', raw: '#1FB574', kind: 'kitchen' },
    { id: 'pastry',   name: 'Pâtisserie',      color: 'var(--warning)', raw: '#D99A2B', kind: 'kitchen' },
    { id: 'boissons', name: 'Boissons',        color: 'var(--info)',    raw: '#3677A6', kind: 'bar'     },
    { id: 'bar',      name: 'Bar cocktails',   color: 'var(--riad)',    raw: '#053B2C', kind: 'bar'     },
    { id: 'bbq',      name: 'Barbecue',        color: '#C24A2E',        raw: '#C24A2E', kind: 'kitchen', custom: true },
    { id: 'crepes',   name: 'Crêpes bar',      color: '#C97A4A',        raw: '#C97A4A', kind: 'kitchen', custom: true },
  ];
  const findStation = (id) => STATIONS.find((s) => s.id === id);

  /* ───────────── data · MENU items (id, name, desc, price, stations[]) ─── */
  const CATS = [
    { key: 'entrees',  label: 'Entrées',  count: 5 },
    { key: 'tajines',  label: 'Tajines',  count: 5 },
    { key: 'couscous', label: 'Couscous', count: 4 },
    { key: 'desserts', label: 'Desserts', count: 4 },
    { key: 'boissons', label: 'Boissons', count: 5 },
  ];
  const MENU = {
    entrees: [
      { id: 'ent-1', n: 'Salade marocaine',     d: 'Tomate, concombre, oignon, huile d\'olive',     p: 32,  st: 'ok',  stations: ['salade'],            sold: 142, rank: 6  },
      { id: 'ent-2', n: 'Caviar d\'aubergine',  d: 'Aubergine fumée, ail, cumin',                   p: 28,  st: 'ok',  stations: ['salade'],            sold: 96,  rank: 11 },
      { id: 'ent-3', n: 'Briouates viande',     d: 'Triangles croustillants, bœuf mijoté',          p: 45,  st: 'ok',  stations: ['cuisson'],           sold: 84,  rank: 8  },
      { id: 'ent-4', n: 'Harira',               'd': 'Soupe pois chiches & lentilles',              p: 28,  st: 'ok',  stations: ['cuisson'],           sold: 98,  rank: 7  },
      { id: 'ent-5', n: 'Zaalouk',              d: 'Aubergine fumée, tomate, ail',                  p: 28,  st: 'low', stations: ['salade'],            sold: 56,  rank: 12 },
    ],
    tajines: [
      { id: 'taj-1', n: 'Tajine kefta œuf',     d: 'Viande hachée, œuf, tomate, épices',           p: 85,  st: 'ok',  stations: ['cuisson'],           sold: 312, rank: 1  },
      { id: 'taj-2', n: 'Tajine agneau pruneaux', d: 'Agneau mijoté, pruneaux, amandes',           p: 110, st: 'out', stations: ['cuisson'],           sold: 184, rank: 4  },
      { id: 'taj-3', n: 'Tajine poulet citron', d: 'Poulet, olives, citron confit',                p: 95,  st: 'ok',  stations: ['cuisson'],           sold: 226, rank: 3  },
      { id: 'taj-4', n: 'Méchoui',              d: 'Agneau rôti à la braise, parts pour 2 · 4',    p: 180, st: 'low', stations: ['bbq'],               sold: 24,  rank: 16 },
      { id: 'taj-5', n: 'Pastilla poulet',      d: 'Feuille fine, amandes, cannelle, sucre glace', p: 120, st: 'low', stations: ['cuisson', 'pastry'], sold: 156, rank: 5  },
    ],
    couscous: [
      { id: 'cou-1', n: 'Couscous royal',       d: 'Bœuf, poulet, merguez, légumes',               p: 95,  st: 'ok',  stations: ['cuisson'],           sold: 287, rank: 2  },
      { id: 'cou-2', n: 'Couscous légumes',     d: '7 légumes, pois chiches, raisins',             p: 68,  st: 'ok',  stations: ['cuisson'],           sold: 64,  rank: 9  },
      { id: 'cou-3', n: 'Couscous agneau',      d: 'Agneau braisé, oignons confits',               p: 105, st: 'low', stations: ['cuisson'],           sold: 98,  rank: 7  },
      { id: 'cou-4', n: 'Couscous tfaya',       d: 'Poulet, oignons caramélisés, raisins',         p: 88,  st: 'ok',  stations: ['cuisson'],           sold: 72,  rank: 10 },
    ],
    desserts: [
      { id: 'des-1', n: 'Msemen beurre & miel', d: 'Crêpe feuilletée, beurre, miel d\'eucalyptus', p: 12,  st: 'ok',  stations: ['pastry'],            sold: 221, rank: 6  },
      { id: 'des-2', n: 'Crêpe complète',       d: 'Œuf, jambon de dinde, fromage, beurre',        p: 38,  st: 'ok',  stations: ['crepes'],            sold: 64,  rank: 11 },
      { id: 'des-3', n: 'Cornes de gazelle',    d: 'Pâte d\'amande, fleur d\'oranger',             p: 28,  st: 'low', stations: ['pastry'],            sold: 72,  rank: 11 },
      { id: 'des-4', n: 'Sellou',               d: 'Graines de sésame, amandes, miel',             p: 30,  st: 'ok',  stations: ['pastry'],            sold: 38,  rank: 13 },
    ],
    boissons: [
      { id: 'bo-1',  n: 'Thé à la menthe',       d: 'Gunpowder, menthe fraîche, sucre',            p: 12,  st: 'ok',  stations: ['boissons'],          sold: 412, rank: 5  },
      { id: 'bo-2',  n: 'Orange pressée',        d: 'Pressée minute · oranges Souss',              p: 18,  st: 'ok',  stations: ['boissons'],          sold: 198, rank: 7  },
      { id: 'bo-3',  n: 'Café noir double',      d: 'Espresso double · grain Algeria',             p: 14,  st: 'ok',  stations: ['boissons'],          sold: 124, rank: 10 },
      { id: 'bo-4',  n: 'Cocktail mocktail',     d: 'Citron vert, menthe, fleur d\'oranger',       p: 32,  st: 'ok',  stations: ['bar'],               sold: 87,  rank: 8  },
      { id: 'bo-5',  n: 'Limonade traditionnelle', d: 'Citron, eau de fleur d\'oranger, gazeuse', p: 16,  st: 'ok',  stations: ['boissons'],          sold: 54,  rank: 14 },
    ],
  };
  const allItems = () => Object.values(MENU).flat();
  const itemsForStation = (sid) => allItems().filter((it) => it.stations.includes(sid));
  const stationStats = (sid) => {
    const items = itemsForStation(sid);
    return { items: items.length, sold: items.reduce((acc, it) => acc + it.sold, 0) };
  };

  /* ───────────── injected styles · station chips + extras ───────────── */
  if (!document.querySelector('#kiwi-stations-css')) {
    const css = document.createElement('style');
    css.id = 'kiwi-stations-css';
    css.textContent = `
      .kiwi-st-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-family: var(--mono); letter-spacing: 0.04em; padding: 3px 7px 3px 6px; border-radius: 7px; background: var(--paper-soft); border: 1px solid var(--n-200); color: var(--n-600); white-space: nowrap; line-height: 1.2; }
      html[data-theme="dark"] .kiwi-st-chip { background: var(--paper-muted); }
      .kiwi-st-chip i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .kiwi-st-chip.solid { background: var(--ink); color: var(--paper); border-color: transparent; }
      .kiwi-st-chips { display: inline-flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
      .menu-row .kiwi-st-chips { margin-top: 5px; }

      .kiwi-st-pick { display: flex; gap: 7px; flex-wrap: wrap; padding: 4px 0 2px; }
      .kiwi-st-opt { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--n-200); background: var(--paper-soft); color: var(--n-600); font-size: 12.5px; cursor: pointer; transition: transform 140ms, opacity 140ms, background-color 140ms, border-color 140ms, color 140ms, box-shadow 140ms; user-select: none; }
      html[data-theme="dark"] .kiwi-st-opt { background: var(--paper-muted); }
      .kiwi-st-opt:hover { border-color: var(--ink); color: var(--ink); }
      .kiwi-st-opt.on { background: var(--atlas); color: var(--paper); border-color: var(--atlas); }
      .kiwi-st-opt.on i { background: var(--mint) !important; }
      .kiwi-st-opt i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
      .kiwi-st-opt .kind { font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.08em; opacity: 0.66; text-transform: uppercase; }

      .kiwi-st-mgr { display: grid; grid-template-columns: 28px 1fr auto auto; gap: 14px; align-items: center; padding: 13px 4px; border-bottom: 1px solid var(--n-200); }
      .kiwi-st-mgr:last-child { border-bottom: 0; }
      .kiwi-st-mgr .sw { width: 22px; height: 22px; border-radius: 7px; }
      .kiwi-st-mgr .nm { font-weight: 500; font-size: 14px; letter-spacing: -0.005em; }
      .kiwi-st-mgr .nm .m { font-size: 11.5px; color: var(--n-500); margin-top: 2px; font-family: var(--mono); letter-spacing: 0.04em; text-transform: uppercase; }
      .kiwi-st-mgr .ct { font-family: var(--mono); font-size: 12px; color: var(--ink); background: var(--paper-soft); padding: 4px 9px; border-radius: 999px; font-weight: 500; }

      .kiwi-st-swatch { display: inline-block; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: transform 120ms; }
      .kiwi-st-swatch:hover { transform: scale(1.08); }
      .kiwi-st-swatch.on { border-color: var(--ink); transform: scale(1.08); box-shadow: 0 0 0 2px var(--paper); }

      .kds-st-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 8px; margin: 2px 0 14px; border-bottom: 1px solid var(--n-200); }
      .kds-st-tab { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 10px 10px 0 0; border: 1px solid transparent; background: transparent; color: var(--n-500); font-size: 13px; font-weight: 500; letter-spacing: -0.005em; cursor: pointer; transition: color 140ms, background 140ms; white-space: nowrap; flex-shrink: 0; margin-bottom: -1px; }
      .kds-st-tab:hover { color: var(--ink); background: var(--paper-soft); }
      .kds-st-tab.on { color: var(--ink); background: var(--paper); border-color: var(--n-200); border-bottom-color: var(--paper); }
      html[data-theme="dark"] .kds-st-tab.on { background: var(--paper-muted); border-bottom-color: var(--paper-muted); }
      .kds-st-tab i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .kds-st-tab .ct { font-family: var(--mono); font-size: 10.5px; color: var(--n-500); padding: 1px 6px; background: var(--paper-soft); border-radius: 999px; }
      html[data-theme="dark"] .kds-st-tab .ct { background: var(--paper-muted); }
      .kds-st-tab.on .ct { color: var(--atlas); background: var(--mint-soft); }

      .kds-tk-st-line { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 13px; line-height: 1.3; }
      .kds-tk-st-line .q { font-family: var(--mono); font-weight: 600; min-width: 24px; color: var(--n-600); }
      .kds-tk-st-line .nm { flex: 1; }
      .kds-tk-st-line .stations { display: inline-flex; gap: 4px; }
      .kds-tk-st-line.muted { opacity: 0.32; }
      .kds-tk-st-line.muted .nm { text-decoration: line-through; }
    `;
    document.head.appendChild(css);
  }

  /* ───────────── helpers · station chip rendering ───────────── */
  const stationChip = (sid, opts = {}) => {
    const s = findStation(sid);
    if (!s) return '';
    const cls = opts.solid ? 'kiwi-st-chip solid' : 'kiwi-st-chip';
    const bg = opts.solid ? `style="background:${s.raw}; color:var(--paper);"` : '';
    return `<span class="${cls}" ${bg} title="${s.name} · ${s.kind === 'bar' ? 'bar' : 'cuisine'}"><i style="background:${s.raw};"></i>${s.name}</span>`;
  };
  const stationKindLabel = (k) => (k === 'bar' ? 'BAR' : 'CUISINE');
  const stationSummaryHtml = () => STATIONS.map((s) => {
    const stats = stationStats(s.id);
    return `<div style="display:grid; grid-template-columns:14px 1fr auto; gap:10px; align-items:center; background:var(--surface); border:1px solid var(--n-200); border-radius:10px; padding:10px 12px;"><span style="width:10px; height:10px; border-radius:50%; background:${s.raw};"></span><div><div style="font-weight:500;">${s.name}</div><div style="font-size:10.5px; color:var(--n-500); font-family:var(--mono); letter-spacing:0.06em; text-transform:uppercase;">${stationKindLabel(s.kind)}${s.custom ? ' · custom' : ''}</div></div><span class="mono" style="font-size:11px; color:var(--n-500);">${stats.items} items · ${stats.sold} vendus</span></div>`;
  }).join('');

  /* ───────────── helper: dismiss buttons ───────────── */
  const wireDismiss = (m) => {
    if (!m || !m.el) return;
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-dismiss]')) m.close();
    });
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *   handlers['nav-menu']  ·  Menu & stations
   * ═════════════════════════════════════════════════════════════════════════ */
  /* ─── Options data · sample modifier groups (Glovo-style) ─────────────── */
  const OPTION_GROUPS = [
    { id: 'opt-cuisson',  name: 'Cuisson',            kind: 'radio',  applies: 6,  vals: [
      { n: 'Bleu' }, { n: 'Saignant' }, { n: 'À point' }, { n: 'Bien cuit' }
    ]},
    { id: 'opt-supp',     name: 'Suppléments fromage', kind: 'multi', applies: 12, vals: [
      { n: 'Cheddar', p: 8 }, { n: 'Comté', p: 12 }, { n: 'Bleu', p: 10 }, { n: 'Mozzarella', p: 8 }
    ]},
    { id: 'opt-sauces',   name: 'Sauces',              kind: 'multi', applies: 18, vals: [
      { n: 'BBQ' }, { n: 'Mayo' }, { n: 'Andalouse' }, { n: 'Algérienne' }, { n: 'Samouraï' }, { n: 'Harissa' }
    ]},
    { id: 'opt-pain',     name: 'Pain à part',         kind: 'toggle', applies: 8, vals: [ { n: 'Oui' } ]},
    { id: 'opt-cor',      name: 'Sans coriandre',      kind: 'toggle', applies: 22, vals: [ { n: 'Oui' } ]},
    { id: 'opt-piment',   name: 'Sans piment',         kind: 'toggle', applies: 14, vals: [ { n: 'Oui' } ]},
    { id: 'opt-boisson',  name: 'Boisson menu',        kind: 'radio',  applies: 5,  vals: [
      { n: 'Coca' }, { n: 'Coca Zero' }, { n: 'Sprite' }, { n: 'Thé menthe' }, { n: 'Eau' }
    ]},
    { id: 'opt-acc',      name: 'Accompagnement',      kind: 'radio',  applies: 9,  vals: [
      { n: 'Frites maison' }, { n: 'Salade verte' }, { n: 'Riz safrané' }, { n: 'Légumes vapeur' }
    ]},
  ];
  const optionKindLabel = (k) => k === 'radio' ? 'CHOIX UNIQUE' : k === 'multi' ? 'CHOIX MULTIPLE' : 'INTERRUPTEUR';

  /* ─── thumbnail glyph picker ───────────────────────────────────────────── */
  const itemGlyph = (n) =>
    /tajine/i.test(n)   ? '◉' :
    /couscous/i.test(n) ? '◓' :
    /pastilla/i.test(n) ? '✦' :
    /salade/i.test(n)   ? '◴' :
    /briouate|harira/i.test(n) ? '◔' :
    /msemen|crêpe|cornes|sellou/i.test(n) ? '✺' :
    /thé|café|coffee/i.test(n) ? '☕' :
    /orange|limonade|cocktail|jus/i.test(n) ? '◍' :
    /méchoui|bbq/i.test(n) ? '◈' :
    /zaalouk|aubergine|caviar/i.test(n) ? '◐' :
                          '●';

  /* ═══════════════════════════════════════════════════════════════════════
   *   handlers['nav-menu']  ·  Menu (Glovo-inspired) — Produits | Options | Stations
   *   Two-column layout (category rail + items pane) with three top-level tabs.
   * ═════════════════════════════════════════════════════════════════════════ */
  handlers['nav-menu'] = () => {
    let activeTab = 'products';      // products | options | stations
    let activeCat = 'tajines';
    let searchTerm = '';
    const menu86 = new Set(['taj-2']);

    const stockChip = (st) =>
      st === 'ok'  ? '' :
      st === 'low' ? '<span class="chip pend" style="font-size:9.5px;">stock bas</span>' :
                     '<span class="chip ref" style="font-size:9.5px;">RUPTURE</span>';

    /* ── helpers ─────────────────────────────────────────────────────────── */
    const catItems = (key) => MENU[key] || [];
    const catAlerts = (key) => catItems(key).filter((it) => menu86.has(it.id) || it.st === 'out').length;
    const catActive = (key) => catItems(key).filter((it) => !menu86.has(it.id)).length;

    const matchSearch = (it) => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return it.n.toLowerCase().includes(q)
        || it.d.toLowerCase().includes(q)
        || it.stations.some((sid) => (findStation(sid)?.name || '').toLowerCase().includes(q));
    };

    /* ── rail · category cards ───────────────────────────────────────────── */
    const renderRail = () => `
      <button class="kw-cat-add" data-action="menu-cat-add">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
        Ajouter une catégorie
      </button>
      ${CATS.map((c) => {
        const alerts = catAlerts(c.key);
        const total = catItems(c.key).length;
        return `
          <button class="kw-cat-card ${c.key === activeCat ? 'on' : ''}" data-cat="${c.key}">
            <div class="body">
              <div class="nm">${c.label}</div>
              <div class="ct">${total} produit${total > 1 ? 's' : ''}</div>
            </div>
            <div class="meta">
              ${alerts > 0 ? `<span class="badge alert" title="${alerts} en rupture / 86'd">${alerts}</span>` : ''}
              <span class="chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg></span>
            </div>
          </button>`;
      }).join('')}
    `;

    /* ── items pane · single category ───────────────────────────────────── */
    const renderItem = (it) => {
      const is86 = menu86.has(it.id);
      const stationChips = it.stations.map(stationChip).join('');
      return `
        <div class="kw-item ${is86 ? 'is-86' : ''}" data-row="${it.id}">
          <div class="thumb">${itemGlyph(it.n)}</div>
          <div class="body">
            <div class="nm">${it.n} ${stockChip(is86 ? 'out' : it.st)}</div>
            <div class="desc">${it.d}</div>
            <button class="view-opt" data-row-act="edit" data-id="${it.id}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M12 8v4l3 2"/></svg>
              Voir les options
            </button>
            <div class="st-chips" data-st-row="${it.id}">${stationChips}</div>
          </div>
          <div class="price">${it.p.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', ',')} MAD<span class="rk">#${it.rank} · ${it.sold} vendus</span></div>
          <span class="sw ${is86 ? '' : 'on'}" data-row-act="86" data-id="${it.id}" title="${is86 ? '86 (rupture)' : 'En stock, cliquer pour 86'}" role="switch" aria-checked="${!is86}"></span>
        </div>`;
    };

    const renderItemsPane = () => {
      const cat = CATS.find((c) => c.key === activeCat);
      const list = catItems(activeCat).filter(matchSearch);
      const body = list.length
        ? list.map(renderItem).join('')
        : `<div class="kw-items-empty">Aucun produit ne correspond${searchTerm ? ` à « ${searchTerm} »` : ''}.</div>`;
      return `
        <div class="kw-items-pane">
          <div class="kw-items-head">
            <h3>
              ${cat ? cat.label.toUpperCase() : '—'}
              <span class="edit-cat" data-action="menu-cat-edit" title="Renommer · supprimer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z"/></svg>
              </span>
            </h3>
            <button class="add-prod" data-action="menu-add">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
              Ajouter un produit
            </button>
          </div>
          ${body}
        </div>`;
    };

    const renderProductsTab = () => `
      <div class="kw-menu-grid">
        <div class="kw-cat-rail" id="kw-cat-rail">${renderRail()}</div>
        <div id="kw-items-pane">${renderItemsPane()}</div>
      </div>
    `;

    /* ── Options tab pane ───────────────────────────────────────────────── */
    const kindPill = (k) => `<span class="kind-pill">${optionKindLabel(k)}</span>`;
    const renderOptionGroup = (g) => `
      <div class="kw-opt-group" data-opt="${g.id}">
        <div class="h">
          <div>
            <div class="nm">${g.name} ${kindPill(g.kind)}</div>
            <div class="meta">Appliqué à ${g.applies} produit${g.applies > 1 ? 's' : ''} · ${g.vals.length} option${g.vals.length > 1 ? 's' : ''}</div>
          </div>
          <button class="kw-menu-action icon" title="Éditer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z"/></svg>
          </button>
        </div>
        <div class="vals">
          ${g.vals.map((v) => `<span class="v ${v.p ? 'priced' : ''}">${v.n}${v.p ? `<span class="pr">+${v.p} MAD</span>` : ''}</span>`).join('')}
        </div>
      </div>
    `;
    const renderOptionsTab = () => `
      <div class="kw-opt-pane">
        <div class="head">
          <div>
            <h3>Groupes d'options</h3>
            <div class="sub">${OPTION_GROUPS.length} groupes · attachez-les à un produit depuis l'éditeur d'item.</div>
          </div>
          <button class="kw-menu-action" data-action="menu-opt-add" style="background:var(--inverse-surface); color:var(--inverse-ink); border-color:var(--inverse-surface);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
            Créer un groupe
          </button>
        </div>
        ${OPTION_GROUPS.map(renderOptionGroup).join('')}
      </div>
    `;

    /* ── Stations tab pane ──────────────────────────────────────────────── */
    const renderStationCard = (s) => {
      const stats = stationStats(s.id);
      return `
        <div class="kw-st-card" data-st="${s.id}">
          <span class="sw" style="background:${s.raw};"></span>
          <div class="body">
            <div class="nm">${s.name}</div>
            <div class="kind">${stationKindLabel(s.kind)}${s.custom ? ' · personnalisée' : ''}</div>
            <div class="stats">
              <div><b>${stats.items}</b>item${stats.items > 1 ? 's' : ''} routé${stats.items > 1 ? 's' : ''}</div>
              <div><b>${stats.sold.toLocaleString('fr-FR')}</b>vendus / 30 j</div>
            </div>
            <div class="row-actions">
              ${s.custom
                ? `<button class="kw-menu-action" data-st-delete-id="${s.id}" style="padding:6px 12px; font-size:11.5px;">Supprimer</button>`
                : `<span class="badge-sys">SYSTÈME</span>`}
              ${s.custom ? `<span class="badge-cust">CUSTOM</span>` : ''}
            </div>
          </div>
        </div>`;
    };
    const renderStationsTab = () => `
      <div class="kw-st-pane">
        <div class="head">
          <div>
            <h3>Stations de préparation</h3>
            <div class="sub">${STATIONS.length} stations actives · chaque produit est routé vers 1+ station${STATIONS.length > 1 ? 's' : ''}. Les tickets KDS apparaissent simultanément.</div>
          </div>
          <button class="kw-menu-action" data-action="menu-station-create" style="background:var(--atlas); color:var(--paper); border-color:var(--atlas);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
            Créer une station
          </button>
        </div>
        <div class="kw-st-grid">${STATIONS.map(renderStationCard).join('')}</div>
        <div style="margin-top:14px; padding:14px 16px; background:var(--paper-soft); border-radius:10px; font-size:12.5px; color:var(--n-600); line-height:1.5; display:flex; gap:10px; align-items:flex-start;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--atlas); flex-shrink:0; margin-top:1px;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h0"/></svg>
          <div><b>Astuce :</b> ajoutez une station "Pizza four" ou "Bar à jus" si votre établissement a une zone dédiée. Le KDS basculera automatiquement vers la nouvelle station dans les 5 secondes.</div>
        </div>
      </div>
    `;

    /* ── full body ──────────────────────────────────────────────────────── */
    const tabCounts = {
      products: allItems().length,
      options:  OPTION_GROUPS.length,
      stations: STATIONS.length,
    };

    const renderTabBody = () =>
      activeTab === 'products' ? renderProductsTab() :
      activeTab === 'options'  ? renderOptionsTab()  :
                                 renderStationsTab();

    const menuDr = fullpage({
      title: 'Menu · Café Atlas',
      subtitle: `${allItems().length} produits · ${CATS.length} catégories · ${STATIONS.length} stations · ${menu86.size} en rupture`,
      width: 1080,
      body: `
        <div class="p-kpis">
          <div class="p-kpi"><div class="l">CARTE ACTIVE</div><div class="v">${allItems().length}<span class="u"> produits</span></div><div class="d up">+ 3 ce mois</div></div>
          <div class="p-kpi"><div class="l">PANIER MOYEN</div><div class="v">158<span class="u"> MAD</span></div><div class="d up">+ 4,2 % vs sem. dernière</div></div>
          <div class="p-kpi"><div class="l">STATIONS</div><div class="v">${STATIONS.length}</div><div class="d">${STATIONS.filter((s) => s.kind === 'kitchen').length} cuisine · ${STATIONS.filter((s) => s.kind === 'bar').length} bar</div></div>
          <div class="p-kpi" style="background:rgba(201,74,58,0.06); border-color:rgba(201,74,58,0.25);"><div class="l">EN RUPTURE</div><div class="v" style="color:var(--danger);">${menu86.size}</div><div class="d">tajine agneau · etc.</div></div>
        </div>

        <div class="menu-ai">
          <div class="ic">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg>
          </div>
          <div class="b">
            <div class="t">INSIGHT KIWI · STATIONS</div>
            <div class="n">La station Cuisson chaude porte 64 % du chiffre · pensez à équilibrer.</div>
            <div class="d">Le tajine kefta œuf et le couscous royal saturent la cuisson aux pics. Le bar et la pâtisserie sont sous-utilisés à midi.</div>
          </div>
          <button class="kb" style="background:var(--mint); color:var(--riad);" data-action="menu-promote">Voir suggestions</button>
        </div>

        <div class="kw-menu-tabs" id="kw-menu-tabs">
          <button class="kw-menu-tab ${activeTab === 'products' ? 'on' : ''}" data-tab="products">
            Produits <span class="ct">${tabCounts.products}</span>
          </button>
          <button class="kw-menu-tab ${activeTab === 'options' ? 'on' : ''}" data-tab="options">
            Options <span class="ct">${tabCounts.options}</span>
          </button>
          <button class="kw-menu-tab ${activeTab === 'stations' ? 'on' : ''}" data-tab="stations">
            Stations <span class="ct">${tabCounts.stations}</span>
          </button>
        </div>

        <div class="kw-menu-toolbar">
          <label class="kw-menu-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
            <input id="kw-menu-search-input" type="text" placeholder="Rechercher un produit, une station, un allergène…" />
          </label>
          <button class="kw-menu-action" data-action="menu-schedule" title="Plages horaires">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M6 12h12M9 18h6"/></svg>
            Filtres
          </button>
          <button class="kw-menu-action icon" title="Plus" data-action="menu-publish">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
          </button>
        </div>

        <div id="kw-menu-tab-body">${renderTabBody()}</div>
      `,
      foot: `
        <div style="display:flex; gap:8px; justify-content:space-between; width:100%; align-items:center;">
          <span style="font-family:var(--mono); font-size:11px; color:var(--n-500); letter-spacing:0.06em;">SYNC POS · 100 % · ROUTAGE STATIONS LIVE</span>
          <div style="display:flex; gap:8px;">
            <button class="kb ghost" data-dismiss>Fermer</button>
            <button class="kb primary" data-action="menu-publish">Publier la carte</button>
          </div>
        </div>
      `,
    });
    wireDismiss(menuDr);

    /* ── wire: tabs + rail + items ─────────────────────────────────────── */
    setTimeout(() => {
      const root = menuDr.el;
      if (!root) return;

      const body = root.querySelector('#kw-menu-tab-body');
      const tabs = root.querySelector('#kw-menu-tabs');
      const searchInput = root.querySelector('#kw-menu-search-input');

      const refreshTabBody = () => {
        body.innerHTML = renderTabBody();
        wireBody();
      };

      const refreshRail = () => {
        const rail = root.querySelector('#kw-cat-rail');
        if (rail) rail.innerHTML = renderRail();
        wireRail();
      };

      const refreshItems = () => {
        const pane = root.querySelector('#kw-items-pane');
        if (pane) pane.innerHTML = renderItemsPane();
        wireItems();
      };

      const refreshSubtitle = () => {
        const sub = root.querySelector('.kiwi-drawer-head p');
        if (sub) sub.textContent = `${allItems().length} produits · ${CATS.length} catégories · ${STATIONS.length} stations · ${menu86.size} en rupture`;
      };

      const wireRail = () => {
        body.querySelectorAll('.kw-cat-card').forEach((btn) => {
          btn.onclick = () => {
            const key = btn.getAttribute('data-cat');
            if (key === activeCat) return;
            activeCat = key;
            refreshRail();
            refreshItems();
          };
        });
      };

      const wireItems = () => {
        const pane = body.querySelector('#kw-items-pane');
        if (!pane) return;
        pane.querySelectorAll('[data-row-act]').forEach((b) => {
          b.onclick = (e) => {
            e.stopPropagation();
            const a = b.getAttribute('data-row-act');
            const id = b.getAttribute('data-id');
            const it = allItems().find((x) => x.id === id);
            if (!it) return;
            if (a === '86') {
              if (menu86.has(id)) menu86.delete(id);
              else menu86.add(id);
              toast(menu86.has(id) ? `${it.n} marqué en rupture` : `${it.n} de retour à la carte`, {
                type: menu86.has(id) ? 'warn' : 'success',
                desc: menu86.has(id) ? 'Retiré de la caisse et du QR menu.' : 'Produit disponible sur tous les canaux.',
              });
              refreshItems();
              refreshRail();
              refreshSubtitle();
            }
            if (a === 'edit') openItemEdit(it, () => { refreshItems(); refreshRail(); });
          };
        });
        pane.querySelectorAll('.kw-item').forEach((r) => {
          r.addEventListener('click', (e) => {
            if (e.target.closest('[data-row-act]')) return;
            const id = r.getAttribute('data-row');
            const it = allItems().find((x) => x.id === id);
            if (it) openItemEdit(it, () => { refreshItems(); refreshRail(); });
          });
        });
      };

      const wireStations = () => {
        body.querySelectorAll('.kw-st-card').forEach((card) => {
          card.addEventListener('click', (e) => {
            if (e.target.closest('[data-st-delete-id]')) return;
            const sid = card.getAttribute('data-st');
            const s = findStation(sid);
            if (s) toast(`Station "${s.name}"`, { type: 'info', desc: `${stationStats(sid).items} produits routés · ${stationKindLabel(s.kind)}.` });
          });
        });
        body.querySelectorAll('[data-st-delete-id]').forEach((btn) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            const sid = btn.getAttribute('data-st-delete-id');
            const s = findStation(sid);
            if (!s) return;
            const stats = stationStats(sid);
            if (stats.items > 0) {
              toast(`Impossible · ${stats.items} produit${stats.items > 1 ? 's' : ''} routé${stats.items > 1 ? 's' : ''}`, {
                type: 'warn',
                desc: `Réaffectez les produits de la station "${s.name}" avant de la supprimer.`,
              });
              return;
            }
            const idx = STATIONS.findIndex((x) => x.id === sid);
            if (idx >= 0) STATIONS.splice(idx, 1);
            refreshTabBody();
            refreshSubtitle();
            toast(`Station "${s.name}" supprimée`, { type: 'success' });
          };
        });
      };

      const wireOptions = () => {
        body.querySelectorAll('.kw-opt-group').forEach((g) => {
          g.addEventListener('click', () => {
            const id = g.getAttribute('data-opt');
            const grp = OPTION_GROUPS.find((x) => x.id === id);
            if (grp) toast(`Groupe "${grp.name}"`, { type: 'info', desc: `${optionKindLabel(grp.kind)} · ${grp.vals.length} options · attaché à ${grp.applies} produits.` });
          });
        });
      };

      const wireBody = () => {
        if (activeTab === 'products') { wireRail(); wireItems(); }
        if (activeTab === 'options')  { wireOptions(); }
        if (activeTab === 'stations') { wireStations(); }
      };

      // Tabs
      tabs.querySelectorAll('.kw-menu-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          const t = btn.getAttribute('data-tab');
          if (t === activeTab) return;
          activeTab = t;
          tabs.querySelectorAll('.kw-menu-tab').forEach((b) => b.classList.toggle('on', b === btn));
          refreshTabBody();
        });
      });

      // Search
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          searchTerm = searchInput.value.trim();
          if (activeTab === 'products') refreshItems();
        });
      }

      // Expose hooks for external handlers (station create modal etc.)
      root.__kiwiMenu = {
        refreshAllRowChips: refreshItems,
        refreshSummary: refreshTabBody,
        refreshTabBody,
      };

      wireBody();
    }, 0);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *   Item edit modal (with station picker)
   * ═════════════════════════════════════════════════════════════════════════ */
  const openItemEdit = (it, onSave) => {
    const draftStations = new Set(it.stations);

    const renderStationPicker = () => STATIONS.map((s) => `
      <button type="button" class="kiwi-st-opt ${draftStations.has(s.id) ? 'on' : ''}" data-st-toggle="${s.id}">
        <i style="background:${s.raw};"></i>${s.name}
        <span class="kind">· ${s.kind === 'bar' ? 'bar' : 'cuisine'}</span>
      </button>`).join('');

    const editM = modal({
      tag: 'ITEM',
      title: it.n,
      desc: it.d,
      width: 640,
      body: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" value="${it.n}" /></div>
          <div class="kf-group"><label class="kf-label">Prix TTC</label><input class="kf-input mono" value="${it.p}.00" /></div>
        </div>
        <div class="kf-group">
          <label class="kf-label">Description courte</label>
          <input class="kf-input" value="${it.d}" />
        </div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Catégorie</label>
            <select class="kf-input">
              ${CATS.map((c) => `<option ${MENU[c.key].some((x) => x.id === it.id) ? 'selected' : ''}>${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="kf-group"><label class="kf-label">Temps de prep.</label>
            <select class="kf-input"><option>5 min</option><option>10 min</option><option selected>15 min</option><option>20 min</option><option>25 min</option><option>30 min</option></select>
          </div>
        </div>

        <div class="kf-group" style="margin-top:8px;">
          <label class="kf-label" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Stations de préparation</span>
            <span class="meta" style="font-family:var(--mono); font-size:10.5px; color:var(--n-500); letter-spacing:0.06em;">SÉLECTIONNEZ 1 OU PLUSIEURS</span>
          </label>
          <div class="kiwi-st-pick" id="kiwi-st-pick">${renderStationPicker()}</div>
          <div class="kf-help">Le ticket KDS apparaîtra simultanément sur chaque station sélectionnée. Idéal pour les plats croisés (ex. pastilla = cuisson + pâtisserie).</div>
        </div>

        <div class="kf-group">
          <label class="kf-label">Modificateurs autorisés</label>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${['Sans coriandre', 'Sans piment', 'Pain à part', 'Bien cuit', 'Saignant', 'Sans gluten'].map((m, i) => `<span class="chip ${i < 3 ? 'ok' : 'neutral'}" style="cursor:pointer;">${i < 3 ? '✓ ' : ''}${m}</span>`).join('')}
          </div>
        </div>

        <div class="p-card" style="margin:14px 0 0;">
          <div class="head"><h4 style="font-size:13px;">Performance · 30 derniers jours</h4><span class="meta">RANG #${it.rank}</span></div>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px; font-size:12.5px;">
            <div><div style="color:var(--n-500); font-size:11px;">Vendus</div><div class="mono" style="font-size:18px; font-weight:600;">${it.sold}</div></div>
            <div><div style="color:var(--n-500); font-size:11px;">CA</div><div class="mono" style="font-size:18px; font-weight:600;">${(it.p * it.sold).toLocaleString('fr-FR')} MAD</div></div>
            <div><div style="color:var(--n-500); font-size:11px;">Marge brute</div><div class="mono" style="font-size:18px; font-weight:600; color:var(--atlas);">66 %</div></div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Annuler</button>
        <button class="kb danger" data-st-delete>Supprimer</button>
        <button class="kb atlas" data-st-save>Enregistrer</button>
      `,
    });
    wireDismiss(editM);

    setTimeout(() => {
      const root = editM.el;
      if (!root) return;
      const pick = root.querySelector('#kiwi-st-pick');
      pick.addEventListener('click', (e) => {
        const t = e.target.closest('[data-st-toggle]');
        if (!t) return;
        const sid = t.getAttribute('data-st-toggle');
        if (draftStations.has(sid)) {
          if (draftStations.size === 1) {
            toast('Au moins 1 station requise', { type: 'warn', desc: 'Le ticket doit pouvoir être routé quelque part.' });
            return;
          }
          draftStations.delete(sid);
        } else {
          draftStations.add(sid);
        }
        t.classList.toggle('on', draftStations.has(sid));
      });

      root.querySelector('[data-st-save]').addEventListener('click', () => {
        it.stations = Array.from(draftStations);
        const stationNames = it.stations.map((sid) => findStation(sid).name).join(' · ');
        editM.close();
        toast(`${it.n} mis à jour`, { type: 'success', desc: `Routé sur ${it.stations.length} station${it.stations.length > 1 ? 's' : ''} · ${stationNames}` });
        onSave?.();
      });
      root.querySelector('[data-st-delete]').addEventListener('click', () => {
        editM.close();
        toast(`${it.n} supprimé de la carte`, { type: 'warn', desc: 'Item retiré · les commandes ouvertes restent valides.' });
      });
    }, 0);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *   handlers · gestion des stations
   * ═════════════════════════════════════════════════════════════════════════ */
  const refreshMenuDrawer = () => {
    const m = document.querySelector('.kiwi-drawer-backdrop .kiwi-drawer');
    if (m && m.parentElement && m.parentElement.__kiwiMenu) {
      m.parentElement.__kiwiMenu.refreshAllRowChips();
      m.parentElement.__kiwiMenu.refreshSummary();
    }
  };

  handlers['menu-stations-manage'] = () => {
    const renderList = () => STATIONS.map((s) => {
      const stats = stationStats(s.id);
      return `
        <div class="kiwi-st-mgr" data-st-mgr="${s.id}">
          <span class="sw" style="background:${s.raw};"></span>
          <div class="nm">${s.name}<div class="m">${stationKindLabel(s.kind)}${s.custom ? ' · personnalisée' : ''}</div></div>
          <span class="ct">${stats.items} item${stats.items > 1 ? 's' : ''} · ${stats.sold} vendus</span>
          ${s.custom
            ? `<button class="kb ghost xs" data-st-delete-id="${s.id}">Supprimer</button>`
            : `<span class="chip neutral mono" style="font-size:9.5px; padding:3px 8px;">SYSTÈME</span>`}
        </div>`;
    }).join('');

    const m = modal({
      tag: 'STATIONS',
      title: 'Gérer les stations de préparation',
      desc: 'Chaque item de la carte est routé vers 1 ou plusieurs stations. Les stations système ne peuvent pas être supprimées.',
      width: 620,
      body: `
        <button class="kb atlas" style="width:100%; justify-content:center; margin-bottom:14px;" data-st-create>+ Créer une station personnalisée</button>
        <div id="st-mgr-list" style="background:var(--surface); border:1px solid var(--n-200); border-radius:12px; padding:4px 16px;">${renderList()}</div>
        <div style="margin-top:12px; padding:12px 14px; background:var(--paper-soft); border-radius:10px; font-size:12.5px; color:var(--n-600); line-height:1.5;">
          <b>Astuce :</b> ajoutez une station "Pizza four" ou "Bar à jus" si votre établissement a une zone dédiée. Le KDS basculera automatiquement vers la nouvelle station.
        </div>
      `,
      foot: `<button class="kb ghost" data-dismiss>Fermer</button>`,
    });
    wireDismiss(m);

    setTimeout(() => {
      const root = m.el;
      if (!root) return;
      const list = root.querySelector('#st-mgr-list');

      const refresh = () => { list.innerHTML = renderList(); };

      root.querySelector('[data-st-create]').addEventListener('click', () => openStationCreate(refresh));

      list.addEventListener('click', (e) => {
        const del = e.target.closest('[data-st-delete-id]');
        if (!del) return;
        const sid = del.getAttribute('data-st-delete-id');
        const s = findStation(sid);
        if (!s) return;
        const stats = stationStats(sid);
        if (stats.items > 0) {
          toast(`Impossible · ${stats.items} item${stats.items > 1 ? 's' : ''} routé${stats.items > 1 ? 's' : ''}`, {
            type: 'warn',
            desc: `Réaffectez les items de la station "${s.name}" avant de la supprimer.`,
          });
          return;
        }
        const idx = STATIONS.findIndex((x) => x.id === sid);
        if (idx >= 0) STATIONS.splice(idx, 1);
        refresh();
        refreshMenuDrawer();
        toast(`Station "${s.name}" supprimée`, { type: 'success' });
      });
    }, 0);
  };

  const openStationCreate = (afterCreate) => {
    const SWATCHES = [
      ['var(--atlas)', '#0B6E4F'], ['var(--riad)', '#053B2C'], ['var(--success)', '#1FB574'],
      ['var(--warning)', '#D99A2B'], ['var(--info)', '#3677A6'], ['var(--danger)', '#C24A2E'],
      ['#C97A4A', '#C97A4A'], ['#8B5CF6', '#8B5CF6'], ['#0EA5E9', '#0EA5E9'],
      ['#EC4899', '#EC4899'], ['#F97316', '#F97316'], ['#14B8A6', '#14B8A6'],
    ];
    let chosenColor = SWATCHES[0];
    let chosenKind = 'kitchen';

    const m = modal({
      tag: 'NOUVELLE STATION',
      title: 'Créer une station personnalisée',
      desc: 'Une nouvelle station apparaîtra immédiatement dans le sélecteur d\'item et sur le KDS.',
      width: 540,
      body: `
        <div class="kf-group">
          <label class="kf-label">Nom de la station</label>
          <input class="kf-input" id="st-new-name" placeholder="ex. Pizza four · Bar à jus · Sushi" />
        </div>
        <div class="kf-group">
          <label class="kf-label">Couleur</label>
          <div id="st-new-swatches" style="display:flex; gap:8px; flex-wrap:wrap;">
            ${SWATCHES.map((c, i) => `<span class="kiwi-st-swatch ${i === 0 ? 'on' : ''}" data-sw="${i}" style="background:${c[1]};"></span>`).join('')}
          </div>
        </div>
        <div class="kf-group">
          <label class="kf-label">Type</label>
          <div style="display:flex; gap:8px;" id="st-new-kind">
            <button type="button" class="kb atlas" data-kind="kitchen" style="flex:1; justify-content:center;">Cuisine</button>
            <button type="button" class="kb ghost" data-kind="bar" style="flex:1; justify-content:center;">Bar</button>
          </div>
        </div>
        <div style="padding:12px 14px; background:var(--paper-soft); border-radius:10px; font-size:12.5px; color:var(--n-600); line-height:1.5;">
          La station sera disponible sur tous les iPad cuisine et terminaux POS dans les 5 secondes après création.
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Annuler</button>
        <button class="kb atlas" data-st-create-go>Créer la station</button>
      `,
    });
    wireDismiss(m);

    setTimeout(() => {
      const root = m.el;
      if (!root) return;
      root.querySelector('#st-new-swatches').addEventListener('click', (e) => {
        const sw = e.target.closest('[data-sw]');
        if (!sw) return;
        chosenColor = SWATCHES[+sw.getAttribute('data-sw')];
        root.querySelectorAll('[data-sw]').forEach((x) => x.classList.toggle('on', x === sw));
      });
      root.querySelector('#st-new-kind').addEventListener('click', (e) => {
        const k = e.target.closest('[data-kind]');
        if (!k) return;
        chosenKind = k.getAttribute('data-kind');
        root.querySelectorAll('[data-kind]').forEach((x) => {
          x.classList.toggle('atlas', x === k);
          x.classList.toggle('ghost', x !== k);
        });
      });

      root.querySelector('[data-st-create-go]').addEventListener('click', () => {
        const nameInput = root.querySelector('#st-new-name');
        const name = (nameInput.value || '').trim();
        if (!name) {
          nameInput.focus();
          toast('Donnez un nom à la station', { type: 'warn' });
          return;
        }
        const id = `st-${Date.now().toString(36)}`;
        STATIONS.push({ id, name, color: chosenColor[0], raw: chosenColor[1], kind: chosenKind, custom: true });
        m.close();
        toast(`Station "${name}" créée`, { type: 'success', desc: 'Disponible sur tous les iPad cuisine et le KDS.' });
        confetti();
        afterCreate?.();
        refreshMenuDrawer();
      });
    }, 0);
  };

  handlers['menu-station-create'] = () => openStationCreate(() => {});

  /* ─── new Glovo-redesign actions (category + option group create/edit) ─── */
  handlers['menu-cat-add'] = () => {
    toast('Nouvelle catégorie', {
      type: 'info',
      desc: 'Saisissez le nom, l\'icône et les plages horaires de visibilité. Mock.',
    });
  };
  handlers['menu-cat-edit'] = () => {
    toast('Catégorie · édition', {
      type: 'info',
      desc: 'Renommer · réordonner · supprimer · plages horaires. Mock.',
    });
  };
  handlers['menu-opt-add'] = () => {
    toast('Nouveau groupe d\'options', {
      type: 'info',
      desc: 'Choix unique · multiple · interrupteur · avec ou sans surcoût. Mock.',
    });
  };

  handlers['menu-promote'] = () => {
    const m = modal({
      tag: 'INSIGHT',
      title: 'Suggestions par station',
      desc: 'Optimisations détectées par Kiwi sur les 30 derniers jours.',
      width: 520,
      body: `
        <div class="p-card" style="margin:0 0 10px;"><div class="head"><h4 style="font-size:14px;">Cuisson chaude · saturée</h4><span class="chip ref">+18 % temps de prép.</span></div><div style="font-size:12.5px; color:var(--n-500);">Pré-portionner les keftas · gain estimé 90 s/ticket.</div></div>
        <div class="p-card" style="margin:0 0 10px;"><div class="head"><h4 style="font-size:14px;">Bar cocktails · sous-utilisé midi</h4><span class="chip ok">+ marge potentielle</span></div><div style="font-size:12.5px; color:var(--n-500);">Promouvoir le mocktail · upsell +12 % panier.</div></div>
        <div class="p-card" style="margin:0;"><div class="head"><h4 style="font-size:14px;">Pâtisserie · pic petit-déjeuner</h4><span class="chip pend">files 8h–10h</span></div><div style="font-size:12.5px; color:var(--n-500);">Lancer le msemen 30 min plus tôt.</div></div>
      `,
      foot: `<button class="kb ghost" data-dismiss>Fermer</button><button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Suggestions appliquées',{type:'success'}); window.Kiwi.confetti();">Appliquer le plan</button>`,
    });
    wireDismiss(m);
  };

  handlers['menu-add'] = () => {
    const m = modal({
      tag: 'NOUVEAU',
      title: 'Ajouter un nouvel item',
      desc: 'Sera publié sur le POS, le QR menu et les agrégateurs en sync.',
      width: 600,
      body: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Nom de l'item</label><input class="kf-input" placeholder="ex. Tajine boulettes" /></div>
          <div class="kf-group"><label class="kf-label">Prix TTC</label><input class="kf-input mono" placeholder="0,00 MAD" /></div>
        </div>
        <div class="kf-group"><label class="kf-label">Catégorie</label>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${CATS.map((c, i) => `<button class="kb ${i === 1 ? 'atlas' : 'ghost'}" style="flex:1; min-width:90px; justify-content:center;">${c.label}</button>`).join('')}
          </div>
        </div>
        <div class="kf-group"><label class="kf-label">Stations de préparation</label>
          <div class="kiwi-st-pick">
            ${STATIONS.map((s, i) => `<span class="kiwi-st-opt ${i === 0 ? 'on' : ''}" data-st-new="${s.id}"><i style="background:${s.raw};"></i>${s.name}</span>`).join('')}
          </div>
        </div>
        <div class="kf-group"><label class="kf-label">Description (visible client)</label><input class="kf-input" placeholder="Ingrédients clés et style" /></div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Annuler</button>
        <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Item publié sur la carte',{type:'success',desc:'Visible sur votre caisse et votre QR menu.'}); window.Kiwi.confetti();">Créer & publier</button>
      `,
    });
    wireDismiss(m);
    setTimeout(() => {
      m.el.querySelector('.kiwi-st-pick').addEventListener('click', (e) => {
        const t = e.target.closest('[data-st-new]');
        if (!t) return;
        t.classList.toggle('on');
      });
    }, 0);
  };

  handlers['menu-schedule'] = () => {
    const m = modal({
      tag: 'PLAGES HORAIRES',
      title: 'Carte programmée',
      desc: 'Affiche / cache automatiquement des items selon le service ou la saison.',
      width: 600,
      body: `
        <div class="p-card" style="margin:0 0 10px;"><div class="head"><h4 style="font-size:14px;">Couscous royal</h4><span class="chip ok">vendredi 11h–15h</span></div><div style="font-size:12.5px; color:var(--n-500);">Affiché automatiquement le vendredi.</div></div>
        <div class="p-card" style="margin:0 0 10px;"><div class="head"><h4 style="font-size:14px;">Méchoui</h4><span class="chip pend">soir 19h–23h</span></div><div style="font-size:12.5px; color:var(--n-500);">Service du soir uniquement.</div></div>
        <div class="p-card" style="margin:0;"><div class="head"><h4 style="font-size:14px;">Petit-déj.</h4><span class="chip neutral">8h–11h tous les jours</span></div><div style="font-size:12.5px; color:var(--n-500);">Msemen, harira, café, thé.</div></div>
      `,
      foot: `<button class="kb ghost" data-dismiss>Fermer</button><button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Programmation enregistrée',{type:'success'})">+ Ajouter une plage</button>`,
    });
    wireDismiss(m);
  };

  handlers['menu-publish'] = () => {
    const m = modal({
      tag: 'PUBLIER',
      title: 'Publier la carte ?',
      desc: 'La nouvelle version sera synchronisée sur tous les canaux en moins de 10 secondes.',
      width: 520,
      body: `
        <div class="p-card" style="margin:0;">
          <div class="head"><h4 style="font-size:14px;">Modifications en attente</h4><span class="meta">DEPUIS 12:42</span></div>
          <ul style="list-style:none; margin:0; padding:0; font-size:13px;">
            <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ Routage stations mis à jour sur 4 items</li>
            <li style="padding:8px 0; border-top:1px solid var(--n-200);">+ Station "Barbecue" créée · 1 item routé</li>
            <li style="padding:8px 0; border-top:1px solid var(--n-200);">+ Station "Crêpes bar" créée · 1 item routé</li>
            <li style="padding:8px 0; border-top:1px solid var(--n-200);">86 : Tajine agneau pruneaux <span class="chip ref">RUPTURE</span></li>
          </ul>
        </div>
      `,
      foot: `<button class="kb ghost" data-dismiss>Garder en brouillon</button><button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Carte publiée',{type:'success',desc:'Caisse et QR menu à jour.'}); window.Kiwi.confetti();">Publier maintenant</button>`,
    });
    wireDismiss(m);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *   handlers['nav-kds']  ·  Écran cuisine avec switcher de stations
   * ═════════════════════════════════════════════════════════════════════════ */
  /* Kitchen-screen UI strings — FR / EN / AR. */
  const KDS_T = {
    fr: { title: 'Écran cuisine', subtitle: 'File de préparation · mise à jour en direct', allStations: 'Toutes', statusNew: 'Nouvelle', statusCooking: 'En préparation', accept: 'Accepter', ready: 'Prête', table: (n) => `Table ${n}`, takeaway: 'À emporter', close: 'Fermer', colNew: 'Nouvelles', colCooking: 'En préparation', history: 'Historique', historyTitle: 'Servies aujourd\'hui', emptyNew: 'Aucune nouvelle commande', emptyCooking: 'Aucune commande en préparation', emptyHistory: 'Aucune commande servie pour l\'instant', served: 'Servie', view: 'Agrandir', readyToast: (n) => `Commande #${n} prête`, notifyServer: 'Serveur prévenu · à servir en salle.', notifyCounter: 'Comptoir prévenu · prêt à remettre.', recipeEyebrow: 'Recette · par portion', recipeYield: (n) => `Rendement · ${n} portion${n > 1 ? 's' : ''}`, recipeIngredients: 'Ingrédients', recipePrep: 'Préparation', recipeFoot: 'Tapez sur un plat pour réafficher sa recette à tout moment.', recipeEmptyT: 'Recette pas encore définie', recipeEmptyB: 'Demandez au chef de la compléter dans Menu › Recettes pour la voir ici.' },
    en: { title: 'Kitchen display', subtitle: 'Prep queue · live updates', allStations: 'All', statusNew: 'New', statusCooking: 'In progress', accept: 'Accept', ready: 'Ready', table: (n) => `Table ${n}`, takeaway: 'Takeaway', close: 'Close', colNew: 'New', colCooking: 'In preparation', history: 'History', historyTitle: 'Served today', emptyNew: 'No new orders', emptyCooking: 'Nothing in preparation', emptyHistory: 'No orders served yet', served: 'Served', view: 'Enlarge', readyToast: (n) => `Order #${n} ready`, notifyServer: 'Server notified · to serve in the dining room.', notifyCounter: 'Counter notified · ready for pickup.', recipeEyebrow: 'Recipe · per portion', recipeYield: (n) => `Yields ${n} portion${n > 1 ? 's' : ''}`, recipeIngredients: 'Ingredients', recipePrep: 'Preparation', recipeFoot: 'Tap any dish on a ticket to view its recipe anytime.', recipeEmptyT: 'Recipe not yet defined', recipeEmptyB: 'Ask the chef to complete it in Menu › Recipes so it shows up here.' },
    ar: { title: 'شاشة المطبخ', subtitle: 'قائمة التحضير · تحديث مباشر', allStations: 'الكل', statusNew: 'جديدة', statusCooking: 'قيد التحضير', accept: 'قبول', ready: 'جاهزة', table: (n) => `طاولة ${n}`, takeaway: 'للأخذ', close: 'إغلاق', colNew: 'جديدة', colCooking: 'قيد التحضير', history: 'السجل', historyTitle: 'قُدّمت اليوم', emptyNew: 'لا توجد طلبات جديدة', emptyCooking: 'لا شيء قيد التحضير', emptyHistory: 'لم تُقدَّم أي طلبات بعد', served: 'قُدّمت', view: 'تكبير', readyToast: (n) => `الطلب #${n} جاهز`, notifyServer: 'تم إشعار النادل · للتقديم في القاعة.', notifyCounter: 'تم إشعار الكاونتر · جاهز للتسليم.', recipeEyebrow: 'الوصفة · لكل حصة', recipeYield: (n) => `الكمية · ${n} حصة`, recipeIngredients: 'المكونات', recipePrep: 'التحضير', recipeFoot: 'اضغط على أي طبق في تذكرة لرؤية وصفته في أي وقت.', recipeEmptyT: 'الوصفة لم تُعرَّف بعد', recipeEmptyB: 'اطلب من الشيف إكمالها في القائمة › الوصفات لتظهر هنا.' },
  };

  /* Kitchen-screen styles — self-contained, kit- prefix, copy-paste safe. */
  if (!document.querySelector('#kiwi-kds-css')) {
    const kdsCss = document.createElement('style');
    kdsCss.id = 'kiwi-kds-css';
    kdsCss.textContent = `
      .kit-screen { display: flex; flex-direction: column; gap: 14px; }
      .kit-topbar { display: flex; gap: 12px; align-items: flex-start; }
      .kit-stationbar { display: flex; gap: 7px; flex-wrap: nowrap; flex: 1; overflow-x: auto; scrollbar-width: none; }
      .kit-stationbar::-webkit-scrollbar { display: none; }
      .kit-station { display: inline-flex; align-items: center; gap: 7px; padding: 10px 12px; flex-shrink: 0; border-radius: 10px; border: 1px solid var(--n-200); background: var(--surface); cursor: pointer; font-family: var(--sans); font-size: 13px; font-weight: 500; color: var(--n-600); letter-spacing: -0.005em; white-space: nowrap; transition: background 130ms ease, border-color 130ms ease, color 130ms ease; }
      .kit-station:hover { border-color: var(--n-400); color: var(--ink); }
      .kit-station.on { background: var(--inverse-surface); border-color: var(--inverse-surface); color: var(--inverse-ink); }
      .kit-station i { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
      .kit-station-ct { font-family: var(--mono); font-size: 11.5px; font-weight: 600; line-height: 1; padding: 2px 6px; border-radius: 999px; background: var(--paper-soft); color: var(--n-600); }
      .kit-station.on .kit-station-ct { background: rgba(255,255,255,0.18); color: var(--paper); }
      .kit-history-toggle { display: inline-flex; align-items: center; gap: 8px; padding: 11px 15px; border-radius: 11px; border: 1px solid var(--n-200); background: var(--surface); cursor: pointer; font-family: var(--sans); font-size: 13.5px; font-weight: 500; color: var(--n-600); white-space: nowrap; flex-shrink: 0; transition: background 130ms ease, border-color 130ms ease, color 130ms ease; }
      .kit-history-toggle:hover { border-color: var(--n-400); color: var(--ink); }
      .kit-history-toggle.on { background: var(--inverse-surface); border-color: var(--inverse-surface); color: var(--inverse-ink); }
      .kit-history-toggle svg { width: 16px; height: 16px; }
      .kit-htg-ct { font-family: var(--mono); font-size: 12px; font-weight: 600; line-height: 1; padding: 3px 7px; border-radius: 999px; background: var(--paper-soft); color: var(--n-600); }
      .kit-history-toggle.on .kit-htg-ct { background: rgba(255,255,255,0.18); color: var(--paper); }
      .kit-cols { display: flex; gap: 14px; align-items: flex-start; }
      .kit-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 0; margin: 0; }
      .kit-col-new { width: 300px; flex-shrink: 0; }
      .kit-col-cooking { flex: 1; min-width: 0; }
      .kit-col-head { display: flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--n-500); padding: 1px 3px; }
      .kit-col-ct { font-weight: 700; color: var(--ink); }
      .kit-col-stack { display: flex; flex-direction: column; gap: 12px; }
      .kit-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; align-items: start; }
      @media (max-width: 1100px) { .kit-grid3 { grid-template-columns: repeat(2, minmax(0,1fr)); } }
      .kit-order { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--n-200); border-radius: 14px; overflow: hidden; }
      .kit-order.is-new { border: 2px solid var(--atlas); box-shadow: 0 0 0 4px rgba(11,110,79,0.10); }
      .kit-order.is-late { border-color: var(--danger); }
      .kit-order.is-late.is-new { box-shadow: 0 0 0 4px rgba(193,58,46,0.12); }
      .kit-order-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 15px 0; }
      .kit-order-tr { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
      .kit-order-num { font-size: 27px; font-weight: 700; letter-spacing: -0.03em; color: var(--ink); line-height: 1; }
      .kit-timer { display: inline-flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 15px; font-weight: 600; padding: 5px 9px; border-radius: 8px; line-height: 1; font-feature-settings: "tnum" 1; flex-shrink: 0; }
      .kit-timer svg { width: 13px; height: 13px; }
      .kit-timer.ok { color: var(--atlas); background: rgba(11,110,79,0.10); }
      .kit-timer.warn { color: var(--warn-ink); background: rgba(217,154,43,0.16); }
      .kit-timer.over { color: var(--danger); background: rgba(193,58,46,0.12); }
      .kit-eye { width: 38px; height: 38px; flex-shrink: 0; padding: 0; border: 1px solid var(--n-200); background: var(--paper-soft); border-radius: 9px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--n-500); transition: background 120ms ease, color 120ms ease, border-color 120ms ease; }
      .kit-eye:hover { color: var(--ink); border-color: var(--n-400); }
      .kit-eye:active { background: var(--n-200); }
      .kit-eye svg { width: 19px; height: 19px; }
      .kit-order-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 15px 13px; }
      .kit-type { display: inline-flex; align-items: center; font-size: 12.5px; font-weight: 600; padding: 5px 10px; border-radius: 8px; letter-spacing: -0.005em; }
      .kit-type.dineIn { background: rgba(11,110,79,0.10); color: var(--atlas); }
      .kit-type.glovo { background: rgba(242,145,55,0.20); color: #99540F; }
      .kit-type.yassir { background: rgba(43,90,168,0.16); color: #2B5AA8; }
      .kit-type.takeaway { background: var(--paper-soft); color: var(--n-600); }
      .kit-status { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--n-500); }
      .kit-order.is-new .kit-status { color: var(--atlas); font-weight: 600; }
      .kit-items { list-style: none; margin: 0; padding: 13px 15px 15px; border-top: 1px solid var(--n-200); display: flex; flex-direction: column; gap: 10px; flex: 1; }
      .kit-item { display: flex; align-items: flex-start; gap: 11px; }
      .kit-q { flex-shrink: 0; min-width: 28px; height: 25px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 14px; font-weight: 700; color: var(--ink); background: var(--paper-soft); border-radius: 7px; }
      .kit-nm { font-size: 15.5px; font-weight: 500; line-height: 1.35; color: var(--ink); padding-top: 2px; }
      .kit-item-off { opacity: 0.32; }
      .kit-act { width: 100%; border: 0; margin: 0; padding: 15px; cursor: pointer; font-family: var(--sans); font-size: 15.5px; font-weight: 600; letter-spacing: -0.01em; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 130ms ease, filter 120ms ease; }
      .kit-act svg { width: 17px; height: 17px; }
      .kit-act-accept { background: var(--ink); color: var(--paper); }
      .kit-act-accept:hover { background: #1c2723; }
      .kit-act-ready { background: var(--atlas); color: var(--paper); }
      .kit-act-ready:hover { background: var(--atlas-700); }
      .kit-act:active { filter: brightness(0.93); }
      .kit-empty { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; padding: 40px 20px; text-align: center; background: var(--paper-soft); border: 1px dashed var(--n-300); border-radius: 13px; }
      .kit-empty svg { width: 26px; height: 26px; color: var(--n-400); }
      .kit-empty span { font-size: 12.5px; color: var(--n-500); }
      .kit-history { position: fixed; top: 0; right: 0; bottom: 0; width: 340px; max-width: 86vw; z-index: 40; background: var(--paper); border-left: 1px solid var(--n-200); box-shadow: -24px 0 55px -30px rgba(10,15,13,0.5); transform: translateX(100%); transition: transform 300ms cubic-bezier(0.4,0,0.2,1); overflow-y: auto; padding: 18px; }
      .kit-history.open { transform: translateX(0); }
      .kit-history-inner { display: flex; flex-direction: column; gap: 10px; }
      .kit-history-head .kit-history-x { margin-inline-start: auto; width: 26px; height: 26px; padding: 0; flex-shrink: 0; border: 1px solid var(--n-200); background: var(--surface); border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--n-500); }
      .kit-history-head .kit-history-x:hover { color: var(--ink); border-color: var(--n-400); }
      .kit-history-head .kit-history-x svg { width: 13px; height: 13px; }
      .kit-history-rows { display: flex; flex-direction: column; gap: 8px; }
      .kit-hrow { display: flex; align-items: center; gap: 9px; width: 100%; text-align: start; font-family: inherit; appearance: none; -webkit-appearance: none; background: var(--surface); border: 1px solid var(--n-200); border-radius: 11px; padding: 11px 13px; cursor: pointer; transition: border-color 130ms ease, background 130ms ease; }
      .kit-hrow:hover { border-color: var(--n-400); background: var(--paper-soft); }
      .kit-hrow-num { font-size: 16px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; flex-shrink: 0; }
      .kit-hrow-time { margin-inline-start: auto; display: inline-flex; align-items: center; gap: 4px; font-family: var(--mono); font-size: 11px; color: var(--atlas); flex-shrink: 0; }
      .kit-hrow-time svg { width: 13px; height: 13px; }
      .kit-hrow-eye { width: 16px; height: 16px; color: var(--n-400); flex-shrink: 0; }
      .kit-served-at { display: inline-flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 15px; font-weight: 600; padding: 5px 9px; border-radius: 8px; line-height: 1; color: var(--atlas); background: rgba(11,110,79,0.10); flex-shrink: 0; }
      .kit-served-at svg { width: 13px; height: 13px; }
      .kit-zoom-backdrop { position: fixed; inset: 0; z-index: 9995; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(10,15,13,0.46); -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px); opacity: 0; transition: opacity 220ms ease; }
      .kit-zoom-backdrop.in { opacity: 1; }
      .kit-zoom { width: 420px; max-width: 100%; background: var(--surface); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 32px 70px -20px rgba(10,15,13,0.6); transform: scale(0.86); transition: transform 280ms cubic-bezier(0.34, 1.45, 0.5, 1); }
      .kit-zoom-backdrop.in .kit-zoom { transform: scale(1); }
      .kit-zoom .kit-order-top { padding: 22px 22px 0; }
      .kit-zoom .kit-order-num { font-size: 38px; }
      .kit-zoom .kit-timer { font-size: 17px; padding: 7px 12px; }
      .kit-zoom .kit-timer svg { width: 15px; height: 15px; }
      .kit-zoom .kit-served-at { font-size: 17px; padding: 7px 12px; }
      .kit-zoom .kit-served-at svg { width: 15px; height: 15px; }
      .kit-zoom .kit-order-meta { padding: 13px 22px 17px; }
      .kit-zoom .kit-type { font-size: 13.5px; padding: 6px 12px; }
      .kit-zoom .kit-items { padding: 18px 22px 22px; gap: 14px; }
      .kit-zoom .kit-q { min-width: 33px; height: 30px; font-size: 16px; }
      .kit-zoom .kit-nm { font-size: 18px; }
      .kit-zoom .kit-act { padding: 18px; font-size: 17px; }

      /* ── Recipe popup · cuisinier taps a dish on a ticket → ingredients + prep ─ */
      .kit-item.has-recipe { cursor: pointer; transition: background 120ms; border-radius: 6px; padding: 2px 4px; margin: -2px -4px; }
      .kit-item.has-recipe:hover { background: var(--paper-soft); }
      .kit-recipe-ico { width: 14px; height: 14px; flex-shrink: 0; color: var(--n-400); margin-left: auto; opacity: 0; transition: opacity 140ms, color 140ms; align-self: center; }
      .kit-item.has-recipe:hover .kit-recipe-ico { opacity: 1; color: var(--atlas); }
      /* Fire-schedule badge on each ticket item — shows when a sync-enabled
         station is being delayed so the plate finishes with the slowest one,
         or signals "served first" for stations with sync OFF (drinks etc.). */
      .kit-fire { display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 99px; font-size: 9.5px; font-weight: 700; font-family: var(--mono); letter-spacing: 0.02em; vertical-align: middle; }
      .kit-fire-wait { background: rgba(217,154,43,0.18); color: var(--warning); }
      .kit-fire-now  { background: rgba(11,110,79,0.14); color: var(--atlas); }
      .kit-fire-fast { background: rgba(54,119,166,0.16); color: #3677A6; }
      .kit-zoom .kit-fire { font-size: 11px; padding: 2px 9px; }
      .kit-zoom .kit-recipe-ico { width: 16px; height: 16px; opacity: 0.5; }
      .kit-zoom .kit-item.has-recipe:hover .kit-recipe-ico { opacity: 1; }
      .kit-recipe-backdrop { position: fixed; inset: 0; z-index: 9996; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(10,15,13,0.5); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); opacity: 0; transition: opacity 200ms ease; }
      .kit-recipe-backdrop.in { opacity: 1; }
      .kit-recipe { width: 480px; max-width: 100%; max-height: calc(100vh - 48px); background: var(--surface); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 32px 70px -20px rgba(10,15,13,0.6); transform: scale(0.86); transition: transform 260ms cubic-bezier(0.34, 1.45, 0.5, 1); font-family: var(--sans, system-ui); color: var(--ink); }
      .kit-recipe-backdrop.in .kit-recipe { transform: scale(1); }
      html[data-theme="dark"] .kit-recipe { background: var(--paper-soft); }
      .kit-recipe-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 20px 22px 16px; border-bottom: 1px solid var(--n-200); }
      .kit-recipe-eyebrow { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--atlas); font-family: var(--mono); font-weight: 700; margin-bottom: 5px; }
      .kit-recipe-title { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); line-height: 1.2; }
      .kit-recipe-close { width: 34px; height: 34px; flex-shrink: 0; padding: 0; border: 1px solid var(--n-200); background: var(--paper); border-radius: 10px; cursor: pointer; color: var(--n-500); display: flex; align-items: center; justify-content: center; transition: color 120ms, border-color 120ms; }
      .kit-recipe-close:hover { color: var(--ink); border-color: var(--n-400); }
      .kit-recipe-close svg { width: 16px; height: 16px; }
      .kit-recipe-body { padding: 16px 22px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
      .kit-recipe-meta { display: flex; flex-wrap: wrap; gap: 8px; }
      .kit-recipe-yield { font-size: 11.5px; font-weight: 600; padding: 4px 10px; background: rgba(11,110,79,0.10); color: var(--atlas); border-radius: 99px; }
      .kit-recipe-cat { font-size: 10.5px; font-family: var(--mono); letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 9px; background: var(--paper-soft); color: var(--n-500); border-radius: 99px; }
      .kit-recipe-section-t { font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--n-500); font-family: var(--mono); font-weight: 700; margin-bottom: 10px; }
      .kit-recipe-ings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      .kit-recipe-ing { display: flex; align-items: baseline; gap: 14px; font-size: 14.5px; line-height: 1.4; padding-bottom: 9px; border-bottom: 1px dashed var(--n-200); }
      .kit-recipe-ing:last-child { border-bottom: 0; padding-bottom: 0; }
      .kit-recipe-ing-q { font-family: var(--mono); font-feature-settings: "tnum" 1; font-weight: 700; color: var(--atlas); min-width: 84px; font-size: 14px; }
      .kit-recipe-ing-n { color: var(--ink); font-weight: 500; }
      .kit-recipe-prep { font-size: 14px; line-height: 1.55; color: var(--n-700); padding: 12px 14px; background: var(--paper); border-radius: 10px; border-left: 3px solid var(--atlas); }
      html[data-theme="dark"] .kit-recipe-prep { background: var(--paper-muted); }
      .kit-recipe-foot { font-size: 11px; color: var(--n-500); padding-top: 8px; border-top: 1px solid var(--n-100); margin-top: 4px; }
      .kit-recipe-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 28px 12px; text-align: center; color: var(--n-500); }
      .kit-recipe-empty svg { width: 36px; height: 36px; opacity: 0.5; }
      .kit-recipe-empty-t { font-size: 15px; font-weight: 600; color: var(--ink); }
      .kit-recipe-empty-b { font-size: 13px; line-height: 1.5; max-width: 280px; }
      html[data-theme="dark"] .kit-station, html[data-theme="dark"] .kit-history-toggle, html[data-theme="dark"] .kit-order, html[data-theme="dark"] .kit-hrow, html[data-theme="dark"] .kit-zoom, html[data-theme="dark"] .kit-history-head .kit-history-x { background: var(--paper-soft); }
      html[data-theme="dark"] .kit-station.on, html[data-theme="dark"] .kit-history-toggle.on { background: var(--inverse-surface); border-color: var(--inverse-line); color: var(--inverse-ink); }
      html[data-theme="dark"] .kit-station.on .kit-station-ct, html[data-theme="dark"] .kit-history-toggle.on .kit-htg-ct { background: var(--paper-muted); color: var(--ink); }
      html[data-theme="dark"] .kit-station-ct, html[data-theme="dark"] .kit-htg-ct, html[data-theme="dark"] .kit-q, html[data-theme="dark"] .kit-eye, html[data-theme="dark"] .kit-zoom .kit-q { background: var(--paper-muted); }
      html[data-theme="dark"] .kit-act-accept { background: var(--paper-muted); color: var(--ink); }
      html[data-theme="dark"] .kit-act-accept:hover { background: var(--n-200); }
      html[data-theme="dark"] .kit-empty { background: var(--paper-soft); }
    `;
    document.head.appendChild(kdsCss);
  }

  handlers['nav-kds'] = () => {
    const lang = (window.KiwiI18n && KiwiI18n.getLang && KiwiI18n.getLang()) || 'fr';
    const T = KDS_T[lang] || KDS_T.fr;

    /* Fresh order queue each open — a demo always shows a busy kitchen.
     * status: new (not accepted) · cooking (in prep) · ready (served, history). */
    const orders = [
      { num: 38, type: 'dineIn', table: '3', status: 'ready', elapsed: 1880, readyAt: '13:46', items: [
        { q: 2, n: 'Couscous royal',         stations: ['cuisson'] },
        { q: 2, n: 'Thé à la menthe',        stations: ['boissons'] } ] },
      { num: 39, type: 'glovo', code: '2904', status: 'ready', elapsed: 1645, readyAt: '13:58', items: [
        { q: 1, n: 'Tajine poulet citron',   stations: ['cuisson'] },
        { q: 1, n: 'Salade marocaine',       stations: ['salade'] } ] },
      { num: 40, type: 'dineIn', table: '8', status: 'ready', elapsed: 1390, readyAt: '14:10', items: [
        { q: 3, n: 'Briouates viande',       stations: ['cuisson'] },
        { q: 2, n: 'Msemen beurre & miel',   stations: ['pastry'] } ] },
      { num: 41, type: 'takeaway', status: 'ready', elapsed: 1155, readyAt: '14:22', items: [
        { q: 2, n: 'Méchoui',                stations: ['bbq'] },
        { q: 2, n: 'Orange pressée',         stations: ['boissons'] } ] },
      { num: 42, type: 'dineIn', table: '4', status: 'cooking', elapsed: 1010, items: [
        { q: 2, n: 'Tajine kefta œuf',       stations: ['cuisson'] },
        { q: 1, n: 'Salade marocaine',       stations: ['salade'] },
        { q: 3, n: 'Thé à la menthe',        stations: ['boissons'] } ] },
      { num: 43, type: 'glovo', code: '3412', status: 'cooking', elapsed: 742, items: [
        { q: 2, n: 'Tajine poulet citron',   stations: ['cuisson'] },
        { q: 1, n: 'Cornes de gazelle',      stations: ['pastry'] } ] },
      { num: 44, type: 'dineIn', table: '7', status: 'cooking', elapsed: 620, items: [
        { q: 1, n: 'Couscous royal',         stations: ['cuisson'] },
        { q: 1, n: 'Pastilla poulet',        stations: ['cuisson', 'pastry'] } ] },
      { num: 45, type: 'yassir', code: '8821', status: 'cooking', elapsed: 388, items: [
        { q: 3, n: 'Tajine kefta œuf',       stations: ['cuisson'] },
        { q: 2, n: 'Cocktail mocktail',      stations: ['bar'] } ] },
      { num: 46, type: 'dineIn', table: '2', status: 'cooking', elapsed: 256, items: [
        { q: 2, n: 'Crêpe complète',         stations: ['crepes'] },
        { q: 4, n: 'Café noir double',       stations: ['boissons'] } ] },
      { num: 47, type: 'dineIn', table: '9', status: 'new', elapsed: 184, items: [
        { q: 4, n: 'Briouates viande',       stations: ['cuisson'] },
        { q: 2, n: "Caviar d'aubergine",     stations: ['salade'] } ] },
      { num: 48, type: 'glovo', code: '3590', status: 'new', elapsed: 92, items: [
        { q: 1, n: 'Méchoui',                stations: ['bbq'] },
        { q: 1, n: 'Limonade traditionnelle', stations: ['boissons'] } ] },
      { num: 49, type: 'dineIn', table: '1', status: 'new', elapsed: 38, items: [
        { q: 1, n: 'Tajine agneau pruneaux', stations: ['cuisson'] } ] },
    ];

    const t0 = Date.now();
    let activeStation = 'all';
    let historyOpen = false;

    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    /* Recipe lookup helpers — hoisted up here so orderInner (which calls
     * kdsHasRecipe at render time) finds them in scope. */
    const findRecipe = (dishName) => {
      const eng = window.KiwiRecipes;
      if (!eng) return null;
      const venues = (window.KiwiVenue && window.KiwiVenue.REAL_VENUES) || ['cafeAtlas', 'maisonMansour', 'spaBahia'];
      for (const v of venues) {
        const list = eng.listRecipes(v);
        const hit = list.find((r) => r.menuItem.name === dishName);
        if (hit) return hit;
      }
      return null;
    };
    const kdsHasRecipe = (dishName) => {
      const hit = findRecipe(dishName);
      return !!(hit && hit.recipe && hit.recipe.status === 'complete' && (hit.recipe.ingredients || []).length);
    };
    const liveElapsed = (o) => o.elapsed + Math.floor((Date.now() - t0) / 1000);
    const urgency = (s) => (s < 480 ? 'ok' : s < 900 ? 'warn' : 'over');
    const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const matchesStation = (o, sid) => sid === 'all' || o.items.some((i) => i.stations.includes(sid));
    const byOldest = (a, b) => liveElapsed(b) - liveElapsed(a);
    const groupOrders = (status) => orders.filter((o) => o.status === status && matchesStation(o, activeStation)).slice().sort(byOldest);

    const typeChip = (o) => {
      if (o.type === 'glovo')    return `<span class="kit-type glovo">Glovo · ${esc(o.code)}</span>`;
      if (o.type === 'yassir')   return `<span class="kit-type yassir">Yassir · ${esc(o.code)}</span>`;
      if (o.type === 'takeaway') return `<span class="kit-type takeaway">${T.takeaway}</span>`;
      return `<span class="kit-type dineIn">${T.table(esc(o.table))}</span>`;
    };

    /* ─── Per-ticket fire scheduler ──────────────────────────────────────
     *  For each ticket, compute when each item should be FIRED so plates
     *  finish together. Reads station prep + sync flag from
     *  KiwiVenue.getStationState (configured in Menu › Stations cuisine).
     *
     *  Algorithm:
     *    1. For each item, look up its station's avgPrepMin + sync.
     *    2. targetReady = max prepMin across items where sync === true.
     *    3. For each item:
     *         · sync === false  →  fireDelay = 0 (start immediately)
     *         · sync === true   →  fireDelay = targetReady − thisPrep
     *
     *  Returns an array of { fireDelay, prep, sync, station } for each
     *  item in the same order as o.items.
     * ────────────────────────────────────────────────────────────────── */
    const scheduleTicket = (o) => {
      const lookup = (sid) => {
        try { return window.KiwiVenue?.getStationState?.(sid) || { avgPrepMin: 10, sync: true }; }
        catch (_) { return { avgPrepMin: 10, sync: true }; }
      };
      const perItem = o.items.map((i) => {
        const sid = i.stations && i.stations[0];
        const st = lookup(sid);
        return { prep: st.avgPrepMin, sync: st.sync, station: sid };
      });
      const syncPreps = perItem.filter((s) => s.sync).map((s) => s.prep);
      const targetReady = syncPreps.length ? Math.max(...syncPreps) : 0;
      return perItem.map((s) => ({
        ...s,
        fireDelay: s.sync ? Math.max(0, targetReady - s.prep) : 0,
      }));
    };

    /* Inner content of an order — shared by the board card and the zoom panel. */
    const orderInner = (o, withEye) => {
      const el = liveElapsed(o);
      const u = urgency(el);
      const isNew = o.status === 'new';
      const isReady = o.status === 'ready';
      const schedule = scheduleTicket(o);
      const items = o.items.map((i, idx) => {
        const off = activeStation !== 'all' && !i.stations.includes(activeStation);
        const hasRecipe = kdsHasRecipe(i.n);
        const sched = schedule[idx];
        /* Fire badge — visible on every non-ready ticket so the demo
         * surfaces the scheduler clearly.
         *   sync OFF                    → "→ servi en premier" (drinks-first)
         *   sync ON  + fireDelay > 0    → "⏱ démarrer dans X min" (delayed)
         *   sync ON  + fireDelay > 0 + elapsed past it → "⏱ en cours"
         *   sync ON  + fireDelay = 0    → no badge (slowest, fires now) */
        let fireBadge = '';
        if (!isReady && sched) {
          if (!sched.sync) {
            fireBadge = `<span class="kit-fire kit-fire-fast">→ servi en premier</span>`;
          } else if (sched.fireDelay > 0) {
            const elapsedMin = Math.floor(el / 60);
            const startsIn = Math.max(0, sched.fireDelay - elapsedMin);
            fireBadge = startsIn > 0
              ? `<span class="kit-fire kit-fire-wait">⏱ démarrer dans ${startsIn} min</span>`
              : `<span class="kit-fire kit-fire-now">⏱ en cours</span>`;
          }
        }
        return `<li class="kit-item${off ? ' kit-item-off' : ''}${hasRecipe ? ' has-recipe' : ''}"${hasRecipe ? ` data-kit-recipe="${esc(i.n)}"` : ''}><span class="kit-q">${i.q}</span><span class="kit-nm">${esc(i.n)}${fireBadge}</span>${hasRecipe ? `<svg class="kit-recipe-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>` : ''}</li>`;
      }).join('');
      const act = isReady
        ? ''
        : isNew
          ? `<button class="kit-act kit-act-accept" data-kit-accept="${o.num}">${T.accept}</button>`
          : `<button class="kit-act kit-act-ready" data-kit-ready="${o.num}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>${T.ready}</button>`;
      const eye = withEye
        ? `<button class="kit-eye" data-kit-eye="${o.num}" aria-label="${esc(T.view)} #${o.num}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button>`
        : '';
      const topRight = isReady
        ? `<span class="kit-served-at"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>${esc(o.readyAt || '')}</span>`
        : `<span class="kit-timer ${u}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span class="kit-timer-v">${fmtTime(el)}</span></span>`;
      return `
        <div class="kit-order-top">
          <span class="kit-order-num">#${o.num}</span>
          <div class="kit-order-tr">
            ${topRight}
            ${eye}
          </div>
        </div>
        <div class="kit-order-meta">
          ${typeChip(o)}
          <span class="kit-status">${isReady ? T.served : isNew ? T.statusNew : T.statusCooking}</span>
        </div>
        <ul class="kit-items">${items}</ul>
        ${act}`;
    };

    const orderCard = (o) => {
      const u = urgency(liveElapsed(o));
      return `<div class="kit-order ${o.status === 'new' ? 'is-new' : 'is-cooking'}${u === 'over' ? ' is-late' : ''}" data-kit-num="${o.num}" data-base="${o.elapsed}">${orderInner(o, true)}</div>`;
    };

    const historyRow = (o) => `
      <button class="kit-hrow" data-kit-eye="${o.num}" aria-label="${esc(T.view)} #${o.num}">
        <span class="kit-hrow-num">#${o.num}</span>
        ${typeChip(o)}
        <span class="kit-hrow-time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12l5 5L20 7"/></svg>${T.served} ${esc(o.readyAt || '')}</span>
        <svg class="kit-hrow-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>`;

    const emptyHtml = (msg) => `<div class="kit-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>${esc(msg)}</span></div>`;

    const stationBar = () => {
      const btn = (id, dot, label) => {
        const count = orders.filter((o) => o.status !== 'ready' && matchesStation(o, id)).length;
        return `<button class="kit-station ${activeStation === id ? 'on' : ''}" data-kit-st="${id}"><i style="background:${dot};"></i><span>${esc(label)}</span><span class="kit-station-ct">${count}</span></button>`;
      };
      return btn('all', 'var(--ink)', T.allStations) + STATIONS.map((s) => btn(s.id, s.raw, s.name)).join('');
    };

    const historyToggleHtml = () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 2.5-6.2"/><path d="M3 4v4h4"/><path d="M12 8v4.5l3 1.8"/></svg><span>${esc(T.history)}</span><span class="kit-htg-ct">${groupOrders('ready').length}</span>`;

    const colHeadHtml = (label, count) => `<div class="kit-col-head"><span>${esc(label)}</span><span class="kit-col-ct">${count}</span></div>`;

    const colNewHtml = () => {
      const list = groupOrders('new');
      return colHeadHtml(T.colNew, list.length)
        + `<div class="kit-col-stack">${list.length ? list.map(orderCard).join('') : emptyHtml(T.emptyNew)}</div>`;
    };
    const colCookHtml = () => {
      const list = groupOrders('cooking');
      return colHeadHtml(T.colCooking, list.length)
        + `<div class="kit-grid3">${list.length ? list.map(orderCard).join('') : emptyHtml(T.emptyCooking)}</div>`;
    };
    const historyHtml = () => {
      const list = groupOrders('ready');
      return `<div class="kit-col-head kit-history-head"><span>${esc(T.historyTitle)}</span><span class="kit-col-ct">${list.length}</span><button class="kit-history-x" data-kit-history-toggle aria-label="${esc(T.close)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`
        + `<div class="kit-history-rows">${list.length ? list.map(historyRow).join('') : emptyHtml(T.emptyHistory)}</div>`;
    };

    const r = fullpage({
      title: T.title,
      subtitle: T.subtitle,
      body: `
        <div class="kit-screen">
          <div class="kit-topbar">
            <div class="kit-stationbar" data-kit-bar></div>
            <button class="kit-history-toggle" data-kit-history-toggle></button>
          </div>
          <div class="kit-cols">
            <section class="kit-col kit-col-new" data-kit-new></section>
            <section class="kit-col kit-col-cooking" data-kit-cook></section>
            <aside class="kit-history" data-kit-history>
              <div class="kit-history-inner" data-kit-history-inner></div>
            </aside>
          </div>
        </div>`,
      foot: `<button class="kb ghost" data-dismiss>${T.close}</button>`,
    });
    wireDismiss(r);

    const barEl = r.el.querySelector('[data-kit-bar]');
    const toggleEl = r.el.querySelector('[data-kit-history-toggle]');
    const newEl = r.el.querySelector('[data-kit-new]');
    const cookEl = r.el.querySelector('[data-kit-cook]');
    const histEl = r.el.querySelector('[data-kit-history]');
    const histInnerEl = r.el.querySelector('[data-kit-history-inner]');

    const paint = () => {
      barEl.innerHTML = stationBar();
      toggleEl.innerHTML = historyToggleHtml();
      newEl.innerHTML = colNewHtml();
      cookEl.innerHTML = colCookHtml();
      histInnerEl.innerHTML = historyHtml();
    };
    paint();

    /* — accept (new -> cooking) / ready (cooking -> served, notify) — */
    const acceptOrder = (num) => {
      const o = orders.find((x) => x.num === num);
      if (o && o.status === 'new') { o.status = 'cooking'; paint(); }
    };
    const readyOrder = (num) => {
      const o = orders.find((x) => x.num === num);
      if (!o || o.status === 'ready') return;
      o.status = 'ready';
      o.readyAt = nowHM();
      paint();
      const delivery = o.type === 'glovo' || o.type === 'yassir' || o.type === 'takeaway';
      // force:true — the ready notification must show even though the KDS is an overlay.
      toast(T.readyToast(num), { type: 'success', duration: 2600, force: true, desc: delivery ? T.notifyCounter : T.notifyServer });
    };

    /* — zoom · one order centered, screen behind blurred, tap-out to close — */
    const openZoom = (o) => {
      document.querySelectorAll('.kit-zoom-backdrop').forEach((b) => b.remove());
      const bd = document.createElement('div');
      bd.className = 'kit-zoom-backdrop';
      bd.innerHTML = `<div class="kit-zoom" data-base="${o.elapsed}">${orderInner(o, false)}</div>`;
      document.body.appendChild(bd);
      requestAnimationFrame(() => bd.classList.add('in'));
      let closing = false;
      const closeZoom = () => {
        if (closing) return;
        closing = true;
        bd.classList.remove('in');
        setTimeout(() => bd.remove(), 300);
      };
      bd.addEventListener('click', (e) => {
        const acc = e.target.closest('[data-kit-accept]');
        if (acc) { acceptOrder(Number(acc.getAttribute('data-kit-accept'))); closeZoom(); return; }
        const rdy = e.target.closest('[data-kit-ready]');
        if (rdy) { readyOrder(Number(rdy.getAttribute('data-kit-ready'))); closeZoom(); return; }
        const recipe = e.target.closest('[data-kit-recipe]');
        if (recipe) { openRecipe(recipe.getAttribute('data-kit-recipe')); return; }
        if (!e.target.closest('.kit-zoom')) closeZoom();
      });
    };

    /* — recipe popup · ingredients + prep notes for a single dish.
     *   Resolves the dish name against KiwiRecipes across all real venues
     *   (cafeAtlas/maisonMansour/spaBahia) via findRecipe/kdsHasRecipe
     *   defined earlier. Falls back to a friendly "no recipe yet" card
     *   when the dish has none. Used to train new cuisiniers — they tap
     *   the dish on a ticket, see the recipe. — */
    const openRecipe = (dishName) => {
      document.querySelectorAll('.kit-recipe-backdrop').forEach((b) => b.remove());
      const hit = findRecipe(dishName);
      const recipe = hit && hit.recipe;
      const eng = window.KiwiRecipes;
      const bd = document.createElement('div');
      bd.className = 'kit-recipe-backdrop';
      let body;
      if (!recipe || recipe.status !== 'complete' || !(recipe.ingredients || []).length) {
        body = `
          <div class="kit-recipe-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <div class="kit-recipe-empty-t">${T.recipeEmptyT}</div>
            <div class="kit-recipe-empty-b">${T.recipeEmptyB}</div>
          </div>`;
      } else {
        const yld = recipe.yield || 1;
        const ingRows = (recipe.ingredients || []).map((ing) => {
          const ref = eng.resolveIngredient(ing.invId);
          const name = (ref && ref.name) || ing.name || '—';
          const unit = ing.unit || (ref && ref.unit) || '';
          const qty  = Number(ing.qty || 0);
          const qDisp = qty < 0.01 ? qty.toFixed(4) : qty < 1 ? qty.toFixed(3) : qty.toString();
          return `<li class="kit-recipe-ing"><span class="kit-recipe-ing-q">${esc(qDisp)} ${esc(unit)}</span><span class="kit-recipe-ing-n">${esc(name)}</span></li>`;
        }).join('');
        const prep = (recipe.notes || '').trim();
        body = `
          <div class="kit-recipe-meta">
            <span class="kit-recipe-yield">${T.recipeYield(yld)}</span>
            ${hit && hit.menuItem.category ? `<span class="kit-recipe-cat">${esc(hit.menuItem.category)}</span>` : ''}
          </div>
          <div class="kit-recipe-section">
            <div class="kit-recipe-section-t">${T.recipeIngredients}</div>
            <ul class="kit-recipe-ings">${ingRows}</ul>
          </div>
          ${prep ? `
            <div class="kit-recipe-section">
              <div class="kit-recipe-section-t">${T.recipePrep}</div>
              <div class="kit-recipe-prep">${esc(prep)}</div>
            </div>
          ` : ''}
          <div class="kit-recipe-foot">${T.recipeFoot}</div>`;
      }
      bd.innerHTML = `
        <div class="kit-recipe" role="dialog" aria-labelledby="kit-recipe-title">
          <div class="kit-recipe-head">
            <div>
              <div class="kit-recipe-eyebrow">${T.recipeEyebrow}</div>
              <h3 id="kit-recipe-title" class="kit-recipe-title">${esc(dishName)}</h3>
            </div>
            <button class="kit-recipe-close" data-kit-recipe-close aria-label="${esc(T.close)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </div>
          <div class="kit-recipe-body">${body}</div>
        </div>`;
      document.body.appendChild(bd);
      requestAnimationFrame(() => bd.classList.add('in'));
      let closing = false;
      const closeRecipe = () => {
        if (closing) return;
        closing = true;
        bd.classList.remove('in');
        setTimeout(() => bd.remove(), 260);
      };
      bd.addEventListener('click', (e) => {
        if (e.target.closest('[data-kit-recipe-close]') || !e.target.closest('.kit-recipe')) closeRecipe();
      });
    };

    /* Live timers — interval clears itself once the screen is closed. */
    const tick = setInterval(() => {
      if (!document.body.contains(r.el)) {
        clearInterval(tick);
        document.querySelectorAll('.kit-zoom-backdrop').forEach((b) => b.remove());
        return;
      }
      document.querySelectorAll('.kit-order, .kit-zoom').forEach((card) => {
        const base = Number(card.getAttribute('data-base')) || 0;
        const el = base + Math.floor((Date.now() - t0) / 1000);
        const u = urgency(el);
        const v = card.querySelector('.kit-timer-v');
        const tEl = card.querySelector('.kit-timer');
        if (v) v.textContent = fmtTime(el);
        if (tEl) tEl.className = `kit-timer ${u}`;
        if (card.classList.contains('kit-order')) card.classList.toggle('is-late', u === 'over');
      });
    }, 1000);

    /* All interactions are local — the kitchen screen is fully self-contained. */
    r.el.addEventListener('click', (e) => {
      const st = e.target.closest('[data-kit-st]');
      if (st) { activeStation = st.getAttribute('data-kit-st'); paint(); return; }

      const ht = e.target.closest('[data-kit-history-toggle]');
      if (ht) {
        historyOpen = !historyOpen;
        histEl.classList.toggle('open', historyOpen);
        toggleEl.classList.toggle('on', historyOpen);
        return;
      }

      const eye = e.target.closest('[data-kit-eye]');
      if (eye) {
        const o = orders.find((x) => x.num === Number(eye.getAttribute('data-kit-eye')));
        if (o) openZoom(o);
        return;
      }

      const recipe = e.target.closest('[data-kit-recipe]');
      if (recipe) { openRecipe(recipe.getAttribute('data-kit-recipe')); return; }

      const acc = e.target.closest('[data-kit-accept]');
      if (acc) { acceptOrder(Number(acc.getAttribute('data-kit-accept'))); return; }

      const rdy = e.target.closest('[data-kit-ready]');
      if (rdy) { readyOrder(Number(rdy.getAttribute('data-kit-ready'))); return; }
    });
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *   KDS auxiliary handlers
   * ═════════════════════════════════════════════════════════════════════════ */
  handlers['kds-bump'] = (el) => {
    const id = el?.dataset.id || 'ticket';
    const tk = el?.closest('.kds-tk');
    const m = modal({
      tag: 'CUISINE',
      title: `Bump ticket ${id} ?`,
      desc: 'Le ticket disparaît de l\'écran cuisine. La salle reçoit la notification « plat prêt ».',
      width: 460,
      body: `<div style="display:flex; gap:12px; padding:12px 14px; background:var(--paper-soft); border-radius:10px; font-size:13px; color:var(--n-600); line-height:1.5;">
        <span style="color:var(--atlas);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg></span>
        <div>Sofia (salle) sera notifiée pour récupérer les plats au pass. Action irréversible, utilisez « Rappeler » si besoin.</div>
      </div>`,
      foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb atlas" data-confirm-bump>Bump ${id}</button>`,
    });
    wireDismiss(m);
    setTimeout(() => {
      m.el.querySelector('[data-confirm-bump]').addEventListener('click', () => {
        m.close();
        if (tk) { tk.style.transition = 'all 280ms'; tk.style.opacity = '0'; tk.style.transform = 'translateX(20px)'; setTimeout(() => tk.remove(), 280); }
        toast(`Ticket ${id} bumpé`, { type: 'success', desc: 'Notification salle envoyée à Sofia · pass · ouvert depuis 4 s.' });
      });
    }, 0);
  };

  handlers['kds-recall'] = (el) => {
    const id = el?.dataset.id || 'ticket';
    toast(`Ticket ${id} rappelé en cuisine`, { type: 'warn', desc: 'Le ticket revient en haut de la file · cuisinier averti.' });
  };

  handlers['kds-86'] = (el) => {
    const item = el?.dataset.item || 'plat';
    const m = modal({
      tag: 'STOCK',
      title: `Mettre « ${item} » en 86 ?`,
      desc: 'Le plat devient indisponible sur la caisse et le QR table.',
      width: 480,
      body: `<div style="font-size:13px; color:var(--n-600); line-height:1.5;">Le client en train de commander voit le plat barré. Vous pouvez le réactiver dès que le stock revient.</div>`,
      foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb danger" data-confirm-86>Confirmer le 86</button>`,
    });
    wireDismiss(m);
    setTimeout(() => {
      m.el.querySelector('[data-confirm-86]').addEventListener('click', () => {
        m.close();
        toast(`${item} en 86`, { type: 'success', desc: 'Désactivé sur la caisse et le QR table.' });
      });
    }, 0);
  };

  handlers['kds-fullscreen'] = () => {
    toast('Plein écran station active', { type: 'info', desc: 'iPad mural connecté · police × 1,4 · auto-refresh 3 s · interface tactile gants compatible.' });
  };
  handlers['kds-reassign'] = () => {
    toast('Réaffecter ticket', { type: 'info', desc: 'Glissez le ticket vers Mehdi M. ou Ayoub Y. pour transférer.' });
  };
  handlers['kds-print-summary'] = () => {
    toast('Récap service midi imprimé', { type: 'success', desc: '47 plats servis · prép. moy. 8 min 14 s · 3 retours cuisine.' });
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · STARTER PAGES for custom venues
 * A merchant-created venue has no demo history. Before this layer, every
 * sidebar destination leaked ANOTHER venue's demo data (a fresh pharmacy
 * opened "Catégories" onto Maison Mansour's caftans). Here we wrap every
 * destination handler — whatever file registered it — at window.load (after
 * pages.js / pages-pro.js / finance.js / conformite.js have all finished
 * overriding each other): when the active venue is custom, the destination
 * renders an honest "this page builds itself from your real sales" starter,
 * titled in the trade's own vocabulary (subtype profile labels).
 * ═════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  /* Snapshot the handlers contributed before the real-data modules reassert
     theirs at load. An allow-list by nav name is not enough: if one of those
     modules fails to install, the same nav name still points at this file's
     fixture handler. Provenance is part of the data barrier. */
  const HANDLER_BEFORE_REAL_MODULE = Object.create(null);
  ['conformite', 'stock', 'finance', 'equipe', 'menu', 'payroll'].forEach((nav) => {
    HANDLER_BEFORE_REAL_MODULE[nav] = window.Kiwi?.handlers?.['nav-' + nav] || null;
  });
  const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  const SPARK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z"/></svg>';

  /* What each destination will become — phrased to fit any trade. */
  const STARTERS = {
    transactions:  { t: 'Ventes',             d: 'L\'historique complet de vos encaissements, en temps réel.',
                     b: ['Chaque vente apparaît ici à la seconde où elle est encaissée', 'Filtres par moyen de paiement, remboursements inclus', 'Rapprochement bancaire et exports comptables'] },
    reglements:    { t: 'Règlements',          d: 'Vos virements et rapprochements bancaires, au même endroit.',
                     b: ['Chaque encaissement rapproché de votre compte', 'Virements Kiwi suivis jusqu\'au crédit', 'Historique de règlements prêt pour votre comptable'] },
    terminaux:     { t: 'Terminaux',          d: 'Vos appareils d\'encaissement, leur état et leurs affectations.',
                     b: ['Statut, batterie et version de chaque appareil', 'Kiwi fonctionne aussi sur votre matériel existant', 'Affectation par employé et par zone'] },
    conformite:    { t: 'Conformité',         d: 'Vos registres et obligations, tenus à jour automatiquement.',
                     b: ['Registres générés à partir de votre activité réelle', 'Alertes avant chaque échéance', 'Dossier prêt en cas de contrôle'] },
    equipe:        { t: 'Équipe',             d: 'Vos employés, leurs rôles et leurs codes PIN.',
                     b: ['Un code PIN par personne sur la caisse', 'Rôles et permissions par poste', 'Performance individuelle dès les premières ventes'] },
    payroll:       { t: 'Paie & planning',    d: 'Plannings, pointage et préparation de la paie.',
                     b: ['Plannings hebdomadaires par personne', 'Pointage directement sur la caisse', 'Heures cumulées prêtes pour la paie'] },
    reservations:  { t: 'Réservations & RDV', d: 'Votre agenda client, connecté à la caisse.',
                     b: ['Réservations et rendez-vous au même endroit', 'Rappels automatiques WhatsApp', 'No-shows suivis et acomptes possibles'] },
    finance:       { t: 'Marges & budget',    d: 'Vos marges réelles, calculées depuis vos ventes.',
                     b: ['Marge brute par produit et par famille', 'Budget mensuel et alertes de dérive', 'Tendances dès vos premières semaines'] },
    tables:        { t: 'Plan de salle',      d: 'Votre salle, vue de la caisse.',
                     b: ['Dessinez vos zones et vos tables', 'État en direct pendant le service', 'Encaissement directement depuis la table'] },
    menu:          { t: 'Menu',               d: 'Votre carte, vos prix et vos options.',
                     b: ['Produits, variantes et options', 'Prix modifiables en deux gestes', 'Disponibilité par créneau ou par jour'] },
    kds:           { t: 'Écran cuisine',      d: 'Les commandes envoyées en préparation, en direct.',
                     b: ['Chaque commande part en cuisine à l\'encaissement', 'Files par poste de préparation', 'Temps de préparation mesurés'] },
    stock:         { t: 'Stock',              d: 'Vos quantités, suivies à chaque vente.',
                     b: ['Le stock décompte automatiquement à la vente', 'Seuils d\'alerte avant rupture', 'Kiwi AI estime les quantités à recommander'] },
    inventory:     { t: 'Inventaire',         d: 'Vos références, leurs prix et leurs quantités.',
                     b: ['Ajoutez vos références une à une ou par import', 'Stock décompté automatiquement à la vente', 'Alertes avant rupture'] },
    categories:    { t: 'Catégories',         d: 'Vos familles d\'articles, telles que vous organisez votre activité.',
                     b: ['Créez vos propres familles et sous-familles', 'Elles structurent la caisse et les rapports', 'Réorganisables à tout moment'] },
    promos:        { t: 'Promotions',         d: 'Vos offres et leurs résultats, mesurés sur de vraies ventes.',
                     b: ['Créez des offres simples ou conditionnelles', 'Impact mesuré sur le chiffre réel', 'Activation et fin programmables'] },
    returns:       { t: 'Retours',            d: 'Vos retours et échanges, tracés proprement.',
                     b: ['Chaque retour relié à sa vente d\'origine', 'Remboursement, avoir ou échange', 'Politique de retour configurable'] },
    appointments:  { t: 'Agenda',             d: 'Votre planning, rempli par vos vraies réservations.',
                     b: ['Vue semaine par membre de l\'équipe', 'Rappels automatiques aux clients', 'Liste d\'attente avec promotion automatique'] },
    services:      { t: 'Prestations',        d: 'Votre catalogue de prestations et de formules.',
                     b: ['Créez vos prestations, durées et prix', 'Formules et abonnements possibles', 'Les plus demandées remontent automatiquement'] },
    practitioners: { t: 'Équipe',             d: 'Les personnes qui réalisent vos prestations.',
                     b: ['Profils, spécialités et plannings', 'Performance par personne dès les premières ventes', 'Commissions configurables'] },
    clients:       { t: 'Fiches clients',     d: 'Votre fichier client, construit vente après vente.',
                     b: ['Une fiche créée automatiquement par client', 'Historique, préférences et notes', 'Campagnes anniversaires et fidélité'] },
  };

  /* Pages whose active handler has a genuine merchant-scoped source and an
     honest empty state. Inventory/categories are keyed by merchant catalogue;
     tables are keyed by venue/paired merchant; the three operational modules
     below apply their own KiwiEnv gate. Promotions is deliberately absent: the
     handler in this file is Maison Mansour fixture data, not a campaign store. */
  const REAL_FOR_MERCHANT = new Set(['inventory', 'categories', 'tables']);

  /* These destinations are safe only when the later operational module really
     replaced the handler captured above. */
  const REAL_FROM_LATER_MODULE = new Set(['conformite', 'stock', 'finance']);

  /* These modules are genuinely scoped only after onboarding has produced a
     custom venue id. Their stores still seed demo data for a built-in venue id,
     even inside an authenticated session, so `KiwiEnv.isReal()` alone must NOT
     let them through. */
  const REAL_FOR_CUSTOM_VENUE = new Set(['equipe', 'menu', 'payroll']);

  /* Data-conditional destinations: a module that builds a real per-venue page but
     has NO empty state of its own belongs here rather than in the set above, so
     the starter still answers until there is something to show. Empty for now —
     payroll was the candidate until team.js gave it a proper empty state. */
  const REAL_WHEN = {};

  function pairedMerchant() {
    try {
      const p = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return !!(p && (p.merchant || p.venueId || p.name));
    } catch (_) { return false; }
  }

  function merchantContext() {
    try {
      return !!window.KiwiEnv?.isReal?.() || !!window.KiwiVenue?.isCustom?.() || pairedMerchant();
    } catch (_) { return false; }
  }

  function salesVenue() {
    try {
      const paired = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      if (paired && paired.venueId) return paired.venueId;
    } catch (_) {}
    try { return window.KiwiVenue?.getVenue?.(); } catch (_) { return undefined; }
  }

  function merchantSales() {
    if (typeof window.KiwiSales?.list !== 'function') return [];
    try {
      const rows = window.KiwiSales.list(salesVenue());
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }

  function laterModuleOwns(nav, handler) {
    if (!handler || handler === HANDLER_BEFORE_REAL_MODULE[nav]) return false;
    if (nav === 'conformite') return !!window.KiwiConformite;
    if (nav === 'finance') return !!window.KiwiFinance;
    if (nav === 'menu') return !!handler.__mxOwned && !!window.KiwiMenuStore;
    if (nav === 'payroll') return !!handler.__ktOwned && !!window.KiwiTeam;
    if (nav === 'equipe') return !!window.KiwiTeam;
    /* stock.js has no public namespace; replacement is the only provenance it
       exposes, and its own renderer applies KiwiEnv before reading fixtures. */
    return nav === 'stock';
  }

  function hasMerchantTruth(nav, handler, customVenue) {
    return REAL_FOR_MERCHANT.has(nav)
      || (REAL_FROM_LATER_MODULE.has(nav) && laterModuleOwns(nav, handler))
      || (customVenue && REAL_FOR_CUSTOM_VENUE.has(nav) && laterModuleOwns(nav, handler))
      || !!(REAL_WHEN[nav] && REAL_WHEN[nav]());
  }

  /* ── Actionable layer: let the client add their OWN data right here ──────
   * Config-type destinations (menu, team, devices…) get an "Add {noun}" button
   * that opens a guided modal; what they type persists per venue and shows back
   * on the page. Output destinations (ventes, marges, KDS…) build from real
   * sales, so their primary action is "record my first sale" (a real sale on a
   * custom venue — it lights the whole dashboard up). Nobody hits a dead end. */
  const LANG = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const T = (o) => (o == null ? '' : (o[LANG()] ?? o.fr ?? ''));
  const escS = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const UI = {
    firstSale: { fr: 'Encaisser ma première vente', en: 'Record my first sale', ar: 'سجّل أول عملية بيع' },
    addMore:   { fr: 'Ajouter', en: 'Add', ar: 'إضافة' },
    done:      { fr: 'Terminé', en: 'Done', ar: 'تم' },
    saved:     { fr: 'Enregistré', en: 'Saved', ar: 'تم الحفظ' },
    started:   { fr: "Bien joué, c'est un début.", en: "Nice, that's a start.", ar: 'أحسنت، هذه بداية.' },
    normal:    { fr: "Encore rien ici, et c'est normal.", en: "Nothing here yet, and that's fine.", ar: 'لا شيء هنا بعد، وهذا طبيعي.' },
    nothing:   { fr: 'Rien encore.', en: 'Nothing yet.', ar: 'لا شيء بعد.' },
    addHint:   { fr: 'Ajoutez-en autant que vous voulez, enregistré pour votre établissement.', en: 'Add as many as you like, saved to your business.', ar: 'أضف ما تشاء، محفوظ لنشاطك.' },
    footSale:  { fr: 'Cette page se construit automatiquement avec vos données réelles, dès vos premières ventes sur la caisse.', en: 'This page builds itself from your real data, starting with your first sales on the register.', ar: 'تُبنى هذه الصفحة تلقائياً من بياناتك الحقيقية بمجرد أول عملية بيع.' },
    footAdd:   { fr: 'Ajoutez vos éléments maintenant, ou laissez-les se créer tout seuls dès la première vente.', en: 'Add your items now, or let them create themselves on the first sale.', ar: 'أضف عناصرك الآن، أو دعها تُنشأ تلقائياً عند أول عملية بيع.' },
    seeSales:  { fr: 'Voir mes ventes', en: 'View my sales', ar: 'عرض مبيعاتي' },
    footBuilt: { fr: 'Cette page se remplit automatiquement à mesure que vous encaissez.', en: 'This page fills itself as you keep taking payments.', ar: 'تمتلئ هذه الصفحة تلقائياً كلما واصلت البيع.' },
  };

  /* The one device Kiwi is CERTAIN about is the caisse the merchant paired: the
     sidebar chip already says "Caisse connectée" while Terminaux — the page whose
     entire job is listing devices — said "Encore rien ici". Read straight from the
     pairing and never written into the editable list, so unpairing removes it on
     its own and a "Terminé" in the add-modal cannot freeze a stale device in. */
  function pairedDeviceLines(nav) {
    if (nav !== 'terminaux') return [];
    let pv = null;
    try { pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return []; }
    if (!pv || !pv.name) return [];
    return ['Caisse Kiwi · ' + pv.name + (pv.location ? ' · ' + pv.location : '') + ' · connectée'];
  }

  /* Direct-add destinations — trade-neutral noun/placeholder for each. */
  const ADD = {
    terminaux:    { title: { fr: 'Ajouter un appareil', en: 'Add a device', ar: 'إضافة جهاز' },        plural: { fr: 'Vos appareils', en: 'Your devices', ar: 'أجهزتك' },        ph: { fr: 'Ex. iPad caisse · comptoir', en: 'e.g. iPad · counter', ar: 'مثال: جهاز الكاونتر' } },
    equipe:       { title: { fr: 'Ajouter un membre', en: 'Add a member', ar: 'إضافة عضو' },           plural: { fr: 'Votre équipe', en: 'Your team', ar: 'فريقك' },             ph: { fr: 'Prénom · rôle (ex. Salma · caisse)', en: 'Name · role', ar: 'الاسم · الدور' } },
    practitioners:{ title: { fr: 'Ajouter un membre', en: 'Add a member', ar: 'إضافة عضو' },           plural: { fr: 'Votre équipe', en: 'Your team', ar: 'فريقك' },             ph: { fr: 'Prénom · spécialité', en: 'Name · specialty', ar: 'الاسم · التخصص' } },
    payroll:      { title: { fr: 'Ajouter un employé', en: 'Add an employee', ar: 'إضافة موظف' },      plural: { fr: 'Vos employés', en: 'Your employees', ar: 'موظفوك' },       ph: { fr: 'Prénom · poste', en: 'Name · position', ar: 'الاسم · المنصب' } },
    menu:         { title: { fr: 'Ajouter un produit', en: 'Add a product', ar: 'إضافة منتج' },        plural: { fr: 'Votre carte', en: 'Your menu', ar: 'قائمتك' },             ph: { fr: 'Ex. Café · 12 MAD', en: 'e.g. Coffee · 12 MAD', ar: 'مثال: قهوة · 12 درهم' } },
    services:     { title: { fr: 'Ajouter une prestation', en: 'Add a service', ar: 'إضافة خدمة' },    plural: { fr: 'Vos prestations', en: 'Your services', ar: 'خدماتك' },     ph: { fr: 'Ex. Coupe · 80 MAD', en: 'e.g. Haircut · 80 MAD', ar: 'مثال: قص · 80 درهم' } },
    tables:       { title: { fr: 'Ajouter une table', en: 'Add a table', ar: 'إضافة طاولة' },          plural: { fr: 'Votre salle', en: 'Your floor', ar: 'قاعتك' },             ph: { fr: 'Ex. Table 4 · terrasse', en: 'e.g. Table 4 · terrace', ar: 'مثال: طاولة 4' } },
    stock:        { title: { fr: 'Ajouter une référence', en: 'Add an item', ar: 'إضافة صنف' },        plural: { fr: 'Votre stock', en: 'Your stock', ar: 'مخزونك' },            ph: { fr: 'Ex. Lait · 40 unités', en: 'e.g. Milk · 40 units', ar: 'مثال: حليب · 40' } },
    inventory:    { title: { fr: 'Ajouter une référence', en: 'Add an item', ar: 'إضافة صنف' },        plural: { fr: 'Votre inventaire', en: 'Your inventory', ar: 'جردك' },     ph: { fr: 'Ex. Référence · quantité', en: 'e.g. Item · qty', ar: 'مثال: صنف · كمية' } },
    categories:   { title: { fr: 'Ajouter une catégorie', en: 'Add a category', ar: 'إضافة فئة' },     plural: { fr: 'Vos catégories', en: 'Your categories', ar: 'فئاتك' },     ph: { fr: 'Ex. Boissons chaudes', en: 'e.g. Hot drinks', ar: 'مثال: مشروبات ساخنة' } },
    promos:       { title: { fr: 'Créer une offre', en: 'Create an offer', ar: 'إنشاء عرض' },          plural: { fr: 'Vos offres', en: 'Your offers', ar: 'عروضك' },             ph: { fr: 'Ex. −10% sur la nouvelle collection', en: 'e.g. −10% on the new collection', ar: 'مثال: −10٪ على المجموعة الجديدة' } },
    clients:      { title: { fr: 'Ajouter un client', en: 'Add a customer', ar: 'إضافة عميل' },        plural: { fr: 'Vos clients', en: 'Your customers', ar: 'عملاؤك' },        ph: { fr: 'Nom · téléphone', en: 'Name · phone', ar: 'الاسم · الهاتف' } },
    reservations: { title: { fr: 'Ajouter une réservation', en: 'Add a booking', ar: 'إضافة حجز' },    plural: { fr: 'Vos réservations', en: 'Your bookings', ar: 'حجوزاتك' },   ph: { fr: 'Nom · date · couverts', en: 'Name · date · guests', ar: 'الاسم · التاريخ' } },
    appointments: { title: { fr: 'Ajouter un rendez-vous', en: 'Add an appointment', ar: 'إضافة موعد' }, plural: { fr: 'Vos rendez-vous', en: 'Your appointments', ar: 'مواعيدك' }, ph: { fr: 'Nom · date · prestation', en: 'Name · date · service', ar: 'الاسم · التاريخ' } },
  };

  const venueId = () => { const KV = window.KiwiVenue; return (KV && KV.getCurrentVenueData && KV.getCurrentVenueData() || {}).id || (KV && KV.getVenue && KV.getVenue()) || 'v'; };
  const skey = (nav) => 'kiwiStarter:' + venueId() + ':' + nav;
  function getItems(nav) { try { return JSON.parse(localStorage.getItem(skey(nav)) || '[]'); } catch (_) { return []; } }
  function setItems(nav, arr) {
    try { localStorage.setItem(skey(nav), JSON.stringify(arr)); } catch (_) {}
    const c = starterCloud(nav);
    if (c) c.push();
  }

  /* ── LA COPIE SERVEUR DES DESTINATIONS « STARTER » ─────────────────────────
   * Ces pages-là ne sont pas des maquettes : le commerçant y tape ses offres,
   * ses réservations, ses terminaux, et la liste lui est réaffichée. C'était de
   * la vraie saisie, rangée sous `kiwiStarter:<venueId>:<nav>` — donc perdue au
   * changement d'appareil comme le reste.
   *
   * Ne SONT PAS câblées ici :
   *   · les destinations de REAL_FOR_CUSTOM (équipe, carte, plan de salle,
   *     stock, inventaire, catégories, paie) — un vrai magasin ne voit jamais
   *     leur version starter, c'est leur module qui répond, et lui a déjà sa
   *     propre copie serveur. Deux miroirs sur une même donnée divergent ;
   *   · `clients`, qui appartient à assets/clients-store.js et à /api/clients.
   *     Le carnet est synchronisé À LA LIGNE, pas au document ; le doubler ici
   *     ferait deux carnets pour un seul commerçant. */
  const STARTER_CLOUD = {
    promos: 'promotions', reservations: 'reservations', services: 'services',
    terminaux: 'terminals', appointments: 'appointments', practitioners: 'practitioners',
  };
  const starterDocs = Object.create(null);
  const starterCarried = Object.create(null);
  let starterOpen = null;          // la destination starter actuellement à l'écran

  function starterCloud(nav) {
    const feature = STARTER_CLOUD[nav];
    if (!feature || !window.KiwiCloudDoc) return null;
    if (starterDocs[nav]) return starterDocs[nav];
    starterDocs[nav] = window.KiwiCloudDoc.attach({
      feature,
      slug: () => window.KiwiCloudDoc.slugFor(venueId()),
      /* Le starter range un TABLEAU nu ; store_docs veut un document. `list` est
       * la forme que /api/store attend déjà pour suppliers et expenses. */
      read: () => ({ list: getItems(nav) }),
      write: (d) => {
        const list = Array.isArray(d && d.list) ? d.list : [];
        // Écriture directe : passer par setItems() reprogrammerait une remontée
        // de ce qu'on vient tout juste de recevoir.
        try { localStorage.setItem(skey(nav), JSON.stringify(list)); } catch (_) {}
        if (starterOpen === nav && STARTERS[nav]) {
          try { renderStarter(nav, STARTERS[nav]); } catch (_) {}
        }
      },
      isEmpty: (d) => !d || !(d.list && d.list.length),
    });
    return starterDocs[nav];
  }

  function starterBind(nav) {
    const c = starterCloud(nav);
    if (!c || !window.KiwiCloudDoc) return;
    const vid = venueId();
    const slug = window.KiwiCloudDoc.slugFor(vid);
    if (slug && !starterCarried[nav]) {
      starterCarried[nav] = 1;
      window.KiwiCloudDoc.carryForward(nav, vid, slug, (raw) => {
        try { const a = JSON.parse(raw || 'null'); return Array.isArray(a) && a.length > 0; }
        catch (_) { return false; }
      }, { prefix: 'kiwiStarter:', suffix: ':' + nav });
    }
    c.bind();
  }

  /* Guided "add" modal — the client types their items; DOM-built list (no
   * innerHTML), persisted on Done, reflected back on the page. */
  function openAddModal(nav) {
    const cfg = ADD[nav]; if (!cfg || !window.Kiwi || !window.Kiwi.modal) return;
    const toast = window.Kiwi.toast;
    const m = window.Kiwi.modal({
      tag: ((window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {}).name || 'Kiwi',
      title: T(cfg.title),
      desc: T(UI.addHint),
      width: 460,
      body: `<input data-add-input type="text" placeholder="${escS(T(cfg.ph))}" style="width:100%;box-sizing:border-box;padding:13px 14px;border:1.5px solid var(--n-200);border-radius:12px;font-family:var(--sans);font-size:15px;color:var(--ink);background:var(--surface);outline:none;"/>
             <div class="gp-add-list" data-add-list></div>`,
      foot: `<button class="kb ghost" type="button" data-add-more style="flex:1;justify-content:center;">${T(UI.addMore)}</button>
             <button class="kb atlas" type="button" data-add-done style="flex:1.3;justify-content:center;">${T(UI.done)}</button>`,
    });
    const input = m.el.querySelector('[data-add-input]');
    const list = m.el.querySelector('[data-add-list]');
    const draft = getItems(nav).slice();
    function paint() {
      while (list.firstChild) list.removeChild(list.firstChild);
      if (!draft.length) {
        const e = document.createElement('div'); e.className = 'gp-add-empty'; e.textContent = T(UI.nothing); list.appendChild(e); return;
      }
      draft.forEach((txt, i) => {
        const row = document.createElement('div'); row.className = 'gp-add-item';
        const span = document.createElement('span'); span.textContent = txt; span.style.flex = '1'; span.style.minWidth = '0';
        const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; x.dataset.del = String(i);
        row.appendChild(span); row.appendChild(x); list.appendChild(row);
      });
    }
    function add() { const v = (input.value || '').trim(); if (!v) { input.focus(); return; } draft.push(v); input.value = ''; input.focus(); paint(); }
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-add-more]')) { add(); return; }
      const x = e.target.closest('[data-del]'); if (x) { draft.splice(+x.dataset.del, 1); paint(); return; }
      if (e.target.closest('[data-add-done]')) {
        setItems(nav, draft);
        m.close();
        if ((window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) || window.KiwiEnv?.isReal?.()) renderStarter(nav, STARTERS[nav]);
        if (toast) toast(T(UI.saved), { type: 'success', force: true, desc: draft.length + ' · ' + T(cfg.plural) });
        try { if (draft.length && window.Kiwi.confetti) window.Kiwi.confetti(); } catch (_) {}
        return;
      }
    });
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    paint();
    setTimeout(() => { try { input && input.focus(); } catch (_) {} }, 200);
  }

  function registerActions() {
    const H = window.Kiwi && window.Kiwi.handlers; if (!H) return;
    if (!H['starter-add']) H['starter-add'] = (_el, nav) => openAddModal(nav);
  }

  function starterTitle(nav, meta) {
    const KV = window.KiwiVenue;
    /* The trade's own label for this destination (subtype profile) wins. */
    const vd = KV?.getCurrentVenueData?.() || {};
    const prof = vd.subtype && KV?.getSubtypeProfile?.(vd.subtype);
    const item = prof && prof.items && prof.items.find(i => i.nav === nav);
    if (item && item.label) {
      const lang = window.KiwiI18n?.getLang?.() || 'fr';
      return item.label[lang] ?? item.label.fr;
    }
    if (nav === 'transactions') {
      const v = KV?.getVocab?.('navOrders');
      if (v) return v;
    }
    return meta.t;
  }

  /* Styles for the real per-venue Ventes list — injected once. */
  function ensureRtxStyles() {
    if (document.getElementById('kiwi-rtx-style')) return;
    const s = document.createElement('style');
    s.id = 'kiwi-rtx-style';
    s.textContent =
      '.rtx-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--n-200)}' +
      '.rtx-count{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--n-500)}' +
      '.rtx-total{font-size:14px;color:var(--ink)}.rtx-total b{font-family:var(--mono)}' +
      '.rtx-list{display:flex;flex-direction:column}' +
      '.rtx-row{display:grid;grid-template-columns:auto auto 1fr auto;align-items:center;gap:14px;padding:12px 2px;border-bottom:1px solid var(--n-100)}' +
      '.rtx-row.is-new{animation:rtx-in .45s cubic-bezier(.32,.72,0,1)}' +
      '@keyframes rtx-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}' +
      '.rtx-t{font-family:var(--mono);font-size:12.5px;color:var(--n-500)}' +
      '.rtx-m{font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas);white-space:nowrap}' +
      '.rtx-l{font-size:14px;color:var(--ink)}' +
      '.rtx-a{font-family:var(--mono);font-size:14.5px;font-weight:600;color:var(--ink);white-space:nowrap}' +
      '.rtx-cur{font-size:10px;color:var(--n-500)}' +
      '.rtx-voids{margin-top:26px;padding-top:18px;border-top:1px solid var(--n-200)}' +
      '.rtx-void-title{font-size:14px;font-weight:650;margin-bottom:4px}.rtx-void-sub{font-size:12px;color:var(--n-500);margin-bottom:10px}' +
      '.rtx-void-row{display:grid;grid-template-columns:auto minmax(120px,1fr) minmax(150px,2fr) auto;gap:12px;align-items:center;padding:11px 2px;border-bottom:1px solid var(--n-100)}' +
      '.rtx-void-who{font-size:13px;font-weight:600}.rtx-void-lines{font-size:12px;color:var(--n-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.rtx-void-amount{font-family:var(--mono);font-size:13px;font-weight:650;color:#b44338;white-space:nowrap}';
    document.head.appendChild(s);
  }

  let cancelAudit = [];
  let cancelAuditMerchant = '';
  let cancelAuditLoading = false;
  let cancelAuditVoidSig = '';
  function auditMerchant() {
    try { return String(window.KiwiLive?.merchant?.() || ''); } catch (_) { return ''; }
  }
  function loadCancelAudit(force) {
    const merchant = auditMerchant();
    if (!merchant || cancelAuditLoading || (!force && cancelAuditMerchant === merchant)) return;
    if (cancelAuditMerchant && cancelAuditMerchant !== merchant) cancelAudit = [];
    cancelAuditLoading = true;
    const from = Date.now() - 366 * 86400000;
    fetch(`/api/sale/cancel?merchant=${encodeURIComponent(merchant)}&from=${from}`, { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        cancelAudit = (j && Array.isArray(j.cancellations)) ? j.cancellations : [];
        cancelAuditMerchant = merchant;
        const H = window.Kiwi && window.Kiwi.handlers;
        if (document.querySelector('[data-real-tx], [data-starter-nav="transactions"]') && H?.['nav-transactions']) H['nav-transactions']();
      }).catch(() => {}).finally(() => { cancelAuditLoading = false; });
  }

  /* A custom/real venue's Ventes page shows the merchant's ACTUAL sales from
   * window.KiwiSales — which now includes Live-Link sales bridged from the caisse
   * (see live-link.js). Newest first, with a running total. Falls back to the
   * starter (below) when there are no sales yet. */
  function renderRealTransactions(nav, meta) {
    ensureRtxStyles();
    const KV = window.KiwiVenue;
    const vd = KV?.getCurrentVenueData?.() || {};
    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    const sales = merchantSales().slice();
    const ML = {
      fr: { cash: 'Espèces', card: 'Carte', tap: 'Kiwi Tap', qr: 'QR Wallet', wallet: 'Kiwi Wallet', link: 'Lien', split: 'Partagée', vente: 'Vente' },
      en: { cash: 'Cash', card: 'Card', tap: 'Kiwi Tap', qr: 'QR Wallet', wallet: 'Kiwi Wallet', link: 'Link', split: 'Split', vente: 'Sale' },
      ar: { cash: 'نقدًا', card: 'بطاقة', tap: 'Kiwi Tap', qr: 'QR Wallet', wallet: 'Kiwi Wallet', link: 'رابط', split: 'مقسّمة', vente: 'بيع' },
    };
    const L = ML[lang] || ML.fr;
    const SUM = { fr: { n: 'ventes', one: 'vente', total: 'Total' }, en: { n: 'sales', one: 'sale', total: 'Total' }, ar: { n: 'مبيعات', one: 'بيع', total: 'المجموع' } }[lang] || { n: 'ventes', one: 'vente', total: 'Total' };
    const fmt = n => { try { return (Math.round(n) || 0).toLocaleString(lang === 'ar' ? 'ar-MA' : 'fr-FR'); } catch (_) { return String(Math.round(n) || 0); } };
    /* ── La MÊME fenêtre que le tableau de bord ────────────────────────────
     * Cette page additionnait tout l'historique du navigateur et imprimait le
     * résultat en gros, sous un tableau de bord qui, lui, affichait la période
     * choisie. « 47 ventes · Total 18 400 MAD » sous un hero à 2 310 MAD : le
     * commerçant voyait deux fois son argent et n'avait aucun moyen de savoir
     * lequel des deux était sa caisse.
     *
     * Pire, les lignes ne portaient QUE l'heure. Une vente d'hier à 14:32 et
     * une vente d'aujourd'hui à 14:32 s'écrivaient exactement pareil, l'une
     * sous l'autre. On borne donc, et quand la fenêtre couvre plus d'un jour
     * on date la ligne — sans quoi borner n'aurait fait que cacher le problème
     * au lieu de le dire. */
    const rangeKey = (() => { try { return window.KiwiDateRange?.getDateRange?.() || ''; } catch (_) { return ''; } })();
    const win = (() => { try { return window.KiwiDateRange?.bounds?.() || []; } catch (_) { return []; } })();
    const lo = (win[0] == null) ? -Infinity : win[0];
    const hi = (win[1] == null) ? Infinity : win[1];
    const inWindow = sales.filter((s) => { const ts = +(s && s.ts) || 0; return ts >= lo && ts < hi; });
    const RANGE_L = {
      fr: { aujourdhui: "aujourd'hui", hier: 'hier', septJours: '7 derniers jours', trenteJours: '30 derniers jours', moisDernier: 'mois dernier', trimestre: 'trimestre', annee: 'année', personnalise: 'période choisie' },
      en: { aujourdhui: 'today', hier: 'yesterday', septJours: 'last 7 days', trenteJours: 'last 30 days', moisDernier: 'last month', trimestre: 'quarter', annee: 'year', personnalise: 'selected period' },
      ar: { aujourdhui: 'اليوم', hier: 'أمس', septJours: 'آخر 7 أيام', trenteJours: 'آخر 30 يومًا', moisDernier: 'الشهر الماضي', trimestre: 'الربع', annee: 'السنة', personnalise: 'الفترة المختارة' },
    }[lang] || {};
    const rangeLabel = RANGE_L[rangeKey] || '';
    // Une fenêtre d'un seul jour n'a pas besoin d'être datée ligne à ligne.
    const oneDay = rangeKey === 'aujourdhui' || rangeKey === 'hier';
    const total = inWindow.reduce((a, s) => a + (s.amount || 0), 0);
    const count = inWindow.length;
    const rows = inWindow.slice().reverse().map((s, i) => {
      const d = new Date(s.ts || Date.now());
      const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      const when = oneDay ? hh
        : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hh}`;
      const m = L[s.method] || L.vente;
      return `<div class="rtx-row${i === 0 ? ' is-new' : ''}">` +
        `<span class="rtx-t">${when}</span>` +
        `<span class="rtx-m">${escS(m)}</span>` +
        `<span class="rtx-l">${escS(L.vente)}</span>` +
        `<span class="rtx-a">${fmt(s.amount)}<span class="rtx-cur"> MAD</span></span>` +
        `</div>`;
    }).join('');
    const voids = cancelAudit.filter((v) => {
      const ts = +(v && v.ts) || 0;
      return ts >= lo && ts < hi;
    });
    const voidRows = voids.map((v) => {
      const d = new Date(v.ts || Date.now());
      const when = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const detail = (v.lines || []).map(l => `${Number(l.qty) || 1} × ${l.name || 'Article'}`).join(' · ') || v.label || 'Vente';
      return `<div class="rtx-void-row"><span class="rtx-t">${escS(when)}</span><span class="rtx-void-who">${escS(v.actor || 'Employé')} · ${escS(v.ref || '')}</span><span class="rtx-void-lines" title="${escS(detail)}">${escS(detail)}</span><span class="rtx-void-amount">− ${fmt(v.amount)} MAD</span></div>`;
    }).join('');
    const startingUp = T({ fr: 'compte en démarrage', en: 'account getting started', ar: 'حساب قيد الإعداد' });
    window.Kiwi.appPage('transactions', {
      title: starterTitle(nav, meta),
      subtitle: `${vd.name || 'Votre établissement'} · ${startingUp}`,
      body: `
        <div data-real-tx class="rtx">
          <div class="rtx-head">
            <div class="rtx-count">${count} ${escS(count === 1 ? SUM.one : SUM.n)}${rangeLabel ? ' · ' + escS(rangeLabel) : ''}</div>
            <div class="rtx-total">${escS(SUM.total)} · <b>${fmt(total)} MAD</b></div>
          </div>
          <div class="rtx-list">${rows || `<div class="rtx-row"><span class="rtx-l">${escS(T({
            fr: 'Aucune vente sur cette période.',
            en: 'No sales in this period.',
            ar: 'لا توجد مبيعات في هذه الفترة.',
          }))}</span></div>`}</div>
          ${voids.length ? `<div class="rtx-voids"><div class="rtx-void-title">${escS(T({ fr:'Annulations employés', en:'Staff cancellations', ar:'إلغاءات الموظفين' }))}</div><div class="rtx-void-sub">${escS(T({ fr:'Vente neutralisée · employé, ticket, articles et montant conservés dans le journal.', en:'Voided sale · employee, receipt, items and amount retained in the audit log.', ar:'بيع ملغى · يتم حفظ الموظف والإيصال والمواد والمبلغ في السجل.' }))}</div>${voidRows}</div>` : ''}
        </div>
      `,
    });
    loadCancelAudit();
  }

  function renderStarter(nav, meta) {
    /* Ventes: once the merchant has real sales (rung locally OR bridged from a
     * Live-Link caisse), show the actual list, not the "nothing yet" placeholder. */
    if (nav === 'transactions' && (merchantSales().length || cancelAudit.length)) {
      return renderRealTransactions(nav, meta);
    }
    /* Cette destination est celle affichée : une copie serveur qui arrive
     * ensuite a le droit de la repeindre — et elle seule. */
    starterOpen = nav;
    try { starterBind(nav); } catch (_) {}
    const KV = window.KiwiVenue;
    const vd = KV?.getCurrentVenueData?.() || {};
    const cfg = ADD[nav];
    const items = cfg ? getItems(nav) : [];
    const linked = pairedDeviceLines(nav);
    const hasItems = (items.length + linked.length) > 0;

    /* What this page becomes (kept — the honest framing). */
    const capRows = meta.b.map(x => `<div class="gp-starter-row">${CHECK}<span>${x}</span></div>`).join('');

    /* What the client has already added — real, persisted, shown right back. */
    const prep = hasItems ? `
      <div class="gp-starter-eyebrow">${escS(T(cfg.plural))} · ${items.length + linked.length}</div>
      <div class="gp-starter-prep">
        ${linked.concat(items).map(x => `<div class="gp-prep-row">${CHECK}<span>${escS(x)}</span></div>`).join('')}
      </div>` : '';

    /* Concrete ways to add data. Config pages get an "Add {noun}" button + the
     * universal first-sale action; output pages get first-sale as the primary. */
    /* "Encaisser ma première vente" stops being true the moment the first sale
     * exists — Promotions and Retours both kept offering it to a store that had
     * already rung two. Once there are sales, the useful next step is the sales
     * list itself. Same for the footer: stop promising a page that will build
     * "dès vos premières ventes" to someone who has made them. */
    const hasSales = merchantSales().length > 0;
    const saleBtn = hasSales
      ? `<button class="kb ${cfg ? 'ghost' : 'atlas'}" type="button" data-action="nav-transactions">${escS(T(UI.seeSales))}</button>`
      : `<button class="kb ${cfg ? 'ghost' : 'atlas'}" type="button" data-action="new-sale">${escS(T(UI.firstSale))}</button>`;
    const actions = cfg
      ? `<div class="gp-starter-actions">
           <button class="kb atlas" type="button" data-action="starter-add" data-arg="${nav}">${escS(T(cfg.title))}</button>
           ${saleBtn}
         </div>`
      : `<div class="gp-starter-actions">${saleBtn}</div>`;

    const h3 = escS(hasItems ? T(UI.started) : T(UI.normal));
    const foot = cfg ? T(UI.footAdd) : (hasSales ? T(UI.footBuilt) : T(UI.footSale));
    const startingUp = T({ fr: 'compte en démarrage', en: 'account getting started', ar: 'حساب قيد الإعداد' });

    window.Kiwi.appPage(nav, {
      title: starterTitle(nav, meta),
      subtitle: `${vd.name || 'Votre établissement'} · ${startingUp}`,
      body: `
        <div class="gp-starter" data-starter-nav="${nav}">
          <div class="gp-starter-ic">${SPARK}</div>
          <h3>${h3}</h3>
          <p>${meta.d}</p>
          ${prep}
          ${actions}
          <div class="gp-starter-list">${capRows}</div>
          <p class="gp-starter-foot">${foot}</p>
        </div>
      `,
    });
  }

  /* Wrap AFTER every module has registered/overridden its nav handlers.
   * Several modules (team.js, stock.js, conformite.js, finance.js…) re-install
   * their handlers at load+setTimeout(0) to win override wars, so a single
   * load-time wrap gets clobbered. The wrap is idempotent (already-wrapped
   * functions are skipped) and re-asserted after their timers and on every
   * venue switch — by the time a destination can be clicked, the guard is on. */
  function installStarters() {
    const H = window.Kiwi && window.Kiwi.handlers;
    if (!H) return;
    registerActions();
    Object.entries(STARTERS).forEach(([nav, meta]) => {
      const key = 'nav-' + nav;
      const orig = H[key];
      if (orig && orig.__kiwiStarter) return;
      const wrapped = function () {
        if (nav === 'transactions') loadCancelAudit();
        const customVenue = !!window.KiwiVenue?.isCustom?.();
        const allowed = hasMerchantTruth(nav, orig, customVenue);
        if (merchantContext() && !allowed) return renderStarter(nav, meta);
        /* On quitte le starter pour une vraie page : sans ça, une copie serveur
         * arrivant en retard repeindrait la page starter PAR-DESSUS celle que le
         * commerçant vient d'ouvrir. */
        starterOpen = null;
        /* Direct invocations (mobile nav, palette, agent) bypass the sidebar
         * router's genpage cleanup — clear a leftover starter page so it
         * can't mask the destination's own body-class view. */
        document.body.classList.remove('page-genpage');
        return orig ? orig.apply(this, arguments) : undefined;
      };
      wrapped.__kiwiStarter = true;
      H[key] = wrapped;
    });
  }
  window.addEventListener('load', () => {
    setTimeout(installStarters, 150);
    if (window.KiwiVenue?.subscribe) window.KiwiVenue.subscribe(() => installStarters());
    /* Live-refresh the Ventes page when a sale lands (local ring-up OR a
     * Live-Link sale bridged from the caisse). Only re-renders when that page is
     * the one on screen — the real list, or the empty starter that a first sale
     * should flip into the list. */
    if (window.KiwiSales?.subscribe) window.KiwiSales.subscribe(() => {
      if (!document.querySelector('[data-real-tx], [data-starter-nav="transactions"]')) return;
      const H = window.Kiwi && window.Kiwi.handlers;
      try { if (H && H['nav-transactions']) H['nav-transactions'](); } catch (_) {}
    });
    document.addEventListener('kiwi-sales-voided', (e) => {
      const sig = JSON.stringify((e && e.detail && e.detail.refs) || []);
      if (sig === cancelAuditVoidSig) return;
      cancelAuditVoidSig = sig;
      loadCancelAudit(true);
    });
  });
})();
