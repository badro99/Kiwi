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

const cache = new WeakMap();

/* Les colonnes présentes dans `sales` : une base en retard n'a pas toutes les
   colonnes récentes, et une colonne absente doit valoir NULL, pas casser le
   rapport. Lu une fois par base et par isolat. */
export async function salesColumns(env) {
  const db = env && env.DB;
  if (!db) return new Set();
  if (cache.has(db)) return cache.get(db);
  let cols = new Set();
  try {
    const rs = await db.prepare('PRAGMA table_info(sales)').all();
    cols = new Set(((rs && rs.results) || []).map((r) => String(r.name)));
  } catch (_) { cols = new Set(); }
  if (!cols.size) cols = new Set(['id', 'merchant', 'amount', 'amount_cents', 'method', 'ts', 'void_ts', 'label', 'lines', 'channel']);
  cache.set(db, cols);
  return cols;
}

const int = (n) => {
  const v = Math.round(Number(n));
  if (!Number.isSafeInteger(v)) throw new Error('bound');
  return String(v);
};
const ARR = (x) => `CASE WHEN json_valid(${x}) AND json_type(${x}) = 'array' THEN ${x} ELSE '[]' END`;

/* scope.sites : [{ buckets: [slug, legacy?], cur: {from,to}, prev: {from,to}, atSale }] */
export function baseCte(scope, cols) {
  const has = (c) => cols.has(c);
  const col = (c, alias) => (has(c) ? c : 'NULL') + ' AS ' + (alias || c);
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
  const base = has('amount_cents') ? 'COALESCE(amount_cents, CAST(ROUND(amount * 100) AS INTEGER))' : 'CAST(ROUND(amount * 100) AS INTEGER)';
  const atSale = scope.sites.map((s, i) => (s.atSale ? i : -1)).filter((i) => i >= 0);
  const parts = has('payment_parts')
    ? `(SELECT COALESCE(SUM(CAST(json_extract(p.value, '$.amountCents') AS INTEGER)), 0) FROM json_each(${ARR('payment_parts')}) p)`
    : '0';
  const cents = atSale.length
    ? `CASE WHEN site IN (${atSale.join(',')}) AND b >= 0 THEN MAX(b, ${parts}) ELSE b END`
    : 'b';
  const acompte = atSale.length && has('label')
    ? ` AND NOT (site IN (${atSale.join(',')}) AND COALESCE(label, '') LIKE 'Règlement acompte%')` : '';
  const pd = scope.sites.map((s, i) => `WHEN site = ${i} AND ts >= ${int(s.cur.from)} AND ts < ${int(s.cur.to)} THEN 'c' `
    + `WHEN site = ${i} AND ts >= ${int(s.prev.from)} AND ts < ${int(s.prev.to)} THEN 'p'`).join(' ');
  const sql = `WITH r AS (
    SELECT id, merchant, CAST(ts AS INTEGER) AS ts, method, ${col('label')}, ${col('lines')}, ${col('payment_parts')},
      ${col('channel')}, ${col('client_id')}, ${col('seller_id')}, ${col('seller_name')},
      ${has('tip_cents') ? 'COALESCE(tip_cents, 0)' : '0'} AS tip,
      ${has('discount_amount_cents') ? 'COALESCE(discount_amount_cents, 0)' : '0'} AS disc,
      ${base} AS b,
      CASE merchant ${siteCase.join(' ')} END AS site
    FROM sales
    WHERE merchant IN (${all.map(() => '?').join(', ')}) AND ts >= ${int(min)} AND ts < ${int(max)}${has('void_ts') ? ' AND void_ts IS NULL' : ''}
  ), s AS (
    SELECT * FROM (SELECT r.*, ${cents} AS c, CASE ${pd} END AS pd FROM r) WHERE pd IS NOT NULL${acompte}
  )`;
  return { sql, args };
}

/* Les lignes d'article des ventes positives, avec leur part du ticket : la
   remise du ticket est répartie au prorata des lignes (`net`), et le coût
   connu (`k`, coût unitaire figé par la caisse) donne `cost`. */
