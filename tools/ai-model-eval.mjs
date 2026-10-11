#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · évaluation des modèles vision de Workers AI
 *
 *   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… node tools/ai-model-eval.mjs
 *   node tools/ai-model-eval.mjs --dry          # hors réseau : fixtures + formes de requête + notation
 *
 * Décide du choix des modèles qui lisent les photos de cartes et de salles
 * (functions/api/ai/menu-import.js, salle-import.js) sur des MESURES, pas sur
 * une fiche technique. Pour chaque (modèle × fixture × passage) :
 *   1. construit la requête avec les VRAIS constructeurs des routes
 *      (buildMenuVisionPayload, buildSallePayload) puis la traduit pour le
 *      modèle (payloadForModel, _vision.js) · aucun prompt n'est copié ici ;
 *   2. l'envoie à l'API REST Cloudflare
 *        POST https://api.cloudflare.com/client/v4/accounts/<id>/ai/run/<modèle>
 *   3. lit la réponse comme la route (parseModelResponse), la valide comme la
 *      route (validateMenuItems / validateSalle), puis note contre la vérité
 *      terrain de tools/fixtures/ai-eval/truth.json.
 *
 * Mesures : justesse des champs (articles, prix AU CENTIME, catégories ; pour
 * les salles : nombre de tables, groupes forme × places, extérieur, comptoir),
 * validité JSON (nue, puis lisible par la route), latence, coût estimé d'après
 * les tokens réellement facturés (`usage`).
 *
 * Secrets : CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID ne sont jamais
 * affichés, journalisés ni écrits (messages d'erreur expurgés). Le rapport JSON
 * ne contient que des fixtures SYNTHÉTIQUES.
 *
 * Limite assumée : un seul appel par passage. Le repêchage prose → JSON de
 * salle-import (qui coûte un appel texte de plus) n'est pas rejoué : un modèle
 * qui n'a besoin d'AUCUN repêchage est mesuré comme meilleur, c'est voulu.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FIXTURE_DIR = path.join(HERE, 'fixtures', 'ai-eval');

/* Les routes sont des modules ES sans "type" dans package.json : Node avertit
 * (MODULE_TYPELESS_PACKAGE_JSON) à chaque import. Bruit, pas une erreur. */
process.removeAllListeners('warning');

export const BASELINE_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
export const DEFAULT_MODELS = [
  BASELINE_MODEL,
  '@cf/zai-org/glm-5.3-flash',
  '@cf/google/gemma-4-26b-a4b-it',
];

/* Dollars par million de tokens (entrée, sortie) · pages modèles Workers AI,
 * relevées le 2026-10-11. Une mise à jour des tarifs se fait ICI. */
export const PRICING = {
  '@cf/zai-org/glm-5.3-flash': [0.15, 0.5],
  '@cf/google/gemma-4-26b-a4b-it': [0.1, 0.3],
  '@cf/meta/llama-3.2-11b-vision-instruct': [0.049, 0.676],
};
export const PRICING_DATE = '2026-10-11';

/* Seuils de décision, écrits avant la mesure pour ne pas être ajustés après. */
export const THRESHOLDS = {
  upgradeMargin: 0.05, // le candidat doit battre la base d'au moins 5 points de score
  nonInferiorMargin: 0.02, // …ou, pour un secours, ne pas la perdre de plus de 2 points
  minJsonRoute: 0.95, // part de réponses que le parseur de la route sait lire
  maxErrorRate: 0.1, // appels en erreur HTTP
  maxP50Ms: 30000, // latence médiane, appel unique
};

/* Même borne que les routes (MAX_IMAGE_DATAURL) : une fixture plus lourde
 * serait refusée en 413 avant même d'atteindre le modèle. */
const MAX_IMAGE_DATAURL = 2_600_000;

/* ── Notation ──────────────────────────────────────────────────────────── */
export function normalize(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[̀-ًͯ-ٰٟـ]/g, '') // accents latins, tashkeel, tatweel
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/* Ressemblance 0..1 entre deux libellés normalisés. Une inclusion compte
 * (« Thé à la menthe / أتاي بالنعناع » contient « thé à la menthe ») tant que
 * l'un n'est pas plus de 2,6 fois l'autre : on tolère un libellé bilingue, pas
 * une phrase entière. */
export function similarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.includes(short) && long.length <= short.length * 2.6) return 0.95;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

