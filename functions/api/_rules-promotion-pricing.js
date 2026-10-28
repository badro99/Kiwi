const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const toMin = (s) => { var m = HHMM.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; }
export const money = (v) => { var n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0; }
export const down = (n) => { return Math.max(0, Math.floor(n * 100 + 1e-6) / 100); }
export const normalize = (p, surface) => {
    var kind = ['percent', 'amount', 'fixed'].indexOf(p.kind) >= 0 ? p.kind : 'percent';
    var value = money(p.value);
    if (kind === 'percent') value = Math.min(100, value); /* kept to the centime (12.5 % stays 12.5 %), like every amount */
    var days = (Array.isArray(p.days) ? p.days : []).map(Number).filter(function (d, i, a) {
      return Number.isInteger(d) && d >= 0 && d <= 6 && a.indexOf(d) === i;
    }).sort(function (a, b) { return a - b; });
    var start = HHMM.test(p.start || '') ? p.start : '';
    var end = HHMM.test(p.end || '') ? p.end : '';
    if (!start || !end || start === end) { start = ''; end = ''; }
    return { kind: kind, value: value, days: days.length === 7 ? [] : days, start: start, end: end };
  }
export const inWindow = (p, b) => {
    if (p.days && p.days.length && p.days.indexOf(b.weekday) < 0) return false;
    var s = toMin(p.start), e = toMin(p.end);
    if (s == null || e == null) return true;
    return s < e ? b.min >= s && b.min < e : b.min >= s || b.min < e;
  }
export const price = (p, unit, surface) => {
    var base = money(unit);
    var out = base;
    if (p.kind === 'percent') out = Math.round(Math.round(base * 100) * (100 - p.value) / 100 + 1e-9) / 100;
    else if (p.kind === 'amount') out = base - p.value;
    else out = p.value;
    return Math.min(base, money(out));
  }
export const statusAt = (p, at, moment) => {
  if (!p) return 'ended';
  if (p.paused) return 'paused';
  if (p.to && at > p.to) return 'ended';
  if (p.from && at < p.from) return 'scheduled';
  if (!p.days?.length && !(p.start && p.end)) return 'active';
  return inWindow(p, moment) ? 'active' : 'waiting';
}
export const lineDeal = (line, fullPrice, live) => {
  const stamp = (line && line.promo && Number.isFinite(+line.promo.price))
    ? { ...line.promo, price: down(line.promo.price) } : null;
  let best = { price: down(+fullPrice || 0), promo: null };
  if (stamp && stamp.price < best.price) best = { price: stamp.price, promo: stamp };
  if (live && live.price < best.price) best = { price: live.price,
    promo: { price: live.price, badge: live.badge, name: live.promo.name, id: live.promo.id } };
  return best;
}
export const lineUnit = (base, remise) => { return down(+(base * (100 - remise) / 100) || 0); }
export const appliesMenu = (p, line) => {
  if (!line || line.kind === 'formula' || line.kind === 'formula-part') return false;
  if (p.all) return true;
  if (line.itemId && p.items.indexOf(String(line.itemId)) >= 0) return true;
  return !!line.catId && p.cats.indexOf(String(line.catId)) >= 0;
}
export const resolveMenu = (promos, line, unit, moment) => {
  const base = money(unit);
  if (!(base > 0) || !Array.isArray(promos) || !promos.length) return null;
  let best = null;
  for (const p of promos) {
    if (!appliesMenu(p, line) || statusAt(p, moment.date, moment) !== 'active') continue;
    const value = price(p, base);
    if (value >= base) continue;
    best = choosePromotion(best, { price: value, promo: p }, true);
  }
  if (!best) return null;
  const p = best.promo;
  const badge = p.kind === 'percent' ? '−' + p.value + ' %' : p.kind === 'amount'
    ? '−' + String(p.value).replace('.', ',') + ' MAD' : String(p.value).replace('.', ',') + ' MAD';
  return { price: best.price, promo: { id: p.id, name: p.name, badge, before: base } };
}
export const stockOf = (item) => {
    if (!item || !item.sizes) return 0;
    return Object.keys(item.sizes).reduce(function (s, k) { return s + (+item.sizes[k] || 0); }, 0);
  }
export const toTs = (v) => {
    if (!v) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    var t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  }
export const matches = (p, item, stock) => {
    if (!p || !item) return false;
    var sc = p.scope || {};
    if (sc.type === 'tout') return true;
    if (sc.type === 'rayon') return (sc.ids || []).indexOf(item.rayon) >= 0 || (!!item.uncat && (sc.ids || []).indexOf('_uncat') >= 0);
    if (sc.type === 'produits') return (sc.ids || []).indexOf(item.id) >= 0;
    if (sc.type === 'avant') {
      var bef = toTs(sc.before);
      var itAt = toTs(item.createdAt);
      return !!bef && !!itAt && itAt < bef;
    }
    if (sc.type === 'stock') {
      var n = (stock == null) ? stockOf(item) : stock;
      /* Un article épuisé ne porte pas d'affiche « fin de série » : la pastille
         promettrait un prix sur une étagère vide. */
      return n > 0 && n <= (sc.max || 0);
    }
    return false;
  }
export const choosePromotion = (best, candidate, zeroAge = false) => {
  const age = p => zeroAge ? (p.createdAt || 0) : p.createdAt;
  return !best || candidate.price < best.price || (candidate.price === best.price && age(candidate.promo) < age(best.promo)) ? candidate : best;
}
