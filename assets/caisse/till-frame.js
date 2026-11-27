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
    /* The dish's photo on its kit tile, the same one the shipped grid shows
       (catalogue.js menuArtKey: the dish words, then its sub-category, then
       the brand can for a soda). The 2027 tiles had none (owner, 26 Oct 2026). */
    /* The owner's own photo first, as on the classic grid (owner, 27 Nov 2026). */
    function tillKitPhoto(m) {
      try { return menuArtSrc(m.id, m.cat, m.name, m.subLabel, m.photo); } catch (_) { return { src: '' }; }
    }
    function tillKitSections() {
      const inView = (m) => activeCat === 'all' || (m.cat === activeCat && (!activeSub || m.subId === activeSub));
      const source = (mode !== 'vrap' && selectedId) ? (tableOrders[selectedId] || []) : cart;
      const soldOut = Array.isArray(carteState.soldOut) ? carteState.soldOut : [];
      const secs = [], byCat = {};
      let ph;
      const put = (m, out) => {
        const cat = String(m.cat || '');
        if (!byCat[cat]) { byCat[cat] = { id: cat || 'menu', title: catLabelL(m.cat) || '', items: [] }; secs.push(byCat[cat]); }
        byCat[cat].items.push({
          id: String(m.id), name: menuName(m), price: m.price, soldOut: out, img: (ph = tillKitPhoto(m)).src, imgOwn: ph.own, imgLib: ph.lib, imgFull: ph.full, outLabel: m.dlvOff && typeof dlvOffLabel === 'function' ? dlvOffLabel() : '',
          options: !out && !!((m.formula && Array.isArray(m.formula.slots) && m.formula.slots.length) || itemOptGroups(m).length),
          qty: out ? 0 : source.filter(c => c.id === m.id).reduce((s, c) => s + c.qty, 0),
        });
      };
      (typeof dlvList === 'function' ? dlvList(menuItems.filter(inView)) : menuItems.filter(inView)).forEach(m => put(m, !!m.dlvOff));
      soldOut.filter(inView).forEach(m => put(m, true));
      return secs;
    }
    function tillKitLine(l, i) {
      const mods = [];
      if (l.opts && l.opts.length) mods.push(optText(l.opts));
      if ((l.note || '').trim()) mods.push(l.note.trim());
      const sent = !!l.sent;
      return { id: String(l.uid || 'l' + i), qty: l.qty, name: lineName(l), mods,
        price: l.total != null ? l.total : l.price * l.qty, sent, sentAt: '', sentQty: sent ? l.qty : 0,
        editOptions: !sent && tillKitCanEditOptions(l), offer: tillKitOffer(l) };
    }
    /* « Offert » sur la ligne (caisse/discounts.js, toggleLineOffer) : les mots
       viennent d'ici, comme le commentaire de commande. */
    function tillKitOffer(l) {
      const on = +l.offered > 0;
      if (!l.uid || l.kind === 'formula-part' || !(on || +l.price > 0)) return null;
      const tr = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr;
      return { on, label: tr(on ? 'Remettre au prix' : 'Offrir cet article'), tag: tr('Offert'), was: on ? money(l.offered * l.qty) : 0 };
    }
    /* « Modifier les options » ne s'offre que sur un plat qui a des options :
       sur les autres le bouton ne faisait rien (Jon's Burgers, 25 nov.). */
    function tillKitEditItem(l) { return l && !l.kind ? menuItems.find(m => String(m.id) === String(l.id)) || null : null; }
    function tillKitCanEditOptions(l) { const item = tillKitEditItem(l); return !!(item && itemOptGroups(item).length); }
    const tillKitDiscount = (d, amt) => amt > 0
      ? { label: d && d.reward && d.reward.label ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Récompense') + ' · ' + d.reward.label
        : d && d.kind === 'pct' ? `Remise ${d.value} %` : 'Remise', amount: -amt } : null;
    /* Ce que montre le volet livré, et rien d'autre : un volet fermé est une
       addition vide. */
    /* A split set up on this bill: the shares already paid come off, the total
       and « Encaisser » say what is left (Browse, 26 Nov 2026: the bill said
       the whole 530 MAD after a 90 MAD share was paid). */
    function tillKitSplitRest(b) {
      const stored = typeof tillKitSavedSplit === 'function' ? tillKitSavedSplit() : null;   /* synced with the bill first */
      const saved = tillKitFlowHere() ? splitState.flow : stored;
      if (!saved || !Array.isArray(saved.parts) || !saved.parts.length) return b;
      const paid = saved.parts.filter(p => p && p.paid);
      const base = (p) => Number(p.base != null ? p.base : p.amount) || 0;
      b.split = { label: kkt('bill.split_paid', { paid: paid.length, total: saved.parts.length }), amount: -money(paid.reduce((s, p) => s + base(p), 0)) };
      b.total = money(saved.parts.filter(p => p && !p.paid).reduce((s, p) => s + base(p), 0));
      return b;
    }
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
      let meta = tr($('#rp-substatus').textContent || '').replace(/\s*·\s*[^·]*MAD[^·]*$/, '');
      /* Le client attaché à cette note (depuis sa fiche ou le sélecteur) :
         le volet livré l'affiche sur son bouton, l'addition du kit dans son
         en-tête. */
      const note = mode === 'vrap' ? 'vrap:' + (vrapEditingNum == null ? 'new' : vrapEditingNum) : 'table:' + (selectedId || '');
      /* Its own row says it now (name and card), so the header only names
         the customer when that row is not drawn. */
      const loyalty = tillKitBillLoyalty();
      if (!loyalty.client && saleClient && saleClient.ctx === note) meta = meta ? meta + ' · ' + saleClient.name : saleClient.name;
      if (mode === 'vrap') {
        const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
        const disc = vrapDiscountAmount(gross);
        /* A reopened takeaway order already went to the kitchen (unless it was
           held): its lines are sent, as the shipped panel treats them. */
        const open = vrapEditingNum != null ? kdsOrders.find((x) => x && x.num === vrapEditingNum) : null;
        const wasSent = !!(open && open.status !== 'held' && open.sentAt);
        const at = wasSent ? new Date(open.sentAt) : null;
        const sentAt = at ? String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0') : '';
        const vrapLine = (l, i) => Object.assign(tillKitLine(l, i), wasSent ? { sent: true, sentAt, sentQty: 0 } : {});
        return tillKitSplitRest({ title, meta, lines: cart.map(vrapLine), discount: tillKitDiscount(vrapDiscount, disc),
          total: Math.max(0, gross - disc), sendOnPay: true, sendLabel: tillKitShippedSend(), more: tillKitOverflowRows().length > 0, comment: counterCommentView(), ...loyalty });
      }
      if (mode === 'order' && selectedId) {
        const order = tableOrders[selectedId] || [];
        return { title, meta, lines: order.map(tillKitLine), total: order.reduce((s, l) => s + l.price * l.qty, 0), more: tillKitOverflowRows().length > 0, comment: counterCommentView(), ...loyalty };
      }
      if (selectedId && tables[selectedId]) {
        const lines = generateOrder(selectedId, tables[selectedId]);
        const gross = lines.reduce((s, l) => s + l.total, 0);
        const disc = discountAmountFor(selectedId, gross);
        /* « Envoyé à » + the time the table's first ticket left for the kitchen. */
        const at = (typeof kdsOrders !== 'undefined' ? kdsOrders : [])
          .filter((o) => o && String(o.table) === String(selectedId) && o.sentAt).map((o) => +new Date(o.sentAt)).filter(Boolean);
        const first = at.length ? new Date(Math.min(...at)) : null;
        const sentAt = first ? String(first.getHours()).padStart(2, '0') + ':' + String(first.getMinutes()).padStart(2, '0') : '';
        return tillKitSplitRest({ title, meta, lines: lines.map((l, i) => Object.assign(tillKitLine(l, i), l.sent ? { sentAt } : {})), discount: tillKitDiscount(tables[selectedId].discount, disc),
          total: Math.max(0, gross - disc), sendOnPay: true, sendLabel: tillKitShippedSend(), addLabel: tillKitShippedLabel('#rp-add-items'), more: tillKitOverflowRows().length > 0, comment: counterCommentView(), ...loyalty });
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
      /* The shipped « Changer » beside the waiter's name. */
      const server = $('#rp-server-row');
      if (server && !server.hidden && $('[data-action="reassign-server"]')) rows.push(['reassign', 'bill.reassign', '[data-action="reassign-server"]']);
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
      if (!(currentTotal() > 0)) { settleOfferedBill(); return; }
      if (tillKitSplitStarted() && tillKitLockedSplit()) return;   /* the open split takes the rest, share by share */
      if (mode === 'order' && selectedId && orderInProgressCount() > 0) validateOrder(selectedId);
      resetPayTip();
      const lang = window.KiwiCaisseLang, billName = $('#rp-table').textContent || '';
      window.KiwiTillFrame.openPay({ bill: lang && lang.tr ? lang.tr(billName) : billName, due: currentTotal(), method: null, tipPct: 0, client: tillKitClientLabel(), reward: tillKitRewardLabel() });
      tillKitWatchClient();
    }
    /* The loyalty reward (assets/caisse-loyalty-reward.js) sits under
       « Client & fidélité » on the shipped bill as #rp-reward: the payment
       row shows its label and presses it, and the amount due follows. */
    /* « Client & fidélité » on the note itself (owner, 2026-11-27: the card
       showed only after « Encaisser », so nobody asked for it while taking
       the order). The same shipped button as the payment's row: hidden there,
       no row here. */
    function tillKitBillLoyalty() {
      const label = tillKitClientLabel();
      const b = $('#rp-client');
      const on = !!(b && b.classList.contains('is-on'));
      /* The store's loyalty card (assets/wallet-till.js marks the page when it
         is on here): no customer yet → read their card with the camera; a
         customer on the note → hand them their card on their phone. */
      const act = label && document.documentElement.hasAttribute('data-wallet-card') ? (on ? 'card' : 'scan') : '';
      const tr = (x) => (window.KiwiCaisseLang && window.KiwiCaisseLang.tr ? window.KiwiCaisseLang.tr(x) : x);
      const actLabel = act === 'card' ? tr('Carte Wallet du client') : act === 'scan' ? tr('Scanner une carte') : '';
      return { client: label ? { label, on, act, actLabel } : null, reward: tillKitRewardLabel() };
    }
    let tillKitWalletHooked = false;
    function tillKitRewardLabel() {
      const b = $('#rp-reward');
      if (!b || b.hidden) return '';
      return (($('#rp-reward-label') || {}).textContent || '').trim();
    }
    function tillKitPayRefresh() {
      const pay = window.KiwiTillFrame.pay();
      if (!pay || pay.hidden || !pay.p || tillKitShare) return;
      const p = pay.p();
      p.due = currentTotal();
      p.client = tillKitClientLabel();
      p.reward = tillKitRewardLabel();
      pay.render();
    }
    /* « Client & fidélité » pendant l'encaissement : le bouton livré du volet
       (#rp-client) ouvre le carnet pour attacher ou créer une fiche. 2027 le
       montait nulle part, donc aucune carte client au moment de payer
       (associé, 2026-10-27). La ligne du paiement presse ce bouton et reprend
       son libellé (nom et points une fois attachée) ; masqué, pas de ligne. */
    function tillKitClientLabel() {
      const b = $('#rp-client');
      if (!b || b.hidden) return '';
      return (($('#rp-client-label') || {}).textContent || '').trim();
    }
    let tillKitClientObs = null;
    function tillKitWatchClient() {
      const b = $('#rp-client');
      if (tillKitClientObs || !b || typeof MutationObserver !== 'function') return;
      tillKitClientObs = new MutationObserver(() => {
        try { tillKitPaint(); } catch (e) { console.warn('[till-kit]', e); }
        const pay = window.KiwiTillFrame.pay();
        if (!pay || pay.hidden || !pay.p) return;
        const p = pay.p();
        if (p.client === tillKitClientLabel() && (p.reward || '') === tillKitRewardLabel()) return;
        tillKitPayRefresh();
      });
      tillKitClientObs.observe(b, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true, characterData: true });
      const r = $('#rp-reward');
      if (r) tillKitClientObs.observe(r, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true, characterData: true });
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
        const key = kind === 'card' ? 'carte' : kind === 'other' ? 'wallet' : 'cash';
        const idx = tillKitShare.idx;
        /* The share's tip is written for the sale and kept only once it is recorded. */
        splitPayCallback = () => {
          share.tip = tipNow; share.amount = money(share.base + tipNow);
          const entry = markSplitPartPaid(idx, key);
          if (!share.paid) { share.tip = 0; share.amount = share.base; }
          return entry;
        };
      }
      tenderInFlight = true;
      let settled;
      try { settled = await finalizeTender(method); }
      catch (_) { tenderInFlight = false; pay.notRecorded(); toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Encaissement à vérifier dans le journal avant de réessayer')); return; }
      tenderInFlight = false;
      if (settled === 'reward-refused') { tillKitPayRefresh(); return; }
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
      /* Ce qui a été reçu et la monnaie à rendre restent sous les yeux, pour
         chaque part comme pour une addition entière (Browse, 26 nov. 2026). */
      const change = kind === 'cash' ? Math.round((got - total) * 100) / 100 : 0;
      if (change > 0) { p.note = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Reçu') + ' ' + fmtMADcents(got) + ' · ' + (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Monnaie à rendre') + ' ' + fmtMADcents(change) + (p.note ? ' · ' + p.note : ''); p.noteTone = 'warning'; }
      pay.paid();
      if (kind === 'cash') {
        /* markSplitPartPaid ouvre déjà le tiroir d'une part payée en espèces. */
        if (!share) openCashDrawer();
        if (change > 0) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Monnaie à rendre') + ' : ' + fmtMAD(change));
      }
      if (sale) printSaleTicket(sale);
      resetPayTip();
      setTimeout(() => {
        window.KiwiTillFrame.closePay();
        if (share) tillKitAfterShare();
        try { tillKitPaint(); } catch (_) {}
      }, change > 0 ? 4000 : 1200);
    }

    
    /* By item, one row per unit: 4 × Tajine can go to four people, as on the
       shipped window (a weighed line stays whole). Row id « name#k ». */
    function tillKitSplitBill() {
      const lines = [];
      Object.entries(splitState.itemTotals).forEach(([name, info]) => {
        const q = info.totalQty;
        if (Number.isInteger(q) && q > 1 && q <= 40) for (let k = 1; k <= q; k++) lines.push({ id: name + '#' + k, name: name + ' · ' + k + '/' + q, amount: money(info.unitPrice) });
        else lines.push({ id: name + '#0', name: q > 1 || !Number.isInteger(q) ? q + ' × ' + name : name, amount: money(q * info.unitPrice) });
      });
      return { total: splitState.total, lines };
    }
    function tillKitPaidShares() {
      if (!splitState.flow) return [];
      return splitState.flow.parts.map((p, i) => (p && p.paid ? i + 1 : 0)).filter(Boolean);
    }
    /* The split saved for the bill on screen (the table, or this takeaway). */
    function tillKitSavedSplit() {
      if (mode !== 'vrap' && !selectedId) return null;
      return syncSplitToBill(mode === 'vrap' ? null : selectedId);   /* dishes added or voided since (held-sales.js) */
    }
    function tillKitBillKey() { return mode === 'vrap' ? 'vrap:' + (vrapEditingNum == null ? 'new' : vrapEditingNum) : 'table:' + (selectedId || ''); }
    /* splitState.flow belongs to the bill on screen. */
    function tillKitFlowHere() {
      return !!splitState.flow && (mode === 'vrap' ? splitState.isVrap : (!splitState.isVrap && splitState.tableId === selectedId));
    }
    /* A split is set up on this bill: saved, or a share already taken. Browse
       (26 Nov 2026): the kit rebuilt a fresh split each time Diviser opened,
       so after one share was paid and another table visited, the paid share
       was forgotten and the next one was refused (« Répartition différente du
       solde »). The saved split is the truth, as on the shipped window. */
    function tillKitSplitStarted() {
      const saved = tillKitSavedSplit();   /* synced with the bill first: it may reset the flow */
      if (tillKitFlowHere() && (splitState.flow.paidCount > 0 || saved)) return splitState.flow.paidCount < splitState.flow.parts.length;
      return !!saved;
    }
    function tillKitLockedSplit() {
      const saved = tillKitSavedSplit();
      if (!tillKitFlowHere()) {
        if (!saved) return false;
        loadSplitFlow(mode === 'vrap' ? null : selectedId);
        splitState.itemTotals = splitItemTotals(splitState.sourceLines);
      }
      tillKitShareMap = {};
      splitState.flow.parts.forEach((_, i) => { tillKitShareMap[i + 1] = i; });
      tillKitSplitKey = tillKitBillKey();
      window.KiwiTillFrame.openPane('split', { bill: { total: splitState.total, lines: [] }, paidShares: tillKitPaidShares(),
        parts: splitState.flow.parts.map(p => ({ amount: p.base != null ? p.base : p.amount, label: splitPartLabel(p.label), paid: !!p.paid })) });
      return true;
    }
    function tillKitOpenSplit() {
      if (!(currentTotal() > 0)) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Addition vide')); return; }
      if (tillKitSplitStarted() && tillKitLockedSplit()) return;
      const source = mode === 'vrap' ? null : selectedId;
      openSplitModal(source);
      $('#split-modal').classList.remove('is-open');
      splitState.flow = null;
      tillKitShareMap = null;
      tillKitSplitKey = tillKitBillKey();
      const pane = window.KiwiTillFrame.openPane('split', { bill: tillKitSplitBill(), paidShares: [], parts: null });
      /* A new split starts from the shipped defaults (covers at the table). */
      if (pane && pane.fresh) pane.fresh(splitState.numParts);
    }
    /* The plan on the pane becomes the shipped flow (launchSplitFlow, its
       guards and messages). Returns the part each kit share became. */
    function tillKitLaunchSplit() {
      const plan = window.KiwiTillFrame.pane('split').plan();
      splitState.tipMode = '0';
      splitState.customTipPct = 0;
      if (plan.mode === 'equal') { splitState.splitMode = 'egal'; splitState.numParts = plan.n; }
      /* Par montant: the typed shares, the shipped flow adds the rest (split-tender.js). */
      else if (plan.mode === 'amount') { splitState.splitMode = 'montant'; splitState.amountParts = plan.amounts.slice(); }
      else {
        splitState.splitMode = 'article';
        splitState.numConvives = plan.n;
        splitState.perConvive = {};
        Object.entries(plan.assign).forEach(([row, s]) => {
          const cut = row.lastIndexOf('#'), name = cut > 0 ? row.slice(0, cut) : row, info = splitState.itemTotals[name];
          if (!info || !s) return;
          const cart = (splitState.perConvive[s] = splitState.perConvive[s] || {});
          cart[name] = (cart[name] || 0) + (row.slice(cut + 1) === '0' || cut < 0 ? info.totalQty : 1);
        });
      }
      launchSplitFlow();
      if (!splitState.flow) return null;
      const map = {};
      if (splitState.splitMode === 'egal' || splitState.splitMode === 'montant') { for (let i = 1; i <= plan.n; i++) map[i] = i - 1; }
      else {
        let k = 0;
        for (let c = 1; c <= plan.n; c++) if (splitState.perConvive[c] && Object.keys(splitState.perConvive[c]).length) map[c] = k++;
      }
      saveSplitFlow();   /* set up is saved at once: leaving, another table or a reload keeps it */
      return map;
    }
    function tillKitPayShare(n) {
      let idx;
      if (!tillKitFlowHere()) {
        const map = tillKitLaunchSplit();
        if (!map) return;
        idx = map[n];
        tillKitLockedSplit();
      } else {
        if (!tillKitShareMap) tillKitLockedSplit();
        idx = tillKitShareMap[n];
      }
      const part = idx == null ? null : splitState.flow.parts[idx];
      if (!part || part.paid) return;
      tillKitShare = { idx, n: idx + 1 };
      cashAmountOverride = part.base;
      resetPayTip();
      window.KiwiTillFrame.openPay({ bill: (splitState.sourceLabel || '') + ' · ' + kkt('split.share_n', { n: idx + 1 }), due: part.base, method: null, tipPct: 0 });
    }
    /* « Enregistrer le partage » : the shares are set, nothing is taken. */
    function tillKitSaveSplit() {
      if (!tillKitFlowHere() && !tillKitLaunchSplit()) return;
      const t = !splitState.isVrap && tables[splitState.tableId];
      if (t && t.status !== 'khlass') { tableSettlement().project(t, { status: 'bgha-ykhlass' }); refreshTableNode(splitState.tableId); }
      tillKitLockedSplit();
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Partage enregistré · encaissez chaque part quand vous voulez'));
    }
    /* « Annuler le partage » : only while no share was paid (the shipped rule). */
    function tillKitCancelSplit() {
      if (!tillKitFlowHere() || splitState.flow.paidCount > 0) return;
      if (splitState.isVrap) vrapSplits.delete(vrapSplitKey(vrapEditingNum));
      else tableSplits.delete(splitState.tableId);
      try { persistShift(); } catch (_) {}
      splitState.flow = null;
      tillKitShareMap = null;
      tillKitOpenSplit();
      tillKitPaint();
    }
    function tillKitAfterShare() {
      tillKitShare = null;
      cashAmountOverride = null;
      splitPayCallback = null;
      const f = splitState.flow;
      if (!f || f.paidCount >= f.parts.length) {
        window.KiwiTillFrame.closePane('split');
        closeSplitModal({ skipRevert: true });
        splitState.flow = null;
        tillKitShareMap = null;
        return;
      }
      tillKitLockedSplit();
    }
    function tillKitLeaveSplit() {
      window.KiwiTillFrame.closePane('split');
      cashAmountOverride = null;
      splitPayCallback = null;
      /* A split that was set up stays saved; Diviser or Encaisser reopens it. */
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
      const pane = window.KiwiTillFrame.openPane('discount', { bill: { total: money(tg.gross) }, policy: {
        configured: !!(P && P.configured && P.configured()),
        percentages: (P && P.percentages && P.percentages(undefined, REMISE_PCTS)) || REMISE_PCTS,
        presets: (P && P.presets && P.presets()) || [],   /* remises nommées : seules proposées */
      } });
      const cur = tg.target === 'vrap' ? vrapDiscount : tables[tg.tableId].discount;
      if (pane && pane.fresh) pane.fresh(cur ? { mode: cur.kind === 'amount' ? 'amount' : 'percent', value: Number(cur.value) || 0,
        reason: Object.keys(TILL_KIT_REASON).find(k => TILL_KIT_REASON[k] === cur.reason) || (/fid|client/i.test(cur.reason || '') ? 'loyal-customer' : 'other') } : null);
    }
    /* « Retirer la remise » runs the shipped removal for this note. */
    function tillKitRemoveDiscount() {
      const tg = tillKitDiscountTarget();
      window.KiwiTillFrame.closePane('discount');
      if (!tg) { tillKitPaint(); return; }
      Object.assign(remiseState, { target: tg.target, tableId: tg.tableId, gross: tg.gross });
      removeRemise();
      tillKitPaint();
    }
    function tillKitApplyDiscount(v) {
      const tg = tillKitDiscountTarget();
      if (!tg) return;
      Object.assign(remiseState, { target: tg.target, tableId: tg.tableId, gross: tg.gross,
        kind: v.mode === 'amount' ? 'amount' : 'pct', value: Number(v.value) || 0, reason: (v.reason === 'preset' && v.presetName) || TILL_KIT_REASON[v.reason] || 'Autre' });
      window.KiwiTillFrame.closePane('discount');
      applyRemise();
      tillKitPaint();
    }

    
    /* The shipped « Envoyer en cuisine » (or « Envoyer la suite ») next to
       the bill: when it shows, the 2027 bill shows it too, with its words. */
    const tillKitShippedLabel = (sel) => {
      const b = $(sel);
      if (!b || b.hidden) return '';
      const lang = window.KiwiCaisseLang;
      const txt = (b.textContent || '').replace(/\s+/g, ' ').trim();
      return lang && lang.tr ? lang.tr(txt) : txt;
    };
    const tillKitShippedSend = () => tillKitShippedLabel('#rp-send-kitchen');
    const tillKitClientsOpen = () => { const r = document.getElementById('kcb-root'); return !!(r && r.style.display !== 'none'); };
    const tillKitLive = (sel) => { const el = sel && document.querySelector(sel); return el && !el.hasAttribute('hidden') ? el : null; };
    /* Le panneau Plus, rangé comme le tiroir de la boutique (propriétaire,
       2026-10-31) : une seule liste du kit, les destinations puis Service,
       Gestion et Cet appareil, icône et libellé par rangée, chacune cliquant
       son bouton livré. Les cartes livrées ne s'y dessinent plus
       (caisse-shell.css). Clients & fidélité est déjà en tête. */
    const TILL_KIT_MORE_ICON = { open_drawer: 'point_of_sale', cash_in_out: 'sync_alt', shift_change: 'swap_horiz', cancel_sale: 'close',
      refund: 'undo', sales: 'receipt_long', reprint: 'receipt', team: 'group', attendance: 'key', close: 'power_settings_new',
      menu: 'menu_book', stock: 'inventory_2', printer: 'print', fullscreen: 'fullscreen', reload: 'refresh', device_id: 'tablet_mac' };
    const tillKitDrawerSections = () => TILL_KIT_MORE.map(([title, rows]) => {
      /* Le libellé court du bouton livré (« Mouvement caisse », « Fin de
         service »), comme la boutique : ceux du kit passaient sur deux lignes. */
      const short = (el) => {
        const sp = el && el.querySelector('span:not(.count)'), lang = window.KiwiCaisseLang;
        const txt = ((sp || el || {}).textContent || '').replace(/\s+/g, ' ').trim();
        return txt && lang && lang.tr ? lang.tr(txt) : txt;
      };
      const items = rows.filter((r) => r[0] !== 'loyalty' && (!r[2] || tillKitLive(r[2]))).map(([id, key, sel]) => {
        const n = id === 'stock' ? parseInt(($('#stock-alert-count') || {}).textContent, 10) || 0 : 0;
        const own = sel && !/^(sales|fullscreen|device_id)$/.test(id) ? short(tillKitLive(sel)) : '';
        return { id: 'm:' + id, icon: TILL_KIT_MORE_ICON[id] || 'more_horiz', badge: n > 0 ? n : 0,
          label: own || (id === 'fullscreen' && document.fullscreenElement ? kkt('till.more.exit_fullscreen') : kkt(key)) };
      });
      return { label: kkt(title), items };
    }).filter((s) => s.items.length);
    function tillKitRail() {
      const kdsOpen = !!(typeof kdsEl !== 'undefined' && kdsEl && kdsEl.classList.contains('is-open'));
      const value = tillKitClientsOpen() ? 'clients' : kdsOpen ? 'kitchen' : mode === 'vrap' ? (typeof dlvCur === 'function' && dlvCur() ? 'delivery' : 'takeaway') : mode === 'waitlist' ? 'waiting' : 'floor';
      const newTickets = (typeof kdsOrders !== 'undefined' ? kdsOrders : []).filter((o) => o && o.status === 'new').length;
      /* §18.3 : le badge À emporter compte les commandes en ligne à accepter. */
      const toAccept = window.KiwiTillOnline ? window.KiwiTillOnline.pending() : 0;
      const tablesToAccept = window.KiwiTillOnline && window.KiwiTillOnline.floorPending ? window.KiwiTillOnline.floorPending() : 0;   /* commandes de tables : sur le plan */
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
        const it = { id, icon, label: kkt(key), badge: id === 'kitchen' ? newTickets : id === 'takeaway' ? toAccept : id === 'floor' ? tablesToAccept : 0 };
        if (id === 'takeaway' && toAccept) it.a11y = kkt('till.nav.takeaway_a11y', { n: toAccept });
        return it;
      });
      const dlvRail = typeof dlvRailItem === 'function' ? dlvRailItem() : null;
      if (dlvRail) items.splice(Math.max(0, items.findIndex((x) => x.id === 'takeaway') + 1), 0, dlvRail);
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
      /* Repaint only what changed. Every till repaint (the shift's 5 s save,
         each sync signal) rebuilt all its rows, so a row under a finger was
         replaced before the finger lifted and the tap never landed (owner,
         2026-11-10). The rail already skips an unchanged paint. */
      const nav = tillKitMoreNavEl();
      if (nav) {
        /* « Moins » n'est pas une destination : le panneau se ferme par le ×
           posé sur le voile, le voile lui-même ou Échap (owner, 2026-11-10). */
        const sections = [{ items: items.filter((it) => it.id !== 'more').map((it) => Object.assign({}, it)) }].concat(tillKitDrawerSections());
        const x = document.getElementById('kit-more-close');
        if (x && x.getAttribute('aria-label') !== kkt('action.close')) x.setAttribute('aria-label', kkt('action.close'));
        const sig = JSON.stringify(sections);
        if (sig !== nav.__kSig) { nav.__kSig = sig; nav.sections = sections; }
        if (nav.getAttribute('value') !== (value || '')) nav.setAttribute('value', value || '');
      }
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
      /* The panel is the shipped side menu. A row there opens its own dialog,
         so the panel and its scrim step aside instead of covering it; the row's
         shipped action runs untouched. */
      const side = on && document.querySelector('.sidebar');
      if (side && !side.dataset.kMoreCloses) {
        side.dataset.kMoreCloses = '1';
        side.addEventListener('click', (e) => {
          if (tillKitMoreOpen && e.target.closest && e.target.closest('button,[role=button],a,.menu-item')) tillKitSetMore(false);
        });
      }
      const root = document.documentElement;
      if (on) root.setAttribute('data-k-till-more', ''); else root.removeAttribute('data-k-till-more');
      window.KiwiTillFrame.paint({ rail: tillKitRail() });
      if (on) requestAnimationFrame(tillKitPlaceMoreClose);
    }
    let tillKitMoreCloseWatch = false;
    /* The × stands level with the logo, wherever the head sits on this
       screen (the bar's top padding is not the same on every till). */
    function tillKitPlaceMoreClose() {
      const x = document.getElementById('kit-more-close');
      const logo = document.querySelector('.sidebar > .brand-row .brand-mark');
      if (!x || !logo || !tillKitMoreOpen) return;
      /* The bar eases its padding as it opens (a shipped `transition: all`),
         so the head settles after the first frame: measure again at the end. */
      const side = logo.closest('.sidebar');
      if (side && !tillKitMoreCloseWatch) {
        tillKitMoreCloseWatch = true;
        side.addEventListener('transitionend', tillKitPlaceMoreClose);
        side.addEventListener('animationend', tillKitPlaceMoreClose);
      }
      const b = logo.getBoundingClientRect();
      if (b.height) x.style.top = Math.max(8, Math.round(b.top + b.height / 2 - x.offsetHeight / 2)) + 'px';
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
      /* The × floats on the veil, just past the panel's edge (owner,
         2026-11-10): inside the logo row it pushed « En service » off its
         place and sat on its own line height. Out here the panel keeps the
         boutique's head untouched. */
      const x = document.createElement('button');
      x.type = 'button';
      x.id = 'kit-more-close';
      x.setAttribute('aria-label', kkt('action.close'));
      x.innerHTML = window.KiwiKit.icon('close');
      x.addEventListener('click', () => tillKitSetMore(false));
      document.body.appendChild(x);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tillKitMoreOpen) tillKitSetMore(false); });
      window.addEventListener('resize', () => { if (tillKitMoreOpen && !tillKitPanelFits()) tillKitSetMore(false); else tillKitPlaceMoreClose(); });
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
    /* Stock, Menu and the till check are full-screen pages over the till.
       Choosing another place on the rail or in Plus leaves them, or they
       stayed painted over Salle while the rail said Salle (owner, 2026-11-09).
       Each page's own close button runs, so its sheet and state close too. */
    function closeSideScreens() {
      document.querySelectorAll('.kds-screen.is-open').forEach((s) => {
        if (s.id === 'kds-screen') return;
        const x = s.querySelector('#stock-close-btn, #menu-availability-close, #kd-close');
        if (x) x.click();
        s.classList.remove('is-open');
      });
    }
    function tillKitMore(id) {
      if (id === 'reload') { location.reload(); return; }
      if (id !== 'sync' && id !== 'fullscreen') closeSideScreens();
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
      if (id && id.indexOf('m:') === 0) { tillKitSetMore(false); tillKitMore(id.slice(2)); return; }
      tillKitSetMore(false);
      closeSideScreens();
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
      if (id === 'delivery' && typeof dlvOpen === 'function') { dlvOpen(); tillKitPaint(); return; }
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
    /* La pastille du caissier ouvre son menu, plus le panneau Plus
       (propriétaire, 2026-11-09) : qui tient la caisse, changer de caissier,
       mode nuit, langue, et la vraie sortie du compte, nommée et confirmée.
       « Changer de caissier » est le verrou de l'écran cuisine (lockoutKitchen,
       caisse-kitchen.js) : il oublie le caissier et rouvre le pavé, la boutique
       reste connectée, les tables restent. */
    let tillKitMePop = null, tillKitMeAsk = false;
    function tillKitMeWho() {
      const cc = (typeof currentCashier !== 'undefined' && currentCashier) || {};
      const lang = window.KiwiCaisseLang;
      const role = cc.role && lang && lang.tr ? lang.tr(cc.role) : (cc.role || '');
      return { name: cc.name || '', role };
    }
    const tillKitNight = () => document.documentElement.getAttribute('data-caisse-theme') === 'dark';
    function tillKitLockCashier() {
      tillKitSetMore(false);
      if (window.KiwiTillFrame.paying()) tillKitAct('pay.leave');
      lockoutKitchen();
      toast(window.KiwiCaisseLang.tr('Terminal verrouillé'));
    }
    function tillKitMePaint() {
      const pop = tillKitMePop, who = tillKitMeWho();
      const lang = window.KiwiCaisseLang;
      /* <k-popover> ne dessine son titre qu'une fois : le nom et la langue changent. */
      const heading = who.name || kkt('till.me.title');
      pop.setAttribute('heading', heading);
      const ti = pop.shadowRoot && pop.shadowRoot.querySelector('.ti');
      if (ti) ti.textContent = heading;
      pop.textContent = '';
      if (who.role) { const p = document.createElement('p'); p.className = 'k-foot k-ink2'; p.style.margin = '-4px 0 12px'; p.textContent = who.role; pop.appendChild(p); }
      if (tillKitMeAsk) {
        const p = document.createElement('p'); p.className = 'k-body'; p.style.margin = '0 0 12px'; p.textContent = kkt('till.me.logout_confirm'); pop.appendChild(p);
        [['logout-go', 'till.me.logout_go', 'danger'], ['logout-back', 'action.back', 'secondary']].forEach(([id, key, v]) => {
          const b = document.createElement('k-button');
          b.setAttribute('label', kkt(key)); b.setAttribute('variant', v); b.setAttribute('full', ''); b.setAttribute('data-me', id);
          if (id === 'logout-go') b.setAttribute('autofocus', '');
          b.style.display = 'block'; b.style.marginBlockEnd = '8px';
          pop.appendChild(b);
        });
        return;
      }
      const list = document.createElement('k-list');
      list.setAttribute('label', who.name || kkt('till.me.title'));
      const rows = [{ id: 'switch', icon: 'lock', title: kkt('till.me.switch') }];
      if (tillKitLive('#theme-toggle')) rows.push({ id: 'night', icon: 'dark_mode', title: kkt('till.me.night'), trailing: 'switch', checked: tillKitNight() });
      list.rows = rows;
      list.style.marginBlockEnd = '12px';
      pop.appendChild(list);
      if (lang && typeof lang.set === 'function') {
        const seg = document.createElement('k-segmented');
        seg.setAttribute('label', kkt('till.me.language'));
        seg.setAttribute('size', 'compact');
        seg.options = [{ value: 'fr', label: 'FR' }, { value: 'en', label: 'EN' }, { value: 'ar', label: 'ع' }];
        seg.setAttribute('value', lang.get());
        seg.setAttribute('data-me', 'lang');
        seg.style.marginBlockEnd = '16px';
        pop.appendChild(seg);
      }
      if (tillKitLive('.quick-actions a[href^="/auth/logout"]')) {
        const b = document.createElement('k-button');
        b.setAttribute('label', kkt('till.me.logout')); b.setAttribute('icon', 'logout');
        b.setAttribute('variant', 'tonal-danger'); b.setAttribute('full', ''); b.setAttribute('data-me', 'logout');
        b.style.display = 'flow-root';
        pop.appendChild(b);
      }
    }
    /* Un repeint du rail remplace la pastille : on reprend la neuve. */
    function tillKitMeAnchor(a) {
      if (a && a.isConnected) return a;
      const rail = document.querySelector('k-rail');
      return (rail && rail.shadowRoot && rail.shadowRoot.querySelector('[data-r="cashier"]')) || null;
    }
    function tillKitOpenMe(anchor) {
      if (!customElements.get('k-popover') || !customElements.get('k-list')) { tillKitToggleMore(); return; }
      if (!tillKitMePop) {
        tillKitMePop = document.createElement('k-popover');
        tillKitMePop.addEventListener('kiwi:action', (e) => {
          const d = e.detail || {};
          const host = e.composedPath().find((n) => n && n.getAttribute && n.hasAttribute('data-me'));
          const me = host ? host.getAttribute('data-me') : '';
          if (d.action === 'k.list.select' && d.id === 'switch') { e.stopPropagation(); tillKitMePop.removeAttribute('open'); tillKitLockCashier(); return; }
          if (d.action === 'k.list.toggle' && d.id === 'night') { e.stopPropagation(); const b = tillKitLive('#theme-toggle'); if (b && !!(d.value && d.value.checked) !== tillKitNight()) b.click(); return; }
          if (d.action === 'k.segmented.select' && me === 'lang') {
            e.stopPropagation();
            const v = d.value && d.value.value;
            if (v && window.KiwiCaisseLang) window.KiwiCaisseLang.set(v);
            /* Le rail se repeint dans la nouvelle langue : le menu se raccroche à la pastille neuve. */
            requestAnimationFrame(() => {
              window.KiwiTillFrame.paint({ rail: tillKitRail() });
              tillKitMePop.anchor = tillKitMeAnchor(tillKitMePop.anchor);
              tillKitMePaint(); tillKitMePop.place();
            });
            return;
          }
          if (d.action !== 'k.button.press') return;
          e.stopPropagation();
          if (me === 'logout' || me === 'logout-back') { tillKitMeAsk = me === 'logout'; tillKitMePaint(); tillKitMePop.place(); return; }
          if (me === 'logout-go') {
            tillKitMePop.removeAttribute('open');
            const a = tillKitLive('.quick-actions a[href^="/auth/logout"]');
            if (a) a.click();
          }
        });
        tillKitMePop.addEventListener('kiwi:action', (e) => { if ((e.detail || {}).action === 'k.popover.close') tillKitMeAsk = false; });
        document.body.appendChild(tillKitMePop);
      }
      if (tillKitMePop.hasAttribute('open')) { tillKitMePop.removeAttribute('open'); return; }
      if (tillKitMoreOpen) tillKitSetMore(false);
      /* Fermer Plus repeint le rail : la pastille d'origine n'est plus dans la page. */
      anchor = tillKitMeAnchor(anchor);
      tillKitMeAsk = false;
      tillKitMePaint();
      tillKitMePop.anchor = anchor || null;
      tillKitMePop.setAttribute('open', '');
    }
    function tillKitAct(verb, id, value) {
      switch (verb) {
        case 'rail.sync': tillKitOpenSync(value && value.anchor); return;
        case 'rail.select': tillKitRailSelect(id); return;
        case 'rail.cashier': tillKitOpenMe(value && value.anchor); return;
        case 'more.select': tillKitMore(id); return;
      }
      if (window.KiwiTillFrame.busy() && !/^(pay|split|discount)\./.test(verb)) return;
      switch (verb) {
        case 'pay.tip': tillKitTip(value.pct); return;
        case 'pay.confirm': tillKitConfirm(id, value); return;
        case 'pay.client': { const b = $('#rp-client'); if (b && !b.hidden) b.click(); return; }
        case 'pay.reward': { const b = $('#rp-reward'); if (b && !b.hidden) b.click(); tillKitPayRefresh(); return; }
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
        case 'split.save': tillKitSaveSplit(); return;
        case 'split.cancel': tillKitCancelSplit(); return;
        case 'discount.apply': tillKitApplyDiscount(value); return;
        case 'discount.leave': window.KiwiTillFrame.closePane('discount'); tillKitPaint(); return;
        case 'discount.remove': tillKitRemoveDiscount(); return;
      }
      const list = mode === 'vrap' ? cart : (selectedId ? (tableOrders[selectedId] || []) : []);
      const line = id ? list.find(l => String(l.uid) === id) : null;
      if (line && line.kind === 'formula-part') return;
      const click = (sel) => { const el = $(sel); if (el) el.click(); };
      switch (verb) {
        case 'add':
        case 'options':
          /* The same destination as a tap on the shipped grid (caisse-app.js,
             « Menu card body »): the open table's order, else the basket. Sending
             every tap to the basket left tables empty (owner, 2026-10-27). */
          if (mode === 'order') {
            if (selectedId) addToTableOrder(selectedId, id);
            else { toast(window.KiwiCaisseLang.tr('Aucune table sélectionnée')); backToSalle(); }
          } else addToCart(id);
          return;
        case 'step':
        case 'remove': {
          if (!line) return;
          const delta = verb === 'remove' ? (value.anchor ? -line.qty : -1) : (value.dir > 0 ? 1 : -1); if (delta > 0 && +line.offered > 0) { if (mode === 'vrap') addToCart(line.id); else if (mode === 'order' && selectedId) addToTableOrder(selectedId, line.id); } /* + sur un article offert : une unité payante, jamais un second cadeau sans accord */
          else if (mode === 'vrap') changeCartLineQty(line.uid, delta);
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
          /* The shipped « Envoyer en cuisine » runs sendToKitchen() in every
             mode (new table order, next course, takeaway): 2027 runs it too. */
          sendToKitchen();
          return;
        case 'pay':
          if (typeof dlvPay === 'function' && dlvPay()) return;
          tillKitOpenPay();
          return;
        case 'add-items': click('#rp-add-items'); return;
        case 'comment': counterCommentEdit(); return;   /* commentaire cuisine de la commande (counter-flow.js) */
        case 'client': { const b = $('#rp-client'); if (b && !b.hidden) b.click(); return; }
        case 'reward': { const b = $('#rp-reward'); if (b && !b.hidden) b.click(); return; }
        /* wallet-till.js owns the card: the scanner, and the card QR for the customer on the note. */
        case 'client-scan':
        case 'client-card': window.dispatchEvent(new CustomEvent('kiwi-card-act', { detail: { act: verb === 'client-scan' ? 'scan' : 'card' } })); return;
        case 'split': tillKitOpenSplit(); return;
        case 'discount': tillKitOpenDiscount(); return;
        case 'print': click('[data-action="print-bill"]'); return;
        case 'overflow': tillKitOpenOverflow(value && value.anchor); return;
        case 'offer': if (line) toggleLineOffer(line.uid); return;
        case 'edit-options': {
          /* Le bouton du kit n'avait pas de destination : rien ne s'ouvrait. La
             feuille revient sur les choix de la ligne, et Valider réécrit cette
             même ligne (prix, choix, repère de cuisine) sans en créer une autre. */
          if (!line || line.sent || !tillKitCanEditOptions(line)) return;
          const item = tillKitEditItem(line), groups = itemOptGroups(item);
          openOptSheet(item, groups, (_item, chosen) => {
            const priced = promoPrice(item, item.price + chosen.reduce((s, x) => s + (+x.p || 0), 0));
            currentOrder().patchLine(line, Object.assign({ opts: chosen, optSig: optSig(chosen), price: priced.price },
              priced.promo ? { promo: priced.promo } : null), priced.promo ? [] : ['promo']);
            if (mode === 'vrap') renderCart(); else if (selectedId) { renderMenu(); renderOrderPanel(selectedId); }
          }, line.opts);
          return;
        }
      }
    }
    function tillKitPaint() {
      if (!tillKitOn()) return;
      tillKitWatchClient();
      if (!tillKitWalletHooked) { tillKitWalletHooked = true; window.addEventListener('kiwi-wallet-state', () => { try { tillKitPaint(); } catch (_) {} }); }
      /* Le volet livré s'est fermé (autre table, autre mode) : l'encaissement
         en cours n'a plus d'addition sous lui. */
      if ($('#rp-active').hidden && !tenderInFlight) {
        window.KiwiTillFrame.closePay();
        window.KiwiTillFrame.closePane('discount');
        window.KiwiTillFrame.closePane('split');   /* the split is saved; Diviser or Encaisser reopens it */
      }
      /* Another table or order came on screen under a split pane: it was this bill's split, not that one's. */
      const sp = window.KiwiTillFrame.pane && window.KiwiTillFrame.pane('split');
      if (sp && !sp.hidden && !tenderInFlight && !tillKitShare && tillKitSplitKey && tillKitSplitKey !== tillKitBillKey()) {
        window.KiwiTillFrame.closePane('split');
        tillKitShareMap = null;
        if (!tillKitFlowHere()) cashAmountOverride = null;
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
    
