// functions/api/_catalog-parts.js — un catalogue plus grand qu'une ligne D1.
//
// Le catalogue d'une boutique est UN document JSON, rangé dans `catalogs.data`.
// D1 refuse toute valeur au-delà de 2 000 000 octets. 91 articles pèsent
// ~75 Ko ; une boutique qui arrive d'une autre caisse avec 3 000 références
// (La Maison en Vogue, 2026-11-20 : 3 039 articles) pèse ~2,5 Mo, et son
// enregistrement échouait : le catalogue restait sur un seul navigateur.
//
// La règle :
//   · jusqu'à SPLIT_BYTES, RIEN ne change. Même SQL, mêmes octets : la ligne
//     `catalogs` porte le document entier. C'est le cas de toutes les boutiques
//     d'avant ce fichier, et il ne lit ni n'écrit jamais `catalog_parts`.
//   · au-delà, les trois listes qui grossissent (products, variants, moves)
//     partent dans `catalog_parts`, en parts d'environ PART_BYTES. Chaque part
//     ne contient que des éléments ENTIERS, si bien qu'un `instr(data, id)` sur
//     une part trouve un identifiant comme il le trouvait sur le document. La
//     ligne `catalogs` garde une tête : `{"_parts":n,"_gen":"…","rest":{…}}`,
//     avec la révision, comme avant. `rev` reste LE compare-and-swap.
//
// Atomicité : une écriture = un db.batch() (une transaction D1) :
//   1. les nouvelles parts, sous une génération neuve et aléatoire ;
//   2. l'UPDATE de la tête, conditionné à la révision lue (inchangé) ;
//   3. la suppression de toute part dont la génération n'est pas celle que la
//      tête désigne MAINTENANT.
// Si l'étape 2 perd la course, la tête désigne toujours la génération du
// gagnant et l'étape 3 efface nos propres parts orphelines. Si elle gagne,
// l'étape 3 efface les parts de l'ancienne génération. Un lecteur ne voit
// donc jamais un mélange de deux générations.
//
// Lecture : une tête dont les parts ne sont pas toutes là LÈVE, jamais un
// catalogue tronqué servi comme s'il était complet (le stock manquant aurait
// l'air vendu). Chaque appelant a déjà un try/catch qui traite une erreur de
// base comme « réessayez ».

const enc = new TextEncoder();
const bytes = (s) => enc.encode(s).length;

export const SPLIT_BYTES = 1_500_000;
export const PART_BYTES = 700_000;
export const SPLIT_KEYS = Object.freeze(['products', 'variants', 'moves']);
const HEAD_MARK = '{"_parts":';

export const isSplitHead = (s) => typeof s === 'string' && s.startsWith(HEAD_MARK);

