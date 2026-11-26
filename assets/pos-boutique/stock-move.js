/* La caisse boutique · « Mouvements de stock » : CONSULTER ou FAIRE
 * (propriétaire, 2026-11-26).
 *
 * Le bouton de l'inventaire n'ouvrait que l'historique (inv-moves.js). Le
 * propriétaire veut deux chemins : voir ce qui a bougé, ou déclarer un
 * mouvement maintenant, y compris envoyer des pièces à une autre boutique.
 *
 *   · Le choix : deux cartes, « Nouveau mouvement » et « Historique », avec les
 *     trois derniers mouvements en dessous.
 *   · Nouveau mouvement : Entrée / Sortie / Transfert, un motif (les types
 *     `manual` de maison-stock-movements.js, rien d'inventé), des articles
 *     cherchés ou scannés, une quantité par taille, fournisseur, référence,
 *     note. Un seul code responsable pour toutes les lignes
 *     (KiwiMaisonStock.requestManualBatch).
 *   · Transfert vers une boutique reliée (catalogue partagé) : on passe la main
 *     à l'envoi suivi de transfers.js, déjà adressé, pour que l'autre boutique
 *     reçoive et confirme. Vers un dépôt ou un atelier hors Kiwi : un
 *     « Transfert envoyé / reçu » au registre, avec le lieu en note.
 *
 * Le stock ne bouge qu'à « Enregistrer », et revient si le code est refusé. */
import { openMoves } from './inv-moves.js?v=8';
import { shipChoices, startTransfer } from './transfers.js?v=8';

const MODULE = 'boutique';
const MAX_LINES = 30;      // la capacité signée porte toutes les ids : on reste loin de sa limite
const MAX_HITS = 10;
const KIND = { in: 'in', out: 'out', move: 'move' };
const TYPES = {
  in: ['reception', 'reassort', 'correction-in'],
  out: ['casse', 'perte', 'echantillon', 'usage-interne', 'retour-fourn', 'correction-out'],
  move: ['transfert-out', 'transfert-in'],
};
const PLACE = { 'transfert-out': 1, 'transfert-in': 1 };
/* Les motifs dans la langue de la CAISSE : le libellé du registre suit celle du
   tableau de bord (KiwiI18n), qu'une caisse en arabe ne règle pas. */
const LABEL = {
  'reception': 'Réception fournisseur', 'reassort': 'Réassort', 'correction-in': 'Correction · entrée',
  'casse': 'Article abîmé', 'perte': 'Perte', 'echantillon': 'Échantillon', 'usage-interne': 'Usage interne',
  'retour-fourn': 'Retour fournisseur', 'correction-out': 'Correction · sortie',
};
const LEVEL = { warn: 'warn', success: 'success' };   // niveaux de toast : des clés, jamais du texte lu
const ICON = { in: 'arrow_downward', out: 'arrow_upward', move: 'swap_horiz' };
const FIELD = { place: 'bsm-place', sup: 'bsm-sup', ref: 'bsm-ref', note: 'bsm-note' };   // ids des champs : des clés, jamais du texte lu

