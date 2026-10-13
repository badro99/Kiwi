# Design direction · round 19 critique of revision 18

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 10 | I recomputed every pair in §5.3 and all of them match. §18.10's geometry and gaps sum correctly. No off-brand drift. |
| UI | 8 | The handover has no state for a code from the wrong person. Several acts still have no needs-connection state. |
| UX | 6 | Approve-then-refuse is still there, offline for four acts and online for the handover. An automatic retry can finish an approved act with nobody watching. Retrying a pairing redeem burns a single-use code. |
| Motion | 10 | The spring settles at 308, 308 and 300 ms, then 333 and 367 ms (ζ 0.9996). The lens timing is unchanged. |
| Feel and haptics | 9 | §15.3 contradicts itself on whether the close's Paid falls under the 600 ms rule. |
| Copy and language | 8 | `pin.till.sub` asks the wrong people for the handover code. `clock.code.sub` says the code changes every 5 minutes, which contradicts §10.34. |
| Accessibility | 10 | The `aria-disabled` rule, Try again never `disabled`, and the region politeness all hold for every new state I walked. |
| Honesty and consistency | 6 | The icon check overclaims for the third round running. The needs-connection set is called "exact" and is not. The claim about the table cancelled locally is false. The authorization log does not log what the spec says. |
| Performance | 10 | Font files hash-match the packages and sizes match §6.1. Every corpus character resolves through the declared ranges. Budgets are unchanged. |
| Feasibility and migration safety | 8 | The retry rule and the needs-connection row contradict each other. The spec's own `till-approval-level-test` would fail against its own table. The caller census grep misses aliased callers. |

## 2. Verdict

**FAIL.** Seven dimensions are below 10.

## 3. Rebuttal rulings

- **Rebuttal 1 (largest remainder): ACCEPT.** `shareWeighted` at `kiwi-caisse.html@31c94529:13493-13506` is the shipped allocator. The split already uses it for tips at `:13611`.
- **Rebuttal 2 (no Cancel in the roster step): ACCEPT.** Every check is bounded at 8 s and ends with a stated cause. The step has nowhere for a Cancel to go.
- **Rebuttal 3 (no clock-in time kept; the team app cannot fetch a code): ACCEPT, both parts.**
  - The server stamps `inTs: now` at acceptance and only records the code's `createdTs` (`employee.js@31c94529:505-509`).
  - `team/live.js:151` calls `entitledMerchant(…, {allowTill:true})` with no `allowEmployee` (`_lib.js:991-1004`). So an employee session cannot generate a code.

## 4. Findings, ranked

**Majors**

**1. UX, Honesty and Feasibility · §10.2 till-approval table, the needs-connection set, §23 decision 2 · approve-then-refuse is still shipped offline for four acts.**
- **Evidence:**
  - **Cancel a live or online order.** Both `act.cancel_order` call sites end in a server POST with no queue:
    - `:10907` (live order) calls `cancelOrderProTakeaway`;
    - `:21160` sits in the same function.
    - That function calls `postCaisseCancellation` (`:21137-21157`), which is a `fetch('/api/order/queue')` with a 12 s abort (`:12274-12290`).
    - Offline, the verifier row approves and then the toast says "Commande X conservée · …".
  - **Reject an online order.** `orderpro-inbox.js:243-262` approves through `KiwiAuthorizeTillAction`, then `setStatus` POSTs. That also fails offline after approval.
  - **Cancel a table with sent tickets but no session.** On a real store, `:10924` always goes to `cancelSentTable`. With no session and local tickets it waits up to 8 s (`:12980-12985`) and then throws "visite en cours de synchronisation · réessayez" (`:12987-12990`).
    - So the row's claim "A table with no server visit is cancelled locally (`:12988-12993`)" is false whenever a ticket was sent offline.
  - The spec's own `till-approval-level-test` asserts "with every act run offline after an offline approval, none refuses afterwards". Built as written, it goes red on all four acts.
- **What a 10 looks like:**
  - The criterion becomes "the act's effect is a server write with no outbox", not "the act needs a proof".
  - The set becomes the shift change, untrack, cancel a live or online order, reject an online order, and cancel a table that has a session **or** any sent ticket (the throw condition at `:12988`).
  - Each of those opens in the needs-connection state.

