# Critic review: Kiwi design 2027 direction (round 14, revision 13)

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 6 | Blocker: with §6.1's kit font stack, Arabic text renders in Arial, not Plex, on iOS, macOS and Windows. The preview hides this because it draws its Arabic frames with a different stack. |
| UI | 8 | The lock has an in-between state (paired back to A, roster not loaded) that shows a pairing pad and a body that are both wrong for it. §10.2 is cited for the "no staff codes" case but says nothing about it. |
| UX | 7 | The same in-between state: the screen is undefined, the pad asks for a code that was already used, and the body contradicts itself. |
| Motion | 9 | The lock replaces the whole till in mid-service, but there is no entrance transition and no reduced-motion frame for it. |
| Feel and haptics | 10 | 409 is now in Failed and in the pairing row of §15.3. The one-haptic-per-gesture rule holds. I found nothing. |
| Copy and language | 8 | The in-between body is false. `lock.store.why_body` is false in the unpaired variant. The Arabic `why_body` uses حسابات for both "bills" and "books". §10.22 never selects `chart.summary_same`. |
| Accessibility | 9 | The chart's `aria-label` choice leaves out `chart.summary_same`, so a zero change still reads "down 0 MAD". |
| Honesty and consistency | 6 | The Arial blocker. "When, and only when" contradicts the lock's lifecycle. A false claim about restoring on an unpaired till. Stale stage 1 claims. The preview models a different lock rule. Two drawn facts are unchecked. Mutation 101 goes red for the wrong reason. |
| Performance | 10 | Font and bundle sizes re-measured and correct. Budgets unchanged. I found nothing. |
| Feasibility and migration safety | 6 | No gate catches the Arial blocker. A false claim about the code. The Arabic sample in the census test is ambiguous. |

## 2. Verdict

**FAIL.**

## 3. Rebuttal rulings

- **Rebuttal 1, largest-remainder rounding: ACCEPT.** At 31c94529, `shareWeighted` (`kiwi-caisse.html:13493-13506`) floors each share, sorts by the fractional part with ties to the earlier index, and hands out the leftover cents in that order. The split tip uses it at `:13611`. No share moves by more than one cent.
- Revision 13 has no new rebuttal. I accept the census of 52 again: 18 / 18 / 11 / 1 / 4, with the weights per class re-derived from `git show 31c94529`.

## 4. Findings, ranked

### Blocker

**B1 · §6.1 and §20.2: the kit font stack sets Arabic in Arial (Visual, Honesty, Feasibility).**
- **The rule.** The stack is `"Inter Tight", "Inter Tight Fallback", "Kiwi Arabic", system-ui`. "Inter Tight Fallback" is `src: local("Arial")` with no `unicode-range`. `kit-in-host-test` requires the stack to be exactly this string.
- **Arial has Arabic.** Arial covers 235 Arabic code points on macOS (`/System/Library/Fonts/Supplemental/Arial.ttf`). The iOS 26.5 simulator's `System/Library/Fonts/WebFonts/Arial.ttf` has the same 235, U+0627 included. CSS fallback works per character, so every Arabic glyph stops at the second family and never reaches Kiwi Arabic.
- **Measured in Chromium, in the preview page, at 400 17px:**
  - "مقعدان": Kiwi Arabic alone 51.68; the spec's stack 34.98; the fallback face alone 34.98. So the spec's stack renders Arial.
  - With a Latin `unicode-range` added to the fallback face, the stack gives 51.68, which is Plex.
  - On a longer string the spec's stack gives 169.12 against Plex's 205.54.
- **No gate catches it:**
  - `kit-in-host-test` measures only the digit chips and `19 174` on the Arabic host, and digits come from Inter Tight.
  - `label-fit-test` would measure narrower Arabic widths, which pass, and its reference label is Latin.
  - `font-coverage-test` passes because Arial has the glyphs.
  - `font-face-census-test` passes because the family is declared.
