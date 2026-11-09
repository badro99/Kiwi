#!/usr/bin/env node
/* Kiwi · vue réception (owner, 9 Nov 2026).
 *
 *   node tools/reception-view-test.mjs
 *
 * La réception d'un hôtel travaille dans le tableau de bord, réduit aux pages
 * du comptoir ; la caisse reste aux restaurants. Ce test tient :
 *   A. le serveur reconnaît un code de réceptionniste pour la vue réception,
 *      et pour RIEN d'autre (pas d'accord de responsable, pas de Face ID) ;
 *   B. le code d'une caissière n'ouvre toujours pas le tableau de bord ;
 *   C. la porte du dashboard range « Réceptionniste » au palier reception, et
 *      un rôle reception stocké ne retombe pas en vue patron au rechargement ;
 *   D. la vue garde exactement les pages du comptoir et ferme les autres.
 * Contrôles exécutés : vraies fonctions de functions/auth/_lib.js sur un D1
 * node:sqlite, fonctions extraites des fichiers livrés. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import {
  makeSession, SESS_COOKIE, verifyAccountPin, employeeRoleOpensDashboard, faceAccessTier,
} from '../functions/auth/_lib.js';
import { employeeRoleOpensReceptionView } from '../functions/auth/_reception.js';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' · ' + detail : ''));
}
console.log('■ Vue réception (tools/reception-view-test.mjs)');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SECRET = 'reception-view-test-secret-32b!!!';

/* ── A · le serveur ─────────────────────────────────────────────────────── */
for (const r of ['Réceptionniste', 'receptionniste', 'Réception', "Agent de réception"]) {
  ok(`« ${r} » ouvre la vue réception`, employeeRoleOpensReceptionView(r) === true);
  ok(`« ${r} » n'est PAS un rôle de responsable (remboursement, avoir, pressing)`, employeeRoleOpensDashboard(r) === false);
  ok(`« ${r} » n'obtient pas de marque Face ID`, faceAccessTier(r) === '');
}
for (const r of ['Caisse', 'Serveur', 'Gouvernante', 'Ménage & étages', 'Concierge', '']) {
  ok(`« ${r || '(vide)'} » n'ouvre pas la vue réception`, employeeRoleOpensReceptionView(r) === false);
}

function freshEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(read('schema.sql'));
  return {
    sql: db,
    AUTH_SECRET: SECRET,
    DB: {
      prepare(q) {
        let args = [];
        const st = {
          bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
          first() { const r = db.prepare(q).get(...args); return r === undefined ? null : r; },
          all() { return { results: db.prepare(q).all(...args) }; },
          run() { const r = db.prepare(q).run(...args); return { success: true, meta: { changes: r.changes } }; },
        };
        return st;
      },
      async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    },
  };
}
async function hotelEnv() {
  const env = freshEnv();
  const now = Date.now();
  env.sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-h','h@t.ma','H','Riad Test','00','00',?)").run(now);
  env.sql.prepare("INSERT INTO merchant_config (merchant,features,account_id,name,updated_ts) VALUES ('riad-test','{}','acc-h','Riad Test',?)").run(now);
  const pin = (id, code, name, role) => env.sql.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)').run(id, 'riad-test', code, name, role, now);
  pin('p1', '4821', 'Patron', 'owner');
  pin('p2', '5930', 'Yassine', 'Réceptionniste');
  pin('p3', '6047', 'Salma', 'Caisse');
  /* Deux personnes, un même code : le palier le plus haut l'emporte. */
  pin('p4', '7158', 'Nadia', 'Réceptionniste');
  pin('p5', '7158', 'Karim', 'manager');
  const token = await makeSession('acc-h', SECRET);
  const request = () => new Request('https://kiwi.test/api/pin/verify', { headers: { cookie: `${SESS_COOKIE}=${token}`, 'CF-Connecting-IP': '192.0.2.9' } });
  return { env, request };
}
{
  const { env, request } = await hotelEnv();
  const rec = await verifyAccountPin(request(), env, '5930');
  ok('le code de la réceptionniste ouvre le tableau de bord', rec.ok === true, JSON.stringify(rec));
  ok('… et dit qui elle est, avec son rôle (jamais le code)', rec.ok && rec.staff.name === 'Yassine' && rec.staff.role === 'Réceptionniste' && !JSON.stringify(rec).includes('5930'));
  const cash = await verifyAccountPin(request(), env, '6047');
  ok('le code de la caissière n\'ouvre toujours pas le tableau de bord', cash.ok === false && cash.status === 401, JSON.stringify(cash));
  const shared = await verifyAccountPin(request(), env, '7158');
  ok('un code partagé réceptionniste + gérant ouvre au palier gérant', shared.ok === true && shared.staff.role === 'manager', JSON.stringify(shared));
}

