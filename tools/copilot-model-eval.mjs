#!/usr/bin/env node
/* Kiwi · mesure du modèle du copilote (functions/api/ai/ask.js) sur des MESURES.
 *
 *   node tools/copilot-model-eval.mjs --dry
 *   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… node tools/copilot-model-eval.mjs \
 *       --models @cf/openai/gpt-oss-120b,@cf/zai-org/glm-5.3-flash --passes 2
 *
 * Le copilote tourne en deux tours (ask.js) : « tools » (le modèle choisit un
 * outil ou répond), puis « answer » (il rédige à partir du résultat de l'outil,
 * tool_choice 'none'). Cette mesure rejoue les DEUX tours avec les vrais outils
 * et les vraies règles d'assistants/agent.js (LLM_TOOLS, TOOLS_RULE, FACTS_LEAD,
 * SP_DIR, lus dans le fichier, jamais recopiés) et les réglages d'ask.js
 * (max_tokens 700, temperature 0,7, top_p 0,8, reasoning_effort 'low').
 *
 * Ce qui est noté, de façon déterministe, sans modèle juge :
 *   · outil : le bon outil au premier tour (jamais propose_action avant d'avoir
 *     résolu l'identifiant), arguments JSON valides, dates plausibles ;
 *   · réponse : non vide, dans la langue de la question, sans markdown,
 *     AUCUN chiffre inventé (tout nombre vient de l'outil, de la question ou de
 *     la date du jour), et les chiffres clés présents ;
 *   · latence médiane et coût d'après les jetons facturés (`usage`).
 *
 * Limites assumées : prompt système compact (le vrai porte aussi le menu, le
 * guide des fonctions et les capacités du compte) ; données de test inventées ;
 * la réponse est lue sans flux (le format du flux se mesure à part). Le jeton
 * ne s'affiche ni ne s'écrit jamais. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const PRICING = { // dollars par million de jetons (entrée, sortie), pages modèles Workers AI, 2026-10-18
  '@cf/openai/gpt-oss-120b': [0.35, 0.75],
  '@cf/zai-org/glm-5.3-flash': [0.15, 0.5],
  '@cf/qwen/qwen3-30b-a3b-fp8': [0.051, 0.335],
};
const MODELS = opt('models', '@cf/openai/gpt-oss-120b,@cf/zai-org/glm-5.3-flash').split(',').filter(Boolean);
const PASSES = Math.max(1, Number(opt('passes', 2)));
const TODAY = '2026-10-18';

/* ── Les vrais textes de l'assistant, lus dans assets/agent.js ───────────── */
const src = fs.readFileSync(path.join(ROOT, 'assets/agent.js'), 'utf8');
function literal(name) {
  const m = src.match(new RegExp('const ' + name + ' = ("(?:[^"\\\\]|\\\\.)*")'));
  if (!m) throw new Error('introuvable dans agent.js : ' + name);
  return JSON.parse(m[1]);
}
const TOOLS_RULE = literal('TOOLS_RULE');
const FACTS_LEAD = literal('FACTS_LEAD');
function block(name, open, close) {
  const i = src.indexOf('const ' + name + ' = ' + open);
  if (i < 0) throw new Error('introuvable dans agent.js : ' + name);
  const j = src.indexOf(close, i);
  return src.slice(i + ('const ' + name + ' = ').length, j + close.length);
}
const LLM_TOOLS = new Function('return ' + block('LLM_TOOLS', '[', '\n  ];'))();
const SP_DIR = new Function('return ' + block('SP_DIR', '{', '\n  };'))();

const sysFor = (lang) => [
  SP_DIR[lang] || SP_DIR.fr,
  "Tu es l'assistant Kiwi d'un commerçant marocain (caisse, stock, tables, commandes). Réponds court, en une à trois phrases, sans markdown. Date du jour : " + TODAY + ' (dimanche).',
].join('\n');

