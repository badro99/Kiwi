/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LES TAILLES D'UN PRODUIT BOUTIQUE · un seul écran, deux surfaces
 * ---------------------------------------------------------------------------
 * Un carton de hoodies arrive. L'équipe crée le produit avec la quantité du
 * carton, puis, sur la même fenêtre au centre, écrit le nombre de pièces à côté
 * de chaque taille (XXS à XXL, ou les pointures). Kiwi crée un code-barres par
 * taille et imprime autant d'étiquettes que de pièces.
 *
 * Remplace le geste « Ajouter une variante » couleur × taille, que la plupart
 * des boutiques ne prenaient pas le temps de faire. Un produit = une couleur :
 * la couleur est dans le nom (« Hoodie noir »). Les déclinaisons créées ici
 * portent la couleur neutre ONE_COLOR, que les tickets et les étiquettes
 * taisent ; les anciens produits gardent leurs couleurs telles quelles.
 *
 * Règles du propriétaire (2026-10-29) :
 *  · à la création, la somme des tailles doit égaler la quantité totale, sinon
 *    rien n'est enregistré et un message le dit ;
 *  · une taille laissée à 0 n'est pas créée, elle n'apparaît donc pas à la
 *    caisse ; une taille vendue jusqu'à 0 reste une taille, et reste affichée ;
 *  · sur un produit existant, le nombre tapé s'AJOUTE au stock (réception).
 *
 * Module ES, importé par la caisse (pos-boutique/inventory.js) et par le
 * tableau de bord (pages-pro-boutique.js) : même balisage, même CSS.
 * ═══════════════════════════════════════════════════════════════════════════ */

import * as SPLIT from './boutique-size-split.js?v=4';
import * as CODES from './boutique-size-codes.js?v=3';
import * as COLORS from './boutique-size-colors.js?v=6';

export const ONE_COLOR = 'unique';
const GRID = {
  taille: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
  pointure: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
};
/* Taille unique (et tout type qui n'a pas de grille) : une seule ligne. */
export const hasGrid = (kind) => !!GRID[kind];
export const gridOf = (kind) => (GRID[kind] || ['TU']).slice();

const T = {
  fr: {
    total: 'Quantité totale', totalHint: 'Le nombre de pièces reçues. Vous les répartirez par taille juste après.',
    totalHintTu: 'Le nombre de pièces en stock.',
    totalErr: 'Indiquez un nombre entier de pièces, 1 ou plus.',
    size: 'Taille', tu: 'Taille unique', have: (n) => `${n} en stock`, add: 'Pièces', addMore: 'À ajouter',
    split: (a, b) => `${a} sur ${b} répartie${b > 1 ? 's' : ''}`,
    received: (n, one) => (n ? `${n} pièce${n > 1 ? 's' : ''} à ajouter` : one ? 'Écrivez le nombre de pièces reçues.' : 'Écrivez le nombre de pièces reçues à côté de chaque taille.'),
    mismatch: (a, b) => `Les tailles font ${a} pièce${a > 1 ? 's' : ''}, alors que la quantité totale est de ${b}. Corrigez les tailles pour enregistrer.`,
    none: 'Écrivez au moins une quantité.',
    bad: 'Un nombre entier de pièces, 0 ou plus.',
    hintCreate: 'Une taille laissée vide n’apparaît pas à la caisse.',
    save: 'Enregistrer', saving: 'Enregistrement…',
    saved: 'Stock enregistré', savedDesc: (n, c) => `${n} pièce${n > 1 ? 's' : ''} · ${c} code${c > 1 ? 's' : ''}-barres`,
    print: (n) => (n ? `Imprimer ${n} étiquette${n > 1 ? 's' : ''}` : 'Aucune étiquette à imprimer'),
    printDirty: 'Enregistrez avant d’imprimer.',
    printN: (n) => ['Imprimer', n > 1 ? 'étiquettes' : 'étiquette'], fresh: 'nouvelles pièces',
    printAll: (n) => `Tout le stock · ${n}`, lastIn: (n) => `Dernière réception : +${n} pièce${n > 1 ? 's' : ''}`,
    newCode: 'Code créé à l’enregistrement', noCode: 'Aucun code', reg: 'Code existant', del: 'Supprimer',
    out: 'Épuisée', empty: 'Aucune taille pour l’instant.',
    colors: 'Couleurs', addColor: 'Couleur', addColors: 'Plusieurs couleurs ?', noColor: 'Sans couleur', removeColor: (c) => `Retirer ${c}`,
    stockCol: 'En stock', after: (a, b) => `${a} → ${b} en stock`,
    dropAsk: (c) => `Retirer ${c} et ses tailles ?`, dropOk: 'Retirer', cancel: 'Annuler', dropTip: (c) => `Retirer ${c} (épuisée)`,
    codeKey: 'Codes-barres : après le 2, deux chiffres pour la couleur ; avant le dernier, deux pour la taille. Le milieu est celui de l’article.',
  },
  en: {
    total: 'Total quantity', totalHint: 'How many pieces came in. You split them by size right after.',
    totalHintTu: 'How many pieces are in stock.',
    totalErr: 'Enter a whole number of pieces, 1 or more.',
    size: 'Size', tu: 'One size', have: (n) => `${n} in stock`, add: 'Pieces', addMore: 'To add',
    split: (a, b) => `${a} of ${b} assigned`,
    received: (n, one) => (n ? `${n} piece${n > 1 ? 's' : ''} to add` : one ? 'Write how many pieces came in.' : 'Write how many pieces came in next to each size.'),
    mismatch: (a, b) => `The sizes add up to ${a} piece${a > 1 ? 's' : ''}, but the total quantity is ${b}. Fix the sizes to save.`,
    none: 'Enter at least one quantity.',
    bad: 'A whole number of pieces, 0 or more.',
    hintCreate: 'A size left empty does not show on the till.',
    save: 'Save', saving: 'Saving…',
    saved: 'Stock saved', savedDesc: (n, c) => `${n} piece${n > 1 ? 's' : ''} · ${c} barcode${c > 1 ? 's' : ''}`,
    print: (n) => (n ? `Print ${n} label${n > 1 ? 's' : ''}` : 'No labels to print'),
    printDirty: 'Save before printing.',
    printN: (n) => ['Print', n > 1 ? 'labels' : 'label'], fresh: 'new pieces',
    printAll: (n) => `Whole stock · ${n}`, lastIn: (n) => `Last delivery: +${n} piece${n > 1 ? 's' : ''}`,
    newCode: 'Code created on save', noCode: 'No code', reg: 'Existing code', del: 'Delete',
    out: 'Sold out', empty: 'No sizes yet.',
    colors: 'Colours', addColor: 'Colour', addColors: 'Several colours?', noColor: 'No colour', removeColor: (c) => `Remove ${c}`,
    stockCol: 'In stock', after: (a, b) => `${a} → ${b} in stock`,
    dropAsk: (c) => `Remove ${c} and its sizes?`, dropOk: 'Remove', cancel: 'Cancel', dropTip: (c) => `Remove ${c} (sold out)`,
    codeKey: 'Barcodes: after the 2, two digits for the colour; before the last, two for the size. The middle is the item’s.',
  },
  ar: {
    total: 'الكمية الإجمالية', totalHint: 'عدد القطع المستلمة. ستوزّعها حسب المقاس مباشرة بعد ذلك.',
    totalHintTu: 'عدد القطع في المخزون.',
    totalErr: 'أدخل عدداً صحيحاً من القطع، 1 أو أكثر.',
    size: 'المقاس', tu: 'مقاس واحد', have: (n) => `${n} في المخزون`, add: 'القطع', addMore: 'للإضافة',
    split: (a, b) => `${a} من ${b} موزّعة`,
    received: (n, one) => (n ? `${n} قطعة للإضافة` : one ? 'اكتب عدد القطع المستلمة.' : 'اكتب عدد القطع المستلمة بجانب كل مقاس.'),
    mismatch: (a, b) => `مجموع المقاسات ${a} قطعة، والكمية الإجمالية ${b}. صحّح المقاسات للحفظ.`,
    none: 'أدخل كمية واحدة على الأقل.',
    bad: 'عدد صحيح من القطع، 0 أو أكثر.',
    hintCreate: 'المقاس الفارغ لا يظهر في الصندوق.',
    save: 'حفظ', saving: 'جارٍ الحفظ…',
    saved: 'تم حفظ المخزون', savedDesc: (n, c) => `${n} قطعة · ${c} رمز شريطي`,
    print: (n) => (n ? `طباعة ${n} ملصق` : 'لا ملصقات للطباعة'),
    printDirty: 'احفظ قبل الطباعة.',
    printN: () => ['طباعة', 'ملصق'], fresh: 'القطع الجديدة',
    printAll: (n) => `كل المخزون · ${n}`, lastIn: (n) => `آخر استلام: +${n} قطعة`,
    newCode: 'يُنشأ الرمز عند الحفظ', noCode: 'بلا رمز', reg: 'رمز موجود', del: 'حذف',
    out: 'نفد', empty: 'لا مقاسات بعد.',
    colors: 'الألوان', addColor: 'لون', addColors: 'عدة ألوان؟', noColor: 'بلا لون', removeColor: (c) => `إزالة ${c}`,
    stockCol: 'في المخزون', after: (a, b) => `${a} ← ${b} في المخزون`,
    dropAsk: (c) => `إزالة ${c} ومقاساته؟`, dropOk: 'إزالة', cancel: 'إلغاء', dropTip: (c) => `إزالة ${c} (نفد)`,
    codeKey: 'الرموز الشريطية: بعد الرقم 2، رقمان للون؛ وقبل الأخير، رقمان للمقاس. الوسط خاص بالمنتج.',
  },
};
export const words = (lang) => T[lang] || T.fr;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* « 12 », «  », « 3,5 » → { n } entier ≥ 0, { empty }, ou { bad }. */
export function pieces(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { n: 0, empty: true };
  if (!/^\d{1,5}$/.test(s)) return { bad: true };
  return { n: parseInt(s, 10) };
}

