/* Caisses Boutique et Maison · validité des bons et avances expirées
 * (21 nov. 2026).
 *
 * 1. La validité. Le propriétaire règle au tableau de bord (Reçu · Validité
 *    des bons) combien de jours vaut un avoir et combien de jours la boutique
 *    garde la pièce d'une avance. Vide = sans limite. La caisse lit ce réglage
 *    dans la fiche reçu (KiwiReceipt.config().validity), déjà chargée pour
 *    imprimer : rien de plus à synchroniser.
 *
 * 2. L'avance expirée. Une cliente a versé 200 MAD sur une pièce à 500 pour
 *    qu'on la lui garde, et n'est pas revenue avant la date imprimée sur son
 *    ticket. Depuis l'inventaire, « Avances expirées » liste ces notes ; pour
 *    en clore une, chaque pièce gardée doit être SCANNÉE (douchette ou caméra,
 *    jamais tapée : les propriétaires ne veulent pas d'un « on l'a » sans la
 *    pièce en main). Alors seulement le serveur ferme la note et transforme
 *    l'argent versé en avoir au nom de la cliente (POST /api/retail-balances
 *    action expire-avance), et la caisse remet les pièces en stock.
 *
 * `d` apporte ce que la caisse possède : registre des notes, fiche cliente,
 * scan, remise en stock, ouverture du bon d'avoir. */
const DAY = 86400000;
export const NO_EXPIRY_YEAR = 2900;
const lang = () => globalThis.window?.KiwiCaisseLang || { tr: (text) => text };
const tr = (text) => lang().tr(text);

/* God mode (kiwi-admin.html · Options à la demande) : quelle façon de laisser
   partir une pièce sans tout encaisser ce magasin pratique.
     · avance  (retailAvance) : la cliente verse une partie, on lui garde la
       pièce jusqu'à une date. Allumée par défaut, comme depuis toujours.
     · crédit  (retailCredit) : tout le ticket sur son compte client. Explicite
       en boutique ; la Maison l'avait déjà, elle le garde sauf coupure. */
export function retailModes(trade) {
  const f = (globalThis.window?.KiwiConfig?.features) || {};
  return {
    avance: f.retailAvance !== false,
    credit: f.retailCredit === true || (trade === 'maison' && f.retailCredit !== false),
    /* God mode › Caisse · Moyens de paiement. Espèces et carte ne se coupent
       pas. Clé absente = allumé (les magasins d'avant gardent tout) ; un
       nouveau magasin naît avec les trois coupés (functions/api/config.js ›
       NEW_STORE_FEATURES). */
    virement: f.payVirement !== false,
    cheque: f.payCheque !== false,
    livraison: f.payLivraison !== false,
  };
}

/* Retire de la liste des modes ceux que God mode a coupés. */
export function dropOffMethods(el, trade, cls) {
  const m = retailModes(trade);
  ['virement', 'cheque', 'livraison'].forEach((k) => { if (!m[k]) el.querySelectorAll(`[data-${cls}-m="${k}"]`).forEach((b) => b.remove()); });
}

function receiptConfig() {
  try { return (globalThis.window?.KiwiReceipt?.config?.()) || {}; } catch (_) { return {}; }
}
/* { avoirDays, avanceDays } : un entier de jours, ou null (sans limite). */
export function validity() {
  const v = receiptConfig().validity || {};
  const days = (n) => (Number.isInteger(n) && n >= 1 ? n : null);
  return { avoirDays: days(v.avoirDays), avanceDays: days(v.avanceDays) };
}
/* Ce que la caisse envoie au registre des avoirs. */
export function avoirExpiryBody(now = Date.now()) {
  const days = validity().avoirDays;
  return days ? { expiresAt: now + days * DAY } : { noExpiry: true };
}
/* Le même, pour un bon de démonstration resté local. */
export function localAvoirUntil(now = Date.now()) {
  const days = validity().avoirDays;
  return days ? new Date(now + days * DAY) : new Date(Date.UTC(2999, 11, 31));
}
/* La fin d'une avance : la fin de la journée J + N. 0 = sans limite. */
export function avanceExpiresAt(now = Date.now()) {
  const days = validity().avanceDays;
  if (!days) return 0;
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 23, 59, 59, 999).getTime();
}
export function isNoExpiry(until) {
  const t = new Date(until);
  return !Number.isNaN(t.getTime()) && t.getFullYear() >= NO_EXPIRY_YEAR;
}
const pad2 = (n) => String(n).padStart(2, '0');
export const dayText = (ts) => { const d = new Date(Number(ts) || 0); return Number(ts) > 0 ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : ''; };

