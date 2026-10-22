import { DateTimeFormat } from '../_zone-law.js';
/* Kiwi · la page d'accueil du client Order Pro, le calcul pur.
 *
 * Sans dépendance ni base, pour que les routes (guest.js, game.js), le
 * document du tableau de bord (store.js › guestpage) et leurs bancs exécutent
 * le même code. Cinq choses :
 *
 *   · cleanGuestDoc  : le document `guestpage` tel que le propriétaire l'écrit
 *                      (Wi-Fi, avis, réseaux, jeux, Ramadan), borné et nettoyé.
 *   · publicGuest    : ce qu'un téléphone de client a le droit d'en lire. Les
 *                      bonnes réponses des quiz n'en sortent JAMAIS.
 *   · questionsFor / scoreAnswers : une partie, mélangée de façon stable et
 *                      notée par le serveur.
 *   · waitStats      : le temps réel de préparation, plat par plat.
 *   · sunsetUtc / iftarAt : l'heure du ftour d'une ville marocaine. */

import { BUILTIN_QUIZZES } from './_quizzes.js';

export const LANGS = ['fr', 'en', 'ar'];
export const MAX_QUIZZES = 12;
export const MAX_QUESTIONS = 20;
export const POINTS_PER_ANSWER = 100;

const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

/* Une adresse de page d'avis : https seulement. Un lien javascript: ou data:
 * posé par erreur (ou par malveillance) ne doit jamais devenir un bouton. */
export function safeUrl(v) {
  const s = str(v, 400);
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.toString() : '';
  } catch (_) { return ''; }
}

/* Un pseudo de réseau : lettres, chiffres, point, tiret, souligné. Le @ du
 * début est retiré, une adresse complète est ramenée à son pseudo. */
