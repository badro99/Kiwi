#!/usr/bin/env node
/* Portefeuille de chèques et d'effets (functions/api/_cheques.js,
 * functions/api/cheques/*) contre le vrai schéma (schema.sql) dans node:sqlite.
 *
 *   · la table des passages : chaque passage permis passe, chaque passage
 *     interdit est un 409 qui rend les passages permis ;
 *   · idempotence : un geste rejoué n'écrit qu'une fois (historique, argent) ;
 *     une clé réutilisée pour autre chose est refusée ; deux appareils qui
 *     bougent le même chèque : un seul gagne ;
 *   · l'argent en centimes, solde avant et après : rejet, représentation,
 *     second rejet, encaissement après rejet, réglé autrement, contentieux,
 *     chèque émis (paiement, rejet, débit, annulation), tiers provisoire
 *     rattaché ; un encaissement normal n'écrit rien (la vente a déjà compté) ;
 *   · ancienneté : tranches de retard et mois à venir à leurs bords, « cette
 *     semaine », pastille par client, jour civil marocain (UTC+0) ;
 *   · cloisonnement et rôles : patron, opérateur, gérant (reçus seulement),
 *     caisse (enregistrer un reçu seulement), réception, employé, autre
 *     commerçant, anonyme, magasin suspendu ;
 *   · base sans 0029 : lecture calme (migrated:false), écriture 503. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importFresh = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { applySchema } = await importFresh('tools/d1-migrations.mjs');
const C = await importFresh('functions/api/_cheques.js');
const L = await importFresh('functions/api/_ledger.js');
const listRoute = await importFresh('functions/api/cheques/index.js');
const moveRoute = await importFresh('functions/api/cheques/move.js');
const editRoute = await importFresh('functions/api/cheques/edit.js');
const detailRoute = await importFresh('functions/api/cheques/detail.js');
const { makeSession, sessionCookie, tillToken, employeeToken, employeeCookie, operatorToken, operatorIdToken, DEMO_MERCHANTS } = await importFresh('functions/auth/_lib.js');

const SECRET = 'cheque-portfolio-secret-0123456789';
const SHOP = 'cheque-bench';
const OTHER = 'other-cheque-bench';
assert.ok(!DEMO_MERCHANTS[SHOP] && !DEMO_MERCHANTS[OTHER]);
const now = Date.now();

function makeEnv(db) {
  const D1 = {
    prepare(sql) {
      const params = [];
      const st = {
        bind(...a) { params.push(...a.map((x) => (x === undefined ? null : x))); return st; },
        async run() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
        async first() { const r = db.prepare(sql).get(...params); return r === undefined ? null : r; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        __run() { return db.prepare(sql).run(...params); },
      };
      return st;
    },
    async batch(list) {
      /* Une transaction, comme D1 : tout ou rien, instructions dans l'ordre. */
      db.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const s of list) { const r = s.__run(); out.push({ success: true, meta: { changes: Number(r.changes) } }); } db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
  return { DB: D1, AUTH_SECRET: SECRET };
}

const db = new DatabaseSync(':memory:');
applySchema(db);
const env = makeEnv(db);
const acc = db.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status) VALUES (?, ?, ?, 's', 'h', ?, 'active')`);
acc.run('acc-1', 'o@cheque.ma', 'Cheque Bench', now);
acc.run('acc-2', 'x@other.ma', 'Other Cheque Bench', now);
const cfg = db.prepare(`INSERT INTO merchant_config (merchant, features, plan, type, account_id, name, status, updated_ts) VALUES (?, '{}', 'pro', 'boutique', ?, ?, 'active', ?)`);
cfg.run(SHOP, 'acc-1', 'Cheque Bench', now);
cfg.run(OTHER, 'acc-2', 'Other Cheque Bench', now);
db.prepare(`INSERT INTO operators (id, label, salt, hash, created_ts) VALUES ('op-1', 'Support', '', '', 1)`).run();
db.prepare(`INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'team', ?, 1, ?)`)
  .run(SHOP, JSON.stringify({ members: [{ id: 'm1', name: 'Saad', function: 'Caissier' }, { id: 'm2', name: 'Mehdi', function: 'Gérant' }] }), now);
db.prepare(`INSERT INTO suppliers (merchant, id, name, created_ts, updated_ts) VALUES (?, 'sup-fassi', 'Atelier Fassi', ?, ?)`).run(SHOP, now, now);
db.prepare(`INSERT INTO suppliers (merchant, id, name, archived, created_ts, updated_ts) VALUES (?, 'sup-old', 'Ancien fournisseur', 1, ?, ?)`).run(SHOP, now, now);
db.prepare(`INSERT INTO suppliers (merchant, id, name, created_ts, updated_ts) VALUES (?, 'sup-other', 'Fournisseur ailleurs', ?, ?)`).run(OTHER, now, now);
db.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, ts, ref) VALUES ('sale-1', ?, 1250, 125000, 'cheque', ?, 'T-0001')`).run(SHOP, now);

