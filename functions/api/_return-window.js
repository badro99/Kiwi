/* La fenêtre de retour du commerçant, relue côté serveur.
 *
 * Le comptoir refuse déjà une vente hors fenêtre sans l'accord d'un
 * responsable ; ce fichier est la même règle au remboursement et à l'émission
 * d'un avoir, pour qu'une caisse en retard, ou autre chose qu'une caisse, ne la
 * contourne pas. La règle elle-même (assets/merchant-policies.js) est partagée
 * avec la caisse. L'accord du responsable qui sait que la vente est hors
 * fenêtre porte `windowOverride` dans sa capacité signée (/api/pin/verify). */
import Policies from '../../assets/merchant-policies.js';
import { readDoc } from './_doc-cas.js';
import { businessDate, merchantCutoff, merchantZone } from './_business-day.js';

export async function merchantReturnDays(env, merchant) {
  const { data } = await readDoc(env, merchant, 'policies', {});
  return Policies.cleanReturnDays(data && data.returnWindowDays);
}

/* '' quand le retour peut se faire ; sinon le code d'erreur à renvoyer. Une
   vente sans date lisible ne bloque pas : rien ne prouve qu'elle est ancienne. */
export async function returnWindowError(env, merchant, saleTs, proof, now = Date.now()) {
  const ts = Number(saleTs);
  if (!Number.isFinite(ts) || ts <= 0) return '';
  if (proof && proof.windowOverride === true) return '';
  const days = await merchantReturnDays(env, merchant);
  const [cutoff, zone] = await Promise.all([merchantCutoff(env, merchant), merchantZone(env, merchant)]);
  return Policies.inReturnWindow(businessDate(ts, cutoff, zone), businessDate(now, cutoff, zone), days) ? '' : 'return-window-closed';
}