/* Ce que caisse-lang ne traduit pas (même forme que inv-moves.js). */
const PHRASES = {
  "Mouvements de stock": ["Stock movements", "حركات المخزون"],
  "Réception fournisseur": ["Supplier delivery", "استلام من المورد"],
  "Réassort": ["Restock", "إعادة التزويد"],
  "Correction · entrée": ["Correction · in", "تصحيح · إدخال"],
  "Article abîmé": ["Damaged item", "صنف تالف"],
  "Perte": ["Loss", "فقدان"],
  "Échantillon": ["Sample", "عيّنة"],
  "Usage interne": ["Internal use", "استخدام داخلي"],
  "Retour fournisseur": ["Return to supplier", "إرجاع إلى المورد"],
  "Correction · sortie": ["Correction · out", "تصحيح · إخراج"],
  "Que voulez-vous faire ?": ["What do you want to do?", "ماذا تريد أن تفعل؟"],
  "Nouveau mouvement": ["New movement", "حركة جديدة"],
  "Réception, casse, perte, transfert vers une autre boutique…": ["Delivery, damage, loss, transfer to another shop…", "استلام، تلف، فقدان، تحويل إلى متجر آخر…"],
  "Historique": ["History", "السجل"],
  "Chaque entrée et chaque sortie, avec le stock avant et après": ["Every movement in and out, with stock before and after", "كل حركة دخول وخروج، مع المخزون قبلها وبعدها"],
  "{n} mouvements": ["{n} movements", "{n} حركة"],
  "Aucun mouvement pour l’instant": ["No movements yet", "لا توجد حركات بعد"],
  "Derniers mouvements": ["Latest movements", "آخر الحركات"],
  "Retour": ["Back", "رجوع"],
  "Entrée": ["In", "دخول"],
  "Sortie": ["Out", "خروج"],
  "Transfert": ["Transfer", "تحويل"],
  "Motif": ["Reason", "السبب"],
  "Vers une boutique": ["To a shop", "إلى متجر"],
  "Envoi suivi : {shop} reçoit et confirme les pièces.": ["Tracked shipment: {shop} receives and confirms the pieces.", "إرسال متتبَّع: يستلم {shop} القطع ويؤكدها."],
  "Aucune autre boutique reliée. Pour un envoi suivi, les boutiques doivent partager le même catalogue.": ["No other shop linked. For a tracked shipment, shops must share the same catalogue.", "لا يوجد متجر آخر مرتبط. للإرسال المتتبَّع يجب أن تتشارك المتاجر نفس الكتالوج."],
  "Ou un autre lieu (dépôt, atelier…)": ["Or another place (warehouse, workshop…)", "أو مكان آخر (مستودع، ورشة…)"],
  "Vers un autre lieu": ["To another place", "إلى مكان آخر"],
  "Depuis un autre lieu": ["From another place", "من مكان آخر"],
  "Articles": ["Items", "الأصناف"],
  "Nom de l’article ou code-barres": ["Item name or barcode", "اسم الصنف أو الرمز الشريطي"],
  "Ou scannez l’étiquette.": ["Or scan the label.", "أو امسح الملصق."],
  "Aucun article trouvé": ["No item found", "لم يتم العثور على أي صنف"],
  "Code inconnu : {code}": ["Unknown code: {code}", "رمز غير معروف: {code}"],
  "En stock": ["In stock", "في المخزون"],
  "Après": ["After", "بعد"],
  "Ajoutez des articles : cherchez-les ou scannez-les.": ["Add items: search or scan them.", "أضف الأصناف: ابحث عنها أو امسحها."],
  "Fournisseur": ["Supplier", "المورد"],
  "Lieu": ["Place", "المكان"],
  "Dépôt, atelier, adresse…": ["Warehouse, workshop, address…", "مستودع، ورشة، عنوان…"],
  "Référence": ["Reference", "المرجع"],
  "Bon de livraison, facture…": ["Delivery note, invoice…", "سند التسليم، الفاتورة…"],
  "Note": ["Note", "ملاحظة"],
  "Facultatif": ["Optional", "اختياري"],
  "{n} article(s) · {p} pièce(s)": ["{n} item(s) · {p} piece(s)", "{n} صنف · {p} قطعة"],
  "Le code d’un responsable est demandé à l’enregistrement.": ["A manager code is asked when you save.", "يُطلب رمز المسؤول عند الحفظ."],
  "Enregistrer": ["Save", "حفظ"],
  "Annuler": ["Cancel", "إلغاء"],
  "Retirer": ["Remove", "إزالة"],
  "Plus de stock ici pour cet article.": ["No more stock here for this item.", "لم يعد هناك مخزون هنا لهذا الصنف."],
  "{n} lignes au plus par mouvement.": ["{n} lines at most per movement.", "{n} سطراً كحد أقصى لكل حركة."],
  "Indiquez le lieu.": ["Enter the place.", "أدخل المكان."],
  "Mouvement enregistré · {p} pièce(s)": ["Movement saved · {p} piece(s)", "تم حفظ الحركة · {p} قطعة"],
  "Stock insuffisant pour {item} ({n} en stock).": ["Not enough stock for {item} ({n} in stock).", "المخزون غير كافٍ لـ {item} ({n} في المخزون)."],
  "Article introuvable. Rechargez la caisse.": ["Item not found. Reload the till.", "الصنف غير موجود. أعد تحميل الصندوق."],
  "Mouvement annulé : le code responsable n’a pas été validé.": ["Movement cancelled: the manager code was not confirmed.", "أُلغيت الحركة: لم يتم تأكيد رمز المسؤول."],
  "Hors ligne : rien n’a bougé. Réessayez une fois la connexion revenue.": ["Offline: nothing moved. Try again once you are back online.", "دون اتصال: لم يتغير شيء. أعد المحاولة عند عودة الاتصال."],
  "Le serveur a refusé le mouvement, rien n’a bougé ({why}).": ["The server refused the movement, nothing moved ({why}).", "رفض الخادم الحركة، لم يتغير شيء ({why})."],
  "Registre des mouvements indisponible. Rechargez la caisse.": ["Movement register unavailable. Reload the till.", "سجل الحركات غير متاح. أعد تحميل الصندوق."],
  "Transferts indisponibles. Rechargez la caisse.": ["Transfers unavailable. Reload the till.", "التحويلات غير متاحة. أعد تحميل الصندوق."],
  "Fermer": ["Close", "إغلاق"],
};
const tr = (s, vars) => {
  const C = window.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  let out = own && (lang === 'en' || lang === 'ar') ? own[lang === 'en' ? 0 : 1]
    : (C && typeof C.tr === 'function' ? C.tr(s) : s);
  if (vars) Object.keys(vars).forEach((k) => { out = out.split('{' + k + '}').join(String(vars[k])); });
  return out;
};

const st = { kind: KIND.in, type: TYPES.in[0], lines: [], q: '', supplier: '', ref: '', note: '', place: '', busy: false };
function reset() {
  Object.assign(st, { kind: KIND.in, type: TYPES.in[0], lines: [], q: '', supplier: '', ref: '', note: '', place: '', busy: false });
}
const typeOf = (id) => { const MZ = window.KiwiMaisonStock; return (MZ && MZ.typeById && MZ.typeById(id)) || null; };
const shops = () => shipChoices().slice(1);
const out = () => { const t = typeOf(st.type); return !!(t && t.dir < 0); };
const variantName = (v) => [v.size, v.colorLabel || v.colorFamily || ''].filter(Boolean).join(' · ');
const pieces = () => st.lines.reduce((s, l) => s + l.qty, 0);

