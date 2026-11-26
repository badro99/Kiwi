/* Paramètres › Caisse & Reçu : the owner's two till policies that tills read.
 *   · « Remises nommées »   : each discount a name and a percentage. Once one
 *     exists, the tills offer exactly these, nothing typed (Jon's Burgers,
 *     26 Nov 2026: « enlever le pourcentage libre »).
 *   · « Commande au comptoir » : three switches for a counter restaurant
 *     (assets/discount-policy.js › KiwiCounterFlow).
 * Loaded on first use by assets/discount-policy.js, dashboard only. */
const lang = () => (window.KiwiI18n?.getLang?.() || document.documentElement.lang || 'fr').slice(0, 2);
const tr = (o) => o[lang()] || o.fr;
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (msg, type) => window.Kiwi?.toast?.(msg, { type: type || 'success', force: true });
const venueId = () => window.KiwiVenue?.getCurrentVenueData?.()?.id;
const reopenSettings = () => setTimeout(() => window.Kiwi?.handlers?.settings?.(), 90);
const ICON_DELETE = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>';

const STYLE = `<style>
  .tps{display:grid;gap:14px}
  .tps-lead{margin:0;color:var(--n-600);font-size:14px;line-height:1.5}
  .tps-rows{display:grid;gap:8px}
  .tps-row{display:grid;grid-template-columns:minmax(0,1fr) 96px 40px;gap:8px;align-items:center}
  .tps-row input{height:44px;box-sizing:border-box;border:1px solid var(--n-200);border-radius:12px;padding:0 12px;font:inherit;font-size:16px;background:var(--surface);color:var(--ink);min-width:0}
  .tps-pct{position:relative}.tps-pct input{width:100%;padding-right:28px;text-align:right;font-variant-numeric:tabular-nums}
  .tps-pct span{position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--n-500);font-size:14px}
  .tps-del{width:40px;height:40px;border-radius:50%;border:0;background:transparent;color:var(--n-500);display:grid;place-items:center;cursor:pointer}
  .tps-del svg{width:20px;height:20px}
  .tps-add{justify-self:start;height:40px;padding:0 16px;border-radius:999px;border:0;background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas);font:inherit;font-weight:600;cursor:pointer}
  .tps-err{margin:0;color:var(--danger,#B42318);font-size:13px;min-height:18px}
  .tps-sw{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid var(--n-200);border-radius:16px;background:var(--surface);cursor:pointer}
  .tps-sw input{width:22px;height:22px;margin:2px 0 0;accent-color:var(--atlas);flex:0 0 auto}
  .tps-sw b{display:block;font-size:15px;font-weight:600;color:var(--ink)}
  .tps-sw small{display:block;margin-top:3px;font-size:13px;color:var(--n-600);line-height:1.45}
</style>`;

