/* La remise de TICKET et le libellé du bouton « Clientes » du pied 2027,
 * sortis de sales.js (plafond de taille, tools/file-size-ratchet-test.mjs).
 * Rien n'est importé : sales.js passe ses propres fonctions, donc c'est SON
 * code qui tourne (openApprove, le rendu, le propriétaire du ticket). */
export function ticketRemise(d) {
  const { state, root, $, $$, tr, icons, toast, clById, firstName, ticketOwner,
    renderTicket, renderGrid, renderBadges, openVeil, closeVeil, openApprove } = d;

  /* Le nom porté par le bouton « Clientes » du pied 2027. */
  function ticketClientLabel(t) {
    if (!t.client) return tr('Clientes');
    if (t.client === 'passage') return tr('Cliente de passage');
    const c = clById(t.client);
    return c && c.name ? firstName(c.name) || c.name : tr('Clientes');
  }

  /* ---------- la remise de TICKET (pied 2027) ---------- */
  /* Le restaurant a « Remise » au pied de l'addition ; la boutique ne l'avait
     qu'à l'article, dans la feuille d'ajout, donc une ligne déjà au ticket ne
     pouvait plus être remisée (propriétaire, 2026-10-28). Ce choisisseur ne
     fabrique AUCUN chemin d'argent neuf : il repose le pourcentage sur chaque
     ligne, là où il vivait déjà, derrière le même portier gérante
     (openApprove) et la même liste de taux (KiwiDiscountPolicy).

     Le drapeau de peau ne se lit PAS ici : il appartient au fichier du métier
     (pos-boutique.js, bqKitSkin) et descend par import — boutique-2027-test
     l'exige, pour qu'une seule ligne au monde décide si la peau est là. */
  function openTicketRemise() {
    const t = state.ticket;
    if (!t.lines.length) return;
    const pcts = (window.KiwiDiscountPolicy?.percentages(d.bqKey()) || [5, 10, 15, 20]).filter((p) => p > 0);
    const cur = t.lines.length && t.lines.every((l) => l.remise === t.lines[0].remise) ? (t.lines[0].remise || 0) : null;
    const apply = (pct) => {
      ticketOwner.discountAllLines(t, pct);
      renderTicket(); renderGrid(); renderBadges(); icons();
      toast(pct ? tr('Remise') + ' −' + pct + ' %' : tr('Remise supprimée'));
    };
    const el = $('#bq-approvem', root);
    /* Le squelette d'abord, les mots ensuite, chacun par tr() : aucune
       phrase n'est collée dans le gabarit. */
    el.innerHTML = '<button class="bq-modal-x" data-bq-close><i data-icon="close"></i></button>'
      + '<h3 class="modal-title"></h3><div class="bq-chips" id="bq-tkrem-chips"></div>';
    $('.bq-modal-x', el).setAttribute('aria-label', tr('Fermer'));
    $('.modal-title', el).textContent = tr('Remise');
    [0].concat(pcts).forEach((r) => {
      const b = document.createElement('button');
      b.className = 'bq-chip' + (cur === r ? ' on' : '');
      b.dataset.bqTkrem = String(r);
      b.textContent = r ? '−' + r + ' %' : tr('Sans');
      $('#bq-tkrem-chips', el).appendChild(b);
    });
    openVeil('#bq-approve-veil');
    icons();
    $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-approve-veil'); });
    $('#bq-tkrem-chips', el).onclick = (e) => {
      const b = e.target.closest('[data-bq-tkrem]');
      if (!b) return;
      const pct = parseInt(b.dataset.bqTkrem, 10) || 0;
      /* Retirer la remise n'a jamais demandé d'accord ; l'accorder, si. */
      if (!pct || t.remiseAuth) { closeVeil('#bq-approve-veil'); apply(pct); return; }
      openApprove(pct, () => { closeVeil('#bq-approve-veil'); apply(pct); });
    };
  }

  return { ticketClientLabel, openTicketRemise };
}