/* Les pièces d'une avance, telles que la caisse les scannera plus tard. */
export function heldLines(lines, barcodeOf) {
  return (lines || []).filter((ln) => ln && (Number(ln.qty) || 0) > 0).slice(0, 40).map((ln) => ({
    pid: String(ln.pid || ''), size: String(ln.size || ''), color: String(ln.color || ''),
    qty: Math.max(1, Math.round(Number(ln.qty) || 1)), name: String(ln.name || 'Article').slice(0, 120),
    barcode: String((barcodeOf && barcodeOf(ln)) || ln.barcode || '').slice(0, 64),
    ...(ln.isPiece || ln.piece === true ? { piece: true } : {}),
  }));
}
/* Une note ouverte, en une ligne lisible pour la fiche cliente : avance ou
   compte, jusqu'à quand la pièce est gardée, et quelles pièces. */
export function noteDetail(row, now = Date.now()) {
  const out = [];
  if (row.kind === 'avance') out.push(tr('Avance'));
  else if (row.kind === 'credit') out.push(tr('Compte client'));
  if (row.kind === 'avance' && Number(row.expiresAt) > 0) {
    out.push((Number(row.expiresAt) <= now ? tr('expirée le') : tr('pièce gardée jusqu’au')) + ' ' + dayText(row.expiresAt));
  }
  const names = (row.lines || []).map((l) => `${Number(l.qty) > 1 ? l.qty + '× ' : ''}${l.name || tr('Article')}${l.size ? ' ' + l.size : ''}`).join(', ');
  if (names) out.push(names);
  return out.join(' · ');
}
/* La section « Avances et compte » d'une fiche cliente (caisse boutique). */
export function clientNotesHtml(rows, R, customerId, k) {
  const mine = (rows || []).filter((row) => row && String(row.customerId) === String(customerId) && R.due(row) > 0)
    .sort((a, b) => (Number(a.createdTs) || 0) - (Number(b.createdTs) || 0));
  if (!mine.length) return '';
  const due = mine.reduce((sum, row) => sum + R.due(row), 0);
  return `<div class="${k.cls}-f-lbl" style="margin:4px 0 6px;">${k.esc(tr('Avances et compte'))} · ${k.esc(tr('reste'))} ${k.fmtMAD(due / 100)}</div>
    <div class="${k.cls}-fhist">${mine.map((row) => `<div class="${k.cls}-fhist-row"><span class="when">${k.esc(dayText(row.createdTs))}</span><span class="what">${k.esc(tr('Ticket'))} ${k.esc(row.ticketRef)}<small style="display:block;">${k.esc(noteDetail(row))} · ${k.esc(tr('payé'))} ${k.fmtMAD(((Number(row.paidCents) || 0) + (Number(row.pendingCents) || 0)) / 100)}</small></span><span class="amt">${k.fmtMAD(R.due(row) / 100)}</span></div>`).join('')}</div>`;
}

/* Peint la section « Avances et compte » dans une fiche cliente : le journal
   local de la caisse d'abord, puis le serveur (comme l'écran Acomptes). */
export function paintClientNotes(slot, key, customerId, k) {
  const R = globalThis.window?.KiwiRetailBalances;
  if (!R || !slot || !key) return;
  const paint = (rows) => { if (slot.isConnected) slot.innerHTML = clientNotesHtml(rows, R, customerId, k); };
  paint(R.read(key));
  R.list(key).then(paint, () => {});
}

