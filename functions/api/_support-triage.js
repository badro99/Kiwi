// functions/api/_support-triage.js
//
// Tri automatique des demandes de support avec Clef (@cf/cloudflare/clef),
// le modèle de décision de Cloudflare : on lui donne un texte (« state ») et des
// questions typées, il rend une probabilité calibrée par option, en un seul
// passage et sans générer de texte.
//
// Pourquoi : jusqu'ici une demande n'était « urgente » que si une regex
// (classify() dans _support.js) tombait sur « paiement » ou « bloqu », et rien
// ne prévenait l'équipe Kiwi : le compteur de la console ne bougeait qu'à
// l'ouverture. Ce tri lit le vrai sens (français, arabe, darija écrite en
// lettres latines, anglais) et prévient l'équipe si le commerçant ne peut plus
// vendre.
//
// Règles de ce module :
//  - Le tri ne bloque jamais la création de la demande et ne la fait jamais
//    échouer : tout est attrapé, la demande reste simplement « non triée ».
//  - Les étiquettes ne sont JAMAIS montrées au commerçant (ni dans GET
//    /api/support/tickets, ni dans la réponse du POST). Elles servent à l'équipe.
//  - Une probabilité faible ne devient pas une étiquette assurée : la console
//    écrit « à vérifier » (voir CONFIDENT_AT).
//  - Une alerte n'est « transmise » que si le fournisseur d'envoi a répondu 2xx.
//    Sans SUPPORT_ALERT_EMAIL ou sans MAIL_WEBHOOK, on l'écrit tel quel.
import { sendMail } from '../auth/_lib.js';
import { runAiWithGateway } from './ai/_run.js';
import { quotaOk, DAILY_CAPS } from './ai/_quota.js';
import { classify, cleanText, parseJson } from './_support.js';

/* Clef complet (27B), pas Clef-flash (9B) : sur les 31 demandes synthétiques de
 * tools/support-triage-eval.mjs (2026-10-18), catégorie 96,8 % contre 93,5 %,
 * urgence 87,1 % contre 77,4 %, rappel d'alerte 11/11 contre 10/11. Il coûte
 * 0,24 $ le million de jetons d'entrée contre 0,038 $, soit environ 13 neurones
 * par demande : négligeable devant les 10 000 neurones gratuits par jour. */
export const TRIAGE_MODEL = '@cf/cloudflare/clef';
export const TRIAGE_VERSION = 1;

/* Seuils. Clef rend des probabilités calibrées, donc 0,5 est le point où
 * « oui » devient plus probable que « non » : c'est le seuil d'alerte. Une fausse
 * alerte coûte un coup d'oeil à l'équipe, un blocage de caisse raté coûte une
 * journée de ventes ; on n'alerte pourtant pas plus bas (0,3 « à vérifier » reste
 * en tête de liste sans courriel) pour que l'alerte garde du poids. */
export const ALERT_AT = 0.5;
export const WATCH_AT = 0.3;
/* En dessous de 0,6 pour l'option la plus probable, la console écrit
 * « à vérifier » au lieu de l'étiquette. */
export const CONFIDENT_AT = 0.6;

/* Clef lit environ les 2 000 premiers jetons du texte sur Workers AI : le message
 * du commerçant passe en premier, le reste (type d'établissement) après. */
export const MAX_SUMMARY_CHARS = 3000;
export const AI_TIMEOUT_MS = 12000;
export const MAIL_TIMEOUT_MS = 8000;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const URGENCY_LEVELS = ['can-wait', 'today', 'now'];
export const CATEGORY_IDS = ['caisse', 'impression', 'paiement', 'compte', 'menu_stock', 'autre'];

const URGENCY_CRITERIA = [
  'Peut attendre : simple question, conseil, suggestion ou gêne légère',
  'Aujourd\'hui : une fonction marche mal, mais la caisse vend encore',
  'Maintenant : la caisse ou les ventes sont bloquées, ou de l\'argent est en jeu (encaissement impossible, double débit, ticket perdu)',
];

const CATEGORY_CRITERIA = {
  caisse: 'Caisse et matériel : la caisse, l\'écran, la tablette, le tiroir-caisse, la connexion, la synchronisation entre appareils',
  impression: 'Impression : imprimante, ticket, bon de cuisine, Bluetooth, USB, papier (par exemple « imprimante ma kat5demch »)',
  paiement: 'Paiement et argent : encaissement, TPE, remboursement, double débit, totaux ou chiffres faux, facture ou abonnement Kiwi',
  compte: 'Compte et accès : connexion, mot de passe, code PIN, équipe, droits d\'accès',
  menu_stock: 'Menu et stock : produits, prix, catégories, inventaire, recettes',
  autre: 'Autre sujet, question générale ou demande qui ne rentre dans aucune autre case',
};

