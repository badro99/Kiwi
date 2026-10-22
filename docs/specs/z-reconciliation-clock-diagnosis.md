# Boutique Z: the 22 October 2026 clock witness

## Exact cause

Local Node v24.18.0 reports ICU 78.3, **tzdata 2026b**. Its Casablanca clock
calls `2026-10-22T04:45:00Z` **05:45**. The browser harness already records that
Chrome 155 knows the later Casablanca rules (sync-ledger-browser-test.mjs,
comment above casaTime): its clock calls that instant **04:45**. The installed
Chrome is 155.0.8059.86; its packaged icudtl.dat contains the TZVersion key and
the 2026c version string. This metadata inspection does not claim a browser run.

[IANA's 2026c announcement](https://lists.iana.org/hyperkitty/list/tz%40iana.org/thread/NVHSX2PAQIT44U5FCCEVNJJYXQMMTJSA/)
records Morocco's move to UTC+0 on 20 September 2026. The phrase “05:45
Casablanca” describes the older Node table, not the newer browser table.

At the witness, both engines use cutoff **5** and the same IANA zone string:

| Engine | Current business day | Bounds for requested Oct 21 |
| --- | --- | --- |
| Browser with newer rules | Oct 21 | Oct 21 05:00Z to Oct 22 05:00Z |
| Local server with 2026b rules | Oct 22 | Oct 21 04:00Z to Oct 22 04:00Z |

All six receipts at 04:45Z are inside the till's Oct 21, outside the server's
Oct 21: reported 6 / 108500 cents, server 0 / 0, missing 6, mismatched 0.
At 03:50Z (05:50 Paris), both still name Oct 21 and include the receipts.
At 04:40..04:51Z (06:40..06:51 Paris), the dates disagree. At 05:00Z they agree
again. This explains the wall-clock-dependent failure on an unchanged commit.

## Traced product path

- Boutique bqZQueue calls KiwiDayReport.businessDay(Date.now()), then dayBounds;
  bqZJournal filters the same business day and excludes avoir/delivery tender
  from received cents. The shift-open date is not used here.
- day-report merchantTimezone on a paired till uses its device's IANA zone;
  businessDay/civilParts use that runtime's Intl data. Default cutoff is 5.
- kit/ledger uses the same Intl-based civil-day rule and agrees with the till.
- merchant-config reportTillZone / POST /api/timezone publish/store the zone
  name and cutoff. They cannot update the other runtime's timezone database.
- New store NULL timezone resolves to Africa/Casablanca through merchantZone;
  publishing that same name changes no offset rule. merchantCutoff remains 5.
- z-reconciliation POST uses the report's explicit cutoff, merchantZone and
  businessBoundary for its authoritative timestamp query. Legacy omission of
  cutoff also means 5. No hidden 6 was found.
- sale.js preserves a valid supplied epoch. It does not reinterpret it in
  Node's local zone; the witness checks each stored timestamp explicitly.

## Fix and retained evidence

Only the browser harness changes: boutique preparePage uses the suite's
existing setClock helper with one shared **UTC noon** target for this run.
That applies to both owner/dashboard and till pages, survives navigation,
advances at real speed, and is independent of Node's host timezone. Noon is
inside the same day under both rule sets, and within sale.js's +24 h allowance.
Restaurant pages retain their existing explicit boundary clocks untouched.
No production cutoff, timezone, sale timestamp or Z comparison was changed.

`tools/sync-ledger-boutique-clock-test.mjs`, wired into check.js fast tier,
executes the real preparePage/setClock, DayReport, boutique journal/queue,
kit ledger and Z outbox in VM, and actual timezone/sale/Z handlers on the SQLite
money fixture. Intl edges explicitly model the two data versions, so updating
Node will not erase the regression. It verifies:

- exact raw 04:45Z mismatch and cutoff/zone publication from a NULL config;
- six received receipts / 108500 cents, including split and avoir-funded parts;
- server timestamps unchanged and shift opened 30 hours earlier irrelevant;
- prepared pages match before, during and after the conflicting hour;
- a closing Z matches; same-data engines match without a clock pin;
- restaurant clocks remain unpinned and raw timezone skew remains visible.

189 checks pass. The same test against untouched HEAD prints the raw witness,
then fails “prepared boutique trading hour reconciles at 04:45Z”. Evidence logs
are under ignored `.kiwi/results/z-timezone/`. No browser run is claimed.

## Production scope

This proves a **local mixed-tzdata harness failure**, not an unconditional bug
for real stores closing at 05:00..06:00. Any actual till/Workers pair with
conflicting timezone databases could have the same grouping problem around
04:00..05:00Z; the two sides may label that hour differently. Production Workers
and merchant tablet rule versions were not queried, so their agreement is not
asserted. The clock pin stabilizes service scenarios; it does not repair a
mixed-runtime production timezone database. Keep the raw witness visible.
