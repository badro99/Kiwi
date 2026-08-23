#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Gardes d'identité de locataire et d'intégrité comptable
 *
 * Ce banc garde les correctifs de l'audit serveur du 2026-08-23. Chacun
 * répond à un chemin par lequel un compte pouvait atteindre le commerce d'un
 * autre, ou écrire dans les livres quelque chose que le serveur n'avait jamais
 * vérifié :
 *
 *   1. le slug de locataire dérive de `accounts.business`, que l'utilisateur
 *      choisit — s'inscrire sous le nom d'une enseigne existante suffisait ;
 *   2. la facture ne confrontait ni son montant ni son millésime à la vente ;
 *   3. le fond de caisse attendu était purement déclaratif ;
 *   4. le compteur de tickets se laissait empoisonner par un plancher demandé.
 *
 * Aucun code, aucun PIN, aucun mot de passe n'apparaît ici : les gardes
 * répondent par une identité ou par un refus, jamais par un secret.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { slugClaimedByOther, entitledMerchant, makeSession, SESS_COOKIE, slugMerchant } from '../functions/auth/_lib.js';
import { tenantFor } from '../functions/api/_private.js';
import { getOrCreateSaleInvoice } from '../functions/api/invoice.js';
import { onRequestPost as postCashEvent } from '../functions/api/cash-sessions.js';
import { reserveTicketRange } from '../functions/api/ticket-sequence.js';

