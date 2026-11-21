/* Équipe · onglet « Commissions » : ce que le propriétaire doit à
 * chaque vendeur sur la période affichée, et l'endroit où il le règle.
 *
 * · Les ventes viennent de /api/commissions (le calcul de l'assiette vit sur le
 *   serveur, functions/api/_commissions.js : la caisse, le tableau de bord et un
 *   second appareil comptent la même vente le même jour).
 * · Le TAUX, lui, se règle ici même, dans le classement : le propriétaire tape
 *   5 dans la case d'un vendeur et la commission se recalcule sur-le-champ,
 *   avec le taux de la fiche Équipe locale (la même que la fiche profil, écrite
 *   par saveCustomTeams). Pas d'aller-retour fiche par fiche.
 * · Tant que personne n'a de taux ni de vente attribuée, l'onglet est une mise
 *   en place en trois temps, la liste de l'équipe juste dessous.
 *
 * Visible seulement quand le commerce a l'option « Commissions vendeurs »
 * (features.sellerCommissions, kiwi-admin) ET que le tableau de bord tourne sur
 * le kit 2027 (data-skin-2027="dashboard"), pour le propriétaire : onglet de la page Équipe. */

export function sellerCommissionsOn(doc = globalThis.document, cfg = globalThis.window?.KiwiConfig) {
  try {
    return cfg?.features?.sellerCommissions === true
      && doc?.documentElement?.getAttribute('data-skin-2027') === 'dashboard';
  } catch (_) { return false; }
}

