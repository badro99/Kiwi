#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · AI routes test — gateway, fallback, quota per kind & diagnostics
 *
 *   node tools/ai-routes-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

console.log('■ AI routes & gateway test (tools/ai-routes-test.mjs)');

// ── 1. Static extraction from ask.js ─────────────────────────────────────────
const askSrc = fs.readFileSync(path.join(ROOT, 'functions/api/ai/ask.js'), 'utf8');

const runSrc = fs.readFileSync(path.join(ROOT, 'functions/api/ai/_run.js'), 'utf8');
ok(/gateway:\s*\{\s*id:\s*'kiwi',\s*cacheTtl:\s*0\s*\}/.test(runSrc), '_run.js configures AI Gateway id "kiwi" with cacheTtl: 0');
ok(/from '\.\/_run\.js'/.test(askSrc) && !/gateway:\s*\{/.test(askSrc), 'ask.js imports the shared gateway runner (no local copy)');

ok(/export const MODEL = '@cf\/openai\/gpt-oss-120b'/.test(askSrc), 'ask.js primary model is @cf/openai/gpt-oss-120b');
ok(/export const FALLBACK_MODEL = '@cf\/qwen\/qwen3-30b-a3b-fp8'/.test(askSrc), 'ask.js fallback model is @cf/qwen/qwen3-30b-a3b-fp8');
/* gpt-oss without reasoning_effort spends max_tokens thinking and returns
 * content:null (observed 2026-08-19). The payload MUST carry it. */
ok(/reasoning_effort:\s*REASONING_EFFORT/.test(askSrc) && /const REASONING_EFFORT = 'low'/.test(askSrc), 'ask.js payload carries reasoning_effort: low');

const modelHeaderMatch = askSrc.match(/['"]x-kiwi-ai-model['"]:\s*usedModel/);
ok(!!modelHeaderMatch, 'ask.js returns x-kiwi-ai-model header with used model');

const askQuotaCall = askSrc.match(/quotaOk\(\s*env,\s*who,\s*['"]ask['"]/);
ok(!!askQuotaCall, 'ask.js calls quotaOk with kind "ask"');

// ── 2. Static extraction from invoice.js ─────────────────────────────────────
const invSrc = fs.readFileSync(path.join(ROOT, 'functions/api/ai/invoice.js'), 'utf8');

ok(/from '\.\/_run\.js'/.test(invSrc) && !/gateway:\s*\{/.test(invSrc), 'invoice.js imports the shared gateway runner (no local copy)');
ok(/export const MODEL = '@cf\/qwen\/qwen3-30b-a3b-fp8'/.test(invSrc), 'invoice.js primary model stays @cf/qwen/qwen3-30b-a3b-fp8');
ok(/export const FALLBACK_MODEL = '@cf\/zai-org\/glm-4.7-flash'/.test(invSrc), 'invoice.js fallback model is @cf/zai-org/glm-4.7-flash');

// ── 2b. Every model id in every AI route is Cloudflare-hosted ─────────────────
/* A third-party id (openai/, anthropic/, google/, x-ai/…) through the same
 * binding would silently send merchant text off Cloudflare. Every quoted model
 * id in functions/api/ai/*.js must start with @cf/. */
const aiDir = path.join(ROOT, 'functions/api/ai');
const aiFiles = fs.readdirSync(aiDir).filter(f => f.endsWith('.js'));
let badIds = [];
for (const f of aiFiles) {
  const src = fs.readFileSync(path.join(aiDir, f), 'utf8');
  for (const m of src.matchAll(/['"]((?:@cf\/|openai\/|anthropic\/|google\/|x-ai\/|xai\/|deepseek\/|alibaba\/|meta\/)[^'"]+)['"]/g)) {
    if (!m[1].startsWith('@cf/')) badIds.push(f + ':' + m[1]);
  }
}
ok(aiFiles.length >= 4, `AI routes directory scanned (${aiFiles.length} files)`);
ok(badIds.length === 0, 'every model id in functions/api/ai/*.js is Cloudflare-hosted (@cf/)' + (badIds.length ? ' — ' + badIds.join(', ') : ''));

// ── 2c. Browser reader handles both stream shapes (extracted from agent.js) ──
const agentSrc = fs.readFileSync(path.join(ROOT, 'assets/agent.js'), 'utf8');
const chunkFnMatch = agentSrc.match(/function llmChunkText\(o\) \{[\s\S]*?\n  \}\n/);
ok(!!chunkFnMatch, 'agent.js defines llmChunkText(o)');
const llmChunkText = chunkFnMatch ? new Function(chunkFnMatch[0] + '; return llmChunkText;')() : () => { throw new Error('llmChunkText not extracted'); };
ok(llmChunkText({ response: 'Bonjour' }) === 'Bonjour', 'Qwen shape {response} yields the text');
ok(llmChunkText({ choices: [{ delta: { content: 'La marge', role: 'assistant' } }] }) === 'La marge', 'OpenAI shape choices[0].delta.content yields the text');
ok(llmChunkText({ choices: [{ delta: { reasoning: 'User asks 33.33%', reasoning_content: 'User asks 33.33%' } }] }) === '', 'a reasoning delta yields nothing (never reaches screen or redactor)');
ok(llmChunkText({ choices: [] , usage: { neurons: 0 } }) === '' && llmChunkText({ response: '', usage: {} }) === '' && llmChunkText(null) === '', 'empty choices / empty response / null yield nothing');
ok(agentSrc.split('llmChunkText(JSON.parse(payload))').length === 3, 'cloudDeltas uses llmChunkText in both the loop and the tail read');
ok(!/if \(o && o\.response\) yield String\(o\.response\)/.test(agentSrc), 'the old {response}-only reader is gone');
ok(invSrc.includes("'x-kiwi-ai-model': usedModel") || invSrc.includes('"x-kiwi-ai-model": usedModel'), 'invoice.js sets x-kiwi-ai-model header');

const invQuotaCall = invSrc.match(/quotaOk\(\s*env,\s*who,\s*['"]invoice['"]/);
ok(!!invQuotaCall, 'invoice.js calls quotaOk with kind "invoice"');

const menuOperationsSrc = fs.readFileSync(path.join(ROOT, 'functions/api/ai/menu-operations.js'), 'utf8');
ok(/const DAILY_CAP = 60;/.test(menuOperationsSrc), 'menu-operations.js caps each merchant at 60 calls per day');
ok(/quotaOk\(\s*env,\s*merchant,\s*['"]menuoperations['"],\s*DAILY_CAP\s*\)/.test(menuOperationsSrc)
  && !/quotaOk\(\s*env,\s*merchant,\s*['"]menuimport['"]/.test(menuOperationsSrc),
  'menu-operations.js uses its own menuoperations quota bucket');

// ── 3. Static extraction from schema.sql ─────────────────────────────────────
const schemaSrc = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
ok(schemaSrc.includes('CREATE TABLE IF NOT EXISTS ai_usage_kind'), 'schema.sql defines ai_usage_kind table');
ok(schemaSrc.includes('PRIMARY KEY (merchant, day, kind)'), 'schema.sql sets PRIMARY KEY (merchant, day, kind)');

// ── 4. Unit tests: functions/api/ai/_quota.js ────────────────────────────────
const { quotaOk, ensureAiUsageSchema, DAILY_CAPS } = await import(path.join(ROOT, 'functions/api/ai/_quota.js'));

ok(DAILY_CAPS.ask === 200, 'DAILY_CAPS.ask is 200');
ok(DAILY_CAPS.invoice === 200, 'DAILY_CAPS.invoice is 200');
ok(DAILY_CAPS.image === 20, 'DAILY_CAPS.image is 20');

// Mock D1 implementation
function createMockDb() {
  const store = new Map(); // key: "merchant:day:kind" -> calls
  let schemaEnsured = false;
  return {
    prepare(sql) {
      if (sql.startsWith('CREATE TABLE')) {
        return {
          run: async () => { schemaEnsured = true; return {}; }
        };
      }
      if (sql.startsWith('SELECT calls')) {
        return {
          bind: (merchant, day, kind) => ({
            first: async () => {
              const k = `${merchant}:${day}:${kind}`;
              if (!store.has(k)) return null;
              return { calls: store.get(k) };
            }
          })
        };
      }
      if (sql.startsWith('INSERT INTO ai_usage_kind')) {
        return {
          bind: (merchant, day, kind) => ({
            run: async () => {
              const k = `${merchant}:${day}:${kind}`;
              const cur = store.get(k) || 0;
              store.set(k, cur + 1);
              return {};
            }
          })
        };
      }
      throw new Error('Unknown SQL: ' + sql);
    },
    getStore: () => store,
    isSchemaEnsured: () => schemaEnsured,
  };
}

const mockDb = createMockDb();
const envWithDb = { DB: mockDb };

// Fail-soft with null env / null DB
const noDbResult = await quotaOk({}, 'test-m', 'ask', 200);
ok(noDbResult === true, 'quotaOk returns true when DB is unbound (fail-soft)');

// Normal increments
const q1 = await quotaOk(envWithDb, 'm1', 'ask', 2);
ok(q1 === true, 'first call succeeds within cap');
ok(mockDb.isSchemaEnsured(), 'ensureAiUsageSchema executed');

const q2 = await quotaOk(envWithDb, 'm1', 'ask', 2);
ok(q2 === true, 'second call succeeds within cap');

const q3 = await quotaOk(envWithDb, 'm1', 'ask', 2);
ok(q3 === false, 'third call rejected when cap=2 reached');

// Kind isolation: invoice should have its own count
const qInv = await quotaOk(envWithDb, 'm1', 'invoice', 2);
ok(qInv === true, 'invoice call succeeds independently from ask cap');

await quotaOk(envWithDb, 'm2', 'menuimport', 1);
const exhaustedMenuImport = await quotaOk(envWithDb, 'm2', 'menuimport', 1);
const isolatedMenuOperations = await quotaOk(envWithDb, 'm2', 'menuoperations', 60);
ok(exhaustedMenuImport === false && isolatedMenuOperations === true,
  'menu-operations quota remains available when menu-import is exhausted');

// ── 5. Runtime tests: ask.js gateway & fallback logic ────────────────────────
const { runAiWithGateway, onRequestPost: askPost, MODEL, FALLBACK_MODEL } = await import(path.join(ROOT, 'functions/api/ai/ask.js'));

// Test runAiWithGateway:
let aiCalls = [];
const mockEnvWorkingGateway = {
  AI: {
    run: async (model, payload, opts) => {
      aiCalls.push({ model, payload, opts });
      return 'stream-ok';
    }
  }
};

aiCalls = [];
const resGateway = await runAiWithGateway(mockEnvWorkingGateway, MODEL, { test: 1 });
ok(resGateway === 'stream-ok', 'runAiWithGateway succeeds on first try with gateway');
ok(aiCalls.length === 1 && aiCalls[0].opts && aiCalls[0].opts.gateway && aiCalls[0].opts.gateway.id === 'kiwi',
   'runAiWithGateway passes gateway options to env.AI.run');

// Test runAiWithGateway when gateway throws -> retries without gateway
const mockEnvFailingGateway = {
  AI: {
    run: async (model, payload, opts) => {
      aiCalls.push({ model, payload, opts });
      if (opts && opts.gateway) throw new Error('Gateway not provisioned');
      return 'stream-raw-ok';
    }
  }
};

aiCalls = [];
const resNoGateway = await runAiWithGateway(mockEnvFailingGateway, MODEL, { test: 2 });
ok(resNoGateway === 'stream-raw-ok', 'runAiWithGateway recovers without gateway option');
ok(aiCalls.length === 2 && aiCalls[0].opts?.gateway && !aiCalls[1].opts,
   'runAiWithGateway retried immediately without gateway option');

let primaryModelCalls = 0;
let fallbackModelCalls = 0;
const mockEnvCounting = {
  DB: createMockDb(),
  AI: {
    run: async (model, payload, opts) => {
      if (model === MODEL) {
        primaryModelCalls++;
        throw new Error('Primary failed');
      }
      if (model === FALLBACK_MODEL) {
        fallbackModelCalls++;
        if (opts?.gateway) throw new Error('Gateway failed');
        return 'fallback-stream-ok';
      }
      throw new Error('Unknown model');
    }
  }
};

const resCounting = await (async () => {
  try {
    return await runAiWithGateway(mockEnvCounting, MODEL, {});
  } catch (_) {
    return await runAiWithGateway(mockEnvCounting, FALLBACK_MODEL, {});
  }
})();
ok(resCounting === 'fallback-stream-ok', 'Fallback succeeds when primary fails');
ok(primaryModelCalls === 2, 'Primary model attempted with gateway then without gateway (2 calls)');
ok(fallbackModelCalls === 2, 'Fallback model attempted with gateway then without gateway (2 calls)');


// ── 7. Function calling on /api/ai/ask (pure functions + route shape) ─────────
const { cleanTools, cleanToolCalls, allowedToolCalls, cleanMessages: cleanMsgs } = await import(path.join(ROOT, 'functions/api/ai/ask.js'));
const goodTool = { type: 'function', function: { name: 'sales_between', description: 'x', parameters: { type: 'object', properties: { from: { type: 'string' } } } } };
const ct = cleanTools([goodTool, { function: { name: 'Bad Name!' } }, { function: { name: 'ok_tool', parameters: { type: 'object', properties: { big: { description: 'x'.repeat(3000) } } } } }]);
ok(ct && ct.length === 2 && ct[0].function.name === 'sales_between', 'cleanTools keeps valid names, drops invalid ones');
ok(ct[1].function.parameters && JSON.stringify(ct[1].function.parameters) === '{"type":"object","properties":{}}', 'cleanTools replaces an oversized schema with an empty one');
ok(cleanTools(Array.from({ length: 30 }, (_, i) => ({ function: { name: 'tool_' + String.fromCharCode(97 + (i % 26)) } }))).length === 12, 'cleanTools caps at 12 tools');
ok(cleanTools('nope') === null && cleanTools([]) === null, 'cleanTools: non-array / empty → null');
const calls = cleanToolCalls([{ id: 'a', function: { name: 'sales_between', arguments: '{"from":"2026-08-01"}' } }, { id: 'b', function: { name: 'zz!', arguments: '{}' } }, { id: 'c', function: { name: 'x_y_z', arguments: { a: 1 } } }, { id: 'd', function: { name: 'four' } }, { id: 'e', function: { name: 'five' } }, { id: 'f', function: { name: 'six_' } }]);
ok(calls.length === 3 && calls[1].function.arguments === '{"a":1}', 'cleanToolCalls: max 4 considered, invalid names dropped, object args stringified');
const allowed = allowedToolCalls({ tool_calls: [{ id: '1', function: { name: 'sales_between', arguments: '{}' } }, { id: '2', function: { name: 'delete_all', arguments: '{}' } }] }, ct);
ok(allowed.length === 1 && allowed[0].name === 'sales_between', 'allowedToolCalls drops any call whose name the client did not declare');
ok(allowedToolCalls({ response: 'x', tool_calls: [{ name: 'sales_between', arguments: '{}' }] }, ct).length === 1, 'allowedToolCalls accepts the Qwen top-level {name, arguments} shape');
const msgs = cleanMsgs([{ role: 'system', content: 's' }, { role: 'assistant', content: '', tool_calls: [{ id: 'q', function: { name: 'sales_between', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'q', name: 'sales_between', content: 'x'.repeat(5000) }, { role: 'tool', name: 'bad name', content: 'y' }]);
ok(msgs && msgs.length === 3 && msgs[1].tool_calls.length === 1 && msgs[2].role === 'tool' && msgs[2].content.length === 2000, 'cleanMessages keeps assistant tool_calls and tool results (truncated to 2000), drops a tool message with an invalid name');
ok(/payload\.tool_choice = round === 'tools' \? 'auto' : 'none';/.test(askSrc), "answer round sets tool_choice 'none' — two rounds at most");
ok(/stream: round === 'answer'/.test(askSrc), 'tools round is non-streamed JSON, answer round streams');
ok(/return json\(\{ ok: true, tool_calls: calls, text \}, 200, \{ 'x-kiwi-ai': 'cloud', 'x-kiwi-ai-model': usedModel \}\);/.test(askSrc), 'tools round answers {ok, tool_calls, text} with the model header');
ok(/const MAX_TOOL_CALLS = 4;/.test(askSrc) && /const MAX_TOOL_RESULT = 2000;/.test(askSrc) && /const MAX_TOOLS = 12;/.test(askSrc), 'tool bounds pinned: 12 tools, 4 calls, 2000-char results');

// ── 8. Live execution test of all AI route handlers ──────────────────────────
const routeFiles = fs.readdirSync(aiDir).filter(f => f.endsWith('.js') && !f.startsWith('_'));
for (const file of routeFiles) {
  const mod = await import(path.join(aiDir, file));
  if (typeof mod.onRequestPost === 'function') {
    const fakeReq = new Request('https://kiwi-pos.com/api/ai/' + file.replace('.js', ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: 'test_merchant' }),
    });
    const fakeEnv = {
      AUTH_SECRET: 'test-secret-key-32-chars-long-1234',
      DB: null,
      AI: null,
    };
    let threw = false;
    let res = null;
    try {
      res = await mod.onRequestPost({ request: fakeReq, env: fakeEnv });
    } catch (err) {
      threw = true;
    }
    ok(!threw && res instanceof Response, `${file} onRequestPost returns a Response without throwing unhandled exceptions`);
  }
}

// ── 9. Hard Count Pinning ───────────────────────────────────────────────────
const EXPECTED_COUNT = 55 + routeFiles.filter(f => !f.startsWith('_')).length;
ok(passed + 1 === EXPECTED_COUNT, `exact control count verified (${passed + 1}/${EXPECTED_COUNT})`);

if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s)`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} controls green`);
}