function css() {
  if (document.getElementById('bsm-css')) return;
  const s = document.createElement('style');
  s.id = 'bsm-css';
  s.textContent = [
    '#pos-boutique .bsm{padding:22px 24px 20px;display:flex;flex-direction:column;gap:16px;min-width:0;}',
    '#pos-boutique .bsm-head{display:flex;align-items:center;gap:12px;min-width:0;}',
    '#pos-boutique .bsm-head h3{margin:0;font-size:22px;font-weight:600;letter-spacing:-.01em;}',
    '#pos-boutique .bsm-head span{display:block;margin-top:3px;font-size:13px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bsm-back{flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;border:1px solid var(--line,#E2DDD2);background:var(--paper-elev,#FFFDFA);color:inherit;cursor:pointer;}',
    '#pos-boutique .bsm-back svg,#pos-boutique .bsm-back i{width:20px;height:20px;}',
    '[dir="rtl"] #pos-boutique .bsm-back svg,#pos-boutique[dir="rtl"] .bsm-back svg{transform:scaleX(-1);}',
    '#pos-boutique .bsm-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}',
    '#pos-boutique .bsm-card{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:20px;min-height:168px;border:1px solid var(--line,#E2DDD2);border-radius:16px;background:var(--paper-elev,#FFFDFA);color:inherit;font:inherit;text-align:start;cursor:pointer;transition:border-color 160ms ease,box-shadow 160ms ease;}',
    '#pos-boutique .bsm-card:hover,#pos-boutique .bsm-card:focus-visible{border-color:var(--forest,#0B6E4F);box-shadow:0 6px 20px rgba(5,59,44,.08);outline:none;}',
    '#pos-boutique .bsm-card b{font-size:17px;font-weight:600;}',
    '#pos-boutique .bsm-card span{font-size:13px;line-height:1.45;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bsm-card small{margin-top:auto;font-size:12px;color:var(--ink-2,#3D4441);font-variant-numeric:tabular-nums;}',
    '#pos-boutique .bsm-ic{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:var(--mint-tint,#E6F6EE);color:var(--forest,#0B6E4F);}',
    '#pos-boutique .bsm-card.is-main .bsm-ic{background:var(--forest,#0B6E4F);color:#fff;}',
    '#pos-boutique .bsm-ic svg,#pos-boutique .bsm-ic i{width:22px;height:22px;}',
    '#pos-boutique .bsm-recent{display:flex;flex-direction:column;border:1px solid var(--line,#E2DDD2);border-radius:12px;overflow:hidden;}',
    '#pos-boutique .bsm-recent h4,#pos-boutique .bsm-lab{margin:0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bsm-recent h4{padding:10px 14px;background:var(--paper-soft,#F1EEE7);}',
    '#pos-boutique .bsm-rrow{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:10px 14px;border-top:1px solid var(--line,#E2DDD2);font-size:13px;}',
    '#pos-boutique .bsm-rrow small{display:block;font-size:12px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bsm-rrow em{font-style:normal;font-size:12px;color:var(--ink-3,#6F6C65);white-space:nowrap;}',
    '#pos-boutique :is(.bsm-q,.bsm-after).in{color:var(--forest,#0B6E4F);}',
    '#pos-boutique :is(.bsm-q,.bsm-after).out{color:var(--danger-mute,#B4412F);}',
    '#pos-boutique .bsm-q{font-weight:700;font-variant-numeric:tabular-nums;}',
    '#pos-boutique .bsm-seg{align-self:flex-start;}',
    '#pos-boutique .bsm-seg .bq-seg-it{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 18px;}',
    '#pos-boutique .bsm-seg .bq-seg-it svg,#pos-boutique .bsm-seg .bq-seg-it i{width:18px;height:18px;}',
    '#pos-boutique .bsm-sec{display:flex;flex-direction:column;gap:8px;}',
    '#pos-boutique :is(#bsm-why,#bsm-pick){display:flex;flex-direction:column;gap:18px;}',
    '#pos-boutique #bsm-pick:empty{display:none;}',
    '#pos-boutique .bsm-chips{display:flex;flex-wrap:wrap;gap:8px;}',
    '#pos-boutique .bsm-chip{min-height:40px;padding:0 14px;border:1px solid var(--line,#E2DDD2);border-radius:999px;background:var(--paper-elev,#FFFDFA);color:inherit;font:inherit;font-size:13.5px;cursor:pointer;}',
    '#pos-boutique .bsm-chip[aria-pressed="true"]{border-color:var(--forest,#0B6E4F);background:var(--mint-tint,#E6F6EE);color:var(--forest,#0B6E4F);font-weight:600;}',
    '#pos-boutique .bsm-dests{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;}',
    '#pos-boutique .bsm-dest{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line,#E2DDD2);border-radius:12px;background:var(--paper-elev,#FFFDFA);color:inherit;font:inherit;text-align:start;cursor:pointer;}',
    '#pos-boutique .bsm-dest:hover{border-color:var(--forest,#0B6E4F);}',
    '#pos-boutique .bsm-dest .bsm-ic{flex:none;}',
    '#pos-boutique .bsm-dt{display:flex;flex-direction:column;gap:2px;min-width:0;}',
    '#pos-boutique .bsm-dt b{font-size:14px;font-weight:600;color:var(--ink,#0A0F0D);}',
    '#pos-boutique .bsm-dt small{font-size:12px;line-height:1.4;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bsm-note{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:var(--paper-soft,#F1EEE7);font-size:12.5px;color:var(--ink-2,#3D4441);}',
    '#pos-boutique .bsm-note svg,#pos-boutique .bsm-note i{flex:none;width:16px;height:16px;margin-top:1px;}',
    '#pos-boutique .bsm-find{position:relative;}',
    '#pos-boutique .bsm-find input,#pos-boutique .bsm-fields input{width:100%;box-sizing:border-box;min-height:44px;padding:0 14px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:14px;color:inherit;}',
    '#pos-boutique .bsm-find input{padding-inline-start:40px;}',
    '#pos-boutique .bsm-find>svg,#pos-boutique .bsm-find>i{position:absolute;inset-inline-start:12px;top:12px;width:20px;height:20px;color:var(--ink-3,#6F6C65);pointer-events:none;}',
    '#pos-boutique .bsm-hint{font-size:12px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bsm-hits{display:flex;flex-direction:column;border:1px solid var(--line,#E2DDD2);border-radius:12px;overflow:hidden;max-height:220px;overflow-y:auto;}',
    '#pos-boutique .bsm-hit{display:grid;grid-template-columns:minmax(0,1fr) auto 28px;gap:10px;align-items:center;min-height:48px;padding:6px 14px;border:0;border-top:1px solid var(--line,#E2DDD2);background:var(--paper-elev,#FFFDFA);color:inherit;font:inherit;font-size:13.5px;text-align:start;cursor:pointer;}',
    '#pos-boutique .bsm-hit:first-child{border-top:0;}',
    '#pos-boutique .bsm-hit:disabled{opacity:.45;cursor:default;}',
    '#pos-boutique .bsm-hit small{display:block;font-size:12px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bsm-hit em{font-style:normal;font-size:12px;color:var(--ink-3,#6F6C65);font-variant-numeric:tabular-nums;}',
    '#pos-boutique .bsm-hit svg,#pos-boutique .bsm-hit i{width:20px;height:20px;color:var(--forest,#0B6E4F);}',
    '#pos-boutique .bsm-empty{padding:14px;text-align:center;font-size:13px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bsm-lines{display:flex;flex-direction:column;border:1px solid var(--line,#E2DDD2);border-radius:12px;overflow:hidden;max-height:34vh;overflow-y:auto;}',
    '#pos-boutique .bsm-line{display:grid;grid-template-columns:minmax(0,1fr) 72px 132px 64px 40px;gap:10px;align-items:center;padding:8px 8px 8px 14px;border-top:1px solid var(--line,#E2DDD2);font-size:13.5px;}',
    '#pos-boutique .bsm-line:first-child{border-top:0;}',
    '#pos-boutique .bsm-line small{display:block;font-size:12px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bsm-line>span:nth-child(2),#pos-boutique .bsm-after{text-align:end;font-variant-numeric:tabular-nums;}',
    '#pos-boutique .bsm-after{font-weight:600;}',
    '#pos-boutique .bsm-step{display:grid;grid-template-columns:40px minmax(0,1fr) 40px;border:1px solid var(--line,#E2DDD2);border-radius:10px;overflow:hidden;}',
    '#pos-boutique .bsm-step button{height:40px;border:0;background:var(--paper-soft,#F1EEE7);color:inherit;font:inherit;font-size:18px;cursor:pointer;}',
    '#pos-boutique .bsm-step input{width:100%;min-width:0;border:0;text-align:center;font:inherit;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;background:var(--paper-elev,#FFFDFA);color:inherit;}',
    '#pos-boutique .bsm-x{width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:var(--ink-3,#6F6C65);cursor:pointer;}',
    '#pos-boutique .bsm-x svg,#pos-boutique .bsm-x i{width:18px;height:18px;}',
    '#pos-boutique .bsm-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;}',
    '#pos-boutique .bsm-fields label{display:flex;flex-direction:column;gap:6px;}',
    '#pos-boutique .bsm-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--line,#E2DDD2);}',
    '#pos-boutique .bsm-foot b{display:block;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;}',
    '#pos-boutique .bsm-foot small{display:block;font-size:12px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bsm-acts{display:flex;gap:8px;}',
    '@media (max-width:760px){#pos-boutique .bsm-cards{grid-template-columns:1fr;}#pos-boutique .bsm-card{min-height:0;}#pos-boutique .bsm-line{grid-template-columns:minmax(0,1fr) 120px 40px;}#pos-boutique .bsm-line>span:nth-child(2),#pos-boutique .bsm-after{display:none;}}',
  ].join('\n');
  document.head.appendChild(s);
}

