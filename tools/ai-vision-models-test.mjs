#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · duo vision (GLM 5.3 Flash → Gemma 4 26B) : chaque modèle reçoit SA forme
 * de requête, et l'outil d'évaluation (tools/ai-model-eval.mjs) tient hors réseau.
 *
 *   node tools/ai-vision-models-test.mjs
 *
 * `env.AI.run` est simulé : on assert la REQUÊTE reçue par chaque modèle, pas
 * une réponse. Un payload à la mauvaise forme échoue en silence dans le secours
 * (le modèle refuse, la route répond « illisible »), donc c'est ici qu'il se voit.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AI_DIR = path.join(ROOT, 'functions/api/ai');
const imp = (f) => import(pathToFileURL(path.join(AI_DIR, f)).href);

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ ${msg}`); }
}
console.log('■ Duo vision & évaluation (tools/ai-vision-models-test.mjs)');

const GLM = '@cf/zai-org/glm-5.3-flash';
const GEMMA = '@cf/google/gemma-4-26b-a4b-it';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DATA_URL = `data:image/png;base64,${PNG_B64}`;
const GOOD_MENU = { choices: [{ finish_reason: 'stop', message: { content: '{"currency":"MAD","items":[{"name":"Café","price":14.5,"cat":"Cafés"}]}' } }] };

const vision = await imp('_vision.js');
const menu = await imp('menu-import.js');
const salle = await imp('salle-import.js');

/* Un env.AI qui journalise chaque appel et répond selon un script. */
function mockAi(script) {
  const calls = [];
  return { calls, env: { AI: { run: async (model, payload, opts) => { calls.push({ model, payload, opts }); return script(model, payload, calls.length); } } } };
}
const userParts = (payload) => ((payload.messages || []).find((m) => m.role === 'user') || {}).content;
const imageUrlOf = (payload) => { const p = Array.isArray(userParts(payload)) && userParts(payload).find((x) => x.type === 'image_url'); return p && p.image_url && p.image_url.url; };
const hasChatShape = (payload) => Array.isArray(payload.messages) && imageUrlOf(payload) === DATA_URL && !('image' in payload) && !('prompt' in payload);

// ── 1. Familles et traduction de payload ─────────────────────────────────────
ok(vision.visionFamily(GLM) === 'glm' && vision.visionFamily(GEMMA) === 'gemma' && vision.visionFamily('@cf/meta/llama-3.2-11b-vision-instruct') === 'llama-vision' && vision.visionFamily('@cf/qwen/qwen3-30b-a3b-fp8') === 'other', 'visionFamily reconnaît GLM, Gemma, Llama vision et le reste');
ok(vision.VISION_PRIMARY_MODEL === GLM && vision.VISION_FALLBACK_MODEL === GEMMA, '_vision.js : primaire GLM 5.3 Flash, secours Gemma 4 26B');

const base = { messages: vision.visionMessages({ system: 'SYS', text: 'TXT', dataUrl: DATA_URL }), max_tokens: 900, temperature: 0.1, top_p: 0.9, reasoning_effort: 'low' };
const forGlm = vision.payloadForModel(GLM, base);
const forGemma = vision.payloadForModel(GEMMA, base);
ok(forGlm.reasoning_effort === 'low' && hasChatShape(forGlm), 'GLM : messages + image_url (URL data:), reasoning_effort « low » conservé');
ok(!('reasoning_effort' in forGemma) && hasChatShape(forGemma) && forGemma.max_tokens === 900 && forGemma.temperature === 0.1, 'Gemma : mêmes messages image_url, SANS reasoning_effort (absent de son schéma), bornes conservées');
ok(base.reasoning_effort === 'low', 'payloadForModel ne mute pas la requête d\'origine (le secours reçoit une copie)');
const parts = userParts(base);
ok(parts[0].type === 'text' && parts[1].type === 'image_url' && base.messages[0].role === 'system' && typeof base.messages[0].content === 'string', 'visionMessages : système (chaîne) puis utilisateur [texte, image_url]');

const native = vision.nativeLlamaPayload(base);
const decoded = Buffer.from(PNG_B64, 'base64');
ok(Array.isArray(native.image) && native.image.length === decoded.length && native.image.every((b, i) => b === decoded[i]), 'forme native Llama : image = octets exacts de l\'URL data:');
ok(native.prompt.startsWith('SYS') && native.prompt.includes('TXT') && !('messages' in native) && native.max_tokens === 900, 'forme native Llama : { prompt (système + texte), image, max_tokens }, pas de messages');

// ── 2. menu-import et salle-import : primaire GLM, secours Gemma ─────────────
for (const [name, mod, run] of [['menu-import', menu, (env) => menu.runVision(env, DATA_URL)], ['salle-import', salle, (env) => salle.runVision(env, DATA_URL)]]) {
  ok(mod.VISION_MODEL === GLM && mod.VISION_FALLBACK_MODEL === GEMMA, `${name} : VISION_MODEL = GLM 5.3 Flash, VISION_FALLBACK_MODEL = Gemma 4 26B`);

  const happy = mockAi(() => GOOD_MENU);
  const r1 = await run(happy.env);
  ok(happy.calls.length === 1 && happy.calls[0].model === GLM && r1.model === GLM, `${name} : GLM lit d'abord, un seul appel quand il répond`);
  ok(hasChatShape(happy.calls[0].payload) && happy.calls[0].payload.reasoning_effort === 'low', `${name} : requête GLM = chat image_url + reasoning_effort « low »`);
  ok(happy.calls[0].opts && happy.calls[0].opts.gateway && happy.calls[0].opts.gateway.id === 'kiwi' && happy.calls[0].opts.gateway.cacheTtl === 0, `${name} : l'appel passe par la passerelle « kiwi », cacheTtl 0`);

  const failover = mockAi((model) => { if (model === GLM) throw new Error('InferenceUpstreamError: 502 bad gateway'); return GOOD_MENU; });
  const r2 = await run(failover.env);
  ok(failover.calls.length === 2 && failover.calls[1].model === GEMMA && r2.model === GEMMA, `${name} : une panne de GLM bascule sur Gemma (2 appels, jamais 3)`);
  ok(hasChatShape(failover.calls[1].payload) && !('reasoning_effort' in failover.calls[1].payload), `${name} : la requête Gemma garde l'image_url et perd reasoning_effort`);
  ok(JSON.stringify(failover.calls[1].payload.messages) === JSON.stringify(failover.calls[0].payload.messages), `${name} : GLM et Gemma lisent exactement les mêmes messages (même prompt)`);

  const limited = mockAi(() => { const e = new Error('429 rate limit'); e.status = 429; throw e; });
  let threw = null;
  try { await run(limited.env); } catch (e) { threw = e; }
  ok(threw && limited.calls.length === 1, `${name} : un refus de quota/politique (429) n'est JAMAIS contourné par le secours`);

  let agreed = false;
  const gated = mockAi((model, payload) => {
    if (payload.prompt === 'agree') { agreed = true; return {}; }
    if (!agreed) throw new Error("5016: submit the prompt 'agree' to accept the license");
    return GOOD_MENU;
  });
  const r3 = await run(gated.env);
  const agrees = gated.calls.filter((c) => c.payload.prompt === 'agree');
  ok(r3.result === GOOD_MENU && agrees.length === 2 && agrees.every((c) => c.payload.max_tokens === 16), `${name} : erreur 5016 (licence) → « agree » borné à 16 tokens sur chaque modèle, puis relance`);

  const dead = mockAi(() => { throw new Error('boom'); });
  threw = null;
  try { await run(dead.env); } catch (e) { threw = e; }
  ok(threw && dead.calls.length === 2, `${name} : les deux modèles en panne → la route reçoit l'erreur (réponse dégradée { ok:false, reason:'model' }), pas de boucle`);
}

