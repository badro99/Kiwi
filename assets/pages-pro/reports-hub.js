/* Rapports · le hub. Une page, un sélecteur de période et d'établissement
 * partagés, et chaque rapport à un clic :
 *   Résumé · Produits · Rayons · Équipe · Encaissements · Rythme (jour × heure)
 *   · Canaux · TVA · Clients · Établissements (quand le compte en a plusieurs)
 * plus les rapports qui existaient déjà : le Z du jour (Rapport journalier),
 * le rapport de période imprimable et le dossier du mois du comptable.
 *
 * Les chiffres viennent de /api/reports (functions/api/reports.js), calculés
 * dans D1 sur la période entière : rien n'est recompté ici, et rien ne dépend
 * de ce que ce navigateur a gardé en mémoire. Chaque rapport s'ouvre sur une
 * phrase qui dit ce qui a changé. CSV (UTF-8 avec BOM, lisible par Excel en
 * arabe) et version imprimable / PDF pour chacun.
 *
 * La période est celle du tableau de bord (assets/dateRange.js) : la choisir
 * ici la choisit aussi pour l'accueil, et inversement. La vue multi-site est
 * la vraie : les ventes de chaque établissement du compte, côte à côte.
 *
 * La démo n'a pas de ventes sur le serveur : ses rapports viennent de
 * assets/pages-pro/reports-demo.js (mêmes formes, mêmes phrases, chiffres à
 * graine pour Café Atlas, Maison Mansour et Spa Bahia), et seulement quand
 * KiwiEnv dit que la session n'est pas réelle.
 *
 * Section paresseuse (assets/pages-pro.js › LAZY_SECTIONS) : chaque handler
 * listé là-bas est enregistré ici, ni plus ni moins. */
