/* La fiche de livraison de la caisse Maison (propriétaire, 30 octobre 2026).
 *
 * La même fiche que la boutique (assets/pos-boutique/delivery-card.js) :
 * nom, téléphone, ville et adresse obligatoires, commentaire libre. Elle part
 * avec la vente et la page Livraisons la retrouve par nom, ville ou téléphone.
 * Le destinataire n'entre pas dans le carnet de clients ni dans la fidélité.
 *
 * Maison y ajoute sa ligne « Livraison fragile » : le créneau et l'emballage
 * renforcé. Si la caissière a déjà rempli la livraison sur le ticket, la fiche
 * s'ouvre préremplie avec. Le créneau et l'emballage voyagent dans le
 * commentaire, pour que le livreur et la page Livraisons les voient. */
import { bqDeliveryCard } from '../pos-boutique/delivery-card.js?v=1';
import { bqLivraisons } from '../pos-boutique/livraisons.js?v=12';

const PHRASES = {
  'Livraison fragile': ['Fragile delivery', 'توصيل هش'],
  'Créneau': ['Time slot', 'وقت التسليم'],
  'Emballage renforcé (bulle et calage)': ['Reinforced packing (bubble wrap and padding)', 'تغليف معزز (فقاعات وحشو)'],
  'Emballage renforcé': ['Reinforced packing', 'تغليف معزز'],
  'Matin (10h - 13h)': ['Morning (10am - 1pm)', 'صباحاً (10 - 13)'],
  'Après-midi (15h - 19h)': ['Afternoon (3pm - 7pm)', 'بعد الظهر (15 - 19)'],
  'Demain matin': ['Tomorrow morning', 'صباح الغد'],
  'Sur rendez-vous client': ['By appointment', 'حسب موعد الزبون'],
};
const tr = (s) => {
  const C = window.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  if (own && (lang === 'en' || lang === 'ar')) return own[lang === 'en' ? 0 : 1];
  return C && typeof C.tr === 'function' ? C.tr(s) : s;
};
const SLOTS = ['Matin (10h - 13h)', 'Après-midi (15h - 19h)', 'Demain matin', 'Sur rendez-vous client'];

/* La livraison saisie sur le ticket devient le préremplissage de la fiche. */
function prefill(o) {
  const card = o.prev || {};
  const d = o.ticket || {};
  const c = o.client || {};
  const addr = [d.quartier, d.address].filter(Boolean).join(', ');
  return {
    name: card.name || d.name || c.name || '',
    phone: card.phone || d.phone || c.phone || '',
    city: card.city || d.city || (d.quartier ? 'Tanger' : ''),
    address: card.address || addr,
    note: card.note != null ? card.note : (d.instructions || ''),
  };
}

function fragileRow(esc, d) {
  const slot = d.slot && SLOTS.includes(d.slot) ? d.slot : SLOTS[1];
  return '<div class="bqdc-f wide mzdc-fragile"><label for="mzdc-slot">' + esc(tr('Livraison fragile')) + ' · ' + esc(tr('Créneau')) + '</label>'
    + '<select id="mzdc-slot" name="mzdc-slot">' + SLOTS.map((s) => '<option value="' + esc(s) + '"' + (s === slot ? ' selected' : '') + '>' + esc(tr(s)) + '</option>').join('') + '</select>'
    + '<label class="mzdc-wrap"><input type="checkbox" id="mzdc-wrap"' + (d.reinforcedWrap ? ' checked' : '') + '> <span>' + esc(tr('Emballage renforcé (bulle et calage)')) + '</span></label></div>';
}

function css() {
  if (document.getElementById('mzdc-css')) return;
  const s = document.createElement('style');
  s.id = 'mzdc-css';
  s.textContent = [
    '.mzdc-fragile select{width:100%;box-sizing:border-box;min-height:46px;padding:10px 12px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:16px;color:inherit;}',
    '.mzdc-fragile .mzdc-wrap{display:flex;align-items:center;gap:8px;font-weight:500;margin-top:4px;}',
    '.mzdc-fragile .mzdc-wrap input{width:20px;height:20px;min-height:0;accent-color:var(--atlas,#0B6E4F);}',
  ].join('\n');
  document.head.appendChild(s);
}

/* o : { amount, fmtMAD, esc, icons, closeBtns, prev, ticket, client, back, done(card, fragile) } */
export function mzDeliveryCard(el, o) {
  css();
  const d = o.ticket || {};
  bqDeliveryCard(el, {
    amount: o.amount, fmtMAD: o.fmtMAD, esc: o.esc, icons: o.icons,
    prev: prefill(o), back: o.back,
    done: (card) => {
      const slot = (el.querySelector('#mzdc-slot') || {}).value || '';
      const wrap = !!(el.querySelector('#mzdc-wrap') || {}).checked;
      const own = String(card.note || '');
      /* Le commentaire saisi garde sa place ; créneau et emballage passent devant. */
      const note = [slot, wrap ? 'Emballage renforcé' : '', own].filter(Boolean).join(' · ').slice(0, 300);
      o.done(Object.assign({}, card, { note }), { slot, reinforcedWrap: wrap, instructions: own });
    },
  });
  /* La fiche parle le vocabulaire de la boutique : on la remet aux classes Maison. */
  el.querySelectorAll('.bq-modal-x').forEach((b) => { b.classList.replace('bq-modal-x', 'mz-modal-x'); b.removeAttribute('data-bq-close'); b.setAttribute('data-mz-close', ''); });
  el.querySelectorAll('.bq-sheet-foot').forEach((f) => f.classList.replace('bq-sheet-foot', 'mz-sheet-foot'));
  el.querySelectorAll('.bq-btn').forEach((b) => b.classList.replace('bq-btn', 'mz-btn'));
  const noteField = el.querySelector('#bqdc-note');
  const box = noteField && noteField.closest('.bqdc-f');
  if (box) box.insertAdjacentHTML('beforebegin', fragileRow(o.esc, d));
  if (o.icons) o.icons();
  if (o.closeBtns) o.closeBtns();
}

/* La page Livraisons de la boutique, telle quelle, dans la caisse Maison. Ses
   styles sont posés sous #pos-boutique : on en tire une copie sous #pos-maison
   plutôt que de toucher la page de la boutique. */
export function mzLivraisons(panel, d) {
  bqLivraisons(panel, d);
  if (document.getElementById('mzd-css')) return;
  const src = document.getElementById('bqd-css');
  if (!src) return;
  const s = document.createElement('style');
  s.id = 'mzd-css';
  s.textContent = src.textContent.split('#pos-boutique').join('#pos-maison');
  document.head.appendChild(s);
}
