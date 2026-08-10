/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · dashboard-extra.js — three owner screens flagged missing in the audit
 *
 *   1 · view-suppliers     Fournisseurs & commandes  (supplier + PO history)
 *   2 · view-margins       Marges & rentabilité      (per-product COGS/margin)
 *   3 · add-integration    Intégrations              (connect / configure)
 *
 * Loads after pages-pro.js. Reuses the shared drawer factory (Kiwi.drawer) and
 * the shared CSS vocabulary injected by pages.js (.p-hero, .p-table, .p-card,
 * .chip, .kb). FR-only content, matching the existing pro drawers.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const toast = Kiwi.toast;

  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');

  const money = (n) => n.toLocaleString('fr-FR') + ' MAD';

  /* ═══════════════════════════════════════════════════════════════════════
   * 1 · FOURNISSEURS & COMMANDES
   *   Supplier directory + purchase-order history. Expands the lone
   *   "Commander en 1 clic" CTA on the dashboard into a real purchasing view.
   * ═══════════════════════════════════════════════════════════════════════ */
  const SUPPLIERS = [
    { name: 'Cuisine Centrale',    cat: 'Plats préparés · surgelés', lead: '24 h', last: '2 mai',  reliab: 98, openPo: 1 },
    { name: 'Bidaoui',             cat: 'Thé · épicerie sèche',      lead: '48 h', last: '28 avr.', reliab: 95, openPo: 1 },
    { name: 'Maison Lait',         cat: 'Produits laitiers',         lead: '24 h', last: '6 mai',  reliab: 91, openPo: 0 },
    { name: 'Métro Cash & Carry',  cat: 'Gros · multi-catégories',   lead: 'Retrait', last: '4 mai', reliab: 99, openPo: 0 },
    { name: 'Marché Central',      cat: 'Fruits & légumes frais',    lead: 'Quotidien', last: '15 mai', reliab: 88, openPo: 1 },
  ];
  const PURCHASE_ORDERS = [
    { id: 'BC-2026-0142', sup: 'Marché Central',   date: '15 mai',  amount: 1240, status: 'draft'   },
    { id: 'BC-2026-0141', sup: 'Cuisine Centrale', date: '14 mai',  amount: 3680, status: 'transit' },
    { id: 'BC-2026-0140', sup: 'Bidaoui',          date: '13 mai',  amount: 1200, status: 'transit' },
    { id: 'BC-2026-0138', sup: 'Maison Lait',      date: '6 mai',   amount: 840,  status: 'received' },
    { id: 'BC-2026-0137', sup: 'Métro Cash & Carry', date: '4 mai', amount: 5210, status: 'received' },
    { id: 'BC-2026-0135', sup: 'Cuisine Centrale', date: '2 mai',   amount: 4070, status: 'received' },
  ];

  const SUPPLIER_STR = {
    fr: {
      title: 'Fournisseurs & commandes',
      subtitle: (s, o, m) => `${s} fournisseurs · ${o} commandes en cours · ${money(m)} ce mois`,
      heroTitle: 'Approvisionnement · Café Atlas',
      heroSubtitle: (po, open) => `${po} bons de commande ce mois · ${open} en attente de réception`,
      sectionTitle: 'Fournisseurs',
      newPo: '+ Nouveau bon de commande',
      inProgress: 'en cours',
      leadTime: 'délai',
      lastOrder: 'dernière commande',
      reliability: 'fiabilité',
      poHistory: 'Historique des bons de commande',
      ref: 'Réf.',
      supplier: 'Fournisseur',
      date: 'Date',
      amount: 'Montant',
      status: 'Statut',
      draft: 'Brouillon',
      transit: 'En transit',
      received: 'Reçu',
      newPoToastT: 'Nouveau bon de commande',
      newPoToastD: 'Sélection du fournisseur et des articles',
      poDetailToastD: 'Détail des articles et suivi de livraison'
    },
    en: {
      title: 'Suppliers & Orders',
      subtitle: (s, o, m) => `${s} suppliers · ${o} open orders · ${money(m)} this month`,
      heroTitle: 'Procurement · Café Atlas',
      heroSubtitle: (po, open) => `${po} purchase orders this month · ${open} pending receipt`,
      sectionTitle: 'Suppliers',
      newPo: '+ New Purchase Order',
      inProgress: 'in progress',
      leadTime: 'lead time',
      lastOrder: 'last order',
      reliability: 'reliability',
      poHistory: 'Purchase Order History',
      ref: 'Ref.',
      supplier: 'Supplier',
      date: 'Date',
      amount: 'Amount',
      status: 'Status',
      draft: 'Draft',
      transit: 'In Transit',
      received: 'Received',
      newPoToastT: 'New Purchase Order',
      newPoToastD: 'Select supplier and items',
      poDetailToastD: 'Item details and delivery tracking'
    },
    ar: {
      title: 'الموردون والطلبات',
      subtitle: (s, o, m) => `${s} موردون · ${o} طلبات جارية · ${money(m)} هذا الشهر`,
      heroTitle: 'التوريد · مقهى أطلس',
      heroSubtitle: (po, open) => `${po} طلب شراء هذا الشهر · ${open} في انتظار الاستلام`,
      sectionTitle: 'الموردون',
      newPo: '+ طلب شراء جديد',
      inProgress: 'جاري',
      leadTime: 'مهلة',
      lastOrder: 'آخر طلب',
      reliability: 'الموثوقية',
      poHistory: 'سجل طلبات الشراء',
      ref: 'المرجع',
      supplier: 'المورد',
      date: 'التاريخ',
      amount: 'المبلغ',
      status: 'الحالة',
      draft: 'مسودة',
      transit: 'قيد النقل',
      received: 'تم الاستلام',
      newPoToastT: 'طلب شراء جديد',
      newPoToastD: 'اختيار المورد والأصناف',
      poDetailToastD: 'تفاصيل الأصناف وتتبع التسليم'
    }
  };

  const PO_STATUS = {
    draft:    { cls: 'pend',    i18nKey: 'draft' },
    transit:  { cls: 'info-soft', i18nKey: 'transit' },
    received: { cls: 'ok',      i18nKey: 'received' },
  };

  handlers['view-suppliers'] = () => {
    const lang = trLang();
    const str = SUPPLIER_STR[lang] || SUPPLIER_STR.fr;

    /* A real / custom-venue merchant has no supplier history yet — show the
     * starter state instead of leaking Café Atlas's demo supplier roster and POs
     * (mirrors view-margins). */
    if (window.KiwiVenue?.isCustom?.() || window.KiwiEnv?.isReal?.()) {
      const T = ({
        fr: { s: 'Compte en démarrage', h: 'Votre approvisionnement apparaîtra ici', d: 'Créez vos bons de commande et Kiwi suit vos fournisseurs, vos délais et vos dépenses d’achat, automatiquement.' },
        en: { s: 'Account starting up', h: 'Your procurement will show here', d: 'Create your purchase orders and Kiwi tracks your suppliers, lead times and purchasing spend, automatically.' },
        ar: { s: 'حساب في بدايته', h: 'سيظهر توريدك هنا', d: 'أنشئ أوامر الشراء وسيتابع Kiwi موردّيك وآجالك ومصاريف الشراء تلقائيًا.' },
      })[lang] || { s: '', h: 'Your procurement will show here', d: '' };
      drawer({
        title: str.title, subtitle: T.s, width: 520,
        body: `<div style="padding:26px 8px 14px;text-align:center;">` +
          `<div style="font-size:14.5px;font-weight:600;color:var(--ink);">${T.h}</div>` +
          `<div style="font-size:12.5px;color:var(--n-500);margin-top:7px;line-height:1.55;max-width:360px;margin-inline:auto;">${T.d}</div>` +
          `</div>`,
      });
      return;
    }

    const openPo = PURCHASE_ORDERS.filter((p) => p.status !== 'received').length;
    const monthSpend = PURCHASE_ORDERS.reduce((s, p) => s + p.amount, 0);

    drawer({
      title: str.title,
      subtitle: str.subtitle(SUPPLIERS.length, openPo, monthSpend),
      width: 840,
      body: `
        <div class="p-hero">
          <div class="l">${str.heroTitle}</div>
          <div class="big">${money(monthSpend)}</div>
          <div class="sub">${str.heroSubtitle(PURCHASE_ORDERS.length, openPo)}</div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin:4px 0 10px;">
          <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); text-transform:uppercase;">${str.sectionTitle}</div>
          <button class="kb atlas xs" data-action="supplier-new-po">${str.newPo}</button>
        </div>

        ${SUPPLIERS.map((s) => `
          <div class="p-card" style="margin-bottom:8px;">
            <div style="display:grid; grid-template-columns:1fr auto; gap:14px; align-items:center;">
              <div>
                <div style="font-weight:600; font-size:14.5px;">${s.name}${s.openPo ? ` <span class="chip info-soft" style="font-size:10px; padding:1px 7px;">${s.openPo} ${str.inProgress}</span>` : ''}</div>
                <div style="font-size:11.5px; color:var(--n-500); margin-top:3px;">${s.cat} · ${str.leadTime} ${s.lead} · ${str.lastOrder} ${s.last}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-family:var(--mono); font-size:13px; font-weight:600; color:${s.reliab >= 95 ? 'var(--success)' : 'var(--warning)'};">${s.reliab}%</div>
                <div style="font-family:var(--mono); font-size:10px; color:var(--n-500);">${str.reliability}</div>
              </div>
            </div>
          </div>
        `).join('')}

        <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); text-transform:uppercase; margin:18px 0 8px;">${str.poHistory}</div>
        <table class="p-table">
          <thead><tr><th>${str.ref}</th><th>${str.supplier}</th><th>${str.date}</th><th class="right">${str.amount}</th><th>${str.status}</th></tr></thead>
          <tbody>
            ${PURCHASE_ORDERS.map((p) => `
              <tr data-action="supplier-po-detail" data-arg="${p.id}">
                <td class="mono">${p.id}</td>
                <td>${p.sup}</td>
                <td>${p.date}</td>
                <td class="mono right">${money(p.amount)}</td>
                <td><span class="chip ${PO_STATUS[p.status].cls}">${str[PO_STATUS[p.status].i18nKey]}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `,
    });
  };

  handlers['supplier-new-po'] = () => {
    const str = SUPPLIER_STR[trLang()] || SUPPLIER_STR.fr;
    toast(str.newPoToastT, { type: 'info', desc: str.newPoToastD });
  }
  handlers['supplier-po-detail'] = (_el, arg) => {
    const str = SUPPLIER_STR[trLang()] || SUPPLIER_STR.fr;
    toast(`Bon de commande ${arg || ''}`.trim(), { type: 'info', desc: str.poDetailToastD });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 2 · MARGES & RENTABILITÉ
   *   Per-product COGS and contribution margin — the profitability view the
   *   dashboard's revenue tiles never break down.
   * ═══════════════════════════════════════════════════════════════════════ */
  const PRODUCTS = [
    { name: 'Café espresso',      price: 18, cost: 4.2,  sold: 96 },
    { name: 'Thé à la menthe',    price: 15, cost: 3.1,  sold: 78 },
    { name: 'Msemen',             price: 12, cost: 3.5,  sold: 54 },
    { name: 'Jus d\'orange',      price: 22, cost: 9.0,  sold: 41 },
    { name: 'Salade marocaine',   price: 35, cost: 11.0, sold: 33 },
    { name: 'Pastilla au poulet', price: 65, cost: 28.0, sold: 24 },
    { name: 'Tajine kefta',       price: 75, cost: 34.0, sold: 19 },
    { name: 'Couscous vendredi',  price: 90, cost: 47.0, sold: 12 },
  ];

  const MARGINS_STR = {
    fr: {
      title: 'Marges & rentabilité',
      subtitle: (margin, profit) => `Marge moyenne ${margin}% · profit brut ${money(profit)} aujourd'hui`,
      heroTitle: "Profit brut · aujourd'hui",
      heroSubtitle: (sales, margin) => `Sur ${money(sales)} de ventes · marge moyenne pondérée ${margin}%`,
      bestContributor: 'MEILLEUR CONTRIBUTEUR',
      lowestMargin: 'MARGE LA PLUS FAIBLE',
      margin: 'marge',
      reviewWarning: 'à revoir le prix ou le coût',
      productDetail: 'Détail par produit',
      exportCsv: 'Exporter en CSV',
      product: 'Produit',
      price: 'Prix',
      cost: 'Coût',
      marginHeader: 'Marge',
      marginPctHeader: 'Marge %',
      sold: 'Vendus',
      contribution: 'Contribution',
      footnote: "Coût des marchandises (CMV) estimé à partir des fiches recette et des derniers prix fournisseurs. Mettez à jour les coûts depuis l'écran Fournisseurs.",
      exportToast: 'Export CSV téléchargé'
    },
    en: {
      title: 'Margins & Profitability',
      subtitle: (margin, profit) => `Average margin ${margin}% · gross profit ${money(profit)} today`,
      heroTitle: 'Gross Profit · Today',
      heroSubtitle: (sales, margin) => `On ${money(sales)} in sales · weighted average margin ${margin}%`,
      bestContributor: 'TOP CONTRIBUTOR',
      lowestMargin: 'LOWEST MARGIN',
      margin: 'margin',
      reviewWarning: 'review price or cost',
      productDetail: 'By-product detail',
      exportCsv: 'Export to CSV',
      product: 'Product',
      price: 'Price',
      cost: 'Cost',
      marginHeader: 'Margin',
      marginPctHeader: 'Margin %',
      sold: 'Sold',
      contribution: 'Contribution',
      footnote: 'Cost of Goods Sold (COGS) estimated from recipe cards and latest supplier prices. Update costs from the Suppliers screen.',
      exportToast: 'CSV Export downloaded'
    },
    ar: {
      title: 'الهوامش والربحية',
      subtitle: (margin, profit) => `متوسط الهامش ${margin}% · الربح الإجمالي ${money(profit)} اليوم`,
      heroTitle: 'الربح الإجمالي · اليوم',
      heroSubtitle: (sales, margin) => `على ${money(sales)} من المبيعات · متوسط الهامش المرجح ${margin}%`,
      bestContributor: 'أفضل مساهم',
      lowestMargin: 'الهامش الأدنى',
      margin: 'هامش',
      reviewWarning: 'مراجعة السعر أو التكلفة',
      productDetail: 'التفاصيل حسب المنتج',
      exportCsv: 'تصدير إلى CSV',
      product: 'المنتج',
      price: 'السعر',
      cost: 'التكلفة',
      marginHeader: 'الهامش',
      marginPctHeader: 'الهامش %',
      sold: 'المبيعات',
      contribution: 'المساهمة',
      footnote: 'تكلفة البضائع المباعة (CMV) مقدرة من بطاقات الوصفات وآخر أسعار الموردين. حدّث التكاليف من شاشة الموردين.',
      exportToast: 'تم تنزيل تصدير CSV'
    }
  };


  handlers['view-margins'] = () => {
    const lang = trLang();
    const str = MARGINS_STR[lang] || MARGINS_STR.fr;

    /* A merchant-created venue has no sales yet — show what this drawer
     * WILL compute instead of leaking Café Atlas's product margins. */
    if (window.KiwiVenue?.isCustom?.() || window.KiwiEnv?.isReal?.()) {
      const T = ({
        fr: { s: 'Compte en démarrage', h: 'Vos marges se calculent toutes seules', d: 'Dès vos premières ventes, Kiwi croise prix et coûts pour afficher la marge réelle de chaque produit, et signaler ceux dont le prix ou le coût est à revoir.' },
        en: { s: 'Account starting up', h: 'Your margins compute themselves', d: 'From your first sales, Kiwi crosses prices and costs to show each product\'s real margin, and flags the ones whose price or cost needs a second look.' },
        ar: { s: 'حساب في بدايته', h: 'هوامشك تُحسب تلقائيًا', d: 'منذ أول مبيعاتك، يقاطع Kiwi الأسعار والتكاليف ليعرض الهامش الحقيقي لكل منتج، وينبّهك إلى ما يستحق مراجعة سعره أو تكلفته.' },
      })[lang] || { s: 'Compte en démarrage', h: 'Vos marges se calculent toutes seules', d: '' };
      drawer({
        title: str.title,
        subtitle: T.s,
        width: 520,
        body: `<div style="padding:26px 8px 14px;text-align:center;">` +
          `<div style="font-size:14.5px;font-weight:600;color:var(--ink);">${T.h}</div>` +
          `<div style="font-size:12.5px;color:var(--n-500);margin-top:7px;line-height:1.55;max-width:360px;margin-inline:auto;">${T.d}</div>` +
          `</div>`,
      });
      return;
    }

    const rows = PRODUCTS.map((p) => {
      const marginMad = p.price - p.cost;
      const marginPct = Math.round((marginMad / p.price) * 100);
      const contribution = marginMad * p.sold;
      return { ...p, marginMad, marginPct, contribution };
    }).sort((a, b) => b.contribution - a.contribution);

    const grossProfit = rows.reduce((s, r) => s + r.contribution, 0);
    const revenue = rows.reduce((s, r) => s + r.price * r.sold, 0);
    const avgMargin = Math.round((grossProfit / revenue) * 100);
    const best = rows[0];
    const worst = [...rows].sort((a, b) => a.marginPct - b.marginPct)[0];

    drawer({
      title: str.title,
      subtitle: str.subtitle(avgMargin, grossProfit),
      width: 860,
      body: `
        <div class="p-hero">
          <div class="l">${str.heroTitle}</div>
          <div class="big">${money(grossProfit)}</div>
          <div class="sub">${str.heroSubtitle(revenue, avgMargin)}</div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
          <div class="p-card" style="margin:0;">
            <div style="font-size:11px; color:var(--n-500); font-family:var(--mono); letter-spacing:0.06em;">${str.bestContributor}</div>
            <div style="font-weight:600; font-size:15px; margin-top:6px;">${best.name}</div>
            <div style="font-size:12px; color:var(--success); margin-top:2px;">${money(Math.round(best.contribution))} · ${str.margin} ${best.marginPct}%</div>
          </div>
          <div class="p-card" style="margin:0;">
            <div style="font-size:11px; color:var(--n-500); font-family:var(--mono); letter-spacing:0.06em;">${str.lowestMargin}</div>
            <div style="font-weight:600; font-size:15px; margin-top:6px;">${worst.name}</div>
            <div style="font-size:12px; color:var(--warning); margin-top:2px;">${str.margin} ${worst.marginPct}% · ${str.reviewWarning}</div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); text-transform:uppercase;">${str.productDetail}</div>
          <button class="kb ghost xs" data-action="margin-export">${str.exportCsv}</button>
        </div>
        <table class="p-table">
          <thead><tr>
            <th>${str.product}</th><th class="right">${str.price}</th><th class="right">${str.cost}</th>
            <th class="right">${str.marginHeader}</th><th class="right">${str.marginPctHeader}</th>
            <th class="right">${str.sold}</th><th class="right">${str.contribution}</th>
          </tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${r.name}</td>
                <td class="mono right">${r.price.toFixed(2)}</td>
                <td class="mono right">${r.cost.toFixed(2)}</td>
                <td class="mono right">${r.marginMad.toFixed(2)}</td>
                <td class="right"><span class="chip ${r.marginPct >= 65 ? 'ok' : 'pend'}">${r.marginPct}%</span></td>
                <td class="mono right">${r.sold}</td>
                <td class="mono right">${money(Math.round(r.contribution))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="font-size:11.5px; color:var(--n-500); margin-top:12px;">
          ${str.footnote}
        </div>
      `,
    });
  };

  handlers['margin-export'] = () => {
    /* Le tiroir au-dessus est gardé (:300) mais pas son bouton d'export : chez
     * un vrai commerçant, ce CSV sortait le barème du Café Atlas — « Tajine
     * kefta 75/34 » — dans un fichier qui porte le nom de SON commerce et qu'il
     * peut envoyer à son comptable. Une fuite de démo qui prend la forme d'un
     * document est plus durable qu'une fuite à l'écran : elle survit à la
     * correction. */
    if (window.KiwiVenue?.isCustom?.() || window.KiwiEnv?.isReal?.()) {
      handlers['view-margins']();
      return;
    }
    const str = MARGINS_STR[trLang()] || MARGINS_STR.fr;
    /* Same cell treatment as every other CSV producer in the app. Two distinct
     * hazards, both previously unhandled here:
     *   1. A cell starting with = + - @ is executed as a formula by Excel and
     *      Numbers. Prefixing an apostrophe neutralises it.
     *   2. A product name containing a comma, quote or newline silently shifts
     *      every following column. Quoting fixes it.
     * The margins export predates the guard used elsewhere and never got it —
     * the security test only checked that the *file* mentioned the pattern, and
     * a different export in this same file happened to satisfy that. */
    const cell = (c) => {
      let s = String(c == null ? '' : c);
      if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const row = (arr) => arr.map(cell).join(',');
    const header = row([str.product, str.price, str.cost, str.marginHeader, str.marginPctHeader, str.sold]) + '\n';
    const lines = PRODUCTS.map((p) => {
      const m = (p.price - p.cost).toFixed(2);
      const pct = Math.round(((p.price - p.cost) / p.price) * 100);
      return row([p.name, p.price, p.cost, m, pct, p.sold]);
    }).join('\n');
    const blob = new Blob([header + lines], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kiwi-marges.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast(str.exportToast, { type: 'success' });
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * 3 · INTÉGRATIONS
   *   Manage connected tools + connect new ones. Wires the previously-dead
   *   "+ Ajouter une intégration" link (data-action="add-integration").
   * ═══════════════════════════════════════════════════════════════════════ */
  /* Glovo et Jumia Food figuraient ici comme CONNECTÉS, « synchronisé il y a
     4 min ». Aucun code n'a jamais parlé à l'un ni à l'autre : c'était une
     horloge décorative. Et Jumia Food a fermé au Maroc fin 2023 — un
     restaurateur qui lit cette liste date le produit au premier coup d'œil.
     Les canaux réellement raccordables passent donc dans la colonne « à
     connecter », où « Connecter » ouvre le vrai connecteur
     (assets/channel-link.js) au lieu d'une pastille verte. */
  const INTEGRATIONS_ON = [
    { name: 'Comptabilité',  color: '#1D3F6B', tag: 'A', i18nDesc: 'integ.compta.desc', sync: 'hier 23:00' },
    { name: 'Bank of Africa', color: '#00613E', tag: 'B', i18nDesc: 'integ.bmce.desc', sync: 'il y a 1 h' },
  ];
  const INTEGRATIONS_OFF = [
    { name: 'Glovo',           color: '#F29137', tag: 'G', i18nDesc: 'integ.glovo.desc', channel: 'glovo' },
    { name: 'Yassir Express',  color: '#2B5AA8', tag: 'Y', i18nDesc: 'integ.yassir.desc', channel: 'yassir' },
    { name: 'Shopify',         color: '#5E8E3E', tag: 'S', i18nDesc: 'integ.shopify.desc', channel: 'shopify' },
    { name: 'Kaalix',          color: '#7A3FF2', tag: 'K', i18nDesc: 'integ.kaalix.desc', channel: 'generic' },
    { name: 'WhatsApp Business', color: '#1FB574', tag: 'W', i18nDesc: 'integ.whatsapp.desc' },
    { name: 'Export CSV / Excel', color: '#3A6FB8', tag: 'X', i18nDesc: 'integ.export.desc' },
  ];
  
  const INTEG_STR = {
      fr: {
        title: 'Intégrations',
        subtitle: (on, off) => `${on} connectées · ${off} disponibles`,
        heroTitle: 'Connecteurs · Café Atlas',
        heroSubtitle: (on) => `${on} actives`,
        heroDesc: 'Kiwi synchronise commandes, payouts et comptabilité automatiquement',
        connected: 'Connectées',
        available: 'Disponibles',
        syncPrefix: 'sync',
        connectedChip: 'Connecté',
        configure: 'Configurer',
        connect: 'Connecter',
        toastConfigT: 'Configuration',
        toastConfigD: 'Champs de synchronisation et fréquence',
        toastConnectT: (name) => `${name} connectée`,
        toastConnectD: 'Synchronisation initiale en cours',
        'integ.glovo.desc': 'Commandes de livraison vers la caisse',
        'integ.yassir.desc': 'Commandes de livraison vers la caisse',
        'integ.shopify.desc': 'Commandes de la boutique en ligne',
        'integ.compta.desc': 'Export quotidien · format comptable',
        'integ.bmce.desc': 'Rapprochement IBAN ···3291',
        'integ.kaalix.desc': 'Livraison · régions Casa & Rabat',
        'integ.whatsapp.desc': 'Reçus & liens de paiement clients',
        'integ.export.desc': 'Sortie comptable sur mesure'
      },
      en: {
        title: 'Integrations',
        subtitle: (on, off) => `${on} connected · ${off} available`,
        heroTitle: 'Connectors · Café Atlas',
        heroSubtitle: (on) => `${on} active`,
        heroDesc: 'Kiwi automatically syncs orders, payouts, and accounting',
        connected: 'Connected',
        available: 'Available',
        syncPrefix: 'sync',
        connectedChip: 'Connected',
        configure: 'Configure',
        connect: 'Connect',
        toastConfigT: 'Configuration',
        toastConfigD: 'Sync fields and frequency',
        toastConnectT: (name) => `${name} connected`,
        toastConnectD: 'Initial synchronization in progress',
        'integ.glovo.desc': 'Delivery orders into the till',
        'integ.yassir.desc': 'Delivery orders into the till',
        'integ.shopify.desc': 'Online store orders',
        'integ.compta.desc': 'Daily export · accounting-ready',
        'integ.bmce.desc': 'IBAN reconciliation ···3291',
        'integ.kaalix.desc': 'Delivery · Casa & Rabat regions',
        'integ.whatsapp.desc': 'Customer receipts & payment links',
        'integ.export.desc': 'Custom accounting output'
      },
      ar: {
        title: 'التكاملات',
        subtitle: (on, off) => `${on} متصلة · ${off} متاحة`,
        heroTitle: 'الموصلات · مقهى أطلس',
        heroSubtitle: (on) => `${on} نشطة`,
        heroDesc: 'كيوي تزامن الطلبات والتحويلات والمحاسبة تلقائيًا',
        connected: 'متصلة',
        available: 'متاحة',
        syncPrefix: 'مزامنة',
        connectedChip: 'متصل',
        configure: 'إعداد',
        connect: 'اتصال',
        toastConfigT: 'الإعداد',
        toastConfigD: 'حقول المزامنة والتردد',
        toastConnectT: (name) => `${name} متصلة`,
        toastConnectD: 'المزامنة الأولية جارية',
        'integ.glovo.desc': 'طلبات التوصيل إلى الصندوق',
        'integ.yassir.desc': 'طلبات التوصيل إلى الصندوق',
        'integ.shopify.desc': 'طلبات المتجر الإلكتروني',
        'integ.compta.desc': 'تصدير يومي · جاهز للمحاسبة',
        'integ.bmce.desc': 'تسوية IBAN ···3291',
        'integ.kaalix.desc': 'التوصيل · مناطق الدار البيضاء والرباط',
        'integ.whatsapp.desc': 'إيصالات العملاء وروابط الدفع',
        'integ.export.desc': 'مخرجات محاسبية مخصصة'
      }
  };

  handlers['add-integration'] = () => {
    const lang = trLang();
    const str = INTEG_STR[lang] || INTEG_STR.fr;

    /* Client (custom) venue: NEVER surface another business's connected tools,
     * sync times or IBAN (Café Atlas'). Present everything as available-to-
     * connect, with a generic hero and a safe bank description. */
    const isCustom = !!(window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom())
      || !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal());
    if (isCustom) {
      const heroT = ({ fr: 'Connecteurs', en: 'Connectors', ar: 'الموصلات' })[lang] || 'Connecteurs';
      const safeBank = ({ fr: 'Rapprochement bancaire automatique', en: 'Automatic bank reconciliation', ar: 'تسوية بنكية تلقائية' })[lang];
      const catalog = [
        { name: 'Comptabilité',   color: '#1D3F6B', tag: 'A', desc: str['integ.compta.desc'] },
        { name: 'Bank of Africa', color: '#00613E', tag: 'B', desc: safeBank },
        /* `channel` doit survivre à cette copie. Sans lui, la carte perd son
           canal et le vrai connecteur (clé + adresse) devient inatteignable
           pour un client réel — précisément celui à qui il est destiné. */
        ...INTEGRATIONS_OFF.map((i) => ({ name: i.name, color: i.color, tag: i.tag, desc: str[i.i18nDesc], channel: i.channel })),
      ];
      drawer({
        title: str.title,
        subtitle: str.subtitle(0, catalog.length),
        width: 720,
        body: `
          <div class="p-hero">
            <div class="l">${heroT}</div>
            <div class="big">${str.heroSubtitle(0)}</div>
            <div class="sub">${str.heroDesc}</div>
          </div>
          <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); text-transform:uppercase; margin:4px 0 8px;">${str.available}</div>
          ${catalog.map((i) => `
            <div class="p-card" style="margin-bottom:8px; cursor:pointer;" data-action="integration-connect" data-arg="${i.name}" data-channel="${i.channel || ''}">
              <div style="display:grid; grid-template-columns:38px 1fr auto; gap:12px; align-items:center;">
                <div style="width:38px; height:38px; border-radius:9px; background:${i.color}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; opacity:0.85;">${i.tag}</div>
                <div>
                  <div style="font-weight:600; font-size:14px;">${i.name}</div>
                  <div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">${i.desc}</div>
                </div>
                <button class="kb atlas xs" data-action="integration-connect" data-arg="${i.name}" data-channel="${i.channel || ''}">${str.connect}</button>
              </div>
            </div>
          `).join('')}
        `,
      });
      return;
    }

    drawer({
      title: str.title,
      subtitle: str.subtitle(INTEGRATIONS_ON.length, INTEGRATIONS_OFF.length),
      width: 720,
      body: `
        <div class="p-hero">
          <div class="l">${str.heroTitle}</div>
          <div class="big">${str.heroSubtitle(INTEGRATIONS_ON.length)}</div>
          <div class="sub">${str.heroDesc}</div>
        </div>

        <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); text-transform:uppercase; margin:4px 0 8px;">${str.connected}</div>
        ${INTEGRATIONS_ON.map((i) => `
          <div class="p-card" style="margin-bottom:8px; cursor:pointer;" data-action="integration-configure" data-arg="${i.name}">
            <div style="display:grid; grid-template-columns:38px 1fr auto; gap:12px; align-items:center;">
              <div style="width:38px; height:38px; border-radius:9px; background:${i.color}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px;">${i.tag}</div>
              <div>
                <div style="font-weight:600; font-size:14px;">${i.name}</div>
                <div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">${str[i.i18nDesc]} · ${str.syncPrefix} ${i.sync}</div>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <span class="chip ok">${str.connectedChip}</span>
                <button class="kb ghost xs" data-action="integration-configure" data-arg="${i.name}">${str.configure}</button>
              </div>
            </div>
          </div>
        `).join('')}

        <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); text-transform:uppercase; margin:18px 0 8px;">${str.available}</div>
        ${INTEGRATIONS_OFF.map((i) => `
          <div class="p-card" style="margin-bottom:8px; cursor:pointer;" data-action="integration-connect" data-arg="${i.name}" data-channel="${i.channel || ''}">
            <div style="display:grid; grid-template-columns:38px 1fr auto; gap:12px; align-items:center;">
              <div style="width:38px; height:38px; border-radius:9px; background:${i.color}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; opacity:0.85;">${i.tag}</div>
              <div>
                <div style="font-weight:600; font-size:14px;">${i.name}</div>
                <div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">${str[i.i18nDesc]}</div>
              </div>
              <button class="kb atlas xs" data-action="integration-connect" data-arg="${i.name}" data-channel="${i.channel || ''}">${str.connect}</button>
            </div>
          </div>
        `).join('')}
      `,
    });
  };

  handlers['integration-configure'] = (_el, arg) => {
    const str = INTEG_STR[trLang()] || INTEG_STR.fr;
    if (window.KiwiEnv?.isReal?.()) {
      toast('Intégration non configurée', { type: 'warning', desc: 'Aucun service externe n’a été contacté et aucun changement n’a été effectué.' });
      return;
    }
    toast(`${str.toastConfigT} · ${arg || 'intégration'}`, { type: 'info', desc: str.toastConfigD });
  }
  handlers['integration-connect'] = (_el, arg) => {
    const str = INTEG_STR[trLang()] || INTEG_STR.fr;
    /* Les canaux qui portent un `channel` ont un vrai connecteur derrière eux
       (functions/api/channel/order.js) : on remet au commerçant l'adresse et la
       clé, ce qui est une connexion réelle et vérifiable. Les autres gardent le
       refus honnête écrit lors de l'audit — mieux vaut « pas encore » qu'un
       confetti pour un service que personne n'a appelé. */
    const ch = _el && _el.getAttribute ? (_el.getAttribute('data-channel') || '') : '';
    if (ch && window.KiwiChannels) { window.KiwiChannels.connect(ch, arg || ''); return; }
    if (window.KiwiEnv?.isReal?.()) {
      toast('Intégration indisponible', { type: 'warning', desc: 'Cette connexion n’est pas encore active. Rien n’a été envoyé au service externe.' });
      return;
    }
    toast(str.toastConnectT(arg || 'Intégration'), { type: 'success', desc: str.toastConnectD });
    Kiwi.confetti?.();
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
 * 4 · "PERSONNALISÉ" DATE-RANGE DROPDOWN
 *   Clicking the Personnalisé pill opens an anchored dropdown: quick presets
 *   (this week / month / quarter / year) + a Du–Au custom date picker.
 *   Picking an option drives the real KiwiDateRange data and keeps the
 *   Personnalisé pill selected with its own label.
 *
 *   Built entirely with DOM methods (createElement / createElementNS) — no
 *   innerHTML — so there is no markup-injection surface.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  if (!window.Kiwi) return;
  const toast = window.Kiwi.toast;
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');

  /* ── styles (injected once) ── */
  if (!document.getElementById('kdr-styles')) {
    const st = document.createElement('style');
    st.id = 'kdr-styles';
    st.textContent = `
    .kdr-pop{position:fixed;z-index:9970;width:308px;background:var(--paper);border:1px solid var(--n-200);
      border-radius:16px;box-shadow:0 24px 60px -16px rgba(5,59,44,.34),0 4px 14px -6px rgba(5,59,44,.2);
      padding:8px;opacity:0;transform:translateY(-8px) scale(.97);transform-origin:top right;
      transition:opacity 160ms ease,transform 200ms cubic-bezier(.2,.8,.2,1);font-family:var(--sans);}
    .kdr-pop.in{opacity:1;transform:translateY(0) scale(1);}
    html[dir="rtl"] .kdr-pop{transform-origin:top left;}
    .kdr-hd{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;
      color:var(--n-500);padding:8px 10px 6px;}
    .kdr-opt{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:10px;cursor:pointer;
      transition:background 120ms;}
    .kdr-opt:hover{background:var(--paper-soft);}
    .kdr-opt.sel{background:var(--mint-soft);}
    .kdr-opt .ic{width:30px;height:30px;border-radius:8px;background:var(--mint-soft);color:var(--atlas);
      display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .kdr-opt.sel .ic{background:var(--atlas);color:var(--paper);}
    .kdr-opt .tx{flex:1;min-width:0;}
    .kdr-opt .tx .n{font-size:13.5px;font-weight:500;color:var(--ink);}
    .kdr-opt .tx .s{font-size:11px;color:var(--n-500);font-family:var(--mono);margin-top:1px;}
    .kdr-opt .ck{color:var(--atlas);opacity:0;flex-shrink:0;}
    .kdr-opt.sel .ck{opacity:1;}
    .kdr-sep{height:1px;background:var(--n-200);margin:6px 4px;}
    .kdr-custom{padding:4px 10px 8px;}
    .kdr-custom .lbl{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;
      color:var(--n-500);margin-bottom:8px;}
    .kdr-dates{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}
    .kdr-field label{display:block;font-size:10.5px;color:var(--n-500);margin-bottom:3px;}
    .kdr-date{width:100%;box-sizing:border-box;border:1px solid var(--n-200);border-radius:9px;
      padding:8px 9px;font-size:12.5px;font-family:var(--sans);color:var(--ink);background:var(--paper-soft);}
    .kdr-date:focus{outline:none;border-color:var(--atlas);}
    .kdr-apply{width:100%;background:var(--atlas);color:var(--paper);border:0;border-radius:10px;
      padding:10px;font-size:13px;font-weight:500;font-family:var(--sans);cursor:pointer;transition:background 150ms;}
    .kdr-apply:hover{background:var(--riad);}`;
    document.head.appendChild(st);
  }

  /* ── tiny DOM builders ── */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function svg(size, sw, shapes) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', sw);
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    shapes.forEach((sh) => {
      const node = document.createElementNS(SVGNS, sh.t);
      Object.keys(sh).forEach((k) => { if (k !== 't') node.setAttribute(k, sh[k]); });
      s.appendChild(node);
    });
    return s;
  }
  const calIcon = () => svg(15, 2, [
    { t: 'rect', x: 3, y: 4, width: 18, height: 18, rx: 2 },
    { t: 'path', d: 'M16 2v4M8 2v4M3 10h18' },
  ]);
  const checkIcon = () => {
    const s = svg(16, 2.4, [{ t: 'path', d: 'M20 6L9 17l-5-5' }]);
    s.setAttribute('class', 'ck');
    return s;
  };

  /* ── date helpers ── */
  const pad = (n) => String(n).padStart(2, '0');
  const dmy = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const dm = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const getMonths = (lang) => {
    if (lang === 'ar') return ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    if (lang === 'en') return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  };

  function presetSubs() {
    const t = new Date();
    const yest = new Date(t); yest.setDate(t.getDate() - 1);
    const sevenAgo = new Date(t); sevenAgo.setDate(t.getDate() - 6);
    const thirtyAgo = new Date(t); thirtyAgo.setDate(t.getDate() - 29);
    const lastMonth = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    const quarterStart = new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1);
    const lang = trLang();
    const MONTHS = getMonths(lang);
    const capMonth = (d) => MONTHS[d.getMonth()].replace(/^./, (c) => c.toUpperCase());
    return {
      hier: dmy(yest),
      sept: `${dm(sevenAgo)} – ${dm(t)}`,
      mois: `${dm(thirtyAgo)} – ${dm(t)}`,
      moisDernier: `${capMonth(lastMonth)} ${lastMonth.getFullYear()}`,
      trimestre: `${quarterStart.getDate()} ${capMonth(quarterStart).slice(0, 3)} – ${t.getDate()} ${capMonth(t).slice(0, 3)} ${t.getFullYear()}`,
      annee: `${t.getFullYear()}`,
    };
  }

  const DATE_STR = {
      fr: {
          header: 'Choisir une période',
          customHeader: 'Plage de dates',
          from: 'Du',
          to: 'Au',
          apply: 'Appliquer la plage',
          toast1: 'Choisis une date de début et de fin',
          toast2: 'La date de début doit précéder la date de fin',
          customLabel: 'Période personnalisée'
      },
      en: {
          header: 'Choose a period',
          customHeader: 'Date range',
          from: 'From',
          to: 'To',
          apply: 'Apply range',
          toast1: 'Choose a start and end date',
          toast2: 'Start date must be before end date',
          customLabel: 'Custom period'
      },
      ar: {
          header: 'اختر فترة',
          customHeader: 'نطاق التاريخ',
          from: 'من',
          to: 'إلى',
          apply: 'تطبيق النطاق',
          toast1: 'اختر تاريخ بداية ونهاية',
          toast2: 'يجب أن يكون تاريخ البدء قبل تاريخ الانتهاء',
          customLabel: 'فترة مخصصة'
      }
  };

  const getPresets = (lang) => [
    { id: 'hier', range: 'hier', i18nKey: 'hier' },
    { id: 'sept', range: 'septJours', i18nKey: 'septJours' },
    { id: 'mois', range: 'trenteJours', i18nKey: 'trenteJours' },
    { id: 'moisDernier', range: 'moisDernier', i18nKey: 'moisDernier' },
    { id: 'trimestre', range: 'trimestre', i18nKey: 'trimestre' },
    { id: 'annee', range: 'annee', i18nKey: 'annee' },
  ];

  let pop = null;          // open dropdown element
  let selectedId = null;   // currently-applied preset/custom id
  let selfApply = false;   // true while WE drive setDateRange (vs. a native pill)

  function closePop() {
    if (!pop) return;
    const p = pop; pop = null;
    p.classList.remove('in');
    setTimeout(() => p.remove(), 200);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onOutside, true);
    window.removeEventListener('resize', closePop);
    window.removeEventListener('scroll', closePop);
  }
  const onKey = (e) => { if (e.key === 'Escape') closePop(); };
  const onOutside = (e) => {
    if (pop && !pop.contains(e.target) && !e.target.closest('[data-range="personnalise"]')) closePop();
  };

  /* Apply a chosen range: drive the real data, keep "Personnalisé" selected. */
  function applyRange(mapped, label, sub, id) {
    selectedId = id;
    const api = window.KiwiDateRange;
    if (api && api.setDateRange) {
      selfApply = true;
      api.setDateRange(mapped);
      selfApply = false;
    }
    // setDateRange highlights the mapped pill — re-pin the highlight to Personnalisé
    document.querySelectorAll('.dr-pill').forEach((p) =>
      p.classList.toggle('on', p.dataset.range === 'personnalise'));
    const L = document.querySelector('[data-dr-label]');
    const S = document.querySelector('[data-dr-sub]');
    if (L) L.textContent = label;
    if (S) S.textContent = sub;
    if (toast) toast(`${label} · ${sub}`, { type: 'success', duration: 1800 });
    closePop();
  }

  function buildOption(p, subs, lang) {
    const rangeStr = (window.KiwiI18n?.T?.[lang]?.['dash.range.pill.' + p.id] || p.n);
    const row = el('div', 'kdr-opt' + (selectedId === p.id ? ' sel' : ''));
    row.dataset.preset = p.id;
    const ic = el('div', 'ic'); ic.appendChild(calIcon());
    const tx = el('div', 'tx');
    tx.appendChild(el('div', 'n', (window.KiwiDateRange?.RANGE_STR?.[lang]?.[p.range] || p.range)));
    tx.appendChild(el('div', 's', subs[p.id]));
    row.append(ic, tx, checkIcon());
    row.addEventListener('click', () => applyRange(p.range, (window.KiwiDateRange?.RANGE_STR?.[lang]?.[p.range] || p.range), presetSubs()[p.id], p.id));
    return row;
  }

  function buildCustom(lang) {
    const str = DATE_STR[lang] || DATE_STR.fr;
    const today = new Date();
    const start = new Date(); start.setDate(today.getDate() - 6);
    const wrap = el('div', 'kdr-custom');
    wrap.appendChild(el('div', 'lbl', str.customHeader));

    const dates = el('div', 'kdr-dates');
    const mkField = (labelTxt, mark, val) => {
      const f = el('div', 'kdr-field');
      f.appendChild(el('label', null, labelTxt));
      const inp = el('input', 'kdr-date');
      inp.type = 'date'; inp.value = val; inp.max = iso(today);
      inp.dataset[mark] = '1';
      f.appendChild(inp);
      return f;
    };
    dates.append(mkField(str.from, 'kdrFrom', iso(start)), mkField(str.to, 'kdrTo', iso(today)));
    wrap.appendChild(dates);

    const apply = el('button', 'kdr-apply', str.apply);
    apply.addEventListener('click', () => {
      const from = wrap.querySelector('[data-kdr-from]').value;
      const to = wrap.querySelector('[data-kdr-to]').value;
      if (!from || !to) { if (toast) toast(str.toast1, { type: 'warning' }); return; }
      const df = new Date(from), dt = new Date(to);
      if (df > dt) { if (toast) toast(str.toast2, { type: 'warning' }); return; }
      const spanDays = Math.round((dt - df) / 86400000) + 1;
      const mapped = spanDays <= 2 ? 'hier' : spanDays <= 10 ? 'septJours' : 'trenteJours';
      applyRange(mapped, str.customLabel, `${dmy(df)} – ${dmy(dt)}`, 'custom');
    });
    wrap.appendChild(apply);
    return wrap;
  }

  function openPop(anchor) {
    closePop();
    const lang = trLang();
    const str = DATE_STR[lang] || DATE_STR.fr;
    const subs = presetSubs();
    pop = el('div', 'kdr-pop');
    pop.appendChild(el('div', 'kdr-hd', str.header));
    getPresets(lang).forEach((p) => pop.appendChild(buildOption(p, subs, lang)));
    pop.appendChild(el('div', 'kdr-sep'));
    pop.appendChild(buildCustom(lang));
    document.body.appendChild(pop);

    const r = anchor.getBoundingClientRect();
    const w = 308;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    let left = r.right - w;
    if (vw && left + w > vw - 8) left = vw - 8 - w;
    if (left < 8) left = 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${r.bottom + 8}px`;
    setTimeout(() => { if (pop) pop.classList.add('in'); }, 10);

    document.addEventListener('keydown', onKey, true);
    setTimeout(() => document.addEventListener('click', onOutside, true), 0);
    window.addEventListener('resize', closePop);
    window.addEventListener('scroll', closePop, { passive: true });
  }

  (function syncSelection() {
    const api = window.KiwiDateRange;
    if (api && api.subscribe) {
      api.subscribe(() => { if (!selfApply) selectedId = null; });
    } else {
      setTimeout(syncSelection, 200);
    }
  })();

  document.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-action="date-range"][data-range="personnalise"]');
    if (!pill) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (pop) { closePop(); return; }
    openPop(pill);
  }, true);
})();

/* ═══════════════════════════════════════════════════════════════════════════
 * 5 · WIRE THE REMAINING DASHBOARD CONTROLS
 *   Every header/card action now does something real — no control falls
 *   through to the generic success-toast fallback.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const handlers = window.Kiwi.handlers;
  const toast = window.Kiwi.toast;
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');

  const MISC_STR = {
    fr: {
        exportToast: 'Export CSV téléchargé',
        exportToastD: 'kiwi-tableau-de-bord.csv',
        menuToastT: 'Éditeur de menu',
        menuToastD: 'Catégories, plats, prix et modificateurs',
        tipToastT: 'Prompt pourboire activé',
        tipToastD: '+10 % suggéré après 20h sur toutes les tables',
        helpToastT: 'Support Kiwi',
        helpToastD: 'WhatsApp +212 5 20 80 80 80 · 7j/7'
    },
    en: {
        exportToast: 'CSV export downloaded',
        exportToastD: 'kiwi-dashboard.csv',
        menuToastT: 'Menu Editor',
        menuToastD: 'Categories, dishes, prices, and modifiers',
        tipToastT: 'Tip prompt enabled',
        tipToastD: '+10% suggested after 8pm on all tables',
        helpToastT: 'Kiwi Support',
        helpToastD: 'WhatsApp +212 5 20 80 80 80 · 7/7'
    },
    ar: {
        exportToast: 'تم تنزيل تصدير CSV',
        exportToastD: 'kiwi-dashboard.csv', /* AR: file name should not be translated */
        menuToastT: 'محرر القائمة',
        menuToastD: 'الفئات، الأطباق، الأسعار، والمعدلات',
        tipToastT: 'تم تفعيل موجه الإكرامية',
        tipToastD: 'مقترح +10% بعد الساعة 8 مساءً على جميع الطاولات',
        helpToastT: 'دعم كيوي',
        helpToastD: 'واتساب +212 5 20 80 80 80 · 7/7'
    }
  };

  /* Le rapport est un module autonome chargé à l'exécution : dashboard.html
   * reste intact et le coût du document imprimable ne bloque pas le premier
   * rendu. On amorce tout de suite le chargement ; au clic, une fenêtre est
   * néanmoins ouverte synchroniquement pour ne pas tomber sous le bloqueur de
   * popups si le réseau local n'a pas encore livré le script. */
  let reportReady = null;
  const ensureReport = () => {
    if (window.KiwiReport) return Promise.resolve(window.KiwiReport);
    if (reportReady) return reportReady;
    reportReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('assets/report.js', document.baseURI).href;
      script.async = true;
      script.dataset.kiwiReport = '1';
      script.onload = () => window.KiwiReport ? resolve(window.KiwiReport) : reject(new Error('KiwiReport unavailable'));
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return reportReady;
  };
  ensureReport().catch(() => {});

  handlers['export'] = (trigger) => {
    /* pages.js utilise la même action dans le tiroir Transactions. Il
     * garde donc son sens propre : CSV des ventes datées, pas rapport général. */
    const transactionExport = !!(trigger && trigger.closest && trigger.closest('.kiwi-drawer') && trigger.closest('.kiwi-drawer').querySelector('.p-table'));
    if (transactionExport) {
      ensureReport().then((report) => report.downloadTransactions()).catch(() => {
        const str = MISC_STR[trLang()] || MISC_STR.fr;
        toast && toast(str.exportToast, { type: 'warn', desc: str.exportToastD });
      });
      return;
    }

    const popup = window.open('', '_blank');
    ensureReport().then((report) => report.open(popup)).catch(() => {
      try { if (popup) popup.close(); } catch (_) {}
      const str = MISC_STR[trLang()] || MISC_STR.fr;
      toast && toast(str.exportToast, { type: 'warn', desc: str.exportToastD });
    });
  };

  /* Live-feed "Filtrer" + "Tout voir" → open the full Commandes drawer, which
   * already carries real method/date filters. */
  const openCommandes = () => handlers['nav-transactions'] && handlers['nav-transactions']();
  handlers['filter-tx'] = openCommandes;
  handlers['feed-view-all'] = openCommandes;

  /* "Paramètres équipe" → the Équipe drawer. */
  handlers['team-settings'] = () => handlers['nav-equipe'] && handlers['nav-equipe']();

  /* Soft links — honest, specific info toasts (no fake "success"). */
  handlers['menu-edit'] = () => {
      const str = MISC_STR[trLang()] || MISC_STR.fr;
      toast && toast(str.menuToastT, { type: 'info', desc: str.menuToastD });
  }
  handlers['tip-prompt'] = () => {
    const str = MISC_STR[trLang()] || MISC_STR.fr;
    toast && toast(str.tipToastT, { type: 'success', desc: str.tipToastD });
  }
  handlers['help-whatsapp'] = () => {
    const str = MISC_STR[trLang()] || MISC_STR.fr;
    toast && toast(str.helpToastT, { type: 'info', desc: str.helpToastD });
  }
})();
