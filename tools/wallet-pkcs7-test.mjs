#!/usr/bin/env node
// Apple only installs a pass whose manifest carries a detached PKCS#7 (CMS)
// signature from the Pass Type ID certificate plus Apple's WWDR intermediate.
// functions/api/wallet/_pkcs7.js builds it with WebCrypto and a small DER writer.
// Here a throwaway CA → intermediate → leaf chain stands in for Apple's, and
// openssl, the reference implementation, must accept the result.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { signDetached, pemToDer } from '../functions/api/wallet/_pkcs7.js';
import { buildPkpass, appleConfigured } from '../functions/api/wallet/_pkpass.js';
import { WWDR_G4 } from '../functions/api/wallet/_wwdr.js';
import { walletDb } from './wallet-d1-shim.mjs';
import { issueCard } from '../functions/api/wallet/_store.js';
import { encodePng } from '../functions/api/wallet/_png.js';
import * as service from '../functions/api/wallet/v1/[[path]].js';

let pass = 0;
const ok = async (name, fn) => { await fn(); pass++; console.log('  ✓', name); };
const sh = (args, cwd) => spawnSync('openssl', args, { cwd, encoding: 'utf8' });

if (sh(['version']).error) { console.log('  ○ skip openssl absent'); console.log('wallet-pkcs7: 0 passed'); process.exit(0); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-pkcs7-'));
try {
  const run = (...a) => { const r = sh(a, dir); assert.equal(r.status, 0, a.join(' ') + '\n' + r.stderr); };
  fs.writeFileSync(path.join(dir, 'ca.ext'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n');
  fs.writeFileSync(path.join(dir, 'leaf.ext'), 'basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature\n');
  run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '2', '-subj', '/CN=Test Root', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  run('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'int.key', '-out', 'int.csr', '-subj', '/CN=Test WWDR');
  run('x509', '-req', '-in', 'int.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'int.pem', '-days', '2', '-extfile', 'ca.ext');
  run('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'leaf.key', '-out', 'leaf.csr', '-subj', '/UID=pass.com.kiwios.test/CN=Pass Type ID: pass.com.kiwios.test');
  run('x509', '-req', '-in', 'leaf.csr', '-CA', 'int.pem', '-CAkey', 'int.key', '-CAcreateserial', '-out', 'leaf.pem', '-days', '2', '-extfile', 'leaf.ext');
  /* OpenSSL 3 needs -traditional for PKCS#1; LibreSSL (macOS) writes PKCS#1 by default. */
  if (sh(['rsa', '-in', 'leaf.key', '-traditional', '-out', 'leaf-pkcs1.key'], dir).status !== 0) run('rsa', '-in', 'leaf.key', '-out', 'leaf-pkcs1.key');
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const manifest = new TextEncoder().encode(JSON.stringify({ 'pass.json': 'da39a3ee5e6b4b0d3255bfef95601890afd80709' }));
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifest);
  const verify = (sigFile, contentFile) => sh(['cms', '-verify', '-binary', '-inform', 'DER', '-in', sigFile, '-content', contentFile, '-CAfile', 'ca.pem', '-purpose', 'any', '-out', '/dev/null'], dir);

  await ok('pemToDer reads a certificate', () => {
    const der = pemToDer(read('leaf.pem'));
    assert.equal(der[0], 0x30);
  });

  await ok('openssl verifies the detached signature over the manifest (PKCS#8 key)', async () => {
    const sig = await signDetached({ content: manifest, certPem: read('leaf.pem'), keyPem: read('leaf.key'), chainPems: [read('int.pem')], now: Date.UTC(2026, 10, 27, 9) });
    fs.writeFileSync(path.join(dir, 'signature'), sig);
    const r = verify('signature', 'manifest.json');
    assert.equal(r.status, 0, r.stderr);
  });

  await ok('a PKCS#1 key (openssl "RSA PRIVATE KEY") signs too', async () => {
    assert.match(read('leaf-pkcs1.key'), /BEGIN RSA PRIVATE KEY/);
    const sig = await signDetached({ content: manifest, certPem: read('leaf.pem'), keyPem: read('leaf-pkcs1.key'), chainPems: [read('int.pem')], now: Date.now() });
    fs.writeFileSync(path.join(dir, 'signature1'), sig);
    assert.equal(verify('signature1', 'manifest.json').status, 0);
  });

  await ok('a changed manifest no longer verifies', () => {
    fs.writeFileSync(path.join(dir, 'tampered.json'), Buffer.concat([Buffer.from(manifest), Buffer.from(' ')]));
    assert.notEqual(verify('signature', 'tampered.json').status, 0);
  });

  await ok('the signer and the intermediate are both embedded', () => {
    const r = sh(['pkcs7', '-inform', 'DER', '-in', 'signature', '-print_certs', '-noout'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Pass Type ID: pass\.com\.kiwios\.test/);
    assert.match(r.stdout, /Test WWDR/);
  });
  await ok('the committed WWDR G4 intermediate is a certificate', () => {
    fs.writeFileSync(path.join(dir, 'wwdr.pem'), WWDR_G4);
    const r = sh(['x509', '-in', 'wwdr.pem', '-noout', '-subject'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Worldwide Developer Relations/);
  });

  await ok('no Apple certificate configured: no bundle, no throw', async () => {
    assert.equal(appleConfigured({}), false);
    assert.equal(await buildPkpass({ pass: {}, env: {} }), null);
  });

  await ok('the .pkpass carries pass, images, a matching manifest and a valid signature', async () => {
    const env = { WALLET_APPLE_PASS_TYPE_ID: 'pass.com.kiwios.test', APNS_TEAM_ID: 'TEAM', WALLET_APPLE_CERT_PEM: read('leaf.pem'), WALLET_APPLE_KEY_PEM: read('leaf.key'), WALLET_APPLE_WWDR_PEM: read('int.pem') };
    const zip = await buildPkpass({ pass: { formatVersion: 1, serialNumber: 'x' }, images: { 'icon.png': new Uint8Array([1, 2, 3]), 'strip@2x.png': new Uint8Array([4, 5]) }, env });
    fs.writeFileSync(path.join(dir, 'card.pkpass'), zip);
    const out = path.join(dir, 'card');
    const u = spawnSync('unzip', ['-o', '-q', 'card.pkpass', '-d', out], { cwd: dir, encoding: 'utf8' });
    assert.equal(u.status, 0, u.stderr);
    assert.deepEqual(fs.readdirSync(out).sort(), ['icon.png', 'manifest.json', 'pass.json', 'signature', 'strip@2x.png']);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    const crypto = await import('node:crypto');
    for (const f of ['pass.json', 'icon.png', 'strip@2x.png']) assert.equal(manifest[f], crypto.createHash('sha1').update(fs.readFileSync(path.join(out, f))).digest('hex'));
    assert.equal(verify('card/signature', 'card/manifest.json').status, 0);
  });
  await ok('the download route serves a signed pass with the live balance, logo, icon and strip', async () => {
    const { DB, sql } = walletDb();
    /* a 300 × 120 logo: red bar on a white square, so trim has a margin to cut */
    const w = 300, h = 120, px = new Uint8Array(w * h * 4).fill(255);
    for (let y = 40; y < 80; y++) for (let x = 60; x < 240; x++) px.set([179, 38, 30, 255], (y * w + x) * 4);
    const logo = 'data:image/png;base64,' + Buffer.from(await encodePng(w, h, px)).toString('base64');
    const put = sql.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,1,1)');
    put.run('pasta-corner', 'fidelity', JSON.stringify({ model: 'visit', visit: { target: 10, reward: '1 offert' } }));
    put.run('pasta-corner', 'wallet', JSON.stringify({ on: true, name: 'Pasta Corner', color: '#B3261E', bg: '#FFF8F0', lat: 33.59, lng: -7.6 }));
    put.run('pasta-corner', 'receipt', JSON.stringify({ look: { logo, logoOn: true } }));
    sql.prepare("INSERT INTO clients (merchant, id, name, phone, stamps, updated_ts, srv_ts) VALUES ('pasta-corner','c1','Salma Idrissi','0612345678',7,1,1)").run();
    const env = { DB, WALLET_APPLE_PASS_TYPE_ID: 'pass.com.kiwios.test', APNS_TEAM_ID: 'TEAM', WALLET_APPLE_CERT_PEM: read('leaf.pem'), WALLET_APPLE_KEY_PEM: read('leaf.key'), WALLET_APPLE_WWDR_PEM: read('int.pem') };
    const card = await issueCard(DB, { merchant: 'pasta-corner', clientId: 'c1', platform: 'apple' });
    const res = await service.onRequest({ env, waitUntil() {}, params: { path: ['download', card.serial + '.pkpass'] }, request: new Request(`https://kiwi-os.com/api/wallet/v1/download/${card.serial}.pkpass?t=${card.authToken}`) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'application/vnd.apple.pkpass');
    fs.writeFileSync(path.join(dir, 'live.pkpass'), new Uint8Array(await res.arrayBuffer()));
    const out = path.join(dir, 'live');
    assert.equal(spawnSync('unzip', ['-o', '-q', 'live.pkpass', '-d', out], { cwd: dir }).status, 0);
    const names = fs.readdirSync(out);
    for (const n of ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'strip@3x.png', 'pass.json', 'manifest.json', 'signature']) assert.ok(names.includes(n), n);
    const p = JSON.parse(fs.readFileSync(path.join(out, 'pass.json'), 'utf8'));
    assert.equal(p.storeCard.primaryFields[0].value, '7 / 10');
    assert.equal(p.serialNumber, card.serial);
    assert.equal(p.locations[0].latitude, 33.59);
    assert.equal(verify('live/signature', 'live/manifest.json').status, 0);
    const logoPng = fs.readFileSync(path.join(out, 'logo@2x.png'));
    assert.equal(logoPng.readUInt32BE(16), 182); assert.equal(logoPng.readUInt32BE(20), 100);
    const wrong = await service.onRequest({ env, waitUntil() {}, params: { path: ['download', card.serial + '.pkpass'] }, request: new Request(`https://kiwi-os.com/api/wallet/v1/download/${card.serial}.pkpass?t=${'z'.repeat(32)}`) });
    assert.equal(wrong.status, 404);
  });
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`wallet-pkcs7: ${pass} passed`);
