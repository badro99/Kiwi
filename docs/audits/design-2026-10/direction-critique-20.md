# Design direction · round 21 critique of revision 20

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 10 | Tokens, contrast, type and fonts hold up on every value I measured. No findings. |
| UI | 9 | One polish finding: the shift-change picker can hand the pad to a waiter, and no row covers that. |
| UX | 7 | Three majors in §10.2. The offline pause locks the keys even when the server could answer. The cashier-only account gets "wrong code" forever. "No codes yet" only shows after a throwaway guess. |
| Motion | 10 | Spring and lens timings recompute exactly. No findings. |
| Feel and haptics | 10 | Haptic map is consistent with §15. No findings. |
| Copy and language | 8 | `act.discount` cannot express a fixed-amount discount, and the till ships one. The "No codes yet" analogy is inaccurate. |
| Accessibility | 10 | Contrast pairs, aria-disabled keys, focus and the RTL rows check out. No findings. |
| Honesty and consistency | 6 | Check 13 still false-passes three hiding techniques, one of which disproves a stated guarantee. The dashboard lock is "adopted as shipped" but leaves out shipped behaviour (Face ID, the owner-code state). §10.26 doesn't match the store lock already on main. |
| Performance | 10 | No findings. |
| Feasibility and migration safety | 7 | §10.26 was written against a store lock that 762bb255 had already shipped differently. The dashboard rows would regress shipped behaviour if built as written. |

## 2. Verdict

**FAIL.** Seven of ten dimensions are below 10.

## 3. Rebuttal rulings

1. **Rounding by largest remainder: ACCEPT.** `shareWeighted` at `kiwi-caisse.html@31c94529:13490-13506` does what the rebuttal says. It floors each share, then hands out the leftover centimes by descending fraction, ties to the lower index (`b.frac - a.frac || a.i - b.i`). The by-item tips at `:13611` use it. A second rounding rule for discounts would be the inconsistency.
2. **No Cancel in the roster step's checking state: ACCEPT.** R6 is the lock's only exit. The 8 s timeout bounds the wait. Try again is reserved and empty before the first failure, then live and busy while its request runs. A Cancel that leaves the same screen would misreport what it did.
3. **No kept clock-in time, no code fetch from the team app: ACCEPT.** `functions/api/employee.js@31c94529` stamps `inTs: now` when it accepts the clock-in, after checking `expiresTs`, and the comment says the code proves the employee "is physically present at this store". `functions/api/team/live.js:151` uses `entitledMerchant(..., {allowTill: true})`, and the generation follows at `:159`. A team-app session cannot create a code, so the copy is right to send the person to the till.
4. **No pairing-state check after a timed-out redeem: ACCEPT.**
   - `config.js:184-190` gives the roster without a session only to a caller proven to be that merchant.
   - `pair/state.js:27-28` returns `merchant-required` without a merchant.
   - `redeem.js:177-190` sets both cookies on the same response that was lost.

   So no client check can see the lost redeem. One minor edge remains: an abort after headers arrive but before the body is read would have set the cookies. That doesn't change the ruling, because the server-side idempotent redeem keyed on `terminalId` (`redeem.js:91`) is the right fix, and §10.2 names it.

## 4. Findings, ranked

**1. Major · Honesty · preview check 13 (icon paint and hit test), spec text near line 3284.**
- **Finding.** The check says it proves every icon is painted and not covered. Three hiding techniques make the arrow invisible while checks 1 and 13 stay green. One of them disproves the stated guarantee. The other two are not in the "Not read" list.
- **Evidence.** I mutated the home arrow icon in the running preview at 1024×768, light and dark, plus home-se.
  - **A.** `position:relative; z-index:-1` on the icon, inside `.cmp{background:var(--bg)}`. The icon goes behind its card's background. Green. `pseudoOver` skips negative z-index, and `coveredErr` hit-tests a point where `elementFromPoint` still returns the icon's subtree.
  - **B.** The icon's own positioned `::before` (left 0, width 7.7px) and `::after` (left 8.3px, width 7.7px), each 16px high, painted `var(--bg)`. Green. Two half-covers each stay under the coverage threshold that `drawnErr` and `pseudoOver` apply per pseudo-element, yet together they hide the whole glyph.
  - **C.** `will-change:transform` (or `contain:layout`) on the icon, plus `::after{position:absolute;left:0;top:0;width:16px;height:16px;background:var(--bg)}`. Green. `pseudoOver` finds the containing block by walking up while `position` is static and `transform` is none. `will-change:transform` and `contain:layout/paint` also create a containing block, so the box is computed against the wrong ancestor and lands off the icon.
  - **Control.** The same `::after` with plain `position:relative` on the icon goes red, with "the icon's ::after is painted over it". So the check catches the textbook case only.
  - The claims paragraph (preview line 182) and the "What this proves" text read as a general guarantee.
