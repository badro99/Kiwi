/* Menu item-editor. Exports: itemModal, registerHandlers, selection, setSelection.
 * Reads injected: store, tr, T, esc, catById, itemById, optsOf, optById, cleanFormula, fmt, fmtPct, venueName, promptText, render, addCategory, renameCategory, deleteCategory, addSubcategory, deleteItem, addItem, updateItem, confirmThen, categoryStationModal, stationsModal, optsModal, PLUS, TRASH, PICKER_SEARCH, PICKER_CHEVRON. Window reads are declared in split.json. */
(function (parts) {
  parts.item_editor = function (context) {
    'use strict';
    const { store, tr, T, esc, catById, itemById, optsOf, optById, cleanFormula, fmt, fmtPct, venueName, promptText, render, addCategory, renameCategory, deleteCategory, addSubcategory, deleteItem, addItem, updateItem, confirmThen, categoryStationModal, stationsModal, optsModal, PLUS, TRASH, PICKER_SEARCH, PICKER_CHEVRON } = context;
  let activeCat = 'all';
  let activeSub = null; // null = all subs of the active category


  function itemModal(existing) {
    const K = window.Kiwi;
    const d = store.get();
    const cats = d.cats || [];
    if (!cats.length) { promptText({ title: tr(T.addCat), desc: tr(T.firstCat), placeholder: tr(T.catName), ok: tr(T.addCat) }, (v) => { if (v) { addCategory(v); render(); } }); return; }
    const selectedCat = catById(d, activeCat) ? activeCat : cats[0].id;
    const it = existing || { name: '', price: '', catId: selectedCat, subId: activeSub || null, desc: '', avail: true, formulaOnly: false, showPhotoInFormulas: false, archived: false, photo: '', video: '', opts: [] };
    /* Le coût ne vient pas de l'article : il se lit dans le carnet des coûts,
       par identifiant. Un article neuf n'en a pas encore — il sera écrit après
       addItem(), quand l'identifiant existe. */
    const KC = window.KiwiCost;
    const costVal = (existing && KC && KC.itemCost(existing.id) != null) ? KC.itemCost(existing.id) : '';
    const groups = optsOf(d);
    const itOpts = Array.isArray(it.opts) ? it.opts : [];
    // Live media state for this modal — mutated by the picker, read on save.
    const media = { photo: it.photo || '', video: it.video || '' };

    const initialFormula = cleanFormula(it.formula, d.items);
    let formulaSlots = initialFormula && initialFormula.slots ? JSON.parse(JSON.stringify(initialFormula.slots)) : [];

    const catOpts = cats.map((c) => `<option value="${c.id}" ${c.id === it.catId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const subsFor = (cid) => (catById(d, cid) ? (catById(d, cid).sub || []) : []);
    const subOptsHtml = (cid, sel) => `<option value="">${esc(tr(T.none))}</option>` + subsFor(cid).map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');

    const m = K.modal({
      tag: venueName(),
      title: existing ? tr(T.rename) : tr(T.addItem),
      width: 480,
      body: `
        <div class="mx-field"><label>${esc(tr(T.nameL))}</label><input data-f-name type="text" value="${esc(it.name)}" placeholder="${esc(tr(T.nameL))}"/></div>
        <div class="mx-field two">
          <div><label>${esc(tr(T.priceL))}</label><input data-f-price type="number" inputmode="decimal" min="0" step="1" value="${esc(it.price)}" placeholder="0"/></div>
          <div><label>${esc(tr(T.catL))}</label><select data-f-cat>${catOpts}</select></div>
        </div>
        ${/* Le coût de revient. Il vit dans le document `costs`, PAS sur l'article :
              GET /api/menu sans ?mine=1 est public (c'est ce que sert une puce NFC),
              donc un coût posé ici partirait sur l'internet ouvert avec la carte —
              et la liste blanche de sanitizeMenu l'effacerait de toute façon à la
              première synchro. Voir l'en-tête de assets/cost.js. */''}
        <div class="mx-field">
          <label>${esc(tr(T.costL))} <span class="mx-opt-note">${esc(tr(T.costOpt))}</span></label>
          <input data-f-cost type="number" inputmode="decimal" min="0" step="0.01" value="${esc(costVal)}" placeholder="0" />
          <div class="mx-cost-live" data-f-margin></div>
        </div>
        ${/* Aucun sélecteur de poste ici : ce plat part au poste de sa catégorie,
              réglé une fois en tête de la liste des produits. */''}
        <div class="mx-field"><label>${esc(tr(T.subL))}</label><select data-f-sub>${subOptsHtml(it.catId, it.subId)}</select></div>
        ${/* Les options se COCHENT : un café peut demander le lait ET la taille.
              Une liste déroulante n'aurait laissé passer qu'une seule. */''}
        <div class="mx-field">
          <label>${esc(tr(T.optAttach))}</label>
          ${groups.length ? `<div class="mx-opts-pick">
            ${groups.map((g) => `<label>
              <input type="checkbox" data-f-opt value="${esc(g.id)}" ${itOpts.indexOf(g.id) >= 0 ? 'checked' : ''} />
              <span>${esc(g.name)}</span>${g.required ? `<i class="req">${esc(tr(T.optReq))}</i>` : ''}
            </label>`).join('')}
          </div>` : `<div class="mx-opts-none">${esc(tr(T.optNoneYet))}</div>`}
        </div>
        <div class="mx-formula-toggle-wrap">
          <label class="mx-formula-toggle-label">
            <input type="checkbox" data-f-is-formula ${formulaSlots.length ? 'checked' : ''} />
            <span>${esc(tr(T.formulaIs))}</span>
          </label>
          <div class="mx-formula-hint">${esc(tr(T.formulaHint))}</div>
          <div class="mx-formula-wrap" data-f-formula-wrap ${formulaSlots.length ? '' : 'hidden'}>
            <div data-f-slots-container></div>
            <button data-activation=write type="button" class="mx-formula-add-slot-btn" data-f-add-slot>${PLUS}<span>${esc(tr(T.formulaAddSlot))}</span></button>
          </div>
        </div>
        <div class="mx-field"><label>${esc(tr(T.descL))}</label><textarea data-f-desc placeholder="${esc(tr(T.descL))}">${esc(it.desc || '')}</textarea></div>
        <div class="mx-field two">
          <label class="mx-formula-toggle-label"><input type="checkbox" data-f-standalone ${it.formulaOnly ? '' : 'checked'} /><span>${esc(tr(T.standalone))}</span></label>
          <label class="mx-formula-toggle-label"><input type="checkbox" data-f-formula-photo ${it.showPhotoInFormulas ? 'checked' : ''} /><span>${esc(tr(T.formulaPhoto))}</span></label>
        </div>
        <div class="mx-formula-hint" style="margin-top:-7px;">${esc(tr(T.formulaPhotoHint))}</div>
        <div class="mx-field"><label class="mx-formula-toggle-label"><input type="checkbox" data-f-archived ${it.archived ? 'checked' : ''} /><span>${esc(tr(T.archived))}</span></label></div>
        <div class="mx-field">
          <label>${esc(tr(T.mediaL))}</label>
          <div class="mx-media" data-f-media></div>
          <div class="mx-media-msg" data-f-media-msg>${esc(tr(T.mediaHint))}</div>
          <input type="file" data-f-photo-input accept="image/*" hidden />
          <input type="file" data-f-video-input accept="video/*" hidden />
        </div>`,
      foot: `<button class="kb ghost" type="button" data-f-cancel style="flex:1;justify-content:center;">${esc(tr(T.cancel))}</button>
             <button data-activation=write class="kb atlas" type="button" data-f-save style="flex:1.3;justify-content:center;">${esc(tr(T.save))}</button>`,
    });
    const q = (s) => m.el.querySelector(s);
    q('[data-f-cat]').addEventListener('change', (e) => { q('[data-f-sub]').innerHTML = subOptsHtml(e.target.value, null); });

    /* ── formule / menu composé ─────────────────────────────────────────── */
    const availableItems = (d.items || []).filter((x) => x && x.id && !x.archived && (!existing || x.id !== existing.id));
    const isFormulaCb = q('[data-f-is-formula]');
    const formulaWrap = q('[data-f-formula-wrap]');
    const slotsContainer = q('[data-f-slots-container]');

    function renderFormulaSlots() {
      if (!slotsContainer) return;
      if (!formulaSlots.length) {
        slotsContainer.innerHTML = `<div style="font-size:12px;color:var(--n-500);padding:6px 2px;">${esc(tr(T.formulaNoSlots))}</div>`;
        return;
      }
      slotsContainer.innerHTML = formulaSlots.map((slot, si) => {
        const choicesHtml = (slot.choices || []).map((ch, ci) => {
          const match = (d.items || []).find((x) => x.id === ch.itemId);
          const chName = match ? match.name : ch.itemId;
          const matchCat = match && catById(d, match.catId);
          return `
            <div class="mx-slot-choice-row" data-si="${si}" data-ci="${ci}">
              <div class="mx-slot-choice-name">
                ${esc(chName)} ${matchCat ? `<span style="font-size:11px;color:var(--n-500);margin-left:4px;">(${esc(matchCat.name)})</span>` : ''}
              </div>
              <div class="mx-slot-choice-extra">
                <span>+</span>
                <input type="number" min="0" max="100000" step="1" data-f-ch-extra="${si}-${ci}" value="${ch.extra || 0}" />
                <span>MAD</span>
              </div>
              <button type="button" class="mx-slot-del-btn" data-f-del-choice="${si}-${ci}" title="${esc(tr(T.del))}">${TRASH}</button>
            </div>`;
        }).join('');

        const availableToAdd = availableItems.filter((it) => !(slot.choices || []).some((c) => c.itemId === it.id));
        const pickerOption = (it, category) => {
          const sub = category && (category.sub || []).find((entry) => entry.id === it.subId);
          const context = sub ? sub.name : (category ? category.name : tr(T.uncategorized));
          const search = `${it.name || ''} ${category ? category.name : ''} ${sub ? sub.name : ''}`.toLocaleLowerCase();
          return `<button type="button" class="mx-formula-picker-option" role="option" data-f-picker-item="${esc(it.id)}" data-f-picker-si="${si}" data-picker-search="${esc(search)}"><span class="mx-formula-picker-option-copy"><strong>${esc(it.name)}</strong><small>${esc(context)}</small></span><span class="mx-formula-picker-price">${fmt(it.price)} MAD</span><span class="mx-formula-picker-add">${PLUS}</span></button>`;
        };
        const pickerGroups = (d.cats || []).map((category) => {
          const items = availableToAdd.filter((it) => it.catId === category.id);
          return items.length ? `<section class="mx-formula-picker-group" data-picker-group><div class="mx-formula-picker-group-title">${esc(category.name)}</div>${items.map((it) => pickerOption(it, category)).join('')}</section>` : '';
        }).join('');
        const uncategorized = availableToAdd.filter((it) => !(d.cats || []).some((category) => category.id === it.catId));
        const pickerGroupsHtml = pickerGroups + (uncategorized.length ? `<section class="mx-formula-picker-group" data-picker-group><div class="mx-formula-picker-group-title">${esc(tr(T.uncategorized))}</div>${uncategorized.map((it) => pickerOption(it, null)).join('')}</section>` : '');

        let addChBarHtml = '';
        if (availableItems.length === 0) {
          addChBarHtml = `
            <div class="mx-slot-empty-notice" style="background:var(--n-50,#f8f9fa);border:1px dashed var(--n-300,#d0d5dd);border-radius:6px;padding:10px 12px;margin-top:6px;font-size:12px;color:var(--n-700,#344054);">
              <div>${esc(tr(T.formulaNoItems))}</div>
              <button data-activation=write type="button" class="kb ghost sm" data-f-save-and-create style="margin-top:8px;font-size:11.5px;font-weight:600;">${esc(tr(T.formulaSaveAndCreate))}</button>
            </div>`;
        } else if (availableToAdd.length === 0) {
          addChBarHtml = `
            <div class="mx-slot-all-chosen" style="font-size:11.5px;color:var(--n-500);padding:6px 2px;">
              ${esc(tr(T.formulaAllChosen))}
            </div>`;
        } else {
          addChBarHtml = `
            <div class="mx-slot-add-ch-bar">
              <button data-activation=write type="button" class="mx-formula-picker-trigger" data-f-picker-toggle="${si}" aria-haspopup="listbox" aria-expanded="false"><span class="mx-formula-picker-icon">${PICKER_SEARCH}</span><span class="mx-formula-picker-copy"><strong>${esc(tr(T.formulaAddCh))}</strong><small>${esc(tr(T.formulaBrowse))}</small></span><span class="mx-formula-picker-chevron">${PICKER_CHEVRON}</span></button>
              <div class="mx-formula-picker" data-f-picker-panel="${si}" role="listbox" aria-label="${esc(tr(T.formulaPickIt))}" hidden>
                <div class="mx-formula-picker-search"><label>${PICKER_SEARCH}<input type="search" data-f-picker-search="${si}" placeholder="${esc(tr(T.formulaSearch))}" autocomplete="off" /></label></div>
                <div class="mx-formula-picker-results">${pickerGroupsHtml}<div class="mx-formula-picker-empty" data-picker-empty hidden>${esc(tr(T.formulaNoMatch))}</div></div>
              </div>
            </div>`;
        }

        return `
          <div class="mx-slot-card" data-slot-index="${si}">
            <div class="mx-slot-head">
              <input type="text" class="mx-slot-label-inp" data-f-slot-label="${si}" value="${esc(slot.label)}" placeholder="${esc(tr(T.formulaSlotNm))}" />
              <div class="mx-slot-bounds">
                <label>${esc(tr(T.formulaMin))}</label>
                <input type="number" min="0" max="10" data-f-slot-min="${si}" value="${slot.min != null ? slot.min : 1}" />
                <label>${esc(tr(T.formulaMax))}</label>
                <input type="number" min="1" max="10" data-f-slot-max="${si}" value="${slot.max != null ? slot.max : 1}" />
              </div>
              ${si > 0 ? `<button type="button" class="mx-slot-move-btn" data-f-slot-move="${si},-1" title="${esc(tr(T.moveUp))}" aria-label="${esc(tr(T.moveUp))}">↑</button>` : ''}
              ${si < formulaSlots.length - 1 ? `<button type="button" class="mx-slot-move-btn" data-f-slot-move="${si},1" title="${esc(tr(T.moveDown))}" aria-label="${esc(tr(T.moveDown))}">↓</button>` : ''}
              <button type="button" class="mx-slot-del-btn" data-f-slot-del="${si}" title="${esc(tr(T.formulaDelSlot))}">${TRASH}</button>
            </div>
            <div class="mx-slot-choices-list">${choicesHtml || `<div style="font-size:11.5px;color:var(--n-500);padding:2px 0;">${esc(tr(T.formulaNoChoice))}</div>`}</div>
            ${addChBarHtml}
          </div>`;
      }).join('');
    }

    if (isFormulaCb) {
      isFormulaCb.addEventListener('change', () => {
        const on = isFormulaCb.checked;
        if (on && !formulaSlots.length) {
          formulaSlots.push({ id: 'sl_1', label: '', min: 1, max: 1, choices: [] });
        }
        if (formulaWrap) formulaWrap.hidden = !on;
        renderFormulaSlots();
      });
    }

    if (m.el.querySelector('[data-f-add-slot]')) {
      m.el.querySelector('[data-f-add-slot]').addEventListener('click', () => {
        const nextId = 'sl_' + (formulaSlots.length + 1);
        formulaSlots.push({ id: nextId, label: '', min: 1, max: 1, choices: [] });
        renderFormulaSlots();
      });
    }

    slotsContainer && slotsContainer.addEventListener('input', (e) => {
      const pickerSearch = e.target.closest('[data-f-picker-search]');
      if (pickerSearch) {
        const panel = pickerSearch.closest('[data-f-picker-panel]');
        const term = pickerSearch.value.trim().toLocaleLowerCase();
        let visible = 0;
        panel.querySelectorAll('[data-picker-search]').forEach((option) => {
          const match = !term || (option.dataset.pickerSearch || '').includes(term);
          option.hidden = !match;
          if (match) visible += 1;
        });
        panel.querySelectorAll('[data-picker-group]').forEach((group) => { group.hidden = !group.querySelector('[data-picker-search]:not([hidden])'); });
        const empty = panel.querySelector('[data-picker-empty]');
        if (empty) empty.hidden = visible !== 0;
        return;
      }
      const lblInp = e.target.closest('[data-f-slot-label]');
      if (lblInp) {
        const si = Number(lblInp.dataset.fSlotLabel);
        if (formulaSlots[si]) formulaSlots[si].label = lblInp.value;
        return;
      }
      const minInp = e.target.closest('[data-f-slot-min]');
      if (minInp) {
        const si = Number(minInp.dataset.fSlotMin);
        if (formulaSlots[si]) formulaSlots[si].min = Math.max(0, Math.min(10, Math.round(Number(minInp.value) || 0)));
        return;
      }
      const maxInp = e.target.closest('[data-f-slot-max]');
      if (maxInp) {
        const si = Number(maxInp.dataset.fSlotMax);
        if (formulaSlots[si]) formulaSlots[si].max = Math.max(1, Math.min(10, Math.round(Number(maxInp.value) || 1)));
        return;
      }
      const extInp = e.target.closest('[data-f-ch-extra]');
      if (extInp) {
        const [si, ci] = extInp.dataset.fChExtra.split('-').map(Number);
        if (formulaSlots[si] && formulaSlots[si].choices && formulaSlots[si].choices[ci]) {
          formulaSlots[si].choices[ci].extra = Math.max(0, Math.min(1e5, Number(extInp.value) || 0));
        }
      }
    });

    slotsContainer && slotsContainer.addEventListener('click', (e) => {
      const pickerToggle = e.target.closest('[data-f-picker-toggle]');
      if (pickerToggle) {
        const panel = slotsContainer.querySelector(`[data-f-picker-panel="${pickerToggle.dataset.fPickerToggle}"]`);
        const willOpen = panel && panel.hidden;
        slotsContainer.querySelectorAll('[data-f-picker-panel]').forEach((entry) => { entry.hidden = true; });
        slotsContainer.querySelectorAll('[data-f-picker-toggle]').forEach((entry) => { entry.setAttribute('aria-expanded', 'false'); });
        if (panel && willOpen) {
          panel.hidden = false;
          pickerToggle.setAttribute('aria-expanded', 'true');
          requestAnimationFrame(() => panel.querySelector('[data-f-picker-search]')?.focus());
        }
        return;
      }
      const pickerItem = e.target.closest('[data-f-picker-item]');
      if (pickerItem) {
        const si = Number(pickerItem.dataset.fPickerSi);
        const pickedId = pickerItem.dataset.fPickerItem;
        if (pickedId && formulaSlots[si]) {
          formulaSlots[si].choices = formulaSlots[si].choices || [];
          if (!formulaSlots[si].choices.some((choice) => choice.itemId === pickedId)) {
            formulaSlots[si].choices.push({ itemId: pickedId, extra: 0 });
            renderFormulaSlots();
          }
        }
        return;
      }
      const saveAndCreateBtn = e.target.closest('[data-f-save-and-create]');
      if (saveAndCreateBtn) {
        saveCurrent(() => { itemModal(null); });
        return;
      }
      const delSlotBtn = e.target.closest('[data-f-slot-del]');
      if (delSlotBtn) {
        const si = Number(delSlotBtn.dataset.fSlotDel);
        formulaSlots.splice(si, 1);
        renderFormulaSlots();
        return;
      }
      const moveSlotBtn = e.target.closest('[data-f-slot-move]');
      if (moveSlotBtn) {
        const [si, delta] = moveSlotBtn.dataset.fSlotMove.split(',').map(Number);
        const target = si + delta;
        if (target >= 0 && target < formulaSlots.length) {
          const item = formulaSlots.splice(si, 1)[0];
          formulaSlots.splice(target, 0, item);
          renderFormulaSlots();
        }
        return;
      }
      const delChBtn = e.target.closest('[data-f-del-choice]');
      if (delChBtn) {
        const [si, ci] = delChBtn.dataset.fDelChoice.split('-').map(Number);
        if (formulaSlots[si] && formulaSlots[si].choices) {
          formulaSlots[si].choices.splice(ci, 1);
          renderFormulaSlots();
        }
        return;
      }
    });

    slotsContainer && slotsContainer.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const panel = e.target.closest('[data-f-picker-panel]');
      if (!panel) return;
      const si = panel.dataset.fPickerPanel;
      panel.hidden = true;
      const trigger = slotsContainer.querySelector(`[data-f-picker-toggle="${si}"]`);
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus();
    });
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('.mx-slot-add-ch-bar')) return;
      slotsContainer?.querySelectorAll('[data-f-picker-panel]').forEach((panel) => { panel.hidden = true; });
      slotsContainer?.querySelectorAll('[data-f-picker-toggle]').forEach((trigger) => { trigger.setAttribute('aria-expanded', 'false'); });
    });

    renderFormulaSlots();

    /* ── la marge, pendant qu'il tape ──────────────────────────────────────
       Le patron apprend le rapport prix/coût en le VOYANT bouger, pas en lisant
       une définition. C'est aussi là que se corrige la confusion la plus
       répandue : un coefficient ×1,5 n'est pas 50 % de marge mais 33 %. Le
       chiffre s'affiche à côté de ce qu'il vient de taper, donc l'écart se
       constate au lieu de se raconter. Rien ne s'affiche tant que les deux
       champs ne sont pas remplis — surtout pas « 100 % ». */
    function paintMargin() {
      const box = q('[data-f-margin]'); if (!box) return;
      const price = +q('[data-f-price]').value || 0;
      const cost = +q('[data-f-cost]').value || 0;
      const mg = KC && KC.marginOf ? KC.marginOf(price, cost) : null;
      if (!mg) { box.textContent = ''; box.className = 'mx-cost-live'; return; }
      const b = KC.basis();
      const ht = b.mode === 'rate' && b.included
        ? ` <i>${esc(tr(T.costHT).replace('{r}', b.rate))}</i>` : '';
      if (mg.profit < 0) {
        box.className = 'mx-cost-live bad';
        box.innerHTML = `${esc(tr(T.costOver))}${ht}`;
        return;
      }
      box.className = 'mx-cost-live';
      box.innerHTML = esc(tr(T.costMargin).replace('{mad}', fmt(mg.profit)).replace('{pct}', fmtPct(mg.pct))) + ht;
    }
    q('[data-f-price]').addEventListener('input', paintMargin);
    q('[data-f-cost]').addEventListener('input', paintMargin);
    paintMargin();

    /* ── media: pick a file → it goes to R2 → we keep the URL ──
       The buttons are always live. If the account has no media storage yet the
       upload answers `no-media` and we say so in one line — an honest "not
       switched on" beats a button that looks broken. */
    const msg = (text) => { const el = q('[data-f-media-msg]'); if (el) el.textContent = text; };
    function renderMedia() {
      const box = q('[data-f-media]');
      if (!box) return;
      /* L'aperçu TOURNE, comme chez le client : c'est la seule façon pour le
         patron de juger sa boucle — un point de départ mal choisi ne se voit
         que quand ça reboucle. */
      const preview = media.video
        ? `<video class="mx-media-prev" src="${esc(media.video)}" autoplay loop muted playsinline preload="metadata" disablepictureinpicture></video>`
        : (media.photo ? `<img class="mx-media-prev" src="${esc(media.photo)}" alt="" />` : '');
      const del = (media.photo || media.video)
        ? `<button class="kb ghost mx-media-btn" type="button" data-f-media-del>${esc(tr(T.mediaDel))}</button>` : '';
      box.innerHTML = `
        ${preview}
        <div class="mx-media-actions">
          <button data-activation=write class="kb ghost mx-media-btn" type="button" data-f-pick-photo>${esc(tr(T.mediaAdd))}</button>
          <button class="kb ghost mx-media-btn" type="button" data-f-pick-video>${esc(tr(T.mediaVid))}</button>
          ${del}
        </div>`;
    }
    /* La phrase vient de KiwiOrderPro.uploadError : c'est lui qui connaît la
       taille réelle, le plafond et l'extension refusée. Le repli local ne sert
       qu'au cas où le publisher n'est pas chargé — il reste vague parce qu'il
       n'a, lui, aucun chiffre à donner. */
    function uploadErr(res) {
      var code = (res && res.error) || res;
      try {
        if (window.KiwiOrderPro && window.KiwiOrderPro.uploadError && res && res.error) {
          return window.KiwiOrderPro.uploadError(res);
        }
      } catch (_) {}
      if (code === 'no-media' || code === 'not-configured') return tr(T.mediaOff);
      if (code === 'too-large') return tr(T.mediaBig);
      if (code === 'bad-type') return tr(T.mediaBad);
      return tr(T.mediaErr);
    }
    /* Ce que le fichier contient VRAIMENT, avant de l'envoyer. Le navigateur
       sait lire la durée et les dimensions d'un clip sans le téléverser : on
       refuse donc localement, tout de suite, avec la durée constatée — plutôt
       que de faire monter quinze mégaoctets pour dire non ensuite. */
    const MAX_CLIP_S = 10;
    function probeClip(file) {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true;
        const done = (r) => { URL.revokeObjectURL(url); resolve(r); };
        v.onloadedmetadata = () => done({ ok: true, seconds: v.duration || 0, w: v.videoWidth, h: v.videoHeight });
        v.onerror = () => done({ ok: false });
        // Un conteneur que le navigateur ne sait pas lire ne doit pas bloquer
        // l'envoi : le serveur tranchera sur le type MIME.
        setTimeout(() => done({ ok: false }), 4000);
        v.src = url;
      });
    }

    async function handleFile(file, kind) {
      if (!file) return;
      if (!window.KiwiOrderPro || !window.KiwiOrderPro.uploadMedia) { msg(tr(T.mediaOff)); return; }
      let warn = '';
      if (kind === 'video') {
        const p = await probeClip(file);
        if (p.ok && p.seconds > MAX_CLIP_S + 0.5) {
          msg(tr(T.mediaLong).replace('{n}', Math.round(p.seconds)).replace('{max}', MAX_CLIP_S));
          return;
        }
        if (p.ok && p.w && p.h && p.w > p.h) warn = tr(T.mediaWide);
      }
      msg(tr(T.mediaUp));
      const res = await window.KiwiOrderPro.uploadMedia(file);
      if (!res || !res.ok) { msg(uploadErr(res)); return; }
      // One medium per item: a video supersedes a photo and vice-versa, so the
      // card can never show two competing things.
      if (kind === 'video') { media.video = res.url; media.photo = ''; }
      else { media.photo = res.url; media.video = ''; }
      // L'avertissement de cadrage survit à l'envoi : c'est APRÈS, en voyant
      // l'aperçu recadré, qu'il devient compréhensible.
      msg(warn || tr(T.mediaHint));
      renderMedia();
    }
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-f-pick-photo]')) { q('[data-f-photo-input]').click(); return; }
      if (e.target.closest('[data-f-pick-video]')) { q('[data-f-video-input]').click(); return; }
      if (e.target.closest('[data-f-media-del]')) { media.photo = ''; media.video = ''; renderMedia(); return; }
    });
    q('[data-f-photo-input]').addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0], 'photo'));
    q('[data-f-video-input]').addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0], 'video'));
    renderMedia();

    function saveCurrent(onSuccess) {
      const isFormula = isFormulaCb && isFormulaCb.checked;
      const formulaData = isFormula && formulaSlots.length ? { slots: formulaSlots } : null;
      const data = {
        name: q('[data-f-name]').value, price: q('[data-f-price]').value,
        catId: q('[data-f-cat]').value, subId: q('[data-f-sub]').value || null, desc: q('[data-f-desc]').value,
        photo: media.photo, video: media.video,
        formula: formulaData,
        formulaOnly: !q('[data-f-standalone]').checked,
        showPhotoInFormulas: q('[data-f-formula-photo]').checked,
        archived: q('[data-f-archived]').checked,
        // Aucun poste ici : un plat part au poste de SA catégorie. Changer de
        // catégorie dans ce formulaire change donc son poste — c'est la même
        // phrase dite une fois, et c'est tout l'intérêt.
        // Les groupes cochés, dans l'ordre de la bibliothèque : c'est l'ordre
        // dans lequel le comptoir posera les questions.
        opts: [].slice.call(m.el.querySelectorAll('[data-f-opt]'))
          .filter((el) => el.checked).map((el) => el.value),
      };
      if (!data.name.trim()) { q('[data-f-name]').focus(); return; }
      const costRaw = q('[data-f-cost]').value;
      let costId = existing ? existing.id : null;
      if (existing) updateItem(existing.id, data);
      else {
        addItem(data); activeCat = data.catId; activeSub = data.subId || null;
        /* addItem() ne rend pas l'article, seulement le document. Le nouvel
           article est le dernier poussé — c'est là que son identifiant existe
           pour la première fois, et donc le premier instant où son coût peut
           être rangé quelque part. */
        const nd = store.get(); const last = (nd.items || [])[nd.items.length - 1];
        costId = last ? last.id : null;
      }
      /* Champ vidé ⇒ le coût est EFFACÉ (setItemCost traite 0 et vide de la même
         façon). Un patron qui efface son chiffre dit « je ne sais plus », et la
         marge doit redevenir « non chiffré » plutôt que rester sur l'ancien. */
      if (costId && KC && KC.setItemCost) {
        try { KC.setItemCost(costId, costRaw === '' ? null : +costRaw, (window.KiwiStaff && window.KiwiStaff.name) || ''); } catch (_) {}
      }
      m.close(); render();
      if (window.Kiwi.toast) window.Kiwi.toast(tr(T.saved), { type: 'success', force: true });
      if (typeof onSuccess === 'function') onSuccess();
      return true;
    }

    q('[data-f-cancel]').addEventListener('click', () => m.close());
    q('[data-f-save]').addEventListener('click', () => saveCurrent());
    setTimeout(() => { try { q('[data-f-name]').focus(); } catch (_) {} }, 180);
  }

  function registerHandlers() {
    const H = window.Kiwi && window.Kiwi.handlers;
    if (!H) return;
    H['mx-cat-add'] = () => promptText({ title: tr(T.addCat), placeholder: tr(T.catName), ok: tr(T.addCat) }, (v) => { if (v) { const c = addCategory(v); const d = store.get(); const last = d.cats[d.cats.length - 1]; if (last) { activeCat = last.id; activeSub = null; } render(); } });
    H['mx-cat-pick'] = (_el, id) => { activeCat = id; activeSub = null; render(); };
    H['mx-sub-pick'] = (_el, arg) => { const [cid, sid] = String(arg || '').split('::'); activeCat = cid; activeSub = sid || null; render(); };
    H['mx-cat-edit'] = (_el, id) => {
      const d = store.get(); const c = catById(d, id); if (!c) return;
      promptText({ title: tr(T.rename), value: c.name, placeholder: tr(T.catName), ok: tr(T.save),
        desc: `<button class="kb ghost" type="button" data-action="mx-cat-del" data-arg="${id}" style="color:var(--danger);border-color:var(--danger);padding:6px 12px;font-size:12px;">${esc(tr(T.del))}</button>` },
        (v) => { if (v) { renameCategory(id, v); render(); } });
    };
    H['mx-cat-del'] = (_el, id) => {
      // close any open modal, then confirm
      document.querySelectorAll('.modal-veil, .kiwi-modal-veil').forEach((v) => { try { v.remove(); } catch (_) {} });
      confirmThen(tr(T.delCatQ), () => { deleteCategory(id); if (activeCat === id) { activeCat = null; activeSub = null; } render(); });
    };
    H['mx-sub-add'] = (_el, id) => promptText({ title: tr(T.addSub), placeholder: tr(T.subName), ok: tr(T.addSub) }, (v) => { if (v) { addSubcategory(id, v); activeCat = id; render(); } });
    // This button belongs to the category currently open in the menu pane.
    // Do not fall back to the station-management screen: the merchant only
    // needs to choose or create the single destination for this category.
    H['mx-stations'] = () => { if (activeCat) categoryStationModal(activeCat); };
    H['mx-stations-manage'] = () => stationsModal();
    H['mx-opts'] = () => optsModal();
    H['mx-item-add'] = () => itemModal(null);
    H['mx-item-edit'] = (_el, id) => { const it = itemById(store.get(), id); if (it) itemModal(it); };
    H['mx-item-del'] = (_el, id) => confirmThen(tr(T.delItemQ), () => { deleteItem(id); render(); });
    H['mx-item-avail'] = (_el, id) => { const it = itemById(store.get(), id); if (it) { updateItem(id, { avail: it.avail === false }); render(); } };
    /* Bring the carte over from whatever the kitchen used before — a spreadsheet
     * or an export from the old till. assets/catalog-import.js does the reading
     * and shows what it found; we only re-render once it has written. */
    H['mx-import'] = () => {
      if (!window.KiwiCatalogImport) {
        if (window.Kiwi.toast) window.Kiwi.toast(tr(T.importOff), { type: 'warn', desc: tr(T.importOffD), force: true });
        return;
      }
      window.KiwiCatalogImport.openMenu({ onDone: () => { activeCat = null; activeSub = null; render(); } });
    };
    H['mx-load-example'] = () => { store.loadExample(); activeCat = null; activeSub = null; render(); if (window.Kiwi.toast) window.Kiwi.toast(tr(T.example), { type: 'success', force: true }); try { window.Kiwi.confetti && window.Kiwi.confetti(); } catch (_) {} };
  }

    const selection = () => ({ activeCat, activeSub });
    const setSelection = (next) => { activeCat = next.activeCat; activeSub = next.activeSub; };
    return { itemModal, registerHandlers, selection, setSelection };
  };
})(window.KiwiMenuCatalogParts = window.KiwiMenuCatalogParts || {});
