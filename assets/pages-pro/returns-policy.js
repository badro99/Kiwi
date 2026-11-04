/* Retours & échanges · la fenêtre de retour du commerçant, sur un vrai compte.
 *
 * Le champ « Fenêtre de retour » du tableau de bord n'était qu'une maquette :
 * il affichait un chiffre et un message de réussite sans rien enregistrer. Sur
 * un compte réel il lit et écrit maintenant le réglage `policies` du
 * commerçant (assets/merchant-policies.js, 0 à 90 jours, 7 par défaut) que la
 * caisse applique et que le serveur relit au remboursement. 0 = aucun retour
 * sans l'accord d'un responsable. */
const L = (fr, en, ar) => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
const policies = () => window.KiwiPolicies;
const field = () => document.querySelector('#retPolicy input[type="number"]');

export async function mount() {
  const host = document.querySelector('[data-ret-policy-real]'), P = policies();
  if (!host || !P) return;
  host.innerHTML = `<div class="p-grid-2" style="margin-top: 18px;"><div class="p-card" style="margin-bottom: 0;">
    <div class="head"><h4>${L('Politique de retour', 'Return policy', 'سياسة الإرجاع')}</h4><span class="meta">${L('MODIFIABLE', 'EDITABLE', 'قابلة للتعديل')}</span></div>
    <div style="font-size: 12.5px; color: var(--n-500); margin-bottom: 12px; line-height: 1.45;">${L('Appliquée à toutes les caisses de cet établissement : au comptoir, un retour hors fenêtre demande l\u2019accord d\u2019un responsable, et le serveur le vérifie au remboursement.', 'Applies to every till of this venue: at the counter a return outside the window needs a manager\u2019s approval, and the server checks it again at refund time.', 'تُطبَّق على كل صناديق هذه المؤسسة: عند الصندوق يتطلب الإرجاع خارج المهلة موافقة مسؤول، ويتحقق الخادم منه عند الاسترداد.')}</div>
    <div class="b-ret-policy" id="retPolicy"><div class="field">
      <label class="lbl" for="ret-window-days">${L('FENÊTRE DE RETOUR', 'RETURN WINDOW', 'مهلة الإرجاع')}</label>
      <input id="ret-window-days" type="number" min="0" max="${P.MAX_RETURN_DAYS}" step="1" inputmode="numeric" value="${P.returnWindowDays()}"/>
      <div style="font-size: 11px; color: var(--n-500); margin-top: 4px;">${L('jours après l\u2019achat · 0 : aucun retour sans accord d\u2019un responsable', 'days after purchase · 0: no returns without a manager\u2019s approval', 'أيام بعد الشراء · 0: لا إرجاع دون موافقة مسؤول')}</div>
    </div></div>
    <button data-activation=write class="kb atlas" style="width: 100%; justify-content: center; margin-top: 12px;" data-action="ret-policy-save">${L('Enregistrer la politique', 'Save policy', 'حفظ السياسة')}</button>
  </div></div>`;
  try { await P.refresh(true); } catch (_) { /* le réglage local reste affiché */ }
  const input = field();
  if (input && document.activeElement !== input) input.value = String(P.returnWindowDays());
}

export async function save() {
  const input = field(), P = policies(), toast = window.Kiwi?.toast;
  if (!input || !P || !toast) return;
  const raw = String(input.value).trim();
  const days = Number(raw);
  if (raw === '' || !Number.isInteger(days) || days < 0 || days > P.MAX_RETURN_DAYS) {
    toast(L('Fenêtre non valide', 'Invalid window', 'مهلة غير صالحة'), { type: 'warn', desc: L('Entrez un nombre entier de jours entre 0 et 90.', 'Enter a whole number of days between 0 and 90.', 'أدخل عددًا صحيحًا من الأيام بين 0 و90.') });
    return;
  }
  let result;
  try { result = await P.save({ returnWindowDays: days }); } catch (_) { result = { ok: false }; }
  if (result && result.ok !== false) {
    toast(L('Politique de retour enregistrée', 'Return policy saved', 'تم حفظ سياسة الإرجاع'), { type: 'success', desc: days === 0
      ? L('Aucun retour sans l’accord d’un responsable. Appliqué aux caisses de cet établissement.', 'No returns without a manager’s approval. Applies to every till of this venue.', 'لا إرجاع دون موافقة مسؤول. يُطبَّق على كل صناديق هذه المؤسسة.')
      : L('Fenêtre de ' + days + ' jours. Appliquée aux caisses de cet établissement.', days + '-day window. Applies to every till of this venue.', 'مهلة ' + days + ' يومًا. تُطبَّق على كل صناديق هذه المؤسسة.') });
    return;
  }
  toast(L('Politique non enregistrée', 'Policy not saved', 'لم تُحفظ السياسة'), { type: 'warn', desc: L('Le serveur n’a pas confirmé. Vérifiez la connexion et réessayez : les caisses gardent l’ancienne fenêtre.', 'The server did not confirm. Check the connection and try again: the tills keep the old window.', 'لم يؤكد الخادم. تحقق من الاتصال وأعد المحاولة: تحتفظ الصناديق بالمهلة القديمة.') });
}
