/* Accords du patron (Browse, 25 nov. 2026) : la caisse demande, le patron
 * décide, et ce qu'il accepte ne couvre que ce qu'il a vu.
 *
 * Contre une vraie base SQLite (schema.sql) et les vraies routes :
 *  A · réglages : la caisse lit, seul le patron écrit ;
 *  B · une demande se refuse quand l'accord n'est pas demandé ;
 *  C · le montant et le libellé viennent du serveur, jamais de la caisse
 *      (revue de sécurité : « 5 MAD » annoncé pour une vente de 2 000) ;
 *  D · décision : patron seulement, une fois ; la caisse reçoit sa preuve ;
 *  E · une ligne de cuisine : la preuve au nom du patron n'annule que CETTE
 *      ligne, et rien d'autre (table entière, chambres d'hôtel) ;
 *  F · une vente : l'accord s'utilise une fois ;
 *  G · une sortie d'espèces : preuve signée pour CE montant ;
 *  H · expiration ; téléphones du patron ;
 *  I · le panneau du tableau de bord se charge sans planter ;
 *  K · le téléphone du serveur : ligne envoyée, « − », table entière.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
let checks = 0;
function ok(label, cond, extra) { checks++; if (!cond) { console.error('✗ owner-approvals-test : ' + label + (extra ? ' · ' + extra : '')); process.exit(1); } }

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...v) { args = v.map((x) => (x === undefined ? null : x)); return st; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
    return st;
  },
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
};
const SECRET = 'synthetic-owner-approvals-only';
const env = { DB, AUTH_SECRET: SECRET };
const SHOP = 'approvals-fixture', OTHER = 'approvals-other';
const now = Date.now();
sqlite.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-p','p@shop.ma','P','Shop','00','00',?)").run(now);
sqlite.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-x','x@shop.ma','X','Other','00','00',?)").run(now);
sqlite.prepare("INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','pro','restaurant','acc-p','Shop','active',0,?)").run(SHOP, now);
sqlite.prepare("INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','pro','restaurant','acc-x','Other','active',0,?)").run(OTHER, now);

const AUTH = await mod('functions/auth/_lib.js');
const APPROVALS = await mod('functions/api/approvals.js');
const LIB = await mod('functions/api/_owner-approvals.js');
const QTY = await mod('functions/api/order/_queue-quantities.js');
const ACT = await mod('functions/api/_act-proof.js');
const CANCEL = await mod('functions/api/sale/cancel.js');

const tillCookie = `${AUTH.TILL_COOKIE}=${await AUTH.tillToken(SECRET, SHOP)}`;
const ownerCookie = `${AUTH.SESS_COOKIE}=${await AUTH.makeSession('acc-p', SECRET)}`;
const strangerCookie = `${AUTH.SESS_COOKIE}=${await AUTH.makeSession('acc-x', SECRET)}`;
const req = (url, cookie, body) => new Request('https://kiwi.test' + url, {
  method: body ? 'POST' : 'GET',
  headers: { 'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '192.0.2.7' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
async function call(cookie, body) {
  const res = await APPROVALS.onRequestPost({ request: req('/api/approvals', cookie, { merchant: SHOP, ...body }), env });
  return { status: res.status, body: await res.json() };
}
async function read(cookie, query) {
  const res = await APPROVALS.onRequestGet({ request: req('/api/approvals?merchant=' + SHOP + '&' + query, cookie), env });
  return { status: res.status, body: await res.json() };
}

/* ── A · réglages ── */
{
  const r = await read(tillCookie, 'settings=1');
  ok('A1 la caisse lit les réglages (tout éteint par défaut)', r.status === 200 && r.body.settings.cashOut === false && r.body.settings.cancel === false, JSON.stringify(r));
  const w = await call(tillCookie, { action: 'settings', settings: { cashOut: true } });
  ok('A2 la caisse ne règle rien', w.status === 403 && w.body.error === 'owner-on-till', JSON.stringify(w));
  const s = await call(strangerCookie, { action: 'settings', settings: { cashOut: true } });
  ok('A3 le patron d\'un autre commerce ne règle rien', s.status === 403, JSON.stringify(s));
  const l = await read(tillCookie, 'list=1');
  ok('A4 la caisse ne lit pas la liste des demandes', l.status === 403 && l.body.error === 'owner-only', JSON.stringify(l));
}

/* ── B · rien n'est demandé tant que le patron ne l'a pas voulu ── */
{
  const r = await call(tillCookie, { action: 'request', kind: 'cash-out', amountCents: 20000 });
  ok('B1 accord non demandé : la caisse garde son chemin habituel', r.status === 409 && r.body.error === 'approval-off', JSON.stringify(r));
  const on = await call(ownerCookie, { action: 'settings', settings: { cashOut: true, cancel: true, managerFallback: true, minCents: 0 } });
  ok('B2 le patron allume les accords', on.status === 200 && on.body.settings.cashOut && on.body.settings.cancel, JSON.stringify(on));
  const owner = await call(ownerCookie, { action: 'request', kind: 'cash-out', amountCents: 100 });
  ok('B3 une demande vient d\'une caisse appairée seulement', owner.status === 403 && owner.body.error === 'till-only', JSON.stringify(owner));
}

