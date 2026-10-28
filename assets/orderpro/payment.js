/* OrderPro payment. Exports: sendServiceRequest, callServer, openBill, renderBill, closeBill, setTipPercent, confirmBill, openSplit, closeSplit, setSplitMode, setEgalCount, setArticleCount, setSplitPerson, toggleSplitItem, refreshSplitUI, personSubtotal, renderSplitArticle, confirmSplit, sendOrder, onSessionClosed, LIVE, onOrderStatus, applyOrderStatus, watchTableOrder, dropUnavailable, restartMenu, confirmCashierPayment, startPreparing, triggerReady, playChime, refreshPermBanner, askNotificationPermission.
 * Reads/writes only the declared live scope below; browser capabilities are checked by orderpro-boundary-test.
 * Classic lexical adapter intentionally preserves original function bodies, including assignments. */
KiwiOrderMenu.orderProParts.define('payment', ["$","$$","MENU","NET","ORDER_DONE","ORDER_STATE_KEY","PREP_STAGE","SESSION","TIP_LEVELS","activeMenuFilter","cart","closeCart","cur","currentOrderId","describeOptionChoices","describeOptionVisuals","describeOptions","escapeHtml","fmtAmount","gotoScreen","groupLabel","itemOf","lastStatus","lineKey","money","nameOf","openCustomizer","orderMode","orderNumber","pendingRef","rebuildSent","refreshCartUI","reloadMenu","renderMenu","renderMenuSubtabs","saveSent","sentLines","sentOrders","serviceRequestPending","sessionTotal","showToast","splitState","t","tableNumber","tipPercent","toCents","totals"], function (scope) {
  const draft = { create: KiwiOrderMenu.orderProParts.extension('draft', 'create') };
  with (scope) {
    async function sendServiceRequest(action) {
      if (serviceRequestPending || !SESSION.id || SESSION.closed) return false;
      serviceRequestPending = true;
      const res = await NET.serviceRequest(SESSION.id, action);
      serviceRequestPending = false;
      if (res && res.ok) return true;
      if (res && res.error === 'session-closed') SESSION.markClosed('settle');
      else showToast(res && res.error === 'network' ? t('order_offline') : t('order_failed'));
      return false;
    }

    async function callServer() {
      const pill = document.querySelector('[data-service="call-server"]');
      pill.classList.add('is-pulled');
      if (await sendServiceRequest('call-server')) {
        showToast(`${t('toast_server_coming_pre')} ${tableNumber}`);
      }
      setTimeout(() => pill.classList.remove('is-pulled'), 4000);
    }

    function openBill() {
      renderBill();
      setTipPercent(0);

      $('#bill-sheet').classList.add('is-open');
      $('#bill-sheet').setAttribute('aria-hidden', 'false');
    }

    function renderBill() {
      $('#bill-table').textContent = tableNumber;
      const ordersEl = $('#bill-orders');
      if (ordersEl) {
        ordersEl.innerHTML = sentOrders.map(o => `
          <li class="bill-order${o.status === 'rejected' ? ' is-refused' : ''}">
            <span>${escapeHtml(t('bill_order_label'))} ${escapeHtml(o.number || '')}</span>
            <span>${escapeHtml(t(ORDER_STATE_KEY[o.status] || 'prep_accepted'))}</span>
          </li>`).join('');
        ordersEl.hidden = !sentOrders.length;
      }

      // Aggregate sent lines by lineKey
      const agg = new Map();
      for (const l of sentLines) {
        // Same dish at two prices (a promotion that ended) stays two rows.
        const key = lineKey(l.id, l.options, l.note) + '|' + toCents(l.unitPrice);
        if (agg.has(key)) agg.get(key).qty += l.qty;
        else agg.set(key, { ...l });
      }
      const billItems = [...agg.values()];

      const itemsEl = $('#bill-items');
      if (billItems.length === 0) {
        itemsEl.innerHTML = `<li class="bill-empty">${t('bill_empty')}</li>`;
      } else {
        itemsEl.innerHTML = billItems.map(l => {
          const opts = describeOptions(l);
          return `
            <li class="bill-row">
              <div class="bill-row-info">
                <div class="bill-row-name">${l.qty}× ${escapeHtml(nameOf(l.id))}</div>
                ${opts ? `<div class="bill-row-opts">${escapeHtml(opts)}</div>` : ''}
              </div>
              <div class="bill-row-price">${money(l.qty * l.unitPrice)}</div>
            </li>
          `;
        }).join('');
      }

      // Update bill subtitle (e.g. "Table 7")
      const subtitleEl = $('#bill-subtitle');
      if (subtitleEl) subtitleEl.innerHTML = `${t('badge_table')} <span id="bill-table">${tableNumber}</span>`;

      $('#bill-subtotal-value').textContent = `${money(sessionTotal)}`;
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.decorateBill();
    }

    function closeBill() {
      $('#bill-sheet').classList.remove('is-open');
      $('#bill-sheet').setAttribute('aria-hidden', 'true');
    }

    function setTipPercent(pct) {
      tipPercent = pct;
      const tipAmt = Math.round(sessionTotal * pct / 100);
      const total = sessionTotal + tipAmt;

      const tipAmtEl = $('#tip-amount');
      tipAmtEl.textContent = `+${money(pct === 0 ? 0 : tipAmt)}`;
      tipAmtEl.classList.toggle('is-zero', pct === 0);

      // Jar fill — 20% tip fills jar to top, 25%+ overflows
      const fillPct = Math.min(100, pct * 5);
      const offset = 86 * (1 - fillPct / 100);
      const fill = $('#tip-jar-fill');
      const shimmer = $('#tip-jar-shimmer');
      if (fill) fill.style.transform = `translateY(${offset}px)`;
      if (shimmer) shimmer.style.transform = `translateY(${offset}px)`;

      // Level label
      const level = TIP_LEVELS.find(l => pct >= l.min && pct <= l.max) || TIP_LEVELS[0];
      const lbl = $('#tip-level');
      lbl.textContent = t(level.key);
      lbl.classList.toggle('is-empty', !!level.empty);
      lbl.classList.toggle('is-celebrated', !!level.celebrated);

      // Sparkles + shimmer
      const wrap = $('#tip-jar-wrap');
      wrap.classList.toggle('is-overflow', pct >= 20);
      wrap.classList.toggle('is-fancy', pct >= 13);

      // Chip active state
      $$('.tip-chip').forEach(c => {
        c.classList.toggle('is-active', parseInt(c.dataset.tip, 10) === pct);
      });

      // Total
      $('#bill-total-value').textContent = `${money(total)}`;
    }

    async function confirmBill() {
      if (!await sendServiceRequest('ask-bill')) return;
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.billAsked();
      closeBill();
      // This requests the whole table's bill, not this phone's subtotal or an
      // unsaved tip. A successful write is not a promise that staff has arrived.
      showToast(`${t('toast_bill_asked_pre')} ${tableNumber}`);
    }

    function openSplit() {
      if (sessionTotal === 0) return; // nothing to split
      // Reset assignments when opening fresh
      splitState.assignments = {};
      splitState.selectedPerson = 0;
      refreshSplitUI();
      setSplitMode(splitState.mode);
      $('#split-sheet').classList.add('is-open');
      $('#split-sheet').setAttribute('aria-hidden', 'false');
    }

    function closeSplit() {
      $('#split-sheet').classList.remove('is-open');
      $('#split-sheet').setAttribute('aria-hidden', 'true');
    }

    function setSplitMode(mode) {
      splitState.mode = mode;
      $$('.split-mode-tab').forEach(tab =>
        tab.classList.toggle('is-active', tab.dataset.splitMode === mode));
      $('#split-egal').hidden = mode !== 'egal';
      $('#split-article').hidden = mode !== 'article';
      refreshSplitUI();
    }

    function setEgalCount(count) {
      splitState.egalCount = count;
      $$('[data-egal-count]').forEach(c =>
        c.classList.toggle('is-active', parseInt(c.dataset.egalCount, 10) === count));
      refreshSplitUI();
    }

    function setArticleCount(count) {
      splitState.articleCount = count;
      if (splitState.selectedPerson >= count) splitState.selectedPerson = 0;
      // Drop any assignment that points to a now-out-of-range person
      Object.keys(splitState.assignments).forEach(k => {
        if (splitState.assignments[k] >= count) delete splitState.assignments[k];
      });
      $$('[data-article-count]').forEach(c =>
        c.classList.toggle('is-active', parseInt(c.dataset.articleCount, 10) === count));
      refreshSplitUI();
    }

    function setSplitPerson(idx) {
      splitState.selectedPerson = idx;
      renderSplitArticle();
    }

    function toggleSplitItem(lineIdx) {
      const cur = splitState.assignments[lineIdx];
      if (cur === splitState.selectedPerson) delete splitState.assignments[lineIdx];
      else splitState.assignments[lineIdx] = splitState.selectedPerson;
      renderSplitArticle();
    }

    function refreshSplitUI() {
      const subtotal = sessionTotal;
      const tipAmt = Math.round(sessionTotal * tipPercent / 100);
      const grand = subtotal + tipAmt;
      // Subtitle
      const subtitleEl = $('#split-subtitle');
      if (subtitleEl) {
        subtitleEl.textContent = t('split_subtitle_tpl')
          .replace('{n}', tableNumber || '—')
          .replace('{total}', fmtAmount(grand))
          .replace('{cur}', cur());
      }
      if (splitState.mode === 'egal') {
        $('#split-egal-subtotal').textContent = `${money(subtotal)}`;
        $('#split-egal-tip').textContent = `${money(tipAmt)}`;
        const per = Math.ceil(toCents(grand) / splitState.egalCount) / 100;
        $('#split-egal-per').textContent = `${money(per)}`;
      } else {
        renderSplitArticle();
      }
    }

    function personSubtotal(personIdx) {
      let sum = 0;
      sentLines.forEach((line, idx) => {
        if (splitState.assignments[idx] === personIdx) {
          sum += line.qty * line.unitPrice;
        }
      });
      return sum;
    }

    function renderSplitArticle() {
      const tabsEl = $('#split-people-tabs');
      const poolEl = $('#split-items-pool');
      if (!tabsEl || !poolEl) return;

      const people = Array.from({ length: splitState.articleCount }, (_, i) => i);
      tabsEl.innerHTML = people.map(i => {
        const total = personSubtotal(i);
        const isActive = splitState.selectedPerson === i;
        return `
          <button class="split-person-tab ${isActive ? 'is-active' : ''}" type="button" data-split-person="${i}">
            <span class="name">${t('split_person_pre')} ${i + 1}</span>
            <span class="val">${money(total)}</span>
          </button>
        `;
      }).join('');

      poolEl.innerHTML = sentLines.map((line, idx) => {
        const owner = splitState.assignments[idx];
        const isMine = owner === splitState.selectedPerson;
        const isOther = owner != null && owner !== splitState.selectedPerson;
        const ownerLabel = isOther ? `${t('split_person_pre')} ${owner + 1}` : '';
        return `
          <div class="split-pool-item ${isMine ? 'is-mine' : ''} ${isOther ? 'is-other' : ''}"
               data-split-item="${idx}" ${isOther ? `data-owner="${escapeHtml(ownerLabel)}"` : ''}>
            <span class="info">
              <span class="qty">${line.qty}×</span>
              <span class="name">${escapeHtml(nameOf(line.id))}</span>
            </span>
            <span class="price">${money(line.qty * line.unitPrice)}</span>
          </div>
        `;
      }).join('');
    }

    function confirmSplit() {
      const subtotal = sessionTotal;
      const tipAmt = Math.round(sessionTotal * tipPercent / 100);
      const grand = subtotal + tipAmt;
      let msg;
      if (splitState.mode === 'egal') {
        const per = Math.ceil(toCents(grand) / splitState.egalCount) / 100;
        msg = `${t('toast_split_egal')} ${splitState.egalCount} × ${money(per)}`;
      } else {
        const totals = [];
        for (let i = 0; i < splitState.articleCount; i++) {
          const sub = personSubtotal(i);
          // Distribute tip proportionally per person
          const tipShare = subtotal > 0 ? Math.round(tipAmt * (sub / subtotal)) : 0;
          totals.push(sub + tipShare);
        }
        msg = `${t('toast_split_egal')} ${totals.map(x => fmtAmount(x)).join(' · ')} ${cur()}`;
      }
      closeSplit();
      closeBill();
      showToast(msg);
    }

    async function sendOrder() {
      if (!cart.size) return;
      if (globalThis.KiwiOrderMenu && KiwiOrderMenu.blocked()) {
        showToast(t(KiwiOrderMenu.ordering() ? 'closed_why' : 'ordering_off_note'));
        return;
      }
      const btn = $('#send-btn');
      if (btn.classList.contains('is-loading')) return;
      if (SESSION.closed) { gotoScreen('screen-thanks'); return; }
      const label = $('#send-label');
      const prevLabel = label ? label.textContent : '';
      const loadingOwner = { scope: SESSION.sendScope() };
      btn.orderProLoadingOwner = loadingOwner;
      const releaseLoading = (restoreLabel = true) => {
        if (btn.orderProLoadingOwner !== loadingOwner) return;
        btn.classList.remove('is-loading');
        if (label && restoreLabel) label.textContent = prevLabel;
        delete btn.orderProLoadingOwner;
      };
      btn.classList.add('is-loading');
      if (label) label.textContent = t('order_sending');

      const summary = [...cart.entries()]
        .map(([, line]) => `${line.qty}× ${nameOf(line.id)}`)
        .join(' · ');
      const totalNow = totals().total;
      // Snapshot current cart into sentLines (for à-table bill aggregation)
      const linesCopy = [...cart.values()].map(l => ({ ...l, options: { ...l.options } }));

      // Resolve the visit BEFORE choosing its retry identity.
      if ((!SESSION.id || SESSION.mode !== orderMode || String(SESSION.table || '') !== String(orderMode === 'table' ? tableNumber : ''))
          && !(await SESSION.open(orderMode, orderMode === 'table' ? tableNumber : ''))) {
        releaseLoading();
        return;
      }
      loadingOwner.scope = SESSION.sendScope();

      /* On n'envoie plus ni les noms ni les prix : rien que des identifiants et
         des quantités. Le serveur ouvre la carte publiée par le commerçant, y
         lit le prix et recalcule le total. Avant, une requête modifiée créait
         une commande à 1 MAD pour un plat à 250 et le ticket cuisine sortait
         avec le faux prix. */
      const makeLinesPayload = ref => draft.create({ ...scope, linesCopy }).makeLinesPayload(ref);

      // Hash the exact payload with neutral formula IDs, then restore its ref
      // before deriving the real formulaUid/lineId values. No basket is stored.
      const neutralPayload = makeLinesPayload('');
      const attempt = await SESSION.prepareSend(neutralPayload);
      if (SESSION.closed || attempt.scope !== SESSION.sendScope()) {
        SESSION.clearPendingSend(attempt);
        pendingRef = '';
        releaseLoading();
        return;
      }
      pendingRef = attempt.ref;
      const linesPayload = neutralPayload.map(line => !line.formulaUid ? line : {
        ...line, formulaUid: (pendingRef + line.formulaUid).slice(0, 40),
        ...(line.lineId ? { lineId: (pendingRef + line.lineId).slice(0, 60) } : {}),
      });

      let res = await NET.placeOrder({
        mode: orderMode,                       // 'table' | 'takeout'
        table: orderMode === 'table' ? tableNumber : '',
        session: SESSION.id || '',
        ref: pendingRef,
        lines: linesPayload,
        ...(globalThis.KiwiGuest ? globalThis.KiwiGuest.orderExtras() : {}),
      });

      const currentVisit = !SESSION.closed && attempt.scope === SESSION.sendScope();
      releaseLoading(currentVisit);
      // A response can outlive payment and an explicit reorder. Retire an
      // acknowledged old attempt, but never apply it to the new visit's UI.
      if (!currentVisit) {
        if (res && res.ok) SESSION.clearPendingSend(attempt);
        if (pendingRef === attempt.ref) pendingRef = '';
        return;
      }

      if (!res || !res.ok) {
        const err = res && res.error;
        /* La session a été fermée pendant qu'on commandait : l'addition vient
           d'être réglée. Le dire franchement vaut mieux qu'un « échec » qui
           inviterait à réessayer indéfiniment. */
        if (err === 'session-closed') {
          SESSION.markClosed('settle');
          return;
        }
        if (err === 'service-closed') { showToast(t('order_closed')); return; }
        /* « Servir au ftour » arrivé trop tard : on décoche, on le dit, le
           client renvoie la même commande pour tout de suite. */
        if (err === 'ftour-unavailable') {
          SESSION.clearPendingSend(attempt);
          pendingRef = '';
          if (globalThis.KiwiGuest) globalThis.KiwiGuest.ftourRefused();
          return;
        }
        /* La file est pleine : renvoyer échouerait pareil. On le dit, et on
           envoie le client vers l'équipe. */
        if (err === 'queue-full' || err === 'table-queue-full') {
          SESSION.clearPendingSend(attempt);
          pendingRef = '';
          showToast(t('order_busy'));
          return;
        }
        /* La carte a bougé sous les doigts du client — un plat épuisé, un plat
           retiré. On le dit avec le nom, et on retire la ligne : réessayer à
           l'identique échouerait exactement pareil. */
        if (err === 'menu-changed') {
          SESSION.clearPendingSend(attempt);
          pendingRef = '';
          const invalidOpts = Array.isArray(res.invalidOptions) ? res.invalidOptions.filter(Boolean) : [];
          const gone = [].concat(res.unavailable || [], res.unknown || []).filter(Boolean);

          if (invalidOpts.length) {
            const targetNames = invalidOpts.join(', ');
            showToast(t('order_options_changed').replace('{n}', targetNames || t('order_item_fallback')));
            let reopened = false;
            for (const [key, line] of [...cart.entries()]) {
              const m = itemOf(line.id);
              const match = invalidOpts.includes(line.id) || (m && invalidOpts.includes(m.name));
              if (match && m) {
                openCustomizer(m, line.qty, key);
                reopened = true;
                break;
              }
            }
            if (!reopened) {
              refreshCartUI();
              reloadMenu();
            }
            return;
          }

          if (gone.length) {
            const targetGone = gone.join(', ');
            showToast(t('order_gone').replace('{n}', targetGone || t('order_item_fallback')));
            dropUnavailable(res.unknown || [], res.unavailable || []);
            return;
          }

          showToast(t('order_menu_updated'));
          reloadMenu();
          return;
        }
        showToast(err === 'network' && !attempt.durable ? t('order_retry_local')
          : err === 'network' ? t('order_unconfirmed') : t('order_failed'));
        return;                                // cart intact — they can retry
      }

      SESSION.clearPendingSend(attempt);
      pendingRef = '';
      currentOrderId = String(res.id || '');
      lastStatus = '';
      /* Le total qui compte est celui que le SERVEUR a calculé. S'il diffère de
         ce que le téléphone affichait (un prix changé au bureau il y a dix
         secondes), c'est le sien qui est vrai, et le client doit voir celui-là
         sur son écran de confirmation. */
      const serverTotal = Number(res.total);
      const shownTotal = isFinite(serverTotal) && serverTotal > 0 ? serverTotal : totalNow;
      closeCart();
      if (orderMode === 'takeout') {
        orderNumber = 'OPD-' + String(res.number || '');
        $('#cashier-number-digits').textContent = orderNumber;
        $('#prep-number').textContent = orderNumber;
        $('#ready-number').textContent = orderNumber;
        $('#cashier-items').textContent = summary || '·';
        $('#cashier-total').textContent = `${money(shownTotal)}`;
        gotoScreen('screen-cashier');
      } else {
        // Table mode — one record per order, priced by the server
        const serverLines = Array.isArray(res.lines)
          ? res.lines.filter(l => l && l.kind !== 'formula-part') : [];
        const sameShape = serverLines.length === linesCopy.length
          && serverLines.every((l, i) => String(l.id) === String(linesCopy[i].id));
        const lines = linesCopy.map((l, i) => ({
          id: l.id, options: l.options, note: l.note || '', qty: l.qty,
          unitPrice: sameShape && isFinite(Number(serverLines[i].unitPrice))
            ? Number(serverLines[i].unitPrice) : l.unitPrice,
        }));
        if (!sentOrders.some(o => o.id === currentOrderId)) {   // a replayed send is the same order
          sentOrders.push({ id: currentOrderId, number: String(res.number || ''), status: 'pending',
                            total: shownTotal, lines });
        }
        rebuildSent();
        saveSent();
        $('#success-table').textContent = tableNumber;
        $('#success-items').textContent = summary || '·';
        gotoScreen('screen-success');
        watchTableOrder();
        if (globalThis.KiwiGuest) globalThis.KiwiGuest.onSent(lines, res);
      }
      cart.clear();
      refreshCartUI();
    }

    function onSessionClosed() {
      LIVE.stop();
      const sendButton = $('#send-btn');
      if (sendButton && sendButton.orderProLoadingOwner?.scope === SESSION.sendScope()) {
        sendButton.classList.remove('is-loading');
        delete sendButton.orderProLoadingOwner;
      }
      pendingRef = '';
      cart.clear();
      refreshCartUI();
      const sub = $('#thanks-sub');
      if (sub) {
        sub.textContent = SESSION.closedBy === 'expiry' ? t('thanks_expired') : t('thanks_sub');
      }
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.onClosed();
      gotoScreen('screen-thanks');
    }

    const LIVE = (() => {
      const FAST = 4000;      // une commande est en jeu
      const SLOW = 15000;     // simplement assis, la carte ouverte
      let timer = null, running = false;

      const busy = () => (!!currentOrderId && !ORDER_DONE.has(lastStatus))
        || sentOrders.some(o => !ORDER_DONE.has(o.status));

      async function tick() {
        if (!running || document.hidden) return;

        if (SESSION.id && !SESSION.closed) {
          const s = await NET.sessionStatus(SESSION.id);
          // Injoignable ⇒ on ne conclut RIEN. Déclarer la session fermée sur un
          // réseau qui tousse mettrait le client dehors au milieu du repas.
          if (s && s.ok && s.status !== 'open') {
            // Settlement ends the shared visit for EVERY phone, including
            // phones with a draft. Only the explicit reorder action may reseat.
            SESSION.markClosed(s.closedBy);
            return;
          }
        }

        /* Toutes les commandes encore en jeu, pas seulement la dernière : un
           refus de la première doit arriver même après une deuxième commande. */
        const watched = new Set(sentOrders.filter(o => !ORDER_DONE.has(o.status)).map(o => o.id));
        if (currentOrderId) watched.add(currentOrderId);
        for (const id of watched) {
          const r = await NET.orderStatus(id);
          if (r && r.ok) onOrderStatus(id, String(r.status || 'pending'));
        }
        schedule();
      }

      function schedule() {
        clearTimeout(timer);
        if (!running || document.hidden) return;
        timer = setTimeout(tick, busy() ? FAST : SLOW);
      }
      function start() { running = true; clearTimeout(timer); tick(); }
      function stop() { running = false; clearTimeout(timer); }
      function kick() { if (running) { clearTimeout(timer); tick(); } }

      document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
      window.addEventListener('online', kick);
      window.addEventListener('pageshow', kick);

      return { start, stop, kick };
    })();

    function onOrderStatus(id, status) {
      const o = sentOrders.find(x => x.id === id);
      if (o && o.status !== status) {
        o.status = status;
        rebuildSent();
        saveSent();
        if ($('#bill-sheet').classList.contains('is-open')) { renderBill(); setTipPercent(tipPercent); }
        /* La commande à l'écran a son propre message (applyOrderStatus) ; une
           commande précédente refusée doit être dite, avec son numéro. */
        if (status === 'rejected' && id !== currentOrderId) {
          showToast(t('order_refused_n').replace('{n}', o.number || '?'));
        }
      }
      if (id === currentOrderId) applyOrderStatus(status);
    }

    function applyOrderStatus(status) {
      if (status === lastStatus) return;
      lastStatus = status;

      // Salle — l'écran « c'est parti »
      const em = $('.success-eta em');
      if (em) {
        em.removeAttribute('data-i18n');
        em.textContent = status === 'pending' ? t('prep_waiting')
                       : status === 'ready' ? t('prep_ready')
                       : status === 'served' ? t('order_served')
                       : status === 'rejected' ? t('order_refused')
                       : t('prep_accepted');
      }
      /* « Envoyée en cuisine » n'est vrai qu'une fois la caisse d'accord :
         avant, la commande attend au comptoir. */
      const titleEm = $('.success-title em');
      if (titleEm) {
        titleEm.removeAttribute('data-i18n');
        titleEm.textContent = status === 'pending' || status === 'rejected'
          ? t('success_title_em') : t('success_title_em_kitchen');
      }

      // Comptoir — la barre de préparation
      const bar = $('#prep-bar-fill');
      const eta = $('#prep-eta');
      if (bar) bar.style.width = (PREP_STAGE[status] || PREP_STAGE.pending) + '%';
      if (eta) {
        eta.textContent = status === 'ready' ? t('prep_now')
                        : status === 'accepted' ? t('prep_accepted')
                        : t('prep_waiting');
      }

      if (status === 'rejected') { showToast(t('order_refused')); currentOrderId = ''; return; }
      if (status === 'archived' && orderMode === 'takeout') {
        showToast(t('order_archived'));
        currentOrderId = '';
        SESSION.markClosed('archived');
        return;
      }

      /* À emporter : c'est L'ENCAISSEMENT au comptoir qui fait avancer l'écran,
         pas un bouton que le client devrait penser à taper. Il annonce son
         numéro, il paie, et son téléphone passe tout seul en préparation —
         personne ne surveille un écran en attendant qu'on lui dise de cliquer.
         (Le bouton reste, comme repli, si le client a déjà avancé lui-même.) */
      if (status === 'accepted' && orderMode === 'takeout'
          && $('#screen-cashier').classList.contains('is-active')) {
        /* On ne rappelle PAS startPreparing() ici : cette fonction relance la
           boucle, et nous sommes précisément à l'intérieur d'un de ses tours —
           elle se rappellerait elle-même. L'écran suffit ; la barre a déjà été
           positionnée quelques lignes plus haut. */
        const etaLabel = $('[data-i18n="prep_ready_in"]');
        if (etaLabel) etaLabel.textContent = '';
        gotoScreen('screen-preparing');
        refreshPermBanner();
        return;
      }
      if (status === 'ready' && orderMode === 'takeout') triggerReady();
      /* Remise en main propre : pour un retrait au comptoir c'est le point
         final — il n'y a pas d'addition à encaisser plus tard qui viendrait
         fermer la session à sa place. */
      if (status === 'served' && orderMode === 'takeout') SESSION.markClosed('served');
    }

    function watchTableOrder() {
      const em = $('.success-eta em');
      if (em) { em.removeAttribute('data-i18n'); em.textContent = t('prep_waiting'); }
      const titleEm = $('.success-title em');
      if (titleEm) { titleEm.removeAttribute('data-i18n'); titleEm.textContent = t('success_title_em'); }
      lastStatus = '';
      LIVE.start();
      LIVE.kick();
    }

    function dropUnavailable(ids, names) {
      const byId = new Set((ids || []).map(String));
      const byName = new Set((names || []).map(n => String(n).toLowerCase()));
      let hit = false;
      for (const m of MENU) {
        const gone = byId.has(m.id) || byName.has(String(m.name || '').toLowerCase());
        if (gone) { m.avail = false; hit = true; }
      }
      for (const [key, line] of [...cart.entries()]) {
        const m = itemOf(line.id);
        if (m && m.avail === false) { cart.delete(key); hit = true; }
      }
      if (!hit) return;
      refreshCartUI();
      renderMenu(activeMenuFilter());
    }

    function restartMenu() {
      cart.clear();
      refreshCartUI();
      $$('.menu-tab').forEach(t => { t.classList.toggle('is-active', t.dataset.tab === 'all'); t.setAttribute('aria-selected', String(t.dataset.tab === 'all')); });
      renderMenuSubtabs('all');
      renderMenu('all');
      gotoScreen('screen-menu');
    }

    function confirmCashierPayment() {
      gotoScreen('screen-preparing');
      refreshPermBanner();
      startPreparing();
    }

    function startPreparing() {
      const bar = $('#prep-bar-fill');
      const eta = $('#prep-eta');
      const etaLabel = $('[data-i18n="prep_ready_in"]');
      if (etaLabel) etaLabel.textContent = '';
      if (bar) bar.style.width = PREP_STAGE.pending + '%';
      if (eta) eta.textContent = t('prep_waiting');
      /* Le suivi lui-même est tenu par LIVE : une seule boucle pour la commande
         ET la session, qui se met en veille avec l'écran et repart au réveil.
         Deux minuteries séparées finissaient par se contredire — l'une arrêtée,
         l'autre non — et c'est la commande à emporter qui restait figée. */
      lastStatus = '';
      LIVE.start();
      LIVE.kick();
    }

    function triggerReady() {
      gotoScreen('screen-ready');
      // Audio chime — works on every modern browser.
      playChime();
      // System notification — only fires if the user previously granted permission.
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(t('notif_ready_title'), {
            body: `${t('notif_ready_body_pre')}${orderNumber} ${t('notif_ready_body_post')}`,
            tag: 'order-ready',
          });
        } catch (_) { /* iOS Safari throws unless installed as PWA */ }
      }
    }

    function playChime() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const tone = (freq, startSec, durSec, peak) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const t0 = ctx.currentTime + startSec;
          gain.gain.setValueAtTime(0, t0);
          gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0008, t0 + durSec);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + durSec + 0.05);
        };
        tone(740, 0.00, 0.45, 0.35); // F#5
        tone(988, 0.18, 0.55, 0.35); // B5
      } catch (_) { /* audio unavailable */ }
    }

    function refreshPermBanner() {
      const banner = $('#prep-perm');
      const body = $('#prep-perm-body');
      const btn = $('#prep-perm-btn');
      if (!banner || !('Notification' in window)) {
        if (banner) {
          banner.classList.add('is-denied');
          body.textContent = t('prep_perm_unsupported');
          btn.style.display = 'none';
        }
        return;
      }
      const p = Notification.permission;
      banner.classList.remove('is-granted', 'is-denied');
      if (p === 'granted') {
        banner.classList.add('is-granted');
        body.innerHTML = t('prep_perm_granted_html');
        btn.style.display = 'none';
      } else if (p === 'denied') {
        banner.classList.add('is-denied');
        body.textContent = t('prep_perm_denied');
        btn.style.display = 'none';
      } else {
        body.textContent = t('prep_perm_default');
        btn.style.display = '';
        btn.textContent = t('prep_perm_btn');
      }
    }

    async function askNotificationPermission() {
      if (!('Notification' in window)) return;
      try {
        const result = await Notification.requestPermission();
        // Some browsers don't return a value from the promise; re-read the global.
        if (result === 'granted' || Notification.permission === 'granted') {
          // Show a tiny confirmation chime so the user knows it works
          playChime();
        }
      } catch (_) {}
      refreshPermBanner();
    }


    return Object.freeze({ sendServiceRequest, callServer, openBill, renderBill, closeBill, setTipPercent, confirmBill, openSplit, closeSplit, setSplitMode, setEgalCount, setArticleCount, setSplitPerson, toggleSplitItem, refreshSplitUI, personSubtotal, renderSplitArticle, confirmSplit, sendOrder, onSessionClosed, LIVE, onOrderStatus, applyOrderStatus, watchTableOrder, dropUnavailable, restartMenu, confirmCashierPayment, startPreparing, triggerReady, playChime, refreshPermBanner, askNotificationPermission });
  }
});
