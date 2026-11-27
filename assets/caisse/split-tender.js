/* Owner: caisse split tender and table transfer.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */


    /* Le sous-titre des modals de paiement est global : « Part 2 » écrit ici
       restait affiché sur l'encaissement suivant, sans le moindre rapport avec
       la note partagée · « Table Part 2 · T7 » sur une commande à emporter.
       On mémorise donc l'étiquette d'origine pour la remettre dès que le flux
       de partage se termine, qu'il aboutisse ou qu'il soit abandonné. */
    /* Le sous-titre des fenêtres de paiement. Il était écrit en dur
       « Table … · N couverts » et seul le chiffre changeait : une vente à
       emporter s'affichait « Table À emporter · 1 art. couverts », une part de
       note « Table Part 2 · T7 couverts ». Le préfixe et l'unité suivent
       maintenant ce qu'on encaisse. */
    function payMeta(m) {
      $$('.pay-table-prefix').forEach(el => { el.hidden = !m.prefix; });
      $$('[data-bind="table"]').forEach(el => el.textContent = m.table);
      $$('[data-bind="covers"]').forEach(el => el.textContent = m.covers);
      $$('[data-bind="covers-unit"]').forEach(el => { el.textContent = m.unit; el.hidden = !m.unit; });
    }
    function readPayMeta() {
      const q = (sel) => document.querySelector(sel);
      return {
        prefix: !(q('.pay-table-prefix') || {}).hidden,
        table: q('[data-bind="table"]')?.textContent || '',
        covers: q('[data-bind="covers"]')?.textContent || '',
        unit: q('[data-bind="covers-unit"]')?.hidden ? '' : (q('[data-bind="covers-unit"]')?.textContent || ''),
      };
    }
    
    /* « Part égale » et « Part équilibrée » se garderont en français dans l'état
       du partage (repris tel quel après un rechargement), mais se disent dans la
       langue du comptoir à l'écran. Seules ces formes-là passent par le
       dictionnaire : quand une part est nommée par ses articles, ce sont les mots
       du commerçant, qu'on ne traduit jamais. */
    function splitPartLabel(label) {
      const text = String(label == null ? '' : label);
      const lang = globalThis.window && globalThis.window.KiwiCaisseLang;
      if (!lang || !/^Part (égale( \+ pourboire \d+(?:[.,]\d+)?%)?|équilibrée)$/.test(text)) return text;
      return lang.tr(text);
    }
    function setPayBindings(table, covers) {
      if (!payBindingsBackup) payBindingsBackup = readPayMeta();
      payMeta({ prefix: false, table, covers, unit: '' });
    }
    function restorePayBindings() {
      if (!payBindingsBackup) return;
      const b = payBindingsBackup;
      payBindingsBackup = null;
      payMeta(b);
    }

    /* Le partage regroupe les articles par nom pour montrer « 4 × Tajine ».
       Deux plats du même nom à des prix différents (une formule avec ou sans
       supplément) se fondaient en une seule carte, au prix du premier : à 84
       et 88 MAD, chacun des deux convives payait 86 et les deux lignes disaient
       84 (Pasta Corner, 1er octobre). Un autre prix garde sa propre carte, et
       son nom de base pour que le classement des produits les compte ensemble. */
    function splitItemTotals(lines) {
      const itemTotals = Object.create(null), groups = new Map();
      (lines || []).forEach(l => {
        const unitPrice = l.qty > 0 ? (l.total / l.qty) : l.total;
        let key = l.name;
        if (itemTotals[key] && minor(itemTotals[key].unitPrice) !== minor(unitPrice)) key = `${l.name} · ${fmtMADcents(unitPrice)}`;
        const itemId = l.itemId || l.id || '';
        const identity = JSON.stringify([l.name, minor(unitPrice), itemId]);
        if (groups.has(identity)) key = groups.get(identity);
        else { while (itemTotals[key]) key += ' ·'; groups.set(identity, key); }
        if (!itemTotals[key]) {
          itemTotals[key] = { totalQty: 0, unitPrice, itemId: l.itemId || l.id || '', baseName: l.baseName || (key !== l.name ? l.name : '') };
        }
        itemTotals[key].totalQty += l.qty;
      });
      return itemTotals;
    }

    

    function effectiveTipPct() {
      /* A tip is never negative: a typed -50 % would shave the bill itself. */
      if (splitState.tipMode === 'autre') return Math.min(100, Math.max(0, Number(splitState.customTipPct) || 0));
      return Math.max(0, parseFloat(splitState.tipMode) || 0);
    }

    /* ---- open ---- */
    function openSplitModal(tableId) {
      // À emporter has no mesa · split the working cart instead of a table order.
      const isVrap = (mode === 'vrap');
      let lines, covers, sourceLabel;
      if (isVrap) {
        lines = cart.map(c => ({ name: lineLabel(c), baseName: c.baseName || c.name,
          itemId: c.id || '', qty: c.qty, total: c.price * c.qty, promo: c.promo || null }));
        covers = 2;
        sourceLabel = vrapEditingNum != null ? ('À emporter #' + vrapEditingNum) : 'À emporter';
      } else {
        const t = tables[tableId];
        lines = generateOrder(tableId, t);
        covers = t.covers || 2;
        sourceLabel = settledOrderLabel(tableId);
      }
      const gross = money(lines.reduce((s, l) => s + l.total, 0));
      /* A split settles the same NET amount shown by the ordinary payment
         buttons. The old path rebuilt the gross from the lines and silently
         dropped the manager-approved discount. */
      const total = isVrap
        ? money(gross - vrapDiscountAmount(gross))
        : money(gross - discountAmountFor(tableId, gross));

      // Aggregate per unique item name: split-pool shows one card per dish
      // with remaining count, so 4× Tajine can be assigned to 4 different convives
      const itemTotals = splitItemTotals(lines);

      Object.assign(splitState, {
        tableId: isVrap ? null : tableId,
        isVrap, sourceLabel,
        total, sourceLines: lines.map(line => ({ ...line })), itemTotals,
        splitMode: 'egal',
        amountParts: [''],
        numParts: Math.max(2, covers),
        tipMode: '0', customTipPct: 0,
        numConvives: Math.max(2, covers),
        perConvive: {}, activeConvive: 1, flow: null,
      });

      $('#split-table-label').textContent = sourceLabel;
      $('#split-setup').hidden = false;
      $('#split-flow').hidden = true;
      $('#split-all-done').hidden = true;

      renderSplitSetup();
      $('#split-modal').classList.add('is-open');
      lucide.createIcons();
    }

    /* ---- Par article helpers ---- */
    function remainingQty(itemName) {
      const total = splitState.itemTotals[itemName]?.totalQty || 0;
      let assigned = 0;
      for (const c in splitState.perConvive) {
        assigned += splitState.perConvive[c][itemName] || 0;
      }
      return total - assigned;
    }
    function conviveTotal(c) {
      const map = splitState.perConvive[c] || {};
      let sum = 0;
      for (const name in map) {
        sum += map[name] * (splitState.itemTotals[name]?.unitPrice || 0);
      }
      return sum;
    }
    function assignUnit(itemName) {
      if (!Number.isInteger(remainingQty(itemName)) || remainingQty(itemName) <= 0) return;
      const c = splitState.activeConvive;
      if (!splitState.perConvive[c]) splitState.perConvive[c] = {};
      splitState.perConvive[c][itemName] = (splitState.perConvive[c][itemName] || 0) + 1;
    }
    function unassignUnit(itemName) {
      const c = splitState.activeConvive;
      const map = splitState.perConvive[c];
      if (!map || !map[itemName]) return;
      map[itemName]--;
      if (map[itemName] <= 0) delete map[itemName];
    }

    function closeSplitModal({ skipRevert = false } = {}) {
      $('#split-modal').classList.remove('is-open');
      splitPayCallback = null;
      cashAmountOverride = null;
      restorePayBindings();
    }

    /* ---- setup screen ---- */
    function renderSplitSetup() {
      ensureSplitAmountMode();
      $$('[data-split-tab]').forEach(tab =>
        tab.classList.toggle('is-active', tab.dataset.splitTab === splitState.splitMode));

      $('#split-egal-content').hidden = splitState.splitMode !== 'egal';
      $('#split-article-content').hidden = splitState.splitMode !== 'article';
      $('#split-montant-content').hidden = splitState.splitMode !== 'montant';

      if (splitState.splitMode === 'egal') {
        $('#split-launch').disabled = false;
        $('#split-launch').textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Lancer le split');
        $('#split-launch').title = '';
        renderPartsChips();
        renderTipChips();
        updateSplitSummary();
      } else if (splitState.splitMode === 'montant') {
        renderSplitAmountMode();
      } else {
        renderArticleMode();
      }
      lucide.createIcons();
    }

    /* ---- Par montant ----
       « On ne peut pas saisir le montant » (client, 27 nov. 2026) : un convive
       paie 150 MAD, l'autre le reste. Le caissier tape le montant de chaque
       part sauf la dernière, qui prend ce qui reste, au centime. Le volet est
       posé par le script (le gabarit de la caisse est à sa taille maximale). */
    function splitAmountTr(s) { return (globalThis.window?.KiwiCaisseLang || { tr: x => x }).tr(s); }
    function ensureSplitAmountMode() {
      if ($('#split-montant-content')) return;
      const tr = splitAmountTr;
      const tabs = $('.split-tabs'), article = $('#split-article-content');
      if (!tabs || !article) return;
      tabs.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
      tabs.insertAdjacentHTML('beforeend', `
          <button class="split-tab" data-split-tab="montant" type="button">
            <div class="split-tab-icon"><svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M560-440q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35ZM280-320q-33 0-56.5-23.5T200-400v-320q0-33 23.5-56.5T280-800h560q33 0 56.5 23.5T920-720v320q0 33-23.5 56.5T840-320H280Zm80-80h400q0-33 23.5-56.5T840-480v-160q-33 0-56.5-23.5T760-720H360q0 33-23.5 56.5T280-640v160q33 0 56.5 23.5T360-400Zm440 240H120q-33 0-56.5-23.5T40-240v-440h80v440h680v80ZM280-400v-320 320Z"/></svg></div>
            <div class="split-tab-text">
              <div class="split-tab-title">${tr('Par montant')}</div>
              <div class="split-tab-desc">${tr('Chacun paie le montant de son choix')}</div>
            </div>
          </button>`);
      article.insertAdjacentHTML('afterend', '<div id="split-montant-content" hidden></div>');
      const box = $('#split-montant-content');
      box.addEventListener('input', (e) => {
        const input = e.target.closest('[data-split-amount]');
        if (!input) return;
        splitState.amountParts[Number(input.dataset.splitAmount)] = input.value;
        updateSplitAmountSummary();
      });
      box.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.target.closest('[data-split-amount]')) return;
        e.preventDefault();
        if (splitAmountAllocation().ok) launchSplitFlow();
      });
      box.addEventListener('click', (e) => {
        if (e.target.closest('[data-split-amount-add]')) {
          if (splitState.amountParts.length < 7) splitState.amountParts.push('');
          renderSplitAmountMode(splitState.amountParts.length - 1);
          return;
        }
        const del = e.target.closest('[data-split-amount-del]');
        if (del) {
          splitState.amountParts.splice(Number(del.dataset.splitAmountDel), 1);
          if (!splitState.amountParts.length) splitState.amountParts.push('');
          renderSplitAmountMode();
        }
      });
    }
    /* « 150 », « 150,5 », « 1 200 » → centimes ; vide ou illisible → null. */
    function splitAmountCents(value) {
      const text = String(value == null ? '' : value).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
      if (!text || !/^\d+(\.\d{0,2})?$/.test(text)) return null;
      return Math.round(Number(text) * 100);
    }
    function splitAmountAllocation() {
      const total = minor(splitState.total);
      const typed = (splitState.amountParts || ['']).map(splitAmountCents);
      const sum = typed.reduce((s, c) => s + (c || 0), 0);
      const rest = total - sum;
      if (typed.some(c => c == null || c <= 0)) return { ok: false, rest, sum, message: 'Saisissez le montant de chaque part' };
      if (rest <= 0) return { ok: false, rest, sum, message: 'Les montants dépassent l’addition' };
      return { ok: true, rest, sum, cents: typed.concat(rest), message: '' };
    }
    function renderSplitAmountMode(focusIndex) {
      const tr = splitAmountTr;
      const box = $('#split-montant-content');
      if (!box) return;
      if (!Array.isArray(splitState.amountParts) || !splitState.amountParts.length) splitState.amountParts = [''];
      const parts = splitState.amountParts;
      const label = tr('Part');
      const rows = parts.map((value, i) => `
          <div class="split-summary-row" style="align-items:center;gap:12px;margin-bottom:8px">
            <span>${label} ${i + 1}</span>
            <span style="display:flex;align-items:center;gap:8px;flex:0 0 60%">
              <input class="split-tip-input" data-split-amount="${i}" inputmode="decimal" autocomplete="off" placeholder="0,00"
                aria-label="${label} ${i + 1}" value="${kdsEsc(value || '')}" style="text-align:end" />
              ${parts.length > 1 ? `<button type="button" class="split-chip" data-split-amount-del="${i}" aria-label="${tr('Retirer cette part')}" title="${tr('Retirer cette part')}">×</button>` : ''}
            </span>
          </div>`).join('');
      box.innerHTML = `
          <div class="split-section-label">${tr('Montant de chaque part')}</div>
          ${rows}
          <div class="split-chips">${parts.length < 7 ? `<button type="button" class="split-chip" data-split-amount-add>+ ${tr('Ajouter une part')}</button>` : ''}</div>
          <div class="split-summary">
            <div class="split-summary-row"><span>${tr('Total à diviser')}</span><span class="val mono">${fmtMADcents(splitState.total)}</span></div>
            <div class="split-summary-row"><span>${tr('Déjà saisi')}</span><span class="val mono" id="split-amount-typed">·</span></div>
            <div class="split-per-person">
              <span class="lbl">${label} ${parts.length + 1} · ${tr('le reste')}</span>
              <span class="val mono" id="split-amount-rest">·</span>
            </div>
          </div>`;
      updateSplitAmountSummary();
      const focus = box.querySelector(`[data-split-amount="${focusIndex == null ? 0 : focusIndex}"]`);
      if (focus && (focusIndex != null || !parts[0])) setTimeout(() => focus.focus(), 60);
    }
    function updateSplitAmountSummary() {
      const tr = splitAmountTr;
      const alloc = splitAmountAllocation();
      const typed = $('#split-amount-typed'), rest = $('#split-amount-rest');
      if (typed) typed.textContent = fmtMADcents(major(alloc.sum));
      if (rest) rest.textContent = alloc.rest > 0 ? fmtMADcents(major(alloc.rest)) : '−' + fmtMADcents(major(-alloc.rest));
      const launch = $('#split-launch');
      launch.disabled = !alloc.ok;
      launch.textContent = alloc.ok ? tr('Lancer le split') : tr(alloc.message);
      launch.title = alloc.ok ? '' : tr(alloc.message);
    }

    /* ---- Par article renderers ---- */
    function renderArticleMode() {
      renderConvivesChips();
      renderConvivesTabs();
      renderPool();
      renderConviveCart();
      const allocation = splitArticleAllocation();
      $('#split-launch').disabled = !allocation.ok;
      $('#split-launch').textContent = allocation.ok ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Encaisser les articles attribués') : allocation.message;
      $('#split-launch').title = allocation.message || '';
      lucide.createIcons();
    }

    // Item splitting allocates whole units. Only explicit equal splitting may
    // share the price of one dish between diners. Validate again at payment entry.
    function splitArticleAllocation() {
      const items = Object.entries(splitState.itemTotals || {});
      const n = Number(splitState.numConvives);
      const invalid = () => ({ ok: false, message: 'Attribution invalide : vérifiez les articles' });
      if (!items.length || !Number.isInteger(n) || n < 1) return invalid();
      const totals = new Map(items.map(([name, info]) => [name, info.totalQty]));
      const assigned = new Map();
      for (const [convive, cart] of Object.entries(splitState.perConvive || {})) {
        if (!Number.isInteger(Number(convive)) || Number(convive) < 1 || Number(convive) > n || !cart || typeof cart !== 'object') return invalid();
        for (const [name, qty] of Object.entries(cart)) {
          if (!totals.has(name) || !Number.isInteger(qty) || qty < 0) return invalid();
          assigned.set(name, (assigned.get(name) || 0) + qty);
        }
      }
      let remaining = 0;
      for (const [name, qty] of totals) {
        if (!Number.isInteger(qty) || qty < 0 || (assigned.get(name) || 0) > qty) return invalid();
        remaining += qty - (assigned.get(name) || 0);
      }
      return remaining ? { ok: false, message: `${remaining} article${remaining > 1 ? 's' : ''} à attribuer` } : { ok: true, message: '' };
    }

    function renderConvivesTabs() {
      const n = splitState.numConvives;
      $('#split-convives-tabs').innerHTML = Array.from({ length: n }, (_, i) => {
        const c = i + 1;
        const isActive = c === splitState.activeConvive;
        return `
          <button class="split-conv-tab ${isActive ? 'is-active' : ''}" data-conv-tab="${c}">
            <span class="split-conv-tab-label">Conv ${c}</span>
            <span class="split-conv-tab-total">${fmtMAD(conviveTotal(c))}</span>
          </button>`;
      }).join('');
    }

    function renderPool() {
      const items = Object.entries(splitState.itemTotals);
      $('#split-pool').innerHTML = items.map(([name, info]) => {
        const rem = remainingQty(name);
        const isEmpty = rem <= 0;
        return `
          <button class="split-pool-item ${isEmpty ? 'is-empty' : ''}" data-pool-item="${name}" type="button">
            <div class="split-pool-item-info">
              <div class="split-pool-item-name">${name}</div>
              <div class="split-pool-item-meta">
                <span class="remaining">${rem}</span> / ${info.totalQty} restant${info.totalQty > 1 ? 's' : ''} · ${info.unitPrice} MAD chacun
              </div>
            </div>
            <div class="split-pool-item-add">+</div>
          </button>`;
      }).join('');
    }

    function renderConviveCart() {
      const c = splitState.activeConvive;
      const cart = splitState.perConvive[c] || {};
      const entries = Object.entries(cart);
      const wrap = $('#split-convive-cart');
      if (!wrap) return;

      if (entries.length === 0) {
        wrap.innerHTML = `<div class="split-convive-cart-empty-state">Convive ${c} n'a encore rien · tapez un article ci-dessus</div>`;
        return;
      }
      const total = conviveTotal(c);
      const rowsHTML = entries.map(([name, qty]) => {
        const unitPrice = splitState.itemTotals[name].unitPrice;
        const lineTotal = qty * unitPrice;
        const qtyPrefix = qty > 1 ? `${qty}× ` : '';
        return `
          <div class="split-convive-cart-row">
            <span class="split-convive-cart-name">${qtyPrefix}${name}</span>
            <div class="split-convive-cart-actions">
              <span class="split-convive-cart-price">${fmtMAD(lineTotal)}</span>
              <button class="split-convive-cart-remove" data-remove-item="${name}" aria-label="Retirer">×</button>
            </div>
          </div>`;
      }).join('');
      wrap.innerHTML = `
        <div class="split-convive-cart">
          <div class="split-convive-cart-title">
            <span>Articles de Convive ${c}</span>
            <span class="split-convive-cart-total">${fmtMAD(total)}</span>
          </div>
          ${rowsHTML}
        </div>`;
    }

    function renderPartsChips() {
      const opts = [2, 3, 4, 5, 6, 8];
      $('#split-parts-chips').innerHTML = opts.map(n =>
        `<button class="split-chip ${n === splitState.numParts ? 'is-active' : ''}" data-parts="${n}">${n}</button>`
      ).join('');
    }

    function renderTipChips() {
      const opts = [
        { label: '0 %',  val: '0'   },
        { label: '5 %',  val: '5'   },
        { label: '10 %', val: '10'  },
        { label: '15 %', val: '15'  },
        { label: 'autre',val: 'autre'},
      ];
      $('#split-tip-chips').innerHTML = opts.map(o =>
        `<button class="split-chip ${o.val === splitState.tipMode ? 'is-active' : ''}" data-tip="${o.val}">${o.label}</button>`
      ).join('');
      const customVisible = splitState.tipMode === 'autre';
      $('#split-tip-custom').classList.toggle('is-visible', customVisible);
      if (customVisible) {
        const inp = $('#split-tip-input');
        inp.value = splitState.customTipPct || '';
        setTimeout(() => inp.focus(), 60);
      }
    }

    function updateSplitSummary() {
      const tipPct = effectiveTipPct();
      const tipAmt = money(splitState.total * tipPct / 100);
      const withTip = money(splitState.total + tipAmt);
      const perPerson = money(withTip / splitState.numParts);

      $('#split-total-display').textContent = fmtMADcents(splitState.total);
      const tipRow = $('#split-tip-row');
      if (tipPct > 0) {
        tipRow.style.display = '';
        $('#split-tip-label').textContent = `+ pourboire ${tipPct}%`;
        $('#split-tip-display').textContent = `+ ${fmtMADcents(tipAmt)}`;
      } else {
        tipRow.style.display = 'none';
      }
      $('#split-per-person').textContent = fmtMADcents(perPerson);
      $('#split-egal-desc').textContent = `${splitState.numParts} parts · ${fmtMADcents(perPerson)} chacun`;
    }

    function renderConvivesChips() {
      const opts = [2, 3, 4, 5, 6, 8];
      $('#split-convives-chips').innerHTML = opts.map(n =>
        `<button class="split-chip ${n === splitState.numConvives ? 'is-active' : ''}" data-convives="${n}">${n} convives</button>`
      ).join('');
    }

    /* Allocate in centimes, including the remainder. Each returned amount has
       at most two decimals and their sum is exactly the requested total. */
    function shareMoney(total, n) {
      const cents = minor(total);
      const base = Math.floor(cents / n);
      let rest = cents - base * n;
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(major(base + (rest > 0 ? 1 : 0)));
        if (rest > 0) rest--;
      }
      return out;
    }

    /* Allocate a monetary total proportionally to arbitrary positive weights.
       Largest remainders receive the leftover centimes, so a discounted
       article split preserves both the grand total and the relative shares. */
    function shareWeighted(total, weights) {
      const target = minor(total);
      const clean = weights.map(w => Math.max(0, Number(w) || 0));
      const sum = clean.reduce((s, w) => s + w, 0);
      if (!clean.length) return [];
      if (!(sum > 0)) return shareMoney(total, clean.length);
      const raw = clean.map(w => target * w / sum);
      const cents = raw.map(Math.floor);
      let rest = target - cents.reduce((s, n) => s + n, 0);
      raw.map((n, i) => ({ i, frac: n - cents[i] }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i)
        .forEach(x => { if (rest > 0) { cents[x.i]++; rest--; } });
      return cents.map(major);
    }

    /* ---- launch flow ---- */
    function launchSplitFlow() {
      if (minor(splitState.total) <= 0) {
        /* A fully-discounted table is not a cash/card payment, but it is still
           a completed commercial event. Record the approved 100% reduction as
           an auditable complimentary settlement before freeing the table.
           Generic zero totals remain blocked. */
        if (!splitState.isVrap && splitState.tableId) {
          const lines = Array.isArray(splitState.sourceLines) ? splitState.sourceLines : [];
          const discount = activeSaleDiscount(0, lines, splitState.tableId);
          if (discount && discount.grossAmountCents === discount.discountAmountCents) {
            const entry = recordSale(0, 'complimentary',
              (splitState.sourceLabel || 'Table') + ' · offerte', 0, lines, splitState.tableId);
            if (entry) {
              $('#split-modal').classList.remove('is-open');
              markPaid(splitState.tableId);
              toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Addition offerte enregistrée · table clôturée'));
              return;
            }
          }
        }
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Montant nul non justifié · appliquez une remise de 100 % approuvée'));
        return;
      }
      if (splitState.splitMode === 'egal' && minor(splitState.total) < splitState.numParts) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Trop de parts pour ce montant · chaque part doit avoir au moins 0,01 MAD'));
        return;
      }
      if (splitState.splitMode === 'article') {
        const allocation = splitArticleAllocation();
        if (!allocation.ok) { toast(allocation.message); return; }
      }
      if (splitState.splitMode === 'montant') {
        const allocation = splitAmountAllocation();
        if (!allocation.ok) { toast(splitAmountTr(allocation.message)); return; }
      }
      const parts = [];
      const tipTotal = Math.round(minor(splitState.total) * effectiveTipPct() / 100 + 1e-9) / 100;
      if (splitState.splitMode === 'egal') {
        const tipPct = effectiveTipPct();
        const baseShares = shareMoney(splitState.total, splitState.numParts);
        const tipShares = shareMoney(tipTotal, splitState.numParts);
        const label = tipPct > 0 ? `Part égale + pourboire ${tipPct}%` : 'Part égale';
        /* Une part égale ne portait aucune ligne : la vente entrait au journal
           comme un montant nu, donc invisible dans la ventilation par famille du
           rapport Z · une addition partagée en trois disparaissait entièrement des
           catégories tout en restant dans le total. On donne à chaque part sa
           fraction de la note, article par article, famille comprise. */
        const shareLines = Object.entries(splitState.itemTotals).map(([name, info]) => {
          const unitPrice = info.unitPrice || 0;
          const shareUnitPrice = money(unitPrice / splitState.numParts);
          return {
            name: `${name} · 1/${splitState.numParts}`,
            baseName: info.baseName || '',
            qty: info.totalQty,
            unit: shareUnitPrice,
            price: shareUnitPrice,
            total: money(info.totalQty * unitPrice / splitState.numParts),
            cat: lineCat(info.itemId || null, name),
            itemId: info.itemId || '',
            /* Chaque part porte le plat ENTIER à 1/N du prix pour que son reçu
               se lise bien. Le journal, le rapport Z et le stock, eux, doivent
               compter 1/N de plat par part : voir recordSale(). */
            shareDen: splitState.numParts,
          };
        });
        /* Le total de chaque ligne se partage au centime : 47,50 en trois faisait
           15,83 × 3 = 47,49 au rapport Z. Les centimes de reste tournent d'une
           part à l'autre, ligne après ligne, comme ceux de la note. */
        const nParts = splitState.numParts, lineCents = Object.entries(splitState.itemTotals).map(([, info]) => minor(money((info.totalQty || 0) * (info.unitPrice || 0))));
        let turn = 0;
        const lineShares = lineCents.map((c) => {
          const out = new Array(nParts).fill(Math.floor(c / nParts));
          for (let r = c - out[0] * nParts; r > 0; r--) { out[turn] += 1; turn = (turn + 1) % nParts; }
          return out;
        });
        for (let i = 0; i < splitState.numParts; i++) {
          parts.push({ base: baseShares[i], tip: tipShares[i], amount: money(baseShares[i] + tipShares[i]), label, lines: shareLines.map((l, k) => ({ ...l, total: major(lineShares[k][i]) })), paid: false, payMethod: null });
        }
      } else if (splitState.splitMode === 'montant') {
        /* Chaque part porte sa fraction de chaque plat (comme une part égale),
           au prorata du montant tapé : le rapport Z garde ses familles et le
           stock compte la bonne fraction de plat (shareDen, recordSale()). */
        const bases = splitAmountAllocation().cents.map(major);
        const entries = Object.entries(splitState.itemTotals);
        const lineShares = entries.map(([, info]) => shareWeighted(money((info.totalQty || 0) * (info.unitPrice || 0)), bases));
        const partLabel = splitAmountTr('Montant choisi');
        bases.forEach((base, i) => {
          const fraction = base / splitState.total;
          const pct = Math.max(1, Math.round(fraction * 100));
          parts.push({
            base, tip: 0, amount: base, label: partLabel, paid: false, payMethod: null,
            lines: entries.map(([name, info], k) => {
              const shareUnitPrice = money((info.unitPrice || 0) * fraction);
              return {
                name: `${name} · ${pct} %`, baseName: info.baseName || '',
                qty: info.totalQty, unit: shareUnitPrice, price: shareUnitPrice,
                total: lineShares[k][i], cat: lineCat(info.itemId || null, name),
                itemId: info.itemId || '', shareDen: 1 / fraction,
              };
            }),
          });
        });
      } else {
        const n = splitState.numConvives;

        for (let c = 1; c <= n; c++) {
          const cart = splitState.perConvive[c] || {};
          const amt = Object.entries(cart).reduce((s, [name, qty]) => {
            return s + qty * (splitState.itemTotals[name]?.unitPrice || 0);
          }, 0);

          if (amt < 0.01) continue; // skip empty convives

          const items = Object.entries(cart)
            .map(([name, qty]) => qty > 1 ? `${qty}× ${name}` : name)
            .join(', ');
          const assignedLines = Object.entries(cart).map(([name, qty]) => {
            const info = splitState.itemTotals[name] || {};
            const unitPrice = info.unitPrice || 0;
            return {
              name, baseName: info.baseName || '', qty,
              unit: unitPrice,
              price: unitPrice,
              total: money(qty * unitPrice),
              cat: lineCat(info.itemId || null, name),
              itemId: info.itemId || '',
            };
          });
          const partLines = assignedLines;
          parts.push({
            weight: amt,
            label: items || 'Part équilibrée',
            /* Chaque part garde ses lignes pour que le ticket imprimé du
               convive liste ses articles, pas juste un montant. */
            lines: partLines,
            paid: false, payMethod: null,
          });
        }
        const weights = parts.map(p => p.weight);
        const bases = shareWeighted(splitState.total, weights);
        const tips = shareWeighted(tipTotal, weights);
        parts.forEach((p, i) => {
          p.base = bases[i]; p.tip = tips[i]; p.amount = money(bases[i] + tips[i]);
          delete p.weight;
        });
      }

      if (!parts.length || parts.some(part => minor(part.base) <= 0)) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Une part vaut 0 MAD · regroupez les articles ou ajustez la remise'));
        return;
      }
      const flowSession = (splitState.tableId && phoneSessionOf(splitState.tableId)) || ('flow-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7));
      splitState.flow = { parts, paidCount: 0, session: flowSession,
        id: 'split-' + (window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)) };
      if (!splitState.isVrap && splitState.tableId) {
        tableSettlement().bill(splitState.tableId, { totalCents: minor(splitState.total), lines: splitState.sourceLines });
        tableSettlement().allocateSplit(splitState.tableId, { id: splitState.flow.id, parts: parts.map(part => minor(part.base)) });
      }
      $('#split-setup').hidden = true;
      $('#split-flow').hidden = false;
      renderSplitFlow();
      lucide.createIcons();
    }

    function renderSplitFlow() {
      const { parts, paidCount } = splitState.flow;
      $('#split-flow-progress').textContent = `${paidCount} / ${parts.length} réglées`;
      $('#split-parts-list').innerHTML = parts.map((p, idx) => {
        if (p.paid) {
          return `<div class="split-part-card is-paid" data-part="${idx}">
            <div class="split-part-num"><i data-lucide="check"></i></div>
            <div class="split-part-info">
              <div class="split-part-amount">${fmtMADcents(p.amount)}</div>
              <div class="split-part-paid-label">Réglé · ${p.payMethod === 'carte' ? 'Carte' : 'Espèces'}</div>
            </div>
            <div class="split-part-btns">
              <button class="split-part-btn reprint" data-reprint-part="${idx}" aria-label="Réimprimer le ticket">
                <i data-lucide="printer"></i><span>Ticket</span>
              </button>
            </div>
          </div>`;
        }
        return `<div class="split-part-card" data-part="${idx}">
          <div class="split-part-num">${idx + 1}</div>
          <div class="split-part-info">
            <div class="split-part-amount">${fmtMADcents(p.amount)}</div>
            <div class="split-part-label">${splitPartLabel(p.label)}</div>
          </div>
          <div class="split-part-btns">
            <button class="split-part-btn carte" data-pay-part="${idx}" data-pay-method="carte" aria-label="Payer par carte">
              <i data-lucide="credit-card"></i><span>Carte</span>
            </button>
            <button class="split-part-btn cash-dark" data-pay-part="${idx}" data-pay-method="cash" aria-label="Payer en espèces">
              <i data-lucide="banknote"></i><span>Espèces</span>
            </button>
          </div>
        </div>`;
      }).join('');
      lucide.createIcons();
    }

    function paySplitPart(partIdx, method) {
      const part = splitState.flow.parts[partIdx];
      if (!part || part.paid) return;

      // Bind modal subtitle to the split context
      setPayBindings(`Part ${partIdx + 1}`, splitState.sourceLabel || splitState.tableId || '');

      if (method === 'carte') {
        /* openCardModal() derives both the displayed and authorized amount from
           currentTotal(). Without this override a 40 MAD card part displayed,
           then authorized, the full table amount. */
        cashAmountOverride = part.amount;
        splitPayCallback = () => markSplitPartPaid(partIdx, 'carte');
        openCardModal();
      } else {
        cashAmountOverride = part.amount;
        splitPayCallback = () => markSplitPartPaid(partIdx, 'cash');
        openCashModal();
      }
    }

    function markSplitPartPaid(partIdx, method) {
      const p = splitState.flow.parts[partIdx];
      if (!p || p.paid) return;
      const tip = money(p.tip || 0);
      const base = money(p.base != null ? p.base : (p.amount - tip));
      const splitInfo = { index: partIdx, count: splitState.flow.parts.length, flowId: splitState.flow.id };
      /* 'wallet' : une part payée par Autre dans le volet du kit (étape 4) ; la
         fenêtre livrée ne passe que 'carte' et 'cash'. */
      const entry = recordSale(base, method === 'carte' ? 'card' : method === 'wallet' ? 'wallet' : 'cash',
        (splitState.sourceLabel || 'Table') + ' · part ' + (partIdx + 1), tip, p.lines,
        splitState.tableId || '', null, splitInfo);
      if (!entry) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Encaissement non enregistré · la table reste ouverte'));
        return null;
      }
      if (entry) {
        /* `flow-*` is only the local split modal's resume key. A takeaway has
           no table visit; never send that UI token as a server session. Table
           splits still carry their real phone/table visit above. */
        if (!splitState.isVrap && splitState.flow && splitState.flow.session && !entry.session) {
          entry.session = String(splitState.flow.session);
        }
        p.saleId = entry.id;
      }
      p.paid = true; p.payMethod = method;
      splitState.flow.paidCount++;
      renderSplitFlow();

      if (method === 'cash') {
        openCashDrawer();
      }
      printSaleTicket(entry || lastSaleEntry());

      if (splitState.flow.paidCount >= splitState.flow.parts.length) {
        // All parts settled · finalize the sale
        $('#split-parts-list').style.opacity = '0.45';
        $('#split-all-done').hidden = false;
        if (splitState.isVrap)       settleVrapPayment();
        else if (splitState.tableId) markPaid(splitState.tableId);
        lucide.createIcons();
      }
      return entry;
    }

    
