#!/usr/bin/env node
/* Équipe · ajouter un membre n'affiche plus son code personnel.
 *
 * 2026-10-12. Le toast de confirmation disait « Code personnel 4821 · compte
 * employé activé » : quatre chiffres en clair, plusieurs secondes, au-dessus du
 * tableau de bord, souvent sur l'écran du comptoir. Et « activé » s'affichait
 * avant que la copie serveur, seule à ouvrir l'app employé, ait répondu. Le
 * toast dit maintenant COMMENT le membre se connecte ; le code se lit et se
 * copie sur sa fiche, que le gérant ouvre exprès.
 */
import teamTestSource from './team-test-source.cjs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.KIWI_ROOT || path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const src = teamTestSource();
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const descs = [...src.matchAll(/^\s*tAddedDesc:\s*(\([^)]*\)\s*=>\s*`[^`]*`),$/gm)].map((m) => m[1]);
check(descs.length === 3, 'the add-member description exists in FR, EN and AR');

const calls = [...src.matchAll(/T\.tAddedDesc\(([^)]*)\)/g)].map((m) => m[1].trim());
check(calls.length === 1, 'one call site shows the add-member description');

/* Ce que le toast affiche vraiment : l'argument du point d'appel, résolu sur un
 * membre qui a un e-mail ET un code, passé à chaque langue. */
const member = { email: 'sara@example.test', password: '4821', pinCode: '4821' };
const arg = new Function('member', 'return ' + calls[0])(member);
const read = descs.map((d) => (0, eval)(d)(arg));
check(read.every((s) => !s.includes(member.password) && !/\d{4}/.test(s)), 'what the toast shows carries no four-digit code, in any language');
check(read.every((s) => s.includes(member.email)), 'it names the e-mail the member signs in with');
check(read.every((s) => !/activé|enabled|مفعل/.test(s)), 'no language claims the account is active before the server copy answered');
check(!/\u2014/.test(read.join('')), 'no em dash in the copy');
check(!/toast\([^;\n]*(\.password|\.pinCode)\b/.test(src), 'no toast in team.js interpolates a password or a code');

console.log(`\nteam-added-toast: ${checks} passed, 0 failed`);
