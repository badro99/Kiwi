# Restaurant till split: map and first slice

Reference: 18b48af7, original `assets/caisse-app.js`, 17,536 lines.
Line ranges below refer to that reference, not the shortened working file.

## Structure and shared scope

This is a flat **classic script**, not one IIFE. Its 1,079 top-level statements
include 608 function declarations and 879 named bindings in total. Top-level
functions/var are window properties; let/const are shared global lexical
bindings, not window properties. The one top-level var is
`__activeRealZoneFilter` (1004), also a window property. Moving this script to a module would break
those contracts. Small internal IIFEs are at 1222–1296 (floor mirror),
2502–2514 (menu language), 2879–2908 (free amount keypad), 5027–5035 (total
observer), 10322–10348 (post-close wiring), 17312–17445 (support/restore)
and 17504–17528 (demo badge). They share the outer global environment.

| Original lines | Section | Shared state / interfaces |
| --- | --- | --- |
| 1–177 | Helpers, clock, staff | $, $$, money/minor/major, formatters, servers |
| 178–1297 | Floor/tables, demo boundary, plan sync | tables, tableOrders, IS_DEMO, floor renderer, KiwiFloorPlan |
| 1298–1834 | Floor/mode switching, toast, bill panel | mode, selectedId, activeSub, KiwiCaisseToast |
| 1835–2297 | Menu, station config, waitlist/stock seeds | carteState, menuItems, cart, KiwiCaisseCarte, stockItems |
| 2298–4077 | Menu artwork, options, grouped lines, kit ticket UI | activeCat, cart, tableOrders, grouping/price helpers |
| 4078–4550 | Review and bill actions | selectedId, totals, latest ticket, __lastTicket |
| 4551–5196 | Card/cash/tips, elapsed clock | payment modal state, pending payments, journal callbacks |
| 5197–6734 | New table, waitlist, transfer/merge, kitchen dispatch | tables, tableOrders, kitchen queue, newTableId |
| 6735–7439 | Split bill | splitState, splitPayCallback, allocations |
| 7440–7598 | PIN login, kitchen terminal unlock | pinBuffer, __kiwiUnlockApp, __kiwiPinReset |
| 7599–8952 | Shift, sales journal, accounting, customers | shift, journal, held sales, cashier/poste, clients |
| 8953–11135 | Receipt, closing report, statistics, sales journal drawer, opening float | receipt identity, buildDayReport, rollups, drawer/clock-in state |
| 11136–11787 | Manager gate, attendance, team, message/reassignment | authAct, requireManager, team modal state |
| 11788–12047 | Persisted splits and reopening | tableSplits, takeaway splits, KiwiRestaurantReopen |
| 12048–12660 | Discount and refund flows | journal, manager gate, table discount, refund snapshots |
| 12661–13120 | Handover/accounting API, bill actions | KiwiCaisseContext, KiwiCaisseAccounting, handovers |
| 13121–13165 | Startup menu/recipe binding | immediate render/fetch; storage, pairing, visibility handlers |
| 13166–13991 | Kitchen display | KDS stations/orders, counters, accept/ready/history |
| 13992–14990 | Stock/procurement | stockItems, supply orders, intake, waste, stock modals |
| 14991–16702 | Takeaway board, counter settlement, relay ingestion | vrapView, vrapOrders, opIngest, KiwiCaisseKitchen |
| 16703–17498 | Shift persistence, tenant fencing, floor sockets | KC_STORE, persist/restore, tenant hook, service-ready flag |
| 17499–17536 | Demo badge and icon first paint | immediate badge paint; DOMContentLoaded/load listeners |

## Explicit window writes

These are distinct from the hundreds of implicit function globals. `load` means
execution of the classic core; methods inside the exported objects run later.

