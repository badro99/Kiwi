export { startOfDay, startOfWeek, nextOrderNumber } from './_guest-clock.js';
export { normTable, tableKey, planTableKey, floorPlanTables, KNOWN_TABLES_DAYS, servedTables } from './_guest-tables.js';
export { newSessionId, SESSION_ID, DESK_FRESH_MS, deskTouch, deskOpen } from './_guest-sessions.js';
export { hoursOpenAt, hoursClosed } from './_guest-hours.js';
export { priceOrder } from './_guest-pricing.js';
import { ZONE_LAWS, effectiveZone } from '../_zone-law.js';
import { DateTimeFormat } from '../_cached-clock.js';
// functions/api/order/_lib.js — ce que les trois moitiés du relais partagent.
//
// Le relais OrderPro a trois portes : /api/order (le téléphone dépose),
// /api/order/session (le téléphone s'assoit et demande s'il est encore le
// bienvenu) et /api/order/queue (le comptoir lit et décide). Elles avaient déjà
// commencé à recopier les mêmes règles — `startOfDay` existait mot pour mot en
// trois endroits, `orderProEnabled` en deux — et une règle recopiée est une
// règle qu'on corrigera une fois sur trois.
//
// Le préfixe « _ » exclut ce fichier du routage Pages : ce n'est pas une URL,
// c'est la bibliothèque des trois autres (même convention que functions/auth/_lib.js).

/* Menu promotions (happy hour…): the same rule the till and the waiter app
 * show, applied here with the server's clock. A device never sets a price. */
import '../../../assets/menu-promos.js';
import { merchantZone, businessDate, businessBoundary, addBusinessDays, DEFAULT_ZONE } from '../_business-day.js';
const MenuPromos = () => globalThis.KiwiMenuPromos;
/* menu-promos.js reads its Casablanca wall clock through globalThis.KiwiZoneLaw,
 * which the kit publishes in the browser before the till loads the rule. The
 * Worker has no kit, so the rule fell back to the runtime's own time zone data:
 * a runtime older than the 20 September 2026 reform still puts Morocco at +01,
 * and the server opened a 17:00 happy hour at 16:00 while the till waited for
 * 17:00. Same law on both sides (docs/specs/zone-law.md); the rule reads it on
 * its first price, after this module has run. */
if (!globalThis.KiwiZoneLaw) globalThis.KiwiZoneLaw = { ZONE_LAWS, effectiveZone, DateTimeFormat };

/* Extraction privée : _guest-clock */
/* ── L'option est-elle ouverte chez ce commerçant ? ────────────────────────
 * ATTENTION, cette clé inverse la convention de merchant_config : partout
 * ailleurs une clé ABSENTE veut dire « module allumé », parce que ces modules
 * font partie de l'interface déjà payée. Order Pro est une option payante qui
 * transforme le téléphone d'un inconnu en terminal de commande : elle est
 * ÉTEINTE tant qu'un opérateur n'a pas écrit `true`.
 * Ligne absente, clé absente, JSON cassé, base en panne → false. */
export async function orderProEnabled(env, merchant) {
  try {
    const row = await env.DB.prepare(
      'SELECT features FROM merchant_config WHERE merchant = ?'
    ).bind(merchant).first();
    if (!row || !row.features) return false;
    return (JSON.parse(row.features) || {}).orderpro === true;
  } catch (_) { return false; }
}

/* Extraction privée : _guest-tables */
/* ── LE CURSEUR REGARDE LÉGÈREMENT EN ARRIÈRE ──────────────────────────────
 * Les sondages avancent avec `since` : le client renvoie le `now` de la réponse
 * précédente, et le serveur ne rend que ce qui a changé DEPUIS. Le piège est
 * d'une milliseconde, et il perd des commandes pour de bon.
 *
 * `now` est pris AVANT la lecture — il faut bien le prendre quelque part — et
 * plusieurs écritures peuvent s'intercaler entre les deux (l'expiration des
 * `pending`, le pointage des sessions). Une commande écrite dans cet intervalle
 * porte un `updated_ts` inférieur ou égal à `now` : la lecture de CE tour ne la
 * voit pas encore, et le tour SUIVANT l'exclut, puisqu'il ne demande que
 * `updated_ts > now`. Elle n'est jamais présentée. Comme la caisse n'attache
 * une commande à l'addition qu'au moment où on la lui présente, elle est perdue
 * pour l'addition — silencieusement.
 *
 * On recule donc le curseur de deux secondes. Le chevauchement re-présente
 * quelques commandes déjà connues, ce qui ne coûte rien : les trois clients
 * sont idempotents (marqueurs de ligne côté caisse, `opId` côté cuisine, `id`
 * côté salle). Un client qui perd une commande coûte de l'argent ; un client
 * qui la revoit ne coûte rien.
 *
 * Reculer le CURSEUR plutôt que corriger chaque client a une conséquence utile :
 * les navigateurs qui tournent encore sur une version en cache reçoivent le
 * correctif sans rien réinstaller. */
export const CURSOR_LAG_MS = 2000;
export function pollCursor(now) {
  return Math.max(0, Number(now) - CURSOR_LAG_MS);
}

/* Extraction privée : _guest-sessions */
/* Extraction privée : _guest-hours */
/* Extraction privée : _guest-pricing */