/* ── C · ce que le patron lit vient du serveur ── */
sqlite.prepare("INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts) VALUES ('sale-big', ?, 2000, 200000, 'cash', 'Table 7', 'T-0042', ?)").run(SHOP, now - 60000);
sqlite.prepare("INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts) VALUES ('sale-oth', ?, 50, 5000, 'card', 'Autre', 'O-1', ?)").run(OTHER, now - 60000);
const orderLines = [
  { uid: 'line-tajine', id: 'p-tajine', name: 'Tajine', unitPrice: 85, qty: 2 },
  { uid: 'line-cafe', id: 'p-cafe', name: 'Café', unitPrice: 15, qty: 1 },
];
sqlite.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, lines, total, status, created_ts, updated_ts) VALUES ('ord-1', ?, 12, 'table', '4', ?, 185, 'accepted', ?, ?)").run(SHOP, JSON.stringify(orderLines), now - 120000, now - 120000);
let saleApproval, lineApproval;
{
  const r = await call(tillCookie, { action: 'request', kind: 'cancel-sale', ref: 'sale-big', label: 'Café', amountCents: 500, requestedBy: 'Karim' });
  ok('C1 annulation de vente déposée', r.status === 201, JSON.stringify(r));
  ok('C2 le montant est celui de la vente (2 000 MAD), pas celui annoncé par la caisse', r.body.approval.amountCents === 200000, JSON.stringify(r.body.approval));
  ok('C3 le libellé est celui de la vente', /Table 7/.test(r.body.approval.label) && /Espèces/.test(r.body.approval.label) && !/Café/.test(r.body.approval.label), r.body.approval.label);
  saleApproval = r.body.approval.id;
  const other = await call(tillCookie, { action: 'request', kind: 'cancel-sale', ref: 'sale-oth', amountCents: 100 });
  ok('C4 la vente d\'un autre commerce est introuvable', other.status === 404 && other.body.error === 'sale-not-found', JSON.stringify(other));
  const bad = await call(tillCookie, { action: 'request', kind: 'cancel-sale', ref: "x' OR 1=1 --" });
  ok('C5 une référence mal formée est refusée', bad.status === 400 && bad.body.error === 'bad-ref', JSON.stringify(bad));

  const v = await call(tillCookie, { action: 'request', kind: 'void-sent', ref: 'line-tajine', label: '1 × Eau', amountCents: 100, requestedBy: 'Karim' });
  ok('C6 ligne en cuisine : montant et libellé relus sur la commande', v.status === 201 && v.body.approval.amountCents === 17000 && v.body.approval.label === '2 × Tajine', JSON.stringify(v.body));
  lineApproval = v.body.approval.id;
  ok('C6b l\'accord retient la commande et la ligne', sqlite.prepare('SELECT ref FROM owner_approvals WHERE id = ?').get(lineApproval).ref === 'ord-1|line-tajine');
  sqlite.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, lines, total, status, created_ts, updated_ts) VALUES ('ord-2', ?, 13, 'table', '5', ?, 5, 'accepted', ?, ?)").run(SHOP, JSON.stringify([{ uid: 'line-dup', id: 'p-eau', name: 'Eau', unitPrice: 5, qty: 1 }]), now - 1000, now - 1000);
  sqlite.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, lines, total, status, created_ts, updated_ts) VALUES ('ord-3', ?, 14, 'table', '6', ?, 900, 'accepted', ?, ?)").run(SHOP, JSON.stringify([{ uid: 'line-dup', id: 'p-mechoui', name: 'Méchoui', unitPrice: 900, qty: 1 }]), now - 5000, now - 5000);
  const dup = await call(tillCookie, { action: 'request', kind: 'void-sent', ref: 'line-dup' });
  ok('C6c un uid présent dans deux commandes ouvertes est refusé (revue Fable)', dup.status === 409 && dup.body.error === 'ambiguous-line', JSON.stringify(dup));
  const gone = await call(tillCookie, { action: 'request', kind: 'void-sent', ref: 'line-absente' });
  ok('C7 une ligne absente des commandes ouvertes est introuvable', gone.status === 404 && gone.body.error === 'line-not-found', JSON.stringify(gone));
}

/* ── D · la décision ── */
{
  const early = await read(tillCookie, 'id=' + saleApproval);
  ok('D1 en attente : aucune preuve pour la caisse', early.status === 200 && early.body.approval.status === 'pending' && !early.body.grant, JSON.stringify(early.body));
  const tillDecides = await call(tillCookie, { action: 'decide', id: saleApproval, verdict: 'approve' });
  ok('D2 la caisse ne s\'accorde rien', tillDecides.status === 403, JSON.stringify(tillDecides));
  const stranger = await call(strangerCookie, { action: 'decide', id: saleApproval, verdict: 'approve' });
  ok('D3 un autre compte ne décide pas', stranger.status === 403, JSON.stringify(stranger));
  const both = await call(tillCookie + '; ' + ownerCookie, { action: 'decide', id: saleApproval, verdict: 'approve' });
  ok('D3b une caisse où la session du patron est ouverte ne décide pas (revue Fable)', both.status === 403 && both.body.error === 'owner-on-till', JSON.stringify(both));
  const bothSettings = await call(tillCookie + '; ' + ownerCookie, { action: 'settings', settings: { cashOut: false } });
  ok('D3c ni ne coupe les accords', bothSettings.status === 403);
  const list = await read(ownerCookie, 'list=1');
  ok('D4 le patron voit ses demandes en attente', list.status === 200 && list.body.items.filter((i) => i.status === 'pending').length === 2, JSON.stringify(list.body));
  const yes = await call(ownerCookie, { action: 'decide', id: saleApproval, verdict: 'approve' });
  ok('D5 le patron accepte', yes.status === 200 && yes.body.approval.status === 'approved', JSON.stringify(yes));
  const twice = await call(ownerCookie, { action: 'decide', id: saleApproval, verdict: 'refuse' });
  ok('D6 une décision ne se reprend pas', twice.status === 409 && twice.body.error === 'already-decided', JSON.stringify(twice));
  const yes2 = await call(ownerCookie, { action: 'decide', id: lineApproval, verdict: 'approve' });
  ok('D7 le patron accepte la ligne', yes2.status === 200, JSON.stringify(yes2));
}

