/* Stock · import d'une liste d'articles (CSV ou copier-coller depuis Excel).
 * Jon's Burgers, 26 nov. 2026 : « faut-il entrer chaque article un par un, ou
 * peut-on téléverser la liste, avec les prix, puis mettre les quantités ? ».
 * Les deux : la colonne stock est facultative. Sans elle, les quantités se
 * saisissent ensuite d'un coup dans l'Inventaire physique.
 * Même écriture que « Ajouter un article » / « Modifier » (catalog.js) :
 * un article existant (même nom) est mis à jour, jamais dupliqué ; rien n'est
 * écrit avant « Importer ». */
window.KiwiStockInternal.install('import', (S) => {
  'use strict';
  const { allCategories, catLabel, closeTopModal, countStock, currentStockFor, esc, getInv, getSup, lang, render, retailCatalog, stItemOverrides, stOverlayScope, stSaveOverlay, stShowReal, stStockOverrides, stockLocationId, stockUnit } = S;

  const STR = {
    fr: {
      title: 'Importer une liste d’articles', tag: 'Stock',
      help: 'Colonnes reconnues : article, unite, categorie, fournisseur, cout (prix d’achat par unité), stock, stock_ideal, seuil. Seule article est obligatoire. Sans colonne stock, saisissez ensuite les quantités dans l’Inventaire physique.',
      choose: 'Choisir un fichier Excel ou CSV', paste: 'ou collez ici les lignes copiées depuis Excel (avec la ligne d’en-tête)', read: 'Lire', template: 'Télécharger un modèle',
      created: 'nouveaux', updated: 'mis à jour', counted: 'avec stock', cats: 'catégorie(s) créée(s)',
      thName: 'Article', thUnit: 'Unité', thCat: 'Catégorie', thCost: 'Coût', thStock: 'Stock',
      isNew: 'nouveau', issues: (n) => `${n} ligne(s) ignorée(s)`, line: 'Ligne', noName: 'article vide', twice: 'en double dans le fichier', badNum: 'nombre illisible', unitFix: (u) => `unité inconnue, comptée en ${u}`,
      noCols: 'Aucune colonne « article » (ou nom, ingrédient, produit) dans ce fichier.', empty: 'Rien à lire : choisissez un fichier ou collez des lignes.',
      go: (n) => `Importer ${n} article(s)`, done: 'Liste importée', doneDesc: (c, u) => `${c} nouveau(x) · ${u} mis à jour`,
      retail: 'En boutique, l’import se fait depuis le catalogue (Importer un CSV).',
    },
    en: {
      title: 'Import a list of items', tag: 'Stock',
      help: 'Recognised columns: article, unite, categorie, fournisseur, cout (purchase cost per unit), stock, stock_ideal, seuil. Only article is required. Without a stock column, enter quantities afterwards in the Physical count.',
      choose: 'Choose an Excel or CSV file', paste: 'or paste rows copied from Excel here (with the header row)', read: 'Read', template: 'Download a template',
      created: 'new', updated: 'updated', counted: 'with stock', cats: 'categor(ies) created',
      thName: 'Item', thUnit: 'Unit', thCat: 'Category', thCost: 'Cost', thStock: 'Stock',
      isNew: 'new', issues: (n) => `${n} row(s) skipped`, line: 'Row', noName: 'empty item', twice: 'twice in the file', badNum: 'unreadable number', unitFix: (u) => `unknown unit, counted in ${u}`,
      noCols: 'No “article” column (or nom, ingredient, produit) in this file.', empty: 'Nothing to read: choose a file or paste rows.',
      go: (n) => `Import ${n} item(s)`, done: 'List imported', doneDesc: (c, u) => `${c} new · ${u} updated`,
      retail: 'In a shop, import from the catalogue (Import a CSV).',
    },
    ar: {
      title: 'استيراد لائحة أصناف', tag: 'المخزون',
      help: 'الأعمدة المعروفة: article و unite و categorie و fournisseur و cout (ثمن الشراء للوحدة) و stock و stock_ideal و seuil. العمود article وحده إلزامي. بدون عمود stock، أدخل الكميات بعد ذلك في الجرد الفعلي.',
      choose: 'اختر ملف Excel أو CSV', paste: 'أو الصق هنا الأسطر المنسوخة من Excel (مع سطر العناوين)', read: 'قراءة', template: 'تنزيل نموذج',
      created: 'جديدة', updated: 'محدَّثة', counted: 'بمخزون', cats: 'فئة منشأة',
      thName: 'الصنف', thUnit: 'الوحدة', thCat: 'الفئة', thCost: 'التكلفة', thStock: 'المخزون',
      isNew: 'جديد', issues: (n) => `${n} سطر متجاهَل`, line: 'السطر', noName: 'صنف فارغ', twice: 'مكرر في الملف', badNum: 'رقم غير مقروء', unitFix: (u) => `وحدة غير معروفة، تُحتسب بـ${u}`,
      noCols: 'لا يوجد عمود "article" (أو nom أو ingredient أو produit) في هذا الملف.', empty: 'لا شيء للقراءة: اختر ملفاً أو الصق أسطراً.',
      go: (n) => `استيراد ${n} صنف`, done: 'تم استيراد اللائحة', doneDesc: (c, u) => `${c} جديد · ${u} محدَّث`,
      retail: 'في المتجر، يتم الاستيراد من الكتالوج (استيراد CSV).',
    },
  };
  const tr = (k, ...a) => { const s = (STR[lang()] || STR.fr)[k]; return typeof s === 'function' ? s(...a) : s; };

  const COLS = {
    name: ['article', 'nom', 'ingredient', 'produit', 'designation', 'libelle', 'matiere', 'name', 'item'],
    unit: ['unite', 'unit', 'u', 'mesure', 'unite_de_mesure'],
    cat: ['categorie', 'category', 'famille', 'rayon'],
    sup: ['fournisseur', 'supplier', 'frs'],
    cost: ['cout', 'cout_unitaire', 'prix', 'prix_achat', 'prix_d_achat', 'prix_unitaire', 'pu', 'cost', 'cout_mad', 'prix_mad',
      'prix_unitaire_ht', 'prix_achat_ht', 'prix_d_achat_ht', 'cout_ht', 'cout_unitaire_ht', 'prix_ht', 'unit_cost', 'cost_price', 'purchase_price'],
    stock: ['stock', 'quantite', 'qte', 'qty', 'stock_actuel', 'en_stock', 'quantity'],
    par: ['stock_ideal', 'par', 'stock_cible', 'niveau_ideal', 'par_level'],
    reorder: ['seuil', 'seuil_commande', 'reorder', 'alerte', 'stock_min', 'minimum'],
  };
  const key = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();

  /* Lecture du fichier, propre à l'écran de stock : le lecteur du catalogue
     (catalog-import.js) n'arrive qu'avec les outils du tableau de bord, et le
     stock ne dépend pas d'eux. Mêmes règles : UTF-8 strict puis windows-1252
     (Excel FR), séparateur deviné (, ; tabulation) sur la ligne d'en-tête la
     plus large, guillemets RFC 4180, apostrophe anti-formule retirée. */
  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) {}
    try { return new TextDecoder('windows-1252').decode(buf); } catch (_) {}
    try { return new TextDecoder().decode(buf); } catch (_) { return ''; }
  }
  function rowsOf(text, delim) {
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else if (c !== '\r') field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  const headKey = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  function readCsv(text) {
    text = String(text == null ? '' : text);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    if (!text.trim()) return { ok: false };
    let best = null;
    [',', ';', '\t'].forEach((d) => {
      const rows = rowsOf(text, d).map((r) => r.map((c) => String(c).trim().replace(/^'(?=[=+\-@])/, ''))).filter((r) => r.some((c) => c !== ''));
      if (rows.length && (!best || rows[0].length > best[0].length)) best = rows;
    });
    if (!best || best.length < 2) return { ok: false };
    return { ok: true, header: best[0].map(headKey), rows: best.slice(1), all: best };
  }
  /* Les lignes d'un .xlsx (assets/sheet-file.mjs), même forme que readCsv. */
  function readRows(rows) {
    const all = (rows || []).map((r) => (r || []).map((c) => (c == null ? '' : String(c).trim()))).filter((r) => r.some((c) => c !== ''));
    return all.length < 2 ? { ok: false } : { ok: true, header: all[0].map(headKey), rows: all.slice(1), all };
  }
  /* « Coût (MAD) », « Prix unitaire HT », « Quantité en stock » : le nom exact,
     puis sans son unité, puis un nom connu suivi d'une précision (le plus long
     gagne). Avant le 27 nov., ces colonnes passaient en silence : la liste
     entrait sans coût ni quantité, sans un mot. */
  const UNIT_TAIL = /_(?:mad|dhs?|dirhams?|eur|euros?|ttc|en_mad|en_dh)$/;
  const stripUnit = (h) => { let p; do { p = h; h = h.replace(UNIT_TAIL, ''); } while (h && h !== p); return h; };
  function mapCols(header) {
    const idx = {}, used = new Set();
    Object.keys(COLS).forEach((k) => { idx[k] = -1; });
    for (const form of [(h) => h, stripUnit]) {
      Object.keys(COLS).forEach((k) => {
        if (idx[k] >= 0) return;
        const i = header.findIndex((h, j) => h && !used.has(j) && COLS[k].includes(form(h)));
        if (i >= 0) { idx[k] = i; used.add(i); }
      });
    }
    header.forEach((raw, i) => {
      if (!raw || used.has(i)) return;
      const h = stripUnit(raw);
      let best = '', len = 0;
      Object.keys(COLS).forEach((k) => {
        if (idx[k] >= 0) return;
        COLS[k].forEach((a) => { if (a.length >= 3 && a.length > len && h.startsWith(a + '_')) { best = k; len = a.length; } });
      });
      if (best) { idx[best] = i; used.add(i); }
    });
    return idx;
  }
  /* « 0,054 » (Excel en français) est une décimale : une virgule seule n'est
     jamais un séparateur de milliers ici. Puis « 1.234,50 », « 1,234.50 »,
     chiffres arabes, comme le lecteur du catalogue. */
  function num(s) {
    let t = String(s).replace(/\s*(?:MAD|DH|DHS)$/i, '').replace(/[\s\u00a0\u202f]/g, '');
    if (/^-?\d+,\d+$/.test(t)) return Number(t.replace(',', '.'));
    t = t.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - (c <= '\u0669' ? 0x660 : 0x6f0))).replace(/\u066b/g, '.').replace(/\u066c/g, ',');
    if (/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else if (/^-?\d+(?:[,.]\d+)?$/.test(t)) t = t.replace(',', '.');
    else return NaN;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  /* Texte → plan, sans rien écrire. */
  function analyse(input) {
    let parsed = Array.isArray(input) ? readRows(input) : readCsv(input);
    if (!parsed.ok) return { ok: false, error: 'empty' };
    let idx = mapCols(parsed.header), skip = 0;
    /* Une ligne de titre au-dessus des en-têtes : la première des dix qui nomme l'article. */
    for (let k = 1; idx.name < 0 && k < Math.min(parsed.all.length - 1, 10); k++) {
      const header = parsed.all[k].map(headKey), m = mapCols(header);
      if (m.name >= 0) { idx = m; skip = k; parsed = { ok: true, header, rows: parsed.all.slice(k + 1), all: parsed.all }; }
    }
    if (idx.name < 0) return { ok: false, error: 'noCols' };
    const existing = new Map(getInv().map((it) => [key(it.name), it]));
    const cats = new Map(allCategories().map((c) => [key(c.label), c.id]));
    const rows = [], issues = [], seen = new Set();
    parsed.rows.forEach((r, i) => {
      const line = i + 2 + skip, cell = (k) => (idx[k] >= 0 ? String(r[idx[k]] == null ? '' : r[idx[k]]).trim() : '');
      const name = cell('name').slice(0, 120);
      if (!name) { issues.push({ line, why: tr('noName') }); return; }
      if (seen.has(key(name))) { issues.push({ line, why: tr('twice'), name }); return; }
      const nums = {};
      for (const k of ['cost', 'stock', 'par', 'reorder']) {
        const raw = cell(k);
        if (!raw) continue;
        const n = num(raw);
        if (!(n >= 0)) { issues.push({ line, why: tr('badNum') + ' (' + k + ')', name }); return; }
        nums[k] = n;
      }
      seen.add(key(name));
      const rawUnit = cell('unit');
      const unit = rawUnit ? stockUnit(rawUnit) : '';
      if (rawUnit && key(unit) !== key(rawUnit) && !['kilo', 'kilogramme', 'kilogrammes', 'gramme', 'grammes', 'litre', 'litres', 'piece', 'pieces', 'unite', 'unites', 'pc', 'pcs'].includes(key(rawUnit))) issues.push({ line, why: tr('unitFix', unit), name, soft: true });
      const catName = cell('cat');
      rows.push({ name, unit, catName, catId: catName ? (cats.get(key(catName)) || '') : '', sup: cell('sup'), existing: existing.get(key(name)) || null, ...nums });
    });
    return { ok: true, rows, issues, newCats: [...new Set(rows.filter((r) => r.catName && !r.catId).map((r) => r.catName))] };
  }

  /* Le plan → les mêmes écritures que le formulaire d'article. */
  function apply(plan) {
    const catIds = new Map();
    plan.newCats.forEach((label) => {
      const id = 'usr-cat-' + label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20) + '-' + Date.now().toString(36).slice(-4) + catIds.size;
      S.stUserCategories.push({ id, label });
      catIds.set(label, id);
    });
    const sups = getSup();
    const supName = (raw) => { if (!raw) return ''; const s = sups.find((x) => key(x.name) === key(raw)); return s ? s.name : raw; };
    const stamp = Date.now().toString(36);
    let created = 0, updated = 0;
    plan.rows.forEach((r, i) => {
      const category = r.catId || catIds.get(r.catName) || '';
      const it = r.existing;
      if (it) {
        const patch = { updatedAt: Date.now() };
        if (r.unit) patch.unit = r.unit;
        if (category) patch.category = category;
        if (r.sup) patch.supplier = supName(r.sup);
        if (r.cost != null) patch.costPerUnit = r.cost;
        if (r.par != null) patch.parLevel = r.par;
        if (r.reorder != null) patch.reorderLevel = r.reorder;
        const before = currentStockFor(it);
        const k = S.stUserItems.findIndex((x) => x.id === it.id);
        if (k >= 0) S.stUserItems[k] = { ...S.stUserItems[k], ...patch, ...(r.stock != null ? { currentStock: r.stock } : {}) };
        else if (r.stock != null) stStockOverrides[it.id] = r.stock;
        stItemOverrides[it.id] = { ...(stItemOverrides[it.id] || {}), ...patch };
        if (r.stock != null && Math.abs(r.stock - before) > 0.0005) countStock(it, r.stock, 'import-' + stamp + '-' + i);
        updated++;
      } else {
        const par = r.par != null ? r.par : 0;
        const reorderLevel = r.reorder != null ? r.reorder : Math.max(0, Math.round(par * 0.4));
        const currentStock = r.stock != null ? r.stock : 0;
        const item = {
          id: 'usr-' + stamp + i.toString(36),
          name: r.name, category: category || 'epicerie', unit: r.unit || 'unité', supplier: supName(r.sup),
          currentStock, parLevel: par, reorderLevel, costPerUnit: r.cost != null ? r.cost : 0,
          nutrition: null, gramsPerUnit: null, lastDelivery: null, deliveryFrequency: '·', usageThisWeek: 0, theoreticalUsage: 0,
          status: currentStock <= 0 ? 'out' : (currentStock < reorderLevel ? 'low' : 'ok'), updatedAt: Date.now(),
        };
        S.stUserItems.push(item);
        try { if (window.KiwiInventory && stShowReal()) window.KiwiInventory.ensureOpening(item.id, currentStock, { unitCost: item.costPerUnit, locationId: stockLocationId() }); } catch (_) {}
        created++;
      }
    });
    stSaveOverlay();
    try { plan.rows.forEach((r) => r.existing && window.KiwiRestaurantRecipes?.recomputeForStock?.(r.existing.id, stOverlayScope())); } catch (_) {}
    return { created, updated, cats: plan.newCats.length };
  }

  function template() {
    const csv = 'article,unite,categorie,fournisseur,cout,stock,stock_ideal,seuil\n'
      + 'Blanc de poulet,kg,Viandes,Boucherie,53,12,15,10\n'
      + 'Tortilla,unité,Consommables,Nutrisla,1.875,240,400,108\n'
      + 'Sauce fromage,g,Sauces,,0.054,3800,3800,950\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'modele-stock.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  function open() {
    const K = window.Kiwi;
    if (!K || !K.modal) return null;
    if (retailCatalog()) { K.toast?.(tr('retail'), { type: 'warn' }); return null; }
    const m = K.modal({
      tag: tr('tag'), title: tr('title'), width: 680,
      body: '<div data-sti-body></div>',
      foot: '<button class="st-btn primary" type="button" data-sti-go disabled style="width:100%;justify-content:center;padding:12px;opacity:.5;">' + esc(tr('go', 0)) + '</button>',
    });
    const body = m.el.querySelector('[data-sti-body]');
    const go = m.el.querySelector('[data-sti-go]');
    let plan = null, error = '';
    const field = 'font:inherit;padding:8px 10px;border:1px solid var(--n-200,#dcd8cf);border-radius:9px;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D)';
    /* A unit cost can be 0,054 MAD a gram: keep three decimals, money rounding would show 0,05. */
    const costFmt = new Intl.NumberFormat(lang() === 'en' ? 'en-US' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
    const unitCost = (n) => costFmt.format(n) + ' MAD';
    function paint() {
      let html = '<p style="font-size:12.5px;line-height:1.5;color:var(--n-600,#555);margin:0 0 10px;">' + esc(tr('help')) + '</p>'
        + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px;"><button class="st-btn secondary" type="button" data-sti-pick>' + esc(tr('choose')) + '</button>'
        + '<input type="file" hidden accept=".xlsx,.xlsm,.xls,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain" data-sti-file><button class="st-btn secondary" type="button" data-sti-tpl>' + esc(tr('template')) + '</button></div>'
        + '<textarea data-sti-paste placeholder="' + esc(tr('paste')) + '" style="width:100%;box-sizing:border-box;min-height:110px;font-family:\'JetBrains Mono\',monospace;font-size:12px;' + field + '"></textarea>'
        + '<div style="margin:8px 0 12px;"><button class="st-btn secondary" type="button" data-sti-read>' + esc(tr('read')) + '</button></div>';
      if (error) html += '<p style="color:var(--danger,#cb5238);font-size:13px;">' + esc(tr(error)) + '</p>';
      if (plan) {
        const n = plan.rows.filter((r) => !r.existing).length, u = plan.rows.length - n, q = plan.rows.filter((r) => r.stock != null).length;
        html += '<p style="font-size:13px;margin:0 0 8px;"><b>' + n + '</b> ' + esc(tr('created')) + ' · <b>' + u + '</b> ' + esc(tr('updated')) + ' · <b>' + q + '</b> ' + esc(tr('counted'))
          + (plan.newCats.length ? ' · <b>' + plan.newCats.length + '</b> ' + esc(tr('cats')) : '') + '</p>'
          + '<div style="max-height:38vh;overflow:auto;border:1px solid var(--n-200,#dcd8cf);border-radius:12px;"><table class="st-table" style="width:100%;font-size:13px;"><thead><tr><th>' + esc(tr('thName')) + '</th><th>' + esc(tr('thUnit')) + '</th><th>' + esc(tr('thCat')) + '</th><th style="text-align:end">' + esc(tr('thCost')) + '</th><th style="text-align:end">' + esc(tr('thStock')) + '</th></tr></thead><tbody>'
          + plan.rows.slice(0, 200).map((r) => '<tr><td>' + esc(r.name) + (r.existing ? '' : ' <span class="st-chip">' + esc(tr('isNew')) + '</span>') + '</td><td>' + esc(r.unit || (r.existing ? r.existing.unit : 'unité')) + '</td><td>'
            + esc(r.catName || (r.existing ? catLabel(r.existing.category) : '')) + '</td><td style="text-align:end">' + esc(r.cost != null ? unitCost(r.cost) : '') + '</td><td style="text-align:end">'
            + esc(r.stock != null ? String(r.stock) : (r.existing ? String(currentStockFor(r.existing)) : '')) + '</td></tr>').join('') + '</tbody></table></div>';
        if (plan.issues.length) html += '<p style="font-size:12.5px;color:var(--danger,#cb5238);margin-top:8px;">' + esc(tr('issues', plan.issues.filter((x) => !x.soft).length)) + ' · '
          + plan.issues.slice(0, 8).map((x) => esc(tr('line') + ' ' + x.line + (x.name ? ' (' + x.name + ')' : '') + ' : ' + x.why)).join(' · ') + '</p>';
      }
      body.innerHTML = html;
      const ok = !!(plan && plan.rows.length);
      go.disabled = !ok; go.style.opacity = ok ? '1' : '.5'; go.textContent = tr('go', ok ? plan.rows.length : 0);
    }
    function use(text) {
      const p = analyse(text);
      if (!p.ok) { plan = null; error = p.error; } else if (!p.rows.length) { plan = null; error = 'empty'; } else { plan = p; error = ''; }
      paint();
    }
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-sti-pick]')) { m.el.querySelector('[data-sti-file]').click(); return; }
      if (e.target.closest('[data-sti-tpl]')) { template(); return; }
      if (e.target.closest('[data-sti-read]')) { use(m.el.querySelector('[data-sti-paste]').value); return; }
      if (e.target.closest('[data-sti-go]') && plan) {
        const r = apply(plan);
        closeTopModal();
        K.toast?.(tr('done'), { type: 'success', desc: tr('doneDesc', r.created, r.updated) });
        if (S.stPageActive) render();
      }
    });
    m.el.addEventListener('change', (e) => {
      const el = e.target;
      if (!el.matches('[data-sti-file]') || !el.files || !el.files[0]) return;
      const file = el.files[0];
      el.value = '';
      /* .xlsx : le lecteur de tableur partagé (assets/sheet-file.mjs). */
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        import('../sheet-file.mjs?v=1').then((X) => X.readSheetFile(file).then((r) => {
          if (!r.ok) { plan = null; error = ''; paint(); K.toast?.(X.errorText(r.error, lang()), { type: 'error' }); return; }
          use(r.rows);
        })).catch(() => { plan = null; error = 'empty'; paint(); });
        return;
      }
      const fr = new FileReader();
      fr.onload = () => use(decode(fr.result));
      fr.readAsArrayBuffer(file);
    });
    paint();
    return m;
  }

  return { open, analyse, apply };
});