/* Les trois questions posées à Clef pour chaque demande. */
export const TRIAGE_QUESTIONS = Object.freeze({
  urgence: {
    type: 'score',
    instructions: 'Quelle est l\'urgence de cette demande d\'un commerçant qui utilise Kiwi, un logiciel de caisse ?',
    criteria: URGENCY_CRITERIA,
  },
  categorie: {
    type: 'choice',
    instructions: 'Quel est le sujet principal de cette demande ?',
    criteria: CATEGORY_CRITERIA,
  },
  bloque: {
    type: 'noul',
    instructions: 'Le commerçant ne peut-il pas vendre en ce moment ?',
    criteria: {
      true: 'La caisse ne s\'ouvre pas ou n\'encaisse plus, ou aucune vente n\'est possible',
      false: 'Il peut encore vendre, ou il pose une question, ou il demande une amélioration',
    },
  },
});

function prob(n) { return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1 ? n : null; }
const round3 = (n) => Math.round(n * 1000) / 1000;

/* Corps de la requête Clef. Forme tirée de la documentation Workers AI
 * (clef et clef-flash, schema-input.json) : { model:'clef', state, questions,
 * images? } ; images = { content_type, base64 } (PNG, JPEG ou WebP, 4 max, pas
 * d'URL distante). */
/** @param {{summary?: unknown, storeType?: unknown, images?: {content_type?: string, base64?: string}[]}} [input] */
export function buildTriageRequest({ summary, storeType, images } = {}) {
  const text = cleanText(summary, MAX_SUMMARY_CHARS);
  const type = cleanText(storeType, 40);
  const payload = {
    model: TRIAGE_MODEL.split('/').pop(),
    state: 'Message d\'un commerçant au support Kiwi (français, arabe, darija ou anglais) :\n' + text
      + (type ? '\n\nType d\'établissement : ' + type : ''),
    questions: TRIAGE_QUESTIONS,
  };
  const pics = (Array.isArray(images) ? images : []).slice(0, 4)
    .filter((i) => i && IMAGE_TYPES.has(i.content_type) && typeof i.base64 === 'string' && i.base64);
  if (pics.length) payload.images = pics.map((i) => ({ content_type: i.content_type, base64: i.base64 }));
  return payload;
}

/* Probabilités d'un score, rangées par niveau. La documentation dit « probabilité
 * par option/niveau » sans préciser la clé : indice, texte de la légende ou texte
 * du critère. On accepte les trois, puis l'ordre d'insertion en dernier recours. */
function levelProbabilities(answer, criteria) {
  const probs = answer && answer.probabilities;
  if (!probs || typeof probs !== 'object') return null;
  const legend = answer.legend && typeof answer.legend === 'object' ? answer.legend : {};
  const out = [];
  for (let i = 0; i < criteria.length; i += 1) {
    let v = prob(probs[String(i)]);
    if (v === null && legend[String(i)] != null) v = prob(probs[typeof legend[String(i)] === 'string' ? legend[String(i)] : JSON.stringify(legend[String(i)])]);
    if (v === null) v = prob(probs[criteria[i]]);
    out.push(v);
  }
  if (out.every((v) => v !== null)) return out;
  const values = Object.values(probs).map(prob);
  return values.length === criteria.length && values.every((v) => v !== null) ? values : null;
}

/* Lit la réponse de Clef et la ramène à ce qu'on stocke. Renvoie null si une
 * réponse n'a pas la forme du schéma de sortie (on ne devine pas). */