const SECRET = 'tenant-guard-test-secret-32-bytes!!';
let failures = 0;
let checks = 0;
function ok(label, cond, detail) {
  checks++;
  if (cond) console.log('  ✓ ' + label);
  else { failures++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}
console.log('■ Gardes de locataire et d\'intégrité (tools/tenant-guard-test.mjs)');

/* Une base D1 de comptoir : on ne modélise que les requêtes que les gardes
 * posent réellement, et on laisse tomber le reste plutôt que de mentir. */
function makeDb(state) {
  const rows = state || {};
  return {
    _writes: [],
    prepare(sql) {
      const q = String(sql).replace(/\s+/g, ' ').trim();
      const stmt = {
        args: [],
        bind(...a) { stmt.args = a; return stmt; },
        async run() {
          if (rows.throwOnWrite) throw new Error('db-down');
          rows.__db._writes.push({ q, args: stmt.args });
          return { success: true, meta: { changes: 1 } };
        },
        async all() { return { results: [] }; },
        async first() {
          if (rows.throwOnRead) throw new Error('db-down');
          if (q.startsWith('SELECT account_id FROM merchant_config')) {
            const owner = (rows.registry || {})[stmt.args[0]];
            return owner === undefined ? null : { account_id: owner };
          }
          if (q.startsWith('SELECT business FROM accounts')) {
            const acc = (rows.accounts || {})[stmt.args[0]];
            return acc ? { business: acc } : null;
          }
          return null;
        },
      };
      return stmt;
    },
    async batch(stmts) { return stmts.map(() => ({ success: true })); },
  };
}
function db(state) { const d = makeDb(state); state.__db = d; return d; }

/* ── 1 · slugClaimedByOther : refuse SEULEMENT sur une réponse positive ───── */
{
  const claimed = db({ registry: { 'amira-cafe': 'acc-9' } });
  ok('un slug nommément détenu par un autre compte est refusé',
    (await slugClaimedByOther({ DB: claimed }, 'amira-cafe', 'acc-1')) === true);
  ok('le propriétaire lui-même n\'est jamais refusé',
    (await slugClaimedByOther({ DB: claimed }, 'amira-cafe', 'acc-9')) === false);

  const unclaimed = db({ registry: { 'amira-cafe': '' } });
  ok('une boutique jamais revendiquée rend la main comme avant',
    (await slugClaimedByOther({ DB: unclaimed }, 'amira-cafe', 'acc-1')) === false);

  const noRow = db({ registry: {} });
  ok('un registre sans la ligne ne ferme la porte à personne',
    (await slugClaimedByOther({ DB: noRow }, 'amira-cafe', 'acc-1')) === false);

  const down = db({ throwOnRead: true });
  ok('base muette : la garde s\'ouvre, elle n\'enferme pas dehors',
    (await slugClaimedByOther({ DB: down }, 'amira-cafe', 'acc-1')) === false);
}

/* ── 2 · entitledMerchant et tenantFor : le nom d'enseigne ne suffit plus ─── */
async function sessionRequest(aid) {
  const token = await makeSession(aid, SECRET);
  return new Request('https://kiwi.test/api/x', { headers: { cookie: `${SESS_COOKIE}=${token}` } });
}
{
  const usurper = await sessionRequest('acc-usurper');
  const env = {
    AUTH_SECRET: SECRET,
    DB: db({
      accounts: { 'acc-usurper': 'Café Amira', 'acc-real': 'Café Amira' },
      registry: { 'cafe-amira': 'acc-real' },
    }),
  };
  const slug = slugMerchant('Café Amira');
  ok('deux comptes peuvent dériver le même slug (la faille d\'origine)',
    slug === slugMerchant('cafe amira') && slug === 'cafe-amira', slug);
  ok('entitledMerchant refuse un slug que le registre donne à un autre',
    (await entitledMerchant(usurper, env, slug)) === '');
  ok('tenantFor refuse le même chemin',
    (await tenantFor(usurper, env, slug)) === '');

  const owner = await sessionRequest('acc-real');
  ok('le vrai propriétaire garde sa boutique',
    (await entitledMerchant(owner, env, slug)) === slug);
  ok('tenantFor rend la boutique au propriétaire',
    (await tenantFor(owner, env, slug)) === slug);
}

/* ── 3 · La facture est confrontée à la vente ─────────────────────────────── */
function invoiceEnv(sale) {
  const stored = [];
  return {
    _stored: stored,
    DB: {
      prepare(sql) {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        const stmt = {
          args: [],
          bind(...a) { stmt.args = a; return stmt; },
          async run() {
            if (q.startsWith('INSERT INTO sale_invoices')) stored.push(stmt.args);
            return { success: true };
          },
          async first() {
            if (q.startsWith('SELECT merchant, seq, number')) return null;
            if (q.includes('FROM sales')) return sale;
            if (q.startsWith('SELECT COALESCE(MAX(seq)')) return { max_seq: 0 };
            return null;
          },
        };
        return stmt;
      },
    },
  };
}
{
  const y2026 = Date.UTC(2026, 5, 1);
  const voided = invoiceEnv({ ts: y2026, void_ts: y2026 + 1000, amount: 250, amount_cents: 25000 });
  let status = 0;
  try { await getOrCreateSaleInvoice(voided, 'amira-cafe', 'sale-1', null, { totals: { ttc: 250 } }); }
  catch (e) { status = e.status; }
  ok('une vente annulée ne produit pas de facture', status === 409, 'statut ' + status);

  const mismatched = invoiceEnv({ ts: y2026, void_ts: null, amount: 250, amount_cents: 25000 });
  status = 0;
  try { await getOrCreateSaleInvoice(mismatched, 'amira-cafe', 'sale-2', null, { totals: { ttc: 1 } }); }
  catch (e) { status = e.status; }
  ok('un total qui ne correspond pas à l\'encaissement est refusé', status === 409, 'statut ' + status);

  const backdated = invoiceEnv({ ts: y2026, void_ts: null, amount: 250, amount_cents: 25000 });
  const doc = await getOrCreateSaleInvoice(backdated, 'amira-cafe', 'sale-3', null,
    { totals: { ttc: 250 }, issuedTs: Date.UTC(2024, 0, 1) });
  ok('le millésime vient de la vente, pas de l\'horodatage annoncé',
    doc.number.includes('2026') && !doc.number.includes('2024'), doc.number);
  ok('l\'horodatage émis ne peut pas précéder la vente', doc.snapshot.issuedTs >= y2026);

  const rounded = invoiceEnv({ ts: y2026, void_ts: null, amount: 250, amount_cents: 25049 });
  const okDoc = await getOrCreateSaleInvoice(rounded, 'amira-cafe', 'sale-4', null, { totals: { ttc: 250.49 } });
  ok('le centime d\'arrondi ne bloque pas une facture légitime', !!okDoc.number);
}

/* ── 4 · Le fond de caisse attendu ne descend plus sous la chaîne serveur ── */
{
  const chain = [
    { event_type: 'open', expected_cents: 50000, movement_kind: null, movement_amount_cents: null },
    { event_type: 'movement', expected_cents: null, movement_kind: 'in', movement_amount_cents: 20000 },
    { event_type: 'movement', expected_cents: null, movement_kind: 'out', movement_amount_cents: 5000 },
  ];
  const written = [];
  const env = {
    AUTH_SECRET: SECRET,
    DB: {
      prepare(sql) {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        const stmt = {
          args: [],
          bind(...a) { stmt.args = a; return stmt; },
          async run() { if (q.startsWith('INSERT OR IGNORE INTO cash_session_events')) written.push(stmt.args); return { success: true }; },
          async all() { return { results: chain }; },
          async first() {
            if (q.includes("event_type = 'open'")) return { id: 'evt-open' };
            if (q.startsWith('SELECT id FROM cash_session_events')) return { id: 'evt-open' };
            return null;
          },
        };
        return stmt;
      },
    },
  };
  const { tillToken, terminalToken, TERMINAL_COOKIE } = await import('../functions/auth/_lib.js');
  const token = await tillToken(SECRET, 'amira-cafe');
  const term = await terminalToken(SECRET, 'amira-cafe', 'poste-1');
  const t = Date.now();
  const res = await postCashEvent({
    request: new Request('https://kiwi.test/api/cash-sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `kiwi_till=${token}; ${TERMINAL_COOKIE}=${term}`,
      },
      body: JSON.stringify({
        merchant: 'amira-cafe', terminalId: 'poste-1', sessionId: 'sess-1', id: 'evt-close',
        eventType: 'close', expectedCents: 1000, countedCents: 1000, gapCents: 0,
        actorId: 'staff-3', openedAt: t - 3600000, occurredAt: t,
      }),
    }),
    env,
  });
  ok('la fermeture est acceptée (un comptoir bloqué serait pire)', res.status === 201, 'statut ' + res.status);
  const row = written[0] || [];
  ok('l\'attendu annoncé trop bas est relevé au plancher serveur (50 000 + 20 000 − 5 000)',
    row[5] === 65000, String(row[5]));
  ok('l\'écart est recalculé sur le plancher, pas sur la valeur annoncée',
    row[7] === 1000 - 65000, String(row[7]));
}

