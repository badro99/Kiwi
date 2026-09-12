#!/usr/bin/env node
/* #0064 · « les commandes de plus de 60 lignes sont tronquées en silence ».
 *
 * `cleanLines` coupe à MAX_LINES. Le bon de caisse passait par là sans aucun
 * contrôle en amont : le serveur répondait `ok`, le comptoir marquait chaque
 * ligne envoyée, et l'écran cuisine distant ne recevait que les soixante
 * premiers plats. Rien, nulle part, ne disait que le reste avait disparu.
 *
 * Le chemin employé (POST /order) refusait déjà ce cas par `too-many-lines`.
 * On exige ici que le bon de caisse le refuse de la même façon · et que le
 * comptoir le DISE, sans quoi refuser reviendrait juste à perdre le bon
 * entier au lieu d'en perdre la fin.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const queue = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');
const caisse = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };

const grab = (re, what) => {
  const m = queue.match(re);
  assert.ok(m, `${what} introuvable dans queue.js`);
  return m[0];
};

/* On reconstruit le vrai `createTicket` : sa garde est la toute première
 * chose après le contrôle d'identifiant, donc rien n'atteint D1 sur un refus.
 * Un `env` qui explose au moindre accès le prouve. */
const createTicket = new Function(`
  const json = (body, status) => ({ status: status || 200, body });
  /* Les deux seules dépendances que la garde traverse avant de toucher la
     base. Elles viennent d'ailleurs dans le module ; ici elles ne font que
     laisser passer. */
  const normTable = (v) => String(v == null ? '' : v).trim().slice(0, 12);
  const ensureServiceTableSession = async () => { throw new Error('un refus ne doit pas toucher la base'); };
  ${grab(/const ORDER_ID = [^\n]+/, 'ORDER_ID')}
  ${grab(/const MAX_LINES = [^\n]+/, 'MAX_LINES')}
  ${grab(/const MAX_QTY = [^\n]+/, 'MAX_QTY')}
  ${grab(/function cleanLines\([\s\S]*?\n\}\n/, 'cleanLines')}
  ${grab(/async function createTicket\([\s\S]*?\n  const linesJson = JSON\.stringify\(lines\);/, 'createTicket')}
    return { reachedTheDatabase: true };
  }
  return createTicket;
`)();

const env = new Proxy({}, { get() { throw new Error('un refus ne doit pas toucher la base'); } });
const line = (i) => ({ name: 'Plat ' + i, qty: 1, unitPrice: 4000 });
const ticket = (n) => ({
  id: 'ord-abc123def', mode: 'table', table: '13',
  lines: Array.from({ length: n }, (_, i) => line(i + 1)),
});

const MAX = Number(queue.match(/const MAX_LINES = (\d+)/)[1]);
ok('le plafond de lignes est bien celui du fichier livré', MAX === 60);

/* Le refus doit être une RÉPONSE, pas une erreur : si la garde disparaît, le
 * bon file vers la base et le bac à sable explose · on le rattrape pour que
 * l'échec se lise sur la bonne assertion plutôt qu'en trace de pile. */
const refused = await createTicket({}, env, 'mixmax', ticket(MAX + 10), Date.now())
  .catch((e) => ({ status: 0, body: {}, crashed: e.message }));
ok('un bon trop long est refusé au lieu d’être amputé', refused.status === 400);
ok('et il est refusé sous le même nom que le chemin employé',
  refused.body && refused.body.error === 'too-many-lines');
ok('le refus dit combien de lignes ont été envoyées et combien sont permises',
  refused.body.sent === MAX + 10 && refused.body.max === MAX);
ok('le refus n’écrit rien : il tombe avant la base', !refused.reachedTheDatabase);

/* Le bon qui tient dans le plafond doit continuer d'aller jusqu'au bout · une
 * garde qui refuse un cas légitime coûte une commande à chaque service. */
const passedThrough = await createTicket({}, env, 'mixmax', ticket(MAX), Date.now())
  .then(() => 'atteint la suite', (e) => e.message);
ok('un bon exactement au plafond continue son chemin',
  passedThrough === 'un refus ne doit pas toucher la base');

const empty = await createTicket({}, env, 'mixmax', { id: 'ord-abc123def', lines: [] }, Date.now());
ok('un bon vide reste refusé comme avant', empty.status === 400 && empty.body.error === 'empty-order');

/* Et le comptoir le dit. Sans ça on aurait juste remplacé « la fin du bon
 * disparaît » par « tout le bon disparaît », ce qui est pire. */
ok('le comptoir branche bien le refus sur son message',
  /if \(r && r\.error === 'too-many-lines'\) tooLongForKitchen\(r\);/.test(caisse));

/* Et le message lui-même, exécuté : un caissier doit lire ce qui s'est passé
 * ET ce qu'il a à faire, sinon on a juste remplacé « la fin du bon disparaît »
 * par « tout le bon disparaît », ce qui est pire. */
const said = [];
new Function('toast', caisse.slice(
  caisse.indexOf('    function tooLongForKitchen(r) {'),
  caisse.indexOf('    function relayToKitchen(order) {'),
) + '\nreturn tooLongForKitchen;')((m, kind) => said.push([m, kind]))(
  { error: 'too-many-lines', max: 60, sent: 73 });

ok('le message dit combien d’articles et quel est le plafond',
  said.length === 1 && /73/.test(said[0][0]) && /60/.test(said[0][0]));
ok('il dit quoi faire, pas seulement que ça a raté',
  /envoie-le en deux fois/.test(said[0][0]));
ok('et il se voit · c’est une alerte, pas une information de plus',
  said[0][1] === 'danger');

console.log(`\norder-line-cap-test: ${passed} controls passed\n`);
