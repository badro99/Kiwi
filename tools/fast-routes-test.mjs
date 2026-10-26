#!/usr/bin/env node
// Direct dispatch of static API routes (functions/_fast-next.js, docs/ops/CPU.md).
// The root middleware calls the handler itself instead of letting the Pages
// router compile ~250 route patterns per request. This suite holds:
//   · the generated table matches functions/ (a stale table can break the build),
//   · a dispatched call looks to the handler exactly like a Pages call,
//   · anything unusual falls back to the Pages router,
//   · test stubs of next() are left alone,
//   · the pre-commit hook refuses a route change without the table.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTable, render, handlerExports, OUT } from './build-fast-routes.mjs';
import { fastDispatch, withFastNext } from '../functions/_fast-next.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };

/* A · the committed table is what the generator writes today */
const table = buildTable();
ok(fs.readFileSync(OUT, 'utf8') === render(table), 'functions/_fast-routes.js is current (run node tools/build-fast-routes.mjs)');
ok(table.entries.length > 100, `table lists the static routes (${table.entries.length})`);
ok(table.entries.every(e => !e.route.includes('[')), 'no dynamic route in the table');
ok(table.nested.some(m => m.mount === '/api'), 'the /api middleware runs before /api handlers');
const real = await import('../functions/_fast-routes.js');
ok(real.FAST_ROUTES.size === table.entries.length, 'every table entry imports');
ok(!real.FAST_ROUTES.has('/api/media') && !real.FAST_ROUTES.has('/api/tickets/cleanup'), 'paths a dynamic route could claim stay with Pages');
ok(real.FAST_ROUTES.has('/api/tickets'), 'a single-segment [id] route does not claim its bare prefix');
for (const [route, mod] of real.FAST_ROUTES) {
  const handlers = Object.keys(mod).filter(k => /^onRequest(Get|Post|Put|Patch|Delete|Options|Head)?$/.test(k));
  ok(handlers.length && handlers.every(k => typeof mod[k] === 'function'), `${route} exports function handlers`);
  ok(!(handlers.includes('onRequest') && handlers.length > 1), `${route} does not mix onRequest with method handlers`);
}

/* B · export parsing mirrors what Pages reads */
{
  const ex = handlerExports(`export async function onRequestGet(c) {}\nexport const onRequestPost = h;\nexport const onRequest = [a, b];\nexport { x as onRequestPut, y };\nexport function helper() {}`);
  ok(ex.get('onRequestGet') === 'function' && ex.get('onRequestPost') === 'other', 'function and const handlers are found');
  ok(ex.get('onRequest') === 'array' && ex.has('onRequestPut') && !ex.has('helper') && !ex.has('y'), 'arrays, re-exports and non-handlers are told apart');
}

/* C · a hand-built context (every middleware test) keeps its own next() */
{
  const stub = () => new Response('stub');
  const ctx = withFastNext({ request: new Request('https://k.test/api/menu'), env: {}, next: stub });
  ok(ctx.next === stub, 'no functionPath: next() is untouched');
}

/* D · the dispatched call looks like a Pages call */
function pagesContext(url, init, slowNext) {
  let data = {};
  return {
    request: new Request(url, init),
    functionPath: '/',
    next: slowNext,
    params: {},
    get data() { return data; },
    set data(v) { if (typeof v !== 'object' || v === null) throw new Error('context.data must be an object'); data = v; },
    env: { TAG: 'env' },
    waitUntil: () => {},
    passThroughOnException: () => {},
  };
}
const SLOW = async (input, init) => new Response('slow:' + (input ? 'args' : 'none'), { status: 299 });
{
  const seen = [];
  const fake = {
    FAST_MIDDLEWARES: [['/api', async (c) => { seen.push(['mw', c.functionPath]); c.data = { from: 'mw' }; return c.next(); }]],
    FAST_ROUTES: new Map([
      ['/api/x', { onRequestPost: async (c) => {
        seen.push(['h', c.functionPath, c.request.method, await c.request.text(), JSON.stringify(c.params), c.data.from, c.env.TAG, typeof c.waitUntil, typeof c.passThroughOnException]);
        return Response.redirect('https://k.test/', 302);
      } }],
      ['/api/any', { onRequest: async (c) => new Response(null, { status: 204, headers: { 'X-Method': c.request.method } }) }],
      ['/apix', { onRequestGet: async () => new Response('no mw') }],
      ['/api/bad', { onRequestGet: async () => 'not a response' }],
      ['/api/args', { onRequestGet: async () => new Response('h') }],
    ]),
  };
  const ctx = pagesContext('https://k.test/api/x?q=1', { method: 'POST', body: 'payload' }, SLOW);
  const res = await fastDispatch(fake, ctx, SLOW)();
  ok(JSON.stringify(seen) === JSON.stringify([['mw', '/api'], ['h', '/api/x', 'POST', 'payload', '{}', 'mw', 'env', 'function', 'function']]),
    'nested middleware then handler, with the request body, params, data, env and lifecycle hooks: ' + JSON.stringify(seen));
  ok(ctx.data.from === 'mw', 'context.data is shared with the root middleware');
  ok(!ctx.request.bodyUsed, 'each step reads its own copy of the request');
  res.headers.set('X-Test', '1');
  ok(res.status === 302 && res.headers.get('X-Test') === '1', 'the response is copied, so the root middleware can add headers');

  const any = await fastDispatch(fake, pagesContext('https://k.test/api/any', { method: 'DELETE' }, SLOW), SLOW)();
  ok(any.status === 204 && any.body === null && any.headers.get('X-Method') === 'DELETE', 'onRequest answers any method; a 204 keeps a null body');
  ok((await (await fastDispatch(fake, pagesContext('https://k.test/apix', {}, SLOW), SLOW)()).text()) === 'no mw', '/apix is not under the /api middleware');
  await assert.rejects(fastDispatch(fake, pagesContext('https://k.test/api/bad', {}, SLOW), SLOW)(), /should return a Response/);
  passed++;

  ok(fastDispatch(fake, pagesContext('https://k.test/api/x', { method: 'GET' }, SLOW), SLOW) === null, 'a method the file does not export goes to Pages');
  ok(fastDispatch(fake, pagesContext('https://k.test/api/x/', { method: 'POST', body: 'b' }, SLOW), SLOW) === null, 'a trailing slash goes to Pages');
  ok(fastDispatch(fake, pagesContext('https://k.test/api/nope', {}, SLOW), SLOW) === null, 'an unknown path goes to Pages');
  const used = pagesContext('https://k.test/api/x', { method: 'POST', body: 'b' }, SLOW);
  await used.request.text();
  ok(fastDispatch(fake, used, SLOW) === null, 'a request body already read goes to Pages');

  const argMw = { FAST_MIDDLEWARES: [['/api', (c) => c.next(new Request('https://k.test/api/args'))]], FAST_ROUTES: fake.FAST_ROUTES };
  const viaArgs = await fastDispatch(argMw, pagesContext('https://k.test/api/args', {}, SLOW), SLOW)();
  ok(viaArgs.status === 299 && (await viaArgs.text()) === 'slow:args', 'a middleware passing a new request hands over to Pages');
}

