const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const menuAmount = (v, max) => Math.round(Math.max(0, Math.min(max, Number(v) || 0)) * 100) / 100;
function sanitizeFormula(raw, allowedIds) {
  if (!raw || typeof raw !== 'object') return null;
  const rawSlots = Array.isArray(raw.slots) ? raw.slots.slice(0, 10) : [];
  const slots = rawSlots.map((s, idx) => {
    if (!s || typeof s !== 'object') return null;
    const id = str(s.id, 40) || ('sl_' + (idx + 1));
    const label = str(s.label, 400).trim().slice(0, 60);
    let min = Math.max(0, Math.min(10, Math.round(Number(s.min) || 0)));
    let max = Math.max(1, Math.min(10, Math.round(Number(s.max) || 1)));
    if (min > max) min = max;
    const rawChoices = Array.isArray(s.choices) ? s.choices.slice(0, 20) : [];
    const choices = rawChoices.map((c) => ({
      itemId: str(c && c.itemId, 40),
      extra: menuAmount(c && c.extra, 1e5),
    })).filter((c) => c.itemId && allowedIds.has(c.itemId));
    return { id, label, min, max, choices };
  }).filter((s) => s && s.id && s.choices.length);
  if (!slots.length) return null;
  return { slots };
}
