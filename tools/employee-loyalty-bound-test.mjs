#!/usr/bin/env node
/* Fidélité depuis l'app serveur · les points ne sont plus déclaratifs.
 *
 * /api/employee-clients laissait le client choisir le montant, ne le liait à
 * aucune vente, et créditait des points même quand le commerçant n'avait
 * choisi AUCUN programme. Ici : le montant d'une vente liée vient de la base,
 * un appel sans vente est borné et limité, et pas de programme = pas de points.
 * La vraie route tourne sur schema.sql dans un SQLite en mémoire.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { employeeCookie, employeeToken } from '../functions/auth/_lib.js';
import { onRequestPost } from '../functions/api/employee-clients.js';

const SECRET = 'employee-loyalty-bound-secret';
const MERCHANT = 'loyalty-bound-shop';
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls += 1; console.log('  ✓ ' + message); };

function world(fidelity) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values.map((v) => (v === undefined ? null : v)); return statement; },
        async first() { return raw.prepare(sql).get(...args) || null; },
        async all() { return { results: raw.prepare(sql).all(...args) }; },
        async run() { const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes || 0) } }; },
      };
      return statement;
    },
    async batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const s of statements) out.push(await s.run()); raw.exec('COMMIT'); return out; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  const now = Date.now();
  raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('acc-loyal', 'loyal@example.test', 'Owner', 'Loyal', 's', 'h', now);
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Loyal', 'acc-loyal', now);
  const doc = raw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)');
  const member = { id: 'staff-1', firstName: 'Amina', lastName: 'Serveuse', role: 'Serveur', function: 'Serveur' };
  doc.run(MERCHANT, 'employee-access', JSON.stringify({ members: [member] }), 1, now);
  doc.run(MERCHANT, 'team', JSON.stringify({ members: [member] }), 1, now);
  doc.run(MERCHANT, 'attendance', JSON.stringify({ entries: [{ memberId: 'staff-1', staffId: 'staff-1', inTs: now - 1000, outTs: 0 }] }), 1, now);
  if (fidelity) doc.run(MERCHANT, 'fidelity', JSON.stringify(fidelity), 1, now);
  raw.prepare('INSERT INTO clients (merchant,id,name,points,stamps,visits,spend,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(MERCHANT, 'client-1', 'Cliente', 0, 0, 0, 0, now, now);
  raw.prepare('INSERT INTO clients (merchant,id,name,points,stamps,visits,spend,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(MERCHANT, 'client-2', 'Autre cliente', 0, 0, 0, 0, now, now);
  raw.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, void_ts, lines) VALUES (?,?,?,?,?,?,?,?,NULL,?)')
    .run('sale-real', MERCHANT, 80, 8000, 'card', 'Table 4', 'T4', now - 60000, '[]');
  raw.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, void_ts, lines) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('sale-voided', MERCHANT, 50, 5000, 'cash', 'Table 5', 'T5', now - 60000, now - 1000, '[]');
  raw.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, void_ts, lines) VALUES (?,?,?,?,?,?,?,?,NULL,?)')
    .run('sale-old', MERCHANT, 40, 4000, 'cash', 'Table 6', 'T6', now - 3 * 86400000, '[]');
  return { raw, env: { DB, AUTH_SECRET: SECRET } };
}
const cookie = (await employeeCookie(await employeeToken(SECRET, { merchant: MERCHANT, staffId: 'staff-1' }))).split(';')[0];
const post = (w, body) => onRequestPost({ env: w.env, request: new Request('https://kiwi.test/api/employee-clients', {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ merchant: MERCHANT, ...body }),
}) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const client = (w) => w.raw.prepare('SELECT points, stamps, visits, spend FROM clients WHERE merchant=? AND id=?').get(MERCHANT, 'client-1');

console.log('■ Fidélité de salle · liée à la vente');

{ /* une vente liée : le montant vient de la base */
  const w = world({ model: 'amount', amount: { perMad: 2 } });
  let r = await post(w, { clientId: 'client-1', saleId: 'sale-real', amount: 99999, ref: 'whatever' });
  ok(r.status === 200 && r.body.points === 160, 'le montant déclaré (99 999) est ignoré : 80 MAD de la vente × 2 = 160 points');
  ok(Number(client(w).spend) === 80 && Number(client(w).visits) === 1, 'la dépense créditée est celle de la vente');
  r = await post(w, { clientId: 'client-1', saleId: 'sale-real', ref: 'autre-ref' });
  ok(r.status === 200 && r.body.replayed === true && Number(client(w).points) === 160,
    'la même vente, rejouée avec une autre référence, ne crédite pas deux fois');
  r = await post(w, { clientId: 'client-2', saleId: 'sale-real' });
  ok(r.status === 409 && r.body.error === 'ref-conflict' && w.raw.prepare("SELECT points FROM clients WHERE id='client-2'").get().points === 0,
    'la vente d\'une cliente ne se réattribue pas à une autre');
  r = await post(w, { clientId: 'client-1', saleId: 'sale-inventee' });
  ok(r.status === 404 && r.body.error === 'sale-not-found', 'une vente inconnue ne donne rien');
  r = await post(w, { clientId: 'client-1', saleId: 'sale-voided' });
  ok(r.status === 404 && Number(client(w).points) === 160, 'une vente annulée ne donne rien');
  r = await post(w, { clientId: 'client-1', saleId: 'sale-old' });
  ok(r.status === 409 && r.body.error === 'sale-too-old', 'une vente de trois jours ne se lie plus à la fidélité');
}

{ /* sans vente : borné */
  const w = world({ model: 'amount', amount: { perMad: 10 } });
  let r = await post(w, { clientId: 'client-1', amount: 9999999, ref: 'employee-payment:1:a' });
  ok(r.status === 200 && r.body.points === 5000 && Number(client(w).spend) === 20000,
    'sans vente liée, le montant est borné (20 000 MAD) et les points d\'un appel plafonnés (5 000)');
  for (const n of [2, 3, 4]) await post(w, { clientId: 'client-1', amount: 10, ref: `employee-payment:1:${n}` });
  r = await post(w, { clientId: 'client-1', amount: 10, ref: 'employee-payment:1:5' });
  ok(r.status === 429 && r.body.error === 'loyalty-rate-limited',
    'sans vente liée, un même client ne reçoit pas plus de quatre crédits par heure');
}

{ /* pas de programme = pas de points */
  for (const [label, doc] of [['aucun programme', null], ['défaut déduit (auto)', { auto: true, model: 'amount', amount: { perMad: 1 } }]]) {
    const w = world(doc);
    const r = await post(w, { clientId: 'client-1', saleId: 'sale-real' });
    const c = client(w);
    ok(r.status === 200 && r.body.points === 0 && r.body.stamps === 0 && Number(c.points) === 0 && Number(c.stamps) === 0
      && Number(c.visits) === 1 && Number(c.spend) === 80,
      `${label} : le passage et la dépense comptent, aucun point ni tampon`);
  }
  const w = world({ model: 'visit', visit: { target: 8 } });
  const r = await post(w, { clientId: 'client-1', saleId: 'sale-real' });
  ok(r.status === 200 && r.body.stamps === 1 && r.body.points === 0, 'un programme à tampons donne un tampon, pas de points');
}

console.log(`\n✓ ${controls} contrôles : la fidélité de salle est liée à la vente.`);
