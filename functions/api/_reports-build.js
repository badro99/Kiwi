// Les rapports mis en forme : ce que functions/api/reports.js renvoie, à partir
// des lignes déjà regroupées par D1 (_reports-sql.js). Pur : pas de base, pas
// d'horloge. Montants en centimes entiers ; une part répartie (remise d'un
// ticket étalée sur ses lignes) est arrondie au centime à la fin, jamais avant.

import { hourClock, weekdayOf } from './_reports-period.js';
import { dayVat } from './_rules-day-vat.js';
import { daypart, deltaPct, reconcileNote, summarySentence, rankingSentence, heatmapSentence, vatSentence } from './_reports-words.js';

const r0 = (n) => Math.round(Number(n) || 0);
const num = (n) => Number(n) || 0;

function emptyK() {
  return { gross: 0, discounts: 0, refunds: 0, refundCount: 0, creditRefunds: 0, creditTickets: 0, net: 0, sales: 0, tickets: 0, basket: 0, tips: 0,
    items: 0, itemsPerTicket: null, detailed: 0, knownClients: 0, cogs: null, costCoverage: null, margin: null, marginPct: null, vat: null };
}

/* Additionne les heures (et les totaux de lignes) d'une période, pour une
   boutique ou pour toutes. `showCost` faux : coût et marge restent null. */
export function kpis(hours, lineTotals, pd, site, showCost) {
  const k = emptyK();
  for (const h of hours) {
    if (h.pd !== pd || (site != null && h.site !== site)) continue;
    k.tickets += num(h.n); k.sales += num(h.pos); k.refundCount += num(h.nref); k.refunds += num(h.neg); k.creditRefunds += num(h.credit); k.creditTickets += num(h.zt);
    k.discounts += num(h.disc); k.tips += num(h.tips); k.knownClients += num(h.known); k.detailed += num(h.detailed);
  }
  k.gross = k.sales + k.discounts;
  k.net = k.sales - k.refunds;
  k.basket = k.tickets ? Math.round(k.sales / k.tickets) : 0;
  let items = 0, cost = null, costedNet = 0, lineNet = 0;
  for (const l of lineTotals) {
    if (l.pd !== pd || (site != null && l.site !== site)) continue;
    items += num(l.items); lineNet += num(l.net); costedNet += num(l.costedNet);
    if (l.cost != null) cost = (cost || 0) + num(l.cost);
  }
  k.items = Math.round(items * 1000) / 1000;
  k.itemsPerTicket = k.detailed ? Math.round((items / k.detailed) * 10) / 10 : null;
  if (showCost && cost != null) {
    k.cogs = r0(cost);
    k.costCoverage = lineNet > 0 ? Math.min(100, Math.round((costedNet / lineNet) * 1000) / 10) : null;
    k.margin = r0(costedNet - cost);
    k.marginPct = costedNet > 0 ? Math.round(((costedNet - cost) / costedNet) * 1000) / 10 : null;
  }
  return k;
}

/* Les heures d'une période → séries par journée et carte jour × heure, dans
   l'horloge de chaque boutique. */
function timeline(hours, sites, pd) {
  const byDay = new Map();
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  const slots = new Map();
  const byHour = Array(24).fill(0), ticketsByHour = Array(24).fill(0);
  for (const h of hours) {
    if (h.pd !== pd) continue;
    const site = sites[h.site];
    if (!site) continue;
    const t = hourClock(site.zone, site.cutoff)(num(h.h));
    const net = num(h.pos) - num(h.neg);
    byDay.set(t.day, (byDay.get(t.day) || 0) + net);
    byHour[t.hour] += net; ticketsByHour[t.hour] += num(h.n);
    grid[t.weekday][t.hour] += num(h.pos);
    const key = t.weekday + ':' + daypart(t.hour);
    slots.set(key, (slots.get(key) || 0) + num(h.pos));
  }
  return { byDay, grid, slots, byHour, ticketsByHour };
}

