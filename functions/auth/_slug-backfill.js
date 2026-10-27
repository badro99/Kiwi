/* Les comptes d'avant la réservation (business_slug NULL) ne se balaient plus à
 * chaque inscription : un rattrapage UNIQUE leur donne leur slug, par lots
 * bornés, puis un drapeau (store_docs, '_platform' / 'slug-backfill') dit que
 * c'est fait et les inscriptions suivantes ne lisent plus que des index.
 *
 * Un compte dont le nom n'a pas de slug propre (aucune lettre latine, « client »)
 * ou dont le slug est déjà pris par un autre compte reçoit « legacy:<id> » : il
 * ne peut de toute façon jamais correspondre au nom d'une nouvelle inscription
 * (le slug « client » est refusé dans signup.js), et il sort ainsi de
 * l'ensemble à rattraper. Le slug est écrit par l'UPDATE lui-même, sous l'index
 * unique : deux inscriptions simultanées ne peuvent pas réserver le même. */
import { slugMerchant } from './_lib.js';

export const BACKFILL_BATCH = 200;
export const BACKFILL_MAX_BATCHES = 50;

/**
 * @param {any} env
 * @param {string} wantedSlug
 * @returns {Promise<boolean>} vrai si un ancien compte porte déjà ce nom
 */
export async function legacyNameTaken(env, wantedSlug) {
  const done = await env.DB.prepare(
    "SELECT 1 AS hit FROM store_docs WHERE merchant = '_platform' AND feature = 'slug-backfill' LIMIT 1"
  ).first();
  if (done) return false;
  let taken = false;
  for (let round = 0; round < BACKFILL_MAX_BATCHES; round++) {
    const rs = await env.DB.prepare(
      "SELECT id, business FROM accounts WHERE business_slug IS NULL AND business IS NOT NULL AND business <> '' LIMIT " + BACKFILL_BATCH
    ).all();
    const rows = rs.results || [];
    if (!rows.length) break;
    const writes = [];
    for (const row of rows) {
      const slug = slugMerchant(row.business);
      if (slug === wantedSlug) taken = true;
      const own = slug && slug !== 'client' ? slug : '';
      writes.push(env.DB.prepare(
        `UPDATE accounts SET business_slug = CASE WHEN ? <> '' AND NOT EXISTS (SELECT 1 FROM accounts WHERE business_slug = ?) THEN ? ELSE ? END
          WHERE id = ? AND business_slug IS NULL`
      ).bind(own, own, own, 'legacy:' + row.id, row.id));
    }
    try { await env.DB.batch(writes); }
    catch (e) {
      /* Une inscription simultanée a pris un slug entre la lecture et l'écriture :
       * le lot est annulé en entier, on relit. */
      if (!/UNIQUE constraint failed/i.test(String((e && e.message) || e))) throw e;
    }
    if (taken) return true;
    if (rows.length < BACKFILL_BATCH) break;
    if (round === BACKFILL_MAX_BATCHES - 1) throw new Error('slug backfill unfinished');
  }
  const ts = Date.now();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES ('_platform', 'slug-backfill', ?, 1, ?)"
  ).bind(JSON.stringify({ done: ts }), ts).run();
  return taken;
}
