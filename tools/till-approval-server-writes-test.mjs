#!/usr/bin/env node
/* Une approbation qui réussit puis se fait refuser : deux cas, un seul défaut.
 *
 *   node tools/till-approval-server-writes-test.mjs
 *
 * 1 · LA PASSATION. Le pavé disait « caissier, manager ou propriétaire », le
 *     serveur répondait 200 pour un manager, le pavé se fermait, et seulement
 *     alors confirmHandover refusait par un toast : « Le code saisi doit être
 *     celui de … ». Maintenant le pavé dit que le caissier ENTRANT confirme avec
 *     son propre code, et un 200 pour une autre personne est refusé SUR le pavé
 *     (points en danger, touches vivantes, haptique d'échec), sans le fermer.
 *
 * 2 · LES ACTES QUI SONT UNE ÉCRITURE SERVEUR SANS FILE D'ATTENTE : annuler une
 *     commande en ligne, rejeter une commande en ligne, annuler une table qui a
 *     une visite serveur ou un ticket envoyé. Hors ligne, le vérificateur salé
 *     approuvait le code, puis l'acte échouait. Maintenant ces actes ne prennent
 *     AUCUN code hors ligne : le pavé dit « Connexion requise · rien n'a
 *     changé », et rien ne se rejoue tout seul au retour du réseau.
 *
 * Le pavé, le vérificateur (assets/caisse-pairing.js) et la table des rôles
 * (assets/staff-roles.js) sont les vrais, dans un vrai Chromium. Seul
 * /api/pin/verify est simulé, avec des codes fabriqués pour cette suite. Aucun
 * commerce, aucun compte, aucun service réel n'est touché.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const caisse = read('kiwi-caisse.html');
const inbox = read('assets/orderpro-inbox.js');
const pairing = read('assets/caisse-pairing.js');
const lang = read('assets/caisse-lang.js');

const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
function between(src, from, to, label) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `${label}: début introuvable`);
  const b = src.indexOf(to, a);
  assert.ok(b > a, `${label}: fin introuvable`);
  return src.slice(a, b + to.length);
}

/* ── A · ce qui se lit dans la source (sans navigateur) ─────────────────── */
console.log('\nA · le câblage');

/* Les trois actes. Chacun passe l'option, et seul ce qui est une écriture
   serveur la passe : « Vider la commande » (un panier local) et la table sans
   rien d'envoyé continuent de prendre un code hors ligne. */
const cancelFn = between(caisse, 'function cancelOrderProTakeaway(o, authorizedWho = null)', 'function settleVrapPayment()', 'cancelOrderProTakeaway');
check(/requireTillOperator\(`Annuler la commande \$\{label\}`, proceed, TILL_NEEDS_SERVER\)/.test(cancelFn),
  'annuler une commande en ligne : le pavé exige le serveur');

const cancelTableAt = caisse.indexOf("else if (a === 'cancel-table')");
const vrapFrom = caisse.indexOf("if (mode === 'vrap')", cancelTableAt);
assert.ok(cancelTableAt > 0 && vrapFrom > cancelTableAt, 'branche Annuler du mode à emporter introuvable');
const vrapBranch = caisse.slice(vrapFrom, caisse.indexOf('if (selectedId) {', vrapFrom));
check(/liveOrder \? TILL_NEEDS_SERVER : undefined/.test(vrapBranch),
  'annuler la commande en cours : le serveur est exigé seulement pour une commande déjà partie');

const tableStart = caisse.indexOf('if (selectedId) {\n            if (storeIsReal()) {');
const tableEnd = caisse.indexOf("$$('.qa-btn, .act-pill')", tableStart);
assert.ok(tableStart > 0 && tableEnd > tableStart, 'branche Annuler une table introuvable');
const tableBranch = caisse.slice(tableStart, tableEnd);
const tablePads = tableBranch.match(/requireTillOperator\(`Annuler la table \$\{tid\} et prévenir la cuisine`[\s\S]*?\n\s*\}(?:, [^\n]*)?\);/g) || [];
check(tablePads.length === 2 && tablePads.every((p) => /tableCancelNeedsServer\(tid\) \? TILL_NEEDS_SERVER : undefined/.test(p)),
  'annuler une table avec visite ou ticket envoyé : les deux pavés (commerce réel ou non) exigent le serveur');