const SEGMENT_SPLIT = /\s[/|·•–—-]\s|\s*[/|·•]\s*/;
function nameSimilarity(truthItem, predName) {
  const labels = [truthItem.name, ...(truthItem.aliases || [])];
  const preds = [predName, ...String(predName).split(SEGMENT_SPLIT)];
  let best = 0;
  for (const l of labels) for (const p of preds) best = Math.max(best, similarity(l, p));
  return best;
}

function categoryMatches(truthItem, predCat) {
  const p = normalize(predCat);
  if (!p) return false;
  const options = [truthItem.cat, ...(truthItem.catAliases || [])].map(normalize);
  return options.some((o) => {
    if (o === p) return true;
    if (p.length >= 3 && (o.includes(p) || p.includes(o))) return true;
    return similarity(o, p) >= 0.7;
  });
}

const MATCH_THRESHOLD = 0.75;

/* Appariement glouton des articles : les paires les plus ressemblantes d'abord,
 * chaque article attendu et chaque article lu ne sert qu'une fois. */
export function matchItems(truthItems, predItems) {
  const pairs = [];
  truthItems.forEach((t, ti) => predItems.forEach((p, pi) => {
    const s = nameSimilarity(t, p.name);
    if (s >= MATCH_THRESHOLD) pairs.push({ ti, pi, s });
  }));
  pairs.sort((x, y) => y.s - x.s);
  const usedT = new Set(), usedP = new Set(), out = [];
  for (const { ti, pi, s } of pairs) {
    if (usedT.has(ti) || usedP.has(pi)) continue;
    usedT.add(ti); usedP.add(pi); out.push({ ti, pi, s });
  }
  return out;
}

const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;

/* Carte : 40 % articles (F1), 40 % prix exact au centime, 20 % catégories.
 * Un article manquant ou mal apparié compte faux sur le prix ET la catégorie :
 * un prix juste sur un article qu'on n'a pas lu ne vaut rien. */
export function scoreMenu(truth, validated) {
  const preds = validated ? validated.items : [];
  const T = truth.items;
  const pairs = matchItems(T, preds);
  const matched = pairs.length;
  const recall = T.length ? matched / T.length : 0;
  const precision = preds.length ? matched / preds.length : 0;
  const f1 = recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
  let priceOk = 0, catOk = 0;
  const detail = [];
  for (const { ti, pi } of pairs) {
    const t = T[ti], p = preds[pi];
    if (Math.abs(Number(p.price) - t.price) < 0.005) priceOk++;
    else detail.push(`prix ${t.name} : attendu ${t.price}, lu ${p.price}`);
    if (categoryMatches(t, p.cat)) catOk++;
    else detail.push(`catégorie ${t.name} : attendu « ${t.cat} », lu « ${p.cat} »`);
  }
  const matchedT = new Set(pairs.map((x) => x.ti));
  T.forEach((t, i) => { if (!matchedT.has(i)) detail.push(`manquant : ${t.name}`); });
  const priceExact = T.length ? priceOk / T.length : 0;
  const catAcc = T.length ? catOk / T.length : 0;
  const score = 0.4 * f1 + 0.4 * priceExact + 0.2 * catAcc;
  return {
    score: r4(score),
    metrics: {
      truthItems: T.length, readItems: preds.length, matched,
      recall: r4(recall), precision: r4(precision), f1: r4(f1),
      priceExact: r4(priceExact), priceExactOfMatched: matched ? r4(priceOk / matched) : 0,
      categoryAcc: r4(catAcc),
    },
    detail: detail.slice(0, 12),
  };
}

/* Salle : 40 % nombre de tables, 30 % groupes (forme × places, F1 sur les
 * effectifs), 15 % extérieur, 15 % comptoir. Le type d'établissement est relevé
 * mais n'entre pas dans le score : « café » ou « restaurant » se discute. */
