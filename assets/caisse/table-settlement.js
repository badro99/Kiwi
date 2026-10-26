/* Propriétaire privé du règlement des tables. Montants du journal en centimes.
 * Les objets du plan sont des projections en lecture seule des champs de session.
 * Aucune dépendance DOM, réseau ou stockage : le journal voyage avec la sauvegarde.
 */
function createTableSettlement(tables = {}, tableLines = {}, readBill = null, lineOwner = null) {
  const fields = ['status', 'covers', 'elapsed', 'orderStartedAt', 'timerSession', 'orderNo',
    'server', 'discount', 'reopenRef', 'reopenSessionId', 'reopenedBill', 'settlement'];
  const privateState = new WeakMap();
  const operations = new Set(), payments = new Set();
  const copy = value => value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value));
  const cents = value => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Montant en centimes invalide');
    return value;
  };
  const adopt = ref => {
    const view = typeof ref === 'object' ? ref : tables[ref];
    if (!view) throw new Error('Table inconnue');
    if (!privateState.has(view)) {
      const state = {};
      fields.forEach(key => { if (view[key] !== undefined) state[key] = copy(view[key]); });
      privateState.set(view, state);
      fields.forEach(key => {
        delete view[key];
        Object.defineProperty(view, key, { enumerable: true, configurable: false, get: () => copy(state[key]) });
      });
    }
    return { view, state: privateState.get(view) };
  };
  const account = ref => {
    const { state } = adopt(ref);
    if (!state.settlement) state.settlement = { totalCents: 0, lines: [], entries: [], allocations: [], operations: [], history: [] };
    return state.settlement;
  };
  const snapshot = ref => {
    const { view, state } = adopt(ref), geometry = {};
    Object.keys(view).filter(key => !fields.includes(key)).forEach(key => { geometry[key] = view[key]; });
    return copy({ ...geometry, ...state });
  };
  // Projection d'un état de service reçu du serveur, du plan ou d'une sauvegarde.
  // Elle ne constitue jamais un encaissement et ne réécrit pas le journal existant.
  const project = (ref, patch = {}, removed = []) => {
    const { view, state } = adopt(ref);
    Object.entries(patch).forEach(([key, value]) => {
      if (key === 'settlement' && state.settlement) return;
      if (fields.includes(key)) state[key] = copy(value);
      else view[key] = copy(value);
    });
    removed.forEach(key => { if (fields.includes(key)) delete state[key]; else delete view[key]; });
    return snapshot(ref);
  };
  const bill = (ref, input) => {
    let a = account(ref);
    const total = cents(input.totalCents);
    if (a.closed) { open(ref, { id: 'bill:' + String(ref) + ':' + (adopt(ref).state.timerSession || a.operations.length), totalCents: 0 }); a = account(ref); }
    if (total < a.totalCents - balance(a)) throw new Error('bill-below-payments');
    a.totalCents = total;
    a.lines = copy(input.lines || []);
    (input.payments || []).forEach(payment => addPayment(ref, payment));
    return snapshot(ref);
  };
  const seen = (a, id) => operations.has(String(id)) || a.operations.includes(String(id));
  const remember = (a, id) => { if (!id) throw new Error('Identifiant de tentative requis'); a.operations.push(String(id)); operations.add(String(id)); };
  const balance = a => a.totalCents - a.entries.reduce((sum, e) => sum + (e.kind === 'refund' ? -e.amountCents : e.amountCents), 0);
  const open = (ref, input) => {
    const a = account(ref);
    if (seen(a, input.id)) return snapshot(ref);
    if (!input.id) throw new Error('Identifiant de tentative requis');
    const total = cents(input.totalCents);
    if (balance(a) !== 0) throw new Error('Addition encore ouverte');
    const history = a.history.concat(a.entries.length ? [copy({ ...a, history: [] })] : []);
    project(ref, { status: 'ka-yaklo', timerSession: String(input.session || input.id) });
    adopt(ref).state.settlement = { totalCents: total, lines: copy(input.lines || []), entries: [], allocations: [], operations: a.operations.slice(), history };
    remember(account(ref), input.id);
    return snapshot(ref);
  };
  const addPayment = (ref, input) => {
    const a = account(ref);
    if (payments.has(String(input.id)) || a.entries.some(e => e.id === String(input.id))) return snapshot(ref);
    if (!input.id) throw new Error('Identifiant de paiement requis');
    const amount = cents(input.amountCents);
    if (amount > balance(a)) throw new Error('Paiement supérieur au solde');
    const tip = cents(input.tipCents || 0);
    payments.add(String(input.id));
    a.entries.push({ id: String(input.id), kind: 'payment', amountCents: amount,
      tipCents: tip, method: String(input.method || ''), origin: String(input.origin || ref) });
    return snapshot(ref);
  };
  const allocateSplit = (ref, input) => {
    const a = account(ref);
    if (seen(a, input.id)) return snapshot(ref);
    const parts = input.parts.map(cents);
    if (parts.reduce((s, n) => s + n, 0) !== balance(a)) throw new Error('Répartition différente du solde');
    remember(a, input.id);
    a.allocations = parts;
    return snapshot(ref);
  };
  const settle = ref => {
    const a = account(ref);
    if (balance(a) !== 0) throw new Error('Solde non réglé');
    a.closed = true;
    project(ref, { status: 'khlass' }, ['discount', 'reopenedBill', 'reopenRef', 'reopenSessionId', 'orderNo']);
    return snapshot(ref);
  };
  const reopen = (ref, input) => {
    let a = account(ref);
    if (seen(a, input.id)) return snapshot(ref);
    if (!input.id) throw new Error('Identifiant de tentative requis');
    // Une note peut être reprise sur une autre table, même si sa table d'origine
    // a déjà accueilli une nouvelle visite. Le journal suit la note une fois.
    let found;
    const wanted = new Set([String(input.paymentId), ...(input.payments || []).map(payment => String(payment.id))]);
    const locate = (candidate, detach) => {
      if (!candidate || found) return;
      if (candidate.entries?.some(e => wanted.has(e.id) && e.kind === 'payment')) {
        found = { account: candidate, detach }; return;
      }
      (candidate.history || []).forEach((old, index) => locate(old, () => candidate.history.splice(index, 1)));
    };
    Object.keys(tables).forEach(id => {
      const state = adopt(id).state;
      locate(state.settlement, () => { state.settlement = { totalCents: 0, lines: [], entries: [], allocations: [],
        operations: [], history: state.settlement.history || [] }; });
    });
    if (!found && !input.payment) throw new Error('Paiement à rembourser absent');
    if (found?.account.entries.some(e => e.kind === 'refund' && e.paymentId === String(input.paymentId))) throw new Error('Paiement déjà remboursé');
    if (input.payment) { cents(input.payment.amountCents); cents(input.payment.tipCents || 0); }
    if (input.totalCents != null) {
      const total = cents(input.totalCents);
      if (found && total < found.account.totalCents - balance(found.account)) throw new Error('bill-below-payments');
    }
    if (!found || found.account !== a) {
      if (found) found.detach();
      const history = a.history.concat(a.entries.length ? [copy({ ...a, history: [] })] : []);
      a = found ? { ...copy(found.account), history } : { totalCents: 0, lines: [], entries: [], allocations: [], operations: [], history };
      adopt(ref).state.settlement = a;
    }
    a.closed = false;
    if (input.totalCents != null) bill(ref, input);
    if (input.payment && !a.entries.some(e => e.id === String(input.paymentId))) {
      a.entries.push({ id: String(input.paymentId), kind: 'payment', amountCents: cents(input.payment.amountCents), tipCents: cents(input.payment.tipCents || 0), origin: String(ref) });
      payments.add(String(input.paymentId));
    }
    const payment = a.entries.find(e => e.id === String(input.paymentId) && e.kind === 'payment');
    if (!payment) throw new Error('Paiement à rembourser absent');
    if (a.entries.some(e => e.kind === 'refund' && e.paymentId === payment.id)) throw new Error('Paiement déjà remboursé');
    remember(a, input.id);
    a.entries.push({ id: String(input.id), kind: 'refund', paymentId: payment.id, amountCents: payment.amountCents,
      tipCents: payment.tipCents, origin: payment.origin });
    project(ref, { status: 'bgha-ykhlass', timerSession: input.session });
    return snapshot(ref);
  };
  const move = (from, to, input, merge) => {
    if (String(from) === String(to)) throw new Error('Tables identiques');
    let a = account(from), b = account(to);
    if (seen(a, input.id) || seen(b, input.id)) return snapshot(to);
    if (readBill) {
      const sourceBill = readBill(from), targetBill = merge ? readBill(to) : null;
      if (sourceBill) bill(from, sourceBill);
      if (targetBill) bill(to, targetBill);
      a = account(from); b = account(to);
    }
    if (!merge && balance(b) !== 0) throw new Error('Table cible occupée');
    const source = snapshot(from), target = snapshot(to);
    const sum = cents(a.totalCents + (merge ? b.totalCents : 0));
    const entries = (merge ? b.entries : []).concat(a.entries);
    if (new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('Paiement déjà rattaché');
    remember(a, input.id); remember(b, input.id);
    if (!merge && b.entries.length) b.history.push(copy({ ...b, history: [] }));
    b.totalCents = sum;
    b.entries = copy(entries);
    b.lines = (merge ? b.lines : []).concat(copy(a.lines));
    b.allocations = merge ? [] : a.allocations.slice();
    a.totalCents = 0; a.lines = []; a.entries = []; a.allocations = [];
    project(to, merge ? { covers: (target.covers || 0) + (source.covers || 0) }
      : { status: source.status, covers: source.covers, elapsed: source.elapsed,
        orderStartedAt: source.orderStartedAt, timerSession: source.timerSession,
        server: source.server, orderNo: source.orderNo, discount: source.discount });
    lineOwner.replaceTable(to, merge ? (tableLines[to] || []).concat(tableLines[from] || []) : (tableLines[from] || []));
    lineOwner.removeTable(from);
    project(from, { status: 'khawya', covers: 0, elapsed: 0 },
      ['orderStartedAt', 'timerSession', 'orderNo', 'server', 'discount']);
    return snapshot(to);
  };
  const api = Object.freeze({ project, bill, open, addPayment, allocateSplit, settle, reopen,
    transfer: (from, to, input) => move(from, to, input, false),
    merge: (from, to, input) => move(from, to, input, true), snapshot,
    balance: ref => balance(account(ref)) });
  const hydrate = a => {
    if (!a) return;
    (a.operations || []).forEach(id => operations.add(String(id)));
    (a.entries || []).filter(e => e.kind === 'payment').forEach(e => payments.add(String(e.id)));
    (a.history || []).forEach(hydrate);
  };
  Object.keys(tables).forEach(id => { hydrate(adopt(id).state.settlement); });
  return api;
}

