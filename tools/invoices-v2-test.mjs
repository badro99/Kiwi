#!/usr/bin/env node
/* Facturation v2 · le serveur (functions/api/invoices.js + _invoice-series.js).
 *
 * Ce banc passe par les vraies routes (invoices, invoice, comptable/books) et la
 * vraie porte (functions/_middleware.js), sur une base SQLite au schéma réel
 * (schema.sql), avec un `DB.batch` transactionnel comme D1. Il tient :
 *   - un brouillon n'a pas de numéro ; l'émission en donne un (F-AAAA-NNNN) et fige ;
 *   - après émission : 409 locked, sauf la note interne ;
 *   - les totaux : centimes entiers, par taux, remises, exonéré sans mention refusé ;
 *   - règlements bornés par le solde ; avoirs bornés par ce qu'il reste à créditer ;
 *   - devis : numéro D, conversion en brouillon de facture, idempotente ;
 *   - duplication, suppression de brouillon, import des anciennes factures ;
 *   - UNE série F pour la caisse et la saisie (jamais le même numéro), l'historique
 *     de sale_invoices respecté, la collision simulée qui recommence ;
 *   - l'accès : propriétaire ou opérateur nommé, JAMAIS une caisse appairée, un
 *     employé ni l'expert-comptable ; un autre magasin : 404/403, sans fuite ;
 *   - les livres de l'expert-comptable ne reçoivent que du émis ;
 *   - le DDL de repli dit la même chose que schema.sql. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DateTimeFormat as ZoneLawDateTimeFormat } from '../functions/api/_zone-law.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);
const invoices = await import(pathToFileURL(path.join(ROOT, 'functions/api/invoices.js')).href);
const series = await import(pathToFileURL(path.join(ROOT, 'functions/api/_invoice-series.js')).href);
const tillInvoice = await import(pathToFileURL(path.join(ROOT, 'functions/api/invoice.js')).href);
const books = await import(pathToFileURL(path.join(ROOT, 'functions/api/comptable/books.js')).href);
const acctLib = await import(pathToFileURL(path.join(ROOT, 'functions/api/comptable/_lib.js')).href);
const middleware = await import(pathToFileURL(path.join(ROOT, 'functions/_middleware.js')).href);

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const SECRET = 'invoices-v2-secret-0123456789';
const SHOP = 'facture-shop', OTHER = 'autre-shop';
const BASE = 'https://kiwi-os.com';
const now = Date.now();
/* Same clock as the server (zone law): Node's own data may still put Morocco
   at +01, and then « today » ran a day ahead from 23:00 to 00:00 UTC. */
const TODAY = new ZoneLawDateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const YEAR = TODAY.slice(0, 4);
const num = (prefix, seq) => `${prefix}-${YEAR}-${String(seq).padStart(4, '0')}`;

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const acc = db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES (?,?,?,'s','h',?,'active')`);
  acc.run('acc-a', 'a@facture.test', 'Facture Shop', now);
  acc.run('acc-b', 'b@autre.test', 'Autre Shop', now);
  const cfg = db.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','boutique',?,?,'active',0,?)`);
  cfg.run(SHOP, 'acc-a', 'Facture Shop', now);
  cfg.run(OTHER, 'acc-b', 'Autre Shop', now);
  db.prepare(`INSERT INTO operators (id,label,salt,hash,created_ts) VALUES ('op-test1','Test','s','h',?)`).run(now);
  // La fiche de l'établissement : la source de l'identité figée sur le document.
  db.prepare(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'business',?,1,?)`).run(SHOP, JSON.stringify({
    name: 'Facture Shop', legal: { legalName: 'FACTURE SHOP SARL', address: '12 rue des Fleurs', city: 'Casablanca', ice: '001234567000062', fiscal: '12345678', rc: '88776', patente: '3456', phone: '0522000000', email: 'compta@facture.test', cnss: 'NE-PAS-FIGER' },
  }), now);
  // Un employé de salle réel, pour prouver que son cookie ne passe pas.
  const member = { id: 'm1', firstName: 'Samira', lastName: 'L.', function: 'Proprietaire', department: 'Direction' };
  db.prepare(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'team',?,1,?)`).run(SHOP, JSON.stringify({ members: [member] }), now);
  db.prepare(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'employee-access',?,1,?)`).run(SHOP, JSON.stringify({ members: [{ ...member, venueSlug: SHOP }] }), now);
  db.prepare(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'attendance',?,1,?)`).run(SHOP, JSON.stringify({ entries: [] }), now);
  const env = { AUTH_SECRET: SECRET, DB: {
    prepare(q) {
      const st = db.prepare(q);
      const bound = (p) => ({
        async first() { const row = st.get(...p); return row === undefined ? null : row; },
        async all() { return { results: st.all(...p) }; },
        async run() { const r = st.run(...p); return { meta: { changes: Number(r.changes) }, success: true }; },
      });
      return Object.assign(bound([]), { bind: (...p) => bound(p) });
    },
    // Comme D1 : un lot est UNE transaction, tout ou rien.
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
    },
  } };
  return { db, env };
}

const ownerA = lib.sessionCookie(await lib.makeSession('acc-a', SECRET)).split(';')[0];
const ownerB = lib.sessionCookie(await lib.makeSession('acc-b', SECRET)).split(';')[0];
const tillCookie = `kiwi_till=${await lib.tillToken(SECRET, SHOP)}`;
const empCookie = lib.employeeCookie(await lib.employeeToken(SECRET, { merchant: SHOP, staffId: 'm1' })).split(';')[0];
const operatorCookie = `kiwi_op=${await lib.operatorToken(SECRET)}; kiwi_op_id=${await lib.operatorIdToken(SECRET, 'op-test1')}`;
const ACCT_ID = 'ca_' + 'A'.repeat(16);
const acctCookie = `${acctLib.ACCT_COOKIE}=${await acctLib.accountantCookieValue(SECRET, ACCT_ID)}`;

