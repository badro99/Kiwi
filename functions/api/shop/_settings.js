/* Kiwi Commerce · les réglages de la boutique en ligne (store doc `storefront`).
 *
 * Le commerçant les édite depuis le tableau de bord (POST /api/store,
 * feature `storefront`, propriétaire ou opérateur seulement) ; la vitrine les
 * relit avec le catalogue (GET /api/shop/catalog › settings) et les pose
 * par-dessus les valeurs de son stores.json. Une seule forme, celle-ci :
 * tout ce qui n'y figure pas est jeté, tout ce qui y figure est borné, à
 * l'écriture comme à la lecture. */

const FEATURE = 'storefront';
export const STOREFRONT_FEATURE = FEATURE;
export const MAX_COUPONS = 20;
export const MAX_PIECES = 300;

const text = (v, n) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const int = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function whatsapp(v) {
  let digits = String(typeof v === 'string' || typeof v === 'number' ? v : '').replace(/\D/g, '').replace(/^00/, '');
  /* Un numéro marocain écrit à la marocaine (06…, 07…, 05…) reçoit son indicatif. */
  if (/^0[5-7]\d{8}$/.test(digits)) digits = '212' + digits.slice(1);
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}
function instagram(v) {
  const h = text(v, 40).replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : '';
}
function accent(v) {
  const s = text(v, 7);
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : '';
}
function coupons(v) {
  const out = {};
  let n = 0;
  for (const [rawCode, rawPct] of Object.entries(obj(v))) {
    if (n >= MAX_COUPONS) break;
    const code = String(rawCode).trim().toUpperCase();
    const pct = Math.round(Number(rawPct));
    if (!/^[A-Z0-9]{3,20}$/.test(code) || !Number.isFinite(pct) || pct < 1) continue;
    if (Object.prototype.hasOwnProperty.call(out, code)) continue;
    out[code] = Math.min(90, pct);
    n++;
  }
  return out;
}

/* L'adresse publique de la boutique (https, nom d'hôte seul), posée par
   l'équipe Kiwi ou le commerçant : le tableau de bord l'affiche, la partage
   et en fait un QR code. Elle ne change rien au routage de la vitrine. */
function shopUrl(v) {
  const s = text(v, 120);
  if (!s) return '';
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (_) { return ''; }
  const host = u.hostname.toLowerCase();
  return u.protocol === 'https:' && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? 'https://' + host : '';
}

/* « Vu dans la campagne » : une image de la campagne où l'on voit la pièce
   portée, déposée par le commerçant dans le stockage photo de Kiwi
   (POST /api/media). Seul un chemin /api/media/… est gardé : jamais une
   adresse extérieure que la vitrine irait charger chez un tiers. */
function look(v) {
  const s = text(v, 200);
  return /^\/api\/media\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+){1,4}$/.test(s) && !s.includes('..') ? s : '';
}

/* Ce que le commerçant écrit sur une pièce pour la boutique en ligne
   (Boutique en ligne › Articles) : un texte libre (les paragraphes gardent
   leur saut de ligne), la matière, la coupe et l'image de campagne. Rangé
   par identifiant d'article ; une entrée vide n'est pas gardée. */
function pieces(v) {
  const out = {};
  let n = 0;
  for (const [id, raw] of Object.entries(obj(v))) {
    if (n >= MAX_PIECES) break;
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) continue;
    const r = obj(raw);
    const about = (typeof r.about === 'string' ? r.about : '').replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 600);
    const entry = { about, fabric: text(r.fabric, 60), fit: text(r.fit, 60) };
    const seen = look(r.look);
    if (seen) entry.look = seen;
    if (!entry.about && !entry.fabric && !entry.fit && !entry.look) continue;
    out[id] = entry;
    n++;
  }
  return out;
}

/* `ts` : l'heure posée par le serveur à l'écriture, ou celle déjà rangée à la lecture. */
export function cleanStorefront(raw, ts) {
  const d = obj(raw);
  const ship = obj(d.shipping);
  const free = ship.freeFromMAD;
  const bundles = obj(d.bundles);
  return {
    name: text(d.name, 60),
    tagline: text(d.tagline, 140),
    announcement: text(d.announcement, 120),
    whatsapp: whatsapp(d.whatsapp),
    instagram: instagram(d.instagram),
    accent: accent(d.accent),
    url: shopUrl(d.url),
    shipping: {
      feeMAD: int(ship.feeMAD, 0, 500),
      freeFromMAD: free == null || free === '' || !Number.isFinite(Number(free)) ? null : int(free, 0, 100000),
    },
    bundles: { 2: int(bundles[2], 0, 50), 3: int(bundles[3], 0, 50) },
    coupons: coupons(d.coupons),
    pieces: pieces(d.pieces),
    updatedTs: Math.max(0, Number(ts) || 0),
  };
}

/* Pour la vitrine : le document du commerçant, rebordé, ou null s'il n'en a jamais enregistré. */
export async function readStorefrontSettings(env, merchant) {
  try {
    const row = await env.DB.prepare('SELECT data, updated_ts FROM store_docs WHERE merchant = ? AND feature = ?')
      .bind(merchant, FEATURE).first();
    if (!row || !row.data) return null;
    const doc = JSON.parse(row.data);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    return cleanStorefront(doc, Number(doc.updatedTs) || Number(row.updated_ts) || 0);
  } catch (_) { return null; }
}
