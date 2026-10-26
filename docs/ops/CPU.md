# Pages Functions CPU budget

2026-10-25. Billing baseline supplied by the owner: 31.98 million CPU ms,
4.15 million standard requests, 3.2 billion D1 rows read. That is about
7.71 CPU ms and 771 rows read per request, aggregated across unlike routes.
These totals cannot identify a specific query or prove a tenfold saving.

## Static requests

Before this change there was no checked-in `_routes.json`. The root middleware
ran for assets as well as API calls. Its sequence is:

1. Start old-origin telemetry (`recordOldOrigin`). On the old hostname this can
   resolve employee/till/account identity and touch D1, even for an asset.
2. Evaluate the cookie-aware pages.dev visitor move and canonical host/root
   redirect. The visitor move is document-only; www canonicalization also
   applies to assets. Root/index goes to `/fr/` on the canonical host.
3. Parse URL, app CORS origin and method; reject `/app`; evaluate public paths.
   Assets under `/assets/`, `/_next/`, `/images/`, `/model/`, `/draco/` and named
   public files return `next()` before account authentication. Other shells
   still undergo account revocation, named operator or till checks. `/order`
   rewrites to OrderPro and may inject its per-store skin.
4. After `next()`, copy the response to attach nosniff, SAMEORIGIN, referrer
   policy and HSTS; inspect staff-shell skin and landing-language/CORS needs.
   Static assets get no language cookie or skin. Middleware sets no asset
   cache policy; existing `_headers` supplies it.

`_routes.json` now includes `/*` and excludes 16 already-public static paths
or prefixes (17 combined rules). All HTML, locale trees, extensionless shell
URLs, `/api/*`, `/auth/*`, discovery, unlock and `/app` remain included.
This retains account gates, HTML origin moves, language cookies and rewrites.
Fonts/icons inherit the `/assets/*` exclusion. No generic extension wildcard
can accidentally exclude a future API or HTML shell.

`_headers` already existed. It now supplies the same four security headers for
static responses. Existing mutable asset, font/icon, fingerprinted Next bundle
and service-worker cache policies remain. `_redirects` was absent and stays
absent: Pages does not support domain-level redirects in that file. HTML keeps
its middleware www/apex redirect, including conditional old-origin behavior.
Excluded static files now serve directly on www as on the apex, with identical
bytes; HTML navigation still canonicalizes before loading them. An owner wanting
canonical-host redirects on static requests too must configure a Cloudflare
zone redirect rule (and HTTPS enforcement), not an unsupported `_redirects`
entry. No static pages.dev move is added: assets previously stayed on that host. Static origin-device telemetry
is intentionally eliminated; included HTML/API calls still record activity.

