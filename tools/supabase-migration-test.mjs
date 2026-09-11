/* Les transformations de l'import D1 → Supabase, exercées hors réseau.
 *
 * Tout ce qui est vérifié ici est ce qui, silencieusement, change la FORME
 * d'une donnée entre les deux bases : un objet JSON qui arrive en chaîne, une
 * colonne technique qui suit jusqu'au serveur, un texte vide qui devient autre
 * chose que NULL. Aucun de ces écarts ne lève d'erreur au moment de l'import ;
 * tous se découvrent des mois plus tard, dans une requête qui rend NULL. */

import assert from 'node:assert/strict';
import {
  TABLES,
  normalizeRow,
  parseJsonValue,
} from './migrate-d1-to-supabase.mjs';

assert.equal(TABLES.length, 19);
assert.equal(new Set(TABLES.map((item) => item.name)).size, TABLES.length);
assert.ok(TABLES.every((item) => /^[a-z_]+$/.test(item.name)));

assert.deepEqual(parseJsonValue('{"enabled":true}', 'merchant_config', 'features'), {
  enabled: true,
});
assert.equal(parseJsonValue('', 'sale_audit', 'impact'), null);
assert.throws(
  () => parseJsonValue('{broken', 'menus', 'data'),
  /menus\.data contains invalid JSON/,
);

const normalized = normalizeRow(
  { name: 'orders', json: ['lines', 'customer'] },
  { id: 'ord-1', lines: '[{"name":"Tea"}]', customer: '', total: 20 },
);
assert.deepEqual(normalized.lines, [{ name: 'Tea' }]);
assert.equal(normalized.customer, null);
assert.equal(normalized.total, 20);

/* `account_audit.detail` est un objet, pas un texte. Les quatre écrivains de
   cette colonne y posent un JSON.stringify({…}) ; recopié tel quel dans une
   colonne jsonb, il y devient une chaîne, et `detail->>'field'` rend NULL pour
   toujours. Le journal survit, la question « quel champ a bougé » meurt. */
const auditSpec = TABLES.find((item) => item.name === 'account_audit');
assert.deepEqual(auditSpec.json, ['detail']);
assert.deepEqual(
  normalizeRow(auditSpec, { id: 7, detail: '{"field":"login","verification":"immediate"}' }).detail,
  { field: 'login', verification: 'immediate' },
);
/* D1 déclare la colonne NOT NULL DEFAULT '' : les lignes anciennes portent la
   chaîne vide, qui doit devenir NULL et non la chaîne JSON `""`. */
assert.equal(normalizeRow(auditSpec, { id: 8, detail: '' }).detail, null);

/* Le curseur de pagination voyage avec la ligne (`select rowid as _rowid, *`).
   S'il atteint PostgREST, la colonne inconnue fait échouer le lot entier —
   donc la table entière — par un 400 qui ne nomme que le schéma. */
const paged = normalizeRow(
  { name: 'sales', json: ['lines'] },
  { _rowid: 4821, id: 'sale-1', merchant: 'cafe', amount: 120, lines: '[]' },
);
assert.ok(!('_rowid' in paged), '_rowid doit être retiré avant l\'envoi');
assert.equal(paged.id, 'sale-1');
assert.deepEqual(paged.lines, []);

/* Le retrait ne doit pas dépendre d'une liste `json` : une table sans colonne
   JSON passe par le même chemin et doit être nettoyée pareil. */
assert.ok(!('_rowid' in normalizeRow({ name: 'order_desk' }, { _rowid: 1, merchant: 'cafe' })));

/* La table de jointure d'appartenance n'a AUCUNE source dans D1 — elle ne peut
   pas être importée, elle doit être provisionnée
   (tools/supabase-provision-tenancy.mjs). L'inscrire ici par mégarde ferait
   échouer tout import sur une table qui n'existe pas côté SQLite. */
assert.ok(!TABLES.some((item) => item.name === 'account_users'));

console.log('✓ transformations de l\'import Supabase vérifiées (JSON, curseur, appartenance)');