function slotDrivers(cur, prev, sameWeekdays) {
  const delta = new Map();
  const fold = (map, sign) => {
    for (const [key, v] of map) {
      const k = sameWeekdays ? key : key.split(':')[1];
      delta.set(k, (delta.get(k) || 0) + sign * v);
    }
  };
  fold(cur.slots, 1); fold(prev.slots, -1);
  let up = null, down = null;
  for (const [k, v] of delta) {
    if (v > 0 && (!up || v > up.v)) up = { k, v };
    if (v < 0 && (!down || v < down.v)) down = { k, v };
  }
  const slot = (x) => {
    if (!x) return null;
    const parts = x.k.split(':');
    return parts.length === 2 ? { weekday: +parts[0], part: parts[1] } : { weekday: null, part: parts[0] };
  };
  return { up: slot(up), down: slot(down) };
}

function days(fromDay, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(new Date(Date.parse(fromDay + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));
  return out;
}

export function buildSummary(ctx, [hours, lineTotals, drivers]) {
  const { period, sites, showCost } = ctx;
  const cur = kpis(hours, lineTotals, 'c', null, showCost);
  const prev = kpis(hours, lineTotals, 'p', null, showCost);
  if (ctx.vat) { cur.vat = ctx.vat.cur; prev.vat = ctx.vat.prev; }
  const tc = timeline(hours, sites, 'c'), tp = timeline(hours, sites, 'p');
  const curDays = days(period.fromDay, period.days), prevDays = days(period.prev.fromDay, period.prev.days);
  const series = curDays.map((day, i) => ({ day, net: r0(tc.byDay.get(day)), prevDay: prevDays[i] || null,
    prevNet: prevDays[i] ? r0(tp.byDay.get(prevDays[i])) : null }));
  const ups = drivers.filter((d) => num(d.delta) > 0).sort((a, b) => num(b.delta) - num(a.delta));
  const downs = drivers.filter((d) => num(d.delta) < 0).sort((a, b) => num(a.delta) - num(b.delta));
  const d = {
    period, cur, prev,
    drivers: { up: ups[0] ? { name: String(ups[0].k), delta: r0(ups[0].delta) } : null,
      down: downs[0] ? { name: String(downs[0].k), delta: r0(downs[0].delta) } : null },
    slots: slotDrivers(tc, tp, period.days % 7 === 0),
  };
  /* Une seule journée : la série passe à l'heure, dans l'ordre de la
     journée commerciale (de la coupure à la coupure), avec l'heure de pointe. */
  let hourly = null, peakHour = null;
  if (period.days === 1) {
    const cut = (sites[0] && sites[0].cutoff) || 0;
    hourly = Array.from({ length: 24 }, (_, i) => (cut + i) % 24)
      .map((hour) => ({ hour, net: r0(tc.byHour[hour]), tickets: tc.ticketsByHour[hour], prevNet: r0(tp.byHour[hour]) }));
    const top = hourly.reduce((best, x) => (x.net > 0 && (!best || x.net > best.net) ? x : best), null);
    if (top) { peakHour = { hour: top.hour, net: top.net, tickets: top.tickets }; d.peakHour = peakHour; }
  }
  /* Chaque boutique, sous `perSite` : `sites` reste la liste des boutiques du
     compte que l'enveloppe (reports.js) donne au sélecteur. */
  const perSite = sites.map((s, i) => ({ merchant: s.merchant, name: s.name,
    cur: kpis(hours, lineTotals, 'c', i, showCost), prev: kpis(hours, lineTotals, 'p', i, showCost) }));
  /* Le raccord avec le Z et l'accueil (/api/sales-summary) : eux ne
     déduisent que l'argent rendu, pas la part rendue en avoir. Leur net =
     ce net + les retours rendus en avoir, au centime (tools/reports-test.mjs
     le vérifie avec leur propre fonction). Rien à raccorder sans avoir. */
  const reconcile = cur.creditRefunds > 0
    ? Object.assign({ z: cur.net + cur.creditRefunds, credit: cur.creditRefunds, net: cur.net, tickets: cur.creditTickets }, reconcileNote(cur.creditTickets))
    : null;
  return { totals: { cur, prev, change: deltaPct(cur.net, prev.net) }, series, hourly, peakHour, reconcile, drivers: d.drivers, slots: d.slots,
    perSite, headline: summarySentence(d) };
}

/* Produits ou rayons. */
export function buildRanking(ctx, kind, [rows, lineTotals, hours]) {
  const { showCost, page } = ctx;
  const total = lineTotals.filter((l) => l.pd === 'c').reduce((n, l) => n + num(l.net), 0);
  const prevTotal = lineTotals.filter((l) => l.pd === 'p').reduce((n, l) => n + num(l.net), 0);
  /* Le classement se raccorde au résumé : ventes nettes du résumé = somme des
     lignes + ce qui n'a pas de détail d'article (ventes sans lignes,
     remboursements dont la vente d'origine n'a pas de lignes). */
  const k = kpis(hours || [], [], 'c', null, false), pk = kpis(hours || [], [], 'p', null, false);
  const refunded = lineTotals.filter((l) => l.pd === 'c').reduce((n, l) => n + num(l.refunded), 0);
  const out = rows.map((r) => {
    const net = num(r.net), pnet = num(r.pnet);
    const row = { key: String(r.k == null ? '' : r.k), name: String(r.k == null ? '' : r.k), category: String(r.cat || ''),
      qty: Math.round(num(r.q) * 1000) / 1000, prevQty: Math.round(num(r.pq) * 1000) / 1000,
      net: r0(net), prevNet: r0(pnet), gross: r0(r.gross), sold: r0(r.sold), refunded: r0(r.refunded),
      refundedQty: Math.round(num(r.rq) * 1000) / 1000, tickets: num(r.tickets),
      share: total > 0 ? Math.round((net / total) * 1000) / 10 : 0, change: deltaPct(net, pnet),
      cost: null, margin: null, marginPct: null };
    if (showCost && r.cost != null) {
      row.cost = r0(r.cost);
      row.margin = r0(num(r.costedNet) - num(r.cost));
      row.marginPct = num(r.costedNet) > 0 ? Math.round(((num(r.costedNet) - num(r.cost)) / num(r.costedNet)) * 1000) / 10 : null;
    }
    return row;
  });
  const count = rows.length ? num(rows[0].total) : 0;
  const mover = out.filter((r) => r.net - r.prevNet > 0).sort((a, b) => (b.net - b.prevNet) - (a.net - a.prevNet))[0];
  const first = page.offset === 0 && out[0] ? out[0] : null;
  return { rows: out, page: { offset: page.offset, limit: page.limit, total: count },
    totals: { lines: r0(total), prevLines: r0(prevTotal), refunded: r0(refunded),
      unattributed: r0(k.net - total), prevUnattributed: r0(pk.net - prevTotal), net: k.net, prevNet: pk.net },
    headline: rankingSentence(kind, { top: first && { name: first.name, value: first.net, prev: first.prevNet }, total,
      mover: mover && { name: mover.name, delta: mover.net - mover.prevNet } }) };
}

/* Vendeurs. Les noms viennent de la vente, sinon de la fiche Équipe (le nom
   seul, jamais un code) ; une vente sans vendeur est « Sans vendeur ». */
export function buildStaff(ctx, [rows, refunds], names) {
  const map = new Map();
  for (const r of rows) {
    map.set(r.k, { id: r.k, name: r.nm || names.get(r.k) || '', tickets: num(r.n), sales: num(r.pos), discounts: num(r.disc),
      tips: num(r.tips), prevSales: num(r.ppos), prevTickets: num(r.pn), refunds: 0, refundCount: 0 });
  }
  for (const r of refunds) {
    const row = map.get(r.k) || { id: r.k, name: names.get(r.k) || '', tickets: 0, sales: 0, discounts: 0, tips: 0, prevSales: 0, prevTickets: 0, refunds: 0, refundCount: 0 };
    row.refunds += num(r.neg); row.refundCount += num(r.nref);
    map.set(r.k, row);
  }
  const total = [...map.values()].reduce((n, r) => n + r.sales, 0);
  const out = [...map.values()].filter((r) => r.tickets || r.refunds || r.prevSales).map((r) => Object.assign(r, {
    unassigned: !r.id, basket: r.tickets ? Math.round(r.sales / r.tickets) : 0,
    share: total > 0 ? Math.round((r.sales / total) * 1000) / 10 : 0, change: deltaPct(r.sales, r.prevSales),
  })).sort((a, b) => (a.unassigned - b.unassigned) || b.sales - a.sales);
  const top = out.find((r) => !r.unassigned && r.sales > 0);
  return { rows: out, totals: { sales: total },
    headline: rankingSentence('staff', { top: top && { name: top.name || top.id, value: top.sales, prev: top.prevSales, basket: top.basket }, total }) };
}

export function buildPayments(ctx, [rows, refunds], label) {
  const ref = new Map(refunds.map((r) => [r.m, num(r.cents)]));
  const total = rows.reduce((n, r) => n + num(r.cents), 0);
  const out = rows.filter((r) => num(r.cents) || num(r.pcents)).map((r) => ({ method: r.m, cents: num(r.cents), count: num(r.n),
    prevCents: num(r.pcents), refunds: ref.get(r.m) || 0, share: total > 0 ? Math.round((num(r.cents) / total) * 1000) / 10 : 0,
    change: deltaPct(num(r.cents), num(r.pcents)) }));
  for (const [m, cents] of ref) if (!out.find((r) => r.method === m) && cents) out.push({ method: m, cents: 0, count: 0, prevCents: 0, refunds: cents, share: 0, change: null });
  const top = out[0];
  return { rows: out, totals: { cents: total, refunds: [...ref.values()].reduce((a, b) => a + b, 0) },
    headline: rankingSentence('payments', { top: top && { name: label(top.method), value: top.cents, prev: top.prevCents }, total }) };
}

export function buildChannels(ctx, [rows], label) {
  const total = rows.reduce((n, r) => n + num(r.cents), 0);
  const out = rows.filter((r) => num(r.cents) || num(r.pcents)).map((r) => ({ channel: r.k, cents: num(r.cents), count: num(r.n),
    prevCents: num(r.pcents), prevCount: num(r.pn), share: total > 0 ? Math.round((num(r.cents) / total) * 1000) / 10 : 0,
    change: deltaPct(num(r.cents), num(r.pcents)) }));
  const top = out[0];
  return { rows: out, totals: { cents: total },
    headline: rankingSentence('channels', { top: top && { name: label(top.channel), value: top.cents, prev: top.prevCents }, total }) };
}

export function buildHeatmap(ctx, [hours]) {
  const t = timeline(hours, ctx.sites, 'c');
  const total = t.grid.reduce((n, row) => n + row.reduce((a, b) => a + b, 0), 0);
  let peak = null;
  t.grid.forEach((row, wd) => row.forEach((cents, hour) => { if (cents > 0 && (!peak || cents > peak.cents)) peak = { weekday: wd, hour, cents }; }));
  const byWeekday = t.grid.map((row) => row.reduce((a, b) => a + b, 0));
  /* Le jour le plus calme, parmi les jours qui ont vendu au moins une fois :
     un jour de fermeture n'est pas « calme ». */
  const open = byWeekday.map((v, i) => ({ v, i })).filter((x) => x.v > 0);
  const quiet = open.length > 1 ? open.sort((a, b) => a.v - b.v)[0].i : null;
  const byHour = Array.from({ length: 24 }, (_, h) => t.grid.reduce((n, row) => n + row[h], 0));
  /* Combien de fois chaque jour de la semaine figure dans la période : une
     moyenne par jour, pas un total qui avantage le jour qui revient le plus. */
  const occurrences = Array(7).fill(0);
  days(ctx.period.fromDay, ctx.period.days).forEach((d) => { occurrences[weekdayOf(d)]++; });
  return { grid: t.grid, byWeekday, byHour, occurrences, peak, total,
    headline: heatmapSentence({ peak, total, quiet }) };
}

/* Le taux d'une ligne : la période datée du rayon (Mois comptable), sinon le
   taux du ticket, sinon inconnu. Jamais deviné. */
export function rateFor(cfg, category, day) {
  const periods = (cfg && cfg.periods) || [];
  const hit = periods.filter((p) => p.effectiveFrom <= day && (p.category === '*' || (category && p.category === category)))
    .sort((a, b) => (a.category === '*' ? 1 : 0) - (b.category === '*' ? 1 : 0) || String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)))[0];
  if (hit && Number.isFinite(Number(hit.rate))) return Number(hit.rate);
  return cfg && cfg.defaultRate != null ? cfg.defaultRate : null;
}

