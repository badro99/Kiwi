/* Inventaire Maison · « Avances expirées » (21 nov. 2026).
 * Le pendant de assets/pos-boutique/avance-restock.js : l'écran de scan et la
 * règle vivent dans assets/retail-avance.js. Ici seulement ce que la Maison
 * possède : son catalogue (le code scanné → la pièce), sa remise en stock
 * (releaseStock sait rendre une pièce vendue au détail au dépareillé,
 * persistStock écrit la ligne du journal), son registre d'avoirs et son bon. */
import { openAvanceRestock, expiredAvances, retailModes } from '../retail-avance.js?v=4';
import { merchantSlug, persistStock, AVOIRS, persistAvoirs, renderBadges, creditFromServer, toast, root } from '../pos-maison.js?v=247';
import { clById, openCamScan, esc, releaseStock } from './sales.js?v=160';
import { catDB, normScan, armScanCapture, disarmScanCapture, openVoucher } from './checkout.js?v=160';

function deps(refresh) {
  return {
    root, merchant: merchantSlug(), R: window.KiwiRetailBalances,
    customerName: (id) => (clById(id) || {}).name || '',
    resolveScan: (raw) => {
      const hit = catDB() && catDB().findByBarcode(normScan(raw));
      return hit && hit.product ? { pid: hit.product.id, size: hit.variant.size || '' } : null;
    },
    armScan: armScanCapture, disarmScan: disarmScanCapture,
    openCam: (onCode) => openCamScan((code) => onCode(code)),
    restock: (line, ref) => {
      const back = releaseStock(line.pid, line.size, line.qty, line.piece === true);
      persistStock(line.pid, line.size, line.color, back, { ref, why: 'retour avance' });
      return true;
    },
    onCredit: (credit) => {
      const av = creditFromServer(credit);
      const old = AVOIRS.findIndex((item) => item.code === av.code);
      if (old >= 0) AVOIRS.splice(old, 1, av); else AVOIRS.unshift(av);
      persistAvoirs(); renderBadges();
      openVoucher(av, { mode: 'fresh' });
    },
    toast, refresh,
  };
}

/* Le bouton, dans la rangée d'outils de l'inventaire, avec le nombre d'avances
   à reprendre quand le registre répond. Rien quand God mode coupe l'avance. */
export function mountAvanceButton(panel, refresh) {
  const R = window.KiwiRetailBalances;
  const tools = panel && panel.querySelector('.mzi-tools');
  if (!tools || !R || !retailModes('maison').avance || tools.querySelector('#mzi-avances')) return;
  const button = document.createElement('button');
  button.className = 'mz-btn'; button.id = 'mzi-avances'; button.type = 'button';
  button.innerHTML = `<i data-icon="event_busy"></i><span>${esc('Avances expirées')}</span>`;
  button.onclick = () => { void openAvanceRestock(deps(refresh)); };
  tools.appendChild(button);
  R.listWithStatus(merchantSlug(), '').then(({ rows }) => {
    const n = expiredAvances(rows, R).length;
    const label = button.querySelector('span');
    if (label && n) label.textContent = `Avances expirées · ${n}`;
  }).catch(() => {});
}
