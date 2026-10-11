#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * INSTALLATION · CE QUE L'ASSISTANT ET LA FIN DE L'ASSISTANT AFFIRMENT
 *
 * Mesuré le 2026-10-11 sur le stack local :
 *
 * 1. « Vous êtes combien à travailler ici ? 3 », puis l'étape des codes
 *    proposait toujours le même nombre de lignes, quel que soit le chiffre.
 * 2. Fini sans recharger la page, le magasin (en attente d'activation) gardait
 *    la porte « installation » : ses écritures partaient vers un serveur qui
 *    les refuse toutes (401), et l'écran disait « Paramètres enregistrés »,
 *    puis « En ligne » pour des réservations que le lien public refusait.
 *
 * Exécute la vraie fonction de assets/onboarding.js.
 *
 *   node tools/onboarding-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OB = readFileSync(path.join(ROOT, 'assets/onboarding.js'), 'utf8');
const ENT = readFileSync(path.join(ROOT, 'assets/entitlements-v2.js'), 'utf8');

function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

function fit(teamSize, pins) {
  const ctx = vm.createContext({ S: { teamSize, pins } });
  vm.runInContext(grab(OB, 'function fitPinsToTeam(') + '\nfitPinsToTeam();', ctx);
  return Array.from(ctx.S.pins, (p) => String(p.role));
}
const owner = () => ({ role: 'owner', name: 'Testeur', code: '' });
const blank = (role) => ({ role, name: '', code: '' });

ok('autant de lignes de code que de personnes annoncées', () => {
  assert.deepEqual(fit(1, [owner(), blank('manager'), blank('staff')]), ['owner']);
  assert.deepEqual(fit(2, [owner(), blank('manager'), blank('staff')]), ['owner', 'staff']);
  assert.deepEqual(fit(3, [owner()]), ['owner', 'manager', 'staff']);
});
ok('jamais plus de quatre lignes proposées, le reste s’ajoute à la main', () => {
  assert.deepEqual(fit(12, [owner()]), ['owner', 'manager', 'staff', 'staff']);
});
ok('une ligne déjà remplie n’est jamais effacée', () => {
  const kept = [owner(), { role: 'staff', name: 'Salma', code: '' }];
  assert.deepEqual(fit(1, kept), ['owner', 'staff']);
});
ok('l’étape des codes s’ajuste à chaque passage', () => {
  assert.match(grab(OB, 'function stepAccess('), /^function stepAccess\(\) \{\s*fitPinsToTeam\(\);/);
});

ok('la fin de l’assistant prévient la porte d’abonnement, dans la même page', () => {
  const enter = grab(OB, 'function enterApp(');
  assert.match(enter, /dispatchEvent\(new CustomEvent\('kiwi-onboarded'\)\)/);
  assert.match(enter, /KiwiIdentity\.state\.onboarded = true/);
});
ok('…à l’entrée, pas pendant « votre espace est prêt »', () => {
  assert.ok(!/kiwi-onboarded/.test(grab(OB, 'async function finish(')), 'finish() must not raise the gate');
});
ok('la porte l’entend et cesse de se croire en installation', () => {
  assert.match(ENT, /addEventListener\('kiwi-onboarded',function\(\)\{onboarded=true;identitySettled=true;refreshPill\(\);\}\)/);
});

console.log(`\nonboarding-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
