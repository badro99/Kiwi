/* Menu modifiers. Exports: optsModal.
 * Reads injected: store, optsOf, optById, tr, T, esc, venueName, PLUS, TRASH, OPT_EMOJIS, cleanOptEmoji, addOptGroup, updateOptGroup, deleteOptGroup, addOptChoice, updateOptChoice, deleteOptChoice, confirmThen, render. Window reads are declared in split.json. */
(function (parts) {
  parts.modifiers = function (context) {
    'use strict';
    const { store, optsOf, optById, tr, T, esc, venueName, PLUS, TRASH, OPT_EMOJIS, cleanOptEmoji, addOptGroup, updateOptGroup, deleteOptGroup, addOptChoice, updateOptChoice, deleteOptChoice, confirmThen, render } = context;
  function optsModal() {
    const K = window.Kiwi;
    const m = K.modal({
      tag: venueName(),
      title: tr(T.opts),
      width: 560,
      body: '<div data-og-body></div>',
      foot: `<button class="kb ghost" type="button" data-og-close style="flex:1;justify-content:center;">${esc(tr(T.close))}</button>`,
    });
    const body = m.el.querySelector('[data-og-body]');

    function paint(focusSel) {
      const list = optsOf(store.get());
      const cards = list.map((g) => {
        const choices = (g.choices || []).map((c) => {
          const emoji = cleanOptEmoji(c.emoji);
          return `
          <div class="mx-og-ch" data-oc="${esc(c.id)}">
            <div class="mx-og-emoji-wrap">
              <button class="mx-og-emoji ${emoji ? '' : 'empty'}" type="button"
                      data-oc-emoji-open="${esc(g.id)}::${esc(c.id)}" aria-expanded="false"
                      aria-label="${esc(tr(T.optChEmoji))}" title="${esc(tr(T.optChEmoji))}">${emoji ? esc(emoji) : '+'}</button>
              <div class="mx-og-emoji-picker" data-oc-emoji-picker="${esc(g.id)}::${esc(c.id)}" hidden>
                <div class="mx-og-emoji-grid">
                  ${OPT_EMOJIS.map((icon) => `<button class="mx-og-emoji-pick" type="button" data-oc-emoji-pick="${esc(g.id)}::${esc(c.id)}" data-emoji="${esc(icon)}" aria-label="${esc(icon)}">${esc(icon)}</button>`).join('')}
                </div>
                <button class="mx-og-emoji-clear" type="button" data-oc-emoji-pick="${esc(g.id)}::${esc(c.id)}" data-emoji="">${esc(tr(T.optEmojiNone))}</button>
              </div>
            </div>
            <input type="text" value="${esc(c.name)}" data-oc-name="${esc(g.id)}::${esc(c.id)}" aria-label="${esc(tr(T.optChNm))}" />
            <div class="pr">
              <input type="number" min="0" step="1" value="${c.price ? esc(c.price) : ''}" placeholder="0"
                     data-oc-price="${esc(g.id)}::${esc(c.id)}" aria-label="${esc(tr(T.optChPr))}" />
              <span>MAD</span>
            </div>
            <button type="button" class="del" data-oc-del="${esc(g.id)}::${esc(c.id)}" title="${esc(tr(T.del))}" aria-label="${esc(tr(T.del))}">${TRASH}</button>
          </div>`;
        }).join('');
        return `
        <div class="mx-og" data-og="${esc(g.id)}">
          <div class="mx-og-head">
            <input class="mx-og-nm" type="text" value="${esc(g.name)}" data-og-name="${esc(g.id)}"
                   placeholder="${esc(tr(T.optEx))}" aria-label="${esc(tr(T.optNm))}" />
            <button type="button" class="del" data-og-del="${esc(g.id)}" title="${esc(tr(T.del))}" aria-label="${esc(tr(T.del))}">${TRASH}</button>
          </div>
          <div class="mx-og-rules">
            <div class="mx-og-kind">
              <button type="button" class="${g.kind !== 'many' ? 'on' : ''}" data-og-kind="${esc(g.id)}::one">${esc(tr(T.optOne))}</button>
              <button type="button" class="${g.kind === 'many' ? 'on' : ''}" data-og-kind="${esc(g.id)}::many">${esc(tr(T.optMany))}</button>
            </div>
            <label class="mx-og-req" title="${esc(tr(T.optReqHi))}">
              <input type="checkbox" data-og-req="${esc(g.id)}" ${g.required ? 'checked' : ''} />
              <span>${esc(tr(T.optReq))}</span>
            </label>
          </div>
          <div class="mx-og-list">
            <div class="mx-og-visual-hint">${esc(tr(T.optEmojiHi))}</div>
            ${choices || `<div class="mx-og-empty">${esc(tr(T.optChEm))}</div>`}
          </div>
          <button data-activation=write class="mx-sub-add" type="button" data-oc-add="${esc(g.id)}">${PLUS}<span>${esc(tr(T.optChAdd))}</span></button>
        </div>`;
      }).join('');
      body.innerHTML = `
        <div class="mx-st-hint">${esc(tr(list.length ? T.optsHi : T.optsEm))}</div>
        ${cards}
        <button data-activation=write class="mx-cat-add" type="button" data-og-add>${PLUS}<span>${esc(tr(T.optAdd))}</span></button>`;
      if (focusSel) {
        const inp = body.querySelector(focusSel);
        if (inp) { try { inp.focus(); inp.select(); } catch (_) {} }
      }
    }

    /* Même règle que pour les postes : on écrit à la volée, amorti, et TOUT
     * geste qui repeint écrit d'abord la frappe en cours — sinon les lettres
     * des 350 dernières millisecondes disparaissent sous les yeux. */
    let tmr = null;
    const flush = () => { if (!tmr) return; clearTimeout(tmr.t); tmr.run(); tmr = null; };
    const queue = (run) => { if (tmr) clearTimeout(tmr.t); tmr = { run, t: setTimeout(() => { tmr = null; run(); }, 350) }; };
    const pair = (v) => String(v || '').split('::');

    body.addEventListener('input', (e) => {
      const gn = e.target.closest('[data-og-name]');
      if (gn) { const id = gn.dataset.ogName, v = gn.value; queue(() => updateOptGroup(id, { name: v })); return; }
      const cn = e.target.closest('[data-oc-name]');
      if (cn) { const [g, c] = pair(cn.dataset.ocName), v = cn.value; queue(() => updateOptChoice(g, c, { name: v })); return; }
      const cp = e.target.closest('[data-oc-price]');
      if (cp) { const [g, c] = pair(cp.dataset.ocPrice), v = cp.value; queue(() => updateOptChoice(g, c, { price: v })); return; }
    });
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('input[type="text"], input[type="number"]')) { e.preventDefault(); e.target.blur(); }
    });
    body.addEventListener('focusout', (e) => { if (e.target.closest('input')) flush(); });
    body.addEventListener('change', (e) => {
      const rq = e.target.closest('[data-og-req]');
      if (rq) { flush(); updateOptGroup(rq.dataset.ogReq, { required: rq.checked }); }
    });
    body.addEventListener('click', (e) => {
      const picked = e.target.closest('[data-oc-emoji-pick]');
      if (picked) {
        flush();
        const [g, c] = pair(picked.dataset.ocEmojiPick);
        updateOptChoice(g, c, { emoji: picked.dataset.emoji || '' });
        paint();
        return;
      }
      const opener = e.target.closest('[data-oc-emoji-open]');
      if (opener) {
        const id = opener.dataset.ocEmojiOpen;
        const picker = body.querySelector(`[data-oc-emoji-picker="${id}"]`);
        const willOpen = !!(picker && picker.hidden);
        body.querySelectorAll('[data-oc-emoji-picker]').forEach((el) => { el.hidden = true; });
        body.querySelectorAll('[data-oc-emoji-open]').forEach((el) => { el.setAttribute('aria-expanded', 'false'); });
        if (picker && willOpen) { picker.hidden = false; opener.setAttribute('aria-expanded', 'true'); }
        return;
      }
      body.querySelectorAll('[data-oc-emoji-picker]').forEach((el) => { el.hidden = true; });
      body.querySelectorAll('[data-oc-emoji-open]').forEach((el) => { el.setAttribute('aria-expanded', 'false'); });
      const kd = e.target.closest('[data-og-kind]');
      if (kd) { flush(); const [g, k] = pair(kd.dataset.ogKind); updateOptGroup(g, { kind: k }); paint(); return; }
      const gd = e.target.closest('[data-og-del]');
      if (gd) { flush(); confirmThen(tr(T.optDelQ), () => { deleteOptGroup(gd.dataset.ogDel); paint(); }); return; }
      const cd = e.target.closest('[data-oc-del]');
      if (cd) { flush(); const [g, c] = pair(cd.dataset.ocDel); deleteOptChoice(g, c); paint(); return; }
      const ca = e.target.closest('[data-oc-add]');
      if (ca) {
        flush();
        const gid = ca.dataset.ocAdd;
        addOptChoice(gid, '', 0);
        const g = optById(store.get(), gid);
        const last = g && g.choices && g.choices[g.choices.length - 1];
        paint(last ? `[data-oc-name="${gid}::${last.id}"]` : null);
        return;
      }
      if (e.target.closest('[data-og-add]')) {
        flush();
        addOptGroup('');
        const list = optsOf(store.get());
        const last = list[list.length - 1];
        paint(last ? `[data-og-name="${last.id}"]` : null);
        return;
      }
    });
    m.el.querySelector('[data-og-close]').addEventListener('click', () => { flush(); m.close(); render(); });
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Escape') flush(); }, true);
    paint();
  }

    return { optsModal };
  };
})(window.KiwiMenuCatalogParts = window.KiwiMenuCatalogParts || {});