/* ── E · une ligne de cuisine, et seulement elle ── */
{
  const g = await read(tillCookie, 'id=' + lineApproval);
  ok('E1 la caisse reçoit une preuve de personne au nom du patron', g.body.grant && g.body.grant.actorProof && g.body.grant.actor.id === LIB.OWNER_ACTOR_ID, JSON.stringify(g.body));
  const pinActor = await AUTH.readTillActorProof(g.body.grant.actorProof, SECRET, SHOP);
  ok('E2 la preuve se relit', pinActor && pinActor.id === LIB.OWNER_ACTOR_ID);
  const ctx = (voidLine) => ({ env, b: { voidLine }, merchant: SHOP, now: Date.now(), employee: null, pairedTill: true, pinActor,
    ownerApprovals: { gate: LIB.ownerGate, voidRef: LIB.voidRef, lineCents: LIB.lineCents, tableVisitCents: LIB.tableVisitCents } });
  /* La route marque l'accord utilisé une fois le geste réussi (queue.js › settle). */
  const settled = async (c) => { const res = await QTY.voidLine(c); if (res && res.status < 300 && c.ownerApprovalUsed) await LIB.markUsed(env, SHOP, c.ownerApprovalUsed.id); return res; };
  const bare = await QTY.voidLine({ ...ctx({ orderId: 'ord-1', table: '4', immediate: true, requestId: 'voi-ffffffffffffffffffff', lineId: 'line-tajine', qty: 1, ownerApproval: lineApproval }), ownerApprovals: undefined });
  ok('E2b sans les outils de la route, la preuve du patron est refusée', bare.status === 403);
  const wrong = await QTY.voidLine(ctx({ orderId: 'ord-1', table: '4', immediate: true, requestId: 'voi-aaaaaaaaaaaaaaaaaaaa', lineId: 'line-cafe', qty: 1, ownerApproval: lineApproval }));
  ok('E3 l\'accord pour le tajine n\'annule pas le café', wrong.status === 403 && (await wrong.json()).error === 'owner-approval-invalid');
  sqlite.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, lines, total, status, created_ts, updated_ts) VALUES ('ord-9', ?, 19, 'table', '9', ?, 900, 'accepted', ?, ?)").run(SHOP, JSON.stringify([{ uid: 'line-tajine-x', id: 'p-tajine', name: 'Tajine royal', unitPrice: 450, qty: 2 }]), now - 9000, now - 9000);
  const otherOrder = await QTY.voidLine(ctx({ orderId: 'ord-9', table: '9', immediate: true, requestId: 'voi-eeeeeeeeeeeeeeeeeeee', lineId: 'line-tajine-x', qty: 1, ownerApproval: lineApproval }));
  ok('E3b l\'accord ne sert pas sur une autre commande', otherOrder.status === 403);
  const none = await QTY.voidLine(ctx({ orderId: 'ord-1', table: '4', immediate: true, requestId: 'voi-bbbbbbbbbbbbbbbbbbbb', lineId: 'line-tajine', qty: 1 }));
  ok('E4 sans identifiant d\'accord, la preuve du patron ne vaut rien', none.status === 403);
  const right = await settled(ctx({ orderId: 'ord-1', table: '4', immediate: true, requestId: 'voi-cccccccccccccccccccc', lineId: 'line-tajine', qty: 1, ownerApproval: lineApproval }));
  const rb = await right.json();
  ok('E5 la ligne acceptée s\'annule', right.status === 200 && rb.directVoid === true, JSON.stringify(rb));
  ok('E6 l\'accord est marqué utilisé', sqlite.prepare('SELECT status FROM owner_approvals WHERE id = ?').get(lineApproval).status === 'used');
  const again = await settled(ctx({ orderId: 'ord-1', table: '4', immediate: true, requestId: 'voi-dddddddddddddddddddd', lineId: 'line-tajine', qty: 1, ownerApproval: lineApproval }));
  ok('E7 un accord utilisé ne resert pas', again.status === 403);
  const queueSrc = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');
  ok('E8b la preuve du patron court-circuite tous les autres gestes, avant cancelTable (revue Fable)', queueSrc.indexOf('return (await settle(await voidLine(ctx))) || json({ error: \'owner-approval-invalid\' }') > 0
    && queueSrc.indexOf('return (await settle(await voidLine(ctx)))') < queueSrc.indexOf('const handled = await cancelTable(ctx)'));
  ok('E8c un accord se prend avant le geste et se rend si le geste échoue (revue de sécurité)', /if \(handled\) return settle\(handled\);/.test(queueSrc) && /!\(res && res\.status < 300\)\) await releaseApproval/.test(queueSrc));
  ok('E8 la file refuse la preuve du patron pour tout autre geste qu\'une ligne', /pinActor\.id === OWNER_ACTOR_ID && !\(b\.voidLine/.test(queueSrc));
  const hotelSrc = fs.readFileSync(path.join(ROOT, 'functions/api/hotel/rooms-bulk.js'), 'utf8');
  ok('E9 les chambres d\'hôtel refusent la preuve du patron', hotelSrc.includes('proof.id !== OWNER_ACTOR_ID'));
}

/* ── F · une vente, une fois ── */
{
  const body = { merchant: SHOP, id: 'sale-big', source: 'cashier', ownerApproval: saleApproval };
  const cancel = () => CANCEL.onRequestPost({ request: req('/api/sale/cancel', tillCookie, body), env });
  const wrongSale = await CANCEL.onRequestPost({ request: req('/api/sale/cancel', tillCookie, { ...body, id: 'sale-oth' }), env });
  ok('F1 l\'accord ne couvre pas une autre vente', wrongSale.status === 403 || wrongSale.status === 404, String(wrongSale.status));
  const noTill = await CANCEL.onRequestPost({ request: req('/api/sale/cancel', ownerCookie, body), env });
  ok('F2 l\'accord se présente depuis la caisse appairée', noTill.status === 403);
  const first = await cancel();
  const fb = await first.json();
  ok('F3 la vente s\'annule avec l\'accord, au nom du patron', first.status === 200 && fb.ok && fb.actor_id === 'owner:approval', JSON.stringify(fb));
  ok('F4 l\'accord est marqué utilisé', sqlite.prepare('SELECT status FROM owner_approvals WHERE id = ?').get(saleApproval).status === 'used');
  const again = await call(tillCookie, { action: 'request', kind: 'cancel-sale', ref: 'sale-big' });
  ok('F5 une vente déjà annulée ne se redemande pas', again.status === 409 && again.body.error === 'already-void', JSON.stringify(again));
}

