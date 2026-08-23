#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Gardes d'identité de locataire et d'intégrité comptable
 *
 * Ce banc garde les correctifs de l'audit serveur du 2026-08-23. Chacun
 * répond à un chemin par lequel un compte pouvait atteindre le commerce d'un
 * autre, ou écrire dans les livres quelque chose que le serveur n'avait jamais
 * vérifié :
 *
 *   1. le slug de locataire dérive de `accounts.business`, que l'utilisateur
 *      choisit — s'inscrire sous le nom d'une enseigne existante suffisait ;
 *   2. la facture ne confrontait ni son montant ni son millésime à la vente ;
 *   3. le fond de caisse attendu était purement déclaratif ;
 *   4. le compteur de tickets se laissait empoisonner par un plancher demandé.
 *
 * Aucun code, aucun PIN, aucun mot de passe n'apparaît ici : les gardes
 * répondent par une identité ou par un refus, jamais par un secret.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { slugClaimedByOther, entitledMerchant, makeSession, SESS_COOKIE, slugMerchant } from '../functions/auth/_lib.js';
import { tenantFor } from '../functions/api/_private.js';
import { getOrCreateSaleInvoice } from '../functions/api/invoice.js';
import { onRequestPost as postCashEvent } from '../functions/api/cash-sessions.js';
import { reserveTicketRange } from '../functions/api/ticket-sequence.js';
import { priceOrder } from '../functions/api/order/_lib.js';
import { verifyStaffPin, targetKey } from '../functions/auth/_lib.js';
import fs from 'node:fs';

