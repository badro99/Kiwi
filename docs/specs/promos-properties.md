# Promotion properties

`tools/promos-properties-test.mjs` (fast tier, wired in `tools/check.js`).

`assets/promos.js` decides which boutique promotion prices an item. A rule
has a scope (whole store, sections, chosen items, stock entered before a date,
end of line), dates, optional weekdays and hours on the 05:00 business day in
Casablanca time, and a pause switch. Two promotions never stack: the lowest
price wins, the oldest on a tie. `merge()` reconciles the rules between
devices.

The suite drives the real module (with the zone law from
`assets/kit/haptics.js`) against an independent model. Moments are drawn after
20 September 2026, when Morocco moved to permanent UTC+0, so the model's wall
clock is plain UTC.

## Properties (all strict)

1. The till charges exactly the best single promotion running now for that item: never two stacked, never above the shelf, never below zero.
2. `status()` says « active » exactly when the rule would price something now.
3. A window past midnight still belongs to the business day it started on (the day turns at 05:00).
4. Normalising a rule twice changes nothing, and a percentage never passes 100.
5. Merging rules between two devices is order-free and idempotent.
6. After both devices merge, the latest gesture on each rule wins: an edit, a deletion, or a rule saved again after a deletion.

No defect found. Three deliberate breaks turned it red: the last promotion
winning instead of the lowest, the business day turning at midnight, and the
merge always keeping the local copy.
