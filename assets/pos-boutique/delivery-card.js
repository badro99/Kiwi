/* La fiche de livraison, à l'encaissement (propriétaire, 30 octobre 2026).
 *
 * Choisir « Livraison » ouvre cette fiche dans la fenêtre de paiement, avant
 * que la vente ne s'enregistre : nom du client, téléphone, ville et adresse
 * sont obligatoires, le commentaire est libre. La fiche part avec la vente
 * (la part 'livraison' la porte, pos-boutique.js la met dans le champ
 * deliveryCard) et le serveur l'écrit à côté
 * (functions/api/_delivery-card.js). La page Livraisons la retrouve ensuite
 * par nom, ville ou téléphone quand le colis revient.
 *
 * Ce destinataire n'entre PAS dans le carnet de clients : pas de fiche
 * cliente, pas de points, pas de fidélité. */

const PHRASES = {
  'Livraison · destinataire': ['Delivery · recipient', 'التوصيل · المستلم'],
  'Ces informations restent sur la commande pour la retrouver en cas de retour. Le client n’entre pas dans le carnet de fidélité.': ['These details stay on the order so it can be found if it comes back. The customer is not added to the loyalty book.', 'تبقى هذه المعلومات مع الطلب للعثور عليه عند الإرجاع. لا يُضاف الزبون إلى دفتر الولاء.'],
  'Nom du client': ['Customer name', 'اسم الزبون'],
  'Téléphone': ['Phone', 'الهاتف'],
  'Ville': ['City', 'المدينة'],
  'Adresse': ['Address', 'العنوان'],
  'Commentaire': ['Comment', 'تعليق'],
  'facultatif': ['optional', 'اختياري'],
  'Prénom et nom': ['First and last name', 'الاسم الكامل'],
  'Ex. 06 12 34 56 78': ['e.g. 06 12 34 56 78', 'مثال: 06 12 34 56 78'],
  'Ex. Casablanca': ['e.g. Casablanca', 'مثال: الدار البيضاء'],
  'Quartier, rue, numéro, repère': ['Area, street, number, landmark', 'الحي، الشارع، الرقم، علامة مميزة'],
  'Heure de passage, étage, autre numéro…': ['Delivery time, floor, other number…', 'وقت التسليم، الطابق، رقم آخر…'],
  'Champ obligatoire': ['Required', 'حقل إلزامي'],
  'Numéro incomplet': ['Incomplete number', 'رقم غير مكتمل'],
  'Enregistrer la livraison': ['Save delivery', 'تسجيل التوصيل'],
  'Retour': ['Back', 'رجوع'],
  'Fermer': ['Close', 'إغلاق'],
};
const tr = (s) => {
  const C = window.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  if (own && (lang === 'en' || lang === 'ar')) return own[lang === 'en' ? 0 : 1];
  return C && typeof C.tr === 'function' ? C.tr(s) : s;
};

/* Les villes proposées en saisie : une aide, pas une liste fermée. */
const CITIES = ['Casablanca', 'Rabat', 'Salé', 'Témara', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda',
  'Kénitra', 'Tétouan', 'Mohammédia', 'El Jadida', 'Nador', 'Safi', 'Béni Mellal', 'Khouribga', 'Settat', 'Berrechid',
  'Laâyoune', 'Essaouira', 'Larache', 'Ksar El Kébir', 'Taza', 'Errachidia', 'Ouarzazate', 'Dakhla', 'Al Hoceïma', 'Guelmim'];
/* Les champs, dans l'ordre de la fiche. `need` : obligatoire. */
const FIELDS = [
  { k: 'name', label: 'Nom du client', ph: 'Prénom et nom', need: true, ac: 'name' },
  { k: 'phone', label: 'Téléphone', ph: 'Ex. 06 12 34 56 78', need: true, ac: 'tel', type: 'tel' },
  { k: 'city', label: 'Ville', ph: 'Ex. Casablanca', need: true, ac: 'address-level2', list: true },
  { k: 'address', label: 'Adresse', ph: 'Quartier, rue, numéro, repère', need: true, ac: 'street-address', area: 2 },
  { k: 'note', label: 'Commentaire', ph: 'Heure de passage, étage, autre numéro…', need: false, area: 2 },
];

