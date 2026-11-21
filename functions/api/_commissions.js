// Commissions vendeurs : le calcul pur, sans base ni réseau (testé par
// tools/seller-commissions-test.mjs). La route est functions/api/commissions.js.
//
// Règles :
// · L'assiette d'un vendeur est l'argent encaissé sur ses ventes gardées (ni
//   annulées, ni remboursements), MOINS les remboursements faits dans la période
//   sur ses ventes, quelle que soit la personne qui les a rendus : rendre un
//   caftan reprend la commission de qui l'avait vendu, pas de qui tient la caisse.
// · Une vente réglée en avoir n'apporte que son argent : la valeur de l'avoir a
//   déjà compté chez qui a fait la première vente. Rien n'est payé deux fois.
// · Le taux est celui de la fiche Équipe (commissionRate, en %). Sans taux, les
//   ventes du vendeur sont montrées et sa commission reste « à définir » (null),
//   jamais zéro inventé.
// · Une vente ne se rattache à une fiche que par l'id (app employé) ou par le
//   nom exact, accents et casse mis à part. Les ventes sans vendeur (avant cette
//   fonction, boutique en ligne, caisse sans code saisi) restent « non attribuées ».

export function memberName(m) {
  const full = `${(m && m.firstName) || ''} ${(m && m.lastName) || ''}`.replace(/\s+/g, ' ').trim();
  return full || String((m && m.name) || '').replace(/\s+/g, ' ').trim();
}

export function nameKey(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
}

export function memberRate(m) {
  const r = Number(m && m.commissionRate);
  return Number.isFinite(r) && r > 0 ? Math.min(100, r) : null;
}

const cents = (v) => {
  const n = Math.round(Number(v));
  return Number.isSafeInteger(n) ? n : 0;
};

/* sales   : [{ seller_id, seller_name, n, cents }]  ventes gardées, montants positifs
 * refunds : [{ seller_id, seller_name, cents }]     remboursés dans la période, en positif
 * members : la liste Équipe (team.members) */
export function commissionsReport({ sales = [], refunds = [], members = [] } = {}) {
  const roster = (Array.isArray(members) ? members : []).filter((m) => m && typeof m === 'object' && memberName(m));
  const byId = new Map(roster.filter((m) => m.id).map((m) => [String(m.id), m]));
  const byName = new Map();
  for (const m of roster) {
    const k = nameKey(memberName(m));
    /* Deux fiches au même nom : aucune ne prend les ventes de l'autre. */
    byName.set(k, byName.has(k) ? null : m);
  }
  const rows = new Map();
  const unattributed = { tickets: 0, salesCents: 0, refundCents: 0 };
  const rowFor = (sellerId, sellerName) => {
    const id = String(sellerId || '');
    const name = String(sellerName || '').replace(/\s+/g, ' ').trim();
    const m = (id && byId.get(id)) || (name && byName.get(nameKey(name))) || null;
    const key = m ? 'm:' + String(m.id || nameKey(memberName(m))) : (name ? 'n:' + nameKey(name) : (id ? 'i:' + id : ''));
    if (!key) return null;
    if (!rows.has(key)) {
      rows.set(key, {
        key, memberId: m ? String(m.id || '') : '', name: m ? memberName(m) : (name || id),
        rate: m ? memberRate(m) : null, inTeam: !!m,
        tickets: 0, salesCents: 0, refundCents: 0,
      });
    }
    return rows.get(key);
  };
  for (const m of roster) if (memberRate(m) != null) rowFor(m.id, memberName(m));
  for (const s of sales) {
    const r = rowFor(s && s.seller_id, s && s.seller_name);
    const target = r || unattributed;
    target.tickets += Math.max(0, cents(s && s.n));
    target.salesCents += Math.max(0, cents(s && s.cents));
  }
  for (const s of refunds) {
    const r = rowFor(s && s.seller_id, s && s.seller_name);
    (r || unattributed).refundCents += Math.max(0, cents(s && s.cents));
  }
  const sellers = [...rows.values()].map((r) => {
    const netCents = r.salesCents - r.refundCents;
    return { ...r, netCents, commissionCents: r.rate == null ? null : Math.round(netCents * r.rate / 100) };
  }).sort((a, b) => b.netCents - a.netCents || a.name.localeCompare(b.name, 'fr'));
  const rated = sellers.filter((s) => s.commissionCents != null);
  return {
    sellers,
    unattributed: { ...unattributed, netCents: unattributed.salesCents - unattributed.refundCents },
    totals: {
      netCents: sellers.reduce((n, s) => n + s.netCents, 0),
      commissionCents: rated.reduce((n, s) => n + s.commissionCents, 0),
      unrated: sellers.filter((s) => s.commissionCents == null && s.netCents !== 0).length,
    },
  };
}
