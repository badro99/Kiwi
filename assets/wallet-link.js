/* La carte Wallet sur le reçu des caisses boutique et maison : le lien du QR
 * (/carte/<boutique>?r=<vente>) et son dessin pour le ticket imprimé par le
 * système. Tout vient d'assets/wallet-till.js ; ce module évite aux caisses de
 * lire un global de plus (tools/coupling-ratchet-test.mjs). Rien si la carte
 * n'est pas activée, si un client est sur la vente, ou hors caisse. */
export function walletCard(sale) {
  try {
    const W = window.KiwiWalletTill;
    const cardUrl = (W && W.cardUrl(sale)) || '';
    return cardUrl ? { cardUrl, cardSvg: (W.cardSvg && W.cardSvg(cardUrl)) || '' } : {};
  } catch (_) { return {}; }
}
