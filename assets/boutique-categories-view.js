/* Kiwi · Catégories (boutique, maison) · la page du tableau de bord.
 *
 * Seulement l'affichage. Les gestes restent ceux de pages-pro-boutique.js,
 * appelés par leurs data-action : bqx-cat-new, bqx-cat-rename, bqx-cat-color,
 * bqx-cat-del (qui demande où déplacer les produits). Ce fichier rend des
 * cartes, une recherche réelle (l'ancienne barre n'était qu'un texte) et UNE
 * pastille de couleur par catégorie : la palette ne s'ouvre qu'au clic, au
 * lieu de six points répétés sur chaque ligne.
 *
 * Kiwi.categoriesView.body(ctx) rend le HTML, .wire(root) branche
 * la recherche et la palette. pages-pro-boutique.js retombe sur une liste
 * simple si ce fichier n'est pas chargé. */
(() => {
  'use strict';
  if (!window.Kiwi || window.Kiwi.categoriesView) return;

  const W = {
    fr: { search: 'Rechercher une catégorie', add: 'Nouvelle catégorie', addSub: 'Un rayon de plus, en caisse et ici',
      products: (n) => `${n} produit${n > 1 ? 's' : ''}`, share: (p) => `${p} %`,
      none: 'Sans catégorie', noneSub: 'Rangez-les depuis la fiche du produit.', color: 'Couleur', changeColor: 'Changer la couleur de',
      rename: 'Renommer', del: 'Supprimer', empty: 'Aucune catégorie', emptySub: 'Créez votre premier rayon : il apparaît aussitôt en caisse.',
      noMatch: 'Aucune catégorie ne porte ce nom.' },
    en: { search: 'Search a category', add: 'New category', addSub: 'One more section, on the till and here',
      products: (n) => `${n} product${n === 1 ? '' : 's'}`, share: (p) => `${p}%`,
      none: 'Uncategorised', noneSub: 'File them from the product sheet.', color: 'Colour', changeColor: 'Change the colour of',
      rename: 'Rename', del: 'Delete', empty: 'No categories', emptySub: 'Create your first section: it shows on the till right away.',
      noMatch: 'No category has this name.' },
    ar: { search: 'ابحث عن فئة', add: 'فئة جديدة', addSub: 'قسم إضافي، في الصندوق وهنا',
      products: (n) => (n === 1 ? 'منتج واحد' : n === 2 ? 'منتجان' : `${n} ${n > 10 ? 'منتجًا' : 'منتجات'}`), share: (p) => `${p}%`,
      none: 'بدون فئة', noneSub: 'رتّبها من بطاقة المنتج.', color: 'اللون', changeColor: 'تغيير لون',
      rename: 'إعادة تسمية', del: 'حذف', empty: 'لا توجد فئات', emptySub: 'أنشئ أول قسم لك: يظهر فورًا في الصندوق.',
      noMatch: 'لا توجد فئة بهذا الاسم.' },
  };
  const lang = () => { const l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; return W[l] ? l : 'fr'; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, px) => (window.KiwiIcon ? window.KiwiIcon.svg(name, px || 18) : '');
  /* Une couleur claire (menthe, safran) porte une lettre sombre. */
  const light = (hex) => { const h = String(hex || '').replace('#', ''); if (h.length !== 6) return false; const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return (0.299 * r + 0.587 * g + 0.114 * b) > 150; };
  const initial = (name) => { const ch = Array.from(String(name || '').trim())[0] || '·'; return ch.toLocaleUpperCase(); };
  let query = '';

  let cssDone = false;
  function css() {
    if (cssDone || typeof document === 'undefined') return;
    cssDone = true;
    const style = document.createElement('style');
    style.id = 'kiwi-boutique-categories-css';
    style.textContent = `
.bqcv { display: grid; gap: 16px; margin-top: 4px; }
.bqcv-bar { display: flex; gap: 10px; align-items: center; }
.bqcv-search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; height: 44px; padding: 0 14px; border: 1px solid var(--n-200); border-radius: 13px; background: var(--surface); color: var(--n-500); transition: border-color .16s, box-shadow .16s; }
.bqcv-search:focus-within { border-color: var(--atlas); box-shadow: 0 0 0 3px color-mix(in srgb, var(--atlas) 14%, transparent); }
.bqcv-search svg { width: 18px; height: 18px; flex: none; }
.bqcv-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: 500 14px var(--sans); }
.bqcv-search input::placeholder { color: var(--n-400, var(--n-500)); font-weight: 400; }
.bqcv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.bqcv-card { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 16px; border: 1px solid var(--n-200); border-radius: 18px; background: var(--surface); transition: border-color .16s, box-shadow .16s, transform .16s; }
.bqcv-card:hover { border-color: color-mix(in srgb, var(--c, var(--atlas)) 45%, var(--n-200)); box-shadow: 0 14px 30px -24px rgba(10, 15, 13, .45); }
.bqcv-tile { position: relative; width: 48px; height: 48px; border: 0; border-radius: 14px; background: var(--c, var(--atlas)); color: #F7F5F0; font: 600 19px var(--sans); letter-spacing: -.01em; cursor: pointer; display: grid; place-items: center; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), 0 8px 18px -12px var(--c, var(--atlas)); transition: transform .31s var(--spring, cubic-bezier(.34, 1.45, .5, 1)); }
.bqcv-tile.is-light { color: #053B2C; }
.bqcv-tile:hover { transform: scale(1.05); }
.bqcv-tile:focus-visible, .bqcv-icon:focus-visible, .bqcv-sw:focus-visible, .bqcv-new:focus-visible { outline: 3px solid var(--mint, #7DF2B0); outline-offset: 2px; }
.bqcv-tile .bqcv-dot { position: absolute; inset-inline-end: -3px; bottom: -3px; width: 17px; height: 17px; border-radius: 50%; background: var(--surface); color: var(--ink); display: grid; place-items: center; box-shadow: 0 0 0 1px var(--n-200); }
.bqcv-tile .bqcv-dot svg { width: 11px; height: 11px; }
.bqcv-main { min-width: 0; }
.bqcv-main h3 { margin: 0; font: 600 15.5px/1.25 var(--sans); letter-spacing: -.01em; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bqcv-main p { margin: 3px 0 0; font-size: 12.5px; color: var(--n-500); font-variant-numeric: tabular-nums; }
.bqcv-meter { height: 4px; margin-top: 9px; border-radius: 99px; background: var(--n-100, rgba(10, 15, 13, .06)); overflow: hidden; }
.bqcv-meter i { display: block; height: 100%; border-radius: inherit; background: var(--c, var(--atlas)); }
.bqcv-acts { display: flex; gap: 4px; align-self: start; }
.bqcv-icon { width: 34px; height: 34px; border: 0; border-radius: 10px; background: transparent; color: var(--n-500); display: grid; place-items: center; cursor: pointer; transition: background .16s, color .16s; }
.bqcv-icon svg { width: 18px; height: 18px; }
.bqcv-icon:hover { background: var(--n-100, rgba(10, 15, 13, .06)); color: var(--ink); }
.bqcv-icon.is-danger:hover { background: color-mix(in srgb, var(--danger, #9B2F22) 10%, transparent); color: var(--danger, #9B2F22); }
.bqcv-pal { position: absolute; z-index: 5; top: calc(100% - 8px); inset-inline-start: 12px; display: flex; gap: 8px; align-items: center; padding: 10px 12px; border: 1px solid var(--n-200); border-radius: 14px; background: var(--surface); box-shadow: 0 18px 40px -20px rgba(10, 15, 13, .5); }
.bqcv-pal[hidden] { display: none; }
.bqcv-pal span { font-size: 11.5px; font-weight: 600; color: var(--n-500); margin-inline-end: 2px; }
.bqcv-sw { width: 26px; height: 26px; border: 0; border-radius: 9px; background: var(--s); cursor: pointer; display: grid; place-items: center; color: #F7F5F0; transition: transform .31s var(--spring, cubic-bezier(.34, 1.45, .5, 1)); }
.bqcv-sw.is-light { color: #053B2C; }
.bqcv-sw svg { width: 15px; height: 15px; }
.bqcv-sw:hover { transform: scale(1.12); }
.bqcv-sw[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--s); }
.bqcv-card.is-none { border-style: dashed; background: transparent; grid-template-columns: auto minmax(0, 1fr); }
.bqcv-card.is-none .bqcv-tile { background: var(--n-100, rgba(10, 15, 13, .06)); color: var(--n-500); box-shadow: none; cursor: default; }
.bqcv-card.is-none .bqcv-tile:hover { transform: none; }
.bqcv-new { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px dashed color-mix(in srgb, var(--atlas) 45%, var(--n-200)); border-radius: 18px; background: color-mix(in srgb, var(--atlas) 4%, transparent); color: var(--atlas); font: inherit; text-align: start; cursor: pointer; transition: background .16s, border-color .16s; }
.bqcv-new:hover { background: color-mix(in srgb, var(--atlas) 8%, transparent); border-color: var(--atlas); }
.bqcv-new .bqcv-plus { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--atlas); color: #F7F5F0; flex: none; }
.bqcv-new .bqcv-plus svg { width: 22px; height: 22px; }
.bqcv-new b { display: block; font: 600 15px var(--sans); }
.bqcv-new small { display: block; margin-top: 2px; font-size: 12.5px; color: var(--n-500); }
.bqcv-empty { grid-column: 1 / -1; padding: 22px; border: 1px dashed var(--n-200); border-radius: 18px; text-align: center; color: var(--n-500); font-size: 13px; }
.bqcv-empty b { display: block; color: var(--ink); font-size: 15px; margin-bottom: 4px; }
.bqcv-note { display: flex; gap: 10px; align-items: flex-start; margin: 0; padding: 12px 14px; border-radius: 14px; background: color-mix(in srgb, var(--atlas) 6%, transparent); color: var(--n-600); font-size: 12.5px; line-height: 1.5; }
.bqcv-note svg { width: 17px; height: 17px; flex: none; color: var(--atlas); margin-top: 1px; }
@media (max-width: 620px) { .bqcv-grid { grid-template-columns: minmax(0, 1fr); } .bqcv-bar { flex-direction: column; align-items: stretch; } .bqcv-search { flex: none; } }
`;
    document.head.appendChild(style);
  }

  /* ctx: { cats: [{ id, name, color, count }], products, uncategorised,
            tags: [{ id, hex, name }], tagName(tag), hint } */
  function body(ctx) {
    css();
    const t = W[lang()];
    const tags = ctx.tags || [];
    const hexOf = (id) => (tags.find((x) => x.id === id) || tags[0] || { hex: '#0B6E4F' }).hex;
    const total = Math.max(1, +ctx.products || 0);
    const cards = (ctx.cats || []).map((c) => {
      const hex = hexOf(c.color);
      const pct = Math.round(((+c.count || 0) / total) * 100);
      const pal = tags.map((g) => `<button type="button" class="bqcv-sw${light(g.hex) ? ' is-light' : ''}" style="--s:${g.hex}" data-action="bqx-cat-color" data-arg="${esc(c.id)}::${esc(g.id)}" aria-pressed="${g.id === c.color}" title="${esc(ctx.tagName ? ctx.tagName(g) : g.name)}" aria-label="${esc(ctx.tagName ? ctx.tagName(g) : g.name)}">${g.id === c.color ? ic('check', 15) : ''}</button>`).join('');
      return `<article class="bqcv-card" style="--c:${hex}" data-bqcv-card data-name="${esc(String(c.name).toLocaleLowerCase())}">
        <button type="button" class="bqcv-tile${light(hex) ? ' is-light' : ''}" data-bqcv-color aria-expanded="false" aria-label="${esc(t.changeColor + ' ' + c.name)}">${esc(initial(c.name))}</button>
        <div class="bqcv-main"><h3>${esc(c.name)}</h3><p>${esc(t.products(+c.count || 0))}${ctx.products ? ` · ${esc(t.share(pct))}` : ''}</p><div class="bqcv-meter" aria-hidden="true" title=""><i style="width:${Math.min(100, pct)}%"></i></div></div>
        <div class="bqcv-acts">
          <button type="button" class="bqcv-icon" data-action="bqx-cat-rename" data-arg="${esc(c.id)}" title="${esc(t.rename)}" aria-label="${esc(t.rename + ' ' + c.name)}">${ic('edit')}</button>
          <button type="button" data-activation=write class="bqcv-icon is-danger" data-action="bqx-cat-del" data-arg="${esc(c.id)}" title="${esc(t.del)}" aria-label="${esc(t.del + ' ' + c.name)}">${ic('trash-2')}</button>
        </div>
        <div class="bqcv-pal" data-bqcv-pal hidden><span>${esc(t.color)}</span>${pal}</div>
      </article>`;
    }).join('');
    const none = ctx.uncategorised ? `<article class="bqcv-card is-none" data-bqcv-card data-name="${esc(t.none.toLocaleLowerCase())}">
        <span class="bqcv-tile" aria-hidden="true">${ic('category', 22)}</span>
        <div class="bqcv-main"><h3>${esc(t.none)}</h3><p>${esc(t.products(ctx.uncategorised))} · ${esc(t.noneSub)}</p></div>
      </article>` : '';
    const add = `<button type="button" data-activation=write class="bqcv-new" data-action="bqx-cat-new"><span class="bqcv-plus">${ic('add', 22)}</span><span><b>${esc(t.add)}</b><small>${esc(t.addSub)}</small></span></button>`;
    const grid = (ctx.cats || []).length ? cards + none + add
      : `<div class="bqcv-empty"><b>${esc(t.empty)}</b>${esc(t.emptySub)}</div>${none}${add}`;
    return `<div class="bqcv" data-bqcv>
      ${ctx.kpis || ''}
      ${(ctx.cats || []).length > 3 ? `<div class="bqcv-bar"><label class="bqcv-search">${ic('search')}<input type="search" data-bqcv-q value="${esc(query)}" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}" autocomplete="off" /></label></div>` : ''}
      <div class="bqcv-grid" data-bqcv-grid>${grid}</div>
      <p class="bqcv-empty" data-bqcv-nomatch hidden>${esc(t.noMatch)}</p>
      ${ctx.hint ? `<p class="bqcv-note">${ic('info')}<span>${esc(ctx.hint)}</span></p>` : ''}
    </div>`;
  }

  function wire(root) {
    const host = root && root.querySelector ? root.querySelector('[data-bqcv]') : null;
    if (!host) return;
    const q = host.querySelector('[data-bqcv-q]');
    const filter = () => {
      const v = String(query || '').trim().toLocaleLowerCase();
      let shown = 0;
      host.querySelectorAll('[data-bqcv-card]').forEach((c) => { const on = !v || (c.getAttribute('data-name') || '').includes(v); c.hidden = !on; if (on) shown++; });
      const add = host.querySelector('.bqcv-new'); if (add) add.hidden = !!v;
      const nm = host.querySelector('[data-bqcv-nomatch]'); if (nm) nm.hidden = !(v && !shown);
    };
    if (q) q.addEventListener('input', () => { query = q.value; filter(); });
    else query = '';
    filter();
    const close = (except) => host.querySelectorAll('[data-bqcv-pal]').forEach((p) => { if (p === except) return; p.hidden = true; const b = p.parentElement.querySelector('[data-bqcv-color]'); if (b) b.setAttribute('aria-expanded', 'false'); });
    host.querySelectorAll('[data-bqcv-color]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const pal = b.parentElement.querySelector('[data-bqcv-pal]');
      if (!pal) return;
      close(pal);
      pal.hidden = !pal.hidden;
      b.setAttribute('aria-expanded', pal.hidden ? 'false' : 'true');
      if (!pal.hidden) { const cur = pal.querySelector('[aria-pressed="true"]') || pal.querySelector('.bqcv-sw'); if (cur) cur.focus(); }
    }));
    host.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    const outside = (e) => { if (!host.isConnected) { document.removeEventListener('click', outside, true); return; } if (!e.target.closest || !e.target.closest('[data-bqcv-pal], [data-bqcv-color]')) close(); };
    document.addEventListener('click', outside, true);
  }

  window.Kiwi.categoriesView = { body, wire };
})();
