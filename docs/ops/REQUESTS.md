# Request budget, 24 October 2026

Inventory taken against the worktree before these changes. Rates are steady-state
HTTP requests per device-hour, not timer callbacks, bytes or WebSocket messages.
One request every `s` seconds costs `3600/s`; endpoints with pagination or several
reads cost more. Startup, mutations, retries with queued work, images loaded on
navigation and user actions are additional. Cloudflare's 634k/day is an aggregate,
not a per-device measurement; 2.3k Worker invocations does not identify API volume
without checking which analytics product and routes that metric covers.

## Network loops and estimates

`H` = skips network when hidden; `L` = skips/slows while locked or service closed.
A dash means no explicit lock gate. “same” means unchanged by this patch. Values
are upper bounds for a single poll unless a multiplier is stated. Do not sum rows
from unrelated surfaces or count a shared API twice. The interval census below
also lists timers that make no requests.

| Surface / source / loop | Before interval | Before H / L | Before req/h | After idle req/h, hidden | Freshness / notes |
|---|---:|---|---:|---:|---|
| Dashboard `assets/live-link.js` watchFeed | 2.5 s visible, 20 s hidden | no / no | 1440 / 180 hidden | 60, 0 | doubles to 60 s on equal cursor/change fence/voids; pagination drains immediately; locked dashboard 300 s (12/h); queue flush has separate retry |
| Till `assets/live-link.js` watchVoids | 15 s | no / no | 240 | 30, 0 | unchanged void list backs off; wake polls immediately |
| Dashboard `assets/floorplan-live.js` | 8 s | yes / no | 450 | 60, 0 | signature excludes server time/till heartbeat; stale state retained on errors |
| Dashboard `assets/team.js` live team | 1 s Équipe/Paie, 20 s elsewhere | no / no | 3600 / 180; 180 hidden | 30, 0 | unchanged roster/attendance backs off; locked dashboard 300 s (12/h) |
| Till `assets/caisse-app.js` team | 5 s / 30 s hidden | no / no | 720 / 120 hidden | same | split-proof file, unchanged; major remaining till cost |
| Till `assets/caisse-app.js` employee floor | 1 s, 8 s with live socket | no / no | up to 3600 / 450 | same | split-proof file; interactive table actions, unchanged |
| Till `assets/caisse-app.js` publishServiceFloor | 4 s | no / operator gate | 0 unchanged; up to 900 if changing | same | signature suppresses identical snapshots; caller in split-proof file |
| Till `assets/caisse-app.js` fetchCarte | 6 s | yes / no | up to 600 | same | menu and associated documents; split-proof file |
| Till `assets/caisse-app.js` provisional Z / held sales | 5 s callback; Z 90 s floor | debt / service gate | up to 40 Z + debt | same | local autosave itself is 0 HTTP; retain money recovery |
| Till `assets/orderpro-inbox.js` | 6 s | no / no | 600 | 30, 0 | orders/sessions signature excludes cursor clock; active orders stay 6 s; empty locked/closed till 300 s (12/h) |
| Kitchen `kiwi-cuisine.html` orders | 5 s; error 10,20,30 s | yes / n/a | 720 | 30, 0 | empty unchanged board doubles to 120 s; pending/accepted/cooking/ready work stays 5 s; errors retain 30 s cap |
| Kitchen `kiwi-cuisine.html` feature/stations | 60 s minimum, within order tick | yes / n/a | 60 feature + up to 60 failed station reads | ~30 feature + stations retries | feature checked on next board tick; wake forces config read |
| Shared `assets/pwa-update.js` registration.update | 30 min; wake after 5 min | interval no / no | 2 + wake | 2, 0 | hidden online event also paused; visible wake preserves 5 min deduplication |
| Dashboard KPI `assets/dateRange.js` hotel band | 30 s | yes / no | up to 120 | same | only hotel and mounted band; other KPIs subscribe to sales feed |
| Dashboard `assets/pages-pro-spa-starter.js` activity | 30 s | yes / no | up to 120 | same | only transactions screen |
| Shared `assets/clients-store.js` book | 15 s | no / no | 240 + debt | same | sale/loyalty outboxes and incremental book read |
| Shared `assets/inventory-ledger.js` | 20 s | no / no | up to 180 + debt | same | stock outbox/read; unlocked boot gate only |
| Shared `assets/boutique-catalog-parts.js` | 20 s | yes / no | up to 180 | same | cloud busy and last-read guards |
| Shared `assets/pos-workspaces.js` | 45 s | yes / no | up to 160 | same | workspace and roster, up to two reads/tick |
| Shared `assets/pressing-ops.js` | 20 s | yes / no | up to 180 | same | cloud pull, visible workspace |
| Shared `assets/discount-policy.js` | 60 s | yes / no | up to 60 | same | refresh via shared store |
| Dashboard `assets/reservations.js` | 30 s | yes + mounted / no | up to 120 | same | cloud pull only while agenda visible |
| Shared `assets/delivery-receivables.js` | 60 s | yes / no | up to 60 | same | 1.5 s initial load |
| Dashboard `assets/operations-ui.js` | 30 s | no / no | at least 120 | same | load can read several operations/device collections |
| Shared `assets/operations.js` heartbeat | 300 s | no / no | 12 | same | presence contract: offline after three missed beats |
| Shared `assets/operations.js` queue | 60 s | debt only / no | 0 idle, debt-dependent | same | money/work outbox, retain recovery |
| Shared `assets/cash-sessions.js` | 10 s + failure retry | debt only / no | 0 idle, debt-dependent | same | open/close cashier ledger must drain |
| Shared `assets/pos-sale.js` active vertical sync | 5 s visible / 30 s hidden | no / no | up to 720 / 120 hidden + debt | same | incremental sales reader, separate from held-sale replay |
| Shared `assets/pos-sale.js`, boutique/maison held replay | 60 s | debt only / no | 0 idle, debt-dependent | same | retry money after close, do not suppress |
| Shared `assets/z-reconciliation.js` | 30 s till flush; 60 s dashboard paint | debt / no | 0 idle, debt-dependent | same | dashboard paint local; outbox writes only if needed |
| Kitchen `assets/kitchen-relay.js` retry queue | 15 s | debt only / no | 0 idle, debt-dependent | same | retained jobs expire after service; never delay pending jobs |
| Kitchen `assets/kitchen-print-queue.js` | 15 s lease; retry by job deadline | pending/hub / no | 480 HTTP/h on elected hub + jobs | same | renewal does GET + POST /api/store every 15 s, also hidden; 45 s arbitration lease is a print-correctness contract; 120 ms next pending job |
| Shared `assets/printer-bridge.js` relay verdict | 700 ms, at most 12 s | job only / no | 0 idle, at most ~18/job | same | relay deposit/status is per-job, not an endless browser poll |
| Native printer bridge (outside assets/shells) | native relay poll | no tab / no | not included | same | server-side long/short poll owned by bridge, not a browser timer |
| `printer.html` bridge availability | 4 s | no / no | 900 local-host probes | same | printer setup screen only, not Cloudflare requests |
| `assets/caisse-pairs.js` | 30 min | no / no | 2 | same | paired-device settings refresh |
| `assets/caisse-refresh.js` | 30 s | yes / operator-only gate | 120 × refresh reads | 30 × reads, 0 hidden | unchanged refresh backs off to 120 s; explicitly closed service 300 s; manual refresh unchanged |
| Waiter `assets/serveur-app.js` carte | 15 s | callee yes / no | up to 240 | same | costs/menu reads depend on shared cache |
| Waiter `assets/serveur/service.js` service sync | 6 s / 20 s with socket | yes / no | up to 600 | same | employee session actions; money/status updates |
| Employee `assets/employee-live.js` queue | exponential retry 1..30 s | debt only / no | 0 idle, debt-dependent | same | attendance/sale writes resume on online/visible; no permanent read poll here |
| Employee planning/trade shell | 60 s | local / n/a | 0 | same | redraw only on date change |
| `assets/kit/till-attendance.js` | 10 s while dialog open | no / dialog | 360 in dialog | same | closes stop the interval; rotating attendance challenge, not a permanent shell poll |
| OrderPro guest `assets/orderpro-page.js` LIVE | 4 s active, 15 s idle | yes / n/a | 900 active or 240 idle × (session + watched orders) | same | customer order-status tracking remains prompt |
| OrderPro guest `assets/orderpro-page.js` availability | 15 s | no / n/a | 240 | same | separate menu read; hours gate 60 s is local |
| OrderPro guest boot retry | 30 s closed/off | yes / n/a | up to 120 | same | only until boot succeeds |
| `order-tv.html` | 10 s; disabled ×6 | no / n/a | 360 / 60 | same | guest/game display, plus local render each 30 s |
| `assets/admin-workspace.js` | 30 s | yes / no | up to 120 × load reads | same | skips dialog/input/merchant detail |
| `kiwi-admin.html` portfolio | 30 s | visibility and route gate / no | up to 120 × portfolio reads | same | operator-only shell |
| `assets/kiwi-health.js` | 60 s | yes / no | up to 60 × overview reads | same | local freshness paint every 15 s |
| `assets/tickets.js` | 30 s | yes / no | 120 | same | explicitly private/no-store responses |
| `assets/live-socket.js` | ping 50 s; reconnect 2,5,15,30 s; cold refusals 60 s | no / no | 0 HTTP pings; reconnect attempts variable | same | pushes dispatch `kiwi:request-wake` in addition to original subscribers |
| `assets/live-link.js` operator watchdog | 30 s | operator-only / n/a | 0 idle | same | checks snapshot metadata; no repeating feed read |
| `assets/merchant-config.js` startup discovery | 400 ms, at most 11 | no / no | finite startup only | same | stops once identity/subscriptions resolved |
| `assets/cloud-doc.js` | 12/15 s request deadlines | n/a | 0 periodic | same | request-driven get/put, not a scheduler; consumers above own polling |
| Boot and action retries elsewhere | bounded / event-driven | varies | 0 steady idle | same | doctor 600 ms follow-up; health 2.5 s retry + finite 0.6..25 s probes; pairing verdict 800 ms; pos-hotel 3.5 s only pending debt; menu publish 800 ms debounce |

