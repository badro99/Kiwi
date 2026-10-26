// Contrat : normalisation et lecture des tables connues ; aucune mutation.
/* ── Le numéro de table ────────────────────────────────────────────────────
 * L'ancienne règle était `replace(/\D/g,'')` : elle ne gardait que les
 * chiffres. Or le plan de salle laisse le patron nommer ses tables librement —
 * « T7 », « Terrasse 2 », « Bar ». Ces trois-là devenaient « 7 », « 2 » et « »
 * (vide), donc une commande de la terrasse 2 se posait sur la table 2 de la
 * salle, et le bar ne se rattachait à rien du tout.
 * On garde donc les lettres, et on borne : c'est une étiquette de table, pas
 * un champ libre. La normalisation (majuscules, espaces resserrés) sert au
 * rapprochement avec le plan, où « t7 » et « T7 » désignent la même table. */
export function normTable(v) {
  return String(v == null ? '' : v)
    .replace(/[^\p{L}\p{N} .\-_]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}
/* La clé de rapprochement, jamais ce qu'on affiche. */
export function tableKey(v) {
  return normTable(v).toUpperCase().replace(/\s+/g, '');
}

/* ── Les tables du plan de salle ───────────────────────────────────────────
 * Le slug est imprimé sur chaque tag et chaque QR : n'importe qui peut ouvrir
 * une session pour une table INVENTÉE (« Z0 », « Z1 »…), y poser huit
 * commandes, passer à la suivante, et remplir les soixante places de la file
 * du jour. Les vrais convives recevaient alors « queue-full ». Le plan de salle
 * dit quelles tables existent ; une table qu'il ne connaît pas n'est pas
 * refusée (un tag « 2 » pour une table nommée « Terrasse 2 » doit continuer à
 * marcher), mais toutes ces tables-là partagent un seul petit budget.
 * « T7 », « Table 7 » et « 7 » désignent la même table. Aucun plan (ou un plan
 * sans table) : null, et rien ne change. */
export function planTableKey(v) {
  return tableKey(v).replace(/^TABLE(?=.)/, '').replace(/^T(?=\d+$)/, '');
}
export async function floorPlanTables(env, merchant) {
  try {
    const row = await env.DB.prepare(
      "SELECT data FROM store_docs WHERE merchant = ? AND feature = 'floorplan'"
    ).bind(merchant).first();
    const plan = JSON.parse((row && row.data) || '{}') || {};
    const keys = new Set();
    for (const t of (Array.isArray(plan.tables) ? plan.tables : [])) {
      if (!t) continue;
      for (const v of [t.num, t.id, t.name]) {
        const k = planTableKey(v);
        if (k) keys.add(k);
      }
    }
    return keys.size ? keys : null;
  } catch (_) { return null; }
}

/* Les tables que le comptoir a déjà servies. Un établissement sans plan de
 * salle n'avait aucune défense contre les tables inventées : la seule preuve
 * qu'une table existe, c'est qu'une commande y a été acceptée par l'équipe.
 * Une commande refusée n'apprend rien. 60 jours suffisent à couvrir toute la
 * salle d'un restaurant ouvert ; la lecture suit l'index (merchant, updated_ts). */
export const KNOWN_TABLES_DAYS = 60;
export async function servedTables(env, merchant, now = Date.now()) {
  const keys = new Set();
  try {
    const rows = await env.DB.prepare(
      "SELECT DISTINCT table_no FROM orders WHERE merchant = ? AND updated_ts >= ? AND mode = 'table' " +
      "AND status IN ('accepted','ready','served','archived') LIMIT 500"
    ).bind(merchant, now - KNOWN_TABLES_DAYS * 864e5).all();
    for (const r of ((rows && rows.results) || [])) {
      const k = planTableKey(r.table_no);
      if (k) keys.add(k);
    }
  } catch (_) { /* lecture impossible → aucune table apprise */ }
  return keys;
}

