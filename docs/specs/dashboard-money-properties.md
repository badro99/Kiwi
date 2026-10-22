# Dashboard money properties

Run `node tools/dashboard-money-properties-test.mjs`. The suite is explicitly
wired into `tools/check.js`. It uses the existing app fast-check dependency;
missing fast-check prints an explicit green skip. Defaults: 300 runs, seed
20261024. Override with `KIWI_PROPERTY_RUNS` / `KIWI_PROPERTY_SEED`.
`strict(label, property, examples = [])` blocks on failure. `knownIssue(...)`
prints the shrunk witness, seed and replay path; unexpected exceptions block.

## Real execution and boundaries

`dashboard-money-harness.cjs` loads declarations by name with
`js-declarations.cjs`, never frozen offsets or copied financial formulas:

| Source | Entry points exercised |
| --- | --- |
| `assets/venues.js:3976` | Actual KiwiSales/Refunds readers, writers, entry normalization, batch add, annotation, void removal and cursor retention. KiwiSales lives here, not in live-link. |
| `assets/live-link.js:1410` | `applyVoids`, `accumulateFeed`, `bridgeToStore`. Retries use the same canonical server ID and cursor. |
| `assets/dateRange.js:1959` | `addMerchantDays`, merchant clock/bounds, preset/custom windows. |
| `assets/dateRange.js:2083` | `realWindowStats`, `realSalesTotals`, `realMoneyList`. |
| `assets/dateRange.js:2366` | `realDeltaPct`, shifted previous-period bounds. |
| `assets/dateRange.js:2415` | `hourlyCumul`, `dailyTotals`, `realRevSeries`. |
| `assets/dateRange.js:3348` | `renderKpiBand`: actual revenue/orders/basket projection captured at `lastBand`, before DOM painting. |
| `assets/sales-history.js` | Actual KiwiSalesMath, Summary, Window and Reconcile namespaces; private caches are initialized by the real script. Their named declarations are checked against exported function sources, preserving closure state. |
| `assets/day-report.js:276` | Real merchant clock and `build` in their initialized scope, with named entry points reloaded verbatim. |
| `assets/design-vexel-layout.js:540` | `channelAmounts`, actual KiwiChannelSales breakdown and historical channel delegation. |

Storage, HTTP responses and DOM edges are isolated fixtures. No loopback,
browser, production storage, trimming or production marker writer is involved.
The history property sets a marker only in its VM. The summary fixture uses the
real server `summarize()` implementation. Raw windows exercise real pagination,
in-flight deduplication and memory cache copies. This is a money projection test,
not a visual rendering or authentication test.

Fixture time zones: UTC, Africa/Casablanca and Europe/Paris, throughout 2026.
Explicit examples cover Paris March/October and Casablanca Ramadan February/
March transitions. The independent oracle searches valid civil 05:00 instants
using Intl; it never calls production boundary helpers. The VM memoizes Intl
formatter construction for speed, retaining real Intl formatting semantics.

Ledgers contain up to 3,000 sales over 120 business days, 1..5,000,000-centime
amounts, tips outside amount, signed refunds, zero-received deliveries, voids,
multiple tills and retry copies. Several properties explicitly include a
3,000-row example. Already-voided refunds are absent from the initial server
feed; positive rows also exercise live void removal. Refund voiding after
insertion is tested separately, including completed versus incomplete feeds.
Integer-centime sums and exact BigInt rational delta rounding are the oracles.

## Strict coverage (19 properties)

1. Preset net revenue/gross/refunds equal independent ledger sums.
2. Today, yesterday, 7 days, 30 days, previous month and inclusive custom bounds
   match independent merchant-day bounds. `moisDernier` is the real month preset.
3. Replay preserves distinct positive received sales and never includes tips.
4. KPI revenue/orders and unrounded non-refunded basket match the ledger;
   empty baskets stay finite. Display rounding is separately known as DM-8.
5. Longer chart ranges have one bucket per business day; each bucket and their
   sum match signed revenue. Repeating weekday/date labels are legitimate.
6. On 23/24-hour days, hourly curves finish at net revenue; today uses its last
   visible cumulative point. The excluded 25-hour case is DM-3.
7. 04:59:59/05:00 business-day classification survives DST/Ramadan changes.
8. Neighboring daily chart buckets attribute 04:59/05:00 exactly once.
9. Zero comparison baselines return null for every preset.
10. Closed custom comparison windows are adjacent with equal business-day count.
    Elapsed hours may differ across DST. Delta rounding is separately DM-9.
11. Dashboard today/yesterday net equals day-report net after ledger bridging.
12. Direct day reports deduplicate IDs, exclude voids and net refunds on their
    event day; their orders include zero-received live sales.
13. Completed authoritative feed reconciliation repairs voided-refund debt.
14. Positive channel totals conserve classified plus unknown revenue.
15. Summary plus retained local rows equals untrimmed net/count/gross before,
    inside and across the coverage boundary.
16. Window reconciliation preserves proved money and pending/manual rows;
    verification rejects an actual one-cent mismatch.
17. Raw historical windows fetch all pages, deduplicate concurrent requests,
    preserve signed totals and return independent cache copies.
18. Offline raw windows return null; missing summaries flag local totals partial.
19. Whole-multiple period changes yield exact finite percentage deltas.