Feed and floor cap at 60 s to refresh till-presence observations within their
90 s freshness window. Other changed idle reads cap at 120 s. BroadcastChannel
`kiwi-live` and its storage fallback fan out to `kiwi:request-wake`; the existing
WebSocket does the same. Hidden handlers do not read the network.

## What these savings mean

For one visible idle dashboard with feed + floor watcher + team module, changed
loops go from **2070/h** (team off-screen) or **5490/h** (team screen) to **150/h**
after warm-up, reductions of about 93% and 97%. On hiding that tab, the feed and team's
combined 360/h becomes zero; floor already guarded hidden reads. Additional unrelated
loops above remain additive. An idle kitchen order feed goes **720 → 30/h**;
an idle till's OrderPro + void reads go **840 → 60/h**. These are loop budgets,
not a claim that the whole till now makes only 60 requests/hour: the split-proof
caisse floor/team/menu loops above are substantial remaining work.

Transitions produce a small warm-up burst (1, 2, 4… base intervals); focus,
visibility and push intentionally restart promptly. Busy kitchen/OrderPro orders
retain their original cadence. Read failures back off while keeping the last
known data, never replacing an offline ledger with empty data.

## Cache policy and deployment handoff

The SW already uses cache-first for an exact cached stamped URL and
stale-while-revalidate for unstamped non-navigation requests. Navigations remain
network-first with the existing offline shell fallbacks. `/api/` and `/auth/`
never enter Cache Storage. A test now exercises a cold load, two reloads and a
new stamp; there is no SW generation change in this worktree.

