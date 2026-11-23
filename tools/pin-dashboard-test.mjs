#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · PIN dashboard test — la frontière caisse / tableau de bord, et la
 * survie du code propriétaire face aux synchronisations d'équipe.
 *
 *   node tools/pin-dashboard-test.mjs
 *
 * Trois invariants, nés d'un incident client réel (2026-08-20) :
 *   1. Un code de caissier n'ouvre JAMAIS le tableau de bord (serveur + client).
 *   2. La synchronisation du roster d'équipe (qui ne contient pas le patron)
 *      ne supprime JAMAIS les lignes propriétaire de staff_pins.
 *   3. Sans aucun code habilité, la porte l'explique au lieu de laisser deviner.
 *
 * Discipline : contrôles exécutés = code EXTRAIT des fichiers livrés.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { createRequire } from 'node:module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ ${msg}`); }
}

console.log('■ PIN dashboard test (tools/pin-dashboard-test.mjs)');

const lib = fs.readFileSync(path.join(ROOT, 'functions/auth/_lib.js'), 'utf8');
const cfg = fs.readFileSync(path.join(ROOT, 'functions/api/config.js'), 'utf8');
/* Staff code publication left the route for functions/api/_staff-publication.js
   (POST /api/config calls it); the owner-role helper and the pins block live there. */
