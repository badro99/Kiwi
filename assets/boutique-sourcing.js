/* Boutique · fournisseurs en concurrence (23 nov. 2026 : « la concurrence
 * fournisseurs doit aussi valoir pour les boutiques »).
 *
 * Un produit du catalogue boutique porte UN fournisseur (`supplierId`) et son
 * coût d'achat. Ce module le met en concurrence :
 *
 *   · les concurrents sont des prix annoncés, rangés sur la fiche de chaque
 *     fournisseur du document d'achats (`quotes[productId]`,
 *     KiwiProcurement.setQuote) : la fiche fournisseur voyage déjà entre les
 *     appareils et le miroir D1 la recopie sans la toucher ;
 *   · ce que la boutique a vraiment payé vient de ses réceptions (une réception
 *     = un prix, au coût moyen de ses tailles) et passe avant le prix annoncé ;
 *   · le moins cher est marqué ; s'il bat le principal, la fiche le dit et le
 *     fait principal en un geste. Le produit change de fournisseur, jamais de
 *     coût : le stock en rayon a été payé à l'ancien prix, et l'ancien principal
 *     reste en concurrence au prix qu'on lui connaît.
 *
 * Deux écrans lisent ce module : la fiche produit du tableau de bord boutique
 * (assets/pages-pro-boutique.js y laisse une place `data-bqs-slot`) et la fiche article du
 * stock pour les métiers de détail (assets/stock/sourcing.js, `offers`).
 * Rien ici n'écrit hors du catalogue boutique et du document d'achats.
 * Test : tools/boutique-sourcing-test.mjs. */