const newGen = () => {
  try { return crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
  catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
};

const partPrefix = (key) => '{"k":"' + key + '","items":';

/* data : l'objet catalogue (ou sa chaîne JSON). Rend { head, parts, gen }.
 * Petit document : head est EXACTEMENT JSON.stringify(data), parts est vide. */
export function packCatalog(data) {
  const full = typeof data === 'string' ? data : JSON.stringify(data);
  if (bytes(full) <= SPLIT_BYTES) return { head: full, parts: [], gen: null };
  const obj = typeof data === 'string' ? JSON.parse(data) : data;
  const gen = newGen();
  const parts = [];
  for (const key of SPLIT_KEYS) {
    const list = Array.isArray(obj[key]) ? obj[key] : [];
    let chunk = [], size = 0;
    for (const item of list) {
      const s = JSON.stringify(item);
      const n = bytes(s) + 1;
      if (chunk.length && size + n > PART_BYTES) {
        parts.push(partPrefix(key) + '[' + chunk.join(',') + ']}');
        chunk = []; size = 0;
      }
      chunk.push(s); size += n;
    }
    if (chunk.length) parts.push(partPrefix(key) + '[' + chunk.join(',') + ']}');
  }
  const rest = {};
  for (const k of Object.keys(obj)) if (!SPLIT_KEYS.includes(k)) rest[k] = obj[k];
  const head = HEAD_MARK + parts.length + ',"_gen":"' + gen + '","rest":' + JSON.stringify(rest) + '}';
  return { head, parts, gen };
}

/* Recompose la chaîne JSON du document à partir de la tête et des parts, sans
 * re-parser les 2 Mo : les éléments sont recollés tels qu'ils ont été écrits. */
export function joinCatalog(headStr, partStrs) {
  const head = JSON.parse(headStr);
  const lists = Object.fromEntries(SPLIT_KEYS.map((k) => [k, []]));
  for (const p of partStrs) {
    const m = /^\{"k":"([a-z]+)","items":\[/.exec(p);
    if (!m || !lists[m[1]] || !p.endsWith(']}')) throw new Error('catalog-part-invalid');
    const inner = p.slice(m[0].length, -2);
    if (inner) lists[m[1]].push(inner);
  }
  const restJson = JSON.stringify(head.rest || {});
  const body = SPLIT_KEYS.map((k) => '"' + k + '":[' + lists[k].join(',') + ']').join(',');
  return '{' + body + (restJson.length > 2 ? ',' + restJson.slice(1, -1) : '') + '}';
}

/* row : le résultat d'un `SELECT data, … FROM catalogs WHERE merchant = ?`.
 * Une ligne ordinaire est rendue telle quelle (aucune requête de plus). Une tête
 * est complétée par ses parts : row.data redevient le document entier, et
 * row.split = true dit à l'écriture suivante qu'il y a des parts à remplacer. */
export async function loadParts(db, merchant, row) {
  if (!row || !isSplitHead(row.data)) return row;
  const head = JSON.parse(row.data);
  const res = await db.prepare('SELECT part, data FROM catalog_parts WHERE merchant = ? AND gen = ? ORDER BY part')
    .bind(merchant, head._gen).all();
  const list = (res && res.results) || [];
  if (list.length !== Number(head._parts) || list.some((r, i) => Number(r.part) !== i)) {
    throw new Error('catalog-parts-incomplete');
  }
  return { ...row, data: joinCatalog(row.data, list.map((r) => r.data)), split: true };
}

/* Les instructions à placer autour de l'UPDATE/INSERT de la tête. Rien du tout
 * pour un petit catalogue qui l'était déjà : pas une requête de plus, pas même
 * une dépendance à la table catalog_parts. */
export function partStatements(db, merchant, packed, prevSplit) {
  const before = [], after = [];
  packed.parts.forEach((p, i) => {
    before.push(db.prepare('INSERT INTO catalog_parts (merchant, gen, part, data) VALUES (?, ?, ?, ?)')
      .bind(merchant, packed.gen, i, p));
  });
  if (packed.parts.length || prevSplit) {
    after.push(db.prepare(
      "DELETE FROM catalog_parts WHERE merchant = ? AND gen IS NOT (SELECT json_extract(data, '$._gen') FROM catalogs WHERE merchant = ?)"
    ).bind(merchant, merchant));
  }
  return { before, after };
}

/* Exécute l'écriture de la tête (`primary`, déjà liée avec packed.head) et ses
 * parts. Rend le résultat de `primary` : l'appelant lit meta.changes comme
 * avant. Sans parts, c'est exactement `primary.run()`. */
export async function runCatalogWrite(db, merchant, packed, primary, prevSplit) {
  const { before, after } = partStatements(db, merchant, packed, prevSplit);
  if (!before.length && !after.length) return primary.run();
  const out = await db.batch([...before, primary, ...after]);
  return out && out[before.length];
}

/* La clause d'une garde SQL « ce texte figure dans le catalogue de ? », qui
 * cherche aussi dans les parts de la génération courante quand il y en a. Rend
 * { sql, args } à concaténer après un AND. */
export function catalogContains(split, merchant, needle) {
  if (!split) return { sql: 'instr((SELECT data FROM catalogs WHERE merchant = ?), ?) > 0', args: [merchant, needle] };
  return {
    sql: "(instr((SELECT data FROM catalogs WHERE merchant = ?), ?) > 0 OR EXISTS (SELECT 1 FROM catalog_parts WHERE merchant = ? AND gen = (SELECT json_extract(data, '$._gen') FROM catalogs WHERE merchant = ?) AND instr(data, ?) > 0))",
    args: [merchant, needle, merchant, merchant, needle],
  };
}