const owner = sessionCookie(await makeSession('acc-1', SECRET));
const stranger = sessionCookie(await makeSession('acc-2', SECRET));
const tierCookie = async (sid, tier) => {
  db.prepare('INSERT INTO session_tiers (sid, account_id, tier, staff_id, updated_ts) VALUES (?, ?, ?, ?, ?)').run(sid, 'acc-1', tier, 'm2', now);
  return sessionCookie(await makeSession('acc-1', SECRET, 0, sid));
};
const managerTier = await tierCookie('d'.repeat(32), 'manager');
const receptionTier = await tierCookie('e'.repeat(32), 'reception');
const till = `kiwi_till=${await tillToken(SECRET, SHOP)}`;
const otherTill = `kiwi_till=${await tillToken(SECRET, OTHER)}`;
const cashier = employeeCookie(await employeeToken(SECRET, { merchant: SHOP, staffId: 'm1' }));
const operator = `kiwi_op=${await operatorToken(SECRET)}; kiwi_op_id=${await operatorIdToken(SECRET, 'op-1')}`;

const req = (url, cookie, body) => new Request('https://k' + url, {
  method: body ? 'POST' : 'GET',
  headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), 'CF-Connecting-IP': '10.0.0.9' },
  body: body ? JSON.stringify(body) : undefined,
});
const call = async (fn, url, cookie, body, e = env) => { const r = await fn({ request: req(url, cookie, body), env: e }); return { status: r.status, data: await r.json() }; };
let seq = 0;
const key = (p) => `${p || 'k'}-${String(++seq).padStart(6, '0')}`;
let n = 0;
const ok = (name) => { n++; console.log('  ✓ ' + name); };

const create = (body, cookie = owner) => call(listRoute.onRequestPost, '/api/cheques', cookie, { merchant: SHOP, idemKey: key('new'), ...body });
const move = (id, to, extra, cookie = owner) => call(moveRoute.onRequestPost, '/api/cheques/move', cookie, { merchant: SHOP, id, to, requestId: key('mv'), ...(extra || {}) });
const balance = async (type, id) => (await L.partyBalance(env, SHOP, type, id)).balanceCents;
const ledgerLines = (chequeId) => db.prepare('SELECT * FROM money_ledger WHERE merchant = ? AND cheque_id = ? ORDER BY rowid').all(SHOP, chequeId);
const histCount = (chequeId) => db.prepare('SELECT COUNT(*) AS n FROM cheque_history WHERE merchant = ? AND cheque_id = ?').get(SHOP, chequeId).n;

/* ── 1 · la table des passages, explicite et complète ──────────────── */
{
  const ALL = ['received', 'deposited', 'collected', 'rejected', 'in_litigation', 'replaced', 'cancelled', 'issued', 'debited'];
  const PATHS = {
    received: { received: [], deposited: ['deposited'], collected: ['deposited', 'collected'], rejected: ['deposited', 'rejected'],
      in_litigation: ['deposited', 'rejected', 'in_litigation'], replaced: ['replaced'], cancelled: ['cancelled'] },
    issued: { issued: [], debited: ['debited'], rejected: ['rejected'], replaced: ['rejected', 'replaced'], cancelled: ['cancelled'] },
  };
  let legal = 0, illegal = 0;
  for (const dir of ['received', 'issued']) {
    assert.deepEqual(Object.keys(PATHS[dir]).sort(), Object.keys(C.TRANSITIONS[dir]).sort(), dir + ': every status is reachable in the test');
    for (const [status, path] of Object.entries(PATHS[dir])) {
      const fresh = async () => {
        const made = await create(dir === 'issued' ? { direction: 'issued', amountCents: 10000, partyType: 'supplier', partyId: 'sup-fassi' } : { amountCents: 10000, partyName: 'Client table' });
        assert.equal(made.status, 200, JSON.stringify(made.data));
        for (const step of path) assert.equal((await move(made.data.cheque.id, step)).status, 200, dir + ' path ' + path.join('>'));
        return made.data.cheque.id;
      };
      for (const to of ALL) {
        const id = await fresh();
        const r = await move(id, to);
        if (C.TRANSITIONS[dir][status].includes(to)) {
          assert.equal(r.status, 200, `${dir} ${status} → ${to} is legal: ${JSON.stringify(r.data)}`);
          assert.equal(r.data.cheque.status, to);
          legal++;
        } else {
          assert.equal(r.status, 409, `${dir} ${status} → ${to} must be refused`);
          assert.equal(r.data.error, 'illegal-transition');
          assert.deepEqual(r.data.allowed, C.TRANSITIONS[dir][status], 'the refusal names the allowed next states');
          illegal++;
        }
      }
    }
  }
  assert.deepEqual(C.allowedNext('received', 'collected'), [], 'collected is read-only');
  assert.deepEqual(C.allowedNext('issued', 'debited'), [], 'debited is read-only');
  const coll = await create({ amountCents: 5000 });
  await move(coll.data.cheque.id, 'deposited'); await move(coll.data.cheque.id, 'collected');
  const ed = await call(editRoute.onRequestPost, '/api/cheques/edit', owner, { merchant: SHOP, id: coll.data.cheque.id, requestId: key('ed'), number: '999' });
  assert.equal(ed.status, 409); assert.equal(ed.data.error, 'read-only');
  ok(`transition table: ${legal} legal moves pass, ${illegal} illegal moves are 409 with the allowed next states; collected/debited read-only`);
}