function css() {
  if (document.getElementById('bqdc-css')) return;
  const s = document.createElement('style');
  s.id = 'bqdc-css';
  s.textContent = [
    '.bqdc-form{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin:14px 0 4px;text-align:start;}',
    '.bqdc-f{display:flex;flex-direction:column;gap:5px;min-width:0;}',
    '.bqdc-f.wide{grid-column:1 / -1;}',
    '.bqdc-f label{font-size:13px;font-weight:600;color:var(--ink-2,#3D4441);}',
    '.bqdc-f label small{font-weight:400;color:var(--ink-3,#6F6C65);}',
    '.bqdc-f input,.bqdc-f textarea{width:100%;box-sizing:border-box;min-height:46px;padding:10px 12px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:16px;color:inherit;resize:vertical;}',
    '.bqdc-f textarea{min-height:64px;}',
    '.bqdc-f input:focus,.bqdc-f textarea:focus{outline:2px solid var(--atlas,#0B6E4F);outline-offset:1px;border-color:var(--atlas,#0B6E4F);}',
    '.bqdc-f [aria-invalid="true"]{border-color:var(--danger,#B42318);}',
    '.bqdc-err{font-size:12.5px;color:var(--danger,#B42318);min-height:0;}',
    '.bqdc-err:empty{display:none;}',
    '.bqdc-hint{font-size:12.5px;color:var(--ink-3,#6F6C65);margin:6px 0 0;}',
    '@media (max-width:560px){.bqdc-form{grid-template-columns:1fr;}}',
  ].join('\n');
  document.head.appendChild(s);
}

const digits = (v) => String(v || '').replace(/\D/g, '');

/* o : { amount, fmtMAD, esc, icons, closeBtns, prev, back, done(card) } */
export function bqDeliveryCard(el, o) {
  css();
  const esc = o.esc;
  const prev = o.prev || {};
  const field = (f) => {
    const id = 'bqdc-' + f.k;
    const attrs = ' id="' + id + '" name="' + f.k + '" autocomplete="' + (f.ac || 'off') + '" placeholder="' + esc(tr(f.ph)) + '"'
      + (f.need ? ' aria-required="true"' : '') + ' aria-describedby="' + id + '-err"';
    const val = esc(prev[f.k] || '');
    const input = f.area
      ? '<textarea' + attrs + ' rows="' + f.area + '">' + val + '</textarea>'
      : '<input' + attrs + ' type="' + (f.type || 'text') + '"' + (f.type === 'tel' ? ' inputmode="tel"' : '') + (f.list ? ' list="bqdc-cities"' : '') + ' value="' + val + '">';
    return '<div class="bqdc-f' + (f.area ? ' wide' : '') + '"><label for="' + id + '">' + esc(tr(f.label))
      + (f.need ? '' : ' <small>· ' + esc(tr('facultatif')) + '</small>') + '</label>' + input
      + '<span class="bqdc-err" id="' + id + '-err" role="alert"></span></div>';
  };
  const sheet = () => '<button class="bq-modal-x" data-bq-close aria-label="' + esc(tr('Fermer')) + '"><i data-lucide="x"></i></button>'
    + '<h3 class="modal-title">' + esc(tr('Livraison · destinataire')) + '</h3>'
    + '<p class="modal-subtle">' + esc(o.fmtMAD(o.amount)) + '</p>'
    + '<form class="bqdc-form" id="bqdc-form" novalidate>' + FIELDS.map(field).join('')
    + '<datalist id="bqdc-cities">' + CITIES.map((c) => '<option value="' + esc(c) + '"></option>').join('') + '</datalist></form>'
    + '<p class="bqdc-hint">' + esc(tr('Ces informations restent sur la commande pour la retrouver en cas de retour. Le client n’entre pas dans le carnet de fidélité.')) + '</p>'
    + '<div class="bq-sheet-foot"><button class="bq-btn secondary" type="button" id="bqdc-back">' + esc(tr('Retour')) + '</button>'
    + '<button class="cash-confirm" type="submit" form="bqdc-form" id="bqdc-ok">' + esc(tr('Enregistrer la livraison')) + ' · ' + esc(o.fmtMAD(o.amount)) + '</button></div>';
  el.innerHTML = sheet();
  if (o.icons) o.icons();
  if (o.closeBtns) o.closeBtns();
  const form = el.querySelector('#bqdc-form');
  el.querySelector('#bqdc-back').onclick = () => o.back();
  const check = (f, show) => {
    const node = form.elements[f.k];
    const v = String(node.value || '').trim();
    let err = '';
    if (f.need && !v) err = tr('Champ obligatoire');
    else if (f.k === 'phone' && digits(v).length < 8) err = tr('Numéro incomplet');
    if (show) {
      node.setAttribute('aria-invalid', err ? 'true' : 'false');
      el.querySelector('#bqdc-' + f.k + '-err').textContent = err;
    }
    return !err;
  };
  /* Une erreur affichée s'efface dès que le champ devient juste. */
  form.addEventListener('input', (e) => {
    const f = FIELDS.find((x) => x.k === (e.target && e.target.name));
    if (f && e.target.getAttribute('aria-invalid') === 'true') check(f, true);
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const bad = FIELDS.filter((f) => !check(f, true));
    if (bad.length) { form.elements[bad[0].k].focus(); return; }
    const card = {};
    FIELDS.forEach((f) => { card[f.k] = String(form.elements[f.k].value || '').replace(/\s+/g, ' ').trim(); });
    o.done(card);
  };
  const first = FIELDS.find((f) => !String(prev[f.k] || '').trim());
  try { form.elements[(first || FIELDS[0]).k].focus(); } catch (_) {}
}
