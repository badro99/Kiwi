/* Échange sans ticket · caisse Maison · l'entrée.
 * docs/specs/2026-11-23-maison-echange-sans-ticket.md
 *
 * Le bouton vit dans l'en-tête de la page des retours (checkout.js). Cette
 * entrée ne donne que son libellé et charge la feuille au premier geste, par
 * import() : la feuille importe la caisse, et un import statique depuis
 * checkout.js l'aurait fait entrer dans le cycle des modules Maison
 * (tools/coupling-ratchet-test.mjs). */
import { phrase, tillLang } from './gift-exchange-core.js?v=2';

export const gxLabel = () => phrase('Échange sans ticket', tillLang()).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!(e.target && e.target.closest && e.target.closest('[data-mz-gift-exch]'))) return;
    import('./gift-exchange.js?v=29').then((m) => m.openGiftExchange()).catch(() => {});
  });
}
