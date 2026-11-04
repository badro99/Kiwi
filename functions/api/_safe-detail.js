/* Le texte brut d'une exception (nom de table, requête SQL) ne part jamais
   dans une réponse : il va au journal du serveur, le client reçoit un code. */
export function safeDetail(scope, error) {
  try { console.error('[' + scope + ']', String((error && error.message) || error)); } catch (_) {}
  return 'internal';
}