export function scoreSalle(truth, validated) {
  const S = truth.salle;
  if (!validated || validated.error) {
    return { score: 0, metrics: { tableCount: 0, tableCountExact: false, groupF1: 0, outdoorOk: false, counterOk: false, venueOk: false }, detail: ['aucune salle lisible'] };
  }
  const total = validated.tableCount;
  const countScore = Math.max(0, 1 - Math.abs(total - S.tableCount) / S.tableCount);
  const key = (r) => `${r.shape}:${r.seats}`;
  const want = new Map(), got = new Map();
  S.tables.forEach((r) => want.set(key(r), (want.get(key(r)) || 0) + r.count));
  validated.tables.forEach((r) => got.set(key(r), (got.get(key(r)) || 0) + r.count));
  let overlap = 0;
  for (const [k, n] of want) overlap += Math.min(n, got.get(k) || 0);
  const sumGot = [...got.values()].reduce((a, b) => a + b, 0);
  const sumWant = [...want.values()].reduce((a, b) => a + b, 0);
  const rec = sumWant ? overlap / sumWant : 0, pre = sumGot ? overlap / sumGot : 0;
  const groupF1 = rec + pre ? (2 * rec * pre) / (rec + pre) : 0;
  const outdoorOk = validated.outdoor === S.outdoor;
  const counterOk = validated.counter === S.counter;
  const detail = [];
  if (total !== S.tableCount) detail.push(`tables : attendu ${S.tableCount}, lu ${total}`);
  if (groupF1 < 1) detail.push(`groupes : attendu ${JSON.stringify(S.tables)}, lu ${JSON.stringify(validated.tables)}`);
  if (!outdoorOk) detail.push(`extérieur : attendu ${S.outdoor}`);
  if (!counterOk) detail.push(`comptoir : attendu ${S.counter}`);
  return {
    score: r4(0.4 * countScore + 0.3 * groupF1 + 0.15 * (outdoorOk ? 1 : 0) + 0.15 * (counterOk ? 1 : 0)),
    metrics: { tableCount: total, tableCountExact: total === S.tableCount, groupF1: r4(groupF1), outdoorOk, counterOk, venueOk: validated.venue === S.venue },
    detail,
  };
}

/* ── Coût ──────────────────────────────────────────────────────────────── */
export function estimateCost(model, usage, textLen, promptChars) {
  const price = PRICING[model];
  if (!price) return { costUsd: null, costSource: 'no-price' };
  if (usage && Number.isFinite(usage.prompt_tokens) && Number.isFinite(usage.completion_tokens)) {
    return { costUsd: (usage.prompt_tokens * price[0] + usage.completion_tokens * price[1]) / 1e6, costSource: 'usage' };
  }
  /* Pas d'`usage` (Llama 3.2 vision n'en renvoie pas toujours) : estimation
   * grossière — ~3,5 caractères par token, ~1 200 tokens pour l'image. */
  const inTok = Math.ceil((promptChars || 0) / 3.5) + 1200;
  const outTok = Math.ceil((textLen || 0) / 3.5);
  return { costUsd: (inTok * price[0] + outTok * price[1]) / 1e6, costSource: 'estimate' };
}

/* ── Appel REST ────────────────────────────────────────────────────────── */
function makeRedactor(secrets) {
  const list = secrets.filter((s) => s && s.length >= 6);
  return (text) => list.reduce((t, s) => t.split(s).join('***'), String(text == null ? '' : text));
}

export async function callModel({ fetchImpl, accountId, token, model, body, timeoutMs, redact }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const t0 = Date.now();
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const ms = Date.now() - t0;
      let json = null;
      try { json = await res.json(); } catch (_) { json = null; }
      if (res.ok && json && json.success !== false) return { ok: true, status: res.status, ms, result: json.result !== undefined ? json.result : json };
      const msg = json && Array.isArray(json.errors) && json.errors[0] ? `${json.errors[0].code || ''} ${json.errors[0].message || ''}`.trim() : `HTTP ${res.status}`;
      last = { ok: false, status: res.status, ms, error: redact(msg).slice(0, 240) };
      if (res.status !== 429 && res.status < 500) return last; // 4xx : ni l'attente ni un second essai n'y changent rien
    } catch (e) {
      last = { ok: false, status: 0, ms: Date.now() - t0, error: redact(e && e.name === 'AbortError' ? `délai de ${timeoutMs} ms dépassé` : (e && e.message) || e).slice(0, 240) };
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) * (attempt + 1)));
  }
  return last;
}

/* ── Routes, fixtures, requêtes ────────────────────────────────────────── */
export async function loadRoutes() {
  const ai = (f) => import(pathToFileURL(path.join(ROOT, 'functions/api/ai', f)).href);
  const [menu, salle, vision, run, invoice] = await Promise.all([ai('menu-import.js'), ai('salle-import.js'), ai('_vision.js'), ai('_run.js'), ai('invoice.js')]);
  return {
    buildMenuVisionPayload: menu.buildMenuVisionPayload,
    validateMenuItems: menu.validateMenuItems,
    buildSallePayload: salle.buildSallePayload,
    validateSalle: salle.validateSalle,
    payloadForModel: vision.payloadForModel,
    nativeLlamaPayload: vision.nativeLlamaPayload,
    visionFamily: vision.visionFamily,
    aiText: run.aiText,
    parseModelResponse: invoice.parseModelResponse,
  };
}

