/* Tableau de bord · TARIFS (listes de prix).
 *
 * Un même article peut se vendre à plusieurs prix : au détail (le prix du
 * catalogue, le tarif principal), en gros / jomla, en ligne, sur une facture,
 * sur une appli de livraison. Cet écran crée les tarifs, les lie à leurs
 * canaux, les remplit (« -10 % depuis le principal, arrondi au dirham »),
 * attache des fiches clients à un tarif (le grossiste paie le prix de gros
 * sans que la caissière y pense) et montre, article par article, tous ses prix.
 *
 * Avant de recalculer un tarif, l'écran dit combien d'articles changeraient
 * et combien passeraient sous leur prix d'achat ; chaque prix montre sa marge
 * sur le prix d'achat du catalogue. L'onglet Ventes dit ce que chaque tarif a
 * vendu et quelles ventes le serveur a signalées (tarif sans code responsable).
 *
 * Tout passe par window.KiwiPriceListsApi (assets/price-lists.js) et le
 * serveur (functions/api/price-lists/) ; les articles viennent du catalogue
 * partagé (KiwiBoutiqueCatalog), les fiches du carnet (KiwiClients). Un
 * article sans prix dans un tarif garde son prix principal : rien n'est
 * recopié qu'on n'a pas demandé.
 *
 * Lazy section (assets/pages-pro.js › LAZY_SECTIONS) : chaque handler listé
 * là est enregistré ici, ni plus ni moins. */