/* ── Les scénarios, tous inventés ────────────────────────────────────────── */
const S = (id, lang, q, tool, result, needs, extra = {}) => ({ id, lang, q, tool, result, needs, ...extra });
export const SCENARIOS = [
  S('fr-ventes', 'fr', "Combien j'ai vendu hier ?", 'sales_between', { total_ttc_mad: 4820.5, tickets: 63, panier_moyen_mad: 76.52 }, [4820.5, 63], { day: '2026-10-17' }),
  S('ar-ventes', 'ar', 'كم بعت هذا الأسبوع؟', 'sales_between', { total_ttc_mad: 31250, tickets: 402, panier_moyen_mad: 77.74 }, [31250, 402]),
  S('en-top', 'en', 'What are my top 3 products this week?', 'top_products', { items: [{ name: 'Tajine kefta', qty: 41, ca_mad: 7380 }, { name: 'Couscous royal', qty: 28, ca_mad: 6160 }, { name: 'Thé à la menthe', qty: 96, ca_mad: 1920 }] }, [41, 28, 96]),
  S('fr-stock', 'fr', 'Il me reste combien de farine ?', 'stock_level', { items: [{ id: 'it_17', name: 'Farine T55 25 kg', qty: 3, unit: 'sac', seuil: 5 }] }, [3, 5]),
  S('ar-stock', 'ar', 'كم بقي من الحليب؟', 'stock_level', { items: [{ id: 'it_3', name: 'حليب', qty: 12, unit: 'لتر', seuil: 20 }] }, [12, 20]),
  S('en-tables', 'en', 'Which tables are occupied right now?', 'tables_now', { libres: 6, occupees: 4, reservees: 2, tables_occupees: [{ n: 3, addition_mad: 212 }, { n: 7, addition_mad: 96.5 }, { n: 8, addition_mad: 340 }, { n: 11, addition_mad: 58 }] }, [3, 7, 8, 11]),
  S('fr-commandes', 'fr', 'Quelles commandes sont ouvertes ?', 'orders_open', { orders: [{ id: 'o_412', numero: 118, statut: 'accepted', total_mad: 164 }, { id: 'o_413', numero: 119, statut: 'new', total_mad: 87.5 }] }, [118, 119, 164, 87.5]),
  S('da-ventes', 'fr', 'chhal bi3t lbare7?', 'sales_between', { total_ttc_mad: 4820.5, tickets: 63, panier_moyen_mad: 76.52 }, [4820.5, 63], { day: '2026-10-17', noLang: true }),
  S('en-action', 'en', 'Remove 2 bags of flour from stock', 'stock_level', { items: [{ id: 'it_17', name: 'Farine T55 25 kg', qty: 3, unit: 'sac', seuil: 5 }] }, [], { skipAnswer: true, notFirst: 'propose_action' }),
  S('fr-bonjour', 'fr', "Bonjour, tu peux m'aider ?", null, null, [], { skipAnswer: true }),
];