const STRINGS = {
  fr: {
    tab: 'Commissions',
    eyebrow: (a, b) => `Commissions dues · du ${a} au ${b}`,
    lede: (net, n) => `sur ${net} de ventes attribuées à ${n} vendeur${n > 1 ? 's' : ''}, remboursements déduits`,
    ledeNone: 'Aucune vente attribuée sur cette période pour l’instant.',
    share: (p) => `${p} % des ventes ont un vendeur`,
    shareAll: 'Toutes les ventes ont un vendeur',
    loose: (n, amt) => `${n} ticket${n > 1 ? 's' : ''} · ${amt} sans vendeur`,
    tickets: (n) => `${n} ticket${n > 1 ? 's' : ''}`, net: 'net', quiet: 'Pas encore de vente sur la période',
    refunded: (amt) => `${amt} remboursés déduits`,
    rate: 'Taux', rateOf: (name) => `Taux de commission de ${name}`,
    math: (r, amt) => `= ${r} % de ${amt}`, unset: 'Donnez un taux', example: 'ex. 5', colRate: 'Taux', colDue: 'À verser',
    pending: (who, amt) => `${who} · ${amt} pas encore comptés : taux manquant`, pendingMany: (n) => `${n} vendeurs`,
    fixPick: 'Pour qu’elles comptent : toucher le nom du vendeur avant d’encaisser.',
    fixCode: 'Pour qu’elles comptent : chaque vendeur saisit son code avant d’encaisser.',
    top: 'En tête', notTeam: 'n’est plus dans l’équipe',
    others: 'Sans commission pour l’instant',
    othersHint: 'Tapez un taux pour qu’une personne touche une commission. Laissez vide : pas de commission.',
    saved: (name, r) => (r ? `Taux de ${name} : ${r} %` : `${name} ne touche plus de commission`),
    loading: 'Calcul des commissions…',
    error: 'Les commissions ne se chargent pas.', retry: 'Réessayer',
    how: 'Comment c’est calculé',
    howRules: [
      'Chaque vendeur touche son taux sur ce qu’il a encaissé pendant la période.',
      'Un article rendu reprend la commission de qui l’avait vendu, même si c’est un autre qui l’a remboursé.',
      'Une vente annulée ne compte pas. Une vente réglée en avoir ne compte qu’une fois.',
    ],
    modeCode: 'À la caisse, une vente est attribuée à la personne qui a saisi son code.',
    modePick: 'À la caisse, la caissière touche le nom du vendeur à l’encaissement.',
    setupTitle: 'Payez vos vendeurs à la commission, sans rien calculer.',
    setupLede: (how) => `Tapez un taux à côté de chaque vendeur. ${how} Leurs commissions s’afficheront ici, remboursements déduits.`,
    stepCode: 'À la caisse, chaque vendeur saisit son code avant d’encaisser.',
    stepPick: 'À la caisse, la caissière touche le nom du vendeur en encaissant.',
    team: 'Votre équipe', noTeam: 'Ajoutez d’abord vos vendeurs dans Équipe.',
  },
  en: {
    tab: 'Commissions',
    eyebrow: (a, b) => `Commissions due · ${a} to ${b}`,
    lede: (net, n) => `on ${net} of sales by ${n} seller${n > 1 ? 's' : ''}, refunds deducted`,
    ledeNone: 'No attributed sales in this period yet.',
    share: (p) => `${p}% of sales have a seller`,
    shareAll: 'Every sale has a seller',
    loose: (n, amt) => `${n} ticket${n > 1 ? 's' : ''} · ${amt} with no seller`,
    tickets: (n) => `${n} ticket${n > 1 ? 's' : ''}`, net: 'net', quiet: 'No sales yet in this period',
    refunded: (amt) => `${amt} refunded, deducted`,
    rate: 'Rate', rateOf: (name) => `${name}’s commission rate`,
    math: (r, amt) => `= ${r}% of ${amt}`, unset: 'Set a rate', example: 'e.g. 5', colRate: 'Rate', colDue: 'To pay',
    pending: (who, amt) => `${who} · ${amt} not counted yet: no rate`, pendingMany: (n) => `${n} sellers`,
    fixPick: 'To count them: tap the seller’s name before taking payment.',
    fixCode: 'To count them: each seller enters their code before taking payment.',
    top: 'Top seller', notTeam: 'no longer in the team',
    others: 'No commission for now',
    othersHint: 'Type a rate to give someone a commission. Leave it empty: no commission.',
    saved: (name, r) => (r ? `${name}’s rate: ${r}%` : `${name} no longer earns commission`),
    loading: 'Working out commissions…',
    error: 'Commissions did not load.', retry: 'Try again',
    how: 'How it is worked out',
    howRules: [
      'Each seller earns their rate on what they took during the period.',
      'A returned item takes the commission back from whoever sold it, even if someone else refunded it.',
      'A voided sale does not count. A sale paid with store credit counts once.',
    ],
    modeCode: 'On the till, a sale goes to whoever entered their code.',
    modePick: 'On the till, the cashier taps the seller’s name when taking payment.',
    setupTitle: 'Pay your sellers on commission, with nothing to work out.',
    setupLede: (how) => `Type a rate next to each seller. ${how} Their commissions will show here, refunds deducted.`,
    stepCode: 'On the till, each seller enters their code before taking payment.',
    stepPick: 'On the till, the cashier taps the seller’s name when taking payment.',
    team: 'Your team', noTeam: 'Add your sellers in Team first.',
  },
  ar: {
    tab: 'العمولات',
    eyebrow: (a, b) => `العمولات المستحقة · من ${a} إلى ${b}`,
    lede: (net, n) => `على ${net} من المبيعات باسم ${n} ${n > 1 ? 'بائعين' : 'بائع'}، بعد خصم المرتجعات`,
    ledeNone: 'لا مبيعات باسم أي بائع في هذه الفترة بعد.',
    share: (p) => `${p}٪ من المبيعات معروف بائعها`,
    shareAll: 'كل المبيعات معروف بائعها',
    loose: (n, amt) => `${n} ${n > 1 ? 'تذاكر' : 'تذكرة'} · ${amt} بلا بائع`,
    tickets: (n) => `${n} ${n > 1 ? 'تذاكر' : 'تذكرة'}`, net: 'صافي', quiet: 'لا مبيعات بعد في هذه الفترة',
    refunded: (amt) => `خُصم منها ${amt} مرتجعات`,
    rate: 'النسبة', rateOf: (name) => `نسبة عمولة ${name}`,
    math: (r, amt) => `= ${r}٪ من ${amt}`, unset: 'حدّد النسبة', example: 'مثلاً 5', colRate: 'النسبة', colDue: 'للدفع',
    pending: (who, amt) => `${who} · ${amt} لم تُحسب بعد: النسبة غير محدّدة`, pendingMany: (n) => `${n} بائعين`,
    fixPick: 'لكي تُحسب: المسي اسم البائع قبل الدفع.',
    fixCode: 'لكي تُحسب: يُدخل كل بائع رمزه قبل الدفع.',
    top: 'الأول', notTeam: 'لم يعد ضمن الفريق',
    others: 'بلا عمولة حالياً',
    othersHint: 'اكتب نسبة ليأخذ صاحبها عمولة. اتركها فارغة: لا عمولة.',
    saved: (name, r) => (r ? `نسبة ${name}: ${r}٪` : `${name} لم يعد يأخذ عمولة`),
    loading: 'نحسب العمولات…',
    error: 'تعذّر تحميل العمولات.', retry: 'أعد المحاولة',
    how: 'كيف نحسبها',
    howRules: [
      'يأخذ كل بائع نسبته مما قبضه خلال الفترة.',
      'إذا رُدّت قطعة، تُسترجع العمولة ممن باعها، ولو أرجع المال شخص آخر.',
      'البيعة الملغاة لا تُحسب، والبيعة المدفوعة برصيد المحل تُحسب مرة واحدة.',
    ],
    modeCode: 'في الصندوق، تُنسب البيعة لمن أدخل رمزه.',
    modePick: 'في الصندوق، تختار أمينة الصندوق اسم البائع عند الدفع.',
    setupTitle: 'ادفع لبائعيك بالعمولة، دون أي حساب.',
    setupLede: (how) => `اكتب النسبة أمام اسم كل بائع. ${how} وستظهر عمولاتهم هنا بعد خصم المرتجعات.`,
    stepCode: 'في الصندوق، يُدخل كل بائع رمزه قبل الدفع.',
    stepPick: 'في الصندوق، تلمس أمينة الصندوق اسم البائع عند الدفع.',
    team: 'فريقك', noTeam: 'أضف بائعيك أولاً في صفحة الفريق.',
  },
};

