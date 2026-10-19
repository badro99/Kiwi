#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * L'ARGENT, ÉPROUVÉ SUR DES MILLIERS DE CAS (fast-check)
 *
 * Les tests écrits à la main essaient trois prix ronds. Le 2026-10-19, une
 * vraie vente sur le stack local a trouvé ce qu'ils ne voyaient pas : une robe
 * à 249,90 encaissée 250, et un en-tête de caisse qui comptait deux fois une
 * vente réglée en avoir. Ici fast-check tire des prix, remises, quantités et
 * paiements au hasard, et réduit chaque échec au plus petit contre-exemple.
 *
 * Exécute le vrai code : les fonctions de prix et de recette de
 * assets/pos-boutique.js, et le registre /api/store-credits sur SQLite.
 *
 * DEUX SORTES DE PROPRIÉTÉS
 *   · strictes : un échec met le contrôle au rouge ;
 *   · connues (KNOWN) : un défaut déjà relevé, en attente d'une décision ou
 *     d'un correctif. Son contre-exemple s'affiche sans bloquer la porte ; le
 *     jour où elle tient, la sortie le dit (« ! … tient maintenant ») : passez-
 *     la alors en stricte, sinon la garantie se perd.
 *
 * fast-check est une dépendance de développement de app/, à côté des outils
 * de test du navigateur. Sans elle, la suite se déclare SKIPPÉE, en vert explicite :
 *   npm --prefix app ci
 *
 *   node tools/money-properties-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fc;
try { fc = createRequire(path.join(ROOT, 'app', 'package.json'))('fast-check'); }
catch (_) {
  console.log('  ○ skip  fast-check unavailable (npm --prefix app ci), money properties not executed');
  process.exit(0);
}
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 300;
const SEED = process.env.KIWI_PROPERTY_SEED ? Number(process.env.KIWI_PROPERTY_SEED) : undefined;
const opts = (extra = {}) => ({ numRuns: RUNS, ...(SEED !== undefined ? { seed: SEED } : {}), ...extra });