| Original line | Name | Write time |
| --- | --- | --- |
| 262 | __kiwiCaisseBootedAsDemo | load |
| 1251 | KiwiFloorPlan | floor-mirror fetch callback |
| 1490 | KiwiCaisseToast | load |
| 2134 | KiwiCaisseCarte | load |
| 4397 | __lastTicket | payment/ticket action |
| 7446, 7588 | __kiwiUnlockApp, __kiwiPinReset | load |
| 7638 | __kiwiCashSessionPending | cash-session emission without its deferred store |
| 8256 | KiwiCaisseHeldSales | load |
| 11204, 11219, 11422 | KiwiAuthAct, KiwiAuthorizeTillAction, requireManager | load |
| 11970 | KiwiRestaurantReopen | load |
| 12699, 12966 | KiwiCaisseContext, KiwiCaisseAccounting | load |
| 13194 | kdsStations, KiwiCaisseStations | load |
| 16412 | KiwiCaisseKitchen | load |
| 16923 | __kiwiTillTenantHook | load |
| 17290 | KiwiTillServiceReady | successful service restore/initialization |

## Other-script consumers and timing

Line numbers here are the consuming files at the reference. Most are head
`defer` scripts, so their load occurs **after** the bottom blocking core. Lazy
vertical scripts run after a user opens the vertical. Guards may read a property
on startup and then again on a click, poll or event. Shared dependency APIs are
also used by the moved functions; those reads still happen inside their bodies.

| assets/ file:line | Globals read | Time / entry point |
| --- | --- | --- |
| caisse-pairing.js:146,199,783 | demo boot flag, unlock/reset | deferred pairing bootstrap; pairing success/lock actions |
| caisse-doctor.js:162 | KiwiCaisseCarte | diagnostics callback |
| caisse-menu-availability.js:124 | KiwiCaisseCarte | render/config/menu refresh |
| caisse-pwa.js:156,294 | KiwiCaisseHeldSales | status polling and retry button |
| caisse-refresh.js:119,226 | KiwiCaisseCarte, KiwiTillServiceReady | deferred boot and refresh/visibility poll |
| caisse-stock-sync.js:400 | window.currentCashier | stock operation actor resolution |
| cash-sessions.js:64 | __kiwiCashSessionPending | deferred load drains queued events |
| clients-store.js:740 | KiwiCaisseToast | client-sync error callback |
| kitchen-print-queue.js:178 | KiwiCaisseToast | print/error callbacks |
| live-link.js:1864 | KiwiTillServiceReady | feed/recovery startup callback |
| loyalty-reserve.js:26 | KiwiCaisseToast | redemption result/error callback |
| maison-stock-movements.js:459 | requireManager, KiwiAuthAct | guarded stock action |
| orderpro-inbox.js:217,243 | KiwiCaisseKitchen, KiwiAuthorizeTillAction, KiwiAuthAct | poll/socket ingest and user actions |
| pos-dispatch.js:216,244,372 | KiwiCaisseToast, __kiwiPinReset | unlock/load error, toast and lock actions |
| pos-autre.js:44 | KiwiCaisseToast | lazy vertical actions |
| pos-boulangerie.js:375; pos-fastfood.js:508; pos-foodtruck.js:307; pos-pizzeria.js:539; pos-traiteur.js:475 | KiwiCaisseCarte | lazy real-store mount/menu fetch |
| pos-boutique.js:29,438; pos-maison.js:60,435 | KiwiCaisseToast, requireManager, KiwiAuthAct | lazy vertical toast/authorization actions |
| pos-hotel.js:357 | KiwiCaisseContext | hotel financial action context |
| pos-inventory-count.js:42,167,405,490 | window.currentCashier, window.stockItems, openSkModal, closeSkModal, toast | inventory launch/count/close actions |
| pos-reprint.js:528 | KiwiRestaurantReopen | selected receipt reopen action |
| pressing-caisse.js:1092 | __kiwiPinReset | lazy vertical lock action |
| printer-bridge.js:223 | KiwiCaisseStations / kdsStations | printer/station settings operation |
| retail-scan.js:45 | KiwiCaisseToast | scanner actions |
| till-tenant.js:40 | __kiwiTillTenantHook | tenant read/reconciliation callback |

`currentCashier` and `stockItems` are lexical bindings, so attempted **window**
reads above do not export them; those consumers already have guarded fallbacks.
This refactor preserves that existing distinction. Cross-page name matches in
serveur-app, orderpro-guest, orderpro-boutique and pages-pro are independent page
bindings, not evidence that those scripts consume the restaurant till.

`kiwi-caisse.html` has no inline onclick/oninput/onchange handlers reading these
globals. Its early inline scripts handle theme and kiosk setup; line 625 reads
KiwiCaisseRefresh, an API from another asset. Till actions use data-action and
listeners registered by the core. Deferred scripts and later user callbacks
therefore continue to see the same completed global environment.

