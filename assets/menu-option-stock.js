/* Ce que sort une option du stock (« Boisson : Coca-Cola » sort une canette,
 * « Supplément cheddar » 0,03 kg de cheddar).
 *
 * Le lien ne vit pas sur la carte : la carte est publique (page client, QR) et
 * un grammage est une fiche technique. Il vit dans le document privé des coûts,
 * comme les recettes, sous la clé `opt:<id du choix>` ; la caisse le lit déjà
 * et assets/inventory-consumption.js le décompte à chaque vente, multiplié par
 * la quantité du plat.
 *
 * Ce module habille la fenêtre « Options » de la carte
 * (assets/menu-catalog/modifiers.js), qui annonce chaque rendu par l'événement
 * DOM `kiwi-menu-options-painted`. Sans stock ni document des coûts, rien ne
 * s'affiche et la fenêtre reste celle d'avant. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  const STR = {
    none: { fr: 'Ne sort rien du stock', en: 'Takes nothing from stock', ar: 'ما كيخرّج والو من المخزون' },
    label: { fr: 'Sort du stock', en: 'Takes from stock', ar: 'كيخرّج من المخزون' },
    qty: { fr: 'Quantité par plat', en: 'Quantity per dish', ar: 'الكمية لكل طبق' },
  };
  const lang = () => {
    try { return window.KiwiI18n?.getLang?.() || 'fr'; } catch (_) { return 'fr'; }
  };
  const tr = (key) => STR[key][lang()] || STR[key].fr;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (v) => String(v == null ? '' : v).trim();
  const fine = (v) => Math.round(Math.max(0, Number(v) || 0) * 1000) / 1000;
  const venue = () => window.KiwiVenue?.getCurrentVenueData?.()?.id || window.KiwiVenue?.getVenue?.() || undefined;
  const ICON = '<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg>';

  function articles() {
    try {
      const rows = window.KiwiRestaurantStock?.rows?.() || [];
      return rows.filter((r) => r && r.id && clean(r.name))
        .map((r) => ({ id: String(r.id), name: clean(r.name), unit: clean(r.unit) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    } catch (_) { return []; }
  }
  function costDoc() {
    try { return window.KiwiCost?.doc?.() || null; } catch (_) { return null; }
  }
  function linkOf(choiceId) {
    const rec = costDoc()?.recipes?.['opt:' + choiceId];
    const line = rec && Array.isArray(rec.lines) ? rec.lines[0] : null;
    return line && line.stock ? { stock: String(line.stock), qty: +line.stockQty || +line.qty || 0, rec } : null;
  }

  /* Écrire le lien. Une quantité nulle ou aucun article retire la fiche,
   * comme une recette supprimée (pierre tombale comprise, pour que l'autre
   * appareil ne la ressuscite pas). */
  function save(ref, stockId, qty) {
    const K = window.KiwiCost;
    if (!K?.store?.update) return;
    const key = 'opt:' + ref.choiceId;
    const amount = fine(qty);
    if (!stockId || !(amount > 0)) {
      if (costDoc()?.recipes?.[key] && K.removeRecipe) K.removeRecipe(key, venue());
      return;
    }
    const art = articles().find((a) => a.id === stockId);
    K.store.update((d) => {
      d.recipes = d.recipes || {};
      const gone = d.removed && d.removed.recipes && +d.removed.recipes[key];
      d.recipes[key] = {
        status: 'complete', kind: 'option', name: ref.name, group: ref.groupId, groupName: ref.groupName, yield: 1,
        lines: [{ ing: 'stock:' + stockId, qty: amount, stock: stockId, stockQty: amount, stockUnit: art ? art.unit : '' }],
        at: Math.max(Date.now(), gone ? gone + 1 : 0),
      };
      if (gone) delete d.removed.recipes[key];
      return d;
    }, venue());
  }

  /* Le nom du choix voyage avec la fiche : une commande venue du serveur ne
   * porte plus que « Groupe : Choix ». Renommer le choix renomme la fiche. */
  function syncNames(body) {
    const K = window.KiwiCost;
    if (!K?.store?.update) return;
    const stale = refs(body).filter((ref) => {
      const rec = costDoc()?.recipes?.['opt:' + ref.choiceId];
      return rec && (rec.name !== ref.name || rec.groupName !== ref.groupName);
    });
    if (!stale.length) return;
    K.store.update((d) => {
      stale.forEach((ref) => {
        const rec = d.recipes && d.recipes['opt:' + ref.choiceId];
        if (rec) Object.assign(rec, { name: ref.name, groupName: ref.groupName, at: Math.max(Date.now(), (+rec.at || 0) + 1) });
      });
      return d;
    }, venue());
  }

  function refs(body) {
    return Array.from(body.querySelectorAll('.mx-og-ch[data-oc]')).map((row) => {
      const card = row.closest('[data-og]');
      return {
        row, choiceId: row.dataset.oc, groupId: card ? card.dataset.og : '',
        name: clean(row.querySelector('[data-oc-name]')?.value),
        groupName: clean(card?.querySelector('[data-og-name]')?.value),
      };
    }).filter((ref) => ref.choiceId);
  }

  function ensureStyle() {
    if (document.getElementById('kiwi-option-stock-style')) return;
    const style = document.createElement('style');
    style.id = 'kiwi-option-stock-style';
    style.textContent = `
      .mx-og-stock { display: flex; align-items: center; gap: 8px; margin: -2px 0 4px 56px; color: var(--n-500); font-size: 12px; }
      .mx-og-stock > svg { flex: 0 0 16px; }
      .mx-og-stock select { flex: 1 1 auto; min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px;
        font: inherit; font-size: 12.5px; color: var(--ink); background: var(--paper-soft); }
      .mx-og-stock input { width: 70px; border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; font: inherit;
        font-size: 12.5px; font-family: var(--mono); text-align: right; color: var(--ink); background: var(--paper-soft); }
      .mx-og-stock select:focus, .mx-og-stock input:focus { border-color: var(--atlas); background: var(--surface); outline: none; }
      .mx-og-stock .kiwi-select { flex: 1 1 auto; min-width: 0; }
      .mx-og-stock .kiwi-select .kiwi-select-trigger { min-height: 32px; padding: 4px 8px 4px 10px; border-radius: 8px;
        border-color: var(--line); background: var(--paper-soft); box-shadow: none; font-size: 12.5px; }
      .mx-og-stock .kiwi-select .kiwi-select-value-label { font-weight: 400; }
      .mx-og-stock .u { font-family: var(--mono); font-size: 11px; min-width: 28px; }
      .mx-og-stock input[hidden], .mx-og-stock .u[hidden] { display: none; }
      [dir="rtl"] .mx-og-stock { margin: -2px 56px 4px 0; }`;
    document.head.appendChild(style);
  }

  function decorate(body) {
    const list = articles();
    if (!list.length || !window.KiwiCost?.store) return;
    ensureStyle();
    refs(body).forEach((ref) => {
      if (ref.row.nextElementSibling && ref.row.nextElementSibling.classList.contains('mx-og-stock')) return;
      const link = linkOf(ref.choiceId);
      const known = link && list.some((a) => a.id === link.stock);
      const options = list.map((a) => `<option value="${esc(a.id)}"${link && link.stock === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
      const unit = link ? (list.find((a) => a.id === link.stock)?.unit || '') : '';
      const wrap = document.createElement('div');
      wrap.className = 'mx-og-stock';
      wrap.dataset.ocs = ref.choiceId;
      wrap.innerHTML = `${ICON}
        <select data-ocs-item aria-label="${esc(tr('label'))} · ${esc(ref.name)}">
          <option value="">${esc(tr('none'))}</option>${options}
          ${link && !known ? `<option value="${esc(link.stock)}" selected>${esc(link.stock)}</option>` : ''}
        </select>
        <input type="number" inputmode="decimal" min="0" step="any" data-ocs-qty value="${link ? esc(link.qty) : ''}"
               placeholder="1" aria-label="${esc(tr('qty'))} · ${esc(ref.name)}"${link ? '' : ' hidden'} />
        <span class="u"${link ? '' : ' hidden'}>${esc(unit)}</span>`;
      ref.row.after(wrap);
    });
    if (body.dataset.ocsWired) return;
    body.dataset.ocsWired = '1';
    const refFor = (wrap) => refs(body).find((r) => r.choiceId === wrap.dataset.ocs);
    const commit = (wrap) => {
      const ref = refFor(wrap); if (!ref) return;
      const item = wrap.querySelector('[data-ocs-item]').value;
      const qtyInput = wrap.querySelector('[data-ocs-qty]');
      const unit = wrap.querySelector('.u');
      if (item && !(+qtyInput.value > 0)) qtyInput.value = '1';
      qtyInput.hidden = !item; unit.hidden = !item;
      unit.textContent = item ? (articles().find((a) => a.id === item)?.unit || '') : '';
      save(ref, item, item ? qtyInput.value : 0);
    };
    let timer = null;
    body.addEventListener('change', (e) => {
      const wrap = e.target.closest('.mx-og-stock');
      if (wrap) { clearTimeout(timer); commit(wrap); }
    });
    body.addEventListener('input', (e) => {
      const wrap = e.target.closest('.mx-og-stock');
      if (wrap && e.target.matches('[data-ocs-qty]')) { clearTimeout(timer); timer = setTimeout(() => commit(wrap), 400); }
    });
    body.addEventListener('focusout', (e) => {
      if (e.target.matches('[data-oc-name], [data-og-name]')) setTimeout(() => syncNames(body), 450);
    });
  }

  document.addEventListener('kiwi-menu-options-painted', (e) => {
    try { if (e.target && e.target.querySelectorAll) decorate(e.target); } catch (_) {}
  });
})();
