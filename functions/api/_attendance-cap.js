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
