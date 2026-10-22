// Worked hours per person and per store day, from attendance punches.
// One person cannot be paid twice for the same minute: a punch that was
// imported or synced twice (same id) counts once, and two overlapping punches
// of the same person count their union. Each stretch keeps the day of the
// punch it started in, as before. Each day keeps its exact worked seconds
// (hours = seconds / 3600): rounding to 0.01 h here paid 1 min 12 s for a
// one-minute punch. Rounding belongs to display and to the final pay figure.
//
// items: [{ key, id, start, end, closed, breaks: [[from, to], ...] }]
// dayOf(epoch) -> 'YYYY-MM-DD'
export function hoursByDay(items, dayOf) {
  const kept = [];
  const byId = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item) return;
    const id = item.id ? String(item.key) + '\u0000' + String(item.id) : '';
    if (!id) { kept.push(item); return; }
    const prev = byId.get(id);
    // A closed copy beats an open one, a valid copy beats a reversed one;
    // otherwise the latest write wins.
    const valid = (x) => (Number(x.end) || 0) > (Number(x.start) || 0);
    if (prev && ((prev.closed && !item.closed) || (valid(prev) && !valid(item)))) return;
    byId.set(id, item);
  });
  byId.forEach((item) => kept.push(item));

  const stretches = new Map();
  kept.forEach((item) => {
    const start = Number(item.start) || 0, end = Number(item.end) || 0;
    if (!start || end <= start) return;
    let parts = [[start, end]];
    (Array.isArray(item.breaks) ? item.breaks : []).forEach(([a, b]) => {
      if (!(a && b > a)) return;
      parts = parts.flatMap(([s, e]) => (b <= s || a >= e) ? [[s, e]]
        : [[s, Math.min(e, a)], [Math.max(s, b), e]].filter(([x, y]) => y > x));
    });
    const day = dayOf(start);
    const list = stretches.get(item.key) || [];
    parts.forEach(([s, e]) => list.push([s, e, day]));
    stretches.set(item.key, list);
  });

  const out = {};
  stretches.forEach((list, key) => {
    list.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const ms = {};
    let run = null;
    const flush = () => { if (run) ms[run[2]] = (ms[run[2]] || 0) + (run[1] - run[0]); };
    list.forEach(([s, e, day]) => {
      if (run && s < run[1]) run[1] = Math.max(run[1], e);
      else { flush(); run = [s, e, day]; }
    });
    flush();
    const row = out[key] = {};
    Object.keys(ms).forEach((day) => { row[day] = Math.round(ms[day] / 1000) / 3600; });
  });
  return out;
}