export function loadFixtures(select = 'all') {
  const truth = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'truth.json'), 'utf8'));
  let list = truth.fixtures;
  if (select && select !== 'all') {
    const want = select.split(',').map((s) => s.trim());
    list = list.filter((f) => want.includes(f.id) || want.includes(f.route.replace('-import', '')));
  }
  if (!list.length) throw new Error(`Aucune fixture ne correspond à « ${select} » (ids : ${truth.fixtures.map((f) => f.id).join(', ')} ; ou menu, salle, all)`);
  return list.map((f) => {
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, f.file));
    return { ...f, bytes: buf.length, png: buf, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
  });
}

/* Les formes à essayer, dans l'ordre : une seule pour GLM et Gemma (chat
 * completions) ; pour Llama vision, comme la production d'avant, la forme
 * messages d'abord puis la forme native { prompt, image } si elle est refusée. */
export function requestShapes(R, model, fixture) {
  const base = fixture.route === 'menu-import' ? R.buildMenuVisionPayload(fixture.dataUrl, 'fr') : R.buildSallePayload(fixture.dataUrl);
  const first = R.payloadForModel(model, base);
  if (R.visionFamily(model) === 'llama-vision') return [{ name: 'messages', body: first }, { name: 'native', body: R.nativeLlamaPayload(base) }];
  return [{ name: 'messages', body: first }];
}

function promptChars(body) {
  if (typeof body.prompt === 'string') return body.prompt.length;
  return (body.messages || []).reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : (m.content || []).reduce((k, p) => k + (p.text ? p.text.length : 0), 0)), 0);
}

export async function runOne(R, ctx, model, fixture, runIdx) {
  const shapes = requestShapes(R, model, fixture);
  let call = null, shapeUsed = null;
  for (const s of shapes) {
    call = await callModel({ ...ctx, model, body: s.body });
    shapeUsed = s.name;
    if (call.ok) break;
  }
  const row = { fixtureId: fixture.id, route: fixture.route, model, run: runIdx + 1, shape: shapeUsed, ok: call.ok, status: call.status, ms: call.ms };
  if (!call.ok) return { ...row, error: call.error, score: 0, schemaOk: false, jsonStrict: false, jsonRoute: false, costUsd: 0, costSource: 'none' };

  const text = R.aiText(call.result);
  const choice = call.result && call.result.choices && call.result.choices[0];
  let jsonStrict = false;
  try { JSON.parse(String(text).trim()); jsonStrict = true; } catch (_) { /* fences ou prose */ }
  const parsed = R.parseModelResponse(call.result);
  const validated = parsed ? (fixture.route === 'menu-import' ? R.validateMenuItems(parsed) : R.validateSalle(parsed)) : null;
  const scored = fixture.route === 'menu-import' ? scoreMenu(fixture, validated) : scoreSalle(fixture, validated);
  const usage = call.result && call.result.usage;
  const cost = estimateCost(model, usage, String(text).length, promptChars(shapes[0].body));
  return {
    ...row,
    finishReason: (choice && choice.finish_reason) || null,
    usage: usage ? {
      promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
      reasoningTokens: usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens,
    } : null,
    ...cost,
    jsonStrict, jsonRoute: parsed != null, schemaOk: validated != null && !validated.error,
    score: scored.score, metrics: scored.metrics, detail: scored.detail,
    rawHead: String(text).slice(0, 300),
  };
}

/* ── Agrégation et décision ────────────────────────────────────────────── */
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function percentile(xs, p) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export function summarize(rows, models) {
  const out = {};
  for (const model of models) {
    const mine = rows.filter((r) => r.model === model);
    const per = (route) => mine.filter((r) => r.route === route);
    const agg = (rs) => ({
      calls: rs.length,
      score: r4(mean(rs.map((r) => r.score))),
      jsonStrict: r4(mean(rs.map((r) => (r.jsonStrict ? 1 : 0)))),
      jsonRoute: r4(mean(rs.map((r) => (r.jsonRoute ? 1 : 0)))),
      schemaOk: r4(mean(rs.map((r) => (r.schemaOk ? 1 : 0)))),
      errors: rs.filter((r) => !r.ok).length,
      truncated: rs.filter((r) => r.finishReason === 'length').length,
      p50Ms: percentile(rs.map((r) => r.ms), 50), p95Ms: percentile(rs.map((r) => r.ms), 95),
      costPerCallUsd: rs.length ? mean(rs.map((r) => r.costUsd || 0)) : 0,
      costEstimated: rs.some((r) => r.costSource === 'estimate'),
    });
    const menuRows = per('menu-import'), salleRows = per('salle-import');
    out[model] = {
      all: agg(mine), menu: agg(menuRows), salle: agg(salleRows),
      menuPriceExact: r4(mean(menuRows.map((r) => (r.metrics ? r.metrics.priceExact : 0)))),
      menuF1: r4(mean(menuRows.map((r) => (r.metrics ? r.metrics.f1 : 0)))),
      menuCategoryAcc: r4(mean(menuRows.map((r) => (r.metrics ? r.metrics.categoryAcc : 0)))),
      salleCountExact: r4(mean(salleRows.map((r) => (r.metrics && r.metrics.tableCountExact ? 1 : 0)))),
    };
  }
  return out;
}

