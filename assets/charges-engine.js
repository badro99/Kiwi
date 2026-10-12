/* Kiwi · CHARGES (le calcul) · window.KiwiChargesEngine
 * ---------------------------------------------------------------------------
 * Ce que le commerce paie qu'il vende ou non, et ce que chaque vente laisse
 * en route, pour passer de la marge brute au VRAI résultat. Pur : aucun DOM,
 * aucun stockage, aucune horloge implicite. assets/charges.js le nourrit
 * (document `charges`, registre de ventes de KiwiCost, paie d'Équipe) et
 * tools/charges-test.mjs le charge tel quel.
 *
 * Les règles, une fois pour toutes :
 *   · une charge est une ligne datée : chaque montant vaut « à partir de »
 *     tel mois (`versions`), jusqu'à `until` inclus. Une hausse de loyer en
 *     mars ne réécrit pas février ;
 *   · une charge trimestrielle ou annuelle pèse son tiers ou son douzième
 *     chaque mois ; un mois pèse sur chacun de ses jours à parts égales
 *     (1/31 en octobre, 1/28 en février). Le loyer court le dimanche aussi ;
 *   · les salaires ne sont PAS ici : ils viennent d'Équipe (le calcul de Paie
 *     & planning), une seule saisie, jamais deux. Seul le taux des charges
 *     sociales patronales se règle ici ;
 *   · une commission se calcule vente par vente, sur les ventes que le
 *     registre de KiwiCost a gardées (ni annulées, ni reçues deux fois) : la
 *     part payée par carte au taux de la carte, et la vente entière au taux de
 *     la plateforme qui l'a apportée ;
 *   · la marge sur les ventes qui n'ont pas de coût est ESTIMÉE au taux
 *     mesuré sur celles qui en ont, et dite estimée. Sous la moitié des ventes
 *     chiffrées, il n'y a pas de résultat net : on ne l'invente pas. */