export function handle(v) {
  let s = str(v, 200);
  if (!s) return '';
  const m = s.match(/^https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|fb\.com|tiktok\.com)\/@?([^/?#]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, '');
  return /^[A-Za-z0-9._-]{1,60}$/.test(s) ? s : '';
}

export const SOCIAL_URL = {
  instagram: (h) => 'https://www.instagram.com/' + encodeURIComponent(h) + '/',
  facebook: (h) => 'https://www.facebook.com/' + encodeURIComponent(h),
  tiktok: (h) => 'https://www.tiktok.com/@' + encodeURIComponent(h),
};

/* ── Villes du ftour ───────────────────────────────────────────────────────
 * Le coucher du soleil se calcule ; l'heure du ftour, elle, est celle que le
 * ministère des Habous publie, quelques minutes plus tard. Le propriétaire
 * règle cet écart une fois (`ramadan.offset`, en minutes) en recopiant
 * l'heure de sa mosquée : le tableau de bord lui montre l'heure calculée à
 * côté. */
export const CITIES = {
  casablanca: { name: 'Casablanca', lat: 33.5731, lon: -7.5898 },
  rabat: { name: 'Rabat', lat: 34.0209, lon: -6.8416 },
  marrakech: { name: 'Marrakech', lat: 31.6295, lon: -7.9811 },
  fes: { name: 'Fès', lat: 34.0181, lon: -5.0078 },
  tanger: { name: 'Tanger', lat: 35.7595, lon: -5.834 },
  agadir: { name: 'Agadir', lat: 30.4278, lon: -9.5981 },
  meknes: { name: 'Meknès', lat: 33.8935, lon: -5.5473 },
  oujda: { name: 'Oujda', lat: 34.6814, lon: -1.9086 },
  kenitra: { name: 'Kénitra', lat: 34.261, lon: -6.5802 },
  tetouan: { name: 'Tétouan', lat: 35.5889, lon: -5.3626 },
  eljadida: { name: 'El Jadida', lat: 33.2316, lon: -8.5007 },
  essaouira: { name: 'Essaouira', lat: 31.5085, lon: -9.7595 },
  safi: { name: 'Safi', lat: 32.2994, lon: -9.2372 },
  benimellal: { name: 'Béni Mellal', lat: 32.3373, lon: -6.3498 },
  nador: { name: 'Nador', lat: 35.1681, lon: -2.9335 },
  ouarzazate: { name: 'Ouarzazate', lat: 30.9189, lon: -6.8934 },
  laayoune: { name: 'Laâyoune', lat: 27.1253, lon: -13.1625 },
  dakhla: { name: 'Dakhla', lat: 23.6848, lon: -15.958 },
};

function cleanQuiz(raw, i) {
  if (!raw || typeof raw !== 'object') return null;
  const title = str(raw.title, 80);
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).slice(0, MAX_QUESTIONS).map((q) => {
    const text = str(q && q.q, 200);
    const choices = (Array.isArray(q && q.choices) ? q.choices : []).slice(0, 4).map((c) => str(c, 80)).filter(Boolean);
    const answer = Number(q && q.answer);
    if (!text || choices.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= choices.length) return null;
    return { q: text, choices, answer };
  }).filter(Boolean);
  if (!title || !questions.length) return null;
  const id = str(raw.id, 40).replace(/[^A-Za-z0-9_-]/g, '') || ('q' + i);
  return { id: id.startsWith('kiwi-') ? 'm' + id : id, title, questions };
}

/* Le document tel qu'on l'enregistre. Ce qui n'est pas reconnu disparaît. */
export function cleanGuestDoc(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const wifi = d.wifi && typeof d.wifi === 'object' ? d.wifi : {};
  const socials = d.socials && typeof d.socials === 'object' ? d.socials : {};
  const games = d.games && typeof d.games === 'object' ? d.games : {};
  const ram = d.ramadan && typeof d.ramadan === 'object' ? d.ramadan : {};
  const review = d.review && typeof d.review === 'object' ? d.review : {};
  const seen = new Set();
  const quizzes = (Array.isArray(games.quizzes) ? games.quizzes : []).slice(0, MAX_QUIZZES)
    .map(cleanQuiz).filter((q) => q && !seen.has(q.id) && seen.add(q.id));
  const round = games.round && typeof games.round === 'object' ? games.round : null;
  const roundOk = round && str(round.id, 40) && str(round.quizId, 40)
    && Number.isFinite(+round.startTs) && Number.isFinite(+round.endTs) && +round.endTs > +round.startTs
    && +round.endTs - +round.startTs <= 3 * 3600e3;
  const offset = Math.round(Number(ram.offset));
  return {
    v: 1,
    wifi: { ssid: str(wifi.ssid, 64), password: str(wifi.password, 64) },
    review: { url: safeUrl(review.url) },
    socials: { instagram: handle(socials.instagram), facebook: handle(socials.facebook), tiktok: handle(socials.tiktok) },
    games: {
      on: games.on === true,
      builtin: games.builtin !== false,
      quizzes,
      hidden: (Array.isArray(games.hidden) ? games.hidden : []).map((h) => nickKey(h)).filter(Boolean).slice(0, 200),
      round: roundOk ? { id: str(round.id, 40), quizId: str(round.quizId, 40), startTs: Math.floor(+round.startTs), endTs: Math.floor(+round.endTs) } : null,
    },
    ramadan: {
      on: ram.on === true,
      city: CITIES[ram.city] ? ram.city : 'casablanca',
      offset: Number.isFinite(offset) ? Math.max(-30, Math.min(30, offset)) : 5,
    },
  };
}

/* Les quiz jouables : ceux du restaurant, puis ceux de Kiwi si le propriétaire
 * ne les a pas retirés. Un quiz du restaurant est dans SA langue ; un quiz de
 * Kiwi existe dans les trois. */
export function quizList(doc) {
  const own = (doc.games.quizzes || []).map((q) => ({ id: q.id, own: true, title: q.title, questions: q.questions }));
  const kiwi = doc.games.builtin === false ? [] : BUILTIN_QUIZZES.map((q) => ({ id: q.id, own: false, title: q.title, questions: q.questions }));
  return own.concat(kiwi);
}
export function findQuiz(doc, id) {
  return quizList(doc).find((q) => q.id === String(id || '')) || null;
}

function pick(v, lang) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v[lang] || v.fr;
  return v;
}

