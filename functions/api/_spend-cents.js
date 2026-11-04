// Dépense d'une cliente en centimes entiers (migrations/0020_client_spend_cents.sql).
//
// La colonne flottante `clients.spend` accumulait des erreurs d'arrondi
// (0,1 + 0,2 = 0,30000000000000004). `spend_cents` est un entier : le serveur
// l'écrit à côté de l'ancienne colonne pendant la transition et ne lit que lui.
// NULL (ligne écrite par un ancien déploiement, avant l'application de la
// migration) retombe sur l'ancienne colonne : rien ne casse.
export const SPEND_CENTS_SQL = 'COALESCE(spend_cents, CAST(ROUND(spend * 100) AS INTEGER))';

export const toCents = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/* Le total d'une ligne de carnet, en centimes, quelle que soit son ancienneté. */
export const spendCentsOf = (row) => {
  if (row && row.spend_cents != null && Number.isFinite(Number(row.spend_cents))) return Math.round(Number(row.spend_cents));
  return toCents(row && row.spend);
};
