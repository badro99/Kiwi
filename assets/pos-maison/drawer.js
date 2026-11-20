/* Le tiroir-caisse de la caisse maison.
 *
 * Le tiroir est branché en RJ11 sur l'imprimante du comptoir : il s'ouvre
 * quand elle reçoit l'impulsion ESC/POS (window.KiwiHardware.openDrawer, le
 * même chemin que la caisse restaurant). La caisse maison ne l'envoyait
 * jamais : ni après un encaissement en espèces, ni par un bouton. La Maison
 * en Vogue rendait la monnaie avec un tiroir fermé (20 nov. 2026) pendant
 * que son ancienne caisse, sur la même imprimante, l'ouvrait.
 *
 * Deux gestes, ceux du restaurant et de la boutique :
 *  - un encaissement qui contient des espèces ouvre le tiroir de lui-même ;
 *  - « Ouvrir le tiroir » l'ouvre sans vente, avec le code d'un responsable
 *    sur un vrai magasin, et laisse une trace à montant nul dans les
 *    mouvements du poste. */

const tr = (x) => (globalThis.window?.KiwiCaisseLang || { tr: (y) => y }).tr(x);

/* Coupé par l'opérateur (merchant_config) ? */
function switchedOff(key) {
  try { const C = window.KiwiConfig; return !!(C && typeof C.off === 'function' && C.off(key)); } catch (_) { return false; }
}

/* L'impulsion elle-même. Rend la promesse de KiwiHardware ({ ok, mock }). */
export function mzKick() {
  const H = globalThis.window && window.KiwiHardware;
  return (H && typeof H.openDrawer === 'function') ? Promise.resolve(H.openDrawer()).catch(() => ({ ok: false })) : Promise.resolve({ ok: false });
}

/* Un encaissement est posé : s'il contient des espèces, le tiroir s'ouvre pour
   la monnaie. Un échec est dit (une fois par minute), sinon la caissière
   cherche une clé alors que c'est l'imprimante qui ne répond pas. */
let lastFail = 0;
export function mzKickForCash(parts, toast) {
  const cash = (parts || []).some((p) => p && p.m === 'espèces' && +p.amount > 0);
  if (!cash) return Promise.resolve(null);
  return mzKick().then((res) => {
    if (!(res && res.ok) && Date.now() - lastFail > 60000) {
      lastFail = Date.now();
      if (toast) toast(tr("Tiroir injoignable · vérifiez l'imprimante du comptoir"));
    }
    return res;
  });
}

/* « Ouvrir le tiroir » sans vente. t = { real(), record(movement), toast }. */
export function mzOpenDrawerNoSale(t) {
  if (switchedOff('open-drawer') || switchedOff('openDrawer')) { t.toast(tr('Ouverture manuelle du tiroir désactivée pour cet établissement')); return false; }
  const kick = () => {
    try { if (t.record) t.record({ movementKind: 'no-sale', movementAmountCents: 0, movementReason: 'Ouverture sans vente' }); } catch (_) {}
    const fail = () => t.toast(tr("Tiroir injoignable · vérifiez l'imprimante du comptoir"));
    return mzKick().then((res) => { if (res && res.ok) t.toast(tr(res.mock ? 'Tiroir ouvert (démo)' : 'Tiroir ouvert')); else fail(); }, fail);
  };
  if (!t.real()) { kick(); return true; }
  /* Un vrai magasin n'ouvre jamais le tiroir sans le portier (fermé s'il manque). */
  if (typeof window.requireManager !== 'function') { t.toast(tr('Code manager ou propriétaire requis')); return false; }
  if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: 'open_drawer', key: 'act.open_drawer' });
  window.requireManager('Ouvrir le tiroir sans vente', kick);
  return true;
}
