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
const opensDash = new Function(normSrc + '\n' + dashSrc + '; return employeeRoleOpensDashboard;')();
ok(opensDash('Propriétaire') === true && opensDash('owner') === true && opensDash('PATRON') === true && opensDash('direction') === true, 'propriétaire / owner / patron / direction ouvrent le dashboard');
ok(opensDash('Manager') === true && opensDash('gérant') === true && opensDash('management') === true && opensDash('admin') === true, 'manager / gérant / management / admin ouvrent le dashboard (vue restreinte)');
ok(opensDash('Caissier') === false && opensDash('caissière') === false && opensDash('cashier') === false, 'un caissier n\'ouvre JAMAIS le dashboard');
ok(opensDash('staff') === false && opensDash('serveur') === false && opensDash('') === false && opensDash(null) === false, 'staff / serveur / vide / null refusés — l\'inconnu tombe du côté sûr');

// ── 2. verifyAccountPin filtre par rôle, sans jamais projeter le code ────────
const vapSrc = extract(lib, /export async function verifyAccountPin\(request, env, pin\) \{[\s\S]*?\n\}/, 'verifyAccountPin');
ok(/rows\.find\(\(row\) => employeeRoleOpensDashboard\(row\.role\)\)/.test(vapSrc), 'verifyAccountPin ne retient que le premier rôle habilité au dashboard');
ok(/SELECT p\.id, p\.name, p\.role, p\.merchant/.test(vapSrc) && /SELECT id, name, role, merchant FROM staff_pins/.test(vapSrc), 'les deux requêtes projettent l\'identité, jamais la colonne pin');
ok(/LIMIT 10/.test(vapSrc) && !/LIMIT 1`/.test(vapSrc), 'lecture des CANDIDATS (LIMIT 10) : un code partagé caissier/patron ne masque plus le patron');
ok(/limitFail\(request, env, 'pin:account', identity\)/.test(vapSrc), 'le limiteur de force brute est toujours en place');

// ── 3. POST /api/config pins — le roster d'équipe ne tue pas le patron ───────
const ownerRoleSrc = extract(cfg, /function accountOwnerRole\(value\) \{[\s\S]*?\n\}/, 'accountOwnerRole');
const ownerRole = new Function(ownerRoleSrc + '; return accountOwnerRole;')();
ok(ownerRole('Propriétaire') === true && ownerRole('owner') === true && ownerRole('direction') === true, 'accountOwnerRole reconnaît les orthographes du patron (accents compris)');
ok(ownerRole('manager') === false && ownerRole('Caissier') === false, 'manager et caissier ne sont pas le patron — leurs lignes suivent le roster d\'équipe');

const pinsBlock = cfg.slice(cfg.indexOf('if (Array.isArray(body && body.pins))'), cfg.indexOf('// ── Business type'));
ok(pinsBlock.includes('const incomingHasOwner = tillPins.some((p) => accountOwnerRole(p.role))'), 'la liste entrante est inspectée : porte-t-elle un propriétaire ?');
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

const cfgPinsSrc = extract(gate, /function configuredPins\(\) \{[\s\S]*?\n  \}/, 'configuredPins');
const testConfiguredPins = new Function('allPins', cfgPinsSrc + '; return configuredPins;')(() => [
  { code: '5678', name: 'Sara', access: 'staff' },
]);
const testResult = testConfiguredPins();
ok(Array.isArray(testResult) && testResult.length === 0, 'configuredPins exclut STRICTEMENT le personnel : une liste contenant seulement un caissier renvoie []');
ok(!cfgPinsSrc.includes(': all'), 'configuredPins ne possède aucun repli « : all » pouvant rouvrir la porte à un caissier');

// ── 5. L'état vide — « connectez-vous avec Kiwi » ────────────────────────────
ok(/function maybeShowNoOwnerHelp\(\)/.test(gate) && /kiwi-account-pins-ready', maybeShowNoOwnerHelp/.test(gate), 'la porte réévalue l\'état vide quand la liste des codes du compte arrive');
ok(/serverRosterSize\(\) > 0 && !hasDashboardCode\(\)/.test(gate), 'le message ne sort que si le compte est configuré SANS aucun code habilité');
ok(gate.includes("Connectez-vous avec Kiwi pour configurer votre code d\\'acc"), 'le message dit le chemin : passer par Kiwi pour configurer le code');
ok(/if \(demosOn\(\) \|\| !helpEl \|\| pinInput\.value\) return;/.test(gate), 'jamais en démo, jamais par-dessus une saisie en cours');

// ── 6. Verrou du nombre de contrôles ─────────────────────────────────────────
const EXPECTED_COUNT = 26;
ok(passed + 1 === EXPECTED_COUNT, `exact control count verified (${passed + 1}/${EXPECTED_COUNT})`);

if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s)`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} controls green`);
}