const SECRET = 'tenant-guard-test-secret-32-bytes!!';
let failures = 0;
let checks = 0;
function ok(label, cond, detail) {
  checks++;
  if (cond) console.log('  ✓ ' + label);
  else { failures++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}
console.log('■ Gardes de locataire et d\'intégrité (tools/tenant-guard-test.mjs)');

/* Une base D1 de comptoir : on ne modélise que les requêtes que les gardes
 * posent réellement, et on laisse tomber le reste plutôt que de mentir. */
function makeDb(state) {
  const rows = state || {};
  return {
    _writes: [],
    prepare(sql) {
      const q = String(sql).replace(/\s+/g, ' ').trim();
      const stmt = {
        args: [],
        bind(...a) { stmt.args = a; return stmt; },
        async run() {
          if (rows.throwOnWrite) throw new Error('db-down');
          rows.__db._writes.push({ q, args: stmt.args });
          return { success: true, meta: { changes: 1 } };
        },
        async all() { return { results: [] }; },
        async first() {
          if (rows.throwOnRead) throw new Error('db-down');
          if (q.startsWith('SELECT account_id FROM merchant_config')) {
            const owner = (rows.registry || {})[stmt.args[0]];
            return owner === undefined ? null : { account_id: owner };
          }
          if (q.startsWith('SELECT business FROM accounts')) {
            const acc = (rows.accounts || {})[stmt.args[0]];
            return acc ? { business: acc } : null;
          }
          return null;
        },
      };
      return stmt;
    },
    async batch(stmts) { return stmts.map(() => ({ success: true })); },
  };
}
function db(state) { const d = makeDb(state); state.__db = d; return d; }

/* ── 1 · slugClaimedByOther : refuse SEULEMENT sur une réponse positive ───── */
{
  const claimed = db({ registry: { 'amira-cafe': 'acc-9' } });
  ok('un slug nommément détenu par un autre compte est refusé',
    (await slugClaimedByOther({ DB: claimed }, 'amira-cafe', 'acc-1')) === true);
  ok('le propriétaire lui-même n\'est jamais refusé',
    (await slugClaimedByOther({ DB: claimed }, 'amira-cafe', 'acc-9')) === false);

  const unclaimed = db({ registry: { 'amira-cafe': '' } });
  ok('une boutique jamais revendiquée rend la main comme avant',
    (await slugClaimedByOther({ DB: unclaimed }, 'amira-cafe', 'acc-1')) === false);

  const noRow = db({ registry: {} });
  ok('un registre sans la ligne ne ferme la porte à personne',
    (await slugClaimedByOther({ DB: noRow }, 'amira-cafe', 'acc-1')) === false);

  const down = db({ throwOnRead: true });
  ok('base muette : la garde s\'ouvre, elle n\'enferme pas dehors',
    (await slugClaimedByOther({ DB: down }, 'amira-cafe', 'acc-1')) === false);
}

/* ── 2 · entitledMerchant et tenantFor : le nom d'enseigne ne suffit plus ─── */
async function sessionRequest(aid) {
  const token = await makeSession(aid, SECRET);
  return new Request('https://kiwi.test/api/x', { headers: { cookie: `${SESS_COOKIE}=${token}` } });
}
{
  const usurper = await sessionRequest('acc-usurper');
  const env = {
    AUTH_SECRET: SECRET,
    DB: db({
      accounts: { 'acc-usurper': 'Café Amira', 'acc-real': 'Café Amira' },
      registry: { 'cafe-amira': 'acc-real' },
    }),
  };
  const slug = slugMerchant('Café Amira');
  ok('deux comptes peuvent dériver le même slug (la faille d\'origine)',
    slug === slugMerchant('cafe amira') && slug === 'cafe-amira', slug);
  ok('entitledMerchant refuse un slug que le registre donne à un autre',
    (await entitledMerchant(usurper, env, slug)) === '');
  ok('tenantFor refuse le même chemin',
    (await tenantFor(usurper, env, slug)) === '');

  const owner = await sessionRequest('acc-real');
  ok('le vrai propriétaire garde sa boutique',
    (await entitledMerchant(owner, env, slug)) === slug);
  ok('tenantFor rend la boutique au propriétaire',
    (await tenantFor(owner, env, slug)) === slug);
}

/* ── 3 · La facture est confrontée à la vente ─────────────────────────────── */
function invoiceEnv(sale) {
  const stored = [];
  return {
    _stored: stored,
    DB: {
      prepare(sql) {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        const stmt = {
          args: [],
          bind(...a) { stmt.args = a; return stmt; },
          async run() {
            if (q.startsWith('INSERT INTO sale_invoices')) stored.push(stmt.args);
            return { success: true };
          },
          async first() {
            if (q.startsWith('SELECT merchant, seq, number')) return null;
            if (q.includes('FROM sales')) return sale;
            if (q.startsWith('SELECT COALESCE(MAX(seq)')) return { max_seq: 0 };
            return null;
          },
        };
        return stmt;
      },
    },
  };
}
{
  const y2026 = Date.UTC(2026, 5, 1);
  const voided = invoiceEnv({ ts: y2026, void_ts: y2026 + 1000, amount: 250, amount_cents: 25000 });
  let status = 0;
  try { await getOrCreateSaleInvoice(voided, 'amira-cafe', 'sale-1', null, { totals: { ttc: 250 } }); }
  catch (e) { status = e.status; }
  ok('une vente annulée ne produit pas de facture', status === 409, 'statut ' + status);

  const mismatched = invoiceEnv({ ts: y2026, void_ts: null, amount: 250, amount_cents: 25000 });
  status = 0;
  try { await getOrCreateSaleInvoice(mismatched, 'amira-cafe', 'sale-2', null, { totals: { ttc: 1 } }); }
  catch (e) { status = e.status; }
  ok('un total qui ne correspond pas à l\'encaissement est refusé', status === 409, 'statut ' + status);

  const backdated = invoiceEnv({ ts: y2026, void_ts: null, amount: 250, amount_cents: 25000 });
  const doc = await getOrCreateSaleInvoice(backdated, 'amira-cafe', 'sale-3', null,
    { totals: { ttc: 250 }, issuedTs: Date.UTC(2024, 0, 1) });
  ok('le millésime vient de la vente, pas de l\'horodatage annoncé',
    doc.number.includes('2026') && !doc.number.includes('2024'), doc.number);
  ok('l\'horodatage émis ne peut pas précéder la vente', doc.snapshot.issuedTs >= y2026);

  const rounded = invoiceEnv({ ts: y2026, void_ts: null, amount: 250, amount_cents: 25049 });
  const okDoc = await getOrCreateSaleInvoice(rounded, 'amira-cafe', 'sale-4', null, { totals: { ttc: 250.49 } });
  ok('le centime d\'arrondi ne bloque pas une facture légitime', !!okDoc.number);
}

/* ── 4 · Le fond de caisse attendu ne descend plus sous la chaîne serveur ── */
{
  const chain = [
    { event_type: 'open', expected_cents: 50000, movement_kind: null, movement_amount_cents: null },
    { event_type: 'movement', expected_cents: null, movement_kind: 'in', movement_amount_cents: 20000 },
    { event_type: 'movement', expected_cents: null, movement_kind: 'out', movement_amount_cents: 5000 },
  ];
  const written = [];
  const env = {
    AUTH_SECRET: SECRET,
    DB: {
      prepare(sql) {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        const stmt = {
          args: [],
          bind(...a) { stmt.args = a; return stmt; },
          async run() { if (q.startsWith('INSERT OR IGNORE INTO cash_session_events')) written.push(stmt.args); return { success: true }; },
          async all() { return { results: chain }; },
          async first() {
            if (q.includes("event_type = 'open'")) return { id: 'evt-open' };
            if (q.startsWith('SELECT id FROM cash_session_events')) return { id: 'evt-open' };
            return null;
          },
        };
        return stmt;
      },
    },
  };
  const { tillToken, terminalToken, TERMINAL_COOKIE } = await import('../functions/auth/_lib.js');
  const token = await tillToken(SECRET, 'amira-cafe');
  const term = await terminalToken(SECRET, 'amira-cafe', 'poste-1');
  const t = Date.now();
  const res = await postCashEvent({
    request: new Request('https://kiwi.test/api/cash-sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `kiwi_till=${token}; ${TERMINAL_COOKIE}=${term}`,
      },
      body: JSON.stringify({
        merchant: 'amira-cafe', terminalId: 'poste-1', sessionId: 'sess-1', id: 'evt-close',
        eventType: 'close', expectedCents: 1000, countedCents: 1000, gapCents: 0,
        actorId: 'staff-3', openedAt: t - 3600000, occurredAt: t,
      }),
    }),
    env,
  });
  ok('la fermeture est acceptée (un comptoir bloqué serait pire)', res.status === 201, 'statut ' + res.status);
  const row = written[0] || [];
  ok('l\'attendu annoncé trop bas est relevé au plancher serveur (50 000 + 20 000 − 5 000)',
    row[5] === 65000, String(row[5]));
  ok('l\'écart est recalculé sur le plancher, pas sur la valeur annoncée',
    row[7] === 1000 - 65000, String(row[7]));
}