/* ── C · la porte du dashboard ─────────────────────────────────────────── */
const html = read('dashboard.html');
{
  const m = html.match(/function accessTier\(raw\) \{[\s\S]*?\n  \}/);
  ok('dashboard.html › accessTier() trouvée', !!m);
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('assets/staff-roles.js'), ctx);
  vm.runInContext(m[0] + '; this.accessTier = accessTier;', ctx);
  const tier = ctx.accessTier;
  ok('« Réceptionniste » → palier reception', tier('Réceptionniste') === 'reception');
  ok('« Agent de réception » → palier reception', tier('Agent de réception') === 'reception');
  ok('« Caisse » → palier staff (refusé à la porte)', tier('Caisse') === 'staff');
  ok('« manager » → palier manager (inchangé)', tier('manager') === 'manager');
  ok('« owner » → palier owner (inchangé)', tier('owner') === 'owner');
}
/* Le script de démarrage (rôle stocké → classe sur body), exécuté. */
function bootWith(stored) {
  const m = html.match(/<script>\n\(function \(\) \{\n  let role = 'owner';[\s\S]*?\n\}\)\(\);/);
  if (!m) return null;
  const added = [], classes = new Set();
  const doc = {
    body: { classList: { add: (c) => classes.add(c) } },
    head: { appendChild: (el) => added.push(el) },
    querySelector: (sel) => (sel === 'script[data-reception-view]' ? added.find((e) => 'data-reception-view' in e.attrs) || null : null),
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
  };
  const ctx = { document: doc, localStorage: { getItem: () => stored } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(m[0].replace(/^<script>\n/, ''), ctx);
  return { role: ctx.__kiwiRole, classes: [...classes], scripts: added.map((e) => e.src) };
}
{
  const rec = bootWith('reception');
  ok('script de démarrage trouvé', !!rec);
  ok('un rôle reception stocké reste reception au rechargement (pas de retour à la vue patron)', rec && rec.role === 'reception' && rec.classes.includes('role-reception'), JSON.stringify(rec));
  ok('… et charge la vue réception', rec && rec.scripts.length === 1 && /^assets\/reception-view\.js\?v=\d+$/.test(rec.scripts[0]), JSON.stringify(rec && rec.scripts));
  const own = bootWith('owner');
  ok('le patron ne télécharge pas la vue réception', own && own.role === 'owner' && own.scripts.length === 0, JSON.stringify(own));
  const junk = bootWith('superadmin');
  ok('un rôle inconnu stocké reste la vue démo patron, sans vue réception', junk && junk.role === 'owner' && junk.scripts.length === 0);
}

/* ── D · la vue, exécutée sur un document minimal ──────────────────────── */
function receptionView(role) {
  const listeners = {}, toasts = [], calls = [], ticks = [];
  const bodyClasses = new Set([role ? 'role-' + role : 'role-owner']);
  const doc = {
    readyState: 'complete',
    body: { classList: { contains: (c) => bodyClasses.has(c) } },
    head: { appendChild() {} },
    documentElement: { appendChild() {} },
    createElement: () => ({}),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const H = {};
  for (const k of ['nav-reception', 'nav-chambres', 'nav-sejours', 'nav-menage', 'nav-folios', 'nav-reservations',
    'nav-accueil', 'nav-transactions', 'nav-rapport', 'nav-equipe', 'nav-payroll', 'nav-economat', 'nav-tarifs',
    'nav-canaux', 'nav-hotelintel', 'nav-points-vente', 'clients-directory', 'customer-retention', 'open-assistant',
    'settings', 'account-billing', 'account-profile', 'folio-add-charge']) H[k] = () => { calls.push(k); };
  const ctx = {
    document: doc, console,
    Kiwi: { handlers: H, toast: (m) => toasts.push(m), setActivePage() {} },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    MutationObserver: class { observe() {} },
    setInterval: (fn) => { ticks.push(fn); return 0; }, clearTimeout() {}, setTimeout: (fn) => { fn(); return 0; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('assets/reception-view.js'), ctx);
  const click = (attrs) => {
    let stopped = false;
    const el = { getAttribute: (k) => (k in attrs ? attrs[k] : null) };
    const target = { closest: (sel) => (sel.split(',').some((s) => {
      const name = s.replace(/^\[|\]$/g, '').replace(/^#/, 'id=');
      return name.startsWith('id=') ? attrs.id === name.slice(3) : name in attrs;
    }) ? el : null) };
    (listeners.click || []).forEach((fn) => fn({ target, preventDefault() {}, stopImmediatePropagation() { stopped = true; } }));
    return stopped;
  };
  return { H, calls, toasts, click, sweep: () => ticks.forEach((fn) => fn()) };
}
{
  const v = receptionView('reception');
  for (const k of ['nav-reception', 'nav-chambres', 'nav-sejours', 'nav-menage', 'nav-folios', 'nav-reservations', 'clients-directory', 'folio-add-charge']) {
    v.calls.length = 0; v.H[k]();
    ok(`la réception ouvre « ${k} »`, v.calls.includes(k));
  }
  for (const k of ['nav-transactions', 'nav-rapport', 'nav-equipe', 'nav-payroll', 'nav-economat', 'nav-tarifs', 'nav-canaux',
    'nav-hotelintel', 'nav-points-vente', 'customer-retention', 'open-assistant', 'settings', 'account-billing', 'account-profile']) {
    v.calls.length = 0; v.toasts.length = 0; v.H[k]();
    ok(`la réception n'ouvre pas « ${k} » et le dit`, !v.calls.includes(k) && v.toasts.length === 1);
  }
  for (const k of ['search', 'settings-hours', 'account-security', 'payroll-run', 'finance-export', 'team-add', 'export-csv']) {
    v.H[k] = () => { v.calls.push(k); };
  }
  /* Le balayage repasse : les handlers ajoutés après coup sont fermés aussi. */
  v.sweep();
  for (const k of ['search', 'settings-hours', 'account-security', 'payroll-run', 'finance-export', 'team-add', 'export-csv']) {
    v.calls.length = 0; v.toasts.length = 0; v.H[k]();
    ok(`famille d'actions du patron « ${k} » fermée (préfixe)`, !v.calls.includes(k) && v.toasts.length === 1);
  }
  v.calls.length = 0; v.H['nav-accueil']();
  ok('Accueil ramène la réception à la Réception, jamais au chiffre d\'affaires', v.calls.join() === 'nav-reception', v.calls.join());
  ok('un lien Encaissements de la barre latérale est arrêté avant le routeur', v.click({ 'data-nav': 'transactions' }) === true);
  ok('un lien Plan des chambres passe', v.click({ 'data-nav': 'chambres' }) === false);
  ok('Hospitality+ (fiches clients) passe', v.click({ 'data-action': 'clients-directory' }) === false);
  ok('l\'onglet « Nouvelle vente » du téléphone est arrêté', v.click({ 'data-kw-tab': 'vente' }) === true);
  ok('l\'onglet « Commandes » du téléphone est arrêté', v.click({ 'data-kw-tab': 'commandes' }) === true);
  ok('l\'onglet « Menu » du téléphone passe', v.click({ 'data-kw-tab': 'menu' }) === false);
  ok('« Connecter la caisse » est arrêté', v.click({ id: 'kcl-chip' }) === true);
}
{
  const v = receptionView('owner');
  for (const k of ['nav-transactions', 'nav-equipe', 'settings', 'open-assistant', 'nav-accueil']) {
    v.calls.length = 0; v.H[k]();
    ok(`le patron ouvre toujours « ${k} »`, v.calls.includes(k) && v.toasts.length === 0);
  }
  ok('le patron clique Encaissements sans être arrêté', v.click({ 'data-nav': 'transactions' }) === false);
}

{
  const files = ['assets/hotel.js', 'assets/reservations.js', 'assets/clients-directory.js']
    .concat(fs.readdirSync(path.join(ROOT, 'assets/hotel-core')).map((f) => 'assets/hotel-core/' + f))
    .concat(fs.readdirSync(path.join(ROOT, 'assets/hotel')).map((f) => 'assets/hotel/' + f))
    .filter((f) => f.endsWith('.js'));
  const src = read('assets/reception-view.js');
  const prefixes = vm.runInNewContext(src.match(/var DENY_PREFIX = (\[[^\]]*\]);/)[1]);
  const used = new Set();
  for (const f of files) for (const m of read(f).matchAll(/data-action=["']([a-z0-9-]+)/g)) used.add(m[1]);
  /* Les refus nommés (campagne, fidélisation) sont voulus : ce sont les boutons
     marketing de la page clients. */
  const named = Object.keys(vm.runInNewContext('(' + src.match(/var ACTION_DENY = (\{[^}]*\});/)[1] + ')'));
  const clash = [...used].filter((a) => !named.includes(a) && prefixes.some((p) => a.startsWith(p)));
  ok(`aucune action des pages du comptoir ne tombe sous un préfixe fermé (${used.size} actions lues)`, used.size > 20 && clash.length === 0, clash.join(','));
}

if (failures) { console.log(`\n✗ ${failures} échec(s)`); process.exit(1); }
console.log('\n✓ vue réception tenue');