/* Une cliente de passage qui rend une pièce : avant d'émettre l'avoir, la
   caisse propose de lui ouvrir une fiche (ou d'en retrouver une), pour que
   l'avoir vive à son nom et ne dépende plus d'un bout de papier. « Sans
   fiche » garde le bon au porteur (null). Fermer la fenêtre n'émet rien
   (undefined). `openClientModal` est le carnet de la caisse qui demande. */
export function askAvoirHolder(openClientModal, amount) {
  return new Promise((resolve) => {
    openClientModal({ amount, onPick: (c) => resolve(c || null), onCancel: () => resolve(undefined) });
  });
}

/* Ce que le ticket d'une avance imprime : jusqu'à quand la pièce est gardée. */
export const heldUntilText = (until) => Number(until) > 0 && !isNoExpiry(until) ? dayText(until) : '';

/* « Compte client » (God mode « Crédit client ») : l'option du choix de
   règlement, puis l'écran de confirmation. Rien n'est encaissé : le ticket
   entier devient une note ouverte au nom de la cliente, réglée plus tard
   depuis Acomptes. Un écran à part : c'est une dette, pas un paiement. */
export function accountOptionHtml(show, customerId, amountText, cls) {
  if (!show) return '';
  return `<button class="${cls}-pay-opt" data-${cls}-m="compte">
    <span class="ic"><img src="assets/icons/material/account_balance_wallet.svg" alt=""></span>
    <span class="l"><b>${tr('Compte client')}</b><span>${customerId ? tr('Tout le ticket à régler plus tard, suivi dans Acomptes') : tr('Choisir d’abord la cliente sur le ticket')}</span></span>
    <span class="amt">${amountText}</span>
  </button>`;
}
export function accountStep(el, s) {
  if (!s.customerId) { s.toast(tr('Compte client'), tr('Choisissez d’abord la cliente sur le ticket.')); return; }
  if (s.busy) { s.toast(tr('Compte client'), tr('Le ticket entier passe sur le compte, sans autre règlement.')); return; }
  const c = s.cls;
  el.innerHTML = `
    <button class="${c}-modal-x" data-${c}-close aria-label="${tr('Fermer')}"><i data-lucide="x"></i></button>
    <h3 class="modal-title">${tr('Mettre sur le compte client')}</h3>
    <p class="modal-subtle">${s.who ? s.esc(s.who.name) : tr('Cliente')} · ${s.esc(s.ref || '')}</p>
    <div class="modal-amount size-md">${s.amountText}</div>
    <p class="modal-subtle">${tr('Aucun encaissement aujourd’hui. La note reste ouverte dans Acomptes jusqu’au règlement, qui comptera le jour où l’argent est reçu.')}</p>
    <div class="${c}-sheet-foot">
      <button class="${c}-btn secondary" data-acct-back>${tr('Retour')}</button>
      <button class="${c}-btn primary" data-acct-ok>${tr('Confirmer')} · ${s.amountText} ${tr('à régler')}</button>
    </div>`;
  s.after();
  el.querySelector('[data-acct-back]').onclick = s.back;
  el.querySelector('[data-acct-ok]').onclick = s.ok;
}

/* « Avance » dans la liste des modes : la cliente verse une partie, la pièce
   est gardée à son nom. Avant, l'avance n'apparaissait qu'après un premier
   règlement partiel, et personne ne la trouvait. */
