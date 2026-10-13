#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · le dashboard ne garde aucun code en clair, et n'en compare aucun.
 *
 *   node tools/dashboard-pin-vault-test.mjs
 *
 * Constat (docs/audits/design-2026-10/direction-critique-16.md, M2) : `kiwiPins`
 * portait { role, code, name } en clair dans localStorage, et la porte du
 * dashboard comparait le code frappé à ce code AVANT le serveur. CLAUDE.md §6 :
 * « un code de quatre chiffres se compare côté serveur, nulle part ailleurs ».
 *
 * Trois étages :
 *   1 · le balayage : aucun fichier livré ne lit ni n'écrit `kiwiPins` (seuls
 *       l'effacent), et la porte ne contient plus aucune comparaison de code à
 *       un code ;
 *   2 · le coffre (assets/dashboard-pin-vault.js), exécuté tel que livré dans
 *       un bac à sable avec un vrai SubtleCrypto : jamais le code, jamais avant
 *       la preuve, 7 jours, 12 lignes, un compte, la migration ;
 *   3 · la porte : l'ordre des juges (serveur d'abord, ligne salée seulement si
 *       le serveur n'a pas pu répondre, un « non » est final).
 * Le pavé réel, hors ligne, est tenu par dashboard-pin-vault-browser-test.mjs.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ ${msg}`); }
}

/* Des commentaires ôtés : une phrase qui NOMME kiwiPins n'est pas un accès. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

console.log('■ Dashboard pin vault test (tools/dashboard-pin-vault-test.mjs)');

/* ── 1 · le balayage ─────────────────────────────────────────────────────── */
console.log('1 · balayage des fichiers livrés');
const shipped = [];
for (const f of fs.readdirSync(ROOT)) if (/\.(html|js)$/.test(f)) shipped.push(f);
for (const dir of ['assets', 'functions']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true })) {
    if (typeof f === 'string' && /\.(js|html|mjs)$/.test(f)) shipped.push(path.join(dir, f));
  }
}
/* Tout appel `quelquechose('kiwiPins'…)` : seul un effacement est permis. */
const callOnKey = /([\w$.]+)\(\s*['"]kiwiPins['"]/g;
const DELETES = /(^|\.)(removeItem|del)$/;
const offenders = [];
for (const rel of shipped) {
  const src = stripComments(read(rel));
  let m;
  while ((m = callOnKey.exec(src))) if (!DELETES.test(m[1])) offenders.push(`${rel} · ${m[1]}('kiwiPins')`);
  if (/localStorage\s*\[\s*['"]kiwiPins['"]/.test(src)) offenders.push(`${rel} · localStorage['kiwiPins']`);
}
ok(offenders.length === 0, 'aucun fichier livré ne lit ni n\'écrit kiwiPins (seulement removeItem / del)' + (offenders.length ? ' : ' + offenders.join(' ; ') : ''));

/* L'assistant d'installation ne réécrit jamais le clair. */
const onboarding = stripComments(read('assets/onboarding.js'));
ok(!/LS\.set\(\s*['"]kiwiPins['"]/.test(onboarding) && /LS\.del\(\s*['"]kiwiPins['"]/.test(onboarding),
  'onboarding.js n\'écrit plus kiwiPins et balaie ce qui en reste');
ok(/'kiwiPins'/.test(read('assets/tenant-purge.js')), 'la purge de locataire efface encore kiwiPins (reliquats d\'avant)');

/* Le brouillon de l'assistant, lui, a toujours vidé les codes. */
ok(/name: String\(\(p && p\.name\) \|\| ''\)\.slice\(0, 20\), code: ''/.test(read('assets/onboarding.js')),
  'le brouillon de l\'assistant n\'enregistre aucun code');

/* La porte du dashboard. */
const html = read('dashboard.html');
const ctlStart = html.indexOf('<!-- PIN lock + greeting flash controller -->');
const ctl = stripComments(html.slice(html.indexOf('<script>', ctlStart) + 8, html.indexOf('</script>', ctlStart)));
ok(!/\ballPins\b|\bconfiguredPins\b/.test(ctl), 'la porte n\'a plus allPins() ni configuredPins()');
ok(!/localStorage\.(get|set)Item\(\s*['"]kiwiPins/.test(ctl), 'la porte ne touche pas kiwiPins');
ok(!/\b\w+\.(code|pin)\s*[!=]==?\s*(val|code)\b/.test(ctl) && !/\b(val|code)\s*[!=]==?\s*\w+\.(code|pin)\b/.test(ctl),
  'la porte ne compare aucun code à la propriété .code / .pin d\'un objet');
ok(/fetch\('\/api\/pin\/verify'/.test(ctl), 'la porte soumet le code frappé à /api/pin/verify');
ok(/<script defer src="assets\/dashboard-pin-vault\.js\?v=\d+"><\/script>/.test(html), 'dashboard.html charge le coffre');
ok(/'\/assets\/dashboard-pin-vault\.js\?v=\d+'/.test(read('kiwi-sw.js')), 'le coffre est dans la coquille hors ligne (kiwi-sw.js SHELL)');

/* ── 2 · le coffre, tel que livré ───────────────────────────────────────── */
console.log('2 · le coffre');
const vaultSrc = read('assets/dashboard-pin-vault.js');
const store = new Map();
let now = Date.UTC(2026, 9, 13, 10, 0, 0);
function load(preset = {}) {
  store.clear();
  for (const [k, v] of Object.entries(preset)) store.set(k, v);
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const FakeDate = class extends Date { static now() { return now; } };
  const sandbox = { localStorage, crypto: webcrypto, TextEncoder, Date: FakeDate, Promise, JSON, Array, Object, String, Number, Uint8Array };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(vaultSrc, sandbox);
  return sandbox.window.KiwiDashPinVault;
}
const OWNER = { id: 'st_owner', name: 'Amira', role: 'owner' };
const CODE = '7391';   // une valeur d'essai, jamais un code réel
const scopeKey = (v) => v.storageKey();
/* Les valeurs BRUTES : un JSON.stringify des paires échapperait les guillemets des lignes
   et un code en clair passerait sous les regex. */
const allStored = () => [...store.entries()].map(([k, v]) => `${k}=${v}`).join('\n');

{
  const v = load({ kiwiAccountKey: 'Owner@Example.com' });
  ok(v.count() === 0, 'un navigateur neuf ne connaît aucun code');
  ok(await v.remember(CODE, OWNER) === true, 'remember écrit une ligne');
  const blob = allStored();
  ok(!blob.includes(`"${CODE}"`) && !new RegExp(`"(code|pin|pinCode|password)"\\s*:`).test(blob), 'rien de stocké ne porte le code, ni une clé code / pin / password');
  ok([...store.keys()].filter((k) => /dashboard/.test(k)).every((k) => k.startsWith('kiwi:')), 'la clé est sous kiwi: (la purge de locataire l\'emporte)');
  ok(scopeKey(v).endsWith(encodeURIComponent('owner@example.com')), 'la clé nomme le compte, en minuscules');
  const row = JSON.parse(store.get(scopeKey(v)))[0];
  ok(/^[0-9a-f]{64}$/.test(row.digest) && /^[0-9a-f]{32}$/.test(row.salt), 'une ligne = sel de 16 octets + SHA-256');
  ok(row.expiresAt - now === 7 * 24 * 3600 * 1000, 'valable 7 jours depuis la preuve');
  ok(v.count() === 1, 'count() lit sans rien hacher');
  const who = await v.verify(CODE);
  ok(who && who.id === 'st_owner' && who.name === 'Amira' && who.role === 'owner', 'verify rend l\'identité prouvée');
  ok(await v.verify('0000') === null && await v.verify('7392') === null, 'un autre code ne passe pas');
  ok(await v.verify('73') === null && await v.verify('abcd') === null && await v.verify('') === null, 'un code mal formé ne passe pas');
  ok(await v.remember('12', OWNER) === false && await v.remember('abcd', OWNER) === false && v.count() === 1, 'remember refuse ce qui n\'est pas quatre chiffres');
}
{
  /* Le compte : sans compte, rien ; un autre compte, rien. */
  const v = load({});
  ok(await v.remember(CODE, OWNER) === false && store.size === 0, 'sans kiwiAccountKey, remember n\'écrit rien');
  const w = load({ kiwiAccountKey: 'a@x.com' });
  await w.remember(CODE, OWNER);
  const raw = store.get(w.storageKey());
  store.set('kiwiAccountKey', 'b@x.com');
  ok(await w.verify(CODE) === null && w.count() === 0, 'les lignes d\'un compte n\'ouvrent rien pour un autre');
  store.set(`kiwi:dashboard:offline-pins:v1:${encodeURIComponent('b@x.com')}`, raw);
  ok(await w.verify(CODE) === null, 'même la ligne copiée sous la clé d\'un autre compte ne passe pas : le condensat nomme le compte');
}
{
  /* Sept jours. */
  const v = load({ kiwiAccountKey: 'a@x.com' });
  await v.remember(CODE, OWNER);
  now += 7 * 24 * 3600 * 1000 - 1000;
  ok(await v.verify(CODE) !== null, 'une seconde avant le septième jour, la ligne vaut encore');
  now += 2000;
  ok(await v.verify(CODE) === null && v.count() === 0, 'passé sept jours, la ligne ne vaut plus et ne compte plus');
  await v.remember(CODE, OWNER);
  now += 6 * 24 * 3600 * 1000;
  await v.remember(CODE, OWNER);
  now += 6 * 24 * 3600 * 1000;
  ok(await v.verify(CODE) !== null, 'une nouvelle preuve en ligne repousse l\'échéance');
}
{
  /* Douze lignes, une par personne, un code une identité. */
  const v = load({ kiwiAccountKey: 'a@x.com' });
  for (let i = 0; i < 15; i++) await v.remember(String(1000 + i), { id: 'p' + i, name: 'P' + i, role: 'manager' });
  ok(v.count() === 12, 'douze lignes au plus');
  ok(await v.verify('1000') === null && await v.verify('1014') !== null, 'les plus récentes sont gardées');
  const w = load({ kiwiAccountKey: 'a@x.com' });
  await w.remember('4821', { id: 'same', name: 'Sara', role: 'manager' });
  await w.remember('4822', { id: 'same', name: 'Sara', role: 'manager' });
  ok(w.count() === 1 && await w.verify('4821') === null && await w.verify('4822') !== null, 'un code changé remplace l\'ancien de la même personne');
  await w.remember('4822', { id: 'other', name: 'Autre', role: 'owner' });
  ok(w.count() === 1 && (await w.verify('4822')).id === 'other', 'un code n\'a qu\'une identité');
}
{
  /* Un « non » du serveur efface la ligne. */
  const v = load({ kiwiAccountKey: 'a@x.com' });
  await v.remember(CODE, OWNER);
  await v.remember('2468', { id: 'm', name: 'M', role: 'manager' });
  ok(await v.forget(CODE) === 1 && await v.verify(CODE) === null && await v.verify('2468') !== null, 'forget ne retire que la ligne de ce code');
  ok(await v.forget('9999') === 0, 'forget d\'un code inconnu ne fait rien');
  await v.forget('2468');
  ok(!store.has(v.storageKey()), 'la dernière ligne partie, la clé disparaît');
}
{
  /* La migration : le clair part, sans conversion. */
  const legacy = JSON.stringify([{ role: 'owner', code: CODE, name: 'Amira' }, { role: 'staff', code: '2580', name: 'Sara' }]);
  const v = load({ kiwiAccountKey: 'a@x.com', kiwiPins: legacy });
  ok(!store.has('kiwiPins'), 'au chargement, kiwiPins en clair est supprimé');
  ok(v.count() === 0 && await v.verify(CODE) === null && await v.verify('2580') === null, 'et rien n\'est converti : ces codes n\'ont jamais été prouvés');
  ok(!allStored().includes(CODE) && !allStored().includes('2580'), 'aucun code ne subsiste dans le stockage');
  const none = load({ kiwiAccountKey: 'a@x.com' });
  ok(none.dropLegacy() === false, 'dropLegacy sans reliquat ne fait rien');
}
{
  /* Hors ligne, le pavé compte les essais : cinq refus, cinq minutes. */
  const v = load({ kiwiAccountKey: 'a@x.com' });
  await v.remember(CODE, OWNER);
  for (let i = 0; i < 4; i++) await v.verify('100' + i);
  ok(v.lockedFor() === 0 && (await v.verify(CODE)) !== null, 'quatre refus de suite ne bloquent pas, et le bon code remet le compteur à zéro');
  for (let i = 0; i < 5; i++) await v.verify('200' + i);
  ok(v.lockedFor() > 0 && v.lockedFor() <= 300, 'le cinquième refus de suite ferme le repli salé pour cinq minutes');
  ok(await v.verify(CODE) === null, 'pendant la pause, même le bon code ne passe pas');
  now += 5 * 60 * 1000 - 1000;
  ok(await v.verify(CODE) === null, 'une seconde avant la fin, la pause tient');
  now += 2000;
  ok(v.lockedFor() === 0 && (await v.verify(CODE)) !== null, 'la pause passée, le bon code ouvre et le compteur repart');
  ok([...store.keys()].filter((k) => /offline-fails/.test(k)).every((k) => k.startsWith('kiwi:')), 'le compteur vit sous kiwi: (purge de locataire)');
  const bare = load({ kiwiAccountKey: 'b@x.com' });
  for (let i = 0; i < 8; i++) await bare.verify('300' + i);
  ok(bare.lockedFor() === 0, 'sans aucune ligne il n\'y a rien à deviner : aucun compteur ne tourne');
}
{
  /* Pas de SubtleCrypto : on n'écrit rien plutôt que le code. */
  const sandbox = { localStorage: { getItem: (k) => (k === 'kiwiAccountKey' ? 'a@x.com' : null), setItem() { throw new Error('ne doit rien écrire'); }, removeItem() {} }, Date, Promise, JSON, Array, Object, String, Number, Uint8Array, crypto: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(vaultSrc, sandbox);
  ok(await sandbox.window.KiwiDashPinVault.remember(CODE, OWNER) === false, 'sans SubtleCrypto, remember n\'écrit rien (jamais le code à la place)');
}

/* ── 3 · la porte : l'ordre des juges ───────────────────────────────────── */
console.log('3 · la porte');
const settleAt = ctl.indexOf('askServer(val).then');
const flow = ctl.slice(ctl.indexOf('const askable = '), ctl.indexOf('function finishUnlock'));
ok(settleAt > 0 && flow.indexOf('askServer(val)') < flow.indexOf('localVerify(val)'), 'le serveur est interrogé AVANT la ligne salée');
ok(/if \(answer === null\) \{[\s\S]*?localVerify\(val\)/.test(flow), 'la ligne salée n\'est lue que sur une réponse null (serveur injoignable)');
ok(/vaultNote\(val, answer\);\s*\n\s*if \(answer && answer !== 'no'\)/.test(flow), 'le coffre est mis à jour sur la réponse du serveur, avant d\'ouvrir');
ok(/const wait = offlineWait\(\);\s*\n\s*if \(wait > 0\) \{ rejectPin\('busy', wait\); return; \}/.test(flow) && flow.indexOf('offlineWait()') < flow.indexOf('localVerify(val)'), 'le repli salé est précédé de sa pause d\'essais'); 
ok(/answer === 'no'\) v\.forget\(code\)/.test(ctl), 'un « non » du serveur efface la ligne de ce code');
ok(/answer && typeof answer === 'object'\) v\.remember\(code, \{ id: answer\.id, name: answer\.name, role: answer\.role \}\)/.test(ctl), 'seule une identité prouvée par le serveur est écrite, sans le code');
ok(/if \(navigator\.onLine === false\) return Promise\.resolve\(null\);/.test(ctl), 'hors ligne : réponse null tout de suite, sans attendre un délai');
ok(/setTimeout\(\(\) => ctl\.abort\(\), ASK_TIMEOUT_MS\)/.test(ctl), 'un serveur muet ne suspend pas le pavé (délai)');
ok(/if \(answer === 'no' && !demosOn\(\)\) \{ rejectPin\(\); return; \}/.test(flow) && !/onboardedHere|knownHere/.test(ctl),
  'un « non » du serveur est final hors démo : ni la liste du compte, ni le coffre, ni un drapeau du navigateur ne le contredisent');
ok(/d\.configured === false \? 'unconfigured' : 'no'/.test(ctl) && /if \(answer === 'unconfigured'\) \{ settle\(answer\); return; \}/.test(flow),
  'seul le serveur dit « ce compte n\'a aucun code » (champ absent = configuré = porte fermée)');
/* Un 401 n'est un « non » que si le corps le dit. Une session morte ne juge aucun code. */
const askFn = ctl.slice(ctl.indexOf('function askServer(code)'), ctl.indexOf('function localVerify'));
ok(/if \(why === 'bad-pin'\) return d\.configured === false \? 'unconfigured' : 'no';/.test(askFn),
  'seule la réponse { error: \'bad-pin\' } est un « non » (c\'est ce qui efface une ligne salée)');
ok(/why === 'unauthorized' \|\| why === 'account-revoked'\) return 'signed-out'/.test(askFn),
  '{ error: \'unauthorized\' } et { error: \'account-revoked\' } sont « session morte », pas « non »');
ok(/\(\) => \(r\.status === 401 \? 'signed-out' : null\)/.test(askFn),
  'un 401 en HTML (la page de connexion du portier) est « session morte » ; un 403 illisible est « on n\'a pas pu savoir »');
ok(!/r\.status === 401 \|\| r\.status === 403\) \{\s*[^}]*'no'\)\);/.test(askFn) && /return null;\s*\}, \(\) =>/.test(askFn),
  'un 401 / 403 inconnu n\'est plus un « non » par défaut');
ok(/if \(answer === 'signed-out'\) \{ settle\(answer\); return; \}/.test(flow)
  && flow.indexOf("if (answer === 'signed-out')") < flow.indexOf('vaultNote(val, answer)'),
  'session morte : la réponse sort AVANT le coffre, qui n\'oublie rien');
ok(/answer === 'signed-out' && !demosOn\(\)\) \{ rejectPin\('signed-out'\); return; \}/.test(flow)
  && /reason === 'signed-out'/.test(ctl) && /Sign in again/.test(ctl),
  'hors démo la porte reste fermée et dit « session expirée » (FR, EN, AR), sans « code incorrect »');
const lib = read('functions/auth/_lib.js');
const vapSrc = lib.slice(lib.indexOf('export async function verifyAccountPin'), lib.indexOf('export async function verifyAccountPin') + 6000);
ok(/let configured = true;/.test(vapSrc) && /catch \(__\) \{ configured = true; \}/.test(vapSrc) && /error: 'bad-pin', status: 401, configured/.test(vapSrc),
  'serveur : « configuré » par défaut, « aucun code » seulement sur une requête réussie qui ne rend rien');
ok(!/SELECT[^;]*\bp\.pin\b[^;]*FROM staff_pins p LEFT JOIN merchant_config c ON c\.merchant = p\.merchant WHERE c\.account_id = \? OR p\.merchant = \? LIMIT 1/.test(vapSrc), 'la requête « configuré » ne ramène aucun code');
ok(/configured === false \? \{ configured: false \} : \{\}/.test(read('functions/api/pin/verify.js')), 'verify.js ne rapporte que « configured: false »');
ok(/function vault\(\) \{ return scopedView\(\) \? null/.test(ctl), 'jamais lu ni écrit sur une vue portée (?op= / ?merchant=)');
ok(/if \(access === 'staff'\) return null;/.test(ctl), 'le repli salé ne rend jamais un palier équipe');

if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s)`);
  process.exit(1);
}
console.log(`\n✓ ${passed} controls green`);