/* Ce qu'une étiquette ou un ticket dit d'une déclinaison : la taille seule
   quand elle porte la couleur neutre, « Couleur · Taille » sinon. */
export function variantWords(v, lang) {
  if (!v) return '';
  if (String(v.colorId || '') !== ONE_COLOR) return `${v.colorLabel} · ${v.size}`;   // un ancien produit : comme avant
  return String(v.size || '') === 'TU' ? words(lang).tu : String(v.size || '');
}

/* Les lignes de l'écran. Les tailles existantes d'abord, dans l'ordre de la
   grille ; puis les tailles de la grille qui n'existent pas encore. Un ancien
   produit à plusieurs couleurs ne reçoit pas de lignes vides : on ne saurait
   pas de quelle couleur serait la nouvelle taille. */
/* L'option du commerçant ; hors compte réel (démo, essai local), la clé
   kiwiSizeColors = '1' de ce navigateur l'allume aussi. */
export function sizeColorsOn() {
  try {
    const c = typeof window !== 'undefined' ? window.KiwiConfig : null;
    if (c && c.features && c.features.boutiqueSizeColors === true) return true;
    const env = typeof window !== 'undefined' ? window.KiwiEnv : null;
    if (env && typeof env.isReal === 'function' && env.isReal()) return false;
    return localStorage.getItem('kiwiSizeColors') === '1';
  } catch (_) { return false; }
}

export function rows(cat, pid) {
  const d = cat.getProduct(pid);
  if (!d) return [];
  const kind = d.product.kind;
  const grid = gridOf(kind);
  const colorIds = [];
  d.variants.forEach((v) => { if (!colorIds.includes(String(v.colorId))) colorIds.push(String(v.colorId)); });
  const multi = colorIds.length > 1;
  const color = colorIds[0] || ONE_COLOR;
  const rank = (s) => { const i = grid.indexOf(String(s)); return i < 0 ? 999 : i; };
  const out = d.variants.slice()
    .sort((a, b) => rank(a.size) - rank(b.size))
    .map((v) => ({ key: v.id, size: String(v.size), colorId: String(v.colorId), variant: v, multi }));
  if (!multi) {
    grid.forEach((s) => {
      if (!out.some((r) => r.size === s)) out.push({ key: 'new:' + s, size: s, colorId: color, variant: null, multi });
    });
    out.sort((a, b) => rank(a.size) - rank(b.size));
  }
  return out;
}