Cloudflare Pages `_headers` rules match paths, **not query parameters**. A rule
`/assets/*?v=*` is not a usable query condition; freezing `/assets/*` for a year
would also freeze unstamped auth/config bootstrap scripts. Therefore query-stamp
HTTP immutable headers need a lead-owned CDN rule/response handler or a future
migration to fingerprinted filenames. `_next/static/*` already gets
`public, max-age=31536000, immutable`. Fonts/icons now get one-year max-age;
`! Cache-Control` removes the inherited asset policy before adding the new one,
so Pages does not join conflicting directives. HTML retains Pages' default
revalidation. No new cache rule matches API/auth/merchant documents. Private
ticket and consent paths retain no-store. Functions responses do not inherit
`_headers`; their handlers must continue to supply their own no-store policy.

Reference: [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/)
(path matching, detach syntax, duplicate header joining and Functions exclusion).

Lead: run `node tools/bump-stamp.js --sw` if deploying a new SW generation;
do not edit CACHE or registration versions manually. Restamp changed runtime
assets: `assets/live-link.js`, `assets/floorplan-live.js`, `assets/team.js`,
`assets/orderpro-inbox.js`, `assets/pwa-update.js`, `assets/live-socket.js`,
`assets/caisse-refresh.js`.
The changed kitchen HTML must deploy with fresh navigation revalidation.
No stamps or `tools/asset-stamps.json` were changed here.