(() => {
  'use strict';
  if (!window.Kiwi) return;
  const { toast, modal, handlers } = window.Kiwi;
  const L = (fr, en, ar) => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d) => window.KiwiNumber?.format(n, { minimumFractionDigits: d, maximumFractionDigits: d }) ?? (+n).toFixed(d);
  const mad = (cents) => (cents == null ? '·' : num(cents / 100, cents % 100 ? 2 : 0) + ' MAD');
  /* Un montant tapé : chiffres, au plus deux décimales (« 12,5 », « 12.50 »). Trois
     décimales ou plus, un signe, une lettre : invalide, jamais arrondi en silence. */
  const toCents = (raw) => {
    const s = String(raw == null ? '' : raw).replace(/\s/g, '').replace(',', '.');
    if (s === '') return null;
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
    const n = Number(s);
    return n <= 1e7 ? Math.round(n * 100) : undefined;
  };
  /* Marge sur le prix d'achat : « 32 % », ou « sous le coût ». Rien sans prix d'achat. */
  const marginHtml = (cents, costCents) => {
    if (cents == null || !(costCents > 0)) return '';
    if (cents < costCents) return `<div class="pl-fb pl-under">${esc(L('sous le prix d’achat', 'below cost', 'تحت ثمن الشراء'))}</div>`;
    return cents > 0 ? `<div class="pl-fb">${esc(L('marge', 'margin', 'الهامش'))} ${esc(num(Math.round((cents - costCents) * 100 / cents), 0))} %</div>` : '';
  };
  const inputMad = (cents) => (cents == null ? '' : String(cents / 100).replace('.', ','));
  const API = () => window.KiwiPriceListsApi;
  /* Le client des tarifs (assets/price-lists.js) se charge à l'inactivité ; si l'écran
     s'ouvre avant, il le demande lui-même (aucune balise de plus dans le tableau). */
  let apiLoading = null;
  function ensureApi() {
    if (API()) return Promise.resolve();
    if (!apiLoading) {
      apiLoading = new Promise((resolve) => {
        try {
          const tag = document.createElement('script');
          tag.src = 'assets/price-lists.js?v=2';
          tag.onload = tag.onerror = () => resolve();
          document.head.appendChild(tag);
        } catch (_) { resolve(); }
      }).then(() => { apiLoading = null; });
    }
    return apiLoading;
  }
  const CAT = () => window.KiwiBoutiqueCatalog || null;
  const BOOK = () => window.KiwiClients || null;

  const CHANNELS = [
    ['till', () => L('Caisse', 'Till', 'الصندوق')],
    ['online', () => L('En ligne', 'Online', 'المتجر الإلكتروني')],
    ['invoices', () => L('Factures et devis', 'Invoices and quotes', 'الفواتير وعروض الأثمان')],
    ['delivery', () => L('Livraison', 'Delivery apps', 'تطبيقات التوصيل'), true],
  ];
  /* Un canal que rien ne lit encore (les applications de livraison : aucune
     commande Glovo n'entre par Kiwi) reste visible mais grisé, avec « bientôt » :
     le cocher laisserait croire que ces prix partent quelque part. */
  const chanBox = ([id, label, soon], attr, on) => `<label${soon ? ' class="pl-soon"' : ''}><input type="checkbox" ${attr}="${id}"${on ? ' checked' : ''}${soon ? ' disabled' : ''}> ${esc(label())}${soon ? ` <span class="pl-pill off">${esc(L('bientôt', 'soon', 'قريباً'))}</span>` : ''}</label>`;
  const STEPS = [[0, () => L('Sans arrondi', 'No rounding', 'بلا تقريب')], [50, () => '0,50 MAD'], [100, () => '1 MAD'], [500, () => '5 MAD']];
  const TABS = ['lists', 'items', 'clients', 'sales'];

  const state = { tab: 'lists', lists: [], loaded: false, error: '', open: null, prices: null, draft: {}, invalid: new Set(), query: '', item: '', itemData: null, clients: [], clientQuery: '', sales: null };

  /* Material Symbols, Outlined 400 (assets/icons/material/). */
  const ICON = {
    sell: 'M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Zm220 160Z',
    add: 'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',
    back: 'm313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z',
    del: 'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z',
  };
  const ic = (k) => `<svg class="pl-i" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor"><path d="${ICON[k]}"/></svg>`;

  function css() {
    if (document.getElementById('pl-css')) return;
    const style = document.createElement('style');
    style.id = 'pl-css';
    style.textContent = `
.pl-page{display:grid;gap:16px}
.pl-i{width:18px;height:18px;flex:none}
.pl-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.pl-seg{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:var(--surface-2,rgba(10,15,13,.05))}
.pl-seg button{border:0;background:transparent;border-radius:999px;padding:7px 14px;font:500 13.5px/1 inherit;color:var(--ink-2,#3a4440);cursor:pointer}
.pl-seg button.on{color:var(--ink,#0A0F0D)}
.pl-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.pl-card{border:1px solid var(--line,rgba(10,15,13,.12));border-radius:18px;background:var(--paper,#F7F5F0);padding:16px;display:grid;gap:10px;min-width:0}
.pl-card h3{margin:0;font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px}
.pl-card .pl-main{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--atlas,#0B6E4F)}
.pl-sub{margin:0;color:var(--ink-3,#5d6662);font-size:13px;line-height:1.5}
.pl-pills{display:flex;flex-wrap:wrap;gap:6px}
.pl-pill{font-size:12px;padding:3px 9px;border-radius:999px;background:rgba(11,110,79,.09);color:var(--riad,#053B2C)}
.pl-pill.off{background:rgba(10,15,13,.05);color:var(--ink-3,#5d6662)}
.pl-stats{display:flex;gap:14px;font-size:13px;color:var(--ink-2,#3a4440);font-variant-numeric:tabular-nums}
.pl-acts{display:flex;flex-wrap:wrap;gap:8px}
.pl-acts .kb{display:inline-flex;align-items:center;gap:6px}
.pl-form{display:grid;gap:12px}
.pl-form label{display:grid;gap:6px;font-size:13px;color:var(--ink-2,#3a4440)}
.pl-form input[type=text],.pl-form input[type=number],.pl-form select,.pl-search{font:inherit;font-size:14px;padding:9px 11px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.16));background:#FDFCF9;color:var(--ink,#0A0F0D);min-width:0}
.pl-checks{display:flex;flex-wrap:wrap;gap:8px}
.pl-checks label{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.12));font-size:13px}
.pl-checks label.pl-soon{opacity:.62;cursor:not-allowed}
.pl-row2{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}
.pl-hint{font-size:12.5px;color:var(--ink-3,#5d6662);line-height:1.45}
.pl-table{width:100%;border-collapse:collapse;font-size:14px}
.pl-table th{font-size:12px;font-weight:500;color:var(--ink-3,#5d6662);text-align:start;padding:8px;border-bottom:1px solid var(--line,rgba(10,15,13,.12))}
.pl-table td{padding:7px 8px;border-bottom:1px solid var(--line,rgba(10,15,13,.06));vertical-align:middle}
.pl-table td.n{font-variant-numeric:tabular-nums;text-align:end;white-space:nowrap}
.pl-table input{width:110px;font:inherit;font-size:14px;text-align:end;padding:6px 8px;border-radius:8px;border:1px solid var(--line,rgba(10,15,13,.16));background:#FDFCF9;font-variant-numeric:tabular-nums}
.pl-table input.dirty{border-color:var(--atlas,#0B6E4F);box-shadow:0 0 0 2px rgba(11,110,79,.15)}
.pl-table .pl-fb{font-size:12px;color:var(--ink-3,#5d6662)}
.pl-under{color:var(--danger,#C94A3A);font-weight:500}
.pl-table input[aria-invalid=true]{border-color:var(--danger,#C94A3A)}
.pl-plan{display:grid;gap:8px}.pl-plan b{font-weight:600;font-variant-numeric:tabular-nums}
.pl-wrap{overflow-x:auto;border:1px solid var(--line,rgba(10,15,13,.12));border-radius:14px;background:var(--paper,#F7F5F0)}
.pl-empty{padding:28px;text-align:center;color:var(--ink-3,#5d6662);font-size:14px}
.pl-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pl-head h2{margin:0;font-size:20px;font-weight:600}
@media(max-width:640px){.pl-table input{width:84px}}
`;
    document.head.appendChild(style);
  }

  const chanLabel = (k) => (CHANNELS.find(([id]) => id === k) || [k, () => k])[1]();
  const products = () => {
    const C = CAT();
    try { return C ? C.listProducts().filter((p) => p && !p.archived) : []; } catch (_) { return []; }
  };
  /* Le principal non renommé se dit dans la langue de l'écran. */
  const nm = (l) => (l && l.isMain && (l.defaultName || !l.name) ? L('Prix principal', 'Main price', 'الثمن الأساسي') : String((l && l.name) || ''));
  const listName = (id) => nm(state.lists.find((l) => l.id === id)) || (id === 'main' ? L('Prix principal', 'Main price', 'الثمن الأساسي') : '');
  const costOf = (p) => (Number(p && p.cost) > 0 ? Math.round(Number(p.cost) * 100) : null);

  async function loadLists() {
    try { state.lists = await API().lists(); state.error = ''; }
    catch (e) { state.error = e.code || 'unavailable'; }
    state.loaded = true;
  }

  /* ── les vues ── */
  function cardHtml(l) {
    const pills = l.isMain
      ? `<span class="pl-pill">${esc(L('Partout, par défaut', 'Everywhere, by default', 'في كل مكان، افتراضياً'))}</span>`
      : (l.channels.length ? l.channels.map((c) => `<span class="pl-pill">${esc(chanLabel(c))}</span>`).join('') : `<span class="pl-pill off">${esc(L('Aucun canal', 'No channel', 'بلا قناة'))}</span>`);
    const stats = l.isMain
      ? `<span>${esc(L('Le prix du catalogue', 'The catalogue price', 'ثمن الكتالوج'))}</span>`
      : `<span>${esc(num(l.priced || 0, 0))} ${esc(L('prix posés', 'prices set', 'ثمن محدد'))}</span><span>${esc(num(l.clients || 0, 0))} ${esc(L('clients', 'customers', 'زبناء'))}</span>`;
    return `<article class="pl-card">
      ${l.isMain ? `<span class="pl-main">${esc(L('Tarif principal', 'Main price list', 'التسعيرة الأساسية'))}</span>` : ''}
      <h3>${ic('sell')}${esc(nm(l))}${l.shared ? ` <span class="pl-pill off">${esc(L('partagé', 'shared', 'مشترك'))}</span>` : ''}</h3>
      <div class="pl-pills">${pills}</div>
      <div class="pl-stats">${stats}</div>
      <div class="pl-acts">${l.isMain
        ? `<button class="kb ghost" data-action="pl-rename-main">${esc(L('Renommer', 'Rename', 'إعادة التسمية'))}</button>`
        : (l.shared ? '' : `<button class="kb atlas" data-action="pl-open" data-arg="${esc(l.id)}">${esc(L('Ouvrir', 'Open', 'فتح'))}</button>`)}</div>
    </article>`;
  }

  function listsBody() {
    if (!state.loaded) return `<p class="pl-sub">${esc(L('Chargement des tarifs…', 'Loading price lists…', 'جارٍ تحميل التسعيرات…'))}</p>`;
    /* Base pas encore migrée (0028) : le dire, au lieu d'un écran vide et d'un échec à l'enregistrement. */
    if (state.lists.pending) return `<div class="pl-empty" data-pl-pending>${esc(errorText('pending-migration'))}</div>`;
    if (state.error) return `<p class="pl-sub">${esc(L('Tarifs indisponibles pour le moment. Rien n’a changé ; réessayez dans un instant.', 'Price lists are unavailable right now. Nothing changed; try again in a moment.', 'التسعيرات غير متاحة حالياً. لم يتغير شيء؛ أعد المحاولة بعد قليل.'))}</p>`;
    const intro = state.lists.length < 2
      ? `<p class="pl-sub">${esc(L('Un seul prix aujourd’hui : celui du rayon. Créez un tarif « Gros » pour vos clients revendeurs, ou un tarif en ligne. Un article sans prix dans un tarif garde son prix principal.',
        'One price today: the shelf price. Create a “Wholesale” list for your trade customers, or an online list. An item with no price in a list keeps its main price.',
        'عندك اليوم ثمن واحد: ثمن الرف. أنشئ تسعيرة «الجملة» لزبناء البيع بالجملة، أو تسعيرة للمتجر الإلكتروني. السلعة التي ليس لها ثمن في التسعيرة تبقى بثمنها الأساسي.'))}</p>` : '';
    return intro + `<div class="pl-grid">${state.lists.map(cardHtml).join('')}</div>`;
  }

  function detailBody() {
    const l = state.lists.find((x) => x.id === state.open);
    if (!l) return listsBody();
    const prods = products();
    const q = state.query.trim().toLowerCase();
    const rows = prods.filter((p) => !q || String(p.name || '').toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q)).slice(0, 400);
    const priced = state.prices || new Map();
    const body = !CAT() ? `<div class="pl-empty">${esc(L('Le catalogue n’est pas chargé sur cet appareil.', 'The catalogue is not loaded on this device.', 'الكتالوج غير محمّل على هذا الجهاز.'))}</div>`
      : !rows.length ? `<div class="pl-empty">${esc(L('Aucun article ne correspond.', 'No item matches.', 'لا توجد سلعة مطابقة.'))}</div>`
        : `<table class="pl-table"><thead><tr><th>${esc(L('Article', 'Item', 'السلعة'))}</th><th class="n">${esc(L('Prix d’achat', 'Cost', 'ثمن الشراء'))}</th><th class="n">${esc(L('Prix principal', 'Main price', 'الثمن الأساسي'))}</th><th class="n">${esc(l.name)}</th></tr></thead><tbody>${rows.map((p) => {
          const main = Math.round((+p.priceMAD || 0) * 100), cost = costOf(p);
          const own = Object.prototype.hasOwnProperty.call(state.draft, p.id) ? state.draft[p.id] : priced.get(p.id);
          const dirty = Object.prototype.hasOwnProperty.call(state.draft, p.id);
          return `<tr><td>${esc(p.name)}</td><td class="n">${esc(cost == null ? '·' : mad(cost))}</td><td class="n">${esc(mad(main))}${marginHtml(main, cost)}</td><td class="n"><input inputmode="decimal" data-pl-price="${esc(p.id)}" class="${dirty ? 'dirty' : ''}" value="${esc(inputMad(own))}" placeholder="${esc(inputMad(main))}" aria-label="${esc(l.name + ' · ' + p.name)}"><div data-pl-note="${esc(p.id)}">${own == null ? `<div class="pl-fb">${esc(L('principal', 'main', 'أساسي'))}</div>` : (own === 0 ? `<div class="pl-fb">${esc(L('offert', 'free', 'مجاني'))}</div>` : marginHtml(own, cost))}</div></td></tr>`;
        }).join('')}</tbody></table>`;
    const checks = CHANNELS.map((c) => chanBox(c, 'data-pl-chan', l.channels.includes(c[0]))).join('');
    const dirtyN = Object.keys(state.draft).length;
    return `<div class="pl-head"><button class="kb ghost" data-action="pl-back">${ic('back')}${esc(L('Tous les tarifs', 'All price lists', 'كل التسعيرات'))}</button><h2>${esc(l.name)}</h2></div>
      <div class="pl-card pl-form">
        <label>${esc(L('Nom', 'Name', 'الاسم'))}<input type="text" data-pl-name maxlength="60" value="${esc(l.name)}"></label>
        <div><div class="pl-hint">${esc(L('Où ce tarif s’applique', 'Where this list applies', 'أين تُطبّق هذه التسعيرة'))}</div><div class="pl-checks">${checks}</div></div>
        <div class="pl-acts"><button class="kb atlas" data-action="pl-save-meta" data-arg="${esc(l.id)}">${esc(L('Enregistrer', 'Save', 'حفظ'))}</button>
        <button class="kb ghost" data-action="pl-remove" data-arg="${esc(l.id)}">${ic('del')}${esc(L('Retirer ce tarif', 'Remove this list', 'حذف هذه التسعيرة'))}</button></div>
      </div>
      <div class="pl-card pl-form">
        <h3>${esc(L('Recalculer depuis le prix principal', 'Recalculate from the main price', 'إعادة الحساب من الثمن الأساسي'))}</h3>
        <div class="pl-row2"><label>${esc(L('Variation (%)', 'Change (%)', 'التغيير (%)'))}<input type="number" step="0.5" data-pl-pct value="-10"></label>
        <label>${esc(L('Arrondi', 'Rounding', 'التقريب'))}<select data-pl-step>${STEPS.map(([v, t]) => `<option value="${v}"${v === 100 ? ' selected' : ''}>${esc(t())}</option>`).join('')}</select></label></div>
        <p class="pl-hint" data-pl-example></p>
        <div class="pl-acts"><button class="kb ghost" data-action="pl-derive" data-arg="${esc(l.id)}">${esc(L('Voir l’effet, puis appliquer', 'Preview, then apply', 'معاينة ثم تطبيق'))}</button></div>
      </div>
      <div class="pl-bar"><input class="pl-search" type="search" data-pl-search placeholder="${esc(L('Chercher un article', 'Search an item', 'ابحث عن سلعة'))}" value="${esc(state.query)}">
        <div class="pl-acts"><span class="pl-hint">${esc(L('Vide = prix principal', 'Empty = main price', 'فارغ = الثمن الأساسي'))}</span>
        <button class="kb atlas" data-action="pl-save-prices" data-arg="${esc(l.id)}"${dirtyN && !state.invalid.size ? '' : ' disabled'}>${esc(saveLabel())}</button></div></div>
      <div class="pl-wrap">${body}</div>`;
  }

  function itemsBody() {
    const prods = products();
    const q = state.query.trim().toLowerCase();
    const hits = q ? prods.filter((p) => String(p.name || '').toLowerCase().includes(q)).slice(0, 12) : [];
    const pick = hits.map((p) => `<button class="kb ghost" data-action="pl-item" data-arg="${esc(p.id)}">${esc(p.name)}</button>`).join('');
    const d = state.itemData;
    const table = d ? `<div class="pl-wrap"><table class="pl-table"><thead><tr><th>${esc(L('Tarif', 'Price list', 'التسعيرة'))}</th><th>${esc(L('Canaux', 'Channels', 'القنوات'))}</th><th class="n">${esc(L('Prix', 'Price', 'الثمن'))}</th></tr></thead><tbody>${d.lists.map((x) => `<tr><td>${esc(listName(x.id) || x.name)}</td><td>${x.isMain ? '' : (x.channels || []).map((c) => `<span class="pl-pill">${esc(chanLabel(c))}</span>`).join(' ')}</td><td class="n">${esc(mad(x.cents))}${!x.isMain && x.source === 'main' ? `<div class="pl-fb">${esc(L('repli sur le principal', 'falls back to main', 'يرجع للأساسي'))}</div>` : ''}${marginHtml(x.cents, d.item.costCents)}</td></tr>`).join('')}</tbody></table></div>` : '';
    return `<div class="pl-bar"><input class="pl-search" type="search" data-pl-search placeholder="${esc(L('Chercher un article pour voir tous ses prix', 'Search an item to see all its prices', 'ابحث عن سلعة لترى كل أثمانها'))}" value="${esc(state.query)}"></div>
      ${pick ? `<div class="pl-acts">${pick}</div>` : ''}
      ${d ? `<div class="pl-head"><h2>${esc(d.item.name || d.item.itemKey)}</h2></div>${table}` : `<p class="pl-sub">${esc(L('Chaque tarif, son prix pour cet article, et d’où il vient.', 'Every list, its price for this item, and where it comes from.', 'كل تسعيرة، ثمنها لهذه السلعة، ومن أين يأتي.'))}</p>`}`;
  }

  function clientsBody() {
    const book = BOOK();
    let all = [];
    try { all = book ? book.list() : []; } catch (_) { all = []; }
    const byId = new Map(all.map((c) => [c.id, c]));
    const choices = state.lists.filter((l) => !l.isMain);
    if (!choices.length) return `<p class="pl-sub">${esc(L('Créez d’abord un tarif (par exemple « Gros ») pour y attacher des clients.', 'Create a price list first (for example “Wholesale”) to attach customers to it.', 'أنشئ أولاً تسعيرة (مثلاً «الجملة») لتربط بها الزبناء.'))}</p>`;
    const rows = state.clients.map((r) => {
      const c = byId.get(r.clientId) || {};
      return `<tr><td>${esc(c.name || r.clientId)}</td><td>${esc(c.phone || '')}</td><td>${esc(listName(r.listId))}</td><td class="n"><button class="kb ghost" data-action="pl-client-del" data-arg="${esc(r.clientId)}">${esc(L('Retirer', 'Remove', 'إزالة'))}</button></td></tr>`;
    }).join('');
    const q = state.clientQuery.trim().toLowerCase();
    const assigned = new Set(state.clients.map((r) => r.clientId));
    const hits = q ? all.filter((c) => !assigned.has(c.id) && (String(c.name || '').toLowerCase().includes(q) || String(c.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')))).slice(0, 8) : [];
    const sel = `<select data-pl-client-list>${choices.map((l) => `<option value="${esc(l.id)}">${esc(nm(l))}</option>`).join('')}</select>`;
    return `<p class="pl-sub">${esc(L('Un client attaché à un tarif le reçoit à la caisse dès qu’on l’ajoute au ticket (avec le code d’un responsable si le tarif baisse les prix), et sur ses factures.', 'A customer attached to a list gets it at the till as soon as they are added to the ticket (with a manager code when the list lowers prices), and on their invoices.', 'الزبون المرتبط بتسعيرة يحصل عليها في الصندوق بمجرد إضافته إلى التذكرة (برمز المسؤول إذا كانت التسعيرة تخفض الأثمان)، وفي فواتيره.'))}</p>
      <div class="pl-card pl-form"><div class="pl-row2"><label>${esc(L('Client', 'Customer', 'الزبون'))}<input type="text" data-pl-client-q value="${esc(state.clientQuery)}" placeholder="${esc(L('Nom ou téléphone', 'Name or phone', 'الاسم أو الهاتف'))}"></label><label>${esc(L('Tarif', 'Price list', 'التسعيرة'))}${sel}</label></div>
      ${hits.length ? `<div class="pl-acts">${hits.map((c) => `<button class="kb ghost" data-action="pl-client-add" data-arg="${esc(c.id)}">${ic('add')}${esc(c.name || c.phone || c.id)}</button>`).join('')}</div>` : (q ? `<p class="pl-hint">${esc(L('Aucune fiche ne correspond dans le carnet.', 'No record matches in the customer book.', 'لا توجد بطاقة مطابقة في الدفتر.'))}</p>` : '')}</div>
      <div class="pl-wrap">${rows ? `<table class="pl-table"><thead><tr><th>${esc(L('Client', 'Customer', 'الزبون'))}</th><th>${esc(L('Téléphone', 'Phone', 'الهاتف'))}</th><th>${esc(L('Tarif', 'Price list', 'التسعيرة'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="pl-empty">${esc(L('Aucun client n’a encore de tarif.', 'No customer has a price list yet.', 'لا يوجد زبون له تسعيرة بعد.'))}</div>`}</div>`;
  }

  /* Ce que chaque tarif a vendu, et les ventes que le serveur a signalées. */
  function salesBody() {
    const d = state.sales;
    if (!d) return `<p class="pl-sub">${esc(L('Chargement des ventes…', 'Loading sales…', 'جارٍ تحميل المبيعات…'))}</p>`;
    if (d.error) return `<p class="pl-sub">${esc(L('Ventes indisponibles pour le moment.', 'Sales are unavailable right now.', 'المبيعات غير متاحة حالياً.'))}</p>`;
    const reason = (r) => ({
      'no-approval': L('sans code responsable', 'no manager code', 'دون رمز المسؤول'),
      'customer-default-no-approval': L('fiche client, sans code responsable', 'customer record, no manager code', 'بطاقة زبون، دون رمز المسؤول'),
      'approval-invalid': L('accord expiré ou faux', 'expired or invalid approval', 'موافقة منتهية أو غير صالحة'),
      'unknown-list': L('tarif inconnu', 'unknown list', 'تسعيرة غير معروفة'),
    })[r] || r;
    const when = (ts) => { try { return new Date(ts).toLocaleString(window.KiwiI18n?.getLang?.() === 'ar' ? 'ar-MA' : window.KiwiI18n?.getLang?.() === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' }); } catch (_) { return ''; } };
    const lists = d.lists.length
      ? `<table class="pl-table"><thead><tr><th>${esc(L('Tarif', 'Price list', 'التسعيرة'))}</th><th class="n">${esc(L('Ventes', 'Sales', 'المبيعات'))}</th><th class="n">${esc(L('Remboursé', 'Refunded', 'المُسترجَع'))}</th><th class="n">${esc(L('Net', 'Net', 'الصافي'))}</th><th class="n">${esc(L('Signalées', 'Flagged', 'مُبلَّغ عنها'))}</th></tr></thead><tbody>${d.lists.map((r) => `<tr><td>${esc(listName(r.listId) || r.name)}</td><td class="n">${esc(num(r.sales, 0))}</td><td class="n">${r.refundCents ? esc('−' + mad(r.refundCents)) : '0'}</td><td class="n">${esc(mad(r.amountCents))}</td><td class="n">${r.flagged ? `<span class="pl-under">${esc(num(r.flagged, 0))}</span>` : '0'}</td></tr>`).join('')}</tbody></table>`
      : `<div class="pl-empty">${esc(L('Aucune vente à un autre tarif que le principal sur 30 jours.', 'No sale at a list other than main in 30 days.', 'لا مبيعات بتسعيرة غير الأساسية خلال 30 يوماً.'))}</div>`;
    const flags = d.flags.length
      ? `<table class="pl-table"><thead><tr><th>${esc(L('Ticket', 'Ticket', 'التذكرة'))}</th><th>${esc(L('Tarif', 'Price list', 'التسعيرة'))}</th><th>${esc(L('Pourquoi', 'Why', 'السبب'))}</th><th class="n">${esc(L('Montant', 'Amount', 'المبلغ'))}</th><th class="n">${esc(L('Quand', 'When', 'متى'))}</th></tr></thead><tbody>${d.flags.map((f) => `<tr><td>${esc(f.ref || f.saleId.slice(-8))}</td><td>${esc(listName(f.listId) || f.listId)}</td><td>${esc(reason(f.reason))}</td><td class="n">${esc(mad(f.amountCents))}</td><td class="n">${esc(when(f.saleTs))}</td></tr>`).join('')}</tbody></table>`
      : `<div class="pl-empty">${esc(L('Aucune vente signalée : chaque tarif a eu son code responsable.', 'No flagged sale: every list had its manager code.', 'لا مبيعات مُبلَّغ عنها: كل تسعيرة كان لها رمز المسؤول.'))}</div>`;
    const un = d.unattributed || { count: 0, cents: 0 };
    const loose = un.count ? `<p class="pl-hint" data-pl-unattributed>${esc(L(
      `Remboursements non attribués : ${num(un.count, 0)} · ${mad(un.cents)}. Aucune vente d’origine ne les relie à un tarif, ils ne sont déduits d’aucune ligne.`,
      `Unattributed refunds: ${num(un.count, 0)} · ${mad(un.cents)}. No original sale links them to a list, so no row above includes them.`,
      `استرجاعات غير منسوبة: ${num(un.count, 0)} · ${mad(un.cents)}. لا يربطها أي بيع أصلي بتسعيرة، فلم تُخصم من أي سطر.`))}</p>` : '';
    return `<p class="pl-sub">${esc(L('30 derniers jours, remboursements et retours déduits le jour où ils sont faits. Une vente signalée est comptée : elle dit seulement qu’un tarif plus bas a été appliqué sans le code d’un responsable.', 'Last 30 days, refunds and returns taken off on the day they are made. A flagged sale is counted: it only says a lower list was applied without a manager code.', 'آخر 30 يوماً، مع خصم الاسترجاعات والمرتجعات يوم حدوثها. البيع المُبلَّغ عنه محسوب: يعني فقط أن تسعيرة أرخص طُبّقت دون رمز المسؤول.'))}</p>
      <div class="pl-wrap">${lists}</div>${loose}
      <div class="pl-head"><h2>${esc(L('Ventes signalées', 'Flagged sales', 'مبيعات مُبلَّغ عنها'))}</h2></div>
      <div class="pl-wrap">${flags}</div>`;
  }
  function saveLabel() {
    const n = Object.keys(state.draft).length;
    if (state.invalid.size) return L('Prix invalide : deux décimales au plus', 'Invalid price: two decimals at most', 'ثمن غير صالح: رقمان عشريان على الأكثر');
    return n ? L(`Enregistrer ${n} prix`, `Save ${n} prices`, `حفظ ${n} ثمن`) : L('Aucun changement', 'No changes', 'لا تغيير');
  }

  function render() {
    css();
    const tab = (key, label) => `<button type="button" data-lens-item class="${state.tab === key ? 'on' : ''}" data-action="pl-tab" data-arg="${key}" aria-pressed="${state.tab === key}">${esc(label)}</button>`;
    const main = state.tab === 'items' ? itemsBody() : state.tab === 'clients' ? clientsBody() : state.tab === 'sales' ? salesBody() : (state.open ? detailBody() : listsBody());
    window.Kiwi.appPage('pricelists', {
      title: L('Tarifs', 'Price lists', 'التسعيرات'),
      subtitle: L('Détail, gros, en ligne, factures : un prix par canal et par client', 'Retail, wholesale, online, invoices: one price per channel and per customer', 'التقسيط، الجملة، المتجر، الفواتير: ثمن لكل قناة ولكل زبون'),
      body: `<div class="pl-page" data-pl-page>
        <div class="pl-bar"><div class="pl-seg" data-lens-demo>${tab('lists', L('Tarifs', 'Lists', 'التسعيرات'))}${tab('items', L('Par article', 'By item', 'حسب السلعة'))}${tab('clients', L('Clients', 'Customers', 'الزبناء'))}${tab('sales', L('Ventes', 'Sales', 'المبيعات'))}</div>
        ${state.tab === 'lists' && !state.open ? `<button class="kb atlas" data-action="pl-new">${ic('add')}${esc(L('Nouveau tarif', 'New price list', 'تسعيرة جديدة'))}</button>` : ''}</div>
        ${main}</div>`,
    });
    wire();
  }

  /* Les champs tapés ne redessinent pas la page sous le doigt : on garde le brouillon et on met à jour le bouton. */
  function wire() {
    const page = document.querySelector('[data-pl-page]');
    if (!page) return;
    page.querySelectorAll('[data-pl-price]').forEach((inp) => inp.addEventListener('input', () => {
      const id = inp.getAttribute('data-pl-price');
      const v = toCents(inp.value);
      /* Une saisie invalide ne garde AUCUN ancien brouillon : Enregistrer est bloqué tant qu'elle reste. */
      if (v === undefined) { inp.setAttribute('aria-invalid', 'true'); state.invalid.add(id); delete state.draft[id]; }
      else {
        inp.removeAttribute('aria-invalid'); state.invalid.delete(id);
        const was = (state.prices || new Map()).get(id);
        if ((v == null && was == null) || v === was) delete state.draft[id]; else state.draft[id] = v;
      }
      inp.classList.toggle('dirty', Object.prototype.hasOwnProperty.call(state.draft, id));
      const note = page.querySelector(`[data-pl-note="${CSS.escape(id)}"]`), p = products().find((x) => x.id === id);
      const shown = v === undefined ? null : (v == null ? (state.prices || new Map()).get(id) : v);
      if (note) note.innerHTML = v === undefined ? '' : shown == null ? `<div class="pl-fb">${esc(L('principal', 'main', 'أساسي'))}</div>` : shown === 0 ? `<div class="pl-fb">${esc(L('offert', 'free', 'مجاني'))}</div>` : marginHtml(shown, costOf(p));
      const btn = page.querySelector('[data-action="pl-save-prices"]');
      const n = Object.keys(state.draft).length;
      if (btn) { btn.disabled = !n || state.invalid.size > 0; btn.textContent = saveLabel(); }
    }));
    const search = page.querySelector('[data-pl-search]');
    if (search) search.addEventListener('input', () => {
      state.query = search.value;
      const at = search.selectionStart;
      render();
      const again = document.querySelector('[data-pl-search]');
      if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch (_) {} }
    });
    const cq = page.querySelector('[data-pl-client-q]');
    if (cq) cq.addEventListener('input', () => {
      state.clientQuery = cq.value;
      const at = cq.selectionStart;
      render();
      const again = document.querySelector('[data-pl-client-q]');
      if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch (_) {} }
    });
    const pct = page.querySelector('[data-pl-pct]'), step = page.querySelector('[data-pl-step]'), ex = page.querySelector('[data-pl-example]');
    const example = () => {
      if (!ex) return;
      const p = Number(String(pct.value).replace(',', '.')), s = Number(step.value) || 0;
      if (!Number.isFinite(p)) { ex.textContent = ''; return; }
      const raw = Math.max(1, Math.round(10000 * (10000 + Math.round(p * 100)) / 10000));
      const out = s > 0 && Math.round(raw / s) * s > 0 ? Math.round(raw / s) * s : raw;   // comme le serveur : jamais 0
      ex.textContent = L(`Exemple : un article à 100 MAD passe à ${mad(Math.max(0, out))}.`, `Example: an item at 100 MAD becomes ${mad(Math.max(0, out))}.`, `مثال: سلعة بـ100 درهم تصبح بـ${mad(Math.max(0, out))}.`);
    };
    if (pct && step) { pct.addEventListener('input', example); step.addEventListener('change', example); example(); }
  }

  function errorText(code) {
    return ({
      'name-taken': L('Un tarif porte déjà ce nom.', 'A price list already has this name.', 'توجد تسعيرة بهذا الاسم.'),
      'name-required': L('Donnez un nom au tarif.', 'Give the list a name.', 'أعطِ التسعيرة اسماً.'),
      forbidden: L('Seul le patron ou un gérant modifie les tarifs.', 'Only the owner or a manager changes price lists.', 'فقط صاحب المحل أو المسيّر يغيّر التسعيرات.'),
      'too-many-lists': L('Trop de tarifs : retirez-en un d’abord.', 'Too many lists: remove one first.', 'تسعيرات كثيرة: احذف واحدة أولاً.'),
      offline: L('Pas de connexion. Rien n’a été enregistré.', 'No connection. Nothing was saved.', 'لا يوجد اتصال. لم يُحفظ شيء.'),
      'zero-price': L('Un prix à 0 MAD doit être confirmé comme offert.', 'A 0 MAD price must be confirmed as free.', 'ثمن 0 درهم يجب تأكيده كمجاني.'),
      'bad-price': L('Prix invalide : deux décimales au plus.', 'Invalid price: two decimals at most.', 'ثمن غير صالح: رقمان عشريان على الأكثر.'),
      'pending-migration': L('Mise à jour en attente : les tarifs s’activent dès que Kiwi aura mis à jour votre base. Rien n’a été enregistré.', 'Update pending: price lists switch on as soon as Kiwi has updated your database. Nothing was saved.', 'تحديث قيد الانتظار: تُفعَّل التسعيرات بمجرد أن تُحدِّث Kiwi قاعدة بياناتك. لم يُحفظ شيء.'),
    })[code] || L('Impossible pour le moment. Rien n’a été enregistré.', 'Not possible right now. Nothing was saved.', 'غير ممكن حالياً. لم يُحفظ شيء.');
  }
  const failToast = (e) => toast(errorText(e && e.code), { type: 'error' });

  async function openList(id) {
    state.open = id; state.draft = {}; state.invalid = new Set(); state.query = ''; state.prices = null;
    render();
    try {
      const rows = await API().listPrices(id);
      state.prices = new Map(rows.filter((r) => !r.variantKey).map((r) => [r.itemKey, r.cents]));
    } catch (e) { state.prices = new Map(); failToast(e); }
    if (state.open === id) render();
  }
  async function loadClients() {
    try { state.clients = await API().clients(); } catch (_) { state.clients = []; }
  }

  /* ── les handlers ── */
  const argOf = (el, arg) => (typeof el === 'string' ? el : arg);

  handlers['nav-pricelists'] = async () => {
    state.loaded = false; state.open = null; state.tab = 'lists';
    render();
    await ensureApi();
    await loadLists();
    render();
  };
  handlers['pl-tab'] = async (el, arg) => {
    const k = argOf(el, arg);
    if (Object.keys(state.draft).length && !window.confirm(L('Quitter sans enregistrer les prix ?', 'Leave without saving the prices?', 'المغادرة دون حفظ الأثمان؟'))) return;
    state.tab = TABS.includes(k) ? k : 'lists'; state.open = null; state.draft = {}; state.invalid = new Set(); state.query = ''; state.itemData = null;
    if (state.tab === 'clients') { render(); await loadClients(); }
    if (state.tab === 'sales') { state.sales = null; render(); try { state.sales = await API().sales(30); } catch (_) { state.sales = { error: true }; } }
    render();
  };
  handlers['pl-open'] = (el, arg) => openList(argOf(el, arg));
  handlers['pl-back'] = () => {
    if (Object.keys(state.draft).length && !window.confirm(L('Quitter sans enregistrer les prix ?', 'Leave without saving the prices?', 'المغادرة دون حفظ الأثمان؟'))) return;
    state.open = null; state.draft = {}; state.invalid = new Set(); state.query = '';
    render();
  };

  handlers['pl-new'] = () => {
    const bases = [['main', L('Le prix principal', 'The main price', 'الثمن الأساسي')], ['empty', L('Vide (tout reste au principal)', 'Empty (everything stays at main)', 'فارغة (كل شيء يبقى بالأساسي)')],
      ...state.lists.filter((l) => !l.isMain).map((l) => [l.id, L('Copie de ', 'Copy of ', 'نسخة من ') + nm(l)])];
    const m = modal({
      title: L('Nouveau tarif', 'New price list', 'تسعيرة جديدة'),
      body: `<div class="pl-form">
        <label>${esc(L('Nom', 'Name', 'الاسم'))}<input type="text" data-n maxlength="60" placeholder="${esc(L('Gros, Revendeurs, En ligne…', 'Wholesale, Resellers, Online…', 'الجملة، البائعون، المتجر…'))}"></label>
        <div><div class="pl-hint">${esc(L('Où il s’applique', 'Where it applies', 'أين تُطبّق'))}</div><div class="pl-checks">${CHANNELS.map((c) => chanBox(c, 'data-c', c[0] === 'till')).join('')}</div></div>
        <label>${esc(L('Partir de', 'Start from', 'البداية من'))}<select data-b>${bases.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>
        <div class="pl-row2"><label>${esc(L('Variation (%)', 'Change (%)', 'التغيير (%)'))}<input type="number" step="0.5" data-p value="-10"></label>
        <label>${esc(L('Arrondi', 'Rounding', 'التقريب'))}<select data-s>${STEPS.map(([v, t]) => `<option value="${v}"${v === 100 ? ' selected' : ''}>${esc(t())}</option>`).join('')}</select></label></div>
        <p class="pl-hint">${esc(L('Les prix se recalculent une fois, maintenant. Ensuite chaque prix se modifie à la main, ou se recalcule depuis l’écran du tarif.', 'Prices are worked out once, now. Afterwards each price can be edited by hand, or recalculated from the list screen.', 'تُحسب الأثمان مرة واحدة، الآن. بعد ذلك يمكن تعديل كل ثمن يدوياً، أو إعادة حسابه من شاشة التسعيرة.'))}</p></div>`,
      foot: `<button class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button class="kb atlas" data-pl-create>${esc(L('Créer le tarif', 'Create the list', 'إنشاء التسعيرة'))}</button>`,
    });
    if (!m || !m.el) return;
    m.el.addEventListener('click', async (e) => {
      const go = e.target.closest('[data-pl-create]');
      if (!go) return;
      const f = (s) => m.el.querySelector(s);
      const spec = {
        name: f('[data-n]').value.trim(), base: f('[data-b]').value,
        channels: CHANNELS.map(([id]) => id).filter((id) => f(`[data-c="${id}"]`).checked),
        pct: Number(String(f('[data-p]').value || '0').replace(',', '.')) || 0, step: Number(f('[data-s]').value) || 0,
      };
      if (!spec.name) { failToast({ code: 'name-required' }); return; }
      go.disabled = true;
      try {
        const out = await API().create(spec);
        try { m.close(); } catch (_) {}
        toast(L('Tarif créé', 'Price list created', 'تم إنشاء التسعيرة'), { type: 'success', desc: out.seeded ? L(`${out.seeded} prix calculés.`, `${out.seeded} prices worked out.`, `تم حساب ${out.seeded} ثمن.`) : '' });
        await loadLists();
        await openList(out.id);
      } catch (err) { go.disabled = false; failToast(err); }
    });
  };

  handlers['pl-rename-main'] = async () => {
    const cur = nm(state.lists.find((l) => l.isMain));
    const name = window.prompt(L('Nom du tarif principal', 'Main price list name', 'اسم التسعيرة الأساسية'), cur);
    if (name == null || !name.trim()) return;
    try { await API().update('main', { name: name.trim() }); await loadLists(); render(); } catch (e) { failToast(e); }
  };

  handlers['pl-save-meta'] = async (el, arg) => {
    const id = argOf(el, arg);
    const page = document.querySelector('[data-pl-page]');
    if (!page) return;
    const patch = {
      name: page.querySelector('[data-pl-name]').value.trim(),
      channels: CHANNELS.map(([c]) => c).filter((c) => page.querySelector(`[data-pl-chan="${c}"]`).checked),
    };
    try {
      await API().update(id, patch);
      toast(L('Tarif enregistré', 'Price list saved', 'تم حفظ التسعيرة'), { type: 'success' });
      await loadLists(); render();
    } catch (e) { failToast(e); }
  };

  handlers['pl-save-prices'] = async (el, arg) => {
    const id = argOf(el, arg);
    if (state.invalid.size) { failToast({ code: 'bad-price' }); return; }
    const rows = Object.keys(state.draft).map((itemKey) => ({ itemKey, listId: id, price: state.draft[itemKey] }));
    if (!rows.length) return;
    /* 0 MAD : le patron confirme que l'article est offert ; sinon rien ne part. */
    const zero = rows.filter((r) => r.price === 0);
    if (zero.length) {
      if (!window.confirm(L(`${zero.length} article(s) à 0 MAD : les offrir dans ce tarif ?`, `${zero.length} item(s) at 0 MAD: give them away in this list?`, `${zero.length} سلعة بـ0 درهم: تقديمها مجاناً في هذه التسعيرة؟`))) return;
      zero.forEach((r) => { r.free = true; });
    }
    const btn = el && el.closest ? el : null;
    if (btn) btn.disabled = true;
    try {
      const out = await window.KiwiPriceLists.setPrices(rows);
      rows.forEach((r) => { if (r.price == null) state.prices.delete(r.itemKey); else state.prices.set(r.itemKey, r.price); });
      state.draft = {};
      toast(L('Prix enregistrés', 'Prices saved', 'تم حفظ الأثمان'), { type: 'success', desc: L(`${out.written} posés, ${out.removed} revenus au principal.`, `${out.written} set, ${out.removed} back to main.`, `${out.written} محدد، ${out.removed} رجع للأساسي.`) });
      render();
    } catch (e) { if (btn) btn.disabled = false; failToast(e); }
  };

  handlers['pl-derive'] = async (el, arg) => {
    const id = argOf(el, arg);
    const page = document.querySelector('[data-pl-page]');
    const pct = Number(String(page.querySelector('[data-pl-pct]').value || '0').replace(',', '.'));
    const step = Number(page.querySelector('[data-pl-step]').value) || 0;
    if (!Number.isFinite(pct)) return;
    /* D'abord l'effet, calculé par le serveur sans rien écrire ; ensuite seulement l'écriture. */
    let plan;
    try { plan = await API().derive(id, pct, step, undefined, true); } catch (e) { failToast(e); return; }
    const sign = `${pct >= 0 ? '+' : ''}${pct} %`;
    const samples = (plan.samples || []).map((x) => `<tr><td>${esc(x.name || x.itemKey)}</td><td class="n">${esc(mad(x.before))}</td><td class="n">${esc(mad(x.cents))}${x.belowCost ? marginHtml(x.cents, x.costCents) : ''}</td></tr>`).join('');
    const m = modal({
      title: L('Recalculer le tarif', 'Recalculate the list', 'إعادة حساب التسعيرة') + ' · ' + sign,
      body: `<div class="pl-plan">
        <p class="pl-sub">${esc(L(`${plan.changed} article(s) sur ${plan.total} changeraient de prix.`, `${plan.changed} of ${plan.total} item(s) would change price.`, `${plan.changed} من ${plan.total} سلعة سيتغير ثمنها.`))}</p>
        ${plan.belowCost ? `<p class="pl-sub"><span class="pl-under">${esc(L(`${plan.belowCost} passeraient sous leur prix d’achat.`, `${plan.belowCost} would fall below their cost.`, `${plan.belowCost} ستنزل تحت ثمن شرائها.`))}</span></p>` : `<p class="pl-sub">${esc(L('Aucun article ne passe sous son prix d’achat.', 'No item falls below its cost.', 'لا سلعة تنزل تحت ثمن شرائها.'))}</p>`}
        ${samples ? `<div class="pl-wrap"><table class="pl-table"><thead><tr><th>${esc(L('Article', 'Item', 'السلعة'))}</th><th class="n">${esc(L('Avant', 'Before', 'قبل'))}</th><th class="n">${esc(L('Après', 'After', 'بعد'))}</th></tr></thead><tbody>${samples}</tbody></table></div>` : ''}
        <p class="pl-hint">${esc(L('Les prix posés à la main dans ce tarif seront remplacés.', 'Prices set by hand in this list will be replaced.', 'الأثمان المحددة يدوياً في هذه التسعيرة سيتم استبدالها.'))}</p></div>`,
      foot: `<button class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button class="kb atlas" data-pl-derive-go${plan.changed ? '' : ' disabled'}>${esc(L(`Appliquer à ${plan.changed} article(s)`, `Apply to ${plan.changed} item(s)`, `تطبيق على ${plan.changed} سلعة`))}</button>`,
    });
    if (!m || !m.el) return;
    m.el.addEventListener('click', async (e) => {
      const go = e.target.closest('[data-pl-derive-go]');
      if (!go) return;
      go.disabled = true;
      try {
        const out = await API().derive(id, pct, step);
        try { m.close(); } catch (_) {}
        toast(L('Tarif recalculé', 'List recalculated', 'تمت إعادة حساب التسعيرة'), { type: 'success', desc: L(`${out.written} prix.`, `${out.written} prices.`, `${out.written} ثمن.`) });
        await loadLists(); await openList(id);
      } catch (err) { go.disabled = false; failToast(err); }
    });
  };

  handlers['pl-remove'] = (el, arg) => {
    const id = argOf(el, arg);
    const l = state.lists.find((x) => x.id === id);
    if (!l) return;
    const others = state.lists.filter((x) => x.id !== id);
    const m = modal({
      title: L('Retirer le tarif', 'Remove the price list', 'حذف التسعيرة') + ' · ' + nm(l),
      body: `<div class="pl-form"><p class="pl-sub">${esc(L('Les clients de ce tarif passent au tarif de remplacement. Les ventes, factures et devis passés gardent leur tarif : le tarif est alors archivé, pas effacé.', 'Customers on this list move to the replacement. Past sales, invoices and quotes keep their list: the list is then archived, not erased.', 'زبناء هذه التسعيرة ينتقلون إلى التسعيرة البديلة. المبيعات والفواتير وعروض الأثمان السابقة تحتفظ بتسعيرتها: تُؤرشف التسعيرة ولا تُحذف.'))}</p>
        <label>${esc(L('Remplacer par', 'Replace with', 'استبدال بـ'))}<select data-r>${others.map((x) => `<option value="${esc(x.id)}">${esc(nm(x))}</option>`).join('')}</select></label></div>`,
      foot: `<button class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button class="kb atlas" data-pl-confirm>${esc(L('Retirer', 'Remove', 'حذف'))}</button>`,
    });
    if (!m || !m.el) return;
    m.el.addEventListener('click', async (e) => {
      const go = e.target.closest('[data-pl-confirm]');
      if (!go) return;
      go.disabled = true;
      try {
        const out = await API().remove(id, m.el.querySelector('[data-r]').value);
        try { m.close(); } catch (_) {}
        toast(out.archived ? L('Tarif archivé', 'Price list archived', 'تمت أرشفة التسعيرة') : L('Tarif retiré', 'Price list removed', 'تم حذف التسعيرة'), { type: 'success' });
        state.open = null; state.draft = {};
        await loadLists(); render();
      } catch (err) { go.disabled = false; failToast(err); }
    });
  };

  handlers['pl-item'] = async (el, arg) => {
    const id = argOf(el, arg);
    try { state.itemData = await API().itemPrices(id); state.query = ''; render(); } catch (e) { failToast(e); }
  };

  handlers['pl-client-add'] = async (el, arg) => {
    const clientId = argOf(el, arg);
    const sel = document.querySelector('[data-pl-client-list]');
    if (!sel) return;
    try {
      await API().assignClient(clientId, sel.value);
      state.clientQuery = '';
      await loadClients(); await loadLists(); render();
      toast(L('Tarif attribué', 'Price list assigned', 'تم ربط التسعيرة'), { type: 'success', desc: L('Il s’appliquera tout seul à la caisse et sur ses factures.', 'It will apply automatically at the till and on invoices.', 'ستُطبّق تلقائياً في الصندوق وفي الفواتير.') });
    } catch (e) { failToast(e); }
  };
  handlers['pl-client-del'] = async (el, arg) => {
    const clientId = argOf(el, arg);
    try { await API().assignClient(clientId, null); await loadClients(); await loadLists(); render(); } catch (e) { failToast(e); }
  };
})();