export function openPresets() {
  const policy = window.KiwiDiscountPolicy;
  if (!policy?.presets) { toast(tr({ fr: 'Réglage indisponible, rechargez la page', en: 'Setting unavailable, reload the page', ar: 'الإعداد غير متاح، عاود حمّل الصفحة' }), 'warn'); return; }
  let rows = policy.presets(venueId()).map((p) => ({ name: p.name, pct: String(p.pct) }));
  if (!rows.length) rows = [{ name: '', pct: '' }];
  const row = (r, i) => `<div class="tps-row" data-tps-row="${i}">
      <input type="text" maxlength="40" autocomplete="off" data-tps-name value="${esc(r.name)}" placeholder="${esc(tr({ fr: 'Nom, ex. Étudiant', en: 'Name, e.g. Student', ar: 'الاسم، مثلا طالب' }))}" aria-label="${esc(tr({ fr: 'Nom de la remise', en: 'Discount name', ar: 'اسم التخفيض' }))}">
      <label class="tps-pct"><input type="number" min="1" max="100" step="1" inputmode="numeric" data-tps-pct value="${esc(r.pct)}" placeholder="10" aria-label="${esc(tr({ fr: 'Pourcentage', en: 'Percentage', ar: 'النسبة' }))}"><span>%</span></label>
      <button type="button" class="tps-del" data-tps-del="${i}" aria-label="${esc(tr({ fr: 'Retirer', en: 'Remove', ar: 'حيّد' }))}">${ICON_DELETE}</button>
    </div>`;
  const m = window.Kiwi.modal({
    tag: tr({ fr: 'CAISSE', en: 'TILL', ar: 'الصندوق' }), title: tr({ fr: 'Remises nommées', en: 'Named discounts', ar: 'تخفيضات بأسماء' }), width: 520,
    body: `${STYLE}<div class="tps" data-tps-presets>
      <p class="tps-lead">${esc(tr({ fr: 'Chaque remise a un nom et un pourcentage. Dès qu\'il y en a une, la caisse ne propose plus que celles-ci : plus de pourcentage ni de montant tapé à la main. Laissez la liste vide pour revenir aux pourcentages.', en: 'Each discount has a name and a percentage. As soon as there is one, the till offers only these: no typed percentage or amount. Leave the list empty to go back to percentages.', ar: 'كل تخفيض عندو اسم ونسبة. ملي يكون واحد، الصندوق كيقترح غير هادو: ما بقاش نسبة ولا مبلغ كيتكتب باليد. خلّي اللائحة خاوية باش ترجع للنسب.' }))}</p>
      <div class="tps-rows" data-tps-rows>${rows.map(row).join('')}</div>
      <button type="button" class="tps-add" data-tps-add>${esc(tr({ fr: 'Ajouter une remise', en: 'Add a discount', ar: 'زيد تخفيض' }))}</button>
      <p class="tps-err" data-tps-err role="status"></p>
    </div>`,
    foot: `<button type="button" class="kb" data-tps-cancel>${esc(tr({ fr: 'Annuler', en: 'Cancel', ar: 'إلغاء' }))}</button><button type="button" class="kb atlas" data-activation="write" data-tps-save>${esc(tr({ fr: 'Enregistrer', en: 'Save', ar: 'سجّل' }))}</button>`,
  });
  const $ = (s) => m.el.querySelector(s);
  const read = () => [...m.el.querySelectorAll('[data-tps-row]')].map((el) => ({
    name: el.querySelector('[data-tps-name]').value.trim(), pct: el.querySelector('[data-tps-pct]').value.trim(),
  }));
  const paint = () => { $('[data-tps-rows]').innerHTML = rows.map(row).join(''); };
  m.el.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-tps-add')) { rows = read(); if (rows.length < 12) rows.push({ name: '', pct: '' }); paint(); m.el.querySelector('[data-tps-row]:last-child [data-tps-name]')?.focus(); return; }
    if (t.hasAttribute('data-tps-del')) { rows = read(); rows.splice(+t.getAttribute('data-tps-del'), 1); paint(); return; }
    if (t.hasAttribute('data-tps-cancel')) { m.close(); return; }
    if (!t.hasAttribute('data-tps-save')) return;
    const typed = read().filter((r) => r.name || r.pct);
    const err = $('[data-tps-err]');
    const bad = typed.find((r) => !r.name || !/^\d+$/.test(r.pct) || +r.pct < 1 || +r.pct > 100);
    if (bad) { err.textContent = tr({ fr: 'Chaque remise a besoin d\'un nom et d\'un pourcentage entier de 1 à 100.', en: 'Each discount needs a name and a whole percentage from 1 to 100.', ar: 'كل تخفيض خاصو اسم ونسبة كاملة من 1 حتى 100.' }); return; }
    const names = typed.map((r) => r.name.toLowerCase());
    if (new Set(names).size !== names.length) { err.textContent = tr({ fr: 'Deux remises portent le même nom.', en: 'Two discounts have the same name.', ar: 'جوج تخفيضات عندهم نفس الاسم.' }); return; }
    if (new Set(typed.map((r) => +r.pct)).size > 8) { err.textContent = tr({ fr: 'Huit pourcentages différents au plus.', en: 'Eight different percentages at most.', ar: 'ثمنية د النسب المختلفة على الأكثر.' }); return; }
    t.disabled = true;
    try {
      await policy.save(policy.percentages(venueId()), venueId(), typed.map((r) => ({ name: r.name, pct: +r.pct })));
      m.close();
      toast(tr({ fr: 'Remises enregistrées · les caisses les reçoivent en quelques secondes', en: 'Discounts saved · tills receive them in a few seconds', ar: 'تسجلات التخفيضات · الصناديق كتوصلهم فثواني' }));
      reopenSettings();
    } catch (_) {
      t.disabled = false;
      err.textContent = tr({ fr: 'Enregistrement impossible, vérifiez la connexion et réessayez.', en: 'Could not save, check the connection and try again.', ar: 'ما تسجلش، شوف الكونيكسيون وعاود.' });
    }
  });
}