export function avanceOptionHtml(show, customerId, cls) {
  if (!show) return '';
  return `<button class="${cls}-pay-opt" data-${cls}-m="avance">
    <span class="ic"><img src="assets/icons/material/pending_actions.svg" alt=""></span>
    <span class="l"><b>${tr('Avance')}</b><span>${customerId ? tr('La cliente verse une partie, la pièce est gardée à son nom') : tr('Choisir d’abord la cliente sur le ticket')}</span></span>
  </button>`;
}
/* s : { cls, trade, customerId, busy, who, due (nombre), fmt, esc, toast, after, back, pay(mode, montant) } */
export function avanceStep(el, s) {
  if (!s.customerId) { s.toast(tr('Avance : choisissez d’abord la cliente sur le ticket.')); return; }
  if (s.busy) { s.toast(tr('Avance : un seul règlement, avant tout autre.')); return; }
  const c = s.cls, m = retailModes(s.trade), until = heldUntilText(avanceExpiresAt());
  const methods = [['especes', 'Espèces'], ['carte', 'Carte'], m.virement && ['virement', 'Virement / Versement'], m.cheque && ['cheque', 'Chèque']].filter(Boolean);
  el.innerHTML = `
    <button class="${c}-modal-x" data-${c}-close aria-label="${tr('Fermer')}"><i data-lucide="x"></i></button>
    <h3 class="modal-title">${tr('Avance')}</h3>
    <p class="modal-subtle">${s.who ? s.esc(s.who.name) : tr('Cliente')} · ${tr('Total')} ${s.fmt(s.due)}</p>
    <label class="modal-subtle" for="${c}-avance-in" style="display:block;margin-top:14px;">${tr('Montant versé aujourd’hui')}</label>
    <input class="${c}-in mono" id="${c}-avance-in" type="number" inputmode="decimal" min="1" step="1" placeholder="MAD" autocomplete="off" style="width:100%;box-sizing:border-box;font-size:22px;margin:6px 0;" />
    <p class="modal-subtle" data-avance-note>${until ? `${tr('Pièce gardée jusqu’au')} ${until}` : tr('Pièce gardée sans date limite')}</p>
    <div class="${c}-pay-opts" style="margin-top:12px;">${methods.map(([k, l]) => `
      <button class="${c}-pay-opt" data-avance-m="${k}"><span class="l"><b>${tr(l)}</b></span><span class="amt" data-avance-amt></span></button>`).join('')}
    </div>
    <div class="${c}-sheet-foot"><button class="${c}-btn secondary" data-avance-back style="flex:1;">${tr('Retour')}</button></div>`;
  s.after();
  const inp = el.querySelector(`#${c}-avance-in`), note = el.querySelector('[data-avance-note]');
  const amount = () => Math.round((Number(String(inp.value).replace(',', '.')) || 0) * 100) / 100;
  inp.oninput = () => {
    const a = amount(), ok = a > 0 && a < s.due;
    el.querySelectorAll('[data-avance-amt]').forEach((x) => { x.textContent = ok ? s.fmt(a) : ''; });
    note.textContent = (ok ? `${tr('Reste à régler')} ${s.fmt(Math.round((s.due - a) * 100) / 100)} · ` : '')
      + (until ? `${tr('Pièce gardée jusqu’au')} ${until}` : tr('Pièce gardée sans date limite'));
  };
  el.querySelector('[data-avance-back]').onclick = s.back;
  el.querySelectorAll('[data-avance-m]').forEach((b) => {
    b.onclick = () => {
      const a = amount();
      if (!(a > 0) || a >= s.due) { s.toast(tr('Avance : saisir un montant plus petit que le total.')); inp.focus(); return; }
      s.pay(b.dataset.avanceM, a);
    };
  });
  setTimeout(() => { try { inp.focus(); } catch (_) {} }, 60);
}

export function expiredAvances(rows, R, now = Date.now()) {
  return (rows || []).filter((row) => row && row.kind === 'avance' && Number(row.expiresAt) > 0
    && Number(row.expiresAt) <= now && R.due(row) > 0);
}

/* Les fermetures parties au serveur mais pas encore remises en stock : une
   réponse perdue ne doit jamais laisser des pièces scannées hors du stock. */
const pendingKey = (merchant) => 'kiwi:avanceRestock:' + String(merchant || '').slice(0, 64);
function readPending(merchant) {
  try { const rows = JSON.parse(localStorage.getItem(pendingKey(merchant)) || '[]'); return Array.isArray(rows) ? rows : []; }
  catch (_) { return []; }
}
function writePending(merchant, rows) {
  try { localStorage.setItem(pendingKey(merchant), JSON.stringify(rows.slice(0, 50))); return true; } catch (_) { return false; }
}