let passed = 0, failed = 0, known = 0;
const firstLine = (e) => String((e && e.message) || e).split('\n').filter(Boolean).slice(0, 3).join(' | ');
async function strict(label, property, extra) {
  try { await fc.assert(property, opts(extra)); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${firstLine(e)}`); }
}
async function knownIssue(id, label, property, extra) {
  const out = await fc.check(property, opts(extra));
  if (out.failed) {
    known++;
    console.log(`  ◦ known ${id} · ${label}\n      contre-exemple : ${fc.stringify(out.counterexample)}`);
  } else {
    console.log(`  ! known ${id} tient maintenant · ${label} : passez-la en stricte dans tools/money-properties-test.mjs`);
  }
}

/* ── le vrai code de la caisse boutique ─────────────────────────────────── */
const SRC = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8');
function grabFn(start) {
  const i = SRC.indexOf(start);
  if (i < 0) throw new Error(start + ' not found in assets/pos-boutique.js');
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
function grabStatement(re) {
  const m = SRC.match(re);
  if (!m) throw new Error(re + ' not found in assets/pos-boutique.js');
  return m[0];
}
function tillContext(globals) {
  const ctx = vm.createContext({ Math, Number, Array, Date, String, Object, JSON, ...globals });
  vm.runInContext([
    grabStatement(/const shelf = [^\n]+\n/),
    grabFn('function lineDeal('),
    grabStatement(/const linePromo = [^\n]+\n/),
    grabStatement(/const lineBase {0,2}= [^\n]+\n/),
    grabStatement(/const lineUnit {0,2}= [^\n]+\n/),
    grabStatement(/const lineTotal = [^\n]+\n/),
    grabFn('function originalSalePayload('),
    /* le correctif « argent qui rentre » peut avoir ajouté une aide à caToday */
    (SRC.match(/const notCashedOf = [\s\S]*?;\n/) || [''])[0],
    grabStatement(/const caToday = [^\n]+\n/),
    'this.api = { lineBase, lineUnit, lineTotal, originalSalePayload, caToday };',
  ].join('\n'), ctx);
  return ctx.api;
}

/* Prix en centimes pour que les décimales arrivent (249,90 compris). */
const shelfCents = fc.integer({ min: 100, max: 500000 });
const remise = fc.constantFrom(0, 5, 10, 15, 20);
const qty = fc.integer({ min: 1, max: 6 });
const promoCents = fc.option(fc.integer({ min: 50, max: 500000 }), { nil: null });

function lineFor(shelf, promo, r, q) {
  const P = { p1: { price: shelf / 100, name: 'Article' } };
  const live = promo == null ? null : { price: promo / 100, badge: 'Promo', promo: { name: 'Promo', id: 'pr1' } };
  const api = tillContext({ P, promoFor: () => live, merchantSlug: () => 'm', rayonOf: () => '', SALES: [], salesToday: () => [] });
  return { api, ln: { pid: 'p1', qty: q, remise: r, promo: null } };
}

console.log('■ Prix d’une ligne de caisse boutique');
await strict('une promotion ne fait jamais payer plus que le prix en rayon',
  fc.property(shelfCents, promoCents, remise, qty, (s, p, r, q) => {
    const { api, ln } = lineFor(s, p, r, q);
    return api.lineBase(ln) <= s / 100 + 1e-9;
  }));
await strict('une remise plus forte ne fait jamais payer plus',
  fc.property(shelfCents, promoCents, qty, (s, p, q) => {
    const totals = [0, 5, 10, 15, 20].map((r) => { const { api, ln } = lineFor(s, p, r, q); return api.lineTotal(ln); });
    return totals.every((t, i) => i === 0 || t <= totals[i - 1]);
  }));
/* Décision propriétaire (2026-10-19) : arrondir vers le bas, jamais encaisser
   au-dessus du prix en rayon. Avant, 249,90 s'encaissait 250, et 1,00 à −20 % 1. */
await strict('l’arrondi au dirham descend toujours, de moins d’un dirham',
  fc.property(shelfCents, promoCents, remise, qty, (s, p, r, q) => {
    const { api, ln } = lineFor(s, p, r, q);
    const exact = api.lineBase(ln) * (100 - r) / 100;
    return api.lineUnit(ln) <= exact + 1e-9 && exact - api.lineUnit(ln) < 1;
  }));
await strict('une ligne n’est jamais encaissée plus cher que son prix affiché, promotion et remise comprises',
  fc.property(shelfCents, promoCents, remise, qty, (s, p, r, q) => {
    const { api, ln } = lineFor(s, p, r, q);
    const shown = Math.min(s, p == null ? Infinity : p) / 100;
    return api.lineTotal(ln) <= shown * (100 - r) / 100 * q + 1e-9;
  }));

/* ── le vrai moteur de promotions (assets/promos.js) ────────────────────── */
console.log('■ Moteur de promotions');
{
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const window = { localStorage };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/promos.js'), 'utf8'),
    { window, localStorage, console, Set, Map, Math, Date, JSON, Number, Object, Array, String, Intl }, { filename: 'promos.js' });
  const PR = window.KiwiPromos;
  const promo = fc.oneof(
    fc.record({ kind: fc.constant('percent'), value: fc.integer({ min: 1, max: 90 }) }),
    fc.record({ kind: fc.constant('amount'), value: fc.integer({ min: 1, max: 2000 }) }),
    fc.record({ kind: fc.constant('fixed'), value: fc.integer({ min: 0, max: 5000 }) }),
  );
  await strict('une promotion ne fait jamais payer plus que sa règle, ni plus que le prix affiché, ni moins que zéro',
    fc.property(shelfCents, promo, (cents, p) => {
      const shown = cents / 100;
      const out = PR.applyTo(p, shown);
      const rule = p.kind === 'percent' ? shown * (100 - p.value) / 100 : p.kind === 'amount' ? shown - p.value : p.value;
      return out >= 0 && out <= shown + 1e-9 && out <= Math.max(0, rule) + 1e-9 && Number.isInteger(out);
    }));
}

/* ── la recette du jour de la caisse = l'argent que le serveur enregistre ── */
console.log('■ Recette du jour, caisse contre serveur');
const tender = fc.constantFrom('espèces', 'carte', 'avoir', 'livraison');
const saleArb = fc.record({
  total: fc.integer({ min: 1, max: 5000 }),
  split: fc.array(fc.tuple(tender, fc.integer({ min: 1, max: 100 })), { minLength: 1, maxLength: 3 }),
}).map(({ total, split }) => {
  /* répartit le total, en dirhams entiers, au prorata des poids tirés */
  const weight = split.reduce((s, [, w]) => s + w, 0);
  let left = total;
  const parts = split.map(([m, w], i) => {
    const amount = i === split.length - 1 ? left : Math.min(left, Math.floor(total * w / weight));
    left -= amount;
    return { m, amount };
  }).filter((part) => part.amount > 0);
  return { id: '1000', total, parts, at: new Date(), lines: [{ pid: 'p1', qty: 1, unit: total, name: 'Article' }] };
});
/* Stricte depuis 51f92fe1 : caToday() retire la part réglée en avoir ; depuis
   le 2026-10-19 aussi la part partie en livraison (créance, 0 côté serveur). */
await strict('l’en-tête « N ventes · X MAD aujourd’hui » égale l’argent encaissé que le serveur enregistre',
  fc.property(fc.array(saleArb, { minLength: 1, maxLength: 6 }), (sales) => {
    const api = tillContext({
      P: { p1: { price: 1, name: 'Article' } }, promoFor: () => null, merchantSlug: () => 'm', rayonOf: () => '',
      SALES: sales, salesToday: () => sales,
    });
    const server = sales.reduce((s, sale) => s + api.originalSalePayload(sale).amount, 0);
    return Math.abs(api.caToday() - server) < 0.005;
  }));

/* ── le registre des avoirs, sur une vraie base ─────────────────────────── */
const { DatabaseSync } = await import('node:sqlite');
const { onRequestPost } = await import(path.join(ROOT, 'functions/api/store-credits.js'));
const { makeSession, SESS_COOKIE } = await import(path.join(ROOT, 'functions/auth/_lib.js'));
const MERCHANT = 'money-properties';
const SECRET = 'money-properties-secret';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
      first() { return sqlite.prepare(sql).get(...args) || null; },
      all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return statement;
  },
  batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const out = statements.map((s) => s.run()); sqlite.exec('COMMIT'); return out; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: SECRET };
sqlite.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status)
  VALUES ('acc-money', 'money@example.test', 'Money Properties', 'salt', 'hash', ?, 'active')`).run(Date.now());
sqlite.prepare(`INSERT INTO merchant_config (merchant, features, name, type, status, till_epoch, updated_ts, account_id)
  VALUES (?, '{}', 'Money Properties', 'boutique', 'active', 0, ?, 'acc-money')`).run(MERCHANT, Date.now());
const owner = `${SESS_COOKIE}=${await makeSession('acc-money', SECRET)}`;
async function post(body) {
  const response = await onRequestPost({ request: new Request('https://kiwi.test/api/store-credits', {
    method: 'POST', headers: { cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: MERCHANT, ...body }),
  }), env });
  return { status: response.status, body: await response.json() };
}
let seq = 0;
function newSale(cents) {
  const id = `sale-prop-${++seq}`;
  sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, void_ts, lines)
    VALUES (?, ?, ?, ?, 'cash', 'Article', ?, ?, NULL, '[]')`).run(id, MERCHANT, cents / 100, cents, String(seq), Date.now());
  return id;
}

console.log('■ Registre des avoirs');
await strict('les avoirs émis sur une vente ne dépassent jamais ce qu’elle a encaissé',
  fc.asyncProperty(fc.integer({ min: 100, max: 200000 }), fc.array(fc.integer({ min: 1, max: 300000 }), { minLength: 1, maxLength: 6 }),
    async (saleCents, asks) => {
      const sale = newSale(saleCents);
      let issued = 0;
      for (const [i, cents] of asks.entries()) {
        const reply = await post({ action: 'issue', id: `issue:${sale}:${i}`, originalSaleId: sale, amountCents: cents, reason: 'Retour' });
        const fits = cents <= saleCents - issued;
        if (reply.status === 200) { if (!fits) return false; issued += cents; }
        else if (reply.status !== 409 || fits) return false;
      }
      return issued <= saleCents;
    }), { numRuns: Math.min(RUNS, 120) });
await strict('un avoir ne passe jamais sous zéro, et émis = solde + consommé',
  fc.asyncProperty(fc.integer({ min: 100, max: 100000 }), fc.array(fc.integer({ min: 1, max: 120000 }), { minLength: 1, maxLength: 8 }),
    async (cents, spends) => {
      const sale = newSale(cents);
      const issue = await post({ action: 'issue', id: `issue:${sale}:only`, originalSaleId: sale, amountCents: cents, reason: 'Retour' });
      if (issue.status !== 200) return false;
      const code = issue.body.credit.code;
      let spent = 0;
      for (const [i, amount] of spends.entries()) {
        const reply = await post({ action: 'redeem-batch', id: `redeem:${sale}:${i}`, saleId: `next-${i}`, credits: [{ code, amountCents: amount }] });
        const fits = amount <= cents - spent;
        if (reply.status === 200) { if (!fits) return false; spent += amount; }
        else if (fits) return false;
      }
      const row = sqlite.prepare('SELECT balance_cents FROM store_credits WHERE merchant=? AND code=?').get(MERCHANT, code);
      return row.balance_cents >= 0 && row.balance_cents + spent === cents;
    }), { numRuns: Math.min(RUNS, 120) });
sqlite.close();

console.log(`\nmoney-properties: ${passed} passed, ${failed} failed, ${known} known issue${known > 1 ? 's' : ''} (${RUNS} runs each)`);
process.exit(failed ? 1 : 0);
