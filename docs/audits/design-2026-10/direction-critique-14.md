# Critic review: Kiwi design 2027 direction (round 15, revision 14)

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 9 | Strong and consistent, but the Arabic Home key figure separates number and unit with an 8px gap where EN uses U+00A0. |
| UI | 8 | The store-lock roster step has no defined in-flight screen, and "Try again" goes disabled against §10.1. |
| UX | 8 | The lock lifecycle has a state with no screen and an offline-copy branch that can never be reached. |
| Motion | 9 | The lock entrance (dur-3 glide, scale 1.02 to 1) is specified in §14.4 but missing from the §14.1 Uses list. |
| Feel and haptics | 10 | No findings. |
| Copy and language | 8 | One string makes a false claim about personal codes. Also French punctuation spacing, and an Arabic term that breaks the glossary. |
| Accessibility | 8 | No bidi isolation rule for interpolated names, focus loss on the disabled retry button, and no type step for the lock body. |
| Honesty and consistency | 6 | A false security claim in copy, a coverage test that passes the case it exists to catch, a misquoted shell stack, and preview units that are never checked. |
| Performance | 9 | The fallback metrics use local("Arial"), which Android lacks, so most guests never get the CLS protection. |
| Feasibility and migration safety | 8 | Roster loading has no timeout and no class for unparseable responses, and the font test as written cannot fail on symbols. |

## 2. Verdict

**FAIL.** Nine of ten dimensions are below 10.

## 3. Rebuttal rulings

- **Rebuttal 1 (largest-remainder split): ACCEPT.** `shareWeighted` at kiwi-caisse.html:13490-13506 (at 31c94529) floors each share, sorts by fractional part, and gives ties to the earlier index. Tips use it at :13611. §10's worked split examples match this order. I re-ran the examples and they agree.

## 4. Findings, ranked

### Major

**M1 · major · §10.26 store lock, roster step · in-flight state undefined**
- **Finding:** The predicate says `rosterPending` is "set when the lock's pad pairs the till back". The lifecycle table's Set row, and the preview's `lockAttempt`, set it only after the roster fails (`rosterPending: t.roster === 'no-connection' || t.roster === 'server-error'`). So between pair-back and the first roster answer, either:
  - the step shows with no cause line (the spec says the cause line is "chosen by what failed, never guessed", and nothing has failed yet), or
  - the step is skipped and the lock opens before the roster exists.
- **Further gaps:**
  - No timeout bounds `pinsFor` (assets/caisse-pairing.js:621-660).
  - A 200 response with an HTML body (captive portal) makes `r.json()` throw SyntaxError. That is neither `pin-config-unavailable` nor `pin-config-invalid`, so no cause line maps to it.
- **Evidence:** The §10.26 predicate block, the Set row of the lifecycle table, preview check 15 (`lockStep` / `lockAttempt`), and caisse-pairing.js:621-660 at 31c94529.
- **What a 10 looks like:**
  - One definition of when `rosterPending` is set, used by the predicate, the table and the preview alike.
  - A named loading state for the roster step (`state.checking` as the body, no cause line, cancel available).
  - A stated timeout (for example 8 s) that resolves to `no_connection`.
  - Unparseable or non-JSON responses explicitly mapped to `server_error`.
  - A preview mutation that goes red when the in-flight state renders a cause line.

**M2 · major · §9.6 `lock.roster.server_error` (EN/FR/AR), around line 1194 · false claim about personal codes**
- **Finding:** All three languages tell staff that Kiwi sends personal codes to the till. It does not. The roster carries names and roles only, and codes are checked on the server.
- **Evidence:**
  - functions/api/config.js:11 says "THE ROSTER CARRIES NO CODES", and the query is `SELECT name, role`.
  - CLAUDE.md §6 says codes are compared server-side only, by `verifyStaffPin`.
  - The spec's own §10.2 "No staff codes" row contradicts the string.