async function expireRequest(merchant, row, scanned) {
  const response = await fetch('/api/retail-balances?merchant=' + encodeURIComponent(merchant), {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'expire-avance', merchant, id: row.id, scanned, ...avoirExpiryBody() }),
  });
  let data = null;
  try { data = await response.json(); } catch (_) {}
  if (!response.ok || !data || data.error) {
    const error = new Error((data && data.error) || `http-${response.status}`);
    error.code = (data && data.error) || `http-${response.status}`;
    throw error;
  }
  return data;
}
const ERRORS = {
  'avance-payment-pending': 'Un versement de cette avance attend encore le serveur. Réessayez dans un instant.',
  'avance-not-expired': 'Cette avance n’est pas encore expirée.',
  'not-an-avance': 'Cette note est un compte client, pas une avance.',
  'retail-balance-conflict': 'Une autre caisse vient de clore cette avance.',
  'forbidden-merchant': 'Cette caisse n’est plus reconnue par le magasin.',
};
/* Un refus définitif du serveur : la fermeture ne sera jamais rejouée. Une
   panne réseau ou un 5xx, elle, reste en attente et se termine seule. */
const definitive = (code) => /^(avance-not-expired|not-an-avance|retail-balance-(missing|conflict)|bad-|forbidden|invalid|store-suspended|subscription)/.test(String(code || ''));

let styled = false;
function injectCss() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const css = document.createElement('style');
  css.textContent = `
.kav-veil{position:fixed;inset:0;z-index:2147483000;background:rgba(10,15,13,.42);display:flex;align-items:center;justify-content:center;padding:16px}
.kav-sheet{background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);border-radius:18px;width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:20px;box-shadow:0 18px 48px rgba(0,0,0,.22);font:inherit}
.kav-sheet h3{margin:0 0 4px;font-size:19px;font-weight:600}
.kav-sub{margin:0 0 14px;font-size:13px;opacity:.72;line-height:1.45}
.kav-card{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;border:1px solid rgba(10,15,13,.12);background:transparent;color:inherit;border-radius:12px;padding:12px 14px;margin:0 0 8px;font:inherit;cursor:pointer}
.kav-card b{font-weight:600}.kav-card small{opacity:.7}
.kav-amt{font-variant-numeric:tabular-nums;font-weight:600;color:var(--atlas,#0B6E4F)}
.kav-line{display:flex;align-items:center;gap:10px;border:1px solid rgba(10,15,13,.12);border-radius:12px;padding:10px 12px;margin:0 0 8px}
.kav-line.is-done{border-color:var(--atlas,#0B6E4F);background:rgba(11,110,79,.07)}
.kav-line .n{flex:1;min-width:0}.kav-line .n small{display:block;opacity:.7}
.kav-line .q{font-variant-numeric:tabular-nums;font-weight:600}
.kav-scan{display:flex;align-items:center;gap:8px;border-radius:12px;padding:12px;margin:0 0 12px;background:rgba(11,110,79,.08);font-size:13px;line-height:1.4}
.kav-warn{color:#8a4b00;font-size:12.5px;margin:6px 0 0}
.kav-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}
.kav-btn{border:0;border-radius:999px;padding:11px 16px;font:inherit;font-weight:600;cursor:pointer;background:rgba(10,15,13,.07);color:inherit}
.kav-btn.primary{background:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}
.kav-btn:disabled{opacity:.45;cursor:not-allowed}
.kav-empty{padding:18px 4px;opacity:.7;font-size:14px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .kav-sheet{background:#141a17;color:#EDEBE6}}
:root[data-theme="dark"] .kav-sheet{background:#141a17;color:#EDEBE6}
`;
  document.head.appendChild(css);
}
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const mad = (cents) => (Math.round(Number(cents) || 0) / 100).toFixed(2).replace('.', ',') + ' MAD';

/* d = { merchant, R, customerName(id), resolveScan(code) → {pid,size,color}|null,
 *       armScan(fn), disarmScan(fn), openCam?(onCode), restock(line, ref) → bool,
 *       onCredit(credit, row), toast(msg, detail?), refresh?() } */
