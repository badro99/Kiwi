#!/usr/bin/env node
/* Droits de l'équipe · le catalogue, la route /api/permissions et chaque route
 * qui les applique, sur le schéma complet (schema.sql) dans un SQLite en mémoire.
 *
 * Ce que ce banc tient :
 *   · rien ne change avant l'ACTIVATION, et l'activation par défaut garde à
 *     chacun exactement ses droits d'aujourd'hui (personne n'en gagne) ;
 *   · ensuite, un droit accordé ouvre et un droit retiré ferme, route par
 *     route : CHAQUE droit marqué « serveur » ou « journal » au catalogue est
 *     prouvé ici contre la vraie route (la liste est vérifiée à la fin) ;
 *   · aucun intitulé de poste ne donne le rôle du propriétaire, et une session
 *     de gérant ne peut ni poser un tel intitulé ni toucher à sa propre fiche ;
 *   · les anciens réglages du navigateur ne partent que personne par personne,
 *     sur accord, et une règle joker n'est jamais étendue ;
 *   · l'auteur d'un fait accompli est celui d'une preuve signée, jamais
 *     l'identifiant que la caisse déclare ;
 *   · tables 0028 absentes : la règle d'avant, partout, sans 503 ;
 *   · seul le patron écrit, tout s'inscrit au journal, tout se défait ;
 *   · aucune réponse ne contient un code.
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
const storeTier = await imp('functions/api/_store-tier.js');
const saleTruth = await imp('functions/api/_sale-truth.js');
const catalogRoute = await imp('functions/api/catalog.js');
const credits = await imp('functions/api/store-credits.js');
const store = await imp('functions/api/store.js');
const config = await imp('functions/api/config.js');
const { makeSession, SESS_COOKIE, TILL_COOKIE, tillToken, tillActorProof, managerRefundProof, managerStockProof } = await imp('functions/auth/_lib.js');
const { tillSellerProof } = await imp('functions/api/_seller.js');
const { tillActProof } = await imp('functions/api/_act-proof.js');

const SECRET = 'staff-permissions-bench-secret-01';
const SHOP = 'cafe-droits-banc';
const OTHER = 'boutique-voisine-droits';
const SISTER = 'cafe-droits-soeur';   // seconde boutique du MÊME compte
const CODES = { owner: '6201', manager: '6202', caisse: '6203', voisin: '6204', hind: '6205' };
const SID_MGR = 'a'.repeat(32), SID_OWNER = 'b'.repeat(32), SID_NADIA = 'c'.repeat(32);
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
/* Chaque droit prouvé contre une vraie route s'inscrit ici ; la fin du banc
   exige que tout droit « serveur » ou « journal » du catalogue y soit. */
const proven = new Set();
const prove = (perm, yes, msg) => { check(yes, `${perm} · ${msg}`); proven.add(perm); };

/* ── 1 · Le catalogue ───────────────────────────────────────────────────── */
console.log('■ Catalogue et rôles par défaut');
{
  check(Catalog.GROUPS.length === 10 && Catalog.ALL.length === 26 && new Set(Catalog.ALL).size === 26, '10 groupes, 26 droits, sans doublon');
  check(Catalog.GROUPS.every((g) => g.fr && g.en && g.ar && g.perms.every((p) => p.fr && p.en && p.ar && p.can.fr && p.can.en && p.can.ar)), 'chaque groupe et chaque droit existe en FR, EN et AR');
  check(Catalog.ALL.every((id) => ['server', 'journal', 'till'].includes(Catalog.BY_ID[id].check) && ['office', 'till', 'both'].includes(Catalog.BY_ID[id].at) && Catalog.checkLabel(id, 'fr')),
    'chaque droit dit où il est tenu (serveur, journal, caisse seule) et l’écran l’affiche');
  check(JSON.stringify(Catalog.ALL.filter((id) => Catalog.BY_ID[id].check === 'till')) === '["sales.price","sales.void-sent"]',
    'deux droits seulement sont tenus par la caisse seule, et l’écran le dit');
  check(!Catalog.ALL.includes('sales.credit') && !Catalog.ALL.includes('sales.pricelist'), 'pas de droit sans route sur cette branche (carnet, listes de prix)');
  check(!JSON.stringify(Catalog.GROUPS).includes('—'), 'aucun tiret cadratin dans les libellés');
  check(!Catalog.PRESET_IDS.includes('owner') && Catalog.presetForRole('Propriétaire') === 'manager' && Catalog.presetForRole('Patronne') === 'manager'
    && Catalog.ownerTitle('Direction') && !Catalog.ownerTitle('Gérant'), 'aucun intitulé ne donne le rôle du propriétaire : « Propriétaire » propose Manager');
  const mgr = Catalog.effective('manager');
  check(mgr.includes('sales.refund') && !mgr.includes('reports.margins') && !mgr.includes('team.payroll') && !mgr.includes('settings.edit'),
    'rôle proposé Manager : ni marges, ni paie, ni réglages');
  check(Catalog.presetForRole('Caissière') === 'cashier' && Catalog.presetForRole('Magasinier') === 'stock'
    && Catalog.presetForRole('Serveur') === 'server' && Catalog.presetForRole('chef-manager') === 'manager', 'un intitulé libre tombe sur le bon rôle proposé');
  const eff = Catalog.effective('cashier', ['sales.refund', 'nope'], ['money.cash']);
  check(eff.includes('sales.refund') && !eff.includes('money.cash') && !eff.includes('nope'), 'rôle + ajouts − retraits ; un droit inconnu est ignoré');
  const fr = Catalog.summary(Catalog.effective('cashier'), 'Lina', 'fr');
  const [, askPart = ''] = fr.split('code d’un responsable pour ');
  check(askPart && !askPart.split('.')[0].includes('paie') && fr.includes('Ne voit pas'),
    'le résumé ne prétend pas qu’un code de responsable ouvre la paie : il la range dans « Ne voit pas »');
  const wild = Catalog.fromLegacy({ grants: ['*', { action: '*', resource: 'catalog' }, { subject: 'caisse', action: 'action', resource: 'refund' }] },
    [{ key: 'm-lina', role: 'Caissière' }, { key: 'm-omar', role: 'Serveur' }]);
  check(wild.ignored.filter((r) => r.why === 'wildcard').length === 2 && !wild.people['m-omar'] && JSON.stringify(wild.people['m-lina'].grants) === '["sales.refund"]',
    'ancien réglage joker : jamais étendu, montré comme ignoré ; une règle par rôle trouve sa personne');
}

