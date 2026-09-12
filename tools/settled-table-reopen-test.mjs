#!/usr/bin/env node
/* #0068 · « j'ai encaissé la table 13, et plus tard je la retrouve ouverte,
 * non encaissée ».
 *
 * `attachOrderProTable` protège la note par la SESSION du téléphone : trois
 * gardes, toutes conditionnées à `o.session` ou `o.server`. Un bon qui ne
 * porte NI l'un NI l'autre · une commande QR client, un bon du canal public ·
 * les traverse toutes les trois et se raccroche à la table par son seul
 * numéro. Une table encaissée à 23h40 rouvrait donc seule, avec la note qu'on
 * venait de régler, pendant que la vente était déjà au journal.
 *
 * On exécute la vraie fonction sur un vrai bon sans session.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

const START = '    function attachOrderProTable(o) {';
const END = "\n    /* Une commande du serveur → un ticket d'ici.";
const a = source.indexOf(START);
const b = source.indexOf(END, a);
assert.notEqual(a, -1, 'attachOrderProTable exists');
assert.notEqual(b, -1, 'its end marker exists');
const fn = source.slice(a, b);

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };

function bench({ closedAt, seatSince }) {
  const tables = { 13: { status: 'khawya', covers: 0 } };
  const tableOrders = {};
  const phoneSeats = new Map();
  if (seatSince) phoneSeats.set('13', { session: 'sess-new', since: seatSince });
  const tableClosedAt = Object.create(null);
  if (closedAt) tableClosedAt['13'] = closedAt;
  const ctx = vm.createContext({
    tables, tableOrders, phoneSeats, tableClosedAt,
    servers: {}, orders: {},
    selectedId: null, mode: 'salle',
    caisseTableId: (v) => String(v),
    tableKey: (v) => String(v),
    ticketNo: () => 'N°1',
    menuLineFind: () => null,
    newLineUid: () => 'uid-' + Math.random(),
    resetTableTimer() {}, startTableTimer() {},
    refreshTableNode() {}, renderRightPanel() {}, persistShift() {},
  });
  vm.runInContext(fn, ctx);
  return { ctx, tables, tableOrders };
}

/* Le bon de la soirée : un QR client, ni session ni serveur. */
const ticket = (createdTs) => ({
  id: 'op-13-a', mode: 'table', table: '13', status: 'pending',
  channel: 'kiwi', created_ts: createdTs, number: 41,
  lines: [{ id: 'p1', name: 'Pizza Royale', unitPrice: 95, qty: 1 }],
});

const SETTLED_AT = 1757635200000;   // l'encaissement

/* 1 · Le comportement qu'on veut garder : hors encaissement, le bon s'attache. */
{
  const { ctx, tableOrders, tables } = bench({});
  ok('un bon sans session s’attache normalement à une table ouverte',
    ctx.attachOrderProTable(ticket(SETTLED_AT)) === true
    && (tableOrders['13'] || []).length === 1
    && tables['13'].status === 'ka-yaklo');
}

/* 2 · Le bug : la même commande, après l'encaissement de la table. */
{
  const { ctx, tableOrders, tables } = bench({ closedAt: SETTLED_AT });
  const reattached = ctx.attachOrderProTable(ticket(SETTLED_AT - 60000));
  ok('un bon antérieur à l’encaissement ne rouvre plus la table', reattached === false);
  ok('la table réglée reste libre', tables['13'].status === 'khawya');
  ok('aucune note fantôme n’est reconstruite', !(tableOrders['13'] || []).length);
}

/* 3 · Ce que la garde ne doit PAS casser · une nouvelle commande, après. */
{
  const { ctx, tableOrders } = bench({ closedAt: SETTLED_AT });
  ok('une commande passée APRÈS l’encaissement ouvre bien la table suivante',
    ctx.attachOrderProTable(ticket(SETTLED_AT + 60000)) === true
    && (tableOrders['13'] || []).length === 1);
}

/* 4 · Un nouveau client s'assied avec son téléphone après le règlement : la
 *     table repart, et sa commande à lui s'attache comme avant. */
{
  const { ctx, tableOrders } = bench({ closedAt: SETTLED_AT, seatSince: SETTLED_AT + 30000 });
  ok('la table qui se rassied après le règlement accepte sa nouvelle commande',
    ctx.attachOrderProTable(ticket(SETTLED_AT + 45000)) === true
    && (tableOrders['13'] || []).length === 1);
}

/* 5 · Sans horodatage, on ne sait pas · et on ne refuse pas une vraie
 *     commande sur un soupçon. Perdre un plat coûte plus cher que rouvrir. */
{
  const { ctx, tableOrders } = bench({ closedAt: SETTLED_AT });
  const t = ticket(0); delete t.created_ts;
  ok('un bon sans horodatage reste accepté · le doute ne fait pas perdre une commande',
    ctx.attachOrderProTable(t) === true && (tableOrders['13'] || []).length === 1);
}

/* 6 · CE QUE CETTE GARDE NE COUVRE PAS, ET POURQUOI.
 *     `tableClosedAt` vit en mémoire : un F5 l'efface, et le bon déjà réglé
 *     redevient recevable jusqu'au prochain encaissement. C'est délibéré, pas
 *     un oubli · field-table-transfer-test exige explicitement que ces pierres
 *     tombales NE SOIENT PAS dans l'instantané du service (« close tombstones
 *     are not persisted »), sans quoi une table transférée puis rechargée
 *     perdrait la visite qu'on vient d'y déplacer. Fermer cette fenêtre-là
 *     demande de faire porter la preuve au serveur, pas au blob local.
 *     On verrouille les deux faits pour que personne ne « répare » l'un en
 *     cassant l'autre sans le voir. */
ok('la fermeture reste hors de l’instantané · les transferts en dépendent',
  !/tableClosedAt: tableClosedAt,/.test(source));
ok('la garde est bien en mémoire, dans la fonction de rattachement',
  /const closedAt = Number\(tableClosedAt\[tableKey\(id\)\] \|\| 0\);/.test(source));

console.log(`\nsettled-table-reopen-test: ${passed} controls passed\n`);
