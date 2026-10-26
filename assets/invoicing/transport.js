/* transport interface: exports createTransport.
 * Reads only the dependencies listed below and browser APIs declared in split.json.
 * View dependencies are resolved for each call; mutable screen state stays with the entry owner. */
export function createTransport({TYPES, computeTotals, getSeller, iceProblem, lsGet, lsSet, merchantSlug, ownData, shift, today, venueId}) {
function fetchDeadline(url, options, readBody) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer;
    var request = new Promise(function (resolve, reject) {
      try { resolve(fetch(url, Object.assign({}, options, controller ? {signal: controller.signal} : {}))); }
      catch (error) { reject(error); }
    }).then(function (response) {
      if (readBody === false || !response || typeof response.json !== 'function') return response;
      return response.json().then(function (data) {
        response.json = function () { return Promise.resolve(data); }; return response;
      }, function (error) {
        response.json = function () { return Promise.reject(error); }; return response;
      });
    });
    var deadline = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        var error = new Error('request-timeout'); error.code = 'timeout';
        reject(error);
        if (controller) controller.abort();
      }, 12000);
    });
    return Promise.race([request, deadline]).finally(function () { clearTimeout(timer); });
  }

function apiError(code, message, status) { const e = new Error(message || code); e.code = code; e.status = status; return e; }

