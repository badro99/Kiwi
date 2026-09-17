#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Réservation publique — joindre la cliente, et la laisser gérer
 *                                                   (tickets #0050, #0052)
 *
 * #0050  Le serveur frappait un `manageToken` que PERSONNE ne recevait : aucune
 *        route de gestion (Get/Post seulement), et la page ignorait le jeton,
 *        effaçait la référence de session et n'affichait le code qu'une fois.
 *        Fermer l'onglet rendait la réservation inatteignable pour toujours :
 *        ni consultation, ni annulation.
 * #0052  L'e-mail passait par `str(email,160)` sans le moindre contrôle, aucune
 *        confirmation n'était envoyée, et le code n'était montré qu'une fois.
 *        Une faute de frappe produisait une réservation dont personne ne
 *        pouvait joindre la cliente.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API = fs.readFileSync(path.join(ROOT, 'functions/api/booking.js'), 'utf8');
const UI = fs.readFileSync(path.join(ROOT, 'assets/booking.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'assets/booking.css'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Réservation publique · gestion et joignabilité');

/* ═══ #0052 · une adresse qui ne peut pas recevoir est refusée ════════════ */
{
  // Le vrai validateur, découpé du serveur et exécuté.
  const head = API.indexOf('const EMAIL = ');
  const end = API.indexOf('\n}\n', API.indexOf('function normalizeEmail'));
  const sandbox = { String };
  vm.createContext(sandbox);
  vm.runInContext(`
    const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    ${API.slice(head, end + 3)}
    globalThis.norm = normalizeEmail;
  `, sandbox);

  const good = ['marie@gmail.com', 'A.Dupont+riad@mail.co.uk', 'contact@kiwi-os.com', 'x@a.io'];
  const bad = ['marie.dupont', 'marie@gmail', 'marie@', '@gmail.com', 'marie @gmail.com',
    'marie@gmail..com', 'marie@-gmail.com', 'marie<@>gmail.com', 'marie@gmail.c'];
  good.forEach((e) => ok(sandbox.norm(e) === e.trim().toLowerCase(), `adresse délivrable acceptée : ${e}`));
  bad.forEach((e) => ok(sandbox.norm(e) === '', `adresse indélivrable refusée : ${e}`));
  ok(sandbox.norm('') === '', 'un e-mail absent reste permis (le téléphone suffit)');
  ok(sandbox.norm('  Marie@Gmail.COM ') === 'marie@gmail.com', 'l\'adresse est normalisée avant stockage');

  ok(/return json\(\{error:'invalid-email'\},400\)/.test(API),
    'le serveur refuse explicitement une adresse saisie mais indélivrable');
  const post = API.slice(API.indexOf('export async function onRequestPost'));
  ok(post.indexOf("invalid-email") < post.indexOf('await storeSubscriptionPending'),
    'ce refus tombe AVANT toute écriture');
  ok(!/email=str\(b\?\.customer\?\.email,160\)/.test(API),
    'l\'ancien `str(email,160)` sans contrôle a disparu');
  ok(/\(!rawPhone&&!rawEmail\)/.test(API),
    'une adresse invalide ne se fait pas passer pour « aucun contact fourni »');

  // La confirmation
  ok(/import \{[^}]*sendMail[^}]*\} from '\.\.\/auth\/_lib\.js'/.test(API),
    'le serveur dispose enfin d\'une sortie e-mail');
  ok(/async function confirmationMail/.test(API), 'une confirmation est composée pour la cliente');
  ok(/confirmationSent:!!\(mail&&mail\.ok\)/.test(API),
    'la réponse dit si la confirmation est VRAIMENT partie — jamais un « envoyé » de façade');
  const sends = (API.match(/await confirmationMail\(/g) || []).length;
  ok(sends === 2, `la confirmation part sur les deux chemins, hôtel et service (${sends}/2)`);
  ok(/manageUrl\(request, merchant, rec\.manageToken\)/.test(API),
    'la confirmation contient le lien de gestion, pas seulement le code');
  ok(!/if\s*\(!mail[\s\S]{0,40}return json\(\{\s*error/.test(API),
    'un envoi raté ne fait JAMAIS échouer la réservation déjà écrite');
}

/* ═══ #0050 · la réservation reste retrouvable et annulable ═══════════════ */
{
  ok(/export async function onRequestDelete/.test(API),
    'une route d\'annulation existe (il n\'y avait que Get et Post)');
  ok(/kind:'manage'/.test(API), 'une consultation par jeton existe');
  ok(/const TOKEN = \/\^\[a-f0-9\]\{16,80\}\$\//.test(API),
    'le jeton est contraint à sa forme, pas lu tel quel');

  const manageBlock = API.slice(API.indexOf('const manage = str('), API.indexOf('if (hotelTrade(rows.merchant))'));
  ok(/x\.manageToken && x\.manageToken === manage/.test(manageBlock),
    'la consultation exige le jeton exact — un code de réservation ne suffit pas');
  ok(/publicBooking\(rec\)/.test(manageBlock),
    'la consultation ne renvoie qu\'une projection publique de la réservation');

  const pub = API.slice(API.indexOf('function publicBooking'), API.indexOf('/* Le délai d\'annulation'));
  ok(!/manageToken/.test(pub), 'cette projection ne rediffuse JAMAIS le jeton lui-même');
  ok(!/phone|email/.test(pub), 'ni le téléphone ni l\'e-mail de la cliente ne ressortent');

  const del = API.slice(API.indexOf('export async function onRequestDelete'), API.indexOf('export async function onRequestPost'));
  ok(/!TOKEN\.test\(token\)/.test(del), 'l\'annulation refuse un jeton mal formé');
  ok(/rec\.status === 'cancelled'[\s\S]{0,120}already:true/.test(del),
    'un second clic sur le même lien répond « déjà annulée », pas une erreur');
  ok(/!ACTIVE\.has\(rec\.status\)[\s\S]{0,80}not-cancellable/.test(del),
    'une réservation déjà traitée (arrivée, terminée) ne s\'annule pas en ligne');
  ok(/cancellation-closed/.test(del),
    'le délai publié par l\'établissement est respecté');
  ok(/rec\.status = 'cancelled'/.test(del) && !/splice|delete doc\.bookings/.test(del),
    'on annule par changement de statut — rien n\'est effacé de l\'historique');
  ok(/writeReservationWithEvents/.test(del),
    'une annulation d\'hôtel passe par le même journal d\'événements que la création');
  ok(/AND rev = \?/.test(del), 'l\'écriture reste protégée par la révision (pas d\'écrasement concurrent)');
  ok(/for \(let attempt = 0; attempt < 4/.test(del), 'et retente sur conflit de révision');
  ok(/await poke\(env, merchant, 'reservations'\)/.test(del),
    'l\'établissement voit l\'annulation arriver en direct');

  // Le délai, calculé.
  const head = API.indexOf('function cancellableAt');
  const sandbox = { Math, Number };
  vm.createContext(sandbox);
  vm.runInContext(`
    const num = (v, min, max, fallback) => Number.isFinite(+v) ? Math.max(min, Math.min(max, +v)) : fallback;
    ${API.slice(head, API.indexOf('\n}\n', head) + 3)}
    globalThis.at = cancellableAt;
  `, sandbox);
  const start = 1700000000000;
  ok(sandbox.at({ startAt: start }, { cancellationHours: 12 }) === start - 12 * 3600000,
    'le délai est bien 12 h avant l\'heure réservée');
  ok(sandbox.at({ startAt: start }, { cancellationHours: 0 }) === start,
    'un établissement sans préavis laisse annuler jusqu\'au dernier moment');
  ok(sandbox.at({ startAt: start }, {}) === start - 12 * 3600000,
    'un réglage absent retombe sur le défaut publié (12 h), pas sur zéro');
}

/* ═══ La page publique porte le lien ══════════════════════════════════════ */
{
  ok(/manageToken=String\(q\.get\('manage'\)/.test(UI), 'la page reconnaît un lien de gestion');
  ok(/if\(manageToken\)\{openManage\(\);return\}/.test(UI), 'et l\'ouvre directement');
  ok(/function renderManage/.test(UI) && /data-manage-do/.test(UI),
    'l\'écran de gestion propose l\'annulation');
  ok(/method:'DELETE'/.test(UI), 'qui appelle bien la route d\'annulation');
  ok(/data-manage-ask[\s\S]{0,400}data-manage-do/.test(UI),
    'l\'annulation demande confirmation avant d\'agir (geste irréversible)');
  ok(/function rememberManage/.test(UI) && /kiwiBookingManage/.test(UI),
    'le lien est rangé dans ce navigateur : revenir sur la page le retrouve');
  ok(/manageBlock\(j\)/.test(UI), 'le lien est affiché sur l\'écran de succès');
  ok((UI.match(/\+manageBlock\(j\)\+?/g) || []).length === 2,
    'sur les deux écrans de succès, service ET hôtel');
  ok(/data-copy-manage/.test(UI), 'et il peut être copié d\'un geste');
  ok(/function emailOk/.test(UI), 'la page vérifie l\'adresse avant l\'aller-retour');
  ok((UI.match(/if\(email&&!emailOk\(email\)\)/g) || []).length === 2,
    'sur les deux formulaires, service ET hôtel');
  ok(/closedWindow/.test(UI),
    'passé le délai, la page dit d\'appeler au lieu d\'offrir un bouton qui échoue');
  ok(/statusRequested|statusConfirmed|statusCancelled/.test(UI),
    'l\'écran de gestion dit l\'état réel de la réservation');
  ['fr', 'en', 'ar'].forEach((l) => {
    ok(new RegExp(`${l}:\\{keep:`).test(UI), `l'écran de gestion est traduit en ${l}`);
  });
  ok(/\.bk-manage-link\{/.test(CSS) && /\.bk-manage-note\{/.test(CSS),
    'le lien de gestion est dessiné, pas posé nu dans la page');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