let cssDone = false;
export function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const style = document.createElement('style');
  style.id = 'kiwi-boutique-sizes-css';
  style.textContent = `
.kbs { --kbs-card: color-mix(in srgb, var(--paper, #F7F5F0) 55%, #fff); --kbs-field: var(--paper, #F7F5F0); --kbs-line: var(--n-200, #E2DED5);
  display: grid; gap: 12px; color: var(--ink, #0A0F0D); font-family: var(--sans, 'Inter Tight', system-ui, sans-serif); }
html[data-theme="dark"] .kbs, body[data-vexel-mode="dark"] .kbs { --kbs-card: #151C18; --kbs-field: #0B100E; --kbs-line: #2A332E; }
.kbs-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 12px 14px; border: 1px solid var(--kbs-line); border-radius: 14px; background: var(--kbs-card); }
.kbs-top b { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.kbs-top span { font-size: 12.5px; color: var(--n-600, #5D6661); }
.kbs-count { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--n-700, #3E4642); }
.kbs-count.is-ok { color: var(--atlas, #0B6E4F); }
.kbs-count.is-over { color: var(--danger, #cb5238); }
.kbs-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--kbs-line); border-radius: 14px; background: var(--kbs-card); overflow: hidden; }
.kbs-row { display: grid; grid-template-columns: 64px minmax(0, 1fr) 112px; align-items: center; gap: 12px; padding: 10px 14px; }
.kbs-row + .kbs-row { border-top: 1px solid var(--kbs-line); }
.kbs-size { font-size: 15px; font-weight: 600; letter-spacing: .01em; }
.kbs-size small { display: block; font-size: 11.5px; font-weight: 500; color: var(--n-500, #77807B); letter-spacing: 0; }
.kbs-mid { display: grid; gap: 3px; min-width: 0; font-size: 12px; color: var(--n-600, #5D6661); }
.kbs-have { font-variant-numeric: tabular-nums; }
.kbs-have.is-out { color: var(--danger, #cb5238); font-weight: 600; }
.kbs-code { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
.kbs-code svg { height: 20px; width: auto; max-width: 120px; }
.kbs-code code { font-family: var(--mono, 'JetBrains Mono', ui-monospace, monospace); font-size: 11.5px; color: var(--n-700, #3E4642); }
.kbs-code .kbs-pending { color: var(--n-500, #77807B); }
.kbs-link { padding: 0; border: 0; background: none; color: var(--atlas, #0B6E4F); font: 600 11.5px var(--sans, inherit); cursor: pointer; }
.kbs-link:hover { text-decoration: underline; }
.kbs-del { justify-self: start; padding: 8px 0; margin: -8px 0; color: var(--danger, #B42318); font-weight: 500; }
.kbs-in { box-sizing: border-box; width: 100%; height: 42px; padding: 0 12px; border: 1px solid var(--kbs-line); border-radius: 10px; background: var(--kbs-field);
  color: var(--ink, #0A0F0D); font: 600 15px var(--sans, inherit); text-align: center; font-variant-numeric: tabular-nums; }
.kbs-add { position: relative; display: block; }
.kbs-add::before { content: '+'; position: absolute; inset-inline-start: 12px; top: 50%; transform: translateY(-50%); font: 700 16px var(--sans, inherit); color: var(--atlas, #0B6E4F); pointer-events: none; }
.kbs-add .kbs-in { padding-inline-start: 26px; border-style: dashed; background: color-mix(in srgb, var(--atlas, #0B6E4F) 5%, var(--kbs-field)); }
.kbs-add .kbs-in:focus, .kbs-add .kbs-in:not(:placeholder-shown) { border-style: solid; }
.kbs.is-restock .kbs-have { font-size: 14px; font-weight: 600; color: var(--ink, #0A0F0D); }
.kbs.is-restock .kbs-have.is-out { color: var(--danger, #cb5238); }
.kbm .kbs-add { max-width: 74px; margin: 0 auto; }
.kbm .kbs-add::before { inset-inline-start: 9px; }
.kbm .kbs-add .kbs-in { padding-inline-start: 20px; }
.kbs-have.is-up, .kbs.is-restock .kbs-have.is-up, .kbm td small.is-up { color: var(--atlas, #0B6E4F); font-weight: 600; }
.kbc-chip.is-ask { border-color: var(--danger, #cb5238); color: var(--danger, #cb5238); }
.kbc-chip.is-ask button.kbc-ok { width: auto; height: 22px; padding: 0 9px; border-radius: 999px; background: var(--danger, #cb5238); color: #fff; font: 600 12px var(--sans, inherit); }
.kbs-in::placeholder { color: var(--n-400, #9AA09D); font-weight: 400; }
.kbs-in:focus { outline: 0; border-color: var(--atlas, #0B6E4F); box-shadow: 0 0 0 3px color-mix(in srgb, var(--atlas, #0B6E4F) 16%, transparent); }
.kbs-in[aria-invalid="true"] { border-color: var(--danger, #cb5238); }
.kbs-colhead { display: grid; grid-template-columns: 64px minmax(0, 1fr) 112px; gap: 12px; padding: 0 14px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--n-500, #77807B); }
.kbs-colhead span:last-child { text-align: center; }
.kbs-msg { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--n-600, #5D6661); }
.kbs-msg.is-err { padding: 10px 12px; border-radius: 10px; color: var(--danger, #cb5238); font-weight: 600; background: color-mix(in srgb, var(--danger, #cb5238) 8%, transparent); }
.kbs-msg[hidden] { display: none; }
.kbs-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.kbs-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 42px; padding: 0 16px; border: 1px solid var(--kbs-line); border-radius: 12px;
  background: var(--kbs-field); color: var(--n-700, #3E4642); font: 600 13.5px var(--sans, inherit); cursor: pointer; }
.kbs-btn:hover:not(:disabled) { border-color: var(--atlas, #0B6E4F); color: var(--atlas, #0B6E4F); }
.kbs-btn.is-main { border-color: var(--riad, #053B2C); background: var(--atlas, #0B6E4F); color: #fff; }
.kbs-btn.is-main:hover:not(:disabled) { color: #fff; background: var(--riad, #053B2C); }
.kbs-btn:disabled { opacity: .5; cursor: not-allowed; }
.kbs-btn svg { width: 18px; height: 18px; fill: currentColor; }
.kbs-btn .kbs-n { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.kbs-top .kbs-last { font-weight: 700; color: var(--atlas, #0B6E4F); }
.kbs-btn:focus-visible, .kbs-link:focus-visible { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: 2px; }
@media (max-width: 560px) {
  .kbs-row, .kbs-colhead { grid-template-columns: 52px minmax(0, 1fr) 88px; gap: 10px; padding-inline: 12px; }
  .kbs-in { font-size: 16px; }
  .kbs-acts .kbs-btn { flex: 1 1 100%; }
}`;
  document.head.appendChild(style);
}

const CLOSE_SVG = '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>';
const PLUS_SVG = '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>';
const PRINT_SVG = '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M640-640v-120H320v120h-80v-200h480v200h-80Zm-480 80h640-640Zm560 100q17 0 28.5-11.5T760-500q0-17-11.5-28.5T720-540q-17 0-28.5 11.5T680-500q0 17 11.5 28.5T720-460Zm-80 260v-160H320v160h320Zm80 80H240v-160H80v-240q0-51 35-85.5t85-34.5h560q51 0 85.5 34.5T880-520v240H720v160Zm80-240v-160q0-17-11.5-28.5T760-560H200q-17 0-28.5 11.5T160-520v160h80v-80h480v80h80Z"/></svg>';

/* Monte l'écran des tailles dans `host`.
   o: { cat, pid, lang, target (création : quantité totale annoncée),
        barcodeSvg(code) → svg, primary(v) → code, label(pid, v) → étiquette,
        print(labels), register(vid), toast(title, desc), onSaved(),
        readOnly (la caisse sans le droit d'inventaire : on lit, on imprime) }
   Rend { refresh(), dirty() }. */
/* La dernière réception de chaque article, gardée après la fermeture de la
   fiche : la rouvrir pour imprimer ne sort que les nouvelles pièces, pas tout
   le stock (Santos, 31/10 : épuisé, +50, et 100 étiquettes sorties). Deux
   réceptions avant d'imprimer s'additionnent ; après l'impression, la
   suivante repart de zéro. */
const RKEY = 'kiwiLabelReceipt:';
const RECEIPTS = {};
const storeReceipt = (pid, r) => { RECEIPTS[pid] = r; try { localStorage.setItem(RKEY + pid, JSON.stringify(r)); } catch (_) { /* mémoire seule */ } return r; };
export function lastReceipt(pid) {
  if (!pid) return null;
  if (RECEIPTS[pid]) return RECEIPTS[pid];
  try { const r = JSON.parse(localStorage.getItem(RKEY + pid) || 'null'); if (r && r.got && typeof r.got === 'object') return (RECEIPTS[pid] = r); } catch (_) { /* rien de gardé */ }
  return null;
}
export function noteReceipt(pid, got) {
  const prev = lastReceipt(pid);
  const sum = Object.assign({}, prev && !prev.printed ? prev.got : {});
  Object.keys(got || {}).forEach((k) => { if (got[k] > 0) sum[k] = (sum[k] || 0) + got[k]; });
  return storeReceipt(pid, { at: Date.now(), printed: false, got: sum });
}
export function markReceiptPrinted(pid) { const r = lastReceipt(pid); if (r && !r.printed) storeReceipt(pid, Object.assign({}, r, { printed: true })); }
/* Étiquettes par taille : les pièces reçues (got) quand une réception est
   donnée, sinon le stock de chaque taille. La fiche et la ligne d'inventaire
   (pos-boutique/inventory.js) comptent avec cette même règle. */
export const labelCounts = (variants, got) => (variants || []).map((v) => [v, got ? (got[v.id] || 0) : Math.max(0, Math.floor(+v.stock || 0))]);
/* « Imprimer N étiquettes », le nombre mis à part ; « · nouvelles pièces » pour une réception. */
export function printLabelHtml(t, n, fresh) {
  if (!n) return esc(t.print(0));
  const [verb, noun] = t.printN(n);
  return `${esc(verb)} <b class="kbs-n">${n}</b> ${esc(noun)}${fresh ? ` · ${esc(t.fresh)}` : ''}`;
}

