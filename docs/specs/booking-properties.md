# Booking, availability and deposit properties

Run `node tools/booking-properties-test.mjs` (fast tier in check.js).
fast-check comes from app/node_modules; absence prints an explicit skip.
Defaults: 100 cases, seed 20261102. KIWI_PROPERTY_RUNS / KIWI_PROPERTY_SEED
replace them; KIWI_PROPERTY_ONLY matches strict labels by regular expression.
strict() accepts examples; knownIssue() prints shrunk witnesses and treats
unexpected exceptions or a now-passing known issue as failures.

## Real paths and evidence

The suite calls real booking GET/POST/DELETE, authenticated store POST and hotel
stays POST with Request objects. server-money-fixture.mjs builds schema.sql on
SQLite. Its adapter is wrapped only so SELECT-only D1 batches return rows; write
batches retain atomicity and revision compare-and-swap. Authentication uses real
owner cookies with a fake AUTH_SECRET. No network or browser socket is needed.
One database per process is reused/reset between cases, not rebuilt per case.

Public/public and public/staff requests race through Promise.all, reading the
same initial revision and letting real SQL choose the winner. Random action
sequences include public/staff creation, cancellation, staff reschedule and
blocks. Pairwise half-open interval checks run after every action. These start
with a valid ledger; existing overlap grandfathering is not certified as a
clean ledger. Blocks prevent subsequent allocations, not automatic cancellation
of existing customers. Staff edits use the same client validate() and real
revisioned store protocol as the Reservations domain.

assets/reservations.js is evaluated in VM, and its real datetime declarations
are extracted with js-declarations.cjs. pages-pro.js has the legacy Reservations
handler at nav-reservations; the Reservations module installs the live handler
and domain. Its large demo section was not read wholesale or changed.
The public booking page already reads state.config.tz for display; the API now
supplies it on configuration, slots, hotel and manage responses.

Independent money oracles use integer input cents, capped deposit cents and
night count multiplication. Independent civil-minute oracles enumerate real
instants, checking every occupied minute and the civil step grid. They cover
Paris spring/fall, Morocco's 20 September fold, and modeled stale/current ICU
for both Moroccan zone names. Production clock logic is not reused as oracle.
The test clock is pinned to 22 October 2026; no wall-clock-dependent slot race.

## 26 strict properties

- Last-resource public/public and public/staff races have one winner.
- Concurrent identical retries keep one booking and return its bearer token only
  with the first successful write; conflicting identities are already covered
  by booking-api-test.
- N eligible resources accept N concurrent parties, reject the next, and release
  one place after cancellation. This is resource capacity, not service.capacity.
- Offered normal/overnight slots accept the advertised resource/party; off-grid,
  past, out-of-hours, beyond-horizon and oversized requests cannot commit.
- Configured UTC/Paris/Morocco zones determine instants and returned tz.
- Duplicate periods cannot duplicate a resource in a slot.
- Random staff/public/cancel/reschedule/block sequences retain resource uniqueness.
- A manage cancellation touches only its own canonical booking; retries add no
  revision. Forged and foreign-merchant tokens expose no booking.
- The cancellation deadline is inclusive; one millisecond late changes nothing.
- Booking/cancellation creates no sale, deposit debit or invented refund.
- Server/client service normalizers preserve centime prices and cap deposits.
- Hotel last-room races/retries retain one D1 stay. Occupied folio nights and
  arrivals beyond the rolling window cannot be sold. Quotes retain night cents
  with the 15:00/11:00 boundaries. Public and staff routes agree in the store zone.
- The staff editor accepts overnight starts and refuses a declared closed day.
- A 24-hour normal opening exposes all 288 five-minute slots, including the last.
- Invalid dates and nonexistent civil instants cannot normalize into another date.
- Actual slot instants equal the independent DST minute oracle. Repeated hours
  remain distinct instants; missing wall minutes never become slots.
- The actual staff datetime parser and hotel day-use reject a missing Paris hour
  without writing a 1970 boundary.

## Root fixes and retained witnesses

- functions/api/booking.js: an offered Saturday 00:00 from Friday 22:00–02:00
  returned slot-unavailable. POST now checks this opening day and the previous
  one. Merchant zone flows through opening hours, staffing, hotel folio checks
  and boundaries, and is included in public responses. Duplicate resource ids
  are removed; the silent 160-slot truncation is removed. Nonfinite/out-of-window
  timestamps are refused before Intl can throw on an unrepresentable date.
