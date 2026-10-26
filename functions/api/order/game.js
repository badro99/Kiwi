// /api/order/game — les quiz de la salle.
//
//   GET  ?merchant=&quiz=<id>&lang=fr          → { ok, quiz: { id, title, questions:[{q, choices}] } }
//   GET  ?merchant=&board=month                → { ok, board: [{ nick, score }] }        le mois
//   GET  ?merchant=&board=round&round=<id>     → { ok, board: [{ nick, table, score }] } la manche
//   GET  ?merchant=&board=table&session=&quiz= → { ok, board: [{ nick, score }] }        la tablée
//   POST { merchant, session, quiz, answers:[pos…], nick, round? }
//        → { ok, score, correct, total, right:[pos…], best:{ score, correct }, improved, round }
//          `score`, `correct` et `right` décrivent CETTE partie (ce que le
//          récapitulatif affiche). `best` est le meilleur score de ce pseudo
//          pour ce quiz, tel qu'il est stocké et classé : un score plus bas que
//          le précédent ne le fait pas baisser, et `improved` dit si cette
//          partie l'a battu.
//
// PUBLIC (chemin exact dans functions/_middleware.js). Ce que la porte ouverte
// ne permet pas :
//   · lire une bonne réponse avant d'avoir joué : la question part sans elle
//     (_guest.js › questionsFor), la note est calculée ICI (scoreAnswers) ;
//   · jouer de chez soi : un score exige une session de table OUVERTE, celle
//     que le téléphone a reçue en tapant le tag (et qu'un encaissement ferme) ;
//   · remplir l'écran de la salle : une session porte au plus huit pseudos, et
//     chaque pseudo garde son MEILLEUR score par quiz, pas une ligne par partie ;
//   · afficher n'importe quoi au mur : un pseudo est fait de lettres et de
//     chiffres (cleanNick), et le propriétaire peut en masquer un depuis le
//     tableau de bord (games.hidden).
// Les jeux coupés par le propriétaire : 403 partout.

import { json } from '../../auth/_lib.js';
import { storeSuspended } from '../_private.js';
import { merchantZone } from '../_business-day.js';
import { orderProEnabled, SESSION_ID } from './_lib.js';
import { readGuestDoc } from './guest.js';
import { findQuiz, questionsFor, scoreAnswers, cleanNick, nickKey, civilDate, LANGS } from './_guest.js';

export const MAX_NICKS_PER_SESSION = 8;
const BOARD_SIZE = 10;

let tableReady = false;
export async function ensureScoresTable(env) {
  if (tableReady) return;

  tableReady = true;
}

function monthKey(now, zone) {
  const { y, m } = civilDate(now, zone);
  return y + '-' + String(m).padStart(2, '0');
}

async function gate(env, merchant) {
  if (!merchant) return { error: json({ ok: false, error: 'merchant-required' }, 400) };
  if (await storeSuspended(env, merchant) || !(await orderProEnabled(env, merchant))) {
    return { error: json({ ok: false, error: 'orderpro-off' }, 403) };
  }
  const doc = await readGuestDoc(env, merchant);
  if (!doc.games.on) return { error: json({ ok: false, error: 'games-off' }, 403) };
  return { doc };
}

