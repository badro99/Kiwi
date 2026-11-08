#!/usr/bin/env node
// Un numéro dont les huit derniers chiffres sont partagés par plus de 50 autres fiches
// (autres pays, mêmes huit chiffres) retrouve quand même sa vraie fiche jumelle.
import assert from 'node:assert/strict';
import { server } from './customer-balance-harness.mjs';

const f = await server();
await f.reset();
f.sql.exec("DELETE FROM clients WHERE id <> 'client-fixture'");
f.sql.prepare("UPDATE clients SET phone='' WHERE id='client-fixture'").run();
const ins = f.sql.prepare("INSERT INTO clients (merchant, id, name, phone, deleted, updated_ts, srv_ts) VALUES (?, ?, ?, ?, 0, 1, ?)");
// 120 fiches étrangères qui finissent par les mêmes huit chiffres, toutes plus anciennes que la jumelle.
for (let i = 0; i < 120; i++) ins.run(f.merchant, 'foreign-' + i, 'Etranger ' + i, '+' + (900 + i) + '12345678', 10 + i);
ins.run(f.merchant, 'real-twin', 'Cliente Reelle', '06 12 34 56 78', 5000);

const r = await f.clients({ id: 'new-device-card', name: 'Doublon', phone: '+212 612 345 678' });
assert.equal(r.status, 200, JSON.stringify(r));
const alias = f.sql.prepare("SELECT deleted, source FROM clients WHERE merchant = ? AND id = 'new-device-card'").get(f.merchant);
assert.equal(alias.deleted, 1, 'la fiche neuve devient un alias');
assert.equal(alias.source, 'merged:real-twin', 'fusionnée dans la vraie jumelle, pas ignorée parce que 50 étrangères la précèdent');
assert.equal(f.sql.prepare("SELECT count(*) n FROM clients WHERE merchant = ? AND deleted = 0 AND phone LIKE '06 12 34 56 78'").get(f.merchant).n, 1);

// Aucune jumelle : une fiche neuve reste une fiche neuve, même avec 120 voisines de suffixe.
const own = await f.clients({ id: 'alone', name: 'Seule', phone: '07 12 34 56 78' });
assert.equal(own.status, 200);
assert.equal(f.sql.prepare("SELECT deleted FROM clients WHERE merchant = ? AND id = 'alone'").get(f.merchant).deleted, 0);
console.log('clients phone twin crowded suffix ok');