Evidence: `tools/request-pollers-test.mjs` uses a fake clock against the actual
scheduler bodies for feed, voids, floor, team, inbox, kitchen and shared till refresh; it checks hidden
pause, idle cap, visibility/push wake and active kitchen/order cadence.
`tools/request-headers-test.mjs` checks Pages syntax/inheritance and exclusions.
`tools/sw-immutable-revalidation-test.mjs` checks reloads without refetch.
`tools/pwa-update-poll-test.mjs` covers hidden update checks. All are named in
`tools/check.js`; the lead runs that full gate.

## Complete interval census at baseline

Every non-vendor `setInterval(...)` call in `assets/**/*.js` and root HTML
shells is listed below, including local clocks, UI polling and finite bootstrap
retries. Line numbers refer to the pre-change HEAD. Local-only callbacks have
zero HTTP cost regardless of visibility/lock; they do not need request pacing.
Recursive network `setTimeout` chains are itemized in the network table above.
Vendor library scheduler internals are excluded.

| Source | Callback | Interval expression | HTTP cost / visibility and lock policy |
|---|---|---|---|
| `assets/admin-workspace.js:186` | `callback` | 30000 ms | see network table |
| `assets/boutique-catalog-parts.js:1033` | `callback` | 20000 ms | see network table |
| `assets/caisse-app.js:54` | `tickClock` | 1000 ms | see network table; other callbacks 0 |
| `assets/caisse-app.js:4054` | `updateTableTimers` | 60_000 = 60000 ms | see network table; other callbacks 0 |
| `assets/caisse-app.js:4102` | `callback` | 30000 ms | see network table; other callbacks 0 |
| `assets/caisse-app.js:5923` | `renderAttendanceCodeExpiry` | 1000 ms | see network table; other callbacks 0 |
| `assets/caisse-app.js:6112` | `callback` | 30000 ms | see network table; other callbacks 0 |
| `assets/caisse-app.js:7607` | `callback` | 6000 ms | see network table; other callbacks 0 |
| `assets/caisse-app.js:8717` | `callback` | 25000 ms | see network table; other callbacks 0 |
| `assets/caisse-app.js:9785` | `callback` | 5000 ms | see network table; other callbacks 0 |
| `assets/caisse-app.js:9787` | `publishServiceFloor` | 4000 ms | see network table; other callbacks 0 |
| `assets/caisse-dna.js:90` | `callback` | 30000 ms | 0, local UI / storage |
| `assets/caisse-hardware.js:81` | `callback` | 400 ms | 0, local UI / storage |
| `assets/caisse-kitchen.js:1137` | `kdsTick` | 1000 ms | 0, local UI / storage |
| `assets/caisse-link.js:495` | `refresh` | 1000 ms | 0, local UI / storage |
| `assets/caisse-pairs.js:148` | `refresh` | REFRESH_MS = 1800000 ms | see network table |
| `assets/caisse-pwa.js:442` | `status` | 5000 ms | 0, local UI / storage |
| `assets/caisse-refresh.js:237` | `autoRefresh` | 30000 ms | see network table; other callbacks 0 |
| `assets/caisse-refresh.js:319` | `renderExpiry` | 1000 ms | see network table; other callbacks 0 |
| `assets/cash-sessions.js:303` | `callback` | 10000 ms | see network table |
| `assets/clients-store.js:1005` | `tick` | 15000 ms | see network table |
| `assets/dateRange.js:3293` | `callback` | HOTEL_PERF_TTL = 30000 ms | see network table; other callbacks 0 |
| `assets/day-report-dash.js:1116` | `callback` | 120 ms | 0, local UI / storage |
| `assets/delivery-receivables.js:198` | `tick` | 60000 ms | see network table |
| `assets/demoClock.js:239` | `tick` | TICK_MS = 3000 ms | 0, local UI / storage |
| `assets/discount-policy.js:56` | `callback` | 60000 ms | see network table |
| `assets/employee-planning.js:228` | `redrawOnDayChange` | 60000 ms | 0, local UI / storage |
| `assets/employee-trade-shell.js:267` | `redrawOnDayChange` | 60000 ms | 0, local UI / storage |
| `assets/floorplan-live.js:105` | `poll` | POLL_MS = 8000 ms | see network table |
| `assets/hours-ui.js:561` | `paint` | 60000 ms | 0, local UI / storage |
| `assets/idle-lock.js:234` | `tick` | TICK_MS = 5000 ms | 0, local UI / storage |
| `assets/inventory-ledger.js:464` | `sync` | 20000 ms | see network table |
| `assets/kit/till-attendance.js:123` | `callback` | 10 * 1000 = 10000 ms | see network table |
| `assets/kitchen-print-queue.js:663` | `renewHub` | HUB_RENEW_MS = 15000 ms | 0, local UI / storage |
| `assets/kitchen-relay.js:141` | `callback` | RETRY_MS = 15000 ms | see network table |
| `assets/kiwi-health.js:364` | `callback` | REFRESH_MS = 60000 ms | see network table; other callbacks 0 |
| `assets/kiwi-health.js:365` | `renderFresh` | 15000 ms | see network table; other callbacks 0 |
| `assets/live-socket.js:96` | `callback` | PING_MS = 50000 ms | see network table |
| `assets/maison-stock-movements.js:478` | `callback` | 400 ms | 0, local UI / storage |
| `assets/merchant-config.js:698` | `callback` | 400 ms | see network table; other callbacks 0 |
| `assets/operations-ui.js:2370` | `load` | 30000 ms | see network table |
| `assets/operations.js:423` | `callback` | 60000 ms | see network table |
| `assets/operations.js:432` | `callback` | 300000 ms | see network table |
| `assets/orderpro-boutique.js:202` | `callback` | 350 ms | 0, local UI / storage |
| `assets/orderpro-guest.js:524` | `callback` | 30000 ms | 0, local UI / storage |
| `assets/orderpro-inbox.js:903` | `pull` | POLL_MS = 6000 ms | see network table |
| `assets/orderpro-page.js:2673` | `refreshHoursGate` | 60000 ms | see network table; other callbacks 0 |
| `assets/orderpro-page.js:2816` | `callback` | 15000 ms | see network table; other callbacks 0 |
| `assets/pages-pro/restaurant-stations.js:1516` | `callback` | 1000 ms | 0, local UI / storage |
| `assets/pages-pro-spa-starter.js:1362` | `refreshActivity` | 30000 ms | see network table |
| `assets/pages-pro.js:5168` | `repaintLive` | 30000 ms | 0, local UI / storage |
| `assets/polish.js:210` | `update` | 30000 ms | 0, local UI / storage |
| `assets/pos-boutique.js:1512` | `callback` | 60000 ms | see network table; other callbacks 0 |
| `assets/pos-boutique.js:2507` | `tick` | 10000 ms | see network table; other callbacks 0 |
| `assets/pos-gym.js:695` | `callback` | 60000 ms | 0, local UI / storage |
| `assets/pos-maison.js:1739` | `callback` | 60000 ms | see network table; other callbacks 0 |
| `assets/pos-maison.js:2711` | `tick` | 10000 ms | see network table; other callbacks 0 |
| `assets/pos-pizzeria.js:596` | `tick` | 1000 ms | 0, local UI / storage |
| `assets/pos-sale.js:480` | `callback` | 60000 ms | see network table |
| `assets/pos-workspaces.js:157` | `callback` | 45000 ms | see network table |
| `assets/premium.js:37` | `callback` | 2200 ms | 0, local UI / storage |
| `assets/premium.js:59` | `callback` | 1400 ms | 0, local UI / storage |
| `assets/pressing-ops.js:397` | `liveTick` | LIVE_MS = 20000 ms | see network table |
| `assets/production-action-guard.js:96` | `callback` | 80 ms | 0, local UI / storage |
| `assets/pwa-update.js:229` | `check` | POLL_MS = 1800000 ms | see network table |
| `assets/repeat-sale-guard.js:209` | `tick` | 5000 ms | 0, local UI / storage |
| `assets/serveur-app.js:270` | `tickClock` | 1000 ms | see network table; other callbacks 0 |
| `assets/serveur-app.js:725` | `callback` | 15000 ms | see network table; other callbacks 0 |
| `assets/serveur-app.js:1758` | `callback` | 10000 ms | see network table; other callbacks 0 |
| `assets/serveur-app.js:3120` | `updateShiftMeta` | 30000 ms | see network table; other callbacks 0 |
| `assets/serveur-app.js:3123` | `callback` | 60000 ms | see network table; other callbacks 0 |
| `assets/tickets.js:1338` | `callback` | 30000 ms | see network table |
| `assets/till-tenant.js:316` | `check` | 700 ms | 0, local UI / storage |
| `assets/ux.js:291` | `tick` | 4000 ms | 0, local UI / storage |
| `assets/vertical-state.js:172` | `callback` | 2500 ms | see network table; other callbacks 0 |
| `assets/vertical-state.js:600` | `callback` | 1500 ms | see network table; other callbacks 0 |
| `assets/z-reconciliation.js:314` | `showDashboard` | 60000 ms | see network table; other callbacks 0 |
| `assets/z-reconciliation.js:320` | `flush` | 30000 ms | see network table; other callbacks 0 |
| `cafe-atlas-qr.html:1443` | `tickClock` | 30000 ms | 0, local UI / storage |
| `kiwi-admin.html:3749` | `callback` | 30000 ms | see network table |
| `kiwi-cuisine.html:2467` | `tickTimers` | 1000 ms | 0, local UI / storage |
| `order-tv.html:253` | `callback` | 30000 ms | see network table |
| `printer.html:439` | `check` | 4000 ms | see network table |