const staffPub = fs.readFileSync(path.join(ROOT, 'functions/api/_staff-publication.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');

/* Extraction d'une fonction fermant par `\n}` en colonne 0 (module) ou `\n  }`
 * (script en ligne, indentation 2). */
const extract = (src, re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('cannot extract ' + what);
  return m[0].replace(/^export /, '');
};

// ── 1. employeeRoleOpensDashboard — exécutée, avec sa normalisation ─────────
const normSrc = extract(lib, /function normEmployeeRole\(value\) \{[\s\S]*?\n\}/, 'normEmployeeRole');
const dashSrc = extract(lib, /export function employeeRoleOpensDashboard\(value\) \{[\s\S]*?\n\}/, 'employeeRoleOpensDashboard');
const opensDash = new Function('Catalog', normSrc + '\n' + dashSrc + '; return employeeRoleOpensDashboard;')(createRequire(import.meta.url)(path.join(ROOT, 'assets/permissions-catalog.js')));   // la liste partagée des intitulés de propriétaire
ok(opensDash('Propriétaire') === true && opensDash('owner') === true && opensDash('PATRON') === true && opensDash('direction') === true, 'propriétaire / owner / patron / direction ouvrent le dashboard');
ok(opensDash('Manager') === true && opensDash('gérant') === true && opensDash('management') === true && opensDash('admin') === true, 'manager / gérant / management / admin ouvrent le dashboard (vue restreinte)');
ok(opensDash('Caissier') === false && opensDash('caissière') === false && opensDash('cashier') === false, 'un caissier n\'ouvre JAMAIS le dashboard');
ok(opensDash('staff') === false && opensDash('serveur') === false && opensDash('') === false && opensDash(null) === false, 'staff / serveur / vide / null refusés — l\'inconnu tombe du côté sûr');

// ── 2. verifyAccountPin filtre par rôle, sans jamais projeter le code ────────
const vapSrc = extract(lib, /export async function verifyAccountPin\(request, env, pin\) \{[\s\S]*?\n\}/, 'verifyAccountPin');
ok(/rows\.find\(\(row\) => employeeRoleOpensDashboard\(row\.role\)\)/.test(vapSrc), 'verifyAccountPin ne retient que le premier rôle habilité au dashboard');
const sealedLookup = fs.readFileSync(path.join(ROOT, 'functions/auth/_staff-codes.js'), 'utf8');
ok(/accountStaffCodes\(env, sess.aid, accSlug, pin\)/.test(vapSrc) && /delete row\.pin/.test(sealedLookup), 'le lookup scellé ne rend que l\'identité, jamais la colonne pin');
ok(/LIMIT 10/.test(sealedLookup) && !/LIMIT 1`/.test(vapSrc), 'lecture des CANDIDATS (LIMIT 10) : un code partagé caissier/patron ne masque plus le patron');
/* Pause courte (PIN_COOLDOWN_MS) depuis le 23 Nov 2026, « no blocking ». */
ok(/limitReserve\(request, env, 'pin:account', identity, LIMIT_MAX_FAILS, PIN_COOLDOWN_MS\)/.test(vapSrc), 'le limiteur de force brute est toujours en place (pause courte, essai réservé avant la comparaison)');

// ── 3. POST /api/config pins — le roster d'équipe ne tue pas le patron ───────
const ownerRoleSrc = extract(staffPub, /function accountOwnerRole\(value\) \{[\s\S]*?\n\}/, 'accountOwnerRole');
/* accountOwnerRole lit la table partagée des intitulés (assets/permissions-catalog.js) : on la lui donne. */
const SharedCatalog = createRequire(import.meta.url)(path.join(ROOT, 'assets/permissions-catalog.js'));
const ownerRole = new Function('Catalog', ownerRoleSrc + '; return accountOwnerRole;')(SharedCatalog);
ok(ownerRole('Propriétaire') === true && ownerRole('owner') === true && ownerRole('direction') === true, 'accountOwnerRole reconnaît les orthographes du patron (accents compris)');
ok(ownerRole('manager') === false && ownerRole('Caissier') === false, 'manager et caissier ne sont pas le patron — leurs lignes suivent le roster d\'équipe');

const pinsBlock = staffPub.slice(staffPub.indexOf('export async function publishStaffCredentials('));
/* Exécuté : quelles lignes propriétaire survivent à une liste entrante. En base : le
 * patron (Badr, propriétaire) et une « Direction » d'équipe (Amina). */
const keepSrc = extract(staffPub, /async function ownerRowsToKeep\([^)]*\) \{[\s\S]*?\n\}/, 'ownerRowsToKeep');
const ownerRowsToKeep = new Function('Catalog', 'accountOwnerRole', 'sealMerchantStaff', keepSrc + '; return ownerRowsToKeep;')(SharedCatalog, ownerRole, async () => {});
const ownerDb = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [
  { id: 1, name: 'Badr', role: 'Propriétaire' }, { id: 2, name: 'Amina', role: 'direction' }, { id: 3, name: 'Sara', role: 'Caissier' },
] }) }) }) } };
const kept = (pins, replaceOwner) => ownerRowsToKeep(ownerDb, 'm', pins, replaceOwner).then((ids) => ids && ids.join());
ok(await kept([{ name: 'Amina', role: 'direction' }]) === '1' && await kept([{ name: 'Badr', role: 'owner' }]) === '2',
  'la liste entrante est inspectée : une ligne propriétaire n’est remplacée que par une ligne au MÊME nom (une « Direction » d’équipe n’efface plus le patron)');
ok(await kept([{ name: 'Badr B.', role: 'owner' }], true) === '' && await kept([{ name: 'Sara', role: 'Caissier' }], true) === '1,2',
  'remplacer le propriétaire efface l’ancien code du patron, mais jamais sans patron dans la liste');
ok(/DELETE FROM staff_pins WHERE merchant = \? AND id NOT IN \(/.test(pinsBlock), 'sans propriétaire entrant, les lignes propriétaire existantes sont PRÉSERVÉES');
ok(/AND EXISTS \(SELECT 1 FROM staff_pins k WHERE k\.id IN/.test(pinsBlock), 'le code conservé du patron gagne sur un doublon d\'équipe — comparaison en SQL, jamais en JS');
ok(!/SELECT id, pin|SELECT pin/.test(pinsBlock), 'la préservation ne projette JAMAIS la colonne pin vers JavaScript');
ok(pinsBlock.includes("env.DB.prepare('DELETE FROM staff_pins WHERE merchant = ?').bind(merchant)"), 'avec propriétaire entrant (onboarding, console), le remplacement intégral demeure');
ok(/result\.pins = tillPins\.length \+ keepIds\.length/.test(pinsBlock), 'le compte renvoyé inclut les lignes préservées');

// ── 4. La porte du dashboard (script en ligne de dashboard.html) ─────────────
const gate = html.slice(html.indexOf('PIN lock + greeting flash controller'));
ok(/if \(access === 'staff'\) return 'no';/.test(gate), 'ceinture et bretelles : une identité staff renvoyée par le serveur est refusée côté client');
const tierSrc = extract(gate, /function accessTier\(raw\) \{[\s\S]*?\n  \}/, 'accessTier');
const accessTier = new Function(tierSrc + '; return accessTier;')();
ok(accessTier('Propriétaire') === 'owner' && accessTier('manager') === 'manager', 'accessTier : propriétaire → owner, manager → manager (sans KiwiRoles chargé)');
ok(accessTier('Caissier') === 'staff' && accessTier('Barista') === 'staff' && accessTier('') === 'staff', 'accessTier : tout rôle inconnu ou d\'équipe retombe sur staff');

/* Plus de liste de codes dans le navigateur : le repli hors ligne est une ligne
 * salée prouvée par le serveur (assets/dashboard-pin-vault.js), jamais un palier
 * équipe, et — la liste du compte une fois chargée — jamais un gérant. */
const lvSrc = extract(gate, /function localVerify\(code\) \{[\s\S]*?\n  \}/, 'localVerify');
const runLocalVerify = (role, loaded) => new Function('vault', 'accessTier', 'window', lvSrc + '; return localVerify;')(
  () => ({ verify: async () => ({ id: 'x1', name: 'Test', role }) }), accessTier, { KiwiConfig: { loaded } },
)('1234');
ok(await runLocalVerify('Caissier', false) === null, 'le repli hors ligne ne rend JAMAIS un palier équipe, même si une ligne existe');
ok((await runLocalVerify('Propriétaire', true) || {}).access === 'owner' && (await runLocalVerify('manager', false) || {}).access === 'manager'
  && await runLocalVerify('manager', true) === null, 'repli : propriétaire toujours ; gérant seulement tant que la liste du compte n\'est pas chargée');
ok(!/\ballPins\b|\bconfiguredPins\b/.test(gate), 'la porte ne possède plus aucune liste de codes locale (allPins / configuredPins)');

// ── 5. L'état vide — « connectez-vous avec Kiwi » ────────────────────────────
ok(/function maybeShowNoOwnerHelp\(\)/.test(gate) && /kiwi-account-pins-ready', maybeShowNoOwnerHelp/.test(gate), 'la porte réévalue l\'état vide quand la liste des codes du compte arrive');
ok(/serverRosterSize\(\) > 0 && !hasDashboardCode\(\)/.test(gate), 'le message ne sort que si le compte est configuré SANS aucun code habilité');
ok(gate.includes("Connectez-vous avec Kiwi pour configurer votre code d\\'acc"), 'le message dit le chemin : passer par Kiwi pour configurer le code');
ok(/if \(demosOn\(\) \|\| !helpEl \|\| pinInput\.value\) return;/.test(gate), 'jamais en démo, jamais par-dessus une saisie en cours');

// ── 5b. Le département : « Manager · Caisse » ouvre la caisse, pas le tableau de bord ──
/* Exécuté sur le vrai module (functions/auth/_dashboard-door.js), codes scellés
 * comme en production. Lignes de staff_pins telles que accountStaffCodes les rend. */
const door = await import(path.join(ROOT, 'functions/auth/_dashboard-door.js'));
const { codeDocument: sealDoc } = await import(path.join(ROOT, 'functions/auth/_staff-codes.js'));
const doorEnv = { AUTH_SECRET: 'test-secret-door' };
const teamDoc = await sealDoc(doorEnv, 'shop', 'team', { members: [
  { id: 'm1', firstName: 'Sara', lastName: 'A', function: 'Manager', department: 'Caisse', pinCode: '1111' },
  { id: 'm2', firstName: 'Omar', lastName: 'B', function: 'Manager', department: 'Management', pinCode: '2222' },
  { id: 'm3', firstName: 'Nora', lastName: 'C', function: 'Manager', department: '', pinCode: '3333' },
  { id: 'm4', firstName: 'Lina', lastName: 'D', function: 'Réceptionniste', department: 'Réception', pinCode: '4444' },
  { id: 'm5', firstName: 'Yasmine', lastName: 'E', function: 'Manager', department: 'Vente', pinCode: '5555' },
] }, true);
doorEnv.DB = { prepare: () => ({ bind: (m) => ({ first: async () => (m === 'shop' ? { data: JSON.stringify(teamDoc) } : null) }) }) };
const pass = async (row, pin) => (await door.keepDashboardDepartments(doorEnv, [{ merchant: 'shop', ...row }], pin)).length === 1;
ok(!(await pass({ name: 'Sara A', role: 'Manager' }, '1111')) && !(await pass({ name: 'Yasmine E', role: 'Manager' }, '5555')),
  'Manager · Caisse et Manager · Vente n\'ouvrent PAS le tableau de bord');
ok(await pass({ name: 'Omar B', role: 'Manager' }, '2222') && await pass({ name: 'Nora C', role: 'Manager' }, '3333'),
  'Manager · Management l\'ouvre, et une fiche sans département garde la règle d\'avant');
ok(await pass({ name: 'Badr', role: 'Propriétaire' }, '9999') && await pass({ name: 'Lina D', role: 'Réceptionniste' }, '4444')
  && await pass({ name: 'Inconnu', role: 'Manager' }, '8888'),
  'le patron, la réception et un code sans fiche Équipe ne sont pas touchés');
ok(!(await pass({ name: 'Sara A', role: 'Manager' }, '')) && !(await door.keepDashboardDepartments({ DB: { prepare: () => { throw new Error('down'); } } }, [{ merchant: 'shop', name: 'Omar B', role: 'Manager' }], '2222')).length,
  'sans code lisible on retrouve la fiche par le nom ; une base illisible ferme la porte au gérant');
// Que verifyAccountPin passe par ce contrôle et que verifyStaffPin l'ignore se joue
// par la route dans tools/pin-hardening-test.mjs (« Manager · Caisse »), pas ici.

// ── 6. Verrou du nombre de contrôles ─────────────────────────────────────────
const EXPECTED_COUNT = 32;
ok(passed + 1 === EXPECTED_COUNT, `exact control count verified (${passed + 1}/${EXPECTED_COUNT})`);

if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s)`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} controls green`);
}
