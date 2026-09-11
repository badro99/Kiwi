import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const api = read('functions/api/menu/availability.js');
const caisse = read('assets/caisse-menu-availability.js');
const orderPro = read('OrderPro.html');
const server = read('kiwi-serveur.html');

assert.match(api, /tenantFor\(request, env, asked, \{ strict: true \}\)/, 'availability writes must require an exact authenticated tenant');
assert.match(api, /WHERE merchant = \? AND updated_ts = \?/, 'availability writes must use compare-and-swap');
assert.match(api, /item\.avail = body\.available/, 'only the target availability is changed');
assert.match(caisse, /\/api\/menu\/availability/, 'cashier must use the narrow availability endpoint');
assert.match(caisse, /formulaItems/, 'formula choices must also be manageable');
assert.match(orderPro, /setInterval\(async \(\) =>[\s\S]*availabilityOf/, 'OrderPro must refresh availability while open');
assert.match(server, /setInterval\(\(\) => \{ if \(!SV_DEMO && svSlug\(\)\) svFetchCarte\(\); \}, 15000\)/, 'employee app must refresh availability while open');
assert.match(orderPro, /i\.avail !== false/, 'OrderPro must exclude unavailable items');
assert.match(server, /it\.avail !== false/, 'employee app must exclude unavailable items');

console.log('menu availability contract: PASS');