// ── 3. Prompts et bornes des constructeurs de routes ─────────────────────────
const menuPayload = menu.buildMenuVisionPayload(DATA_URL, 'fr');
const menuUserText = userParts(menuPayload)[0].text;
ok(!/traduis-les/i.test(menuUserText) && /sans traduire/i.test(menuUserText), 'menu-import : le message utilisateur ne demande plus de traduire (le système l\'interdit)');
ok(menuPayload.messages[0].content === menu.buildSystemPrompt('fr') && menuPayload.reasoning_effort === 'low' && menuPayload.max_tokens >= 6000, 'menu-import : prompt système réel, reasoning_effort « low », budget de sortie pour les grandes cartes');
const sallePayload = salle.buildSallePayload(DATA_URL);
ok(sallePayload.messages[0].content === salle.SYSTEM_PROMPT && sallePayload.reasoning_effort === 'low' && imageUrlOf(sallePayload) === DATA_URL, 'salle-import : prompt système réel, image_url, reasoning_effort « low »');

// ── 4. Les neuf routes vision : même duo, même aiguillage ────────────────────
const VISION_ROUTES = [
  ['expense-ocr.js', 'VISION_MODEL', 'VISION_FALLBACK_MODEL'], ['product-scan.js', 'VISION_MODEL', 'VISION_FALLBACK_MODEL'],
  ['product-enhance.js', 'VISION_MODEL', 'VISION_FALLBACK_MODEL'], ['pressing-defect.js', 'VISION_MODEL', 'VISION_FALLBACK_MODEL'],
  ['recipe-suggest.js', 'VISION_MODEL', 'VISION_FALLBACK_MODEL'], ['tpe-reconcile.js', 'VISION_MODEL', 'VISION_FALLBACK_MODEL'],
  ['vision-inspect.js', 'MODEL', 'FALLBACK_MODEL'], ['menu-import.js', 'VISION_MODEL', 'VISION_FALLBACK_MODEL'], ['salle-import.js', 'VISION_MODEL', 'VISION_FALLBACK_MODEL'],
];
for (const [file, primaryKey, fallbackKey] of VISION_ROUTES) {
  const mod = await imp(file);
  const src = fs.readFileSync(path.join(AI_DIR, file), 'utf8');
  ok(mod[primaryKey] === GLM && mod[fallbackKey] === GEMMA, `${file} : primaire GLM 5.3 Flash, secours Gemma 4 26B`);
  ok(/runVisionPair\(/.test(src) && !/runWithFallback\(env, VISION_MODEL/.test(src) && !/runWithPayloadFallback\(/.test(src), `${file} : la lecture d'image passe par runVisionPair (forme de requête par modèle)`);
}
const routeSources = fs.readdirSync(AI_DIR).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(AI_DIR, f), 'utf8')]);
const llamaLeft = routeSources.filter(([, s]) => /['"]@cf\/meta\/llama-3\.2-11b-vision-instruct['"]/.test(s)).map(([f]) => f);
ok(llamaLeft.length === 0, 'plus aucune route AI ne nomme llama-3.2-11b-vision' + (llamaLeft.length ? ' : ' + llamaLeft.join(', ') : ''));

// ── 5. L'outil d'évaluation tient hors réseau ────────────────────────────────
const ev = await import(pathToFileURL(path.join(ROOT, 'tools/ai-model-eval.mjs')).href);
const dry = await ev.dryRun({ models: ev.DEFAULT_MODELS });
ok(dry.problems.length === 0 && dry.fixtures.length === 6, 'fixtures : 6 PNG valides, sous la borne des routes, vérité terrain cohérente' + (dry.problems.length ? ' · ' + dry.problems.join(' ; ') : ''));
ok(ev.DEFAULT_MODELS.every((m) => dry.oracle.summary[m].all.score === 1 && dry.oracle.summary[m].all.errors === 0), 'réponse parfaite → score 1 pour GLM, Gemma et Llama (enveloppes choices[] et response lues)');
ok(ev.DEFAULT_MODELS.every((m) => dry.noisy.summary[m].all.score < 0.95), 'réponse dégradée → score nettement plus bas');
const shapesSeen = new Set(dry.calls.map((c) => `${c.model}=${c.shape}`));
ok(shapesSeen.has(`${GLM}=messages`) && shapesSeen.has(`${GEMMA}=messages`) && shapesSeen.has('@cf/meta/llama-3.2-11b-vision-instruct=native'), 'le faux API valide la forme de chaque modèle (chat pour GLM/Gemma ; native après refus pour Llama)');

const truth = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/ai-eval/truth.json'), 'utf8')).fixtures;
const bi = truth.find((f) => f.id === 'menu-bilingual-fr-ar');
const perfect = { items: bi.items.map((i) => ({ name: `${i.name} / ${i.aliases[0]}`, price: i.price, cat: `${i.cat} / ${i.catAliases[0]}` })) };
ok(ev.scoreMenu(bi, perfect).score === 1, 'notation : un libellé bilingue « Harira / حريرة » vaut le plat, catégorie bilingue comprise');
const arabicOnly = { items: bi.items.map((i) => ({ name: i.aliases[0], price: i.price, cat: i.catAliases[0] })) };
ok(ev.scoreMenu(bi, arabicOnly).score === 1, 'notation : les noms lus en arabe seul comptent aussi (alias de la vérité terrain)');
const oneCentOff = { items: bi.items.map((i, k) => ({ name: i.name, price: k === 0 ? i.price + 0.01 : i.price, cat: i.cat })) };
const cm = ev.scoreMenu(bi, oneCentOff);
ok(cm.metrics.priceExact < 1 && cm.detail.some((d) => d.startsWith('prix ')), 'notation : un centime d\'écart sur un prix est une erreur de prix');
ok(ev.scoreMenu(bi, null).score === 0 && ev.scoreSalle(truth.find((f) => f.route === 'salle-import'), null).score === 0, 'notation : aucune lecture → score 0 (jamais NaN)');
ok(ev.similarity('Thé à la menthe', 'THE A LA MENTHE') === 1 && ev.normalize('أتَاي') === ev.normalize('اتاي'), 'normalisation : casse, accents, voyelles brèves arabes ignorés');

/* Le jeton ne sort jamais, même quand l'API le recopie dans une erreur. */
const SECRET = 'tok_SECRET_value_9f8e7d6c';
const ACCT = 'acct_1234567890abcdef';
const leakyFetch = async () => ({ ok: false, status: 401, json: async () => ({ success: false, errors: [{ code: 10000, message: `Authentication error for ${SECRET} on ${ACCT}` }] }) });
const leaked = await ev.runEval({ fetchImpl: leakyFetch, accountId: ACCT, token: SECRET, models: [GLM], runs: 1, fixtureSelect: 'menu-cafe-fr', timeoutMs: 5000, baseline: GLM });
const blob = JSON.stringify(leaked.rows) + leaked.text;
ok(!blob.includes(SECRET) && !blob.includes(ACCT) && leaked.rows[0].error.includes('***'), 'secrets : jeton et identifiant de compte expurgés des erreurs, du tableau et du rapport');
ok(leaked.rows.length === 1 && leaked.rows[0].ok === false && leaked.rows[0].score === 0, 'une erreur HTTP 401 est un appel en erreur noté 0, sans nouvel essai ni exception');

const full = await ev.runEval({ fetchImpl: ev.makeFakeFetch(await ev.loadRoutes(), ev.loadFixtures('all')), accountId: 'a-dry-account', token: 'a-dry-token', models: ev.DEFAULT_MODELS, runs: 1, fixtureSelect: 'all', timeoutMs: 5000, baseline: ev.BASELINE_MODEL });
ok(/DÉCISION/.test(full.text) && full.verdicts[GLM] && full.verdicts[GEMMA] && full.verdicts[GLM].verdict === 'FALLBACK-OK', 'rapport : tableau par modèle et par fixture, puis décision (à égalité avec la base : « FALLBACK-OK », pas « PRIMARY-READY »)');

if (failures.length) {
  console.log(`\n✗ ${failures.length} échec(s)`);
  process.exit(1);
}
console.log(`\n✓ ${passed} contrôles verts`);
