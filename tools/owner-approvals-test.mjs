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
 *  I · le panneau du tableau de bord se charge sans planter.
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
    ownerApprovals: { approvedFor: LIB.approvedFor, markUsed: LIB.markUsed, voidRef: LIB.voidRef } });
  const bare = await QTY.voidLine({ ...ctx({ orderId: 'ord-1', table: '4', immediate: true, requestId: 'voi-ffffffffffffffffffff', lineId: 'line-tajine', qty: 1, ownerApproval: lineApproval }), ownerApprovals: undefined });
  ok('E2b sans les outils de la route, la preuve du patron est refusée', bare.status === 403);
  const wrong = await QTY.voidLine(ctx({ orderId: 'ord-1', table: '4', immediate: true, requestId: 'voi-aaaaaaaaaaaaaaaaaaaa', lineId: 'line-cafe', qty: 1, ownerApproval: lineApproval }));
  ok('E3 l\'accord pour le tajine n\'annule pas le café', wrong.status === 403 && (await wrong.json()).error === 'owner-approval-invalid');
  sqlite.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, lines, total, status, created_ts, updated_ts) VALUES ('ord-9', ?, 19, 'table', '9', ?, 900, 'accepted', ?, ?)").run(SHOP, JSON.stringify([{ uid: 'line-tajine-x', id: 'p-tajine', name: 'Tajine royal', unitPrice: 450, qty: 2 }]), now - 9000, now - 9000);
  const otherOrder = await QTY.voidLine(ctx({ orderId: 'ord-9', table: '9', immediate: true, requestId: 'voi-eeeeeeeeeeeeeeeeeeee', lineId: 'line-tajine-x', qty: 1, ownerApproval: lineApproval }));
  ok('E3b l\'accord ne sert pas sur une autre commande', otherOrder.status === 403);
  const none = await QTY.voidLine(ctx({ orderId: 'ord-1', table: '4', immediate: true, requestId: 'voi-bbbbbbbbbbbbbbbbbbbb', lineId: 'line-tajine', qty: 1 }));
  ok('E4 sans identifiant d\'accord, la preuve du patron ne vaut rien', none.status === 403);
  const right = await QTY.voidLine(ctx({ orderId: 'ord-1', table: '4', immediate: true, requestId: 'voi-cccccccccccccccccccc', lineId: 'line-tajine', qty: 1, ownerApproval: lineApproval }));
  const rb = await right.json();
  ok('E5 la ligne acceptée s\'annule', right.status === 200 && rb.directVoid === true, JSON.stringify(rb));
  ok('E6 l\'accord est marqué utilisé', sqlite.prepare('SELECT status FROM owner_approvals WHERE id = ?').get(lineApproval).status === 'used');
  const again = await QTY.voidLine(ctx({ orderId: 'ord-1', table: '4', immediate: true, requestId: 'voi-dddddddddddddddddddd', lineId: 'line-tajine', qty: 1, ownerApproval: lineApproval }));
  ok('E7 un accord utilisé ne resert pas', again.status === 403);
  const queueSrc = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');
  ok('E8b la preuve du patron court-circuite tous les autres gestes, avant cancelTable (revue Fable)', queueSrc.indexOf('return (await voidLine(ctx)) || json({ error: \'owner-approval-invalid\' }') > 0
    && queueSrc.indexOf('return (await voidLine(ctx))') < queueSrc.indexOf('const handled = await cancelTable(ctx)'));
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
  const tools = { approvedFor: LIB.approvedFor, markUsed: LIB.markUsed, voidRef: LIB.voidRef, codeMayAct: LIB.codeMayAct };
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
  ok('J7 l\'annulation de vente par code consulte la règle', /source === 'cashier' && !approval && !\(await codeMayAct\(env, merchant, 'cancel-sale', saleAmountCents\)\)/.test(cancelSrc));
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
