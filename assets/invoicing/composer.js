/* Exports: clientBook, vatOptions, lineRowHtml, blankLine, F, fv, readLines, apiLines, paintLines, termsOptions, formState, draftKey, composerPayload, formSnapshot, checkIce, updateComposer, validateComposer.
 * Reads: explicit dependencies passed per call; window APIs declared in split.json.
 * The entry owns screen state. No sibling module or private global is read. */
export function clientBook({}, self, args) {
function clientBook() {
    try {
      const rows = window.KiwiClientsDirectory?.load?.()?.rows;
      if (Array.isArray(rows)) return rows.filter(r => r && r.name);
      const list = window.KiwiClients?.list?.();
      if (Array.isArray(list)) return list.filter(r => r && r.name);
    } catch (_) {}
    return [];
  }
return clientBook.apply(self, args);
}
export function vatOptions({T, VAT_RATES, esc}, self, args) {
function vatOptions(selected) {
    const t = T(), set = VAT_RATES.slice();
    if (!set.includes(Number(selected))) set.push(Number(selected));
    return set.map(r => `<option value="${r}"${Number(selected) === r ? ' selected' : ''}>${r === 0 ? esc(t.exempt) : r + ' %'}</option>`).join('');
  }
return vatOptions.apply(self, args);
}
export function lineRowHtml({ICON, T, close, esc, vatOptions}, self, args) {
function lineRowHtml(l) {
    const t = T();
    return `<div class="inv-line-row" data-line>
      <div class="inv-line-desc"><input data-l="desc" value="${esc(l.description)}" placeholder="${esc(t.descPh)}" aria-label="${esc(t.desc)}"></div>
      <label class="inv-cell"><span>${esc(t.qty)}</span><input data-l="qty" inputmode="decimal" value="${esc(l.qty)}"></label>
      <label class="inv-cell"><span>${esc(t.unitHT)}</span><input data-l="unit" inputmode="decimal" value="${esc(l.unit)}" placeholder="0,00"></label>
      <label class="inv-cell"><span>${esc(t.discount)}</span><input data-l="disc" inputmode="decimal" value="${esc(l.disc)}" placeholder="0"></label>
      <label class="inv-cell"><span>${esc(t.vat)}</span><select data-l="vat">${vatOptions(l.vat)}</select></label>
      <div class="inv-cell"><span>${esc(t.lineHT)}</span><output class="inv-line-total" data-l="total">0,00</output></div>
      <button class="inv-line-remove" type="button" data-inv-act="remove-line" aria-label="${esc(t.removeLine)}">${ICON.close}</button>
    </div>`;
  }
return lineRowHtml.apply(self, args);
}
export function blankLine({DEFAULT_VAT}, self, args) {
const blankLine = () => ({description: '', qty: '1', unit: '', disc: '', vat: DEFAULT_VAT});
return blankLine.apply(self, args);
}
export function F({overlay}, self, args) {
const F = (name) => overlay?.querySelector('[data-f="' + name + '"]');
return F.apply(self, args);
}
export function fv({F}, self, args) {
const fv = (name) => String(F(name)?.value ?? '').trim();
return fv.apply(self, args);
}
export function readLines({overlay}, self, args) {
function readLines() {
    return [...overlay.querySelectorAll('.inv-line-row')].map(r => ({
      description: r.querySelector('[data-l="desc"]').value.trim(), qty: r.querySelector('[data-l="qty"]').value, unit: r.querySelector('[data-l="unit"]').value,
      disc: r.querySelector('[data-l="disc"]').value, vat: Number(r.querySelector('[data-l="vat"]').value),
    }));
  }
return readLines.apply(self, args);
}
export function apiLines({num, toCents}, self, args) {
const apiLines = (rows) => rows.filter(r => r.description || num(r.unit)).map(r => ({description: r.description, qty: num(r.qty), unitHT: toCents(r.unit), discountPct: Math.min(100, num(r.disc)), vatRate: Number(r.vat)}));
return apiLines.apply(self, args);
}
export function paintLines({lineRowHtml, overlay}, self, args) {
function paintLines(rows) {
    overlay.querySelector('[data-inv-lines]').innerHTML = rows.map(lineRowHtml).join('');
  }
return paintLines.apply(self, args);
}
export function termsOptions({T, TERMS_CHOICES, esc}, self, args) {
function termsOptions(selected) {
    const t = T();
    return TERMS_CHOICES.map(d => `<option value="${d}"${String(selected) === String(d) ? ' selected' : ''}>${esc(t['t' + d])}</option>`).join('') + `<option value="custom"${selected === 'custom' ? ' selected' : ''}>${esc(t.tCustom)}</option>`;
  }
return termsOptions.apply(self, args);
}
export function formState({TERMS_CHOICES, blankLine, centsInput, shift, today}, self, args) {
function formState(doc, type) {
    const base = doc ? doc : {type, customer: {}, lines: [], issueDate: today(), termsDays: 30, dueDate: '', validUntil: shift(30), paymentMethod: '', note: '', exemptionMention: ''};
    const c = base.customer || {};
    const terms = base.termsDays != null && TERMS_CHOICES.includes(Number(base.termsDays)) ? String(base.termsDays) : (base.dueDate ? 'custom' : '30');
    return {
      pick: '', kind: (c.ice || c.if) ? 'business' : 'person',
      name: c.name || '', addr: c.address || '', ice: c.ice || '', if: c.if || '', email: c.email || '', phone: c.phone || '', clientId: c.clientId || '',
      issue: base.issueDate || today(), terms, due: base.dueDate || '', valid: base.validUntil || shift(30),
      method: base.paymentMethod || '', note: base.note || '', exempt: base.exemptionMention || '',
      lines: (base.lines && base.lines.length ? base.lines : [null]).map(l => l ? ({description: l.description || '', qty: String(l.qty ?? 1).replace('.', ','), unit: centsInput(l.unitHT), disc: l.discountPct ? String(l.discountPct).replace('.', ',') : '', vat: Number(l.vatRate)}) : blankLine()),
    };
  }
return formState.apply(self, args);
}
export function draftKey({cmp, venueId}, self, args) {
const draftKey = () => 'kiwi:invoicing:draft:v2:' + venueId() + ':' + cmp.type + ':' + (cmp.id || 'new');
return draftKey.apply(self, args);
}
export function composerPayload({apiLines, cmp, fv, iceCompact, readLines, shift, today}, self, args) {
function composerPayload() {
    const t = fv('terms');
    const lines = apiLines(readLines());
    const payload = {
      type: cmp.type,
      customer: {name: fv('name'), address: fv('addr'), ice: iceCompact(fv('ice')), if: fv('if'), email: fv('email'), phone: fv('phone'), clientId: cmp.clientId || ''},
      lines, issueDate: fv('issue') || today(), note: fv('note'), exemptionMention: fv('exempt'),
    };
    if (cmp.id) payload.id = cmp.id;
    if (cmp.type === 'quote') payload.validUntil = fv('valid') || shift(30);
    else {
      if (t === 'custom') payload.dueDate = fv('due'); else payload.termsDays = Number(t || 0);
      payload.paymentMethod = fv('method');
    }
    return payload;
  }
return composerPayload.apply(self, args);
}
export function formSnapshot({cmp, fv, readLines}, self, args) {
function formSnapshot() {
    return {pick: '', kind: fv('kind'), name: fv('name'), addr: fv('addr'), ice: fv('ice'), if: fv('if'), email: fv('email'), phone: fv('phone'), clientId: cmp.clientId || '',
      issue: fv('issue'), terms: fv('terms'), due: fv('due'), valid: fv('valid'), method: fv('method'), note: fv('note'), exempt: fv('exempt'), lines: readLines()};
  }
return formSnapshot.apply(self, args);
}
export function checkIce({F, T, iceCompact, iceProblem, overlay}, self, args) {
function checkIce() {
    const el = F('ice'), msg = overlay?.querySelector('[data-ice-msg]'); if (!el || !msg) return null;
    const t = T(), p = el.disabled ? null : iceProblem(el.value);
    el.toggleAttribute('aria-invalid', !!p); if (p) el.setAttribute('aria-invalid', 'true');
    msg.className = 'inv-field-msg' + (p ? ' err' : '');
    msg.textContent = p ? ({digits: t.iceDigits, length: t.iceLength, checksum: t.iceChecksum}[p] || t.errIce) : (iceCompact(el.value) ? t.iceOk : '');
    return p;
  }
return checkIce.apply(self, args);
}
export function updateComposer({F, T, apiLines, computeTotals, currentView, esc, fv, lineHT, money, num, overlay, readLines, shift, toCents, today, tpl}, self, args) {
function updateComposer() {
    if (!overlay || currentView !== 'compose') return;
    const t = T();
    const rows = readLines(), lines = apiLines(rows);
    overlay.querySelectorAll('.inv-line-row').forEach((row, i) => {
      const r = rows[i];
      row.querySelector('[data-l="total"]').textContent = money(lineHT({qty: num(r.qty), unitHT: toCents(r.unit), discountPct: Math.min(100, num(r.disc))}));
    });
    const sums = computeTotals(lines);
    overlay.querySelector('[data-sum="ht"]').textContent = money(sums.htCents) + ' MAD';
    overlay.querySelector('[data-sum="ttc"]').textContent = money(sums.ttcCents) + ' MAD';
    overlay.querySelector('[data-sum-rates]').innerHTML = sums.byRate.map(r => `<div class="inv-summary-row" data-rate="${r.rate}"><span>${esc(tpl(t.vatOn, {rate: r.rate, base: money(r.baseCents)}))}</span><strong>${money(r.vatCents)} MAD</strong></div>`).join('');
    const wrap = overlay.querySelector('[data-exempt-wrap]');
    if (wrap) wrap.hidden = !lines.some(l => l.vatRate === 0);
    const dueWrap = overlay.querySelector('[data-due-wrap]');
    if (dueWrap) {
      const terms = fv('terms'), input = F('due');
      if (terms === 'custom') { input.disabled = false; }
      else { input.disabled = true; input.value = shift(Number(terms || 0), fv('issue') || today()); }
    }
  }
return updateComposer.apply(self, args);
}
export function validateComposer({F, T, checkIce, composerPayload, toast}, self, args) {
function validateComposer(forIssue) {
    const t = T(), p = composerPayload();
    if (!p.customer.name) { toast(t.errCustomer); F('name')?.focus(); return null; }
    if (checkIce()) { toast(t.errIce); F('ice')?.focus(); return null; }
    if (!p.lines.some(l => l.description && l.qty > 0)) { toast(t.errLines); return null; }
    if (forIssue && p.lines.some(l => l.vatRate === 0) && !p.exemptionMention && !p.note) { toast(t.errExempt); F('exempt')?.focus(); return null; }
    return p;
  }
return validateComposer.apply(self, args);
}

