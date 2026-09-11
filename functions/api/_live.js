// poke() — le seul point de contact entre un écrivain et le canal temps réel.
//
// Un endpoint qui vient d'écrire dans D1 appelle poke(env, merchant, feature).
// Tous les appareils du commerçant qui tiennent une socket ouverte reçoivent
// « quelque chose a bougé » et relisent TOUT DE SUITE par leur route habituelle,
// au lieu d'attendre leur prochain tour d'horloge.
//
// Ce qui part dans le poke : un nom de fonctionnalité et un horodatage. Rien
// d'autre. Pas d'état de table, pas de montant, pas de nom. Le destinataire ne
// gagne aucune donnée qu'il n'aurait pas pu lire lui-même une seconde plus tard,
// avec ses propres droits — le poke ne fait que supprimer l'attente.
//
// Fail-soft comme le reste de functions/ : sans binding LIVE, sans commerçant,
// ou si le concentrateur tousse, on ne renvoie rien et on n'interrompt rien.
// L'écriture en base est déjà faite ; le sondage rattrapera. Une notification
// perdue coûte une seconde d'attente, jamais une donnée.

export async function poke(env, merchant, feature) {
  if (!env || !env.LIVE || !merchant) return;
  try {
    const id = env.LIVE.idFromName(String(merchant));
    await env.LIVE.get(id).fetch('https://live.kiwi/poke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: String(feature || ''), ts: Date.now() }),
    });
  } catch (_) {
    /* concentrateur absent ou en panne → on retombe sur les sondages */
  }
}