- **Result.** Every kit Arabic string, and درهم, ships in Arial on every iPad, iPhone and desktop. That breaks brief rubric 4 ("IBM Plex Sans Arabic in Arabic") and every Arabic width in §6.6.
- **The preview hides it.** Its Arabic frames use `"Kiwi Arabic","Inter Tight"` and never load the fallback face.
- **A 10:** the fallback face gets a Latin `unicode-range`, or Kiwi Arabic is ordered before it. The kit-in-host check also measures an Arabic-letter sample against Plex.

### Major

**M1 · §10.26 lock exit and lifecycle, and lockAttempt `lock_retry` (UX, UI, Copy, Honesty).**
- **The state.** The redeem has already committed the pairing to A (`pairing-commit.js:92-95`). If A's roster then cannot load, the spec says "the lock stays, with `pin.offline` and the retry".
- **This contradicts two rules:**
  - "It shows when, and only when, a service is open and it belongs to another store than the one the till is paired with." After the redeem, that store is the paired one.
  - The lifecycle table's Set row has the same condition.
- **What the screen would show:**
  - `lock.store.body` would read "This till is now paired with {A}, but the open service belongs to {A}".
  - The 6-digit pad invites a code that is already used, so any entry gets a 422.
  - `pin.offline` says "No connection" even when the cause is a 5xx from `/api/config`.
- **A 10:** this state is named in the lifecycle (paired back, roster unverified). It has its own copy, no pad, and its own focus and announcement rule. The predicate sentence is reworded to cover it.

### Polish

1. **§10.26 entry-fields table, `merchant` row (Honesty, Feasibility).**
   - **The claim.** "An unpaired till restores any blob … so the store lock shows (unpaired variant)."
   - **Why it is false at 31c94529:**
     - `KC_STORE` is keyed per store (`kcStoreKey`, `:22484-22487`).
     - `migrateLegacyShift` moves any legacy blob that names a store into its own key (`:22794-22807`), so an unpaired till only ever reads a blob with no store.
     - `restoreShift` never sets `shiftMerchant`; it is assigned only at `:15716`, `:15752` and `:22690`.
   - **A 10:** delete the claim. The unpaired variant is reached only by `unpair()` with a service open.
2. **§6.5:614 and the §21.1 stage 1 row (Honesty).** Both still say the 11 Next-chunk pages "move their Arabic" or "set theirs in the self-hosted build". Revision 13's §6.1 limits that to 400 to 600; the weights 200 and 300, which most of `ar/` uses, stay on Google. The census test's in-browser "an Arabic sample is served from `assets/fonts/`" does not say which weight. **A 10:** align both sentences with §6.1 and name the sample as 400 to 600.
3. **Preview check 15 models a different lock rule (Honesty).**
   - The paid cases' `mismatch()` adds "or `liveMerchant` differs", which §10.26 does not have.
   - `lockCases` uses `k.service !== ''`, a condition the spec never states.
   - So two different predicates sit in one check, and neither is the spec's text.
   - **A 10:** one predicate, written in §10.26 and used in both places.
4. **Drawn but unchecked, while §18.0 calls its "not compared" list "the complete list" (Honesty).**
   - Changing #1208's Orders method icon from `credit_card` to `payments`, or #1207's to `credit_card`, stays green.
   - Swapping the top positions of Salade marocaine (not sent) and Harira (sent) on the bill stays green, though check 10 claims "unsent first then sent".
   - **A 10:** check 13 reads the method icon from the log, and check 10 reads each line's group by position, as check 17 does for tables.
5. **Mutation 101 (Honesty).** It goes red because `not_saved_store` "is not a row" (removed in revision 11), not because of the order it claims to test. **A 10:** rewrite it with current rows in revision 10's order.
6. **§10.26 "no staff codes" reference (UI).** "Opens as it does today for such a store (§10.2)", but §10.2 has no row for it. The behaviour lives in `askStaff` (`caisse-pairing.js:643-647`). **A 10:** add a row to §10.2.
7. **Copy, `lock.store.why_body`:**
   - "While this till is paired with another store" is false in the unpaired variant, and there is no `why_body_unpaired`.
   - The Arabic uses حساباته for "bills" and الحسابات الخطأ for "the wrong books" in the same sentence, so it reads "accounts … wrong accounts".
   - **A 10:** an unpaired variant, and a distinct Arabic word for "books".