export function readTriageAnswers(response, now = Date.now()) {
  const a = response && response.answers;
  if (!a || typeof a !== 'object') return null;
  const u = a.urgence, c = a.categorie, b = a.bloque;
  if (!u || u.type !== 'score' || !c || c.type !== 'choice' || !b || b.type !== 'noul') return null;

  const levels = levelProbabilities(u, URGENCY_CRITERIA);
  if (!levels) return null;
  let top = 0;
  levels.forEach((p, i) => { if (p > levels[top]) top = i; });

  const cp = c.probabilities && typeof c.probabilities === 'object' ? c.probabilities : null;
  if (!cp || !CATEGORY_IDS.includes(c.choice)) return null;
  const categoryP = {};
  for (const id of CATEGORY_IDS) {
    const v = prob(cp[id]);
    if (v === null) return null;
    categoryP[id] = round3(v);
  }
  const blocked = prob(b.noul);
  if (blocked === null) return null;

  const triage = {
    v: TRIAGE_VERSION,
    model: TRIAGE_MODEL,
    served: cleanText(response.model, 80),
    ts: now,
    images: 0,
    urgency: {
      level: URGENCY_LEVELS[top],
      p: levels.map(round3),
      now: round3(levels[2]),
      top: round3(levels[top]),
    },
    category: { id: c.choice, p: categoryP, top: categoryP[c.choice] },
    blocked: round3(blocked),
  };
  triage.verdict = verdictOf(triage);
  return triage;
}

/* urgent : alerte + tête de liste ; watch : tête de liste sans alerte, écrit
 * « à vérifier » ; normal : rien de plus. */
export function verdictOf(triage) {
  const risk = Math.max(triage.blocked || 0, (triage.urgency && triage.urgency.now) || 0);
  return risk >= ALERT_AT ? 'urgent' : risk >= WATCH_AT ? 'watch' : 'normal';
}

function withTimeout(promise, ms, tag) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(tag)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export function alertRecipients(env) {
  return String((env && env.SUPPORT_ALERT_EMAIL) || '').split(/[,;\s]+/).filter(Boolean).slice(0, 3);
}

const pct = (n) => Math.round(n * 100) + ' %';

/* Prévient l'équipe par courriel (sendMail → MAIL_WEBHOOK, le même canal que les
 * réinitialisations de mot de passe). Il n'existe pas d'autre canal sortant vers
 * l'équipe : les routes push partent vers les appareils d'un commerçant, pas vers
 * Kiwi. Renvoie un état honnête : sent (le fournisseur a accepté), unconfigured,
 * failed. */
export async function alertStaff(env, ticket, triage) {
  const to = alertRecipients(env);
  if (!to.length || !env.MAIL_WEBHOOK) return { state: 'unconfigured', ts: Date.now() };
  const confident = triage.category.top >= CONFIDENT_AT;
  const text = [
    'Une demande de support est probablement urgente (tri automatique, il peut se tromper).',
    '',
    'Référence : ' + ticket.reference,
    'Commerçant : ' + ticket.merchant,
    'Ne peut pas vendre : ' + pct(triage.blocked),
    'Urgence « maintenant » : ' + pct(triage.urgency.now),
    'Sujet : ' + (confident ? triage.category.id : 'à vérifier'),
    '',
    cleanText(ticket.summary, 400),
    '',
    'À ouvrir dans la console Kiwi, rubrique Support. Cette alerte est partie une seule fois.',
  ].join('\n');
  try {
    const results = await withTimeout(Promise.all(to.map((address) => sendMail(env, {
      to: address, subject: '[URGENT] ' + ticket.reference + ' · ' + ticket.merchant, text,
    }))), MAIL_TIMEOUT_MS, 'mail-timeout');
    return { state: results.some((r) => r && r.ok) ? 'sent' : 'failed', ts: Date.now() };
  } catch (_) {
    return { state: 'failed', ts: Date.now() };
  }
}

/* Une seule alerte par demande, même si le texte et la capture d'écran sont triés
 * en parallèle : la colonne triage_alert se réserve d'abord (changes === 1), puis
 * reçoit le résultat réel. Si le worker meurt entre les deux, la console lit
 * « alerte non confirmée », jamais « transmise ». Le prochain tri automatique
 * reprend la réservation après expiration du bail de deux minutes. */
export async function claimAlert(env, ticketId, now) {
  try {
    const r = await env.DB.prepare(`UPDATE support_tickets SET triage_alert = ? WHERE id = ? AND (triage_alert IS NULL OR (json_extract(triage_alert, '$.state') = 'unconfirmed' AND COALESCE(json_extract(triage_alert, '$.ts'), 0) < ?))`)
      .bind(JSON.stringify({ state: 'unconfirmed', ts: now }), ticketId, now - STALE_ALERT_MS).run();
    return Number(r && r.meta && r.meta.changes) === 1;
  } catch (_) { return false; }
}