/* Un candidat contre la base. « PRIMARY-READY » : meilleur de 5 points de score
 * sur les cartes ET pas pire sur les prix, JSON lisible, peu d'erreurs, latence
 * tenable. « FALLBACK-OK » : pas pire que la base (marge 2 points) — assez bon
 * pour le secours. Sinon « REJECT », avec la raison. */
export function judge(summary, baseline, model) {
  const s = summary[model], b = summary[baseline];
  const reasons = [];
  if (!s || !b) return { verdict: 'N/A', reasons: ['modèle absent de la mesure'] };
  const errRate = s.all.calls ? s.all.errors / s.all.calls : 1;
  if (errRate > THRESHOLDS.maxErrorRate) reasons.push(`${s.all.errors}/${s.all.calls} appels en erreur`);
  if (s.all.jsonRoute < THRESHOLDS.minJsonRoute) reasons.push(`JSON lisible ${(s.all.jsonRoute * 100).toFixed(0)} % < ${THRESHOLDS.minJsonRoute * 100} %`);
  if (s.all.p50Ms > THRESHOLDS.maxP50Ms) reasons.push(`latence médiane ${s.all.p50Ms} ms`);
  const menuGain = s.menu.score - b.menu.score, salleGain = s.salle.score - b.salle.score;
  const nonInferior = menuGain >= -THRESHOLDS.nonInferiorMargin && (!s.salle.calls || salleGain >= -THRESHOLDS.nonInferiorMargin);
  if (!nonInferior) reasons.push(`pire que la base : cartes ${menuGain >= 0 ? '+' : ''}${(menuGain * 100).toFixed(1)} pts, salles ${salleGain >= 0 ? '+' : ''}${(salleGain * 100).toFixed(1)} pts`);
  if (reasons.length) return { verdict: 'REJECT', reasons };
  const better = menuGain >= THRESHOLDS.upgradeMargin && s.menuPriceExact >= b.menuPriceExact && (!s.salle.calls || salleGain >= 0);
  if (better) return { verdict: 'PRIMARY-READY', reasons: [`cartes +${(menuGain * 100).toFixed(1)} pts, prix exacts ${(s.menuPriceExact * 100).toFixed(0)} % contre ${(b.menuPriceExact * 100).toFixed(0)} %`] };
  return { verdict: 'FALLBACK-OK', reasons: [`non inférieur à la base (cartes ${menuGain >= 0 ? '+' : ''}${(menuGain * 100).toFixed(1)} pts), sans la battre de ${THRESHOLDS.upgradeMargin * 100} pts`] };
}

/* ── Rendu ─────────────────────────────────────────────────────────────── */
const short = (m) => m.replace('@cf/', '');
function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ');
  return [line(headers), line(w.map((n) => '-'.repeat(n))), ...rows.map(line)].join('\n');
}
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const usd = (x, est) => `${est ? '~' : ''}$${x.toFixed(5)}`;

