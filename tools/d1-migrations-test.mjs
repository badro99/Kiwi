#!/usr/bin/env node
/* tools/d1-migrations-test.mjs — migrations/ et schema.sql ne peuvent plus diverger.
 *
 * La production D1 a retardé sur schema.sql pendant des mois, parce que rien ne
 * liait les deux : on ajoutait une colonne au fichier, et la base déployée ne la
 * recevait que si quelqu'un passait le bon ALTER à la main. Ce test ferme la
 * boucle, sans réseau et en mémoire (node:sqlite) :
 *
 *   1. migrations/ ne contient que des NNNN_nom.sql contigus — wrangler applique
 *      TOUT .sql du dossier, un fichier daté posé là partirait en production ;
 *   2. aucune migration n'ouvre de transaction (D1 les refuse) ni n'efface de
 *      données sans le dire ;
 *   3. 0001…N appliquées à une base vide donnent EXACTEMENT schema.sql :
 *      tables, colonnes (type, NOT NULL, défaut, clé), index, clés étrangères ;
 *   4. 0001 est rejouable sur une base déjà à jour — c'est ce qui la rend sans
 *      effet sur la production, qui l'a déjà ;
 *   5. le comparateur voit bien un écart quand il y en a un.
 *
 * `node tools/d1-migrations-test.mjs`
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ROOT, MIGRATIONS_DIR, MIGRATION_NAME,
  listMigrations, freshDb, applyMigrations, applySchema, shapeOf, compareShapes,
} from './d1-migrations.mjs';
import { stripComments } from './d1-schema.mjs';

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const files = listMigrations();
const read = (name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8');

console.log('\n■ Noms : ce que wrangler appliquera');
const misnamed = files.filter((name) => !MIGRATION_NAME.test(name));
check('chaque .sql de migrations/ suit NNNN_nom.sql', !misnamed.length,
  `${misnamed.join(', ')} — un fichier historique va dans migrations/legacy/, wrangler ne lit pas les sous-dossiers`);
const numbers = files.map((name) => Number(name.slice(0, 4)));
check('numérotation contiguë depuis 0001, sans doublon',
  numbers.every((n, i) => n === i + 1),
  `trouvé : ${numbers.map((n) => String(n).padStart(4, '0')).join(', ')}`);
check('au moins la baseline et la migration d\'écart', files.length >= 2, `${files.length} fichier(s)`);

console.log('\n■ Contenu : ce que D1 accepte, ce qui touche aux données');
for (const name of files) {
  const sql = stripComments(read(name));
  check(`${name} n'ouvre pas de transaction`, !/^(?:[ \t]*)(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/im.test(sql),
    'wrangler enveloppe déjà chaque migration ; D1 refuse BEGIN/COMMIT explicites');
  const destructive = /\bDROP\s+(TABLE|COLUMN)\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\s+\w+\s+RENAME\b/i.test(sql);
  const approved = /^--\s*destructive:\s*approved by owner\b/im.test(read(name));
  check(`${name} n'efface rien sans accord écrit`, !destructive || approved,
    'la production porte de vraies écritures financières ; ajoute « -- destructive: approved by owner AAAA-MM-JJ » une fois l\'accord donné');
}
const baseline = files.find((name) => name.startsWith('0001_'));
if (baseline) {
  const creates = stripComments(read(baseline)).match(/^\s*CREATE\s+.*$/gim) || [];
  const bare = creates.filter((line) => !/IF\s+NOT\s+EXISTS/i.test(line));
  check(`${baseline} : chaque CREATE est IF NOT EXISTS (${creates.length})`, !bare.length, bare.slice(0, 3).join(' | '));
}

console.log('\n■ Migrations appliquées = schema.sql');
let migrated = null;
try {
  migrated = applyMigrations(freshDb());
  check(`${files.length} migration(s) s'appliquent sur une base vide`, true);
} catch (error) {
  check('les migrations s\'appliquent sur une base vide', false, error.message);
}
if (migrated) {
  const want = shapeOf(applySchema(freshDb()));
  const gaps = compareShapes(want, shapeOf(migrated));
  check(`même forme que schema.sql (${want.tables.size} tables, ${want.indexes.size} index)`, !gaps.length,
    `${gaps.slice(0, 12).join('\n      ')}${gaps.length > 12 ? `\n      … et ${gaps.length - 12} autre(s)` : ''}`
    + '\n      → node tools/d1-migrations.mjs --draft écrit le brouillon de la migration qui manque');

  try {
    migrated.exec(read(baseline));
    check(`${baseline} rejouée sur une base à jour : sans effet, sans erreur`, true);
  } catch (error) {
    check(`${baseline} rejouée sur une base à jour`, false, error.message);
  }
}

console.log('\n■ Le comparateur voit un écart');
{
  const want = shapeOf(applySchema(freshDb()));
  const drifted = applySchema(freshDb());
  drifted.exec('ALTER TABLE sales ADD COLUMN drift_probe TEXT');
  drifted.exec('DROP INDEX idx_sales_merchant');
  drifted.exec('DROP TRIGGER sales_change_log');
  const gaps = compareShapes(want, shapeOf(drifted));
  check('une colonne en trop est signalée', gaps.some((g) => g.includes('sales.drift_probe')), gaps.join(' | '));
  check('un trigger manquant est signalé', gaps.some(g => g.includes('trigger sales_change_log')), gaps.join(' | '));
  drifted.exec('CREATE TRIGGER sales_change_log AFTER UPDATE ON sales BEGIN SELECT 1; END;');
  check('un trigger modifié est signalé', compareShapes(want, shapeOf(drifted)).some(g => g.includes('trigger sales_change_log') && g.includes('différente')));
  check('un index manquant est signalé', gaps.some((g) => g.includes('idx_sales_merchant')), gaps.join(' | '));
}

console.log('\n■ wrangler sait où appliquer');
{
  const toml = readFileSync(join(ROOT, 'wrangler.d1.toml'), 'utf8');
  check('wrangler.d1.toml vise kiwi-sales', /database_name\s*=\s*"kiwi-sales"/.test(toml));
  check('wrangler.d1.toml lit migrations/', /migrations_dir\s*=\s*"migrations"/.test(toml));
  check('wrangler.d1.toml reste hors du déploiement Pages (pas de pages_build_output_dir)',
    !/pages_build_output_dir/.test(toml));
}

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ migrations/ et schema.sql décrivent la même base\n');
process.exit(failures ? 1 : 0);
