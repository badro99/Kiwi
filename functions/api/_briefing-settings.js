/* Les seuils du point du matin que le commerçant peut régler, côté serveur.
 * Les bornes viennent de la table commune functions/api/_briefing-limits.js,
 * la même dont assets/briefing.js porte une copie générée : un appareil ancien
 * ou bricolé ne peut plus ranger un réglage hors bornes, que le navigateur
 * ignorerait ensuite sans le dire. */
import { BRIEFING_FIELDS } from './_briefing-limits.js';

export const BRIEFING_LIMITS = Object.fromEntries(Object.entries(BRIEFING_FIELDS).map(([k, f]) => [k, { min: f.min, max: f.max, integer: !!f.integer }]));

/* Garde les réglages valides et leur horloge ; jette le reste. Les jours ne
 * sont pas touchés ici (ownBriefingDays s'en charge). */
export function cleanBriefingSettings(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
  if (doc.settings === undefined && doc.settingsFieldsAt === undefined) return doc;
  const settings = {}, clocks = {};
  const raw = doc.settings && typeof doc.settings === 'object' ? doc.settings : {};
  const at = doc.settingsFieldsAt && typeof doc.settingsFieldsAt === 'object' ? doc.settingsFieldsAt : {};
  for (const [key, spec] of Object.entries(BRIEFING_LIMITS)) {
    const n = raw[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < spec.min || n > spec.max || (spec.integer && !Number.isInteger(n))) continue;
    settings[key] = n;
    if (typeof at[key] === 'number' && Number.isFinite(at[key])) clocks[key] = at[key];
  }
  return { ...doc, settings, settingsFieldsAt: clocks };
}
