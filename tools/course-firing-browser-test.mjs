#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
/* « À suivre » et « Envoyer la suite » (kiwi-caisse.html · sendTableToKitchen),
 * dans la vraie caisse de démo, au vrai clic.
 *
 *   · un plat marqué « À suivre » reste sur l'addition et ne part pas ; le bon
 *     des entrées l'annonce en bas (« À SUIVRE ») sur le papier et à l'écran ;
 *   · annuler des ajouts plus tard ne l'efface pas : il fait partie du repas ;
 *   · « Envoyer la suite » le lance, sur un bon titré SUITE, et l'annonce
 *     disparaît du bon précédent ;
 *   · encaisser lance tout : un plat payé ne reste jamais sans bon.
 * Le service s'ouvre par doOpenService() (l'écran d'ouverture n'est pas
 * l'objet du test) ; tout le reste passe par des clics. Aucun code saisi. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
await page.setViewport({ width: 1366, height: 900 });
await page.setBypassServiceWorker(true);
await page.setRequestInterception(true);
page.on('request', (r) => {
  const u = r.url();
  if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
  return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
});
await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
await page.waitForFunction(() => typeof doOpenService === 'function' && window.KiwiKitchenPrint && window.KiwiEscPos, { timeout: 30000 });
await page.evaluate(() => {
  doOpenService();
  /* Les bons qui partent vers la file d'impression, tels quels. */
  window.__plans = [];
  const real = KiwiKitchenPrint.enqueue.bind(KiwiKitchenPrint);
  KiwiKitchenPrint.enqueue = (plan, opts) => { window.__plans.push(JSON.parse(JSON.stringify(plan))); return real(plan, opts); };
  /* Et ce qui part vers l'écran cuisine distant (kiwi-cuisine.html), tel
     quel : la démo n'a pas de commerce, on lui en prête un le temps du test. */
  window.__relayed = [];
  KiwiKitchenRelay.merchant = () => 'course-firing-test';
  KiwiKitchenRelay.send = (t) => { window.__relayed.push(JSON.parse(JSON.stringify(t))); return Promise.resolve({ ok: false }); };
});
const lastRelay = () => page.evaluate(() => window.__relayed[window.__relayed.length - 1] || null);
/* L'ouverture se termine sur le registre (vente rapide) après son animation.
   On l'attend, puis on passe en salle par le vrai bouton. */
await page.waitForFunction(() => document.body.classList.contains('is-unlocked') && mode === 'vrap', { timeout: 20000 });
await sleep(400);
await page.click('.mode-pill[data-mode="salle"]');
await page.waitForFunction(() => mode === 'salle', { timeout: 5000 });
await sleep(300);

/* Deux plats sans options ni formule, visibles sur la carte. */
/* Une table libre du plan de démo (son état varie d'une ouverture à l'autre). */
const freeTable = (not) => page.evaluate((skip) => [...document.querySelectorAll('.cplan-tbl')]
  .filter((c) => c.offsetParent && tables[c.dataset.table] && tables[c.dataset.table].status === 'khawya'
    && !(tableOrders[c.dataset.table] || []).length && !skip.includes(c.dataset.table))
  .map((c) => c.dataset.table)[0] || null, not || []);
async function openTable(id) {
  await page.click(`.cplan-tbl[data-table="${id}"]`);
  await page.waitForSelector('#new-table-modal.is-open', { timeout: 10000 });
  await page.click('#new-table-modal.is-open button:not(#nt-cancel):not(#nt-confirm)');
  await page.click('#nt-confirm');
  await page.waitForFunction(() => mode === 'order', { timeout: 10000 });
  await sleep(300);
}
const lineOf = (table, id) => page.evaluate((t, i) => {
  const l = (tableOrders[t] || []).find((x) => x.id === i);
  return l ? { uid: l.uid, qty: l.qty, sent: !!l.sent, hold: !!l.hold, committed: !!l.committed } : null;
}, table, id);
const clickDish = async (id) => { await page.click(`.menu-item[data-menu-id="${id}"]`); await sleep(150); };
const lastPlan = () => page.evaluate(() => window.__plans[window.__plans.length - 1] || null);
const flush = () => sleep(500); // relayToKitchen résout, puis le bon part à la file

const A = await freeTable();
assert.ok(A, 'a free table on the demo floor');
await openTable(A);
const dishes = await page.evaluate(() => [...document.querySelectorAll('.menu-item')]
  .filter((c) => c.offsetParent && !c.classList.contains('is-86'))
  .map((c) => c.dataset.menuId)
  .filter((id) => { const it = standaloneMenuItem(id); return it && !it.formula && !itemOptGroups(it).length; })
  .slice(0, 3)
  .map((id) => ({ id, name: standaloneMenuItem(id).name })));
check(dishes.length === 3, `three plain dishes on the demo menu (${dishes.map((d) => d.name).join(', ')})`);
const [starter, main, extra] = dishes;

console.log('\n■ À suivre');
await clickDish(starter.id);
await clickDish(main.id);
await clickDish(main.id);
const m0 = await lineOf(A, main.id);
await page.click(`[data-hold-uid="${m0.uid}"]`);
await sleep(200);
check((await lineOf(A, main.id)).hold, 'one tap on « À suivre » marks the dish');
check(await page.$eval(`[data-hold-uid="${m0.uid}"]`, (b) => b.classList.contains('is-on') && b.getAttribute('aria-pressed') === 'true'), 'the button shows it is on (is-on, aria-pressed)');
check(/2 à suivre/.test(await page.$eval('#rp-substatus', (n) => n.textContent)), 'the order header counts it: « 2 à suivre »');

