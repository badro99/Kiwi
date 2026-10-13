# Design direction · round 20 critique of revision 19

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 10 | All 52 contrast values I recomputed in §5.3 match to two decimals. Revision 19 changed no frame, and all 17 checks are green at both viewports. |
| UI | 9 | A manager-level state is claimed ("says so before the code is typed") but never defined (finding 6). |
| UX | 7 | The needs-connection set blocks a table cancellation that ships working offline through an outbox. On the dashboard, a refused code opens the lock in a state the spec never names. |
| Motion | 10 | The gesture spring settles at 308, 308 and 300 ms, then 333 and 367 ms (ζ 0.9996). Durations and lens timing are unchanged. |
| Feel and haptics | 10 | The new rows (`not_incoming`, `maybe_used`, `no_answer`, needs-connection) each fire one class or none. The close now defers to its own row (P6). |
| Copy and language | 9 | A waiter's code on the handover pad gets `pin.till.not_till`, which tells them to ask a manager. The manager is then refused. |
| Accessibility | 10 | `aria-disabled` keys, Try again never `disabled`, and the region politeness hold for every new state I walked. |
| Honesty and consistency | 6 | The icon check's "what this proves" sentence is false again. "A 401 or a refusal is final" is false for the shipped dashboard. The no-outbox claim for a session table is false at `:13071`. |
| Performance | 10 | Font files hash-match the packages and the `@font-face` block matches §6.1. All 140 characters of §9.6 resolve to their shipped face. |
| Feasibility and migration safety | 7 | The store lock's new `/api/pair/state` probe is forbidden by R1 and by the engineering box of the same section. |

## 2. Verdict

**FAIL.** Five dimensions are below 10.

## 3. Rebuttal rulings

- **Rebuttal 1 (largest remainder): ACCEPT.** `shareWeighted` is the shipped allocator, and the split already uses it for tips. Unchanged since round 18.
- **Rebuttal 2 (no Cancel in the roster step): ACCEPT.** Every check is bounded at 8 s and ends with a stated cause. A Cancel would have nowhere to go.
- **Rebuttal 3 (no clock-in time kept; the team app cannot fetch a code): ACCEPT.** `employee.js@31c94529` stamps `inTs: now` only after the code passes (`:495`, `:509`). I also checked that a retried clock-in or clock-out is idempotent:
  - a clock-in reuses the open entry;
  - a clock-out with no open entry skips the hours and progress writes.
- **Rebuttal 4 (pairing-state check only on the store lock): ACCEPT.** I verified each premise:
  - `config.js@31c94529:184-190` returns a roster to a till with no session only for the `?merchant=` it names;
  - `pair/state.js:27-28` answers 400 without `merchant`;
  - `redeem.js:177-190` sets both cookies on the same response that was lost.

  So a first pairing cannot check anything client-side. The same cookie argument also means the store lock's check can almost never see a committed redeem: if the response reached the browser, the fetch would have resolved. That leaves the probe with little value, and finding 1 shows what it costs.

## 4. Findings, ranked

**Majors**

**1. Feasibility and Consistency · §10.2 "No answer to a redeem" row, §10.26 R1, R5 and the engineering box · the store lock's probe is forbidden by its own section.**
- **What the spec designs:** after a redeem gets no answer, the store lock sends `GET /api/pair/state?merchant={store}`. This is in the §10.2 row, in R5 ("unless the till is now paired with {store}"), in §15.3, and in `pair-redeem-timeout-test`.
- **What R1 says:** in the pad step, only `/api/pair/redeem` and `/api/pair/recover` may leave the page, and "No other request to a path under `/api/` or `/auth/` is sent". `tenant-gate-test` enforces this on the network.
- **What the engineering box says:** "on the lock's pad, no same-browser fallback and **no pairing-state probe that the lock would refuse** (R5)".
- **Why it is the pad step:** the redeem got no answer, so the till has not paired back, and `rosterPending` is set only at the pair-back.
- **Result if built as written:** either `tenant-gate-test` goes red on the design's own probe, or the gate drops the probe and the "paired, proceeds as 200" branch can never run.
- **What a 10 looks like:** either add `GET /api/pair/state?merchant=<held store>` to R1's pad-step allowlist and delete the box's clause, or drop the probe and always show `pair.no_answer` (rebuttal 4 already shows the probe can almost never succeed).

**2. UX and Honesty · §10.2 till-approval table, cancel-table row (and §23 decision 2a, `till-approval-level-test`) · the set goes beyond its own criterion and blocks an act that ships working offline.**
- **The rule the spec sets:** "Needs a connection" means "a server write with no outbox". The row lists `:13026` and `:13071` and says a table "with one [session] the cancellation is posted with no outbox (`:12995-12996`)".
- **The path that breaks it:** `:13071` is `cancelNewOrder`, the real store's cancel-new-order button.
  - For a table with nothing sent or committed, it resets the table locally.
  - It then calls `releasePhoneTable(…, 'caisse', true, …)`, which dispatches `kiwi-table-released`.
  - `orderpro-inbox.js@31c94529:353-371` (`closeSession`) **enqueues** that close through `KiwiOffline` and flushes it later.
  - The server's `closeSession` branch needs no proof (`queue.js:1930-1934` binds `pinActor?.id || ''`).