const closeBtn = (esc) => '<button class="bq-modal-x" data-inv-x aria-label="' + esc(tr('Fermer')) + '"><i data-icon="close"></i></button>';
const when = (at) => new Date(at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/* ── LE CHOIX ─────────────────────────────────────────────────────────────── */
function chooser(d) {
  const MZ = window.KiwiMaisonStock;
  const esc = d.esc;
  const rows = (MZ && MZ.list) ? MZ.list({ module: MODULE, shared: true }) : [];
  const recent = rows.slice(0, 3).map((m) => {
    const io = m.dir > 0 ? 'in' : 'out';
    return '<div class="bsm-rrow"><span><b>' + esc(m.product || '·') + '</b><small>' + esc(tr(m.typeLabel || 'Mouvement')) + (m.variant ? ' · ' + esc(m.variant) : '') + '</small></span>'
      + '<span class="bsm-q ' + io + '">' + (m.dir > 0 ? '+' : '−') + Math.abs(m.qty) + '</span><em>' + esc(when(m.at)) + '</em></div>';
  }).join('');
  const html = closeBtn(esc)
    + '<div class="bsm">'
    + '<div class="bsm-head"><div><h3>' + esc(tr('Mouvements de stock')) + '</h3><span>' + esc(tr('Que voulez-vous faire ?')) + '</span></div></div>'
    + '<div class="bsm-cards">'
    + '<button type="button" class="bsm-card is-main" data-bsm-new><span class="bsm-ic"><i data-icon="add"></i></span><b>' + esc(tr('Nouveau mouvement')) + '</b><span>' + esc(tr('Réception, casse, perte, transfert vers une autre boutique…')) + '</span></button>'
    + '<button type="button" class="bsm-card" data-bsm-history><span class="bsm-ic"><i data-icon="history"></i></span><b>' + esc(tr('Historique')) + '</b><span>' + esc(tr('Chaque entrée et chaque sortie, avec le stock avant et après')) + '</span>'
    + '<small>' + esc(rows.length ? tr('{n} mouvements', { n: rows.length }) : tr('Aucun mouvement pour l’instant')) + '</small></button>'
    + '</div>'
    + (recent ? '<div class="bsm-recent"><h4>' + esc(tr('Derniers mouvements')) + '</h4>' + recent + '</div>' : '')
    + '</div>';
  d.setModal(html, (el) => {
    el.style.width = 'min(760px, 96vw)';
    el.querySelector('[data-bsm-new]').addEventListener('click', () => { reset(); form(d); });
    el.querySelector('[data-bsm-history]').addEventListener('click', () => history(d));
  });
}

function history(d) {
  openMoves(Object.assign({}, d, { back: () => chooser(d), onNew: () => { reset(); form(d); } }));
}

/* ── NOUVEAU MOUVEMENT ────────────────────────────────────────────────────── */
function form(d) {
  const esc = d.esc;
  const html = closeBtn(esc)
    + '<div class="bsm" data-bsm-form>'
    + '<div class="bsm-head"><button type="button" class="bsm-back" data-bsm-back aria-label="' + esc(tr('Retour')) + '"><i data-icon="arrow_back"></i></button>'
    + '<div><h3>' + esc(tr('Nouveau mouvement')) + '</h3><span>' + esc(tr('Mouvements de stock')) + '</span></div></div>'
    + '<div class="bq-seg bsm-seg" data-lens-demo id="bsm-kind">'
    + [KIND.in, KIND.out, KIND.move].map((k) => '<button type="button" class="bq-seg-it' + (st.kind === k ? ' on' : '') + '" data-lens-item data-bsm-kind="' + k + '"><i data-icon="' + ICON[k] + '"></i>'
      + esc(tr(k === KIND.in ? 'Entrée' : k === KIND.out ? 'Sortie' : 'Transfert')) + '</button>').join('')
    + '</div>'
    + '<div id="bsm-why"></div>'
    + '<div id="bsm-pick"></div>'
    + '</div>';
  d.setModal(html, (el) => {
    el.style.width = 'min(880px, 96vw)';
    el.querySelector('[data-bsm-back]').addEventListener('click', () => { d.disarmScanCapture(); chooser(d); });
    el.querySelectorAll('[data-bsm-kind]').forEach((b) => b.addEventListener('click', () => {
      const k = b.getAttribute('data-bsm-kind');
      if (k === st.kind) return;
      st.kind = k;
      st.type = k === KIND.move ? '' : TYPES[k][0];
      st.lines = [];
      el.querySelectorAll('[data-bsm-kind]').forEach((x) => x.classList.toggle('on', x === b));
      paintWhy(el, d); paintPick(el, d);
    }));
    paintWhy(el, d); paintPick(el, d);
    d.armScanCapture((code) => onScan(el, d, code));
  });
}

function paintWhy(el, d) {
  const esc = d.esc;
  const box = el.querySelector('#bsm-why');
  if (!box) return;
  const chip = (id) => { const t = typeOf(id); return t ? '<button type="button" class="bsm-chip" data-bsm-type="' + esc(id) + '" aria-pressed="' + (st.type === id) + '">' + esc(tr(LABEL[id] || t.label)) + '</button>' : ''; };
  if (st.kind !== KIND.move) {
    box.innerHTML = '<div class="bsm-sec"><p class="bsm-lab">' + esc(tr('Motif')) + '</p><div class="bsm-chips">' + TYPES[st.kind].map(chip).join('') + '</div></div>';
  } else {
    const list = shops();
    const dests = list.length
      ? '<div class="bsm-dests">' + list.map((s) => '<button type="button" class="bsm-dest" data-bsm-shop="' + esc(s.merchant) + '"><span class="bsm-ic"><i data-icon="storefront"></i></span><span class="bsm-dt"><b>' + esc(s.name || s.merchant) + '</b><small>'
        + esc(tr('Envoi suivi : {shop} reçoit et confirme les pièces.', { shop: s.name || s.merchant })) + '</small></span></button>').join('') + '</div>'
      : '<div class="bsm-note"><i data-icon="info"></i><span>' + esc(tr('Aucune autre boutique reliée. Pour un envoi suivi, les boutiques doivent partager le même catalogue.')) + '</span></div>';
    box.innerHTML = '<div class="bsm-sec"><p class="bsm-lab">' + esc(tr('Vers une boutique')) + '</p>' + dests + '</div>'
      + '<div class="bsm-sec"><p class="bsm-lab">' + esc(tr('Ou un autre lieu (dépôt, atelier…)')) + '</p><div class="bsm-chips">'
      + TYPES.move.map((id) => '<button type="button" class="bsm-chip" data-bsm-type="' + esc(id) + '" aria-pressed="' + (st.type === id) + '">'
        + esc(tr(id === 'transfert-out' ? 'Vers un autre lieu' : 'Depuis un autre lieu')) + '</button>').join('') + '</div></div>';
  }
  box.querySelectorAll('[data-bsm-type]').forEach((b) => b.addEventListener('click', () => {
    const was = out();
    st.type = b.getAttribute('data-bsm-type');
    box.querySelectorAll('[data-bsm-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (out() && !was) st.lines.forEach((l) => { l.qty = Math.min(l.qty, l.stock); });
    st.lines = st.lines.filter((l) => l.qty > 0);
    paintPick(el, d);
  }));
  box.querySelectorAll('[data-bsm-shop]').forEach((b) => b.addEventListener('click', () => {
    const m = b.getAttribute('data-bsm-shop');
    const x = el.querySelector('[data-inv-x]');
    if (x) x.click();   // la fenêtre de l'inventaire se ferme, l'envoi suivi prend la main
    if (!startTransfer(m)) d.toast(tr('Transferts indisponibles. Rechargez la caisse.'), 4000, LEVEL.warn);
  }));
  d.icons();
}

function paintPick(el, d) {
  const esc = d.esc;
  const box = el.querySelector('#bsm-pick');
  if (!box) return;
  if (!st.type) { box.innerHTML = ''; return; }
  const t = typeOf(st.type);
  const field = (id, label, ph, val) => '<label><span class="bsm-lab">' + esc(label) + '</span><input id="' + id + '" type="text" autocomplete="off" maxlength="120" value="' + esc(val) + '" placeholder="' + esc(ph) + '" /></label>';
  box.innerHTML = '<div class="bsm-sec"><p class="bsm-lab">' + esc(tr('Articles')) + '</p>'
    + '<div class="bsm-find"><i data-icon="search"></i><input id="bsm-q" type="search" autocomplete="off" value="' + esc(st.q) + '" placeholder="' + esc(tr('Nom de l’article ou code-barres')) + '" /></div>'
    + '<div id="bsm-hits"></div>'
    + '<span class="bsm-hint">' + esc(tr('Ou scannez l’étiquette.')) + '</span>'
    + '<div id="bsm-lines"></div></div>'
    + '<div class="bsm-fields">'
    + (PLACE[st.type] ? field(FIELD.place, tr('Lieu'), tr('Dépôt, atelier, adresse…'), st.place) : '')
    + (t && t.supplier ? field(FIELD.sup, tr('Fournisseur'), tr('Facultatif'), st.supplier) : '')
    + field(FIELD.ref, tr('Référence'), tr('Bon de livraison, facture…'), st.ref)
    + field(FIELD.note, tr('Note'), tr('Facultatif'), st.note)
    + '</div>'
    + '<div class="bsm-foot"><div><b id="bsm-sum"></b><small>' + esc(tr('Le code d’un responsable est demandé à l’enregistrement.')) + '</small></div>'
    + '<div class="bsm-acts"><button type="button" class="bq-btn secondary" data-bsm-back2>' + esc(tr('Annuler')) + '</button>'
    + '<button type="button" class="bq-btn primary" id="bsm-save"><i data-icon="check"></i>' + esc(tr('Enregistrer')) + '</button></div></div>';
  const q = box.querySelector('#bsm-q');
  q.addEventListener('input', () => { st.q = q.value; paintHits(el, d); });
  q.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = q.value.trim();
    if (code && addByCode(el, d, code)) { st.q = ''; q.value = ''; paintHits(el, d); }
  });
  const bind = (id, key) => { const i = box.querySelector('#' + id); if (i) i.addEventListener('input', () => { st[key] = i.value; paintSum(el, d); }); };
  bind(FIELD.place, 'place'); bind(FIELD.sup, 'supplier'); bind(FIELD.ref, 'ref'); bind(FIELD.note, 'note');
  box.querySelector('[data-bsm-back2]').addEventListener('click', () => { d.disarmScanCapture(); chooser(d); });
  box.querySelector('#bsm-save').addEventListener('click', () => save(el, d));
  paintHits(el, d); paintLines(el, d);
  d.icons();
}