(function () {
  'use strict';
  if (window.KiwiBoutiqueSourcing) return;

  /* [français, anglais, arabe]. */
  const WORDS = {
    title: ['Fournisseurs en concurrence', 'Competing suppliers', 'منافسة الموردين'],
    principal: ['Principal', 'Main', 'رئيسي'],
    cheapest: ['Le moins cher', 'Cheapest', 'الأرخص'],
    lastPaid: ['Payé le {d}', 'Paid on {d}', 'دُفع يوم {d}'],
    quoted: ['Prix annoncé', 'Quoted price', 'السعر المعلن'],
    deliveries: ['{n} livraisons', '{n} deliveries', '{n} توريدات'],
    delivery1: ['1 livraison', '1 delivery', 'توريد واحد'],
    noPrice: ['Pas encore de prix', 'No price yet', 'لا سعر بعد'],
    perPiece: ['{p} la pièce', '{p} per piece', '{p} للقطعة'],
    gap: ['{s} est {p} moins cher que votre fournisseur principal.', '{s} is {p} cheaper than your main supplier.', '{s} أرخص بـ {p} من مورّدك الرئيسي.'],
    makeMain: ['En faire le principal', 'Make it the main supplier', 'اجعله المورّد الرئيسي'],
    mainDone: ['{s} est maintenant votre fournisseur principal pour {i}.', '{s} is now your main supplier for {i}.', '{s} هو الآن مورّدك الرئيسي لـ {i}.'],
    one: ['Un seul fournisseur pour ce produit. Ajoutez-en un deuxième pour comparer les prix.', 'Only one supplier for this product. Add a second one to compare prices.', 'مورّد واحد فقط لهذا المنتج. أضف مورّداً ثانياً لمقارنة الأسعار.'],
    none: ['Aucun fournisseur pour ce produit. Ajoutez ceux qui vous le proposent pour comparer leurs prix.', 'No supplier for this product yet. Add the ones who offer it to compare their prices.', 'لا يوجد مورّد لهذا المنتج. أضف من يعرضونه عليك لمقارنة أسعارهم.'],
    add: ['Ajouter un fournisseur concurrent', 'Add a competing supplier', 'أضف مورّداً منافساً'],
    rivalT: ['Fournisseur concurrent', 'Competing supplier', 'مورّد منافس'],
    rivalSup: ['Fournisseur', 'Supplier', 'المورّد'],
    rivalNew: ['+ Nouveau fournisseur…', '+ New supplier…', '+ مورّد جديد…'],
    rivalName: ['Nom du fournisseur', 'Supplier name', 'اسم المورّد'],
    rivalPrice: ['Prix annoncé par pièce (MAD)', 'Quoted price per piece (MAD)', 'السعر المعلن للقطعة (درهم)'],
    rivalHelp: ['Le prix qu’il vous propose pour ce produit. Il sera comparé au prix de votre fournisseur actuel.', 'The price this supplier offers you for this product. It is compared with your current supplier.', 'السعر الذي يعرضه عليك لهذا المنتج. يُقارن بسعر مورّدك الحالي.'],
    rivalBad: ['Choisissez un fournisseur et indiquez un prix supérieur à zéro.', 'Pick a supplier and enter a price above zero.', 'اختر مورّداً وأدخل سعراً أكبر من صفر.'],
    rivalDone: ['Prix de {s} enregistré pour {i}.', 'Price from {s} saved for {i}.', 'تم حفظ سعر {s} لـ {i}.'],
    cancel: ['Annuler', 'Cancel', 'إلغاء'],
    save: ['Enregistrer', 'Save', 'حفظ'],
  };
  const lang = () => { const l = String(document.documentElement.getAttribute('lang') || 'fr').slice(0, 2); return l === 'en' || l === 'ar' ? l : 'fr'; };
  function tr(key, vars, l = lang()) {
    const w = WORDS[key];
    let s = w ? (w[l === 'en' ? 1 : l === 'ar' ? 2 : 0] || w[0]) : key;
    Object.keys(vars || {}).forEach((k) => { s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = +v; return Number.isFinite(n) && n > 0 ? n : null; };
  const mad = (n) => `${(Math.round(n * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MAD`;
  const pct = (n) => Math.round(n) + ' %';
  const day = (ts, l) => { try { return new Date(ts).toLocaleDateString(l === 'ar' ? 'ar-MA' : l === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }); } catch (_) { return ''; } };
  const nameKey = (s) => String(s || '').trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

  const doc = () => { try { return (window.KiwiProcurement && window.KiwiProcurement.doc && window.KiwiProcurement.doc()) || {}; } catch (_) { return {}; } };
  const cat = () => window.KiwiBoutiqueCatalog || null;
  const quoteOf = (s, id) => { const q = s && s.quotes && s.quotes[id]; return q ? num(q.price) : null; };
  const live = (d) => (d.suppliers || []).filter((s) => s && s.id && s.name && s.active !== false);

  /* ─────────────────────────── calcul ─────────────────────────── */
  /* Les réceptions d'un produit, par fournisseur, la plus récente d'abord. */
  function paidBy(id, d) {
    const out = new Map();
    (d.receipts || []).forEach((r) => {
      const sid = String((r && r.supplierId) || '');
      if (!sid) return;
      let qty = 0; let spend = 0;
      (r.lines || []).forEach((ln) => {
        if (String(ln && ln.itemId) !== String(id) || !(+ln.unitCost > 0)) return;
        const q = +ln.qty > 0 ? +ln.qty : 1; qty += q; spend += q * +ln.unitCost;
      });
      if (!qty) return;
      if (!out.has(sid)) out.set(sid, []);
      out.get(sid).push({ cost: Math.round((spend / qty) * 100) / 100, ts: +r.receivedAt || +r.createdAt || 0 });
    });
    out.forEach((list) => list.sort((a, b) => b.ts - a.ts));
    return out;
  }
  /* Les offres d'un produit ({ id, supplierId, cost } ; l'article du stock
     donne `costPerUnit`) : le principal, les prix annoncés, puis ceux qui ont
     livré sans prix annoncé. Le prix d'une offre est le dernier payé, sinon
     l'annoncé (le coût du produit pour le principal qui n'en a pas). */
  function offers(item, d = doc()) {
    if (!item || !item.id) return [];
    const id = String(item.id);
    const cost = num(item.cost != null ? item.cost : item.costPerUnit);
    const sups = live(d);
    const paid = paidBy(id, d);
    const main = sups.find((s) => String(s.id) === String(item.supplierId || ''));
    const rows = [];
    if (main) rows.push({ sup: main, quoted: quoteOf(main, id) || cost, principal: true });
    sups.filter((s) => s !== main && quoteOf(s, id)).sort((a, b) => quoteOf(a, id) - quoteOf(b, id))
      .forEach((s) => rows.push({ sup: s, quoted: quoteOf(s, id), principal: false }));
    sups.filter((s) => s !== main && !quoteOf(s, id) && paid.has(String(s.id)))
      .forEach((s) => rows.push({ sup: s, quoted: null, principal: false }));
    const out = rows.map((r) => {
      const list = paid.get(String(r.sup.id)) || [];
      return { id: String(r.sup.id), name: String(r.sup.name), principal: r.principal, quoted: r.quoted,
        last: list[0] || null, prev: list[1] ? list[1].cost : null, n: list.length, price: list[0] ? list[0].cost : r.quoted };
    });
    const priced = out.filter((o) => o.price > 0);
    if (priced.length >= 2) {
      const low = Math.min(...priced.map((o) => o.price));
      if (priced.some((o) => o.price > low)) priced.find((o) => o.price === low).cheapest = true;
    }
    return out;
  }
  function gap(list) {
    const main = list.find((o) => o.principal);
    const low = list.find((o) => o.cheapest);
    if (!main || !low || low === main || !(main.price > 0)) return null;
    return { main, low, pct: ((main.price - low.price) / main.price) * 100 };
  }

  /* ─────────────────────────── écriture ─────────────────────────── */
  function setPrincipal(item, supplierId) {
    const C = cat(); const P = window.KiwiProcurement;
    if (!C || !C.updateProduct || !item) return null;
    const sups = doc().suppliers || [];
    const pick = sups.find((s) => s && String(s.id) === String(supplierId));
    if (!pick) return null;
    const old = sups.find((s) => s && String(s.id) === String(item.supplierId || ''));
    const cost = num(item.cost != null ? item.cost : item.costPerUnit);
    if (old && old !== pick && !quoteOf(old, item.id) && cost && P && P.setQuote) P.setQuote(old.id, item.id, cost);
    C.updateProduct(item.id, { supplierId: pick.id });
    return { id: pick.id, name: pick.name };
  }
  /* Un fournisseur connu ou nouveau, et son prix. Un produit qui n'avait aucun
     fournisseur prend celui-ci comme principal. */
  function addRival(item, pick, name, price) {
    const P = window.KiwiProcurement; const C = cat();
    const amount = num(String(price == null ? '' : price).replace(',', '.'));
    if (!item || !P || !P.setQuote || !amount) return null;
    let sup = null;
    if (pick && pick !== '__new__') sup = (doc().suppliers || []).find((s) => s && String(s.id) === String(pick)) || null;
    else {
      const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      if (!clean) return null;
      sup = (doc().suppliers || []).find((s) => s && nameKey(s.name) === nameKey(clean)) || (P.addSupplier ? P.addSupplier({ name: clean }) : null);
    }
    if (!sup || !sup.id) return null;
    P.setQuote(sup.id, item.id, amount);
    if (!item.supplierId && C && C.updateProduct) C.updateProduct(item.id, { supplierId: sup.id });
    return { id: sup.id, name: sup.name };
  }

  /* ─────────────────────────── vues ─────────────────────────── */
  const CSS = `
.bqs-sec{margin-top:18px}
.bqs-sec h4{margin:0 0 8px}
.bqs-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}
.bqs-row:first-of-type{border-top:0}
.bqs-row>div:first-child{flex:1 1 auto;min-width:0}
.bqs-row .bqs-v{flex:0 0 auto;text-align:end;font-weight:600;font-variant-numeric:tabular-nums}
.bqs-n{font-weight:600}
.bqs-sub{display:block;margin-top:2px;font-size:12px;opacity:.7}
.bqs-badge{display:inline-flex;align-items:center;margin-inline-start:8px;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;line-height:1.4;background:color-mix(in srgb,var(--atlas,#0b6e4f) 12%,transparent);color:var(--atlas,#0b6e4f)}
.bqs-badge.is-low{background:color-mix(in srgb,var(--atlas,#0b6e4f) 22%,transparent)}
.bqs-gap{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 8px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--atlas,#0b6e4f) 8%,transparent)}
.bqs-lone{margin:6px 0 0;font-size:12.5px;opacity:.75}
.bqs-add{margin-top:10px}
.bqs-dlg label{display:block;margin-bottom:6px;font-size:12px;font-weight:600}
.bqs-dlg .bqs-f{margin-bottom:12px}
.bqs-dlg input,.bqs-dlg select{width:100%;box-sizing:border-box}
.bqs-err{display:block;margin-top:6px;font-size:12px;color:var(--danger,#9a1f1f)}
`;
  function ensureStyle() {
    if (document.getElementById('bqs-css')) return;
    const st = document.createElement('style');
    st.id = 'bqs-css';
    st.appendChild(document.createTextNode(CSS));
    document.head.appendChild(st);
  }
  function row(o, l) {
    const badges = (o.principal ? `<span class="bqs-badge">${esc(tr('principal', null, l))}</span>` : '')
      + (o.cheapest ? `<span class="bqs-badge is-low">${esc(tr('cheapest', null, l))}</span>` : '');
    const subs = [];
    if (o.last) subs.push(tr('lastPaid', { d: day(o.last.ts, l) }, l));
    else if (o.quoted) subs.push(tr('quoted', null, l));
    if (o.n > 1) subs.push(tr('deliveries', { n: o.n }, l));
    else if (o.n === 1) subs.push(tr('delivery1', null, l));
    return `<div class="bqs-row" data-bqs-offer="${esc(o.id)}">
        <div><span class="bqs-n">${esc(o.name)}</span>${badges}${subs.length ? `<span class="bqs-sub">${esc(subs.join(' · '))}</span>` : ''}</div>
        <div class="bqs-v">${o.price > 0 ? esc(tr('perPiece', { p: mad(o.price) }, l)) : esc(tr('noPrice', null, l))}</div>
      </div>`;
  }
  /* La section de la fiche produit boutique. */
  function section(pid) {
    const C = cat();
    const data = C && C.getProduct ? C.getProduct(pid) : null;
    if (!data || !data.product) return '';
    ensureStyle();
    const l = lang();
    const p = data.product;
    const list = offers({ id: p.id, supplierId: p.supplierId, cost: p.cost });
    const g = gap(list);
    const advice = g && g.pct >= 1 ? `<div class="bqs-gap" data-bqs-gap>
        <span>${esc(tr('gap', { s: g.low.name, p: pct(g.pct) }, l))}</span>
        <button data-activation=write type="button" class="kb atlas xs" data-bqs-main="${esc(g.low.id)}">${esc(tr('makeMain', null, l))}</button>
      </div>` : '';
    const lone = list.length <= 1 ? `<p class="bqs-lone">${esc(tr(list.length ? 'one' : 'none', null, l))}</p>` : '';
    return `<div class="bqx-sh-sec bqs-sec" data-bqs-section="${esc(pid)}">
        <h4>${esc(tr('title', null, l))}</h4>
        ${advice}
        <div>${list.map((o) => row(o, l)).join('')}</div>
        ${lone}
        <button data-activation=write type="button" class="kb ghost xs bqs-add" data-bqs-add="${esc(pid)}">${esc(tr('add', null, l))}</button>
      </div>`;
  }
  function refresh(pid) {
    document.querySelectorAll('[data-bqs-section]').forEach((el) => {
      if (el.getAttribute('data-bqs-section') !== String(pid)) return;
      const html = section(pid);
      if (!html) return;
      const box = document.createElement('div');
      box.innerHTML = html;
      el.replaceWith(box.firstElementChild);
    });
  }
  const productItem = (pid) => {
    const C = cat();
    const data = C && C.getProduct ? C.getProduct(pid) : null;
    return data && data.product ? { id: data.product.id, name: data.product.name, supplierId: data.product.supplierId, cost: data.product.cost } : null;
  };
  const toast = (msg) => { try { window.Kiwi.toast(msg, { type: 'success' }); } catch (_) {} };

  /* La fenêtre « fournisseur concurrent ». `done` reçoit le fournisseur choisi. */
  function openRival(item, done) {
    if (!item || !window.Kiwi || !window.Kiwi.modal) return;
    ensureStyle();
    const l = lang();
    const sups = live(doc()).filter((s) => String(s.id) !== String(item.supplierId || ''));
    const m = window.Kiwi.modal({
      title: tr('rivalT', null, l),
      desc: esc(item.name),
      width: 480,
      body: `<div class="bqs-dlg">
          <div class="bqs-f">
            <label for="bqs-rival-sup">${esc(tr('rivalSup', null, l))}</label>
            <select class="st-mb-input" id="bqs-rival-sup" data-bqs-rival-sup>
              ${sups.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
              <option value="__new__"${sups.length ? '' : ' selected'}>${esc(tr('rivalNew', null, l))}</option>
            </select>
            <input class="st-mb-input" type="text" maxlength="120" autocomplete="off" placeholder="${esc(tr('rivalName', null, l))}" aria-label="${esc(tr('rivalName', null, l))}" data-bqs-rival-name style="margin-top:8px;${sups.length ? 'display:none;' : ''}" />
          </div>
          <div class="bqs-f">
            <label for="bqs-rival-price">${esc(tr('rivalPrice', null, l))}</label>
            <input class="st-mb-input mono" id="bqs-rival-price" inputmode="decimal" autocomplete="off" placeholder="0" data-bqs-rival-price />
            <span class="bqs-sub">${esc(tr('rivalHelp', null, l))}</span>
            <span class="bqs-err" data-bqs-rival-err hidden></span>
          </div>
        </div>`,
      foot: `<button class="kb ghost" type="button" data-dismiss>${esc(tr('cancel', null, l))}</button><button data-activation=write class="kb atlas" type="button" data-bqs-rival-save>${esc(tr('save', null, l))}</button>`,
    });
    const box = m && m.el;
    if (!box) return;
    const sel = box.querySelector('[data-bqs-rival-sup]');
    const name = box.querySelector('[data-bqs-rival-name]');
    sel.addEventListener('change', () => { name.style.display = sel.value === '__new__' ? '' : 'none'; if (sel.value === '__new__') name.focus(); });
    const close = () => { try { m.close(); } catch (_) { box.remove(); } };
    const save = () => {
      const sup = addRival(item, sel.value, name.value, box.querySelector('[data-bqs-rival-price]').value);
      const err = box.querySelector('[data-bqs-rival-err]');
      if (!sup) { err.textContent = tr('rivalBad', null, l); err.hidden = false; return; }
      toast(tr('rivalDone', { s: sup.name, i: item.name }, l));
      close();
      if (done) done(sup);
    };
    box.querySelector('[data-bqs-rival-save]').addEventListener('click', save);
    box.querySelector('[data-bqs-rival-price]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  }

  /* La fiche produit boutique laisse une place (`data-bqs-slot`) que l'on
     remplit dès qu'elle paraît : la fiche n'a pas à connaître ce module. */
  function fill() {
    document.querySelectorAll('[data-bqs-slot]').forEach((slot) => {
      const html = section(slot.getAttribute('data-bqs-slot'));
      if (!html) { slot.removeAttribute('data-bqs-slot'); return; }
      const box = document.createElement('div');
      box.innerHTML = html;
      slot.replaceWith(box.firstElementChild);
    });
  }
  if (window.MutationObserver) {
    let queued = false;
    new MutationObserver(() => {
      if (queued || !document.querySelector('[data-bqs-slot]')) return;
      queued = true;
      Promise.resolve().then(() => { queued = false; fill(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  fill();

  /* Les gestes de la section, délégués : la fiche se redessine sans nous. */
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('[data-bqs-main],[data-bqs-add]') : null;
    if (!t) return;
    const sec = t.closest('[data-bqs-section]');
    const pid = sec ? sec.getAttribute('data-bqs-section') : t.getAttribute('data-bqs-add');
    const item = productItem(pid);
    if (!item) return;
    e.preventDefault();
    if (t.hasAttribute('data-bqs-main')) {
      const pick = setPrincipal(item, t.getAttribute('data-bqs-main'));
      if (pick) { toast(tr('mainDone', { s: pick.name, i: item.name })); refresh(pid); }
      return;
    }
    openRival(item, () => refresh(pid));
  });

  window.KiwiBoutiqueSourcing = { offers, gap, setPrincipal, addRival, section, openRival, refresh, fill, tr, WORDS };
})();
