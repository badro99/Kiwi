/* Kiwi · DÉPENSES (le calcul) · assets/expenses/engine.js
 * ---------------------------------------------------------------------------
 * Pur : aucun DOM, aucun stockage, aucune horloge implicite. La page
 * (assets/expenses/index.js) le nourrit avec le document `expenses`, les
 * retraits de caisse du mois et les ventes par journée commerciale que rend
 * /api/expenses/summary ; tools/expenses-engine-test.mjs le charge tel quel.
 *
 * Les règles, une fois pour toutes :
 *   · un montant est un entier de centimes, jamais négatif ;
 *   · un retrait de caisse « sortie » est une dépense, un dépôt en banque non
 *     (l'argent change de poche, il ne quitte pas le commerce) ;
 *   · un retrait que le patron a complété (catégorie, fournisseur, photo)
 *     devient une dépense qui porte son `cashEventId` : la ligne brute de la
 *     caisse disparaît alors, le montant ne compte qu'une fois ;
 *   · une suppression est une pierre tombale datée : la copie plus ancienne
 *     d'un autre appareil ne la ressuscite pas ;
 *   · les charges fixes et les salaires ne sont jamais dans « Dépensé » (ce
 *     qui est vraiment sorti) : ils vivent à part, au prorata du mois écoulé,
 *     et une charge déjà payée et saisie n'y compte plus. */

export const CATEGORIES = ['meat', 'produce', 'grocery', 'drinks', 'hygiene', 'packaging', 'supplier', 'energy',
  'rent', 'repairs', 'transport', 'staff', 'marketing', 'equipment', 'taxes', 'other'];
export const METHODS = ['cash', 'card', 'transfer', 'cheque', 'other'];
const MAX_CENTS = 1000000000;

/* Accents latins ET hamza arabe détachée par NFD (إ → ا + ٕ) : « إيداع » et
   « ايداع » se lisent pareil. */
const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ٕͯٔ]/g, '').toLowerCase();
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const clampCents = (x) => Math.min(MAX_CENTS, Math.max(0, Math.round(num(x))));

/* Ce que l'équipe tape vraiment dans le motif d'un retrait : français, darija
   en lettres latines, arabe. L'ordre compte : la viande avant « fournisseur »
   (« Fournisseur de beef »), l'hygiène avant l'emballage (« sachet »), les
   boissons avant l'énergie (« eau »). Le fournisseur sans précision vient en
   dernier, « autre » sinon. */