/* ── 5 · Le compteur de tickets ne se laisse plus empoisonner ─────────────── */
{
  const sequences = new Map();
  const env = {
    DB: {
      prepare(sql) {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        const stmt = {
          args: [],
          bind(...a) { stmt.args = a; return stmt; },
          async run() {
            if (q.startsWith('INSERT OR IGNORE INTO ticket_sequences')) {
              const key = stmt.args[0] + ':' + stmt.args[1];
              if (!sequences.has(key)) sequences.set(key, { next: stmt.args[2] });
            }
            return { success: true };
          },
          async first() {
            if (q.startsWith('SELECT MAX(CAST(ref AS INTEGER))')) return { n: null };
            if (q.startsWith('SELECT next_value FROM ticket_sequences')) {
              const row = sequences.get(stmt.args[0] + ':' + stmt.args[1]);
              return row ? { next_value: row.next } : null;
            }
            if (q.startsWith('UPDATE ticket_sequences SET')) {
              const [floorA, , size, , merchant, period, , , guardSize, last] = stmt.args;
              const row = sequences.get(merchant + ':' + period);
              const start = Math.max(row.next, floorA);
              if (start + guardSize - 1 > last) return null;
              row.next = start + size;
              return { start: row.next - size, end: row.next - 1 };
            }
            return null;
          },
        };
        return stmt;
      },
    },
  };
  let poisoned = false;
  try { await reserveTicketRange(env, 'amira-cafe', 100, 99999, 2026); }
  catch (_) { poisoned = true; }
  ok('un plancher impossible est refusé', poisoned);
  ok('et le compteur n\'a rien gardé de la demande refusée', !sequences.has('amira-cafe:2026'));
  const after = await reserveTicketRange(env, 'amira-cafe', 10, 1000, 2026);
  ok('la caisse peut donc encore numéroter après la tentative',
    after.start === 1000 && after.end === 1009, JSON.stringify(after));
}


