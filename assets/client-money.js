/* L'argent d'une cliente, en haut de sa fiche dans le carnet de la caisse.
 *
 * Amira Boutique, 21 nov. 2026 : une vente « sur le compte » s'inscrivait dans
 * l'historique à 0 MAD et la dette ne vivait que dans Acomptes. La fiche ne
 * disait ni ce que la cliente doit, ni l'avance versée sur une pièce gardée,
 * ni l'avoir qu'elle porte. Ici, les trois, et chaque ligne mène là où elle se
 * règle : une note ouverte (compte client, avance) ouvre Acomptes sur elle,
 * l'avoir la met sur la vente, où l'encaissement le propose.
 *
 * Les notes : journal de la caisse d'abord, puis le serveur (KiwiRetailBalances,
 * comme l'écran Acomptes). L'avoir : le total que la section « Avoirs » de la
 * fiche vient de lire (clients-book/credit.js le pose sur son hôte), pour ne
 * pas lire le registre deux fois. Chargé à la demande par clients-book.js. */
const lang = () => globalThis.window?.KiwiCaisseLang || { tr: (text) => text };
const tr = (text) => lang().tr(text) || text;
const pad2 = (n) => String(n).padStart(2, '0');
const dayText = (ts) => { const d = new Date(Number(ts) || 0); return Number(ts) > 0 ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : ''; };
const NO_EXPIRY_YEAR = 2900;
const cents = (v) => Math.max(0, Math.round(Number(v) || 0));
const ICON = 'assets/icons/material/';
const SETTLE_DOOR = '[data-bq-view="acomptes"], [data-mz-view="acomptes"]';
const SALE_DOOR = '[data-bq-view="vente"], [data-mz-view="vente"]';

/* Les notes encore dues de cette cliente : compte client d'abord, puis les
   avances, chacune de la plus ancienne à la plus récente. */
export function clientNotes(rows, R, customerId) {
  const rank = (row) => (row.kind === 'credit' ? 0 : 1);
  return (rows || []).filter((row) => row && String(row.customerId) === String(customerId)
    && !row.closedTs && !row.closed_ts && R.due(row) > 0)
    .sort((a, b) => rank(a) - rank(b) || (Number(a.createdTs) || 0) - (Number(b.createdTs) || 0));
}

function noteTitle(row, now) {
  if (row.kind === 'credit') return tr('Doit · Compte client');
  const until = Number(row.expiresAt) || 0;
  const forever = until > 0 && new Date(until).getFullYear() >= NO_EXPIRY_YEAR;
  if (row.kind === 'avance' && until > 0 && !forever && until <= now) return `${tr('Avance expirée le')} ${dayText(until)}`;
  if (row.kind === 'avance' && until > 0 && !forever) return `${tr('Avance · pièce gardée jusqu’au')} ${dayText(until)}`;
  return row.kind === 'avance' ? tr('Avance · pièce gardée') : tr('Acompte · reste à régler');
}

export function clientMoneyHtml({ notes = [], R, avoirCents = 0, canSettle = false, canSpend = false, now = Date.now() }, k) {
  const owed = notes.reduce((sum, row) => sum + R.due(row), 0);
  if (!notes.length && !(avoirCents > 0)) return '';
  const money = (c) => `${k.fmt(c / 100)} MAD`;
  const tag = canSettle ? 'button type="button"' : 'div';
  const end = canSettle ? 'button' : 'div';
  const rows = notes.slice(0, 8).map((row) => {
    const names = (row.lines || []).map((l) => `${Number(l.qty) > 1 ? l.qty + '× ' : ''}${l.name || tr('Article')}${l.size ? ' ' + l.size : ''}`).join(', ');
    const paid = cents(row.paidCents) + cents(row.pendingCents);
    const sub = [`${tr('Ticket')} ${row.ticketRef}`, names, dayText(row.createdTs), paid > 0 ? `${tr('versé')} ${money(paid)}` : ''].filter(Boolean).join(' · ');
    const cls = row.kind === 'credit' ? 'owes' : 'avance';
    const icon = row.kind === 'credit' ? 'account_balance_wallet' : 'pending_actions';
    return `<${tag} class="kcm-row ${cls}"${canSettle ? ' data-kcm-settle' : ''}><span class="kcm-ic"><img src="${ICON}${icon}.svg" alt=""></span>`
      + `<span class="kcm-l"><b>${k.esc(noteTitle(row, now))}</b><small>${k.esc(sub)}</small></span>`
      + `<span class="kcm-amt">${k.esc(money(R.due(row)))}<small>${k.esc(tr('à régler'))}</small></span>`
      + (canSettle ? `<img class="kcm-go" src="${ICON}chevron_right.svg" alt="">` : '') + `</${end}>`;
  }).join('');
  const more = notes.length > 8 ? `<p class="kcm-foot">${k.esc(tr('Et'))} ${notes.length - 8} ${k.esc(tr('autres notes dans Acomptes'))}</p>` : '';
  const avoir = avoirCents > 0
    ? `<${canSpend ? 'button type="button"' : 'div'} class="kcm-row avoir"${canSpend ? ' data-kcm-spend' : ''}><span class="kcm-ic"><img src="${ICON}redeem.svg" alt=""></span>`
      + `<span class="kcm-l"><b>${k.esc(tr('Avoir à utiliser'))}</b><small>${k.esc(tr(canSpend ? 'Toucher pour le mettre sur une vente, il se propose à l’encaissement' : 'Se propose à l’encaissement quand elle est sur le ticket'))}</small></span>`
      + `<span class="kcm-amt">${k.esc(money(avoirCents))}<small>${k.esc(tr('pour elle'))}</small></span>`
      + (canSpend ? `<img class="kcm-go" src="${ICON}chevron_right.svg" alt="">` : '') + `</${canSpend ? 'button' : 'div'}>`
    : '';
  const head = [owed > 0 ? `${tr('doit')} ${money(owed)}` : '', avoirCents > 0 ? `${tr('avoir')} ${money(avoirCents)}` : ''].filter(Boolean).join(' · ');
  return `<div class="kcb-section">${k.esc(tr('Argent en cours'))} · ${k.esc(head)}</div><div class="kcm-list">${rows}${avoir}</div>${more}`
    + (notes.length && canSettle ? `<p class="kcm-foot">${k.esc(tr('Toucher une note ouvre Acomptes sur elle pour encaisser.'))}</p>` : '');
}

