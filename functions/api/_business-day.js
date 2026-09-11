// Operator reporting uses Morocco's civil clock, regardless of the host's TZ.
const DAY = 86400000;
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function parts(epoch) {
  return Object.fromEntries(clock.formatToParts(epoch).map(p => [p.type, p.value]));
}
export function addBusinessDays(day, days) {
  return new Date(Date.parse(day + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
}
export function businessDate(epoch, cutoff = 5) {
  const p = parts(epoch);
  const day = `${p.year}-${p.month}-${p.day}`;
  return Number(p.hour) < cutoff ? addBusinessDays(day, -1) : day;
}
export function businessBoundary(day, cutoff = 5) {
  const target = Date.parse(day + 'T00:00:00Z') + cutoff * 3600000;
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = parts(guess);
    const observed = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    if (observed === target) return guess;
    guess += target - observed;
  }
  return guess;
}
export function businessDayStart(epoch, cutoff = 5) {
  return businessBoundary(businessDate(epoch, cutoff), cutoff);
}
export function businessDayWindows(epoch, count = 30, cutoff = 5) {
  const today = businessDate(epoch, cutoff);
  return Array.from({ length: count }, (_, i) => {
    const d = addBusinessDays(today, i - count + 1);
    return { d, from: businessBoundary(d, cutoff), to: businessBoundary(addBusinessDays(d, 1), cutoff) };
  });
}