/* ── Notation ─────────────────────────────────────────────────────────────── */
const ASCII = (s) => String(s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
function toNumber(raw) {
  let t = ASCII(raw).replace(/[\s  ]/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(t.indexOf(',') < t.indexOf('.') ? /,/g : /\./g, '');
  else if (/,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
function numbersIn(text) {
  const cleaned = ASCII(text).split('\n').map((l) => l.replace(/^\s*\d+[.)]\s+/, '')).join('\n');
  return (cleaned.match(/\d[\d\s  .,]*\d|\d/g) || []).map(toNumber).filter((n) => n != null);
}
const near = (a, b) => Math.abs(a - b) < 0.011 || Math.abs(a - Math.round(b)) < 0.011 || Math.abs(Math.round(a) - Math.round(b)) < 0.011 && Math.abs(b) >= 1000;
function allowedNumbers(sc, args) {
  const pool = [...numbersIn(sc.q), ...numbersIn(TODAY), ...numbersIn(JSON.stringify(sc.result || {})), ...numbersIn(JSON.stringify(args || {}))];
  return pool;
}
const AR = /[؀-ۿ]/g, LAT = /[A-Za-zÀ-ÿ]/g;
const FRW = /\b(le|la|les|des|est|vous|avez|vos|il|reste|pour|dans|sont|une|un|de|du|hier|aujourd)\b/gi;
const ENW = /\b(the|you|your|is|are|have|has|today|right|now|this|week|tables|were|there|sold|total)\b/gi;
function langOk(text, lang) {
  const ar = (text.match(AR) || []).length, lat = (text.match(LAT) || []).length, letters = ar + lat || 1;
  if (lang === 'ar') return ar / letters >= 0.7;
  const fr = (text.match(FRW) || []).length, en = (text.match(ENW) || []).length;
  if (ar / letters > 0.1) return false;
  return lang === 'en' ? en >= 2 && fr <= 1 : fr >= 2 && en <= 1;
}
const hasMarkdown = (t) => /\*\*|^#{1,6}\s|^\s*[-*]\s|`/m.test(t);

/* ── Appels ───────────────────────────────────────────────────────────────── */
const account = process.env.CLOUDFLARE_ACCOUNT_ID || '', token = process.env.CLOUDFLARE_API_TOKEN || '';
async function run(model, payload) {
  const t0 = Date.now();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(90000),
  });
  let body = null; try { body = await res.json(); } catch (_) { /* non JSON */ }
  const ms = Date.now() - t0;
  if (!res.ok || (body && body.success === false)) {
    const why = body && Array.isArray(body.errors) && body.errors.length ? body.errors.map((e) => e.message).join('; ').slice(0, 160) : '';
    throw new Error('HTTP ' + res.status + (why ? ' · ' + why : ''));
  }
  const result = body && body.result ? body.result : body;
  return { result, ms };
}
const base = (messages, extra) => ({ messages, max_tokens: 700, temperature: 0.7, top_p: 0.8, reasoning_effort: 'low', ...extra });
const textOf = (r) => (typeof r === 'string' ? r : (r && (r.response ?? r.choices?.[0]?.message?.content)) || '');
const callsOf = (r) => { const m = r && r.choices && r.choices[0] ? r.choices[0].message : null; return (m && m.tool_calls) || (r && r.tool_calls) || []; };
const costOf = (model, r) => { const u = r && r.usage; const p = PRICING[model]; return u && p ? ((u.prompt_tokens || 0) * p[0] + (u.completion_tokens || 0) * p[1]) / 1e6 : 0; };

async function scenario(model, sc) {
  const out = { id: sc.id, tool: null, toolOk: null, argsOk: null, answerOk: null, lang: null, numbers: null, complete: null, md: null, ms: [], cost: 0, notes: [] };
  const sys = sysFor(sc.lang);
  const history = [{ role: 'system', content: sys }, { role: 'system', content: TOOLS_RULE }, { role: 'user', content: sc.q }];
  const r1 = await run(model, base(history, { tools: LLM_TOOLS, tool_choice: 'auto', stream: false }));
  out.ms.push(r1.ms); out.cost += costOf(model, r1.result);
  const calls = callsOf(r1.result);
  const first = calls[0] && (calls[0].function || calls[0]);
  out.tool = first ? first.name : null;
  let parsed = null;
  if (first) { try { parsed = typeof first.arguments === 'string' ? JSON.parse(first.arguments || '{}') : (first.arguments || {}); out.argsOk = true; } catch (_) { out.argsOk = false; } }
  if (sc.tool == null) { out.toolOk = !first; if (!first) { out.answerOk = textOf(r1.result).trim().length > 0; } return out; }
  out.toolOk = !!first && first.name === sc.tool && !(sc.notFirst && first.name === sc.notFirst);
  if (out.toolOk && sc.tool === 'sales_between') {
    const rx = /^\d{4}-\d{2}-\d{2}$/;
    out.argsOk = !!parsed && rx.test(parsed.from || '') && rx.test(parsed.to || '') && parsed.from <= parsed.to && parsed.to <= TODAY && (!sc.day || (parsed.from === sc.day && parsed.to === sc.day));
    if (!out.argsOk) out.notes.push('dates ' + JSON.stringify(parsed));
  } else if (out.toolOk && sc.tool === 'stock_level') {
    out.argsOk = !!parsed && typeof parsed.query === 'string' && parsed.query.length > 0;
  } else if (out.toolOk && sc.tool === 'top_products') {
    out.argsOk = !!parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(parsed.to || '');
  }
  if (sc.skipAnswer || !out.toolOk) return out;
  const id = (first.id || 'call_1');
  const msgs = history.concat([
    { role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: sc.tool, arguments: JSON.stringify(parsed || {}) } }] },
    { role: 'tool', tool_call_id: id, name: sc.tool, content: JSON.stringify(sc.result) },
  ]);
  const r2 = await run(model, base(msgs, { tools: LLM_TOOLS, tool_choice: 'none', stream: false }));
  out.ms.push(r2.ms); out.cost += costOf(model, r2.result);
  const text = textOf(r2.result).trim();
  out.answerOk = text.length > 0;
  if (!text) return out;
  out.md = !hasMarkdown(text);
  out.lang = sc.noLang ? null : langOk(text, sc.lang);
  const allowed = allowedNumbers(sc, parsed);
  const got = numbersIn(text);
  const invented = got.filter((n) => !allowed.some((a) => near(n, a)));
  out.numbers = invented.length === 0;
  if (invented.length) out.notes.push('inventé ' + invented.join(','));
  out.complete = sc.needs.every((n) => got.some((g) => near(g, n)));
  if (!out.complete) out.notes.push('manque ' + sc.needs.filter((n) => !got.some((g) => near(g, n))).join(','));
  if (out.lang === false) out.notes.push('langue : ' + text.slice(0, 70).replace(/\n/g, ' '));
  return out;
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + ' %' : 'n/a');
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function summarize(model, rows, errors) {
  const c = (k) => { const v = rows.map((r) => r[k]).filter((x) => x !== null && x !== undefined); return pct(v.filter(Boolean).length, v.length) + ' (' + v.filter(Boolean).length + '/' + v.length + ')'; };
  console.log(`\n■ ${model} · ${rows.length} passages · ${errors.length} erreurs d'appel`);
  console.log('  bon outil au 1er tour : ' + c('toolOk'));
  console.log('  arguments valides     : ' + c('argsOk'));
  console.log('  réponse non vide      : ' + c('answerOk'));
  console.log('  bonne langue          : ' + c('lang'));
  console.log('  sans markdown         : ' + c('md'));
  console.log('  AUCUN chiffre inventé : ' + c('numbers'));
  console.log('  chiffres clés présents: ' + c('complete'));
  console.log('  latence médiane / tour: ' + Math.round(median(rows.flatMap((r) => r.ms))) + ' ms · coût moyen / question : ' + (rows.reduce((s, r) => s + r.cost, 0) / Math.max(1, rows.length) * 100).toFixed(4) + ' cents');
  for (const r of rows) { if (r.notes.length || r.toolOk === false) console.log(`    · ${r.id} : ${r.toolOk === false ? 'outil=' + r.tool + ' ' : ''}${r.notes.join(' | ')}`); }
  for (const e of errors) console.log('    ! ' + e);
}