/* Une permutation stable : la même question se présente dans le même ordre
 * au moment de la poser et au moment de la noter, sans rien garder entre les
 * deux. La graine est publique ; la tricherie qu'elle permettrait (deviner la
 * position) suppose d'avoir lu ce fichier, pas de jouer. */
function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function permutation(n, seed) {
  const order = Array.from({ length: n }, (_, i) => i);
  let s = seed || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
function answerOf(quiz, qi) {
  return quiz.own ? quiz.questions[qi].answer : 0;
}

/* Ce que le téléphone reçoit : les questions, les choix mélangés, aucune
 * réponse. `order[k]` = indice d'origine du choix affiché en position k. */
export function questionsFor(quiz, lang) {
  const l = LANGS.includes(lang) ? lang : 'fr';
  return {
    id: quiz.id,
    title: pick(quiz.title, l),
    questions: quiz.questions.map((q, qi) => {
      const choices = pick(q.choices, l);
      const order = permutation(choices.length, seedOf(quiz.id + ':' + qi));
      return { q: pick(q.q, l), choices: order.map((k) => choices[k]) };
    }),
  };
}

/* Une réponse donnée est une POSITION : un entier >= 0 (ou sa forme texte).
 * Tout le reste (null, undefined, '', -1, un booléen, un tableau, un objet) veut
 * dire « pas répondu » et ne vaut jamais un point. `Number(null)` et
 * `Number('')` valent 0 : comparées à une bonne réponse affichée en position 0,
 * une question laissée vide comptait juste, et JSON.stringify([,,]) envoie null. */
export function givenPosition(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : -1;
  if (typeof v === 'string' && /^\d{1,3}$/.test(v)) return Number(v);
  return -1;
}

/* La note, calculée ici et nulle part ailleurs. `answers[i]` = la position
 * touchée pour la question i (ou -1 / null pour « pas répondu »). Rend aussi
 * la bonne position de chaque question, pour le récapitulatif. */
export function scoreAnswers(quiz, answers) {
  const given = Array.isArray(answers) ? answers : [];
  let correct = 0;
  const right = quiz.questions.map((q, qi) => {
    const n = Array.isArray(q.choices) ? q.choices.length : pick(q.choices, 'fr').length;
    const order = permutation(n, seedOf(quiz.id + ':' + qi));
    const shown = order.indexOf(answerOf(quiz, qi));
    const mine = givenPosition(given[qi]);
    if (mine >= 0 && mine === shown) correct++;
    return shown;
  });
  return { correct, total: quiz.questions.length, score: correct * POINTS_PER_ANSWER, right };
}

/* Ce qu'un téléphone de client lit. Le mot de passe du Wi-Fi des clients est
 * fait pour être donné : c'est la question qu'on pose au serveur à chaque
 * table. Le reste du document (pseudos masqués, réponses) ne sort pas. */
export function publicGuest(doc, lang, now = Date.now()) {
  const round = doc.games.round && doc.games.round.endTs > now ? doc.games.round : null;
  const roundQuiz = round && findQuiz(doc, round.quizId);
  return {
    wifi: doc.wifi.ssid ? { ssid: doc.wifi.ssid, password: doc.wifi.password } : null,
    review: doc.review.url || '',
    socials: Object.keys(SOCIAL_URL).filter((k) => doc.socials[k]).map((k) => ({ kind: k, handle: doc.socials[k], url: SOCIAL_URL[k](doc.socials[k]) })),
    games: doc.games.on ? {
      quizzes: quizList(doc).map((q) => ({ id: q.id, own: q.own, title: pick(q.title, LANGS.includes(lang) ? lang : 'fr'), count: q.questions.length })),
      round: roundQuiz ? { id: round.id, quizId: round.quizId, title: pick(roundQuiz.title, LANGS.includes(lang) ? lang : 'fr'), startTs: round.startTs, endTs: round.endTs } : null,
    } : null,
  };
}

/* ── Pseudos ─────────────────────────────────────────────────────────────── */
/* Deux à quatorze lettres ou chiffres (toutes écritures), espaces simples. Le
 * classement s'affiche sur l'écran de la salle : rien d'autre n'y passe. */
export function cleanNick(v) {
  const s = String(v == null ? '' : v).normalize('NFC').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 14) return '';
  return /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(s) ? s : '';
}
export function nickKey(v) {
  return String(v == null ? '' : v).normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 40);
}