const CSS = `
.dash-equipe .kt-com{display:flex;flex-direction:column;gap:18px}
.dash-equipe .kt-com-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,300px);gap:28px;align-items:end;padding:26px 28px;border:1px solid var(--n-200);border-radius:16px;background:var(--surface)}
.dash-equipe .kt-com-eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--n-500)}
.dash-equipe .kt-com-big{margin:10px 0 8px;font-size:clamp(34px,4.2vw,48px);line-height:1;font-weight:500;letter-spacing:-.035em;font-variant-numeric:tabular-nums;color:var(--ink)}
.dash-equipe .kt-com-big small{font-size:.42em;letter-spacing:0;color:var(--n-500);margin-inline-start:6px;font-weight:500}
.dash-equipe .kt-com-lede{margin:0;color:var(--n-600,var(--n-500));font-size:13.5px;line-height:1.5}
.dash-equipe .kt-com-health{display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--ink)}
.dash-equipe .kt-com-health span{color:var(--n-500);font-size:12px}
.dash-equipe .kt-com-meter{height:6px;border-radius:999px;background:var(--n-100);overflow:hidden}
.dash-equipe .kt-com-meter i{display:block;height:100%;border-radius:inherit;background:var(--atlas)}
.dash-equipe .kt-com-board{list-style:none;margin:0;padding:0;border:1px solid var(--n-200);border-radius:16px;background:var(--surface);overflow:hidden}
.dash-equipe .kt-com-row{display:grid;grid-template-columns:38px minmax(0,1fr) 96px minmax(150px,190px);gap:14px;align-items:center;padding:16px 22px;border-bottom:1px solid var(--n-100)}
.dash-equipe .kt-com-row:last-child{border-bottom:0}
.dash-equipe .kt-com-board.kt-com-flat{border:0;border-radius:0;background:transparent}
.dash-equipe .kt-com-head{padding-block:10px;background:var(--paper-soft);font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--n-500)}
.dash-equipe .kt-com-head span:nth-child(3){text-align:center}.dash-equipe .kt-com-head span:last-child{text-align:end}
.dash-equipe .kt-com-pending{margin:8px 0 0;font-size:12.5px;color:var(--atlas);font-weight:500}
.dash-equipe .kt-com-row .eq-av{width:38px;height:38px;font-size:13px}
.dash-equipe .kt-com-who{min-width:0}
.dash-equipe .kt-com-name{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dash-equipe .kt-com-tag{flex:none;font-weight:500;font-size:10.5px;letter-spacing:.04em;padding:2px 8px;border-radius:999px;background:var(--mint-soft,rgba(11,110,79,.08));color:var(--atlas)}
.dash-equipe .kt-com-tag.is-out{background:var(--n-100);color:var(--n-500)}
.dash-equipe .kt-com-sub{margin-top:3px;font-size:12px;color:var(--n-500);font-variant-numeric:tabular-nums}
.dash-equipe .kt-com-bar{margin-top:9px;height:4px;border-radius:999px;background:var(--n-100);overflow:hidden}
.dash-equipe .kt-com-bar i{display:block;height:100%;border-radius:inherit;background:var(--atlas);opacity:.85}
.dash-equipe .kt-com-rate{position:relative;display:block}
.dash-equipe .kt-com-rate input{width:100%;box-sizing:border-box;padding:8px 26px 8px 12px;border:1px solid var(--n-300,var(--n-200));border-radius:999px;background:var(--surface);box-shadow:inset 0 1px 2px rgba(10,15,13,.06);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;text-align:end;font-variant-numeric:tabular-nums;-moz-appearance:textfield;transition:border-color .16s ease,background-color .16s ease}
.dash-equipe .kt-com-rate input::-webkit-inner-spin-button,.dash-equipe .kt-com-rate input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.dash-equipe .kt-com-rate input:placeholder-shown{border-style:dashed;font-weight:500;background:var(--paper-soft);box-shadow:none}
.dash-equipe .kt-com-rate input::placeholder{color:var(--n-500);font-size:12px}
.dash-equipe .kt-com-rate input:hover{border-color:var(--atlas)}
.dash-equipe .kt-com-rate input:focus{outline:none;border-color:var(--atlas);box-shadow:0 0 0 3px rgba(11,110,79,.14)}
.dash-equipe .kt-com-rate b{position:absolute;inset-inline-end:12px;top:50%;transform:translateY(-50%);font-size:12px;font-weight:500;color:var(--n-500);pointer-events:none}
[dir="rtl"] .dash-equipe .kt-com-rate input{padding:8px 12px 8px 26px}
.dash-equipe .kt-com-due{text-align:end}
.dash-equipe .kt-com-due b{display:block;font-size:17px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--ink)}
.dash-equipe .kt-com-due span{display:block;margin-top:3px;font-family:var(--mono);font-size:11px;color:var(--n-500);font-variant-numeric:tabular-nums}
.dash-equipe .kt-com-due .is-unset{font-family:inherit;color:var(--atlas);font-size:13px;font-weight:500;cursor:pointer;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
.dash-equipe .kt-com-row.needs-rate .kt-com-rate input{border-color:var(--atlas);background:var(--mint-soft,rgba(11,110,79,.06))}
.dash-equipe .kt-com-row.is-quiet .kt-com-due b{color:var(--n-500);font-weight:500;font-size:13px}
.dash-equipe .kt-com-section{padding:18px 22px 6px;border:1px solid var(--n-200);border-radius:16px;background:var(--surface)}
.dash-equipe .kt-com-section h4{margin:0;font-size:13px;font-weight:600;color:var(--ink)}
.dash-equipe .kt-com-section p{margin:4px 0 6px;font-size:12.5px;color:var(--n-500);line-height:1.5}
.dash-equipe .kt-com-section .kt-com-row{grid-template-columns:38px minmax(0,1fr) 96px;padding:12px 0;border-bottom:1px solid var(--n-100)}
.dash-equipe .kt-com-section .kt-com-flat{max-width:640px}
.dash-equipe .kt-com-section .kt-com-row:last-child{border-bottom:0}
.dash-equipe .kt-com-setup{padding:26px 28px;border:1px solid var(--n-200);border-radius:16px;background:var(--surface)}
.dash-equipe .kt-com-setup p{margin:0;max-width:62ch;font-size:14px;line-height:1.6;color:var(--n-600,var(--n-500))}
.dash-equipe .kt-com-setup h3{margin:0 0 10px;font-size:clamp(20px,2.2vw,26px);font-weight:500;letter-spacing:-.02em;line-height:1.2;color:var(--ink);max-width:28ch}
.dash-equipe .kt-com-how{font-size:12.5px;color:var(--n-500)}
.dash-equipe .kt-com-how{padding:0 4px}
.dash-equipe .kt-com-how summary{cursor:pointer;color:var(--ink);font-weight:500;width:max-content;list-style:none;display:flex;align-items:center;gap:10px}
.dash-equipe .kt-com-how summary::-webkit-details-marker{display:none}
.dash-equipe .kt-com-how summary::before{content:'';width:6px;height:6px;border-inline-end:1.5px solid var(--atlas);border-bottom:1.5px solid var(--atlas);transform:rotate(-45deg);transition:transform .31s cubic-bezier(.34,1.45,.5,1)}
[dir="rtl"] .dash-equipe .kt-com-how summary::before{transform:rotate(45deg)}
.dash-equipe .kt-com-how[open] summary::before{transform:rotate(45deg)}
.dash-equipe .kt-com-how ul{margin:8px 0 0;padding-inline-start:18px;line-height:1.6}
.dash-equipe .kt-com-state{display:flex;align-items:center;gap:14px;padding:22px 24px;border:1px solid var(--n-200);border-radius:16px;background:var(--surface);color:var(--n-500);font-size:13px}
@media (max-width:760px){
  .dash-equipe .kt-com-hero{grid-template-columns:1fr;gap:18px;padding:22px}
  .dash-equipe .kt-com-row{grid-template-columns:38px minmax(0,1fr) 84px;row-gap:10px;padding:14px 16px}
  .dash-equipe .kt-com-head{display:none}
  .dash-equipe .kt-com-due{grid-column:2 / -1;text-align:start;display:flex;align-items:baseline;gap:10px}
  .dash-equipe .kt-com-due span{margin:0}
  .dash-equipe .kt-com-setup,.dash-equipe .kt-com-section{padding-inline:16px}
}`;