/* ── 2 · idempotence et course entre deux appareils ────────────────── */
{
  const k = key('idem');
  const a = await create({ idemKey: k, amountCents: 42000, number: '1234567' });
  const b = await create({ idemKey: k, amountCents: 42000, number: '1234567' });
  assert.ok(a.data.ok && !a.data.duplicate && b.data.duplicate && b.data.cheque.id === a.data.cheque.id, 'create replay = same cheque');
  const clash = await create({ idemKey: k, amountCents: 99999 });
  assert.equal(clash.status, 409); assert.equal(clash.data.error, 'idempotency-conflict');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cheques WHERE merchant = ? AND idem_key = ?').get(SHOP, k).n, 1);
  const id = a.data.cheque.id;
  await move(id, 'deposited');
  const rid = key('tap');
  const first = await call(moveRoute.onRequestPost, '/api/cheques/move', owner, { merchant: SHOP, id, to: 'rejected', requestId: rid });
  const again = await call(moveRoute.onRequestPost, '/api/cheques/move', owner, { merchant: SHOP, id, to: 'rejected', requestId: rid });
  assert.equal(first.status, 200); assert.equal(again.status, 200);
  assert.ok(!first.data.duplicate && again.data.duplicate, 'double tap: the second is a duplicate');
  assert.equal(ledgerLines(id).length, 1, 'double tap posts the debt once');
  assert.equal(histCount(id), 3, 'create, deposit, reject: one row each');
  const reuse = await call(moveRoute.onRequestPost, '/api/cheques/move', owner, { merchant: SHOP, id, to: 'deposited', requestId: rid });
  assert.equal(reuse.status, 409); assert.equal(reuse.data.error, 'idempotency-conflict');
  /* Deux appareils, deux gestes différents, le même chèque au même instant. */
  const race = await create({ amountCents: 30000 });
  const today = await C.merchantDays(env, SHOP);
  const [r1, r2] = await Promise.all([
    C.moveCheque(env, SHOP, race.data.cheque.id, { to: 'deposited', requestId: key('dev1') }, { actor: 'A', today }),
    C.moveCheque(env, SHOP, race.data.cheque.id, { to: 'cancelled', requestId: key('dev2') }, { actor: 'B', today }),
  ]);
  const wins = [r1, r2].filter((r) => r.ok);
  assert.equal(wins.length, 1, 'exactly one device wins');
  const lost = [r1, r2].find((r) => !r.ok);
  assert.equal(lost.error, 'stale'); assert.equal(lost.status, 409);
  assert.equal(histCount(race.data.cheque.id), 2, 'one create + one move');
  ok('idempotency: create and move replays write once (one ledger line), reused keys refused, concurrent moves: one wins, the other is 409 stale');
}

