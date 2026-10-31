/* La remise de TICKET de la caisse maison, comme la boutique
 * (pos-boutique/ticket-remise.js), sortie de sales.js (plafond de taille,
 * tools/file-size-ratchet-test.mjs). Rien n'est importé : sales.js passe ses
 * propres fonctions, donc c'est SON code qui tourne (openApprove, le rendu).
 *
 * Aucun chemin d'argent neuf : le pourcentage se repose sur chaque ligne, là
 * où il vivait déjà, derrière le même accord gérante (openApprove) et la même
 * liste de taux (KiwiDiscountPolicy). */
/* Les mots de ces écrans Maison en anglais et en arabe, comme ozon.js : la
 * caisse dit sa langue (KiwiCaisseLang.get), une phrase inconnue reste en
 * français. Sert aussi à « Déclarer casse » (sales.js). */
const PHRASES = {
  'Remise sur le ticket': ['Receipt discount', 'خصم على التذكرة'],
  'Remise supprimée': ['Discount removed', 'تم حذف الخصم'],
  'Remise −{n} % sur le ticket': ['−{n} % off the receipt', 'خصم −{n} % على التذكرة'],
  'S\'applique à tous les articles du ticket {n}. Accord gérante requis.': ['Applies to every item on receipt {n}. Manager approval required.', 'يُطبَّق على كل أصناف التذكرة {n}. يلزم إذن المسيّرة.'],
  'Sans': ['None', 'بدون'],
  'Fermer': ['Close', 'إغلاق'],
  'Pourcentage non autorisé': ['Percentage not allowed', 'نسبة غير مسموح بها'],
  'en stock': ['in stock', 'في المخزون'],
  'Changer d\'article': ['Change item', 'تغيير الصنف'],
  'Touchez l\u2019article cassé dans la liste ci-dessus.': ['Tap the broken item in the list above.', 'المس الصنف المكسور في القائمة أعلاه.'],
  'Aucun article ne correspond.': ['No item matches.', 'لا يوجد صنف مطابق.'],
  'Choisissez d\u2019abord l\u2019article cassé': ['Pick the broken item first', 'اختر الصنف المكسور أولاً'],
};
export const mzTr = (s) => {
  let lang = 'fr';
  try { lang = (window.KiwiCaisseLang && window.KiwiCaisseLang.get && window.KiwiCaisseLang.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  return own && (lang === 'en' || lang === 'ar') ? own[lang === 'en' ? 0 : 1] : s;
};
const tr = mzTr;

export function mzTicketRemise(d) {
  const { state, root, $, $$, esc, icons, toast, openVeil, closeVeil, openApprove,
    renderTicket, renderGrid, renderBadges, policyKey } = d;
  const t = state.ticket;
  if (!t.lines.length) return;
  const pcts = (window.KiwiDiscountPolicy?.percentages(policyKey) || [5, 10, 15, 20]).filter((p) => p > 0);
  const cur = t.lines.every((l) => l.remise === t.lines[0].remise) ? (t.lines[0].remise || 0) : null;
  const apply = (pct) => {
    t.lines.forEach((ln) => { ln.remise = pct; });
    renderTicket(); renderGrid(); renderBadges(); icons();
    toast(pct ? tr('Remise −{n} % sur le ticket').replace('{n}', String(pct)) : tr('Remise supprimée'));
  };
  const el = $('#mz-approvem', root);
  /* Le squelette d'abord, les mots ensuite, chacun par tr(), comme la boutique. */
  el.innerHTML = '<button class="mz-modal-x" data-mz-close><i data-icon="close"></i></button>'
    + '<h3 class="modal-title"></h3><p class="modal-subtle"></p><div class="mz-chips" id="mz-tkrem-chips">'
    + [0, ...pcts].map((r) => '<button class="mz-chip ' + (cur === r ? 'on' : '') + '" data-mz-tkrem="' + r + '">' + (r === 0 ? esc(tr('Sans')) : '−' + r + ' %') + (r > 0 && !t.remiseAuth ? ' <i data-icon="lock"></i>' : '') + '</button>').join('')
    + '</div>';
  $('.mz-modal-x', el).setAttribute('aria-label', tr('Fermer'));
  $('.modal-title', el).textContent = tr('Remise sur le ticket');
  $('.modal-subtle', el).textContent = tr('S\'applique à tous les articles du ticket {n}. Accord gérante requis.').replace('{n}', String(t.num || ''));
  openVeil('#mz-approve-veil');
  icons();
  $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-approve-veil'); });
  $('#mz-tkrem-chips', el).onclick = (e) => {
    const b = e.target.closest('[data-mz-tkrem]');
    if (!b) return;
    const pct = parseInt(b.dataset.mzTkrem, 10) || 0;
    if (pct > 0 && window.KiwiDiscountPolicy && !window.KiwiDiscountPolicy.allowed(pct, policyKey)) { toast(tr('Pourcentage non autorisé')); return; }
    /* Retirer la remise n'a jamais demandé d'accord ; l'accorder, si. */
    closeVeil('#mz-approve-veil');
    if (!pct || t.remiseAuth) { apply(pct); return; }
    openApprove(pct, () => { closeVeil('#mz-approve-veil'); apply(pct); });
  };
}
