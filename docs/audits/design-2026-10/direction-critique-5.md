# Critic review: Kiwi design 2027 direction (round 6, revision 5)

I've finished the review. The direction fails: no dimension reaches 10. Five blockers stand out. The till cannot route its own actions as the spec describes. The compact segments lose their 44 pt hit area. Most icons in the preview's after frames are invisible. The preview's self-checks still pass when fed bad data. Tips have disappeared from the payment flow.

I stopped both HTTP servers (ports 8851 and 8852), reset the viewport and closed the preview tab. I didn't edit, stage or commit any repo file. My throwaway measurement page and font copies are in `/private/tmp/claude-501/-Users-zaka-Developer-kiwi/b1047fb9-db06-41c7-87ad-42ff893fbacd/scratchpad/c5/`.

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 7 | Most icons in the preview's after frames don't render, and neither bundled font has the slashed-zero feature or the narrow no-break space. |
| UI | 6 | `contain: paint` cuts the hit area of compact segments to 36. The French tab bar overflows at text size 1.12. The floor plan breaks when it shrinks. |
| UX | 6 | Tips are gone, a new attendance code silently cancels the old one, reset error states are missing, and a table with no items has no status. |
| Motion | 9 | The spring and lens maths reproduce, but the shared-element example uses a figure that never appears in a tile. |
| Feel and haptics | 7 | The spec never says iPads have no Taptic Engine, yet the iPad hero relies on a "Paid" haptic. Adding an item through the options sheet has no haptic. |
| Copy and language | 7 | "Charge" is both the button term and a retired name. Arabic lacks dual plural forms. Two labels break the verb-first rule. French reuses "Annuler" and "Partager". |
| Accessibility | 6 | Compact segments measure 36 pt, labels overflow at larger text sizes, and with the icons missing the preview shows status by colour alone. |
| Honesty and consistency | 6 | Some fixture checks compare a value with itself, the customer segments overlap and leave gaps, and the spec claims a single commit while its citations come from older ones. |
| Performance | 9 | Characters the bundled fonts lack fall back to a system font, inside measurements that only have about 1 px of margin. |
| Feasibility and migration safety | 6 | The `Kiwi.handlers` route doesn't exist on the till, `NATIVE_RUNTIME` can't be imported, and the line-number tables are stale. |

## 2. Verdict

**FAIL.** A 10 needs zero findings, and every dimension has at least one.

## 3. Rebuttal rulings

- **Round-1 Major 11 (self-serve password reset): ACCEPT.** `functions/auth/forgot.js` and `functions/auth/reset.js` exist and the reset links are wired, so self-serve reset has shipped. One caveat: the §18.8 R6 states still leave out reset's rate-limit responses (Major M9 below).

## 4. Findings, ranked

### Blockers

**B1 · §20.4 · Kit actions can't reach the till's handlers.**
- **Finding:** §20.4 sends `kiwi:action` through `assets/interactive.js` to `Kiwi.handlers`.
- **Evidence:** only `dashboard.html:5495` loads `interactive.js`. `kiwi-caisse.html`, `kiwi-serveur.html` and `kiwi-cuisine.html` don't load it. The caisse has its own `[data-action]` if/else delegator (around line 19046, `name === 'discount'`). So the spec's claim that `Kiwi.handlers` holds `discount` (caisse :6378) and `pay` (serveur :8570) is false, and `k.bill.pay` and similar actions would go nowhere.
- **A 10:** names the real dispatcher on each surface, with file and line, and shows how kit events reach it. Or it plans loading `interactive.js` on the till as a staged migration.

**B2 · §10.6 against §14.4/§4.1 · `contain: layout paint` clips the hit extension.**
- **Finding:** the segment's `::before` hit extension is drawn outside the track, and paint containment clips it.
- **Evidence:** I tested this in Chromium. A 36 px track with `contain: layout paint` responds only within 36 px. The same markup without containment responds across 44 px. Compact segments therefore fail the spec's own 44 pt rule (Principle 4).
- **A 10:** uses `contain: layout` (or `style`) without `paint`, or puts the hit area on the track itself, and records a 44 px hit test.

