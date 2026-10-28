// Shell identity and offline metadata are structure contracts, separate from
// the employee language owner's executing live-content scenarios.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const page = fs.readFileSync('kiwi-serveur.html', 'utf8');
const manifest = fs.readFileSync('serveur.webmanifest', 'utf8');
const sw = fs.readFileSync('kiwi-sw.js', 'utf8');
const ok = (value, message) => assert.ok(value, message);
ok(/kiwi-newlogo\.svg\?v=2/.test(page), 'the current Serveur logo has a cache-busted asset URL');
ok(/rel="icon" href="assets\/kiwi-favicon-new\.svg\?v=2"/.test(page), 'the browser tab uses the current Kiwi favicon');
ok(/apple-touch-icon[^>]*kiwi-employee-180\.png\?v=2/.test(page), 'the iPhone home-screen card uses the current Kiwi mark');
ok(/kiwi-employee-192\.png\?v=2/.test(manifest) && /kiwi-employee-512\.png\?v=2/.test(manifest)
  && !/kiwi-mark-app-icon|kiwi-employee-k/.test(manifest), 'the install manifest cannot fall back to a legacy k icon');
const swCacheVer = parseInt((sw.match(/var CACHE = 'kiwi-app-v(\d+)'/) || [])[1] || '0', 10);
ok(swCacheVer >= 370 && !/kiwi-employee-k-/.test(sw), 'the shared PWA cache evicts every legacy employee icon');

console.log('✓ employee shell identity and offline metadata');