- **The case a merchant hits:** a guest's phone seats the table (`timerSession`, `kiwi-caisse.html:21786`) and nothing is ordered. Offline, that table cancels and syncs today. Under the design it opens in the needs-connection state.
- **Two consequences:**
  - The cited `:12995-12996` is `cancelSentTable`, which this caller never reaches.
  - `till-approval-level-test` would lock the regression in.
- **What a 10 looks like:** classify by the code path, not the act key: `cancelSentTable` with a session or a ticket needs a connection; `cancelOpenTable` and `cancelNewOrder` complete offline. Correct the row, decision 2(a) and the test's set to match.

**3. Honesty · §18.0 check 13 and the preview's claim ("That is all it proves: no other element's box is on top at those five points, and no positioned pseudo-element that paints holds its centre") · both halves are false, and the not-read list is still not exhaustive.**
- **How I ran it:** template clones through `__kiwiPreview.run(fixture, R, [1,13])`. Each mutation below stayed **green**, and I confirmed on screen at 1024 × 768 that the glyph disappears. To reproduce, build `R` from `#t-<mock>` templates and run checks 1 and 13.
  - **(a) An element inside the icon:** a `<b>` appended to `.ms` with `position:absolute; inset:-2px; background:#F7F5F0`, the icon set to `position:relative`.
    - Applied to Home's compare arrow, the arrow is gone.
    - The hit test explicitly allows "an element inside it", so the sentence "no other element's box is on top" is false.
  - **(b) A positioned painting pseudo-element offset by margin:** `.cmp::after{content:"";position:absolute;left:3000px;width:24px;height:44px;margin-left:-3002px;background:<surface>}`.
    - In the after-dark Home, the arrow is gone.
    - `pseudoOver()` builds the box from `left`/`top` only and ignores margins.
  - **(c) The same offset by `transform:translateX(-3004px)`:** green on the compare arrow and on the KPI arrow (`home.share_delta`). The −13 MAD arrow disappears on screen.
  - **(d) A sibling's outward `outline:14px solid <surface>`:** the arrow and its minus sign are gone. An outline is not hit-testable and is not in the not-read list.
  - **(e) A sibling's `box-shadow:0 0 0 12px <surface>`, positioned with `z-index:3`:** the Orders "↑ +4" arrow is gone. Also not hit-testable and not listed.
- **Two mutations with no effect, reported as no-finding:** a stylesheet rule `#kiwi-sprite symbol{opacity:0}` (no visible change) and `fill-rule:evenodd` on the `<use>`.
- **What a 10 looks like:** either sample painted pixels at the icon's box, or narrow the claim to what is true and name these classes as not read:
  - "no element outside the icon's own subtree is the topmost hit";
  - "a pseudo-element whose `left`/`top` box contains the centre, ignoring margins and transforms";
  - "paint of another element outside its box (outline, outer shadow)".

  Add one red row per class.

**4. Honesty and UX · §10.2 dashboard block ("Read … A 401 or a refusal is final"; 401 `bad-pin` → `pin.wrong`), `dashboard-pin-migration-test` · the shipped lock opens on a server refusal in a state the spec never names.**
- **The shipped code:** in `dashboard.html@0268c92f`, `settle('no')` at `:6397-6400` computes `configured = knownHere || serverRosterSize()`. It refuses only when that is truthy, and otherwise calls `finishUnlock(val, null, false)`.
- **When `configured` is 0:** this browser holds no vault row, `kiwiOnboarded` is not set, and the roster count is 0.
- **Two real cases:**
  - **The never-configured account (by design).** Commit `0268c92f` says it passes "tant qu'aucun code n'existe".
  - **A configured account on a fresh browser whose roster reads failed.** `readPinsFrom` returns `false` on any error (`merchant-config.js@0268c92f:705-713`), yet `ready()` still fires (`:727-730`, `:745-761`). In that case any four digits the server refuses open the dashboard.
- **What the spec says instead:** "This direction adopts it as shipped" while stating the opposite. Neither the response table nor decision 14 mentions the pass-through.
- **What a 10 looks like:**
  - add a dashboard "no codes yet" row, like the till's "No staff codes" row;
  - either gate the pass-through on the server's own signal (`pin/verify.js` already returns `configured: false`, `origin/main:functions/api/pin/verify.js:39`), or hand the fresh-browser case to decision 14;
  - add the case to `dashboard-pin-migration-test`.

