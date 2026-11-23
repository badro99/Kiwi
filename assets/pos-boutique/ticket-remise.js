/* La remise de TICKET et le libellé du bouton « Clientes » du pied 2027,
 * sortis de sales.js (plafond de taille, tools/file-size-ratchet-test.mjs).
 * Rien n'est importé : sales.js passe ses propres fonctions, donc c'est SON
 * code qui tourne (openApprove, le rendu, le propriétaire du ticket). */
import { spreadTicket, maxPct } from './bargain.js?v=3';
import { mountBargain } from './bargain-ui.js?v=4';

export function ticketRemise(d) {
  const { state, root, $, $$, tr, icons, toast, clById, firstName, ticketOwner,
    renderTicket, renderGrid, renderBadges, openVeil, closeVeil, openApprove } = d;

  /* Le nom porté par le bouton « Clientes » du pied 2027. */
  function ticketClientLabel(t) {
    if (!t.client) return tr('Clients');
    if (t.client === 'passage') return tr('Cliente de passage');
    const c = clById(t.client);
    return c && c.name ? firstName(c.name) || c.name : tr('Clients');
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
    window.KiwiDiscountPolicy?.refresh?.(); // the owner may have lowered the allowed percentages
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
      + '<h3 class="modal-title"></h3><div class="bq-bargain" id="bq-tkrem-bargain"></div>'
      + '<div class="bq-sheet-foot" id="bq-tkrem-foot" hidden><button class="bq-btn primary" id="bq-tkrem-apply" disabled></button></div>';
    $('.bq-modal-x', el).setAttribute('aria-label', tr('Fermer'));
    $('.modal-title', el).textContent = tr('Remise');
    /* « Kolchi b 500 » : le total convenu ou les dirhams retirés du ticket,
       répartis sur les pièces par spreadTicket (bargain.js), derrière le même
       accord gérante que le pourcentage. */
    const rows = t.lines.map((ln, i) => ({ key: i, base: d.pieceBase(ln), qty: ln.qty }));
    const T0 = Math.round(rows.reduce((s, r) => s + Math.round(r.base * 100) * r.qty, 0)) / 100;
    let last = null;
    mountBargain($('#bq-tkrem-bargain', el), {
      tr, fmt: d.fmt, base: T0,
      chipsHTML: '<div class="bq-chips" id="bq-tkrem-chips"></div>',
      evaluate: (mode, value) => {
        const target = mode === 'price' ? value : Math.round((T0 - value) * 100) / 100;
        if (!(target > 0)) return { error: 'floor', floor: spreadTicket(rows, 0.01, maxPct(pcts)).floor || 0 };
        const r = spreadTicket(rows, target, maxPct(pcts));
        /* Sous le prix minimum : « Appliquer quand même », derrière l'accord
           gérante ; chaque pièce garde au moins un centime. */
        if (r.error === 'floor') {
          const f = spreadTicket(rows, target, 99.99);
          return f.error ? r : { ...r, forced: { after: target, cut: Math.round((T0 - target) * 100) / 100, assign: f.assign } };
        }
        return r.error ? r : { after: target, cut: Math.round((T0 - target) * 100) / 100, assign: r.assign };
      },
      onChange: (r) => {
        last = r;
        $('#bq-tkrem-foot', el).hidden = r.mode === 'pct';
        const btn = $('#bq-tkrem-apply', el);
        const forced = r.error === 'floor' && r.res && r.res.forced;
        btn.disabled = !r.ok && !forced;
        btn.textContent = r.ok ? tr('Appliquer') + ' · ' + d.fmt(r.res.after)
          : forced ? tr('Appliquer quand même') + ' · ' + d.fmt(forced.after) : tr('Appliquer');
      },
    });
    $('#bq-tkrem-apply', el).textContent = tr('Appliquer');
    $('#bq-tkrem-apply', el).onclick = () => {
      const r0 = last;
      const forced = r0 && r0.error === 'floor' && r0.res && r0.res.forced;
      if (!r0 || (!r0.ok && !forced)) return;
      const r = forced ? { ...r0, res: forced } : r0;
      const agree = () => {
        closeVeil('#bq-approve-veil');
        ticketOwner.agreeTicket(t, r.res.assign);
        renderTicket(); renderGrid(); renderBadges(); icons();
        toast(tr('Prix convenu') + ' ' + d.fmt(r.res.after));
      };
      if (t.remiseAuth) { agree(); return; }
      openApprove(0, agree, { mode: r.mode, value: r.value, label: tr('Prix convenu') + ' ' + d.fmt(r.res.after), cut: d.fmt(r.res.cut) });
    };
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