/* ── G · une sortie d'espèces ── */
{
  const r = await call(tillCookie, { action: 'request', kind: 'cash-out', amountCents: 35000, label: 'Fournisseur', requestedBy: 'Karim' });
  ok('G1 sortie déposée avec le montant demandé', r.status === 201 && r.body.approval.amountCents === 35000, JSON.stringify(r));
  await call(ownerCookie, { action: 'decide', id: r.body.approval.id, verdict: 'approve' });
  const g = await read(tillCookie, 'id=' + r.body.approval.id);
  ok('G2 la caisse reçoit une preuve du geste', g.body.grant && g.body.grant.actProof, JSON.stringify(g.body));
  const proof = await ACT.readTillActProof(g.body.grant.actProof, SECRET, SHOP);
  ok('G3 preuve signée pour CE montant, sortie, au nom du patron', proof && proof.amountCents === 35000 && proof.move === 'out' && proof.id === LIB.OWNER_ACTOR_ID, JSON.stringify(proof));
  const replay = await read(tillCookie, 'id=' + r.body.approval.id);
  ok('G4 une réponse perdue se relit (deux minutes)', replay.body.grant && replay.body.grant.actProof);
  const p2 = await ACT.readTillActProof(replay.body.grant.actProof, SECRET, SHOP);
  ok('G4b chaque copie porte le même jti, celui de l\'accord (revue Fable)', p2 && p2.jti === proof.jti && proof.jti === r.body.approval.id);
  const first = await ACT.consumeActProof(env, SHOP, g.body.grant.actProof, { kind: 'cash', move: 'out', amountCents: 35000, ref: 'mv-1' });
  const second = await ACT.consumeActProof(env, SHOP, replay.body.grant.actProof, { kind: 'cash', move: 'out', amountCents: 35000, ref: 'mv-2' });
  ok('G4c une seule sortie d\'espèces consomme l\'accord', first && !second, JSON.stringify({ first, second }));
  const refused = await call(tillCookie, { action: 'request', kind: 'cash-out', amountCents: 1000 });
  await call(ownerCookie, { action: 'decide', id: refused.body.approval.id, verdict: 'refuse' });
  const rg = await read(tillCookie, 'id=' + refused.body.approval.id);
  ok('G5 refusée : aucune preuve', rg.body.approval.status === 'refused' && !rg.body.grant, JSON.stringify(rg.body));
  const w = await call(tillCookie, { action: 'request', kind: 'cash-out', amountCents: 1200 });
  const wd = await call(tillCookie, { action: 'withdraw', id: w.body.approval.id });
  ok('G6 la caisse retire sa demande', wd.status === 200 && wd.body.approval.status === 'withdrawn');
  const late = await call(ownerCookie, { action: 'decide', id: w.body.approval.id, verdict: 'approve' });
  ok('G7 une demande retirée ne s\'accepte plus', late.status === 409);
}

/* ── H · expiration, seuil, téléphones ── */
{
  const old = { kind: 'cash-out', status: 'pending', created_ts: Date.now() - 31 * 60000 };
  ok('H1 une sortie sans réponse expire après 30 min', LIB.effectiveStatus(old) === 'expired');
  ok('H2 une annulation sans réponse expire après 10 min', LIB.effectiveStatus({ kind: 'void-sent', status: 'pending', created_ts: Date.now() - 11 * 60000 }) === 'expired');
  ok('H3 un accord non lu expire', LIB.effectiveStatus({ kind: 'cash-out', status: 'approved', decided_ts: Date.now() - LIB.GRANT_LIFE_MS - 1 }) === 'expired');
  ok('H4 sous le seuil, pas de demande', !LIB.needsApproval({ cashOut: true, minCents: 50000 }, 'cash-out', 20000));
  ok('H5 au seuil, demande', LIB.needsApproval({ cashOut: true, minCents: 50000 }, 'cash-out', 50000));
  const token = 'ab'.repeat(32);
  const tillDev = await call(tillCookie, { action: 'device', token });
  ok('H6 la caisse n\'inscrit pas de téléphone', tillDev.status === 403);
  const dev = await call(ownerCookie, { action: 'device', token, lang: 'ar' });
  ok('H7 le patron inscrit son téléphone', dev.status === 200);
  const list = await read(ownerCookie, 'list=1');
  ok('H8 le panneau compte ses téléphones', list.body.devices === 1, JSON.stringify(list.body.devices));
  const msg = LIB.pushMessage({ id: 'apr-x', merchant: SHOP, kind: 'cash-out', amount_cents: 35000, requested_by: 'Karim', label: 'Fournisseur' }, 'fr');
  ok('H9 la notification porte la catégorie des boutons et l\'identifiant', msg.category === 'KIWI_APPROVAL' && msg.data.kiwiApproval.id === 'apr-x' && /350 MAD/.test(msg.title), JSON.stringify(msg));
  ok('H10 la notification ne porte aucun code', !/\b\d{4}\b/.test(msg.body));
  const rm = await call(ownerCookie, { action: 'device-remove', token });
  ok('H11 le patron retire son téléphone', rm.status === 200 && !sqlite.prepare('SELECT 1 FROM owner_approval_devices').get());
}

