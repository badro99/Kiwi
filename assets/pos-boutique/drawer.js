/* Le tiroir sans vente de la caisse boutique, sorti de sales.js (plafond de
 * taille, tools/file-size-ratchet-test.mjs). Mêmes octets de logique qu'avant. */
import { toast, pvReal, pvPaired } from '../pos-boutique.js?v=233';

/* Ouvrir le tiroir sans vente, le geste du restaurant
   (caisse-accounting/drawer.js) porté à la boutique : code manager validé
   par le serveur sur un vrai magasin, le coup part vers l'imprimante du
   comptoir (le tiroir y est branché), et l'ouverture laisse une trace à
   montant nul dans les mouvements du poste. `record` émet cette trace. */

/* God Mode : la console opérateur ouvre la caisse pour regarder, pas pour tenir
   un poste. Session opérateur prouvée par /api/me pour CE magasin
   (caisse-pairing.js) → pas d'écran de fond d'ouverture, pas de poste ouvert,
   rien d'écrit dans les comptes du commerçant. */
export function tillOperatorView() {
  try { const o = sessionStorage.getItem('kiwi:tillOperator:v1'); const p = pvPaired(); return !!(o && p && p.merchant === o); } catch (_) { return false; }
}

export function openDrawerNoSale(record) {
  const tr = (x) => (window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(x) : x);
  let off = false;
  try { off = !!(window.KiwiConfig && typeof window.KiwiConfig.off === 'function' && (window.KiwiConfig.off('open-drawer') || window.KiwiConfig.off('openDrawer'))); } catch (_) {}
  if (off) { toast(tr('Ouverture manuelle du tiroir désactivée pour cet établissement')); return; }
  const kick = () => {
    try { if (record) record({ movementKind: 'no-sale', movementAmountCents: 0, movementReason: 'Ouverture sans vente' }); } catch (_) {}
    const H = window.KiwiHardware;
    const fail = () => toast(tr("Tiroir injoignable · vérifiez l'imprimante du comptoir"));
    const p = (H && H.openDrawer) ? Promise.resolve(H.openDrawer()) : Promise.resolve({ ok: false });
    p.then((res) => { if (res && res.ok) toast(tr(res.mock ? 'Tiroir ouvert (démo)' : 'Tiroir ouvert')); else fail(); }, fail);
  };
  if (!pvReal()) { kick(); return; }
  /* Un vrai magasin n'ouvre jamais le tiroir sans le portier. */
  if (typeof window.requireManager !== 'function') return;
  if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: 'open_drawer', key: 'act.open_drawer' });
  window.requireManager('Ouvrir le tiroir sans vente', kick);
}
