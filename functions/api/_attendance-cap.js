// Bound the attendance document without ever losing a punch that still matters.
// Only a CLOSED entry (clock-out recorded, hours already credited) older than the
// retention horizon may leave, oldest first, and only while the document is over
// the cap. An open, recent or credit-pending entry is never dropped: a busy
// merchant may exceed the cap for a while rather than lose worked time.
export const MAX_ATTENDANCE = 5000;
export const ATTENDANCE_RETAIN_MS = 400 * 24 * 3600000;
export function capAttendance(entries, now = Date.now(), max = MAX_ATTENDANCE) {
  let excess = entries.length - max;
  if (excess <= 0) return entries;
  const horizon = now - ATTENDANCE_RETAIN_MS;
  return entries.filter((entry) => {
    if (excess <= 0) return true;
    const droppable = entry && Number(entry.outTs) > 0 && entry.hoursCredit !== 'pending' && Number(entry.inTs) < horizon;
    if (droppable) excess--;
    return !droppable;
  });
}
// Hard bounds. The age-based pruning above never touches a recent punch, so the
// document needs a second guard: past HARD_MAX the NEW punch is refused and
// nothing already stored is removed; and one person may not record more than
// MAX_PUNCHES_PER_DAY punches (in + out) in one business day.
export const HARD_MAX_ATTENDANCE = 2 * MAX_ATTENDANCE;
export const MAX_PUNCHES_PER_DAY = 24;
export const MAX_CORRECTIONS_PER_DAY = 20;
export const HARD_MAX_CORRECTIONS = 1000;
export function punchRefusal(entries, staffId, now, dayOf) {
  if (capAttendance(entries, now).length >= HARD_MAX_ATTENDANCE) return { error: 'attendance-full', status: 409 };
  const today = dayOf(now);
  let punches = 0;
  for (const entry of entries) {
    if (!entry || entry.staffId !== staffId) continue;
    if (Number(entry.inTs) > 0 && dayOf(Number(entry.inTs)) === today) punches++;
    if (Number(entry.outTs) > 0 && dayOf(Number(entry.outTs)) === today) punches++;
  }
  return punches >= MAX_PUNCHES_PER_DAY ? { error: 'too-many-punches', status: 429 } : null;
}