**2. UX and Copy · §10.2 handover row and §9.6 `pin.till.sub` · the handover approves the wrong person online, then refuses.**
- **Evidence:**
  - `confirmHandover` refuses any name that is not the incoming cashier's (`:18902-18905`, "Le code saisi doit être celui de {inc.name}").
  - The pad sub, filled with `act.shift_change`, reads: "The shift change to {name} needs the personal code of a cashier, a manager or the owner."
  - A manager follows that copy. The server answers 200, `opensTill` passes, and the pad closes. Then the handover refuses through a toast.
  - There is no pad state, no key and no Failed haptic for this case. The "who may approve" column says "Same".
- **What a 10 looks like:**
  - The handover gets its own sub, for example "{name} confirms with their personal code".
  - A 200 whose identity is not the incoming cashier is refused on the pad with its own key (for example `pin.till.not_incoming`), the dots go to danger, the keys stay enabled, and Failed fires within 600 ms.
  - A test covers it.

**3. Consistency, UX and Feasibility · §10.2 "Network error, till approval, an act that needs a connection" against the retry rule · two contradictory rules for one state.**
- **Evidence:**
  - The row says "as the first network row (…Try again, automatic retry under the retry rule)".
  - The retry rule's "What retries by itself" lists only team sign-in, clock-in, pairing, the store lock, the dashboard lock with no row, and the roster step. It also says "never an approval the server must give".
  - Followed as the row says, an automatic retry approves the held code once the connection returns, and "A success after an automatic retry proceeds as any success". The handover, or a table cancellation, then completes with nobody watching and no haptic. The `pin.till.needs_connection` copy "Nothing has changed" becomes false.
- **What a 10 looks like:** no automatic retry for an approval, matching the reasoning behind `pin.manager.offline`. Try again only, with the digits kept, and the row and the rule saying the same thing.

**4. UX and Feasibility · §10.2 retry rule (8 s timeout, then automatic retry) applied to pairing and the store lock · a single-use code is retried blindly.**
- **Evidence:**
  - `pair/redeem.js@31c94529` spends the code atomically (`UPDATE pairings SET used_ts … WHERE used_ts IS NULL … RETURNING`). Any later request gets 422 `invalid_or_expired` plus `noteFail`.
  - Aborting the client at 8 s does not stop the server. If the first request committed but its response was lost, the automatic retry answers 422, the pad writes `pair.invalid` (a cause change), and the till is not paired.
  - On the store lock, the code had to come from the old store's owner.
- **What a 10 looks like:** after a redeem times out, the till does not resend the same code. It checks its pairing state (for example `/api/config` with the cookie), or the server makes a redeem by the same `terminalId` idempotent within a short window. A 422 that follows a timed-out attempt gets its own copy ("this code may already have been used by this till").

**5. Honesty · §18.0 check 13 and the preview's claim · the "not read" list is not exhaustive, and the cover test misses pseudo-elements.**
- **Evidence.** I ran these mutations in the served preview (Chrome 152) through `__kiwiPreview.run` on fresh template clones, all on Home's `[data-fx="home.compare"] .ms`. I confirmed each one visually on screen. Checks 1 and 13 stay **green** for all of them:
  - A: `<use x="60">` (glyph moved out of its box);
  - B: `<use width="0" height="0">` (glyph gone);
  - C: `svg viewBox="0 0 1 1"` (glyph gone);
  - D: `use.style.stroke=currentColor; strokeWidth=2000` (a solid square);
  - E: an ancestor `::after` with `position:absolute; inset:-4px; background:#F7F5F0` (glyph covered, because `elementFromPoint` returns the ancestor, which the rule allows);
  - F: `box-shadow: inset 0 0 0 200px currentColor` on the icon (a square);
  - G: `background-image: linear-gradient(currentColor,currentColor)` on the icon (a square; `backdrop()` reads only `background-color`).
  - Also, `-webkit-text-fill-color: transparent` on the compare text leaves check 1's colour test green, because it reads `color`.
- **Why it fails:** the spec says "Not read: anything inside a shadow root or a canvas, a glyph a font would draw, and anti-aliasing… So neither a label, nor a reference, nor a repaint, nor any of these effects can stand in for a glyph". The preview says "nothing may be on top of its centre".
- **What a 10 looks like:** either sample the icon's painted pixels against its surface (`canvas` from a captured frame, or the capture harness), or list these classes as not read and narrow the cover claim to "no other element's box". Add one mutation per class, each going red.

**Polish**