## Split plan and first slice

The largest movable feature group is shift/accounting/receipt/journal,
7599–11135. This slice moves **only its 123 top-level function declarations**,
with their original attached whitespace/comments, to `caisse-accounting.js`
(2,951 lines). Every body byte is unchanged. State initializers, listener
registration and the post-close IIFE stay in core at their original positions.
The remaining core has 14,586 lines. There is **zero runtime glue**: functions
use the same global lexical bindings and create the same window properties.
The exact function names, offsets and original line ranges are in
`tools/fixtures/caisse-app/split.json`.

The new tag is immediately **before**, not after, caisse-app.js. Both are
blocking classic scripts. The prelude only declares functions, making them
available when core initialization starts, just as original script declaration
instantiation did. Moving these declarations after core would break eager
references/initializers. Using defer would move work past the existing head
scripts and change ordering. No module, async loader or namespace is introduced.

There were 88 src tags against pin 86 + slack 3. This adds one: 89, at the
allowed ceiling. Both URLs are stamped and precached. No further src tag fits.
Future declaration-only candidates are menu/order helpers (1835–4077), kitchen
helpers, and inventory helpers; initializers/listeners must remain ordered.
The current prelude has room below the 5,000-line new-file cap, but whole later
stateful sections cannot simply be appended after core. Further files will need
bundling with a neighbour or an explicit build-time concatenation into the
existing classic entry URLs, keeping source sections small without another tag.
A dynamic async loader would create a readiness gap for deferred consumers and
is not an acceptable zero-behaviour substitute. No such loader/build is added.

## Proof and browser reruns

`caisse-app-split-test.mjs` is in check.js. It verifies exact byte reconstruction,
only function declarations moved, adjacent blocking tags, precache membership,
and all global function descriptors/sources. It runs the original and actual
prelude/core as classic scripts in the same VM realm for demo and real-store
stubs, comparing startup effects, registrations, DOM writes and storage order, shared financial state and journal rollup.
The existing caisse source adapter reconstructs actual production fragments for
legacy extraction tests; it never substitutes the frozen reference for runtime
bodies. Icons are transferred 85 -> 74 core + 11 prelude. No CSS baseline moves.

The VM DOM is a stub, not rendered-browser evidence. For future browser parity,
wait for cash-payment veil closure and provider growth, normalize kiwi:posDevice
and receipt meta.terminal, and await the MutationObserver-inserted `.kcl` picker
before the first snapshot. These are the owner's corrections to the Maison test.

### Browser inventory for the owner

The literal `kiwi-caisse.html` grep finds 204 test files; 50 contain a browser
harness/reference. This broad inventory includes shared-layout and other-vertical
checks, not only restaurant payment flows. “Fixture” means source reconstructed
from actual production fragments; “page/harness” can exercise the real script
tags and load order. The most relevant restaurant reruns are sync-ledger,
cash-count, close-open-tables, opening-float, field-split-ui, course-firing,
caisse-item-cancel, caisse-restaurant-lang, kds-board, kds-recall, pairs-caisse,
delivery-collect and z-reconciliation.