## Remaining work before calling the whole request budget solved

This patch does not migrate the split-proof caisse/serveur read loops or frozen
modules. Their budgets remain explicit in the table rather than being counted
as savings. In particular, a restaurant till still has the employee-floor,
team and menu fallback loops; client-book and inventory readers also remain.
A follow-up owning those modules must address their overnight/hidden polling
with the same tests and preserve their split fixtures. Query-stamped HTTP
immutable headers remain blocked by Pages path-only matching, not by a missing
`_headers` wildcard. Do not deploy this patch before the lead restamps the
runtime assets listed above.

Targeted verification: 99 selected non-browser suites, 98 passed after rerunning
the local D1 proof with writable temporary npm/config directories; stamp drift
is the sole expected failure pending the lead's restamp. File-size ratchet
(679 checks), PWA shell (811 checks), fake-clock pacing, SW reload and header
suites pass. No browser suite or full `tools/check.js` run was started.
The sandbox refused this worktree's Git `index.lock`, so changes remain
unstaged and uncommitted for the lead.

## Quiet mode follow-up

`GET /api/config?merchant=…` now adds `pollMode`. Registered merchants with no
sale, order update, hotel reservation update, reservation document update or
attendance document update within seven days get `quiet`; otherwise `live`.
The existing `(merchant, ts)` / `(merchant, updated_ts)` indexes, document primary
key, and new hotel activity index make these bounded EXISTS probes. A conditional
D1 cache claim permits one activity probe per registered merchant per ten minutes,
including across worker isolates. A failed probe keeps service live. The explicit
`merchant_config.test_account` flag forces quiet. Migration **0014** sets that flag
only for **`amira-cafe`**, the restaurant authorized in CLAUDE.md §6. No other
Amira venue or similarly named merchant is inferred to be a test account.