/* ── J · sans repli, le serveur refuse le code d'un responsable (revue de sécurité) ── */
{
  await call(ownerCookie, { action: 'settings', settings: { cashOut: true, cancel: true, managerFallback: false, minCents: 0 } });
  ok('J1 sans repli : une annulation par code est refusée', !(await LIB.codeMayAct(env, SHOP, 'cancel-sale', 5000)));
  const managerProof = await AUTH.tillActorProof(SECRET, SHOP, { id: 'pin-m', name: 'Karim', role: 'manager' });
  const manager = await AUTH.readTillActorProof(managerProof, SECRET, SHOP);
  const tools = { gate: LIB.ownerGate, voidRef: LIB.voidRef, lineCents: LIB.lineCents, tableVisitCents: LIB.tableVisitCents };
  const vctx = (pinActor, requestId) => ({ env, b: { voidLine: { orderId: 'ord-1', table: '4', immediate: true, requestId, lineId: 'line-cafe', qty: 1 } },
    merchant: SHOP, now: Date.now(), employee: null, pairedTill: true, pinActor, ownerApprovals: tools });
  const refused = await QTY.voidLine(vctx(manager, 'voi-gggggggggggggggggggg'));
  const rb = await refused.json();
  ok('J3 ligne en cuisine : le code du responsable est refusé quand le patron exige son accord', refused.status === 403 && rb.error === 'owner-approval-required', JSON.stringify(rb));
  await call(ownerCookie, { action: 'settings', settings: { cashOut: true, cancel: true, managerFallback: true, minCents: 0 } });
  const allowed = await QTY.voidLine(vctx(manager, 'voi-hhhhhhhhhhhhhhhhhhhh'));
  ok('J4 avec repli : le code du responsable annule comme avant', allowed.status === 200, String(allowed.status));
  await call(ownerCookie, { action: 'settings', settings: { cashOut: false, cancel: true, managerFallback: false, minCents: 50000 } });
  ok('J5 sous le seuil, le code suffit', await LIB.codeMayAct(env, SHOP, 'cancel-sale', 20000));
  ok('J6 au seuil, il ne suffit plus', !(await LIB.codeMayAct(env, SHOP, 'cancel-sale', 50000)));
  const cancelSrc = fs.readFileSync(path.join(ROOT, 'functions/api/sale/cancel.js'), 'utf8');
  ok('J7 l\'annulation de vente consulte la règle pour tout acteur sauf le patron au tableau de bord et un accord', /if \(!approval && !dashboardOwner\)/.test(cancelSrc) && /dashboardOwner = !!may\.owner \|\| !!op;/.test(cancelSrc));
  const broken = { DB: { prepare() { throw new Error('d1 down'); } }, AUTH_SECRET: SECRET };
  ok('J8 réglages illisibles : la règle ne laisse pas passer (null, 503 chez l\'appelant)', (await LIB.codeMayAct(broken, SHOP, 'cancel-sale', 5000)) === null);
}

