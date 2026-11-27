/* Owner: the counter flow and the order comment (Jon's Burgers, 26 Nov 2026).
 * Classic script, loaded with the other caisse declarations before
 * caisse-app.js; it reads the till's shared state (mode, cart, selectedId,
 * tables, vrapEditingNum) only when called.
 *
 *  · The order comment: one free text per order (« allergie arachide, sans
 *    sel »), typed while the order is taken. It prints on the kitchen ticket,
 *    shows on the kitchen screen and travels to the other screens with the
 *    order (the queue keeps it on the first line, `orderNote`). A table keeps
 *    its comment for the whole visit, so every ticket of that table carries it.
 *  · Sur place or à emporter, asked at payment (KiwiCounterFlow.typeAtPay):
 *    the tender gate waits for the answer, the kitchen order made by the
 *    payment carries it, the ticket prints it large and the sale is filed
 *    under the right channel.
 *  · Paying sends (payToKitchen): the counter's « Envoyer en cuisine » is
 *    hidden, « Encaisser » already sends (dispatchUnsentKitchenBeforePayment).
 *  · Kitchen starts at once (direct): read by kdsViewStatus.
 *
 * Mall restaurants (God mode › mallRestaurant, 27 Nov 2026), off by default.
 * A food-court counter: the customer orders, pays, takes a bipeur and sits in
 * the shared food court, so the restaurant has no tables of its own. On:
 *  · no Salle and no « Annuler une vente » (merchant-config.js featureOff):
 *    a paid order is never cancelled, only refunded (manager code, returns.js);
 *  · the three switches above are on whatever Paramètres says (counterFlow);
 *  · each sur place / à emporter order takes the lowest free bipeur of 1..N
 *    (Paramètres › Commande au comptoir), printed large on the receipt and the
 *    kitchen ticket, shown on the board and the kitchen screen, free again at
 *    « Remettre au client »;
 *  · the kitchen ticket prints after the customer's receipt (mallKitchenHolds);
 *  · the board keeps every paid order until it is handed over (vrapIsCounterSale).
 * Off, none of this runs and the till is the one it was.
 */
function mallOn() {
  try { const f = window.KiwiConfig && window.KiwiConfig.features; return !!f && f.mallRestaurant === true; } catch (_) { return false; }
}
function counterFlow() {
  /* Through KiwiDiscountPolicy.counterFlow (discount-policy.js, the same reader as
     KiwiCounterFlow.get): the till already reads that global, so no new link. */
  let f = {};
  try { const P = window.KiwiDiscountPolicy; f = (P && P.counterFlow && P.counterFlow()) || {}; } catch (_) { f = {}; }
  return mallOn() ? Object.assign({}, f, { direct: true, payToKitchen: true, typeAtPay: true }) : f;
}
/* ── Bipeurs (mall) ── The pool is 1..N; a bipeur is busy while an order of
   the last twelve hours carries it and has not been handed over. */
const MALL = { tenderAt: 0, held: [] };
function mallPagerCount() {
  let n = 10;
  try { const F = window.KiwiCounterFlow, v = F && F.get && F.get().pagers; if (Number.isInteger(v)) n = v; } catch (_) {}
  return Math.max(1, Math.min(20, n));
}
function mallPagersBusy() {
  const busy = new Set(), since = Date.now() - 12 * 3600000;
  (typeof kdsOrders !== 'undefined' && Array.isArray(kdsOrders) ? kdsOrders : []).forEach((o) => {
    const at = o && (o.sentAt instanceof Date ? o.sentAt.getTime() : new Date(o && o.sentAt).getTime());
    if (o && o.pager && !o.pickedUp && !(at < since)) busy.add(+o.pager);
  });
  return busy;
}
function mallTakePager() {
  const busy = mallPagersBusy();
  for (let n = 1; n <= mallPagerCount(); n++) if (!busy.has(n)) return n;
  return 0;
}
function mallPagerLabel(n) { return counterTr('Bipeur') + ' ' + n; }
/* The board card: the bipeur, large, and where the order is eaten. */
function mallCardTag(o) {
  if (!mallOn() || !o || o.delivery) return '';
  const pill = 'display:inline-flex;align-items:center;margin-inline-start:8px;padding:2px 10px;border-radius:999px;font-weight:700;';
  return (o.pager ? '<span class="vrap-pager" style="' + pill + 'font-size:1.15em;background:#053B2C;color:#7DF2B0">' + mallPagerLabel(+o.pager) + '</span>' : '')
    + (o.service ? '<span class="vrap-service" style="' + pill + 'font-size:.85em;background:rgba(11,110,79,.12);color:#053B2C">' + counterTr(o.service === 'surplace' ? 'Sur place' : 'À emporter') + '</span>' : '');
}
/* The kitchen ticket waits for the customer's receipt: it is released just
   after the sale is paid (the receipt prints in the same breath), or after a
   few seconds if no receipt comes (a split share, an error), never lost. */