- **What a 10 looks like:** The copy says only what fails: the till could not load the staff list from Kiwi. No mechanism is described, and nothing implies codes travel to the device. Add a §9.6 lint row that bans "code" in roster strings.

**M3 · major · §6.3 font-coverage-test resolution (lines 609-617) · the test passes the case it exists to catch**
- **Finding:** The rule counts a local() face as covering its whole declared unicode-range. It fails only when an Arabic letter is not set in Kiwi Arabic, a Latin letter or digit is not set in Inter Tight, or the file lacks the character. Two holes follow:
  - **U+202F:** It is inside the Inter Tight Fallback range (U+2000-206F). Neither the Inter Tight file nor macOS Arial has it, so in reality it falls through to system-ui while the test reports it covered.
  - **Non-letter symbols:** Any symbol inside a local() face's range passes by construction.
- **Evidence:** I measured in macOS WebKit at 17px with the kit stack. "19\u202f174" is 53.34px and "19\u00a0174" is 55.05px, so U+202F is not set in Inter Tight metrics. The test as specified would report it green.
- **What a 10 looks like:**
  - A local() face counts as covering a character only if the test verifies the glyph exists on each target platform's real font (macOS, iOS, Windows Arial; Android has none).
  - The check applies to every character the corpus can emit, not only letters and digits.
  - U+202F is either added to the shipped subset or banned by KiwiFormat with a lint.

### Polish

| # | Section | Finding | Evidence | What a 10 looks like |
|---|---|---|---|---|
| P1 | §10.26 R1 | R1's premise excludes the roster step, then carves an exception for it. The requirement contradicts itself. | R1 row vs the roster step definition. | R1 states its scope once, with the roster step explicitly in or out. |
| P2 | §10.26 R9 | R9 does not hold in the roster step after autosave. | R9 text vs the lifecycle when the roster fails after the service autosaved. | R9 is qualified, or the roster step is listed as a named exception with its guarantee. |
| P3 | §10.26 roster step | The offline-copy branch can never be reached. Offline pins for the previous store are deleted at switch and at unpair, and the predicate would not clear on an offline copy anyway. | caisse-pairing.js:221 and :376 delete the previous store's offline pin key. | Either remove the branch, or specify where the offline copy comes from and how the predicate clears on it. |
| P4 | §10.26 vs §10.1 | "Try again" is disabled and shows `state.checking`. §10.1's Loading pattern keeps controls live, and disabling the focused button drops keyboard and VoiceOver focus. | §10.26 roster step text, §10.1 Loading. | The button stays focusable, gets `aria-busy`, ignores repeat taps, and focus stays on it. |
| P5 | §10.26 / §6 | The type step for the lock body and cause line is unspecified, so it defaults to Footnote ink-2. That is small for an error a cashier must read at arm's length. | §10.26 lock screen block, no step named. | Name the step (for example Body ink) and its AR line height. |
| P6 | §10.26 / §9.6 | No bidi isolation rule for names interpolated into lock strings. A Latin store or staff name inside an Arabic sentence can reorder adjacent punctuation and numbers. | Lock strings with placeholders, no FSI/PDI or `<bdi>` rule. | Every interpolation in §9.6 is wrapped in `<bdi>`, or FSI/PDI, and a check enforces it. |
| P7 | §9.6 FR | French strings use a plain U+0020 before ? : ; ! and ». | French cells in §9.6. | U+202F before ? ; ! and », U+00A0 before :, enforced by lint. Ties into M3: U+202F must then be in the shipped subset. |
| P8 | §9.6 `pay.not_recorded` AR (line 1171) | Uses الفاتورة while the glossary term for the bill is الحساب. الحساب also translates "Account" elsewhere, a homonym the glossary does not resolve. | Line 1171 vs the glossary. | One term for bill, a different one for account, both in the glossary, and lint against drift. |
| P9 | Preview templates t-home / t-home-ar, basket tile | The Home key-figure unit and the basket-tile unit are never checked. Changing MAD to EUR, changing درهم to دولار, or removing U+00A0 all stay green. The AR key figure is `<bdi>19 174</bdi>` plus a separate span with gap:8px, where EN uses &nbsp;. | My own mutations on the served preview: all three stayed green. Units on latest orders, orders, till, customers and AI were caught. | Add a check over every money figure's unit and separator, plus mutations for each. AR uses the same U+00A0 construction as EN. |
| P10 | §6.1 fallback face | Android has no Arial, so local("Arial") resolves to nothing there and the metric overrides never apply for most guests. | Android ships Roboto, not Arial. | Add a second local() source (Roboto) with its own overrides, or state that Android CLS is accepted and why. |
| P11 | §6.1 per-character audit table, app shell row | Says native-shell.css uses `"Inter Tight", sans-serif`. The real stack is longer. | app/src/native-shell.css:13 has `--sans: "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif`. | Quote the real stack and audit each family in it. |
| P12 | §14.1 Uses | The lock entrance (dur-3 glide, scale 1.02 to 1, §14.4) is not listed under dur-3's Uses. | §14.1 vs §14.4. | Every token use appears in §14.1. |
| P13 | Preview fonts, lines 9-18 | The preview's Inter Tight face has no unicode-range, but the spec gives it one. Without the range, the preview cannot show the per-character fallback the spec relies on. | Preview `@font-face` vs §6.1. | The preview uses the spec's exact face declarations. |
| P14 | §9.6 corpus count (weak) | The spec says 442 Arabic strings. I count 443 rows with Arabic cells (out of 450 key rows; 511 when split on " / "). | My count over §9.6. | State how strings are counted, and generate the number from the table. |