- **Why it fails.** C is a case the stated property claims to cover. A and B are ordinary CSS that a migration could easily introduce, and neither is listed as unread.
- **What a 10 looks like.** Compute the containing block from every property that creates one: transform, will-change of transform or perspective, `contain:layout/paint/strict/content`, filter, backdrop-filter and perspective. Read the stacking chain's z-index, including negative values under painted ancestors. Sum pseudo-element coverage per icon, or sample the icon's pixels with an offscreen canvas. Any technique left unhandled gets named in "Not read", and A, B and C become red mutation rows.

**2. Major · Feasibility and honesty · §10.26 store lock (R1, R5, R9, copy rows) and §21/§22.**
- **Finding.** The section designs a lock that does not match the one already on main. The spec doesn't say which one wins.
- **Evidence.** `origin/main` 762bb255 `assets/till-tenant.js`, committed at 18:08, before the spec's 18:11 mtime, ships:
  - `mismatch()`;
  - a quarantine at `kiwiQuarantine:shift:<slug>` with a 12 h `MAX_AGE`;
  - a network net that blocks `/api/*` except `/api/pair/*`;
  - a lock screen with one "Pair back to {a}" button, calling `KiwiCaissePairing.repairWithCode({venue, prompt, foot})`;
  - copy saying a reload opens the new store's till without this service, which is set aside for 12 hours.

  `live-link.js` `tenantHold` returns `{ok:false, reason:'tenant-mismatch'}`.

  The spec describes a pad step and a roster step with `rosterPending`, and its R1, R5 and R9 rules and copy rows don't describe the shipped single-button flow, the reload escape or the 12 h quarantine. §21 and §22 don't record the store lock as shipped, or say which differences are intended changes.
- **Why it fails.** The lead said tenant mechanics are engineering's. But the design must be consistent with shipped code, or name each deviation the way §10.2 does with its Deleted row. As written, a builder can't tell whether the spec is meant to replace 762bb255 or describe it.
- **What a 10 looks like.** §10.26 starts from 762bb255. It lists each difference between that code and the spec's design, with the reason for each. The shipped copy is mapped to string keys, or its replacement is marked as a change. §21 and §22 record what 762bb255 shipped.

**3. Major · UX and honesty · §10.2 dashboard lock, the response-state table.**
- **Finding.** A shipped state is missing. An account whose only codes belong to staff (cashiers or waiters) gets no owner-code explanation, just "wrong code" on every attempt.
- **Evidence.** In `dashboard.html@a8158aad`:
  - `askServer` (5928-5961) maps a staff-tier match to `'no'`.
  - `hasDashboardCode` and `maybeShowNoOwnerHelp` (6076-6098) exist for exactly this case. They show "No owner code is set up for this account. Connect with Kiwi to set up your access code."
  - `verifyAccountPin` (`functions/auth/_lib.js@a8158aad:1385-1467`) returns `configured:false` only when the account has no code of any role. So spec row 1850, "No codes yet", never fires for this account.

  The spec says it "adopts it as shipped, with one change, marked in the Deleted row". This state is neither kept nor in the Deleted row.
- **Why it fails.** An owner who set up staff codes but no owner code is locked out of their own dashboard with misleading feedback. The spec also misstates its own baseline.
- **What a 10 looks like.** A row for "No owner code", triggered the way the shipped code triggers it. Its copy goes in FR, EN and AR, and its action leads to setting up the owner code. Alternatively, the Deleted row lists it with a reason.

**4. Major · UX and consistency · §10.2 row 1872, offline pause.**
- **Finding.** "Keys disabled until the 5 minutes end" after five offline misses also blocks people while the server is reachable. That contradicts the section's own rule, "asked first, every time", and the shipped behaviour.
- **Evidence.**
  - `assets/dashboard-pin-vault.js@a8158aad` checks `lockedFor` only inside `verify` (:170), which is reached only from `localVerify` (5968-5978).
  - `paintCells` (6388-6421) calls `localVerify` and shows `offlineWait` only when `askServer` returned `null`.
  - With the server reachable, the pause never applies and the keys stay live.
- **Why it fails.** An owner who failed five times on a plane lands, gets signal, and can't type for up to five minutes even though the server would answer at once. A local anti-guessing limit is being applied to a server check that has its own rate limit (`429` maps to busy).
- **What a 10 looks like.** The keys stay enabled. Every entry asks the server first. The pause line shows only when the server can't answer and the vault is paused, and it states the remaining time.

**5. Major · Honesty and UX · §10.2, the Face ID key.**
- **Finding.** The pad designs a Face ID key, but the spec never says what a Face ID unlock checks. Shipped, it checks nothing on the server and never expires. That falsifies "asked first, every time" and lets a revoked or changed code keep working.
- **Evidence.**
  - `app/src/native-runtime.js` on origin/main, unchanged since before a8158aad, stores `{account, access, name, at}` in secure storage after a code unlock (:1612-1650), reads it in `readFaceUnlock` (:1501), and calls `__kiwiLock.unlockAs(faceRecord)` from `tryFace` (:1571-1580).
  - `dashboard.html@a8158aad:6305` `unlockAs` finishes the unlock with no server call. Neither file has any expiry or revocation check.
  - Vault `forget` on `'no'` (5984-5991) clears the code rows but not the Face ID record.