// Composer document: all markup and customer-picker options stay together.
export function renderComposerForm({overlay, cmp, st, locked, isQuote, title, book, t, dis, showIssue, issueLabel, termsOptions, METHODS, renderSellerLogo, esc, ICON, seller}) {
overlay.querySelector('[data-inv-compose]').innerHTML = `<div class="inv-composer-head"><div><button class="inv-btn small" type="button" data-inv-act="back">${ICON.back}${esc(t.back)}</button></div><div class="inv-step">${esc(cmp.number || t.draftNo)} · <span data-inv-autosave role="status">${esc(t.autosave)}</span></div></div>
      <h3 class="inv-compose-title" data-compose-title>${esc(title)}</h3>
      ${locked && cmp.reason ? `<p class="inv-foot-note">${esc(t.reason)} : ${esc(cmp.reason)}</p>` : ''}
      <div class="inv-form-grid"><div>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.customerBlock)}</h4>
          ${book.length && !locked ? `<div class="inv-field wide inv-pick"><label for="inv-f-pick">${esc(t.pickClient)}</label><select id="inv-f-pick" data-f="pick"><option value="">${esc(t.pickNone)}</option>${book.map((c, i) => `<option value="${i}">${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`).join('')}</select></div>` : ''}
          <div class="inv-fields">
            <div class="inv-field"><label for="inv-f-name">${esc(t.clientName)}</label><input id="inv-f-name" data-f="name" autocomplete="organization" value="${esc(st.name)}"${dis}></div>
            <div class="inv-field"><label for="inv-f-kind">${esc(t.kind)}</label><select id="inv-f-kind" data-f="kind"${dis}><option value="person"${st.kind === 'person' ? ' selected' : ''}>${esc(t.kindPerson)}</option><option value="business"${st.kind === 'business' ? ' selected' : ''}>${esc(t.kindBusiness)}</option></select></div>
            <div class="inv-field wide"><label for="inv-f-addr">${esc(t.address)}</label><input id="inv-f-addr" data-f="addr" autocomplete="street-address" value="${esc(st.addr)}"${dis}></div>
            <div class="inv-field"><label for="inv-f-ice" data-ice-label>${esc(st.kind === 'business' ? t.iceRequired : t.ice)}</label><input id="inv-f-ice" data-f="ice" inputmode="numeric" autocomplete="off" value="${esc(st.ice)}" aria-describedby="inv-f-ice-msg"${dis}><p class="inv-field-msg" id="inv-f-ice-msg" data-ice-msg role="status"></p></div>
            <div class="inv-field"><label for="inv-f-if">${esc(t.ifLabel)}</label><input id="inv-f-if" data-f="if" inputmode="numeric" value="${esc(st.if)}"${dis}></div>
            <div class="inv-field"><label for="inv-f-email">${esc(t.email)}</label><input id="inv-f-email" data-f="email" type="email" autocomplete="email" value="${esc(st.email)}"${dis}></div>
            <div class="inv-field"><label for="inv-f-phone">${esc(t.phone)}</label><input id="inv-f-phone" data-f="phone" type="tel" autocomplete="tel" value="${esc(st.phone)}"${dis}></div>
          </div></section>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.datesBlock)}</h4><div class="inv-fields">
          <div class="inv-field"><label for="inv-f-issue">${esc(t.issueDate)}</label><input id="inv-f-issue" data-f="issue" type="date" value="${esc(st.issue)}"></div>
          ${isQuote
            ? `<div class="inv-field"><label for="inv-f-valid">${esc(t.validUntil)}</label><input id="inv-f-valid" data-f="valid" type="date" value="${esc(st.valid)}"></div>`
            : `<div class="inv-field"><label for="inv-f-terms">${esc(t.terms)}</label><select id="inv-f-terms" data-f="terms">${termsOptions(st.terms)}</select></div>
               <div class="inv-field" data-due-wrap><label for="inv-f-due">${esc(t.due)}</label><input id="inv-f-due" data-f="due" type="date" value="${esc(st.due)}"></div>`}
          ${isQuote ? '' : `<div class="inv-field"><label for="inv-f-method">${esc(t.method)}</label><select id="inv-f-method" data-f="method"><option value=""></option>${METHODS.map(m => `<option value="${m}"${st.method === m ? ' selected' : ''}>${esc(t[m])}</option>`).join('')}</select></div>`}
        </div></section>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.lines)}</h4><div data-inv-lines></div><button data-activation=write class="inv-add-line" type="button" data-inv-act="add-line">${esc(t.addLine)}</button></section>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.noteBlock)}</h4><div class="inv-fields">
          <div class="inv-field wide"><label for="inv-f-note">${esc(t.note)}</label><textarea id="inv-f-note" data-f="note" placeholder="${esc(t.notePh)}">${esc(st.note)}</textarea></div>
          <div class="inv-field wide" data-exempt-wrap hidden><label for="inv-f-exempt">${esc(t.exemptionMention)}</label><input id="inv-f-exempt" data-f="exempt" value="${esc(st.exempt)}" placeholder="${esc(t.exemptionPh)}"><p class="inv-field-msg warn">${esc(t.exemptionNeed)}</p></div>
        </div></section>
      </div><aside class="inv-summary-card"><div class="inv-summary-brand"><div class="inv-summary-logo">${renderSellerLogo(seller, 28)}</div><span class="inv-summary-no">${esc(cmp.number || t.draftNo)}</span></div>
        <div class="inv-summary-body"><div class="inv-summary-row"><span>${esc(t.totalHT)}</span><strong data-sum="ht">0,00 MAD</strong></div><div data-sum-rates></div><div class="inv-summary-row total"><span>${esc(t.totalTTC)}</span><strong data-sum="ttc">0,00 MAD</strong></div></div>
        <p class="inv-assurance">${esc(t.previewNote)}</p></aside></div>
      <div class="inv-form-actions"><button data-activation=write class="inv-btn" type="button" data-inv-act="save-draft">${esc(cmp.id && cmp.status !== 'draft' ? t.save : t.saveDraft)}</button>${showIssue ? `<button class="inv-btn primary" type="button" data-inv-act="issue-composer">${ICON.check}${esc(issueLabel)}</button>` : ''}</div>`;
}
