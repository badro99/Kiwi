/* Boutique en ligne (Kiwi Commerce): the online shop's orders, and which
 * pieces the shop shows.
 *
 * Orders arrive from the storefront through /api/shop/orders and wait here.
 * « Confirmer » makes them an ordinary delivery sale (/api/shop/decide): they
 * then live in Livraisons, with Ozon, like a delivery rung up at the till.
 * « Articles en ligne » is the switch the storefront reads: a piece switched
 * off here disappears from the shop at the next catalogue publish.
 *
 * Lazy section (assets/pages-pro.js › LAZY_SECTIONS): every handler listed
 * there is registered below, no more, no less. */
(() => {
  'use strict';
  if (!window.Kiwi) return;
  const { toast, modal, handlers } = window.Kiwi;
  const L = (fr, en, ar) => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mad = (cents) => (window.KiwiNumber?.format((Number(cents) || 0) / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ?? ((Number(cents) || 0) / 100).toFixed(2)) + ' MAD';
  const when = (ts) => {
    try { return new Date(ts).toLocaleString(document.documentElement.lang || 'fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  };
  const slug = () => { try { return window.KiwiCloudDoc?.currentSlug?.() || ''; } catch (_) { return ''; } };
  const CAT = () => window.KiwiBoutiqueCatalog || null;

  const state = { tab: 'orders', filter: 'pending', orders: [], enabled: true, loaded: false, error: '', query: '', sig: '', token: '' };
  let poll = 0;

  const STATUS = {
    pending: () => L('À confirmer', 'To confirm', 'بانتظار التأكيد'),
    confirming: () => L('En cours', 'In progress', 'قيد المعالجة'),
    confirmed: () => L('Confirmée', 'Confirmed', 'مؤكَّد'),
    declined: () => L('Refusée', 'Declined', 'مرفوض'),
  };

  function css() {
    if (document.getElementById('wo-css')) return;
    const s = document.createElement('style');
    s.id = 'wo-css';
    s.textContent = `
.wo-page{display:grid;gap:18px}
.wo-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.wo-seg{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:var(--surface-2,rgba(10,15,13,.05))}
.wo-seg button{border:0;background:transparent;font:inherit;font-weight:600;font-size:13px;padding:8px 14px;border-radius:999px;color:var(--ink-2,#3a4440);cursor:pointer;min-height:36px}
.wo-seg button.on{background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);box-shadow:0 1px 2px rgba(10,15,13,.12)}
.wo-list{display:grid;gap:12px}
.wo-card{border:1px solid var(--line,rgba(10,15,13,.12));border-radius:16px;padding:16px 18px;background:var(--paper,#F7F5F0);display:grid;gap:10px}
.wo-head{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline;justify-content:space-between}
.wo-num{font-weight:700;font-size:15px;font-variant-numeric:tabular-nums}
.wo-meta{color:var(--ink-3,#667);font-size:12px}
.wo-pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:var(--surface-2,rgba(10,15,13,.06));color:var(--ink-2,#3a4440)}
.wo-pill.pending{background:rgba(183,121,31,.14);color:#8a5a12}
.wo-pill.confirmed{background:rgba(11,110,79,.12);color:var(--atlas,#0B6E4F)}
.wo-who{display:grid;gap:2px;font-size:13px;line-height:1.45}
.wo-who b{font-size:14px}
.wo-lines{display:grid;gap:4px;font-size:13px;border-top:1px dashed var(--line,rgba(10,15,13,.14));padding-top:10px}
.wo-line{display:flex;justify-content:space-between;gap:12px}
.wo-tot{display:flex;justify-content:space-between;font-weight:700;font-size:14px;font-variant-numeric:tabular-nums}
.wo-acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.wo-note{font-size:13px;color:var(--ink-2,#3a4440);line-height:1.5;max-width:68ch}
.wo-prod{display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid var(--line,rgba(10,15,13,.08))}
.wo-prod img,.wo-prod .wo-thumb{width:44px;height:56px;border-radius:8px;object-fit:cover;background:var(--surface-2,rgba(10,15,13,.06));flex:0 0 auto}
.wo-prod .wo-pn{flex:1;min-width:0;font-size:14px}
.wo-prod .wo-pn small{display:block;color:var(--ink-3,#667);font-size:12px}
.wo-switch{display:inline-flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;min-height:44px}
.wo-switch input{width:20px;height:20px;accent-color:var(--atlas,#0B6E4F)}
.wo-search{min-height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.16));font:inherit;min-width:220px;background:var(--paper,#F7F5F0)}
.wo-token{font-family:var(--mono-code,'JetBrains Mono',monospace);font-size:12px;word-break:break-all;padding:10px 12px;border-radius:10px;background:var(--surface-2,rgba(10,15,13,.05))}
`;
    document.head.appendChild(s);
  }

  async function load() {
    const m = slug();
    try {
      const r = await fetch('/api/shop/orders?merchant=' + encodeURIComponent(m) + '&status=all', { credentials: 'same-origin' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || String(r.status));
      state.orders = Array.isArray(j.orders) ? j.orders : [];
      state.enabled = j.enabled !== false;
      state.error = '';
    } catch (e) {
      state.error = String(e && e.message || e);
    }
    state.loaded = true;
  }

  function counts() {
    const c = { pending: 0, confirmed: 0, declined: 0, pendingCents: 0 };
    state.orders.forEach((o) => {
      if (o.status === 'pending' || o.status === 'confirming') { c.pending++; c.pendingCents += o.totalCents; }
      else if (o.status === 'confirmed') c.confirmed++;
      else if (o.status === 'declined') c.declined++;
    });
    return c;
  }

  function orderCard(o) {
    const c = o.customer || {};
    const lines = (o.lines || []).map((l) => `<div class="wo-line"><span>${esc(l.quantity)} × ${esc(l.title)}${l.size && l.size !== 'TU' ? ' · ' + esc(l.size) : ''}${l.color ? ' · ' + esc(l.color) : ''}</span><span>${esc(mad(l.unitCents * l.quantity))}</span></div>`).join('');
    const extra = [
      o.discountCents ? `<div class="wo-line"><span>${esc(L('Remise', 'Discount', 'خصم'))}</span><span>−${esc(mad(o.discountCents))}</span></div>` : '',
      o.deliveryCents ? `<div class="wo-line"><span>${esc(L('Livraison', 'Delivery', 'التوصيل'))}</span><span>${esc(mad(o.deliveryCents))}</span></div>` : '',
    ].join('');
    const open = o.status === 'pending';
    const why = o.status === 'declined' && o.reason ? `<div class="wo-meta">${esc(L('Motif', 'Reason', 'السبب'))} : ${esc(o.reason)}</div>` : '';
    return `<article class="wo-card" data-wo-id="${esc(o.id)}">
      <div class="wo-head"><span class="wo-num">${esc(o.number)}</span><span class="wo-pill ${esc(o.status)}">${esc((STATUS[o.status] || STATUS.pending)())}</span><span class="wo-meta">${esc(when(o.createdTs))}</span></div>
      <div class="wo-who"><b>${esc(c.name)}</b><span>${esc(c.phone)} · ${esc(c.city)}</span><span>${esc(c.address)}</span>${c.note ? `<span class="wo-meta">${esc(c.note)}</span>` : ''}</div>
      <div class="wo-lines">${lines}${extra}<div class="wo-tot"><span>${esc(L('À encaisser à la livraison', 'To collect on delivery', 'المبلغ عند التسليم'))}</span><span>${esc(mad(o.totalCents))}</span></div></div>
      ${why}
      ${open ? `<div class="wo-acts"><button class="kb ghost" data-action="wo-decline" data-arg="${esc(o.id)}">${esc(L('Refuser', 'Decline', 'رفض'))}</button><button data-activation=write class="kb atlas" data-action="wo-confirm" data-arg="${esc(o.id)}">${esc(L('Confirmer la livraison', 'Confirm delivery', 'تأكيد التوصيل'))}</button></div>` : ''}
    </article>`;
  }

  function ordersBody() {
    if (state.error) {
      return `<p class="wo-note">${esc(L('Les commandes n’ont pas pu être lues. Vérifiez la connexion puis actualisez.', 'Orders could not be read. Check the connection, then refresh.', 'تعذّر قراءة الطلبات. تحقّق من الاتصال ثم حدّث.'))}</p>`;
    }
    const pick = state.orders.filter((o) => state.filter === 'pending' ? (o.status === 'pending' || o.status === 'confirming') : o.status === state.filter);
    if (!pick.length) {
      const empty = state.filter === 'pending'
        ? L('Aucune commande à confirmer. Les nouvelles commandes de la boutique en ligne arrivent ici.', 'No orders to confirm. New orders from the online shop land here.', 'لا توجد طلبات للتأكيد. تصل هنا الطلبات الجديدة من المتجر الإلكتروني.')
        : L('Rien dans cette liste pour le moment.', 'Nothing in this list yet.', 'لا شيء في هذه القائمة بعد.');
      return `<div class="kx-empty"><p>${esc(empty)}</p></div>`;
    }
    return `<div class="wo-list">${pick.map(orderCard).join('')}</div>`;
  }

  function productsBody() {
    const C = CAT();
    if (!C || !C.listProducts) return `<p class="wo-note">${esc(L('Le catalogue de la boutique n’est pas encore chargé.', 'The shop catalogue is not loaded yet.', 'لم يتم تحميل كتالوج المتجر بعد.'))}</p>`;
    const q = state.query.trim().toLowerCase();
    const list = (C.listProducts({ includeArchived: false }) || []).filter((p) => !q || String(p.name || '').toLowerCase().includes(q));
    const on = list.filter((p) => p.online !== false).length;
    const rows = list.map((p) => `<div class="wo-prod">
        ${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : '<span class="wo-thumb" aria-hidden="true"></span>'}
        <div class="wo-pn">${esc(p.name)}<small>${esc(mad(Math.round((Number(p.priceMAD) || 0) * 100)))}${p.photo ? '' : ' · ' + esc(L('sans photo', 'no photo', 'بدون صورة'))}</small></div>
        <label class="wo-switch"><input type="checkbox" data-action="wo-online" data-arg="${esc(p.id)}" ${p.online !== false ? 'checked' : ''}><span>${esc(L('En ligne', 'Online', 'متاح'))}</span></label>
      </div>`).join('');
    return `<p class="wo-note">${esc(L('Décochez une pièce pour la retirer de la boutique en ligne. Elle reste en vente au comptoir. Une photo ajoutée à la fiche article apparaît aussi sur la boutique.', 'Untick a piece to take it off the online shop. It stays on sale at the counter. A photo added to the product sheet also shows on the shop.', 'ألغِ تحديد قطعة لإزالتها من المتجر الإلكتروني. تبقى معروضة للبيع في المحل. تظهر الصورة المضافة إلى بطاقة المنتج في المتجر أيضًا.'))}</p>
      <div class="wo-bar"><input class="wo-search" type="search" data-wo-search value="${esc(state.query)}" placeholder="${esc(L('Chercher une pièce', 'Search a piece', 'ابحث عن قطعة'))}" aria-label="${esc(L('Chercher une pièce', 'Search a piece', 'ابحث عن قطعة'))}"><span class="wo-meta">${esc(on)} / ${esc(list.length)} ${esc(L('en ligne', 'online', 'متاحة'))}</span></div>
      <div>${rows || `<div class="kx-empty"><p>${esc(L('Aucune pièce ne correspond.', 'No piece matches.', 'لا توجد قطعة مطابقة.'))}</p></div>`}</div>
      <div class="wo-card"><b>${esc(L('Relier la boutique en ligne', 'Connect the online shop', 'ربط المتجر الإلكتروني'))}</b>
        <p class="wo-note">${esc(L('La boutique en ligne a besoin d’une clé pour déposer ses commandes ici. Créez-la une fois et transmettez-la à l’équipe Kiwi.', 'The online shop needs a key to send its orders here. Create it once and pass it to the Kiwi team.', 'يحتاج المتجر الإلكتروني إلى مفتاح لإرسال طلباته هنا. أنشئه مرة واحدة وسلّمه لفريق Kiwi.'))}</p>
        ${state.token ? `<div class="wo-token" data-wo-token>${esc(state.token)}</div><p class="wo-meta">${esc(L('Cette clé ne sera plus affichée. Copiez-la maintenant.', 'This key will not be shown again. Copy it now.', 'لن يظهر هذا المفتاح مرة أخرى. انسخه الآن.'))}</p>`
          : `<div class="wo-acts" style="justify-content:flex-start"><button class="kb ghost" data-action="wo-connect">${esc(L('Créer la clé', 'Create the key', 'إنشاء المفتاح'))}</button></div>`}
      </div>`;
  }

  function render() {
    css();
    const c = counts();
    const seg = (key, label, n) => `<button type="button" data-lens-item class="${state.filter === key ? 'on' : ''}" data-action="wo-filter" data-arg="${key}" aria-pressed="${state.filter === key}">${esc(label)}${n != null ? ' (' + esc(n) + ')' : ''}</button>`;
    const tab = (key, label) => `<button type="button" data-lens-item class="${state.tab === key ? 'on' : ''}" data-action="wo-tab" data-arg="${key}" aria-pressed="${state.tab === key}">${esc(label)}</button>`;
    const off = state.loaded && !state.enabled
      ? `<p class="wo-note">${esc(L('La boutique en ligne n’est pas activée pour ce magasin. Elle n’accepte aucune commande tant que Kiwi ne l’a pas activée.', 'The online shop is not switched on for this store. It accepts no orders until Kiwi switches it on.', 'المتجر الإلكتروني غير مفعّل لهذا المحل. لا يقبل أي طلب حتى تقوم Kiwi بتفعيله.'))}</p>` : '';
    window.Kiwi.appPage('weborders', {
      title: L('Boutique en ligne', 'Online shop', 'المتجر الإلكتروني'),
      subtitle: L('Commandes à livrer, paiement à la livraison', 'Orders to deliver, cash on delivery', 'طلبات للتوصيل، الدفع عند الاستلام'),
      body: `<div class="wo-page" data-wo-page>
        <div class="kx-kpi-strip">
          <div class="kx-kpi"><div class="l">${esc(L('À confirmer', 'To confirm', 'بانتظار التأكيد'))}</div><div class="v">${esc(c.pending)}</div><div class="d">${esc(mad(c.pendingCents))}</div></div>
          <div class="kx-kpi"><div class="l">${esc(L('Confirmées', 'Confirmed', 'مؤكَّدة'))}</div><div class="v">${esc(c.confirmed)}</div><div class="d">${esc(L('Passées en livraison', 'Moved to deliveries', 'انتقلت إلى التوصيل'))}</div></div>
          <div class="kx-kpi"><div class="l">${esc(L('Refusées', 'Declined', 'مرفوضة'))}</div><div class="v">${esc(c.declined)}</div><div class="d">${esc(L('200 dernières commandes', 'Last 200 orders', 'آخر 200 طلب'))}</div></div>
        </div>
        ${off}
        <div class="wo-bar"><div class="wo-seg" data-lens-demo>${tab('orders', L('Commandes', 'Orders', 'الطلبات'))}${tab('products', L('Articles en ligne', 'Pieces online', 'القطع المعروضة'))}</div>
          ${state.tab === 'orders' ? `<button class="kb ghost" data-action="wo-refresh">${esc(L('Actualiser', 'Refresh', 'تحديث'))}</button>` : ''}</div>
        ${state.tab === 'orders' ? `<div class="wo-seg" data-lens-demo>${seg('pending', L('À confirmer', 'To confirm', 'بانتظار التأكيد'), c.pending)}${seg('confirmed', L('Confirmées', 'Confirmed', 'مؤكَّدة'), c.confirmed)}${seg('declined', L('Refusées', 'Declined', 'مرفوضة'), c.declined)}</div>${ordersBody()}` : productsBody()}
      </div>`,
    });
    const search = document.querySelector('[data-wo-search]');
    if (search) search.addEventListener('input', () => {
      state.query = search.value;
      const at = search.selectionStart;
      render();
      const again = document.querySelector('[data-wo-search]');
      if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch (_) {} }
    });
    state.sig = JSON.stringify(state.orders.map((o) => [o.id, o.status]));
  }

  /* Re-read every 30 s while the page is on screen. The page is only redrawn
     when an order changed, never under an open dialog, never while typing. */
  function startPoll() {
    clearInterval(poll);
    poll = setInterval(async () => {
      if (!document.querySelector('[data-wo-page]')) { clearInterval(poll); return; }
      if (document.hidden || document.querySelector('.kiwi-backdrop') || state.tab !== 'orders') return;
      const before = state.sig;
      await load();
      if (JSON.stringify(state.orders.map((o) => [o.id, o.status])) !== before) render();
    }, 30000);
  }

  async function decide(id, action, extra) {
    const r = await fetch('/api/shop/decide', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ merchant: slug(), id, action }, extra || {})),
    });
    const j = await r.json().catch(() => null);
    return { status: r.status, j: j || {} };
  }

  handlers['nav-weborders'] = async () => {
    state.loaded = false;
    render();
    await load();
    render();
    startPoll();
  };
  handlers['wo-tab'] = (el, arg) => { state.tab = (typeof el === 'string' ? el : arg) === 'products' ? 'products' : 'orders'; render(); };
  handlers['wo-filter'] = (el, arg) => { const k = typeof el === 'string' ? el : arg; state.filter = ['pending', 'confirmed', 'declined'].includes(k) ? k : 'pending'; render(); };
  handlers['wo-refresh'] = async () => { await load(); render(); };

  handlers['wo-confirm'] = async (el, arg) => {
    const id = typeof el === 'string' ? el : arg;
    const btn = el && el.closest ? el : null;
    if (btn) btn.disabled = true;
    let out = await decide(id, 'confirm');
    if (out.status === 409 && out.j.error === 'short') {
      const list = (out.j.short || []).map((s) => `<li>${esc(s.title)}${s.size ? ' · ' + esc(s.size) : ''} : ${esc(s.inStock)} ${esc(L('en stock', 'in stock', 'في المخزون'))}, ${esc(s.wanted)} ${esc(L('demandé(s)', 'ordered', 'مطلوب'))}</li>`).join('');
      const go = await new Promise((resolve) => {
        const m = modal({
          title: L('Stock insuffisant', 'Not enough stock', 'المخزون غير كافٍ'),
          body: `<p class="wo-note">${esc(L('Kiwi ne compte pas assez de pièces pour cette commande :', 'Kiwi does not count enough pieces for this order:', 'لا يحسب Kiwi قطعًا كافية لهذا الطلب:'))}</p><ul>${list}</ul><p class="wo-note">${esc(L('Confirmez seulement si vous avez bien la pièce en boutique.', 'Confirm only if you really have the piece in the shop.', 'أكّد فقط إذا كانت القطعة متوفرة فعلًا في المحل.'))}</p>`,
          foot: `<button class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button class="kb atlas" data-wo-force>${esc(L('Confirmer quand même', 'Confirm anyway', 'تأكيد على أي حال'))}</button>`,
        });
        if (!m || !m.el) { resolve(false); return; }
        m.el.addEventListener('click', (e) => {
          if (e.target.closest('[data-wo-force]')) { resolve(true); try { m.close(); } catch (_) {} }
          else if (e.target === m.el || e.target.closest('[data-dismiss], .kiwi-modal-close')) resolve(false);
        });
        const onKey = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); resolve(false); } };
        document.addEventListener('keydown', onKey);
      });
      if (!go) { if (btn) btn.disabled = false; return; }
      out = await decide(id, 'confirm', { force: true });
    }
    if (out.status === 200 && out.j.ok) {
      toast(L('Commande confirmée', 'Order confirmed', 'تم تأكيد الطلب'), { type: 'success', desc: L('Elle est maintenant dans Livraisons.', 'It is now in Deliveries.', 'أصبح الآن ضمن التوصيلات.') });
    } else if (out.status === 409) {
      toast(L('Cette commande a déjà été traitée', 'This order was already handled', 'تمت معالجة هذا الطلب من قبل'), { type: 'error' });
    } else {
      toast(L('Confirmation impossible', 'Could not confirm', 'تعذّر التأكيد'), { type: 'error', desc: L('Rien n’a été enregistré. Réessayez dans un instant.', 'Nothing was recorded. Try again in a moment.', 'لم يُسجَّل شيء. أعد المحاولة بعد قليل.') });
    }
    await load(); render();
  };

  handlers['wo-decline'] = (el, arg) => {
    const id = typeof el === 'string' ? el : arg;
    const m = modal({
      title: L('Refuser la commande', 'Decline the order', 'رفض الطلب'),
      body: `<label class="wo-note" for="wo-reason">${esc(L('Motif (facultatif), gardé dans l’historique', 'Reason (optional), kept in the history', 'السبب (اختياري)، يُحفظ في السجل'))}</label><input id="wo-reason" class="wo-search" style="width:100%;margin-top:8px" maxlength="200" data-wo-reason>`,
      foot: `<button class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button class="kb atlas" data-wo-decline-go>${esc(L('Refuser', 'Decline', 'رفض'))}</button>`,
    });
    const go = m && m.el && m.el.querySelector('[data-wo-decline-go]');
    if (!go) return;
    go.addEventListener('click', async () => {
      go.disabled = true;
      const reason = (m.el.querySelector('[data-wo-reason]') || {}).value || '';
      const out = await decide(id, 'decline', { reason });
      try { m.close(); } catch (_) {}
      if (out.status === 200 && out.j.ok) toast(L('Commande refusée', 'Order declined', 'تم رفض الطلب'), { type: 'success' });
      else toast(L('Cette commande a déjà été traitée', 'This order was already handled', 'تمت معالجة هذا الطلب من قبل'), { type: 'error' });
      await load(); render();
    });
  };

  handlers['wo-online'] = (el, arg) => {
    const id = typeof el === 'string' ? el : arg;
    const C = CAT();
    if (!C || !C.updateProduct || !C.listProducts) return;
    /* The click router cancels the native toggle (preventDefault), so the
       new value comes from the catalogue, not from the checkbox. */
    const p = (C.listProducts({ includeArchived: false }) || []).find((x) => x.id === id);
    if (!p) return;
    const next = p.online === false;
    C.updateProduct(id, { online: next });
    toast(next ? L('Pièce en ligne', 'Piece online', 'القطعة معروضة') : L('Pièce retirée de la boutique en ligne', 'Piece taken off the online shop', 'أُزيلت القطعة من المتجر الإلكتروني'), { type: 'success' });
    render();
  };

  handlers['wo-connect'] = async () => {
    try {
      const r = await fetch('/api/channel/keys', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant: slug(), channel: 'storefront', label: L('Boutique en ligne', 'Online shop', 'المتجر الإلكتروني') }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.token) throw new Error((j && j.error) || String(r.status));
      state.token = j.token;
      render();
    } catch (e) {
      toast(L('Clé non créée', 'Key not created', 'لم يُنشأ المفتاح'), { type: 'error', desc: String(e && e.message) === 'too-many-keys' ? L('Ce magasin a déjà trop de clés. Supprimez-en une dans Intégrations.', 'This store already has too many keys. Remove one in Integrations.', 'لدى هذا المحل مفاتيح كثيرة. احذف واحدًا من التكاملات.') : L('Réessayez dans un instant.', 'Try again in a moment.', 'أعد المحاولة بعد قليل.') });
    }
  };
})();