async function main() {
  if (flag('dry')) {
    console.log(`Outils lus : ${LLM_TOOLS.map((t) => t.function.name).join(', ')}`);
    console.log(`Langues SP_DIR : ${Object.keys(SP_DIR).join(', ')} · TOOLS_RULE ${TOOLS_RULE.length} car. · FACTS_LEAD ${FACTS_LEAD.length} car.`);
    console.log(`${SCENARIOS.length} scénarios, ${MODELS.length} modèle(s), ${PASSES} passage(s). Aucun appel réseau.`);
    const probe = ['Vous avez vendu 4 820,50 MAD hier, soit 63 tickets.', 'بعتَ ٣١٢٥٠ درهماً هذا الأسبوع في 402 تذكرة.'];
    console.log('Notation : ' + probe.map((t) => numbersIn(t).join('/')).join(' ; ') + ' · langue ' + langOk(probe[0], 'fr') + '/' + langOk(probe[1], 'ar'));
    return;
  }
  if (!account || !token) { console.error('Définissez CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN, ou lancez avec --dry.'); process.exit(2); }
  console.log(`Copilote · ${SCENARIOS.length} scénarios × ${PASSES} passage(s) · ${MODELS.join(' | ')}`);
  for (const model of MODELS) {
    const rows = [], errors = [];
    const jobs = [];
    for (let p = 0; p < PASSES; p++) for (const sc of SCENARIOS) jobs.push(sc);
    let next = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < jobs.length) {
        const sc = jobs[next++];
        try { rows.push(await scenario(model, sc)); } catch (e) { errors.push(sc.id + ' · ' + String(e.message || e).replace(token, '***')); }
      }
    }));
    rows.sort((a, b) => a.id.localeCompare(b.id));
    summarize(model, rows, errors);
  }
}
main();
