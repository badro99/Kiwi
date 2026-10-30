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
  'Choisissez une ville de la liste Ozon': ['Pick a city from the Ozon list', 'اختر مدينة من قائمة أوزون'],
  'Numéro marocain attendu': ['Moroccan number expected', 'يجب إدخال رقم مغربي'],
  'Tapez pour chercher une ville Ozon': ['Type to search an Ozon city', 'اكتب للبحث عن مدينة أوزون'],
  'Aucune ville trouvée': ['No city found', 'لم يتم العثور على مدينة'],
  '+ 50 MAD de livraison · le client paie': ['+ 50 MAD delivery · the customer pays', '+ 50 درهم توصيل · يدفع الزبون'],
  'Enregistrer et envoyer à Ozon': ['Save and send to Ozon', 'تسجيل وإرسال إلى أوزون'],
  'Le colis Ozon se crée tout seul à l’enregistrement, avec ces informations. Le client n’entre pas dans le carnet de fidélité.': ['The Ozon parcel is created automatically when you save, with these details. The customer is not added to the loyalty book.', 'يُنشأ طرد أوزون تلقائياً عند التسجيل بهذه المعلومات. لا يُضاف الزبون إلى دفتر الوفاء.'],
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
  { k: 'city', label: 'Ville', ph: 'Ex. Casablanca', need: true, list: true, area: 0, wide: true },
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
    '.bqdc-f.combo{position:relative;}',
    '.bqdc-sug{position:absolute;z-index:5;left:0;right:0;top:calc(100% - 2px);margin:0;padding:4px;list-style:none;max-height:300px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;background:var(--paper-elev,#FFFDFA);border:1px solid var(--line,#E2DDD2);border-radius:10px;box-shadow:0 10px 28px rgba(10,15,13,.12);}',
    '.bqdc-sug[hidden]{display:none;}',
    '.bqdc-sug li{padding:10px 12px;border-radius:8px;font-size:15px;cursor:pointer;color:var(--ink,#0A0F0D);}',
    '.bqdc-sug li[aria-selected="true"],.bqdc-sug li:hover{background:var(--paper-soft,#F1EEE7);}',
    '.bqdc-sug li.none{color:var(--ink-3,#6F6C65);cursor:default;background:none;}',
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
const fold = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/* Le format qu'Ozon accepte (functions/api/ozon/parcels.js › PHONE_RE). */
const OZON_PHONE = /^(?:\+?212|0)?[5-7]\d{8}$/;
const CUSTOMER_FEE = 50;   // MAD, ce que le client paie pour la livraison, partout

/* o : { amount, fmtMAD, esc, icons, closeBtns, prev, back, done(card),
 *       ozon?: { connected: Promise<boolean>, cities: () => Promise<[{id, name}]> } }
 * Avec Ozon relié (boutique, 30 oct. 2026) : la ville se choisit dans la liste
 * Ozon, le téléphone doit être marocain, et le colis se crée tout seul quand
 * la vente arrive au serveur (functions/api/ozon/parcels.js › autoParcel). */
