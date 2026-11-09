/* Annuaire Kiwi · les données (tables directory_listings / directory_requests).
 *
 * « L'annuaire est gratuit pour tout le monde, et nos clients y ont une
 * exposition premium, gratuite aussi » (propriétaire, 9 nov 2026). Deux sources,
 * et seulement deux :
 *   · un commerce qui s'inscrit lui-même sur /fr/annuaire/ajouter/ : la fiche
 *     entre en modération (`pending`) et n'apparaît qu'après l'accord d'un
 *     opérateur dans la console ;
 *   · un client Kiwi qui allume « Apparaître dans l'annuaire » depuis son
 *     tableau de bord (session propriétaire). Sa fiche est publiée tout de
 *     suite, placée en tête, avec le badge et ce que Kiwi sait déjà de lui
 *     (horaires, carte, réservation), lu au moment de l'affichage.
 * Rien d'autre : pas de collecte, pas de données achetées, pas de fiche
 * inventée. L'annuaire commence vide.
 *
 * Ce qui est public et ce qui ne l'est pas. Une fiche publique montre le nom,
 * le métier, la ville, l'adresse, la description, le site web, et le téléphone
 * SEULEMENT si celui qui l'a saisi a coché « afficher ». Le nom, l'e-mail et le
 * téléphone de contact servent à la modération et ne sortent que vers la
 * console opérateur (functions/api/admin/directory.js). PUBLIC_COLUMNS est la
 * seule liste que les pages lisent.
 *
 * La table est créée par migrations/0024_directory.sql, que le propriétaire
 * applique. Tant qu'elle n'existe pas, tout lit « vide » : l'annuaire s'affiche
 * sans fiche, jamais en 500 (tools/directory-api-test.mjs). */

export const PER_PAGE = 24;

/* Les villes ont une liste fermée : une page par ville n'a de valeur que si
 * « Casa », « casablanca » et « Casablanca » sont la même page. */
export const CITIES = [
  ['casablanca', 'Casablanca', 'Casablanca', 'الدار البيضاء'],
  ['rabat', 'Rabat', 'Rabat', 'الرباط'],
  ['marrakech', 'Marrakech', 'Marrakesh', 'مراكش'],
  ['fes', 'Fès', 'Fez', 'فاس'],
  ['tanger', 'Tanger', 'Tangier', 'طنجة'],
  ['agadir', 'Agadir', 'Agadir', 'أكادير'],
  ['meknes', 'Meknès', 'Meknes', 'مكناس'],
  ['oujda', 'Oujda', 'Oujda', 'وجدة'],
  ['kenitra', 'Kénitra', 'Kenitra', 'القنيطرة'],
  ['tetouan', 'Tétouan', 'Tetouan', 'تطوان'],
  ['sale', 'Salé', 'Sale', 'سلا'],
  ['temara', 'Témara', 'Temara', 'تمارة'],
  ['mohammedia', 'Mohammédia', 'Mohammedia', 'المحمدية'],
  ['el-jadida', 'El Jadida', 'El Jadida', 'الجديدة'],
  ['safi', 'Safi', 'Safi', 'آسفي'],
  ['beni-mellal', 'Béni Mellal', 'Beni Mellal', 'بني ملال'],
  ['nador', 'Nador', 'Nador', 'الناظور'],
  ['khouribga', 'Khouribga', 'Khouribga', 'خريبكة'],
  ['settat', 'Settat', 'Settat', 'سطات'],
  ['berrechid', 'Berrechid', 'Berrechid', 'برشيد'],
  ['essaouira', 'Essaouira', 'Essaouira', 'الصويرة'],
  ['ouarzazate', 'Ouarzazate', 'Ouarzazate', 'ورزازات'],
  ['errachidia', 'Errachidia', 'Errachidia', 'الرشيدية'],
  ['laayoune', 'Laâyoune', 'Laayoune', 'العيون'],
  ['dakhla', 'Dakhla', 'Dakhla', 'الداخلة'],
  ['guelmim', 'Guelmim', 'Guelmim', 'كلميم'],
  ['taroudant', 'Taroudant', 'Taroudant', 'تارودانت'],
  ['tiznit', 'Tiznit', 'Tiznit', 'تيزنيت'],
  ['ifrane', 'Ifrane', 'Ifrane', 'إفران'],
  ['azrou', 'Azrou', 'Azrou', 'أزرو'],
  ['chefchaouen', 'Chefchaouen', 'Chefchaouen', 'شفشاون'],
  ['al-hoceima', 'Al Hoceïma', 'Al Hoceima', 'الحسيمة'],
  ['larache', 'Larache', 'Larache', 'العرائش'],
  ['taza', 'Taza', 'Taza', 'تازة'],
  ['khemisset', 'Khémisset', 'Khemisset', 'الخميسات'],
].map(([slug, fr, en, ar]) => ({ slug, label: { fr, en, ar } }));

