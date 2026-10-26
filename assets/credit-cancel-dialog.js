export function confirmCreditCancellation({ modal, credit, code, esc, fmtMAD, translate }) {
  return new Promise(resolve => {
    let settled = false;
    const done = value => { if (!settled) { settled = true; resolve(value); } };
    const m = modal({
      title: translate('Annuler cet avoir ?', 'Cancel this store credit?', 'إلغاء رصيد المتجر؟'),
      desc: translate('Cette annulation est définitive et journalisée.', 'This cancellation is permanent and logged.', 'هذا الإلغاء نهائي وسيتم تسجيله.'),
      body: `<p>${esc(code)} · ${fmtMAD(Number(credit.balanceCents || 0) / 100, 2)} ${translate('MAD', 'MAD', 'درهم')}</p>`,
      foot: `<button type="button" class="kb ghost" data-credit-back>${translate('Retour', 'Back', 'رجوع')}</button><button type="button" class="kb atlas" data-credit-confirm>${translate('Annuler définitivement', 'Cancel permanently', 'إلغاء نهائي')}</button>`,
    });
    const observer = new MutationObserver(() => { if (!m.el.isConnected) { observer.disconnect(); done(false); } });
    observer.observe(document.body, { childList: true });
    m.el.querySelector('[data-credit-back]').onclick = () => { done(false); m.close(); };
    m.el.querySelector('[data-credit-confirm]').onclick = () => { done(true); m.close(); };
  });
}
