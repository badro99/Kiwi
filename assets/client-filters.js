/* Filtres du carnet clients · caisse (Clientes) et tableau de bord (Clients).
 *
 * La Maison en Vogue, 20 nov. 2026 : la caisse listait les 300 fiches d'un
 * bloc, et rien ne disait qui devait encore de l'argent ni qui avait un avoir.
 * Une seule règle sert les deux écrans :
 *   · doit de l'argent : une note ouverte (acompte, compte client) a un solde ;
 *   · avoir : un avoir actif porte encore un montant ;
 *   · fidèles : 2 achats et plus ; 1 seul achat ; sans achat ;
 *   · VIP ; à relancer : déjà venue, pas revue depuis 60 jours.
 * Sans données d'argent (hors ligne), « doit » et « avoir » restent vides,
 * jamais devinés. Module ES : importé par la caisse, chargé à la demande par
 * le tableau de bord ; aucune balise <script> de plus. */
export const CLIENT_FILTERS = ['all', 'owes', 'avoir', 'repeat', 'once', 'none', 'vip', 'dormant'];
export const CLIENT_SORTS = ['recent', 'spend', 'visits', 'owes', 'name'];
const DAY = 86400000, DORMANT_DAYS = 60;

const LABELS = {
  fr: { all: 'Tout', owes: 'Doivent un solde', avoir: 'Avoir en cours', repeat: 'Fidèles (2 achats et +)', once: '1 seul achat',
    none: 'Sans achat', vip: 'VIP', dormant: 'À relancer', sort: 'Trier', 'sort.recent': 'Passage récent', 'sort.spend': 'Plus dépensé',
    'sort.visits': 'Plus d’achats', 'sort.owes': 'Plus gros solde dû', 'sort.name': 'Nom A → Z', owesBadge: 'doit', avoirBadge: 'avoir' },
  en: { all: 'All', owes: 'Owe a balance', avoir: 'Store credit', repeat: 'Regulars (2+ purchases)', once: 'One purchase',
    none: 'No purchase', vip: 'VIP', dormant: 'Win back', sort: 'Sort', 'sort.recent': 'Most recent', 'sort.spend': 'Top spend',
    'sort.visits': 'Most purchases', 'sort.owes': 'Largest balance due', 'sort.name': 'Name A → Z', owesBadge: 'owes', avoirBadge: 'credit' },
  ar: { all: 'الكل', owes: 'عليهم باقي', avoir: 'لديهم رصيد', repeat: 'أوفياء (شراءان فأكثر)', once: 'شراء واحد',
    none: 'بلا شراء', vip: 'كبار الزبائن', dormant: 'للمتابعة', sort: 'ترتيب', 'sort.recent': 'آخر زيارة', 'sort.spend': 'الأكثر إنفاقًا',
    'sort.visits': 'الأكثر شراءً', 'sort.owes': 'أكبر باقٍ مستحق', 'sort.name': 'الاسم أ → ي', owesBadge: 'عليها', avoirBadge: 'رصيد' },
};
export function filterLabel(id, lang) { return (LABELS[lang] || LABELS.fr)[id] || LABELS.fr[id] || ''; }

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const visitsOf = (c) => num(c.visits != null ? c.visits : c.achats);
const spendOf = (c) => num(c.spend != null ? c.spend : c.spent);
const lastOf = (c) => num(c.lastSeen);

/* Les deux cartes d'argent, en centimes, par fiche : ce qu'elle doit, l'avoir
   qu'elle porte. `balances` = /api/retail-balances (ou le journal de la caisse),
   `credits` = /api/store-credits (balanceCents) ou les avoirs de la caisse (balance en MAD). */
export function moneyMaps({ balances = [], credits = [], now = Date.now(), loaded = true } = {}) {
  const owes = new Map(), avoir = new Map();
  (balances || []).forEach((b) => {
    const id = b && String(b.customerId || ''); const cents = Math.max(0, Math.round(num(b && b.balanceCents)));
    if (id && cents > 0) owes.set(id, (owes.get(id) || 0) + cents);
  });
  (credits || []).forEach((a) => {
    if (!a || a.status === 'cancelled' || a.status === 'consumed') return;
    const id = String(a.customerId || a.holderId || '');
    const cents = a.balanceCents != null ? Math.round(num(a.balanceCents)) : Math.round(num(a.balance) * 100);
    if (id && cents > 0) avoir.set(id, (avoir.get(id) || 0) + cents);
  });
  return { owes, avoir, now, loaded };
}

export function clientMatches(c, filter, ctx) {
  if (!c) return false;
  const v = visitsOf(c);
  switch (filter) {
    case 'owes': return (ctx.owes.get(String(c.id)) || 0) > 0;
    case 'avoir': return (ctx.avoir.get(String(c.id)) || 0) > 0;
    case 'repeat': return v >= 2;
    case 'once': return v === 1;
    case 'none': return v === 0;
    case 'vip': return !!(c.vip || c.seg === 'vip');
    case 'dormant': return v > 0 && lastOf(c) > 0 && (ctx.now - lastOf(c)) > DORMANT_DAYS * DAY;
    default: return true;
  }
}

export function clientCounts(list, ctx) {
  const out = {}; CLIENT_FILTERS.forEach((id) => { out[id] = 0; });
  (list || []).forEach((c) => CLIENT_FILTERS.forEach((id) => { if (clientMatches(c, id, ctx)) out[id]++; }));
  return out;
}