/* Les métiers sont ceux de assets/trades.js (mêmes identifiants, mêmes
 * libellés, vérifiés par tools/directory-api-test.mjs) : un client Kiwi
 * retrouve dans l'annuaire le métier qu'il a choisi à l'inscription
 * (merchant_config.type). `slug` est le segment d'URL, `ld` le type schema.org. */
export const TRADES = [
  ['restaurant', 'restaurant', 'Restaurant', 'Restaurant', 'مطعم', 'Restaurant', 'restaurant'],
  ['cafe', 'cafe', 'Café / Salon de thé', 'Café / Tea room', 'مقهى', 'CafeOrCoffeeShop', 'local_cafe'],
  ['fastfood', 'snack', 'Fast-food / Snack', 'Fast food', 'وجبات سريعة', 'FastFoodRestaurant', 'lunch_dining'],
  ['bakery', 'boulangerie', 'Boulangerie / Pâtisserie', 'Bakery', 'مخبزة', 'Bakery', 'bakery_dining'],
  ['pizzeria', 'pizzeria', 'Pizzeria', 'Pizzeria', 'بيتزيريا', 'Restaurant', 'local_pizza'],
  ['traiteur', 'traiteur', 'Traiteur', 'Caterer', 'خدمات تقديم الطعام', 'FoodEstablishment', 'room_service'],
  ['foodtruck', 'food-truck', 'Food truck', 'Food truck', 'شاحنة طعام', 'FoodEstablishment', 'local_shipping'],
  ['boutique', 'boutique', 'Boutique', 'Shop', 'متجر', 'Store', 'storefront'],
  ['epicerie', 'epicerie', 'Épicerie / Superette', 'Grocery', 'بقالة', 'GroceryStore', 'local_grocery_store'],
  ['pharmacie', 'pharmacie', 'Pharmacie', 'Pharmacy', 'صيدلية', 'Pharmacy', 'local_pharmacy'],
  ['librairie', 'librairie', 'Librairie / Papeterie', 'Bookshop', 'مكتبة', 'BookStore', 'menu_book'],
  ['fleuriste', 'fleuriste', 'Fleuriste', 'Florist', 'محل أزهار', 'Florist', 'local_florist'],
  ['maison', 'maison', 'Maison', 'Home', 'المنزل', 'HomeGoodsStore', 'chair'],
  ['pressing', 'pressing', 'Pressing / Blanchisserie', 'Dry cleaner / Laundry', 'مغسلة', 'DryCleaningOrLaundry', 'local_laundry_service'],
  ['spa', 'spa', 'Spa / Bien-être', 'Spa / Wellness', 'سبا', 'DaySpa', 'spa'],
  ['coiffure', 'coiffure', 'Salon de coiffure', 'Hair salon', 'صالون حلاقة', 'HairSalon', 'content_cut'],
  ['sport', 'sport', 'Salle de sport', 'Gym', 'قاعة رياضية', 'ExerciseGym', 'fitness_center'],
  ['hotel', 'hotel', 'Hôtel / Riad', 'Hotel / Riad', 'فندق / رياض', 'Hotel', 'hotel'],
  ['autre', 'autre', 'Autre activité', 'Something else', 'نشاط آخر', 'LocalBusiness', 'category'],
].map(([id, slug, fr, en, ar, ld, icon]) => ({ id, slug, label: { fr, en, ar }, ld, icon }));

export const cityBySlug = (s) => CITIES.find((c) => c.slug === s) || null;
export const tradeById = (id) => TRADES.find((t) => t.id === id) || null;
export const tradeBySlug = (s) => TRADES.find((t) => t.slug === s) || null;

/* Les mots que la ville ne peut pas prendre comme slug de fiche, et inversement. */
const RESERVED = new Set([...CITIES.map((c) => c.slug), 'ajouter', 'add', 'signaler', 'report', 'page', 'recherche', 'search']);

export const STATUSES = ['pending', 'approved', 'rejected', 'removed', 'off'];
export const REQUEST_KINDS = ['removal', 'correction'];

/* Ce que les pages publiques ont le droit de lire. Jamais contact_*, jamais
 * dedupe_key, jamais l'identifiant interne. */