export function renderReport(rows, summary, models, baseline) {
  const out = [];
  out.push('PAR MODÈLE');
  out.push(table(
    ['modèle', 'cartes', 'prix exacts', 'noms F1', 'catég.', 'salles', 'tables exactes', 'JSON nu', 'JSON route', 'erreurs', 'tronqués', 'p50 ms', 'p95 ms', '$/appel'],
    models.map((m) => {
      const s = summary[m];
      return [short(m), s.menu.score.toFixed(3), pct(s.menuPriceExact), pct(s.menuF1), pct(s.menuCategoryAcc), s.salle.score.toFixed(3), pct(s.salleCountExact),
        pct(s.all.jsonStrict), pct(s.all.jsonRoute), s.all.errors, s.all.truncated, s.all.p50Ms, s.all.p95Ms, usd(s.all.costPerCallUsd, s.all.costEstimated)];
    }),
  ));
  out.push('');
  out.push('PAR FIXTURE (score moyen sur les passages)');
  const fixtureIds = [...new Set(rows.map((r) => r.fixtureId))];
  out.push(table(
    ['fixture', ...models.map(short)],
    fixtureIds.map((id) => [id, ...models.map((m) => {
      const rs = rows.filter((r) => r.fixtureId === id && r.model === m);
      return rs.length ? mean(rs.map((r) => r.score)).toFixed(3) + (rs.some((r) => !r.ok) ? ' (err)' : '') : '-';
    })]),
  ));
  const errs = rows.filter((r) => !r.ok);
  if (errs.length) {
    out.push('');
    out.push('ERREURS');
    errs.slice(0, 12).forEach((r) => out.push(`  ${short(r.model)} · ${r.fixtureId} · passage ${r.run} · ${r.shape} · HTTP ${r.status} · ${r.error}`));
  }
  out.push('');
  out.push(`DÉCISION (base : ${short(baseline)})`);
  const verdicts = {};
  for (const m of models) {
    if (m === baseline) continue;
    const j = judge(summary, baseline, m);
    verdicts[m] = j;
    out.push(`  ${short(m)} : ${j.verdict} · ${j.reasons.join(' ; ')}`);
  }
  return { text: out.join('\n'), verdicts };
}

/* ── Orchestration ─────────────────────────────────────────────────────── */
export async function runEval({ fetchImpl, accountId, token, models, runs, fixtureSelect, timeoutMs, baseline, onRow }) {
  const R = await loadRoutes();
  const fixtures = loadFixtures(fixtureSelect);
  const redact = makeRedactor([token, accountId]);
  const ctx = { fetchImpl, accountId, token, timeoutMs, redact };
  const rows = [];
  for (const fixture of fixtures) {
    for (const model of models) {
      for (let i = 0; i < runs; i++) {
        const row = await runOne(R, ctx, model, fixture, i);
        rows.push(row);
        if (onRow) onRow(row);
      }
    }
  }
  const summary = summarize(rows, models);
  const rendered = renderReport(rows, summary, models, baseline);
  return { rows, summary, verdicts: rendered.verdicts, text: rendered.text, fixtures: fixtures.map((f) => ({ id: f.id, route: f.route, file: f.file, bytes: f.bytes })) };
}

/* ── Mode sec : tout sauf le réseau ────────────────────────────────────── */
function oracleText(f, tweak) {
  if (f.route === 'menu-import') {
    let items = f.items.map((i) => ({ name: i.name, price: i.price, cat: i.cat, sub: '', desc: '' }));
    if (tweak) {
      items = items.slice(0, -2); // deux articles perdus
      items[0] = { ...items[0], price: items[0].price + 0.5 }; // un prix faux
      items[1] = { ...items[1], cat: 'Divers' }; // une catégorie fausse
    }
    return JSON.stringify({ currency: 'MAD', items });
  }
  const s = f.salle;
  return JSON.stringify({ venue: s.venue, outdoor: tweak ? !s.outdoor : s.outdoor, counter: s.counter, tables: tweak ? s.tables.map((t, i) => (i ? t : { ...t, count: t.count + 1 })) : s.tables });
}

/* Un faux fetch qui se comporte comme l'API REST : il VÉRIFIE la requête (URL,
 * en-tête, forme du corps selon la famille du modèle) et répond avec l'enveloppe
 * de cette famille. Une requête mal formée renvoie 400 : c'est le test. */
