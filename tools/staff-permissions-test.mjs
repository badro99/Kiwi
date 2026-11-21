#!/usr/bin/env node
/* Droits de l'équipe · le catalogue, la route /api/permissions et chaque route
 * qui les applique, sur le schéma complet (schema.sql) dans un SQLite en mémoire.
 *
 * Ce que ce banc tient :
 *   · les rôles par défaut reproduisent la règle d'avant (parité) ;
 *   · tant que le patron n'a rien enregistré, aucune route ne change d'avis ;
 *   · ensuite, un droit accordé ouvre et un droit retiré ferme : approbation
 *     de remboursement et de stock au comptoir, annulation, réouverture,
 *     palier du tableau de bord ;
 *   · seul le patron (ou un opérateur) écrit, chaque écriture laisse sa ligne
 *     au journal, une boutique ne lit ni n'écrit celle d'un autre compte ;
 *   · aucune réponse ne contient un code ;
 *   · les anciens réglages du navigateur sont repris une seule fois ;
 *   · une remise ou des espèces sans le droit sont inscrites, jamais refusées.
 *
 * Les codes à quatre chiffres ci-dessous sont des valeurs de banc, inventées
 * pour ce fichier ; ils ne correspondent à aucun commerçant.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const Catalog = createRequire(import.meta.url)(path.join(ROOT, 'assets/permissions-catalog.js'));
const route = await imp('functions/api/permissions.js');
const verify = await imp('functions/api/pin/verify.js');
const cancel = await imp('functions/api/sale/cancel.js');
const refund = await imp('functions/api/sale/refund.js');
const movements = await imp('functions/api/inventory/movements.js');
const cash = await imp('functions/api/cash-sessions.js');
const tiers = await imp('functions/auth/_session-tier.js');
const perms = await imp('functions/api/_permissions.js');
const catalogRoute = await imp('functions/api/catalog.js');
const { makeSession, SESS_COOKIE, TILL_COOKIE, tillToken, managerRefundProof, managerStockProof } = await imp('functions/auth/_lib.js');

const SECRET = 'staff-permissions-bench-secret-01';
const SHOP = 'cafe-droits-banc';
const OTHER = 'boutique-voisine-droits';
const SISTER = 'cafe-droits-soeur';   // seconde boutique du MÊME compte
const CODES = { owner: '6201', manager: '6202', caisse: '6203', voisin: '6204' };
const SID_MGR = 'a'.repeat(32), SID_OWNER = 'b'.repeat(32);
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* ── 1 · Le catalogue ───────────────────────────────────────────────────── */
console.log('■ Catalogue et rôles par défaut');
{
  check(Catalog.GROUPS.length === 10 && Catalog.ALL.length === 28 && new Set(Catalog.ALL).size === 28, '10 groupes, 28 droits, sans doublon');
  check(Catalog.GROUPS.every((g) => g.fr && g.en && g.ar && g.perms.every((p) => p.fr && p.en && p.ar && p.can.fr && p.can.en && p.can.ar)), 'chaque groupe et chaque droit existe en FR, EN et AR');
  const text = JSON.stringify(Catalog.GROUPS);
  check(!text.includes('—'), 'aucun tiret cadratin dans les libellés');
  check(Catalog.effective('owner', [], Catalog.ALL).length === 28, 'le propriétaire a tout, même avec des retraits');
  const mgr = Catalog.effective('manager');
  check(mgr.includes('sales.refund') && mgr.includes('sales.cancel') && mgr.includes('stock.adjust') && mgr.includes('reports.revenue')
    && !mgr.includes('reports.margins') && !mgr.includes('team.payroll') && !mgr.includes('settings.edit'),
  'manager : remboursement, annulation, stock, chiffre d’affaires ; ni marges ni paie ni réglages (parité avec le palier)');
  const cashier = Catalog.effective('cashier');
  check(!cashier.includes('sales.refund') && !cashier.includes('sales.cancel') && !cashier.includes('stock.adjust') && !cashier.includes('sales.drawer') && !cashier.includes('sales.discount'),
    'caisse : ni remboursement, ni annulation, ni stock, ni tiroir, ni remise au-delà du seuil');
  check(Catalog.presetForRole('Caissière') === 'cashier' && Catalog.presetForRole('Gérant') === 'manager'
    && Catalog.presetForRole('Propriétaire') === 'owner' && Catalog.presetForRole('Magasinier') === 'stock'
    && Catalog.presetForRole('Serveur') === 'server' && Catalog.presetForRole('Vendeuse conseil') === 'cashier'
    && Catalog.presetForRole('chef-manager') === 'manager', 'un intitulé libre tombe sur le bon rôle par défaut');
  const eff = Catalog.effective('cashier', ['sales.refund', 'nope'], ['money.cash']);
  check(eff.includes('sales.refund') && !eff.includes('money.cash') && !eff.includes('nope'), 'rôle + ajouts − retraits ; un droit inconnu est ignoré');
  const over = Catalog.overridesFor('cashier', [...Catalog.effective('cashier').filter((id) => id !== 'money.cash'), 'sales.refund']);
  check(JSON.stringify(over) === JSON.stringify({ grants: ['sales.refund'], denies: ['money.cash'] }), 'les surcharges se réduisent au strict écart avec le rôle');
  for (const l of ['fr', 'en', 'ar']) {
    const s = Catalog.summary(eff, 'Lina', l);
    check(s.includes('Lina') && s.length > 40 && !s.includes('—'), `résumé en clair (${l}) : « ${s.slice(0, 70)}… »`);
  }
  const legacy = Catalog.fromLegacy({ grants: [{ subject: 'caisse', action: 'action', resource: 'refund' }, 'write:catalog'], denies: [{ action: 'write', resource: 'customers' }] },
    [{ key: 'm-lina', role: 'Caissière' }, { key: 'm-omar', role: 'Serveur' }]);
  check(legacy['m-lina'].grants.includes('sales.refund') && !legacy['m-omar'].grants.includes('sales.refund')
    && legacy['m-omar'].grants.includes('catalog.edit') && legacy['m-omar'].denies.includes('customers.edit'),
  'anciens réglages du navigateur : règle par rôle, règle pour tous, retrait');
}

