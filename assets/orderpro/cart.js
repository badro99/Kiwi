/* OrderPro cart. Exports: lineKey, totals, refreshCartUI, addLineToCart, decFromCart, incFromCart, openCart, closeCart.
 * Reads/writes only the declared live scope below; browser capabilities are checked by orderpro-boundary-test.
 * Classic lexical adapter intentionally preserves original function bodies, including assignments. */
KiwiOrderMenu.orderProParts.define('cart', ["$","cart","describeOptions","escapeHtml","money","nameOf","showToast","t"], function (scope) {
  with (scope) {
    function lineKey(id, options, note) {
      const parts = [id];
      const keys = Object.keys(options || {}).sort();
      for (const k of keys) {
        const v = options[k];
        if (Array.isArray(v)) {
          if (v.length) parts.push(`${k}=${v.slice().sort().join('+')}`);
        } else if (v != null && v !== '') {
          parts.push(`${k}=${v}`);
        }
      }
      if (note) parts.push(`note=${note}`);
      return parts.join('|');
    }

    function totals() {
      let count = 0, total = 0;
      cart.forEach(line => {
        count += line.qty;
        total += line.qty * line.unitPrice;
      });
      return { count, total };
    }

    function refreshCartUI() {
      const { count, total } = totals();
      const pill = $('#cart-pill');
      $('#cart-count').textContent = count;
      $('#cart-total').textContent = `${money(total)}`;
      $('#cart-grand').textContent = `${money(total)}`;
      pill.classList.toggle('is-visible', count > 0);
      /* Closed hours or no Order Pro: the button says so before the server would. */
      const gate = !!(globalThis.KiwiOrderMenu && KiwiOrderMenu.blocked());
      $('#send-btn').disabled = count === 0 || gate;
      if (gate) $('#send-btn').setAttribute('title', t('closed_why')); else $('#send-btn').removeAttribute('title');

      const itemsEl = $('#cart-items');
      if (count === 0) {
        itemsEl.innerHTML = `<li class="cart-empty">${t('cart_empty')}</li>`;
        return;
      }
      itemsEl.innerHTML = [...cart.entries()].map(([key, line]) => {
        const safe = encodeURIComponent(key);
        const opts = describeOptions(line);
        const note = line.note ? `<div class="cart-item-note">${escapeHtml(line.note)}</div>` : '';
        return `
          <li class="cart-row">
            <div class="info">
              <span class="label">${escapeHtml(nameOf(line.id))}</span>
              ${opts ? `<div class="cart-item-opts">${escapeHtml(opts)}</div>` : ''}
              ${note}
            </div>
            <span class="qty">
              <button type="button" data-dec="${safe}" aria-label="−">−</button>
              <span>${line.qty}</span>
              <button type="button" data-inc="${safe}" aria-label="+">+</button>
            </span>
            <span class="row-price">${money(line.qty * line.unitPrice)}</span>
          </li>
        `;
      }).join('');
    }

    function addLineToCart(line) {
      if (globalThis.KiwiOrderMenu && !KiwiOrderMenu.ordering()) return;
      const key = lineKey(line.id, line.options, line.note);
      const addQty = Math.max(1, Number(line && line.qty) || 1);
      if (cart.has(key)) {
        cart.get(key).qty += addQty;
      } else {
        cart.set(key, { ...line, qty: addQty });
      }
      refreshCartUI();
      showToast(`${nameOf(line.id)} · ${t('toast_added')}`);
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.onAdded(line);
    }

    function decFromCart(key) {
      if (!cart.has(key)) return;
      const line = cart.get(key);
      line.qty -= 1;
      if (line.qty <= 0) cart.delete(key);
      refreshCartUI();
    }

    function incFromCart(key) {
      if (!cart.has(key)) return;
      cart.get(key).qty += 1;
      refreshCartUI();
    }

    function openCart() {
      $('#cart-sheet').classList.add('is-open');
      $('#cart-sheet').setAttribute('aria-hidden', 'false');
    }

    function closeCart() {
      $('#cart-sheet').classList.remove('is-open');
      $('#cart-sheet').setAttribute('aria-hidden', 'true');
    }


    return Object.freeze({ lineKey, totals, refreshCartUI, addLineToCart, decFromCart, incFromCart, openCart, closeCart });
  }
});
