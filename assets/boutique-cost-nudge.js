/* Kiwi · boutique-cost-nudge · les produits sans coût d'achat, dits en haut
 * de l'Inventaire du tableau de bord, et complétés en une seule fenêtre.
 *
 * Owner, 26 nov. 2026 : « make me something that makes the owner feel obliged
 * to enter the price he bought the product for ». Santos avait 10 produits
 * sur 133 sans coût : la valeur du stock et les marges étaient fausses sans
 * que rien ne le montre ailleurs qu'en petit sous un chiffre. Les formulaires
 * exigent désormais le coût (boutique-sizes.js, pages-pro-boutique.js) ; ce
 * bandeau rattrape ceux d'avant et ne part qu'une fois tout complété.
 *
 * mountCostNudge(host, cat, lang, rerender) : host = .bqx-inv, cat =
 * KiwiBoutiqueCatalog, rerender = le rendu de l'Inventaire après enregistrement.
 */
const W = {
  fr: {
    title: (n) => `${n} produit${n > 1 ? 's' : ''} sans coût d’achat`,
    body: 'Sans le prix payé au fournisseur, Kiwi ne calcule ni votre marge ni la vraie valeur de votre stock.',
    open: 'Compléter maintenant', modal: 'Coûts d’achat à compléter',
    desc: 'Écrivez ce que vous avez payé une pièce. Les lignes laissées vides restent à faire.',
    price: 'vendu', cost: 'Coût d’achat', save: 'Enregistrer', later: 'Plus tard',
    bad: 'Un montant supérieur à 0, par exemple 120.', tooHigh: 'Plus cher que le prix de vente : vérifiez.',
    saved: (n) => `${n} coût${n > 1 ? 's' : ''} d’achat enregistré${n > 1 ? 's' : ''}`, none: 'Aucun coût écrit.',
  },
  en: {
    title: (n) => `${n} product${n > 1 ? 's' : ''} without a purchase cost`,
    body: 'Without what you paid the supplier, Kiwi can work out neither your margin nor the real value of your stock.',
    open: 'Fill them in now', modal: 'Purchase costs to fill in',
    desc: 'Enter what you paid for one piece. Rows left empty stay on the list.',
    price: 'sells at', cost: 'Purchase cost', save: 'Save', later: 'Later',
    bad: 'An amount above 0, for example 120.', tooHigh: 'Higher than the selling price: check it.',
    saved: (n) => `${n} purchase cost${n > 1 ? 's' : ''} saved`, none: 'No cost entered.',
  },
  ar: {
    title: (n) => `${n} منتج بدون تكلفة شراء`,
    body: 'بدون الثمن الذي دفعته للمورد، لا يستطيع Kiwi حساب هامش ربحك ولا القيمة الحقيقية لمخزونك.',
    open: 'أكمِلها الآن', modal: 'تكاليف شراء يجب إكمالها',
    desc: 'اكتب ما دفعته مقابل قطعة واحدة. الأسطر الفارغة تبقى في القائمة.',
    price: 'يباع بـ', cost: 'تكلفة الشراء', save: 'حفظ', later: 'لاحقاً',
    bad: 'مبلغ أكبر من 0، مثلاً 120.', tooHigh: 'أغلى من سعر البيع: تحقّق منه.',
    saved: (n) => `تم حفظ ${n} من تكاليف الشراء`, none: 'لم تُكتب أي تكلفة.',
  },
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const byName = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const money = (v) => { const s = String(v == null ? '' : v).replace(/\s|MAD/gi, '').replace(',', '.'); return s === '' ? null : (/^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN); };

/* Les produits en vente dont le coût manque, rangés comme l'Inventaire. */
export function missingCost(cat) {
  if (!cat || typeof cat.listProducts !== 'function') return [];
  return cat.listProducts({}).filter((p) => p && !(Number(p.cost) > 0)).sort((a, b) => byName.compare(String(a.name || ''), String(b.name || '')));
}

export function mountCostNudge(host, cat, lang, rerender) {
  if (!host) return;
  const old = host.querySelector(':scope > [data-cost-nudge]');
  const list = missingCost(cat);
  if (!list.length) { if (old) old.remove(); return; }
  const t = W[lang] || W.fr;
  const box = old || document.createElement('div');
  box.setAttribute('data-cost-nudge', '');
  box.setAttribute('role', 'status');
  box.style.cssText = 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:0 0 16px;padding:14px 18px;border-radius:14px;border:1px solid rgba(181,121,18,.45);background:rgba(232,166,42,.12);color:inherit';
  box.innerHTML = `<div style="flex:1;min-width:220px"><b style="display:block;font-size:15px;color:#8A6210">${esc(t.title(list.length))}</b>
    <span style="font-size:13px;opacity:.85">${esc(t.body)}</span></div>
    <button type="button" class="kb atlas" data-cost-nudge-open>${esc(t.open)}</button>`;
  if (!old) host.insertBefore(box, host.querySelector('.kx-kpi-strip') || host.firstChild);
  box.querySelector('[data-cost-nudge-open]').onclick = () => openCostForm(cat, lang, rerender);
}

export function openCostForm(cat, lang, rerender) {
  const K = window.Kiwi;
  if (!K || typeof K.modal !== 'function') return null;
  const t = W[lang] || W.fr;
  const list = missingCost(cat);
  const rows = list.map((p) => `<label data-cost-row="${esc(p.id)}" style="display:grid;grid-template-columns:1fr 150px;gap:4px 14px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(127,127,127,.18)">
      <span><b style="display:block">${esc(p.name)}</b><small style="opacity:.7">${esc(t.price)} ${esc(Number(p.priceMAD) || 0)} MAD</small></span>
      <input class="bqx-pf-in" inputmode="decimal" autocomplete="off" aria-label="${esc(t.cost + ' · ' + p.name)}" placeholder="MAD" data-cost-in style="width:100%" />
      <span data-cost-err role="alert" style="grid-column:1/-1;display:none;font-size:11.5px;font-weight:600;color:var(--danger, #cb5238)"></span>
    </label>`).join('');
  const m = K.modal({
    title: t.modal, desc: esc(t.desc), width: 620,
    body: `<div data-cost-form style="max-height:60vh;overflow:auto;padding-inline-end:4px">${rows}</div>`,
    foot: `<button type="button" class="kb ghost" data-dismiss>${esc(t.later)}</button><button type="button" class="kb atlas" data-cost-save>${esc(t.save)}</button>`,
  });
  if (!m || !m.el) return m;
  const say = (row, msg) => { const e = row.querySelector('[data-cost-err]'); e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; row.querySelector('[data-cost-in]').setAttribute('aria-invalid', msg ? 'true' : 'false'); };
  /* Plus cher que le prix de vente : dit en tapant, jamais bloqué (une pièce peut se solder à perte). */
  m.el.querySelectorAll('[data-cost-in]').forEach((i) => i.addEventListener('input', () => {
    const row = i.closest('[data-cost-row]'), v = money(i.value), p = list.find((x) => x.id === row.getAttribute('data-cost-row'));
    say(row, v > 0 && p && Number(p.priceMAD) > 0 && v > Number(p.priceMAD) ? t.tooHigh : '');
  }));
  m.el.querySelector('[data-cost-save]').onclick = () => {
    const fills = []; let wrong = null;
    m.el.querySelectorAll('[data-cost-row]').forEach((row) => {
      const v = money(row.querySelector('[data-cost-in]').value);
      if (v == null) return;
      if (!(v > 0)) { say(row, t.bad); wrong = wrong || row; return; }
      fills.push([row.getAttribute('data-cost-row'), v]);
    });
    if (wrong) { wrong.querySelector('[data-cost-in]').focus(); return; }
    if (!fills.length) { if (K.toast) K.toast(t.none, { type: 'warn' }); return; }
    const run = () => fills.forEach(([id, cost]) => cat.updateProduct(id, { cost }));
    if (cat.batch) cat.batch(run); else run();
    m.close();
    if (K.toast) K.toast(t.saved(fills.length), { type: 'success' });
    if (typeof rerender === 'function') rerender();
  };
  setTimeout(() => { const first = m.el.querySelector('[data-cost-in]'); if (first) first.focus(); }, 60);
  return m;
}
