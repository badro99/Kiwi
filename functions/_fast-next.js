// Direct dispatch for static API routes (docs/ops/CPU.md, "Route dispatch").
//
// The router Pages generates compiles a path pattern for every route, about
// 250 of them, each time the root middleware calls next(). That fixed cost was
// most of the CPU billed per request. When the path is an exact static route,
// this calls the nested middleware and the handler the way Pages would: same
// context fields, a fresh copy of the request for each step, the same response
// copy and the same "must return a Response" check.
//
// Everything else keeps the Pages router: a path the table does not list, a
// method the route file does not export, next() called with arguments, or a
// request body something already read. Missing an entry is never wrong, only
// slower.
//
// Only the Pages runtime gets it: its context always carries functionPath and
// passThroughOnException, a hand-built test context does not, so tests that
// stub next() keep their stub. The table loads on first use (bundled inline
// by Pages), which also keeps those tests from importing every route file.
let table = null;
function loadTable() {
  if (!table) table = import('./_fast-routes.js').catch(() => null);
  return table;
}

const METHOD_EXPORT = {
  GET: 'onRequestGet', POST: 'onRequestPost', PUT: 'onRequestPut', PATCH: 'onRequestPatch',
  DELETE: 'onRequestDelete', OPTIONS: 'onRequestOptions', HEAD: 'onRequestHead',
};

// The copy Pages makes of every function response (null-body statuses).
function cloneResponse(response) {
  return new Response([101, 204, 205, 304].includes(response.status) ? null : response.body, response);
}

function covers(mount, path) {
  return path === mount || path.startsWith(mount + '/');
}

export function fastDispatch({ FAST_ROUTES, FAST_MIDDLEWARES }, context, slowNext) {
  const request = context.request;
  if (!request || request.bodyUsed) return null;
  const path = new URL(request.url).pathname;
  const mod = FAST_ROUTES.get(path);
  if (!mod) return null;
  const handler = mod[METHOD_EXPORT[request.method]] || mod.onRequest;
  if (typeof handler !== 'function') return null;
  const chain = [];
  for (const [mount, fn] of FAST_MIDDLEWARES) if (covers(mount, path)) chain.push([fn, mount]);
  chain.push([handler, path]);
  let step = 0;
  const run = async () => {
    const [fn, functionPath] = chain[step++];
    const last = step === chain.length;
    const response = await fn({
      request: new Request(request.clone()),
      functionPath,
      // A route handler that calls next() gets the Pages router; no handler
      // does today. A middleware that passes a new request does too.
      next: (input, init) => (!last && input === undefined && init === undefined ? run() : slowNext(input, init)),
      params: {},
      get data() { return context.data; },
      set data(value) { context.data = value; },
      env: context.env,
      waitUntil: context.waitUntil,
      passThroughOnException: context.passThroughOnException,
    });
    if (!(response instanceof Response)) throw new Error('Your Pages function should return a Response');
    return cloneResponse(response);
  };
  return run;
}

// Replace context.next for the root middleware. Called once per request.
export function withFastNext(context) {
  const slowNext = context.next;
  if (typeof slowNext !== 'function' || typeof context.functionPath !== 'string'
    || typeof context.passThroughOnException !== 'function') return context;
  context.next = async (input, init) => {
    if (input === undefined && init === undefined) {
      const routes = await loadTable();
      const run = routes && fastDispatch(routes, context, slowNext);
      if (run) return run();
    }
    return slowNext(input, init);
  };
  return context;
}
