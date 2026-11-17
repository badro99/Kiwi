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
  ['meat', /\b(poulets?|viandes?|beef|boeuf|kefta|kefte|dindes?|agneau|mouton|boucher\w*|lham|djaj|steak|hache|merguez|escalopes?)\b|دجاج|لحم/],
  ['produce', /\b(legumes?|fruits?|khadar|khodra|khodar|tomates?|oignons?|pommes? de terre|salades?|menthe|citrons?|bananes?|poivrons?|carottes?|ail|persil|basilic|oranges?|piments?|herbes?)\b|خضر|فواك|بطاطس/],
  ['hygiene', /\b(savons?|serviettes?|sachets?|poubelles?|javel|detergents?|nettoyage|papier|gants?|essuie\w*|eponges?|desinfectant|halfa)\b|منظف|صابون/],
  ['packaging', /\b(emballages?|boites?|cartons?|barquettes?|gobelets?|aluminium|film|pots?)\b/],
  ['drinks', /\b(coca|eau|eaux|boissons?|jus|sodas?|cafe|limonade|sprite|fanta)\b|مشروب/],
  ['grocery', /\b(fromages?|mozzarella|farine|pates|riz|huile|lait|creme|beurre|oeufs?|sucre|sel|epices?|sauces?|parmesan|conserves?|epicerie|cheddar|bayedat|bid|helib|hlib|ziyet|zit|3atriya|atriya|moutarde|vinaigre|cacao|chocolat|levure|mayonnaise|ketchup)\b|بيض|حليب|زيت|عطرية/],
  ['energy', /\b(gaz|gas|butane|electricite|lydec|redal|amendis|onee)\b|غاز|كهرباء/],
  ['rent', /\b(loyer|loyers)\b|كراء/],
  ['repairs', /\b(reparations?|entretien|plombier|electricien|maintenance|ampoules?|depannage|technicien)\b|اصلاح/],
  ['transport', /\b(transport|taxi|livraisons?|livreurs?|livreuses?|livreure|carburant|essence|gasoil|parking)\b/],
  ['staff', /\b(avances?|salaires?|personnel|primes?|extras?|femme de menage|menage)\b|اجرة|تسبيق/],
  ['marketing', /\b(pub|publicite|flyers?|instagram|sponsor\w*|logo|impression|affiches?)\b/],
  ['equipment', /\b(materiel|machines?|frigo|four|ustensiles?|poeles?|casseroles?|couteaux|piles?|duracell)\b/],
  ['taxes', /\b(impots?|taxes?|timbres?|patente|cnss|frais bancaires?)\b|ضريبة/],
  ['supplier', /\b(achats?|fournisseurs?|courses|marjane?|carrefour|carfour|bim|metro)\b|شراء|مورد/],
];

export function classifyReason(text) {
  const t = fold(text);
  if (!t.trim()) return 'other';
  for (const [cat, re] of RULES) if (re.test(t)) return cat;
  return 'other';
}

/* Ce qui sort du tiroir sans quitter le commerce : un dépôt en banque, le fond
   de caisse mis de côté, la monnaie qu'on va faire, la correction d'un
   encaissement erroné, le relevé du TPE. Montré à part, jamais « Dépensé ». */
const NOT_EXPENSE = [
  ['bank', /\bbanque\b|\bbank\b|ايداع|بنك/],
  ['float', /\bfond\w* (de )?caiss?e?\b|\bfond de roulement\b/],
  ['change', /^\s*(change|monnaie|faire la monnaie)\s*$|\bfaire (de )?la monnaie\b/],
  ['correction', /\b(erreu\w*|ereu\w*|correction)\b.*\b(encais\w*|caisse)\b|\breleu?v?e? ?(de )?t\.?p\.?e\b|\bt\.?p\.?e\b/],
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

export function cashOutRows(events, expenses) {
  const completed = new Set(normalize({ list: expenses }).list.filter((r) => !r.deleted && r.cashEventId).map((r) => r.cashEventId));
  return (Array.isArray(events) ? events : []).filter((ev) => ev && ev.movement_kind === 'out'
    && num(ev.movement_amount_cents) > 0 && !notAnExpense(ev.movement_reason) && !completed.has(String(ev.id)))
    .map((ev) => ({
      id: 'cash:' + ev.id, cashEventId: String(ev.id),
      date: isDay(ev.day) ? ev.day : isoDay(ev.occurred_ts),
      amountCents: clampCents(ev.movement_amount_cents),
      category: classifyReason(ev.movement_reason), guessed: true,
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

export function monthView({ month, today, expenses, cashOuts, salesDays, charges, salaries } = {}) {
  if (!isMonth(month)) throw new Error('month');
  const inMonth = (d) => typeof d === 'string' && d.slice(0, 7) === month;
  const live = normalize({ list: expenses }).list.filter((r) => !r.deleted);
  const rows = [
    ...live.filter((r) => inMonth(r.date)),
    ...cashOutRows(cashOuts, live).filter((r) => inMonth(r.date)),
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
    const chargesCents = hasCharges ? charges.reduce((s, c) => {
      const planned = Math.round(clampCents(c && c.monthlyCents) * f);
      return s + Math.max(0, planned - paid(c && c.category));
    }, 0) : 0;
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
  const head = 'date,category,supplier,method,amount,vat,source,receipt';
  return [head, ...(Array.isArray(rows) ? rows : []).map((r) => [
    r.date, CATEGORIES.includes(r.category) ? r.category : 'other', r.supplier || '',
    METHODS.includes(r.method) ? r.method : 'cash', money(r.amountCents), money(r.vatCents),
    r.source || 'manual', r.receiptKey ? 'yes' : 'no',
  ].map(csvCell).join(','))].join('\n');
}
