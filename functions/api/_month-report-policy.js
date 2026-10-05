// Dated report configuration is separate from generating/closing transactions.
// Existing entries are immutable; legal changes append a new dated period.
const validDate = value => { const date = new Date(value + 'T00:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };
export function validateMonthReportPolicy(next, previous) {
  const email = next?.accountantEmail;
  if (Object.prototype.hasOwnProperty.call(next || {}, 'accountantEmail') && (typeof email !== 'string' || email.length > 254 || /[\u0000-\u001f\u007f]/.test(email)
    || (email !== '' && !/^[^\s@<>;,?&#]+@[^\s@<>;,?&#]+\.[^\s@<>;,?&#]+$/.test(email)))) {
    return { ok: false, error: 'invalid-accountant-email' };
  }
  if (previous?.accountantEmail && !Object.prototype.hasOwnProperty.call(next || {}, 'accountantEmail')) return { ok: false, error: 'accountant-email-required' };
  const periods = next && next.taxPeriods;
  if (!Array.isArray(periods)) return { ok: false, error: 'invalid-tax-periods' };
  const ids = new Set(), dates = new Set();
  for (const p of periods) {
    if (!p || !/^[A-Za-z0-9_-]{1,80}$/.test(p.id || '') || ids.has(p.id)
      || !/^\d{4}-\d{2}-\d{2}$/.test(p.effectiveFrom || '')
      || !validDate(p.effectiveFrom)
      || typeof p.rate !== 'number' || !Number.isFinite(p.rate) || p.rate < 0 || p.rate > 100
      || typeof p.category !== 'string' || p.category.length > 120
      || p.effectiveTo != null || typeof p.recordedAt !== 'number' || !Number.isFinite(p.recordedAt)) return { ok: false, error: 'invalid-tax-period' };
    const key = p.category + '|' + p.effectiveFrom;
    if (dates.has(key)) return { ok: false, error: 'duplicate-tax-date' };
    ids.add(p.id); dates.add(key);
  }
  for (const old of previous?.taxPeriods || []) {
    const current = periods.find(p => p.id === old.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(old)) return { ok: false, error: 'historical-tax-period-immutable' };
  }
  return { ok: true };
}