**B3 · Preview · Sprite icons are invisible in every after frame.**
- **Finding:** each icon is an inner `<svg viewBox="0 -960 960 960">` that `<use>`s a symbol which has the same viewBox, and it renders off-canvas.
- **Evidence:** in a standalone test the icon disappeared with the outer viewBox and rendered without it. Icons missing include expand_more, auto_awesome, notifications (the badge floats alone), battery, the up/down arrows on deltas (so direction is shown by colour only), tune, print, more_horiz, send, call_split, percent, search, dialpad, skillet, close and chevron_right. The floor status icons are also missing on tables and in the legend (table_restaurant, edit_note, restaurant, receipt_long, check_circle). Only 7 icons appear, and those come from a font fallback that needs a Google Fonts network link.
- **A 10:** symbols drop their own viewBox, or the `<use>` drops the outer one, and a fixture check fails whenever an icon renders with a zero-size box.

**B4 · §18.0 and the preview's 11 self-run checks · The checks pass on bad data.**
- **Finding:** I fed altered data into the page (iframe `srcdoc`) and several bad values still passed 11/11.
- **Evidence:**

  | Mutation | Result |
  |---|---|
  | T2 total = 999 | still 11/11 (paid table is never compared with order #1208) |
  | Hind status → New | still 11/11 (segmentation not checked) |
  | Order #1206 amount = 999 | still 11/11 (Home and Orders render from the same row, so check 2 compares a value with itself) |
  | T9 total = 999 | still 11/11 (T9 has no line items to sum) |
  | Order #1207 time = 17:50, after "now" (17:39) | still 11/11 |
  | #1206 on T15; ticket 44 Harira×2; day orders 999; Leila visits 1; Salma last visit yesterday; close cashIn 999; ticket 40 on T99 | correctly fail |

  The checks that compare values with themselves:
  - **Check 2:** all of it.
  - **Check 3:** elapsed time is recomputed with the same formula.
  - **Check 7:** the tile prices.
  - **Check 8:** the "All" segment.
  - **Check 9:** all of it.
  - **Check 10:** the not-sent count and the drawn amounts.
- **A 10:** every check derives its expected value from a separate source (line items, the order log, the clock), and the spec includes a mutation table showing that each check goes red.

**B5 · §18 payment pane and split, §22 · Tips are silently removed.**
- **Finding:** the shipped till takes tips, the spec's payment pane and split have none, and §22's deleted list doesn't mention them.
- **Evidence:** "Pourboire" and `payTipAmount` at `kiwi-caisse.html:11026`, tip modals at :6710 and :6746, and split's "Pourboire commun" at :6628.
- **A 10:** designs tip entry in the payment pane and in split (per-person and shared), or lists the removal in §22 with the owner's sign-off.

### Major

**M1 · §6.4 · The French tab bar overflows at text size 1.12, with no fallback.**
- **Evidence:** dashboard FR capsule is 354.78 px in Inter (338.78 in Inter Tight), wider than 335 (iPhone SE) and 353 (393-wide phones). Till FR is 346.2. The ≤1.12 row gives no fallback.
- **A 10:** defines a fallback (icon-only labels, a scrolling bar or shorter strings) and gives a measured table at every text size.

**M2 · §18.11 and §6.6 · The compare control wraps at 1.12, not "1.24 and above".**
- **Evidence:** FR 377.6 and EN 349.8 against 343 available. The 303 px budget assumes 8 px of internal gaps, but the preview uses three 4 px gaps (12 px) plus a leading space.
- **A 10:** the gaps are stated, the budget is recomputed, and the wrap threshold matches what was measured.

**M3 · §6.6 floor anatomy · The table tile breaks when the floor shrinks to fit.**
- **Evidence:** on iPad 13 in landscape with the pane open, the floor scales to 0.717. A table becomes 86×68.8, below the "min 72×72" rule. "Paid 17:36" is 68.3 px against a 66 px budget (FR 79.35, AR 74.1). At the minimum scale of 0.6 the tile is 72 wide with a 52 px label budget, and the status icon, waiter badge and table number collide. §6.6 only measured the full-size tile.
- **A 10:** measures at 0.717 and 0.6, and defines what the tile drops (the time, then the badge) as it shrinks.

**M4 · §10.34 · "New code" does revoke the old attendance code.**
- **Evidence:** `functions/api/team/live.js` stores one attendance-code document per merchant, and generating a code overwrites it. `functions/api/employee.js:485-497` accepts only the current code. So the spec's rationale is false, and opening or auto-renewing the code on one till invalidates the code shown on the others. That race isn't designed for.
- **A 10:** states the real behaviour and designs the multi-till case, either with one shared code shown everywhere or with per-till codes.

**M5 · §21.3 · "Imported, not copied" can't be built.**
- **Evidence:** `NATIVE_RUNTIME` at `build-app-www.mjs:48` is a non-exported `const`, and `tools/stamps.js` is synchronous CommonJS.
- **A 10:** moves the list into a shared JSON (or CJS) module that both files read.

**M6 · §20.3 and the other citation tables · The line numbers come from mixed commits.**
- **Finding:** the spec says it was "read at 31c94529", but the `kiwi-caisse.html` numbers are from f249411e.

  | Spec cites | Now at |
  |---|---|
  | :6378 | stale (see B1) |
  | :7024-7027 (reason chips) | 7058 |
  | :9856 / :9860 (dispatchers) | 9898 / 9902 |
  | :11312-11332 / :11328-11331 (sale-paid `haptic:false`) | 11404 |
  | :14342-14347 (`discountReasonCode`) | 14508 |
  | :17153-17230 | stale |
  | :17879-17888 (`tables[id].discount`) | 18048 |
  | :17994 (configured check) | 18160 |

- **native-runtime.js:** rows from line 794 onward are off by 12 at HEAD: 1091/1098 → 1103/1110, 1107 → 1119, 1923 → 1935, 2188 → 2200, and the 2089 tick → 2097. Yet the new cite 1095-1096 matches HEAD, so one section mixes commits.
- **A 10:** every cite is regenerated at one named commit.

**M7 · §18.0 fixture · The customer segments and several fixture values don't hold together.**
- **Status rules:** "Regular (≥3 visits in 60 days)", "New (first visit in the last 30 days)" and "Inactive (no visit in 60 days)" leave gaps and overlap. Because `visits` is a lifetime count, the Regular rule can't be checked at all.
- **T2 and T9:** they have totals but no line items.
- **The `options.add` example:** 165.00 is the price of Tajine agneau, which has no options.
- **The shared-element example:** "19,174" is never a tile value. It's the Display hero figure.
- **A 10:** the segments form a true partition built on dated visits, every total is the sum of its lines, and the examples use items that exist.

**M8 · §20 haptics and the §18.3 iPad hero · iPads have no Taptic Engine.**
- **Evidence:** `UIFeedbackGenerator` does nothing on iPad, and the spec never says so, yet the iPad hero cites a "Paid haptic".
- **A 10:** states that iPads have no haptics and confirms "Paid" there with sound and a visual signal.

**M9 · §18.8 R6 · Reset is missing its rate-limit states.**
- **Evidence:** `functions/auth/reset.js` returns 429 `too_many_attempts` (:90-91) and 503 `rateLimitUnavailable` (:109).
- **A 10:** R6 has a screen and copy for each.

**M10 · §20.3 against guest copy · Guest pages still promise vibration.**
- **Evidence:** `OrderPro.html:3998` and `kiwi-order.html:3420` both tell guests their phone will vibrate, while §20.3 removes those vibrations.
- **A 10:** the strings are rewritten in §9 and listed in §22.

**M11 · Table status model · Two cases are undefined.**
- **Empty table:** a table opened with no items fits no status, because "Ordering" requires unsent lines. Yet the Commit haptic fires "when the table turns Ordering".
- **Split with a discount:** how the discount is shared across the split isn't defined.
- **A 10:** has an "Open, empty" state and a split-discount rule (pro rata, with rounding to the last guest).

**M12 · §9 Arabic plurals · The dual form is missing.**
- **Evidence:** `floor.seats` (the fixture has 2-seat tables), `orders.summary` and `ai.today_*` have no `two` form.
- **A 10:** every count string carries the full CLDR set: zero, one, two, few, many and other.

**M13 · §9.1 glossary · "Charge" contradicts itself.**
- **Evidence:** it's the button term at line 599 and a retired name at line 629.
- **A 10:** one ruling.

### Polish

- **P1 · Haptics:** `options.add` has no haptic class. The brief says adding an item is an impact-light, and "Adjust" covers only items with no required options.
- **P2 · Copy:** the chart legend reuses `compare.yesterday_at`, whose EN/FR values are lowercase ("yesterday at {time}"), and `text-transform` is banned. The AR value starts with the preposition ب. The preview shows a capitalised "Yesterday at 17:39" that the strings can't produce. **A 10:** a separate `legend.yesterday_at` key.
- **P3 · Copy:** `pay.card.confirm` "Card approved · confirm" breaks the verb-first rule.
- **P4 · Copy:** the `count.same_as_last` chip isn't on the exception list.
- **P5 · Copy (FR):** `bill.split` "Partager" doesn't match `split.title` "Diviser l'addition". `action.undo` "Annuler" collides with "Annuler la vente", "Annuler l'article" and "Annuler la table".
- **P6 · Copy:** the glossary says "Cash count" but `count.title` says "Count the drawer".
- **P7 · UI:** the label type step for the kitchen segmented control isn't defined, and the internal gaps in §10.33 aren't stated.
- **P8 · Type:**
  - Neither `inter-latin.woff2` (48,432 B) nor `inter-tight-latin.woff2` (44,872 B) has the `zero` feature, so any slashed-zero setting does nothing.
  - Neither font has U+202F (narrow no-break space), so French and Arabic number spacing falls back to a system font inside §6.6 measurements that have only about 1.1 px of margin.
  - The spec measured with Inter but never states its file size or cost.

## 5. Checked and found correct

- **Contrast:** every §5.3 value reproduces. The worst chrome pair came out 2.32/2.33 against the spec's 2.33/2.34, which is rounding.
- **Spring (k 1400, c 74.8, semi-implicit Euler):** settles at 308/308/300, 333 and 367 ms, damping ratio 0.9996, no overshoot.
- **Lens:** the bezier peaks at 1.066 and progress at 115/310 ms is 0.995, matching `liquid-lens.js` :74, :154-160 (the 115 ms `setTimeout`) and :215.
- **Measurements:** these §6.6 widths reproduce exactly. The guest chips also fit when 6+ is selected.

  | Item | Width (px) |
  |---|---|
  | Charge | 167.34 / 162.39 |
  | Send 2 to kitchen | 142.3 |
  | Discount | 72.45 / 69.7 |
  | Key figure | 147.57 + 52.02 |
  | Paid 17:36 | 68.3 |
  | T22 | 29.32 |
  | Guest chips | 311.44 |

- **Citations that hold:**
  - **Native and build:** the Swift cites (:145, :334, :936, :803-825, :819). All 14 `navigator.vibrate` sites, as listed. `build-app-www.mjs` :46, :48, :49-56 and :163-168. The 70 "Inter Tight" lines in `native-runtime.css`. `capacitor.settings.gradle` :11-12. The haptics definitions in Swift and Java.
  - **Backend (`functions/`):** `sale.js` :80 and :178-190. `pin/verify.js` :39-64 (it also returns `actorProof`). Every `_lib.js` cite. The `employee.js` cites. `team/live.js` :150-176. `print/bridges.js`. `config.js` :281-282 and :313-317. `_business-day.js` :60-76. The `login.js`, `signup.js` and `forgot.js` cites. `redeem.js` :106, :153 and :158. `queue.js`.
  - **Front-end assets:** `live-link.js` :224, :250 and :750-783. `caisse-pairing.js` :950-953. `discount-policy.js` :58.
  - **`kiwi-caisse.html`:** :11390, :11396, :11401, :14530, :17128, :17157, :17319, :18069, :18160, :18166, :18255 and :22149.
- **Preview:** all 12 "before" images load over HTTP. The 7 fixture mutations listed as correctly failing in B4 do fail. The dark Arabic Home frame lays out right-to-left correctly apart from the missing icons.
