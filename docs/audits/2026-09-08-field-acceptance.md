# Restaurant field acceptance

Scope: the user's 17 reported restaurant issues, including the tablet screenshot
showing six pending operations and HTTP 403. All new reproduction data is synthetic.
No affected merchant records, pending operations, or browser storage were deleted.

## Reproduced causes

- Item split implicitly spread unassigned dishes across diners. Both caisse and
  waiter app must require complete whole-unit allocation; equal splitting remains
  an explicit alternative. Cashier discounted totals and tips retain centime allocation.
- Transferring a phone order could leave an empty `orders` cache shadowing the
  surviving priced `tableOrders` rows. This produces a zero payable total without
  actually removing the original order lines.
- Filtering previous-visit rows in `attachOrderProTable` replaced the array, but
  appended current-visit rows to the detached old array.
- An accepted takeaway could be pruned locally while its lookup entry remained,
  leaving subsequent ready/payment actions with no visible card.
- Uncertain OrderPro submissions lost their retry identity after page navigation.
  Rebuilding and submitting the same basket could duplicate an already-created order.
- Late responses must not update a replacement visit. Acknowledgement cleanup
  retires the captured reference even during a storage-read failure, without
  erasing a newer attempt. Network uncertainty is described honestly in FR/EN/AR.
- Elapsed time counted timer callbacks, not wall-clock time during device suspension.

## Acceptance matrix

| Field issue | Evidence / closure boundary |
| --- | --- |
| 1 OrderPro submission | Actual guest handler, authenticated queue, cashier import, multi-phone and retry tests; affected restaurant retest remains distinct |
| 2 Empty-table moves | Existing open visits move with zero orders; a missing visit still fails safely instead of inventing one |
| 3 Timer | Include suspension, return, additional order and next-visit reset |
| 4 Disappearing takeaway cards | Reproduce ageing, ready update, reload and notification checkout |
| 5 Transfer becomes zero/stuck | Verify original line prices survive and current visit remains attached; no invented repair for missing financial data |
| 6 Close mistaken/abandoned table | Existing PIN-authorized close/cancel rules remain in force; kitchen-sent work needs the audited cancellation path |
| 7 Reports disagree | Separate operating-day release owns drawer/session aggregation; test identical dates, filters and ledger scope |
| 8 Table becomes takeaway | Canonical mode should repair stale local routing; original field trigger is not established merely by seeding a wrong local type |
| 9 Notification payment | Checkout must open the corresponding live order, not report success with an empty editor |
| 10 Discount editing/removal | User reports working; retain existing discount/payment regression coverage |
| 11 Return/reorder | Preserve current visit and uncertain-send identity; acknowledged subsequent orders must remain new orders |
| 12 Red synchronize | Screenshot proves HTTP 403 and six queued operations, not the exact rejected endpoint or six missing receipts |
| 13 Item split/drawer/receipts | Whole units on both staff surfaces; one receipt per payment part, drawer only for cash; hardware actuation needs physical verification |
| 14 Handover/closing | Separate operating-day release; compare the same drawer and business-day boundary, not whole-day sales to the last drawer count |
| 15 MixMax employee day | Synthetic employee/order/payment tests are not a real MixMax acceptance test |
| 16 Formula/dish names | Published canonical names and optional empty formula choices tested through submission and caisse import |
| 17 Automatic sync | Separate QA demo verified normal offline sale reconnect; an authorization refusal cannot be cured by automatic retry alone |

## Tests

- `tools/field-whole-item-split-test.mjs`: shipped allocation and launch functions,
  incomplete/fractional/overassigned/unknown items, reassignment, cashier discounts,
  tips, explicit equal split and waiter parity.
- `tools/field-split-ui-test.mjs`: actual caisse modal/CSS/click handler at desktop,
  tablet and phone sizes. Uses `KIWI_PLAYWRIGHT_PATH` and `KIWI_CHROME_PATH`.
- `tools/field-orderpro-acceptance-test.mjs`: production browser functions plus real
  route handlers against in-memory SQLite.
- `tools/field-table-transfer-test.mjs`: table, card and payment regression paths.

## Cannot be declared closed from local tests

The screenshot's restaurant/device identity and stuck table/order number are still
required for affected-device verification. Read the exact rejected route/error,
reconcile queued receipt IDs with the ledger, and use normal authorized recovery.
Never clear the six operations, weaken authorization, repay or resubmit an existing
sale merely to turn the indicator green. Likewise, physical cash drawer/printing
and MixMax acceptance require the actual devices and an agreed test visit.

Publication, deployment and merchant verification are separate release facts.

## Integration

This patch layers onto operating-day release `9e1027c1`, preserving its split
payment identity, pairing/queued-operation safeguards, reporting and drawer
reconciliation changes. The dirty canonical checkout is not used as release input.
No database migration or merchant-data correction is part of this field patch.

## Verified focused results

- Combined `node tools/check.js` completed with exit 0: all checks passed, one
  existing styling warning. Includes all operating-day suites and 209 native
  interaction checks. Local final log: `/tmp/kiwi-field-final-gate.log`.
- 23 OrderPro submission, visit, retry identity and timer scenarios passed.
- 17 transfer, bill recovery, takeaway routing, notification checkout and saved
  split-resume scenarios passed. The latter retains the previously paid part and
  opens only the remaining 20 MAD in the synthetic 40 MAD example.
- 11 whole-item split production-function checks passed on caisse/waiter flows.
- Actual split modal clicks passed at 1440×900, 834×1112 and 390×844, with incomplete
  assignment disabled and no fractional dish allocation.
- Cache references were advanced with the repository tool: OrderPro inbox v17,
  service-worker generation v550; 694 asset-stamp checks passed.

The final gate also retains delivery retries and cashier echo deduplication:
those tests now run the real attachment/recovery functions instead of assuming
that a whole order ID means every one of its lines was attached successfully.