| tools/ suite | Harness |
| --- | --- |
| sale-unsynced-test.mjs | Page/harness |
| native-store-readiness-test.mjs | Page/harness |
| field-split-ui-test.mjs | Fixture |
| kds-board-browser-test.mjs | Page/harness |
| components-sum-test.mjs | Page/harness |
| caisse-item-cancel-browser-test.mjs | Fixture |
| dynamic-type-200-browser-test.mjs | Page/harness |
| delivery-collect-browser-test.mjs | Page/harness |
| pairs-boutique-browser-test.mjs | Page/harness |
| menu-promos-browser-test.mjs | Page/harness |
| native-premium-feel-test.mjs | Fixture |
| till-pin-browser-test.mjs | Page/harness |
| native-pass3-gates-test.mjs | Page/harness |
| till-frame-browser-test.mjs | Page/harness |
| online-inbox-test.mjs | Page/harness |
| scan-wedge-browser-test.mjs | Page/harness |
| epicerie-phone-browser-test.mjs | Page/harness |
| banner-announce-test.mjs | Page/harness |
| till-repair-lock-browser-test.mjs | Page/harness |
| clients-book-page-browser-test.mjs | Fixture |
| caisse-ink-dark-browser-test.mjs | Page/harness |
| trade-tickets-phone-browser-test.mjs | Page/harness |
| app-interaction-test.mjs | Page/harness |
| avoir-customer-scope-browser-test.mjs | Fixture |
| pwa-first-install-browser-test.mjs | Page/harness |
| kds-recall-browser-test.mjs | Page/harness |
| pay-height-test.mjs | Page/harness |
| caisse-restaurant-lang-browser-test.mjs | Page/harness |
| caisse-viewport-guard-test.mjs | Fixture |
| boutique-phone-browser-test.mjs | Page/harness |
| native-owner-home-browser-test.mjs | Page/harness |
| ipad-touch-browser-test.mjs | Page/harness |
| font-face-census-test.mjs | Page/harness |
| pairs-caisse-browser-test.mjs | Page/harness |
| pos-maison-split-browser-test.mjs | Page/harness |
| till-approval-server-writes-test.mjs | Fixture |
| opening-float-test.mjs | Page/harness |
| course-firing-browser-test.mjs | Fixture |
| close-open-tables-browser-test.mjs | Page/harness |
| cash-count-browser-test.mjs | Page/harness |
| attendance-browser-test.mjs | Page/harness |
| discount-policy-live-browser-test.mjs | Fixture |
| a11y-browser-test.mjs | Page/harness |
| maison-caisse-browser-test.mjs | Page/harness |
| native-device-layout-test.mjs | Fixture |
| z-reconciliation-browser-test.mjs | Page/harness |
| native-pass3-locale-test.mjs | Page/harness |
| sync-ledger-browser-test.mjs | Page/harness |
| till-autre-frame-test.mjs | Page/harness |
| french-leak-browser-test.mjs | Page/harness |

The first slice adds no browser test. VM/structural parity passes; rendered
restaurant payment flows still need the owner's browser run.

## Validation in this sandbox

`node tools/check.js --fast` has only the eight known EPERM suites:
operations-system, audit-remediation-devices, economat-real-d1-transfer,
kiwi-agent-access, invoicing-v2-real-server-browser, retail-tender-browser,
retail-acompte-browser and print-relay. All eight independently reproduce EPERM
on an untouched 18b48af7 export. No new product check fails.

The new VM/structural suite passes. PWA: 787 checks, all 17 verticals complete
offline. Stamps: 1,157 checks. Material icons: 30 checks. Size ratchet: 648 checks.
Browser inventory above is for the owner; browser rendering/payment assertions
were not executed here. No claim of browser parity is made.

## Second slice (22 October 2026): floor and kitchen

Same rule as the first slice: only top-level function declarations move, byte
for byte and in their order; every `let`/`const`, every statement that runs at
load and all state stay in `caisse-app.js` (14,619 → 9,783 lines). Two more
blocking classic preludes, between `caisse-accounting.js` and `caisse-app.js`:

| File | Functions | From (lines of caisse-app.js before this slice) |
| --- | --- | --- |
| `assets/caisse-floor.js` | 80 | floor plan rendering and mirror, floor/mode switching, toast, bill panel (345–1834); new table, waitlist, transfer and merge, table orders (5200–6205) |
| `assets/caisse-kitchen.js` | 108 | sending the room to the kitchen (6206–6738), kitchen-display PIN mode (7522–7625), KDS (10249–11074), one ticket per station, takeaway board and the phone-order bridge (11810–13785) |

`tools/fixtures/caisse-app/split-2.json` records the 30 runs of moved
declarations and, for each, a text anchor in `caisse-app.js` it used to
precede. `tools/caisse-test-source.cjs` puts the runs back before their anchors,
so the legacy tests read exactly the source they read before (proven byte for
byte by `caisse-app-split-test`, which also runs both preludes in an empty
realm: functions only, nothing at load). An edit elsewhere keeps the anchors;
if one is edited away the tests read the live files in load order. The VM
startup parity (demo and real: startup calls, storage, financial state, DOM
writes, globals and registrations) was checked against the pre-slice files at
split time. The floor plan's look is untouched.