const RULES = [
  ['meat', /\b(poulets?|viandes?|beef|boeuf|kefta|kefte|dindes?|agneau|mouton|boucher\w*|lham|djaj|steak|hache|merguez|escalopes?|gezar|guezzar|gzar|jazzar|gambas?|gampas?|crevettes?|poissons?|calamars?|saumon|thon|fruits de mer|hout)\b|دجاج|لحم|جزار|حوت/],
  ['produce', /\b(legumes?|fruits?|khadar|khodra|khodar|tomates?|oignons?|pommes? de terre|salades?|menthe|citrons?|bananes?|poivrons?|carottes?|ail|persil|basilic|oranges?|piments?|herbes?)\b|خضر|فواك|بطاطس/],
  ['hygiene', /\b(savons?|serviettes?|sachets?|poubelles?|javel+e?|detergents?|nettoyage|papier|gants?|essuie\w*|eponges?|desinfectant|halfa|sanicroix|sanecroi\w*|sanicroi\w*|hygiene)\b|منظف|صابون|جافيل/],
  ['packaging', /\b(emballages?|boites?|cartons?|barquettes?|gobelets?|aluminium|film|pots?)\b/],
  ['drinks', /\b(coca|eau|eaux|boissons?|jus|sodas?|cafe|coffee?|limonade|sprite|fanta|oulmes|sidi ali|the|atay)\b|مشروب|قهوة/],
  ['grocery', /\b(fromages?|mozzarella|farine|pates|riz|huile|lait|creme|beurre|oeufs?|sucre|sel|epices?|sauces?|parmesan|conserves?|epicerie|cheddar|bayedat|bid|helib|hlib|ziyet|zit|3atriya|atriya|moutarde|vinaigre|cacao|chocolat|levure|mayonnaise|ketchup|ricott?a|mascarpone|mozza|pain|khobz|ferran|farran|epicerie)\b|بيض|حليب|زيت|عطرية|خبز|فرا+ن/],
  ['energy', /\b(gaz|gas|butane|bota|bouta|electricite|lydec|redal|amendis|onee|energie)\b|غاز|كهرباء|بوطة|بوطا/],
  ['rent', /\b(loyer|loyers)\b|كراء/],
  ['repairs', /\b(reparations?|entretien|plombier|electricien|maintenance|ampoules?|depannage|technicien)\b|اصلاح/],
  ['transport', /\b(transport|taxi|livraisons?|livreurs?|livreuses?|livreure|carburant|essence|gasoil|parking)\b/],
  ['staff', /\b(avances?|salaires?|personnel|primes?|extras?|femme de menage|menage)\b|اجرة|تسبيق|موظف/],
  ['marketing', /\b(pub|publicite|flyers?|instagram|sponsor\w*|logo|impression|affiches?)\b/],
  ['equipment', /\b(materiel|machines?|frigo|four|ustensiles?|poeles?|casseroles?|couteaux|piles?|duracell)\b/],
  ['taxes', /\b(impots?|taxes?|timbres?|patente|cnss|frais bancaires?)\b|ضريبة/],
  ['supplier', /\b(achats?|fournisseurs?|courses|marjane?|carrefour|carfour|bim|metro)\b|شراء|مورد/],
];

/* Un prénom écrit à l'oreille : « Kaoutar » et « Kawtar », « Youssef » et
   « Yousef » sont la même personne au tiroir. */
const sound = (s) => fold(s).replace(/ou/g, 'w').replace(/(.)\1+/g, '$1').replace(/[^a-z\u0600-\u06ff]/g, '');

/* opts.staff : les prénoms de l'équipe (/api/expenses/summary). Un motif qui
   n'est rien d'autre et qui nomme quelqu'un de l'équipe (« Saad », « Kawtar
   cuisine »), c'est une personne payée : en dernier, après tout achat
   reconnaissable (« Saad poulet » reste de la viande). */
export function classifyReason(text, opts) {
  const t = fold(text);
  if (!t.trim()) return 'other';
  for (const [cat, re] of RULES) if (re.test(t)) return cat;
  const staff = new Set(((opts && opts.staff) || []).map(sound).filter((n) => n.length >= 3));
  if (staff.size && t.split(/[^a-z0-9\u0600-\u06ff]+/).some((w) => staff.has(sound(w)))) return 'staff';
  return 'other';
}

/* Ce qui sort du tiroir sans quitter le commerce : un dépôt en banque, le fond
   de caisse mis de côté, la monnaie qu'on va faire, la correction d'un
   encaissement erroné, le relevé du TPE. Montré à part, jamais « Dépensé ». */
const NOT_EXPENSE = [
  /* « versement » seul est un dépôt ; « versement salaire » paie quelqu'un. */
  ['bank', /\bbanque\b|\bbank\b|\bbq\b|\bversements?\b(?!.*\b(salaires?|avances?|loyers?|primes?)\b)|\b(bmce|attijari\w*|awb|cih|barid|cdm|sgma|bmci|cfg)\b|ايداع|بنك/],
  ['float', /\bfond\w* (de )?caiss?e?\b|\bfond de roulement\b/],
  ['change', /^\s*(change|monnaie|faire la monnaie)\s*$|\bfaire (de )?la monnaie\b/],
  /* Le TPE seul n'est pas une correction : « rouleaux TPE » est un achat. */
  ['correction', /\b(erreu\w*|ereu\w*|correction|annul\w*)\b.*\b(encais\w*|caisse|t\.?p\.?e)\b|\breleu?v?e? ?(de )?t\.?p\.?e\b/],
];
export function notAnExpense(text) {
  const t = fold(text);
  for (const [kind, re] of NOT_EXPENSE) if (re.test(t)) return kind;
  return '';
}
export function isBankDeposit(text) { return notAnExpense(text) === 'bank'; }

