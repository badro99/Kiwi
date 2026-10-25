/* Owner: caisse order review and pre-bill.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */


    /* ---------- Full Order Review Modal ---------- */
    function openOrderReviewModal() {
      const modal = $('#order-review-modal');
      if (!modal) return;
      renderOrderReviewContent();
      modal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
    }

    function closeOrderReviewModal() {
      const modal = $('#order-review-modal');
      if (modal) modal.classList.remove('is-open');
    }

    function renderOrderReviewContent() {
      const isVrap = mode === 'vrap';
      const order = isVrap ? cart : (tableOrders[selectedId] || []);
      const t = (!isVrap && selectedId) ? tables[selectedId] : null;
      const gross = order.reduce((s, l) => s + l.price * l.qty, 0);
      const itemCount = order.reduce((s, l) => s + l.qty, 0);
      const discAmt = isVrap ? vrapDiscountAmount(gross) : 0;
      const net = Math.max(0, gross - discAmt);
      const editing = isVrap && vrapEditingNum != null;

      // Badges & Titles
      const badge = $('#or-modal-badge');
      if (badge) badge.textContent = isVrap ? (editing ? `Vente #${vrapEditingNum}` : 'À emporter') : `Table ${selectedId}`;
      const title = $('#or-modal-title');
      if (title) title.textContent = isVrap ? (editing ? `Commande #${vrapEditingNum}` : 'Vente à emporter') : (t ? `Table ${selectedId} · ${t.covers} couvert${t.covers > 1 ? 's' : ''}` : 'Commande');
      const sub = $('#or-modal-sub');
      if (sub) sub.textContent = `${itemCount} article${itemCount > 1 ? 's' : ''} · ${fmtMAD(net)}`;

      const list = $('#or-items-list');
      if (!list) return;

      if (!order.length) {
        list.innerHTML = `
          <div style="text-align:center; padding:36px 16px; color:var(--ink-3);">
            <i data-lucide="shopping-cart" style="width:36px;height:36px;margin:0 auto 10px;display:block;opacity:0.6;"></i>
            <p style="margin:0; font-size:14px; font-weight:600;">Aucun article dans cette commande</p>
          </div>`;
      } else {
        list.innerHTML = order.map((l) => {
          const optList = (l.opts && l.opts.length) ? l.opts : [];
          const optPills = optList.map(o => {
            const extra = Number(o.price || o.extra || 0);
            return `<span class="or-opt-pill">${kdsEsc(o.name || o.label || o)}${extra > 0 ? ` (+${fmtMAD(extra)})` : ''}</span>`;
          }).join('');

          return `
            <div class="or-item-card" data-review-uid="${l.uid}">
              <div class="or-item-stepper-col">
                ${l.kind === 'formula-part' ? `
                  <span class="or-item-sent-badge">Inclus</span>
                ` : l.sent ? `
                  <span class="or-item-sent-badge">
                    ${KDS_SVG.check} En cuisine
                  </span>
                ` : `
                  <div class="or-item-stepper">
                    <button class="or-stepper-btn" data-review-action="dec" aria-label="Moins">−</button>
                    <span class="or-stepper-num mono">${l.qty}</span>
                    <button class="or-stepper-btn" data-review-action="inc" aria-label="Plus">+</button>
                  </div>
                `}
              </div>
              <div class="or-item-content">
                <div class="or-item-title">${kdsEsc(l.name)}${lineHeld(l, order) ? ' <span class="rp-hold-mark">À suivre</span>' : ''}</div>
                ${optPills ? `<div class="or-item-opts-row">${optPills}</div>` : ''}
                <div class="or-item-note-box">
                  <input class="or-note-input" data-review-note-uid="${l.uid}"
                    value="${kdsEsc(l.note || '')}" placeholder="Note cuisine, ex. bien chaud, sans oignon…"
                    aria-label="Note cuisine, ${kdsEsc(l.name)}" />
                </div>
              </div>
              <div class="or-item-price mono">${fmtMAD(l.price * l.qty)}</div>
              <div class="or-item-actions">
                ${l.sent && l.kind !== 'formula-part' ? `
                  <button class="or-item-del-btn or-item-void-btn" data-review-action="void"
                    title="Annuler un article envoyé en cuisine"
                    aria-label="Annuler un ${kdsEsc(l.name)} envoyé en cuisine">
                    <i data-lucide="trash-2"></i>
                  </button>
                ` : ''}
                ${!l.sent && l.kind === 'formula' ? `
                  <button class="or-item-edit-btn" data-review-action="edit-formula" aria-label="Modifier la formule">
                    Modifier
                  </button>
                ` : ''}
                ${l.sent || l.kind === 'formula-part' ? '' : `
                  <button class="or-item-del-btn" data-review-action="del" title="Supprimer la ligne" aria-label="Supprimer">
                    <i data-lucide="trash-2"></i>
                  </button>
                `}
              </div>
            </div>`;
        }).join('');
      }

      // Summary lines
      const subtotalEl = $('#or-subtotal');
      if (subtotalEl) subtotalEl.textContent = fmtMAD(gross);
      const discRow = $('#or-discount-row');
      if (discRow) {
        discRow.hidden = discAmt <= 0;
        if (discAmt > 0) {
          const discValEl = $('#or-discount-val');
          if (discValEl) discValEl.textContent = `−${fmtMAD(discAmt)}`;
          const discLblEl = $('#or-discount-lbl');
          if (discLblEl) discLblEl.textContent = vrapDiscount && vrapDiscount.kind === 'pct' ? `Remise ${vrapDiscount.value} %` : 'Remise';
        }
      }
      const totalEl = $('#or-total');
      if (totalEl) totalEl.textContent = fmtMAD(net);

      // Foot buttons
      const btnKitchen = $('#or-btn-kitchen');
      if (btnKitchen) {
        const hasUnsent = isVrap ? !editing : order.some(l => !l.sent);
        btnKitchen.hidden = !hasUnsent || order.length === 0;
      }
      const payLabel = $('#or-pay-label');
      if (payLabel) payLabel.textContent = `Encaisser ${fmtMAD(net)}`;

      if (window.lucide) lucide.createIcons();
    }

    