/* true: held, it prints later · false: the caller prints it now. */
function mallKitchenHolds(order, items) {
  if (!mallOn() || !(Date.now() - MALL.tenderAt < 60000)) return false;
  const job = { done: false };
  job.go = () => {
    if (job.done) return;
    job.done = true;
    const i = MALL.held.indexOf(job);
    if (i >= 0) MALL.held.splice(i, 1);
    try { printKitchenTickets(order, items); } catch (_) {}
  };
  MALL.held.push(job);
  setTimeout(job.go, 8000);
  return true;
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('kiwi:sale-paid', () => {
    MALL.tenderAt = 0;
    const jobs = MALL.held.slice();
    if (jobs.length) setTimeout(() => jobs.forEach((j) => j.go()), 300);
  });
}
/* The two small sheets of this file, styled once (no stylesheet to grow). */
function counterStyle() {
  if (document.getElementById('cf-style')) return;
  const st = document.createElement('style');
  st.id = 'cf-style';
  st.textContent = '.cf-veil{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(10,15,13,.45)}'
    + '.cf-sheet{width:min(440px,100%);box-sizing:border-box;background:#F7F5F0;color:#0A0F0D;border-radius:20px;padding:20px;display:grid;gap:12px;box-shadow:0 24px 60px -24px rgba(5,59,44,.55)}'
    + '.cf-title{margin:0;font-size:20px;font-weight:600}.cf-sub{margin:0;font-size:14px;color:#4b524f;line-height:1.45}'
    + '.cf-text{width:100%;box-sizing:border-box;border:1px solid #cfd3d0;border-radius:12px;padding:10px 12px;font:inherit;font-size:16px;resize:vertical;background:#fff}'
    + '.cf-acts{display:flex;gap:8px;justify-content:flex-end}.cf-btn{min-height:48px;padding:0 18px;border-radius:12px;border:1px solid #cfd3d0;background:transparent;color:#0A0F0D;font:inherit;font-size:16px;font-weight:600;cursor:pointer}'
    + '.cf-btn.primary{background:#0B6E4F;border-color:#0B6E4F;color:#F7F5F0}'
    + '.cf-picks{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cf-pick{min-height:120px;border-radius:16px;border:1px solid #cfd3d0;background:#fff;color:#053B2C;font:inherit;font-size:18px;font-weight:600;display:grid;place-items:center;gap:6px;padding:14px;cursor:pointer}'
    + '.cf-pick svg{width:40px;height:40px}.cf-pick:focus-visible,.cf-btn:focus-visible{outline:3px solid #0B6E4F;outline-offset:2px}';
  document.head.appendChild(st);
}
function counterTr(s) { const L = window.KiwiCaisseLang; return L && L.tr ? L.tr(s) : s; }
function counterState() {
  if (!window.__kiwiCounterOrder) {
    let tablesSaved = {};
    try { tablesSaved = JSON.parse(localStorage.getItem('kiwiCounterComments') || '{}') || {}; } catch (_) {}
    window.__kiwiCounterOrder = { comment: '', type: '', tables: tablesSaved };
  }
  return window.__kiwiCounterOrder;
}
function counterSaveTables() {
  try { localStorage.setItem('kiwiCounterComments', JSON.stringify(counterState().tables)); } catch (_) {}
}
/* A table's comment belongs to one visit: the next party at that table never
   inherits it. The visit is the table's session (or its opening time). */