function search(d, q) {
  const cat = d.catDB && d.catDB();
  if (!cat || !q) return [];
  const ql = q.toLowerCase();
  const hits = [];
  const byCode = cat.findByBarcode && cat.findByBarcode(q.trim());
  if (byCode && byCode.variant) hits.push({ p: byCode.product || {}, v: byCode.variant });
  (cat.listProducts({ q: ql }) || []).some((p) => {
    (cat.listVariants(p.id) || []).forEach((v) => { if (hits.length < MAX_HITS && !hits.some((h) => h.v.id === v.id)) hits.push({ p, v }); });
    return hits.length >= MAX_HITS;
  });
  return hits;
}

function paintHits(el, d) {
  const esc = d.esc;
  const box = el.querySelector('#bsm-hits');
  if (!box) return;
  const q = st.q.trim();
  if (!q) { box.innerHTML = ''; return; }
  const hits = search(d, q);
  if (!hits.length) { box.innerHTML = '<div class="bsm-hits"><div class="bsm-empty">' + esc(tr('Aucun article trouvé')) + '</div></div>'; return; }
  box.innerHTML = '<div class="bsm-hits">' + hits.map(({ p, v }) => {
    const stock = Math.max(0, +v.stock || 0);
    const off = out() && stock <= 0;
    return '<button type="button" class="bsm-hit" data-bsm-add="' + esc(v.id) + '"' + (off ? ' disabled' : '') + '><span><b>' + esc(p.name || '·') + '</b><small>' + esc(variantName(v) || '·') + '</small></span>'
      + '<em>' + esc(tr('En stock')) + ' ' + stock + '</em><i data-icon="add_circle"></i></button>';
  }).join('') + '</div>';
  box.querySelectorAll('[data-bsm-add]').forEach((b) => b.addEventListener('click', () => {
    const hit = hits.find((h) => h.v.id === b.getAttribute('data-bsm-add'));
    if (hit && add(el, d, hit.p, hit.v)) {
      st.q = '';
      const i = el.querySelector('#bsm-q'); if (i) { i.value = ''; i.focus(); }
      paintHits(el, d);
    }
  }));
  d.icons();
}

