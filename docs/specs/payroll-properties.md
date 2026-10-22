# Payroll, time clock and scheduling properties

Run `node tools/payroll-properties-test.mjs`. fast-check is loaded from
`app/node_modules`; an absent dependency produces an explicit green skip.
Default: 300 cases, seed 20261029. Override `KIWI_PROPERTY_RUNS` and
`KIWI_PROPERTY_SEED`. strict() accepts replay examples; knownIssue() records
shrunk policy/unsupported-input witnesses and demands promotion if they hold.

## Map and contracts

| Production path | Calculation / storage |
| --- | --- |
| assets/team.js normShift / shiftMinutes / shiftHours | Planned wall-clock HH:MM duration, overnight allowed, equal endpoints zero. No dated timezone/DST model. |
| team.js hourlyPayFor / contractWeekHours | Hourly-only: all hours. Salary plus rate: only period hours above contractHours × period days / 7. Fallback contract = 44 h/week. No legal overtime premium calculation. |
| team.js periodMonthShare / payrollFigures | Monthly salary prorated by calendar dates, capped at one month; sum employee hours and per-employee variable pay. |
| team.js getHours / payrollFor | Team document hours; same data used in Team, Paie & planning, planning costs and Charges. |
| assets/charges-engine.js staffFor | Base plus variable pay, plus configurable employer social percentage. No statutory deductions. |
| functions/api/employee.js pointedHours | Closed punches minus breaks; attendance-view projection. |
| employee.js clock-in / clock-out / mutateDoc | Attendance and team hours in store_docs; optimistic revision compare-and-swap. Completion also updates employee progress. |
| functions/api/team/live.js pointedHours / removedAt | Manager live projection includes open punches, capped at removal time. |
| assets/employee-planning.js | Published dated schedules and employee requests; not a payroll payout engine. |
| functions/api/store.js | Generic JSON persistence includes attendance/team/payroll documents; no advance-payment transaction model. |

All extracted declarations come from current code through
`tools/js-declarations.cjs`. `payroll-harness.mjs` stubs browser edges only.
Actual employee POST and team/live GET run with real signed cookies and
`server-money-fixture.mjs`: SQLite/schema.sql, real D1 shim, real auth.
The concurrent test holds both attendance UPDATEs after their revision reads,
then releases them. Each case reuses and resets the same database.

## Rounding and corrections

Attendance preserves the existing policy: elapsed milliseconds minus closed
breaks, converted to hours rounded to 0.01 **per punch**, then accumulated.
This is not exact minute storage (PM-1). DST calculations use timestamps,
not subtraction of the displayed local clock. Explicit cases cover Paris
2026-10-25 rollback and Casablanca 2026-02-15 / 2026-03-22 changes, as well as
midnight and 05:00. Planned HH:MM shifts retain nominal wall-clock minutes.

Hourly pay now rounds once per employee/period to the nearest centime,
half-up. Integer centiminutes preserve the existing hundredth-hour input grid;
integer weekly allowance divided by seven avoids fractional-week drift.
Decimal rates retain their precision (including imported sub-cent hourly rates);
a fixed 10.005 MAD/h × 2 h example guards against rounding the rate first.
Team tiles still format many amounts as whole MAD; these properties assert
underlying money, without changing that display policy.
A witness on HEAD: 1,050 minutes × 48,597.13 MAD/hour loses a half-cent under
floating multiplication. Large but reachable by entering that rate and hours.
The stress range is 0..50,000 MAD/hour; this is arithmetic testing, not a claim
about typical rates. All four Team money surfaces share hourlyPayFor.

Employer cost now rounds base and variable components to cents before applying
the configured percentage (basis points), rounds social cost half-up, and adds
the rounded components. This states the rounding boundary explicitly; it can
move a centime versus taxing an unrounded salary proration. No rate changes.
HEAD witness: base 5,137.95 MAD at 10% returned 513.79 rather than 513.80.
Owner path: Charges, employer social rate, salary/variable amount.

Clock-out HEAD witness: one one-minute open punch, two concurrent clock-outs:
one attendance row but 0.04 h credited to team instead of 0.02 h. The lost CAS
attempt retained changedEntry and credited the winner's punch again. Resetting
that result at each CAS attempt fixes payroll/progress double-credit without
changing attendance history. Reachable with two devices/tabs clocking out.
These four regression properties fail on untouched HEAD, including two half-cent
components whose displayed sum previously disagreed with the employer total.