const plansBefore = await page.evaluate(() => window.__plans.length);
await page.click('#validate-order');
await flush();
const s1 = await lineOf(A, starter.id), m1 = await lineOf(A, main.id);
check(s1.sent && !m1.sent, 'Envoyer en cuisine: the starter leaves, the held main stays');
check(m1.hold && m1.committed, 'the held main is now part of the meal (committed)');
const plan1 = await lastPlan();
check(plan1 && (await page.evaluate(() => window.__plans.length)) > plansBefore, 'a kitchen bon went to the print queue');
const p1 = plan1[0].payload;
check(p1.items.length === 1 && p1.items[0].name === starter.name, `the bon carries the starter only (${p1.items.map((i) => i.name).join(', ')})`);
check(Array.isArray(p1.following) && p1.following.length === 1 && p1.following[0].qty === 2 && p1.following[0].name === main.name, `and announces what follows: 2× ${main.name}`);
check(!/^SUITE/.test(p1.title), `its title is the station, not SUITE (${p1.title})`);
const paper1 = await page.evaluate((payload) => Array.from(KiwiEscPos.kitchenTicket(Object.assign({ paper: '80' }, payload))), p1);
check(Buffer.from(paper1).toString('latin1').includes('À SUIVRE'), 'the printed ticket has an « À SUIVRE » block');
await page.evaluate(() => kdsPaint());
const kds1 = await page.$eval('#kit-new', (n) => n.textContent.replace(/\s+/g, ' '));
check(kds1.includes(`À suivre · 2× ${main.name}`), 'the kitchen screen card shows « À suivre · 2× … »');
const r1 = await lastRelay();
check(r1 && !r1.course && Array.isArray(r1.following) && r1.following.length === 1
  && r1.following[0].qty === 2 && r1.following[0].name === main.name,
  'the remote kitchen screen is told what follows too (relay: following 2× the main, no course)');

console.log('\n■ L’addition, puis une suite qui ne s’efface pas');
await page.waitForFunction(() => mode === 'salle', { timeout: 5000 });
check(await page.$eval('#rp-send-kitchen', (b) => !b.hidden && /Envoyer la suite · 2/.test(b.textContent)), 'the bill offers « Envoyer la suite · 2 »');
check(/À suivre/.test(await page.$eval('#rp-items', (n) => n.textContent)), 'the bill marks the held dish « À suivre »');
await page.click('#rp-add-items');
await page.waitForFunction(() => mode === 'order', { timeout: 5000 });
await clickDish(extra.id);
check((await page.evaluate(([t, id]) => (tableOrders[t] || []).filter((l) => l.id === id).length, [A, main.id])) === 1, 'a fresh tap never stacks onto the held line');
await page.click('#cancel-new-order');
await page.waitForFunction(() => mode === 'salle', { timeout: 5000 });
const m2 = await lineOf(A, main.id);
check(m2 && !m2.sent && m2.qty === 2 && !(await lineOf(A, extra.id)), 'cancelling the additions drops the new dish and keeps the held main');

console.log('\n■ Envoyer la suite');
await page.click('#rp-send-kitchen');
await flush();
const m3 = await lineOf(A, main.id);
check(m3.sent && !m3.hold && !m3.committed, 'the main leaves; it is no longer held');
const plan2 = await lastPlan();
check(plan2 !== plan1 && plan2[0].payload.items.length === 1 && plan2[0].payload.items[0].qty === 2 && plan2[0].payload.items[0].name === main.name, 'the second bon carries 2× the main');
check(/^SUITE · /.test(plan2[0].payload.title), `titled SUITE (${plan2[0].payload.title})`);
check(!plan2[0].payload.following, 'and announces nothing more');
const r2 = await lastRelay();
check(r2 && r2 !== r1 && r2.course === 'suite' && !(r2.following && r2.following.length),
  'the remote kitchen screen gets it as the suite (relay: course suite, nothing following)');
await page.evaluate(() => kdsPaint());
const kds2 = await page.evaluate(() => document.querySelector('#kit-new').textContent.replace(/\s+/g, ' '));
check(!kds2.includes('À suivre ·'), 'the earlier card no longer announces a suite that has left');
check(/· Suite/.test(kds2), 'the new card reads « · Suite »');
check(await page.$eval('#rp-send-kitchen', (b) => b.hidden), 'nothing left to send: the button goes away');

console.log('\n■ Encaisser lance tout');
const B = await freeTable([A]);
assert.ok(B, 'a second free table');
await openTable(B);
await clickDish(starter.id);
await clickDish(main.id);
const h = await lineOf(B, main.id);
await page.click(`[data-hold-uid="${h.uid}"]`);
await page.click('#validate-order');
await flush();
check(!(await lineOf(B, main.id)).sent, 'second table: the held main waits');
const paid = await page.evaluate((t) => { const r = dispatchTableUnsentToKitchen(t, true); return !!(r && r.local); }, B);
await flush();
check(paid && (await lineOf(B, main.id)).sent, 'the payment dispatch sends the held dish too');
const src = caisseTestSource(fs.readFileSync(path.join(root, 'kiwi-caisse.html'), 'utf8'));
check(/if \(selectedId\) return dispatchTableUnsentToKitchen\(selectedId, true\);/.test(src), 'and that is the dispatch the payment path calls (paid = true)');

check(problems.length === 0, 'no page error' + (problems.length ? ': ' + problems[0] : ''));
await ctx.close();
await browser.close();
server.close();
console.log(`\ncourse-firing: ${checks} passed`);
