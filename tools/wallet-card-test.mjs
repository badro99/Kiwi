#!/usr/bin/env node
// What the Wallet card says, from the merchant's `fidelity` doc and the client's
// balance (functions/api/wallet/_card.js). The same view feeds Apple's pass.json,
// Google's loyalty object and the web card, so the three never disagree.
import assert from 'node:assert/strict';
import { cardView, passJson } from '../functions/api/wallet/_card.js';

let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log('  ✓', name); };
const PASTA = { model: 'visit', visit: { target: 10, reward: '1 offert' }, amount: { perMad: 1, threshold: 100, reward: '−10 %' }, product: { item: 'Café', target: 10, reward: '1 offert' } };
const merchant = { slug: 'pasta-corner', name: 'Pasta Corner', color: '#B3261E', bg: '#FFF8F0', address: 'Bd Zerktouni, Casablanca', phone: '+212600000000' };
const env = { WALLET_APPLE_PASS_TYPE_ID: 'pass.com.kiwios.loyalty', APNS_TEAM_ID: 'TEAM123456' };
const card = { serial: 's3r1al', authToken: 'a'.repeat(32), clientId: 'cl-42' };

ok('7 visits of 10: "7 / 10", 3 to go, not ready', () => {
  const v = cardView({ fidelity: PASTA, client: { stamps: 7, points: 0, name: 'Salma Idrissi' } });
  assert.equal(v.model, 'visit'); assert.equal(v.balance, 7); assert.equal(v.target, 10);
  assert.equal(v.remaining, 3); assert.equal(v.ready, false); assert.equal(v.rewardLabel, '1 offert');
  assert.equal(v.text, '7 / 10'); assert.equal(v.firstName, 'Salma');
});

ok('10 of 10 is ready, and stays capped above the target', () => {
  assert.equal(cardView({ fidelity: PASTA, client: { stamps: 10 } }).ready, true);
  const v = cardView({ fidelity: PASTA, client: { stamps: 12 } });
  assert.equal(v.remaining, 0); assert.equal(v.ready, true);
});

ok('product model counts stamps against the product target', () => {
  const v = cardView({ fidelity: { ...PASTA, model: 'product', product: { item: 'Café', target: 8, reward: 'Café offert' } }, client: { stamps: 5 } });
  assert.equal(v.target, 8); assert.equal(v.remaining, 3); assert.equal(v.rewardLabel, 'Café offert');
});

ok('amount model shows points against the threshold', () => {
  const v = cardView({ fidelity: { ...PASTA, model: 'amount' }, client: { points: 340 } });
  assert.equal(v.model, 'amount'); assert.equal(v.text, '340 pts'); assert.equal(v.target, 100); assert.equal(v.ready, true);
});

ok('loyalty off gives no card', () => {
  assert.equal(cardView({ fidelity: { ...PASTA, auto: true }, client: {} }), null);
  assert.equal(cardView({ fidelity: null, client: {} }), null);
});

ok('pass.json: storeCard, ids, web service, colours, QR with the till id', () => {
  const v = cardView({ fidelity: PASTA, client: { stamps: 7, name: 'Salma' } });
  const p = passJson({ view: v, card, merchant, env, baseUrl: 'https://kiwi-os.com' });
  assert.equal(p.formatVersion, 1);
  assert.equal(p.passTypeIdentifier, 'pass.com.kiwios.loyalty');
  assert.equal(p.teamIdentifier, 'TEAM123456');
  assert.equal(p.serialNumber, 's3r1al');
  assert.equal(p.authenticationToken, card.authToken);
  assert.equal(p.webServiceURL, 'https://kiwi-os.com/api/wallet');
  assert.equal(p.organizationName, 'Pasta Corner');
  assert.match(p.backgroundColor, /^rgb\(255, 248, 240\)$/);
  assert.match(p.foregroundColor, /^rgb\(/);
  assert.deepEqual(p.barcodes[0], { format: 'PKBarcodeFormatQR', message: 'KIWI-C:cl-42', messageEncoding: 'iso-8859-1', altText: 'Carte fidélité' });
  const bal = p.storeCard.primaryFields[0];
  assert.equal(bal.value, '7 / 10');
  assert.match(bal.changeMessage, /%@/);
  assert.ok(p.storeCard.secondaryFields.some((f) => /1 offert/.test(f.value)));
  assert.ok(!('locations' in p));
});

ok('a ready card says so on the lock screen', () => {
  const v = cardView({ fidelity: PASTA, client: { stamps: 10 } });
  const p = passJson({ view: v, card, merchant, env, baseUrl: 'https://kiwi-os.com' });
  const msgs = [...p.storeCard.primaryFields, ...p.storeCard.secondaryFields].map((f) => f.changeMessage || '').join(' ');
  assert.match(msgs, /récompense prête/i);
});

ok('the shop position becomes a lock-screen location', () => {
  const v = cardView({ fidelity: PASTA, client: { stamps: 1 } });
  const p = passJson({ view: v, card, merchant: { ...merchant, lat: 33.5899, lng: -7.6039 }, env, baseUrl: 'https://kiwi-os.com' });
  assert.equal(p.locations.length, 1);
  assert.equal(p.locations[0].latitude, 33.5899);
  assert.match(p.locations[0].relevantText, /Pasta Corner/);
});

ok('foreground stays readable on a dark background', () => {
  const v = cardView({ fidelity: PASTA, client: { stamps: 1 } });
  const p = passJson({ view: v, card, merchant: { ...merchant, color: '#F7F5F0', bg: '#053B2C' }, env, baseUrl: 'https://kiwi-os.com' });
  assert.equal(p.foregroundColor, 'rgb(255, 255, 255)');
});

ok('every change message carries %@, and "reward ready" rides on the balance that moves', () => {
  const fmt = (m) => (m.replace(/%%/g, '').match(/%@/g) || []).length === 1 && !/%(?!@)/.test(m.replace(/%%/g, '').replace(/%@/g, ''));
  for (const client of [{ stamps: 7 }, { stamps: 10 }]) {
    const v = cardView({ fidelity: PASTA, client });
    const p = passJson({ view: v, card, merchant: { ...merchant, name: 'Café 100% Pasta' }, env, baseUrl: 'https://kiwi-os.com' });
    const fields = [...p.storeCard.primaryFields, ...p.storeCard.secondaryFields];
    for (const f of fields) if (f.changeMessage) assert.ok(fmt(f.changeMessage), `${f.key}: ${f.changeMessage}`);
    if (v.ready) assert.match(p.storeCard.primaryFields[0].changeMessage, /Récompense prête/);
  }
});

console.log(`wallet-card: ${pass} passed`);
