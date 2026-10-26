// Contrat : capacités de session et présence du comptoir dans order_desk uniquement.
/* ── L'identifiant de session ──────────────────────────────────────────────
 * Il EST la capacité : le téléphone n'a pas de compte, pas de mot de passe et
 * pas de cookie garanti (navigation privée, cookies coupés). C'est donc 132
 * bits tirés au sort et non un compteur — un identifiant devinable rendrait la
 * révocation décorative, puisqu'il suffirait de deviner la session suivante. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function newSessionId() {
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return 'tsx-' + out;
}
export const SESSION_ID = /^tsx-[A-Za-z0-9]{22}$/;

/* ── La présence du comptoir ───────────────────────────────────────────────
 * C'est la seule protection sérieuse contre « je garde le lien et je commande
 * de chez moi ». Elle ne peut pas venir du téléphone, qui ment ; elle vient de
 * la caisse, qui interroge déjà sa file toutes les six secondes avec une
 * requête authentifiée. On note l'heure de ce passage, et ouvrir une session
 * exige que le comptoir ait donné signe de vie récemment.
 *
 * Commerce fermé ⇒ caisse éteinte ⇒ plus aucune session ne s'ouvre. Une porte
 * qui se ferme toute seule le soir, sans horaire à saisir et sans horloge à
 * régler.
 *
 * Un seul repli : une base où la TABLE `order_desk` n'existe pas encore
 * (migration pas faite) laisse passer, faute de pouvoir savoir.
 *
 * Une caisse qui n'a JAMAIS sondé, en revanche, c'est « fermé ». Avant
 * (2026-10-11), elle laissait passer : le client voyait « commande envoyée »
 * pour une commande versée dans une file que personne ne lit, puisque c'est
 * justement la caisse qui la lit. Le coût du « fermé » est minime : une caisse
 * allumée sonde toutes les six secondes, donc le commerçant qui vient
 * d'activer l'option est ouvert dès qu'il ouvre sa caisse. */
export const DESK_FRESH_MS = 5 * 60 * 1000;   // le comptoir sonde toutes les 6 s

export async function deskTouch(env, merchant) {
  try {
    await env.DB.prepare(
      `INSERT INTO order_desk (merchant, seen_ts) VALUES (?, ?)
         ON CONFLICT(merchant) DO UPDATE SET seen_ts = excluded.seen_ts`
    ).bind(merchant, Date.now()).run();
  } catch (_) { /* table pas encore migrée → la présence reste inconnue, on laisse passer */ }
}

export async function deskOpen(env, merchant) {
  try {
    const row = await env.DB.prepare(
      'SELECT seen_ts FROM order_desk WHERE merchant = ?'
    ).bind(merchant).first();
    if (!row) return false;                // jamais vue ⇒ personne ne lirait la commande
    return (Date.now() - (row.seen_ts || 0)) < DESK_FRESH_MS;
  } catch (_) { return true; }             // table absente ⇒ idem
}