**6. Feel · §15.3.**
- **Evidence:**
  - The till-approval row says "the act's own class (for example Paid on the local write of a closing), under this same 600 ms rule".
  - The close row says "The 600 ms rule does not apply".
  - The approval comes first (`:16468`), then `closeRegister` waits up to 8 s (`:16384`).
- **What a 10 looks like:** one rule, with the till-approval row's example deferring to the close row.

**7. Copy · §9.6 `clock.code.sub`.**
- **Evidence:** "The code changes every 5 minutes." §10.34 renews it at `expiresTs − 60 s`, so every 4 minutes while a sheet is open. Before stage 4 it changes at every sheet open (`caisse-attendance-code.js:120`).
- **What a 10 looks like:** "The code changes every few minutes", or the till's shown time.

**8. Honesty · §10.2 Staleness row.**
- **Evidence:** the row says the authorization log at `kiwi-caisse.html:17406` "keeps both" fields. That log is written only when `mgrAccess === 'manager'`, and only as `{id, time, action}` with no identity. Till-level approvals and unlocks are never logged. No test asserts the log; only the haptics trace is tested.
- **What a 10 looks like:** state that the log gains till-level entries with identity, `verdict` and `provenAt`, and add an assertion in `offline-verifier-test`.

**9. Feasibility · §10.2 caller census.**
- **Evidence:** `till-approval-level-test` "reads the same grep" for `requireManager(` and the others. `maison-stock-movements.js:427` aliases `var ask = window.requireManager` and calls `ask(` at `:432`, which the grep cannot see. Separately, the grep also hits the comment at `:17284`.
- **What a 10 looks like:** count callers by instrumenting `requireManager` and `requireTillOperator` at runtime in the harness (or with an alias-aware AST), and exclude comments.

## 5. Checked and found correct

- **Critique 17's majors:**
  - M4 is fixed (Staleness row; decision 2 names the lag and a lowered role).
  - M5 is fixed. The 14 `act.*` rows satisfy the lint as written. AR verbal nouns follow يتطلب. FR uses "Autorisation" at both levels. Glossary rows 1028 and 1029 match `count.close`.
  - M6 is fixed.
  - M7 is fixed, given rebuttal 3.
  - M2 and M3 are fixed for the three named acts. Findings 1 to 3 cover what is still missing.
  - M1 is only partly fixed (finding 5).
- **Citations I verified:**
  - `queue.js:846` and `:2010`;
  - `caisse-pairing.js@31c94529:33`, `:70-99` (rows hold id, name, role and `expiresAt`; no proof), `:921-923` and `:941-962`;
  - `confirmHandover` at `:18897-18908`;
  - `team/live.js:169`;
  - every caller in the census; `59392a9c` on `origin/main` (`activeVenue`, `resetPinState`).
- **Contrast:** all of §5.3 matches python to two decimals.
- **Spring:** settle times as stated, ζ 0.9996.
- **Formatter:** `rel`, `date`, `short` and the ar-MA month vectors match through Chrome 152's Intl.
- **Fonts:**
  - The 6 preview woff2 files are byte-identical to the fontsource package files, and their sizes match §6.1.
  - The `@font-face` block matches §6.1.
  - All 140 characters of §9.6 resolve through Inter Tight's two ranges or Kiwi Arabic, and Plex 400 to 700 has every Arabic code point used. No Latin Extended character is needed.
- **Preview:**
  - 17 of 17 checks and 166 of 166 mutations are red as expected, at 1024 × 768 and 375 × 812.
  - `why(n)` gives the stated reason for every row I sampled, including 1, 7, 22, 36, 41, 60, 88, 101, 125, 129, 133, 140, 148 and 155 to 165.
  - The sweep arithmetic holds: 14 × 132 + 70 = 1,918.

**For the lead (not scored, per your stated facts):** the dashboard plaintext replacement **is now on `origin/main`**, in `4dcd0685` and `0268c92f` (13 October, about 17:00). It differs from §10.2's designed column:
- it keeps up to 12 rows per account for any proven role, where the spec keeps one owner row;
- its migration deletes `kiwiPins` without converting it, where the spec hashes the owner entry into a row;
- a "no" from the server erases the row.

So §10.2's dashboard block and `dashboard-pin-migration-test` will need reconciling.

Housekeeping: I started an HTTP server on port 8918 and stopped it. I opened browser tab tab-1 and closed it, and reset its viewport first; I did not touch the existing 8871 tab. I deleted only `scratchpad/critic18/`. I edited, staged and committed nothing in the repo, and printed no codes.
