import { DateTimeFormat as ZoneDateTimeFormat } from './_zone-law.js';
// Share equivalent server clocks without changing the byte-exact browser twin.
const formatters = new Map();
function cachedDateTimeFormat(locale, options) {
  const key = JSON.stringify([locale, Object.entries(options || {}).sort(([a], [b]) => a.localeCompare(b))]);
  if (formatters.has(key)) return formatters.get(key);
  const formatter = new ZoneDateTimeFormat(locale, options);
  formatters.set(key, formatter);
  if (formatters.size > 64) formatters.delete(formatters.keys().next().value);
  return formatter;
}
// Preserve the constructor signature used by the zone-law formatter callers.
const DateTimeFormat = /** @type {new (locale?: string | string[], options?: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat} */ (/** @type {unknown} */ (cachedDateTimeFormat));
export { DateTimeFormat };
