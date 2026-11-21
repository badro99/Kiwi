/* Kiwi · Excel import, three steps (window.KiwiBulkImport)
 *
 *   1. Modèle et fichier — download the .xlsx template (or export the
 *      catalogue and edit it), then drop an .xlsx or a .csv, 3 MB at most.
 *   2. Vérification — every line checked, every error on its cell: required,
 *      not a number, duplicate barcode or SKU, unknown category… « Erreurs
 *      seulement » filters, a click on a cell fixes it in place, and the
 *      missing categories can be created in one click.
 *   3. Confirmation — new, updated and unchanged counted; nothing is written
 *      before this button.
 *
 * The file is read in the browser (assets/pages-pro/catalog-bulk/xlsx.js) and never
 * uploaded. Updates go into the spreadsheet and leave in the one batch save;
 * new articles are created by the existing importer (assets/catalog-import.js),
 * which already knows how a boutique product gets its first variant.
 */
(function () {
  'use strict';
  const MAX_BYTES = 3 * 1024 * 1024;

  function css() {
    if (document.getElementById('cbi-css')) return;
    const s = document.createElement('style');
    s.id = 'cbi-css';
    s.textContent = `
.cbi{display:grid;gap:14px}
.cbi-steps{display:flex;gap:6px;flex-wrap:wrap;font-size:12px;font-weight:600}
.cbi-steps span{padding:5px 11px;border-radius:999px;background:var(--n-100,rgba(10,15,13,.05));color:var(--n-500,#6b7570)}
.cbi-steps span.on{background:color-mix(in srgb,var(--atlas,#0B6E4F) 14%,transparent);color:var(--atlas,#0B6E4F)}
.cbi-drop{display:grid;place-items:center;gap:8px;padding:34px 16px;border:1.5px dashed var(--n-300,#b9bfbc);border-radius:16px;text-align:center;cursor:pointer;color:var(--n-600,#4a5550);font-size:13px}
.cbi-drop.over{border-color:var(--atlas,#0B6E4F);background:color-mix(in srgb,var(--atlas,#0B6E4F) 6%,transparent)}
.cbi-drop b{color:var(--ink,#0A0F0D);font-weight:600;font-size:14px}
.cbi-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cbi-pill{display:inline-flex;gap:6px;align-items:center;padding:5px 11px;border-radius:999px;font-size:12.5px;background:var(--n-100,rgba(10,15,13,.05))}
.cbi-pill b{font-weight:600;font-variant-numeric:tabular-nums}
.cbi-pill.new{color:var(--atlas,#0B6E4F)}
.cbi-pill.error{color:var(--danger,#C94A3A)}
.cbi-tab{max-height:min(48vh,420px);overflow:auto;border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:12px}
.cbi-tab table{border-collapse:collapse;font-size:12.5px;min-width:100%}
.cbi-tab th{position:sticky;top:0;background:var(--paper-soft,#EFEDE6);text-align:start;padding:7px 10px;font-weight:600;color:var(--n-600,#4a5550);white-space:nowrap}
.cbi-tab td{padding:0;border-top:1px solid var(--n-100,rgba(10,15,13,.06));white-space:nowrap}
.cbi-tab td>div{padding:6px 10px;min-height:30px;display:flex;align-items:center;gap:6px;cursor:text}
.cbi-tab td.l>div{color:var(--n-500,#6b7570);cursor:default;font-variant-numeric:tabular-nums}
.cbi-tab td.bad>div{background:color-mix(in srgb,var(--danger,#C94A3A) 12%,transparent);color:var(--danger,#C94A3A)}
.cbi-tab td.bad small{font-size:11px;opacity:.9}
.cbi-tab input{width:100%;min-width:120px;height:30px;border:0;outline:2px solid var(--atlas,#0B6E4F);outline-offset:-2px;padding:0 10px;font:inherit;background:var(--paper-elev,#FDFCF9);color:var(--ink,#0A0F0D)}
.cbi-st{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:var(--n-100,rgba(10,15,13,.05))}
.cbi-st.new{color:var(--atlas,#0B6E4F)}.cbi-st.error{color:var(--danger,#C94A3A)}.cbi-st.unchanged{color:var(--n-500,#6b7570)}
.cbi-note{font-size:12.5px;color:var(--n-500,#6b7570)}
.cbi-sum{display:grid;gap:8px;font-size:14px}
.cbi-sum b{font-weight:600}
`;
    document.head.appendChild(s);
  }

  async function readFile(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf[0] === 0x50 && buf[1] === 0x4b) return (await window.KiwiXlsx.read(buf)).rows;
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.indexOf('�') !== -1) { try { text = new TextDecoder('windows-1252').decode(buf); } catch (_) {} }
    return window.KiwiBulkRules.parseCsv(text);
  }

  function open(ctx) {
    css();
    const { L, esc, fmtNum, plural, message } = ctx;
    const R = window.KiwiBulkRules;
    const LABEL = {
      name: L('Nom', 'Name', 'الاسم'), sku: 'SKU', barcode: L('Code-barres', 'Barcode', 'الباركود'),
      price: L('Prix de vente', 'Selling price', 'ثمن البيع'), cost: L('Prix d’achat', 'Cost', 'ثمن الشراء'),
      lowStock: L('Alerte stock bas', 'Low-stock alert', 'تنبيه نقص المخزون'), category: L('Catégorie', 'Category', 'الفئة'),
      sellable: L('En vente', 'For sale', 'معروض للبيع'),
    };
    const STATUS = { new: L('Nouveau', 'New', 'جديد'), updated: L('Mis à jour', 'Updated', 'متبدّل'), unchanged: L('Inchangé', 'Unchanged', 'بلا تبديل'), error: L('Erreur', 'Error', 'غلطة') };
    let step = 1, table = null, an = null, errorsOnly = false, fileLabel = '';
    const m = window.Kiwi.modal({
      tag: L('IMPORT EXCEL', 'EXCEL IMPORT', 'استيراد Excel'),
      title: ctx.kind === 'boutique' ? L('Importer l’inventaire', 'Import the inventory', 'استورد المخزون') : L('Importer la carte', 'Import the menu', 'استورد القائمة'),
      width: 920, body: '<div class="cbi" data-cbi></div>', foot: '<div class="cbi-row" data-cbi-foot style="width:100%;justify-content:flex-end"></div>',
    });
    const box = m.el.querySelector('[data-cbi]'), foot = m.el.querySelector('[data-cbi-foot]');

    const steps = () => `<div class="cbi-steps">${[L('1 · Modèle et fichier', '1 · Template and file', '1 · النموذج والملف'), L('2 · Vérification', '2 · Check', '2 · المراجعة'), L('3 · Confirmation', '3 · Confirm', '3 · التأكيد')].map((t, i) => `<span class="${step === i + 1 ? 'on' : ''}">${esc(t)}</span>`).join('')}</div>`;

    function stepOne(error) {
      step = 1;
      box.innerHTML = steps() + `
        <div class="cbi-row"><button type="button" class="kb ghost" data-tpl>${esc(L('Télécharger le modèle .xlsx', 'Download the .xlsx template', 'حمّل النموذج .xlsx'))}</button>
          <span class="cbi-note">${esc(L('Ou exportez votre catalogue, corrigez-le dans Excel et réimportez-le : la colonne ID Kiwi retrouve chaque article.', 'Or export your catalogue, edit it in Excel and import it back: the Kiwi ID column finds each item.', 'ولا صدّر الكتالوج، صحّحو فExcel ورجّعو: عمود ID Kiwi كايلقى كل منتج.'))}</span></div>
        <label class="cbi-drop" data-drop><b>${esc(L('Déposez votre fichier ici', 'Drop your file here', 'حط الملف ديالك هنا'))}</b><span>${esc(L('ou cliquez pour choisir · .xlsx ou .csv · 3 Mo maximum', 'or click to choose · .xlsx or .csv · 3 MB max', 'ولا كليكي باش تختار · .xlsx ولا .csv · 3 ميغا على الأكثر'))}</span>
          <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden data-file></label>
        ${error ? `<div class="cbi-pill error" role="alert">${esc(error)}</div>` : ''}`;
      foot.innerHTML = `<button type="button" class="kb ghost" data-dismiss>${esc(L('Fermer', 'Close', 'سدّ'))}</button>`;
      box.querySelector('[data-tpl]').addEventListener('click', () => ctx.download(ctx.template(), (ctx.kind === 'boutique' ? 'modele-inventaire' : 'modele-carte') + '-kiwi.xlsx'));
      const drop = box.querySelector('[data-drop]'), input = box.querySelector('[data-file]');
      input.addEventListener('change', () => { if (input.files[0]) take(input.files[0]); });
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) take(f); });
    }

    async function take(file) {
      if (file.size > MAX_BYTES) return stepOne(L('Fichier trop lourd : 3 Mo maximum.', 'File too large: 3 MB max.', 'الملف تقيل بزاف: 3 ميغا على الأكثر.'));
      try { table = await readFile(file); }
      catch (e) { return stepOne(e && e.message === 'no-deflate' ? L('Ce navigateur ne sait pas ouvrir un .xlsx : enregistrez-le en CSV.', 'This browser cannot open an .xlsx: save it as CSV.', 'هاد المتصفح ما كايحلّش .xlsx: سجّلو CSV.') : L('Fichier illisible. Enregistrez-le en .xlsx ou .csv.', 'Unreadable file. Save it as .xlsx or .csv.', 'الملف ما كايتقراش. سجّلو .xlsx ولا .csv.')); }
      fileLabel = file.name;
      analyse();
      if (!an) return;
      stepTwo();
    }
    function analyse() {
      an = R.analyseImport(table || [], { kind: ctx.kind, categories: ctx.categories, existing: ctx.existing });
      if (an.error) { const e = an.error; an = null; stepOne(e === 'no-name-column' ? L('Aucune colonne « Nom » reconnue. Partez du modèle.', 'No « Name » column found. Start from the template.', 'ما لقيناش عمود « الاسم ». بدا من النموذج.') : e); return; }
      if (!an.rows.length) { an = null; stepOne(L('Le fichier ne contient aucune ligne.', 'The file has no rows.', 'الملف ما فيه حتى سطر.')); }
    }
    function recheck() {
      an.rows.forEach((r) => R.revalidate(r, { kind: ctx.kind }, an.lookup));
      R.checkDuplicates(an.rows);
      an.counts = R.countStatus(an.rows.map((r) => r.status));
    }
    const missingCats = () => {
      const out = new Map();
      an.rows.forEach((r) => { if (r.errors.category === 'unknown-category') { const n = String(r.raw.category || '').trim(); if (n) out.set(R.normKey(n), n); } });
      return [...out.values()];
    };

    function stepTwo() {
      step = 2;
      const c = an.counts, cols = an.columns;
      const shown = an.rows.filter((r) => !errorsOnly || r.status === 'error');
      const cats = missingCats();
      box.innerHTML = steps() + `
        <div class="cbi-row"><span class="cbi-note">${esc(fileLabel)} · ${esc(plural(an.rows.length, L('{n} ligne', '{n} row', '{n} سطر'), L('{n} lignes', '{n} rows', '{n} سطور')))}</span></div>
        <div class="cbi-row">
          <span class="cbi-pill new"><b>${fmtNum(c.new, 0)}</b>${esc(L('nouveaux', 'new', 'جداد'))}</span>
          <span class="cbi-pill"><b>${fmtNum(c.updated, 0)}</b>${esc(L('mis à jour', 'updated', 'متبدّلين'))}</span>
          <span class="cbi-pill"><b>${fmtNum(c.unchanged, 0)}</b>${esc(L('inchangés', 'unchanged', 'بلا تبديل'))}</span>
          <span class="cbi-pill error"><b>${fmtNum(c.error, 0)}</b>${esc(L('avec erreurs', 'with errors', 'فيهم أغلاط'))}</span>
          <label class="cbi-pill" style="cursor:pointer"><input type="checkbox" data-eo ${errorsOnly ? 'checked' : ''}> ${esc(L('Erreurs seulement', 'Errors only', 'غير الأغلاط'))}</label>
          ${cats.length ? `<button type="button" class="kb ghost" data-mkcat>${esc(plural(cats.length, L('Créer la catégorie manquante', 'Create the missing category', 'زيد الفئة الناقصة'), L('Créer les {n} catégories manquantes', 'Create the {n} missing categories', 'زيد {n} فئات ناقصين')))}</button>` : ''}
        </div>
        <div class="cbi-tab"><table><thead><tr><th>#</th><th>${esc(L('État', 'Status', 'الحالة'))}</th>${cols.map((f) => `<th>${esc(LABEL[f] || f)}</th>`).join('')}</tr></thead><tbody>
        ${shown.slice(0, 500).map((r) => `<tr data-line="${r.line}"><td class="l"><div>${r.line}</div></td><td class="l"><div><span class="cbi-st ${r.status}">${esc(STATUS[r.status])}</span></div></td>${cols.map((f) => {
          const err = r.errors[f];
          return `<td class="${err ? 'bad' : ''}" data-f="${f}"><div title="${esc(err ? message(err) : '')}">${esc(r.raw[f] == null ? '' : r.raw[f])}${err ? ` <small>· ${esc(message(err))}</small>` : ''}</div></td>`;
        }).join('')}</tr>`).join('')}
        </tbody></table>${shown.length > 500 ? `<div class="cbi-note" style="padding:10px">${esc(L('500 premières lignes affichées.', 'First 500 rows shown.', 'كانبيّنو غير أول 500 سطر.'))}</div>` : ''}${!shown.length ? `<div class="cbi-note" style="padding:14px">${esc(L('Aucune erreur.', 'No errors.', 'حتى غلطة.'))}</div>` : ''}</div>
        <div class="cbi-note">${esc(L('Cliquez sur une cellule pour la corriger ici, sans repasser par Excel.', 'Click a cell to fix it here, without going back to Excel.', 'كليكي على خانة باش تصحّحها هنا، بلا ما ترجع لExcel.'))}</div>`;
      foot.innerHTML = `<button type="button" class="kb ghost" data-back>${esc(L('Autre fichier', 'Another file', 'ملف آخر'))}</button>
        <button type="button" class="kb atlas" data-next ${c.error ? 'disabled' : ''}>${esc(c.error ? plural(c.error, L('{n} ligne à corriger', '{n} row to fix', '{n} سطر خاصو تصحيح'), L('{n} lignes à corriger', '{n} rows to fix', '{n} سطور خاصهم تصحيح')) : L('Continuer', 'Continue', 'كمّل'))}</button>`;
      foot.querySelector('[data-back]').addEventListener('click', () => stepOne());
      foot.querySelector('[data-next]').addEventListener('click', stepThree);
      box.querySelector('[data-eo]').addEventListener('change', (e) => { errorsOnly = e.target.checked; stepTwo(); });
      const mk = box.querySelector('[data-mkcat]');
      if (mk) mk.addEventListener('click', () => createCategories(cats));
      box.querySelector('tbody').addEventListener('click', (e) => {
        const td = e.target.closest('td[data-f]'); if (!td || td.querySelector('input')) return;
        const row = an.rows.find((r) => String(r.line) === td.parentElement.dataset.line); if (!row) return;
        const f = td.dataset.f;
        const input = document.createElement('input'); input.value = row.raw[f] == null ? '' : row.raw[f];
        input.setAttribute('aria-label', LABEL[f] || f);
        td.innerHTML = ''; td.appendChild(input); input.focus(); input.select();
        let done = false;
        const finish = (keep) => { if (done) return; done = true; if (keep) row.raw[f] = input.value; recheck(); stepTwo(); };
        input.addEventListener('keydown', (k) => { k.stopPropagation(); if (k.key === 'Enter') finish(true); if (k.key === 'Escape') { k.preventDefault(); finish(false); } });
        input.addEventListener('blur', () => finish(true));
      });
    }

    function createCategories(names) {
      const before = new Set(ctx.categories.map((c) => c.id));
      if (ctx.kind === 'boutique' && window.KiwiBoutiqueCatalog) names.forEach((n) => window.KiwiBoutiqueCatalog.addCategory(n));
      else if (window.KiwiMenuStore) names.forEach((n) => window.KiwiMenuStore.addCategory(n));
      const all = ctx.kind === 'boutique' && window.KiwiBoutiqueCatalog ? window.KiwiBoutiqueCatalog.listCategories() : (window.KiwiMenuStore ? window.KiwiMenuStore.categories() : []);
      all.forEach((c) => { if (!before.has(c.id)) { ctx.categories.push({ id: c.id, name: c.name }); an.lookup.catByName.set(R.normKey(c.name), c.id); an.lookup.catIds.add(c.id); } });
      recheck(); stepTwo();
      window.Kiwi.toast(plural(names.length, L('{n} catégorie créée', '{n} category created', 'تزادت {n} فئة'), L('{n} catégories créées', '{n} categories created', 'تزادو {n} فئات')), { type: 'success', force: true });
    }

    function stepThree() {
      step = 3;
      const c = an.counts;
      box.innerHTML = steps() + `<div class="cbi-sum">
        <div><b>${fmtNum(c.new, 0)}</b> ${esc(L('nouveaux articles seront créés', 'new items will be created', 'منتجات جداد غادي يتزادو'))}</div>
        <div><b>${fmtNum(c.updated, 0)}</b> ${esc(L('articles seront mis à jour, seules les colonnes du fichier changent', 'items will be updated, only the file’s columns change', 'منتجات غادي يتبدّلو، غير الأعمدة اللي فالملف'))}</div>
        <div><b>${fmtNum(c.unchanged, 0)}</b> ${esc(L('lignes sont déjà à jour et ne touchent à rien', 'rows are already up to date and touch nothing', 'سطور ديجا محيّنين وما كايقيسو والو'))}</div>
        <div class="cbi-note">${esc(L('Le stock n’est jamais modifié par cet import.', 'Stock is never changed by this import.', 'المخزون عمرو ما كايتبدّل بهاد الاستيراد.'))}</div></div>`;
      foot.innerHTML = `<button type="button" class="kb ghost" data-back>${esc(L('Retour', 'Back', 'رجوع'))}</button><button type="button" class="kb atlas" data-go ${c.new + c.updated ? '' : 'disabled'}>${esc(L('Importer', 'Import', 'استورد'))}</button>`;
      foot.querySelector('[data-back]').addEventListener('click', stepTwo);
      foot.querySelector('[data-go]').addEventListener('click', confirm);
    }

    async function confirm() {
      const fresh = an.rows.filter((r) => r.status === 'new');
      const upd = an.rows.filter((r) => r.status === 'updated');
      m.close();
      let created = 0;
      if (fresh.length) created = createNew(fresh);
      if (created) await ctx.reload();
      const changes = [];
      upd.forEach((r) => Object.keys(r.values).forEach((f) => changes.push({ id: r.match, key: f, value: r.values[f] })));
      if (changes.length) { ctx.put(changes); await ctx.save(); }
      else if (created) window.Kiwi.toast(plural(created, L('{n} article créé', '{n} item created', 'تزاد {n} منتج'), L('{n} articles créés', '{n} items created', 'تزادو {n} منتجات')), { type: 'success', force: true });
    }

    /* New lines through the existing importer, which builds a boutique
       product with its first variant (TU, sans couleur) and its code-barres. */
    function createNew(rows) {
      const CI = window.KiwiCatalogImport;
      if (!CI) return 0;
      const catName = (id) => { const c = ctx.categories.find((x) => x.id === id); return c ? c.name : ''; };
      const money = (v) => (v == null || v === '' ? '' : String(v));
      if (ctx.kind === 'boutique') {
        const header = ['produit', 'categorie', 'prix_mad', 'cout', 'code_barres'];
        const parsed = { ok: true, header, headerRaw: header, rows: rows.map((r) => [r.values.name, catName(r.values.category), money(r.values.price), money(r.values.cost), r.values.barcode || '']) };
        const plan = CI.analyseBoutique(parsed);
        if (!plan || !plan.ok) return 0;
        const res = CI.applyBoutique(plan);
        const CAT = window.KiwiBoutiqueCatalog;
        if (CAT) {
          const byName = new Map(CAT.listProducts({ includeArchived: true }).map((p) => [R.normKey(p.name), p]));
          const extra = () => rows.forEach((r) => {
            const p = byName.get(R.normKey(r.values.name)); if (!p) return;
            const patch = {};
            if (r.values.sku) patch.sku = r.values.sku;
            if (r.values.lowStock) patch.reorderLevel = r.values.lowStock;
            if (Object.keys(patch).length) CAT.updateProduct(p.id, patch);
            if (r.values.sellable === false) CAT.archiveProduct(p.id, true);
          });
          if (CAT.batch) CAT.batch(extra); else extra();
        }
        return res.products || rows.length;
      }
      const header = ['article', 'categorie', 'prix_mad', 'disponible'];
      const parsed = { ok: true, header, headerRaw: header, rows: rows.map((r) => [r.values.name, catName(r.values.category), money(r.values.price), r.values.sellable === false ? 'non' : 'oui']) };
      const plan = CI.analyseMenu(parsed);
      if (!plan || !plan.ok) return 0;
      const res = CI.applyMenu(plan);
      return res.items || 0;
    }

    stepOne();
  }

  window.KiwiBulkImport = { open, MAX_BYTES };
})();
