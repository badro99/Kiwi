/* Le pays d'exploitation d'un commerce (owner, 24 nov. 2026 : « add a toggle in
 * godmode so that we can choose the country of operations »). La table vit dans
 * assets/country-catalog.js, lue aussi par les écrans ; ici, seulement la lecture
 * de merchant_config.country. Silence, panne ou base pas migrée : le Maroc, la
 * valeur que tout commerce avait avant ce réglage. */
import Countries from '../../assets/country-catalog.js';

export { Countries };

export async function merchantCountry(env, merchant) {
  if (!env || !env.DB || !merchant) return Countries.DEFAULT;
  try {
    const row = await env.DB.prepare('SELECT country FROM merchant_config WHERE merchant = ?').bind(String(merchant)).first();
    return Countries.normalize(row && row.country);
  } catch (_) { return Countries.DEFAULT; }
}
