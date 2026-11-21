/* La caisse boutique · un chèque reçu entre au portefeuille (21 novembre 2026).
 *
 * Au règlement par chèque, la fenêtre « Chèque reçu » prend en plus le numéro
 * (déjà sous le doigt), l'échéance, le tireur et sa banque : tout est
 * facultatif, le montant est celui du règlement. Une fois la vente écrite, le
 * chèque part vers /api/cheques, relié au ticket (saleIds = syncId de la
 * vente) ; il apparaît au tableau de bord dans « Chèques et effets », en
 * portefeuille, à son échéance.
 *
 * Sans réseau, il attend dans une file locale propre à la boutique
 * (kiwiChqOutbox:<boutique>) et repart au retour du réseau ou au prochain
 * chargement ; la clé d'idempotence (le ticket et la place du règlement) fait
 * qu'un renvoi n'écrit jamais deux chèques. La caisse ne fait qu'enregistrer :
 * remise, encaissement et rejet se décident au tableau de bord (patron, gérant).
 * Une caisse de démonstration n'envoie rien. */
const PHRASES = {
  'Numéro du chèque': ['Cheque number', 'رقم الشيك'],
  'Échéance': ['Due date', 'تاريخ الصرف'],
  'Tireur, si ce n\'est pas la cliente': ['Drawer, if not the customer', 'مول الشيك، إلا ماشي الكليانة'],
  'Banque': ['Bank', 'البنكة'],
  'Tout est facultatif : le chèque rejoint le portefeuille du tableau de bord, relié au ticket.': ['All optional: the cheque joins the dashboard portfolio, linked to the ticket.', 'كلشي اختياري: الشيك كيدخل لمحفظة الشيكات فلوحة التحكم، مربوط بالتيكي.'],
  'Chèque ajouté au portefeuille': ['Cheque added to the portfolio', 'الشيك تزاد للمحفظة'],
  'Chèque gardé sur la caisse, il partira au retour du réseau': ['Cheque kept on the till, it will be sent when the network is back', 'الشيك محفوظ فالكاسة، غادي يتصيفط ملي يرجع الريزو'],
};
const tr = (s) => {
  const C = globalThis.window && globalThis.window.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  if (own && (lang === 'en' || lang === 'ar')) return own[lang === 'en' ? 0 : 1];
  return s;
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BANKS = ['Attijariwafa bank', 'Bank of Africa (BMCE)', 'Banque Populaire', 'CIH Bank', 'Société Générale Maroc', 'Crédit du Maroc', 'BMCI', 'Crédit Agricole du Maroc', 'Al Barid Bank', 'CFG Bank'];
const OUTBOX = 'kiwiChqOutbox:';
const MAX_AGE = 60 * 86400000;
const held = new WeakMap();
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

/* Les champs, glissés dans la fenêtre « Chèque reçu ». */
export function chequeFields() {
  const field = (name, label, extra) => `<label style="display:grid;gap:4px;font-size:12.5px;color:var(--n-600,#3a4440)">${esc(tr(label))}<input class="bq-in" data-cq-f="${name}" autocomplete="off" ${extra || ''}></label>`;
  return `<div data-cq-sheet style="display:grid;gap:10px;margin:12px 0">
    ${field('number', 'Numéro du chèque', 'inputmode="numeric" maxlength="40" dir="ltr"')}
    <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      ${field('due', 'Échéance', 'type="date"')}
      ${field('drawerBank', 'Banque', 'maxlength="80" list="cq-till-banks"')}
    </div>
    ${field('drawer', 'Tireur, si ce n\'est pas la cliente', 'maxlength="120"')}
    <datalist id="cq-till-banks">${BANKS.map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
    <p class="modal-subtle" style="margin:0">${esc(tr('Tout est facultatif : le chèque rejoint le portefeuille du tableau de bord, relié au ticket.'))}</p>
  </div>`;
}
export function chequeFocus(el) {
  setTimeout(() => { try { const n = el.querySelector('[data-cq-f="number"]'); if (n) n.focus(); } catch (_) {} }, 60);
}
/* Le règlement garde ses détails à côté de lui (jamais dans le ticket). */
export function chequeHold(el, part) {
  const v = (k) => { const n = el && el.querySelector(`[data-cq-f="${k}"]`); return n ? n.value : ''; };
  const due = v('due');
  held.set(part, { number: clean(v('number'), 40), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : '', drawerBank: clean(v('drawerBank'), 80), drawerName: clean(v('drawer'), 120) });
  return part;
}

function readBox(slug) {
  try { const list = JSON.parse(localStorage.getItem(OUTBOX + slug) || '[]'); return Array.isArray(list) ? list : []; } catch (_) { return []; }
}
function writeBox(slug, list) {
  try { if (list.length) localStorage.setItem(OUTBOX + slug, JSON.stringify(list)); else localStorage.removeItem(OUTBOX + slug); return true; } catch (_) { return false; }
}
const flushing = new Map();
/* Renvoie la file d'une boutique. Une réponse définitive (créé, doublon, refus
   400/404/409) sort le chèque de la file ; réseau coupé, 5xx, base pas encore
   migrée (503) ou caisse pas (plus) appairée à cette boutique (403) le gardent :
   rien ne se perd, la file expire seule après soixante jours. */
export function chequeFlush(slug) {
  if (!slug) return Promise.resolve(0);
  if (flushing.has(slug)) return flushing.get(slug);
  const run = (async () => {
    let sent = 0;
    for (const item of readBox(slug)) {
      let done = Date.now() - (Number(item.at) || 0) > MAX_AGE;
      if (!done) {
        try {
          const r = await fetch('/api/cheques', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(item.body) });
          done = r.ok || [400, 404, 409].includes(r.status);
          if (r.ok) sent++;
        } catch (_) { done = false; }
      }
      if (done) writeBox(slug, readBox(slug).filter((x) => x.body.idemKey !== item.body.idemKey));
    }
    return sent;
  })().finally(() => { flushing.delete(slug); });
  flushing.set(slug, run);
  return run;
}

