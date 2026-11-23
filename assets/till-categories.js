/* Kiwi · LA CATÉGORIE D'UNE SORTIE DE CAISSE · assets/till-categories.js
 * ---------------------------------------------------------------------------
 * Pasta Corner, 23 nov. 2026 : 84 sorties du mois, chacune avec un motif tapé
 * à la main (« Khadar », « Gezar », « Saad »), et le patron devait les classer
 * une à une dans Dépenses. La caisse demande donc la catégorie au moment où
 * l'argent sort du tiroir, avec la même grille que la fiche du tableau de bord
 * (assets/expenses/sheet.js) : mêmes seize catégories, mêmes icônes Material.
 *
 * Partagé par la caisse restaurant (caisse-accounting/drawer.js, par import())
 * et la caisse maison (pos-maison/cash-moves.js). La catégorie part avec le
 * mouvement (`movementCategory`, functions/api/cash-sessions.js) ; le motif
 * reste du texte lisible : le détail tapé, sinon le nom de la catégorie.
 *
 * Le dépôt en banque n'est pas une dépense : c'est la dernière tuile, sans
 * catégorie, et son motif « Dépôt banque » est celui qu'engine.js met à part. */

/* Même ordre et mêmes clés qu'assets/expenses/engine.js › CATEGORIES
   (tools/till-categories-test.mjs le vérifie). */
export const CATEGORIES = ['meat', 'produce', 'grocery', 'drinks', 'hygiene', 'packaging', 'supplier', 'energy',
  'rent', 'repairs', 'transport', 'staff', 'marketing', 'equipment', 'taxes', 'other'];
export const BANK = 'bank';

export const ICON = {
  meat: 'kebab_dining', produce: 'eco', grocery: 'local_grocery_store', drinks: 'local_drink',
  hygiene: 'cleaning_services', packaging: 'inventory', supplier: 'local_shipping', energy: 'bolt',
  rent: 'storefront', repairs: 'handyman', transport: 'two_wheeler', staff: 'group',
  marketing: 'campaign', equipment: 'skillet', taxes: 'gavel', other: 'more_horiz', bank: 'account_balance',
};

/* [français, anglais, arabe]. Le français est aussi le motif enregistré quand
   rien n'est tapé : c'est ce que le Z et le tableau de bord relisent. */
const WORDS = {
  meat: ['Viande', 'Meat', 'لحوم'],
  produce: ['Fruits et légumes', 'Fruit and veg', 'خضر وفواكه'],
  grocery: ['Épicerie', 'Groceries', 'بقالة'],
  drinks: ['Boissons', 'Drinks', 'مشروبات'],
  hygiene: ['Hygiène et nettoyage', 'Cleaning', 'نظافة وتنظيف'],
  packaging: ['Emballages', 'Packaging', 'تغليف'],
  supplier: ['Fournisseurs', 'Suppliers', 'موردون'],
  energy: ['Énergie et gaz', 'Energy and gas', 'طاقة وغاز'],
  rent: ['Loyer', 'Rent', 'كراء'],
  repairs: ['Réparations', 'Repairs', 'إصلاحات'],
  transport: ['Transport et livraison', 'Transport and delivery', 'نقل وتوصيل'],
  staff: ['Personnel et avances', 'Staff and advances', 'الموظفون والتسبيقات'],
  marketing: ['Publicité', 'Advertising', 'إشهار'],
  equipment: ['Matériel', 'Equipment', 'معدات'],
  taxes: ['Taxes', 'Taxes', 'ضرائب'],
  other: ['Divers', 'Other', 'متفرقات'],
  bank: ['Dépôt banque', 'Bank deposit', 'إيداع بنكي'],
  pick: ['Pour quoi ?', 'What for?', 'لماذا؟'],
  detail: ['Détail', 'Details', 'التفاصيل'],
  detailPh: ['Ce qui a été payé (facultatif)', 'What was paid for (optional)', 'ما الذي دُفع (اختياري)'],
  detailNeed: ['Ce qui a été payé', 'What was paid for', 'ما الذي دُفع'],
  needCat: ['Choisissez une catégorie', 'Pick a category', 'اختر فئة'],
  needDetail: ['Précisez ce qui a été payé', 'Say what was paid for', 'اذكر ما الذي دُفع'],
};

export function lang() {
  try {
    const L = globalThis.window && globalThis.window.KiwiCaisseLang;
    const l = L && typeof L.get === 'function' ? L.get() : '';
    return l === 'en' || l === 'ar' ? l : 'fr';
  } catch (_) { return 'fr'; }
}
export function tr(key, l = lang()) {
  const w = WORDS[key];
  if (!w) return '';
  return w[l === 'en' ? 1 : l === 'ar' ? 2 : 0] || w[0];
}
export const isCategory = (c) => CATEGORIES.includes(c);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Ce que la caisse enregistre. Le détail tapé est le motif ; sans détail, le
   nom français de la catégorie. « Divers » sans détail ne dit rien : refusé,
   comme l'ancien « Autre » sans motif. */
