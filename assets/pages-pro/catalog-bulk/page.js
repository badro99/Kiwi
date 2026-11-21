/* Kiwi · the catalogue spreadsheet page (lazy, assets/pages-pro.js LAZY_SECTIONS)
 *
 * One screen for the boutique inventory and the restaurant carte: every
 * article on a row, edited like a spreadsheet (assets/pages-pro/catalog-bulk/grid.js),
 * saved in ONE call that carries only what changed (assets/pages-pro/catalog-bulk/
 * source.js → POST /api/catalog/batch). Around it:
 *   · a selection drawer: set one field on N rows, showing the common value
 *     or « valeurs mixtes »;
 *   · the bulk re-price (assets/pages-pro/catalog-bulk/reprice.js), which replaced the
 *     old « Édition groupée » modal whose Apply only showed a toast;
 *   · Excel import and export (assets/pages-pro/catalog-bulk/import.js, xlsx.js), CSV
 *     export kept;
 *   · « Annuler le dernier enregistrement »: the last save, put back through
 *     the same route.
 * Reached from « Tableur » on the inventory and on the carte, and from
 * `menu-mass`.
 */
(() => {
  'use strict';
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const handlers = window.Kiwi.handlers;
  const toast = (t, o) => window.Kiwi.toast(t, Object.assign({ force: true }, o || {}));
  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  const L = (fr, en, ar) => { const l = lang(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const R = () => window.KiwiBulkRules;
  const fmtNum = (n, d) => (window.KiwiNumber && window.KiwiNumber.format)
    ? window.KiwiNumber.format(n, { minimumFractionDigits: d, maximumFractionDigits: d })
    : Number(n).toFixed(d);
  const plural = (n, one, many) => (n === 1 ? one : many).replace('{n}', fmtNum(n, 0));

  const MSG = {
    required: () => L('Obligatoire', 'Required', 'ضروري'),
    'not-a-number': () => L('Doit être un nombre', 'Must be a number', 'خاصو يكون رقم'),
    negative: () => L('Ne peut pas être négatif', 'Cannot be negative', 'ما يمكنش يكون ناقص من صفر'),
    'too-high': () => L('Valeur trop grande', 'Value too large', 'القيمة كبيرة بزاف'),
    'too-long': () => L('Texte trop long', 'Text too long', 'النص طويل بزاف'),
    'not-whole': () => L('Nombre entier attendu', 'Whole number expected', 'خاص رقم صحيح'),
    'unknown-category': () => L('Catégorie inconnue', 'Unknown category', 'فئة ما كايناش'),
    'yes-no': () => L('Oui ou Non', 'Yes or No', 'نعم ولا لا'),
    duplicate: () => L('Déjà utilisé par un autre article', 'Already used by another item', 'مستعمل فمنتج آخر'),
    'multi-variant': () => L('Plusieurs déclinaisons : à modifier dans la fiche', 'Several variants: edit it in the item sheet', 'بزاف ديال الأنواع: بدّلو من بطاقة المنتج'),
    'bad-barcode': () => L('Pas d’espace dans un code-barres', 'No spaces in a barcode', 'الباركود ما فيهش فراغات'),
    'not-found': () => L('Article introuvable, rechargez la page', 'Item not found, reload the page', 'المنتج ما كاينش، عاود حمّل الصفحة'),
  };
  const message = (code) => (MSG[code] ? MSG[code]() : code);

  let S = null;   // the open sheet: { kind, data, grid, filter, query, cat, lastSave, busy }

  function css() {
    if (document.getElementById('cgp-css')) return;
    const s = document.createElement('style');
    s.id = 'cgp-css';
    s.textContent = `
.cgp{display:grid;gap:12px}
.cgp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cgp-bar .sp{flex:1}
.cgp-in{height:38px;border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:10px;padding:0 12px;font:inherit;font-size:13px;background:var(--paper-elev,#FDFCF9);color:var(--ink,#0A0F0D);min-width:0}
.cgp-search{width:220px}
.cgp-seg{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:var(--n-100,rgba(10,15,13,.05))}
.cgp-seg button{border:0;background:transparent;font:inherit;font-weight:600;font-size:12.5px;padding:6px 12px;border-radius:999px;color:var(--n-600,#4a5550);cursor:pointer;min-height:30px}
.cgp-seg button.on{background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);box-shadow:0 1px 2px rgba(10,15,13,.12)}
.cgp-seg .n{margin-inline-start:6px;font-variant-numeric:tabular-nums;color:var(--n-500,#6b7570)}
.cgp-seg .n.bad{color:var(--danger,#C94A3A)}
.cgp-sel{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px 8px 14px;border-radius:12px;background:color-mix(in srgb,var(--atlas,#0B6E4F) 9%,transparent);font-size:13px}
.cgp-sel[hidden]{display:none}
.cgp-sel .t{font-weight:600;margin-inline-end:auto}
.cgp-foot{position:sticky;bottom:0;z-index:4;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;border-radius:14px;background:var(--paper-elev,#FDFCF9);border:1px solid var(--n-200,rgba(10,15,13,.12));box-shadow:0 -8px 24px -18px rgba(10,15,13,.35)}
.cgp-foot .st{margin-inline-end:auto;font-size:13px;color:var(--n-600,#4a5550)}
.cgp-foot .st b{font-weight:600;color:var(--ink,#0A0F0D)}
.cgp-foot .st .bad{color:var(--danger,#C94A3A)}
.cgp-keys{font-size:11.5px;color:var(--n-500,#6b7570)}
.cgp-keys kbd{font:inherit;font-family:var(--mono,monospace);font-size:11px;padding:1px 5px;border-radius:5px;border:1px solid var(--n-200,rgba(10,15,13,.12));background:var(--paper,#F7F5F0)}
.cgp-m{font-variant-numeric:tabular-nums}
.cgp-m.lo{color:var(--danger,#C94A3A)}
.cgp-m.hi{color:var(--atlas,#0B6E4F)}
.cgp-dr{display:grid;gap:14px}
.cgp-dr label{display:grid;gap:6px;font-size:12.5px;font-weight:600;color:var(--n-600,#4a5550)}
.cgp-dr .cgp-in{width:100%}
.cgp-dr .cgp-in.touched{border-color:var(--atlas,#0B6E4F);box-shadow:0 0 0 2px color-mix(in srgb,var(--atlas,#0B6E4F) 18%,transparent)}
.cgp-dr .hint{font-weight:400;color:var(--n-500,#6b7570)}
@media (max-width:760px){.cgp-search{width:100%}.cgp-keys{display:none}}
`;
    document.head.appendChild(s);
  }

  /* ── columns ──────────────────────────────────────────────────────────── */
  const catName = (id) => { const c = S && S.data.categories.find((x) => x.id === id); return c ? c.name : (id || ''); };
  const money = (v) => (typeof v === 'number' ? fmtNum(v, 2) : esc(v));
  const sepCopy = (v) => (typeof v === 'number' ? (lang() === 'en' ? String(v) : String(v).replace('.', ',')) : (v == null ? '' : String(v)));
  function columns(kind, lists) {
    const C = {
      name: { key: 'name', label: L('Nom', 'Name', 'الاسم'), width: 250, required: true, type: 'text' },
      sku: { key: 'sku', label: 'SKU', hint: L('Référence commune', 'Shared reference', 'المرجع المشترك'), width: 110, type: 'text' },
      barcode: { key: 'barcode', label: L('Code-barres', 'Barcode', 'الباركود'), width: 150, type: 'text', readOnly: (r) => r.multi,
        format: (v, r) => (r.multi ? `<span class="ph">${esc(plural(r.variants, L('{n} déclinaison', '{n} variant', '{n} نوع'), L('{n} déclinaisons', '{n} variants', '{n} أنواع')))}</span>` : esc(v)) },
      price: { key: 'price', label: L('Prix de vente', 'Selling price', 'ثمن البيع'), width: 120, num: true, required: true, type: 'money', format: money, copyText: sepCopy },
      cost: { key: 'cost', label: L('Prix d’achat', 'Cost', 'ثمن الشراء'), width: 115, num: true, type: 'money', format: money, copyText: sepCopy },
      margin: { key: 'margin', label: L('Marge', 'Margin', 'الهامش'), width: 90, num: true, readOnly: true, type: 'computed',
        format: (_v, _r, get) => { const m = R().margin(get('price'), get('cost')); return m == null ? '<span class="ph">·</span>' : `<span class="cgp-m ${m < 15 ? 'lo' : m >= 45 ? 'hi' : ''}">${fmtNum(m, 1)} %</span>`; },
        copyText: (_v, r) => { const m = R().margin(S.grid.value(r.id, 'price'), S.grid.value(r.id, 'cost')); return m == null ? '' : sepCopy(m); } },
      lowStock: { key: 'lowStock', label: L('Alerte stock bas', 'Low-stock alert', 'تنبيه نقص المخزون'), width: 130, num: true, type: 'int' },
      stock: { key: 'stock', label: L('En stock', 'In stock', 'فالمخزون'), width: 90, num: true, readOnly: true, type: 'computed' },
      category: { key: 'category', label: L('Catégorie', 'Category', 'الفئة'), width: 170, type: 'category',
        options: () => S.data.categories.map((c) => ({ value: c.id, label: c.name })),
        format: (v) => (v ? esc(catName(v)) : `<span class="ph">${esc(L('Sans catégorie', 'No category', 'بلا فئة'))}</span>`),
        editText: (v) => catName(v), copyText: (v) => catName(v) },
      sellable: { key: 'sellable', label: L('En vente', 'For sale', 'معروض للبيع'), width: 110, type: 'bool',
        format: (v) => (typeof v === 'boolean' ? `<span class="cbg-chip${v ? ' yes' : ''}">${esc(v ? L('Oui', 'Yes', 'نعم') : L('Non', 'No', 'لا'))}</span>` : esc(v)),
        copyText: (v) => (v === true ? L('Oui', 'Yes', 'نعم') : v === false ? L('Non', 'No', 'لا') : String(v || '')) },
    };
    const order = kind === 'boutique'
      ? ['name', 'sku', 'barcode', 'price', 'cost', 'margin', 'lowStock', 'stock', 'category', 'sellable']
      : ['name', 'price', 'category', 'sellable'];
    return order.map((k) => C[k]).concat((lists || []).map((l) => ({
      key: 'pl:' + l.id, label: L('Prix · ', 'Price · ', 'الثمن · ') + l.name, width: 140, num: true, type: 'list',
      format: (v) => (v == null || v === '' ? `<span class="ph">${esc(L('prix principal', 'main price', 'الثمن الأساسي'))}</span>` : money(v)), copyText: sepCopy,
    })));
  }

  /* What a typed or pasted string becomes in a cell. A value that does not
     parse stays as typed, so the cell can say what is wrong with it. */
  function parse(col, raw) {
    const s = raw == null ? '' : String(raw);
    if (col.type === 'money' || col.type === 'int' || col.type === 'list') {
      const n = R().parseNumber(s);
      if (n == null) return col.type === 'list' ? null : '';
      if (Number.isNaN(n)) return s.trim();
      return col.type === 'int' ? n : Math.round(n * 100) / 100;
    }
    if (col.type === 'bool') { const b = R().parseBool(s); return typeof b === 'boolean' ? b : s.trim(); }
    if (col.type === 'category') {
      const t = s.trim();
      if (!t) return null;
      const k = R().normKey(t);
      const c = S.data.categories.find((x) => x.id === t || R().normKey(x.name) === k);
      return c ? c.id : t;
    }
    return s.replace(/\r?\n/g, ' ').trim();
  }

  /* Uniqueness of SKU and barcode across the whole sheet, edits included,
     recounted after every change (2 000 rows: well under a millisecond). */
  let dupes = { sku: new Map(), barcode: new Map() };
  function recount() {
    const g = S.grid, d = { sku: new Map(), barcode: new Map() };
    S.data.rows.forEach((r) => {
      ['sku', 'barcode'].forEach((f) => {
        if (!S.data.fields.includes(f)) return;
        const v = g.value(r.id, f); if (!v) return;
        const k = f === 'sku' ? String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '') : String(v);
        if (k) d[f].set(k, (d[f].get(k) || 0) + 1);
      });
    });
    dupes = d;
  }
  function validate(row, key, v) {
    if (key === 'margin' || key === 'stock') return '';
    if (key.startsWith('pl:')) return v == null || v === '' || (typeof v === 'number' && v >= 0) ? '' : 'not-a-number';
    if (key === 'barcode' && row.multi) return '';
    const cats = new Set(S.data.categories.map((c) => c.id));
    const c = R().checkValue(S.kind, key, v, { categories: cats });
    if (c.error) return c.error;
    if ((key === 'sku' || key === 'barcode') && v) {
      const e = S.grid.edits()[row.id];
      if (e && key in e) {
        const k = key === 'sku' ? String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '') : String(v);
        if ((dupes[key].get(k) || 0) > 1) return 'duplicate';
      }
    }
    return '';
  }

  /* ── state of the sheet ───────────────────────────────────────────────── */
  function changes() {
    const g = S.grid, edits = g.edits();
    const fields = S.data.fields;
    const patches = R().diff(S.data.rows, edits, fields);
    const lists = [];
    Object.keys(edits).forEach((id) => Object.keys(edits[id]).forEach((k) => {
      if (k.startsWith('pl:')) lists.push({ listId: k.slice(3), itemId: id, price: edits[id][k] === '' ? null : edits[id][k] });
    }));
    let errors = 0; const bad = new Set();
    Object.keys(edits).forEach((id) => {
      const row = S.data.rows.find((r) => r.id === id); if (!row) return;
      Object.keys(edits[id]).forEach((k) => { if (validate(row, k, edits[id][k])) { errors++; bad.add(id); } });
    });
    return { patches, lists, errors, bad, rows: Object.keys(edits).length };
  }
  function status() {
    if (!S) return;
    recount();
    const c = changes();
    const host = document.querySelector('[data-cgp]'); if (!host) return;
    const st = host.querySelector('[data-cgp-st]');
    const total = S.data.rows.length;
    st.innerHTML = c.rows
      ? `<b>${esc(plural(c.rows, L('{n} article modifié', '{n} item changed', '{n} منتج تبدّل'), L('{n} articles modifiés', '{n} items changed', '{n} منتجات تبدّلات')))}</b>`
        + (c.errors ? ` · <span class="bad">${esc(plural(c.errors, L('{n} erreur', '{n} error', '{n} غلطة'), L('{n} erreurs', '{n} errors', '{n} أغلاط')))}</span>` : '')
      : esc(plural(total, L('{n} article · aucune modification', '{n} item · no changes', '{n} منتج · حتى تبديل'), L('{n} articles · aucune modification', '{n} items · no changes', '{n} منتجات · حتى تبديل')));
    const save = host.querySelector('[data-cgp-save]');
    save.disabled = !c.rows || S.busy;
    save.textContent = S.busy ? L('Enregistrement…', 'Saving…', 'كايتسجّل…') : c.rows ? L('Enregistrer ', 'Save ', 'سجّل ') + fmtNum(c.rows, 0) : L('Enregistrer', 'Save', 'سجّل');
    host.querySelector('[data-cgp-discard]').disabled = !c.rows || S.busy;
    host.querySelector('[data-cgp-undo]').hidden = !S.lastSave || S.busy;
    const seg = host.querySelector('[data-cgp-seg]');
    seg.querySelector('[data-n="changed"]').textContent = fmtNum(c.rows, 0);
    const nb = seg.querySelector('[data-n="errors"]'); nb.textContent = fmtNum(c.bad.size, 0); nb.classList.toggle('bad', c.bad.size > 0);
    if (S.filter !== 'all') applyFilter();
  }
  function applyFilter() {
    const g = S.grid, q = R().normKey(S.query || '');
    const edits = g.edits();
    let ids = S.data.rows.filter((r) => {
      if (S.cat && (S.cat === '__none' ? g.value(r.id, 'category') : g.value(r.id, 'category') !== S.cat)) return false;
      if (q && !R().normKey([g.value(r.id, 'name'), g.value(r.id, 'sku'), g.value(r.id, 'barcode')].join(' ')).includes(q)) return false;
      if (S.filter === 'changed' && !edits[r.id]) return false;
      if (S.filter === 'errors' && !(edits[r.id] && Object.keys(edits[r.id]).some((k) => validate(r, k, edits[r.id][k])))) return false;
      return true;
    }).map((r) => r.id);
    const same = S.shown && S.shown.length === ids.length && S.shown.every((x, i) => x === ids[i]);
    if (same) return;
    S.shown = ids;
    g.setFilter(S.filter === 'all' && !q && !S.cat ? null : ids);
  }
  function selection() {
    const ids = S.grid.checked();
    return ids.length ? ids : [];
  }
  function selBar(n) {
    const bar = document.querySelector('[data-cgp-sel]'); if (!bar) return;
    bar.hidden = !n;
    bar.querySelector('.t').textContent = plural(n, L('{n} article sélectionné', '{n} item selected', '{n} منتج مختار'), L('{n} articles sélectionnés', '{n} items selected', '{n} منتجات مختارة'));
  }

  /* ── open ─────────────────────────────────────────────────────────────── */
  function kindHere() {
    const KV = window.KiwiVenue;
    const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    const t = String(vd.subtype || vd.type || '').toLowerCase();
    if (/boutique|retail|mode|pret|shop|store|epicerie|concept/.test(t)) return 'boutique';
    if (t) return 'menu';
    return window.KiwiBoutiqueCatalog && !window.KiwiMenuStore ? 'boutique' : 'menu';
  }
  async function open(kind, then) {
    css();
    kind = kind === 'boutique' || kind === 'menu' ? kind : kindHere();
    if (S && S.grid) S.grid.destroy();
    const data = await window.KiwiBulkSource.load(kind);
    if (!data) { toast(L('Catalogue indisponible', 'Catalogue unavailable', 'الكتالوج ما متوفرش'), { type: 'error' }); return; }
    S = { kind, data, grid: null, filter: 'all', query: '', cat: '', lastSave: (S && S.kind === kind && S.lastSave) || null, busy: false, shown: null };
    const KV = window.KiwiVenue;
    const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    const where = data.cloud ? L('enregistré pour tous vos appareils', 'saved for all your devices', 'كايتسجّل لجميع الأجهزة ديالك')
      : L('sur cet appareil', 'on this device', 'فهاد الجهاز');
    const seg = (k, label, n) => `<button type="button" data-lens-item class="${k === 'all' ? 'on' : ''}" data-action="cg-filter" data-arg="${k}" aria-pressed="${k === 'all'}">${esc(label)}${n ? `<span class="n" data-n="${k}">0</span>` : ''}</button>`;
    const isB = kind === 'boutique';
    window.Kiwi.appPage(isB ? 'inventory' : 'menu', {
      title: L('Tableur du catalogue', 'Catalogue spreadsheet', 'جدول المنتجات'),
      subtitle: [vd.fullDisplay || vd.name || '', plural(data.rows.length, L('{n} article', '{n} item', '{n} منتج'), L('{n} articles', '{n} items', '{n} منتجات')), where].filter(Boolean).join(' · '),
      body: `<div class="cgp" data-cgp>
        <div class="cgp-bar">
          <button type="button" class="kb ghost" data-action="cg-back">${esc(isB ? L('Inventaire', 'Inventory', 'المخزون') : L('La carte', 'Menu', 'القائمة'))}</button>
          <input class="cgp-in cgp-search" type="search" data-cgp-q placeholder="${esc(L('Nom, SKU ou code-barres', 'Name, SKU or barcode', 'الاسم، SKU ولا الباركود'))}" aria-label="${esc(L('Rechercher', 'Search', 'قلّب'))}">
          <select class="cgp-in" data-cgp-cat aria-label="${esc(L('Catégorie', 'Category', 'الفئة'))}"><option value="">${esc(L('Toutes les catégories', 'All categories', 'جميع الفئات'))}</option>${data.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}<option value="__none">${esc(L('Sans catégorie', 'No category', 'بلا فئة'))}</option></select>
          <div class="cgp-seg" data-lens-demo data-cgp-seg role="group" aria-label="${esc(L('Afficher', 'Show', 'بيّن'))}">${seg('all', L('Tout', 'All', 'الكل'))}${seg('changed', L('Modifiés', 'Changed', 'المبدّلين'), true)}${seg('errors', L('Erreurs', 'Errors', 'الأغلاط'), true)}</div>
          <span class="sp"></span>
          <button type="button" class="kb ghost" data-activation=write data-action="cg-reprice">${esc(L('Ajuster les prix', 'Adjust prices', 'بدّل الأثمنة'))}</button>
          <button type="button" class="kb ghost" data-activation=write data-action="cg-import">${esc(L('Importer Excel', 'Import Excel', 'استورد Excel'))}</button>
          <button type="button" class="kb ghost" data-activation=money data-action="cg-export" data-arg="xlsx">${esc(L('Exporter Excel', 'Export Excel', 'صدّر Excel'))}</button>
          <button type="button" class="kb ghost" data-activation=money data-action="cg-export" data-arg="csv">CSV</button>
        </div>
        <div class="cgp-sel" data-cgp-sel hidden role="status"><span class="t"></span>
          <button type="button" class="kb atlas" data-activation=write data-action="cg-bulk-edit">${esc(L('Modifier la sélection', 'Edit selection', 'بدّل المختارين'))}</button>
          <button type="button" class="kb ghost" data-activation=write data-action="cg-reprice" data-arg="selection">${esc(L('Ajuster leurs prix', 'Adjust their prices', 'بدّل الأثمنة ديالهم'))}</button>
          <button type="button" class="kb ghost" data-action="cg-unselect">${esc(L('Désélectionner', 'Clear selection', 'لغي الاختيار'))}</button>
        </div>
        <div data-cgp-grid></div>
        <div class="cgp-foot">
          <span class="st" data-cgp-st aria-live="polite"></span>
          <span class="cgp-keys">${esc(L('Collez depuis Excel', 'Paste from Excel', 'لصق من Excel'))} <kbd>${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'} V</kbd> · ${esc(L('recopier vers le bas', 'fill down', 'نسخ للتحت'))} <kbd>${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'} D</kbd> · ${esc(L('annuler', 'undo', 'رجوع'))} <kbd>${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'} Z</kbd></span>
          <button type="button" class="kb ghost" data-action="cg-undo-save" data-cgp-undo hidden>${esc(L('Annuler le dernier enregistrement', 'Undo last save', 'رجّع آخر تسجيل'))}</button>
          <button type="button" class="kb ghost" data-action="cg-discard" data-cgp-discard>${esc(L('Tout annuler', 'Discard all', 'لغي كلشي'))}</button>
          <button type="button" class="kb atlas" data-activation=write data-action="cg-save" data-cgp-save>${esc(L('Enregistrer', 'Save', 'سجّل'))}</button>
        </div>
      </div>`,
    });
    const host = document.querySelector('[data-cgp]');
    S.grid = window.KiwiBulkGrid.create(host.querySelector('[data-cgp-grid]'), {
      columns: columns(kind, data.lists), rows: data.rows,
      label: L('Tableur du catalogue', 'Catalogue spreadsheet', 'جدول المنتجات'),
      emptyText: L('Aucun article ne correspond.', 'No item matches.', 'حتى منتج ما كايطابق.'),
      parse, validate, message, same: (k, a, b) => (k.startsWith('pl:') ? (a == null ? '' : a) === (b == null ? '' : b) : R().sameValue(k, a, b)),
      onChange: status, onSelect: selBar,
      onNotice(kind2, res) {
        if (kind2 === 'paste' && res) {
          const extra = [res.skipped ? plural(res.skipped, L('{n} cellule en lecture seule ignorée', '{n} read-only cell skipped', '{n} خانة للقراءة فقط تخطّات'), L('{n} cellules en lecture seule ignorées', '{n} read-only cells skipped', '{n} خانات للقراءة فقط تخطّات')) : '',
            res.cut ? plural(res.cut, L('{n} ligne au-delà de la fin', '{n} row past the end', '{n} سطر من بعد الآخر'), L('{n} lignes au-delà de la fin', '{n} rows past the end', '{n} سطور من بعد الآخر')) : ''].filter(Boolean).join(' · ');
          toast(plural(res.applied, L('{n} cellule collée', '{n} cell pasted', '{n} خانة تلصقات'), L('{n} cellules collées', '{n} cells pasted', '{n} خانات تلصقات')), { type: 'info', desc: extra, duration: 2400 });
        }
      },
    });
    host.querySelector('[data-cgp-q]').addEventListener('input', (e) => { S.query = e.target.value; applyFilter(); });
    host.querySelector('[data-cgp-cat]').addEventListener('change', (e) => { S.cat = e.target.value; applyFilter(); });
    host.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
    });
    status();
    S.grid.focus();
    if (then) then();
  }
  window.addEventListener('beforeunload', (e) => {
    if (S && S.grid && document.querySelector('[data-cgp]') && S.grid.dirtyCount()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ── save ─────────────────────────────────────────────────────────────── */
  async function save(override, opts) {
    if (!S || S.busy) return false;
    const c = override ? { patches: override, lists: [], errors: 0 } : changes();
    if (c.errors) {
      S.filter = 'errors'; markSeg(); applyFilter();
      toast(plural(c.errors, L('{n} cellule à corriger', '{n} cell to fix', '{n} خانة خاصها تصحيح'), L('{n} cellules à corriger', '{n} cells to fix', '{n} خانات خاصهم تصحيح')), { type: 'warn', desc: L('Survolez une cellule rouge pour voir pourquoi.', 'Hover a red cell to see why.', 'دوز على الخانة الحمرا باش تشوف علاش.') });
      return false;
    }
    if (!c.patches.length && !c.lists.length) return false;
    S.busy = true; status();
    const res = await window.KiwiBulkSource.save(S.kind, c.patches, c.lists);
    S.busy = false;
    if (res.ok) {
      S.lastSave = (opts && opts.isUndo) ? null : c.patches;
      const n = (res.updated || 0) + (c.lists.length ? new Set(c.lists.map((x) => x.itemId)).size : 0);
      toast(plural(n, L('{n} article mis à jour', '{n} item updated', 'تبدّل {n} منتج'), L('{n} articles mis à jour', '{n} items updated', 'تبدّلو {n} منتجات')), {
        type: 'success',
        desc: res.offline ? L('Hors ligne : gardé sur cet appareil, envoyé dès le retour du réseau.', 'Offline: kept on this device, sent when the network is back.', 'بلا أنترنيت: محفوظ فهاد الجهاز، غادي يتصيفط ملي يرجع الريزو.')
          : res.local ? L('Enregistré sur cet appareil.', 'Saved on this device.', 'تسجّل فهاد الجهاز.')
          : L('La caisse et la boutique en ligne voient déjà les nouvelles valeurs.', 'The till and online shop already see the new values.', 'الكاسة والمتجر الإلكتروني كايشوفو القيم الجداد دابا.'),
      });
      await reload();
      return true;
    }
    if (res.conflicts) {
      const flags = Object.create(null);
      res.conflicts.forEach((x) => {
        const row = S.data.rows.find((r) => r.id === x.id); if (!row) return;
        row[x.field] = x.current;
        (flags[x.id] = flags[x.id] || {})[x.field] = L('Modifié ailleurs entre-temps : ', 'Changed elsewhere meanwhile: ', 'تبدّل من بلاصة أخرى: ')
          + (x.field === 'category' ? catName(x.current) : String(x.current)) + L('. Enregistrez de nouveau pour garder votre valeur.', '. Save again to keep your value.', '. سجّل مرة أخرى باش تخلي القيمة ديالك.');
      });
      S.grid.reset(S.data.rows); S.grid.setFlags(flags);
      toast(L('Des valeurs ont changé ailleurs', 'Some values changed elsewhere', 'شي قيم تبدّلات من بلاصة أخرى'), { type: 'warn', desc: L('Rien n’a été écrit. Les cellules soulignées montrent la valeur actuelle.', 'Nothing was written. Underlined cells show the current value.', 'حتى حاجة ما تسجّلات. الخانات اللي تحتهم خط كايبيّنو القيمة الحالية.') });
      status();
      return false;
    }
    if (res.issues) {
      const flags = Object.create(null);
      res.issues.forEach((x) => { (flags[x.id] = flags[x.id] || {})[x.field || 'name'] = message(x.code); });
      S.grid.setFlags(flags);
      toast(L('Le serveur a refusé l’enregistrement', 'The server refused the save', 'السيرفر رفض التسجيل'), { type: 'error', desc: message(res.issues[0].code) });
      status();
      return false;
    }
    toast(res.error === 'unauthorized' ? L('Seul le propriétaire peut modifier en masse', 'Only the owner can bulk edit', 'غير مول المحل اللي يقدر يبدّل بالجملة')
      : L('Enregistrement impossible', 'Could not save', 'ما قدرناش نسجّلو'), { type: 'error', desc: L('Vos modifications restent à l’écran.', 'Your changes stay on screen.', 'التبديلات ديالك باقيين فالشاشة.') });
    status();
    return false;
  }
  async function reload() {
    const data = await window.KiwiBulkSource.load(S.kind);
    if (!data) return;
    S.data = data; S.shown = null;
    S.grid.reset(data.rows);
    applyFilter(); status();
  }
  function markSeg() {
    document.querySelectorAll('[data-cgp-seg] [data-action="cg-filter"]').forEach((b) => {
      const on = b.dataset.arg === S.filter; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
  }

  /* ── selection drawer ─────────────────────────────────────────────────── */
  function bulkEdit() {
    const ids = selection();
    if (!ids.length) { toast(L('Cochez d’abord des articles', 'Tick some items first', 'ختار شي منتجات أولا'), { type: 'info' }); return; }
    const cols = columns(S.kind, S.data.lists).filter((c) => ['price', 'cost', 'lowStock', 'category', 'sellable'].includes(c.key) || c.type === 'list');
    const mixed = L('Valeurs mixtes', 'Mixed values', 'قيم مختلفة');
    const field = (c) => {
      const vals = ids.map((id) => S.grid.value(id, c.key));
      const common = vals.every((v) => (c.type === 'money' || c.type === 'list' ? R().sameValue('price', v, vals[0]) : v === vals[0])) ? vals[0] : undefined;
      const isMixed = common === undefined;
      let input;
      if (c.type === 'category') {
        input = `<select class="cgp-in" data-f="${c.key}">${isMixed ? `<option value="" data-keep selected>${esc(mixed)}</option>` : ''}<option value="__none"${!isMixed && !common ? ' selected' : ''}>${esc(L('Sans catégorie', 'No category', 'بلا فئة'))}</option>${S.data.categories.map((x) => `<option value="${esc(x.id)}"${common === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
      } else if (c.type === 'bool') {
        input = `<select class="cgp-in" data-f="${c.key}">${isMixed ? `<option value="" data-keep selected>${esc(mixed)}</option>` : ''}<option value="1"${common === true ? ' selected' : ''}>${esc(L('Oui', 'Yes', 'نعم'))}</option><option value="0"${common === false ? ' selected' : ''}>${esc(L('Non', 'No', 'لا'))}</option></select>`;
      } else {
        const shown = isMixed || common == null ? '' : (typeof common === 'number' && c.type !== 'int' ? fmtNum(common, 2) : String(common));
        input = `<input class="cgp-in" data-f="${c.key}" inputmode="decimal" value="${esc(shown)}" placeholder="${esc(isMixed ? mixed : '')}">`;
      }
      return `<label>${esc(c.label)}${isMixed ? ` <span class="hint">${esc(mixed)}</span>` : ''}${input}</label>`;
    };
    const d = window.Kiwi.drawer({
      title: L('Modifier la sélection', 'Edit selection', 'بدّل المختارين'),
      subtitle: plural(ids.length, L('{n} article', '{n} item', '{n} منتج'), L('{n} articles', '{n} items', '{n} منتجات')) + ' · ' + L('seuls les champs touchés changent', 'only the fields you touch change', 'غير الخانات اللي بدّلتي اللي كايتبدّلو'),
      body: `<div class="cgp-dr">${cols.map(field).join('')}</div>`,
      foot: `<button type="button" class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'لغي'))}</button><button type="button" class="kb atlas" data-cgp-apply>${esc(L('Appliquer à la sélection', 'Apply to selection', 'طبّق على المختارين'))}</button>`,
    });
    const root = d && d.el ? d.el : document.querySelector('.kiwi-drawer-backdrop:last-of-type');
    if (!root) return;
    root.querySelectorAll('[data-f]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => el.classList.add('touched')));
    root.querySelector('[data-cgp-apply]').addEventListener('click', () => {
      const out = [];
      root.querySelectorAll('[data-f].touched').forEach((el) => {
        const col = cols.find((c) => c.key === el.dataset.f);
        if (el.tagName === 'SELECT' && el.selectedOptions[0] && el.selectedOptions[0].hasAttribute('data-keep')) return;
        let v = el.value;
        if (col.type === 'category') v = v === '__none' ? null : v;
        else if (col.type === 'bool') v = v === '1';
        else v = parse(col, v);
        ids.forEach((id) => out.push({ id, key: col.key, value: v }));
      });
      const n = out.length ? S.grid.setValues(out) : 0;
      if (d && d.close) d.close(); else root.remove();
      if (n) toast(L('Appliqué, pas encore enregistré', 'Applied, not saved yet', 'تطبّق، باقي ما تسجّلش'), { type: 'info', desc: L('Vérifiez les cellules en vert puis Enregistrer.', 'Check the green cells, then Save.', 'شوف الخانات الخضرا ومن بعد سجّل.') });
    });
  }

  /* ── export ───────────────────────────────────────────────────────────── */
  function sheetRows(withData) {
    const cols = columns(S.kind, S.data.lists).filter((c) => c.type !== 'computed');
    const head = ['ID Kiwi'].concat(cols.map((c) => c.label + (c.required ? '*' : '')));
    if (!withData) return { cols, rows: [head] };
    const g = S.grid;
    const rows = S.data.rows.map((r) => [r.id].concat(cols.map((c) => {
      const v = g.value(r.id, c.key);
      if (c.key === 'barcode' && r.multi) return '';
      if (c.type === 'category') return catName(v);
      if (c.type === 'bool') return v === true ? L('Oui', 'Yes', 'نعم') : v === false ? L('Non', 'No', 'لا') : String(v || '');
      return v == null ? '' : v;
    })));
    return { cols, rows: [head].concat(rows) };
  }
  function fileName(ext) {
    const KV = window.KiwiVenue;
    const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    const slug = String(vd.name || (S.kind === 'boutique' ? 'inventaire' : 'carte')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'catalogue';
    return `${S.kind === 'boutique' ? 'inventaire' : 'carte'}-${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  }
  function download(bytes, name, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  function exportFile(fmt) {
    if (fmt === 'csv' && S.kind === 'boutique' && window.KiwiBoutiqueCatalog && window.KiwiBoutiqueCatalog.exportCsv) {
      download('﻿' + window.KiwiBoutiqueCatalog.exportCsv(), fileName('csv'), 'text/csv;charset=utf-8');   // the same CSV as before, re-importable
      return;
    }
    const { rows } = sheetRows(true);
    if (fmt === 'csv') {
      const csv = rows.map((r) => r.map((c) => { const s = String(c == null ? '' : c); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
      download('﻿' + csv, fileName('csv'), 'text/csv;charset=utf-8');
      return;
    }
    download(window.KiwiXlsx.write(rows, { sheet: S.kind === 'boutique' ? L('Inventaire', 'Inventory', 'المخزون') : L('Carte', 'Menu', 'القائمة') }), fileName('xlsx'), XLSX_TYPE);
    toast(plural(rows.length - 1, L('{n} article exporté', '{n} item exported', 'تصدّر {n} منتج'), L('{n} articles exportés', '{n} items exported', 'تصدّرو {n} منتجات')), { type: 'success', desc: L('Corrigez dans Excel puis réimportez ce fichier : la colonne ID Kiwi retrouve chaque article.', 'Edit in Excel then re-import this file: the Kiwi ID column finds each item again.', 'صحّح فExcel ومن بعد رجّع استورد هاد الملف: عمود ID Kiwi كايلقى كل منتج.') });
  }

  /* ── context handed to the re-price and import tools ──────────────────── */
  function toolContext(scope) {
    const g = S.grid;
    const current = (id) => ({ id, name: g.value(id, 'name'), price: Number(g.value(id, 'price')) || 0, cost: Number(g.value(id, 'cost')) || 0, category: g.value(id, 'category') });
    return {
      kind: S.kind, L, esc, fmtNum, plural, message,
      categories: S.data.categories,
      hasCost: S.data.fields.includes('cost'),
      items: S.data.rows.map((r) => current(r.id)),
      selected: selection(), scope: scope || '',
      existing: S.data.rows.map((r) => ({ id: r.id, name: g.value(r.id, 'name'), sku: g.value(r.id, 'sku') || '', barcode: g.value(r.id, 'barcode') || '', price: g.value(r.id, 'price'), cost: g.value(r.id, 'cost'), lowStock: g.value(r.id, 'lowStock'), category: g.value(r.id, 'category'), sellable: g.value(r.id, 'sellable'), multi: !!r.multi })),
      template: () => window.KiwiXlsx.write(sheetRows(false).rows.concat([['', S.kind === 'boutique' ? L('Chemise en lin', 'Linen shirt', 'قميجة كتان') : L('Thé à la menthe', 'Mint tea', 'أتاي بالنعناع')].concat(sheetRows(false).cols.slice(1).map((c) => (c.key === 'price' ? 120 : c.key === 'cost' ? 60 : c.key === 'sellable' ? L('Oui', 'Yes', 'نعم') : c.key === 'lowStock' ? 2 : c.key === 'category' ? (S.data.categories[0] ? S.data.categories[0].name : '') : '')))]), { sheet: 'Kiwi' }),
      download: (bytes, name) => download(bytes, name, XLSX_TYPE),
      /* Re-price and import both end here: values into the sheet, then the
         one batch save. */
      put: (changes) => S.grid.setValues(changes),
      save: () => save(),
      reload,
    };
  }

  /* ── handlers ─────────────────────────────────────────────────────────── */
  const argOf = (el, arg) => (typeof el === 'string' ? el : arg != null ? arg : el && el.dataset ? el.dataset.arg : '');
  handlers['catalog-grid'] = (el, arg) => open(argOf(el, arg));
  /* The old « Édition groupée » of the carte: now the real re-price, on the
     real carte, through the batch save. */
  handlers['menu-mass'] = () => open('menu', () => window.KiwiBulkReprice.open(toolContext('')));
  handlers['cg-back'] = () => {
    if (S && S.grid && S.grid.dirtyCount() && !window.confirm(L('Quitter sans enregistrer vos modifications ?', 'Leave without saving your changes?', 'تخرج بلا ما تسجّل التبديلات؟'))) return;
    const k = S ? S.kind : 'menu';
    if (S && S.grid) S.grid.destroy();
    const h = handlers[k === 'boutique' ? 'nav-inventory' : 'nav-menu'];
    if (typeof h === 'function') h();
  };
  handlers['cg-filter'] = (el, arg) => { if (!S) return; const k = argOf(el, arg); S.filter = ['all', 'changed', 'errors'].includes(k) ? k : 'all'; markSeg(); S.shown = null; applyFilter(); };
  handlers['cg-save'] = () => save();
  handlers['cg-discard'] = () => {
    if (!S || !S.grid.dirtyCount()) return;
    if (!window.confirm(L('Annuler toutes les modifications non enregistrées ?', 'Discard all unsaved changes?', 'تلغي جميع التبديلات اللي ما تسجّلوش؟'))) return;
    S.grid.discard(); status();
  };
  handlers['cg-undo-save'] = async () => {
    if (!S || !S.lastSave) return;
    const back = S.lastSave.map((p) => ({ id: p.id, set: p.was, was: p.set }));
    if (await save(back, { isUndo: true })) toast(L('Dernier enregistrement annulé', 'Last save undone', 'آخر تسجيل ترجّع'), { type: 'success' });
  };
  handlers['cg-bulk-edit'] = () => { if (S) bulkEdit(); };
  handlers['cg-unselect'] = () => { if (S) S.grid.clearChecked(); };
  handlers['cg-reprice'] = (el, arg) => { if (S) window.KiwiBulkReprice.open(toolContext(argOf(el, arg))); };
  handlers['cg-import'] = () => { if (S) window.KiwiBulkImport.open(toolContext('')); };
  handlers['cg-export'] = (el, arg) => { if (S) exportFile(argOf(el, arg) === 'csv' ? 'csv' : 'xlsx'); };
})();