export function vatFor(ctx, [lines, rest], pd) {
  const bySite = new Map();
  const push = (site, cents, rate) => {
    if (!bySite.has(site)) bySite.set(site, []);
    bySite.get(site).push({ amount: cents / 100, lines: [{ total: Math.abs(cents) / 100, rate }] });
  };
  /* Le segment d'une ligne (_reports-sql.js segExpr) donne la journée
     commerciale où son taux a commencé ; 0 = avant tout taux daté. */
  const dayKey = (site, seg) => {
    const list = (ctx.vatSegs && ctx.vatSegs[site] && ctx.vatSegs[site].days) || [];
    return num(seg) > 0 && list[num(seg) - 1] ? list[num(seg) - 1] : '0000-01-01';
  };
  for (const l of lines) {
    if (l.pd !== pd) continue;
    const cfg = ctx.vatConfig[l.site] || {};
    const c = r0(l.net);
    if (c) push(l.site, c, rateFor(cfg, String(l.cat || ''), dayKey(l.site, l.seg)));
  }
  for (const r of rest) {
    if (r.pd !== pd) continue;
    const cfg = ctx.vatConfig[r.site] || {};
    const day = dayKey(r.site, r.seg);
    if (num(r.bare)) push(r.site, num(r.bare), rateFor(cfg, '', day));
    if (num(r.neg)) push(r.site, num(r.neg), rateFor(cfg, '', day));
  }
  const byRate = new Map();
  for (const [site, rows] of bySite) {
    const cfg = ctx.vatConfig[site] || {};
    const v = dayVat(rows, { defaultRate: null, included: cfg.included !== false });
    for (const r of v.rows) {
      const k = r.rate == null ? 'unknown' : String(r.rate);
      const acc = byRate.get(k) || { rate: r.rate, ht: 0, vat: 0, ttc: 0 };
      acc.ht += r.htC == null ? 0 : r.htC; acc.vat += r.vatC == null ? 0 : r.vatC; acc.ttc += r.ttcC;
      byRate.set(k, acc);
    }
  }
  const rows = [...byRate.values()].sort((a, b) => Number(a.rate == null) - Number(b.rate == null) || a.rate - b.rate)
    .map((r) => (r.rate == null ? { rate: null, ht: null, vat: null, ttc: r.ttc } : r));
  const totals = rows.reduce((t, r) => {
    t.ttc += r.ttc;
    if (r.rate == null) t.unknown += r.ttc; else { t.ht += r.ht; t.vat += r.vat; }
    return t;
  }, { ht: 0, vat: 0, ttc: 0, unknown: 0 });
  return { rows, totals };
}