/* ── 3 · l'argent, en centimes, avant et après ─────────────────────── */
{
  /* Chèque reçu pour une vente : l'encaissement n'écrit rien (la vente a compté). */
  const sale = await create({ amountCents: 125000, partyName: 'Hajar Bennani', number: '0040012', saleIds: ['sale-1'] });
  const pid = sale.data.cheque.partyId;
  assert.equal(pid, 'n:hajar-bennani');
  await move(sale.data.cheque.id, 'deposited'); await move(sale.data.cheque.id, 'collected');
  assert.equal(ledgerLines(sale.data.cheque.id).length, 0, 'a normal collection writes no money line');
  assert.equal(await balance('customer', pid), 0);

  /* Rejet, représentation, second rejet, encaissement. */
  const c1 = await create({ amountCents: 87550, partyName: 'Youssef Alami', number: '7788' });
  const p1 = c1.data.cheque.partyId;
  await move(c1.data.cheque.id, 'deposited');
  await move(c1.data.cheque.id, 'rejected', { reason: 'Provision insuffisante' });
  assert.equal(await balance('customer', p1), -87550, 'rejected: the customer owes 875,50 again');
  await move(c1.data.cheque.id, 'deposited');
  assert.equal(await balance('customer', p1), -87550, 're-presented: still owed until the money lands');
  await move(c1.data.cheque.id, 'rejected');
  assert.equal(await balance('customer', p1), -87550, 'second rejection: no second debt');
  await move(c1.data.cheque.id, 'deposited');
  await move(c1.data.cheque.id, 'collected');
  assert.equal(await balance('customer', p1), 0, 'collected after rejection: debt closed');
  const l1 = ledgerLines(c1.data.cheque.id);
  assert.deepEqual(l1.map((l) => [l.direction, l.kind, l.method, l.amount_cents]), [['out', 'cheque-rejected', 'cheque', 87550], ['in', 'repayment', 'cheque', 87550]]);
  assert.ok(!(await call(detailRoute.onRequestGet, `/api/cheques/detail?merchant=${SHOP}&id=${c1.data.cheque.id}`, owner)).data.cheque.debtOpen);

  /* Rejet puis réglé autrement (espèces). */
  const c2 = await create({ amountCents: 20000, partyName: 'Karim Tazi' });
  await move(c2.data.cheque.id, 'deposited'); await move(c2.data.cheque.id, 'rejected');
  assert.equal(await balance('customer', c2.data.cheque.partyId), -20000);
  await move(c2.data.cheque.id, 'replaced', { method: 'cash' });
  assert.equal(await balance('customer', c2.data.cheque.partyId), 0);
  assert.equal(ledgerLines(c2.data.cheque.id)[1].method, 'cash');

  /* Contentieux puis virement. */
  const c3 = await create({ amountCents: 1500001, partyName: 'Société Nord' });
  await move(c3.data.cheque.id, 'deposited'); await move(c3.data.cheque.id, 'rejected'); await move(c3.data.cheque.id, 'in_litigation');
  assert.equal(await balance('customer', c3.data.cheque.partyId), -1500001, 'litigation keeps the debt, no new line');
  assert.equal(ledgerLines(c3.data.cheque.id).length, 1);
  await move(c3.data.cheque.id, 'replaced', { method: 'transfer' });
  assert.equal(await balance('customer', c3.data.cheque.partyId), 0);

  /* Réglé autrement avant remise : aucune dette n'a existé, rien n'est écrit. */
  const c4 = await create({ amountCents: 9900, partyName: 'Sans dette' });
  await move(c4.data.cheque.id, 'replaced', { method: 'cash' });
  assert.equal(ledgerLines(c4.data.cheque.id).length, 0);

  /* Annuler un reçu dont la dette est ouverte : refusé (la dette resterait orpheline). */
  const c5 = await create({ amountCents: 4000, partyName: 'Dette ouverte' });
  await move(c5.data.cheque.id, 'deposited'); await move(c5.data.cheque.id, 'rejected'); await move(c5.data.cheque.id, 'deposited'); await move(c5.data.cheque.id, 'received');
  const cancel = await move(c5.data.cheque.id, 'cancelled');
  assert.equal(cancel.status, 409); assert.equal(cancel.data.error, 'debt-open');

  /* Sans tiers : la dette va sur un tiers provisoire, puis suit le client nommé. */
  const c6 = await create({ amountCents: 33300 });
  assert.equal(c6.data.cheque.partyId, '');
  await move(c6.data.cheque.id, 'deposited'); await move(c6.data.cheque.id, 'rejected');
  assert.equal(await balance('customer', 'cheque:' + c6.data.cheque.id), -33300);
  const named = await call(editRoute.onRequestPost, '/api/cheques/edit', owner, { merchant: SHOP, id: c6.data.cheque.id, requestId: key('ed'), partyName: 'Rachid Idrissi' });
  assert.equal(named.status, 200, JSON.stringify(named.data));
  assert.equal(await balance('customer', 'cheque:' + c6.data.cheque.id), 0);
  assert.equal(await balance('customer', 'n:rachid-idrissi'), -33300, 'the debt follows the named customer');
  const relock = await call(editRoute.onRequestPost, '/api/cheques/edit', owner, { merchant: SHOP, id: c6.data.cheque.id, requestId: key('ed'), partyName: 'Quelqu un d autre' });
  assert.equal(relock.status, 409); assert.equal(relock.data.error, 'party-locked', 'a real party with money lines is not moved');
  const amt = await call(editRoute.onRequestPost, '/api/cheques/edit', owner, { merchant: SHOP, id: c6.data.cheque.id, requestId: key('ed'), amountCents: 1 });
  assert.equal(amt.data.error, 'amount-locked');

  /* Chèque émis : c'est le paiement du fournisseur. */
  await L.postLedgerEntry(env, SHOP, { idemKey: 't:bill:1', amountCents: 300000, direction: 'in', partyType: 'supplier', partyId: 'sup-fassi', kind: 'bill' });
  const before = await balance('supplier', 'sup-fassi');
  const i1 = await create({ direction: 'issued', kind: 'lcn', amountCents: 120000, partyType: 'supplier', partyId: 'sup-fassi', number: 'LCN-881', dueDate: '2026-12-31' });
  assert.equal(i1.status, 200);
  assert.equal(i1.data.cheque.partyName, 'Atelier Fassi', 'the name comes from the supplier card, not the body');
  assert.equal(await balance('supplier', 'sup-fassi'), before - 120000, 'issued: the supplier is paid');
  await move(i1.data.cheque.id, 'rejected');
  assert.equal(await balance('supplier', 'sup-fassi'), before, 'our cheque bounced: we owe again');
  await move(i1.data.cheque.id, 'issued');
  assert.equal(await balance('supplier', 'sup-fassi'), before, 're-presented: still owed');
  await move(i1.data.cheque.id, 'debited');
  assert.equal(await balance('supplier', 'sup-fassi'), before - 120000, 'debited after rejection: paid once');
  assert.equal(ledgerLines(i1.data.cheque.id).length, 3);
  const i2 = await create({ direction: 'issued', amountCents: 50000, partyType: 'supplier', partyId: 'sup-fassi' });
  assert.equal(await balance('supplier', 'sup-fassi'), before - 170000);
  await move(i2.data.cheque.id, 'cancelled');
  assert.equal(await balance('supplier', 'sup-fassi'), before - 120000, 'cancelled before presentation: the payment never happened');
  const i3 = await create({ direction: 'issued', amountCents: 70000, partyType: 'supplier', partyId: 'sup-fassi' });
  await move(i3.data.cheque.id, 'rejected'); await move(i3.data.cheque.id, 'issued'); await move(i3.data.cheque.id, 'cancelled');
  assert.equal(await balance('supplier', 'sup-fassi'), before - 120000, 'cancelled after a rejection: the reopened debt stays due, counted once');
  const i4 = await create({ direction: 'issued', amountCents: 10000, partyType: 'supplier', partyId: 'sup-fassi' });
  await move(i4.data.cheque.id, 'rejected'); await move(i4.data.cheque.id, 'replaced', { method: 'transfer' });
  assert.equal(await balance('supplier', 'sup-fassi'), before - 130000);
  assert.equal((await create({ direction: 'issued', amountCents: 100, partyType: 'supplier', partyId: 'sup-old' })).status, 409, 'archived supplier refused');
  assert.equal((await create({ direction: 'issued', amountCents: 100, partyType: 'supplier', partyId: 'sup-other' })).status, 404, "another merchant's supplier is not ours");
  assert.equal((await create({ direction: 'issued', amountCents: 100 })).status, 404, 'issued needs a supplier card');
  for (const bad of [{ amountCents: 0 }, { amountCents: -5 }, { amount: '12,345' }, { dueDate: '2026-02-30' }, { kind: 'traite' }, { receptionDate: '2099-01-01' }]) {
    assert.equal((await create({ ...('amount' in bad ? {} : { amountCents: 100 }), ...bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await create({ amount: '1 250,50' })).data.cheque.amountCents, 125050, 'amount typed in dirhams with a comma');
  ok('money in centimes: collection writes nothing, rejection −, re-presentation and second rejection unchanged, collection/replacement close the debt, litigation, provisional party relinked, issued cheque = supplier payment (reject, re-present, debit, cancel before/after rejection)');
}

/* ── 4 · ancienneté, cette semaine, pastille, jour civil ───────────── */
{
  const T = '2026-11-21';
  const row = (due, cents, extra) => ({ status: 'received', direction: 'received', amount_cents: cents, due_date: due, reception_date: '2026-01-01', party_type: 'customer', party_id: 'n:a', party_name: 'A', debt_open: 0, ...(extra || {}) });
  const rows = [
    row('2026-11-20', 100), row('2026-10-22', 200), row('2026-10-21', 300), row('2026-09-22', 400), row('2026-09-21', 500),
    row('2026-08-23', 600), row('2026-08-22', 700),
    row('2026-11-21', 1000), row('2026-11-30', 2000), row('2026-12-01', 3000), row('2027-04-30', 4000), row('2027-05-01', 5000), row('2030-01-01', 6000),
    row('2026-11-10', 7000, { status: 'deposited' }), row('2026-11-10', 8000, { direction: 'issued', status: 'issued' }),
    row(null, 9000, { reception_date: '2026-11-21' }),
  ];
  const age = C.chequeAgeing(rows, T);
  /* 1 j, 30 j → 1-30 ; 31, 60 → 31-60 ; 61, 90 → 61-90 ; 91 → 90+. */
  assert.deepEqual(age.overdue.map((b) => [b.key, b.count, b.cents]), [['1-30', 2, 300], ['31-60', 2, 700], ['61-90', 2, 1100], ['90+', 1, 700]]);
  assert.equal(age.overdueCents, 2800); assert.equal(age.oldestDays, 91);
  assert.deepEqual(age.upcoming.map((b) => b.month), ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
  /* Aujourd'hui (et un chèque à vue reçu aujourd'hui) = ce mois ; au-delà du sixième mois : le dernier. */
  assert.deepEqual(age.upcoming.map((b) => b.cents), [1000 + 2000 + 9000, 3000, 0, 0, 0, 4000 + 5000 + 6000]);
  const yearEdge = C.chequeAgeing([row('2027-01-01', 10)], '2026-12-31');
  assert.equal(yearEdge.upcoming[1].cents, 10, 'month index crosses the year');
  const s = C.chequeSummary(rows, T);
  assert.equal(s.inHand.count, 14); assert.equal(s.deposited.cents, 7000); assert.equal(s.issued.cents, 8000);
  const week = C.chequeSummary([row('2026-11-27', 1), row('2026-11-28', 2), row('2026-11-20', 4)], T).thisWeek;
  assert.deepEqual([week.count, week.cents, week.lateCount, week.lateCents], [2, 5, 1, 4], 'this week = due up to today + 6, late included and counted');
  const badge = C.chequeSummary([row('2026-12-01', 100), row('2026-11-25', 50), row('2026-11-25', 70, { party_id: 'n:b', party_name: 'B' }), row('2026-11-25', 999, { status: 'deposited' })], T).byParty;
  assert.deepEqual(badge.map((p) => [p.partyId, p.count, p.cents, p.nextDue]), [['n:a', 2, 150, '2026-11-25'], ['n:b', 1, 70, '2026-11-25']], 'per-customer badge: in-hand count and sum only');
  /* Jour civil marocain : UTC+0 depuis le 20 sept. 2026 (la loi des fuseaux corrige un Node ancien). */
  db.prepare("UPDATE merchant_config SET timezone = 'Africa/Casablanca' WHERE merchant = ?").run(SHOP);
  const late = await C.merchantDays(env, SHOP, Date.UTC(2026, 10, 21, 23, 30));
  assert.equal(late.civil, '2026-11-21', '23:30 UTC is still the 21st in Casablanca (UTC+0)');
  const night = await C.merchantDays(env, SHOP, Date.UTC(2026, 10, 22, 3, 0));
  assert.equal(night.civil, '2026-11-22'); assert.equal(night.business, '2026-11-21', 'reception at 3 h belongs to the till day before (5 h cut-off)');
  ok('ageing: overdue 1-30/31-60/61-90/90+ at their edges, six calendar months with overflow, received-in-hand only; this week; per-customer badge; Moroccan civil day at UTC+0');
}

/* ── 5 · cloisonnement et rôles ────────────────────────────────────── */
{
  const mine = await create({ amountCents: 11100, partyName: 'Client privé', number: 'SECRET-NUM' });
  const id = mine.data.cheque.id;
  const issued = await create({ direction: 'issued', amountCents: 22200, partyType: 'supplier', partyId: 'sup-fassi', number: 'ISSUED-NUM' });
  /* Lecture */
  assert.equal((await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}`, owner)).status, 200);
  assert.equal((await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}`, operator)).status, 200, 'operator reads for support');
  const mgr = await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}`, managerTier);
  assert.equal(mgr.status, 200);
  assert.ok(mgr.data.cheques.every((c) => c.direction === 'received') && !JSON.stringify(mgr.data).includes('ISSUED-NUM'), 'manager never sees issued cheques');
  assert.deepEqual(mgr.data.suppliers, [], 'manager gets no supplier list');
  for (const [who, c] of [['till', till], ['cashier', cashier], ['reception tier', receptionTier], ['another merchant', stranger], ['anonymous', '']]) {
    const r = await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}`, c);
    assert.equal(r.status, 403, who + ' list');
    assert.ok(!JSON.stringify(r.data).includes('SECRET-NUM'), who + ' sees nothing');
    assert.equal((await call(detailRoute.onRequestGet, `/api/cheques/detail?merchant=${SHOP}&id=${id}`, c)).status, 403, who + ' detail');
    assert.equal((await move(id, 'deposited', {}, c)).status, 403, who + ' move');
  }
  /* L'autre patron, sur SON magasin, n'atteint pas notre chèque. */
  assert.equal((await call(detailRoute.onRequestGet, `/api/cheques/detail?merchant=${OTHER}&id=${id}`, stranger)).status, 404);
  assert.equal((await call(moveRoute.onRequestPost, '/api/cheques/move', stranger, { merchant: OTHER, id, to: 'deposited', requestId: key('x') })).status, 404);
  assert.equal((await call(editRoute.onRequestPost, '/api/cheques/edit', stranger, { merchant: OTHER, id, requestId: key('x'), number: 'pwned' })).status, 404);
  const otherList = await call(listRoute.onRequestGet, `/api/cheques?merchant=${OTHER}`, stranger);
  assert.ok(!JSON.stringify(otherList.data).includes('SECRET-NUM'));
  /* Gérant : reçus oui, émis non. */
  assert.equal((await move(id, 'deposited', {}, managerTier)).status, 200, 'manager moves a received cheque');
  assert.equal((await move(issued.data.cheque.id, 'debited', {}, managerTier)).status, 403, 'manager cannot move an issued cheque');
  assert.equal((await call(detailRoute.onRequestGet, `/api/cheques/detail?merchant=${SHOP}&id=${issued.data.cheque.id}`, managerTier)).status, 404, 'issued cheque invisible to the manager');
  assert.equal((await create({ direction: 'issued', amountCents: 100, partyType: 'supplier', partyId: 'sup-fassi' }, managerTier)).status, 403);
  assert.equal((await create({ amountCents: 100 }, managerTier)).status, 200);
  /* Caisse : enregistrer un reçu, rien d'autre. */
  const tilled = await call(listRoute.onRequestPost, '/api/cheques', till, { merchant: SHOP, idemKey: key('till'), amountCents: 64000, number: '5550001', drawerName: 'Nadia', dueDate: '2026-12-15', saleIds: ['sale-1'], by: 'Saad' });
  assert.equal(tilled.status, 200, JSON.stringify(tilled.data));
  assert.equal(tilled.data.cheque.source, 'till'); assert.equal(tilled.data.cheque.createdBy, 'Caisse · Saad');
  assert.equal((await call(listRoute.onRequestPost, '/api/cheques', till, { merchant: SHOP, idemKey: key('till'), direction: 'issued', amountCents: 100, partyType: 'supplier', partyId: 'sup-fassi' })).status, 403, 'a till cannot issue');
  assert.equal((await call(listRoute.onRequestPost, '/api/cheques', otherTill, { merchant: SHOP, idemKey: key('till'), amountCents: 100 })).status, 403, "another shop's till");
  assert.equal((await call(listRoute.onRequestPost, '/api/cheques', till, { merchant: OTHER, idemKey: key('till'), amountCents: 100 })).status, 403, 'a till names another shop');
  for (const c of [cashier, receptionTier, stranger, '']) assert.equal((await call(listRoute.onRequestPost, '/api/cheques', c, { merchant: SHOP, idemKey: key('evil'), amountCents: 100 })).status, 403);
  /* Le commerçant du corps n'est jamais cru seul : le patron de OTHER écrit chez lui, pas chez SHOP. */
  const before = db.prepare('SELECT COUNT(*) AS n FROM cheques WHERE merchant = ?').get(SHOP).n;
  assert.equal((await call(listRoute.onRequestPost, '/api/cheques', stranger, { merchant: SHOP, idemKey: key('evil'), amountCents: 100 })).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cheques WHERE merchant = ?').get(SHOP).n, before);
  /* Un tiers fournisseur écrit au grand livre fournisseurs : patron et opérateur seulement. */
  const supLines = () => db.prepare("SELECT COUNT(*) AS n FROM money_ledger WHERE merchant = ? AND party_type = 'supplier'").get(SHOP).n;
  const supBefore = supLines();
  for (const [who, c] of [['manager', managerTier], ['till', till]]) {
    const r = await call(listRoute.onRequestPost, '/api/cheques', c, { merchant: SHOP, idemKey: key('sup'), amountCents: 100, partyType: 'supplier', partyId: 'sup-fassi' });
    assert.equal(r.status, 403, who + ' cannot create a supplier-party cheque, even received');
    assert.equal(r.data.error, 'supplier-owner-only');
  }
  const edit = (body, cookie = owner) => call(editRoute.onRequestPost, '/api/cheques/edit', cookie, { merchant: SHOP, requestId: key('ed'), ...body });
  const plain = (await create({ amountCents: 4200, partyName: 'Client simple' })).data.cheque;
  const mEd = await edit({ id: plain.id, partyType: 'supplier', partyId: 'sup-fassi', partyName: 'Faux nom' }, managerTier);
  assert.equal(mEd.status, 403, 'manager cannot relink a received cheque to a supplier');
  assert.equal(mEd.data.error, 'supplier-owner-only');
  assert.equal((await edit({ id: plain.id, partyType: 'supplier', partyId: 'sup-nope' })).status, 404, 'owner: unknown supplier refused');
  assert.equal((await edit({ id: plain.id, partyType: 'supplier', partyId: 'sup-other' })).status, 404, "owner: another merchant's supplier refused");
  assert.equal((await edit({ id: plain.id, partyType: 'supplier', partyId: 'sup-old' })).status, 409, 'owner: archived supplier refused');
  assert.equal((await edit({ id: plain.id, partyType: 'supplier', partyId: '' })).status, 400, 'owner: supplier without id refused');
  const okEd = await edit({ id: plain.id, partyType: 'supplier', partyId: 'sup-fassi', partyName: 'Nom inventé' });
  assert.equal(okEd.status, 200, JSON.stringify(okEd.data));
  assert.equal(okEd.data.cheque.partyType, 'supplier');
  assert.equal(okEd.data.cheque.partyName, 'Atelier Fassi', 'the name comes from the supplier card, never from the body');
  const mBack = await edit({ id: plain.id, partyName: 'Client simple' }, managerTier);
  assert.equal(mBack.status, 403, 'manager cannot relink a supplier-party cheque either');
  assert.equal(supLines(), supBefore, 'no supplier ledger line was written by the refused calls');
  /* Magasin suspendu : lecture oui, écriture non. */
  db.prepare("UPDATE merchant_config SET status = 'suspended' WHERE merchant = ?").run(SHOP);
  assert.equal((await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}`, owner)).status, 200);
  assert.equal((await create({ amountCents: 100 })).status, 403);
  assert.equal((await call(listRoute.onRequestPost, '/api/cheques', till, { merchant: SHOP, idemKey: key('till'), amountCents: 100 })).status, 403);
  db.prepare("UPDATE merchant_config SET status = 'active' WHERE merchant = ?").run(SHOP);
  ok('roles and tenants: owner + operator all; manager received only (issued invisible); till records received only; supplier parties owner-only on create and edit (name from the card, missing/archived/other-tenant refused); cashier, reception, other merchant, other till, anonymous refused; suspended shop read-only');
}

/* ── 6 · bordereau, modification, détail ───────────────────────────── */
{
  const a = await create({ amountCents: 10050, number: 'A1', partyName: 'Slip A' });
  const b = await create({ amountCents: 20025, number: 'B2', partyName: 'Slip B' });
  const c = await create({ amountCents: 5000, number: 'C3' });
  await move(c.data.cheque.id, 'deposited');
  const rq = key('slip');
  const body = { merchant: SHOP, action: 'deposit', ids: [a.data.cheque.id, b.data.cheque.id, c.data.cheque.id], bank: 'Attijariwafa bank, agence Maarif', requestId: rq };
  const slip = await call(moveRoute.onRequestPost, '/api/cheques/move', owner, body);
  assert.equal(slip.status, 200, JSON.stringify(slip.data));
  assert.match(slip.data.slip, /^BR-\d{8}-[A-Z0-9]{6}$/);
  assert.equal(slip.data.totalCents, 30075, 'slip total = the two cheques it took');
  assert.deepEqual(slip.data.results.filter((r) => !r.ok).map((r) => r.error), ['illegal-transition'], 'an already deposited cheque is refused, the others go');
  assert.ok(slip.data.cheques.every((x) => x.bank === 'Attijariwafa bank, agence Maarif' && x.depositSlip === slip.data.slip));
  const replay = await call(moveRoute.onRequestPost, '/api/cheques/move', owner, body);
  assert.equal(replay.data.slip, slip.data.slip);
  assert.equal(histCount(a.data.cheque.id), 2, 'slip replay deposits nothing twice');
  const bySlip = await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}&slip=${slip.data.slip}`, owner);
  assert.equal(bySlip.data.cheques.length, 2);
  /* Modification : historique, montant libre tant que le chèque dort au portefeuille. */
  const d = await create({ amountCents: 1000, number: 'D4' });
  const e1 = await call(editRoute.onRequestPost, '/api/cheques/edit', owner, { merchant: SHOP, id: d.data.cheque.id, requestId: key('ed'), amount: '15,75', dueDate: '2027-01-15', drawerBank: 'CIH', reason: 'faute de frappe' });
  assert.equal(e1.status, 200); assert.equal(e1.data.cheque.amountCents, 1575); assert.deepEqual(e1.data.changed.sort(), ['amount', 'drawerBank', 'dueDate']);
  const det = await call(detailRoute.onRequestGet, `/api/cheques/detail?merchant=${SHOP}&id=${d.data.cheque.id}`, owner);
  assert.deepEqual(det.data.history.map((h) => [h.action, h.from, h.to]), [['create', '', 'received'], ['edit', 'received', 'received']]);
  assert.equal(det.data.history[1].reason, 'faute de frappe');
  assert.deepEqual(det.data.cheque.allowed, ['deposited', 'replaced', 'cancelled']);
  const withSale = (await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}&q=5550001`, owner)).data.cheques[0];
  const sd = await call(detailRoute.onRequestGet, `/api/cheques/detail?merchant=${SHOP}&id=${withSale.id}`, owner);
  assert.deepEqual(sd.data.sales.map((s) => [s.id, s.amountCents, s.ref]), [['sale-1', 125000, 'T-0001']], 'the cheque shows the ticket it paid');
  /* Filtres : statut, tiers, dates, recherche. */
  const rej = await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}&status=rejected,in_litigation`, owner);
  assert.ok(rej.data.cheques.length && rej.data.cheques.every((x) => ['rejected', 'in_litigation'].includes(x.status)));
  const party = await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}&party=customer|n:slip-a`, owner);
  assert.deepEqual(party.data.cheques.map((x) => x.number), ['A1']);
  const list = await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}&status=received`, owner);
  const dates = list.data.cheques.map((x) => x.dueDate || x.depositDate || x.receptionDate);
  assert.deepEqual(dates, dates.slice().sort(), 'sorted by due date, then deposit, then reception');
  assert.ok(list.data.summary && list.data.ageing && Array.isArray(list.data.suppliers) && list.data.suppliers.some((s) => s.id === 'sup-fassi'));
  ok('deposit slip (number, total, per-cheque refusal, replay safe, bank), edits with history, detail with timeline, allowed moves and linked ticket, filters and due-date order');
}