/* ── 6 · Formule : le créneau se compte en QUANTITÉS ──────────────────────── */
{
  const menu = {
    stations: [{ id: 'cuisine' }], kitchenId: 'cuisine',
    cats: [{ id: 'c1', name: 'Carte', station: 'cuisine' }],
    items: [
      { id: 'menu1', name: 'Menu du midi', price: 60, catId: 'c1', avail: true,
        formula: { slots: [{ id: 's1', label: 'La boisson', min: 1, max: 1,
          choices: [{ itemId: 'coca', extra: 0 }] }] } },
      { id: 'coca', name: 'Coca', price: 20, catId: 'c1', avail: true },
    ],
  };
  const env = { DB: { prepare() { return {
    bind() { return this; },
    async first() { return { data: JSON.stringify(menu), updated_ts: 1 }; },
  }; } } };
  const order = (childQty, parentQty = 1) => priceOrder(env, 'amira-cafe', [
    { id: 'menu1', kind: 'formula', formulaUid: 'f1', qty: parentQty },
    { id: 'coca', kind: 'formula-part', formulaUid: 'f1', formulaSlotId: 's1', qty: childQty },
  ]);

  const honest = await order(1);
  ok('un menu et sa boisson passent, à 60 MAD', honest.total === 60, String(honest.total));

  const greedy = await order(99);
  const freeDrinks = greedy.lines.filter((l) => l.kind === 'formula-part' && l.unitPrice === 0)
    .reduce((n, l) => n + l.qty, 0);
  ok('99 boissons « incluses » sur un seul menu ne passent plus',
    greedy.invalidOptions.length > 0 && freeDrinks === 0, `total ${greedy.total}, offertes ${freeDrinks}`);
  ok('et le refus est EXPLICITE — order/index.js en fait un 409 menu-changed',
    greedy.invalidOptions.includes('Menu du midi'), JSON.stringify(greedy.invalidOptions));

  const twoMenus = await order(2, 2);
  ok('deux menus donnent bien droit à deux boissons',
    twoMenus.total === 120 && !twoMenus.formulaOnly.length, String(twoMenus.total));
}