/* ── K · le téléphone du serveur et la table entière (« cover them too », 25 nov.) ──
   Par les vraies routes : /api/order/queue refuse et dit quoi demander, le
   serveur demande lui-même (son nom vient du serveur), le patron accepte, le
   même geste repasse avec l'accord et le consomme. */
{
  const QUEUE = await mod('functions/api/order/queue.js');
  const STAFF = 'emp-sara';
  const member = { id: STAFF, firstName: 'Sara', lastName: 'Bennani', email: 'sara@shop.ma', function: 'Serveur', department: 'Salle', venueSlug: SHOP };
  const doc = (feature, data) => sqlite.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').run(SHOP, feature, JSON.stringify(data), now);
  doc('employee-access', { members: [member] });
  doc('attendance', { entries: [{ id: 'att-sara', memberId: STAFF, staffId: STAFF, name: 'Sara Bennani', inTs: now - 3600000, outTs: null, pauseTs: null }] });
  doc('floorplan', { staff: [{ id: STAFF, name: 'Sara Bennani' }], tables: [{ id: 'T7', num: '7', servers: [STAFF] }] });
  sqlite.prepare("UPDATE merchant_config SET features = ? WHERE merchant = ?").run(JSON.stringify({ orderpro: true }), SHOP);
  const waiterCookie = `${AUTH.EMPLOYEE_COOKIE}=${await AUTH.employeeToken(SECRET, { staffId: STAFF, merchant: SHOP })}`;
  const SESSION = 'tsx-' + 'k'.repeat(22);
  sqlite.prepare("INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts) VALUES (?, ?, 'table', '7', 'open', ?, ?)").run(SESSION, SHOP, now - 600000, now - 600000);
  const kLines = [{ uid: 'line-k1', id: 'p-pastilla', name: 'Pastilla', unitPrice: 120, qty: 2 }, { uid: 'line-k2', id: 'p-the', name: 'Thé', unitPrice: 10, qty: 3 }];
  sqlite.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, session_id, lines, total, status, created_ts, updated_ts) VALUES ('ord-k', ?, 30, 'table', '7', ?, ?, 270, 'accepted', ?, ?)").run(SHOP, SESSION, JSON.stringify(kLines), now - 300000, now - 300000);
  await call(ownerCookie, { action: 'settings', settings: { cashOut: false, cancel: true, managerFallback: true, minCents: 0 } });
  const queue = async (cookie, body) => {
    const res = await QUEUE.onRequestPost({ request: req('/api/order/queue', cookie, { merchant: SHOP, ...body }), env, waitUntil() {} });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const approve = async (id) => (await call(ownerCookie, { action: 'decide', id, verdict: 'approve' })).status === 200;
  const statusOf = (id) => sqlite.prepare('SELECT status FROM owner_approvals WHERE id = ?').get(id).status;

  const voidBody = (requestId, ownerApproval) => ({ voidLine: { orderId: 'ord-k', table: '7', requestId, lineId: 'line-k1', qty: 1, reason: 'client_change', ...(ownerApproval ? { ownerApproval } : {}) } });
  const v1 = await queue(waiterCookie, voidBody('voi-k1k1k1k1k1k1k1k1k1k1'));
  ok('K1 serveur : une ligne envoyée attend l\'accord, même avec le repli (un serveur n\'a pas de code)', v1.status === 403 && v1.body.error === 'owner-approval-required', JSON.stringify(v1));
  ok('K2 la réponse dit quoi demander : CETTE ligne, au prix de la ligne entière (une unité à la fois ne passe pas sous le seuil)', v1.body.ask && v1.body.ask.kind === 'void-sent' && v1.body.ask.ref === 'line-k1' && v1.body.ask.amountCents === 24000, JSON.stringify(v1.body.ask));
  const askV = await call(waiterCookie, { action: 'request', ...v1.body.ask, requestedBy: 'Le patron', requestedById: 'owner' });
  ok('K3 le serveur dépose la demande lui-même', askV.status === 201, JSON.stringify(askV));
  const rowV = sqlite.prepare('SELECT requested_by, requested_by_id, ref FROM owner_approvals WHERE id = ?').get(askV.body.approval.id);
  ok('K4 son nom vient du serveur, pas du corps', rowV.requested_by === 'Sara Bennani' && rowV.requested_by_id === 'emp:' + STAFF && rowV.ref === 'ord-k|line-k1', JSON.stringify(rowV));
  const cash = await call(waiterCookie, { action: 'request', kind: 'cash-out', amountCents: 5000 });
  ok('K5 un serveur ne demande pas de sortie d\'espèces', cash.status === 403, JSON.stringify(cash));
  const foreign = await read(waiterCookie, 'id=' + lineApproval);
  ok('K6 un serveur ne lit que ses propres demandes', foreign.status === 404, JSON.stringify(foreign));
  const list = await read(waiterCookie, 'list=1');
  ok('K6b ni la liste du patron', list.status === 403);
  ok('K7 le patron accepte', await approve(askV.body.approval.id));
  const seen = await read(waiterCookie, 'id=' + askV.body.approval.id);
  ok('K8 le serveur voit l\'accord, sans aucune preuve signée', seen.status === 200 && seen.body.approval.status === 'approved' && !seen.body.grant, JSON.stringify(seen.body));
  const wrongLine = await queue(waiterCookie, { voidLine: { ...voidBody('voi-k2k2k2k2k2k2k2k2k2k2', askV.body.approval.id).voidLine, lineId: 'line-k2' } });
  ok('K9 l\'accord de la pastilla n\'annule pas le thé', wrongLine.status === 403 && wrongLine.body.error === 'owner-approval-invalid', JSON.stringify(wrongLine));
  const v2 = await queue(waiterCookie, voidBody('voi-k3k3k3k3k3k3k3k3k3k3', askV.body.approval.id));
  ok('K10 le même geste repasse avec l\'accord', v2.status === 200 && v2.body.ok, JSON.stringify(v2));
  ok('K11 et le consomme', statusOf(askV.body.approval.id) === 'used');

  const minus = (requestId, ownerApproval) => ({ editLine: { orderId: 'ord-k', table: '7', lineId: 'line-k2', qty: 2, requestId, ...(ownerApproval ? { ownerApproval } : {}) } });
  const m1 = await queue(waiterCookie, minus('edt-k1k1k1k1k1k1k1k1'));
  ok('K12 « − » sur un plat envoyé attend l\'accord, au prix de la ligne', m1.status === 403 && m1.body.ask && m1.body.ask.kind === 'void-sent' && m1.body.ask.amountCents === 3000, JSON.stringify(m1));
  const askM = await call(waiterCookie, { action: 'request', ...m1.body.ask });
  await approve(askM.body.approval.id);
  const m2 = await queue(waiterCookie, minus('edt-k2k2k2k2k2k2k2k2', askM.body.approval.id));
  ok('K13 avec l\'accord, le « − » passe', m2.status < 300, JSON.stringify(m2));
  ok('K14 et consomme l\'accord', statusOf(askM.body.approval.id) === 'used');
  sqlite.prepare("UPDATE orders SET lines = ? WHERE id = 'ord-k'").run(JSON.stringify([{ uid: 'line-k2', id: 'p-the', name: 'Thé', unitPrice: 10, qty: 3 }]));
  const askR = await call(waiterCookie, { action: 'request', kind: 'void-sent', ref: 'line-k2' });
  await approve(askR.body.approval.id);
  const race = await Promise.all([
    queue(waiterCookie, { voidLine: { orderId: 'ord-k', table: '7', requestId: 'voi-r1r1r1r1r1r1r1r1r1r1', lineId: 'line-k2', qty: 1, reason: 'client_change', ownerApproval: askR.body.approval.id } }),
    queue(waiterCookie, { voidLine: { orderId: 'ord-k', table: '7', requestId: 'voi-r2r2r2r2r2r2r2r2r2r2', lineId: 'line-k2', qty: 1, reason: 'client_change', ownerApproval: askR.body.approval.id } }),
  ]);
  ok('K14c deux envois simultanés du même accord : un seul passe (revue de sécurité)', race.filter((r) => r.status < 300).length === 1 && race.some((r) => r.status === 403 && r.body.error === 'owner-approval-invalid'), JSON.stringify(race.map((r) => [r.status, r.body && r.body.error])));
  const junk = await queue(waiterCookie, { editLine: { orderId: 'ord-k', table: '7', lineId: 'line-k2', qty: 'x', requestId: 'edt-k4k4k4k4k4k4k4k4' } });
  ok('K14b une quantité qui n\'est pas un nombre est refusée, elle ne passe pas sous la règle (revue Fable)', junk.status === 400 && junk.body.error === 'bad-qty', JSON.stringify(junk));
  const plus = await queue(waiterCookie, { editLine: { orderId: 'ord-k', table: '7', lineId: 'line-k2', qty: 3, requestId: 'edt-k3k3k3k3k3k3k3k3' } });
  ok('K15 « + » ne demande rien', plus.status < 300, JSON.stringify(plus));

  const cancel = (ownerApproval) => ({ cancelTable: { table: '7', expectedSession: SESSION, ...(ownerApproval ? { ownerApproval } : {}) } });
  const c1 = await queue(waiterCookie, cancel());
  ok('K16 table entière : le serveur attend l\'accord', c1.status === 403 && c1.body.ask && c1.body.ask.kind === 'cancel-table' && c1.body.ask.ref === SESSION, JSON.stringify(c1));
  const askC = await call(waiterCookie, { action: 'request', ...c1.body.ask, amountCents: 1 });
  ok('K17 le patron lit la table et son montant relus au serveur', askC.status === 201 && /^Table 7/.test(askC.body.approval.label) && askC.body.approval.amountCents === c1.body.ask.amountCents && c1.body.ask.amountCents > 0, JSON.stringify(askC.body));
  await approve(askC.body.approval.id);
  sqlite.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, session_id, lines, total, status, created_ts, updated_ts) VALUES ('ord-k2', ?, 31, 'table', '7', ?, ?, 400, 'accepted', ?, ?)").run(SHOP, SESSION, JSON.stringify([{ uid: 'line-k9', name: 'Méchoui', unitPrice: 400, qty: 1 }]), now - 1000, now - 1000);
  const grown = await queue(waiterCookie, cancel(askC.body.approval.id));
  ok('K18 un bon ajouté après l\'accord : l\'accord ne couvre plus la table', grown.status === 403 && grown.body.error === 'owner-approval-invalid', JSON.stringify(grown));
  const askC2 = await call(waiterCookie, { action: 'request', kind: 'cancel-table', ref: SESSION });
  await approve(askC2.body.approval.id);
  sqlite.prepare("UPDATE orders SET status = 'cooking-x' WHERE id = 'ord-k2'").run();
  const failed = await queue(waiterCookie, cancel(askC2.body.approval.id));
  ok('K18b un geste qui échoue après la prise de l\'accord le rend utilisable', failed.status === 409 && statusOf(askC2.body.approval.id) === 'approved', JSON.stringify(failed) + ' ' + statusOf(askC2.body.approval.id));
  sqlite.prepare("UPDATE orders SET status = 'accepted' WHERE id = 'ord-k2'").run();
  const c2 = await queue(waiterCookie, cancel(askC2.body.approval.id));
  ok('K19 avec l\'accord de la table entière, elle s\'annule', c2.status === 200 && c2.body.ok, JSON.stringify(c2));
  ok('K20 l\'accord est consommé', statusOf(askC2.body.approval.id) === 'used');

  await call(ownerCookie, { action: 'settings', settings: { cashOut: false, cancel: true, managerFallback: false, minCents: 0 } });
  const EMPTY = 'tsx-' + 'e'.repeat(22);
  sqlite.prepare("INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts) VALUES (?, ?, 'table', '7', 'open', ?, ?)").run(EMPTY, SHOP, now, now);
  const empty = await queue(waiterCookie, { cancelTable: { table: '7', expectedSession: EMPTY } });
  ok('K20b une table ouverte par erreur, sans bon, se libère sans sonner le patron (revue Fable)', empty.status === 200 && empty.body.ok, JSON.stringify(empty));
  sqlite.prepare("UPDATE owner_approvals SET created_ts = created_ts - 120000 WHERE merchant = ? AND status <> 'pending'").run(SHOP);   // sous la limite de dix demandes par minute
  const w = await call(waiterCookie, { action: 'request', kind: 'void-sent', ref: 'line-tajine' });
  const tillWithdraw = await call(waiterCookie, { action: 'withdraw', id: lineApproval });
  ok('K21 un serveur ne retire pas la demande d\'un autre', tillWithdraw.status === 404, JSON.stringify(tillWithdraw));
  const own = await call(waiterCookie, { action: 'withdraw', id: w.body.approval && w.body.approval.id });
  ok('K22 il retire la sienne', own.status === 200 && own.body.approval.status === 'withdrawn', JSON.stringify({ w, own }));
  await call(ownerCookie, { action: 'settings', settings: { cashOut: false, cancel: false, managerFallback: false, minCents: 0 } });
  const off = await queue(waiterCookie, { voidLine: { orderId: 'ord-k2', table: '7', requestId: 'voi-k4k4k4k4k4k4k4k4k4k4', lineId: 'line-k9', qty: 1 } });
  ok('K23 accords éteints : rien ne change pour le serveur', off.status !== 403 || off.body.error !== 'owner-approval-required', JSON.stringify(off));
  const askSrc = fs.readFileSync(path.join(ROOT, 'assets/owner-ask.js'), 'utf8');
  ok('K24 le téléphone renvoie le même geste avec l\'accord, sans réécrire de texte en HTML', askSrc.includes("'voidLine', 'editLine', 'cancelTable'") && askSrc.includes('ownerApproval: answer.id') && !/innerHTML\s*=\s*(?!['"])\S/.test(askSrc));
  ok('K25 le module se charge sur la caisse et sur le téléphone du serveur', fs.readFileSync(path.join(ROOT, 'assets/service-requests.js'), 'utf8').includes('assets/owner-ask.js?v=')
    && /assets\/service-requests\.js/.test(fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8')) && /assets\/service-requests\.js/.test(fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8')));
}

{
  const callers = ['assets/serveur/service-runtime.js', 'assets/caisse-floor/cancellations.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  ok('K26 un refus du patron arrivé après le délai de l\'appelant se lit comme un refus, pas « délai dépassé » (revue Fable)',
    callers.every((src) => src.includes('ownerAnswer: !!data?.ownerApproval') && src.includes('controller.signal.aborted && !err.ownerAnswer')));
}

/* ── L · le module du téléphone, contre un serveur scripté ── */
{
  const node = () => ({ textContent: '', disabled: false, listeners: {}, setAttribute() {}, addEventListener(n, f) { this.listeners[n] = f; } });
  const made = [];
  const document = {
    documentElement: { getAttribute: () => 'fr', classList: { contains: () => false } },
    body: { appendChild() {} },
    createElement() {
      const el = { attrs: {}, children: [], listeners: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(n, f) { this.listeners[n] = f; }, showModal() { this.open = true; }, close() { this.open = false; }, remove() {} };
      Object.defineProperty(el, 'innerHTML', { set() { el.children = [node(), node(), node(), node(), node()]; } });
      made.push(el);
      return el;
    },
  };
  const calls = [];
  let step = 0, hold = false;
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const server = async (input, init = {}) => {
    const url = String(input), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body, signal: init.signal });
    if (url === '/api/order/queue') {
      return body.voidLine && body.voidLine.ownerApproval === 'apr-' + '1'.repeat(24) ? reply({ ok: true, directVoid: true })
        : reply({ error: 'owner-approval-required', ask: { kind: 'void-sent', ref: 'line-k1', amountCents: 12000 } }, 403);
    }
    if (url === '/api/approvals') return reply({ ok: true, approval: { id: 'apr-' + '1'.repeat(24), label: '1 × Pastilla', status: 'pending' } }, 201);
    step++;
    return reply({ ok: true, approval: { status: hold || step < 2 ? 'pending' : 'approved' } });
  };
  const win = { fetch: server };
  const context = { window: win, document, location: { href: 'https://kiwi.test/kiwi-serveur.html' }, localStorage: { getItem: () => null },
    setTimeout: (f) => { Promise.resolve().then(f); return 0; }, Response, URL, JSON, Object, Promise, Date, String, Number };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/owner-ask.js'), 'utf8'), context, { filename: 'assets/owner-ask.js' });
  ok('L1 le module emballe fetch une seule fois', win.fetch !== server && win.fetch.kiwiOwnerAsk === true);
  const controller = new AbortController();
  const res = await win.fetch('/api/order/queue', { method: 'POST', signal: controller.signal, body: JSON.stringify({ merchant: SHOP, voidLine: { lineId: 'line-k1', qty: 1 } }) });
  const out = await res.json();
  ok('L2 l\'appelant reçoit la réponse du second envoi', res.status === 200 && out.directVoid === true, JSON.stringify(out));
  const ask = calls.find((c) => c.url === '/api/approvals');
  ok('L3 la demande porte ce que la file a dit de demander', ask && ask.body.action === 'request' && ask.body.kind === 'void-sent' && ask.body.ref === 'line-k1' && ask.body.amountCents === 12000, JSON.stringify(ask && ask.body));
  const resend = calls.filter((c) => c.url === '/api/order/queue')[1];
  ok('L4 le second envoi est le même geste avec l\'accord, sans le délai de l\'appelant', resend && resend.body.voidLine.lineId === 'line-k1' && resend.body.voidLine.ownerApproval === 'apr-' + '1'.repeat(24) && !resend.signal);
  ok('L5 la feuille d\'attente s\'est ouverte puis fermée', made.length === 1 && made[0].children[3].textContent.length > 0);
  step = -99;
  made.length = 0; calls.length = 0; hold = true;
  context.setTimeout = (f) => setTimeout(f, 1);   // l'attente rend la main, le temps d'appuyer sur Échap
  const pending = win.fetch('/api/order/queue', { method: 'POST', body: JSON.stringify({ merchant: SHOP, voidLine: { lineId: 'line-k1', qty: 1, requestId: 'x' } }) });
  for (let i = 0; i < 500 && !made.length; i++) await new Promise((r) => setTimeout(r, 4));
  made[0].listeners.cancel();
  const gone = await pending;
  const goneBody = await gone.json();
  ok('L5b Échap sur la feuille retire la demande et rend un refus lisible (revue Fable)', gone.status === 403 && goneBody.ownerApproval === 'refused' && calls.some((c) => c.url === '/api/approvals' && c.body && c.body.action === 'withdraw'), JSON.stringify(goneBody));
  ok('L5c rien n\'est renvoyé à la file après un retrait', calls.filter((c) => c.url === '/api/order/queue').length === 1);
  const other = await win.fetch('/api/order/queue', { method: 'POST', body: JSON.stringify({ merchant: SHOP, closeTable: '7' }) });
  ok('L6 un refus sans geste connu passe tel quel', other.status === 403);
}

