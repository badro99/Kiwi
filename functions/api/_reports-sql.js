// Les requêtes des rapports (functions/api/reports.js). Tout s'additionne DANS
// D1 : le Worker ne reçoit que des lignes déjà regroupées (par heure, par
// produit, par vendeur…), jamais les ventes une à une. C'est la règle de
// docs/ops/CPU.md : un rapport d'un an sur une boutique chargée ne doit pas
// coûter au Worker plus qu'un rapport d'une journée.
//
// Une seule base pour toutes les requêtes, la CTE `s` :
//   · les ventes non annulées des boutiques de la portée (une boutique, ou
//     toutes celles du compte), avec leur ancien seau de ventes quand il existe
//     (_sales-scope.js) ;
//   · `c`, le montant en centimes (amount_cents, sinon amount × 100) ; une
//     boutique en « chiffre d'affaires à la vente » (features.revenueAtSale)
//     compte son ticket entier et laisse de côté les « Règlement acompte »,
//     exactement comme /api/sales-summary ;
//   · `site`, l'index de la boutique, et `pd` : 'c' pour la période, 'p' pour
//     la période de comparaison, NULL sinon (la ligne est écartée).
//
// Les bornes sont des entiers calculés ici (journées commerciales, voir
// _reports-period.js) : elles sont écrites dans le SQL après vérification. Seuls
// les slugs sont liés, deux par seau au plus : douze boutiques restent loin des
// 100 paramètres que D1 accepte (tools/d1-variable-limit-test.mjs).

const int = (n) => {
  const v = Math.round(Number(n));
  if (!Number.isSafeInteger(v)) throw new Error('bound');
  return String(v);
};
const ARR = (x) => `CASE WHEN json_valid(${x}) AND json_type(${x}) = 'array' THEN ${x} ELSE '[]' END`;

/* scope.sites : [{ buckets: [slug, legacy?], cur: {from,to}, prev: {from,to}, atSale }]
   Les colonnes sont celles de schema.sql (migrations 0001 à 0027, le minimum
   de production) : aucune n'est sondée, aucune n'a de repli.

   Un remboursement (`rf` = 1) est une ligne négative, ou une ligne du canal
   'refund' : un remboursement entièrement rendu en avoir s'écrit à 0 centime
   (sale/refund.js ne met dans la ligne que l'argent sorti du tiroir). Sa
   valeur vient de sale_audit (note = id du remboursement), qui garde le
   montant rendu, avoir compris, et la vente d'origine (`orig`). `c` est alors
   négatif : moins ce qui a été rendu. Un tel ticket n'est jamais compté comme
   une vente.

   Les lignes du portefeuille de chèques (« Chèque impayé » chqbounce-, et son
   retour chqback-, functions/api/_cheque-debt.js) ne sont ni une vente ni un
   remboursement : elles restent hors des rapports de vente. */
export function baseCte(scope) {
  const args = [];
  const siteCase = [];
  const all = [];
  let min = Infinity, max = -Infinity;
  scope.sites.forEach((site, i) => {
    for (const b of site.buckets) { siteCase.push('WHEN ? THEN ' + i); args.push(b); all.push(b); }
    min = Math.min(min, site.cur.from, site.prev.from);
    max = Math.max(max, site.cur.to, site.prev.to);
  });
  args.push(...all);
  const atSale = scope.sites.map((s, i) => (s.atSale ? i : -1)).filter((i) => i >= 0);
  const parts = `(SELECT COALESCE(SUM(CAST(json_extract(p.value, '$.amountCents') AS INTEGER)), 0) FROM json_each(${ARR('payment_parts')}) p)`;
  const audit = (col) => `(SELECT MAX(${col}) FROM sale_audit a WHERE a.merchant = x.merchant AND a.note = x.id AND a.action = 'refund')`;
  const cents = `CASE WHEN rf = 1 THEN -MAX(-b, COALESCE(${audit('COALESCE(a.amount_cents, a.amount * 100)')}, 0))`
    + (atSale.length ? ` WHEN site IN (${atSale.join(',')}) THEN MAX(b, ${parts})` : '') + ' ELSE b END';
  const acompte = atSale.length
    ? ` AND NOT (site IN (${atSale.join(',')}) AND COALESCE(label, '') LIKE 'Règlement acompte%')` : '';
  const pd = scope.sites.map((s, i) => `WHEN site = ${i} AND ts >= ${int(s.cur.from)} AND ts < ${int(s.cur.to)} THEN 'c' `
    + `WHEN site = ${i} AND ts >= ${int(s.prev.from)} AND ts < ${int(s.prev.to)} THEN 'p'`).join(' ');
  const sql = `WITH r AS (
    SELECT id, merchant, CAST(ts AS INTEGER) AS ts, method, label, lines, payment_parts, channel, client_id, seller_id, seller_name,
      COALESCE(tip_cents, 0) AS tip, COALESCE(discount_amount_cents, 0) AS disc,
      COALESCE(amount_cents, CAST(ROUND(amount * 100) AS INTEGER)) AS b,
      CASE merchant ${siteCase.join(' ')} END AS site
    FROM sales
    WHERE merchant IN (${all.map(() => '?').join(', ')}) AND ts >= ${int(min)} AND ts < ${int(max)} AND void_ts IS NULL
      AND id NOT LIKE 'chqbounce-%' AND id NOT LIKE 'chqback-%'
  ), x AS (
    SELECT r.*, CASE WHEN b < 0 OR COALESCE(channel, '') = 'refund' THEN 1 ELSE 0 END AS rf, CASE ${pd} END AS pd FROM r
  ), s AS (
    SELECT x.*, ${cents} AS c, CASE WHEN rf = 1 THEN ${audit('a.sale_id')} END AS orig
    FROM x WHERE pd IS NOT NULL${acompte}
  )`;
  return { sql, args };
}

