/* Kiwi · caisse restaurant · les mouvements de tiroir qu'un plantage a fait perdre.
 *
 * 24 nov. 2026 (Browse) : « Butane », sortie de 120 MAD à 23:01, bien arrivée
 * au serveur. Première clôture juste à 23:10, puis l'impression plante, la
 * caisse repart d'un service sauvegardé SANS cette sortie, et la clôture de
 * 23:18 attend 3 031 MAD au lieu de 2 911 : −120 « non enregistré » pour un
 * tiroir exact. Les ventes se recousent depuis le serveur à la clôture
 * (syncSettledBusinessDay) ; les mouvements, jamais.
 *
 * Script classique chargé après caisse-accounting.js : cashMovements,
 * cashSessionId, persistShift, toast et fmtMAD sont les déclarations de tête
 * de la caisse, lues à l'appel. La clôture (caisse-accounting/closing.js)
 * l'appelle en ouvrant la feuille de comptage et avant de figer le rapport. */
function recoverLostCashMovements() {
  const C = window.KiwiCashSessions;
  if (!C || typeof C.recoverMovements !== 'function' || !shiftOpenedAt) return Promise.resolve(0);
  return C.recoverMovements(cashSessionId(), cashMovements).then((lost) => {
    const known = new Set(cashMovements.map(m => m && m.id));
    const fresh = (lost || []).filter(m => m && !known.has(m.id));
    if (!fresh.length) return 0;
    fresh.forEach(m => cashMovements.push(m));
    cashMovements.sort((a, b) => new Date(a.time) - new Date(b.time));
    try { persistShift(); } catch (_) {}
    try { refreshOpenReconciliationModals(); } catch (_) {}
    const tr = (window.KiwiCaisseLang || { tr: s => s }).tr;
    toast(fresh.length === 1
      ? tr('Mouvement de caisse retrouvé') + ' · ' + fmtMAD(fresh[0].amount)
      : fresh.length + ' ' + tr('mouvements de caisse retrouvés'));
    return fresh.length;
  }, () => 0);
}
