#!/usr/bin/env node
/* Les horaires publiés valent aussi pour l'API de commande.
 *
 * kiwi-order.html refuse d'envoyer une commande quand le commerce est fermé
 * d'après les horaires publiés avec sa carte (shopClosed). POST /api/order ne
 * regardait que la présence du comptoir : une caisse restée allumée après la
 * fermeture laissait passer une requête faite à la main, un onglet resté ouvert,
 * ou Order Pro, qui ne lit pas les horaires. Ce banc tient la règle côté
 * serveur : même document (menus.data.hours), même horloge (le fuseau du
 * magasin), et rien de bloqué tant qu'aucun horaire n'est publié.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { hoursOpenAt, hoursClosed } = await import(pathToFileURL(path.join(ROOT, 'functions/api/order/_lib.js')).href);
const { readFileSync } = await import('node:fs');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const day = (open, periods) => ({ open, periods });
const WEEK = {
  mon: day(true, [{ from: '12:00', to: '15:00' }, { from: '19:00', to: '02:00' }]),
  tue: day(true, [{ from: '12:00', to: '15:00' }, { from: '19:00', to: '02:00' }]),
  wed: day(true, [{ from: '12:00', to: '15:00' }]),
  thu: day(true, [{ from: '12:00', to: '24:00' }]),
  fri: day(false, []), sat: day(false, []), sun: day(false, []),
};
const HOURS = { v: 1, week: WEEK, exceptions: [{ from: '2026-10-20', to: '2026-10-20', kind: 'closed', label: 'Inventaire', periods: [] }] };
/* Casablanca est à UTC+1 toute l'année hors ramadan ; Paris à UTC+2 en octobre. */
const casa = (iso) => Date.parse(iso + '+01:00');

console.log('\nHoraires publiés · règle de la page, côté serveur');
ok('lundi 13:00 à Casablanca : ouvert', hoursOpenAt(HOURS, casa('2026-10-12T13:00:00'), 'Africa/Casablanca') === true);
ok('lundi 16:00, entre deux services : fermé', hoursOpenAt(HOURS, casa('2026-10-12T16:00:00'), 'Africa/Casablanca') === false);
ok('mardi 01:30, le service du lundi soir passe minuit : ouvert', hoursOpenAt(HOURS, casa('2026-10-13T01:30:00'), 'Africa/Casablanca') === true);
ok('mardi 02:00 pile : fermé', hoursOpenAt(HOURS, casa('2026-10-13T02:00:00'), 'Africa/Casablanca') === false);
ok('jeudi 23:59, « 24:00 » ferme à minuit : ouvert', hoursOpenAt(HOURS, casa('2026-10-15T23:59:00'), 'Africa/Casablanca') === true);
ok('vendredi, jour fermé : fermé', hoursOpenAt(HOURS, casa('2026-10-16T13:00:00'), 'Africa/Casablanca') === false);
ok('mardi 20 octobre, fermeture exceptionnelle : fermé', hoursOpenAt(HOURS, casa('2026-10-20T13:00:00'), 'Africa/Casablanca') === false);
ok('l\'horloge est celle du magasin : 13:00 à Paris, c\'est midi à Casablanca, ouvert à Paris seulement',
  hoursOpenAt(HOURS, Date.parse('2026-10-12T12:30:00+02:00'), 'Europe/Paris') === true
  && hoursOpenAt(HOURS, Date.parse('2026-10-12T12:30:00+02:00'), 'Africa/Casablanca') === false);
ok('aucun horaire publié, ou une semaine vide : rien n\'est décidé (null)',
  hoursOpenAt(null, Date.now()) === null && hoursOpenAt({ week: { mon: day(false, []) } }, Date.now()) === null);

/* hoursClosed lit la carte publiée et le fuseau déclaré par la caisse. */
function envWith(menuData, timezone) {
  return { DB: { prepare(q) { return { bind() { return { async first() {
    if (/FROM menus/.test(q)) return menuData == null ? null : { data: JSON.stringify(menuData) };
    if (/FROM merchant_config/.test(q)) return { timezone };
    return null;
  } }; } }; } } };
}
ok('carte publiée avec horaires, vendredi : la commande est refusée',
  await hoursClosed(envWith({ items: [], hours: HOURS }, 'Africa/Casablanca'), 'test-shop', casa('2026-10-16T13:00:00')) === true);
ok('…lundi 13:00 : elle passe',
  await hoursClosed(envWith({ items: [], hours: HOURS }, 'Africa/Casablanca'), 'test-shop', casa('2026-10-12T13:00:00')) === false);
ok('carte sans horaires : rien n\'est bloqué, comme sur la page',
  await hoursClosed(envWith({ items: [] }, 'Africa/Casablanca'), 'test-shop', casa('2026-10-16T13:00:00')) === false);
ok('aucune carte, ou une panne de lecture : on ne bloque pas sur une donnée absente',
  await hoursClosed(envWith(null), 'test-shop') === false
  && await hoursClosed({ DB: { prepare() { throw new Error('down'); } } }, 'test-shop') === false);

const IDX = readFileSync(path.join(ROOT, 'functions/api/order/index.js'), 'utf8');
ok('POST /api/order applique la règle après la présence du comptoir, avec la même erreur que la page sait lire',
  /if \(!\(await deskOpen\(env, merchant\)\)\) return json\(\{ error: 'service-closed' \}, 409\);\s*\/\*[\s\S]*?\*\/\s*if \(await hoursClosed\(env, merchant\)\) return json\(\{ error: 'service-closed', reason: 'hours' \}, 409\);/.test(IDX));

console.log(`\n${failed ? '✗' : '✓'} order-hours-server: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