export const PUBLIC_COLUMNS = 'slug, kind, merchant, name, trade, city, address, description, website, show_phone, whatsapp, contact_phone, updated_ts';

const text = (v, max) => String(v == null ? '' : v)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '')
  .replace(/[ \t ]+/g, ' ').trim().slice(0, max);
const paragraph = (v, max) => String(v == null ? '' : v)
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '')
  .split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).join('\n')
  .replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

export function slugify(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

/* Un nom sans lettre latine (« مقهى الأطلس ») n'a pas de slug lisible : la
 * fiche prend alors le métier, puis la ville (« cafe-casablanca »). */
export function baseSlug(name, trade, city) {
  const head = slugify(name) || (tradeById(trade) ? tradeById(trade).slug : 'commerce');
  let s = `${head}-${city}`.replace(/-+/g, '-');
  if (RESERVED.has(s)) s += '-1';
  return s;
}

export function cleanEmail(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase().slice(0, 160);
  if (!e) return '';
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(e) ? e : null;
}

/* Un site web : http(s) seulement, un vrai nom d'hôte, pas d'identifiants. */
export function cleanWebsite(v) {
  let raw = String(v == null ? '' : v).trim().slice(0, 200);
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
    return u.toString().replace(/\/$/, '');
  } catch (_) { return null; }
}

const LINKY = /(https?:\/\/|www\.|\[url|<a\s)/i;

/* Le contenu d'une fiche, borné et typé. `phone` arrive déjà normalisé par
 * l'appelant (functions/api/_phone.js), pour garder ce fichier sans import. */
export function sanitizeListing(body, normalizePhone) {
  const b = body && typeof body === 'object' ? body : {};
  const phone = normalizePhone(b.phone);
  const value = {
    name: text(b.name, 80),
    trade: tradeById(String(b.trade || '')) ? String(b.trade) : '',
    city: cityBySlug(String(b.city || '')) ? String(b.city) : '',
    address: text(b.address, 160),
    description: paragraph(b.description, 600),
    website: cleanWebsite(b.website),
    contact_name: text(b.contactName, 60),
    contact_email: cleanEmail(b.email),
    contact_phone: phone,
    show_phone: (b.showPhone === true || b.showPhone === '1' || b.showPhone === 'on') ? 1 : 0,
    whatsapp: (b.whatsapp === true || b.whatsapp === '1' || b.whatsapp === 'on') ? 1 : 0,
    lang: ['fr', 'en', 'ar'].includes(b.lang) ? b.lang : 'fr',
  };
  if (value.name.length < 2) return { ok: false, field: 'name' };
  if (!value.trade) return { ok: false, field: 'trade' };
  if (!value.city) return { ok: false, field: 'city' };
  if (LINKY.test(value.description) || LINKY.test(value.name) || LINKY.test(value.address)) return { ok: false, field: 'description' };
  if (value.website === null) return { ok: false, field: 'website' };
  if (value.contact_email === null) return { ok: false, field: 'email' };
  if (String(b.phone || '').trim() && !phone) return { ok: false, field: 'phone' };
  if (value.show_phone && !phone) return { ok: false, field: 'phone' };
  if (!value.show_phone) value.whatsapp = 0;
  return { ok: true, value };
}

export function dedupeKey(name, city) {
  return (slugify(name) || String(name || '').replace(/\s+/g, '').toLowerCase()) + '|' + city;
}

/* ── Lecture tolérante : table absente ⇒ vide ────────────────────────────── */
export const missingTable = (e) => /no such table|no such column/i.test(String((e && e.message) || e || ''));

async function all(env, sql, binds) {
  if (!env || !env.DB) return [];
  try { return (await env.DB.prepare(sql).bind(...binds).all()).results || []; }
  catch (e) { if (missingTable(e)) return []; throw e; }
}

/* Une fiche client ne s'affiche que pour un établissement actif et réel : un
 * magasin suspendu, en attente d'acceptation ou marqué compte de test
 * (merchant_config.test_account) n'apparaît pas, même allumé. */
const VISIBLE = `l.status = 'approved' AND (l.kind = 'public' OR EXISTS (
  SELECT 1 FROM merchant_config m WHERE m.merchant = l.merchant
    AND COALESCE(m.status, 'active') NOT IN ('suspended', 'pending') AND COALESCE(m.test_account, 0) = 0))`;
const ORDER = `CASE l.kind WHEN 'client' THEN 0 ELSE 1 END, l.name COLLATE NOCASE, l.slug`;
const COLS = PUBLIC_COLUMNS.split(',').map((c) => 'l.' + c.trim()).join(', ');

/* Recherche : chaque mot doit apparaître dans le nom, l'adresse ou la
 * description. LIKE échappé ; au plus cinq mots. */
function searchClause(q) {
  const words = String(q || '').toLowerCase().split(/\s+/).map((w) => w.replace(/[%_\\]/g, '').slice(0, 40)).filter(Boolean).slice(0, 5);
  return {
    sql: words.map(() => `(LOWER(l.name) LIKE ? OR LOWER(l.address) LIKE ? OR LOWER(l.description) LIKE ?)`).join(' AND '),
    binds: words.flatMap((w) => [`%${w}%`, `%${w}%`, `%${w}%`]),
  };
}

export async function listListings(env, { city = '', trade = '', q = '', page = 1 } = {}) {
  const where = [VISIBLE], binds = [];
  if (city) { where.push('l.city = ?'); binds.push(city); }
  if (trade) { where.push('l.trade = ?'); binds.push(trade); }
  const s = searchClause(q);
  if (s.sql) { where.push(s.sql); binds.push(...s.binds); }
  const w = where.join(' AND ');
  const offset = (Math.max(1, page) - 1) * PER_PAGE;
  const [rows, count] = await Promise.all([
    all(env, `SELECT ${COLS} FROM directory_listings l WHERE ${w} ORDER BY ${ORDER} LIMIT ${PER_PAGE} OFFSET ${offset}`, binds),
    all(env, `SELECT COUNT(*) AS n FROM directory_listings l WHERE ${w}`, binds),
  ]);
  return { rows: rows.map(publicRow), total: Number(count[0] && count[0].n) || 0 };
}

/* Combien de fiches par ville et par métier : les filtres n'offrent que ce qui
 * existe, et les pages de ville n'existent que si elles ont des fiches. */
export async function facets(env) {
  const rows = await all(env, `SELECT l.city AS city, l.trade AS trade, COUNT(*) AS n, MAX(l.updated_ts) AS ts
    FROM directory_listings l WHERE ${VISIBLE} GROUP BY l.city, l.trade`, []);
  return rows.map((r) => ({ city: r.city, trade: r.trade, n: Number(r.n) || 0, ts: Number(r.ts) || 0 }));
}

export async function listingBySlug(env, slug) {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(String(slug || ''))) return null;
  const rows = await all(env, `SELECT ${COLS} FROM directory_listings l WHERE l.slug = ? AND ${VISIBLE} LIMIT 1`, [slug]);
  return rows[0] ? publicRow(rows[0]) : null;
}