function add(el, d, p, v) {
  const stock = Math.max(0, +v.stock || 0);
  const line = st.lines.find((l) => l.vid === v.id);
  if (out() && (line ? line.qty : 0) + 1 > stock) { d.toast(tr('Plus de stock ici pour cet article.'), 3000, LEVEL.warn); return false; }
  if (line) line.qty += 1;
  else {
    if (st.lines.length >= MAX_LINES) { d.toast(tr('{n} lignes au plus par mouvement.', { n: MAX_LINES }), 3000, LEVEL.warn); return false; }
    st.lines.push({ vid: v.id, pid: p.id || v.productId, name: p.name || '', variant: variantName(v), stock, qty: 1 });
  }
  paintLines(el, d);
  return true;
}

function addByCode(el, d, raw) {
  const code = d.normScan ? d.normScan(raw) : String(raw || '').trim();
  const cat = d.catDB && d.catDB();
  const hit = code && cat && cat.findByBarcode ? cat.findByBarcode(code) : null;
  if (!hit || !hit.variant) { d.toast(tr('Code inconnu : {code}', { code }), 3000, LEVEL.warn); return false; }
  return add(el, d, hit.product || {}, hit.variant);
}

function onScan(el, d, raw) {
  if (!el.isConnected || !el.querySelector('[data-bsm-form]')) return;
  if (!st.type) return;   // transfert sans destination choisie : rien à remplir encore
  if (!addByCode(el, d, raw)) return;
  /* La douchette tape dans le champ de recherche avant que la capture la
     reconnaisse : on le vide, sinon la liste des résultats reste ouverte. */
  st.q = '';
  const i = el.querySelector('#bsm-q'); if (i) i.value = '';
  paintHits(el, d);
}

