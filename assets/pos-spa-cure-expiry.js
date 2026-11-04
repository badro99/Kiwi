/* Spa · la validité d'une cure, modifiable par le personnel.
 *
 * Une cure d'avant la date de validité reçoit la validité standard depuis le
 * jour de la mise à jour (assets/trade-workspace-schema.js › grandfatherCures) ;
 * le personnel peut la corriger ici. La date s'affiche sur la fiche et la carte
 * de la cliente (assets/pos-spa.js). Les outils d'écran viennent de la caisse. */
const tr = (text) => (window.KiwiCaisseLang && window.KiwiCaisseLang.tr ? window.KiwiCaisseLang.tr(text) : text);

export function openExpiryEditor({ cure, label, el, openVeil, closeVeil, icons, toast, esc, onSaved }) {
  if (!cure || !el) return;
  const veil = '#sp-punch-veil';
  el.innerHTML = `
      <button class="sp-modal-x" data-sp-close aria-label="${esc(tr('Fermer'))}"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${esc(tr('Validité de la cure'))}</h3>
      <p class="modal-subtle">${esc(label)}</p>
      <label class="sp-field"><span>${esc(tr('Dernier jour de validité'))}</span><input id="sp-exp-date" type="date" value="${esc(cure.expiresOn || '')}"></label>
      <p class="sp-foot-note">${esc(tr('Cette date s’affiche sur la fiche et la carte de la cliente.'))}</p>
      <div class="sp-sheet-foot">
        <button class="sp-btn secondary" data-sp-close>${esc(tr('Annuler'))}</button>
        <button class="sp-btn primary" id="sp-exp-ok"><i data-lucide="check"></i>${esc(tr('Enregistrer'))}</button>
      </div>`;
  openVeil(veil);
  icons();
  el.querySelectorAll('[data-sp-close]').forEach((button) => { button.onclick = () => closeVeil(veil); });
  el.querySelector('#sp-exp-ok').onclick = () => {
    const value = el.querySelector('#sp-exp-date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(new Date(value + 'T12:00:00'))) { toast(tr('Choisissez une date valide')); return; }
    const schema = window.KiwiTradeSchema;
    cure.expiresOn = value; cure.expirySource = 'staff-edited';
    cure.expirySourceOn = (schema && schema.businessDayKey && schema.businessDayKey(Date.now())) || value;
    closeVeil(veil);
    toast(tr('Validité de la cure mise à jour'));
    if (onSaved) onSaved();
  };
}