export async function sitemapRows(env) {
  return (await all(env, `SELECT l.slug, l.city, l.trade, l.updated_ts FROM directory_listings l WHERE ${VISIBLE} ORDER BY l.slug LIMIT 45000`, []));
}

/* La ligne telle qu'une page la voit : le téléphone n'existe que s'il est
 * affiché, et l'identifiant marchand ne sert qu'à l'enrichissement. */
function publicRow(r) {
  const show = Number(r.show_phone) === 1 && r.contact_phone;
  return {
    slug: r.slug, client: r.kind === 'client', merchant: r.kind === 'client' ? r.merchant : '',
    name: r.name, trade: r.trade, city: r.city, address: r.address || '', description: r.description || '',
    website: r.website || '', phone: show ? r.contact_phone : '', whatsapp: show && Number(r.whatsapp) === 1,
    updated: Number(r.updated_ts) || 0,
  };
}

/* ── Ce que Kiwi sait déjà d'un client, lu à l'affichage ──────────────────
 * Les horaires (store_docs `hours`), la réservation publiée (store_docs
 * `reservations`, settings.published, comme functions/api/booking.js) et la
 * carte publiée (table `menus`, Order Pro si features.orderpro, sinon la carte
 * en liste de functions/order/basic.js). Chaque lecture échoue en silence :
 * une fiche premium sans horaires reste une fiche. */
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function publicWeek(raw) {
  let h = raw;
  if (typeof h === 'string') { try { h = JSON.parse(h); } catch (_) { h = null; } }
  const week = h && h.week && typeof h.week === 'object' ? h.week : null;
  if (!week) return null;
  const out = DAYS.map((d) => {
    const day = week[d];
    const periods = day && day.open !== false && Array.isArray(day.periods)
      ? day.periods.map((p) => ({ from: String(p && p.from || '').slice(0, 5), to: String(p && p.to || '').slice(0, 5) }))
        .filter((p) => HHMM.test(p.from) && HHMM.test(p.to)).slice(0, 4)
      : [];
    return { day: d, periods };
  });
  return out.some((d) => d.periods.length) ? out : null;
}