export function mount(host, o) {
  if (!host || !o || !o.cat) return null;
  css();
  const t = words(o.lang);
  const cat = o.cat;
  /* Par défaut : le moteur de codes-barres partagé (assets/barcode.js). */
  const KB = () => (typeof window !== 'undefined' && window.KiwiBarcode) || null;
  o = Object.assign({
    barcodeSvg: (code) => (KB() ? KB().svg(code, { height: 20, module: 1, showText: false }) : ''),
    primary: (v) => cat.primaryBarcode(v),
    print: (labels) => KB() && KB().printLabels(labels, { copies: 1 }),
  }, o);
  const pid = o.pid;
  let target = o.target > 0 ? Math.floor(o.target) : 0;
  let busy = false;
  const ro = !!o.readOnly;
  if (ro) target = 0;
  /* Les couleurs (boutique-size-colors.js) : une colonne par couleur. */
  const pal = COLORS.palette(cat);
  let cols = null;
  let cellList = [];
  let carry = null;   // { values, quick } : ce qui était tapé, repris après un ajout de couleur
  /* La répartition rapide et les couleurs s'allument par commerçant (option
     « boutiqueSizeColors » de la console). Éteinte : l'écran d'avant, à l'identique. */
  const rich = !ro && sizeColorsOn();

  const draw = () => {
    const d = cat.getProduct(pid);
    if (!d) { host.innerHTML = ''; return; }
    const creating = target > 0;
    if (rich && !cols) cols = COLORS.columns(cat, pid, o.lang, pal);
    if (rich) COLORS.css();
    cellList = ro ? [] : rich ? COLORS.cells(cat, pid, cols, gridOf(d.product.kind)) : rows(cat, pid);
    const list = ro ? rows(cat, pid) : rich ? cellList.map((c) => Object.assign({ multi: false }, c)) : cellList;
    const shown = ro ? list.filter((r) => r.variant) : list;
    const matrix = rich && cols.length > 1;
    const sizeList = [];
    shown.forEach((r) => { if (!sizeList.includes(r.size)) sizeList.push(r.size); });
    const colName = (c) => (c.unique ? t.noColor : c.label);
    const dot = (c) => `<span class="kbc-dot" style="--dot:${esc(c.unique || !c.hex ? '#E2DED4' : c.hex)}"></span>`;
    /* Les codes qui se lisent (boutique-size-codes.js) : le code de la couleur
       dans sa pastille, celui de la taille à côté d'elle, et dans chaque case le
       code-barres avec ces deux codes en vert. */
    const plan = rich ? CODES.planner(cat, pid, sizeList) : null;
    const famOf = (c) => (!c || c.unique ? 'unique' : (c.family || c.id));
    const digDot = (c) => `<span class="kbc-dot kbm-dig${c.unique || c.light || !c.hex ? ' is-light' : ''}" style="--dot:${esc(c.unique || !c.hex ? '#E2DED4' : c.hex)}">${plan && plan.item ? CODES.colorCode(famOf(c)) : ''}</span>`;
    const codeOf = (r) => {
      const code = r.variant ? o.primary(r.variant) : '';
      if (!code) return '';
      const bits = CODES.parts(code);
      if (!bits) return `<code class="kbm-code">${esc(code)}</code>`;
      return `<code class="kbm-code">${bits[0]}<b>${bits[1]}</b>${bits[2]}<b>${bits[3]}</b>${bits[4]}</code>`;
    };
    /* Supprimer une taille : la confirmation de la caisse (o.remove), jamais
       pendant la création ni en lecture seule. */
    const delOf = (r, label) => (!ro && !creating && o.remove && r.variant
      ? `<button type="button" class="kbs-link kbs-del" data-kbs-del="${esc(r.variant.id)}" aria-label="${esc(t.del)} · ${esc(label)}">${esc(t.del)}</button>` : '');
    /* Réassort : la case dit « + » et reste vide, pour qu'on ne la lise pas
       comme le stock. À la création, c'est la quantité : « 0 » reste. */
    const field = (key, col, aria) => {
      const i = `<input class="kbs-in" type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="${creating ? '0' : ''}" data-kbs-in="${esc(key)}" data-kbs-col="${esc(col)}" aria-label="${esc(aria)}" />`;
      return creating ? i : `<span class="kbs-add">${i}</span>`;
    };
    const anySmart = rich && shown.some((r) => r.variant && /<b>/.test(codeOf(r)));
    const rowsHtml = matrix ? '' : shown.map((r) => {
      const v = r.variant;
      const stock = v ? Math.max(0, +v.stock || 0) : 0;
      const code = v ? o.primary(v) : '';
      const sizeLabel = r.size === 'TU' ? t.tu : r.size;
      const colorLine = r.multi && v ? `<small>${esc(v.colorLabel || '')}</small>` : '';
      const have = v
        ? `<span class="kbs-have${stock ? '' : ' is-out'}" data-kbs-have="${esc(r.key)}" data-st="${stock}">${esc(stock ? t.have(stock) : t.out)}</span>`
        : '';
      const codeHtml = code
        ? `<span class="kbs-code">${o.barcodeSvg ? o.barcodeSvg(code) : ''}${rich ? codeOf(r) : `<code>${esc(code)}</code>`}</span>`
        : `<span class="kbs-code"><span class="kbs-pending">${esc(v ? t.noCode : t.newCode)}</span>${v && o.register ? `<button type="button" class="kbs-link" data-kbs-reg="${esc(v.id)}">${esc(t.reg)}</button>` : ''}</span>`;
      return `<li class="kbs-row" data-kbs-row="${esc(r.key)}">
        <span class="kbs-size">${esc(sizeLabel)}${colorLine}</span>
        <span class="kbs-mid">${have}${codeHtml}${delOf(r, sizeLabel + (r.multi && v ? ' · ' + (v.colorLabel || '') : ''))}</span>
        ${ro ? '<span></span>' : field(r.key, r.col || '', `${t.add} · ${sizeLabel}`)}
      </li>`;
    }).join('');
    const matrixHtml = !matrix ? '' : `<table class="kbm"><thead><tr><th></th>${cols.map((c) => `<th scope="col">${digDot(c)}${esc(colName(c))}<small data-kbm-tot="${esc(c.key)}"></small></th>`).join('')}</tr></thead><tbody>${sizeList.map((size) => {
      const sl = size === 'TU' ? t.tu : size;
      return `<tr><th scope="row">${esc(sl)}<span class="kbm-sd">${esc(plan ? plan.sizeOf(size) : '')}</span></th>${cols.map((c) => {
        const r = shown.find((x) => x.size === size && x.col === c.key);
        if (!r) return '<td></td>';
        const st = r.variant ? Math.max(0, +r.variant.stock || 0) : 0;
        return `<td>${field(r.key, c.key, `${t.add} · ${sl} · ${colName(c)}`)}${r.variant ? `<small class="${st ? '' : 'is-out'}" data-kbs-have="${esc(r.key)}" data-st="${st}">${esc(st ? t.have(st) : t.out)}</small>${codeOf(r)}${delOf(r, sl + ' · ' + colName(c))}` : ''}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table>${anySmart ? `<p class="kbm-key">${esc(t.codeKey)}</p>` : ''}`;
    const used = (k) => shown.some((r) => r.col === k && r.variant);
    /* Une couleur épuisée qu'on ne recommandera pas : on peut la retirer. */
    const soldOut = (k) => !creating && used(k) && shown.every((r) => r.col !== k || !r.variant || !(+r.variant.stock > 0));
    const colorsHtml = !rich ? '' : `<div class="kbc" data-kbc>
      <div class="kbc-row"><span class="kbc-l">${esc(t.colors)}</span>${cols.filter((c) => !c.unique).map((c) => `<span class="kbc-chip">${dot(c)}${esc(c.label)}${!used(c.key) ? `<button type="button" data-kbc-del="${esc(c.key)}" aria-label="${esc(t.removeColor(c.label))}">${CLOSE_SVG}</button>` : soldOut(c.key) ? `<button type="button" data-kbc-drop="${esc(c.key)}" data-label="${esc(c.label)}" aria-label="${esc(t.dropTip(c.label))}" title="${esc(t.dropTip(c.label))}">${CLOSE_SVG}</button>` : ''}</span>`).join('')}
        <button type="button" class="kbc-add" data-kbc-add aria-expanded="false">${PLUS_SVG}<span>${esc(cols.every((c) => c.unique) ? t.addColors : t.addColor)}</span></button></div>
      <div class="kbc-pal" data-kbc-pal hidden>${pal.filter((c) => !cols.some((k) => k.id === c.id || k.family === c.id)).map((c) => `<button type="button" class="kbc-sw" data-kbc-pick="${esc(c.id)}">${dot(COLORS.columnOf(c, o.lang))}${esc(COLORS.labelOf(c, o.lang))}</button>`).join('')}</div>
    </div>`;
    const printable = printCount();
    const rec = lastReceipt(pid);
    const fresh = rec ? Object.keys(rec.got).reduce((s, k) => s + (rec.got[k] || 0), 0) : 0;
    const allN = rec ? printCount(true) : 0;
    /* Un carton à répartir : la bande de boutique-size-split.js sous les cases. */
    const splitOn = rich && shown.length > 1;
    const page = () => `<div class="kbs${creating || ro ? '' : ' is-restock'}" data-kbs>
      <div class="kbs-top">
        ${creating ? `<span>${esc(t.total)} <b>${target}</b></span>` : `<span>${esc(t.have(d.stock))}</span>`}
        ${!creating && rec && fresh ? `<span class="kbs-last">${esc(t.lastIn(fresh))}</span>` : ''}
        ${ro ? '' : '<span class="kbs-count" data-kbs-count aria-live="polite"></span>'}
      </div>
      ${colorsHtml}
      ${matrix ? matrixHtml : shown.length ? `<div class="kbs-colhead" aria-hidden="true"><span>${esc(t.size)}</span><span>${creating ? '' : esc(t.stockCol)}</span><span>${ro ? '' : esc(creating ? t.add : t.addMore)}</span></div>
      <ul class="kbs-list">${rowsHtml}</ul>` : `<p class="kbs-msg">${esc(t.empty)}</p>`}
      ${splitOn ? '<div data-kbs-split></div>' : ''}
      <p class="kbs-msg" data-kbs-msg>${creating && list.length > 1 ? esc(t.hintCreate) : ''}</p>
      <div class="kbs-acts">
        ${rec && allN && allN !== printable ? `<button type="button" class="kbs-btn" data-kbs-print-all>${esc(t.printAll(allN))}</button>` : ''}
        <button type="button" class="kbs-btn" data-kbs-print${printable ? '' : ' disabled'}>${PRINT_SVG}<span>${printHtml(printable, !!rec)}</span></button>
        ${ro ? '' : `<button type="button" class="kbs-btn is-main" data-kbs-save>${esc(t.save)}</button>`}
      </div>
    </div>`;
    host.innerHTML = page();
    const back = carry; carry = null;
    if (back) host.querySelectorAll('[data-kbs-in]').forEach((i) => { const v = back.values[i.getAttribute('data-kbs-in')]; if (v) i.value = v; });
    wire();
    if (splitOn) {
      SPLIT.mountSplit(host.querySelector('[data-kbs-split]'), {
        root: host, target, lang: o.lang,
        cells: shown.map((r) => ({ key: r.key, size: r.size, col: r.col })),
        sizes: sizeList.map((size) => ({ size, label: size === 'TU' ? t.tu : size })),
        cols,
        curve: () => SPLIT.curveFor(cat, pid, sizeList),
        colorShares: () => SPLIT.colorSharesFor(cat, cols),
        parse: (text) => COLORS.parseColored(text, sizeList, cols, pal, SPLIT.parseQuick),
        onAddColors: (fams, text) => addColors(fams, text),
        quick: back && back.quick,
      });
    }
    if (back && back.quick) return;
    if (creating) { const first = host.querySelector(splitOn ? '[data-kbsp-quick]' : '[data-kbs-in]'); if (first) setTimeout(() => first.focus({ preventScroll: true }), 40); }
  };

  /* Ajouter ou retirer une colonne de couleur, sans perdre ce qui est tapé. */
  const keep = (quick) => {
    const values = {};
    host.querySelectorAll('[data-kbs-in]').forEach((i) => { if (String(i.value).trim()) values[i.getAttribute('data-kbs-in')] = i.value; });
    carry = { values, quick: quick || '' };
  };
  function addColors(fams, quick) {
    const fresh = fams.filter((c) => !cols.some((k) => k.id === c.id || k.family === c.id)).map((c) => COLORS.columnOf(c, o.lang));
    if (!fresh.length) return;
    const d = cat.getProduct(pid);
    const neutralUsed = d && d.variants.some((v) => String(v.colorId || COLORS.UNIQUE) === COLORS.UNIQUE);
    if (!neutralUsed) cols = cols.filter((c) => !c.unique);
    cols = cols.concat(fresh);
    keep(quick);
    draw();
  }
  function removeColor(key) {
    cols = cols.filter((c) => c.key !== key);
    if (!cols.length) cols = [COLORS.uniqueColumn()];
    keep('');
    draw();
  }

  /* Étiquettes : les pièces de la dernière réception (lastReceipt), sinon le
     stock de chaque taille. « Tout le stock » reste à portée, à côté. */
  const labelPlan = (all) => {
    const d = cat.getProduct(pid);
    if (!d) return [];
    const rec = all ? null : lastReceipt(pid);
    return labelCounts(d.variants, rec && rec.got).filter(([v, n]) => n > 0 && o.primary(v));
  };
  function printCount(all) { return labelPlan(all).reduce((s, [, n]) => s + n, 0); }
  const printHtml = (n, fresh) => printLabelHtml(t, n, fresh);

  const read = () => {
    const out = []; let sum = 0; let bad = false;
    host.querySelectorAll('[data-kbs-in]').forEach((inp) => {
      const r = pieces(inp.value);
      inp.setAttribute('aria-invalid', r.bad ? 'true' : 'false');
      if (r.bad) { bad = true; return; }
      if (r.n > 0) { out.push({ key: inp.getAttribute('data-kbs-in'), n: r.n }); sum += r.n; }
    });
    return { out, sum, bad };
  };
  const dirty = () => Array.from(host.querySelectorAll('[data-kbs-in]')).some((i) => String(i.value).trim() !== '');

  const say = (msg, err) => {
    const m = host.querySelector('[data-kbs-msg]');
    if (!m) return;
    if (!msg && target > 0 && host.querySelectorAll('[data-kbs-in]').length > 1) msg = t.hintCreate;
    m.textContent = msg || '';
    m.classList.toggle('is-err', !!err);
    m.hidden = !msg;
    if (err) m.setAttribute('role', 'alert'); else m.removeAttribute('role');
  };
  const paintCount = () => {
    host.querySelectorAll('[data-kbm-tot]').forEach((th) => {
      const k = th.getAttribute('data-kbm-tot');
      let n = 0;
      host.querySelectorAll(`[data-kbs-col="${CSS.escape(k)}"]`).forEach((i) => { const r = pieces(i.value); if (r.n) n += r.n; });
      th.textContent = n ? String(n) : '';
    });
    host.querySelectorAll('[data-kbs-have]').forEach((h) => {
      const k = h.getAttribute('data-kbs-have');
      const i = host.querySelector(`[data-kbs-in="${CSS.escape(k)}"]`);
      const st = +h.getAttribute('data-st') || 0;
      const r = i ? pieces(i.value) : { n: 0 };
      const up = !!(r.n > 0 && target <= 0);
      h.textContent = up ? t.after(st, st + r.n) : st ? t.have(st) : t.out;
      h.classList.toggle('is-up', up);
      h.classList.toggle('is-out', !up && !st);
    });
    const c = host.querySelector('[data-kbs-count]');
    const { sum } = read();
    if (c) {
      c.textContent = target > 0 ? t.split(sum, target) : t.received(sum, host.querySelectorAll('[data-kbs-in]').length === 1);
      c.classList.toggle('is-ok', target > 0 ? sum === target : sum > 0);
      c.classList.toggle('is-over', target > 0 && sum > target);
    }
    const pb = host.querySelector('[data-kbs-print]');
    if (pb) {
      const n = printCount();
      const block = dirty();
      pb.disabled = !n || block;
      pb.title = block && n ? t.printDirty : '';
    }
    const pa = host.querySelector('[data-kbs-print-all]');
    if (pa) { pa.disabled = dirty(); pa.title = pa.disabled ? t.printDirty : ''; }
  };

  const save = () => {
    if (busy) return;
    const { out, sum, bad } = read();
    if (bad) { say(t.bad, true); return; }
    if (target > 0 && sum !== target) { say(t.mismatch(sum, target), true); return; }
    if (!sum) { say(t.none, true); return; }
    busy = true;
    const btn = host.querySelector('[data-kbs-save]');
    if (btn) { btn.disabled = true; btn.textContent = t.saving; }
    const list = cellList;
    const got = {};
    let codes = 0;
    const run = () => {
      const plan = rich ? CODES.planner(cat, pid, list.map((x) => x.size)) : null;
      out.forEach(({ key, n }) => {
        const r = list.find((x) => x.key === key);
        if (!r) return;
        let v = r.variant;
        if (v) cat.receiveStock(v.id, n);
        else {
          const ev = cat.ensureVariant(Object.assign({ productId: pid, colorId: r.colorId, size: r.size, stock: n },
            r.colorLabel ? { colorLabel: r.colorLabel, colorHex: r.colorHex } : {}));
          v = ev && ev.variant;
          if (v && !ev.created) cat.receiveStock(v.id, n);
        }
        if (!v) return;
        const fam = rich ? (() => { const c = cols.find((k) => k.key === r.col); return !c || c.unique ? 'unique' : (c.family || c.id); })() : '';
        if (!o.primary(v) && cat.generateBarcode(v.id, plan ? plan.code(fam, r.size) : undefined)) codes++;
        got[v.id] = (got[v.id] || 0) + n;
      });
    };
    if (cat.batch) cat.batch(run); else run();
    busy = false;
    target = 0;
    noteReceipt(pid, got);
    draw();
    const total = Object.keys(got).reduce((s, k) => s + got[k], 0);
    if (o.toast) o.toast(t.saved, t.savedDesc(total, Object.keys(got).length));
    if (o.onSaved) o.onSaved({ received: got, codes });
  };

  function wire() {
    host.querySelectorAll('[data-kbs-in]').forEach((inp, i, all) => {
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d]/g, '').slice(0, 5); say(''); paintCount(); });
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = all[i + 1];
        if (next) next.focus(); else save();
      });
    });
    const sb = host.querySelector('[data-kbs-save]'); if (sb) sb.addEventListener('click', save);
    const printPlan = (all) => {
      if (dirty()) { say(t.printDirty, true); return; }
      const labels = [];
      labelPlan(all).forEach(([v, n]) => { const l = o.label(pid, v); if (l) for (let k = 0; k < n; k++) labels.push(l); });
      if (labels.length && o.print) { o.print(labels); if (!all) markReceiptPrinted(pid); }
    };
    const pb = host.querySelector('[data-kbs-print]');
    if (pb) pb.addEventListener('click', () => printPlan(false));
    const pa = host.querySelector('[data-kbs-print-all]');
    if (pa) pa.addEventListener('click', () => printPlan(true));
    const add = host.querySelector('[data-kbc-add]');
    const palEl = host.querySelector('[data-kbc-pal]');
    if (add && palEl) add.addEventListener('click', () => { palEl.hidden = !palEl.hidden; add.setAttribute('aria-expanded', String(!palEl.hidden)); if (!palEl.hidden) { const f = palEl.querySelector('button'); if (f) f.focus(); } });
    host.querySelectorAll('[data-kbc-pick]').forEach((b) => b.addEventListener('click', () => { const c = pal.find((x) => x.id === b.getAttribute('data-kbc-pick')); if (c) addColors([c], ''); }));
    host.querySelectorAll('[data-kbc-del]').forEach((b) => b.addEventListener('click', () => removeColor(b.getAttribute('data-kbc-del'))));
    /* Retirer une couleur épuisée : deux touches, la seconde efface ses tailles. */
    host.querySelectorAll('[data-kbc-drop]').forEach((b) => b.addEventListener('click', () => {
      const key = b.getAttribute('data-kbc-drop');
      const chip = b.closest('.kbc-chip');
      if (!chip || chip.classList.contains('is-ask')) return;
      chip.classList.add('is-ask');
      chip.innerHTML = '<span></span><button type="button" class="kbc-ok"></button><button type="button">' + CLOSE_SVG + '</button>';
      const [ok, no] = chip.querySelectorAll('button');
      chip.querySelector('span').textContent = t.dropAsk(b.dataset.label || '');
      ok.textContent = t.dropOk;
      no.setAttribute('aria-label', t.cancel);
      no.addEventListener('click', () => { keep(''); draw(); });
      ok.addEventListener('click', () => {
        const ids = cellList.filter((r) => r.col === key && r.variant && !(+r.variant.stock > 0)).map((r) => r.variant.id);
        const run = () => ids.forEach((id) => cat.deleteVariant(id));
        if (cat.batch) cat.batch(run); else run();
        removeColor(key);
        if (o.onSaved) o.onSaved({ received: {}, codes: 0 });
      });
      ok.focus();
    }));
    host.querySelectorAll('[data-kbs-reg]').forEach((b) => b.addEventListener('click', () => o.register && o.register(b.getAttribute('data-kbs-reg'))));
    host.querySelectorAll('[data-kbs-del]').forEach((b) => b.addEventListener('click', () => o.remove && o.remove(b.getAttribute('data-kbs-del'))));
    paintCount();
    if (target <= 0) say('');
  }

  draw();
  return {
    refresh() { if (!dirty() && !busy) draw(); },
    dirty,
  };
}

