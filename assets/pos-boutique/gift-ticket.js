/* Encaissement des caisses boutique et maison · « Ticket cadeau ». Une pastille posée
 * au-dessus des modes de paiement, comme « Vendu par » (seller-pick.js) : la
 * caissière la touche quand la cliente offre l'article, et le ticket cadeau
 * sort juste après le reçu, sans les prix, avec un mot pour celle ou celui qui
 * le reçoit (assets/receipt-gift.js).
 *
 * · God mode › « Ticket cadeau (sans les prix) » (features.giftReceipt), éteint
 *   par défaut : sans l'option, rien ne s'affiche.
 * · Le choix vit le temps d'un encaissement : il tient si l'écran se redessine
 *   (paiement en deux fois) et repart éteint à la vente suivante.
 * · Le reçu normal sort toujours : le ticket cadeau s'y ajoute, il ne le
 *   remplace pas. Il se réimprime aussi depuis « Réimprimer » (pos-reprint.js). */

import '../receipt-gift.js?v=3';   // pose KiwiReceipt.ext.gift (la caisse est à son plafond de balises <script>)

const tr = (s) => { try { return (globalThis.window?.KiwiCaisseLang || { tr: (x) => x }).tr(s); } catch (_) { return s; } };
const gift = () => globalThis.window?.KiwiReceipt?.ext?.gift || null;

export function giftTicketOn() {
  const g = gift();
  return !!(g && g.enabled());
}

/* prefix : 'bq' (boutique) ou 'mz' (maison), les classes de la fiche de paiement. */
export function giftTicket({ esc = (s) => String(s), toast = () => {}, prefix = 'bq', trade = 'boutique' } = {}) {
  let want = false;
  return {
    /* el : la fiche de paiement qui vient d'être dessinée. */
    chip(el) {
      if (!el || !giftTicketOn()) return;
      const anchor = el.querySelector('.' + prefix + '-pay-opts');
      if (!anchor) return;
      const old = el.querySelector('.' + prefix + '-gift');
      if (old) old.remove();
      anchor.insertAdjacentHTML('beforebegin', `<div class="${prefix}-split ${prefix}-gift">
        <span class="${prefix}-split-l">${esc(tr('Cadeau'))}</span>
        <button type="button" class="${prefix}-split-c${want ? ' is-on' : ''}" data-kx-gift aria-pressed="${want}"
          style="display:inline-flex;align-items:center;gap:6px;"><i data-icon="redeem" style="display:inline-flex;width:16px;height:16px;"></i>${esc(tr('Ticket cadeau, sans les prix'))}</button>
      </div>`);
      try { globalThis.window?.lucide?.createIcons(); } catch (_) {}
      const btn = el.querySelector('[data-kx-gift]');
      btn.addEventListener('click', () => {
        want = !want;
        btn.classList.toggle('is-on', want);
        btn.setAttribute('aria-pressed', String(want));
      });
    },
    /* Appelé une fois la vente écrite, juste AVANT que son reçu parte. `opts`
       est celui de l'encaissement : ref, lignes, vente. Le ticket cadeau attend
       que le reçu soit sorti (receipt.js annonce « kiwi:receipt-print ») : deux
       tickets envoyés en même temps mêleraient leurs octets sur une imprimante
       Bluetooth ou USB. Sans annonce (livraison, pas d'imprimante), il part
       après quelques secondes. */
    print(opts) {
      if (!want || !giftTicketOn() || !opts) return;
      want = false;
      const w = globalThis.window;
      let gone = false;
      const go = () => {
        if (gone) return;
        gone = true;
        try { w.removeEventListener('kiwi:receipt-print', go); } catch (_) {}
        setTimeout(() => this.send(opts), 400);
      };
      try { w.addEventListener('kiwi:receipt-print', go); } catch (_) {}
      setTimeout(go, 4000);
    },
    send(opts) {
      const K = globalThis.window?.KiwiReceipt;
      let base = null;
      try {
        base = K.build({
          ref: opts.ref || '',
          ts: (opts.sale && opts.sale.at) || Date.now(),
          lines: (opts.lines || []).map((l) => ({ qty: l.qty, name: l.name, total: l.amount, barcode: l.barcode })),
          total: opts.amount,
        });
      } catch (_) { base = null; }
      if (!base) { toast(tr('Ticket cadeau indisponible')); return; }
      gift().print(base, opts.sale && opts.sale.id ? trade + ':' + opts.sale.id : '', true).then(
        (r) => toast(tr(r && r.ok ? (r.via === 'queue' ? 'Ticket cadeau envoyé à l’imprimante' : 'Ticket cadeau imprimé') : 'Ticket cadeau non imprimé · aucune imprimante')),
        () => toast(tr('Ticket cadeau non imprimé · aucune imprimante')));
    },
  };
}