export function reasonFor(pick, detail) {
  const d = String(detail == null ? '' : detail).trim().slice(0, 80);
  if (pick === BANK) return { ok: true, reason: d ? 'Dépôt banque · ' + d : 'Dépôt banque', category: '' };
  if (!isCategory(pick)) return { ok: false, error: 'needCat' };
  if (pick === 'other' && !d) return { ok: false, error: 'needDetail' };
  return { ok: true, reason: (d || WORDS[pick][0]).slice(0, 80), category: pick };
}

const CSS = `
.tc-k,.tc-grid,.tc-detail{flex:1 0 100%;min-width:0}
.tc-k{font-size:12px;font-weight:600;color:var(--ink-3,#555);margin:0}
.tc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 6px}
.tc-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:76px;padding:10px 6px;
  border-radius:14px;border:1px solid var(--line,#e4e1da);background:var(--surface,#fbfaf7);color:var(--ink,#0a0f0d);
  font-family:inherit;font-size:12.5px;font-weight:600;line-height:1.2;text-align:center;cursor:pointer;transition:background 150ms,border-color 150ms}
.tc-tile svg,.tc-tile i{width:24px;height:24px;color:var(--forest,#0b6e4f);fill:currentColor}
.tc-tile:hover{background:var(--paper-mute,#f1efe9)}
.tc-tile[aria-pressed="true"]{border-color:var(--forest,#0b6e4f);background:color-mix(in srgb,var(--forest,#0b6e4f) 10%,var(--surface,#fbfaf7));box-shadow:inset 0 0 0 1px var(--forest,#0b6e4f)}
.tc-tile.tc-bank{grid-column:span 2;flex-direction:row;min-height:48px;color:var(--ink-3,#555);font-weight:500}
.tc-detail{display:flex;flex-direction:column;gap:6px;margin:0}
.tc-detail label{font-size:12px;font-weight:600;color:var(--ink-3,#555)}
@media (max-width:420px){.tc-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.tc-tile.tc-bank{grid-column:span 3}}
`;
function ensureStyle(doc) {
  if (!doc || doc.getElementById('tc-style')) return;
  const s = doc.createElement('style');
  s.id = 'tc-style';
  s.append(doc.createTextNode(CSS));
  (doc.head || doc.documentElement).appendChild(s);
}

/* La grille et le champ « Détail », peints dans `host` (le conteneur des motifs
   de la feuille). Rend { read(), reset() } : read() donne { ok, reason,
   category } ou { ok:false, error, message }. Le choix est en mémoire ici, pas
   dans le DOM : un repeint de la langue ne le perd pas. */
export function mountPicker(host, opts = {}) {
  if (!host) return null;
  const doc = host.ownerDocument;
  ensureStyle(doc);
  let pick = '';
  const inputId = (opts.idPrefix || 'tc') + '-detail';
  const paint = () => {
    const keep = host.querySelector('#' + inputId);
    const detail = keep ? keep.value : '';
    const l = lang();
    const tile = (k) => `<button type="button" class="tc-tile${k === BANK ? ' tc-bank' : ''}" data-till-cat="${k}" aria-pressed="${pick === k}" data-nolang>`
      + `<i data-icon="${ICON[k]}" aria-hidden="true"></i><span>${esc(tr(k, l))}</span></button>`;
    host.innerHTML = `<div class="tc-k" data-nolang>${esc(tr('pick', l))}</div>
      <div class="tc-grid" role="group" aria-label="${esc(tr('pick', l))}">${[...CATEGORIES, BANK].map(tile).join('')}</div>
      <div class="tc-detail"><label for="${inputId}" data-nolang>${esc(tr(pick === 'other' ? 'detailNeed' : 'detail', l))}</label>
        <input class="cm-custom-input" id="${inputId}" type="text" maxlength="80" autocomplete="off" enterkeyhint="done"
          placeholder="${esc(tr(pick === 'other' ? 'detailNeed' : 'detailPh', l))}" data-nolang></div>`;
    const input = host.querySelector('#' + inputId);
    if (input) input.value = detail;
    try { const w = globalThis.window; if (w && w.lucide && w.lucide.createIcons) w.lucide.createIcons(); } catch (_) {}
  };
  host.onclick = (e) => {
    const b = e.target.closest && e.target.closest('[data-till-cat]');
    if (!b || !host.contains(b)) return;
    pick = b.dataset.tillCat;
    host.querySelectorAll('[data-till-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const l = lang();
    const lab = host.querySelector('.tc-detail label');
    const input = host.querySelector('#' + inputId);
    if (lab) lab.textContent = tr(pick === 'other' ? 'detailNeed' : 'detail', l);
    if (input) {
      input.placeholder = tr(pick === 'other' ? 'detailNeed' : 'detailPh', l);
      if (pick === 'other') input.focus();
    }
  };
  paint();
  return {
    read() {
      const input = host.querySelector('#' + inputId);
      const r = reasonFor(pick, input ? input.value : '');
      if (!r.ok) {
        r.message = tr(r.error);
        if (r.error === 'needDetail' && input) input.focus();
      }
      return r;
    },
    repaint: paint,
    get pick() { return pick; },
  };
}
