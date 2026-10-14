#!/usr/bin/env node
/* Annulation d'une vente · la vraie route, sur une vraie base.
 *
 * 2026-10-12. Ce fichier existait déjà, mais il ne tournait plus : son faux D1
 * n'avait pas de `batch`, et la route refuse désormais (à raison) d'annuler
 * sur un adaptateur incapable d'écrire l'annulation et sa ligne d'audit dans
 * une même transaction. Personne ne l'avait vu, parce que check.js ne le
 * nommait pas. Il exécute maintenant functions/api/sale/cancel.js sur le
 * schéma complet (schema.sql) chargé dans un SQLite en mémoire.
 *
 * Les codes à quatre chiffres ci-dessous sont des valeurs de banc, inventées
 * pour ce fichier ; ils ne correspondent à aucun commerçant.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestPost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/sale/cancel.js')).href);
const { makeSession, SESS_COOKIE, TILL_COOKIE, tillToken } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

const SECRET = 'cashier-cancel-bench-secret-0123';
const SHOP = 'cafe-annulation-banc';
const OTHER = 'boutique-voisine-banc';
const CODES = { manager: '7314', caisse: '7315', serveur: '7316', voisin: '7317' };
const H = 3600000;
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

function world({ batch = true } = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const now = Date.now();
  sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run('acc-banc', 'o@banc.invalid', 'Café Banc', 's', 'h', now);
  sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run('acc-voisin', 'v@banc.invalid', 'Voisin', 's', 'h', now);
  sql.prepare(`INSERT INTO merchant_config (merchant, features, plan, type, account_id, name, updated_ts) VALUES (?,?,?,?,?,?,?)`).run(SHOP, '{}', 'pro', 'restaurant', 'acc-banc', 'Café Banc', now);
  sql.prepare(`INSERT INTO merchant_config (merchant, features, plan, type, account_id, name, updated_ts) VALUES (?,?,?,?,?,?,?)`).run(OTHER, '{}', 'pro', 'boutique', 'acc-voisin', 'Voisin', now);
  const pin = sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)');
  pin.run('pin-sara', SHOP, CODES.manager, 'Sara', 'Manager', now);
  pin.run('pin-yassine', SHOP, CODES.caisse, 'Yassine', 'Caisse', now);
  pin.run('pin-omar', SHOP, CODES.serveur, 'Omar', 'Serveur', now);
  pin.run('pin-leila', OTHER, CODES.voisin, 'Leila', 'Manager', now);
  const sale = sql.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines) VALUES (?,?,?,?,?,?,?,?,?)`);
  sale.run('sale-42', SHOP, 250, 25000, 'cash', 'Table 4', '1042', now - 60000, '[{"n":"Tajine","q":1,"t":250}]');
  sale.run('sale-43', SHOP, 90, 9000, 'card', 'À emporter', '1043', now - 120000, '[{"n":"Thé","q":3,"t":90}]');
  sale.run('sale-old', SHOP, 120, 12000, 'cash', 'Table 2', '0990', now - 40 * H, '[{"n":"Couscous","q":1,"t":120}]');
  sale.run('sale-voisin', OTHER, 300, 30000, 'card', 'Robe', 'B-7', now - 60000, '[{"n":"Robe","q":1,"t":300}]');

  const DB = {
    prepare(query) {
      const statement = sql.prepare(query);
      const bound = (args = []) => ({
        first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args) }),
        run: async () => { const r = statement.run(...args); return { success: true, meta: { changes: r.changes } }; },
        runSync: () => { const r = statement.run(...args); return { success: true, meta: { changes: r.changes } }; },
      });
      return { ...bound(), bind: (...args) => bound(args) };
    },
  };
  if (batch) {
    DB.batch = async (statements) => {
      sql.exec('BEGIN IMMEDIATE');
      try { const out = statements.map((s) => s.runSync()); sql.exec('COMMIT'); return out; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    };
  }
  const row = (id) => sql.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  const audits = (id) => sql.prepare('SELECT * FROM sale_audit WHERE sale_id = ? ORDER BY id').all(id);
  return { sql, env: { DB, AUTH_SECRET: SECRET }, row, audits };
}

const till = async (merchant) => `${TILL_COOKIE}=${await tillToken(SECRET, merchant)}`;
const owner = async (aid) => `${SESS_COOKIE}=${await makeSession(aid, SECRET)}`;
const cancel = (w, body, cookie) => onRequestPost({ env: w.env, request: new Request('https://kiwi.test/api/sale/cancel', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.7', ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(body),
}) });
const shopTill = await till(SHOP);

/* 1 · Qui ne peut pas annuler */
{
  const w = world();
  const waiter = await cancel(w, { merchant: SHOP, id: 'sale-42', pin: CODES.serveur }, shopTill);
  const cashier = await cancel(w, { merchant: SHOP, id: 'sale-42', pin: CODES.caisse }, shopTill);
  const cashierBody = await cashier.json();
  check(waiter.status === 403 && cashier.status === 403 && cashierBody.error === 'manager-required', 'a waiter code and a cashier code cannot void a completed sale (manager required)');
  const wrong = await cancel(w, { merchant: SHOP, id: 'sale-42', pin: '0000' }, shopTill);
  check(wrong.status === 401, 'a code that matches nobody is refused');
  const unpaired = await cancel(w, { merchant: SHOP, id: 'sale-42', pin: CODES.manager });
  check(unpaired.status === 403, 'a manager code typed on a device that is not this shop\'s paired till is refused');
  const foreign = await cancel(w, { merchant: SHOP, id: 'sale-42', pin: CODES.voisin }, shopTill);
  check(foreign.status === 401, 'a manager code from ANOTHER merchant\'s account does not open this till');
  check(!w.row('sale-42').void_ts && w.audits('sale-42').length === 0, 'none of the refusals voided the sale or wrote an audit row');
  const text = JSON.stringify([cashierBody]);
  check(!Object.values(CODES).some((c) => text.includes(c)), 'no refusal echoes a code back');
}