/* Le produit d'une boutique au tableau de bord : une fenêtre au centre
   (Kiwi.modal), plus le tiroir à droite. Une seule à la fois.
   o: { modal, modalClass, foot, extraHtml, heading() → [titre, sous-titre],
        mount (les options de mount()), onClose(api) }.
   Rend { pid, alive(), refresh(), close() } ; le titre suit chaque refresh. */
let dash = null;
export function openDashboard(o) {
  if (dash) dash.close();
  const hd = (o.heading && o.heading()) || ['', ''];
  const m = o.modal({ title: hd[0], desc: esc(hd[1]), width: 680, body: `<div data-kbs-host></div>${o.extraHtml || ''}`, foot: o.foot });
  if (!m || !m.el) return null;
  if (o.modalClass) m.el.classList.add(o.modalClass);
  const head = () => {
    const now = o.heading && o.heading();
    if (!now) return;
    const h = m.el.querySelector('.kiwi-modal-head h3'); if (h) h.textContent = now[0];
    const d = m.el.querySelector('.kiwi-modal-head p'); if (d) d.textContent = now[1];
  };
  const view = mount(m.el.querySelector('[data-kbs-host]'), Object.assign({}, o.mount, {
    onSaved: (r) => { head(); if (o.mount.onSaved) o.mount.onSaved(r); },
  }));
  const api = {
    pid: o.mount.pid,
    alive: () => m.el.isConnected,
    refresh() { head(); if (view) view.refresh(); },
    close() { m.close(); },
  };
  dash = api;
  if (typeof MutationObserver === 'function') {
    const mo = new MutationObserver(() => {
      if (m.el.isConnected) return;
      mo.disconnect();
      if (dash === api) dash = null;
      if (o.onClose) o.onClose(api);
    });
    mo.observe(document.body, { childList: true });
  }
  return api;
}

