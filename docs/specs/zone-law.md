# Morocco civil-clock law

Morocco and Western Sahara use permanent UTC from 2026-09-20T01:00:00Z
(IANA 2026c, owner-verified). No persisted merchant zone, sale timestamp, archived
report, cutoff, or floor-plan style is changed.

## Rule and loading

The identical implementation/table lives in `functions/api/_zone-law.js` and
at the start of `assets/kit/haptics.js` (`KiwiZoneLaw`). The browser twin is
bundled with this existing, always-loaded kit asset because both main shells
are at their script caps. Its existing tags move before the clocks, without
`defer`; public booking/ordering/admin/TV, kitchen/reset and kit pages load the
same bundle before consumers. The asset is already in the service-worker SHELL.
The optional 2027 skin must never gate the law.

`effectiveZone(zone, epoch)` changes Casablanca/El_Aaiun to UTC only on/after
the cutover when a single lazy October-noon probe detects stale ICU. Current
ICU and other zones are unchanged. `DateTimeFormat` returns a native formatter;
on stale Morocco it corrects its `format` and `formatToParts` per timestamp,
including when the formatter is cached across the cutover. It does not patch
Intl globally. Direct Date.toLocale calls pass effectiveZone explicitly.
The configured IANA name stays intact. No dependencies or additional requests
on the dashboard/till/employee shells. CommonJS kit/report consumers load the
same browser twin. The probe and one UTC formatter are cached.

## Inventory and converted files

49 consumers: 31 browser JS files, 17 Pages/worker files, one inline HTML clock.
B = business/calendar boundaries affecting money, pricing, scheduling or validity;
H = hour/minute buckets or service clocks; D = display. Mixed sites keep every
classification. Rule twins, shell wiring and stamp-only changes are additional.
All listed consumers now use the twin, including cached formatters.

