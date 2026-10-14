#!/usr/bin/env node
/* Order Pro · la page d'accueil du client, côté serveur.
 *
 * Les vrais handlers sur du vrai SQLite (schema.sql) :
 *   · le document `guestpage` du propriétaire est nettoyé à l'écriture, et la
 *     caisse ne peut pas l'écrire ;
 *   · /api/order/guest rend Wi-Fi, avis, réseaux, quiz SANS leurs réponses,
 *     « avec ça ? » tiré des tickets, le vrai temps de préparation, le ftour ;
 *   · /api/order/game note la partie lui-même, exige une session de table
 *     ouverte, garde le meilleur score, borne les pseudos, masque ceux que le
 *     propriétaire a masqués, et ne compte une manche que pendant qu'elle court ;
 *   · « servir au ftour » écrit l'heure dans la note de chaque ligne ;
 *   · le client peut demander l'eau, le pain, les serviettes, de débarrasser. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { makeSession, sessionCookie, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as storePost } from '../functions/api/store.js';
import { onRequestGet as guestGet } from '../functions/api/order/guest.js';
import { onRequestGet as gameGet, onRequestPost as gamePost, MAX_NICKS_PER_SESSION } from '../functions/api/order/game.js';
import { onRequestPost as placeOrder } from '../functions/api/order/index.js';
import { onRequestPost as openSession } from '../functions/api/order/session.js';
import { BUILTIN_QUIZZES } from '../functions/api/order/_quizzes.js';
import { cleanGuestDoc, iftarAt } from '../functions/api/order/_guest.js';
import { GUEST_ACTIONS } from '../functions/api/service/events.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-secret-not-a-real-key';
const SLUG = 'chez-nadia';
const ACC = 'acc-nadia';

let pass = 0; const fails = [];
const ok = (l, c, d) => { if (c) pass++; else fails.push(l + (d ? ' · ' + d : '')); };

function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() { const r = db.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  };
  return { prepare, _db: db, batch: async (sts) => { const out = []; for (const s of sts) out.push(await s.run()); return out; } };
}
const DB = makeDB();
const env = { DB, AUTH_SECRET: SECRET };
const J = async (res) => { try { return await res.json(); } catch (_) { return null; } };
async function post(fn, body, headers = {}, deps) {
  const request = new Request('https://k.test/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const res = await fn({ request, env }, deps);
  return { status: res.status, body: await J(res) };
}
async function get(fn, qs, deps) {
  const res = await fn({ request: new Request('https://k.test/api/x?' + qs), env }, deps || { noCache: true });
  return { status: res.status, body: await J(res) };
}

const now = Date.now();
const CARTE = { cats: [{ id: 'c1', name: 'Plats', sub: [] }], items: [
  { id: 'i1', name: 'Tajine', price: 80, catId: 'c1', avail: true },
  { id: 'i2', name: 'Thé à la menthe', price: 15, catId: 'c1', avail: true },
  { id: 'i3', name: 'Msemen', price: 10, catId: 'c1', avail: true },
] };
DB._db.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)').run(ACC, 'n@example.ma', 'Nadia', 'Chez Nadia', 's', 'h', now);
DB._db.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,updated_ts) VALUES (?,?,?,?,?)').run(SLUG, '{"orderpro":true}', 'restaurant', ACC, now);
DB._db.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,updated_ts) VALUES (?,?,?,?,?)').run('chez-off', '{}', 'restaurant', 'acc-off', now);
DB._db.prepare('INSERT INTO menus (merchant,name,type,data,updated_ts) VALUES (?,?,?,?,?)').run(SLUG, 'Chez Nadia', 'restaurant', JSON.stringify(CARTE), now);
DB._db.prepare('INSERT INTO order_desk (merchant,seen_ts) VALUES (?,?)').run(SLUG, now);

const owner = { Cookie: sessionCookie(await makeSession(ACC, SECRET)).split(';')[0] };
const till = { Cookie: `${TILL_COOKIE}=${await tillToken(SECRET, SLUG)}` };

/* ═══ 1. le document du propriétaire ═══════════════════════════════════════ */
const ownQuiz = { id: 'kiwi-fake', title: 'Notre maison', questions: [
  { q: 'Année d’ouverture ?', choices: ['1998', '2005', '2012'], answer: 1 },
  { q: 'Plat signature ?', choices: ['Tajine', 'Pizza'], answer: 0 },
  { q: 'Sans réponse', choices: ['a', 'b'], answer: 7 },
] };
const draft = {
  wifi: { ssid: 'Nadia Guest', password: 'menthe2026' },
  review: { url: 'javascript:alert(1)' },
  socials: { instagram: 'https://www.instagram.com/cheznadia/', facebook: '@chez.nadia', tiktok: 'pas un pseudo !' },
  games: { on: true, quizzes: [ownQuiz], hidden: ['Vilain Mot'] },
  ramadan: { on: false, city: 'atlantide', offset: 99 },
  extra: 'perdu',
};
let r = await post(storePost, { feature: 'guestpage', merchant: SLUG, data: draft }, till);
ok('la caisse appairée ne peut pas écrire la page d’accueil', r.status === 403, r.status + ' ' + JSON.stringify(r.body));
r = await post(storePost, { feature: 'guestpage', merchant: SLUG, data: draft }, owner);
ok('le propriétaire enregistre la page d’accueil', r.status === 200, r.status + ' ' + JSON.stringify(r.body));
const stored = JSON.parse(DB._db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'guestpage'").get(SLUG).data);
ok('un lien javascript: n’est jamais enregistré comme lien d’avis', stored.review.url === '');
ok('les pseudos de réseaux sont tirés des adresses, les faux pseudos écartés',
  stored.socials.instagram === 'cheznadia' && stored.socials.facebook === 'chez.nadia' && stored.socials.tiktok === '', JSON.stringify(stored.socials));
ok('une question à la réponse impossible est retirée, l’id réservé « kiwi- » renommé',
  stored.games.quizzes[0].questions.length === 2 && stored.games.quizzes[0].id === 'mkiwi-fake', JSON.stringify(stored.games.quizzes[0]));
ok('ville inconnue → Casablanca, décalage borné à ±30 min', stored.ramadan.city === 'casablanca' && stored.ramadan.offset === 30);
ok('ce qui n’est pas reconnu disparaît', !('extra' in stored));

/* ═══ 2. la lecture publique ═══════════════════════════════════════════════ */
r = await get(guestGet, 'merchant=chez-off');
ok('Order Pro coupé : 403', r.status === 403);
r = await get(guestGet, 'merchant=' + SLUG + '&lang=ar');
const g = r.body && r.body.guest;
ok('le Wi-Fi des clients et les réseaux sortent', g && g.wifi.ssid === 'Nadia Guest' && g.wifi.password === 'menthe2026'
  && g.socials.map((s) => s.url).join() === 'https://www.instagram.com/cheznadia/,https://www.facebook.com/chez.nadia', JSON.stringify(g));
ok('les quiz du restaurant puis ceux de Kiwi, titrés dans la langue demandée',
  g && g.games.quizzes.map((q) => q.id).join() === 'mkiwi-fake,kiwi-cuisine,kiwi-the-cafe,kiwi-maroc' && g.games.quizzes[1].title === 'المطبخ المغربي');
ok('aucune bonne réponse dans la lecture publique', !/"answer"|"right"|"hidden"/.test(JSON.stringify(r.body)));
ok('sans historique : ni paire, ni temps, ni ftour', JSON.stringify(r.body.pairs) === '{}' && r.body.waits.overall === null && r.body.ramadan === null);

/* « avec ça ? » : 24 tickets tajine + thé, 6 msemen seul */
const sale = DB._db.prepare('INSERT INTO sales (id, merchant, amount, method, ts, lines) VALUES (?,?,?,?,?,?)');
for (let i = 0; i < 24; i++) sale.run('s' + i, SLUG, 95, 'cash', now - i * 3600e3, JSON.stringify([{ i: 'i1', n: 'Tajine', q: 1 }, { i: 'i2', n: 'Thé', q: 2 }]));
for (let i = 0; i < 6; i++) sale.run('m' + i, SLUG, 10, 'cash', now - i * 3600e3, JSON.stringify([{ i: 'i3', n: 'Msemen', q: 1 }]));
/* temps : six commandes prêtes en 10, 12, 14, 16, 18 et 80 min ; une oubliée à 3 h */
const ord = DB._db.prepare("INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts) VALUES (?,?,?,?,?,?,?,?,?,?)");
const course = DB._db.prepare('INSERT INTO order_course (merchant, order_id, ready_ts, created_ts, updated_ts) VALUES (?,?,?,?,?)');
[10, 12, 14, 16, 18, 80, 180].forEach((m, k) => {
  const t0 = now - 86400e3 - k * 3600e3;
  ord.run('ow' + k, SLUG, 900 + k, 'table', '4', 80, JSON.stringify([{ id: 'i1', qty: 1 }]), 'served', t0, t0);
  course.run(SLUG, 'ow' + k, t0 + m * 60000, t0, t0);
});
r = await get(guestGet, 'merchant=' + SLUG);
ok('« avec ça ? » : le thé suit le tajine, le msemen seul n’appelle rien',
  JSON.stringify(r.body.pairs.i1) === '["i2"]' && !r.body.pairs.i3, JSON.stringify(r.body.pairs));
ok('le temps réel : la médiane (15 min), le ticket oublié de 3 h écarté', r.body.waits.items.i1 === 15 && r.body.waits.overall === 15, JSON.stringify(r.body.waits));

/* ═══ 3. les quiz ══════════════════════════════════════════════════════════ */
r = await get(gameGet, 'merchant=' + SLUG + '&quiz=kiwi-cuisine&lang=en');
const quiz = r.body && r.body.quiz;
ok('une partie part sans ses réponses, en anglais', quiz && quiz.questions.length === 10 && quiz.title === 'Moroccan cuisine'
  && !/answer/.test(JSON.stringify(r.body)), JSON.stringify(r.body).slice(0, 200));
const shownRight = quiz.questions.map((q, i) => q.choices.indexOf(BUILTIN_QUIZZES[0].questions[i].choices.en[0]));
ok('l’ordre des choix est mélangé (la bonne réponse n’est pas toujours la première)', new Set(shownRight).size > 1, shownRight.join());

r = await post(gamePost, { merchant: SLUG, quiz: 'kiwi-cuisine', answers: shownRight, nick: 'Amine' });
ok('sans session de table : refusé', r.status === 400 && r.body.error === 'session-required');
const s1 = (await post(openSession, { merchant: SLUG, mode: 'table', table: '4' })).body.session;
const s2 = (await post(openSession, { merchant: SLUG, mode: 'table', table: '9' })).body.session;
r = await post(gamePost, { merchant: SLUG, session: s1, quiz: 'kiwi-cuisine', answers: shownRight, nick: '<b>x</b>' });
ok('un pseudo qui n’est pas fait de lettres est refusé', r.status === 400 && r.body.error === 'bad-nick');
r = await post(gamePost, { merchant: SLUG, session: s1, quiz: 'kiwi-cuisine', answers: shownRight.map((x, i) => (i < 7 ? x : -1)), nick: 'Amine' });
ok('le serveur note : 7 bonnes réponses = 700 points, et rend les bonnes positions',
  r.status === 200 && r.body.correct === 7 && r.body.score === 700 && r.body.right.join() === shownRight.join(), JSON.stringify(r.body));
const firstTry = r.body;
ok('la réponse dit que cette première partie est le meilleur score', firstTry.best && firstTry.best.score === 700 && firstTry.improved === true, JSON.stringify(firstTry));
r = await post(gamePost, { merchant: SLUG, session: s1, quiz: 'kiwi-cuisine', answers: [0, 0, 0], nick: 'amine' });
const best = DB._db.prepare('SELECT COUNT(*) AS n, MAX(score) AS s FROM game_scores WHERE session_id = ?').get(s1);
ok('rejouer moins bien ne fait pas baisser le meilleur score, et ne crée pas de ligne', best.n === 1 && best.s === 700, JSON.stringify(best));
ok('et la réponse le dit : cette partie (score, right) d\u2019un côté, le meilleur stocké (700) de l\u2019autre',
  r.body.score < 700 && r.body.best.score === 700 && r.body.best.correct === 7 && r.body.improved === false
  && Array.isArray(r.body.right) && r.body.right.length === r.body.total, JSON.stringify(r.body));
r = await post(gamePost, { merchant: SLUG, session: s1, quiz: 'kiwi-cuisine', answers: [null, '', undefined, -1, true, [], {}], nick: 'amine' });
ok('des réponses vides (null, \'\', trous) ne comptent jamais comme la position 0', r.status === 200 && r.body.correct === 0 && r.body.score === 0 && r.body.best.score === 700, JSON.stringify(r.body));
await post(gamePost, { merchant: SLUG, session: s1, quiz: 'mkiwi-fake', answers: [], nick: 'amine' });
await post(gamePost, { merchant: SLUG, session: s2, quiz: 'kiwi-cuisine', answers: shownRight, nick: 'Salma' });
await post(gamePost, { merchant: SLUG, session: s2, quiz: 'kiwi-maroc', answers: [], nick: 'Vilain mot' });
for (let k = 0; k < MAX_NICKS_PER_SESSION - 1; k++) {
  r = await post(gamePost, { merchant: SLUG, session: s2, quiz: 'kiwi-cuisine', answers: [], nick: 'Joueur ' + k });
}
r = await post(gamePost, { merchant: SLUG, session: s2, quiz: 'kiwi-cuisine', answers: [], nick: 'Un de trop' });
ok(`une visite porte au plus ${MAX_NICKS_PER_SESSION} pseudos`, r.status === 429 && r.body.error === 'too-many-players', JSON.stringify(r.body));
r = await post(gamePost, { merchant: SLUG, session: s2, quiz: 'kiwi-the-cafe', answers: [], nick: 'Salma' });
ok('…mais un pseudo déjà là peut continuer à jouer', r.status === 200);

r = await get(gameGet, 'merchant=' + SLUG + '&board=month');
const month = r.body.board;
ok('le classement du mois : Salma (1000) devant Amine, sous le pseudo qu’il a écrit en dernier', month[0].nick === 'Salma' && month[0].score === 1000 && month[1].nick === 'amine', JSON.stringify(month.slice(0, 3)));
ok('un pseudo masqué par le propriétaire n’apparaît pas au mur', !month.some((x) => /vilain/i.test(x.nick)));
r = await get(gameGet, 'merchant=' + SLUG + '&board=table&session=' + s1 + '&quiz=kiwi-cuisine');
ok('le classement de la tablée ne montre que sa visite', r.body.board.length === 1 && r.body.board[0].nick === 'amine', JSON.stringify(r.body.board));

/* une manche lancée au comptoir */
const roundDoc = cleanGuestDoc(stored);
roundDoc.games.round = { id: 'r1', quizId: 'kiwi-maroc', startTs: now - 60000, endTs: now + 600000 };
DB._db.prepare("UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'guestpage'").run(JSON.stringify(roundDoc), SLUG);
r = await get(guestGet, 'merchant=' + SLUG);
ok('la manche en cours est annoncée aux téléphones', r.body.guest.games.round && r.body.guest.games.round.id === 'r1' && r.body.guest.games.round.title === 'Le Maroc');
r = await post(gamePost, { merchant: SLUG, session: s1, quiz: 'kiwi-maroc', answers: [], nick: 'Amine', round: 'r1' });
ok('une partie de la manche lui est rattachée', r.body.round === 'r1');
r = await post(gamePost, { merchant: SLUG, session: s1, quiz: 'kiwi-cuisine', answers: [], nick: 'Amine', round: 'r1' });
ok('un autre quiz ne compte pas pour la manche', r.body.round === '');
r = await get(gameGet, 'merchant=' + SLUG + '&board=round&round=r1');
ok('le classement de la manche, avec la table', r.body.board.length === 1 && r.body.board[0].table === '4', JSON.stringify(r.body.board));
r = await post(gamePost, { merchant: SLUG, session: s2, quiz: 'kiwi-maroc', answers: [], nick: 'Salma', round: 'r1' }, {}, { now: () => now + 3600e3 });
ok('après la fin de la manche, la partie ne lui est plus rattachée', r.body.round === '');

DB._db.prepare("UPDATE table_sessions SET status = 'closed' WHERE id = ?").run(s2);
r = await post(gamePost, { merchant: SLUG, session: s2, quiz: 'kiwi-cuisine', answers: [], nick: 'Salma' });
ok('une addition encaissée ferme aussi les jeux de la table', r.status === 409 && r.body.error === 'session-closed');

roundDoc.games.on = false;
DB._db.prepare("UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'guestpage'").run(JSON.stringify(roundDoc), SLUG);
r = await get(gameGet, 'merchant=' + SLUG + '&board=month');
ok('jeux coupés : le classement se tait', r.status === 403 && r.body.error === 'games-off');
r = await get(guestGet, 'merchant=' + SLUG);
ok('jeux coupés : la page d’accueil ne propose plus de jouer', r.body.guest.games === null);

/* ═══ 4. servir au ftour ═══════════════════════════════════════════════════ */
r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '4', session: s1, ref: 'ftour-off', ftour: true, lines: [{ id: 'i1', qty: 1 }] });
ok('mode Ramadan éteint : « servir au ftour » est refusé', r.status === 409 && r.body.error === 'ftour-unavailable', JSON.stringify(r.body));
roundDoc.ramadan = { on: true, city: 'rabat', offset: 4 };
DB._db.prepare("UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'guestpage'").run(JSON.stringify(roundDoc), SLUG);
const iftar = iftarAt(roundDoc.ramadan, Date.now(), 'Africa/Casablanca').today;
r = await get(guestGet, 'merchant=' + SLUG);
ok('mode Ramadan : l’heure du ftour de la ville sort', r.body.ramadan && r.body.ramadan.city === 'Rabat' && r.body.ramadan.today === iftar);
r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '4', session: s1, ref: 'ftour-on', ftour: true, lines: [{ id: 'i1', qty: 1, note: 'sans sel' }] });
const lead = iftar - Date.now();
if (lead >= 2 * 60000 && lead <= 8 * 3600e3) {
  const hhmm = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit' }).format(new Date(iftar));
  ok('avant le ftour : l’heure part dans la note de la ligne, la note du client garde sa place',
    r.status === 200 && r.body.lines[0].note === 'Pour le ftour · ' + hhmm + ' · sans sel' && r.body.ftour === iftar, JSON.stringify(r.body));
} else {
  ok('après le ftour (ou trop tôt le matin) : refusé plutôt que servi à la mauvaise heure', r.status === 409 && r.body.error === 'ftour-unavailable', JSON.stringify(r.body));
}

/* ═══ 5. demandes précises ═════════════════════════════════════════════════ */
ok('le client peut demander l’eau, le pain, les serviettes, de débarrasser',
  ['water', 'bread', 'napkins', 'clear-table', 'call-server', 'ask-bill'].every((a) => GUEST_ACTIONS.has(a)) && GUEST_ACTIONS.size === 6);
r = await post(openSession, { merchant: SLUG, session: s1, action: 'champagne' });
ok('une demande inventée est refusée', r.status !== 200 && r.body.error !== undefined, JSON.stringify(r.body));

if (fails.length) {
  fails.forEach((f) => console.error('  ✗ ' + f));
  console.error(`✗ page d'accueil Order Pro : ${pass} ok, ${fails.length} échec(s)`);
  process.exit(1);
}
console.log(`  ✓ page d'accueil Order Pro, serveur (${pass} contrôles : document, lecture publique, avec ça, temps réel, quiz, manche, ftour, demandes)`);