## 5. Checked and found correct

- **B1 width measurements reproduce exactly** in macOS WebKit (17px, kit stack):

  | Measurement | Width (px) |
  |---|---|
  | مقعدان, kit stack | 51.69 |
  | مقعدان, R13 control | 34.98 |
  | AR "send to kitchen" | 136.45 (110.63 in the old measure) |
  | EN reference | 136.09 |
  | حصّل 230,00 درهم | 146.3 |

  In every case the kit stack is identical to Kiwi Arabic set directly.
- **Font coverage:**
  - Arial has 235 of 524 Arabic code points.
  - Plex Sans Arabic has 676 + 5.
  - Inter Tight's only character in the Arabic blocks is U+FEFF.
  - The fontsource ranges (index.css:58/:68) and legacy stacks are quoted correctly.
  - No character in any frame reaches the fallback.
  - The R13 negative control behaves as stated.
  - The Plex 700 file (44,280 B) exists.
- **§6.6 spot widths match:** options.add 191.1/236.2, exact chips 251.1/257.5, compare 304.5/310.2, capsule AR 262.2 and FR 315.9, Commandes 75.0, À emporter 68.3 at 600, guests AR 310.6. The AR lock title (337.9) wraps cleanly.
- **Layout and colour:**
  - Contrast spot checks match, including unrounded compositing.
  - Keypad widths are 120/96/82.7/88 and the KPI is 107.3.
  - KDS heights and overflow are correct.
  - Floor scale 1.1245 and the pane-open table are correct.
- **Code claims verified against 31c94529:**
  - The split examples match the code.
  - P1 code citations are accurate.
  - `pinsFor`/`askStaff` behave as described.
  - The pairing commit order is right: assets/pairing-commit.js purges first, then sets the new merchant.
  - kcStoreKey, currentMerchantSlug, shiftMerchant and migrateLegacyShift are at the cited lines.
  - The icons are vendored.
- **Preview:** 17/17 checks green and 124/124 mutations red. `why()` gives the right reason for 101 and for 111 to 124. My own mutations were caught: city, contactable, known, sold out, basket, status-bar clock, units on latest orders, orders, till, customers and AI, card share space, and returning label.

**Housekeeping:** The HTTP server on port 8814 is stopped. I closed tab-21, the only tab I opened. I deleted only the critic14 scratch subfolder. Nothing in the repo was edited, staged or committed.
