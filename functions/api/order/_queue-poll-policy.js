import { CURSOR_LAG_MS } from './_lib.js';
// Contrat : validation du curseur et fenêtres de lecture ; aucune donnée marchande.
const MAX_ROWS = 100;
/* The queue may contain more than one page after a disconnected service.
 * A cursor needs both timestamp and id: many orders can share the same
 * millisecond, and a timestamp-only continuation would skip the rest. */
function readPageCursor(raw, now) {
  if (!raw || raw.length > 300) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.v !== 1 || !Number.isSafeInteger(value.end)
      || !Number.isSafeInteger(value.ts) || value.end > now + CURSOR_LAG_MS
      || value.ts < 0 || value.ts > value.end
      || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id)) return null;
    return value;
  } catch (_) { return null; }
}
const PENDING_TTL_MS = 30 * 60 * 1000;
const KITCHEN_TTL_MS = 6 * 60 * 60 * 1000;
const OPEN_VISIT_RECOVERY_MS = 7 * 24 * 60 * 60 * 1000;
// Archive changes are tombstones for tills with a saved shift. They must be
// delivered even when the original order is older than the kitchen window.
const ARCHIVED_TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000;
/* Combien de temps une commande refusée reste lisible comme « expirée » dans
 * le sondage. Deux heures : assez pour qu'un client qui arrive avec du retard
 * retrouve sa commande au comptoir et la fasse reprendre, assez court pour ne
 * pas transformer la file en archive. Voir le bloc `expired` dans onRequestGet. */
const EXPIRED_MS = 2 * 60 * 60 * 1000;
/* Au-delà de cet âge, le sondage d'un serveur en service ré-estampille les
 * sessions de ses tables. Cinq minutes : très en dessous des deux heures de
 * PRESENCE_MS, donc la table ne peut pas s'éteindre sous les pieds du serveur,
 * et assez espacé pour qu'un sondage toutes les six secondes n'écrive pas. */
const SERVICE_TOUCH_MS = 5 * 60 * 1000;


export { MAX_ROWS, readPageCursor, PENDING_TTL_MS, KITCHEN_TTL_MS, OPEN_VISIT_RECOVERY_MS, ARCHIVED_TOMBSTONE_MS, EXPIRED_MS, SERVICE_TOUCH_MS };