/* ── 7 · base sans 0029 : calme en lecture, 503 en écriture ────────── */
{
  const old = new DatabaseSync(':memory:');
  applySchema(old);
  old.exec('DROP TABLE cheque_history; DROP TABLE cheque_links; DROP TABLE cheques;');
  old.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status) VALUES ('acc-1', 'o@cheque.ma', 'Cheque Bench', 's', 'h', ?, 'active')`).run(now);
  old.prepare(`INSERT INTO merchant_config (merchant, features, plan, type, account_id, name, status, updated_ts) VALUES (?, '{}', 'pro', 'boutique', 'acc-1', 'Cheque Bench', 'active', ?)`).run(SHOP, now);
  const oldEnv = makeEnv(old);
  const g = await call(listRoute.onRequestGet, `/api/cheques?merchant=${SHOP}`, owner, null, oldEnv);
  assert.equal(g.status, 200); assert.equal(g.data.migrated, false); assert.deepEqual(g.data.cheques, []);
  const p = await call(listRoute.onRequestPost, '/api/cheques', owner, { merchant: SHOP, idemKey: key('old'), amountCents: 100 }, oldEnv);
  assert.equal(p.status, 503); assert.equal(p.data.error, 'unmigrated');
  assert.equal((await call(moveRoute.onRequestPost, '/api/cheques/move', owner, { merchant: SHOP, id: 'chq_000000000000000000', to: 'deposited', requestId: key('old') }, oldEnv)).status, 503);
  assert.equal((await call(detailRoute.onRequestGet, `/api/cheques/detail?merchant=${SHOP}&id=chq_000000000000000000`, owner, null, oldEnv)).status, 503);
  assert.equal(await C.chequesReady(oldEnv), false);
  ok('missing 0029: GET answers migrated:false with an empty list, writes answer 503 unmigrated');
}

console.log(`\n${n} groups green (cheque portfolio).`);
