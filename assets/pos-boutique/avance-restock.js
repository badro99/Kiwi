/* Inventaire boutique · « Avances expirées » (21 nov. 2026).
 * Le bouton et ses branchements ; l'écran de scan et la règle vivent dans
 * assets/retail-avance.js, partagé avec la caisse Maison. Ici seulement ce que
 * la boutique possède : son catalogue (le code scanné → la pièce), sa remise en
 * stock (persistStock écrit aussi le journal des mouvements), son registre
 * d'avoirs et son bon d'avoir. Un fichier à part : inventory.js ne grossit pas. */
import { openAvanceRestock, expiredAvances, retailModes } from '../retail-avance.js?v=4';
import { merchantSlug, persistStock, stockAdd, AVOIRS, persistAvoirs, renderBadges, creditFromServer, toast, root } from '../pos-boutique.js?v=352';
import { clById, openCamScan, esc } from './sales.js?v=246';
import { catDB, normScan, armScanCapture, disarmScanCapture, openVoucher } from './checkout.js?v=246';

const tr = (x) => (globalThis.window?.KiwiCaisseLang || { tr: (y) => y }).tr(x);

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
      const ok = persistStock(line.pid, line.size, line.color, line.qty, ref, 'retour avance');
      stockAdd(line.pid, line.size, line.qty);
      return ok !== false;
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
  const tools = panel && panel.querySelector('.bqi-tools');
  if (!tools || !R || !retailModes('boutique').avance || tools.querySelector('#bqi-avances')) return;
  const button = document.createElement('button');
  button.className = 'bq-btn'; button.id = 'bqi-avances'; button.type = 'button';
  button.innerHTML = `<i data-icon="event_busy"></i><span>${esc(tr('Avances expirées'))}</span>`;
  button.onclick = () => { void openAvanceRestock(deps(refresh)); };
  tools.appendChild(button);
  R.listWithStatus(merchantSlug(), '').then(({ rows }) => {
    const n = expiredAvances(rows, R).length;
    const label = button.querySelector('span');
    if (label && n) label.textContent = `${tr('Avances expirées')} · ${n}`;
  }).catch(() => {});
}
