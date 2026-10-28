/* OrderPro menu. Exports: feedMedia, dishMedia, dishTag, renderMenu, renderMenuSubtabs, activeMenuFilter, choiceLabel, groupLabel, choiceEmoji, describeOptions, describeOptionChoices, describeOptionVisuals, standaloneMenuItem, handleAddClick, initialCustomizerSelections, unansweredRequiredOption, syncCustomizerGate, openCustomizer, closeCustomizer, selectCustomizerChoice, customizerUnitPrice, refreshCustomizerPrice, confirmCustomizer, availabilityOf, bootRestaurant.
 * Reads/writes only the declared live scope below; browser capabilities are checked by orderpro-boundary-test.
 * Classic lexical adapter intentionally preserves original function bodies, including assignments. */
KiwiOrderMenu.orderProParts.define('menu', ["$","$$","I18N","ICON_CLASS","MENU","MENU_ALL","MENU_I18N","MENU_SUBTABS","OPT","addLineToCart","availabilitySignature","cart","currentLang","customizerEditingKey","customizerEditingQty","customizerItem","customizerNote","customizerSelections","escapeHtml","itemI18n","itemOf","menuTr","money","showToast","t","toCents"], function (scope) {
  const draft = KiwiOrderMenu.orderProParts.extension('draft', 'create')(scope);
  with (scope) {
    const feedMedia = (() => {
      let io = null;
      const calm = () => {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch (_) { return false; }
      };

      function load(v) {
        if (!v.getAttribute('src') && v.dataset.src) v.setAttribute('src', v.dataset.src);
      }
      function play(v) {
        load(v);
        if (calm()) return;                       // affiche fixe, pas de boucle
        const p = v.play();
        if (p && p.catch) p.catch(() => {});      // refus d'autoplay → on n'insiste pas
      }

      function bind() {
        if (io) { io.disconnect(); io = null; }
        const list = $('#menu-list');
        if (!list) return;
        const vids = list.querySelectorAll('video[data-src]');
        if (!vids.length) return;

        if (!('IntersectionObserver' in window)) {
          // Vieux navigateur : on charge tout et on laisse le navigateur faire.
          vids.forEach(play);
          return;
        }
        io = new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            const v = e.target;
            if (!e.isIntersecting) { try { v.pause(); } catch (_) {} return; }
            if (e.intersectionRatio >= 0.3) play(v);
            else load(v);                          // en approche : on précharge seulement
          });
        }, { root: list, rootMargin: '300px 0px', threshold: [0, 0.3] });
        vids.forEach(v => io.observe(v));
      }

      /* L'app passe d'un écran à l'autre : quand la carte n'est plus affichée,
         rien ne doit continuer à tourner derrière. Idem quand le téléphone se
         verrouille ou que le client change d'onglet. */
      function pauseAll() {
        const list = $('#menu-list');
        if (!list) return;
        list.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (_) {} });
      }
      function resume() {
        const list = $('#menu-list');
        if (!list || !list.closest('.screen.is-active')) return;
        bind();
      }
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseAll(); else resume();
      });

      return { bind, pauseAll, resume };
    })();

    function dishMedia(m) {
      if (m.video) {
        /* Une vidéo sans affiche est un rectangle VIDE tant qu'elle ne joue
           pas — et elle ne joue pas toujours : mode économie d'énergie, données
           réduites, « limiter les animations ». Le plat disparaissait alors du
           fil sans que rien ne le dise.
           Donc : avec une photo, elle sert d'affiche et on ne précharge rien ;
           sans photo, on demande les métadonnées, ce qui suffit au navigateur
           pour peindre la première image. Le coût réseau ne tombe que sur les
           plats que le patron n'a pas photographiés. */
        const poster = m.photo ? ` poster="${escapeHtml(m.photo)}"` : '';
        const pre = m.photo ? 'none' : 'metadata';
        return `<div class="dish-media">${dishTag(m)}` +
          `<video data-src="${escapeHtml(m.video)}"${poster} loop muted playsinline ` +
          `preload="${pre}" disablepictureinpicture aria-hidden="true"></video></div>`;
      }
      if (m.photo) {
        return `<div class="dish-media">${dishTag(m)}` +
          `<img src="${escapeHtml(m.photo)}" alt="" loading="lazy" decoding="async" /></div>`;
      }
      return `<div class="dish-media is-plain ${ICON_CLASS[m.icon] || 'coffee'}">${dishTag(m)}` +
        `<i data-lucide="${escapeHtml(m.icon || 'utensils')}"></i></div>`;
    }

    function dishTag(m) {
      return m.tag === 'new' ? `<span class="dish-tag">${escapeHtml(t('tag_new'))}</span>` : '';
    }

    function renderMenu(filter = 'all') {
      const list = $('#menu-list');
      list.classList.add('is-feed');
      const bits = String(filter).split('::'), catFilter = bits[0], subFilter = bits[1] || '';
      const items = MENU.filter(m => catFilter === 'all' || (m.cat === catFilter && (!subFilter || m.subId === subFilter)))
        .filter(m => !globalThis.KiwiGuest || globalThis.KiwiGuest.dietAllows(m));
      list.innerHTML = items.map(m => {
        const i = itemI18n(m.id);
        const out = m.avail === false;
        return `
        <article class="dish-card${out ? ' is-out' : ''}"${out ? '' : ` data-card="${escapeHtml(m.id)}"`}>
          ${dishMedia(m)}${out ? `<div class="dish-out">${escapeHtml(t('dish_out'))}</div>` : ''}
          <div class="dish-meta">
            ${m.formula ? `<div class="dish-tag">${escapeHtml(t('tag_formula'))}</div>` : ''}
            <div class="dish-name">${escapeHtml(i.name)}</div>
            <div class="dish-foot">
              <span class="dish-price">${money(m.price)}</span>
              ${globalThis.KiwiOrderMenu ? KiwiOrderMenu.infoButton(m, i.name, t) : ''}
              ${out ? '' : `<button type="button" class="dish-add" data-add="${escapeHtml(m.id)}" aria-label="${escapeHtml(t('btn_add'))} ${escapeHtml(i.name)}">+</button>`}
            </div>
          </div>
        </article>
      `;}).join('');
      if (window.lucide) window.lucide.createIcons();
      feedMedia.bind();
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.afterMenu();
    }

    function renderMenuSubtabs(categoryId) {
      const row = $('.menu-subtabs');
      if (!row) return;
      const subtabs = MENU_SUBTABS.get(String(categoryId)) || [];
      row.innerHTML = subtabs.map(s => `<button class="menu-tab menu-subtab" role="tab" aria-selected="false" data-tab="${escapeHtml(String(categoryId) + '::' + String(s.id))}">${escapeHtml(String(s.name || ''))}</button>`).join('');
      row.classList.toggle('is-visible', subtabs.length > 0);
    }

    function activeMenuFilter() {
      return document.querySelector('.menu-subtab.is-active')?.dataset.tab
        || document.querySelector('.menu-tabs .menu-tab.is-active')?.dataset.tab
        || 'all';
    }

    function choiceLabel(optKey, choiceId, optChoice, optGroup) {
      const key = `opt_${optKey}_${choiceId}`;
      const staticVal = I18N[currentLang]?.[key] || I18N.fr?.[key];
      if (staticVal) return staticVal;

      const choiceStr = String(choiceId || '');
      const catalogItem = (typeof MENU_ALL !== 'undefined' && MENU_ALL ? MENU_ALL.get(choiceStr) : null)
        || (typeof allItems !== 'undefined' && Array.isArray(allItems) ? allItems.find(x => String(x.id) === choiceStr) : null);
      if (catalogItem) {
        const tr = (MENU_I18N[currentLang] && MENU_I18N[currentLang][choiceStr])
          || (typeof menuTr === 'function' ? menuTr(catalogItem, currentLang) : null);
        if (tr && tr.name) return String(tr.name);
        if (catalogItem.name) return String(catalogItem.name);
      }

      const opt = optGroup || OPT[optKey];
      let choice = optChoice || (opt && opt.choices ? opt.choices.find(c => String(c.id) === choiceStr) : null);
      if (!choice && optKey && String(optKey).startsWith('formula_')) {
        for (const [k, g] of Object.entries(OPT)) {
          if (k.startsWith('formula_') && Array.isArray(g?.choices)) {
            const found = g.choices.find(c => String(c.id) === choiceStr);
            if (found) { choice = found; break; }
          }
        }
      }

      if (choice) {
        if (choice.targetItem) {
          const tr = (MENU_I18N[currentLang] && MENU_I18N[currentLang][choiceStr])
            || (typeof menuTr === 'function' ? menuTr(choice.targetItem, currentLang) : null);
          if (tr && tr.name) return String(tr.name);
          if (choice.targetItem.name) return String(choice.targetItem.name);
        }
        if (choice._src && typeof menuTr === 'function') {
          const tr = menuTr(choice._src, currentLang);
          if (tr && tr.name) return String(tr.name);
        }
        if (choice.label) return String(choice.label);
      }

      if (/^(it|sl|opt)_[A-Za-z0-9_-]+$/i.test(choiceStr)) {
        return t('opt_unavailable');
      }

      return choiceStr;
    }

    function groupLabel(optKey) {
      const key = `opt_label_${optKey}`;
      if (I18N[currentLang]?.[key]) return I18N[currentLang][key];
      if (I18N.fr?.[key]) return I18N.fr[key];
      const opt = OPT[optKey];
      if (opt) {
        if (opt._src && typeof menuTr === 'function') {
          const tr = menuTr(opt._src, currentLang);
          if (tr && tr.name) return String(tr.name);
          if (tr && tr.label) return String(tr.label);
        }
        if (opt.label) return String(opt.label);
      }
      if (/^(it|sl|opt)_[A-Za-z0-9_-]+$/i.test(String(optKey || ''))) {
        return t('opt_unavailable');
      }
      return String(optKey || '');
    }

    function choiceEmoji(optKey, choiceId) {
      return OPT[optKey]?.choices.find(c => c.id === choiceId)?.emoji || '';
    }

    function describeOptions(line) {
      const item = itemOf(line.id);
      if (!item || !item.options) return '';
      const parts = [];
      for (const opt of item.options) {
        const sel = line.options?.[opt.key];
        if (sel == null) continue;
        if (opt.type === 'single') {
          /* Tout choix fait est écrit, y compris celui que la carte appelait
             « par défaut » : une ligne « Espresso » qui cache « Sucré » laisse
             le client recevoir un sucre qu'il n'a jamais lu. Un groupe laissé
             vide n'est pas un choix : rien à écrire. */
          if (!sel) continue;
          parts.push(choiceLabel(opt.key, sel));
        } else if (opt.type === 'multi' && Array.isArray(sel) && sel.length) {
          const labels = sel.map(id => choiceLabel(opt.key, id)).filter(Boolean);
          if (labels.length) {
            const prefix = opt.key === 'retirer' ? t('opt_retirer_prefix') : '';
            parts.push(prefix + labels.join(', ').toLowerCase());
          }
        }
      }
      return parts.join(' · ');
    }

    function describeOptionChoices(line) {
      const item = itemOf(line.id);
      if (!item || !item.options) return [];
      const out = [];
      for (const opt of item.options) {
        if (opt.formulaSlotId) continue;
        const sel = line.options?.[opt.key];
        const ids = opt.type === 'multi' ? (Array.isArray(sel) ? sel : []) : (!sel ? [] : [sel]);
        ids.forEach(id => {
          if (!id) return;
          out.push({ group: opt.key, choiceId: id, label: choiceLabel(opt.key, id) });
        });
      }
      return out;
    }

    function describeOptionVisuals(line, regularOnly = false) {
      const item = itemOf(line.id);
      if (!item || !item.options) return [];
      const out = [];
      for (const opt of item.options) {
        if (regularOnly && opt.formulaSlotId) continue;
        const sel = line.options?.[opt.key];
        const ids = opt.type === 'multi' ? (Array.isArray(sel) ? sel : []) : (!sel ? [] : [sel]);
        ids.forEach(id => {
          if (!id) return;
          const emoji = choiceEmoji(opt.key, id);
          const name = choiceLabel(opt.key, id);
          if (name) out.push({ emoji: emoji || '', name });
        });
      }
      return out;
    }

    function standaloneMenuItem(itemId) {
      const source = MENU_ALL.get(String(itemId));
      if (source && (source.archived || source.formulaOnly || source.avail === false)) { showToast(t('dish_out')); return null; }
      return itemOf(itemId);
    }

    function handleAddClick(itemId) {
      const item = standaloneMenuItem(itemId);
      if (!item) return;
      if (item.options && item.options.length > 0) {
        openCustomizer(item);
      } else {
        addLineToCart({
          id: itemId,
          options: {},
          note: '',
          unitPrice: item.price,
        });
      }
    }

    function initialCustomizerSelections(options) { return draft.initialCustomizerSelections(options); }

    function unansweredRequiredOption(item, selections) { return draft.unansweredRequiredOption(item, selections); }

    function syncCustomizerGate() {
      const btn = document.getElementById('custom-add-btn');
      if (!btn) return;
      const blocked = !!(customizerItem && unansweredRequiredOption(customizerItem, customizerSelections));
      btn.disabled = blocked;
      btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    }

    function openCustomizer(item, qty, editingKey) {
      customizerItem = item;
      customizerEditingKey = editingKey || null;
      customizerEditingQty = Math.max(1, Number(qty) || 1);
      customizerSelections = initialCustomizerSelections(item.options);
      customizerNote = '';

      // Populate header
      const i = itemI18n(item.id);
      $('#custom-name').textContent = i.name;
      $('#custom-desc').textContent = i.desc;
      $('#custom-base').textContent = `${t('custom_from')} ${money(item.price)}`;
      const nutritionEl = $('#custom-nutrition');
      const nutritionHtml = globalThis.KiwiOrderMenu ? KiwiOrderMenu.nutritionDetail(item, t) : '';
      nutritionEl.innerHTML = nutritionHtml;
      nutritionEl.hidden = !nutritionHtml;
      const imgEl = $('#custom-img');
      imgEl.className = 'custom-img ' + (ICON_CLASS[item.icon] || 'coffee');
      imgEl.innerHTML = `<i data-lucide="${escapeHtml(item.icon)}"></i>`;

      // Render option groups
      const opts = $('#custom-options');
      opts.innerHTML = (item.options || []).map(opt => {
        const showChoiceImages = !!opt.formulaSlotId && opt.choices.some(choice => choice.photo);
        return `
        <div class="option-group${showChoiceImages ? ' has-choice-images' : ''}" data-opt="${escapeHtml(opt.key)}">
          <div class="option-group-label">
            <span>${escapeHtml(groupLabel(opt.key))}</span>
            <span class="opt-type">${(opt.required || (opt.formulaSlotId && Math.max(0, Number(opt.min) || 0) > 0))
              ? `${t('opt_required')} · ${opt.type === 'multi' ? t('opt_choose_many') : t('opt_choose_one')}`
              : (opt.type === 'multi' ? t('opt_choose_many') : t('opt_choose_one'))}</span>
          </div>
          <div class="option-chips">
            ${opt.choices.map(c => `
              <button class="option-chip" type="button"
                      data-opt="${escapeHtml(opt.key)}" data-choice="${escapeHtml(c.id)}" data-type="${escapeHtml(opt.type)}">
                ${showChoiceImages ? `<span class="option-choice-media">${c.photo
                  ? `<img src="${escapeHtml(c.photo)}" alt="" loading="lazy" decoding="async" />`
                  : `<span class="option-choice-fallback" aria-hidden="true">${escapeHtml(choiceLabel(opt.key, c.id, c, opt).slice(0, 1).toUpperCase())}</span>`}</span>` : ''}
                <span class="${showChoiceImages ? 'option-choice-copy' : ''}"><span class="${showChoiceImages ? 'option-choice-name' : ''}">${c.emoji ? `${escapeHtml(c.emoji)} ` : ''}${escapeHtml(choiceLabel(opt.key, c.id, c, opt))}</span>
                ${c.delta ? `<span class="delta">+${money(c.delta)}</span>` : ''}</span>
                ${showChoiceImages ? '<span class="option-choice-check" aria-hidden="true"><i data-lucide="check"></i></span>' : ''}
              </button>
            `).join('')}
          </div>
        </div>
      `; }).join('');

      // Mark defaults as active
      $$('.option-chip', opts).forEach(chip => {
        const k = chip.dataset.opt, c = chip.dataset.choice, t = chip.dataset.type;
        if (t === 'single' && customizerSelections[k] === c) chip.classList.add('is-active');
      });

      // Reset note
      $('#custom-note-input').value = '';

      refreshCustomizerPrice();
      syncCustomizerGate();
      const customScroll = $('.custom-scroll', $('#custom-sheet'));
      if (customScroll) customScroll.scrollTop = 0;
      $('#custom-sheet').classList.add('is-open');
      $('#custom-sheet').setAttribute('aria-hidden', 'false');
      if (window.lucide) window.lucide.createIcons();
    }

    function closeCustomizer() {
      $('#custom-sheet').classList.remove('is-open');
      $('#custom-sheet').setAttribute('aria-hidden', 'true');
      customizerItem = null;
      customizerEditingKey = null;
      customizerEditingQty = 1;
    }

    function selectCustomizerChoice(optKey, choiceId, type) {
      draft.selectChoice(optKey, choiceId, type);
      // Update chip visuals
      const group = document.querySelector(`.option-group[data-opt="${CSS.escape(String(optKey))}"]`);
      if (!group) return;
      group.classList.remove('is-invalid');
      group.removeAttribute('aria-invalid');
      if (type === 'single') {
        $$('.option-chip', group).forEach(c => {
          c.classList.toggle('is-active', customizerSelections[optKey] === c.dataset.choice);
        });
      } else {
        $$('.option-chip', group).forEach(c => {
          c.classList.toggle('is-active', customizerSelections[optKey].includes(c.dataset.choice));
        });
      }
      refreshCustomizerPrice();
      syncCustomizerGate();
    }

    function customizerUnitPrice() { return draft.customizerUnitPrice(); }

    function refreshCustomizerPrice() {
      $('#custom-price-value').textContent = `${money(customizerUnitPrice())}`;
    }

    function confirmCustomizer() {
      if (!customizerItem) return;
      const invalidRequiredOption = (customizerItem.options || []).find((opt) => {
        const selected = customizerSelections[opt.key];
        const count = Array.isArray(selected) ? selected.length : (selected ? 1 : 0);
        const minimum = opt.formulaSlotId ? Math.max(0, Number(opt.min) || 0) : (opt.required ? 1 : 0);
        const maximum = opt.formulaSlotId ? Math.max(1, Number(opt.max) || 1) : Infinity;
        return count < minimum || count > maximum;
      });
      if (invalidRequiredOption) {
        const group = Array.from(document.querySelectorAll('.option-group'))
          .find(el => el.dataset.opt === invalidRequiredOption.key);
        if (group) {
          group.classList.add('is-invalid');
          group.setAttribute('aria-invalid', 'true');
          group.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const firstChoice = group.querySelector('.option-chip');
          if (firstChoice) window.setTimeout(() => firstChoice.focus({ preventScroll: true }), 260);
        }
        const optGroupName = groupLabel(invalidRequiredOption.key) || '';
        showToast(t('opt_required_missing').replace('{name}', optGroupName));
        return;
      }
      if (customizerEditingKey && cart.has(customizerEditingKey)) {
        cart.delete(customizerEditingKey);
      }
      const restoreQty = customizerEditingQty || 1;
      customizerEditingKey = null;
      customizerEditingQty = 1;
      customizerNote = $('#custom-note-input').value.trim();
      addLineToCart({
        id: customizerItem.id,
        options: { ...customizerSelections },
        note: customizerNote,
        unitPrice: customizerUnitPrice(),
        qty: restoreQty,
      });
      closeCustomizer();
    }

    function availabilityOf(data) {
      return ((Array.isArray(data && data.items) ? data.items : []).concat(Array.isArray(data && data.formulaItems) ? data.formulaItems : []))
        .map((it) => String(it && it.id || '') + ':' + (it && it.avail === false ? '0' : '1')).sort().join('|');
    }

    function bootRestaurant(data) {
      const cats = Array.isArray(data.cats) ? data.cats : [];
      const allItems = (Array.isArray(data.items) ? data.items : []).concat(Array.isArray(data.formulaItems) ? data.formulaItems : []);
      availabilitySignature = availabilityOf(data);
      const items = allItems.filter(i => i && i.avail !== false && !i.formulaOnly && !i.archived);
      MENU_ALL.clear();
      MENU.length = 0;
      if (!items.length) return false;
      allItems.forEach((it) => { if (it && it.id) MENU_ALL.set(String(it.id), it); });

      const groups = new Map();
      (Array.isArray(data.opts) ? data.opts : []).forEach(g => {
        if (!g || !g.id || !Array.isArray(g.choices) || !g.choices.length) return;
        const key = String(g.id);
        const mapped = {
          key,
          label: String(g.name || ''),
          type: g.kind === 'many' ? 'multi' : 'single',
          default: '',
          required: !!g.required,
          _src: g,
          choices: g.choices.filter(c => c && c.id && c.name).map(c => ({
            id: String(c.id), label: String(c.name), emoji: String(c.emoji || ''), delta: Math.max(0, Number(c.price) || 0),
            _src: c,
          })),
        };
        OPT[key] = mapped;
        groups.set(key, mapped);
      });

      /* Every language this store publishes, not only the three. */
      const langs = globalThis.KiwiOrderMenu ? KiwiOrderMenu.langs() : ['fr', 'en', 'ar'];
      const names = {}, byLang = {};
      langs.forEach(l => { byLang[l] = {}; });
      const allToTranslate = (Array.isArray(allItems) && allItems.length) ? allItems : items;
      for (const it of allToTranslate) {
        if (!it || !it.id) continue;
        names[String(it.id)] = { name: String(it.name || ''), desc: String(it.desc || '') };
        langs.forEach((l) => {
          const x = menuTr(it, l);
          if (x) byLang[l][String(it.id)] = { name: String(x.name), desc: x.desc != null ? String(x.desc) : String(it.desc || '') };
        });
      }

      for (const it of items) {
        const formulaOptions = it.formula && Array.isArray(it.formula.slots) ? it.formula.slots.map(s => {
          const g = { key: 'formula_' + String(it.id) + '_' + String(s.id), formulaSlotId: String(s.id), label: String(s.label || ''), type: (+s.max || 1) > 1 ? 'multi' : 'single', default: '', required: (+s.min || 0) > 0, min: Math.max(0, +s.min || 0), max: Math.max(1, +s.max || 1), _src: s,
            choices: (Array.isArray(s.choices) ? s.choices : []).map(c => { const target=allItems.find(x=>String(x.id)===String(c.itemId) && !x.archived && x.avail !== false); return target ? {id:String(c.itemId),label:String(target.name),emoji:'',delta:Math.max(0,Number(c.extra)||0),photo:target.showPhotoInFormulas === true ? String(target.photo || '') : '', targetItem: target, _src: target} : null; }).filter(Boolean) };
          OPT[g.key] = g;
          if (!OPT['formula_' + String(s.id)]) OPT['formula_' + String(s.id)] = g;
          return g;
        }).filter(g=>g.choices.length) : [];
        const formulaBroken = it.formula && Array.isArray(it.formula.slots)
          && it.formula.slots.some((slot) => {
            const mapped = formulaOptions.find((opt) => opt.formulaSlotId === String(slot.id));
            return !mapped || mapped.choices.length < Math.max(0, Number(slot.min) || 0);
          });
        if (formulaBroken) continue;
        MENU.push({
          id: String(it.id),
          cat: String(it.catId || ''),
          subId: String(it.subId || ''),
          name: String(it.name || ''),
          desc: String(it.desc || ''),
          price: Math.max(0, toCents(it.price) / 100),
          icon: it.icon || 'utensils',
          photo: it.photo || '',
          video: it.video || '',
          tag: it.tag || '',
          avail: it.avail !== false,
          /* Publiés seulement quand la fiche est complète (functions/api/menu.js) :
             null = « on ne sait pas », jamais « sans allergène ». */
          allergens: Array.isArray(it.allergens) ? it.allergens.slice() : null,
          options: (Array.isArray(it.opts) ? it.opts : []).map(id => groups.get(String(id))).filter(Boolean).concat(formulaOptions),
          formula: formulaOptions.length > 0,
          nutrition: it.nutritionComplete === true && it.nutrition ? { ...it.nutrition } : null,
          allergens: it.nutritionComplete === true && Array.isArray(it.allergens) ? it.allergens.slice() : [],
        });
      }
      // Le patron écrit sa carte une fois ; ses traductions (tableau de bord →
      // Traductions) voyagent avec elle. Une langue non traduite retombe sur
      // son texte (itemI18n → MENU_I18N.fr).
      Object.keys(MENU_I18N).forEach(l => { delete MENU_I18N[l]; });
      langs.forEach(l => { MENU_I18N[l] = byLang[l]; });
      MENU_I18N.fr = Object.assign({}, names, byLang.fr || {});

      /* Les onglets sont ceux du patron, et rien d'autre. L'onglet « Top »
         a été retiré : il ne montrait que les plats filmés, ce qui coupait la
         carte en deux et laissait croire que le reste n'était pas commandable.
         Depuis que chaque plat occupe la même tuile, tout le fil EST le fil
         vidéo — un onglet pour le redire n'aurait plus rien à filtrer. */
      const used = new Set(MENU.map(m => m.cat));
      const tabs = $('.menu-tabs');
      const parts = [];
      MENU_SUBTABS.clear();
      parts.push(`<button class="menu-tab is-active" role="tab" aria-selected="true" data-tab="all" data-i18n="tab_all">${escapeHtml(t('tab_all'))}</button>`);
      for (const c of cats) {
        if (!used.has(String(c.id))) continue;        // empty category → no tab
        parts.push(`<button class="menu-tab" role="tab" aria-selected="false" data-tab="${escapeHtml(String(c.id))}">${escapeHtml(String((menuTr(c, currentLang) || c).name || ''))}</button>`);
        const subtabs = (Array.isArray(c.sub) ? c.sub : []).filter(s =>
          MENU.some(m => m.cat === String(c.id) && m.subId === String(s.id)));
        if (subtabs.length) MENU_SUBTABS.set(String(c.id), subtabs);
      }
      tabs.innerHTML = parts.join('');
      renderMenuSubtabs('all');
      renderMenu('all');
      return true;
    }


    return Object.freeze({ feedMedia, dishMedia, dishTag, renderMenu, renderMenuSubtabs, activeMenuFilter, choiceLabel, groupLabel, choiceEmoji, describeOptions, describeOptionChoices, describeOptionVisuals, standaloneMenuItem, handleAddClick, initialCustomizerSelections, unansweredRequiredOption, syncCustomizerGate, openCustomizer, closeCustomizer, selectCustomizerChoice, customizerUnitPrice, refreshCustomizerPrice, confirmCustomizer, availabilityOf, bootRestaurant });
  }
});
