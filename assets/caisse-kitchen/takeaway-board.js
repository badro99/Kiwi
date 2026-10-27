
    function setVrapView(v) {
      vrapView = v;
      const board = $('#vrap-board'), builder = $('#vrap-builder');
      if (board)   board.hidden   = v !== 'board';
      if (builder) builder.hidden = v !== 'builder';
      const back = $('#vrap-back-board');
      if (back) back.style.display = (v === 'builder' && mode === 'vrap') ? '' : 'none';
      const meta = $('.main-head[data-mode-section="vrap"] .vrap-meta');
      if (meta) meta.style.display = (v === 'builder') ? '' : 'none';
      if (v === 'board') renderVrapBoard();
    }

    function vrapElapsed(o) {
      const min = Math.max(0, Math.floor((Date.now() - o.sentAt.getTime()) / 60000));
      return min < 1 ? "à l'instant" : `il y a ${min} min`;
    }
    function vrapItemsLine(o) {
      return o.items.map(i => `${i.q}× ${kdsEsc(i.n)}`).join(', ');
    }

    function vrapFinancialItems(o) {
      return o && Array.isArray(o.billItems) && o.billItems.length ? o.billItems : ((o && o.items) || []);
    }

    /* ── Vente au comptoir ou commande à distance ? ────────────────────────
     * Une commande OrderPro est passée par un client ABSENT : il faut pouvoir
     * lui dire « c'est prêt », puis constater qu'il est venu la chercher. Ces
     * deux étapes sont la raison d'être de « Marquer prêt » et « Remettre au
     * client ».
     *
     * Une vente saisie AU COMPTOIR n'a ni l'une ni l'autre : le client est
     * devant la caisse, il paie, il attend son sachet et il repart. Lui faire
     * traverser les deux mêmes boutons n'informait personne — ça ajoutait deux
     * gestes au coup de feu et laissait la carte traîner dans « EN COURS ».
     *
     * `opChannel` porte la provenance : 'kiwi' = OrderPro / téléphone, tout le
     * reste = ce comptoir. Une commande purement locale (pas encore de numéro
     * de file) est forcément du comptoir elle aussi. */
    function vrapIsCounterSale(o) {
      if (!o) return false;
      if (o.opChannel) return o.opChannel !== 'kiwi';
      return o.opNum == null;
    }

    function vrapOrderCard(o) {
      const ready = o.status === 'ready';
      const counterSale = vrapIsCounterSale(o);
      const savedSplit = savedTakeawaySplitFor(o);
      const splitRemaining = savedSplit ? splitRemainingTotal(savedSplit) : null;
      /* Readiness is an ORDER state, not a merchant or printer capability.
         The counter must be able to mark every accepted takeaway ready even
         when a KDS is configured: some restaurants run the pass from the
         caisse, and the same OrderPro workflow must work for every tenant. */
      const readyBtn = (!ready && o.status !== 'held' && !counterSale)
        ? `<button class="vrap-act vrap-act-ready" data-vrap-ready="${o.num}" title="Prévenir le client que la commande est prête">Marquer prêt</button>`
        : '';
      const sendBtn = o.status === 'held'
        ? `<button class="vrap-act vrap-act-send" data-vrap-send="${o.num}">Envoyer en cuisine</button>`
        : '';
      const cancelBtn = o.opId
        ? `<button class="vrap-act vrap-act-cancel" data-vrap-cancel="${o.num}">Annuler</button>`
        : '';
      let action = '';
      if (!o.paid) {
        action = `<div class="vrap-order-acts">${cancelBtn}${sendBtn}${readyBtn}<button class="vrap-act vrap-act-pay">${savedSplit ? 'Reprendre le split · ' : 'Encaisser · '}${fmtMAD(splitRemaining != null ? splitRemaining : o.total)}</button></div>`;
      } else if (!o.pickedUp) {
        if (!counterSale) {
          /* Do not offer handover while the card still says "En préparation".
             That shortcut silently marked the order ready and served in one
             click, hiding the readiness step from every KDS-enabled merchant. */
          action = readyBtn || `<button class="vrap-act" data-vrap-handover="${o.num}">Remettre au client</button>`;
        }
        /* Older paid counter sales can lack a served milestone. They need the
           same audited, non-financial escape hatch as phone orders; payment
           alone must not fabricate a customer handover. */
        if (o.opId) action += `<button class="vrap-act vrap-act-archive" data-vrap-archive="${o.num}">Retirer du suivi</button>`;
      }
      const notes = o.items.filter(i => (i.note || '').trim())
        .map(i => `<div class="vrap-order-note"><i data-lucide="pencil-line"></i> <strong>${kdsEsc(i.n)}</strong> · ${kdsEsc(i.note)}</div>`)
        .join('');
      const paidDetails = o.paid && vrapSelectedPaidNum === o.num
        ? `<div class="vrap-order-details"><strong>Commande payée · ${kdsEsc(new Date(o.sentAt).toLocaleString('fr-FR'))}</strong>
            ${o.pickedUp ? 'Remise au client.' : 'En attente de remise. « Retirer du suivi » ne modifie ni le paiement ni les ventes.'}</div>` : '';
      return `<div class="vrap-order${ready ? ' is-ready' : ''}${o.paid ? ' is-paid' : ' is-open'}" data-vrap-num="${o.num}">
        <div class="vrap-order-head">
          <span class="vrap-order-num">${ticketNo(o)}</span>
          <span class="vrap-order-time"><i data-lucide="clock"></i> ${vrapElapsed(o)}</span>
        </div>
        <div class="vrap-order-badges">
          <span class="vrap-badge ${ready ? 'k-ready' : 'k-cooking'}">${
            ready ? 'Prête'
            /* `held` = commande passée depuis un téléphone, pas encore réglée.
               Elle n'est PAS en préparation : la cuisine ne l'a même pas vue,
               et c'est justement le paiement qui l'y enverra. Le dire « en
               préparation » aurait fait attendre le client pour rien, et
               laissé croire au comptoir que le travail était lancé. */
            : o.status === 'held' ? 'En attente de paiement'
            : 'En préparation'}</span>
          <span class="vrap-badge ${o.paid ? 'p-paid' : 'p-unpaid'}">${o.paid ? 'Payé' : savedSplit ? `Partiel · reste ${fmtMAD(splitRemaining)}` : 'Non payé'}</span>
        </div>
        <div class="vrap-order-items">${vrapItemsLine(o)}</div>
        ${notes}
        ${paidDetails}
        <div class="vrap-order-foot">
          <span class="vrap-order-total">${fmtMAD(o.total)}</span>
          ${action}
        </div>
      </div>`;
    }

    function vrapHandoverTimestamp(value) {
      if (typeof value !== 'number' && typeof value !== 'string') return null;
      const ts = Number(value);
      return Number.isInteger(ts) && ts > 0 && ts <= 8640000000000000 ? ts : null;
    }

    function vrapHistoryDay(ts) {
      const DR = window.KiwiDayReport;
      if (DR && typeof DR.businessDay === 'function') return DR.businessDay(ts, opMerchant());
      // Same default as day-report.js when that optional module is unavailable.
      const d = new Date(ts - 5 * 3600000);
      return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-');
    }

    function vrapHandoverTime(ts) {
      return ts ? new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    }

    function vrapHistoryRow(o) {
      const ts = vrapHandoverTimestamp(o.pickedUpTs);
      return `<div class="vrap-hrow">
        <span class="vrap-hrow-num">${ticketNo(o)}</span>
        <span class="vrap-hrow-items">${vrapItemsLine(o)}</span>
        <span class="vrap-hrow-total">${fmtMAD(o.total)}</span>
        <span class="vrap-hrow-done"><i data-lucide="check"></i> ${ts ? 'Remise ' + kdsEsc(vrapHandoverTime(ts)) : 'Remise · heure inconnue'}</span>
      </div>`;
    }

    /* Une expirée n'est plus une commande, c'est un souvenir avec des lignes :
       on la réaffiche en lecture seule, et la reprise en fait une vente neuve
       (nouveau numéro, nouveau bon) — jamais une résurrection, le serveur ne
       saurait pas la rouvrir. */
    function expiredRow(e) {
      const items = (e.lines || []).map(l => `${l.qty}× ${l.name}`).join(', ') || '·';
      const when = (() => { try {
        const mins = Math.max(0, Math.round((Date.now() - Number(e.updated_ts || 0)) / 60000));
        return mins < 1 ? "à l'instant" : `il y a ${mins} min`;
      } catch (_) { return ''; } })();
      const where = e.mode === 'table' && e.table ? `Table ${kdsEsc(e.table)}` : 'À emporter';
      return `<div class="vrap-hrow" data-exp-row="${kdsEsc(e.id)}">
        <span class="vrap-hrow-num">N°${kdsEsc(e.number)} · ${where}</span>
        <span class="vrap-hrow-items">${kdsEsc(items)} <span style="opacity:.6">· ${kdsEsc(when)}</span></span>
        <span class="vrap-hrow-total">${fmtMAD(e.total || 0)}</span>
        <div style="display:inline-flex;gap:6px;align-items:center;flex-shrink:0;">
          <button class="vrap-act vrap-act-send" data-exp-reprendre="${kdsEsc(e.id)}">Reprendre</button>
          <button class="vrap-act vrap-act-cancel" data-exp-dismiss="${kdsEsc(e.id)}" title="Supprimer de la liste">Supprimer</button>
        </div>
      </div>`;
    }

    /* Recharger les lignes d'une expirée dans le panier, comme une vente neuve :
       re-saisie revue par le caissier, re-chiffrée au passage en caisse. Un
       second tap recharge le même panier — jamais un doublon en cuisine. */
    function reprendreExpired(id) {
      const e = (expiredOrders || []).find(x => x && String(x.id) === String(id));
      if (!e || !(e.lines || []).length) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Expirée introuvable')); return; }
      if (mode !== 'vrap') setMode('vrap');
      vrapResumedExpiredId = String(id);
      dismissExpired(id);
      currentOrder().setEditing(null);
      currentOrder().setDiscount(null);
      currentOrder().replaceCart((e.lines || []).map(l => {
        const m = menuLineFind(x => String(x.name || '').toLowerCase() === String(l.name || '').toLowerCase());
        return {
          uid: newLineUid(),
          id: (m && m.id) || ('x-' + l.name),
          name: l.name || (m && m.name) || '',
          price: Math.max(0, +l.unitPrice || (m ? m.price : 0)),
          qty: Math.max(1, +l.qty || 1),
          note: l.note || '',
          kind: '', formulaUid: '', formulaChoices: [],
        };
      }).filter(c => c.name));
      if (!cart.length) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Expirée vide · rien à reprendre')); return; }
      setVrapView('builder');
      renderMenu();
      renderCart();
      renderVrapBoard();
      toast(`N°${e.number} reprise · vérifie et encaisse`);
    }

    function renderVrapBoard() {
      const body = $('#vrap-board-body');
      if (!body) return;
      const orders = kdsOrders.filter(o => o.type === 'takeaway');
      const active = orders.filter(o => !o.pickedUp)
        .sort((a, b) => ((b.status === 'ready') - (a.status === 'ready')) || (b.num - a.num));
      const today = vrapHistoryDay(Date.now());
      const done = orders.filter(o => o.pickedUp && vrapHandoverTimestamp(o.pickedUpTs)
        && vrapHistoryDay(Number(o.pickedUpTs)) === today)
        .sort((a, b) => Number(b.pickedUpTs) - Number(a.pickedUpTs) || b.num - a.num);
      // An old HH:mm value has no date and may have been fabricated on import.
      // Neither order creation nor payment is evidence of the handover day.
      const undated = orders.filter(o => o.pickedUp && !vrapHandoverTimestamp(o.pickedUpTs))
        .sort((a, b) => b.num - a.num);

      const cntEl = $('#vrap-board-count');
      if (cntEl) cntEl.textContent = active.length
        ? `${active.length} commande${active.length > 1 ? 's' : ''} en cours · ${done.length} servie${done.length > 1 ? 's' : ''}`
        : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucune commande en cours');

      let html = `<div class="vrap-section"><div class="vrap-section-label">En cours</div>`;
      html += active.length
        ? `<div class="vrap-orders">${active.map(vrapOrderCard).join('')}</div>`
        : `<div class="vrap-empty"><i data-lucide="package"></i><span>Aucune commande à emporter, clique « Nouvelle commande » pour démarrer.</span></div>`;
      html += `</div>`;
      /* ── LES EXPIRÉES ─────────────────────────────────────────────────
       * Refus récents du serveur (TTL ou comptoir), lecture seule. Sans
       * cette section, une commande jamais validée à temps n'existait plus
       * nulle part : « on ne trouve rien ». Ici elle garde son numéro, ses
       * lignes et son total, et « Reprendre » la recharge dans le panier
       * comme une vente neuve — le client repart avec son sac, pas avec
       * une excuse. */
      const expList = (expiredOrders || []).filter(e => e && e.id);
      if (expList.length) {
        html += `<div class="vrap-section"><div class="vrap-section-label">Expirées · à reprendre (${expList.length})</div>`
          + `<div class="vrap-hrows">${expList.map(expiredRow).join('')}</div></div>`;
      }
      if (done.length) {
        html += `<div class="vrap-section"><div class="vrap-section-label">Historique · servies aujourd'hui</div>`
          + `<div class="vrap-hrows">${done.map(vrapHistoryRow).join('')}</div></div>`;
      }
      if (undated.length) {
        html += `<div class="vrap-section"><div class="vrap-section-label">Historique · date de remise inconnue</div>`
          + `<div class="vrap-hrows">${undated.map(vrapHistoryRow).join('')}</div></div>`;
      }
      body.innerHTML = html;
      if (window.lucide) lucide.createIcons();
    }

    /* Clicking a board order re-opens it in the menu builder: its lines load
       into the cart, you add from the menu / adjust with +/−, apply a
       réduction, then pay through the real card / cash modals.
       State (vrapEditingNum / vrapDiscount) is declared up top. */

    /* cart lines → order item objects, preserving each line's kitchen station + note */
    function vrapCartItems(o) {
      return cart.map(c => {
        const orig = o && vrapFinancialItems(o).find(it => it.n === c.name);
        const m = menuLineFind(x => x.id === c.id);
        /* Cette branche ignorait m.station : rouvrir une commande à emporter pour
           y ajouter un plat renvoyait TOUTE la commande en cuisson, y compris le
           café qui devait aller au bar. Même résolution que partout ailleurs. */
        return { q: c.qty, n: c.name, p: c.price, note: (c.note || '').trim(),
          kind: (orig && orig.kind) || c.kind || '', formulaUid: (orig && orig.formulaUid) || c.formulaUid || '',
          formulaChoices: Array.isArray(c.formulaChoices) ? c.formulaChoices.map(choice => ({ ...choice })) : [],
          stations: orig ? orig.stations : [kdsStationFor(m)] };
      });
    }

    function saveVrapBillItems(o, items) {
      if (!o) return;
      if (!Array.isArray(o.billItems)) { o.items = items; return; }
      o.billItems = items;
      o.items.forEach((kitchenItem) => {
        const billed = kitchenItem.formulaUid
          ? items.find(item => item.formulaUid === kitchenItem.formulaUid)
          : items.find(item => item.n === kitchenItem.n);
        if (billed) kitchenItem.q = billed.q;
      });
    }

    /* Persist the working cart back onto the order being edited (no payment). */
    function saveVrapEdits() {
      if (vrapEditingNum == null) return;
      const o = kdsOrders.find(x => x.num === vrapEditingNum);
      if (!o || o.paid || cart.length === 0) return;
      saveVrapBillItems(o, vrapCartItems(o));
      o.total = cart.reduce((s, c) => s + c.price * c.qty, 0);  // gross · réduction is checkout-only
    }

    function cancelOrderProTakeaway(o, authorizedWho = null) {
      if (!o || !o.opId || o.paid) return false;
      const label = ticketNo(o);
      const proceed = (who) => {
        toast(`Annulation de ${label}…`);
        postCaisseCancellation({ merchant: currentMerchantSlug(), id: o.opId,
          status: 'rejected', server: 'dismissed', actorProof: who && who.actorProof || '' }).then(() => {
          dismissExpired(o.opId);
          opTickets.delete(o.opId);
          const index = kdsOrders.indexOf(o);
          if (index >= 0) kdsOrders.splice(index, 1);
          if (vrapEditingNum === o.num) {
            currentOrder().setEditing(null);
            clearCart();
            setVrapView('board');
          } else renderVrapBoard();
          updateKdsCount();
          if (kdsEl.classList.contains('is-open')) kdsPaint();
          try { persistShift(); } catch (_) {}
          const by = who && who.name ? ` · ${who.name}` : '';
          toast(`Commande ${label} annulée${by}`);
        }).catch((error) => {
          toast(`Commande ${label} conservée · ${error.message || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('annulation non transmise')}`);
        });
      };
      if (authorizedWho) { proceed(authorizedWho); return true; }
      window.KiwiAuthAct?.({ kind: 'cancel_order', key: 'act.cancel_order', args: { order: label } });
      requireTillOperator(`Annuler la commande ${label}`, proceed, TILL_NEEDS_SERVER);
      return true;
    }

    /* Card / cash cleared in À emporter mode. For an order being edited this
       settles it on the board; for a fresh counter sale it just clears. */
    function settleVrapPayment() {
      if (vrapResumedExpiredId) {
        dismissExpired(vrapResumedExpiredId);
        vrapResumedExpiredId = null;
      }
      if (vrapEditingNum != null) {
        const o = kdsOrders.find(x => x.num === vrapEditingNum);
        if (o) {
          o.paid  = true;
          /* Split parts are tenders against the original order. The working
             cart can reflect the last resumed slice, so currentTotal() is not
             authoritative at finalisation; keep the saved gross/net order
             amount for the board and history. */
          o.total = splitState.flow && Number.isFinite(Number(splitState.total))
            ? money(splitState.total)
            : currentTotal();
          if (cart.length) saveVrapBillItems(o, vrapCartItems(o));
          /* Une commande client à emporter attendait le paiement (`held`) : le
             client vient d'annoncer son numéro et de payer, donc elle part en
             cuisine MAINTENANT, et pas avant. C'est ce que le paiement protège
             · on ne prépare rien pour quelqu'un qui n'est jamais venu. */
          dispatchHeldTakeaway(o, true, true);
          /* Already-sent orders are no longer `held`, so dispatchHeldTakeaway
             correctly does nothing. Payment still has to cross the server
             boundary; the queue endpoint accepts this same-state paid stamp
             idempotently without replaying the kitchen transition. */
          /* ── La vente au comptoir se termine en étant payée ────────────────
           * Elle n'a plus « Marquer prêt » ni « Remettre au client » (voir
           * vrapIsCounterSale) : sans cela elle resterait EN COURS pour le
           * reste du service, et surtout sa session `takeout` resterait OUVERTE
           * dans D1 — la journée d'exploitation se fermerait sur des sessions
           * qui ne se refermeront jamais. Le paiement EST la fin : le client est
           * devant la caisse, il repart avec son sachet.
           *
           * `served` emprunte exactement le chemin qu'empruntait « Remettre » —
           * même transition, même fermeture de session, même événement
           * `takeout-handover` au journal. Rien de neuf côté serveur. */
          if (vrapIsCounterSale(o) || o.offPlan) {
            o.pickedUp = true;
            o.pickedUpTs = Date.now();
            o.pickedUpAt = vrapHandoverTime(o.pickedUpTs);
            /* On ne force PAS `ready` au passage : le serveur accepte
             * `served` depuis `accepted` autant que depuis `ready`
             * (FROM.served = ['ready','accepted']), et mentir sur l'état
             * cuisine ferait disparaître un plat encore à faire de l'écran de
             * production. La cuisine garde son bon ; c'est la carte du
             * comptoir qui se range. */
          }
          if (o.opId) {
            const remoteStatus = o.pickedUp ? 'served' : (o.status === 'ready' ? 'ready' : 'accepted');
            opPush(o, remoteStatus, { paid: true });
          }
          /* Une table hors plan payée au comptoir : sa visite se ferme comme
             celle d'une table du plan (markPaid › releasePhoneTable), sans quoi
             le téléphone du client resterait un terminal de commande. */
          /* Mais SEULEMENT si plus rien n'est dû sur cette visite : la fermer
             avec « settle » estampille payée chaque commande de la session, et
             une deuxième commande de la même table, pas encore encaissée,
             partirait gratuite. Elle se fermera avec la dernière. */
          let visitOwes = false;
          if (o.offPlan && o.session) {
            try {
              const inbox = (window.KiwiOrderInbox && KiwiOrderInbox.orders && KiwiOrderInbox.orders()) || {};
              visitOwes = Object.keys(inbox).some((id) => {
                const other = inbox[id];
                return other && id !== String(o.opId) && other.mode === 'table'
                  && String(other.session || '') === String(o.session)
                  && !other.paid && other.status !== 'rejected';
              });
            } catch (_) { visitOwes = true; }
          }
          if (o.offPlan && o.session && !visitOwes) {
            try {
              document.dispatchEvent(new CustomEvent('kiwi-table-released', {
                detail: { table: String(o.table || ''), session: String(o.session), why: 'settle', actorProof: '' },
              }));
            } catch (_) {}
          }
          /* dispatchHeldTakeaway persists before this function flips `paid`.
             Persist again at the money boundary so closing the success modal,
             refreshing, or a PWA takeover cannot resurrect an unpaid card. */
          try { persistShift(); } catch (_) {}
          toast(`Commande ${ticketNo(o)} encaissée · ${fmtMAD(o.total)}`);
        }
        currentOrder().setEditing(null);
        clearCart();
        setVrapView('board');
      } else {
        clearCart();
      }
    }

    /* Click a board order → load it into the builder for editing + checkout. */
    function openVrapOrder(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || o.paid) return;
      if (mode !== 'vrap') setMode('vrap');
      currentOrder().setEditing(num);
      currentOrder().setDiscount(null);
      currentOrder().replaceCart(vrapFinancialItems(o).map(i => {
        const m = menuLineFind(x => x.name === i.n);
        return {
          uid:   newLineUid(),
          id:    m ? m.id : ('x-' + i.n),
          name:  i.n,
          price: i.p != null ? i.p : (m ? m.price : 0),
          qty:   i.q,
          note:  i.note || '',
          kind: i.kind || '', formulaUid: i.formulaUid || '',
          formulaChoices: Array.isArray(i.formulaChoices) ? i.formulaChoices.map(choice => ({ ...choice })) : [],
        };
      }));
      setVrapView('builder');
      const vrapTitle = $('.main-head[data-mode-section="vrap"] .main-title');
      if (vrapTitle) {
        vrapTitle.innerHTML = `Commande <strong style="color:var(--forest)">${ticketNo(o)}</strong>
          <span class="order-mode-badge"><i data-lucide="package"></i> à emporter</span>`;
      }
      renderMenu();
      renderCart();
      if (savedTakeawaySplitFor(o)) openSplitModal(null);
      // Re-trigger the panel slide-in so the order visibly lands.
      const active = $('#rp-active');
      if (active) { active.style.animation = 'none'; void active.offsetWidth; active.style.animation = ''; }
    }

    /* Réduction on the À emporter cart · same modal as the Salle remise. */
    function openVrapRemise() {
      if (mode === 'order' && selectedId) {
        openRemiseModal(selectedId);
        return;
      }
      const list = (cart && cart.length) ? cart : [];
      if (!list.length) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ajoute des articles d\'abord')); return; }
      const gross = list.reduce((s, l) => s + l.price * l.qty, 0);
      remiseState.target  = 'vrap';
      remiseState.tableId = null;
      remiseState.gross   = gross;
      const existing = vrapDiscount;
      if (existing) {
        remiseState.kind   = existing.kind || 'pct';
        remiseState.value  = Number(existing.value || 0);
        remiseState.reason = existing.reason || 'Geste commercial';
      } else {
        remiseState.kind   = 'pct';
        remiseState.value  = 0;
        remiseState.reason = 'Geste commercial';
      }
      $('#rm-subtle').innerHTML = `À emporter · addition <span class="mono">${fmtMAD(gross)}</span>`;
      renderRemiseChips();
      $('#rm-amount').value = (remiseState.kind === 'amount' && remiseState.value) ? remiseState.value : '';
      $$('#rm-pct-chips .rm-pct-chip').forEach(c => {
        c.classList.toggle('is-active', remiseState.kind === 'pct' && parseFloat(c.dataset.rmPct) === remiseState.value);
      });
      $$('#rm-reasons .rm-reason').forEach(b =>
        b.classList.toggle('is-active', b.dataset.rmReason === remiseState.reason));
      const rmRemoveBtn = $('#rm-remove');
      if (rmRemoveBtn) {
        rmRemoveBtn.hidden = !existing;
        rmRemoveBtn.style.display = existing ? '' : 'none';
      }
      syncRemiseType();
      renderRemisePreview();
      remiseModal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
    }

    function vrapMarkReady(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || o.status === 'ready') return;
      o.items.forEach(i => { i.stationReady = true; });
      o.status = 'ready';
      o.readyAt = kdsNowHM();
      kdsPaint();
      renderVrapBoard();
      // Le client apprend que sa commande est prête sur son téléphone (OrderPro)
      opPush(o, 'ready');
      try { persistShift(); } catch (_) {}
      toast(`Commande ${ticketNo(o)} prête · client notifié`);
    }

    function vrapHandover(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || o.pickedUp) return;
      if (o.status !== 'ready') {
        o.items.forEach(i => { i.stationReady = true; });
        o.status = 'ready';
        o.readyAt = kdsNowHM();
      }
      o.pickedUp = true;
      o.pickedUpTs = Date.now();
      o.pickedUpAt = vrapHandoverTime(o.pickedUpTs);
      renderVrapBoard();
      /* Remise en main propre : c'est le point final. Le téléphone bascule sur
         le remerciement et ne peut plus commander · pour un retrait au
         comptoir, il n'y a pas d'addition à encaisser plus tard qui viendrait
         fermer la session à sa place. */
      opPush(o, 'served');
      /* La remise est un état persisté (`kdsOrders` part dans le blob de
         service) : sans écriture ici, un F5 dans les secondes qui suivent
         ressuscitait une commande déjà donnée au client, prête à être remise
         une seconde fois. L'autosave l'aurait rattrapée · dans cinq secondes.
         Tous les autres points finaux écrivent tout de suite ; celui-ci aussi. */
      try { persistShift(); } catch (_) {}
      toast(`Commande ${ticketNo(o)} remise au client`);
    }

    function vrapArchivePaid(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || !o.opId || !o.paid || o.pickedUp) return;
      const label = ticketNo(o);
      if (!window.confirm((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr(`Retirer ${label} du suivi à emporter ?\n\nLa vente et le paiement restent enregistrés. Cette action ne signifie PAS « remise au client ». Elle ne crée aucune transaction aujourd'hui.`))) return;
      window.KiwiAuthAct?.({ kind: 'untrack_order', key: 'act.untrack_order', args: { order: label } });
      requireTillOperator(`Retirer ${label} du suivi`, (who) => {
        Promise.resolve(opPush(o, 'archived', { actorProof: who && who.actorProof || '' })).then((result) => {
          if (!result || !result.ok) { toast(`Impossible de retirer ${label} · réessayez`); return; }
          rememberArchivedTakeaway(o.opId);
          // The inbox bridge also retires this ticket. Repeat safely if an old
          // inbox version has not learned the new terminal state yet.
          retireRejectedKitchenTicket(o);
          if (vrapSelectedPaidNum === num) vrapSelectedPaidNum = null;
          updateKdsCount();
          if (kdsEl.classList.contains('is-open')) kdsPaint();
          renderVrapBoard();
          toast(`${label} retirée du suivi · vente conservée`);
        });
      }, /* Retirer du suivi est une écriture serveur sans file d'attente : hors
            connexion, pas de code (« connexion requise · rien n'a changé »). */
      TILL_NEEDS_SERVER);
    }

    function archivedTakeawaySet() {
      const merchant = currentMerchantSlug();
      if (merchant !== archivedTakeawayScope) {
        archivedTakeawayScope = merchant;
        try {
          const saved = JSON.parse(localStorage.getItem('kiwi-archived-takeaways:' + merchant) || '[]');
          archivedTakeawayIds = new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string').slice(-1000) : []);
        } catch (_) { archivedTakeawayIds = new Set(); }
      }
      return archivedTakeawayIds;
    }

    function rememberArchivedTakeaway(id) {
      if (!id || !currentMerchantSlug()) return;
      const ids = archivedTakeawaySet();
      ids.add(String(id));
      try { localStorage.setItem('kiwi-archived-takeaways:' + archivedTakeawayScope,
        JSON.stringify(Array.from(ids).slice(-1000))); } catch (_) {}
    }