export async function openAvanceRestock(d) {
  if (typeof document === 'undefined' || !d || !d.R) return;
  injectCss();
  const veil = document.createElement('div');
  veil.className = 'kav-veil';
  veil.setAttribute('role', 'dialog'); veil.setAttribute('aria-modal', 'true');
  const sheet = document.createElement('div'); sheet.className = 'kav-sheet';
  veil.appendChild(sheet);
  (d.root || document.body).appendChild(veil);
  let scanFn = null;
  const stopScan = () => { if (scanFn && d.disarmScan) d.disarmScan(scanFn); scanFn = null; };
  const close = () => { stopScan(); veil.remove(); if (d.refresh) d.refresh(); };
  veil.addEventListener('click', (e) => { if (e.target === veil) close(); });

  /* D'abord, finir une remise en stock interrompue (réponse perdue, caisse rechargée). */
  async function resume() {
    const pending = readPending(d.merchant);
    for (const job of pending) {
      try {
        const data = await expireRequest(d.merchant, { id: job.id }, job.scanned);
        finish(job.row, job.lines, data.credit);
      } catch (error) { if (definitive(error.code)) dropPending(job.id); }
    }
  }
  function dropPending(id) { writePending(d.merchant, readPending(d.merchant).filter((job) => job.id !== id)); }
  function finish(row, lines, credit) {
    let unresolved = 0;
    lines.forEach((line) => { if (!d.restock(line, row.ticketRef)) unresolved += line.qty; });
    dropPending(row.id);
    if (unresolved) d.toast(tr('Avance close, stock à rapprocher'), `${unresolved} ${tr('pièce(s) introuvable(s) au catalogue')}`);
    if (credit && d.onCredit) d.onCredit(credit, row);
  }

  async function list() {
    stopScan();
    sheet.innerHTML = `<h3>${esc(tr('Avances expirées'))}</h3>
      <p class="kav-sub">${esc(tr('La cliente n’est pas revenue avant la date de son ticket. Scannez chaque pièce gardée pour la remettre en stock : l’argent versé devient un avoir à son nom.'))}</p>
      <div data-kav-list><p class="kav-empty">${esc(tr('Chargement…'))}</p></div>
      <div class="kav-foot"><button class="kav-btn" data-kav-close>${esc(tr('Fermer'))}</button></div>`;
    sheet.querySelector('[data-kav-close]').onclick = close;
    await resume();
    const { rows, status } = await d.R.listWithStatus(d.merchant, '');
    const expired = expiredAvances(rows, d.R).sort((a, b) => a.expiresAt - b.expiresAt);
    const target = sheet.querySelector('[data-kav-list]');
    if (!target) return;
    const stale = status && status !== 'ok'
      ? `<p class="kav-warn">${esc(tr('Serveur injoignable : seules les avances de cet appareil sont listées.'))}</p>` : '';
    if (!expired.length) { target.innerHTML = stale + `<p class="kav-empty">${esc(tr('Aucune avance expirée.'))}</p>`; return; }
    target.innerHTML = stale + expired.map((row) => {
      const paid = Number(row.paidCents) || 0;
      const pieces = (row.lines || []).reduce((n, line) => n + (Number(line.qty) || 1), 0);
      return `<button class="kav-card" data-kav-row="${esc(row.id)}">
        <b>${esc(d.customerName(row.customerId) || tr('Cliente'))} · ${esc(row.ticketRef)}</b>
        <small>${esc(tr('Expirée le'))} ${esc(dayText(row.expiresAt))} · ${pieces} ${esc(tr(pieces > 1 ? 'pièces' : 'pièce'))}</small>
        <span class="kav-amt">${esc(tr('Versé'))} ${esc(mad(paid))} · ${esc(tr('devient un avoir'))}</span>
      </button>`;
    }).join('');
    target.querySelectorAll('[data-kav-row]').forEach((button) => {
      button.onclick = () => { const row = expired.find((item) => item.id === button.dataset.kavRow); if (row) scan(row); };
    });
  }

  function scan(row) {
    stopScan();
    /* Une unité par ligne à cocher : deux pièces identiques demandent deux scans. */
    const units = [];
    (row.lines || []).forEach((line, i) => { for (let k = 0; k < (Number(line.qty) || 1); k++) units.push({ i, line, done: false }); });
    const paid = Number(row.paidCents) || 0;
    let busy = false;
    function paint() {
      const left = units.filter((u) => !u.done).length;
      const noLines = !units.length;
      sheet.innerHTML = `<h3>${esc(d.customerName(row.customerId) || tr('Cliente'))} · ${esc(row.ticketRef)}</h3>
        <p class="kav-sub">${esc(tr('Expirée le'))} ${esc(dayText(row.expiresAt))} · ${esc(tr('versé'))} ${esc(mad(paid))}</p>
        <div class="kav-scan">${esc(noLines
          ? tr('Les pièces de cette avance n’ont pas été enregistrées. Elle se règle depuis le tableau de bord.')
          : tr('Scannez chaque pièce avec la douchette ou la caméra. Une pièce non scannée ne revient pas en stock.'))}</div>
        ${units.map((u) => `<div class="kav-line ${u.done ? 'is-done' : ''}">
          <span class="n"><b>${esc(u.line.name || tr('Article'))}</b><small>${esc([u.line.size, u.line.barcode].filter(Boolean).join(' · '))}</small></span>
          <span class="q">${esc(u.done ? tr('Scannée') : tr('À scanner'))}</span></div>`).join('')}
        <div class="kav-foot">
          <button class="kav-btn" data-kav-back>${esc(tr('Retour'))}</button>
          ${d.openCam && !noLines ? `<button class="kav-btn" data-kav-cam>${esc(tr('Caméra'))}</button>` : ''}
          <button class="kav-btn primary" data-kav-go ${left || noLines || busy ? 'disabled' : ''}>${esc(paid > 0
            ? tr('Remettre en stock · avoir de') + ' ' + mad(paid) : tr('Remettre en stock'))}</button>
        </div>`;
      sheet.querySelector('[data-kav-back]').onclick = () => { void list(); };
      const cam = sheet.querySelector('[data-kav-cam]');
      if (cam) cam.onclick = () => d.openCam((code) => take(code));
      sheet.querySelector('[data-kav-go]').onclick = () => { void confirm(); };
    }
    function take(raw) {
      const code = String(raw || '').trim();
      if (!code || busy) return;
      const hit = d.resolveScan ? d.resolveScan(code) : null;
      const unit = units.find((u) => !u.done && (
        (u.line.barcode && u.line.barcode === code)
        || (hit && hit.pid === u.line.pid && (!u.line.size || !hit.size || hit.size === u.line.size)
          && (!u.line.color || !hit.color || hit.color === u.line.color))));
      if (!unit) { d.toast(tr('Ce code n’appartient pas à cette avance'), code); return; }
      unit.done = true;
      paint();
    }
    async function confirm() {
      if (busy || units.some((u) => !u.done) || !units.length) return;
      busy = true; paint();
      const lines = (row.lines || []).map((line) => ({ ...line, qty: Number(line.qty) || 1 }));
      const scanned = JSON.stringify(lines.map((line) => ({ pid: line.pid, size: line.size, qty: line.qty, barcode: line.barcode })));
      const pending = readPending(d.merchant).filter((job) => job.id !== row.id);
      pending.push({ id: row.id, row: { id: row.id, ticketRef: row.ticketRef, customerId: row.customerId }, lines, scanned });
      writePending(d.merchant, pending);
      let data;
      try { data = await expireRequest(d.merchant, row, scanned); }
      catch (error) {
        busy = false;
        if (definitive(error.code)) dropPending(row.id);
        d.toast(tr('Avance non close'), tr(ERRORS[error.code] || 'Le serveur n’a pas confirmé. Vérifiez la connexion et réessayez.'));
        paint(); return;
      }
      stopScan();
      finish(row, lines, data.credit);
      d.toast(data.credit ? tr('Pièces en stock, avoir émis') + ' · ' + data.credit.code : tr('Pièces remises en stock'));
      close();
    }
    scanFn = (code) => take(code);
    if (d.armScan) d.armScan(scanFn);
    paint();
  }
  await list();
}