/* Adaptateur du script classique. L'état reste dans la fermeture du propriétaire.
 * Les tests peuvent instancier exactement le même module sans démarrer la caisse. */
function tableSettlement() {
  if (!tableSettlement.owner) tableSettlement.owner = createTableSettlement(tables,
    currentOrder().tables, id => {
      if (typeof generateOrder !== 'function') return null;
      const lines = generateOrder(id, tables[id]);
      const gross = Math.round(lines.reduce((sum, line) => sum + Number(line.total || 0), 0) * 100);
      const split = typeof liveTableSplit === 'function' ? liveTableSplit(id) : null;
      const cut = typeof discountAmountFor === 'function' ? Math.round(discountAmountFor(id, gross / 100) * 100) : 0;
      return { totalCents: split ? Math.round(Number(split.total || 0) * 100) : Math.max(0, gross - cut), lines,
        payments: split ? split.parts.flatMap((part, index) => part.paid ? [{
          id: part.saleId || ('legacy:' + split.id + ':' + index),
          amountCents: Math.round(Number(part.base ?? (part.amount - (part.tip || 0))) * 100),
          tipCents: Math.round(Number(part.tip || 0) * 100), method: part.payMethod,
        }] : []) : [] };
    }, currentOrder());
  return tableSettlement.owner;
}
