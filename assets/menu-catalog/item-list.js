/* Menu item-list. Exports: renderEmpty.
 * Reads injected: injectCss, tr, T, esc, venueName, SPARK, PLUS, orderProOn. Window reads are declared in split.json. */
(function (parts) {
  parts.item_list = function (context) {
    'use strict';
    const { injectCss, tr, T, esc, venueName, SPARK, PLUS, orderProOn } = context;
    const { store, catById, itemsIn, optById, stationById, kitchenIdOf, fmt, fmtPct, EDIT, TRASH, LIST, BELL, DOWNLOAD } = context;
    let { activeCat, activeSub } = context;
  function renderEmpty() {
    injectCss();
    window.Kiwi.appPage('menu', {
      title: tr(T.title),
      subtitle: esc(venueName()),
      body: `
        <div class="mx-wrap">
          <div class="mx-empty">
            <div class="ic">${SPARK}</div>
            <h3>${esc(tr(T.emptyH))}</h3>
            <p>${esc(tr(T.emptyP))}</p>
            <div class="row">
              <button data-activation=write class="mx-pane-add" data-action="mx-cat-add">${PLUS}<span>${esc(tr(T.addCat))}</span></button>
              <button data-activation=write class="mx-cat-add" style="width:auto;border-style:solid;" data-action="mx-import">${DOWNLOAD}<span>${esc(tr(T.importCsv))}</span></button>
              <button class="mx-cat-add" style="width:auto;border-style:solid;" data-action="mx-load-example">${SPARK ? '' : ''}<span>${esc(tr(T.loadEx))}</span></button>
              ${/* Order Pro est une option PAYANTE : quand elle est allumée, ses
                    tags sont la seule chose que le commerçant vient chercher, et
                    ils ne doivent pas dépendre de l'état de la carte. Le bouton
                    ne vivait que dans la barre d'outils de la carte remplie —
                    donc un établissement neuf, ou un magasin dont la carte
                    n'était pas encore redescendue du serveur, n'avait aucun
                    moyen d'atteindre ses liens. */''}
              ${orderProOn() ? `<button data-activation=write class="mx-cat-add" style="width:auto;border-style:solid;" data-action="orderpro-tags"><span>${esc(tr(T.tags))}</span></button>` : ''}
            </div>
          </div>
        </div>`,
    });
  }

  function renderLegacy() {
    injectCss();
    const d = store.get();
    const cats = d.cats || [];
    const items = d.items || [];

    if (!cats.length && !items.length) return renderEmpty();

    // Keep the visual filter valid. "all" is a view state only; stored
    // category ids and item relationships are untouched.
    if (!activeCat || (activeCat !== 'all' && !catById(d, activeCat))) { activeCat = 'all'; activeSub = null; }
    const cat = activeCat === 'all' ? null : catById(d, activeCat);
    if (activeSub && cat && !(cat.sub || []).some((s) => s.id === activeSub)) activeSub = null;

    const filters = cats.map((c) => {
      const isOn = c.id === activeCat;
      const count = itemsIn(d, c.id).length;
      return `
        <div class="mx-filter-pair ${isOn ? 'on' : ''}">
          <button class="mx-filter-pill" data-action="mx-cat-pick" data-arg="${c.id}">${esc(c.name)}<span class="mx-filter-count">${count}</span></button>
          <button data-activation=write class="mx-filter-edit" data-action="mx-cat-edit" data-arg="${c.id}" title="${esc(tr(T.rename))}" aria-label="${esc(tr(T.rename))} · ${esc(c.name)}">${EDIT}</button>
        </div>`;
    }).join('');

    const shown = cat ? itemsIn(d, cat.id, activeSub) : items.slice();
    const subfilters = cat ? `
      <div class="mx-subfilters">
        <button data-activation=write class="mx-subfilter ${activeSub == null ? 'on' : ''}" data-action="mx-sub-pick" data-arg="${cat.id}::">${esc(tr(T.allItems))}</button>
        ${(cat.sub || []).map((s) => `<button data-activation=write class="mx-subfilter ${activeSub === s.id ? 'on' : ''}" data-action="mx-sub-pick" data-arg="${cat.id}::${s.id}">${esc(s.name)} · ${itemsIn(d, cat.id, s.id).length}</button>`).join('')}
        <button data-activation=write class="mx-subfilter" data-action="mx-sub-add" data-arg="${cat.id}">${PLUS} ${esc(tr(T.addSub))}</button>
      </div>` : '';

    /* Le carnet des coûts et la base TVA sont lus UNE FOIS pour toute la liste.
     * Cette page se repeint à chaque frappe (voir bindCatStation), et
     * KiwiCost.itemCost() relit puis reparse le document à chaque appel : par
     * article, ça faisait autant de parsings de JSON que de lignes affichées,
     * à chaque lettre tapée dans la recherche. */
    const KC = window.KiwiCost;
    const costItems = (KC && KC.doc && KC.doc().items) || {};
    const mgHtml = (item) => {
      if (!KC || !KC.marginOf) return '';
      const e = costItems[item.id];
      const c = e && +e.cost > 0 ? +e.cost : null;
      const mg = c == null ? null : KC.marginOf(item.price, c);
      if (!mg) return `<i class="mg none">${esc(tr(T.costNone))}</i>`;
      return `<i class="mg${mg.profit < 0 ? ' bad' : ''}">${fmtPct(mg.pct)} %</i>`;
    };

    const itemRows = shown.length ? shown.map((it) => {
      const itemCat = catById(d, it.catId);
      const sub = itemCat && (itemCat.sub || []).find((s) => s.id === it.subId);
      /* Plus de pastille de poste par plat : tous les plats affichés ici
       * partagent la catégorie ouverte, donc son poste. Le répéter sur chaque
       * ligne laisserait croire qu'il se règle ligne par ligne. Il se lit une
       * fois, en tête de volet, là où il se règle.
       *
       * En revanche les options, elles, sont propres au plat — et savoir qu'un
       * produit fera parler le comptoir avant d'entrer dans la note se lit d'un
       * coup d'œil, sans ouvrir la fiche. */
      const nOpt = (Array.isArray(it.opts) ? it.opts : []).filter((x) => !!optById(d, x)).length;
      const station = itemCat && stationById(d, itemCat.station || kitchenIdOf(d));
      const footer = [sub && sub.name, station && station.name, nOpt ? tr(T.optCount).replace('{n}', nOpt) : ''].filter(Boolean).join(' · ');
      return `
        <div class="mx-product-card ${it.avail === false ? 'off' : ''}">
          <div class="cat">${esc(itemCat ? itemCat.name : tr(T.title))}</div>
          <div class="name">${esc(it.name)}</div>
          <div class="desc">${esc(it.desc || '')}</div>
          <div class="price">${fmt(it.price)} MAD${mgHtml(it)}</div>
          <div class="foot">
            <span class="meta">${esc(footer || tr(it.avail === false ? T.unavail : T.avail))}</span>
            <button type="button" class="sw ${it.avail === false ? '' : 'on'}" data-action="mx-item-avail" data-arg="${it.id}" role="switch" aria-checked="${it.avail !== false}" aria-label="${esc(it.name)}" title="${esc(tr(it.avail === false ? T.unavail : T.avail))}"></button>
            <div class="act">
              <button data-activation=write data-action="mx-item-edit" data-arg="${it.id}" title="${esc(tr(T.rename))}">${EDIT}</button>
              <button class="del" data-action="mx-item-del" data-arg="${it.id}" title="${esc(tr(T.del))}">${TRASH}</button>
            </div>
          </div>
        </div>`;
    }).join('') : `<div class="mx-empty-items">${esc(tr(T.noItems))}</div>`;

    const body = `
      <div class="mx-wrap">
        <div class="mx-menu-tabs">
          <button class="mx-menu-tab on" type="button">${LIST}<span>${esc(tr(T.title))}</span></button>
          <button class="mx-menu-tab" type="button" data-action="mx-stations-manage">${BELL}<span>${esc(tr(T.stations))}</span></button>
          <button class="mx-menu-tab" type="button" data-action="mx-opts"><span>${esc(tr(T.opts))}</span></button>
          ${orderProOn() ? `<button data-activation=write class="mx-menu-tab" type="button" data-action="orderpro-tags"><span>${esc(tr(T.tags))}</span></button>` : ''}
          ${orderProOn() ? `<button data-activation=write class="mx-menu-tab" type="button" data-action="orderpro-guestpage"><span>${esc(tr(T.guestPage))}</span></button>` : ''}
        </div>
        <div class="mx-catalog">
          <div class="mx-catalog-tools">
            <div class="mx-filter-row">
              <div class="mx-filter-pair ${activeCat === 'all' ? 'on' : ''}">
                <button class="mx-filter-pill" data-action="mx-cat-pick" data-arg="all">${esc(tr(T.allItems))}<span class="mx-filter-count">${items.length}</span></button>
              </div>
              ${filters}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex:0 0 auto;">
              ${cat ? `<button class="mx-cat-add" style="width:auto;border-style:solid;margin:0;" data-action="mx-stations">${BELL}<span>${esc(tr(T.catStationL))}</span></button>` : ''}
              <button data-activation=write class="mx-cat-add" style="width:auto;border-style:solid;margin:0;" data-action="mx-import">${DOWNLOAD}<span>${esc(tr(T.importCsv))}</span></button>
              <button data-activation=write class="mx-cat-add" style="width:auto;border-style:solid;margin:0;" data-action="mx-cat-add">${PLUS}<span>${esc(tr(T.addCat))}</span></button>
              <button data-activation=write class="mx-pane-add" data-action="mx-item-add">${PLUS}<span>${esc(tr(T.addItem))}</span></button>
            </div>
          </div>
          ${subfilters}
          <div class="mx-card-grid">
            ${itemRows}
          </div>
        </div>
      </div>`;

    window.Kiwi.appPage('menu', {
      title: tr(T.title),
      subtitle: `${items.length} ${tr(T.products)} · ${cats.length} ${tr(T.cats)} · ${esc(venueName())}`,
      body,
    });
  }

    return { renderEmpty, renderLegacy, selection: () => ({ activeCat, activeSub }) };
  };
})(window.KiwiMenuCatalogParts = window.KiwiMenuCatalogParts || {});