function cleanRow(r) {
  if (!r || typeof r !== 'object') return null;
  const id = typeof r.id === 'string' ? r.id.trim().slice(0, 80) : '';
  if (!id || !isDay(r.date)) return null;
  const row = {
    id, date: r.date, amountCents: clampCents(r.amountCents),
    category: CATEGORIES.includes(r.category) ? r.category : 'other',
    method: METHODS.includes(r.method) ? r.method : 'cash',
    supplier: String(r.supplier == null ? '' : r.supplier).slice(0, 80),
    note: String(r.note == null ? '' : r.note).slice(0, 200),
    vatCents: clampCents(r.vatCents),
    source: ['manual', 'scan', 'till'].includes(r.source) ? r.source : 'manual',
    createdAt: num(r.createdAt), updatedAt: num(r.updatedAt),
  };
  if (r.receiptKey) row.receiptKey = String(r.receiptKey).slice(0, 160);
  if (r.cashEventId) row.cashEventId = String(r.cashEventId).slice(0, 96);
  if (r.deleted) row.deleted = true;
  return row;
}

/* Ce que le patron tape : « 250 », « 1 234,50 », « 1.234,50 », « 1,234.50 ».
   Le dernier point ou la dernière virgule suivi d'un ou deux chiffres est la
   virgule décimale ; suivi de trois chiffres, c'est un séparateur de milliers.
   Un montant négatif, nul ou au-dessus du plafond rend 0 : la fiche le refuse. */
export function parseAmount(text) {
  const raw = String(text == null ? '' : text).replace(/[\s\u00a0\u202f]/g, '');
  if (/^-/.test(raw.replace(/[^\d.,-]/g, ''))) return 0;
  const s = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return 0;
  const m = s.match(/^(.*)[.,](\d{1,2})$/);
  const whole = (m ? m[1] : s).replace(/[.,]/g, '');
  const frac = m ? m[2].padEnd(2, '0') : '00';
  const cents = Number(whole || '0') * 100 + Number(frac);
  return Number.isFinite(cents) && cents > 0 && cents <= MAX_CENTS ? cents : 0;
}

/* Un retrait complété porte un identifiant tiré du mouvement de caisse : deux
   appareils qui le complètent écrivent la MÊME ligne, la fusion garde la plus
   récente. Forme admise par la route des photos ([A-Za-z0-9_-]{6,64}). */
/* L'horodatage d'une modification : jamais en dessous de la version qu'elle
   remplace. Un appareil dont l'horloge avance ne gagne donc plus contre une
   modification faite après avoir vu sa ligne (dernier qui écrit gagne, mais
   « dernier » au sens de l'ordre des modifications, pas des horloges). */
export function nextStamp(prev, now = Date.now()) {
  return Math.max(num(now), num(prev) + 1);
}

/* Coupé à 64 signes, l'identifiant d'un retrait perdait ce qui le distingue :
   la caisse les nomme « cash-term_<poste>-shift-<ouverture>-… », et tous les
   retraits d'un même service tombaient sur la même ligne complétée (Pasta
   Corner, 23 nov. : 51 gardés, 22 lignes). Trop long, il garde son début et
   prend l'empreinte de l'identifiant entier : unique, et la même sur tous les
   appareils. Court, il ne change pas (les lignes déjà complétées restent). */