/* Les styles du formulaire de création, repris de ceux du tableau de bord
   (pages-pro-boutique.js, _bqxPfCss) sous .kbs-form : la caisse ne charge pas
   ce fichier-là, et le formulaire doit être le même aux deux endroits. */
let formCssDone = false;
export function formCss() {
  if (formCssDone || typeof document === 'undefined') return;
  formCssDone = true;
  css();
  const style = document.createElement('style');
  style.id = 'kiwi-boutique-sizes-form-css';
  style.textContent = `
.kbs-form { --pf-card: color-mix(in srgb, var(--paper, #F7F5F0) 55%, #fff); --pf-field: var(--paper, #F7F5F0); padding: 4px 20px 8px; max-height: min(68vh, 720px); overflow-y: auto; }
html[data-theme="dark"] .kbs-form, body[data-vexel-mode="dark"] .kbs-form { --pf-card: #151C18; --pf-field: #0B100E; }
.kbs-form select.bqx-pf-in { appearance: auto; }
.kbs-form .bqx-pf { display: grid; grid-template-columns: minmax(0, 1fr) 248px; gap: 18px; align-items: start; color: var(--ink); }
.kbs-form .bqx-pf-main { display: grid; gap: 14px; min-width: 0; }
.kbs-form .bqx-pf-sec { min-width: 0; padding: 16px 18px 4px; border: 1px solid var(--n-200); border-radius: 14px; background: var(--pf-card); }
.kbs-form .bqx-pf-sec > h4 { margin: 0 0 12px; font: 600 14.5px var(--sans); letter-spacing: -0.01em; color: var(--ink); }
.kbs-form .bqx-pf-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 12px; align-items: start; }
.kbs-form .bqx-pf .bqx-pf-f { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; align-content: start; min-width: 0; margin: 0 0 14px; }
.kbs-form .bqx-pf-l { display: flex; align-items: baseline; gap: 6px; font-size: 12px; font-weight: 600; color: var(--n-600); }
.kbs-form .bqx-pf-tag { font-size: 11px; font-weight: 500; color: var(--n-400, var(--n-500)); }
.kbs-form .bqx-pf-in { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--pf-field); color: var(--ink); font: 500 13.5px var(--sans); transition: border-color 140ms, box-shadow 140ms; }
.kbs-form .bqx-pf-in::placeholder { color: var(--n-400, var(--n-500)); font-weight: 400; }
.kbs-form .bqx-pf-in:focus { outline: 0; border-color: var(--atlas); box-shadow: 0 0 0 3px color-mix(in srgb, var(--atlas) 16%, transparent); }
.kbs-form .bqx-pf-in[aria-invalid="true"] { border-color: var(--danger, #cb5238); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger, #cb5238) 14%, transparent); }
.kbs-form .bqx-pf-hint { font-size: 11.5px; line-height: 1.45; color: var(--n-500); }
.kbs-form .bqx-pf-err { font-size: 11.5px; font-weight: 600; line-height: 1.35; color: var(--danger, #cb5238); }
.kbs-form .bqx-pf-err[hidden], .kbs-form .bqx-pf [hidden] { display: none; }
.kbs-form .bqx-pf-money { position: relative; display: block; }
.kbs-form .bqx-pf-money .bqx-pf-in { padding-inline-end: 50px; font-variant-numeric: tabular-nums; }
.kbs-form .bqx-pf-unit { position: absolute; inset-inline-end: 12px; top: 50%; transform: translateY(-50%); font: 500 12px var(--sans); color: var(--n-500); pointer-events: none; }
.kbs-form .bqx-pf-gap { margin: -4px 0 14px; font-size: 12px; line-height: 1.45; color: var(--n-600); font-variant-numeric: tabular-nums; }
.kbs-form .bqx-pf-gap.is-neg { color: var(--danger, #cb5238); font-weight: 600; }
.kbs-form .bqx-pf-gap.is-none { color: var(--n-500); }
.kbs-form .bqx-pf-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 8px; }
.kbs-form .bqx-pf-choice { position: relative; display: grid; gap: 2px; min-width: 0; padding: 10px 12px; padding-inline-start: 36px; border: 1px solid var(--n-200); border-radius: 12px; background: var(--pf-field); cursor: pointer; transition: border-color 140ms, box-shadow 140ms; }
.kbs-form .bqx-pf-choice input { position: absolute; inset-inline-start: 12px; top: 12px; width: 16px; height: 16px; margin: 0; accent-color: var(--atlas); cursor: pointer; }
.kbs-form .bqx-pf-choice b { font: 600 13px/1.3 var(--sans); color: var(--ink); }
.kbs-form .bqx-pf-choice small { font-size: 11.5px; line-height: 1.35; color: var(--n-500); }
.kbs-form .bqx-pf-choice:hover { border-color: color-mix(in srgb, var(--atlas) 50%, var(--n-200)); }
.kbs-form .bqx-pf-choice:has(input:checked) { border-color: var(--atlas); box-shadow: inset 0 0 0 1px var(--atlas); }
.kbs-form .bqx-pf-choice:has(input:focus-visible) { outline: 2px solid var(--atlas); outline-offset: 2px; }
.kbs-form .bqx-pf-choices[aria-invalid="true"] .bqx-pf-choice { border-color: var(--danger, #cb5238); }
.kbs-form .bqx-pf-side { position: sticky; top: 0; display: grid; gap: 12px; min-width: 0; }
.kbs-form .bqx-pf-card { padding: 12px; border: 1px solid var(--n-200); border-radius: 14px; background: var(--pf-card); }
.kbs-form .bqx-pf-thumb { display: grid; place-items: center; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 10px; background: color-mix(in srgb, var(--tint, #9AA09D) 14%, var(--pf-field)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tint, #9AA09D) 12%, var(--n-200)); }
.kbs-form .bqx-pf-thumb img, .kbs-form .bqx-pf-thumb video { display: block; width: 100%; height: 100%; object-fit: cover; }
.kbs-form .bqx-pf-thumb .bqx-ini { font-size: 30px; }
.kbs-form .bqx-pf-pn { margin: 10px 2px 0; font: 600 14.5px/1.3 var(--sans); letter-spacing: -0.01em; color: var(--ink); overflow-wrap: anywhere; }
.kbs-form .bqx-pf-pn.is-empty { font-weight: 500; color: var(--n-400, var(--n-500)); }
.kbs-form .bqx-pf-pm { display: flex; align-items: center; gap: 6px; margin: 3px 2px 0; font-size: 12px; color: var(--n-500); }
.kbs-form .bqx-pf-pm .bqx-dot { background: var(--cat, #9AA09D); }
.kbs-form .bqx-pf-pp { margin: 8px 2px 2px; font: 600 18px/1 var(--sans); letter-spacing: -0.015em; color: var(--ink); font-variant-numeric: tabular-nums; }
.kbs-form .bqx-pf-pp small { font-size: 11px; font-weight: 500; letter-spacing: 0; color: var(--n-500); }
.kbs-form .bqx-pf-pp.is-empty { color: var(--n-400, var(--n-500)); }
.kbs-form .bqx-pf-macts { display: grid; gap: 6px; margin-top: 12px; }
.kbs-form .bqx-pf-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 36px; padding: 0 10px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--pf-field); color: var(--n-700); font: 500 12.5px var(--sans); cursor: pointer; transition: border-color 140ms, color 140ms; }
.kbs-form .bqx-pf-btn:hover { border-color: var(--atlas); color: var(--atlas); }
.kbs-form .bqx-pf-btn:focus-visible { outline: 2px solid var(--atlas); outline-offset: 2px; }
.kbs-form .bqx-pf-btn.is-del:hover { border-color: var(--danger, #cb5238); color: var(--danger, #cb5238); }
.kbs-form .bqx-pf-btn:disabled { opacity: .55; cursor: progress; }
.kbs-form .bqx-pf-mhint { margin: 10px 2px 0; font-size: 11.5px; line-height: 1.45; color: var(--n-500); }
.kbs-form .bqx-pf-mmsg { margin: 6px 2px 0; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--n-700); }
.kbs-form .bqx-pf-mmsg:empty { display: none; }
@media (max-width: 760px) {
.kbs-form .bqx-pf { grid-template-columns: 1fr; }
.kbs-form .bqx-pf-side { position: static; }
.kbs-form .bqx-pf-card { display: grid; grid-template-columns: 112px minmax(0, 1fr); column-gap: 12px; align-items: start; }
.kbs-form .bqx-pf-thumb { grid-row: span 3; aspect-ratio: 1; }
.kbs-form .bqx-pf-pn { margin-top: 2px; }
.kbs-form .bqx-pf-macts, .kbs-form .bqx-pf-mhint, .kbs-form .bqx-pf-mmsg { grid-column: 1 / -1; }
.kbs-form .bqx-pf-macts { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
}
@media (max-width: 560px) {
.kbs-form .bqx-pf-grid { grid-template-columns: 1fr; }
.kbs-form .bqx-pf-in, .kbs-form .kiwi-backdrop.bqx-pf-modal .bqx-pf .kiwi-select-trigger { font-size: 16px; }
.kbs-form .bqx-pf-sec { padding: 14px 14px 2px; }
}
`;
  document.head.appendChild(style);
}