export const LINES_CTE = `, l AS (
    SELECT s.pd, s.site, s.id, s.c, s.ts,
      COALESCE(NULLIF(json_extract(j.value, '$.bn'), ''), NULLIF(json_extract(j.value, '$.n'), ''), 'Article') AS name,
      COALESCE(json_extract(j.value, '$.c'), '') AS cat,
      CAST(COALESCE(json_extract(j.value, '$.q'), 0) AS REAL) AS q,
      CAST(ROUND(COALESCE(json_extract(j.value, '$.t'), 0) * 100) AS INTEGER) AS t,
      json_extract(j.value, '$.k') AS uc
    FROM s, json_each(${ARR('s.lines')}) j
    WHERE s.c >= 0
  ), w AS (SELECT l.*, SUM(t) OVER (PARTITION BY id) AS tot FROM l),
  v AS (SELECT w.*, CASE WHEN tot > 0 THEN t * 1.0 * c / tot ELSE 0 END AS net,
    CASE WHEN uc IS NOT NULL THEN uc * q * 100 END AS cost FROM w)`;

const C = (expr, alias) => `SUM(CASE WHEN pd = 'c' THEN ${expr} ELSE 0 END) AS ${alias}`;
const P = (expr, alias) => `SUM(CASE WHEN pd = 'p' THEN ${expr} ELSE 0 END) AS ${alias}`;

