/* ═══════════════════════════════════════════════════════════════════════════
 * UN SEUL COMPTOIR IMPRIME  (ticket #0066, partie 3)
 *
 * Le « hub d'impression exclusif » n'était exclusif que dans la tête de chaque
 * navigateur : le bail vivait dans le localStorage de l'appareil, et le
 * localStorage d'un iPad ne sait rien de celui de la caisse d'à côté. Deux
 * tills pouvaient donc chacune se croire LE hub, tirer la même commande de la
 * file partagée, et sortir deux fois le même bon en cuisine. Le mot
 * « exclusif » dans l'interface était faux, et personne ne pouvait le voir
 * avant que le papier ne sorte en double.
 *
 * Un bail ne se fusionne pas : il s'arbitre. Ce document passe donc par
 * l'écriture conditionnelle de store_docs (UPDATE … WHERE rev = ?), qui est
 * exactement la primitive qu'il faut : deux caisses qui réclament depuis la
 * même révision, une seule gagne, et la perdante reçoit un 409 qui NOMME
 * l'appareil déjà en place.
 *
 * Trois règles, et rien de plus :
 *   · un bail vivant appartient à son porteur — personne d'autre ne le prend ;
 *   · un bail expiré est libre, sans geste administratif : un iPad oublié
 *     dans un tiroir ne doit pas priver le comptoir de son imprimante ;
 *   · l'horloge est celle du SERVEUR. Une tablette qui retarde d'une heure
 *     s'attribuerait sinon un bail déjà mort, ou éternel.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Assez long pour survivre à un onglet en arrière-plan et à un réseau qui
   hoquette, assez court pour qu'une caisse éteinte en plein service libère
   l'imprimante avant la fin du coup de feu. */
export const HUB_LEASE_MS = 90000;

const DEVICE = /^[A-Za-z0-9_:.-]{4,80}$/;

function liveHub(doc, now) {
  const hub = doc && typeof doc === 'object' ? doc.hub : null;
  if (!hub || typeof hub !== 'object') return null;
  if (!DEVICE.test(String(hub.deviceId || ''))) return null;
  return Number(hub.expiresAt || 0) > now ? hub : null;
}

/* Renvoie { ok: true, value } ou { ok: false, error, status, holder }. */
export function validateHubClaim(previous, next, now, lease = HUB_LEASE_MS) {
  if (!next || typeof next !== 'object' || Array.isArray(next)) {
    return { ok: false, error: 'bad-hub-document', status: 422 };
  }
  const held = liveHub(previous, now);
  const wanted = next.hub && typeof next.hub === 'object' ? next.hub : null;

  /* Libérer. Seul le porteur peut rendre le bail : sinon n'importe quelle
     caisse pourrait déloger le comptoir en poussant un document vide. */
  if (!wanted) {
    if (held) return { ok: false, error: 'print-hub-held', status: 409, holder: publicHub(held) };
    return { ok: true, value: { hub: null } };
  }

  const deviceId = String(wanted.deviceId || '');
  if (!DEVICE.test(deviceId)) return { ok: false, error: 'bad-hub-device', status: 422 };
  if (held && held.deviceId !== deviceId) {
    return { ok: false, error: 'print-hub-taken', status: 409, holder: publicHub(held) };
  }

  const name = String(wanted.name || '').slice(0, 60);
  const renewing = !!(held && held.deviceId === deviceId);
  return {
    ok: true,
    value: {
      hub: {
        deviceId,
        name,
        /* La prise d'origine est conservée à travers les renouvellements : c'est
           elle qui permet de dire « cette caisse imprime depuis 14 h 10 ». */
        claimedAt: renewing ? Number(held.claimedAt) || now : now,
        renewedAt: now,
        expiresAt: now + lease,
      },
    },
  };
}

/* Ce qu'on rend à la caisse qui a perdu l'arbitrage : de quoi nommer l'appareil
   en place et dire quand il lâchera prise, rien qui identifie une personne. */
export function publicHub(hub) {
  if (!hub) return null;
  return {
    deviceId: String(hub.deviceId || ''),
    name: String(hub.name || ''),
    claimedAt: Number(hub.claimedAt) || 0,
    expiresAt: Number(hub.expiresAt) || 0,
  };
}
