// La vue du carnet de réservations pour qui ne le tient pas (functions/api/
// store.js › PARTIAL). Le document `reservations` porte, pour chaque client,
// son téléphone, son courriel, les pièces d'identité des voyageurs d'un hôtel,
// et `manageToken` : le lien « gérer ma réservation » qui permet d'annuler sans
// compte. `tenantFor()` admet une caisse appairée, appareil de comptoir que
// n'importe qui peut approcher ; elle lisait tout cela, et pouvait annuler la
// réservation de n'importe quel client avec son jeton.
//
// Aucune surface de caisse ne lit ce document (seuls le tableau de bord et
// l'hôtel, sous la session du compte, le font). La caisse le reçoit donc sans
// ces champs, et `keep` les reprend au serveur quand une surface qui n'a reçu
// que cette vue réécrit le document : sans lui, elle effacerait les contacts
// et les liens de tous les clients (la règle de team-doc-redaction-test).

/* Une liste de ce que la caisse peut voir, pas de ce qu'il faut cacher : un
   champ ajouté demain à une fiche client ou voyageur (adresse, nationalité,
   numéro de pièce sous un autre nom) reste caché sans qu'on y pense. */
const PERSON_VISIBLE = ['id', 'name', 'firstName', 'lastName'];
const LINKS = ['manageToken', 'publicRef'];

function bookingsOf(doc) {
  return doc && typeof doc === 'object' && Array.isArray(doc.bookings) ? doc.bookings : null;
}

function visiblePerson(p) {
  if (!p || typeof p !== 'object') return p;
  const out = {};
  PERSON_VISIBLE.forEach((k) => { if (k in p) out[k] = p[k]; });
  return out;
}
/* Ce que la vue a retiré revient de la copie du serveur ; un champ que la
   caisse a rempli elle-même (non vide) est gardé. */
function restorePerson(was, now) {
  const out = { ...(now && typeof now === 'object' ? now : {}) };
  Object.keys(was).forEach((k) => {
    if (PERSON_VISIBLE.includes(k)) return;
    if (out[k] === undefined || out[k] === null || out[k] === '') out[k] = was[k];
  });
  return out;
}

function hideBooking(b) {
  if (!b || typeof b !== 'object') return b;
  const out = { ...b };
  LINKS.forEach((k) => { if (k in out) out[k] = ''; });
  if (out.customer && typeof out.customer === 'object') out.customer = visiblePerson(out.customer);
  if (Array.isArray(out.guests)) out.guests = out.guests.map(visiblePerson);
  return out;
}

export function hideReservations(doc) {
  const bookings = bookingsOf(doc);
  if (!bookings) return doc;
  return { ...doc, bookings: bookings.map(hideBooking) };
}

/* Ce que la vue a retiré revient du serveur. Les liens ne viennent JAMAIS de
   l'appelant : une caisse ne fabrique pas un jeton « gérer ma réservation ».
   Un contact ou une pièce saisis par elle (champ non vide) sont gardés. */
export function keepReservations(prev, next) {
  const bookings = bookingsOf(next);
  if (!bookings) return next;
  const before = new Map((bookingsOf(prev) || []).filter((b) => b && b.id).map((b) => [String(b.id), b]));
  return { ...next, bookings: bookings.map((b) => {
    if (!b || typeof b !== 'object') return b;
    const old = before.get(String(b.id || '')) || null;
    const out = { ...b };
    LINKS.forEach((k) => {
      const kept = old && typeof old[k] === 'string' ? old[k] : '';
      if (kept || k in out) out[k] = kept;
    });
    if (old && old.customer && typeof old.customer === 'object') out.customer = restorePerson(old.customer, out.customer);
    if (old && Array.isArray(old.guests) && Array.isArray(out.guests)) {
      // Un voyageur sans id se retrouve par sa place dans la liste.
      const slot = (g, i) => (g && g.id ? 'id:' + g.id : 'at:' + i);
      const guests = new Map(old.guests.map((g, i) => [slot(g, i), g]));
      out.guests = out.guests.map((g, i) => {
        const was = g && typeof g === 'object' ? guests.get(slot(g, i)) : null;
        if (!was || typeof was !== 'object') return g;
        return restorePerson(was, g);
      });
    }
    return out;
  }) };
}