Today/yesterday charts are hourly cumulative curves: summing their cumulative
points would double-count. Longer ranges contain daily, non-cumulative totals.

## Known witnesses and owner visibility

These distinguish defects from policy choices. Four were defects and are fixed
(22/10): DM-3, DM-4, DM-8 and DM-9 now run as strict properties with their
witnesses as explicit examples. DM-1, DM-2, DM-5, DM-6 and DM-7 are policy.

| ID | Shrunk witness | Result and reachability |
| --- | --- | --- |
| DM-1 | `[2,0]`: sale 2 cents, refund 1 cent | Basket remains 2 cents instead of requested net 1 cent. Home KPI uses gross/count deliberately. Ordinary analogue: one 100 MAD sale and a 50 MAD refund. **Gross versus net basket policy**, not an unexplained ledger loss. |
| DM-2 | `[1]`: unpaid delivery ticket, received zero | Orders is 0 instead of requested 1 because bridge drops zero-amount rows. Owner: ring a delivery-on-credit ticket, open Home. Normal whole-dirham delivery tickets have the same result. Summary also excludes zero rows. **Received-sale versus all-order count policy.** |
| DM-3 | `[1,"Europe/Paris"]` (also explicit Casablanca example) | Final 04:59 sale disappears from the hourly chart on a 25-hour business day: net is 1 cent, plotted total is 0. Paris business day 2026-10-24; Casablanca business day 2026-02-14. Owner: next morning select Yesterday. `hourlyCumul` rejects offset 24. Day-report net is correct, but its hourly detail has the same 24-offset limit. **Fixed:** the chart keeps all `ceil(span/1h)` slots; the day report keeps offset 24 and labels each slot with the merchant's own clock, the two « 02h » of the change sharing one row. |
| DM-4 | `[1]`: refund 1 cent, then void it | Standalone `watchVoids`/`applyVoids` leaves refund debt until a completed feed bridge runs refund retention. Owner: admin voids a refund, dashboard receives only the void refresh while feed is incomplete/unavailable. **Transient reconciliation gap**; completed-feed repair is strict-tested, not claimed broken. **Fixed:** `applyVoids` now also removes the voided cursors from `KiwiRefunds` (`refundsRemove` in venues.js). |
| DM-5 | `[1,0]`: 1-cent counter sale, 2-cent old-sale refund | Channel total clamps to 0 while classified remains 1 cent; net revenue is -1 cent. Ordinary analogue: 100 MAD counter revenue, 200 MAD refund against an older delivery. Owner sees Home channel ring disagree with revenue. Nonnegative channel display policy does not preserve conservation in this case. **Policy, kept:** a ring cannot draw a negative net, which stays on the revenue band; and an unmatched refund is never charged to a channel it cannot prove (channel-percentage-test). The split now runs in whole centimes, a strict property pins total = max(0, net) with no negative part, and the ring divides by max(total, classified) so no ring reads above 100 % (`[100,50,'delivery']` used to read 200 %). |
| DM-6 | `[1]`: one trading hour elapsed | Today's baseline ends yesterday at the same elapsed hour, not immediately before today's start. Owner sees “vs hier”. **Intentional matched-trading-time policy**; it violates the requested adjacency contract, not its existing documented behavior. |
| DM-7 | `[1]`: January 2026, previous-month preset | December has 31 days; baseline November has 30. Owner sees previous month versus its predecessor. **Intentional calendar-month policy**, not equal rolling duration. |
| DM-8 | `[100,101]`: two tickets, 1 MAD and 1.01 MAD | Average is 1.005 MAD; tile produces 1.00 instead of half-up 1.01. Owner sees Home average basket. Reachable with ordinary fractional restaurant prices; stress found larger examples too. **Fixed:** `basketCents` divides the centime total by the ticket count in integers, half up. |
| DM-9 | `[80,73]`: previous 80 cents, current 73 cents | Exact -8.75% should round toward +infinity at the tie to -8.7%; float arithmetic yields -8.8%. Owner sees the revenue comparison badge. Fractional-MAD period totals are valid; this is the same half-boundary class as DM-8, not a change to base-window selection. **Fixed:** `deltaTenths` compares two centime amounts in integers; rates without centimes keep the float path. |

DM-8 and DM-9 first failed during 3,000-run stress, not the default run. Their
explicit examples now keep the fast gate sensitive to both witnesses. After a
fix, known properties print a promotion reminder; promote them to strict with
the witnesses rather than deleting the assertions.

## Validation

Every strict property runs uncapped at 3,000 cases with seeds 20261024, 43 and
987654321. The fast gate also runs the default fixed-seed suite. See the final
report for results and EPERM baseline comparison.

Validated 22/10 after the fixes: 24 strict passes on each seed at 3,000 runs, zero strict failures (216,000 strict cases). Earlier: 19 strict passes on each seed, zero strict failures (171,000 strict
cases total); all nine known witnesses reproduced. `check.js --fast` had only
the established EPERM-blocked suites, also reproduced on untouched HEAD:
operations-system, audit-remediation-devices, economat-real-d1-transfer,
kiwi-agent-access, invoicing-v2-real-server-browser, retail-tender-browser,
retail-acompte-browser and print-relay. No production code changed.
