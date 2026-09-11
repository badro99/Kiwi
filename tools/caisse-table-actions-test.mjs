#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const serveur = fs.readFileSync(new URL('../kiwi-serveur.html', import.meta.url), 'utf8');
const queue = fs.readFileSync(new URL('../functions/api/order/queue.js', import.meta.url), 'utf8');
let checks = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`✓ ${label}`);
}

ok(!queue.includes("from './_table-mobility.js'"), 'server no longer refuses a table merely because its ticket reached kitchen');
ok(!/openCaisseTransferModal\(tableId\)[\s\S]{0,180}caisseTableKitchenLocked/.test(caisse), 'caisse transfer opens for a sent order');
ok(!/openCaisseMergeModal\(tableId\)[\s\S]{0,180}caisseTableKitchenLocked/.test(caisse), 'caisse merge opens for a sent order');
ok(/data-action="transfer-table"/.test(serveur) && /data-action="merge-table"/.test(serveur)
  && !/data-action="(?:transfer-table|merge-table)"[^>]*disabled/.test(serveur), 'server-phone mobility controls remain tappable');
ok(/uid: l\.uid[\s\S]{0,180}sent: !!l\.sent/.test(caisse), 'bill projection preserves sent-line identity');
ok(/data-table-void/.test(caisse) && /openCaisseVoidModal\(selectedId, line\)/.test(caisse), 'sent bill line exposes the audited kitchen cancellation');
ok(/rp-item--sent[\s\S]{0,420}data-cart-action="dec"/.test(caisse), 'sent line remains cancellable after reopening the menu');
ok(/function cancelSentTable[\s\S]{0,2600}canonicalNumberPromise[\s\S]{0,2600}status: 'rejected'[\s\S]{0,2600}actorProof/.test(caisse), 'whole-table cancellation waits for canonical ticket and carries operator proof');
ok(/cancelSentTable\(tid, who\)/.test(caisse), 'Annuler table routes sent orders through canonical cancellation');
ok(/status <> 'rejected'/.test(queue), 'mobility leaves cancelled history at its original table');

console.log(`\n✓ ${checks} table-action regression checks green.`);