/* Trie une demande déjà écrite. Ne lève jamais.
 * ticket : { id, reference, merchant, summary, storeType }
 * opts.images : [{ content_type, base64 }] (capture jointe, une relance du tri)
 * Renvoie { status: 'triaged' | 'skipped' | 'failed', reason?, triage? }. */
export async function triageSupportTicket(env, ticket, opts = {}) {
  try {
    if (!env || !env.DB || !env.AI || typeof env.AI.run !== 'function') return { status: 'skipped', reason: 'no-ai' };
    if (!ticket || !ticket.id || !ticket.merchant || !ticket.summary) return { status: 'skipped', reason: 'no-ticket' };
    /* Une relance par un opérateur est un geste délibéré et rare : elle ne bute pas sur le quota du commerçant. */
    if (!opts.operator && !(await quotaOk(env, ticket.merchant, 'supporttriage', DAILY_CAPS.supporttriage))) return { status: 'skipped', reason: 'quota' };

    const images = Array.isArray(opts.images) ? opts.images : [];
    const request = buildTriageRequest({ summary: ticket.summary, storeType: ticket.storeType, images });
    let response;
    try {
      response = await withTimeout(runAiWithGateway(env, TRIAGE_MODEL, request), AI_TIMEOUT_MS, 'ai-timeout');
    } catch (_) { return { status: 'failed', reason: 'ai-error' }; }

    const triage = readTriageAnswers(response);
    if (!triage) return { status: 'failed', reason: 'bad-response' };
    // Keep model scores intact; this is a deterministic escalation, not a probability.
    if (classify(ticket.summary).priority === 'urgent') {
      triage.safetyFloor = 'urgent';
      triage.verdict = 'urgent';
    }
    triage.images = request.images ? request.images.length : 0;

    /* Le tri du texte seul ne remplace jamais celui qui a vu la capture. */
    try {
      await env.DB.prepare(triage.images
        ? 'UPDATE support_tickets SET triage = ? WHERE id = ?'
        : 'UPDATE support_tickets SET triage = ? WHERE id = ? AND (triage IS NULL OR COALESCE(json_extract(triage, \'$.images\'), 0) = 0)')
        .bind(JSON.stringify(triage), ticket.id).run();
    } catch (_) { return { status: 'failed', reason: 'store-failed' }; }

    const claimTs = Date.now();
    if (triage.verdict === 'urgent' && await claimAlert(env, ticket.id, claimTs)) {
      const alert = await alertStaff(env, ticket, triage);
      try {
        await env.DB.prepare('UPDATE support_tickets SET triage_alert = ? WHERE id = ? AND triage_alert = ?')
          .bind(JSON.stringify(alert), ticket.id, JSON.stringify({ state: 'unconfirmed', ts: claimTs })).run();
      } catch (_) { /* reste « non confirmée » : plus honnête qu'une fausse réussite */ }
      triage.alert = alert;
    }
    return { status: 'triaged', triage };
  } catch (_) {
    return { status: 'failed', reason: 'unexpected' };
  }
}

/* Ce que l'équipe doit savoir quand le tri n'a pas abouti, écrit dans le fil
 * interne de la demande : sans cette trace, un tri en échec ou une alerte non
 * partie ne se voyaient nulle part, et personne ne relançait. */
const UNDONE = {
  'no-ai': 'le modèle n’est pas disponible',
  quota: 'le quota quotidien du commerçant est atteint',
  'ai-error': 'le modèle n’a pas répondu à temps',
  'bad-response': 'la réponse du modèle était illisible',
  'store-failed': 'le tri n’a pas pu être enregistré',
  unexpected: 'une erreur inattendue',
};
export function triageOutcomeNote(result) {
  if (!result) return 'Tri automatique non fait : une erreur inattendue. Relancez le tri depuis cette demande.';
  if (result.status !== 'triaged') {
    const why = UNDONE[result.reason];
    return why ? 'Tri automatique non fait : ' + why + '. Relancez le tri depuis cette demande.' : null;
  }
  const alert = result.triage && result.triage.alert;
  if (alert && alert.state === 'failed') return 'Demande jugée urgente, mais l’e-mail d’alerte n’est pas parti. Relancez le tri pour le renvoyer.';
  if (alert && alert.state === 'unconfigured') return 'Demande jugée urgente, mais aucune alerte n’est configurée (SUPPORT_ALERT_EMAIL ou MAIL_WEBHOOK). Elle n’est signalée que dans cette console.';
  return null;
}

