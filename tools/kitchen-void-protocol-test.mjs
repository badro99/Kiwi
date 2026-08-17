#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = path.resolve(import.meta.dirname, '..');
let checks = 0;

function ok(condition, message) {
  assert.ok(condition, message);
  checks++;
  console.log(`  ✓ ${message}`);
}

console.log('\n■ Kitchen Void Protocol & Waste Tracking (tools/kitchen-void-protocol-test.mjs)');

// 1. Schema check
const schemaSql = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
ok(/CREATE TABLE IF NOT EXISTS kitchen_voids/.test(schemaSql), 'schema.sql defines kitchen_voids table');
ok(/CREATE INDEX IF NOT EXISTS idx_kitchen_voids_live/.test(schemaSql), 'schema.sql defines idx_kitchen_voids_live index');
ok(/reason\s+TEXT NOT NULL/.test(schemaSql) && /is_waste\s+INTEGER/.test(schemaSql), 'kitchen_voids includes reason and is_waste columns');

// 2. Queue backend handlers check
const queueJs = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');
ok(/b\.voidLine/.test(queueJs), 'queue.js handles voidLine payload');
ok(/targetLine\.stationAccepted === true/.test(queueJs) || /isCooking/.test(queueJs), 'queue.js distinguishes unstarted vs cooking items for two-tier void');
ok(/b\.ackVoid/.test(queueJs), 'queue.js handles ackVoid payload from KDS');
ok(/kitchen_voids/.test(queueJs), 'queue.js writes audit records into kitchen_voids');

// 3. Kitchen Relay adapter check
const relayJs = fs.readFileSync(path.join(ROOT, 'assets/kitchen-relay.js'), 'utf8');
ok(/function voidLine\(/.test(relayJs) && /voidLine:\s*voidLine/.test(relayJs), 'kitchen-relay.js exposes voidLine method');
ok(/function ackVoid\(/.test(relayJs) && /ackVoid:\s*ackVoid/.test(relayJs), 'kitchen-relay.js exposes ackVoid method');

// 4. Server App (kiwi-serveur.html) check
const serveurHtml = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
ok(/id="void-reason-modal"/.test(serveurHtml), 'kiwi-serveur.html includes void-reason-modal');
ok(/data-void-reason="client_change"/.test(serveurHtml), 'kiwi-serveur.html supports client_change reason');
ok(/data-void-reason="kitchen_waste"/.test(serveurHtml), 'kiwi-serveur.html supports kitchen_waste reason');
ok(/openVoidReasonModal/.test(serveurHtml), 'kiwi-serveur.html defines openVoidReasonModal');

// 5. Caisse POS (kiwi-caisse.html) check
const caisseHtml = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
ok(/id="caisse-void-modal"/.test(caisseHtml), 'kiwi-caisse.html includes caisse-void-modal');
ok(/openCaisseVoidModal/.test(caisseHtml), 'kiwi-caisse.html defines openCaisseVoidModal');
ok(/data-cvoi-reason="client_change"/.test(caisseHtml), 'kiwi-caisse.html supports client_change reason');

// 6. KDS (kiwi-cuisine.html) check
const cuisineHtml = fs.readFileSync(path.join(ROOT, 'kiwi-cuisine.html'), 'utf8');
ok(/tk-void-banner/.test(cuisineHtml), 'kiwi-cuisine.html includes tk-void-banner CSS & markup');
ok(/announceVoid/.test(cuisineHtml), 'kiwi-cuisine.html implements acoustic void alert chime');
ok(/data-void-ack/.test(cuisineHtml), 'kiwi-cuisine.html binds data-void-ack actions');

console.log(`\n✓ ${checks} kitchen void protocol checks green.\n`);