export function buildVat(ctx, results) {
  const cur = vatFor(ctx, results, 'c'), prev = vatFor(ctx, results, 'p');
  return { rows: cur.rows, totals: cur.totals, prevTotals: prev.totals,
    headline: vatSentence({ vat: cur.totals.vat, ttc: cur.totals.ttc, unknown: cur.totals.unknown }) };
}

export function buildCustomers(ctx, [rows, topTen, hours]) {
  const k = kpis(hours, [], 'c', null, false);
  const out = rows.map((r) => ({ id: String(r.k), name: String(r.nm || ''), spend: num(r.spent), tickets: num(r.n),
    basket: num(r.n) ? Math.round(num(r.spent) / num(r.n)) : 0, last: r.last == null ? null : num(r.last),
    prevSpend: num(r.pspent), prevTickets: num(r.pn), change: deltaPct(num(r.spent), num(r.pspent)), site: num(r.site) }));
  const cur = hours.filter((h) => h.pd === 'c');
  const attributed = cur.reduce((n, h) => n + num(h.known), 0);
  const attributedCents = cur.reduce((n, h) => n + num(h.kc), 0);
  const top = ctx.page.offset === 0 ? out[0] : null;
  const topCents = num(topTen[0] && topTen[0].cents);
  return { rows: out, page: { offset: ctx.page.offset, limit: ctx.page.limit, total: rows.length ? num(rows[0].total) : 0 },
    totals: { tickets: k.tickets, attributedTickets: attributed, attributedCents,
      anonymousShare: k.tickets ? Math.round(((k.tickets - attributed) / k.tickets) * 1000) / 10 : null, topTenCents: topCents },
    headline: rankingSentence('customers', { top: top && { name: top.name || '#' + top.id.slice(0, 6), value: top.spend, prev: top.prevSpend },
      total: k.sales, topTenShare: attributedCents > 0 ? (topCents / attributedCents) * 100 : 0 }) };
}

