// The shop as its Wallet card shows it: the `wallet` store doc (switched on by
// the owner, name, colours, position, address, phone), the `fidelity` program
// and the receipt logo. One D1 read for the three documents.

const parse = (s) => { try { return JSON.parse(s || '{}') || {}; } catch (_) { return {}; } };
const hexColor = (v, d) => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toUpperCase() : d;
const title = (slug) => String(slug || '').split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export function logoBytes(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const bin = atob(m[1]), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function loadMerchant(db, slug) {
  const merchant = String(slug || '').trim().toLowerCase().slice(0, 64);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(merchant)) return null;
  const r = await db.prepare("SELECT feature, data FROM store_docs WHERE merchant = ? AND feature IN ('wallet', 'fidelity', 'receipt', 'business')").bind(merchant).all();
  const docs = {};
  for (const row of r.results || []) docs[row.feature] = parse(row.data);
  const w = docs.wallet || {}, look = (docs.receipt && docs.receipt.look) || {};
  const lat = Number(w.lat), lng = Number(w.lng);
  return {
    slug: merchant,
    on: w.on === true,
    name: String(w.name || '').trim().slice(0, 60) || title(merchant),
    color: hexColor(w.color, '#053B2C'),
    bg: hexColor(w.bg, '#F7F5F0'),
    lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
    lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null,
    address: String(w.address || '').slice(0, 200),
    phone: String(w.phone || '').slice(0, 30),
    fidelity: docs.fidelity || null,
    /* the receipt logo (the shop may switch it off there), else the business profile's */
    logoUrl: look.logoOn === false ? '' : String(look.logo || (docs.business && docs.business.logo) || ''),
  };
}
