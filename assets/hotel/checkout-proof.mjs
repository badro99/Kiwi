/* The existing Kiwi modal owns focus, dismissal and keyboard navigation.
 * A code lives only in this sheet and the ensuing server request. */
export function checkoutProof(kit, tx, amount) {
  return new Promise(resolve => {
    const modal = kit.modal({ title: tx('Départ avec solde impayé'),
      desc: tx('Il reste {amount} MAD à régler. Confirmer le départ avec ce solde impayé ?', { amount }),
      body: `<form><label>${tx('Code manager (facultatif pour le propriétaire)')}<input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="4"></label><button type="submit">${tx('Confirmer le départ')}</button></form>` });
    const form = modal.el.querySelector('form');
    let done = false;
    const finish = value => { if (done) return; done = true; observer.disconnect(); form.elements.pin.value = ''; modal.close(); resolve(value); };
    const observer = new MutationObserver(() => { if (!modal.el.classList.contains('in') || !modal.el.isConnected) finish(null); });
    observer.observe(modal.el, { attributes: true, attributeFilter: ['class', 'style'] });
    form.onsubmit = event => { event.preventDefault(); finish(form.elements.pin.value); };
  });
}