const CSS = `.kcm-list{display:flex;flex-direction:column;gap:8px;margin:0 0 6px}
.kcm-row{display:flex;align-items:center;gap:12px;width:100%;text-align:start;font:inherit;color:inherit;padding:12px 14px;border-radius:14px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);background:color-mix(in srgb,currentColor 3%,transparent);min-height:56px}
button.kcm-row{cursor:pointer}button.kcm-row:active{transform:scale(.99)}
.kcm-row:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:2px}
.kcm-ic{flex:none;width:36px;height:36px;border-radius:10px;display:grid;place-items:center}
.kcm-ic img{width:20px;height:20px}
.kcm-row.owes .kcm-ic{background:color-mix(in srgb,#C0492F 14%,transparent)}
.kcm-row.avance .kcm-ic{background:color-mix(in srgb,#B7791F 16%,transparent)}
.kcm-row.avoir .kcm-ic{background:color-mix(in srgb,var(--atlas,#0B6E4F) 14%,transparent)}
.kcm-l{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.kcm-l b{font-weight:600;font-size:14px}
.kcm-l small{font-size:12px;opacity:.68;line-height:1.35}
.kcm-amt{flex:none;text-align:end;font-weight:600;font-variant-numeric:tabular-nums;display:flex;flex-direction:column;gap:2px}
.kcm-amt small{font-weight:500;font-size:11px;opacity:.62}
.kcm-row.owes .kcm-amt{color:color-mix(in srgb,#C0492F 85%,currentColor)}
.kcm-row.avoir .kcm-amt{color:var(--atlas,#0B6E4F)}
.kcm-go{flex:none;width:20px;height:20px;opacity:.45}
.kcm-foot{font-size:12px;opacity:.62;margin:2px 0 12px}`;
function ensureStyles() {
  const doc = globalThis.document;
  if (!doc || doc.getElementById('kcm-css')) return;
  const style = doc.createElement('style'); style.id = 'kcm-css'; style.textContent = CSS; doc.head.appendChild(style);
}

/* Les filtres « Avance en cours » et « Crédit en cours » du carnet : par
   cliente, ce qui reste dû (centimes) sur ses avances et sur son compte. Les
   anciens acomptes sans genre comptent comme avances. Journal de la caisse et
   serveur fusionnés, comme Acomptes ; sans registre, rien (jamais deviné). */
export async function noteKindsByClient(merchant) {
  const R = globalThis.window?.KiwiRetailBalances;
  if (!R || !merchant) return null;
  let rows;
  try { rows = await R.list(merchant, ''); } catch (_) { rows = R.read(merchant); }
  const out = { avance: {}, credit: {} };
  (rows || []).forEach((row) => {
    if (!row || !row.customerId || row.closedTs || row.closed_ts) return;
    const due = R.due(row); if (!(due > 0)) return;
    const kind = row.kind === 'credit' ? 'credit' : 'avance', id = String(row.customerId);
    out[kind][id] = (out[kind][id] || 0) + due;
  });
  return out;
}

/* k : { customerId, merchant, esc, fmt, avoirHost, close(), spend()|null, toast } */
export function paintClientMoney(slot, k) {
  const R = globalThis.window?.KiwiRetailBalances;
  if (!slot || !k || !k.customerId) return;
  ensureStyles();
  let notes = [], avoirCents = 0;
  const door = () => globalThis.document?.querySelector(SETTLE_DOOR);
  const paint = () => {
    if (!slot.isConnected) return;
    slot.innerHTML = clientMoneyHtml({ notes, R, avoirCents, canSettle: !!(R && R.focus && door()), canSpend: typeof k.spend === 'function' }, k);
  };
  const readAvoir = () => {
    const v = k.avoirHost && k.avoirHost.getAttribute('data-avoir-cents');
    if (v != null && v !== '') { avoirCents = cents(v); paint(); }
  };
  if (k.avoirHost) k.avoirHost.addEventListener('kcb:avoir', readAvoir);
  readAvoir();
  if (R && k.merchant) {
    notes = clientNotes(R.read(k.merchant), R, k.customerId); paint();
    R.list(k.merchant, '').then((rows) => { notes = clientNotes(rows, R, k.customerId); paint(); }, () => {});
  }
  slot.onclick = (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (t && t.closest('[data-kcm-settle]')) {
      const btn = door(); if (!btn || !R || !R.focus) return;
      R.focus(k.customerId); k.close(); btn.click();
    } else if (t && t.closest('[data-kcm-spend]')) {
      k.spend(); k.close();
      const sale = globalThis.document?.querySelector(SALE_DOOR); if (sale) sale.click();
      if (k.toast) k.toast('Cliente sur la vente', 'Son avoir se propose à l’encaissement.');   // le toast du carnet traduit lui-même
    }
  };
}