/* Le formulaire de création, pour la caisse : le même que celui du tableau de
   bord (Article, Prix, Stock), avec la carte d'aperçu à droite où la photo de
   la caisse se choisit (retail-icon-picker.js). Le tableau de bord garde son
   propre formulaire, qui porte en plus la photo, la vidéo et la référence. */
const F = {
  fr: { title: 'Nouveau produit', desc: 'Créez le produit avec la quantité reçue, puis répartissez-la par taille.',
    secItem: 'Article', secPrice: 'Prix', secStock: 'Stock', name: 'Nom du produit', ph: 'Ex. Hoodie noir', nameErr: 'Donnez un nom au produit.',
    cat: 'Catégorie', catNone: 'Sans catégorie', catHint: 'Elle devient le rayon de la caisse.', kind: 'Déclinaison',
    kinds: { taille: ['Vêtement', 'Tailles XXS à XXL'], pointure: ['Chaussure', 'Pointures'], tu: ['Taille unique', 'Sans taille'] },
    price: 'Prix de vente', priceErr: 'Indiquez un prix de vente supérieur à 0.', cost: 'Coût d’achat', optional: 'facultatif',
    cancel: 'Annuler', create: 'Créer le produit' },
  en: { title: 'New product', desc: 'Create the product with the quantity received, then split it by size.',
    secItem: 'Item', secPrice: 'Price', secStock: 'Stock', name: 'Product name', ph: 'E.g. Black hoodie', nameErr: 'Give the product a name.',
    cat: 'Category', catNone: 'No category', catHint: 'It becomes the till’s shelf.', kind: 'Variants by',
    kinds: { taille: ['Clothing', 'Sizes XXS to XXL'], pointure: ['Shoes', 'Shoe sizes'], tu: ['One size', 'No size'] },
    price: 'Selling price', priceErr: 'Enter a selling price above 0.', cost: 'Purchase cost', optional: 'optional',
    cancel: 'Cancel', create: 'Create product' },
  ar: { title: 'منتج جديد', desc: 'أنشئ المنتج بالكمية المستلمة، ثم وزّعها حسب المقاس.',
    secItem: 'السلعة', secPrice: 'السعر', secStock: 'المخزون', name: 'اسم المنتج', ph: 'مثال: هودي أسود', nameErr: 'أدخل اسماً للمنتج.',
    cat: 'الفئة', catNone: 'بدون فئة', catHint: 'تصبح رفّاً في الصندوق.', kind: 'التنويع حسب',
    kinds: { taille: ['ملابس', 'المقاسات من XXS إلى XXL'], pointure: ['أحذية', 'مقاسات الأحذية'], tu: ['مقاس واحد', 'بدون مقاس'] },
    price: 'سعر البيع', priceErr: 'أدخل سعر بيع أكبر من 0.', cost: 'تكلفة الشراء', optional: 'اختياري',
    cancel: 'إلغاء', create: 'إنشاء المنتج' },
};
export const formWords = (lang) => F[lang] || F.fr;