async function api(method, payload) {
    if (!ownData()) return demo.handle(method, payload || {});
    const merchant = merchantSlug();
    let res;
    try {
      if (method === 'GET') {
        res = await fetchDeadline('/api/invoices?' + new URLSearchParams(Object.assign({merchant}, payload || {})).toString(), {credentials: 'same-origin'});
      } else {
        res = await fetchDeadline('/api/invoices', {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json'}, body: JSON.stringify(Object.assign({merchant}, payload || {}))});
      }
    } catch (_) { throw apiError('offline'); }
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data || data.ok === false || data.error) {
      throw apiError(data?.error || (res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : res.status === 404 ? 'not-found' : 'server'), data?.message, res.status);
    }
    return data;
  }

const demo = (() => {
    let S = null;
    const key = () => 'kiwi:invoicing:demo:v2:' + venueId();
    const persist = () => lsSet(key(), JSON.stringify(S));
    const PREFIX = {invoice: 'F', credit_note: 'AV', quote: 'D'};
    function uid() { return 'inv_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); }
    function number(prefix, seq, year) { return prefix + '-' + year + '-' + String(seq).padStart(4, '0'); }
    function fresh(type, patch) {
      const now = Date.now();
      return Object.assign({id: uid(), type, status: 'draft', number: '', seq: null, issueDate: today(), dueDate: '', termsDays: 30, validUntil: '',
        customer: {name: '', address: '', ice: '', if: '', email: '', phone: '', clientId: ''}, seller: null, lines: [], totals: computeTotals([]),
        paymentMethod: '', note: '', internalNote: '', exemptionMention: '', originalId: '', sourceQuoteId: '', reason: '', createdTs: now, updatedTs: now, issuedTs: null, sentTs: null}, patch || {});
    }
    function allocate(doc) {
      const prefix = PREFIX[doc.type], year = Number(String(doc.issueDate || today()).slice(0, 4));
      S.seq[prefix] = (S.seq[prefix] || 0) + 1;
      doc.seq = S.seq[prefix]; doc.number = number(prefix, doc.seq, year);
    }
    function creditedOf(doc) { return S.docs.filter(d => d.type === 'credit_note' && d.originalId === doc.id && d.status === 'issued').reduce((s, d) => s + d.totals.ttcCents, 0); }
    function paidOf(doc) { return S.payments.filter(p => p.docId === doc.id).reduce((s, p) => s + p.amountCents, 0); }
    function derive(doc) {
      if (doc.type === 'credit_note') return {displayStatus: doc.status, balanceCents: 0};
      if (doc.type === 'quote') return {displayStatus: doc.status === 'sent' && doc.validUntil && doc.validUntil < today() ? 'expired' : doc.status, balanceCents: 0};
      if (doc.status === 'draft') return {displayStatus: 'draft', balanceCents: 0};
      const ttc = doc.totals.ttcCents, paid = paidOf(doc), credited = creditedOf(doc), balance = Math.max(0, ttc - paid - credited);
      let ds = 'issued';
      if (credited >= ttc && ttc > 0) ds = 'cancelled';
      else if (balance <= 0) ds = 'paid';
      else if (doc.dueDate && doc.dueDate < today()) ds = 'overdue';
      else if (paid > 0) ds = 'partial';
      return {displayStatus: ds, balanceCents: balance};
    }
    const rowOf = (d) => Object.assign({id: d.id, type: d.type, status: d.status, number: d.number, issueDate: d.issueDate, dueDate: d.dueDate, validUntil: d.validUntil,
      customer: {name: d.customer.name, ice: d.customer.ice}, totals: {ttcCents: d.totals.ttcCents},
      originalNumber: d.originalId ? (S.docs.find(x => x.id === d.originalId)?.number || '') : '', legacyRef: d.legacyRef || ''}, derive(d));
    const clone = (o) => JSON.parse(JSON.stringify(o));
    function find(id) { const d = S.docs.find(x => x.id === id); if (!d) throw apiError('not-found'); return d; }

    function applyFields(d, b) {
      if (b.customer) d.customer = Object.assign({name: '', address: '', ice: '', if: '', email: '', phone: '', clientId: ''}, b.customer);
      if (Array.isArray(b.lines)) d.lines = b.lines.map(l => ({description: String(l.description || ''), qty: Number(l.qty) || 0, unitHT: Math.round(Number(l.unitHT) || 0), discountPct: Number(l.discountPct) || 0, vatRate: Number(l.vatRate) || 0}));
      if (b.issueDate) d.issueDate = b.issueDate;
      if (d.type === 'quote') { d.validUntil = b.validUntil || d.validUntil || shift(30, d.issueDate); }
      else if (b.dueDate) { d.dueDate = b.dueDate; d.termsDays = null; }
      else if (b.termsDays != null) { d.termsDays = Number(b.termsDays); d.dueDate = shift(d.termsDays, d.issueDate); }
      else if (!d.dueDate) { d.dueDate = shift(d.termsDays || 0, d.issueDate); }
      ['paymentMethod', 'note', 'exemptionMention'].forEach(k => { if (b[k] !== undefined) d[k] = String(b[k] || ''); });
      d.totals = computeTotals(d.lines); d.updatedTs = Date.now();
    }
    function validateIssue(d) {
      if (!String(d.customer.name || '').trim()) throw apiError('invalid-customer');
      if (iceProblem(d.customer.ice)) throw apiError('invalid-ice');
      if (!d.lines.some(l => l.qty > 0)) throw apiError('invalid-lines');
      if (d.lines.some(l => l.vatRate === 0) && !String(d.exemptionMention || d.note || '').trim()) throw apiError('exempt-mention-required');
    }
    function issue(d) {
      if (d.type === 'quote') {
        if (!d.number) { validateIssue(d); allocate(d); d.issuedTs = Date.now(); }
        if (d.status === 'draft') d.status = 'sent';
        return d;
      }
      if (d.status === 'issued') return d;
      validateIssue(d);
      d.seller = clone(getSeller());
      d.totals = computeTotals(d.lines); allocate(d); d.status = 'issued'; d.issuedTs = Date.now();
      if (d.dueDate === '') d.dueDate = shift(d.termsDays || 0, d.issueDate);
      return d;
    }
    function seedStore() {
      S = {docs: [], payments: [], seq: {F: 0, AV: 0, D: 0}};
      const mk = (type, input, pay) => { const patch = Object.assign({}, input); const skip = patch.issue === false; delete patch.issue; const d = fresh(type, patch); d.totals = computeTotals(d.lines); if (!skip) { try { issue(d); } catch (_) {} } S.docs.push(d); (pay || []).forEach(p => S.payments.push(Object.assign({id: uid(), docId: d.id, method: 'transfer', reference: ''}, p))); return d; };
      const L = (description, qty, price, vatRate) => ({description, qty, unitHT: price * 100, discountPct: 0, vatRate: vatRate == null ? 20 : vatRate});
      mk('invoice', {customer: {name: 'Atelier Nomade', address: 'Avenue Hassan II, Casablanca', ice: '002136093000040', if: '', email: 'finance@atelier-nomade.ma', phone: '', clientId: ''}, issueDate: shift(-18), termsDays: 15, dueDate: shift(-3), lines: [L('Privatisation de salle', 1, 5400), L('Pause café', 24, 65)], paymentMethod: 'transfer'});
      mk('invoice', {customer: {name: 'Maison Jasmin', address: 'Rue des Orangers, Marrakech', ice: '001561191000066', if: '', email: 'contact@maisonjasmin.ma', phone: '', clientId: ''}, issueDate: shift(-8), termsDays: 7, dueDate: shift(-1), lines: [L('Commande entreprise', 1, 3950)], paymentMethod: 'transfer'}, [{amountCents: 474000, date: shift(-2)}]);
      mk('invoice', {customer: {name: 'Riad Zayna', address: 'Médina, Marrakech', ice: '', if: '', email: '', phone: '+212 661 44 08 22', clientId: ''}, issueDate: shift(-2), termsDays: 7, dueDate: shift(5), lines: [L('Service traiteur · 35 couverts', 1, 8750)], paymentMethod: 'transfer', note: 'Merci pour votre confiance.'}, [{amountCents: 300000, date: shift(-1)}]);
      mk('invoice', {customer: {name: 'Studio Terracotta', address: '', ice: '', if: '', email: '', phone: '', clientId: ''}, issueDate: shift(-1), termsDays: 30, dueDate: shift(29), lines: [L('Événement privé', 1, 6250)], issue: false});
      mk('quote', {customer: {name: 'Hôtel Les Dunes', address: 'Merzouga', ice: '', if: '', email: 'achats@lesdunes.ma', phone: '', clientId: ''}, issueDate: shift(-3), validUntil: shift(20), lines: [L('Buffet de séminaire · 40 personnes', 1, 12000), L('Location de matériel', 1, 800)]});
      persist(); return S;
    }
    function load() {
      if (S) return S;
      try { S = JSON.parse(lsGet(key()) || 'null'); } catch (_) { S = null; }
      if (!S || !Array.isArray(S.docs)) seedStore();
      return S;
    }
    async function handle(method, p) {
      load();
      if (method === 'GET') {
        if (p.id) {
          const d = find(p.id), dv = derive(d);
          return {ok: true, doc: clone(Object.assign({}, d, {originalNumber: d.originalId ? (S.docs.find(x => x.id === d.originalId)?.number || '') : ''})), payments: clone(S.payments.filter(x => x.docId === d.id)),
            creditNotes: S.docs.filter(x => x.type === 'credit_note' && x.originalId === d.id && x.status === 'issued').map(x => ({id: x.id, number: x.number, ttcCents: x.totals.ttcCents, issueDate: x.issueDate})),
            displayStatus: dv.displayStatus, balanceCents: dv.balanceCents};
        }
        const rows = S.docs.filter(d => !p.type || d.type === p.type).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || b.createdTs - a.createdTs).slice(0, 500).map(rowOf);
        return {ok: true, docs: rows};
      }
      const a = p.action;
      if (a === 'save') {
        let d;
        if (p.id) { d = find(p.id); if (d.type !== 'quote' && d.status !== 'draft') { if (Object.keys(p).some(k => !['merchant', 'action', 'id', 'type', 'internalNote'].includes(k) && p[k] !== undefined)) throw apiError('locked'); } }
        else { d = fresh(p.type || 'invoice'); S.docs.push(d); }
        if (d.type === 'quote' && d.status === 'invoiced') throw apiError('locked');
        if (p.internalNote !== undefined) d.internalNote = String(p.internalNote || '');
        if (d.status === 'draft' || d.type === 'quote') applyFields(d, p);
        persist(); return {ok: true, doc: clone(d)};
      }
      const d = p.id ? find(p.id) : null;
      if (a === 'issue') { issue(d); persist(); return {ok: true, doc: clone(d)}; }
      if (a === 'mark-sent') { if (d.status === 'draft') throw apiError('not-issued'); d.sentTs = d.sentTs || Date.now(); persist(); return {ok: true, doc: clone(d)}; }
      if (a === 'payment') {
        if (d.type !== 'invoice' || d.status !== 'issued') throw apiError('not-issued');
        const amount = Math.round(Number(p.amountCents) || 0);
        if (amount <= 0) throw apiError('invalid-amount');
        if (amount > derive(d).balanceCents) throw apiError('amount-exceeds-balance');
        S.payments.push({id: uid(), docId: d.id, amountCents: amount, date: p.date || today(), method: p.method || 'cash', reference: String(p.reference || '')});
        persist(); const dv = derive(d); return {ok: true, displayStatus: dv.displayStatus, balanceCents: dv.balanceCents};
      }
      if (a === 'delete-payment') {
        const i = S.payments.findIndex(x => x.id === p.paymentId && x.docId === d.id); if (i < 0) throw apiError('not-found');
        S.payments.splice(i, 1); persist(); const dv = derive(d); return {ok: true, displayStatus: dv.displayStatus, balanceCents: dv.balanceCents};
      }
      if (a === 'credit-note') {
        if (d.type !== 'invoice' || d.status !== 'issued') throw apiError('not-issued');
        const lines = (Array.isArray(p.lines) && p.lines.length ? p.lines : d.lines);
        const cn = fresh('credit_note', {customer: clone(d.customer), originalId: d.id, reason: String(p.reason || ''), lines: clone(lines), paymentMethod: d.paymentMethod, exemptionMention: d.exemptionMention});
        cn.totals = computeTotals(cn.lines);
        if (cn.totals.ttcCents > d.totals.ttcCents - creditedOf(d)) throw apiError('credit-exceeds-invoice');
        S.docs.push(cn); persist(); return {ok: true, doc: clone(cn)};
      }
      if (a === 'quote-status') { if (d.type !== 'quote' || d.status === 'draft' || d.status === 'invoiced') throw apiError('locked'); d.status = p.status === 'rejected' ? 'rejected' : 'accepted'; persist(); return {ok: true, doc: clone(d)}; }
      if (a === 'convert-quote') {
        if (d.type !== 'quote' || d.status === 'draft' || d.status === 'invoiced') throw apiError('locked');
        const inv = fresh('invoice', {customer: clone(d.customer), lines: clone(d.lines), sourceQuoteId: d.id, exemptionMention: d.exemptionMention, note: d.note});
        inv.dueDate = shift(inv.termsDays, inv.issueDate); inv.totals = computeTotals(inv.lines);
        S.docs.push(inv); d.status = 'invoiced'; persist(); return {ok: true, doc: clone(inv)};
      }
      if (a === 'duplicate') {
        const c = fresh(d.type, {customer: clone(d.customer), lines: clone(d.lines), note: d.note, paymentMethod: d.paymentMethod, exemptionMention: d.exemptionMention, termsDays: d.termsDays == null ? 30 : d.termsDays});
        if (d.type === 'quote') c.validUntil = shift(30); else c.dueDate = shift(c.termsDays, c.issueDate);
        c.totals = computeTotals(c.lines); S.docs.push(c); persist(); return {ok: true, doc: clone(c)};
      }
      if (a === 'delete-draft') {
        if (d.status !== 'draft') throw apiError('locked');
        S.docs.splice(S.docs.indexOf(d), 1); persist(); return {ok: true};
      }
      throw apiError('server');
    }
    return {handle};
  })();

const cache = {invoice: [], quote: [], credit_note: []};

const nextCursor = {invoice: null, quote: null, credit_note: null};

const cacheKey = () => 'kiwi:invdocs:cache:v2:' + venueId();

function loadCache() {
    if (!ownData()) return;
    try { const c = JSON.parse(lsGet(cacheKey()) || 'null'); if (c && c.docs) TYPES.forEach(ty => { if (Array.isArray(c.docs[ty])) cache[ty] = c.docs[ty]; }); } catch (_) {}
  }

function saveCache() { if (ownData()) lsSet(cacheKey(), JSON.stringify({ts: Date.now(), docs: cache})); }

return Object.freeze({api, loadCache, saveCache, rows: () => cache, cursors: () => nextCursor});
}
