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
      const itemTotals = {};
      (lines || []).forEach(l => {
        const unitPrice = l.qty > 0 ? (l.total / l.qty) : l.total;
        let key = l.name;
        if (itemTotals[key] && minor(itemTotals[key].unitPrice) !== minor(unitPrice)) key = `${l.name} · ${fmtMADcents(unitPrice)}`;
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
      $$('[data-split-tab]').forEach(tab =>
        tab.classList.toggle('is-active', tab.dataset.splitTab === splitState.splitMode));

      $('#split-egal-content').hidden = splitState.splitMode !== 'egal';
      $('#split-article-content').hidden = splitState.splitMode !== 'article';

      if (splitState.splitMode === 'egal') {
        $('#split-launch').disabled = false;
        $('#split-launch').textContent = 'Lancer le split';
        $('#split-launch').title = '';
        renderPartsChips();
        renderTipChips();
        updateSplitSummary();
      } else {
        renderArticleMode();
      }
      lucide.createIcons();
    }

    /* ---- Par article renderers ---- */
    function renderArticleMode() {
      renderConvivesChips();
      renderConvivesTabs();
      renderPool();
      renderConviveCart();
      const allocation = splitArticleAllocation();
      $('#split-launch').disabled = !allocation.ok;
      $('#split-launch').textContent = allocation.ok ? 'Encaisser les articles attribués' : allocation.message;
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
              toast('Addition offerte enregistrée · table clôturée');
              return;
            }
          }
        }
        toast('Montant nul non justifié · appliquez une remise de 100 % approuvée');
        return;
      }
      if (splitState.splitMode === 'egal' && minor(splitState.total) < splitState.numParts) {
        toast('Trop de parts pour ce montant · chaque part doit avoir au moins 0,01 MAD');
        return;
      }
      if (splitState.splitMode !== 'egal') {
        const allocation = splitArticleAllocation();
        if (!allocation.ok) { toast(allocation.message); return; }
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
        toast('Une part vaut 0 MAD · regroupez les articles ou ajustez la remise');
        return;
      }
      const flowSession = (splitState.tableId && phoneSessionOf(splitState.tableId)) || ('flow-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7));
      splitState.flow = { parts, paidCount: 0, session: flowSession,
        id: 'split-' + (window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)) };
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
            <div class="split-part-label">${p.label}</div>
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
        toast('Encaissement non enregistré · la table reste ouverte');
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

    
