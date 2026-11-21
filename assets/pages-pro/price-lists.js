/* Tableau de bord · TARIFS (listes de prix).
 *
 * Un même article peut se vendre à plusieurs prix : au détail (le prix du
 * catalogue, le tarif principal), en gros / jomla, en ligne, sur une facture,
 * sur une appli de livraison. Cet écran crée les tarifs, les lie à leurs
 * canaux, les remplit (« -10 % depuis le principal, arrondi au dirham »),
 * attache des fiches clients à un tarif (le grossiste paie le prix de gros
 * sans que la caissière y pense) et montre, article par article, tous ses prix.
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
  const toCents = (raw) => {
    const s = String(raw == null ? '' : raw).replace(/\s/g, '').replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= 1e7 ? Math.round(n * 100) : undefined;
  };
  const inputMad = (cents) => (cents == null ? '' : String(cents / 100).replace('.', ','));
  const API = () => window.KiwiPriceListsApi;
  const CAT = () => window.KiwiBoutiqueCatalog || null;
  const BOOK = () => window.KiwiClients || null;

  const CHANNELS = [
    ['till', () => L('Caisse', 'Till', 'الصندوق')],
    ['online', () => L('En ligne', 'Online', 'المتجر الإلكتروني')],
    ['invoices', () => L('Factures et devis', 'Invoices and quotes', 'الفواتير وعروض الأثمان')],
    ['delivery', () => L('Livraison', 'Delivery apps', 'تطبيقات التوصيل')],
  ];
  const STEPS = [[0, () => L('Sans arrondi', 'No rounding', 'بلا تقريب')], [50, () => '0,50 MAD'], [100, () => '1 MAD'], [500, () => '5 MAD']];
  const TABS = ['lists', 'items', 'clients'];

  const state = { tab: 'lists', lists: [], loaded: false, error: '', open: null, prices: null, draft: {}, query: '', item: '', itemData: null, clients: [], clientQuery: '' };

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
    const s = document.createElement('style');
    s.id = 'pl-css';
    s.textContent = `
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
.pl-row2{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}
.pl-hint{font-size:12.5px;color:var(--ink-3,#5d6662);line-height:1.45}
.pl-table{width:100%;border-collapse:collapse;font-size:14px}
.pl-table th{font-size:12px;font-weight:500;color:var(--ink-3,#5d6662);text-align:start;padding:8px;border-bottom:1px solid var(--line,rgba(10,15,13,.12))}
.pl-table td{padding:7px 8px;border-bottom:1px solid var(--line,rgba(10,15,13,.06));vertical-align:middle}
.pl-table td.n{font-variant-numeric:tabular-nums;text-align:end;white-space:nowrap}
.pl-table input{width:110px;font:inherit;font-size:14px;text-align:end;padding:6px 8px;border-radius:8px;border:1px solid var(--line,rgba(10,15,13,.16));background:#FDFCF9;font-variant-numeric:tabular-nums}
.pl-table input.dirty{border-color:var(--atlas,#0B6E4F);box-shadow:0 0 0 2px rgba(11,110,79,.15)}
.pl-table .pl-fb{font-size:12px;color:var(--ink-3,#5d6662)}
.pl-wrap{overflow-x:auto;border:1px solid var(--line,rgba(10,15,13,.12));border-radius:14px;background:var(--paper,#F7F5F0)}
.pl-empty{padding:28px;text-align:center;color:var(--ink-3,#5d6662);font-size:14px}
.pl-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pl-head h2{margin:0;font-size:20px;font-weight:600}
@media(max-width:640px){.pl-table input{width:84px}}
`;
    document.head.appendChild(s);
  }

  const chanLabel = (k) => (CHANNELS.find(([id]) => id === k) || [k, () => k])[1]();
  const products = () => {
    const C = CAT();
    try { return C ? C.listProducts().filter((p) => p && !p.archived) : []; } catch (_) { return []; }
  };
  const listName = (id) => (state.lists.find((l) => l.id === id) || {}).name || '';

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
      <h3>${ic('sell')}${esc(l.name)}${l.shared ? ` <span class="pl-pill off">${esc(L('partagé', 'shared', 'مشترك'))}</span>` : ''}</h3>
      <div class="pl-pills">${pills}</div>
      <div class="pl-stats">${stats}</div>
      <div class="pl-acts">${l.isMain
        ? `<button class="kb ghost" data-action="pl-rename-main">${esc(L('Renommer', 'Rename', 'إعادة التسمية'))}</button>`
        : (l.shared ? '' : `<button class="kb atlas" data-action="pl-open" data-arg="${esc(l.id)}">${esc(L('Ouvrir', 'Open', 'فتح'))}</button>`)}</div>
    </article>`;
  }

  function listsBody() {
    if (!state.loaded) return `<p class="pl-sub">${esc(L('Chargement des tarifs…', 'Loading price lists…', 'جارٍ تحميل التسعيرات…'))}</p>`;
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
        : `<table class="pl-table"><thead><tr><th>${esc(L('Article', 'Item', 'السلعة'))}</th><th class="n">${esc(L('Prix principal', 'Main price', 'الثمن الأساسي'))}</th><th class="n">${esc(l.name)}</th></tr></thead><tbody>${rows.map((p) => {
          const main = Math.round((+p.priceMAD || 0) * 100);
          const own = Object.prototype.hasOwnProperty.call(state.draft, p.id) ? state.draft[p.id] : priced.get(p.id);
          const dirty = Object.prototype.hasOwnProperty.call(state.draft, p.id);
          return `<tr><td>${esc(p.name)}</td><td class="n">${esc(mad(main))}</td><td class="n"><input inputmode="decimal" data-pl-price="${esc(p.id)}" class="${dirty ? 'dirty' : ''}" value="${esc(inputMad(own))}" placeholder="${esc(inputMad(main))}" aria-label="${esc(l.name + ' · ' + p.name)}">${own == null ? `<div class="pl-fb">${esc(L('principal', 'main', 'أساسي'))}</div>` : ''}</td></tr>`;
        }).join('')}</tbody></table>`;
    const checks = CHANNELS.map(([id, label]) => `<label><input type="checkbox" data-pl-chan="${id}"${l.channels.includes(id) ? ' checked' : ''}> ${esc(label())}</label>`).join('');
    const compareOpts = [['', L('Aucun', 'None', 'بلا')], ...state.lists.filter((x) => x.id !== l.id).map((x) => [x.id, x.name])]
      .map(([id, n]) => `<option value="${esc(id)}"${(l.compareListId || '') === id ? ' selected' : ''}>${esc(n)}</option>`).join('');
    const dirtyN = Object.keys(state.draft).length;
    return `<div class="pl-head"><button class="kb ghost" data-action="pl-back">${ic('back')}${esc(L('Tous les tarifs', 'All price lists', 'كل التسعيرات'))}</button><h2>${esc(l.name)}</h2></div>
      <div class="pl-card pl-form">
        <div class="pl-row2"><label>${esc(L('Nom', 'Name', 'الاسم'))}<input type="text" data-pl-name maxlength="60" value="${esc(l.name)}"></label>
        <label>${esc(L('Prix barré en ligne (« avant »)', 'Online compare-at price (“before”)', 'الثمن المشطوب في المتجر («قبل»)'))}<select data-pl-compare>${compareOpts}</select></label></div>
        <div><div class="pl-hint">${esc(L('Où ce tarif s’applique', 'Where this list applies', 'أين تُطبّق هذه التسعيرة'))}</div><div class="pl-checks">${checks}</div></div>
        <div class="pl-acts"><button class="kb atlas" data-action="pl-save-meta" data-arg="${esc(l.id)}">${esc(L('Enregistrer', 'Save', 'حفظ'))}</button>
        <button class="kb ghost" data-action="pl-remove" data-arg="${esc(l.id)}">${ic('del')}${esc(L('Retirer ce tarif', 'Remove this list', 'حذف هذه التسعيرة'))}</button></div>
      </div>
      <div class="pl-card pl-form">
        <h3>${esc(L('Recalculer depuis le prix principal', 'Recalculate from the main price', 'إعادة الحساب من الثمن الأساسي'))}</h3>
        <div class="pl-row2"><label>${esc(L('Variation (%)', 'Change (%)', 'التغيير (%)'))}<input type="number" step="0.5" data-pl-pct value="-10"></label>
        <label>${esc(L('Arrondi', 'Rounding', 'التقريب'))}<select data-pl-step>${STEPS.map(([v, t]) => `<option value="${v}"${v === 100 ? ' selected' : ''}>${esc(t())}</option>`).join('')}</select></label></div>
        <p class="pl-hint" data-pl-example></p>
        <div class="pl-acts"><button class="kb ghost" data-action="pl-derive" data-arg="${esc(l.id)}">${esc(L('Appliquer à tout le tarif', 'Apply to the whole list', 'تطبيق على كل التسعيرة'))}</button></div>
      </div>
      <div class="pl-bar"><input class="pl-search" type="search" data-pl-search placeholder="${esc(L('Chercher un article', 'Search an item', 'ابحث عن سلعة'))}" value="${esc(state.query)}">
        <div class="pl-acts"><span class="pl-hint">${esc(L('Vide = prix principal', 'Empty = main price', 'فارغ = الثمن الأساسي'))}</span>
        <button class="kb atlas" data-action="pl-save-prices" data-arg="${esc(l.id)}"${dirtyN ? '' : ' disabled'}>${esc(dirtyN ? L(`Enregistrer ${dirtyN} prix`, `Save ${dirtyN} prices`, `حفظ ${dirtyN} ثمن`) : L('Aucun changement', 'No changes', 'لا تغيير'))}</button></div></div>
      <div class="pl-wrap">${body}</div>`;
  }

  function itemsBody() {
    const prods = products();
    const q = state.query.trim().toLowerCase();
    const hits = q ? prods.filter((p) => String(p.name || '').toLowerCase().includes(q)).slice(0, 12) : [];
    const pick = hits.map((p) => `<button class="kb ghost" data-action="pl-item" data-arg="${esc(p.id)}">${esc(p.name)}</button>`).join('');
    const d = state.itemData;
    const table = d ? `<div class="pl-wrap"><table class="pl-table"><thead><tr><th>${esc(L('Tarif', 'Price list', 'التسعيرة'))}</th><th>${esc(L('Canaux', 'Channels', 'القنوات'))}</th><th class="n">${esc(L('Prix', 'Price', 'الثمن'))}</th></tr></thead><tbody>${d.lists.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.isMain ? '' : (x.channels || []).map((c) => `<span class="pl-pill">${esc(chanLabel(c))}</span>`).join(' ')}</td><td class="n">${esc(mad(x.cents))}${!x.isMain && x.source === 'main' ? `<div class="pl-fb">${esc(L('repli sur le principal', 'falls back to main', 'يرجع للأساسي'))}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
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
    const sel = `<select data-pl-client-list>${choices.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select>`;
    return `<p class="pl-sub">${esc(L('Un client attaché à un tarif le reçoit tout seul : à la caisse dès qu’on l’ajoute au ticket, et sur ses factures.', 'A customer attached to a list gets it automatically: at the till as soon as they are added to the ticket, and on their invoices.', 'الزبون المرتبط بتسعيرة يحصل عليها تلقائياً: في الصندوق بمجرد إضافته إلى التذكرة، وفي فواتيره.'))}</p>
      <div class="pl-card pl-form"><div class="pl-row2"><label>${esc(L('Client', 'Customer', 'الزبون'))}<input type="text" data-pl-client-q value="${esc(state.clientQuery)}" placeholder="${esc(L('Nom ou téléphone', 'Name or phone', 'الاسم أو الهاتف'))}"></label><label>${esc(L('Tarif', 'Price list', 'التسعيرة'))}${sel}</label></div>
      ${hits.length ? `<div class="pl-acts">${hits.map((c) => `<button class="kb ghost" data-action="pl-client-add" data-arg="${esc(c.id)}">${ic('add')}${esc(c.name || c.phone || c.id)}</button>`).join('')}</div>` : (q ? `<p class="pl-hint">${esc(L('Aucune fiche ne correspond dans le carnet.', 'No record matches in the customer book.', 'لا توجد بطاقة مطابقة في الدفتر.'))}</p>` : '')}</div>
      <div class="pl-wrap">${rows ? `<table class="pl-table"><thead><tr><th>${esc(L('Client', 'Customer', 'الزبون'))}</th><th>${esc(L('Téléphone', 'Phone', 'الهاتف'))}</th><th>${esc(L('Tarif', 'Price list', 'التسعيرة'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="pl-empty">${esc(L('Aucun client n’a encore de tarif.', 'No customer has a price list yet.', 'لا يوجد زبون له تسعيرة بعد.'))}</div>`}</div>`;
  }

  function render() {
    css();
    const tab = (key, label) => `<button type="button" data-lens-item class="${state.tab === key ? 'on' : ''}" data-action="pl-tab" data-arg="${key}" aria-pressed="${state.tab === key}">${esc(label)}</button>`;
    const main = state.tab === 'items' ? itemsBody() : state.tab === 'clients' ? clientsBody() : (state.open ? detailBody() : listsBody());
    window.Kiwi.appPage('pricelists', {
      title: L('Tarifs', 'Price lists', 'التسعيرات'),
      subtitle: L('Détail, gros, en ligne, factures : un prix par canal et par client', 'Retail, wholesale, online, invoices: one price per channel and per customer', 'التقسيط، الجملة، المتجر، الفواتير: ثمن لكل قناة ولكل زبون'),
      body: `<div class="pl-page" data-pl-page>
        <div class="pl-bar"><div class="pl-seg" data-lens-demo>${tab('lists', L('Tarifs', 'Lists', 'التسعيرات'))}${tab('items', L('Par article', 'By item', 'حسب السلعة'))}${tab('clients', L('Clients', 'Customers', 'الزبناء'))}</div>
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
      if (v === undefined) { inp.setAttribute('aria-invalid', 'true'); return; }
      inp.removeAttribute('aria-invalid');
      const was = (state.prices || new Map()).get(id);
      if ((v == null && was == null) || v === was) delete state.draft[id]; else state.draft[id] = v;
      inp.classList.toggle('dirty', Object.prototype.hasOwnProperty.call(state.draft, id));
      const btn = page.querySelector('[data-action="pl-save-prices"]');
      const n = Object.keys(state.draft).length;
      if (btn) { btn.disabled = !n; btn.textContent = n ? L(`Enregistrer ${n} prix`, `Save ${n} prices`, `حفظ ${n} ثمن`) : L('Aucun changement', 'No changes', 'لا تغيير'); }
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
      const raw = Math.round(10000 * (10000 + Math.round(p * 100)) / 10000);
      const out = s > 0 ? Math.round(raw / s) * s : raw;
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
    })[code] || L('Impossible pour le moment. Rien n’a été enregistré.', 'Not possible right now. Nothing was saved.', 'غير ممكن حالياً. لم يُحفظ شيء.');
  }
  const failToast = (e) => toast(errorText(e && e.code), { type: 'error' });

  async function openList(id) {
    state.open = id; state.draft = {}; state.query = ''; state.prices = null;
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
    await loadLists();
    render();
  };
  handlers['pl-tab'] = async (el, arg) => {
    const k = argOf(el, arg);
    if (Object.keys(state.draft).length && !window.confirm(L('Quitter sans enregistrer les prix ?', 'Leave without saving the prices?', 'المغادرة دون حفظ الأثمان؟'))) return;
    state.tab = TABS.includes(k) ? k : 'lists'; state.open = null; state.draft = {}; state.query = ''; state.itemData = null;
    if (state.tab === 'clients') { render(); await loadClients(); }
    render();
  };
  handlers['pl-open'] = (el, arg) => openList(argOf(el, arg));
  handlers['pl-back'] = () => {
    if (Object.keys(state.draft).length && !window.confirm(L('Quitter sans enregistrer les prix ?', 'Leave without saving the prices?', 'المغادرة دون حفظ الأثمان؟'))) return;
    state.open = null; state.draft = {}; state.query = '';
    render();
  };

  handlers['pl-new'] = () => {
    const bases = [['main', L('Le prix principal', 'The main price', 'الثمن الأساسي')], ['empty', L('Vide (tout reste au principal)', 'Empty (everything stays at main)', 'فارغة (كل شيء يبقى بالأساسي)')],
      ...state.lists.filter((l) => !l.isMain).map((l) => [l.id, L('Copie de ', 'Copy of ', 'نسخة من ') + l.name])];
    const m = modal({
      title: L('Nouveau tarif', 'New price list', 'تسعيرة جديدة'),
      body: `<div class="pl-form">
        <label>${esc(L('Nom', 'Name', 'الاسم'))}<input type="text" data-n maxlength="60" placeholder="${esc(L('Gros, Revendeurs, En ligne…', 'Wholesale, Resellers, Online…', 'الجملة، البائعون، المتجر…'))}"></label>
        <div><div class="pl-hint">${esc(L('Où il s’applique', 'Where it applies', 'أين تُطبّق'))}</div><div class="pl-checks">${CHANNELS.map(([id, t]) => `<label><input type="checkbox" data-c="${id}"${id === 'till' ? ' checked' : ''}> ${esc(t())}</label>`).join('')}</div></div>
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
      if (!spec.name) { toast(errorText('name-required'), { type: 'error' }); return; }
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
    const cur = (state.lists.find((l) => l.isMain) || {}).name || '';
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
      compareListId: page.querySelector('[data-pl-compare]').value || null,
    };
    try {
      await API().update(id, patch);
      toast(L('Tarif enregistré', 'Price list saved', 'تم حفظ التسعيرة'), { type: 'success' });
      await loadLists(); render();
    } catch (e) { failToast(e); }
  };

  handlers['pl-save-prices'] = async (el, arg) => {
    const id = argOf(el, arg);
    const rows = Object.keys(state.draft).map((itemKey) => ({ itemKey, listId: id, price: state.draft[itemKey] }));
    if (!rows.length) return;
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
    if (!window.confirm(L(`Remplacer tous les prix de ce tarif par le principal ${pct >= 0 ? '+' : ''}${pct} % ?`, `Replace every price in this list with main ${pct >= 0 ? '+' : ''}${pct} %?`, `استبدال كل أثمان هذه التسعيرة بالأساسي ${pct >= 0 ? '+' : ''}${pct}٪؟`))) return;
    try {
      const out = await API().derive(id, pct, step);
      toast(L('Tarif recalculé', 'List recalculated', 'تمت إعادة حساب التسعيرة'), { type: 'success', desc: L(`${out.written} prix.`, `${out.written} prices.`, `${out.written} ثمن.`) });
      await loadLists(); await openList(id);
    } catch (e) { failToast(e); }
  };

  handlers['pl-remove'] = (el, arg) => {
    const id = argOf(el, arg);
    const l = state.lists.find((x) => x.id === id);
    if (!l) return;
    const others = state.lists.filter((x) => x.id !== id);
    const m = modal({
      title: L('Retirer le tarif', 'Remove the price list', 'حذف التسعيرة') + ' · ' + l.name,
      body: `<div class="pl-form"><p class="pl-sub">${esc(L('Les clients de ce tarif et le prix barré en ligne passent au tarif de remplacement. Les ventes passées gardent leur tarif.', 'Customers on this list and the online compare-at price move to the replacement. Past sales keep their list.', 'زبناء هذه التسعيرة والثمن المشطوب ينتقلون إلى التسعيرة البديلة. المبيعات السابقة تحتفظ بتسعيرتها.'))}</p>
        <label>${esc(L('Remplacer par', 'Replace with', 'استبدال بـ'))}<select data-r>${others.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label></div>`,
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