/* E · wired into the real root middleware, on the real table */
{
  const src = fs.readFileSync(path.join(ROOT, 'functions/_middleware.js'), 'utf8');
  ok(/export async function onRequest\(context\) \{\n\s*withFastNext\(context\);/.test(src), 'the root middleware installs the fast next() first');
  const { onRequest } = await import('../functions/_middleware.js');
  const { onRequestGet: menuGet } = await import('../functions/api/menu.js');
  const url = 'https://kiwi-os.com/api/menu?merchant=nobody';
  const direct = await menuGet({ request: new Request(url), env: {}, params: {}, data: {}, next: SLOW, waitUntil() {}, passThroughOnException() {} });
  const ctx = pagesContext(url, { headers: { 'User-Agent': 'curl/8' } }, SLOW);
  ctx.env = {};
  const res = await onRequest(ctx);
  ok(res.status !== 299, 'GET /api/menu reaches the handler without the Pages router');
  ok(res.status === direct.status && (await res.text()) === (await direct.text()), 'same answer as calling the handler directly');
  const dyn = pagesContext('https://kiwi-os.com/api/media/x/y.png', { headers: { 'User-Agent': 'curl/8' } }, SLOW);
  dyn.env = {};
  ok((await onRequest(dyn)).status === 299, 'a dynamic route still goes through the Pages router');
}

/* F · the pre-commit hook refuses a route change without the table */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-routes-hook-'));
  try {
    const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
    put('tools/build-fast-routes.mjs', fs.readFileSync(path.join(ROOT, 'tools/build-fast-routes.mjs'), 'utf8'));
    put('tools/hooks/pre-commit', fs.readFileSync(path.join(ROOT, 'tools/hooks/pre-commit'), 'utf8'));
    fs.chmodSync(path.join(dir, 'tools/hooks/pre-commit'), 0o755);
    put('functions/_middleware.js', 'export async function onRequest(c) { return c.next(); }\n');
    put('functions/api/a.js', 'export async function onRequestGet() { return new Response("a"); }\n');
    const node = (args) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
    node(['tools/build-fast-routes.mjs']);
    const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=tools/hooks', ...a], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const commit = (msg) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=tools/hooks', 'commit', '-q', '-m', msg], { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    git('add', '-A'); ok(commit('base').status === 0, 'hook accepts a consistent table');
    put('functions/api/b.js', 'export async function onRequestGet() { return new Response("b"); }\n');
    git('add', 'functions/api/b.js');
    const refused = commit('new route');
    ok(refused.status !== 0 && /build-fast-routes/.test(refused.stdout + refused.stderr), 'hook refuses a new route without the table, and names the command');
    node(['tools/build-fast-routes.mjs']);
    git('add', 'functions/_fast-routes.js');
    ok(commit('new route + table').status === 0, 'hook accepts once the table is regenerated');
    git('rm', '-q', 'functions/api/a.js');
    ok(commit('removed route').status !== 0, 'hook refuses a deleted route still imported by the table');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`fast-routes: ${passed} checks passed`);