/* Trie puis consigne l'issue dans le fil interne quand il y a quelque chose à faire. Ne lève jamais. */
export async function triageAndRecord(env, ticket, opts = {}) {
  let result = null;
  try { result = await triageSupportTicket(env, ticket, opts); } catch (_) { result = null; }
  const note = triageOutcomeNote(result);
  if (note && env && env.DB && ticket && ticket.id) {
    try {
      await env.DB.prepare('INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)')
        .bind('msg-' + crypto.randomUUID(), ticket.id, 'triage', 'internal', 'kiwi', note, '', Date.now()).run();
    } catch (_) { /* la console affiche déjà « non triée » sans tri enregistré */ }
  }
  return result || { status: 'failed', reason: 'unexpected' };
}

/* Relance demandée par un opérateur. Une alerte en échec, non configurée, ou
 * restée « non confirmée » plus de deux minutes (le worker est mort entre la
 * réservation et l'envoi) est libérée pour pouvoir repartir ; une alerte
 * envoyée ne repart jamais. */
export const STALE_ALERT_MS = 2 * 60 * 1000;
export async function retriageTicket(env, row, now = Date.now()) {
  if (!env || !env.DB || !row || !row.id) return { status: 'failed', reason: 'unexpected' };
  try {
    await env.DB.prepare(`UPDATE support_tickets SET triage_alert = NULL WHERE id = ? AND triage_alert IS NOT NULL
      AND (json_extract(triage_alert, '$.state') IN ('failed', 'unconfigured')
        OR (json_extract(triage_alert, '$.state') = 'unconfirmed' AND COALESCE(json_extract(triage_alert, '$.ts'), 0) < ?))`)
      .bind(row.id, now - STALE_ALERT_MS).run();
  } catch (_) { /* sans libération, l'alerte existante reste telle quelle */ }
  return triageAndRecord(env, { id: row.id, reference: row.reference, merchant: row.merchant, summary: row.summary, storeType: row.store_type || '' }, { operator: true });
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/* Appelé quand une capture d'écran arrive (les pièces jointes sont envoyées après
 * la création de la demande). Retrie une fois, avec l'image. Ne lève jamais. */
export async function triageAfterImage(env, ticket, mime, buffer) {
  try {
    if (env && env.DB && IMAGE_TYPES.has(mime) && buffer && buffer.byteLength > MAX_IMAGE_BYTES) {
      await env.DB.prepare('INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)')
        .bind('msg-' + crypto.randomUUID(), ticket.id, 'triage', 'internal', 'kiwi', 'Capture conservée, mais non analysée : elle dépasse la limite de 4 Mio du tri automatique. Examiner la pièce jointe manuellement.', '', Date.now()).run();
      return { status: 'skipped', reason: 'image-too-large' };
    }
    if (!env || !env.AI || !IMAGE_TYPES.has(mime) || !buffer || buffer.byteLength > MAX_IMAGE_BYTES) return { status: 'skipped', reason: 'not-eligible' };
    const row = await env.DB.prepare('SELECT triage FROM support_tickets WHERE id = ?').bind(ticket.id).first();
    const prev = parseJson(row && row.triage, null);
    if (prev && prev.images) return { status: 'skipped', reason: 'already-with-image' };
    return await triageSupportTicket(env, ticket, { images: [{ content_type: mime, base64: toBase64(buffer) }] });
  } catch (_) {
    return { status: 'failed', reason: 'unexpected' };
  }
}

/* Ce que la console lit : le JSON du tri, avec l'état de l'alerte. */
export function publicTriage(row) {
  const triage = parseJson(row && row.triage, null);
  if (!triage || typeof triage !== 'object') return null;
  const alert = parseJson(row && row.triage_alert, null);
  return alert ? { ...triage, alert } : triage;
}

/* Rang d'affichage dans la console : 0 = alerte IA, 1 = urgence par mots-clés ou
 * « à vérifier », 1.5 = ouverte jamais triée, 2 = le reste. Seules les demandes encore ouvertes montent. */
export function consoleRank(row) {
  const open = row.status === 'open' || row.status === 'waiting-client';
  const verdict = open && row.triage ? row.triage.verdict : '';
  if (verdict === 'urgent') return 0;
  if (row.priority === 'urgent' || verdict === 'watch') return 1;
  /* Ouverte et jamais triée : aucun modèle ne l'a lue. Elle passe après les
     urgences et les « à vérifier », avant les demandes triées sans urgence. */
  if (open && !row.triage) return 1.5;
  return 2;
}