check(/requireTillOperator\(`Annuler la table \$\{tid\}`, \(who\) => \{\s*cancelOpenTable\(tid, who\);/.test(tableBranch)
  && !/requireTillOperator\(`Annuler la table \$\{tid\}`[\s\S]{0,200}TILL_NEEDS_SERVER/.test(tableBranch),
  'annuler une table sans rien d\'envoyé reste local : aucun besoin du serveur');

const archiveFn = between(caisse, 'function vrapArchivePaid(num) {', '\n    }\n', 'vrapArchivePaid');
check(/requireTillOperator\(`Retirer \$\{label\} du suivi`, \(who\) => \{[\s\S]*?opPush\(o, 'archived'[\s\S]*?TILL_NEEDS_SERVER\);/.test(archiveFn),
  'retirer une commande payée du suivi : le pavé exige le serveur (opPush « archived » est une écriture sans file)');

check(/KiwiAuthorizeTillAction\(action, function \(who\) \{[\s\S]*?\}, \{\s*needsServer: true,\s*onCancel: function \(\) \{ resolve\(\{ ok: false, cancelled: true \}\); \},\s*\}\);/.test(inbox),
  'rejeter une commande en ligne : le pavé exige le serveur et rend la main au bouton s\'il se ferme');
check(/if \(result && result\.cancelled\) \{ paint\(\); return null; \}/.test(inbox),
  '…et un pavé fermé ne laisse pas le bouton figé sur « Annulation… » ni ne montre un faux échec');

check(/requireTillOperator\(`Confirmer la passation · code personnel de \$\{inc\.name\}`, confirmHandover, \{\s*needsServer: storeIsReal\(\),\s*validate: handoverApprovalRefusal,\s*hint: 'Le caissier entrant confirme avec son propre code',\s*\}\);/.test(caisse),
  'la passation : sous-titre et ligne d\'aide nomment le caissier entrant, le pavé juge QUI, le serveur est exigé sur un vrai commerce');

/* Le vérificateur : l'option est transmise et le repli hors ligne ne l'approuve pas. */
check(/authorizeTill: function \(code, opts\)/.test(pairing)
  && /verifyCode\(code, undefined, opts && opts\.needsServer \? \{ needsServer: true \} : undefined\)/.test(pairing),
  'authorizeTill transmet needsServer au vérificateur');
check(/if \(opts && opts\.needsServer\) \{ lastVerify\.offline = true; return null; \}\s*return verifyOfflinePin\(merchant, code\);/.test(pairing),
  'le repli hors ligne n\'approuve jamais un acte qui exige le serveur');

/* Les chaînes : FR en clé, EN et AR en valeur, comme tout le dictionnaire. */
for (const key of ['code personnel de {x}', 'Le caissier entrant confirme avec son propre code', 'Code différent de celui du caissier entrant',
  'Connexion requise', 'Cette action a besoin d’une connexion. Rien n’a changé.', 'Réessayer', 'Toujours sans connexion · rien n’a changé']) {
  const m = lang.match(new RegExp("'" + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "': \\['([^']+)', '([^']+)'\\]"));
  check(!!(m && m[1] && m[2]), `dictionnaire EN + AR : « ${key} »`);
}

/* Le pavé a ses règles de style : dots en danger, état sans clavier. */
check(/#manager-modal\.is-error \.mgr-dot \{[^}]*var\(--danger\)/.test(caisse), 'les points passent au danger sur un refus du pavé');
check(/#manager-modal\.is-needs-connection \.mgr-pad/.test(caisse), 'l\'état « connexion requise » masque les touches');
check(/function nativeHapticDanger\(\) \{\s*try \{ window\.dispatchEvent\(new CustomEvent\('kiwi:native-haptic', \{ detail: \{ kind: 'danger' \} \}\)\); \} catch \(_\) \{\}/.test(caisse),
  'l\'haptique d\'échec est l\'événement « danger » que le shell natif traduit en ERROR');

/* La condition « cette table a besoin du serveur » : mêmes critères que
   cancelSentTable, sinon la caisse prendrait un code puis refuserait. */
{
  const fn = between(caisse, 'function tableCancelNeedsServer(id) {', '\n    }\n', 'tableCancelNeedsServer');
  const build = (over = {}) => {
    const ctx = { phoneSessionOf: () => '', tables: {}, tableSentCount: () => 0, canonicalOrdersForTable: () => [], kdsOrders: [], ...over };
    vm.createContext(ctx);
    vm.runInContext(fn + '\nthis.f = tableCancelNeedsServer;', ctx);
    return ctx.f;
  };
  check(build()('4') === false, 'table vide : se réalise en local');
  check(build({ phoneSessionOf: () => 'sess-1' })('4') === true, 'table avec une visite côté serveur : exige le serveur');
  check(build({ tables: { 4: { timerSession: 'sess-2' } } })('4') === true, 'table dont le chrono porte une visite : exige le serveur');
  check(build({ tableSentCount: () => 1 })('4') === true, 'table avec un ticket envoyé : exige le serveur (le cas « sans visite »)');
  check(build({ canonicalOrdersForTable: () => [{ id: 'o1' }] })('4') === true, 'table avec une commande canonique : exige le serveur');
  check(build({ kdsOrders: [{ type: 'dineIn', table: '4', paid: false, status: 'new' }] })('4') === true, 'table avec un ticket cuisine local non payé : exige le serveur');
  check(build({ kdsOrders: [{ type: 'dineIn', table: '4', paid: true }, { type: 'dineIn', table: '5', paid: false }, { type: 'dineIn', table: '4', paid: false, status: 'rejected' }] })('4') === false,
    'tickets payés, rejetés ou d\'une autre table : ne comptent pas');
}

/* ── B · le vrai pavé, le vrai vérificateur, un vrai Chromium ───────────── */
console.log('\nB · le pavé');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

/* Codes fabriqués pour cette suite : jamais un code réel. */
const INCOMING = '4826', MANAGER = '7391', UNKNOWN = '1357';
const WHO = {
  [INCOMING]: { id: 'st_salma', name: 'Salma', role: 'Caissier', actorProof: 'proof-incoming' },
  [MANAGER]: { id: 'st_rachid', name: 'Rachid', role: 'Manager', actorProof: 'proof-manager' },
};

/* Les extraits RÉELS de kiwi-caisse.html : le balisage du pavé, ses règles de
   style, son code, la haptique d'échec et le jugement de la passation. */
const padHtml = between(caisse, '<div class="modal-veil" id="manager-modal"', '<!-- ============ REMISE (DISCOUNT) MODAL', 'balisage du pavé').replace(/<!-- =+ REMISE[\s\S]*$/, '');
const padCss = caisse.slice(caisse.indexOf('    .mgr-dots {'), caisse.indexOf('    /* ===========================================================\n       === Remise'));
const padJs = between(caisse, 'const authorizations = [];', 'window.requireManager = requireManager;', 'code du pavé');
const hapticJs = between(caisse, 'function nativeHapticDanger() {', '\n    }\n', 'haptique d\'échec');
const identityJs = between(caisse, 'function handoverIdentity(value) {', '\n    }\n', 'handoverIdentity');
const refusalJs = between(caisse, 'function handoverApprovalRefusal(who) {', '\n    }\n', 'handoverApprovalRefusal');
check(padCss.includes('.mgr-needs') && padCss.includes('is-needs-connection'), 'les règles de style du pavé sont extraites');

const harness = `<!doctype html><html><head><meta charset="utf-8"><style>${padCss}</style></head><body>
${padHtml}
<script>
  localStorage.setItem('kiwiPaired', '1');
  localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'pad-test', name: 'Pad test' }));
  window.__toasts = []; window.__haptics = []; window.__approved = []; window.__cancelled = 0;
  window.addEventListener('kiwi:native-haptic', (e) => window.__haptics.push(e.detail && e.detail.kind));
</script>
<script src="/assets/staff-roles.js"></script>
<script src="/assets/caisse-pairing.js"></script>
<script>
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const toast = (m) => { window.__toasts.push(String(m)); };
  const currentCashier = { id: 'c0', name: 'Caissier', role: 'Caissier' };
  const storeIsReal = () => true;
  const handoverState = { incoming: { id: 'c1', name: 'Salma', role: 'Caissier' } };
  ${hapticJs}
  ${identityJs}
  ${refusalJs}
  ${padJs}
  const approve = (who) => { window.__approved.push(who && who.name); };
  window.openHandover = () => requireTillOperator('Confirmer la passation · code personnel de Salma', approve, {
    needsServer: true, validate: handoverApprovalRefusal, hint: 'Le caissier entrant confirme avec son propre code' });
  window.openServerWrite = () => requireTillOperator('Annuler la commande #12', approve, TILL_NEEDS_SERVER);
  window.openServerWriteCancelable = () => requireTillOperator('Rejeter la commande #12', approve, { needsServer: true, onCancel: () => { window.__cancelled++; } });
  window.openLocal = () => requireTillOperator('Vider la commande', approve);
</script></body></html>`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/harness') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(harness); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('till-approval-server-writes', { browser });

let verifyMode = 'normal';   // normal | down
let verifyCount = 0;
const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(tr) {
  const ctx = await browser.createBrowserContext();
  tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.origin !== base) return req.continue();
    if (u.pathname === '/api/pin/verify') {
      verifyCount++;
      if (verifyMode === 'down') return req.abort('failed');
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
      const who = WHO[body.pin];
      if (!who) return req.respond(json(401, { ok: false }));
      const { actorProof, ...staff } = who;
      return req.respond(json(200, { ok: true, staff, actorProof }));
    }
    return req.continue();
  });
  verifyMode = 'normal'; verifyCount = 0;
  await page.goto(base + '/harness', { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiCaissePairing && window.requireTillOperator !== undefined);
  return page;
}
const state = (page) => page.evaluate(() => {
  const m = document.querySelector('#manager-modal');
  const note = document.querySelector('#mgr-note'), needs = document.querySelector('#mgr-needs');
  return {
    open: m.classList.contains('is-open'), error: m.classList.contains('is-error'), needs: m.classList.contains('is-needs-connection'),
    note: note.hidden ? '' : note.textContent, needsShown: !needs.hidden, filled: document.querySelectorAll('#mgr-dots .is-filled').length,
    sub: document.querySelector('#manager-modal-sub').textContent, hint: document.querySelector('.mgr-hint').textContent,
    approved: window.__approved.slice(), toasts: window.__toasts.slice(), haptics: window.__haptics.slice(), cancelled: window.__cancelled,
    keysDisabled: Array.from(document.querySelectorAll('.mgr-key')).some((k) => k.disabled),
  };
});
async function typeCode(page, code) { for (const d of code) await page.click(`.mgr-key[data-mgr="${d}"]`); }

/* 1 · la passation ─────────────────────────────────────────────────────── */
await S.run('passation · le code d\'un manager est refusé SUR le pavé', async (t) => {
  const page = await open(t);
  t.step('ouvrir le pavé de passation');
  await page.evaluate(() => window.openHandover());
  let s = await state(page);
  check(s.open && s.sub === 'Confirmer la passation · code personnel de Salma', 'le sous-titre nomme le caissier entrant');
  check(s.hint === 'Le caissier entrant confirme avec son propre code', 'la ligne d\'aide dit que le caissier entrant confirme avec son propre code');
  check(!/manager|propriétaire/i.test(s.hint), '…et ne demande plus un manager ni le propriétaire');

  t.step('taper le code du manager (le serveur répond 200)');
  await typeCode(page, MANAGER);
  await page.waitForFunction(() => !document.querySelector('#mgr-note').hidden);
  s = await state(page);
  check(verifyCount === 1, 'le serveur a bien été interrogé et a répondu 200 pour un manager');
  check(s.open, 'le pavé reste ouvert');
  check(s.note === 'Code différent de celui du caissier entrant', 'le refus se lit sur le pavé');
  check(s.error, 'les points passent au danger');
  check(s.haptics.includes('danger'), 'l\'haptique d\'échec part');
  check(s.approved.length === 0, 'rien n\'est approuvé');
  check(!s.toasts.some((m) => /doit être celui/.test(m)), 'aucun toast de refus après coup');
  check(!s.keysDisabled, 'les touches restent actives');

  t.step('retaper, avec le bon code');
  await page.waitForFunction(() => document.querySelectorAll('#mgr-dots .is-filled').length === 0 && !document.querySelector('#manager-modal').classList.contains('is-error'));
  await typeCode(page, INCOMING);
  await page.waitForFunction(() => window.__approved.length === 1);
  s = await state(page);
  check(s.approved[0] === 'Salma', 'le code du caissier entrant est approuvé, et c\'est lui qui est nommé');
  await page.waitForFunction(() => !document.querySelector('#manager-modal').classList.contains('is-open'));
  check(s.cancelled === 0, 'une approbation n\'est pas un abandon');
});

/* 2 · hors ligne : aucun code n'est pris ───────────────────────────────── */
await S.run('actes serveur · hors ligne le pavé ne prend aucun code', async (t) => {
  const page = await open(t);
  t.step('couper le réseau, ouvrir « Annuler la commande »');
  await page.setOfflineMode(true);
  await page.evaluate(() => window.openServerWriteCancelable());
  let s = await state(page);
  check(s.open && s.needs && s.needsShown, 'le pavé s\'ouvre dans l\'état « Connexion requise »');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#mgr-pad')).display === 'none'), 'les touches ne sont pas affichées');
  check(await page.evaluate(() => /Rien n’a changé/.test(document.querySelector('#mgr-needs').textContent)), 'il dit que rien n\'a changé');

  t.step('taper au clavier : rien n\'est pris');
  for (const d of MANAGER) await page.keyboard.press(d);
  await sleep(200);
  s = await state(page);
  check(s.filled === 0, 'le clavier ne remplit aucun point');
  check(verifyCount === 0, 'aucune vérification n\'est envoyée');
  check(s.approved.length === 0, 'rien n\'est approuvé');

  t.step('le réseau revient : rien ne se rejoue tout seul');
  await page.setOfflineMode(false);
  await sleep(1500);
  s = await state(page);
  check(s.needs && verifyCount === 0 && s.approved.length === 0, 'au retour du réseau, l\'état est le même, sans vérification ni approbation');

  t.step('« Réessayer » rend le pavé, sans rien approuver');
  await page.click('#mgr-needs-retry');
  s = await state(page);
  check(!s.needs && s.open && s.approved.length === 0 && s.filled === 0, 'le pavé reparaît vide, il faut retaper le code');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#mgr-pad')).display !== 'none'), '…et ses touches sont là');

  t.step('fermer sans approuver rend la main à l\'appelant');
  await page.click('#manager-cancel');
  s = await state(page);
  check(!s.open && s.cancelled === 1 && s.approved.length === 0, 'la fermeture appelle onCancel une fois, sans approbation');
});

await S.run('actes serveur · Réessayer hors ligne ne fait rien', async (t) => {
  const page = await open(t);
  await page.setOfflineMode(true);
  await page.evaluate(() => window.openServerWrite());
  await page.click('#mgr-needs-retry');
  const s = await state(page);
  check(s.needs && s.toasts.some((m) => /Toujours sans connexion/.test(m)), 'tant que le réseau manque, « Réessayer » le dit et reste dans l\'état');
  await page.setOfflineMode(false);
});

/* 3 · en ligne mais muet : le repli salé ne doit pas approuver ───────────── */
await S.run('actes serveur · le repli hors ligne n\'approuve pas un acte serveur', async (t) => {
  const page = await open(t);
  t.step('prouver le code en ligne : le vérificateur garde une ligne salée');
  await page.evaluate(() => window.openLocal());
  await typeCode(page, INCOMING);
  await page.waitForFunction(() => window.__approved.length === 1);
  await page.waitForFunction(() => !document.querySelector('#manager-modal').classList.contains('is-open'));
  const rowKeys = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('kiwi:caisse:offline-pins:v1:'));
    return k ? JSON.parse(localStorage.getItem(k)).map((r) => Object.keys(r).sort().join(',')) : [];
  });
  check(rowKeys.length === 1 && rowKeys[0] === 'digest,expiresAt,salt,staff', 'la ligne salée ne porte ni code ni champ de code');

  t.step('serveur muet, navigateur « en ligne » : un acte LOCAL passe encore par le repli');
  verifyMode = 'down';
  await page.evaluate(() => window.openLocal());
  await typeCode(page, INCOMING);
  await page.waitForFunction(() => window.__approved.length === 2);
  check(true, 'témoin : le repli approuve toujours ce qui peut s\'exécuter hors ligne');
  await page.waitForFunction(() => !document.querySelector('#manager-modal').classList.contains('is-open'));

  t.step('même panne, acte qui écrit sur le serveur : pas d\'approbation');
  const before = verifyCount;
  await page.evaluate(() => window.openServerWriteCancelable());
  let s = await state(page);
  check(s.open && !s.needs, 'le navigateur se croit en ligne : le pavé s\'ouvre');
  await typeCode(page, INCOMING);
  await page.waitForFunction(() => document.querySelector('#manager-modal').classList.contains('is-needs-connection'));
  s = await state(page);
  check(verifyCount === before + 1, 'le serveur a été interrogé, et n\'a pas répondu');
  check(s.needsShown && s.approved.length === 2, 'le code que le serveur n\'a pas pu juger n\'est pas approuvé : « Connexion requise »');
  check(s.filled === 0, 'aucun chiffre n\'est gardé');

  t.step('le serveur revient : rien ne se rejoue');
  verifyMode = 'normal';
  const afterFail = verifyCount;
  await sleep(1500);
  s = await state(page);
  check(verifyCount === afterFail && s.approved.length === 2 && s.needs, 'aucune approbation ne repart toute seule');
});

await S.run('actes serveur · un mauvais code, serveur muet, ne passe pas non plus', async (t) => {
  const page = await open(t);
  verifyMode = 'down';
  await page.evaluate(() => window.openServerWriteCancelable());
  await typeCode(page, UNKNOWN);
  await page.waitForFunction(() => document.querySelector('#manager-modal').classList.contains('is-needs-connection'));
  const s = await state(page);
  check(s.approved.length === 0 && s.needsShown, 'sans serveur, aucun code n\'est jugé, bon ou mauvais');
});

await S.run('actes serveur · en ligne, le pavé garde son comportement', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.openServerWriteCancelable());
  let s = await state(page);
  check(s.open && !s.needs, 'en ligne, le pavé s\'ouvre normalement');
  await typeCode(page, UNKNOWN);
  await page.waitForFunction(() => window.__toasts.some((m) => /incorrect ou impossible à vérifier/.test(m)));
  s = await state(page);
  check(s.approved.length === 0 && !s.needs, 'un mauvais code reste « incorrect », pas « connexion requise »');
  await page.waitForFunction(() => document.querySelectorAll('#mgr-dots .is-filled').length === 0);
  await typeCode(page, INCOMING);
  await page.waitForFunction(() => window.__approved.length === 1);
  check(true, 'le bon code, en ligne, approuve l\'acte');
});

server.close();
await S.finish();
