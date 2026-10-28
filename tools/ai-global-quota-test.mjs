// tools/ai-global-quota-test.mjs
//
// Le quota d'appels AI compte sur le jour commercial de l'établissement
// (coupure 05:00, son fuseau) et un plafond global, tous établissements
// confondus, protège l'allocation gratuite de Workers AI. Schéma réel
// (schema.sql) en SQLite mémoire, vraie fonction quotaOk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { quotaOk, quotaDay, globalDailyCap, merchantDailyShare, GLOBAL_MERCHANT, GLOBAL_KIND, DEFAULT_GLOBAL_DAILY_CALLS } from '../functions/api/ai/_quota.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };

const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
function fresh(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const DB = { prepare(sql) { let a = []; const st = {
    bind(...v) { a = v; return st; },
    async first() { return db.prepare(sql).get(...a) || null; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...a).changes || 0) } }; },
  }; return st; } };
  return { db, env: { DB, ...extra } };
}
const used = (db, merchant, kind) => db.prepare('SELECT calls FROM ai_usage_kind WHERE merchant = ? AND kind = ?').get(merchant, kind)?.calls ?? 0;

/* 1. Le jour du quota est le jour commercial de l'établissement, pas le jour UTC. */
{
  const { db, env } = fresh();
  db.prepare('INSERT INTO merchant_config (merchant, name, type, plan, status, till_epoch, features, updated_ts, timezone, business_cutoff) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('paris-cafe', 'Paris', 'restaurant', 'basic', 'active', 0, '{}', 1, 'Europe/Paris', 5);
  // 2026-06-10 03:30 UTC = 05:30 à Paris (été) : le jour commercial est le 10.
  ok(await quotaDay(env.DB, 'paris-cafe', Date.parse('2026-06-10T03:30:00Z')) === '2026-06-10', 'Paris 05:30 : jour commercial du 10');
  // 2026-06-10 01:30 UTC = 03:30 à Paris : encore le 9 (avant la coupure de 05:00).
  ok(await quotaDay(env.DB, 'paris-cafe', Date.parse('2026-06-10T01:30:00Z')) === '2026-06-09', 'Paris 03:30 : le quota compte encore le 9');
  // Établissement inconnu : Maroc 05:00. À 02:00 UTC (hiver, UTC+0) il est 02:00, jour d'avant.
  ok(await quotaDay(env.DB, 'inconnu', Date.parse('2026-12-10T02:00:00Z')) === '2026-12-09', 'sans fuseau connu : Maroc, coupure 05:00');
  // Une base sans les colonnes retombe sur le défaut sans lever.
  const broken = { prepare() { throw new Error('no such column'); } };
  ok(await quotaDay(broken, 'x', Date.parse('2026-12-10T12:00:00Z')) === '2026-12-10', 'lecture impossible : jour par défaut');
}

/* 2. Plafond global : une ligne de la table existante, jour UTC, tous établissements. */
{
  const { db, env } = fresh({ AI_GLOBAL_DAILY_CALLS: '3' });
  ok(globalDailyCap(env) === 3, 'la variable AI_GLOBAL_DAILY_CALLS règle le plafond');
  ok(globalDailyCap({}) === DEFAULT_GLOBAL_DAILY_CALLS && globalDailyCap({ AI_GLOBAL_DAILY_CALLS: 'abc' }) === DEFAULT_GLOBAL_DAILY_CALLS && globalDailyCap({ AI_GLOBAL_DAILY_CALLS: '0' }) === DEFAULT_GLOBAL_DAILY_CALLS, 'valeur absente ou invalide : plafond par défaut');
  ok(await quotaOk(env, 'a', 'ask', 100), 'appel 1 (a)');
  ok(await quotaOk(env, 'b', 'invoice', 100), 'appel 2 (b)');
  ok(await quotaOk(env, 'c', 'ask', 100), 'appel 3 (c)');
  ok(await quotaOk(env, 'd', 'ask', 100) === false, 'appel 4 : plafond global atteint, refusé malgré un quota établissement libre');
  ok(used(db, GLOBAL_MERCHANT, GLOBAL_KIND) === 3, 'le global ne dépasse pas son plafond');
  ok(used(db, 'd', 'ask') === 0, 'l’appel refusé par le global est rendu à l’établissement');
  ok(await quotaOk(env, 'a', 'ask', 100) === false, 'tous les établissements sont refusés');
}

/* 3. Le global ne consomme rien quand c'est le quota de l'établissement qui refuse. */
{
  const { db, env } = fresh({ AI_GLOBAL_DAILY_CALLS: '10' });
  ok(await quotaOk(env, 'a', 'salleimport', 1), 'premier appel');
  ok(await quotaOk(env, 'a', 'salleimport', 1) === false, 'quota établissement atteint');
  ok(used(db, GLOBAL_MERCHANT, GLOBAL_KIND) === 1, 'le refus de l’établissement ne touche pas le global');
}

/* 4. Concurrence : le global tient son plafond exactement. */
{
  const { db, env } = fresh({ AI_GLOBAL_DAILY_CALLS: '5' });
  const r = await Promise.all(Array.from({ length: 20 }, (_, i) => quotaOk(env, 'm' + (i % 4), 'ask', 100)));
  ok(r.filter(Boolean).length === 5, 'exactement 5 appels passent');
  ok(used(db, GLOBAL_MERCHANT, GLOBAL_KIND) === 5, 'le compteur global vaut 5');
  const perMerchant = db.prepare("SELECT SUM(calls) AS s FROM ai_usage_kind WHERE merchant != ? AND kind != ?").get(GLOBAL_MERCHANT, GLOBAL_KIND).s;
  ok(perMerchant === 5, 'les compteurs établissement restent alignés sur le global (refus rendus)');
}

/* 5. Part par établissement : un seul ne peut pas épuiser le budget de tous, et
   changer de fuseau ne lui rend rien (compté sur le jour UTC, tous types confondus). */
{
  const { db, env } = fresh({ AI_GLOBAL_DAILY_CALLS: '8' });
  ok(merchantDailyShare(env) === 2, 'par défaut : un quart du plafond global');
  ok(merchantDailyShare({ AI_GLOBAL_DAILY_CALLS: '8', AI_MERCHANT_DAILY_CALLS: '5' }) === 5, 'réglable par AI_MERCHANT_DAILY_CALLS');
  ok(merchantDailyShare({ AI_GLOBAL_DAILY_CALLS: '8', AI_MERCHANT_DAILY_CALLS: '50' }) === 8, 'jamais au-dessus du global');
  ok(await quotaOk(env, 'greedy', 'ask', 100) && await quotaOk(env, 'greedy', 'invoice', 100), 'deux appels de types différents');
  ok(await quotaOk(env, 'greedy', 'resolve', 100) === false, 'troisième : part de l’établissement atteinte, quel que soit le type');
  ok(used(db, 'greedy', 'resolve') === 0, 'l’appel refusé est rendu au compteur du type');
  ok(used(db, GLOBAL_MERCHANT, GLOBAL_KIND) === 2, 'le global ne compte que les appels passés');
  try { db.prepare("UPDATE merchant_config SET timezone = 'Pacific/Kiritimati' WHERE merchant = 'greedy'").run(); } catch (_) {}
  ok(await quotaOk(env, 'greedy', 'ask', 100) === false, 'changer de fuseau ne rend aucun appel');
  ok(await quotaOk(env, 'other', 'ask', 100), 'les autres établissements passent toujours');
}

console.log(`ok ${n} checks`);