function injectCss(doc) {
  try {
    if (!doc || doc.getElementById('kt-com-css')) return;
    const s = doc.createElement('style');
    s.id = 'kt-com-css';
    s.textContent = CSS;
    doc.head.appendChild(s);
  } catch (_) {}
}

const rateOf = (m) => { const r = Number(m && m.commissionRate); return Number.isFinite(r) && r > 0 ? Math.min(100, r) : null; };
const fmtRate = (r) => String(Math.round(r * 100) / 100);

/* Le classement : les ventes du serveur, le taux de la fiche Équipe locale
   (ce que le propriétaire vient de taper), plus les vendeurs avec un taux et
   sans vente. Pur, testé par tools/seller-commissions-test.mjs. */
export function commissionBoard(report, members, nameOf = (m) => String((m && m.name) || '')) {
  const team = (Array.isArray(members) ? members : []).filter((m) => m && m.id && !m.deleted);
  const byId = new Map(team.map((m) => [String(m.id), m]));
  const rows = (report && Array.isArray(report.sellers) ? report.sellers : []).map((s) => {
    const member = s.memberId ? byId.get(String(s.memberId)) || null : null;
    const rate = member ? rateOf(member) : (s.rate == null ? null : Number(s.rate));
    const netCents = Number(s.netCents) || 0;
    return { ...s, member, rate, netCents, commissionCents: rate == null ? null : Math.round(netCents * rate / 100) };
  });
  for (const m of team) {
    const rate = rateOf(m);
    if (rate != null && !rows.some((r) => r.memberId === String(m.id))) {
      rows.push({ key: 'm:' + m.id, memberId: String(m.id), name: nameOf(m), member: m, rate, inTeam: true, tickets: 0, salesCents: 0, refundCents: 0, netCents: 0, commissionCents: 0 });
    }
  }
  /* Un vendeur sans taux et sans vente n'a rien à faire dans le classement. */
  const board = rows.filter((r) => r.rate != null || r.netCents !== 0 || r.tickets > 0)
    .sort((a, b) => b.netCents - a.netCents || String(a.name).localeCompare(String(b.name), 'fr'));
  const others = team.filter((m) => !board.some((r) => r.memberId === String(m.id)));
  const loose = (report && report.unattributed) || { tickets: 0, netCents: 0 };
  const netCents = board.reduce((n, r) => n + r.netCents, 0);
  /* L'assiette du total : seulement les vendeurs qui ont un taux. Un vendeur sans
     taux n'est pas compté dedans, il est nommé à part (« taux manquant »). */
  const counted = board.filter((r) => r.commissionCents != null && (r.netCents !== 0 || r.tickets > 0));
  const pending = board.filter((r) => r.commissionCents == null && (r.netCents !== 0 || r.tickets > 0));
  const looseCents = Math.max(0, Number(loose.netCents) || 0);
  return {
    board, others,
    loose: { tickets: Number(loose.tickets) || 0, netCents: looseCents },
    dueCents: board.reduce((n, r) => n + (r.commissionCents || 0), 0),
    netCents,
    countedCents: counted.reduce((n, r) => n + r.netCents, 0), counted: counted.length,
    pending: { names: pending.map((r) => (r.member ? nameOf(r.member) : r.name)), netCents: pending.reduce((n, r) => n + r.netCents, 0) },
    sellers: board.filter((r) => r.netCents !== 0 || r.tickets > 0).length,
    sharePct: netCents + looseCents > 0 ? Math.floor(netCents / (netCents + looseCents) * 100) : null,
    rated: board.some((r) => r.rate != null),
  };
}

