#!/usr/bin/env node
import maisonSource from './pos-maison-test-source.cjs';
import { createRequire as __cr } from 'node:module';
const KiwiMoney = __cr(import.meta.url)('../assets/money-cents.js');
/* Loyalty truth (2026-10-20). Runs the real /api/clients handlers on node:sqlite
 * and the real assets/clients-store.js in a vm, and holds four rules that were
 * broken in production code:
 *
 *  1. « 10 cafés = 1 offert » stamped every sale, coffee or not. A product card
 *     now earns one stamp per qualifying item, matched by word, accents ignored.
 *  2. A redemption was accepted with no programme switched on (100 points by
 *     default). The API now refuses it, like the till.
 *  3. Points rounded to the nearest point: 99,50 MAD crossed a 100-point
 *     threshold. They now round down, like prices.
 *  4. A return never took a stamp back. It now takes back what that ticket
 *     earned, never more.
 *
 * Plus the boutique and maison tills: the ticket-level loyalty discount and the
 * points toast follow the same round-down rule.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { world, load } from './retail-money-harness.cjs';
import mergedPart from './merged-source.cjs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as clientsPost } from '../functions/api/clients.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'loyalty-truth-secret';
const MERCHANT = 'loyalty-truth-merchant';
let checks = 0;
const check = (ok, msg) => { checks += 1; assert.ok(ok, msg); console.log(`  ✓ ${msg}`); };

function facade(raw) {
  return {
    prepare(sql) {
      let args = [];
      const st = {
        bind(...v) { args = v.map((x) => x === undefined ? null : x); return st; },
        async first() { return raw.prepare(sql).get(...args) || null; },
        async all() { return { results: raw.prepare(sql).all(...args) }; },
        async run() { const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes || 0) } }; },
      };
      return st;
    },
    async batch(list) {
      raw.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const s of list) out.push(await s.run()); raw.exec('COMMIT'); return out; }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}

const owner = sessionCookie(await makeSession('loyalty-owner', SECRET)).split(';')[0];

function store(cfg) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(maisonSource(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8')));
  const now = Date.now();
  raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('loyalty-owner', 'loyalty@example.test', 'Owner', 'Store', 's', 'h', now);
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Store', 'loyalty-owner', now);
  if (cfg) raw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'fidelity', JSON.stringify(cfg), 1, now);
  raw.prepare('INSERT INTO clients (merchant,id,name,points,stamps,visits,spend,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(MERCHANT, 'c1', 'Client', 0, 0, 0, 0, now, now);
  const env = { DB: facade(raw), AUTH_SECRET: SECRET };
  const post = async (body) => {
    const res = await clientsPost({ env, request: new Request('https://kiwi.test/api/clients', {
      method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
      body: JSON.stringify({ merchant: MERCHANT, ...body }),
    }) });
    return { status: res.status, body: await res.json() };
  };
  const row = () => raw.prepare('SELECT points, stamps, visits, spend FROM clients WHERE merchant=? AND id=?').get(MERCHANT, 'c1');
  return { post, row, raw };
}

console.log('\nCarte produit : un tampon par article choisi, pas par passage');
{
  const s = store({ model: 'product', product: { item: 'Café', target: 10, reward: '1 offert' } });
  await s.post({ purchase: { clientId: 'c1', ref: 'p:1', amount: 95, saleRef: 'T1', items: [{ name: 'Tajine poulet citron', qty: 1, total: 95 }] } });
  check(Number(s.row().stamps) === 0 && Number(s.row().visits) === 1, 'a tajine alone earns no coffee stamp (the visit still counts)');
  await s.post({ purchase: { clientId: 'c1', ref: 'p:2', amount: 36, saleRef: 'T2',
    items: [{ name: 'Café noir', qty: 2, total: 24 }, { name: 'CAFE CREME', qty: 1, total: 12 }] } });
  check(Number(s.row().stamps) === 3, 'two « Café noir » and one « CAFE CREME » earn 3 stamps (accents and case ignored)');
  await s.post({ purchase: { clientId: 'c1', ref: 'p:3', amount: 60, saleRef: 'T3', items: [{ name: 'Décaféiné', qty: 5, total: 60 }] } });
  check(Number(s.row().stamps) === 3, '« Décaféiné » is not « Café »: matching is by whole word');
  await s.post({ purchase: { clientId: 'c1', ref: 'p:4', amount: 0 } });
  check(Number(s.row().stamps) === 4, 'a visit recorded by hand, with no lines, still earns one stamp');

  let r = await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:r1', amount: 12, saleRef: 'T2', items: [{ name: 'Café noir', qty: 1, total: 12 }] } });
  check(r.status === 200 && Number(s.row().stamps) === 3, 'returning one « Café noir » takes back one stamp');
  r = await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:r2', amount: 24, saleRef: 'T2', items: [{ name: 'Café noir', qty: 5, total: 24 }] } });
  check(Number(s.row().stamps) === 1, 'a return never takes back more stamps than that ticket earned (3 earned, 3 taken in all)');
  r = await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:r2', amount: 24, saleRef: 'T2', items: [{ name: 'Café noir', qty: 5, total: 24 }] } });
  check(Number(s.row().stamps) === 1, 'a replayed return applies once');
}

{
  const s = store({ model: 'product', product: { item: 'قهوة', target: 10, reward: '1 offert' } });
  const r = await s.post({ purchase: { clientId: 'c1', ref: 'arabic:1', amount: 36, saleRef: 'AR1',
    items: [{ name: 'قهوة سوداء', qty: 2, total: 24 }, { name: 'قهوة', qty: 1, total: 12 }, { name: 'قهوية', qty: 4, total: 0 }] } });
  check(r.status === 200 && Number(s.row().stamps) === 3, 'Arabic product earns stamps by whole word through the purchase handler');
  await s.post({ refund: { clientId: 'c1', ref: 'refund:arabic:return', amount: 12, saleRef: 'AR1', items: [{ name: 'قهوة سوداء', qty: 1, total: 12 }] } });
  check(Number(s.row().stamps) === 2, 'Arabic product return reverses the qualifying stamp');
}

// Note 13, loyalty#0: a product linked by id keeps earning after a rename, and a
// new product carrying the word still earns. Server handler first.
{
  const s = store({ model: 'product', product: { item: 'Croissant', target: 10, ids: ['menu-12'] } });
  let r = await s.post({ purchase: { clientId: 'c1', ref: 'id:1', amount: 36, saleRef: 'ID1',
    items: [{ name: 'Viennoiserie du matin', id: 'menu-12', qty: 2, total: 24 }, { name: 'Croissant amande', id: 'menu-40', qty: 1, total: 12 }, { name: 'Pain au chocolat', id: 'menu-13', qty: 4, total: 40 }] } });
  check(r.status === 200 && Number(s.row().stamps) === 3, 'a renamed linked croissant (by id) and a new « Croissant amande » (by word) earn 3; the pain au chocolat earns none');
  r = await s.post({ purchase: { clientId: 'c1', ref: 'id:2', amount: 12, saleRef: 'ID2', items: [{ itemId: 'menu-12', name: 'Le classique', qty: 1, total: 12 }] } });
  check(Number(s.row().stamps) === 4, 'the restaurant line shape (itemId) is read as the product id');
  await s.post({ refund: { clientId: 'c1', ref: 'refund:id:1', amount: 24, saleRef: 'ID1', items: [{ name: 'Viennoiserie du matin', id: 'menu-12', qty: 2, total: 24 }] } });
  check(Number(s.row().stamps) === 2, 'returning the renamed croissants takes their two stamps back');
  const storedIds = () => s.raw.prepare("SELECT json_extract(items, '$[0].id') AS id FROM client_purchase_events WHERE ref = ?").get('id:1');
  check(storedIds().id === 'menu-12', 'the recorded line keeps its product id for later returns');
  s.raw.close();
}

// Full handler path: punctuation, renamed catalogue labels, partial and replayed returns.
for (const [product, sold, renamed] of [
  ['Café', '« CAFÉ » / crème', 'Expresso maison'],
  ['Coffee', 'Coffee: black!', 'House espresso'],
  ['قهوة', 'قَهْوَة، سوداء', 'مشروب البيت'],
]) {
  const s = store({ model: 'product', product: { item: product, target: 10 } });
  const saleRef = 'punctuation-name-edit';
  const buy = await s.post({ purchase: { clientId: 'c1', ref: 'name:buy', saleRef, amount: 36,
    items: [{ name: sold, qty: 3, total: 36 }] } });
  check(buy.status === 200 && Number(s.row().stamps) === 3, `${product}: punctuation earns through the purchase handler`);
  await s.post({ refund: { clientId: 'c1', ref: 'refund:name:partial', saleRef, amount: 12,
    items: [{ name: sold, qty: 1, total: 12 }] } });
  check(Number(s.row().stamps) === 2, `${product}: partial return reverses one`);
  const refund = { clientId: 'c1', ref: 'refund:name:rest', saleRef, amount: 24,
    items: [{ name: renamed, qty: 2, total: 24 }] };
  await s.post({ refund });
  check(Number(s.row().stamps) === 0 && Number(s.row().spend) === 0, `${product}: renamed full remainder reverses all historical earning`);
  await s.post({ refund });
  check(Number(s.row().stamps) === 0, `${product}: replay cannot reverse twice`);
  s.raw.close();
}

console.log('\nCarte passages : un retour complet reprend le tampon du passage');
{
  const s = store({ model: 'visit', visit: { target: 10, reward: '1 offert' } });
  await s.post({ purchase: { clientId: 'c1', ref: 'p:1', amount: 100, saleRef: 'V1', items: [{ name: 'Robe', qty: 1, total: 100 }] } });
  await s.post({ purchase: { clientId: 'c1', ref: 'p:2', amount: 50, saleRef: 'V2', items: [{ name: 'Foulard', qty: 1, total: 50 }] } });
  check(Number(s.row().stamps) === 2, 'one stamp per visit, whatever was bought');
  await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:v1', amount: 40, saleRef: 'V1' } });
  check(Number(s.row().stamps) === 2, 'a partial return keeps the visit stamp');
  await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:v2', amount: 50, saleRef: 'V2' } });
  check(Number(s.row().stamps) === 1, 'a whole ticket returned takes its visit stamp back');
}

console.log('\nPoints : arrondis vers le bas, comme les prix');
{
  const s = store({ model: 'amount', amount: { perMad: 1, threshold: 100, reward: '−10 %' } });
  await s.post({ purchase: { clientId: 'c1', ref: 'p:1', amount: 99.5, saleRef: 'A1' } });
  check(Number(s.row().points) === 99, '99,50 MAD at one point a dirham earns 99 points, not 100');
  const r = await s.post({ redemption: { clientId: 'c1', ref: 'redemption:1' } });
  check(r.status === 409 && r.body.error === 'reward-not-ready', '99 points do not unlock a 100-point reward');
}

console.log('\nRetour après une récompense : le solde et l\'historique restent égaux');
{
  const s = store({ model: 'amount', amount: { perMad: 1, threshold: 100, reward: '−10 %' } });
  await s.post({ purchase: { clientId: 'c1', ref: 'p:b1', amount: 300, saleRef: 'B1', items: [{ name: 'Caftan', qty: 1, total: 300 }] } });
  const red = await s.post({ redemption: { clientId: 'c1', ref: 'redemption:b1' } });
  const spent = 300 - Number(s.row().points);
  check(red.status === 200 && spent > 0, `the reward is redeemed (${spent} points spent)`);
  const r = await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:b1', amount: 300, saleRef: 'B1' } });
  const ledger = () => {
    const e = s.raw.prepare('SELECT COALESCE(SUM(points),0) AS p FROM client_purchase_events WHERE merchant=? AND client_id=?').get(MERCHANT, 'c1').p;
    const w = s.raw.prepare('SELECT COALESCE(SUM(points_delta),0) AS p FROM client_reward_events WHERE merchant=? AND client_id=?').get(MERCHANT, 'c1').p;
    return Number(e) - Number(w);
  };
  check(r.status === 200 && Number(s.row().points) === 0, 'returning the whole ticket empties the card, never below zero');
  check(Number(r.body.points) === -(300 - spent), `the return takes back what the card still held (${300 - spent}), not the 300 the ticket earned`);
  check(ledger() === Number(s.row().points), `history (${ledger()}) equals the balance (${Number(s.row().points)})`);
}

console.log('\nRécompense : rien à remettre sans programme');
for (const [label, cfg] of [['no programme saved', null], ['the till\'s deduced default', { auto: true, model: 'amount', amount: { perMad: 1, threshold: 100 } }]]) {
  const s = store(cfg);
  s.raw.prepare('UPDATE clients SET points = 500 WHERE merchant=? AND id=?').run(MERCHANT, 'c1');
  const r = await s.post({ redemption: { clientId: 'c1', ref: 'redemption:off' } });
  check(r.status === 409 && r.body.error === 'loyalty-off' && Number(s.row().points) === 500,
    `${label}: a redemption is refused and old points stay untouched`);
}

console.log('\nCaisse : la même règle avant la réponse du serveur');
{
  const storage = new Map([['kiwiLive', '1'], ['kiwiLiveMerchant', MERCHANT]]);
  const stores = {};
  const define = (name, options) => {
    const st = stores[name] || { data: {}, listeners: [] };
    st.get = (key) => st.data[key] || (options.blank ? options.blank() : null);
    st.set = (value, key) => { st.data[key] = value; st.listeners.forEach((fn) => fn(key)); };
    st.subscribe = (fn) => { st.listeners.push(fn); return () => {}; };
    return (stores[name] = st);
  };
  const localStorage = { getItem: (k) => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
  const window = { localStorage, KiwiStore: { define, currentVenue: () => MERCHANT }, KiwiEnv: { isReal: () => true }, addEventListener: () => {} };
  const context = { window, KiwiStore: window.KiwiStore, KiwiEnv: window.KiwiEnv, localStorage, console, Math, Date, JSON,
    setInterval: () => 1, clearInterval: () => {}, fetch: async () => ({ ok: false, json: async () => ({ clients: [], cursor: 0 }) }) };
  vm.runInNewContext(maisonSource(fs.readFileSync(path.join(ROOT, 'assets/clients-store.js'), 'utf8')), context, { filename: 'assets/clients-store.js' });
  const KC = context.window.KiwiClients;
  KC.setConfig({ model: 'product', product: { item: 'Café', target: 10, reward: '1 offert' } }, MERCHANT);
  const c = KC.upsert({ name: 'Client', phone: '0612345678' }, MERCHANT);
  KC.recordPurchase(c.id, { amount: 95, saleRef: 'T1', eventRef: 'T1', items: [{ name: 'Tajine', qty: 1, total: 95 }] }, MERCHANT);
  KC.recordPurchase(c.id, { amount: 24, saleRef: 'T2', eventRef: 'T2', items: [{ name: 'Café noir', qty: 3, total: 36 }] }, MERCHANT);
  check(Number(KC.get(c.id, MERCHANT).stamps) === 3, 'the till counts 3 stamps for a tajine then three coffees, as the server will');
  KC.recordRefund(c.id, { amount: 12, saleRef: 'T2', eventRef: 'R1', items: [{ name: 'Café noir', qty: 1, total: 12 }] }, MERCHANT);
  check(Number(KC.get(c.id, MERCHANT).stamps) === 2, 'the till takes a stamp back when a coffee is returned');
  KC.setConfig({ model: 'product', product: { item: 'قهوة', target: 10, reward: '1 offert' } }, MERCHANT);
  const stamps = Number(KC.get(c.id, MERCHANT).stamps);
  KC.recordPurchase(c.id, { amount: 24, saleRef: 'AR2', eventRef: 'AR2', items: [{ name: 'قهوة سوداء', qty: 2, total: 24 }] }, MERCHANT);
  check(Number(KC.get(c.id, MERCHANT).stamps) === stamps + 2, 'offline client book also earns Arabic product stamps');
  const clientStamps = () => Number(KC.get(c.id, MERCHANT).stamps);
  for (const [item, name, renamed] of [['Café', '« CAFÉ » crème', 'Expresso'], ['Coffee', 'Coffee: black!', 'House espresso'], ['قهوة', 'قَهْوَة، سوداء', 'مشروب البيت']]) {
    KC.setConfig({ model: 'product', product: { item, target: 10 } }, MERCHANT);
    const before = clientStamps();
    const saleRef = 'rename-' + item;
    KC.recordPurchase(c.id, { amount: 36, saleRef, eventRef: saleRef, items: [{ name, qty: 3, total: 36 }] }, MERCHANT);
    check(clientStamps() === before + 3, item + ': local sale matches punctuation');
    KC.recordRefund(c.id, { amount: 12, saleRef, eventRef: saleRef + '-partial', items: [{ name, qty: 1, total: 12 }] }, MERCHANT);
    const refund = { amount: 24, saleRef, eventRef: saleRef + '-rest', items: [{ name: renamed, qty: 2, total: 24 }] };
    KC.recordRefund(c.id, refund, MERCHANT);
    check(clientStamps() === before, item + ': local full remainder reverses historical stamps after rename');
    KC.recordRefund(c.id, refund, MERCHANT);
    check(clientStamps() === before, item + ': local refund replay is idempotent');
  }
  {
    KC.setConfig({ model: 'product', product: { item: 'Croissant', target: 10, ids: ['prod_7'] } }, MERCHANT);
    const before = clientStamps();
    KC.recordPurchase(c.id, { amount: 30, saleRef: 'ID-L', eventRef: 'ID-L', items: [{ name: 'Viennoiserie du matin', id: 'prod_7', qty: 2, total: 24 }, { name: 'Thé', id: 'prod_9', qty: 1, total: 6 }] }, MERCHANT);
    check(clientStamps() === before + 2, 'the till counts a renamed linked product by its id, as the server does');
    KC.recordRefund(c.id, { amount: 12, saleRef: 'ID-L', eventRef: 'ID-L-r', items: [{ name: 'Viennoiserie du matin', id: 'prod_7', qty: 1, total: 12 }] }, MERCHANT);
    check(clientStamps() === before + 1, 'the till takes the renamed product\'s stamp back on return');
  }
  KC.setConfig({ model: 'amount', amount: { perMad: 1, threshold: 100 } }, MERCHANT);
  const before = Number(KC.get(c.id, MERCHANT).points) || 0;
  KC.recordPurchase(c.id, { amount: 99.5, saleRef: 'A1', eventRef: 'A1' }, MERCHANT);
  check(Number(KC.get(c.id, MERCHANT).points) - before === 99, 'the till credits 99 points for 99,50 MAD');
}

console.log('\nMaison : la remise fidélité et le toast');
{
  const read = (f) => maisonSource(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  for (const f of ['assets/pos-maison.js']) {
    const src = read(f);
    const fn = src.slice(src.indexOf('function rewardDiscount('), src.indexOf('function rewardDiscount(') + 900);
    /* Décision 2026-10-26 : la remise en pourcentage au centime le plus proche, la même règle
       que functions/api/_rules-loyalty.js (au dirham, l'ancien arrondi vers le bas évitait
       0,50 de trop ; au centime, l'écart est d'au plus un centime). */
    check(/Math\.round\(base \* Math\.min\(100, Math\.max\(0, \+r\.value \|\| 0\)\) \+ 1e-9\) \/ 100/.test(fn) && !/base - shelf\(/.test(fn),
      `${f}: a percent reward is rounded to the nearest centime, the rule every trade shares`);
    check(!/Math\.round\(receivedNow \* \(\(cfg\.amount/.test(src) && !/Math\.round\(receivedNow \/ 10\)/.test(src),
      `${f}: the points toast never rounds up nor assumes one point per 10 MAD`);
  }
}

// Full boutique reward confirmation -> checkout commit -> immutable receipt.
for (const accepted of [true, false]) {
  const w = world('boutique'), c = w.c;
  w.storage.set('kiwiLive','1'); w.storage.set('kiwiLiveMerchant',MERCHANT);
  const cfg = { model: 'amount', amount: { perMad: 1, threshold: 100, reward: '−10 %' } };
  const server = store(cfg);
  server.raw.prepare('UPDATE clients SET points=100 WHERE merchant=? AND id=?').run(MERCHANT,'c1');
  const docs = { clients: { list: [{ id:'c1', name:'Client', points:100, achats:0 }], seq:2 }, fidelity:cfg };
  Object.assign(c, { M: KiwiMoney, KiwiMoney, IS_DEMO:false, addEventListener(){}, dispatchEvent(){}, setInterval(){},
    document:{readyState:'loading',addEventListener(){}},
    KiwiStore:{currentVenue:()=>MERCHANT,define:(name,opts)=>({get:()=>docs[name] || opts.blank?.(),set:v=>{docs[name]=v;},subscribe(){}})},
    KiwiLive:{isOn:()=>true,merchant:()=>MERCHANT},
    fetch:async (_url,opts)=>{
      const body=JSON.parse(opts?.body || '{}');
      if (!body.redemption && !body.purchase) return {ok:true,json:async()=>({clients:[]})};
      const r=body.redemption && !accepted ? {status:409,body:{error:'reward-not-ready'}} : await server.post(body);
      return {ok:r.status===200,status:r.status,json:async()=>r.body};
    },
  });
  c.navigator.onLine=true;
  vm.runInContext(fs.readFileSync('assets/clients-store.js','utf8'),c);
  vm.runInContext(mergedPart('assets/retail-sale-hold.js','assets/loyalty-reserve.js'),c);
  vm.runInContext(fs.readFileSync('assets/receipt.js','utf8'),c);
  c.ticketOwner=vm.runInNewContext(fs.readFileSync('assets/pos-boutique/ticket-owner.js','utf8').replace('export { ticketOwner };','ticketOwner;'));
  const customer=c.KiwiClients.get('c1',MERCHANT);
  c.P={p:{name:'Article',price:24.95}};
  const ticket={num:'AR-1',syncId:'loyalty-full-sale',period:'2026',client:'c1',lines:[{pid:'p',qty:1,remise:0,promoPrice:24.95}],reward:{clientId:'c1',kind:'percent',value:10,label:'−10 %'}};
  Object.assign(c,{state:{ticket,checkoutBusy:false},ticketPeriod:()=> '2026',ticketClient:()=>customer,ticketStockIssue:()=>null,
    showStockIssue(){},renderTicket(){},renderGrid(){},renderBadges(){},persistStock(){},freshTicket(){},headSubVente:()=>'',
    firstName:n=>n,useKiwiCl:()=>true,queueIfOffline(){},
    root:{dispatchEvent(){}},KiwiPrinter:{printReceipt:async()=>({ok:true})},
  });
  load(c,'assets/pos-boutique.js',['bqMoney','linePromo','promoLabelForTicket','checkout']);
  load(c,'assets/pos-boutique/checkout.js',['printReceiptNow']);
  c.$=(selector,...args)=>selector==='#bq-today'?{textContent:''}:w.$(selector,...args);
  c.checkout();
  w.$$('[data-bq-m]').find(n=>n.dataset.bqM==='especes').onclick();
  w.$('#bq-cash-in').value='22.45';w.$('#bq-cash-in').oninput({target:w.$('#bq-cash-in')});
  w.click('#bq-cash-ok');
  for(let i=0;i<30;i++) await new Promise(setImmediate);
  if(accepted){
    check(c.SALES.length===1 && c.SALES[0].total===22.45 && c.SALES[0].discount===2.5,'accepted reward commits the actual discounted checkout once');
    check(c.SALES[0].rc?.totals.total===22.45 && c.SALES[0].rc.totals.discount===2.5 && c.SALES[0].rc.totals.subtotal===24.95 && c.SALES[0].rc.pay[0].amount===22.45,'actual receipt freezes subtotal, reward, paid total and tender');
    check(Number(server.row().points)<100,'actual reservation spends server points');
  } else {
    check(c.SALES.length===0 && ticket.reward===undefined,'refused reservation stops the actual checkout before sale and receipt');
  }
  server.raw.close();
}

console.log(`\n✓ loyalty truth: ${checks} checks`);