function paintLines(el, d) {
  const esc = d.esc;
  const box = el.querySelector('#bsm-lines');
  if (!box) return;
  const t = typeOf(st.type);
  const dir = t ? t.dir : 1;
  if (!st.lines.length) {
    box.innerHTML = '<div class="bsm-note"><i data-icon="barcode_scanner"></i><span>' + esc(tr('Ajoutez des articles : cherchez-les ou scannez-les.')) + '</span></div>';
  } else {
    box.innerHTML = '<div class="bsm-lines">' + st.lines.map((l) => {
      const after = l.stock + dir * l.qty;
      return '<div class="bsm-line" data-bsm-line="' + esc(l.vid) + '"><span><b>' + esc(l.name || '·') + '</b><small>' + esc(l.variant || '·') + '</small></span>'
        + '<span><small>' + esc(tr('En stock')) + '</small>' + l.stock + '</span>'
        + '<span class="bsm-step"><button type="button" data-bsm-dec aria-label="−">−</button><input type="number" inputmode="numeric" min="1" value="' + l.qty + '" aria-label="' + esc(l.name) + '" /><button type="button" data-bsm-inc aria-label="+">+</button></span>'
        + '<span class="bsm-after ' + (dir > 0 ? 'in' : 'out') + '"><small>' + esc(tr('Après')) + '</small>' + after + '</span>'
        + '<button type="button" class="bsm-x" data-bsm-rm aria-label="' + esc(tr('Retirer')) + '"><i data-icon="delete"></i></button></div>';
    }).join('') + '</div>';
    box.querySelectorAll('[data-bsm-line]').forEach((row) => {
      const l = st.lines.find((x) => x.vid === row.getAttribute('data-bsm-line'));
      const cap = (n) => {
        if (out() && n > l.stock) { d.toast(tr('Plus de stock ici pour cet article.'), 3000, LEVEL.warn); return l.stock; }
        return n;
      };
      row.querySelector('[data-bsm-inc]').addEventListener('click', () => { l.qty = cap(l.qty + 1); paintLines(el, d); });
      row.querySelector('[data-bsm-dec]').addEventListener('click', () => {
        l.qty -= 1;
        if (l.qty <= 0) st.lines = st.lines.filter((x) => x !== l);
        paintLines(el, d);
      });
      row.querySelector('[data-bsm-rm]').addEventListener('click', () => { st.lines = st.lines.filter((x) => x !== l); paintLines(el, d); });
      const inp = row.querySelector('input');
      inp.addEventListener('change', () => {
        const n = Math.max(1, Math.trunc(+inp.value || 1));
        l.qty = cap(n); paintLines(el, d);
      });
    });
  }
  paintSum(el, d);
  d.icons();
}

