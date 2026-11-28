/* Inventaire intelligent (owner, 28 nov. 2026, pour Mabs Outfitters) : un
   interrupteur God mode, `features.smartInventory`, éteint par défaut.
   Allumé, la fiche « Nouveau produit » de la caisse boutique commence par la
   catégorie, propose une sous-catégorie facultative, et dès qu'une catégorie
   est choisie le nom reçoit la référence suivante de cette catégorie :
   « Jeans » donne JEN0153 quand JEN0152 est la plus haute déjà vue.

   La référence, c'est le nom du produit, comme Mabs nommait déjà ses
   articles (« JEN0086/90 »), sans la barre désormais : préfixe + 4 chiffres.
     · Le préfixe est celui que la catégorie porte déjà le plus souvent dans
       ses noms (et ceux de ses sous-catégories) ; à défaut, les trois
       premières lettres de son nom (« Chemise » → CHE).
     · Le numéro suit le plus haut numéro déjà vu pour ce préfixe dans TOUT le
       catalogue, archives comprises, quel que soit son nombre de zéros ou ce
       qui suit (« JEN00152/90 » compte pour 152). Jamais un numéro déjà pris.
     · Juste avant l'enregistrement, la référence proposée est recalculée :
       une autre caisse a pu prendre ce numéro entre-temps (synchro).
   La sous-catégorie est une vraie catégorie, rangée sous sa mère
   (`parentId`, un seul niveau : functions/api/_rules-catalog.js). */

const T = {
  fr: { sub: 'Sous-catégorie', opt: 'facultatif', none: 'Aucune', add: '+ Nouvelle sous-catégorie', addPh: 'Nom de la sous-catégorie',
    addOk: 'Ajouter', first: 'Choisissez d’abord la catégorie', hint: (r) => `Référence suivante : ${r}. Vous pouvez la modifier.` },
  en: { sub: 'Subcategory', opt: 'optional', none: 'None', add: '+ New subcategory', addPh: 'Subcategory name',
    addOk: 'Add', first: 'Choose the category first', hint: (r) => `Next reference: ${r}. You can change it.` },
  ar: { sub: 'الفئة الفرعية', opt: 'اختياري', none: 'بدون', add: '+ فئة فرعية جديدة', addPh: 'اسم الفئة الفرعية',
    addOk: 'إضافة', first: 'اختر الفئة أولاً', hint: (r) => `المرجع التالي: ${r}. يمكنك تغييره.` },
};

/* « JEN0086/90 », « Jen0057MX », « JACK002/20 » → { prefix, n }. « ZARA/136/800 »
   n'est pas une référence de cette forme. */
const REF = /^\s*([A-Za-z]{2,6})[\s-]*(\d{1,6})/;
export function parseRef(name) {
  const m = REF.exec(String(name == null ? '' : name));
  return m ? { prefix: m[1].toUpperCase(), n: parseInt(m[2], 10) } : null;
}
const pad = (n) => String(n).padStart(4, '0');
function lettersOf(name) {
  const w = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z\s]/g, ' ').trim().split(/\s+/)[0] || '';
  return w.length >= 2 ? w.slice(0, 3).toUpperCase() : 'REF';
}

/* Le préfixe d'une catégorie : celui que ses noms portent le plus souvent. */
export function prefixFor(catId, products, categories) {
  const c = (categories || []).find((x) => x.id === catId);
  if (!c) return '';
  const ids = new Set([c.id, ...(categories || []).filter((x) => x.parentId === c.id).map((x) => x.id)]);
  const count = new Map();
  for (const p of products || []) {
    if (!ids.has(p.categoryId)) continue;
    const r = parseRef(p.name);
    if (r) count.set(r.prefix, (count.get(r.prefix) || 0) + 1);
  }
  let best = '', most = 0;
  for (const [k, v] of count) if (v > most) { best = k; most = v; }
  return best || lettersOf(c.name);
}