/* Le multi-site : chaque boutique côte à côte, le total, la meilleure et la
   moins bonne. Le total EST la somme des boutiques : il est recalculé ici à
   partir des mêmes lignes, et le test vérifie l'égalité au centime. */
export function buildSites(ctx, [hours, lineTotals]) {
  const rows = ctx.sites.map((s, i) => {
    const cur = kpis(hours, lineTotals, 'c', i, ctx.showCost), prev = kpis(hours, lineTotals, 'p', i, ctx.showCost);
    return { merchant: s.merchant, name: s.name, cur, prev, change: deltaPct(cur.net, prev.net) };
  });
  const total = kpis(hours, lineTotals, 'c', null, ctx.showCost), prevTotal = kpis(hours, lineTotals, 'p', null, ctx.showCost);
  const ranked = rows.filter((r) => r.cur.tickets || r.cur.refundCount).sort((a, b) => b.cur.net - a.cur.net);
  const best = ranked[0] || null, worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const mover = rows.filter((r) => r.cur.net - r.prev.net > 0).sort((a, b) => (b.cur.net - b.prev.net) - (a.cur.net - a.prev.net))[0];
  /* La moyenne du groupe : les boutiques qui ont vendu sur la période. Chaque
     carte dit où elle se place (`vsAverage`, en %). */
  const active = rows.filter((r) => r.cur.tickets || r.cur.refundCount);
  const avg = active.length ? {
    net: Math.round(active.reduce((n, r) => n + r.cur.net, 0) / active.length),
    basket: Math.round(active.reduce((n, r) => n + r.cur.basket, 0) / active.length),
    tickets: Math.round(active.reduce((n, r) => n + r.cur.tickets, 0) / active.length),
  } : null;
  rows.forEach((r) => {
    r.share = total.net > 0 ? Math.round((r.cur.net / total.net) * 1000) / 10 : 0;
    /* Une moyenne d'une seule boutique ne dit rien : pas d'écart sans au
       moins deux boutiques qui ont vendu. */
    r.vsAverage = avg && active.length > 1 && (r.cur.tickets || r.cur.refundCount) ? { net: deltaPct(r.cur.net, avg.net), basket: deltaPct(r.cur.basket, avg.basket) } : null;
  });
  return { rows, totals: { cur: total, prev: prevTotal, change: deltaPct(total.net, prevTotal.net) }, average: avg,
    best: best && best.merchant, worst: worst && worst.merchant,
    headline: rankingSentence('sites', { top: best && { name: best.name, value: best.cur.net, prev: best.prev.net }, total: total.net,
      mover: mover && { name: mover.name, delta: mover.cur.net - mover.prev.net } }) };
}