8. **§10.22:1894 (Copy, Accessibility).** The chart's `aria-label` chooses among `chart.summary_down`, `_up` and `_none`, leaving out the `chart.summary_same` that P9 added. A zero change therefore still reads "down 0 MAD". **A 10:** list `_same`.
9. **Motion, §10.26 lock entrance.** It is a full-screen takeover "when the paid moment ends, or at once on Back", with no recipe in §14.4 and no reduced-motion row. **A 10:** name it, for example a `--k-dur-2` crossfade, then focus to the heading.
10. **Rebuttals paragraph (Honesty).** It starts a sentence in lower case ("the round 5 rebuttal …"), and "Revisions 8, 9, 10 and 12 have no new rebuttal: every round 12 item is fixed" is incoherent. **A 10:** rewrite it.

## 5. Checked and found correct

- **Contrast.** Every pair in §5.3 recomputed in Python; all match to two decimals (9.61, 4.13, 3.03, 3.42, 1.98, 1.67 and the rest).
- **Gesture spring.** Re-simulated with k 1400 and c 74.8 at 1/120 s: 308, 308, 300 / 333 / 367 ms, damping ratio 0.99956.
- **Census at 31c94529.** 18 pages with a Google link, with `wght` lists matching the table (four request 700). `article.css` requests 300 to 600; the Next chunk requests 200 to 600. `ar/index.html` uses `font-extralight` 83 times and `font-light` 3 times; `kiwi-cuisine.html` uses weight 700 12 times; `_headers:34-35` serves the chunk as immutable. The weight mapping follows CSS Fonts 4. In Chromium, two faces with overlapping ranges fetch only the later one.
- **Citations at 31c94529.**
  - `kiwi-caisse.html`: `:14014`, `:15749`/`:15752`, `:16189`, `:16305`, `:22690`, `:22693`, `:22699-22710`, `:22792`, `:22827`, `:23055`, `:23159`; `persistShift` calls at `:14697`, `:14733`, `:14737`, `:14744`; `:14560`, `:14692`, `:11390`, `:11401`, `:16074`, `:16194`, `:16383`, `:22863-22864`.
  - `live-link.js`: `:224`, `:250`, `:764`, `:767`, `:793`, `:799`, `:806`, `:837`, `:843`, `:910`, `:1753-1754`.
  - Elsewhere: `tenant-purge.js:34` and `:45`, `pairing-commit.js:73-86`, `pair/create.js:6-15` and `:90`, `_lib.js:377-381` and the PIN state lines, `redeem.js:106/153/158`, `/api/pair/recover` exists.
  - The outbox is scoped per store (`flushLegacyQueue` `:537`), so a re-paired till does not flush or count the other store's queue.
  - Password reset: `reset.js@a3de3011:132-145` and `reset.html@a3de3011:327` say what the spec says. Both commits are on `origin/main`; the local checkout is 6 commits behind.
- **Sizes.** Fonts: 44,872, 42,848, 45,296 and 45,688 B. String basis: 34,611 and 46,794 B gzip.
- **§6.6 widths.** Spot-checked 11 labels in the preview's fonts; all match within the tabular-figure difference.
- **Fit and coordinates.** The floor math (1.1245, the x and y positions) and the payment pane coordinates (1018, 578, 514) are correct. Type steps counted from the computed styles of every after frame agree with the captions.
- **Preview.** 17 of 17 checks pass and 117 of 117 mutations are caught. For all 117 I re-ran each mutation and read why the target check went red; every one except 101 fails for the reason it targets.
- **My own mutations, all caught:**
  - Home: both delta arrows reversed, the delta colours by polarity, the legend label, "See all 138", "of 9 customers", the Home order's method word.
  - Orders: the cashier.
  - Bill: the open-since time, the primary's count, the line note.
  - Customers: last visit, lifetime spend, status.
- **Earlier findings.** B1's idle-till fix and its four `lockCases` hold. The removal of the parked service left no stale references outside the history sections.

Housekeeping: the server on port 8793 is stopped, the browser tab is closed, and the scratch subfolder `critic13` is deleted. No repo file was edited, staged or committed.