/* La référence suivante pour une catégorie, jamais une déjà prise. */
export function nextReference(catId, products, categories) {
  const prefix = prefixFor(catId, products, categories);
  if (!prefix) return null;
  const used = new Set();
  let max = 0;
  for (const p of products || []) {
    const r = parseRef(p.name);
    if (r && r.prefix === prefix) { used.add(r.n); if (r.n > max) max = r.n; }
  }
  let n = max + 1;
  while (used.has(n)) n++;
  return { prefix, n, ref: prefix + pad(n) };
}

export function smartInventoryOn() {
  try {
    const c = window.KiwiConfig;
    if (c && c.features && c.features.smartInventory === true) return true;
    const env = window.KiwiEnv;
    if (env && typeof env.isReal === 'function' && env.isReal()) return false;
    return localStorage.getItem('kiwiSmartInventory') === '1';   // démo et tests seulement
  } catch (_) { return false; }
}

/* Monte le parcours sur la fiche « Nouveau produit » ouverte `el` (caisse
   boutique, pos-boutique/inventory.js). o : { cat (KiwiBoutiqueCatalog), lang }.
   Rend la catégorie retenue par catIn.__kiwiSmartCat() : la sous-catégorie si
   elle est choisie, sinon la catégorie. */
export function mountSmartInventory(el, o) {
  const cat = o && o.cat;
  const nameIn = el && el.querySelector('[data-bqx-name]');
  const catIn = el && el.querySelector('[data-bqx-cat]');
  if (!cat || !nameIn || !catIn || catIn.__kiwiSmartCat) return null;   // la fenêtre est réutilisée : l'état vit sur le select de cette fiche
  const t = T[o.lang] || T.fr;
  const nameF = nameIn.closest('.bqx-pf-f'), catF = catIn.closest('.bqx-pf-f');
  /* La catégorie d'abord, par l'ordre visuel seulement : le brouillon de la
     fiche (boutique-drafts.js) retrouve ses champs par leur rang dans le DOM. */
  const sec = catF && catF.parentNode;
  if (sec && nameF && nameF.parentNode === sec) { sec.classList.add('si-sec'); catF.setAttribute('data-si-cat', ''); nameF.setAttribute('data-si-name', ''); }
  const all = () => cat.listCategories();
  const tops = () => { const ids = new Set(all().map((c) => c.id)); return all().filter((c) => !c.parentId || !ids.has(c.parentId)); };
  const kids = (id) => all().filter((c) => c.parentId === id);
  const products = () => cat.listProducts({ includeArchived: true });
  const node = (tag, attrs, text) => { const n = document.createElement(tag); Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v)); if (text != null) n.textContent = text; return n; };

  /* La liste des catégories ne garde que les mères ; une catégorie déjà
     choisie qui est une fille (brouillon, filtre de l'inventaire) choisit sa
     mère, et la fille dans la sous-catégorie. */
  const was = catIn.value;
  const wasCat = all().find((c) => c.id === was);
  const keepNone = catIn.querySelector('option[value=""]');
  catIn.textContent = '';
  if (keepNone) catIn.appendChild(keepNone);
  tops().forEach((c) => catIn.appendChild(node('option', { value: c.id }, c.name)));
  catIn.value = wasCat ? (wasCat.parentId && tops().some((c) => c.id === wasCat.parentId) ? wasCat.parentId : wasCat.id) : '';
  let subPick = wasCat && wasCat.parentId ? wasCat.id : '';

  const lab = node('span', { class: 'bqx-pf-l' }, t.sub + ' ');
  lab.appendChild(node('small', { class: 'bqx-pf-opt' }, t.opt));
  const sub = node('select', { class: 'bqx-pf-in', 'data-si-sub': '' });
  const addRow = node('span', { class: 'si-add', hidden: '' });
  const addIn = node('input', { class: 'bqx-pf-in', 'data-si-add-name': '', maxlength: '60', autocomplete: 'off', placeholder: t.addPh });
  const addOk = node('button', { type: 'button', class: 'bqx-pf-btn', 'data-si-add-ok': '' }, t.addOk);
  addRow.append(addIn, addOk);
  const subF = node('div', { class: 'bqx-pf-f', 'data-si-sub-f': '', 'data-draft-skip': '' });
  subF.append(lab, sub, addRow);
  if (catF) catF.after(subF);
  const hint = node('span', { class: 'bqx-pf-hint', 'data-si-hint': '' });
  nameIn.after(hint);
  const style = node('style', {}, '.kbs-form .si-sec{display:flex;flex-direction:column}.kbs-form .si-sec>*{order:5}.kbs-form .si-sec>h4{order:0}.kbs-form .si-sec>[data-si-cat]{order:1}'
    + '.kbs-form .si-sec>[data-si-sub-f]{order:2}.kbs-form .si-sec>[data-si-name]{order:3}.kbs-form .bqx-pf [data-si-sub-f][hidden]{display:none}'
    + '.kbs-form .si-add{display:flex;gap:8px;margin-top:4px}.kbs-form .bqx-pf .si-add[hidden]{display:none}.kbs-form .si-add .bqx-pf-in{flex:1}.kbs-form .bqx-pf-opt{font-weight:400;color:var(--n-500)}');
  subF.appendChild(style);

  const paintSub = () => {
    const parent = catIn.value;
    subF.hidden = !parent;
    sub.textContent = '';
    sub.appendChild(node('option', { value: '' }, t.none));
    kids(parent).forEach((c) => sub.appendChild(node('option', { value: c.id }, c.name)));
    sub.appendChild(node('option', { value: '__new' }, t.add));
    sub.value = kids(parent).some((c) => c.id === subPick) ? subPick : '';
    addRow.hidden = true;
  };

  /* La référence : posée dans le nom tant que le nom est vide ou porte encore
     la référence proposée ; un nom tapé à la main n'est jamais remplacé. */
  let auto = '';
  const setName = (v) => { nameIn.value = v; nameIn.dispatchEvent(new Event('input', { bubbles: true })); };
  const proposeRef = () => {
    const parent = catIn.value;
    const nx = parent ? nextReference(parent, products(), all()) : null;
    const typed = nameIn.value.trim();
    if (nx && (!typed || typed === auto)) { auto = nx.ref; setName(nx.ref); }
    else if (!nx && typed && typed === auto) { auto = ''; setName(''); }
    hint.textContent = nx ? t.hint(nx.ref) : '';
    nameIn.placeholder = parent ? nameIn.getAttribute('data-si-ph') || nameIn.placeholder : t.first;
  };
  nameIn.setAttribute('data-si-ph', nameIn.placeholder);

  catIn.addEventListener('change', () => { subPick = ''; paintSub(); proposeRef(); });
  sub.addEventListener('change', () => {
    if (sub.value === '__new') { addRow.hidden = false; addIn.value = ''; addIn.focus(); return; }
    subPick = sub.value; addRow.hidden = true;
  });
  const addSub = () => {
    const name = addIn.value.trim(), parent = all().find((c) => c.id === catIn.value);
    if (!name || !parent) { addIn.focus(); return; }
    const same = kids(parent.id).find((c) => c.name.toLowerCase() === name.toLowerCase());
    const child = same || cat.addCategory(name, parent.color);
    if (child && !same && cat.setCategoryParent) cat.setCategoryParent(child.id, parent.id);
    subPick = child ? child.id : '';
    paintSub();
  };
  addOk.addEventListener('click', addSub);
  addIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); addSub(); } });

  /* Juste avant l'enregistrement (bouton ou Entrée) : une autre caisse a pu
     prendre le numéro depuis l'ouverture de la fiche. */
  const fresh = () => { if (auto && nameIn.value.trim() === auto) proposeRef(); };
  el.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#bqi-n-save')) fresh(); }, true);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('input.bqx-pf-in') && e.target !== addIn) fresh(); }, true);

  catIn.__kiwiSmartCat = () => (subPick && kids(catIn.value).some((c) => c.id === subPick) ? subPick : catIn.value);
  paintSub();
  proposeRef();
  return { refresh: proposeRef, category: catIn.__kiwiSmartCat };
}