function counterTableVisit(id) {
  const t = id && tables[id];
  return t ? String(t.timerSession || t.orderStartedAt || '') : '';
}
function counterCommentGet() {
  const S = counterState();
  if (mode === 'vrap') {
    /* A new counter order starts blank: nothing on the bill, nothing kept. */
    if (!cart.length && vrapEditingNum == null) { S.comment = ''; S.type = ''; S.pager = 0; }
    if (vrapEditingNum != null) {
      const o = kdsOrders.find((x) => x && x.num === vrapEditingNum);
      if (o && o.comment && !S.comment) S.comment = o.comment;
    }
    return S.comment || '';
  }
  if (!selectedId) return '';
  const c = S.tables[selectedId];
  if (!c) return '';
  if (c.visit !== counterTableVisit(selectedId) || !tables[selectedId] || tables[selectedId].status === 'libre') {
    delete S.tables[selectedId]; counterSaveTables(); return '';
  }
  return c.text || '';
}
function counterCommentSet(text) {
  const S = counterState();
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (mode === 'vrap') { S.comment = clean; return; }
  if (!selectedId) return;
  if (clean) S.tables[selectedId] = { text: clean, visit: counterTableVisit(selectedId) };
  else delete S.tables[selectedId];
  counterSaveTables();
}
/* The bill's comment row (classic panel and the 2027 bill). */
function counterCommentView() {
  return { label: counterTr('Commentaire pour la cuisine'), text: counterCommentGet(),
    add: counterTr('Ajouter un commentaire'), edit: counterTr('Modifier le commentaire') };
}
function counterCommentEdit() {
  const old = counterCommentGet();
  const veil = document.createElement('div');
  counterStyle();
  veil.className = 'cf-veil';
  veil.setAttribute('role', 'dialog');
  veil.setAttribute('aria-modal', 'true');
  veil.innerHTML = '<div class="cf-sheet"><h3 class="cf-title"></h3><p class="cf-sub"></p>'
    + '<textarea class="cf-text" rows="3" maxlength="200"></textarea>'
    + '<div class="cf-acts"><button type="button" class="cf-btn" data-cf="cancel"></button><button type="button" class="cf-btn primary" data-cf="ok"></button></div></div>';
  veil.querySelector('.cf-title').textContent = counterTr('Commentaire pour la cuisine');
  veil.querySelector('.cf-sub').textContent = counterTr('Allergies, demandes spéciales. Imprimé sur le bon et affiché sur l\'écran cuisine.');
  const area = veil.querySelector('.cf-text');
  area.value = old;
  area.setAttribute('aria-label', counterTr('Commentaire pour la cuisine'));
  veil.querySelector('[data-cf="cancel"]').textContent = counterTr('Annuler');
  veil.querySelector('[data-cf="ok"]').textContent = counterTr('Enregistrer');
  const close = () => { veil.remove(); };
  veil.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cf]');
    if (e.target === veil || (b && b.dataset.cf === 'cancel')) { close(); return; }
    if (!b || b.dataset.cf !== 'ok') return;
    counterCommentSet(area.value);
    close();
    counterRepaint();
  });
  document.body.appendChild(veil);
  area.focus();
}
function counterRepaint() {
  try { if (mode === 'vrap') renderCart(); else if (mode === 'order' && selectedId) renderOrderPanel(selectedId); else if (selectedId) renderRightPanel(selectedId); } catch (_) {}
  try { if (typeof tillKitPaint === 'function') tillKitPaint(); } catch (_) {}
}
/* The classic panel's row under the bill lines. */
/* Built here rather than in kiwi-caisse.html (the shell's size is frozen):
   under the bill lines of the classic panel. */
