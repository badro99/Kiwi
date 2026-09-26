// A store's business day follows the civil clock of the place it trades in,
// never the host's TZ. That place is learned from the store's own till (see
// functions/api/timezone.js): a till in Paris books Paris days. Stores that
// never reported one keep Morocco, Kiwi's historical default.
const DAY = 86400000;
export const DEFAULT_ZONE = 'Africa/Casablanca';
const clocks = new Map();

export function validZone(zone) {
  const z = String(zone || '').trim();
  if (!z || z.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/.test(z)) return '';
  try { new Intl.DateTimeFormat('en-GB', { timeZone: z }).format(0); return z; } catch (_) { return ''; }
}
function clock(zone) {
  const z = validZone(zone) || DEFAULT_ZONE;
  if (!clocks.has(z)) {
    clocks.set(z, new Intl.DateTimeFormat('en-GB', {
      timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return clocks.get(z);
}
function parts(epoch, zone) {
  return Object.fromEntries(clock(zone).formatToParts(epoch).map(p => [p.type, p.value]));
}
export function addBusinessDays(day, days) {
  return new Date(Date.parse(day + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
}
export function businessDate(epoch, cutoff = 5, zone = DEFAULT_ZONE) {
  const p = parts(epoch, zone);
  const day = `${p.year}-${p.month}-${p.day}`;
  return Number(p.hour) < cutoff ? addBusinessDays(day, -1) : day;
}
export function businessBoundary(day, cutoff = 5, zone = DEFAULT_ZONE) {
  const target = Date.parse(day + 'T00:00:00Z') + cutoff * 3600000;
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = parts(guess, zone);
    const observed = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    if (observed === target) return guess;
    guess += target - observed;
  }
  return guess;
}
export function businessDayStart(epoch, cutoff = 5, zone = DEFAULT_ZONE) {
  return businessBoundary(businessDate(epoch, cutoff, zone), cutoff, zone);
}
export function businessDayWindows(epoch, count = 30, cutoff = 5, zone = DEFAULT_ZONE) {
  const today = businessDate(epoch, cutoff, zone);
  return Array.from({ length: count }, (_, i) => {
    const d = addBusinessDays(today, i - count + 1);
    return { d, from: businessBoundary(d, cutoff, zone), to: businessBoundary(addBusinessDays(d, 1), cutoff, zone) };
  });
}

/* The zone a store's till last reported. Older databases have no column yet:
   that, a missing row or a bad value all mean the historical default. */
export async function merchantZone(env, merchant) {
  if (!env?.DB || !merchant) return DEFAULT_ZONE;
  try {
    const row = await env.DB.prepare('SELECT timezone FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    return validZone(row && row.timezone) || DEFAULT_ZONE;
  } catch (_) { return DEFAULT_ZONE; }
}
