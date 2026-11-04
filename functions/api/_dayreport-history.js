/* A closed Z is history: a write may add closures, never lose one.
 * Tills prune whole days, oldest first, to fit the document budget, and never
 * a day of the newest day's month or the month before (pruneToBudget in
 * assets/day-report.js); so only an older day, older than every day kept, may go. Inside the kept range, a closed
 * day that disappears, a lower closedCount or a missing closure revision means
 * the writer rebuilt from a stale copy. The route answers it like any stale
 * write (409 with the server copy), and the till merges before retrying. */
const closureKey = (r) => [r && r.closedAt, (r && r.sessionId) || '', (r && r.terminalId) || ''].join('|');
const closures = (day) => (Array.isArray(day && day.revisions) ? day.revisions : []).filter((r) => r && r.closed);

export function dayreportHistoryLost(current, next) {
  const before = current && current.days && typeof current.days === 'object' ? current.days : {};
  const after = next && next.days && typeof next.days === 'object' ? next.days : {};
  const kept = Object.keys(after).sort();
  const m = /^(\d{4})-(\d{2})/.exec(kept[kept.length - 1] || '');
  const y = m ? +m[1] - (+m[2] === 1 ? 1 : 0) : 0, mo = m ? (+m[2] === 1 ? 12 : +m[2] - 1) : 0;
  const protectFrom = m ? y + '-' + String(mo).padStart(2, '0') + '-01' : '';
  for (const day of Object.keys(before)) {
    const old = before[day];
    const closedBefore = Number(old && old.closedCount) || 0;
    if (!closedBefore && !closures(old).length) continue;
    if (!kept.length) return day;
    if (day < kept[0] && day < protectFrom) continue; // pruned from the old end of the document
    const now = after[day];
    if (!now || (Number(now.closedCount) || 0) < closedBefore) return day;
    const have = new Set(closures(now).map(closureKey));
    if (closures(old).some((r) => !have.has(closureKey(r)))) return day;
  }
  return '';
}