export function makeFakeFetch(R, fixtures, { tweak = false, calls = [] } = {}) {
  const byImage = (dataUrl) => fixtures.find((f) => f.dataUrl === dataUrl);
  return async (url, init) => {
    const m = String(url).match(/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/([^/]+)\/ai\/run\/(@cf\/.+)$/);
    const fail = (code, message) => ({ ok: false, status: 400, json: async () => ({ success: false, errors: [{ code, message }], result: null }) });
    if (!m) return fail(7000, 'bad url');
    if (!/^Bearer \S+$/.test((init.headers || {}).Authorization || '')) return fail(10000, 'no bearer');
    const model = m[2];
    const body = JSON.parse(init.body);
    const family = R.visionFamily(model);
    let fixture = null;
    let shape = 'unknown';
    if (Array.isArray(body.messages)) {
      shape = 'messages';
      const parts = (body.messages.find((x) => x.role === 'user') || {}).content;
      const img = Array.isArray(parts) && parts.find((p) => p.type === 'image_url');
      if (!img || !/^data:image\/png;base64,/.test(img.image_url && img.image_url.url)) return fail(5006, 'image_url part missing');
      if ('image' in body || 'prompt' in body) return fail(5006, 'chat shape must not carry image/prompt');
      fixture = byImage(img.image_url.url);
    } else if (typeof body.prompt === 'string' && Array.isArray(body.image)) {
      shape = 'native';
      fixture = fixtures.find((f) => f.png.length === body.image.length && f.png[0] === body.image[0] && f.png[f.png.length - 1] === body.image[body.image.length - 1]);
    }
    if (!fixture) return fail(5006, 'unrecognised request shape');
    if (family === 'glm' && body.reasoning_effort !== 'low') return fail(5006, 'glm must carry reasoning_effort low');
    if (family !== 'glm' && 'reasoning_effort' in body) return fail(5006, 'reasoning_effort is not in this model schema');
    if (family === 'llama-vision' && shape === 'messages') return fail(5006, 'llama: messages shape refused (simulated)'); // exerce le repli natif
    calls.push({ model, shape, fixture: fixture.id });
    const text = oracleText(fixture, tweak);
    const result = family === 'llama-vision'
      ? { response: text }
      : { id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: '```json\n' + text + '\n```', refusal: null }, finish_reason: 'stop', logprobs: null }], usage: { prompt_tokens: 1800, completion_tokens: Math.ceil(text.length / 3.5), total_tokens: 0 } };
    return { ok: true, status: 200, json: async () => ({ success: true, errors: [], messages: [], result }) };
  };
}

export async function dryRun({ models = DEFAULT_MODELS, log = () => {} } = {}) {
  const R = await loadRoutes();
  const fixtures = loadFixtures('all');
  const problems = [];
  for (const f of fixtures) {
    if (f.png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') problems.push(`${f.file} : pas un PNG`);
    if (f.dataUrl.length > MAX_IMAGE_DATAURL) problems.push(`${f.file} : ${f.dataUrl.length} > ${MAX_IMAGE_DATAURL} (la route répondrait 413)`);
    if (f.route === 'menu-import' && !(f.items && f.items.length >= 10)) problems.push(`${f.id} : vérité terrain trop courte`);
    if (f.route === 'salle-import') {
      const sum = f.salle.tables.reduce((n, t) => n + t.count, 0);
      if (sum !== f.salle.tableCount) problems.push(`${f.id} : tableCount ${f.salle.tableCount} ≠ somme des groupes ${sum}`);
    }
  }
  const calls = [];
  const oracle = await runEvalWith(R, fixtures, models, makeFakeFetch(R, fixtures, { calls }));
  const noisy = await runEvalWith(R, fixtures, models, makeFakeFetch(R, fixtures, { tweak: true }));
  log(`  ${fixtures.length} fixtures · ${models.length} modèles · ${oracle.rows.length} requêtes simulées par passe`);
  return { problems, fixtures, oracle, noisy, calls };
}

async function runEvalWith(R, fixtures, models, fetchImpl) {
  const ctx = { fetchImpl, accountId: 'dry-account-id', token: 'dry-token-value', timeoutMs: 5000, redact: makeRedactor([]) };
  const rows = [];
  for (const fixture of fixtures) for (const model of models) rows.push(await runOne(R, ctx, model, fixture, 0));
  return { rows, summary: summarize(rows, models) };
}

/* ── CLI ───────────────────────────────────────────────────────────────── */
function parseArgs(argv) {
  const a = { models: DEFAULT_MODELS, runs: 2, fixtures: 'all', out: path.resolve(process.cwd(), 'ai-model-eval-report.json'), dry: false, timeoutMs: 120000, baseline: BASELINE_MODEL };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--dry') a.dry = true;
    else if (k === '--models') a.models = v().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--runs') a.runs = Math.max(1, Math.min(10, parseInt(v(), 10) || 1));
    else if (k === '--fixtures') a.fixtures = v();
    else if (k === '--out') a.out = path.resolve(process.cwd(), v());
    else if (k === '--timeout-ms') a.timeoutMs = Math.max(5000, parseInt(v(), 10) || 120000);
    else if (k === '--baseline') a.baseline = v();
    else if (k === '--help' || k === '-h') a.help = true;
    else { console.error(`option inconnue : ${k}`); process.exit(2); }
  }
  return a;
}

