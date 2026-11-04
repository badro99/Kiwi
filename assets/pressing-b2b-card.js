/* Pressing · « Services & tarifs » : la remise B2B du commerçant.
 *
 * Un réglage par établissement, de 0 à 50 % (15 % par défaut, comme avant),
 * lu par la caisse du pressing au prochain dépôt d'un client B2B. Une commande
 * déjà ouverte garde son taux. La fiche d'un client B2B peut porter son propre
 * taux. Le document vit dans `policies` (assets/merchant-policies.js). */
import './merchant-policies.js?v=3';
const L = (fr, en, ar) => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
const policies = () => window.KiwiPolicies;

export async function mount(editor) {
  const P = policies();
  if (!editor || !P || editor.parentElement?.querySelector('[data-pxd-b2b]')) return;
  const card = document.createElement('section');
  card.className = 'pxd-page-card';
  card.setAttribute('data-pxd-b2b', '');
  card.innerHTML = `<h3>${L('Remise B2B', 'B2B discount', 'تخفيض المهنيين')}</h3>
    <p>${L('Appliquée aux clients B2B à chaque nouveau dépôt, sur le total, arrondie au dirham. Une commande déjà ouverte garde son taux ; une fiche client peut avoir son propre taux.', 'Applied to B2B customers on every new drop-off, on the total, rounded to the dirham. An open order keeps its rate; a customer card can carry its own rate.', 'يُطبَّق على عملاء المهنيين عند كل إيداع جديد، على المجموع، مقرَّبًا إلى الدرهم. يحتفظ الطلب المفتوح بنسبته، ويمكن لبطاقة العميل أن تحمل نسبتها.')}</p>
    <div style="display:flex; gap:10px; align-items:end; flex-wrap:wrap; margin-top:10px;">
      <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--n-500);"><span>${L('Taux (0 à 50 %)', 'Rate (0 to 50%)', 'النسبة (0 إلى 50 %)')}</span>
        <input type="number" min="0" max="${P.MAX_B2B_PERCENT}" step="0.5" inputmode="decimal" data-pxd-b2b-rate value="${P.pressingB2bPercent()}" style="width:110px;"/></label>
      <button type="button" class="kb atlas" data-pxd-b2b-save>${L('Enregistrer', 'Save', 'حفظ')}</button>
      <span role="status" aria-live="polite" data-pxd-b2b-note style="font-size:12px; color:var(--n-500);"></span>
    </div>`;
  editor.parentElement.insertBefore(card, editor);
  const input = card.querySelector('[data-pxd-b2b-rate]'), note = card.querySelector('[data-pxd-b2b-note]');
  card.querySelector('[data-pxd-b2b-save]').onclick = async () => {
    const raw = String(input.value).trim().replace(',', '.');
    const percent = Number(raw);
    if (raw === '' || !Number.isFinite(percent) || percent < 0 || percent > P.MAX_B2B_PERCENT) {
      note.textContent = L('Entrez un taux entre 0 et 50 %.', 'Enter a rate between 0 and 50%.', 'أدخل نسبة بين 0 و50 %.'); return;
    }
    note.textContent = '';
    let result;
    try { result = await P.save({ pressingB2bPercent: percent }); } catch (_) { result = { ok: false }; }
    note.textContent = result && result.ok !== false
      ? L('Enregistré : ' + P.pressingB2bPercent() + ' %, au prochain dépôt B2B.', 'Saved: ' + P.pressingB2bPercent() + '%, from the next B2B drop-off.', 'تم الحفظ: ' + P.pressingB2bPercent() + ' %، عند الإيداع المهني التالي.')
      : L('Non enregistré : le serveur n’a pas confirmé. Réessayez.', 'Not saved: the server did not confirm. Try again.', 'لم يُحفظ: لم يؤكد الخادم. أعد المحاولة.');
  };
  try { await P.refresh(true); } catch (_) { /* le réglage local reste affiché */ }
  if (document.activeElement !== input) input.value = String(P.pressingB2bPercent());
}
