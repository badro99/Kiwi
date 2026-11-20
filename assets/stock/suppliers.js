/* Stock · fournisseurs en compétition (build 48, 20 nov. 2026).
 *
 * Chaque fournisseur a son dossier : ses articles, ce qu'ils vendent, la marge
 * qu'ils laissent, ce qui part du stock et ce qui revient. Le classement vient
 * de /api/suppliers/ranking (ventes D1, jamais le grand livre local, partiel).
 * Les articles sans fournisseur se rangent ici, par lot : la fiche article
 * reçoit `supplierId`, et le prochain classement les compte. */
window.KiwiStockInternal.install('suppliers', (S) => {
  'use strict';
  const { esc, fmtMad, lang, stMerchantSlug } = S;
  const STR = {
    fr: {
      title: 'Classement des fournisseurs', sub: 'Qui vend, qui marge, qui revient. Calculé sur les ventes de la caisse.',
      days: (n) => `${n} derniers jours`, loading: 'Calcul du classement…',
      offline: 'Le classement a besoin de la boutique en ligne : connectez-vous à votre compte pour le voir.',
      empty: 'Aucun fournisseur encore. Scannez un bon de livraison ou rangez vos articles par fournisseur ci-dessous.',
      score: 'Score', revenue: 'Ventes', margin: 'Marge', sell: 'Écoulement', returns: 'Retours', units: 'Pièces vendues',
      stock: 'En stock', dead: (n) => `${n} article${n > 1 ? 's' : ''} sans vente`, noCost: 'prix d’achat manquant',
      top: 'Meilleur article', open: 'Ouvrir le dossier', back: 'Tous les fournisseurs', products: 'Articles',
      noProducts: 'Aucun article rattaché à ce fournisseur.', none: '·',
      untagged: (n) => `${n} article${n > 1 ? 's' : ''} sans fournisseur`, tagCta: 'Ranger par fournisseur',
      tagTitle: 'Ranger les articles', tagSub: 'Cochez les articles d’un même fournisseur, puis choisissez-le.',
      search: 'Chercher un article', allCats: 'Toutes les catégories', pick: 'Fournisseur…', newSup: 'Nouveau fournisseur',
      newName: 'Nom du nouveau fournisseur', apply: (n) => `Ranger ${n} article${n > 1 ? 's' : ''}`, all: 'Tout cocher',
      done: (n, name) => `${n} article${n > 1 ? 's' : ''} rangé${n > 1 ? 's' : ''} chez ${name}`, needPick: 'Choisissez un fournisseur et au moins un article.',
      allTagged: 'Tous vos articles ont un fournisseur.', how: 'Score : 40 % ventes, 30 % marge, 20 % écoulement du stock, 10 % peu de retours.',
      retired: 'Lecture seule : votre rôle ne permet pas de modifier le catalogue.',
    },
    en: {
      title: 'Supplier ranking', sub: 'Who sells, who earns margin, who comes back. Built from till sales.',
      days: (n) => `Last ${n} days`, loading: 'Ranking suppliers…',
      offline: 'The ranking needs your shop online: sign in to your account to see it.',
      empty: 'No suppliers yet. Scan a delivery note or file your products by supplier below.',
      score: 'Score', revenue: 'Sales', margin: 'Margin', sell: 'Sell-through', returns: 'Returns', units: 'Units sold',
      stock: 'In stock', dead: (n) => `${n} product${n > 1 ? 's' : ''} with no sale`, noCost: 'cost price missing',
      top: 'Best product', open: 'Open folder', back: 'All suppliers', products: 'Products',
      noProducts: 'No products linked to this supplier.', none: '·',
      untagged: (n) => `${n} product${n > 1 ? 's' : ''} without a supplier`, tagCta: 'File by supplier',
      tagTitle: 'File products', tagSub: 'Tick the products from one supplier, then pick it.',
      search: 'Search a product', allCats: 'All categories', pick: 'Supplier…', newSup: 'New supplier',
      newName: 'New supplier name', apply: (n) => `File ${n} product${n > 1 ? 's' : ''}`, all: 'Tick all',
      done: (n, name) => `${n} product${n > 1 ? 's' : ''} filed under ${name}`, needPick: 'Pick a supplier and at least one product.',
      allTagged: 'Every product has a supplier.', how: 'Score: 40% sales, 30% margin, 20% sell-through, 10% few returns.',
      retired: 'Read only: your role cannot edit the catalogue.',
    },
    ar: {
      title: 'ترتيب الموردين', sub: 'من يبيع، من يترك هامشًا، ومن ترجع سلعته. محسوب من مبيعات الصندوق.',
      days: (n) => `آخر ${n} يومًا`, loading: 'جارٍ ترتيب الموردين…',
      offline: 'الترتيب يحتاج المتجر متصلًا: ادخل إلى حسابك لتراه.',
      empty: 'لا يوجد موردون بعد. امسح وصل استلام أو صنّف سلعك حسب المورد أسفله.',
      score: 'النقطة', revenue: 'المبيعات', margin: 'الهامش', sell: 'نسبة التصريف', returns: 'المرتجعات', units: 'القطع المبيعة',
      stock: 'في المخزون', dead: (n) => `${n} سلعة بلا بيع`, noCost: 'ثمن الشراء غير مسجل',
      top: 'أفضل سلعة', open: 'فتح الملف', back: 'كل الموردين', products: 'السلع',
      noProducts: 'لا سلعة مرتبطة بهذا المورد.', none: '·',
      untagged: (n) => `${n} سلعة بلا مورد`, tagCta: 'صنّف حسب المورد',
      tagTitle: 'تصنيف السلع', tagSub: 'أشّر على سلع المورد نفسه، ثم اختره.',
      search: 'ابحث عن سلعة', allCats: 'كل الأصناف', pick: 'المورد…', newSup: 'مورد جديد',
      newName: 'اسم المورد الجديد', apply: (n) => `صنّف ${n} سلعة`, all: 'أشّر على الكل',
      done: (n, name) => `${n} سلعة صُنّفت عند ${name}`, needPick: 'اختر موردًا وسلعة واحدة على الأقل.',
      allTagged: 'كل سلعك لها مورد.', how: 'النقطة: 40٪ المبيعات، 30٪ الهامش، 20٪ تصريف المخزون، 10٪ قلة المرتجعات.',
      retired: 'قراءة فقط: دورك لا يسمح بتعديل الكتالوج.',
    },
  };
  const L = () => STR[lang()] || STR.fr;
  const pct = (v) => (v == null ? L().none : `${Math.round(v * 100)} %`);
  const PERIODS = [30, 90, 365];
  let days = 30, last = null;

  const CSS = `
  .sr-wrap{display:grid;gap:14px}
  .sr-bar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .sr-bar select,.sr-tag select,.sr-tag input[type=search],.sr-tag input[type=text]{font:inherit;padding:8px 10px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:transparent;color:inherit;min-height:40px}
  .sr-how{font-size:12px;opacity:.68}
  .sr-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
  .sr-row{display:grid;grid-template-columns:34px 1fr auto;gap:12px;align-items:center;width:100%;text-align:start;padding:12px;border-radius:14px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);background:transparent;color:inherit;font:inherit;cursor:pointer}
  .sr-row:hover{border-color:color-mix(in srgb,var(--atlas,#0B6E4F) 55%,transparent)}
  .sr-rank{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:600;font-variant-numeric:tabular-nums;background:color-mix(in srgb,currentColor 8%,transparent)}
  .sr-row[data-rank="1"] .sr-rank{background:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}
  .sr-name{font-weight:600;overflow-wrap:anywhere}
  .sr-meta{font-size:12px;opacity:.72;display:flex;gap:10px;flex-wrap:wrap;margin-top:3px;font-variant-numeric:tabular-nums}
  .sr-score{min-width:64px;text-align:end;font-variant-numeric:tabular-nums}
  .sr-score b{font-size:20px;font-weight:600}
  .sr-meter{height:4px;border-radius:4px;background:color-mix(in srgb,currentColor 10%,transparent);margin-top:6px;overflow:hidden}
  .sr-meter i{display:block;height:100%;background:var(--atlas,#0B6E4F)}
  .sr-note{padding:12px;border-radius:12px;background:color-mix(in srgb,var(--atlas,#0B6E4F) 9%,transparent);display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .sr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
  .sr-kpi{padding:10px;border-radius:12px;border:1px solid color-mix(in srgb,currentColor 12%,transparent)}
  .sr-kpi .l{font-size:11px;opacity:.68}.sr-kpi .v{font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}
  .sr-table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
  .sr-table th,.sr-table td{padding:8px 6px;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent);text-align:end}
  .sr-table th:first-child,.sr-table td:first-child{text-align:start}
  .sr-scroll{overflow-x:auto;max-height:52vh}
  .sr-tag{display:grid;gap:10px}
  .sr-tag .sr-filters{display:flex;gap:8px;flex-wrap:wrap}.sr-tag .sr-filters>*{flex:1 1 160px}
  .sr-pick{display:grid;gap:4px;max-height:40vh;overflow:auto;padding:2px}
  .sr-pick label{display:flex;gap:10px;align-items:center;padding:8px;border-radius:10px;min-height:40px}
  .sr-pick label:hover{background:color-mix(in srgb,currentColor 6%,transparent)}
  .sr-pick small{opacity:.6;margin-inline-start:auto}
  .sr-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sr-actions>*{flex:1 1 180px}`;
  function styles() {
    if (document.getElementById('sr-css')) return;
    const st = document.createElement('style'); st.id = 'sr-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const catalog = () => window.KiwiBoutiqueCatalog || null;
  const procurement = () => window.KiwiProcurement || null;

  async function fetchRanking() {
    const merchant = stMerchantSlug();
    if (!merchant) return { offline: true };
    try {
      const res = await fetch(`/api/suppliers/ranking?merchant=${encodeURIComponent(merchant)}&days=${days}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return { offline: true };
      const body = await res.json();
      return body && Array.isArray(body.suppliers) ? body : { offline: true };
    } catch (_) { return { offline: true }; }
  }

  /* Les articles sans fournisseur, lus dans le catalogue local : c'est lui
     qu'on modifie, et il a les catégories. */
  function untaggedLocal() {
    const C = catalog();
    if (!C || !C.listProducts) return [];
    return (C.listProducts() || []).filter((p) => p && !String(p.supplierId || '').trim());
  }

  function rowHtml(s) {
    const T = L();
    const meta = [
      `${T.revenue} ${fmtMad(s.revenue)}`,
      `${T.margin} ${s.marginRate == null ? (s.revenue > 0 ? T.noCost : T.none) : pct(s.marginRate)}`,
      `${T.sell} ${pct(s.sellThrough)}`,
      `${T.returns} ${pct(s.returnRate)}`,
    ];
    return `<li><button type="button" class="sr-row" data-sr-open="${esc(s.id)}" data-rank="${s.rank}" aria-label="${esc(T.open)} · ${esc(s.name || s.id)}">
      <span class="sr-rank">${s.rank}</span>
      <span><span class="sr-name">${esc(s.name || s.id)}</span><span class="sr-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</span></span>
      <span class="sr-score">${s.score == null ? esc(T.none) : `<b>${s.score}</b>`}<span class="sr-meter"><i style="width:${s.score || 0}%"></i></span></span>
    </button></li>`;
  }

  function listHtml(data) {
    const T = L();
    const loose = untaggedLocal().length;
    const note = loose ? `<div class="sr-note"><span>${esc(T.untagged(loose))}</span><button type="button" class="st-btn" data-sr-tag>${esc(T.tagCta)}</button></div>` : '';
    const period = `<select data-sr-days aria-label="${esc(T.title)}">${PERIODS.map((n) => `<option value="${n}"${n === days ? ' selected' : ''}>${esc(T.days(n))}</option>`).join('')}</select>`;
    if (data.offline) return `<div class="sr-wrap"><p>${esc(T.offline)}</p>${note}</div>`;
    const body = data.suppliers.length ? `<ol class="sr-list">${data.suppliers.map(rowHtml).join('')}</ol>` : `<p>${esc(T.empty)}</p>`;
    return `<div class="sr-wrap"><div class="sr-bar">${period}<span class="sr-how">${esc(T.how)}</span></div>${note}${body}</div>`;
  }

  function folderHtml(s) {
    const T = L();
    const kpi = (l, v) => `<div class="sr-kpi"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`;
    const rows = s.products.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.units}</td><td>${esc(fmtMad(p.revenue))}</td><td>${p.margin == null ? esc(T.none) : esc(fmtMad(p.margin))}</td><td>${p.stock}</td><td>${p.returned || ''}</td></tr>`).join('');
    return `<div class="sr-wrap">
      <div class="sr-bar"><button type="button" class="st-btn" data-sr-back>${esc(T.back)}</button><span class="sr-how">#${s.rank} · ${esc(T.score)} ${s.score == null ? T.none : s.score}</span></div>
      <div class="sr-kpis">${kpi(T.revenue, fmtMad(s.revenue))}${kpi(T.margin, s.margin == null ? (s.revenue > 0 ? T.noCost : T.none) : `${fmtMad(s.margin)} · ${pct(s.marginRate)}`)}${kpi(T.units, String(s.units))}${kpi(T.sell, pct(s.sellThrough))}${kpi(T.returns, `${s.returnedUnits} · ${pct(s.returnRate)}`)}${kpi(T.stock, `${s.stock} · ${fmtMad(s.stockValue)}`)}</div>
      ${s.top ? `<p class="sr-how">${esc(T.top)} : ${esc(s.top.name)}${s.deadProducts ? ` · ${esc(T.dead(s.deadProducts))}` : ''}</p>` : (s.deadProducts ? `<p class="sr-how">${esc(T.dead(s.deadProducts))}</p>` : '')}
      ${rows ? `<div class="sr-scroll"><table class="sr-table"><thead><tr><th>${esc(T.products)}</th><th>${esc(T.units)}</th><th>${esc(T.revenue)}</th><th>${esc(T.margin)}</th><th>${esc(T.stock)}</th><th>${esc(T.returns)}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p>${esc(T.noProducts)}</p>`}
    </div>`;
  }

  function tagHtml() {
    const T = L(), C = catalog(), P = procurement();
    const items = untaggedLocal();
    if (!items.length) return `<div class="sr-wrap"><button type="button" class="st-btn" data-sr-back>${esc(T.back)}</button><p>${esc(T.allTagged)}</p></div>`;
    const cats = (C && C.listCategories ? C.listCategories() : []) || [];
    const catName = new Map(cats.map((c) => [String(c.id), c.name || '']));
    const sups = ((P && P.doc ? P.doc().suppliers : []) || []).filter((s) => s && s.active !== false && !s.archived);
    return `<div class="sr-wrap sr-tag">
      <div class="sr-bar"><button type="button" class="st-btn" data-sr-back>${esc(T.back)}</button><span class="sr-how">${esc(T.tagSub)}</span></div>
      <div class="sr-filters"><input type="search" data-sr-q placeholder="${esc(T.search)}" aria-label="${esc(T.search)}">
        <select data-sr-cat aria-label="${esc(T.allCats)}"><option value="">${esc(T.allCats)}</option>${cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name || '')}</option>`).join('')}</select></div>
      <label class="sr-all"><input type="checkbox" data-sr-all> ${esc(T.all)}</label>
      <div class="sr-pick">${items.map((p) => `<label data-sr-item data-cat="${esc(p.categoryId || '')}" data-name="${esc(String(p.name || '').toLowerCase())}"><input type="checkbox" value="${esc(p.id)}"><span>${esc(p.name || p.id)}</span><small>${esc(catName.get(String(p.categoryId)) || '')}</small></label>`).join('')}</div>
      <div class="sr-actions"><select data-sr-sup aria-label="${esc(T.pick)}"><option value="">${esc(T.pick)}</option>${sups.map((s) => `<option value="${esc(s.id)}">${esc(s.name || s.id)}</option>`).join('')}<option value="__new">${esc(T.newSup)}</option></select>
        <input type="text" data-sr-newname placeholder="${esc(T.newName)}" aria-label="${esc(T.newName)}" hidden maxlength="120">
        <button type="button" class="st-btn primary" data-activation="write" data-sr-apply>${esc(T.apply(0))}</button></div>
    </div>`;
  }

  function wireTag(m, show) {
    const T = L(), root = m.el;
    const boxes = () => [...root.querySelectorAll('[data-sr-item]')];
    const visible = () => boxes().filter((l) => !l.hidden);
    const picked = () => boxes().filter((l) => l.querySelector('input').checked).map((l) => l.querySelector('input').value);
    const count = () => { const b = root.querySelector('[data-sr-apply]'); if (b) b.textContent = T.apply(picked().length); };
    const filter = () => {
      const q = (root.querySelector('[data-sr-q]').value || '').trim().toLowerCase(), cat = root.querySelector('[data-sr-cat]').value;
      boxes().forEach((l) => { l.hidden = (!!q && !l.dataset.name.includes(q)) || (!!cat && l.dataset.cat !== cat); });
    };
    root.querySelector('[data-sr-q]')?.addEventListener('input', filter);
    root.querySelector('[data-sr-cat]')?.addEventListener('change', filter);
    root.querySelector('[data-sr-all]')?.addEventListener('change', (e) => { visible().forEach((l) => { l.querySelector('input').checked = e.target.checked; }); count(); });
    root.querySelector('.sr-pick')?.addEventListener('change', count);
    const sup = root.querySelector('[data-sr-sup]'), name = root.querySelector('[data-sr-newname]');
    sup?.addEventListener('change', () => { if (name) { name.hidden = sup.value !== '__new'; if (!name.hidden) name.focus(); } });
    root.querySelector('[data-sr-apply]')?.addEventListener('click', () => {
      const ids = picked(), C = catalog(), P = procurement();
      let sid = sup ? sup.value : '', label = sup && sup.selectedOptions[0] ? sup.selectedOptions[0].textContent : '';
      if (sid === '__new') {
        const n = String(name && name.value || '').trim();
        const row = n && P && P.addSupplier ? P.addSupplier({ name: n }) : null;
        sid = row && row.id ? row.id : ''; label = n;
      }
      if (!sid || !ids.length || !C || !C.updateProduct) { window.Kiwi?.toast?.(T.needPick, { type: 'error' }); return; }
      const write = () => ids.forEach((id) => C.updateProduct(id, { supplierId: sid }));
      if (C.batch) C.batch(write); else write();
      window.Kiwi?.toast?.(T.done(ids.length, label), { type: 'success' });
      show('tag');
    });
  }

  async function open() {
    styles();
    const T = L();
    const m = window.Kiwi.modal({ title: T.title, desc: esc(T.sub), width: 720, body: `<p>${esc(T.loading)}</p>` });
    const body = m.el.querySelector('.kiwi-modal-body');
    const show = async (view, id) => {
      if (view === 'tag') { body.innerHTML = tagHtml(); wireTag(m, show); return; }
      if (view === 'folder') {
        const s = last && last.suppliers && last.suppliers.find((x) => x.id === id);
        if (s) { body.innerHTML = folderHtml(s); return; }
      }
      body.innerHTML = `<p>${esc(L().loading)}</p>`;
      last = await fetchRanking();
      body.innerHTML = listHtml(last);
    };
    body.addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-sr-open]');
      if (openBtn) { show('folder', openBtn.dataset.srOpen); return; }
      if (e.target.closest('[data-sr-tag]')) { show('tag'); return; }
      if (e.target.closest('[data-sr-back]')) show('list');
    });
    body.addEventListener('change', (e) => {
      if (e.target.matches('[data-sr-days]')) { days = parseInt(e.target.value, 10) || 30; show('list'); }
    });
    await show('list');
    return m;
  }

  return { open };
});