export async function clientExtras(env, merchant) {
  const extras = { hours: null, booking: '', menu: '' };
  if (!merchant || !env || !env.DB) return extras;
  const one = async (sql) => { try { return await env.DB.prepare(sql).bind(merchant).first(); } catch (_) { return null; } };
  const [hours, resv, menu, cfg] = await Promise.all([
    one("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'hours'"),
    one("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'reservations'"),
    one('SELECT type, data FROM menus WHERE merchant = ?'),
    one('SELECT features FROM merchant_config WHERE merchant = ?'),
  ]);
  extras.hours = publicWeek(hours && hours.data);
  try { if (resv && JSON.parse(resv.data).settings.published === true) extras.booking = '/booking?merchant=' + encodeURIComponent(merchant); } catch (_) {}
  let items = 0;
  try { const m = JSON.parse(menu && menu.data); items = Array.isArray(m && m.items) ? m.items.length : 0; } catch (_) {}
  if (items) {
    let orderpro = false;
    try { orderpro = JSON.parse(cfg && cfg.features).orderpro === true; } catch (_) {}
    extras.menu = orderpro ? '/order?s=' + encodeURIComponent(merchant) : '/order/basic?s=' + encodeURIComponent(merchant);
  }
  return extras;
}

/* ── Écritures ─────────────────────────────────────────────────────────── */
export async function uniqueSlug(env, base, exceptId = '') {
  for (let i = 0; i < 50; i++) {
    const s = i ? `${base}-${i + 1}` : base;
    const row = await env.DB.prepare('SELECT id FROM directory_listings WHERE slug = ?').bind(s).first();
    if (!row || row.id === exceptId) return s;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

/* Un doublon : même nom dans la même ville, ou même téléphone dans la même
 * ville, sur une fiche qui n'a pas été refusée ni retirée. */
export async function findDuplicate(env, v, phoneKey) {
  const key = dedupeKey(v.name, v.city);
  const byName = await env.DB.prepare(
    "SELECT id, slug, status FROM directory_listings WHERE dedupe_key = ? AND status IN ('pending','approved') LIMIT 1"
  ).bind(key).first();
  if (byName) return byName;
  if (!phoneKey) return null;
  const rows = await env.DB.prepare(
    "SELECT id, slug, status, contact_phone FROM directory_listings WHERE city = ? AND contact_phone != '' AND status IN ('pending','approved') LIMIT 500"
  ).bind(v.city).all();
  return (rows.results || []).find((r) => phoneKey(r.contact_phone) === phoneKey(v.contact_phone)) || null;
}

/* ── Le jeton de formulaire : temps minimum de saisie ─────────────────────
 * Le formulaire porte l'heure à laquelle il a été servi, signée. Un envoi
 * moins de 4 secondes après, ou plus d'un jour après, est refusé : un robot
 * qui poste à la volée n'a pas le temps de « lire » la page. Sans AUTH_SECRET
 * (développement local), l'heure n'est pas signée. */
export const MIN_FILL_MS = 4000;
const MAX_FILL_MS = 24 * 3600 * 1000;
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function formToken(env, now = Date.now()) {
  const ts = String(now);
  return env && env.AUTH_SECRET ? `${ts}.${await hmac(env.AUTH_SECRET, 'kiwi-directory-form:' + ts)}` : ts;
}
export async function formTokenAge(env, token, now = Date.now()) {
  const [ts, sig] = String(token || '').split('.');
  if (!/^\d{12,14}$/.test(ts || '')) return -1;
  if (env && env.AUTH_SECRET && sig !== await hmac(env.AUTH_SECRET, 'kiwi-directory-form:' + ts)) return -1;
  const age = now - Number(ts);
  return age >= MIN_FILL_MS && age <= MAX_FILL_MS ? age : -1;
}

/* Le formulaire HTML poste en urlencoded ; un appel d'API, en JSON. */
export async function readBody(request) {
  const type = String(request.headers.get('Content-Type') || '').toLowerCase();
  const form = type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data');
  if (form) {
    const data = await request.formData();
    const out = {};
    for (const [k, v] of data.entries()) if (typeof v === 'string') out[k] = v.slice(0, 2000);
    return { form: true, body: out };
  }
  try { return { form: false, body: (await request.json()) || {} }; } catch (_) { return { form: false, body: null }; }
}