/* ── Le banc ────────────────────────────────────────────────────────────── */
function world({ migrated = true } = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  if (!migrated) for (const t of ['staff_permissions', 'staff_permission_presets', 'staff_permission_settings', 'staff_permission_audit']) sql.exec(`DROP TABLE ${t}`);
  const now = Date.now();
  sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run('acc-droits', 'o@banc.invalid', 'Café Droits Banc', 's', 'h', now);
  sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run('acc-voisin', 'v@banc.invalid', 'Voisine', 's', 'h', now);
  const cfg = sql.prepare('INSERT INTO merchant_config (merchant, features, plan, type, account_id, name, updated_ts) VALUES (?,?,?,?,?,?,?)');
  cfg.run(SHOP, '{}', 'pro', 'restaurant', 'acc-droits', 'Café Droits', now);
  cfg.run(OTHER, '{}', 'pro', 'boutique', 'acc-voisin', 'Voisine', now);
  cfg.run(SISTER, '{}', 'pro', 'restaurant', 'acc-droits', 'Café Droits Sœur', now);
  const pin = sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)');
  pin.run('pin-nadia', SHOP, CODES.owner, 'Nadia Patron', 'Propriétaire', now);
  pin.run('pin-sara', SHOP, CODES.manager, 'Sara Alaoui', 'Manager', now + 1);
  pin.run('pin-lina', SHOP, CODES.caisse, 'Lina Saidi', 'Caissière', now + 2);
  pin.run('pin-leila', OTHER, CODES.voisin, 'Leila', 'Manager', now);
  /* Le document team porte des secrets : le banc en met, la route ne doit jamais les rendre. */
  const team = { members: [
    { id: 'm-sara', firstName: 'Sara', lastName: 'Alaoui', function: 'Manager', pinCode: '9911', password: 'secret-banc' },
    { id: 'm-lina', firstName: 'Lina', lastName: 'Saidi', function: 'Caissière', pinCode: '9912' },
    { id: 'm-omar', firstName: 'Omar', lastName: 'Berrada', function: 'Serveur', pinCode: '9913' },
    { id: 'm-gone', firstName: 'Ancien', lastName: 'Membre', function: 'Caissier' },
  ], removed: [{ id: 'm-gone', ts: now }] };
  sql.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,?,?)').run(SHOP, 'team', JSON.stringify(team), 1, now);
  const sale = sql.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines) VALUES (?,?,?,?,?,?,?,?,?)');
  sale.run('sale-1', SHOP, 250, 25000, 'cash', 'Table 4', '1001', now - 60000, '[{"n":"Tajine","q":1,"t":250}]');
  sale.run('sale-2', SHOP, 90, 9000, 'card', 'Comptoir', '1002', now - 90000, '[{"n":"Thé","q":3,"t":90}]');
  sql.prepare('INSERT INTO session_tiers (sid, account_id, tier, staff_id, updated_ts) VALUES (?,?,?,?,?)').run(SID_MGR, 'acc-droits', 'manager', 'pin-sara', now);
  const DB = {
    prepare(query) {
      const statement = sql.prepare(query);
      const bound = (args = []) => ({
        first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args) }),
        run: async () => { const r = statement.run(...args); return { success: true, meta: { changes: r.changes } }; },
        runSync: () => { const r = statement.run(...args); return { success: true, meta: { changes: r.changes } }; },
      });
      return { ...bound(), bind: (...args) => bound(args) };
    },
    batch: async (statements) => {
      sql.exec('BEGIN IMMEDIATE');
      try { const out = statements.map((s) => s.runSync()); sql.exec('COMMIT'); return out; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return { sql, env: { DB, AUTH_SECRET: SECRET } };
}
const ip = { 'CF-Connecting-IP': '10.0.0.9' };
const cookieTill = `${TILL_COOKIE}=${await tillToken(SECRET, SHOP)}`;
const cookieOwner = `${SESS_COOKIE}=${await makeSession('acc-droits', SECRET, 0, SID_OWNER)}`;
const cookieManager = `${SESS_COOKIE}=${await makeSession('acc-droits', SECRET, 0, SID_MGR)}`;
const cookieOtherOwner = `${SESS_COOKIE}=${await makeSession('acc-voisin', SECRET)}`;
const req = (url, { method = 'GET', body, cookie } = {}) => new Request('https://kiwi.test' + url, {
  method, headers: { 'Content-Type': 'application/json', ...ip, ...(cookie ? { Cookie: cookie } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const get = async (w, cookie, merchant = SHOP) => route.onRequestGet({ env: w.env, request: req('/api/permissions?merchant=' + merchant, { cookie }) });
const post = async (w, cookie, body) => route.onRequestPost({ env: w.env, request: req('/api/permissions', { method: 'POST', cookie, body: { merchant: SHOP, ...body } }) });
const pinVerify = (w, pin, action) => verify.onRequestPost({ env: w.env, request: req('/api/pin/verify', { method: 'POST', cookie: cookieTill, body: { merchant: SHOP, pin, ...(action ? { action } : {}) } }) });
const audit = (w) => w.sql.prepare('SELECT * FROM staff_permission_audit WHERE merchant = ? ORDER BY id').all(SHOP);

/* ── 2 · La route ───────────────────────────────────────────────────────── */
console.log('■ /api/permissions');
{
  const w = world();
  const res = await get(w, cookieOwner);
  const body = await res.json();
  const raw = JSON.stringify(body);
  check(res.status === 200 && body.readOnly === false && body.configured === false, 'le patron lit l’écran complet ; rien n’est encore configuré');
  const keys = body.staff.map((s) => s.key);
  check(keys.includes('m-sara') && keys.includes('m-lina') && keys.includes('m-omar') && keys.includes('name:nadia patron') && !keys.includes('m-gone'),
    'l’équipe = membres d’Équipe (clé stable) + codes sans membre ; un membre retiré n’y est pas');
  check(!/9911|9912|9913|secret-banc|6201|6202|6203|pinCode|password|"pin"/.test(raw), 'aucun code, aucun mot de passe dans la réponse');
  const lina = body.staff.find((s) => s.key === 'm-lina');
  check(lina.preset === 'cashier' && !lina.perms.includes('sales.refund'), 'Lina (Caissière) part du rôle Caisse');

  const till = await (await get(w, cookieTill)).json();
  check(till.readOnly === true && !('audit' in till) && !('customPresets' in till) && till.staff[0] && !('grants' in till.staff[0]),
    'la caisse appairée lit l’équipe réduite (droits effectifs), sans surcharges ni journal');
  check((await get(w, cookieOtherOwner)).status === 403, 'le patron d’un autre compte ne lit pas cette boutique');
  check((await get(w, '')).status === 403, 'sans session ni caisse : refusé');

  const denied = await post(w, cookieManager, { action: 'save-staff', key: 'm-sara', preset: 'manager', perms: Catalog.ALL });
  check(denied.status === 403 && (await denied.json()).error === 'owner-required', 'un gérant (son code) ne change aucun droit, pas même les siens');
  check((await post(w, cookieOtherOwner, { action: 'save-staff', key: 'm-lina', preset: 'cashier', perms: [] })).status === 403,
    'le patron d’un autre compte n’écrit pas ici');
  check((await post(w, cookieTill, { action: 'save-staff', key: 'm-lina', preset: 'cashier', perms: [] })).status === 403, 'une caisse appairée n’écrit pas');
  check((await post(w, cookieOwner, { action: 'save-staff', key: 'name:nadia patron', preset: 'cashier', perms: [] })).status === 409, 'le propriétaire est verrouillé');
  check((await post(w, cookieOwner, { action: 'save-staff', key: 'm-inconnu', preset: 'cashier', perms: [] })).status === 404, 'une personne hors de l’équipe est refusée');

  const grant = await post(w, cookieOwner, { action: 'save-staff', key: 'm-lina', preset: 'cashier', perms: [...lina.perms, 'sales.refund'] });
  const g = await grant.json();
  check(grant.status === 200 && JSON.stringify(g.grants) === '["sales.refund"]' && g.perms.includes('sales.refund'), 'le patron donne « Rembourser » à Lina');
  const rows = audit(w);
  check(rows.length === 1 && rows[0].subject === 'staff:m-lina' && JSON.parse(rows[0].change).added[0] === 'sales.refund' && rows[0].actor === 'account:acc-droits',
    'journal : qui (le patron), quoi (+ Rembourser), pour qui (Lina), quand');

  const copy = await (await post(w, cookieOwner, { action: 'copy-from', key: 'm-omar', from: 'm-lina' })).json();
  check(copy.preset === 'cashier' && copy.perms.includes('sales.refund'), '« copier depuis » : Omar reçoit les droits de Lina');
  const preset = await (await post(w, cookieOwner, { action: 'save-preset', preset: 'server', perms: ['customers.edit', 'sales.void-sent'] })).json();
  check(preset.perms.includes('sales.void-sent'), 'un rôle par défaut se modifie');
  check((await post(w, cookieOwner, { action: 'save-preset', preset: 'owner', perms: [] })).status === 400, 'le rôle propriétaire ne se modifie pas');
  check((await post(w, cookieOwner, { action: 'settings', freeDiscountPct: 150 })).status === 400, 'un seuil de remise hors 0..100 est refusé');
  check((await (await post(w, cookieOwner, { action: 'settings', freeDiscountPct: 15 })).json()).freeDiscountPct === 15, 'le seuil de remise libre se règle');
  const full = await (await get(w, cookieOwner)).json();
  check(full.configured === true && full.audit.length === 4 && full.audit[0].change.kind === 'settings', 'le journal est rendu au patron, le plus récent d’abord');
}

/* ── 3 · Reprise des anciens réglages du navigateur ─────────────────────── */
console.log('■ Reprise des réglages du navigateur');
{
  const w = world();
  const legacy = { grants: [{ subject: 'serveur', action: 'write', resource: 'catalog' }], denies: [{ subject: 'caissiere', action: 'write', resource: 'customers' }] };
  const first = await (await post(w, cookieOwner, { action: 'import-legacy', legacy })).json();
  const st = await (await get(w, cookieOwner)).json();
  const omar = st.staff.find((s) => s.key === 'm-omar'), lina = st.staff.find((s) => s.key === 'm-lina');
  check(first.imported === 2 && omar.perms.includes('catalog.edit') && !lina.perms.includes('customers.edit'), 'chaque règle retrouve sa personne, rien ne se perd');
  check(st.legacyImported === true && st.audit.filter((a) => a.change.kind === 'legacy-import').length === 2, 'la reprise est marquée et journalisée');
  const again = await (await post(w, cookieOwner, { action: 'import-legacy', legacy: { grants: ['*'] } })).json();
  check(again.already === true && !(await (await get(w, cookieOwner)).json()).staff.find((s) => s.key === 'm-omar').perms.includes('team.payroll'),
    'une seconde reprise ne rejoue rien par-dessus les décisions du patron');
}

/* ── 4 · Au comptoir : approbations ─────────────────────────────────────── */
console.log('■ Approbations au comptoir (/api/pin/verify)');
{
  const w = world();
  const action = { kind: 'refund', refundId: 'rf-1', originalSaleId: 'sale-1', amountCents: 5000, refundMethod: 'cash' };
  const before = await (await pinVerify(w, CODES.caisse, action)).json();
  const mgr = await (await pinVerify(w, CODES.manager, action)).json();
  check(before.ok && !before.approval && mgr.approval && !mgr.permits, 'avant configuration : le gérant valide, la caissière non (règle d’avant), aucune liste de droits envoyée');
  const lina = (await (await get(w, cookieOwner)).json()).staff.find((s) => s.key === 'm-lina');
  await post(w, cookieOwner, { action: 'save-staff', key: 'm-lina', preset: 'cashier', perms: [...lina.perms, 'sales.refund'] });
  const sara = (await (await get(w, cookieOwner)).json()).staff.find((s) => s.key === 'm-sara');
  await post(w, cookieOwner, { action: 'save-staff', key: 'm-sara', preset: 'manager', perms: sara.perms.filter((id) => id !== 'sales.refund' && id !== 'stock.adjust') });
  const after = await (await pinVerify(w, CODES.caisse, action)).json();
  const mgrAfter = await (await pinVerify(w, CODES.manager, action)).json();
  check(after.approval && after.permission.granted === true && after.permission.id === 'sales.refund' && !('permits' in after), 'Lina, avec le droit, valide un remboursement avec son propre code (verdict pour ce seul droit)');
  const drawer = await (await pinVerify(w, CODES.caisse, { kind: 'drawer' })).json();
  check(drawer.permission.id === 'sales.drawer' && drawer.permission.granted === false && !drawer.approval,
    'le verdict suit le droit demandé : pour le tiroir, Lina n’a pas le droit, et rien n’est signé');
  check(!mgrAfter.approval && mgrAfter.permission.granted === false, 'Sara, privée du droit, ne valide plus');
  const stock = await (await pinVerify(w, CODES.manager, { kind: 'inventory', movementIds: ['mv-1'] })).json();
  check(!stock.approval, 'ni un mouvement de stock');
  const owner = await (await pinVerify(w, CODES.owner, action)).json();
  check(!!owner.approval, 'le propriétaire valide toujours');
  check(!/6201|6202|6203|9911/.test(JSON.stringify([after, mgrAfter, stock])), 'la réponse ne contient aucun code');

  /* Une approbation encore valable dix minutes ne survit pas au retrait. */
  const proof = await managerRefundProof(SECRET, { merchant: SHOP, staffId: 'pin-sara', staffName: 'Sara Alaoui', staffRole: 'Manager',
    refundId: 'rf-2', originalSaleId: 'sale-1', amountCents: 5000, refundMethod: 'cash' });
  const r = await refund.onRequestPost({ env: w.env, request: req('/api/sale/refund', { method: 'POST', cookie: cookieTill,
    body: { merchant: SHOP, id: 'rf-2', originalSaleId: 'sale-1', amountCents: 5000, refundMethod: 'cash', approval: proof } }) });
  const rb = await r.json();
  check(r.status === 403 && rb.error === 'permission-denied' && rb.permission === 'sales.refund' && rb.label.ar, '/api/sale/refund relit le droit : 403 lisible (FR, EN, AR)');
  const sproof = await managerStockProof(SECRET, { merchant: SHOP, staffId: 'pin-sara', staffName: 'Sara Alaoui', staffRole: 'Manager', movementIds: ['mv-9'] });
  const m = await movements.onRequestPost({ env: w.env, request: req('/api/inventory/movements', { method: 'POST', cookie: cookieTill,
    body: { merchant: SHOP, approval: sproof, movements: [{ id: 'mv-9', itemId: 'it-1', qty: -1, reason: 'loss', ts: Date.now() }] } }) });
  const mb = await m.json();
  check(m.status === 403 && mb.permission === 'stock.adjust', '/api/inventory/movements relit le droit : perte refusée');
}

/* ── 5 · Annulation et réouverture ──────────────────────────────────────── */
console.log('■ Annulation (/api/sale/cancel)');
{
  const w = world();
  const doCancel = (pin, id) => cancel.onRequestPost({ env: w.env, request: req('/api/sale/cancel', { method: 'POST', cookie: cookieTill, body: { merchant: SHOP, id, pin } }) });
  check((await doCancel(CODES.caisse, 'sale-1')).status === 403, 'avant configuration : la caissière n’annule pas');
  const lina = (await (await get(w, cookieOwner)).json()).staff.find((s) => s.key === 'm-lina');
  await post(w, cookieOwner, { action: 'save-staff', key: 'm-lina', preset: 'cashier', perms: [...lina.perms, 'sales.cancel'] });
  const ok = await doCancel(CODES.caisse, 'sale-1');
  check(ok.status === 200 && w.sql.prepare('SELECT void_ts FROM sales WHERE id = ?').get('sale-1').void_ts > 0, 'avec le droit « Annuler », elle annule (vente marquée, jamais effacée)');
  const sara = (await (await get(w, cookieOwner)).json()).staff.find((s) => s.key === 'm-sara');
  await post(w, cookieOwner, { action: 'save-staff', key: 'm-sara', preset: 'manager', perms: sara.perms.filter((id) => id !== 'sales.cancel') });
  const no = await doCancel(CODES.manager, 'sale-2');
  const nb = await no.json();
  check(no.status === 403 && nb.error === 'manager-required' && nb.permission === 'sales.cancel', 'un gérant privé du droit est refusé (la caisse garde son message)');
  const dash = await cancel.onRequestPost({ env: w.env, request: req('/api/sale/cancel', { method: 'POST', cookie: cookieManager, body: { merchant: SHOP, id: 'sale-2', source: 'dashboard' } }) });
  check(dash.status === 403 && (await dash.json()).permission === 'sales.cancel', 'même refus depuis le tableau de bord déverrouillé par son code');
}

/* ── 6 · Le palier du tableau de bord ───────────────────────────────────── */
console.log('■ Routes du tableau de bord (tierBlock)');
{
  const w = world();
  const block = (url, method = 'GET', cookie = cookieManager) => tiers.tierBlock(req(url, { method, cookie }), w.env, url.split('?')[0]);
  check(await block('/api/sales-summary?merchant=' + SHOP) === null, 'avant configuration : le gérant lit le chiffre d’affaires (palier)');
  const before = await block('/api/foodcost?merchant=' + SHOP);
  check(before && before.status === 403 && (await before.json()).error === 'tier', 'avant configuration : les marges restent au patron (palier)');
  const sara = (await (await get(w, cookieOwner)).json()).staff.find((s) => s.key === 'm-sara');
  await post(w, cookieOwner, { action: 'save-staff', key: 'm-sara', preset: 'manager', perms: [...sara.perms.filter((id) => id !== 'reports.revenue'), 'reports.margins'] });
  const rev = await block('/api/sales-summary?merchant=' + SHOP);
  check(rev && rev.status === 403 && (await rev.json()).permission === 'reports.revenue', 'chiffre d’affaires retiré : la route se ferme');
  check(await block('/api/foodcost?merchant=' + SHOP) === null, 'marges accordées : la route du patron s’ouvre à elle');
  check(await block('/api/sales-summary?merchant=' + SHOP, 'GET', cookieOwner) === null, 'le patron passe toujours');
  check(await block('/assets/app.js') === null, 'un fichier statique ne coûte aucun droit');
}

/* ── 6b · Le merchant de la requête ne choisit pas la règle ─────────────── */
console.log('■ Merchant nommé par la requête (adresse, corps)');
{
  const w = world();
  const block = (url, method = 'GET', body) => tiers.tierBlock(req(url, { method, cookie: cookieManager, body }), w.env, url.split('?')[0]);
  const sara = (await (await get(w, cookieOwner)).json()).staff.find((s) => s.key === 'm-sara');
  await post(w, cookieOwner, { action: 'save-staff', key: 'm-sara', preset: 'manager', perms: sara.perms.filter((id) => id !== 'reports.revenue' && id !== 'catalog.edit') });
  const viaQuery = await block('/api/sales-summary?merchant=' + SISTER);
  check(viaQuery && viaQuery.status === 403 && (await viaQuery.json()).error === 'permission-denied',
    '?merchant=<une boutique sans configuration> ne fait pas retomber sur le palier : refusé');
  const viaOther = await block('/api/sales-summary?merchant=' + OTHER);
  check(viaOther && viaOther.status === 403, '?merchant=<la boutique d’un autre compte> : refusé');
  const viaBody = await block('/api/catalog', 'POST', { merchant: SISTER, data: {} });
  check(viaBody && viaBody.status === 403 && (await viaBody.json()).permission === 'catalog.edit', 'un merchant de corps différent du sien est refusé (garde du palier)');
  const handler = await catalogRoute.onRequestPost({ env: w.env, request: req('/api/catalog', { method: 'POST', cookie: cookieManager, body: { merchant: SISTER, data: { items: [] } } }) });
  check(handler.status === 403 && (await handler.json()).error === 'permission-denied', 'et la route elle-même le refuse contre le merchant qu’elle utilise');
  const own = await catalogRoute.onRequestPost({ env: w.env, request: req('/api/catalog', { method: 'POST', cookie: cookieManager, body: { merchant: SHOP, data: { items: [] } } }) });
  check(own.status === 403 && (await own.json()).permission === 'catalog.edit', 'sur sa propre boutique, le droit retiré ferme la route');
  const mv = await movements.onRequestPost({ env: w.env, request: req('/api/inventory/movements', { method: 'POST', cookie: cookieManager,
    body: { merchant: SISTER, movements: [{ id: 'mv-s1', itemId: 'it-1', qty: -1, reason: 'loss', ts: Date.now() }] } }) });
  check(mv.status === 403, 'un mouvement de stock sur une autre boutique que la sienne est refusé');
}
{
  /* « Non configuré » ne vaut que pour SA boutique : configurer la sœur ne
     change rien chez soi, et la sœur reste fermée à une session d'ailleurs. */
  const w = world();
  const ownerPost = (body) => route.onRequestPost({ env: w.env, request: req('/api/permissions', { method: 'POST', cookie: cookieOwner, body: { merchant: SISTER, ...body } }) });
  check((await ownerPost({ action: 'settings', freeDiscountPct: 0 })).status === 200, 'le patron configure la boutique sœur');
  const block = (url) => tiers.tierBlock(req(url, { cookie: cookieManager }), w.env, url.split('?')[0]);
  check(await block('/api/sales-summary?merchant=' + SHOP) === null, 'chez Sara (non configurée), le palier décide comme avant');
  const sister = await block('/api/sales-summary?merchant=' + SISTER);
  check(sister && sister.status === 403, 'la sœur configurée ne s’ouvre pas à une session venue d’une autre boutique');
}

/* ── 7 · Faits accomplis : inscrits, jamais refusés ─────────────────────── */
console.log('■ Remise et espèces sans le droit');
{
  const w = world();
  check(await perms.flagUnauthorized(w.env, SHOP, { id: 'pin-lina' }, 'money.cash', 'cash-x') === false, 'avant configuration : rien n’est inscrit');
  const lina = (await (await get(w, cookieOwner)).json()).staff.find((s) => s.key === 'm-lina');
  await post(w, cookieOwner, { action: 'save-staff', key: 'm-lina', preset: 'cashier', perms: lina.perms.filter((id) => id !== 'money.cash') });
  const now = Date.now();
  let terminal = '';
  const ev = (id, eventType, extra) => cash.onRequestPost({ env: w.env, request: req('/api/cash-sessions', { method: 'POST', cookie: cookieTill + terminal,
    body: { merchant: SHOP, terminalId: 'term-banc-1', sessionId: 'shift-1', id, eventType, actorId: 'pin-lina', openedAt: now - 1000, occurredAt: now, ...extra } }) });
  const open = await ev('ev-open', 'open', { expectedCents: 10000 });
  terminal = '; ' + String(open.headers.get('Set-Cookie') || '').split(';')[0];   // le poste neuf reçoit son cookie
  const out = await ev('ev-out', 'movement', { movementKind: 'out', movementAmountCents: 2000, movementReason: 'Fournisseur pain' });
  await ev('ev-out', 'movement', { movementKind: 'out', movementAmountCents: 2000, movementReason: 'Fournisseur pain' });
  const flagged = audit(w).filter((r) => JSON.parse(r.change).kind === 'unauthorized');
  check(open.status === 201 && out.status === 201, 'la sortie d’espèces est écrite (le tiroir a déjà bougé)');
  check(flagged.length === 1 && JSON.parse(flagged[0].change).permission === 'money.cash' && flagged[0].subject_label === 'Lina Saidi',
    'et inscrite une seule fois au journal du patron, au nom de Lina');
  await perms.flagDiscountPermission(w.env, SHOP, 'sale-d1', 'pin-lina', 10000, 500);
  await perms.flagDiscountPermission(w.env, SHOP, 'sale-d2', 'pin-lina', 10000, 3000);
  const disc = audit(w).filter((r) => JSON.parse(r.change).permission === 'sales.discount');
  check(disc.length === 1 && JSON.parse(disc[0].change).ref === 'sale-d2' && JSON.parse(disc[0].change).percent === 30,
    'remise : 5 % sous le seuil passe, 30 % sans le droit est inscrite');
}

/* ── 8 · D1 muette : on refuse, jamais de repli ─────────────────────────── */
console.log('■ Lecture des droits impossible');
{
  /* Les tables viennent de 0028, exigée par le minimum de production
     (functions/_schema-version.js). Si la lecture échoue malgré tout, rien ne
     retombe sur les droits par défaut : la route refuse. */
  const w = world({ migrated: false });
  check((await get(w, cookieOwner)).status === 503, 'l’écran répond 503');
  const write = await post(w, cookieOwner, { action: 'settings', freeDiscountPct: 5 });
  check(write.status === 503, 'aucune écriture');
  const mgr = await pinVerify(w, CODES.manager, { kind: 'refund', refundId: 'rf-1', originalSaleId: 'sale-1', amountCents: 100, refundMethod: 'cash' });
  check(mgr.status === 503 && (await mgr.json()).error === 'permissions-unavailable', 'aucune approbation n’est signée sans pouvoir lire les droits');
  const block = await tiers.tierBlock(req('/api/sales-summary?merchant=' + SHOP, { cookie: cookieManager }), w.env, '/api/sales-summary');
  check(block && block.status === 503, 'le palier refuse aussi (503), il ne laisse pas passer');
}

console.log(`\nstaff-permissions-test · ${checks} vérifications`);
