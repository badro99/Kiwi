/* Owner: caisse shared till frame and pane adapters.
 * Exposes the classic global function declarations and lexical helpers below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */

    function tillKitOn() {
      /* Un métier de pos-dispatch est à l'écran (body.is-pos) : le cadre
         partagé est le sien (étape 4 (15)), la caisse restaurant n'y peint pas. */
      if (document.body.classList.contains('is-pos')) return false;
      if (tillKit) return true;
      if (!window.KiwiTillFrame || !window.KiwiKit) return false;
      const grid = $('#menu-grid'), panel = $('.rightpanel');
      if (!grid || !panel) return false;
      const menuBox = document.createElement('div');
      menuBox.id = 'kit-menu';
      grid.parentNode.insertBefore(menuBox, grid);
      const billBox = document.createElement('div');
      billBox.id = 'kit-bill';
      panel.appendChild(billBox);
      /* Le rail du kit (§10.20, étape 4 (10)) avant la barre latérale livrée,
         qui se cache une fois le kit monté ; ses boutons restent dans la page
         et Plus les déclenche. */
      const railBox = document.createElement('div');
      railBox.id = 'kit-rail';
      const shell = $('.shell'), side = $('.sidebar');
      if (shell && side) shell.insertBefore(railBox, side);
      /* Le téléphone (sous 768, §13.3) : la capsule d'onglets du kit en bas,
         à la place du rail, peinte des mêmes éléments et routée par le même
         rail.select ; la barre de l'addition (#rp-peek) passe au-dessus. */
      const tabBox = document.createElement('div');
      tabBox.id = 'kit-tabbar';
      document.body.appendChild(tabBox);
      tillKit = !!window.KiwiTillFrame.mount({ menu: menuBox, bill: billBox, rail: railBox, tabbar: tabBox, menuPane: $('.main'), act: tillKitAct });
      if (tillKit) {
        document.documentElement.setAttribute('data-k-till', '');
        tillKitMoreScrim();
        /* Le carnet clients se ferme aussi par sa flèche ou Échap : le rail suit. */
        document.addEventListener('kiwi:clientsbook', () => tillKitPaint());
        if (window.KiwiClientsBook) window.KiwiClientsBook.ensureChip();
        /* La cuisine s'ouvre à côté du rail, comme les autres pages (kit.css) :
           ce n'est plus une fenêtre modale qui cache le rail aux lecteurs d'écran. */
        const kdsScreen = document.getElementById('kds-screen');
        if (kdsScreen) { kdsScreen.setAttribute('role', 'region'); kdsScreen.removeAttribute('aria-modal'); }
        /* §18.9 : « Ouvrir la caisse » ouvre le comptage du fond sur le kit. */
        const ci = document.getElementById('clockin-btn');
        if (ci && !ci.classList.contains('is-confirmed')) ci.disabled = false;
        const ciErr = document.getElementById('ci-float-err');
        if (ciErr) ciErr.hidden = true;
        /* §10.12, §10.26 : la bannière vivante et la région polie sont dans le
           DOM dès le montage, vides ; les écrire annonce une fois. */
        const main = $('.main');
        if (main && customElements.get('k-banner')) {
          const banner = document.createElement('k-banner');
          banner.id = 'kit-sync-banner';
          banner.setAttribute('live', '');
          banner.setAttribute('tone', 'danger');
          main.insertBefore(banner, main.firstChild);
        }
        const say = document.createElement('div');
        say.id = 'kit-sync-say';
        say.setAttribute('role', 'status');
        say.setAttribute('aria-live', 'polite');
        say.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
        document.body.appendChild(say);
        /* §18.3 (étape 4 (12)) : les commandes en ligne en tête de l'onglet
           À emporter (assets/kit/till-online.js) ; plus de pastille ni de
           panneau flottant. */
        const vrapBoard = $('#vrap-board');
        if (vrapBoard && window.KiwiTillOnline) {
          const online = document.createElement('div');
          online.id = 'kit-online';
          online.hidden = true;
          vrapBoard.insertBefore(online, vrapBoard.firstChild);
          window.KiwiTillOnline.mount(online, { onPaint: () => { if (tillKitOn()) window.KiwiTillFrame.paint({ rail: tillKitRail() }); } });
          const oldChip = document.getElementById('kop-chip');
          if (oldChip) oldChip.remove();
        }
      }
      return tillKit;
    }
    function tillKitSections() {
      const inView = (m) => activeCat === 'all' || (m.cat === activeCat && (!activeSub || m.subId === activeSub));
      const source = (mode !== 'vrap' && selectedId) ? (tableOrders[selectedId] || []) : cart;
      const soldOut = Array.isArray(carteState.soldOut) ? carteState.soldOut : [];
      const secs = [], byCat = {};
      const put = (m, out) => {
        const cat = String(m.cat || '');
        if (!byCat[cat]) { byCat[cat] = { id: cat || 'menu', title: catLabelL(m.cat) || '', items: [] }; secs.push(byCat[cat]); }
        byCat[cat].items.push({
          id: String(m.id), name: menuName(m), price: m.price, soldOut: out,
          options: !out && !!((m.formula && Array.isArray(m.formula.slots) && m.formula.slots.length) || itemOptGroups(m).length),
          qty: out ? 0 : source.filter(c => c.id === m.id).reduce((s, c) => s + c.qty, 0),
        });
      };
      menuItems.filter(inView).forEach(m => put(m, false));
      soldOut.filter(inView).forEach(m => put(m, true));
      return secs;
    }
    function tillKitLine(l, i) {
      const mods = [];
      if (l.opts && l.opts.length) mods.push(optText(l.opts));
      if ((l.note || '').trim()) mods.push(l.note.trim());
      const sent = !!l.sent;
      return { id: String(l.uid || 'l' + i), qty: l.qty, name: lineName(l), mods,
        price: l.total != null ? l.total : l.price * l.qty, sent, sentAt: '', sentQty: sent ? l.qty : 0 };
    }
    const tillKitDiscount = (d, amt) => amt > 0
      ? { label: d && d.kind === 'pct' ? `Remise ${d.value} %` : 'Remise', amount: -amt } : null;
    /* Ce que montre le volet livré, et rien d'autre : un volet fermé est une
       addition vide. */
    function tillKitBill() {
      const empty = { title: '', meta: '', lines: [], total: 0 };
      if ($('#rp-active').hidden) return empty;
      /* Le volet livré se traduit un instant APRÈS ce rendu (caisse-lang
         observe le DOM) : l'addition du kit restait « À emporter » en arabe.
         On passe donc le texte au traducteur ici. Le total, que l'addition
         montre déjà en bas, au format du kit, n'est pas répété dans l'en-tête
         (« 1 article · 45 MAD » sous « Total 45,00 MAD »). */
      const lang = window.KiwiCaisseLang, tr = (x) => (lang && lang.tr ? lang.tr(x) : x);
      const title = tr($('#rp-table').textContent || '');
      const meta = tr($('#rp-substatus').textContent || '').replace(/\s*·\s*[^·]*MAD[^·]*$/, '');
      if (mode === 'vrap') {
        const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
        const disc = vrapDiscountAmount(gross);
        return { title, meta, lines: cart.map(tillKitLine), discount: tillKitDiscount(vrapDiscount, disc),
          total: Math.max(0, gross - disc), sendOnPay: true, more: tillKitOverflowRows().length > 0 };
      }
      if (mode === 'order' && selectedId) {
        const order = tableOrders[selectedId] || [];
        return { title, meta, lines: order.map(tillKitLine), total: order.reduce((s, l) => s + l.price * l.qty, 0), more: tillKitOverflowRows().length > 0 };
      }
      if (selectedId && tables[selectedId]) {
        const lines = generateOrder(selectedId, tables[selectedId]);
        const gross = lines.reduce((s, l) => s + l.total, 0);
        const disc = discountAmountFor(selectedId, gross);
        return { title, meta, lines: lines.map(tillKitLine), discount: tillKitDiscount(tables[selectedId].discount, disc),
          total: Math.max(0, gross - disc), sendOnPay: true, more: tillKitOverflowRows().length > 0 };
      }
      return empty;
    }
    /* The bill's ⋯ (design 2027 §10: bill.transfer, bill.merge, bill.clear,
       bill.cancel_table). It emitted k.bill.overflow and nothing listened, so
       the button did nothing (owner, 2026-10-23). Each row presses the
       shipped control, which keeps its own guards: the feature switches, and
       the server-checked code before anything is cleared or cancelled. */
    function tillKitOverflowRows() {
      const rows = [];
      const cancel = '[data-action="cancel-table"]';
      if (mode === 'vrap') {
        if (cart.length || vrapEditingNum != null) rows.push(['clear', 'bill.clear', cancel]);
        return rows;
      }
      if (mode === 'order') {
        if (selectedId) rows.push(['cancel_order', 'bill.cancel_order', cancel]);
        return rows;
      }
      if (!selectedId || !tables[selectedId]) return rows;
      if (hasTables() && !isFeatureOff('tableTransfer') && !isFeatureOff('table-transfer') && $('#rp-transfer-table')) rows.push(['transfer', 'bill.transfer', '#rp-transfer-table']);
      if (hasTables() && !isFeatureOff('tableMerge') && !isFeatureOff('table-merge') && $('#rp-merge-table')) rows.push(['merge', 'bill.merge', '#rp-merge-table']);
      rows.push(['cancel_table', 'bill.cancel_table', cancel]);
      return rows;
    }
    
    function tillKitOpenOverflow(anchor) {
      if (!customElements.get('k-popover')) return;
      const rows = tillKitOverflowRows();
      if (!rows.length) return;
      if (!tillKitOverflowPop) {
        tillKitOverflowPop = document.createElement('k-popover');
        tillKitOverflowPop.addEventListener('kiwi:action', (e) => {
          const d = e.detail || {};
          if (d.action !== 'k.button.press') return;
          e.stopPropagation();
          const host = e.composedPath().find((n) => n && n.getAttribute && n.hasAttribute('data-row'));
          const row = host && tillKitOverflowRows().find((r) => r[0] === host.getAttribute('data-row'));
          tillKitOverflowPop.removeAttribute('open');
          const el = row && document.querySelector(row[2]);
          if (el) el.click();
        });
        document.body.appendChild(tillKitOverflowPop);
      }
      tillKitOverflowPop.setAttribute('heading', kkt('action.more'));
      tillKitOverflowPop.textContent = '';
      rows.forEach(([id, key]) => {
        const b = document.createElement('k-button');
        b.setAttribute('label', kkt(key));
        b.setAttribute('data-row', id);
        if (id === 'clear' || id === 'cancel_order' || id === 'cancel_table') b.setAttribute('variant', 'tonal-danger');
        b.style.display = 'block';
        b.style.marginBlockEnd = '8px';
        tillKitOverflowPop.appendChild(b);
      });
      tillKitOverflowPop.anchor = anchor || null;
      tillKitOverflowPop.setAttribute('open', '');
    }
    
    function tillKitOpenPay() {
      if (!(currentTotal() > 0)) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Addition vide')); return; }
      if (mode === 'order' && selectedId && orderInProgressCount() > 0) validateOrder(selectedId);
      resetPayTip();
      const lang = window.KiwiCaisseLang, billName = $('#rp-table').textContent || '';
      window.KiwiTillFrame.openPay({ bill: lang && lang.tr ? lang.tr(billName) : billName, due: currentTotal(), method: null, tipPct: 0 });
    }
    function tillKitTip(pct) {
      const p = Math.max(0, Math.min(100, Number(pct) || 0));
      if ([0, 5, 10, 15].includes(p)) payTipMode = String(p);
      else { payTipMode = 'autre'; payTipCustom = p; }
    }
    async function tillKitConfirm(kind, value) {
      const method = TILL_KIT_METHOD[kind];
      const pay = window.KiwiTillFrame.pay();
      if (!method || tenderInFlight) return;
      /* Une part de division : son propre montant et son propre pourboire
         (§10.30) ; payTipAmount() vaut 0 pendant une division. */
      const share = tillKitShare && splitState.flow ? splitState.flow.parts[tillKitShare.idx] : null;
      const tipNow = share ? money(pay.tip()) : payTipAmount();
      const total = share ? money(share.base + tipNow) : Math.round((currentTotal() + payTipAmount()) * 100) / 100;
      const got = kind === 'cash' ? Math.round((+value.received || 0) * 100) / 100 : total;
      if (got < total) return;
      if (share) {
        share.tip = tipNow;
        share.amount = money(share.base + tipNow);
        const key = kind === 'card' ? 'carte' : kind === 'other' ? 'wallet' : 'cash';
        const idx = tillKitShare.idx;
        splitPayCallback = () => markSplitPartPaid(idx, key);
      }
      tenderInFlight = true;
      let settled;
      try { settled = await finalizeTender(method); }
      catch (_) { tenderInFlight = false; pay.notRecorded(); toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Encaissement à vérifier dans le journal avant de réessayer')); return; }
      tenderInFlight = false;
      if (share && !share.paid) { pay.notRecorded(); return; }   // markSplitPartPaid a dit pourquoi
      const sale = settled === 'split' ? null : lastSaleEntry();
      /* §10.26 : la ligne du moment payé lit la sauvegarde du service telle
         qu'elle est au retour de recordSale. */
      const last = sale || lastSaleEntry();
      const held = !!(last && (last.saleSyncError || last.saleHeldLocal));
      const p = pay.p();
      if (tillKitSave !== true) { p.note = kkt('sync.screen_only'); p.noteTone = 'warning'; }
      else if (navigator.onLine === false || held) { p.note = kkt('sync.saved_here'); p.noteTone = ''; }
      else { p.note = ''; p.noteTone = ''; }
      pay.paid();
      if (kind === 'cash') {
        /* markSplitPartPaid ouvre déjà le tiroir d'une part payée en espèces. */
        if (!share) openCashDrawer();
        const change = Math.round((got - total) * 100) / 100;
        if (change > 0) toast('Monnaie à rendre : ' + fmtMAD(change));
      }
      if (sale) printSaleTicket(sale);
      resetPayTip();
      setTimeout(() => {
        window.KiwiTillFrame.closePay();
        if (share) tillKitAfterShare();
        try { tillKitPaint(); } catch (_) {}
      }, 1200);
    }

    
    function tillKitSplitBill() {
      return { total: splitState.total, lines: Object.entries(splitState.itemTotals)
        .map(([name, info]) => ({ id: name, name, amount: money(info.totalQty * info.unitPrice) })) };
    }
    function tillKitPaidShares() {
      if (!splitState.flow || !tillKitShareMap) return [];
      return Object.keys(tillKitShareMap).map(Number)
        .filter(n => { const p = splitState.flow.parts[tillKitShareMap[n]]; return p && p.paid; });
    }
    function tillKitSplitStarted() {
      return !!(splitState.flow && splitState.flow.paidCount > 0 && splitState.flow.paidCount < splitState.flow.parts.length);
    }
    function tillKitOpenSplit() {
      if (!(currentTotal() > 0)) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Addition vide')); return; }
      const source = mode === 'vrap' ? null : selectedId;
      const resume = tillKitSplitStarted() && (mode === 'vrap' ? splitState.isVrap : splitState.tableId === source);
      if (!resume) {
        openSplitModal(source);
        $('#split-modal').classList.remove('is-open');
        splitState.flow = null;
        tillKitShareMap = null;
      }
      window.KiwiTillFrame.openPane('split', { bill: tillKitSplitBill(), paidShares: tillKitPaidShares() });
    }
    function tillKitPayShare(n) {
      const el = window.KiwiTillFrame.pane('split');
      if (!splitState.flow) {
        const plan = el.plan();
        splitState.tipMode = '0';
        splitState.customTipPct = 0;
        if (plan.mode === 'equal') { splitState.splitMode = 'egal'; splitState.numParts = plan.n; }
        else {
          splitState.splitMode = 'article';
          splitState.numConvives = plan.n;
          splitState.perConvive = {};
          Object.entries(plan.assign).forEach(([name, s]) => {
            const info = splitState.itemTotals[name];
            if (info && s) (splitState.perConvive[s] = splitState.perConvive[s] || {})[name] = info.totalQty;
          });
        }
        launchSplitFlow();
        if (!splitState.flow) return;
        tillKitShareMap = {};
        if (splitState.splitMode === 'egal') { for (let i = 1; i <= plan.n; i++) tillKitShareMap[i] = i - 1; }
        else {
          let k = 0;
          for (let c = 1; c <= plan.n; c++) if (splitState.perConvive[c] && Object.keys(splitState.perConvive[c]).length) tillKitShareMap[c] = k++;
        }
      }
      const idx = tillKitShareMap[n];
      const part = idx == null ? null : splitState.flow.parts[idx];
      if (!part || part.paid) return;
      tillKitShare = { idx, n };
      cashAmountOverride = part.base;
      window.KiwiTillFrame.openPay({ bill: (splitState.sourceLabel || '') + ' · ' + kkt('split.share_n', { n }), due: part.base, method: null, tipPct: 0 });
    }
    function tillKitAfterShare() {
      tillKitShare = null;
      cashAmountOverride = null;
      splitPayCallback = null;
      const f = splitState.flow;
      if (f && f.paidCount >= f.parts.length) {
        window.KiwiTillFrame.closePane('split');
        closeSplitModal({ skipRevert: true });
        splitState.flow = null;
        tillKitShareMap = null;
        return;
      }
      window.KiwiTillFrame.openPane('split', { paidShares: tillKitPaidShares() });
    }
    function tillKitLeaveSplit() {
      window.KiwiTillFrame.closePane('split');
      cashAmountOverride = null;
      splitPayCallback = null;
      /* Rien de payé : rien à reprendre. Une part payée garde le flux, que
         Diviser rouvre là où il en était. */
      if (!tillKitSplitStarted()) { splitState.flow = null; tillKitShareMap = null; }
      tillKitPaint();
    }

    
    function tillKitDiscountTarget() {
      if (mode === 'vrap') return { target: 'vrap', tableId: null, gross: cart.reduce((s, l) => s + l.price * l.qty, 0) };
      if (selectedId && tables[selectedId]) {
        return { target: 'table', tableId: selectedId, gross: generateOrder(selectedId, tables[selectedId]).reduce((s, l) => s + l.total, 0) };
      }
      return null;
    }
    function tillKitOpenDiscount() {
      const tg = tillKitDiscountTarget();
      if (!tg || !(tg.gross > 0)) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Addition vide')); return; }
      if (tg.tableId && typeof tableSplits !== 'undefined' && tableSplits.has(tg.tableId)) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr("Termine le split d'abord")); return; }
      const P = window.KiwiDiscountPolicy;
      try { if (P && P.refresh) P.refresh(true); } catch (_) {}
      window.KiwiTillFrame.openPane('discount', { bill: { total: money(tg.gross) }, policy: {
        configured: !!(P && P.configured && P.configured()),
        percentages: (P && P.percentages && P.percentages()) || [5, 10, 15, 20],
      } });
    }
    function tillKitApplyDiscount(v) {
      const tg = tillKitDiscountTarget();
      if (!tg) return;
      Object.assign(remiseState, { target: tg.target, tableId: tg.tableId, gross: tg.gross,
        kind: v.mode === 'amount' ? 'amount' : 'pct', value: Number(v.value) || 0, reason: TILL_KIT_REASON[v.reason] || 'Autre' });
      window.KiwiTillFrame.closePane('discount');
      applyRemise();
      tillKitPaint();
    }

    
    const tillKitClientsOpen = () => { const r = document.getElementById('kcb-root'); return !!(r && r.style.display !== 'none'); };
    const tillKitLive = (sel) => { const el = sel && document.querySelector(sel); return el && !el.hasAttribute('hidden') ? el : null; };
    function tillKitRail() {
      const kdsOpen = !!(typeof kdsEl !== 'undefined' && kdsEl && kdsEl.classList.contains('is-open'));
      const value = tillKitClientsOpen() ? 'clients' : kdsOpen ? 'kitchen' : mode === 'vrap' ? 'takeaway' : mode === 'waitlist' ? 'waiting' : 'floor';
      const newTickets = (typeof kdsOrders !== 'undefined' ? kdsOrders : []).filter((o) => o && o.status === 'new').length;
      /* §18.3 : le badge À emporter compte les commandes en ligne à accepter. */
      const toAccept = window.KiwiTillOnline ? window.KiwiTillOnline.pending() : 0;
      const items = [
        ['floor', 'table_restaurant', 'till.nav.floor', '.mode-pill[data-mode="salle"]'],
        ['takeaway', 'shopping_bag', 'till.nav.takeaway', '.mode-pill[data-mode="vrap"]'],
        ['waiting', 'schedule', 'till.nav.waiting', '.mode-pill[data-mode="waitlist"]'],
        ['kitchen', 'skillet', 'till.nav.kitchen', '#open-kds'],
        /* Le carnet clients sur le rail, pas en pastille flottante sur l'écran
           (propriétaire, 2026-10-23). Il ouvre l'entrée que clients-book.js
           pose dans la barre latérale livrée, la même que Plus · Fidélité. */
        ['clients', 'group', 'till.nav.clients', TILL_KIT_CLIENTS],
      ].filter((r) => tillKitLive(r[3])).map(([id, icon, key]) => {
        const it = { id, icon, label: kkt(key), badge: id === 'kitchen' ? newTickets : id === 'takeaway' ? toAccept : 0 };
        if (id === 'takeaway' && toAccept) it.a11y = kkt('till.nav.takeaway_a11y', { n: toAccept });
        return it;
      });
      items.push(tillKitMoreOpen
        ? { id: 'more', icon: 'close', label: kkt('till.nav.less') }
        : { id: 'more', icon: 'more_horiz', label: kkt('till.nav.more') });
      const who = (typeof currentCashier !== 'undefined' && currentCashier && currentCashier.name) || '';
      const footer = who ? { cashier: who } : {};
      const sync = tillKitLocked() ? null : tillKitSyncFooter(tillKitSyncRows());
      /* Sur le téléphone, l'état de la synchronisation est un point sur Plus
         (§10.26, point 3) ; ses mots vont dans le nom accessible de Plus. */
      if (sync) { sync.a11y = kkt('till.nav.more_a11y', { status: sync.label }); footer.sync = sync; }
      /* La tête du panneau porte exactement les mêmes éléments que le rail. */
      const nav = tillKitMoreNavEl();
      if (nav) { nav.sections = [{ items: items.map((it) => Object.assign({}, it)) }]; nav.setAttribute('value', value || ''); }
      /* Plus n'est pas une destination : la lentille reste sur le mode, et
         <k-rail> comme <k-sidebar> ne laissent pas toucher l'élément qui
         porte déjà leur valeur, ce qui empêcherait Moins de refermer. */
      return { value, items, footer, label: kkt('till.nav.more') };
    }
    
    function tillKitMoreNavEl() {
      if (tillKitMoreNav || !customElements.get('k-sidebar')) return tillKitMoreNav;
      const side = $('.sidebar'), brand = side && side.querySelector('.brand-row');
      if (!side) return null;
      const nav = document.createElement('k-sidebar');
      nav.setAttribute('flush', '');
    /* La barre est déjà sombre : le nav lit le jeu sombre du kit par l'îlot
       (§20.7, règle 5). Un hôte ne redéclare jamais un --k-* lui-même, la
       cohabitation de token-contrast-test le lui interdit. */
    nav.setAttribute('data-k-ground', 'inverse');
      nav.setAttribute('label', kkt('till.nav.more'));
      nav.addEventListener('kiwi:action', (e) => {
        const d = e.detail || {};
        if (d.action !== 'k.sidebar.select') return;
        e.stopPropagation();
        tillKitRailSelect(d.id == null ? null : String(d.id));
      });
      side.insertBefore(nav, brand ? brand.nextSibling : side.firstChild);
      tillKitMoreNav = nav;
      return nav;
    }
    function tillKitSetMore(on) {
      on = !!on;
      if (on === tillKitMoreOpen) return;
      tillKitMoreOpen = on;
      const root = document.documentElement;
      if (on) root.setAttribute('data-k-till-more', ''); else root.removeAttribute('data-k-till-more');
      window.KiwiTillFrame.paint({ rail: tillKitRail() });
    }
    /* Le panneau tient à partir de la bande qui donne déjà 360 au ticket
       (§13.3) : 88 de rail, 260 de panneau, le menu derrière. Plus bas, Plus
       garde la feuille, la route du téléphone (§18.3). */
    const tillKitPanelFits = () => window.innerWidth >= 1000;
    function tillKitToggleMore() {
      if (!tillKitPanelFits()) { tillKitOpenMore(); return; }
      tillKitSetMore(!tillKitMoreOpen);
    }
    function tillKitMoreScrim() {
      let el = document.getElementById('kit-more-scrim');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'kit-more-scrim';
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); tillKitSetMore(false); });
      document.body.appendChild(el);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tillKitMoreOpen) tillKitSetMore(false); });
      window.addEventListener('resize', () => { if (tillKitMoreOpen && !tillKitPanelFits()) tillKitSetMore(false); });
      return el;
    }
    function tillKitOpenMore() {
      const sections = TILL_KIT_MORE.map(([title, rows]) => ({
        title: kkt(title),
        rows: rows.filter((r) => !r[2] || tillKitLive(r[2])).map(([id, key]) => ({
          id, title: id === 'fullscreen' && document.fullscreenElement ? kkt('till.more.exit_fullscreen') : kkt(key),
        })),
      }));
      /* Le téléphone n'a pas le pied du rail : la synchronisation y est une
         ligne en tête de Plus (§10.26, point 3), qui ouvre le même détail. */
      const sync = window.KiwiTillFrame.capsule && window.KiwiTillFrame.capsule() && !tillKitLocked()
        ? tillKitSyncRows().filter((r) => r.n <= 7 || r.n === 9) : [];
      if (sync.length) {
        sections.unshift({ title: '', rows: [{ id: 'sync', icon: sync[0].icon, title: sync[0].text,
          subtitle: sync.slice(1).map((r) => r.text).join(' · ') }] });
      }
      window.KiwiTillFrame.openMore(sections, kkt('till.nav.more'));
    }
    function tillKitMore(id) {
      if (id === 'reload') { location.reload(); return; }
      if (id === 'sync') {
        const tabs = window.KiwiTillFrame.tabs && window.KiwiTillFrame.tabs();
        tillKitOpenSync(tabs && tabs.shadowRoot ? tabs.shadowRoot.querySelector('[data-id="more"]') : null);
        return;
      }
      for (const [, rows] of TILL_KIT_MORE) {
        const row = rows.find((r) => r[0] === id);
        if (row) { const el = tillKitLive(row[2]); if (el) el.click(); return; }
      }
    }
    function tillKitRailSelect(id) {
      if (id === 'more') { tillKitToggleMore(); window.KiwiTillFrame.paint({ rail: tillKitRail() }); return; }
      tillKitSetMore(false);
      /* Another destination leaves the payment, as its back button does: the
         payment layer floated over the kitchen and the clients book while the
         rail said Cuisine (owner, 2026-10-24). The bill is kept. */
      if (window.KiwiTillFrame.paying()) tillKitAct('pay.leave');
      const kdsOpen = !!(typeof kdsEl !== 'undefined' && kdsEl && kdsEl.classList.contains('is-open'));
      if (id === 'clients') {
        if (kdsOpen) closeKds();
        const entry = tillKitLive(TILL_KIT_CLIENTS);
        if (entry && !tillKitClientsOpen()) entry.click();
        tillKitPaint();
        return;
      }
      if (tillKitClientsOpen() && window.KiwiClientsBook) window.KiwiClientsBook.close();
      if (id === 'kitchen') { if (!kdsOpen) openKds(); tillKitPaint(); return; }
      if (kdsOpen) closeKds();
      const pill = { floor: 'salle', takeaway: 'vrap', waiting: 'waitlist' }[id];
      const el = pill && tillKitLive('.mode-pill[data-mode="' + pill + '"]');
      if (el) el.click();
      tillKitPaint();
    }
    
    function tillKitSyncRows() {
      const L = window.KiwiLive;
      const on = !!(L && L.isOn && L.isOn());
      let q = {};
      try { q = (L && L.queueStatus && L.queueStatus()) || {}; } catch (_) { q = {}; }
      const slug = on && L.merchant ? (L.merchant() || '') : '';
      const sales = (Array.isArray(journal) ? journal : []).filter((e) => e && e.kind !== 'refund' && !e.origin);
      const online = navigator.onLine !== false;
      const rows = [];
      const add = (n, key, icon, tone, count) => rows.push({ n, key, icon, tone, count: count || 0,
        text: count != null ? kkt(key, { n: count }) : kkt(key) });
      if (q.storageError || sales.some((e) => e.saleSyncError === 'queue-storage-full')) add(1, 'sync.storage_error', 'error', 'danger');
      if (tillKitSave === false) add(2, 'sync.not_saved', 'error', 'danger');
      if ((q.blocked || 0) > 0) add(3, 'sync.blocked', 'error', 'danger', q.blocked);
      if (on) {
        const refused = sales.filter((e) => e.saleSyncError && (!e.merchant || !slug || e.merchant === slug)).length;
        if (refused) add(4, 'sync.not_synced', 'warning', 'warning', refused);
        const unlinked = slug ? 0 : sales.filter((e) => e.saleSyncPending && !e.serverSaleId).length;
        if (unlinked) add(5, 'sync.waiting_store', 'storefront', 'ink2', unlinked);
      }
      if (!online && (q.pending || 0) > 0) add(6, 'sync.waiting', 'wifi_off', 'ink2', q.pending);
      if (online && (q.sending || 0) > 0) add(7, 'sync.sending', 'upload', 'ink2', q.sending);
      if (!on) add(8, 'sync.off', 'info', 'ink2');
      const queued = (q.total || 0) > 0;
      if (tillKitHadQueue && !queued) tillKitAllSentUntil = Date.now() + 4000;
      tillKitHadQueue = queued;
      if (Date.now() < tillKitAllSentUntil && !rows.some((r) => r.n <= 7)) add(9, 'sync.all_sent', 'task_alt', 'ink2');
      return rows;
    }
    function tillKitSyncFooter(rows) {
      const shown = rows.filter((r) => r.n <= 7 || r.n === 9);
      if (!shown.length) return null;
      const first = shown[0];
      const counted = shown.find((r) => r.n === 3 || r.n === 4);
      return { icon: first.icon, tone: first.tone === 'ink2' ? '' : first.tone, label: shown.map((r) => r.text).join(' · '),
        badge: counted ? counted.count : 0, badgeTone: counted ? (counted.n === 3 ? 'danger' : 'warning') : '' };
    }
    function tillKitLocked() { try { return !!(window.KiwiTillTenant && window.KiwiTillTenant.mismatch && window.KiwiTillTenant.mismatch()); } catch (_) { return false; } }
    function tillKitSay(text) {
      const say = document.getElementById('kit-sync-say');
      if (!say) return;
      if (say.textContent === text) { say.textContent = ''; setTimeout(() => { say.textContent = text; }, 60); }
      else say.textContent = text;
    }
    function tillKitSync() {
      if (!tillKitOn()) return;
      const rows = tillKitSyncRows();
      if (tillKitLocked()) return;            // R7 : calculé, ni dessiné ni annoncé
      const has = (n) => rows.find((r) => r.n === n);
      const banner = document.getElementById('kit-sync-banner');
      const top = has(1) || has(2);
      if (banner) { if (top) banner.setAttribute('message', top.text); else banner.removeAttribute('message'); }
      const was12 = tillKitPrev[1] || tillKitPrev[2];
      [3, 4].forEach((n) => { const r = has(n); if (r && !tillKitPrev[n]) tillKitSay(r.text); });
      if (was12 && !top) tillKitSay(kkt('sync.saved_again'));
      tillKitPrev = { 1: !!has(1), 2: !!has(2), 3: !!has(3), 4: !!has(4) };
      window.KiwiTillFrame.paint({ rail: tillKitRail() });
    }
    
    function tillKitOpenSync(anchor) {
      if (!customElements.get('k-popover')) return;
      if (!tillKitSyncPop) {
        tillKitSyncPop = document.createElement('k-popover');
        tillKitSyncPop.addEventListener('kiwi:action', (e) => {
          const d = e.detail || {};
          if (d.action !== 'k.button.press') return;
          e.stopPropagation();
          tillKitSendNow();
        });
        document.body.appendChild(tillKitSyncPop);
      }
      const rows = tillKitSyncRows().filter((r) => r.n <= 7 || r.n === 9);
      tillKitSyncPop.setAttribute('heading', kkt('till.nav.more'));
      tillKitSyncPop.textContent = '';
      rows.forEach((r) => { const p = document.createElement('p'); p.className = 'k-body'; p.style.margin = '0 0 8px'; p.textContent = r.text; tillKitSyncPop.appendChild(p); });
      if (rows.some((r) => r.n === 4)) {
        const b = document.createElement('k-button');
        b.setAttribute('icon', 'upload');
        b.setAttribute('label', kkt('sync.send_now'));
        if (tillKitSending) b.setAttribute('disabled', '');
        b.setAttribute('data-send-now', '');
        tillKitSyncPop.appendChild(b);
      }
      tillKitSyncPop.anchor = anchor || null;
      tillKitSyncPop.setAttribute('open', '');
    }
    function tillKitSendNow() {
      if (tillKitSending) return;
      tillKitSending = true;
      const btn = tillKitSyncPop && tillKitSyncPop.querySelector('[data-send-now]');
      if (btn) btn.setAttribute('disabled', '');
      try { reconcileJournalSales(true); } catch (_) {}
      try { window.KiwiLive && window.KiwiLive.flush && window.KiwiLive.flush(true); } catch (_) {}
      setTimeout(() => {
        tillKitSending = false;
        if (btn) btn.removeAttribute('disabled');
        tillKitSync();
        if (tillKitSyncPop && tillKitSyncPop.hasAttribute('open')) tillKitOpenSync(tillKitSyncPop.anchor);
      }, 600);
    }
    function tillKitAct(verb, id, value) {
      switch (verb) {
        case 'rail.sync': tillKitOpenSync(value && value.anchor); return;
        case 'rail.select': tillKitRailSelect(id); return;
        case 'rail.cashier': tillKitToggleMore(); return;
        case 'more.select': tillKitMore(id); return;
      }
      if (window.KiwiTillFrame.busy() && !/^(pay|split|discount)\./.test(verb)) return;
      switch (verb) {
        case 'pay.tip': tillKitTip(value.pct); return;
        case 'pay.confirm': tillKitConfirm(id, value); return;
        case 'pay.leave':
          resetPayTip();
          window.KiwiTillFrame.closePay();
          if (tillKitShare) {
            tillKitShare = null;
            cashAmountOverride = null;
            window.KiwiTillFrame.openPane('split', { paidShares: tillKitPaidShares() });
          }
          tillKitPaint();
          return;
        case 'split.pay-share': tillKitPayShare(Number(id)); return;
        case 'split.leave': tillKitLeaveSplit(); return;
        case 'discount.apply': tillKitApplyDiscount(value); return;
        case 'discount.leave': window.KiwiTillFrame.closePane('discount'); tillKitPaint(); return;
      }
      const list = mode === 'vrap' ? cart : (selectedId ? (tableOrders[selectedId] || []) : []);
      const line = id ? list.find(l => String(l.uid) === id) : null;
      if (line && line.kind === 'formula-part') return;
      const click = (sel) => { const el = $(sel); if (el) el.click(); };
      switch (verb) {
        case 'add':
        case 'options':
          addToCart(id);
          return;
        case 'step':
        case 'remove': {
          if (!line) return;
          const delta = verb === 'remove' ? (value.anchor ? -line.qty : -1) : (value.dir > 0 ? 1 : -1);
          if (mode === 'vrap') changeCartLineQty(line.uid, delta);
          else if (mode === 'order' && selectedId) changeTableOrderLineQty(selectedId, line.uid, delta);
          return;
        }
        case 'void':
          if (!line) return;
          if (mode === 'vrap') changeCartLineQty(line.uid, -1);
          else if (mode === 'order' && selectedId) changeTableOrderLineQty(selectedId, line.uid, -1);
          else if (selectedId && line.sent) cancelCaisseLineImmediately(selectedId, line);
          return;
        case 'send':
          if (mode === 'order' && selectedId) validateOrder(selectedId);
          return;
        case 'pay':
          tillKitOpenPay();
          return;
        case 'split': tillKitOpenSplit(); return;
        case 'discount': tillKitOpenDiscount(); return;
        case 'print': click('[data-action="print-bill"]'); return;
        case 'overflow': tillKitOpenOverflow(value && value.anchor); return;
      }
    }
    function tillKitPaint() {
      if (!tillKitOn()) return;
      /* Le volet livré s'est fermé (autre table, autre mode) : l'encaissement
         en cours n'a plus d'addition sous lui. */
      if ($('#rp-active').hidden && !tenderInFlight) {
        window.KiwiTillFrame.closePay();
        window.KiwiTillFrame.closePane('discount');
        if (!tillKitSplitStarted()) window.KiwiTillFrame.closePane('split');
      }
      window.KiwiTillFrame.paint({ sections: tillKitSections(), bill: tillKitBill(), rail: tillKitRail() });
      /* La barre d'addition du téléphone dit le total comme l'addition du kit
         (« 35,00 MAD »), pas comme le volet livré (« 35 MAD »). */
      const peek = document.getElementById('rp-peek-total');
      if (peek && window.KiwiKit && window.KiwiKit.money) peek.textContent = window.KiwiKit.money(currentTotal(), 2);
    }
    
    function tillKitAfter(fn) {
      return function () {
        const r = fn.apply(this, arguments);
        try { tillKitPaint(); } catch (e) { console.warn('[till-kit]', e); }
        if (!tillKitFramePending) {
          tillKitFramePending = true;
          requestAnimationFrame(() => { tillKitFramePending = false; try { tillKitPaint(); } catch (e) { console.warn('[till-kit]', e); } });
        }
        return r;
      };
    }
    