let active = null;   // l'onglet ouvert, pour l'écouteur des cases de taux
function onRateChange(e) {
  const input = e.target && e.target.closest ? e.target.closest('input[data-kt-com-rate]') : null;
  if (!input || !active) return;
  active.setRate(input.getAttribute('data-kt-com-rate'), input.value);
}
function onRateKey(e) {
  if (e.key === 'Enter' && e.target && e.target.matches && e.target.matches('input[data-kt-com-rate]')) e.target.blur();
}

export function createSellerCommissions({ esc, fmtPay, trLang, slug, render, fetchImpl, members, saveMembers, initials, avatarColors, memberName, roleName, toast, pickerMode }) {
  const cache = new Map();   // clé période → { state: 'loading'|'ok'|'error', data }
  const T = () => STRINGS[trLang()] || STRINGS.fr;
  const money = (c) => esc(fmtPay((Number(c) || 0) / 100)) + ' MAD';
  const nameOf = (m) => (memberName ? memberName(m) : String((m && (m.name || [m.firstName, m.lastName].filter(Boolean).join(' '))) || ''));
  const team = () => { try { return (members && members()) || []; } catch (_) { return []; } };
  const doc = globalThis.document;
  injectCss(doc);
  if (doc && !doc.__ktComBound) {
    doc.__ktComBound = true;
    doc.addEventListener('change', onRateChange);
    doc.addEventListener('keydown', onRateKey);
  }

  function load(key, from, to) {
    const merchant = String((slug && slug()) || '');
    /* La démo n'a pas de commerce : rien d'attribué, mais la mise en place se montre. */
    if (!merchant) { cache.set(key, { state: 'ok', data: { sellers: [], unattributed: null } }); return; }
    cache.set(key, { state: 'loading' });
    const get = fetchImpl || globalThis.fetch;
    Promise.resolve()
      .then(() => get('/api/commissions?merchant=' + encodeURIComponent(merchant) + '&from=' + from + '&to=' + to,
        { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((data) => { cache.set(key, data && Array.isArray(data.sellers) ? { state: 'ok', data } : { state: 'error' }); })
      .catch(() => { cache.set(key, { state: 'error' }); })
      .then(() => { try { render(); } catch (_) {} });
  }

  function setRate(id, raw) {
    const m = team().find((x) => x && String(x.id) === String(id));
    if (!m) return;
    const n = parseFloat(String(raw).replace(',', '.'));
    const rate = Number.isFinite(n) && n > 0 ? Math.min(100, Math.round(n * 100) / 100) : 0;
    if ((rateOf(m) || 0) === rate) return;
    m.commissionRate = rate;
    try { if (saveMembers) saveMembers(); } catch (_) {}
    try { if (toast) toast(T().saved(nameOf(m), rate ? fmtRate(rate) : '')); } catch (_) {}
    try { render(); } catch (_) {}
  }

  const avatar = (m, name) => {
    const tone = (m && m.avatarTone) || 'a';
    const label = m && initials ? initials(m.firstName, m.lastName) : String(name || '?').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
    return `<span class="eq-av" style="background:${(avatarColors && (avatarColors[tone] || avatarColors.a)) || 'var(--atlas)'}">${esc(label)}</span>`;
  };
  const rateId = (m) => 'kt-com-r-' + String(m.id).replace(/[^A-Za-z0-9_-]/g, '_');
  const rateBox = (m, name) => `<label class="kt-com-rate"><input type="number" inputmode="decimal" min="0" max="100" step="0.5" id="${esc(rateId(m))}"
      data-kt-com-rate="${esc(String(m.id))}" value="${rateOf(m) == null ? '' : esc(fmtRate(rateOf(m)))}" placeholder="${esc(T().example)}"
      aria-label="${esc(T().rateOf(name))}"><b aria-hidden="true">%</b></label>`;

  function boardRow(r, i, top, t) {
    const name = r.member ? nameOf(r.member) : r.name;
    const width = top > 0 && r.netCents > 0 ? Math.max(2, Math.round(r.netCents / top * 100)) : 0;
    const sub = !r.netCents && !r.tickets ? esc(t.quiet)
      : [esc(t.tickets(r.tickets)), money(r.netCents) + ' ' + esc(t.net), r.refundCents ? esc(t.refunded(fmtPay(r.refundCents / 100) + ' MAD')) : ''].filter(Boolean).join(' · ');
    const tag = !r.inTeam || (!r.member && r.memberId) ? `<span class="kt-com-tag is-out">${esc(t.notTeam)}</span>` : (i === 0 && r.netCents > 0 && r.commissionCents ? `<span class="kt-com-tag">${esc(t.top)}</span>` : '');
    const due = r.commissionCents == null
      ? (r.member ? `<label class="is-unset" for="${esc(rateId(r.member))}">${esc(t.unset)}</label>` : `<span class="is-unset">·</span>`)
      : `<b>${money(r.commissionCents)}</b>${r.netCents ? `<span>${esc(t.math(fmtRate(r.rate), fmtPay(r.netCents / 100) + ' MAD'))}</span>` : ''}`;
    return `<li class="kt-com-row${r.netCents ? '' : ' is-quiet'}${r.member && r.rate == null ? ' needs-rate' : ''}" data-kt-seller="${esc(r.key)}">
        ${avatar(r.member, name)}
        <div class="kt-com-who"><div class="kt-com-name">${esc(name)}${tag}</div><div class="kt-com-sub">${sub}</div>
          ${width ? `<div class="kt-com-bar" aria-hidden="true"><i style="width:${width}%"></i></div>` : ''}</div>
        ${r.member ? rateBox(r.member, name) : `<span class="kt-com-sub" style="text-align:end">${r.rate == null ? '·' : esc(fmtRate(r.rate)) + ' %'}</span>`}
        <div class="kt-com-due">${due}</div>
      </li>`;
  }
  const role = (m) => { try { return roleName && m && m.function ? String(roleName(m.function) || '') : ''; } catch (_) { return ''; } };
  const sellerFirst = (list) => list.slice().sort((a, b) => Number(!/vend|conseil|caiss|sell|commerc|boutique/i.test(String(a.function || ''))) - Number(!/vend|conseil|caiss|sell|commerc|boutique/i.test(String(b.function || ''))));
  const teamRows = (list) => sellerFirst(list).map((m) => `<li class="kt-com-row">${avatar(m, nameOf(m))}
        <div class="kt-com-who"><div class="kt-com-name">${esc(nameOf(m))}</div>${role(m) ? `<div class="kt-com-sub">${esc(role(m))}</div>` : ''}</div>${rateBox(m, nameOf(m))}</li>`).join('');
  const how = (t) => `<details class="kt-com-how"><summary>${esc(t.how)}</summary><ul>
      <li>${esc(pickerMode && pickerMode() ? t.modePick : t.modeCode)}</li>${t.howRules.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`;

  function pane(period) {
    active = { setRate };
    const t = T();
    const from = period.days[0], to = period.days[period.days.length - 1];
    const key = from + '|' + to;
    if (!cache.has(key)) load(key, from, to);
    const entry = cache.get(key) || { state: 'loading' };
    if (entry.state === 'loading') return `<div class="kt-com-state" data-kt-commissions="loading" role="status">${esc(t.loading)}</div>`;
    if (entry.state === 'error') {
      return `<div class="kt-com-state" data-kt-commissions="error" role="status">${esc(t.error)}
        <button class="eq-pill" type="button" data-action="kt-tab" data-arg="commissions">${esc(t.retry)}</button></div>`;
    }
    const b = commissionBoard(entry.data, team(), nameOf);
    /* Personne n'a de taux, rien n'est attribué : la mise en place. */
    if (!b.rated && !b.sellers) {
      const list = team().filter((m) => m && m.id && !m.deleted);
      return `<div class="kt-com" data-kt-commissions="setup">
        <section class="kt-com-setup"><h3>${esc(t.setupTitle)}</h3>
          <p>${esc(t.setupLede(pickerMode && pickerMode() ? t.stepPick : t.stepCode))}</p></section>
        <section class="kt-com-section"><h4>${esc(t.team)}</h4>
          ${list.length ? `<p>${esc(t.othersHint)}</p><ul class="kt-com-board kt-com-flat">${teamRows(list)}</ul>` : `<p>${esc(t.noTeam)}</p>`}
        </section>${how(t)}</div>`;
    }
    const top = Math.max(0, ...b.board.map((r) => r.netCents));
    const health = b.sharePct == null ? '' : `<div class="kt-com-health">
        <div>${esc(b.loose.netCents > 0 ? t.share(b.sharePct) : t.shareAll)}</div>
        <div class="kt-com-meter" aria-hidden="true"><i style="width:${b.loose.netCents > 0 ? b.sharePct : 100}%"></i></div>
        ${b.loose.netCents > 0 ? `<span>${esc(t.loose(b.loose.tickets, fmtPay(b.loose.netCents / 100) + ' MAD'))}</span><span>${esc(pickerMode && pickerMode() ? t.fixPick : t.fixCode)}</span>` : ''}
      </div>`;
    return `<div class="kt-com" data-kt-commissions="ok">
      <section class="kt-com-hero">
        <div><div class="kt-com-eyebrow">${esc(t.eyebrow(period.startFr, period.endFr))}</div>
          <div class="kt-com-big">${esc(fmtPay(b.dueCents / 100))}<small>MAD</small></div>
          <p class="kt-com-lede">${b.counted ? esc(t.lede(fmtPay(b.countedCents / 100) + ' MAD', b.counted)) : esc(t.ledeNone)}</p>
          ${b.pending.names.length ? `<p class="kt-com-pending">${esc(t.pending(b.pending.names.length === 1 ? b.pending.names[0] : t.pendingMany(b.pending.names.length), fmtPay(b.pending.netCents / 100) + ' MAD'))}</p>` : ''}</div>
        ${health}
      </section>
      ${how(t)}
      <ol class="kt-com-board"><li class="kt-com-row kt-com-head" aria-hidden="true"><span></span><span></span><span>${esc(t.colRate)}</span><span>${esc(t.colDue)}</span></li>${b.board.map((r, i) => boardRow(r, i, top, t)).join('')}</ol>
      ${b.others.length ? `<section class="kt-com-section"><h4>${esc(t.others)}</h4><p>${esc(t.othersHint)}</p><ul class="kt-com-board kt-com-flat">${teamRows(b.others)}</ul></section>` : ''}
    </div>`;
  }

  return Object.freeze({ pane, tabLabel: () => T().tab, forget: () => cache.clear(), setRate });
}