/* ── Temps de préparation ────────────────────────────────────────────────── */
/* Une ligne par commande prête : quand elle est arrivée, quand la cuisine l'a
 * dite prête, et ses plats. Plus de 90 minutes, c'est un oubli de « prêt »,
 * pas une cuisson : on l'écarte. La médiane, pas la moyenne : un seul ticket
 * oublié ne doit pas promettre une demi-heure à tout le monde. */
export const WAIT_MIN_SAMPLES = 5;
export const WAIT_MIN_ITEM_SAMPLES = 3;
function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function waitStats(rows) {
  const all = [];
  const byItem = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const mins = (Number(r && r.ready_ts) - Number(r && r.created_ts)) / 60000;
    if (!(mins >= 1 && mins <= 90)) return;
    all.push(mins);
    let lines = [];
    try { lines = typeof r.lines === 'string' ? JSON.parse(r.lines) : (r.lines || []); } catch (_) { lines = []; }
    new Set((Array.isArray(lines) ? lines : []).map((l) => String(l && l.id || '')).filter(Boolean))
      .forEach((id) => { if (!byItem.has(id)) byItem.set(id, []); byItem.get(id).push(mins); });
  });
  const overall = all.length >= WAIT_MIN_SAMPLES ? Math.round(median(all)) : null;
  const items = {};
  byItem.forEach((xs, id) => { if (xs.length >= WAIT_MIN_ITEM_SAMPLES) items[id] = Math.round(median(xs)); });
  return { overall, items, samples: all.length };
}

/* L'estimation d'UNE commande : son plat le plus long, ou la médiane de la
 * maison quand aucun de ses plats n'a d'historique. null = on ne dit rien. */
export function estimateMinutes(waits, ids) {
  if (!waits) return null;
  const known = (ids || []).map((id) => waits.items && waits.items[String(id)]).filter((m) => Number.isFinite(m));
  if (known.length) return Math.max(...known);
  return Number.isFinite(waits.overall) ? waits.overall : null;
}

/* ── Coucher du soleil ───────────────────────────────────────────────────── */
/* L'algorithme de l'almanach nautique (NOAA), précis à une minute près sous
 * nos latitudes. Rend l'instant UTC (ms) du coucher pour une date civile. */
export function sunsetUtc(y, m, d, lat, lon) {
  const rad = Math.PI / 180;
  const N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
  const lngHour = lon / 15;
  const t = N + (18 - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
  L = ((L % 360) + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
  RA = ((RA % 360) + 360) % 360;
  RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  if (cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH) / rad / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = (((T - lngHour) % 24) + 24) % 24;
  return Date.UTC(y, m - 1, d) + Math.round(UT * 3600e3);
}

/* La date civile d'un instant dans le fuseau du magasin. */
export function civilDate(ts, zone) {
  const parts = new DateTimeFormat('en-CA', { timeZone: zone || 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ts));
  const get = (k) => +parts.find((p) => p.type === k).value;
  return { y: get('year'), m: get('month'), d: get('day') };
}

/* Le ftour du jour (et celui du lendemain, pour la page ouverte après). */
export function iftarAt(ram, now, zone) {
  const city = CITIES[ram && ram.city] || CITIES.casablanca;
  const offset = (Number.isFinite(+(ram && ram.offset)) ? +ram.offset : 5) * 60000;
  const { y, m, d } = civilDate(now, zone);
  const today = sunsetUtc(y, m, d, city.lat, city.lon);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrow = sunsetUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), city.lat, city.lon);
  return {
    city: city.name,
    sunset: today,
    today: today == null ? null : today + offset,
    tomorrow: tomorrow == null ? null : tomorrow + offset,
  };
}