/* ── Le banc ────────────────────────────────────────────────────────────── */
const SCHEMA_SQL = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');   // lu une fois pour tout le banc
function world({ migrated = true } = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(SCHEMA_SQL);
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
  pin.run('pin-hind', SHOP, CODES.hind, 'Hind Amrani', 'Responsable', now + 3);
  pin.run('pin-leila', OTHER, CODES.voisin, 'Leila', 'Manager', now);
  /* Le document team porte des secrets : le banc en met, la route ne doit jamais les rendre. */
  const team = { members: [
    { id: 'm-sara', firstName: 'Sara', lastName: 'Alaoui', function: 'Manager', pinCode: '9911', password: 'secret-banc' },
    { id: 'm-lina', firstName: 'Lina', lastName: 'Saidi', function: 'Caissière', pinCode: '9912' },
    { id: 'm-omar', firstName: 'Omar', lastName: 'Berrada', function: 'Serveur', pinCode: '9913' },
    { id: 'm-hind', firstName: 'Hind', lastName: 'Amrani', function: 'Responsable', pinCode: '9914' },
    { id: 'm-gone', firstName: 'Ancien', lastName: 'Membre', function: 'Caissier' },
  ], removed: [{ id: 'm-gone', ts: now }] };
  sql.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,?,?)').run(SHOP, 'team', JSON.stringify(team), 1, now);
  const sale = sql.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines) VALUES (?,?,?,?,?,?,?,?,?)');
  sale.run('sale-1', SHOP, 250, 25000, 'cash', 'Table 4', '1001', now - 60000, '[{"n":"Tajine","q":1,"t":250}]');
  sale.run('sale-2', SHOP, 90, 9000, 'card', 'Comptoir', '1002', now - 90000, '[{"n":"Thé","q":3,"t":90}]');
  sql.prepare('INSERT INTO session_tiers (sid, account_id, tier, staff_id, updated_ts) VALUES (?,?,?,?,?)').run(SID_MGR, 'acc-droits', 'manager', 'pin-sara', now);
  /* Le tableau de bord du compte, déverrouillé par le code « Propriétaire » de Nadia. */
  sql.prepare('INSERT INTO session_tiers (sid, account_id, tier, staff_id, updated_ts) VALUES (?,?,?,?,?)').run(SID_NADIA, 'acc-droits', 'owner', 'pin-nadia', now);
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
const cookieNadia = `${SESS_COOKIE}=${await makeSession('acc-droits', SECRET, 0, SID_NADIA)}`;
const cookieOtherOwner = `${SESS_COOKIE}=${await makeSession('acc-voisin', SECRET)}`;
const req = (url, { method = 'GET', body, cookie } = {}) => new Request('https://kiwi.test' + url, {
  method, headers: { 'Content-Type': 'application/json', ...ip, ...(cookie ? { Cookie: cookie } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const get = async (w, cookie, merchant = SHOP) => route.onRequestGet({ env: w.env, request: req('/api/permissions?merchant=' + merchant, { cookie }) });
const post = async (w, cookie, body) => route.onRequestPost({ env: w.env, request: req('/api/permissions', { method: 'POST', cookie, body: { merchant: SHOP, ...body } }) });
const pinVerify = (w, pin, action) => verify.onRequestPost({ env: w.env, request: req('/api/pin/verify', { method: 'POST', cookie: cookieTill, body: { merchant: SHOP, pin, ...(action ? { action } : {}) } }) });
const audit = (w) => w.sql.prepare('SELECT * FROM staff_permission_audit WHERE merchant = ? ORDER BY id').all(SHOP);
const state = async (w) => (await get(w, cookieOwner)).json();
const person = async (w, key) => (await state(w)).staff.find((s) => s.key === key);
const activate = (w, choices = {}) => post(w, cookieOwner, { action: 'activate', choices });
/* Retire des droits à une personne (le patron, après activation). */
const without = async (w, key, ...ids) => { const s = await person(w, key); return post(w, cookieOwner, { action: 'save-staff', key, preset: s.preset, perms: s.perms.filter((id) => !ids.includes(id)) }); };
const withPerm = async (w, key, ...ids) => { const s = await person(w, key); return post(w, cookieOwner, { action: 'save-staff', key, preset: s.preset, perms: [...s.perms, ...ids] }); };

/* ── 2 · Activation : rien avant, rien de plus après ────────────────────── */
console.log('■ Activation');
{
  const w = world();
  const body = await state(w);
  check(body.configured === false && body.missingTables === false && body.staff.every((s) => Array.isArray(s.today) && Array.isArray(s.proposed)),
    'avant activation : l’écran montre, par personne, ses droits d’aujourd’hui et le rôle proposé');
  check(!/9911|9912|9913|9914|secret-banc|6201|6202|6203|6205|pinCode|password|"pin"/.test(JSON.stringify(body)), 'aucun code, aucun mot de passe dans la réponse');
  const keys = body.staff.map((s) => s.key);
  check(keys.includes('m-sara') && keys.includes('name:nadia patron') && !keys.includes('m-gone'), 'l’équipe = membres d’Équipe + codes sans membre ; un membre retiré n’y est pas');
  check((await post(w, cookieOwner, { action: 'save-staff', key: 'm-lina', preset: 'cashier', perms: [] })).status === 409
    && (await post(w, cookieOwner, { action: 'settings', freeDiscountPct: 3 })).status === 409, 'aucun enregistrement n’active en douce : 409 not-activated');
  check((await activate(w)).status === 200, 'le patron active');
  const after = await state(w);
  check(after.configured === true && after.staff.every((s) => JSON.stringify(s.perms) === JSON.stringify(s.today)),
    'activation par défaut : chacun garde EXACTEMENT ses droits d’aujourd’hui (Responsable, Magasinier compris), personne n’en gagne');
  const hind = after.staff.find((s) => s.key === 'm-hind');
  check(hind.proposed.some((id) => !hind.perms.includes(id)), 'Hind (Responsable) : le rôle proposé lui donnerait plus, il reste une proposition tant qu’on ne le choisit pas');
  check(audit(w).filter((r) => JSON.parse(r.change).kind === 'activate').length === after.staff.filter((s) => !s.ownerAccess).length, 'chaque personne a sa ligne d’activation (défaisable), sauf l’accès propriétaire');
  check((await activate(w)).status === 409, 'activer deux fois : refusé');

  const w2 = world();
  await activate(w2, { 'm-lina': 'preset' });
  const lina = await person(w2, 'm-lina');
  check(JSON.stringify(lina.perms) === JSON.stringify(Catalog.effective('cashier')), 'choisir le rôle proposé pour Lina lui donne ce rôle, à elle seule');
  check((await post(w, cookieManager, { action: 'activate' })).status === 403, 'un gérant n’active rien');
}

/* ── 3 · La route : lecture, écriture, journal, défaire ─────────────────── */
console.log('■ /api/permissions');
{
  const w = world();
  await activate(w);
  const till = await (await get(w, cookieTill)).json();
  check(till.readOnly === true && !('audit' in till) && till.staff[0] && !('grants' in till.staff[0]), 'la caisse appairée lit l’équipe réduite, sans surcharges ni journal');
  check((await get(w, cookieOtherOwner)).status === 403 && (await get(w, '')).status === 403, 'un autre compte, ou personne : refusé');
  const denied = await post(w, cookieManager, { action: 'save-staff', key: 'm-sara', preset: 'manager', perms: Catalog.ALL });
  check(denied.status === 403 && (await denied.json()).error === 'owner-required', 'un gérant (son code) ne change aucun droit, pas même les siens');
  check((await post(w, cookieTill, { action: 'save-staff', key: 'm-lina', preset: 'cashier', perms: [] })).status === 403, 'une caisse appairée n’écrit pas');
  const nadia = await person(w, 'name:nadia patron');
  check(nadia.ownerAccess === true && nadia.perms.length === Catalog.ALL.length, 'un code intitulé « Propriétaire » : accès propriétaire complet, dit tel quel à l’écran');
  check((await post(w, cookieOwner, { action: 'save-staff', key: 'name:nadia patron', preset: 'cashier', perms: [] })).status === 409, 'ses droits ne se règlent pas un par un : on change son intitulé dans Équipe');
  check((await post(w, cookieOwner, { action: 'save-staff', key: 'm-inconnu', preset: 'cashier', perms: [] })).status === 404, 'une personne hors de l’équipe est refusée');
  check((await post(w, cookieOwner, { action: 'save-staff', key: 'm-lina', preset: 'owner', perms: [] })).status === 400, 'le rôle « propriétaire » ne se donne pas');

  const g = await (await withPerm(w, 'm-lina', 'sales.refund')).json();
  check(g.perms.includes('sales.refund'), 'le patron donne « Rembourser » à Lina');
  const row = audit(w).at(-1);
  check(row.subject === 'staff:m-lina' && JSON.parse(row.change).added[0] === 'sales.refund' && row.actor === 'account:acc-droits', 'journal : qui, quoi, pour qui, quand');
  const copy = await (await post(w, cookieOwner, { action: 'copy-from', key: 'm-omar', from: 'm-lina' })).json();
  check(copy.perms.includes('sales.refund'), '« copier depuis » : Omar reçoit les droits de Lina');
  check((await (await post(w, cookieOwner, { action: 'settings', freeDiscountPct: 15 })).json()).freeDiscountPct === 15, 'le seuil de remise libre se règle');

  const st = await state(w);
  const grantRow = st.audit.find((a) => a.subject === 'staff:m-lina' && a.change.kind === 'staff');
  check(grantRow.undoable === true && !('before' in grantRow.change), 'chaque changement est défaisable ; l’état d’avant n’est pas exposé');
  check((await post(w, cookieOwner, { action: 'undo', id: grantRow.id })).status === 200 && !(await person(w, 'm-lina')).perms.includes('sales.refund'), '« Défaire » rend à Lina ses droits d’avant');
  check((await post(w, cookieOwner, { action: 'undo', id: grantRow.id })).status === 409 && (await state(w)).audit.find((a) => a.id === grantRow.id).undone === true,
    'une ligne ne se défait qu’une fois, et le journal le montre');
  check((await post(w, cookieManager, { action: 'undo', id: grantRow.id })).status === 403, 'un gérant ne défait rien');
  check((await post(w, cookieOwner, { action: 'deactivate' })).status === 200 && (await state(w)).configured === false, 'désactiver : retour à la règle d’avant');
}

/* ── 4 · Reprise des anciens réglages du navigateur ─────────────────────── */
console.log('■ Reprise des réglages du navigateur');
{
  const w = world();
  await activate(w);
  const legacy = { grants: [{ subject: 'serveur', action: 'write', resource: 'catalog' }, '*', { subject: 'caissiere', action: '*', resource: '*' }],
    denies: [{ subject: 'caissiere', action: 'write', resource: 'customers' }] };
  const before = audit(w).length;
  const preview = await (await post(w, cookieOwner, { action: 'legacy-preview', legacy })).json();
  check(audit(w).length === before && preview.people.length === 1 && preview.people[0].key === 'm-omar' && preview.ignored.filter((r) => r.why === 'wildcard').length === 2,
    'aperçu : rien n’est écrit ; Omar gagnerait « articles », les deux jokers sont montrés et ignorés');
  const wildOnly = await (await post(w, cookieOwner, { action: 'legacy-preview', legacy: { grants: ['*'] } })).json();
  check(wildOnly.people.length === 0, 'un joker seul ne donne rien à personne (ni paie, ni réglages)');
  const done = await (await post(w, cookieOwner, { action: 'import-legacy', legacy, accept: [] })).json();
  const st = await state(w);
  check(done.imported === 0 && !st.staff.find((s) => s.key === 'm-omar').perms.includes('catalog.edit') && st.legacyImported === true,
    'sans accord, rien n’est repris (et la reprise est close)');
  const w2 = world();
  await activate(w2);
  const ok = await (await post(w2, cookieOwner, { action: 'import-legacy', legacy, accept: ['m-omar'] })).json();
  const omar = await person(w2, 'm-omar');
  check(ok.imported === 1 && omar.perms.includes('catalog.edit') && !omar.perms.includes('team.payroll'), 'avec accord, Omar seul est repris, sans aucun droit tiré d’un joker');
  check((await (await post(w2, cookieOwner, { action: 'import-legacy', legacy, accept: ['m-omar'] })).json()).already === true, 'une seconde reprise ne rejoue rien');
}

/* ── 5 · Intitulé de propriétaire, fiche personnelle ────────────────────── */
console.log('■ Un gérant ne se fait pas propriétaire');
{
  const w = world();
  await activate(w);
  const doc = w.sql.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').get(SHOP, 'team');
  const team = JSON.parse(doc.data);
  const edit = (fn) => { const next = structuredClone(team); fn(next.members); return next; };
  const asMgr = (after) => perms.docWriteGuard(req('/api/store', { method: 'POST', cookie: cookieManager }), w.env, SHOP, 'team', team, after, false);
  const asOwner = (after) => perms.docWriteGuard(req('/api/store', { method: 'POST', cookie: cookieOwner }), w.env, SHOP, 'team', team, after, false);
  const selfTitle = await asMgr(edit((m) => { m[0].function = 'Propriétaire'; }));
  check(selfTitle && selfTitle.status === 403 && (await selfTitle.json()).error === 'owner-title-reserved', 'Sara se renomme « Propriétaire » : refusé (team doc)');
  const other = await asMgr(edit((m) => { m[1].function = 'Patronne'; }));
  check(other && other.status === 403, 'ni pour quelqu’un d’autre (« Patronne » pour Lina)');
  const added = await asMgr(edit((m) => { m.push({ id: 'm-new', firstName: 'Neuf', function: 'Direction' }); }));
  check(added && added.status === 403, 'ni en créant une fiche « Direction »');
  const own = await asMgr(edit((m) => { m[0].lastName = 'Alaoui-Bis'; }));
  check(own && own.status === 403 && (await own.json()).error === 'own-record-locked', 'Sara ne touche pas à sa propre fiche');
  check(await asMgr(edit((m) => { m[2].function = 'Serveur chef'; })) === null, 'elle gère toujours les autres fiches (team.manage)');
  const viaStore = await store.onRequestPost({ env: w.env, request: req('/api/store', { method: 'POST', cookie: cookieManager,
    body: { merchant: SHOP, feature: 'team', data: edit((m) => { m[0].function = 'Propriétaire'; }) } }) });
  check(viaStore.status === 403 && (await viaStore.json()).error === 'owner-title-reserved', 'refusé aussi par /api/store, la route réelle');
  check(await asOwner(edit((m) => { m[0].function = 'Propriétaire'; })) === null, 'le compte du propriétaire, lui, le peut');

  await without(w, 'm-sara', 'team.manage');
  prove('team.manage', !(await storeTier.storeEditorTier(req('/api/store', { cookie: cookieManager }), w.env, 'team')), 'retiré : la session de Sara ne tient plus le document Équipe');
}
{
  /* Les codes publiés (/api/config) : un code « Propriétaire » ouvre le palier du patron ; une session de gérant n'en pose aucun. */
  const w = world();
  const cfgRes = await config.onRequestPost({ env: w.env, request: req('/api/config', { method: 'POST', cookie: cookieManager,
    body: { merchant: SHOP, name: 'Café Droits', pins: [{ name: 'Sara Alaoui', role: 'Propriétaire', pin: '7731' }, { name: 'Lina Saidi', role: 'Caissière', pin: '7732' }] } }) });
  const owners = w.sql.prepare("SELECT name FROM staff_pins WHERE merchant = ? AND role = 'Propriétaire'").all(SHOP).map((r) => r.name);
  check(cfgRes.status === 403 && (await cfgRes.json()).error === 'owner-title' && JSON.stringify(owners) === '["Nadia Patron"]', '/api/config : le code « Propriétaire » que Sara se publie est REFUSÉ (403), rien n’est écrit, celui du patron reste');
  /* La même table des intitulés pour la publication et pour les droits. */
  const { accountOwnerRole } = await imp('functions/api/_staff-publication.js');
  const variants = ['Propriétaire', 'proprietaire', '  OWNER ', 'Patronne', 'PATRON', 'Direction', 'Manager-Owner', 'propriétaire ', 'Gérant', 'Manager', 'Caissière', 'Directeur', 'Responsable'];
  const auth = await imp('functions/auth/_lib.js');
  check(variants.every((v) => accountOwnerRole(v) === Catalog.ownerTitle(v)), 'publication : une ligne propriétaire est exactement un intitulé de la liste unique (« Patronne » n’en est pas une)');
  check(variants.every((v) => Catalog.ownerTitle(v) === (auth.faceAccessTier(v) === 'owner') && (!Catalog.ownerTitle(v) || auth.employeeRoleOpensDashboard(v))),
    'UNE liste d’intitulés propriétaire : accès complet aux droits = palier du patron au tableau de bord : ' + variants.map((v) => v.trim() + '=' + Catalog.ownerTitle(v)).join(' '));
  check(Catalog.reservedTitle('Patronne') && !Catalog.ownerTitle('Patronne') && Catalog.presetForRole('Patronne') === 'manager',
    '« Patronne » : réservé au patron (personne d’autre ne le pose), mais n’ouvre que le rôle Manager, comme au tableau de bord');
  for (const role of ['Propriétaire', 'Patronne', '  OWNER ']) {
    const r = await config.onRequestPost({ env: w.env, request: req('/api/config', { method: 'POST', cookie: cookieManager,
      body: { merchant: SHOP, name: 'Café Droits', pins: [{ name: 'Xavier Test', role, pin: '7741' }, { name: 'Lina Saidi', role: 'Caissière', pin: CODES.caisse }] } }) });
    check(r.status === 403 && (await r.json()).error === 'owner-title', `Sara publie « Xavier Test · ${role.trim()} » : 403`);
  }
  check(!w.sql.prepare("SELECT 1 FROM staff_pins WHERE merchant = ? AND name = 'Xavier Test'").get(SHOP), 'aucun de ces codes n’existe');
  /* L'oracle fermé : la ligne de la patronne renvoyée par un gérant, avec le BON code ou
     un FAUX, reçoit exactement la même réponse ; son code n'est jamais lu, la ligne en base ne bouge pas. */
  const asOwnerRow = (pin) => config.onRequestPost({ env: w.env, request: req('/api/config', { method: 'POST', cookie: cookieManager,
    body: { merchant: SHOP, name: 'Café Droits', pins: [{ name: 'Nadia Patron', role: 'Propriétaire', pin }, { name: 'Lina Saidi', role: 'Caissière', pin: CODES.caisse }] } }) });
  const right = await asOwnerRow(CODES.owner), wrong = await asOwnerRow('7749');
  const [rb, wb] = [await right.text(), await wrong.text()];
  check(right.status === wrong.status && rb === wb, `bon code et faux code : même statut (${right.status}), même corps, rien à deviner`);
  check((await (await pinVerify(w, CODES.owner, {})).json()).staff.role === 'Propriétaire' && !(await (await pinVerify(w, '7749', {})).json()).ok,
    'le code de la patronne n’a pas bougé, et le faux n’existe pas');
}

/* ── 6 · Au comptoir : approbations ─────────────────────────────────────── */
console.log('■ Approbations au comptoir (/api/pin/verify)');
{
  const w = world();
  const action = { kind: 'refund', refundId: 'rf-1', originalSaleId: 'sale-1', amountCents: 5000, refundMethod: 'cash' };
  const before = await (await pinVerify(w, CODES.caisse, action)).json();
  const mgr = await (await pinVerify(w, CODES.manager, action)).json();
  check(before.ok && !before.approval && mgr.approval, 'avant activation : le gérant valide, la caissière non (règle d’avant)');
  await activate(w);
  await withPerm(w, 'm-lina', 'sales.refund');
  await without(w, 'm-sara', 'sales.refund', 'stock.adjust');
  const after = await (await pinVerify(w, CODES.caisse, action)).json();
  const mgrAfter = await (await pinVerify(w, CODES.manager, action)).json();
  prove('sales.refund', after.approval && after.permission.granted === true && !mgrAfter.approval && mgrAfter.permission.granted === false,
    'Lina, avec le droit, valide avec son propre code ; Sara, sans, ne valide plus');
  const proof = await managerRefundProof(SECRET, { merchant: SHOP, staffId: 'pin-sara', staffName: 'Sara Alaoui', staffRole: 'Manager',
    refundId: 'rf-2', originalSaleId: 'sale-1', amountCents: 5000, refundMethod: 'cash' });
  const r = await refund.onRequestPost({ env: w.env, request: req('/api/sale/refund', { method: 'POST', cookie: cookieTill,
    body: { merchant: SHOP, id: 'rf-2', originalSaleId: 'sale-1', amountCents: 5000, refundMethod: 'cash', approval: proof } }) });
  const rb = await r.json();
  check(r.status === 403 && rb.error === 'permission-denied' && rb.label.ar && rb.approval === 'manager-code', '/api/sale/refund relit le droit : 403 lisible, voie du code responsable');
  const sproof = await managerStockProof(SECRET, { merchant: SHOP, staffId: 'pin-sara', staffName: 'Sara Alaoui', staffRole: 'Manager', movementIds: ['mv-9'] });
  const m = await movements.onRequestPost({ env: w.env, request: req('/api/inventory/movements', { method: 'POST', cookie: cookieTill,
    body: { merchant: SHOP, approval: sproof, movements: [{ id: 'mv-9', itemId: 'it-1', qty: -1, reason: 'loss', ts: Date.now() }] } }) });
  prove('stock.adjust', m.status === 403 && (await m.json()).permission === 'stock.adjust', '/api/inventory/movements relit le droit : perte refusée');
  const drawer = await (await pinVerify(w, CODES.caisse, { kind: 'drawer' })).json();
  check(drawer.permission.id === 'sales.drawer' && drawer.permission.granted === false && !drawer.approval, 'le verdict ne vaut que pour le droit demandé');
  check(!/6201|6202|6203|9911/.test(JSON.stringify([after, mgrAfter, drawer])), 'la réponse ne contient aucun code');
}

/* ── 7 · Annulation et réouverture ──────────────────────────────────────── */
console.log('■ Annulation et réouverture (/api/sale/cancel)');
{
  const w = world();
  const doCancel = (pin, id, extra) => cancel.onRequestPost({ env: w.env, request: req('/api/sale/cancel', { method: 'POST', cookie: cookieTill, body: { merchant: SHOP, id, pin, ...extra } }) });
  check((await doCancel(CODES.caisse, 'sale-1')).status === 403, 'avant activation : la caissière n’annule pas');
  check(perms.cancelManagerRole('Gérante') === false && perms.cancelManagerRole('Responsable') && perms.cancelManagerRole('chef-manager'), 'la règle d’avant de l’annulation est recopiée telle quelle');
  await activate(w);
  await withPerm(w, 'm-lina', 'sales.cancel');
  const ok = await doCancel(CODES.caisse, 'sale-1');
  prove('sales.cancel', ok.status === 200 && w.sql.prepare('SELECT void_ts FROM sales WHERE id = ?').get('sale-1').void_ts > 0, 'avec le droit, Lina annule (vente marquée, jamais effacée)');
  await without(w, 'm-sara', 'sales.reopen');
  const re = await doCancel(CODES.manager, 'sale-1', { reopen: true });
  prove('sales.reopen', re.status === 403 && (await re.json()).permission === 'sales.reopen', 'Sara, privée de « Rouvrir », est refusée');
}

/* ── 8 · Le tableau de bord : routes et documents ───────────────────────── */
console.log('■ Routes et documents du tableau de bord');
{
  const w = world();
  const block = (url, method = 'GET', cookie = cookieManager) => tiers.tierBlock(req(url, { method, cookie }), w.env, url.split('?')[0]);
  check(await block('/api/sales-summary?merchant=' + SHOP) === null, 'avant activation : le gérant lit le chiffre d’affaires (palier)');
  await activate(w);
  const closes = async (perm, url, method = 'GET') => {
    const before = await block(url, method);
    await without(w, 'm-sara', perm);
    const after = await block(url, method);
    await withPerm(w, 'm-sara', perm);
    return before === null && after && after.status === 403 && (await after.json()).permission === perm;
  };
  for (const [perm, url, method] of [
    ['reports.revenue', '/api/sales-summary?merchant=' + SHOP, 'GET'],
    ['catalog.edit', '/api/catalog?merchant=' + SHOP, 'POST'],
    ['stock.count', '/api/inventory/counts?merchant=' + SHOP, 'POST'],
    ['stock.receive', '/api/stock-transfers?merchant=' + SHOP, 'POST'],
    ['customers.edit', '/api/clients?merchant=' + SHOP, 'POST'],
    ['customers.delete', '/api/clients?merchant=' + SHOP, 'DELETE'],
  ]) prove(perm, await closes(perm, url, method), `retiré à Sara : ${method} ${url.split('?')[0]} se ferme`);
  const margins = await block('/api/foodcost?merchant=' + SHOP);
  await withPerm(w, 'm-sara', 'reports.margins', 'team.payroll');
  prove('reports.margins', margins && margins.status === 403 && await block('/api/foodcost?merchant=' + SHOP) === null, 'donné par le patron : les marges s’ouvrent à Sara');
  prove('team.payroll', await block('/api/pay-statements?merchant=' + SHOP) === null, 'donné : les fiches de paie aussi');
  await without(w, 'm-sara', 'team.payroll', 'stock.value');
  const below = (feature) => storeTier.docBelowTier(req('/api/store', { cookie: cookieManager }), w.env, SHOP, feature);
  check(await below('payroll') === true, 'team.payroll retiré : le document de paie se ferme à sa session');
  prove('stock.value', await below('costs') === true, 'retiré : les coûts (prix d’achat) se ferment');
  check(await block('/api/sales-summary?merchant=' + SHOP, 'GET', cookieOwner) === null, 'le compte du propriétaire passe toujours');

  /* Les documents s'écrivent en entier : ce qui change dit le droit (store.js › docWriteGuard). */
  const doc = (feature, before, after, settings = false) => perms.docWriteGuard(req('/api/store', { method: 'POST', cookie: cookieManager }), w.env, SHOP, feature, before, after, settings);
  for (const [perm, feature, key, settings] of [
    ['purchases.create', 'procurement', 'orders'], ['purchases.pay', 'procurement', 'invoices'],
    ['suppliers.edit', 'suppliers', 'list'], ['settings.edit', 'policies', 'rules', true],
  ]) {
    const okBefore = await doc(feature, { [key]: [] }, { [key]: [{ id: 'x' }] }, settings);
    await without(w, 'm-sara', perm);
    const no = await doc(feature, { [key]: [] }, { [key]: [{ id: 'x' }] }, settings);
    const untouched = await doc(feature, { [key]: [], other: 1 }, { [key]: [], other: 2 }, false);
    await withPerm(w, 'm-sara', perm);
    prove(perm, (settings || okBefore === null) && no && no.status === 403 && (await no.json()).permission === perm && untouched === null,
      `retiré : écrire « ${feature}.${key} » est refusé, le reste du document passe`);
  }

  await without(w, 'm-sara', 'purchases.create');
  const viaStore = await store.onRequestPost({ env: w.env, request: req('/api/store', { method: 'POST', cookie: cookieManager,
    body: { merchant: SHOP, feature: 'procurement', data: { orders: [{ id: 'po-1' }] } } }) });
  check(viaStore.status === 403 && (await viaStore.json()).permission === 'purchases.create', 'et /api/store applique ce garde pour de vrai');
  await withPerm(w, 'm-sara', 'purchases.create');

  /* Dans la route elle-même, contre le merchant qu'elle utilise. */
  await without(w, 'm-sara', 'catalog.price', 'customers.balance');
  const putCatalog = (cookie, priceMAD, baseRev) => catalogRoute.onRequestPost({ env: w.env, request: req('/api/catalog', { method: 'POST', cookie,
    body: { merchant: SHOP, baseRev, data: { products: [{ id: 'p1', name: 'Thé', priceMAD }] } } }) });
  const first = await putCatalog(cookieOwner, 10, 0);
  const rev = (await first.json()).rev;
  const renamed = await putCatalog(cookieManager, 10, rev);
  const price = await putCatalog(cookieManager, 12, rev + 1);
  prove('catalog.price', first.status === 200 && renamed.status === 200 && price.status === 403 && (await price.json()).permission === 'catalog.price',
    'sans le droit, Sara enregistre le catalogue mais ne change pas un prix existant');
  const credit = await credits.onRequestPost({ env: w.env, request: req('/api/store-credits', { method: 'POST', cookie: cookieManager,
    body: { merchant: SHOP, action: 'adjust', id: 'sc-1', customerId: 'c-1', deltaCents: 500, reason: 'geste' } }) });
  prove('customers.balance', credit.status === 403 && (await credit.json()).permission === 'customers.balance', 'corriger un solde client (/api/store-credits › adjust) : refusé');
  const sister = await catalogRoute.onRequestPost({ env: w.env, request: req('/api/catalog', { method: 'POST', cookie: cookieManager, body: { merchant: SISTER, data: { items: [] } } }) });
  check(sister.status === 403, 'une session de gérant ne vise pas une autre boutique pour retomber sur l’ancienne règle');
}

/* ── 9 · Faits accomplis : l'auteur prouvé, jamais déclaré ──────────────── */
console.log('■ Remise, espèces, tiroir, clôture sans le droit');
{
  const w = world();
  check(await perms.flagUnauthorized(w.env, SHOP, { id: 'pin-lina' }, 'money.cash', 'cash-x') === false, 'avant activation : rien n’est inscrit');
  await activate(w);
  const now = Date.now();
  const linaSeller = await tillSellerProof(SECRET, SHOP, { id: 'pin-lina', name: 'Lina Saidi' });
  const sara = { id: 'pin-sara', name: 'Sara Alaoui', role: 'Manager' };
  const saraAct = (terms, at = Date.now()) => tillActProof(SECRET, SHOP, sara, terms, at);
  const genericActor = await tillActorProof(SECRET, SHOP, sara);
  let terminal = '';
  const ev = (id, eventType, extra) => cash.onRequestPost({ env: w.env, request: req('/api/cash-sessions', { method: 'POST', cookie: cookieTill + terminal,
    body: { merchant: SHOP, terminalId: 'term-banc-1', sessionId: 'shift-1', id, eventType, openedAt: now - 1000, occurredAt: now, ...extra } }) });
  const open = await ev('ev-open', 'open', { expectedCents: 10000, actorId: 'pin-lina' });
  terminal = '; ' + String(open.headers.get('Set-Cookie') || '').split(';')[0];
  const flags = () => audit(w).map((r) => ({ ...r, c: JSON.parse(r.change) })).filter((r) => r.c.kind === 'unauthorized');
  const out = { movementKind: 'out', movementAmountCents: 2000, movementReason: 'Fournisseur pain' };
  await ev('ev-1', 'movement', { ...out, actorId: 'pin-sara' });
  const f1 = flags().find((r) => r.c.ref === 'ev-1');
  check(f1 && f1.subject === 'staff:unproven' && f1.c.claimed === 'pin-sara', 'la caisse dit « Sara » sans preuve : inscrit « auteur non prouvé », Sara n’est pas créditée');
  await ev('ev-2', 'movement', { ...out, actorId: 'pin-sara', sellerProof: linaSeller });
  await ev('ev-2', 'movement', { ...out, actorId: 'pin-sara', sellerProof: linaSeller });
  const f2 = flags().filter((r) => r.c.ref === 'ev-2');
  prove('money.cash', f2.length === 1 && f2[0].subject_label === 'Lina Saidi', 'la preuve dit Lina : inscrit une fois, à son nom, quoi que la caisse déclare');
  /* La preuve de la personne en poste NOMME, elle ne couvre pas : Sara a le droit,
     mais sans code pour CE geste, ses 9 000 MAD sont inscrits « sans code ». */
  const saraSeller = await tillSellerProof(SECRET, SHOP, { id: 'pin-sara', name: 'Sara Alaoui' });
  await ev('ev-big', 'movement', { movementKind: 'out', movementAmountCents: 900000, movementReason: 'x', actorId: 'pin-sara', sellerProof: saraSeller });
  await ev('ev-big2', 'movement', { movementKind: 'out', movementAmountCents: 2000, movementReason: 'x', actorId: 'pin-sara', sellerProof: saraSeller });
  const big = flags().filter((r) => r.c.ref === 'ev-big' || r.c.ref === 'ev-big2');
  check(big.length === 2 && big.every((r) => r.subject_label === 'Sara Alaoui' && r.c.noCode === true), 'deux sorties sous la preuve de poste de Sara : inscrites, « sans code », pas couvertes');
  const unlock = await (await pinVerify(w, CODES.manager)).json();
  const approve = await (await pinVerify(w, CODES.manager, { kind: 'cash', amountCents: 2000, move: 'out' })).json();
  check(typeof unlock.sellerProof === 'string' && unlock.sellerProof && !approve.sellerProof && typeof approve.actProof === 'string',
    'la preuve de poste ne sort qu’à l’ouverture de la caisse (sans acte), jamais d’un accord donné au pavé');
  const ok = await saraAct({ kind: 'cash', amountCents: 2000, move: 'out' });
  await ev('ev-3', 'movement', { ...out, actorId: 'pin-lina', actProof: ok, sellerProof: linaSeller });
  check(!flags().some((r) => r.c.ref === 'ev-3'), 'Sara a validé CE geste sur le pavé (sa preuve : espèces, 20 MAD, sortie) : rien n’est inscrit');
  await ev('ev-3b', 'movement', { ...out, actorId: 'pin-lina', actProof: ok, sellerProof: linaSeller });
  check(flags().some((r) => r.c.ref === 'ev-3b' && r.subject_label === 'Lina Saidi'), 'la même preuve ne couvre pas une seconde sortie : celle-ci revient à Lina');
  await ev('ev-3c', 'movement', { ...out, movementAmountCents: 50000, actorId: 'pin-lina', actProof: await saraAct({ kind: 'cash', amountCents: 2000, move: 'out' }), sellerProof: linaSeller });
  check(flags().some((r) => r.c.ref === 'ev-3c'), 'une preuve pour 20 MAD ne couvre pas une sortie de 500 MAD');
  /* Le sondage du juge : une preuve vieille d'une heure, un fait antidaté dans sa fenêtre. */
  const hourAgo = Date.now() - 3600000;
  const old = await saraAct({ kind: 'cash', amountCents: 2000, move: 'out' }, hourAgo);
  await cash.onRequestPost({ env: w.env, request: req('/api/cash-sessions', { method: 'POST', cookie: cookieTill + terminal,
    body: { merchant: SHOP, terminalId: 'term-banc-1', sessionId: 'shift-1', id: 'ev-old', eventType: 'movement', openedAt: hourAgo - 1000, occurredAt: hourAgo + 60000,
      ...out, actorId: 'pin-sara', actProof: old } }) });
  check(flags().some((r) => r.c.ref === 'ev-old' && r.subject === 'staff:unproven'), 'une sortie ANTIDATÉE avec une preuve d’il y a une heure : « auteur non prouvé » (la réception juge)');
  await ev('ev-gen', 'movement', { ...out, actorId: 'pin-sara', actProof: genericActor, actorProof: genericActor });
  check(flags().some((r) => r.c.ref === 'ev-gen' && r.subject === 'staff:unproven'), 'la preuve d’identité générique (5 min, sans acte) ne couvre aucune sortie');
  const drawerProof = await saraAct({ kind: 'drawer' });
  await ev('ev-dr', 'movement', { ...out, actorId: 'pin-sara', actProof: drawerProof });
  check(flags().some((r) => r.c.ref === 'ev-dr'), 'une preuve « tiroir » ne couvre pas une sortie d’espèces');
  const viaPad = await (await pinVerify(w, CODES.manager, { kind: 'cash', amountCents: 2000, move: 'out' })).json();
  await ev('ev-pad', 'movement', { ...out, actorId: 'pin-lina', actProof: viaPad.actProof });
  check(typeof viaPad.actProof === 'string' && !flags().some((r) => r.c.ref === 'ev-pad'), '/api/pin/verify signe la preuve de ce geste, et la sortie qu’elle couvre n’est pas inscrite');
  await ev('ev-4', 'movement', { movementKind: 'no-sale', movementAmountCents: 0, movementReason: 'Monnaie', actorId: 'pin-lina', sellerProof: linaSeller });
  prove('sales.drawer', flags().some((r) => r.c.ref === 'ev-4' && r.c.permission === 'sales.drawer'), 'tiroir ouvert sans vente, sans le droit : inscrit');
  await ev('ev-5', 'close', { expectedCents: 6000, countedCents: 6000, gapCents: 0, actorId: 'pin-lina', sellerProof: linaSeller });
  prove('money.close-day', flags().some((r) => r.c.ref === 'ev-5' && r.c.permission === 'money.close-day'), 'clôture sans le droit : inscrite (le compte du soir reste écrit)');
  const disc = (id, body, off) => saleTruth.flagSaleDiscount(w.env, SHOP, id, body, Date.now(), 10000, off, 'pin-sara');
  await disc('sale-d1', { seller: { proof: linaSeller } }, 500);
  await disc('sale-d2', { seller: { proof: linaSeller } }, 3000);
  await disc('sale-d3', { actProof: await saraAct({ kind: 'discount', pct: 30 }), seller: { proof: linaSeller } }, 3000);
  await disc('sale-d4', { actProof: await saraAct({ kind: 'discount', pct: 10 }), seller: { proof: linaSeller } }, 4000);
  const d = flags().filter((r) => r.c.permission === 'sales.discount');
  prove('sales.discount', d.length === 2 && d[0].c.ref === 'sale-d2' && d[0].subject_label === 'Lina Saidi' && d[0].c.percent === 30 && d[1].c.ref === 'sale-d4',
    '5 % sous le seuil passe ; 30 % par Lina est inscrit ; validé à 30 % par Sara, rien ; un accord pour 10 % ne couvre pas 40 %');
  /* Remise en montant : l'accord dit le montant, et la remise doit tenir dedans. */
  await disc('sale-a1', { actProof: await saraAct({ kind: 'discount', amountCents: 1000 }) }, 4000);
  await disc('sale-a2', { actProof: await saraAct({ kind: 'discount' }) }, 4000);
  await disc('sale-a3', { actProof: await saraAct({ kind: 'discount', amountCents: 5000 }) }, 4000);
  const am = flags().filter((r) => ['sale-a1', 'sale-a2', 'sale-a3'].includes(r.c.ref)).map((r) => r.c.ref).sort().join(',');
  check(am === 'sale-a1,sale-a2', 'remise en montant : un accord de 10 MAD ne couvre pas 40 MAD, un accord sans montant ni % ne couvre rien, 50 MAD couvre 40 : ' + am);
  const week = await state(w);
  check(week.unauthorizedWeek === flags().length, 'l’écran compte les faits sans le droit de la semaine');
}

/* ── 9b · Une identité fabriquée après un retrait ───────────────────────── */
console.log('■ Un gérant ne se fabrique pas un second code');
{
  const w = world();
  await activate(w);
  await without(w, 'm-sara', 'sales.refund');
  const refundAct = { kind: 'refund', refundId: 'rf-9', originalSaleId: 'sale-1', amountCents: 1000, refundMethod: 'cash' };
  const doc = w.sql.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').get(SHOP, 'team');
  const team = JSON.parse(doc.data);
  team.members.push({ id: 'm-sara2', firstName: 'Sara', lastName: 'Deux', function: 'Gérant' });
  const viaTeam = await store.onRequestPost({ env: w.env, request: req('/api/store', { method: 'POST', cookie: cookieManager, body: { merchant: SHOP, feature: 'team', baseRev: doc.rev, data: team } }) });
  const held = await person(w, 'm-sara2');
  check(viaTeam.status === 200 && held.held === true && held.perms.length === 0, 'la fiche « Sara Deux · Gérant » ajoutée par Sara : aucun droit tant que le patron ne l’a pas revue');
  const pins = [{ name: 'Sara Deux', role: 'Gérant', pin: '7741' }, { name: 'Lina Saidi', role: 'Caissière', pin: CODES.caisse }, { name: 'Hind Amrani', role: 'Responsable', pin: CODES.hind }];
  const pub = await config.onRequestPost({ env: w.env, request: req('/api/config', { method: 'POST', cookie: cookieManager, body: { merchant: SHOP, name: 'Café Droits', pins } }) });
  const minted = await (await pinVerify(w, '7741', refundAct)).json();
  check(pub.status === 200 && minted.ok && !minted.approval && minted.permission.granted === false, 'et son code tout neuf ne valide pas le remboursement qu’on lui a retiré');
  const pins2 = [{ name: 'Joker', role: 'Gérant', pin: '7742' }, ...pins];
  await config.onRequestPost({ env: w.env, request: req('/api/config', { method: 'POST', cookie: cookieManager, body: { merchant: SHOP, name: 'Café Droits', pins: pins2 } }) });
  const joker = await (await pinVerify(w, '7742', refundAct)).json();
  check(joker.ok && !joker.approval, 'un code publié sans fiche (« Joker · Gérant ») : retenu aussi');
  const log = (await state(w)).audit.map((a) => a.change.kind);
  check(log.includes('team-added') && log.includes('code-added'), 'le journal montre la fiche et le code ajoutés, à côté des droits');
  await post(w, cookieOwner, { action: 'save-staff', key: 'm-sara2', preset: 'manager', perms: Catalog.effective('manager') });
  check((await person(w, 'm-sara2')).held === false, 'le patron revoit Sara Deux : la retenue tombe avec son choix');
  const w2 = world();
  await activate(w2);
  const doc2 = w2.sql.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').get(SHOP, 'team');
  const t2 = JSON.parse(doc2.data);
  t2.members.push({ id: 'm-new', firstName: 'Nouvelle', lastName: 'Caissière', function: 'Caissière' });
  await store.onRequestPost({ env: w2.env, request: req('/api/store', { method: 'POST', cookie: cookieOwner, body: { merchant: SHOP, feature: 'team', baseRev: doc2.rev, data: t2 } }) });
  check((await person(w2, 'm-new')).held === false, 'une fiche ajoutée par le propriétaire part de son rôle, sans retenue');
}

/* ── 9c · Un code « Propriétaire » qui écrit des droits ─────────────────── */
console.log('■ Le journal nomme le code');
{
  const w = world();
  await activate(w);
  const s = await person(w, 'm-lina');
  const res = await post(w, cookieNadia, { action: 'save-staff', key: 'm-lina', preset: s.preset, perms: [...s.perms, 'sales.refund'] });
  const last = audit(w).at(-1);
  const shown = (await state(w)).audit[0].actor;
  check(res.status === 200 && last.actor === 'code:pin-nadia' && last.actor_label === 'Nadia Patron' && shown.kind === 'code' && shown.name === 'Nadia Patron',
    'une écriture faite par le code « Propriétaire » de Nadia est inscrite à son nom, pas « propriétaire » : ' + JSON.stringify(shown));
  await post(w, cookieOwner, { action: 'settings', freeDiscountPct: 12 });
  const acc = (await state(w)).audit[0].actor;
  check(audit(w).at(-1).actor === 'account:acc-droits' && acc.kind === 'account' && acc.name === '', 'celle du compte lui-même : un auteur typé, sans phrase (l’écran la dit dans sa langue)');
  check(!audit(w).some((r) => /propriétaire|session /.test(r.actor_label)), 'aucune phrase française rangée comme auteur');
}

/* ── 9d · Revue de sécurité : homonymes, retenue fermée ─────────────────── */
console.log('■ Un homonyme ne prend pas l’accès propriétaire ; une retenue qui ne s’écrit pas bloque');
{
  const w = world();
  await activate(w);
  const doc = () => w.sql.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').get(SHOP, 'team');
  /* Une fiche « Propriétaire » posée par le patron, puis un code homonyme publié par Sara. */
  const t0 = JSON.parse(doc().data);
  t0.members.push({ id: 'm-boss', firstName: 'Karim', lastName: 'Patron', function: 'Propriétaire' });
  w.sql.prepare('UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = ?').run(JSON.stringify(t0), SHOP, 'team');   // comme si le patron l'avait posée
  const viaName = await perms.permissionsFor(w.env, SHOP, { id: 'pin-x', name: 'Karim Patron', role: 'Gérant' });
  check(viaName.ok && !viaName.ownerAccess && viaName.perms.length < Catalog.ALL.length, 'un code « Karim Patron · Gérant » ne prend pas l’intitulé de la fiche homonyme : pas d’accès propriétaire');
  const base = [{ name: 'Lina Saidi', role: 'Caissière', pin: CODES.caisse }, { name: 'Hind Amrani', role: 'Responsable', pin: CODES.hind }];
  const publish = (pins) => config.onRequestPost({ env: w.env, request: req('/api/config', { method: 'POST', cookie: cookieManager, body: { merchant: SHOP, name: 'Café Droits', pins } }) });
  for (const name of ['Karim Patron', 'Nadia Patron']) {
    const r = await publish([{ name, role: 'Gérant', pin: '7751' }, ...base]);
    check(r.status === 409 && (await r.json()).error === 'owner-name', `Sara ne publie pas de code au nom de ${name} (intitulé propriétaire) : 409`);
  }
  check(!(await (await pinVerify(w, '7751', { kind: 'refund', refundId: 'rf-h', originalSaleId: 'sale-1', amountCents: 100, refundMethod: 'cash' })).json()).ok, 'et ce code n’existe pas');
  const st = await perms.loadState(w.env, SHOP);
  st.rows.set('m-boss', { preset: 'manager', grants: [], denies: [], heldTs: Date.now() });
  check(perms.permsIn(st, { key: 'm-boss', name: 'Karim Patron', role: 'Propriétaire' }).held === true, 'une retenue passe AVANT l’intitulé propriétaire');
  /* La retenue ne s'écrit pas : la fiche et le code ne passent pas. */
  const realBatch = w.env.DB.batch;
  w.env.DB.batch = async (stmts) => { throw new Error('d1 en panne'); };
  const t1 = JSON.parse(doc().data);
  t1.members.push({ id: 'm-x', firstName: 'Nouveau', lastName: 'Gérant', function: 'Gérant' });
  const revBefore = doc().rev;
  const failTeam = await store.onRequestPost({ env: w.env, request: req('/api/store', { method: 'POST', cookie: cookieManager, body: { merchant: SHOP, feature: 'team', baseRev: revBefore, data: t1 } }) });
  check(failTeam.status === 503 && doc().rev === revBefore && !JSON.parse(doc().data).members.some((m) => m.id === 'm-x'), 'retenue impossible : la fiche n’est pas écrite (503)');
  const failPin = await publish([{ name: 'Joker Deux', role: 'Gérant', pin: '7752' }, ...base]);
  check(failPin.status === 503 && !(await (await pinVerify(w, '7752', {})).json()).ok, 'retenue impossible : le code n’est pas publié (503)');
  w.env.DB.batch = realBatch;
  /* Le plan ne se construit pas : la DERNIÈRE lecture des droits avant l'écriture
     (celle de teamPlan) casse. Le rang se mesure sur une écriture qui réussit. */
  const sabotage = (world_, nth) => { const real = world_.env.DB.prepare; let n = 0;
    world_.env.DB.prepare = (q) => { if (/FROM staff_permission_settings/.test(q) && ++n === nth) throw new Error('d1 en panne'); return real.call(world_.env.DB, q); };
    return () => { world_.env.DB.prepare = real; return n; }; };
  const addOne = (world_, id) => { const d = world_.sql.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').get(SHOP, 'team');
    const t = JSON.parse(d.data); t.members.push({ id, firstName: 'Autre', lastName: 'Gérant', function: 'Gérant' });
    return store.onRequestPost({ env: world_.env, request: req('/api/store', { method: 'POST', cookie: cookieManager, body: { merchant: SHOP, feature: 'team', baseRev: d.rev, data: t } }) }); };
  const probe = world();
  await activate(probe);
  const count = sabotage(probe, 0);
  check((await addOne(probe, 'm-z')).status === 200, 'banc : la même écriture passe quand la base répond');
  const reads = count();
  const restore = sabotage(w, reads);
  const failPlan = await addOne(w, 'm-y');
  restore();
  check(failPlan.status === 503 && !JSON.parse(doc().data).members.some((m) => m.id === 'm-y'), 'plan impossible : la fiche n’est pas écrite (503)');
}

/* ── 9f · Juge 5 : le code du patron survit à la page Équipe, une collision ne se voit pas ── */
console.log('■ Le code du patron ne s’efface pas, une collision ne se devine pas');
{
  const w = world();
  await activate(w);
  const publishAs = (cookie, pins) => config.onRequestPost({ env: w.env, request: req('/api/config', { method: 'POST', cookie, body: { merchant: SHOP, name: 'Café Droits', pins } }) });
  const team = [{ name: 'Lina Saidi', role: 'Caissière', pin: CODES.caisse }, { name: 'Sara Alaoui', role: 'Manager', pin: CODES.manager }];
  /* Le patron enregistre sa page Équipe (qui ne le contient jamais) avec une « Patronne » puis une « Direction ». */
  const withPatronne = await publishAs(cookieOwner, [...team, { name: 'Fatima Zahra', role: 'Patronne', pin: '7801' }]);
  const nadia1 = await (await pinVerify(w, CODES.owner, {})).json();
  check(withPatronne.status === 200 && nadia1.ok && nadia1.staff.name === 'Nadia Patron' && (await (await pinVerify(w, '7801', {})).json()).staff.role === 'Patronne',
    'une employée « Patronne » publiée par le patron : le code de Nadia vérifie toujours');
  const withDirection = await publishAs(cookieOwner, [...team, { name: 'Driss Alami', role: 'Direction', pin: '7802' }]);
  const nadia2 = await (await pinVerify(w, CODES.owner, {})).json();
  check(withDirection.status === 200 && nadia2.ok && nadia2.staff.name === 'Nadia Patron' && (await (await pinVerify(w, '7802', {})).json()).staff.role === 'Direction',
    'un employé « Direction » (intitulé propriétaire) : il ne remplace que la ligne à SON nom, Nadia reste');
  const replaced = await publishAs(cookieOwner, [...team, { name: 'Nadia Patron', role: 'Propriétaire', pin: '7803' }]);
  check(replaced.status === 200 && (await (await pinVerify(w, '7803', {})).json()).staff.name === 'Nadia Patron' && !(await (await pinVerify(w, CODES.owner, {})).json()).ok,
    'le patron qui republie SA ligne (wizard, console) change bien son code');
  /* Un gérant publie « Probe X » avec le code du patron, puis avec un autre : rien ne les distingue. */
  const roster = async () => {
    const cfg = await (await config.onRequestGet({ env: w.env, request: req('/api/config?merchant=' + SHOP, { cookie: cookieManager }) })).json();
    const st = await (await get(w, cookieManager)).json();
    return JSON.stringify([(cfg.pins || []).map((r) => r.name + '·' + r.role), (st.staff || []).map((r) => r.name)]);
  };
  const probe = (pin) => publishAs(cookieManager, [...team, { name: 'Probe X', role: 'Caissière', pin }]);
  const hit = await probe('7803'), hitBody = await hit.text(), hitRoster = await roster();
  const miss = await probe('7804'), missBody = await miss.text(), missRoster = await roster();
  check(hit.status === miss.status && hitBody === missBody && hitRoster === missRoster && hitRoster.includes('Probe X·Caissière'),
    'collision avec le code du patron ou non : même réponse, même roster (Probe X y est dans les deux cas)');
  check((await (await pinVerify(w, '7803', {})).json()).staff.name === 'Nadia Patron', 'et le code du patron reste à lui seul : la ligne en collision porte un sceau mort');
}

/* ── 9g · Juge 6 : le patron apprend le code mort ; remplacer ou retirer un code propriétaire ── */
console.log('■ Code à refaire, code propriétaire remplacé ou retiré');
{
  const w = world();
  await activate(w);
  const publishAs = (cookie, pins, extra = {}, at = w) => config.onRequestPost({ env: at.env, request: req('/api/config', { method: 'POST', cookie, body: { merchant: SHOP, name: 'Café Droits', pins, ...extra } }) });
  const team = [{ name: 'Lina Saidi', role: 'Caissière', pin: CODES.caisse }, { name: 'Sara Alaoui', role: 'Manager', pin: CODES.manager }];
  const verifies = async (at, code) => { const j = await (await pinVerify(at, code, {})).json(); return j.ok ? j.staff.name : null; };
  /* Le gérant : rien ne change pour lui, collision ou non. */
  const mgr = await publishAs(cookieManager, [...team, { name: 'Probe X', role: 'Caissière', pin: CODES.owner }]);
  const mgrBody = await mgr.json(), mgrView = await (await get(w, cookieManager)).json();
  check(mgr.status === 200 && !('codesToRedo' in mgrBody) && !JSON.stringify(mgrView).includes('codeRedo') && !('ownerCodes' in mgrView),
    'gérant : ni sa réponse ni sa vue des droits ne disent qu’un code est mort');
  /* Le patron : sa réponse et son écran Droits nomment la personne, jamais le code. */
  const own = await publishAs(cookieOwner, [...team, { name: 'Karim Idrissi', role: 'Caissier', pin: CODES.owner }]);
  const ownBody = await own.json();
  check(own.status === 200 && JSON.stringify(ownBody.codesToRedo) === '["Karim Idrissi"]' && !JSON.stringify(ownBody).includes(CODES.owner),
    'patron : la réponse nomme Karim (code à refaire), sans le code');
  const ownView = await (await get(w, cookieOwner)).json();
  check(ownView.staff.filter((st) => st.codeRedo).map((st) => st.name).join() === 'Karim Idrissi' && await verifies(w, CODES.owner) === 'Nadia Patron',
    'patron : l’écran Droits marque Karim seul « code à refaire » ; le code n’ouvre que Nadia');
  const fixed = await publishAs(cookieOwner, [...team, { name: 'Karim Idrissi', role: 'Caissier', pin: '7811' }]);
  check(fixed.status === 200 && !('codesToRedo' in await fixed.json()) && !(await (await get(w, cookieOwner)).json()).staff.some((st) => st.codeRedo)
    && await verifies(w, '7811') === 'Karim Idrissi', 'un nouveau code pour Karim : il ouvre la caisse, plus rien à refaire');
  /* Un employé « Direction » publié par le patron, sans le signal : le code du patron reste, l'écran Droits montre les deux et retire le vieux. */
  const renamed = await publishAs(cookieOwner, [...team, { name: 'Nadia', role: 'Direction', pin: '7812' }]);
  const view2 = await (await get(w, cookieOwner)).json();
  check(renamed.status === 200 && await verifies(w, CODES.owner) === 'Nadia Patron' && Array.isArray(view2.ownerCodes) && view2.ownerCodes.length === 2
    && !/6201|7812|k2\$/.test(JSON.stringify(view2.ownerCodes)), 'sans le signal, les deux codes propriétaire restent ; l’écran Droits les liste, sans code ni empreinte');
  const old = view2.ownerCodes.find((o) => o.name === 'Nadia Patron');
  const selfView = await (await get(w, cookieNadia)).json();
  check(selfView.ownerCodes.find((o) => o.id === old.id).self === true && (await post(w, cookieNadia, { action: 'owner-row-remove', id: old.id })).status === 409,
    'la session ouverte par ce code ne le retire pas (own-code)');
  check((await post(w, cookieManager, { action: 'owner-row-remove', id: old.id })).status === 403 && await verifies(w, CODES.owner) === 'Nadia Patron',
    'un gérant ne retire pas un code propriétaire');
  const gone = await post(w, cookieOwner, { action: 'owner-row-remove', id: old.id });
  check(gone.status === 200 && await verifies(w, CODES.owner) === null && await verifies(w, '7812') === 'Nadia',
    'le patron retire l’ancien code : il n’ouvre plus rien, le nouveau marche');
  const view3 = await (await get(w, cookieOwner)).json();
  const lastId = w.sql.prepare('SELECT id FROM staff_pins WHERE merchant = ? AND name = ?').get(SHOP, 'Nadia').id;
  check(!('ownerCodes' in view3) && (await post(w, cookieOwner, { action: 'owner-row-remove', id: lastId })).status === 409 && await verifies(w, '7812') === 'Nadia',
    'jamais le dernier code propriétaire');
  check(view3.audit.some((a) => a.change.kind === 'owner-code-removed' && a.subjectLabel === 'Nadia Patron') && !/6201|7812/.test(JSON.stringify(view3.audit)),
    'le retrait entre au journal, sans code');
  /* Le signal « remplacer le propriétaire » (le wizard), au patron seul. */
  const w2 = world();
  await activate(w2);
  const noOwnerRow = await publishAs(cookieOwner, team, { replaceOwner: true }, w2);
  check(noOwnerRow.status === 200 && await verifies(w2, CODES.owner) === 'Nadia Patron', 'le signal sans ligne propriétaire ne retire rien : le compte garde son code de patron');
  const direction = await publishAs(cookieOwner, [...team, { name: 'Driss Alami', role: 'Direction', pin: '7823' }], {}, w2);
  check(direction.status === 200 && await verifies(w2, CODES.owner) === 'Nadia Patron', 'un employé « Direction » publié par le patron sans le signal n’efface pas le code du patron');
  const byManager = await publishAs(cookieManager, [...team, { name: 'Nadia Patron', role: 'Propriétaire', pin: '7821' }], { replaceOwner: true }, w2);
  check(await verifies(w2, CODES.owner) === 'Nadia Patron' && await verifies(w2, '7821') === null, 'un gérant qui envoie le signal ne remplace rien (' + byManager.status + ')');
  const wizard = await publishAs(cookieOwner, [...team, { name: 'Nadia B.', role: 'Propriétaire', pin: '7822' }], { replaceOwner: true }, w2);
  check(wizard.status === 200 && await verifies(w2, CODES.owner) === null && await verifies(w2, '7822') === 'Nadia B.' && await verifies(w2, '7823') === null,
    'le wizard du patron, nom et code changés : tous les anciens codes propriétaire partent, le nouveau ouvre');
}

/* ── 9e · Un code changé par un gérant, et la revue du patron ──────────── */
console.log('■ Code changé : retenue, journal, revue');
{
  const w = world();
  await activate(w);
  const lina0 = await person(w, 'm-lina');
  const base = (linaCode) => [{ name: 'Lina Saidi', role: 'Caissière', pin: linaCode }, { name: 'Hind Amrani', role: 'Responsable', pin: CODES.hind },
    { name: 'Sara Alaoui', role: 'Manager', pin: CODES.manager }];
  const publish = (pins) => config.onRequestPost({ env: w.env, request: req('/api/config', { method: 'POST', cookie: cookieManager, body: { merchant: SHOP, name: 'Café Droits', pins } }) });
  check((await publish(base(CODES.caisse))).status === 200 && !(await person(w, 'm-lina')).held, 'la page Équipe republie les mêmes codes : personne n’est retenu');
  const r = await publish(base('7761'));
  const lina = await person(w, 'm-lina');
  const st = await state(w);
  /* Sara a republié son propre code tel quel : il garde son identifiant, sa session garde son nom. */
  check(w.sql.prepare("SELECT id FROM staff_pins WHERE merchant = ? AND name = 'Sara Alaoui'").get(SHOP).id === 'pin-sara', 'un code republié tel quel garde son identifiant');
  check(r.status === 200 && lina.held === true && lina.perms.length === 0 && lina.heldBy.kind === 'session' && lina.heldBy.name === 'Sara Alaoui' && lina.heldBy.reason === 'code',
    'Sara change le code de Lina : Lina est retenue, « code changé par Sara Alaoui », même après deux publications : ' + JSON.stringify(lina.heldBy));
  check(st.audit.some((a) => a.change.kind === 'code-changed' && a.subject === 'staff:m-lina' && a.actor.name === 'Sara Alaoui'), 'le journal dit « code changé », par Sara');
  check(st.heldCount === 1, 'l’écran compte une personne à revoir');
  const refund = { kind: 'refund', refundId: 'rf-c', originalSaleId: 'sale-1', amountCents: 1000, refundMethod: 'cash' };
  check(!(await (await pinVerify(w, '7761', refund)).json()).approval, 'et le nouveau code ne porte aucun droit avant la revue');
  check(JSON.stringify(lina.heldPerms) === JSON.stringify(lina0.perms), 'l’aperçu de la revue montre ses droits d’avant, gardés en réserve');
  const rev = await post(w, cookieOwner, { action: 'review-held', keys: ['m-lina'] });
  const after = await person(w, 'm-lina');
  check(rev.status === 200 && after.held === false && JSON.stringify(after.perms) === JSON.stringify(lina0.perms), '« Revoir » : Lina retrouve exactement ses droits');
  check((await state(w)).audit[0].change.kind === 'review', 'la revue est au journal');
  check((await post(w, cookieManager, { action: 'review-held', keys: ['m-lina'] })).status === 403, 'seul le patron revoit');
  check((await post(w, cookieOwner, { action: 'review-held', keys: ['m-lina'] })).status === 409, 'rien à revoir deux fois');
}

/* ── 10 · Tables 0028 absentes : la règle d'avant, sans 503 ─────────────── */
console.log('■ Tables pas encore migrées');
{
  const w = world({ migrated: false });
  const st = await get(w, cookieOwner);
  const body = await st.json();
  check(st.status === 200 && body.missingTables === true && body.configured === false, 'l’écran s’ouvre et dit que les droits ne sont pas installés');
  check((await post(w, cookieOwner, { action: 'activate' })).status === 503, 'rien ne s’écrit (503 permissions-not-migrated)');
  const mgr = await (await pinVerify(w, CODES.manager, { kind: 'refund', refundId: 'rf-1', originalSaleId: 'sale-1', amountCents: 100, refundMethod: 'cash' })).json();
  const lina = await (await pinVerify(w, CODES.caisse, { kind: 'refund', refundId: 'rf-1', originalSaleId: 'sale-1', amountCents: 100, refundMethod: 'cash' })).json();
  check(mgr.ok && mgr.approval && !lina.approval, 'au comptoir : le gérant valide, la caissière non, comme avant');
  check(await tiers.tierBlock(req('/api/sales-summary?merchant=' + SHOP, { cookie: cookieManager }), w.env, '/api/sales-summary') === null, 'le palier décide comme avant');
  check(await perms.flagUnauthorized(w.env, SHOP, { id: 'pin-lina' }, 'money.cash', 'x') === false, 'rien n’est inscrit');
}

/* ── 11 · Chaque bascule a un effet, ou l'écran dit qu'elle n'en a pas côté serveur ── */
console.log('■ Couverture du catalogue');
{
  const held = Catalog.ALL.filter((id) => Catalog.BY_ID[id].check !== 'till');
  const missing = held.filter((id) => !proven.has(id));
  check(missing.length === 0, `les ${held.length} droits « serveur » ou « journal » sont tous prouvés contre une vraie route` + (missing.length ? ' (manque : ' + missing.join(', ') + ')' : ''));
}

console.log(`\nstaff-permissions-test · ${checks} vérifications`);
