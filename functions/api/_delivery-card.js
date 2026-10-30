/* La fiche de livraison (propriétaire, 30 octobre 2026).
 *
 * Une vente partie en livraison porte le destinataire : nom, téléphone, ville,
 * adresse et un commentaire. La caisse la demande avant d'enregistrer la
 * vente ; elle voyage avec la vente (POST /api/sale, champ deliveryCard) et
 * s'écrit ici, une fois, en ligne sale_audit 'delivery-card' (impact = la
 * fiche en JSON). Aucune migration : sale_audit existe partout.
 *
 * Ce n'est PAS une cliente du carnet : rien ici ne touche à clients, aux
 * points ni à la fidélité. La fiche sert à retrouver la commande quand le
 * colis revient (page Livraisons de la caisse, recherche par nom, ville ou
 * téléphone). Elle n'est lue que par GET /api/receivables, réservé au
 * commerce et à sa caisse appairée. */

const CAP = { name: 80, phone: 24, city: 60, address: 200, note: 300 };
const text = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/* La fiche nettoyée, ou null si un champ obligatoire manque. Le commentaire
 * est facultatif ; le téléphone garde sa forme saisie mais doit compter au
 * moins 8 chiffres. */
export function cleanDeliveryCard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const card = {
    name: text(raw.name, CAP.name), phone: text(raw.phone, CAP.phone), city: text(raw.city, CAP.city),
    address: text(raw.address, CAP.address), note: text(raw.note, CAP.note),
  };
  /* La ville choisie dans la liste Ozon : le colis se crée tout seul
     (functions/api/ozon/parcels.js › autoParcel). */
  const cityId = Number(raw.cityId);
  if (Number.isSafeInteger(cityId) && cityId > 0) card.cityId = cityId;
  if (!card.name || !card.city || !card.address) return null;
  if (card.phone.replace(/\D/g, '').length < 8) return null;
  return card;
}

/* Une seule fiche par vente : une caisse qui renvoie le même ticket (file
 * hors ligne, nouvel essai) n'en écrit jamais une seconde, et la première
 * reste. Au mieux : une fiche qui ne s'écrit pas ne défait jamais la vente. */
export async function saveDeliveryCard(db, merchant, saleId, raw, saleTs) {
  const card = cleanDeliveryCard(raw);
  if (!card || !db || !merchant || !saleId) return false;
  await db.prepare(
    `INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
     SELECT ?, ?, 'delivery-card', '', '', '', '', 0, 0, 'delivery', '', ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-card')`
  ).bind(merchant, saleId, Number(saleTs) || 0, JSON.stringify(card), Date.now(), merchant, saleId).run();
  return true;
}

/* sale_id → fiche, pour toutes les livraisons du commerce. */
export async function readDeliveryCards(db, merchant) {
  const bySale = new Map();
  try {
    const rs = await db.prepare(`SELECT sale_id, impact FROM sale_audit
      WHERE merchant = ? AND action = 'delivery-card' ORDER BY id ASC`).bind(merchant).all();
    (rs.results || []).forEach((r) => {
      const k = String(r.sale_id);
      if (bySale.has(k)) return;
      let card = null;
      try { card = cleanDeliveryCard(JSON.parse(r.impact || 'null')); } catch (_) { card = null; }
      if (card) bySale.set(k, card);
    });
  } catch (_) { /* table absente : aucune fiche */ }
  return bySale;
}
