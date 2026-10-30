/* La remise de TICKET de la caisse maison, comme la boutique
 * (pos-boutique/ticket-remise.js), sortie de sales.js (plafond de taille,
 * tools/file-size-ratchet-test.mjs). Rien n'est importé : sales.js passe ses
 * propres fonctions, donc c'est SON code qui tourne (openApprove, le rendu).
 *
 * Aucun chemin d'argent neuf : le pourcentage se repose sur chaque ligne, là
 * où il vivait déjà, derrière le même accord gérante (openApprove) et la même
 * liste de taux (KiwiDiscountPolicy). */
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
    toast(pct ? `Remise −${pct} % sur le ticket` : 'Remise supprimée');
  };
  const el = $('#mz-approvem', root);
  el.innerHTML = `
    <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
    <h3 class="modal-title">Remise sur le ticket</h3>
    <p class="modal-subtle">S'applique à tous les articles du ticket ${esc(t.num || '')}. Accord gérante requis.</p>
    <div class="mz-chips" id="mz-tkrem-chips">
      ${[0, ...pcts].map((r) => `<button class="mz-chip ${cur === r ? 'on' : ''}" data-mz-tkrem="${r}">${r === 0 ? 'Sans' : `−${r} %`}${r > 0 && !t.remiseAuth ? ' <i data-lucide="lock"></i>' : ''}</button>`).join('')}
    </div>`;
  openVeil('#mz-approve-veil');
  icons();
  $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-approve-veil'); });
  $('#mz-tkrem-chips', el).onclick = (e) => {
    const b = e.target.closest('[data-mz-tkrem]');
    if (!b) return;
    const pct = parseInt(b.dataset.mzTkrem, 10) || 0;
    if (pct > 0 && window.KiwiDiscountPolicy && !window.KiwiDiscountPolicy.allowed(pct, policyKey)) { toast('Pourcentage non autorisé'); return; }
    /* Retirer la remise n'a jamais demandé d'accord ; l'accorder, si. */
    closeVeil('#mz-approve-veil');
    if (!pct || t.remiseAuth) { apply(pct); return; }
    openApprove(pct, () => { closeVeil('#mz-approve-veil'); apply(pct); });
  };
}