/* ── 5 · Le compteur de tickets ne se laisse plus empoisonner ─────────────── */
{
  const sequences = new Map();
  const env = {
    DB: {
      prepare(sql) {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        const stmt = {
          args: [],
          bind(...a) { stmt.args = a; return stmt; },
          async run() {
            if (q.startsWith('INSERT OR IGNORE INTO ticket_sequences')) {
              const key = stmt.args[0] + ':' + stmt.args[1];
              if (!sequences.has(key)) sequences.set(key, { next: stmt.args[2] });
            }
            return { success: true };
          },
          async first() {
            if (q.startsWith('SELECT MAX(CAST(ref AS INTEGER))')) return { n: null };
            if (q.startsWith('SELECT next_value FROM ticket_sequences')) {
              const row = sequences.get(stmt.args[0] + ':' + stmt.args[1]);
              return row ? { next_value: row.next } : null;
            }
            if (q.startsWith('UPDATE ticket_sequences SET')) {
              const [floorA, , size, , merchant, period, , , guardSize, last] = stmt.args;
              const row = sequences.get(merchant + ':' + period);
              const start = Math.max(row.next, floorA);
              if (start + guardSize - 1 > last) return null;
              row.next = start + size;
              return { start: row.next - size, end: row.next - 1 };
            }
            return null;
          },
        };
        return stmt;
      },
    },
  };
  let poisoned = false;
  try { await reserveTicketRange(env, 'amira-cafe', 100, 99999, 2026); }
  catch (_) { poisoned = true; }
  ok('un plancher impossible est refusé', poisoned);
  ok('et le compteur n\'a rien gardé de la demande refusée', !sequences.has('amira-cafe:2026'));
  const after = await reserveTicketRange(env, 'amira-cafe', 10, 1000, 2026);
  ok('la caisse peut donc encore numéroter après la tentative',
    after.start === 1000 && after.end === 1009, JSON.stringify(after));
}

console.log(failures
  ? `\n✗ ${failures} échec(s) sur ${checks} contrôles`
  : `\n✓ ${checks} contrôles de locataire et d'intégrité.`);
process.exit(failures ? 1 : 0);