function paintSum(el, d) {
  const sum = el.querySelector('#bsm-sum');
  if (sum) sum.textContent = tr('{n} article(s) · {p} pièce(s)', { n: st.lines.length, p: pieces() });
  const btn = el.querySelector('#bsm-save');
  if (btn) btn.disabled = st.busy || !st.lines.length || (!!PLACE[st.type] && !st.place.trim());
}

function failText(res) {
  const r = res && res.reason;
  if (r === 'stock-insuffisant') {
    const l = st.lines[res.index] || {};
    return tr('Stock insuffisant pour {item} ({n} en stock).', { item: [l.name, l.variant].filter(Boolean).join(' · '), n: res.before == null ? 0 : res.before });
  }
  if (r === 'variante-introuvable' || r === 'type') return tr('Article introuvable. Rechargez la caisse.');
  if (r === 'non-autorise') return tr('Mouvement annulé : le code responsable n’a pas été validé.');
  if (r === 'reseau') return tr('Hors ligne : rien n’a bougé. Réessayez une fois la connexion revenue.');
  return tr('Le serveur a refusé le mouvement, rien n’a bougé ({why}).', { why: r || '?' });
}

function save(el, d) {
  const MZ = window.KiwiMaisonStock;
  if (!MZ || typeof MZ.requestManualBatch !== 'function') { d.toast(tr('Registre des mouvements indisponible. Rechargez la caisse.'), 4000, LEVEL.warn); return; }
  if (st.busy || !st.lines.length) return;
  if (PLACE[st.type] && !st.place.trim()) { d.toast(tr('Indiquez le lieu.'), 3000, LEVEL.warn); return; }
  const note = [PLACE[st.type] ? tr('Lieu') + ' : ' + st.place.trim() : '', st.note.trim()].filter(Boolean).join(' · ');
  const list = st.lines.map((l) => ({
    productId: l.pid, variantId: l.vid, type: st.type, qty: l.qty,
    supplier: st.supplier.trim(), ref: st.ref.trim(), note, source: 'caisse',
  }));
  st.busy = true; paintSum(el, d);
  MZ.requestManualBatch(list).then((res) => {
    st.busy = false;
    if (!res || !res.ok) { if (el.isConnected) paintSum(el, d); d.toast(failText(res), 5000, LEVEL.warn); return; }
    d.toast(tr('Mouvement enregistré · {p} pièce(s)', { p: res.pieces }), 3500, LEVEL.success);
    d.disarmScanCapture();
    reset();
    if (el.isConnected) history(d);
  });
}

/* d : { setModal, esc, icons, catDB, toast, armScanCapture, disarmScanCapture, normScan } (inventory.js). */
export function openStockMoves(d) {
  const noop = () => {};
  d = Object.assign({ armScanCapture: noop, disarmScanCapture: noop, icons: noop, toast: noop }, d);
  if (!window.KiwiMaisonStock || typeof window.KiwiMaisonStock.list !== 'function') { d.toast(tr('Registre des mouvements indisponible. Rechargez la caisse.')); return; }
  /* Le registre ne s'accroche au catalogue qu'à la première vente
     (pos-boutique.js persistStock) : sans ceci, une caisse fraîchement ouverte
     bougerait le stock sans écrire la ligne, donc sans code responsable. */
  try { window.KiwiMaisonStock.enable(MODULE); } catch (_) {}
  css();
  chooser(d);
}
