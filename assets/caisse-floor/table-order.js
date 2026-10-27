
    /* ---- table order management ---- */
    function pushTableOrderLine(tableId, item, opts) {
      nativeHapticLight();
      if (!tableOrders[tableId]) currentOrder().replaceTable(tableId, []);
      // First item taken → order started, table is now being served (eating)
      if (tables[tableId] && tables[tableId].status === 'a-commander') {
        tableSettlement().project(tables[tableId], { status: 'ka-yaklo' });
        refreshTableNode(tableId);
      }
      const sig = optSig(opts);
      const extra = (opts || []).reduce((s, x) => s + (+x.p || 0), 0);
      /* Stack onto the un-noted line ; a noted line splits off so it keeps its
         note. Et JAMAIS sur une ligne déjà partie en cuisine (`l.sent`) : la
         cuisine n'envoie que ce qui ne l'est pas encore, donc empiler un
         deuxième café sur la ligne du premier aurait fait monter l'addition
         sans qu'aucun bon ne parte. Le plat aurait été facturé et jamais
         préparé · la panne la plus coûteuse qu'un ajout puisse produire.
         Deux choix différents restent également deux lignes : salade + harissa
         ne doit jamais se confondre avec sans salade + sauce blanche. */
      const priced = promoPrice(item, item.price + extra);
      const line = tableOrders[tableId].find(l => l.id === item.id && !l.sent
        && !l.hold && !l.committed
        && !(l.note || '').trim() && (l.optSig || '') === sig && promoKey(l.promo) === promoKey(priced.promo));
      if (line) currentOrder().patchLine(line, { qty: +line.qty + 1 });
      else currentOrder().append(tableOrders[tableId], Object.assign({ uid: newLineUid(), id: item.id, name: item.name,
        price: priced.price, qty: 1, note: '', opts: (opts || []).slice(), optSig: sig },
        priced.promo ? { promo: priced.promo } : null));
      startTableTimer(tableId);
      // Pop animation on card
      const card = document.querySelector(`.menu-item[data-menu-id="${item.id}"]`);
      if (card) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
      renderMenu();
      renderOrderPanel(tableId);
    }

    function addToTableOrder(tableId, itemId) {
      const item = standaloneMenuItem(itemId);
      if (!item) return;
      const groups = itemOptGroups(item);
      if (item.formula && Array.isArray(item.formula.slots) && item.formula.slots.length) {
        openCaisseFormula(item, (parent, parts) => { currentOrder().append((currentOrder().replaceTable(tableId, tableOrders[tableId] || [])), parent, ...parts); startTableTimer(tableId); nativeHapticLight(); renderMenu(); renderOrderPanel(tableId); });
        return;
      }
      if (groups.length) {
        openOptSheet(item, groups, (_item, chosen) => pushTableOrderLine(tableId, item, chosen));
        return;
      }
      pushTableOrderLine(tableId, item, []);
    }

    /* Order panel +/- · targets one specific line by its uid. */
    function changeTableOrderLineQty(tableId, uid, delta) {
      if (!tableOrders[tableId]) return;
      const line = tableOrders[tableId].find(l => l.uid === uid);
      if (!line) return;
      /* Déjà transmis : le − retire immédiatement une unité et prévient la cuisine. */
      if (line.sent) {
        if (delta < 0) cancelCaisseLineImmediately(tableId, line);
        return;
      }
      currentOrder().replaceTable(tableId, applyGroupedLineQtyDelta(tableOrders[tableId], line, delta));
      renderMenu();
      renderOrderPanel(tableId);
    }

    /* Menu-card − in order mode · removes one unit (plain line, else the last).
       On ne retire que parmi les lignes ENCORE RETIRABLES : le − de la carte
       s'appliquait à la première ligne trouvée, donc sur une mesa rouverte il
       tombait sur le plat déjà en cuisine et refusait, alors que le serveur
       venait juste d'en ajouter un qu'il pouvait parfaitement reprendre. */
    function tableOrderMinusMenu(tableId, itemId) {
      const lines = (tableOrders[tableId] || []).filter(l => l.id === itemId && !l.sent);
      const line = lines.find(l => !(l.note || '').trim()) || lines[lines.length - 1];
      if (line) { changeTableOrderLineQty(tableId, line.uid, -1); return; }
      if ((tableOrders[tableId] || []).some(l => l.id === itemId)) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Déjà en cuisine · ça s\'annule à la cuisine'));
      }
    }

    /* ---- order panel (right panel while building an order) ---- */
    function renderOrderPanel(tableId) {
      if (!tableId) return;
      if (document.documentElement.classList.contains('kiwi-native')) { try { persistShift(); } catch (_) {} }
      const t = tables[tableId];
      const order = tableOrders[tableId] || [];
      const total = order.reduce((s, l) => s + l.price * l.qty, 0);
      const itemCount = order.reduce((s, l) => s + l.qty, 0);

      $('#rp-empty').hidden = true;
      $('#rp-empty').style.display = 'none';
      const active = $('#rp-active');
      active.hidden = false;
      active.style.display = 'flex';

      // Show server row in order mode too
      const sr = $('#rp-server-row');
      if (sr && t.server && servers[t.server]) {
        const s = servers[t.server];
        $('#rp-server-avatar').textContent = serverInitials(s);
        $('#rp-server-avatar').style.background = s.color;
        $('#rp-server-name').textContent = s.name + (s.status === 'pause' ? ' · en pause' : '');
        sr.hidden = false;
      } else if (sr) {
        sr.hidden = true;
      }
      const sc = $('#rp-split-card'); if (sc) sc.hidden = true;
      const tt = $('#rp-table-tools'); if (tt) tt.hidden = true;

      $('#rp-table').textContent = `${tableId} · ${t.covers} couvert${t.covers > 1 ? 's' : ''}`;
      /* Ce qui est DÉJÀ parti, et ce qui reste à envoyer. La distinction est le
         cœur d'un ajout : le serveur rouvre une mesa avec quatre plats en
         cuisine et doit voir, sans compter, que seuls les deux derniers
         partiront au prochain appui. */
      const heldQty = order.filter(l => l.kind !== 'formula-part' && lineHeld(l, order)).reduce((s, l) => s + l.qty, 0);
      const fresh = order.filter(l => !l.sent && !lineHeld(l, order)).reduce((s, l) => s + l.qty, 0);
      const sentQty = order.filter(l => l.sent).reduce((s, l) => s + l.qty, 0);
      const heldTxt = heldQty > 0 ? ` · ${heldQty} à suivre` : '';
      const orderProPendingQty = order.filter(l => l.orderProPending).reduce((s, l) => s + l.qty, 0);
      const sub = $('#rp-substatus');
      sub.dataset.flag = 'ka-yaklo';
      sub.textContent = order.length === 0
        ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Nouvelle table, en attente de commande')
        : orderProPendingQty > 0
          ? `${orderProPendingQty} OrderPro à accepter · ${fmtMAD(total)}`
        : sentQty > 0
          ? `${sentQty} en cuisine · ${fresh} à envoyer${heldTxt} · ${fmtMAD(total)}`
          : `${itemCount} article${itemCount > 1 ? 's' : ''}${heldTxt} · ${fmtMAD(total)}`;

      if (order.length === 0) {
        try { window.KiwiPairs && KiwiPairs.reset('table:' + tableId); } catch (_) {}
        $('#rp-items').innerHTML = `
          <div class="rp-order-empty">
            <i data-lucide="shopping-cart" style="width:34px;height:34px;color:var(--ink-3);display:block;margin:0 auto 10px;"></i>
            <p>Sélectionnez des articles dans le menu à gauche</p>
          </div>`;
      } else {
        $('#rp-items').innerHTML = order.map(l => l.sent ? `
          <div class="rp-item rp-item--cart rp-item--sent" data-order-uid="${l.uid}">
            ${l.kind === 'formula-part' ? `<span class="rp-sent-qty">${l.qty}×</span>` : `<div class="qty-control">
              <button type="button" class="qty-btn" data-cart-action="dec" aria-label="Annuler un ${kdsEsc(l.name)} envoyé en cuisine">−</button>
              <span class="qty-num mono">${l.qty}</span>
            </div>`}
            <span class="rp-item-name">${lineName(l)}${(l.opts && l.opts.length) ? `<i class="rp-item-opts">${kdsEsc(optText(l.opts))}</i>` : ''}${promoTag(l)}</span>
            <span class="rp-item-price mono">${fmtMAD(l.price * l.qty)}</span>
            <span class="rp-sent-mark">${KDS_SVG.check}${l.orderProPending ? 'OrderPro · à accepter' : 'En cuisine'}</span>
            ${(l.note || '').trim() ? `<span class="rp-item-noteline">Note cuisine · ${kdsEsc(l.note)}</span>` : ''}
          </div>` : `
          <div class="rp-item rp-item--cart" data-order-uid="${l.uid}">
            ${l.kind === 'formula-part' ? `<span class="rp-sent-qty">${l.qty}×</span>` : `<div class="qty-control">
              <button class="qty-btn" data-cart-action="dec" aria-label="Moins">−</button>
              <span class="qty-num mono">${l.qty}</span>
              <button class="qty-btn" data-cart-action="inc" aria-label="Plus">+</button>
            </div>`}
            <span class="rp-item-name">${lineName(l)}${(l.opts && l.opts.length) ? `<i class="rp-item-opts">${kdsEsc(optText(l.opts))}</i>` : ''}${promoTag(l)}</span>
            <span class="rp-item-price mono">${fmtMAD(l.price * l.qty)}</span>
            <div class="rp-item-noterow">
              <input class="rp-item-note${(l.note || '').trim() ? ' has-note' : ''}" data-note-uid="${l.uid}"
                value="${kdsEsc(l.note || '')}" placeholder="Note cuisine, ex. bien chaud, sans oignon"
                aria-label="Note cuisine, ${kdsEsc(l.name)}" />
              ${l.kind === 'formula-part' ? (lineHeld(l, order) ? '<span class="rp-hold-mark">À suivre</span>' : '') : `<button type="button" class="rp-hold${l.hold ? ' is-on' : ''}" data-hold-uid="${l.uid}"
                aria-pressed="${l.hold ? 'true' : 'false'}" title="Garder ce plat pour la suite : il part en cuisine au prochain « Envoyer la suite »">À suivre</button>`}
            </div>
          </div>`).join('') + pairSuggestHtml(order, 'table:' + tableId);
      }

      $('#rp-total').textContent = fmtMAD(total);
      window.CaisseFx && window.CaisseFx.countTotal();
      showPayButtons(true);
      /* Same guard as renderRightPanel: once a split has taken a part, the only
         valid route is to resume it. The « Encaisser » of the order panel opens
         the cash flow for the WHOLE bill, so it charged the full amount again
         after a part was already paid. */
      if (tableHasOpenSplit(tableId)) {
        const chargeOrder = $('#pay-charge-order');
        if (chargeOrder) { chargeOrder.hidden = true; chargeOrder.style.display = 'none'; }
      } else {
        const chargeOrder = $('#pay-charge-order');
        if (chargeOrder) { chargeOrder.hidden = false; chargeOrder.style.display = ''; }
      }
      lucide.createIcons();
    }

    /* ---- validate (send to kitchen) ---- */
    function validateOrder(tableId) {
      if (!tableId) return;
      const t = tables[tableId];
      /* La table a disparu pendant la saisie (le patron a retouché son plan
         depuis son téléphone : setupRealSalle() reconstruit `tables`). Sans ce
         garde, la ligne suivante lève, l'écouteur du bouton meurt sur place, et
         « Envoyer en cuisine » devient un bouton mort de plus · le symptôme même
         qu'on est en train de corriger. On sort proprement. */
      if (!t) { backToSalle(); toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Cette table n\'existe plus sur le plan')); return; }
      /* Un AJOUT ou une première commande ? La question se pose AVANT l'envoi,
         parce que c'est l'envoi qui pose les drapeaux `sent`. */
      const wasAddition = tableSentCount(tableId) > 0;
      const n = tableFreshQty(tableId);
      const held = tableHeldQty(tableId);

      tableSettlement().project(t, { status: 'ka-yaklo' });
      if ((tableOrders[tableId] || []).length) startTableTimer(tableId);
      refreshTableNode(tableId);

      // Retour salle, mesa toujours ouverte et sélectionnée : le serveur voit
      // l'addition à jour à la seconde où il a validé.
      backToSalle(tableId);

      /* « … en cuisine » était un mot, pas un geste : rien ne partait vers
         l'écran cuisine et aucun bon ne s'imprimait. Le serveur validait, la
         cuisine ne voyait rien, et le plat n'était lancé qu'au moment où
         quelqu'un s'en étonnait. */
      const sent = sendTableToKitchen(tableId);
      /* `backToSalle(tableId)` rendered the bill before sendTableToKitchen()
         marked its lines as sent. The destructive kitchen-void control is
         intentionally shown only for sent lines, so it stayed invisible until
         staff closed and reopened the table. Refresh the still-selected bill
         after the flags and canonical kitchen ticket have been created. */
      if (selectedId === tableId) renderRightPanel(tableId);
      const what = (n > 0 ? `${n} article${n > 1 ? 's' : ''} en cuisine` : 'rien de neuf à envoyer')
        + (held > 0 ? ` · ${held} à suivre` : '');
      toast(`${wasAddition ? 'Ajout table ' + tableId : 'Table ' + tableId + ' ouverte'} · ${what}`
        + (sent && sent.num ? ` · bon #${sent.num}` : ''));
    }