/* ── 7 · verifyStaffPin ne retombe plus sur le compte de l'appelant ───────── */
{
  const asked = [];
  const env = {
    AUTH_SECRET: SECRET,
    DB: {
      prepare(sql) {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        return {
          args: [],
          bind(...a) { this.args = a; return this; },
          async first() {
            asked.push(q);
            if (q.startsWith('SELECT id, name, role FROM staff_pins')) return null;
            if (q.startsWith('SELECT account_id FROM merchant_config')) return { account_id: null };
            return null;
          },
          async all() { asked.push(q); return { results: [] }; },
        };
      },
    },
  };
  const { tillToken } = await import('../functions/auth/_lib.js');
  const token = await tillToken(SECRET, 'amira-cafe');
  const sess = await makeSession('acc-attaquant', SECRET);
  const request = new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST',
    headers: { cookie: `kiwi_till=${token}; ${SESS_COOKIE}=${sess}` },
  });
  const res = await verifyStaffPin(request, env, 'amira-cafe', '0000', { requireTill: true });
  ok('un code inconnu de la boutique est refusé', res.ok === false, JSON.stringify(res.error || ''));
  ok('la recherche élargie n\'interroge JAMAIS le compte de l\'appelant',
    !asked.some((q) => q.includes('JOIN merchant_config c ON c.merchant = p.merchant')),
    asked.filter((q) => q.includes('JOIN')).join(' | '));
  ok('et un succès ne remet plus le compteur partagé à zéro',
    !/limitClear\(request, env, `pin:\$\{merchant\}`/.test(
      fs.readFileSync(new URL('../functions/auth/_lib.js', import.meta.url), 'utf8')));
}

/* ── 8 · Les compteurs anti-force-brute sont rattachés à la CIBLE ─────────── */
{
  const a = await targetKey(SECRET, 'login', 'Victime@Example.com');
  const b = await targetKey(SECRET, 'login', 'victime@example.com');
  const c = await targetKey(SECRET, 'login', 'autre@example.com');
  ok('la clé de cible est insensible à la casse', a === b && !!a);
  ok('deux adresses différentes ont deux clés différentes', a !== c);
  ok('la clé ne contient pas l\'adresse elle-même', !a.includes('victime') && !a.includes('@'), a);

  const login = fs.readFileSync(new URL('../functions/auth/login.js', import.meta.url), 'utf8');
  const employee = fs.readFileSync(new URL('../functions/api/employee.js', import.meta.url), 'utf8');
  ok('login compte par cible et n\'efface que la cible',
    login.includes("limitCheck(request, env, 'login', target)")
    && login.includes("limitClear(request, env, 'login', target)")
    && !/limitClear\(request, env, 'login'\)/.test(login));
  ok('la connexion employé compte par cible et n\'efface que la cible',
    employee.includes("limitCheck(request, env, 'employee', target)")
    && employee.includes("limitClear(request, env, 'employee', target)")
    && !/limitClear\(request, env, 'employee'\)/.test(employee));
}