let ip = 10;
const reqOf = (method, p, cookie, body) => new Request(BASE + p, {
  method,
  headers: { ...(cookie ? { Cookie: cookie } : {}), 'CF-Connecting-IP': `10.9.0.${ip++ % 250}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
const readRes = async (res) => { const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: res.status, json: j, text: t }; };

function client(env, defaultCookie = ownerA, merchant = SHOP) {
  return {
    post: async (body, cookie = defaultCookie) => readRes(await invoices.onRequestPost({ request: reqOf('POST', '/api/invoices', cookie, { merchant, ...body }), env })),
    get: async (query, cookie = defaultCookie) => readRes(await invoices.onRequestGet({ request: reqOf('GET', `/api/invoices?merchant=${merchant}${query ? '&' + query : ''}`, cookie), env })),
  };
}

const L = (description, qty, unitHT, vatRate = 20, discountPct = 0) => ({ description, qty, unitHT, vatRate, discountPct });
const CUST = { name: 'SARL Atlas', address: '1 av. Hassan II', ice: '001234567000062', if: '987', email: 'achats@atlas.test', phone: '0600000000' };
const rows = (db, sql, ...a) => db.prepare(sql).all(...a);

/* ───────────────────────────── 1. brouillon, totaux ───────────────────────────── */
console.log('■ Brouillon · pas de numéro ; totaux au centime, par taux');
{
  const { db, env } = database();
  const c = client(env);
  let r = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('Prestation', 2, 10000)], totals: { ttcCents: 1 }, number: 'F-1999-0001' });
  const d = r.json && r.json.doc;
  ok('un brouillon est créé (200)', r.status === 200 && d && d.status === 'draft', r.text.slice(0, 200));
  ok('un brouillon n’a ni numéro ni séquence', d.number === null && d.seq === null && d.displayStatus === 'draft');
  ok('le total envoyé par le client est ignoré : 2 × 100,00 + 20 % = 240,00', d.totals.ttcCents === 24000 && d.totals.htCents === 20000 && d.totals.vatCents === 4000);
  ok('aucune ligne dans la série, aucun numéro consommé', rows(db, 'SELECT * FROM invoice_series').length === 0);
  ok('le document porte les deux orthographes (camelCase et colonnes)', d.issueDate === d.issue_date && d.paymentMethod === d.payment_method && 'internal_note' in d);

  // Taux mélangés, remises, exonéré.
  const mixed = [
    L('A', 2, 10000, 20),            // 20000 @20
    L('B', 3, 1999, 10, 10),         // 3 × 19,99 − 10 % = 53,97 @10
    L('C', 1, 5000, 0),              // 5000 exonéré
    L('D', 1.5, 1000, 10),           // 1500 @10
    L('E', 1, 333, 20),              // 333 @20
  ];
  r = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: mixed });
  const t = r.json.doc.totals;
  ok('HT = 20000 + 5397 + 5000 + 1500 + 333 = 32230', t.htCents === 32230, JSON.stringify(t));
  ok('regroupé par taux, du plus haut au plus bas : 20 / 10 / 0', t.byRate.map((g) => g.rate).join() === '20,10,0');
  ok('base 20 % = 20333, TVA 4067 (arrondie au centime sur la base)', t.byRate[0].baseCents === 20333 && t.byRate[0].vatCents === 4067);
  ok('base 10 % = 6897, TVA 690', t.byRate[1].baseCents === 6897 && t.byRate[1].vatCents === 690);
  ok('base exonérée = 5000, TVA 0', t.byRate[2].baseCents === 5000 && t.byRate[2].vatCents === 0);
  ok('TVA 4757, TTC 36987 : entiers, HT + TVA = TTC', t.vatCents === 4757 && t.ttcCents === 36987 && Number.isInteger(t.ttcCents));
  ok('la colonne ttc_cents suit le total serveur', db.prepare('SELECT ttc_cents FROM invoice_docs WHERE id = ?').get(r.json.doc.id).ttc_cents === 36987);

  r = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('Demi-centime', 1, 5, 20, 50)] });
  ok('2,5 centimes s’arrondissent à 3 (demi vers le haut)', r.json.doc.totals.htCents === 3);
  r = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('x', 1, 100, 13)] });
  ok('un taux hors liste est refusé', r.status === 400 && r.json.error === 'invalid-lines');
  r = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('x', -1, 100)] });
  ok('une quantité négative est refusée', r.status === 400 && r.json.error === 'invalid-lines');
  ok('la liste des taux est exportée en une seule constante', JSON.stringify(invoices.VAT_RATES) === '[20,14,10,7,0]');
}

/* ───────────────────────────── 2. émission, verrou ───────────────────────────── */
console.log('■ Émission · numéro, identité figée, verrou');
{
  const { db, env } = database();
  const c = client(env);
  let r = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('Prestation', 1, 10000), L('Livre', 1, 5000, 0)] });
  const id = r.json.doc.id;
  r = await c.post({ action: 'issue', id });
  ok('une ligne exonérée sans mention : l’émission est refusée', r.status === 400 && r.json.error === 'exempt-mention-required', r.text);
  ok('…et rien n’a été numéroté', rows(db, 'SELECT * FROM invoice_series').length === 0 && db.prepare('SELECT number FROM invoice_docs WHERE id = ?').get(id).number === null);
  await c.post({ action: 'save', id, exemptionMention: 'Exonéré de TVA, art. 91 du CGI' });
  r = await c.post({ action: 'issue', id });
  const d = r.json && r.json.doc;
  ok('l’émission donne F-AAAA-0001 (première facture du magasin)', r.status === 200 && d.number === num('F', 1) && d.seq === 1 && d.status === 'issued', r.text.slice(0, 200));
  ok('issued_ts posé, date d’émission = aujourd’hui', d.issuedTs > 0 && d.issueDate === TODAY);
  ok('l’identité du vendeur est figée depuis la fiche de l’établissement', d.seller && d.seller.legalName === 'FACTURE SHOP SARL' && d.seller.ice === '001234567000062' && d.seller.if === '12345678' && d.seller.rc === '88776' && d.seller.patente === '3456' && d.seller.city === 'Casablanca' && d.seller.phone === '0522000000');
  ok('…sans champ hors contrat (pas de CNSS)', !JSON.stringify(d.seller).includes('NE-PAS-FIGER'));
  db.prepare(`UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'business'`).run(JSON.stringify({ name: 'Nouveau Nom', legal: { ice: '', legalName: 'AUTRE' } }), SHOP);
  r = await c.get(`id=${id}`);
  ok('modifier la fiche ensuite ne change pas la facture émise', r.json.doc.seller.legalName === 'FACTURE SHOP SARL' && r.json.doc.seller.ice === '001234567000062');
  ok('la ligne de série porte le numéro et le document', JSON.stringify(rows(db, 'SELECT prefix, seq, number, doc_ref FROM invoice_series')) === JSON.stringify([{ prefix: 'F', seq: 1, number: num('F', 1), doc_ref: id }]));

  r = await c.post({ action: 'issue', id });
  ok('émettre deux fois rend la même facture, sans second numéro', r.status === 200 && r.json.doc.number === num('F', 1) && rows(db, 'SELECT * FROM invoice_series').length === 1);

  r = await c.post({ action: 'save', id, lines: [L('Autre chose', 1, 1)] });
  ok('modifier les lignes après émission : 409 locked', r.status === 409 && r.json.error === 'locked', r.text);
  r = await c.post({ action: 'save', id, customer: { ...CUST, name: 'Autre client' } });
  ok('changer le client après émission : 409 locked', r.status === 409 && r.json.error === 'locked');
  r = await c.post({ action: 'save', id, issueDate: '2020-01-01' });
  ok('changer la date après émission : 409 locked', r.status === 409 && r.json.error === 'locked');
  r = await c.post({ action: 'save', id, internalNote: 'relancer en novembre' });
  ok('la note interne reste modifiable', r.status === 200 && r.json.doc.internalNote === 'relancer en novembre');
  r = await c.post({ action: 'save', id, customer: CUST, lines: [L('Prestation', 1, 10000), L('Livre', 1, 5000, 0)], internalNote: 'avec le document tel quel' });
  ok('renvoyer le document à l’identique n’est pas une modification', r.status === 200 && r.json.doc.internalNote === 'avec le document tel quel');
  r = await c.post({ action: 'mark-sent', id });
  ok('mark-sent pose sent_ts', r.status === 200 && r.json.doc.sentTs > 0);
  r = await c.post({ action: 'delete-draft', id });
  ok('une facture émise ne se supprime jamais (409)', r.status === 409 && r.json.error === 'locked' && !!db.prepare('SELECT 1 FROM invoice_docs WHERE id = ?').get(id));

  // Validation à l'émission.
  r = await c.post({ action: 'save', type: 'invoice', customer: { name: '' }, lines: [L('x', 1, 100)] });
  r = await c.post({ action: 'issue', id: r.json.doc.id });
  ok('sans nom de client : invalid-customer', r.status === 400 && r.json.error === 'invalid-customer');
  r = await c.post({ action: 'save', type: 'invoice', customer: { name: 'X', ice: '001234567000089' }, lines: [L('x', 1, 100)] });
  r = await c.post({ action: 'issue', id: r.json.doc.id });
  ok('un ICE client qui rate son contrôle mod 97 : invalid-ice', r.status === 400 && r.json.error === 'invalid-ice' && r.json.reason === 'checksum');
  r = await c.post({ action: 'save', type: 'invoice', customer: { name: 'X' }, lines: [L('x', 0, 100)] });
  r = await c.post({ action: 'issue', id: r.json.doc.id });
  ok('aucune ligne avec une quantité : invalid-lines', r.status === 400 && r.json.error === 'invalid-lines');
  r = await c.post({ action: 'save', type: 'invoice', customer: { name: 'Particulier' }, lines: [L('x', 1, 100)] });
  r = await c.post({ action: 'issue', id: r.json.doc.id });
  ok('un client sans ICE (particulier) peut être facturé', r.status === 200 && r.json.doc.number === num('F', 2));

  // Date : jamais dans le futur.
  r = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('x', 1, 100)], issueDate: '2099-01-01' });
  r = await c.post({ action: 'issue', id: r.json.doc.id });
  ok('une date d’émission future est ramenée à aujourd’hui', r.status === 200 && r.json.doc.issueDate === TODAY && r.json.doc.number === num('F', 3));
}

/* ───────────────────────────── 3. règlements ───────────────────────────── */
console.log('■ Règlements · bornés par le solde, états dérivés');
{
  const { db, env } = database();
  const c = client(env);
  const make = async (extra = {}) => {
    const s = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('Prestation', 1, 10000)], ...extra });
    return (await c.post({ action: 'issue', id: s.json.doc.id })).json.doc;
  };
  const inv = await make({ termsDays: 30 });
  ok('TTC 120,00, échéance J+30, état « émise »', inv.totals.ttcCents === 12000 && inv.displayStatus === 'issued' && inv.balanceCents === 12000 && inv.dueDate > TODAY);
  let r = await c.post({ action: 'payment', id: inv.id, amountCents: 5000, date: TODAY, method: 'cash', reference: 'reçu 1' });
  ok('un règlement partiel : « partial », solde 70,00', r.status === 200 && r.json.displayStatus === 'partial' && r.json.balanceCents === 7000, r.text.slice(0, 200));
  r = await c.post({ action: 'payment', id: inv.id, amountCents: 7001, method: 'card' });
  ok('plus que le solde : amount-exceeds-balance (409)', r.status === 409 && r.json.error === 'amount-exceeds-balance');
  r = await c.post({ action: 'payment', id: inv.id, amountCents: 0, method: 'card' });
  ok('montant nul : refusé', r.status === 400);
  r = await c.post({ action: 'payment', id: inv.id, amountCents: 100, date: '2099-01-01' });
  ok('date de règlement future : refusée', r.status === 400 && r.json.error === 'invalid-date');
  {
    /* Un navigateur à l'est du magasin dit « demain » pendant quelques heures. */
    const tomorrow = new Date(Date.parse(TODAY + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    const dayAfter = new Date(Date.parse(TODAY + 'T00:00:00Z') + 2 * 86400000).toISOString().slice(0, 10);
    r = await c.post({ action: 'payment', id: inv.id, amountCents: 100, date: tomorrow, method: 'cash' });
    const tz = r.status === 200 ? (r.json.payments || []).find((p) => p.amountCents === 100) : null;
    ok('un jour d’avance (fuseau de l’appareil) : accepté et daté d’aujourd’hui', r.status === 200 && (!tz || tz.date === TODAY), r.text.slice(0, 200));
    if (r.status === 200 && tz) await c.post({ action: 'delete-payment', id: inv.id, paymentId: tz.id });
    r = await c.post({ action: 'payment', id: inv.id, amountCents: 100, date: dayAfter, method: 'cash' });
    ok('deux jours d’avance : toujours refusé', r.status === 400 && r.json.error === 'invalid-date');
  }
  r = await c.post({ action: 'payment', id: inv.id, amountCents: 100, method: 'bitcoin' });
  ok('mode de paiement inconnu : refusé', r.status === 400 && r.json.error === 'invalid-method');
  r = await c.post({ action: 'payment', id: inv.id, amountCents: 7000, method: 'transfer' });
  ok('le solde exact : « paid », solde 0', r.status === 200 && r.json.displayStatus === 'paid' && r.json.balanceCents === 0);
  r = await c.post({ action: 'payment', id: inv.id, amountCents: 1 });
  ok('plus rien à régler : refusé', r.status === 409 && r.json.error === 'amount-exceeds-balance');
  const pays = (await c.get(`id=${inv.id}`)).json.payments;
  ok('deux règlements enregistrés, dans l’ordre', pays.length === 2 && pays[0].amountCents + pays[1].amountCents === 12000);
  r = await c.post({ action: 'delete-payment', id: inv.id, paymentId: pays[1].id });
  ok('delete-payment rouvre le solde', r.status === 200 && r.json.balanceCents === pays[1].amountCents && r.json.displayStatus === 'partial');
  r = await c.post({ action: 'delete-payment', id: inv.id, paymentId: 'pay_inconnu' });
  ok('règlement inconnu : 404', r.status === 404);

  // Deux règlements « simultanés » : l'INSERT se garde lui-même.
  const inv2 = await make();
  const both = await Promise.all([
    c.post({ action: 'payment', id: inv2.id, amountCents: 8000 }),
    c.post({ action: 'payment', id: inv2.id, amountCents: 8000 }),
  ]);
  ok('deux règlements concurrents ne dépassent jamais la facture', both.filter((x) => x.status === 200).length === 1 && db.prepare('SELECT SUM(amount_cents) s FROM invoice_payments WHERE doc_id = ?').get(inv2.id).s === 8000);

  // Retard : dérivé, jamais stocké.
  const late0 = await make({ dueDate: addDays(TODAY, 10) });
  ok('une échéance avant la date d’émission est ramenée à l’émission', (await make({ dueDate: '2020-01-31' })).dueDate === TODAY);
  db.prepare('UPDATE invoice_docs SET due_date = ? WHERE id = ?').run('2020-01-31', late0.id); // le temps a passé
  const late = (await c.get(`id=${late0.id}`)).json.doc;
  ok('échéance dépassée et solde > 0 : « overdue » (dérivé)', late.displayStatus === 'overdue' && db.prepare('SELECT status FROM invoice_docs WHERE id = ?').get(late.id).status === 'issued');
  const lst = (await c.get('type=invoice')).json.docs;
  ok('la liste porte le même état dérivé et le solde', lst.find((x) => x.id === late.id).displayStatus === 'overdue' && lst.find((x) => x.id === late.id).balanceCents === 12000);
  r = await c.post({ action: 'payment', id: late.id, amountCents: 100 });
  ok('en retard et partiellement réglée : le retard l’emporte', r.json.displayStatus === 'overdue');

  const draft = (await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('x', 1, 100)] })).json.doc;
  r = await c.post({ action: 'payment', id: draft.id, amountCents: 100 });
  ok('on ne règle pas un brouillon : not-issued', r.status === 409 && r.json.error === 'not-issued');
}

/* ───────────────────────────── 4. avoirs ───────────────────────────── */
console.log('■ Avoirs · bornés par ce qu’il reste à créditer');
{
  const { db, env } = database();
  const c = client(env);
  const s = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('Prestation', 1, 10000)] });
  const inv = (await c.post({ action: 'issue', id: s.json.doc.id })).json.doc;     // TTC 12000
  const draftInv = (await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('x', 1, 100)] })).json.doc;

  let r = await c.post({ action: 'credit-note', id: draftInv.id, reason: 'x' });
  ok('on ne crédite pas un brouillon : not-issued', r.status === 409 && r.json.error === 'not-issued');
  r = await c.post({ action: 'credit-note', id: inv.id });
  ok('un avoir sans motif est refusé', r.status === 400 && r.json.error === 'invalid-reason');
  r = await c.post({ action: 'credit-note', id: inv.id, reason: 'Retour partiel', lines: [L('Prestation', 1, 4000)] });
  const cn1 = r.json.doc;
  ok('l’avoir est créé en BROUILLON, sans numéro, relié à la facture', r.status === 200 && cn1.type === 'credit_note' && cn1.status === 'draft' && cn1.number === null && cn1.originalId === inv.id && cn1.totals.ttcCents === 4800);
  ok('…et reprend le client de la facture', cn1.customer.name === 'SARL Atlas' && cn1.customer.ice === '001234567000062');
  r = await c.post({ action: 'issue', id: cn1.id });
  ok('l’émission donne AV-AAAA-0001 (série propre)', r.status === 200 && r.json.doc.number === num('AV', 1) && r.json.doc.originalNumber === inv.number, r.text.slice(0, 200));
  ok('la facture n’est pas annulée : solde 72,00', (await c.get(`id=${inv.id}`)).json.balanceCents === 7200);

  r = await c.post({ action: 'credit-note', id: inv.id, reason: 'Retour partiel 2', lines: [L('Prestation', 1, 4000)] });
  r = await c.post({ action: 'issue', id: r.json.doc.id });
  ok('plusieurs avoirs partiels : AV-0002, solde 24,00', r.json.doc.number === num('AV', 2) && (await c.get(`id=${inv.id}`)).json.balanceCents === 2400);

  r = await c.post({ action: 'credit-note', id: inv.id, reason: 'Trop', lines: [L('Prestation', 1, 2001)] });
  ok('plus que le reste à créditer : credit-exceeds-invoice (409)', r.status === 409 && r.json.error === 'credit-exceeds-invoice', r.text);
  r = await c.post({ action: 'credit-note', id: inv.id, reason: 'Tout' });
  ok('l’avoir « tout » dépasse aussi le reste', r.status === 409 && r.json.error === 'credit-exceeds-invoice');

  r = await c.post({ action: 'credit-note', id: inv.id, reason: 'Solde', lines: [L('Prestation', 1, 2000)] });
  const last = r.json.doc;
  r = await c.post({ action: 'issue', id: last.id });
  const after = (await c.get(`id=${inv.id}`)).json;
  ok('avoirs cumulés = TTC : la facture est annulée (cancelled)', r.json.doc.number === num('AV', 3) && after.doc.status === 'cancelled' && after.displayStatus === 'cancelled' && after.doc.cancelledTs > 0);
  ok('…le solde est nul et les trois avoirs sont listés', after.balanceCents === 0 && after.creditNotes.length === 3 && after.creditNotes.map((x) => x.number).join() === [num('AV', 1), num('AV', 2), num('AV', 3)].join());
  r = await c.post({ action: 'credit-note', id: inv.id, reason: 'Encore', lines: [L('x', 1, 1)] });
  ok('une facture annulée ne se crédite plus', r.status === 409 && r.json.error === 'credit-exceeds-invoice');
  r = await c.post({ action: 'payment', id: inv.id, amountCents: 100 });
  ok('…ni ne se règle', r.status === 409);
  r = await c.post({ action: 'save', id: last.id, reason: 'autre' });
  ok('un avoir émis est verrouillé (409)', r.status === 409 && r.json.error === 'locked');
  r = await c.post({ action: 'save', type: 'credit_note', customer: CUST, lines: [L('x', 1, 1)] });
  ok('un avoir ne se crée pas par « save »', r.status === 400 && r.json.error === 'invalid-type');
  r = await c.post({ action: 'duplicate', id: last.id });
  ok('un avoir ne se duplique pas', r.status === 400);

  // La borne tient aussi À L'ÉMISSION : deux brouillons chacun dans la limite.
  const s2 = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('Prestation', 1, 10000)] });
  const inv2 = (await c.post({ action: 'issue', id: s2.json.doc.id })).json.doc;
  const dA = (await c.post({ action: 'credit-note', id: inv2.id, reason: 'A', lines: [L('p', 1, 6000)] })).json.doc;   // 7200
  const dB = (await c.post({ action: 'credit-note', id: inv2.id, reason: 'B', lines: [L('p', 1, 6000)] })).json.doc;   // 7200
  ok('deux brouillons de 72,00 sur 120,00 : créés l’un et l’autre', !!dA && !!dB);
  r = await c.post({ action: 'issue', id: dA.id });
  ok('le premier s’émet', r.status === 200);
  r = await c.post({ action: 'issue', id: dB.id });
  ok('le second est refusé à l’émission : credit-exceeds-invoice', r.status === 409 && r.json.error === 'credit-exceeds-invoice', r.text);
  ok('…et n’a consommé aucun numéro', db.prepare("SELECT COUNT(*) n FROM invoice_series WHERE prefix = 'AV'").get().n === 4 && db.prepare('SELECT number FROM invoice_docs WHERE id = ?').get(dB.id).number === null);
}

/* ───────────────────────────── 5. devis ───────────────────────────── */
console.log('■ Devis · numéro D, conversion en facture');
{
  const { db, env } = database();
  const c = client(env);
  let r = await c.post({ action: 'save', type: 'quote', customer: CUST, lines: [L('Étude', 2, 15000)], termsDays: 15 });
  const q = r.json.doc;
  ok('un devis brouillon a une validité (+30 j) et pas de numéro', q.status === 'draft' && q.number === null && q.validUntil > TODAY);
  r = await c.post({ action: 'issue', id: q.id });
  ok('l’émission d’un devis : D-AAAA-0001, état « sent »', r.status === 200 && r.json.doc.number === num('D', 1) && r.json.doc.status === 'sent' && r.json.doc.displayStatus === 'sent', r.text.slice(0, 200));
  r = await c.post({ action: 'save', id: q.id, lines: [L('Étude', 3, 15000)] });
  ok('un devis émis reste modifiable et garde son numéro', r.status === 200 && r.json.doc.number === num('D', 1) && r.json.doc.totals.htCents === 45000);
  r = await c.post({ action: 'save', id: q.id, validUntil: '2020-01-01' });
  ok('validité dépassée : « expired » (dérivé)', r.json.doc.displayStatus === 'expired' && r.json.doc.status === 'sent');
  await c.post({ action: 'save', id: q.id, validUntil: addDays(TODAY, 20) });
  r = await c.post({ action: 'quote-status', id: q.id, status: 'accepted' });
  ok('quote-status accepted', r.status === 200 && r.json.doc.status === 'accepted');
  r = await c.post({ action: 'quote-status', id: q.id, status: 'paid' });
  ok('un statut hors accepted/rejected est refusé', r.status === 400);

  r = await c.post({ action: 'convert-quote', id: q.id });
  const inv = r.json.doc;
  ok('convert-quote crée un BROUILLON de facture relié au devis', r.status === 200 && inv.type === 'invoice' && inv.status === 'draft' && inv.number === null && inv.sourceQuoteId === q.id);
  ok('…avec le client et les lignes du devis', inv.customer.name === 'SARL Atlas' && inv.totals.htCents === 45000 && inv.lines.length === 1);
  ok('…et le devis passe à « invoiced »', r.json.quote.status === 'invoiced');
  r = await c.post({ action: 'convert-quote', id: q.id });
  ok('convertir deux fois rend la même facture (idempotent)', r.status === 200 && r.json.doc.id === inv.id && r.json.already === true && db.prepare("SELECT COUNT(*) n FROM invoice_docs WHERE source_quote_id = ?").get(q.id).n === 1);
  r = await c.post({ action: 'save', id: q.id, lines: [L('x', 1, 1)] });
  ok('un devis converti est verrouillé', r.status === 409 && r.json.error === 'locked');
  r = await c.post({ action: 'issue', id: inv.id });
  ok('la facture issue du devis s’émet en F (série facture)', r.status === 200 && r.json.doc.number === num('F', 1) && r.json.doc.sourceQuoteId === q.id);

  const q2 = (await c.post({ action: 'save', type: 'quote', customer: CUST, lines: [L('x', 1, 100)] })).json.doc;
  r = await c.post({ action: 'convert-quote', id: q2.id });
  ok('un devis non émis ne se convertit pas', r.status === 409 && r.json.error === 'not-issued');
  await c.post({ action: 'issue', id: q2.id });
  await c.post({ action: 'quote-status', id: q2.id, status: 'rejected' });
  r = await c.post({ action: 'convert-quote', id: q2.id });
  ok('un devis refusé ne se convertit pas', r.status === 409);
  r = await c.post({ action: 'delete-draft', id: q2.id });
  ok('un devis émis (numéroté) ne se supprime pas', r.status === 409);

  r = await c.post({ action: 'duplicate', id: q.id });
  ok('duplicate : nouveau brouillon du même type, mêmes client et lignes, sans numéro', r.status === 200 && r.json.doc.id !== q.id && r.json.doc.type === 'quote' && r.json.doc.status === 'draft' && r.json.doc.number === null && r.json.doc.totals.htCents === 45000 && r.json.doc.sourceQuoteId === null);
  const dup = r.json.doc;
  r = await c.post({ action: 'delete-draft', id: dup.id });
  ok('delete-draft supprime un brouillon', r.status === 200 && !db.prepare('SELECT 1 FROM invoice_docs WHERE id = ?').get(dup.id));
  r = await c.get(`id=${dup.id}`);
  ok('…et il n’existe plus (404)', r.status === 404);
}
function addDays(day, n) { return new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }

/* ───────────────────────────── 6. import des anciennes factures ───────────────────────────── */
console.log('■ Import · les factures gardées sur l’appareil');
{
  const { db, env } = database();
  const c = client(env);
  const legacy = [
    { id: 1042, customer: 'Riad Zayna', contact: '+212 661 44 08 22', issueDate: '2026-09-01', dueDate: '2026-09-08', terms: 7, taxRate: 20, status: 'sent', items: [{ description: 'Service traiteur', qty: 1, price: 8750 }], note: 'Merci.' },
    { id: 1041, customer: 'Atelier Nomade', contact: 'finance@atelier-nomade.ma', issueDate: '2026-08-20', dueDate: '2026-09-04', terms: 15, taxRate: 20, status: 'paid', items: [{ description: 'Salle', qty: 1, price: 5400 }, { description: 'Pause café', qty: 24, price: 65.5 }], note: '' },
    { id: 7, customer: 'Sans lignes', items: [] },
  ];
  let r = await c.post({ action: 'import-legacy', docs: legacy });
  ok('deux documents importés, un sans ligne écarté', r.status === 200 && r.json.importedCount === 2 && r.json.skipped.some((s) => s.legacyRef === '#7' && s.reason === 'no-lines'), r.text.slice(0, 300));
  const a = db.prepare("SELECT * FROM invoice_docs WHERE legacy_ref = '#1042'").get();
  ok('importé en BROUILLON, sans numéro, legacy_ref = #id', a && a.status === 'draft' && a.number === null && a.type === 'invoice');
  const aLines = JSON.parse(a.lines), aTot = JSON.parse(a.totals);
  ok('le prix reste HT : 8750,00 → unitHT 875000 centimes', aLines[0].unitHT === 875000 && aLines[0].vatRate === 20);
  ok('…et le TTC s’obtient en ajoutant la TVA : 10 500,00', aTot.htCents === 875000 && aTot.ttcCents === 1050000);
  ok('client : nom, téléphone / e-mail selon le contact', JSON.parse(a.customer).name === 'Riad Zayna' && JSON.parse(a.customer).phone === '+212 661 44 08 22' && JSON.parse(db.prepare("SELECT customer FROM invoice_docs WHERE legacy_ref = '#1041'").get().customer).email === 'finance@atelier-nomade.ma');
  ok('dates, délai et note repris', a.issue_date === '2026-09-01' && a.due_date === '2026-09-08' && a.terms_days === 7 && a.note === 'Merci.');
  const b = JSON.parse(db.prepare("SELECT totals FROM invoice_docs WHERE legacy_ref = '#1041'").get().totals);
  ok('quantité × prix décimal : 5400,00 + 24 × 65,50 = 6972,00 HT', b.htCents === 697200);
  r = await c.post({ action: 'import-legacy', docs: legacy });
  ok('réimporter est idempotent : rien de nouveau', r.status === 200 && r.json.importedCount === 0 && db.prepare("SELECT COUNT(*) n FROM invoice_docs WHERE legacy_ref IS NOT NULL").get().n === 2);
  r = await c.post({ action: 'import-legacy', docs: [legacy[0], legacy[0]] });
  ok('…y compris le même numéro deux fois dans un appel', r.json.importedCount === 0);
  const many = Array.from({ length: 501 }, (_, i) => ({ id: 5000 + i, customer: 'X', items: [{ description: 'a', qty: 1, price: 1 }] }));
  r = await c.post({ action: 'import-legacy', docs: many });
  ok('au plus 500 documents par appel', r.status === 400 && r.json.error === 'invalid-docs');
  r = await c.post({ action: 'import-legacy', docs: many.slice(0, 500) });
  ok('500 documents passent', r.status === 200 && r.json.importedCount === 500);
  const lst = (await c.get('type=invoice')).json.docs;
  ok('la liste plafonne à 500', lst.length === 500);
  ok('…et porte legacyRef', (await c.get('from=2026-09-01&to=2026-09-01')).json.docs.some((x) => x.legacyRef === '#1042'));
  // Un autre magasin peut avoir le même numéro d'ancienne facture.
  const cb = client(env, ownerB, OTHER);
  r = await cb.post({ action: 'import-legacy', docs: [legacy[0]] });
  ok('le même #1042 chez un autre magasin n’est pas un doublon', r.status === 200 && r.json.importedCount === 1);
}

/* ───────────────────────────── 7. une série, deux chemins ───────────────────────────── */
console.log('■ Série F · caisse et saisie ne se croisent jamais');
{
  const { db, env } = database();
  const c = client(env);
  const insSale = db.prepare('INSERT OR IGNORE INTO sales (id, merchant, amount, amount_cents, method, ref, ts) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const till = async (saleId, cents) => {
    insSale.run(saleId, SHOP, cents / 100, cents, 'cash', 'R-' + saleId, Date.now() - 1000);
    return tillInvoice.getOrCreateSaleInvoice(env, SHOP, saleId, { name: 'Client caisse' }, { issuedTs: Date.now(), totals: { ttc: cents / 100 } });
  };
  const manual = async () => {
    const s = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('p', 1, 100)] });
    return (await c.post({ action: 'issue', id: s.json.doc.id })).json.doc;
  };
  // Un magasin qui a déjà trois factures de caisse et AUCUNE ligne dans invoice_series.
  const old = db.prepare('INSERT INTO sale_invoices (merchant, seq, number, sale_id, customer, snapshot, created_ts) VALUES (?,?,?,?,?,?,?)');
  for (let i = 1; i <= 3; i++) old.run(SHOP, i, `F-2025-000${i}`, `old-${i}`, null, '{}', now);
  ok('point de départ : invoice_series est vide', db.prepare('SELECT COUNT(*) n FROM invoice_series').get().n === 0);
  const m1 = await manual();
  ok('l’historique de caisse est respecté : la première facture saisie est F-…-0004', m1.number === num('F', 4) && m1.seq === 4, m1.number);
  const t1 = await till('sale-1', 5000);
  ok('puis la caisse prend 0005 (la série est partagée)', t1.number === num('F', 5) && t1.seq === 5, t1.number);
  const m2 = await manual();
  const t2 = await till('sale-2', 7000);
  const m3 = await manual();
  ok('en alternance : 0006, 0007, 0008', m2.number === num('F', 6) && t2.number === num('F', 7) && m3.number === num('F', 8), [m2.number, t2.number, m3.number].join());
  const all = [...rows(db, 'SELECT number FROM sale_invoices').map((x) => x.number), ...rows(db, "SELECT number FROM invoice_docs WHERE number IS NOT NULL").map((x) => x.number)].filter((n) => n.startsWith('F-' + YEAR));
  ok('aucun numéro F n’est distribué deux fois', new Set(all).size === all.length, all.join());
  const seqs = rows(db, "SELECT seq FROM invoice_series WHERE prefix = 'F' ORDER BY seq").map((x) => x.seq);
  ok('invoice_series = les numéros pris après l’historique, sans trou', seqs.join() === '4,5,6,7,8', seqs.join());
  ok('la réservation de la caisse porte la vente, celle de la saisie le document', db.prepare("SELECT doc_ref FROM invoice_series WHERE seq = 5").get().doc_ref === 'sale-1' && db.prepare("SELECT doc_ref FROM invoice_series WHERE seq = 4").get().doc_ref === m1.id);
  const again = await till('sale-1', 5000).catch((e) => e);
  ok('la caisse reste idempotente par vente (même numéro)', again && again.existing === true && again.number === num('F', 5));
  const cn = await c.post({ action: 'credit-note', id: m1.id, reason: 'r' });
  const cnIssued = await c.post({ action: 'issue', id: cn.json.doc.id });
  ok('les avoirs (AV) et devis (D) ont chacun leur série : AV-0001', cnIssued.json.doc.number === num('AV', 1));

  // Collision simulée : un autre appareil prend le numéro entre la lecture et l'écriture.
  const q = (await c.post({ action: 'save', type: 'quote', customer: CUST, lines: [L('p', 1, 100)] })).json.doc;
  let fired = 0;
  const rival = (stmtSql) => /SELECT COALESCE\(MAX\(seq\), 0\) AS m FROM invoice_series/.test(stmtSql);
  const raced = { ...env, DB: {
    ...env.DB,
    prepare(sql) {
      const stmt = env.DB.prepare(sql);
      if (!rival(sql)) return stmt;
      return { bind: (...p) => { const b = stmt.bind(...p); return { ...b, async first() {
        const row = await b.first();
        if (!fired++) db.prepare(`INSERT INTO invoice_series (merchant, prefix, seq, number, doc_ref, created_ts) VALUES (?, 'D', ?, ?, 'rival-device', ?)`).run(SHOP, row.m + 1, num('D', row.m + 1), now);
        return row;
      } }; } };
    },
  } };
  const cr = client(raced);
  const rr = await cr.post({ action: 'issue', id: q.id });
  ok('une collision d’unicité recommence avec le numéro suivant (D-…-0002)', rr.status === 200 && rr.json.doc.number === num('D', 2) && rr.json.doc.seq === 2, rr.text.slice(0, 200));
  ok('…l’autre appareil garde le 0001, aucun trou, aucun doublon', JSON.stringify(rows(db, "SELECT seq, doc_ref FROM invoice_series WHERE prefix = 'D' ORDER BY seq")) === JSON.stringify([{ seq: 1, doc_ref: 'rival-device' }, { seq: 2, doc_ref: q.id }]));

  // Deux appareils émettent le MÊME brouillon au même instant : un seul numéro.
  const dbl = (await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('p', 1, 100)] })).json.doc;
  const [x, y] = await Promise.all([c.post({ action: 'issue', id: dbl.id }), c.post({ action: 'issue', id: dbl.id })]);
  ok('deux émissions simultanées du même brouillon rendent le même numéro', x.status === 200 && y.status === 200 && x.json.doc.number === y.json.doc.number);
  ok('…et n’en consomment qu’un', db.prepare("SELECT COUNT(*) n FROM invoice_series WHERE doc_ref = ?").get(dbl.id).n === 1);

  // Un échec NON lié au numéro annule la réservation avec le reste.
  const failing = { ...env, DB: { ...env.DB, async batch(stmts) { const inner = env.DB.batch; const poisoned = [...stmts, env.DB.prepare('INSERT INTO invoice_series (merchant) VALUES (?)').bind('x')]; return inner(poisoned); } } };
  const d3 = (await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('p', 1, 100)] })).json.doc;
  const before = db.prepare('SELECT COUNT(*) n FROM invoice_series').get().n;
  const bad = await client(failing).post({ action: 'issue', id: d3.id });
  ok('un lot qui échoue ne laisse aucun numéro réservé', bad.status === 500 && db.prepare('SELECT COUNT(*) n FROM invoice_series').get().n === before && db.prepare('SELECT number FROM invoice_docs WHERE id = ?').get(d3.id).number === null);
}

/* ───────────────────────────── 8. accès ───────────────────────────── */
console.log('■ Accès · propriétaire ou opérateur nommé, rien d’autre');
{
  const { db, env } = database();
  db.prepare(`INSERT INTO accountant_access (id,merchant,label,email,token_hash,created_ts,created_by,expires_ts) VALUES (?,?,?,?,?,?,?,?)`)
    .run(ACCT_ID, SHOP, 'Cabinet', null, 'h'.repeat(64), now, 'acc-a', now + 86400000);
  const c = client(env);
  const doc = (await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('p', 1, 100)] })).json.doc;
  const count = () => db.prepare('SELECT COUNT(*) n FROM invoice_docs').get().n;
  const before = count();

  const who = [['caisse appairée', tillCookie], ['employé connecté', empCookie], ['cookie comptable kiwi_acct', acctCookie], ['sans cookie', ''], ['propriétaire d’un autre magasin', ownerB]];
  for (const [label, cookie] of who) {
    const g = await c.get('', cookie);
    ok(`${label} : lecture refusée (${g.status})`, (g.status === 401 || g.status === 403) && !/SARL Atlas/.test(g.text));
    const g2 = await c.get(`id=${doc.id}`, cookie);
    ok(`${label} : lecture d’un document refusée (${g2.status})`, (g2.status === 401 || g2.status === 403) && !/SARL Atlas/.test(g2.text));
    const p = await c.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('p', 1, 100)] }, cookie);
    ok(`${label} : écriture refusée (${p.status})`, p.status === 401 || p.status === 403);
    const p2 = await c.post({ action: 'issue', id: doc.id }, cookie);
    ok(`${label} : émission refusée (${p2.status})`, p2.status === 401 || p2.status === 403);
  }
  ok('aucune de ces tentatives n’a écrit', count() === before && db.prepare('SELECT number FROM invoice_docs WHERE id = ?').get(doc.id).number === null);

  const op = await c.get('', operatorCookie);
  ok('un opérateur nommé lit', op.status === 200 && op.json.docs.length === 1);
  const opw = await c.post({ action: 'save', type: 'quote', customer: CUST, lines: [L('p', 1, 100)] }, operatorCookie);
  ok('…et écrit', opw.status === 200 && opw.json.doc.type === 'quote');
  const owner = await c.get('');
  ok('le propriétaire lit', owner.status === 200);

  // Cloisonnement : l'identifiant d'un document d'un autre magasin.
  const cb = client(env, ownerB, OTHER);
  const foreign = [
    await cb.get(`id=${doc.id}`),
    await cb.post({ action: 'issue', id: doc.id }),
    await cb.post({ action: 'save', id: doc.id, internalNote: 'x' }),
    await cb.post({ action: 'payment', id: doc.id, amountCents: 100 }),
    await cb.post({ action: 'delete-draft', id: doc.id }),
    await cb.post({ action: 'duplicate', id: doc.id }),
    await cb.post({ action: 'credit-note', id: doc.id, reason: 'x' }),
    await cb.post({ action: 'convert-quote', id: doc.id }),
    await cb.post({ action: 'mark-sent', id: doc.id }),
  ];
  ok('l’identifiant d’un document d’un autre magasin : 404 partout', foreign.every((x) => x.status === 404 && x.json.error === 'not-found'), foreign.map((x) => x.status).join());
  ok('…aucune fuite dans le corps', foreign.every((x) => !/SARL Atlas|facture-shop/.test(x.text)));
  ok('…et le document n’a pas bougé', db.prepare('SELECT internal_note, status FROM invoice_docs WHERE id = ?').get(doc.id).status === 'draft');
  const bList = await cb.get('');
  ok('la liste de l’autre magasin est la sienne (vide)', bList.status === 200 && bList.json.docs.length === 0);
  const crossAsk = await client(env, ownerB, SHOP).get('');
  ok('demander le magasin d’autrui avec sa propre session : refusé', crossAsk.status === 403);

  // La porte du site : rien n'est ouvert pour cette route.
  const run = async (method, p, cookie = '') => {
    let nexted = false;
    const res = await middleware.onRequest({
      request: new Request(BASE + p, { method, headers: { 'CF-Connecting-IP': '10.3.3.3', ...(cookie ? { Cookie: cookie } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}) }),
      env: { AUTH_SECRET: SECRET, DB: env.DB },
      next: async () => { nexted = true; return new Response('{}', { status: 200 }); },
    });
    return { nexted, status: res.status };
  };
  for (const [m, p, ck] of [['GET', '/api/invoices?merchant=' + SHOP, ''], ['POST', '/api/invoices', ''], ['GET', '/api/invoices?merchant=' + SHOP, acctCookie], ['POST', '/api/invoices', acctCookie]]) {
    const r = await run(m, p, ck);
    ok(`${m} /api/invoices ${ck ? 'avec le cookie comptable' : 'sans compte'} reste derrière la porte (${r.status})`, !r.nexted && r.status === 401);
  }
  ok('le middleware n’a aucune exception pour /api/invoices', !/api\/invoices/.test(fs.readFileSync(path.join(ROOT, 'functions/_middleware.js'), 'utf8')));
}

/* ───────────────────────────── 9. livres de l'expert-comptable ───────────────────────────── */
console.log('■ Livres · seulement du émis');
{
  const { db, env } = database();
  const c = client(env);
  const mk = async (type, lines, extra = {}) => (await c.post({ action: 'save', type, customer: CUST, lines, ...extra })).json.doc;
  const i1 = await mk('invoice', [L('Prestation', 1, 10000), L('Livre', 1, 3000, 10)]);                   // 100 @20 + 30 @10
  const iss1 = (await c.post({ action: 'issue', id: i1.id })).json.doc;
  await c.post({ action: 'payment', id: iss1.id, amountCents: 5000, method: 'cash' });
  await mk('invoice', [L('Brouillon', 1, 99999)]);                                                      // brouillon : jamais
  const quote = await mk('quote', [L('Devis', 1, 77777)]);
  await c.post({ action: 'issue', id: quote.id });                                                     // devis émis : jamais
  const cn = (await c.post({ action: 'credit-note', id: iss1.id, reason: 'Geste', lines: [L('Prestation', 1, 2000)] })).json.doc;
  await c.post({ action: 'issue', id: cn.id });

  db.prepare(`INSERT INTO accountant_access (id,merchant,label,email,token_hash,created_ts,created_by,expires_ts) VALUES (?,?,?,?,?,?,?,?)`)
    .run(ACCT_ID, SHOP, 'Cabinet', null, 'h'.repeat(64), now, 'acc-a', now + 86400000);
  const month = TODAY.slice(0, 7);
  const res = await books.onRequest({ request: reqOf('GET', `/api/comptable/books?month=${month}`, acctCookie), env });
  const j = (await readRes(res)).json;
  ok('les livres répondent', res.status === 200 && j.invoiceDocs && j.invoiceDocs.status === 'ok', JSON.stringify(j && j.invoiceDocs).slice(0, 200));
  const rowsDocs = j.invoiceDocs.rows;
  ok('une facture émise et un avoir émis, ni brouillon ni devis', rowsDocs.length === 2 && rowsDocs.map((r) => r.type).sort().join() === 'credit_note,invoice');
  const inv = rowsDocs.find((r) => r.type === 'invoice'), av = rowsDocs.find((r) => r.type === 'credit_note');
  ok('facture : numéro, date, client (nom + ICE), HT, TVA par taux, TTC, solde', inv.number === num('F', 1) && inv.day === TODAY && inv.customer.name === 'SARL Atlas' && inv.customer.ice === '001234567000062' && inv.htCents === 13000 && inv.vatCents === 2300 && inv.ttcCents === 15300 && inv.byRate.length === 2 && inv.byRate[0].rate === 20 && inv.byRate[0].vatCents === 2000, JSON.stringify(inv));
  ok('…solde = TTC − règlements − avoirs : 153,00 − 50,00 − 24,00 = 79,00', inv.balanceCents === 7900, String(inv.balanceCents));
  ok('avoir : numéro AV, facture d’origine, montants positifs', av.number === num('AV', 1) && av.originalNumber === num('F', 1) && av.ttcCents === 2400 && av.balanceCents === null);
  ok('la TVA du mois = facture − avoir (taux par taux)', j.vat.status === 'ok' && j.vat.byRate['20'].tvaCents === 2000 - 400 && j.vat.byRate['10'].tvaCents === 300 && j.vat.tvaCents === 2300 - 400, JSON.stringify(j.vat));
  ok('ni note interne, ni e-mail, ni téléphone du client', !/achats@atlas|0600000000|internal|Brouillon|Devis/.test(JSON.stringify(j.invoiceDocs)));
  ok('les factures de caisse restent dans invoices.rows', Array.isArray(j.invoices.rows));

  const lag = database();
  lag.db.exec('DROP TABLE invoice_docs; DROP TABLE invoice_payments;');
  lag.db.prepare(`INSERT INTO accountant_access (id,merchant,label,email,token_hash,created_ts,created_by,expires_ts) VALUES (?,?,?,?,?,?,?,?)`).run(ACCT_ID, SHOP, 'Cabinet', null, 'h'.repeat(64), now, 'acc-a', now + 86400000);
  const lres = await books.onRequest({ request: reqOf('GET', `/api/comptable/books?month=${month}`, acctCookie), env: lag.env });
  const lj = (await readRes(lres)).json;
  ok('table absente en production : « non enregistrée », pas vide, pas de plantage', lres.status === 200 && lj.invoiceDocs.status === 'not-recorded' && lj.sales.status === 'ok');
}

/* ───────────────────────────── 10. production en retard sur schema.sql ───────────────────────────── */
console.log('■ Schéma · tables créées au premier usage, DDL fidèle à schema.sql');
{
  const lag = database();
  lag.db.exec('DROP TABLE invoice_docs; DROP TABLE invoice_payments; DROP TABLE invoice_series; DROP TABLE sale_invoices;');
  const c = client(lag.env);
  let r = await c.get('');
  ok('lecture sans tables : liste vide, tables créées', r.status === 200 && r.json.docs.length === 0 && !!lag.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'invoice_docs'").get());
  const lag2 = database();
  lag2.db.exec('DROP TABLE invoice_docs; DROP TABLE invoice_payments; DROP TABLE invoice_series; DROP TABLE sale_invoices;');
  const c2 = client(lag2.env);
  r = await c2.post({ action: 'save', type: 'invoice', customer: CUST, lines: [L('p', 1, 100)] });
  ok('écriture sans tables : le brouillon est créé', r.status === 200 && r.json.doc.status === 'draft');
  r = await c2.post({ action: 'issue', id: r.json.doc.id });
  ok('…et l’émission aussi (F-0001), tables de série comprises', r.status === 200 && r.json.doc.number === num('F', 1));

  const fresh = new DatabaseSync(':memory:');
  fresh.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const viaCode = new DatabaseSync(':memory:');
  for (const sql of series.INVOICING_DDL) viaCode.exec(sql);
  const shape = (d, t) => JSON.stringify(d.prepare(`PRAGMA table_info(${t})`).all().map((x) => [x.name, x.type, x.notnull, x.pk, x.dflt_value]));
  for (const t of ['invoice_series', 'invoice_docs', 'invoice_payments', 'sale_invoices']) {
    ok(`${t} : mêmes colonnes dans le DDL de repli et dans schema.sql`, shape(fresh, t) === shape(viaCode, t));
  }
  const idx = (d, tbl) => JSON.stringify(d.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%' ORDER BY name`).all(tbl).map((x) => [x.name, String(x.sql).replace(/\s+/g, ' ')]));
  for (const t of ['invoice_docs', 'invoice_payments', 'sale_invoices']) {
    ok(`${t} : mêmes index`, idx(fresh, t) === idx(viaCode, t), idx(fresh, t) + '\n' + idx(viaCode, t));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
