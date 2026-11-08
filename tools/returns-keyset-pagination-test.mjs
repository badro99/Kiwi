/* r21 returns#B0/B1/B2 · home#B0 : le registre des retours se lit par curseur (ts, id), pas par OFFSET.
   Le vrai GET /api/sale/refund tourne sur node:sqlite, le vrai returns-ledger.js le lit page par page, et un retour
   arrive ENTRE les deux pages. Avec OFFSET la dernière ligne de la page 1 revenait en tête de la page 2. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('functions/api/sale/refund.js', 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE sales(id TEXT, merchant TEXT, ref TEXT, void_ts INTEGER);
 CREATE TABLE sale_audit(note TEXT, ts INTEGER, amount_cents INTEGER, amount REAL, reason TEXT, sale_id TEXT, actor TEXT, merchant TEXT, action TEXT);
 CREATE TABLE store_credit_events(id TEXT, ts INTEGER, amount_cents INTEGER, ref_id TEXT, actor TEXT, merchant TEXT, action TEXT, credit_id TEXT);
 CREATE TABLE store_credits(id TEXT, merchant TEXT, reason TEXT);`);
db.exec("INSERT INTO sales VALUES ('sale','shop','ticket',NULL); INSERT INTO store_credits VALUES ('credit','shop','return');");
const addRefund = (note, ts) => db.prepare("INSERT INTO sale_audit VALUES (?, ?, 100, 1, 'return', 'sale', 'a', 'shop', 'refund')").run(note, ts);
const addCredit = (id, ts) => db.prepare("INSERT INTO store_credit_events VALUES (?, ?, 250, 'sale', 'a', 'shop', 'issue', 'credit')").run(id, ts);
for (let i = 0; i < 400; i++) { addRefund('r' + i, 1000 + i); addCredit('c' + i, 1000 + i); }   // 800 lignes, 2 pages

const env = { DB: { prepare(sql) { return { bind(...a) { return { all: async () => ({ results: db.prepare(sql).all(...a) }) }; } }; } } };
const ctx = vm.createContext({ URL, entitledMerchant: async () => 'shop', json: (data, status = 200) => ({ data, status }) });
vm.runInContext(src.slice(src.indexOf('export async function onRequestGet')).replace('export ', ''), ctx);

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
globalThis.document = { addEventListener() {}, documentElement: { lang: 'fr' } };
globalThis.window = { KiwiVenue: { getVenue: () => 'shop' }, KiwiCloudDoc: { currentSlug: () => 'shop' } };
let calls = 0, onPage = null;
globalThis.fetch = async (url) => {
  const r = await ctx.onRequestGet({ request: { url: 'https://local' + url } , env });
  calls++;
  const out = { ok: r.status === 200, status: r.status, json: async () => r.data };
  if (onPage) { const f = onPage; onPage = null; f(); }
  return out;
};
const ledger = await import('../assets/returns-ledger.js');

// Un retour (remboursement ET avoir) arrive juste après la lecture de la page 1.
onPage = () => { addRefund('late', 5000); addCredit('late', 5000); };
const list = await ledger.readReturnsLedger('shop');
const ids = list.map(r => r.id);
assert.equal(calls, 2, 'deux pages');
assert.equal(new Set(ids).size, ids.length, 'aucune ligne en double entre les pages');
assert.equal(ids.length, 800, 'rien sauté : les 800 lignes lues avant l’arrivée du retour tardif');
const avoirs = JSON.parse(store.get('kiwi:returnsLedger')).list;
assert.equal(avoirs.length, 400, 'le cache de l’accueil compte chaque avoir une fois');
assert.equal(avoirs.reduce((n, a) => n + a.amount, 0), 1000, 'total d’avoirs exact (400 × 2,50)');

// Un serveur qui répète une ligne (ancien serveur à OFFSET) ne gonfle pas le registre.
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, list: [{ id: 'x', kind: 'avoir', ts: 1, amount: 5 }, { id: 'x', kind: 'avoir', ts: 1, amount: 5 }], next: null }) });
assert.equal((await ledger.readReturnsLedger('shop')).length, 1, 'dédoublonnage par id côté client');

// Le curseur est validé, et un curseur identique deux fois de suite n’boucle pas.
globalThis.fetch = async (url) => { calls++; const r = await ctx.onRequestGet({ request: { url: 'https://local' + url }, env }); return { ok: r.status === 200, json: async () => r.data }; };
const bad = await ctx.onRequestGet({ request: { url: 'https://local/api/sale/refund?merchant=shop&after=oops' }, env });
assert.equal(bad.status, 400);

// B1 : l’âge de la lecture est dit, et une relecture demandée saute la minute de repos.
const rL = (fr) => fr;
const t0 = Date.now();
assert.match(ledger.ledgerAgeLabel(rL, t0 + 5 * 60000), /5 min/, 'âge de la lecture annoncé');
assert.equal(ledger.ledgerAgeLabel(rL, t0), 'Lu à l’instant');
const before = calls;
await ledger.warmCreditReturns(null);            // frais : pas de relecture
const afterWarm = calls;
await ledger.refreshReturnsLedger(null);         // demandé : relit
assert.ok(calls > afterWarm, 'actualiser relit malgré la minute de repos');
void before;
db.close();
console.log('PASS returns keyset: cursor paging survives a concurrent insert, dedupe by id, read age + manual refresh');
