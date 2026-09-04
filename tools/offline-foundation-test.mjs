#!/usr/bin/env node
/* Static release contract for the browser-tested IndexedDB outbox. The actual
 * transaction/lease/replay behavior is exercised by the two browser fixtures;
 * this gate prevents a later HTML or service-worker edit from silently
 * disconnecting that tested engine from one of Kiwi's three operational apps. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
let checks = 0;
function ok(value, label) {
  if (!value) { console.error('  ✗ ' + label); process.exitCode = 1; }
  else { checks++; console.log('  ✓ ' + label); }
}

const dexie = read('assets/vendor/dexie.min.js');
const license = read('assets/vendor/dexie.LICENSE.txt');
const db = read('assets/offline-db.js');
const live = read('assets/live-link.js');
const pwa = read('assets/caisse-pwa.js');
const sw = read('kiwi-sw.js');

ok(/semVer:"4\.4\.4"/.test(dexie), 'Dexie 4.4.4 is vendored and pinned');
ok(/Apache License[\s\S]*Version 2\.0/.test(license), 'the vendored dependency keeps its Apache-2.0 licence');
ok(/\[tenant\+channel\]/.test(db) && /assertScope/.test(db), 'every command is explicitly tenant and channel scoped');
ok(/leaseToken/.test(db) && /leaseUntil/.test(db), 'cross-tab replay uses an expiring owner lease');
ok(/BroadcastChannel\('kiwi-outbox-v1'\)/.test(db) && /message\.source === instanceId/.test(db), 'cross-tab queue changes refresh every open surface');
ok(/permanent \? 'blocked' : 'pending'/.test(db) && /Number\.MAX_SAFE_INTEGER/.test(db), 'permanent rejections remain quarantined');
ok(/opts\.replaceExisting/.test(db) && /type: 'replace'/.test(db), 'an exact manager re-approval can refresh a queued refund without duplicating it');
ok(/localStorage\.removeItem\(storageKey\)/.test(db) && /db\.transaction\('rw'/.test(db), 'legacy storage retires only after a transaction');
ok(/KiwiOffline\.enqueue/.test(live) && /O\.claim/.test(live) && /O\.acknowledge/.test(live) && /O\.reject/.test(live), 'live sales use the durable outbox lifecycle');
ok(/flushLegacyQueue/.test(live) && /queue-storage-full/.test(live), 'IndexedDB denial retains the proven emergency fallback');
ok(/Opérations protégées hors ligne/.test(pwa) && /kiwi:outbox/.test(pwa), 'cashiers see truthful durable-sync state');
ok(/assets\/vendor\/dexie\.min\.js/.test(sw) && /assets\/offline-db\.js\?v=\d+/.test(sw), 'the outbox engine is available in the offline shell');

for (const page of ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html']) {
  const html = read(page);
  const dexieAt = html.indexOf('assets/vendor/dexie.min.js');
  const offlineMatch = html.match(/assets\/offline-db\.js\?v=\d+/);
  const offlineAt = offlineMatch ? html.indexOf(offlineMatch[0]) : -1;
  const liveMatch = html.match(/assets\/live-link\.js\?v=\d+/);
  const liveAt = liveMatch ? html.indexOf(liveMatch[0]) : -1;
  ok(dexieAt >= 0 && dexieAt < offlineAt && offlineAt < liveAt, page + ' loads Dexie → KiwiOffline → Live Link');
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`\n✓ offline foundation gate green (${checks} checks + browser fixtures)`);