const HELP = `Usage : CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… node tools/ai-model-eval.mjs [options]
  --models a,b,c     modèles à comparer (défaut : llama-3.2-11b-vision, glm-5.3-flash, gemma-4-26b-a4b-it)
  --baseline <id>    modèle de référence de la décision (défaut : llama-3.2-11b-vision)
  --runs N           passages par fixture et par modèle, 1 à 10 (défaut 2)
  --fixtures X       all | menu | salle | id1,id2
  --out <fichier>    rapport JSON (défaut : ./ai-model-eval-report.json)
  --timeout-ms N     délai par appel (défaut 120000)
  --dry              hors réseau : valide les fixtures, les formes de requête et la notation`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return 0; }
  const invalid = args.models.filter((m) => !m.startsWith('@cf/'));
  if (invalid.length) { console.error(`Modèles refusés (politique : Workers AI @cf/ uniquement) : ${invalid.join(', ')}`); return 2; }
  if (!args.models.includes(args.baseline)) args.models = [args.baseline, ...args.models];

  if (args.dry) {
    console.log('■ ai-model-eval · mode sec (aucun appel réseau)');
    const d = await dryRun({ models: args.models, log: console.log });
    d.problems.forEach((p) => console.log(`  ✗ ${p}`));
    const o = d.oracle.summary, n = d.noisy.summary;
    const oracleOk = args.models.every((m) => o[m].all.score === 1 && o[m].all.errors === 0);
    const noisyLower = args.models.every((m) => n[m].all.score < o[m].all.score);
    console.log(`  ${oracleOk ? '✓' : '✗'} réponse parfaite → score 1.000 pour chaque modèle (notation et lecture des enveloppes GLM/Gemma/Llama)`);
    console.log(`  ${noisyLower ? '✓' : '✗'} réponse dégradée (articles perdus, prix et catégorie faux, table en trop) → score plus bas`);
    const llamaShapes = new Set(d.calls.filter((c) => c.model === BASELINE_MODEL).map((c) => c.shape));
    console.log(`  ✓ formes de requête validées par modèle : ${[...new Set(d.calls.map((c) => `${short(c.model)}=${c.shape}`))].join(', ')}`);
    if (args.models.includes(BASELINE_MODEL)) console.log(`  ${llamaShapes.size === 1 && llamaShapes.has('native') ? '✓' : '✗'} Llama : la forme messages refusée retombe sur la forme native { prompt, image }`);
    const ok = !d.problems.length && oracleOk && noisyLower;
    console.log(ok ? '\n✓ mode sec vert. Pour la mesure réelle : CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… node tools/ai-model-eval.mjs' : '\n✗ mode sec rouge');
    return ok ? 0 : 1;
  }

  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const missing = [!accountId && 'CLOUDFLARE_ACCOUNT_ID', !token && 'CLOUDFLARE_API_TOKEN'].filter(Boolean);
  if (missing.length) {
    console.error(`Variable(s) d'environnement manquante(s) : ${missing.join(', ')}.\nUsage : CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… node tools/ai-model-eval.mjs\n(Le jeton doit pouvoir appeler Workers AI. \`--dry\` valide tout sauf le réseau.)`);
    return 2;
  }

  console.log(`■ ai-model-eval · ${args.models.map(short).join(' · ')} · ${args.runs} passage(s) par fixture`);
  const result = await runEval({
    fetchImpl: fetch, accountId, token, models: args.models, runs: args.runs, fixtureSelect: args.fixtures,
    timeoutMs: args.timeoutMs, baseline: args.baseline,
    onRow: (r) => console.log(`  ${short(r.model).padEnd(28)} ${r.fixtureId.padEnd(26)} #${r.run} ${r.ok ? `score ${r.score.toFixed(3)} · ${r.ms} ms` : `ERREUR ${r.status} ${r.error}`}`),
  });
  console.log('\n' + result.text);

  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version, host: os.platform(),
    credentials: { accountIdSet: true, tokenSet: true }, // jamais les valeurs
    models: args.models, baseline: args.baseline, runs: args.runs,
    pricing: { perMillionTokensUsd: PRICING, asOf: PRICING_DATE }, thresholds: THRESHOLDS,
    fixtures: result.fixtures, summary: result.summary, verdicts: result.verdicts, results: result.rows,
  };
  fs.writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n');
  console.log(`\nRapport JSON : ${args.out}`);
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then((code) => process.exit(code), (e) => {
    const t = process.env.CLOUDFLARE_API_TOKEN, a = process.env.CLOUDFLARE_ACCOUNT_ID;
    console.error(makeRedactor([t, a])(e && e.stack || e));
    process.exit(1);
  });
}