The shared admission policy loads in `kiwi-env.js` before shell modules. Quiet
read budgets apply per endpoint/query resource, ignoring feed cursors and cache
busters. Suppressed reads reject without fabricating empty ledgers or holding a
fetch beyond its existing deadline. Main feed, void, floor, team, inbox, kitchen
and till-refresh schedulers also wait at least 600 seconds between ticks. Legacy
read intervals retain their local callbacks but cannot cross the network faster.
Hidden reads stop in live and quiet. Trusted pointer/key actions restore live and
wake the main schedulers; server config may subsequently restore quiet. Focus,
visibility and socket traffic alone do not override quiet. Quiet/hidden sockets
close; local action reopens the live socket.

These are **HTTP requests per device-hour**, excluding startup, local actions,
queued financial work and pagination. “Before” means the existing `cx/requests`
work in this tree, rather than the older pre-backoff column above. They are timer
and admission budgets, not production analytics or a whole-device claim when
additional modules are mounted.

| Device / mode | Before | After |
|---|---:|---:|
| Live idle dashboard, feed + floor + team | 150 | 150 |
| Same device quiet | 150 | at most 18 (6 per resource) |
| Live idle till, inbox + voids | 60 | 60 |
| Same till quiet | 60 | at most 12 |
| Quiet kitchen, order feed | 30 | at most 6; config/stations additional, at most 6 each |
| Any quiet device, additional mounted read resource | original inventory rate | at most 6 per resource |
| Hidden live/quiet device, periodic reads | additive legacy reads remained | 0 |
| Idle print hub quiet/hidden, no queued jobs | 480 lease HTTP calls | 0 |
| Heartbeat quiet, visible | 12 | at most 6 |
| Fixture demo dashboard / till | legacy loop-dependent, up to inventory rates where not gated | 0 periodic API, socket or explicit PWA update calls |
| Unpaired/unauthenticated device after first 401 | original endpoint retry cadence | at most 2 retry attempts/hour across ordinary API calls |