- functions/api/_booking-clock.js: bounded 64-day offset timelines intersect civil
  openings with actual UTC segments. Duration is real elapsed minutes; grid is
  civil minutes anchored at opening. This handles even ambiguous closing times,
  rather than interpreting the fold as uninterrupted open time when it is not.
  Missing civil datetimes return zero, not a different requested hour. No new
  browser dependency, tag, request or SHELL entry is necessary for this server
  helper. It uses the existing zone-law formatter, not a third timezone table.
- assets/reservations.js: resource-week closed days could fall through as open;
  post-midnight starts missed the preceding opening. Validation now checks actual
  minutes against current/preceding civil periods, including DST, and obtains the
  explicit merchant zone. Unconfigured legacy stores keep the server default
  even when DayReport falls back to the viewer’s device zone. Cached formatting
  keeps validation bounded.
  Nonexistent typed datetimes are refused. Its service-price/deposit normalizer
  matches the server centime rule; a 0-cent service advertised a 1-cent deposit.
- functions/api/booking.js hotelCategories: 1.01 MAD × one night became 1 MAD.
  Total is now integer night cents; expectedTotal accepts matching centime quotes.
  The authenticated hotel writer already priced in cents, so its policy is kept.
- functions/api/hotel/stays.js: Paris 15:00 was stored at Casablanca 15:00, two
  hours later in October. Create/read/folio boundaries now use merchantZone and
  the shared clock. Missing DST time zero is explicitly refused before writing.
  Pruning's existing warm-cache calendar convention is unchanged; D1 remains
  authoritative and its beyond-window regression passes.

The red route/property logs are kept in the ignored results directory. An
untouched HEAD VM additionally reproduced Morocco fold slots 8 vs 10, full-day
slots 160 vs 288, and February 30 translated into March instead of rejected.
Only booking-truth-test's extraction plumbing changed to load venueZone and the
formatter cache. None of its time expectations were weakened or changed.

## Owner questions and intentionally absent contracts

- BK-1, [1]: service.capacity=1 with two resources accepts two simultaneous
  bookings. Templates/editor set this field to 1 even for many restaurant tables;
  seats come from resource.capacity and maxParty. Should service.capacity be a
  global booking limit, a per-resource limit, or obsolete? Enforcing it globally
  without a decision would reduce a restaurant to one reservation at a time.
- BK-2, [1]: the manage link still reads its own booking one day after it ends.
  Tokens are random stored capabilities, not expiring signed tokens. Cancellation
  closes at the published deadline; reading history remains possible. What token
  expiry/revocation policy should apply? Forged tokens already fail closed.
- BK-3, [1]: a configured 1-cent deposit is advertised but booking creates no
  payment. There is no public charge/refund implementation or payment provider
  in this flow. The suite proves it never invents a debit/refund, not that a
  nonexistent deposit ledger is correct. Which collection, retention and refund
  contract should be implemented? No money is silently collected or refunded.

Public manage offers consultation/cancellation, not customer self-rescheduling.
Staff rescheduling is exercised through the real authenticated store path; no
new public reschedule protocol was invented. Booking horizon remains rolling
elapsed days for arrival, not a limit on checkout; hotel stays remain <=365 nights.
Other general hotel-dashboard display clocks were not refactored here. Server
booking boundaries, public display and the Reservations editor are covered;
full hotel/browser rendering still requires the owner's browser gate.

## Verification

26 strict properties at 3,000 cases on seeds 20261102, 20261103 and 20261104:
234,000 strict cases, no reduced DB counts (24-property run plus the two focused
DST-input properties, repeated after the legacy unset-zone witness). The hotel quote was also stressed with the public client’s
expectedTotal, and timestamp bounds with Infinity/Number.MAX_VALUE, on all seeds.
All eight requested existing suites pass, plus zone-law.
Size ratchet, PWA shell and sealed stamps pass. check.js --fast only has the
usual eight EPERM suites, independently reproduced on untouched HEAD 82e61e53
in an ignored archive inside this worktree. No second git worktree is touched.
The missing Xcode simulator warning is pre-existing.

Browser suites not run here: hotel-direct-booking-browser-test.mjs,
hotel-stays-group-browser-test.mjs and merchant-health-browser-test.mjs.
The eight EPERM suites are operations-system, audit-remediation-devices,
economat-real-d1-transfer, kiwi-agent-access, invoicing-v2-real-server-browser,
retail-tender-browser, retail-acompte-browser and print-relay (all -test.mjs).