/* 2 · Le manager annule : la vente reste, marquée, avec sa trace */
{
  const w = world();
  const res = await cancel(w, { merchant: SHOP, id: 'sale-42', pin: CODES.manager, reason: 'client parti' }, shopTill);
  const body = await res.json();
  check(res.status === 200 && body.ok && body.actor === 'Sara' && body.amountCents === 25000, 'a manager code voids the sale and the answer names who did it, with the exact amount');
  const sale = w.row('sale-42');
  check(sale && sale.void_ts === body.ts && sale.void_actor === 'Sara' && sale.void_actor_id === 'staff:pin-sara', 'the sale row is kept, marked void, by Sara (an id, never a code)');
  const trail = w.audits('sale-42');
  check(trail.length === 1 && trail[0].action === 'void' && trail[0].actor === 'Sara' && trail[0].amount_cents === 25000 && trail[0].reason === 'client-parti', 'exactly one audit row: void, Sara, 250,00 MAD, the reason as given');
  check(JSON.parse(trail[0].impact).lines[0].name === 'Tajine', 'the audit keeps what was in the basket');
  check(!JSON.stringify(body).includes(CODES.manager) && !JSON.stringify(trail).includes(CODES.manager), 'the manager code appears neither in the answer nor in the audit');

  const again = await cancel(w, { merchant: SHOP, id: 'sale-42', pin: CODES.manager }, shopTill);
  check(again.status === 409 && (await again.json()).error === 'already-cancelled' && w.audits('sale-42').length === 1, 'a second tap answers « already cancelled » and writes no second audit row');

  /* La course : deux caisses lisent la vente avant qu'aucune n'écrive. On rejoue
   * la seconde avec la ligne telle qu'elle était lue, void_ts encore vide. */
  const stale = { ...w.row('sale-43') };
  const first = await cancel(w, { merchant: SHOP, id: 'sale-43', pin: CODES.manager }, shopTill);
  const realPrepare = w.env.DB.prepare;
  w.env.DB.prepare = (q) => (/FROM sales WHERE id = \? AND merchant = \?/.test(q)
    ? { bind: () => ({ first: async () => stale }) } : realPrepare(q));
  const second = await cancel(w, { merchant: SHOP, id: 'sale-43', pin: CODES.manager }, shopTill);
  w.env.DB.prepare = realPrepare;
  check(first.status === 200 && second.status === 409, 'two tills racing on one sale: the first voids it, the second is told it is already cancelled');
  check(w.audits('sale-43').length === 1, 'and the race leaves exactly one audit row, not two (the update is guarded by void_ts IS NULL, the audit by changes() = 1)');
}

/* 3 · Les bornes : l'âge pour la caisse, le commerçant pour le propriétaire */
{
  const w = world();
  const old = await cancel(w, { merchant: SHOP, id: 'sale-old', pin: CODES.manager }, shopTill);
  check(old.status === 409 && (await old.json()).error === 'sale-too-old' && !w.row('sale-old').void_ts, 'the till cannot void a sale older than 36 h, even with a manager code');
  const cross = await cancel(w, { merchant: SHOP, id: 'sale-voisin', pin: CODES.manager }, shopTill);
  check(cross.status === 404 && !w.row('sale-voisin').void_ts, 'a till cannot reach another merchant\'s sale by its id');

  const stranger = await cancel(w, { merchant: SHOP, id: 'sale-old', source: 'dashboard' }, await owner('acc-voisin'));
  check(stranger.status === 403 && !w.row('sale-old').void_ts, 'another account\'s dashboard cannot void this shop\'s sale');
  const dash = await cancel(w, { merchant: SHOP, id: 'sale-old', source: 'dashboard' }, await owner('acc-banc'));
  const trail = w.audits('sale-old');
  check(dash.status === 200 && w.row('sale-old').void_ts && trail.length === 1 && trail[0].actor_id === 'account:acc-banc' && trail[0].reason === 'dashboard-cancel', 'the owner\'s dashboard may void an older sale from the period under review, and the audit says it was the owner');
}

/* 4 · L'annulation et sa trace sont une seule écriture */
{
  const w = world();
  w.sql.exec('ALTER TABLE sale_audit RENAME TO sale_audit_gone');
  const res = await cancel(w, { merchant: SHOP, id: 'sale-42', pin: CODES.manager }, shopTill);
  check(res.status === 500 && !w.row('sale-42').void_ts, 'when the audit row cannot be written, the void is rolled back: no sale is cancelled without its trace');

  const plain = world({ batch: false });
  const refused = await cancel(plain, { merchant: SHOP, id: 'sale-42', pin: CODES.manager }, shopTill);
  check(refused.status === 503 && (await refused.json()).error === 'atomic-cancel-unavailable' && !plain.row('sale-42').void_ts, 'a database adapter without transactions is refused before anything is written');
}

console.log(`\ncashier-cancel: ${checks} passed, 0 failed`);