/* Après la vente : chaque règlement par chèque devient un chèque du portefeuille. */
export function chequeRecord(parts, sale, ctx) {
  const o = ctx || {};
  if (o.demo || !o.slug || !sale || !sale.syncId) return;
  const ticket = String(sale.syncId).replace(/[^A-Za-z0-9:._@-]/g, '').slice(0, 80);
  const list = (parts || []).map((p, i) => [p, i]).filter(([p]) => p && p.m === 'chèque' && held.has(p));
  if (!list.length) return;
  const box = readBox(o.slug);
  for (const [p, i] of list) {
    const info = held.get(p);
    const cents = Math.round((Number(p.amount) || 0) * 100);
    if (!(cents > 0)) continue;
    const idemKey = 'till:' + ticket + ':' + i;
    if (box.some((x) => x.body.idemKey === idemKey)) continue;
    box.push({ at: Date.now(), body: { merchant: o.slug, idemKey, kind: 'cheque', direction: 'received', amountCents: cents, number: info.number, dueDate: info.dueDate, drawerBank: info.drawerBank,
      drawerName: info.drawerName || clean(o.client, 120), partyName: clean(o.client, 120), saleIds: [String(sale.syncId)], by: clean(o.by, 40) } });
  }
  const kept = writeBox(o.slug, box);
  chequeFlush(o.slug).then((sent) => {
    if (typeof o.toast !== 'function') return;
    if (sent) o.toast(tr('Chèque ajouté au portefeuille'));
    else if (kept && readBox(o.slug).length) o.toast(tr('Chèque gardé sur la caisse, il partira au retour du réseau'));
  });
}

/* Une file restée d'un chargement précédent repart au retour du réseau. */
function pendingSlugs() {
  try { return Object.keys(localStorage).filter((k) => k.startsWith(OUTBOX)).map((k) => k.slice(OUTBOX.length)).filter(Boolean); } catch (_) { return []; }
}
try {
  const again = async () => { for (const s of pendingSlugs()) await chequeFlush(s); };
  window.addEventListener('online', again);
  setTimeout(again, 4000);
} catch (_) {}
