/* Le tarif du ticket pour les modules de la caisse boutique (assets/till-price-list.js).
 * Passé par import plutôt que lu comme un global : la caisse boutique ne gagne
 * aucun couplage (tools/coupling-ratchet-test.mjs). null en démo sans module. */
import '../till-price-list.js?v=2';

export const tillPriceList = () => window.KiwiTillPriceList || null;