/* Les lignes d'article, avec leur part du ticket : la remise du ticket est
   répartie au prorata des lignes (`net`), et le coût connu (`uc`, coût
   unitaire figé par la caisse) donne `cost`. Un remboursement rattaché à sa
   vente reprend les lignes de la vente d'origine, en négatif et au prorata de
   ce qui a été rendu (`qq`, `net`, `cost`) : le classement des produits est
   net des retours, comme le résumé. */
const LINE = (j) => `COALESCE(NULLIF(json_extract(${j}.value, '$.bn'), ''), NULLIF(json_extract(${j}.value, '$.n'), ''), 'Article') AS name,
      COALESCE(json_extract(${j}.value, '$.c'), '') AS cat,
      CAST(COALESCE(json_extract(${j}.value, '$.q'), 0) AS REAL) AS q,
      CAST(ROUND(COALESCE(json_extract(${j}.value, '$.t'), 0) * 100) AS INTEGER) AS t,
      json_extract(${j}.value, '$.k') AS uc`;
export const LINES_CTE = `, l AS (
    SELECT s.pd, s.site, s.id, s.c, s.ts, 0 AS rf, s.c AS oa, ${LINE('j')}
    FROM s, json_each(${ARR('s.lines')}) j
    WHERE s.rf = 0
    UNION ALL
    SELECT s.pd, s.site, s.id, s.c, s.ts, 1 AS rf, COALESCE(o.amount_cents, CAST(ROUND(o.amount * 100) AS INTEGER)) AS oa, ${LINE('j')}
    FROM s JOIN sales o ON o.merchant = s.merchant AND o.id = s.orig, json_each(${ARR('o.lines')}) j
    WHERE s.rf = 1
  ), w AS (SELECT l.*, SUM(t) OVER (PARTITION BY id) AS tot FROM l),
  u AS (SELECT w.*, CASE WHEN tot > 0 THEN t * 1.0 * c / tot ELSE 0 END AS net,
    CASE WHEN rf = 0 THEN q WHEN oa > 0 THEN q * 1.0 * c / oa ELSE 0 END AS qq FROM w),
  v AS (SELECT u.*, CASE WHEN uc IS NOT NULL THEN uc * qq * 100 END AS cost FROM u)`;

const C = (expr, alias) => `SUM(CASE WHEN pd = 'c' THEN ${expr} ELSE 0 END) AS ${alias}`;
const P = (expr, alias) => `SUM(CASE WHEN pd = 'p' THEN ${expr} ELSE 0 END) AS ${alias}`;

/* La TVA dépend de la journée commerciale (un taux daté s'applique à partir
   d'une journée, coupure comprise). `segs[i]` liste, pour la boutique i, les
   débuts (ms) des journées où un taux change : la ligne prend le numéro du
   dernier début franchi, 0 avant le premier. */
export function segExpr(segs) {
  const cases = (segs || []).map((list, i) => {
    if (!list || !list.length) return '';
    const steps = list.map((ms, k) => ({ ms, k: k + 1 })).reverse()
      .map((x) => `WHEN ts >= ${int(x.ms)} THEN ${x.k}`).join(' ');
    return `WHEN ${i} THEN (CASE ${steps} ELSE 0 END)`;
  }).filter(Boolean);
  return cases.length ? `(CASE site ${cases.join(' ')} ELSE 0 END)` : '0';
}