function print16(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
    b = (b ^ (b >>> 15)) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
export function completionId(cashEventId) {
  const raw = String(cashEventId == null ? '' : cashEventId);
  const clean = 'xpc_' + raw.replace(/[^A-Za-z0-9_-]/g, '_');
  return clean.length <= 64 ? clean : clean.slice(0, 47) + '_' + print16(raw);
}

export function normalize(doc) {
  const list = doc && Array.isArray(doc.list) ? doc.list : [];
  return { list: list.map(cleanRow).filter(Boolean) };
}

export function mergeDocs(mine, theirs) {
  const byId = new Map();
  [...normalize(theirs).list, ...normalize(mine).list].forEach((r) => {
    const prev = byId.get(r.id);
    if (!prev || r.updatedAt > prev.updatedAt || (r.updatedAt === prev.updatedAt && r.deleted && !prev.deleted)) byId.set(r.id, r);
  });
  return { list: [...byId.values()] };
}

const isoDay = (ts) => new Date(num(ts)).toISOString().slice(0, 10);

export const isCategory = (c) => CATEGORIES.includes(c);

/* opts.staff : les prénoms de l'équipe, pour deviner. Une sortie classée à la
   caisse (movement_category, assets/till-categories.js) n'est pas devinée :
   elle compte telle quelle et ne demande plus rien au patron. */
export function cashOutRows(events, expenses, opts) {
  const completed = new Set(normalize({ list: expenses }).list.filter((r) => !r.deleted && r.cashEventId).map((r) => r.cashEventId));
  return (Array.isArray(events) ? events : []).filter((ev) => ev && ev.movement_kind === 'out'
    && num(ev.movement_amount_cents) > 0 && !notAnExpense(ev.movement_reason) && !completed.has(String(ev.id)))
    .map((ev) => ({
      id: 'cash:' + ev.id, cashEventId: String(ev.id),
      date: isDay(ev.day) ? ev.day : isoDay(ev.occurred_ts),
      amountCents: clampCents(ev.movement_amount_cents),
      ...(isCategory(ev.movement_category) ? { category: ev.movement_category, picked: true }
        : { category: classifyReason(ev.movement_reason, opts), guessed: true }),
      note: String(ev.movement_reason || ''), actorId: String(ev.actor_id || ''),
      source: 'till', method: 'cash', supplier: '',
    }));
}

export function uncountedCashOuts(events) {
  return (Array.isArray(events) ? events : []).filter((ev) => ev && ev.movement_kind === 'out'
    && num(ev.movement_amount_cents) > 0 && notAnExpense(ev.movement_reason))
    .map((ev) => ({
      id: String(ev.id), kind: notAnExpense(ev.movement_reason),
      date: isDay(ev.day) ? ev.day : isoDay(ev.occurred_ts), amountCents: clampCents(ev.movement_amount_cents),
      note: String(ev.movement_reason || ''), actorId: String(ev.actor_id || ''),
    }));
}

const daysIn = (month) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/* La part du mois déjà écoulée : un mois passé pèse en entier, le mois en
   cours au prorata des jours vécus, un mois futur rien. */
function elapsed(month, today) {
  const cur = isDay(today) ? today.slice(0, 7) : month;
  if (month < cur) return 1;
  if (month > cur) return 0;
  return Number(today.slice(8, 10)) / daysIn(month);
}

export function monthView({ month, today, expenses, cashOuts, salesDays, charges, salaries, staff } = {}) {
  if (!isMonth(month)) throw new Error('month');
  const inMonth = (d) => typeof d === 'string' && d.slice(0, 7) === month;
  /* Un même retrait complété deux fois (ancien identifiant aléatoire, deux
     appareils) ne compte qu'une fois : la complétion la plus récente gagne. */
  const newest = new Map();
  normalize({ list: expenses }).list.filter((r) => !r.deleted && r.cashEventId).forEach((r) => {
    const prev = newest.get(r.cashEventId);
    if (!prev || r.updatedAt > prev.updatedAt) newest.set(r.cashEventId, r);
  });
  const live = normalize({ list: expenses }).list.filter((r) => !r.deleted && (!r.cashEventId || newest.get(r.cashEventId).id === r.id));
  const rows = [
    ...live.filter((r) => inMonth(r.date)),
    ...cashOutRows(cashOuts, live, { staff }).filter((r) => inMonth(r.date)),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.updatedAt || 0) - (a.updatedAt || 0)));

  const inCents = (Array.isArray(salesDays) ? salesDays : []).filter((d) => d && inMonth(d.day))
    .reduce((s, d) => s + Math.round(num(d.salesCents)), 0);
  const outCents = rows.reduce((s, r) => s + r.amountCents, 0);

  const cats = new Map();
  rows.forEach((r) => {
    const c = cats.get(r.category) || { category: r.category, cents: 0, count: 0 };
    c.cents += r.amountCents; c.count += 1; cats.set(r.category, c);
  });
  const byCategory = [...cats.values()].sort((a, b) => b.cents - a.cents);

  const perDay = new Map();
  rows.forEach((r) => perDay.set(r.date, (perDay.get(r.date) || 0) + r.amountCents));
  const byDay = Array.from({ length: daysIn(month) }, (_, i) => {
    const day = month + '-' + String(i + 1).padStart(2, '0');
    return { day, outCents: perDay.get(day) || 0 };
  });

  const leftCents = inCents - outCents;
  const hasCharges = Array.isArray(charges) && charges.length > 0;
  const hasSalaries = !!(salaries && num(salaries.monthlyCents) > 0);
  let fixed = null;
  if (hasCharges || hasSalaries) {
    const f = elapsed(month, today);
    const paid = (cat) => rows.filter((r) => r.source !== 'till' && r.category === cat).reduce((s, r) => s + r.amountCents, 0);
    /* Totalisées par catégorie d'abord : deux charges « divers » ne retirent pas
       chacune ce qui a déjà été payé en « divers ». */
    const planned = new Map();
    (hasCharges ? charges : []).forEach((c) => {
      const cat = CATEGORIES.includes(c && c.category) ? c.category : 'other';
      planned.set(cat, (planned.get(cat) || 0) + clampCents(c && c.monthlyCents));
    });
    const chargesCents = [...planned.entries()].reduce((s, [cat, cents]) => s + Math.max(0, Math.round(cents * f) - paid(cat)), 0);
    const salariesCents = hasSalaries ? Math.round(clampCents(salaries.monthlyCents) * f) : 0;
    const advancesCents = rows.filter((r) => r.category === 'staff').reduce((s, r) => s + r.amountCents, 0);
    fixed = {
      chargesCents, salariesCents, advancesCents,
      afterFixedCents: leftCents - chargesCents - Math.max(0, salariesCents - advancesCents),
    };
  }
  return { inCents, outCents, leftCents, byCategory, byDay, rows, fixed };
}

/* Le comptable ouvre ce fichier dans un tableur : un texte qui commence par
   = + - @ ou une tabulation y deviendrait une formule. Il garde donc une
   apostrophe devant, et tout ce qui porte une virgule, un guillemet ou un
   retour à la ligne est entre guillemets. */
const csvCell = (v) => {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const money = (c) => (clampCents(c) / 100).toFixed(2);

export function toCsv(rows) {
  const head = 'date,category,supplier,method,amount,vat,source,receipt,note,id';
  return [head, ...(Array.isArray(rows) ? rows : []).map((r) => [
    r.date, CATEGORIES.includes(r.category) ? r.category : 'other', r.supplier || '',
    METHODS.includes(r.method) ? r.method : 'cash', money(r.amountCents), money(r.vatCents),
    r.source || 'manual', r.receiptKey ? 'yes' : 'no', r.note || '', r.id || '',
  ].map(csvCell).join(','))].join('\n');
}