(() => {
  'use strict';
  if (!window.Kiwi) return;
  const { toast, handlers } = window.Kiwi;
  const V = () => window.KiwiReportViews;
  const L = (fr, en, ar) => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
  const lang = () => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' || l === 'ar' ? l : 'fr'; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const here = () => { try { return window.KiwiCloudDoc?.currentSlug?.() || ''; } catch (_) { return ''; } };
  const isReal = () => { try { return !!window.KiwiEnv?.isReal?.(); } catch (_) { return true; } };
  /* Démo : KiwiEnv chargé ET qui dit « pas réel ». Sans KiwiEnv, rien de fabriqué. */
  const demo = () => { try { return !!window.KiwiReportDemo && typeof window.KiwiEnv?.isReal === 'function' && !window.KiwiEnv.isReal(); } catch (_) { return false; } };
  const demoAnchor = () => {
    const v = (() => { try { return window.KiwiVenue?.getVenue?.() || ''; } catch (_) { return ''; } })();
    return window.KiwiReportDemo.SITES.some((s) => s.merchant === v) ? v : window.KiwiReportDemo.SITES[0].merchant;
  };
  const DR = () => window.KiwiDateRange || null;

  const REPORTS = [
    { id: 'summary', icon: 'bar_chart', t: () => L('Résumé', 'Summary', 'الملخص'), d: () => L('Brut, remises, remboursements, net, TVA, coût et marge', 'Gross, discounts, refunds, net, VAT, cost and margin', 'الإجمالي، التخفيضات، المرجوعات، الصافي، الضريبة، التكلفة والهامش') },
    { id: 'products', icon: 'inventory_2', t: () => L('Produits', 'Products', 'المنتجات'), d: () => L('Ce qui se vend, ce qui recule, la marge de chacun', 'What sells, what slips, each one’s margin', 'ما يُباع، ما يتراجع، وهامش كل منتج') },
    { id: 'categories', icon: 'category', t: () => L('Rayons', 'Categories', 'الأقسام'), d: () => L('Le poids de chaque rayon dans les ventes', 'Each category’s weight in sales', 'وزن كل قسم في المبيعات') },
    { id: 'staff', icon: 'groups', t: () => L('Équipe', 'Team', 'الفريق'), d: () => L('Ventes, panier, remises, remboursements, pourboires par vendeur', 'Sales, basket, discounts, refunds, tips per seller', 'المبيعات، السلة، التخفيضات، المرجوعات والبقشيش لكل بائع') },
    { id: 'payments', icon: 'payments', t: () => L('Encaissements', 'Payments', 'المداخيل'), d: () => L('Espèces, carte, virement… et les remboursements', 'Cash, card, transfer… and refunds', 'الأداء نقدا، بالبطاقة، التحويل… والمرجوعات') },
    { id: 'heatmap', icon: 'schedule', t: () => L('Rythme', 'Rhythm', 'الإيقاع'), d: () => L('Les heures et les jours qui comptent', 'The hours and days that matter', 'الساعات والأيام المهمة') },
    { id: 'channels', icon: 'storefront', t: () => L('Canaux', 'Channels', 'القنوات'), d: () => L('Sur place, à emporter, livraison, en ligne', 'Dine-in, takeaway, delivery, online', 'في المحل، للأخذ، التوصيل، عبر الإنترنت') },
    { id: 'vat', icon: 'percent', t: () => L('TVA', 'VAT', 'الضريبة'), d: () => L('HT, TVA et TTC par taux', 'Excl. VAT, VAT and total by rate', 'دون ضريبة، الضريبة والمجموع حسب النسبة') },
    { id: 'customers', icon: 'person', t: () => L('Clients', 'Customers', 'الزبناء'), d: () => L('Vos meilleurs clients et leur fidélité', 'Your best customers and their loyalty', 'أفضل زبنائك ووفاؤهم') },
    { id: 'sites', icon: 'apartment', t: () => L('Établissements', 'Locations', 'المؤسسات'), d: () => L('Chaque établissement côte à côte, le total, le meilleur', 'Each location side by side, the total, the best', 'كل مؤسسة جنب الأخرى، المجموع والأفضل') },
  ];
  const OTHERS = [
    { id: 'z', icon: 'receipt_long', t: () => L('Rapport journalier (Z)', 'Daily report (Z)', 'التقرير اليومي (Z)'), d: () => L('La journée refermée : caisse, produits, tiroir', 'The closed day: till, products, drawer', 'اليوم المغلق: الصندوق، المنتجات والدرج') },
    { id: 'period', icon: 'description', t: () => L('Rapport d’activité imprimable', 'Printable business report', 'تقرير النشاط للطباعة'), d: () => L('Le document de la période du tableau de bord', 'The dashboard period as a document', 'فترة لوحة القيادة كوثيقة') },
    { id: 'month', icon: 'calendar_month', t: () => L('Dossier du mois (comptable)', 'Month pack (accountant)', 'ملف الشهر (المحاسب)'), d: () => L('Ventes, TVA, Z et pièces, prêts pour le comptable', 'Sales, VAT, Z and documents, ready for the accountant', 'المبيعات، الضريبة، Z والوثائق جاهزة للمحاسب') },
  ];
  const PRESETS = [
    ['aujourdhui', () => L('Aujourd’hui', 'Today', 'اليوم')], ['hier', () => L('Hier', 'Yesterday', 'أمس')],
    ['septJours', () => L('7 jours', '7 days', '7 أيام')], ['trenteJours', () => L('30 jours', '30 days', '30 يوما')],
    ['moisDernier', () => L('Mois dernier', 'Last month', 'الشهر الماضي')], ['trimestre', () => L('Trimestre', 'Quarter', 'الربع')],
    ['annee', () => L('Année', 'Year', 'السنة')], ['personnalise', () => L('Dates…', 'Dates…', 'تواريخ…')],
  ];

  const state = { report: 'summary', preset: 'septJours', from: '', to: '', site: '', offset: 0, data: null, loading: false, error: '', seq: 0, sites: [] };

  /* La période du tableau de bord, reprise à l'ouverture. Une plage choisie
     sur l'accueil devient la même plage de journées ici. */
  function adoptDashboardRange() {
    const D = DR();
    const r = D?.getDateRange?.();
    if (!r || !PRESETS.find((p) => p[0] === r)) return;
    if (r !== 'personnalise') { state.preset = r; return; }
    try {
      const [from, to] = D.bounds('personnalise');
      const day = (ts) => window.KiwiDayReport?.businessDay?.(ts) || new Date(ts).toISOString().slice(0, 10);
      if (Number.isFinite(from) && Number.isFinite(to)) { state.preset = 'personnalise'; state.from = day(from); state.to = day(to - 1); }
    } catch (_) { /* reste sur la période d'avant */ }
  }

  function query(extra) {
    const p = new URLSearchParams({ merchant: here(), report: state.report, site: state.site || here() });
    if (state.preset === 'personnalise' && state.from && state.to) { p.set('from', state.from); p.set('to', state.to); }
    else p.set('preset', state.preset === 'personnalise' ? 'septJours' : state.preset);
    if (state.report === 'products' || state.report === 'customers') { p.set('offset', String(state.offset)); p.set('limit', '50'); }
    Object.entries(extra || {}).forEach(([k, v]) => p.set(k, v));
    return '/api/reports?' + p.toString();
  }

  function demoData(extra) {
    return window.KiwiReportDemo.build(Object.assign({ report: state.report, preset: state.preset, from: state.from, to: state.to,
      site: state.site, anchor: demoAnchor(), offset: state.offset }, extra || {}), Date.now());
  }

  async function load() {
    const seq = ++state.seq;
    if (demo()) {
      state.loading = false; state.error = '';
      try { state.data = demoData(); state.sites = state.data.sites; } catch (_) { state.data = null; state.error = 'error'; }
      render();
      return;
    }
    if (!here()) { state.error = 'nostore'; state.loading = false; render(); return; }
    state.loading = true; state.error = '';
    render();
    let res = null, body = null;
    try {
      res = await fetch(query(), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      body = await res.json().catch(() => null);
    } catch (_) { res = null; }
    if (seq !== state.seq) return;
    state.loading = false;
    if (!res || !res.ok || !body) {
      state.data = null;
      state.error = !res ? 'offline' : res.status === 403 ? (body && body.error === 'tier' ? 'tier' : 'forbidden') : 'error';
    } else {
      state.data = body;
      state.sites = body.sites || [];
    }
    render();
  }

  const versusLabel = () => L('comparé à', 'compared with', 'مقارنة مع');
  function reportBody(d) {
    const W = V();
    switch (d.report) {
      case 'summary': return W.summary(d);
      case 'products': return W.ranking(d, 'products');
      case 'categories': return W.ranking(d, 'categories');
      case 'staff': return W.staff(d);
      case 'payments': return W.bars(d, W.methodLabel, 'payments');
      case 'channels': return W.bars(d, W.channelLabel, 'channels');
      case 'heatmap': return W.heatmap(d);
      case 'vat': return W.vat(d);
      case 'customers': return W.customers(d);
      case 'sites': return W.sites(d);
      default: return '';
    }
  }

  function errorBody() {
    const msg = {
      nostore: L('Aucun établissement ouvert sur ce tableau de bord.', 'No location is open on this dashboard.', 'لا توجد مؤسسة مفتوحة في لوحة القيادة هذه.'),
      offline: L('Les rapports n’ont pas pu être lus. Vérifiez la connexion puis réessayez.', 'Reports could not be read. Check the connection and try again.', 'تعذّرت قراءة التقارير. تحقق من الاتصال ثم أعد المحاولة.'),
      tier: L('Ce code ouvre le tableau de bord, pas les rapports. Le patron ou un gérant peut les ouvrir.', 'This code opens the dashboard, not the reports. The owner or a manager can open them.', 'هذا الرمز يفتح لوحة القيادة وليس التقارير. يمكن للمالك أو المسير فتحها.'),
      forbidden: L('Ces rapports ne sont pas accessibles depuis cette session.', 'These reports are not available from this session.', 'هذه التقارير غير متاحة من هذه الجلسة.'),
      error: L('Le rapport n’a pas pu être calculé. Réessayez dans un instant.', 'The report could not be computed. Try again in a moment.', 'تعذّر حساب التقرير. أعد المحاولة بعد لحظة.'),
    }[state.error] || '';
    return `<section class="rp-card rp-empty" role="status"><p>${esc(msg)}</p>${state.error === 'nostore' ? '' : `<button type="button" class="kb ghost" data-action="rp-refresh">${esc(L('Réessayer', 'Try again', 'أعد المحاولة'))}</button>`}</section>`;
  }

  function index() {
    const W = V();
    const multi = state.sites.length > 1;
    const card = (r, action) => `<button type="button" data-action="${action}" data-arg="${r.id}">${W.ic(r.icon)}<b>${esc(r.t())}</b><small>${esc(r.d())}</small></button>`;
    return `<section class="rp-card"><h3>${esc(L('Tous les rapports', 'All reports', 'كل التقارير'))}</h3>
      <div class="rp-index">${REPORTS.filter((r) => r.id !== 'sites' || multi).map((r) => card(r, 'rp-tab')).join('')}${OTHERS.map((r) => card(r, 'rp-open')).join('')}</div></section>`;
  }

  function siteName() {
    if (state.site === 'all' || state.report === 'sites') return L('Tous les établissements', 'All locations', 'كل المؤسسات');
    const s = state.sites.find((x) => x.merchant === (state.site || here()));
    if (!s && state.data && state.data.site) return (state.sites.find((x) => x.merchant === state.data.site) || {}).name || '';
    return s ? s.name : '';
  }

  function render() {
    const W = V();
    if (!W) return;
    W.css();
    const multi = state.sites.length > 1;
    const lensBtn = (action, key, label, on, extra) => `<button type="button" data-lens-item class="${on ? 'on' : ''}" data-action="${action}" data-arg="${key}" aria-pressed="${on}">${extra || ''}${esc(label)}</button>`;
    const tabs = REPORTS.filter((r) => r.id !== 'sites' || multi || !isReal())
      .map((r) => lensBtn('rp-tab', r.id, r.t(), state.report === r.id, W.ic(r.icon))).join('');
    const ranges = PRESETS.map(([k, t]) => lensBtn('rp-range', k, t(), state.preset === k)).join('');
    const current = state.site || (state.data && state.data.site) || here();
    const sitePick = multi && state.report !== 'sites' ? `<label class="rp-act"><span class="rp-note">${esc(L('Établissement', 'Location', 'المؤسسة'))}</span>
      <select class="rp-site" data-rp-site aria-label="${esc(L('Établissement', 'Location', 'المؤسسة'))}">
        ${state.sites.map((s) => `<option value="${esc(s.merchant)}"${current === s.merchant ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
        <option value="all"${state.site === 'all' ? ' selected' : ''}>${esc(L('Tous les établissements', 'All locations', 'كل المؤسسات'))}</option></select></label>` : '';
    const custom = state.preset === 'personnalise' ? `<form class="rp-custom" data-rp-custom><label>${esc(L('Du', 'From', 'من'))} <input type="date" name="from" value="${esc(state.from)}" required></label>
      <label>${esc(L('au', 'to', 'إلى'))} <input type="date" name="to" value="${esc(state.to)}" required></label>
      <button type="submit" class="kb atlas" data-action="rp-custom">${esc(L('Afficher', 'Show', 'عرض'))}</button></form>` : '';
    const d = state.data && state.data.report === state.report ? state.data : null;
    let main;
    if (state.error) main = errorBody();
    else if (!d || state.loading) main = (d ? W.lede(d, versusLabel(), { title: reportTitle(d) }) : '') + '<div class="rp-skel" aria-hidden="true"></div><div class="rp-skel" aria-hidden="true"></div>';
    else main = W.lede(d, versusLabel(), { title: reportTitle(d) }) + reportBody(d);
    /* Les actions restent groupées (elles ne passent jamais seules à la ligne) ;
       l'établissement et les dates choisies vont sur la deuxième ligne. */
    const actions = `<span class="rp-acts"><button type="button" class="kb ghost rp-act" data-action="rp-csv" ${d ? '' : 'disabled'}>${W.ic('download')}${esc(L('CSV', 'CSV', 'CSV'))}</button>
      <button type="button" class="kb ghost rp-act" data-action="rp-print" ${d ? '' : 'disabled'}>${W.ic('print')}${esc(L('Imprimer / PDF', 'Print / PDF', 'طباعة / PDF'))}</button></span>`;
    const page = window.Kiwi.appPage('reports', {
      title: L('Rapports', 'Reports', 'التقارير'),
      subtitle: [siteName(), d ? W.rangeTxt(d.period) : ''].filter(Boolean).join(' · '),
      body: `<div class="rp-page" data-rp-page>
        <div class="rp-bar"><div class="rp-seg" data-lens-demo role="group" aria-label="${esc(L('Période', 'Period', 'الفترة'))}">${ranges}</div>${actions}</div>
        <div class="rp-bar2">${sitePick}${custom}</div>
        <nav class="rp-tabs" aria-label="${esc(L('Rapports', 'Reports', 'التقارير'))}"><div class="rp-seg" data-lens-demo>${tabs}</div></nav>
        ${main}
        ${state.report === 'summary' && !state.loading ? index() : ''}
      </div>`,
    });
    const sel = document.querySelector('[data-rp-site]');
    if (sel) sel.addEventListener('change', () => { state.site = sel.value; state.offset = 0; load(); });
    const form = document.querySelector('[data-rp-custom]');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); applyCustom(form); });
    return page;
  }

  function applyCustom(form) {
    const f = form.querySelector('[name=from]').value, t = form.querySelector('[name=to]').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return;
    state.from = f <= t ? f : t; state.to = f <= t ? t : f; state.offset = 0;
    load();
  }

  const reportTitle = (d) => (REPORTS.find((r) => r.id === d.report)?.t() || '');

  async function open(report) {
    if (report) state.report = report;
    state.offset = 0;
    if (!state.site) state.site = demo() ? demoAnchor() : here();
    adoptDashboardRange();
    await load();
  }

  handlers['nav-reports'] = () => open();
  /* Depuis le sélecteur d'établissement : la vraie vue multi-site. */
  handlers['reports-sites'] = () => { state.site = 'all'; return open('sites'); };
  handlers['rp-tab'] = (el, arg) => {
    const k = typeof el === 'string' ? el : arg;
    if (!REPORTS.find((r) => r.id === k)) return;
    state.report = k; state.offset = 0;
    load();
  };
  handlers['rp-range'] = (el, arg) => {
    const k = typeof el === 'string' ? el : arg;
    if (!PRESETS.find((p) => p[0] === k)) return;
    state.preset = k; state.offset = 0;
    if (k === 'personnalise') {
      if (!state.from || !state.to) {
        const d = state.data && state.data.period;
        state.from = d ? d.fromDay : ''; state.to = d ? d.toDay : '';
      }
      render();
      return;
    }
    /* La même période pour l'accueil : un seul sélecteur pour tout le tableau de bord. */
    try { DR()?.setDateRange?.(k); } catch (_) { /* l'accueil n'est pas chargé */ }
    load();
  };
  handlers['rp-custom'] = (el) => { const form = el && el.closest ? el.closest('form') : document.querySelector('[data-rp-custom]'); if (form) applyCustom(form); };
  handlers['rp-page'] = (el, arg) => { const n = Math.max(0, Number(typeof el === 'string' ? el : arg) || 0); state.offset = n; load(); };
  handlers['rp-refresh'] = () => load();

  handlers['rp-csv'] = async (el) => {
    const btn = el && el.closest ? el : null;
    if (btn) btn.disabled = true;
    try {
      /* Tout le rapport : le serveur ignore la page affichée pour un CSV. */
      let blob, file;
      if (demo()) {
        const d = demoData({ csv: true, offset: 0 });
        blob = new Blob([window.KiwiReportDemo.csv(d, lang())], { type: 'text/csv;charset=utf-8' });
        file = `kiwi-demo-${d.report}-${d.site}-${d.period.fromDay}_${d.period.toDay}.csv`;
      } else {
        const res = await fetch(query({ format: 'csv', lang: lang() }), { credentials: 'same-origin' });
        if (!res.ok) throw new Error('csv');
        blob = await res.blob();
        const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
        file = name ? name[1] : 'kiwi-rapport.csv';
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(L('CSV téléchargé', 'CSV downloaded', 'تم تنزيل CSV'), { type: 'success' });
    } catch (_) {
      toast(L('Le CSV n’a pas pu être préparé', 'The CSV could not be prepared', 'تعذّر تحضير CSV'), { type: 'error' });
    } finally { if (btn) btn.disabled = false; }
  };

  /* Imprimer / PDF : une page de garde pour le comptable (totaux de la
     période et TVA par taux, lus pour la même période et le même
     établissement), puis le rapport affiché. La fenêtre s'ouvre tout de suite
     (sinon le navigateur la bloque), le contenu arrive ensuite. */
  handlers['rp-print'] = async () => {
    const d = state.data;
    if (!d) return;
    const W = V();
    const popup = window.open('', '_blank');
    if (!popup) { toast(L('La fenêtre d’impression a été bloquée par le navigateur.', 'The print window was blocked by the browser.', 'منع المتصفح نافذة الطباعة.'), { type: 'error' }); return; }
    popup.document.write(`<p style="font-family:system-ui;padding:24px">${esc(L('Préparation du document…', 'Preparing the document…', 'جاري تحضير الوثيقة…'))}</p>`);
    const extra = {};
    try {
      const want = (report) => (d.report === report ? d : demo() ? demoData({ report })
        : fetch(query({ report }), { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
      [extra.summary, extra.vat] = await Promise.all([want('summary'), want('vat')]);
    } catch (_) { /* la page de garde est un plus : le rapport s'imprime sans elle */ }
    const title = L('Rapport', 'Report', 'تقرير') + ' · ' + reportTitle(d);
    popup.document.open();
    popup.document.write(W.printable(title, siteName(), W.lede(d, versusLabel(), { share: false }) + reportBody(d), d, extra));
    popup.document.close();
    setTimeout(() => { try { popup.focus(); popup.print(); } catch (_) {} }, 350);
  };

  /* Les rapports qui existaient avant le hub, ouverts par leur propre chemin. */
  handlers['rp-open'] = (el, arg) => {
    const k = typeof el === 'string' ? el : arg;
    if (k === 'z') { handlers['nav-rapport']?.(); return; }
    if (k === 'period') { handlers['export']?.(); return; }
    if (k === 'month') {
      if (window.KiwiMonthReport?.open) window.KiwiMonthReport.open();
      else toast(L('Le dossier du mois se charge, réessayez dans un instant.', 'The month pack is loading, try again in a moment.', 'ملف الشهر قيد التحميل، أعد المحاولة بعد لحظة.'), { type: 'info' });
    }
  };

  /* Une langue change : la page se redessine (les phrases sont déjà là dans
     les trois langues), sans relire le serveur. */
  window.addEventListener('kiwi:langchange', () => { if (document.querySelector('[data-rp-page]')) render(); });
})();
