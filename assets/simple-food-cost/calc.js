  /* ── le calcul, pur ──────────────────────────────────────────────────── */
  const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
  function daysBetween(isoDay, today) {
    const a = Date.parse(isoDay + 'T00:00:00Z'), b = Date.parse(today + 'T00:00:00Z');
    return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 864e5) : null;
  }
  function compute(sheet, opts) {
    const s = sheet || {}, o = opts || {};
    const convert = o.convert || ((q, a, b) => (a === b ? q : null));
    const currentDay = o.today || (typeof today === 'function' ? today() : (() => {
      const d = new Date(); d.setHours(d.getHours() - 5);
      return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    })());
    const lines = (Array.isArray(s.lines) ? s.lines : []).map((l) => {
      const r = { id: l.id, name: l.name || '', type: l.type === 'packaging' ? 'packaging' : 'food', cost: null, reason: '', stale: false, undated: false, age: null };
      if (!isNum(l.packPrice)) r.reason = 'price';
      else if (!isNum(l.packQty) || +l.packQty <= 0) r.reason = 'packQty';
      else if (!isNum(l.useQty)) r.reason = 'useQty';
      else if (l.yieldPct != null && (!isNum(l.yieldPct) || +l.yieldPct <= 0 || +l.yieldPct > 100)) r.reason = 'yield';
      else {
        const q = convert(+l.useQty, l.useUnit || l.packUnit, l.packUnit);
        if (q == null) r.reason = 'unit';
        else {
          const y = isNum(l.yieldPct) && +l.yieldPct > 0 && +l.yieldPct <= 100 ? +l.yieldPct / 100 : 1;
          r.cost = (+l.packPrice / +l.packQty) * q / y;
        }
      }
      if (l.priceDate) { r.age = daysBetween(l.priceDate, currentDay); r.stale = r.age != null && r.age > STALE_DAYS; }
      else if (isNum(l.packPrice)) r.undated = true;
      return r;
    });
    let food = 0, pack = 0, known = 0;
    const unknown = [], stale = [];
    lines.forEach((r) => {
      if (r.cost == null) unknown.push(r); else { known += r.cost; if (r.type === 'packaging') pack += r.cost; else food += r.cost; }
      if (r.stale) stale.push(r);
    });
    const portions = isNum(s.portions) && +s.portions >= 1 && Number.isInteger(+s.portions) ? +s.portions : null;
    const complete = lines.length > 0 && !unknown.length && portions != null;
    const vatOn = s.vatIncluded === true && isNum(s.vatRate) && +s.vatRate > 0;
    const price = isNum(s.sellingPrice) ? +s.sellingPrice : null;
    const priceHT = price == null ? null : (vatOn ? price / (1 + s.vatRate / 100) : price);
    const total = complete ? known : null;
    const perPortion = complete ? known / portions : null;
    const pctOfPrice = perPortion != null && priceHT > 0 ? perPortion / priceHT * 100 : null;
    const contribution = perPortion != null && priceHT != null ? priceHT - perPortion : null;
    const target = isNum(s.targetPct) && +s.targetPct > 0 ? +s.targetPct : null;
    const suggestedHT = perPortion != null && target ? perPortion / (target / 100) : null;
    const suggested = suggestedHT == null ? null : (vatOn ? suggestedHT * (1 + s.vatRate / 100) : suggestedHT);
    const status = !lines.length ? 'empty' : !complete ? 'incomplete' : stale.length ? 'stale' : 'ok';
    return {
      lines, unknown, stale, complete, status, portions, vatOn, vatRate: vatOn ? +s.vatRate : null,
      known, food: complete ? food : null, packaging: complete ? pack : null, total, perPortion,
      knownPerPortion: portions == null ? null : known / portions, price, priceHT, pct: pctOfPrice, contribution, target, suggested,
    };
  }

