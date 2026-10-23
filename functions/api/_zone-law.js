// Droit marocain : UTC permanent dès le 20 septembre 2026, même avec un ICU ancien.
const ZONE_LAWS = [{ zones: ['Africa/Casablanca', 'Africa/El_Aaiun'], from: 1789866000000, zone: 'UTC', probe: 1790856000000 }];
let stale;
function effectiveZone(zone, epoch) {
  const rule = ZONE_LAWS[0];
  if (!rule.zones.includes(zone) || +epoch < rule.from || !Number.isFinite(+epoch)) return zone;
  if (stale === undefined) {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: rule.zones[0], hour: '2-digit', hourCycle: 'h23' }).formatToParts(rule.probe);
    stale = Number(p.find(x => x.type === 'hour').value) !== 12;
  }
  return stale ? rule.zone : zone;
}
// Le choix se fait par instant, pas à la création du cache : un rapport peut traverser la réforme.
function zoneDateTimeFormat(locale, options) {
  const base = new Intl.DateTimeFormat(locale, options);
  if (!ZONE_LAWS[0].zones.includes(options && options.timeZone) || effectiveZone(options.timeZone, ZONE_LAWS[0].probe) === options.timeZone) return base;
  const format = base.format, parts = base.formatToParts.bind(base);
  let utc;
  const corrected = epoch => {
    const zone = effectiveZone(options.timeZone, epoch === undefined ? Date.now() : epoch);
    return zone === options.timeZone ? null : (utc || (utc = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone })));
  };
  Object.defineProperties(base, {
    format: { configurable: true, value: epoch => { const f = corrected(epoch); return f ? f.format(epoch) : format(epoch); } },
    formatToParts: { configurable: true, value: epoch => { const f = corrected(epoch); return f ? f.formatToParts(epoch) : parts(epoch); } }
  });
  return base;
}
/* Called with `new` everywhere, like Intl.DateTimeFormat; it returns the
   Intl object it built. The cast only tells the type checker so. */
const DateTimeFormat = /** @type {new (locale?: string | string[], options?: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat} */ (/** @type {unknown} */ (zoneDateTimeFormat));
export { ZONE_LAWS, effectiveZone, DateTimeFormat };