**Polish**

**5. Copy · §10.2 response rows "200, role does not open the till" against "200, not the incoming cashier", and `pin.till.not_till`.**
- **The problem:** the shift change is a till approval, so a waiter's code (shipped: `authorizeTill` checks the role first, `caisse-pairing.js@31c94529:944-945`) gets `pin.till.not_till`: "Ask a cashier, a manager or the owner to enter theirs." A manager who follows that is then refused with `pin.till.not_incoming`. The rows state no precedence, and the test's "a waiter's code is refused with `pin.till.not_till`" asserts this copy on the handover too.
- **What a 10 looks like:** on the shift change, `not_incoming` wins over `not_till`, and the test says so.

**6. UI · §10.2 "Network error, an act the server must approve" row.**
- **The problem:** it claims "the pad now says so before the code is typed". No such state is defined at the manager level: no trigger, keys, message region, Close or exit on `online`. Shipped, a stock adjustment offline really is approved and then undone (`maison-stock-movements.js@31c94529:432-437`; `authorizeManager` lets an `inventory` action through from a verifier row, `caisse-pairing.js:950-962`).
- **What a 10 looks like:** reuse the needs-connection state at the manager level with `pin.manager.offline` and name it in `pin-focus-test`, or delete the sentence.

**7. Consistency · §10.2 retry rule against the 503 row.**
- **The problem:** the retry rule says "never a server error (503: Try again only…)". The pad's 503 row has no Try again: "Keys enabled; the entered digits clear".
- **What a 10 looks like:** scope "Try again only" to the roster step, and say that on a pad the retyped code is the retry.

**8. Feasibility · dashboard block "Deleted" row.**
- **The problem:** shipped `askServer` maps every 401 and 403 to `'no'` and `vaultNote` then calls `forget` (`dashboard.html@0268c92f:5946`, `:5988`). So a 401 `unauthorized` (session expired, `_lib.js:1392`) erases the owner's valid offline row. The design draws that answer as `pin.signed_out`, but never says whether the row survives.
- **What a 10 looks like:** state that only `bad-pin` (and a staff-tier 200) erases rows, and add the case to the test.

## 5. What I checked and found correct

- **Critique 18's majors and polish:**
  - M2 (handover sub and the on-pad `not_incoming` refusal) is fixed.
  - M3 (approvals never retry by themselves; the row, the rule and the copy agree) is fixed.
  - M4's no-resend rule, `pair.no_answer` and `pair.maybe_used` are fixed. The probe is finding 1.
  - M1 is fixed for live orders, online rejection, untracking, the handover and `cancelSentTable`. The over-reach is finding 2.
  - M5 rows 167 to 177 each go red for the stated reason, checked with `why(n)`. The claim is finding 3.
  - P6 to P9 are fixed, and the runtime census correctly targets `#manager-modal-title` and `#manager-modal-sub` (`:17328-17337`).
- **Code citations I verified at `31c94529`:**
  - `kiwi-caisse.html` `:10903-10956`, `:12274-12290`, `:12976-12996`, `:13024-13090`, `:16384`, `:16446-16450`, `:17319-17346`, `:17353`, `:17406`, `:18897-18912`, `:19021-19024`, `:21134-21160`, `:21352`;
  - `orderpro-inbox.js:247` and `:279`;
  - `queue.js:823-846` and `:2010`;
  - `pair/redeem.js:104-190`, `pair/state.js`, `config.js:165-215`;
  - the handover's confirm button is gated on matching counts before the pad opens (`:18823-18835`), so no approve-then-refuse comes from the count.
- **Dashboard block against `0268c92f`:** `dashboard-pin-vault.js` in full, `dashboard.html:L5880-5990` and `:6363-6420`, `tenant-purge.js:28` and `:44`, `onboarding.js:680`, and the two vault test files exist. Every line cited holds, apart from findings 4 and 8.
- **Numbers:**
  - Contrast: all §5.3 surface rows and edge pairs recomputed in python.
  - Spring: 308, 308, 300, 333 and 367 ms.
- **Fonts:**
  - The 6 preview woff2 files are byte-identical (SHA-256) to the fontsource package files.
  - The `@font-face` block matches §6.1 descriptor by descriptor.
  - All 140 characters of §9.6 (95 Latin, 45 Arabic at 400 to 600) resolve to Inter Tight or Kiwi Arabic, measured in Chrome 152 with a monospace/serif width comparison.
- **Preview:** 17 of 17 checks green and 177 of 177 mutations red, at 1024 × 768 and 375 × 812, with no failed self-test item.

Housekeeping: I started an HTTP server on port 8931 and stopped it. I opened browser tab tab-2, reset its viewport and closed it; I did not touch the 8871 tab or the other session's node server. I deleted only `scratchpad/critic19/`. I edited, staged and committed nothing in the repo, and printed no codes.
