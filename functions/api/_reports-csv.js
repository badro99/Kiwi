// L'export CSV des rapports. Les mêmes règles que le dossier du mois
// (assets/month-report.js › csv) : un BOM UTF-8 en tête pour qu'Excel lise
// l'arabe et les accents, le point-virgule (Excel en français), CRLF, chaque
// cellule entre guillemets, un guillemet doublé, et un texte qui commence par
// = + - @ précédé d'une apostrophe pour qu'aucune cellule ne devienne une
// formule. Les montants sont en MAD avec la virgule décimale, sans séparateur
// de milliers : un tableur les lit comme des nombres.

export const BOM = '﻿';

export function cell(v) {
  if (v == null) return '""';
  if (typeof v === 'object' && v.n != null) return '"' + v.n + '"';
  let s = String(v);
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
/* Un montant en centimes → « 1234,50 » (marqué nombre : pas d'apostrophe sur
   un montant négatif). */
export const mad = (cents) => (cents == null ? null : { n: (Math.round(Number(cents) || 0) / 100).toFixed(2).replace('.', ',') });
export const qty = (q) => (q == null ? null : { n: String(Math.round((Number(q) || 0) * 1000) / 1000).replace('.', ',') });
export const pc = (p) => (p == null || !Number.isFinite(p) ? null : { n: (Math.round(p * 10) / 10).toFixed(1).replace('.', ',') });

export function toCsv(header, rows) {
  return BOM + [header].concat(rows).map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

const H = {
  fr: { day: 'Journée', net: 'Ventes nettes (MAD)', prevDay: 'Journée comparée', prevNet: 'Ventes nettes comparées (MAD)',
    name: 'Nom', category: 'Catégorie', qty: 'Quantité', prevQty: 'Quantité comparée', gross: 'Brut des lignes (MAD)', share: 'Part (%)', change: 'Évolution (%)',
    tickets: 'Tickets', cost: 'Coût (MAD)', margin: 'Marge (MAD)', marginPct: 'Marge (%)', sales: 'Ventes (MAD)', prevSales: 'Ventes comparées (MAD)', basket: 'Panier moyen (MAD)',
    discounts: 'Remises (MAD)', refunds: 'Remboursements (MAD)', refundCount: 'Nombre de remboursements', tips: 'Pourboires (MAD)',
    method: 'Moyen de paiement', amount: 'Encaissé (MAD)', count: 'Nombre', prevAmount: 'Encaissé comparé (MAD)', channel: 'Canal',
    rate: 'Taux TVA (%)', ht: 'HT (MAD)', vat: 'TVA (MAD)', ttc: 'TTC (MAD)', unknownRate: 'Taux inconnu',
    customer: 'Client', spend: 'Dépense (MAD)', last: 'Dernière visite', prevSpend: 'Dépense comparée (MAD)', site: 'Établissement',
    weekday: 'Jour', hour: 'Heure', metric: 'Indicateur', value: 'Valeur', prevValue: 'Valeur comparée',
    unassigned: 'Sans vendeur', none: 'Sans catégorie', total: 'Total' },
  en: { day: 'Business day', net: 'Net sales (MAD)', prevDay: 'Compared day', prevNet: 'Compared net sales (MAD)',
    name: 'Name', category: 'Category', qty: 'Quantity', prevQty: 'Compared quantity', gross: 'Line gross (MAD)', share: 'Share (%)', change: 'Change (%)',
    tickets: 'Tickets', cost: 'Cost (MAD)', margin: 'Margin (MAD)', marginPct: 'Margin (%)', sales: 'Sales (MAD)', prevSales: 'Compared sales (MAD)', basket: 'Average basket (MAD)',
    discounts: 'Discounts (MAD)', refunds: 'Refunds (MAD)', refundCount: 'Refund count', tips: 'Tips (MAD)',
    method: 'Payment method', amount: 'Collected (MAD)', count: 'Count', prevAmount: 'Compared collected (MAD)', channel: 'Channel',
    rate: 'VAT rate (%)', ht: 'Excl. VAT (MAD)', vat: 'VAT (MAD)', ttc: 'Incl. VAT (MAD)', unknownRate: 'Unknown rate',
    customer: 'Customer', spend: 'Spend (MAD)', last: 'Last visit', prevSpend: 'Compared spend (MAD)', site: 'Location',
    weekday: 'Day', hour: 'Hour', metric: 'Metric', value: 'Value', prevValue: 'Compared value',
    unassigned: 'No seller', none: 'No category', total: 'Total' },
  ar: { day: 'اليوم التجاري', net: 'المبيعات الصافية (درهم)', prevDay: 'يوم المقارنة', prevNet: 'المبيعات الصافية للمقارنة (درهم)',
    name: 'الاسم', category: 'القسم', qty: 'الكمية', prevQty: 'الكمية للمقارنة', gross: 'إجمالي السطور (درهم)', share: 'الحصة (%)', change: 'التطور (%)',
    tickets: 'التذاكر', cost: 'التكلفة (درهم)', margin: 'الهامش (درهم)', marginPct: 'الهامش (%)', sales: 'المبيعات (درهم)', prevSales: 'المبيعات للمقارنة (درهم)', basket: 'متوسط السلة (درهم)',
    discounts: 'التخفيضات (درهم)', refunds: 'المرجوعات (درهم)', refundCount: 'عدد المرجوعات', tips: 'البقشيش (درهم)',
    method: 'وسيلة الأداء', amount: 'المحصّل (درهم)', count: 'العدد', prevAmount: 'المحصّل للمقارنة (درهم)', channel: 'القناة',
    rate: 'نسبة الضريبة (%)', ht: 'دون ضريبة (درهم)', vat: 'الضريبة (درهم)', ttc: 'بالضريبة (درهم)', unknownRate: 'نسبة غير معروفة',
    customer: 'الزبون', spend: 'الإنفاق (درهم)', last: 'آخر زيارة', prevSpend: 'الإنفاق للمقارنة (درهم)', site: 'المؤسسة',
    weekday: 'اليوم', hour: 'الساعة', metric: 'المؤشر', value: 'القيمة', prevValue: 'القيمة للمقارنة',
    unassigned: 'بدون بائع', none: 'بدون قسم', total: 'المجموع' },
};
const METRICS = {
  fr: { gross: 'Ventes brutes (MAD)', discounts: 'Remises (MAD)', refunds: 'Remboursements (MAD)', net: 'Ventes nettes (MAD)', vat: 'TVA collectée (MAD)',
    cogs: 'Coût des ventes (MAD)', margin: 'Marge brute (MAD)', marginPct: 'Marge brute (%)', costCoverage: 'Ventes au coût connu (%)', tickets: 'Tickets',
    basket: 'Panier moyen (MAD)', itemsPerTicket: 'Articles par ticket', tips: 'Pourboires (MAD)', refundCount: 'Remboursements' },
  en: { gross: 'Gross sales (MAD)', discounts: 'Discounts (MAD)', refunds: 'Refunds (MAD)', net: 'Net sales (MAD)', vat: 'VAT collected (MAD)',
    cogs: 'Cost of goods (MAD)', margin: 'Gross margin (MAD)', marginPct: 'Gross margin (%)', costCoverage: 'Sales with known cost (%)', tickets: 'Tickets',
    basket: 'Average basket (MAD)', itemsPerTicket: 'Items per ticket', tips: 'Tips (MAD)', refundCount: 'Refunds' },
  ar: { gross: 'المبيعات الإجمالية (درهم)', discounts: 'التخفيضات (درهم)', refunds: 'المرجوعات (درهم)', net: 'المبيعات الصافية (درهم)', vat: 'الضريبة المحصّلة (درهم)',
    cogs: 'تكلفة المبيعات (درهم)', margin: 'الهامش الإجمالي (درهم)', marginPct: 'الهامش الإجمالي (%)', costCoverage: 'مبيعات بتكلفة معروفة (%)', tickets: 'التذاكر',
    basket: 'متوسط السلة (درهم)', itemsPerTicket: 'منتجات في كل تذكرة', tips: 'البقشيش (درهم)', refundCount: 'المرجوعات' },
};
const MONEY = new Set(['gross', 'discounts', 'refunds', 'net', 'vat', 'cogs', 'margin', 'basket', 'tips']);

function metricRows(cur, prev, lang) {
  const M = METRICS[lang] || METRICS.fr;
  return Object.keys(M).map((k) => {
    const fmt = (K) => {
      const v = k === 'vat' ? (K.vat && K.vat.vat) : K[k];
      return MONEY.has(k) ? mad(v) : k === 'tickets' || k === 'refundCount' ? (v == null ? null : { n: String(v) }) : pc(v);
    };
    return [M[k], fmt(cur), fmt(prev), pc(k === 'net' ? deltaOf(cur.net, prev.net) : null)];
  });
}
const deltaOf = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

/* Le CSV d'un rapport déjà construit. `labels` donne les noms lisibles des
   moyens de paiement et des canaux. */
export function reportCsv(name, data, lang, labels) {
  const h = H[lang] || H.fr;
  if (name === 'summary') {
    const head = [h.metric, h.value, h.prevValue, h.change];
    const series = data.series.map((s) => [s.day, mad(s.net), s.prevDay, mad(s.prevNet), pc(deltaOf(s.net, s.prevNet))]);
    return toCsv(head, metricRows(data.totals.cur, data.totals.prev, lang).concat([[]], [[h.day, h.net, h.prevDay, h.prevNet, h.change]], series));
  }
  if (name === 'products' || name === 'categories') {
    const head = [h.name, h.category, h.qty, h.net, h.share, h.prevQty, h.prevNet, h.change, h.tickets, h.cost, h.margin, h.marginPct];
    return toCsv(head, data.rows.map((r) => [name === 'categories' && !r.name ? h.none : r.name, r.category, qty(r.qty), mad(r.net), pc(r.share),
      qty(r.prevQty), mad(r.prevNet), pc(r.change), { n: String(r.tickets) }, mad(r.cost), mad(r.margin), pc(r.marginPct)]));
  }
  if (name === 'staff') {
    const head = [h.name, h.tickets, h.sales, h.share, h.basket, h.discounts, h.refunds, h.refundCount, h.tips, h.prevSales, h.change];
    return toCsv(head, data.rows.map((r) => [r.unassigned ? h.unassigned : (r.name || r.id), { n: String(r.tickets) }, mad(r.sales), pc(r.share), mad(r.basket),
      mad(r.discounts), mad(r.refunds), { n: String(r.refundCount) }, mad(r.tips), mad(r.prevSales), pc(r.change)]));
  }
  if (name === 'payments') {
    const head = [h.method, h.amount, h.count, h.share, h.refunds, h.prevAmount, h.change];
    return toCsv(head, data.rows.map((r) => [labels.method(r.method), mad(r.cents), { n: String(r.count) }, pc(r.share), mad(r.refunds), mad(r.prevCents), pc(r.change)]));
  }
  if (name === 'channels') {
    const head = [h.channel, h.sales, h.count, h.share, h.prevSales, h.change];
    return toCsv(head, data.rows.map((r) => [labels.channel(r.channel), mad(r.cents), { n: String(r.count) }, pc(r.share), mad(r.prevCents), pc(r.change)]));
  }
  if (name === 'heatmap') {
    const head = [h.weekday].concat(Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00'));
    return toCsv(head, data.grid.map((row, wd) => [labels.weekday(wd)].concat(row.map(mad))));
  }
  if (name === 'vat') {
    const head = [h.rate, h.ht, h.vat, h.ttc];
    const rows = data.rows.map((r) => [r.rate == null ? h.unknownRate : pc(r.rate), mad(r.ht), mad(r.vat), mad(r.ttc)]);
    rows.push([h.total, mad(data.totals.ht), mad(data.totals.vat), mad(data.totals.ttc)]);
    return toCsv(head, rows);
  }
  if (name === 'customers') {
    const head = [h.customer, h.tickets, h.spend, h.basket, h.last, h.prevSpend, h.change];
    return toCsv(head, data.rows.map((r) => [r.name || r.id, { n: String(r.tickets) }, mad(r.spend), mad(r.basket),
      r.last ? new Date(r.last).toISOString().slice(0, 10) : '', mad(r.prevSpend), pc(r.change)]));
  }
  if (name === 'sites') {
    const M = METRICS[lang] || METRICS.fr;
    const head = [h.site, M.net, h.share, M.tickets, M.basket, M.discounts, M.refunds, h.prevNet, h.change];
    const rows = data.rows.map((r) => [r.name || r.merchant, mad(r.cur.net), pc(r.share), { n: String(r.cur.tickets) }, mad(r.cur.basket),
      mad(r.cur.discounts), mad(r.cur.refunds), mad(r.prev.net), pc(r.change)]);
    const t = data.totals;
    rows.push([h.total, mad(t.cur.net), pc(100), { n: String(t.cur.tickets) }, mad(t.cur.basket), mad(t.cur.discounts), mad(t.cur.refunds), mad(t.prev.net), pc(t.change)]);
    return toCsv(head, rows);
  }
  return toCsv([h.name], []);
}