/* ── I · le panneau du tableau de bord ── */
{
  const listeners = {};
  const win = {
    addEventListener(n, f) { listeners[n] = f; }, removeEventListener() {},
    Kiwi: { drawer() { throw new Error('not opened in this test'); }, toast() {} },
    KiwiLive: { merchant: () => '' },
  };
  win.window = win;
  const context = {
    window: win, console, setTimeout: () => 0, clearTimeout() {}, Promise, JSON, Object, Array, String, Number, Math, Date,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { visibilityState: 'visible', documentElement: { lang: 'fr' }, addEventListener() {}, getElementById: () => null },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/owner-approvals.js'), 'utf8'), context, { filename: 'assets/owner-approvals.js' });
  ok('I1 le panneau s\'installe', win.KiwiOwnerApprovals && typeof win.KiwiOwnerApprovals.open === 'function' && typeof win.KiwiOwnerApprovals.focus === 'function');
  const src = fs.readFileSync(path.join(ROOT, 'assets/owner-approvals.js'), 'utf8');
  ok('I2 le panneau n\'écrit aucun texte de demande en HTML', !/innerHTML/.test(src));
}

console.log(`✓ owner-approvals-test : ${checks} vérifications (réglages du patron, montant relu au serveur, accord lié à la ligne et à la vente, preuve signée de la sortie)`);