/* Chaque requête : { sql, args } à partir de la base. `page` = { limit, offset }. */
export const Q = {
  /* Par boutique, période et heure UTC : de quoi refaire le résumé, la série
     par journée ou par heure, la carte jour × heure et la vue multi-site. */
  hours: () => `SELECT pd, site, CAST(ts / 3600000 AS INTEGER) AS h,
      SUM(CASE WHEN rf = 0 THEN 1 ELSE 0 END) AS n,
      SUM(CASE WHEN rf = 0 THEN c ELSE 0 END) AS pos,
      SUM(rf) AS nref,
      SUM(CASE WHEN rf = 1 THEN -c ELSE 0 END) AS neg,
      SUM(CASE WHEN rf = 1 THEN b - c ELSE 0 END) AS credit,
      SUM(CASE WHEN rf = 1 AND b >= 0 THEN 1 ELSE 0 END) AS zt,
      SUM(CASE WHEN rf = 0 THEN disc ELSE 0 END) AS disc,
      SUM(CASE WHEN rf = 0 AND tip > 0 THEN tip ELSE 0 END) AS tips,
      SUM(CASE WHEN rf = 0 AND client_id IS NOT NULL AND client_id <> '' THEN 1 ELSE 0 END) AS known,
      SUM(CASE WHEN rf = 0 AND client_id IS NOT NULL AND client_id <> '' THEN c ELSE 0 END) AS kc,
      SUM(CASE WHEN rf = 0 AND json_array_length(${ARR('lines')}) > 0 THEN 1 ELSE 0 END) AS detailed
    FROM s GROUP BY pd, site, h`,
  /* Articles vendus, ventes nettes réparties (retours déduits) et coût, par
     boutique et période. */
  lineTotals: () => `${LINES_CTE}
    SELECT pd, site, SUM(CASE WHEN rf = 0 THEN q ELSE 0 END) AS items, SUM(CASE WHEN rf = 0 THEN t ELSE 0 END) AS gross,
      SUM(net) AS net, SUM(CASE WHEN rf = 1 THEN -net ELSE 0 END) AS refunded, SUM(cost) AS cost,
      SUM(CASE WHEN uc IS NOT NULL THEN net ELSE 0 END) AS costedNet
    FROM v GROUP BY pd, site`,
  /* Un classement (produit ou rayon) : la période et sa comparaison sur la
     même ligne, paginé dans D1. `sold` est vendu avant retours, `refunded`
     ce qui est revenu, `net` la différence. */
  ranking: (key, page) => `${LINES_CTE}
    SELECT ${key} AS k, MAX(cat) AS cat,
      ${C('qq', 'q')}, ${P('qq', 'pq')}, ${C('net', 'net')}, ${P('net', 'pnet')}, ${C('CASE WHEN rf = 0 THEN t ELSE 0 END', 'gross')},
      ${C('CASE WHEN rf = 0 THEN net ELSE 0 END', 'sold')}, ${C('CASE WHEN rf = 1 THEN -net ELSE 0 END', 'refunded')},
      ${C('CASE WHEN rf = 1 THEN -qq ELSE 0 END', 'rq')},
      SUM(CASE WHEN pd = 'c' THEN cost END) AS cost,
      ${C('CASE WHEN uc IS NOT NULL THEN net ELSE 0 END', 'costedNet')},
      COUNT(DISTINCT CASE WHEN pd = 'c' AND rf = 0 THEN id END) AS tickets,
      COUNT(*) OVER () AS total
    FROM v GROUP BY ${key}
    ORDER BY net DESC, pnet DESC, k LIMIT ${int(page.limit)} OFFSET ${int(page.offset)}`,
  /* Ce qui a le plus bougé entre les deux périodes : la phrase du résumé. */
  drivers: (key) => `${LINES_CTE}
    SELECT ${key} AS k, SUM(CASE WHEN pd = 'c' THEN net ELSE -net END) AS delta, ${C('net', 'net')}
    FROM v GROUP BY ${key} ORDER BY ABS(SUM(CASE WHEN pd = 'c' THEN net ELSE -net END)) DESC LIMIT 6`,
  staff: () => `SELECT COALESCE(seller_id, '') AS k, MAX(seller_name) AS nm, MIN(site) AS site,
      ${C('1', 'n')}, ${C('c', 'pos')}, ${C('disc', 'disc')}, ${C('CASE WHEN tip > 0 THEN tip ELSE 0 END', 'tips')},
      ${P('c', 'ppos')}, ${P('1', 'pn')}
    FROM s WHERE rf = 0 GROUP BY k`,
  /* Un remboursement revient au vendeur de la vente d'origine (`orig`, lu
     dans sale_audit). Sans trace, il reste « non attribué ». */
  staffRefunds: () => `SELECT COALESCE(o.seller_id, '') AS k,
      ${C('-r.c', 'neg')}, ${C('1', 'nref')}
    FROM s r
    LEFT JOIN sales o ON o.merchant = r.merchant AND o.id = r.orig
    WHERE r.rf = 1 GROUP BY k`,
  /* Les encaissements : une vente payée en plusieurs fois compte chaque part
     sur son moyen. */
  payments: () => `SELECT m, ${C('a', 'cents')}, ${C('n', 'n')}, ${P('a', 'pcents')} FROM (
      SELECT pd, COALESCE(method, '') AS m, c AS a, 1 AS n FROM s
        WHERE rf = 0 AND json_array_length(${ARR('payment_parts')}) = 0
      UNION ALL
      SELECT s.pd, COALESCE(json_extract(p.value, '$.method'), '') AS m,
        CAST(COALESCE(json_extract(p.value, '$.amountCents'), 0) AS INTEGER) AS a, 1 AS n
        FROM s, json_each(${ARR('s.payment_parts')}) p WHERE s.rf = 0
    ) GROUP BY m ORDER BY cents DESC`,
  /* Ce qui est sorti par moyen : l'argent rendu sur le moyen du
     remboursement, la part rendue en avoir sur « credit ». */
  refundMethods: () => `SELECT m, ${C('a', 'cents')}, ${P('a', 'pcents')} FROM (
      SELECT pd, COALESCE(method, '') AS m, -b AS a FROM s WHERE rf = 1 AND b < 0
      UNION ALL
      SELECT pd, 'credit' AS m, b - c AS a FROM s WHERE rf = 1 AND b - c > 0
    ) GROUP BY m`,
  channels: () => `SELECT COALESCE(channel, '') AS k, ${C('c', 'cents')}, ${C('1', 'n')}, ${P('c', 'pcents')}, ${P('1', 'pn')}
    FROM s WHERE rf = 0 GROUP BY k ORDER BY cents DESC`,
  /* TVA : la part nette de chaque rayon (retours rattachés compris) par
     segment de taux ; les ventes sans détail et les remboursements sans
     lignes d'origine à part. */
  vatLines: (segs) => `${LINES_CTE}
    SELECT pd, site, cat, ${segExpr(segs)} AS seg, SUM(net) AS net FROM v GROUP BY pd, site, cat, seg`,
  vatRest: (segs) => `SELECT pd, site, ${segExpr(segs)} AS seg,
      SUM(CASE WHEN rf = 0 AND json_array_length(${ARR('lines')}) = 0 THEN c ELSE 0 END) AS bare,
      SUM(CASE WHEN rf = 1 AND NOT EXISTS (SELECT 1 FROM sales o WHERE o.merchant = s.merchant AND o.id = s.orig
        AND json_array_length(${ARR('o.lines')}) > 0) THEN c ELSE 0 END) AS neg
    FROM s GROUP BY pd, site, seg`,
  /* Attention : `clients` a ses propres colonnes (spend, name…) ; les alias
     d'ici ne les reprennent pas, sinon HAVING lirait la colonne de la fiche. */
  customers: (page) => `SELECT s.client_id AS k, MAX(cl.name) AS nm, MIN(s.site) AS site,
      ${C('s.c', 'spent')}, ${C('1', 'n')}, MAX(CASE WHEN pd = 'c' THEN s.ts END) AS last,
      ${P('s.c', 'pspent')}, ${P('1', 'pn')}, COUNT(*) OVER () AS total
    FROM s LEFT JOIN clients cl ON cl.merchant = s.merchant AND cl.id = s.client_id
    WHERE s.rf = 0 AND s.client_id IS NOT NULL AND s.client_id <> ''
    GROUP BY s.client_id HAVING SUM(CASE WHEN pd = 'c' THEN s.c ELSE 0 END) > 0
    ORDER BY spent DESC, k LIMIT ${int(page.limit)} OFFSET ${int(page.offset)}`,
  /* Ce que pèsent les dix meilleurs clients de la période. */
  topTen: () => `SELECT COALESCE(SUM(c), 0) AS cents FROM (
      SELECT SUM(c) AS c FROM s WHERE pd = 'c' AND rf = 0 AND client_id IS NOT NULL AND client_id <> ''
      GROUP BY client_id ORDER BY SUM(c) DESC LIMIT 10
    )`,
};

/* Exécute plusieurs requêtes en un aller-retour (D1 batch) ; chaque résultat
   est une liste de lignes. Une requête qui échoue (table absente d'une base en
   retard) rend une liste vide marquée, sans emporter les autres. */
export async function run(env, base, list) {
  const stmts = list.map((sql) => env.DB.prepare(base.sql + '\n' + sql).bind(...base.args));
  if (typeof env.DB.batch === 'function') {
    try {
      const out = await env.DB.batch(stmts);
      return out.map((r) => (r && r.results) || []);
    } catch (_) { /* une requête a échoué : on les rejoue une à une */ }
  }
  const out = [];
  for (const st of stmts) {
    try { const r = await st.all(); out.push((r && r.results) || []); }
    catch (_) { const empty = []; empty.failed = true; out.push(empty); }
  }
  return out;
}