function counterCommentHost() {
  let host = document.getElementById('rp-comment');
  const items = document.getElementById('rp-items');
  if (host || !items) return host;
  host = document.createElement('div');
  host.id = 'rp-comment'; host.className = 'rp-comment'; host.hidden = true;
  host.style.cssText = 'display:grid;gap:4px;justify-items:start;padding:8px 16px 4px';
  host.innerHTML = '<span data-cf-label style="font-size:12px;color:var(--n-500,#6b716e)"></span>'
    + '<span data-cf-text hidden style="font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere"></span>'
    + '<button type="button" data-cf-edit style="min-height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--n-200,#d8dcd9);background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer"></button>';
  items.insertAdjacentElement('afterend', host);
  return host;
}
function counterCommentPaint() {
  const host = counterCommentHost();
  if (!host) return;
  const lines = mode === 'vrap' ? cart : (mode === 'order' && selectedId ? (tableOrders[selectedId] || []) : []);
  const show = !!(lines && lines.length) || (mode === 'salle' && !!selectedId);
  host.hidden = !show; host.style.display = show ? "grid" : "none";
  if (!show) return;
  const v = counterCommentView();
  host.querySelector('[data-cf-label]').textContent = v.label;
  const txt = host.querySelector('[data-cf-text]');
  txt.textContent = v.text;
  txt.hidden = !v.text;
  host.querySelector('[data-cf-edit]').textContent = v.text ? v.edit : v.add;
}

/* A kitchen order is born (counter or table): it takes the comment and, at
   the counter, the sur place / à emporter answer given at payment. */
function counterStampOrder(order) {
  if (!order) return order;
  const S = counterState();
  if (order.type === 'takeaway' && !order.delivery) {
    if (S.comment) order.comment = S.comment;
    if (S.type) { order.service = S.type; S.type = ''; }
    if (S.pager) { order.pager = S.pager; S.pager = 0; }
  } else if (order.type === 'dineIn' && order.table) {
    const c = S.tables[order.table];
    if (c && c.text && c.visit === counterTableVisit(order.table)) order.comment = c.text;
  }
  if (order.comment && Array.isArray(order.relayLines) && order.relayLines[0]) order.relayLines[0].orderNote = order.comment;
  if (order.service && Array.isArray(order.relayLines) && order.relayLines[0]) order.relayLines[0].service = order.service;
  if (order.pager && Array.isArray(order.relayLines) && order.relayLines[0]) order.relayLines[0].pager = order.pager;
  return order;
}
/* The ticket's head: SUR PLACE / À EMPORTER, and the comment. */
function counterTicketFields(order) {
  const out = {};
  if (order && order.service) out.service = order.service === 'surplace' ? 'SUR PLACE' : 'À EMPORTER';
  if (order && order.comment) out.comment = String(order.comment);
  if (order && order.pager) out.table = 'BIPEUR ' + order.pager;   /* à la place de la table, en grand */
  return out;
}
/* The other screens learn the comment and the answer from the queue. */
function counterFromQueue(target, lines) {
  const first = Array.isArray(lines) ? lines.find((l) => l && (l.orderNote || l.service || l.pager)) : null;
  if (!first || !target) return;
  if (Number.isInteger(+first.pager) && +first.pager >= 1 && +first.pager <= 20 && !target.pager) target.pager = +first.pager;
  if (first.orderNote && !target.comment) target.comment = String(first.orderNote).slice(0, 200);
  if ((first.service === 'surplace' || first.service === 'emporter') && !target.service) target.service = first.service;
}
/* The sale is filed where it was eaten. */
function counterSaleTag(entry, order) {
  if (entry && order && order.pager && !order.delivery) entry.pager = +order.pager;   /* le reçu l'imprime en grand */
  if (!entry || !order || order.service !== 'surplace' || order.delivery) return;
  entry.channel = 'surplace';
  if (/^à emporter\b/i.test(String(entry.label || ''))) entry.label = String(entry.label).replace(/^à emporter/i, 'Sur place');
}
/* At the counter, paying sends: no separate « Envoyer en cuisine ». A held
   phone order (not yet in the kitchen) keeps its button. */
function counterHidesSend(editing, editingOrder) {
  return mode === 'vrap' && counterFlow().payToKitchen === true && !(editing && editingOrder && editingOrder.status === 'held');
}

