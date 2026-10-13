// Temps moyen à table : le calcul pur, sans base ni requête
// (functions/api/table-time.js le sert au tableau de bord).
//
// Une visite de table (table_sessions, mode 'table') s'ouvre quand on installe
// la tablée et se ferme pour une raison écrite dans closed_by. Seules les
// fermetures qui disent « la tablée est partie » mesurent un temps à table :
//   settle, settled-at-till     l'addition est réglée (téléphone, caisse)
//   service-payment(-pending)   payée depuis l'app des serveurs
//   service:<id>                un serveur a libéré la table
//   caisse                      ancienne écriture de la caisse
// Tout le reste est écarté, et c'est voulu : une visite expirée, annulée,
// élaguée (prune-stale) ou fusionnée dans une autre table (merged-into-…) ne
// dit pas quand les clients sont partis. Une raison inconnue est écartée
// aussi : mieux vaut une tuile vide qu'une moyenne fausse.
//
// Garde-fous sur la durée : moins de 5 minutes, c'est une table ouverte par
// erreur ; plus de 5 heures, une table oubliée ouverte. Ni l'une ni l'autre
// n'est un repas. Sous 5 visites retenues, pas de moyenne : trois tables ne
// font pas un rythme de salle.

export const MIN_MS = 5 * 60 * 1000;
export const MAX_MS = 5 * 3600 * 1000;
export const MIN_VISITS = 5;

export function isDeparture(closedBy) {
  const why = String(closedBy || '');
  return why === 'settle' || why === 'settled-at-till' || why === 'caisse'
    || why === 'service-payment' || why === 'service-payment-pending'
    || /^service:./.test(why);
}

export function dwellStats(rows) {
  const minutes = [];
  let skipped = 0;
  for (const r of rows || []) {
    const opened = Number(r && r.opened_ts), closed = Number(r && r.closed_ts);
    if (!r || !isDeparture(r.closed_by) || !(opened > 0) || !(closed > opened)) { skipped++; continue; }
    const d = closed - opened;
    if (d < MIN_MS || d > MAX_MS) { skipped++; continue; }
    minutes.push(d / 60000);
  }
  minutes.sort((a, b) => a - b);
  const n = minutes.length;
  if (n < MIN_VISITS) return { visits: n, skipped, avgMin: null, medianMin: null };
  const avg = minutes.reduce((s, m) => s + m, 0) / n;
  const mid = n >> 1;
  const median = n % 2 ? minutes[mid] : (minutes[mid - 1] + minutes[mid]) / 2;
  return { visits: n, skipped, avgMin: Math.round(avg), medianMin: Math.round(median) };
}
