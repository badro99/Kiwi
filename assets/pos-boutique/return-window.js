/* Caisse boutique · la fenêtre de retour du commerçant.
 *
 * Le réglage (0 à 90 jours, 7 par défaut) se pose au tableau de bord et vit
 * dans le document `policies` (assets/merchant-policies.js). Ici la caisse le
 * lit et l'applique sur la journée d'activité (05:00), comme le Z :
 *  · le journal garde assez de jours pour retrouver les ventes de la fenêtre
 *    (au moins 7 jours, au plus 30 : au-delà le journal local dépasserait le
 *    quota du navigateur ; une vente plus ancienne se lit sur le serveur, une
 *    journée à la fois, quand la caissière choisit cette date : old-sales.js) ;
 *  · une vente hors fenêtre se retourne seulement avec l'accord d'un
 *    responsable : la caisse l'annonce et signe `windowOverride` dans
 *    l'accord (/api/pin/verify), que le serveur exige au remboursement et à
 *    l'émission d'un avoir (functions/api/_return-window.js). */
import '../merchant-policies.js?v=4';
import { tillNow } from './till-clock.js?v=2';

const MIN_KEPT = 7, MAX_KEPT = 30;
const policies = () => globalThis.KiwiPolicies || null;

export const windowDays = () => { const P = policies(); return P ? P.returnWindowDays() : 7; };
/* Le nombre de jours de ventes que le journal local conserve. */
export const retainDays = () => Math.max(MIN_KEPT, Math.min(MAX_KEPT, windowDays()));
/* Vrai quand la vente est hors de la fenêtre. `dayKeyOf` est la clé de journée
   d'activité de la caisse (retDayKey) ; une date inconnue ne bloque pas. */
export function outsideWindow(at, dayKeyOf) {
  const P = policies();
  if (!P || !at) return false;
  return !P.inReturnWindow(dayKeyOf(at), dayKeyOf(tillNow()), windowDays());
}
/* Le sous-titre de la page Échanges, avec la vraie fenêtre. */
export function windowSentence() {
  const n = windowDays();
  if (n === 0) return 'Retour sur accord d’un responsable seulement, échange ou avoir, jamais de remboursement espèces';
  if (n === 1) return 'Retour le jour de l’achat avec ticket, échange ou avoir, jamais de remboursement espèces';
  return `Retour sous ${n} jours avec ticket, échange ou avoir, jamais de remboursement espèces`;
}
