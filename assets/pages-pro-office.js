/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · pages-pro-office.js — sorti de pages-pro.js le 22 octobre 2026
 *
 * Section 1 : accueil, transactions, terminaux, règlements, conformité, équipe,
 * paie et réservations.
 * Sections recopiées telles quelles, chacune dans son IIFE comme avant.
 * Chargé juste AVANT pages-pro.js : ces deux IIFE ouvraient le fichier.
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
  // No toast: the Home tab and page title already say where you are (ticket #0110).
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
 * range selector (Aujourd'hui / Hier / 7 j / 30 j) and the row-click detail
 * are all wired. The Réconciliation and Anti-fraude tabs were removed on
 * 2026-10-13 (processor-only content; see docs/roadmaps/KIWI_2.0_ROADMAP.md).
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
        consolidated: 'données consolidées',
        all: 'Toutes',
        cards: 'Cartes',
        mobile: 'Mobile',
        cash: 'Espèces',
        refunds: 'Remboursements',
        filterActive: 'Filtre actif :',
        ordersDisplayed: 'commandes affichées',
        orderDisplayed: 'commande affichée',
        on: 'sur',
        clear: 'Effacer',
        noOrders: 'Aucune commande pour ce filtre.',
        olderOrdersHidden: 'commandes plus anciennes masquées',
        olderOrderHidden: 'commande plus ancienne masquée',
        showAll: 'Tout afficher',
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
        consolidated: 'consolidated data',
        all: 'All',
        cards: 'Cards',
        mobile: 'Mobile',
        cash: 'Cash',
        refunds: 'Refunds',
        filterActive: 'Active filter:',
        ordersDisplayed: 'orders displayed',
        orderDisplayed: 'order displayed',
        on: 'of',
        clear: 'Clear',
        noOrders: 'No orders for this filter.',
        olderOrdersHidden: 'older orders hidden',
        olderOrderHidden: 'older order hidden',
        showAll: 'Show all',
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
        consolidated: 'بيانات موحدة',
        all: 'الكل',
        cards: 'البطاقات',
        mobile: 'الجوال',
        cash: 'نقدًا',
        refunds: 'المبالغ المستردة',
        filterActive: 'فلتر نشط:',
        ordersDisplayed: 'طلبات معروضة',
        orderDisplayed: 'طلب معروض',
        on: 'من',
        clear: 'مسح',
        noOrders: 'لا توجد طلبات لهذا الفلتر.',
        olderOrdersHidden: 'طلبات أقدم مخفية',
        olderOrderHidden: 'طلب أقدم مخفي',
        showAll: 'عرض الكل',
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

  const fmt2 = (n) => window.KiwiNumber?.number(Math.abs(n), 2) || Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt0 = (n) => window.KiwiNumber?.number(Math.round(n)) || Math.round(n).toLocaleString('fr-FR');

  /* Drawer state */
  let activeFilter = T.all;
  let activeRange  = 'aujourdhui';
  let expanded     = false;
  let unsub        = null;

  function rangeRows() {
    const clock = window.KiwiDemoClock;
    const today = window.KiwiDayReport?.today();
    const yesterday = today && new Date(Date.parse(today + 'T12:00:00Z') - 86400000).toISOString().slice(0,10);
    const sales = activeRange === 'aujourdhui' ? clock?.getDaySales?.()
      : activeRange === 'hier' ? clock?.getDaySales?.(yesterday)
      : clock?.getSales?.(activeRange === 'sept' ? 7 : 30);
    return (sales || []).map(s => ({ ...s, sale:s, t: new Date(s.ts).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',timeZone:(globalThis.KiwiZoneLaw?.effectiveZone(window.KiwiDayReport?.timezone?.(), s.ts) || window.KiwiDayReport?.timezone?.())}),
      simIdx:s.ts, n:s.method === 'cash' ? T.cash : s.method === 'wallet' ? 'Kiwi Wallet' : T.cards,
      mask:'', cat:s.method === 'cash' ? T.cash : s.method === 'wallet' ? T.mobile : T.cards,
      c:s.customer, amt:s.amount, status:'ok' }));
  }
  function rangeRefunds() { return []; }

  const RANGE_LABEL = RANGE_LABEL_STR[lang] || RANGE_LABEL_STR.fr;
  const FILTERS     = [T.all, T.cards, T.mobile, T.cash, T.refunds];

  /* Design 2027 (§18.2): what render() drew, for the kit's Orders page behind
     the dashboard's flag (assets/kit/dash-orders.js). The kit's filter Other
     is the shipped Mobile filter, the same wallet orders. */
  const KIT_FILTER = { all: T.all, card: T.cards, cash: T.cash, other: T.mobile, refunds: T.refunds };
  const KIT_RANGE  = { today: 'aujourdhui', yesterday: 'hier', d7: 'sept', d30: 'trente' };
  let kitModel = null;
  function kitPublish(m) {
    const oneDay = activeRange === 'aujourdhui' || activeRange === 'hier';
    const tz = window.KiwiDayReport?.timezone?.();
    const locale = lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar-MA' : 'fr-FR';
    kitModel = {
      range: Object.keys(KIT_RANGE).find(k => KIT_RANGE[k] === activeRange),
      filter: Object.keys(KIT_FILTER).find(k => KIT_FILTER[k] === activeFilter),
      live: m.live, label: m.live ? T.heroLive : T.heroVolume + RANGE_LABEL[activeRange].toUpperCase(),
      sumText: fmt0(Math.abs(m.heroSum)), unit: 'MAD', count: m.heroTotal, avgText: m.heroAvg + ' MAD',
      filtered: activeFilter === T.all ? null : { label: activeFilter, count: m.total, sumText: fmt0(Math.abs(m.sumAmt)) + ' MAD' },
      noOrders: T.noOrders, showAll: T.showAll,
      hiddenText: m.hidden > 0 ? `${m.hidden} ${m.hidden > 1 ? T.olderOrdersHidden : T.olderOrderHidden}` : '',
      rows: m.display.map(r => {
        const hour = r.t.slice(0, 2) + ':00';
        return {
          id: r.id, time: r.t, method: r.n, staff: r.sale?.staff || '', ref: r.sale?.ref || '', table: r.sale?.table ?? null,
          kind: r.amt < 0 ? 'refund' : r.sale?.method === 'wallet' ? 'other' : r.cat === T.cash ? 'cash' : 'card',
          group: oneDay ? hour : new Date(r.sale?.ts ?? r.simIdx).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', timeZone: (globalThis.KiwiZoneLaw?.effectiveZone(tz, r.sale?.ts ?? r.simIdx) || tz) }) + ' · ' + hour,
          amountText: (r.amt < 0 ? '−' : '') + fmt2(r.amt) + ' MAD'
        };
      })
    };
    try { window.dispatchEvent(new CustomEvent('kiwi:orders-model')); } catch (_) {}
  }
  window.KiwiOrdersPage = {
    model: () => kitModel,
    page: () => dr.el,
    setRange: k => { const r = KIT_RANGE[k]; if (!r || r === activeRange) return; activeRange = r; activeFilter = T.all; expanded = false; render(); },
    setFilter: k => { if (KIT_FILTER[k]) handlers['tx-filter'](null, KIT_FILTER[k]); },
    showAll: () => handlers['tx-show-all']()
  };

  let renderedSignature = "";
  const signature = rows => rows.map(r=>r.id+":"+r.amt).join("|");
  let host;
  const dr = window.Kiwi.appPage('transactions', { title: T.title, subtitle: '…', body: `<div data-tx-host></div>` });
  host = dr.el.querySelector('[data-tx-host]');

  function render() {
    const baseRows = rangeRows();
    renderedSignature = signature(baseRows);
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

    host.innerHTML = `
      <div class="p-hero">
        <div class="l">${live ? T.heroLive : T.heroVolume + RANGE_LABEL[activeRange].toUpperCase()}</div>
        <div class="big">${fmt0(Math.abs(heroSum))} <span style="font-size:18px; opacity:0.7;">MAD</span></div>
        <div class="sub">${heroTotal} ${heroTotal > 1 ? T.orders : T.order} · ${T.avgBasket} ${heroAvg} MAD${live ? '' : ' · ' + T.consolidated}</div>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; align-items:center;">
        ${FILTERS.map(c => `
          <button data-activation=write class="chip ${activeFilter === c ? 'ok' : 'neutral'}" data-action="tx-filter" data-arg="${c}" style="padding:6px 12px; font-size:12px; cursor:pointer; border:0;">${c}</button>
        `).join('')}
        <span style="flex:1;"></span>
        <button data-activation=write class="kb ghost" data-action="tx-daterange" style="padding:6px 12px; font-size:12px; gap:6px;">${RANGE_LABEL[activeRange]} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>
      </div>

      ${filtered ? `
        <div style="background:rgba(125,242,176,0.10); border:1px solid rgba(11,110,79,0.16); padding:8px 14px; border-radius:9px; margin-bottom:12px; font-size:12.5px; color:var(--riad); display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <span>${T.filterActive} <b>${activeFilter}</b> · ${total} ${total > 1 ? T.ordersDisplayed : T.orderDisplayed}${activeFilter !== T.refunds ? ` ${T.on} ${heroTotal}` : ''} · ${fmt0(Math.abs(sumAmt))} MAD</span>
          <button class="kb ghost" data-action="tx-filter" data-arg="${T.all}" style="padding:4px 10px; font-size:11.5px;">${T.clear}</button>
        </div>
      ` : ''}

      <span class="tx-update-status" data-tx-refresh role="status">${({en:'Orders up to date',ar:'الطلبات محدثة'})[lang] || 'Commandes à jour'}</span>
      <div data-tx-pane="flux">
        ${display.length === 0 ? `
          <div style="padding:40px 16px; text-align:center; color:var(--n-500); font-size:13px;">${T.noOrders}</div>
        ` : `
          <table class="p-table">
            <thead><tr><th>${T.hour.toUpperCase()}</th><th>${T.method.toUpperCase()}</th><th>${T.client.toUpperCase()}</th><th class="right">${T.amount.toUpperCase()}</th><th class="right">${T.tip.toUpperCase()}</th><th>${T.status.toUpperCase()}</th></tr></thead>
            <tbody>
              ${display.map(r => `
                <tr tabindex="0" role="button" data-action="tx-detail" data-arg="${r.id}" data-payment-kind="${r.sale?.method === 'wallet' ? 'wallet' : r.cat === T.cash ? 'cash' : r.mask === 'QR' ? 'qr' : r.cat === T.cards || r.cat === T.mobile ? 'card' : 'other'}" style="cursor:pointer;">
                  <td class="mono">${r.t}</td>
                  <td><b>${r.sale?.method === 'wallet' ? '<i data-lucide="wallet" aria-hidden="true" style="width:16px;height:16px;vertical-align:-3px;margin-inline-end:4px;"></i>' : ''}${r.n}</b> <span style="color:var(--n-500);">${r.mask}</span></td>
                  <td style="color:var(--n-600);">${r.c}</td>
                  <td class="mono right" style="${r.amt < 0 ? 'color:var(--danger);' : ''}">${r.amt < 0 ? '−' : ''}${fmt2(r.amt)} MAD</td>
                  <td class="mono right" style="color:${r.tip > 0 ? 'var(--success)' : 'var(--n-400)'};">${r.tip > 0 ? '+' + fmt2(r.tip) : '·'}</td>
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
    `;

    /* Live subtitle */
    const subEl = dr.el.querySelector('.genpage-head p, .kiwi-drawer-head p');
    if (subEl) subEl.textContent = `${heroTotal} ${heroTotal > 1 ? T.orders : T.order} · ${fmt0(Math.abs(heroSum))} MAD · ${RANGE_LABEL[activeRange]}`;
    kitPublish({ live, heroSum, heroTotal, heroAvg, total, sumAmt, display, hidden });
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
  host.addEventListener('keydown', event => {
    const row=event.target.closest('[data-action="tx-detail"]');
    if(row && (event.key==='Enter' || event.key===' ')){event.preventDefault();row.click();}
  });
  handlers['tx-refresh'] = () => render();
  handlers['tx-detail'] = (_el, id) => {
    const row = rangeRows().find(r=>r.id===id);
    if (!row || !window.KiwiDemoClock?.getSimState?.()) return;
    const sale=row.sale;
    const L=({
      en:{items:'Items',payment:'Payment',time:'Time',table:'Table',staff:'Staff',refund:'Refund',print:'Print',demo:'Demo order',refundInfo:'No money was charged for this sample order. To refund a payment, open Till, then Refunds, and select the original receipt.',printing:'Sending to printer…',printed:'Sent to printer.',printerMissing:'No printer is connected. Connect a receipt printer in device setup and try again.'},
      fr:{items:'Articles',payment:'Paiement',time:'Heure',table:'Table',staff:'Équipe',refund:'Rembourser',print:'Imprimer',demo:'Commande de démonstration',refundInfo:'Aucun montant n’a été encaissé pour cet exemple. Pour rembourser un paiement, ouvrez Caisse puis Remboursements et sélectionnez le ticket d’origine.',printing:'Envoi à l’imprimante…',printed:'Envoyé à l’imprimante.',printerMissing:'Aucune imprimante connectée. Configurez une imprimante de tickets puis réessayez.'},
      ar:{items:'الأصناف',payment:'الدفع',time:'الوقت',table:'الطاولة',staff:'الموظف',refund:'استرداد',print:'طباعة',demo:'طلب تجريبي',refundInfo:'لم يُحصّل أي مبلغ لهذا الطلب التجريبي. لاسترداد دفعة افتح الصندوق ثم الاستردادات واختر الإيصال الأصلي.',printing:'جارٍ الإرسال للطابعة…',printed:'أُرسل إلى الطابعة.',printerMissing:'لا توجد طابعة متصلة. اربط طابعة إيصالات في إعداد الجهاز ثم أعد المحاولة.'}
    })[lang] || {};
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const sheet=modal({title:sale.ref,tag:L.demo,body:`
      <div class="tx-detail-hero"><div class="amt">${fmt2(sale.amount)} MAD</div></div>
      <dl class="tx-detail-grid"><dt>${L.payment}</dt><dd>${esc(row.n)}</dd><dt>${L.time}</dt><dd>${esc(new Date(sale.ts).toLocaleString(lang==='en'?'en-GB':lang==='ar'?'ar-MA':'fr-FR',{timeZone:(globalThis.KiwiZoneLaw?.effectiveZone(window.KiwiDayReport?.timezone?.(), sale.ts) || window.KiwiDayReport?.timezone?.())}))}</dd><dt>${L.table}</dt><dd>${esc(sale.table)}</dd><dt>${L.staff}</dt><dd>${esc(sale.staff)}</dd></dl>
      <h4>${L.items}</h4>${sale.lines.map(line=>`<p>${line.qty} × ${esc(line.name)} <b>${fmt2(line.total)} MAD</b></p>`).join('')}
      <p role="status" data-tx-detail-status></p>`,foot:`<button data-activation=money type="button" class="kb ghost" data-tx-refund>${L.refund}</button><button data-activation=write type="button" class="kb atlas" data-tx-print>${L.print}</button>`});
    sheet.el.classList.add('kiwi-native-order-sheet');
    const status=sheet.el.querySelector('[data-tx-detail-status]');
    sheet.el.querySelector('[data-tx-refund]').onclick=()=>{status.textContent=L.refundInfo;};
    sheet.el.querySelector('[data-tx-print]').onclick=async event=>{
      const button=event.currentTarget; button.disabled=true;status.textContent=L.printing;
      try {
        const result=await window.KiwiPrinter?.printReceipt?.({shop:'Kiwi · '+L.demo,ref:sale.ref,date:row.t,lines:sale.lines.map(l=>({name:l.name,qty:l.qty,price:fmt2(l.total)+' MAD'})),total:fmt2(sale.amount)+' MAD',method:row.n,openDrawer:false});
        status.textContent=result?.ok?L.printed:L.printerMissing;
      } catch (_) {status.textContent=L.printerMissing;}
      finally {button.disabled=false;}
    };
  };
  /* Live updates from the demo clock (only when viewing today). */
  if (window.KiwiDemoClock?.subscribe) {
    unsub = window.KiwiDemoClock.subscribe(() => {
      // Stop updating once we leave the Transactions page (the appPage host
      // persists and is shared, so guard on the active page, not isConnected).
      if (!dr.el || !dr.el.isConnected || (window.Kiwi && window.Kiwi.activePage !== 'transactions')) { unsub?.(); unsub = null; return; }
      if (activeRange !== 'aujourdhui') return;
      // A tick never destroys the row the finger or keyboard is using.
      // New data is offered explicitly; filtering/refreshing are user actions.
      const update=host.querySelector('[data-tx-refresh]');
      if(update) {
        const current=signature(rangeRows())===renderedSignature;
        if (current && update.tagName === 'BUTTON') {
          const status=document.createElement('span');
          status.className='tx-update-status'; status.dataset.txRefresh=''; status.setAttribute('role','status');
          status.textContent=({en:'Orders up to date',ar:'الطلبات محدثة'})[lang] || 'Commandes à jour';
          update.replaceWith(status);
        } else if (!current && update.tagName !== 'BUTTON') {
          const button=document.createElement('button');
          button.type='button'; button.className='kb ghost tx-update';
          button.dataset.action='tx-refresh'; button.dataset.txRefresh='';
          button.textContent=({en:'Show updated orders',ar:'عرض الطلبات المحدثة'})[lang] || 'Afficher les nouvelles commandes';
          update.replaceWith(button);
        }
      }
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
const termPct = (value, digits = 1) => window.KiwiNumber?.percent(value, digits) || `${value.toFixed(digits)} %`;
const TERMINAUX_STR = {
    fr: {
        loaned: 'Prêté · Kiwi Pro',
        purchased: 'Acheté · 03/2025',
        replacement: 'Remplacement dû',
        title: 'Parc terminaux',
        subtitle: (active, total) => `${active} / ${total} actifs · uptime 24h ${termPct(94.2)} · 273 tx aujourd'hui`,
        heroTitle: 'ÉTAT DU PARC',
        online: 'en ligne',
        heroSubtitle: () => `Batterie moy. ${termPct(78, 0)} · firmware à jour majoritaire · 1 mise à jour disponible`,
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
        subtitle: (active, total) => `${active} / ${total} active · 24h uptime ${termPct(94.2)} · 273 tx today`,
        heroTitle: 'FLEET STATUS',
        online: 'online',
        heroSubtitle: () => `Avg. battery ${termPct(78, 0)} · majority firmware up-to-date · 1 update available`,
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
        subtitle: (active, total) => `${active} / ${total} نشط · وقت التشغيل 24 ساعة ${termPct(94.2)} · 273 معاملة اليوم`,
        heroTitle: 'حالة الأسطول',
        online: 'متصل',
        heroSubtitle: () => `متوسط البطارية ${termPct(78, 0)} · معظم البرامج الثابتة محدثة · 1 تحديث متوفر`,
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
/* Stable pseudo-random demo values. These cards are illustrative, but figures
 * that change on every open look like a live-data defect. The key gives each
 * terminal/day its own repeatable value without touching IDs or real data. */
function demoUnit(key) {
  let h = 2166136261;
  const text = String(key);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
  return (h >>> 0) / 4294967295;
}
function termFleetSeed() {
  return [
    { id: 'KP-PRO-2831', model: 'KiwiPad pro',     loc: 'comptoir', net: 'wifi', img: 'assets/media/hardware/Hardware_gamefication4.png',    state: 'on',  batt: 87,  battStart: 96,  fw: '4.2.1', fwUpdate: false, txDay: 87,  life: 'loaned',      pulse: 0.70 },
    { id: 'KP-CL-1208',  model: 'KiwiPad cashless', loc: 'salle',    net: '4g',   img: 'assets/media/hardware/Hardware_gamefication2.png',    state: 'on',  batt: 63,  battStart: 92,  fw: '2.0.4', fwUpdate: true,  txDay: 54,  life: 'purchased',   pulse: 0.55 },
    { id: 'KP-PRO-2832', model: 'KiwiPad pro',     loc: 'terrasse', net: 'wifi', img: 'assets/media/hardware/Hardware_gamefication4.png',    state: 'off', batt: 64,  battStart: 88,  fw: '4.2.1', fwUpdate: false, txDay: 0,   life: 'replacement', pulse: 0.05 },
    { id: 'KO-PRO-4501', model: 'KiwiOrders pro',  loc: 'cuisine',  net: 'wifi', img: 'assets/media/hardware/Hardware_KDSgamefication1.png', state: 'on',  batt: 100, battStart: 100, fw: '3.1.0', fwUpdate: false, txDay: 132, life: 'loaned',      pulse: 0.78 },
  ];
}
function termFleet() { if (!TERM_FLEET) TERM_FLEET = termFleetSeed(); return TERM_FLEET; }

/* Hardware the "Add a terminal" form can register. */
const TERM_MODELS = {
  'KiwiPad pro':      { prefix: 'KP-PRO', fw: '4.2.1', img: 'assets/media/hardware/Hardware_gamefication4.png' },
  'KiwiPad cashless': { prefix: 'KP-CL',  fw: '2.0.4', img: 'assets/media/hardware/Hardware_gamefication2.png' },
  'KiwiOrders pro':   { prefix: 'KO-PRO', fw: '3.1.0', img: 'assets/media/hardware/Hardware_KDSgamefication1.png' },
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
    /* The trace fills its column: a fixed 120px line left two thirds of every
       diagnostics cell empty on a wide screen. The stroke keeps its weight. */
    return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  };
  const battCurve = (start, end) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push(start + ((end - start) * i / 12));
    return spark(pts, 'var(--atlas)');
  };
  const beat = (id, n) => Array.from({ length: 30 }, (_, i) => Math.max(0.4, n + (demoUnit(`${id}:beat:${i}`) - 0.5) * 0.5));

  /* ── fleet markup · re-rendered in place after every mutation ───────── */
  function fleetHtml() {
    return `
      <div class="p-hero">
        <div class="l">${T.heroTitle}${(() => { const n = window.KiwiVenue?.getCurrentVenueData?.()?.name; return n ? ' · ' + String(n).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) : ''; })()}</div>
        <div class="big">${activeCount()} / ${fleet.length} <span style="font-size:18px; opacity:0.7;">${T.online}</span></div>
        <div class="sub">${T.heroSubtitle()}</div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); text-transform:uppercase;">${T.deployedDevices}</div>
        <button data-activation=write class="kb ghost" data-action="term-add" style="padding:6px 12px; font-size:12px; gap:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>${T.add}</button>
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
        <div class="p-card term-device" style="margin-bottom:10px; ${bg}">
          <div class="term-device-main" style="display:grid; grid-template-columns:104px 1fr auto; gap:14px; align-items:center; margin-bottom:12px;">
            <div class="term-device-photo" style="width:104px; height:80px; border-radius:11px; background:var(--surface); border:1px solid var(--n-200); display:flex; align-items:center; justify-content:center; padding:6px; ${dim ? 'opacity:0.55;' : ''}">
              <img src="${t.img}" alt="${esc(t.model)}" style="max-width:100%; max-height:100%; object-fit:contain; display:block;" loading="lazy">
            </div>
            <div class="term-device-info">
              <div style="font-weight:600; font-size:14.5px; letter-spacing:-0.005em;">${esc(t.model)} · ${esc(locName(t.loc))}</div>
              <div style="font-family:var(--mono); font-size:11px; color:var(--n-500); margin-top:2px;">S/N ${esc(t.id)} · firmware ${t.fw}${t.fwUpdate ? ` · <span class="chip pend" style="padding:1px 7px; font-size:11px; margin-left:4px;">${T.updateAvailable}</span>` : ''}</div>
              <div style="display:flex; gap:14px; margin-top:8px; font-size:11.5px; color:var(--n-600); flex-wrap:wrap;">
                <span style="display:inline-flex; align-items:center; gap:5px;"><i style="width:6px; height:6px; border-radius:50%; background:${dot};"></i>${statusTxt}</span>
                <span>${t.txDay} ${T.txToday}</span>
                <span class="chip ${lifeChip[t.life] || 'neutral'}" style="padding:1px 8px; font-size:11px;">${lifeText[t.life] || ''}</span>
              </div>
            </div>
            <div class="term-device-actions" style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
              <button class="kb ghost" data-action="term-test" data-arg="${t.id}" style="padding:5px 10px; font-size:11.5px; gap:5px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg>${T.testTx}</button>
              <button class="kb ${off ? 'atlas' : 'ghost'}" data-action="term-manage" data-arg="${t.id}" style="padding:5px 10px; font-size:11.5px;">${T.manage}</button>
            </div>
          </div>
          <div class="term-device-diagnostics" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; padding-top:12px; border-top:1px solid var(--n-200);">
            <div>
              <div style="font-size:11px; letter-spacing:0.08em; color:var(--n-500); font-family:var(--mono); margin-bottom:4px;">${T.beats}</div>
              ${spark(beat(t.id, t.state === 'on' ? t.pulse : 0.05), sparkColor)}
            </div>
            <div>
              <div style="font-size:11px; letter-spacing:0.08em; color:var(--n-500); font-family:var(--mono); margin-bottom:4px;">${T.battery} · ${termPct(t.batt, 0)}</div>
              ${battCurve(t.battStart / 100, t.batt / 100)}
            </div>
            <div>
              <div style="font-size:11px; letter-spacing:0.08em; color:var(--n-500); font-family:var(--mono); margin-bottom:4px;">${T.lastTx}</div>
              <div style="font-family:var(--mono); font-weight:500; font-size:13px;">${t.state === 'on' ? '14:' + (28 + Math.floor(demoUnit(`${t.id}:minute`) * 9)) : '09:18'}</div>
              <div style="font-size:11px; color:var(--n-500); margin-top:2px;">${t.state === 'on' ? (window.KiwiNumber?.money(Math.round(40 + demoUnit(`${t.id}:amount`) * 200), 2) || Math.round(40 + demoUnit(`${t.id}:amount`) * 200) + ',00 MAD') : T.beforeDisconnect}</div>
            </div>
          </div>
        </div>`;
      }).join('')}

      <div style="padding:18px; margin-top:6px; background:var(--paper-soft); border-radius:14px; border:1px dashed var(--n-300); text-align:center;">
        <div style="font-weight:600; margin-bottom:4px; font-size:14.5px;">${T.orderNewTerminal}</div>
        <div style="font-size:12.5px; color:var(--n-500); margin-bottom:12px;">${T.orderNewTerminalDesc}</div>
        <button data-activation=write class="kb atlas" data-action="add-terminal" style="padding:9px 18px;">${T.requestTerminal}</button>
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
  const labelCss = 'display:block; font-size:11px; letter-spacing:0.08em; font-family:var(--mono); color:var(--n-500); text-transform:uppercase; margin-bottom:6px;';

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
          <button data-activation=write id="term-mtoggle" class="kb ${disabled ? 'atlas' : 'ghost'}" style="width:100%; justify-content:center; margin-top:8px; padding:9px 12px; font-size:12.5px;">${disabled ? T.reactivate : T.deactivate}</button>
        </div>

        <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--n-200);">
          <div style="font-size:11px; letter-spacing:0.08em; font-family:var(--mono); color:var(--danger); text-transform:uppercase; margin-bottom:8px;">${T.dangerZone}</div>
          <button id="term-mremove" class="kb ghost" style="width:100%; justify-content:center; padding:9px 12px; font-size:12.5px; color:var(--danger); border-color:rgba(193,58,46,0.45);">${T.removeBtn}</button>
        </div>
      `,
      foot: `
        <button id="term-mcancel" class="kb ghost" style="padding:9px 16px;">${T.cancel}</button>
        <button data-activation=write id="term-msave" class="kb atlas" style="padding:9px 16px;">${T.save}</button>
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
      desc: T.removeDesc(esc(`${t.model} · ${locName(t.loc)}`)),
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
        <button data-activation=write id="term-asave" class="kb atlas" style="padding:9px 16px;">${T.addCta}</button>
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
        heroSubtitle: "Le KiwiPad pro et le KiwiOrders pro se commandent ici · chaque modèle et chaque upgrade est facturé.",
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
        heroSubtitle: 'The KiwiPad pro and the KiwiOrders pro are ordered here · every model and upgrade is billed.',
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
        heroSubtitle: 'يُطلب KiwiPad pro و KiwiOrders pro من هنا · تتم فوترة كل موديل وكل ترقية.',
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
      img: 'assets/media/hardware/Hardware_4.png',
      tag: T.kiwipadProTag,
      desc: T.kiwipadProDesc,
      featured: true,
    },
    {
      sku: 'kiwiorders-pro', name: 'KiwiOrders pro', price: '200 €',
      img: 'assets/media/hardware/Hardware_KDS1.png',
      tag: T.kiwiordersProTag,
      desc: T.kiwiordersProDesc,
    },
    {
      sku: 'kiwipad-cashless', name: 'KiwiPad cashless', price: '100 €',
      img: 'assets/media/hardware/Hardware_2.png',
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
              ${p.featured ? `<span class="chip" style="position:absolute; top:12px; left:12px; background:var(--inverse-surface); color:var(--mint); font-size:11px; padding:4px 10px; letter-spacing:0.08em;">${T.flagship}</span>` : ''}
              <span style="position:absolute; top:${p.featured ? '12' : '10'}px; right:${p.featured ? '12' : '10'}px; background:var(--surface); border:1px solid var(--n-200); border-radius:999px; padding:4px 10px; font-family:var(--mono); font-size:12px; font-weight:600; color:var(--ink);">${p.price}</span>
            </div>
            <div style="padding:${p.featured ? '20px 22px' : '14px 16px 16px'}; display:flex; flex-direction:column;">
              <h4 style="margin:0 0 4px; font-size:${p.featured ? '20' : '15.5'}px; letter-spacing:-0.015em;">${p.name}</h4>
              <div style="font-family:var(--mono); font-size:${p.featured ? '11' : '10.5'}px; color:var(--atlas); letter-spacing:0.06em; text-transform:uppercase; margin-bottom:10px;">${p.tag}</div>
              <p style="margin:0 0 14px; font-size:${p.featured ? '13.5' : '12.5'}px; color:var(--n-600); line-height:1.55; flex:1;">${p.desc}</p>
              <button data-activation=write class="kb ${p.featured ? 'atlas' : 'ghost'}" data-action="catalog-order" data-arg="${p.sku}" style="width:100%; justify-content:center; padding:${p.featured ? '10px 16px' : '8px 12px'}; font-size:${p.featured ? '13' : '12.5'}px;">
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
            <div style="font-family:var(--mono); font-size:11px; letter-spacing:0.12em; color:var(--mint); margin-bottom:4px;">${T.proProgram}</div>
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
    const drift = base + Math.sin(i / 4) * 2200 + (demoUnit(`settlements:forecast:${i}`) - 0.5) * 1800;
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
            <div style="font-family:var(--mono); font-size:18px; font-weight:600; color:var(--atlas); letter-spacing:-0.015em;">+${(window.KiwiNumber?.format(totalProj, {}) ?? totalProj.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}))} MAD</div>
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
          <div style="font-size:11px; color:var(--n-500); letter-spacing:0.08em; font-family:var(--mono);">PROCHAIN T+1</div>
          <div style="font-size:21px; font-weight:600; margin-top:4px; letter-spacing:-0.02em;">23 091 MAD</div>
          <div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">Demain 9h00</div>
          <button class="kb atlas" data-action="settle-now" style="margin-top:10px; padding:6px 12px; font-size:12px;">Régler maintenant</button>
        </div>
        <div>
          <div style="font-size:11px; color:var(--n-500); letter-spacing:0.08em; font-family:var(--mono);">COMMISSIONS</div>
          <div style="font-size:21px; font-weight:600; margin-top:4px; color:var(--danger); letter-spacing:-0.02em;">−4 128 MAD</div>
          <div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">1,18 % blended</div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--n-500); letter-spacing:0.08em; font-family:var(--mono);">ÉCONOMIE vs CMI</div>
          <div style="font-size:21px; font-weight:600; margin-top:4px; color:var(--atlas); letter-spacing:-0.02em;">+5 240 MAD</div>
          <div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">Vs 2,0 % + loc TPE</div>
        </div>
      </div>

      <div class="p-card" style="background:var(--surface); padding:16px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:13px; font-weight:600;">Comptes bancaires liés</div>
          <button data-activation=write class="kb ghost" data-action="add-iban" style="padding:5px 10px; font-size:11.5px;">+ IBAN</button>
        </div>
        ${[
          ['Bank of Africa', '••3291', 'Compte principal · 100 % du flux', 'ok', 'Rapproché'],
          ['Attijariwafa', '••8104', 'Backup · 0 % flux configuré', 'neutral', 'En attente'],
        ].map(([b, m, d, st, lbl]) => `
          <div style="display:grid; grid-template-columns:auto 1fr auto auto; gap:14px; padding:11px 0; border-top:1px solid var(--n-200); align-items:center;">
            <div style="width:32px; height:32px; border-radius:8px; background:var(--inverse-surface); color:var(--mint); display:flex; align-items:center; justify-content:center; font-family:var(--mono); font-size:11px; font-weight:600;">${b.slice(0,2).toUpperCase()}</div>
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
        <button data-activation=money class="kb ghost" data-action="export-pdf" style="flex:1; justify-content:center; padding:10px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>Export PDF</button>
        <button data-activation=money class="kb ghost" data-action="export-csv" style="flex:1; justify-content:center; padding:10px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Export CSV</button>
        <button data-activation=money class="kb atlas" data-action="export-comptable" style="flex:1; justify-content:center; padding:10px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M3 12h18"/></svg>Pack comptable</button>
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
    ['ICE', '00284912000089 · DGI', 'Permanent · vérifié', 'ok', '·'],
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
    ['09:18', 'Export ledger anonymisé', 'badromail9@kiwi-os.com', 'ok'],
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
        <button data-activation=money class="kb" data-action="download-kit" style="background:var(--mint); color:var(--riad); padding:9px 14px; font-size:12.5px; align-self:center;">
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
              <span class="chip ok" style="font-size:11px;">${res}</span>
            </div>
          `).join('')}
          <div class="rc-foot" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--n-200); font-size:11.5px; color:var(--n-500); line-height:1.45;">
            Continu · scan toutes les 4 h sur la base clients & équipe. Alertes WhatsApp + email aux dirigeants.
          </div>
        </div>

        <div class="sh-section" style="margin-bottom:12px;">
          <div class="sh-section-head" style="margin-bottom:10px;">
            <div><h4>${T.declarationsCalendar}</h4><div class="sub">${T.declarationsCalendarSub}</div></div>
            <button data-activation=money class="kb ghost" data-action="cal-export" style="padding:6px 10px; font-size:11px;">.ics</button>
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
          <button data-activation=money class="kb ghost" data-action="audit-export" style="padding:6px 10px; font-size:11px;">${T.exportSignedCsv}</button>
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
          <span class="mono" style="font-size: 11px; color: var(--n-500); letter-spacing: 0.04em;">${formatTimeHr(startH)}</span>
          <span class="mono" style="font-size: 11px; color: var(--n-500); letter-spacing: 0.04em;">${formatTimeHr(endH >= 24 ? endH - 24 : endH)}</span>
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
            <div style="display:flex; align-items:center; gap:8px; font-family:var(--mono); font-size:11px; letter-spacing:0.1em; color:var(--n-500);">
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
              <div style="font-family:var(--mono); font-size:11px; letter-spacing:0.12em; color:var(--mint);">KIWI AI · POINTAGES</div>
              <div style="font-size:13.5px; font-weight:600; margin-top:2px;">${AI_ALERTS.length} anomalies détectées cette semaine</div>
            </div>
          </div>
          <span class="chip" style="background:rgba(125,242,176,0.16); color:var(--mint); font-size:11px; padding:3px 9px;">recommandations</span>
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
            <button data-activation=write class="kb primary" data-action="add-member" style="padding:7px 12px; font-size:12.5px;">
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
          const newChip = m.isNew ? `<span class="chip" style="background:rgba(125,242,176,0.20); color:var(--riad); font-size:11px; padding:2px 7px; margin-left:6px; letter-spacing:0.05em;">NOUV.</span>` : '';
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
                    <span class="chip ${info.cls}" style="font-size: 11px; padding: 3px 10px;">
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
                <span class="chip ${info.cls}" style="font-size: 11px; padding: 3px 9px;">
                  <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: ${info.dot}; margin-right: 5px;"></span>${info.label}
                </span>
                <span style="font-size: 11px; color: var(--n-500);">${offSubline}</span>
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
          <button data-activation=write class="kb ghost" data-action="edit-perms" style="padding:6px 11px; font-size:11.5px;">Modifier les rôles</button>
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
                  <span class="mono" style="font-size:11px; color:var(--n-500); background:var(--paper-soft); padding:2px 7px; border-radius:5px;">${active} / ${CAPS.length}</span>
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
          [data-eq-form] input::placeholder { color: var(--n-500); }
          [data-eq-form] .eq-section-label {
            font-family: var(--mono);
            font-size: 11px;
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
              <button data-activation=write type="button" data-action="eq-regen-pin" style="background: none; border: 0; padding: 4px 8px; margin: -4px -8px; color: var(--atlas); font-size: 11.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-family: var(--sans); border-radius: 5px;">
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
              Téléphone <span style="color: var(--n-500); font-weight: 400; letter-spacing: 0.02em; text-transform: none; margin-left: 6px;">·optionnel, pour l'invitation SMS</span>
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
        <button data-activation=write class="kb atlas" data-action="eq-submit-member" style="gap: 7px; padding: 9px 16px; font-weight: 600;">
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
        <button data-activation=write class="kb atlas" data-action="eq-send-broadcast">Envoyer à 8 appareils</button>
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
          <button data-activation=write class="kb ghost" data-action="edit-shifts" style="padding:8px 12px; font-size:12.5px;">Modifier</button>
        </div>
        <div class="sh-week">
          <div></div>
          ${days.map((d, i) => `<div class="head${i === 5 ? ' today' : ''}">${d}</div>`).join('')}
          ${staff.map(s => `
            <div class="name" style="display:flex; align-items:center; gap:8px;">
              <span style="display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; background:${s.k === 'a' ? 'var(--atlas)' : s.k === 'b' ? 'var(--riad)' : s.k === 'c' ? '#D99A2B' : 'var(--atlas-700)'}; color:var(--paper); font-size:11px; font-weight:600; font-family:var(--mono);">${s.i}</span>
              <div style="line-height:1.2;"><div style="font-size:12px; font-weight:500;">${s.n}</div><div style="font-size:11px; color:var(--n-500); font-family:var(--mono);">${s.role}</div></div>
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
            <button data-activation=write class="kb ghost" data-action="edit-tip-rule">Modifier</button>
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
            <button data-activation=write class="kb ghost" data-action="generate-payslips" style="justify-content:center;">Générer 5 bulletins</button>
            <button data-activation=money class="kb atlas" data-action="export-dgi" style="justify-content:center;">Export DGI · CSV</button>
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
      <button data-activation=money class="kb primary" data-action="export-payroll">Exporter la paie du mois</button>
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
  const dShort = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(LOC[lang] || 'fr-FR', { weekday: 'short', day: 'numeric' });
  const dLong = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(LOC[lang] || 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
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
    { t: '20:00', n: 'Hassan & invités', p: 6, note: { fr: 'Salle · vin frais demandé', en: 'Indoors · chilled wine requested', ar: 'القاعة · طلب نبيذ بارد' }, ns: 'low', st: 'ok', tag: { fr: '·', en: '·', ar: '·' } },
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
              <div class="rcal-name" style="${d.today ? 'color:var(--atlas); font-weight:600;' : ''}">${d.n}${d.today ? ' · ' + T.today : ''}<div style="font-size:11px; color:var(--n-500); font-family:var(--mono); margin-top:2px;">${d.covers} ${T.cov}</div></div>
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
          <button data-activation=write class="kb primary" data-action="add-reservation" style="padding:8px 12px; font-size:12.5px;">${T.newBtn}</button>
        </div>
        <table class="p-table" style="font-size:12.5px;">
          <thead><tr><th>${T.th[0]}</th><th>${T.th[1]}</th><th class="right">${T.th[2]}</th><th>${T.th[3]}</th><th>${T.th[4]}</th><th>${T.th[5]}</th></tr></thead>
          <tbody>
            ${bookings.length === 0 ? '<tr><td colspan="6" style="padding:44px 20px;text-align:center;"><div style="display:flex;flex-direction:column;align-items:center;"><div style="width:44px;height:44px;border-radius:12px;background:rgba(11,110,79,0.10);border:1px solid rgba(11,110,79,0.18);color:var(--atlas);display:grid;place-items:center;margin-bottom:12px;"><svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg></div><div style="font-weight:600;font-size:14.5px;color:var(--ink);">Aucune réservation pour aujourd’hui.</div></div></td></tr>' : bookings.map((b) => {
              const [chipKind, chipLabel] = noShowChip[b.ns];
              return `
                <tr data-action="resv-detail" data-arg="${escV(b.n)}">
                  <td class="mono"><b>${b.t}</b></td>
                  <td><b>${escV(b.n)}</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">${pk(b.tag)}</div></td>
                  <td class="mono right"><b>${b.p}</b> ${T.cov}</td>
                  <td style="color:var(--n-500); font-size:12px;">${pk(b.note)}</td>
                  <td><span class="chip ${chipKind}" style="font-size:11px;">${chipLabel}</span></td>
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
      <button data-activation=write class="kb primary" data-action="add-reservation">${T.addBtn}</button>
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