- **Why it fails.** The spec claims a server-first lock and draws a key that bypasses the server. An owner who changes the code to lock out a former manager's phone hasn't locked it out.
- **What a 10 looks like.** §10.2 states the Face ID outcome. When the server can be reached, it confirms the record's access before the unlock completes. A server `'no'` or a code change drops the record. Offline, the record follows the vault's TTL (7 days). Or the spec names this as a known shipped deviation tracked like the 401 row, so it doesn't read as solved.

**6. Major · Copy · string table, `act.discount` ("A {pct} discount").**
- **Finding.** The approval prompt can only state a percentage. The till ships fixed-amount discounts too.
- **Evidence.** `kiwi-caisse.html@31c94529` has a remise `kind` of `'pct'|'amount'` at 18049 and 18110, with the amount path at 18169-18171. A manager approving a fixed 20 MAD discount would see an empty or wrong `{pct}`.
- **Why it fails.** The manager approves something other than what is shown, which is the one moment the copy has to be exact.
- **What a 10 looks like.** Two keys, `act.discount.pct` and `act.discount.amount`, with the amount formatted through KiwiFormat money parts. Both in FR, EN and AR, with a fixture vector for each.

**7. Polish · UI and copy · §10.2 row 1845 (not-till) and the shift-change row.**
- **Finding.** The incoming person at a shift change can be a waiter, and no row says what the pad shows then.
- **Evidence.** The handover roster `CASHIER_ROSTER` is rebuilt from every role in `KiwiConfig.pins` (`kiwi-caisse.html@31c94529:15408-15428`), and the picker lists them all (18799-18810). Row 1845 excludes the shift change ("the next row takes precedence there"). The shift-change row has no outcome for a non-till role.
- **What a 10 looks like.** Either the picker lists only till roles, stated as a design rule, or the shift-change row has a non-till outcome with its own copy.

**8. Polish · UX and copy · §10.2 row 1850, "No codes yet".**
- **Finding.** The state can only appear after the owner types four arbitrary digits, because `configured:false` comes back only on the bad-code path (`pin/verify.js@a8158aad:39`). The row says it "opens to the account's setup, as the till's No staff codes state does". Unlike the till's state, this one doesn't show until after a first attempt, so the analogy is inaccurate.
- **What a 10 looks like.** Either the pad learns `configured` when it opens and shows the setup path straight away, or the row says honestly that it appears after the first attempt and drops the analogy.

## 5. Checked and found correct

- **Critique 19's four majors.**
  - M1: the probe is dropped and R1 is now self-consistent.
  - M2: the needs-connection state is classified by request path, which matches `KIWI_REQUEST_TIMEOUT_MS` (8 s) and the callers.
  - M3: improved to 178/179 red, with `why(n)` giving a cause for each. Mutations A, B and C above are new.
  - M4: the dashboard rows now come from a8158aad and are mostly accurate, apart from findings 3, 4, 5 and 8.

  Polish items P5 to P8 are addressed.
- **Preview harness.** Served over HTTP from the repo root. At 1024×768, 17/17 fixture checks and 179/179 mutations pass. `__kiwiPreview` exposes `checks`, `mutations`, `run`, `model` and `why`. `why(n)` returned a specific cause for every red mutation I sampled.
- **Contrast.** Recomputed in Python for 52+ token pairs. Every value matches the spec.
- **Springs and lenses.** Gesture spring (k 1400, c 74.8) and lens timings recompute to 308, 308, 300, 333 and 367 ms, matching the spec.
- **Formatting vectors.** KiwiFormat parts output matches an independent `Intl` computation for FR, EN and AR.
- **Fonts.** The preview's font files are byte-identical to the fontsource files in `app/node_modules`. The `@font-face` lines 11-17 match §6.1 and fontsource's unicode ranges. Glyphs render from those files, confirmed at zoom.
- **String table.** All 481 rows scanned: no U+2014 em dash, and no stray U+202F, U+200E/U+200F or U+2026. 471 rows carry Arabic.
- **Caller list.** The PIN-pad caller list matches every caller in `kiwi-caisse.html@31c94529`: 10907, 10924, 10943, 10951, 13026, 13071, 16468, 16995, 17026, 18166, 18382, 18543, 19024, 21160 and 21352. The routes into `caisse-pairing.js`, `orderpro-inbox.js` and `openAuthorization` / `confirmHandover` are classified correctly.
- **Shipped till verifier.** Rows 1 to 12 and the 7-day TTL in `caisse-pairing.js` (30-99) match the spec. So do the dashboard vault's 7 days, 12 rows and 5 misses leading to a 5-minute pause, as code facts. Finding 4 is about where the pause applies, not its numbers.
- **Rebuttal citations.** All four re-checked at 31c94529 (see section 3).

Housekeeping:
- I started a Python HTTP server on port 8942 and stopped it. The port is free.
- I opened browser tab tab-3, reset its viewport and closed it. The "seed" tab on 8871 and the other session's node server were not touched.
- Only my scratch subfolder `critic20/` was deleted. Nothing else in the scratchpad was touched.
- No repo file was edited, staged or committed, and the index is clean. No code or credential was printed.