/* ── 9 · `closeSession` est le signal de la caisse, pas d'un employé ──────── */
{
  const queue = fs.readFileSync(new URL('../functions/api/order/queue.js', import.meta.url), 'utf8');
  const block = queue.slice(queue.indexOf('if (employee) {'), queue.indexOf("error: 'floor-table-required'"));
  ok('le bloc employé refuse closeSession avant tout autre contrôle',
    /if \(b && b\.closeSession\) \{[^]{0,120}403\)/.test(block), 'garde absente du bloc employé');
  ok('et le règlement reste bien ce que closeSession déclenche',
    /if \(closeSession\) \{[^]{0,300}UPDATE orders SET paid_ts/.test(queue));
  const serveur = fs.readFileSync(new URL('../kiwi-serveur.html', import.meta.url), 'utf8');
  ok('aucune surface employé n\'envoie closeSession (sinon la garde casserait le métier)',
    !/body: JSON\.stringify\(\{[^}]*closeSession/.test(serveur));
}

/* ── 10 · La caisse échappe avec une fonction qui existe ──────────────────── */
{
  const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
  const calls = caisse.match(/(?<![A-Za-z0-9_$])esc\(/g) || [];
  ok('plus aucun appel à une fonction d\'échappement inexistante', calls.length === 0,
    `${calls.length} appel(s) restant(s)`);
  ok('la bannière de verrou ne peut plus empêcher l\'écriture des montants',
    /let lockBanner = '';[^]{0,900}catch \(_\) \{ lockBanner = ''; \}/.test(caisse));
  ok('et les montants s\'écrivent bien après elle',
    caisse.indexOf("$('#rp-total')") > caisse.indexOf('let lockBanner'));
}

/* ── 11 · Le jeton de caisse est révocable ────────────────────────────────── */
{
  const { tillToken, isTillFor, forgetTillEpoch, TILL_COOKIE } = await import('../functions/auth/_lib.js');
  const { onRequestPost: revoke } = await import('../functions/api/pair/revoke.js');

  const store = { 'amira-cafe': 0 };
  const env = {
    AUTH_SECRET: SECRET,
    DB: {
      prepare(sql) {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        return {
          args: [],
          bind(...a) { this.args = a; return this; },
          async run() {
            if (q.startsWith('ALTER TABLE')) throw new Error('duplicate column');
            return { success: true };
          },
          async first() {
            if (q.startsWith('SELECT till_epoch FROM merchant_config')) {
              const v = store[this.args[0]];
              return v === undefined ? null : { till_epoch: v };
            }
            if (q.startsWith('UPDATE merchant_config SET till_epoch')) {
              const m = this.args[1];
              if (store[m] === undefined) return null;
              store[m] += 1;
              return { till_epoch: store[m] };
            }
            if (q.startsWith('SELECT business FROM accounts')) return { business: 'Café Amira' };
            if (q.startsWith('SELECT account_id FROM merchant_config')) return { account_id: 'acc-1' };
            return null;
          },
        };
      },
    },
  };
  const withCookie = (v) => new Request('https://kiwi.test/x', { headers: { cookie: `${TILL_COOKIE}=${v}` } });

  const paired = await tillToken(SECRET, 'amira-cafe', 0);
  ok('une caisse appairée est reconnue', await isTillFor(withCookie(paired), env, 'amira-cafe'));

  /* La VRAIE forme d'avant le millésime — HMAC(secret, 'kiwi-till-v1:' + slug) —
     doit continuer de passer tant que personne n'a dépairé, sinon toutes les
     caisses en service tombent au déploiement. */
  const legacyToken = async (merchant) => {
    const key = await globalThis.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await globalThis.crypto.subtle.sign(
      'HMAC', key, new TextEncoder().encode('kiwi-till-v1:' + merchant));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  const legacy = await legacyToken('amira-cafe');
  ok('une caisse déjà appairée AVANT le correctif continue de fonctionner',
    await isTillFor(withCookie(legacy), env, 'amira-cafe'));

  // Le propriétaire dépaire.
  const ownerSess = await makeSession('acc-1', SECRET);
  const res = await revoke({
    request: new Request('https://kiwi.test/api/pair/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${SESS_COOKIE}=${ownerSess}` },
      body: JSON.stringify({ merchant: 'amira-cafe' }),
    }),
    env,
  });
  const body = await res.json();
  ok('le propriétaire peut dépairer', res.status === 200 && body.epoch === 1, JSON.stringify(body));

  forgetTillEpoch('amira-cafe');
  ok('l\'ancienne caisse est coupée', !(await isTillFor(withCookie(paired), env, 'amira-cafe')));
  ok('y compris celle d\'avant le correctif — sinon la révocation serait un décor',
    !(await isTillFor(withCookie(legacy), env, 'amira-cafe')));
  const rePaired = await tillToken(SECRET, 'amira-cafe', 1);
  ok('et une caisse qui réappaire fonctionne', await isTillFor(withCookie(rePaired), env, 'amira-cafe'));

  // Une caisse ne dépaire pas le magasin : elle n'a pas de session de compte.
  const tillOnly = await revoke({
    request: new Request('https://kiwi.test/api/pair/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${TILL_COOKIE}=${rePaired}` },
      body: JSON.stringify({ merchant: 'amira-cafe' }),
    }),
    env,
  });
  ok('une caisse seule ne peut pas éjecter tout le magasin', tillOnly.status === 403);
}

console.log(failures
  ? `\n✗ ${failures} échec(s) sur ${checks} contrôles`
  : `\n✓ ${checks} contrôles de locataire et d'intégrité.`);
process.exit(failures ? 1 : 0);
