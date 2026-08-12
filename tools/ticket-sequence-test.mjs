#!/usr/bin/env node
/* Kiwi · receipt sequence allocation regression gate.
 *
 * Proves that two tills never receive the same numeric range, migration starts
 * above old numeric receipts, malformed references do not move the counter, and
 * the boutique uses a UUID distinct from the customer-facing number. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestPost, onRequestGet } from '../functions/api/ticket-sequence.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failed = [];
const ok = (label, condition, detail) => {
  if (condition) { passed++; console.log('  ✓ ' + label); }
  else failed.push(label + (detail ? ' — ' + detail : ''));
};

function makeDB() {
  const year = new Date().getUTCFullYear();
  const currentTs = Date.UTC(year, 6, 1);
  const sales = [
    { merchant: 'atlas', ref: '999', ts: currentTs },
    { merchant: 'atlas', ref: '1043', ts: currentTs },
    { merchant: 'atlas', ref: '9000-X', ts: currentTs }, // not a numeric receipt
    { merchant: 'atlas', ref: '123456', ts: currentTs }, // old invalid six-digit ref
    { merchant: 'atlas', ref: 'oops', ts: currentTs },
  ];
  const sequences = new Map();
  let writer = Promise.resolve();

  return {
    _sequences: sequences,
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async run() {
          if (q.startsWith('CREATE TABLE IF NOT EXISTS ticket_sequences')) return { success: true };
          if (q.startsWith('INSERT OR IGNORE INTO ticket_sequences')) {
            const [merchant, period, nextValue, updated] = args;
            const key = merchant + ':' + period;
            if (!sequences.has(key)) sequences.set(key, { next: nextValue, updated });
            return { success: true };
          }
          throw new Error('unexpected run(): ' + q);
        },
        async first() {
          if (q.startsWith('SELECT MAX(CAST(ref AS INTEGER))')) {
            const refs = sales.filter((s) => s.merchant === args[0] && s.ts >= args[1] && s.ts < args[2] && /^\d+$/.test(s.ref) && +s.ref <= 99999).map((s) => +s.ref);
            return { n: refs.length ? Math.max(...refs) : null };
          }
          if (q.startsWith('UPDATE ticket_sequences SET')) {
            /* Model SQLite's serialized write lock even when Promise.all starts
             * both endpoint calls before either UPDATE resolves. */
            const previous = writer;
            let release;
            writer = new Promise((resolve) => { release = resolve; });
            await previous;
            try {
              const [floorA, floorB, size, updated, merchant, period, guardA, guardB, guardSize, last, returnSize] = args;
              const row = sequences.get(merchant + ':' + period);
              const start = Math.max(row.next, floorA, floorB, guardA, guardB);
              if (start + guardSize - 1 > last) return null;
              row.next = start + size;
              row.updated = updated;
              return { start: row.next - returnSize, end: row.next - 1 };
            } finally { release(); }
          }
          throw new Error('unexpected first(): ' + q);
        },
      };
      return statement;
    },
  };
}

const DB = makeDB();
async function reserve(merchant, size, floor, period) {
  const response = await onRequestPost({
    request: new Request('https://kiwi.test/api/ticket-sequence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, size, floor, period }),
    }),
    env: { DB }, // no AUTH_SECRET: local-preview entitlement keeps the asked tenant
  });
  return { status: response.status, body: await response.json() };
}

const [a, b] = await Promise.all([reserve('atlas', 10, 1000), reserve('atlas', 10, 1000)]);
ok('deux caisses reçoivent deux plages', a.status === 200 && b.status === 200);
ok('la migration repart au-dessus du dernier ticket numérique', Math.min(a.body.start, b.body.start) === 1044,
  JSON.stringify([a.body, b.body]));
ok('les plages concurrentes ne se chevauchent pas',
  a.body.end < b.body.start || b.body.end < a.body.start, JSON.stringify([a.body, b.body]));
ok('une ancienne référence mixte ne pousse pas le compteur à 9001',
  Math.max(a.body.end, b.body.end) === 1063, JSON.stringify([a.body, b.body]));
ok('une ancienne référence à six chiffres ne bloque pas la nouvelle séquence',
  Math.max(a.body.end, b.body.end) === 1063, JSON.stringify([a.body, b.body]));

const raised = await reserve('atlas', 5, 1200);
ok('le plancher local protège les reçus absents du grand livre', raised.body.start === 1200 && raised.body.end === 1204,
  JSON.stringify(raised.body));
const afterUnused = await reserve('atlas', 2, 1000);
ok('une plage réservée ne redevient jamais disponible, même sans vente serveur',
  afterUnused.body.start === 1205 && afterUnused.body.end === 1206, JSON.stringify(afterUnused.body));

const other = await reserve('rival', 2, 1000);
ok('chaque commerce possède sa propre séquence', other.body.start === 1000 && other.body.end === 1001,
  JSON.stringify(other.body));

const capped = await reserve('rival', 9000, 1000);
ok('une caisse ne peut pas accaparer une plage sans borne', capped.body.end - capped.body.start + 1 === 500);

const fiveDigits = await reserve('edge', 10, 99990);
ok('le dernier ticket possible tient sur cinq chiffres', fiveDigits.body.start === 99990 && fiveDigits.body.end === 99999,
  JSON.stringify(fiveDigits.body));
const exhausted = await reserve('edge', 1, 99999);
ok('le compteur refuse de produire un sixième chiffre', exhausted.status === 500 && exhausted.body.error === 'db');

const nextYear = await reserve('atlas', 2, 1000, new Date().getUTCFullYear() + 1);
ok('la séquence repart à quatre chiffres pour la nouvelle année', nextYear.body.start === 1000 && nextYear.body.end === 1001,
  JSON.stringify(nextYear.body));

const get = await onRequestGet();
ok('GET ne peut pas consommer de numéro', get.status === 405);

const boutique = fs.readFileSync(path.join(ROOT, 'assets', 'pos-boutique.js'), 'utf8');
const feed = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'feed.js'), 'utf8');
const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
ok('la caisse réserve une plage dédiée', boutique.includes("fetch('/api/ticket-sequence'") && boutique.includes('TICKET_LEASE_KEY'));
ok('le ticket attend son numéro avant encaissement', boutique.includes('t.lines.length && t.num') && boutique.includes('assignTicketNumber(t)'));
ok('la vente envoie un UUID distinct de sa référence',
  boutique.includes('syncId: t.syncId || newSaleId()') && /postSale\(\{[\s\S]{0,120}id:\s*sale\.syncId/.test(boutique));
ok('la nouvelle caisse ne demande plus un maximum au flux de ventes', !boutique.includes('/api/feed?seq=1'));
ok('la compatibilité de déploiement réserve elle aussi une vraie plage',
  feed.includes('reserveTicketRange(env, merchant, 500, 1000,'));
ok('le compteur fait partie du schéma durable', schema.includes('CREATE TABLE IF NOT EXISTS ticket_sequences'));
ok('la limite visible de cinq chiffres est gardée des deux côtés',
  boutique.includes('n > 99999') && fs.readFileSync(path.join(ROOT, 'functions', 'api', 'ticket-sequence.js'), 'utf8').includes('LAST_TICKET = 99999'));
ok('un numéro n’est jamais consommé si son successeur ne peut pas être persisté',
  boutique.includes('if (!saveTicketLease())') && boutique.includes('lease.next = previousNext') &&
  boutique.includes('ticketStorageError: false'));

if (failed.length) {
  failed.forEach((f) => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log(`\n✓ ${passed} contrôles de numérotation multi-caisse.`);
