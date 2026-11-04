/* The manager code (and, for a corrective revision, its reason) is asked in the
 * product's own modal, not window.prompt: the Kiwi modal owns focus, dismissal,
 * keyboard and phone/native layout. The code lives only in this sheet and the
 * server request that follows (verified there, never compared or logged here).
 * Resolves { pin, reason } on confirm, or null when the sheet is dismissed. */
export function reviewProof(kit, tx, { withReason = false } = {}) {
  return new Promise(resolve => {
    const reasonField = withReason
      ? `<label>${tx('Motif de la révision corrective (au moins 10 caractères) :')}<textarea name="reason" rows="3" maxlength="500" required></textarea></label>`
      : '';
    const modal = kit.modal({
      title: tx('Confirmation Direction / Gérant'), width: 460,
      body: `<form novalidate>${reasonField}
        <label>${tx('Code PIN Direction / Gérant (si non connecté avec le compte propriétaire) :')}<input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="4"></label>
        <div data-review-error role="alert"></div>
        <div class="hx-close-actions"><button type="button" class="hx-btn" data-dismiss>${tx('Annuler')}</button><button type="submit" class="hx-btn atlas">${tx('Confirmer')}</button></div>
      </form>` });
    const form = modal.el.querySelector('form');
    let done = false;
    const finish = value => { if (done) return; done = true; observer.disconnect(); form.elements.pin.value = ''; modal.close(); resolve(value); };
    const observer = new MutationObserver(() => { if (!modal.el.classList.contains('in') || !modal.el.isConnected) finish(null); });
    observer.observe(modal.el, { attributes: true, attributeFilter: ['class', 'style'] });
    form.onsubmit = event => {
      event.preventDefault();
      const reason = withReason ? String(form.elements.reason.value || '').trim() : '';
      if (withReason && reason.length < 10) {
        modal.el.querySelector('[data-review-error]').textContent = tx('Un motif d’au moins 10 caractères est obligatoire.');
        form.elements.reason.focus();
        return;
      }
      finish({ pin: String(form.elements.pin.value || ''), reason });
    };
  });
}