/* Chaque requête : { sql, args } à partir de la base. `page` = { limit, offset }. */
export const Q = {
  /* Par boutique, période et heure UTC : de quoi refaire le résumé, la série
     par journée, la carte jour × heure et la vue multi-site. */
  hours: () => `SELECT pd, site, CAST(ts / 3600000 AS INTEGER) AS h,
      SUM(CASE WHEN c >= 0 THEN 1 ELSE 0 END) AS n,
      SUM(CASE WHEN c >= 0 THEN c ELSE 0 END) AS pos,
      SUM(CASE WHEN c < 0 THEN 1 ELSE 0 END) AS nref,
      SUM(CASE WHEN c < 0 THEN -c ELSE 0 END) AS neg,
      SUM(CASE WHEN c >= 0 THEN disc ELSE 0 END) AS disc,
      SUM(CASE WHEN c >= 0 AND tip > 0 THEN tip ELSE 0 END) AS tips,
      SUM(CASE WHEN c >= 0 AND client_id IS NOT NULL AND client_id <> '' THEN 1 ELSE 0 END) AS known,
      SUM(CASE WHEN c >= 0 AND client_id IS NOT NULL AND client_id <> '' THEN c ELSE 0 END) AS kc,
      SUM(CASE WHEN c >= 0 AND json_array_length(${ARR('lines')}) > 0 THEN 1 ELSE 0 END) AS detailed
    FROM s GROUP BY pd, site, h`,
  /* Articles, ventes nettes réparties et coût, par boutique et période. */
  lineTotals: () => `${LINES_CTE}
    SELECT pd, site, SUM(q) AS items, SUM(t) AS gross, SUM(net) AS net, SUM(cost) AS cost,
      SUM(CASE WHEN uc IS NOT NULL THEN net ELSE 0 END) AS costedNet
    FROM v GROUP BY pd, site`,
  /* Un classement (produit ou rayon) : la période et sa comparaison sur la
     même ligne, paginé dans D1. */
  ranking: (key, page) => `${LINES_CTE}
    SELECT ${key} AS k, MAX(cat) AS cat,
      ${C('q', 'q')}, ${P('q', 'pq')}, ${C('net', 'net')}, ${P('net', 'pnet')}, ${C('t', 'gross')},
      SUM(CASE WHEN pd = 'c' THEN cost END) AS cost,
      ${C('CASE WHEN uc IS NOT NULL THEN net ELSE 0 END', 'costedNet')},
      COUNT(DISTINCT CASE WHEN pd = 'c' THEN id END) AS tickets,
      COUNT(*) OVER () AS total
    FROM v GROUP BY ${key}
    ORDER BY net DESC, pnet DESC, k LIMIT ${int(page.limit)} OFFSET ${int(page.offset)}`,
  /* Ce qui a le plus bougé entre les deux périodes : la phrase du résumé. */
  drivers: (key) => `${LINES_CTE}
    SELECT ${key} AS k, SUM(CASE WHEN pd = 'c' THEN net ELSE -net END) AS delta, ${C('net', 'net')}
    FROM v GROUP BY ${key} ORDER BY ABS(SUM(CASE WHEN pd = 'c' THEN net ELSE -net END)) DESC LIMIT 6`,
  staff: () => `SELECT COALESCE(seller_id, '') AS k, MAX(seller_name) AS nm, MIN(site) AS site,
      ${C('CASE WHEN c >= 0 THEN 1 ELSE 0 END', 'n')}, ${C('CASE WHEN c >= 0 THEN c ELSE 0 END', 'pos')},
      ${C('CASE WHEN c >= 0 THEN disc ELSE 0 END', 'disc')}, ${C('CASE WHEN c >= 0 AND tip > 0 THEN tip ELSE 0 END', 'tips')},
      ${P('CASE WHEN c >= 0 THEN c ELSE 0 END', 'ppos')}, ${P('CASE WHEN c >= 0 THEN 1 ELSE 0 END', 'pn')}
    FROM s WHERE c >= 0 GROUP BY k`,
  /* Un remboursement revient au vendeur de la vente d'origine (sale_audit,
     note = id du remboursement). Sans trace, il reste « non attribué ». */
  staffRefunds: () => `SELECT COALESCE(o.seller_id, '') AS k,
      ${C('-r.c', 'neg')}, ${C('1', 'nref')}
    FROM s r
    LEFT JOIN sale_audit a ON a.merchant = r.merchant AND a.action = 'refund' AND a.note = r.id
    LEFT JOIN sales o ON o.merchant = a.merchant AND o.id = a.sale_id
    WHERE r.c < 0 GROUP BY k`,
  /* Les encaissements : une vente payée en plusieurs fois compte chaque part
     sur son moyen. */
  payments: () => `SELECT m, ${C('a', 'cents')}, ${C('n', 'n')}, ${P('a', 'pcents')} FROM (
      SELECT pd, COALESCE(method, '') AS m, c AS a, 1 AS n FROM s
        WHERE c >= 0 AND json_array_length(${ARR('payment_parts')}) = 0
      UNION ALL
      SELECT s.pd, COALESCE(json_extract(p.value, '$.method'), '') AS m,
        CAST(COALESCE(json_extract(p.value, '$.amountCents'), 0) AS INTEGER) AS a, 1 AS n
        FROM s, json_each(${ARR('s.payment_parts')}) p WHERE s.c >= 0
    ) GROUP BY m ORDER BY cents DESC`,
  refundMethods: () => `SELECT COALESCE(method, '') AS m, ${C('-c', 'cents')}, ${P('-c', 'pcents')}
    FROM s WHERE c < 0 GROUP BY m`,
  channels: () => `SELECT COALESCE(channel, '') AS k, ${C('c', 'cents')}, ${C('1', 'n')}, ${P('c', 'pcents')}, ${P('1', 'pn')}
    FROM s WHERE c >= 0 GROUP BY k ORDER BY cents DESC`,
  /* TVA : la part nette de chaque rayon par jour (les taux sont datés), les
     ventes sans détail et les remboursements à part. */
  vatLines: () => `${LINES_CTE}
    SELECT pd, site, cat, CAST(ts / 86400000 AS INTEGER) AS d, SUM(net) AS net FROM v GROUP BY pd, site, cat, d`,
  vatRest: () => `SELECT pd, site, CAST(ts / 86400000 AS INTEGER) AS d,
      SUM(CASE WHEN c >= 0 AND json_array_length(${ARR('lines')}) = 0 THEN c ELSE 0 END) AS bare,
      SUM(CASE WHEN c < 0 THEN c ELSE 0 END) AS neg
    FROM s GROUP BY pd, site, d`,
  /* Attention : `clients` a ses propres colonnes (spend, name…) ; les alias
     d'ici ne les reprennent pas, sinon HAVING lirait la colonne de la fiche. */
  customers: (page) => `SELECT s.client_id AS k, MAX(cl.name) AS nm, MIN(s.site) AS site,
      ${C('s.c', 'spent')}, ${C('1', 'n')}, MAX(CASE WHEN pd = 'c' THEN s.ts END) AS last,
      ${P('s.c', 'pspent')}, ${P('1', 'pn')}, COUNT(*) OVER () AS total
    FROM s LEFT JOIN clients cl ON cl.merchant = s.merchant AND cl.id = s.client_id
    WHERE s.c >= 0 AND s.client_id IS NOT NULL AND s.client_id <> ''
    GROUP BY s.client_id HAVING SUM(CASE WHEN pd = 'c' THEN s.c ELSE 0 END) > 0
    ORDER BY spent DESC, k LIMIT ${int(page.limit)} OFFSET ${int(page.offset)}`,
  /* Ce que pèsent les dix meilleurs clients de la période. */
  topTen: () => `SELECT COALESCE(SUM(c), 0) AS cents FROM (
      SELECT SUM(c) AS c FROM s WHERE pd = 'c' AND c >= 0 AND client_id IS NOT NULL AND client_id <> ''
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
