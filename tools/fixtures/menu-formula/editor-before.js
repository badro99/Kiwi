  function cleanFormula(formula, items) {
    const fStr = (v, n) => String(v == null ? '' : v).slice(0, n);
    const fAmount = (v, max) => Math.round(Math.max(0, Math.min(max, Number(v) || 0)) * 100) / 100;
    if (!formula || typeof formula !== 'object' || !Array.isArray(formula.slots)) return null;
    const itemMap = new Set((items || []).filter((i) => i && !i.archived).map((i) => fStr(i.id, 40)).filter(Boolean));
    const rawSlots = formula.slots.slice(0, 10);
    const slots = rawSlots.map((s, idx) => {
      if (!s || typeof s !== 'object') return null;
      const id = fStr(s.id, 40) || ('sl_' + (idx + 1));
      const label = fStr(s.label, 400).trim().slice(0, 60).trimEnd();
      let min = Math.max(0, Math.min(10, Math.round(Number(s.min) || 0)));
      let max = Math.max(1, Math.min(10, Math.round(Number(s.max) || 1)));
      if (min > max) min = max;
      const rawChoices = Array.isArray(s.choices) ? s.choices.slice(0, 20) : [];
      const choices = rawChoices.map((c) => ({
        itemId: fStr(c && c.itemId, 40),
        extra: fAmount(c && c.extra, 1e5),
      })).filter((c) => c.itemId && itemMap.has(c.itemId));
      return { id, label, min, max, choices };
    }).filter((s) => s && s.id && s.choices && s.choices.length > 0);
    return slots.length ? { slots } : null;
  }
