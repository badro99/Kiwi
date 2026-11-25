/* La caisse boutique · baisser la différence d'un échange (propriétaire, 25 nov. 2026).
 *
 * Une cliente rend un pantalon (181 MAD) et prend une pièce à 350 : la caisse
 * demandait 169, la boutique en accorde 150. Il n'y avait aucun moyen de le
 * dire : la fiche d'échange n'avait pas de remise, et le règlement refuse de
 * fermer tant que tout n'est pas payé. Ce bouton pose « La cliente paie » sous
 * la différence ; l'écart devient une remise de la vendeuse en poste, comme une
 * remise de vente (sans code depuis le 23 nov., son nom et l'heure restent sur
 * le ticket, le serveur garde le brut et la remise). checkout.js › openExchSummary
 * lit le montant par onPay et encaisse exactement celui-là.
 *
 * Rien n'est arrondi en douce : un montant vide, nul ou pas plus bas que la
 * différence remet la différence entière. */

const PHRASES = {
  'Baisser la différence': ['Lower the difference', 'خفّض الفرق'],
  'La cliente paie': ['The customer pays', 'تدفع الزبونة'],
  'Annuler la baisse': ['Cancel', 'إلغاء التخفيض'],
  'Moins que {n}, sinon rien à baisser': ['Less than {n}, or nothing to lower', 'أقل من {n}، وإلا فلا تخفيض'],
  'Remise accordée · {n}': ['Discount given · {n}', 'تخفيض ممنوح · {n}'],
  'Encaisser {n}': ['Collect {n}', 'تحصيل {n}'],
};
const tr = (s) => {
  const C = typeof window !== 'undefined' ? window.KiwiCaisseLang : null;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  if (own && (lang === 'en' || lang === 'ar')) return own[lang === 'en' ? 0 : 1];
  return C && typeof C.tr === 'function' ? C.tr(s) : s;
};
const ui = (key, n) => tr(key).split('{n}').join(String(n));
const cents = (v) => Math.round((Number(v) || 0) * 100);

/* Ce que la cliente paie, lu dans la case : null si la case ne baisse rien. */
export function cutPay(diff, text) {
  const raw = String(text == null ? '' : text).replace(/\s/g, '').replace(',', '.');
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const c = cents(raw);
  return c > 0 && c < cents(diff) ? c / 100 : null;
}

/* host : l'emplacement sous la différence ; modal : la fiche d'échange. */
export function mountExchCut(host, { diff, fmt, modal, onPay }) {
  if (!host || !(diff > 0)) return;
  css();
  const amt = modal && modal.querySelector('.bq-exch-diff .amt');
  const go = modal && modal.querySelector('#bq-exch-go');
  const paint = (pay) => {
    if (amt) {   // l'ancienne différence reste lisible, barrée
      amt.textContent = '';
      if (pay < diff) { const was = document.createElement('s'); was.className = 'bq-xc-was'; was.textContent = fmt(diff); amt.append(was, ' '); }
      amt.append(fmt(pay));
    }
    if (go) { const t = [...go.childNodes].filter((n) => n.nodeType === 3).pop(); if (t) t.textContent = ui('Encaisser {n}', fmt(pay)); }
  };
  const closed = () => {
    host.innerHTML = `<button type="button" class="bq-xc-open" data-bq-xc-open>${tr('Baisser la différence')}</button>`;
    host.querySelector('[data-bq-xc-open]').onclick = open;
  };
  const open = () => {
    host.innerHTML = `<label class="bq-xc-row"><span>${tr('La cliente paie')}</span>
      <input type="text" inputmode="decimal" autocomplete="off" data-bq-xc-in placeholder="${Math.max(0, Math.floor(diff) - 1)}" aria-describedby="bq-xc-msg"><b>${tr('MAD')}</b></label>
      <p class="bq-xc-msg" id="bq-xc-msg" data-bq-xc-msg aria-live="polite"></p>
      <button type="button" class="bq-xc-undo" data-bq-xc-undo>${tr('Annuler la baisse')}</button>`;
    const inp = host.querySelector('[data-bq-xc-in]');
    const msg = host.querySelector('[data-bq-xc-msg]');
    inp.addEventListener('input', () => {
      const pay = cutPay(diff, inp.value);
      const typed = inp.value.trim() !== '';
      onPay(pay == null ? diff : pay);
      paint(pay == null ? diff : pay);
      inp.setAttribute('aria-invalid', typed && pay == null ? 'true' : 'false');
      msg.classList.toggle('is-bad', typed && pay == null);
      msg.textContent = pay != null ? ui('Remise accordée · {n}', fmt((cents(diff) - cents(pay)) / 100)) : typed ? ui('Moins que {n}, sinon rien à baisser', fmt(diff)) : '';
    });
    host.querySelector('[data-bq-xc-undo]').onclick = () => { onPay(diff); paint(diff); closed(); };
    inp.focus();
  };
  closed();
}

function css() {
  if (document.getElementById('bq-xc-css')) return;
  const s = document.createElement('style');
  s.id = 'bq-xc-css';
  s.textContent = [
    '.bq-xc{margin:2px 0 10px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;}',
    '.bq-xc-open,.bq-xc-undo{min-height:40px;padding:0 4px;border:0;background:transparent;font:inherit;font-size:14px;font-weight:600;color:var(--atlas,#0B6E4F);text-decoration:underline;cursor:pointer;}',
    '.bq-xc-row{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;}',
    '.bq-xc-row input{width:110px;height:44px;box-sizing:border-box;padding:0 10px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:17px;font-variant-numeric:tabular-nums;text-align:end;color:inherit;}',
    '.bq-xc-row input:focus{outline:2px solid var(--atlas,#0B6E4F);outline-offset:1px;}',
    '.bq-xc-row input[aria-invalid="true"]{border-color:var(--danger,#cb5238);}',
    '.bq-xc-msg{flex-basis:100%;margin:0;font-size:13px;color:var(--atlas,#0B6E4F);min-height:0;}',
    '.bq-xc-msg.is-bad{color:var(--danger,#cb5238);}',
    '.bq-xc-msg:empty{display:none;}',
    '.bq-xc-was{font-weight:500;opacity:.55;margin-inline-end:4px;}',
  ].join('\n');
  document.head.appendChild(s);
}
