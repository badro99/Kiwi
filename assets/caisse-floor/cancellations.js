
    /* Never leave an item correction locked behind a stalled network. A timed
       out write may still have committed, so the line keeps one stable request
       id and the next tap verifies/replays that same operation. */
    async function postCaisseCancellation(body) {
      if (window.KiwiTillTenant?.mismatch()) throw new Error('caisse appairée à un autre commerce · réappairez-la avant d\u2019annuler');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch('/api/order/queue', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error || `serveur ${res.status}`);
        return data;
      } catch (err) {
        if (controller.signal.aborted) throw new Error('délai dépassé · vérifiez la commande après synchronisation avant de réessayer');
        throw err;
      } finally { clearTimeout(timer); }
    }

    /* One tap on a sent line removes one unit from the unpaid bill and records
       an approved kitchen void. The paired till is the authorization: unlike
       a whole-table cancellation, this frequent correction has no PIN or
       reason dialog. The amount changes only after the server confirms it. */
    /* UN PLAT ANNULÉ APRÈS SON ENVOI. L'écran cuisine reçoit l'annulation ;
       une cuisine qui travaille au papier n'a que le bon déjà imprimé, et
       continue de préparer le plat. Le chemin de l'envoi (file durable, un
       bon par station) imprime donc « ANNULÉ » sur la même imprimante que le
       plat, dédupliqué par l'identifiant de l'annulation : une réponse perdue
       puis rejouée n'imprime pas deux bons. Une formule part avec ses choix,
       pour une unité, comme le geste qui l'annule. */
    function printKitchenVoid(tableId, line, requestId, scope, qtyBefore) {
      try {
        if (!line || line.kind === 'formula-part' || !requestId) return;
        const all = scope && scope.cart ? cart : (tableOrders[tableId] || []);
        const per = Math.max(1, Number(qtyBefore) || 1);
        const parts = line.kind === 'formula' && line.formulaUid
          ? all.filter(l => l && l.kind === 'formula-part' && l.formulaUid === line.formulaUid)
          : [];
        const unit = [Object.assign({}, line, { qty: 1 })].concat(parts.map(p =>
          Object.assign({}, p, { qty: Math.max(1, Math.round((Number(p.qty) || 1) / per)) })));
        return printKitchenTickets({ table: tableId || '', sentAt: new Date() }, kitchenItemsFromLines(unit),
          { sourceId: 'void-' + requestId, voided: true });
      } catch (_) {}
    }

    async function cancelCaisseLineImmediately(tableId, line, scope) {
      if (!line || line.voidBusy) return;
      scope = scope || { tableId };
      const qtyBefore = Number(line.qty) || 1;
      const slug = currentMerchantSlug();
      if (storeIsReal() && !slug) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Annulation impossible · caisse non appairée, article conservé'));
        return;
      }
      currentOrder().patchLine(line, { ["voidBusy"]: true });
      toast(`Annulation de ${line.name}…`);

      if (slug) {
        try {
          // Keep the operation identity across a lost response / retry.
          currentOrder().patchLine(line, { ["cancelRequestId"]: line.cancelRequestId || ('voi-' + crypto.randomUUID()) });
          const owner = tableId && canonicalOrdersForTable(tableId).find(entry =>
            (entry.order.relayLines || []).some(item => item.uid === line.uid));
          const data = await postCaisseCancellation({
              merchant: slug,
              voidLine: {
                /* Une commande à emporter n'a pas de table : elle se désigne
                 * par son identifiant de file, que `voidLine` accepte déjà
                 * (functions/api/order/queue.js · `if (b.voidLine.orderId)`). */
                ...(scope.orderId || line.canonicalOrderId || owner?.id ? { orderId: scope.orderId || line.canonicalOrderId || owner.id } : {}),
                ...(tableId ? { table: tableId } : {}),
                immediate: true,
                requestId: line.cancelRequestId,
                lineId: line.canonicalUid || line.uid || line.id,
                itemId: line.id || '',
                qty: 1,
                reason: 'item_cancelled',
                isWaste: 0,
                actor: 'Caisse'
              }
          });
          if (data && data.alertSent) {
            currentOrder().patchLine(line, { ["voidPending"]: true });
            toast(`Annulation demandée · attente de la cuisine · ${line.name}`);
            if (tableId) renderRightPanel(tableId);
            return;
          }
          // A poll may already have applied this revision while the request
          // was in flight. Set server quantities, never subtract twice.
          if (!Array.isArray(data.remainingLines)) throw new Error('réponse incomplète · synchronisez la commande');
          const reconcile = (list) => (list || []).filter(item => {
            const owned = item === line || item.uid === line.uid
              || (line.formulaUid && item.formulaUid === line.formulaUid);
            if (!owned) return true;
            const remote = data.remainingLines.find(row => String(row.uid || row.id) === String(item.canonicalUid || item.uid))
              || (!item.canonicalUid && data.remainingLines.find(row => !row.uid && row.id === item.id));
            if (!remote) return false;
            currentOrder().patchLine(item, { qty: Number(remote.qty), voidPending: !!remote.voidAlert }, ['cancelRequestId']);
            return item.qty > 0;
          });
          const voidRequestId = line.cancelRequestId;
          printKitchenVoid(tableId, line, voidRequestId, scope, qtyBefore);
          if (scope.cart) currentOrder().replaceCart(reconcile(cart));
          else currentOrder().replaceTable(tableId, reconcile(tableOrders[tableId]));
          try { persistShift(); } catch (_) {}
          currentOrder().patchLine(line, {}, ["cancelRequestId"]);
          toast(`${line.name} annulé en cuisine`);
          return;
        } catch (err) {
          toast(`Article conservé · ${err.message || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('annulation non transmise')} · touchez − pour réessayer`);
          return;
        } finally {
          currentOrder().patchLine(line, { ["voidBusy"]: false });
          renderMenu();
          if (tableId) {
            if (mode === 'order') renderOrderPanel(tableId);
            else renderRightPanel(tableId);
          } else renderCart();
        }
      }

      /* Local demo: there is no kitchen server to notify. A paper kitchen
         still gets its slip. */
      printKitchenVoid(tableId, line, 'demo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), scope, qtyBefore);
      if (scope.cart) {
        currentOrder().replaceCart(applyGroupedLineQtyDelta(cart, line, -1));
      } else {
        currentOrder().replaceTable(tableId, applyGroupedLineQtyDelta(tableOrders[tableId] || [], line, -1));
      }
      currentOrder().patchLine(line, { ["voidBusy"]: false });
      renderMenu();
      if (tableId) {
        try { persistShift(); } catch (_) {}
        if (mode === 'order') renderOrderPanel(tableId);
        else renderRightPanel(tableId);
      } else renderCart();
    }
