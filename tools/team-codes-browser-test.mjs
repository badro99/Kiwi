#!/usr/bin/env node
/* Les codes du roster Équipe, dans le vrai dashboard, dans un vrai Chromium :
 * le disque les lâche, la page les retrouve, et RIEN ne part chez le serveur
 * tant qu'un code attendu manque.
 *
 *   node tools/team-codes-browser-test.mjs
 *
 * Le « serveur » est une interception de /api/store (le document `team`) et de
 * /api/config (staff_pins). Il applique la même règle que le vrai : une écriture
 * REMPLACE ce qu'il porte. C'est là que se joue le risque : un navigateur qui a
 * oublié des codes les effacerait chez lui. La suite compte donc, à chaque
 * étape, ce que le serveur détient APRÈS tout ce que le navigateur lui a envoyé.
 *
 * Les codes sont des valeurs fabriquées pour cette suite, jamais de vrais codes.
 * Aucune boutique ni aucun compte réel n'est touché.
 *
 *   1 · un roster d'avant (codes en clair sur le disque) est relu, puis le
 *       disque n'en contient plus aucun, tandis que la page les connaît ;
 *   2 · rechargé, le disque propre ne fait rien perdre au serveur ;
 *   3 · serveur muet à la lecture : rien n'est publié, le serveur garde tout ;
 *   4 · copie expurgée (compte sans droit sur les codes) : idem.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const SLUG = 'team-codes-test';
const VENUE_ID = 'v-team-codes-test';
const CODES = { m1: '4821', m2: '7390', m3: '1357' };
const ALL = Object.values(CODES);

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('team-codes', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

const member = (id, first, withCodes) => ({
  id, firstName: first, lastName: 'Test', function: 'Cashier', department: 'Caisse', venueSlug: SLUG,
  ...(withCodes ? { pinCode: CODES[id], password: CODES[id] } : {}),
});
const roster = (withCodes) => [member('m1', 'Sara', withCodes), member('m2', 'Omar', withCodes), member('m3', 'Lina', withCodes)];

/* Ce que le « serveur » porte, et ce que le navigateur lui a envoyé. */
const server_ = { rev: 5, doc: null, staffPins: null, posts: [], pinPosts: [], getMode: 'owner' };   // getMode : owner | redacted | down
function resetServer(getMode = 'owner') {
  server_.rev = 5;
  server_.doc = { members: roster(true), removed: [], hours: {}, shifts: {}, planning: {}, locks: {} };
  server_.staffPins = ALL.map((code, i) => ({ memberId: 'm' + (i + 1), code }));
  server_.posts = []; server_.pinPosts = []; server_.getMode = getMode;
}
const codesIn = (members) => (members || []).map((m) => m && (m.pinCode || m.password)).filter(Boolean);
const serverMemberCodes = () => codesIn(server_.doc && server_.doc.members);
const serverPinCodes = () => (server_.staffPins || []).map((p) => p.code);

