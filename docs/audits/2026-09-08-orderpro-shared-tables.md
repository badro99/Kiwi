# OrderPro shared tables and service requests

Scope: customer requests must reach the caisse even when there are no waiters;
multiple phones can order at one table; table transfers and merges are forbidden
once any order in the visit has reached the kitchen.

## Implemented

- The existing `service-events` document now retains pending guest requests
  separately from its bounded event history. Caisse receives all requests;
  on-shift waiters retain their existing assignment/coverage filtering.
- Both staff surfaces use the same responsive request inbox. Requests persist
  until explicitly marked **Traité** or their visit closes. Handling a request
  on either device clears it for the others through the shared feed.
- Repeated guest taps coalesce per visit/action. Failed reads or acknowledgements
  do not report successful handling. Request writes check the open visit inside
  their conditional database statement.
- Customer copy says **Appeler l’équipe** and confirms transmission, not staff
  arrival. **Mes commandes** explicitly describes this phone's orders; it is not
  presented as the complete table bill. Asking for the addition requests the
  whole table bill, without inventing a total or a saved tip.
- Separate phones keep separate baskets and order retry references while joining
  the same visit. An unpaid visit is not replaced simply because phones sleep.
  Settlement ends ordering on all phones, including phones with draft baskets;
  opening another visit requires the explicit reorder flow.
- Guest and staff inserts validate the captured visit at the write boundary.
  Waiter order append no longer depends on the mutable phone heartbeat revision.
- Transfer and merge claims check kitchen submission inside their atomic batch,
  with corresponding staff UI guards and understandable refusal messages.
  Accepted, ready, served, or historically kitchen-submitted orders lock the
  current visit. Successful printing is not required. A failed merge cannot
  create a destination visit as a side effect.
- Preserved the optional empty formula-choice filter in OrderPro.

This release requires no migration, production configuration change, or guest-data
import. Publication is isolated from unrelated shared-checkout changes. A Git push
does not certify deployment or a live Pasta Corner smoke test.

## Verification

Final verification: `node tools/check.js` passed with one existing styling-debt
warning, including 209 native shell browser controls. The 33 shared-table route
checks and the separate responsive request-inbox browser suite also passed.

- `tools/orderpro-shared-table-test.mjs`: actual route handlers against SQLite,
  including three simultaneous phones, retry deduplication, long meals,
  cashier-only service requests, shared acknowledgement, reconnect/event rollover,
  closed visits, concurrent submission/settlement, transfer/send races, rejected
  merges, and storage-read failures.
- `tools/service-requests-ui-test.mjs`: Chromium at desktop 1440×900, tablet
  834×1112, and phone 390×844; dialog bounds, 44px controls, keyboard containment,
  failed acknowledgement, two-device handling, stale-poll protection, escaping,
  and merchant/session UI reset. This is a local component fixture, not a live
  authenticated merchant session or a physical-device test.
- Existing relay, service interconnectivity, settlement, transfer/merge,
  session/reorder, operating-day order integration, and waiter sender tests.
- HTML inline-script parsing and asset-stamp checks.

Browser runner accepts `KIWI_PLAYWRIGHT_PATH`, `KIWI_CHROME_PATH`, and optional
`KIWI_TEST_ARTIFACT_DIR` so it can use an installed browser without downloading one.

Before production: review the scoped changes against the shared checkout,
publish through the approved release process, then test two customer phones and
the authenticated caisse at a designated test table. Verify both service buttons,
shared handling, kitchen locking, payment closure and the next table visit.