| File:first clock line | Class | Entry points / use |
| --- | --- | --- |
| `assets/admin-demo-requests.js:17` | D | dt and slotDate |
| `assets/admin-policy.js:13` | B | civilDate for subscription validity; also imported server-side |
| `assets/booking.js:24` | B,H,D | venueToday, venueHour, fmt |
| `assets/caisse-app.js:36` | D | live clock and civil date; accounting delegates to DayReport |
| `assets/dateRange.js:1946` | B,H,D | merchantParts/boundaries, selectedBusinessDay and transaction times |
| `assets/day-report.js:160` | B,H | civilFormatter/civilParts; boundaries and hourOf |
| `assets/employee-planning.js:79` | B | todayKey for store scheduling |
| `assets/employee-trade-shell.js:109` | B,D | dateKey/timeLabel |
| `assets/hotel.js:2510` | B,H,D | reservation/stay/payment dates, calendar bounds and displayed times |
| `assets/hours.js:141` | B,H | zoneFmts and per-instant offsets for opening hours |
| `assets/invoicing.js:274` | B,D | dayIn/today and invoice date display |
| `assets/kit/business-day.js:47` | B | browser businessDate/businessBoundary and windows |
| `assets/kit/format.js:104` | D | KiwiFormat cached date/time formatter |
| `assets/kit/ledger.js:65` | B,H | cached parts/clock, ledger day boundaries |
| `assets/menu-promos.js:60` | B,H | cached wall clock/businessMoment for time-dependent prices |
| `assets/month-report-pdf.js:28` | D | report-zone print timestamp |
| `assets/month-report-tools.js:37` | D | timestamp fallback display |
| `assets/month-report-ui.js:54` | D | asOf display |
| `assets/month-report.js:13` | B,H | civil parts and report periods |
| `assets/orderpro-guest.js:215` | D | clock/guest timestamp |
| `assets/orderpro-guestpage.js:136` | D | guest timestamp display |
| `assets/pages-pro.js:204` | B,H,D | civil parts/day ranges, transaction grouping and labels |
| `assets/pos-fastfood.js:371` | H | casaSlot: sales half-hour buckets |
| `assets/pressing-dashboard.js:78` | D | store-zone displayed timestamps |
| `assets/promos.js:126` | B,H | cached wallFmt/businessMoment for time-dependent prices |
| `assets/ramadan.js:31` | H | civilParts for Ramadan service clock |
| `assets/report.js:117` | B,H,D | merchantParts/boundaries and cached date labels |
| `assets/reservations.js:368` | B,H,D | zoned parts/epoch, dateLabel and agenda date |
| `assets/restaurant-menu-workspace.js:1934` | H | zoneClock: per-sale merchant minute |
| `assets/serveur-app.js:256` | B,H,D | employee civil keys, clock, punch and shift display |
| `assets/trade-workspace-schema.js:153` | B,H | zoneParts for employee trade workspace dates |
| `functions/api/_business-day.js:16` | B | parts/clock, businessDate/businessBoundary; all route callers inherit the law |
| `functions/api/_demo-requests.js:97` | D | demoReference and slotText civil dates |
| `functions/api/_weather.js:106` | H | DAY_FMT/localParts, forecast day/hour |
| `functions/api/admin/report.js:42` | H | merchant-hour sales buckets |
| `functions/api/booking.js:90` | B,H | zonedParts/zonedEpoch; availability and reservations |
| `functions/api/comptable/books.js:52` | B,H,D | business boundaries and cached civil time labels |
| `functions/api/hotel/_billing-draft.js:41` | B | occurredTs billing date |
| `functions/api/hotel/_channels.js:107` | B,H | channel civil parts/zoned epochs |
| `functions/api/hotel/declarations.js:68` | B | civil declaration dates |
| `functions/api/hotel/stays.js:163` | B,H | civil parts and zoned stay timestamps |
| `functions/api/invoices.js:92` | B | todayFor: invoice civil date |
| `functions/api/month-report.js:23` | B,H,D | clockLabels and business-day report bounds |
| `functions/api/order/_guest.js:311` | B | store-zone civil date |
| `functions/api/order/_lib.js:283` | B,H | civil parts, zoned boundaries, opening hours, day/week numbering |
| `functions/api/order/_lib.js:21` | B,H | publishes the law as `globalThis.KiwiZoneLaw` for `assets/menu-promos.js`, so `priceOrder` opens a happy hour on the legal clock, like the till |
| `functions/api/order/index.js:175` | H,D | iftar wall clock |
| `functions/api/sales-summary.js:40` | B,H | business-day windows and cached hourClocks |
| `order-tv.html:180` | D | inline clock |
| `workers/morning-push/index.js:17` | H | casablancaTime/inSendWindow; lawful 05:30 dispatch |

Transitive money readers include `/api/z-reconciliation`, `/api/feed` window
bounds, push/morning, agent reports, sale reports and all tills using DayReport;
their calls to `_business-day.js`/DayReport inherit the rule without route edits.

Left deliberately: IANA-name detection/publication (`timezone.js`, merchant
configuration); explicit UTC calendar-label formatters (charges, kiwi-report,
agent, menu-promos-dashboard); and unnamed device-local UI dates. The rule is
not a global change to Date/getHours or Intl.resolvedOptions. Floor-plan styling
is untouched. Existing clock-format fallbacks still let isolated legacy callers
boot without the kit; every shipped named-zone consumer loads the kit first.

## Regression and expectation changes

`tools/zone-law-test.mjs` checks exact twin drift, unconditional bundle tags,
simulated stale/current ICU, both Moroccan zones, pre/post cutover and the fold,
server/browser bounds and business dates, ledger dates, KiwiFormat, actual
DayReport hour slots (the repeated 01 hour merges without losing revenue), and
the real Z handler against SQLite. September 19 is 25 hours: 04Z to next-day 05Z.

13 existing test/fixture files had stale post-cutover expectations/oracles:

- `tools/business-day-timezone-test.mjs`: December/January cutoff 05Z.
- `tools/sales-summary-test.mjs`: October civil offsets +00; Paris unchanged.
- `tools/agent-business-day-test.mjs`: October boundary fixtures +00.
- `tools/accountant-portal-test.mjs`: October/November ledger bounds 05Z.
- `tools/morning-push-test.mjs`: October dispatch 05:30Z and boundaries 05Z.
- `tools/order-hours-server-test.mjs`: October Casa wall times UTC.
- `tools/store-clock-test.mjs`: independent lawful post-reform clock oracle.
- `tools/demo-request-api-test.mjs`: 23:30Z stays on the same civil date.
- `tools/sync-ledger-boutique-clock-test.mjs`: former skew witness now matches.
- `tools/sales-history-parity-test.mjs`: hours follow the law-aware formatter.
- `tools/dashboard-money-properties-test.mjs`: independent explicit-law oracle.
- `tools/fixtures/ledger-fixtures.mjs`: lawful civil fixture epochs; historical
  Ramadan transition now February 2026, not a nonexistent transition in 2027.
- `tools/ledger-agreement-test.mjs`: keeps 23/25-hour historical DST coverage in 2026.

VM bootstrap/lint plumbing additionally changes business-day-default,
dashboard-money-harness, employee-timezone (structural matcher only) and kit-lint.
Only the exact drift-tested law-table declaration is exempt from the default-zone
lint; literal default zones elsewhere still fail its negative controls.

Bumping report.js exposed an existing blind spot: tools/stamps.js did not track
the dashboard-extra lazy URL. It now tracks/cascade-bumps that carrier, with a
throwaway fixture in bump-stamp-test. No stamp is edited manually.


## Validation in this sandbox

Final `node tools/check.js --fast`: 657 test files; no new failure. 17 diagnostics
come from nine suites, reproduced on the untouched 432eaf90 snapshot: eight
listen/EPERM suites below and the known pos-truth-a traiteur schedule assertion.
The iOS/xcrun simulator warning is pre-existing. New law suite: 1,439 assertions;
ledger agreement: 47,148; PWA shell: 787; size ratchet: 652; bump tool: 69.

Loopback suites blocked here (all independently fail with EPERM on untouched HEAD):
operations-system-test, audit-remediation-devices-test,
economat-real-d1-transfer-test, kiwi-agent-access-test,
invoicing-v2-real-server-browser-test, retail-tender-browser-test,
retail-acompte-browser-test, print-relay-test.

The following browser suites were skipped by the fast tier, not reported passed:

- `live-link-outbox-browser-test.mjs`
- `hotel-stays-group-browser-test.mjs`
- `hotel-direct-booking-browser-test.mjs`
- `planning-phone-browser-test.mjs`
- `restaurant-reopen-browser-test.mjs`
- `owner-identity-browser-test.mjs`
- `z-reconciliation-browser-test.mjs`
- `employee-timezone-browser-test.mjs`
- `ink-debt-browser-test.mjs`
- `caisse-ink-dark-browser-test.mjs`
- `month-report-browser-test.mjs`
- `client-history-browser-test.mjs`
- `course-firing-browser-test.mjs`
- `close-open-tables-browser-test.mjs`
- `kds-recall-browser-test.mjs`
- `kds-course-following-browser-test.mjs`
- `pairs-caisse-browser-test.mjs`
- `pairs-serveur-browser-test.mjs`
- `pairs-boutique-browser-test.mjs`
- `till-repair-lock-browser-test.mjs`
- `landing-es-browser-test.mjs`
- `scan-wedge-browser-test.mjs`
- `pos-maison-split-browser-test.mjs`
- `maison-caisse-browser-test.mjs`
- `maison-shelf-price-browser-test.mjs`
- `maison-dashboard-browser-test.mjs`
- `maison-movement-kpis-browser-test.mjs`
- `retail-return-stock-browser-test.mjs`
- `avoir-customer-scope-browser-test.mjs`
- `clients-book-page-browser-test.mjs`
- `transactions-nav-stability-browser-test.mjs`
- `shared-day-selector-browser-test.mjs`
- `date-controls-browser-test.mjs`
- `discount-policy-browser-test.mjs`
- `discount-policy-live-browser-test.mjs`
- `caisse-item-cancel-browser-test.mjs`
- `native-pass2-browser-test.mjs`
- `team-browse-readonly-browser-test.mjs`
- `kds-language-fallback-browser-test.mjs`
- `caisse-restaurant-lang-browser-test.mjs`
- `dynamic-type-200-browser-test.mjs`
- `ticket151-browser-test.mjs`
- `menu-shell-browser-test.mjs`
- `invoicing-v2-browser-test.mjs`
- `escpos-arabic-browser-test.mjs`
- `french-leak-browser-test.mjs`
- `view-link-browser-test.mjs`
- `merchant-health-browser-test.mjs`
- `charges-browser-test.mjs`
- `pwa-first-install-browser-test.mjs`
- `dashboard-pin-vault-browser-test.mjs`
- `team-codes-browser-test.mjs`
- `browser-trace-test.mjs`
- `menu-promos-browser-test.mjs`
- `motion-browser-test.mjs`
- `dark-startup-browser-test.mjs`
- `rev-chart-daily-browser-test.mjs`
- `venue-type-refocus-browser-test.mjs`
- `ice-browser-test.mjs`
- `promo-window-browser-test.mjs`
- `boutique-phone-browser-test.mjs`
- `ipad-touch-browser-test.mjs`
- `delivery-collect-browser-test.mjs`
- `sync-ledger-browser-test.mjs`
- `sync-ledger-boutique-browser-test.mjs`
- `credit-book-dashboard-browser-test.mjs`
- `a11y-browser-test.mjs`
- `native-owner-home-browser-test.mjs`
- `tokens-2027-browser-test.mjs`
- `kit-gallery-browser-test.mjs`
- `kit-in-host-browser-test.mjs`
- `haptics-map-browser-test.mjs`
- `motion-park-browser-test.mjs`
- `kpi-polarity-browser-test.mjs`
- `kit-bidi-browser-test.mjs`
- `kit-budget-browser-test.mjs`
- `pin-announce-browser-test.mjs`
- `pin-focus-browser-test.mjs`
- `clock-expiry-browser-test.mjs`
- `pair-redeem-timeout-browser-test.mjs`
- `till-pin-browser-test.mjs`
- `dash-pin-browser-test.mjs`
- `team-pin-browser-test.mjs`
- `kds-board-browser-test.mjs`
- `orderpro-parity-browser-test.mjs`
- `till-frame-browser-test.mjs`
- `cash-count-browser-test.mjs`
- `attendance-browser-test.mjs`
- `dash-home-browser-test.mjs`
- `dash-orders-browser-test.mjs`
- `dash-report-browser-test.mjs`
- `dash-customers-browser-test.mjs`
- `dash-retention-browser-test.mjs`
- `dash-compliance-browser-test.mjs`
- `dash-ai-browser-test.mjs`
- `dash-frame-browser-test.mjs`
- `dash-desktop-browser-test.mjs`
- `dash-phone-browser-test.mjs`
- `dash-phone-pages-browser-test.mjs`
- `dash-phone-pages-ar-browser-test.mjs`
- `dash-phone-pages-kit-browser-test.mjs`
- `dash-phone-sheets-browser-test.mjs`
- `dash-phone-sheets-ar-browser-test.mjs`
- `epicerie-phone-browser-test.mjs`
- `trade-tickets-phone-browser-test.mjs`
- `kds-cards-browser-test.mjs`
- `access-gate-browser-test.mjs`
- `team-split-browser-test.mjs`
- `dash-onboarding-browser-test.mjs`


## Commit status

The authorized, path-specific git add was rejected by the sandbox: the index
lock is outside this writable worktree, at
`/Users/zaka/Developer/kiwi/.git/worktrees/kiwi-g15/index.lock` (Operation not permitted).
No files were staged, committed or pushed. Intended message:

```text
horloges · applique l’heure légale du Maroc dans les caisses et le serveur

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