/* The question at payment. Answers once per order (a split asks at its first share). */
function counterAskType() {
  return new Promise((resolve) => {
    const veil = document.createElement('div');
    counterStyle();
    veil.className = 'cf-veil';
    veil.setAttribute('role', 'dialog');
    veil.setAttribute('aria-modal', 'true');
    veil.setAttribute('data-cf-type', '');
    const paths = { surplace: 'M280-80v-366q-51-14-85.5-56T160-600v-280h80v280h40v-280h80v280h40v-280h80v280q0 56-34.5 98T360-446v366h-80Zm400 0v-320H560v-280q0-83 58.5-141.5T760-880v800h-80Z', emporter: 'M240-80q-33 0-56.5-23.5T160-160v-480q0-33 23.5-56.5T240-720h80q0-66 47-113t113-47q66 0 113 47t47 113h80q33 0 56.5 23.5T800-640v480q0 33-23.5 56.5T720-80H240Zm0-80h480v-480h-80v80q0 17-11.5 28.5T600-520q-17 0-28.5-11.5T560-560v-80H400v80q0 17-11.5 28.5T360-520q-17 0-28.5-11.5T320-560v-80h-80v480Zm160-560h160q0-33-23.5-56.5T480-800q-33 0-56.5 23.5T400-720ZM240-160v-480 480Z' };
    const pick = (key) => '<button type="button" class="cf-pick" data-cf-pick="' + key + '"><svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="' + paths[key] + '"/></svg><span></span></button>';
    veil.innerHTML = '<div class="cf-sheet"><h3 class="cf-title"></h3><div class="cf-picks">'
      + ['surplace', 'emporter'].map(pick).join('')
      + '</div><button type="button" class="cf-btn" data-cf="cancel"></button></div>';
    veil.querySelector('.cf-title').textContent = counterTr('Sur place ou à emporter ?');
    veil.querySelector('[data-cf-pick="surplace"] span').textContent = counterTr('Sur place');
    veil.querySelector('[data-cf-pick="emporter"] span').textContent = counterTr('À emporter');
    veil.querySelector('[data-cf="cancel"]').textContent = counterTr('Retour');
    const done = (v) => { veil.remove(); resolve(v); };
    veil.addEventListener('click', (e) => {
      const p = e.target.closest('[data-cf-pick]');
      if (p) { done(p.dataset.cfPick); return; }
      if (e.target === veil || e.target.closest('[data-cf="cancel"]')) done('');
    });
    document.body.appendChild(veil);
    const first = veil.querySelector('[data-cf-pick]');
    if (first) first.focus();
  });
}
async function counterTenderGate(method) {
  if (mode !== 'vrap' || method === 'platform' || counterFlow().typeAtPay !== true) return true;
  if (typeof dlvCur === 'function' && dlvCur()) return true;   /* une livraison n'est ni sur place ni à emporter */
  const S = counterState();
  if (vrapEditingNum != null) {
    const o = kdsOrders.find((x) => x && x.num === vrapEditingNum);
    if (o && (o.service || (o.status !== 'held' && o.sentAt && o.kitchenDispatchedAt))) return true;   /* déjà en cuisine : on ne redemande pas */
  }
  if (!S.type) {
    const answer = await counterAskType();
    if (!answer) return false;
    S.type = answer;
  }
  if (mallOn()) {
    MALL.tenderAt = Date.now();
    if (!S.pager) S.pager = mallTakePager();
    if (!S.pager) toast(counterTr('Aucun bipeur libre · commande sans bipeur'), 5200, 'warn');
  }
  return true;
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('kiwi:tender-gate', (e) => {
    const d = e && e.detail;
    if (d && typeof d.hold === 'function') d.hold(counterTenderGate(d.method));
  });
}
/* The classic panel: its row follows the bill (any repaint of the lines), and
   its button opens the editor. */
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#rp-comment [data-cf-edit]')) counterCommentEdit();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const items = document.getElementById('rp-items');
    try { counterCommentPaint(); } catch (_) {}
    if (items && typeof MutationObserver === 'function') new MutationObserver(() => { try { counterCommentPaint(); } catch (_) {} }).observe(items, { childList: true });
  });
}