(function (root) {
  'use strict';

  const FREQ_MONTHS = { month: 1, quarter: 3, year: 12 };
  const MAX_AMOUNT = 10000000;
  const MAX_RATE = 60;
  const MIN_COSTED_PCT = 50;
  /* Canaux du commerce lui-même : aucune plateforme ne prélève dessus. */
  const OWN_CHANNELS = { '': 1, surplace: 1, emporter: 1, counter: 1, walkin: 1, dashboard: 1, generic: 1, hotel: 1, salle: 1, comptoir: 1, caisse: 1, pos: 1, table: 1, qr: 1 };

  const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
  const r2 = (n) => Math.round(n * 100) / 100;
  const isMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
  const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const monthOf = (day) => String(day).slice(0, 7);
  function daysInMonth(month) {
    const y = +month.slice(0, 4), m = +month.slice(5, 7);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function addDays(day, delta) {
    const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + delta));
    return d.toISOString().slice(0, 10);
  }
  /* Les `n` journées qui finissent à `last` inclus, de la plus ancienne. */
  function lastDays(last, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(addDays(last, -i));
    return out;
  }
  /* Toutes les journées du mois de `day`, et celles déjà commencées. */
  function monthDays(day) {
    const m = monthOf(day), n = daysInMonth(m), out = [];
    for (let i = 1; i <= n; i++) out.push(`${m}-${String(i).padStart(2, '0')}`);
    return out;
  }

  function blank() { return { v: 1, lines: [], social: { rate: null }, commissions: { methods: {}, channels: {} }, updatedAt: 0 }; }

  /* Un document venu d'ailleurs (serveur, autre appareil, ancienne version)
   * ramené à sa forme : toute valeur hors bornes est écartée, jamais
   * « corrigée » en un chiffre que personne n'a saisi. */
  function normalize(doc) {
    const d = doc && typeof doc === 'object' ? doc : {};
    const out = blank();
    out.updatedAt = num(d.updatedAt);
    (Array.isArray(d.lines) ? d.lines : []).forEach((l) => {
      if (!l || typeof l !== 'object' || !l.id) return;
      const versions = (Array.isArray(l.versions) ? l.versions : [])
        .filter((v) => v && isMonth(v.from) && num(v.amount) >= 0 && num(v.amount) <= MAX_AMOUNT)
        .map((v) => ({ from: v.from, amount: r2(num(v.amount)) }))
        .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
      /* une version par mois de départ : la dernière écrite gagne */
      const byFrom = new Map(); versions.forEach((v) => byFrom.set(v.from, v));
      /* une ligne supprimée reste une pierre tombale datée : sans elle, l'autre
       * appareil la ferait revenir à la fusion suivante */
      const deleted = l.deleted === true;
      if (!byFrom.size && !deleted) return;
      out.lines.push({
        id: String(l.id).slice(0, 40),
        label: String(l.label || '').trim().slice(0, 80),
        cat: String(l.cat || 'other').slice(0, 24),
        freq: FREQ_MONTHS[l.freq] ? l.freq : 'month',
        versions: Array.from(byFrom.values()),
        until: isMonth(l.until) ? l.until : null,
        updatedAt: num(l.updatedAt),
        ...(deleted ? { deleted: true } : {}),
      });
    });
    const rate = d.social && d.social.rate;
    out.social = { rate: rate == null || rate === '' || !(num(rate) >= 0 && num(rate) <= MAX_RATE) ? null : r2(num(rate)) };
    ['methods', 'channels'].forEach((k) => {
      const src = d.commissions && d.commissions[k];
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach((key) => {
        const v = src[key];
        if (v == null || v === '' || !(num(v) >= 0 && num(v) <= MAX_RATE)) return;
        out.commissions[k][String(key).toLowerCase().slice(0, 24)] = r2(num(v));
      });
    });
    return out;
  }

  /* Deux appareils qui modifient les charges : chaque ligne garde sa version
   * la plus récente, et aucune ligne d'un côté ne disparaît parce que l'autre
   * côté ne l'avait pas encore. Taux : le document le plus récent. */
  function merge(mine, theirs) {
    const a = normalize(mine), b = normalize(theirs);
    const lines = new Map();
    b.lines.concat(a.lines).forEach((l) => {
      const have = lines.get(l.id);
      if (!have || l.updatedAt >= have.updatedAt) lines.set(l.id, l);
    });
    const newer = a.updatedAt >= b.updatedAt ? a : b;
    return { v: 1, lines: Array.from(lines.values()), social: newer.social, commissions: newer.commissions, updatedAt: Math.max(a.updatedAt, b.updatedAt) };
  }

  /* Le montant d'une ligne, ramené au mois, pour le mois `month`. */
  function monthlyOf(line, month) {
    if (!line || line.deleted || !Array.isArray(line.versions) || !isMonth(month)) return 0;
    if (line.until && month > line.until) return 0;
    let v = null;
    line.versions.forEach((x) => { if (x && x.from <= month && (!v || x.from >= v.from)) v = x; });
    if (!v) return 0;
    return Math.max(0, num(v.amount)) / (FREQ_MONTHS[line.freq] || 1);
  }
  function monthlyTotal(doc, month) {
    return r2((doc && doc.lines || []).reduce((s, l) => s + monthlyOf(l, month), 0));
  }
  /* Les charges fixes portées par une liste de journées. */
  function fixedFor(doc, days) {
    const out = { total: 0, lines: [] };
    (doc && doc.lines || []).forEach((l) => {
      let amount = 0;
      (days || []).forEach((d) => {
        if (!isDay(d)) return;
        const m = monthOf(d);
        amount += monthlyOf(l, m) / daysInMonth(m);
      });
      if (amount > 0) out.lines.push({ id: l.id, label: l.label, cat: l.cat, amount: r2(amount) });
      out.total += amount;
    });
    out.total = r2(out.total);
    out.lines.sort((x, y) => y.amount - x.amount);
    return out;
  }

  const channelKey = (c) => String(c || '').trim().toLowerCase();
  function rateOf(map, key) {
    const r = map && map[key];
    return r == null ? 0 : Math.max(0, num(r));
  }
  /* La commission d'UNE vente acceptée par le registre. */
  function commissionOf(doc, sale) {
    const c = (doc && doc.commissions) || {};
    const amount = Math.max(0, num(sale && sale.amount));
    if (!amount) return { method: 0, channel: 0 };
    const parts = Array.isArray(sale.parts) && sale.parts.length
      ? sale.parts.map((p) => ({ method: String(p && p.method || '').toLowerCase(), amount: Math.max(0, num(p && p.amountCents) / 100) }))
      : [{ method: String(sale.method || 'cash').toLowerCase(), amount }];
    let method = 0;
    parts.forEach((p) => { method += p.amount * rateOf(c.methods, p.method) / 100; });
    const ch = channelKey(sale.channel);
    const channel = OWN_CHANNELS[ch] ? 0 : amount * rateOf(c.channels, ch) / 100;
    return { method, channel };
  }
  function commissionsFor(doc, sales) {
    const out = { total: 0, methods: 0, channels: 0, byKey: {} };
    (sales || []).forEach((s) => {
      const f = commissionOf(doc, s);
      out.methods += f.method; out.channels += f.channel;
      if (f.channel) { const k = 'ch:' + channelKey(s.channel); out.byKey[k] = (out.byKey[k] || 0) + f.channel; }
      if (f.method) { const k = 'pm:' + String(s.method || '').toLowerCase(); out.byKey[k] = (out.byKey[k] || 0) + f.method; }
    });
    out.methods = r2(out.methods); out.channels = r2(out.channels);
    out.total = r2(out.methods + out.channels);
    Object.keys(out.byKey).forEach((k) => { out.byKey[k] = r2(out.byKey[k]); });
    return out;
  }
  /* Les moyens de paiement et canaux vus dans les ventes : ce que l'éditeur
   * propose de régler (un taux pour ce que le commerce n'utilise pas est du
   * bruit). */
  function seenKeys(sales) {
    const methods = new Set(), channels = new Set();
    (sales || []).forEach((s) => {
      const parts = Array.isArray(s.parts) && s.parts.length ? s.parts : [{ method: s.method }];
      parts.forEach((p) => { const m = String(p && p.method || '').toLowerCase(); if (m && m !== 'cash' && m !== 'split' && m !== 'credit') methods.add(m); });
      const ch = channelKey(s.channel);
      if (ch && !OWN_CHANNELS[ch]) channels.add(ch);
    });
    return { methods: Array.from(methods), channels: Array.from(channels) };
  }

  /* Le personnel d'une période : la paie d'Équipe (`labour`, déjà ramenée
   * aux journées) plus les charges sociales patronales au taux réglé. */
  function staffFor(labour, socialRate) {
    if (!labour) return null;
    const base = Math.max(0, num(labour.baseDue));
    const variable = Math.max(0, num(labour.variablePay));
    const rate = socialRate == null ? 0 : num(socialRate);
    const social = (base + variable) * rate / 100;
    return {
      base: r2(base), variable: r2(variable), social: r2(social), total: r2(base + variable + social),
      salaried: num(labour.salaried), rated: num(labour.rated), members: num(labour.members),
      socialSet: socialRate != null,
    };
  }

  /* Le résultat d'une période.
   *   cov    : KiwiCost.summarize(registre) de la période
   *   sales  : les ventes acceptées du registre (registre.sales)
   *   days   : les journées de la période (YYYY-MM-DD)
   *   labour : la paie d'Équipe sur ces journées, ou null
   *   netOf  : TTC → HT selon la TVA du commerce (KiwiCost.netOf) */
  function result(doc, a) {
    const o = a || {};
    const cov = o.cov || null;
    const netOf = typeof o.netOf === 'function' ? o.netOf : (x) => x;
    const gross = cov ? Math.max(0, num(cov.revenue)) : 0;
    const refunds = cov ? Math.max(0, num(cov.refunds)) : 0;
    const salesTTC = gross - refunds;
    const fixed = fixedFor(doc, o.days);
    const staff = staffFor(o.labour, doc && doc.social ? doc.social.rate : null);
    const commissions = commissionsFor(doc, o.sales);

    let margin = null, rate = null, estimated = false, tooFew = false;
    const costedPct = cov && cov.pctCosted != null ? num(cov.pctCosted) : null;
    if (!(gross > 0)) {
      margin = 0;
    } else if (cov && num(cov.netCosted) > 0 && costedPct != null && costedPct >= MIN_COSTED_PCT) {
      rate = (num(cov.netCosted) - num(cov.cost)) / num(cov.netCosted);
      const uncostedHT = netOf(Math.max(0, gross - num(cov.revenueCosted)));
      /* un remboursement rend l'argent d'une vente moyenne : il retire sa
       * marge, au taux mesuré */
      margin = num(cov.profit) + uncostedHT * rate - netOf(refunds) * rate;
      estimated = uncostedHT >= 0.5;
    } else {
      tooFew = true;
    }
    const staffTotal = staff ? staff.total : 0;
    const net = margin == null ? null : margin - commissions.total - staffTotal - fixed.total;
    return {
      salesTTC: r2(salesTTC), salesHT: r2(netOf(salesTTC)),
      margin: margin == null ? null : r2(margin), rate, estimated, tooFew, costedPct,
      commissions, staff, fixed,
      net: net == null ? null : r2(net),
      configured: !!((doc && doc.lines || []).some((l) => !l.deleted) || (staff && staff.salaried) || (staff && staff.rated)
        || Object.keys((doc && doc.commissions && doc.commissions.methods) || {}).length
        || Object.keys((doc && doc.commissions && doc.commissions.channels) || {}).length),
    };
  }

  /* Le seuil de rentabilité du mois en cours.
   *   recent : result() des 30 dernières journées (le taux de contribution)
   *   month  : 'YYYY-MM' en cours ; monthLabour : la paie du mois entier
   *   openDays / openElapsed : journées d'ouverture du mois / déjà commencées
   *            (null si les horaires ne sont pas renseignés : jours civils)
   *   mtdSales : ventes TTC du mois à ce jour */
  function breakEven(doc, a) {
    const o = a || {};
    const recent = o.recent;
    const fixedMonth = monthlyTotal(doc, o.month);
    const staff = staffFor(o.monthLabour, doc && doc.social ? doc.social.rate : null);
    const need = fixedMonth + (staff ? staff.total : 0);
    const out = { fixedMonth, staffMonth: staff ? staff.total : 0, costsMonth: r2(need), contribution: null, salesNeeded: null, perDay: null, days: null, daysAreOpenDays: false, mtd: r2(num(o.mtdSales)), projection: null, gap: null, reason: '' };
    if (!(need > 0)) { out.reason = 'no-costs'; return out; }
    if (!recent || recent.margin == null || !(recent.salesTTC > 0)) { out.reason = recent && recent.tooFew ? 'too-few' : 'no-sales'; return out; }
    const contribution = (recent.margin - recent.commissions.total) / recent.salesTTC;
    out.contribution = contribution;
    if (!(contribution > 0)) { out.reason = 'negative'; return out; }
    out.salesNeeded = r2(need / contribution);
    const dim = daysInMonth(o.month);
    const open = o.openDays != null && o.openDays > 0;
    out.days = open ? o.openDays : dim;
    out.daysAreOpenDays = open;
    out.perDay = r2(out.salesNeeded / out.days);
    const elapsed = open ? num(o.openElapsed) : num(o.elapsed);
    if (elapsed > 0) {
      out.projection = r2(out.mtd / elapsed * out.days);
      out.gap = r2(out.projection - out.salesNeeded);
    }
    return out;
  }

  /* Une ligne modifiée « à partir de » `from` : la version de ce mois-là est
   * réécrite, les mois d'avant gardent la leur. */
  function setAmount(line, amount, from) {
    const l = Object.assign({}, line, { versions: (line.versions || []).slice() });
    const i = l.versions.findIndex((v) => v.from === from);
    if (i >= 0) l.versions[i] = { from, amount };
    else l.versions.push({ from, amount });
    l.versions.sort((x, y) => (x.from < y.from ? -1 : 1));
    /* une version postérieure à `from` reste : elle était déjà prévue */
    return l;
  }
  /* Arrêter une charge : elle ne pèse plus à partir de `month` ; si elle n'a
   * jamais pesé avant, elle disparaît tout simplement. */
  function remove(line, at) {
    return { id: line.id, label: line.label, cat: line.cat, freq: line.freq, versions: [], until: null, deleted: true, updatedAt: at };
  }
  function stop(line, month) {
    const before = (line.versions || []).some((v) => v.from < month);
    if (!before) return null;
    const prev = (() => { const y = +month.slice(0, 4), m = +month.slice(5, 7); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7); })();
    return Object.assign({}, line, { until: prev });
  }

  const api = {
    FREQ_MONTHS, MIN_COSTED_PCT, OWN_CHANNELS, MAX_AMOUNT, MAX_RATE,
    blank, normalize, merge, monthlyOf, monthlyTotal, fixedFor, commissionOf, commissionsFor, seenKeys,
    staffFor, result, breakEven, setAmount, stop, remove,
    days: { daysInMonth, addDays, lastDays, monthDays, monthOf },
  };
  root.KiwiChargesEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
