// Fenêtres civiles réelles : un trou DST ne crée rien, un repli garde ses deux heures.
import { DateTimeFormat } from './_zone-law.js';
import { DEFAULT_ZONE } from './_business-day.js';
const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const clocks = new Map(), timelines = new Map();
export function calendarDate(day) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day + 'T00:00:00Z'))
    && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
}
function offset(epoch, zone) {
  if (!clocks.has(zone)) clocks.set(zone, new DateTimeFormat('en-CA', {
    timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }));
  const p = Object.fromEntries(clocks.get(zone).formatToParts(epoch).map(p => [p.type, p.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - epoch;
}
function timeline(day, zone) {
  const key = zone + ':' + day;
  if (timelines.has(key)) return timelines.get(key);
  const midnight = Date.parse(day + 'T00:00:00Z'), low = midnight - 16 * HOUR, high = midnight + 2 * DAY + 16 * HOUR;
  const result = []; let from = low, previous = offset(low, zone);
  for (let t = low + HOUR; t <= high; t += HOUR) {
    const current = offset(t, zone);
    if (current === previous) continue;
    let a = t - HOUR, b = t;
    while (b - a > MINUTE) {
      const middle = Math.floor((a + b) / (2 * MINUTE)) * MINUTE;
      if (offset(middle, zone) === previous) a = middle; else b = middle;
    }
    result.push({from, to:b, offset:previous}); from = b; previous = current;
  }
  result.push({from, to:high, offset:previous});
  if (timelines.size >= 64) timelines.delete(timelines.keys().next().value);
  timelines.set(key, result); return result;
}
function pieces(day, a, b, zone) {
  return timeline(day, zone).map(s => ({from:Math.max(s.from, a - s.offset),
    to:Math.min(s.to, b - s.offset), offset:s.offset})).filter(s => s.to > s.from);
}
export function bookingEpoch(day, time, zone = DEFAULT_ZONE) {
  if (!calendarDate(day) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) return 0;
  const target = Date.parse(day + 'T' + time + ':00Z');
  return pieces(day, target, target + MINUTE, zone)[0]?.from || 0;
}
export function openingSlots(day, from, to, step, duration, zone) {
  if (!calendarDate(day)) return [];
  const a = Date.parse(day + 'T' + from + ':00Z');
  let b = Date.parse(day + 'T' + to + ':00Z'); if (b <= a) b += DAY;
  const windows = pieces(day, a, b, zone), out = [];
  for (let i = 0; i < windows.length; i++) {
    const s = windows[i]; let end = s.to;
    for (let j = i + 1; j < windows.length && windows[j].from === end; j++) end = windows[j].to;
    const first = a + Math.ceil((s.from + s.offset - a) / (step * MINUTE)) * step * MINUTE - s.offset;
    for (let start = first; start < s.to && start + duration * MINUTE <= end; start += step * MINUTE) out.push(start);
  }
  return out;
}