## Strict properties (14)

1. Planned overnight minutes, zero endpoints and off days are nonnegative.
2. Closed timestamp durations survive midnight, 05:00 and named DST changes.
3. Reversed punches and excessive breaks produce zero, never negative hours.
4. Removed employees' open punches stop at removal; closed-only view omits them.
5. Employee/manager closed-ledger projections agree and isolate employees.
6. Hourly period pay equals the integer-minute/centime oracle.
7. Salary covers contractual hours once; only excess is hourly paid.
8. Full-month proration pays one base salary, including leap-year February.
9. Hourly period totals sum daily input minutes before final rounding.
10. Concurrent/repeated clock-ins create one open punch.
11. Concurrent/repeated clock-outs credit one punch once.
12. Real GET projects stored attendance without mutating payroll.
13. Employer social rounding matches the centime oracle.
14. Half-cent prorated components and social cost sum to the displayed total.

All strict properties: 3,000 runs × seeds 20261029, 7331, 424242 = 126,000
cases plus replay examples. SQL cases use the same count, no reduction.
Logs: ignored `.kiwi/results/payroll/`, including untouched-HEAD comparisons.

## Known witnesses and owner decisions

- **PM-1 [1]**: a one-minute punch stores 0.02 h = 1.2 minutes. Repeated
  short punches accumulate quantization error. Employee hours and Paie show
  decimal hours; changing to integer minutes requires an explicit data policy.
- **PM-2 [1] / PM-3 [1]**: duplicate imported ids or overlapping imported
  entries count twice in projections. Normal clock-in permits one open punch
  and retries are covered above; malformed generic attendance writes, old
  clients or repaired/imported data can still produce these records. Owners
  would see inflated Team hours/Paie. We do not rewrite ambiguous history or
  choose which punch/break wins. No assertion of corruption repair safety.
- **PM-4 ["UTC"]**: owner decision requested below, not changed.
- **PM-5 [1]**: contract 7 h/week, 2 h on day one, zero on day two. Two-day
  allowance covers both hours; separate daily calculations charge one excess
  hour. This is the owner's existing period contract policy, not a premium.
- **PM-6 [75]**: the shrunk 0.75 MAD/h witness gives two separately rounded
  one-minute days of 0.01 each versus a period total of 0.03. At 1 MAD/h,
  one-minute days round separately to 0.02 each; the two-day
  period rounds to 0.03. Period-first rounding differs from adding rounded
  daily costs. Financial comparisons should keep this boundary explicit.

### Which day owns the 00:30 punch?

| Surface | Current day rule / consequence |
| --- | --- |
| Employee hours, team/live manager hours | Start's calendar date in merchant zone (businessDate cutoff 0). Entire punch filed on start date, not split at midnight. |
| Clock-out team.hours / Team and Paie stored grid | Same start calendar date from server. Manual planning cells use their selected calendar date. |
| Team period navigation / today's UI selection | Browser-local calendar dates via toISO(new Date()); timezone mismatch is not repaired here. |
| Sales dashboard / day report | Merchant business day at 05:00. A 00:30 sale belongs to the preceding evening. |

Owner question: should attendance and payroll follow the sales service day or
keep calendar-start filing? Current consequence: evening sales and staff cost
may appear on adjacent days, and across a period boundary in different periods.

## Unsupported calculations and rate review

No implemented staff advance issuance/deduction ledger or staff tip pool was
found in these paths. Restaurant shareMoney/shareWeighted split customer
payments, not staff tips. Accordingly there is no honest advance-idempotency
or largest-remainder staff-pool property to execute. No new engine is invented.

No CNSS/AMO/IR employee deduction rates, ceilings or bands are computed.
Charges has a manually configured aggregate employer rate, initially null;
placeholder 21 and copy saying "a little over 21%" are guidance, not an applied
statutory constant. They cannot establish compliance or currency of rates.
The 44 h/week fallback is an existing contract assumption, unchanged; no legal
rate/threshold is certified current here. Before implementing/updating rates,
check official CNSS contribution schedules and AMO ceilings, DGI's applicable
year CGI/IR salary withholding schedules, and the SGG labour code (article 184
and overtime provisions), with the owner's payroll accountant.
