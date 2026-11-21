/* Kiwi · bulk re-price (window.KiwiBulkReprice)
 *
 * Choose the articles (a category, the ticked rows, or everything), a basis
 * (the current price, or the cost for a boutique), an operation (+/− %, +/−
 * MAD, set to), a shelf rounding (0,50 / 1 / 5 MAD, up, down or nearest), see
 * every old → new price BEFORE anything is written, then apply: the new prices
 * enter the spreadsheet and leave in the same batch save as a hand edit.
 * The maths live in assets/pages-pro/catalog-bulk/rules.js (reprice, roundTo).
 *
 * Replaces the « Édition groupée » modal of assets/pages-pro.js, whose Apply
 * button only showed « 9 tajines ré-tarifés » and changed nothing.
 */
(function () {
  'use strict';
  function css() {
    if (document.getElementById('cbr-css')) return;
    const s = document.createElement('style');
    s.id = 'cbr-css';
    s.textContent = `
.cbr{display:grid;gap:14px}
.cbr-row{display:grid;gap:6px}
.cbr-row>span{font-size:12px;font-weight:600;color:var(--n-600,#4a5550)}
.cbr-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cbr-seg{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:999px;background:var(--n-100,rgba(10,15,13,.05));justify-self:start}
.cbr-seg button{border:0;background:transparent;font:inherit;font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:999px;color:var(--n-600,#4a5550);cursor:pointer;min-height:30px}
.cbr-seg button.on{background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);box-shadow:0 1px 2px rgba(10,15,13,.12)}
.cbr-seg button:disabled{opacity:.45;cursor:default}
.cbr-in{height:38px;border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:10px;padding:0 12px;font:inherit;font-size:13px;background:var(--paper-elev,#FDFCF9);color:var(--ink,#0A0F0D);width:100%}
.cbr-quick{display:flex;gap:6px;flex-wrap:wrap}
.cbr-quick button{border:1px solid var(--n-200,rgba(10,15,13,.12));background:transparent;border-radius:999px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer;color:var(--ink,#0A0F0D)}
.cbr-sum{font-size:13px;color:var(--n-600,#4a5550)}
.cbr-sum b{color:var(--ink,#0A0F0D);font-weight:600}
.cbr-prev{max-height:240px;overflow:auto;border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:12px}
.cbr-prev table{width:100%;border-collapse:collapse;font-size:12.5px}
.cbr-prev th{position:sticky;top:0;background:var(--paper-soft,#EFEDE6);text-align:start;font-weight:600;padding:7px 10px;color:var(--n-600,#4a5550)}
.cbr-prev td{padding:6px 10px;border-top:1px solid var(--n-100,rgba(10,15,13,.06))}
.cbr-prev .n{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
.cbr-prev .old{color:var(--n-500,#6b7570);text-decoration:line-through}
.cbr-prev .up{color:var(--atlas,#0B6E4F)}
.cbr-prev .down{color:var(--danger,#C94A3A)}
.cbr-empty{padding:18px;text-align:center;color:var(--n-500,#6b7570);font-size:13px}
@media (max-width:560px){.cbr-two{grid-template-columns:1fr}}
`;
    document.head.appendChild(s);
  }

  function open(ctx) {
    css();
    const { L, esc, fmtNum, plural } = ctx;
    const R = window.KiwiBulkRules;
    const st = {
      scope: ctx.scope === 'selection' && ctx.selected.length ? 'selection' : ctx.selected.length ? 'selection' : ctx.categories.length ? 'category' : 'all',
      cat: (ctx.categories[0] || {}).id || '', basis: 'price', op: 'pct+', value: '5', step: '1', mode: 'nearest',
    };
    if (ctx.scope === 'all') st.scope = 'all';
    const seg = (name, items) => `<div class="cbr-seg" data-lens-demo role="group" data-seg="${name}">${items.map(([k, label, off]) => `<button type="button" data-lens-item data-k="${k}"${off ? ' disabled' : ''} class="${st[name] === k ? 'on' : ''}" aria-pressed="${st[name] === k}">${esc(label)}</button>`).join('')}</div>`;
    const m = window.Kiwi.modal({
      tag: L('PRIX EN MASSE', 'BULK PRICES', 'الأثمنة بالجملة'),
      title: L('Ajuster les prix', 'Adjust prices', 'بدّل الأثمنة'),
      desc: esc(L('Rien n’est écrit avant « Appliquer ». Vous voyez chaque nouveau prix d’abord.', 'Nothing is written before « Apply ». You see every new price first.', 'حتى حاجة ما كاتتسجّل قبل « طبّق ». كاتشوف كل ثمن جديد قبل.')),
      width: 640,
      body: `<div class="cbr">
        <div class="cbr-row"><span>${esc(L('Articles', 'Items', 'المنتجات'))}</span>
          ${seg('scope', [['category', L('Une catégorie', 'A category', 'فئة وحدة'), !ctx.categories.length], ['selection', L('Sélection', 'Selection', 'المختارين') + ' (' + fmtNum(ctx.selected.length, 0) + ')', !ctx.selected.length], ['all', L('Tout', 'Everything', 'كلشي') + ' (' + fmtNum(ctx.items.length, 0) + ')']])}
          <select class="cbr-in" data-cat ${st.scope === 'category' ? '' : 'hidden'}>${ctx.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
        </div>
        ${ctx.hasCost ? `<div class="cbr-row"><span>${esc(L('Calculer à partir de', 'Calculate from', 'نحسبو من'))}</span>${seg('basis', [['price', L('Prix de vente actuel', 'Current selling price', 'ثمن البيع الحالي')], ['cost', L('Prix d’achat', 'Cost', 'ثمن الشراء')]])}</div>` : ''}
        <div class="cbr-two">
          <label class="cbr-row"><span>${esc(L('Opération', 'Operation', 'العملية'))}</span>
            <select class="cbr-in" data-op>
              <option value="pct+">${esc(L('Augmenter de … %', 'Increase by … %', 'زيد … %'))}</option>
              <option value="pct-">${esc(L('Baisser de … %', 'Decrease by … %', 'نقّص … %'))}</option>
              <option value="amt+">${esc(L('Ajouter … MAD', 'Add … MAD', 'زيد … درهم'))}</option>
              <option value="amt-">${esc(L('Retirer … MAD', 'Take off … MAD', 'نقّص … درهم'))}</option>
              <option value="set">${esc(L('Fixer à … MAD', 'Set to … MAD', 'دير الثمن … درهم'))}</option>
            </select></label>
          <label class="cbr-row"><span>${esc(L('Valeur', 'Value', 'القيمة'))}</span><input class="cbr-in" data-val inputmode="decimal" value="5"></label>
        </div>
        <div class="cbr-quick" data-quick>${['2', '5', '10', '15'].map((v) => `<button type="button" data-q="${v}">${v} %</button>`).join('')}</div>
        <div class="cbr-two">
          <label class="cbr-row"><span>${esc(L('Arrondir au', 'Round to', 'قرّب ل'))}</span>
            <select class="cbr-in" data-step><option value="0">${esc(L('Centime près', 'Nearest centime', 'أقرب سنتيم'))}</option><option value="0.5">0,50 MAD</option><option value="1" selected>1 MAD</option><option value="5">5 MAD</option></select></label>
          <label class="cbr-row"><span>${esc(L('Sens', 'Direction', 'الاتجاه'))}</span>
            <select class="cbr-in" data-mode><option value="nearest">${esc(L('Au plus proche', 'Nearest', 'الأقرب'))}</option><option value="up">${esc(L('Vers le haut', 'Up', 'للفوق'))}</option><option value="down">${esc(L('Vers le bas', 'Down', 'للتحت'))}</option></select></label>
        </div>
        <div class="cbr-sum" data-sum aria-live="polite"></div>
        <div class="cbr-prev" data-prev></div>
      </div>`,
      foot: `<button type="button" class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'لغي'))}</button><button type="button" class="kb atlas" data-apply disabled>${esc(L('Appliquer', 'Apply', 'طبّق'))}</button>`,
    });
    const el = m.el;
    const q = (s) => el.querySelector(s);
    let result = { rows: [], skipped: {} };

    function items() {
      if (st.scope === 'selection') { const set = new Set(ctx.selected); return ctx.items.filter((i) => set.has(i.id)); }
      if (st.scope === 'category') return ctx.items.filter((i) => i.category === st.cat);
      return ctx.items;
    }
    function rule() {
      const raw = R.parseNumber(st.value);
      const v = raw == null || Number.isNaN(raw) ? NaN : Math.abs(raw);
      const op = st.op.slice(0, 3), sign = st.op.endsWith('-') ? -1 : 1;
      return { basis: st.basis, op: op === 'set' ? 'set' : op, value: op === 'set' ? v : sign * v, step: Number(st.step), mode: st.mode };
    }
    function refresh() {
      result = R.reprice(items(), rule());
      const rows = result.rows, sk = result.skipped;
      const skips = [
        sk['no-basis'] ? plural(sk['no-basis'], L('{n} sans prix d’achat', '{n} without a cost', '{n} بلا ثمن الشراء'), L('{n} sans prix d’achat', '{n} without a cost', '{n} بلا ثمن الشراء')) : '',
        sk.same ? plural(sk.same, L('{n} déjà à ce prix', '{n} already at that price', '{n} فنفس الثمن'), L('{n} déjà à ce prix', '{n} already at that price', '{n} فنفس الثمن')) : '',
        sk.zero ? plural(sk.zero, L('{n} tomberait à zéro', '{n} would fall to zero', '{n} غادي يطيح لصفر'), L('{n} tomberaient à zéro', '{n} would fall to zero', '{n} غادي يطيحو لصفر')) : '',
        sk['too-high'] ? plural(sk['too-high'], L('{n} trop élevé', '{n} too high', '{n} غالي بزاف'), L('{n} trop élevés', '{n} too high', '{n} غاليين بزاف')) : '',
      ].filter(Boolean);
      const total = rows.reduce((s, r) => s + r.delta, 0);
      q('[data-sum]').innerHTML = sk['bad-value'] ? esc(L('Entrez une valeur.', 'Enter a value.', 'دخّل قيمة.'))
        : `<b>${esc(plural(rows.length, L('{n} prix changera', '{n} price will change', '{n} ثمن غادي يتبدّل'), L('{n} prix changeront', '{n} prices will change', '{n} أثمنة غادي يتبدّلو')))}</b>`
          + (rows.length ? ' · ' + esc(L('écart moyen ', 'average change ', 'الفرق المتوسط ') + (total >= 0 ? '+' : '') + fmtNum(total / rows.length, 2) + ' MAD') : '')
          + (skips.length ? ' · ' + esc(L('ignorés : ', 'skipped: ', 'متخطّين: ') + skips.join(', ')) : '');
      q('[data-prev]').innerHTML = rows.length
        ? `<table><thead><tr><th>${esc(L('Article', 'Item', 'المنتج'))}</th><th class="n">${esc(L('Avant', 'Before', 'قبل'))}</th><th class="n">${esc(L('Après', 'After', 'من بعد'))}</th><th class="n">${esc(L('Écart', 'Change', 'الفرق'))}</th></tr></thead><tbody>${rows.slice(0, 400).map((r) => `<tr><td>${esc(r.name)}</td><td class="n old">${fmtNum(r.old, 2)}</td><td class="n">${fmtNum(r.next, 2)}</td><td class="n ${r.delta > 0 ? 'up' : 'down'}">${r.delta > 0 ? '+' : ''}${fmtNum(r.delta, 2)}</td></tr>`).join('')}</tbody></table>`
          + (rows.length > 400 ? `<div class="cbr-empty">${esc(L('… et ', '… and ', '… و ') + fmtNum(rows.length - 400, 0) + L(' de plus', ' more', ' آخرين'))}</div>` : '')
        : `<div class="cbr-empty">${esc(L('Aucun prix ne change avec ces réglages.', 'No price changes with these settings.', 'حتى ثمن ما كايتبدّل بهاد الإعدادات.'))}</div>`;
      const apply = q('[data-apply]');
      apply.disabled = !rows.length;
      apply.textContent = rows.length ? plural(rows.length, L('Appliquer et enregistrer {n} prix', 'Apply and save {n} price', 'طبّق وسجّل {n} ثمن'), L('Appliquer et enregistrer {n} prix', 'Apply and save {n} prices', 'طبّق وسجّل {n} أثمنة')) : L('Appliquer', 'Apply', 'طبّق');
      q('[data-quick]').hidden = !st.op.startsWith('pct');
    }
    el.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]'); if (!b || b.disabled) return;
      st[g.dataset.seg] = b.dataset.k;
      g.querySelectorAll('[data-k]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      q('[data-cat]').hidden = st.scope !== 'category';
      refresh();
    }));
    q('[data-cat]').addEventListener('change', (e) => { st.cat = e.target.value; refresh(); });
    q('[data-op]').addEventListener('change', (e) => { st.op = e.target.value; refresh(); });
    q('[data-val]').addEventListener('input', (e) => { st.value = e.target.value; refresh(); });
    q('[data-step]').addEventListener('change', (e) => { st.step = e.target.value; refresh(); });
    q('[data-mode]').addEventListener('change', (e) => { st.mode = e.target.value; refresh(); });
    q('[data-quick]').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (!b) return; st.value = b.dataset.q; q('[data-val]').value = b.dataset.q; refresh(); });
    q('[data-apply]').addEventListener('click', async () => {
      const rows = result.rows;
      if (!rows.length) return;
      m.close();
      ctx.put(rows.map((r) => ({ id: r.id, key: 'price', value: r.next })));
      await ctx.save();
    });
    refresh();
    setTimeout(() => { const v = q('[data-val]'); if (v) { v.focus(); v.select(); } }, 60);
  }

  window.KiwiBulkReprice = { open };
})();