Cloudflare documents [routing](https://developers.cloudflare.com/pages/functions/routing/)
with 100 combined rules and 100 characters per rule;
[headers](https://developers.cloudflare.com/pages/configuration/headers/)
permit 100 rules and 2,000 characters per line;
[redirects](https://developers.cloudflare.com/pages/configuration/redirects/)
permit 2,000 static plus 100 dynamic entries. These files remain below limits.
Function responses keep middleware hardening because `_headers` does not apply
to Functions responses. Deploy the root `_routes.json` with the static output.

## API CPU and D1

- `auth/_lib.js` previously imported the same HMAC key for every token check.
  `auth/_crypto.js` now shares a promise across concurrent calls, bounded to
  four secrets per isolate, evicts failed imports and distinguishes rotation.
  Feed cursor signing/verification and the middleware staff token share it.
  Signatures, token expiry and live revocation checks are unchanged. No password,
  session entitlement or merchant document is cached.
- PBKDF2 remains at 100,000 rounds for credential creation/checks. Polling GET
  handlers use HMAC verification, not password stretching. The fast CPU test
  follows named calls/import aliases from 14 polling handlers and rejects
  indirect password derivation; middleware GET branches are exercised with
  anonymous and synthetic signed sessions while derivation is forbidden.
  POST employee/operator sign-ins and manager code checks remain allowed.
- `_cached-clock.js` caches up to 64 locale/options formatter combinations for
  the shared order helpers and booking route. The byte-exact zone-law twin stays
  unchanged.
  Queue/order/booking callers no longer construct equivalent Intl formatters
  repeatedly. Correction still selects the effective timezone per instant,
  including reports crossing the existing zone-law boundary.
- Print polling had only `(merchant,status,created_ts)`: its recent-job probe
  omitted status, and expiry/claim cleanup ranged on different columns. New
  indexes make those three probes range searches on their actual predicates.
- Feed's legacy latest-500 void list still uses `void_ts IS NOT NULL`, which
  cannot use the existing partial index restricted to `void_ts >= 0`. Adding
  an index here changed equal-timestamp ordering and could change which receipts
  fall inside the latest-500 cutoff. The byte-exact legacy fixture caught this;
  the proposed index was removed. New clients' paginated void stream already
  uses the nonnegative index. Migrating legacy pollers remains a separate task.
- Feed performs linked-test-refund reconciliation on every read. The partial
  negative/unvoided-sales index limits its candidates; a partial refund-audit
  index supports the correlated merchant/note lookup. Reconciliation still runs
  every time, preserving immediate repair behavior and financial results.
- `/api/config` reads narrow roster projections and indexed merchant keys;
  `/api/store` uses its `(merchant,feature)` primary key. It still parses and
  serializes documents for redaction, briefing scoping and malformed-data
  handling. Skipping these operations or caching across requests could expose
  credentials or stale data. No such shortcut was introduced. (Since
  2026-10-26 an unchanged document that reads the same for every caller
  answers 304 instead: see "Store revalidation".)
- `/api/me` normally uses indexed account/merchant lookups. Its legacy operator
  fallback still reads the account roster when no registry mapping exists;
  removing that compatibility path needs a separate data migration.
- `/api/sale*` continues real authorization and manager code checks. Hot-path
  regexes inspected in feed/config/store/me/auth are literals; none constructed
  a dynamic `RegExp` per poll. Credential work remains confined to writes or
  explicit sign-ins/code verification.

## Route dispatch (2026-10-26)

The router Pages generates from `functions/` (wrangler's
`pages-template-worker`) compiles a path-to-regexp pattern for every route it
walks, on every request, and never caches them. With about 250 routes that was
the largest single cost per call: profiled on the real bundle, GET /api/menu
spent 1.16 ms of CPU against 0.31 ms in its own handler, and production runs
roughly 7 times slower than a laptop. The router is a lazy generator: it stops
after yielding the root middleware and only walks the rest of the table when
that middleware calls `next()`. Requests the middleware answers itself (a 401,
a redirect) never paid it; every request that reached a handler did.

`functions/_fast-next.js` replaces `next()` for the root middleware. When the
path is an exact static route listed in `functions/_fast-routes.js`, it runs
the nested `/api` middleware and the handler itself, with the same context
Pages builds (a fresh copy of the request per step, `params`, shared `data`,
`env`, `waitUntil`, `passThroughOnException`, `functionPath`), the same
response copy and the same "must return a Response" error. Anything else goes
to the Pages router unchanged: a path not in the table (dynamic routes and
anything they could claim, a trailing slash, other casing), a method the file
does not export, `next()` called with arguments, or a request body already
read. A missing entry is only slower, never wrong.

Measured on the wrangler-built bundle (same responses, byte for byte, across
62 request cases including signed-in till polling and writes):

| Request | Before | After |
|---|---|---|
| GET /api/feed (till) | 0.92 ms | 0.30 ms |
| GET /api/store (till) | 0.84 ms | 0.18 ms |
| GET /api/config (till) | 0.77 ms | 0.18 ms |
| GET /api/pair/state (till) | 0.67 ms | 0.20 ms |
| GET /api/menu (public) | 1.16 ms | 0.44 ms |

The table is generated: run `node tools/build-fast-routes.mjs` after adding,
moving or removing a route file. It imports every listed file, so a deleted
route left in it fails the Pages build. `tools/fast-routes-test.mjs` (gate)
and the pre-commit hook both refuse a stale table. The fast path only switches
on inside the Pages runtime (its context carries `functionPath`); middleware
tests that stub `next()` keep their stub and never load the table.

## Store revalidation (2026-10-26)

Receipt and business documents carry the logo as base64 (up to 248 KB in
production), and dayreports holds the whole history (up to 210 KB). Every
till poll used to read, parse and re-encode them, about 0.6 ms more than a
small document on a laptop.

GET /api/store now gives a weak ETag to a document whose answer does not
depend on the caller: `W/"s1.<store>.<feature>.<rev>.<updated_ts>.<length>"`,
with `Cache-Control: private, no-cache`. The browser keeps the answer and
sends the tag back on the next poll by itself (assets/cloud-doc.js reads with
the default cache mode, so no client change). When rev, time and length all
still match, the row comes back without its data and the answer is a 304.

What does not change: authorisation runs first, so a tag never opens a
document to someone who may not read it. Documents in `REDACT` or `PARTIAL`
(team roster, briefing, retention, charges, recipes, agent actions,
workspaces) depend on who asks, so they get no tag and stay `no-store`: an
owner signing in on a till must not keep a redacted copy and write it back.
A tag naming another store or document, a list of tags, or `*` gets a full
answer. Writes stay `no-store`. `tools/store-revalidation-test.mjs` holds
these rules.

## Expected effect and rollout

An asset request excluded here incurs **zero Pages Function invocations and
zero Function CPU**. For a cold shell with 162 script tags (before CSS/fonts),
this changes up to 163 invocations to one HTML invocation, approximately
99.4% fewer for that resource set. Browser caches reduce the baseline benefit.
For whole-period traffic, if excluded assets were 90% of requests, 4.15M becomes
0.415M; if 50%, it becomes 2.075M. CPU follows its measured static share, not
necessarily the request share. A hypothetical equal CPU mix at 90% gives
31.98M → 3.198M ms, but this is an estimate, not production evidence.

HMAC imports fall from one per verification to one per distinct secret per
warm isolate (subject to bounded eviction). Intl construction similarly falls
to one per options combination. Print history probes change from potentially
all merchant history to matching recent/expired/leased ranges. For a merchant
with 50,000 historic jobs and no recent work, 10,000 idle probes could otherwise
visit roughly 500M index entries; the new recent-job range has no matching rows.
Actual D1 billing savings depend on planner choice and production distributions.

Owner must apply **0016_cpu_polling_indexes.sql** through the normal D1 migration
process before expecting query savings. It only creates indexes; no rows change.
Agents have not applied it remotely. No stamped assets changed; no restamp needed.

Compare equal traffic windows after deployment: Function invocations by path,
CPU total and p50/p95 per API, D1 rows read/written, errors and shell auth behavior.
Confirm static response headers and www redirect at the edge. Keep cold-shell,
steady polling and old-origin cohorts separate. A global tenfold reduction is
a target still requiring production measurement, especially after the existing
quiet-mode request work documented in REQUESTS.md.

## Local evidence

`tools/worker-cpu-test.mjs` is wired into the fast tier of `tools/check.js`.
It pins routing/header behavior, follows poll-handler call graphs (including
an injected indirect-PBKDF2 regression), exercises middleware, proves concurrent
HMAC reuse/rotation and timezone correction, and checks SQLite query plans for
all five new indexes. `tools/d1-migrations-test.mjs` proves schema/migration parity.
No paid API or production merchant request is used.

Final verification: `KIWI_CHECK_JOBS=4 node tools/check.js --changed --no-browsers`
passed all 726 selected suites, including the CPU ratchet (no pins raised).
The warning is the unavailable iOS simulator. Earlier eight-job runs exceeded
one queue property's CPU budget; its 25 properties passed independently and the
four-job run passed the budget. Typecheck, schema repair, migration parity,
byte-exact void feed, 692 size checks and 811 PWA checks passed. The access-gate
browser suite ran through the shared browser-slot wrapper and passed 43 checks.
An initial default `--changed` attempt selected browser suites without the
shared slot and was stopped; subsequent changed runs explicitly excluded
browsers. Remaining browser coverage belongs to the lead. No full gate, commit
or push was made.