export async function onRequestGet({ request, env }, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  if (!env || !env.DB) return json({ ok: false, error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  const g = await gate(env, merchant);
  if (g.error) return g.error;
  const { doc } = g;

  const quizId = url.searchParams.get('quiz');
  const board = url.searchParams.get('board');
  if (quizId && !board) {
    const quiz = findQuiz(doc, quizId);
    if (!quiz) return json({ ok: false, error: 'unknown-quiz' }, 404);
    const lang = LANGS.includes(url.searchParams.get('lang')) ? url.searchParams.get('lang') : 'fr';
    return json({ ok: true, quiz: questionsFor(quiz, lang) }, 200, { 'Cache-Control': 'no-store' });
  }

  const hidden = new Set(doc.games.hidden || []);
  const visible = (rows) => rows.filter((r) => !hidden.has(r.nick_key)).slice(0, BOARD_SIZE);
  try {
    await ensureScoresTable(env);
    if (board === 'month') {
      const month = monthKey(now, await merchantZone(env, merchant));
      /* Le meilleur score de chaque pseudo sur chaque quiz, additionnés ; le
       * pseudo s'affiche comme son joueur l'a écrit la dernière fois. */
      const rs = await env.DB.prepare(
        `SELECT nick_key, nickname, quiz_id, score, updated_ts FROM game_scores
          WHERE merchant = ? AND month = ? LIMIT 5000`
      ).bind(merchant, month).all();
      const byNick = new Map();
      ((rs && rs.results) || []).forEach((r) => {
        const e = byNick.get(r.nick_key) || { nick_key: r.nick_key, nickname: r.nickname, ts: 0, best: new Map() };
        if (Number(r.updated_ts) >= e.ts) { e.ts = Number(r.updated_ts); e.nickname = r.nickname; }
        e.best.set(r.quiz_id, Math.max(e.best.get(r.quiz_id) || 0, Number(r.score) || 0));
        byNick.set(r.nick_key, e);
      });
      const rows = [...byNick.values()].map((e) => ({ nick_key: e.nick_key, nick: e.nickname, score: [...e.best.values()].reduce((a, b) => a + b, 0) }))
        .sort((a, b) => b.score - a.score || a.nick_key.localeCompare(b.nick_key));
      return json({ ok: true, month, board: visible(rows).map((r) => ({ nick: r.nick, score: r.score })) });
    }
    if (board === 'round') {
      const round = String(url.searchParams.get('round') || '').slice(0, 40);
      if (!round) return json({ ok: false, error: 'round-required' }, 400);
      const rs = await env.DB.prepare(
        `SELECT nick_key, MAX(nickname) AS nickname, MAX(table_no) AS table_no, MAX(score) AS score FROM game_scores
          WHERE merchant = ? AND round_id = ? GROUP BY nick_key ORDER BY score DESC, MIN(updated_ts) LIMIT 40`
      ).bind(merchant, round).all();
      return json({ ok: true, round, board: visible((rs && rs.results) || []).map((r) => ({ nick: r.nickname, table: r.table_no || '', score: Number(r.score) || 0 })) });
    }
    if (board === 'table') {
      const session = String(url.searchParams.get('session') || '');
      if (!SESSION_ID.test(session)) return json({ ok: false, error: 'session-required' }, 400);
      const rs = await env.DB.prepare(
        `SELECT nick_key, nickname, score FROM game_scores
          WHERE merchant = ? AND session_id = ? AND quiz_id = ? ORDER BY score DESC, updated_ts LIMIT 40`
      ).bind(merchant, session, String(url.searchParams.get('quiz') || '').slice(0, 40)).all();
      return json({ ok: true, board: visible((rs && rs.results) || []).map((r) => ({ nick: r.nickname, score: Number(r.score) || 0 })) });
    }
  } catch (_) { return json({ ok: false, error: 'unavailable' }, 503); }
  return json({ ok: false, error: 'bad-request' }, 400);
}

export async function onRequestPost({ request, env }, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  if (!env || !env.DB) return json({ ok: false, error: 'not-configured' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ ok: false, error: 'bad-json' }, 400); }
  const merchant = String((b && b.merchant) || '').trim().toLowerCase().slice(0, 64);
  const g = await gate(env, merchant);
  if (g.error) return g.error;
  const { doc } = g;

  const session = String((b && b.session) || '');
  if (!SESSION_ID.test(session)) return json({ ok: false, error: 'session-required' }, 400);
  const quiz = findQuiz(doc, b && b.quiz);
  if (!quiz) return json({ ok: false, error: 'unknown-quiz' }, 404);
  const nick = cleanNick(b && b.nick);
  if (!nick) return json({ ok: false, error: 'bad-nick' }, 400);
  const answers = Array.isArray(b && b.answers) ? b.answers.slice(0, quiz.questions.length) : null;
  if (!answers) return json({ ok: false, error: 'bad-answers' }, 400);

  let live = null;
  try {
    live = await env.DB.prepare(
      `SELECT table_no FROM table_sessions WHERE id = ? AND merchant = ? AND mode = 'table' AND status = 'open'`
    ).bind(session, merchant).first();
  } catch (_) { live = null; }
  if (!live) return json({ ok: false, error: 'session-closed' }, 409);

  /* Une manche ne compte que pendant qu'elle court, et que pour SON quiz. */
  const r = doc.games.round;
  const roundId = String((b && b.round) || '');
  const inRound = roundId && r && r.id === roundId && r.quizId === quiz.id && now >= r.startTs - 60000 && now <= r.endTs + 60000;

  const result = scoreAnswers(quiz, answers);
  const key = nickKey(nick);
  const month = monthKey(now, await merchantZone(env, merchant));
  const id = [merchant, month, session, quiz.id, key, inRound ? roundId : ''].join('|');
  let prior = null;
  let stored = null;
  try {
    await ensureScoresTable(env);
    const known = await env.DB.prepare(
      'SELECT COUNT(DISTINCT nick_key) AS n, SUM(CASE WHEN nick_key = ? THEN 1 ELSE 0 END) AS mine FROM game_scores WHERE merchant = ? AND session_id = ?'
    ).bind(key, merchant, session).first();
    if (known && !Number(known.mine) && Number(known.n) >= MAX_NICKS_PER_SESSION) {
      return json({ ok: false, error: 'too-many-players' }, 429);
    }
    prior = await env.DB.prepare('SELECT score FROM game_scores WHERE id = ?').bind(id).first();
    await env.DB.prepare(
      `INSERT INTO game_scores (id, merchant, month, session_id, table_no, quiz_id, round_id, nickname, nick_key,
         score, correct, total, created_ts, updated_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         nickname = excluded.nickname,
         correct = CASE WHEN excluded.score > game_scores.score THEN excluded.correct ELSE game_scores.correct END,
         score = MAX(game_scores.score, excluded.score),
         updated_ts = CASE WHEN excluded.score > game_scores.score THEN excluded.updated_ts ELSE game_scores.updated_ts END`
    ).bind(id, merchant, month, session, String(live.table_no || ''), quiz.id, inRound ? roundId : '', nick, key,
      result.score, result.correct, result.total, now, now).run();
    stored = await env.DB.prepare('SELECT score, correct FROM game_scores WHERE id = ?').bind(id).first();
  } catch (_) { return json({ ok: false, error: 'unavailable' }, 503); }
  /* Le serveur ne garde que le MEILLEUR score (MAX à l'écriture), mais la
   * réponse ne portait que la partie qu'on vient de jouer : le récapitulatif
   * pouvait afficher 300 points pendant que le classement en montrait 700, sans
   * rien dire. Les deux sont maintenant explicites. */
  const bestScore = stored ? Number(stored.score) || 0 : result.score;
  const bestCorrect = stored ? Number(stored.correct) || 0 : result.correct;
  return json({
    ok: true,
    score: result.score, correct: result.correct, total: result.total, right: result.right,
    best: { score: bestScore, correct: bestCorrect },
    improved: !prior || result.score > (Number(prior.score) || 0),
    round: inRound ? roundId : '',
  });
}
