/* Exports: termsText, printable, printDocument.
 * Reads: explicit dependencies passed per call; window APIs declared in split.json.
 * The entry owns screen state. No sibling module or private global is read. */
export function termsText({T, tpl}, self, args) {
function termsText(doc) {
    const t = T();
    if (doc.type === 'quote') return '';
    let days = doc.termsDays;
    if ((days == null || days === '') && doc.issueDate && doc.dueDate) days = Math.round((new Date(doc.dueDate + 'T12:00:00') - new Date(doc.issueDate + 'T12:00:00')) / 86400000);
    if (days == null || days === '' || !isFinite(days)) return '';
    return Number(days) === 0 ? t.t0 : (t['t' + days] || tpl(t.t30.replace(/\d+/, '{n}'), {n: days}));
  }
return termsText.apply(self, args);
}
export function printable({T, businessName, computeTotals, dmy, esc, getSeller, lang, lineHT, money, renderSellerLogo, termsText, tpl}, self, args) {
function printable(doc, extra) {
    /* Pas KiwiInvoice.html : ce gabarit-là est celui d'une vente de comptoir
     * acquittée (« Payée », prix TTC). Un document saisi ici a des prix HT, une
     * échéance et peut être impayé : il garde son propre gabarit. */
    extra = extra || {};
    const t = T(), draft = doc.status === 'draft', type = doc.type;
    const seller = doc.seller && !draft ? doc.seller : getSeller(), biz = seller.name || businessName();
    const tot = doc.totals && doc.totals.byRate ? doc.totals : computeTotals(doc.lines);
    const rtl = lang() === 'ar';
    const title = {invoice: {fr: 'FACTURE', en: 'INVOICE', ar: 'فاتورة'}, quote: {fr: 'DEVIS', en: 'QUOTE', ar: 'عرض سعر'}, credit_note: {fr: 'AVOIR', en: 'CREDIT NOTE', ar: 'إشعار دائن'}}[type][lang()] || 'FACTURE';
    const sellerBlock = [
      `<strong>${esc(seller.legalName || biz)}</strong>`,
      [seller.address, seller.city].filter(Boolean).map(esc).join(', '),
      seller.phone ? `Tél : ${esc(seller.phone)}` : '',
      seller.email ? esc(seller.email) : '',
      seller.ice ? `<b>ICE :</b> ${esc(seller.ice)}` : '',
      (seller.if || seller.fiscal) ? `<b>IF :</b> ${esc(seller.if || seller.fiscal)}` : '',
      seller.rc ? `<b>RC :</b> ${esc(seller.rc)}` : '',
      seller.patente ? `<b>Patente :</b> ${esc(seller.patente)}` : '',
    ].filter(Boolean).join('<br>');
    const c = doc.customer || {};
    const customerBlock = [
      `<strong>${esc(c.name || '')}</strong>`, c.address ? esc(c.address) : '',
      c.ice ? `<b>ICE :</b> ${esc(c.ice)}` : '', c.if ? `<b>IF :</b> ${esc(c.if)}` : '',
      c.email ? esc(c.email) : '', c.phone ? esc(c.phone) : '',
    ].filter(Boolean).join('<br>');
    const numberText = draft || !doc.number ? '' : esc(doc.number);
    const dates = [`${esc(t.issuedOn)} : ${esc(dmy(doc.issueDate))}`];
    if (type === 'invoice' && doc.dueDate) dates.push(`${esc(t.dueOn)} : ${esc(dmy(doc.dueDate))}`);
    if (type === 'quote' && doc.validUntil) dates.push(`${esc(t.validOn)} : ${esc(dmy(doc.validUntil))}`);
    const rows = (doc.lines || []).map(l => `<tr><td>${esc(l.description)}</td><td>${esc(String(l.qty).replace('.', ','))}</td><td>${money(l.unitHT)}</td><td>${Number(l.discountPct) ? esc(String(l.discountPct).replace('.', ',')) + ' %' : '·'}</td><td>${Number(l.vatRate)} %</td><td>${money(lineHT(l))}</td></tr>`).join('');
    const vatRows = tot.byRate.map(r => `<div class="row"><span>${esc(tpl(t.vatOn, {rate: r.rate, base: money(r.baseCents)}))}</span><b>${money(r.vatCents)} MAD</b></div>`).join('');
    const paid = extra.paidCents != null ? extra.paidCents : 0;
    /* « Arrêtée la présente facture à la somme de : … » depuis le TTC en centimes ; ligne omise sans le module. */
    const arrete = window.KiwiInvoice && window.KiwiInvoice.amountWords ? window.KiwiInvoice.amountWords.arreteFr(type, tot.ttcCents) : '';
    const settle = type === 'invoice' && !draft && paid > 0 ? `<div class="row"><span>${esc(t.paid)}</span><b>${money(paid)} MAD</b></div><div class="row"><span>${esc(t.balance)}</span><b>${money(extra.balanceCents != null ? extra.balanceCents : Math.max(0, tot.ttcCents - paid))} MAD</b></div>` : '';
    const creditRef = type === 'credit_note' ? `<div class="mention">${esc(extra.originalDate ? tpl(t.creditOnDate, {n: doc.originalNumber || '', date: dmy(extra.originalDate)}) : tpl(t.creditOn, {n: doc.originalNumber || ''}))}${doc.reason ? `<br>${esc(t.reason)} : ${esc(doc.reason)}` : ''}</div>` : '';
    const terms = termsText(doc), method = doc.paymentMethod ? t[doc.paymentMethod] || doc.paymentMethod : '';
    const payLine = [terms ? `${esc(t.terms)} : ${esc(terms)}` : '', method ? `${esc(t.method)} : ${esc(method)}` : ''].filter(Boolean).join(' · ');
    const mark = {fr: 'BROUILLON · sans valeur fiscale', en: 'DRAFT · no tax value', ar: 'مسودة · دون قيمة جبائية'}[lang()] || 'BROUILLON · sans valeur fiscale';
    return `<!doctype html><html lang="${esc(lang())}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><base href="${esc(document.baseURI)}"><title>${esc(title)} ${numberText || esc(t.draftNo)}</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box;font-style:normal}body{font:12.5px "Inter Tight",Arial,"IBM Plex Sans Arabic",sans-serif;color:#102019;margin:0;position:relative}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #087653;padding-bottom:20px}.logo img{display:block;width:auto;height:32px}.meta{color:#69746e;line-height:1.6;margin-top:7px}h1{margin:0;font-size:26px;letter-spacing:.02em}.num{font-size:15px;font-weight:600;margin-top:4px}.head{text-align:${rtl ? 'left' : 'right'}}.parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:24px 0}.label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#777;margin-bottom:8px}.party{line-height:1.55}.party strong{font-size:13px}table{width:100%;border-collapse:collapse}th{background:#f1f6f3;text-align:${rtl ? 'right' : 'left'};color:#65716b;padding:9px 8px;font-size:11px}td{padding:10px 8px;border-bottom:1px solid #e2e8e4}tr{break-inside:avoid}td:first-child{overflow-wrap:anywhere;unicode-bidi:plaintext}th:not(:first-child),td:not(:first-child){text-align:${rtl ? 'left' : 'right'}}.totals{width:320px;margin-top:18px;margin-inline-start:auto;break-inside:avoid}.row{display:flex;justify-content:space-between;gap:12px;padding:6px 0}.row.total{border-top:2px solid #087653;margin-top:8px;padding-top:12px;font-size:17px;font-weight:700;color:#087653}.note,.mention{margin-top:22px;background:#f3f7f5;border-${rtl ? 'right' : 'left'}:3px solid #087653;padding:12px 14px;color:#58645e;line-height:1.5}.pay{margin-top:18px;color:#58645e}.watermark{position:fixed;top:42%;left:0;right:0;text-align:center;font-size:54px;font-weight:600;letter-spacing:.06em;color:rgba(180,54,41,.16);transform:rotate(-18deg);pointer-events:none}.words{margin-top:16px;line-height:1.5;color:#1e2a24;break-inside:avoid}.foot{position:fixed;bottom:0;color:#849089;font-size:10px}</style></head><body>${draft ? `<div class="watermark">${esc(mark)}</div>` : ''}<div class="top"><div><div class="logo">${renderSellerLogo(seller, 32)}</div><div class="meta"><strong>${esc(biz)}</strong></div></div><div class="head"><h1>${esc(title)}</h1>${numberText ? `<div class="num">${numberText}</div>` : ''}<div class="meta">${dates.join('<br>')}</div></div></div>${creditRef}<div class="parties"><div><div class="label">${esc(t.from)}</div><div class="party">${sellerBlock}</div></div><div><div class="label">${esc(t.billTo)}</div><div class="party">${customerBlock}</div></div></div><table><thead><tr><th>${esc(t.item)}</th><th>${esc(t.qty)}</th><th>${esc(t.unitHT)}</th><th>${esc(t.discount.replace(/\s*%/, ''))}</th><th>${esc(t.vat)} %</th><th>${esc(t.lineHT)}</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="row"><span>${esc(t.totalHT)}</span><b>${money(tot.htCents)} MAD</b></div>${vatRows}<div class="row total"><span>${esc(t.totalTTC)}</span><span>${money(tot.ttcCents)} MAD</span></div>${settle}</div>${arrete ? `<div class="words" lang="fr" dir="ltr">${esc(arrete)}</div>` : ''}${doc.exemptionMention ? `<div class="mention">${esc(t.exemptionMention)} : ${esc(doc.exemptionMention)}</div>` : ''}${payLine ? `<div class="pay">${payLine}</div>` : ''}${doc.note ? `<div class="note">${esc(doc.note)}</div>` : ''}<div class="foot">${esc(biz)} · ${esc(title)} ${numberText || esc(t.draftNo)}</div><script>addEventListener('load',()=>setTimeout(()=>print(),150))<\/script></body></html>`;
  }
return printable.apply(self, args);
}
export function printDocument({T, detail, pick, printable, toast}, self, args) {
function printDocument() {
    if (!detail) return;
    const d = detail, doc = d.doc;
    const extra = {paidCents: Math.max(0, (doc.totals?.ttcCents || 0) - d.balanceCents), balanceCents: d.balanceCents, originalDate: d.original ? d.original.issueDate : ''};
    if (doc.type === 'invoice') extra.paidCents = d.payments.reduce((s, p) => s + (Number(pick(p, 'amountCents', 'amount_cents')) || 0), 0);
    const win = window.open('', '_blank'); if (!win) { toast(T().printBlocked); return; }
    win.document.open(); win.document.write(printable(doc, extra)); win.document.close();
    /* Un document est du papier, pas une extension du thème du tableau de bord :
       la page et ses marges restent claires même si la fenêtre mère est sombre. */
    win.document.documentElement.style.cssText += ';color-scheme:light;background:#fff;color:#102019';
    if (win.document.body) win.document.body.style.cssText += ';background:#fff;color:#102019';
  }
return printDocument.apply(self, args);
}