export function bqDeliveryCard(el, o) {
  css();
  let ozonCities = null;
  const esc = o.esc;
  const prev = o.prev || {};
  const field = (f) => {
    const id = 'bqdc-' + f.k;
    /* La ville ne porte pas name="city" : Chrome y collait sa propre liste
       d'adresses par-dessus la nôtre (30 oct. 2026). */
    const attrs = ' id="' + id + '" name="' + (f.list ? 'bqdc-ville' : f.k) + '" autocomplete="' + (f.ac || 'off') + '" placeholder="' + esc(tr(f.ph)) + '"'
      + (f.list ? ' role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="bqdc-sug"' : '')
      + (f.need ? ' aria-required="true"' : '') + ' aria-describedby="' + id + '-err"';
    const val = esc(prev[f.k] || '');
    const input = f.area
      ? '<textarea' + attrs + ' rows="' + f.area + '">' + val + '</textarea>'
      : '<input' + attrs + ' type="' + (f.type || 'text') + '"' + (f.type === 'tel' ? ' inputmode="tel"' : '') + ' value="' + val + '">' + (f.list ? '<ul class="bqdc-sug" id="bqdc-sug" role="listbox" hidden></ul>' : '');
    return '<div class="bqdc-f' + (f.area || f.wide ? ' wide' : '') + (f.list ? ' combo' : '') + '"><label for="' + id + '">' + esc(tr(f.label))
      + (f.need ? '' : ' <small>· ' + esc(tr('facultatif')) + '</small>') + '</label>' + input
      + '<span class="bqdc-err" id="' + id + '-err" role="alert"></span></div>';
  };
  const sheet = () => '<button class="bq-modal-x" data-bq-close aria-label="' + esc(tr('Fermer')) + '"><i data-lucide="x"></i></button>'
    + '<h3 class="modal-title">' + esc(tr('Livraison · destinataire')) + '</h3>'
    + '<p class="modal-subtle">' + esc(o.fmtMAD(o.amount)) + '</p>'
    + '<form class="bqdc-form" id="bqdc-form" novalidate>' + FIELDS.map(field).join('')
    + '</form>'
    + '<p class="bqdc-hint">' + esc(tr('Ces informations restent sur la commande pour la retrouver en cas de retour. Le client n’entre pas dans le carnet de fidélité.')) + '</p>'
    + '<div class="bq-sheet-foot"><button class="bq-btn secondary" type="button" id="bqdc-back">' + esc(tr('Retour')) + '</button>'
    + '<button class="cash-confirm" type="submit" form="bqdc-form" id="bqdc-ok">' + esc(tr('Enregistrer la livraison')) + ' · ' + esc(o.fmtMAD(o.amount)) + '</button></div>';
  el.innerHTML = sheet();
  if (o.icons) o.icons();
  if (o.closeBtns) o.closeBtns();
  const form = el.querySelector('#bqdc-form');
  const nodeOf = (k) => form.querySelector('#bqdc-' + k);
  el.querySelector('#bqdc-back').onclick = () => o.back();
  const check = (f, show) => {
    const node = nodeOf(f.k);
    const v = String(node.value || '').trim();
    let err = '';
    if (f.need && !v) err = tr('Champ obligatoire');
    else if (f.k === 'phone' && digits(v).length < 8) err = tr('Numéro incomplet');
    else if (f.k === 'phone' && ozonCities && !OZON_PHONE.test(v.replace(/[\s.-]/g, ''))) err = tr('Numéro marocain attendu');
    else if (f.k === 'city' && ozonCities && !ozonCities.find((c) => fold(c.name) === fold(v))) err = tr('Choisissez une ville de la liste Ozon');
    if (show) {
      node.setAttribute('aria-invalid', err ? 'true' : 'false');
      el.querySelector('#bqdc-' + f.k + '-err').textContent = err;
    }
    return !err;
  };
  /* Une erreur affichée s'efface dès que le champ devient juste. */
  form.addEventListener('input', (e) => {
    const f = FIELDS.find((x) => e.target && e.target.id === 'bqdc-' + x.k);
    if (f && e.target.getAttribute('aria-invalid') === 'true') check(f, true);
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const bad = FIELDS.filter((f) => !check(f, true));
    if (bad.length) { nodeOf(bad[0].k).focus(); return; }
    const card = {};
    FIELDS.forEach((f) => { card[f.k] = String(nodeOf(f.k).value || '').replace(/\s+/g, ' ').trim(); });
    const oc = ozonCities && ozonCities.find((c) => fold(c.name) === fold(card.city));
    if (oc) { card.city = oc.name; card.cityId = oc.id; }
    o.done(card);
  };
  /* La liste des villes : la nôtre, claire, sous le champ, et toute la liste
     défile au doigt. Celles qui commencent par la frappe passent devant. Un
     glissé fait défiler sans choisir ni fermer : on choisit au tap (click). */
  const cityIn = nodeOf('city');
  const sug = form.querySelector('#bqdc-sug');
  let hits = [];
  let cur = -1;
  const names = () => (ozonCities ? ozonCities.map((c) => c.name) : CITIES);
  const closeSug = () => { sug.hidden = true; cityIn.setAttribute('aria-expanded', 'false'); cur = -1; };
  const paint = () => {
    sug.innerHTML = hits.length
      ? hits.map((n, i) => '<li role="option" id="bqdc-o' + i + '" data-i="' + i + '" aria-selected="' + (i === cur) + '">' + esc(n) + '</li>').join('')
      : '<li class="none">' + esc(tr('Aucune ville trouvée')) + '</li>';
    if (cur >= 0) cityIn.setAttribute('aria-activedescendant', 'bqdc-o' + cur); else cityIn.removeAttribute('aria-activedescendant');
    const on = sug.querySelector('[aria-selected="true"]');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  };
  const openSug = () => {
    const q = fold(cityIn.value);
    const all = names();
    const starts = [];
    const has = [];
    for (const n of all) { const f = fold(n); if (!q || f.startsWith(q)) starts.push(n); else if (f.includes(q)) has.push(n); }
    hits = starts.concat(has);
    if (q && hits.length === 1 && fold(hits[0]) === q) { closeSug(); return; }
    cur = hits.length ? 0 : -1;
    paint();
    sug.scrollTop = 0;
    sug.hidden = false;
    cityIn.setAttribute('aria-expanded', 'true');
  };
  const pick = (i) => {
    if (hits[i] == null) return;
    cityIn.value = hits[i];
    closeSug();
    if (cityIn.getAttribute('aria-invalid') === 'true') check(FIELDS.find((x) => x.k === 'city'), true);
    const next = nodeOf('address');
    if (next && !next.value) next.focus();
  };
  cityIn.addEventListener('input', openSug);
  cityIn.addEventListener('focus', openSug);
  let inList = false;
  cityIn.addEventListener('blur', () => setTimeout(() => { if (!inList) closeSug(); }, 150));
  sug.addEventListener('pointerdown', (e) => {
    inList = true;
    if (e.pointerType === 'mouse') e.preventDefault();   // la souris garde le focus dans le champ
  });
  const release = () => setTimeout(() => { inList = false; }, 400);
  sug.addEventListener('pointerup', release);
  sug.addEventListener('pointercancel', release);
  sug.addEventListener('scroll', () => { inList = true; release(); }, { passive: true });
  el.addEventListener('pointerdown', (e) => {
    if (!sug.hidden && !e.target.closest('.bqdc-f.combo')) closeSug();
  });
  cityIn.addEventListener('keydown', (e) => {
    if (sug.hidden) { if (e.key === 'ArrowDown') { openSug(); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return;
      cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
      paint(); e.preventDefault();
    } else if (e.key === 'Enter' && cur >= 0) { pick(cur); e.preventDefault(); }
    else if (e.key === 'Escape') { closeSug(); e.stopPropagation(); e.preventDefault(); }
  });
  sug.addEventListener('click', (e) => {
    const li = e.target.closest && e.target.closest('li[data-i]');
    if (li) { inList = false; pick(Number(li.dataset.i)); }
  });
  /* Ozon relié : la liste de villes devient celle d'Ozon, et la fiche dit ce
     que le client paiera au livreur. Ozon absent ou muet : la fiche d'avant. */
  if (o.ozon && o.ozon.connected) {
    Promise.resolve(o.ozon.connected).then((yes) => (yes ? o.ozon.cities() : null)).then((list) => {
      if (!list || !list.length || !el.isConnected || !el.querySelector('#bqdc-form')) return;
      ozonCities = list;
      const city = nodeOf('city');
      if (city) city.placeholder = tr('Tapez pour chercher une ville Ozon');
      const sub = el.querySelector('.modal-subtle');
      if (sub) sub.textContent = o.fmtMAD(o.amount) + ' ' + tr('+ 50 MAD de livraison · le client paie') + ' ' + o.fmtMAD((Number(o.amount) || 0) + CUSTOMER_FEE);
      const hint = el.querySelector('.bqdc-hint');
      if (hint) hint.textContent = tr('Le colis Ozon se crée tout seul à l’enregistrement, avec ces informations. Le client n’entre pas dans le carnet de fidélité.');
      const ok = el.querySelector('#bqdc-ok');
      if (ok) ok.textContent = tr('Enregistrer et envoyer à Ozon') + ' · ' + o.fmtMAD(o.amount);
    }).catch(() => { /* Ozon muet : la fiche reste celle d'avant */ });
  }
  const first = FIELDS.find((f) => !String(prev[f.k] || '').trim());
  try { nodeOf((first || FIELDS[0]).k).focus(); } catch (_) {}
}