async function open(tr, ctx, { disk }) {
  const page = tr.watch(await ctx.newPage());
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.origin !== base) return req.continue();
    if (u.pathname === '/kiwi-sw.js') return req.respond(json(404, {}));
    if (u.pathname === '/api/store' && u.searchParams.get('feature') === 'team') {
      if (req.method() === 'POST') {
        let body = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
        server_.posts.push(body);
        if (body.data) { server_.doc = body.data; server_.rev += 1; }          // une écriture REMPLACE
        return req.respond(json(200, { ok: true, rev: server_.rev }));
      }
      if (server_.getMode === 'down') return req.respond(json(503, { error: 'down' }));
      const data = server_.getMode === 'redacted'
        ? { ...server_.doc, members: (server_.doc.members || []).map(({ pinCode, password, ...rest }) => rest) }
        : server_.doc;
      return req.respond(json(200, { rev: server_.rev, data }));
    }
    if (u.pathname === '/api/config') {
      if (req.method() === 'POST') {
        let body = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
        if (Array.isArray(body.pins)) { server_.pinPosts.push(body.pins); server_.staffPins = body.pins; }   // REMPLACE staff_pins
        return req.respond(json(200, { ok: true, pins: (body.pins || []).map(({ code, ...rest }) => rest) }));
      }
      return req.respond(json(200, { pins: [] }));
    }
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/')) return req.respond(json(404, {}));
    return req.continue();
  });
  page.on('dialog', async (d) => { await d.dismiss(); });
  await page.evaluateOnNewDocument((venue, diskBlob, key) => {
    try {
      localStorage.setItem('kiwiDemos', '0');
      localStorage.setItem('kiwiOnboarded', '1');
      localStorage.setItem('kiwiLang', 'en');
      localStorage.setItem('kiwiCustomVenues', JSON.stringify([venue]));
      localStorage.setItem('kiwiVenue', venue.id);
      /* Le disque de départ n'est posé qu'à la PREMIÈRE page de ce contexte : un
         rechargement relit ce que la page a elle-même écrit. */
      if (diskBlob && !sessionStorage.getItem('kiwiTeamTestSeeded')) {
        localStorage.setItem(key, diskBlob);
        sessionStorage.setItem('kiwiTeamTestSeeded', '1');
      }
    } catch (_) {}
  }, {
    id: VENUE_ID, name: 'team codes test', fullDisplay: 'team codes test', slug: SLUG, location: '', type: 'boutique',
    subtype: 'maison', custom: true, siblings: '', status: 'En service', ice: '·', txCount: 0, staffCount: 0, hours: '', methods: '', goal: 0,
  }, disk ? JSON.stringify({ byVenue: { [VENUE_ID]: disk }, hoursByVenue: {}, shiftsByVenue: {}, planningByVenue: {}, locksByVenue: {}, removedByVenue: {} }) : null, 'kiwiTeamV2:custom');
  page.setDefaultNavigationTimeout(60000);
  await page.goto(`${base}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__kiwiTeamV2 && !!window.KiwiVenue && !!window.KiwiCloudDoc, { timeout: 30000 });
  return page;
}

const diskDump = (page) => page.evaluate(() => Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\n'));
const noCodesOnDisk = async (page, msg) => {
  const dump = await diskDump(page);
  check(ALL.every((c) => !dump.includes(`"${c}"`)), msg);
};
const memoryCodes = (page) => page.evaluate((id) => (window.__kiwiTeamV2.byVenue[id] || []).map((m) => m.pinCode || m.password).filter(Boolean), VENUE_ID);
async function settle(page, ms = 2500) {
  /* On laisse le temps à bind → hydrateCodes → publishPins de tourner, puis aux
     éventuelles remontées de partir ; une attente fixe, parce que l'absence
     d'un envoi ne se « détecte » pas, elle se constate après un délai. */
  await page.evaluate(() => new Promise((r) => (document.readyState === 'complete' ? r() : window.addEventListener('load', r))));
  await sleep(ms);
}
/* Après tout ce que le navigateur a envoyé, le serveur a-t-il encore tous les codes ? */
const serverStillHasEverything = () =>
  ALL.every((c) => serverMemberCodes().includes(c)) && ALL.every((c) => serverPinCodes().includes(c));

try {
  await S.run('1 · un roster d\'avant, en clair sur le disque : relu, puis plus rien sur le disque', async (tr) => {
    resetServer('owner');
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    const page = await open(tr, ctx, { disk: roster(true) });
    await page.waitForFunction((id, n) => (window.__kiwiTeamV2.byVenue[id] || []).length === n, { timeout: 15000 }, VENUE_ID, 3);
    await page.waitForFunction(() => !/"(4821|7390|1357)"/.test(localStorage.getItem('kiwiTeamV2:custom') || ''), { timeout: 15000 })
      .catch(() => {});
    await settle(page);
    await noCodesOnDisk(page, 'plus aucun code du roster dans localStorage');
    const mem = await memoryCodes(page);
    check(ALL.every((c) => mem.includes(c)), 'la page, elle, connaît toujours les trois codes (le patron peut les lire)');
    check(serverStillHasEverything(), 'après tout ce que le navigateur a envoyé, le serveur détient encore les trois codes (document ET staff_pins)');
    check(server_.pinPosts.every((pins) => ALL.every((c) => pins.map((p) => p.code).includes(c))), 'chaque publication de staff_pins portait les trois codes, jamais une liste amputée');
    check(server_.posts.every((b) => ALL.every((c) => codesIn(b.data && b.data.members).includes(c))), 'chaque envoi du document team portait les trois codes');
  });

  await S.run('2 · rechargé : le disque propre ne fait rien perdre au serveur', async (tr) => {
    resetServer('owner');
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    const page = await open(tr, ctx, { disk: roster(true) });
    await settle(page);
    await noCodesOnDisk(page, 'premier chargement : disque propre');
    server_.posts = []; server_.pinPosts = [];
    tr.step('reload with the clean disk');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__kiwiTeamV2 && !!window.KiwiCloudDoc, { timeout: 30000 });
    await settle(page);
    await noCodesOnDisk(page, 'après rechargement : toujours aucun code sur le disque');
    const mem = await memoryCodes(page);
    check(ALL.every((c) => mem.includes(c)), 'les codes sont revenus du serveur dans la page');
    check(serverStillHasEverything(), 'le serveur détient toujours les trois codes');
    check(server_.pinPosts.every((pins) => ALL.every((c) => pins.map((p) => p.code).includes(c))), 'aucune publication amputée');
    check(server_.posts.every((b) => ALL.every((c) => codesIn(b.data && b.data.members).includes(c))), 'aucun document team amputé');
  });

  await S.run('3 · serveur muet à la lecture : rien n\'est publié, le serveur garde tout', async (tr) => {
    resetServer('owner');
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    const first = await open(tr, ctx, { disk: roster(true) });
    await settle(first);
    await noCodesOnDisk(first, 'départ : disque propre');
    await first.close();
    server_.getMode = 'down';
    server_.posts = []; server_.pinPosts = [];
    const page = await open(tr, ctx, { disk: null });
    await settle(page, 3000);
    check(server_.pinPosts.length === 0, 'aucun staff_pins n\'est publié tant que les codes manquent');
    check(server_.posts.length === 0, 'aucun document team n\'est envoyé tant que les codes manquent');
    check(serverStillHasEverything(), 'le serveur détient toujours les trois codes');
    await noCodesOnDisk(page, 'et le disque n\'a rien regagné');
  });

  await S.run('4 · copie expurgée (aucun droit sur les codes) : rien ne part, rien ne se perd', async (tr) => {
    resetServer('owner');
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    const first = await open(tr, ctx, { disk: roster(true) });
    await settle(first);
    await first.close();
    server_.getMode = 'redacted';
    server_.posts = []; server_.pinPosts = [];
    const page = await open(tr, ctx, { disk: null });
    await settle(page, 3000);
    check(server_.pinPosts.length === 0, 'aucun staff_pins publié depuis une copie sans codes');
    check(server_.posts.every((b) => ALL.every((c) => codesIn(b.data && b.data.members).includes(c))), 'aucun document team amputé n\'est parti');
    check(serverStillHasEverything(), 'le serveur détient toujours les trois codes');
  });
} finally {
  server.close();
  await S.finish();
}