export function openCounterFlow() {
  const F = window.KiwiCounterFlow;
  if (!F?.get) { toast(tr({ fr: 'Réglage indisponible, rechargez la page', en: 'Setting unavailable, reload the page', ar: 'الإعداد غير متاح، عاود حمّل الصفحة' }), 'warn'); return; }
  const cur = F.get(venueId());
  const sw = (key, title, sub) => `<label class="tps-sw"><input type="checkbox" data-tps-flow="${key}"${cur[key] ? ' checked' : ''}><span><b>${esc(tr(title))}</b><small>${esc(tr(sub))}</small></span></label>`;
  const m = window.Kiwi.modal({
    tag: tr({ fr: 'CAISSE', en: 'TILL', ar: 'الصندوق' }), title: tr({ fr: 'Commande au comptoir', en: 'Counter ordering', ar: 'الطلب في الكونتوار' }), width: 540,
    body: `${STYLE}<div class="tps" data-tps-flowform>
      <p class="tps-lead">${esc(tr({ fr: 'Pour un comptoir où le client commande, paie, puis attend sa commande. Chaque caisse applique ces réglages en quelques secondes.', en: 'For a counter where the customer orders, pays, then waits for the order. Every till applies these settings within seconds.', ar: 'لكونتوار فين الكليان كيطلب، كيخلّص، ومن بعد كيتسنى الطلب ديالو. كل صندوق كيطبق هاد الإعدادات فثواني.' }))}</p>
      ${sw('payToKitchen', { fr: 'Encaisser envoie en cuisine', en: 'Paying sends to the kitchen', ar: 'الدفع يرسل للمطبخ' }, { fr: 'Au comptoir, plus de bouton « Envoyer en cuisine » avant « Encaisser » : le paiement envoie la commande.', en: 'At the counter, no « Send to kitchen » button before « Charge »: the payment sends the order.', ar: 'فالكونتوار، ما بقاش زر « صيفط للمطبخ » قبل « خلّص »: الدفع هو اللي كيصيفط الطلب.' })}
      ${sw('typeAtPay', { fr: 'Sur place ou à emporter au paiement', en: 'Eat in or take away at payment', ar: 'فالمحل أو للدار عند الدفع' }, { fr: 'La caisse le demande en fin de commande, au moment d\'encaisser, et l\'imprime en gros sur le bon de cuisine.', en: 'The till asks at the end of the order, when charging, and prints it large on the kitchen ticket.', ar: 'الصندوق كيسول فاللخر، ملي كتخلّص، وكيطبعو كبير فورقة المطبخ.' })}
      ${sw('direct', { fr: 'La cuisine commence tout de suite', en: 'The kitchen starts at once', ar: 'المطبخ يبدا دغيا' }, { fr: 'Une nouvelle commande arrive directement « En préparation » sur l\'écran cuisine, sans attendre qu\'on la lance.', en: 'A new order lands straight in « Preparing » on the kitchen screen, nobody has to start it.', ar: 'الطلب الجديد كيوصل مباشرة « قيد التحضير » فشاشة المطبخ، بلا ما يتسنى شي حد يبداه.' })}
      <p class="tps-err" data-tps-err role="status"></p>
    </div>`,
    foot: `<button type="button" class="kb" data-tps-cancel>${esc(tr({ fr: 'Annuler', en: 'Cancel', ar: 'إلغاء' }))}</button><button type="button" class="kb atlas" data-activation="write" data-tps-save>${esc(tr({ fr: 'Enregistrer', en: 'Save', ar: 'سجّل' }))}</button>`,
  });
  m.el.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-tps-cancel')) { m.close(); return; }
    if (!t.hasAttribute('data-tps-save')) return;
    const patch = {};
    m.el.querySelectorAll('[data-tps-flow]').forEach((el) => { patch[el.getAttribute('data-tps-flow')] = el.checked; });
    t.disabled = true;
    try {
      await F.save(patch, venueId());
      m.close();
      toast(tr({ fr: 'Réglage enregistré · les caisses le reçoivent en quelques secondes', en: 'Setting saved · tills receive it in a few seconds', ar: 'تسجل الإعداد · الصناديق كتوصلو فثواني' }));
      reopenSettings();
    } catch (_) {
      t.disabled = false;
      m.el.querySelector('[data-tps-err]').textContent = tr({ fr: 'Enregistrement impossible, vérifiez la connexion et réessayez.', en: 'Could not save, check the connection and try again.', ar: 'ما تسجلش، شوف الكونيكسيون وعاود.' });
    }
  });
}
