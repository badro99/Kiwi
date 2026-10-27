/* Les seuils du point du matin que le commerçant peut régler, côté serveur.
 * Mêmes bornes que LIMITS dans assets/briefing.js (tools/wave-11-i18n-test.mjs
 * compare les deux) : un appareil ancien ou bricolé ne peut plus ranger un
 * réglage hors bornes, que le navigateur ignorerait ensuite sans le dire. */
const INTEGER = new Set(['samples', 'events', 'cashCents', 'lateSamples', 'planningMinutes', 'weatherDays']);
const RANGE = {
  salesDrop: [1, 100], stockFactor: [0.1, 10], marginDrop: [0.1, 100], coverage: [1, 100], coverageGap: [0, 100],
  samples: [1, 4], events: [1, 100], share: [0.1, 100], multiple: [1, 10], cashCents: [1, 10000000],
  weatherEffect: [1, 100], lateMultiple: [1, 10], lateMinutes: [1, 240], lateSamples: [1, 100],
  planningMinutes: [1, 1440], rainMm: [0.1, 500], weatherDays: [1, 100],
};
export const BRIEFING_LIMITS = Object.fromEntries(Object.entries(RANGE).map(([k, [min, max]]) => [k, { min, max, integer: INTEGER.has(k) }]));

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
