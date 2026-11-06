/* Caisse boutique et maison · l'heure du comptoir.
 *
 * Une vente porte l'heure corrigée de la caisse (KiwiLive.now(), recalée sur le
 * serveur par assets/pairing-commit.js). Tout ce qui décide d'une journée
 * commerciale, d'une rétention, d'une fenêtre de retour, d'un rapport Z ou d'une
 * promotion doit lire la MÊME horloge : avec Date.now() brut, une tablette mal
 * réglée classe le Z, le retour et la vente sur trois jours différents près de
 * 05:00. Sans correction apprise (démo, tableau de bord), c'est l'appareil. */
const root = () => globalThis.window || globalThis;
export function tillNow() {
  const w = root();
  try {
    const t = Number(w.KiwiLive && typeof w.KiwiLive.now === 'function' ? w.KiwiLive.now() : NaN);
    if (Number.isFinite(t) && t > 0) return t;
  } catch (_) {}
  try {
    const c = w.KiwiTrustedClock, skew = Number(c && typeof c.skewMs === 'function' ? c.skewMs() : 0);
    if (Number.isFinite(skew) && skew) return Date.now() + skew;
  } catch (_) {}
  return Date.now();
}
export const tillDate = () => new Date(tillNow());