Demo mode comes from KiwiEnv and explicit `?demo`; it also disables periodic PWA
update checks. A single boot `/api/me` discovery remains available so an existing
local merchant can resolve their identity. Demo fixture writes never reach the
API. Money writes and pending print delivery bypass quiet/hidden pacing. An
explicit authentication refusal pauses ordinary API attempts for 30 minutes;
new pairing clears that refusal. Print-job delivery remains exempt. The print
hub skips idle quiet/hidden renewal and reacquires its lease when work arrives.

Evidence: `tools/quiet-mode-test.mjs` exercises actual SQL at the seven-day
boundary, sale/order/booking/punch evidence, test flag, cache expiry, admission,
user wake, money exemptions and 401 retry. `tools/request-pollers-test.mjs` now
exercises all seven actual scheduler bodies at a 600-second quiet interval and
a hidden simulated hour. `tools/quiet-demo-browser-test.mjs` loads both real HTML
shells, advances their timers through an hour and requires zero periodic
fetch/XHR/socket requests. All are named in `tools/check.js`.

Deployment handoff: apply migration 0014 with the lead's migrations 0011–0013;
they are intentionally absent from this worktree. The contiguous-number test
therefore fails here until integration. Restamp **assets/kiwi-env.js,
assets/live-link.js, assets/floorplan-live.js, assets/team.js,
assets/orderpro-inbox.js, assets/caisse-refresh.js, assets/live-socket.js,
assets/pwa-update.js, assets/kitchen-print-queue.js, assets/operations.js,
assets/err-reporter.js**.
The kitchen HTML gains the existing environment bootstrap and must revalidate.
No stamps, stamp manifest, SW generation or middleware were edited.

Verification in this sandbox: 223 of 224 selected non-browser suites pass; the
only failure is migration numbering (0011–0013 reserved elsewhere). Size ratchet:
680 checks; PWA shell: 811 checks. The browser demo-hour suite was attempted and
exits 3 because Chromium cannot launch here; its actual-shell assertion still
needs a lead run. The VM demo-hour/admission tests pass, but are not a substitute
for that browser result. No full gate was run. Cold WebSocket refusals also wait
30 minutes from the first failure instead of retrying three times then each minute.
