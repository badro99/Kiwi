import { dateOK, problem, text } from './_commercial.js';

export function monthWindow(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '') || !dateOK(month + '-01') || month > '9998-12') problem('bad-month');
  const start = month + '-01';
  const end = new Date(Date.parse(start + 'T00:00:00Z') + 32 * 86400000).toISOString().slice(0, 7) + '-01';
  return { month, start, end, days: Math.round((Date.parse(end) - Date.parse(start)) / 86400000) };
}

// One reservation represents one sold room, even when physical assignment is
// still pending. This is room-night production, never actual presence/revenue.
export function monthlyProduction(rows, window, accounts = []) {
  const groups = new Map(), seen = new Set();
  const accountIndex = new Map(accounts.map(a => [a.id, a]));
  const totals = Array(window.days).fill(0);
  const channels = { booking: 'Booking.com', expedia: 'Expedia', airbnb: 'Airbnb', direct: 'Direct', walkin: 'Walk-in', other: 'Autre origine' };
  let reservations = 0, unassigned = 0;
  for (const r of rows) {
    if (!['confirmed', 'checked_in', 'completed'].includes(r.status)) continue;
    if (!r.id || seen.has(r.id) || !dateOK(r.check_in) || !dateOK(r.check_out) || r.check_out <= r.check_in) problem('production-data-invalid');
    seen.add(r.id);
    let raw;
    try { raw = JSON.parse(r.raw_json); } catch (_) { problem('production-data-invalid'); }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) problem('production-data-invalid');
    const from = r.check_in > window.start ? r.check_in : window.start;
    const to = r.check_out < window.end ? r.check_out : window.end;
    if (from >= to) continue;
    const commercial = raw.commercial;
    const accountId = text(commercial?.accountId, 80);
    const account = accountIndex.get(accountId) || commercial?.billTo;
    const channel = Object.hasOwn(channels, r.channel) ? r.channel : 'other';
    const key = accountId ? 'account:' + accountId : 'channel:' + channel;
    if (!groups.has(key)) groups.set(key, {
      key, name: accountId ? text(account?.name || 'Compte archivé / indisponible', 160) : channels[channel],
      kind: accountId && ['agency', 'company', 'individual'].includes(account?.kind) ? account.kind : 'channel',
      days: Array(window.days).fill(0), nights: 0, reservations: 0,
    });
    const group = groups.get(key);
    reservations++; group.reservations++;
    if (!r.room_id) unassigned++;
    for (let i = (Date.parse(from) - Date.parse(window.start)) / 86400000; i < (Date.parse(to) - Date.parse(window.start)) / 86400000; i++) {
      group.days[i]++; group.nights++; totals[i]++;
    }
  }
  return { ...window, groups: [...groups.values()].sort((a, b) => b.nights - a.nights || a.name.localeCompare(b.name, 'fr')), totals, nights: totals.reduce((a, b) => a + b, 0), reservations, unassigned };
}
