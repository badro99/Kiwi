#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · GARDE-FOU MULTI-DEVICE COLLISION & TABLE SOFT-LOCKS
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const EVENTS_API = fs.readFileSync(path.join(ROOT, 'functions/api/service/events.js'), 'utf8');
const SERVEUR_HTML = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
const CAISSE_HTML = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let pass = 0;
const fails = [];

function ok(label, cond) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fails.push(label);
    console.log(`  ✗ ${label}`);
  }
}

console.log('\n■ Multi-Device Collision Prevention & Table Soft-Locks (tools/multi-device-collision-test.mjs)');

// 1. API: Lock handling in functions/api/service/events.js
ok('events.js handles body.lock acquire & release',
  /body\.lock && typeof body\.lock === 'object'/.test(EVENTS_API) &&
  /body\.lock\.action === 'release' \? 'release' : 'acquire'/.test(EVENTS_API));

ok('events.js auto-expires stale locks (> 60s)',
  /\(now - Number\(locks\[t\]\.ts\)\) > 60000/.test(EVENTS_API));

ok('events.js returns active locks in GET responses',
  /locks: activeLocks/.test(EVENTS_API));

ok('events.js persists locks in store_docs',
  /UPDATE store_docs SET data = \?, rev = \?, updated_ts = \?/.test(EVENTS_API));

// 2. Waiter App: kiwi-serveur.html
ok('kiwi-serveur.html defines setTableLock helper',
  /async function setTableLock\(id, action\)/.test(SERVEUR_HTML));

ok('kiwi-serveur.html acquires lock on openTableDetail',
  /setTableLock\(id, 'acquire'\)/.test(SERVEUR_HTML));

ok('kiwi-serveur.html releases lock on returnToFloor',
  /setTableLock\(activeTableId, 'release'\)/.test(SERVEUR_HTML));

ok('kiwi-serveur.html renders td-lock-banner for active locks',
  /td-lock-banner/.test(SERVEUR_HTML) && /prend la commande sur cette table/.test(SERVEUR_HTML));

ok('kiwi-serveur.html renders tc-lock-indicator on table cards',
  /tc-lock-indicator/.test(SERVEUR_HTML));

// 3. Cashier POS: kiwi-caisse.html
ok('kiwi-caisse.html defines setCaisseTableLock helper',
  /function setCaisseTableLock\(tableId, action\)/.test(CAISSE_HTML));

ok('kiwi-caisse.html acquires lock when entering order mode',
  /setCaisseTableLock\(selectedId, 'acquire'\)/.test(CAISSE_HTML));

ok('kiwi-caisse.html releases lock on backToSalle',
  /setCaisseTableLock\(selectedId, 'release'\)/.test(CAISSE_HTML));

ok('kiwi-caisse.html ingests locks in pollEmployeeFloor',
  /caisseTableLocks = data\.locks/.test(CAISSE_HTML));

ok('kiwi-caisse.html renders collision banner in right panel',
  /prend la commande sur cette table/.test(CAISSE_HTML));

console.log(`\n✓ ${pass} multi-device collision checks green.\n`);

if (fails.length > 0) {
  console.error(`\nFAILED ${fails.length} checks:\n- ` + fails.join('\n- '));
  process.exit(1);
}