/* Le bloc « Stock › Quantité totale », identique sur les deux formulaires. */
export function totalFieldHtml(lang, kind) {
  const t = words(lang);
  return `<section class="bqx-pf-sec" data-kbs-total-sec>
    <h4>${esc(formWords(lang).secStock)}</h4>
    <label class="bqx-pf-f">
      <span class="bqx-pf-l">${esc(t.total)}</span>
      <input class="bqx-pf-in" type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="24" data-kbs-total aria-describedby="kbs-total-err kbs-total-hint" />
      <span class="bqx-pf-err" id="kbs-total-err" data-kbs-total-err hidden>${esc(t.totalErr)}</span>
      <span class="bqx-pf-hint" id="kbs-total-hint" data-kbs-total-hint>${esc(hasGrid(kind) ? t.totalHint : t.totalHintTu)}</span>
    </label>
  </section>`;
}
/* Lit la quantité totale ; marque le champ en erreur et rend null si elle
   manque ou n'est pas un entier ≥ 1. */
export function readTotal(root) {
  const inp = root && root.querySelector('[data-kbs-total]');
  if (!inp) return null;
  const r = pieces(inp.value);
  const ok = !r.bad && !r.empty && r.n >= 1;
  inp.setAttribute('aria-invalid', ok ? 'false' : 'true');
  const err = root.querySelector('[data-kbs-total-err]');
  if (err) err.hidden = ok;
  return ok ? r.n : null;
}
/* Le texte d'aide suit la déclinaison choisie. */
export function wireTotal(root, lang) {
  const t = words(lang);
  const inp = root && root.querySelector('[data-kbs-total]');
  if (!inp) return;
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/[^\d]/g, '').slice(0, 5);
    inp.setAttribute('aria-invalid', 'false');
    const err = root.querySelector('[data-kbs-total-err]'); if (err) err.hidden = true;
  });
  root.querySelectorAll('input[name="bqx-pf-kind"]').forEach((r) => r.addEventListener('change', () => {
    const h = root.querySelector('[data-kbs-total-hint]');
    if (h && r.checked) h.textContent = hasGrid(r.value) ? t.totalHint : t.totalHintTu;
  }));
}

/* Crée le produit et, pour un produit sans grille, son unique taille avec
   tout le stock et son code. Rend { product, needsGrid }. */
export function createProduct(cat, data, total) {
  let p = null;
  const run = () => {
    p = cat.addProduct(data);
    if (p && !hasGrid(p.kind)) {
      const ev = cat.ensureVariant({ productId: p.id, colorId: ONE_COLOR, size: 'TU', stock: total });
      if (ev && ev.variant) cat.generateBarcode(ev.variant.id, sizeColorsOn() ? CODES.planner(cat, p.id, ['TU']).code('unique', 'TU') : undefined);
    }
  };
  if (cat.batch) cat.batch(run); else run();
  return { product: p, needsGrid: !!(p && hasGrid(p.kind)) };
}