const collator = typeof Intl !== 'undefined' ? new Intl.Collator('fr', { sensitivity: 'base' }) : null;
export function sortClients(list, by, ctx) {
  const name = (a, b) => (collator ? collator.compare(String(a.name || ''), String(b.name || '')) : String(a.name || '').localeCompare(String(b.name || '')));
  const key = {
    recent: (c) => lastOf(c), spend: (c) => spendOf(c), visits: (c) => visitsOf(c),
    owes: (c) => ctx.owes.get(String(c.id)) || 0,
  }[by];
  return (list || []).slice().sort((a, b) => (key ? key(b) - key(a) : 0) || name(a, b));
}

export function filterClients(list, { filter = 'all', sort = 'recent' } = {}, ctx) {
  const id = CLIENT_FILTERS.includes(filter) ? filter : 'all';
  return sortClients((list || []).filter((c) => clientMatches(c, id, ctx)), CLIENT_SORTS.includes(sort) ? sort : 'recent', ctx);
}

/* Le réseau : les notes ouvertes et les avoirs actifs de la boutique. Une
   réponse en échec rend une carte vide marquée loaded:false, jamais une erreur. */
export async function loadClientMoney(merchant, { balancesFn, fetchFn = (u, o) => fetch(u, o), timeoutMs = 6000 } = {}) {
  if (!merchant) return moneyMaps({ loaded: false });
  const get = async (url) => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await fetchFn(url, { credentials: 'same-origin', cache: 'no-store', signal: ctl && ctl.signal });
      return res && res.ok ? await res.json() : null;
    } catch (_) { return null; } finally { if (timer) clearTimeout(timer); }
  };
  const m = encodeURIComponent(merchant);
  const [balances, credits] = await Promise.all([
    balancesFn ? Promise.resolve().then(balancesFn).catch(() => null) : get(`/api/retail-balances?merchant=${m}`).then((d) => d && d.balances),
    get(`/api/store-credits?merchant=${m}&active=1`).then((d) => d && d.credits),
  ]);
  return moneyMaps({ balances: balances || [], credits: credits || [], loaded: !!(balances && credits) });
}

const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
/* La barre : puces (avec leur nombre) dans un groupe de la lentille liquide,
   puis le tri. `prefix` nomme les attributs data-* de l'écran qui l'accueille. */
export function clientFilterBar({ filter = 'all', sort = 'recent', counts = {}, lang = 'fr', hide = [] } = {}) {
  const chips = CLIENT_FILTERS.filter((id) => id === 'all' || id === filter || (!hide.includes(id) && counts[id] > 0)).map((id) => {
    const on = id === filter;
    return `<button type="button" class="kcf-chip${on ? ' on' : ''}" data-lens-item data-kcf-filter="${id}" aria-pressed="${on}">${escHtml(filterLabel(id, lang))}<em>${num(counts[id])}</em></button>`;
  }).join('');
  const options = CLIENT_SORTS.map((id) => `<option value="${id}"${id === sort ? ' selected' : ''}>${escHtml(filterLabel('sort.' + id, lang))}</option>`).join('');
  return `<div class="kcf-bar"><div class="kcf-chips" data-lens-demo role="group" aria-label="${escHtml(filterLabel('all', lang))}">${chips}</div>`
    + `<label class="kcf-sort"><span>${escHtml(filterLabel('sort', lang))}</span><select data-kcf-sort>${options}</select></label></div>`;
}

export function clientMoneyBadges(c, ctx, { lang = 'fr', fmt = (mad) => `${mad} MAD` } = {}) {
  const owe = ctx.owes.get(String(c.id)) || 0, av = ctx.avoir.get(String(c.id)) || 0;
  return (owe ? `<span class="kcf-badge owes">${escHtml(filterLabel('owesBadge', lang))} ${escHtml(fmt(owe / 100))}</span>` : '')
    + (av ? `<span class="kcf-badge avoir">${escHtml(filterLabel('avoirBadge', lang))} ${escHtml(fmt(av / 100))}</span>` : '');
}

const CSS = `.kcf-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
.kcf-chips{display:flex;gap:2px;padding:4px;border-radius:999px;background:color-mix(in srgb,currentColor 6%,transparent);overflow-x:auto;scrollbar-width:none;max-width:100%;flex:1 1 auto}
.kcf-chips::-webkit-scrollbar{display:none}
.kcf-chip{flex:none;border:0;background:transparent;color:inherit;opacity:.72;font:inherit;font-size:13px;font-weight:500;padding:8px 14px;border-radius:999px;cursor:pointer;white-space:nowrap;min-height:40px}
.kcf-chip em{font-style:normal;opacity:.7;margin-inline-start:6px;font-variant-numeric:tabular-nums}
.kcf-chip.on{opacity:1;background:var(--surface,var(--paper,#F7F5F0));box-shadow:0 1px 2px rgba(0,0,0,.08)}
.kcf-chip:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:1px}
.kcf-sort{display:flex;gap:6px;align-items:center;font-size:13px;flex:none}
.kcf-sort span{opacity:.7}
.kcf-sort select{font:inherit;font-size:13px;padding:8px 10px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:transparent;color:inherit;min-height:40px}
.kcf-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;font-variant-numeric:tabular-nums}
.kcf-badge.owes{background:color-mix(in srgb,#C0492F 14%,transparent);color:color-mix(in srgb,#C0492F 85%,currentColor)}
.kcf-badge.avoir{background:color-mix(in srgb,var(--atlas,#0B6E4F) 14%,transparent);color:var(--atlas,#0B6E4F)}`;
export function ensureClientFilterStyles(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || doc.getElementById('kcf-css')) return;
  const style = doc.createElement('style'); style.id = 'kcf-css'; style.textContent = CSS; doc.head.appendChild(style);
}
